/// <reference types="node" />
/** Watch the greedy bot (no noise) play a level, move by move:  npx tsx scripts/trace.ts 37 [noise] */
import { sim } from "../src/game/sim";
import { LEVELS, resolveLevel } from "../src/game/levels";
import { netInfo, stationLoad } from "../src/game/engine";
const n = resolveLevel(process.argv[2]);
const noise = Number(process.argv[3] ?? 0);
const L = LEVELS[n - 1];
let s = sim.start(n - 1);
let r = 1;
const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32);
for (let k = 0; k < 60 && sim.status(s) === "playing"; k++) {
  const ms = sim.moves(s);
  let pick = ms[Math.floor(rand() * ms.length)];
  const scored = ms.map((m) => { const t = sim.apply(s, m); return [m, sim.status(t) === "won" ? Infinity : sim.progress(t)] as const; }).sort((a, b) => b[1] - a[1]);
  if (rand() >= noise) pick = scored[0][0];
  s = sim.apply(s, pick);
  const net = netInfo(L, s);
  console.log(`${pick.padEnd(5)} p=${sim.progress(s).toFixed(3)} wk${s.wk} tr${s.tr} dl${s.dl}/${L.goal} ${s.ln.map((l, i) => `${l.s}${l.o ? "o" : ""}${l.c ? "+" + l.c : ""}(${net.cap[i]})`).join(" ")} | ${L.stations.map((st) => st.ch + stationLoad(L, s, st.id)).join(" ")}   top: ${scored.slice(0, 4).map(([m, v]) => `${m}:${v === Infinity ? "WIN" : v.toFixed(3)}`).join(" ")}`);
}
console.log(sim.status(s));
