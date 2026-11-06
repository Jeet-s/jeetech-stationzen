// npx tsx .agf/tmp/ev.ts n [goals=0.8,0.85] [scale=1] [--bfs] [--alt "1:AB | 3:ABC" ...]
// Evaluates level n from the chapter spec (tuning.json ignored unless --tuned): plan/trap deliveries, alt plans, casual/skilled per goal, BFS facts.
import { compileLevel, star3Met, starsFor } from "../../src/game/engine";
import { LEVELS, SPECS } from "../../src/game/levels";
import { sim } from "../../src/game/sim";
import { planToMoves } from "../../src/game/solver";
import { winRate } from "../../scripts/bots";
import tuning from "../../src/game/tuning.json";
const a = process.argv.slice(2);
const n = Number(a[0]), i = n - 1;
const goals = (a[1] && !a[1].startsWith("--") ? a[1] : "").split(",").filter(Boolean).map(Number);
const scale = Number(a[2] && !a[2].startsWith("--") ? a[2] : (tuning as any)[n]?.scale ?? 1);
const alts: string[] = []; let bfsOn = false;
for (let k = 1; k < a.length; k++) { if (a[k] === "--alt") alts.push(a[++k]); if (a[k] === "--bfs") bfsOn = true; }
const set = (goal: number) => { LEVELS[i] = compileLevel({ ...SPECS[i], scale, goal }, i); return LEVELS[i]; };
const fin = (p: string[]) => { let s = planToMoves(i, p).end; while (sim.status(s) === "playing") s = sim.apply(s, sim.moves(s).includes("g") ? "g" : sim.moves(s)[0]); return s; };
let L = set(0.0001);
const sp = SPECS[i];
const show = (label: string, p?: string[]) => {
  if (!p) return;
  try { const s = fin(p); const full = L.stations.filter((st) => s.sk[st.id] > 0).map((st) => st.ch);
    console.log(`${label.padEnd(5)} ${p.join(" | ").padEnd(46)} dl ${s.dl}/${L.total} (${(s.dl / L.total).toFixed(3)}) ${s.over === 2 ? "LOST wk" + s.wk : "ok"} pk${s.pk} full[${full}] tr${s.tr} star3 ${star3Met(L, s)} q${s.q.reduce((x, y) => x + y, 0)}`);
  } catch (e) { console.log(label, "ERR", (e as Error).message.slice(0, 300)); }
};
console.log(`L${n} ${sp.name} [${sp.role}] scale ${scale} total ${L.total}`);
show("plan", sp.plan); show("trap", sp.trap); alts.forEach((p, k) => show("alt" + k, p.split(" | ")));
for (const g of goals) {
  L = set(g);
  const c = winRate(sim, sim.start(i), "casual", 150).rate, s = winRate(sim, sim.start(i), "skilled", 150).rate, cl = winRate(sim, sim.start(i), "careless", 150).rate;
  let pst = "";
  if (sp.plan) try { const e = fin(sp.plan); pst = `plan ${e.over === 1 ? "WIN" : "lose"}${starsFor(L, e)}★ ${(e.dl / L.goal).toFixed(2)}x`; } catch { pst = "plan ERR"; }
  let tst = ""; if (sp.trap) try { const e = fin(sp.trap); tst = `trap ${e.over === 1 ? "WINS!" : "loses"}`; } catch { tst = "trap ERR"; }
  console.log(`goal ${g} (${L.goal}) casual ${c.toFixed(2)} skilled ${s.toFixed(2)} careless ${cl.toFixed(2)} ${pst} ${tst}`);
}
if (bfsOn) {
  if (goals.length) set(goals[goals.length - 1]);
  const skip = (k: string, v: unknown) => (k === "level" || k === "id" || k === "number" || k === "moves" ? undefined : v);
  const keyOf = (s: unknown) => JSON.stringify(s, skip);
  type S = ReturnType<typeof sim.start>;
  const shortest = (from: S, cap: number) => {
    if (sim.status(from) === "won") return { optimal: 0, explored: 1, capped: false };
    const seen = new Set([keyOf(from)]); let frontier: S[] = [from];
    for (let depth = 1; frontier.length && seen.size < cap; depth++) { const next: S[] = [];
      for (const s of frontier) { if (sim.status(s) !== "playing") continue;
        for (const m of sim.moves(s)) { const t = sim.apply(s, m); const st = sim.status(t);
          if (st === "won") return { optimal: depth, explored: seen.size, capped: false };
          const k = keyOf(t); if (st === "lost" || seen.has(k)) continue; seen.add(k); next.push(t); if (seen.size >= cap) break; }
        if (seen.size >= cap) break; }
      frontier = next; }
    return { optimal: null as number | null, explored: seen.size, capped: seen.size >= cap };
  };
  const start = sim.start(i); const r = shortest(start, 40000); const firsts = sim.moves(start);
  const sample = firsts.length <= 12 ? firsts : Array.from({ length: 12 }, (_, k) => firsts[Math.floor((k * firsts.length) / 12)]);
  const per = sample.map((m) => { const t = sim.apply(start, m); if (sim.status(t) !== "playing") return `${m}:${sim.status(t)}`; const q = shortest(t, 10000); return `${m}:${q.capped ? "?" : q.optimal === null ? "DEAD" : q.optimal}(${q.explored})`; });
  console.log(`BFS optimal ${r.optimal} explored ${r.explored} branching ${firsts.length} | ${per.join(" ")}`);
}
