"use client";

import { useState } from "react";

export const inputCls =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100";
export const btnCls =
  "inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
      {hint ? <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
  ) : null;
}

export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; issues?: { path: string; message: string }[] } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
      onClick={async () => {
        setBusy(true);
        await postJson("/api/auth/logout", {});
        window.location.href = "/login";
      }}
    >
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}
