import { and, eq, isNull } from "drizzle-orm";
import { schema, type DbOrTx } from "@/db/client";
import { hashPassword, verifyPassword } from "@/lib/password";
import { generateToken, hashToken } from "@/lib/tokens";
import type { Actor, RoleKey } from "@/lib/rbac";

const { users, userRoles, sessions, institutions, securityEvents } = schema;

export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface RequestMeta { ip?: string | null; userAgent?: string | null }

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; actor: Actor; mustChangePassword: boolean }
  // The HTTP layer must show the same generic message for every failure reason.
  | { ok: false; reason: "INVALID_CREDENTIALS" | "LOCKED" | "DISABLED" | "INSTITUTION_INACTIVE" };

let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(generateToken().slice(0, 24));
  return dummyHash;
}

async function logSecurityEvent(
  tx: DbOrTx, type: (typeof securityEvents.$inferInsert)["type"],
  userId: string | null, institutionId: string | null, meta: RequestMeta, detail?: string,
) {
  await tx.insert(securityEvents).values({ type, userId, institutionId, ip: meta.ip ?? null, userAgent: meta.userAgent ?? null, detail: detail ?? null });
}

export async function loadRoles(tx: DbOrTx, userId: string): Promise<RoleKey[]> {
  const rows = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role as RoleKey);
}

export async function authenticate(
  tx: DbOrTx,
  input: { email: string; password: string; institutionSlug?: string | null },
  meta: RequestMeta = {},
  now: Date = new Date(),
): Promise<LoginResult> {
  const email = normalizeEmail(input.email);

  let institutionId: string | null = null;
  if (input.institutionSlug) {
    const [inst] = await tx.select().from(institutions).where(eq(institutions.slug, input.institutionSlug.trim().toLowerCase())).limit(1);
    if (!inst) {
      await verifyPassword(await getDummyHash(), input.password); // equalise timing
      await logSecurityEvent(tx, "LOGIN_FAILED", null, null, meta, "unknown institution");
      return { ok: false, reason: "INVALID_CREDENTIALS" };
    }
    institutionId = inst.id;
  }

  const [user] = await tx.select().from(users).where(
    and(eq(users.email, email), institutionId ? eq(users.institutionId, institutionId) : isNull(users.institutionId)),
  ).limit(1);

  if (!user) {
    await verifyPassword(await getDummyHash(), input.password);
    await logSecurityEvent(tx, "LOGIN_FAILED", null, institutionId, meta, "unknown account");
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  if (user.status === "DISABLED") {
    await logSecurityEvent(tx, "LOGIN_FAILED", user.id, user.institutionId, meta, "account disabled");
    return { ok: false, reason: "DISABLED" };
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
    await logSecurityEvent(tx, "LOGIN_FAILED", user.id, user.institutionId, meta, "account locked");
    return { ok: false, reason: "LOCKED" };
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await tx.update(users).set({
      failedLoginCount: lock ? 0 : failed,
      lockedUntil: lock ? new Date(now.getTime() + LOCK_DURATION_MS) : user.lockedUntil,
      updatedAt: now,
    }).where(eq(users.id, user.id));
    await logSecurityEvent(tx, "LOGIN_FAILED", user.id, user.institutionId, meta, "bad password");
    if (lock) await logSecurityEvent(tx, "ACCOUNT_LOCKED", user.id, user.institutionId, meta, `after ${MAX_FAILED_LOGINS} failures`);
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  if (user.institutionId) {
    const [inst] = await tx.select({ status: institutions.status }).from(institutions).where(eq(institutions.id, user.institutionId)).limit(1);
    if (!inst || inst.status !== "ACTIVE") {
      await logSecurityEvent(tx, "LOGIN_FAILED", user.id, user.institutionId, meta, "institution not active");
      return { ok: false, reason: "INSTITUTION_INACTIVE" };
    }
  }

  const token = generateToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await tx.insert(sessions).values({ userId: user.id, tokenHash: hashToken(token), expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent ?? null });
  await tx.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now }).where(eq(users.id, user.id));
  await logSecurityEvent(tx, "LOGIN_SUCCESS", user.id, user.institutionId, meta);

  const actor: Actor = { userId: user.id, scope: user.scope, institutionId: user.institutionId, roles: await loadRoles(tx, user.id) };
  return { ok: true, token, expiresAt, actor, mustChangePassword: user.mustChangePassword };
}

/** Resolve a raw cookie token to an Actor, or null. Re-checks account and institution status on every request. */
export async function resolveSession(tx: DbOrTx, token: string | undefined, now: Date = new Date()): Promise<Actor | null> {
  if (!token) return null;
  const [row] = await tx.select({
    sessionId: sessions.id, expiresAt: sessions.expiresAt, revokedAt: sessions.revokedAt,
    userId: users.id, scope: users.scope, institutionId: users.institutionId, status: users.status,
  }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(eq(sessions.tokenHash, hashToken(token))).limit(1);

  if (!row || row.revokedAt || row.expiresAt.getTime() <= now.getTime() || row.status !== "ACTIVE") return null;

  if (row.institutionId) {
    const [inst] = await tx.select({ status: institutions.status }).from(institutions).where(eq(institutions.id, row.institutionId)).limit(1);
    if (!inst || inst.status !== "ACTIVE") return null;
  }
  return { userId: row.userId, scope: row.scope, institutionId: row.institutionId, roles: await loadRoles(tx, row.userId) };
}

export async function revokeSession(tx: DbOrTx, token: string, now: Date = new Date()): Promise<void> {
  await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)));
}

export async function revokeAllSessions(tx: DbOrTx, userId: string, meta: RequestMeta = {}, now: Date = new Date()): Promise<void> {
  await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  await logSecurityEvent(tx, "SESSIONS_REVOKED", userId, null, meta);
}

export class PasswordChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordChangeError";
  }
}

/** Self-service change. Verifies the current password, enforces the policy, and signs out every other session. */
export async function changePassword(
  tx: DbOrTx, userId: string, input: { currentPassword: string; newPassword: string }, keepToken: string | undefined,
  meta: RequestMeta = {}, now: Date = new Date(),
): Promise<void> {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new PasswordChangeError("Current password is incorrect");
  }
  if (input.newPassword.length < 12) throw new PasswordChangeError("New password must be at least 12 characters");
  if (input.newPassword === input.currentPassword) throw new PasswordChangeError("New password must be different");

  const passwordHash = await hashPassword(input.newPassword);
  await tx.update(users).set({ passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, updatedAt: now })
    .where(eq(users.id, userId));

  const keepHash = keepToken ? hashToken(keepToken) : null;
  const active = await tx.select({ id: sessions.id, tokenHash: sessions.tokenHash }).from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  for (const s of active) {
    if (s.tokenHash !== keepHash) await tx.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, s.id));
  }
  await logSecurityEvent(tx, "PASSWORD_RESET_COMPLETED", userId, user.institutionId, meta, "self-service change");
}

export async function mustChangePassword(tx: DbOrTx, userId: string): Promise<boolean> {
  const [u] = await tx.select({ m: users.mustChangePassword }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.m ?? false;
}
