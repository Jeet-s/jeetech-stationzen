import { Platform, Settings } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { analytics } from "./analytics";
import { qa } from "./qa";

/**
 * In-app review — factory-owned (owner, 2026-10-25).
 *
 * Uses the official Google Play In-App Review API (expo-store-review → Play's ReviewManager; SKStoreReviewController
 * on iOS). Play decides whether the card is actually shown and enforces its own quota; the call returns either way.
 *
 * GAMES: call review.levelWon(levelNumber) right after analytics.track("level_complete"). It asks only when
 *   - the won level is >= MIN_LEVEL (never during the first levels / tutorial),
 *   - the last ask was more than COOLDOWN_DAYS ago (timestamp persisted in AsyncStorage),
 *   - and never in factory QA (qa level replay, iOS -AGFQA) or on an emulator (the factory's QA AVDs ship the Play
 *     Store, so the API is not guaranteed to be a no-op there — a review card must never cover the board).
 *
 * Google Play policy: never gate a feature on reviewing, never ask for a specific rating ("rate us 5 stars"), never
 * reward/incentivize a review, never show your own "do you like this game?" pre-prompt before it. Just call this.
 */
const MIN_LEVEL = 3;
const COOLDOWN_DAYS = 30;
const DELAY_MS = 1800; // let the win popup's stars + coin count land first
const KEY = "agf_review_v1";

interface ReviewState { lastAsk: number; asks: number }

const iosQa = Platform.OS === "ios" && !!(Settings.get?.("AGFQA") as unknown);

/** Android emulators (incl. the Play-Store AVDs the factory QA runs on): sdk_gphone*, generic*, emulator builds. */
function isEmulator(): boolean {
  if (Platform.OS !== "android") return false;
  const c = Platform.constants;
  const id = `${c.Fingerprint ?? ""} ${c.Model ?? ""} ${c.Brand ?? ""}`;
  return /generic|emulator|sdk_gphone|google_sdk|emu64|ranchu|goldfish|vbox/i.test(id);
}

/** True while the factory's QA (or an emulator) runs the game: the review flow must stay out of its way. */
export function reviewBlocked(): boolean {
  return qa.level != null || iosQa || isEmulator();
}

let pending = false;

async function load(): Promise<ReviewState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return { lastAsk: 0, asks: 0, ...(JSON.parse(raw) as Partial<ReviewState>) };
  } catch {
    // unreadable → treat as never asked
  }
  return { lastAsk: 0, asks: 0 };
}

async function ask(reason: Record<string, string | number | boolean>): Promise<void> {
  if (pending || reviewBlocked()) return;
  pending = true;
  try {
    const s = await load();
    if (Date.now() - s.lastAsk < COOLDOWN_DAYS * 86_400_000) return;
    // Without the native module isAvailableAsync() is false; requestReview() would otherwise fall back to opening the
    // store page (leaving the app) — never do that.
    if (!(await StoreReview.isAvailableAsync().catch(() => false))) return;
    await AsyncStorage.setItem(KEY, JSON.stringify({ lastAsk: Date.now(), asks: s.asks + 1 })).catch(() => {});
    await new Promise((r) => setTimeout(r, DELAY_MS));
    if (reviewBlocked()) return;
    analytics.track("review_prompt", reason);
    await StoreReview.requestReview().catch(() => {});
  } catch {
    // reviews must never affect play
  } finally {
    pending = false;
  }
}

export const review = {
  /** A level was just won (natural positive moment). Fire-and-forget; never await it in gameplay code. */
  levelWon(level: number): void {
    if (!Number.isFinite(level) || level < MIN_LEVEL) return;
    void ask({ level });
  },
};
