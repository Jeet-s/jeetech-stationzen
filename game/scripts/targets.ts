/** The pacing plan: target casual first-try win rate per level (1-based), by position and role (docs/LEVELS.md). */
import type { Role } from "../src/game/engine";

export const PLAN_LEVELS = 120;
const OFFSET: Record<Role, number> = {
  teach: 0.12, practise: 0, twist: -0.03, combine: -0.05, boss: -0.06, breather: 0.16, mastery: 0.2, finale: -0.08,
};
/** Rest stops shrink as the campaign goes on: a late breather is a breather against ~55% neighbours, not a free win
 * (the difficulty curve must keep rising: validate's late/early ratio and trend). */
const LATE_SHRINK: Partial<Record<Role, number>> = { teach: 0.5, breather: 0.55, mastery: 0.45 };
/** Hand-set targets where the review asked for a specific feel (e.g. more slack so skill pays off). */
const OVERRIDE: Record<number, number> = { 47: 0.7, 53: 0.72, 88: 0.72, 102: 0.56, 107: 0.58, 120: 0.5 };
export function target(n: number, role: Role): number {
  if (n <= 3) return 0.9;
  if (OVERRIDE[n] != null) return OVERRIDE[n];
  const t = (n - 1) / (PLAN_LEVELS - 1);
  const base = 0.88 - 0.36 * t;
  const shrink = n > 30 ? 1 - (LATE_SHRINK[role] ?? 0) * Math.min(1, (n - 30) / 60) : 1;
  return Math.max(0.4, Math.min(0.92, base + OFFSET[role] * (OFFSET[role] > 0 ? shrink : 1)));
}
