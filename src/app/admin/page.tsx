import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { can } from "@/lib/rbac";
import { mustChangePassword } from "@/server/auth";
import { getActor } from "@/server/http";
import { platformStats } from "@/server/institutions";
import { LogoutButton } from "@/components/ui";
import { RegisterInstitutionForm } from "./register-form";

export const dynamic = "force-dynamic";

const badge: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700",
  INACTIVE: "bg-slate-100 text-slate-600",
  SUSPENDED: "bg-red-50 text-red-700",
};

export default async function AdminPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.scope !== "PLATFORM" || !can(actor, "institutions:read")) redirect("/app");
  if (await mustChangePassword(db, actor.userId)) redirect("/change-password");

  const s = await platformStats(db, actor);
  const cards = [
    ["Registered institutes", s.totalInstitutions],
    ["Active institutes", s.activeInstitutions],
    ["Suspended institutes", s.suspendedInstitutions],
    ["Trials running", s.trialSubscriptions],
    ["Expired subscriptions", s.expiredSubscriptions],
    ["Expiring within 7 days", s.expiringWithin7Days],
    ["Total students", s.totalStudents],
  ] as const;

  return (
    <div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <span className="font-semibold text-brand-700">TaleemOS <span className="text-slate-500">Super Admin</span></span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <section aria-label="Platform summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </section>
        <p className="text-xs text-slate-500">Revenue and payment figures will appear here once subscription payment recording is built.</p>

        <section className="rounded-xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">Recent institutes</h2>
          {s.recentInstitutions.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">No institutes yet. Register the first one below.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr><th className="px-6 py-3">Name</th><th className="px-6 py-3">Code</th><th className="px-6 py-3">Email</th><th className="px-6 py-3">Status</th><th className="px-6 py-3">Registered</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s.recentInstitutions.map((i) => (
                    <tr key={i.id}>
                      <td className="px-6 py-3 font-medium text-slate-900">{i.name}</td>
                      <td className="px-6 py-3 font-mono text-slate-600">{i.slug}</td>
                      <td className="px-6 py-3 text-slate-600">{i.email}</td>
                      <td className="px-6 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge[i.status] ?? ""}`}>{i.status.toLowerCase()}</span></td>
                      <td className="px-6 py-3 text-slate-600">{i.createdAt.toLocaleDateString("en-PK")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <RegisterInstitutionForm />
      </main>
    </div>
  );
}
