import argon2 from "argon2";

// argon2id with OWASP-recommended minimum parameters. Hashing is one-way:
// there is intentionally no function that can recover a plaintext password.
const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 12) throw new Error("Password must be at least 12 characters");
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
