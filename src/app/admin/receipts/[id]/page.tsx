import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { pkr } from "@/lib/format";
import { can } from "@/lib/rbac";
import { getReceipt } from "@/server/billing";
import { getActor } from "@/server/http";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.scope !== "PLATFORM" || !can(actor, "subscriptions:manage")) redirect("/app");

  const { id } = await params;
  const r = await getReceipt(db, actor, id);
  if (!r) notFound();
  const fmt = (d: Date) => d.toLocaleDateString("en-PK", { timeZone: "Asia/Karachi", day: "numeric", month: "long", year: "numeric" });

  const rows: [string, string][] = [
    ["Receipt number", r.receipt.receiptNumber],
    ["Issued on", fmt(r.receipt.issuedAt)],
    ["Received from", r.institution.name],
    ["Plan", r.plan.name],
    ["Service period", `${fmt(r.payment.periodStart)} to ${fmt(r.payment.periodEnd)}`],
    ["Payment method", r.payment.method.replace("_", " ").toLowerCase()],
    ["Transaction reference", r.payment.transactionRef ?? "-"],
    ["Payment date", r.payment.paidOn],
  ];

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 print:py-0">
      <article className="rounded-xl border border-slate-200 bg-white p-8 print:border-0 print:p-0">
        <header className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl font-bold text-brand-700">TaleemOS Pakistan</h1>
            <p className="text-sm text-slate-500">Payment receipt for platform subscription</p>
          </div>
          <p className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">Verified</p>
        </header>
        <dl className="mt-6 grid grid-cols-[10rem_1fr] gap-x-4 gap-y-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-900">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-8 border-t border-slate-200 pt-4 text-right text-2xl font-semibold text-slate-900">{pkr(r.payment.amount)}</p>
      </article>
      <div className="mt-6 flex justify-center print:hidden"><PrintButton /></div>
    </main>
  );
}
