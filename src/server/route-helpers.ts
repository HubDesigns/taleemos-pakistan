import type { Actor } from "@/lib/rbac";
import { assertSameOrigin, errorResponse, getActor, requestMeta } from "./http";
import type { RequestMeta } from "./auth";

/**
 * Wraps a state-changing, cookie-authenticated route: Origin check (CSRF), session lookup (401),
 * then the handler, whose service call enforces the specific permission (403). Errors are mapped safely.
 */
export function adminAction<P = Record<string, never>>(
  handler: (ctx: { actor: Actor; meta: RequestMeta; body: unknown; params: P }) => Promise<Response>,
) {
  return async (req: Request, routeCtx?: { params: Promise<P> }): Promise<Response> => {
    try {
      assertSameOrigin(req);
      const actor = await getActor();
      if (!actor) return Response.json({ error: "Not signed in" }, { status: 401 });
      const body = await req.json().catch(() => ({}));
      const params = (routeCtx ? await routeCtx.params : {}) as P;
      return await handler({ actor, meta: await requestMeta(), body, params });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
