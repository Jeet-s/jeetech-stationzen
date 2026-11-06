import { memo, useEffect, useMemo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Canvas, Group, RoundedRect, Circle } from "@shopify/react-native-skia";
import { Easing, useDerivedValue, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

const COLORS = ["#FFD24A", "#7B5CFF", "#2FD3C1", "#FF5A6E", "#FFFFFF", "#3DDC84"];

interface P { vx: number; vy: number; spin: number; size: number; color: string; round: boolean; delay: number }

function Particle({ p, t, ox, oy }: { p: P; t: SharedValue<number>; ox: number; oy: number }) {
  const transform = useDerivedValue(() => {
    const k = Math.max(0, t.value - p.delay);
    const x = ox + p.vx * k;
    const y = oy + p.vy * k + 900 * k * k; // gravity
    return [{ translateX: x }, { translateY: y }, { rotate: p.spin * k }];
  });
  const opacity = useDerivedValue(() => Math.max(0, 1 - Math.max(0, t.value - p.delay - 0.6) / 0.6));
  return (
    <Group transform={transform} opacity={opacity}>
      {p.round ? (
        <Circle cx={0} cy={0} r={p.size / 2} color={p.color} />
      ) : (
        <RoundedRect x={-p.size / 2} y={-p.size / 4} width={p.size} height={p.size / 2} r={2} color={p.color} />
      )}
    </Group>
  );
}

interface R { x: number; v: number; amp: number; freq: number; ph: number; spin: number; size: number; color: string; round: boolean; delay: number }

/** One falling paper piece: drifts down with a sway and a flutter (the flutter squashes it like turning paper). */
function RainPiece({ p, t, height }: { p: R; t: SharedValue<number>; height: number }) {
  const transform = useDerivedValue(() => {
    const k = Math.max(0, t.value - p.delay);
    const x = p.x + Math.sin(k * p.freq + p.ph) * p.amp;
    const y = -24 + p.v * k;
    return [{ translateX: x }, { translateY: y }, { rotate: p.spin * k }, { scaleX: 0.35 + 0.65 * Math.abs(Math.cos(k * p.freq * 1.7 + p.ph)) }];
  });
  const opacity = useDerivedValue(() => {
    const k = t.value - p.delay;
    if (k <= 0) return 0;
    return -24 + p.v * k > height + 20 ? 0 : 1;
  });
  return (
    <Group transform={transform} opacity={opacity}>
      {p.round ? <Circle cx={0} cy={0} r={p.size / 2} color={p.color} /> : <RoundedRect x={-p.size / 2} y={-p.size / 4} width={p.size} height={p.size / 2} r={2} color={p.color} />}
    </Group>
  );
}

/**
 * Paper confetti RAIN over the whole screen for `seconds` (finite): pieces keep falling from the top edge in waves, so
 * the celebration is still moving 4-5 s later and shows above, beside and below a popup card (a burst from the screen
 * centre sits behind the card — the win looked static on the device, game_feel 2026-11-06). Change `trigger` to start.
 */
type RainProps = { trigger: number; count?: number; seconds?: number };
export const ConfettiRain = memo(RainCanvas, (a: RainProps, b: RainProps) => a.trigger === b.trigger && a.count === b.count && a.seconds === b.seconds);

function RainCanvas({ trigger, count = 90, seconds = 5 }: RainProps) {
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(99);
  const pieces = useMemo<R[]>(
    () =>
      Array.from({ length: count }, (_, i) => {
        const v = Math.max((height + 60) / (seconds * 0.85), 170 + Math.random() * 160);
        // every piece is off the bottom by `seconds`: the last ones start early enough to finish their fall
        const fall = (height + 60) / v;
        return {
          x: Math.random() * width, v, amp: 12 + Math.random() * 26, freq: 2 + Math.random() * 3, ph: Math.random() * 6.28, spin: (Math.random() - 0.5) * 8,
          size: 9 + Math.random() * 9, color: COLORS[i % COLORS.length], round: Math.random() < 0.25, delay: Math.max(0, seconds - fall) * ((i * 0.618) % 1),
        };
      }),
    // new set per trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trigger, count, seconds, width, height],
  );
  useEffect(() => {
    if (!trigger) return;
    t.value = 0;
    // runs until the last piece has left the screen (never frozen mid-fall), then rests
    const end = Math.max(...pieces.map((p) => p.delay + (height + 60) / p.v)) + 0.1;
    t.value = withTiming(end, { duration: end * 1000, easing: Easing.linear });
  }, [trigger, t, pieces, height]);
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => <RainPiece key={i} p={p} t={t} height={height} />)}
    </Canvas>
  );
}

/**
 * Confetti / sparkle burst (GPU, Skia). Change `trigger` to fire again. Mount it with the screen
 * (trigger 0 = idle) rather than when the moment happens.
 * Use on wins, unlocks, purchases, combos. Inside a Popup pass it as `underlay` (a Modal is its own window: confetti
 * outside it renders underneath the dim).
 * Memoised on its values (origin is usually a fresh object literal): an unmemoised Skia canvas re-renders on every
 * parent state change — every move on a game screen — which piles up into soak ANRs.
 */
type ConfettiProps = { trigger: number; count?: number; origin?: { x: number; y: number } };
export const Confetti = memo(
  ConfettiCanvas,
  (a: ConfettiProps, b: ConfettiProps) => a.trigger === b.trigger && a.count === b.count && a.origin?.x === b.origin?.x && a.origin?.y === b.origin?.y,
);

function ConfettiCanvas({ trigger, count = 70, origin }: ConfettiProps) {
  const { width, height } = useWindowDimensions();
  // Starts "finished" (every particle faded out) so the canvas can stay mounted: creating a Skia
  // canvas at the moment of a win stalls the frame the player is watching.
  const t = useSharedValue(1.6);
  const particles = useMemo<P[]>(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
        const sp = 380 + Math.random() * 520;
        return {
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          spin: (Math.random() - 0.5) * 18,
          size: 8 + Math.random() * 10,
          color: COLORS[i % COLORS.length],
          round: Math.random() < 0.3,
          delay: Math.random() * 0.12,
        };
      }),
    // new set per trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trigger, count],
  );
  useEffect(() => {
    if (!trigger) return;
    t.value = 0;
    t.value = withTiming(1.6, { duration: 1600, easing: Easing.linear });
  }, [trigger, t]);
  const ox = origin?.x ?? width / 2;
  const oy = origin?.y ?? height * 0.42;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => (
        <Particle key={i} p={p} t={t} ox={ox} oy={oy} />
      ))}
    </Canvas>
  );
}
