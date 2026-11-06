/// <reference types="node" />
/** For every level with a trap: riders delivered by the stored solution vs the trap (run to the end), and how the trap ends. */
import { LEVELS, SPECS, resolveLevel } from "../src/game/levels";
import { compileLevel } from "../src/game/engine";
import { sim } from "../src/game/sim";
import { planToMoves, replay } from "../src/game/solver";
import { SOLUTIONS } from "../src/game/solutions";

const pick = process.argv.slice(2).map(resolveLevel).filter(Boolean);
const list = pick.length ? pick : LEVELS.map((_, i) => i + 1);
for (const n of list) {
  const i = n - 1;
  const spec = SPECS[i];
  // play both with a goal of 0 so neither ends early on the goal; rings still end runs
  const orig = LEVELS[i];
  LEVELS[i] = compileLevel({ ...spec, goal: 0.0001 }, i);
  const finish = (s: ReturnType<typeof sim.start>) => { while (sim.status(s) === "playing") s = sim.apply(s, sim.moves(s).includes("g") ? "g" : sim.moves(s)[0]); return s; };
  let sol = "-", trap = "-";
  try { const e = finish(replay(i, SOLUTIONS[n].moves.filter((m) => m !== "g").length ? SOLUTIONS[n].moves : [])); sol = `${e.dl}${e.over === 2 ? " RING" : ""}`; } catch (e) { sol = "ERR " + (e as Error).message.slice(0, 60); }
  if (spec.trap) {
    try { const e = finish(planToMoves(i, spec.trap).end); trap = `${e.dl}${e.over === 2 ? ` RING wk${e.wk}` : ""}`; } catch (e) { trap = "ERR " + (e as Error).message.slice(0, 60); }
  }
  const total = LEVELS[i].total;
  LEVELS[i] = orig;
  console.log(`L${n} ${spec.name} [${spec.role}] total ${total} goal ${orig.goal} (${spec.goal}) | solution ${sol} | trap ${trap}`);
}
