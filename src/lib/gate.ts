// Pure decision logic for a Smart Gate scan. The API route loads the facts from the
// database inside a transaction, calls this, then persists the outcome.

export type Direction = "ENTRY" | "EXIT";

export type RejectReason =
  | "INVALID_TOKEN"
  | "REVOKED_TOKEN"
  | "INACTIVE_STUDENT"
  | "INACTIVE_DEVICE"
  | "DUPLICATE_SCAN"
  | "ALREADY_INSIDE"
  | "NOT_INSIDE";

export interface ScanFacts {
  tokenFound: boolean;
  tokenRevoked: boolean;
  studentActive: boolean;
  deviceActive: boolean;
  direction: Direction;
  /** True when this clientScanId was already recorded (offline replay or retry). */
  alreadyProcessed: boolean;
  /** Most recent accepted gate event for this student today, if any. */
  lastEvent: { direction: Direction; at: Date } | null;
  now: Date;
  duplicateWindowSeconds?: number;
  /** Computed by the caller from the institute's local time and school start. */
  isLate?: boolean;
  hasAttendanceToday: boolean;
}

export type ScanDecision =
  | { accepted: true; replay: boolean; markAttendance: null | "PRESENT" | "LATE" }
  | { accepted: false; reason: RejectReason };

export function decideScan(f: ScanFacts): ScanDecision {
  // A replayed offline scan is reported as success but must never write again.
  if (f.alreadyProcessed) return { accepted: true, replay: true, markAttendance: null };

  if (!f.tokenFound) return { accepted: false, reason: "INVALID_TOKEN" };
  if (f.tokenRevoked) return { accepted: false, reason: "REVOKED_TOKEN" };
  if (!f.studentActive) return { accepted: false, reason: "INACTIVE_STUDENT" };
  if (!f.deviceActive) return { accepted: false, reason: "INACTIVE_DEVICE" };

  const windowMs = (f.duplicateWindowSeconds ?? 60) * 1000;
  if (f.lastEvent && f.lastEvent.direction === f.direction && f.now.getTime() - f.lastEvent.at.getTime() < windowMs) {
    return { accepted: false, reason: "DUPLICATE_SCAN" };
  }

  const inside = f.lastEvent?.direction === "ENTRY";
  if (f.direction === "ENTRY" && inside) return { accepted: false, reason: "ALREADY_INSIDE" };
  if (f.direction === "EXIT" && !inside) return { accepted: false, reason: "NOT_INSIDE" };

  // Only the first accepted entry of the day creates attendance; later scans never duplicate it.
  const markAttendance = f.direction === "ENTRY" && !f.hasAttendanceToday ? (f.isLate ? "LATE" : "PRESENT") : null;
  return { accepted: true, replay: false, markAttendance };
}
