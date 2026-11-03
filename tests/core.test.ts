import { describe, expect, it } from "vitest";
import { gradeFor, isPass, percentage } from "@/lib/grading";
import { formatPKR, outstanding, parseRupees } from "@/lib/money";
import { generateTemporaryPassword, generateToken, hashToken, tokenMatchesHash } from "@/lib/tokens";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("grading", () => {
  it("computes percentages deterministically", () => {
    expect(percentage(45, 60)).toBe(75);
    expect(percentage(1, 3)).toBe(33.33);
  });
  it("maps percentages to grade bands at the boundaries", () => {
    expect(gradeFor(80)).toBe("A+");
    expect(gradeFor(79.99)).toBe("A");
    expect(gradeFor(39.99)).toBe("F");
    expect(gradeFor(0)).toBe("F");
  });
  it("supports custom bands and rejects invalid marks", () => {
    expect(gradeFor(55, [{ grade: "Pass", minPercent: 50 }, { grade: "Fail", minPercent: 0 }])).toBe("Pass");
    expect(() => percentage(61, 60)).toThrow();
    expect(() => percentage(-1, 60)).toThrow();
    expect(() => percentage(1, 0)).toThrow();
    expect(isPass(40)).toBe(true);
    expect(isPass(39.99)).toBe(false);
  });
});

describe("money", () => {
  it("parses exactly without floating point error", () => {
    expect(parseRupees("0.10") + parseRupees("0.20")).toBe(parseRupees("0.30"));
    expect(parseRupees("1500")).toBe(150000n);
    expect(parseRupees("1500.5")).toBe(150050n);
  });
  it("rejects malformed amounts", () => {
    for (const bad of ["", "-5", "1.234", "abc", "1,000", "1e3"]) expect(() => parseRupees(bad)).toThrow();
  });
  it("formats PKR and computes outstanding balance", () => {
    expect(formatPKR(123456789n)).toBe("PKR 1,234,567.89");
    expect(outstanding(parseRupees("5000"), parseRupees("1500"))).toBe(parseRupees("3500"));
    expect(outstanding(parseRupees("5000"), parseRupees("6000"))).toBe(0n);
  });
});

describe("tokens and passwords", () => {
  it("generates unique opaque tokens and stores only hashes", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a)).not.toContain(a);
    expect(tokenMatchesHash(a, hashToken(a))).toBe(true);
    expect(tokenMatchesHash(b, hashToken(a))).toBe(false);
  });
  it("temporary passwords are random and long enough", () => {
    const a = generateTemporaryPassword();
    expect(a).toHaveLength(16);
    expect(a).not.toBe(generateTemporaryPassword());
  });
  it("hashes passwords one-way with argon2id and verifies correctly", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong password here")).toBe(false);
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
    await expect(hashPassword("short")).rejects.toThrow();
  });
});
