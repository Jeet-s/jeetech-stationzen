import { useEffect } from "react";
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { CurrencyPill, Icon, Tappable, fonts, palette, shadow } from "../../ui";
import { art, type ArtId } from "../../art";
import { TOKEN, type IconName } from "../../gameArt";
import { useBottomInset } from "../../modules/layout";

/**
 * Shared frame of the meta screens (Online Duels, Station Garden): the city map art washed in cream, a round Home
 * button, the Token balance, a ribbon title, and a body that scrolls on small phones. The body slides up on entry
 * (a stable view easing from 40 % opacity — never from 0).
 */
export function Frame({ title, sub, icon, bg = "bg_city_meadow", coins, onBack, children, footer, scroll = true }: {
  title: string; sub?: string; icon: IconName; bg?: ArtId; coins?: number; onBack: () => void; children: React.ReactNode; footer?: React.ReactNode; scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }); }, [t]);
  const enter = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * t.value, transform: [{ translateY: (1 - t.value) * 24 }] }));
  const body = scroll ? (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: (footer ? 12 : bottomInset + 20) }]} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : <View style={{ flex: 1 }}>{children}</View>;
  return (
    <View style={styles.root}>
      <Image source={art[bg]} style={[styles.abs, { width, height }]} resizeMode="cover" fadeDuration={0} />
      <View style={[styles.abs, { width, height, backgroundColor: "rgba(246,235,217,0.42)" }]} />
      <LinearGradient colors={["rgba(127,196,232,0.9)", "rgba(127,196,232,0)"]} style={[styles.abs, { width, height: insets.top + 160 }]} />
      <View style={[styles.hud, { paddingTop: insets.top + 8 }]}>
        <Tappable onPress={onBack} scaleTo={0.86} accessibilityLabel="Home" style={styles.back}>
          <Icon name="home" size={28} />
        </Tappable>
        <View style={styles.ribbon}>
          <View style={styles.ribbonIcon}><Icon name={icon} size={24} /></View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
            {sub ? <Text style={styles.sub} numberOfLines={1} adjustsFontSizeToFit>{sub}</Text> : null}
          </View>
        </View>
        {coins != null ? <CurrencyPill image={TOKEN} value={coins} /> : <View style={{ width: 50 }} />}
      </View>
      <Animated.View style={[{ flex: 1 }, enter]}>{body}</Animated.View>
      {footer ? <View style={[styles.footer, { paddingBottom: bottomInset + 10 }]}>{footer}</View> : null}
    </View>
  );
}

/** Cream paper card used inside the frames. */
export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bgBottom },
  abs: { position: "absolute", left: 0, top: 0 },
  hud: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 10 },
  back: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: palette.primary, borderWidth: 3, borderColor: "#FFF9EE", ...shadow, shadowOpacity: 0.18 },
  ribbon: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 52, paddingHorizontal: 10, borderRadius: 18, backgroundColor: "rgba(255,249,238,0.96)",
    borderWidth: 2, borderColor: "#FFFFFF", ...shadow, shadowOpacity: 0.16, elevation: 5,
  },
  ribbonIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: palette.accent },
  title: { fontFamily: fonts.display, fontSize: 19, color: palette.ink },
  sub: { fontFamily: fonts.body, fontSize: 12, color: palette.inkSoft, marginTop: -2 },
  scroll: { paddingHorizontal: 14, gap: 12, paddingTop: 4 },
  footer: { paddingHorizontal: 18, paddingTop: 8 },
  card: {
    padding: 14, borderRadius: 24, backgroundColor: "rgba(255,249,238,0.97)", borderWidth: 2, borderColor: "#FFFFFF", gap: 8,
    ...shadow, shadowOpacity: 0.14, elevation: 4,
  },
});
