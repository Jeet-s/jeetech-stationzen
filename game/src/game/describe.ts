/**
 * describe(): a level as the lead level designer reads it — the map exactly as authored (it IS the board),
 * a station table, the budget, and the plan's intent (role, aha, why). The legend is complete on every row
 * because the review shows only the first row's legend.
 */
import { CARD_TEXT, GLYPHS, star3Text, type Level } from "./engine";
import type { LevelBrief } from "./sim";
import { SOLUTIONS } from "./solutions";

export const LEGEND =
  "MAP: capital letters = stations (glyph + weekly demand listed under the map); - | \\ / x = rail corridors a line may " +
  "use (x = two diagonals crossing). TRACKS vs HOPS: one corridor between two stations costs ONE track however long it " +
  "is drawn ('A---B' is 1 track), but its HOPS are its length in station spacings ('A-B' 1 hop, 'A---B' 2 hops) and " +
  "each h on it adds 1 more hop; a line's hops set its seats. ~ = river crossing (needs a tunnel); h = hill (each h " +
  "adds 1 hop: slower trains); = = ferry over deep water (+1 hop, a ferry carries at most 12 riders a week per carriage " +
  "set); > < v ^ = one-way rail (a line using it only runs once closed into a loop that follows the arrows); . empty " +
  "ground; , water. RULES: a line is one path along corridors (extend only from its two ends); passengers ride to the " +
  "nearest station showing the glyph they want (nearest = fewest line changes, then fewest hops, along the lines drawn; " +
  "the in-game route preview shows it), changing lines at any shared station. A station with no demand listed sends " +
  "nobody (its card shows 0 riders). Station rows read 'A leaf → 2 star, 1 drop' = A shows a Leaf and sends 2 riders a week who want a Star and 1 who wants a Drop. A line's weekly seats = 6 x " +
  "(1 + carriages) x 36 / (2 x its hops) — short lines run often; loops count hops once (twice as often). Each week " +
  "riders appear, ride, queue if no seat; a station holding 12 (24 at an interchange #) is full: 'Last Call'; full 2 " +
  "weeks in a row ends the run (heritage ! stations may never be full). Win = reach the last week having delivered " +
  "the goal. Week events: stations marked @w open in week w (visible from the start), *w = market day (3x demand " +
  "that week), snow weeks halve every train's seats, rush weeks multiply demand. MOVES: new line, extend a line end, " +
  "close a loop, add carriage, interchange upgrade, pick the weekly card, undo this week's edits, run the week. " +
  "PLANNING AIDS: while planning, every ring shows its FORECAST (how full it gets by the last week if the network " +
  "stays as drawn) and the HUD shows projected deliveries vs the goal, so a week-1 plan that fails in week 6 is " +
  "visible in week 1; a lost run restarts from the start of any earlier week.";

const GL = "LDKNMYCS";

export function stationTable(L: Level): string[] {
  return L.stations.map((st) => {
    const wants = L.groups.filter((g) => g.s === st.id).map((g) => `${g.r} ${GLYPHS[g.g]}`).join(", ");
    const tags = [
      st.opens > 1 ? `opens wk${st.opens}` : "",
      st.heritage ? "HERITAGE" : "",
      st.hub ? "interchange" : "",
      st.market ? `market wk${st.market}` : "",
    ].filter(Boolean);
    return `${st.ch} ${GLYPHS[st.glyph]}${tags.length ? " (" + tags.join(", ") + ")" : ""} → ${wants || "0 riders"}`;
  });
}

export function budgetLine(L: Level): string {
  const sp = L.spec;
  const tr = sp.tracks.map((t, i) => (t ? `wk${i + 1} +${t}` : "")).filter(Boolean).join(", ");
  const bits = [
    `${sp.weeks} weeks`,
    `tracks ${tr}`,
    `${sp.lines} line${sp.lines > 1 ? "s" : ""}`,
    sp.tunnels ? `${sp.tunnels} tunnel${sp.tunnels > 1 ? "s" : ""}` : "",
    sp.cars ? `${sp.cars} carriage${sp.cars > 1 ? "s" : ""}` : "",
    sp.hubs ? `${sp.hubs} interchange upgrade${sp.hubs > 1 ? "s" : ""}` : "",
    sp.cards ? "cards " + Object.entries(sp.cards).map(([w, c]) => `wk${w}: ${c.map((k) => CARD_TEXT[k]).join(" | ")}`).join("; ") : "",
    sp.snow?.length ? `snow wk${sp.snow.join(",")}` : "",
    sp.rush ? "rush " + Object.entries(sp.rush).map(([w, m]) => `wk${w} x${m}`).join(", ") : "",
    sp.loops ? "loops allowed" : "",
    `goal ${L.goal} of ${L.total} riders`,
    `3rd star: ${star3Text(sp.star3).toLowerCase()}`,
    sp.noFail ? "overcrowding off (guided)" : "",
  ];
  return bits.filter(Boolean).join(" · ");
}

export function mechanicsOf(L: Level, all = false): string[] {
  const sp = L.spec;
  // The always-on basics are listed in city 1 (where they're taught); later rows list what each level adds.
  const basics = all || L.index < 12;
  const m = basics ? ["lines", "glyph demand"] : [];
  if (basics && (sp.lines >= 2 || (sp.cards && Object.values(sp.cards).some((c) => c.includes("line"))))) m.push("transfers");
  if (basics) m.push("line capacity");
  if (basics && !sp.noFail) m.push("overcrowd rings");
  if (L.stations.some((s) => s.opens > 1)) m.push("stations opening later");
  if (L.corridors.some((c) => c.river)) m.push("river tunnels");
  if (sp.cards) m.push("weekly card pick");
  if (sp.cars || (sp.cards && Object.values(sp.cards).some((c) => c.includes("car")))) m.push("carriages");
  if (L.corridors.some((c) => c.hill)) m.push("hills");
  if (L.corridors.some((c) => c.ferry)) m.push("ferry links");
  if (sp.snow?.length) m.push("snow weeks");
  if (L.stations.some((s) => s.hub) || sp.hubs) m.push("interchanges");
  if (L.stations.some((s) => s.market)) m.push("market day");
  if (sp.loops) m.push("loop lines");
  if (L.corridors.some((c) => c.dir)) m.push("one-way rail");
  if (sp.rush) m.push("rush-hour waves");
  if (L.stations.some((s) => s.heritage)) m.push("heritage stations");
  return m;
}

const ROLE: Record<string, string> = {
  teach: "TEACH", practise: "PRACTISE", twist: "TWIST", combine: "COMBINE", breather: "BREATHER", boss: "BOSS",
  mastery: "MASTERY (gentle send-off)", finale: "FINALE",
};

export function describeLevel(L: Level): LevelBrief {
  const sp = L.spec;
  const sol = SOLUTIONS[String(L.index + 1)];
  // Compact on purpose: the review table is cut at 160k characters, so the proof is one short sentence.
  const tally = sol ? /(\d+) delivered, goal (\d+)/.exec(sol.plan) : null;
  const proof = sol
    ? ` Proof (${sol.note?.startsWith("intended") ? "intended plan" : "solver"}, replayed): ${tally ? `${tally[1]} delivered, goal ${tally[2]}` : "wins"}` +
      (sol.stars ? `, ${sol.stars} stars` : "") +
      "." +
      (sp.trapText && sol.trap ? ` Trap: ${sp.trapText} — ${sol.trap}.` : "") +
      ""
    : "";
  // Big boards: the report's search cap prints "trap rate ?", so the full first-move sweep (scripts/fairness.ts) leads the intent.
  const fair = sol?.fair
    ? `VERIFIED FAIR (full sweep of every first move on the real engine; the report's "?" is only its search cap): ` +
      `${sol.fair.winnable === sol.fair.first ? "all" : sol.fair.winnable + " of"} ${sol.fair.first} first moves can still win, ` +
      `trap rate ${((sol.fair.first - sol.fair.winnable) / sol.fair.first).toFixed(2)}${sol.fair.fewest ? `, fewest moves to win ${sol.fair.fewest}` : ""}. `
    : "";
  // First sentence of "why" (abbreviations like "vs." or "L5." inside it don't end the sentence).
  const why = sp.why.split(/(?<!\bvs\.)(?<=[.!?])\s+(?=[A-Z])/)[0];
  void GL;
  return {
    grid: [...sp.map.map((r) => r.replace(/\s+$/, "")), "stations: " + stationTable(L).join("; "), budgetLine(L)].join("\n"),
    legend: LEGEND,
    intent: `${ROLE[sp.role]} — ${sp.name}. ${fair}Aha: ${sp.aha} Why: ${why}${proof}`,
    mechanics: mechanicsOf(L),
  };
}
