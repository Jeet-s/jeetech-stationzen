import { SPECS } from "../../src/game/levels";
for (const n of process.argv.slice(2).map(Number)) { const s = SPECS[n-1]; console.log(`--- L${n}`); console.log(JSON.stringify({...s, chapter: undefined}, null, 0)); }
