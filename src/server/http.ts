import { cookies, headers } from "next/headers";
import { ZodError } from "zod";
import { db } from "@/db/client";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { PasswordChangeError, resolveSession, type RequestMeta } from "./auth";
import { SubscriptionInactiveError } from "./subscription-guard";
import { DuplicateError } from "./tenant";

export const SESSION_COOKIE = "taleemos_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function getActor(): Promise<Actor | null> {
  return resolveSession(db, await getSessionToken());
}

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: h.get("user-agent") };
}

/** CSRF defence for cookie-authenticated, state-changing requests: SameSite=Lax plus an Origin check. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string | null = null;
  try { originHost = origin ? new URL(origin).host : null; } catch { originHost = null; }
  if (!originHost || !host || originHost !== host) throw new ForbiddenError("Cross-origin request rejected");
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ZodError) {
    return Response.json({ error: "Validation failed", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  if (e instanceof ForbiddenError) return Response.json({ error: "You do not have permission to do this" }, { status: 403 });
  if (e instanceof SubscriptionInactiveError) return Response.json({ error: "This institute's subscription is not active" }, { status: 402 });
  if (e instanceof DuplicateError) return Response.json({ error: e.message }, { status: 409 });
  if (e instanceof PasswordChangeError) return Response.json({ error: e.message }, { status: 400 });
  // Never leak stack traces or database details; log a short server-side line instead.
  console.error("Unhandled API error:", e instanceof Error ? e.name : "unknown");
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
