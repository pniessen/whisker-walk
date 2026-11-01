# Clan Edition: the Pines and Swamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Pines and Swamp as the fourth all-new Clan Edition territory: a dark pine forest and a boggy swamp north of the River and west of the Moor, holding the lake's north-west shore where the one bridge to the island starts, opened from the home-screen territory map after two River walks.

**Architecture:** A new outdoor area, `src/world/pines.js`, built the way `woods.js`, `river.js` and `moor.js` are: content records first, `PINES_KEEP_CLEAR` built from them, seeded scenery that keeps clear of it, water footprints with dry decks, and a side-tinted horizon. Its east edge continues the Moor's west edge and its south edge continues the River's north edge; the lake, the island and the bridge foot are the ones those maps already show. The forest is dense, so most pines are merged into one still **pine stand** (two draw calls) and only the pines a kid walks past are individual swaying trees. It adds two builder pieces (`pineStand`, `toadstools`) and one critter (a frog), is registered in the tables the other territories used, flips from `'soon'` to `'built'` in `src/territories.js`, and feeds the colony straight away (the live database already accepts `pines`).

**Tech Stack:** Vanilla JS, Three.js 0.185, Vite 8, Vitest 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-editions-and-territories-design.md` (Owner's answers 1–10, especially 7 and 8; §3; §4; §8 step 7). Templates: `docs/superpowers/plans/2026-10-31-clan-edition-woods.md`, `…-river.md` (both merged with their colony feeding) and `…-moor.md` (being built on branch `moor`; **this plan assumes the Moor has merged first**).

## Global Constraints

- `SAVE_VERSION` stays 4. New save content is the `pines` key in `walks` and `marks` (additive, defaulted), the `'pines'` unlock id, and the `'frog'` journal type. `pines` is already in `TERRITORY_AREAS` (`src/colony.js`), so the colony keeps Pines cats on any build with the Woods foundation.
- The clan spec's §8 invariants hold: **no cat un-tames, no cat is dropped, a v4 save still loads, `COLONY_MAX` (24) and `SOLO_MAX` (12) are unchanged.**
- The area id is `pines`; the catalog record is `{ name: 'The Pines and Swamp', price: 0, requires: { area: 'river', walks: 2 }, edition: 'canon' }` (spec §3, "Unlocking territories").
- An area builds identically in both editions: `src/world/pines.js` never reads the edition (no `/edition/i` anywhere in the file, comments included). Nothing on the wire changes. The frog is an ordinary critter from `critterSpawns`.
- **No rival patrol** in the Pines (`rivalForWalk('pines', …)` stays `null`). That is the truce today: crossing Pines land to the bridge never starts a chase or costs anything (spec decision 8). This plan builds the truce *path* and exports it (`TRUCE_PATH`) so the clan-pick plan can keep any future patrol off it.
- **The bridge is scenery in this plan.** It is drawn from the Pines' shore to the island at the shared position, but it has no deck and the island has no ground: the cat walks to the bridge foot and stops at the shore. Walking onto the bridge and the island is the island plan's (§8 step 8), and the territory map's island stays "coming soon".
- No legendary cat, kittypet wanderer, border posts, or prop set beyond three frog hides (Task 4).
- Sea Legs is a shortcut, never a key: everything in the deep swamp is reachable dry over a deck.
- Budget: the Cozy Neighborhood's. At most 450 meshes, 380 casters and 60,000 triangles as built; 260 meshes and 205 casters merged (`test/budget.test.js`). Compare: the Woods measured 172 / 152 / 44,462 built, the River 159 / 133 / 45,344.
- Every borrowed *Warrior Cats* word stays in `src/clanwords.js`. This plan adds none. Its labels are plain words of our own (defaults in Owner steps), and none uses a scanned word (`kit`, `apprentice`, `warrior`, `elder`, `queen`, `medicine cat`, `deputy`, `leader`, `loner`, `rogue`, `kittypet`, `Twolegplace`, `Clan`) or a book place name ("Gathering", "Carrionplace", "Fourtrees" and the like).
- Comments and docs are plain and say why. Commit with explicit `git add <files>`; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`. Build: `npm run build`.

### Dependencies on the Moor, and what changes if the order flips

The Moor (branch `moor`) is assumed merged. What the Pines takes from it:

- **P1, imports.** `pines.js` imports `ISLAND_BRIDGE_WOODS` from `./moor.js` (the bridge defined once, in Woods coordinates: `[[-77.4, -79.2], [-89.4, -95.2]]`, island rim then Pines shore). Tests import `MOOR_WATERS`, `MOOR_PATHS`, `MOOR_ISLAND` from `src/world/moor.js`. If the Moor merged them under other names, use those; do not re-declare the bridge.
- **P2, `windLayer({ gain, cutoff })`** (Moor Task 6) for the Pines' hushed wind.
- **P3, shared test values, written with the Moor merged:** `GOLD_TOTAL` 24; `JOURNAL_TYPES` and `CRITTER_INFO` length 13 (`test/docks.test.js`); the territory map has **no** `'soon'` region left and 5 tappable places; `NO_LEGENDARY_YET` is `['woods', 'river', 'moor', 'pines']`; the "a territory the colony doesn't feed yet" examples use `'island'`. Whole-list assertions (`Object.keys(GOLD_MICE)`, the `walks`/`marks` deep-equals, the climbing ground-mice lists) hold `moor` then `pines`, `pines` appended before `'den'` wherever `'den'` closes a list.
- **If the Pines lands first after all,** the second lander (the Moor) rewrites: `GOLD_TOTAL` 21 then 24; journal lengths 12 then 13; the territory "coming soon" loop `['moor']` then `[]` and the place count 4 then 5; `NO_LEGENDARY_YET` gains `'moor'`; the `feedsHere(...)` false examples. In that order the Pines would define `ISLAND_BRIDGE_WOODS` and `windLayer`'s options itself (Moor plan's values exactly), its Moor-edge test would use the Moor plan's numbers as literals, and the Moor would import the bridge from `pines.js` and swap those literals for imports. Both plans' rows stay in `test/budget.test.js`, `test/climbing.test.js`, `test/goldmice.test.js`, `test/progression.test.js`, `test/lobby.test.js`, `test/goalsarea.test.js` and `test/minimap.test.js`.

### Lessons carried in, as rules

1. **Content before scenery; `PINES_KEEP_CLEAR` derived from the records** (Task 4 before Task 5).
2. **Every goal is finishable.** No tippables, no boxes, no villagers, so `createGoals` (three rng draws, unchanged) never offers tip-over, sit-in-a-box or head scratches here; pinned over 400 seeds.
3. **No canopy over a path:** a pine keeps `PATH_W / 2 + 1.3 × scale + 0.5` from every path centreline.
4. **A deck is what the kids see, at least 1.5 m wide, proven by raycast:** the log is the River's (1.8 m hewn flat); the stones are the Woods' shipped ford (14 stones, `rMin 0.88, rMax 0.9, jitter 0, stagger 0.03, sides 16`, ±0.75 m deck).
5. **A flood fill with the real `isWalkableAt` reaches every find** from the spawn; without the decks the deep swamp can't be reached.
6. **Golden mice are in sight from the chase camera**, not just a cat's eye.
7. **Budget by traversal**, `noCast` meshes counted as meshes. **Dense pines are planned as a merged stand from the start** (Task 1), not fixed after a budget failure.
8. **`nearestDry` at overlapping waters** (the mire's corner, the bay over the lake): spots added to `test/water.test.js`.
9. **Edges agree with every neighbour, asserted in tests** (the River's R3 rule): the lake, the bay, the island, the bridge foot, the River's north path and the Moor's river mouth (Task 3).

## Review Focus

1. **A save with the Pines unlocked, played in Legacy, or a Legacy kid joining a Pines co-walk.** Legacy walks the Neighborhood, `state.area` stays `'pines'`, the Cozy Neighborhood card says "today's walk"; the joiner walks the Pines as an override. Tests in Task 7.
2. **A save or cloud payload from a device without the Pines** (no `pines` keys, a colony cat with `area: 'pines'`, a `frog` journal count). It loads with every cat, `walks.pines` 0, `marks.pines` `[]`; an old build drops only the frog count, which counts up again from the next frog. Tests in Tasks 2, 6 and 8.
3. **The Black Mire cutting off the deep swamp.** Every POI, find, scenic and golden mouse there is reachable dry over either deck alone, and none without a deck. Tests in Tasks 3–5.
4. **A toy or scent treat landing in the mire's corner, a bog, or where the bay overlaps the lake.** `nearestDry` lands it dry within 5 m. Tests in Task 3.
5. **A kid walking up to the island bridge and pushing on.** The cat stops dry at the shore with the bridge in front of it; no point along the bridge is walkable; nothing anywhere puts the cat on the island; the territory map's island still says "coming soon". Tests in Tasks 3 and 7.

## Owner steps

These are for the owner (the parent), not the implementer.

1. **Update both devices before either kid walks the Pines.** After the deploy that carries this plan, on **both** devices close every Whisker Walk tab (and the home-screen app), reopen it, and check that the home-screen map shows **The Pines and Swamp** in colour with an "opens after…" or "Tap to explore" line, not "coming soon". An old build drops the Pines unlock, its walk count, its marks and the journal's frog count, and its lobby ignores a Pines walk proposal.
2. **No SQL this time.** The live `colony_feed` already accepts `'pines'` (run 2026-10-31). To double-check: `select prosrc like '%''pines''%' from pg_proc where proname = 'colony_feed';` → `true`.
3. **Check the Pines on the iPhone 18** after Task 9: a Pines walk on the HIGH tier holds 60 fps, the dense forest included. Note its draw count beside the Woods', the River's and the Neighborhood's.
4. **Show her the Pines.** Settled, not open:
   - **Owner's decision (2026-10-31):** the places are **"the Lightning Stump"** (a charred, lightning-snapped pine stump to climb), **"the Frog Stones"** (two mossy stones in the deep swamp), **"the Black Mire"** (the dark creek that cuts off the deep swamp), **"the heart of the swamp"**, **"the truce path"** and **"the truce stones"** (the path to the island bridge and the two stones at its foot);
   - **Owner's decision (2026-10-31):** the swamp's critter is a **frog**, "Bog Frog" in the journal, that bolts into a bog when a cat comes close;
   - **Owner's decision (2026-10-31):** the sound is a **low hush of wind in the pines plus frogs, and no birdsong**; rain and dusk crickets as everywhere;
   - **Owner's decision (2026-10-31):** the bridge is **scenery, seen and not walked,** until the island plan;
   - **Coordinator's ruling (2026-10-31):** the layout as proposed: the lake fills the south-east, the bridge leaves from the bay's north shore, the swamp is the west side with its deep part behind the Black Mire in the north-west, the forest is everything else, and a kid arrives on the River's north path, carried on as the truce path;
   - **Coordinator's ruling (2026-10-31):** the merged pine stand stays still; only the near pines sway.

## What this plan defers (each gets its own plan)

- **The island**: its map, walking the bridge, the meeting place (§8 step 8). The Pines shows the island and bridge and owns the bridge's shore end.
- **The per-kid clan pick, homage names and patrols** (decisions 2 and 3). `TRUCE_PATH` is exported for that plan.
- **Kittypets and wanderers** (decision 6; no Twolegplace path reaches the Pines anyway).
- **Border crossings** (§8 step 6). The Moor has no path at its west edge, so a Moor-side way to the bridge is the border-crossing plan's to add, on both maps.
- **Swaying the merged stand.** The stand is still; only the 30–40 pines near the paths sway. Vertex-shader sway for the stand is a later visual pass if it reads as dead on the iPhone.
- **The island on the corner map** (the minimap draws water footprints, so the in-bounds island shows as lake).
- **A known horizon-only mismatch:** the Moor's `LAKE_FAR` paints water 20 m further west than the Pines' shore (Pines x −20..0, z 4.8..8.5). It is beyond the Moor's bounds, 50 m from its edge and in fog; left as is.
- In the Pines: carryables, knockables, rests, flaps and markables, a legendary cat, "Camp" wording.

## Files

| File | Responsibility |
|---|---|
| `src/world/builder.js` | Gains `pineStand`, `toadstools` (uses the River's `pine`, `reedBed`, `fernBed`, `lilyPads`, `logBridge`, `steppingStones`, `fallenLog`, `bush`, `puddle`) |
| `src/critters.js`, `src/journal.js`, `src/game/labels.js`, `src/game/walk.js` (hide toast), `src/progression.js` (`JOURNAL_TYPES`) | The frog |
| `src/world/pines.js` (new) | The Pines and Swamp map |
| `src/goldmice.js` | `pines` entry |
| `src/propsets.js` | `SETS.pines`: three frog hides, nothing else |
| `src/progression.js` | Catalog entry and `walks.pines` |
| `src/game/walk.js` | `AREAS` gains `pines` |
| `src/marks.js` | `MARK_AREAS` and `emptyMarks` gain `pines` |
| `src/render/{grass,clouds,pawprints,ambient}.js`, `src/audio.js` | Pines entries; `frogLayer` |
| `src/territories.js` | The Pines flips to `'built'` |
| `src/colony.js` | `COLONY_AREAS` gains `pines` (Task 8) |
| `verify-places.html`, `public/places/pines.jpg`, `docs/VISUAL-PASS.md` | Picture, view and the written check |

## The Pines and Swamp in numbers

Coordinates are metres, x east, z south (north is −z). **Frames:** the Pines sits directly north of the River (same x; a River point (x, z) is the Pines point (x, z + 100)) and directly west of the Moor (same z; a Moor point (x, z) is the Pines point (x + 100, z)). So a Woods point (x, z) is the Pines point (x + 100, z + 100). In this frame the lake, the island and the bridge the other three maps paint on their horizons fall **inside** the Pines' bounds, in its south-east quarter: the Pines is the one map that holds them as ground truth.

| Thing | Value |
|---|---|
| `bounds` | `{ minX: -50, maxX: 50, minZ: -50, maxZ: 50 }` |
| `SPAWN` | `{ x: -26, z: 44 }`, on the truce path 6 m in from the River, where the River's north path (`[-22,-37,-26,-50]`) crosses the border |
| Ground | `b.ground(120, 0x56603e, { surface: 'grass' })`; `groundBounce: 0x56603e` |
| Sky | `b.applySky(scene, 0x9fb4c0, 0xc8d0c4)`; `skyDusk: { top: 0x22304a, horizon: 0x5e5a6e }` |
| `LAKE` | `{ id: 'lake', kind: 'rect', minX: 26, maxX: 86, minZ: 8, maxZ: 66 }`. `minZ` is the Moor's `LAKE.minZ`, `maxX` the Moor's `maxX` + 100, `minX` the River's `LAKE.minX`, `maxZ` the River's `maxZ` + 100; the south-east corner is the Woods' lake corner + 100 |
| `LAKE_BAY` | `{ id: 'lake-bay', kind: 'rect', minX: 0, maxX: 30, minZ: 5, maxZ: 44 }`: the bay round the island, the River's `LAKE_FAR` + 100 in z. Its north shore (z 5) is where the bridge starts |
| `MIRE_NORTH` | `{ id: 'mire-north', kind: 'rect', minX: -32, maxX: -27, minZ: -120, maxZ: -6, decks: [LOG_BRIDGE] }`: the Black Mire, in from the north |
| `MIRE_WEST` | `{ id: 'mire-west', kind: 'rect', minX: -120, maxX: -27, minZ: -11, maxZ: -6, decks: [STEPPING_STONES] }`: the Black Mire, out to the west |
| `BOGS` | `bog-1 (-40, 16) r 3.5`, `bog-2 (-44, 30) r 3`, `bog-3 (-37, -22) r 2.5`, `bog-4 (-40, -44) r 2.5`, each `kind: 'circle'` |
| `MOOR_RIVER`, `MOOR_MOUTH` | `{ id: 'moor-river', kind: 'rect', minX: 60, maxX: 123, minZ: -4, maxZ: 1 }`, `{ id: 'moor-mouth', kind: 'rect', minX: 60, maxX: 65, minZ: -4, maxZ: 10 }`: the Moor's `river-west` and `river-mouth` + 100 in x, pouring into the lake just past the east edge. Outside `bounds` |
| `PINES_WATERS` | `[LAKE, LAKE_BAY, MIRE_NORTH, MIRE_WEST, BOG_1, BOG_2, BOG_3, BOG_4, MOOR_RIVER, MOOR_MOUTH]` |
| `LOG_BRIDGE` | `{ minX: -33.5, maxX: -25.5, minZ: -30.9, maxZ: -29.1 }`; drawn `b.logBridge(-33.5, -30, -25.5, -30, 3.0, 0.16, 1.9)` (the River's log, turned to run along x) |
| `STEPPING_STONES` | `{ minX: -42.75, maxX: -41.25, minZ: -12.5, maxZ: -4.5 }`; drawn `b.steppingStones(-42, -12, -42, -5, 14, { rMin: 0.88, rMax: 0.9, jitter: 0, stagger: 0.03, sides: 16 })` (the River's ford over a 5 m channel) |
| Water draw | lake, bay and the Moor's river `0x5f98a8` (one water with the other maps); mire and bogs `0x4a5a48` (peaty). Heights: lake 0.03, lake-bay 0.025, mire-north 0.035, mire-west 0.02, bogs 0.03, moor-river 0.035, moor-mouth 0.045. Shores: lake `['minX', 'minZ']`, lake-bay `['minX', 'minZ', 'maxZ']`, mire-north `['minX', 'maxX']`, mire-west `['minZ', 'maxZ', 'maxX']`, bogs all edges, moor-river and moor-mouth none |
| `PINES_PATHS` (3 m wide, `surface: 'sand'`, `color: 0x6a5640`) | truce path `[-26,50,-26,34]`, `[-26,34,-10,18]`, `[-10,18,-4,2]`, `[-4,2,10.6,2.5]`; pine path `[-4,2,-8,-18]`, `[-8,-18,-24,-30]`; east path `[-8,-18,18,-26]`, `[18,-26,40,-4]`; swamp path `[-26,34,-36,6]`, `[-36,6,-42,-3]`; deep-swamp paths `[-42,-14,-44,-36]`, `[-35,-30,-44,-36]` |
| `TRUCE_PATH` | `PINES_PATHS.slice(0, 4)`: from the River's border to 2.3 m short of the bridge foot |
| The deep swamp | the land behind the Black Mire: x −50..−32, z −50..−11. Reached only over a deck |
| `PINES_ISLAND` | `{ x: 28, z: 28, r: 9, rise: 1.4 }`: the Woods' `(-72, -72)` + 100, the River's `(28, -72)` + 100 in z, the Moor's `(-72, 28)` + 100 in x. In bounds but wholly in water: mound and `b.tree(28, 28, 2.6)` raised to `rise - 0.2`, no collider, no perch |
| `BRIDGE_FOOT` | `{ x: 10.6, z: 4.8 }` = `ISLAND_BRIDGE_WOODS[1]` + (100, 100), 0.2 m onto dry land. The plank runs to `ISLAND_BRIDGE_WOODS[0]` + (100, 100) = `(22.6, 20.8)` on the island's rim: one `BoxGeometry(2, 0.12, 20)` at y 0.3, centre `(16.6, 12.8)`, named `islandBridge`. **No deck** |
| Truce stones | two standing stones flanking the bridge foot on land, `(9.0, 3.6)` and `(12.2, 3.6)`, collider r 0.4 each, named `truceStones` (one merged mesh, 0.9 m tall) |
| Lightning Stump chain | mossy boulder `(4, -28)` y 0.72 `'stone'` (collider r 0.7) → charred stump `(3, -29)` y 1.9 `'tree'` (collider r 0.9, `CylinderGeometry(0.75, 0.9, 1.9, 7)`, colour `0x3e342c`, `'bark'`, named `lightningStump`; boulder `lightningStumpRock`), label `'lightning stump'`, vantage |
| Frog Stones chain | mossy boulder `(-37, -15)` y 0.72 `'stone'` (collider r 0.7) → tall stone `(-38, -16)` y 1.9 `'stone'` (collider r 0.9, `CylinderGeometry(0.75, 0.9, 1.9, 7)`, colour `0x7a8270`, `'cobble'`, named `frogStone`; boulder `frogStoneRock`), label `'frog stones'`, vantage. In the deep swamp |
| Fallen pine | `b.fallenLog(-14, 42, 5, 0.4)`, perch `(-14, 42)` y 0.5 `'tree'`, colliders r 0.4 at `(-14.58, 40.63)`, `(-14, 42)`, `(-13.42, 43.37)` |
| `pois` (9) | `(-14,30)`, `(-34,24)`, `(-18,6)`, `(-6,-8)`, `(-18,-42)`, `(12,-40)`, `(34,-30)`, `(40,-4)`, `(-44,-26)` |
| `scenics` | `{ id: 'island-bridge', x: 8, z: 1, label: 'the bridge to the island' }`, `{ id: 'black-mire', x: -24, z: -22, label: 'the black mire' }`, `{ id: 'swamp-heart', x: -45, z: -20, label: 'the heart of the swamp' }` |
| `collectibles` | `pines-find-1 (-20, 20) 'a fat pine cone'`; `pines-find-2 (24, -14) 'an owl feather'`; `pines-find-3 (-46, 22) 'a tuft of bog cotton'`; `pines-find-4 (-40, -36) 'a shiny beetle shell'`; `pines-find-5 (-37, -15, y 0.72) 'a mossy pebble on the low stone'` |
| Golden mice | `gm-pines-1 (3, -29, y 1.9)` top of the Lightning Stump; `gm-pines-2 (-38, -16, y 1.9)` top of the Frog Stones; `gm-pines-3 (30, -42, y 0)` hidden among bushes at `(28,-40)`, `(32,-40)`, `(30,-45)` |
| Frog hides (`propsFor('pines').hides`) | `(-36.1, 16)`, `(-40.6, 30)`, `(-34.1, -22)`: each 0.4 m out from the east rim of bog-1, bog-2 and bog-3 |
| `puddles` | `{ x: -6, z: 38, r: 0.9 }`, `{ x: 22, z: -6, r: 0.8 }` |
| `PINES_KEEP_CLEAR` | every POI, scenic, collectible, golden mouse, chain perch, gold bush, puddle, frog hide, truce stone, `BRIDGE_FOOT` and the spawn |
| Pines | `pinesTrees() -> { near, stand }` (Task 5): near 30–40 swaying `b.pine`, stand 70–150 in one `b.pineStand` |
| Undergrowth | `pinesUndergrowth() -> { ferns, toadstools }`: ferns 100–220 (not in the swamp), toadstool clusters 30–60 |
| Reeds, lily pads | `pinesReeds()` 100–220 clumps; `pinesLilyPads()` 10–35 pads on the bogs |
| Horizon (`PINES_HORIZON`) | `kind: 'hills'`, inner 56, outer 116, height 8, wavelength 30, colour `0x34503e`, salt 47, `avoid: [LAKE, MIRE_NORTH, MIRE_WEST, MOOR_RIVER]`, `sideTints: { north: 0x3f5a46, east: 0x9a8a9c, south: 0x7f9a66, west: 0x4a5a44 }`, no rooftops. North: more dark pines (the colour the River and the Moor paint the Pines); east: the Moor's heather; south: the River's green; west: the swamp going on |
| `critterSpawns` | birds at the first four `near` pines; frogs `(-38,20)→(-36,13)`, `(-46,26)→(-42,34)`, `(-34,-26)→(-40,-30)` (patrol `x2, z2` like mice); squirrels `(-12,-34)`, `(20,-20)`; ducks `(34,14)`, `(36,16)`, `(38,13)` on the lake; mice `(10,-36)→(16,-30)`, `(-20,-44)→(-14,-38)`. No butterflies, no villagers |
| `moments` | `{ id: 'frog-plop', type: 'frog', label: 'a frog hopping for the bog', x: -36.1, z: 16, from: { x: -30, z: 22 } }` |
| `boxes`, `tippables` | `[]`, and no villager |
| Grass | `GRASS_STYLES.pines = PINE_FLOOR`: `{ color: 0x6a7a44, hMin: 0.06, hMax: 0.2, width: 0.9, warm: 0.1, sway: 0.3, reach: 1.2, density: pineFloorDensity }`; `pineFloorDensity(x, z) = 0.7 * smooth01(0.35, 0.65, patchNoise(x, z, 5.0, 61))` |
| Paw prints | `AREA_RULES.pines = { ground: null, path: 'wetSand', strip: null }` (dark muddy prints) |
| Ambient life | `ambientKind('pines')` is `'motes'` (sunlit motes in the shafts under the pines), `'moths'` at dusk; the game's own dusk fireflies come as everywhere |
| Sound | `windLayer({ gain: 0.035, cutoff: 220 })` (a low hush), `frogLayer()` always, `rainLayer()` in rain, **no birdsong**; crickets at dusk from the shared line |

Checked before writing with a standalone flood fill on a 0.5 m grid using the real `isWalkableAt` and the Task 5 tree rules: every POI, scenic, find, hide and golden mouse (or its chain's first step) is reached from the spawn; with no decks, exactly the deep-swamp ones are not, and either deck alone reaches all of them; every POI is clear of every collider by 1.6; every path keeps ≥ 2.5 m of centreline from open water (the truce path's last leg is the tightest, at 2.51); the island's whole rim is in water and the bridge foot is dry; the tree rules keep 40 near pines and 87 in the stand with the closest trunks 1.79 m apart; the undergrowth rules keep 133 ferns, 45 toadstool clusters and 142 reed clumps; 4 pines stand on the strip by the River's border (x −6..24, z ≥ 40), where the River plants its own (its ruling R1).

---

### Task 1: Builder pieces: a pine stand and toadstools

**Files:**
- Modify: `src/world/builder.js` (after `lilyPads`)
- Test: `test/builder.test.js`, `test/rig.test.js`

**Interfaces:**
- Produces (no colliders emitted; placement by `hash01`, never `Math.random`):
  - `pineStand(trees: Array<{ x, z, scale }>, seed) -> THREE.Group` of two merged meshes, `standTrunks` and `standFoliage`: each tree is exactly `pine(x, z, scale)`'s trunk and three cones (same geometry, same colours `0x7a5230` / `0x2f5a3a`, same surfaces), scaled and placed, and turned about y by `hash01(x, z, seed) × 2π`. Both meshes cast (they are tall solids). No `wind`: the stand is still. An empty list gives two empty geometries without throwing. Comment why: one stand is two draw calls and two casters however many pines, where a swaying `pine` is two each.
  - `toadstools(spots: Array<{ x, z }>, seed) -> THREE.Group` of two merged `noCast` meshes: `toadstoolStems` (`CylinderGeometry(0.03, 0.04, h, 6)`, `h = 0.08 + 0.08 × hash01`, colour `0xe8dcc0`) and `toadstoolCaps` (half-domes `SphereGeometry(r, 8, 4, 0, 2π, 0, π/2)`, `r = 0.07 + 0.05 × hash01`, on each stem, colour `0xc0392b`). Each spot is a cluster of 2–4 within 0.3 m. Never taller than 0.3 m.

- [ ] **Step 1: Write the failing tests** in `test/builder.test.js`:
  - `pineStand is two meshes that match the pines it stands for`: for `trees = [{ x: 0, z: 0, scale: 1 }, { x: 5, z: -3, scale: 1.5 }]`, the group holds exactly two meshes named `standTrunks` and `standFoliage`; the foliage's vertex count is `2 ×` the foliage vertex count of `pine(0, 0)`; the group's `Box3` equals the union of `pine(0, 0, 1)` and `pine(5, -3, 1.5)`'s boxes within 0.05 in y and within each tree's turned cone radius in x and z (assert `max.y` within 0.05 of the scale-1.5 pine's, and `min.y >= -1e-6`).
  - `pineStand is the same for the same trees and seed, and an empty stand builds`: equal position arrays on two calls; `pineStand([], 1)` throws nothing and holds two meshes.
  - `toadstools are two noCast meshes under 0.3 m`: both meshes found by name with `traverse`; each `castShadow === false` and `userData.noCast === true`; group `Box3.max.y <= 0.3`.
  - In `test/rig.test.js`: `assignShadowCasters casts the pine stand and leaves the toadstools out`.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run test/builder.test.js test/rig.test.js`. Expected: `pineStand is not a function`.
- [ ] **Step 3: Implement** both, each with a short comment on what it is and why its shape. Build the stand's per-tree geometry from the same constants `pine` uses (lift them to module constants shared by both, so the two can never drift apart).
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `git add src/world/builder.js test/builder.test.js test/rig.test.js`, then commit `feat(builder): a merged pine stand and toadstools for the Pines and Swamp`

### Task 2: A frog

**Files:**
- Modify: `src/critters.js`: `buildCritter('frog')` (a squat body `SphereGeometry(0.08, 8, 6)` scaled `(1.2, 0.7, 1.3)` at y 0.06, colour `0x5e8a3a`; two eye bumps `SphereGeometry(0.025, 6, 4)` on top front; two folded back legs `box(0.05, 0.04, 0.1)` either side; under 0.2 m tall). `'frog'` joins `STALKABLE` and `PREY` and the mouse/rat/squirrel patrol-and-flee branch with a flee speed of **5.0 m/s**. While fleeing it hops: `group.position.y = 0.12 × |sin(12 t)|`, back to 0 when it stops or hides. **Not** in `CHASEABLE` (it only bolts, like the mouse, the rat and the Moor's rabbit, so it never answers a Far Call).
- Modify: `src/progression.js`: append `'frog'` to `JOURNAL_TYPES`.
- Modify: `src/journal.js`: `CRITTER_INFO` gains `{ id: 'frog', emoji: '🐸', name: 'Bog Frog', hint: 'Creep up softly, or it plops into the bog!' }`.
- Modify: `src/game/labels.js`: `labelFor` gains `frog: 'a croaking frog'`; new `hideToastFor(type) -> string`, `'The frog plopped into the bog! 🐸'` for a frog and today's `` `The ${type} dived under cover! 🐭` `` for anything else. `src/game/walk.js`'s `onHide` calls it, so every other critter's toast is unchanged.
- Test: `test/critters.test.js`, `test/journal.test.js`, `test/docks.test.js` (`JOURNAL_TYPES` and `CRITTER_INFO` lengths 12 → 13), `test/progression.test.js`, `test/interactions.test.js` (where `labelFor` is tested)

**Interfaces:**
- Produces: `'frog'` as a critter type `createCritters` spawns from `critterSpawns` and a moment's `type`, a journal type, and `hideToastFor(type)`.

- [ ] **Step 1: Write the failing tests**:
  - `critters: a frog bolts for its hide when the cat trots up, and stays hidden`: the existing mouse test with `type: 'frog'`, its dash-distance bounds scaled from 6.5 to 5.0 m/s; it ends hidden within `HIDE_REACH` of the hide.
  - `critters: a fleeing frog hops, and lands`: during that run some frame has `group.position.y > 0.05`; once hidden or stopped, `group.position.y === 0`.
  - `critters: a frog is under 0.2 m tall and can be pounce-tagged` (at least 4 catches in 5, in the style of "stalk straight in and pounce when it notices").
  - `critters: a frog never answers a Far Call` (in the style of "never draws the critters a meow scatters").
  - `journal: the frog's entry is the Bog Frog`, and every journal type has an entry.
  - `labelFor('frog')` is `'a croaking frog'`; `hideToastFor('frog')` is `'The frog plopped into the bog! 🐸'`; `hideToastFor('mouse')` is `'The mouse dived under cover! 🐭'`.
  - `progression: a frog spotted is counted, and the count survives a reload`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `git add src/critters.js src/journal.js src/game/labels.js src/game/walk.js src/progression.js test/critters.test.js test/journal.test.js test/docks.test.js test/progression.test.js test/interactions.test.js`, then commit `feat(critters): a frog, and the Bog Frog in the journal`

### Task 3: The Pines: ground, water, crossings, paths, the island bridge and the horizon

**Files:**
- Create: `src/world/pines.js`
- Modify: `verify-places.html` (`AREAS` gains `pines`; `VIEWS.pines = '-6,1.6,-2,28,1.0,28'`, from the truce path's last bend looking down the bay to the island and its bridge)
- Test: `test/pines.test.js` (new; copy `test/moor.test.js`'s canvas stub, `segDist`, `rectDist`, `flood`, `reaches`, `reachesWithin`), `test/water.test.js`, `test/budget.test.js` (both tables)

**Interfaces:**
- Consumes: `logBridge`, `steppingStones`, `horizonBand` (with `sideTints`), `waterGap`, `inWater`, `tree` from `src/world/builder.js`; `createWater`; `ISLAND_BRIDGE_WOODS` from `./moor.js` (P1). Tests only: `WOODS_WATERS`; `RIVER_WATERS`, `RIVER_PATHS`, `RIVER_ISLAND`; `MOOR_WATERS`, `MOOR_PATHS`, `MOOR_ISLAND`.
- Produces, from `src/world/pines.js`, frozen, with the values in "The Pines and Swamp in numbers": `SPAWN`, `PINES_WATERS`, `PINES_PATHS`, `TRUCE_PATH`, `PINES_ISLAND`, `BRIDGE_FOOT`, `PINES_HORIZON`; and `build(scene, { water = {}, wind } = {}) -> areaData`, `name: 'The Pines and Swamp'`, every key `moor.js` returns (content keys Task 4 fills may be `[]` for now). The header comment says, in `river.js`'s style: what the Pines is; where each edge faces (east the Moor, with the lake's north shore carried straight on and the Moor's river pouring in just past the edge; south the River, with its north path carried on as the truce path and the lake's west shore at the same x; north more pines to the edge of her map; west the swamp going on); that the lake, the island and the bridge foot are the ones every neighbour paints, and why the island is in bounds but out of reach; that the bridge waits for the island; and why the two decks exist. No word "edition" in any form.

- [ ] **Step 1: Write the failing tests** in `test/pines.test.js`:
  - `declares the lake, the bay, the Black Mire's two reaches, four bogs and the Moor's river`: ids in the `PINES_WATERS` order; `area.waters` equals `PINES_WATERS`; all frozen.
  - `every water is drawn from its own footprint, at the scene root`; `draws overlapping waters at different heights` (lake/lake-bay, mire-north/mire-west, moor-river/moor-mouth, moor-mouth/lake).
  - `the Black Mire's two reaches meet watertight`: `MIRE_NORTH.maxZ === MIRE_WEST.maxZ`, `MIRE_NORTH.maxX === MIRE_WEST.maxX`, and every point on a 0.25 m grid over `x −32..−27, z −11..−6` is wet.
  - `the deep swamp can be reached only over the decks, and over either one alone`:

```js
it('the deep swamp can be reached only over the decks, and over either one alone', () => {
  const deep = [[-44, -26], [-45, -20], [-40, -36], [-46, -46]];
  for (const [x, z] of deep) expect(reaches(area, x, z), `(${x}, ${z})`).toBe(true);
  const noDecks = { ...area, waters: PINES_WATERS.map((w) => ({ ...w, decks: [] })) };
  for (const [x, z] of deep) expect(reaches(noDecks, x, z), `(${x}, ${z}) without decks`).toBe(false);
  // the mire only cuts off the deep swamp
  for (const [x, z] of [[-34, 24], [-18, -42], [40, -4]]) expect(reaches(noDecks, x, z), `(${x}, ${z})`).toBe(true);
  for (const keep of ['mire-north', 'mire-west']) {
    const one = { ...area, waters: PINES_WATERS.map((w) => (w.id === keep ? w : { ...w, decks: [] })) };
    for (const [x, z] of deep) expect(reaches(one, x, z), `only ${keep}'s deck: (${x}, ${z})`).toBe(true);
  }
});
```

  - `the log bridge's deck is no wider than the log the kids see` and `the stepping stones cover their whole deck, with no open water on it`: the River's two raycast tests, pointed at `logBridge` over mire-north (the deck runs along x) and `steppingStones` over mire-west (along z). The log deck is at least 1.8 m wide, the stone deck's half-width at least 0.75.
  - `the Pines' edges match the Moor's west edge and the River's north edge`:

```js
it("the Pines' edges match the Moor's west edge and the River's north edge", () => {
  const w = (list, id) => list.find((x) => x.id === id);
  const lake = w(PINES_WATERS, 'lake'), bay = w(PINES_WATERS, 'lake-bay');
  const mLake = w(MOOR_WATERS, 'lake'), rLake = w(RIVER_WATERS, 'lake');
  const rFar = w(RIVER_WATERS, 'lake-far'), wLake = w(WOODS_WATERS, 'lake');
  // the Moor is +100 in x: one north shore across the border, and the Moor's east shore
  expect(lake.minZ).toBe(mLake.minZ);
  expect(lake.maxX).toBe(mLake.maxX + 100);
  expect(mLake.minX + 100).toBeLessThan(area.bounds.maxX);
  // the River is +100 in z: one west shore across the border, and the River's south shore (R3)
  expect(lake.minX).toBe(rLake.minX);
  expect(lake.maxZ).toBe(rLake.maxZ + 100);
  expect(rLake.minZ + 100).toBeLessThan(area.bounds.maxZ);
  // the bay round the island is the River's far lake; the corner is the Woods' (+100, +100)
  expect([bay.minX, bay.maxX, bay.minZ, bay.maxZ]).toEqual([rFar.minX, rFar.maxX, rFar.minZ + 100, rFar.maxZ + 100]);
  expect([lake.maxX, lake.maxZ]).toEqual([wLake.maxX + 100, wLake.maxZ + 100]);
  // the Moor's river, pouring into the lake just past the east edge
  for (const [mine, theirs] of [['moor-river', 'river-west'], ['moor-mouth', 'river-mouth']]) {
    const p = w(PINES_WATERS, mine), m = w(MOOR_WATERS, theirs);
    expect([p.minX, p.maxX, p.minZ, p.maxZ]).toEqual([m.minX + 100, m.maxX + 100, m.minZ, m.maxZ]);
    expect(p.minX).toBeGreaterThan(area.bounds.maxX);
  }
  // the River's north path comes in at the same x; no path crosses the Moor border
  const ends = (paths, pick) => paths.flatMap(([x1, z1, x2, z2]) => [[x1, z1], [x2, z2]]).filter(pick);
  expect(ends(PINES_PATHS, ([, z]) => z === 50).map(([x]) => x)).toEqual(ends(RIVER_PATHS, ([, z]) => z === -50).map(([x]) => x));
  expect(ends(PINES_PATHS, ([x]) => x === 50)).toEqual([]);
  expect(ends(MOOR_PATHS, ([x]) => x === -50)).toEqual([]);
});
```

  - `the island and the bridge are where the Woods, the River and the Moor show them`: `PINES_ISLAND` matches `{ x: RIVER_ISLAND.x, z: RIVER_ISLAND.z + 100, r: 9, rise: 1.4 }` and `[MOOR_ISLAND.x + 100, MOOR_ISLAND.z]`, and minus 100 in both is `[-72, -72]`; `BRIDGE_FOOT` equals `ISLAND_BRIDGE_WOODS[1]` + (100, 100); `islandBridge`'s `position` x/z are within 0.01 of the midpoint of the two ends + (100, 100), its `geometry.parameters.depth` within 0.01 of the ends' distance, and its `rotation.y` within 1e-6 of `Math.atan2(dx, dz)` for dx, dz from the shore end to the island end (the River's convention).
  - `the cat walks to the bridge foot and stops at the shore` (Review Focus 5): `reaches(area, BRIDGE_FOOT.x, 4.3)` is true; at 20 points along the plank from 0.05 to 1 of the way to the island, `isWalkableAt` is false; `lake` and `lake-bay` carry no decks; no collider or perch lies within `PINES_ISLAND.r + 2` of the island's centre; all 16 points on the island's rim are `inWater`.
  - `the truce path runs from the River to the bridge`: `TRUCE_PATH` is four segments, each starting where the last ended; the first starts at `(-26, 50)`; the last ends within 2.5 m of `BRIDGE_FOOT`; the spawn is within 1.6 m of its first segment.
  - `the horizon faces the Pines' neighbours`: one band; `PINES_HORIZON.sideTints` equals `{ north: 0x3f5a46, east: 0x9a8a9c, south: 0x7f9a66, west: 0x4a5a44 }`; `rooftops` undefined; `avoid` holds `LAKE`, `MIRE_NORTH`, `MIRE_WEST`, `MOOR_RIVER`.
  - `returns every key moor.js returns, named 'The Pines and Swamp'`; `is built the same every time`; `nothing in the Pines reads the edition`.
  - `test/water.test.js`: `WATERED.pines = buildWith(buildPines)`, and a block `nearestDry where the Pines' waters touch` with spots `[-32.6, -11.6]` (the deep swamp's bank at the mire's inside corner), `[-30, -8.5]` (in the corner's water), `[-26.4, -5.4]` (the bank at its outside corner), `[28, 6.5]` (the bay north of the lake), `[30.4, 7.6]` (the land pocket between the bay and the lake), `[25.6, 44.4]` (the pocket at the bay's south-east), `[-36.3, 16]` (bog-1's bank), each at margins 0.35, 0.5 and 0.6, with the Woods block's two expectations (clear by the margin, within 5 m).
  - `test/budget.test.js`: `['pines', buildPines, 450, 380, 60000]` and `['pines', buildPines, 260, 205]`; the comment gains the Pines' measured rows once Task 5 lands. Expect about 120–150 meshes, 90–120 casters and 35,000–50,000 triangles.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** the sky, ground, waters (`createWater` per record), the two decks (named `logBridge`, `steppingStones`), the paths, the island mound and tree, `islandBridge`, the truce stones, and the horizon band.
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `git add src/world/pines.js verify-places.html test/pines.test.js test/water.test.js test/budget.test.js`, then commit `feat(pines): the Pines' ground, water, crossings, paths, bridge foot and horizon`

### Task 4: The Pines: things to find, climb and race

**Files:**
- Modify: `src/world/pines.js` (POIs, scenics, collectibles, both chains, the fallen pine, the gold bushes, puddles, critters, the moment; `PINES_KEEP_CLEAR` built from these records and `BRIDGE_FOOT`, the truce stones and the frog hides)
- Modify: `src/goldmice.js` (`pines` entry after `moor`; the header counts the areas)
- Modify: `src/propsets.js` (`SETS.pines`: every list empty, `dogYard: null`, `keepSlots: []`, `hides` the three frog hides; a comment that the frog dives into the bog there and the rest of a Pines prop set is deferred)
- Test: `test/pines.test.js`; `test/goldmice.test.js` (`Object.keys(GOLD_MICE)` ends `'woods', 'river', 'moor', 'pines'`; `GOLD_TOTAL` 24); `test/docks.test.js` (`GOLD_TOTAL` 24, "since the Pines"); `test/climbing.test.js` (`AREAS.pines`; `['pines-find-5', 'pines']` in `ELEVATED`; `SHIPPED_HOPS` gains `'gm-pines-1': 2, 'gm-pines-2': 2, 'gm-pines-3': 0, 'pines-find-5': 1`; every ground-mice list gains `'gm-pines-3'`; the skilled hop tables gain `'gm-pines-1': 1, 'gm-pines-2': 1`); `test/spots.test.js`, `test/goalsarea.test.js` (`pines` in their area lists); `test/propsets.test.js`

**Interfaces:**
- Consumes: Task 3's `build`; Task 2's `'frog'`; `b.bush`, `b.puddle`, `b.fallenLog`; `GOLD_MICE.pines` (read into `PINES_KEEP_CLEAR`).
- Produces: `GOLD_MICE.pines`, `PINES_KEEP_CLEAR: Array<[x, z]>`, `FROG_HIDES: Array<{ x, z }>`, `propsFor('pines').hides`, and the content in the numbers table. Meshes named `lightningStump`, `lightningStumpRock`, `frogStone`, `frogStoneRock`, `fallenPine`; the two chain boulders share one material made per `build`. Birds come from `pinesTrees().near.slice(0, 4)` through a `pinesTrees` that returns `{ near: [], stand: [] }` until Task 5.

- [ ] **Step 1: Write the failing tests** (the Moor's "things to find" block, with the Pines' numbers):
  - `pines: nine POIs, all at least 2 m from water and clear of every collider by 1.6`.
  - `pines: five collectibles, three scenics, at least two vantage perches` (exact records).
  - `pines: the Lightning Stump chain is two hops and its top can't be reached from the ground`; the same for the Frog Stones (exact perch records and collider radii; `canReach` both ways; `reachesWithin` the first step).
  - `pines: the fallen pine is a perch and a seat`: the perch and its three colliders exactly.
  - `puts the climbing golden mice on the chain tops and hides the third among three bushes` (the bushes have no collider).
  - `every find, POI, scenic, golden mouse, frog hide and race ring is reachable on foot from the spawn` (the Moor's `targets()` with a `firstStep` for the two chains).
  - `the Lightning Stump's and the Frog Stones' golden mice are in sight from the chase camera`: for each, a cat 3 m from the pillar to the north, south, east and west, the camera 4.5 m further out at 2.2 m up (camzoom step 1); a ray from each camera to the mouse (y + 0.12) hits nothing in the pillar or its boulder. Where a side has water or a trunk within 7.5 m (the Frog Stones' east, toward the mire), assert from the sides that stand on dry land and say why in a comment.
  - `the tall pillars are as wide at the foot as their colliders`: `radiusBottom === 0.9` for both.
  - `goals: every goal drawn in the Pines can be finished there` (`pines` in `test/goalsarea.test.js`'s `AREAS`) and `the Pines never offers tipping, a box or head scratches` (over 400 seeds, `seen.size === GOAL_POOL.length - 3`).
  - `carries its critters, one moment and two puddles, and no villagers`: `critterSpawns.filter((c) => c.type !== 'bird')`, `moments`, `puddles` equal the numbers table exactly.
  - `the frog hides are the Pines' hides, each dry, reachable and 0.4 m off a bog`: `propsFor('pines').hides` equals `FROG_HIDES`; each `waterClearance` is within 0.01 of 0.4; each is reached; every other list is empty.
  - `race: a Pines course of five rings is drawn from its POIs` (`seedFromCode('2026-11-01-pines')`).
  - goldmice, climbing, spots and propsets additions as listed under Files.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `git add src/world/pines.js src/goldmice.js src/propsets.js test/pines.test.js test/goldmice.test.js test/docks.test.js test/climbing.test.js test/spots.test.js test/goalsarea.test.js test/propsets.test.js`, then commit `feat(pines): POIs, finds, golden mice, the two climbs and the frogs`

### Task 5: The Pines: the forest, ferns, toadstools, reeds and lily pads

**Files:**
- Modify: `src/world/pines.js`
- Test: `test/pines.test.js`, `test/climbing.test.js` (`GATED.pines`, `UNGATED.pines`), `test/minimap.test.js`, `test/budget.test.js` (measured comment)

**Interfaces:**
- Consumes: Task 1's `pineStand`, `toadstools`; `b.pine`, `b.fernBed`, `b.reedBed`, `b.lilyPads`; `PINES_KEEP_CLEAR`, the chain records (Task 4); `mulberry32`, `seedFromCode`.
- Produces (all rounded to 2 decimals, seeded by name; every candidate draws all its numbers whether kept or not):
  - `pinesTrees() -> { near, stand }`, each `Array<{ x, z, scale }>`. Seed `'pines-pines'`. Candidates on a 4.5 m grid from −48 to 48 in x and z (z outer, x inner), each drawing `dx`, `dz` (jitter ±1.5), `scale = 1.2 + 0.7 × rng()` and a keep roll, kept when the roll is under the zone's share (**0.35** in the deep swamp, x < −27 and z < −6; **0.25** in the outer swamp, x < −27 and z ≥ −6; **0.85** elsewhere) and it **fits**: inside `bounds`; ≥ 2.5 m from every water edge (decks ignored); ≥ 4 m from either deck rect; ≥ `1.5 + 1.3 × scale + 0.5` from every path centreline; ≥ 4 m from every `PINES_KEEP_CLEAR` point; ≥ 3 m from the fallen pine's segment; ≥ 6 m from the Lightning Stump and the Frog Stones; ≥ 3.2 m from every pine already kept. A kept pine is **near** when it is within `1.5 + 1.3 × scale + 0.5 + 4` m of a path centreline or 12 m of the spawn, while fewer than 40 are near; every other kept pine joins the **stand** (cap 150).
  - `pinesUndergrowth() -> { ferns, toadstools }`, seed `'pines-undergrowth'`, one rng for both, ferns first. A spot **fits** when it is inside `bounds`, out of water and ≥ 1.0 m from it (decks ignored), ≥ 3 m from either deck, ≥ 2.3 m from every path centreline, ≥ 3 m from every `PINES_KEEP_CLEAR` point, ≥ 4 m from the spawn, ≥ 2 m from the fallen pine's segment, and ≥ `0.9 × scale` from every pine. Ferns: a 4 m grid from −47.5, jitter ±1.5, kept when `rng() < 0.6`, not in the swamp (x < −27), cap 220. Toadstool clusters: a 7 m grid from −46.5, jitter ±2.5, kept when `rng() < 0.5`, anywhere, cap 60.
  - `pinesReeds() -> Array<{ x, z }>`: every 2 m, 0.5 m out round each bog; along both banks of mire-north (x −32.5 and −26.5, z −50..−6) and mire-west (z −11.5 and −5.5, x −50..−27); along the bay's west shore (x −0.5, z 5..44), north shore (z 4.5, x 0..30) and south shore (z 44.5, x 0..26) and the lake's north shore (z 7.5, x 30..50) and west shore below the bay (x 25.5, z 44..50); kept inside `bounds`, out of water (decks ignored), not within 1.5 m of a deck's rectangle, ≥ 2.3 m from every path centreline, ≥ 3 m from every `PINES_KEEP_CLEAR` point (so the bridge foot stays open).
  - `pinesLilyPads() -> Array<{ x, z, r }>`, seed `'pines-lilies'`: the River's ring rule on each bog.
  - In `build`: each near pine `b.pine(x, z, scale, { wind })`; one `b.pineStand(stand, seedFromCode('pines-stand'))` named `pineStand`; a collider `r2(0.4 × scale)` for **every** pine, near or stand, and **no** fork perch (a pine has no low fork); one `b.fernBed` named `ferns`; one `b.toadstools` named `toadstools`; one `b.reedBed` named `reeds`; one `b.lilyPads` named `lilyPads`.

- [ ] **Step 1: Write the failing tests**:
  - `pinesTrees is deterministic, dense, and keeps its clearances`: two calls deep-equal; near 30–40, stand 70–150 (if a floor fails, add candidates rather than loosen a clearance); every pine inside bounds, ≥ 2.5 m from water, `1.5 + 1.3 × scale + 0.5` from every path centreline, ≥ 4 m from both decks and every `PINES_KEEP_CLEAR` point; every near pine within its near distance of a path or the spawn.
  - `leaves the forest walkable: no two trunks closer than a cat can pass between` (the Woods test over both lists, radius `0.4 × scale`, gap `> 2 × 0.35`).
  - `pines stand on the River's border where the River's own pines stand`: at least 2 pines with x −6..24 and z ≥ 40 (the River's ruling R1, from the other side).
  - `plants a collider for every pine, a swaying pine for each near one, and the rest in one stand`: the collider count is `near + stand + 9` (the four chain colliders, the two truce stones, the three fallen-pine colliders); `scene.getObjectByName('pineStand')` holds exactly two meshes; no perch is a Sure Claws fork.
  - `the birds sit in the first four near pines`.
  - `pinesUndergrowth and pinesReeds are seeded, and a real forest floor and swamp edge`: deep-equal across calls; ferns 100–220, none with x < −27; toadstool clusters 30–60; reeds 100–220; lily pads 10–35, every pad in a bog.
  - `keeps every fern, toadstool and reed off the paths, the crossings, the spawn, the bridge foot and every find` (the clearances above, as assertions).
  - `the ferns, toadstools, reeds and lily pads are merged meshes out of the shadow pass, with no colliders`.
  - The Task 4 reachability test runs again with the scenery in, unchanged.
  - `test/climbing.test.js`: `GATED.pines` is `[]` (no pine has a fork); `UNGATED.pines` has length 5 (the four chain perches and the fallen pine).
  - `test/minimap.test.js`: `BUILDS.pines`; `buildMapLayer for the Pines has ground, edge, ten waters, two with decks, twelve paths, and no blocks`, with the comment that every Pines collider is under the map's 1 m block cut.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite**, both budget tables included, and write the measured built and merged numbers into `test/budget.test.js`'s comment tables. If anything binds, lower the stand's cap toward 100 or the fern cap toward 120 before touching a clearance; the counts the tests pin are the contract.
- [ ] **Step 5: Commit.** `git add src/world/pines.js test/pines.test.js test/climbing.test.js test/minimap.test.js test/budget.test.js`, then commit `feat(pines): the pine forest, ferns, toadstools, reeds and lily pads`

### Task 6: Register the Pines

**Files:**
- Modify: `src/progression.js`: `CATALOG.areas.pines = { name: 'The Pines and Swamp', price: 0, requires: { area: 'river', walks: 2 }, edition: 'canon' }` after the Moor; `pines: 0` in `defaultState().walks`, with the NaN comment naming `pines`.
- Modify: `src/game/walk.js` (`AREAS` gains `pines`), `src/marks.js` (`MARK_AREAS` gains `'pines'` before `'den'`; `emptyMarks` gains `pines: []`)
- Modify: `src/render/grass.js` (`pineFloorDensity` exported, `PINE_FLOOR`, `GRASS_STYLES.pines`), `src/render/clouds.js` (`CLOUD_AREAS` gains `pines`), `src/render/pawprints.js` (`AREA_RULES.pines`), `src/render/ambient.js` (`case 'pines': return dusk ? 'moths' : 'motes';`)
- Modify: `src/audio.js`: `frogLayer()`, an interval of 3200 ms that, when not muted and `Math.random() < 0.4`, plays two low croaks (`tone(180 + Math.random() * 60, 0.09, { type: 'square', gain: 0.016, slideTo: 140 })`, then the same at `delay: 0.13`); a `pines` branch: `windLayer({ gain: 0.035, cutoff: 220 })`, `frogLayer()`, and `rainLayer()` in rain. No birdsong at any hour; crickets at dusk from the shared line.
- No dressing-room code (as for the Moor: the card shows under "Other places" between Tasks 6 and 7; the picture comes in Task 9).
- Test: `test/progression.test.js` (every `walks` and `marks` deep-equal gains `pines`), `test/marks.test.js`, `test/grass.test.js`, `test/clouds.test.js`, `test/pawprints.test.js`, `test/ambient.test.js` (`VIEW.pines = [-26, 44]`), `test/audio.test.js`, `test/lobby.test.js`, `test/dressingroom.test.js`, `test/colonypanel.test.js`

**Interfaces:**
- Consumes: Tasks 3–5's `build`; `windLayer`'s options (P2).
- Produces: `pines` as a known area id everywhere above; `frogLayer`.

- [ ] **Step 1: Write the failing tests**:
  - `progression: the Pines is free, clan-only, and opens after 2 River walks`: the catalog record exactly; `canBuy('areas', 'pines')` false at 1 River walk, true at 2 with 0 points; `buy` leaves `points` unchanged.
  - `progression: in Legacy the Pines can be neither bought nor set, and state.area stays put`.
  - `progression: a fresh save counts Pines walks from 0`; `completeWalk('pines')` makes it 1; `an unlocked Pines survives a reload`; `a stored save with no pines keys loads with walks.pines 0 and marks.pines []`.
  - `marks: the Pines keeps marks like any area`.
  - `grass: the Pines grows a thin pine-floor grass`: `GRASS_STYLES.pines.density === pineFloorDensity`; over a 1 m grid on ±50 it stays within `[0, 0.7]`, is 0 somewhere and above 0.4 somewhere.
  - `clouds`, `pawprints` (`{ ground: null, path: 'wetSand', strip: null }`), `ambient` (`'motes'`, `'moths'` at dusk).
  - `audio: the Pines is a low wind and frogs, never birdsong, gulls or a horn`: with `ambienceProbe('pines')`, one buffer source (the wind), one interval, no timeouts; a gain node at 0.035; stubbing `Math.random` to 0 and running the interval once, every oscillator it starts has `frequency.value < 400` (frogs, where birdsong starts at 1500).
  - `audio: a rainy Pines adds the rain wash and keeps the frogs`: two buffer sources, one interval.
  - `lobby: a joiner who hasn't unlocked the Pines still accepts a Pines proposal as an override`.
  - `dressingroom: Legacy lists today's four places and never the Pines`.
  - `colonypanel: a Pines cat's place reads The Pines and Swamp in both editions`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.**
- [ ] **Step 5: Commit.** `git add src/progression.js src/game/walk.js src/marks.js src/render/grass.js src/render/clouds.js src/render/pawprints.js src/render/ambient.js src/audio.js test/progression.test.js test/marks.test.js test/grass.test.js test/clouds.test.js test/pawprints.test.js test/ambient.test.js test/audio.test.js test/lobby.test.js test/dressingroom.test.js test/colonypanel.test.js`, then commit `feat(pines): register the Pines and Swamp as a Clan Edition area`

### Task 7: Open the Pines on the territory map, and prove Legacy hides it

**Files:**
- Modify: `src/territories.js`: the `pines` entry becomes `{ id: 'pines', areaId: 'pines', name: 'The Pines and Swamp', x: 308, y: 199, r: 150, status: 'built' }`. `ISLAND` keeps `status: 'soon'`.
- Test: `test/territories.test.js` (the layout row for `pines`; the "coming soon" test rewritten below), `test/dressingroom.test.js`, `test/dressingroomcontroller.test.js`, `test/edition.test.js`, `test/walk.edition.test.js`

**Interfaces:**
- Consumes: `territoryMapModel`, `renderTerritoryMapHtml`, `opensAfterLine`, the shipped Legacy guards, `rivalForWalk`; `CATALOG.areas.pines` (Task 6).
- Produces: no new code beyond the `territories.js` entry.

- [ ] **Step 1: Write the failing tests**:

```js
// test/territories.test.js
it('the Pines is locked until 2 River walks, then "Tap to explore", then "tap to walk here" once opened', () => {
  const s = clanState();
  s.unlocked.areas.push('woods', 'river'); s.walks.river = 1;
  let pines = region(territoryMapModel(s, CATALOG), 'pines');
  expect(pines).toMatchObject({ name: 'The Pines and Swamp', areaId: 'pines', locked: true, canOpen: false, owned: false });
  expect(pines.line).toBe('opens after 2 walks in The River and Marshes · 1/2 so far');
  s.walks.river = 2;
  pines = region(territoryMapModel(s, CATALOG), 'pines');
  expect(pines).toMatchObject({ locked: false, canOpen: true, line: 'Tap to explore' });
  s.unlocked.areas.push('pines');
  expect(region(territoryMapModel(s, CATALOG), 'pines')).toMatchObject({ owned: true, line: 'tap to walk here' });
});

it("every clan territory of the first release is built; the Gorge and the island can't be tapped", () => {
  const m = territoryMapModel(clanState(), CATALOG);
  expect(m.regions.filter((r) => r.status === 'soon')).toEqual([]);
  expect(region(m, 'gorge')).toMatchObject({ status: 'later', line: 'unexplored', canOpen: false });
  expect(m.island).toMatchObject({ status: 'soon' });
  const html = renderTerritoryMapHtml(m);
  for (const id of ['gorge', 'island']) expect(regionHtml(html, id)).not.toContain('data-dr-place');
  // Twolegplace, the Woods, the River, the Moor and the Pines
  expect((html.match(/data-dr-place=/g) || []).length).toBe(5);
});

// test/edition.test.js
test('the shipped Legacy guards cover the Pines, and no patrol walks the truce', () => {
  expect(effectiveArea({ edition: 'legacy', area: 'pines' }, CATALOG)).toBe('neighborhood');
  expect(effectiveArea({ edition: 'canon', area: 'pines' }, CATALOG)).toBe('pines');
  expect(roomAreaMove({ edition: 'legacy', area: 'pines' }, CATALOG, 'park')).toBe('override');
  expect(rivalForWalk('pines', 'canon')).toBeNull();
  expect(rivalForWalk('pines', 'legacy')).toBeNull();
  expect(areaInEdition(CATALOG.areas.pines, 'legacy')).toBe(false);
});
```

  - `dressingroom: Clan's Other places are still the Park, the Seaside and the Docks` (passes only once the Pines' territory carries `areaId: 'pines'`).
  - `dressingroom: Legacy with the Pines chosen marks the Cozy Neighborhood card "today's walk"`.
  - `dressingroomcontroller: tapping the locked Pines buys nothing and keeps the area`; `tapping the opened Pines selects it` (a save at 1 and then 2 River walks).
  - `walk.edition: a Legacy kid whose place is the Pines walks the Neighborhood and keeps the Pines` (the Moor test of the same shape: two Neighborhood walks, buy the Woods, two Woods walks, buy the River, two River walks, buy the Pines, `setArea('pines')`, `setEdition('legacy')`; add `vi.mock('../src/world/pines.js', (orig) => stubBuild('pines', orig))` beside the file's other mocks).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.**
- [ ] **Step 5: Commit.** `git add src/territories.js test/territories.test.js test/dressingroom.test.js test/dressingroomcontroller.test.js test/edition.test.js test/walk.edition.test.js`, then commit `feat(pines): open the Pines and Swamp on the territory map`

### Task 8: Colony feeding in the Pines

**Not held:** the live `colony_feed` already accepts `'pines'`, and the repo SQL line already lists all six territory ids. This task deploys with the rest.

**Files:**
- Modify: `src/colony.js`: append `'pines'` to `COLONY_AREAS`. Tests assert membership, never the whole list.
- Modify: `test/legendary.test.js` line 17: `const NO_LEGENDARY_YET = ['woods', 'river', 'moor', 'pines']; // their legendary cats come with a later plan`.
- Modify: `test/colony.test.js`: every "the colony doesn't feed here yet" example that names `'pines'` (the Moor plan moved them there) now names `'island'`, which no map uses yet: the `feedsHere(...)` false assertions and `feedCat still refuses a territory the colony does not feed in yet`. Likewise the `'pines'` example in `test/editions.invariants.test.js` ("cats in territories this build cannot walk yet") becomes `'island'`.
- Test: `test/colony.test.js`, `test/editions.invariants.test.js`, `test/legendary.test.js`

**Interfaces:**
- Consumes: `feedsHere`, `feedCat`, `emptyColony`; the `boldName` and `ME` fixtures.

- [ ] **Step 1: Write the failing tests**:

```js
// test/colony.test.js
describe('the Pines feeds', () => {
  it('feedsHere is true in the Pines', () => {
    expect(feedsHere('pines')).toBe(true);
    expect(feedsHere('island')).toBe(false);
    expect(feedsHere('den')).toBe(false);
  });
  it('a Pines stray can be fed solo, and its spot is kept', () => {
    const r = feedCat(emptyColony(), { name: boldName, by: ME, walk: 'walk-1', area: 'pines', x: -18.5, z: 6, head: 0 });
    expect(r.result).toBe('ok');
    expect(r.colony.cats[0]).toMatchObject({ name: boldName, area: 'pines', x: -18.5, z: 6 });
  });
});

// test/editions.invariants.test.js
test('the caps are still unchanged with the Pines feeding', () => {
  expect([COLONY_MAX, SOLO_MAX]).toEqual([24, 12]);
});
```

  If `spotOf` rounds, assert the rounded values it returns.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement**, and update `test/legendary.test.js` line 17.
- [ ] **Step 4: Run the full suite.**
- [ ] **Step 5: Commit.** `git add src/colony.js test/colony.test.js test/editions.invariants.test.js test/legendary.test.js`, then commit `feat(pines): colony feeding in the Pines and Swamp`

### Task 9: Check it live, and write it down

**Files:**
- Create: `public/places/pines.jpg`
- Modify: `docs/VISUAL-PASS.md` (a short "The Pines and Swamp" entry: built and merged mesh, caster and triangle counts, near and stand pine counts, fern, toadstool, reed and lily counts, the in-game draw counts, what was and wasn't checked)

- [ ] **Step 1: Run the full suite and the build.** Expected: all pass.
- [ ] **Step 2: Check it live** with a temporary launch entry rooted at this worktree (the default `whisker-walk-dev` server serves the main checkout), driving the touch joystick and orbit with synthetic `TouchEvent`s as the Woods check learned to.
  - Home screen in Clan Edition, a save with 2 River walks: the Pines region is in colour and says "Tap to explore"; tapping it opens and selects it; the island still reads as coming soon. Screenshots at 1280 × 720 and the mobile preset (375 × 812). The Pines' tap area does not bleed into the River's or the Moor's (3 px sampling).
  - Flip to Legacy: four cards, no Pines; on a Pines-chosen save the Cozy Neighborhood card says "today's walk"; flip back and the Pines is selected again.
  - Start a Pines walk: the corner map shows the lake, the bay, the Black Mire, the bogs, both decks and the paths; the horizon shows dark pines to the north, the Moor's heather to the east, the River's green to the south; from the `island-bridge` scenic, the island, its tree and the bridge; past the east edge, the Moor's river pouring into the lake.
  - **Walk the truce path to the bridge foot and push on**: the cat stops dry at the shore between the truce stones, and the camera does not clip the plank.
  - **Cross the stepping stones on their visible edge** (x −42.7 and −41.3) and the log both ways.
  - **Walk every path with the chase camera**, looking both ways: the camera never sits inside a pine. Note any that come close.
  - Both pillar mice in sight from round their pillars.
  - A frog by bog-1 hops for the bog and vanishes with "The frog plopped into the bog! 🐸"; it counts in the journal as a Bog Frog.
  - Sound: a low hush and frogs by day, no birdsong.
  - **The forest reads as dark and dense** from the paths and from the deep swamp; note whether the still stand looks dead beside the swaying near pines (the deferred sway pass).
  - `?perf`: the Pines' draw count on the same tier as the Woods', the River's and the Neighborhood's; record all four.
  - `verify-places.html?area=pines` builds; take the 640 × 360 `pines.jpg` from `VIEWS.pines`, moving the camera along the truce path if a trunk fills the frame and writing the final view into `VIEWS.pines`.
  - No console errors. Reset the viewport to desktop afterwards.
- [ ] **Step 3: Write the VISUAL-PASS entry.**
- [ ] **Step 4: Commit.** `git add public/places/pines.jpg docs/VISUAL-PASS.md verify-places.html`, then commit `docs(pines): the Pines and Swamp's budget and live check`
