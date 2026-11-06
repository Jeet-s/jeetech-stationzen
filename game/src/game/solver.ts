/**
 * Level solver on the real engine (through the Sim, so it plays exactly what players and bots play).
 * 1) Breadth-first search for the fewest-move win (moves = edits + week runs) within a state cap.
 * 2) If the board is too big to exhaust, guided rollouts (greedy on the bots' progress with growing noise)
 *    until one wins — a stored, replayable proof that the level can be won.
 */
import { sim, type SimState } from "./sim";

const skip = (k: string, v: unknown) => (k === "level" || k === "moves" ? undefined : v);
export const keyOf = (s: SimState) => JSON.stringify(s, skip);

export interface Solution {
  moves: string[];
  optimal: boolean; // proven fewest moves (BFS)
  explored: number;
}

export function bfs(index: number, cap = 120_000): Solution | null {
  const start = sim.start(index);
  const seen = new Set<string>([keyOf(start)]);
  const parent = new Map<string, [string, string]>();
  let frontier: SimState[] = [start];
  while (frontier.length && seen.size < cap) {
    const next: SimState[] = [];
    for (const s of frontier) {
      const ks = keyOf(s);
      for (const m of sim.moves(s)) {
        if (m === "u") continue;
        const t = sim.apply(s, m);
        const st = sim.status(t);
        const kt = keyOf(t);
        if (st === "won") {
          const path = [m];
          let k = ks;
          while (parent.has(k)) { const [pk, pm] = parent.get(k)!; path.unshift(pm); k = pk; }
          return { moves: path, optimal: true, explored: seen.size };
        }
        if (st === "lost" || seen.has(kt)) continue;
        seen.add(kt);
        parent.set(kt, [ks, m]);
        next.push(t);
      }
    }
    frontier = next;
  }
  return frontier.length ? null : { moves: [], optimal: true, explored: -seen.size }; // explored < 0: proven unsolvable
}

export function rollouts(index: number, tries = 4000, seed = 7): Solution | null {
  let r = seed >>> 0;
  const rand = () => {
    r = (r + 0x6d2b79f5) | 0;
    let t = Math.imul(r ^ (r >>> 15), 1 | r);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  let best: string[] | null = null;
  for (let k = 0; k < tries; k++) {
    const noise = 0.05 + 0.5 * (k / tries);
    let s = sim.start(index);
    const path: string[] = [];
    for (let n = 0; n < 200 && sim.status(s) === "playing"; n++) {
      const ms = sim.moves(s).filter((m) => m !== "u");
      let pick = ms[Math.floor(rand() * ms.length)];
      if (rand() > noise) {
        let bv = -Infinity;
        for (const m of ms) {
          const t = sim.apply(s, m);
          const v = sim.status(t) === "won" ? Infinity : sim.progress(t) + rand() * 1e-3;
          if (v > bv) { bv = v; pick = m; }
        }
      }
      s = sim.apply(s, pick);
      path.push(pick);
    }
    if (sim.status(s) === "won" && (!best || path.length < best.length)) best = path;
    if (best && k > 200) break;
  }
  return best ? { moves: best, optimal: false, explored: 0 } : null;
}

/** Replay a stored plan; returns the final state (throws on an illegal move). */
export function replay(index: number, moves: string[]): SimState {
  let s = sim.start(index);
  for (const m of moves) {
    if (!sim.moves(s).includes(m)) throw new Error(`L${index + 1}: illegal move ${m}`);
    s = sim.apply(s, m);
  }
  return s;
}

/**
 * Turn a readable plan into moves. Each entry is "w:tokens" — in week w's planning: tokens are target lines
 * ("ABCD", "ABCDo" loop, "ABC+1" one carriage), "k1" (pick card option 1), "xB" (interchange at B). A target line
 * extends the existing line it contains (either direction), or starts a new one. Weeks run until the next entry.
 */
export function planToMoves(index: number, plan: string[]): { moves: string[]; end: SimState } {
  let s = sim.start(index);
  const moves: string[] = [];
  const play = (m: string) => {
    if (!sim.moves(s).includes(m)) throw new Error(`L${index + 1} plan: move ${m} illegal in week ${s.wk + 1} (legal: ${sim.moves(s).join(" ")})`);
    s = sim.apply(s, m);
    moves.push(m);
  };
  for (const entry of plan) {
    const [wStr, rest] = entry.split(":");
    const w = Number(wStr);
    while (sim.status(s) === "playing" && s.wk + 1 < w) play("g");
    if (sim.status(s) !== "playing") break;
    for (const tok of rest.trim().split(/\s+/).filter(Boolean)) {
      if (tok[0] === "k") { play(tok); continue; }
      if (tok[0] === "x") { play("x" + tok[1]); continue; }
      const m = /^([A-Z]+)(o?)(?:\+(\d+))?$/.exec(tok);
      if (!m) throw new Error(`bad plan token ${tok}`);
      const target = m[1];
      const find = () => {
        let best = -1, bestLen = 0, rev = false, pos = 0;
        s.ln.forEach((l, i) => {
          for (const [str, r] of [[l.s, false], [[...l.s].reverse().join(""), true]] as const) {
            const p = target.indexOf(str);
            if (p >= 0 && str.length > bestLen) { best = i; bestLen = str.length; rev = r; pos = p; }
          }
          // a closed loop is stored rotated: match it by its set of stops
          if (l.o && best !== i && l.s.length === target.length && [...l.s].sort().join("") === [...target].sort().join("")) {
            best = i; bestLen = target.length; rev = false; pos = 0;
          }
        });
        return { best, rev, pos, len: bestLen };
      };
      let f = find();
      if (f.best < 0) {
        const a = target[0], b = target[1];
        play("n" + (a < b ? a + b : b + a));
        f = find();
      }
      // extend toward the target's tail, then its head
      for (;;) {
        f = find();
        const line = s.ln[f.best];
        if (f.len === target.length) break;
        const tailCh = f.pos + f.len < target.length ? target[f.pos + f.len] : null;
        const headCh = f.pos > 0 ? target[f.pos - 1] : null;
        // line.s orientation: if rev, line.s reversed equals target slice → line's head is target's right end
        if (tailCh) play(`e${f.best}${f.rev ? "h" : "t"}${tailCh}`);
        else if (headCh) play(`e${f.best}${f.rev ? "t" : "h"}${headCh}`);
        void line;
      }
      if (m[2]) { f = find(); play("o" + f.best); }
      const cars = Number(m[3] ?? 0);
      for (let c = 0; c < cars; c++) {
        f = find();
        if (s.ln[f.best].c >= cars) break;
        play("c" + f.best);
      }
    }
  }
  return { moves, end: s };
}
