// Deterministic, configurable grading. Bands are supplied per institute.

export interface GradeBand {
  grade: string;
  minPercent: number; // inclusive
}

export const DEFAULT_BANDS: readonly GradeBand[] = [
  { grade: "A+", minPercent: 80 },
  { grade: "A", minPercent: 70 },
  { grade: "B", minPercent: 60 },
  { grade: "C", minPercent: 50 },
  { grade: "D", minPercent: 40 },
  { grade: "F", minPercent: 0 },
];

export function percentage(obtained: number, total: number): number {
  if (!Number.isFinite(obtained) || !Number.isFinite(total)) throw new Error("Marks must be finite numbers");
  if (total <= 0) throw new Error("Total marks must be greater than zero");
  if (obtained < 0 || obtained > total) throw new Error("Obtained marks must be between 0 and total marks");
  return Math.round((obtained / total) * 10000) / 100; // 2 decimals, half-up
}

export function gradeFor(percent: number, bands: readonly GradeBand[] = DEFAULT_BANDS): string {
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  const hit = sorted.find((b) => percent >= b.minPercent);
  if (!hit) throw new Error("Grade bands do not cover this percentage");
  return hit.grade;
}

export function isPass(percent: number, passPercent = 40): boolean {
  return percent >= passPercent;
}
