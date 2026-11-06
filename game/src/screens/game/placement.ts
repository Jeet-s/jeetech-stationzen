import type { Level } from "../../game/engine";
import { stationPt, type Geo, type Handle, type Pt } from "../../game/board";

/**
 * Line-end knobs clear of every station disc (render_defects 2026-11-06: a knob drawn over the next station's Drop
 * glyph): a knob that would touch another station (or another knob, or leave the board) turns around its own station
 * in small steps until it is free, and never sits closer to its own station than the station's ring. Used for drawing,
 * touch hit tests, the tutorial hand and the QA replay alike, so all of them agree on where a knob is.
 */
export function clearKnobs(geo: Geo, L: Level, hs: Handle[]): Handle[] {
  const pts = L.stations.map((_, i) => stationPt(geo, L, i));
  const kr = geo.lw * 1.05 + 4;
  const EDGE = Math.max(kr, 34);
  const out: Handle[] = [];
  for (const h of hs) {
    const E = h.base;
    const a0 = Math.atan2(h.p.y - E.y, h.p.x - E.x);
    const dist = Math.max(Math.hypot(h.p.x - E.x, h.p.y - E.y), geo.sr * 1.1 + geo.lw * 0.6 + kr + 6);
    const place = (a: number): Pt => ({ x: E.x + Math.cos(a) * dist, y: E.y + Math.sin(a) * dist });
    const free = (p: Pt) =>
      // clear of the side edges by the system back-gesture zone too: a drag that starts within ~30 dp of the screen edge
      // is taken by Android as "back" and never reaches the game (level_replay L24 2026-11-06, knob at x = 18 dp)
      p.x > EDGE && p.y > kr && p.x < geo.w - EDGE && p.y < geo.h - kr &&
      pts.every((q) => (q.x === E.x && q.y === E.y) || Math.hypot(q.x - p.x, q.y - p.y) > geo.sr * 1.3 + kr + 3) &&
      out.every((o) => Math.hypot(o.p.x - p.x, o.p.y - p.y) > kr * 2.3);
    let p = place(a0);
    const tried: Pt[] = [p];
    for (let k = 1; k <= 12 && !free(p); k++) tried.push((p = place(a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.3)));
    // nowhere fully free: the spot furthest from the side edges (a touch there must reach the game)
    if (!free(p)) p = tried.reduce((b, q) => (Math.min(q.x, geo.w - q.x) > Math.min(b.x, geo.w - b.x) + 8 ? q : b), tried[0]);
    out.push({ ...h, p });
  }
  return out;
}

/** Radius of a station's outermost drawn ring (the dashed forecast ring sits at ring + 4, 3 px wide). */
export const ringOuter = (geo: Geo) => geo.sr + geo.lw * 0.6 + 2 + 4 + 2;

/** Extra chip width for the waiting-riders segment folded into a station's demand chip. */
export const waitW = (mini: number) => mini + 26;
/** Width a chip may grow by (waiting count + a "full wk N" status segment) — reserved when placing it. */
const reserveW = (mini: number) => waitW(mini) + 42;

/**
 * Where a station's connection tag ("Line 1", "+ Drop") goes: the free side of the station, away from its rails and
 * where knobs / trains sit (each corridor direction and its opposite), its demand chip, its waiting badge (upper
 * right), other stations and the board edge. Returns the tag's centre (board pixels).
 */
export function tagSpot(geo: Geo, L: Level, st: number, w: number, h: number, knobs: Pt[] = []): Pt {
  const p = stationPt(geo, L, st);
  const diff = (a: number, b: number) => { const d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
  const busy: number[] = [];
  for (const c of L.corridors) {
    if (c.a !== st && c.b !== st) continue;
    const q = stationPt(geo, L, c.a === st ? c.b : c.a);
    const a = Math.atan2(q.y - p.y, q.x - p.x);
    busy.push(a, a + Math.PI);
  }
  const mini = Math.round(Math.max(13, Math.min(18, geo.sr * 0.62)));
  if (L.groups.some((g) => g.s === st)) busy.push(labelSides(geo, L, mini)[st]);
  const pts = L.stations.map((_, i) => stationPt(geo, L, i));
  const chips = chipSpots(geo, L);
  let best = p, bs = -Infinity;
  for (let k = 0; k < 16; k++) {
    const a = -Math.PI / 2 + (k / 16) * Math.PI * 2; // straight above first
    const ux = Math.cos(a), uy = Math.sin(a);
    // clear of the station's outermost ring (load ring + dashed forecast ring + the press ripple)
    const reach = ringOuter(geo) + 4 + Math.min(Math.abs(ux) > 0.01 ? w / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 0.01 ? h / 2 / Math.abs(uy) : Infinity) + 2;
    const c = { x: p.x + ux * reach, y: p.y + uy * reach };
    let sc = Math.min(...busy.map((b) => diff(a, b)));
    if (c.x - w / 2 < 2 || c.y - h / 2 < 2 || c.x + w / 2 > geo.w - 2 || c.y + h / 2 > geo.h - 2) sc -= 10;
    const R = ringOuter(geo);
    if (pts.some((q, j) => j !== st && Math.abs(q.x - c.x) < w / 2 + R && Math.abs(q.y - c.y) < h / 2 + R)) sc -= 5;
    if (chips.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < q.r + Math.max(w, h) / 2)) sc -= 4;
    const kr = geo.lw * 1.05 + 6;
    if (knobs.some((q) => Math.abs(q.x - c.x) < w / 2 + kr && Math.abs(q.y - c.y) < h / 2 + kr)) sc -= 3;
    sc -= k === 0 ? 0 : 0.01; // ties: above
    if (sc > bs) { bs = sc; best = c; }
  }
  return best;
}

/**
 * Which side of each station its demand chip sits on: the free side, furthest from every rail that leaves the station
 * AND from where a line-end knob, the tutorial hand or a resting train would sit (each corridor's direction and its
 * opposite). Under the station when that is free; beside it on a vertical street (render_defects 2026-11-06: the red
 * end knob, the train and the tutorial hand all covered the "★2" chip under the Leaf station). Fixed per map, so
 * chips never jump while the player draws.
 */
export function labelSides(geo: Geo, L: Level, mini: number): number[] {
  const CAND = [Math.PI / 2, 0, Math.PI, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4];
  const diff = (a: number, b: number) => { const d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
  const pts = L.stations.map((_, i) => stationPt(geo, L, i));
  // chips already placed (reserved size): a chip never overlaps another station's chip (render 2026-11-06: the Drop
  // chip ran under the Star chip on Frostholm 12 once the waiting count and "wk N" status rode inside the chips)
  const placed: { left: number; top: number; w: number; h: number }[] = [];
  return L.stations.map((st, i) => {
    const p = pts[i];
    const busy: number[] = [];
    for (const c of L.corridors) {
      if (c.a !== i && c.b !== i) continue;
      const q = pts[c.a === i ? c.b : c.a];
      const a = Math.atan2(q.y - p.y, q.x - p.x);
      busy.push(a, a + Math.PI);
    }
    const n = L.groups.filter((g) => g.s === i).length;
    const w = n * (mini + 16) + 8 + reserveW(mini), h = mini + 7, d = chipGap(geo, st.heritage);
    let best = CAND[0], bs = -Infinity;
    for (const a of CAND) {
      let sc = busy.length ? Math.min(...busy.map((b) => diff(a, b))) : Math.PI;
      // the chip must fit on the board where it is placed (a clamp would push it back over its own station)…
      const { left, top } = chipBox(p, a, w, h, d);
      if (left < 2 || top < 2 || left + w > geo.w - 2 || top + h > geo.h - 2) sc -= 10;
      // …and never sit on another station
      if (pts.some((q, j) => j !== i && q.x > left - geo.sr && q.x < left + w + geo.sr && q.y > top - geo.sr && q.y < top + h + geo.sr)) sc -= 5;
      if (placed.some((b) => left < b.left + b.w + 4 && b.left < left + w + 4 && top < b.top + b.h + 3 && b.top < top + h + 3)) sc -= 6;
      if (sc > bs + 0.05) { bs = sc; best = a; }
    }
    if (n) placed.push({ ...chipBox(p, best, w, h, d), w, h });
    return best;
  });
}

/** Chip box (w × h) placed `d` from the station centre toward angle `a` (its nearest edge clears the station ring). */
export function chipBox(p: Pt, a: number, w: number, h: number, d: number): { left: number; top: number } {
  const ux = Math.cos(a), uy = Math.sin(a);
  const reach = d + Math.min(Math.abs(ux) > 0.01 ? w / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 0.01 ? h / 2 / Math.abs(uy) : Infinity) * 0.92;
  return { left: p.x + ux * reach - w / 2, top: p.y + uy * reach - h / 2 };
}

/** Centre and rough radius of every station's demand chip (as MapLabels places them), for overlays to steer clear of. */
export function chipSpots(geo: Geo, L: Level): (Pt & { r: number })[] {
  const mini = Math.round(Math.max(13, Math.min(18, geo.sr * 0.62)));
  const sides = labelSides(geo, L, mini);
  const out: (Pt & { r: number })[] = [];
  L.stations.forEach((st, i) => {
    const n = L.groups.filter((g) => g.s === i).length;
    if (!n) return;
    const w = n * (mini + 16) + 8 + reserveW(mini), h = mini + 7;
    const b = chipBox(stationPt(geo, L, i), sides[i], w, h, chipGap(geo, st.heritage));
    out.push({ x: b.left + w / 2, y: b.top + h / 2, r: Math.max(w, h) / 2 });
  });
  return out;
}

/** Distance from a station centre to its demand chip's near edge: outside the load ring (heritage art is taller). */
export const chipGap = (geo: Geo, heritage: boolean) => Math.max(geo.sr * (heritage ? 1.25 : 1.05) + 2, geo.sr + geo.lw * 0.6 + 5);
