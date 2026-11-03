// Server-side authorization primitives. Deny by default.

export type Permission =
  | "platform:manage"
  | "institutions:read"
  | "institutions:write"
  | "subscriptions:manage"
  | "students:read"
  | "students:write"
  | "attendance:read"
  | "attendance:write"
  | "fees:read"
  | "fees:write"
  | "exams:read"
  | "exams:write"
  | "results:publish"
  | "users:manage"
  | "reports:read";

export type RoleKey =
  | "SUPER_ADMIN"
  | "INSTITUTE_OWNER"
  | "INSTITUTE_ADMIN"
  | "TEACHER"
  | "ACCOUNTANT"
  | "ATTENDANCE_OPERATOR"
  | "PARENT"
  | "STUDENT";

export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  SUPER_ADMIN: ["platform:manage", "institutions:read", "institutions:write", "subscriptions:manage", "reports:read"],
  INSTITUTE_OWNER: [
    "students:read", "students:write", "attendance:read", "attendance:write", "fees:read", "fees:write",
    "exams:read", "exams:write", "results:publish", "users:manage", "reports:read",
  ],
  INSTITUTE_ADMIN: [
    "students:read", "students:write", "attendance:read", "attendance:write", "fees:read",
    "exams:read", "users:manage", "reports:read",
  ],
  TEACHER: ["students:read", "attendance:read", "attendance:write", "exams:read", "exams:write"],
  ACCOUNTANT: ["students:read", "fees:read", "fees:write", "reports:read"],
  ATTENDANCE_OPERATOR: ["students:read", "attendance:read", "attendance:write"],
  PARENT: [],
  STUDENT: [],
};

export interface Actor {
  userId: string;
  scope: "PLATFORM" | "INSTITUTION";
  institutionId: string | null;
  roles: readonly RoleKey[];
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function permissionsOf(actor: Actor): ReadonlySet<Permission> {
  const set = new Set<Permission>();
  for (const role of actor.roles) {
    // A platform operator never inherits institute permissions and vice versa.
    if (role === "SUPER_ADMIN" && actor.scope !== "PLATFORM") continue;
    if (role !== "SUPER_ADMIN" && actor.scope !== "INSTITUTION") continue;
    for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  }
  return set;
}

export function can(actor: Actor, permission: Permission): boolean {
  return permissionsOf(actor).has(permission);
}

export function requirePermission(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError(`Missing permission: ${permission}`);
}

/**
 * Resolve which institution an actor may operate on. The institution ID sent by
 * the browser is only ever a *request*; it is accepted only if it matches the
 * authenticated actor (or the actor is a platform operator with explicit rights).
 */
export function resolveTenant(actor: Actor, requestedInstitutionId?: string | null): string {
  if (actor.scope === "INSTITUTION") {
    if (!actor.institutionId) throw new ForbiddenError("Institution user without institution");
    if (requestedInstitutionId && requestedInstitutionId !== actor.institutionId) {
      throw new ForbiddenError("Cross-tenant access denied");
    }
    return actor.institutionId;
  }
  if (!can(actor, "institutions:read")) throw new ForbiddenError("Platform access denied");
  if (!requestedInstitutionId) throw new ForbiddenError("Institution must be specified");
  return requestedInstitutionId;
}

/** Parent may only see children they are explicitly linked to. */
export function assertParentLinkedToStudent(linkedStudentIds: ReadonlySet<string>, studentId: string): void {
  if (!linkedStudentIds.has(studentId)) throw new ForbiddenError("Student is not linked to this parent");
}
