import { LEVELS } from "../../src/game/levels";
import { startState, applyMove, legalMoves, type State, type Level } from "../../src/game/engine";
import { nextAction, type Action } from "../../src/game/hint";
import { makeGeo, lineSegments, lineHandles as rawHandles, stationAt, handleAt, stationPt, lineAt, lineDropPoint, type Pt } from "../../src/game/board";
import { clearKnobs } from "../../src/screens/game/placement";
const lineHandles = (g: any, L: Level, s: State) => (process.env.RAW ? rawHandles(g, L, s) : clearKnobs(g, L, rawHandles(g, L, s)));
const W = Number(process.argv[2] ?? 360), H = Number(process.argv[3] ?? 480);
const only = process.argv[4] ? process.argv[4].split(",").map(Number) : null;
let bad = 0;
for (const L of LEVELS) {
  const n = L.index + 1; if (only && !only.includes(n)) continue;
  let s: State = startState(L); const geo = makeGeo(L, W, H, 40);
  try {
  for (let step = 0; step < 60 && !s.over; step++) {
    const a = nextAction(L, s, 2000);
    if (!a) { console.log(`L${n} step ${step}: solver null`); bad++; break; }
    const res = simulate(L, s, geo, a);
    if (res !== a.move) { console.log(`L${n} step ${step}: ${a.kind} wants ${a.move} got ${res}`); bad++; break; }
    s = applyMove(L, s, a.move);
  }
  } catch (e) { console.log(`L${n}: engine threw ${(e as Error).message} (level data mid-edit?)`); bad++; continue; }
  if (!s.over) {} else if (s.over !== 1) { console.log(`L${n} ended over=${s.over}`); bad++; }
}
console.log("bad", bad);
function simulate(L: Level, s: State, geo: any, a: Action): string {
  const segs = lineSegments(geo, L, s), handles = lineHandles(geo, L, s);
  if (a.kind === "run" || a.kind === "card") return a.move;
  if (a.kind === "car") { const p = lineDropPoint(segs, a.line)!; let l = lineAt(geo, segs, p); if (l < 0) l = handleAt(handles, p, 30)?.line ?? -1; return `c${l}`; }
  if (a.kind === "hub") { const st = stationAt(geo, L, stationPt(geo, L, a.st), 1.2); return `x${L.stations[st].ch}`; }
  let from: Pt, to: Pt;
  if (a.kind === "new") { from = stationPt(geo, L, a.a); to = stationPt(geo, L, a.b); }
  else { const k = handles.find((h) => h.line === a.line && h.end === a.end)!; from = k.p; to = stationPt(geo, L, a.to); }
  let h = handleAt(handles, from, Math.max(30, geo.lw * 3));
  { const st0 = stationAt(geo, L, from); if (h && st0 >= 0) { const sp = stationPt(geo, L, st0); if (Math.hypot(sp.x - from.x, sp.y - from.y) < Math.hypot(h.p.x - from.x, h.p.y - from.y)) h = null; } }
  let d: any;
  if (h) d = { cur: h.st, line: h.line, end: h.end };
  else { const st = stationAt(geo, L, from); if (st < 0) return "grant-miss"; d = { cur: st, line: -1, end: null }; }
  let got = "none";
  for (let i = 1; i <= 16; i++) {
    const p = { x: from.x + (to.x - from.x) * i / 16, y: from.y + (to.y - from.y) * i / 16 };
    const x = stationAt(geo, L, p, 0.8);
    if (x >= 0 && x !== d.cur) {
      const cx = L.stations[x].ch;
      if (d.line === -1) { const ac = L.stations[d.cur].ch; const m = "n" + (ac < cx ? ac + cx : cx + ac); if (legalMoves(L, s).includes(m)) return m; return "refused " + m; }
      else if (d.line >= 0) { const line = s.ln[d.line]; const other = d.end === "h" ? line.s[line.s.length - 1] : line.s[0];
        if (cx === other && legalMoves(L, s).includes(`o${d.line}`)) return `o${d.line}`;
        const ext = `e${d.line}${d.end}${cx}`; if (legalMoves(L, s).includes(ext)) return ext;
        if (!line.s.includes(cx) || cx === other) return "refused " + ext; }
    }
  }
  return got + (h ? ` (grabbed knob l${h.line}${h.end})` : "");
}
