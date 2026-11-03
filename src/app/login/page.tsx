"use client";

import { useState } from "react";
import { ErrorNote, Field, btnCls, inputCls, postJson } from "@/components/ui";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const res = await postJson<{ redirect?: string }>("/api/auth/login", {
      email: f.get("email"), password: f.get("password"), institutionSlug: f.get("institutionSlug") || undefined,
    });
    if (res.ok && res.data.redirect) {
      window.location.href = res.data.redirect;
      return;
    }
    setError(res.data.error ?? "Sign-in failed. Please try again.");
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold text-slate-900">Sign in to TaleemOS</h1>
      <p className="mt-1 text-sm text-slate-600">Platform operators leave the institute code empty.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <Field label="Institute code" hint="The short code your institute was registered with, e.g. greenfield-school">
          <input name="institutionSlug" autoComplete="organization" className={inputCls} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" required autoComplete="username" className={inputCls} />
        </Field>
        <Field label="Password">
          <input name="password" type="password" required autoComplete="current-password" className={inputCls} />
        </Field>
        <ErrorNote message={error} />
        <button type="submit" disabled={busy} className={`${btnCls} w-full`}>{busy ? "Signing in..." : "Sign in"}</button>
      </form>
    </main>
  );
}
