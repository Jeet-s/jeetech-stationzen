/**
 * Presentation facts the screens share: each city's look, line colours / colour-blind patterns, mechanic tips and
 * level rewards. Game rules live in engine.ts; this file only decides how they are shown.
 */
import type { ArtId } from "../art";
import { CARD_TEXT, star3Text, type CardKind, type Level } from "./engine";
import { CHAPTERS, LEVELS, SPECS } from "./levels";

export interface CityLook {
  bg: ArtId;
  /** Colour wash over the shared map art so every city reads as its own place. */
  wash: string;
  /** Accent for banners / chapter pills. */
  accent: string;
  mood: string;
}

export const CITY_LOOK: CityLook[] = [
  { bg: "bg_city_meadow", wash: "rgba(246,235,217,0.18)", accent: "#5FB3A6", mood: "willow village" },
  { bg: "bg_city_harbor", wash: "rgba(246,235,217,0.16)", accent: "#4F9FD0", mood: "river port" },
  { bg: "bg_city_meadow", wash: "rgba(255,196,168,0.24)", accent: "#E9925A", mood: "kite parks" },
  { bg: "bg_city_meadow", wash: "rgba(242,166,90,0.30)", accent: "#C77D32", mood: "amber hills" },
  { bg: "bg_city_harbor", wash: "rgba(242,167,195,0.24)", accent: "#D9739B", mood: "lotus islands" },
  { bg: "bg_city_meadow", wash: "rgba(226,238,252,0.55)", accent: "#6F9CC9", mood: "snowy town" },
  { bg: "bg_city_meadow", wash: "rgba(242,193,78,0.30)", accent: "#D99A2B", mood: "bazaar lanes" },
  { bg: "bg_city_harbor", wash: "rgba(184,165,217,0.30)", accent: "#8B76B8", mood: "ring city" },
  { bg: "bg_city_dusk", wash: "rgba(27,34,56,0.10)", accent: "#6C6FD0", mood: "night harbour" },
  { bg: "bg_city_meadow", wash: "rgba(231,183,67,0.24)", accent: "#C99A2E", mood: "grand capital" },
];

export const chapterIndexOf = (levelIndex: number) => SPECS[levelIndex].chapter;
export const lookOf = (levelIndex: number) => CITY_LOOK[chapterIndexOf(levelIndex)];
export const cityName = (levelIndex: number) => CHAPTERS[chapterIndexOf(levelIndex)].name;

/** 1-based position of a level inside its city. */
export function levelInCity(levelIndex: number): number {
  const c = chapterIndexOf(levelIndex);
  return levelIndex - SPECS.findIndex((s) => s.chapter === c) + 1;
}

/** Line colours: clean, distinct hues on the pastel maps. */
export const LINE_COLORS = ["#E4786B", "#4F9FD0", "#5BAA6E", "#9C7FD6", "#F2A33A", "#E46FA0"];
export const LINE_DARK = ["#B9564B", "#2F79A8", "#3D8550", "#7357B3", "#C77D1C", "#B84B7A"];
export const lineColor = (l: number) => LINE_COLORS[l % LINE_COLORS.length];
export const PATTERN_NAMES = ["solid", "dashed", "dotted", "double", "dash-dot", "long dash"];

export const GLYPH_LABEL = ["Leaf", "Drop", "Kite", "Lantern", "Moon", "Key", "Cup", "Star"];

export const CARD_ICON: Record<CardKind, "line" | "track" | "tunnel" | "carriage" | "hub" | "cloud"> = {
  line: "line", tracks: "track", tunnel: "tunnel", car: "carriage", hub: "hub", calm: "cloud",
};
export const CARD_TITLE: Record<CardKind, string> = {
  line: "New Line", tracks: "Track Bundle", tunnel: "Tunnel", car: "Carriage", hub: "Interchange", calm: "Calm Breeze",
};
export const CARD_BODY: Record<CardKind, string> = {
  line: "One more line to draw.",
  tracks: "Two more track pieces this week.",
  tunnel: "Lets one line cross the river.",
  car: "Drag it onto a line: +6 seats on every train.",
  hub: "Drag it onto a station: it holds 24 and swaps lines fast.",
  calm: "Every waiting queue is halved right now.",
};
export const cardText = (k: CardKind) => CARD_TEXT[k];

/** Tokens for a win (soft currency; boosters cost tokens). */
export const rewardFor = (levelIndex: number, stars: number) => 10 + stars * 10 + chapterIndexOf(levelIndex) * 2;

export const objectiveText = (L: Level) => `Deliver ${L.goal} riders by week ${L.spec.weeks}`;
export const star3Of = (L: Level) => star3Text(L.spec.star3);

// ───────────────────────── mechanic tips (shown once, on the first level that uses each rule) ─────────────────────────

export interface Tip { id: string; title: string; body: string }

const TIP_TEXT: Record<string, Omit<Tip, "id">> = {
  transfer: { title: "Change here", body: "Riders hop between lines at any shared station. Two lines meeting at one stop reach every glyph." },
  opens: { title: "Opening soon", body: "Faded stations open in the week shown on their tag. Plan the track you'll need for them." },
  rings: { title: "Gentle rings", body: "A ring glows yellow, then amber, then Last Call when 12 riders wait. Full two weeks in a row ends the run — never before." },
  tunnel: { title: "River tunnels", body: "A wavy crossing needs a tunnel. Tunnels are few, so choose where to cross." },
  card: { title: "Weekly card", body: "Some weeks bring a card: pick one of two or three gifts. Tap 'View map' to look before you choose." },
  car: { title: "Carriages", body: "Drag the carriage chip onto a line: every train on it gets 6 more seats." },
  hill: { title: "Hills", body: "Each hill bump adds a hop. Trains climb slowly, so a flat detour can carry more." },
  ferry: { title: "Ferries", body: "A ferry link carries at most 12 riders a week. Carriages add boats." },
  snow: { title: "Snow weeks", body: "Snow halves every train's seats that week. Build spare room before the storm." },
  hub: { title: "Interchanges", body: "Drag the interchange chip onto a busy station: it holds 24 riders instead of 12." },
  market: { title: "Market day", body: "A station marked with a market tag sends three times its riders that week." },
  loop: { title: "Loop lines", body: "Drag a line's end knob onto its other end to close a loop. Loops run twice as often." },
  oneway: { title: "One-way rails", body: "Arrowed rail only runs as part of a loop that follows the arrows." },
  rush: { title: "Rush hour", body: "Rush weeks multiply every station's riders. The forecast shows them coming." },
  heritage: { title: "Heritage stations", body: "Golden heritage stations may never fill up. Keep their ring calm." },
};

const firstWith = (test: (L: Level) => boolean) => LEVELS.findIndex(test);
const TIP_LEVEL: Record<string, number> = {
  transfer: 1,
  opens: firstWith((L) => L.stations.some((s) => s.opens > 1)),
  rings: firstWith((L) => !L.spec.noFail),
  tunnel: firstWith((L) => L.corridors.some((c) => c.river)),
  card: firstWith((L) => !!L.spec.cards),
  car: firstWith((L) => (L.spec.cars ?? 0) > 0 || Object.values(L.spec.cards ?? {}).some((cs) => cs.includes("car"))),
  hill: firstWith((L) => L.corridors.some((c) => c.hill > 0)),
  ferry: firstWith((L) => L.corridors.some((c) => c.ferry)),
  snow: firstWith((L) => !!L.spec.snow?.length),
  hub: firstWith((L) => (L.spec.hubs ?? 0) > 0 || L.stations.some((s) => s.hub)),
  market: firstWith((L) => L.stations.some((s) => s.market > 0)),
  loop: firstWith((L) => !!L.spec.loops),
  oneway: firstWith((L) => L.corridors.some((c) => c.dir !== 0)),
  rush: firstWith((L) => !!L.spec.rush && Object.keys(L.spec.rush).length > 0),
  heritage: firstWith((L) => L.stations.some((s) => s.heritage)),
};

/** The tips a level introduces (first level using each rule). */
export function tipsFor(levelIndex: number): Tip[] {
  return Object.entries(TIP_LEVEL)
    .filter(([, i]) => i === levelIndex)
    .map(([id]) => ({ id, ...TIP_TEXT[id] }));
}
