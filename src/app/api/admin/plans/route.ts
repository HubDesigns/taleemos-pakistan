import { db } from "@/db/client";
import { createPlan } from "@/server/billing";
import { adminAction } from "@/server/route-helpers";

export const POST = adminAction(async ({ actor, body }) => {
  const input = body as Record<string, unknown>;
  // HTML forms send strings; coerce the numeric fields before validation.
  for (const k of ["durationDays", "maxStudents", "maxUsers", "maxCampuses"]) {
    if (input[k] === "" || input[k] === undefined) delete input[k];
    else input[k] = Number(input[k]);
  }
  const plan = await createPlan(db, actor, input);
  return Response.json({ plan: { id: plan.id, code: plan.code, name: plan.name } }, { status: 201 });
});
