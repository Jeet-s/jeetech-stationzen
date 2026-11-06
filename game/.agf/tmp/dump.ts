import { SPECS, LEVELS } from "../../src/game/levels";
import { SOLUTIONS } from "../../src/game/solutions";
import { readFileSync } from "fs";
const p = JSON.parse(readFileSync(".agf/playtest.json", "utf8"));
for (const a of process.argv.slice(2)) {
  const n = Number(a), sp = SPECS[n - 1], L = LEVELS[n - 1];
  console.log(`=== L${n} ${sp.name} [${sp.role}] casual ${p.personas.casual[n-1]} skilled ${p.personas.skilled[n-1]} goal ${L.goal}/${L.total}`);
  console.log(sp.map.join("\n"));
  const { name, role, map, aha, why, ...rest } = sp as any;
  console.log(JSON.stringify(rest));
  console.log("AHA:", aha); console.log("WHY:", why);
  const s = SOLUTIONS[String(n)]; if (s) console.log("SOL:", s.moves.length, s.plan, "| trap", s.trap);
}
