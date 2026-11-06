import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { palette, radius, shadow, springs, type } from "./theme";
import { haptic, play, type Sfx } from "../audio/sfx";

type Variant = "primary" | "secondary" | "accent" | "danger" | "light";
const COLORS: Record<Variant, { top: string; bottom: string; lip: string; text: string }> = {
  primary: { top: "#76CBBC", bottom: "#4FA698", lip: palette.primaryDark, text: palette.onPrimary },
  secondary: { top: "#D3C6EE", bottom: palette.secondary, lip: palette.secondaryDark, text: "#FFFDF6" },
  accent: { top: "#FFB25E", bottom: "#EE8F3C", lip: "#B8661F", text: "#FFFDF6" },
  danger: { top: "#F29A8F", bottom: palette.danger, lip: palette.dangerDark, text: "#FFFFFF" },
  light: { top: "#FFFDF6", bottom: palette.surfaceAlt, lip: palette.paperEdge, text: palette.ink },
};

/**
 * Chunky casual-game button: gradient face, darker 3D lip, squash + darken on
 * press, tap sound + haptic. Use for EVERY tappable action (Tappable for
 * anything that isn't button-shaped).
 *
 * Feel (QA 2026-10-20..28, "taps show little to no response in 0.1-0.3 s" in every game reviewed): the response
 * starts on TOUCH-DOWN — a 50 ms press into the lip with a darkened face, sound + haptic at once — and the release
 * springs back past rest. A spring-only press took ~150 ms to show and read as "no pressed state".
 * Labels never wrap ("Re/start" on a 720x1280 phone, layout_small 2026-10-21): one line, shrinking to fit.
 */
export function GameButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  disabled,
  sound = "tap",
  style,
}: {
  label?: string;
  onPress?: () => void;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  disabled?: boolean;
  sound?: Sfx;
  style?: ViewStyle;
}) {
  const c = COLORS[variant];
  const press = useSharedValue(0);
  // touch-down ripple (from the finger) + an outer glow ring that blooms and fades over ~0.5 s, so the press still
  // reads in the frames after a quick tap (QA films at a few frames a second; a 100 ms press alone was invisible)
  const ripple = useSharedValue(1);
  const rx = useSharedValue(0);
  const ry = useSharedValue(0);
  const [w, setW] = useState(0);
  const face = useAnimatedStyle(() => {
    const p = Math.max(0, press.value);
    // squash: wider than tall while held (≈ 0.92 overall), springs back past rest on release
    return { transform: [{ translateY: p * 5 }, { scaleX: 1 - press.value * 0.06 }, { scaleY: 1 - press.value * 0.1 }] };
  });
  const shade = useAnimatedStyle(() => ({ opacity: Math.max(0, press.value) * 0.26 }));
  const h = size === "lg" ? 68 : size === "sm" ? 44 : 56;
  const lip = size === "sm" ? 4 : 6;
  const R = Math.max(w, h) * 1.1;
  const rip = useAnimatedStyle(() => ({
    opacity: ripple.value >= 1 ? 0 : 0.42 * (1 - ripple.value),
    transform: [{ translateX: rx.value - R }, { translateY: ry.value - R }, { scale: 0.1 + 0.9 * ripple.value }],
  }));
  const glow = useAnimatedStyle(() => ({
    opacity: ripple.value >= 1 ? 0 : 0.7 * (1 - ripple.value),
    transform: [{ scaleX: 1 + 0.06 * ripple.value }, { scaleY: 1 + 0.22 * ripple.value }],
  }));
  return (
    <Pressable
      disabled={disabled}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onPressIn={(e) => {
        press.value = withTiming(1, { duration: 50 });
        rx.value = e.nativeEvent.locationX;
        ry.value = e.nativeEvent.locationY;
        ripple.value = 0;
        ripple.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) });
        play(sound);
        haptic("light");
      }}
      // Back past rest (-0.4 ≈ 3 % bigger) and settle: the release pops instead of fading back.
      onPressOut={() => (press.value = withSequence(withTiming(-0.4, { duration: 110 }), withSpring(0, springs.press)))}
      onPress={() => onPress?.()}
      style={[{ height: h + lip, opacity: disabled ? 0.5 : 1 }, style]}
      hitSlop={6}
    >
      <Animated.View pointerEvents="none" style={[styles.glow, { height: h, top: lip / 2, borderRadius: radius.lg + 4, borderColor: c.top, backgroundColor: c.top }, glow]} />
      <View style={[styles.lip, { height: h, top: lip, backgroundColor: c.lip, borderRadius: radius.lg }, shadow]} />
      <Animated.View style={[{ height: h, borderRadius: radius.lg, overflow: "hidden" }, face]}>
        <LinearGradient colors={[c.top, c.bottom]} style={[styles.face, { paddingHorizontal: size === "sm" ? 12 : 22 }]}>
          <View style={styles.shine} />
          {icon}
          {label ? (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              style={[
                type.button,
                { color: c.text, fontSize: size === "lg" ? 24 : size === "sm" ? 16 : 20, flexShrink: 1 },
                variant !== "light" ? styles.labelShadow : null,
              ]}
            >
              {label}
            </Text>
          ) : null}
        </LinearGradient>
        <Animated.View pointerEvents="none" style={[styles.shade, shade]} />
        <Animated.View pointerEvents="none" style={[styles.ripple, { width: R * 2, height: R * 2, borderRadius: R }, rip]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lip: { position: "absolute", left: 0, right: 0 },
  face: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  shade: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "#1B2238" },
  ripple: { position: "absolute", left: 0, top: 0, backgroundColor: "#FFFFFF" },
  glow: { position: "absolute", left: -4, right: -4, borderWidth: 3, opacity: 0 },
  labelShadow: { textShadowColor: "rgba(80,40,10,0.45)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1 },
  shine: { position: "absolute", top: 4, left: 10, right: 10, height: "38%", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.28)" },
});
