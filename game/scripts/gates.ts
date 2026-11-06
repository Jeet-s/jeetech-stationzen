/// <reference types="node" />
/** Check a playtest JSON (stdin: npm run playtest output) against the QA balance gates; print problem levels. */
import { readFileSync } from "fs";
const last = readFileSync(0, "utf8").trim().split("\n").pop()!;
const p = JSON.parse(last) as { personas: Record<string, number[]> };
const c = p.personas.casual, s = p.personas.skilled;
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const n = c.length, third = Math.max(3, Math.floor(n / 3));
const out: string[] = [];
out.push(`onboarding L1-3 ${c.slice(0, 3).join(", ")} (≥0.8)`);
const walls = c.map((v, i) => [v, s[i], i + 1]).filter(([v, k]) => v < 0.1 && k < 0.6);
out.push(`walls ${walls.map((w) => "L" + w[2]).join(" ") || "none"}`);
out.push(`late casual ${mean(c.slice(-third)).toFixed(3)} (0.30-0.65)  late skilled ${mean(s.slice(-third)).toFixed(3)} (0.5-0.95)`);
out.push(`mid casual ${mean(c.slice(third, n - third)).toFixed(3)} (0.50-0.85)`);
let run = 0, longest = 0;
c.forEach((v, i) => { run = i >= 5 && v >= 0.9 ? run + 1 : 0; longest = Math.max(longest, run); });
out.push(`longest easy run ${longest} (≤2); easy share ${(c.slice(5).filter((v) => v >= 0.9).length / (n - 5)).toFixed(3)} (≤0.25)`);
const spikes: string[] = [];
for (let i = 3; i < n; i++) if (mean(c.slice(i - 3, i)) - c[i] > 0.35) spikes.push(`L${i + 1} ${c[i]}`);
out.push(`spikes ${spikes.join(", ") || "none"}`);
const rank = (a: number[]) => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(a.length).fill(0); idx.forEach(([, i], pos) => (r[i] = pos)); return r; };
const rx = rank(c.map((_, i) => i)), ry = rank(c);
const rho = 1 - (6 * rx.reduce((acc, x, i) => acc + (x - ry[i]) ** 2, 0)) / (n * (n * n - 1));
out.push(`rho ${rho.toFixed(3)} (≤ -0.5)`);
console.log(out.join("\n"));
