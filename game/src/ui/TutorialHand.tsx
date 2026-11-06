import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from "react-native-reanimated";

type P = { x: number; y: number };
/** Something the hand's body must not cover: a point with its radius (default: the station radius × 1.1). */
type Avoid = P & { r?: number };
const HAND = 40; // emoji size
// 👆 inside its text box: the fingertip sits at (FX, FY) of the box, the hand body hangs below it (+y)
const BOX_W = HAND * 1.2, BOX_H = HAND * 1.25;
const FX = 0.44, FY = 0.12;
const GAP = 13; // fingertip → target spot

/**
 * Animated pointer demonstrating a tap at `from` or a drag from → to.
 *
 * The FINGERTIP is exactly on the point (the knob or the station rim it describes) and travels to the target; the
 * hand's body is rotated away into free space — the direction furthest from every station in `avoid` and from the
 * drag path — so it never sits on a station glyph or its labels (render_defects 2026-11-06: the hand covered the Kite
 * station and pointed at it while the coach said "drag the knob onto the Drop station"). A few loops, then it rests.
 * `avoid` = station centres in the same (window) coordinates; `clear` = station radius.
 */
export function TutorialHand({ from, to, clear = 0, avoid = [] }: { from: P; to?: P; clear?: number; avoid?: Avoid[] }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 300 }), // finger presses
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }), // drags
        withTiming(1, { duration: 500 }), // holds on the target
        withTiming(0, { duration: 0 }),
      ),
      5,
    );
  }, [t]);
  const body = useMemo(() => bodyAngle(from, to, avoid, clear), [from, to, avoid, clear]);
  // the fingertip points AT the spot from just beside it (a gap along the hand's body), so the knob / station it
  // describes and the badges next to it stay visible; a pulsing target ring marks the exact spot (render_defects
  // 2026-11-06: the hand sat on the knob and covered the "x2" rider chip)
  const gx = Math.cos(body) * GAP, gy = Math.sin(body) * GAP;
  const style = useAnimatedStyle(() => {
    const dest = to ?? from;
    const x = from.x + (dest.x - from.x) * t.value + gx;
    const y = from.y + (dest.y - from.y) * t.value + gy;
    const press = to ? 0.94 : 1 - 0.15 * Math.sin(Math.PI * t.value);
    return { transform: [{ translateX: x }, { translateY: y }, { rotate: `${body - Math.PI / 2}rad` }, { scale: press }], opacity: t.value > 0.98 ? 0.8 : 1 };
  });
  const ring = useAnimatedStyle(() => {
    const k = to ? 1 - t.value : 1;
    return { opacity: 0.35 + 0.65 * k, transform: [{ scale: 0.9 + 0.25 * Math.sin(Math.PI * Math.min(1, t.value * 3)) }] };
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.target, { left: from.x - 17, top: from.y - 17 }, ring]} />
      {to ? <View pointerEvents="none" style={[styles.goal, { left: to.x - 13, top: to.y - 13 }]} /> : null}
      <Animated.View pointerEvents="none" style={[styles.pivot, style]}>
        <Text style={styles.emoji}>{"\u{1F446}"}</Text>
      </Animated.View>
    </>
  );
}

/** The direction (radians) the hand's body hangs from the fingertip: the freest one over the whole drag. */
function bodyAngle(from: P, to: P | undefined, avoid: Avoid[], clear: number): number {
  const dest = to ?? from;
  const dx = dest.x - from.x, dy = dest.y - from.y, len = Math.hypot(dx, dy);
  const reach = HAND * 0.75 + GAP; // where the bulk of the hand sits, from the fingertip
  const room = HAND * 0.6; // how much clear space the hand's bulk wants around it
  let best = Math.PI / 2, bp = Infinity;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const ux = Math.cos(a), uy = Math.sin(a);
    // overlap with every station / chip / badge at the start, the middle and the end of the drag (squared, summed:
    // a direction near one thing loses to one with nothing near)
    let pen = 0;
    for (const f of [0, 0.5, 1]) {
      const bx = from.x + dx * f + ux * reach, by = from.y + dy * f + uy * reach;
      for (const q of avoid) {
        const over = (q.r ?? clear * 1.1) + room - Math.hypot(q.x - bx, q.y - by);
        if (over > 0) pen += over * over;
      }
    }
    // not trailing over the path ahead (nor back over it)
    if (len > 1) { const d = (ux * dx + uy * dy) / len; pen += Math.max(0, d) * 900 + Math.max(0, -d) * 300; }
    pen -= uy * 40; // a hand reads best hanging down / sideways
    if (pen < bp) { bp = pen; best = a; }
  }
  return best;
}

/**
 * The ghost ribbon on its own, in BOARD coordinates, drawn inside the board beneath the station labels. It runs from
 * the start station's RIM to the target's rim (`clear` = station radius; render_defects 2026-11-06: a ribbon from the
 * station centre drew a white pill inside the Leaf station). `fromKnob`: the start is a line-end knob, not a station.
 */
export function TutorialTrail({ from, to, clear = 0, fromKnob = false }: { from: P; to: P; clear?: number; fromKnob?: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withSequence(withTiming(0, { duration: 300 }), withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }), withTiming(1, { duration: 500 }), withTiming(0, { duration: 0 })),
      5,
    );
  }, [t]);
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const ux = (to.x - from.x) / len, uy = (to.y - from.y) / len;
  const r0 = fromKnob ? clear * 0.45 : clear * 1.2, r1 = clear * 1.2;
  if (len - r0 - r1 < 6) return null;
  return <Trail from={{ x: from.x + ux * r0, y: from.y + uy * r0 }} to={{ x: to.x - ux * r1, y: to.y - uy * r1 }} t={t} />;
}

/** The ghost line: a soft dotted ribbon that grows behind the finger (no copies of pieces). */
function Trail({ from, to, t }: { from: P; to: P; t: SharedValue<number> }) {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const grow = useAnimatedStyle(() => ({ width: Math.max(0, len * t.value) }));
  return (
    <View pointerEvents="none" style={[styles.trail, { left: from.x, top: from.y - 5, width: len, transform: [{ rotate: `${ang}rad` }] }]}>
      <Animated.View style={[styles.ribbon, grow]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // a zero-size pivot AT the fingertip: rotation turns the hand around the point it touches
  pivot: { position: "absolute", left: 0, top: 0, width: 0, height: 0 },
  emoji: {
    position: "absolute", left: -BOX_W * FX, top: -BOX_H * FY, width: BOX_W, height: BOX_H, fontSize: HAND, lineHeight: BOX_H, textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 6,
  },
  target: { position: "absolute", width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: "rgba(242,158,76,0.95)" },
  goal: { position: "absolute", width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderStyle: "dashed", borderColor: "rgba(242,158,76,0.9)" },
  trail: { position: "absolute", height: 10, transformOrigin: "0% 50%" },
  ribbon: { height: 10, borderRadius: 5, backgroundColor: "rgba(242,158,76,0.6)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.85)" },
});
