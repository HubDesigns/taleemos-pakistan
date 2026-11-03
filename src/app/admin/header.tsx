import Link from "next/link";
import { LogoutButton } from "@/components/ui";

export function AdminHeader({ current }: { current: "dashboard" | "billing" }) {
  const link = (href: string, label: string, key: string) => (
    <Link href={href} aria-current={current === key ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 text-sm ${current === key ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}>
      {label}
    </Link>
  );
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-brand-700">TaleemOS <span className="text-slate-500">Super Admin</span></span>
          <nav aria-label="Main" className="flex gap-1">
            {link("/admin", "Dashboard", "dashboard")}
            {link("/admin/billing", "Billing", "billing")}
          </nav>
        </div>
        <LogoutButton />
      </div>
    </header>
  );
}
