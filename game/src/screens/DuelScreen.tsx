import { useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { AnimatedNumber, Confetti, GameButton, Icon, Popup, Tappable, feedback, fonts, palette, springs } from "../ui";
import { GameScreen } from "./GameScreen";
import { LEVELS } from "../game/levels";
import type { State } from "../game/engine";
import { cityName, objectiveText } from "../game/meta";
import { BOT_NAMES, botWeeks, duelLevel, recordDuel } from "../game/modes";
import { multiplayer, type Emote, type Match } from "../modules/multiplayer";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { art } from "../art";

/** Labels for the fixed emote set (no chat, no typed text). */
export const EMOTE_LABEL: Record<Emote, string> = {
  gg: "Good game", nice: "Nice line!", wow: "Wow!", oops: "Oops", thanks: "Thanks", glhf: "Have fun!", wp: "Well planned", again: "Again?",
};
const EMOTE_ICON: Record<Emote, string> = { gg: "🤝", nice: "👍", wow: "😮", oops: "🙈", thanks: "🙏", glhf: "🍀", wp: "🌟", again: "🔁" };
const QUICK: Emote[] = ["glhf", "nice", "wow", "gg"];

type Progress = { wk: number; dl: number; done: boolean };
const WAIT_RIVAL_MS = 40000;

/**
 * A duel: both players plan the SAME city map (chosen by the host and shared as the room state) side by side; after
 * each week the score — riders delivered — is sent to the rival, and the most riders when both runs end wins.
 * match.bot = nobody was found in time: Pip's AI rival plays the level's proven plan with a skill factor, one week
 * in step with the player. A rival who leaves before the start cancels the duel with no result; one who leaves
 * mid-duel hands the player the win. Fixed emotes only.
 */
export function DuelScreen({ match, onExit, onRematch, onSettings }: { match: Match; onExit: () => void; onRematch: () => void; onSettings: () => void }) {
  const me = store.get();
  const seed = useMemo(() => Date.now() % 100000, []);
  const [level, setLevel] = useState<number | null>(match.bot || match.isHost ? duelLevel(seed, me.level) : null);
  const rivalName = useMemo(() => {
    const other = match.players().find((p) => p.seat !== match.seat);
    return match.bot ? BOT_NAMES[seed % BOT_NAMES.length] : other?.name ?? "Rival";
  }, [match, seed]);
  const myName = match.players().find((p) => p.seat === match.seat)?.name ?? "You";
  const [mine, setMine] = useState<Progress>({ wk: 0, dl: 0, done: false });
  const [rival, setRival] = useState<Progress>({ wk: 0, dl: 0, done: false });
  const [emote, setEmote] = useState<{ e: Emote; mine: boolean; n: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [ended, setEnded] = useState<{ result: "win" | "loss" | "draw"; tokens: number; rating: number; why?: string } | null>(null);
  const [cancelled, setCancelled] = useState<string | null>(null);
  const started = useRef(false);
  const endedRef = useRef(false);
  const bot = useMemo(() => (match.bot && level ? botWeeks(level, seed) : null), [match.bot, level, seed]);

  // ── setup: host shares the map; guest waits for it (6 s, then the duel is cancelled with no penalty) ──
  useEffect(() => {
    analytics.track("mp_match", { bot: match.bot, mode: "duel" });
    analytics.track(match.bot ? "duel_bot_fallback" : "duel_match_found");
    if (match.bot) {
      const id = setTimeout(() => showEmote("glhf", false), 1400);
      return () => clearTimeout(id);
    }
    if (match.isHost && level) void match.setState({ level, seed });
    match.onState((st) => {
      const lv = (st as { level?: number } | null)?.level;
      if (lv && !level) setLevel(lv);
    });
    match.onMove((m) => {
      const p = m as Progress;
      if (typeof p?.dl === "number") setRival({ wk: p.wk, dl: p.dl, done: !!p.done });
    });
    match.onEmote((e) => showEmote(e, false));
    match.onLeave(() => {
      if (endedRef.current) return;
      if (!started.current) setCancelled("Your rival left before the start. No result is recorded.");
      else finishDuel("win", "Your rival left the duel.");
    });
    const id = setTimeout(() => { if (!started.current) setCancelled("The room didn't start in time. No result is recorded."); }, 6000);
    return () => { clearTimeout(id); void match.leave(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (level) started.current = true; }, [level]);

  const showEmote = (e: Emote, own: boolean) => {
    if (!own && mutedRef.current) return;
    setEmote((x) => ({ e, mine: own, n: (x?.n ?? 0) + 1 }));
    feedback("pop", "light");
  };
  const sendEmote = (e: Emote) => {
    showEmote(e, true);
    void match.emote(e);
    analytics.track("emote_sent", { emote: e });
    if (match.bot && (e === "nice" || e === "gg" || e === "wow")) setTimeout(() => showEmote(e === "gg" ? "gg" : "thanks", false), 1200);
  };
  useEffect(() => {
    if (!emote) return;
    const id = setTimeout(() => setEmote(null), 2200);
    return () => clearTimeout(id);
  }, [emote]);

  // ── progress: after each of my weeks, tell the rival (the AI rival steps to the same week) ──
  const onWeek = (s: State) => {
    const p = { wk: s.wk, dl: s.dl, done: !!s.over };
    setMine(p);
    if (!match.bot) void match.sendMove(p);
    if (bot) setTimeout(() => setRival({ wk: s.wk, dl: bot[Math.min(s.wk, bot.length - 1)], done: !!s.over }), 700);
  };
  const onFinish = (fin: State) => {
    const p = { wk: fin.wk, dl: fin.dl, done: true };
    setMine(p);
    if (!match.bot) void match.sendMove(p);
    if (bot) {
      const final = bot[bot.length - 1];
      setTimeout(() => { setRival({ wk: bot.length - 1, dl: final, done: true }); decide(fin.dl, final); }, 900);
    }
  };
  const decide = (a: number, b: number, why?: string) => finishDuel(a > b ? "win" : a < b ? "loss" : "draw", why);
  const finishDuel = (result: "win" | "loss" | "draw", why?: string) => {
    if (endedRef.current) return;
    endedRef.current = true;
    const r = recordDuel(result, match.bot);
    analytics.track("duel_result", { result, bot: match.bot });
    void multiplayer.submitScore("duel_rating", r.rating);
    setEnded({ result, tokens: r.tokens, rating: r.rating, why });
    if (match.bot) setTimeout(() => showEmote(result === "loss" ? "wp" : "gg", false), 1600);
  };
  // human duel: both done → result; I'm done and the rival is slow → decide on their latest week after 40 s
  useEffect(() => {
    if (match.bot || !mine.done || endedRef.current) return;
    if (rival.done) { decide(mine.dl, rival.dl); return; }
    const id = setTimeout(() => decide(mine.dl, rival.dl, `Your rival was still planning: scored on their week ${rival.wk}.`), WAIT_RIVAL_MS);
    return () => clearTimeout(id);
  }, [mine, rival]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cancelled) {
    return (
      <View style={styles.wait}>
        <Image source={art.hero_pip_cat} style={styles.waitPip} fadeDuration={0} />
        <Text style={styles.waitTitle}>Duel cancelled</Text>
        <Text style={styles.waitText}>{cancelled}</Text>
        <GameButton label="Find another rival" variant="accent" onPress={onRematch} />
        <GameButton style={{ marginTop: 10 }} label="Back" variant="light" size="sm" onPress={onExit} />
      </View>
    );
  }
  if (!level) {
    return (
      <View style={styles.wait}>
        <Image source={art.hero_pip_cat} style={styles.waitPip} fadeDuration={0} />
        <Text style={styles.waitTitle}>Joining {rivalName}…</Text>
        <Text style={styles.waitText}>The host is choosing today's city map.</Text>
      </View>
    );
  }
  const L = LEVELS[level - 1];
  const header = (
    <RivalStrip
      myName={myName} rivalName={rivalName} bot={match.bot} mine={mine} rival={rival} goal={L.goal} weeks={L.spec.weeks}
      emote={emote} onEmote={sendEmote} mapText={`${cityName(L.index)} · ${objectiveText(L)}`}
    />
  );
  return (
    <>
      <GameScreen levelNumber={level} mode="duel" header={header} onExit={onExit} onSettings={onSettings} onNextLevel={onExit} onWeek={onWeek} onFinish={onFinish} />
      {mine.done && !ended ? (
        <View style={styles.waitBanner} pointerEvents="none">
          <Text style={styles.waitBannerText}>Waiting for {rivalName} to finish week {Math.min(rival.wk + 1, L.spec.weeks)}…</Text>
        </View>
      ) : null}
      <DuelResult
        visible={!!ended} ended={ended} myName={myName} rivalName={rivalName} mine={mine.dl} rival={rival.dl} bot={match.bot}
        onEmote={sendEmote} emote={emote} muted={muted} onMute={() => { mutedRef.current = true; setMuted(true); }} onRematch={onRematch} onExit={onExit}
      />
    </>
  );
}

function RivalStrip({ myName, rivalName, bot, mine, rival, goal, weeks, emote, onEmote, mapText }: {
  myName: string; rivalName: string; bot: boolean; mine: Progress; rival: Progress; goal: number; weeks: number;
  emote: { e: Emote; mine: boolean; n: number } | null; onEmote: (e: Emote) => void; mapText: string;
}) {
  const max = Math.max(goal, mine.dl, rival.dl, 1);
  return (
    <View style={styles.strip}>
      <Text style={styles.stripMap} numberOfLines={1} adjustsFontSizeToFit>{mapText}</Text>
      <Lane name="You" dl={mine.dl} wk={mine.wk} weeks={weeks} share={mine.dl / max} color={palette.primary} bubble={emote?.mine ? emote : null} />
      <Lane name={`${rivalName}${bot ? " · AI" : " · online"}`} dl={rival.dl} wk={rival.wk} weeks={weeks} share={rival.dl / max} color={palette.secondaryDark} bubble={emote && !emote.mine ? emote : null} />
      <View style={styles.emotes}>
        {QUICK.map((e) => (
          <Tappable key={e} onPress={() => onEmote(e)} scaleTo={0.85} sound={null} style={styles.emoteBtn} accessibilityLabel={EMOTE_LABEL[e]}>
            <Text style={styles.emoteIcon}>{EMOTE_ICON[e]}</Text>
          </Tappable>
        ))}
      </View>
    </View>
  );
}

function Lane({ name, dl, wk, weeks, share, color, bubble }: { name: string; dl: number; wk: number; weeks: number; share: number; color: string; bubble: { e: Emote; n: number } | null }) {
  const w = useSharedValue(share);
  useEffect(() => { w.value = withTiming(share, { duration: 600, easing: Easing.out(Easing.cubic) }); }, [share, w]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.max(3, w.value * 100)}%` }));
  return (
    <View style={styles.lane}>
      <Text style={styles.laneName} numberOfLines={1}>{name}</Text>
      <View style={styles.laneBar}>
        <Animated.View style={[styles.laneFill, { backgroundColor: color }, fill]} />
      </View>
      <AnimatedNumber value={dl} style={styles.laneDl} />
      <Text style={styles.laneWk}>wk {Math.min(wk + 1, weeks)}</Text>
      {bubble ? <Bubble key={bubble.n} e={bubble.e} /> : null}
    </View>
  );
}

function Bubble({ e }: { e: Emote }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withSpring(1, springs.pop); }, [t]);
  const st = useAnimatedStyle(() => ({ opacity: 0.3 + 0.7 * t.value, transform: [{ scale: 0.6 + 0.4 * t.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.bubble, st]}>
      <Text style={styles.bubbleText} numberOfLines={1}>{EMOTE_ICON[e]} {EMOTE_LABEL[e]}</Text>
    </Animated.View>
  );
}

export function DuelResult({ visible, ended, myName, rivalName, mine, rival, bot, onEmote, emote, muted, onMute, onRematch, onExit }: {
  visible: boolean; ended: { result: "win" | "loss" | "draw"; tokens: number; rating: number; why?: string } | null; myName: string; rivalName: string;
  mine: number; rival: number; bot: boolean; onEmote: (e: Emote) => void; emote: { e: Emote; mine: boolean; n: number } | null; muted: boolean; onMute: () => void;
  onRematch: () => void; onExit: () => void;
}) {
  const [burst, setBurst] = useState(0);
  const [reveal, setReveal] = useState(false);
  const breathe = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    setReveal(false);
    const a = setTimeout(() => { if (ended?.result !== "loss") setBurst((b) => b + 1); feedback(ended?.result === "loss" ? "pop" : "success", "success"); }, 200);
    const b = setTimeout(() => { setReveal(true); feedback("coin", "medium"); }, 900);
    breathe.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), 6);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [visible, ended?.result, breathe]);
  const btn = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breathe.value * 0.04 }] }));
  if (!ended) return null;
  const title = ended.result === "win" ? "You win the duel!" : ended.result === "draw" ? "A friendly draw" : `${rivalName} wins`;
  return (
    <Popup visible={visible} title={title} underlay={<Confetti trigger={burst} />}>
      {ended.why ? <Text style={styles.why}>{ended.why}</Text> : null}
      <View style={styles.scoreRow}>
        <Score name={myName} dl={mine} win={ended.result === "win"} color={palette.primary} />
        <Text style={styles.vs}>vs</Text>
        <Score name={rivalName} dl={rival} win={ended.result === "loss"} color={palette.secondaryDark} />
      </View>
      <View style={styles.rewardSlot}>
        {reveal ? (
          <View style={styles.reward}>
            <Text style={styles.rewardText}>+</Text>
            <AnimatedNumber from={0} value={ended.tokens} duration={700} style={styles.rewardText} />
            <Text style={styles.rewardSmall}> Tokens · rating {ended.rating}</Text>
          </View>
        ) : null}
      </View>
      {emote && !emote.mine ? <Text style={styles.gotEmote}>{rivalName}: {EMOTE_ICON[emote.e]} {EMOTE_LABEL[emote.e]}</Text> : null}
      <View style={styles.emotesRow}>
        {(["gg", "wp", "thanks", "again"] as Emote[]).map((e) => (
          <Tappable key={e} onPress={() => onEmote(e)} scaleTo={0.85} sound={null} style={styles.emoteBtn} accessibilityLabel={EMOTE_LABEL[e]}>
            <Text style={styles.emoteIcon}>{EMOTE_ICON[e]}</Text>
          </Tappable>
        ))}
      </View>
      <Animated.View style={btn}>
        <GameButton label={bot ? "Duel again" : "New duel"} variant="accent" size="lg" onPress={onRematch} />
      </Animated.View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <GameButton style={{ flex: 1 }} size="sm" variant="light" label="Online hub" onPress={onExit} />
        {!bot ? <GameButton style={{ flex: 1 }} size="sm" variant="light" label={muted ? "Muted ✓" : "Mute rival"} onPress={onMute} /> : null}
      </View>
    </Popup>
  );
}

function Score({ name, dl, win, color }: { name: string; dl: number; win: boolean; color: string }) {
  return (
    <View style={[styles.score, win && { borderColor: palette.gold, backgroundColor: "#FFF6D6" }]}>
      {win ? <Icon name="trophy" size={26} tint={palette.gold} /> : <View style={{ height: 26 }} />}
      <Text style={styles.scoreName} numberOfLines={1} adjustsFontSizeToFit>{name}</Text>
      <Text style={[styles.scoreDl, { color }]}>{dl}</Text>
      <Text style={styles.scoreUnit}>riders</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wait: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: palette.bgBottom },
  waitPip: { width: 150, height: 163, marginBottom: 12 },
  waitTitle: { fontFamily: fonts.display, fontSize: 24, color: palette.ink, textAlign: "center" },
  waitText: { fontFamily: fonts.body, fontSize: 15, color: palette.inkSoft, textAlign: "center", marginTop: 6, marginBottom: 18 },
  waitBanner: { position: "absolute", left: 20, right: 20, top: "45%", padding: 12, borderRadius: 18, backgroundColor: "rgba(47,72,88,0.9)" },
  waitBannerText: { fontFamily: fonts.body, fontSize: 15, color: "#FFF9EE", textAlign: "center" },
  strip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: "rgba(255,249,238,0.95)", borderWidth: 2, borderColor: "#FFFFFF", gap: 3 },
  stripMap: { fontFamily: fonts.body, fontSize: 11.5, color: palette.inkSoft, textAlign: "center" },
  lane: { flexDirection: "row", alignItems: "center", gap: 6 },
  laneName: { width: 124, fontFamily: fonts.body, fontSize: 11.5, color: palette.ink },
  laneBar: { flex: 1, height: 9, borderRadius: 5, backgroundColor: palette.surfaceAlt, overflow: "hidden" },
  laneFill: { height: "100%", borderRadius: 5 },
  laneDl: { width: 36, fontFamily: fonts.display, fontSize: 15, color: palette.ink, textAlign: "right" },
  laneWk: { width: 36, fontFamily: fonts.body, fontSize: 11, color: palette.inkSoft },
  bubble: { position: "absolute", left: 70, top: -6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: palette.ink },
  bubbleText: { fontFamily: fonts.body, fontSize: 12, color: "#FFF9EE" },
  emotes: { flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 2 },
  emotesRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginBottom: 14 },
  emoteBtn: { width: 48, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: palette.surfaceAlt, borderWidth: 1.5, borderColor: palette.paperEdge },
  emoteIcon: { fontSize: 18 },
  why: { fontFamily: fonts.body, fontSize: 13, color: palette.inkSoft, textAlign: "center", marginTop: -6, marginBottom: 8 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  vs: { fontFamily: fonts.display, fontSize: 18, color: palette.inkSoft },
  score: { flex: 1, alignItems: "center", padding: 10, borderRadius: 18, backgroundColor: palette.surfaceAlt, borderWidth: 2, borderColor: palette.paperEdge },
  scoreName: { fontFamily: fonts.body, fontSize: 13, color: palette.ink },
  scoreDl: { fontFamily: fonts.display, fontSize: 34 },
  scoreUnit: { fontFamily: fonts.body, fontSize: 12, color: palette.inkSoft, marginTop: -4 },
  rewardSlot: { height: 46, marginVertical: 10, justifyContent: "center" },
  reward: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 46, borderRadius: 16, backgroundColor: palette.surfaceAlt },
  rewardText: { fontFamily: fonts.display, fontSize: 24, color: palette.accentDark },
  rewardSmall: { fontFamily: fonts.body, fontSize: 14, color: palette.inkSoft },
  gotEmote: { fontFamily: fonts.body, fontSize: 14, color: palette.ink, textAlign: "center", marginBottom: 8 },
});
