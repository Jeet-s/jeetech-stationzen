import { forwardRef, useEffect, useState } from "react";
import { Image, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, Tappable, fonts, palette, shadow, springs } from "../../ui";
import { art } from "../../art";
import type { IconName } from "../../gameArt";

/** Round cream icon button for the HUD / tray (answers on touch-down via Tappable). */
export function RoundButton({ icon, label, onPress, disabled, count, tint = palette.primary, size = 50 }: {
  icon: IconName; label: string; onPress: () => void; disabled?: boolean; count?: number; tint?: string; size?: number;
}) {
  return (
    <Tappable onPress={onPress} disabled={disabled} scaleTo={0.86} accessibilityLabel={label} style={{ alignItems: "center" }}>
      <View style={[styles.roundLip, { width: size, height: size, borderRadius: size / 2, backgroundColor: shade(tint) }]} />
      <LinearGradient colors={[lighten(tint), tint]} style={[styles.round, { width: size, height: size, borderRadius: size / 2 }]}>
        <Icon name={icon} size={size * 0.56} />
      </LinearGradient>
      {count != null ? (
        <View style={styles.count}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      ) : null}
    </Tappable>
  );
}

const lighten = (c: string) => mix(c, "#FFFFFF", 0.32);
const shade = (c: string) => mix(c, "#1B2238", 0.3);
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/** Resource chip in the tray (tracks, lines, tunnels…). Draggable chips (carriage, interchange) pass responders. */
export const ResourceChip = forwardRef<React.ComponentRef<typeof View>, {
  icon: IconName; value: number; label: string; color: string; active?: boolean; drag?: {
    onGrant: (e: GestureResponderEvent) => void; onMove: (e: GestureResponderEvent) => void; onRelease: (e: GestureResponderEvent) => void;
  };
}>(function ResourceChip({ icon, value, label, color, active, drag }, ref) {
  const pulse = useSharedValue(1);
  const [prev, setPrev] = useState(value);
  useEffect(() => {
    if (value !== prev) {
      pulse.value = withSequence(withTiming(1.18, { duration: 90 }), withSpring(1, springs.pop));
      setPrev(value);
    }
  }, [value, prev, pulse]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const canDrag = !!drag && value > 0;
  return (
    <View
      ref={ref}
      collapsable={false}
      accessibilityLabel={`${label}: ${value}`}
      onStartShouldSetResponder={() => canDrag}
      onMoveShouldSetResponder={() => canDrag}
      onResponderTerminationRequest={() => false}
      onResponderGrant={drag?.onGrant}
      onResponderMove={drag?.onMove}
      onResponderRelease={drag?.onRelease}
      onResponderTerminate={drag?.onRelease}
    >
      {/* a draggable chip with something to drag is FILLED in its colour (raised, white count); used up, it sinks to a
          pale outline — the two states differ in value, not just tint, so using the last one reads at a glance */}
      <Animated.View style={[styles.chip, { opacity: value > 0 || !drag ? 1 : 0.55 }, active && styles.chipActive, canDrag && styles.chipDrag, canDrag && { backgroundColor: color }, st]}>
        <View style={[styles.chipIcon, { backgroundColor: color }, canDrag && styles.chipIconDrag]}>
          <Icon name={icon} size={20} />
        </View>
        <Text style={[styles.chipValue, canDrag && { color: "#FFFDF6" }]}>{value}</Text>
      </Animated.View>
    </View>
  );
});

/** Pip the station cat with a speech card: tutorial steps, mechanic tips and gentle warnings. */
export function CoachCard({ title, text, action, onAction, secondary, onSecondary, tone = "calm", secondaryLink }: {
  title?: string; text: string; action?: string; onAction?: () => void; secondary?: string; onSecondary?: () => void; tone?: "calm" | "warn";
  /** The secondary action as a small text link (e.g. "Skip tips" after level 1) instead of a pill. */
  secondaryLink?: boolean;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.back(1.3)) });
  }, [t, text]);
  const st = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * t.value, transform: [{ translateY: (1 - t.value) * 14 }] }));
  return (
    <Animated.View style={[styles.coach, tone === "warn" && styles.coachWarn, st]}>
      <Image source={art.hero_pip_cat} style={styles.pip} fadeDuration={0} />
      <View style={{ flex: 1 }}>
        {title ? <Text style={styles.coachTitle}>{title}</Text> : null}
        <Text style={styles.coachText}>{text}</Text>
      </View>
      {secondary && secondaryLink && !action ? (
        <Tappable onPress={onSecondary} scaleTo={0.9} hitSlop={12} style={styles.coachLink} accessibilityLabel={secondary}>
          <Text style={styles.coachLinkText} numberOfLines={1}>{secondary}</Text>
        </Tappable>
      ) : action || secondary ? (
        <View style={{ gap: 6 }}>
          {action ? (
            <Tappable onPress={onAction} scaleTo={0.88} style={[styles.coachBtn, tone === "warn" && { backgroundColor: palette.accent }]}>
              <Text style={styles.coachBtnText} numberOfLines={1} adjustsFontSizeToFit>{action}</Text>
            </Tappable>
          ) : null}
          {secondary ? (
            <Tappable onPress={onSecondary} scaleTo={0.88} style={[styles.coachBtn, styles.coachBtnLight]}>
              <Text style={[styles.coachBtnText, { color: palette.ink }]} numberOfLines={1} adjustsFontSizeToFit>{secondary}</Text>
            </Tappable>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  round: { alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: "#FFF9EE" },
  roundLip: { position: "absolute", top: 4 },
  count: {
    position: "absolute", right: -4, top: -4, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, alignItems: "center", justifyContent: "center",
    backgroundColor: palette.accent, borderWidth: 2, borderColor: "#FFF9EE",
  },
  countText: { fontFamily: fonts.display, fontSize: 12, color: "#FFFDF6" },
  chip: {
    flexDirection: "row", alignItems: "center", height: 38, paddingRight: 10, paddingLeft: 3, gap: 5, borderRadius: 19,
    backgroundColor: "#FFF9EE", borderWidth: 2, borderColor: "#FFFFFF", ...shadow, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3,
  },
  chipActive: { borderColor: palette.accent },
  chipDrag: { borderColor: "#FFF9EE", borderWidth: 2.5, elevation: 5, shadowOpacity: 0.25 },
  chipIconDrag: { borderWidth: 2, borderColor: "#FFF9EE" },
  chipIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  chipValue: { fontFamily: fonts.display, fontSize: 18, color: palette.ink },
  coach: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 10, paddingLeft: 6, borderRadius: 22, backgroundColor: "rgba(255,249,238,0.97)",
    borderWidth: 2, borderColor: "#FFFFFF", ...shadow, shadowOpacity: 0.18,
  },
  coachWarn: { backgroundColor: "#FFF1DC", borderColor: palette.ringAmber },
  pip: { width: 52, height: 56 },
  coachTitle: { fontFamily: fonts.display, fontSize: 16, color: palette.ink },
  coachText: { fontFamily: fonts.body, fontSize: 14, color: palette.ink, lineHeight: 19 },
  coachBtn: { minWidth: 76, height: 36, paddingHorizontal: 10, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: palette.primary },
  coachBtnLight: { backgroundColor: palette.surfaceAlt },
  coachLink: { alignSelf: "flex-start", paddingHorizontal: 2, paddingVertical: 2 },
  coachLinkText: { fontFamily: fonts.body, fontSize: 12.5, color: palette.inkSoft, textDecorationLine: "underline" },
  coachBtnText: { fontFamily: fonts.display, fontSize: 15, color: "#FFFDF6" },
});
