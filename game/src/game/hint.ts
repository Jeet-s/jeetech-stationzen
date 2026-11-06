/**
 * The game's own solver, as the screen uses it: the next move toward a win from the CURRENT state (hints, the
 * tutorial hand, QA level replay). On the stored winning plan (src/game/solutions.json) it is the plan's next move;
 * off the plan it runs short guided rollouts on the real engine. Plan moves are written in the sim's canonical line
 * order, so they are translated back to the lines as the player drew them.
 */
import { legalMoves, type Level, type Move, type State } from "./engine";
import { canon, sim, type SimState } from "./sim";
import { keyOf } from "./solver";
import { SOLUTIONS } from "./solutions";
import { LEVELS } from "./levels";

/** One player action on screen. */
export type Action =
  | { kind: "new"; a: number; b: number; move: Move } // drag station a → station b
  | { kind: "extend"; line: number; end: "h" | "t"; to: number; move: Move } // drag line end knob → station
  | { kind: "loop"; line: number; end: "h" | "t"; to: number; move: Move } // drag a knob onto the line's other end
  | { kind: "car"; line: number; move: Move } // drag a carriage onto the line
  | { kind: "hub"; st: number; move: Move } // drag an interchange onto the station
  | { kind: "card"; i: number; move: Move }
  | { kind: "run"; move: Move };

const planCache = new Map<number, Map<string, number>>();

/** canonical-state key → index of the plan move to play next. */
function planIndex(index: number): Map<string, number> {
  let m = planCache.get(index);
  if (m) return m;
  m = new Map();
  const moves = SOLUTIONS[String(index + 1)]?.moves ?? [];
  let s = sim.start(index);
  for (let i = 0; i < moves.length; i++) {
    m.set(keyOf(s), i);
    s = sim.apply(s, moves[i]);
  }
  planCache.set(index, m);
  return m;
}

function asSim(L: Level, s: State): SimState {
  return { ...canon(s), level: L.index, moves: { stack: [], used: 0 } };
}

/** Next move in the sim's canonical form, or null if nothing wins from here (or the level is over). */
function nextCanonMove(L: Level, s: State, budgetMs: number): Move | null {
  if (s.over) return null;
  const ss = asSim(L, s);
  const i = planIndex(L.index).get(keyOf(ss));
  if (i !== undefined) return SOLUTIONS[String(L.index + 1)].moves[i];
  // Off the plan: guided rollouts (greedy on progress with growing noise) until one wins or the budget runs out.
  const t0 = Date.now();
  let r = 12345;
  const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let k = 0; k < 400 && Date.now() - t0 < budgetMs; k++) {
    const noise = 0.04 + 0.4 * (k / 60);
    let t = ss;
    let first: Move | null = null;
    for (let n = 0; n < 120 && sim.status(t) === "playing"; n++) {
      const ms = sim.moves(t).filter((m) => m !== "u");
      let pick = ms[Math.floor(rand() * ms.length)];
      if (rand() > noise) {
        let bv = -Infinity;
        for (const m of ms) {
          const u = sim.apply(t, m);
          const v = sim.status(u) === "won" ? Infinity : sim.progress(u) + rand() * 1e-3;
          if (v > bv) { bv = v; pick = m; }
        }
      }
      first ??= pick;
      t = sim.apply(t, pick);
    }
    if (sim.status(t) === "won" && first) return first;
  }
  return null;
}

/** Translate a canonical move into the action on the player's own (un-canonicalised) lines. */
function toAction(L: Level, s: State, m: Move): Action | null {
  const c = canon(s);
  const id = (ch: string) => L.stations.findIndex((st) => st.ch === ch);
  // canonical line i → the player's line index
  const used = new Set<number>();
  const own = (i: number) => {
    const target = c.ln[i];
    const key = (l: { s: string; o: number; c: number }) => l.s + "|" + l.o + "|" + l.c;
    const j = s.ln.findIndex((l, k) => !used.has(k) && key(canon({ ...s, ln: [l] }).ln[0]) === key(target));
    used.add(j);
    return j;
  };
  const t = m[0];
  if (t === "g") return { kind: "run", move: "g" };
  if (t === "k") return { kind: "card", i: Number(m.slice(1)), move: m };
  if (t === "x") return { kind: "hub", st: id(m[1]), move: m };
  if (t === "n") return { kind: "new", a: id(m[1]), b: id(m[2]), move: m };
  if (t === "c") {
    const j = own(Number(m.slice(1)));
    return j < 0 ? null : { kind: "car", line: j, move: `c${j}` };
  }
  if (t === "o") {
    const j = own(Number(m.slice(1)));
    if (j < 0) return null;
    const line = s.ln[j];
    return { kind: "loop", line: j, end: "t", to: id(line.s[0]), move: `o${j}` };
  }
  if (t === "e") {
    const i = Number(m[1]);
    const endLetter = m[2] === "h" ? c.ln[i].s[0] : c.ln[i].s[c.ln[i].s.length - 1];
    const j = own(i);
    if (j < 0) return null;
    const end = s.ln[j].s[0] === endLetter ? "h" : "t";
    return { kind: "extend", line: j, end, to: id(m[3]), move: `e${j}${end}${m[3]}` };
  }
  return null;
}

/** The next action toward a win from this state (null = none found / level over). */
export function nextAction(L: Level, s: State, budgetMs = 250): Action | null {
  const m = nextCanonMove(L, s, budgetMs);
  if (!m) return null;
  const a = toAction(L, s, m);
  return a && legalMoves(L, s).includes(a.move) ? a : null;
}

export { LEVELS };
