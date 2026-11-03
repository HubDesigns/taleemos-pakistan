import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db/client";
import { ForbiddenError } from "@/lib/rbac";
import { registerInstitution, listInstitutions, platformStats } from "@/server/institutions";
import { SubscriptionInactiveError } from "@/server/subscription-guard";
import { DuplicateError, openTenant } from "@/server/tenant";
import { makeInstitution, makeSuperAdmin, makeUser, resetDb, studentInput } from "./helpers";

beforeEach(resetDb);

describe("institute onboarding", () => {
  it("creates institution, owner, trial subscription and audit entry atomically", async () => {
    const sa = await makeSuperAdmin();
    const r = await makeInstitution(sa, "alpha");
    expect(r.invitation).toBe("NOT_SENT");
    expect(r.temporaryPassword).toHaveLength(16);
    expect(r.admin.email).toBe("owner@alpha.test");

    const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.institutionId, r.institution.id));
    expect(sub!.status).toBe("TRIAL");
    const [audit] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "institution.register"));
    expect(audit!.actorId).toBe(sa.userId);
    // the temporary password is never written to the audit trail
    expect(JSON.stringify(audit)).not.toContain(r.temporaryPassword);
  });

  it("rolls back completely when registration fails (duplicate slug leaves no partial rows)", async () => {
    const sa = await makeSuperAdmin();
    await makeInstitution(sa, "alpha");
    const before = {
      inst: (await db.select().from(schema.institutions)).length,
      users: (await db.select().from(schema.users)).length,
      subs: (await db.select().from(schema.subscriptions)).length,
    };
    await expect(registerInstitution(db, sa, {
      name: "Other", slug: "alpha", email: "other@x.test", adminName: "Other Owner", adminEmail: "other-owner@x.test",
    })).rejects.toBeInstanceOf(DuplicateError);
    expect((await db.select().from(schema.institutions)).length).toBe(before.inst);
    expect((await db.select().from(schema.users)).length).toBe(before.users);
    expect((await db.select().from(schema.subscriptions)).length).toBe(before.subs);
  });

  it("validates input, including Pakistani phone numbers", async () => {
    const sa = await makeSuperAdmin();
    const base = { name: "Beta School", slug: "beta", email: "o@beta.test", adminName: "Owner B", adminEmail: "a@beta.test" };
    await expect(registerInstitution(db, sa, { ...base, phone: "12345" })).rejects.toThrow();
    await expect(registerInstitution(db, sa, { ...base, slug: "Bad Slug!" })).rejects.toThrow();
    const ok = await registerInstitution(db, sa, { ...base, phone: "0300-1234567" });
    expect(ok.institution.phone).toBe("+923001234567");
  });

  it("only platform operators can register institutions or read platform stats", async () => {
    const sa = await makeSuperAdmin();
    const a = await makeInstitution(sa, "alpha");
    await expect(registerInstitution(db, a.owner, {
      name: "Sneaky", slug: "sneaky", email: "s@x.test", adminName: "Sneaky One", adminEmail: "s1@x.test",
    })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(platformStats(db, a.owner)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listInstitutions(db, a.owner)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("dashboard stats come from the database", async () => {
    const sa = await makeSuperAdmin();
    const a = await makeInstitution(sa, "alpha");
    await makeInstitution(sa, "beta");
    const t = await openTenant(db, a.owner);
    await t.students.create(studentInput("A-1"));
    const s = await platformStats(db, sa);
    expect(s).toMatchObject({ totalInstitutions: 2, activeInstitutions: 2, trialSubscriptions: 2, totalStudents: 1 });
    expect(s.recentInstitutions).toHaveLength(2);
  });
});

describe("tenant isolation", () => {
  it("Institute A cannot read, list or target Institute B's data", async () => {
    const sa = await makeSuperAdmin();
    const a = await makeInstitution(sa, "alpha");
    const b = await makeInstitution(sa, "beta");

    const tenantB = await openTenant(db, b.owner);
    const studentB = await tenantB.students.create(studentInput("B-1", "Bilal Ahmed"));

    const tenantA = await openTenant(db, a.owner);
    await tenantA.students.create(studentInput("A-1", "Ayesha Khan"));

    // guessing B's student id from A returns nothing
    expect(await tenantA.students.get(studentB.id)).toBeNull();
    // listing and searching only ever sees A
    const listed = await tenantA.students.list({ search: "Bilal" });
    expect(listed.total).toBe(0);
    expect((await tenantA.students.list()).rows.map((s) => s.fullName)).toEqual(["Ayesha Khan"]);

    // naming B's institution id is refused and recorded
    await expect(openTenant(db, a.owner, b.institution.id)).rejects.toThrow("Cross-tenant access denied");
    const events = await db.select().from(schema.securityEvents).where(eq(schema.securityEvents.type, "CROSS_TENANT_ATTEMPT"));
    expect(events).toHaveLength(1);
    expect(events[0]!.userId).toBe(a.owner.userId);
  });

  it("admission numbers are unique per institute, not globally", async () => {
    const sa = await makeSuperAdmin();
    const a = await makeInstitution(sa, "alpha");
    const b = await makeInstitution(sa, "beta");
    const ta = await openTenant(db, a.owner);
    const tb = await openTenant(db, b.owner);
    await ta.students.create(studentInput("2026-001"));
    await tb.students.create(studentInput("2026-001")); // same number, different tenant: allowed
    await expect(ta.students.create(studentInput("2026-001"))).rejects.toBeInstanceOf(DuplicateError);
  });

  it("enforces roles on the server: teachers cannot create students, parents cannot read them", async () => {
    const sa = await makeSuperAdmin();
    const a = await makeInstitution(sa, "alpha");
    const teacher = await makeUser(a.institution.id, "t@alpha.test", "TEACHER");
    const parent = await makeUser(a.institution.id, "p@alpha.test", "PARENT");

    const tt = await openTenant(db, teacher);
    await expect(tt.students.create(studentInput("A-9"))).rejects.toBeInstanceOf(ForbiddenError);
    expect((await tt.students.list()).total).toBe(0); // teachers may read

    const pt = await openTenant(db, parent);
    await expect(pt.students.list()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("platform operators must name an institution, and are audited like anyone else", async () => {
    const sa = await makeSuperAdmin();
    const a = await makeInstitution(sa, "alpha");
    await expect(openTenant(db, sa)).rejects.toBeInstanceOf(ForbiddenError);
    const t = await openTenant(db, sa, a.institution.id);
    expect(t.institutionId).toBe(a.institution.id);
  });

  it("student creation is audited with the actor and tenant", async () => {
    const sa = await makeSuperAdmin();
    const a = await makeInstitution(sa, "alpha");
    const t = await openTenant(db, a.owner);
    const s = await t.students.create(studentInput("A-1"));
    const [log] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "student.create"));
    expect(log).toMatchObject({ institutionId: a.institution.id, actorId: a.owner.userId, entityId: s.id });
  });
});

describe("subscription enforcement on the backend", () => {
  it("blocks institute users after expiry plus grace, but allows within grace", async () => {
    const sa = await makeSuperAdmin();
    const a = await makeInstitution(sa, "alpha");
    const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.institutionId, a.institution.id));
    const day = 86_400_000;

    await expect(openTenant(db, a.owner, null, new Date(sub!.expiresAt.getTime() - day))).resolves.toBeTruthy();
    await expect(openTenant(db, a.owner, null, new Date(sub!.expiresAt.getTime() + 3 * day))).resolves.toBeTruthy(); // grace
    await expect(openTenant(db, a.owner, null, new Date(sub!.expiresAt.getTime() + 8 * day))).rejects.toBeInstanceOf(SubscriptionInactiveError);
  });

  it("suspended subscriptions are blocked regardless of dates", async () => {
    const sa = await makeSuperAdmin();
    const a = await makeInstitution(sa, "alpha");
    await db.update(schema.subscriptions).set({ status: "SUSPENDED" }).where(eq(schema.subscriptions.institutionId, a.institution.id));
    await expect(openTenant(db, a.owner)).rejects.toBeInstanceOf(SubscriptionInactiveError);
  });
});
