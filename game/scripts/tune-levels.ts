/// <reference types="node" />
/**
 * Level pacing tuner. The maps and their ideas are handcrafted (src/game/chapters); this only sets each level's
 * GOAL (share of riders to deliver) and, if needed, its demand SCALE, so the casual bot's first-try win rate follows
 * the plan's sawtooth (scripts/targets.ts): teach levels easy, a boss every 6 levels, a breather after it, the last
 * third genuinely hard. It measures with the SAME bots, trial count and seeding as `npm run playtest`, so
 * tuned = tested. Guards: the level's tempting wrong plan (spec.trap) must still lose, and the level must still be
 * solvable (BFS, else guided search).
 *   npx tsx scripts/tune-levels.ts [from to]   (1-based, inclusive)  OUT=file.json to write elsewhere (parallel runs)
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { compileLevel, type LevelSpec } from "../src/game/engine";
import { LEVELS, SPECS } from "../src/game/levels";
import { sim } from "../src/game/sim";
import { bfs, planToMoves, rollouts } from "../src/game/solver";
import { winRate } from "./bots";
import { target as planTarget } from "./targets";

const TRIALS = Number(process.env.PLAYTEST_TRIALS ?? 150);
/** Goals above this read as razor-thin ("deliver 412 of 420"); tighter levels get more riders (scale) instead. */
const MAX_GOAL = 0.92;
const N = SPECS.length;
const target = (n: number) => planTarget(n, SPECS[n - 1].role);
const file = process.env.OUT ?? path.join(__dirname, "../src/game/tuning.json");
const tuning = (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {}) as Record<string, Partial<LevelSpec>>;

function withLevel<T>(i: number, patch: Partial<LevelSpec>, f: () => T): T {
  const orig = LEVELS[i];
  LEVELS[i] = compileLevel({ ...SPECS[i], ...patch }, i);
  try { return f(); } finally { LEVELS[i] = orig; }
}

/** Lowest goal share at which the trap plan loses (it may lose on a full ring at any goal). */
function trapFloor(i: number, scale: number): number {
  const spec = SPECS[i];
  if (!spec.trap) return 0;
  return withLevel(i, { scale, goal: 0.0001 }, () => {
    let s = planToMoves(i, spec.trap!).end;
    while (sim.status(s) === "playing") s = sim.apply(s, sim.moves(s).includes("g") ? "g" : sim.moves(s)[0]);
    if (s.over === 2) return 0; // lost on rings: the trap loses whatever the goal
    // a trap that misses the goal by a rider or two reads as a knife edge: it must fall ≥ 8% short
    return Math.min(0.99, Math.ceil(((s.dl + 1) / 0.92 / LEVELS[i].total) * 100) / 100);
  });
}

function solvable(i: number, patch: Partial<LevelSpec>): boolean {
  return withLevel(i, patch, () => {
    const plan = SPECS[i].plan;
    if (plan) {
      // the intended plan (the aha) must itself win at this goal/scale
      try {
        let end = planToMoves(i, plan).end;
        while (sim.status(end) === "playing" && sim.moves(end).includes("g")) end = sim.apply(end, "g");
        // …with room to spare (≥ 5% over the goal), so the proof isn't a precision test
        return sim.status(end) === "won" && end.dl >= LEVELS[i].goal * 1.05;
      } catch { return false; }
    }
    const r = bfs(i, 40_000);
    if (r) return r.explored >= 0;
    return rollouts(i, 1500) !== null;
  });
}

const [from, to] = [Number(process.argv[2] ?? 1), Number(process.argv[3] ?? N)];
for (let n = from; n <= to; n++) {
  const i = n - 1;
  const spec = SPECS[i];
  const want = target(n);
  const late = n > (N * 2) / 3;
  const lo = spec.noFail ? 0.5 : 0.7;
  type Cand = { goal: number; scale: number; casual: number; skilled: number; cost: number };
  const cands: Cand[] = [];
  const score = (c: Omit<Cand, "cost">) =>
    Math.abs(c.casual - want) +
    (late && (c.skilled < 0.55 || c.skilled > 0.95) ? 0.1 : 0) +
    (c.skilled < c.casual ? 0.05 : 0) +
    (c.scale !== 1 ? 0.015 : 0) +
    // "deliver 410 of 450" reads as a razor margin: prefer more riders at an easier share
    Math.max(0, c.goal - 0.88) * 0.5;
  for (const scale of (process.env.SCALES ?? "1,0.85,1.2,1.4,0.7").split(",").map(Number)) {
    const floor = trapFloor(i, scale);
    const start = Math.max(lo, floor);
    if (start > MAX_GOAL) continue;
    const goals: number[] = [];
    for (let g = start; g <= MAX_GOAL + 0.001; g += 0.03) goals.push(Number(g.toFixed(2)));
    for (const goal of goals) {
      const casual = withLevel(i, { goal, scale }, () => winRate(sim, sim.start(i), "casual", TRIALS).rate);
      cands.push({ goal, scale, casual, skilled: -1, cost: Infinity });
    }
    // skilled only for the few nearest the target
    const near = cands.filter((c) => c.scale === scale).sort((a, b) => Math.abs(a.casual - want) - Math.abs(b.casual - want)).slice(0, 3);
    for (const c of near) {
      c.skilled = withLevel(i, { goal: c.goal, scale }, () => winRate(sim, sim.start(i), "skilled", TRIALS).rate);
      c.cost = score(c);
    }
    const best = Math.min(...cands.map((c) => c.cost));
    if (best < 0.04) break; // close enough: keep the designed demand
  }
  const ranked = cands.filter((c) => c.cost < Infinity).sort((a, b) => a.cost - b.cost);
  let chosen: Cand | null = null;
  for (const c of ranked.slice(0, 6)) {
    if (solvable(i, { goal: c.goal, scale: c.scale })) { chosen = c; break; }
  }
  if (!chosen) {
    console.log(`L${n} ${spec.name}: NO solvable candidate near target — keeping the designed goal`);
    continue;
  }
  tuning[String(n)] = chosen.scale === 1 ? { goal: chosen.goal } : { goal: chosen.goal, scale: chosen.scale };
  console.log(
    `L${n} ${spec.name} [${spec.role}] target ${want.toFixed(2)} → goal ${chosen.goal}${chosen.scale !== 1 ? ` scale ${chosen.scale}` : ""} ` +
      `casual ${chosen.casual.toFixed(2)} skilled ${chosen.skilled.toFixed(2)}${chosen.cost > 0.08 ? "  ⚠ off target" : ""}`,
  );
  writeFileSync(file, JSON.stringify(tuning, null, 0).replace(/\},"/g, '},\n"'));
}
