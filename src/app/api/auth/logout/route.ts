import { db } from "@/db/client";
import { revokeSession } from "@/server/auth";
import { assertSameOrigin, clearSessionCookie, errorResponse, getSessionToken } from "@/server/http";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const token = await getSessionToken();
    if (token) await revokeSession(db, token); // invalidated server-side, not just forgotten by the browser
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
