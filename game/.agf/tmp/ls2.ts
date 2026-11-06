import { LEVELS } from "../../src/game/levels";
import { mechanicsOf } from "../../src/game/describe";
for (const L of LEVELS) { const sp = L.spec; console.log(`L${L.index+1} ${sp.name} [${sp.role}] ${L.w}x${L.h} st${L.stations.length} wk${sp.weeks} tr${sp.tracks.join(",")} ln${sp.lines} goal${L.goal}/${L.total} | ${mechanicsOf(L).join(",")}${sp.cards?" cards "+JSON.stringify(sp.cards):""}`); }
