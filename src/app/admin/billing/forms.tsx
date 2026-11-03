"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote, Field, btnCls, inputCls, postJson } from "@/components/ui";

const errText = (d: { error?: string; issues?: { path: string; message: string }[] }) =>
  d.issues?.map((i) => `${i.path}: ${i.message}`).join("; ") ?? d.error ?? "Something went wrong.";

export function PlanForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setDone(null); setBusy(true);
    const form = e.currentTarget;
    const res = await postJson<{ plan: { name: string } }>("/api/admin/plans", Object.fromEntries(new FormData(form).entries()));
    setBusy(false);
    if (!res.ok) return setError(errText(res.data));
    setDone(`Plan "${res.data.plan.name}" created.`);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Plan code" hint="Letters, digits, hyphens, e.g. MONTHLY-5000"><input name="code" required className={inputCls} /></Field>
      <Field label="Plan name"><input name="name" required className={inputCls} /></Field>
      <Field label="Billing period">
        <select name="interval" defaultValue="MONTHLY" className={inputCls}>
          <option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option>
          <option value="SIX_MONTH">Six months</option><option value="ANNUAL">Annual</option><option value="CUSTOM">Custom (set days)</option>
        </select>
      </Field>
      <Field label="Price (PKR)"><input name="price" required inputMode="decimal" placeholder="5000" className={inputCls} /></Field>
      <Field label="Custom length in days" hint="Only for custom plans"><input name="durationDays" inputMode="numeric" className={inputCls} /></Field>
      <Field label="Student limit" hint="Optional"><input name="maxStudents" inputMode="numeric" className={inputCls} /></Field>
      <div className="space-y-3 sm:col-span-2">
        <ErrorNote message={error} />
        {done ? <p role="status" className="text-sm text-green-700">{done}</p> : null}
        <button type="submit" disabled={busy} className={btnCls}>{busy ? "Saving..." : "Create plan"}</button>
      </div>
    </form>
  );
}

interface Option { id: string; label: string }

export function PaymentForm({ institutions, plans }: { institutions: Option[]; plans: Option[] }) {
  const router = useRouter();
  // One key per form submission attempt: a retry after a network error cannot create a duplicate payment.
  const key = useRef(crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setDone(null); setBusy(true);
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form).entries());
    if (!f.transactionRef) delete f.transactionRef;
    if (!f.notes) delete f.notes;
    const res = await postJson<{ replayed: boolean }>("/api/admin/payments", { ...f, idempotencyKey: key.current });
    setBusy(false);
    if (!res.ok) return setError(errText(res.data)); // keep the same key so a retry stays safe
    key.current = crypto.randomUUID();
    setDone(res.data.replayed ? "This payment was already recorded." : "Payment recorded as pending. Verify it below once the money is confirmed.");
    form.reset();
    router.refresh();
  }

  if (institutions.length === 0 || plans.length === 0) {
    return <p className="text-sm text-slate-600">Register an institute and create a plan first.</p>;
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Institute">
        <select name="institutionId" required className={inputCls}>{institutions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      </Field>
      <Field label="Plan">
        <select name="planId" required className={inputCls}>{plans.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      </Field>
      <Field label="Amount received (PKR)"><input name="amount" required inputMode="decimal" className={inputCls} /></Field>
      <Field label="Payment method">
        <select name="method" className={inputCls} defaultValue="BANK_TRANSFER">
          <option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option>
          <option value="MOBILE_WALLET">Mobile wallet</option><option value="OTHER">Other</option>
        </select>
      </Field>
      <Field label="Transaction reference" hint="Bank / wallet reference, if any"><input name="transactionRef" className={inputCls} /></Field>
      <Field label="Payment date"><input name="paidOn" type="date" required defaultValue={today} className={inputCls} /></Field>
      <div className="sm:col-span-2"><Field label="Notes"><input name="notes" className={inputCls} /></Field></div>
      <div className="space-y-3 sm:col-span-2">
        <ErrorNote message={error} />
        {done ? <p role="status" className="text-sm text-green-700">{done}</p> : null}
        <button type="submit" disabled={busy} className={btnCls}>{busy ? "Recording..." : "Record payment"}</button>
      </div>
    </form>
  );
}

export function PaymentActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "verify" | "reject") {
    let body: Record<string, string> = {};
    if (kind === "verify") {
      if (!window.confirm("Confirm you have checked that this money was actually received. This extends the institute's subscription and issues a receipt.")) return;
    } else {
      const reason = window.prompt("Why is this payment being rejected?");
      if (!reason?.trim()) return;
      body = { reason };
    }
    setBusy(true); setError(null);
    const res = await postJson(`/api/admin/payments/${id}/${kind}`, body);
    setBusy(false);
    if (!res.ok) return setError(errText(res.data));
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => act("verify")} className="rounded-md bg-ok-600 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60">Verify</button>
        <button type="button" disabled={busy} onClick={() => act("reject")} className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60">Reject</button>
      </div>
      {error ? <span role="alert" className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
