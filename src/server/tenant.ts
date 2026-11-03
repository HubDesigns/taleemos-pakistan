import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type DbOrTx } from "@/db/client";
import { ForbiddenError, requirePermission, resolveTenant, type Actor } from "@/lib/rbac";
import { assertSubscriptionActive } from "./subscription-guard";

const { students, auditLogs, securityEvents } = schema;

export class DuplicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateError";
  }
}

const studentInput = z.object({
  admissionNumber: z.string().trim().min(1).max(40),
  fullName: z.string().trim().min(1).max(120),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  address: z.string().max(300).optional(),
  previousSchool: z.string().max(150).optional(),
  emergencyContact: z.string().max(60).optional(),
});
export type StudentInput = z.infer<typeof studentInput>;

/**
 * The ONLY door to institute-owned data. The institution is derived from the authenticated actor;
 * a browser-supplied institution id is just a request that gets verified. Every query below filters
 * by the resolved institutionId, so a guessed id from another tenant matches nothing.
 */
export async function openTenant(tx: DbOrTx, actor: Actor, requestedInstitutionId?: string | null, now: Date = new Date()) {
  let institutionId: string;
  try {
    institutionId = resolveTenant(actor, requestedInstitutionId);
  } catch (e) {
    if (e instanceof ForbiddenError && e.message.includes("Cross-tenant")) {
      await tx.insert(securityEvents).values({
        type: "CROSS_TENANT_ATTEMPT", userId: actor.userId, institutionId: actor.institutionId,
        detail: "requested another institution",
      });
    }
    throw e;
  }
  // Platform operators doing support work are not blocked by a lapsed subscription; institute users are.
  if (actor.scope === "INSTITUTION") await assertSubscriptionActive(tx, institutionId, now);

  return {
    institutionId,
    students: {
      async list(opts: { search?: string; limit?: number; offset?: number } = {}) {
        requirePermission(actor, "students:read");
        const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
        const search = opts.search?.trim();
        const where = and(
          eq(students.institutionId, institutionId),
          search ? or(ilike(students.fullName, `%${search.replace(/[%_]/g, "\\$&")}%`), eq(students.admissionNumber, search)) : undefined,
        );
        const rows = await tx.select().from(students).where(where).orderBy(asc(students.fullName)).limit(limit).offset(opts.offset ?? 0);
        const [{ total } = { total: 0 }] = await tx.select({ total: sql<number>`count(*)::int` }).from(students).where(where);
        return { rows, total };
      },

      async get(studentId: string) {
        requirePermission(actor, "students:read");
        const [row] = await tx.select().from(students)
          .where(and(eq(students.id, studentId), eq(students.institutionId, institutionId))).limit(1);
        return row ?? null;
      },

      async create(raw: unknown) {
        requirePermission(actor, "students:write");
        const input = studentInput.parse(raw);
        const dupe = await tx.select({ id: students.id }).from(students)
          .where(and(eq(students.institutionId, institutionId), eq(students.admissionNumber, input.admissionNumber))).limit(1);
        if (dupe.length > 0) throw new DuplicateError(`Admission number ${input.admissionNumber} already exists`);

        const [row] = await tx.insert(students).values({ ...input, institutionId }).returning();
        if (!row) throw new Error("Failed to create student");
        await tx.insert(auditLogs).values({
          institutionId, actorId: actor.userId, action: "student.create", entityType: "student", entityId: row.id,
        });
        return row;
      },
    },
  };
}
