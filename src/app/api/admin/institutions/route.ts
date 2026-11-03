import { db } from "@/db/client";
import { registerInstitution } from "@/server/institutions";
import { assertSameOrigin, errorResponse, getActor, requestMeta } from "@/server/http";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = await getActor();
    if (!actor) return Response.json({ error: "Not signed in" }, { status: 401 });
    // registerInstitution enforces the "institutions:write" permission itself (403 for anyone else).
    const result = await registerInstitution(db, actor, await req.json(), await requestMeta());
    return Response.json({
      institution: { id: result.institution.id, name: result.institution.name, slug: result.institution.slug },
      admin: { email: result.admin.email },
      temporaryPassword: result.temporaryPassword, // shown once; the owner must change it at first login
      trialExpiresAt: result.trialExpiresAt,
      invitation: result.invitation,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
