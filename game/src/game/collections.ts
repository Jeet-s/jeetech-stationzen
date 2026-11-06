/**
 * Meta collections (GDD "Mastery and Skins", "Passenger Journal", save backup): pure data + derivations from the
 * player's saved stars, so nothing here can drift from the campaign.
 *  - City Mastery: 5 tiers per city at 6 / 12 / 20 / 28 / 34 of its 36 stars. Tiers unlock line colour skins and
 *    train liveries; the equipped skin recolours every line on the map (LINE_COLORS) and the trains.
 *  - Passenger Journal: 12 regular riders, each met by winning a level where a station of glyph A sends riders to
 *    glyph B (the GDD's "serve specific glyph pairs").
 *  - Backup code: the whole progress as a short offline text code (no account, no network).
 */
import { CHAPTERS, LEVELS, SPECS } from "./levels";
import { LINE_COLORS, LINE_DARK } from "./meta";
import { GARDEN } from "./modes";
import { store, type PlayerState } from "../modules/store";

export const TIER_STARS = [6, 12, 20, 28, 34];

export function cityStars(stars: Record<string, number> | undefined, city: number): { got: number; max: number } {
  let got = 0, max = 0;
  SPECS.forEach((sp, i) => { if (sp.chapter === city) { max += 3; got += stars?.[String(i + 1)] ?? 0; } });
  return { got, max };
}
export const cityTier = (stars: Record<string, number> | undefined, city: number) => TIER_STARS.filter((t) => cityStars(stars, city).got >= t).length;

export interface Skin { id: string; name: string; city: number; tier: number; colors: string[]; dark: string[] }
const CLASSIC = { colors: [...LINE_COLORS], dark: [...LINE_DARK] };
export const LINE_SKINS: Skin[] = [
  { id: "classic", name: "Classic", city: -1, tier: 0, ...CLASSIC },
  { id: "meadow", name: "Meadow", city: 0, tier: 1, colors: ["#6DB36A", "#E39B4B", "#4E9CB8", "#B07AC9", "#D9C149", "#E0738B"], dark: ["#478A45", "#B5722B", "#2E7690", "#86539F", "#A99227", "#B14D66"] },
  { id: "harbour", name: "Harbour", city: 1, tier: 1, colors: ["#3F8FC4", "#E2725B", "#3FAE9C", "#F0B649", "#7E83D6", "#D9688F"], dark: ["#26688F", "#AF4E39", "#278274", "#BF8A25", "#585DAB", "#A94468"] },
  { id: "sunset", name: "Sunset", city: 2, tier: 1, colors: ["#F28B50", "#C9577A", "#F2C14E", "#7A6CC9", "#4FA3A5", "#E06464"], dark: ["#C1622C", "#9A3557", "#C2952A", "#5447A0", "#317C7E", "#AF4040"] },
  { id: "festival", name: "Festival", city: 3, tier: 1, colors: ["#E35D6A", "#F5A623", "#2FB08A", "#3E86D8", "#B35FD0", "#F07CB4"], dark: ["#B23B48", "#C47F0C", "#1C8566", "#2463AA", "#8A3DA6", "#C25689"] },
  { id: "aurora", name: "Aurora", city: 5, tier: 1, colors: ["#57C4B8", "#8C7BE0", "#5FA8E8", "#E07BB5", "#9CCB63", "#F0A35E"], dark: ["#35978C", "#6553B8", "#3A7FBF", "#B5528B", "#729E3E", "#C27A38"] },
  { id: "neon", name: "Night Neon", city: 8, tier: 1, colors: ["#FF5DA2", "#28C7FA", "#A6E22E", "#B388FF", "#FFB300", "#FF7043"], dark: ["#C93A7A", "#0E97C4", "#7AAD14", "#8158D6", "#C98A00", "#C84B26"] },
];

export interface Livery { id: string; name: string; city: number; tier: number; color: string | null }
export const TRAIN_SKINS: Livery[] = [
  { id: "classic", name: "Cream Tram", city: -1, tier: 0, color: null },
  { id: "forest", name: "Forest Green", city: 0, tier: 3, color: "#4E9B5C" },
  { id: "harbour", name: "Harbour Blue", city: 1, tier: 3, color: "#3F7FC4" },
  { id: "lacquer", name: "Lacquer Red", city: 3, tier: 3, color: "#C9483E" },
  { id: "gold", name: "Gold Express", city: 6, tier: 3, color: "#E3B03B" },
  { id: "midnight", name: "Midnight", city: 9, tier: 3, color: "#3D3F75" },
];

export const skinUnlocked = (p: PlayerState, s: { city: number; tier: number }) => s.city < 0 || cityTier(p.stars, s.city) >= s.tier;
export const unlockText = (s: { city: number; tier: number }) => `${CHAPTERS[s.city]?.name ?? ""} mastery tier ${s.tier}`;

/** Recolour the lines in place (every map reads LINE_COLORS / LINE_DARK). */
export function applyLineSkin(id: string | undefined): void {
  const sk = LINE_SKINS.find((k) => k.id === id) ?? LINE_SKINS[0];
  LINE_COLORS.splice(0, LINE_COLORS.length, ...sk.colors);
  LINE_DARK.splice(0, LINE_DARK.length, ...sk.dark);
}
export const trainLivery = (id: string | undefined) => TRAIN_SKINS.find((k) => k.id === id)?.color ?? null;

// ── Passenger Journal ──
export interface Rider { id: string; name: string; from: number; to: number; story: string }
export const JOURNAL: Rider[] = [
  { id: "mina", name: "Mina, seed keeper", from: 0, to: 7, story: "Rides from the Leaf gardens to the Star market every week with a basket of seedlings. She waves at every driver." },
  { id: "tobias", name: "Tobias, rain watcher", from: 1, to: 0, story: "Measures the rain at the Drop fountain, then takes the tram to the Leaf park to see what it grew." },
  { id: "suri", name: "Suri, night baker", from: 7, to: 1, story: "Bakes star-shaped buns before dawn and delivers the first tray to the fountain café." },
  { id: "kenji", name: "Kenji, kite maker", from: 2, to: 0, story: "Carries a new kite to the Leaf hill each weekend. The trick, he says, is patience and a steady wind." },
  { id: "ada", name: "Ada, sky reader", from: 2, to: 7, story: "Reads the clouds from the Kite field, then rides out to the Star observatory to check her guesses." },
  { id: "lior", name: "Lior, locksmith", from: 5, to: 4, story: "Fixes old gates by day and rides to the Moon quarter by evening, where the streetlamps hum." },
  { id: "noor", name: "Noor, lamplighter", from: 4, to: 0, story: "Turns off the Moon lamps at sunrise and catches the first train to the Leaf gardens for breakfast." },
  { id: "pell", name: "Pell, tea brewer", from: 6, to: 4, story: "Brings a flask from the Cup tea house to the Moon square, one cup for every night-shift worker." },
  { id: "rosa", name: "Rosa, festival painter", from: 3, to: 2, story: "Paints lanterns all week and rides to the Kite field to hang them before the festival." },
  { id: "omar", name: "Omar, gardener", from: 6, to: 0, story: "Swaps cuttings with Mina. He takes the tram from the Cup café to the Leaf beds with pockets full of soil." },
  { id: "yuki", name: "Yuki, lantern guide", from: 3, to: 7, story: "Leads evening walks from the Lantern bridge to the Star tower and knows every rider by name." },
  { id: "bram", name: "Bram, clock mender", from: 5, to: 6, story: "Winds the station clocks, then rides to the Cup tea house where the kettle is always on time." },
];

/** Journal riders met: a won level (any stars) where a station of glyph `from` sends riders to glyph `to`. */
export function metRiders(stars: Record<string, number> | undefined): Set<string> {
  const pairs = new Set<string>();
  LEVELS.forEach((L, i) => {
    if (!((stars?.[String(i + 1)] ?? 0) > 0)) return;
    L.groups.forEach((g) => pairs.add(`${L.stations[g.s].glyph}>${g.g}`));
  });
  return new Set(JOURNAL.filter((r) => pairs.has(`${r.from}>${r.to}`)).map((r) => r.id));
}
/** The first level where a rider can be met (shown on locked entries). */
export function riderLevel(r: Rider): number {
  const i = LEVELS.findIndex((L) => L.groups.some((g) => L.stations[g.s].glyph === r.from && g.g === r.to));
  return i + 1;
}

// ── Backup code ──
const B36 = (n: number) => Math.max(0, Math.floor(n)).toString(36);
function sum(s: string): string {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1679616; // 36^4
  return h.toString(36).padStart(4, "0");
}
/** "SZ1-<level>-<coins>-<hints>-<breathers>-<stars>-<garden>-<check>" — letters and digits only between dashes. */
export function backupCode(p: PlayerState): string {
  const done = Math.max(0, Math.min(LEVELS.length, p.level - 1));
  const stars = Array.from({ length: done }, (_, i) => String(Math.max(0, Math.min(3, p.stars?.[String(i + 1)] ?? 0)))).join("") || "0";
  const garden = GARDEN.reduce((m, g, i) => ((p.garden ?? []).includes(g.id) ? m | (1 << i) : m), 0);
  const body = ["SZ1", B36(p.level), B36(p.coins), B36(p.hints ?? 0), B36(p.breathers ?? 0), stars, B36(garden)].join("-");
  const up = body.toUpperCase();
  return `${up}-${sum(up).toUpperCase()}`;
}
export function readBackup(code: string): Partial<PlayerState> | null {
  const c = code.trim().toUpperCase().replace(/\s+/g, "");
  const parts = c.split("-");
  if (parts.length !== 8 || parts[0] !== "SZ1") return null;
  const body = parts.slice(0, 7).join("-");
  if (sum(body).toUpperCase() !== parts[7]) return null;
  const n = (s: string) => parseInt(s, 36);
  const level = n(parts[1]), coins = n(parts[2]), hints = n(parts[3]), breathers = n(parts[4]), garden = n(parts[6]);
  if (![level, coins, hints, breathers, garden].every(Number.isFinite) || !/^[0-3]+$/.test(parts[5])) return null;
  const stars: Record<string, number> = {};
  Array.from(parts[5]).forEach((d, i) => { if (i < level - 1 && d !== "0") stars[String(i + 1)] = Number(d); });
  return {
    level: Math.max(1, Math.min(LEVELS.length + 1, level)), coins, hints, breathers, stars, tutorialDone: level > 2 || store.get().tutorialDone,
    garden: GARDEN.filter((_, i) => (garden >> i) & 1).map((g) => g.id),
  };
}
