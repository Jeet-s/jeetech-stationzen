import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import { ICON, type IconName } from "../gameArt";

/** A baked cream UI icon (assets/game/icon_*.png) at an explicit pixel size, optionally tinted. */
export function Icon({ name, size = 28, tint, style }: { name: IconName; size?: number; tint?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      <Image source={ICON[name]} style={{ width: size, height: size, tintColor: tint }} resizeMode="contain" fadeDuration={0} />
    </View>
  );
}
