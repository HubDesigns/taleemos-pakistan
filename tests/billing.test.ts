import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db/client";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import {
  BillingError, createPlan, getReceipt, listPayments, listPlans, listRecentPayments, recordPayment, rejectPayment, revenueSummary, verifyPayment,
} from "@/server/billing";
import { DuplicateError } from "@/server/tenant";
import { makeInstitution, makeSuperAdmin, resetDb } from "./helpers";

const NOW = new Date("2026-11-03T05:00:00Z");
const EXPIRY = new Date("2026-11-10T00:00:00Z");

let sa: Actor;
let inst: Awaited<ReturnType<typeof makeInstitution>>;
let planId: string;
let n = 0;

const pay = (over: Record<string, unknown> = {}) => ({
  institutionId: inst.institution.id, planId, amount: "5000", method: "CASH", paidOn: "2026-11-03",
  idempotencyKey: `key-${String(++n).padStart(8, "0")}`, ...over,
});
const sub = async () => (await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.institutionId, inst.institution.id)))[0]!;
const setExpiry = (d: Date) => db.update(schema.subscriptions).set({ expiresAt: d }).where(eq(schema.subscriptions.institutionId, inst.institution.id));

beforeEach(async () => {
  await resetDb();
  n = 0;
  sa = await makeSuperAdmin();
  inst = await makeInstitution(sa, "alpha");
  planId = (await createPlan(db, sa, { code: "monthly-5000", name: "Monthly", interval: "MONTHLY", price: "5000" })).id;
  await setExpiry(EXPIRY);
});

describe("recording payments", () => {
  it("records PENDING without touching the subscription or issuing a receipt", async () => {
    const { payment, replayed } = await recordPayment(db, sa, pay({ transactionRef: "TXN-1" }), {}, NOW);
    expect(replayed).toBe(false);
    expect(payment.verification).toBe("PENDING");
    expect(payment.amount).toBe("5000.00");
    expect((await sub()).expiresAt).toEqual(EXPIRY);
    expect((await sub()).status).toBe("TRIAL");
    expect(await db.select().from(schema.paymentReceipts)).toHaveLength(0);
  });

  it("is idempotent: retrying with the same key returns the original and creates nothing new", async () => {
    const body = pay();
    const first = await recordPayment(db, sa, body, {}, NOW);
    const second = await recordPayment(db, sa, body, {}, NOW);
    expect(second.replayed).toBe(true);
    expect(second.payment.id).toBe(first.payment.id);
    expect(await db.select().from(schema.subscriptionPayments)).toHaveLength(1);

    const other = await makeInstitution(sa, "beta");
    await expect(recordPayment(db, sa, { ...body, institutionId: other.institution.id }, {}, NOW)).rejects.toBeInstanceOf(BillingError);
  });

  it("rejects bad amounts, inactive plans and reused transaction references", async () => {
    for (const amount of ["0", "0.00", "-5", "12.345", "abc"]) {
      await expect(recordPayment(db, sa, pay({ amount }), {}, NOW)).rejects.toBeInstanceOf(BillingError);
    }
    await expect(createPlan(db, sa, { code: "BAD-PRICE", name: "Bad", interval: "MONTHLY", price: "1.999" })).rejects.toBeInstanceOf(BillingError);
    await db.update(schema.subscriptionPlans).set({ isActive: false }).where(eq(schema.subscriptionPlans.id, planId));
    await expect(recordPayment(db, sa, pay(), {}, NOW)).rejects.toBeInstanceOf(BillingError);
    await db.update(schema.subscriptionPlans).set({ isActive: true }).where(eq(schema.subscriptionPlans.id, planId));

    await recordPayment(db, sa, pay({ transactionRef: "TXN-9" }), {}, NOW);
    await expect(recordPayment(db, sa, pay({ transactionRef: "TXN-9" }), {}, NOW)).rejects.toBeInstanceOf(DuplicateError);
  });

  it("only platform operators with billing permission can use billing", async () => {
    await expect(recordPayment(db, inst.owner, pay(), {}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    const { payment } = await recordPayment(db, sa, pay(), {}, NOW);
    await expect(verifyPayment(db, inst.owner, payment.id, {}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rejectPayment(db, inst.owner, payment.id, "no", {}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createPlan(db, inst.owner, { code: "X-PLAN", name: "X", interval: "MONTHLY", price: "1" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("verification, renewal and receipts", () => {
  it("verifying extends from the current expiry (no paid time lost), activates the plan and issues a receipt", async () => {
    const { payment } = await recordPayment(db, sa, pay(), {}, NOW);
    const r = await verifyPayment(db, sa, payment.id, {}, NOW);
    expect(r.payment.periodStart).toEqual(EXPIRY);
    expect(r.subscriptionExpiresAt).toEqual(new Date("2026-12-10T00:00:00Z"));
    expect(r.receipt.receiptNumber).toBe("TOS-2026-000001");
    const s = await sub();
    expect(s.status).toBe("ACTIVE");
    expect(s.planId).toBe(planId);
    expect(s.expiresAt).toEqual(new Date("2026-12-10T00:00:00Z"));
  });

  it("an expired subscription renews from now, not from the past", async () => {
    await setExpiry(new Date("2026-09-01T00:00:00Z"));
    const { payment } = await recordPayment(db, sa, pay(), {}, NOW);
    const r = await verifyPayment(db, sa, payment.id, {}, NOW);
    expect(r.payment.periodStart).toEqual(NOW);
    expect(r.subscriptionExpiresAt).toEqual(new Date("2026-12-03T05:00:00Z"));
  });

  it("successive renewals stack, keep every historical payment, and number receipts sequentially", async () => {
    const p1 = await recordPayment(db, sa, pay(), {}, NOW);
    await verifyPayment(db, sa, p1.payment.id, {}, NOW);
    const p2 = await recordPayment(db, sa, pay(), {}, NOW);
    const r2 = await verifyPayment(db, sa, p2.payment.id, {}, NOW);
    expect(r2.subscriptionExpiresAt).toEqual(new Date("2027-01-10T00:00:00Z"));
    expect(r2.receipt.receiptNumber).toBe("TOS-2026-000002");

    const history = await listPayments(db, sa, inst.institution.id);
    expect(history).toHaveLength(2);
    expect(history.every((h) => h.payment.verification === "VERIFIED" && h.receiptNumber)).toBe(true);
  });

  it("a payment can be verified only once, even when two verifications race", async () => {
    const { payment } = await recordPayment(db, sa, pay(), {}, NOW);
    const results = await Promise.allSettled([verifyPayment(db, sa, payment.id, {}, NOW), verifyPayment(db, sa, payment.id, {}, NOW)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await sub()).expiresAt).toEqual(new Date("2026-12-10T00:00:00Z")); // extended once, not twice
    expect(await db.select().from(schema.paymentReceipts)).toHaveLength(1);
    await expect(verifyPayment(db, sa, payment.id, {}, NOW)).rejects.toThrow("already processed");
  });

  it("rejected payments never extend access or get receipts, and cannot be verified later", async () => {
    const { payment } = await recordPayment(db, sa, pay(), {}, NOW);
    await expect(rejectPayment(db, sa, payment.id, "  ", {}, NOW)).rejects.toBeInstanceOf(BillingError);
    const rejected = await rejectPayment(db, sa, payment.id, "Bank has no such transfer", {}, NOW);
    expect(rejected.verification).toBe("REJECTED");
    expect((await sub()).expiresAt).toEqual(EXPIRY);
    expect(await db.select().from(schema.paymentReceipts)).toHaveLength(0);
    await expect(verifyPayment(db, sa, payment.id, {}, NOW)).rejects.toThrow("already processed");
    // a rejected reference may be recorded again
    await expect(recordPayment(db, sa, pay({ transactionRef: "R-1" }), {}, NOW)).resolves.toBeTruthy();
  });

  it("a manually suspended subscription stays suspended after payment, but the paid time is kept", async () => {
    await db.update(schema.subscriptions).set({ status: "SUSPENDED" }).where(eq(schema.subscriptions.institutionId, inst.institution.id));
    const { payment } = await recordPayment(db, sa, pay(), {}, NOW);
    await verifyPayment(db, sa, payment.id, {}, NOW);
    const s = await sub();
    expect(s.status).toBe("SUSPENDED");
    expect(s.expiresAt).toEqual(new Date("2026-12-10T00:00:00Z"));
  });

  it("audits record and verify without leaking anything sensitive", async () => {
    const { payment } = await recordPayment(db, sa, pay({ transactionRef: "TXN-SECRET-REF" }), {}, NOW);
    await verifyPayment(db, sa, payment.id, {}, NOW);
    const logs = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, payment.id));
    expect(logs.map((l) => l.action).sort()).toEqual(["payment.record", "payment.verify"]);
    expect(JSON.stringify(logs)).not.toContain("TXN-SECRET-REF");
  });
});

describe("plans", () => {
  it("requires a duration for custom plans and rejects duplicate codes", async () => {
    await expect(createPlan(db, sa, { code: "CUSTOM-1", name: "Custom", interval: "CUSTOM", price: "100" })).rejects.toBeInstanceOf(BillingError);
    const ok = await createPlan(db, sa, { code: "CUSTOM-1", name: "Custom", interval: "CUSTOM", durationDays: 45, price: "9999.50" });
    expect(ok.price).toBe("9999.50");
    await expect(createPlan(db, sa, { code: "custom-1", name: "Again", interval: "MONTHLY", price: "1" })).rejects.toBeInstanceOf(DuplicateError);
  });
});

describe("read models for the Super Admin screens", () => {
  it("trial plans cannot be purchased or listed", async () => {
    const trial = await createPlan(db, sa, { code: "TRIAL-X", name: "Trial", interval: "TRIAL", durationDays: 14, price: "0" });
    await expect(recordPayment(db, sa, pay({ planId: trial.id }), {}, NOW)).rejects.toThrow("Trial plans cannot be purchased");
    expect((await listPlans(db, sa)).map((p) => p.code)).toEqual(["MONTHLY-5000"]);
  });

  it("receipts exist only for verified payments, and only operators can read them", async () => {
    const { payment } = await recordPayment(db, sa, pay(), {}, NOW);
    expect(await getReceipt(db, sa, payment.id)).toBeNull();
    const v = await verifyPayment(db, sa, payment.id, {}, NOW);
    const r = await getReceipt(db, sa, payment.id);
    expect(r?.receipt.receiptNumber).toBe(v.receipt.receiptNumber);
    expect(r?.institution.slug).toBe("alpha");
    await expect(getReceipt(db, inst.owner, payment.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listRecentPayments(db, inst.owner)).rejects.toBeInstanceOf(ForbiddenError);
    const recent = await listRecentPayments(db, sa);
    expect(recent[0]).toMatchObject({ institutionSlug: "alpha", planName: "Monthly", receiptNumber: v.receipt.receiptNumber });
  });

  it("revenue figures separate verified money from pending and estimate MRR/ARR", async () => {
    const annual = await createPlan(db, sa, { code: "ANNUAL-60K", name: "Annual", interval: "ANNUAL", price: "60000" });
    expect(await revenueSummary(db, sa, NOW)).toMatchObject({ verifiedTotal: "0", pendingCount: 0, mrr: "0.00" });

    const p1 = await recordPayment(db, sa, pay(), {}, NOW);
    await recordPayment(db, sa, pay({ amount: "1200.50" }), {}, NOW); // stays pending
    await verifyPayment(db, sa, p1.payment.id, {}, NOW);
    let r = await revenueSummary(db, sa, NOW);
    expect(r).toMatchObject({ verifiedTotal: "5000.00", pendingTotal: "1200.50", pendingCount: 1, mrr: "5000.00", arr: "60000.00" });

    const other = await makeInstitution(sa, "beta");
    await db.update(schema.subscriptions).set({ expiresAt: EXPIRY }).where(eq(schema.subscriptions.institutionId, other.institution.id));
    const p2 = await recordPayment(db, sa, pay({ institutionId: other.institution.id, planId: annual.id, amount: "60000" }), {}, NOW);
    await verifyPayment(db, sa, p2.payment.id, {}, NOW);
    r = await revenueSummary(db, sa, NOW);
    expect(r).toMatchObject({ verifiedTotal: "65000.00", mrr: "10000.00", arr: "120000.00" });
    await expect(revenueSummary(db, inst.owner, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
