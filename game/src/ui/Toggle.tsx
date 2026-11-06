import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { fonts, palette, springs } from "./theme";
import { feedback } from "../audio/sfx";

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(value ? 26 : 0, springs.press) }] }));
  return (
    <Pressable
      style={styles.row}
      onPress={() => {
        feedback("tap", "select");
        onChange(!value);
      }}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.track, { backgroundColor: value ? palette.primary : palette.paperEdge }]}>
        <Animated.View style={[styles.knob, knob]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  label: { flex: 1, marginRight: 12, fontFamily: fonts.body, fontSize: 17, color: palette.ink },
  track: { width: 58, height: 32, borderRadius: 16, padding: 3 },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#fff", elevation: 3 },
});
