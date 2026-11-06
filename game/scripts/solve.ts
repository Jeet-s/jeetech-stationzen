/// <reference types="node" />
/**
 * Solve every level (or the listed 1-based ones) and store the winning plans in src/game/solutions.json.
 *   npx tsx scripts/solve.ts [n …]
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { bfs, planToMoves, replay, rollouts } from "../src/game/solver";
import { LEVELS, resolveLevel } from "../src/game/levels";
import { sim } from "../src/game/sim";
import { starsFor } from "../src/game/engine";

const file = path.join(__dirname, "../src/game/solutions.json");
const out = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
const pick = process.argv.slice(2).map(resolveLevel).filter(Boolean);
const list = pick.length ? pick : LEVELS.map((_, i) => i + 1);
const CAP = Number(process.env.SOLVE_CAP ?? 60_000);
let bad = 0;
for (const n of list) {
  const i = n - 1;
  const L = LEVELS[i];
  let sol = bfs(i, CAP);
  if (sol && sol.explored < 0) { console.log(`L${n}: UNSOLVABLE (exhausted ${-sol.explored} states)`); bad++; delete out[n]; continue; }
  const fewest = sol?.optimal ? sol.moves.length : null;
  // The designer's intended plan is the proof when it wins (so the stored plan IS the level's aha).
  let planned = false;
  if (L.spec.plan) {
    try {
      let { moves, end } = planToMoves(i, L.spec.plan);
      while (sim.status(end) === "playing" && sim.moves(end).includes("g")) { end = sim.apply(end, "g"); moves = [...moves, "g"]; }
      if (sim.status(end) === "won") { sol = { moves, optimal: false, explored: 0 }; planned = true; }
      else { console.log(`L${n}: WARNING the intended plan does not win (delivered ${end.dl}/${L.goal}${end.over === 2 ? ", a ring overflowed" : ""})`); bad++; }
    } catch (e) { console.log(`L${n}: plan ${(e as Error).message}`); bad++; }
  }
  if (!sol) sol = rollouts(i);
  if (!sol) { console.log(`L${n}: no solution found`); bad++; delete out[n]; continue; }
  const end = replay(i, sol.moves);
  const edits = sol.moves.filter((m) => m !== "g" && m[0] !== "k").length;
  const lines = end.ln.map((l) => l.s.split("").join("-") + (l.o ? " (loop)" : "") + (l.c ? ` +${l.c} carriage` : "")).join(", ");
  const weekly: string[] = [];
  let wk = 1, buf: string[] = [];
  let s = sim.start(i);
  for (const m of sol.moves) {
    if (m === "g") { if (buf.length) weekly.push(`wk${wk}: ${buf.join(" ")}`); buf = []; s = sim.apply(s, m); wk = s.wk + 1; continue; }
    buf.push(m);
    s = sim.apply(s, m);
  }
  let trap: string | undefined;
  if (L.spec.trap) {
    let t = sim.start(i);
    try {
      t = planToMoves(i, L.spec.trap).end;
      while (sim.status(t) === "playing") t = sim.apply(t, sim.moves(t).includes("g") ? "g" : sim.moves(t)[0]);
      const full = L.stations.filter((st) => t.sk[st.id] > 0).map((st) => st.ch);
      trap = sim.status(t) === "won"
        ? "WINS"
        : `loses: ${full.length ? `${full.join(",")} full wk${t.wk}` : `${t.dl} delivered, goal ${L.goal}`}`;
      if (trap === "WINS") { console.log(`L${n}: WARNING trap plan wins — the aha is not forced`); bad++; }
    } catch (e) { console.log(`L${n}: ${(e as Error).message}`); bad++; }
  }
  const keep = (out[n] as { fair?: unknown } | undefined)?.fair;
  out[n] = {
    ...(keep ? { fair: keep } : {}),
    moves: sol.moves,
    edits,
    stars: starsFor(L, end),
    optimal: sol.optimal,
    plan: `${lines}; ${end.dl} delivered, goal ${L.goal}`,
    trap,
    note: planned
      ? `intended plan${fewest !== null ? `; BFS fewest ${fewest} moves` : ""}`
      : sol.optimal ? `fewest moves ${sol.moves.length} (BFS)` : `found by guided search (board too big to exhaust)`,
  };
  console.log(`L${n} ${L.spec.name}: ${planned ? "plan" : sol.optimal ? "opt" : "roll"} ${sol.moves.length} moves, ${edits} edits — ${lines} — ${weekly.join(" | ")}${trap ? ` — trap ${trap}` : ""}`);
}
if (!process.env.DRY) writeFileSync(file, JSON.stringify(out, null, 0).replace(/\},"/g, '},\n"'));
process.exit(bad ? 1 : 0);
