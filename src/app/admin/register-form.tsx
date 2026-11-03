"use client";

import { useState } from "react";
import { ErrorNote, Field, btnCls, inputCls, postJson } from "@/components/ui";

interface Created {
  institution: { name: string; slug: string };
  admin: { email: string };
  temporaryPassword: string;
  trialExpiresAt: string;
  invitation: string;
}

export function RegisterInstitutionForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form).entries());
    const res = await postJson<Created>("/api/admin/institutions", f);
    setBusy(false);
    if (!res.ok) {
      setError(res.data.issues?.map((i) => `${i.path}: ${i.message}`).join("; ") ?? res.data.error ?? "Registration failed.");
      return;
    }
    setCreated(res.data as Created);
    form.reset();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">Register an institute</h2>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Institute name"><input name="name" required className={inputCls} /></Field>
        <Field label="Institute code" hint="Lowercase letters, digits, hyphens. Used at sign-in."><input name="slug" required className={inputCls} /></Field>
        <Field label="Institute type">
          <select name="type" className={inputCls} defaultValue="SCHOOL">
            {["SCHOOL", "COLLEGE", "ACADEMY", "TUITION_CENTER", "VOCATIONAL", "TRAINING", "OTHER"].map((t) => (
              <option key={t} value={t}>{t.replace("_", " ").toLowerCase()}</option>
            ))}
          </select>
        </Field>
        <Field label="Official email"><input name="email" type="email" required className={inputCls} /></Field>
        <Field label="Phone" hint="e.g. 0300 1234567"><input name="phone" className={inputCls} /></Field>
        <Field label="City"><input name="city" className={inputCls} /></Field>
        <Field label="Owner / administrator name"><input name="adminName" required className={inputCls} /></Field>
        <Field label="Administrator email"><input name="adminEmail" type="email" required className={inputCls} /></Field>
        <div className="space-y-3 sm:col-span-2">
          <ErrorNote message={error} />
          <button type="submit" disabled={busy} className={btnCls}>{busy ? "Registering..." : "Register institute"}</button>
        </div>
      </form>

      {created ? (
        <div role="status" className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-slate-800">
          <p className="font-semibold text-green-800">{created.institution.name} was registered.</p>
          <p className="mt-2">Institute code: <code className="font-mono">{created.institution.slug}</code></p>
          <p>Administrator: {created.admin.email}</p>
          <p>
            Temporary password: <code className="rounded bg-white px-1.5 py-0.5 font-mono">{created.temporaryPassword}</code>
          </p>
          <p className="mt-2 text-xs text-slate-600">
            Shown only once and not stored in readable form. No email was sent (email delivery is not configured), so give these
            details to the administrator securely. They must change the password at first sign-in. Trial ends{" "}
            {new Date(created.trialExpiresAt).toLocaleDateString("en-PK")}.
          </p>
        </div>
      ) : null}
    </section>
  );
}
