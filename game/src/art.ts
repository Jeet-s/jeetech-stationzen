/** Game art (assets/art/manifest.json: kind/usage/size; "legacy" ids are the previous art). Use with expo Image or Skia useImage. */
export const art = {
  bg_city_meadow: require("../assets/art/bg_city_meadow.png"),
  bg_city_harbor: require("../assets/art/bg_city_harbor.png"),
  bg_city_dusk: require("../assets/art/bg_city_dusk.png"),
  station_normal: require("../assets/art/station_normal.png"),
  station_interchange: require("../assets/art/station_interchange.png"),
  station_heritage: require("../assets/art/station_heritage.png"),
  glyph_tokens: require("../assets/art/glyph_tokens.png"),
  train_capsule: require("../assets/art/train_capsule.png"),
  passenger_pip: require("../assets/art/passenger_pip.png"),
  line_ribbon_tile: require("../assets/art/line_ribbon_tile.png"),
  fx_overcrowd_glow: require("../assets/art/fx_overcrowd_glow.png"),
  fx_sparkle_confetti: require("../assets/art/fx_sparkle_confetti.png"),
  hud_panel: require("../assets/art/hud_panel.png"),
  button_primary: require("../assets/art/button_primary.png"),
  icon_star_reward: require("../assets/art/icon_star_reward.png"),
  hero_pip_cat: require("../assets/art/hero_pip_cat.png"),
  logo: require("../assets/art/logo.png"),
} as const;
export type ArtId = keyof typeof art;
