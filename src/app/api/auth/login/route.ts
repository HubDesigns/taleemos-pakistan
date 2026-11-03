import { z } from "zod";
import { db } from "@/db/client";
import { authenticate } from "@/server/auth";
import { assertSameOrigin, errorResponse, requestMeta, setSessionCookie } from "@/server/http";

const body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
  institutionSlug: z.string().max(60).optional(),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const input = body.parse(await req.json());
    const result = await authenticate(db, { ...input, institutionSlug: input.institutionSlug || null }, await requestMeta());
    if (!result.ok) {
      // One generic message for every failure reason so accounts cannot be enumerated.
      return Response.json({ error: "Invalid email or password, or the account is unavailable." }, { status: 401 });
    }
    await setSessionCookie(result.token, result.expiresAt);
    return Response.json({
      ok: true,
      mustChangePassword: result.mustChangePassword,
      redirect: result.mustChangePassword ? "/change-password" : result.actor.scope === "PLATFORM" ? "/admin" : "/app",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
