import { formatPKR, parseRupees } from "./money";

/** Format a DECIMAL string from the database (e.g. "5000.00") as "PKR 5,000.00". */
export function pkr(amount: string): string {
  try {
    return formatPKR(parseRupees(amount));
  } catch {
    return amount;
  }
}
