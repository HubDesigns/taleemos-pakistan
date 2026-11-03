import { z } from "zod";
import { db } from "@/db/client";
import { changePassword } from "@/server/auth";
import { assertSameOrigin, errorResponse, getActor, getSessionToken, requestMeta } from "@/server/http";

const body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(12).max(200) });

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = await getActor();
    if (!actor) return Response.json({ error: "Not signed in" }, { status: 401 });
    const input = body.parse(await req.json());
    await changePassword(db, actor.userId, input, await getSessionToken(), await requestMeta());
    return Response.json({ ok: true, redirect: actor.scope === "PLATFORM" ? "/admin" : "/app" });
  } catch (e) {
    return errorResponse(e);
  }
}
