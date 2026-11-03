import { count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db, type DbOrTx } from "@/db/client";
import { hashPassword } from "@/lib/password";
import { requirePermission, type Actor } from "@/lib/rbac";
import { computeExpiry } from "@/lib/subscription";
import { generateTemporaryPassword } from "@/lib/tokens";
import { SLUG_RE, normalizePkPhone } from "@/lib/validation";
import { DuplicateError } from "./tenant";
import { normalizeEmail, type RequestMeta } from "./auth";

const TRIAL_DAYS = 14;

/** Postgres unique violation (23505). Drizzle wraps driver errors, so inspect the whole cause chain. */
function isUniqueViolation(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && typeof cur === "object" && depth < 5; depth++) {
    if ((cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

const registerInput = z.object({
  name: z.string().trim().min(2).max(150),
  slug: z.string().trim().toLowerCase().regex(SLUG_RE, "Use 3-40 lowercase letters, digits or hyphens"),
  type: z.enum(["SCHOOL", "COLLEGE", "ACADEMY", "TUITION_CENTER", "VOCATIONAL", "TRAINING", "OTHER"]).default("SCHOOL"),
  email: z.string().email().transform(normalizeEmail),
  phone: z.string().optional().transform((v, ctx) => {
    if (!v?.trim()) return undefined;
    const n = normalizePkPhone(v);
    if (!n) ctx.addIssue({ code: "custom", message: "Invalid Pakistani phone number" });
    return n ?? undefined;
  }),
  city: z.string().max(80).optional(),
  province: z.string().max(80).optional(),
  address: z.string().max(300).optional(),
  ownerName: z.string().max(120).optional(),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().email().transform(normalizeEmail),
});
export type RegisterInstitutionInput = z.input<typeof registerInput>;

async function ensureTrialPlan(tx: DbOrTx) {
  await tx.insert(schema.subscriptionPlans).values({
    code: "TRIAL-14", name: "14-day free trial", interval: "TRIAL", durationDays: TRIAL_DAYS, price: "0.00",
    maxStudents: 100, maxUsers: 10, maxCampuses: 1,
  }).onConflictDoNothing({ target: schema.subscriptionPlans.code });
  const [plan] = await tx.select().from(schema.subscriptionPlans).where(eq(schema.subscriptionPlans.code, "TRIAL-14")).limit(1);
  if (!plan) throw new Error("Trial plan missing");
  return plan;
}

/**
 * Atomic onboarding: institution + owner account + trial subscription + audit entry, or nothing at all.
 * The temporary password is returned once for the Super Admin to hand over; only its argon2id hash is stored,
 * and the owner must change it at first login. No email is sent here, so the result says so honestly.
 */
export async function registerInstitution(db: Db, actor: Actor, raw: unknown, meta: RequestMeta = {}, now: Date = new Date()) {
  requirePermission(actor, "institutions:write");
  const input = registerInput.parse(raw);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  try {
    return await db.transaction(async (tx) => {
      const plan = await ensureTrialPlan(tx);

      const [inst] = await tx.insert(schema.institutions).values({
        slug: input.slug, name: input.name, type: input.type, email: input.email, phone: input.phone,
        city: input.city, province: input.province, address: input.address, ownerName: input.ownerName,
      }).returning();
      if (!inst) throw new Error("Failed to create institution");

      const [admin] = await tx.insert(schema.users).values({
        scope: "INSTITUTION", institutionId: inst.id, email: input.adminEmail, name: input.adminName,
        passwordHash, mustChangePassword: true,
      }).returning({ id: schema.users.id, email: schema.users.email });
      if (!admin) throw new Error("Failed to create administrator");
      await tx.insert(schema.userRoles).values({ userId: admin.id, role: "INSTITUTE_OWNER" });

      const expiresAt = computeExpiry(now, "TRIAL", plan.durationDays ?? TRIAL_DAYS);
      await tx.insert(schema.subscriptions).values({
        institutionId: inst.id, planId: plan.id, status: "TRIAL", startsAt: now, expiresAt,
      });

      await tx.insert(schema.auditLogs).values({
        institutionId: inst.id, actorId: actor.userId, action: "institution.register", entityType: "institution",
        entityId: inst.id, ip: meta.ip ?? null, metadata: { slug: inst.slug, adminEmail: admin.email },
      });

      return {
        institution: inst,
        admin,
        temporaryPassword, // shown once; never stored in plaintext or logged
        trialExpiresAt: expiresAt,
        invitation: "NOT_SENT" as const, // email provider is not configured; hand the credentials over securely
      };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DuplicateError("An institution with this slug or email already exists");
    throw e;
  }
}

/** Real, database-backed numbers for the Super Admin dashboard. */
export async function platformStats(db: Db, actor: Actor, now: Date = new Date()) {
  requirePermission(actor, "institutions:read");
  const [byStatus, [studentCount], recent] = await Promise.all([
    db.select({ status: schema.institutions.status, n: count() }).from(schema.institutions).groupBy(schema.institutions.status),
    db.select({ n: count() }).from(schema.students),
    db.select().from(schema.institutions).orderBy(desc(schema.institutions.createdAt)).limit(10),
  ]);
  const subs = await db.select({ status: schema.subscriptions.status, expiresAt: schema.subscriptions.expiresAt })
    .from(schema.subscriptions);
  const soon = now.getTime() + 7 * 86_400_000;
  const get = (s: string) => byStatus.find((r) => r.status === s)?.n ?? 0;
  return {
    totalInstitutions: byStatus.reduce((a, r) => a + r.n, 0),
    activeInstitutions: get("ACTIVE"),
    suspendedInstitutions: get("SUSPENDED"),
    trialSubscriptions: subs.filter((s) => s.status === "TRIAL" && s.expiresAt.getTime() > now.getTime()).length,
    expiredSubscriptions: subs.filter((s) => s.expiresAt.getTime() <= now.getTime()).length,
    expiringWithin7Days: subs.filter((s) => s.expiresAt.getTime() > now.getTime() && s.expiresAt.getTime() <= soon).length,
    totalStudents: studentCount?.n ?? 0,
    recentInstitutions: recent,
  };
}

export async function listInstitutions(db: Db, actor: Actor, opts: { limit?: number; offset?: number } = {}) {
  requirePermission(actor, "institutions:read");
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const rows = await db.select().from(schema.institutions).orderBy(desc(schema.institutions.createdAt)).limit(limit).offset(opts.offset ?? 0);
  const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.institutions);
  return { rows, total };
}
