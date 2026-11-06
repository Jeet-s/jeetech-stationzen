import { LEVELS } from "../../src/game/levels";
import { startState, applyMove } from "../../src/game/engine";
import { nextAction } from "../../src/game/hint";
import { makeGeo, stationPt, lineHandles, stationAt, handleAt } from "../../src/game/board";
const n = Number(process.argv[2]); const L = LEVELS[n-1];
console.log(L.stations.map(s=>`${s.ch}(${s.x},${s.y}) opens${s.opens} ${s.glyph}`).join(" | "));
console.log(JSON.stringify(L.spec).slice(0,600));
let s = startState(L);
const g = makeGeo(L, 360, 520, 40);
console.log("tr", g.tr, "cell", g.cell);
for (let i=0;i<14;i++){ const a = nextAction(L, s, 1500); if(!a) break;
  const hs = lineHandles(g, L, s);
  let info = "";
  if (a.kind==="new"){ const p=stationPt(g,L,a.a); info=`from ${JSON.stringify(p)} handleAt=${JSON.stringify(handleAt(hs,p))} st=${stationAt(g,L,p)}`; }
  console.log(i, JSON.stringify(a), info, "handles", hs.map(h=>`${h.line}${h.end}@${L.stations[h.st].ch}(${h.p.x|0},${h.p.y|0})`).join(" "));
  s = applyMove(L, s, a.move); }
