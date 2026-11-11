# Clan Edition: the Moor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Moor as the third all-new Clan Edition territory: open heather, granite tors, a few lone trees, rabbits and wind, on the Woods' north border, walkable by both kids and opened from the home-screen territory map after two Woods walks.

**Architecture:** A new outdoor area, `src/world/moor.js`, built the way `src/world/woods.js` is: content records first, `KEEP_CLEAR` built from them, seeded scenery that keeps clear of it, water footprints with dry decks, and a side-tinted horizon. Its south edge continues the Woods' north edge exactly (the river, the lake and the north path). It adds four small builder pieces (heather, gorse, tors, burrows) and one critter (a rabbit), is registered in the tables the Woods used, flips from `'soon'` to `'built'` in `src/territories.js`, and feeds the colony only after the owner's SQL edit.

**Tech Stack:** Vanilla JS, Three.js 0.185, Vite 8, Vitest 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-editions-and-territories-design.md` (Owner's answers 1–10, §3, §4, §8 step 5). Template and foundation: `docs/superpowers/plans/2026-10-31-clan-edition-woods.md` (merged to main at `4b09d01`; its Task 11, colony feeding, is still held for the owner's SQL).

**Why the Moor.** §8's order is 4 the River and Marshes, 5 the Moor, 6 border crossings, 7 the Pines and Swamp. Border crossings are not a territory, so the territory after the River is the Moor. The tie-break the brief asks for agrees:

| | The Moor | The Pines and Swamp |
|---|---|---|
| Shares with the built Woods | the river (it leaves the Woods' north edge at x 18–23), the lake (the Woods' lake runs on north past its edge), the north path (x 46), the Woods' heather-tinted north horizon | nothing: no shared border |
| Shares with the planned River | nothing: no shared border | its whole south border (they overlap a little) |
| Unlocks after (§3) | 2 Woods walks: playable the day it ships | 2 River walks: needs the River shipped and walked first |
| Extra design it pulls in | none | the island bridge's shore and the truce path (decision 8) |

So the Moor builds on what is shipped, not on a plan still under review, and the Pines naturally follows the River. **Decided by the owner (2026-10-31): the Moor comes next, before the Pines and Swamp.**

## Global Constraints

- `SAVE_VERSION` stays 4. New save content is the `moor` key in `walks` and `marks` (additive, defaulted), the `'moor'` unlock id, and the `'rabbit'` journal type. `moor` is already in `TERRITORY_AREAS` (`src/colony.js`), so the colony keeps Moor cats on any build with the Woods foundation.
- The clan spec's §8 invariants hold: **no cat un-tames, no cat is dropped, a v4 save still loads, `COLONY_MAX` (24) and `SOLO_MAX` (12) are unchanged.**
- The area id is `moor`; the catalog record is `{ name: 'The Moor', price: 0, requires: { area: 'woods', walks: 2 }, edition: 'canon' }` (spec §3, "Unlocking territories").
- An area builds identically in both editions: `src/world/moor.js` never reads the edition. Nothing on the wire changes. The rabbit is an ordinary critter from `critterSpawns`, the same on both devices.
- No rival patrol, legendary cat, kittypet wanderer, walkable island, or prop set beyond three burrows as `hides` (Task 4) in the Moor in this plan.
- Sea Legs is a shortcut, never a key: everything on the lakeshore heath is reachable dry over a deck.
- Budget: the Cozy Neighborhood's. At most 450 meshes, 380 casters and 60,000 triangles as built; 260 meshes and 205 casters merged (`test/budget.test.js`). The Woods measured 172 / 152 / 44,462 built.
- Every borrowed *Warrior Cats* word stays in `src/clanwords.js`. This plan adds none: its labels are plain moorland words ("the high tor", "the old hawthorn", "the rabbit warren").
- **The Woods needs no change.** Its north edge already carries the river (x 18–23), the lake (x ≤ −14) and the north path (x 46) where the Moor picks them up.
- **Tasks 1–7 and 9 deploy as one unit.** Task 8 is held for the owner's colony SQL edit (owner step 2) and ships in the same deploy as the Woods' colony task (Woods plan Task 11).
- **Reuse the Legacy guards that shipped with the Woods; restate none.** `effectiveArea` (which also picks Legacy's "today's walk" card), `setArea`/`canBuy`/`onPlace` refusing a Clan-only area in Legacy, `roomAreaMove` with `rooms.js`'s fallback to an override, and the page title following the edition all key off `edition: 'canon'` in the catalog. The Moor gets them by being registered (Task 6); Task 7 only proves they cover it.
- **The River lands first (coordinator's ruling).** Every list both plans touch (catalog, `walks`, `AREAS`, `MARK_AREAS`, `GRASS_STYLES`, `CLOUD_AREAS`, `AREA_RULES`, `GOLD_MICE`, the test tables) already holds `river` when this plan starts; append `moor` after it and before `'den'`. Where a test pins a whole list (the climbing tests' ground-mice lists, the `walks` and `marks` deep-equals in `test/progression.test.js`, `Object.keys(GOLD_MICE)`), write it with `river` in it and `moor` added. If the Moor lands first after all, see D2.
- **Owner decisions (2026-10-31, settled, not open):** the Moor comes next, before the Pines and Swamp; the places are named **"the High Tor"**, **"the Old Hawthorn"** and **"the rabbit warren"** (the labels in the numbers table carry these names, lower-cased like every other label); the Moor's sound is **twice the Woods' wind, with birdsong and no water sound** (Task 6).
- Comments and docs are plain and say why. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npx vitest run --exclude '.claude/**'`. Build: `npm run build`.

### Dependencies on the River plan

The River (branch `river`) merges before the Moor. What the Moor takes from it:

- **D1, `builder.pine` (River Task 1).** The Moor plants 3–8 pines on its west strip, where the Pines and Swamp reaches over the border, using the River's `pine` as merged. This plan adds no `pine` of its own: no second export, no duplicate builder test. Task 5 calls `b.pine(x, z, scale, { wind })` with a collider of `0.4 × scale` and a canopy reach of `1.3 × scale`; if the merged `pine` differs, re-check those three.
- **D2, shared test values (no code dependency).** The Moor's tests are written with the River merged: `GOLD_TOTAL` is 21; the territory map's "coming soon" loop is `['pines']` and its `data-dr-place` count is 4; the River's colony test asserting `feedsHere('moor')` is false now asserts `'pines'`; the legendary exemption is `['woods', 'river', 'moor']`. **If the Moor lands first after all,** the second lander rewrites those values (`GOLD_TOTAL` 18 then 21; the loop `['river', 'pines']` then `['pines']`; the count 3 then 4; the `feedsHere` assertion) and keeps both plans' rows in `test/budget.test.js`, `test/climbing.test.js`, `test/goldmice.test.js`, `test/progression.test.js`, `test/lobby.test.js` and `test/goalsarea.test.js`.
- **Nothing else.** The Moor uses no willow, lily pad, marsh grass or water-lap sound, and none of the River's coordinates.

### Lessons from building the Woods, applied from the start

From the Woods' ledger (`.superpowers/sdd/2026-10-31-clan-edition-woods/progress.md`) and its VISUAL-PASS entry. Each is a rule here, not a fix round later.

1. **Content before scenery, and `KEEP_CLEAR` derived from it.** Task 4 lays out the finds, perches, chains and burrows; `MOOR_KEEP_CLEAR` is built from those records; Task 5's trees, heather, gorse and reeds keep clear of it.
2. **Every goal is finishable.** `createGoals(rng, areaData)` drops tip-over, sit-in-a-box and head scratches where the area can't finish them, always in exactly three rng draws. The Moor has no tippables, no boxes and no villagers; Task 4 pins that over 400 seeds.
3. **No canopy over a path.** A tree keeps `PATH_W / 2 + reach + 0.5` from every path centreline: reach `1.6 × scale` for `b.tree` (the thorns and the old hawthorn), `1.3 × scale` for `b.pine`.
4. **A deck is what the kids see, at least 1.5 m wide, proven by raycast.** The log bridge's deck is its 1.8 m hewn flat; the stepping stones copy the Woods' shipped ford exactly (14 stones, `rMin 0.88, rMax 0.9, jitter 0, stagger 0.03, sides 16`, a ±0.75 m deck inside about ±0.83 m of visible stone). Both are raycast in Task 3.
5. **A flood fill with the real `isWalkableAt` reaches every find** from the spawn, and with the decks removed the lakeshore heath can't be reached (Tasks 3–5).
6. **A golden mouse is in sight from the chase camera,** not just from a cat's eye (Task 4): the old hawthorn's mouse sits out on a limb like `gm-woods-1`, and the hawthorn is built **without** `wind` so the limb and the mouse never part.
7. **Budget rows count by traversal.** `scene.traverse`, never `scene.children`: beds and groups nest, and `noCast` meshes are out of the caster count (`test/budget.test.js` already does this; every new bed test does too).
8. **`nearestDry` at overlapping waters.** The Moor has three overlap zones (the river's bend, the mouth's corner, the mouth over the lake); Task 3 adds spots to `test/water.test.js`. No change to `nearestDry`.
9. **Both editions build the same world**, and the Legacy guards are reused, not rewritten (Global Constraints).
10. **Live-check bugs found late in the Woods** are checked on purpose in Task 9: the stepping stones' visible edge, the camera inside a canopy on a path, and Legacy's "today's walk" card.

## Review Focus

1. **A save with the Moor unlocked, played in Legacy, or a Legacy kid joining a Moor co-walk.** Legacy walks the Neighborhood, `state.area` stays `'moor'`, the Cozy Neighborhood card says "today's walk"; the joiner walks the Moor as an override. Tests in Task 7.
2. **A save or cloud payload from a device without the Moor** (no `moor` keys, a colony cat with `area: 'moor'` before Moor feeding, a `rabbit` journal count). It loads with every cat, `walks.moor` 0, `marks.moor` `[]`; the cat is kept and shown but can't be fed; an old build drops only the journal's rabbit count, which resets to 0 and counts up again from the next rabbit spotted. Tests in Tasks 2, 6 and 8.
3. **The river cutting off the lakeshore heath.** Every POI, ring, find, scenic and golden mouse there is reachable dry over either deck alone, and none without a deck. Tests in Tasks 3–5.
4. **A toy or scent treat landing where the river bends, where it turns into the mouth, or where the mouth meets the lake.** `nearestDry` lands it dry within 5 m. Tests in Task 3.
5. **Tapping the Moor before 2 Woods walks, or the Pines, the Gorge or the island at any time, whether or not the River has landed.** Nothing is bought, `state.area` doesn't change, and the Moor's line reads `opens after 2 walks in The Woods · 1/2 so far`. Tests in Task 7.

## Owner steps

These are for the owner (the parent), not the implementer.

1. **Update both devices before either kid walks the Moor.** After the deploy that carries Tasks 1–7 and 9, on **both** devices close every Whisker Walk tab (and the home-screen app), reopen it, and check that the home-screen map shows **The Moor** in colour with an "opens after…" or "Tap to explore" line, not "coming soon". An old build drops the Moor unlock, its walk count, its marks and the journal's rabbit count, and its lobby ignores a Moor walk proposal.
2. **Before Task 8 is deployed, run the one colony SQL edit, if it isn't done yet.** It is the Woods plan's owner step 2, still pending when this was written; it adds all six territory ids at once, so the Moor needs no SQL of its own. Then check, in the Supabase SQL editor:

   ```sql
   select prosrc like '%''moor''%' from pg_proc where proname = 'colony_feed';
   ```

   Expected: `true`. The Moor's colony task (Task 8) then ships in the same deploy as the Woods' colony task.
3. **Check the Moor on the iPhone 18** after Task 9: a Moor walk on the HIGH tier holds 60 fps. Note its draw count beside the Woods' and the Neighborhood's.
4. **Show her the Moor.** The order, the three place names and the sound are already decided (Global Constraints). Still open, none blocking the build and each a one-line change:
   - **the unlock:** the Moor opens after 2 Woods walks, the same moment as the River (both are the Woods' neighbours in §3's table);
   - **the journal name:** "Moor Rabbit";
   - **her map:** the river comes in from the Woods at the south, turns west south of the middle and pours into the lake from the north 10 m from the Pines border; the lake fills the south-west corner; the north path from Twolegplace arrives up the east side as the Woods' own north path carried on, then bends west to (34, −8) and on across the moor top (coordinator's ruling: her board's line leaves the Moor's east edge, so the path keeps that bend); the island and its bridge are seen across the lake, not walked to.

## What this plan defers (each gets its own plan)

- **The per-kid clan pick**, the allies rule and the **homage names** (decisions 2 and 3). Until then the Moor has **no rival patrol**.
- **Kittypets** and their **wanderers** (decision 6).
- **The island, its bridge and the truce path.** The Moor only *shows* them across the lake. The walkable island stays deferred to its own plan, after the Pines and Swamp (§8 steps 7–8).
- **Border crossings** (§8 step 6). The Moor's edges match and its horizon shows its neighbours; no border posts.
- **The River and Marshes, the Pines and Swamp**, and later the Gorge (the Moor's east horizon is its "unexplored" rock).
- **Terrain.** The Moor's hills are in its horizon; the ground stays flat (spec §3 builder notes).
- In the Moor: carryables, knockables, rests, flaps and markables, a legendary cat, and "Camp" wording.
- Woods minors carried, unchanged: shore-foam seams where water footprints overlap; trees on the corner map; the yarn ball's per-frame `nearestDry` in an overlap; camera-side canopy hiding.

## Files

| File | Responsibility |
|---|---|
| `src/world/builder.js` | Gains `heatherBed`, `gorseBed`, `tor`, `burrows` (`pine` comes from the River: D1) |
| `src/critters.js`, `src/journal.js`, `src/game/labels.js`, `src/progression.js` (`JOURNAL_TYPES`) | The rabbit |
| `src/world/moor.js` (new) | The Moor map |
| `src/goldmice.js` | `moor` entry |
| `src/propsets.js` | `SETS.moor`: three burrows as `hides`, nothing else |
| `src/progression.js` | Catalog entry and `walks.moor` |
| `src/game/walk.js` | `AREAS` gains `moor` |
| `src/marks.js` | `MARK_AREAS` and `emptyMarks` gain `moor` |
| `src/render/{grass,clouds,pawprints,ambient}.js`, `src/audio.js` | Moor entries; `windLayer` takes an optional strength |
| `src/territories.js` | The Moor flips to `'built'` |
| `src/colony.js` | `COLONY_AREAS` gains `moor` (Task 8) |
| `verify-places.html`, `public/places/moor.jpg`, `docs/VISUAL-PASS.md` | Picture, view and the written check |

## The Moor in numbers

Coordinates are metres, x east, z south (north is −z, as the corner map draws it). The Moor sits directly north of the Woods in the same x frame: the Moor's south edge (z 50) is the Woods' north edge (z −50), so a Woods point (x, z) is the Moor point (x, z + 100). Her board puts the Pines and Swamp to the west, the Woods to the south, the lake to the south-west, the north path from Twolegplace arriving on the east side, and the Gorge (later) off to the south-east. Her river (`RIVER` in `src/territories.js`, board x 598–644 north, then y 199–205 west to the lake at (455, 196)) gives the Moor two reaches and a mouth.

| Thing | Value |
|---|---|
| `bounds` | `{ minX: -50, maxX: 50, minZ: -50, maxZ: 50 }` |
| `SPAWN` | `{ x: 46, z: 44 }`, on the north path 6 m in from the Woods, on the Moor's east side |
| Ground | `b.ground(120, 0x8a9558, { surface: 'grass' })`; `groundBounce: 0x8a9558` |
| Sky | `b.applySky(scene, 0x9cc4e4, 0xe4e6d8)`; `skyDusk: { top: 0x2a3554, horizon: 0x70647a }` |
| `LAKE` | `{ id: 'lake', kind: 'rect', minX: -120, maxX: -14, minZ: 8, maxZ: 66 }`: the lake's north-east shore. At the south edge it spans the Woods' lake's x −120..−14, and `maxZ` 66 is the Woods' lake shore (its `maxZ` −34) in Moor coordinates (the River's R3 rule) |
| `LAKE_FAR` | `{ id: 'lake-far', kind: 'rect', minX: -120, maxX: -51, minZ: 4.8, maxZ: 8.5 }`: a lip of open water west of the bounds, reaching north to where the island bridge lands on the Pines' shore (like the River's `LAKE_FAR`). Outside `bounds`, so it changes nothing a cat can walk |
| `RIVER_SOUTH` | `{ id: 'river-south', kind: 'rect', minX: 18, maxX: 23, minZ: -4, maxZ: 120, decks: [STEPPING_STONES] }`: in from the Woods at the Woods' `river-north` x |
| `RIVER_WEST` | `{ id: 'river-west', kind: 'rect', minX: -40, maxX: 23, minZ: -4, maxZ: 1, decks: [LOG_BRIDGE] }`: west across the Moor, south of the middle |
| `RIVER_MOUTH` | `{ id: 'river-mouth', kind: 'rect', minX: -40, maxX: -35, minZ: -4, maxZ: 10 }`: pours into the lake from the north, 10 m from the Pines border; no deck |
| `STEPPING_STONES` | `{ minX: 16.5, maxX: 24.5, minZ: 29.25, maxZ: 30.75 }`; drawn `b.steppingStones(17.0, 30, 24.0, 30, 14, { rMin: 0.88, rMax: 0.9, jitter: 0, stagger: 0.03, sides: 16 })`, the Woods' ford moved to z 30 |
| `LOG_BRIDGE` | `{ minX: 3.1, maxX: 4.9, minZ: -5.5, maxZ: 2.5 }`; drawn `b.logBridge(4, -5.5, 4, 2.5, 3.0, 0.16, 1.9)`, the Woods' log moved to x 4 |
| Water draw | one colour, `0x5f98a8` (the Woods' river and lake: one water). Heights: lake 0.03, lake-far 0.025, river-south 0.02 (the Woods' river-north's), river-west 0.035, river-mouth 0.045. Shores: lake `['maxX', 'minZ']`, lake-far none (all out of bounds), river-south `['minX', 'maxX']`, river-west `['minZ', 'maxZ', 'maxX']`, river-mouth `['minX', 'maxX']` |
| `MOOR_PATHS` (3 m wide, `surface: 'sand'`, `color: 0x8c7a5c`) | north path `[46,50,46,22]`, `[46,22,34,-8]`; high path `[34,-8,14,-26]`, `[14,-26,-12,-34]`; bridge path `[34,-8,4,-7]`, `[4,4,-2,24]`; ford path `[46,30,26.5,30]`, `[14.5,30,-2,24]` |
| The lakeshore heath | the land cut off by the river and the lake: x −14..18 for z 8..50, and x −35..18 for z 1..8. Reached only over a deck |
| High Tor chain | grey boulder `(-18, -34)` y 0.72 `'stone'` (collider r 0.7) → tor pillar `(-19, -35)` y 1.9 `'stone'` (collider r 0.9, `CylinderGeometry(0.75, 0.9, 1.9, 7)`, named `highTor`), label `'high tor'`, vantage. The Woods' Lookout Rocks shape: 1.41 m across, 1.18 m up |
| Old Hawthorn chain | grey boulder `(-3.6, 36.6)` y 0.72 `'stone'` (collider r 0.7) → `b.tree(-2, 38, 1.6)` **no `wind`**, named `oldHawthorn` (collider r 0.8), with the Great Oak's limb child (`CylinderGeometry(0.07/s, 0.12/s, 0.75/s, 6)`, `rotation.z = π/2`, local `(-0.6/s, 1.9/s, 0)`), branch perch `(-2, 38)` y 2.1 `'tree'`, label `'old hawthorn lookout'`, vantage; root collider `(-2.83, 37.27)` r 0.35. The Great Oak's offsets exactly |
| `TORS` (scenery outcrops: collider, one-hop perch `kind: 'stone'` at y h, drawn `b.tor`) | `{ x: 28, z: -44, r: 1.4, h: 1.5 }`, `{ x: -40, z: -22, r: 1.2, h: 1.2 }`, `{ x: 42, z: -6, r: 1.3, h: 1.4 }`, `{ x: 12, z: 18, r: 1.2, h: 1.1 }` |
| `pois` (9) | `(40,8)`, `(30,24)`, `(6,-14)`, `(-30,-14)`, `(-24,-40)`, `(20,-40)`, `(-6,20)`, `(8,44)`, `(40,-24)` |
| `scenics` | `{ id: 'moor-lake', x: -10, z: 12, label: 'the lake and the island' }`, `{ id: 'river-bend', x: 28, z: -10, label: 'where the river turns west' }`, `{ id: 'warren', x: 34, z: -32, label: 'the rabbit warren' }` |
| `collectibles` | `moor-find-1 (30, 14) 'a tuft of rabbit fur'`; `moor-find-2 (-28, -26) 'a skylark feather'`; `moor-find-3 (-6, 30) 'a smooth pebble from the lakeshore'`; `moor-find-4 (10, -20) 'a sprig of white heather'`; `moor-find-5 (-18, -34, y 0.72) 'a gorse flower on the low rock'` |
| Golden mice | `gm-moor-1 (-19, -35, y 1.9)` top of the High Tor; `gm-moor-2 (-2.75, 38, y 2.1)` out on the old hawthorn's limb (`gm-woods-1`'s offset from its oak); `gm-moor-3 (-38, -42, y 0)` hidden among bushes at `(-36,-44)`, `(-40,-44)`, `(-38,-39)` |
| `WARREN_BURROWS` (7) | `(37.34,-30.97)`, `(35.28,-28.74)`, `(32.25,-28.97)`, `(30.54,-31.48)`, `(31.44,-34.38)`, `(34.26,-35.49)`, `(36.89,-33.97)`: a 3.5 m ring round the warren scenic, at angles `0.3 + k × 2π/7` |
| Hides (`propsFor('moor').hides`) | burrows 0, 2 and 4: `(37.34,-30.97)`, `(32.25,-28.97)`, `(31.44,-34.38)` |
| `puddles` | `{ x: 30, z: 40, r: 0.9 }`, `{ x: -20, z: -18, r: 0.8 }` |
| `MOOR_KEEP_CLEAR` | every POI, scenic, collectible, golden mouse, chain perch, gold bush, puddle, burrow and the spawn |
| Thorn trees | `moorTrees().thorns` (`b.tree`): 5–12, scale 0.8–1.15, lone (Task 5) |
| Pines | `moorTrees().pines` (`b.pine`): 3–8, scale 1.1–1.5, on the west strip x −50..−41 |
| Heather | `moorHeather()`: 260–420 cushions in one `b.heatherBed` |
| Gorse | `moorGorse()`: 10–30 clumps in one `b.gorseBed` |
| Reeds | `moorReeds()`: 60–140 clumps along the banks and the lakeshore in one `b.reedBed` |
| Island on the horizon (`MOOR_ISLAND`) | `{ x: -72, z: 28, r: 9, rise: 1.4 }`: the Woods' island at `(-72, -72)`, 100 m south in the Woods' frame. Mound (flattened sphere) and `b.tree(-72, 28, 2.6)` raised to `rise - 0.2`. The island bridge is defined once, in Woods coordinates, as `ISLAND_BRIDGE_WOODS = [[-77.4, -79.2], [-89.4, -95.2]]` (the island's rim to the Pines' shore: the River plan's bridge, moved 100 m west into Woods coordinates); the Moor adds 100 to each z and draws one plank box from `(-77.4, 20.8)` to `(-89.4, 4.8)`, y 0.3, 2 m wide, named `islandBridge` (her `BRIDGE` runs from the island toward the north-west). All outside `bounds`, no collider |
| Horizon (`MOOR_HORIZON`) | `kind: 'hills'`, inner 56, outer 116, height 11, wavelength 48, colour `0x8f7f8a`, salt 41, `avoid: [LAKE, LAKE_FAR, RIVER_SOUTH]`, `sideTints: { north: 0x9a8a9c, east: 0x8a8478, south: 0x4f7a48, west: 0x3f5a46 }`, no rooftops. North: more heather hills (the Woods paints the Moor `0x9a8a9c`); east: grey rock, the Gorge's unexplored edge; south: the Woods' deep green; west: the dark pines |
| `critterSpawns` | birds at the first four thorns; rabbits `(32,-30)→(37,-35)`, `(36,-29)→(30,-24)`, `(4,40)→(10,34)`; butterflies `(-4,24)`, `(0,26)`, `(-8,26)`; ducks `(-20,14)`, `(-18,16)`, `(-22,17)` on the lake; mice `(-26,-20)→(-22,-26)` and `(10,-36)→(14,-30)`. No squirrels, no villagers |
| `moments` | `{ id: 'rabbit-bolt', type: 'rabbit', label: 'a rabbit bolting for its burrow', x: 34, z: -32, from: { x: 26, z: -22 } }` |
| `boxes`, `tippables` | `[]`, and no villager critter: the walk never offers tip-over, sit-in-a-box or head scratches here |
| Grass | `GRASS_STYLES.moor = MOOR`: `{ color: 0x8f9a5a, hMin: 0.08, hMax: 0.24, width: 1.0, warm: 0.18, sway: 0.6, reach: 1.4, density: moorDensity }`; `moorDensity(x, z) = 0.95 * smooth01(0.25, 0.55, patchNoise(x, z, 6.0, 53))` |
| Paw prints | `AREA_RULES.moor = { ground: null, path: 'sand', strip: null }` |
| Ambient life | `ambientKind('moor')` is `'fluff'` (seed down on the wind), day and dusk |
| Sound (owner's decision) | `windLayer({ gain: 0.06, cutoff: 480 })` (twice the generic wind's 0.03 / 300), then rain in rain, else birdsong unless dusk; crickets at dusk from the shared line |

All of this was checked before writing with a standalone flood fill on a 0.5 m grid (the `isWalkableAt` rule: colliders + 0.35, water clearance ≥ 0.35, decks dry for their own water): every POI, scenic, find and golden mouse (or its chain's first step) is reached from the spawn; every one is at least 4 m from water (the tightest is the `moor-lake` scenic, at 4.0); every path keeps at least 3.0 m of centreline clear of open water; the lakeshore heath is unreachable without decks and reachable with either one alone.

**What the Pines and Swamp will match** (the Moor's west edge, x −50): the lake's north shore at z 8 (water for z ≥ 8), reaching north to z 4.8 just past the edge where the island bridge lands, dry land north of that, no path, and pines on the strip inside the edge.

---

### Task 1: Builder pieces the Moor needs

**Files:**
- Modify: `src/world/builder.js` (after `brambleBed`)
- Test: `test/builder.test.js`, `test/rig.test.js`

**Interfaces:**
- Produces (no colliders emitted by any of them; placement by `hash01`, never `Math.random`):
  - `heatherBed(spots: Array<{ x, z }>, seed) -> THREE.Mesh`: each spot two `IcosahedronGeometry(r, 0)` cushions, `r = 0.35 + 0.2 × hash01`, squashed to 0.5 in y and sat on the ground, the second offset 0.3–0.5 m at a `hash01` angle; never taller than 0.5 m. Colour `0x8a5a86`, `'foliage'`, through `mergedNoCast`.
  - `gorseBed(spots, seed) -> THREE.Group` of two merged `noCast` meshes: `gorse` (brambleBed's lobe huddle: 3–4 lobes, `r = 0.4 + 0.2 × hash01`, y-squash 0.62, colour `0x4d6630`) and `gorseBloom` (two `IcosahedronGeometry(0.07, 0)` flecks per lobe on its upper half, colour `0xe8c43a`). Never taller than 0.95 m.
  - `tor(x, z, { r = 1.2, h = 1.2, seed = 0 } = {}) -> THREE.Mesh`: a granite outcrop, three stacked `DodecahedronGeometry` blocks merged into one geometry, widest at the foot (radius `r`), top at `h`. Colour `0x8e8c88`, `'cobble'`. It casts (a real solid).
  - `burrows(spots, seed) -> THREE.Group` of two merged `noCast` meshes: `burrowSpoil` (a `SphereGeometry(0.55, 8, 4)` mound squashed to 0.15 m, offset 0.35 m from the hole at a `hash01` angle, colour `0xa08a62`, `'sand'`) and `burrowHoles` (`CircleGeometry(0.22, 10)` laid flat at y 0.02, colour `0x2a2420`).

- [ ] **Step 1: Write the failing tests** in `test/builder.test.js`:
  - `heatherBed is one flat-ish mesh out of the shadow pass`: `Box3` of the mesh has `max.y <= 0.5` and `min.y >= -1e-6`; `castShadow === false`; `userData.noCast === true`; the same spots and seed give equal position arrays; `[]` builds an empty geometry without throwing.
  - `gorseBed is two noCast meshes, gorse and gorseBloom, never taller than 0.95`: find both by name with `group.traverse`; each `noCast`; group `Box3.max.y <= 0.95`.
  - `tor's top is at h and its foot is as wide as its collider`: for `tor(5, -3, { r: 1.4, h: 1.5 })`, `Box3.max.y` within 0.05 of 1.5; every vertex's horizontal distance from `(5, -3)` is at most `1.4 + 0.05`, and the box's x half-width is at least `0.8 × 1.4`; it is one mesh; two calls give equal position arrays.
  - `burrows are two noCast meshes under 0.2 m`.
  - In `test/rig.test.js`: `assignShadowCasters leaves the heather, the gorse and the burrows casting nothing, and the tor casting`.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run test/builder.test.js test/rig.test.js`. Expected: `heatherBed is not a function` and the like.
- [ ] **Step 3: Implement**, each with a short comment on what it is and why its shape (heather and gorse are beds a cat pushes through; a tor is a solid you climb).
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `git add src/world/builder.js test/builder.test.js test/rig.test.js`, then commit `feat(builder): heather, gorse, tors and burrows for the Moor`

### Task 2: A rabbit

**Files:**
- Modify: `src/critters.js`: `buildCritter('rabbit')` (a body `box(0.16, 0.14, 0.26, 0x9a8466)` at y 0.1, a head sphere r 0.07 forward, two upright ears `box(0.025, 0.12, 0.04)`, a white tail sphere r 0.045 `0xf2eee6` behind; under 0.35 m tall). `'rabbit'` joins `STALKABLE` and `PREY`, and the squirrel/mouse/rat patrol and flee branches, with a flee speed of 6.0 m/s (below the 9 m/s pounce lunge, so a young player can still tag one). **Ruling: it only bolts, like the mouse.** It is not added to `CHASEABLE`, for the reason the comment at `critters.js:11` gives for the rat: a critter whose answer to a cat is to bolt has no place in the chase prompt or, through `CURIOUS` (derived from `CHASEABLE`), among the critters a Far Call draws toward the caller.
- Modify: `src/progression.js`: append `'rabbit'` to `JOURNAL_TYPES`.
- Modify: `src/journal.js`: `CRITTER_INFO` gains `{ id: 'rabbit', emoji: '🐇', name: 'Moor Rabbit', hint: 'Watch it bolt for its burrow!' }`.
- Modify: `src/game/labels.js`: `labelFor` gains `rabbit: 'a bounding rabbit'`, so a spotted, pounced or photographed rabbit never reads "something interesting".
- Test: `test/critters.test.js`, `test/journal.test.js`, `test/docks.test.js` lines 418–419 (`JOURNAL_TYPES` and `CRITTER_INFO` lengths 11 → 12), `test/progression.test.js`, and the file that tests `labelFor`

**Interfaces:**
- Produces: `'rabbit'` as a critter type `createCritters` spawns from `critterSpawns` and from a moment's `type`, and as a journal type.

- [ ] **Step 1: Write the failing tests**:
  - `critters: a rabbit bolts for its hide when the cat trots up, and stays hidden`: the existing mouse test (line 238) with `type: 'rabbit'`. Its dash-distance bounds after `run(c, 0.3, …)` are the mouse test's, scaled from 6.5 to 6.0 m/s, and it ends hidden within `HIDE_REACH` of the hide.
  - `critters: a rabbit is under 0.35 m tall and can be pounce-tagged`: `new THREE.Box3().setFromObject(rabbit.group).max.y < 0.35`; a stalk-and-pounce run in the style of "stalk straight in and pounce when it notices" (line 546) catches it at least 4 times in 5.
  - `critters: a rabbit never answers a Far Call`: in the style of "never draws the critters a meow scatters" (line 152), a rabbit in the far band stays where it was while the call is live.
  - `journal: every journal type has an entry, and the rabbit's is the Moor Rabbit`.
  - `labelFor('rabbit')` is `'a bounding rabbit'`.
  - `progression: a rabbit spotted is counted, and the count survives a reload`, in the file's existing journal tests' style.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `git add src/critters.js src/journal.js src/game/labels.js src/progression.js test/critters.test.js test/journal.test.js test/docks.test.js test/progression.test.js` plus the `labelFor` test file, then commit `feat(critters): a rabbit, and the Moor Rabbit in the journal`

### Task 3: The Moor: ground, water, crossings, paths, island and horizon

**Files:**
- Create: `src/world/moor.js`
- Modify: `verify-places.html` (`AREAS` gains `moor`; `VIEWS.moor = '24,3.0,-22,-10,0.4,12'`, from the high path looking down over the river bend to the lake)
- Test: `test/moor.test.js` (new; copy `test/woods.test.js`'s canvas stub, `segDist`, `rectDist`, `flood`, `reaches` and `reachesWithin`), `test/water.test.js` (`WATERED.moor`, and a `nearestDry` block), `test/budget.test.js` (both tables)

**Interfaces:**
- Consumes: `logBridge`, `steppingStones`, `horizonBand` (with `sideTints`), `waterGap`, `inWater` from `src/world/builder.js`; `createWater` from `src/render/water.js`; `WOODS_WATERS`, `WOODS_PATHS` from `src/world/woods.js` (tests only).
- Produces, from `src/world/moor.js`:
  - `SPAWN`, `MOOR_WATERS` (`[LAKE, LAKE_FAR, RIVER_SOUTH, RIVER_WEST, RIVER_MOUTH]`, ids `lake`, `lake-far`, `river-south`, `river-west`, `river-mouth`), `MOOR_PATHS`, `MOOR_ISLAND`, `ISLAND_BRIDGE_WOODS`, `MOOR_HORIZON`: frozen, with the values in "The Moor in numbers".
  - `build(scene, { water = {}, wind } = {}) -> areaData`, `name: 'The Moor'`, returning every key `woods.js` returns. Content keys Task 4 fills may be `[]` for now.
  - The header comment, in woods.js's style: what the Moor is, where each edge faces (south the Woods, with the river, the lake and the north path carried straight on; west the Pines and Swamp; east the open moor and, south-east, the Gorge's unexplored rock; north more moor; south-west the lake with the island and its bridge out on it), and why the two decks exist. The header must not contain the word "edition" in any form (no "Clan Edition"): the source test `/edition/i` scans the whole file, comments included. Say "the clan lands" or "her territory map" instead.

- [ ] **Step 1: Write the failing tests** in `test/moor.test.js`:
  - `declares the lake, its far lip, the river's two reaches and its mouth`: ids in order; `area.waters` equals `MOOR_WATERS`; all frozen.
  - `every water is drawn from its own footprint, at the scene root` (the Woods test, with the Moor's list).
  - `draws overlapping waters at different heights`: river-south vs river-west, river-west vs river-mouth, river-mouth vs lake, lake vs lake-far.
  - `the river's reaches meet, and the mouth runs into the lake`: `RIVER_SOUTH.minZ === RIVER_WEST.minZ`, `RIVER_SOUTH.maxX === RIVER_WEST.maxX`, `RIVER_MOUTH.minX === RIVER_WEST.minX`, `RIVER_MOUTH.minZ === RIVER_WEST.minZ`, `RIVER_MOUTH.maxZ > LAKE.minZ`; and every point down the mouth's centreline from z −4 to z 12 is wet.
  - `the lakeshore heath can be reached only over the decks, and over either one alone`:

```js
it('the lakeshore heath can be reached only over the decks, and over either one alone', () => {
  const heath = [[-6, 20], [8, 44], [-6, 30], [-10, 12], [-30, 4]];
  for (const [x, z] of heath) expect(reaches(area, x, z), `(${x}, ${z})`).toBe(true);
  const noDecks = { ...area, waters: MOOR_WATERS.map((w) => ({ ...w, decks: [] })) };
  for (const [x, z] of heath) expect(reaches(noDecks, x, z), `(${x}, ${z}) without decks`).toBe(false);
  // the moor top stays reachable without either: the river only cuts off the heath
  for (const [x, z] of [[-30, -14], [20, -40], [-45, 4]]) expect(reaches(noDecks, x, z), `(${x}, ${z})`).toBe(true);
  for (const keep of ['river-south', 'river-west']) {
    const one = { ...area, waters: MOOR_WATERS.map((w) => (w.id === keep ? w : { ...w, decks: [] })) };
    for (const [x, z] of heath) expect(reaches(one, x, z), `only ${keep}'s deck: (${x}, ${z})`).toBe(true);
  }
});
```

  - `the log bridge's deck is no wider than the log the kids see above the water` and `the stepping stones cover their whole deck, with no open water anywhere on it`: the two Woods raycast tests, pointed at `logBridge` over river-west and `steppingStones` over river-south. Both also assert the deck is at least 1.5 m wide, the log deck at least 1.8, and the stone deck's half-width `(deck.maxZ - deck.minZ) / 2` at least 0.75.
  - `the Moor's south edge matches the Woods' north edge`:

```js
it("the Moor's south edge matches the Woods' north edge", () => {
  // the river leaves the Woods north and enters the Moor south at the same x
  const wRiver = WOODS_WATERS.find((w) => w.id === 'river-north');
  const mRiver = MOOR_WATERS.find((w) => w.id === 'river-south');
  expect([mRiver.minX, mRiver.maxX]).toEqual([wRiver.minX, wRiver.maxX]);
  expect(wRiver.minZ).toBeLessThan(-50);
  expect(mRiver.maxZ).toBeGreaterThan(area.bounds.maxZ);
  // the lake crosses the border over the same x
  const wLake = WOODS_WATERS.find((w) => w.id === 'lake');
  const mLake = MOOR_WATERS.find((w) => w.id === 'lake');
  expect([mLake.minX, mLake.maxX]).toEqual([wLake.minX, wLake.maxX]);
  expect(wLake.minZ).toBeLessThan(-50);
  // and the lake's south shore is one line across the border (the River's R3 rule)
  expect(mLake.maxZ).toBe(wLake.maxZ + 100);
  // the north path leaves the Woods and enters the Moor at the same x
  const ends = (paths, z) => paths.flatMap(([x1, z1, x2, z2]) => [[x1, z1], [x2, z2]]).filter(([, pz]) => pz === z).map(([x]) => x);
  expect(ends(MOOR_PATHS, 50)).toEqual(ends(WOODS_PATHS, -50));
  // the island and its bridge are the Woods' own, 100 m on in z
  expect([MOOR_ISLAND.x, MOOR_ISLAND.z - 100]).toEqual([-72, -72]);
  const box = new THREE.Box3().setFromObject(scene.getObjectByName('islandBridge'));
  const [[, az], [, bz]] = ISLAND_BRIDGE_WOODS;
  expect(box.min.z).toBeCloseTo(Math.min(az, bz) + 100, 0);
  expect(box.max.z).toBeCloseTo(Math.max(az, bz) + 100, 0);
});
```

  - `the island and its bridge are out on the lake and out of reach`: the island centre is outside `bounds` and its whole disc (r 9) is in water (`inWater` over `LAKE` and `LAKE_FAR` at 16 points on its rim); `islandBridge` exists, its world bounding box lies wholly outside `bounds`, its south-east end is within 1 m of the island's rim, and its north-west end is at `z <= LAKE_FAR.minZ`, inside `LAKE_FAR`'s x range; no collider or perch within 20 m of the island centre.
  - `the horizon faces the Moor's neighbours`: one band; `MOOR_HORIZON.sideTints` equals `{ north: 0x9a8a9c, east: 0x8a8478, south: 0x4f7a48, west: 0x3f5a46 }` (heather, the Gorge's unexplored rock, the Woods, the pines); `MOOR_HORIZON.rooftops` is undefined (Twolegplace is not next to the Moor); `avoid` holds `LAKE`, `LAKE_FAR` and `RIVER_SOUTH`.
  - `returns every key woods.js returns, named 'The Moor'`; `is built the same every time` (JSON of the area record minus `waterFx`); `nothing in the Moor reads the edition` (the source has no `/edition/i`).
  - `test/water.test.js`: `WATERED.moor = buildWith(buildMoor)`; and a block `nearestDry where the Moor's waters touch` with spots `[17.6, 1.4]` (the bank at the river's inside bend), `[19, 0]` (in that corner's water), `[21, -2]` (the middle of the bend), `[-34.6, 1.4]` (the bank where the river turns into the mouth), `[-36, 0]` (in that corner), `[-37.5, 9]` (where the mouth overlaps the lake) and `[-34.6, 7.6]` (the bank between the mouth and the lake), each at margins 0.35, 0.5 and 0.6, with the Woods block's two expectations (clear by the margin, within 5 m).
  - `test/budget.test.js`: `['moor', buildMoor, 450, 380, 60000]` and `['moor', buildMoor, 260, 205]`. The merged-table comment gains the Woods' measured row (`172 / 152` built, `170 / 150` merged, 44,462 triangles) if the River hasn't added it, and, once Task 5 lands, the Moor's own measured numbers. Expect roughly 80–110 meshes and 35,000–50,000 triangles; triangles bind, not meshes.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** `src/world/moor.js`: the sky, ground, waters (`createWater` per record, heights and `shores` from the numbers table), the two decks (named `logBridge` and `steppingStones`), the paths, the island mound and tree, `islandBridge`, and the horizon band.
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `git add src/world/moor.js verify-places.html test/moor.test.js test/water.test.js test/budget.test.js`, then commit `feat(moor): the Moor's ground, water, crossings, paths and horizon`

### Task 4: The Moor: things to find, climb and race

**Files:**
- Modify: `src/world/moor.js` (POIs, scenics, collectibles, the two chains, the four tors, `WARREN_BURROWS`, the gold bushes, puddles, critters, the moment; `MOOR_KEEP_CLEAR` built from these records)
- Modify: `src/goldmice.js` (`moor` entry after the last territory; the header comment counts the areas)
- Modify: `src/propsets.js` (`SETS.moor`: every list empty, `dogYard: null`, `keepSlots: []`, and `hides` the three burrows in the numbers table; a comment that the rest of a Moor prop set is deferred)
- Test: `test/moor.test.js`; `test/goldmice.test.js` (`Object.keys(GOLD_MICE)` equals `['neighborhood', 'park', 'seaside', 'docks', 'woods', 'river', 'moor']`; `GOLD_TOTAL` is 21); `test/docks.test.js` line 317 (`GOLD_TOTAL` 21, "since the Moor"); `test/climbing.test.js` (`AREAS.moor`; `['moor-find-5', 'moor']` in `ELEVATED`; `SHIPPED_HOPS` gains `'gm-moor-1': 2, 'gm-moor-2': 2, 'gm-moor-3': 0, 'moor-find-5': 1`; every "ground mice" list gains `'gm-moor-3'`; the skilled hop tables gain `'gm-moor-1': 1, 'gm-moor-2': 1`); `test/spots.test.js` (`moor` in `areas`); `test/goalsarea.test.js` (`moor` in its `AREAS`); `test/propsets.test.js` (`propsFor('moor')` has the three hides and every other list empty; `allPropIds()` is unchanged, since the Moor adds no prop with an id). `src/goals.js` needs no change.

**Interfaces:**
- Consumes: Task 3's `build`; Task 2's `'rabbit'`; Task 1's `tor`; `b.tree`, `b.bush`; `GOLD_MICE` (moor.js reads `GOLD_MICE.moor` into `KEEP_CLEAR`, as woods.js does).
- Produces: `GOLD_MICE.moor` (`gm-moor-1..3`), `MOOR_KEEP_CLEAR: Array<[x, z]>`, `WARREN_BURROWS: Array<{ x, z }>`, `propsFor('moor').hides`, and the content in the numbers table. The tor pillar is named `highTor`, its boulder `highTorRock`; the hawthorn is named `oldHawthorn`; the four scenery tors, drawn here with `b.tor(x, z, { r, h, seed: i })`, are named `tor-0` to `tor-3`; the three gold bushes are drawn here too. The two chain boulders share one material. Birds come from `moorTrees().thorns.slice(0, 4)`, through a `moorTrees` that returns `{ thorns: [], pines: [] }` until Task 5.

- [ ] **Step 1: Write the failing tests** (the Woods' "things to find" block, with the Moor's numbers):
  - `moor: nine POIs, all at least 2 m from water and clear of every collider` (by 1.6, so `clearSpot` leaves each ring on its POI).
  - `moor: five collectibles, three scenics, at least two vantage perches` (exact records).
  - `moor: the High Tor chain is two hops and its top can't be reached from the ground`; `moor: the old hawthorn chain is two hops and its branch can't be reached from the ground` (exact perch records and collider radii; `canReach` both ways; `reachesWithin` the first step).
  - `moor: each tor is one hop up, and its top is where its perch is`: for each `TORS` entry, a perch `{ x, z, y: h, kind: 'stone' }` and a collider `{ x, z, r }`; `canReach` from the ground; `tor-i`'s `Box3.max.y` within 0.05 of `h`.
  - `puts the climbing golden mice on the chain tops and hides the third among three bushes`: the tor mouse matches the pillar perch; the hawthorn mouse is within 1.0 m of the branch perch and more than `0.45 + 0.12` from the trunk's axis; the three bushes exist with no collider.
  - `every find, POI, scenic, golden mouse and race ring is reachable on foot from the spawn` (the Woods' `targets()` with a `firstStep` for the two chains), and named heath spots `[[-6, 20], [-6, 30], [-10, 12]]` reached.
  - `the hawthorn's golden mouse is in sight from the ground and from the chase camera`:

```js
it("the hawthorn's golden mouse is in sight from the ground and from the chase camera", () => {
  const tree = scene.getObjectByName('oldHawthorn');
  const m = GOLD_MICE.moor.find((g) => g.id === 'gm-moor-2');
  scene.updateMatrixWorld(true);
  const target = new THREE.Vector3(m.x, m.y + 0.12, m.z);
  const clear = (eye) => {
    const dir = target.clone().sub(eye);
    const ray = new THREE.Raycaster(eye, dir.clone().normalize(), 0, dir.length());
    return ray.intersectObject(tree, true).length === 0;
  };
  // a cat's eye on the boulder and on the heath in front of the tree
  for (const [x, y, z] of [[-3.6, 0.72 + 0.9, 36.6], [-6, 0.9, 38]]) expect(clear(new THREE.Vector3(x, y, z)), `eye (${x}, ${z})`).toBe(true);
  // the chase camera at the default zoom step (camzoom step 1: 4.5 m out, 2.2 m up),
  // behind a cat 3 m from the trunk to the north, the south and the west (the limb's
  // side). The east is behind the trunk, as for the Woods' oak, and is not asserted.
  const T = { x: -2, z: 38 };
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0]]) {
    const cam = new THREE.Vector3(T.x + dx * 7.5, 2.2, T.z + dz * 7.5);
    expect(clear(cam), `camera ${dx},${dz}`).toBe(true);
  }
  // and behind a cat on the boulder, looking at the trunk
  const d = new THREE.Vector2(-3.6 - T.x, 36.6 - T.z).normalize();
  expect(clear(new THREE.Vector3(-3.6 + d.x * 4.5, 0.72 + 2.2, 36.6 + d.y * 4.5)), 'camera behind the boulder').toBe(true);
});
```

  - `the High Tor's golden mouse is in sight from the chase camera`: the same camera ring (cat 3 m from the pillar on all four sides, camera 4.5 m further out at 2.2 m up), rays against `highTor` and `highTorRock`, none hit.
  - `the tall rock is as wide at its foot as its collider`: `highTor`'s `geometry.parameters.radiusBottom === 0.9`.
  - `goals: every goal drawn on the Moor can be finished there`: `moor` in `test/goalsarea.test.js`'s `AREAS` runs its per-area tests. Add `the Moor never offers tipping, a box or head scratches` (the Woods test of the same shape: those three never seen over 400 seeds, `seen.size === GOAL_POOL.length - 3`).
  - `carries its critters, one moment and two puddles, and no villagers`: `critterSpawns.filter((c) => c.type !== 'bird')`, `moments` and `puddles` equal the numbers table exactly; each puddle has its `CircleGeometry` at its spot.
  - `the warren's burrows are the Moor's hides, and every hide is dry and reachable`: `propsFor('moor').hides` equals `[0, 2, 4].map((i) => WARREN_BURROWS[i])`; each is reached by the flood; `propsFor('moor')`'s other lists are empty.
  - `race: a Moor course of five rings is drawn from its POIs`: `raceCourse(area.pois, seedFromCode('2026-11-01-moor'))` has 5 distinct POIs from the nine.
  - goldmice, climbing, spots and propsets additions as listed under Files (the ground-mice lists already hold `'gm-river-3'`).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `git add src/world/moor.js src/goldmice.js src/propsets.js test/moor.test.js test/goldmice.test.js test/docks.test.js test/climbing.test.js test/spots.test.js test/goalsarea.test.js test/propsets.test.js`, then commit `feat(moor): POIs, finds, golden mice, tors, the warren and critters`

### Task 5: The Moor: thorns, pines, heather, gorse, reeds and the warren

**Files:**
- Modify: `src/world/moor.js`
- Test: `test/moor.test.js`, `test/climbing.test.js` (`GATED.moor`, `UNGATED.moor`), `test/minimap.test.js`

**Interfaces:**
- Consumes: Task 1's `heatherBed`, `gorseBed`, `burrows`; `b.pine` (River Task 1, D1); `b.tree`, `b.reedBed`; `TORS`; `sureClawsTreePerch`; `MOOR_KEEP_CLEAR`, `WARREN_BURROWS` (Task 4); `mulberry32`, `seedFromCode`.
- Produces, from `src/world/moor.js` (all rounded to 2 decimals, seeded by name, and every candidate draws all its numbers whether kept or not, so moving one clearance never reshuffles the rest):
  - `moorTrees() -> { thorns, pines }`, each `Array<{ x, z, scale }>`. A tree **fits** when it is inside `bounds`, at least 3 m from every water edge (decks ignored), 4 m from either deck rectangle, `1.5 + reach + 0.5` m from every path centreline, 4 m from every `MOOR_KEEP_CLEAR` point, `r + 3` m from every tor, 6 m from the old hawthorn, and clear of every tree already kept (thorns first).
    - **Thorns** (`b.tree`; seed `'moor-thorns'`; reach `1.6 × scale`; cap 12): a 13 m grid from x, z −43.5, jitter ±3 m, scale `0.8 + 0.35 × rng()`, kept when `rng() < 0.4` and it fits with 6 m to every other thorn. Lone trees, as a moor has.
    - **Pines** (`b.pine`; seed `'moor-pines'`; reach `1.3 × scale`; cap 8): candidates at x −47 and −42, z −36, −30, −24, −18, −12, −6, jitter ±1.5 m, scale `1.1 + 0.4 × rng()`, kept when `rng() < 0.75` and it fits with 4 m to every other tree.
  - `moorHeather() -> Array<{ x, z }>` (seed `'moor-heather'`, cap 420): a 2.6 m grid over `bounds`, jitter ±0.9 m, kept when `rng() < 0.5` and it is inside `bounds`, at least 1.0 m from water (decks ignored), 3 m from either deck, 2.3 m from every path centreline, 3 m from every `MOOR_KEEP_CLEAR` point, 4 m from the spawn, `r + 0.6` from every tor, and `1.0 × scale` from every trunk.
  - `moorGorse() -> Array<{ x, z }>` (seed `'moor-gorse'`, cap 30): an 11 m grid, jitter ±3 m, kept when `rng() < 0.5` and it is at least 2.5 m from water, 7 m from either deck, 3.8 m from every path centreline, 4.5 m from every `MOOR_KEEP_CLEAR` point, 7 m from the spawn, `r + 1.5` from every tor and `1.6 × scale` from every trunk.
  - `moorReeds() -> Array<{ x, z }>`: every 2.5 m, 0.5 m out from each river bank and the mouth's two banks, along the lakeshore at z 7.5 for x −35..−14 and at x −13.5 for z 8..50; kept inside `bounds`, out of water (decks ignored), not within 1.5 m of a deck (the Woods' rule), 2.3 m from every path centreline and 3 m from every `MOOR_KEEP_CLEAR` point.
  - In `build`: thorns with `{ wind }`, a collider `r2(0.5 × scale)` and a `sureClawsTreePerch` each; pines with `{ wind }` and a collider `r2(0.4 × scale)`, **no** fork perch (a pine has no low fork); one `b.heatherBed` named `heather`; one `b.gorseBed` named `gorse`; one `b.reedBed` named `reeds`; one `b.burrows(WARREN_BURROWS, seedFromCode('moor-warren'))` named `burrows`. (The tors and the gold bushes are Task 4's.)

- [ ] **Step 1: Write the failing tests**:
  - `moorTrees is deterministic, keeps its clearances and its counts`: two calls deep-equal; thorns 5–12, pines 3–8 (if a floor fails, add candidates rather than loosen a clearance); each tree at least 3 m from water, `1.5 + reach + 0.5` from every path centreline, 4 m from every deck rect and from the spawn, inside bounds; every thorn at least 6 m from every other.
  - `leaves the moor walkable: no two trunks closer than a cat can pass between` (the Woods test over both lists, pine radius `0.4 × scale`).
  - `plants each thorn with a collider and a Sure Claws fork, and each pine with a collider and no fork`.
  - `the birds sit in the first four thorns`: `critterSpawns.filter((c) => c.type === 'bird')` equals `moorTrees().thorns.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z }))`.
  - `moorHeather is seeded, and a real heath`: two calls deep-equal; 260–420 cushions; at least 40 of them on the lakeshore heath (x −14..18, z 8..50).
  - `moorGorse is seeded`: two calls deep-equal; 10–30 clumps.
  - `keeps every cushion, clump and reed off the paths, the crossings, the spawn and every find`: heather path ≥ 2.3, deck ≥ 3, spawn ≥ 4, `MOOR_KEEP_CLEAR` ≥ 3; gorse path ≥ 3.8, deck ≥ 7, spawn ≥ 7, `MOOR_KEEP_CLEAR` ≥ 4.5; reeds 60–140, none in water, none within 1.5 m of a deck, `MOOR_KEEP_CLEAR` ≥ 3.
  - `the heather, gorse, reeds and burrows are merged meshes out of the shadow pass, with no colliders`: found by name with `scene.traverse`; every mesh under each has `userData.noCast === true`; the collider count equals `thorns + pines + 4 + 5` (the four tors; the two chain boulders, the pillar, the old hawthorn and its root).
  - `no tree, cushion, clump or reed stands on anything a kid looks for` (the Woods test: every target and every chain rock vs trees ≥ 4, heather ≥ 3, gorse ≥ 4.5, reeds ≥ 3).
  - The reachability test from Task 4 runs again with the scenery in, unchanged.
  - `test/climbing.test.js`: `GATED.moor` equals the thorn count (at least 5) and every one is `'tree'`; `UNGATED.moor` has length 8 (four chain perches and four tors).
  - `test/minimap.test.js`: `BUILDS.moor`; `buildMapLayer for the Moor has ground, edge, five waters, two with decks, eight paths, and the four tors as blocks`, with the comment that every other Moor collider is under the map's 1 m block cut.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite**, including both budget tables, and write the measured numbers into the merged-table comment. If the triangle ceiling is near, lower the heather cap toward 260 before touching anything else; the counts the tests pin are the contract.
- [ ] **Step 5: Commit.** `git add src/world/moor.js test/moor.test.js test/climbing.test.js test/minimap.test.js test/budget.test.js`, then commit `feat(moor): thorns, pines, heather, gorse, reeds and the warren`

### Task 6: Register the Moor

**Files:**
- Modify: `src/progression.js`
  - `CATALOG.areas.moor = { name: 'The Moor', price: 0, requires: { area: 'woods', walks: 2 }, edition: 'canon' }`, after the last territory entry.
  - `moor: 0` in `defaultState().walks`, with the NaN comment extended to name `moor`.
- Modify: `src/game/walk.js` (`AREAS` gains `moor`)
- Modify: `src/marks.js` (`MARK_AREAS` gains `'moor'` before `'den'`; `emptyMarks` gains `moor: []`)
- Modify: `src/render/grass.js` (`moorDensity` exported, `MOOR`, `GRASS_STYLES.moor = MOOR`), `src/render/clouds.js` (`CLOUD_AREAS` gains `moor`), `src/render/pawprints.js` (`AREA_RULES.moor`), `src/render/ambient.js` (`case 'moor': return 'fluff';`)
- Modify: `src/audio.js`: `windLayer({ gain = 0.03, cutoff = 300 } = {})`, the defaults today's values so every existing area sounds the same; a `moor` branch before the generic one: `windLayer({ gain: 0.06, cutoff: 480 })`, then `rainLayer()` in rain, else `birdsongLayer()` unless dusk.
- The dressing-room card needs no code: `buildDressingModel` lists only `areaInEdition` entries, so Legacy never sees the Moor. In Clan Edition, `otherPlaces` (`dressingroom.js:120`) leaves out only places whose id is a territory's `areaId`, and the Moor's territory keeps `areaId: null` until Task 7, so between Tasks 6 and 7 the Moor shows as an ordinary card under "Other places". Task 7 moves it onto the map. The picture `public/places/moor.jpg` comes in Task 9; until then the card's `onerror` drops the image.
- Test: `test/progression.test.js` (every `walks` deep-equal gains `moor: 0` and every `marks` deep-equal gains `moor: []`, including the v20 load test and the `EMPTY` marks), `test/marks.test.js`, `test/grass.test.js`, `test/clouds.test.js`, `test/pawprints.test.js`, `test/ambient.test.js` (`moor` in its builds, `VIEW.moor = [46, 44]`), `test/audio.test.js`, `test/lobby.test.js` (`knownAreas` gains `moor`), `test/dressingroom.test.js`, `test/colonypanel.test.js`

**Interfaces:**
- Consumes: Tasks 3–5's `build`.
- Produces: `moor` as a known area id everywhere above; `windLayer`'s optional strength.

- [ ] **Step 1: Write the failing tests**:
  - `progression: the Moor is free, clan-only, and opens after 2 Woods walks`: the catalog record exactly; `canBuy('areas','moor')` false at 1 Woods walk and true at 2 with 0 points; `buy` unlocks it without changing `points`.
  - `progression: in Legacy the Moor can be neither bought nor set, and state.area stays put` (the Woods test of the same name, with `moor`).
  - `progression: a fresh save counts Moor walks from 0`, and `completeWalk('moor')` makes it 1; `an unlocked Moor survives a reload`.
  - `progression: a stored save with no moor keys loads with walks.moor 0 and marks.moor []`.
  - `marks: the Moor keeps marks like any area`.
  - `grass: the Moor grows moor grass`: `GRASS_STYLES.moor.density === moorDensity`; over a 1 m grid on x, z in −50..50 it stays within `[0, 0.95]`, is 0 somewhere and above 0.5 somewhere.
  - `clouds`: `CLOUD_AREAS` contains `moor`. `pawprints`: `AREA_RULES.moor` equals `{ ground: null, path: 'sand', strip: null }`. `ambient`: `ambientKind('moor')` and `ambientKind('moor', { dusk: true })` are `'fluff'`.
  - `audio: moor ambience is a stronger wind and birdsong, never gulls, lap or horn`: with `ambienceProbe('moor')`, one buffer source (the wind), `intervals === 1` (birdsong), `timeouts === 0`; among the probe context's created gain nodes one has `gain.value` 0.06 and none has 0.03, where the same probe for `'park'` has one at 0.03 and none at 0.06.
  - `audio: a rainy moor swaps the birdsong for the rain wash`: two buffer sources, `intervals === 0`.
  - `lobby: a joiner who hasn't unlocked the Moor still accepts a Moor proposal as an override`.
  - `dressingroom: Legacy lists today's four places and never the Moor`.
  - `colonypanel: a Moor cat's place reads The Moor in both editions` (until now a cat from a newer build showed the raw id `moor`).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.**
- [ ] **Step 5: Commit.** `git add src/progression.js src/game/walk.js src/marks.js src/render/grass.js src/render/clouds.js src/render/pawprints.js src/render/ambient.js src/audio.js test/progression.test.js test/marks.test.js test/grass.test.js test/clouds.test.js test/pawprints.test.js test/ambient.test.js test/audio.test.js test/lobby.test.js test/dressingroom.test.js test/colonypanel.test.js`, then commit `feat(moor): register the Moor as a Clan Edition area`

### Task 7: Open the Moor on the territory map, and prove Legacy hides it

**Files:**
- Modify: `src/territories.js`: the `moor` entry becomes `{ id: 'moor', areaId: 'moor', name: 'The Moor', x: 620, y: 161, r: 165, status: 'built' }`; the comment "both built places cost 0 paws" reads "every built territory costs 0 paws".
- Test: `test/territories.test.js` (the layout row for `moor`; the "coming soon" test rewritten below), `test/dressingroom.test.js`, `test/dressingroomcontroller.test.js`, `test/edition.test.js`, `test/walk.edition.test.js`

**Interfaces:**
- Consumes: `territoryMapModel`, `renderTerritoryMapHtml`, `opensAfterLine`, `TERRITORIES` (shipped); the shipped Legacy guards, unchanged; `CATALOG.areas.moor` (Task 6).
- Produces: no new code beyond the `territories.js` entry.

- [ ] **Step 1: Write the failing tests**:

```js
// test/territories.test.js
it('the Moor is locked until 2 Woods walks, then "Tap to explore", then "tap to walk here" once opened', () => {
  const s = clanState();
  s.walks.woods = 1; s.unlocked.areas.push('woods');
  let moor = region(territoryMapModel(s, CATALOG), 'moor');
  expect(moor).toMatchObject({ name: 'The Moor', areaId: 'moor', locked: true, canOpen: false, owned: false });
  expect(moor.line).toBe('opens after 2 walks in The Woods · 1/2 so far');
  expect(regionHtml(renderTerritoryMapHtml(territoryMapModel(s, CATALOG)), 'moor')).toContain('data-dr-place="moor"');
  s.walks.woods = 2;
  moor = region(territoryMapModel(s, CATALOG), 'moor');
  expect(moor).toMatchObject({ locked: false, canOpen: true, line: 'Tap to explore' });
  s.unlocked.areas.push('moor');
  expect(region(territoryMapModel(s, CATALOG), 'moor')).toMatchObject({ owned: true, line: 'tap to walk here' });
});

// the River's version of "coming soon and unexplored regions can't be tapped",
// with the Moor taken out of both loops and one more tappable region
it("coming soon and unexplored regions can't be tapped", () => {
  const m = territoryMapModel(clanState(), CATALOG);
  for (const id of ['pines']) expect(region(m, id)).toMatchObject({ status: 'soon', line: 'coming soon', canOpen: false });
  expect(region(m, 'gorge')).toMatchObject({ status: 'later', line: 'unexplored', canOpen: false });
  const html = renderTerritoryMapHtml(m);
  for (const id of ['pines', 'gorge', 'island']) expect(regionHtml(html, id)).not.toContain('data-dr-place');
  // Twolegplace, the Woods, the River and the Moor
  expect((html.match(/data-dr-place=/g) || []).length).toBe(4);
});

// test/edition.test.js
test('the shipped Legacy guards cover the Moor', () => {
  expect(effectiveArea({ edition: 'legacy', area: 'moor' }, CATALOG)).toBe('neighborhood');
  expect(effectiveArea({ edition: 'canon', area: 'moor' }, CATALOG)).toBe('moor');
  expect(roomAreaMove({ edition: 'legacy', area: 'moor' }, CATALOG, 'park')).toBe('override');
  expect(rivalForWalk('moor', 'canon')).toBeNull();
  expect(areaInEdition(CATALOG.areas.moor, 'legacy')).toBe(false);
});
```

  - `dressingroom: Clan's Other places are still the Park, the Seaside and the Docks` (moved here from Task 6, as the River plan does: it passes only once the Moor's territory carries `areaId: 'moor'`).
  - `dressingroom: Legacy with the Moor chosen marks the Cozy Neighborhood card "today's walk"`, the Woods' shipped test with `area: 'moor'` (a live-check bug in the Woods, pinned here from the start).
  - `dressingroomcontroller: tapping the locked Moor buys nothing and keeps the area`; `tapping the opened Moor selects it` (the Woods pair, with a save at 1 and then 2 Woods walks).
  - `walk.edition: a Legacy kid whose place is the Moor walks the Neighborhood and keeps the Moor` (the Woods test of the same shape. The save takes `completeWalk('neighborhood')` twice and `buy('areas', 'woods')`, then `completeWalk('woods')` twice before `buy('areas', 'moor')`, then `setArea('moor')` and `setEdition('legacy')`. Add `vi.mock('../src/world/moor.js', (orig) => stubBuild('moor', orig))` beside the file's Neighborhood and Woods mocks. The mocked Neighborhood build records `'neighborhood'`; `state.area` stays `'moor'`).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.**
- [ ] **Step 5: Commit.** `git add src/territories.js test/territories.test.js test/dressingroom.test.js test/dressingroomcontroller.test.js test/edition.test.js test/walk.edition.test.js`, then commit `feat(moor): open the Moor on the territory map`

### Task 8: Colony feeding on the Moor (after owner step 2)

**Do not merge this task until the owner has confirmed owner step 2 (the live SQL accepts `moor`).** It ships in the same deploy as the Woods' colony task (Woods plan Task 11). Its tests assume the River's colony task (River plan Task 7) is already merged (the ordering ruling in Global Constraints).

**Files:**
- Modify: `src/colony.js`. Append `'moor'` to `COLONY_AREAS`, whatever is already in it. Assert membership, never the whole list.
- Modify: `test/legendary.test.js` line 17, to a named exemption list that works whatever else is in `COLONY_AREAS`: `const NO_LEGENDARY_YET = ['woods', 'river', 'moor']; // their legendary cats come with a later plan` and `expect(Object.keys(LEGENDARY_BY_AREA).sort()).toEqual(COLONY_AREAS.filter((a) => !NO_LEGENDARY_YET.includes(a)).sort())`. This replaces the River's `['woods', 'river']`; the Woods' colony task, shipping in the same deploy, keeps this list rather than its own `a !== 'woods'` filter. The loop at line 183 already runs over `COLONY_AREAS` and needs only to pass with `moor` in it (no legendary there).
- Modify: `docs/supabase-colony.sql` line 384, only if the repo copy doesn't list the six territory ids yet, exactly as the Woods plan's owner step 2.
- Modify: the River's colony test in `test/colony.test.js` ("feedsHere is true in the River once the server accepts it") asserts `feedsHere('moor')` is false; point it at `'pines'`. Likewise, `test/editions.invariants.test.js`'s "cats in territories this build cannot walk yet" example uses `'moor'`; point it at `'pines'`, which is still unbuilt.
- Test: `test/colony.test.js`, `test/editions.invariants.test.js`, `test/legendary.test.js`

**Interfaces:**
- Consumes: `feedsHere`, `feedCat`, `emptyColony`, `TERRITORY_AREAS` (Woods Task 3); the `boldName` and `ME` fixtures in `test/colony.test.js`.

- [ ] **Step 1: Write the failing tests**:

```js
// test/colony.test.js, copied from the River's block. The River's task already added
// `import { readFileSync } from 'node:fs';`. boldName and ME are the file's own fixtures
// (a real, non-shy stray from CAT_NAMES, and the player id 'aaaaaaaa-1111').
describe('the Moor feeds', () => {
  it('feedsHere is true on the Moor once the server accepts it', () => {
    expect(feedsHere('moor')).toBe(true);
    expect(feedsHere('pines')).toBe(false);
    expect(feedsHere('den')).toBe(false);
  });
  it('a Moor stray can be fed solo, and its spot is kept', () => {
    const r = feedCat(emptyColony(), { name: boldName, by: ME, walk: 'walk-1', area: 'moor', x: 30.5, z: -24, head: 0 });
    expect(r.result).toBe('ok');
    expect(r.colony.cats[0]).toMatchObject({ name: boldName, area: 'moor', x: 30.5, z: -24 });
  });
  it('the repo SQL accepts the Moor', () => {
    expect(readFileSync('docs/supabase-colony.sql', 'utf8')).toContain("'woods', 'moor', 'river', 'pines', 'island', 'gorge'");
  });
});

// test/editions.invariants.test.js
test('the caps are still unchanged with the Moor feeding', () => {
  expect([COLONY_MAX, SOLO_MAX]).toEqual([24, 12]);
});
```

  If `spotOf` rounds, assert the rounded values it returns. `test/editions.invariants.test.js` imports `test`, so its case stays `test(...)`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement**, and update `test/legendary.test.js` line 17 as above.
- [ ] **Step 4: Run the full suite.**
- [ ] **Step 5: Commit.** `git add src/colony.js test/colony.test.js test/editions.invariants.test.js test/legendary.test.js` (and `docs/supabase-colony.sql` if this task edited it), then commit `feat(moor): colony feeding on the Moor`

### Task 9: Check it live, and write it down

**Files:**
- Create: `public/places/moor.jpg`
- Modify: `docs/VISUAL-PASS.md` (a short "The Moor" entry: build-time and merged mesh, caster and triangle counts from `test/budget.test.js`, tree, heather, gorse and reed counts, the in-game draw counts, what was and wasn't checked)

- [ ] **Step 1: Run the full suite and the build.** Expected: all pass.
- [ ] **Step 2: Check it live.** Start a temporary launch entry rooted at this worktree, as the Woods check did (the default `whisker-walk-dev` server, port 5174, serves the main checkout). Drive the touch joystick and orbit with synthetic `TouchEvent`s, as the Woods check learned to.
  - Home screen in Clan Edition, on a save with 2 Woods walks: the Moor region is in colour and says "Tap to explore"; tapping it opens and selects it. Screenshot at 1280 × 720 and at the mobile preset (375 × 812). The Moor's tap area does not bleed into the Woods' or the Pines' (the Woods check's 3 px sampling).
  - Flip to Legacy on the title: four cards, no Moor; on a Moor-chosen save the dock says Cozy Neighborhood **and the Cozy Neighborhood card says "today's walk"**; flip back and the Moor is selected again.
  - Start a Moor walk: the corner map shows the lake, the two reaches and the mouth, both decks, the paths and the four tors; the horizon shows heather hills to the north, dark pines to the west, the Woods' green to the south and grey rock to the east; from the `moor-lake` scenic, the island, its tree and its bridge across the lake.
  - **Walk across the stepping stones on their visible edge** (z 29.3 and z 30.7, not only the middle): the cat is never stopped by water while on a stone. Walk the log both ways.
  - **Walk every path with the chase camera**, looking along it both ways: the camera never sits inside a canopy. Note any thorn or pine that comes close.
  - From the boulder and from the north, south and west of the old hawthorn, `gm-moor-2` is in sight on its limb; from round the High Tor, `gm-moor-1` on its top.
  - The rabbits at the warren bolt and vanish into a burrow; one counts in the journal as a Moor Rabbit.
  - The wind is audibly stronger than in the Woods, and the birdsong is there by day.
  - `?perf`: the Moor's draw count on the same tier as the Woods' and the Neighborhood's readings; record all three.
  - `verify-places.html?area=moor` builds; take the 640 × 360 `moor.jpg` from `VIEWS.moor`. If a tor or tree fills the frame, move the camera along the high path and write the final view into `VIEWS.moor`.
  - No console errors. Reset the viewport to desktop afterwards.
- [ ] **Step 3: Write the VISUAL-PASS entry.**
- [ ] **Step 4: Commit.** `git add public/places/moor.jpg docs/VISUAL-PASS.md` (and `verify-places.html` if the view moved), then commit `docs(moor): the Moor's budget and live check`
