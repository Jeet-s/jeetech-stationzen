// Find a 3-star winning move list for the given levels (guided rollouts on the real engine); print JSON.
import { LEVELS } from "../../src/game/levels";
import { sim } from "../../src/game/sim";
import { starsFor } from "../../src/game/engine";
const out: Record<string, string[]> = {};
for (const n of process.argv.slice(2).map(Number)) {
  const i = n - 1, L = LEVELS[i];
  let r = 777 + n; const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let best: string[] | null = null;
  const t0 = Date.now();
  for (let k = 0; k < 20000 && Date.now() - t0 < 60000; k++) {
    const noise = 0.05 + 0.6 * ((k % 200) / 200);
    let s = sim.start(i); const mv: string[] = [];
    for (let step = 0; step < 80 && sim.status(s) === "playing"; step++) {
      const ms = sim.moves(s).filter((m) => m !== "u");
      let pick = ms[Math.floor(rand() * ms.length)];
      if (rand() > noise) { let bv = -Infinity; for (const m of ms) { const u = sim.apply(s, m); const v = sim.status(u) === "won" ? (starsFor(L, u) === 3 ? 1e9 : -5) : sim.progress(u) + rand() * 1e-3; if (v > bv) { bv = v; pick = m; } } }
      mv.push(pick); s = sim.apply(s, pick);
    }
    if (sim.status(s) === "won" && starsFor(L, s) === 3 && (!best || mv.length < best.length)) best = mv;
  }
  console.error(`L${n}: ${best ? best.length + " moves" : "NONE"}`);
  if (best) out[n] = best;
}
console.log(JSON.stringify(out));
