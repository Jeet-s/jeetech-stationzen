// npx tsx .agf/tmp/losses2.ts n noise goal scale  -> outcome tally with the level patched
import { sim } from "../../src/game/sim";
import { compileLevel } from "../../src/game/engine";
import { LEVELS, SPECS } from "../../src/game/levels";
import { rand, reseed } from "../../scripts/bots";
const n = Number(process.argv[2]), i = n - 1, noise = Number(process.argv[3] ?? 0.3);
LEVELS[i] = compileLevel({ ...SPECS[i], goal: Number(process.argv[4] ?? SPECS[i].goal), scale: Number(process.argv[5] ?? 1) }, i);
reseed("x" + n);
const tally = new Map<string, number>();
for (let t = 0; t < 200; t++) {
  let s = sim.start(i);
  for (let k = 0; k < 400 && sim.status(s) === "playing"; k++) {
    const ms = sim.moves(s); let pick = ms[Math.floor(rand() * ms.length)];
    if (rand() > noise) { let b = -Infinity; for (const m of ms) { const x = sim.apply(s, m); const v = sim.status(x) === "won" ? Infinity : sim.progress(x) + rand() * 1e-6; if (v > b) { b = v; pick = m; } } }
    s = sim.apply(s, pick);
  }
  const L = LEVELS[i];
  const full = L.stations.filter((st) => s.sk[st.id] > 0).map((st) => st.ch).join("");
  const key = `${sim.status(s)} wk${s.wk} ` + s.ln.map((l) => l.s + (l.o ? "o" : "") + (l.c ? "+" + l.c : "")).join(" ") + (s.over === 2 ? ` full[${full}]` : "");
  tally.set(key, (tally.get(key) ?? 0) + 1);
}
for (const [k, v] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(v, k);
