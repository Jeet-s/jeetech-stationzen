import { readFileSync } from "fs";
const r = JSON.parse(readFileSync(process.env.LR ?? ".agf/tmp/lr-base.out","utf8").trim().split("\n").pop()!);
const pt = JSON.parse(readFileSync(process.env.PT ?? ".agf/tmp/pt-base.out","utf8").trim().split("\n").pop()!).personas;
for (const a of process.argv.slice(2)) { const n=Number(a); const l=r.levels[n-1];
 console.log(`\n### L${n} cas ${pt.casual[n-1]} sk ${pt.skilled[n-1]} opt ${l.optimal} br ${l.branching} trap ${l.trap} expl ${l.explored}\n${l.grid}\n${l.intent}`); }
