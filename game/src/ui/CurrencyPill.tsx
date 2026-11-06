import { Image, StyleSheet, View, type ImageSourcePropType } from "react-native";
import { AnimatedNumber } from "./AnimatedNumber";
import { fonts, palette } from "./theme";

/** HUD pill: illustrated icon + animated count (tokens, stars) on a cream paper plate. */
export function CurrencyPill({ image, value }: { image: ImageSourcePropType; value: number }) {
  return (
    <View style={styles.pill}>
      <Image source={image} style={styles.icon} resizeMode="contain" fadeDuration={0} />
      <AnimatedNumber value={value} style={styles.value} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,249,238,0.92)", borderRadius: 999, paddingRight: 14, height: 38,
    borderWidth: 2, borderColor: "#FFFFFF", shadowColor: palette.shadowInk, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  icon: { width: 40, height: 40, marginLeft: -8, marginRight: 4 },
  value: { fontFamily: fonts.display, fontSize: 18, color: palette.ink, minWidth: 28 },
});
