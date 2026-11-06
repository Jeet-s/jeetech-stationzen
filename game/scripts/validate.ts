/// <reference types="node" />
/**
 * Level validation (QA runs `npm run validate`). For EVERY level, through the real engine (src/game/engine.ts via
 * the Sim):
 *   1. PROOF — replay the stored winning plan (src/game/solutions.json, found by BFS or guided search in
 *      scripts/solve.ts); it must end in a win, and the level must not start won.
 *   2. AHA — the level's tempting wrong plan (spec.trap) must LOSE.
 *   3. DIFFICULTY — how hard the level is for a player, from two measurements on the real engine:
 *      (a) the casual bot playtester's first-try win rate (scripts/bots.ts, the same persona, trials and seeding as
 *          `npm run playtest`), and (b) a noisy guided search (greedy on the network's service, 30% random edits, its
 *          own seeded RNG, 80 runs) — how rarely the plan is stumbled on;
 *      difficulty = rules in play × √(moves in the proof) × (−ln(casual win rate) + ¼·(−ln(search success)) + 0.05).
 *      Richer boards (more rules to read), longer plans and plans players rarely find score higher.
 * Final stdout line (JSON): {"levels": N, "solvable": N, "difficulty": [d1..dN]}. Exit 1 if anything fails.
 */
import { LEVELS } from "../src/game/levels";
import { sim } from "../src/game/sim";
import { planToMoves, replay } from "../src/game/solver";
import { SOLUTIONS } from "../src/game/solutions";
import { mechanicsOf } from "../src/game/describe";
import { winRate } from "./bots";

const RUNS = 80;
let seed = 0;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};

function searchSuccess(i: number): number {
  seed = 0x5eed + i * 7919;
  let wins = 0;
  for (let r = 0; r < RUNS; r++) {
    let s = sim.start(i);
    for (let n = 0; n < 300 && sim.status(s) === "playing"; n++) {
      const ms = sim.moves(s);
      let pick = ms[Math.floor(rand() * ms.length)];
      if (rand() > 0.3) {
        let best = -Infinity;
        for (const m of ms) {
          const t = sim.apply(s, m);
          const v = sim.status(t) === "won" ? Infinity : sim.progress(t) + rand() * 1e-6;
          if (v > best) { best = v; pick = m; }
        }
      }
      s = sim.apply(s, pick);
    }
    if (sim.status(s) === "won") wins++;
  }
  return Math.max(wins, 0.5) / RUNS;
}

const difficulty: number[] = [];
const problems: string[] = [];
let solvable = 0;
for (let i = 0; i < LEVELS.length; i++) {
  const L = LEVELS[i];
  const n = i + 1;
  const sol = SOLUTIONS[String(n)];
  let ok = false;
  if (!sol) problems.push(`L${n}: no stored solution — run scripts/solve.ts`);
  else {
    try {
      if (sim.status(sim.start(i)) !== "playing") throw new Error("starts finished");
      const end = replay(i, sol.moves);
      ok = sim.status(end) === "won";
      if (!ok) problems.push(`L${n}: stored plan does not win (delivered ${end.dl}/${L.goal})`);
    } catch (e) {
      problems.push(`L${n}: ${(e as Error).message}`);
    }
  }
  if (ok && L.spec.trap) {
    let t = planToMoves(i, L.spec.trap).end;
    while (sim.status(t) === "playing") t = sim.apply(t, sim.moves(t).includes("g") ? "g" : sim.moves(t)[0]);
    if (sim.status(t) === "won") { ok = false; problems.push(`L${n}: the tempting wrong plan wins — the level's aha isn't forced`); }
  }
  if (ok) solvable++;
  const p = searchSuccess(i);
  const casual = Math.max(0.01, winRate(sim, sim.start(i), "casual", Number(process.env.PLAYTEST_TRIALS ?? 150)).rate);
  const d = mechanicsOf(L, true).length * Math.sqrt(sol?.moves.length ?? 1) * (-Math.log(casual) - 0.25 * Math.log(p) + 0.05);
  difficulty.push(Number(d.toFixed(3)));
  console.log(`L${n} ${L.spec.name.padEnd(24)} ${ok ? "ok " : "BAD"} proof ${sol?.moves.length ?? "-"} moves · search ${(p * 100).toFixed(0)}% · casual ${(casual * 100).toFixed(0)}% · difficulty ${d.toFixed(2)}`);
}
for (const p of problems) console.log(p);
console.log(JSON.stringify({ levels: LEVELS.length, solvable, difficulty }));
process.exit(solvable === LEVELS.length && LEVELS.length >= 30 ? 0 : 1);
