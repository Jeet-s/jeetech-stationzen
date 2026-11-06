/**
 * Station Zen — the metro engine (pure TypeScript, no UI).
 *
 * A level is a city map: stations (each with a glyph and the passengers it sends out every week) joined by
 * RAIL CORRIDORS (the dotted paths on the map). The player draws metro LINES along corridors — every corridor
 * segment a line uses costs one TRACK from the week's budget. Each week ("Run week") passengers appear, ride the
 * network (changing lines at any shared station) and are delivered to the nearest station of the glyph they want.
 * Trains have limited seats: a line's weekly capacity falls with its length (a short line runs more often), loops
 * run twice as often, carriages add seats. Passengers nobody can carry queue up; a station's ring glows yellow,
 * amber, then "Last Call" when full. A station that is still full after its Last Call week ends the run (soft fail).
 * Win: reach the final week having delivered the level's goal.
 *
 * Map DSL (also the board the level designer reads): stations are capital letters on even rows/cols; corridors
 * are the characters between them:
 *   - |   land corridor            \ / x  diagonal corridor (x = both diagonals cross)
 *   ~     river crossing (uses a tunnel)
 *   h     hill (slow: +1 hop per h)
 *   =     ferry link over deep water (+1 hop, a ferry carries at most FERRY_SEATS a week per carriage set)
 *   > < v ^  one-way rail (a line using it only runs once closed into a loop that follows the arrows)
 *   .     empty ground,   ,  water (scenery)
 */

export const GLYPHS = ["leaf", "drop", "kite", "lantern", "moon", "key", "cup", "star"] as const;
export type GlyphName = (typeof GLYPHS)[number];
const GLYPH_CODE = "LDKNMYCS"; // spec letters → glyph index

export const SEATS = 6; // seats per train (a carriage adds another SEATS)
export const TRIP_HOPS = 36; // corridor hops a train covers in one week
export const FERRY_SEATS = 12; // a ferry boat's weekly seats per carriage set
export const STATION_CAP = 12; // passengers a station holds before its ring is full
export const HUB_CAP = 24; // interchange stations hold twice as many
export const LAST_CALL_WEEKS = 2; // a station full at the end of this many weeks in a row ends the run

export type CardKind = "line" | "tracks" | "tunnel" | "car" | "hub" | "calm";
export const CARD_TEXT: Record<CardKind, string> = {
  line: "+1 line",
  tracks: "+2 tracks",
  tunnel: "+1 tunnel",
  car: "+1 carriage",
  hub: "+1 interchange",
  calm: "calm: halve every queue",
};

export type Role = "teach" | "practise" | "twist" | "combine" | "breather" | "boss" | "mastery" | "finale";

export type Star3 =
  | { k: "amber" } // no station ever reached amber
  | { k: "spare"; n: number } // finish with ≥ n tracks unused
  | { k: "lines"; n: number } // use at most n lines
  | { k: "loop" } // finish with a loop line
  | { k: "clear" } // every queue empty at the end
  | { k: "all" } // every rider of the level delivered (meaningful even while overcrowding is off)
  | { k: "nocar" } // finish without putting a carriage on any line
  | { k: "direct"; s: string }; // these stations (map letters) all on one line: their riders never change trains

export interface LevelSpec {
  name: string;
  role: Role;
  /** The insight the player must find. */
  aha: string;
  /** Why this level sits here / what it tests (plan line). */
  why: string;
  map: string[];
  /** Station specs: glyph letter, then options: @w opens week w, ! heritage, # interchange, *w market spike week w,
   *  then demand "2D" = 2 passengers a week who want a Drop (glyph letters L D K N M Y C S). */
  st: Record<string, string>;
  weeks: number;
  /** Tracks granted at the start of week 1, 2, … */
  tracks: number[];
  lines: number;
  tunnels?: number;
  cars?: number;
  hubs?: number;
  /** Weekly pick-one cards: week → options. */
  cards?: Record<number, CardKind[]>;
  snow?: number[];
  rush?: Record<number, number>;
  /** Goal = this share of every passenger who will appear. */
  goal: number;
  star3: Star3;
  /** Weeks a full station may stay full (default LAST_CALL_WEEKS). */
  grace?: number;
  /** Overcrowding can't end the run (guided tutorial levels). */
  noFail?: boolean;
  /** Demand scale applied to every station's weekly riders (pacing knob set by the tuner; default 1). */
  scale?: number;
  /** Lines may be closed into loops (taught in Ringvale). */
  loops?: boolean;
  /** The tempting wrong plan this level is built around ("w:LINES" entries, see solver planToMoves). Proven to lose. */
  trap?: string[];
  /** One-line description of that tempting plan, for the designer's read. */
  trapText?: string;
  /** The intended winning plan (same "w:LINES" form as trap) — the aha, proven by replay and stored as the proof. */
  plan?: string[];
}

export interface Station {
  id: number;
  ch: string; // map letter
  x: number; // lattice coords
  y: number;
  glyph: number;
  opens: number; // week it opens (1 = from the start)
  heritage: boolean;
  hub: boolean;
  market: number; // week its demand triples (0 = none)
  cap: number;
}
export interface Corridor {
  id: number;
  a: number;
  b: number;
  hops: number;
  river: boolean;
  ferry: boolean;
  hill: number;
  /** one-way: 1 = only a→b, -1 = only b→a, 0 = both. */
  dir: number;
  /** char cells it covers (for drawing) */
  cells: [number, number][];
}
export interface Group {
  s: number; // origin station
  g: number; // wanted glyph
  r: number; // passengers per week
}
export interface Level {
  index: number;
  spec: LevelSpec;
  stations: Station[];
  corridors: Corridor[];
  /** corridor id between two stations, or -1 */
  cor: Int16Array;
  adj: number[][];
  groups: Group[];
  /** spawn[w-1][group] passengers appearing in week w */
  spawn: number[][];
  total: number;
  goal: number;
  goal2: number;
  w: number; // char width
  h: number;
  sig: string;
}

export interface Line {
  s: string; // stops as map letters, in order
  o: 0 | 1; // loop
  c: number; // carriages
}
export interface State {
  map: string; // level signature (so different levels never share a start state)
  wk: number; // weeks completed; the player is planning week wk + 1
  tr: number; // tracks left
  tu: number; // tunnels left
  ca: number; // carriages left
  ix: number; // interchange upgrades left
  fl: number; // free (unused) lines
  ln: Line[];
  hb: number; // bitmask of stations upgraded to interchange
  q: number[]; // waiting passengers per group
  sk: number[]; // weeks each station has been full in a row
  dl: number; // delivered
  pk: number; // highest ring stage any station reached (0 calm, 1 yellow, 2 amber, 3 full)
  cd: number; // week whose card is waiting to be picked (0 = none)
  over: 0 | 1 | 2; // 0 playing, 1 won, 2 lost
}

// ───────────────────────── parsing ─────────────────────────

const H_CH = "-~h=><";
const V_CH = "|~h=v^";
const isStation = (c: string) => c >= "A" && c <= "Z";

export function compileLevel(spec: LevelSpec, index: number): Level {
  const rows = spec.map;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const at = (x: number, y: number) => (y >= 0 && y < h && x >= 0 ? rows[y][x] ?? " " : " ");
  const stations: Station[] = [];
  const byCh = new Map<string, number>();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x];
      if (!isStation(c)) continue;
      if (x % 2 || y % 2) throw new Error(`L${index + 1}: station ${c} off the lattice at ${x},${y}`);
      if (byCh.has(c)) throw new Error(`L${index + 1}: station ${c} twice`);
      const sp = spec.st[c];
      if (!sp) throw new Error(`L${index + 1}: station ${c} has no spec`);
      const glyph = GLYPH_CODE.indexOf(sp[0]);
      if (glyph < 0) throw new Error(`L${index + 1}: station ${c} bad glyph ${sp[0]}`);
      const opens = Number(/@(\d+)/.exec(sp)?.[1] ?? 1);
      const market = Number(/\*(\d+)/.exec(sp)?.[1] ?? 0);
      const hub = sp.includes("#");
      byCh.set(c, stations.length);
      stations.push({ id: stations.length, ch: c, x: x / 2, y: y / 2, glyph, opens, heritage: sp.includes("!"), hub, market, cap: hub ? HUB_CAP : STATION_CAP });
    }
  for (const k of Object.keys(spec.st)) if (!byCh.has(k)) throw new Error(`L${index + 1}: spec for missing station ${k}`);
  const n = stations.length;
  const corridors: Corridor[] = [];
  const cor = new Int16Array(n * n).fill(-1);
  const dirs: [number, number, string][] = [
    [1, 0, H_CH],
    [0, 1, V_CH],
    [1, 1, "\\x"],
    [-1, 1, "/x"],
  ];
  for (const st of stations) {
    for (const [dx, dy, ok] of dirs) {
      let x = st.x * 2 + dx, y = st.y * 2 + dy;
      if (!ok.includes(at(x, y))) continue;
      let hill = 0, river = false, ferry = false, dir = 0;
      const cells: [number, number][] = [];
      let end = -1;
      for (let guard = 0; guard < 40; guard++) {
        const c = at(x, y);
        if (isStation(c)) { end = byCh.get(c)!; break; }
        if (!ok.includes(c)) break;
        cells.push([x, y]);
        if (c === "h") hill++;
        if (c === "~") river = true;
        if (c === "=") ferry = true;
        if (c === ">" || c === "v") dir = 1;
        if (c === "<" || c === "^") dir = -1;
        x += dx; y += dy;
      }
      if (end < 0) throw new Error(`L${index + 1}: corridor from ${st.ch} going ${dx},${dy} ends nowhere`);
      const lattice = Math.max(Math.abs(stations[end].x - st.x), Math.abs(stations[end].y - st.y));
      const id = corridors.length;
      corridors.push({ id, a: st.id, b: end, hops: lattice + hill + (ferry ? 1 : 0), river, ferry, hill, dir, cells });
      cor[st.id * n + end] = id;
      cor[end * n + st.id] = id;
    }
  }
  const adj: number[][] = stations.map(() => []);
  for (const c of corridors) { adj[c.a].push(c.b); adj[c.b].push(c.a); }
  for (const a of adj) a.sort((p, q) => p - q);

  const groups: Group[] = [];
  for (const st of stations) {
    const sp = spec.st[st.ch];
    const re = /(\d+)([LDKNMYCS])/g;
    let m: RegExpExecArray | null;
    const rest = sp.slice(1).replace(/@\d+|\*\d+/g, "");
    while ((m = re.exec(rest))) {
      const g = GLYPH_CODE.indexOf(m[2]);
      if (g === st.glyph) throw new Error(`L${index + 1}: ${st.ch} wants its own glyph`);
      if (!stations.some((o) => o.glyph === g)) throw new Error(`L${index + 1}: ${st.ch} wants ${m[2]} but no station has it`);
      groups.push({ s: st.id, g, r: Math.max(1, Math.round(Number(m[1]) * (spec.scale ?? 1))) });
    }
  }
  const W = spec.weeks;
  const spawn: number[][] = [];
  let total = 0;
  for (let wk = 1; wk <= W; wk++) {
    const row = groups.map((gr) => {
      const st = stations[gr.s];
      if (st.opens > wk) return 0;
      // wanted glyph must be open somewhere this week
      if (!stations.some((o) => o.glyph === gr.g && o.opens <= wk)) return 0;
      let r = gr.r;
      if (st.market === wk) r *= 3;
      r = Math.round(r * (spec.rush?.[wk] ?? 1));
      return r;
    });
    total += row.reduce((a, b) => a + b, 0);
    spawn.push(row);
  }
  const goal = Math.max(1, Math.round(total * spec.goal));
  const goal2 = Math.max(goal, Math.min(total, Math.round(total * Math.min(1, spec.goal + 0.06))));
  if (spec.tracks.length > W) throw new Error(`L${index + 1}: tracks listed past the last week`);
  const sig = hashStr(JSON.stringify([spec.map, spec.st, spec.weeks, spec.tracks, spec.lines, spec.tunnels, spec.cars, spec.hubs, spec.cards, spec.snow, spec.rush, spec.goal, spec.scale ?? 1, spec.grace ?? 0, spec.loops ?? false]));
  return { index, spec, stations, corridors, cor, adj, groups, spawn, total, goal, goal2, w, h, sig };
}

function hashStr(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

// ───────────────────────── state ─────────────────────────

export function startState(L: Level): State {
  const sp = L.spec;
  const s: State = {
    map: L.sig,
    wk: 0,
    tr: 0,
    tu: sp.tunnels ?? 0,
    ca: sp.cars ?? 0,
    ix: sp.hubs ?? 0,
    fl: sp.lines,
    ln: [],
    hb: 0,
    q: L.groups.map(() => 0),
    sk: L.stations.map(() => 0),
    dl: 0,
    pk: 0,
    cd: 0,
    over: 0,
  };
  beginWeek(L, s);
  return s;
}

/** Start-of-week grants: tracks, pending card. Mutates. */
function beginWeek(L: Level, s: State) {
  const w = s.wk + 1;
  s.tr += L.spec.tracks[w - 1] ?? 0;
  s.cd = L.spec.cards?.[w] ? w : 0;
}

export const stationOpen = (L: Level, st: number, s: State) => L.stations[st].opens <= s.wk + 1;
export const lineStops = (L: Level, line: Line) => Array.from(line.s, (c) => L.stations.findIndex((st) => st.ch === c));
const chIdx = (L: Level, c: string) => c.charCodeAt(0) - 65 < 26 ? L.stations.findIndex((st) => st.ch === c) : -1;

// Station-letter → index lookups are hot; cache per level.
const letterCache = new WeakMap<Level, Int16Array>();
function letters(L: Level): Int16Array {
  let a = letterCache.get(L);
  if (!a) {
    a = new Int16Array(26).fill(-1);
    for (const st of L.stations) a[st.ch.charCodeAt(0) - 65] = st.id;
    letterCache.set(L, a);
  }
  return a;
}
export const idx = (L: Level, c: string) => letters(L)[c.charCodeAt(0) - 65];
void chIdx;

// ───────────────────────── network evaluation ─────────────────────────

export interface NetInfo {
  /** weekly seat capacity per line (before weather) */
  cap: number[];
  /** per group: bitmask of lines on its route, -1 unreachable */
  route: number[];
  /** per group: hops of the route (for drawing / tips) */
  hops: number[];
  /** per line: total hops of one pass */
  len: number[];
  /** per line: runs (one-way rules satisfied) */
  runs: boolean[];
}

const netCache = new Map<string, NetInfo>();
export const netKey = (L: Level, s: State) => {
  let k = L.sig + "|" + (s.wk + 1);
  for (const l of s.ln) k += "|" + l.s + (l.o ? "o" : "") + l.c;
  return k;
};

/** Hops of a corridor and whether travelling a→b is allowed. */
function corrOf(L: Level, a: number, b: number): Corridor {
  return L.corridors[L.cor[a * L.stations.length + b]];
}

export function lineInfo(L: Level, line: Line): { len: number; runs: boolean; ferry: boolean } {
  const st = Array.from(line.s, (c) => idx(L, c));
  let len = 0, ferry = false;
  let fwdOk = true, backOk = true;
  const segs = line.o ? st.length : st.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = st[i], b = st[(i + 1) % st.length];
    const c = corrOf(L, a, b);
    len += c.hops;
    if (c.ferry) ferry = true;
    if (c.dir) {
      const along = c.a === a ? c.dir : -c.dir; // +1 if a→b allowed
      if (along < 0) fwdOk = false;
      else backOk = false;
    }
  }
  const oneWay = !fwdOk || !backOk;
  const runs = line.o ? fwdOk || backOk : !oneWay;
  return { len, runs, ferry };
}

export function lineCapacity(L: Level, line: Line): number {
  const { len, runs, ferry } = lineInfo(L, line);
  if (!runs || len === 0) return 0;
  const seats = SEATS * (1 + line.c);
  const round = line.o ? len : 2 * len;
  let cap = Math.floor((seats * TRIP_HOPS) / round);
  if (ferry) cap = Math.min(cap, FERRY_SEATS * (1 + line.c));
  return cap;
}

export function netInfo(L: Level, s: State): NetInfo {
  const key = netKey(L, s);
  const hit = netCache.get(key);
  if (hit) return hit;
  const n = L.stations.length;
  const nl = s.ln.length;
  const cap: number[] = [], len: number[] = [], runs: boolean[] = [];
  const stops: number[][] = [];
  for (const line of s.ln) {
    const li = lineInfo(L, line);
    cap.push(lineCapacity(L, line));
    len.push(li.len);
    runs.push(li.runs);
    stops.push(Array.from(line.s, (c) => idx(L, c)));
  }
  // Dijkstra over (station, line) with cost = transfers * 1000 + hops. Small graphs — plain arrays.
  const week = s.wk + 1;
  const route: number[] = [], hops: number[] = [];
  // per station: lines through it
  const through: number[][] = Array.from({ length: n }, () => []);
  stops.forEach((st, l) => { if (runs[l]) for (const v of st) through[v].push(l); });
  // hop distance between two stops on a line
  const along = (l: number, i: number, j: number) => {
    const st = stops[l];
    const line = s.ln[l];
    let d = 0;
    if (i === j) return 0;
    const lo = Math.min(i, j), hi = Math.max(i, j);
    for (let k = lo; k < hi; k++) d += corrOf(L, st[k], st[k + 1]).hops;
    if (line.o) return Math.min(d, len[l] - d);
    return d;
  };
  const memo = new Map<string, { m: number; h: number }>();
  for (const gr of L.groups) {
    const mk = gr.s + ":" + gr.g;
    let res = memo.get(mk);
    if (!res) {
      res = { m: -1, h: 0 };
      const origin = gr.s;
      if (L.stations[origin].opens <= week && through[origin].length) {
        // label per (station,line): best cost + mask
        const best = new Float64Array(n * Math.max(1, nl)).fill(Infinity);
        const mask = new Int32Array(n * Math.max(1, nl));
        const open: [number, number, number, number][] = []; // cost, station, line, mask
        for (const l of through[origin]) {
          best[origin * nl + l] = 0;
          mask[origin * nl + l] = 1 << l;
          open.push([0, origin, l, 1 << l]);
        }
        let found = Infinity, foundMask = -1;
        while (open.length) {
          let bi = 0;
          for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
          const [cost, v, l, m] = open[bi];
          open[bi] = open[open.length - 1];
          open.pop();
          if (cost > best[v * nl + l] || cost >= found) continue;
          const sv = L.stations[v];
          if (v !== origin && sv.glyph === gr.g && sv.opens <= week) {
            if (cost < found) { found = cost; foundMask = m; }
            continue;
          }
          // ride line l to every other stop
          const st = stops[l];
          const iv = st.indexOf(v);
          for (let j = 0; j < st.length; j++) {
            if (j === iv) continue;
            const u = st[j];
            const c2 = cost + along(l, iv, j);
            if (c2 < best[u * nl + l]) { best[u * nl + l] = c2; mask[u * nl + l] = m; open.push([c2, u, l, m]); }
          }
          // change line at v
          for (const l2 of through[v]) {
            if (l2 === l) continue;
            const c2 = cost + 1000;
            if (c2 < best[v * nl + l2]) { best[v * nl + l2] = c2; open.push([c2, v, l2, m | (1 << l2)]); }
          }
        }
        if (foundMask >= 0) res = { m: foundMask, h: found % 1000 };
      }
      memo.set(mk, res);
    }
    route.push(res.m);
    hops.push(res.h);
  }
  const info = { cap, route, hops, len, runs };
  if (netCache.size > 200_000) netCache.clear();
  netCache.set(key, info);
  return info;
}

/** Ring stage of a station: 0 calm, 1 yellow (≥ half), 2 amber (≥ 3/4), 3 full. */
export function stationLoad(L: Level, s: State, st: number): number {
  let q = 0;
  L.groups.forEach((g, i) => { if (g.s === st) q += s.q[i]; });
  return q;
}
export const stationCap = (L: Level, s: State, st: number) => (L.stations[st].hub || (s.hb >> st) & 1 ? HUB_CAP : STATION_CAP);
export function stage(q: number, cap: number): number {
  return q >= cap ? 3 : q * 4 >= cap * 3 ? 2 : q * 2 >= cap ? 1 : 0;
}

/** Seats a line really offers this week once crowding slows it: seats × √(seats / riders) when overloaded. */
export function crowdedSeats(seats: number, riders: number): number {
  return riders > seats ? Math.floor(seats * Math.sqrt(seats / riders)) : seats;
}

/** Run one week: passengers appear, ride, get delivered; rings update; win/lose. Returns the new state. */
export function runWeek(L: Level, s0: State): State {
  const s: State = { ...s0, q: s0.q.slice(), sk: s0.sk.slice() };
  const w = s.wk + 1;
  const sp = s0.wk < L.spawn.length ? L.spawn[s0.wk] : L.groups.map(() => 0);
  for (let i = 0; i < s.q.length; i++) s.q[i] += sp[i];
  const net = netInfo(L, s);
  const weather = L.spec.snow?.includes(w) ? 0.5 : 1;
  const nl = s.ln.length;
  const demand = new Array(nl).fill(0);
  for (let i = 0; i < s.q.length; i++) {
    const m = net.route[i];
    if (m <= 0 || !s.q[i]) continue;
    for (let l = 0; l < nl; l++) if (m & (1 << l)) demand[l] += s.q[i];
  }
  // Crowding: a line with more riders than seats runs late (long dwell at every stop), so it makes fewer trips —
  // its effective seats shrink by the overload ratio. Seats are shared in proportion to who is waiting; leftover
  // whole seats go to the groups with the largest fractional share (largest remainder), so every seat is used.
  const seats = net.cap.map((c, l) => crowdedSeats(Math.floor(c * weather), demand[l]));
  const ratio = demand.map((d, l) => (d ? Math.min(1, seats[l] / d) : 1));
  const served = new Array(s.q.length).fill(0);
  const rem: [number, number][] = [];
  for (let i = 0; i < s.q.length; i++) {
    const m = net.route[i];
    if (m <= 0 || !s.q[i]) continue;
    let f = 1;
    for (let l = 0; l < nl; l++) if (m & (1 << l)) f = Math.min(f, ratio[l]);
    const exact = s.q[i] * f;
    served[i] = f >= 1 ? s.q[i] : Math.floor(exact + 1e-9);
    if (served[i] < s.q[i]) rem.push([exact - served[i], i]);
    for (let l = 0; l < nl; l++) if (m & (1 << l)) seats[l] -= served[i];
  }
  rem.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of rem) {
    const m = net.route[i];
    let ok = true;
    for (let l = 0; l < nl; l++) if (m & (1 << l) && seats[l] < 1) ok = false;
    if (!ok) continue;
    served[i]++;
    for (let l = 0; l < nl; l++) if (m & (1 << l)) seats[l]--;
  }
  for (let i = 0; i < s.q.length; i++) {
    s.q[i] -= served[i];
    s.dl += served[i];
  }
  // rings
  const load = new Array(L.stations.length).fill(0);
  L.groups.forEach((g, i) => (load[g.s] += s.q[i]));
  const grace = L.spec.grace ?? LAST_CALL_WEEKS;
  let lost = false;
  for (let st = 0; st < L.stations.length; st++) {
    const cap = stationCap(L, s, st);
    const sg = stage(load[st], cap);
    if (sg > s.pk) s.pk = sg;
    if (sg === 3) {
      s.sk[st]++;
      if (!L.spec.noFail && (s.sk[st] >= grace || L.stations[st].heritage)) lost = true;
    } else s.sk[st] = 0;
  }
  s.wk = w;
  if (lost) s.over = 2;
  else if (w >= L.spec.weeks) s.over = s.dl >= L.goal ? 1 : 2;
  else beginWeek(L, s);
  return s;
}

/** Does anything new happen at the start of week w (a station opens, tracks or a card arrive, weather/rush turns)? */
export function eventAt(L: Level, w: number): boolean {
  const sp = L.spec;
  if (w > sp.weeks) return true;
  if ((sp.tracks[w - 1] ?? 0) > 0 || sp.cards?.[w]) return true;
  if (L.stations.some((st) => st.opens === w || st.market === w)) return true;
  if (!!sp.snow?.includes(w) !== !!sp.snow?.includes(w - 1)) return true;
  if ((sp.rush?.[w] ?? 1) !== (sp.rush?.[w - 1] ?? 1)) return true;
  return false;
}

/** "Run": the week plays, and time keeps flowing until something new happens (or a ring hits Last Call). */
export function runToEvent(L: Level, s0: State): State {
  let prev = s0;
  let s = runWeek(L, s0);
  while (!s.over && !eventAt(L, s.wk + 1) && !warned(L, prev, s)) { prev = s; s = runWeek(L, s); }
  return s;
}

/** A ring rose a stage this week (the calm chime) — time pauses so the player can react. */
function warned(L: Level, a: State, b: State): boolean {
  const la = new Array(L.stations.length).fill(0), lb = new Array(L.stations.length).fill(0);
  L.groups.forEach((g, i) => { la[g.s] += a.q[i]; lb[g.s] += b.q[i]; });
  for (let st = 0; st < la.length; st++) if (stage(lb[st], stationCap(L, b, st)) > stage(la[st], stationCap(L, a, st))) return true;
  return false;
}

// ───────────────────────── moves ─────────────────────────

/** Move codes: "nAB" new line A–B · "e<l>hX"/"e<l>tX" extend line l at head/tail to X · "o<l>" close loop ·
 *  "c<l>" carriage on line l · "xA" interchange at A · "k<i>" pick card i · "g" run the week. */
export type Move = string;

function corridorUsable(L: Level, s: State, a: number, b: number): boolean {
  const id = L.cor[a * L.stations.length + b];
  if (id < 0) return false;
  if (L.corridors[id].river && s.tu <= 0) return false;
  return true;
}

export function legalMoves(L: Level, s: State): Move[] {
  if (s.over) return [];
  if (s.cd) return (L.spec.cards![s.cd] ?? []).map((_, i) => "k" + i);
  const out: Move[] = [];
  if (s.tr > 0) {
    if (s.fl > 0)
      for (const c of L.corridors) {
        if (c.river && s.tu <= 0) continue;
        const a = L.stations[c.a].ch, b = L.stations[c.b].ch;
        out.push("n" + (a < b ? a + b : b + a));
      }
    s.ln.forEach((line, l) => {
      if (line.o) return;
      const head = idx(L, line.s[0]), tail = idx(L, line.s[line.s.length - 1]);
      for (const x of L.adj[head]) if (!line.s.includes(L.stations[x].ch) && corridorUsable(L, s, head, x)) out.push(`e${l}h${L.stations[x].ch}`);
      for (const x of L.adj[tail]) if (!line.s.includes(L.stations[x].ch) && corridorUsable(L, s, tail, x)) out.push(`e${l}t${L.stations[x].ch}`);
      if (L.spec.loops && line.s.length >= 3 && L.cor[head * L.stations.length + tail] >= 0 && corridorUsable(L, s, head, tail)) out.push(`o${l}`);
    });
  }
  if (s.ca > 0) s.ln.forEach((_, l) => out.push(`c${l}`));
  if (s.ix > 0) for (const st of L.stations) if (!st.hub && !((s.hb >> st.id) & 1)) out.push("x" + st.ch);
  // Run starts the week; it's offered once the map has a line (or there's nothing left to build with).
  if (s.ln.length || s.tr <= 0) out.push("g");
  return out;
}

/** Apply a move (assumed legal). Pure. */
export function applyMove(L: Level, s: State, m: Move): State {
  const t = m[0];
  if (t === "g") return runToEvent(L, s);
  if (t === "k") {
    const kind = L.spec.cards![s.cd][Number(m.slice(1))];
    const n: State = { ...s, cd: 0 };
    if (kind === "line") n.fl++;
    else if (kind === "tracks") n.tr += 2;
    else if (kind === "tunnel") n.tu++;
    else if (kind === "car") n.ca++;
    else if (kind === "hub") n.ix++;
    else if (kind === "calm") n.q = s.q.map((v) => Math.floor(v / 2));
    return n;
  }
  if (t === "x") return { ...s, ix: s.ix - 1, hb: s.hb | (1 << idx(L, m[1])) };
  if (t === "c") {
    const l = Number(m.slice(1));
    const ln = s.ln.slice();
    ln[l] = { ...ln[l], c: ln[l].c + 1 };
    return { ...s, ca: s.ca - 1, ln };
  }
  const n: State = { ...s, tr: s.tr - 1 };
  const useCorr = (a: number, b: number) => {
    if (L.corridors[L.cor[a * L.stations.length + b]].river) n.tu--;
  };
  if (t === "n") {
    const a = idx(L, m[1]), b = idx(L, m[2]);
    useCorr(a, b);
    n.fl--;
    n.ln = [...s.ln, { s: m[1] + m[2], o: 0, c: 0 }];
    return n;
  }
  if (t === "e") {
    const l = Number(m[1]);
    const end = m[2], x = m[3];
    const line = s.ln[l];
    const v = idx(L, end === "h" ? line.s[0] : line.s[line.s.length - 1]);
    useCorr(v, idx(L, x));
    const ln = s.ln.slice();
    ln[l] = { ...line, s: end === "h" ? x + line.s : line.s + x };
    n.ln = ln;
    return n;
  }
  if (t === "o") {
    const l = Number(m.slice(1));
    const line = s.ln[l];
    useCorr(idx(L, line.s[0]), idx(L, line.s[line.s.length - 1]));
    const ln = s.ln.slice();
    ln[l] = { ...line, o: 1 };
    n.ln = ln;
    return n;
  }
  throw new Error("bad move " + m);
}

// ───────────────────────── scoring ─────────────────────────

export function starsFor(L: Level, s: State): number {
  if (s.over !== 1) return 0;
  let st = 1;
  if (s.dl >= L.goal2) st++;
  if (star3Met(L, s)) st++;
  return st;
}
export function star3Met(L: Level, s: State): boolean {
  const c = L.spec.star3;
  switch (c.k) {
    case "amber": return s.pk < 2;
    case "spare": return s.tr >= c.n;
    case "lines": return s.ln.length <= c.n;
    case "loop": return s.ln.some((l) => l.o);
    case "clear": return s.q.every((v) => v === 0);
    case "all": return s.dl >= L.total;
    case "nocar": return s.ln.every((l) => l.c === 0);
    case "direct": return s.ln.some((l) => [...c.s].every((ch) => l.s.includes(ch)));
  }
}
export function star3Text(c: Star3): string {
  switch (c.k) {
    case "amber": return "No station reaches amber";
    case "spare": return `Finish with ${c.n} track${c.n > 1 ? "s" : ""} to spare`;
    case "lines": return `Use at most ${c.n} line${c.n > 1 ? "s" : ""}`;
    case "loop": return "Finish with a loop line";
    case "clear": return "Nobody left waiting at the end";
    case "all": return "Deliver every rider";
    case "nocar": return "Leave the carriage in the depot";
    case "direct": return `${c.s.split("").join(" and ")} on one line (nobody changes)`;
  }
}

/** Service level of the current network: share of next week's demand it would carry (0..1). */
export function coverage(L: Level, s: State): number {
  return service(L, s).cov;
}

/**
 * How well the network serves next week's riders: cov = share it would carry (0..1); room = how roomy their trains
 * are (seats ÷ riders on the tightest line of each route, saturating at 3×, averaged — what the load meters show).
 */
export function service(L: Level, s: State): { cov: number; room: number } {
  const net = netInfo(L, s);
  const w = Math.min(s.wk, L.spawn.length - 1);
  const sp = L.spawn[w];
  const nl = s.ln.length;
  const demand = new Array(nl).fill(0);
  let tot = 0;
  for (let i = 0; i < sp.length; i++) {
    const want = sp[i] + s.q[i];
    tot += want;
    const m = net.route[i];
    if (m > 0) for (let l = 0; l < nl; l++) if (m & (1 << l)) demand[l] += want;
  }
  if (!tot) return { cov: 1, room: 1 };
  const weather = L.spec.snow?.includes(s.wk + 1) ? 0.5 : 1;
  let served = 0, room = 0;
  for (let i = 0; i < sp.length; i++) {
    const m = net.route[i];
    if (m <= 0) continue;
    let f = Infinity;
    for (let l = 0; l < nl; l++)
      if (m & (1 << l)) {
        const seats = Math.floor(net.cap[l] * weather);
        f = Math.min(f, demand[l] ? crowdedSeats(seats, demand[l]) / demand[l] : 3);
      }
    const want = sp[i] + s.q[i];
    served += want * Math.min(1, f);
    room += (want * Math.min(3, f)) / 3;
  }
  return { cov: served / tot, room: room / tot };
}

// ───────────────────────── planning aids ─────────────────────────

export interface Forecast {
  /** per station: the highest ring stage it reaches by the last week if nothing changes (0 calm … 3 full) */
  peak: number[];
  /** per station: the first week its ring would be full (0 = never) */
  fullWeek: number[];
  /** riders delivered by the end with the network as drawn */
  delivered: number;
  /** how the level would end with the network as drawn */
  outcome: "win" | "short" | "overflow";
}

/**
 * "Never a surprise": while planning, run the rest of the level on a copy with the network exactly as drawn and
 * report each ring's peak and the projected deliveries. The HUD draws this as a faint ring forecast.
 */
export function forecast(L: Level, s0: State): Forecast {
  const peak = L.stations.map(() => 0);
  const fullWeek = L.stations.map(() => 0);
  let s = s0;
  while (!s.over) {
    s = runWeek(L, s);
    const load = new Array(L.stations.length).fill(0);
    L.groups.forEach((g, i) => (load[g.s] += s.q[i]));
    for (let st = 0; st < load.length; st++) {
      const sg = stage(load[st], stationCap(L, s, st));
      if (sg > peak[st]) peak[st] = sg;
      if (sg === 3 && !fullWeek[st]) fullWeek[st] = s.wk;
    }
  }
  return { peak, fullWeek, delivered: s.dl, outcome: s.over === 1 ? "win" : s.dl < L.goal && !s.sk.some((v) => v >= (L.spec.grace ?? LAST_CALL_WEEKS)) ? "short" : "overflow" };
}
