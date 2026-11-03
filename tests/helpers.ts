import { db, pool, schema } from "@/db/client";
import { hashPassword } from "@/lib/password";
import type { Actor, RoleKey } from "@/lib/rbac";
import { bootstrapSuperAdmin } from "@/server/bootstrap";
import { registerInstitution } from "@/server/institutions";

export const PASSWORD = "Correct-Horse-Battery-9";

export async function resetDb() {
  const { rows } = await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  await pool.query(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

export async function makeSuperAdmin(): Promise<Actor> {
  const u = await bootstrapSuperAdmin(db, { email: "root@taleemos.test", password: PASSWORD });
  return { userId: u.id, scope: "PLATFORM", institutionId: null, roles: ["SUPER_ADMIN"] };
}

export async function makeInstitution(sa: Actor, slug: string) {
  const r = await registerInstitution(db, sa, {
    name: `Institute ${slug}`, slug, email: `office@${slug}.test`, adminName: `Owner ${slug}`, adminEmail: `owner@${slug}.test`,
  });
  const owner: Actor = { userId: r.admin.id, scope: "INSTITUTION", institutionId: r.institution.id, roles: ["INSTITUTE_OWNER"] };
  return { ...r, owner };
}

export async function makeUser(institutionId: string, email: string, role: RoleKey): Promise<Actor> {
  const [u] = await db.insert(schema.users).values({
    scope: "INSTITUTION", institutionId, email, name: email, passwordHash: await hashPassword(PASSWORD),
  }).returning({ id: schema.users.id });
  await db.insert(schema.userRoles).values({ userId: u!.id, role });
  return { userId: u!.id, scope: "INSTITUTION", institutionId, roles: [role] };
}

export const studentInput = (admissionNumber: string, fullName = "Ayesha Khan") => ({
  admissionNumber, fullName, admissionDate: "2026-04-01",
});
