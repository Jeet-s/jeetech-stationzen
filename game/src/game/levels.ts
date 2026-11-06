/**
 * The campaign: 10 cities × 12 levels, handcrafted in src/game/chapters/*.ts (plan: docs/LEVELS.md).
 * tuning.json (written by scripts/tune-levels.ts after measuring with the bot playtesters) may override a level's
 * goal share / weeks so the first-try win-rate curve follows the plan; the map and its idea never change.
 */
import { compileLevel, type Level, type LevelSpec } from "./engine";
import { CHAPTERS, type Chapter } from "./chapters";
import tuning from "./tuning.json";

export type { Chapter };
export { CHAPTERS };

type Tune = Partial<Pick<LevelSpec, "goal" | "weeks" | "grace" | "scale">>;
const TUNE = tuning as Record<string, Tune>;

export const SPECS: (LevelSpec & { chapter: number })[] = CHAPTERS.flatMap((c, ci) => c.levels.map((l) => ({ ...l, chapter: ci })));

export const LEVELS: Level[] = SPECS.map((spec, i) => compileLevel({ ...spec, ...(TUNE[String(i + 1)] ?? {}) }, i));

export const chapterOf = (index: number) => CHAPTERS[SPECS[index].chapter];

/** Resolve "c.s" (chapter c, level s, both 1-based) or a plain global 1-based number → global 1-based number. */
export function resolveLevel(arg: string): number {
  const m = /^(\d+)\.(\d+)$/.exec(arg);
  if (!m) return Number(arg);
  let n = 0;
  for (let c = 0; c < Number(m[1]) - 1; c++) n += CHAPTERS[c].levels.length;
  return n + Number(m[2]);
}
