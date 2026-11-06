import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { fonts } from "../ui/theme";

/** "+40", "Perfect!", "Combo x3" — rises and fades at (x, y). Re-key to replay. */
export function FloatingText({ text, x, y, color = "#FFD24A", duration = 900 }: { text: string; x: number; y: number; color?: string; duration?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
  }, [t, duration]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.7 ? 1 : 1 - (t.value - 0.7) / 0.3,
    transform: [{ translateY: -60 * t.value }, { scale: 0.6 + Math.min(1, t.value * 3) * 0.5 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { left: x - 100, top: y - 20 }, style]}>
      <Text style={[styles.text, { color }]}>{text}</Text>
    </Animated.View>
  );
}

/**
 * A small OPAQUE label pill ("Line 1", "+ Drop") centred at (x, y): solid fill, white outline, cream text. It pops in
 * with an overshoot, holds still, then fades — it never drifts over what is around it (render_defects 2026-11-06: a
 * rising, half-transparent shadowed text muddled into the red line and the station under it).
 */
export function TagPill({ text, x, y, color, duration = 1300 }: { text: string; x: number; y: number; color: string; duration?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration, easing: Easing.linear });
  }, [t, duration]);
  const style = useAnimatedStyle(() => {
    const k = t.value;
    const pop = k < 0.12 ? 0.5 + (k / 0.12) * 0.65 : k < 0.22 ? 1.15 - ((k - 0.12) / 0.1) * 0.15 : 1;
    return { opacity: k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25, transform: [{ scale: pop }] };
  });
  return (
    <View pointerEvents="none" style={[styles.tagWrap, { left: x - 70, top: y - 15 }]}>
      <Animated.View style={[styles.tag, { backgroundColor: color }, style]}>
        <Text style={styles.tagText} numberOfLines={1}>{text}</Text>
      </Animated.View>
    </View>
  );
}

export function Pop({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const s = useSharedValue(0);
  useEffect(() => {
    s.value = withDelay(delay, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(2.2)) }));
  }, [s, delay]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, s.value * 2), transform: [{ scale: s.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export const TAG_H = 30;

const styles = StyleSheet.create({
  tagWrap: { position: "absolute", width: 140, height: TAG_H, alignItems: "center", justifyContent: "center" },
  tag: {
    height: 26, paddingHorizontal: 10, borderRadius: 13, borderWidth: 2, borderColor: "#FFFFFF", justifyContent: "center",
    shadowColor: "#1B2238", shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  tagText: { fontFamily: fonts.display, fontSize: 14, color: "#FFFDF6", textShadowColor: "rgba(27,34,56,0.35)", textShadowRadius: 1, textShadowOffset: { width: 0, height: 1 } },
  wrap: { position: "absolute", width: 200, alignItems: "center" },
  text: { fontFamily: fonts.display, fontSize: 28, textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 3 } },
});
