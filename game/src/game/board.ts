/**
 * Board geometry for the game screen: where every station, corridor, line ribbon and line-end knob sits in board
 * pixels, and hit tests for touches. Pure functions of (level, state, board size) — what is drawn is the engine state.
 */
import { lineStops, type Level, type State } from "./engine";

export interface Pt { x: number; y: number }

export interface Geo {
  cell: number; // pixels per lattice step
  ox: number; // board-pixel origin of lattice (0,0)
  oy: number;
  /** Lattice drawn transposed (wide maps on a tall phone): lattice (x, y) → screen (y, x). */
  tr: boolean;
  sr: number; // station radius
  lw: number; // line ribbon width
  w: number;
  h: number;
}

/** `top` = board pixels at the top kept free for the status chips. */
export function makeGeo(L: Level, w: number, h0: number, top = 0): Geo {
  const h = h0 - top;
  const gx = Math.max(...L.stations.map((s) => s.x)), gy = Math.max(...L.stations.map((s) => s.y));
  const fit = (cols: number, rows: number) => Math.min(w / (cols + 1.15), h / (rows + 1.25), 150);
  const straight = fit(gx, gy), turned = fit(gy, gx);
  const tr = turned > straight * 1.12;
  const cell = Math.floor(tr ? turned : straight);
  const cols = tr ? gy : gx, rows = tr ? gx : gy;
  const sr = Math.round(Math.max(15, Math.min(30, cell * 0.25)));
  const lw = Math.round(Math.max(6, Math.min(12, cell * 0.085)));
  return { cell, tr, sr, lw, w, h: h0, ox: Math.round((w - cols * cell) / 2), oy: Math.round(top + (h - rows * cell) / 2 + cell * 0.05) };
}

/** Lattice coordinates (may be fractional, e.g. a map character cell at x/2) → board pixels. */
export function at(g: Geo, lx: number, ly: number): Pt {
  const [a, b] = g.tr ? [ly, lx] : [lx, ly];
  return { x: g.ox + a * g.cell, y: g.oy + b * g.cell };
}

export const stationPt = (g: Geo, L: Level, st: number): Pt => at(g, L.stations[st].x, L.stations[st].y);

export interface Seg { line: number; a: number; b: number; p1: Pt; p2: Pt; corridor: number }

/** Every line's segments, offset sideways when several lines share a corridor (so each ribbon stays visible). */
export function lineSegments(g: Geo, L: Level, s: State): Seg[] {
  const n = L.stations.length;
  const share = new Map<number, number[]>();
  const raw: Omit<Seg, "p1" | "p2">[] = [];
  s.ln.forEach((line, l) => {
    const st = lineStops(L, line);
    const segs = line.o ? st.length : st.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = st[i], b = st[(i + 1) % st.length];
      const corridor = L.cor[a * n + b];
      raw.push({ line: l, a, b, corridor });
      const list = share.get(corridor) ?? [];
      if (!list.includes(l)) list.push(l);
      share.set(corridor, list);
    }
  });
  return raw.map((r) => {
    const list = share.get(r.corridor)!;
    const k = list.indexOf(r.line) - (list.length - 1) / 2;
    // offset perpendicular to the corridor's canonical direction (low id → high id), so a shared corridor fans out
    const lo = Math.min(r.a, r.b), hi = Math.max(r.a, r.b);
    const A = stationPt(g, L, lo), B = stationPt(g, L, hi);
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const nx = -(B.y - A.y) / len, ny = (B.x - A.x) / len;
    const off = k * g.lw * 1.15;
    const p = stationPt(g, L, r.a), q = stationPt(g, L, r.b);
    return { ...r, p1: { x: p.x + nx * off, y: p.y + ny * off }, p2: { x: q.x + nx * off, y: q.y + ny * off } };
  });
}

export interface Handle { line: number; end: "h" | "t"; st: number; p: Pt; base: Pt }

/** The draggable knob at each end of every open line (drag it to a neighbouring station to extend the line). */
export function lineHandles(g: Geo, L: Level, s: State): Handle[] {
  const out: Handle[] = [];
  s.ln.forEach((line, l) => {
    if (line.o) return;
    const st = lineStops(L, line);
    for (const end of ["h", "t"] as const) {
      const e = end === "h" ? st[0] : st[st.length - 1];
      const prev = end === "h" ? st[1] : st[st.length - 2];
      const E = stationPt(g, L, e), P = stationPt(g, L, prev);
      let ang = Math.atan2(E.y - P.y, E.x - P.x);
      const dist = g.sr + g.lw * 1.7 + 6;
      let p = { x: E.x + Math.cos(ang) * dist, y: E.y + Math.sin(ang) * dist };
      // two knobs at one station pointing the same way: fan them out
      for (let k = 1; k < 6 && out.some((o) => Math.hypot(o.p.x - p.x, o.p.y - p.y) < g.lw * 2.6); k++) {
        ang += (k % 2 ? 1 : -1) * k * 0.6;
        p = { x: E.x + Math.cos(ang) * dist, y: E.y + Math.sin(ang) * dist };
      }
      out.push({ line: l, end, st: e, p, base: E });
    }
  });
  return out;
}

export function stationAt(g: Geo, L: Level, p: Pt, slack = 1): number {
  let best = -1, bd = Infinity;
  const r = Math.max(g.sr * 1.35, Math.min(g.cell * 0.45, 30)) * slack;
  L.stations.forEach((st, i) => {
    const q = stationPt(g, L, i);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < r && d < bd) { bd = d; best = i; }
  });
  return best;
}

export function handleAt(hs: Handle[], p: Pt, r = 26): Handle | null {
  let best: Handle | null = null, bd = r;
  for (const h of hs) {
    const d = Math.hypot(h.p.x - p.x, h.p.y - p.y);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

/** The line whose ribbon passes nearest p (within reach), or -1. */
export function lineAt(g: Geo, segs: Seg[], p: Pt): number {
  let best = -1, bd = g.lw * 1.2 + 14;
  for (const sg of segs) {
    const d = distSeg(p, sg.p1, sg.p2);
    if (d < bd) { bd = d; best = sg.line; }
  }
  return best;
}

function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** A point on line l that belongs to that line alone (for dropping a carriage on it): its least-shared segment middle. */
export function lineDropPoint(segs: Seg[], l: number): Pt | null {
  const mine = segs.filter((s) => s.line === l);
  if (!mine.length) return null;
  const shared = (sg: Seg) => segs.filter((o) => o.corridor === sg.corridor).length;
  const sg = mine.slice().sort((a, b) => shared(a) - shared(b))[0];
  return { x: (sg.p1.x + sg.p2.x) / 2, y: (sg.p1.y + sg.p2.y) / 2 };
}

/** Polyline a train follows along line l (offset ribbons, closed for loops). */
export function trainPath(segs: Seg[], l: number): Pt[] {
  const mine = segs.filter((s) => s.line === l);
  if (!mine.length) return [];
  const pts: Pt[] = [mine[0].p1];
  for (const sg of mine) pts.push(sg.p2);
  return pts;
}
