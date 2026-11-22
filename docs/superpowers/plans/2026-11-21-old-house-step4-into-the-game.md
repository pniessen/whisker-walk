# The Old House, step 4: into the game — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Old House becomes a real place a child can unlock and visit, in Clan Edition, alone or with her brother. That means:
- a place on the world map at the town's rim, with its card picture;
- 150 🐾 after 2 town walks, through `areaOffer`;
- an old house's front in the town, whose door walks her into the hall, and the hall's front door walks her back out to it;
- its three golden mice joining the count;
- a first-visit hint;
- both word sets;
- co-walks that agree on both screens, with a partner seen anywhere in the house;
- the two-cat worst spot inside the spec's ceilings.

Found-outfit spots wait (ruling W17). Nothing here depends on step 3, the old cat.

**Architecture:**
- **The catalog row is the switch** (as for the Rooftops and the Market). Every card, offer, gold count, room and gate already reads `CATALOG.areas`.
- **Start-up learns only data rows:**
  - the catalog row;
  - one `TOWN_PLACES` row, its land colour, its icon and its map road;
  - two `GATEWAY_ENDS` rows;
  - three `GOLD_MICE` rows;
  - one hint row, its line and its picture;
  - two small edition checks in `src/houseflag.js`.
- **Everything else goes in a chunk:**
  - The town's old-house front is a new module, `src/world/oldhousefront.js`, imported only by `src/world/neighborhood.js`, so it lands in the Neighborhood's chunk. The town draws it only when the walk hands it the `town-house` end, which happens in Clan Edition only.
  - The house's door, the partner's name over the walls and the shared discoveries live in the house chunk (`houselife.js`, `housefinds.js`, `houseparts.js`).
  - The partner comes from the `session` that `main.js` already hands every area life.

**Tech Stack:** Plain ES modules, Three.js 0.185, Vite 8, Vitest 4, headless Chrome through `scripts/record-page.mjs` (unchanged), ffmpeg.

**Spec:** `docs/superpowers/specs/2026-11-20-old-house-design.md`, "Build order" item 4: "the world-map place, the unlock, the card picture, both word sets, co-walk checks, found-outfit spots (after found outfits step 3), and a tour hint". Sections used:
- "Fit with the game": Clan Edition with both word sets; the world map and the front door; the unlock; co-walk; the guided tour;
- "Goals": "Both children can explore it together and see each other anywhere in the house.";
- "Anti-goals": lost behind walls for either player, fiddly, slow, scary;
- "What there is to do": found outfits;
- "Constraints": performance, determinism, offline-first, text.

**Read first:**
- The step 1 plan's "Updates (2026-11-21)", U1–U16 (`docs/superpowers/plans/2026-11-20-old-house-step1-house-camera.md` lines 19–114).
- The step 2 plan's rulings D1–D19 (`docs/superpowers/plans/2026-11-21-old-house-step2-things-to-do.md` lines 1–246).
- The two ledgers:
  - `.superpowers/sdd/2026-11-20-old-house-step1-house-camera/progress.md`;
  - `.superpowers/sdd/2026-11-21-old-house-step2-things-to-do/progress.md`.
- The precedents, test for test:
  - Rooftops step 4 (`docs/superpowers/plans/2026-11-21-rooftops-step4-into-game.md`);
  - Market steps 3–4, Tasks 10–14 and rulings V12–V22 (`docs/superpowers/plans/2026-11-21-market-square-steps3-4.md`, on main).

This plan wins where any of them disagree.

## The owner's decisions this plan builds on (2026-11-21)

- The house is Clan Edition only. Legacy does not get it.
- The unlock is the spec's proposal: 150 🐾 after 2 town walks.
- The words stay the same in both word sets for now. A later pass can flavour them.
- The house's golden mice count once the house is on the map.
- The kitten counting against the plan's aims is fine, as long as the spec ceilings 450 / 380 / 70,000 hold.
- Step 3, the old cat, waits for her name. Step 4 must not depend on it.

## Before Task 1 (the controller)

- Merge `origin/main` (at least `c7ffb975`) into `house` before Task 1 starts, then refresh the series-words snapshots and run the full suite.
- Main has the Market Square's step 4. It uses the same unlock and touches the same shared files: `progression.js`, `worldmap.js`, `gateways.js`, `hints.js`, `tutorialwords.js`, `game/tips.js`, `ui/territorymap.js`, `goldmice.js`, `main.js` and `walk.js`. It also raised the start-up ceiling to 720 kB (`9572c026`).
- Every row below goes after the Market's.
- Task 1 checks that `git merge-base --is-ancestor c7ffb975 HEAD` succeeds. If it fails, stop and report.

## Rulings (my calls; the owner can overturn each)

- **W1. The unlock is the spec's.**
  - The row: `house: { name: 'The Old House', price: 150, requires: { area: 'neighborhood', walks: 2 }, edition: 'canon' }`, right after `market` in `CATALOG.areas`, so it is the place cards' last street place. The offer goes through `areaOffer` (`src/areaoffer.js`).
  - It is not in `KEPT_OFFERS`, and not in `COLONY_AREAS`.
  - `name` is not what a child sees: the shown name comes from `PLACE_WORDS.house`, read by `placeName`.
  - Why: the owner's decision.
  - Child-visible: after 2 town walks, the Market Square and the Old House are offered together, both at 150 🐾 (owner question 2).
- **W2. Clan Edition only, everywhere** (`edition: 'canon'`).
  - A Legacy save has no card, no map place, no gate, no town front, no change to its gold count, no house prefetch, and its house walk note is dropped.
  - A Legacy guest in a room walks it by override (`roomAreaMove`), as with every Clan-only place (Market V16).
  - Why: the owner's decision, and the spec's "Legacy Edition does not get it".
- **W3. `?house=1` stays, as a developer shortcut only** (as `?roofs=1`, Rooftops T3, and `?market=1`, Market V17).
  - With the row it gates nothing a child sees.
  - `resumableHouseIds(ids, state)` keeps `'house'` in Clan Edition, with the switch or without, and drops it in Legacy. This closes the parked note "resumableHouseIds ignores edition".
  - `housePrefetch(state)` is `houseOn() && isClanEdition(state)`. `main.js` prefetches at boot only when it is true. This closes "Legacy+flag still prefetches the 22 kB chunk".
  - Explore with the switch still starts a solo house walk in Clan Edition, never in a room. `walk.js`'s line stays as it is.
  - Why: the owner and the picture pages use it. Removing it would rewrite `test/housegame.test.js` and `test/houseload.test.js` and save about 0.1 kB, and no child would see a difference.
- **W4. The world-map place is a town place** (`TOWN_PLACES`, beside the Rooftops and the Market), not a `STREET_PLACES` row:
  - the row: `{ id: 'house', areaId: 'house', x: 768, y: 648, r: 46 }`, on the town's south-west rim, straddling it;
  - `TOWN_LAND.house = '#a3876a'` (old timber);
  - `STREET_ICON.house = '🕰️'` in `src/ui/territorymap.js`;
  - the road `{ id: 'town-house', from: 'neighborhood', to: 'house', road: [...] }` in `GATEWAYS`. The builder picks its four points from the map picture, edge to edge, in the gap between the town's and the house's circles, clear of every other circle and road by 8. `test/worldmap.test.js` pins the four points, as it pins `MARKET_ROAD`.
  - The builder may move the circle up to 25 units to pass the map tests. A `TOWN_LABEL_AT.house` may go in if the name clashes.
  - Why: the house is entered from inside the town (its door stands there), and `TOWN_PLACES` is the list for places on the town's rim reached from inside it. The spec's "next to the town … drawn like the others" still holds: a circle by the town, its name from the word tables, its card. The south-west matches where its front stands in the town (W5). The Woods' circle is 240 from it (needs 224), the Docks' 191 (needs 134).
- **W5. The town gets an old house's front, drawn in the Neighborhood's chunk.**
  - **Module:** `src/world/oldhousefront.js`, imported only by `neighborhood.js`.
  - **When:** `build(scene, { gateEnds })` draws it only when an end with `id === 'town-house'` is in `gateEnds`. So Legacy, a bare build and the flat trace (`test/helpers/flattrace.js` calls `world.build(scene)`) get the town exactly as it is.
  - **Where:** `OLD_HOUSE_FRONT = { x0: -54, x1: -44, z0: 24, z1: 38, door: { x: -44, z: 31 } }`, against the west hedge, its front facing east onto the lawn.
  - **What:** three storeys under a steep slate roof, two chimneys, a round attic window (the inside's round window), tall windows, three front steps and a big panelled door with a fanlight. The door stays shut (W7). At dusk its windows glow as `builder.house()`'s do.
  - **Colliders:** circles of r ≤ 0.7 at most 1.0 m apart round its footprint, so nobody walks into it.
  - **Cost:** at most 6 meshes after `mergeStaticProps`, 4 casters and 2,500 triangles. The Neighborhood with its gates stays inside `test/budget.test.js`'s street ceilings.
  - **No new points of interest:** no scenic, perch, collectible or POI, so the town's goals and specials do not change.
  - The builder may move it along the hedge (z within 16..44) to pass a clearance rule, and says so in the commit.
  - Why: a big old house needs a front a child recognises, and none of the eight town lots is one. Their own colliders (r 3.4) cover their doors, so a gate there fails every clearance rule.
- **W6. The gateway pair.** Both ends are `placement: 'inside'` and look `'none'`, because each area draws its own door.
  - Town end: `end({ id: 'town-house', gateway: 'town-house', x: -43.55, z: 31, faces: 'west', to: 'house', twin: 'house-town', look: 'none', placement: 'inside', arrive: { x: -39.9, z: 31, yaw: -Math.PI / 2 } })`. It stands 0.45 m in front of the door, as the alley door's end does. She lands 3.65 m out, facing east, away from the door.
  - House end: `end({ id: 'house-town', gateway: 'town-house', x: 0, z: 11.6, faces: 'south', to: 'neighborhood', twin: 'town-house', look: 'none', placement: 'inside', arrive: { x: 0, z: 7.95, yaw: 0 } })`. It stands just inside the hall's front door (`HOUSE_FRONT_DOOR`, z 12). She lands 3.65 m in, facing north (`GATE_REACH + 2` is the arrival rule).
  - The builder may move the house arrival's x within ±1.5 and z within 7.6..8.0 if a collider (the hall lamp, the umbrellas) is within 1.2 m, and says so in the commit.
  - `src/gateways.js`'s header reserve sentence becomes a description of the pair.
- **W7. The house's front door opens for her. The town's door stays shut.**
  - Inside, the end is always `go`. When she or a partner comes within `FRONT_DOOR_NEAR` = 2.4 m of `(HOUSE_FRONT_DOOR.x, HOUSE_FRONT_DOOR.z)`, its two leaves swing outward onto the lawn by `FRONT_DOOR_OPEN` = 1.2 rad over `FRONT_DOOR_S` = 0.4 s (at once under reduced motion). They close again once no cat is within 2.9 m.
  - They open outward, beyond the house's bounds, so they never sweep through her and need no colliders. They sink with the hall's south wall as the shut door does today.
  - This is the step 1 promise H9 "the front door opening". It is drawn only when a `house-town` end comes in `gateEnds` (`house.parts.frontDoor`).
  - Outside, whether the door can open depends on the save (shut, buy, short or go), and a purchase at the door changes that mid-walk. So the town's door stays shut: the gate prompt says what it does, and the "Off to the Old House!" moment carries her through.
- **W8. The spawn stays at (0, 9.5)** (`HOUSE_SPAWN`) for a walk started from the map or Explore. The door's arrival is (0, 7.95).
  - Why: every tour and camera test of steps 1 and 2 starts at the spawn. The arrival rule (`test/gatewayspots.test.js`: `GATE_REACH + 2` from every end) needs 3.6 m from the end, and the spawn is 2.1 m from it.
  - Both starts open on her with no wall between the camera and her (`settle`, step 1's F1).
- **W9. The golden mice join the count.**
  - `GOLD_MICE.house` holds the three rows of `HOUSE_GOLD_MICE` (`gm-house-1..3`, as built), last in `GOLD_MICE`.
  - `GOLD_TOTAL` goes from 42 to 45. Clan Edition counts 45. Legacy's count does not change (`goldForEdition` skips a `canon` row).
  - `house.js` stops handing `areaData.goldMice`. `createGoldMice` loses its `list` option, and `walk.js` its `|| areaData.goldMice` clause and `list:` argument, because no area uses them any more. This saves start-up bytes.
  - `HOUSE_GOLD_MICE` stays in `housethings.js` as the house's own list, and a test holds it equal to `GOLD_MICE.house` (as `ROOFS_REGISTRATION.goldMice` is held).
  - Why: the owner's decision (step 2 question 2).
- **W10. Words.**
  - The one new line is the hint (W11). It is `same(...)` in `tutorialwords.js`, so it reads the same in both word sets.
  - The card, map label, Get it?, lock lines and gate lines all come from existing phrases with `PLACE_WORDS.house`: 'The Old House', and in the clan words 'The Old Twoleg Nest'.
  - `test/serieswords.source.test.js` drops its `house` exemption (step 1 ruling R9: "step 4's map card can record it in a line").
  - The snapshots are refreshed in every task that adds a line. Spurious `notReached` drift is reverted.
- **W11. The first-visit hint.**
  - The row: `{ id: 'house', max: 1, ring: null, when: (f) => f.place === 'house' }`, third in `HINTS`, after `roofs` and `market`. One walk is in one place, so no two place hints are ever due together.
  - The line: `'hint.house': same('Explore every floor, from the attic to the cellar!')`.
  - The picture: `HINT_PICS.house = '🕰️'`.
  - Why: the spec's "one short hint the first time she enters". The line points at the thing the house adds, its floors, with no series word.
- **W12. A partner is seen anywhere in the house by her name over the walls.**
  - Each frame of a house walk, house life sets every co-walker's name tag (`session.remotes.list[i].tag`, already always shown) to draw over the walls: `material.depthTest = false` and `renderOrder = HOUSE_TAG_ORDER` (20). `dispose()` puts back what each tag had.
  - The corner map shows her dot, as everywhere.
  - The walls still sink only for this child's own cat, and the levels are drawn for her own floor (D3).
  - Why: sinking walls for a second line would open rooms the camera is not looking at and double the sink's work, and drawing a second set of levels in full could pass the triangle ceiling. A tag costs one draw and no triangles. The spec's "a partner on another level is always visible" is met by her name, always on top, at her spot.
  - Owner question 1 asks whether he would also like the walls to sink for her.
- **W13. Discoveries are shared moments** ("On a co-walk, a discovery either child triggers counts for both").
  - The house's finds watch every cat on the walk: hers, and each co-walker at the spot `remotecats.js` draws her (`entry.group.position`, which is this device's ground plus her `h`).
  - The triggers are the same, but each cat has its own hold, its own arming, its own speed and its own piano keys.
  - A find a partner makes pays this child too, by the log's own rule (`awardOnce`, once a walk).
  - The bookcase opens on both screens for either cat. It swings away from the cat who opened it.
  - The clock strikes only when it is not already striking, so two cats at its foot hear one strike.
  - A partner's cushion pays and purrs at 0.6 volume.
  - There is no new message type and no new field.
  - Accepted: if two cats open the bookcase from opposite sides within the network's delay, the two screens may swing it different ways. It stands open on both (Review Focus 2).
- **W14. The kitten stays solo-only.** `kitten.js` comes only when `roomSeed === undefined`, so a room's house walk has no Mochi. The room's worst spot is two cats, and the solo worst spot is one cat with Mochi.
- **W15. The budget.**
  - The ceilings are asserted at every level, day and dusk, bookcase shut and open: 450 meshes, 380 casters, 70,000 triangles. Two cases are asserted:
    - one cat and Mochi;
    - two cats, each dressed in the heaviest shipped wearable of each slot, with the partner's tag.
  - The aims (300 / 200 / 55,000) stay asserted for the cat alone (step 2's S2-15) and are reported for the rest (the owner's decision).
- **W16. Co-walk determinism needs no new code beyond W13.**
  - Placements are data. The mice run on the walk's room streams. House life, the finds and the door draw on no stream.
  - Golden mice are per save, at data spots.
  - Task 7 proves it on two real walks with one `roomSeed`.
- **W17. Found-outfit spots wait.**
  - Found outfits step 3 ("The spots for every area", `docs/superpowers/specs/2026-11-19-found-outfits-design.md`) has not landed:
    - main has spots for eight places only (`src/foundwear/spots/`: docks, fair, farm, market, neighborhood, park, seaside, woods);
    - the Rooftops, River, Moor, Pines and Gorge have none;
    - main has no step 3 plan.
    - The Market added its own 12 spots and 4 outfits inside its step 4 (V13).
  - So `spotsIn('house')` stays `[]`, a house walk has no find, solo or in a room, and `FIND_KEY` does not change.
  - Owner question 3 asks whether to do the house's spots and outfits now, as the Market did.
- **W18. Nothing reads the old cat.** Step 3 is not built. No task names her, reads her placeholder name, or adds a friendship record.
- **W19. A walk picked up on the secret stair** (step 2's Review Focus 5, parked untested) is pinned in Task 7.

## Questions only the owner can answer

1. **A partner on another floor** (W12): her name floats over the walls wherever she is, and she is a dot on the corner map. Is that enough, or should the walls also sink between his child's camera and her brother's cat?
2. **Two places at once** (W1): the Market and the Old House both open after 2 town walks, at 150 🐾 each. Keep that, or open the house after, say, 2 Market walks?
3. **Found outfits in the house** (W17): wait for found outfits step 3, or give the house its spots and four outfits now, as the Market did? If now, he and his daughter name them. The spec's ideas are a lace collar and a tiny pair of reading glasses.
4. **The town's front** (W5, W7): an old house's front against the town's west hedge, its door shut, with the house on the map's south-west rim. Is that the right spot, and is a shut door with the prompt right outside? (The hall's door opens as she nears it.)
5. **The hint line** (W11): "Explore every floor, from the attic to the cellar!" Or something his children would rather read?

## Global Constraints

- **Work only in** `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/house`, on branch `house`, with absolute paths.
  - Never write in, or run git or npm in, the main checkout `/Users/pniessen/CLAUDE-CODE/projects/cat-game`.
  - Never merge, push or stash. Never read `.env*`. Dispatch no subagents. No database work: offline-first, nothing contacts the database.
- **Commits:** `git add <exact paths>`, never `-A` or `.`. Every message starts "Old House step 4: " and ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tests:**
  - Run only a task's own files during the task: `npx vitest run test/<file> ...`. The controller runs the full suite (step 1 U2).
  - Tests check behaviour, never source text: no `readFileSync` of `src/` (rule S1). Reading a shipped `public/` file, as the card-picture tests do, is fine.
  - Whole-walk tests carry 60–90 s timeouts. A file over 30 s goes into `test/heavy.js` `HEAVY_COST`.
  - Float fixtures compare with `closeDiffs` (CI is Linux).
  - A test that builds a scene stubs `document` as `test/flattrace.test.js` does, then uses `await import(...)`.
- **Bytes** (`scripts/buildjson.mjs`: start-up at most **720 kB** gzipped, `MAIN_GZIP_CEILING_KB`; a place at most 100 kB):
  - Measure with `npm run build 2>&1 | grep -E "^start-up|^  (house|neighborhood) "`.
  - Task 1 records the baseline: `S0` (start-up), `H0` (house chunk), `N0` (Neighborhood chunk). About 697.4 kB is expected for `S0` (house 693.4 + the Market's ~4).
  - Every task's report gives all three numbers and stays inside its own budget, named in the task. In all:
    - start-up grows by at most **1.0 kB** over `S0`;
    - the house chunk ends at most **H0 + 2.5 kB**;
    - the Neighborhood chunk ends at most **N0 + 3.0 kB**.
  - Over a budget: stop and report. Never trim anything silently.
  - Outside tests, the picture pages and `src/world/areas.js`, nothing imports a `src/world/house*.js` module. Only `neighborhood.js` (and tests and picture pages) imports `oldhousefront.js`. `test/areas.test.js` and `test/lazybuild.test.js` pass.
- **Words:**
  - Every child-facing word goes through `phrase()`, `words()` or `tutorialwords.js`, for both word sets. No series word goes in a string literal outside the tables (`test/clanwords.test.js`).
  - A task that adds a line refreshes the snapshots with `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`. It then reverts every change that is not its own, in particular the spurious `notReached` entries in `test/fixtures/series-words-on-source.json`.
  - Picture-page captions are plain words.
- **Determinism:**
  - Placements are data. Anything varied comes from `hash01(x, z, salt)` or a walk's own salted stream, never `walkRng`, and never `Math.random` in `src/world/house*.js` or `src/world/oldhousefront.js`.
  - `test/fixtures/flat-trace.gameplay.json` must not move: after each task `git status --short test/fixtures` shows only that task's snapshot files.
  - No other place's walk, draws, goals, golden mice, finds, map or look may change. The one exception is the Clan Edition town's new front and gate (W5, W6), as every gate before them.
- **Shared files** (`walk.js`, `main.js`, `progression.js`, `worldmap.js`, `gateways.js`, `goldmice.js`, `hints.js`, `neighborhood.js`): make the smallest edits. Other branches (people, market follow-ups, birthday) change them too.
- **Real-game and picture checks:** a dev server on port **5404**, started with `npx vite --port 5404 --strictPort`. The game stays muted: seed `muted: true`, run Chrome with `--mute-audio`, and never press M.
- **Spec values, verbatim:**
  - "Clan Edition, both word sets … In the clan words it is an old Twoleg nest, and every label goes through the word tables for both word sets. Legacy Edition does not get it".
  - "**World map and front door (owner's choice):** a street place next to the town in `STREET_PLACES` in `src/worldmap.js`, drawn like the others. … The town also gets the house's front door: walking into it enters the house, and walking out of the house's front door returns to that spot in the town".
  - "**Unlock (my proposal):** 150 🐾 after 2 town explores, through `areaOffer` (`src/areaoffer.js`)."
  - "**Co-walk:** both children explore together. Golden mice, discoveries and finds follow the same two-player rules as outdoors: deterministic from the room seed, never from `walkRng`."
  - "**Guided tour:** one short hint the first time she enters".
  - "Both children can explore it together and see each other anywhere in the house."
  - "If the camera ever shows a wall instead of the cat, the house has failed. That holds for any room, any corner and either player."
  - "A partner on another level is always visible."
  - "Stairs, doorways and climbs must work with the same thumb controls as outdoors. No precise jumps."
  - "The house must not be the place that stutters."
  - "No ghosts, no jump scares, no pitch-dark rooms."
  - "the street ceiling of 450 meshes, 380 shadow casters and 70,000 triangles, measured at the worst spot in the house".
  - "On a co-walk, a discovery either child triggers counts for both".

## Review Focus

1. **A save that walked the house through `?house=1` before this step** (`walks.house` 3, not owned, 0 🐾, a house walk note left).
   - Expected: she does not own it. Its card offers it at 150 🐾 only once she has 2 town walks. The note resumes in Clan Edition and is dropped in Legacy.
   - Test: Task 2, `a save that walked the house with the switch keeps nothing it did not buy`.
2. **Two cats at the shut bookcase from opposite sides, or a partner finding the cushion while she plays the piano.**
   - Expected: it opens on both screens and stays open. Each find pays each child once. The clock strikes once for two cats.
   - Test: Task 6, `two cats at the bookcase at once open it once, and it stays open`.
3. **The partner on another floor, behind two walls, then leaving the room mid-walk.**
   - Expected: her name stays over the walls while she is there. Once she has gone, nothing of hers is watched. After the walk, the tags in the next place draw as they always did.
   - Test: Task 6, `a partner who leaves is no longer watched, and the tags are as they were after the walk`.
4. **Buying the house at the town door, walking in at once, then straight back out.**
   - Expected: the moment card, then the hall with no wall between the camera and her, facing in. Back through the hall's door she is on the town's lawn facing east, the house's front behind her.
   - Test: Task 5, `in through the town's door and out through the hall's: she lands facing in, seen`.
5. **A Legacy save whose current place is the house** (a save that switched edition).
   - Expected: Explore walks her own place, the town has no old-house front, and the boot never fetches the house.
   - Test: Task 2, `Legacy never fetches the house or keeps its note`, and Task 4, `a Legacy town has no old house front`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/hints.js`, `src/tutorialwords.js`, `src/game/tips.js` | modify | The hint row, its line, its picture (Task 1). |
| `src/progression.js`, `src/worldmap.js`, `src/ui/territorymap.js`, `src/houseflag.js`, `src/main.js`, `src/world/areas.js` | modify | The catalog row; the map place, its land, its icon and its road; `resumableHouseIds(ids, state)`, `housePrefetch(state)` (Task 2). |
| `src/goldmice.js`, `src/game/walk.js`, `src/world/house.js`, `src/world/housethings.js` | modify | `GOLD_MICE.house`; the `list` seam goes (Task 3). |
| `src/world/oldhousefront.js` | create | `OLD_HOUSE_FRONT`, `buildOldHouseFront(scene, opts) → { group, colliders }`. Neighborhood chunk (Task 4). |
| `src/world/neighborhood.js` | modify | Draws the front when the `town-house` end comes in (Task 4). |
| `src/gateways.js` | modify | The two rows, the header (Task 5). |
| `src/world/houseparts.js`, `src/world/house.js`, `src/world/houselife.js` | modify | The front door's leaves as `house.parts.frontDoor`; it opens for her (Task 5); partners' tags and finds (Task 6). |
| `src/world/housefinds.js` | modify | Watchers per cat; the strike guard (Task 6). |
| `src/world/housetour.js`, `verify-house.html`, `public/places/house.jpg` | modify, create | The `card` shot, the `cowalk` tour, the page's `partner=`; the card picture (Task 9). |
| `test/hints.test.js`, `test/housegame.test.js`, `test/worldmap.test.js`, `test/dressingroom.test.js`, `test/nextthing.test.js`, `test/serieswords.source.test.js`, `test/goldmice.test.js`, `test/goldedition.test.js`, `test/housethings.test.js`, `test/gateways.test.js`, `test/gatewayspots.test.js`, `test/gatecross.test.js`, `test/walkon.test.js`, `test/budget.test.js`, `test/housebudget.test.js`, `test/helpers/housebudget.js`, `test/house.test.js` | modify | As each task says. |
| `test/housefront.test.js`, `test/housedoor.test.js`, `test/housecowalk.test.js`, `test/houseroom.test.js` | create | Tasks 4, 5, 6, 7. |

**Names:**
- The **front** is the old house's front in the town.
- The **front door** is the hall's double door.
- A **watcher** is one cat the finds follow: hers, or a partner's.
- The **partner** is any co-walker in `session.remotes.list`.

---

### Task 1: The house's first-visit hint, and the baseline

**Files:**
- Modify: `src/hints.js` (a row third in `HINTS`, the seam comment), `src/tutorialwords.js`, `src/game/tips.js` (`HINT_PICS`)
- Test: `test/hints.test.js`, the series-words fixtures

**Precedent:** Market step 4 Task 10.

**Interfaces:**
- Produces: hint id `'house'`, `{ id: 'house', max: 1, ring: null, when: (f) => f.place === 'house' }`, third in `HINTS`; `'hint.house': same('Explore every floor, from the attic to the cellar!')`; `HINT_PICS.house = '🕰️'`.

- [ ] **Step 1: Baseline.** Check `git merge-base --is-ancestor c7ffb975 HEAD` (stop and report if it fails). Run `npm run build 2>&1 | grep -E "^start-up|^  (house|neighborhood) "` and record `S0`, `H0` and `N0` in the report.
- [ ] **Step 2: Write the failing tests** in `test/hints.test.js`:
  - `the house's hint goes up on a house walk, once ever`:
    - `update(0.25, { place: 'house', walkNo: 5, t: 0 })` shows `'house'`;
    - with `count('house')` 1 it never shows again;
    - `{ place: 'park' }` never shows it.
  - `it wins over any other hint due then`: with `{ place: 'house', canJump: true, perched: false, walkNo: 5, t: 0 }` it shows `'house'`, not `'jump'`.
  - `HINT_IDS.slice(0, 3)` is `['roofs', 'market', 'house']`, and `hintMax('house')` is 1.
- [ ] **Step 3: Run** `npx vitest run test/hints.test.js`. Expected: FAIL.
- [ ] **Step 4: Implement** the row, the line and the picture. The seam comment says the three place hints lead the table, and why.
- [ ] **Step 5: Run** `npx vitest run test/hints.test.js test/tips.test.js test/tutorialwords.test.js test/progression.tutorial.test.js`. Expected: PASS.
- [ ] **Step 6: Snapshots.** Refresh them. The only lines added are `hint.house` lines; revert everything else. Then run `npx vitest run test/serieswords.tutorial.test.js test/serieswords test/offwords.test.js`. Expected: PASS.
- [ ] **Step 7: Bytes.** Start-up at most `S0 + 0.15` kB.
- [ ] **Step 8: Commit** with the message "Old House step 4: a first-visit hint, 'Explore every floor, from the attic to the cellar!'".

### Task 2: The Old House opens

**Files:**
- Modify:
  - `src/progression.js`: `CATALOG.areas.house`, and the `walks` comment;
  - `src/worldmap.js`: `TOWN_PLACES`, `TOWN_LAND`, the `GATEWAYS` road `town-house`, and the header ("Not on the map: … the House (not built yet)" goes);
  - `src/ui/territorymap.js`: `STREET_ICON.house`;
  - `src/houseflag.js`: header, `resumableHouseIds(ids, state)`, `housePrefetch(state)`;
  - `src/main.js`: the resume line passes `progression.state`; `if (housePrefetch(progression.state)) areas.prefetch('house');`;
  - `src/world/areas.js`: header comment only.
- Test:
  - `test/housegame.test.js`: the turned tests below;
  - `test/worldmap.test.js`, `test/dressingroom.test.js`, `test/nextthing.test.js`;
  - `test/serieswords.source.test.js`: the exemption goes;
  - the series-words fixtures.

**Precedent:** Market step 4 Task 11, test for test.

**Interfaces:**
- Produces:
  - `CATALOG.areas.house` (W1);
  - `TOWN_PLACES[2]` = `{ id: 'house', areaId: 'house', x: 768, y: 648, r: 46 }`;
  - `TOWN_LAND.house` = `'#a3876a'`;
  - `GATEWAYS` gains `town-house` (W4);
  - `resumableHouseIds(ids: string[], state) → string[]`: `isClanEdition(state) ? ids : ids.filter((id) => id !== 'house')`;
  - `housePrefetch(state) → boolean`: `houseOn() && isClanEdition(state)`.
- Consumes: `isClanEdition` (`src/edition.js`), `placeState` (`src/territories.js`), `placeCardFor` (as `test/worldmap.test.js` uses it).

- [ ] **Step 1: Turn the step 1 tests round, failing.** In `test/housegame.test.js`:
  - `has no catalog row: nothing a child picks from offers the house` becomes `the catalog has the house, after the Market, in Clan Edition only`:
    - `CATALOG.areas.house` deep-equals the W1 row;
    - `Object.keys(CATALOG.areas)` has `house` right after `market`;
    - `areaInEdition(CATALOG.areas.house, 'legacy')` is false and `'canon'` true.
  - `its note is dropped without the switch and kept with it; …` becomes `a house walk note resumes in Clan Edition, with the switch or without; Legacy drops it; every other place's is kept either way`:
    - `resumableHouseIds(['park', 'house'], clanState)` is `['park', 'house']` with `setHouse(false)` and `setHouse(true)`;
    - `resumableHouseIds(['park', 'house'], legacyState)` is `['park']`.
  - New, Review Focus 5: `Legacy never fetches the house or keeps its note`:
    - `housePrefetch(legacyState)` is false with `setHouse(true)`;
    - `housePrefetch(clanState)` is true with it and false without it;
    - a Legacy save whose `area` is `'house'`, with Explore through `lifecycle()`, walks her own place (`walks[0].areaOverride` is not `'house'`) and fetches no house pack.
  - New, Review Focus 1: `a save that walked the house with the switch keeps nothing it did not buy`:
    - a save with `walks: { ...fresh, house: 3, neighborhood: 0 }`, not owning the house, 0 points;
    - `placeState(state, CATALOG, 'house')` has `owned` false and `locked` true, with its line from `opensAfterLine`;
    - with 2 town walks and 150 points it is `canOpen`;
    - with 2 town walks and 100 points it is short by 50.
  - `the switch`'s other tests and `Explore with ?house=1`'s tests stay as they are (W3).
  - In `test/worldmap.test.js`:
    - `the Old House is on the map on the town's south-west rim, open to unlock`:
      - `TOWN_PLACES[2]` equals the row;
      - its region has `kind: 'town'`, name 'The Old House' in the everyday words and `PLACE_WORDS.house` of the clan set in the clan words, `status: 'built'`, and `locked: true, owned: false, price: 150` for a fresh save;
      - it straddles the town's rim (`dist < town.r + r - 20`);
      - it clears the Woods', the Docks', the Market's and the Rooftops' circles and every road by 8;
      - `hit(t, 768, 648).areaId` is `'house'`.
    - `its card offers it for 150 🐾 once the town walks are done`:
      - with 1 town walk the card's line contains `'1/2'`, `action: null`;
      - with 2 walks and 150 🐾 it is `{ action: 'open', label: 'Open for 150 🐾' }`;
      - owned, it is `action: 'go'`;
      - with `touch: true` its line says Tap where a street place's would.
    - The gateways test becomes "eight gateways …", with `['town-house', 'neighborhood', 'house']` and `HOUSE_ROAD` pinned like `MARKET_ROAD`. The road starts on the town's edge and ends on the house's (each within 2 units).
    - `regionOf(worldMapModel(legacySave, CATALOG), 'house')` is undefined.
  - In `test/dressingroom.test.js`: Clan Edition lists the house, with the picture path `PLACE_PICTURE('house')`. Legacy's list is unchanged.
  - In `test/nextthing.test.js`: `at 1 town walk the home line still names the Woods alone`.
  - In `test/serieswords.source.test.js`: delete the two `house` lines in "every rank, outside and place word is recorded inside a line".
- [ ] **Step 2: Run** `npx vitest run test/housegame.test.js test/worldmap.test.js test/dressingroom.test.js test/nextthing.test.js`. Expected: FAIL on exactly the turned and new tests.
- [ ] **Step 3: Implement** W1, W3 and W4. The new comments name this plan and the ruling. Pick the road's four points from a map picture (`verify-worldmap.html` or the real game's Change place on port 5404) and look at it.
- [ ] **Step 4: Run** the Step 2 files, plus `npx vitest run test/placecard.test.js test/homebase.map.test.js test/homebase.edition.test.js test/territories.test.js test/unlockorder.test.js test/gifts.test.js test/rooms.test.js test/lobby.test.js test/walkresume.test.js test/walkready.test.js test/progression.test.js test/edition.test.js test/spendconfirm.test.js test/foundwear.test.js test/foundjournal.test.js test/marketgame.test.js test/roofsgame.test.js test/houseload.test.js test/areas.test.js test/lazybuild.test.js test/flattrace.test.js`. Expected: PASS. Skip any file that does not exist and say so.
- [ ] **Step 5: Snapshots.** Refresh them. The added lines name the house (its card, its map label, its Get it?, its lock lines) and nothing else moves. Where the stand-in-word-set test finds an 'on'-set word, fix the word's source, not the test. Then run `npx vitest run test/serieswords test/offwords.test.js test/clanwords.test.js test/wordset.test.js test/serieswords.source.test.js`. Expected: PASS.
- [ ] **Step 6: Bytes.** Start-up at most `S0 + 0.55` kB (Tasks 1–2 together).
- [ ] **Step 7: Commit** with the message "Old House step 4: the Old House opens in Clan Edition, 150 🐾 after 2 town walks; a place on the town's south-west rim on the world map; its walk note resumes in Clan Edition, and Legacy never fetches it; ?house=1 stays as a developer shortcut".

### Task 3: The house's golden mice join the count

**Files:**
- Modify: `src/goldmice.js` (`GOLD_MICE.house`, the `list` option goes, the `GOLD_TOTAL` comment), `src/game/walk.js` (the `|| areaData.goldMice` clause and the `list:` argument go), `src/world/house.js` (no `goldMice` in `areaData`), `src/world/housethings.js` (comment: `HOUSE_GOLD_MICE` is the house's own list, held equal to `GOLD_MICE.house`)
- Test: `test/goldmice.test.js`, `test/goldedition.test.js`, `test/housethings.test.js`, `test/housegame.test.js`, and every test that pins 42 (`test/docks.test.js`, `test/fair.test.js`, `test/farm.test.js`, `test/roofs.test.js`, `test/market.test.js` if it pins it)

**Interfaces:**
- Produces: `GOLD_MICE.house` = the three rows of `HOUSE_GOLD_MICE` (ids `gm-house-1..3`, x/z/y as built), last key; `GOLD_TOTAL` 45; `createGoldMice(scene, areaId, foundIds, { ground, rng })`, as on main before the house.

- [ ] **Step 1: Write the failing tests:**
  - `test/goldmice.test.js`: `GOLD_TOTAL is 45`, extending the history comment ("42 until the Old House added its three").
  - `test/housethings.test.js`: `the house's golden mice are GOLD_MICE.house`, which deep-equals `HOUSE_GOLD_MICE`.
  - `test/goldedition.test.js`: `the house's mice count in Clan Edition only`:
    - `goldForEdition('canon', CATALOG)` has all three `gm-house-*` ids;
    - `goldForEdition('legacy', CATALOG)` has none, and its size equals that of `goldForEdition('legacy', catalogWithoutHouse)`.
  - `test/housegame.test.js`: `a golden mouse found in the house is saved, and the tally stays 39 until step 4` becomes `a golden mouse found in the house is saved and counts: Clan Edition reads 45, Legacy as before`. Through `lifecycle()`, a house walk lays its three mice from `GOLD_MICE.house`. One found is in `state.golden`, and the home tally's total reads 45 in Clan Edition.
  - The 42 pins elsewhere become 45, with their comments extended.
- [ ] **Step 2: Run** `npx vitest run test/goldmice.test.js test/goldedition.test.js test/housethings.test.js test/housegame.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** W9.
- [ ] **Step 4: Run** the Step 2 files plus `npx vitest run test/docks.test.js test/fair.test.js test/farm.test.js test/roofs.test.js test/market.test.js test/journal.test.js test/skills.test.js test/flattrace.test.js test/lazybuild.test.js`. Expected: PASS, with the flat trace unchanged.
- [ ] **Step 5: Bytes.** Start-up at most `S0 + 0.65` kB (Tasks 1–3). The house chunk is no bigger than after Task 2.
- [ ] **Step 6: Commit** with the message "Old House step 4: the house's three golden mice count, 45 in Clan Edition, Legacy as before; the walk's own-list seam goes".

### Task 4: The old house's front in the town

**Files:**
- Create: `src/world/oldhousefront.js`
- Modify: `src/world/neighborhood.js` (`build(scene, { water, wind, gateEnds = [] })`; the front's colliders join `colliders`)
- Test: `test/housefront.test.js` (create), `test/budget.test.js` (only if its Neighborhood case needs the end handed in)

**Interfaces:**
- Produces:
  - `OLD_HOUSE_FRONT` = `{ x0: -54, x1: -44, z0: 24, z1: 38, door: { x: -44, z: 31 } }`, frozen;
  - `buildOldHouseFront(scene, { wind } = {}) → { group, colliders }`. The group is named `'oldhousefront'`. `colliders` are `{ x, z, r }` circles round the footprint, r ≤ 0.7, at most 1.0 m apart, none in front of the door within 1.2 m of `(door.x + 0.45, door.z)`;
  - `neighborhood.build` draws it only when `gateEnds.some((e) => e.id === 'town-house')`.
- Consumes: `builder.js`'s primitives and the dusk window tag `builder.house()` uses.

- [ ] **Step 1: Write the failing tests** in `test/housefront.test.js`. Stub `document` and import as `test/flattrace.test.js` does. `END` = `{ id: 'town-house', to: 'house' }`.
  - `the town draws the old house's front only for a walk that has its door`:
    - a bare `build(scene)` and a `build(scene, { gateEnds: [] })` have no `'oldhousefront'` object;
    - their colliders, perches, POIs, collectibles and scenics deep-equal each other;
    - with `{ gateEnds: [END] }`, the scene has `'oldhousefront'`, and the colliders are the bare list plus the front's.
  - Review Focus 5: `a Legacy town has no old house front`. A Legacy walk through `lifecycle()` in the Neighborhood has no `'oldhousefront'` object in its scene. A Clan Edition walk owning nothing has one.
  - `it stands against the west hedge, clear of everything the town puts there`. With the end:
    - the footprint lies inside `bounds`;
    - every POI, collectible, scenic, perch, box, tippable, critter spawn, `GOLD_MICE.neighborhood` mouse and `spotsIn('neighborhood')` spot is at least 3 m from the footprint's rectangle;
    - every other collider is 1.2 m clear of it;
    - the flood from `SPAWN` (`test/helpers/flood.js`, `isWalkableAt`) still reaches every find spot, POI, collectible and golden mouse;
    - the spot `(door.x + 1.2, door.z)` is walkable and on the flood.
  - `it is cheap`: built with the end, then `mergeStaticProps` as the walk does. The front's meshes are at most 6, its casters at most 4, its triangles at most 2,500. The Neighborhood's whole budget with the end stays under 450 / 380 / 70,000 (`budgetOf`, as `test/budget.test.js` counts).
  - `its windows glow at dusk like the town's houses`: after `applyDusk` with the end, the front's window material is lit as a `builder.house()` window's is.
  - `it draws on no random stream`: a `Math.random` spy counts 0 calls inside `buildOldHouseFront`.
- [ ] **Step 2: Run** `npx vitest run test/housefront.test.js`. Expected: FAIL (no module).
- [ ] **Step 3: Implement** W5. Use the shared `builder.js` kit and as few materials as it takes.
- [ ] **Step 4: Run** `npx vitest run test/housefront.test.js test/budget.test.js test/flattrace.test.js test/foundspots.test.js test/spots.test.js test/lazybuild.test.js test/areas.test.js`. Expected: PASS, with the flat trace unchanged.
- [ ] **Step 5: Look at it.** On port 5404, in the real game in Clan Edition, walk to the front by day and at dusk. Save `front-check.png` to the scratchpad's `house-step4/`. Fix what reads wrong.
- [ ] **Step 6: Bytes.** Start-up unchanged since Task 3 (±0.05 kB). The Neighborhood chunk at most `N0 + 3.0` kB.
- [ ] **Step 7: Commit** with the message "Old House step 4: the old house's front stands against the town's west hedge, drawn only for a walk that has its door (Clan Edition)".

### Task 5: The gateway pair, and the hall's door opening for her

**Files:**
- Modify:
  - `src/gateways.js`: the two rows (W6), and the header's reserve sentence;
  - `src/world/houseparts.js`: the front door's two leaves as pivots;
  - `src/world/house.js`: `build` reads `gateEnds`, and hands `house.parts.frontDoor` when a `house-town` end comes in;
  - `src/world/houselife.js`: the door opens and shuts (W7).
- Test: `test/gateways.test.js`, `test/gatewayspots.test.js`, `test/gatecross.test.js`, `test/walkon.test.js`, `test/housedoor.test.js` (create), `test/budget.test.js` ("with the gateways")

**Precedent:** Market step 4 Task 12. The alley door's own test in `test/gatewayspots.test.js`.

**Interfaces:**
- Consumes: `OLD_HOUSE_FRONT` (Task 4); `HOUSE_FRONT_DOOR`, `HOUSE_BOUNDS`, `HOUSE_SPAWN` (`houseplan.js`).
- Produces:
  - the rows `town-house` and `house-town`, exactly as W6;
  - `arrivalFor('town-house')` = `{ areaId: 'house', x: 0, z: 7.95, yaw: 0 }`;
  - `arrivalFor('house-town')` = `{ areaId: 'neighborhood', x: -39.9, z: 31, yaw: -Math.PI / 2 }`;
  - exported from `houselife.js`: `FRONT_DOOR_NEAR = 2.4`, `FRONT_DOOR_FAR = 2.9`, `FRONT_DOOR_OPEN = 1.2`, `FRONT_DOOR_S = 0.4`;
  - `house.parts.frontDoor = { left, right }` (`THREE.Object3D` pivots at the hinges), or `null` with no `house-town` end;
  - house life's `frontDoorOpen` getter.

- [ ] **Step 1: Write the failing tests.**
  - `test/gateways.test.js`:
    - the row table gains both rows;
    - "every map road has one end on each side, and the two ends twin each other" covers `town-house`;
    - the two `arrivalFor` values above.
  - `test/gatewayspots.test.js`:
    - The house joins `MODS`, as `{ build: house.build, SPAWN: HOUSE_SPAWN }`, built with `gateEnds: endsFor('house')` (stub `document` first if the build needs it).
    - The end count becomes sixteen: twelve on an edge and four inside (`roofs/roofs-town`, `market/market-town`, `neighborhood/town-house`, `house/house-town`), in nine areas.
    - `the old house's door in town stands at its front`:
      - z within 0.01 of `OLD_HOUSE_FRONT.door.z`, and x 0.45 in front of the door;
      - a walkable spot on the flood within `GATE_REACH`;
      - both posts 1.2 m from every collider but the front's own;
      - 3 m from the spawn and every POI, collectible, scenic, perch, golden mouse and find spot.
    - `the hall's front door stands in the hall's south wall`:
      - x equals `HOUSE_FRONT_DOOR.x`, and z within 0.5 of `HOUSE_FRONT_DOOR.z`;
      - a walkable spot within `GATE_REACH` reached on foot from `HOUSE_SPAWN`;
      - 3 m from every POI, collectible, scenic, golden mouse and find anchor (`HOUSE_FINDS`).
    - The arrival rule ("every arrival spot is clear, walkable and reachable") covers both new arrivals.
  - `test/gatecross.test.js`:
    - `gateMomentHtml({ name: 'The Old House' })` holds "Off to the Old House!";
    - the town door's `gateStatus`:
      - with 1 town walk it is `shut`, with the line `phrase('gate.shut', 2, lower(placeName('neighborhood', 'canon', CATALOG)), 1)`;
      - with 2 walks and 150 🐾 it is `buy`;
      - with 2 walks and 100 🐾 it is `short`, needing 50;
      - owned, it is `go`;
    - the hall's door is always `go`.
  - `test/walkon.test.js`, each with a 90 s timeout:
    - a Clan Edition town walk that owns the house walks on through `town-house`, and the house walk starts at (0, 7.95) facing north;
    - back through `house-town`, the town walk starts at (−39.9, 31) with `yaw` −π/2;
    - Review Focus 4, `in through the town's door and out through the hall's: she lands facing in, seen`: the same two walk-ons, a buy at the town door first (2 walks, 200 🐾: the gate's buy, then the walk-on). After each walk-on's first settled frame, house life's sink has no section standing between the camera and her (as `opens on her, not the front wall` checks), and the town arrival faces away from the front.
    - `a Legacy town has no house door` (no gate prompt at (−42.5, 31)).
  - `test/housedoor.test.js`. Build the house with `gateEnds: endsFor('house')`, then make its life:
    - `the hall's door opens as she comes to it and shuts once she has gone`:
      - at (0, 9.0) it is open after `FRONT_DOOR_S` (both leaves at `FRONT_DOOR_OPEN` within 0.01);
      - at (0, 5) it is shut again after `FRONT_DOOR_S`;
      - between `FRONT_DOOR_NEAR` and `FRONT_DOOR_FAR` it keeps its state.
    - `it opens outward, never through her`: every sample of each leaf's far edge, from shut to open, has z ≥ `HOUSE_FRONT_DOOR.z`. No collider is added or removed.
    - `under reduced motion it opens at once`.
    - `without a house-town end it stays shut` (`parts.frontDoor` is `null`, and nothing moves).
    - `it draws on no stream` (a `Math.random` spy counts 0).
  - `test/budget.test.js` "with the gateways": the Neighborhood (four signposts and the front) and the house stay inside the same ceilings, built and merged.
- [ ] **Step 2: Run** `npx vitest run test/gateways.test.js test/gatewayspots.test.js test/gatecross.test.js test/walkon.test.js test/housedoor.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** W6 and W7. If a clearance rule fails, move the house arrival within W6's range and say so in the commit. The door's open angle and timing are local looks: they are not sent, and they draw on no stream.
- [ ] **Step 4: Run** the Step 2 files plus `npx vitest run test/budget.test.js test/worldmap.test.js test/crossing.test.js test/crossinglock.test.js test/gatewaylook.test.js test/marketcowalk.test.js test/roofscowalk.test.js test/housegame.test.js test/housecamera.test.js test/house.test.js test/flattrace.test.js`. Expected: PASS, with the flat trace unchanged.
- [ ] **Step 5: Bytes.** Start-up at most `S0 + 0.9` kB (Tasks 1–5). The house chunk at most `H0 + 0.8` kB.
- [ ] **Step 6: Commit** with the message "Old House step 4: the old house's door in town and the hall's front door are one gateway; walk through either and go straight on; the hall's door opens as she comes to it".

### Task 6: A partner anywhere in the house, and discoveries for both

**Files:**
- Modify: `src/world/houselife.js` (`update(dt, t, catPos, camera, session)`; the partners' tags; the door watches partners too), `src/world/housefinds.js` (watchers; the strike guard)
- Test: `test/housecowalk.test.js` (create), `test/housefinds.test.js` (only where a signature changes, under the D18 rule: name each edit)

**Interfaces:**
- Consumes: `session.remotes.list`, entries `{ group, tag, h }` (`src/remotecats.js`), handed by `main.js` as the life's fifth argument; `HOUSE_FINDS`, `HOUSE_ROOMS`.
- Produces:
  - `HOUSE_TAG_ORDER = 20`, exported from `houselife.js`;
  - `createHouseFinds(...)`'s `update(dt, t, catPos, camPos = null, partners = NONE)`. `partners` is an array of remote entries; each one's position is `entry.group.position`;
  - `finds.watching → number`: the watchers now, hers included;
  - `finds.striking → boolean`;
  - the strike is guarded: none starts while `striking`. `striking` lasts `n * BONG_GAP + 1.0` s;
  - a partner's cushion purrs at 0.6.

- [ ] **Step 1: Write the failing tests** in `test/housecowalk.test.js`. Build the house and its life as `test/housefinds.test.js` does, with a stand-in log (`awardOnce` recorded), audio (calls recorded) and a fake `session = { remotes: { list } }`. Each entry is `{ group: new THREE.Group(), tag: new THREE.Sprite(new THREE.SpriteMaterial()), h: 0 }`, placed with `group.position.set(x, floor.y(x, z), z)`.
  - `a partner standing at the bookcase opens it on this screen too, swinging away from her`:
    - my cat in the hall and the partner held at the bookcase's stair side for 0.6 s: `finds.open` is true, it paid `house-find-bookcase` once, and the leaf ends at `SECRET_OPEN_ROT_Y`;
    - from the library side it ends at `SECRET_STAIR_ROT_Y`;
    - the open colliders are in the walk's live list.
  - `a find a partner makes pays this child too, once`:
    - the partner still on the cushion for 1.5 s pays `house-find-cushion` and purrs at 0.6;
    - the partner on the window seat's ledge pays `house-find-window`;
    - the partner walking six keys of the piano pays `house-find-piano` and plays six notes;
    - doing each again pays nothing more.
  - Review Focus 2, `two cats at the bookcase at once open it once, and it stays open`:
    - both hold at it from opposite sides on the same frames: one `awardOnce`, one swing, open at the end;
    - two cats at the clock's foot for 1.0 s give one `playTune` call (`striking` true until it ends);
    - after both walk off and come back, one more strike.
  - `her name shows over the walls wherever she is in the house`. For the partner at each room's centre (`HOUSE_ROOMS`) and my cat at each other room's centre, after one `update`:
    - the partner's `tag.visible` is true;
    - its `material.depthTest` is false;
    - its `renderOrder` is `HOUSE_TAG_ORDER`;
    - `group.visible` is true: no level drawing hides any cat, as step 1 promised.
  - Review Focus 3, `a partner who leaves is no longer watched, and the tags are as they were after the walk`:
    - after the partner is dropped from `list` (a new array), `finds.watching` is 1 and her later moves pay nothing;
    - `dispose()` puts every tag it touched back to `depthTest` true and its first `renderOrder`.
  - `the hall's door opens for a partner too` (`frontDoorOpen` with only the partner at (0, 9.0)).
  - `a solo walk is as it was`. With no session, or `session.remotes` undefined:
    - `finds.watching` is 1;
    - every step 2 find test still holds (run `test/housefinds.test.js`);
    - nothing is allocated per frame after the first (`finds.update` called 600 times with an unchanged list creates no watcher).
  - `it draws on no stream`: a `Math.random` spy counts 0 over 600 frames with two partners.
- [ ] **Step 2: Run** `npx vitest run test/housecowalk.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** W12 and W13.
  - Watchers live in a `Map` from entry to state. A watcher is made when its entry is first seen and dropped when the list changes and no longer holds it, so a frame with an unchanged list allocates nothing.
  - Hers is the first watcher.
  - The bookcase's side comes from the cat whose hold completed.
  - The tags are set each frame. This is cheap, and a co-walker who joins mid-walk gets hers at once.
- [ ] **Step 4: Run** `npx vitest run test/housecowalk.test.js test/housefinds.test.js test/housesecret.test.js test/housesound.test.js test/housegame.test.js test/housecamera.test.js test/remotecats.test.js`. Expected: PASS.
- [ ] **Step 5: Bytes.** Start-up unchanged since Task 5 (±0.05 kB). The house chunk at most `H0 + 2.2` kB.
- [ ] **Step 6: Commit** with the message "Old House step 4: a partner's name shows over the walls anywhere in the house; a discovery either child makes counts for both, the bookcase opens on both screens, and two cats hear one strike".

### Task 7: Two children in the house, on real walks

**Files:**
- Test: `test/houseroom.test.js` (create)
- Modify: only what a failing test shows is wrong (smallest edit, in the house chunk where it can be), named in the report

**Precedent:** `test/marketgame.test.js` "a room walks the Market like any place", `test/marketcowalk.test.js`, `test/roofscowalk.test.js`.

**Interfaces:**
- Consumes: `lifecycle()` (`test/helpers/walklife.js`); `decideWalkOnHave`, `walkOnMove`, `pickOnCrossing` (`src/gatecross.js`); `planFind`, `roomFindRoster` (`src/foundwear/rules.js`); `FIND_KEY`, `findSpotsKey`, `spotsIn` (`src/foundwear/spots/index.js`).

- [ ] **Step 1: Write the tests** in `test/houseroom.test.js`, each with a 90 s timeout:
  - `a room walks the house like any place`:
    - a proposal naming the house starts the walk on both members with `{ roomSeed, areaOverride: 'house' }`;
    - a guest who does not own it walks it by `'override'`;
    - a Legacy guest walks it by override, and her save's `area` is never set to `'house'`.
  - `a room walks on through the front door only when every device has the house`. `decideWalkOnHave` via `town-house`:
    - one member not ready: `wait`, and nobody moves;
    - every member ready: `go`;
    - the same back through `house-town`;
    - a catalog without the house's row has no gate.
  - `a guest who does not own the house walks it as an override, and a crossing never buys it`. `walkOnMove` and `pickOnCrossing`, as the Market's test does: her points and unlocks are unchanged.
  - `two walks with one roomSeed agree: the same mice at one clock, no Mochi, the same golden mice`:
    - two `lifecycle` house walks with `roomSeed: 4242` and a save that has Mochi;
    - after the same 300 frames, every mouse critter's position is equal within 1e-6 on both;
    - neither walk has a kitten;
    - both lay the same `gm-house-*` mice;
    - a walk with `roomSeed: 777` places the critters differently, or the test says why the house's mice are seed-free.
  - `a house walk hides no find, solo or in a room`:
    - `spotsIn('house')` is `[]`;
    - `planFind` for a house walk, solo and with `roomFindRoster`, plans none;
    - `FIND_KEY` equals `findSpotsKey()` (no spot added).
  - Step 2's Review Focus 5, `a walk picked up on the secret stair finds her on it, the bookcase shut, and it opens for her from the stair`:
    - a walk note at the stair's middle ((−6, −2), at the stair's height);
    - after the resume she stands on the stair, within 0.05 m of its height, and the bookcase is shut;
    - walking down to it and holding 0.6 s opens it into the library;
    - nothing pays twice (the note's log entries are back).
  - `every other place walks as it did`: run `test/flattrace.test.js` (gameplay part unchanged), and a Park and a town walk with one `roomSeed` roll the same goals, mice, knock-overs and yarn spot as `test/housegame.test.js`'s "every other place is as it was" pins.
- [ ] **Step 2: Run** `npx vitest run test/houseroom.test.js test/flattrace.test.js`. Expected: PASS. If one fails, fix the code it names with the smallest edit, and say so in the report.
- [ ] **Step 3: Bytes.** Start-up at most `S0 + 1.0` kB. The house chunk at most `H0 + 2.5` kB.
- [ ] **Step 4: Commit** with the message "Old House step 4: two children in the house, proved on real walks: a room walks it and through its doors together, the same mice on both screens, no kitten, no find yet; a walk picked up on the secret stair".

### Task 8: The two-cat worst spot

**Files:**
- Modify: `test/helpers/housebudget.js`, `test/housebudget.test.js`
- Modify: nothing in `src/` unless a ceiling fails. Then report before any change, which goes to the house chunk: simpler far levels or furniture first, never the cats.

**Interfaces:**
- Consumes: `measureHouse`, `houseWorstSpot` (`test/helpers/housebudget.js`); the cat and Mochi as `test/housebudget.test.js` builds them today; `CATALOG.accessories` and each wearable's builder.
- Produces, in `test/helpers/housebudget.js`:
  - `heaviestWear() → { [slot]: id }`: the shipped wearable with the most triangles per slot (head, face, neck, collar, back, body, feet), picked by building each one;
  - `withCats(scene, n, { dressed = false, tag = false }) → THREE.Object3D[]`: adds n cats (and a name tag on each but the first when `tag`), returning them for removal.

- [ ] **Step 1: Write the tests** in `test/housebudget.test.js`:
  - `with two dressed cats and her tag, every level is under 450 meshes, 380 casters, 70,000 triangles (day/dusk, bookcase shut/open)`. Use `it.each` over the four cases; each case checks every level.
  - The existing `… with the walk's own things and Mochi …` test stays (the solo worst spot).
  - `the room's worst spot and the solo worst spot are reported`. A `console.info` line for each of: the cat alone, one cat with Mochi, two plain cats, two dressed cats. Each line gives level, meshes, casters and triangles. Nothing is asserted against the aims but the cat alone (S2-15).
- [ ] **Step 2: Run** `npx vitest run test/housebudget.test.js`. Expected: PASS. (Step 2 measured two plain cats at 305–310 meshes and 64k triangles.) If a ceiling fails, stop and report the figures.
- [ ] **Step 3: Commit** with the message "Old House step 4: the two-cat worst spot holds the spec's ceilings, dressed cats and her tag included; solo with Mochi as before".

### Task 9: The card picture, the pictures, the films and both builds

**Files:**
- Create: `public/places/house.jpg`
- Modify:
  - `src/world/housetour.js`: a `card` shot, `shot([1, 6], [0.4, -1], 2, 'The Old House')` (the builder may pick another spot that shows the hall and the stair); a `cowalk` tour (her from the hall up the main stair to the bedroom, the partner waiting in the cellar);
  - `verify-house.html`: `partner=x,z` puts a co-walker there through `createRemoteCats` (a stand-in profile and one state), and hands house life `{ remotes }`;
  - `test/house.test.js`: the card picture's test.
- Nothing else in the repo, unless a picture shows a fault. A fix then goes back to its task's files, with a test where one can pin it.

**Precedent:** Market step 4 Task 14; the step 2 plan's pictures task.

- [ ] **Step 1: The card picture.**
  - Test, in `test/house.test.js`: `the card picture is shipped (a JPEG, about the size of the others)`. The first two bytes are `0xff 0xd8`, and the length is between 5,000 and 60,000.
  - Run `npx vitest run test/house.test.js` and see it fail.
  - Shoot `verify-house.html?shot=card&size=640x360&label=0` with `scripts/record-page.mjs` on port 5404. Convert it with `sips -s format jpeg -s formatOptions 80` to `public/places/house.jpg`, and look at it.
  - Run the test again. Then run `npx vitest run test/housetour.test.js`: the new shot and tour pass the shot and tour tests.
- [ ] **Step 2: Builds.** Run `npm run build`: start-up at most `S0 + 1.0` kB and at most 720 kB; the `house` chunk at most `H0 + 2.5` kB; the `neighborhood` chunk at most `N0 + 3.0` kB; every place under 100 kB. Then run `npm run build:ios`. Record all three sizes.
- [ ] **Step 3: Pictures** go in `/private/tmp/claude-501/-Users-pniessen--claude-spares-spare-gcns3j/e37e3895-a9b0-4a89-9360-a15387ffb2e4/scratchpad/house-step4/`, on port 5404 (muted save, `--mute-audio`). They are phone size (375 × 812) unless said. Real-game pictures come from a scratchpad driver over the DevTools protocol, as Market step 4's did. Nothing new goes in the repo for it.
  - **The town front door:**
    - `front-day.png` and `front-dusk.png`, the front from the lawn;
    - `gate-town-shut.png` (1 town walk), `gate-town-buy.png` (2 walks, 200 🐾) and `gate-town-open.png` (owned).
  - **Walking in and out:**
    - `moment-off-to-house.png`;
    - `arrived-hall.png` (through the door, facing in);
    - `door-open.png` (the hall's door open as she comes to it);
    - `arrived-town.png` (back out, the front behind her).
  - **The world-map place:**
    - `map-locked.png` (1 town walk);
    - `map-open.png` (owned).
  - **The unlock card:**
    - `map-card-offer.png` and `getit-offer.png` (2 town walks, 200 🐾).
  - **The tour hint:** `hint-house.png`, on the first house walk.
  - **The co-walk with two cats on two levels:**
    - `cowalk-two-levels.png`: her in the parlour, the partner in the attic, from `verify-house.html?partner=…`;
    - `cowalk-two-levels-dusk.png`;
    - `cowalk-cellar.png`: her upstairs, the partner in the cellar.
  - **Day and dusk in the house:** `hall-day.png`, `hall-dusk.png`, `parlour-day.png` and `parlour-dusk.png`, at 960 × 540 from `verify-house.html`.
  - **The words and Legacy:**
    - `everyday-words.png`: the map and the town's gate prompt in the everyday set;
    - `dressingroom-legacy.png`: no house card.

  Look at every picture yourself. Note anything that reads wrong, a partner floating over a far level's stand-in above all.
- [ ] **Step 4: Films**, muted (`-an`), in the same folder:
  - `in-and-out.mp4`, 20–40 s, from the real game: down the town's lawn to the front, the prompt, the moment, the hall, a turn about, out through the hall's door (it opens), and back on the town's lawn.
  - `cowalk.mp4`, 10–20 s: `record-page.mjs --tour cowalk` on `verify-house.html?partner=25,-5`. Her name over the walls is in view the whole way.
- [ ] **Step 5: Run** `npx vitest run test/flattrace.test.js test/flattrace.offwords.test.js test/budget.test.js test/housebudget.test.js test/housegame.test.js test/houseroom.test.js test/housecowalk.test.js test/walkon.test.js test/gatewayspots.test.js`. Expected: PASS, with the flat trace unchanged.
- [ ] **Step 6: Commit** `public/places/house.jpg`, `src/world/housetour.js`, `verify-house.html` and `test/house.test.js`, with the message "Old House step 4: the place card's picture, a co-walk tour and a partner on the picture page".
- [ ] **Step 7: The report** for the controller and the owner:
  - the pictures' and films' paths;
  - the three sizes against `S0`, `H0` and `N0`;
  - the two-cat figures from Task 8;
  - owner questions 1–5;
  - the note that the full suite and the final review are the controller's, and that merge and push wait for the owner's yes.

---

## Self-review (done while writing)

- **Spec coverage, "Build order" item 4:**
  - the world-map place (Task 2);
  - the unlock (Task 2);
  - the card picture (Task 9);
  - both word sets (Tasks 1, 2, 5, every snapshot refresh);
  - co-walk checks (Tasks 6–8);
  - found-outfit spots, waiting by W17, pinned in Task 7;
  - the tour hint (Task 1).
- **"Fit with the game":**
  - Clan Edition only (W2, Tasks 2–5);
  - the front door both ways (Tasks 4–5);
  - the unlock through `areaOffer` (Task 2);
  - co-walk determinism (Tasks 6–7);
  - the guided tour (Task 1).
- **Anti-goals:**
  - lost behind walls, either player: the arrivals in Task 5, the partner's tag in Task 6;
  - fiddly: the doors are a prompt, and the hall's door opens by itself;
  - slow: Task 8;
  - scary: no change.
- **Parked items for step 4:**
  - the bookcase for both (Task 6);
  - a partner on another level (Task 6);
  - two-cat figures and Mochi (Task 8);
  - the gold tally (Task 3);
  - the secret-stair resume (Task 7);
  - the Legacy prefetch and resume edition (Task 2).
- **Names across tasks:**
  - `OLD_HOUSE_FRONT` (Task 4 → Task 5);
  - `HOUSE_TAG_ORDER`, `FRONT_DOOR_*`, `frontDoorOpen` (Tasks 5 → 6);
  - `resumableHouseIds(ids, state)` and `housePrefetch(state)` (Task 2 only);
  - `HOUSE_GOLD_MICE` = `GOLD_MICE.house` (Task 3).
