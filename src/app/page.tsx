const pillars = [
  { title: "Isolated by design", body: "Every institute's students, fees, attendance and documents live in their own protected workspace, enforced on the server." },
  { title: "Smart Gate attendance", body: "Revocable QR identity cards with entry and exit scans that cannot create duplicate attendance." },
  { title: "Fees you can trust", body: "Exact PKR accounting with partial payments, receipts and an append-only financial history." },
  { title: "Built for Pakistan", body: "English and Urdu, PKR by default, local school calendars and Pakistani phone formats." },
];

export default function Home() {
  return (
    <main>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold text-brand-700">TaleemOS <span className="text-slate-500">Pakistan</span></span>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">In development</span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          One Platform. Every Institution. Complete Control.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-600">
          A multi-tenant education management platform for schools, colleges, academies and training institutes,
          from admissions and attendance to fees, examinations and parent portals.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-6 pb-24 sm:grid-cols-2">
        {pillars.map((p) => (
          <article key={p.title} className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <span aria-hidden className="inline-block size-2 rounded-full bg-ok-600" />
              {p.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{p.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
