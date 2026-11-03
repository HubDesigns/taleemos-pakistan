import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { pkr } from "@/lib/format";
import { can } from "@/lib/rbac";
import { mustChangePassword } from "@/server/auth";
import { listPlans, listRecentPayments } from "@/server/billing";
import { getActor } from "@/server/http";
import { listInstitutions } from "@/server/institutions";
import { AdminHeader } from "../header";
import { PaymentActions, PaymentForm, PlanForm } from "./forms";

export const dynamic = "force-dynamic";

const badge: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700", VERIFIED: "bg-green-50 text-green-700", REJECTED: "bg-red-50 text-red-700",
};
const dateFmt = (d: Date) => d.toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" });

export default async function BillingPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.scope !== "PLATFORM" || !can(actor, "subscriptions:manage")) redirect("/app");
  if (await mustChangePassword(db, actor.userId)) redirect("/change-password");

  const [plans, payments, insts] = await Promise.all([
    listPlans(db, actor), listRecentPayments(db, actor, 25), listInstitutions(db, actor, { limit: 100 }),
  ]);

  return (
    <div>
      <AdminHeader current="billing" />
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <section className="rounded-xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">Payments</h2>
          {payments.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">No payments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Date</th><th className="px-6 py-3">Institute</th><th className="px-6 py-3">Plan</th>
                    <th className="px-6 py-3">Amount</th><th className="px-6 py-3">Method / ref</th><th className="px-6 py-3">Status</th><th className="px-6 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map(({ payment, institutionName, planName, receiptNumber }) => (
                    <tr key={payment.id}>
                      <td className="whitespace-nowrap px-6 py-3 text-slate-600">{payment.paidOn}</td>
                      <td className="px-6 py-3 font-medium text-slate-900">{institutionName}</td>
                      <td className="px-6 py-3 text-slate-600">{planName}</td>
                      <td className="whitespace-nowrap px-6 py-3">{pkr(payment.amount)}</td>
                      <td className="px-6 py-3 text-slate-600">{payment.method.replace("_", " ").toLowerCase()}{payment.transactionRef ? <span className="block font-mono text-xs">{payment.transactionRef}</span> : null}</td>
                      <td className="px-6 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge[payment.verification] ?? ""}`}>{payment.verification.toLowerCase()}</span>
                        {payment.verification === "VERIFIED" ? <span className="mt-1 block text-xs text-slate-500">until {dateFmt(payment.periodEnd)}</span> : null}</td>
                      <td className="px-6 py-3">
                        {payment.verification === "PENDING" ? <PaymentActions id={payment.id} />
                          : receiptNumber ? <Link className="text-brand-700 underline" href={`/admin/receipts/${payment.id}`}>Receipt {receiptNumber}</Link> : <span className="text-slate-400">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">Record a payment</h2>
          <p className="mt-1 mb-4 text-sm text-slate-600">A recorded payment stays pending and gives the institute no extra time until you verify it.</p>
          <PaymentForm
            institutions={insts.rows.map((i) => ({ id: i.id, label: `${i.name} (${i.slug})` }))}
            plans={plans.map((p) => ({ id: p.id, label: `${p.name} - ${pkr(p.price)}` }))}
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">Plans</h2>
          {plans.length > 0 ? (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {plans.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span><span className="font-medium text-slate-900">{p.name}</span> <span className="font-mono text-xs text-slate-500">{p.code}</span></span>
                  <span className="text-slate-600">{pkr(p.price)} / {p.interval.replace("_", " ").toLowerCase()}{p.maxStudents ? ` · up to ${p.maxStudents} students` : ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-slate-500">No plans yet. Create the first one below.</p>}
          <h3 className="mt-6 mb-3 text-sm font-semibold text-slate-900">Create a plan</h3>
          <PlanForm />
        </section>
      </main>
    </div>
  );
}
