// Pure subscription lifecycle logic. All dates are UTC instants.

export type PlanInterval = "TRIAL" | "MONTHLY" | "QUARTERLY" | "SIX_MONTH" | "ANNUAL" | "CUSTOM";
export type SubStatus = "TRIAL" | "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "SUSPENDED" | "CANCELLED";

const DAY_MS = 86_400_000;

function addCalendarMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay)); // Jan 31 + 1 month => Feb 28/29
  return d;
}

export function computeExpiry(start: Date, interval: PlanInterval, customDays?: number): Date {
  switch (interval) {
    case "MONTHLY": return addCalendarMonths(start, 1);
    case "QUARTERLY": return addCalendarMonths(start, 3);
    case "SIX_MONTH": return addCalendarMonths(start, 6);
    case "ANNUAL": return addCalendarMonths(start, 12);
    case "TRIAL":
    case "CUSTOM": {
      if (!customDays || !Number.isInteger(customDays) || customDays <= 0) {
        throw new Error("customDays must be a positive integer for TRIAL/CUSTOM plans");
      }
      return new Date(start.getTime() + customDays * DAY_MS);
    }
  }
}

/** Renewal extends from the later of (current expiry, payment start) so no paid time is lost or double counted. */
export function renewalStart(currentExpiry: Date | null, now: Date): Date {
  return currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
}

export interface StatusInput {
  stored: SubStatus; // SUSPENDED / CANCELLED are manual and always win
  isTrial: boolean;
  expiresAt: Date;
  graceDays: number;
  now: Date;
  expiringSoonDays?: number;
}

export function effectiveStatus(i: StatusInput): SubStatus {
  if (i.stored === "SUSPENDED" || i.stored === "CANCELLED") return i.stored;
  const msLeft = i.expiresAt.getTime() - i.now.getTime();
  if (msLeft <= 0) return "EXPIRED";
  if (msLeft <= (i.expiringSoonDays ?? 7) * DAY_MS) return "EXPIRING_SOON";
  return i.isTrial ? "TRIAL" : "ACTIVE";
}

/** May the institute still use protected features? Expired subs keep access only inside the grace period. */
export function hasAccess(i: StatusInput): boolean {
  const status = effectiveStatus(i);
  if (status === "SUSPENDED" || status === "CANCELLED") return false;
  if (status !== "EXPIRED") return true;
  const graceEnd = i.expiresAt.getTime() + i.graceDays * DAY_MS;
  return i.now.getTime() < graceEnd;
}
