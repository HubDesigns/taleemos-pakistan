import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db/client";
import { mustChangePassword } from "@/server/auth";
import { getActor } from "@/server/http";
import { SubscriptionInactiveError } from "@/server/subscription-guard";
import { openTenant } from "@/server/tenant";
import { LogoutButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function InstituteHome() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.scope === "PLATFORM") redirect("/admin");
  if (await mustChangePassword(db, actor.userId)) redirect("/change-password");

  const [inst] = await db.select({ name: schema.institutions.name }).from(schema.institutions).where(eq(schema.institutions.id, actor.institutionId!)).limit(1);

  let students: Awaited<ReturnType<Awaited<ReturnType<typeof openTenant>>["students"]["list"]>> | null = null;
  let blocked = false;
  try {
    const tenant = await openTenant(db, actor);
    students = await tenant.students.list({ limit: 10 });
  } catch (e) {
    if (e instanceof SubscriptionInactiveError) blocked = true;
    else if (!(e instanceof Error && e.name === "ForbiddenError")) throw e;
  }

  return (
    <div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <span className="font-semibold text-brand-700">{inst?.name ?? "Institute"}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {blocked ? (
          <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            This institute&apos;s subscription is not active. Please contact the platform administrator to renew.
          </p>
        ) : (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">Students</h2>
            <p className="mt-1 text-sm text-slate-600">{students ? `${students.total} enrolled records in your institute.` : "You do not have access to student records."}</p>
            {students && students.rows.length > 0 ? (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {students.rows.map((s) => <li key={s.id} className="flex justify-between py-2"><span>{s.fullName}</span><span className="font-mono text-slate-500">{s.admissionNumber}</span></li>)}
              </ul>
            ) : null}
          </section>
        )}
        <p className="text-xs text-slate-500">Admissions, attendance, fees and the other institute modules are not built yet.</p>
      </main>
    </div>
  );
}
