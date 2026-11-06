# Level-design brief — Station Zen (calm metro puzzle)

You are a lead level designer at a top mobile puzzle studio. You hand-design levels for ONE OR MORE CITIES (chapters)
of Station Zen. Read first:
- docs/LEVELS.md (rules, chapter plan, 12-slot arc, pacing)
- src/game/engine.ts (the rules — the header comment and LevelSpec)
- src/game/chapters/c1-willowmere.ts — the finished exemplar city (12 levels). Copy its style: name, role, aha, why,
  map, st, budget, star3, trap, trapText.

You write ONLY your own chapter file(s) in src/game/chapters/ (the `levels: []` array). Never edit any other file
(engine, sim, scripts, other chapters, tuning.json, solutions.json) — other designers work in parallel.

## Level data (LevelSpec)
- `map`: ASCII board. Stations = capital letters at EVEN column and EVEN row (0-based char positions). Corridors sit
  between them: `-` horizontal, `|` vertical, `\` `/` diagonals, `x` both diagonals crossing (diagonals sit at odd/odd
  positions). A straight run of corridor chars across an empty lattice point is one longer corridor ("A---B" = 2
  hops). `~` river crossing (uses a tunnel; straight corridors only), `h` hill (+1 hop each), `=` ferry (+1 hop; a
  line using it carries ≤ 12 riders/week per carriage set), `> < v ^` one-way (that line only runs as a loop
  following the arrows; loops need `loops: true`). Scenery: `,` water, `.` ground, space. Max 11 chars wide
  (6 stations across), max 13 rows (7 stations tall) — it's a portrait phone.
- `st`: per station "G[flags] demand": G = glyph letter (L leaf, D drop, K kite, N lantern, M moon, Y key, C cup,
  S star); flags `@3` opens in week 3 (shown as a construction site from the start), `!` heritage (may never be full),
  `#` interchange (holds 24), `*4` market day in week 4 (3x demand); demand "2D 1S" = 2 riders a week who want a Drop
  and 1 who wants a Star. A station never wants its own glyph; every wanted glyph must exist on the map.
- `weeks`, `tracks` (granted at the start of week 1, 2, …), `lines`, optional `tunnels`, `cars` (carriages),
  `hubs` (interchange upgrades the player places), `cards` ({ week: ["line","tracks","tunnel","car","hub","calm"] }
  2-3 options, pick one), `snow` (weeks with half seats), `rush` ({ week: multiplier }), `loops: true` (Ringvale on),
  `goal` (share of all riders to deliver; the tuner will move it, design around 0.85), `star3`
  ({k:"amber"} | {k:"spare",n} | {k:"lines",n} | {k:"loop"} | {k:"clear"}), `noFail` (only tutorial levels).
- `trap` + `trapText`: the TEMPTING WRONG PLAN the level is built around, in readable form: ["1:ABC DEF", "3:ABCG"]
  = in week 1's planning the lines are A-B-C and D-E-F; in week 3 line A-B-C is extended to G. Tokens: a line's stops
  in order ("ABCDo" = closed loop, "ABC+1" = with one carriage), "k1" = pick card option 1, "xB" = interchange at B.
  The tools prove the trap LOSES. Every level except teach levels needs one.
- `aha`: the specific insight, naming stations/glyphs, and it MUST match the solver's winning plan (check the solve
  output) — a reviewer reads both. `why`: why the level sits here (role in the city arc).

## Engine facts you must design with
- Line seats/week = floor(6 × (1+carriages) × 36 / (2 × hops)) (loops: / hops): 1 hop 108, 2 hops 54, 3 → 36,
  4 → 27, 5 → 21, 6 → 18, 7 → 15, 8 → 13. Riders on a route share every line they ride (transfers load both lines).
- Station full at 12 queued (24 interchange); full at the end of 2 weeks in a row → run lost. Heritage: lost at once.
- Each week: riders appear (station demand; ×3 market week; × rush), ride if a seat exists, the rest queue.
- "Run" keeps going week after week until an event (station opens, tracks/card arrive, weather changes) or a ring
  rises a stage. Unused tracks carry over. Edits made in a week can be undone before Run; after Run they're built.
- Bots: casual = 30% random moves, otherwise greedy on progress (delivered share + share of demand the network
  carries − ring pressure); skilled = 8% random. They can't see the future: a station opening later, a snow week, a
  river they'll need a tunnel for — that's where good players beat them.

## Design rules (the studio's level-design review is strict)
- Every level has ONE clear idea (aha) that is TRUE: the trap plan loses, the solver's plan matches the aha.
- No filler, no repeats: each board is a new shape and a new idea. Size the board to the puzzle (no dead corners).
  No level solvable without thinking after slot 1.
- Fair: everything is visible (later stations are shown). No single hidden fatal move.
- City arc (slots 1-12): teach, practise, twist, combine, practise/combine, boss, breather, combine, twist, combine,
  boss (Rush Hour Festival — the city finale), mastery (gentle). The new rule appears ALONE on slot 1's small board.
  Later cities keep using earlier rules (combine), the last city uses all of them.
- Glyphs: city 1 uses L D K S M; city 2 adds N; city 3 adds C; city 4 adds Y; later all 8. Keep boards readable:
  3-5 glyphs per level, 1-3 wants per station.
- SIZE BUDGET (the factory's solver must settle the levels in time): ≤ 10 stations, ≤ 14 corridors, ≤ 9 tracks
  total, ≤ 3 lines, ≤ 8 weeks. Check `expl` in rate.ts: most levels < 25k states; at most 3 levels per city may show
  ">cap" (bosses/finales). Diagonal meshes explode the search — use few diagonals.
- PACING: rate.ts prints each level's target casual first-try win rate. Use SCAN mode: at some goal between 0.70
  and 0.95 the casual rate should land within ±0.08 of the target, and skilled should be ≥ 0.55 (and ideally
  ≤ 0.95). If casual is too high at every goal, the board is too easy (more demand, fewer spare tracks, a sharper
  trap); if too low at every goal, ease it (less demand, a spare track). Don't pick the goal yourself beyond a sensible
  0.8-0.9 — the tuner sets it later.

## Tools (run ONE at a time — the machine is shared; never run in the background; use TRIALS=100)
Address your levels as "<city>.<slot>", e.g. 4.7 = city 4 level 7.
- `TRIALS=100 RATE_CAP=40000 npx tsx scripts/rate.ts 4.1 4.2` — BFS optimal moves, states explored (expl), start
  choices (br), bot win rates (skilled/casual/careless), the BFS winning moves.
- `SCAN=1 TRIALS=100 npx tsx scripts/rate.ts 4.5` — casual/skilled at goals 0.7…0.95 (tunability).
- `DRY=1 npx tsx scripts/solve.ts 4.1 4.2 …` — solves (BFS, else guided search), prints the final lines, and proves
  the trap loses ("trap loses: …"); prints WARNING if a trap wins or a level is unsolvable. NEVER run without DRY=1.
- `npx tsx scripts/replay.ts 4.3 nAB e0tC g …` — step through moves, see line capacities and queues each week.
- `npx tsc --noEmit` must pass for your file.

## Deliverable
Your chapter file(s) with 12 finished levels each: all solvable (DRY solve OK), all traps lose, sizes in budget,
SCAN brackets the target. Finish with a short report: per level the solver's plan, trap result, expl, and the
SCAN row you'd tune toward; any engine behaviour that surprised you (don't change the engine).

## ENGINE / BOT CHANGES AFTER THE FIRST PASS (2026-11-05) — design against these
- Crowding: an overloaded line no longer loses riders to per-group rounding. Its effective seats are
  floor(seats × √(seats / riders)) when riders > seats, shared fairly (largest remainder: every effective seat is used).
- Bots: progress now also credits ROOMY trains (seats ÷ riders up to 3×), so greedy players prefer short/split lines
  when it's a tie; weekly cards are all worth the same to them and they judge a card by its best immediate use on the
  map (one-step lookahead right after the pick); undo is limited to 3 per week; a week survived counts as progress.
- The tuner (scripts/tune-levels.ts) now sets each level's goal AND a demand scale (0.7-1.4) — you only design the
  board. It keeps the trap losing (goal floor = trap's delivered + 1) and checks solvability.
- Fairness: a wrong CARD pick should not alone doom a level unless that card choice IS the level's idea.
- Casual rate measured at the tuned goal is printed by `TRIALS=150 npx tsx scripts/rate.ts` (no SCAN needed to see
  the current state). `npx tsx scripts/trace.ts <lvl>` shows the greedy bot's game move by move with its top choices
  — use it to see WHY bots lose.

## ROUND 2 (after the first lead-designer review, 6.5/10) — new rules
- Every level now carries `plan`: the INTENDED winning plan in the trap's readable form (["1:ABC DEF", "3:ABCG"],
  "ABCDo" loop, "+1" carriage, "k1" card, "xB" interchange). `DRY=1 npx tsx scripts/solve.ts` replays it; it must
  print "plan" (not "opt"/"roll") and no WARNING. The aha text must describe exactly this plan. The reviewer sees the
  plan's final lines next to the aha, plus the trap result.
- The tuner caps the goal at 0.92 (razor-thin "deliver 412 of 420" goals read as unfair) and raises demand (scale
  up to 1.4) instead. So design hard levels with ENOUGH riders that the target is reachable at goal ≤ 0.92.
  The tuner also requires the intended plan to win at the tuned goal/scale.
- The reviewer's standing complaints to design against: (1) repeated answers inside a city ("split the line so each
  half has seats" over and over; "close the ring + carriage" with the same 3/2 demand tables) — each city needs 3+
  distinct ideas, and demand tables must vary (asymmetric, heavy pairs, one-way flows); (2) skilled ≈ casual on a
  level reads as guessing — the level's key choice must be READABLE from the board (bots that weigh coverage, seats
  and roomy trains should beat random play clearly); (3) kitchen-sink bosses with 8+ mechanics — a boss is one
  sharp idea under pressure plus at most 2 earlier rules; (4) intent text that doesn't match the proof;
  (5) the "take the card that looks right" trap reused too often — at most 3 card-decision levels per 3 cities.
