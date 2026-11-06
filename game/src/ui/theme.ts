/**
 * Design tokens. Every screen uses these — never raw colours, sizes or system
 * fonts. The builder re-skins a game by editing `palette` (from the art bible),
 * not by hard-coding styles in components.
 */
export const palette = {
  // Brand (docs/ART_DIRECTION.md: dusty teal, lavender, apricot on warm cream paper)
  primary: "#5FB3A6",
  primaryDark: "#3C8478",
  secondary: "#B8A5D9",
  secondaryDark: "#8B76B8",
  accent: "#F2A65A",
  accentDark: "#C77D32",
  danger: "#E4786B",
  dangerDark: "#B9564B",
  // Surfaces
  bgTop: "#E8F3EC",
  bgBottom: "#F6EBD9",
  surface: "#FFF9EE",
  surfaceAlt: "#F3E7D2",
  surfaceDark: "#2F4858",
  ink: "#2F4858",
  inkSoft: "#6B7A8F",
  onPrimary: "#FFFDF6",
  // Game feedback
  star: "#F7D56E",
  coin: "#F2C14E",
  success: "#7CC6A4",
  // Overcrowd rings — feathered yellow → amber, never red
  ringYellow: "#F7D56E",
  ringAmber: "#F29E4C",
  ringFull: "#E98A3A",
  gold: "#E7B743",
  paperEdge: "#E3D3B6",
  shadowInk: "#1B2238",
};

export const fonts = {
  display: "Fredoka_700Bold",
  displayMedium: "Fredoka_600SemiBold",
  body: "Nunito_700Bold",
  bodyRegular: "Nunito_600SemiBold",
};

export const radius = { sm: 12, md: 18, lg: 26, xl: 36, pill: 999 };
export const space = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28, xxl: 40 };

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 44, letterSpacing: 0.5 },
  title: { fontFamily: fonts.display, fontSize: 30 },
  heading: { fontFamily: fonts.displayMedium, fontSize: 22 },
  body: { fontFamily: fonts.body, fontSize: 16 },
  caption: { fontFamily: fonts.bodyRegular, fontSize: 13 },
  button: { fontFamily: fonts.display, fontSize: 20, letterSpacing: 0.6 },
};

/** Soft drop shadow used on cards and buttons (iOS + Android). */
export const shadow = {
  shadowColor: "#1B2238",
  shadowOpacity: 0.22,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 10,
};

/** Spring presets — use these so every animation in the game feels consistent. */
export const springs = {
  press: { damping: 14, stiffness: 320, mass: 0.6 },
  pop: { damping: 9, stiffness: 220, mass: 0.7 },
  gentle: { damping: 18, stiffness: 140, mass: 1 },
};
