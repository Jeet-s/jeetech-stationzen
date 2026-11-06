/** bench n [goal] : plan & trap at goal 0 (delivered / ring), at current goal, and bot rates. TRIALS env */
import { LEVELS, SPECS } from "../../src/game/levels";
import { compileLevel } from "../../src/game/engine";
import { sim } from "../../src/game/sim";
import { planToMoves } from "../../src/game/solver";
import { winRate } from "../../scripts/bots";
import { target } from "../../scripts/targets";
import tuning from "../../src/game/tuning.json";
const T = Number(process.env.TRIALS ?? 150);
for (const a of process.argv.slice(2)) {
  const n = Number(a), i = n - 1, spec = SPECS[i];
  const tune = (tuning as any)[String(n)] ?? {};
  const goalOver = process.env.GOAL ? Number(process.env.GOAL) : undefined;
  const real = compileLevel({ ...spec, ...tune, ...(goalOver ? { goal: goalOver } : {}) }, i);
  const fin = (p: string[] | undefined) => {
    if (!p) return "-";
    LEVELS[i] = compileLevel({ ...spec, ...tune, goal: 0.0001 }, i);
    try { let s = planToMoves(i, p).end; while (sim.status(s) === "playing") s = sim.apply(s, sim.moves(s).includes("g") ? "g" : sim.moves(s)[0]);
      const full = LEVELS[i].stations.filter((st) => s.sk[st.id] > 0).map((st) => st.ch);
      return `${s.dl}${s.over === 2 ? ` RING ${full.join("")} wk${s.wk}` : ""}`; } catch (e) { return "ERR " + (e as Error).message.slice(0, 120); }
  };
  const pl = fin(spec.plan), tr = fin(spec.trap);
  LEVELS[i] = real;
  const c = winRate(sim, sim.start(i), "casual", T).rate, s = winRate(sim, sim.start(i), "skilled", T).rate;
  console.log(`L${n} ${spec.name} [${spec.role}] total ${real.total} goal ${real.goal} (${(real.goal/real.total).toFixed(2)}) | plan ${pl} | trap ${tr} | cas ${c.toFixed(2)} sk ${s.toFixed(2)} target ${target(n, spec.role).toFixed(2)}`);
}
