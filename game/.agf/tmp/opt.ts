/** opt n "plan1" "plan2" ... : each plan entries separated by ';' → delivered/ring/peak at goal 0 */
import { LEVELS, SPECS } from "../../src/game/levels";
import { compileLevel } from "../../src/game/engine";
import { sim } from "../../src/game/sim";
import { planToMoves } from "../../src/game/solver";
import tuning from "../../src/game/tuning.json";
const n = Number(process.argv[2]), i = n - 1;
LEVELS[i] = compileLevel({ ...SPECS[i], ...((tuning as any)[n] ?? {}), goal: 0.0001 }, i);
console.log(`L${n} total ${LEVELS[i].total}`);
for (const p of process.argv.slice(3)) {
  try { let s = planToMoves(i, p.split(";")).end; let pk = 0; while (sim.status(s) === "playing") { s = sim.apply(s, sim.moves(s).includes("g") ? "g" : sim.moves(s)[0]); pk = Math.max(pk, s.pk); }
    const full = LEVELS[i].stations.filter((st) => s.sk[st.id] > 0).map((st) => st.ch);
    console.log(`${p.padEnd(40)} dl ${s.dl} ${s.over === 2 ? `RING ${full.join("")} wk${s.wk}` : ""} peak ${s.pk} tr ${s.tr}`); } catch (e) { console.log(p, "ERR", (e as Error).message.slice(0, 150)); }
}
