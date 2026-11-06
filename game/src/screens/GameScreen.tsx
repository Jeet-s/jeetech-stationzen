import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Dimensions, Image, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  AnimatedNumber, Burst, Confetti, GameButton, Icon, Popup, TagPill, Tappable, TutorialHand, TutorialTrail, WinPopup, feedback, fonts, palette, play, shadow, springs, useShake,
} from "../ui";
import {
  applyMove, forecast, idx, legalMoves, netInfo, stage, starsFor, star3Met, startState, stationCap, stationLoad, type CardKind, type Level, type Move, type State,
} from "../game/engine";
import { LEVELS } from "../game/levels";
import { handleAt, lineAt, lineDropPoint, lineHandles, lineSegments, makeGeo, stationAt, stationPt, type Geo, type Handle, type Pt } from "../game/board";
import { nextAction, type Action } from "../game/hint";
import {
  CARD_BODY, CARD_ICON, CARD_TITLE, GLYPH_LABEL, LINE_COLORS, cityName, levelInCity, lookOf, objectiveText, rewardFor, star3Of, tipsFor,
} from "../game/meta";
import { MapCanvas, RING_COLORS, type Focus } from "./game/MapCanvas";
import { LastCallGlows, MapLabels, Trains } from "./game/MapOverlays";
import { CoachCard, ResourceChip, RoundButton } from "./game/parts";
import { HeatmapReplay } from "./game/Heatmap";
import { chipSpots, clearKnobs, tagSpot } from "./game/placement";
import { art } from "../art";
import { GLYPH_IMG } from "../gameArt";
import { store } from "../modules/store";
import { ads } from "../modules/ads";
import { analytics } from "../modules/analytics";
import { review } from "../modules/review";
import { useBottomInset } from "../modules/layout";
import { qa, reportNext, type QaTouch } from "../modules/qa";

/**
 * reportNext() normalises by Dimensions "window" while device QA multiplies by the physical screen. The app draws
 * edge-to-edge (measureInWindow is screen-relative), but on some Android builds Dimensions reports a window (and a
 * "screen") without the status/navigation bars, so every reported touch landed a few % low, growing with y — level 24's
 * line-end knob at 57 % of the screen was missed after 4 good moves (level_replay, 2026-11-06). The game's root view
 * is full-bleed, so its own measured frame IS the screen in the touch coordinate space: normalise by that.
 */
const rootFrame = { w: 0, h: 0 };
function reportTouch(level: number, t: QaTouch | null): void {
  if (!t) return reportNext(level, null);
  const win = Dimensions.get("window");
  const fx = rootFrame.w > 0 ? win.width / rootFrame.w : 1;
  const fy = rootFrame.h > 0 ? win.height / rootFrame.h : 1;
  reportNext(level, { x: t.x * fx, y: t.y * fy, ...(t.x2 != null && t.y2 != null ? { x2: t.x2 * fx, y2: t.y2 * fy } : {}) });
}

type ViewRef = React.ComponentRef<typeof View>;
const UNDO_DEPTH = 3; // the last 3 edits of the week (GDD: undo the last 3 edits, also while paused)

/** Screenshot mode: play the first `steps` actions of the level's winning plan, then optionally open a state. */
export interface Demo { steps: number; win?: boolean; station?: string; card?: boolean }

type Drag =
  | { kind: "draw"; from: Pt; cur: number; line: number; end: "h" | "t" | null; finger: Pt; moved: boolean; start: number }
  | { kind: "chip"; what: "car" | "hub"; finger: Pt };

/**
 * One level: the city map (draw lines by dragging between stations, extend them by their end knobs), the week HUD
 * with deliveries and the forecast, the tray (resources, undo/redo, hint, Breather, Run week), weekly cards, the
 * station demand card with route preview, and the win / soft-fail flow. Every week starts frozen ("pause and plan").
 */
export function GameScreen({ levelNumber, onExit, onSettings, onNextLevel, demo, mode = "campaign", onFinish, onWeek, header }: {
  levelNumber: number; onExit: () => void; onSettings: () => void; onNextLevel: (n: number) => void; demo?: Demo;
  /** campaign (stars + progress), daily (the day's puzzle) or duel (side by side with a rival). */
  mode?: "campaign" | "daily" | "duel";
  /** daily / duel: the run is over (won, or — in a duel — ended by a crowded station); the mode shows its own result. */
  onFinish?: (fin: State) => void;
  /** After every week that runs (duel progress). */
  onWeek?: (s: State) => void;
  /** Mode strip under the HUD (rival progress, daily banner). */
  header?: React.ReactNode;
}) {
  const campaign = mode === "campaign";
  const L: Level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, levelNumber - 1))];
  const look = lookOf(L.index);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const quick = qa.level != null;
  const [player, setPlayer] = useState(store.get());
  useEffect(() => store.subscribe(setPlayer), []);
  const calm = !!player.reduceMotion;

  // ── game state ──
  const { initial, fromSave } = useMemo(() => {
    let st0 = startState(L);
    if (demo) {
      for (let k = 0; k < demo.steps; k++) {
        const a = nextAction(L, st0, 400);
        if (!a) break;
        st0 = applyMove(L, st0, a.move);
      }
      return { initial: st0, fromSave: false };
    }
    const saved = store.get().run;
    if (!quick && mode === "campaign" && saved && saved.level === levelNumber && saved.sig === L.sig) {
      const st = saved.state as State;
      if (st && !st.over && st.map === L.sig && st.wk > 0) return { initial: st, fromSave: true };
    }
    return { initial: st0, fromSave: false };
  }, [L, demo, levelNumber, quick, mode]);
  const [s, setS] = useState<State>(initial);
  const [undoStack, setUndo] = useState<State[]>([]);
  const [redoStack, setRedo] = useState<State[]>([]);
  const [weekStarts, setWeekStarts] = useState<State[]>(() => [initial]);
  const [result, setResult] = useState<"win" | "fail" | null>(demo?.win ? "win" : null);
  const [focus, setFocus] = useState(-1);
  const [cardHidden, setCardHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [toast, setToast] = useState<{ text: string; n: number; warn?: boolean } | null>(null);
  const [burst, setBurst] = useState<{ x: number; y: number; n: number; color?: string } | null>(null);
  // touch-down squash/glow on the pressed station or knob (board pixels)
  const [press, setPress] = useState<{ x: number; y: number; n: number; r: number; color?: string } | null>(null);
  // "+N riders" lands IN the rider pill (never over the HUD text or the objective line, render_defects 2026-11-06)
  const [gain, setGain] = useState<{ text: string; n: number } | null>(null);
  // the rider counter while a week runs: ticks up delivery by delivery in step with the arrivals (null = s.dl)
  const [liveDl, setLiveDl] = useState<number | null>(null);
  // the week tab while a run spans several weeks: it flips week by week in step with the trains (null = s.wk)
  const [liveWk, setLiveWk] = useState<number | null>(null);
  const weekPop = useSharedValue(1);
  const weekPopStyle = useAnimatedStyle(() => ({ transform: [{ scale: weekPop.value }] }));
  // departure: a burst + "All aboard" puff at the Run button (window px) the instant it is pressed
  const [depart, setDepart] = useState<{ x: number; y: number; n: number } | null>(null);
  // the instant the goal is reached: a soft white flash over the whole screen
  const [winFlash, setWinFlash] = useState(0);
  const runTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => runTimers.current.forEach(clearTimeout), []);
  // the planned state at the start of the run (the overcrowd rings fill from it while the week runs)
  const [runFrom, setRunFrom] = useState<State | null>(null);
  // a connection landing: the new segment fills with the line colour and glows (board pixels)
  const [flash, setFlash] = useState<{ p1: Pt; p2: Pt; color: string; n: number } | null>(null);
  const [tag, setTag] = useState<{ text: string; x: number; y: number; color: string; n: number } | null>(null);
  // tutorial: the step just done, praised in the coach card until the next one
  const [praise, setPraise] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [heat, setHeat] = useState(false);
  const [runs, setRuns] = useState<State[]>([]); // the planned state at every "Run week" (Heatmap Replay)
  const runsRef = useRef<State[]>([]); // the same, readable from the run's timers (saved for Home's Heatmap Replay)
  const [hint, setHint] = useState<Action | null>(null);
  const [runN, setRunN] = useState(0);
  const [smooth, setSmooth] = useState(0); // calm weeks in a row (no ring rose) — the "combo"
  const dlPop = useSharedValue(1);
  const dlPopStyle = useAnimatedStyle(() => ({ transform: [{ scale: dlPop.value }] }));
  const trayShake = useShake(6);
  const [tipIdx, setTipIdx] = useState(0);
  const [resumed, setResumed] = useState(fromSave);
  // Latest state / drag for touch handlers (several touch events can arrive before React re-renders).
  const sRef = useRef(s);
  sRef.current = s;
  const dragRef = useRef<Drag | null>(null);
  const setDragBoth = (d: Drag | null) => { dragRef.current = d; setDrag(d); };
  const moveN = useRef(0);
  const tutorialRef = useRef(false);

  // ── layout ──
  const [area, setArea] = useState({ w: 0, h: 0 });
  const geo: Geo | null = useMemo(() => (area.w > 0 && area.h > 0 ? makeGeo(L, area.w, area.h, 40) : null), [L, area.w, area.h]);
  const segs = useMemo(() => (geo ? lineSegments(geo, L, s) : []), [geo, L, s]);
  const handles = useMemo(() => (geo ? clearKnobs(geo, L, lineHandles(geo, L, s)) : []), [geo, L, s]);
  const fc = useMemo(() => (s.over ? null : forecast(L, s)), [L, s]);
  const boardRef = useRef<ViewRef>(null);
  const runRef = useRef<ViewRef>(null);
  const carRef = useRef<ViewRef>(null);
  const hubRef = useRef<ViewRef>(null);
  const cardRefs = useRef<(ViewRef | null)[]>([]);
  const boardWin = useRef({ x: 0, y: 0 });
  const measureBoard = useCallback(() => boardRef.current?.measureInWindow((x, y) => (boardWin.current = { x, y })), []);

  const runT = useSharedValue(0);
  const [laps, setLaps] = useState(1);
  const intro = useSharedValue(0);
  useEffect(() => {
    intro.value = 0;
    intro.value = withTiming(1, { duration: quick ? 1 : 560, easing: Easing.out(Easing.cubic) });
  }, [intro, quick, levelNumber]);
  // a new board eases in (stable view: opacity from 0.25, a short rise and settle) — the level-to-level transition
  const introStyle = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * intro.value, transform: [{ translateY: 14 * (1 - intro.value) }, { scale: 0.97 + 0.03 * intro.value }] }));

  // ── analytics: level start ──
  useEffect(() => {
    if (demo) return;
    if (campaign) analytics.track("level_start", { level: levelNumber });
    else analytics.track(mode === "daily" ? "daily_start" : "duel_start", { map: levelNumber });
  }, [levelNumber, demo, campaign, mode]);

  // demo: open a station card
  useEffect(() => {
    if (demo?.station === "busiest") {
      // the busiest station whose riders already have a route (the card then previews their lines)
      const net = netInfo(L, initial);
      const routed = (i: number) => L.groups.some((g, k) => g.s === i && net.route[k] > 0);
      const load = (i: number) => (routed(i) ? 1000 : 0) + stationLoad(L, initial, i);
      setFocus(L.stations.map((_, i) => load(i)).reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0));
    }
    else if (demo?.station) setFocus(idx(L, demo.station));
  }, [demo, L, initial]);

  // ── focus: route preview of the selected station's riders ──
  const focusInfo: Focus = useMemo(() => {
    if (focus < 0) return { st: -1, lines: 0 };
    const net = netInfo(L, s);
    let lines = 0;
    L.groups.forEach((g, i) => { if (g.s === focus && net.route[i] > 0) lines |= net.route[i]; });
    return { st: focus, lines };
  }, [focus, L, s]);

  const say = useCallback((text: string, warn = false) => setToast((t) => ({ text, warn, n: (t?.n ?? 0) + 1 })), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.warn ? 2600 : 3400);
    return () => clearTimeout(id);
  }, [toast]);

  // ── apply an accepted move ──
  const accept = useCallback((m: Move, at?: Pt, color?: string) => {
    const cur = sRef.current;
    if (!legalMoves(L, cur).includes(m)) return false;
    const next = applyMove(L, cur, m);
    sRef.current = next;
    analytics.qa("move", { level: levelNumber });
    moveN.current++;
    setHint(null);
    if (m[0] === "k") {
      setUndo([]);
      setRedo([]);
    } else {
      setUndo((u) => [...u.slice(-(UNDO_DEPTH - 1)), cur]);
      setRedo([]);
    }
    setS(next);
    if (at && geo) {
      setBurst((b) => ({ x: at.x, y: at.y, n: (b?.n ?? 0) + 1, color }));
      if (m[0] === "n" || m[0] === "e" || m[0] === "o" || m[0] === "x") setPress((k) => ({ ...at, n: (k?.n ?? 0) + 1, r: geo.sr, color }));
    }
    feedback(m[0] === "c" || m[0] === "x" ? "unlock" : "pop", "light");
    if (tutorialRef.current) setPraise(m[0] === "n" ? "Line drawn!" : m[0] === "e" ? "Line extended!" : "Nice!");
    return true;
  }, [L, geo, levelNumber]);

  // the connection a <from>→<to> drag just made: colour fill + glow along the segment, a pop and a label at the station
  const connected = useCallback((a: number, b: number, color: string, text: string) => {
    if (!geo) return;
    const c1 = stationPt(geo, L, a), c2 = stationPt(geo, L, b);
    // the snap flash runs between the two stations' RIMS: never over either station's glyph
    const len = Math.hypot(c2.x - c1.x, c2.y - c1.y) || 1, ux = (c2.x - c1.x) / len, uy = (c2.y - c1.y) / len, rim = geo.sr * 1.15;
    const p1 = { x: c1.x + ux * rim, y: c1.y + uy * rim }, p2 = { x: c2.x - ux * rim, y: c2.y - uy * rim };
    if (len > rim * 2 + 4) setFlash((f) => ({ p1, p2, color, n: (f?.n ?? 0) + 1 }));
    // an opaque pill on the station's free side (never over its rails, knob, demand chip or waiting badge)
    const knobs = clearKnobs(geo, L, lineHandles(geo, L, sRef.current)).map((h) => h.p);
    const at = tagSpot(geo, L, b, text.length * 8.5 + 26, 28, knobs);
    setTag((k) => ({ text, x: at.x, y: at.y, color, n: (k?.n ?? 0) + 1 }));
  }, [geo, L]);

  // why a drawn connection can't be made (calm, specific)
  const refuse = useCallback((a: number, b: number, kind: "new" | "extend") => {
    const s = sRef.current;
    const c = L.cor[a * L.stations.length + b];
    let why = "No rail between these stations.";
    if (c >= 0) {
      if (s.tr <= 0) why = "No track left this week. Run the week for more.";
      else if (L.corridors[c].river && s.tu <= 0) why = "This crossing needs a tunnel.";
      else if (kind === "new" && s.fl <= 0) why = "Every line is in use. Drag a line's end knob to extend it.";
      else why = "That station is already on this line.";
    }
    feedback("error", "light");
    if (!calm) trayShake.shake();
    say(why, true);
  }, [L, say, calm, trayShake]);

  // ── board touches: drag from a station = new line; from a line's end knob = extend; tap = station card ──
  const toBoard = (e: GestureResponderEvent): Pt => ({ x: e.nativeEvent.pageX - boardWin.current.x, y: e.nativeEvent.pageY - boardWin.current.y });
  const onGrant = (e: GestureResponderEvent) => {
    if (!geo) return;
    if (tutorialRef.current) setPraise(null);
    const p = toBoard(e);
    const st = stationAt(geo, L, p);
    let h: Handle | null = handleAt(handles, p, Math.max(30, geo.lw * 3));
    // a knob sits just outside its station: grab whichever the finger is nearer (a touch on a station that ends a
    // line starts a NEW line; the knob extends it)
    // A touch on the station's disc itself always means the station (level_replay L24 2026-11-06: the knob of the line
    // ending at D pointed toward the next stop, and a touch a few dp low on D grabbed the knob instead of starting D-F).
    if (h && st >= 0) {
      const sp = stationPt(geo, L, st);
      const ds = Math.hypot(sp.x - p.x, sp.y - p.y);
      if (ds <= geo.sr * 1.05 || ds < Math.hypot(h.p.x - p.x, h.p.y - p.y)) h = null;
    }
    if (h) {
      setFocus(-1);
      setPress((k) => ({ ...h!.p, n: (k?.n ?? 0) + 1, r: geo.lw * 1.6 }));
      feedback("tap", "select");
      setDragBoth({ kind: "draw", from: h.p, cur: h.st, line: h.line, end: h.end, finger: p, moved: false, start: h.st });
      return;
    }
    if (st >= 0) {
      feedback("tap", "select");
      setDragBoth({ kind: "draw", from: stationPt(geo, L, st), cur: st, line: -1, end: null, finger: p, moved: false, start: st });
      setPress((k) => ({ ...stationPt(geo, L, st), n: (k?.n ?? 0) + 1, r: geo.sr }));
      return;
    }
    setFocus(-1);
  };
  const onMove = (e: GestureResponderEvent) => {
    const drag = dragRef.current;
    if (!geo || !drag || drag.kind !== "draw") return;
    const s = sRef.current;
    const p = toBoard(e);
    let d = { ...drag, finger: p, moved: drag.moved || Math.hypot(p.x - drag.from.x, p.y - drag.from.y) > geo.sr * 1.1 };
    if (d.moved && !drag.moved) setFocus(-1); // drawing closes the station card
    const x = stationAt(geo, L, p, 0.8);
    if (x >= 0 && x !== d.cur && !result && !busy) {
      const cx = L.stations[x].ch;
      if (d.line < 0) {
        const a = L.stations[d.cur].ch;
        const m = "n" + (a < cx ? a + cx : cx + a);
        const nl = s.ln.length;
        if (accept(m, stationPt(geo, L, x), LINE_COLORS[nl % LINE_COLORS.length])) {
          feedback("move", "medium");
          connected(d.cur, x, LINE_COLORS[nl % LINE_COLORS.length], `Line ${nl + 1}`);
          // keep drawing: the finger now holds the new line's end at x
          d = { ...d, line: nl, end: m[1] === cx ? "h" : "t", cur: x, from: stationPt(geo, L, x) };
        } else {
          // dragged from a station that ENDS a line and no new line can start: the player means "extend it"
          const a0 = L.stations[d.cur].ch;
          const ends = s.ln.flatMap((ln, l): { l: number; end: "h" | "t" }[] => (ln.o ? [] : ln.s[0] === a0 ? [{ l, end: "h" }] : ln.s[ln.s.length - 1] === a0 ? [{ l, end: "t" }] : []));
          const ext = ends.find((e) => legalMoves(L, s).includes(`e${e.l}${e.end}${cx}`));
          if (ext && accept(`e${ext.l}${ext.end}${cx}`, stationPt(geo, L, x), LINE_COLORS[ext.l % LINE_COLORS.length])) {
            connected(d.cur, x, LINE_COLORS[ext.l % LINE_COLORS.length], `+ ${GLYPH_LABEL[L.stations[x].glyph]}`);
            d = { ...d, line: ext.l, end: ext.end, cur: x, from: stationPt(geo, L, x) };
          } else {
            refuse(d.cur, x, "new");
            d = { ...d, cur: x, from: stationPt(geo, L, x), line: -2 };
          }
        }
      } else if (d.line >= 0 && d.end) {
        const line = s.ln[d.line];
        const other = d.end === "h" ? line.s[line.s.length - 1] : line.s[0];
        const loop = `o${d.line}`;
        const ext = `e${d.line}${d.end}${cx}`;
        if (cx === other && legalMoves(L, s).includes(loop)) {
          accept(loop, stationPt(geo, L, x), LINE_COLORS[d.line % LINE_COLORS.length]);
          connected(d.cur, x, LINE_COLORS[d.line % LINE_COLORS.length], "Loop!");
          feedback("success", "medium");
          say("Loop closed: it runs twice as often.");
          d = { ...d, line: -2, cur: x };
        } else if (accept(ext, stationPt(geo, L, x), LINE_COLORS[d.line % LINE_COLORS.length])) {
          connected(d.cur, x, LINE_COLORS[d.line % LINE_COLORS.length], `+ ${GLYPH_LABEL[L.stations[x].glyph]}`);
          d = { ...d, cur: x, end: d.end, from: stationPt(geo, L, x) };
        } else if (!line.s.includes(cx) || cx === other) {
          refuse(d.cur, x, "extend");
          d = { ...d, line: -2, cur: x };
        }
      }
    }
    setDragBoth(d);
  };
  const onRelease = (e?: GestureResponderEvent) => {
    // The lift point counts as a last move: a fast or coarse swipe (a loaded device, adb `input swipe`) can deliver
    // DOWN then UP at the far station with no MOVE between — it was read as a tap on the first station and opened its
    // card instead of drawing the line (level_replay L24, 2026-11-06).
    if (e && dragRef.current?.kind === "draw") onMove(e);
    const drag = dragRef.current;
    if (drag?.kind === "draw" && !drag.moved && drag.line === -1) {
      if (tutorialRef.current) {
        // the tutorial owns the screen: one overlay at a time — a tap is nudged toward the drag instead of a card
        say("Keep your finger down and drag to the next station.");
      } else {
        // a tap on a station: its demand card + route preview
        setFocus((f) => (f === drag.start ? -1 : drag.start));
      }
      feedback("tap", "select");
    }
    setDragBoth(null);
  };

  // ── tray chips: drag a carriage onto a line / an interchange onto a station ──
  const chipDrag = (what: "car" | "hub") => ({
    onGrant: (e: GestureResponderEvent) => {
      measureBoard();
      feedback("tap", "select");
      setDragBoth({ kind: "chip", what, finger: { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } });
    },
    onMove: (e: GestureResponderEvent) => setDragBoth({ kind: "chip", what, finger: { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } }),
    onRelease: (e: GestureResponderEvent) => {
      setDragBoth(null);
      if (!geo) return;
      const p = { x: e.nativeEvent.pageX - boardWin.current.x, y: e.nativeEvent.pageY - boardWin.current.y };
      if (what === "car") {
        let l = lineAt(geo, segs, p);
        if (l < 0) l = handleAt(handles, p, 30)?.line ?? -1;
        if (l < 0) { if (p.y > 0 && p.y < area.h) say("Drop the carriage on a line.", true); return; }
        if (accept(`c${l}`, p, LINE_COLORS[l % LINE_COLORS.length])) say(`Carriage added: line ${l + 1} has more seats.`);
      } else {
        const st = stationAt(geo, L, p, 1.2);
        if (st < 0) { if (p.y > 0 && p.y < area.h) say("Drop the interchange on a station.", true); return; }
        if (!accept(`x${L.stations[st].ch}`, stationPt(geo, L, st), palette.secondary)) say("That station is already an interchange.", true);
        else say(`${GLYPH_LABEL[L.stations[st].glyph]} station now holds 24.`);
      }
    },
  });

  // ── undo / redo / restart ──
  const undo = () => {
    const prev = undoStack[undoStack.length - 1];
    if (!prev || busy || result) return;
    feedback("whoosh", "select");
    analytics.qa("move", { level: levelNumber });
    setRedo((r) => [...r, s]);
    setUndo((u) => u.slice(0, -1));
    setS(prev);
    setHint(null);
    setBurst((b) => ({ x: area.w / 2, y: area.h / 2, n: (b?.n ?? 0) + 1, color: palette.secondary }));
  };
  const redo = () => {
    const nxt = redoStack[redoStack.length - 1];
    if (!nxt || busy || result) return;
    feedback("whoosh", "select");
    analytics.qa("move", { level: levelNumber });
    setUndo((u) => [...u.slice(-(UNDO_DEPTH - 1)), s]);
    setRedo((r) => r.slice(0, -1));
    setS(nxt);
    setBurst((b) => ({ x: area.w / 2, y: area.h / 2, n: (b?.n ?? 0) + 1, color: palette.primary }));
  };
  const resetTo = (st: State, why: "restart" | "week") => {
    setS(st);
    setUndo([]);
    setRedo([]);
    setResult(null);
    setHint(null);
    setFocus(-1);
    setCardHidden(false);
    setSmooth(0);
    setRuns((r) => r.filter((x) => x.wk < st.wk));
    runsRef.current = runsRef.current.filter((x) => x.wk < st.wk);
    if (why === "restart") {
      setWeekStarts([st]);
      if (campaign) analytics.track("level_start", { level: levelNumber });
    } else {
      setWeekStarts((w) => w.slice(0, Math.max(1, w.findIndex((x) => x === st) + 1)));
    }
    analytics.track("level_retry", { level: levelNumber, week: st.wk + 1 });
  };

  // ── run the week ──
  const runWeek = () => {
    if (busy || result || s.over) return;
    if (s.cd) { setResumed(false); setCardHidden(false); return; }
    if (resumed) setResumed(false);
    if (!legalMoves(L, s).includes("g")) { say("Draw a line first: drag from one station to its neighbour.", true); return; }
    const before = s;
    const next = applyMove(L, s, "g");
    setRuns((r) => [...r, before]);
    runsRef.current = [...runsRef.current, before];
    analytics.qa("move", { level: levelNumber });
    moveN.current++;
    feedback("whoosh", "medium");
    setHint(null);
    setFocus(-1);
    setUndo([]);
    setRedo([]);
    setS(next);
    const weeks = next.wk - before.wk;
    setLaps(Math.min(3, weeks));
    const dur = runDur(weeks, quick, calm);
    runRef.current?.measureInWindow((x, y, w, h) => setDepart((d) => ({ x: x + w / 2, y: y + h / 2, n: (d?.n ?? 0) + 1 })));
    setBusy(true);
    setRunFrom(before);
    runT.value = 0;
    runT.value = withTiming(1, { duration: dur, easing: Easing.inOut(Easing.quad) });
    setRunN((n) => n + 1);
    // the rider counter ticks up delivery by delivery while the trains run (it showed 1/19 then jumped to 19/19)
    runTimers.current.forEach(clearTimeout);
    runTimers.current = [];
    const delivered = next.dl - before.dl;
    setLiveDl(before.dl);
    const K = Math.min(Math.max(0, delivered), 30);
    // a multi-week run flips the week tab week by week (it jumped from 1/3 to 3/3)
    setLiveWk(before.wk + 1);
    for (let w = 1; w < weeks; w++) {
      runTimers.current.push(setTimeout(() => {
        setLiveWk(before.wk + 1 + w);
        weekPop.value = withSequence(withTiming(1.18, { duration: 90 }), withSpring(1, springs.pop));
        play("pop", 0.5);
      }, (dur * w) / weeks));
    }
    for (let j = 0; j < K; j++) {
      runTimers.current.push(setTimeout(() => {
        setLiveDl(before.dl + Math.round((delivered * (j + 1)) / K));
        dlPop.value = withSequence(withTiming(1.07, { duration: 70 }), withSpring(1, springs.pop));
      }, 160 + ((dur * 0.86 - 160) * (j + 1)) / K));
    }
    if (tutorialRef.current) setPraise("Trains are rolling!");
    setTimeout(() => afterRun(before, next), dur + 40);
  };

  const afterRun = (before: State, next: State) => {
    setBusy(false);
    setLiveWk(null);
    runT.value = 0;
    onWeek?.(next);
    // deliveries land: the counter (already ticked up during the run) pops and "+N" lands in the rider pill; a calm
    // week (no ring rose) builds a streak
    setLiveDl(null);
    setRunFrom(null);
    setPraise(null);
    const delivered = next.dl - before.dl;
    const calmWeek = next.pk <= before.pk || next.pk < 2;
    if (delivered > 0) {
      dlPop.value = withSequence(withTiming(1.12, { duration: 110 }), withSpring(1, springs.pop));
      const streak = calmWeek ? smooth + 1 : 0;
      setSmooth(streak);
      setGain((g) => ({ text: streak >= 2 ? `+${delivered} · Smooth ×${streak}` : `+${delivered} riders`, n: (g?.n ?? 0) + 1 }));
      if (!next.over) play(streak >= 3 ? "star3" : streak === 2 ? "star2" : "coin", 0.7);
    } else setSmooth(0);
    // a weekly card waits at the start of this week: open it (even if the last one was hidden with "View map first")
    if (next.cd && !next.over) setCardHidden(false);
    if (next.over === 1) return win(next);
    if (next.over === 2) return fail(next);
    setWeekStarts((w) => [...w, next]);
    if (!demo && !quick && campaign) store.set({ run: { level: levelNumber, state: next, sig: L.sig } });
    // what's new this week
    const bits: string[] = [];
    const tracks = L.spec.tracks[next.wk] ?? 0;
    if (tracks) bits.push(`+${tracks} track${tracks > 1 ? "s" : ""}`);
    const opening = L.stations.filter((st) => st.opens === next.wk + 1).map((st) => GLYPH_LABEL[st.glyph]);
    if (opening.length) bits.push(`${opening.join(" & ")} station opens`);
    if (L.spec.snow?.includes(next.wk + 1)) bits.push("snow: trains at half seats");
    if ((L.spec.rush?.[next.wk + 1] ?? 1) > 1) bits.push("rush hour");
    const market = L.stations.find((st) => st.market === next.wk + 1);
    if (market) bits.push(`market day at ${GLYPH_LABEL[market.glyph]}`);
    const rose = L.stations.findIndex((_, i) => stage(stationLoad(L, next, i), stationCap(L, next, i)) > stage(stationLoad(L, before, i), stationCap(L, before, i)) && stage(stationLoad(L, next, i), stationCap(L, next, i)) >= 2);
    if (rose >= 0) {
      feedback("star1", "warning");
      say(`${GLYPH_LABEL[L.stations[rose].glyph]} station is getting busy. Week ${next.wk + 1} is frozen: plan calmly.`, true);
    } else say(`Week ${next.wk + 1}${bits.length ? " · " + bits.join(" · ") : " · plan your network"}`);
  };

  // Home's Heatmap Replay shows the most recent finished run (campaign + daily; not demos, duels or QA replays)
  const saveRun = (won: boolean) => {
    if (demo || quick || mode === "duel" || !runsRef.current.length) return;
    store.set({ lastRun: { level: levelNumber, sig: L.sig, won, runs: runsRef.current, at: Date.now() } });
  };
  const win = (fin: State) => {
    const stars = starsFor(L, fin);
    saveRun(true);
    setCelebrate((c) => c + 1);
    if (!calm) setWinFlash((n) => n + 1);
    feedback("success", "success");
    if (!campaign && !demo) {
      // daily / duel: the board celebrates, then the mode shows its own result card
      setTimeout(() => onFinish?.(fin), quick ? 150 : 1500);
      return;
    }
    const done = () => {
      setResult("win");
      if (demo) return;
      const prev = store.get().stars ?? {};
      const id = String(levelNumber);
      store.set({
        stars: { ...prev, [id]: Math.max(prev[id] ?? 0, stars) },
        coins: store.get().coins + rewardFor(L.index, stars),
        level: Math.max(store.get().level, levelNumber + 1),
        run: null,
      });
      analytics.track("level_complete", { level: levelNumber, stars });
      review.levelWon(levelNumber); // in-app review at a happy moment (gated inside: level >= 3, cooldown, never in QA)
      if (levelNumber === 2 && !store.get().tutorialDone) {
        store.set({ tutorialDone: true });
        analytics.track("tutorial_done");
      }
    };
    // the board celebrates first (stations burst in turn, confetti from the board, "All aboard!" ribbon), then the card
    setTimeout(done, quick ? 150 : calm ? 800 : 1100);
  };
  const fail = (fin: State) => {
    feedback("fail", "warning");
    saveRun(false);
    if (mode === "duel") { setTimeout(() => onFinish?.(fin), quick ? 100 : 700); return; } // a duel scores what was delivered
    if (campaign) analytics.track("level_fail", { level: levelNumber, week: fin.wk });
    else analytics.track("daily_fail", { map: levelNumber, week: fin.wk });
    setTimeout(() => setResult("fail"), quick ? 100 : 700);
  };

  // ── weekly card ──
  const cards: CardKind[] = s.cd ? L.spec.cards?.[s.cd] ?? [] : [];
  // one overlay at a time: a resumed run first shows "Welcome back", then the card (tour 2026-11-06: both at once)
  const cardVisible = !!s.cd && !cardHidden && !result && !busy && !resumed;
  // each card's forecast: can the week's best plan still reach the goal with it? (no hidden fatal pick — the card
  // that leaves the goal out of reach says so before it is chosen)
  const [cardFc, setCardFc] = useState<{ wk: number; ok: boolean[] } | null>(null);
  useEffect(() => {
    if (!cardVisible || quick) return;
    const id = setTimeout(() => {
      const ok = cards.map((_, i) => {
        const m = `k${i}`;
        if (!legalMoves(L, s).includes(m)) return false;
        return nextAction(L, applyMove(L, s, m), 260) != null;
      });
      setCardFc({ wk: s.wk, ok });
    }, 60);
    return () => clearTimeout(id);
  }, [cardVisible, s, L, quick]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickCard = (i: number) => {
    if (accept(`k${i}`, { x: area.w / 2, y: area.h / 2 }, palette.gold)) {
      feedback("unlock", "medium");
      setCardHidden(false);
      say(`${CARD_TITLE[cards[i]]}: ${CARD_BODY[cards[i]]}`);
    }
  };

  // ── boosters ──
  const takeHint = () => {
    if (busy || result) return;
    const give = () => {
      const a = nextAction(L, s, 400);
      if (!a) { say("No winning plan from here. Undo, or retry this week.", true); return false; }
      setHint(a);
      feedback("unlock", "select");
      return true;
    };
    if ((player.hints ?? 0) > 0) {
      if (give()) store.set({ hints: (store.get().hints ?? 0) - 1 });
    } else if (!ads.showRewarded(() => give())) say("No hints left. Get more in the Shop.", true);
  };
  const takeBreather = () => {
    if (busy || result) return;
    const apply = () => {
      if (!s.q.some((v) => v > 1)) { say("Nobody is waiting yet: save your Breather.", true); return false; }
      const next = { ...s, q: s.q.map((v) => Math.floor(v / 2)) };
      analytics.qa("move", { level: levelNumber });
      setUndo((u) => [...u.slice(-(UNDO_DEPTH - 1)), s]);
      setS(next);
      feedback("unlock", "medium");
      say("A calm breeze: every queue is halved.");
      if (geo) {
        const busiest = L.stations.map((_, i) => stationLoad(L, s, i)).reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0);
        setBurst((b) => ({ ...stationPt(geo, L, busiest), n: (b?.n ?? 0) + 1, color: palette.secondary }));
      }
      analytics.track("booster_used", { level: levelNumber, booster: "breather" });
      return true;
    };
    if ((player.breathers ?? 0) > 0) {
      if (apply()) store.set({ breathers: (store.get().breathers ?? 0) - 1 });
    } else if (!ads.showRewarded(() => apply())) say("No Breathers left. Get more in the Shop.", true);
  };

  // ── tutorial + tips ──
  const tutorial = !demo && !quick && campaign && levelNumber <= 2 && !player.tutorialDone;
  tutorialRef.current = tutorial;
  const coachAction = useMemo(() => (tutorial && !result && !busy ? nextAction(L, s, 120) : null), [tutorial, L, s, result, busy]);
  const shownAction = hint ?? coachAction;
  const tips = useMemo(() => (demo || quick ? [] : tipsFor(L.index).filter((t) => !(player.tips ?? []).includes(t.id))), [L, demo, quick, player.tips]);
  const tip = tips[tipIdx] && !tutorial ? tips[tipIdx] : null;
  const dismissTip = () => {
    if (!tip) return;
    store.set({ tips: [...(store.get().tips ?? []), tip.id] });
    setTipIdx(0);
  };
  const skipTutorial = () => {
    store.set({ tutorialDone: true });
    analytics.track("tutorial_done", { skipped: true });
    setHint(null);
  };
  const coachText = (a: Action | null): string => {
    if (!a) return "";
    const g = (st: number) => GLYPH_LABEL[L.stations[st].glyph];
    switch (a.kind) {
      case "new": return `Drag from the ${g(a.a)} station to the ${g(a.b)} station to draw a line.`;
      case "extend": return `Drag the knob at the line's end onto the ${g(a.to)} station to extend it.`;
      case "loop": return "Drag the line's end knob onto its other end to close a loop.";
      case "car": return "Drag the carriage chip onto the glowing line.";
      case "hub": return `Drag the interchange chip onto the ${g(a.st)} station.`;
      case "card": return `Pick the "${CARD_TITLE[cards[a.i]] ?? "card"}" card.`;
      case "run": return levelNumber === 1 && s.wk === 0 ? "Tap Run week: trains carry riders to the glyph they want." : "Tap Run week to see your network flow.";
    }
  };

  // window-space gesture for an action (tutorial hand, hint, QA replay)
  const gestureFor = useCallback((a: Action, board: Pt, cb: (from: Pt, to?: Pt) => void) => {
    if (!geo) return;
    const B = (p: Pt) => ({ x: board.x + p.x, y: board.y + p.y });
    const knob = (line: number, end: "h" | "t") => handles.find((h) => h.line === line && h.end === end);
    const center = (ref: ViewRef | null, f: (p: Pt) => void) => ref?.measureInWindow((x, y, w, h) => f({ x: x + w / 2, y: y + h / 2 }));
    switch (a.kind) {
      case "new": return cb(B(stationPt(geo, L, a.a)), B(stationPt(geo, L, a.b)));
      case "extend":
      case "loop": {
        const k = knob(a.line, a.end);
        if (k) cb(B(k.p), B(stationPt(geo, L, a.to)));
        return;
      }
      case "car": {
        const p = lineDropPoint(segs, a.line);
        if (p) center(carRef.current, (c) => cb(c, B(p)));
        return;
      }
      case "hub": return center(hubRef.current, (c) => cb(c, B(stationPt(geo, L, a.st))));
      case "card": return center(cardRefs.current[a.i] ?? null, (c) => cb(c));
      case "run": return center(runRef.current, (c) => cb(c));
    }
  }, [geo, L, handles, segs]);

  // tutorial hand / hint hand position (window coords → this screen is full-window)
  // The hand shows the gesture with its FINGERTIP: on the knob it describes (extend / loop) or on the start station's
  // rim (a new line), travelling to the target station's rim — never on a glyph; its body turns into free space.
  // (The QA replay keeps the exact centres from gestureFor; only the drawing is moved.)
  const [hand, setHand] = useState<{ from: Pt; to?: Pt; n: number; knob: boolean; avoid: (Pt & { r?: number })[] } | null>(null);
  const dragging = !!drag;
  useEffect(() => {
    // the old hand goes the moment the board changes (it pointed at the previous step's knob for 350 ms while the coach
    // already described the next one — render_defects 2026-11-06), and never shows while a finger is on the board
    setHand(null);
    if (dragging || !shownAction || !geo || result || busy || focus >= 0 || (shownAction.kind === "card" ? !cardVisible : cardVisible)) return;
    const id = setTimeout(() => {
      boardRef.current?.measureInWindow((bx, by) => {
        boardWin.current = { x: bx, y: by };
        if (shownAction.kind === "run") {
          // the fingertip on the button's right end, clear of its "Run week" label
          runRef.current?.measureInWindow((x, y, w, h) => setHand((hd) => ({ from: { x: x + w * 0.86, y: y + h * 0.42 }, n: (hd?.n ?? 0) + 1, knob: false, avoid: [] })));
          return;
        }
        gestureFor(shownAction, { x: bx, y: by }, (from, to) => {
          const knob = shownAction.kind === "extend" || shownAction.kind === "loop";
          const onBoard = shownAction.kind === "new" || knob || shownAction.kind === "hub";
          let f = from, t = to;
          if (to && onBoard) {
            const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
            const ux = (to.x - from.x) / len, uy = (to.y - from.y) / len;
            const rim = geo.sr * 0.78; // inside the station's touch radius, outside its glyph
            if (shownAction.kind === "new") f = { x: from.x + ux * rim, y: from.y + uy * rim };
            t = { x: to.x - ux * rim, y: to.y - uy * rim };
          }
          const avoid = [
            ...L.stations.map((_, i) => { const p = stationPt(geo, L, i); return { x: bx + p.x, y: by + p.y }; }),
            ...chipSpots(geo, L).map((c) => ({ x: bx + c.x, y: by + c.y, r: c.r })),
            // the waiting badges (upper right of each station)
            // every line-end knob (the hand points at one, it must not hide it)
            ...handles.map((k) => ({ x: bx + k.p.x, y: by + k.p.y, r: geo.lw * 1.05 + 8 })),
          ];
          setHand((h) => ({ from: f, to: t, n: (h?.n ?? 0) + 1, knob, avoid }));
        });
      });
    }, 350);
    return () => clearTimeout(id);
  }, [shownAction, geo, result, busy, cardVisible, gestureFor, focus, L, dragging, handles]);

  // ── QA level replay: report the solver's next touch, measured fresh, after the board settles and after each move ──
  // Robust to a slow or interrupted device (2026-11-06: no qa_next at all while another app took the foreground on the
  // shared emulator): the report for the current state is retried until it lands, re-sent when the app returns to the
  // foreground, and falls back to the board position measured at layout if measureInWindow never calls back.
  const qaDone = useRef(-1); // moveN whose next touch has been reported
  const qaLive = useRef({ s, geo, busy, result, mv: 0, gestureFor: null as null | typeof gestureFor });
  qaLive.current = { s, geo, busy, result, mv: moveN.current, gestureFor };
  const qaReport = useCallback(() => {
    const { s: cur, geo: g, busy: b, result: r, mv, gestureFor: gf } = qaLive.current;
    // mv !== moveN: a move was accepted but not drawn yet — wait for the render (the effect reports then)
    if (qa.level == null || !g || b || !gf || mv !== moveN.current) return;
    if (r === "win" || cur.over === 1) { reportTouch(levelNumber, null); qaDone.current = moveN.current; return; }
    if (r) return;
    const at = moveN.current;
    const a = nextAction(L, cur, 600);
    if (!a) return;
    let sent = false;
    const send = (bx: number, by: number) => {
      if (sent || at !== moveN.current) return;
      sent = true;
      boardWin.current = { x: bx, y: by };
      gf(a, { x: bx, y: by }, (from0, to) => {
        let from = from0;
        if (a.kind === "new") {
          // start a new line on the side of the station AWAY from its line-end knobs: a touch that lands a little off
          // on the device can never be read as grabbing a knob
          const sp = stationPt(g, L, a.a);
          const ks = handles.filter((k) => k.st === a.a);
          if (ks.length) {
            let vx = 0, vy = 0;
            for (const k of ks) { const d = Math.hypot(k.p.x - sp.x, k.p.y - sp.y) || 1; vx -= (k.p.x - sp.x) / d; vy -= (k.p.y - sp.y) / d; }
            const n = Math.hypot(vx, vy);
            if (n > 0.2) from = { x: from0.x + (vx / n) * g.sr * 0.4, y: from0.y + (vy / n) * g.sr * 0.4 };
          }
        }
        reportTouch(levelNumber, to ? { x: from.x, y: from.y, x2: to.x, y2: to.y } : from);
        qaDone.current = at;
      });
    };
    boardRef.current?.measureInWindow((bx, by) => send(bx, by));
    setTimeout(() => send(boardWin.current.x, boardWin.current.y), 600);
  }, [L, levelNumber, handles]);
  useEffect(() => {
    if (qa.level == null || !geo || busy) return;
    if (result === "win" || s.over === 1) { qaReport(); return; }
    if (result) return;
    const id = setTimeout(qaReport, moveN.current === 0 ? 450 : 320);
    return () => clearTimeout(id);
  }, [s, geo, busy, result, cardVisible, qaReport]);
  useEffect(() => {
    if (qa.level == null) return;
    // retry until the current state's touch is out (cleared timers, late layout, a busy JS thread)
    const iv = setInterval(() => { if (qaDone.current !== moveN.current) qaReport(); }, 1500);
    // back in front after another app covered it: say the next touch again (the device QA reads the latest one)
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") setTimeout(() => { qaDone.current = -1; qaReport(); }, 400); });
    return () => { clearInterval(iv); sub.remove(); };
  }, [qaReport]);

  // The coach line follows the board, never runs ahead of it: while a finger is drawing, the step it is doing stays on
  // screen (or, once that step landed, "lift your finger"); the next step appears after the finger lifts.
  const coachFrozen = useRef("");
  const coachLive = shownAction ? coachText(shownAction) : "Watch the riders travel…";
  if (!drag) coachFrozen.current = coachLive;
  const coachLine = drag ? (praise ? "Lift your finger to see the next step." : coachFrozen.current || coachLive) : coachLive;

  // ── HUD values ──
  const dlShown = busy && liveDl != null ? liveDl : s.dl;
  const goalPct = Math.min(1, dlShown / L.goal);
  const projected = fc?.delivered ?? s.dl;
  const fcWarn = fc && fc.outcome !== "win";
  const firstFull = fc ? Math.min(...fc.fullWeek.filter((w) => w > 0), 99) : 99;
  // The forecast in a few characters: where the plan as drawn ends up
  const fcText = !fc ? "" : fc.outcome === "win" ? `${projected} ✓` : fc.outcome === "overflow" && firstFull < 99 ? `⚠ a station fills in wk ${firstFull}` : `${projected} of ${L.goal}`;
  const lastCall = L.stations.findIndex((st, i) => st.opens <= s.wk + 1 && stage(stationLoad(L, s, i), stationCap(L, s, i)) === 3);
  const hasRiver = L.corridors.some((c) => c.river);
  const showCars = s.ca > 0 || (L.spec.cars ?? 0) > 0 || Object.values(L.spec.cards ?? {}).some((c) => c.includes("car"));
  const showHubs = s.ix > 0 || (L.spec.hubs ?? 0) > 0 || Object.values(L.spec.cards ?? {}).some((c) => c.includes("hub"));
  const finalStars = s.over === 1 ? starsFor(L, s) : 0;

  const focusSt = focus >= 0 ? L.stations[focus] : null;

  return (
    <View
      style={styles.root}
      onLayout={(e) => {
        const t = e.currentTarget as unknown as ViewRef | null;
        t?.measureInWindow?.((x, y, w, h) => { if (w > 0 && h > 0) { rootFrame.w = x + w; rootFrame.h = y + h; } });
      }}
    >
      {/* the city: map art full-bleed, washed so lines and stations pop */}
      <Image source={art[look.bg]} style={[styles.bg, { width, height }]} resizeMode="cover" fadeDuration={0} />
      <View style={[styles.bg, { width, height, backgroundColor: look.wash }]} pointerEvents="none" />
      <LinearGradient colors={["rgba(246,235,217,0.55)", "rgba(246,235,217,0)"]} style={[styles.bg, { width, height: insets.top + 170 }]} pointerEvents="none" />

      {/* ── HUD ── */}
      <View style={[styles.hud, { paddingTop: insets.top + 6 }]}>
        <View style={styles.hudRow}>
          <RoundButton icon="back" label="Back to home" onPress={onExit} size={44} tint={palette.secondaryDark} />
          <View style={styles.weekTab}>
            <Icon name="calendar" size={20} tint={palette.primaryDark} />
            <View>
              <Text style={styles.weekLabel}>WEEK</Text>
              <Animated.Text style={[styles.weekValue, weekPopStyle]}>{Math.min(busy && liveWk != null ? liveWk : s.wk + 1, L.spec.weeks)}<Text style={styles.weekOf}>/{L.spec.weeks}</Text></Animated.Text>
            </View>
          </View>
          <Animated.View style={[styles.deliver, dlPopStyle]}>
            <View style={styles.deliverTop}>
              <Image source={art.passenger_pip} style={styles.deliverPip} fadeDuration={0} />
              {/* the count stops at the goal; riders beyond it show as a bonus, never "21 / 19" (render_defects 2026-11-06) */}
              <AnimatedNumber value={Math.min(dlShown, L.goal)} duration={quick ? 1 : busy ? 140 : 500} style={styles.deliverValue} />
              <Text style={[styles.deliverValue, styles.deliverGoal]} numberOfLines={1} adjustsFontSizeToFit> / {L.goal} riders</Text>
              {dlShown >= L.goal ? (
                <View style={styles.bonus}>
                  <Text style={styles.bonusText} numberOfLines={1}>{dlShown > L.goal ? `✓ +${dlShown - L.goal}` : "✓"}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.max(3, goalPct * 100)}%` }]} />
              <View style={[styles.barForecast, { left: `${Math.min(100, (projected / L.goal) * 100) - 1}%` }]} />
            </View>
            {gain && !result ? <RiderGain key={gain.n} text={gain.text} calm={calm} /> : null}
          </Animated.View>
          <RoundButton icon="gear" label="Settings" onPress={onSettings} size={44} tint={palette.secondaryDark} />
        </View>
        {header ?? (
          <Text style={styles.objective} numberOfLines={2}>
            <Text style={styles.objectiveCity}>{cityName(L.index)} {levelInCity(L.index)} · </Text>
            {objectiveText(L)} · ★★★ {star3Of(L)}
          </Text>
        )}
      </View>

      {/* ── board ── */}
      <Animated.View style={[styles.boardArea, introStyle]}>
        <View
          ref={boardRef}
          collapsable={false}
          style={StyleSheet.absoluteFill}
          onLayout={(e) => { setArea({ w: Math.floor(e.nativeEvent.layout.width), h: Math.floor(e.nativeEvent.layout.height) }); setTimeout(measureBoard, 60); }}
          onStartShouldSetResponder={() => !result && !cardVisible}
          onMoveShouldSetResponder={() => false}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => { measureBoard(); onGrant(e); }}
          onResponderMove={onMove}
          onResponderRelease={onRelease}
          onResponderTerminate={() => onRelease()}
        >
          {geo ? (
            <>
              <MapCanvas L={L} s={s} geo={geo} segs={segs} handles={handles} fc={fc} focus={focusInfo} patterns={!!player.patterns} prev={busy ? runFrom : null} run={runT} />
              <LastCallGlows L={L} s={s} geo={geo} calm={calm} />
              {flash ? <SegFlash key={flash.n} p1={flash.p1} p2={flash.p2} color={flash.color} w={geo.lw} calm={calm} /> : null}
              {hand?.to && !result && !drag ? (
                <TutorialTrail key={`t${hand.n}`} from={{ x: hand.from.x - boardWin.current.x, y: hand.from.y - boardWin.current.y }} to={{ x: hand.to.x - boardWin.current.x, y: hand.to.y - boardWin.current.y }} clear={geo.sr * 0.45} fromKnob={hand.knob} />
              ) : null}
              <Trains s={s} segs={segs} geo={geo} run={runT} laps={laps} />
              <MapLabels L={L} s={s} geo={geo} fc={fc} />
              {busy && !calm ? <Arrivals key={runN} L={L} s={s} geo={geo} dur={runDur(laps, quick, calm)} /> : null}
              {drag?.kind === "draw" && drag.line !== -2 && drag.moved ? <SnapTarget L={L} geo={geo} cur={drag.cur} finger={drag.finger} color={LINE_COLORS[(drag.line >= 0 ? drag.line : s.ln.length) % LINE_COLORS.length]} /> : null}
              {drag?.kind === "draw" && drag.line !== -2 && drag.moved ? <DraftLine from={drag.from} to={drag.finger} color={LINE_COLORS[(drag.line >= 0 ? drag.line : s.ln.length) % LINE_COLORS.length]} w={geo.lw} /> : null}
              {tag && !result ? <TagPill key={`g${tag.n}`} text={tag.text} x={tag.x} y={tag.y} color={tag.color} duration={calm ? 1100 : 1900} /> : null}
            </>
          ) : null}
        </View>
        {/* planning = time frozen: a soft lavender frame and a chip */}
        {!busy && !result && fc ? (
          <View pointerEvents="none" style={[styles.fcChip, fcWarn ? styles.fcWarn : null]}>
            <Text style={styles.fcText} numberOfLines={1}>Forecast {fcText}</Text>
          </View>
        ) : null}
        {!busy && !result ? (
          <View pointerEvents="none" style={styles.frozenChip}>
            <Text style={styles.frozenText}>❚❚ Planning · time frozen</Text>
          </View>
        ) : busy ? (
          <View pointerEvents="none" style={[styles.frozenChip, { backgroundColor: "rgba(95,179,166,0.92)" }]}>
            <Text style={[styles.frozenText, { color: "#FFFDF6" }]}>▶ Trains running…</Text>
          </View>
        ) : null}
        {lastCall >= 0 && !result && !busy ? (
          <View style={styles.lastCall}>
            <Text style={styles.lastCallText} numberOfLines={2}>
              Last Call at {GLYPH_LABEL[L.stations[lastCall].glyph]}: give it seats this week
            </Text>
            <Tappable onPress={takeBreather} scaleTo={0.88} style={styles.lastCallBtn} accessibilityLabel="Use a Breather">
              <Icon name="cloud" size={20} />
              <Text style={styles.lastCallBtnText}>{player.breathers ?? 0}</Text>
            </Tappable>
          </View>
        ) : null}
        {hint && !result && !busy ? (
          <View pointerEvents="none" style={[styles.hintBanner, geo && hand && hand.from.y - boardWin.current.y > area.h - 80 ? { bottom: undefined, top: 34 } : null]}>
            <Icon name="bulb" size={20} tint={palette.accentDark} />
            <Text style={styles.hintText}>{coachText(hint)}</Text>
          </View>
        ) : null}
        {focusSt && !result ? (
          <StationCard L={L} s={s} st={focus} atBottom={!!geo && cardAtBottom(geo, L, focus, area.h)} fcFull={fc?.fullWeek[focus] ?? 0} lines={focusInfo.lines} onClose={() => setFocus(-1)} />
        ) : null}
      </Animated.View>

      {/* coach slot (in the layout flow, so it never covers a station; fixed height so tutorial steps don't move the
          board): resume › tutorial › tip */}
      {resumed && !result ? (
        <View style={styles.coachSlot}>
          <CoachCard text={`Welcome back! Your plan is saved at week ${s.wk + 1}.`} action="Continue" onAction={() => setResumed(false)} secondary="Restart" onSecondary={() => { setResumed(false); resetTo(startState(L), "restart"); }} />
        </View>
      ) : (tutorial || tip || (s.cd && cardHidden)) && !result && busy ? (
        // while the trains run the coach steps aside to a small chip (same slot height: the board never moves) so the
        // map is free to watch (game_feel 2026-11-06: the banner blocked the map during the run)
        <View style={styles.coachSlot} pointerEvents="none">
          <View style={styles.busyChip}>
            <Image source={art.hero_pip_cat} style={styles.busyPip} fadeDuration={0} />
            <Text style={styles.busyText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Trains are rolling: watch the riders</Text>
          </View>
        </View>
      ) : s.cd && !result && !resumed ? (
        // a weekly card is waiting (hidden with "View map first", or the week has just ended): say so plainly
        <View style={styles.coachSlot}>
          <CoachCard title="Pick a card" text={`A gift for week ${s.wk + 1} is waiting: pick one card for your network.`} action="Pick a card" onAction={() => { setResumed(false); setCardHidden(false); }} />
        </View>
      ) : tutorial && !result ? (
        <View style={styles.coachSlot}>
          <CoachCard
            title={praise ?? (levelNumber === 1 ? "Welcome to Willowmere!" : "Change here")}
            text={coachLine}
            secondary="Skip tutorial"
            onSecondary={skipTutorial}
            secondaryLink={levelNumber > 1}
          />
        </View>
      ) : tip && !result ? (
        <View style={styles.coachSlot}>
          <CoachCard title={tip.title} text={tip.body} action="Got it" onAction={dismissTip} />
        </View>
      ) : null}

      {/* ── tray ── */}
      <Animated.View style={[styles.tray, { paddingBottom: bottomInset + 8 }, trayShake.style]}>
        <View style={styles.trayRow}>
          <ResourceChip icon="track" value={s.tr} label="Tracks left this week" color="#B98552" />
          <ResourceChip icon="line" value={s.fl} label="Free lines" color={LINE_COLORS[s.ln.length % LINE_COLORS.length]} />
          {hasRiver ? <ResourceChip icon="tunnel" value={s.tu} label="Tunnels" color="#4F9FD0" /> : null}
          {showCars ? <ResourceChip ref={carRef} icon="carriage" value={s.ca} label="Carriages (drag onto a line)" color={palette.accent} drag={chipDrag("car")} active={hint?.kind === "car"} /> : null}
          {showHubs ? <ResourceChip ref={hubRef} icon="hub" value={s.ix} label="Interchanges (drag onto a station)" color={palette.secondaryDark} drag={chipDrag("hub")} active={hint?.kind === "hub"} /> : null}
          <View style={{ flex: 1 }} />
          {/* Heatmap Replay in the game too, once a week has run (when the tray has room for it) */}
          {runs.length > 0 && !result && [hasRiver, showCars, showHubs].filter(Boolean).length <= (width >= 400 ? 1 : 0) ? (
            <RoundButton icon="calendar" label="Heatmap Replay" onPress={() => setHeat(true)} size={42} tint={palette.primary} />
          ) : null}
          <RoundButton icon="bulb" label="Hint" onPress={takeHint} count={player.hints ?? 0} size={42} tint={palette.gold} />
          <RoundButton icon="cloud" label="Breather" onPress={takeBreather} count={player.breathers ?? 0} size={42} tint={palette.secondary} />
        </View>
        <View style={styles.trayRow}>
          <RoundButton icon="undo" label="Undo" onPress={undo} disabled={!undoStack.length || busy} size={46} />
          <RoundButton icon="redo" label="Redo" onPress={redo} disabled={!redoStack.length || busy} size={46} />
          <RoundButton icon="restart" label="Restart level" onPress={() => resetTo(startState(L), "restart")} tint={palette.secondaryDark} size={46} />
          <View ref={runRef} collapsable={false} style={{ flex: 1 }}>
            <RunButton onPress={runWeek} busy={busy} card={!!s.cd} week={Math.min(s.wk + 1, L.spec.weeks)} pulse={!!coachAction && coachAction.kind === "run"} />
          </View>
        </View>
      </Animated.View>

      {/* ── fx ── */}
      {burst && !result ? <Burst key={burst.n} x={boardWin.current.x + burst.x} y={boardWin.current.y + burst.y} color={burst.color} /> : null}
      {celebrate && !calm ? <Confetti trigger={celebrate} count={70} origin={{ x: width / 2, y: boardWin.current.y + area.h / 2 }} /> : null}
      {celebrate && geo && !result ? <Cheer geo={geo} L={L} board={boardWin.current} n={celebrate} /> : null}
      {celebrate && s.over === 1 && !result ? <WinRibbon key={celebrate} top={boardWin.current.y + area.h * 0.42} riders={s.dl} calm={calm} /> : null}
      {depart && !calm ? <Departure key={`d${depart.n}`} x={depart.x} y={depart.y} /> : null}
      {busy && !calm && runFrom ? <WeekSweep key={`w${runN}`} top={boardWin.current.y + 40} from={runFrom.wk + 1} to={Math.min(s.over ? s.wk : s.wk + 1, L.spec.weeks)} /> : null}
      {winFlash ? <ScreenFlash key={`f${winFlash}`} /> : null}
      {press && geo && !result ? <PressPop key={press.n} x={boardWin.current.x + press.x} y={boardWin.current.y + press.y} r={press.r} color={press.color} /> : null}
      {hand && !result && !busy && !drag ? <TutorialHand key={hand.n} from={hand.from} to={hand.to} clear={geo?.sr ?? 0} avoid={hand.avoid} /> : null}
      {drag?.kind === "chip" ? (
        <View pointerEvents="none" style={[styles.ghost, { left: drag.finger.x - 26, top: drag.finger.y - 44 }]}>
          <Icon name={drag.what === "car" ? "carriage" : "hub"} size={30} />
        </View>
      ) : null}
      {toast && !result ? (
        <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + 118 }]}>
          <Toast key={toast.n} text={toast.text} warn={toast.warn} />
        </View>
      ) : null}

      {/* ── weekly card ── */}
      <Popup visible={cardVisible} title={`Week ${s.wk + 1} card`} onClose={() => setCardHidden(true)}>
        <Text style={styles.cardSub}>Pick one gift for your network</Text>
        <View style={styles.cardRow}>
          {cards.map((k, i) => (
            <View key={i} ref={(r) => { cardRefs.current[i] = r; }} collapsable={false} style={{ flex: 1 }}>
              <Tappable onPress={() => pickCard(i)} scaleTo={0.93} sound="pop" style={[styles.card, hint?.kind === "card" && hint.i === i && styles.cardHint]}>
                <View style={[styles.cardIcon, { backgroundColor: k === "calm" ? palette.secondary : k === "hub" ? palette.secondaryDark : k === "tunnel" ? "#4F9FD0" : palette.primary }]}>
                  <Icon name={CARD_ICON[k]} size={34} />
                </View>
                <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit>{CARD_TITLE[k]}</Text>
                <Text style={styles.cardBody}>{CARD_BODY[k]}</Text>
                <View style={styles.cardFcSlot}>
                  {cardFc && cardFc.wk === s.wk ? (
                    <View style={[styles.cardFc, cardFc.ok[i] ? styles.cardFcOk : styles.cardFcWarn]}>
                      <Text style={[styles.cardFcText, !cardFc.ok[i] && { color: "#6A3A08" }]} numberOfLines={2}>
                        {cardFc.ok[i] ? "Forecast: goal in reach" : "Forecast: falls short"}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Tappable>
            </View>
          ))}
        </View>
        <GameButton style={{ marginTop: 14 }} size="sm" variant="light" label="View map first" onPress={() => setCardHidden(true)} />
      </Popup>
      {s.cd && cardHidden && !result ? (
        <View style={[styles.cardBack, { top: insets.top + 118 }]}>
          <GameButton size="sm" variant="accent" label="Pick a card" onPress={() => setCardHidden(false)} />
        </View>
      ) : null}

      {/* ── win ── */}
      <WinPopup
        visible={result === "win" && (campaign || !!demo)}
        stars={finalStars || (demo?.win ? 3 : 0)}
        coins={rewardFor(L.index, finalStars || 3)}
        nextLabel={levelNumber >= LEVELS.length ? "Home" : "Next Level"}
        onNext={() => {
          ads.showInterstitial();
          if (levelNumber >= LEVELS.length) onExit();
          else onNextLevel(levelNumber + 1);
        }}
        onReplay={() => resetTo(startState(L), "restart")}
        onMap={onExit}
      >
        <View style={styles.winStats}>
          <View style={styles.winStat}>
            <Image source={art.passenger_pip} style={{ width: 18, height: 28 }} fadeDuration={0} />
            {/* fixed-width slot: the row never shifts while the number counts up */}
            <View style={{ width: String(s.dl).length * 10 + 4, alignItems: "flex-end" }}>
              <AnimatedNumber from={0} value={s.dl} duration={quick ? 1 : 1600} style={styles.winStatText} />
            </View>
            <Text style={styles.winStatText}>riders delivered</Text>
          </View>
          {s.dl > L.goal ? <Text style={styles.winBonus}>Goal {L.goal} reached · +{s.dl - L.goal} bonus riders</Text> : null}
          <Text style={[styles.winStar3, star3Met(L, s) || demo?.win ? null : { color: palette.inkSoft }]}>
            {star3Met(L, s) || demo?.win ? "★ " : "☆ "}{star3Of(L)}
          </Text>
          <GameButton style={{ marginTop: 6 }} size="sm" variant="light" label="Heatmap replay" icon={<Icon name="calendar" size={18} tint={palette.primaryDark} />} onPress={() => setHeat(true)} />
        </View>
      </WinPopup>

      {/* ── soft fail ── */}
      <Popup visible={result === "fail" && mode !== "duel"} title={failTitle(L, s)}>
        <Image source={art.hero_pip_cat} style={styles.failPip} fadeDuration={0} />
        <Text style={styles.failMsg}>{failText(L, s)}</Text>
        {weekStarts.length > 1 ? (
          <GameButton label={`Retry from week ${weekStarts[weekStarts.length - 1].wk + 1}`} variant="primary" size="lg" onPress={() => resetTo(weekStarts[weekStarts.length - 1], "week")} />
        ) : null}
        {weekStarts.length > 1 ? (
          <GameButton
            style={{ marginTop: 10 }}
            label="Breather + retry (watch ad)"
            variant="secondary"
            onPress={() => ads.showRewarded(() => { const w = weekStarts[weekStarts.length - 1]; resetTo({ ...w, q: w.q.map((v) => Math.floor(v / 2)) }, "week"); })}
          />
        ) : null}
        <GameButton style={{ marginTop: 10 }} label="Restart level" variant={weekStarts.length > 1 ? "light" : "primary"} size={weekStarts.length > 1 ? "md" : "lg"} onPress={() => resetTo(startState(L), "restart")} />
        <GameButton style={{ marginTop: 10 }} size="sm" variant="light" label="Heatmap replay: where it strained" onPress={() => setHeat(true)} />
        <GameButton style={{ marginTop: 10 }} size="sm" variant="light" label={campaign ? "Back to map" : "Leave"} onPress={onExit} />
      </Popup>

      {/* ── heatmap replay (after a win or a soft fail): week scrubber, station strain, one tip ── */}
      <HeatmapReplay visible={heat} L={L} runs={runs} onClose={() => setHeat(false)} />
    </View>
  );
}

/** The station card goes to the board edge that hides fewer stations (and never over the tapped one). */
function cardAtBottom(geo: Geo, L: Level, st: number, h: number): boolean {
  const CARD = 170;
  const ys = L.stations.map((_, i) => stationPt(geo, L, i).y);
  const top = ys.filter((y) => y < 28 + CARD + geo.sr).length;
  const bottom = ys.filter((y) => y > h - 8 - CARD - geo.sr).length;
  const self = ys[st];
  if (self < 28 + CARD + geo.sr) return true;
  if (self > h - 8 - CARD - geo.sr) return false;
  return bottom < top;
}

function failTitle(L: Level, s: State): string {
  const full = L.stations.findIndex((st, i) => s.sk[i] > 0 && stage(stationLoad(L, s, i), stationCap(L, s, i)) === 3);
  return full >= 0 ? "The line got crowded" : "Almost there";
}
function failText(L: Level, s: State): string {
  const full = L.stations.findIndex((st, i) => s.sk[i] > 0 && stage(stationLoad(L, s, i), stationCap(L, s, i)) === 3);
  if (full >= 0) {
    const st = L.stations[full];
    return st.heritage
      ? `The heritage ${GLYPH_LABEL[st.glyph]} station filled up. Retry the week and keep its ring calm.`
      : `The ${GLYPH_LABEL[st.glyph]} station stayed full through its Last Call. Retry the week with a new plan: shorter lines run more often.`;
  }
  return `You delivered ${s.dl} of ${L.goal} riders by week ${L.spec.weeks}. Try a plan that carries a few more.`;
}

/** The demand card of a tapped station: what its riders want, its queue, its forecast and the lines they ride. */
function StationCard({ L, s, st, fcFull, lines, onClose, atBottom }: { L: Level; s: State; st: number; fcFull: number; lines: number; onClose: () => void; atBottom: boolean }) {
  const station = L.stations[st];
  const groups = L.groups.map((g, i) => ({ g, i })).filter(({ g }) => g.s === st);
  const net = netInfo(L, s);
  const q = stationLoad(L, s, st), cap = stationCap(L, s, st);
  const sg = stage(q, cap);
  const open = station.opens <= s.wk + 1;
  const lineIds = s.ln.map((_, l) => l).filter((l) => (lines >> l) & 1);
  const s0 = useSharedValue(0);
  useEffect(() => { s0.value = withSpring(1, springs.pop); }, [s0, st]);
  const anim = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * s0.value, transform: [{ scale: 0.92 + 0.08 * s0.value }] }));
  return (
    <Animated.View style={[styles.stCard, atBottom ? { bottom: 8 } : { top: 28 }, anim]}>
      <View style={styles.stHead}>
        <Image source={GLYPH_IMG[station.glyph]} style={{ width: 40, height: 40 }} fadeDuration={0} />
        <View style={{ flex: 1 }}>
          <Text style={styles.stTitle}>{GLYPH_LABEL[station.glyph]} station{station.heritage ? " · heritage" : station.hub || (s.hb >> st) & 1 ? " · interchange" : ""}</Text>
          <Text style={styles.stLine}>
            {!open ? `Opens in week ${station.opens}` : `${q} of ${cap} waiting · ${["calm", "yellow ring", "amber ring", "Last Call"][sg]}`}
          </Text>
        </View>
        <Tappable onPress={onClose} scaleTo={0.85} style={styles.stClose} accessibilityLabel="Close">
          <Icon name="close" size={18} tint={palette.inkSoft} />
        </Tappable>
      </View>
      {groups.length ? (
        <View style={styles.stRows}>
          {groups.map(({ g, i }) => (
            <View key={i} style={styles.stRow}>
              <Image source={GLYPH_IMG[g.g]} style={{ width: 22, height: 22 }} fadeDuration={0} />
              <Text style={styles.stRowText}>
                {L.spawn[Math.min(s.wk, L.spawn.length - 1)][i]} a week want {GLYPH_LABEL[g.g]}
                {s.q[i] ? ` · ${s.q[i]} waiting` : ""}
                {net.route[i] > 0 ? "" : " · no route yet"}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.stRowText}>A destination: sends nobody (0 riders a week).</Text>
      )}
      {groups.length ? (
        <View style={styles.stRoute}>
          {lineIds.length ? (
            <>
              <Text style={styles.stRowText}>Riders ride:</Text>
              {lineIds.map((l) => <View key={l} style={[styles.stDot, { backgroundColor: LINE_COLORS[l % LINE_COLORS.length] }]}><Text style={styles.stDotText}>{l + 1}</Text></View>)}
            </>
          ) : <Text style={styles.stRowText}>Not connected yet: draw a line to its glyphs.</Text>}
          {fcFull ? <Text style={[styles.stRowText, { color: palette.accentDark }]}>  · full by week {fcFull}</Text> : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

function RunButton({ onPress, busy, card, week, pulse }: { onPress: () => void; busy: boolean; card: boolean; week: number; pulse: boolean }) {
  const b = useSharedValue(1);
  useEffect(() => {
    if (pulse) b.value = withSequence(withTiming(1.06, { duration: 380 }), withTiming(1, { duration: 380 }), withTiming(1.06, { duration: 380 }), withTiming(1, { duration: 380 }));
  }, [pulse, b]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: b.value }] }));
  return (
    <Animated.View style={st}>
      <GameButton
        label={busy ? "Running…" : card ? "Pick card" : `Run week ${week}`}
        icon={<Icon name="play" size={24} />}
        variant="accent"
        onPress={onPress}
        disabled={busy}
        sound="whoosh"
      />
    </Animated.View>
  );
}

/**
 * While drawing: the neighbouring station the finger is heading for (joined to the current one by a rail, within
 * reach) shows a snap ring in the line's colour, so the player sees where the line will land before it connects.
 */
function SnapTarget({ L, geo, cur, finger, color }: { L: Level; geo: Geo; cur: number; finger: Pt; color: string }) {
  const n = L.stations.length;
  let best = -1, bd = geo.cell * 0.75;
  L.stations.forEach((_, i) => {
    if (i === cur || L.cor[cur * n + i] < 0) return;
    const q = stationPt(geo, L, i);
    const d = Math.hypot(q.x - finger.x, q.y - finger.y);
    if (d < bd) { bd = d; best = i; }
  });
  if (best < 0) return null;
  const q = stationPt(geo, L, best);
  const R = geo.sr * 1.25;
  return <View pointerEvents="none" style={{ position: "absolute", left: q.x - R, top: q.y - R, width: R * 2, height: R * 2, borderRadius: R, borderWidth: 4, borderStyle: "dashed", borderColor: color }} />;
}

/** The line being drawn under the finger: solid in the line's colour with a white rim, a dot under the fingertip. */
function DraftLine({ from, to, color, w }: { from: Pt; to: Pt; color: string; w: number }) {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const W = w + 4;
  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: "absolute", left: (from.x + to.x) / 2 - len / 2, top: (from.y + to.y) / 2 - W / 2, width: len, height: W, borderRadius: W / 2,
          backgroundColor: color, borderWidth: 2, borderColor: "#FFFFFF", transform: [{ rotate: `${ang}rad` }],
        }}
      />
      <View pointerEvents="none" style={{ position: "absolute", left: to.x - W * 1.3, top: to.y - W * 1.3, width: W * 2.6, height: W * 2.6, borderRadius: W * 1.3, backgroundColor: color, borderWidth: 3, borderColor: "#FFFFFF" }} />
    </>
  );
}

/**
 * A connection lands: the segment snaps in with an elastic bounce — it fills from its start in the solid line colour,
 * swells past its width and settles (overshoot spring) — then fades into the drawn line (~1 s). Opaque, no white haze
 * (render_defects 2026-11-06: the old translucent glow muddled the line and the tag over it).
 */
function SegFlash({ p1, p2, color, w, calm }: { p1: Pt; p2: Pt; color: string; w: number; calm: boolean }) {
  const t = useSharedValue(0);
  const b = useSharedValue(calm ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(1, { duration: calm ? 300 : 1000, easing: Easing.linear });
    if (!calm) b.value = withSpring(1, { damping: 5, stiffness: 240, mass: 0.6 });
  }, [t, b, calm]);
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const W = w + 6;
  const fill = useAnimatedStyle(() => ({
    width: len * Math.min(1, t.value / 0.18),
    opacity: t.value < 0.7 ? 1 : 1 - (t.value - 0.7) / 0.3,
    transform: [{ scaleY: 0.5 + 0.5 * b.value }],
  }));
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: p1.x, top: p1.y - W / 2, width: len, height: W, transformOrigin: "0% 50%", transform: [{ rotate: `${ang}rad` }] }}>
      <Animated.View style={[{ height: W, borderRadius: W / 2, backgroundColor: color, borderWidth: 2.5, borderColor: "#FFFFFF" }, fill]} />
    </View>
  );
}

/** "+N riders" lands in the rider pill: a gold badge on its progress bar's end (below the count, above nothing) pops in, lifts a little and fades (~1.8 s). */
function RiderGain({ text, calm }: { text: string; calm: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(1, { duration: calm ? 1200 : 1800, easing: Easing.linear }); }, [t, calm]);
  const st = useAnimatedStyle(() => {
    const k = t.value;
    const pop = calm ? 1 : k < 0.1 ? 0.4 + k * 8 : k < 0.18 ? 1.2 - (k - 0.1) * 2.5 : 1;
    return { opacity: k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25, transform: [{ translateY: calm ? 0 : -4 * k }, { scale: pop }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.gain, st]}>
      <Image source={art.passenger_pip} style={{ width: 10, height: 15 }} fadeDuration={0} />
      <Text style={styles.gainText} numberOfLines={1}>{text}</Text>
    </Animated.View>
  );
}

/**
 * While a week runs: every station a line serves chimes in turn — a soft ring + sparks where trains stop, so the
 * network visibly "flows" (plain views, mounted only while the week runs; no endless animation on the board).
 */
function Arrivals({ L, s, geo, dur }: { L: Level; s: State; geo: Geo; dur: number }) {
  // served stations chime; any station whose ring is rising pulses in its ring colour (yellow → amber → red), so
  // the tension is visible while the week runs, not only after it
  const list = useMemo(
    () => L.stations.map((st, i) => ({ i, sg: st.opens <= s.wk + 1 ? stage(stationLoad(L, s, i), stationCap(L, s, i)) : 0, on: s.ln.some((ln) => ln.s.includes(st.ch)) }))
      .filter((x) => x.on || x.sg >= 1),
    [L, s],
  );
  const [k, setK] = useState(0);
  useEffect(() => {
    const step = Math.max(60, (dur * 0.8) / Math.max(1, list.length));
    const ids = list.map((_, j) => setTimeout(() => {
      setK(j + 1);
      if (j % 2 === 0) play("pop", 0.35);
    }, 120 + step * j));
    return () => ids.forEach(clearTimeout);
  }, [list, dur]);
  return (
    <>
      {list.slice(0, k).map(({ i, sg }, j) => {
        const p = stationPt(geo, L, i);
        return (
          <View key={i} pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Burst x={p.x} y={p.y} color={sg >= 1 ? RING_COLORS[sg] : j % 2 ? palette.star : "#FFFFFF"} size={geo.sr * (sg >= 2 ? 4 : 3.2)} count={sg >= 2 ? 9 : 6} />
            <PipHop x={p.x + geo.sr * 0.9} y={p.y - geo.sr * 0.7} />
          </View>
        );
      })}
    </>
  );
}

/** A rider boards / arrives: a little pip hops up beside the station and fades (one hop, ~0.6 s). */
function PipHop({ x, y }: { x: number; y: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) }); }, [t]);
  const st = useAnimatedStyle(() => ({
    opacity: t.value < 0.6 ? 1 : 1 - (t.value - 0.6) / 0.4,
    transform: [{ translateY: -16 * Math.sin(Math.PI * Math.min(1, t.value * 1.3)) }, { scale: 0.6 + 0.5 * Math.min(1, t.value * 3) }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: x - 7, top: y - 11 }, st]}>
      <Image source={art.passenger_pip} style={{ width: 14, height: 22 }} fadeDuration={0} />
    </Animated.View>
  );
}

/** Win: every station pops a sparkle burst, staggered — the board celebrates before the card. */
function Cheer({ geo, L, board, n }: { geo: Geo; L: Level; board: Pt; n: number }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    const ids = L.stations.map((_, i) => setTimeout(() => setK(i + 1), 90 * i));
    return () => ids.forEach(clearTimeout);
  }, [L, n]);
  return (
    <>
      {L.stations.slice(0, k).map((_, i) => {
        const p = stationPt(geo, L, i);
        return <Burst key={`${n}-${i}`} x={board.x + p.x} y={board.y + p.y} color={i % 2 ? palette.star : "#FFFFFF"} size={geo.sr * 4} count={10} />;
      })}
    </>
  );
}

/** Touch-down feedback on a station / knob: a squash ring that bounces 0.86 → 1.08 → 1 with a glow, within one frame. */
function PressPop({ x, y, r, color = "#FFFFFF" }: { x: number; y: number; r: number; color?: string }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }); }, [t]);
  const ring = useAnimatedStyle(() => {
    const k = t.value;
    const sc = k < 0.18 ? 0.86 + (k / 0.18) * 0.22 : 1.08 - Math.min(1, (k - 0.18) / 0.3) * 0.08;
    return { opacity: k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5, transform: [{ scale: sc }] };
  });
  const glow = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - t.value), transform: [{ scale: 1 + 0.7 * t.value }] }));
  // a ripple ring rolling outward from the station (the "snap" landing)
  const ripple = useAnimatedStyle(() => ({ opacity: t.value < 0.1 ? 0 : 0.9 * (1 - t.value), transform: [{ scale: 1 + 0.75 * t.value }] }));
  const R = r * 1.3;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: x - R * 1.8, top: y - R * 1.8, width: R * 3.6, height: R * 3.6, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ position: "absolute", width: R * 2, height: R * 2, borderRadius: R, borderWidth: R * 0.32, borderColor: color === "#FFFFFF" ? "rgba(255,241,168,0.8)" : color }, glow]} />
      <Animated.View style={[{ position: "absolute", width: R * 2, height: R * 2, borderRadius: R, borderWidth: 3, borderColor: color === "#FFFFFF" ? palette.gold : color }, ripple]} />
      <Animated.View style={[{ width: R * 2, height: R * 2, borderRadius: R, borderWidth: 4, borderColor: "#FFFFFF" }, ring]} />
    </View>
  );
}

/** The board's own win moment, before the card: a ribbon springs in over the map with the riders counting up. */
function WinRibbon({ top, riders, calm }: { top: number; riders: number; calm: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = calm ? withTiming(1, { duration: 200 }) : withSpring(1, springs.pop); }, [t, calm]);
  const st = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value * 2), transform: [{ scale: 0.5 + 0.5 * t.value }, { rotate: `${(1 - t.value) * -6}deg` }] }));
  return (
    <View pointerEvents="none" style={[styles.ribbonWrap, { top: top - 34 }]}>
      <Animated.View style={[styles.ribbon, st]}>
        <Text style={styles.ribbonTitle}>All aboard!</Text>
        <View style={styles.ribbonRow}>
          <Image source={art.passenger_pip} style={{ width: 16, height: 24 }} fadeDuration={0} />
          <AnimatedNumber from={0} value={riders} duration={900} style={styles.ribbonText} />
          <Text style={styles.ribbonText}>riders home</Text>
        </View>
      </Animated.View>
    </View>
  );
}

/** One run's length: a time-lapse long enough to watch the trains travel and the counter tick rider by rider. */
function runDur(weeks: number, quick: boolean, calm: boolean): number {
  return quick ? 220 : calm ? 500 : Math.min(3600, 1900 + weeks * 600);
}

/** Trains depart: a burst and a puff of steam-dots rising off the Run button, with a "Departing!" pill (~0.8 s). */
function Departure({ x, y }: { x: number; y: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(1, { duration: 820, easing: Easing.out(Easing.cubic) }); }, [t]);
  const pill = useAnimatedStyle(() => ({ opacity: t.value < 0.7 ? Math.min(1, t.value * 6) : 1 - (t.value - 0.7) / 0.3, transform: [{ translateY: -46 * t.value }, { scale: t.value < 0.15 ? 0.6 + t.value * 3 : 1.05 - 0.05 * t.value }] }));
  const ring = useAnimatedStyle(() => ({ opacity: 0.8 * (1 - t.value), transform: [{ scaleX: 1 + 0.5 * t.value }, { scaleY: 1 + 1.4 * t.value }] }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.departRing, { left: x - 90, top: y - 30 }, ring]} />
      <Burst x={x} y={y} color={palette.gold} count={12} size={150} />
      <Animated.View pointerEvents="none" style={[styles.departPill, { left: x - 60, top: y - 50 }, pill]}>
        <Text style={styles.departText}>Departing!</Text>
      </Animated.View>
    </>
  );
}

/** The week time-lapse: a banner sweeps across the top of the map, "Week 1 → 3", while the trains run (one pass). */
function WeekSweep({ top, from, to }: { top: number; from: number; to: number }) {
  const { width } = useWindowDimensions();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withSequence(withTiming(0.5, { duration: 380, easing: Easing.out(Easing.back(1.4)) }), withTiming(0.5, { duration: 900 }), withTiming(1, { duration: 380, easing: Easing.in(Easing.cubic) }));
  }, [t]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: (t.value - 0.5) * 2 * width }] }));
  return (
    <View pointerEvents="none" style={[styles.sweepWrap, { top }]}>
      <Animated.View style={[styles.sweep, st]}>
        <Icon name="calendar" size={20} tint="#FFFDF6" />
        <Text style={styles.sweepText}>{to > from ? `Week ${from} → ${to}` : `Week ${from}`}</Text>
        <Text style={styles.sweepSub}>trains running</Text>
      </Animated.View>
    </View>
  );
}

/** The goal is reached: a quick white flash over the screen (one shot, ~0.45 s). */
function ScreenFlash() {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) }); }, [t]);
  const st = useAnimatedStyle(() => ({ opacity: 0.7 * (1 - t.value) }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFDF0" }, st]} />;
}

function Toast({ text, warn }: { text: string; warn?: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withSpring(1, springs.pop); }, [t]);
  const st = useAnimatedStyle(() => ({ opacity: 0.3 + 0.7 * t.value, transform: [{ translateY: (1 - t.value) * -10 }] }));
  return (
    <Animated.View style={[styles.toast, warn && styles.toastWarn, st]}>
      <Text style={[styles.toastText, warn && { color: "#6A3A08" }]}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bgBottom },
  bg: { position: "absolute", left: 0, top: 0 },
  hud: { paddingHorizontal: 10, gap: 6 },
  hudRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  weekTab: {
    flexDirection: "row", alignItems: "center", gap: 5, height: 50, paddingHorizontal: 9, borderRadius: 16, backgroundColor: "rgba(255,249,238,0.95)",
    borderWidth: 2, borderColor: "#FFFFFF", ...shadow, shadowOpacity: 0.14, elevation: 4,
  },
  weekLabel: { fontFamily: fonts.body, fontSize: 10, letterSpacing: 1, color: palette.inkSoft },
  weekValue: { fontFamily: fonts.display, fontSize: 20, color: palette.ink, marginTop: -3 },
  weekOf: { fontSize: 14, color: palette.inkSoft },
  deliver: {
    flex: 1, height: 50, justifyContent: "center", paddingHorizontal: 9, borderRadius: 16, backgroundColor: "rgba(255,249,238,0.95)",
    borderWidth: 2, borderColor: "#FFFFFF", ...shadow, shadowOpacity: 0.14, elevation: 4,
  },
  deliverTop: { flexDirection: "row", alignItems: "center", gap: 4 },
  deliverPip: { width: 15, height: 23 },
  deliverValue: { fontFamily: fonts.display, fontSize: 19, color: palette.ink, flexShrink: 1, minWidth: 0 },
  deliverGoal: { fontSize: 14, color: palette.inkSoft },
  gain: {
    position: "absolute", right: 6, bottom: -5, height: 20, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, borderRadius: 11,
    backgroundColor: palette.gold, borderWidth: 2, borderColor: "#FFFFFF", ...shadow, shadowOpacity: 0.2, shadowRadius: 3, elevation: 6,
  },
  gainText: { fontFamily: fonts.display, fontSize: 12.5, color: "#5A3A00" },
  bonus: { paddingHorizontal: 6, height: 20, borderRadius: 10, justifyContent: "center", backgroundColor: palette.gold },
  bonusText: { fontFamily: fonts.display, fontSize: 12, color: "#5A3A00" },
  fcChip: { position: "absolute", right: 10, top: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: "rgba(255,249,238,0.95)", borderWidth: 1.5, borderColor: palette.primary },
  fcWarn: { backgroundColor: "#FFE9CC", borderColor: palette.ringAmber },
  fcText: { fontFamily: fonts.body, fontSize: 11, color: palette.ink },
  bar: { height: 7, borderRadius: 4, backgroundColor: palette.surfaceAlt, marginTop: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4, backgroundColor: palette.primary },
  barForecast: { position: "absolute", top: 0, bottom: 0, width: 3, borderRadius: 2, backgroundColor: palette.accent },
  objective: { fontFamily: fonts.bodyRegular, fontSize: 12.5, color: palette.ink, textAlign: "center", paddingHorizontal: 8 },
  objectiveCity: { fontFamily: fonts.body },
  boardArea: { flex: 1, marginHorizontal: 4 },
  frozenChip: { position: "absolute", left: 10, top: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: "rgba(184,165,217,0.9)" },
  frozenText: { fontFamily: fonts.body, fontSize: 11, color: "#3D2F66" },
  coachSlot: { paddingHorizontal: 8, paddingBottom: 8, minHeight: 92, justifyContent: "flex-end" },
  busyChip: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingLeft: 4, paddingRight: 12, borderRadius: 17,
    backgroundColor: "rgba(255,249,238,0.95)", borderWidth: 2, borderColor: "#FFFFFF", ...shadow, shadowOpacity: 0.14, elevation: 3,
  },
  busyPip: { width: 28, height: 30 },
  busyText: { fontFamily: fonts.body, fontSize: 13, color: palette.ink },
  lastCall: {
    position: "absolute", left: 8, right: 8, top: 0, minHeight: 34, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 12, paddingRight: 4, paddingVertical: 3,
    borderRadius: 17, backgroundColor: "#FFE1B3", borderWidth: 2, borderColor: palette.ringAmber, ...shadow, shadowOpacity: 0.15,
  },
  lastCallText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: "#6A3A08" },
  lastCallBtn: { flexDirection: "row", alignItems: "center", gap: 3, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: palette.secondaryDark },
  lastCallBtnText: { fontFamily: fonts.display, fontSize: 14, color: "#FFFDF6" },
  hintBanner: {
    position: "absolute", left: 10, right: 10, bottom: 6, flexDirection: "row", alignItems: "center", gap: 8, padding: 8, paddingHorizontal: 12, borderRadius: 16,
    backgroundColor: "rgba(255,246,214,0.97)", borderWidth: 2, borderColor: palette.gold,
  },
  hintText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, color: palette.ink },
  tray: {
    paddingTop: 8, paddingHorizontal: 10, gap: 8, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: "rgba(255,249,238,0.96)",
    borderTopWidth: 2, borderColor: "#FFFFFF", ...shadow, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.16,
  },
  trayRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ghost: { position: "absolute", width: 52, height: 52, borderRadius: 26, backgroundColor: palette.accent, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#FFF9EE", ...shadow },
  toastWrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  toast: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: "rgba(47,72,88,0.92)", ...shadow, shadowOpacity: 0.2 },
  toastWarn: { backgroundColor: "#FFE3B8", borderWidth: 2, borderColor: palette.ringAmber },
  toastText: { fontFamily: fonts.body, fontSize: 14, color: "#FFF9EE", textAlign: "center" },
  cardSub: { fontFamily: fonts.body, fontSize: 15, color: palette.inkSoft, textAlign: "center", marginTop: -8, marginBottom: 12 },
  cardRow: { flexDirection: "row", gap: 10 },
  card: {
    alignItems: "center", padding: 10, paddingTop: 14, borderRadius: 20, backgroundColor: "#FFFDF6", borderWidth: 2, borderColor: palette.paperEdge, minHeight: 170, gap: 6,
    ...shadow, shadowOpacity: 0.12, elevation: 3,
  },
  cardHint: { borderColor: palette.accent, borderWidth: 3 },
  cardIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#FFF9EE" },
  cardTitle: { fontFamily: fonts.display, fontSize: 17, color: palette.ink },
  cardFcSlot: { minHeight: 40, alignSelf: "stretch", justifyContent: "flex-end" },
  cardFc: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10, borderWidth: 1.5 },
  cardFcOk: { backgroundColor: "#E4F4EC", borderColor: palette.primary },
  cardFcWarn: { backgroundColor: "#FFE9CC", borderColor: palette.ringAmber },
  cardFcText: { fontFamily: fonts.body, fontSize: 12, color: palette.primaryDark, textAlign: "center" },
  cardBody: { fontFamily: fonts.bodyRegular, fontSize: 13, color: palette.inkSoft, textAlign: "center" },
  cardBack: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  winStats: { alignItems: "center", gap: 4, marginTop: 2 },
  winStat: { flexDirection: "row", alignItems: "center", gap: 6 },
  winStatText: { fontFamily: fonts.body, fontSize: 16, color: palette.ink },
  winBonus: { fontFamily: fonts.body, fontSize: 13, color: palette.accentDark },
  winStar3: { fontFamily: fonts.body, fontSize: 14, color: palette.accentDark, textAlign: "center" },
  failPip: { width: 96, height: 104, alignSelf: "center", marginTop: -6 },
  failMsg: { fontFamily: fonts.body, fontSize: 16, color: palette.inkSoft, textAlign: "center", marginVertical: 12 },
  ribbonWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  departRing: { position: "absolute", width: 180, height: 60, borderRadius: 30, borderWidth: 4, borderColor: palette.gold },
  departPill: { position: "absolute", width: 120, alignItems: "center", paddingVertical: 4, borderRadius: 14, backgroundColor: palette.accent, borderWidth: 2, borderColor: "#FFF9EE" },
  departText: { fontFamily: fonts.display, fontSize: 16, color: "#FFFDF6" },
  sweepWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  sweep: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20, backgroundColor: "rgba(95,179,166,0.95)",
    borderWidth: 2.5, borderColor: "#FFF9EE", ...shadow, shadowOpacity: 0.25, elevation: 6,
  },
  sweepText: { fontFamily: fonts.display, fontSize: 20, color: "#FFFDF6" },
  sweepSub: { fontFamily: fonts.body, fontSize: 12, color: "#E9FFF8" },
  ribbon: {
    alignItems: "center", paddingHorizontal: 26, paddingVertical: 10, borderRadius: 24, backgroundColor: palette.accent, borderWidth: 3, borderColor: "#FFF9EE",
    ...shadow, shadowOpacity: 0.3, elevation: 8,
  },
  ribbonTitle: { fontFamily: fonts.display, fontSize: 30, color: "#FFFDF6", textShadowColor: "rgba(120,60,10,0.45)", textShadowRadius: 4, textShadowOffset: { width: 0, height: 2 } },
  ribbonRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  ribbonText: { fontFamily: fonts.display, fontSize: 18, color: "#FFF4DC" },
  stCard: {
    position: "absolute", left: 8, right: 8, padding: 12, borderRadius: 20, backgroundColor: "rgba(255,249,238,0.98)", borderWidth: 2, borderColor: "#FFFFFF",
    ...shadow, shadowOpacity: 0.2, gap: 8,
  },
  stHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  stTitle: { fontFamily: fonts.display, fontSize: 17, color: palette.ink },
  stLine: { fontFamily: fonts.body, fontSize: 13, color: palette.inkSoft },
  stClose: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: palette.surfaceAlt },
  stRows: { gap: 4 },
  stRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stRowText: { fontFamily: fonts.body, fontSize: 13.5, color: palette.ink, flexShrink: 1 },
  stRoute: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  stDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFF9EE" },
  stDotText: { fontFamily: fonts.display, fontSize: 11, color: "#FFFDF6" },
});
