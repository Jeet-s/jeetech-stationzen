import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { GameButton, Icon, Popup, Toggle, WinPopup, fonts, palette, springs } from "../ui";
import { GameScreen } from "./GameScreen";
import { LEVELS } from "../game/levels";
import { starsFor, type State } from "../game/engine";
import { cityName, objectiveText } from "../game/meta";
import { completeDaily, dailyLevel, dailyState, dayKey, freezesLeft, streakToday, DAILY_REWARD, DAILY_STREAK_BONUS } from "../game/modes";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { setReminders } from "../ui/SettingsPopup";
import { GLYPH_IMG, TOKEN } from "../gameArt";

/** Seven paper day-discs: lit up to the current streak (within this 7-day ribbon), today's disc breathing. */
export function StreakRibbon({ streak, today, pop }: { streak: number; today: boolean; pop?: boolean }) {
  const inRibbon = streak === 0 ? 0 : ((streak - 1) % 7) + 1;
  return (
    <View style={styles.ribbon}>
      {Array.from({ length: 7 }, (_, i) => (
        <Day key={i} lit={i < inRibbon} next={!today && i === inRibbon} pop={!!pop && i === inRibbon - 1} n={i + 1} />
      ))}
    </View>
  );
}

function Day({ lit, next, pop, n }: { lit: boolean; next: boolean; pop: boolean; n: number }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (pop) s.value = withDelay(500, withSequence(withTiming(1.45, { duration: 160 }), withSpring(1, springs.pop)));
    else if (next) s.value = withSequence(withTiming(1.12, { duration: 420 }), withTiming(1, { duration: 420 }), withTiming(1.12, { duration: 420 }), withTiming(1, { duration: 420 }));
  }, [pop, next, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.day, lit ? styles.dayLit : next ? styles.dayNext : null, st]}>
      {lit ? <Icon name="flame" size={20} /> : <Text style={[styles.dayN, next && { color: palette.accentDark }]}>{n}</Text>}
    </Animated.View>
  );
}

/** Home → Daily: today's puzzle (same map for every player), the streak ribbon, the weekly freeze, reminders. */
export function DailyPopup({ visible, onClose, onPlay }: { visible: boolean; onClose: () => void; onPlay: () => void }) {
  const [p, setP] = useState(store.get());
  useEffect(() => store.subscribe(setP), []);
  const key = dayKey();
  const lv = dailyLevel(key);
  const L = LEVELS[lv - 1];
  const t = streakToday(key);
  const d = dailyState();
  const reward = DAILY_REWARD + Math.min(7, t.streak + 1) * DAILY_STREAK_BONUS;
  return (
    <Popup visible={visible} title="Daily Puzzle" onClose={onClose}>
      <Text style={styles.sub}>{t.doneToday ? "Solved today. A new map arrives at midnight (UTC)." : "One calm map a day, the same for every player."}</Text>
      <StreakRibbon streak={t.streak} today={t.doneToday} />
      <Text style={styles.streak}>
        Streak <Text style={styles.streakN}>{t.streak}</Text> day{t.streak === 1 ? "" : "s"} · best {d.best}
      </Text>
      <Text style={styles.freeze}>
        {t.freezeNeeded ? "You missed yesterday: today's solve uses your free streak freeze." : `Streak freeze: ${freezesLeft(key)} this week (covers one missed day)`}
      </Text>
      <View style={styles.today}>
        <Image source={GLYPH_IMG[L.stations[0].glyph]} style={{ width: 44, height: 44 }} fadeDuration={0} />
        <View style={{ flex: 1 }}>
          <Text style={styles.todayTitle}>{cityName(L.index)} · {key}</Text>
          <Text style={styles.todayBody}>{objectiveText(L)}</Text>
        </View>
        {!t.doneToday ? (
          <View style={styles.rewardChip}>
            <Image source={TOKEN} style={{ width: 22, height: 22 }} fadeDuration={0} />
            <Text style={styles.rewardChipText}>+{reward}</Text>
          </View>
        ) : null}
      </View>
      {t.doneToday ? (
        <GameButton label="Come back tomorrow" variant="light" onPress={onClose} />
      ) : (
        <GameButton label="Play today's map" icon={<Icon name="play" size={24} />} variant="accent" size="lg" sound="whoosh" onPress={onPlay} />
      )}
      <View style={{ height: 8 }} />
      <Toggle label="Remind me each evening" value={!!p.reminders} onChange={(v) => void setReminders(v)} />
      <GameButton style={{ marginTop: 8 }} size="sm" variant="light" label="Close" onPress={onClose} />
    </Popup>
  );
}

/** The day's puzzle on the real game screen; a win extends the streak and pays Tokens (staged WinPopup). */
export function DailyScreen({ onExit, onSettings }: { onExit: () => void; onSettings: () => void }) {
  const key = useMemo(() => dayKey(), []);
  const lv = dailyLevel(key);
  const L = LEVELS[lv - 1];
  const [done, setDone] = useState<{ stars: number; tokens: number; streak: number; usedFreeze: boolean } | null>(null);
  const finish = (fin: State) => {
    const r = completeDaily(key);
    const stars = starsFor(L, fin);
    analytics.track("daily_complete", { map: lv, stars });
    if (r.first) analytics.track("streak_extended", { streak: r.streak });
    if (r.usedFreeze) analytics.track("streak_freeze_used");
    setDone({ stars, tokens: r.tokens, streak: r.streak, usedFreeze: r.usedFreeze });
  };
  const header = (
    <View style={styles.header}>
      <Icon name="calendar" size={18} tint={palette.accentDark} />
      <Text style={styles.headerText} numberOfLines={2}>
        <Text style={{ fontFamily: fonts.display }}>Daily Puzzle · {key}</Text> · {objectiveText(L)}
      </Text>
    </View>
  );
  return (
    <>
      <GameScreen levelNumber={lv} mode="daily" header={header} onExit={onExit} onSettings={onSettings} onNextLevel={onExit} onFinish={finish} />
      <WinPopup
        visible={!!done}
        title="Daily Solved!"
        stars={done?.stars ?? 0}
        coins={done?.tokens ?? 0}
        nextLabel="Home"
        onNext={onExit}
      >
        {done ? (
          <View style={{ gap: 6, marginTop: 4 }}>
            <StreakRibbon streak={done.streak} today pop />
            <Text style={styles.streak}>
              Streak <Text style={styles.streakN}>{done.streak}</Text> day{done.streak === 1 ? "" : "s"}{done.usedFreeze ? " · freeze used" : ""}
            </Text>
          </View>
        ) : null}
      </WinPopup>
    </>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: fonts.body, fontSize: 14, color: palette.inkSoft, textAlign: "center", marginTop: -8, marginBottom: 12 },
  ribbon: { flexDirection: "row", justifyContent: "center", gap: 6 },
  day: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: palette.surfaceAlt, borderWidth: 2, borderColor: palette.paperEdge,
  },
  dayLit: { backgroundColor: palette.accent, borderColor: "#FFF6D6" },
  dayNext: { borderColor: palette.accent, borderStyle: "dashed", backgroundColor: "#FFF6D6" },
  dayN: { fontFamily: fonts.display, fontSize: 15, color: palette.inkSoft },
  streak: { fontFamily: fonts.body, fontSize: 15, color: palette.ink, textAlign: "center", marginTop: 10 },
  streakN: { fontFamily: fonts.display, fontSize: 20, color: palette.accentDark },
  freeze: { fontFamily: fonts.bodyRegular, fontSize: 12.5, color: palette.inkSoft, textAlign: "center", marginTop: 2 },
  today: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 18, backgroundColor: palette.surfaceAlt, marginVertical: 12 },
  rewardChip: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 8, height: 32, borderRadius: 16, backgroundColor: "#FFF6D6", borderWidth: 1.5, borderColor: palette.gold },
  rewardChipText: { fontFamily: fonts.display, fontSize: 15, color: palette.accentDark },
  todayTitle: { fontFamily: fonts.display, fontSize: 16, color: palette.ink },
  todayBody: { fontFamily: fonts.body, fontSize: 13, color: palette.inkSoft },
  header: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14,
    backgroundColor: "rgba(255,246,214,0.95)", borderWidth: 1.5, borderColor: palette.gold,
  },
  headerText: { fontFamily: fonts.body, fontSize: 12.5, color: palette.ink, flexShrink: 1 },
});
