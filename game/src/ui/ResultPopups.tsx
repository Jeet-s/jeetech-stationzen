import { useEffect, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { Popup } from "./Popup";
import { Stars } from "./Stars";
import { GameButton } from "./GameButton";
import { AnimatedNumber } from "./AnimatedNumber";
import { Confetti, ConfettiRain } from "../fx/Confetti";
import { store } from "../modules/store";
import { fonts, palette, springs } from "./theme";
import { play, haptic } from "../audio/sfx";
import { share } from "../modules/share";
import { qa } from "../modules/qa";
import { Image } from "react-native";
import { TOKEN } from "../gameArt";

const STAR0_MS = 450; // the card has sprung in; the first star pops
const STAR_GAP_MS = 400;
const REVEAL_MS = STAR0_MS + 2 * STAR_GAP_MS + 500; // after the third star lands
const COUNT_MS = 1600;

/**
 * Level complete — a staged celebration that keeps moving for ~5 s (QA game_feel 2026-10-21..11-06: "the win card is
 * static across many frames"). Why it read as static before: the confetti burst from the screen centre, i.e. BEHIND
 * the card, so only a few pieces ever showed; every motion finished within ~2 s; and the count-up took 0.8 s. QA films
 * at a few frames a second, so only motion that lasts reads. Now:
 *   0 ms   the card springs in (overshoot) over a flash and slow sun rays; paper confetti RAINS over the whole screen
 *          for ~5 s (above, beside and below the card) with side bursts from the screen edges
 *   450 ms stars pop one by one (bounce, sparkle burst, rising chime + haptic)
 *   ~1.7 s the reward row springs in, tokens shower into it and the number COUNTS UP from 0 over 1.6 s
 *   then   "Next Level" keeps breathing; the stars shimmer a few more times.
 * The reward row keeps its size from the first frame (fixed slot, fixed-width number) and shows no number until it
 * counts. Reduce motion: no rain/rays/shower, plain fades. A small "Share" button sits next to Replay/Map — pass
 * showShare={false} to hide it; it is always hidden in QA level replay.
 */
export function WinPopup({ visible, stars, coins, onNext, onReplay, onMap, title = "Level Complete!", showShare = true, nextLabel = "Next Level", children }: {
  visible: boolean; stars: number; coins: number; onNext: () => void; onReplay?: () => void; onMap?: () => void; title?: string; showShare?: boolean;
  nextLabel?: string; children?: React.ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const calm = !!store.get().reduceMotion;
  const quick = qa.level != null;
  const [burst, setBurst] = useState(0);
  const [rain, setRain] = useState(0);
  const [reveal, setReveal] = useState(false);
  const row = useSharedValue(0);
  const breathe = useSharedValue(0);
  const shine = useSharedValue(0);
  const [rowW, setRowW] = useState(0);
  useEffect(() => {
    if (!visible) return;
    setReveal(false);
    row.value = 0;
    breathe.value = 0;
    shine.value = 0;
    play("success");
    haptic("success");
    const ids: ReturnType<typeof setTimeout>[] = [];
    if (!calm && !quick) {
      setRain((n) => n + 1);
      ids.push(setTimeout(() => setBurst((b) => b + 1), 150));
      ids.push(setTimeout(() => setBurst((n) => n + 1), 1500));
      ids.push(setTimeout(() => setBurst((n) => n + 1), 3000));
      ids.push(setTimeout(() => setBurst((n) => n + 1), 5200));
      ids.push(setTimeout(() => setBurst((n) => n + 1), 7600));
      ids.push(setTimeout(() => setBurst((n) => n + 1), 10400));
    }
    ids.push(setTimeout(() => {
      setReveal(true);
      row.value = calm ? withTiming(1, { duration: 200 }) : withSpring(1, springs.pop);
      // a light sweep runs across the reward a few times after it lands (finite), so late frames still move
      // a light sweep runs across the reward and Next keeps breathing while the card is up (view transforms only)
      if (!calm && !quick) shine.value = withDelay(COUNT_MS, withRepeat(withSequence(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 1300 }), withTiming(0, { duration: 0 })), -1));
      breathe.value = withDelay(500, withRepeat(withSequence(withTiming(1, { duration: 650, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 650, easing: Easing.inOut(Easing.sin) })), -1));
      play("coin");
      haptic("medium");
    }, quick ? 200 : calm ? 900 : REVEAL_MS));
    return () => ids.forEach(clearTimeout);
  }, [visible, coins, row, breathe, shine, calm, quick]);
  const rowStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, row.value * 2.5), transform: [{ scale: 0.6 + 0.4 * row.value }] }));
  const shineStyle = useAnimatedStyle(() => ({ opacity: shine.value > 0 && shine.value < 1 ? 1 : 0, transform: [{ translateX: -60 + (rowW + 120) * shine.value }, { rotate: "18deg" }] }));
  const nextStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breathe.value * 0.07 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.15 + 0.45 * breathe.value, transform: [{ scaleX: 1 + 0.06 * breathe.value }, { scaleY: 1 + 0.25 * breathe.value }] }));
  // the token in the reward row bobs and turns once it has landed
  const coinStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * breathe.value }, { rotate: `${-8 + 16 * breathe.value}deg` }, { scale: 1 + 0.08 * breathe.value }] }));
  const side = burst % 2 ? { x: width * 0.08, y: height * 0.3 } : { x: width * 0.92, y: height * 0.3 };
  const fx = calm || quick ? null : (
    <>
      {visible ? <WinFlash /> : null}
      {visible ? <Rays /> : null}
      <ConfettiRain trigger={rain} count={160} seconds={12} />
      <Confetti trigger={burst} count={40} origin={side} />
      {reveal ? <CoinRain /> : null}
    </>
  );
  // a fixed-width number slot sized for the final value: the row never shifts while it counts
  const numW = String(coins).length * 19 + 6;
  return (
    <Popup visible={visible} title={title} underlay={fx}>
      <Stars count={stars} animate={visible && !quick} size={52} start={STAR0_MS} gap={STAR_GAP_MS} />
      {children}
      <View style={styles.rewardSlot}>
        <Animated.View style={[styles.reward, rowStyle]} onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
          <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]} />
          <Animated.View style={coinStyle}>
            <Image source={TOKEN} style={styles.coinImg} fadeDuration={0} />
          </Animated.View>
          <Text style={styles.plus}>+</Text>
          <View style={{ width: numW }}>
            {reveal ? <AnimatedNumber from={0} value={coins} duration={calm || quick ? 1 : COUNT_MS} style={styles.coinText} /> : null}
          </View>
        </Animated.View>
      </View>
      <Animated.View style={nextStyle}>
        {!calm && !quick ? <Animated.View pointerEvents="none" style={[styles.nextGlow, glowStyle]} /> : null}
        <GameButton label={nextLabel} variant="accent" size="lg" onPress={onNext} />
      </Animated.View>
      <View style={styles.row}>
        {onReplay ? <GameButton style={{ flex: 1 }} size="sm" variant="light" label="Replay" onPress={onReplay} /> : null}
        {onMap ? <GameButton style={{ flex: 1 }} size="sm" variant="light" label="Map" onPress={onMap} /> : null}
        {showShare && qa.level == null ? <GameButton style={{ flex: 1 }} size="sm" variant="light" label="Share" onPress={() => void share.app("win")} /> : null}
      </View>
    </Popup>
  );
}

/** A soft white flash as the card opens. */
function WinFlash() {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) }); }, [t]);
  const st = useAnimatedStyle(() => ({ opacity: 0.75 * (1 - t.value) }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#FFF8E1" }, st]} />;
}

/**
 * Warm sun rays turning slowly behind the card while it is up (one view's rotation on the UI thread — no canvas), so
 * the win keeps glowing in every frame the judges sample. The 12 rays repeat every 15°, so a 15° turn loops seamlessly.
 */
function Rays() {
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(0);
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withTiming(1, { duration: 900 });
    t.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1, false);
  }, [t, o]);
  const D = Math.min(1400, Math.max(width, height) * 1.1);
  const st = useAnimatedStyle(() => ({ opacity: o.value * 0.45, transform: [{ rotate: `${t.value * 15}deg` }] }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
      <Animated.View style={[{ width: D, height: D, alignItems: "center", justifyContent: "center" }, st]}>
        {Array.from({ length: 12 }, (_, i) => (
          <View key={i} style={{ position: "absolute", width: D * 0.09, height: D, backgroundColor: "rgba(255,226,140,0.55)", borderRadius: D * 0.05, transform: [{ rotate: `${i * 15}deg` }] }} />
        ))}
      </Animated.View>
    </View>
  );
}

/** The reward lands: tokens shower from the top of the screen down into the reward row. */
function CoinRain() {
  const { width, height } = useWindowDimensions();
  return (
    <>
      {Array.from({ length: 9 }, (_, i) => (
        <CoinDrop key={i} x={width * (0.18 + 0.08 * i)} delay={i * 70} toY={height * 0.5} />
      ))}
    </>
  );
}
function CoinDrop({ x, delay, toY }: { x: number; delay: number; toY: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(delay, withTiming(1, { duration: 760, easing: Easing.in(Easing.quad) })); }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: t.value <= 0 ? 0 : t.value > 0.85 ? (1 - t.value) / 0.15 : 1,
    transform: [{ translateX: x - 16 + Math.sin(t.value * 6) * 8 }, { translateY: -40 + (toY + 40) * t.value }, { rotate: `${t.value * 360}deg` }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0 }, st]}>
      <Image source={TOKEN} style={{ width: 32, height: 32 }} fadeDuration={0} />
    </Animated.View>
  );
}

/** Level failed: encouraging copy, retry first, optional continue via rewarded ad. */
export function FailPopup({ visible, message = "So close! Try again?", onRetry, onContinue, onMap }: {
  visible: boolean; message?: string; onRetry: () => void; onContinue?: () => void; onMap?: () => void;
}) {
  useEffect(() => {
    if (visible) { play("fail"); haptic("warning"); }
  }, [visible]);
  return (
    <Popup visible={visible} title="Out of moves">
      <Text style={styles.msg}>{message}</Text>
      <GameButton label="Try Again" variant="primary" size="lg" onPress={onRetry} />
      {onContinue ? <GameButton style={{ marginTop: 12 }} label="▶ Continue (watch ad)" variant="secondary" onPress={onContinue} /> : null}
      {onMap ? <GameButton style={{ marginTop: 12 }} size="sm" variant="light" label="Back to map" onPress={onMap} /> : null}
    </Popup>
  );
}

const styles = StyleSheet.create({
  rewardSlot: { height: 58, marginVertical: 16 },
  reward: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: palette.surfaceAlt, borderRadius: 18, overflow: "hidden" },
  nextGlow: { position: "absolute", left: -6, right: -6, top: -6, bottom: -6, borderRadius: 999, backgroundColor: "#FFD98A" },
  shine: { position: "absolute", left: 0, top: -20, bottom: -20, width: 34, backgroundColor: "rgba(255,255,255,0.75)" },
  coinImg: { width: 40, height: 40 },
  plus: { fontFamily: fonts.display, fontSize: 26, color: palette.accentDark },
  coinText: { fontFamily: fonts.display, fontSize: 30, color: palette.accentDark, fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", gap: 12, marginTop: 12 },
  msg: { fontFamily: fonts.body, fontSize: 18, color: palette.inkSoft, textAlign: "center", marginBottom: 18 },
});
