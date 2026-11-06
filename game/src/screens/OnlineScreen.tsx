import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { GameButton, Icon, Popup, feedback, fonts, palette } from "../ui";
import { Card, Frame } from "./modes/Frame";
import { multiplayer, type Match } from "../modules/multiplayer";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { art } from "../art";
import { type IconName } from "../gameArt";

const SEARCH_CAP_MS = 12000; // the AI rival steps in after this, whatever the network does

/** A local AI match (offline, or nobody found in time): nothing goes online. */
function localBot(): Match {
  const noop = () => {};
  return {
    id: `bot-${Date.now()}`, bot: true, seat: 0, isHost: true,
    players: () => [{ uid: "me", name: "You", avatar: 0, seat: 0 }, { uid: "bot", name: "Rival", avatar: 1, seat: 1 }],
    onMove: noop, onEmote: noop, onState: noop, onPlayers: noop, onLeave: noop,
    sendMove: async () => {}, setState: async () => {}, emote: async () => {}, leave: async () => {},
  };
}
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

type Score = { uid: string; name: string; score: number };

/**
 * Online hub: Quick Duel (a rival of your rating band online, or Pip's AI rival after ~10 s / offline), Friend Room
 * by a 4-6 character code, the duel-rating leaderboard, and a plain "how matchmaking works" note. Fixed emotes only.
 */
export function OnlineScreen({ onBack, onStart, autoQuick }: { onBack: () => void; onStart: (m: Match) => void; autoQuick?: boolean }) {
  const [p, setP] = useState(store.get());
  useEffect(() => store.subscribe(setP), []);
  const [searching, setSearching] = useState(false);
  const [room, setRoom] = useState<Match | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [board, setBoard] = useState<Score[] | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const cancelled = useRef(false);
  const duel = p.duel ?? { wins: 0, losses: 0, rating: 100 };
  const online = multiplayer.enabled();

  useEffect(() => {
    let live = true;
    withTimeout(multiplayer.topScores("duel_rating", 10), 5000, [] as Score[]).then((s) => live && setBoard(s));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (autoQuick) void quick();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const quick = async () => {
    cancelled.current = false;
    setSearching(true);
    analytics.track("duel_queue_start");
    const m = await withTimeout(multiplayer.findMatch("duel", { timeoutMs: 9000 }), SEARCH_CAP_MS, localBot());
    if (cancelled.current) { void m.leave(); return; }
    setSearching(false);
    onStart(m);
  };
  const createRoom = async () => {
    setNote(null);
    const m = await withTimeout(multiplayer.createRoom("duel"), 6000, null);
    if (!m) { feedback("error", "light"); setNote("Friend rooms need an internet connection. Quick Duel works offline with the AI rival."); return; }
    analytics.track("friend_room_created");
    setRoom(m);
    m.onPlayers((ps) => { if (ps.length >= 2) { setRoom(null); onStart(m); } });
  };
  const joinRoom = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 4) { feedback("error", "light"); setNote("Room codes have at least 4 letters or digits."); return; }
    const m = await withTimeout(multiplayer.joinRoom(c, 2), 6000, null);
    if (!m) { feedback("error", "light"); setNote(`No open room "${c}" was found. Check the code with your friend.`); return; }
    analytics.track("friend_room_joined");
    setJoinOpen(false);
    onStart(m);
  };

  return (
    <Frame title="Online Duels" sub="Same map · most riders wins" icon="duel" bg="bg_city_harbor" coins={p.coins} onBack={onBack}>
      <Card style={styles.profile}>
        <Image source={art.hero_pip_cat} style={styles.pip} fadeDuration={0} />
        <View style={{ flex: 1 }}>
          <Text style={styles.h}>Duel rating {duel.rating}</Text>
          <Text style={styles.body}>{duel.wins} wins · {duel.losses} losses</Text>
          <Text style={styles.small}>{online ? "Online names are generated. No chat, only friendly emotes." : "Offline: duels play Pip's AI rival."}</Text>
        </View>
      </Card>

      <ModeRow icon="duel" tint={palette.accent} title="Quick Duel" body="Plan the same city as a rival. Nobody free in about 10 s? Pip's AI rival plays you.">
        <GameButton size="sm" variant="accent" label="Play" onPress={() => void quick()} />
      </ModeRow>
      <ModeRow icon="people" tint={palette.secondaryDark} title="Friend Room" body="Make a room and share its code, or join a friend's code.">
        <View style={{ gap: 6 }}>
          <GameButton size="sm" variant="secondary" label="Create" onPress={() => void createRoom()} />
          <GameButton size="sm" variant="light" label="Join" onPress={() => { setNote(null); setJoinOpen(true); }} />
        </View>
      </ModeRow>
      {note ? <Text style={styles.note}>{note}</Text> : null}

      <Card>
        <View style={styles.boardHead}>
          <Icon name="trophy" size={24} tint={palette.gold} />
          <Text style={styles.h}>Leaderboard · duel rating</Text>
        </View>
        {board == null ? (
          <Text style={styles.small}>Loading scores…</Text>
        ) : board.length ? (
          board.map((s, i) => (
            <View key={s.uid} style={[styles.boardRow, i % 2 ? null : styles.boardRowAlt]}>
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={styles.boardName} numberOfLines={1}>{s.name}</Text>
              <Text style={styles.boardScore}>{s.score}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.small}>{online ? "No scores yet this season. Win a duel to get on the board." : "Leaderboards appear when you're online. Your rating is kept on this device."}</Text>
        )}
      </Card>
      <GameButton size="sm" variant="light" label="How matchmaking works" onPress={() => setHelpOpen(true)} />

      <Popup visible={searching} title="Finding a rival">
        <Searching />
        <Text style={styles.center}>Looking for a player near rating {duel.rating}. Pip's AI rival steps in if nobody is free.</Text>
        <GameButton style={{ marginTop: 14 }} variant="light" label="Cancel" onPress={() => { cancelled.current = true; setSearching(false); }} />
      </Popup>
      <Popup visible={!!room} title="Friend Room">
        <Text style={styles.center}>Share this code with a friend:</Text>
        <Text style={styles.code} selectable>{room?.code ?? "…"}</Text>
        <Searching />
        <Text style={styles.center}>Waiting for your friend to join…</Text>
        <GameButton style={{ marginTop: 14 }} variant="light" label="Close room" onPress={() => { void room?.leave(); setRoom(null); }} />
      </Popup>
      <Popup visible={joinOpen} title="Join a room" onClose={() => setJoinOpen(false)}>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6))}
          placeholder="CODE"
          placeholderTextColor={palette.paperEdge}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={styles.input}
        />
        {note ? <Text style={styles.note}>{note}</Text> : null}
        <GameButton variant="accent" label="Join" onPress={() => void joinRoom()} />
        <GameButton style={{ marginTop: 10 }} size="sm" variant="light" label="Cancel" onPress={() => setJoinOpen(false)} />
      </Popup>
      <Popup visible={helpOpen} title="How matchmaking works" onClose={() => setHelpOpen(false)}>
        <Text style={styles.help}>• Quick Duel pairs you with a waiting player. Your rating only goes up (+20 for a win) or down (−10 for a loss, never below 0). Purchases never change it.</Text>
        <Text style={styles.help}>• Both players plan the same city map. The most riders delivered when both runs end wins.</Text>
        <Text style={styles.help}>• If nobody is free within about 10 seconds, or you're offline, Pip's AI rival plays you.</Text>
        <Text style={styles.help}>• A rival who leaves before the start cancels the duel with no result. One who leaves mid-duel gives you the win.</Text>
        <Text style={styles.help}>• Names are generated, there is no chat, and you can mute a rival's emotes at any time.</Text>
        <GameButton style={{ marginTop: 8 }} label="Got it" onPress={() => setHelpOpen(false)} />
      </Popup>
    </Frame>
  );
}

function ModeRow({ icon, tint, title, body, children }: { icon: IconName; tint: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <Card style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: tint }]}><Icon name={icon} size={30} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.h}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <View style={{ width: 92 }}>{children}</View>
    </Card>
  );
}

/** Pip's little train circling while we wait (finite: stops when the popup closes). */
function Searching() {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.linear }), 12, false); }, [t]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value * 360}deg` }] }));
  return (
    <View style={styles.search}>
      <Animated.View style={[styles.orbit, st]}>
        <Image source={art.train_capsule} style={styles.orbitTrain} fadeDuration={0} />
      </Animated.View>
      <Image source={art.station_normal} style={styles.searchStation} fadeDuration={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: 10 },
  pip: { width: 64, height: 70 },
  h: { fontFamily: fonts.display, fontSize: 18, color: palette.ink },
  body: { fontFamily: fonts.body, fontSize: 13.5, color: palette.inkSoft },
  small: { fontFamily: fonts.bodyRegular, fontSize: 12.5, color: palette.inkSoft },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#FFF9EE" },
  note: { fontFamily: fonts.body, fontSize: 13.5, color: palette.accentDark, textAlign: "center", marginVertical: 4 },
  boardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  boardRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10 },
  boardRowAlt: { backgroundColor: palette.surfaceAlt },
  rank: { width: 24, fontFamily: fonts.display, fontSize: 16, color: palette.accentDark },
  boardName: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: palette.ink },
  boardScore: { fontFamily: fonts.display, fontSize: 16, color: palette.ink },
  center: { fontFamily: fonts.body, fontSize: 14.5, color: palette.inkSoft, textAlign: "center" },
  code: { fontFamily: fonts.display, fontSize: 40, letterSpacing: 6, color: palette.primaryDark, textAlign: "center", marginVertical: 6 },
  input: {
    height: 58, borderRadius: 18, borderWidth: 2, borderColor: palette.paperEdge, backgroundColor: "#FFFDF6", textAlign: "center",
    fontFamily: fonts.display, fontSize: 28, letterSpacing: 6, color: palette.ink, marginBottom: 12,
  },
  help: { fontFamily: fonts.body, fontSize: 14, color: palette.ink, marginBottom: 8, lineHeight: 20 },
  search: { width: 130, height: 130, alignSelf: "center", alignItems: "center", justifyContent: "center", marginVertical: 8 },
  orbit: { position: "absolute", width: 130, height: 130 },
  orbitTrain: { position: "absolute", left: 47, top: -4, width: 36, height: 30 },
  searchStation: { width: 56, height: 57 },
});
