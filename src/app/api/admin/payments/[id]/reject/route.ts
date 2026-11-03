import { db } from "@/db/client";
import { rejectPayment } from "@/server/billing";
import { adminAction } from "@/server/route-helpers";

export const POST = adminAction<{ id: string }>(async ({ actor, meta, body, params }) => {
  const reason = typeof (body as { reason?: unknown }).reason === "string" ? (body as { reason: string }).reason : "";
  const p = await rejectPayment(db, actor, params.id, reason, meta);
  return Response.json({ verification: p.verification });
});
