// Money is handled as integer paisa (bigint) in application code; the database uses DECIMAL(12,2).

const DECIMAL_RE = /^\d{1,12}(\.\d{1,2})?$/;

export function parseRupees(input: string): bigint {
  const s = input.trim();
  if (!DECIMAL_RE.test(s)) throw new Error("Invalid amount: use digits with at most 2 decimals");
  const [whole = "0", frac = ""] = s.split(".");
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
}

export function formatPKR(paisa: bigint): string {
  const negative = paisa < 0n;
  const abs = negative ? -paisa : paisa;
  const rupees = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}PKR ${rupees}.${cents}`;
}

/** Outstanding balance after payments; never negative (overpayment is a separate credit concept). */
export function outstanding(invoiced: bigint, paid: bigint): bigint {
  const diff = invoiced - paid;
  return diff > 0n ? diff : 0n;
}
