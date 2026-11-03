"use client";

import { useState } from "react";
import { ErrorNote, Field, btnCls, inputCls, postJson } from "@/components/ui";

export default function ChangePasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    if (f.get("newPassword") !== f.get("confirm")) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    const res = await postJson<{ redirect?: string }>("/api/auth/change-password", {
      currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword"),
    });
    if (res.ok && res.data.redirect) {
      window.location.href = res.data.redirect;
      return;
    }
    setError(res.data.issues?.[0]?.message ?? res.data.error ?? "Could not change password.");
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
      <p className="mt-1 text-sm text-slate-600">You must replace your temporary password before continuing.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <Field label="Current (temporary) password">
          <input name="currentPassword" type="password" required autoComplete="current-password" className={inputCls} />
        </Field>
        <Field label="New password" hint="At least 12 characters.">
          <input name="newPassword" type="password" required minLength={12} autoComplete="new-password" className={inputCls} />
        </Field>
        <Field label="Confirm new password">
          <input name="confirm" type="password" required minLength={12} autoComplete="new-password" className={inputCls} />
        </Field>
        <ErrorNote message={error} />
        <button type="submit" disabled={busy} className={`${btnCls} w-full`}>{busy ? "Saving..." : "Save password"}</button>
      </form>
    </main>
  );
}
