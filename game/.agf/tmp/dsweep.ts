// npx tsx .agf/tmp/dsweep.ts n scale g1,g2  -> validate-style difficulty + casual/skilled per goal
import { compileLevel } from "../../src/game/engine";
import { LEVELS, SPECS } from "../../src/game/levels";
import { sim } from "../../src/game/sim";
import { winRate } from "../../scripts/bots";
import { mechanicsOf } from "../../src/game/describe";
import { SOLUTIONS } from "../../src/game/solutions";
const [n, sc, gs] = process.argv.slice(2); const i = Number(n) - 1;
let seed = 0;
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };
function searchSuccess(i: number): number {
  seed = 0x5eed + i * 7919; let wins = 0;
  for (let r = 0; r < 80; r++) { let s = sim.start(i);
    for (let k = 0; k < 300 && sim.status(s) === "playing"; k++) { const ms = sim.moves(s); let pick = ms[Math.floor(rand() * ms.length)];
      if (rand() > 0.3) { let best = -Infinity; for (const m of ms) { const t = sim.apply(s, m); const v = sim.status(t) === "won" ? Infinity : sim.progress(t) + rand() * 1e-6; if (v > best) { best = v; pick = m; } } }
      s = sim.apply(s, pick); }
    if (sim.status(s) === "won") wins++; }
  return Math.max(wins, 0.5) / 80;
}
for (const g of gs.split(",").map(Number)) {
  LEVELS[i] = compileLevel({ ...SPECS[i], goal: g, scale: Number(sc) }, i);
  const p = searchSuccess(i); const mv = SOLUTIONS[n]?.moves.length ?? 1;
  const d = Math.sqrt(mechanicsOf(LEVELS[i], true).length * mv) * (-Math.log(p) + 0.05);
  const c = winRate(sim, sim.start(i), "casual", 150).rate, k = winRate(sim, sim.start(i), "skilled", 150).rate;
  console.log(`L${n} scale ${sc} goal ${g} (${LEVELS[i].goal}/${LEVELS[i].total}) search ${p.toFixed(2)} d ${d.toFixed(2)} casual ${c.toFixed(2)} skilled ${k.toFixed(2)}`);
}
