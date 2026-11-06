/** Baked UI art (scripts/art/bake.py → assets/game): full glyph tokens and cream UI icons as bundled PNGs. */
import type { ImageSourcePropType } from "react-native";

export const GLYPH_IMG: ImageSourcePropType[] = [
  require("../assets/game/glyph_leaf.png"),
  require("../assets/game/glyph_drop.png"),
  require("../assets/game/glyph_kite.png"),
  require("../assets/game/glyph_lantern.png"),
  require("../assets/game/glyph_moon.png"),
  require("../assets/game/glyph_key.png"),
  require("../assets/game/glyph_cup.png"),
  require("../assets/game/glyph_star.png"),
];

/** Soft currency: Tokens. */
export const TOKEN = require("../assets/game/token.png");

export const ICON = {
  play: require("../assets/game/icon_play.png"),
  undo: require("../assets/game/icon_undo.png"),
  redo: require("../assets/game/icon_redo.png"),
  restart: require("../assets/game/icon_restart.png"),
  gear: require("../assets/game/icon_gear.png"),
  cart: require("../assets/game/icon_cart.png"),
  map: require("../assets/game/icon_map.png"),
  home: require("../assets/game/icon_home.png"),
  bulb: require("../assets/game/icon_bulb.png"),
  close: require("../assets/game/icon_close.png"),
  back: require("../assets/game/icon_back.png"),
  cloud: require("../assets/game/icon_cloud.png"),
  track: require("../assets/game/icon_track.png"),
  line: require("../assets/game/icon_line.png"),
  tunnel: require("../assets/game/icon_tunnel.png"),
  carriage: require("../assets/game/icon_carriage.png"),
  hub: require("../assets/game/icon_hub.png"),
  lock: require("../assets/game/icon_lock.png"),
  pip: require("../assets/game/icon_pip.png"),
  calendar: require("../assets/game/icon_calendar.png"),
  share: require("../assets/game/icon_share.png"),
  duel: require("../assets/game/icon_duel.png"),
  trophy: require("../assets/game/icon_trophy.png"),
  garden: require("../assets/game/icon_garden.png"),
  flame: require("../assets/game/icon_flame.png"),
  people: require("../assets/game/icon_people.png"),
} as const;
export type IconName = keyof typeof ICON;
