/**
 * Modes beyond the campaign: the Daily Puzzle (same level for every player on a calendar day, with a 7-day streak
 * ribbon and one free streak freeze a week), Duels (two players plan the same city side by side; most riders
 * delivered wins — vs a human online, or vs Pip's AI rival offline / when nobody is found) and the Station Garden
 * (a diorama the player decorates with pieces bought with Tokens). Pure logic, no UI.
 */
import { sim } from "./sim";
import { LEVELS } from "./levels";
import { SOLUTIONS } from "./solutions";
import { store } from "../modules/store";

// ───────────────────────── daily puzzle ─────────────────────────

/** Calendar day key in UTC ("2026-11-06"): every player gets the same puzzle on the same day. */
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const dayNumber = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / 86400000);

function hash(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return x >>> 0;
}

/** Daily level (1-based): a proven campaign map from cities 2-10, the same for everyone on that day. */
export function dailyLevel(key = dayKey()): number {
  const pool = LEVELS.length - 12; // levels 13..120 (Willowmere is the tutorial city)
  return 13 + (hash(dayNumber(key)) % pool);
}

export const DAILY_REWARD = 50;
export const DAILY_STREAK_BONUS = 10; // per streak day, capped at 7

export interface DailyState { last: string; streak: number; best: number; freezes: number; freezeWeek: number }
export const dailyState = (): DailyState => ({ last: "", streak: 0, best: 0, freezes: 1, freezeWeek: 0, ...(store.get().daily ?? {}) });

/** Streak as it stands today (a missed day with no freeze left resets it to 0 on the ribbon). */
export function streakToday(key = dayKey()): { streak: number; doneToday: boolean; freezeNeeded: boolean } {
  const d = dailyState();
  if (!d.last) return { streak: 0, doneToday: false, freezeNeeded: false };
  const gap = dayNumber(key) - dayNumber(d.last);
  if (gap === 0) return { streak: d.streak, doneToday: true, freezeNeeded: false };
  if (gap === 1) return { streak: d.streak, doneToday: false, freezeNeeded: false };
  if (gap === 2 && freezesLeft(key) > 0) return { streak: d.streak, doneToday: false, freezeNeeded: true };
  return { streak: 0, doneToday: false, freezeNeeded: false };
}

const weekOf = (key: string) => Math.floor((dayNumber(key) + 3) / 7); // Monday-based week number
export function freezesLeft(key = dayKey()): number {
  const d = dailyState();
  return d.freezeWeek === weekOf(key) ? d.freezes : 1; // one free freeze every week
}

/** Record today's daily win: streak +1 (a freeze covers one missed day), returns the Tokens earned. */
export function completeDaily(key = dayKey()): { streak: number; tokens: number; usedFreeze: boolean; first: boolean } {
  const d = dailyState();
  const t = streakToday(key);
  if (t.doneToday) return { streak: d.streak, tokens: 0, usedFreeze: false, first: false };
  const streak = t.streak + 1;
  const left = freezesLeft(key);
  const tokens = DAILY_REWARD + Math.min(7, streak) * DAILY_STREAK_BONUS;
  store.set({
    daily: { last: key, streak, best: Math.max(d.best, streak), freezes: t.freezeNeeded ? left - 1 : left, freezeWeek: weekOf(key) },
    coins: store.get().coins + tokens,
  });
  return { streak, tokens, usedFreeze: t.freezeNeeded, first: true };
}

// ───────────────────────── duels ─────────────────────────

/** Duel maps: proven levels the player has reached (or the early cities), chosen by the host from a seed. */
export function duelLevel(seed: number, reached: number): number {
  const top = Math.max(12, Math.min(LEVELS.length, reached));
  const lo = Math.max(3, top - 24);
  return lo + (hash(seed) % (top - lo + 1));
}

/**
 * Pip's AI rival: plays the level's stored winning plan through the real engine, with a skill factor (0.8-1.06) so
 * it is good company — sometimes ahead, sometimes behind. Returns riders delivered after each week (index = week).
 */
export function botWeeks(level: number, seed: number): number[] {
  const L = LEVELS[level - 1];
  const sol = SOLUTIONS[String(level)];
  // stored plans are in the sim's canonical line order — replay them through the sim, as scripts/validate.ts does
  let s = sim.start(level - 1);
  const out = [0];
  for (const m of sol?.moves ?? []) {
    if (!sim.moves(s).includes(m)) break;
    s = sim.apply(s, m);
    if (m === "g") while (out.length <= s.wk) out.push(s.dl);
  }
  while (out.length <= L.spec.weeks) out.push(s.dl);
  const skill = 0.8 + (hash(seed + 7) % 27) / 100;
  return out.map((v) => Math.round(v * skill));
}

export const BOT_NAMES = ["Pip's Rival Rook", "Conductor Juniper", "Signal Wren", "Platform Hazel", "Timetable Moss", "Lantern Finch"];

/** Duel rating (shown in the hub; inputs are transparent: +20 a win, -10 a loss, never below 0). */
export function recordDuel(result: "win" | "loss" | "draw", bot: boolean): { tokens: number; rating: number } {
  const d = store.get().duel ?? { wins: 0, losses: 0, rating: 100 };
  const rating = Math.max(0, d.rating + (result === "win" ? 20 : result === "loss" ? -10 : 0));
  const tokens = result === "win" ? 40 : result === "draw" ? 25 : 15;
  store.set({
    duel: { wins: d.wins + (result === "win" ? 1 : 0), losses: d.losses + (result === "loss" ? 1 : 0), rating, botGames: (d.botGames ?? 0) + (bot ? 1 : 0) },
    coins: store.get().coins + tokens,
  });
  return { tokens, rating };
}

// ───────────────────────── station garden ─────────────────────────

export type GardenArt = "station_normal" | "station_interchange" | "station_heritage" | "train_capsule" | "passenger_pip" | "hero_pip_cat" | "glyph";
export interface GardenItem {
  id: string;
  name: string;
  art: GardenArt;
  glyph?: number;
  cost: number;
  /** Slot on the diorama (0..1 of its width / height) and drawn size (share of its width). */
  x: number;
  y: number;
  size: number;
  /** Stars needed to unlock (city progress). */
  stars: number;
}

export const GARDEN: GardenItem[] = [
  { id: "halt", name: "Little Halt", art: "station_normal", cost: 60, x: 0.3, y: 0.5, size: 0.2, stars: 0 },
  { id: "leaf", name: "Leaf Lantern", art: "glyph", glyph: 0, cost: 40, x: 0.13, y: 0.62, size: 0.12, stars: 0 },
  { id: "rider1", name: "Rider", art: "passenger_pip", cost: 50, x: 0.42, y: 0.6, size: 0.09, stars: 6 },
  { id: "drop", name: "Fountain", art: "glyph", glyph: 1, cost: 60, x: 0.36, y: 0.9, size: 0.12, stars: 12 },
  { id: "tram", name: "Tram", art: "train_capsule", cost: 120, x: 0.64, y: 0.33, size: 0.22, stars: 20 },
  { id: "hub", name: "Plaza", art: "station_interchange", cost: 150, x: 0.79, y: 0.54, size: 0.22, stars: 30 },
  { id: "moon", name: "Moon Lamp", art: "glyph", glyph: 4, cost: 70, x: 0.9, y: 0.7, size: 0.12, stars: 40 },
  { id: "rider2", name: "Commuters", art: "passenger_pip", cost: 80, x: 0.66, y: 0.7, size: 0.09, stars: 50 },
  { id: "kite", name: "Kite Pole", art: "glyph", glyph: 2, cost: 80, x: 0.22, y: 0.8, size: 0.11, stars: 60 },
  { id: "hall", name: "Heritage Hall", art: "station_heritage", cost: 220, x: 0.5, y: 0.68, size: 0.2, stars: 80 },
  { id: "star", name: "Star Beacon", art: "glyph", glyph: 7, cost: 120, x: 0.74, y: 0.86, size: 0.12, stars: 100 },
  { id: "pip", name: "Pip's Bench", art: "hero_pip_cat", cost: 300, x: 0.17, y: 0.4, size: 0.22, stars: 120 },
];

export function buyGarden(id: string): "ok" | "owned" | "locked" | "poor" {
  const item = GARDEN.find((g) => g.id === id);
  const p = store.get();
  if (!item) return "locked";
  if ((p.garden ?? []).includes(id)) return "owned";
  const stars = Object.values(p.stars ?? {}).reduce((a, b) => a + b, 0);
  if (stars < item.stars) return "locked";
  if (p.coins < item.cost) return "poor";
  store.set({ coins: p.coins - item.cost, garden: [...(p.garden ?? []), id] });
  return "ok";
}
