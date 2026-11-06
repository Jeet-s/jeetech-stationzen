// usage: npx tsx .agf/tmp/check.ts [--fast] n ...   (tuning.json applied)
import { LEVELS, SPECS } from "../../src/game/levels";
import { sim } from "../../src/game/sim";
import { planToMoves, bfs } from "../../src/game/solver";
import { winRate } from "../../scripts/bots";
import { star3Met } from "../../src/game/engine";
const args = process.argv.slice(2);
const fast = args.includes("--fast");
const T = Number(process.env.TR ?? 150);
const finish = (s: any) => { while (sim.status(s) === "playing") s = sim.apply(s, sim.moves(s).includes("g") ? "g" : sim.moves(s)[0]); return s; };
for (const a of args.filter((x) => !x.startsWith("--"))) {
  const n = Number(a), i = n - 1, L = LEVELS[i], sp = SPECS[i];
  const t0 = Date.now();
  let planS = "-", trapS = "-";
  try { const r = planToMoves(i, sp.plan!); const e = finish(r.end); planS = `${e.over === 1 ? "WIN" : "LOSE"} ${e.dl}/${L.goal} (${(e.dl / L.goal).toFixed(2)}) moves ${r.moves.length + 0} pk${e.pk} star3 ${e.over===1&&star3Met(L,e)} tr${e.tr}`; } catch (e) { planS = "ERR " + (e as Error).message; }
  if (sp.trap) try { const e = finish(planToMoves(i, sp.trap).end); const full = L.stations.filter((st) => e.sk[st.id] > 0).map((st) => st.ch); trapS = `${e.over === 1 ? "WINS!!" : "loses"} ${e.dl}/${L.goal} wk${e.wk} full ${full.join(",")}`; } catch (e) { trapS = "ERR " + (e as Error).message; }
  const c = winRate(sim, sim.start(i), "casual", T).rate, k = winRate(sim, sim.start(i), "skilled", T).rate;
  let opt = "";
  if (!fast) { const b = bfs(i, 40000); opt = b ? (b.explored < 0 ? "UNSOLVABLE" : `opt ${b.moves.length}`) : "opt >cap"; }
  console.log(`L${n} ${sp.name} [${sp.role}] goal ${L.goal}/${L.total} | casual ${c.toFixed(2)} skilled ${k.toFixed(2)} | ${opt} br ${sim.moves(sim.start(i)).length} | plan ${planS} | trap ${trapS} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
