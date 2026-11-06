import { readFileSync } from "fs";
const d: number[] = JSON.parse(readFileSync(0, "utf8").trim().split("\n").pop()!).difficulty;
const n = d.length, k = Math.max(3, Math.round(n * 0.2));
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const idx = d.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]); const r = Array(n).fill(0); idx.forEach(([, i], p) => (r[i] = p));
const dsq = r.reduce((a, y, i) => a + (i - y) ** 2, 0);
console.log("ratio", (mean(d.slice(n - k)) / mean(d.slice(0, k))).toFixed(2), "rho", (1 - 6 * dsq / (n * (n * n - 1))).toFixed(3));
