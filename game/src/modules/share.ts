import { Share } from "react-native";
import app from "../../app.json";
import { analytics } from "./analytics";

/**
 * Share the game — factory-owned (owner, 2026-10-25). Opens the native share sheet (React Native's built-in Share,
 * no extra dependency) with a short line + the Google Play link. The package comes from app.json (written by the
 * factory per game), never hardcoded; the referrer tags installs as utm_source=share / utm_medium=app.
 *
 * Use it from a visible, labelled "Share" button the player pressed (Settings, the win popup) — never automatically,
 * and never reward it (Play policy forbids incentivizing installs/reviews through shares too).
 */
const pkg = app.expo.android.package;

export const playStoreUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&referrer=utm_source%3Dshare%26utm_medium%3Dapp`;

export const share = {
  /** `from` = where the button lives (analytics only), e.g. "settings" | "win". Resolves true if the user shared. */
  async app(from: string, message = `I'm playing ${app.expo.name} — come play with me!`): Promise<boolean> {
    analytics.track("share_open", { from });
    try {
      const r = await Share.share({ title: app.expo.name, message: `${message} ${playStoreUrl}` });
      const done = r.action === Share.sharedAction;
      if (done) analytics.track("share", { from });
      return done;
    } catch {
      return false;
    }
  },
};
