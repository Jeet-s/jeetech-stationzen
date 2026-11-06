import { LEVELS } from "../../src/game/levels";
import { replay } from "../../src/game/solver";
import { SOLUTIONS } from "../../src/game/solutions";
for (const n of process.argv.slice(2).map(Number)) {
  const L = LEVELS[n-1]; const e = replay(n-1, SOLUTIONS[n].moves);
  console.log(`L${n} star3 ${JSON.stringify(L.spec.star3)} | end dl ${e.dl}/${L.total} goal ${L.goal} goal2 ${L.goal2} pk ${e.pk} tr ${e.tr} lines ${e.ln.length} loop ${e.ln.some(l=>l.o)} qleft ${e.q.reduce((a,b)=>a+b,0)}`);
}
