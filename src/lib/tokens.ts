import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Opaque random token (256 bits). Used for sessions, reset links and QR identities. Carries no personal data. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the hash is stored, so a database leak does not expose usable tokens. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatchesHash(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Temporary credential for admin-assisted recovery: shown once, must be changed at next login. */
export function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}
