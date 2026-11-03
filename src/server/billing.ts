import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db, type Tx } from "@/db/client";
import { parseRupees } from "@/lib/money";
import { requirePermission, type Actor } from "@/lib/rbac";
import { computeExpiry, renewalStart } from "@/lib/subscription";
import type { RequestMeta } from "./auth";
import { isUniqueViolation } from "./errors";
import { DuplicateError } from "./tenant";

const { subscriptions, subscriptionPlans, subscriptionPayments, paymentReceipts, auditLogs } = schema;

export class BillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingError";
  }
}

const toDecimal = (paisa: bigint) => `${paisa / 100n}.${(paisa % 100n).toString().padStart(2, "0")}`;
const RECEIPT_LOCK = 727001;

// ---------------------------------------------------------------- plans
const planInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/),
  name: z.string().trim().min(2).max(80),
  interval: z.enum(["TRIAL", "MONTHLY", "QUARTERLY", "SIX_MONTH", "ANNUAL", "CUSTOM"]),
  durationDays: z.number().int().positive().max(3650).optional(),
  price: z.string(),
  maxStudents: z.number().int().positive().optional(),
  maxUsers: z.number().int().positive().optional(),
  maxCampuses: z.number().int().positive().optional(),
});

export async function createPlan(db: Db, actor: Actor, raw: unknown) {
  requirePermission(actor, "subscriptions:manage");
  const input = planInput.parse(raw);
  if ((input.interval === "TRIAL" || input.interval === "CUSTOM") && !input.durationDays) {
    throw new BillingError("durationDays is required for TRIAL and CUSTOM plans");
  }
  const price = parseRupees(input.price);
  const [plan] = await db.transaction(async (tx) => {
    const rows = await tx.insert(subscriptionPlans).values({
      code: input.code, name: input.name, interval: input.interval, durationDays: input.durationDays ?? null,
      price: toDecimal(price), maxStudents: input.maxStudents, maxUsers: input.maxUsers, maxCampuses: input.maxCampuses,
    }).returning().catch((e: unknown) => {
      if (isUniqueViolation(e)) throw new DuplicateError(`Plan code ${input.code} already exists`);
      throw e;
    });
    await tx.insert(auditLogs).values({ actorId: actor.userId, action: "plan.create", entityType: "plan", entityId: rows[0]!.id });
    return rows;
  });
  return plan!;
}

// ---------------------------------------------------------------- payments
const recordInput = z.object({
  institutionId: z.string().min(1),
  planId: z.string().min(1),
  amount: z.string(),
  method: z.enum(["BANK_TRANSFER", "CASH", "MOBILE_WALLET", "OTHER"]), // GATEWAY is reserved for verified gateway callbacks
  transactionRef: z.string().trim().max(80).optional(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idempotencyKey: z.string().min(8).max(100),
  notes: z.string().max(500).optional(),
});

async function lockLatestSubscription(tx: Tx, institutionId: string) {
  const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.institutionId, institutionId))
    .orderBy(desc(subscriptions.expiresAt)).limit(1).for("update");
  if (!sub) throw new BillingError("This institute has no subscription");
  return sub;
}

/**
 * Records a payment as PENDING. It does NOT extend the subscription: a typed-in reference is not proof of payment.
 * Extension happens only in verifyPayment. Safe to retry: the same idempotencyKey returns the original row.
 */
export async function recordPayment(db: Db, actor: Actor, raw: unknown, meta: RequestMeta = {}, now: Date = new Date()) {
  requirePermission(actor, "subscriptions:manage");
  const input = recordInput.parse(raw);
  const paisa = parseRupees(input.amount);
  if (paisa <= 0n) throw new BillingError("Amount must be greater than zero");

  return db.transaction(async (tx) => {
    // Locking the institute's subscription first serialises concurrent requests for the same institute.
    const sub = await lockLatestSubscription(tx, input.institutionId);

    const [existing] = await tx.select().from(subscriptionPayments).where(eq(subscriptionPayments.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      if (existing.institutionId !== input.institutionId) throw new BillingError("Idempotency key was already used for another institute");
      return { payment: existing, replayed: true };
    }

    const [plan] = await tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, input.planId)).limit(1);
    if (!plan || !plan.isActive) throw new BillingError("Plan not found or inactive");

    if (input.transactionRef) {
      const [dupe] = await tx.select({ id: subscriptionPayments.id }).from(subscriptionPayments).where(and(
        eq(subscriptionPayments.method, input.method), eq(subscriptionPayments.transactionRef, input.transactionRef),
        ne(subscriptionPayments.verification, "REJECTED"),
      )).limit(1);
      if (dupe) throw new DuplicateError("This transaction reference has already been recorded");
    }

    const start = renewalStart(sub.expiresAt, now); // provisional; recomputed when verified
    const [payment] = await tx.insert(subscriptionPayments).values({
      subscriptionId: sub.id, planId: plan.id, institutionId: input.institutionId, amount: toDecimal(paisa), method: input.method,
      transactionRef: input.transactionRef, paidOn: input.paidOn, periodStart: start,
      periodEnd: computeExpiry(start, plan.interval, plan.durationDays ?? undefined),
      recordedById: actor.userId, idempotencyKey: input.idempotencyKey, notes: input.notes,
    }).returning();
    if (!payment) throw new Error("Failed to record payment");

    await tx.insert(auditLogs).values({
      institutionId: input.institutionId, actorId: actor.userId, action: "payment.record", entityType: "subscription_payment",
      entityId: payment.id, ip: meta.ip ?? null, metadata: { amount: payment.amount, method: payment.method, planCode: plan.code },
    });
    return { payment, replayed: false };
  });
}

/**
 * Marks a PENDING payment as verified, extends the subscription from the later of (current expiry, now) so no paid
 * time is lost or double counted, and issues a receipt. All-or-nothing; a second verify of the same payment fails.
 */
export async function verifyPayment(db: Db, actor: Actor, paymentId: string, meta: RequestMeta = {}, now: Date = new Date()) {
  requirePermission(actor, "subscriptions:manage");
  return db.transaction(async (tx) => {
    const [found] = await tx.select().from(subscriptionPayments).where(eq(subscriptionPayments.id, paymentId)).limit(1);
    if (!found) throw new BillingError("Payment not found");
    const sub = await lockLatestSubscription(tx, found.institutionId);
    const [plan] = await tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, found.planId)).limit(1);
    if (!plan) throw new BillingError("Plan no longer exists");

    const periodStart = renewalStart(sub.expiresAt, now);
    const periodEnd = computeExpiry(periodStart, plan.interval, plan.durationDays ?? undefined);

    const [payment] = await tx.update(subscriptionPayments).set({
      verification: "VERIFIED", verifiedById: actor.userId, verifiedAt: now, periodStart, periodEnd,
    }).where(and(eq(subscriptionPayments.id, paymentId), eq(subscriptionPayments.verification, "PENDING"))).returning();
    if (!payment) throw new BillingError("Payment was already processed");

    // Manual suspension/cancellation always wins; dates still extend so nothing paid is lost.
    const keepStatus = sub.status === "SUSPENDED" || sub.status === "CANCELLED";
    await tx.update(subscriptions).set({
      planId: plan.id, expiresAt: periodEnd, status: keepStatus ? sub.status : "ACTIVE", updatedAt: now,
    }).where(eq(subscriptions.id, sub.id));

    await tx.execute(sql`select pg_advisory_xact_lock(${RECEIPT_LOCK})`);
    const year = now.getUTCFullYear();
    const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(paymentReceipts)
      .where(sql`${paymentReceipts.receiptNumber} like ${`TOS-${year}-%`}`);
    const [receipt] = await tx.insert(paymentReceipts).values({
      receiptNumber: `TOS-${year}-${String(n + 1).padStart(6, "0")}`, paymentId: payment.id, issuedAt: now,
    }).returning();

    await tx.insert(auditLogs).values({
      institutionId: payment.institutionId, actorId: actor.userId, action: "payment.verify", entityType: "subscription_payment",
      entityId: payment.id, ip: meta.ip ?? null,
      metadata: { receipt: receipt!.receiptNumber, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() },
    });
    return { payment, receipt: receipt!, subscriptionExpiresAt: periodEnd };
  });
}

export async function rejectPayment(db: Db, actor: Actor, paymentId: string, reason: string, meta: RequestMeta = {}, now: Date = new Date()) {
  requirePermission(actor, "subscriptions:manage");
  if (!reason.trim()) throw new BillingError("A rejection reason is required");
  return db.transaction(async (tx) => {
    const [found] = await tx.select().from(subscriptionPayments).where(eq(subscriptionPayments.id, paymentId)).limit(1);
    if (!found) throw new BillingError("Payment not found");
    await lockLatestSubscription(tx, found.institutionId);
    const [payment] = await tx.update(subscriptionPayments).set({ verification: "REJECTED", verifiedById: actor.userId, verifiedAt: now })
      .where(and(eq(subscriptionPayments.id, paymentId), eq(subscriptionPayments.verification, "PENDING"))).returning();
    if (!payment) throw new BillingError("Payment was already processed");
    await tx.insert(auditLogs).values({
      institutionId: payment.institutionId, actorId: actor.userId, action: "payment.reject", entityType: "subscription_payment",
      entityId: payment.id, ip: meta.ip ?? null, metadata: { reason: reason.trim().slice(0, 300) },
    });
    return payment;
  });
}

export async function listPayments(db: Db, actor: Actor, institutionId: string) {
  requirePermission(actor, "subscriptions:manage");
  return db.select({ payment: subscriptionPayments, receiptNumber: paymentReceipts.receiptNumber })
    .from(subscriptionPayments).leftJoin(paymentReceipts, eq(paymentReceipts.paymentId, subscriptionPayments.id))
    .where(eq(subscriptionPayments.institutionId, institutionId)).orderBy(desc(subscriptionPayments.createdAt));
}
