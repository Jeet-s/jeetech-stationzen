/**
 * SHOWCASE game logic (the builder replaces this with the real game).
 * "Lights": tapping a tile toggles it and its 4 neighbours; light every tile.
 * Levels are generated from a fixed seed by pressing a known set of tiles from
 * the solved state, so each level is solvable by construction and its
 * difficulty (presses needed) is known — validate.ts proves both.
 */
export interface LevelDef {
  id: string;
  number: number;
  size: number;
  start: boolean[]; // true = lit
  solution: number[]; // tile indices that solve it
  par: number; // = solution.length (optimal by construction for this generator)
  chapter: string;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function press(board: boolean[], size: number, i: number): boolean[] {
  const b = board.slice();
  const r = Math.floor(i / size), c = i % size;
  for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < size && cc >= 0 && cc < size) b[rr * size + cc] = !b[rr * size + cc];
  }
  return b;
}

export const solved = (b: boolean[]) => b.every(Boolean);

const CHAPTERS = ["Dawn Garden", "Crystal Caves", "Neon City", "Starfall Peaks", "Aurora Sky"];

export function generateLevels(count = 30, seed = 7): LevelDef[] {
  const rand = rng(seed);
  const out: LevelDef[] = [];
  for (let n = 1; n <= count; n++) {
    const size = n <= 8 ? 3 : n <= 20 ? 4 : 5;
    // Gentle ramp inside each board size (sawtooth: a new size resets to easier).
    const inSize = n <= 8 ? n : n <= 20 ? n - 8 : n - 20;
    const presses = Math.min(size * size - 3, 1 + Math.floor(inSize / 3) + (size - 3));
    const chosen = new Set<number>();
    while (chosen.size < presses) chosen.add(Math.floor(rand() * size * size));
    let board = Array<boolean>(size * size).fill(true);
    for (const i of chosen) board = press(board, size, i);
    out.push({
      id: `L${n}`,
      number: n,
      size,
      start: board,
      solution: [...chosen],
      par: chosen.size,
      chapter: CHAPTERS[Math.min(CHAPTERS.length - 1, Math.floor((n - 1) / 6))],
    });
  }
  return out;
}

import tuned from "./levels.json";

/** Levels tuned offline by scripts/tune-levels.ts (playtested to a pacing curve). */
export const LEVELS: LevelDef[] = (tuned as LevelDef[]).length ? (tuned as LevelDef[]) : generateLevels();

/** 3 stars at par, 2 within +2, else 1. */
export const starsFor = (moves: number, par: number) => (moves <= par ? 3 : moves <= par + 2 ? 2 : 1);
export const movesAllowed = (par: number) => par * 3 + 4;
