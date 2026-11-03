import { desc, eq } from "drizzle-orm";
import { schema, type DbOrTx } from "@/db/client";
import { hasAccess } from "@/lib/subscription";

export class SubscriptionInactiveError extends Error {
  constructor(message = "Subscription is not active") {
    super(message);
    this.name = "SubscriptionInactiveError";
  }
}

/** Enforced on the server for every institute-scoped operation, not just in the UI. */
export async function assertSubscriptionActive(tx: DbOrTx, institutionId: string, now: Date = new Date()): Promise<void> {
  const [sub] = await tx.select().from(schema.subscriptions)
    .where(eq(schema.subscriptions.institutionId, institutionId))
    .orderBy(desc(schema.subscriptions.expiresAt)).limit(1);
  if (!sub) throw new SubscriptionInactiveError("No subscription found");

  const ok = hasAccess({
    stored: sub.status, isTrial: sub.status === "TRIAL", expiresAt: sub.expiresAt, graceDays: sub.graceDays, now,
  });
  if (!ok) throw new SubscriptionInactiveError();
}
