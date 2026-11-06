import { useEffect, useState } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { GameButton, Icon, Popup, feedback, fonts, palette } from "../ui";
import { iap, type ShopItem } from "../modules/iap";
import { ads } from "../modules/ads";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { TOKEN, type IconName } from "../gameArt";

const HINT_PACK = { n: 3, cost: 90 };
const BREATHER_PACK = { n: 3, cost: 120 };
const FREE_TOKENS = 40;

const IAP_ICON: Record<string, IconName> = { remove_ads: "close", coins_small: "carriage", coins_large: "carriage" };
const IAP_TEXT: Record<string, string> = {
  remove_ads: "No more ad breaks between levels. Forever.",
  coins_small: "500 Tokens for boosters",
  coins_large: "3000 Tokens for boosters",
};

/**
 * Shop: boosters for Tokens (Hint, Breather — earnable, never cash-only), free Tokens for an opt-in video, and the
 * store's own products (Remove Ads, Token packs) with real store prices only; Restore purchases.
 */
export function ShopScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [state, setState] = useState(store.get());
  const [items, setItems] = useState<ShopItem[]>(iap.items());
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => store.subscribe(setState), []);
  useEffect(() => {
    if (!visible) return;
    setItems(iap.items());
    setNote(null);
    analytics.track("iap_view");
  }, [visible]);
  const removeAds = items.find((i) => i.sku === "remove_ads");
  const buyIap = (sku: string) => {
    const fresh = iap.items();
    setItems(fresh);
    if (!fresh.some((i) => i.sku === sku)) {
      feedback("error", "light");
      setNote("The store isn't reachable right now. Check your connection and try again in a moment.");
      return;
    }
    feedback("tap", "light");
    void iap.purchase(sku);
  };
  const buy = (what: "hints" | "breathers", pack: { n: number; cost: number }) => {
    const s = store.get();
    if (s.coins < pack.cost) { feedback("error", "light"); setNote(`You need ${pack.cost - s.coins} more Tokens. Win levels to earn them.`); return; }
    store.set({ coins: s.coins - pack.cost, [what]: (s[what] ?? 0) + pack.n });
    feedback("coin", "medium");
    setNote(`+${pack.n} ${what === "hints" ? "Hints" : "Breathers"} added.`);
  };
  return (
    <Popup visible={visible} title="Station Shop" onClose={onClose}>
      <View style={styles.balance}>
        <Image source={TOKEN} style={{ width: 40, height: 40 }} fadeDuration={0} />
        <Text style={styles.balanceText}>{state.coins.toLocaleString()}</Text>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}

      <Text style={styles.section}>Boosters</Text>
      <Row icon="bulb" tint={palette.gold} title={`Hint ×${HINT_PACK.n}`} body={`Shows your next best move. You have ${state.hints ?? 0}.`}>
        <GameButton size="sm" variant="primary" label={`${HINT_PACK.cost}`} icon={<Image source={TOKEN} style={styles.btnToken} />} onPress={() => buy("hints", HINT_PACK)} />
      </Row>
      <Row icon="cloud" tint={palette.secondary} title={`Breather ×${BREATHER_PACK.n}`} body={`Halves every waiting queue. You have ${state.breathers ?? 0}.`}>
        <GameButton size="sm" variant="primary" label={`${BREATHER_PACK.cost}`} icon={<Image source={TOKEN} style={styles.btnToken} />} onPress={() => buy("breathers", BREATHER_PACK)} />
      </Row>
      <Row icon="play" tint={palette.primary} title={`Free ${FREE_TOKENS} Tokens`} body="Watch a short video (optional).">
        <GameButton
          size="sm"
          variant="secondary"
          label="Watch"
          onPress={() => {
            const shown = ads.showRewarded(() => { store.set({ coins: store.get().coins + FREE_TOKENS }); setNote(`+${FREE_TOKENS} Tokens. Thank you!`); });
            if (!shown) setNote("No video is ready right now. Try again in a moment.");
          }}
        />
      </Row>

      <Text style={styles.section}>Supporter</Text>
      {/* Remove Ads is always offered on Android (QA feature tour 2026-11-06: "no Remove Ads button exists" when the
          store's product list hadn't loaded). Its button shows the store's real price once known — never a made-up
          one; on iOS only products the store returned are shown (the build may ship without IAP). */}
      {!state.adsRemoved && (removeAds || Platform.OS === "android") ? (
        <Row icon="close" tint={palette.danger} title="Remove Ads" body={IAP_TEXT.remove_ads}>
          <GameButton size="sm" variant="accent" label={removeAds?.price ?? "Buy"} onPress={() => buyIap("remove_ads")} />
        </Row>
      ) : null}
      {items.filter((i) => i.sku !== "remove_ads").map((i) => (
        <Row key={i.sku} icon={IAP_ICON[i.sku] ?? "cart"} tint={palette.accent} title={i.title} body={IAP_TEXT[i.sku] ?? ""}>
          <GameButton size="sm" variant="accent" label={i.price} onPress={() => buyIap(i.sku)} />
        </Row>
      ))}
      {state.adsRemoved ? <Text style={styles.note}>Ads removed. Thank you for supporting Station Zen!</Text> : null}
      {items.length || Platform.OS === "android" ? (
        <GameButton
          style={{ marginTop: 6 }}
          size="sm"
          variant="light"
          label="Restore purchases"
          onPress={() => { void iap.restore().then(() => setNote(store.get().adsRemoved ? "Purchases restored: ads are off." : "Nothing to restore on this account yet.")); }}
        />
      ) : null}
      <GameButton style={{ marginTop: 12 }} label="Close" onPress={onClose} />
    </Popup>
  );
}

function Row({ icon, tint, title, body, children }: { icon: IconName; tint: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: tint }]}>
        <Icon name={icon} size={28} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <View style={{ minWidth: 84 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  balance: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: -6, marginBottom: 6 },
  balanceText: { fontFamily: fonts.display, fontSize: 28, color: palette.accentDark },
  note: { fontFamily: fonts.body, fontSize: 14, color: palette.primaryDark, textAlign: "center", marginBottom: 8 },
  section: { fontFamily: fonts.display, fontSize: 16, color: palette.inkSoft, marginTop: 6, marginBottom: 6, letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: palette.surfaceAlt, borderRadius: 18, padding: 10, marginBottom: 8 },
  icon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFF9EE" },
  title: { fontFamily: fonts.display, fontSize: 17, color: palette.ink },
  body: { fontFamily: fonts.bodyRegular, fontSize: 12.5, color: palette.inkSoft },
  btnToken: { width: 22, height: 22 },
});
