# Three new areas: Snowville, the Treehouse village, the Jungle lodge (DRAFT design plan)

Status: **DRAFT for the owner (2026-11-27). Docs only; nothing here is built and no code was changed.** One file holds all three short designs, the shared decisions and the milestone tables, in the shape of `2026-11-26-reef.md`, `2026-11-26-crystal-cave.md`, `2026-11-26-greenhouse-remaining.md` and `2026-11-27-reef-wave2.md` (the recipe: flag, pure plan file, lazy chunk, staged background-loaded wings, teleport gate with its own return arch, repeat job, album, found outfit, golden mice).
Gate rules: `docs/superpowers/specs/2026-11-23-teleport-gates-design.md` (the gate design; the plan beside it is `plans/2026-11-23-teleport-gates.md`).
Every number marked "start" is a first guess the builder tunes from pictures. Every code fact below carries a file:line from `main` at 36990b4c; anything I could not find is marked **not verified** or **not in the tree**. Names (Tilly, Nutmeg, Mossy, and the places' people) are placeholders; the daughter may name them, as with Marlo and Lumi.
Owner rules in force (memory, 2026-11-26): milestones merge behind the area's flag on automatic checks, the owner looks once per area at a release-candidate pass, budgets are measured then set, start-up may rise up to 5 kB per area (reported), Sonnet builds and Haiku checks, at most three builders at once, one full suite at a time on the rebased branch before every merge.

## 0. What was read, and what it means for all three

- **A gate pair is a catalog row plus two `TELE_ENDS` rows.** The shape is in `src/teleport.js:88-131` (Crystal at `:114-123`), the look names at `:48` (`'stonering', 'archway', 'hollow', 'cleft', 'grotto', 'hatch'`), the look table at `:64`, the walk counts at `:25-31`, the names at `:134`. The catalog row is `{ name, price: 0, requires: { area, walks: 2 }, gate: 'tele' }` (`src/progression.js:420-429`, Crystal's at `:429`); no `edition` key means both editions.
- **The pair cap is a trap.** `TELE_PAIR_CAP = 6` (`src/teleport.js:22`), asserted by `test/teleport.test.js:76`. Four pairs stand today (Greenhouse, Moon, Reef, Crystal). Three more makes **seven**. The cap must be raised in the seams milestone (or a gate hub designed; the gate spec says "beyond 6, a gate garden", `specs/2026-11-23-teleport-gates-design.md:209-210`). **Needs the owner (see Open question O1).**
- **Hosts must exist in both editions.** The Woods, River, Moor and Pines are Clan-only (`src/progression.js:439-442`) and so is the Market (`:401`). The Moon's gate was moved to the Park for that reason (`src/teleport.js:91-93`). All three hosts below are in both editions (Farm `:384`, Park `:376`, Greenhouse `:423`).
- **Gold mice.** `GOLD_TOTAL = KNOWN_GOLD.size`, 62 today (`src/goldmice.js:238`); the Crystal/Moon wave 2 plan raises it to **65 Clan / 41 everyday** (`plans/2026-11-27-crystal-moon-wave2.md`, decision 3). Each area here adds **+3 in both editions**: 68/44, 71/47, 74/50 in build order. `GOLD_MAX_COUNT` is **72** (`src/progression.js:133`), so the third area overflows it: **raise it to 80 in the seams milestone**, or a valid third area's mice are dropped from a save by the sanitiser. Golden id shape: `^gm-[a-z]{1,24}-[1-9]$` (`:126`).
- **Journal ids.** `JOURNAL_TYPES` (`src/progression.js:72-112`) ends at `'rfdivers', 'rfvessel', 'rfwhaleshark'`. Prefixes taken: bird/squirrel/... farm (`job`, `find`), `ride`, `game`, `fair`, `roof`, `market`, `lh`, `mn`, `ml`, `gh`, `rf`, `cc`, `cl`, plus the wave-2 plan's `cc*`/`mn*` additions. I grepped the list: **nothing begins `sv`, `sw`, `th`, `tl`, `jl` or `jw`.** Chosen: **Snowville `sv` (finds and activities) and `sw` (life); Treehouse `th` and `tl`; Jungle `jl` and `jw`.** The builder re-greps at seams time (other branches may reserve ids first).
- **Movement facts.** Baseline hop 1.6 m, reach 2.6 high / 1.2 low (`src/climbing.js:28-31`); perch kinds include `'tree'` (`:73-75`); `TREE_FORK_MAX` 1.9 (`:139`); a fence can be run along (`:266`). The walk's camera already pulls in under a finite `ground.ceil` (`src/player.js:698-702, 718-721`); the Reef and Crystal use `ceil: () => Infinity` instead (`src/world/crystalplan.js:77`) and the Crystal's hard rules (no real `ceil`, walls far out, one PointLight) are at `src/world/crystal.js:6`. Zoom caps live in one table (`src/camzoom.js:54-59`, `crystal: 2`).
- **Weather.** `rollWeather` returns only `clear`, `rain` or `sunset` (`src/weather.js:33-37`); a rain schedule with a rainbow exists (`:61-68`); `setSheltered(on)` hides the rain column under cover (`:597-600`, used by the Gorge, `src/gorgelife.js:44-50`). **Snow is not in the tree.** `evening: true` is the walk's one switch for "no weather" (`src/world/crystal.js:78-79`).
- **Paw prints.** One `InstancedMesh`, one draw, a fixed ring that overwrites the oldest print, shape in the fragment shader (`src/render/pawprints.js:7-26`). Snowville re-uses it (spike S1), so footprints cost no new draw.
- **Rides.** `src/world/reefride.js` is free roaming with depth (`:27-33`). The pure path sim `src/world/pathride.js` (boat, cart, sled, `SPECS`, `createPathRide`, `stepPath`, `withStops`, `hopOffSpot`) is **on branch `p1-pathride` (2015ef31, merged into `int17`), not yet on `main`**; I read it with `git show p1-pathride:src/world/pathride.js:1-30, 157-160`.
- **Staged chunks and budgets.** Start-up ceiling `MAIN_GZIP_CEILING_KB = 720` (`scripts/buildjson.mjs:35`); per-place ceiling 100 kB (`:51`); the Reef's staging table (`:109-117`: stage ceiling 65, total 150) is the model; loaders at `src/world/areas.js:65-69` (Moon, Reef, Crystal), entry-module table at `:99-101`. Budget-row pattern `['reef', buildReef, 25, 2, 46200]` and `['crystal', buildCrystal, 13, 2, 22200]` (`test/budget.test.js:547, 556`). Start-up measured at 656.8 kB gz after the Crystal Cave (memory note, 2026-11-26): about 63 kB of headroom, so start-up is not the constraint it was when the Reef plan was written.
- **Arrival card, guide, errand.** `src/world/arrivalcard.js:1-12` (shared; three lines, OK button, 20 s); a place's `*intro.js` chooses the lines (`src/world/crystalintro.js:1-12`); the written guide is `src/world/crystalguide.js:1-12` (pure, same goal as the meow ring); the daily errand pays 25 paws once a walk and one album bit (`src/world/crystalerrandlive.js:3-5`; `AWARDS` `reefjob: 25`, `moonjob: 25`, `cavejob: 25`, `crystalstory: 40`, `reeffind: 12` at `src/discoveries.js:45-58`).
- **Music.** Themes are pure data in `src/musicthemes.js:25-45` (`THEMES`, one row per area id, `t({ voice, scale, root, beat, len, n, ... })` at `:19`), voices at `:47-58`.
- **Date windows.** The only date window in the tree is the birthday: a hard-coded end time (`src/birthday.js:28`) read by `birthdayActive` (`:60-68`), with a local-day helper (`:76-79`). Everything else is seasonless. This is what a winter window would copy, and what it would cost.

## 1. Snowville (the winter village)

### 1.1 For a parent

**Snowville is a small, cosy mountain village in the snow.** The cat steps through a snow-capped lantern arch at the back of the Farm and finds a village square under soft falling flakes: wooden cottages with smoking chimneys, a frozen pond with a few skating animals, a gentle sled hill, and strings of unlit lanterns. Her paws leave **footprints in the snow** that slowly fill in, and when she has been out in the open for a while her **cheeks go rosy and she puffs little clouds**; a cottage hearth, a stove or a cup of cocoa at a stall makes her cheeks warm again. That is all it does (no meter, no penalty, nothing ever stops her). A young snow hare, **Tilly** (placeholder), is the lamplighter's apprentice and wants the three village lanterns lit before **Lantern Night**. The cat carries three small candles to three lanterns, then the whole village lights up in a 20-second glow that everyone in a room sees together. Nobody can fail, nothing is timed, and the place is the same whenever you visit. Six discoveries, three golden mice, a found scarf, and Tilly's daily errand. Both editions.

### 1.2 Core experience

- **Walk in snow:** footprints that stay a while, soft flakes, quiet bells; cheeks that go pink and warm up at hearths (a cosy theme, not a gauge).
- **Carry three candles to three lanterns** (the Reef's and the Cave's carry-and-return, no new puzzle type) across the square, the pond edge and the sled hill.
- **Lantern Night:** one shared glow show, then a warm place to come back to (errand, album of twelve snow-globe postcards, an optional sled run).

### 1.3 Story ("Tilly's Lantern Night"), seven steps in three chapters

| # | Chapter | Step |
|---|---|---|
| 1 | 1 Square | **Meet Tilly** by the gate arch; her cheeks are pink; she shows a picture of a lit lantern (interact). |
| 2 | 1 | **Candle one** (a glint in the baker's window box): carry it to the **Square lantern**; it lights (carry, walk). |
| 3 | 2 Pond and hill (stage B) | **Candle two** on a pond-side stump, carried to the **Pond lantern** by the skating otters. |
| 4 | 2 | **Candle three** at the top of the sled hill (a short perch climb, existing hops), carried down to the **Hill lantern**. |
| 5 | 2 | **Warm up.** Tilly leads the cat to the village hearth; the lanterns' strings glow along the lane (this is where the cheeks theme teaches itself, once). |
| 6 | 3 Lantern Night | **The glow:** every lantern, window and the great fir light in turn (pure function of one start time, 20 s, room clock like `reefparade.paradeAt`; copy `crystalshow.showAt`, per `2026-11-27-reef-wave2.md` decision 7). |
| 7 | 3 | `snowstory` pays once (40 paws); Tilly gives the **Snowflake Scarf**'s clasp. |

Carry rule: copy `reefmission.js` (item in the mouth, never saved, returns to its spot when the walk ends, `carrying` walk-only; `plans/2026-11-26-crystal-cave.md` §8 answer 4). Progress is saved by step. Meow calls Tilly and shows a ring of sparkles to the goal (no text, no fail). Chapter 3 is the part a first release can trim without hiding anything.

### 1.4 Place, size, zones

Bounds start `{ minX -40, maxX 40, minZ -36, maxZ 36 }` = **80 x 72 m** (5,760 m2: between the Lighthouse and the Fairground's 8,272), one smooth ground function with a gentle bank for the sled hill (heights up to 3 m, slopes under 0.5). Open sky, **no `ceil`**, soft snow-haze fog drawn out to 120 m.

| Zone | Where (start) | What |
|---|---|---|
| Gate court (spawn) | (0, 30) | the return arch (`own`), a lantern post, Tilly, the first hearth (a warm-up spot) |
| Village square | (-4, 8) | cottages, bakery stall (cocoa), the Square lantern, a fir tree, the postcard board |
| Pond | (-24, -10) | frozen pond with skating otters and a stump; the Pond lantern |
| Sled hill | (22, -18) | the Hill lantern at the foot, a candle at the top; the sled run (S7, stage C) |
| Skate and fir wood | (0, -26) | open snow, a snow-hare burrow (find), the Great Fir (find) |

### 1.5 How it is reached

A **`archway` gate at Appletree Farm** (look reused, no new look name: the lantern arch with a snow cap; `src/teleport.js:48, 64`), awake after two Farm walks (`SNOWVILLE_NEED_WALKS = 2` beside `:25-31`), `edition: 'all'`, `placement: 'inside'`, explicit `arrive: arriveFor(...)`, price 0. Catalog row `snowville: { name: 'Snowville', price: 0, requires: { area: 'farm', walks: 2 }, gate: 'tele' }` after `crystal` (`src/progression.js:429`). The twin row in `TELE_ENDS.snowville` is the Snowville **own return arch** (`own: true`, drawn by Snowville, like the Cave's `:119-122`). The spot is chosen by the builder with the gate's clear-of-colliders test (`test/teleport.test.js`, pattern in `src/teleport.js:79-83`). The Farm is the host because it has headroom (`['farm', buildFarm, 280, 210, 62000]` with 176 / 119 measured, `test/budget.test.js:429, 600`) and the Fairground does not (95.8 of 100 kB and 74,278 of 75,000 triangles, memory note whisker-walk-fair-backlog). A map circle and place card as in the Greenhouse's G4 (`2026-11-26-greenhouse-remaining.md`, advisor answer 1).

### 1.6 Movement and camera

- No new movement mechanic, **no `placephysics` row** (the Cave's choice, `plans/2026-11-26-crystal-cave.md` D4): she walks in snow at her normal pace. **Snow footprints:** the paw-print ring (`src/render/pawprints.js:7-26`) gets an area tint (white-blue), a wider spacing and a longer fade (start: 30 s) read from the place's row; **spike S1** in the world milestone checks that this stays one draw call and leaves every other area's prints byte-identical. **Cold-cheeks warm-up (theme only):** a per-walk `warmth` value rises when she is out in the open and drops by the hearths; it drives the cat's cheek tint (pink), a breath puff (a few `Points`) and a soft line once ("Brrr! Warm up by the fire?"). It is never saved, never gates anything, has no number on screen and no end state; a property test shows no path to a "failure".
- **Camera:** open sky, so the chase camera as is; zoom full range; the hill's camera clamp follows the ground (`src/player.js:698-702`). Chimneys and fir branches are drawn below nothing she walks under.
- **Snow itself:** a falling-flake `Points` layer owned by the place (60 flakes, 20 in reduced motion, like the Reef's bubbles in `2026-11-26-reef.md` R4), not a new weather kind (`rollWeather` has only three, `src/weather.js:33-37`). Weather, strays, critters, ghosts, rivals, the yard dog, daily goals and clan cats are off (the Reef/Cave R0/C0 rule; the Cave does it with `evening: true, strays: false`, `src/world/crystal.js:78-81`).

### 1.7 Life, photo and journal pages

Life (`snowlife.js`, soft): skating otters, a shy snow hare, a robin on the lantern post, chimney smoke, a snowman that gains a scarf when the story is done (a photo spot), a sleeping fox kit by the hearth. Sound: bells, crunch (silent when muted). **Journal (prefix `sv`, life `sw`):** six discoveries `svlantern` (the hill lantern), `svpond`, `svhare`, `svfir` (Great Fir), `svsnowman`, `svhearth`; six activity pages `svcandles`, `svnight` (the glow), `svsled`, `svalbum`, `sverrand`, `svprints` (footprint photo); life pages `swotter`, `swrobin`, `swfox`, `swowl`, `swdeer`. Ids and names in a start-up `snowvillepages.js`, hints in a lazy `snowvillewords.js` (both word sets, banned-word scan below).

### 1.8 Gold mice (+3)

`gm-snowville-1` on the snow behind the bakery, `gm-snowville-2` in the pond-side stump hollow (ground reach), `gm-snowville-3` on the sled-hill rock (one existing hop). Not in `KEEP_OUT` (that would reshuffle scatter, `2026-11-27-reef-wave2.md` decision 3). Totals and the ~17 pinned test files move in the **seams** commit as stubs (Reef R0 did the same).

### 1.9 Music, guide, arrival card

`THEMES.snowville` in `src/musicthemes.js` near `:25-45`: a slow bell-and-pad theme, e.g. `t({ voice: 'bell', scale: PENT, reg: 12, beat: 0.7, len: 16, n: [2, 4], up: 0.1, pad: { g: 0.014, swell: 1, chords: FIFTH } })` (start; tuned by ear). Written guide `snowvilleguide.js` (pure, the Cave's `crystalguide.js` model: goal, chip, compass word). Arrival card `snowvilleintro.js`: three lines until Tilly says hello, accent a soft ice blue (`createArrivalCard`, `src/world/arrivalcard.js:11`; the Cave's is `crystalintro.js:7-12`).

### 1.10 Found outfit

**Snowflake Scarf** (neck; the neck slot exists, `src/foundwear/neck.js`), four hand-placed spots (a drift by the arch, the skating pond's far bank, the hill's rock, the Great Fir's foot), one a walk, both editions, in `src/foundwear/spots/snowville.js` registered at `src/foundwear/spots/index.js:43`. Place all four spots at once (adding later changes the find key; `2026-11-27-reef-wave2.md` decision 6). The story's clasp is the accessory prize, added like the Crystal circlet (`crystal-moon-wave2.md` decision 1).

### 1.11 Replay

**Tilly's errand of the day** (25 paws once a walk, `AWARDS.snowjob`, from the room seed so a co-walk shares it): (1) fetch three pinecones, (2) follow the otter's slide, (3) find the snowman's missing button, (4) carry a warm cup to the robin, (5) pull the lantern string to the hill, (6) sled once down the run. Each pays a **snow-globe postcard** into an album of twelve (`state.snowville.album`). After the story only, as in `crystalerrandlive.js:3-5`.

### 1.12 Save

`state.snowville = { step, candles, album }`: step 0 to 7, candles 3 bits (never fewer than the step implies, a table like `CRYSTAL_SPARKS_AT`, `src/progression.js:944`), album 12 bits. Sanitiser `sanitizeSnowville` next to `sanitizeCrystal` (`:945-949`); `MERGE_RULES.snowville` max / OR / OR (`src/catmerge.js:188-190`); `BASE_WANTED.snowville: 1` (`:273-277`); default row near `src/progression.js:586-588`; `walks.snowville: 0` (`:555`). **Both the sanitiser and the merge rule name every key on day one** (`2026-11-27-reef-wave2.md` facts). `SAVE_VERSION` stays 4. Warmth and the sled run are never saved.

### 1.13 Flag and release

`snowvilleflag.js` copying `crystalflag.js:1-30`: `?snowville=0` turns it off, `?snowville=1` is the solo shortcut, default ON in a browser. Not offered to a child until its gate row (S6) merges, and then `gate: 'tele'` hides it while the gates switch is off.

### 1.14 Budget (planning only; measured then set)

Stage A (square, gate court, Tilly, candles one, footprints) about 28 kB gz and 25,000 triangles; stage B (pond, hill, lantern night) about 22 kB; stage C (sled run, `pathride`) about 8 kB. Total about 58 kB, under the 100 kB guard even unstaged, but **staged anyway** (`snowvillestages.js`, an entry-module table beside `scripts/buildjson.mjs:109-117`, stage ceiling 65 / total 150) so the first walk is small and B and C load in the background. Row `['snowville', buildSnowville, a, b, c]` at measured +12 percent (`test/budget.test.js:547` pattern). Farm re-measured after the gate (gate allowance only: 3 meshes, about 400 triangles). Start-up growth expected under 1 kB, reported.

### 1.15 Milestones

| M | What | Size |
|---|---|---|
| **V0 Seams** (see section 5, N0) | flag, `state.snowville`, `walks`, ids, awards, gold stubs, `TELE` constants, stage slots, stub `world/snowville.js` with strays/ghosts/weather/goals/clan cats off, loader lines (`areas.js:65-69, 99-101`), music row, found-outfit file stub | M |
| **V1 The snow world** | `snowvilleplan.js`, `snowvilleparts.js`, `snowvillelight.js` (haze, flakes), village square, spawn court and arch, footprints spike S1, cheeks theme, budget row A | L |
| **V2 Tilly and chapter 1** | Tilly (`snowvillelife.js`), carry and return, candle one, `snowvillemission.js` (pure steps) and tests | M |
| **V3 Finds** | six pages, collectibles, three mice, the Scarf and its four spots, totals 68 / 44 | M |
| **V4 Life and sound** | otters, hare, robin, smoke, bells, crunch (silent when muted) | M |
| **V5 Wing B** | pond, hill, hill perch, candles two and three, hearth, **Lantern Night** (`snowshow.showAt`, room clock), `snowstory`, co-walk credit; budget row B | L |
| **V6 Gate** | Farm `archway` gate, own return arch, catalog row, map circle; Farm re-measured | S |
| **V7 Replay** | errand, `AWARDS.snowjob`, album; optional sled run (path ride, needs P1 merged, see section 6) | S-M |
| **V8 Polish** | beauty rounds by pictures, iPhone/iPad/TV, iPad 7 smoke test at the lowest rung, owner's one look | M |

Order: V0 first and alone; V1 and V6 can overlap (V6 needs only V1's return arch); V2 after V1; V3 and V4 both edit `world/snowville.js`'s import list and the life file (sequence them: V3 then V4; the Cave's own lesson, `crystal-cave.md` §8 answer 4); V5 after V2; V7 after V5; V8 last.

## 2. The Treehouse village

### 2.1 For a parent

**The Treehouse village is a little town in a giant, friendly tree.** The cat steps through a glowing hollow in the great oak at the edge of the Park and arrives at the foot of the tree, where wooden stairs, ladders, rope bridges and round houses climb up into the leaves. The cat **hops from deck to deck, one gentle step up at a time**, and everything is within a small hop of the next thing, so she can always hop back down the way she came. A red squirrel postmistress, **Nutmeg** (placeholder), has three letters to deliver and a basket that is too heavy for her small paws. The cat carries each letter up to a different house (a bakery, a bookshop and a bell-tower with a view), and at the end the villagers gather on the crown deck for **a supper by firefly light**. Nothing is timed, nothing can go wrong, and there is always a railing and a leafy floor. Six discoveries, three golden mice, a found acorn cap, and Nutmeg's daily post round. Both editions.

### 2.2 Core experience

- **Climb a tree town:** perch hops, rope bridges, and a basket lift, with the whole place shown in sky-and-leaf light.
- **Deliver three letters upward** (carry, return), one for each level: low, middle and crown.
- **Supper in the canopy:** a shared firefly glow (20 s), then a place to hang out, a photo deck and a daily post round.

### 2.3 Story ("Nutmeg's three letters"), seven steps in three chapters

| # | Chapter | Step |
|---|---|---|
| 1 | 1 Roots | **Meet Nutmeg** at the foot of the oak (interact); she shows a picture of a letter and a house. |
| 2 | 1 | **Letter one** from the post box to the **Bakery** on the low deck (carry up two easy hops). |
| 3 | 2 Branches (stage B) | **Letter two** to the **Bookshop** in the middle canopy, over a rope bridge (walk the bridge, carry). |
| 4 | 2 | **Letter three** to the **Bell Tower** at the crown (the highest deck; carry up the last hops). |
| 5 | 2 | **Ring the bell.** One soft ring; every window lights. |
| 6 | 3 Supper | **The firefly supper** on the crown deck: villagers gather, lanterns and fireflies glide in (pure function of one start time, 20 s, room clock). |
| 7 | 3 | `treestory` pays once (40 paws); Nutmeg gives the **Acorn Cap**'s acorn. |

### 2.4 Place, size, zones

Footprint **64 x 64 m** (4,096 m2) but about **9 m tall**; the sky is leaf canopy. Ground function with one height per point (the engine has no multi-storey ground, `2026-11-27-reef-wave2.md` decision 6), so **levels are perches** (decks as `tree` / `roof`-kind perches, `src/climbing.js:73-75`), not terrain. Start: bounds `{ minX -32, maxX 32, minZ -32, maxZ 32 }`.

| Zone | Where (start) | What |
|---|---|---|
| Roots (spawn) | (0, 26) | the return arch (`own`), post box, Nutmeg, the first stair; the whole level 0 is walkable ground |
| Low deck (level 1, 1.4 m) | (-8, 10) | the Bakery, a bench, a mouse |
| Middle canopy (level 2, 2.8 m) | (10, -2) | the Bookshop, the rope bridge to the far platform (4.2 m) |
| Crown (level 3, 5.6 m) | (0, -16) | the Bell Tower, supper deck, a lookout |
| Hollow log and brook | (-22, -10) | ground-level extras: a hollow log, a small brook, a photo spot |

### 2.5 How it is reached, and how climbing works

A **`hollow` gate** (the look the gate design reserves for "trees", `specs/2026-11-23-teleport-gates-design.md:40-44`; unused so far, `src/teleport.js:48, 64`) in a great hollow oak at the Park's edge, awake after two Park walks (`TREEHOUSE_NEED_WALKS = 2`), `edition: 'all'`, own return arch, price 0, catalog `treehouse: { name: 'The Treehouse', price: 0, requires: { area: 'park', walks: 2 }, gate: 'tele' }`. The Park already hosts two gates (`src/teleport.js:88-97`); the builder measures the Park and keeps the hollow at a clear spot of its own. The natural host, the Woods, is Clan-only (`src/progression.js:439`) and a gate end there would hide the place from the everyday edition (O2).

**Climbing:** the cat uses the **existing perch hops**, with every hop planned at **at most 1.4 m** (baseline hop 1.6, `src/climbing.js:28-31`), so the whole village is reachable with no skills, and a **no-skills reach test** floods the floor from the spawn and checks every deck, house, letter spot and mouse (the per-area seam test the wave-2 plan describes). Rope bridges are lines of low perches along a walkable strip (spike T1: whether the existing fence-run, `src/climbing.js:266`, or a one-height ramp strip under the 0.5 slope limit is cleaner); nothing is ever a fall, and "down" is always a hop to the deck below. An optional **basket lift** (a path ride, `pathride` `cart`-style with stops, section 6) is a later extra, never needed for the story.

### 2.6 Camera and movement

Canopy and decks are the problem: a camera under a deck sees planks, and one above sees leaves. Rules (the Cave's, adapted): **zoom capped at step 2** (`ZOOM_CAPPED_AREAS`, `src/camzoom.js:54`, add `treehouse: 2`), no real `ground.ceil` (it would trigger the den's cave view, `crystal.js:6` rule), deck undersides drawn inside-only, canopy leaves above 11 m so step 2 never clips them (step 3 reaches about 9 m, `plans/2026-11-26-crystal-cave.md` §8 answer 2), decks as perches have colliders with railings, and the camera follows the perched cat as it does on a roof. Camera floor/ceiling clamps exist (`src/player.js:698-702`). Weather off (as Snowville); a soft dapple of light (a scrolled quad) and a moving shadow; **one PointLight at most** (the Gorge's rule, `src/gorgelife.js:44-50`), moved with the lit house.

### 2.7 Life, photo and journal pages

Life: songbirds on the rails, a squirrel crew, an owl in the bell tower (sleeping), fireflies, a hanging-lantern sway, falling leaves (one `Points`, fewer in reduced motion), a baker's cat on the low deck. Photo decks: three (the lookout, the bridge, the bell). **Journal (prefix `th`, life `tl`):** six discoveries `thbakery`, `thbooks`, `thbell`, `thbridge`, `thlookout`, `thacorn` (a giant acorn); six activity pages `thletters`, `thsupper`, `thbasket`, `thalbum`, `therrand`, `thhops`; life `tlbird`, `tlsquirrel`, `tlowl`, `tlfirefly`, `tlbat`.

### 2.8 Gold mice (+3)

`gm-treehouse-1` on the roots (ground, easy), `gm-treehouse-2` on the middle canopy's far platform (two hops), `gm-treehouse-3` under the bell on the crown (the highest, three hops of at most 1.4 m). Totals: 71 / 47 if built second.

### 2.9 Music, guide, card

`THEMES.treehouse`: a light, woody marimba-and-bell theme (voice `mar` with a `chime` alt, `root 4`, `beat 0.5`; tuned by ear), `src/musicthemes.js:25-45`. Guide `treehouseguide.js` and arrival card `treehouseintro.js` as Snowville (accent a leaf green); the guide's compass words add "up" and "down" because the place is vertical.

### 2.10 Found outfit

**Acorn Cap** (head slot, `src/foundwear/head.js`), four hand-placed spots (the roots, the bakery's sill, the bridge, the lookout); both editions; one a walk. Do not clash with the existing straw hat or the gardener's hat (`2026-11-26-greenhouse-remaining.md`, G4).

### 2.11 Replay

**Nutmeg's post round of the day** (25 paws once a walk, `AWARDS.treejob`, room seed): (1) carry a parcel to the bell tower, (2) find the hidden stamp, (3) hop through five lanterns in order, (4) ring the bell three times, (5) deliver a postcard to the owl, (6) bring three acorns to the bakery. Each pays a **stamp** into an album of twelve (`state.treehouse.album`).

### 2.12 Save

`state.treehouse = { step, letters, album }`: step 0 to 7, letters 3 bits, album 12 bits; the same sanitiser table and max/OR/OR merge as Snowville (section 1.12). Nothing about height is saved.

### 2.13 Flag and release

`treehouseflag.js` (`?treehouse=0` off, `?treehouse=1` shortcut, default on). Gate hand-off in T6.

### 2.14 Budget (planning only)

Stage A (roots, low deck, Nutmeg, letter one) about 30 kB gz, 28,000 triangles; stage B (canopy, crown, supper show) about 26 kB; stage C optional (basket lift) about 6 kB. Total about 60 kB, staged like Snowville. Measured then set. Park re-measured after the gate.

### 2.15 Milestones

| M | What | Size |
|---|---|---|
| **T0 Seams** (N0) | flag, `state.treehouse`, ids, awards, gold stubs, zoom cap row, stage slots, stub | M |
| **T1 The tree world** | `treehouseplan.js`, `treehouseparts.js`, `treehouselight.js`, deck perches and railings, the **no-skills reach test**, camera spike (below decks, in the leaves, zoom 2), spawn arch, budget row A | L |
| **T2 Nutmeg and chapter 1** | Nutmeg, carry and return, letter one, `treehousemission.js` and tests | M |
| **T3 Finds** | six pages, three mice, Acorn Cap spots, totals 71 / 47 | M |
| **T4 Life and sound** | birds, owl, fireflies, leaves, creak and chime (silent when muted) | M |
| **T5 Wing B** | rope bridge, bookshop, bell tower, firefly supper (`supperAt`), `treestory`, co-walk credit; budget row B | L |
| **T6 Gate** | Park `hollow` gate, own return arch, catalog row; Park re-measured | S |
| **T7 Replay** | post round, `AWARDS.treejob`, stamps album; optional basket lift | S-M |
| **T8 Polish** | beauty rounds, devices, iPad 7 smoke test, owner's one look | M |

## 3. The Jungle lodge

### 3.1 For a parent

**The Jungle lodge is a warm, leafy rainforest with a cosy wooden lodge on stilts.** The cat steps through an old mossy stone ring at the back of the Greenhouse and finds a green, humming forest of huge leaves, hanging vines, a slow brown river and a friendly lodge with a big veranda. **A warm rain shower falls every so often** (the cat can shelter on the lodge veranda or under a giant leaf, and a rainbow follows), and the canopy overhead is full of colourful birds, frogs and butterflies. The lodge's keeper, an old tortoise called **Mossy** (placeholder), is hosting a **Rain Supper** and needs three kinds of fruit (a mango, a banana bunch and a cacao pod) carried from different parts of the forest to the lodge kitchen. At the end everybody eats on the veranda while the frogs sing and the rain falls, in a 20-second sound-and-light moment everyone in a room shares. Nothing is timed, nothing can go wrong, and the forest is bright and the paths are wide. Six discoveries, three golden mice, a found feather band, and Mossy's daily errand. Both editions.

### 3.2 Core experience

- **A forest to explore:** river, vines, canopy bridges, a lodge with rooms to peek into; rain showers with shelter.
- **Carry three fruit to the lodge kitchen** (carry and return again), over the ground, a log bridge and a small raft crossing (optional).
- **The Rain Supper:** a shared show, then a place to return to (errand, album of twelve leaf pressings, optional river raft).

### 3.3 Story ("Mossy's Rain Supper"), seven steps in three chapters

| # | Chapter | Step |
|---|---|---|
| 1 | 1 The lodge | **Meet Mossy** on the veranda (interact); she shows a picture of a supper table and three fruit. |
| 2 | 1 | **Mango** from the mango tree near the lodge (a glint; walk, carry). |
| 3 | 2 The river (stage B) | **Banana bunch** across a log bridge; carry it back. |
| 4 | 2 | **Cacao pod** high on a low branch (one perch hop, existing), carried to the kitchen. |
| 5 | 2 | **Set the table** (put each fruit on the table; it lights as each is placed). |
| 6 | 3 Rain Supper | **The supper:** the rain comes, the veranda glows, frogs sing in time (pure function of one start time, 20 s, room clock). |
| 7 | 3 | `junglestory` pays once (40 paws); Mossy gives the **Fern Anklet**'s fern. |

### 3.4 Place, size, zones

Bounds start `{ minX -44, maxX 44, minZ -38, maxZ 38 }` = **88 x 76 m** (6,688 m2). Ground one smooth function (up to 1.5 m of gentle hills, slopes under 0.5), a river as a **`waters` entry for wading and swimming** only if the builder can reuse the Seaside's swim code without a new mechanic (`src/cat/waterlook.js`, per the Reef plan section 1; **not verified here**); otherwise the river is a bed she walks across in shallows and bridges. Open sky above giant leaves; no `ceil`.

| Zone | Where (start) | What |
|---|---|---|
| Stone ring (spawn) | (0, 32) | the return ring (`own`), mossy stones, a pool, Mossy's signpost |
| The Lodge | (-6, 14) | veranda (rain shelter), kitchen, table, bunk room (a mouse), the postcard board |
| Fruit grove | (-26, 2) | mango tree, a glint in the ferns, frogs |
| River and log bridge | (10, -6) | brook, log bridge (banana), stepping stones, the raft landing (optional) |
| Canopy walk | (24, -24) | a low branch for the cacao, vine swing (photo only), a lookout |

### 3.5 How it is reached

A **`stonering` gate at the Greenhouse** (old mossy stones, the look the design calls "ancient and mossy", `specs/2026-11-23-teleport-gates-design.md:40-44`; the Greenhouse's own gate is an archway, `src/teleport.js:127-131`), awake after two Greenhouse walks (`JUNGLE_NEED_WALKS = 2`; `walks.greenhouse` already exists, `src/progression.js:555`), `edition: 'all'`, own return ring, price 0, catalog `jungle: { name: 'The Jungle Lodge', price: 0, requires: { area: 'greenhouse', walks: 2 }, gate: 'tele' }`. The chain is Park -> Greenhouse -> Jungle. The Greenhouse budget is checked after the gate (`['greenhouse', buildGreenhouse, 77, 7]`, `test/budget.test.js:604`).

### 3.6 Movement, rain, canopy, lodge

- No new movement mechanic, no `placephysics` row.
- **Rain:** reuse the weather schedule with its rainbow (`createRainSchedule`, `src/weather.js:61-68`) on a **short, repeating** cycle (start: 90 s clear, 30 s shower, then a rainbow), so the supper show always has rain to land on. Whether the weather can be forced "on a repeating schedule" for one area or needs a small flag in the walk is **not verified**; spike J1.
- **Shelter:** the lodge veranda and a few giant leaves call `weather.setSheltered(true)` while she is under them (`src/weather.js:597-600`, the Gorge pattern, `src/gorgelife.js:44-50`). **Canopy:** a high leaf ceiling drawn above the camera's reach (11 m and up) and **no real `ceil`**; zoom full unless the camera spike finds leaves clip it (then `jungle: 2`, `src/camzoom.js:54`). The lodge is an ordinary building with colliders and a door-free veranda (no interior room, so no cave view).
- Strays, critters, ghosts, rivals, the yard dog, daily goals and clan cats are off.

### 3.7 Life, photo and journal pages

Life: macaws and toucans in the canopy (instanced, slow), frogs that sing on the rain, butterflies, a capybara family in the shallows, a sloth on a branch (slow, friendly), fireflies at dusk, a lodge cat that sleeps on the veranda. **Journal (prefix `jl`, life `jw`):** six discoveries `jllodge`, `jlriver`, `jlsloth`, `jlcanopy`, `jlrainbow`, `jlorchid`; six activity pages `jlfruit`, `jlsupper`, `jlraft`, `jlalbum`, `jlerrand`, `jlrain`; life `jwmacaw`, `jwfrog`, `jwcapybara`, `jwbutterfly`, `jwtoucan`.

### 3.8 Gold mice (+3)

`gm-jungle-1` on the veranda boards, `gm-jungle-2` under a giant leaf by the river (ground), `gm-jungle-3` on the canopy walk's low branch (one hop). Totals: 74 / 50 if built third (needs `GOLD_MAX_COUNT` 80, section 0).

### 3.9 Music, guide, card

`THEMES.jungle`: marimba and rain-hush (`voice 'mar'`, `alt 0.2 altVoice 'chime'`, `scale MINP`, `swing 0.2`, `beat 0.5`; by ear), plus the existing water-hush bed idea from the Reef's ambience (not verified for reuse). Guide `jungleguide.js` and arrival card `jungleintro.js` (accent a deep green).

### 3.10 Found outfit

**Fern Anklet** (feet slot, `src/foundwear/feet.js`), four hand-placed spots (the stone ring, the mango tree, the log bridge, the canopy lookout), both editions.

### 3.11 Replay

**Mossy's errand of the day** (25 paws once a walk, `AWARDS.junglejob`, room seed): (1) carry a leaf umbrella to the sloth, (2) find the rainbow frog, (3) float a leaf boat down the river, (4) shake three hanging vines, (5) bring a cup of rainwater to the veranda, (6) a missing slipper at one of six spots. Each pays a **leaf pressing** into an album of twelve.

### 3.12 Save

`state.jungle = { step, fruit, album }` as Snowville (section 1.12).

### 3.13 Flag and release

`jungleflag.js` (`?jungle=0` off, `?jungle=1` shortcut, default on in a browser); gate hand-off in J6.

### 3.14 Budget (planning only)

Stage A (lodge, spawn, Mossy, mango, rain) about 32 kB gz and 30,000 triangles; stage B (river, grove, canopy walk, supper) about 28 kB; stage C (raft) about 8 kB. Total about 68 kB, staged. Measured then set. Greenhouse re-measured after the gate.

### 3.15 Milestones

| M | What | Size |
|---|---|---|
| **J0 Seams** (N0) | flag, `state.jungle`, ids, awards, gold stubs, music row, stage slots, stub | M |
| **J1 The jungle world** | `jungleplan.js`, `jungleparts.js`, `junglelight.js` (rain, mist), lodge, spawn ring, rain-schedule spike J1, budget row A | L |
| **J2 Mossy and chapter 1** | Mossy, mango, kitchen table, `junglemission.js` and tests | M |
| **J3 Finds** | six pages, three mice, Fern Anklet spots, totals 74 / 50 | M |
| **J4 Life and sound** | birds, frogs, rain patter (silent when muted) | M |
| **J5 Wing B** | river and log bridge, canopy walk, cacao, Rain Supper show, `junglestory` | L |
| **J6 Gate** | Greenhouse `stonering` gate, own return ring, catalog row; Greenhouse re-measured | S |
| **J7 Replay** | errand, `AWARDS.junglejob`, leaf pressing album; optional raft | S-M |
| **J8 Polish** | beauty rounds, devices, iPad 7 smoke test, owner's one look | M |

## 4. Tests every area carries

Builds; spawn clear; every plan coordinate in bounds and reachable **with no skills** (a flood from the spawn, as in the Reef and Cave seam tests); carry returns on every walk ending; banned-word scan on every area string (*dark, lost forever, trapped, stuck, collapse, scary*, plus for these: *freezing, frostbite, hurt, fall, drown*; "lost" in the child-facing text is replaced by "can't find"); both word sets and the word-set structural test (no series word outside the word-set files); flat-trace fixtures unchanged (`git diff --exit-code test/fixtures/flat-trace.gameplay.json`, `2026-11-26-greenhouse-remaining.md`); door round trip; reduced-motion pass (flakes, leaves, rain streaks fewer or still); pad and TV reach; one co-walk through the gate; the host's budget row re-measured. Seam milestones also run the `clanwords`, `*finds` and `serieswords` tests (Greenhouse lesson, memory note). **Full suite via the checker on the rebased branch before every merge.**

## 5. Shared decisions

**What the three share (build once, in one seams milestone N0).**

1. **One shared-seam milestone first, for all three.** The seam list is the same each time (`plans/2026-11-26-crystal-cave.md` §8 answer 3: `progression.js` for `JOURNAL_TYPES`, walks, default, sanitiser, catalog row; `catmerge.js` for `MERGE_RULES` and `BASE_WANTED`; `discoveries.js` `AWARDS`; `coop/table.js`; `world/areas.js` both tables; `goldmice.js`; `foundwear/spots/index.js`; `clanphrases.js`; `teleport.js`). Doing it once for three areas avoids three rounds of the same merge conflicts and the ~17 gold-total test files. **N0 also: raise `TELE_PAIR_CAP` to 8, raise `GOLD_MAX_COUNT` to 80, reserve all 33 journal ids** (the sanitiser drops unknown ids), append them to `JOURNAL_TYPES` after the wave-2 ids, and re-pin the gold totals once to 74 / 50 or in three steps (recommended: one step, the stub mice `gm-*-1..3`, so later milestones only fill positions).
2. **Same machinery:** flag file, pure plan file, lazy chunk, `world/<area>.js` stub, own return arch, carry-and-return mission, 20 s room-clock show, daily errand with a 12-bit album, found outfit with four hand-placed spots, 6 + 6 + 5 journal pages, 3 mice, `AWARDS.*story` 40 and `*job` 25, `state.<area>` with a 3-bit item mask and a 12-bit album.
3. **Rides: yes, one shared pure file, `pathride.js`, not `reefride.js`** (the Crystal/Moon wave-2 plan's decision 4). Snowville's sled run uses `SPECS.sled` as written (vMin 3, vMax 8, `laneHalf 1.5`, loop, `p1-pathride:src/world/pathride.js:20-24`), the Treehouse's basket lift is a `cart`-style open path with stops (`withStops`, `:157`) and the Jungle's raft is a `boat`-style loop. **Each area defines its own spec object in its own plan file and passes it to `createPathRide`/`stepPath`**, so `pathride.js`, `reefride.js` and `moonrover.js` stay untouched. **Rides are never part of the story**; they are V7/T7/J7 optional extras, only after P1 merges to `main` and the first live wrapper (the Crystal boat, C1 of wave 2) shows the pattern works. No ride is saved (no seat or record, as wave 2 states).
4. **Not shared:** no new movement mechanic (no `floatY`, no `placephysics` row), no new gate look name (reused `archway`, `hollow`, `stonering`, because every new look touches ten places per the Cave's answer 1), no new weather kind.
5. **Build order (recommended): Snowville, then the Treehouse, then the Jungle.** Snowville is next in the owner's queue (memory), it has the fewest unknowns (no vertical camera, no rain schedule), and it is the one with a time pull (winter). The Treehouse comes second because it is the vertical-camera risk (spike T1) and should not run alongside a first-of-kind snow spike. The Jungle is third because it needs the rain spike J1, and because it should wait for the Greenhouse's release pass (G7) so its host is settled.
6. **What runs in parallel.** N0 alone (touches every shared file). Then **V1 + T1** (two builders, different files; the third seat only for a Haiku checker), then V2 + T2 (copying the same carry code: check `reefmission.js` reuse is a copy, not an edit), V6/T6/J6 any time after their world milestone (gate files only; `teleport.js` conflicts on the shared ends table: sequence the three gate commits). **Do not run V3 with V4, T3 with T4, J3 with J4** (same import list and life file). Never more than three builders; one full suite at a time.
7. **Total release shape:** each area is "first release" for its R0..R7 equivalents (V0 to V7), then the polish pass gates the flag. Couch co-op later (`COOP_READY.<area>: false` in the seams, as the Cave). The Reef/Cave/Greenhouse release passes are not touched by this plan.

## 6. Sizes and totals at a glance

| | Snowville | Treehouse | Jungle |
|---|---|---|---|
| Size (m, start) | 80 x 72 | 64 x 64 x 9 m tall | 88 x 76 |
| Host / look / needWalks | Farm / `archway` / 2 | Park / `hollow` / 2 | Greenhouse / `stonering` / 2 |
| Journal prefix | `sv` + `sw` | `th` + `tl` | `jl` + `jw` |
| Gold mice (Clan / everyday, in build order) | 68 / 44 | 71 / 47 | 74 / 50 |
| Chunk (planning, kB gz) | ~58 | ~60 | ~68 |
| Staged | A, B, C (sled) | A, B, C (basket) | A, B, C (raft) |
| Save key | `snowville` | `treehouse` | `jungle` |
| Outfit | Snowflake Scarf (neck) | Acorn Cap (head) | Fern Anklet (feet) |
| Replay | Tilly's errand, snow-globe album | Nutmeg's post round, stamps | Mossy's errand, leaf pressings |
| Start-up growth (expected) | under 1 kB | under 1 kB | under 1 kB |

Start-up: 656.8 kB gz of 720 (memory note, after the Crystal Cave); three areas at under 1 kB each fit with room; the standing allowance (up to 5 kB per area, reported) covers any surprise. Per-chunk 100 kB guard (`scripts/buildjson.mjs:51`) stays automatic. Device floor: M-class at HIGH; the iPad 7 is smoke-tested once per area at the lowest rung and never used to size a place (memory, device policy 2026-11-26). Falling snow, leaves and rain streaks drop to fewer or none on LOW/LITE.

## 7. Open questions for the owner

Each with a recommended default; the plan builds on the default if you do not answer.

- **O1 Gate cap (new).** Seven gate pairs exceed `TELE_PAIR_CAP = 6` (`src/teleport.js:22`). Recommend: **raise the cap to 8 now** (a one-line change and a test constant). Alternative: design the "gate garden" list board the gate spec mentions (`specs/2026-11-23-teleport-gates-design.md:209-210`), a bigger piece of work.
- **O2 Snowville: winter-only date window or always snowy?** (The unanswered question since 2026-11-26.) Recommend: **always snowy, always open.** A date window needs a hard-coded end time like `src/birthday.js:28`, makes a child's gate vanish and return, and puts the place beyond the "nothing is timed" promise; the village is cosy in any month. If you want a seasonal touch, add a **Winter Lights extra** (string lights, a tree-lighting moment) inside the place from 1 December to 6 January through one pure function, as a later polish milestone. If it must be playable by the winter break, Snowville goes first and stage B and the sled trim; say so and N0 plus V1 to V3 run immediately.
- **O3 Treehouse: where does it connect, and how does climbing work?** Recommend: **a `hollow` gate in a great oak at the Park's edge** (Park is in both editions; the Woods is Clan-only, `src/progression.js:439`), reached by the **existing perch hops, every hop 1.4 m or less**, bridges as low perch strips, never a fall, no skill needed, zoom capped at step 2 like the Cave. Alternative: a Woods gate in the Clan edition only, a second gate from the Park later.
- **O4 Jungle lodge: a new area or a Greenhouse sibling wing, and what story?** Recommend: **a new area (`jungle`) reached by a `stonering` gate in the Greenhouse**, story **"Mossy's Rain Supper"** (three fruit carried to the lodge kitchen, a rain-and-frogs supper). A sibling wing of the Greenhouse (no gate, no new pair, smaller) is the cheaper alternative but the Greenhouse is a glass house with a fixed 'stage B' ('rooms' plan) and the lodge, river, rain and canopy do not fit under glass.
- **O5 Names.** Tilly, Nutmeg and Mossy are placeholders; do you want your daughter to name them (as with Marlo and Lumi)? Recommend yes, after the story steps are built.
- **O6 Build order.** Recommend Snowville, Treehouse, Jungle (section 5).
- **O7 Rides.** Recommend rides stay optional extras after the stories (section 5, point 3). Do you want any of the three rides earlier?
- **O8 Cheeks theme wording.** Recommend only a pink tint, a breath puff and one soft line, with no number and no consequence; **not** a visible gauge. Confirm.
- **O9 Both editions.** Recommend yes for all three (the gate rows `edition: 'all'`, the words in both sets with Clan flavour only as light lines, never ancestors or series words).
- **O10 Released flags.** Recommend default ON for every area from its gate milestone, as the Crystal Cave and Reef were (`src/crystalflag.js:1`), with the gate row itself hidden while the gates switch is off.

## 8. Risks

1. **Cap and caps.** `TELE_PAIR_CAP` 6 and `GOLD_MAX_COUNT` 72 both bite; fixed in N0 (O1).
2. **Treehouse camera.** Decks, railings and leaves vs the chase camera; the first spike (T1) and a zoom cap are the answer; if it fails, fall back to a lower tree (three levels, not four).
3. **No snow, no rain schedule, no multi-level ground in the tree.** Each is new: flakes as `Points`, rain schedule forced in the Jungle, levels as perches. Spikes S1, J1, T1 settle them in each area's first world milestone, with pictures.
4. **Pinned tests.** Gold totals live in about 17 files (the Reef's R0 count); the seams milestone moves them once. The journal slice tests (`reefseams.test.js:195` and similar) find ids by first id (`2026-11-27-reef-wave2.md` decision 2).
5. **Hosts' budgets.** The Farm, Park and Greenhouse each gain a gate (3 meshes, about 400 triangles, 1 transparent draw); each is re-measured in its gate milestone; none has its ceiling raised.
6. **Snow, rain and mood.** The cheeks theme and heights can read as cold or high; warm light, railings, no meter, banned-word scan.
7. **Edition drift.** A line in one word set only; the existing parity tests run over every new id.
8. **`pathride.js` not on `main`.** Only matters for the optional rides; they wait for P1 to merge.
9. **Three flagged unknowns I did not verify:** whether the Jungle river can reuse the swim code, whether the weather module can run a repeating rain schedule for one area, and whether the Farm / Park / Greenhouse have clear ground for a gate arch at a sensible spot (the gate's own test finds this).
