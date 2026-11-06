import { useState } from "react";
import { HomeScreen } from "./screens/HomeScreen";
import { LevelsScreen } from "./screens/LevelsScreen";
import { GameScreen } from "./screens/GameScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { GardenScreen } from "./screens/GardenScreen";
import { DuelResult } from "./screens/DuelScreen";
import { store } from "./modules/store";

/**
 * Screenshot mode: the factory opens the app with <scheme>://shot/<id> on an emulator and captures the screen for
 * the store listing. Every scene renders the REAL screens in a real state: levels are set up by playing the first
 * steps of their stored winning plan through the engine (GameScreen `demo`). Ads are off here.
 */
const noop = () => {};

export function ScreenshotScene({ id }: { id: string }) {
  // A player who has made good progress (stars, tokens) — not an empty profile.
  useState(() => {
    const stars: Record<string, number> = {};
    for (let n = 1; n < 62; n++) stars[String(n)] = n % 5 === 0 ? 2 : 3;
    store.set({ level: id === "home" ? 14 : 62, coins: 1840, stars, tutorialDone: true, hints: 3, breathers: 2, garden: ["halt", "leaf", "rider1", "drop", "tram", "hub", "moon", "hall", "kite"], daily: { last: "", streak: 0, best: 9, freezes: 1, freezeWeek: 0 }, tips: ["transfer", "opens", "rings", "tunnel", "card", "car", "hill", "ferry", "snow", "hub", "market", "loop", "oneway", "rush", "heritage"], run: null });
    return true;
  });
  switch (id) {
    case "home":
      return <HomeScreen onPlay={noop} onLevels={noop} onShop={noop} onSettings={noop} onDaily={noop} onOnline={noop} onGarden={noop} onMastery={noop} onSeason={noop} onReplay={noop} />;
    case "duel-result":
      return (
        <>
          <GameScreen levelNumber={30} onExit={noop} onSettings={noop} onNextLevel={noop} demo={{ steps: 4 }} />
          <DuelResult
            visible ended={{ result: "win", tokens: 40, rating: 140 }} myName="You" rivalName="Signal Wren" mine={112} rival={97} bot
            onEmote={noop} emote={{ e: "gg", mine: false, n: 1 }} muted={false} onMute={noop} onRematch={noop} onExit={noop}
          />
        </>
      );
    case "garden":
      return <GardenScreen onBack={noop} />;
    case "map":
      return <LevelsScreen onPlay={noop} onBack={noop} onMastery={noop} />;
    case "solve":
      return <GameScreen levelNumber={54} onExit={noop} onSettings={noop} onNextLevel={noop} demo={{ steps: 9 }} />;
    case "card":
      return <GameScreen levelNumber={46} onExit={noop} onSettings={noop} onNextLevel={noop} demo={{ steps: 6 }} />;
    case "plan":
      return <GameScreen levelNumber={58} onExit={noop} onSettings={noop} onNextLevel={noop} demo={{ steps: 5, station: "busiest" }} />;
    case "win":
      return <GameScreen levelNumber={59} onExit={noop} onSettings={noop} onNextLevel={noop} demo={{ steps: 99, win: true }} />;
    case "shop":
    default:
      return (
        <>
          <HomeScreen onPlay={noop} onLevels={noop} onShop={noop} onSettings={noop} onDaily={noop} onOnline={noop} onGarden={noop} onMastery={noop} onSeason={noop} onReplay={noop} />
          <ShopScreen visible onClose={noop} />
        </>
      );
  }
}
