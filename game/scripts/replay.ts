/// <reference types="node" />
/** Replay a plan on one level and print the network each week:  npx tsx scripts/replay.ts 8 nAD e0tE e0tG e0tC g … */
import { sim } from "../src/game/sim";
import { LEVELS, resolveLevel } from "../src/game/levels";
import { netInfo, stationLoad } from "../src/game/engine";
const n = resolveLevel(process.argv[2]);
const L = LEVELS[n - 1];
let s = sim.start(n - 1);
const show = (m: string) => {
  const net = netInfo(L, s);
  const loads = L.stations.map((st) => `${st.ch}${stationLoad(L, s, st.id)}${s.sk[st.id] ? "!" : ""}`).join(" ");
  console.log(`${m.padEnd(6)} wk${s.wk} tr${s.tr} dl${s.dl}/${L.goal} lines ${s.ln.map((l, i) => `${l.s}${l.o ? "o" : ""}${l.c ? "+" + l.c : ""}(cap${net.cap[i]})`).join(" ")} | ${loads} | ${sim.status(s)}`);
};
show("start");
for (const m of process.argv.slice(3)) {
  if (!sim.moves(s).includes(m)) { console.log(`illegal ${m}; legal: ${sim.moves(s).join(" ")}`); break; }
  s = sim.apply(s, m);
  show(m);
}
