import { memo, useMemo } from "react";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { StyleSheet } from "react-native";
import { BlendColor, Canvas, Circle, DashPathEffect, Group, Image, Path, RadialGradient, Skia, useImage, vec, type SkPath } from "@shopify/react-native-skia";
import { stage, stationCap, stationLoad, type Forecast, type Level, type State } from "../../game/engine";
import { at, stationPt, type Geo, type Handle, type Seg } from "../../game/board";
import { LINE_COLORS, LINE_DARK } from "../../game/meta";
import { art } from "../../art";
import { GLYPH_IMG } from "../../gameArt";
import { palette } from "../../ui";

export const RING_COLORS = ["#7CC6A4", palette.ringYellow, palette.ringAmber, palette.ringFull];

export interface Focus {
  st: number; // selected station (-1 none)
  lines: number; // bitmask of lines its riders use (route preview); 0 = no dimming
}

/**
 * The map, in three stacked Skia canvases so a move redraws only what it changed (ftue 2026-11-06: after an extend the
 * HUD had updated but the one big canvas still showed the old line for a frame burst on a loaded device):
 *   1. corridors (static per level + layout),
 *   2. metro lines + line-end knobs (redrawn on every move — paths only, cheap),
 *   3. stations, glyph tokens and overcrowd rings (redrawn only when loads / week / selection change).
 * Each line is a metro-map ribbon: a cream casing, a dark edge, the colour core and a satin highlight, so a built
 * segment differs from the map in VALUE (luma) as well as hue — the old colour-only ribbon had the same grey value as
 * the grass and a new line barely registered at a glance (level_replay "move changed nothing", 2026-11-06).
 * Never redrawn on a timer (no BlurMask, no endless animation here).
 */
export const MapCanvas = memo(function MapCanvas({ L, s, geo, segs, handles, fc, focus, patterns, prev = null, run }: {
  L: Level; s: State; geo: Geo; segs: Seg[]; handles: Handle[]; fc: Forecast | null; focus: Focus; patterns: boolean;
  /** While a week runs: the planned state it started from — each overcrowd ring fills from that load to the week's
   * end load in step with `run` (0→1, the trains' clock), so the tension builds visibly during the run. */
  prev?: State | null; run?: SharedValue<number>;
}) {
  const sig = `${s.wk}|${s.hb}|${s.q.join(",")}|${focus.st}|${fc ? fc.peak.join(",") : "-"}|${prev ? "r" + prev.q.join(",") : ""}`;
  return (
    <>
      <CorridorLayer L={L} geo={geo} />
      <LineLayer segs={segs} handles={handles} geo={geo} lines={focus.lines} patterns={patterns} />
      <StationLayer L={L} s={s} geo={geo} fc={fc} focusSt={focus.st} prev={prev} run={run} sig={sig} />
      <RimLayer L={L} lines={s.ln} geo={geo} dimMask={focus.lines} />
    </>
  );
});

const CorridorLayer = memo(function CorridorLayer({ L, geo }: { L: Level; geo: Geo }) {
  const { lw } = geo;
  const corridors = useMemo(() => {
    const out: { path: SkPath; river: boolean; ferry: boolean; marks: { x: number; y: number; ch: string; ang: number }[] }[] = [];
    for (const c of L.corridors) {
      const A = stationPt(geo, L, c.a), B = stationPt(geo, L, c.b);
      const b = Skia.PathBuilder.Make();
      b.moveTo(A.x, A.y).lineTo(B.x, B.y);
      // one-way corridors point their chevrons the way trains may run (dir 1 = a→b only)
      const ang = Math.atan2(B.y - A.y, B.x - A.x) + (c.dir === -1 ? Math.PI : 0);
      const marks = c.cells
        .map(([x, y]) => ({ ...at(geo, x / 2, y / 2), ch: L.spec.map[y][x], ang }))
        .filter((m) => "~h=><v^".includes(m.ch));
      out.push({ path: b.detach(), river: c.river, ferry: c.ferry, marks });
    }
    return out;
  }, [L, geo]);
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* rail corridors: a soft bed with cream sleepers */}
      {corridors.map((c, i) => (
        <Group key={`c${i}`}>
          <Path path={c.path} style="stroke" strokeWidth={lw * 1.5} strokeCap="round" color={c.river || c.ferry ? "rgba(79,159,208,0.30)" : "rgba(47,72,88,0.16)"} />
          <Path path={c.path} style="stroke" strokeWidth={lw * 0.75} strokeCap="round" color={c.ferry ? "rgba(235,248,255,0.95)" : "rgba(255,251,240,0.95)"}>
            <DashPathEffect intervals={c.ferry ? [lw * 1.2, lw * 0.9] : [0.1, lw * 1.25]} />
          </Path>
          {c.marks.map((m, k) => <CorridorMark key={k} {...m} lw={lw} />)}
        </Group>
      ))}
    </Canvas>
  );
});

const LineLayer = memo(function LineLayer({ segs, handles, geo, lines, patterns }: { segs: Seg[]; handles: Handle[]; geo: Geo; lines: number; patterns: boolean }) {
  const { sr, lw } = geo;
  const casing = Math.max(4, Math.round(lw * 0.42)); // cream casing each side

  const linePaths = useMemo(() => segs.map((sg) => {
    const b = Skia.PathBuilder.Make();
    b.moveTo(sg.p1.x, sg.p1.y).lineTo(sg.p2.x, sg.p2.y);
    return { line: sg.line, path: b.detach() };
  }), [segs]);

  const knobs = useMemo(() => handles.map((h) => {
    const b = Skia.PathBuilder.Make();
    const dx = h.p.x - h.base.x, dy = h.p.y - h.base.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    b.moveTo(h.base.x + ux * sr * 0.7, h.base.y + uy * sr * 0.7).lineTo(h.p.x, h.p.y);
    const bar = Skia.PathBuilder.Make();
    bar.moveTo(h.p.x - uy * lw * 1.3, h.p.y + ux * lw * 1.3).lineTo(h.p.x + uy * lw * 1.3, h.p.y - ux * lw * 1.3);
    return { h, stub: b.detach(), bar: bar.detach() };
  }), [handles, sr, lw]);

  const dim = (l: number) => (lines && !((lines >> l) & 1) ? 0.22 : 1);
  const dash = (l: number): number[] | null => {
    if (!patterns) return null;
    switch (l % 6) {
      case 1: return [lw * 2.2, lw * 1.1];
      case 2: return [0.1, lw * 1.7];
      case 4: return [lw * 2.4, lw * 0.9, 0.1, lw * 0.9];
      case 5: return [lw * 4, lw * 1.2];
      default: return null;
    }
  };

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* drop shadow, then the cream casing of every segment (one pass, so shared corridors read as one bundle) */}
      {linePaths.map((p, i) => (
        <Group key={`ls${i}`} opacity={dim(p.line) * 0.9} transform={[{ translateY: 3 }]}>
          <Path path={p.path} style="stroke" strokeWidth={lw + casing * 2 + 2} strokeCap="round" color="rgba(27,34,56,0.30)" />
        </Group>
      ))}
      {linePaths.map((p, i) => (
        <Path key={`lc${i}`} path={p.path} style="stroke" strokeWidth={lw + casing * 2} strokeCap="round" color="#FFFBF0" opacity={dim(p.line)} />
      ))}
      {linePaths.map((p, i) => {
        const d = dash(p.line);
        const col = LINE_COLORS[p.line % LINE_COLORS.length];
        const dark = LINE_DARK[p.line % LINE_DARK.length];
        return (
          <Group key={`l${i}`} opacity={dim(p.line)}>
            {/* dark edge: the ribbon's outline, darker than any map */}
            <Path path={p.path} style="stroke" strokeWidth={lw + 3} strokeCap="round" color={dark} />
            {d ? (
              <>
                <Path path={p.path} style="stroke" strokeWidth={lw - 1} strokeCap="round" color="rgba(255,251,240,0.95)" />
                <Path path={p.path} style="stroke" strokeWidth={lw - 1} strokeCap="round" color={col}>
                  <DashPathEffect intervals={d} />
                </Path>
              </>
            ) : (
              <Path path={p.path} style="stroke" strokeWidth={lw - 1} strokeCap="round" color={col} />
            )}
            {patterns && p.line % 6 === 3 ? (
              <Path path={p.path} style="stroke" strokeWidth={lw * 0.3} strokeCap="round" color="rgba(255,251,240,0.95)" />
            ) : (
              <Group transform={[{ translateY: -lw * 0.18 }]}>
                <Path path={p.path} style="stroke" strokeWidth={lw * 0.24} strokeCap="round" color="rgba(255,255,255,0.45)" />
              </Group>
            )}
          </Group>
        );
      })}

      {/* line-end knobs (drag to extend): cased stub, a T-bar and a big cream-rimmed grip */}
      {knobs.map(({ h, stub, bar }, i) => (
        <Group key={`k${i}`} opacity={dim(h.line)}>
          <Path path={stub} style="stroke" strokeWidth={lw + casing * 2} strokeCap="round" color="#FFFBF0" />
          <Path path={stub} style="stroke" strokeWidth={lw + 1} strokeCap="round" color={LINE_DARK[h.line % LINE_DARK.length]} />
          <Path path={stub} style="stroke" strokeWidth={lw - 1} strokeCap="round" color={LINE_COLORS[h.line % LINE_COLORS.length]} />
          <Path path={bar} style="stroke" strokeWidth={lw * 0.9} strokeCap="round" color={LINE_DARK[h.line % LINE_DARK.length]} />
          <Circle cx={h.p.x} cy={h.p.y + 2} r={lw * 1.05 + 4} color="rgba(27,34,56,0.30)" />
          <Circle cx={h.p.x} cy={h.p.y} r={lw * 1.05 + 4} color="#FFF9EE" />
          <Circle cx={h.p.x} cy={h.p.y} r={lw * 1.05 + 1} color={LINE_DARK[h.line % LINE_DARK.length]} />
          <Circle cx={h.p.x} cy={h.p.y} r={lw * 1.05 - 1} color={LINE_COLORS[h.line % LINE_COLORS.length]} />
          <Circle cx={h.p.x - lw * 0.3} cy={h.p.y - lw * 0.3} r={lw * 0.3} color="rgba(255,255,255,0.6)" />
        </Group>
      ))}
    </Canvas>
  );
});

/**
 * Line rims: every station wears a band in the colour of each line that serves it (split into arcs when several do),
 * over the dark rim of its art — so joining a station to a line visibly changes the STATION itself, right under the
 * finger that drew it (level_replay 2026-11-06: on big-station boards the new ribbon between two rims was only a few
 * dp long and the touched station looked the same before and after).
 */
const RimLayer = memo(function RimLayer({ L, lines, geo, dimMask }: { L: Level; lines: State["ln"]; geo: Geo; dimMask: number }) {
  const { sr, lw } = geo;
  const r = sr * 0.98, bw = Math.max(4, Math.round(lw * 0.55));
  const arcs = useMemo(() => {
    const out: { path: SkPath; line: number; transfer: boolean }[] = [];
    L.stations.forEach((st, i) => {
      const on = lines.map((ln, l) => (ln.s.includes(st.ch) ? l : -1)).filter((l) => l >= 0);
      if (!on.length) return;
      const p = stationPt(geo, L, i);
      // a transfer station (2+ lines: riders can change here) wears a wide cream ring under thinner colour arcs
      if (on.length > 1) {
        const b = Skia.PathBuilder.Make();
        b.addArc({ x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r }, -90, 359.9);
        out.push({ path: b.detach(), line: -1, transfer: true });
      }
      const span = 360 / on.length, gap = on.length > 1 ? 14 : 0;
      on.forEach((l, k) => {
        const b = Skia.PathBuilder.Make();
        b.addArc({ x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r }, -90 + k * span + gap / 2, on.length > 1 ? span - gap : 359.9);
        out.push({ path: b.detach(), line: l, transfer: on.length > 1 });
      });
    });
    return out;
  }, [L, lines, geo, r]);
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {arcs.map((a, i) => a.line < 0 ? (
        <Path key={i} path={a.path} style="stroke" strokeWidth={bw + 7} color="#FFFBF0" />
      ) : (
        <Group key={i} opacity={dimMask && !((dimMask >> a.line) & 1) ? 0.3 : 1}>
          {a.transfer ? null : <Path path={a.path} style="stroke" strokeWidth={bw + 3} strokeCap="round" color="#FFFBF0" />}
          <Path path={a.path} style="stroke" strokeWidth={a.transfer ? Math.max(3, bw * 0.55) : bw} strokeCap="round" color={LINE_COLORS[a.line % LINE_COLORS.length]} />
        </Group>
      ))}
    </Canvas>
  );
});

const StationLayer = memo(function StationLayer({ L, s, geo, fc, focusSt, prev, run }: {
  L: Level; s: State; geo: Geo; fc: Forecast | null; focusSt: number; prev: State | null; run?: SharedValue<number>; sig: string;
}) {
  const stNormal = useImage(art.station_normal);
  const stHub = useImage(art.station_interchange);
  const stHeritage = useImage(art.station_heritage);
  const glow = useImage(art.fx_overcrowd_glow);
  const g0 = useImage(GLYPH_IMG[0] as number), g1 = useImage(GLYPH_IMG[1] as number), g2 = useImage(GLYPH_IMG[2] as number), g3 = useImage(GLYPH_IMG[3] as number);
  const g4 = useImage(GLYPH_IMG[4] as number), g5 = useImage(GLYPH_IMG[5] as number), g6 = useImage(GLYPH_IMG[6] as number), g7 = useImage(GLYPH_IMG[7] as number);
  const glyphs = [g0, g1, g2, g3, g4, g5, g6, g7];
  const { sr, lw } = geo;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {L.stations.map((st, i) => {
        const p = stationPt(geo, L, i);
        const open = st.opens <= s.wk + 1;
        const hub = st.hub || ((s.hb >> i) & 1) === 1;
        const cap = stationCap(L, s, i);
        const q = stationLoad(L, s, i);
        const sg = open ? stage(q, cap) : 0;
        const ringR = sr + lw * 0.6 + 2;
        const peak = fc && open ? fc.peak[i] : 0;
        const img = st.heritage ? stHeritage : hub ? stHub : stNormal;
        const [w, h] = st.heritage ? [sr * 2.25, sr * 2.6] : hub ? [sr * 2.7, sr * 2.15] : [sr * 2.2, sr * 2.25];
        const gl = glyphs[st.glyph];
        const gs = st.heritage ? sr * 1.15 : sr * 1.45;
        const gy = st.heritage ? p.y + sr * 0.35 : p.y;
        const selected = focusSt === i;
        return (
          <Group key={`s${i}`} opacity={open ? 1 : 0.55}>
            {sg >= 1 && glow ? (
              <Image image={glow} x={p.x - sr * 2} y={p.y - sr * 2} width={sr * 4} height={sr * 4} opacity={sg === 1 ? 0.55 : sg === 2 ? 0.8 : 1}>
                <BlendColor color={RING_COLORS[sg]} mode="srcIn" />
              </Image>
            ) : null}
            {selected ? (
              <Circle cx={p.x} cy={p.y} r={sr * 1.9}>
                <RadialGradient c={vec(p.x, p.y)} r={sr * 1.9} colors={["rgba(255,255,255,0.9)", "rgba(255,255,255,0.5)", "rgba(255,255,255,0)"]} positions={[0, 0.6, 1]} />
              </Circle>
            ) : null}
            <Circle cx={p.x} cy={p.y + sr * 0.18} r={sr * 1.02} color="rgba(27,34,56,0.20)" />
            {img ? <Image image={img} x={p.x - w / 2} y={p.y - h / 2 - (st.heritage ? sr * 0.3 : 0)} width={w} height={h} fit="contain" /> : null}
            {gl ? <Image image={gl} x={p.x - gs / 2} y={gy - gs / 2} width={gs} height={gs} fit="contain" /> : null}
            {open && !st.heritage ? (
              <>
                <Circle cx={p.x} cy={p.y} r={ringR} style="stroke" strokeWidth={3.5} color="rgba(255,251,240,0.85)" />
                {prev && run && (q > 0 || stationLoad(L, prev, i) > 0) ? (
                  <RunRing path={ringPath(p.x, p.y, ringR)} from={Math.min(1, stationLoad(L, prev, i) / stationCap(L, prev, i))} to={Math.min(1, q / cap)} run={run} color={RING_COLORS[sg] === RING_COLORS[0] ? palette.primaryDark : RING_COLORS[sg]} />
                ) : q > 0 ? (
                  <Path path={ringPath(p.x, p.y, ringR)} start={0} end={Math.min(1, q / cap)} style="stroke" strokeWidth={3.5} strokeCap="round" color={RING_COLORS[sg] === RING_COLORS[0] ? palette.primaryDark : RING_COLORS[sg]} />
                ) : null}
              </>
            ) : null}
            {/* forecast warning: the dashed ring hugs the station ring (one ring band, never a second halo outside it) */}
            {peak >= 2 && peak > sg ? (
              <Circle cx={p.x} cy={p.y} r={ringR + 4} style="stroke" strokeWidth={3} color={RING_COLORS[peak]}>
                <DashPathEffect intervals={[6, 4]} />
              </Circle>
            ) : null}
            {!open ? (
              <Circle cx={p.x} cy={p.y} r={sr * 1.12} style="stroke" strokeWidth={2.5} color="rgba(47,72,88,0.6)">
                <DashPathEffect intervals={[4, 4]} />
              </Circle>
            ) : null}
          </Group>
        );
      })}
    </Canvas>
  );
}, (a, b) => a.sig === b.sig && a.L === b.L && a.geo === b.geo && a.run === b.run);

/** The overcrowd ring while the week runs: its arc moves from the start load to the end load on the run's clock. */
function RunRing({ path, from, to, run, color }: { path: SkPath; from: number; to: number; run: SharedValue<number>; color: string }) {
  const end = useDerivedValue(() => Math.max(0.001, from + (to - from) * Math.min(1, run.value * 1.1)));
  const width = useDerivedValue(() => 3.5 + 2 * Math.sin(Math.PI * Math.min(1, run.value)));
  return <Path path={path} start={0} end={end} style="stroke" strokeWidth={width} strokeCap="round" color={color} />;
}

const ringCache = new Map<string, SkPath>();
function ringPath(x: number, y: number, r: number): SkPath {
  const k = `${x}|${y}|${r}`;
  let p = ringCache.get(k);
  if (!p) {
    const b = Skia.PathBuilder.Make();
    b.addArc({ x: x - r, y: y - r, width: 2 * r, height: 2 * r }, -90, 359.9);
    p = b.detach();
    ringCache.set(k, p);
  }
  return p;
}

/** Corridor feature marks: river crossing (tunnel), hill bump, ferry wave, one-way chevron. */
function CorridorMark({ x, y, ch, ang, lw }: { x: number; y: number; ch: string; ang: number; lw: number }) {
  const r = lw * 1.25;
  if (ch === "~" || ch === "=") {
    const b = Skia.PathBuilder.Make();
    b.moveTo(x - r * 0.75, y + r * 0.1).quadTo(x - r * 0.38, y - r * 0.45, x, y + r * 0.1).quadTo(x + r * 0.38, y + r * 0.6, x + r * 0.75, y + r * 0.1);
    return (
      <Group>
        <Circle cx={x} cy={y + 1.5} r={r + 2} color="rgba(27,34,56,0.25)" />
        <Circle cx={x} cy={y} r={r + 2} color="#FFF9EE" />
        <Circle cx={x} cy={y} r={r} color={ch === "~" ? "#4F9FD0" : "#3FA7A0"} />
        <Path path={b.detach()} style="stroke" strokeWidth={Math.max(1.6, lw * 0.22)} strokeCap="round" color="#FFF9EE" />
      </Group>
    );
  }
  if (ch === "h") {
    const b = Skia.PathBuilder.Make();
    b.moveTo(x - r, y + r * 0.55).lineTo(x - r * 0.2, y - r * 0.7).lineTo(x + r * 0.15, y - r * 0.15).lineTo(x + r * 0.45, y - r * 0.45).lineTo(x + r, y + r * 0.55).close();
    return (
      <Group>
        <Path path={b.detach()} color="#B98552" />
        <Path path={b.detach()} style="stroke" strokeWidth={2} strokeJoin="round" color="#FFF4DE" />
      </Group>
    );
  }
  // one-way chevron along the allowed direction (screen angle `ang`)
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const b = Skia.PathBuilder.Make();
  b.moveTo(x - ux * r * 0.5 - uy * r * 0.7, y - uy * r * 0.5 + ux * r * 0.7).lineTo(x + ux * r * 0.5, y + uy * r * 0.5).lineTo(x - ux * r * 0.5 + uy * r * 0.7, y - uy * r * 0.5 - ux * r * 0.7);
  return (
    <Group>
      <Circle cx={x} cy={y} r={r + 1} color="#2F4858" />
      <Path path={b.detach()} style="stroke" strokeWidth={Math.max(2, lw * 0.3)} strokeCap="round" strokeJoin="round" color="#FFF9EE" />
    </Group>
  );
}
