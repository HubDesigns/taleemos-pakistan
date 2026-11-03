import { db } from "@/db/client";
import { verifyPayment } from "@/server/billing";
import { adminAction } from "@/server/route-helpers";

export const POST = adminAction<{ id: string }>(async ({ actor, meta, params }) => {
  const r = await verifyPayment(db, actor, params.id, meta);
  return Response.json({ receiptNumber: r.receipt.receiptNumber, subscriptionExpiresAt: r.subscriptionExpiresAt });
});
