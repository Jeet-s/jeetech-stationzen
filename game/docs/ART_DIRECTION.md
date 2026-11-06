# Art direction — Station Zen: Calm Metro Builder

Target: .agf/art/target.png (vs big-studio games Royal Match +1, Monument Valley -2, Homescapes +1 → net 0 (need ≥ 0)). Every screen must look like it.

## Style
Soft paper-craft diorama rendering meets Monument Valley's serene geometry and Royal Match's glossy premium polish. Everything reads as layered cut paper and matte clay: rounded chunky shapes, no hard black outlines, only gentle tonal edge shifts and a thin lighter rim-light on the top-left edge. Light is warm late-afternoon from the upper left, with soft ambient occlusion and feathered contact shadows (low-opacity indigo, never black) that give 2-4 px of stacked-paper depth. Map is a pastel top-down tabletop of rolling paper hills, rivers and parks with subtle paper grain and faint vignette; transit lines are thick, rounded, slightly satin ribbons with a soft highlight stripe and gentle drop shadow. Stations are cream enamel discs with slate rims and bold paper glyph tokens. Colour is harmonious and low-stress: dusty teal, sage, warm cream, apricot and lavender, with saturated line colours kept clean and distinct. Warnings glow in feathered yellow to amber halos, never red, never hard-edged. Mood: cosy, unhurried, tactile, like a bedtime toy train set. Shiny gold accents and soft bloom are reserved for rewards and heritage stations.

## Palette
#2F4858 #5FB3A6 #F6EBD9 #F2A65A #B8A5D9 #F7D56E

UI kit tokens (src/ui/theme.ts): {"primary":"#5FB3A6","primaryDark":"#3C8478","secondary":"#B8A5D9","secondaryDark":"#8B76B8","accent":"#F2A65A","accentDark":"#C77D32","bgTop":"#E8F3EC","bgBottom":"#F6EBD9","ink":"#2F4858"}

## Screen spec
- **background**: Pastel paper-cut tabletop map, sage and mint hills with a pale blue river and cream parks, subtle paper grain, soft vignette, light drifting cloud shadows; low contrast so lines and stations pop.
- **board**: Full-bleed zoomable map with no hard frame. Stations are cream discs with slate rims and soft shadows, each showing a paper glyph. Lines are rounded 14px ribbons in clean distinct hues with satin highlight, plus pattern overlays (dashed, dotted, double, wavy) and a shape badge at each terminus. Small chunky trains with pastel bodies glide along.
- **pieces**: Passengers are tiny rounded paper pips carrying a glyph bubble (leaf, drop, kite, lantern, moon, key, cup, star), stacking neatly beside stations. Trains are chunky rounded capsules with tiny windows and soft shadows. Heritage stations are small ornate arched badges with gold rim.
- **hud**: Slim translucent cream paper strip at top: week indicator as a small paper calendar tab on left, passenger count with pip icon in centre, pause chip on right. Bottom thumb-reach bar is a rounded cream tray holding undo, redo, 1x/2x/3x fast-forward and a booster tray, all with generous 56px+ touch targets.
- **buttons**: Chunky pill buttons with a 4px darker bottom lip, soft top highlight gradient and gentle inner glow. Primary is teal, secondary lavender, reward/CTA apricot. Icons are rounded glyphs in cream. Press state sinks 3px with a soft squash.
- **typography**: Rounded friendly geometric sans (Nunito or Baloo style), heavy weight for titles and numerals, medium for body. Slate ink #2F4858 on cream, cream on coloured plates with a faint darker drop shadow. Generous letterspacing, no all-caps shouting.
- **popups**: Cream paper cards with rounded 28px corners, a folded paper-tab header ribbon, soft layered shadow and a dimmed indigo-tinted backdrop. Weekly cards fan out as 2-3 tall paper cards with a glyph illustration and preview hold hint. Last Call banner is a soft amber ribbon sliding from the top with a Breather button.
- **fx**: Feathered yellow to amber overcrowd glow rings with slow breathing, gentle chime ripple, paper-confetti and gold sparkle on star awards, soft dust puffs when stations spawn, a faint shimmer trail behind trains. No red flashes, no screen shake.
- **motion**: Slow, eased and springy: stations pop in with a soft overshoot scale, lines draw with a trailing ease, trains glide at constant calm pace, UI slides 250-350ms ease-out. Pause tints the screen cool lavender with a gentle fade. All motion respects reduce-motion, which swaps to simple fades.

## Assets (assets/art, indexed in src/art.ts)
- `bg_city_meadow` (background, 1080x1920): Chapter 1 gameplay and home map background
- `bg_city_harbor` (background, 1080x1920): Chapter 2 background
- `bg_city_dusk` (background, 1080x1920): Chapter 3 and pause tint background
- `station_normal` (sprite, 501x512): Standard station marker
- `station_interchange` (sprite, 512x407): Interchange station marker
- `station_heritage` (sprite, 439x512): Heritage station marker
- `glyph_tokens` (sprite, 512x286): Passenger demand glyph tokens
- `train_capsule` (sprite, 512x432): Train on lines
- `passenger_pip` (sprite, 328x512): Waiting passenger
- `line_ribbon_tile` (sprite, 512x184): Metro line segment tile
- `fx_overcrowd_glow` (fx, 512x493): Overcrowd warning ring
- `fx_sparkle_confetti` (fx, 512x453): Reward and star burst
- `hud_panel` (ui, 512x434): Top HUD strip and popup card plate
- `button_primary` (ui, 512x278): Primary and secondary button plate
- `icon_star_reward` (ui, 512x488): Star and reward icon
- `hero_pip_cat` (character, 470x512): Title screen hero key art
- `logo` (ui, 900x411): the game logo — title/home screen and anywhere the name appears
