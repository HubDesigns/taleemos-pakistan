/** Pakistani phone numbers: mobile (03XX-XXXXXXX / +92 3XX XXXXXXX) or landline (0AA-XXXXXXX). Returns E.164-style or null. */
export function normalizePkPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, "");
  const mobile = /^(?:\+92|0092|0)(3\d{9})$/.exec(digits);
  if (mobile) return `+92${mobile[1]}`;
  const landline = /^(?:\+92|0092|0)([1-9]\d{8,9})$/.exec(digits);
  if (landline && !landline[1]!.startsWith("3")) return `+92${landline[1]}`;
  return null;
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
