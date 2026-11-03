import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pool, schema } from "@/db/client";
import { authenticate, resolveSession, revokeSession, MAX_FAILED_LOGINS, LOCK_DURATION_MS } from "@/server/auth";
import { bootstrapSuperAdmin } from "@/server/bootstrap";
import { PASSWORD, makeInstitution, makeSuperAdmin, resetDb } from "./helpers";

beforeEach(resetDb);

describe("Super Admin bootstrap", () => {
  it("creates the first Super Admin with a hashed password", async () => {
    await makeSuperAdmin();
    const [u] = await db.select().from(schema.users);
    expect(u!.scope).toBe("PLATFORM");
    expect(u!.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(u!.passwordHash).not.toContain(PASSWORD);
  });

  it("refuses to run twice and rejects weak configuration", async () => {
    await makeSuperAdmin();
    await expect(bootstrapSuperAdmin(db, { email: "second@taleemos.test", password: PASSWORD })).rejects.toThrow("already exists");
    await resetDb();
    await expect(bootstrapSuperAdmin(db, { email: "x@taleemos.test", password: "short" })).rejects.toThrow("at least 12");
  });
});

describe("login and sessions", () => {
  it("signs in, resolves the session, and revokes it", async () => {
    await makeSuperAdmin();
    const r = await authenticate(db, { email: "ROOT@taleemos.test", password: PASSWORD });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.actor.scope).toBe("PLATFORM");
    expect(r.actor.roles).toEqual(["SUPER_ADMIN"]);

    // only a hash of the cookie token is stored
    const [s] = await db.select().from(schema.sessions);
    expect(s!.tokenHash).not.toBe(r.token);

    expect((await resolveSession(db, r.token))?.userId).toBe(r.actor.userId);
    await revokeSession(db, r.token);
    expect(await resolveSession(db, r.token)).toBeNull();
  });

  it("rejects expired sessions and garbage tokens", async () => {
    await makeSuperAdmin();
    const r = await authenticate(db, { email: "root@taleemos.test", password: PASSWORD });
    if (!r.ok) throw new Error("login failed");
    expect(await resolveSession(db, r.token, new Date(r.expiresAt.getTime() + 1000))).toBeNull();
    expect(await resolveSession(db, "not-a-real-token")).toBeNull();
    expect(await resolveSession(db, undefined)).toBeNull();
  });

  it("gives the same generic failure for wrong password and unknown account", async () => {
    await makeSuperAdmin();
    const wrong = await authenticate(db, { email: "root@taleemos.test", password: "wrong-password-123" });
    const unknown = await authenticate(db, { email: "nobody@taleemos.test", password: "wrong-password-123" });
    expect(wrong).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
    expect(unknown).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
  });

  it("locks the account after repeated failures, even for the right password, then unlocks", async () => {
    await makeSuperAdmin();
    const t0 = new Date("2026-11-02T10:00:00Z");
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await authenticate(db, { email: "root@taleemos.test", password: "bad-password-000" }, {}, t0);
    }
    const locked = await authenticate(db, { email: "root@taleemos.test", password: PASSWORD }, {}, new Date(t0.getTime() + 60_000));
    expect(locked).toEqual({ ok: false, reason: "LOCKED" });

    const events = await db.select().from(schema.securityEvents).where(eq(schema.securityEvents.type, "ACCOUNT_LOCKED"));
    expect(events).toHaveLength(1);

    const after = await authenticate(db, { email: "root@taleemos.test", password: PASSWORD }, {}, new Date(t0.getTime() + LOCK_DURATION_MS + 1000));
    expect(after.ok).toBe(true);
  });

  it("records login outcomes as security events without storing the password", async () => {
    await makeSuperAdmin();
    await authenticate(db, { email: "root@taleemos.test", password: "bad-password-000" });
    await authenticate(db, { email: "root@taleemos.test", password: PASSWORD });
    const { rows } = await pool.query("select type, detail from security_events order by created_at");
    expect(rows.map((r) => r.type)).toEqual(["LOGIN_FAILED", "LOGIN_SUCCESS"]);
    expect(JSON.stringify(rows)).not.toContain(PASSWORD);
  });

  it("institute users sign in by institution slug and must change the temporary password", async () => {
    const sa = await makeSuperAdmin();
    const a = await makeInstitution(sa, "alpha");
    const r = await authenticate(db, { email: "owner@alpha.test", password: a.temporaryPassword, institutionSlug: "alpha" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mustChangePassword).toBe(true);
      expect(r.actor.institutionId).toBe(a.institution.id);
    }
    // same email, wrong institution slug => no access
    await makeInstitution(sa, "beta");
    const wrongTenant = await authenticate(db, { email: "owner@alpha.test", password: a.temporaryPassword, institutionSlug: "beta" });
    expect(wrongTenant.ok).toBe(false);
  });

  it("suspended institutions cannot sign in and their live sessions stop working", async () => {
    const sa = await makeSuperAdmin();
    const a = await makeInstitution(sa, "alpha");
    const login = await authenticate(db, { email: "owner@alpha.test", password: a.temporaryPassword, institutionSlug: "alpha" });
    if (!login.ok) throw new Error("login failed");
    expect(await resolveSession(db, login.token)).not.toBeNull();

    await db.update(schema.institutions).set({ status: "SUSPENDED" }).where(eq(schema.institutions.id, a.institution.id));
    expect(await resolveSession(db, login.token)).toBeNull();
    const again = await authenticate(db, { email: "owner@alpha.test", password: a.temporaryPassword, institutionSlug: "alpha" });
    expect(again).toEqual({ ok: false, reason: "INSTITUTION_INACTIVE" });
  });
});

describe("password change", () => {
  it("enforces policy, clears the forced-change flag, and signs out other sessions", async () => {
    const { changePassword, mustChangePassword, PasswordChangeError } = await import("@/server/auth");
    const sa = await makeSuperAdmin();
    const a = await makeInstitution(sa, "alpha");
    const login = (slug = "alpha") => authenticate(db, { email: "owner@alpha.test", password: a.temporaryPassword, institutionSlug: slug });
    const s1 = await login();
    const s2 = await login();
    if (!s1.ok || !s2.ok) throw new Error("login failed");
    expect(await mustChangePassword(db, s1.actor.userId)).toBe(true);

    await expect(changePassword(db, s1.actor.userId, { currentPassword: "wrong-password-1", newPassword: "A-Brand-New-Passphrase-1" }, s1.token)).rejects.toBeInstanceOf(PasswordChangeError);
    await expect(changePassword(db, s1.actor.userId, { currentPassword: a.temporaryPassword, newPassword: "short" }, s1.token)).rejects.toThrow("at least 12");

    await changePassword(db, s1.actor.userId, { currentPassword: a.temporaryPassword, newPassword: "A-Brand-New-Passphrase-1" }, s1.token);
    expect(await mustChangePassword(db, s1.actor.userId)).toBe(false);
    expect(await resolveSession(db, s1.token)).not.toBeNull(); // current session kept
    expect(await resolveSession(db, s2.token)).toBeNull(); // other sessions revoked
    expect((await login()).ok).toBe(false); // old temporary password no longer works
    const fresh = await authenticate(db, { email: "owner@alpha.test", password: "A-Brand-New-Passphrase-1", institutionSlug: "alpha" });
    expect(fresh.ok).toBe(true);
  });
});
