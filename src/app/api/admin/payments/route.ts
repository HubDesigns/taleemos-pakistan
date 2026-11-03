import { db } from "@/db/client";
import { recordPayment } from "@/server/billing";
import { adminAction } from "@/server/route-helpers";

export const POST = adminAction(async ({ actor, meta, body }) => {
  const { payment, replayed } = await recordPayment(db, actor, body, meta);
  return Response.json(
    { payment: { id: payment.id, verification: payment.verification, amount: payment.amount }, replayed },
    { status: replayed ? 200 : 201 },
  );
});
