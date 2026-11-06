import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text } from "react-native";
import { Popup } from "./Popup";
import { Toggle } from "./Toggle";
import { GameButton } from "./GameButton";
import { store } from "../modules/store";
import { iap } from "../modules/iap";
import { share } from "../modules/share";
import { fonts, palette } from "./theme";
import { notify } from "../modules/notify";
import { analytics } from "../modules/analytics";
import { AccountPopup } from "../screens/MetaPopups";

/** Daily reminder (opt-in only: permission is asked when the player turns it on, never on first launch). */
export async function setReminders(on: boolean): Promise<void> {
  store.set({ reminders: on });
  if (!on) { await notify.cancel("daily"); return; }
  const ok = await notify.ask("A gentle daily nudge for your city");
  if (!ok) { store.set({ reminders: false }); return; }
  await notify.daily("daily", { hour: 19, minute: 0 }, { title: "Your stations are waiting", body: "A calm new level is ready to plan." });
}

/** Settings: sound, music, haptics, accessibility (line patterns, reduce motion), reminders, share, restore, privacy. */
export function SettingsPopup({ visible, onClose, privacyUrl, onTutorial }: { visible: boolean; onClose: () => void; privacyUrl?: string; onTutorial?: () => void }) {
  const [s, setS] = useState(store.get());
  const [account, setAccount] = useState(false);
  useEffect(() => store.subscribe(setS), []);
  return (
    <Popup visible={visible} title="Settings" onClose={onClose}>
      <AccountPopup visible={visible && account} onClose={() => setAccount(false)} />
      <GameButton size="sm" variant="primary" label="Account & Save (backup code)" onPress={() => setAccount(true)} />
      <Toggle label="Sound" value={s.sound !== false} onChange={(v) => store.set({ sound: v })} />
      <Toggle label="Music" value={s.music !== false} onChange={(v) => store.set({ music: v })} />
      <Toggle label="Vibration" value={s.haptics !== false} onChange={(v) => store.set({ haptics: v })} />
      <Text style={styles.section}>Accessibility</Text>
      <Toggle label="Colour-blind line patterns" value={!!s.patterns} onChange={(v) => { store.set({ patterns: v }); analytics.track("settings_changed", { patterns: v }); }} />
      <Toggle label="Reduce motion" value={!!s.reduceMotion} onChange={(v) => { store.set({ reduceMotion: v }); analytics.track("settings_changed", { reduceMotion: v }); }} />
      <Toggle label="Daily reminder" value={!!s.reminders} onChange={(v) => void setReminders(v)} />
      <Text style={styles.section}>Tutorial</Text>
      {/* the guided first level again (with its Skip tutorial button), from the start */}
      {onTutorial ? (
        <GameButton style={{ marginTop: 6 }} size="sm" variant="secondary" label="▶ Replay tutorial (level 1)" onPress={() => { store.set({ tutorialDone: false, tips: [] }); onTutorial(); }} />
      ) : null}
      <GameButton style={{ marginTop: 10 }} size="sm" variant="light" label={!s.tutorialDone && !(s.tips ?? []).length ? "Rule tips are on ✓" : "Show rule tips again"} onPress={() => store.set({ tutorialDone: false, tips: [] })} />
      {/* Share the game (src/modules/share.ts) — factory-owned, keep it (owner, 2026-10-25). */}
      <GameButton style={{ marginTop: 14 }} size="sm" variant="light" label="📤 Share with friends" onPress={() => void share.app("settings")} />
      <GameButton style={{ marginTop: 10 }} size="sm" variant="light" label="Restore purchases" onPress={() => iap.restore()} />
      {privacyUrl ? (
        <Text style={styles.link} onPress={() => Linking.openURL(privacyUrl)}>Privacy policy</Text>
      ) : null}
      <GameButton style={{ marginTop: 14 }} label="Done" onPress={onClose} />
    </Popup>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: fonts.display, fontSize: 15, color: palette.inkSoft, marginTop: 8, letterSpacing: 0.5 },
  link: { fontFamily: fonts.bodyRegular, color: palette.inkSoft, textAlign: "center", marginTop: 12, textDecorationLine: "underline" },
});
