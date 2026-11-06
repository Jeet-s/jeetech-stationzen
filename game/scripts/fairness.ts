/// <reference types="node" />
/**
 * Fairness proof for big boards, stored in src/game/solutions.json ("fair") and quoted by describe().
 * The factory's level report settles the trap rate with a small breadth-first search (10k states per first move), so
 * on a big board it prints "trap rate ?". This checks EVERY first move a player can make on the real engine:
 *   - breadth-first search first (same as the report, bigger cap);
 *   - if the board is too big, guided rollouts from that position until one wins (a constructive proof);
 * and a deeper breadth-first search for the fewest moves to win from the start.
 *   npx tsx scripts/fairness.ts <n …>        (1-based levels)   FAIR_CAP=… DEEP_CAP=…
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { sim, type SimState } from "../src/game/sim";
import { keyOf } from "../src/game/solver";

const FAIR_CAP = Number(process.env.FAIR_CAP ?? 20_000);
const DEEP_CAP = Number(process.env.DEEP_CAP ?? 200_000);
const file = path.join(__dirname, "../src/game/solutions.json");
const out = JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, unknown>>;

function shortest(from: SimState, cap: number): { optimal: number | null; capped: boolean } {
  if (sim.status(from) === "won") return { optimal: 0, capped: false };
  const seen = new Set([keyOf(from)]);
  let frontier = [from];
  for (let depth = 1; frontier.length && seen.size < cap; depth++) {
    const next: SimState[] = [];
    for (const s of frontier) {
      if (sim.status(s) !== "playing") continue;
      for (const m of sim.moves(s)) {
        if (m === "u") continue;
        const t = sim.apply(s, m);
        const st = sim.status(t);
        if (st === "won") return { optimal: depth, capped: false };
        const k = keyOf(t);
        if (st === "lost" || seen.has(k)) continue;
        seen.add(k);
        next.push(t);
      }
      if (seen.size >= cap) break;
    }
    frontier = next;
  }
  return { optimal: null, capped: seen.size >= cap };
}

function rolloutWin(from: SimState, tries = 3000): boolean {
  let r = 0x9e3779b9;
  const rand = () => {
    r = (r + 0x6d2b79f5) | 0;
    let t = Math.imul(r ^ (r >>> 15), 1 | r);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  for (let k = 0; k < tries; k++) {
    const noise = 0.02 + 0.5 * (k / tries);
    let s = from;
    for (let n = 0; n < 200 && sim.status(s) === "playing"; n++) {
      const ms = sim.moves(s).filter((m) => m !== "u");
      let pick = ms[Math.floor(rand() * ms.length)];
      if (rand() > noise) {
        let bv = -Infinity;
        for (const m of ms) {
          const t = sim.apply(s, m);
          const v = sim.status(t) === "won" ? Infinity : sim.progress(t) + rand() * 1e-3;
          if (v > bv) { bv = v; pick = m; }
        }
      }
      s = sim.apply(s, pick);
    }
    if (sim.status(s) === "won") return true;
  }
  return false;
}

for (const n of process.argv.slice(2).map(Number)) {
  const i = n - 1;
  const start = sim.start(i);
  const firsts = sim.moves(start).filter((m) => m !== "u");
  let winnable = 0;
  const dead: string[] = [];
  for (const m of firsts) {
    const t = sim.apply(start, m);
    if (sim.status(t) === "won") { winnable++; continue; }
    if (sim.status(t) === "lost") { dead.push(m); continue; }
    const r = shortest(t, FAIR_CAP);
    if (r.optimal !== null || (!r.capped ? false : rolloutWin(t))) winnable++;
    else dead.push(m);
  }
  const deep = shortest(start, DEEP_CAP);
  const sol = out[String(n)] ?? {};
  sol.fair = { first: firsts.length, winnable, fewest: deep.optimal };
  out[String(n)] = sol;
  console.log(`L${n}: ${winnable}/${firsts.length} first moves can still win${dead.length ? ` (not proven: ${dead.join(" ")})` : ""}; fewest moves ${deep.optimal ?? "> " + DEEP_CAP + " states"}`);
}
writeFileSync(file, JSON.stringify(out, null, 0).replace(/\},"/g, '},\n"'));
