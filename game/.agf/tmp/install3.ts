import { readFileSync, writeFileSync } from "fs";
import { LEVELS } from "../../src/game/levels";
import { replay } from "../../src/game/solver";
import { sim } from "../../src/game/sim";
import { starsFor } from "../../src/game/engine";
const file = "src/game/solutions.json";
const out = JSON.parse(readFileSync(file, "utf8"));
const found = JSON.parse(readFileSync(process.argv[2], "utf8")) as Record<string, string[]>;
for (const [n, moves] of Object.entries(found)) {
  if (!["28","31","40","120"].includes(n)) continue;
  const i = Number(n) - 1, L = LEVELS[i];
  const end = replay(i, moves);
  if (sim.status(end) !== "won" || starsFor(L, end) !== 3) { console.log(`L${n} replay failed`); continue; }
  const lines = end.ln.map((l) => l.s.split("").join("-") + (l.o ? " (loop)" : "") + (l.c ? ` +${l.c} carriage` : "")).join(", ");
  out[n] = { ...out[n], moves, edits: moves.filter((m) => m !== "g" && m[0] !== "k" && m !== "u").length, stars: 3, optimal: false,
    plan: `${lines}; ${end.dl} delivered, goal ${L.goal}`, note: "intended plan, refined to its 3-star form by guided search" };
  console.log(`L${n}: ${out[n].plan}`);
}
writeFileSync(file, JSON.stringify(out, null, 0).replace(/\},"/g, '},\n"'));
