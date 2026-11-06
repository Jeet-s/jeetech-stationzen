/// <reference types="node" />
/**
 * Level designer's bench: measure single levels on the real engine.
 *   npx tsx scripts/rate.ts 3 7 12      (1-based level numbers; default all)
 * Prints solver facts (BFS optimal within RATE_CAP states, start choices) and bot first-try win rates.
 */
import { sim } from "../src/game/sim";
import { winRate } from "./bots";
import { LEVELS, SPECS, resolveLevel } from "../src/game/levels";
import { compileLevel } from "../src/game/engine";
import { target } from "./targets";

const CAP = Number(process.env.RATE_CAP ?? 60_000);
const TRIALS = Number(process.env.TRIALS ?? 150);
const skip = (k: string, v: unknown) => (k === "level" || k === "moves" ? undefined : v);
const keyOf = (s: unknown) => JSON.stringify(s, skip);

function bfs(i: number) {
  const start = sim.start(i);
  const seen = new Map<string, string[]>([[keyOf(start), []]]);
  let frontier: [typeof start, string[]][] = [[start, []]];
  for (let d = 1; frontier.length && seen.size < CAP; d++) {
    const next: typeof frontier = [];
    for (const [s, path] of frontier) {
      for (const m of sim.moves(s)) {
        if (m === "u") continue;
        const t = sim.apply(s, m);
        const st = sim.status(t);
        if (st === "won") return { optimal: d, explored: seen.size, path: [...path, m] };
        const k = keyOf(t);
        if (st === "lost" || seen.has(k)) continue;
        seen.set(k, []);
        next.push([t, [...path, m]]);
      }
    }
    frontier = next;
  }
  return { optimal: null as number | null, explored: seen.size, path: [] as string[] };
}

const pick = process.argv.slice(2).map(resolveLevel).filter(Boolean);
const list = pick.length ? pick : LEVELS.map((_, i) => i + 1);
for (const n of list) {
  const i = n - 1;
  const L = LEVELS[i];
  const t0 = Date.now();
  const b = process.env.NOBFS ? { optimal: null, explored: 0, path: [] } : bfs(i);
  const r = (p: "skilled" | "casual" | "careless") => winRate(sim, sim.start(i), p, TRIALS).rate;
  if (process.env.SCAN) {
    // casual / skilled first-try win rate at several goal shares (what the tuner can reach)
    const orig = LEVELS[i];
    const row: string[] = [];
    for (const g of [0.7, 0.75, 0.8, 0.85, 0.9, 0.95]) {
      LEVELS[i] = compileLevel({ ...SPECS[i], goal: g }, i);
      row.push(`${g}:${r("casual").toFixed(2)}/${r("skilled").toFixed(2)}`);
    }
    LEVELS[i] = orig;
    console.log(`L${n} ${L.spec.name} [${L.spec.role}] target casual ${target(n, L.spec.role).toFixed(2)} | goal:casual/skilled ${row.join(" ")}`);
    continue;
  }
  const sk = r("skilled"), ca = r("casual"), cl = r("careless");
  console.log(
    `L${n} ${L.spec.name} [${L.spec.role}] target ${target(n, L.spec.role).toFixed(2)} st=${L.stations.length} total=${L.total} goal=${L.goal} | opt ${b.optimal ?? ">cap"} expl ${b.explored} br ${sim.moves(sim.start(i)).length} | ` +
      `skilled ${sk.toFixed(2)} casual ${ca.toFixed(2)} careless ${cl.toFixed(2)} | ${Date.now() - t0}ms ${b.path.join(" ")}`,
  );
}
