import { LEVELS } from "../../src/game/levels";
import { startState, applyMove } from "../../src/game/engine";
import { nextAction } from "../../src/game/hint";
for (const n of process.argv.slice(2).map(Number)) {
  const L = LEVELS[n - 1]; let s = startState(L); const out: string[] = [];
  for (let i = 0; i < 40 && !s.over; i++) { const a = nextAction(L, s, 2000); if (!a) { out.push("NULL"); break; } out.push(a.kind + ":" + a.move); s = applyMove(L, s, a.move); }
  console.log(n, out.join(" "), "over", s.over, "stations", L.stations.length, L.stations.map(s=>`${s.ch}(${s.x},${s.y})`).join(" "));
}
