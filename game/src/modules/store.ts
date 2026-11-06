import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Tiny persisted player state (entitlements + currency). Loaded once at boot;
 * reads are synchronous afterwards so gameplay code stays simple.
 */
export interface PlayerState {
  adsRemoved: boolean;
  coins: number;
  level: number;
  /** Settings — default on. */
  sound?: boolean;
  music?: boolean;
  haptics?: boolean;
  /** Best stars per level id (progress map). */
  stars?: Record<string, number>;
  tutorialDone?: boolean;
  /** Boosters (earned with Tokens / rewarded video, never cash-only). */
  hints?: number;
  breathers?: number;
  /** Accessibility: colour-blind line patterns, reduce motion; daily reminder opt-in. */
  patterns?: boolean;
  reduceMotion?: boolean;
  reminders?: boolean;
  /** Mechanic tips already shown (ids). */
  tips?: string[];
  /** Saved run: the level and its state at the start of the current week (resume after leaving / app kill). */
  run?: { level: number; state: unknown; sig: string } | null;
  /** Daily puzzle streak (src/game/modes.ts). */
  daily?: { last: string; streak: number; best: number; freezes: number; freezeWeek: number };
  /** Duels: record + transparent rating. */
  duel?: { wins: number; losses: number; rating: number; botGames?: number };
  /** Station Garden pieces owned (ids). */
  garden?: string[];
  /** Mastery skins equipped (src/game/collections.ts). */
  lineSkin?: string;
  trainSkin?: string;
  /** When progress was last saved / backed up (ms). */
  backupAt?: number;
  /** Season Pass (free track, src/screens/MetaPopups.tsx): the season it tracks, stars owned when it began, tiers claimed. */
  season?: { id: number; base: number; claimed: number[] };
  /** Heatmap Replay from Home: the most recent finished run (the planned state at every "Run week", level sig). */
  lastRun?: { level: number; sig: string; won: boolean; runs: unknown[]; at: number } | null;
}

const KEY = "player_state_v1";
let state: PlayerState = { adsRemoved: false, coins: 0, level: 1, sound: true, music: true, haptics: true, stars: {}, tutorialDone: false, hints: 3, breathers: 2, tips: [], run: null };
const listeners = new Set<(s: PlayerState) => void>();

export const store = {
  async load(): Promise<PlayerState> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) state = { ...state, ...(JSON.parse(raw) as Partial<PlayerState>) };
    } catch {
      // first launch / corrupted → defaults
    }
    return state;
  },
  get(): PlayerState {
    return state;
  },
  set(patch: Partial<PlayerState>): void {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
    AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  },
  subscribe(l: (s: PlayerState) => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
