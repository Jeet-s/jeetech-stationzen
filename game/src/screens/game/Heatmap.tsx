import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { GameButton, Popup, Tappable, fonts, palette, springs } from "../../ui";
import { applyMove, runWeek, stage, startState, stationCap, stationLoad, type Level, type State } from "../../game/engine";
import { LEVELS } from "../../game/levels";
import { nextAction } from "../../game/hint";
import { cityName, levelInCity } from "../../game/meta";
import { store } from "../../modules/store";
import { lineSegments, makeGeo, stationPt } from "../../game/board";
import { GLYPH_LABEL, LINE_COLORS } from "../../game/meta";
import { GLYPH_IMG } from "../../gameArt";

const STAGE_COLOR = ["#7CC59A", "#F4D35E", "#F29E4C", "#E25B4A"];
const STAGE_NAME = ["calm", "yellow ring", "amber ring", "Last Call"];
const MAP_W = 296, MAP_H = 230;

/**
 * Heatmap Replay (GDD): after a win or a soft fail, scrub through the weeks you played and see where the network
 * strained — every station is a heat spot sized and coloured by how full it was at the end of that week, drawn on
 * that week's lines — plus one tip for the busiest stop. `runs` = the planned state each time "Run week" was
 * pressed; one press can run several quiet weeks, so each is replayed week by week on the real engine.
 */
export function HeatmapReplay({ visible, L, runs, onClose, note }: { visible: boolean; L: Level; runs: State[]; onClose: () => void; note?: string }) {
  const ends = useMemo(() => {
    const out: State[] = [];
    for (const r of runs) {
      const target = applyMove(L, r, "g").wk;
      let t = r;
      for (let k = 0; k < 20 && !t.over && t.wk < target; k++) { t = runWeek(L, t); out.push(t); }
    }
    return out;
  }, [L, runs]);
  const [wk, setWk] = useState(Math.max(0, ends.length - 1));
  useEffect(() => { if (visible) setWk(Math.max(0, ends.length - 1)); }, [visible, ends.length]);
  const geo = useMemo(() => makeGeo(L, MAP_W, MAP_H, 0), [L]);
  const st = ends[Math.min(wk, ends.length - 1)];

  // the busiest stop across the whole run (peak share of its capacity)
  const peak = useMemo(() => {
    let best = { st: -1, share: 0, load: 0, cap: 1, week: 0 };
    ends.forEach((s) => L.stations.forEach((_, i) => {
      const load = stationLoad(L, s, i), cap = stationCap(L, s, i);
      if (load / cap > best.share) best = { st: i, share: load / cap, load, cap, week: s.wk };
    }));
    return best;
  }, [ends, L]);

  const tip = peak.st < 0 || peak.share < 0.34
    ? "Your network stayed calm all the way. Try the ★★★ goal next."
    : `Busiest stop: ${GLYPH_LABEL[L.stations[peak.st].glyph]}, ${peak.load} of ${peak.cap} waiting in week ${peak.week}. ` +
      (peak.share >= 0.75
        ? "Tip: put it on a shorter line (trains call more often) or give that line a carriage."
        : "Tip: it held, but a shorter line through it leaves room for busier weeks.");

  return (
    <Popup visible={visible} title="Heatmap Replay" onClose={onClose}>
      <Text style={styles.sub}>{note ?? "Where your network strained, week by week"}</Text>
      {st ? <HeatMap L={L} s={st} geo={geo} hot={peak.st} /> : <Text style={styles.empty}>Run a week first: the heatmap fills as trains run.</Text>}
      {ends.length ? (
        <View style={styles.scrub}>
          {ends.map((_, i) => (
            <Tappable key={i} onPress={() => setWk(i)} scaleTo={0.88} sound="tap" style={[styles.chip, i === wk && styles.chipOn]} accessibilityLabel={`Week ${i + 1}`}>
              <Text style={[styles.chipText, i === wk && styles.chipTextOn]}>Wk {ends[i].wk}</Text>
            </Tappable>
          ))}
        </View>
      ) : null}
      {st ? (
        <View style={styles.legend}>
          {STAGE_COLOR.map((c, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: c }]} />
              <Text style={styles.legendText}>{STAGE_NAME[i]}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.tip}>
        <Text style={styles.tipText}>{tip}</Text>
      </View>
      <GameButton style={{ marginTop: 12 }} label="Close" onPress={onClose} />
    </Popup>
  );
}

/**
 * Heatmap Replay from Home (one tap): the most recent finished run (saved by GameScreen on a win or a soft fail), or —
 * before any run has finished — a recorded demo of level 1's winning plan, labelled as a demo.
 */
export function LastRunReplay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const data = useMemo(() => {
    if (!visible) return null;
    const last = store.get().lastRun;
    const L0 = last ? LEVELS[last.level - 1] : null;
    if (last && L0 && L0.sig === last.sig && last.runs.length) {
      return { L: L0, runs: last.runs as State[], note: `Your last run: ${cityName(L0.index)} ${levelInCity(L0.index)} · ${last.won ? "won" : "crowded"} · tap a week` };
    }
    // demo: level 1's winning plan, played on the real engine (the planned state at every "Run week")
    const L = LEVELS[0];
    let st = startState(L);
    const runs: State[] = [];
    for (let k = 0; k < 60 && !st.over; k++) {
      const a = nextAction(L, st, 300);
      if (!a) break;
      if (a.move === "g") runs.push(st);
      st = applyMove(L, st, a.move);
    }
    return { L, runs, note: "Demo replay: level 1's winning plan. Finish a level to see your own." };
  }, [visible]);
  if (!data) return null;
  return <HeatmapReplay visible={visible} L={data.L} runs={data.runs} onClose={onClose} note={data.note} />;
}

function HeatMap({ L, s, geo, hot }: { L: Level; s: State; geo: ReturnType<typeof makeGeo>; hot: number }) {
  const segs = lineSegments(geo, L, s);
  return (
    <View style={styles.map}>
      {segs.map((sg, k) => {
        const len = Math.hypot(sg.p2.x - sg.p1.x, sg.p2.y - sg.p1.y);
        const ang = Math.atan2(sg.p2.y - sg.p1.y, sg.p2.x - sg.p1.x);
        const w = Math.max(5, geo.lw * 0.8);
        return (
          <View
            key={k}
            style={{
              position: "absolute", left: (sg.p1.x + sg.p2.x) / 2 - len / 2, top: (sg.p1.y + sg.p2.y) / 2 - w / 2, width: len, height: w, borderRadius: w / 2,
              backgroundColor: LINE_COLORS[sg.line % LINE_COLORS.length], opacity: 0.85, transform: [{ rotate: `${ang}rad` }],
            }}
          />
        );
      })}
      {L.stations.map((station, i) => {
        const p = stationPt(geo, L, i);
        const open = station.opens <= s.wk;
        const load = stationLoad(L, s, i), cap = stationCap(L, s, i);
        return <Spot key={i} x={p.x} y={p.y} r={geo.sr * 0.8} share={open ? load / cap : 0} sg={open ? stage(load, cap) : 0} load={open ? load : null} glyph={station.glyph} hot={i === hot} />;
      })}
    </View>
  );
}

function Spot({ x, y, r, share, sg, load, glyph, hot }: { x: number; y: number; r: number; share: number; sg: number; load: number | null; glyph: number; hot: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = 0; t.value = withSpring(1, springs.pop); }, [share, t]);
  const H = r * (1.3 + 1.6 * Math.min(1, share));
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: 0.4 + 0.6 * t.value }], opacity: 0.25 + 0.4 * Math.min(1, share * 1.4) }));
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: x - H, top: y - H, width: H * 2, height: H * 2, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ position: "absolute", width: H * 2, height: H * 2, borderRadius: H, backgroundColor: STAGE_COLOR[sg] }, halo]} />
      <View style={[styles.station, { width: r * 2, height: r * 2, borderRadius: r, borderColor: hot ? palette.danger : "#3B4A5A" }]}>
        <Image source={GLYPH_IMG[glyph]} style={{ width: r * 1.3, height: r * 1.3 }} fadeDuration={0} />
      </View>
      {load != null ? (
        <View style={[styles.badge, { backgroundColor: STAGE_COLOR[sg] }]}>
          <Text style={styles.badgeText}>{load}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: fonts.body, fontSize: 14, color: palette.inkSoft, textAlign: "center", marginTop: -8, marginBottom: 10 },
  empty: { fontFamily: fonts.body, fontSize: 14, color: palette.inkSoft, textAlign: "center", marginVertical: 30 },
  map: { width: MAP_W, height: MAP_H, alignSelf: "center", borderRadius: 18, backgroundColor: "#E9F1DA", borderWidth: 2, borderColor: "#FFFFFF", overflow: "hidden" },
  station: { backgroundColor: "#FFF9EE", borderWidth: 3, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", right: 0, top: 0, minWidth: 22, height: 20, paddingHorizontal: 4, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#FFFFFF" },
  badgeText: { fontFamily: fonts.display, fontSize: 12, color: "#2F4858" },
  scrub: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 10 },
  chip: { minWidth: 52, height: 40, paddingHorizontal: 8, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: palette.surfaceAlt, borderWidth: 2, borderColor: palette.paperEdge },
  chipOn: { backgroundColor: palette.primary, borderColor: palette.primaryDark },
  chipText: { fontFamily: fonts.display, fontSize: 14, color: palette.ink },
  chipTextOn: { color: "#FFFDF6" },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontFamily: fonts.bodyRegular, fontSize: 12, color: palette.inkSoft },
  tip: { marginTop: 10, padding: 10, borderRadius: 14, backgroundColor: "#FFF3D6", borderWidth: 1.5, borderColor: palette.gold },
  tipText: { fontFamily: fonts.body, fontSize: 13.5, color: palette.ink, textAlign: "center" },
});
