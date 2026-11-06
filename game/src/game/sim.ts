/**
 * Simulation interface for the factory's bot playtesters (scripts/playtest.ts) and level report
 * (scripts/levels-report.ts), on the REAL engine (src/game/engine.ts).
 *
 * The bots plan the way a player does in pause-and-plan: at the start of each week they draw / extend lines,
 * add carriages, pick the weekly card, undo an edit they regret (last 3 edits of the week, like the HUD's undo),
 * then run the week. Line order and direction don't change the network, so the sim keeps lines in a canonical
 * order (the solver then sees one state per network).
 */
import { applyMove, legalMoves, service, stage, startState, stationCap, type Level, type Line, type Move, type State } from "./engine";
import { LEVELS } from "./levels";
import { describeLevel } from "./describe";

export type Status = "playing" | "won" | "lost";

/**
 * How a level designer reads one level (scripts/levels-report.ts → QA's level-design review).
 * grid: the START state as ASCII art, one text row per board row, + a legend. intent: what this
 * level teaches or tests and its "aha" moment, written when the level was designed.
 */
export interface LevelBrief {
  grid: string;
  legend: string;
  intent: string;
  mechanics: string[]; // mechanics / twists in play on this level
}

export interface Sim<S, M> {
  levelCount: number;
  /** Fresh state of level `index` (0-based). */
  start(index: number): S;
  /** Legal moves from this state (what a player could tap/swipe now). */
  moves(state: S): M[];
  apply(state: S, move: M): S;
  status(state: S): Status;
  /** Higher = closer to winning — what a human "sees" as progress. Used by human-like bots. */
  progress(state: S): number;
  /** The level as a designer sees it — REQUIRED: QA's level-design review reads every level through it. */
  describe(index: number): LevelBrief;
}

/** Engine state + level index + this week's undo history (key "moves" — not part of the puzzle position). */
export interface SimState extends State {
  level: number;
  moves: { stack: State[]; used: number; card?: boolean };
}

const UNDO_DEPTH = 3; // the HUD undoes the last 3 edits of the week
const UNDOS_PER_WEEK = 3;

function canonLine(l: Line): Line {
  let s = l.s;
  if (!l.o) {
    const r = [...s].reverse().join("");
    if (r < s) s = r;
  } else {
    let best = s;
    const n = s.length;
    for (const base of [s, [...s].reverse().join("")])
      for (let i = 0; i < n; i++) {
        const rot = base.slice(i) + base.slice(0, i);
        if (rot < best) best = rot;
      }
    s = best;
  }
  return s === l.s ? l : { ...l, s };
}
const lineKey = (l: Line) => l.s + (l.o ? "o" : "") + l.c;
export function canon<T extends State>(s: T): T {
  if (!s.ln.length) return s;
  const ln = s.ln.map(canonLine).sort((a, b) => (lineKey(a) < lineKey(b) ? -1 : 1));
  return { ...s, ln };
}

const strip = (s: SimState): State => {
  const { level: _l, moves: _m, ...rest } = s;
  return rest;
};

export function levelOf(s: { level: number }): Level {
  return LEVELS[s.level];
}

export function simApply(s: SimState, m: Move): SimState {
  const L = LEVELS[s.level];
  if (m === "u") {
    const stack = s.moves.stack;
    return { ...stack[stack.length - 1], level: s.level, moves: { stack: stack.slice(0, -1), used: s.moves.used + 1 } };
  }
  const next = canon(applyMove(L, s, m));
  // Edits can be undone until the week runs; running the week (or a card pick) clears the history.
  const moves = m === "g" || m[0] === "k" ? { stack: [], used: 0, card: m[0] === "k" } : { stack: [...s.moves.stack.slice(-(UNDO_DEPTH - 1)), strip(s)], used: s.moves.used };
  return { ...next, level: s.level, moves };
}

export function simMoves(s: SimState): Move[] {
  const L = LEVELS[s.level];
  const ms = legalMoves(L, s);
  if (s.moves.stack.length && s.moves.used < UNDOS_PER_WEEK && !s.over) ms.push("u");
  return ms;
}

/** What a player reads off the map: delivered so far, how much of the demand the network carries, how full rings are. */
export function simProgress(s: SimState): number {
  const own = baseProgress(s);
  if (!s.moves.card || s.over) return own;
  // Right after a weekly card pick a player judges the card by its best immediate use on the map.
  let best = own;
  for (const m of simMoves(s)) {
    if (m === "g" || m === "u" || m[0] === "k") continue;
    best = Math.max(best, baseProgress(simApply(s, m)));
  }
  return best;
}

function baseProgress(s: SimState): number {
  const L = LEVELS[s.level];
  if (s.over === 2) return -10;
  const frac = Math.min(1.2, s.dl / L.goal);
  const { cov, room } = service(L, s);
  let pressure = 0, strain = 0, open = 0;
  const load = new Array(L.stations.length).fill(0);
  L.groups.forEach((g, i) => (load[g.s] += s.q[i]));
  for (let st = 0; st < L.stations.length; st++) {
    if (L.stations[st].opens > s.wk + 1) continue;
    open++;
    const r = load[st] / stationCap(L, s, st);
    pressure += r * r;
    if (stage(load[st], stationCap(L, s, st)) === 3) strain += 1 + s.sk[st];
  }
  pressure /= Math.max(1, open);
  // Unspent resources are worth a little (so undoing a wasted edit reads as progress); every weekly card is worth
  // the same one unit, so the choice between cards comes from what they do on the map, not from counting.
  const spare = s.tr / 2 + s.tu + s.ca + s.fl + s.ix;
  // Time passing is progress too: a week survived is a week closer to the goal.
  // Players like roomy trains (the load meter): a little credit for seats beyond the riders, up to 3x.
  return 0.5 * frac + 0.6 * cov + 0.08 * room - 0.6 * pressure - 0.4 * strain + 0.004 * spare + (0.03 * s.wk) / L.spec.weeks;
}

export const sim: Sim<SimState, Move> = {
  levelCount: LEVELS.length,
  start: (i) => ({ ...startState(LEVELS[i]), level: i, moves: { stack: [], used: 0 } }),
  moves: simMoves,
  apply: simApply,
  status: (s) => (s.over === 1 ? "won" : s.over === 2 ? "lost" : "playing"),
  progress: simProgress,
  describe: (i) => describeLevel(LEVELS[i]),
};
