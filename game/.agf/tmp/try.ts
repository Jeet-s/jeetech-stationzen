// usage: npx tsx .agf/tmp/try.ts n goal "1:AB 2:.." "plan2" ...  -> run plans (entries separated by ' | ') at that goal
import { compileLevel } from "../../src/game/engine";
import { LEVELS, SPECS } from "../../src/game/levels";
import { sim } from "../../src/game/sim";
import { planToMoves } from "../../src/game/solver";
const [n, g, ...plans] = process.argv.slice(2);
const i = Number(n) - 1;
if (g !== "-") LEVELS[i] = compileLevel({ ...SPECS[i], goal: Number(g), scale: Number(process.env.SCALE ?? 1) }, i);
const L = LEVELS[i];
for (const p of plans) {
  try {
    let s = planToMoves(i, p.split(" | ")).end;
    while (sim.status(s) === "playing") s = sim.apply(s, sim.moves(s).includes("g") ? "g" : sim.moves(s)[0]);
    const full = L.stations.filter((st) => s.sk[st.id] > 0).map((st) => st.ch);
    console.log(`${p.padEnd(40)} ${s.over === 1 ? "WIN " : "lose"} ${s.dl}/${L.goal} of ${L.total} wk${s.wk} pk${s.pk} full ${full.join(",")} tr${s.tr}`);
  } catch (e) { console.log(p, "ERR", (e as Error).message); }
}
