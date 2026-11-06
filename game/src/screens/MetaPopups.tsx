import { useEffect, useState } from "react";
import { Image, Linking, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { GameButton, Icon, Popup, Tappable, feedback, fonts, palette, springs } from "../ui";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { CHAPTERS } from "../game/levels";
import {
  JOURNAL, LINE_SKINS, TIER_STARS, TRAIN_SKINS, applyLineSkin, backupCode, cityStars, cityTier, metRiders, readBackup, riderLevel, skinUnlocked, unlockText,
  type Rider,
} from "../game/collections";
import { GLYPH_LABEL } from "../game/meta";
import { art } from "../art";
import { GLYPH_IMG, TOKEN } from "../gameArt";

/**
 * Mastery & Skins (GDD): every city's 5-tier mastery track (6 / 12 / 20 / 28 / 34 of its 36 stars) and the line
 * colour skins / train liveries its tiers unlock. Equipping one recolours the lines on every map at once.
 */
export function MasteryPopup({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [p, setP] = useState(store.get());
  useEffect(() => store.subscribe(setP), []);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (visible) { setNote(null); analytics.track("mastery_view"); } }, [visible]);
  const equipLine = (id: string, name: string) => {
    store.set({ lineSkin: id });
    applyLineSkin(id);
    feedback("unlock", "medium");
    setNote(`${name} lines equipped: every map now uses them.`);
    analytics.track("skin_equip", { kind: "line", id });
  };
  const equipTrain = (id: string, name: string) => {
    store.set({ trainSkin: id });
    feedback("unlock", "medium");
    setNote(`${name} livery equipped on every train.`);
    analytics.track("skin_equip", { kind: "train", id });
  };
  const lineSkin = LINE_SKINS.find((k) => k.id === p.lineSkin) ?? LINE_SKINS[0];
  const livery = TRAIN_SKINS.find((k) => k.id === p.trainSkin) ?? TRAIN_SKINS[0];
  return (
    <Popup visible={visible} title="Mastery & Skins" onClose={onClose}>
      {/* the equipped look, live */}
      <View style={styles.preview}>
        {lineSkin.colors.slice(0, 4).map((c, i) => <View key={i} style={[styles.previewLine, { backgroundColor: c, top: 14 + i * 14 }]} />)}
        <View style={styles.previewTrain}>
          {livery.color ? <View style={[styles.livery, { backgroundColor: livery.color }]} /> : null}
          <Image source={art.train_capsule} style={{ width: 54, height: 46 }} fadeDuration={0} />
        </View>
      </View>
      <Text style={styles.equipped}>{lineSkin.name} lines · {livery.name}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}

      <Text style={styles.section}>Line colours</Text>
      <View style={styles.grid}>
        {LINE_SKINS.map((k) => {
          const open = skinUnlocked(p, k);
          const on = lineSkin.id === k.id;
          return (
            <SkinCard key={k.id} title={k.name} on={on} open={open} lock={unlockText(k)} onPress={() => (open ? equipLine(k.id, k.name) : setNote(`Reach ${unlockText(k)} to unlock ${k.name}.`))}>
              <View style={styles.swatches}>{k.colors.slice(0, 4).map((c, i) => <View key={i} style={[styles.swatch, { backgroundColor: c }]} />)}</View>
            </SkinCard>
          );
        })}
      </View>

      <Text style={styles.section}>Train liveries</Text>
      <View style={styles.grid}>
        {TRAIN_SKINS.map((k) => {
          const open = skinUnlocked(p, k);
          const on = livery.id === k.id;
          return (
            <SkinCard key={k.id} title={k.name} on={on} open={open} lock={unlockText(k)} onPress={() => (open ? equipTrain(k.id, k.name) : setNote(`Reach ${unlockText(k)} to unlock ${k.name}.`))}>
              <View style={{ width: 44, height: 38, alignItems: "center", justifyContent: "flex-end" }}>
                {k.color ? <View style={[styles.livery, { backgroundColor: k.color, width: 40 }]} /> : null}
                <Image source={art.train_capsule} style={{ width: 44, height: 37 }} fadeDuration={0} />
              </View>
            </SkinCard>
          );
        })}
      </View>
      <Text style={styles.section}>City mastery</Text>
      {CHAPTERS.map((c, ci) => {
        const { got, max } = cityStars(p.stars, ci);
        const tier = cityTier(p.stars, ci);
        return (
          <View key={ci} style={styles.cityRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cityName} numberOfLines={1} adjustsFontSizeToFit>{ci + 1}. {c.name}</Text>
              <Text style={styles.cityStars}>★ {got}/{max} · tier {tier}/5</Text>
            </View>
            <View style={styles.pips}>
              {TIER_STARS.map((t, k) => <View key={k} style={[styles.pip, k < tier && styles.pipOn]}><Text style={[styles.pipText, k < tier && styles.pipTextOn]}>{k + 1}</Text></View>)}
            </View>
          </View>
        );
      })}

      <GameButton style={{ marginTop: 14 }} label="Done" onPress={onClose} />
    </Popup>
  );
}

function SkinCard({ title, on, open, lock, onPress, children }: { title: string; on: boolean; open: boolean; lock: string; onPress: () => void; children: React.ReactNode }) {
  const pop = useSharedValue(1);
  useEffect(() => { if (on) pop.value = withSequence(withTiming(1.08, { duration: 110 }), withSpring(1, springs.pop)); }, [on, pop]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Animated.View style={[styles.cardWrap, st]}>
      <Tappable onPress={onPress} scaleTo={0.9} sound={open ? "pop" : "tap"} style={[styles.card, on && styles.cardOn, !open && styles.cardLocked]} accessibilityLabel={title}>
        <View style={{ opacity: open ? 1 : 0.4 }}>{children}</View>
        <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
        <Text style={[styles.cardState, on && { color: palette.primaryDark }]} numberOfLines={2}>{on ? "Equipped ✓" : open ? "Tap to equip" : `🔒 ${lock}`}</Text>
      </Tappable>
    </Animated.View>
  );
}

/**
 * Passenger Journal (GDD): 12 regular riders, each met by winning a level where a station of one glyph sends riders
 * to another. Met riders open their story card; the rest say where to meet them.
 */
export function JournalPopup({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [p, setP] = useState(store.get());
  useEffect(() => store.subscribe(setP), []);
  const met = metRiders(p.stars);
  const [open, setOpen] = useState<Rider | null>(null);
  useEffect(() => { if (visible) { setOpen(null); analytics.track("journal_view", { met: met.size }); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Popup visible={visible} title="Passenger Journal" onClose={onClose}>
      <Text style={styles.sub}>{met.size} of {JOURNAL.length} riders met · win levels to meet more</Text>
      {open ? (
        <View style={styles.story}>
          <View style={styles.storyHead}>
            <Image source={art.passenger_pip} style={{ width: 30, height: 46 }} fadeDuration={0} />
            <View style={{ flex: 1 }}>
              <Text style={styles.storyName}>{open.name}</Text>
              <View style={styles.route}>
                <Image source={GLYPH_IMG[open.from]} style={styles.routeGlyph} fadeDuration={0} />
                <Text style={styles.routeText}>{GLYPH_LABEL[open.from]} → {GLYPH_LABEL[open.to]}</Text>
                <Image source={GLYPH_IMG[open.to]} style={styles.routeGlyph} fadeDuration={0} />
              </View>
            </View>
          </View>
          <Text style={styles.storyText}>{open.story}</Text>
          <GameButton size="sm" variant="light" label="Back to the journal" onPress={() => setOpen(null)} />
        </View>
      ) : (
        <View style={styles.grid}>
          {JOURNAL.map((r) => {
            const known = met.has(r.id);
            return (
              <View key={r.id} style={styles.cardWrap}>
                <Tappable
                  onPress={() => (known ? setOpen(r) : feedback("error", "light"))}
                  scaleTo={0.9}
                  sound={known ? "pop" : "tap"}
                  style={[styles.card, !known && styles.cardLocked]}
                  accessibilityLabel={known ? r.name : "Unmet rider"}
                >
                  <View style={styles.riderArt}>
                    <Image source={art.passenger_pip} style={{ width: 24, height: 37, opacity: known ? 1 : 0.35 }} fadeDuration={0} />
                    <Image source={GLYPH_IMG[r.to]} style={[styles.riderGlyph, { opacity: known ? 1 : 0.35 }]} fadeDuration={0} />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit>{known ? r.name.split(",")[0] : "???"}</Text>
                  <Text style={styles.cardState} numberOfLines={2}>{known ? "Read story" : `${GLYPH_LABEL[r.from]} → ${GLYPH_LABEL[r.to]} · Lv ${riderLevel(r)}`}</Text>
                </Tappable>
              </View>
            );
          })}
        </View>
      )}
      <GameButton style={{ marginTop: 14 }} label="Close" onPress={onClose} />
    </Popup>
  );
}

/**
 * Account & Save (GDD "Account and Cloud Save"), account-free by design: progress saves on this phone after every
 * week and win; a backup code (letters and digits) moves it to another phone — no sign-in, no network, no personal data.
 */
export function AccountPopup({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [p, setP] = useState(store.get());
  useEffect(() => store.subscribe(setP), []);
  const [code, setCode] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [note, setNote] = useState<string | null>(null);
  // email step: the address stays in this dialog only (never saved, never sent by the game) — it addresses the
  // message the player's OWN mail app sends to themselves with the backup code
  const [email, setEmail] = useState("");
  const [mailed, setMailed] = useState<{ to: string; code: string } | null>(null);
  useEffect(() => { if (visible) { setCode(null); setInput(""); setNote(null); setEmail(""); setMailed(null); } }, [visible]);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const byEmail = () => {
    if (!emailOk) { feedback("error", "light"); setNote("Type your email address, like name@example.com."); return; }
    const c = backupCode(store.get());
    store.set({ backupAt: Date.now() });
    setMailed({ to: email.trim(), code: c });
    setEmail("");
    feedback("unlock", "medium");
    analytics.track("account_linked", { method: "email_code" });
  };
  const openMail = () => {
    if (!mailed) return;
    const body = `My Station Zen backup code:\n\n${mailed.code}\n\nOn the new phone: Settings > Account & Save > enter the code.`;
    Linking.openURL(`mailto:${encodeURIComponent(mailed.to)}?subject=${encodeURIComponent("Station Zen backup code")}&body=${encodeURIComponent(body)}`)
      .catch(() => setNote("No email app found. Write the code down instead."));
  };
  const totalStars = Object.values(p.stars ?? {}).reduce((a, b) => a + b, 0);
  const make = () => {
    setCode(backupCode(store.get()));
    store.set({ backupAt: Date.now() });
    feedback("unlock", "medium");
    analytics.track("backup_code");
  };
  const restore = () => {
    const patch = readBackup(input);
    if (!patch) { feedback("error", "light"); setNote("That code doesn't look right. Check each letter and dash."); return; }
    store.set({ ...patch, run: null });
    feedback("success", "success");
    setNote(`Progress restored: level ${patch.level}, ${Object.values(patch.stars ?? {}).reduce((a, b) => a + b, 0)} stars.`);
    setInput("");
    analytics.track("backup_restore");
  };
  return (
    <Popup visible={visible} title="Account & Save" onClose={onClose}>
      <View style={styles.saveCard}>
        <Icon name="trophy" size={30} tint={palette.primaryDark} />
        <View style={{ flex: 1 }}>
          <Text style={styles.saveTitle}>Saved on this phone ✓</Text>
          <Text style={styles.saveBody}>Level {Math.min(p.level, 120)} · {totalStars} stars · {p.coins} Tokens. No password and no account to create.</Text>
        </View>
      </View>
      <Text style={styles.section}>Sign in with email (code)</Text>
      {mailed ? (
        <View style={styles.codeBox}>
          <Text style={styles.saveTitle}>Your code is ready for {mailed.to}</Text>
          <Text selectable style={styles.code}>{mailed.code}</Text>
          <Text style={styles.saveBody}>Tap "Open my email app" to send it to yourself. On a new phone, enter the code from that email below to sign in and restore.</Text>
          <GameButton size="sm" variant="secondary" label="Open my email app" onPress={openMail} />
        </View>
      ) : (
        <>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Your email address"
            placeholderTextColor={palette.inkSoft}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            style={styles.input}
          />
          <GameButton size="sm" variant="primary" label="Email me a sign-in code" onPress={byEmail} />
          <Text style={styles.small}>Your email isn't stored or sent anywhere by Station Zen: your own mail app sends the code to you.</Text>
        </>
      )}
      <Text style={styles.section}>{mailed ? "Enter your code" : "Or move with a backup code"}</Text>
      {code ? (
        <View style={styles.codeBox}>
          <Text selectable style={styles.code}>{code}</Text>
          <Text style={styles.saveBody}>Write this code down (long-press to copy). Enter it on the new phone below.</Text>
        </View>
      ) : null}
      <GameButton size="sm" variant="light" label={code ? "Make a fresh code" : "Show my backup code"} onPress={make} />
      <TextInput
        value={input}
        onChangeText={(t) => setInput(t.replace(/[^0-9a-zA-Z-]/g, "").toUpperCase())}
        placeholder={mailed ? "Enter the code from your email" : "Enter a backup code"}
        placeholderTextColor={palette.inkSoft}
        autoCapitalize="characters"
        autoCorrect={false}
        style={styles.input}
      />
      <GameButton size="sm" variant={mailed ? "primary" : "light"} label="Sign in with code" disabled={input.length < 12} onPress={restore} />
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <GameButton style={{ marginTop: 12 }} label="Done" onPress={onClose} />
    </Popup>
  );
}

// ── Season Pass (free track) ──
const SEASON_DAYS = 56; // 8-week seasons
const SEASON_EPOCH = Date.UTC(2026, 0, 5); // a Monday
const SEASON_THEMES = ["Cherry Blossom", "Summer Lanterns", "Harvest Glow", "First Snow", "Spring Rain", "Starry Nights"];
type Reward = { k: "coins" | "hints" | "breathers"; n: number };
export const SEASON_TIERS: { at: number; r: Reward }[] = [
  { at: 0, r: { k: "coins", n: 30 } }, { at: 3, r: { k: "hints", n: 1 } }, { at: 6, r: { k: "coins", n: 50 } }, { at: 10, r: { k: "breathers", n: 1 } },
  { at: 15, r: { k: "coins", n: 80 } }, { at: 21, r: { k: "hints", n: 2 } }, { at: 28, r: { k: "coins", n: 120 } }, { at: 36, r: { k: "breathers", n: 2 } },
  { at: 45, r: { k: "coins", n: 160 } }, { at: 55, r: { k: "coins", n: 250 } },
];
const rewardText = (r: Reward) => (r.k === "coins" ? `${r.n} Tokens` : r.k === "hints" ? `${r.n} Hint${r.n > 1 ? "s" : ""}` : `${r.n} Breather${r.n > 1 ? "s" : ""}`);
export function seasonNow(now = Date.now()) {
  const day = Math.floor((now - SEASON_EPOCH) / 86400000);
  const id = Math.floor(day / SEASON_DAYS);
  return { id, theme: SEASON_THEMES[((id % SEASON_THEMES.length) + SEASON_THEMES.length) % SEASON_THEMES.length], left: SEASON_DAYS - (day - id * SEASON_DAYS) };
}

/**
 * Season Pass (GDD, free track): every star won this 8-week season fills the pass; each tier gives Tokens, Hints or
 * Breathers, claimed with a tap. No paid track and nothing random: every reward is shown before it is earned.
 */
export function SeasonPopup({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [p, setP] = useState(store.get());
  useEffect(() => store.subscribe(setP), []);
  const [note, setNote] = useState<string | null>(null);
  const season = seasonNow();
  const total = Object.values(p.stars ?? {}).reduce((a, b) => a + b, 0);
  useEffect(() => {
    if (!visible) return;
    setNote(null);
    const cur = store.get().season;
    if (!cur || cur.id !== season.id) store.set({ season: { id: season.id, base: total, claimed: [] } });
    analytics.track("season_view", { season: season.id });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const sp = p.season && p.season.id === season.id ? p.season : { id: season.id, base: total, claimed: [] as number[] };
  const pts = Math.max(0, total - sp.base);
  const next = SEASON_TIERS.find((t) => t.at > pts);
  const claim = (i: number) => {
    const t = SEASON_TIERS[i];
    if (pts < t.at || sp.claimed.includes(i)) return;
    const cur = store.get();
    const patch = t.r.k === "coins" ? { coins: cur.coins + t.r.n } : t.r.k === "hints" ? { hints: (cur.hints ?? 0) + t.r.n } : { breathers: (cur.breathers ?? 0) + t.r.n };
    store.set({ ...patch, season: { ...sp, claimed: [...sp.claimed, i] } });
    feedback("success", "success");
    setNote(`Claimed: +${rewardText(t.r)}`);
    analytics.track("season_claim", { tier: i + 1 });
  };
  return (
    <Popup visible={visible} title="Season Pass" onClose={onClose}>
      <View style={styles.seasonHead}>
        <Text style={styles.seasonTheme}>Season {season.id + 1} · {season.theme}</Text>
        <Text style={styles.sub}>★ {pts} this season · {season.left} days left{next ? ` · next tier at ★ ${next.at}` : " · pass complete"}</Text>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {SEASON_TIERS.map((t, i) => {
        const got = sp.claimed.includes(i), ready = pts >= t.at && !got;
        return (
          <View key={i} style={[styles.tierRow, ready && styles.tierReady, got && styles.tierGot]}>
            <View style={[styles.pip, (ready || got) && styles.pipOn]}><Text style={[styles.pipText, (ready || got) && styles.pipTextOn]}>{i + 1}</Text></View>
            {t.r.k === "coins" ? <Image source={TOKEN} style={{ width: 26, height: 26 }} fadeDuration={0} /> : <Icon name={t.r.k === "hints" ? "bulb" : "cloud"} size={24} tint={t.r.k === "hints" ? palette.gold : palette.secondaryDark} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.cityName}>{rewardText(t.r)}</Text>
              <Text style={styles.cityStars}>{t.at === 0 ? "Welcome gift" : `at ★ ${t.at}`}</Text>
            </View>
            {got ? <Text style={styles.claimed}>Claimed ✓</Text> : ready ? (
              <GameButton size="sm" variant="accent" label="Claim" onPress={() => claim(i)} />
            ) : <Icon name="lock" size={20} tint={palette.inkSoft} />}
          </View>
        );
      })}
      <Text style={styles.small}>Free for everyone, nothing random. Win levels for stars; the pass resets every 8 weeks.</Text>
      <GameButton style={{ marginTop: 12 }} label="Done" onPress={onClose} />
    </Popup>
  );
}

const styles = StyleSheet.create({
  seasonHead: { alignItems: "center", gap: 2, marginBottom: 6 },
  seasonTheme: { fontFamily: fonts.display, fontSize: 18, color: palette.accentDark },
  tierRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, backgroundColor: palette.surfaceAlt, marginBottom: 6 },
  tierReady: { backgroundColor: "#FFF3D6", borderWidth: 2, borderColor: palette.gold },
  tierGot: { backgroundColor: "#EAF7F2" },
  claimed: { fontFamily: fonts.display, fontSize: 14, color: palette.primaryDark },
  section: { fontFamily: fonts.display, fontSize: 16, color: palette.inkSoft, marginTop: 12, marginBottom: 6, letterSpacing: 0.5 },
  sub: { fontFamily: fonts.body, fontSize: 14, color: palette.inkSoft, textAlign: "center", marginTop: -8, marginBottom: 10 },
  note: { fontFamily: fonts.body, fontSize: 14, color: palette.primaryDark, textAlign: "center", marginVertical: 6 },
  preview: { height: 82, borderRadius: 16, backgroundColor: "#E9F1DA", borderWidth: 2, borderColor: "#FFFFFF", overflow: "hidden" },
  previewLine: { position: "absolute", left: 12, right: 12, height: 8, borderRadius: 4 },
  previewTrain: { position: "absolute", right: 22, top: 18, width: 54, height: 46, alignItems: "center", justifyContent: "flex-end" },
  livery: { position: "absolute", bottom: -3, width: 50, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: "#FFFFFF" },
  equipped: { fontFamily: fonts.display, fontSize: 15, color: palette.ink, textAlign: "center", marginTop: 6 },
  cityRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, backgroundColor: palette.surfaceAlt, marginBottom: 5 },
  cityName: { fontFamily: fonts.display, fontSize: 14.5, color: palette.ink },
  cityStars: { fontFamily: fonts.body, fontSize: 12, color: palette.inkSoft },
  pips: { flexDirection: "row", gap: 3 },
  pip: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#E6DCCB", borderWidth: 1.5, borderColor: "#D2C3AA" },
  pipOn: { backgroundColor: palette.gold, borderColor: palette.accentDark },
  pipText: { fontFamily: fonts.display, fontSize: 11, color: palette.inkSoft },
  pipTextOn: { color: "#FFFDF6" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  cardWrap: { width: "31.5%" },
  card: { alignItems: "center", gap: 3, padding: 8, minHeight: 112, borderRadius: 16, backgroundColor: "#FFFDF6", borderWidth: 2, borderColor: palette.paperEdge },
  cardOn: { borderColor: palette.primary, borderWidth: 3, backgroundColor: "#EAF7F2" },
  cardLocked: { backgroundColor: palette.surfaceAlt },
  cardTitle: { fontFamily: fonts.display, fontSize: 13.5, color: palette.ink },
  cardState: { fontFamily: fonts.bodyRegular, fontSize: 11, color: palette.inkSoft, textAlign: "center" },
  swatches: { width: 50, height: 38, justifyContent: "center", gap: 3 },
  swatch: { height: 6, borderRadius: 3 },
  riderArt: { width: 46, height: 40, alignItems: "center", justifyContent: "flex-end" },
  riderGlyph: { position: "absolute", right: 0, top: 0, width: 20, height: 20 },
  story: { gap: 10, padding: 12, borderRadius: 18, backgroundColor: "#FFFDF6", borderWidth: 2, borderColor: palette.paperEdge },
  storyHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  storyName: { fontFamily: fonts.display, fontSize: 18, color: palette.ink },
  route: { flexDirection: "row", alignItems: "center", gap: 5 },
  routeGlyph: { width: 20, height: 20 },
  routeText: { fontFamily: fonts.body, fontSize: 13, color: palette.inkSoft },
  storyText: { fontFamily: fonts.bodyRegular, fontSize: 15, color: palette.ink, lineHeight: 21 },
  saveCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, backgroundColor: "#EAF7F2", borderWidth: 2, borderColor: palette.primary },
  saveTitle: { fontFamily: fonts.display, fontSize: 16, color: palette.primaryDark },
  saveBody: { fontFamily: fonts.bodyRegular, fontSize: 13, color: palette.inkSoft },
  codeBox: { padding: 10, borderRadius: 14, backgroundColor: "#FFF3D6", borderWidth: 1.5, borderColor: palette.gold, marginBottom: 8, gap: 4 },
  code: { fontFamily: fonts.display, fontSize: 16, color: palette.ink, textAlign: "center", letterSpacing: 1 },
  input: {
    marginTop: 10, marginBottom: 8, height: 48, paddingHorizontal: 12, borderRadius: 14, borderWidth: 2, borderColor: palette.paperEdge, backgroundColor: "#FFFDF6",
    fontFamily: fonts.body, fontSize: 15, color: palette.ink,
  },
  small: { fontFamily: fonts.bodyRegular, fontSize: 11.5, color: palette.inkSoft, textAlign: "center", marginTop: 8 },
});
