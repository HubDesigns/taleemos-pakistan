import { describe, expect, it } from "vitest";
import { computeExpiry, effectiveStatus, hasAccess, renewalStart } from "@/lib/subscription";

const d = (s: string) => new Date(s);

describe("subscription expiry", () => {
  it("adds calendar months per plan", () => {
    expect(computeExpiry(d("2026-01-15T00:00:00Z"), "MONTHLY").toISOString()).toBe("2026-02-15T00:00:00.000Z");
    expect(computeExpiry(d("2026-01-15T00:00:00Z"), "QUARTERLY").toISOString()).toBe("2026-04-15T00:00:00.000Z");
    expect(computeExpiry(d("2026-01-15T00:00:00Z"), "SIX_MONTH").toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(computeExpiry(d("2026-01-15T00:00:00Z"), "ANNUAL").toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("clamps month-end dates", () => {
    expect(computeExpiry(d("2026-01-31T00:00:00Z"), "MONTHLY").toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(computeExpiry(d("2028-01-31T00:00:00Z"), "MONTHLY").toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("trial and custom plans need explicit days", () => {
    expect(computeExpiry(d("2026-01-01T00:00:00Z"), "TRIAL", 14).toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(() => computeExpiry(d("2026-01-01T00:00:00Z"), "CUSTOM")).toThrow();
  });

  it("renewal extends from current expiry when still valid, else from now", () => {
    const now = d("2026-03-01T00:00:00Z");
    expect(renewalStart(d("2026-03-10T00:00:00Z"), now)).toEqual(d("2026-03-10T00:00:00Z"));
    expect(renewalStart(d("2026-02-01T00:00:00Z"), now)).toEqual(now);
    expect(renewalStart(null, now)).toEqual(now);
  });
});

describe("subscription status and access", () => {
  const base = { stored: "ACTIVE" as const, isTrial: false, graceDays: 7 };

  it("flags expiring soon and expired", () => {
    expect(effectiveStatus({ ...base, expiresAt: d("2026-06-30T00:00:00Z"), now: d("2026-03-01T00:00:00Z") })).toBe("ACTIVE");
    expect(effectiveStatus({ ...base, expiresAt: d("2026-03-05T00:00:00Z"), now: d("2026-03-01T00:00:00Z") })).toBe("EXPIRING_SOON");
    expect(effectiveStatus({ ...base, expiresAt: d("2026-02-28T00:00:00Z"), now: d("2026-03-01T00:00:00Z") })).toBe("EXPIRED");
    expect(effectiveStatus({ ...base, isTrial: true, expiresAt: d("2026-06-30T00:00:00Z"), now: d("2026-03-01T00:00:00Z") })).toBe("TRIAL");
  });

  it("grace period keeps access briefly, then backend denies", () => {
    const expiresAt = d("2026-03-01T00:00:00Z");
    expect(hasAccess({ ...base, expiresAt, now: d("2026-03-05T00:00:00Z") })).toBe(true);
    expect(hasAccess({ ...base, expiresAt, now: d("2026-03-09T00:00:00Z") })).toBe(false);
  });

  it("suspension always blocks access regardless of dates", () => {
    expect(hasAccess({ ...base, stored: "SUSPENDED", expiresAt: d("2030-01-01T00:00:00Z"), now: d("2026-03-01T00:00:00Z") })).toBe(false);
    expect(hasAccess({ ...base, stored: "CANCELLED", expiresAt: d("2030-01-01T00:00:00Z"), now: d("2026-03-01T00:00:00Z") })).toBe(false);
  });
});
