/** Stored winning plans per level (1-based), written by scripts/solve.ts and replayed by scripts/validate.ts. */
import data from "./solutions.json";

export interface StoredSolution {
  moves: string[];
  edits: number;
  optimal: boolean;
  plan: string;
  note?: string;
  /** Outcome of the level's tempting wrong plan (spec.trap), e.g. "loses: delivered 70/111". */
  trap?: string;
  /** Stars the stored plan earns (1-3). */
  stars?: number;
  /** scripts/fairness.ts: every first move checked on the real engine (big boards the level report can't settle). */
  fair?: { first: number; winnable: number; fewest: number | null };
}
export const SOLUTIONS = data as Record<string, StoredSolution>;
