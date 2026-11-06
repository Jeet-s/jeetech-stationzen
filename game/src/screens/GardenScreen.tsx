import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { Burst, FloatingText, GameButton, Icon, Tappable, feedback, fonts, palette, springs } from "../ui";
import { Card, Frame } from "./modes/Frame";
import { GARDEN, buyGarden, type GardenItem } from "../game/modes";
import { JOURNAL, metRiders } from "../game/collections";
import { JournalPopup } from "./MetaPopups";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { share } from "../modules/share";
import { art } from "../art";
import { GLYPH_IMG, TOKEN } from "../gameArt";

const ASPECT: Record<string, number> = { // height / width of each art piece
  station_normal: 512 / 501, station_interchange: 407 / 512, station_heritage: 512 / 439, train_capsule: 432 / 512, passenger_pip: 512 / 328, hero_pip_cat: 512 / 470, glyph: 1,
};
const src = (g: GardenItem) => (g.art === "glyph" ? GLYPH_IMG[g.glyph ?? 0] : art[g.art]);

/**
 * Station Garden: a paper diorama island the player decorates with pieces bought with Tokens. Each piece unlocks at
 * a star total (campaign progress); bought pieces pop onto their plot with a burst and bob gently; empty plots show
 * as dashed outlines so the island always says what is still to come. Share sends the game link.
 */
export function GardenScreen({ onBack }: { onBack: () => void }) {
  const [p, setP] = useState(store.get());
  useEffect(() => store.subscribe(setP), []);
  const { width } = useWindowDimensions();
  const W = Math.min(width - 28, 440);
  const H = Math.round(W * 0.78);
  const owned = p.garden ?? [];
  const stars = Object.values(p.stars ?? {}).reduce((a, b) => a + b, 0);
  const [fx, setFx] = useState<{ x: number; y: number; text: string; n: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [journal, setJournal] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const bob = useSharedValue(0);
  useEffect(() => { bob.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true); }, [bob]);

  const buy = (g: GardenItem) => {
    const r = buyGarden(g.id);
    if (r === "ok") {
      feedback("unlock", "success");
      setFresh(g.id);
      setFx((f) => ({ x: g.x * W, y: g.y * H, text: `-${g.cost}`, n: (f?.n ?? 0) + 1 }));
      setNote(`${g.name} placed in your garden.`);
      analytics.track("garden_item_placed", { item: g.id });
    } else {
      feedback("error", "light");
      setNote(r === "locked" ? `${g.name} unlocks at ${g.stars} stars. You have ${stars}.` : r === "poor" ? `You need ${g.cost - p.coins} more Tokens. Win levels to earn them.` : `${g.name} is already in your garden.`);
    }
  };

  return (
    <Frame
      title="Garden"
      sub={`${owned.length}/${GARDEN.length} placed`}
      icon="garden"
      coins={p.coins}
      onBack={onBack}
    >
      <View style={{ width: W, height: H + 26, alignSelf: "center" }}>
        <Island w={W} h={H} />
        {GARDEN.map((g) => {
          const size = g.size * W;
          const h = size * ASPECT[g.art];
          const box = { left: g.x * W - size / 2, top: g.y * H - h + size * 0.18, width: size, height: h };
          return owned.includes(g.id) ? (
            <Piece key={g.id} g={g} box={box} bob={bob} fresh={fresh === g.id} />
          ) : (
            <View key={g.id} pointerEvents="none" style={[styles.plot, { left: g.x * W - size * 0.42, top: g.y * H - size * 0.12, width: size * 0.84, height: size * 0.34, borderRadius: size }]} />
          );
        })}
        {fx ? <Burst key={`b${fx.n}`} x={fx.x} y={fx.y - 20} color={palette.gold} size={110} count={10} /> : null}
        {fx ? <FloatingText key={`f${fx.n}`} text={fx.text} x={fx.x} y={fx.y - 40} color={palette.accentDark} /> : null}
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {/* the riders who live around the garden: their story cards */}
      <GameButton
        style={{ marginBottom: 10 }}
        variant="secondary"
        label={`📖 Passenger Journal · ${metRiders(p.stars).size}/${JOURNAL.length}`}
        onPress={() => setJournal(true)}
      />
      <JournalPopup visible={journal} onClose={() => setJournal(false)} />

      <Card>
        <Text style={styles.h}>Pieces</Text>
        {[0, 3, 6, 9].map((r) => (
        <View key={r} style={styles.grid}>
          {GARDEN.slice(r, r + 3).map((g) => {
            const has = owned.includes(g.id);
            const locked = !has && stars < g.stars;
            return (
              <Tappable key={g.id} onPress={() => buy(g)} scaleTo={0.92} sound={null} style={[styles.item, has && styles.itemOwned]} containerStyle={styles.itemWrap} accessibilityLabel={g.name}>
                <View style={styles.itemArt}>
                  <Image source={src(g)} style={{ width: 46, height: Math.min(52, 46 * ASPECT[g.art]), opacity: locked ? 0.35 : 1 }} resizeMode="contain" fadeDuration={0} />
                  {locked ? <View style={styles.lock}><Icon name="lock" size={18} /></View> : null}
                </View>
                <Text style={styles.itemName} numberOfLines={1} adjustsFontSizeToFit>{g.name}</Text>
                {has ? (
                  <Text style={styles.placed}>Placed ✓</Text>
                ) : locked ? (
                  <Text style={styles.need}>★ {g.stars}</Text>
                ) : (
                  <View style={styles.price}>
                    <Image source={TOKEN} style={{ width: 18, height: 18 }} fadeDuration={0} />
                    <Text style={styles.priceText}>{g.cost}</Text>
                  </View>
                )}
              </Tappable>
            );
          })}
        </View>
        ))}
      </Card>
      <GameButton size="sm" variant="light" label="Share Station Zen" icon={<Icon name="share" size={20} tint={palette.ink} />} onPress={() => { analytics.track("share_postcard", { from: "garden" }); void share.app("garden"); }} />
    </Frame>
  );
}

/** The paper island: a cut of the illustrated map (clipped round) on a darker paper lip, with a little rail loop. */
function Island({ w, h }: { w: number; h: number }) {
  const top = h * 0.2, ih = h * 0.8;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.lip, { top: top + 22, width: w, height: ih, borderRadius: w * 0.5 }]} />
      <View style={[styles.lip, { top: top + 11, width: w, height: ih, borderRadius: w * 0.5, backgroundColor: "#D4A574" }]} />
      <View style={{ position: "absolute", top, width: w, height: ih, borderRadius: w * 0.5, overflow: "hidden", borderWidth: 3, borderColor: "#F4EBD9" }}>
        <Image source={art.bg_city_meadow} style={{ position: "absolute", left: 0, top: -ih * 0.55, width: w, height: w * (1920 / 1080) }} resizeMode="cover" fadeDuration={0} />
        <LinearGradient colors={["rgba(246,235,217,0.10)", "rgba(246,235,217,0.35)"]} style={{ position: "absolute", left: 0, top: 0, width: w, height: ih }} />
      </View>
      <View style={[styles.rail, { left: w * 0.1, top: h * 0.36, width: w * 0.8, height: h * 0.54, borderRadius: w }]} />
    </View>
  );
}

function Piece({ g, box, bob, fresh }: { g: GardenItem; box: { left: number; top: number; width: number; height: number }; bob: SharedValue<number>; fresh: boolean }) {
  const pop = useSharedValue(fresh ? 0 : 1);
  useEffect(() => {
    if (fresh) pop.value = withSequence(withTiming(1.25, { duration: 220, easing: Easing.out(Easing.back(2)) }), withSpring(1, springs.pop));
  }, [fresh, pop]);
  const phase = (g.x * 7 + g.y * 3) % 1;
  const st = useAnimatedStyle(() => {
    const b = Math.sin((bob.value + phase) * Math.PI);
    return { transform: [{ translateY: -b * (g.art === "passenger_pip" || g.art === "glyph" ? 4 : 1.5) }, { scale: pop.value }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", ...box }, st]}>
      <View style={[styles.shadow, { left: box.width * 0.15, width: box.width * 0.7, top: box.height - box.width * 0.12, height: box.width * 0.2 }]} />
      <Image source={src(g)} style={{ width: box.width, height: box.height }} resizeMode="contain" fadeDuration={0} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  lip: { position: "absolute", backgroundColor: "#B98552" },
  rail: { position: "absolute", borderWidth: 6, borderColor: "rgba(233,146,90,0.85)" },
  plot: { position: "absolute", borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", borderStyle: "dashed", backgroundColor: "rgba(255,249,238,0.35)" },
  shadow: { position: "absolute", borderRadius: 999, backgroundColor: "rgba(27,34,56,0.22)" },
  note: { fontFamily: fonts.body, fontSize: 14, color: palette.primaryDark, textAlign: "center" },
  h: { fontFamily: fonts.display, fontSize: 18, color: palette.ink },
  grid: { flexDirection: "row", gap: 8 },
  itemWrap: { flex: 1 },
  item: { alignItems: "center", padding: 8, borderRadius: 16, backgroundColor: palette.surfaceAlt, borderWidth: 2, borderColor: palette.paperEdge, gap: 2 },
  itemOwned: { backgroundColor: "#E4F4D6", borderColor: palette.success },
  itemArt: { height: 54, justifyContent: "center", alignItems: "center" },
  lock: { position: "absolute", width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: palette.inkSoft },
  itemName: { fontFamily: fonts.body, fontSize: 12.5, color: palette.ink },
  placed: { fontFamily: fonts.display, fontSize: 13, color: palette.primaryDark },
  need: { fontFamily: fonts.display, fontSize: 13, color: palette.inkSoft },
  price: { flexDirection: "row", alignItems: "center", gap: 3 },
  priceText: { fontFamily: fonts.display, fontSize: 14, color: palette.accentDark },
});
