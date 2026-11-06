/** Plays every level through the screen's own action layer (src/game/hint.ts) on un-canonicalised engine state —
 *  exactly what QA level replay does on device — and checks each ends in a win. */
import { applyMove, startState } from "../src/game/engine";
import { LEVELS } from "../src/game/levels";
import { nextAction } from "../src/game/hint";

let bad = 0;
for (const L of LEVELS) {
  let s = startState(L);
  let n = 0;
  while (!s.over && n < 200) {
    const a = nextAction(L, s, 50);
    if (!a) break;
    s = applyMove(L, s, a.move);
    n++;
  }
  if (s.over !== 1) { bad++; console.log(`L${L.index + 1}: not won (over=${s.over}, moves=${n})`); }
}
console.log(JSON.stringify({ levels: LEVELS.length, failed: bad }));
process.exit(bad ? 1 : 0);
