import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { CurrencyPill, GameButton, Icon, LevelMap, Tappable, type MapLevel, fonts, palette } from "../ui";
import { store } from "../modules/store";
import { CHAPTERS, LEVELS, SPECS } from "../game/levels";
import { CITY_LOOK } from "../game/meta";
import { useBottomInset } from "../modules/layout";
import { art } from "../art";
import { TOKEN } from "../gameArt";

/** The city map (from Home → Levels): 10 cities, 120 levels, stars per level; the current level pulses. */
export function LevelsScreen({ onPlay, onBack, onMastery }: { onPlay: (levelNumber: number) => void; onBack: () => void; onMastery: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const leaving = useSharedValue(0);
  const leaveStyle = useAnimatedStyle(() => ({ opacity: 1 - leaving.value * 0.5 }));
  const play = useCallback((n: number) => {
    leaving.value = withTiming(1, { duration: 160 });
    onPlay(n);
  }, [leaving, onPlay]);
  const bottomInset = useBottomInset();
  const [s, setS] = useState(store.get());
  useEffect(() => store.subscribe(setS), []);
  const current = Math.min(LEVELS.length, Math.max(1, s.level));
  const levels: MapLevel[] = useMemo(() => LEVELS.map((l, i) => ({
    id: String(i + 1),
    number: i + 1,
    chapter: `City ${SPECS[i].chapter + 1} · ${CHAPTERS[SPECS[i].chapter].name}`,
    stars: i + 1 < current ? s.stars?.[String(i + 1)] ?? 1 : i + 1 === current ? 0 : -1,
  })), [current, s.stars]);
  const select = useCallback((l: MapLevel) => play(l.number), [play]);
  const totalStars = Object.values(s.stars ?? {}).reduce((a, b) => a + b, 0);
  const ch = SPECS[current - 1].chapter;
  const look = CITY_LOOK[ch];
  return (
    <Animated.View style={[styles.root, leaveStyle]}>
      <Image source={art[look.bg]} style={[styles.abs, { width, height }]} resizeMode="cover" fadeDuration={0} />
      <View style={[styles.abs, { width, height, backgroundColor: "rgba(246,235,217,0.35)" }]} />
      <LevelMap levels={levels} current={current} onSelect={select} padTop={insets.top + 130} padBottom={bottomInset + 120} />
      <LinearGradient pointerEvents="none" colors={["rgba(246,235,217,1)", "rgba(246,235,217,0.92)", "rgba(246,235,217,0)"]} locations={[0, 0.6, 1]} style={[styles.scrimTop, { height: insets.top + 150 }]} />
      <LinearGradient pointerEvents="none" colors={["rgba(246,235,217,0)", "rgba(246,235,217,0.85)", "rgba(246,235,217,1)"]} style={[styles.scrimBottom, { height: bottomInset + 130 }]} />
      <View style={[styles.hud, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Tappable onPress={onBack} scaleTo={0.86} accessibilityLabel="Home" style={styles.back}>
          <Icon name="home" size={28} />
        </Tappable>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Tappable onPress={onMastery} scaleTo={0.88} accessibilityLabel="Mastery and skins" style={styles.mastery}>
            <Icon name="trophy" size={22} />
            <Text style={styles.masteryText}>Mastery</Text>
          </Tappable>
          <CurrencyPill image={art.icon_star_reward} value={totalStars} />
          <CurrencyPill image={TOKEN} value={s.coins} />
        </View>
      </View>
      <View style={[styles.titleWrap, { top: insets.top + 62 }]} pointerEvents="none">
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>{CHAPTERS[ch].name}</Text>
        <Text style={styles.sub} numberOfLines={1} adjustsFontSizeToFit>City {ch + 1} of {CHAPTERS.length} · {CHAPTERS[ch].rule}</Text>
      </View>
      <View style={[styles.bottom, { paddingBottom: bottomInset + 12 }]} pointerEvents="box-none">
        <GameButton label={`Play · Level ${current}`} icon={<Icon name="play" size={26} />} variant="accent" size="lg" onPress={() => play(current)} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bgBottom },
  abs: { position: "absolute", left: 0, top: 0 },
  hud: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  mastery: { flexDirection: "row", alignItems: "center", gap: 4, height: 44, paddingHorizontal: 10, borderRadius: 22, backgroundColor: palette.secondaryDark, borderWidth: 2.5, borderColor: "#FFF9EE" },
  masteryText: { fontFamily: fonts.display, fontSize: 14, color: "#FFFDF6" },
  back: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: palette.primary, borderWidth: 3, borderColor: "#FFF9EE" },
  titleWrap: { position: "absolute", left: 24, right: 24, alignItems: "center" },
  title: { fontFamily: fonts.display, fontSize: 32, color: palette.ink },
  sub: { fontFamily: fonts.body, fontSize: 14, color: palette.inkSoft },
  scrimTop: { position: "absolute", left: 0, right: 0, top: 0 },
  scrimBottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  bottom: { position: "absolute", left: 20, right: 20, bottom: 0 },
});
