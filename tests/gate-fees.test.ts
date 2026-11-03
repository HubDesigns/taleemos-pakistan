import { describe, expect, it } from "vitest";
import { decideScan, type ScanFacts } from "@/lib/gate";
import { allocatePayment } from "@/lib/fees";

const now = new Date("2026-11-02T03:00:00Z");
const base: ScanFacts = {
  tokenFound: true, tokenRevoked: false, studentActive: true, deviceActive: true,
  direction: "ENTRY", alreadyProcessed: false, lastEvent: null, now, hasAttendanceToday: false,
};

describe("smart gate decisions", () => {
  it("first entry marks attendance (late when flagged)", () => {
    expect(decideScan(base)).toEqual({ accepted: true, replay: false, markAttendance: "PRESENT" });
    expect(decideScan({ ...base, isLate: true })).toEqual({ accepted: true, replay: false, markAttendance: "LATE" });
  });

  it("rejects unknown, revoked, inactive student and inactive device", () => {
    expect(decideScan({ ...base, tokenFound: false })).toEqual({ accepted: false, reason: "INVALID_TOKEN" });
    expect(decideScan({ ...base, tokenRevoked: true })).toEqual({ accepted: false, reason: "REVOKED_TOKEN" });
    expect(decideScan({ ...base, studentActive: false })).toEqual({ accepted: false, reason: "INACTIVE_STUDENT" });
    expect(decideScan({ ...base, deviceActive: false })).toEqual({ accepted: false, reason: "INACTIVE_DEVICE" });
  });

  it("rapid double scan is a duplicate and creates nothing", () => {
    const last = { direction: "ENTRY" as const, at: new Date(now.getTime() - 5000) };
    expect(decideScan({ ...base, lastEvent: last })).toEqual({ accepted: false, reason: "DUPLICATE_SCAN" });
  });

  it("enforces entry/exit order", () => {
    const longAgo = new Date(now.getTime() - 3_600_000);
    expect(decideScan({ ...base, lastEvent: { direction: "ENTRY", at: longAgo } })).toEqual({ accepted: false, reason: "ALREADY_INSIDE" });
    expect(decideScan({ ...base, direction: "EXIT" })).toEqual({ accepted: false, reason: "NOT_INSIDE" });
    expect(decideScan({ ...base, direction: "EXIT", lastEvent: { direction: "ENTRY", at: longAgo } }))
      .toEqual({ accepted: true, replay: false, markAttendance: null });
  });

  it("re-entry the same day does not duplicate attendance", () => {
    const longAgo = new Date(now.getTime() - 3_600_000);
    expect(decideScan({ ...base, hasAttendanceToday: true, lastEvent: { direction: "EXIT", at: longAgo } }))
      .toEqual({ accepted: true, replay: false, markAttendance: null });
  });

  it("offline replay of an already-processed scan succeeds without writing again", () => {
    expect(decideScan({ ...base, alreadyProcessed: true })).toEqual({ accepted: true, replay: true, markAttendance: null });
  });
});

describe("fee payment allocation", () => {
  const inv = (id: string, due: string, outstanding: bigint) => ({ id, dueDate: new Date(due), outstanding });

  it("pays oldest invoices first and supports partial payment", () => {
    const r = allocatePayment(7000n, [inv("b", "2026-02-01", 5000n), inv("a", "2026-01-01", 5000n)]);
    expect(r.allocations).toEqual([{ invoiceId: "a", amount: 5000n }, { invoiceId: "b", amount: 2000n }]);
    expect(r.unallocated).toBe(0n);
  });

  it("keeps overpayment as unallocated credit, never dropping money", () => {
    const r = allocatePayment(9000n, [inv("a", "2026-01-01", 4000n)]);
    expect(r.allocations).toEqual([{ invoiceId: "a", amount: 4000n }]);
    expect(r.unallocated).toBe(5000n);
  });

  it("allocations plus credit always equal the payment", () => {
    const r = allocatePayment(12345n, [inv("a", "2026-01-01", 3000n), inv("b", "2026-01-01", 4000n), inv("c", "2026-03-01", 9000n)]);
    const total = r.allocations.reduce((s, a) => s + a.amount, 0n) + r.unallocated;
    expect(total).toBe(12345n);
  });

  it("rejects non-positive payments and ignores settled invoices", () => {
    expect(() => allocatePayment(0n, [])).toThrow();
    expect(allocatePayment(100n, [inv("a", "2026-01-01", 0n)])).toEqual({ allocations: [], unallocated: 100n });
  });
});
