// usage: npx tsx .agf/tmp/sweep.ts n scale g1,g2,...  [plans...] -> casual/skilled per goal, + plan/trap deliveries
import { compileLevel } from "../../src/game/engine";
import { LEVELS, SPECS } from "../../src/game/levels";
import { sim } from "../../src/game/sim";
import { planToMoves } from "../../src/game/solver";
import { winRate } from "../../scripts/bots";
const [n, sc, gs] = process.argv.slice(2);
const i = Number(n) - 1;
const fin = (p: string[]) => { let s = planToMoves(i, p).end; while (sim.status(s) === "playing") s = sim.apply(s, sim.moves(s).includes("g") ? "g" : sim.moves(s)[0]); return s; };
LEVELS[i] = compileLevel({ ...SPECS[i], scale: Number(sc), goal: 0.0001 }, i);
const pl = SPECS[i].plan ? fin(SPECS[i].plan!) : null, tr = SPECS[i].trap ? fin(SPECS[i].trap!) : null;
console.log(`total ${LEVELS[i].total} plan ${pl?.dl} ${pl?.over} trap ${tr?.dl} over ${tr?.over}(2=lost)`);
for (const g of gs.split(",").map(Number)) {
  LEVELS[i] = compileLevel({ ...SPECS[i], scale: Number(sc), goal: g }, i);
  const c = winRate(sim, sim.start(i), "casual", 150).rate, k = winRate(sim, sim.start(i), "skilled", 150).rate;
  console.log(`goal ${g} (${LEVELS[i].goal}) casual ${c.toFixed(2)} skilled ${k.toFixed(2)}`);
}
