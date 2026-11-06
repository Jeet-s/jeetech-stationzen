import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { CurrencyPill, GameButton, Icon, Tappable, fonts, palette } from "../ui";
import { store } from "../modules/store";
import { LEVELS } from "../game/levels";
import { CHAPTERS, SPECS } from "../game/levels";
import { CITY_LOOK } from "../game/meta";
import { streakToday } from "../game/modes";
import { cityTier } from "../game/collections";
import { SEASON_TIERS, seasonNow } from "./MetaPopups";
import { useBottomInset } from "../modules/layout";
import { art } from "../art";
import { GLYPH_IMG, TOKEN, type IconName } from "../gameArt";

/**
 * HOME = the title screen: a warm sky over the Willowmere map, the illustrated logo, Pip the station cat on its
 * little diorama (idle bob, glyph tokens drifting around), the current city's progress and ONE big "Play · Level N".
 * Levels / Shop / Settings are secondary round buttons. The level list lives on its own screen.
 */
export function HomeScreen({ onPlay, onLevels, onShop, onSettings, onDaily, onOnline, onGarden, onMastery, onSeason, onReplay }: {
  onPlay: (levelNumber: number) => void; onLevels: () => void; onShop: () => void; onSettings: () => void;
  onDaily: () => void; onOnline: () => void; onGarden: () => void; onMastery: () => void; onSeason: () => void;
  /** Heatmap Replay of the most recent finished run (or a labelled demo of level 1). */
  onReplay: () => void;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const { width, height } = useWindowDimensions();
  const [s, setS] = useState(store.get());
  useEffect(() => store.subscribe(setS), []);
  const current = Math.min(LEVELS.length, Math.max(1, s.level));
  const ch = SPECS[current - 1].chapter;
  const city = CHAPTERS[ch];
  const first = SPECS.findIndex((x) => x.chapter === ch);
  const done = Math.max(0, Math.min(city.levels.length, current - 1 - first));
  const totalStars = Object.values(s.stars ?? {}).reduce((a, b) => a + b, 0);
  const look = CITY_LOOK[ch];
  const daily = streakToday();
  // Season Pass: a dot when a tier is ready to claim
  const season = seasonNow();
  const sp = s.season && s.season.id === season.id ? s.season : null;
  const seasonReady = SEASON_TIERS.filter((t, i) => (sp ? totalStars - sp.base : 0) >= t.at && !(sp?.claimed ?? []).includes(i)).length;

  // Idle life: logo floats, hero bobs, Play breathes.
  const float = useSharedValue(0);
  const breathe = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    breathe.value = withDelay(900, withRepeat(withSequence(withTiming(1, { duration: 800 }), withTiming(0, { duration: 800 })), -1));
  }, [float, breathe]);
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -4 + float.value * 8 }] }));
  const heroStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 + float.value * 10 }, { rotate: `${-1 + float.value * 2}deg` }] }));
  const shadowStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: 1.04 - float.value * 0.08 }], opacity: 0.32 - float.value * 0.08 }));
  const playStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breathe.value * 0.035 }] }));

  // Every block is in the layout flow and sized to the room actually left (layout_small 2026-11-06, twice: on a
  // 360x640 phone with the banner the hero area measured ~0 dp and absolutely placed mode badges fell onto the city
  // card). The hero row = mode badges | Pip | mode badges; it is measured, Pip scales to it and the badge columns
  // turn into side-by-side pairs when two stacked badges don't fit its height.
  const short = height < 720;
  const logoW = short ? Math.min(width * 0.52, 260) : Math.min(width * 0.8, 380);
  const [heroBox, setHeroBox] = useState({ w: 0, h: 0 });
  // a 100 dp banner on a 360x640 phone leaves the hero row ~100 dp: badges pair up, and shrink if even a pair won't fit
  const badge = !short ? 60 : heroBox.h > 0 && heroBox.h < 50 + 30 ? 42 : 50;
  const stackH = 2 * (badge + 26) + 8;
  const paired = heroBox.h > 0 && heroBox.h < stackH;
  const sideW = paired ? 2 * (badge + 8) + 4 : badge + 16;
  const heroW = Math.max(0, Math.min(width * 0.56, 320, heroBox.h > 0 ? (heroBox.h - 6) / (512 / 470) : height * 0.29, heroBox.w > 0 ? heroBox.w - 2 * sideW - 8 : width * 0.5));

  return (
    <View style={styles.root}>
      <Image source={art[look.bg]} style={[styles.abs, { width, height }]} resizeMode="cover" fadeDuration={0} />
      <View style={[styles.abs, { width, height, backgroundColor: look.wash }]} />
      {/* a warm sky fading into the map */}
      <LinearGradient colors={["#7FC4E8", "rgba(170,220,236,0.85)", "rgba(232,243,236,0)"]} locations={[0, 0.5, 1]} style={[styles.abs, { width, height: height * 0.5 }]} />
      <Cloud y={insets.top + 70} size={110} from={-120} to={width + 40} dur={52000} delay={0} />
      <Cloud y={insets.top + 150} size={80} from={width + 20} to={-110} dur={64000} delay={4000} />
      <LinearGradient colors={["rgba(246,235,217,0)", "rgba(246,235,217,0.7)", "rgba(246,235,217,0.95)"]} style={[styles.abs, { top: height * 0.6, width, height: height * 0.4 }]} />

      <View style={[styles.hud, { paddingTop: insets.top + 8 }]}>
        <CurrencyPill image={art.icon_star_reward} value={totalStars} />
        {/* Heatmap Replay in one tap from Home (tour 2026-11-06: only reachable from the result popups) */}
        <Tappable onPress={onReplay} scaleTo={0.88} hitSlop={8} style={styles.replay} accessibilityLabel="Heatmap Replay of your last run">
          <View style={styles.heatIcon}>
            <View style={[styles.heatDot, { backgroundColor: "#7CC59A", left: 1, top: 9 }]} />
            <View style={[styles.heatDot, { backgroundColor: "#F4D35E", left: 9, top: 1 }]} />
            <View style={[styles.heatDot, styles.heatHot, { left: 12, top: 11 }]} />
          </View>
          <Text style={styles.replayText} numberOfLines={1}>Heatmap</Text>
        </Tappable>
        <CurrencyPill image={TOKEN} value={s.coins} />
      </View>

      {/* `entering` outside, idle transform inside — never both on one view */}
      <Animated.View entering={FadeInDown.duration(500)} style={styles.logoArea}>
        <Animated.View style={logoStyle}>
          <Image source={art.logo} style={{ width: logoW, height: logoW * (411 / 900) }} resizeMode="contain" fadeDuration={0} accessibilityLabel="Station Zen" />
        </Animated.View>
        <Text style={[styles.tagline, short && { fontSize: 18, marginTop: -6 }]}>Calm Metro Builder</Text>
      </Animated.View>

      <View style={styles.heroRow} pointerEvents="box-none" onLayout={(e) => { const { width: w, height: h } = e.nativeEvent.layout; setHeroBox((o) => (Math.abs(o.w - w) > 1 || Math.abs(o.h - h) > 1 ? { w, h } : o)); }}>
        {/* modes on the left: today's puzzle and the Season Pass */}
        <View style={[styles.sideCol, paired && styles.sidePair, { width: sideW }]}>
          <SideBadge size={badge} icon="calendar" label="Daily" color="#F2A65A" dark="#B8661F" badge={daily.doneToday ? "✓" : daily.streak > 0 ? String(daily.streak) : "!"} onPress={onDaily} />
          <SideBadge size={badge} icon="flame" label="Season" color="#E46F8F" dark="#A9455F" badge={seasonReady ? String(seasonReady) : undefined} onPress={onSeason} />
        </View>
        <View style={styles.heroArea} pointerEvents="none">
          {heroW > 40 ? (
            <>
              <Animated.View style={[styles.heroShadow, { width: heroW * 0.78, height: heroW * 0.16, top: "50%", marginTop: heroW * 0.42 }, shadowStyle]} />
              <Animated.View style={heroStyle}>
                <Image source={art.hero_pip_cat} style={{ width: heroW, height: heroW * (512 / 470) }} resizeMode="contain" fadeDuration={0} />
              </Animated.View>
              <FloatToken glyph={0} x={-heroW * 0.5} y={-heroW * 0.4} size={Math.min(40, heroW * 0.22)} phase={0} />
              <FloatToken glyph={1} x={heroW * 0.46} y={-heroW * 0.46} size={Math.min(36, heroW * 0.2)} phase={700} />
              <FloatToken glyph={7} x={heroW * 0.5} y={heroW * 0.3} size={Math.min(40, heroW * 0.22)} phase={1400} />
              <FloatToken glyph={4} x={-heroW * 0.52} y={heroW * 0.32} size={Math.min(34, heroW * 0.19)} phase={2100} />
            </>
          ) : null}
        </View>
        {/* modes on the right: online duels and city skins */}
        <View style={[styles.sideCol, paired && styles.sidePair, { width: sideW }]}>
          <SideBadge size={badge} icon="duel" label="Duel" color={palette.secondaryDark} dark="#5E4C8C" onPress={onOnline} />
          <SideBadge size={badge} icon="trophy" label="Skins" color="#5FB3A6" dark="#3C7F75" onPress={onMastery} />
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: bottomInset + (short ? 6 : 12) }, short && { gap: 10 }]}>
        {/* the current city's progress (tap: mastery and skins) */}
        <Animated.View entering={FadeInUp.delay(150).duration(450)} style={styles.cardRow}>
          <Tappable onPress={onMastery} scaleTo={0.95} containerStyle={styles.chapterBox} style={[styles.chapter, short && { paddingVertical: 6, gap: 3 }]} accessibilityLabel="City mastery and skins">
            <Text style={styles.chapterName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>City {ch + 1} · {city.name}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(5, (done / city.levels.length) * 100)}%`, backgroundColor: look.accent }]} />
            </View>
            <View style={styles.cardFoot}>
              <Text style={styles.chapterCount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{done}/{city.levels.length} levels</Text>
              <View style={styles.masteryRow}>
                <Icon name="trophy" size={14} tint={palette.secondaryDark} />
                <Text style={styles.masteryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Mastery {cityTier(s.stars, ch)}/5</Text>
              </View>
            </View>
          </Tappable>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(250).duration(450)}>
          <Animated.View style={playStyle}>
            <GameButton label={`Play · Level ${current}`} icon={<Icon name="play" size={short ? 24 : 28} />} variant="accent" size={short ? "md" : "lg"} sound="whoosh" onPress={() => onPlay(current)} />
          </Animated.View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(350).duration(450)} style={styles.iconRow}>
          <HomeIcon size={short ? 48 : 62} icon="map" label="Levels" onPress={onLevels} />
          <HomeIcon size={short ? 48 : 62} icon="garden" label="Garden" onPress={onGarden} />
          <HomeIcon size={short ? 48 : 62} icon="cart" label="Shop" onPress={onShop} />
          <HomeIcon size={short ? 48 : 62} icon="gear" label="Settings" onPress={onSettings} />
        </Animated.View>
      </View>
    </View>
  );
}

function HomeIcon({ icon, label, onPress, size = 62 }: { icon: IconName; label: string; onPress: () => void; size?: number }) {
  const d = { width: size, height: size, borderRadius: size / 2 };
  return (
    <Tappable onPress={onPress} hitSlop={8} scaleTo={0.86} style={styles.round} accessibilityLabel={label}>
      <View style={[styles.roundLip, d]} />
      <LinearGradient colors={["#FFC27E", palette.accent]} style={[styles.roundFace, d]}>
        <Icon name={icon} size={Math.round(size * 0.55)} />
      </LinearGradient>
      <Text style={styles.roundLabel} numberOfLines={1}>{label}</Text>
    </Tappable>
  );
}

/** Round mode badge on the hero's side with an idle sway and a small count bubble. */
function SideBadge({ icon, label, color, dark, badge, onPress, ink, size = 60 }: { icon: IconName; label: string; color: string; dark: string; badge?: string; onPress: () => void; ink?: boolean; size?: number }) {
  const d = { width: size, height: size, borderRadius: size / 2 };
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t]);
  const sway = useAnimatedStyle(() => ({ transform: [{ rotate: `${-4 + t.value * 8}deg` }] }));
  // the count bubble pulses with the sway (a calm "something's waiting")
  const dot = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.14 * Math.sin(t.value * Math.PI) }] }));
  return (
    <Tappable onPress={onPress} hitSlop={8} scaleTo={0.84} style={styles.badgeWrap} accessibilityLabel={label}>
      <Animated.View style={sway}>
        <View style={[styles.badgeLip, d, { backgroundColor: dark }]} />
        <LinearGradient colors={["#FFFFFF55", color]} style={[styles.badgeFace, d, { backgroundColor: color }]}>
          <Icon name={icon} size={Math.round(size * 0.5)} />
        </LinearGradient>
        {badge ? <Animated.View style={[styles.badgeDot, dot]}><Text style={styles.badgeDotText}>{badge}</Text></Animated.View> : null}
      </Animated.View>
      <Text style={[styles.badgeLabel, ink && styles.badgeLabelInk, size < 50 && { fontSize: 12, marginTop: 3 }]} numberOfLines={1}>{label}</Text>
    </Tappable>
  );
}

function FloatToken({ glyph, x, y, size, phase }: { glyph: number; x: number; y: number; size: number; phase: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(phase, withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [t, phase]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: x - size / 2 }, { translateY: y - size / 2 - t.value * 10 }, { rotate: `${-8 + t.value * 16}deg` }] }));
  return (
    <Animated.View style={[styles.token, st]}>
      <Image source={GLYPH_IMG[glyph]} style={{ width: size, height: size }} fadeDuration={0} />
    </Animated.View>
  );
}

function Cloud({ y, size, from, to, dur, delay }: { y: number; size: number; from: number; to: number; dur: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: dur, easing: Easing.linear }), -1, false));
  }, [t, dur, delay]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: from + (to - from) * t.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.cloud, { top: y }, st]}>
      <View style={[styles.puff, { width: size, height: size * 0.42, borderRadius: size * 0.21, top: size * 0.2 }]} />
      <View style={[styles.puff, { width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25, left: size * 0.18 }]} />
      <View style={[styles.puff, { width: size * 0.38, height: size * 0.38, borderRadius: size * 0.19, left: size * 0.5, top: size * 0.08 }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bgBottom },
  abs: { position: "absolute", left: 0, top: 0 },
  hud: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, gap: 8 },
  replay: {
    flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingLeft: 8, paddingRight: 12, borderRadius: 999, backgroundColor: palette.secondaryDark,
    borderWidth: 2, borderColor: "#FFF9EE", shadowColor: palette.shadowInk, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  replayText: { fontFamily: fonts.display, fontSize: 15, color: "#FFFDF6" },
  heatIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFF9EE" },
  heatDot: { position: "absolute", width: 9, height: 9, borderRadius: 5 },
  heatHot: { width: 10, height: 10, backgroundColor: "#F29E4C" },
  cardRow: { alignSelf: "center", width: "100%", maxWidth: 420 },
  chapterBox: { width: "100%" },
  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  heroRow: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, marginTop: 4, minHeight: 0 },
  sideCol: { alignItems: "center", justifyContent: "center", gap: 8 },
  sidePair: { flexDirection: "row", gap: 4 },
  logoArea: { alignItems: "center", marginTop: 4, zIndex: 2 },
  tagline: {
    fontFamily: fonts.display, fontSize: 25, color: "#FFF6D6", marginTop: -8, letterSpacing: 0.5,
    textShadowColor: "#2F4858", textShadowOffset: { width: 0, height: 2.5 }, textShadowRadius: 3,
  },
  heroArea: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  heroShadow: { position: "absolute", borderRadius: 999, backgroundColor: "#1B2238", alignSelf: "center" },
  token: { position: "absolute", left: "50%", top: "50%" },
  cloud: { position: "absolute", left: 0, width: 120, height: 60 },
  puff: { position: "absolute", backgroundColor: "rgba(255,255,255,0.88)" },
  bottom: { paddingHorizontal: 22, gap: 14 },
  masteryRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10, backgroundColor: "rgba(184,165,217,0.25)" },
  masteryText: { fontFamily: fonts.display, fontSize: 13, color: palette.secondaryDark },
  chapter: {
    alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 22,
    backgroundColor: "rgba(255,249,238,0.94)", borderWidth: 2, borderColor: "#FFFFFF",
    shadowColor: palette.shadowInk, shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  chapterName: { fontFamily: fonts.display, fontSize: 17, color: palette.ink, maxWidth: "100%" },
  track: { width: "100%", height: 10, borderRadius: 5, backgroundColor: palette.surfaceAlt, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 5 },
  chapterCount: { fontFamily: fonts.body, fontSize: 12.5, color: palette.inkSoft, textAlign: "center" },
  iconRow: { flexDirection: "row", justifyContent: "center", gap: 18 },
  round: { alignItems: "center", gap: 4 },
  roundLip: { position: "absolute", top: 5, width: 62, height: 62, borderRadius: 31, backgroundColor: palette.accentDark },
  roundFace: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#FFF6D6" },
  badgeWrap: { alignItems: "center" },
  badgeLip: { position: "absolute", top: 5, width: 60, height: 60, borderRadius: 30 },
  badgeFace: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#FFF6D6" },
  badgeDot: {
    position: "absolute", right: -6, top: -6, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 5, alignItems: "center", justifyContent: "center",
    backgroundColor: palette.danger, borderWidth: 2, borderColor: "#FFF9EE",
  },
  badgeDotText: { fontFamily: fonts.display, fontSize: 13, color: "#FFFDF6" },
  badgeLabel: {
    fontFamily: fonts.display, fontSize: 14, color: "#FFFDF6", marginTop: 6,
    textShadowColor: "#2F4858", textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 2,
  },
  badgeLabelInk: { color: palette.ink, textShadowColor: "rgba(255,249,238,0.9)" },
  roundLabel: { fontFamily: fonts.display, fontSize: 14, color: palette.ink, marginTop: 4 },
});
