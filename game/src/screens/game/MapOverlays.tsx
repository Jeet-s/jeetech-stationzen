import { trainLivery } from "../../game/collections";
import { store } from "../../modules/store";
import { memo, useEffect, useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import { stage, stationCap, stationLoad, type Forecast, type Level, type State } from "../../game/engine";
import { stationPt, type Geo, type Pt, type Seg, trainPath } from "../../game/board";
import { GLYPH_IMG } from "../../gameArt";
import { art } from "../../art";
import { fonts, palette } from "../../ui";
import { RING_COLORS } from "./MapCanvas";
import { chipBox, chipGap, labelSides, ringOuter, waitW } from "./placement";

/**
 * Text and sprite layer over the map (RN views; nothing here takes touches): each station's demand chip (the glyphs
 * its riders want and how many a week), its waiting badge, "opens week N" tags and the forecast "full wk N" warning.
 */
export const MapLabels = memo(function MapLabels({ L, s, geo, fc }: { L: Level; s: State; geo: Geo; fc: Forecast | null }) {
  const { sr } = geo;
  const mini = Math.round(Math.max(13, Math.min(18, sr * 0.62)));
  const sides = useMemo(() => labelSides(geo, L, mini), [geo, L, mini]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {L.stations.map((st, i) => {
        const p = stationPt(geo, L, i);
        const open = st.opens <= s.wk + 1;
        const q = stationLoad(L, s, i);
        const cap = stationCap(L, s, i);
        const sg = stage(q, cap);
        const groups = L.groups.filter((g) => g.s === i);
        const rate = (gi: number) => (L.spawn[Math.min(s.wk, L.spawn.length - 1)]?.[gi] ?? L.groups[gi].r);
        const full = fc && open ? fc.fullWeek[i] : 0;
        // status (station opens later / forecast says it fills) rides at the end of the demand chip, whose placement
        // is collision-free; it used to float above the station, over knobs and the neighbour's chip
        const status = !open ? `wk ${st.opens}` : full > 0 && sg < 3 ? `wk ${full}` : "";
        const chipW = groups.length * (mini + 16) + 8 + (open && q > 0 ? waitW(mini) : 0) + (status ? STATUS_W : 0);
        return (
          <View key={i}>
            {groups.length ? (
              // the demand chip; while riders wait, their count leads it in the ring colour (it used to be a separate
              // badge on the station's ring, where it overlapped the ring and the dashed forecast ring)
              <View style={[styles.chip, chipPos(geo, p, sides[i], chipW, mini + 7, chipGap(geo, st.heritage))]}>
                {open && q > 0 ? (
                  <View style={[styles.wait, { backgroundColor: sg === 0 ? palette.primaryDark : RING_COLORS[sg] }]}>
                    <Image source={art.passenger_pip} style={styles.badgePip} fadeDuration={0} />
                    <Text style={styles.badgeNum}>{q}</Text>
                  </View>
                ) : null}
                {groups.map((g) => {
                  const gi = L.groups.indexOf(g);
                  return (
                    <View key={gi} style={styles.chipItem}>
                      <Image source={GLYPH_IMG[g.g]} style={{ width: mini, height: mini }} fadeDuration={0} />
                      <Text style={styles.chipNum}>{rate(gi)}</Text>
                    </View>
                  );
                })}
                {status ? (
                  <View style={[styles.status, open ? styles.warnTag : null]}>
                    <Text style={styles.statusText} numberOfLines={1} adjustsFontSizeToFit>{status}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {groups.length ? null : !open ? (
              <View style={[styles.tag, { left: p.x - 34, top: p.y - ringOuter(geo) - 20 }]}>
                <Text style={styles.tagText} numberOfLines={1} adjustsFontSizeToFit>opens wk {st.opens}</Text>
              </View>
            ) : full > 0 && sg < 3 ? (
              <View style={[styles.tag, styles.warnTag, { left: p.x - 34, top: p.y - ringOuter(geo) - 20 }]}>
                <Text style={[styles.tagText, { color: "#FFFDF6" }]} numberOfLines={1} adjustsFontSizeToFit>full wk {full}</Text>
              </View>
            ) : null}
            {st.market ? (
              <View style={[styles.market, { left: p.x - sr - 18, top: p.y - sr - 4 }]}>
                <Text style={styles.marketText}>×3 wk{st.market}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
});

function chipPos(geo: Geo, p: Pt, a: number, w: number, h: number, d: number): { left: number; top: number } {
  const b = chipBox(p, a, w, h, d);
  return { left: Math.max(2, Math.min(geo.w - w - 2, b.left)), top: Math.max(2, Math.min(geo.h - h - 2, b.top)) };
}

/** Last Call: a slow amber breathing halo on full stations (three breaths after each change, then it rests). */
export function LastCallGlows({ L, s, geo, calm }: { L: Level; s: State; geo: Geo; calm: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {L.stations.map((st, i) => {
        if (st.opens > s.wk + 1 || stage(stationLoad(L, s, i), stationCap(L, s, i)) < 3) return null;
        const p = stationPt(geo, L, i);
        return <Breath key={`${i}-${s.wk}`} p={p} r={geo.sr * 2.6} calm={calm} />;
      })}
    </View>
  );
}

function Breath({ p, r, calm }: { p: Pt; r: number; calm: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (calm) { t.value = 0.6; return; }
    t.value = withRepeat(withSequence(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), withTiming(0.2, { duration: 1100, easing: Easing.inOut(Easing.sin) })), 3, false);
  }, [t, calm]);
  const st = useAnimatedStyle(() => ({ opacity: 0.35 + 0.55 * t.value, transform: [{ scale: 0.92 + 0.14 * t.value }] }));
  return (
    <Animated.View style={[styles.breath, { left: p.x - r, top: p.y - r, width: r * 2, height: r * 2 }, st]}>
      <Image source={art.fx_overcrowd_glow} style={{ width: r * 2, height: r * 2, tintColor: palette.ringFull }} fadeDuration={0} />
    </Animated.View>
  );
}

/**
 * Trains: one chunky tram per line. While planning (time frozen) it rests on its line; when a week runs it glides
 * along the line and back (loops: round and round) — `run` is a 0→1 shared value driven by the screen.
 */
export const Trains = memo(function Trains({ s, segs, geo, run, laps }: { s: State; segs: Seg[]; geo: Geo; run: SharedValue<number>; laps: number }) {
  const size = Math.round(Math.max(26, Math.min(40, geo.cell * 0.34)));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {s.ln.map((line, l) => {
        const pts = trainPath(segs, l);
        if (pts.length < 2) return null;
        return <Train key={l} pts={pts} loop={line.o === 1} size={size} run={run} laps={laps} cars={line.c} />;
      })}
    </View>
  );
});

function Train({ pts, loop, size, run, laps, cars }: { pts: Pt[]; loop: boolean; size: number; run: SharedValue<number>; laps: number; cars: number }) {
  // Route the train follows during one run: there-and-back for a line, round for a loop; starts mid first segment.
  const route = loop ? pts : [...pts, ...pts.slice(0, -1).reverse()];
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < route.length; i++) { const d = Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y); lens.push(d); total += d; }
  const start = (lens[0] ?? 0) / 2;
  const xs = route.map((p) => p.x), ys = route.map((p) => p.y);
  const h = size * 0.84;
  const livery = trainLivery(store.get().trainSkin);
  const st = useAnimatedStyle(() => {
    let d = (start + run.value * laps * total) % (total || 1);
    let i = 0;
    while (i < lens.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
    const f = lens[i] ? d / lens[i] : 0;
    const x = xs[i] + (xs[i + 1] - xs[i]) * f, y = ys[i] + (ys[i + 1] - ys[i]) * f;
    const bob = Math.sin(run.value * laps * 40) * 1.2;
    // parked while planning: it waits BESIDE its line (perpendicular to the first segment, toward the screen's lower
    // side), so the ribbon it rests on stays visible; when the week runs it slides onto the track within ~5% of the run
    const off = 1 - Math.min(1, run.value * 20);
    const sx = xs[1] - xs[0], sy = ys[1] - ys[0], sl = Math.hypot(sx, sy) || 1;
    let nx = -sy / sl, ny = sx / sl;
    if (ny < 0 || (Math.abs(ny) < 0.01 && nx < 0)) { nx = -nx; ny = -ny; }
    const side = size * 0.62 * off;
    return { transform: [{ translateX: x - size / 2 + nx * side }, { translateY: y - h * 0.62 + bob + ny * side }] };
  });
  const flip = useAnimatedStyle(() => {
    let d = (start + run.value * laps * total) % (total || 1);
    let i = 0;
    while (i < lens.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
    return { transform: [{ scaleX: xs[i + 1] < xs[i] - 0.5 ? -1 : 1 }] };
  });
  return (
    <Animated.View style={[styles.train, { width: size, height: h }, st]}>
      <Animated.View style={flip}>
        {livery ? <View style={[styles.livery, { width: size * 1.04, height: h * 0.3, left: -size * 0.02, top: h * 0.78, backgroundColor: livery }]} /> : null}
        <Image source={art.train_capsule} style={{ width: size, height: h }} fadeDuration={0} />
      </Animated.View>
      {cars > 0 ? (
        <View style={styles.cars}>
          <Text style={styles.carsText}>+{cars}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const STATUS_W = 42;

const styles = StyleSheet.create({
  status: { width: STATUS_W - 4, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(47,72,88,0.85)", marginRight: -2 },
  statusText: { fontFamily: fonts.body, fontSize: 10.5, color: "#FFF9EE" },
  chip: {
    position: "absolute", flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 999,
    backgroundColor: "rgba(255,249,238,0.94)", borderWidth: 1.5, borderColor: "#FFFFFF", shadowColor: palette.shadowInk, shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  chipItem: { flexDirection: "row", alignItems: "center", gap: 1 },
  chipNum: { fontFamily: fonts.display, fontSize: 12, color: palette.ink, minWidth: 9 },
  wait: { flexDirection: "row", alignItems: "center", height: 18, paddingRight: 5, paddingLeft: 1, borderRadius: 9, marginLeft: -2 },
  badgePip: { width: 10, height: 15 },
  badgeNum: { fontFamily: fonts.display, fontSize: 13, color: "#FFFDF6" },
  tag: { position: "absolute", width: 68, alignItems: "center", paddingVertical: 2, borderRadius: 8, backgroundColor: "rgba(47,72,88,0.85)" },
  warnTag: { backgroundColor: palette.ringFull },
  tagText: { fontFamily: fonts.body, fontSize: 11, color: "#FFF9EE" },
  market: { position: "absolute", paddingHorizontal: 4, paddingVertical: 1, borderRadius: 6, backgroundColor: palette.accent },
  marketText: { fontFamily: fonts.body, fontSize: 10, color: "#FFFDF6" },
  breath: { position: "absolute" },
  train: { position: "absolute", left: 0, top: 0 },
  livery: { position: "absolute", borderRadius: 999, borderWidth: 1.5, borderColor: "#FFFFFF" },
  cars: { position: "absolute", right: -4, top: -6, backgroundColor: palette.ink, borderRadius: 8, paddingHorizontal: 4 },
  carsText: { fontFamily: fonts.display, fontSize: 10, color: "#FFF9EE" },
});
