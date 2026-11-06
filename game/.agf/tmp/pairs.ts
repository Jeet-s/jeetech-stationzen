import { LEVELS } from "../../src/game/levels";
const first = new Map<string, number>();
for (const L of LEVELS) for (const g of L.groups) { const k = `${L.stations[g.s].glyph}>${g.g}`; if (!first.has(k)) first.set(k, L.index + 1); }
console.log([...first.entries()].sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k}@${v}`).join(" "));
