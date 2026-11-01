# Clan Edition: the Island and its Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The island in the lake as a small Clan Edition walk of its own: the meeting place where every clan's cats gather under a truce, with the one bridge walkable from the island to the Pines and Swamp's shore. It opens on the home-screen territory map after one Pines walk.

**Architecture:**
- **New world file.** `src/world/island.js` is a small map built the way `woods.js`, `river.js`, `moor.js` and `pines.js` are. Its frame is the Woods' frame moved so that the island's centre is the origin.
- **Water with an island in it.** The game's water footprints are solid rectangles and circles, so the engine gains two small features:
  - **islands:** dry discs cut out of a rect footprint, both in the logic and in the drawn mesh;
  - **strip decks:** an oriented deck, because the bridge runs diagonally.
- **Strays keep to the island.** A walk's strays and ghosts gain an optional roam disc, so they don't stand or wander in the lake.
- **One island everywhere.** The island and the bridge move into one shared module, `src/world/lake.js`. All four shores paint them from it: the Woods, the River, the Moor and the Pines.
- **Registration.** The island is registered in the tables the territories use. It flips from `'soon'` to `'built'` on the territory map, and it feeds the colony straight away (the live database already accepts `island`).

**Tech Stack:** Vanilla JS, Three.js 0.185, Vite 8, Vitest 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-editions-and-territories-design.md`. The relevant parts are Owner's answers 7 and 8, §3 ("Water", "Unlocking territories", builder notes "The island and the bridge"), §4 and §8 step 8. Templates:
- `docs/superpowers/plans/2026-10-31-clan-edition-woods.md` and `…-river.md` (both merged);
- `…-moor.md` (branch `moor`);
- `…-pines.md` (planned).

**This plan assumes the Moor and the Pines and Swamp have both merged first.**

## Global Constraints

- **Save.** `SAVE_VERSION` stays 4. The new save content is all additive and defaulted:
  - the `island` key in `walks` and `marks`;
  - the `'island'` unlock id.
  - No new journal type.
  - `island` is already in `TERRITORY_AREAS` (`src/colony.js`), so every build with the Woods foundation keeps an island colony cat.
- **The clan spec's §8 invariants hold:** no cat un-tames, no cat is dropped, a v4 save still loads, and `COLONY_MAX` (24) and `SOLO_MAX` (12) are unchanged.
- **Catalog.** The area id is `island`. The catalog record is `{ name: 'The island', price: 0, requires: { area: 'pines', walks: 1 }, edition: 'canon' }`, which is spec §3's table: "1 walk in the Pines and Swamp (its bridge is there)".
- **Nothing reads the edition.** An area builds the same in both editions:
  - `src/world/island.js` and `src/world/lake.js` never contain `/edition/i`, comments included;
  - nothing on the wire changes.
- **Legacy never reaches the island.** It is `edition: 'canon'`, so:
  - `effectiveArea` walks a Legacy kid in the Neighborhood;
  - Legacy's place cards never list it;
  - a Legacy joiner of an island co-walk walks it as an override and doesn't save it.
- **Truce: no rival patrol on the island.** `rivalForWalk('island', …)` stays `null`, and nothing on the island chases or costs anything (spec §3, "Water…").
- **Our own words only.**
  - Every borrowed *Warrior Cats* word stays in `src/clanwords.js`, and this plan adds none.
  - No island label uses a scanned word (`kit`, `apprentice`, `warrior`, `elder`, `queen`, `medicine cat`, `deputy`, `leader`, `loner`, `rogue`, `kittypet`, `Twolegplace`, `Clan`).
  - No island label uses a book place name either: "Gathering", "Fourtrees", "Great Rock", "Great Oak", "Highrock", "Highstones", "Moonstone", "Moonpool", "Sunningrocks", "tree-bridge" and the like.
- **Sea Legs is a shortcut, never a key.** Everything on the island is reached dry, over the bridge deck or the island's own ground.
- **Budget.**
  - The ceiling is the Cozy Neighborhood's: at most 450 meshes, 380 casters and 60,000 triangles as built, and 260 meshes and 205 casters merged.
  - The island is small, so it gets its own tighter cap: **at most 60 meshes, 45 casters and 30,000 triangles as built**, counted by `traverse` (`noCast` meshes count as meshes).
  - For comparison, the Woods measured 172 / 152 / 44,462 and the River 159 / 133 / 45,344.
- **Comments and docs** are plain and say why.
- **Commits** use an explicit `git add <files>`, and every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Commands.** Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`. Build: `npm run build`.

### Decisions this plan makes (defaults, flagged for the owner)

1. **How a kid gets there: the island is its own walk.**
   - The kid taps the island on the territory map. Its walk starts on the island, and the bridge can be walked all the way to the Pines' shore, where the cat stops between the truce stones.
   - **Why not walk over from inside a Pines walk?**
     - That needs a mid-walk area change: a new world, new strays, a new race, a new co-walk seed and a new corner map.
     - Spec §3 rejects that for now: "going through the home screen keeps all of it exactly as solid as today".
     - It also has to stay correct under the Legacy guards (an override per walk) and the corner map (built once per walk from `areaData`).
   - The spec already calls the island "a small map of its own" (decision 8 and §8 step 8). A "Cross to the island?" post at the Pines' bridge foot belongs to the border-crossing plan (§8 step 6), which goes through the home-screen map as the spec says.
2. **The diagonal bridge gets an oriented deck, not a rotated frame.**
   - Rotating the island map's frame would make the bridge axis-aligned. But the corner map draws an "N" badge and assumes −z is north (`src/ui/minimap.js`), so a rotated island would point that N 37° off true north.
   - So the frame stays the Woods' frame, translated, and decks gain one shape: a strip `{ x1, z1, x2, z2, halfW }`. That is three pure functions plus the corner map's deck painter.
3. **The island is a hole cut in the lake.**
   - Footprints are solid, so a rect footprint gains `islands: [{ x, z, r }]`: dry discs inside it. In the logic, a point is water only if it is inside the rect **and** outside every island. In the drawing, the water mesh is the same rect with round holes.
   - The ground plane shows through the holes, so the island is real ground. Grass, paw prints, puddles, race pads and contact shadows all work there, and shore foam rings it.
   - **Rejected: the island as a giant deck.** A deck means "raised boards". Carrying refuses to put things down on one (ruling R42), paw prints skip it, and every ground decal would sit under a raised island mesh.
4. **The island grows from r 9 to r 13.** Its centre and the bridge's Pines end stay where they are.
   - At r 9 it is 18 m across: too small for the meeting place, two climbs, five finds and eight POIs.
   - At r 13 it is 26 m across, which is closer to her drawing: the island is about a third of the lake's width.
   - Every neighbour repaints it from `lake.js` in Task 4, and the bridge shortens from 20 m to 16.6 m.
5. **The bridge is the same plank everywhere, low enough to walk on.**
   - It is 2 m wide, with its top at 0.12 m (the walking cat stays at y 0, as on every deck).
   - The neighbours' plank drops from y 0.3 to 0.06.
   - The Woods gains the plank too: on main it paints only the mound and the tree.
6. **What's on the island** (names are the owner's call; these are defaults):
   - **"the Old Ash"**: the big tree every shore already shows, at the island's centre. One climb: a mossy boulder, then a low limb.
   - **"the Meeting Ring"**: six flat sitting stones in a ring round the Old Ash. This is her ★ meeting place, where cats from every clan sit together.
   - **"the Watch Rock"**: a tall rock on the east shore, looking out over the lake. The second climb.
   - Five finds (one on the bridge's planks, one on a meeting stone) and three golden mice: the Old Ash's limb, the Watch Rock's top, and one hidden in bushes.
   - Ducks round the island, birds in the Old Ash, butterflies in the ring, a mouse in the grass.
   - **Strays live here and are friendly as anywhere.** They keep to the island, and the colony feeds here. There is no patrol and no legendary cat yet.
   - **Sound:** water lapping, a light wind, birdsong by day (the River's mix).
   - **Nothing special at night or the full moon** (YAGNI).
7. **The walk starts on the island's south side, facing north.** From there the kid sees the Meeting Ring, the Old Ash and the bridge running off to the Pines.
   - The bridge end would be the wrong spawn: the race pad (spawn + (2, −3)) and the kitten's 3 m circle round the spawn would both land in the water there.

### Dependencies on the Moor and the Pines, and what changes if the order flips

What this plan takes, assuming both have merged:

- **I1, from the Moor:** `ISLAND_BRIDGE_WOODS` (now in `src/world/moor.js`) and `MOOR_ISLAND`. Task 4 moves the bridge into `src/world/lake.js`; `moor.js` and `pines.js` import it from there.
- **I2, from the Pines:**
  - `PINES_WATERS`, `BRIDGE_FOOT` and `PINES_ISLAND`;
  - the truce stones' colliders at `(9.0, 3.6)` and `(12.2, 3.6)`;
  - `b.pineStand` (Pines Task 1), which the island uses for the painted Pines and River shores.
- **I3, test values written with both merged:**
  - `GOLD_TOTAL` goes 24 → **27**;
  - the territory map has **6** tappable places (adding the island);
  - `NO_LEGENDARY_YET` is `['woods', 'river', 'moor', 'pines', 'island']`;
  - the "a territory the colony doesn't feed yet" examples move from `'island'` to **`'gorge'`**;
  - whole-list assertions gain `island` after `pines`, before `'den'` wherever `'den'` closes a list.

If the island lands **before** the Pines:
- `island.js` paints its far shore with plain `b.pine` (no stand) and takes its lake numbers from the Pines plan's table as literals.
- The Pines then:
  - imports `ISLAND_BRIDGE_WOODS` and `ISLAND_WOODS` from `lake.js` instead of the Moor;
  - paints with `addIslandView(scene, 'pines', …)`;
  - writes its tests against `ISLAND_WOODS.r` (13), not 9;
  - keeps the island `'built'` in its territory test (6 places);
  - adds `'pines'` to `NO_LEGENDARY_YET` beside `'island'`;
  - uses `'gorge'` for its "doesn't feed here" examples;
  - and `GOLD_TOTAL` reads 24 → 27 in the island's commit and 27 in the Pines'.

If the island lands **before** the Moor:
- `lake.js` defines `ISLAND_BRIDGE_WOODS` itself (the same numbers as Task 4).
- The Moor imports it and paints with `addIslandView`.

`test/lake.test.js` simply skips a neighbour that isn't merged yet: it iterates over the world modules that exist, and the second lander adds its row.

### Lessons carried in, as rules

1. **Content before scenery.** `ISLAND_KEEP_CLEAR` is derived from the records (Task 6 before the reeds).
2. **Every goal is finishable.** The island has no tippables, boxes or villagers, so `createGoals` (three rng draws, unchanged) never offers those goals here. This is pinned over 400 seeds.
3. **Canopy clearance from a path** is `PATH_W / 2 + canopy reach + 0.5`.
   - The island has no paths. Its one walkway is the bridge deck, so:
     - the Old Ash (canopy reach `1.6 × 2.6 = 4.16`) keeps `1 + 4.16 + 0.5 = 5.66` m from the bridge centreline (it is 12.4 m away);
     - every painted shore pine keeps `1 + 1.3 × scale + 0.5` from it;
     - no shore pine stands within 8 m of the bridge foot, where the chase camera hangs over the Pines' shore.
4. **A deck is what the kids see, at least 1.5 m wide, proven by raycast.** The bridge deck is 1.8 m wide on a 2.0 m plank.
5. **A flood fill with the real `isWalkableAt` reaches every find** from the spawn. Without the bridge deck, only the bridge's find and POI drop out.
6. **Golden mice are in sight from the chase camera**, not just from a cat's eye.
7. **Budget by traversal**, with `noCast` meshes counted as meshes.
8. **`nearestDry` where waters overlap.** Here that means the bay over the lake on either side of the island, the island's rim and the bridge's sides: spots are added to `test/water.test.js`.
9. **Edges agree with every neighbour, asserted in tests.** The lake, the bay, the Moor's river mouth, the island, the bridge and the truce stones must all match (Tasks 4 and 5).

## Review Focus

1. **"opens after 1 walks".** Today's `opensAfterLine` always says "walks", and the island is the first place that needs only one. The territory map and the place card must read `opens after 1 walk in The Pines and Swamp · 0/1 so far`. Test in Task 8.
2. **A stray, ghost or legendary extra on the island.**
   - Today they spawn across 0.7 × the bounds and wander clamped to the bounds, which on this map is mostly lake.
   - They must spawn and stay on the island, every frame, including a shy cat's scurry and a cat recoiling when it turns cross.
   - Every other area's cats must stay byte-for-byte where they are today.
   - Tests in Task 3.
3. **A Legacy save whose place is the island, or a Legacy kid joining an island co-walk.**
   - Legacy walks the Neighborhood, `state.area` stays `'island'`, and the Cozy Neighborhood card says "today's walk".
   - The joiner walks the island as an override.
   - Tests in Task 8.
4. **A yarn ball, scent treat or race ring landing in the lake** beside the bridge, just off the rim, or where the bay meets the lake. `nearestDry` lands it on the island or on the deck, within 5 m. Tests in Tasks 1 and 5.
5. **A kid running off either end of the bridge.**
   - At the Pines end, the cat stops on the planks: the bounds hold it, and the Pines' shore is a different walk.
   - At the island end, the cat steps onto grass with no wet gap.
   - Off either side, the cat stops at the plank's edge.
   - Tests in Task 5.

## Owner steps

These are for the owner (the parent), not the implementer.

1. **Update both devices before either kid walks the island.**
   - After the deploy that carries this plan, on **both** devices, close every Whisker Walk tab (and the home-screen app) and reopen it.
   - Check that the home-screen map's island says "Tap to explore", "opens after 1 walk…" or "tap to walk here", not "coming soon".
   - An old build drops the island unlock, its walk count and its marks, and its lobby ignores an island walk proposal.
2. **No SQL this time.** The live `colony_feed` already accepts `'island'` (run 2026-10-31). To double-check: `select prosrc like '%''island''%' from pg_proc where proname = 'colony_feed';` → `true`.
3. **Check the island on the iPhone 18** after Task 10: an island walk on the HIGH tier holds 60 fps. Note its draw count beside the other territories'.
4. **Show her the island**, and ask the questions in this plan's report (the meeting place's name, what's on it, the special moment).

## What this plan defers

- **"Cross to the island?" at the Pines' bridge foot**, and "Back to the Pines?" at the island end. Both belong to the border-crossing plan (§8 step 6), through the home-screen map.
- **A gathering night:** at dusk or at a full moon, the kids' colony cats from every territory come to the Meeting Ring. This is the natural "special moment", but it needs colony cats shown outside their own area. It is a later plan if she wants it.
- **An island legendary cat** (`NO_LEGENDARY_YET`). Kittypet wanderers never come to the island: no Twolegplace path reaches it.
- **Rain puddles.** `walk.js` drops three rain puddles across half the bounds, so on the island one can fall in the lake, where it is under the water and harmless. They are left as they are.
- **Known horizon-only mismatches.**
  - The Woods' and the River's `lake` rects run on past the Pines' shore, beyond their bounds and in fog.
  - The neighbours paint the island as a 1.4 m dome, while the island walks flat.
  - Both are left alone.

## Files

| File | Responsibility |
|---|---|
| `src/world/builder.js` | `islands` on rect footprints (`waterGap`, `nearestDry`); strip decks (`onDeck`, `nearestDry`); `plankBridge` |
| `src/render/water.js` | `shoreDepth` and `createWater` for a rect with islands (a holed plane) |
| `src/ui/minimap.js` | Islands and strip decks on the corner map |
| `src/roam.js` (new) | `roamPoint`, `roamClamp`: where a walk's cats may stand |
| `src/straycats.js`, `src/ghosts.js` | Use `roam.js` for placement and every clamp |
| `src/world/lake.js` (new) | The frames, the island and the bridge, once; `islandBridgePlank`, `addIslandView` |
| `src/world/woods.js`, `river.js`, `moor.js`, `pines.js` | Paint the island and bridge with `addIslandView` |
| `src/world/island.js` (new) | The island map |
| `src/goldmice.js` | `island` entry |
| `src/progression.js`, `src/game/walk.js`, `src/marks.js` | Register the island |
| `src/render/{grass,clouds,pawprints,ambient}.js`, `src/audio.js` | Island entries |
| `src/territories.js`, `src/ui/territorymap.js`, `src/ui/dressingroom.js` | The island on the map; "1 walk"; the island kept out of "Other places" |
| `src/colony.js` | `COLONY_AREAS` gains `island` |
| `verify-places.html`, `public/places/island.jpg`, `docs/VISUAL-PASS.md` | Picture, view and the written check |

## The island in numbers

Coordinates are metres, with x east and z south (north is −z).

**Frames.** The island frame is the Woods' frame moved by (72, 72), so the island's centre is the origin. Each frame, as an offset from the Woods' frame (`FRAMES` in `lake.js`):

| Frame | Offset |
|---|---|
| Woods | (0, 0) |
| River | (100, 0) |
| Moor | (0, 100) |
| Pines | (100, 100) |
| Island | (72, 72) |

So a Pines point is the island point + (28, 28).

| Thing | Value |
|---|---|
| `ISLAND_WOODS` (lake.js) | `{ x: -72, z: -72, r: 13, rise: 1.4, treeScale: 2.6 }` |
| `ISLAND_BRIDGE_WOODS` (lake.js) | `[[-79.44, -81.92], [-89.4, -95.2]]`: the island end, 0.6 m onto the island along the line to the foot; then the Pines' shore end, 0.2 m onto the Pines' land (unchanged). Length 16.6, direction (−0.6, −0.8) from the island |
| `BRIDGE_PLANK` (lake.js) | `{ w: 2, thick: 0.12, y: 0.06 }` |
| `bounds` | `{ minX: -19, maxX: 14, minZ: -23, maxZ: 14 }`. `minZ` −23 is the bay's north shore, the Pines' shore line |
| `SPAWN` | `{ x: 2, z: 8.5 }` |
| `ISLAND_LAND` | `{ x: 0, z: 0, r: 13 }` (`ISLAND_WOODS` in the island frame) |
| `BRIDGE_DECK` | `{ x1: -7.44, z1: -9.92, x2: -17.4, z2: -23.2, halfW: 0.9 }`: `ISLAND_BRIDGE_WOODS` through `fromWoods('island', …)` (derived, not typed), 0.1 m inside the 2 m plank on each side |
| `LAKE` | `{ id: 'lake', kind: 'rect', minX: -2, maxX: 58, minZ: -20, maxZ: 38, islands: [ISLAND_LAND] }`: the Pines' `lake` − (28, 28) |
| `LAKE_BAY` | `{ id: 'lake-bay', kind: 'rect', minX: -28, maxX: 2, minZ: -23, maxZ: 16, islands: [ISLAND_LAND], decks: [BRIDGE_DECK] }`: the Pines' `lake-bay` − (28, 28) |
| `MOOR_RIVER`, `MOOR_MOUTH` | `{ id: 'moor-river', minX: 32, maxX: 95, minZ: -32, maxZ: -27 }`, `{ id: 'moor-mouth', minX: 32, maxX: 37, minZ: -32, maxZ: -18 }`, both `kind: 'rect'`: the Pines' records − (28, 28), out of bounds |
| `ISLAND_WATERS` | `[LAKE, LAKE_BAY, MOOR_RIVER, MOOR_MOUTH]` |
| Water draw | Colour `0x5f98a8`. Heights: lake 0.03, lake-bay 0.025, moor-river 0.035, moor-mouth 0.045. Shores: lake `['minZ', 'maxX', 'maxZ']`, lake-bay `['minX', 'minZ', 'maxZ']`, the rivers none. The island's rim is always a shore |
| Ground and sky | `b.ground(120, 0x6a9a50, { surface: 'grass' })`; `groundBounce: 0x6a9a50`; `b.applySky(scene, 0xa8d8c0, 0xd0ead8)`; `skyDusk: { top: 0x26344f, horizon: 0x5f5a72 }` |
| The Old Ash | `b.tree(0, 0, 2.6, { wind })`, named `oldAsh`, collider r 1.0. Its limb is a child in the tree's scaled frame (s = 2.6): `CylinderGeometry(0.07/s, 0.12/s, 1.6/s, 6)`, `rotation.x = π/2`, local `(0, 2.0/s, 1.4/s)`, so it reaches 0.6–2.2 m south of the trunk at y 2.0. Colour `0x7a5230`, `'bark'` |
| Old Ash chain | Mossy boulder `(0, 3.2)` y 0.72 `'stone'` (collider r 0.7, named `ashBoulder`) → limb perch `(0, 1.5)` y 2.1 `'tree'`, label `'old ash lookout'`, vantage |
| The Meeting Ring | Six stones at r 6, at 30° + 60°k from +x toward +z: `(5.2, 3)`, `(0, 6)`, `(-5.2, 3)`, `(-5.2, -3)`, `(0, -6)`, `(5.2, -3)`. Each is `CylinderGeometry(0.55, 0.65, 0.4, 9)` at y 0.2, colour `0x9a9488`, `'cobble'`, merged into one mesh `meetingRing`; collider r 0.6 and perch y 0.4 `'stone'` each. The bridge comes in through the gap between 210° and 270° |
| Watch Rock chain | Low rock `(9, 1)` y 0.72 `'stone'` (the Woods' mossy boulder shape, collider r 0.7, named `watchRockStep`) → `CylinderGeometry(0.75, 0.9, 1.9, 7)` at `(10, 0)`, colour `0x8e8c88`, `'cobble'`, named `watchRock`, collider r 0.9, perch y 1.9 `'stone'`, label `'watch rock'`, vantage |
| `pois` (8) | `(6.7, 6.7)`, `(-2.5, 10)`, `(-10, 0)`, `(-8.2, -4.7)`, `(0, -10)`, `(6.7, -6.7)`, `(-2.5, -3.8)`, `(-12.24, -16.32)`; the last is on the bridge, 8 m from the island end |
| `scenics` | `{ id: 'island-bridge', x: -6, z: -7.5, label: 'the bridge to the Pines' }`, `{ id: 'meeting-ring', x: 2.5, z: -2.5, label: 'the meeting ring under the old ash' }`, `{ id: 'lake-view', x: 7.5, z: 8, label: 'the lake, looking over to the Woods' }` |
| `collectibles` | `island-find-1 (-3.5, 7.5) 'a smooth white pebble'`; `island-find-2 (5, -9.5) 'a grey goose feather'`; `island-find-3 (-10.5, 3) 'a snail shell at the water's edge'`; `island-find-4 (-15.24, -20.32) 'a pine cone dropped on the planks'` (on the bridge, 13 m out); `island-find-5 (0, -6, y 0.4) 'a bright beetle wing on a meeting stone'` |
| Golden mice | `gm-island-1 (0, 1.8, y 2.1)` out on the Old Ash's limb; `gm-island-2 (10, 0, y 1.9)` top of the Watch Rock; `gm-island-3 (-6.5, 7.2, y 0)` hidden among bushes at `(-6, 5.5)`, `(-8, 7)`, `(-5.5, 8.5)` (no colliders) |
| `puddles` | `{ x: -8.5, z: -1.5, r: 0.8 }` |
| `roam` | `{ x: 0, z: 0, r: 10.5 }`: where strays and ghosts may stand, 2.5 m inside the rim |
| `critterSpawns` | Birds ×2 at `(0, 0)`; butterflies `(3, 4)`, `(-3, 4)`, `(2, -4)`; ducks `(8, -13)`, `(10, -11.5)`, `(11, -13)`; mouse `(-4, 9.5) → (-1, 11.5)`. No villagers |
| `moments` | `{ id: 'duck-ring', type: 'duck', label: 'ducks paddling round the island', x: 6, z: -9.5, from: { x: 10, z: -13 } }` |
| `boxes`, `tippables` | `[]` |
| `ISLAND_KEEP_CLEAR` | Every POI, scenic, collectible, golden mouse, chain perch, gold bush, meeting stone, the puddle and the spawn |
| Reeds | `islandReeds()`: one clump every 2.5 m round r 12.6, kept ≥ 3 m from every `ISLAND_KEEP_CLEAR` point, ≥ 2 m from the bridge deck's centreline segment and ≥ 2 m from the spawn. Expect 18–30 |
| Far shores | `shorePines() -> Array<{ x, z, scale }>`, seeded `'island-shore-pines'`. Candidates on a 6 m grid over −66..66 in x and z, each drawing `dx`, `dz` (±2) and `scale = 1.2 + 0.7 × rng()`. A candidate is kept when it is: outside `bounds` by ≥ 2 m; within 60 m of the origin; `waterClearance(ISLAND_WATERS)` ≥ 2.5; on the Pines' or the River's land (`z < -20` or `x < -28` or (`x < -2` and `z > 16`)); ≥ `1 + 1.3 × scale + 0.5` from the bridge deck's centreline segment; ≥ 8 m from the bridge foot `(-17.4, -23.2)`. Cap 60. Drawn as one `b.pineStand` named `shorePines` |
| Truce stones | `(-19, -24.4)` and `(-15.8, -24.4)` (the Pines' two, − (28, 28)): two standing stones 0.9 m tall, one merged mesh named `truceStones`. Out of bounds, so no collider |
| Horizon (`ISLAND_HORIZON`) | `kind: 'hills'`, inner 56, outer 116, height 7, wavelength 34, colour `0x5d8a55`, salt 53, `avoid: [LAKE, LAKE_BAY, MOOR_RIVER]`, `sideTints: { north: 0x3f5a46, east: 0x9a8a9c, south: 0x5d8a55, west: 0x7f9a66 }`: the Pines' dark pines, the Moor's heather, the Woods' green, the River's reeds |
| Grass | `GRASS_STYLES.island = MARSH` (the River's wet meadow) |
| Paw prints | `AREA_RULES.island = { ground: null, path: 'sand', strip: null }` (the Woods' rule; the island has no paths, so it lays no prints today) |
| Ambient life | `ambientKind('island')` is `'leaves'` (from the Old Ash) |
| Sound | The River's branch: `windLayer()`, `waterLapLayer()`, `rainLayer()` in rain, otherwise birdsong by day; crickets at dusk |

**Checked before writing, by hand from the numbers above:**
- Every POI is ≥ 2.2 m from every collider centre plus its radius (the closest is `(-2.5, -3.8)`, 2.82 from the stone at `(-5.2, -3)`), and ≥ 2.5 m inside the rim.
- Every gap between colliders is wider than a cat (2 × 0.35):
  - boulder to trunk, 1.5;
  - boulder to the south stone, 1.5;
  - Watch Rock to the waterline, 2.1.
- The Watch Rock's two colliders overlap, so they leave no crevice.
- The bridge deck lies wholly in `lake-bay` (every x < −2), so only the bay carries it.
- Its island end is 0.6 m onto the island, and its Pines end reaches z −23.2, past `bounds.minZ`.
- The dry pocket at x 2..14, z −23..−20 (the Pines' shore east of the bay) is inside the bounds but cut off by water. Nothing may be placed there (Task 5 asserts it is unreached).

---

### Task 1: Dry land in water: islands in a rect footprint, and strip decks

**Files:**
- Modify: `src/world/builder.js`:
  - the "WATER FOOTPRINTS" header block: two more lines describing `islands` and strip decks;
  - `waterGap`, `onDeck`, `pushOutOf` and `clampInto`.
- Modify: `src/ui/minimap.js` (`buildMapLayer` and the water painter).
- Test: `test/waterblock.test.js`, `test/water.test.js` (the shape checks in the generic block), `test/minimap.test.js`

**Interfaces:**
- **Produces, rect footprints:** an optional `islands: Array<{ x, z, r }>`, dry discs inside the rect.
  - `waterGap(w, x, z)` is `max(rectGap, max_i(r_i − hypot(x − x_i, z − z_i)))` for a rect with islands, which is negative only in the rect and outside every island.
  - `pushOutOf` adds one candidate per island: the point at `r_i − margin` from the island's centre, along (x, z) − centre (a point at the dead centre pushes +x). `nearestOf` picks the closest.
  - `islands` on a circle footprint is not supported. `waterGap` ignores it, and a comment says so.
- **Produces, decks:** a deck is either today's rect, or a strip `{ x1, z1, x2, z2, halfW }`, told apart by `Number.isFinite(d.x1)`.
  - `onDeck`: with u the unit vector from end 1 to end 2, `len` the length and n = (−u_z, u_x), the point is on the strip when `0 ≤ (p − a)·u ≤ len` and `|(p − a)·n| ≤ halfW`.
  - `clampInto` for a strip: clamp t to `[margin, len − margin]` (`len / 2` if `len ≤ 2 × margin`) and the side offset to `±(halfW − margin)` (0 if `halfW ≤ margin`); return `a + t u + s n`.
- **Produces, corner map:** `buildMapLayer` keeps `islands` on rect waters, and copies a strip deck as `{ kind: 'strip', x1, z1, x2, z2, halfW }` (a rect deck as today).
  - The painter fills each island with the layer's `ground` colour after all the water and before the decks.
  - It paints a strip deck as a rotated rectangle in the path tone.

- [ ] **Step 1: Write the failing tests** in `test/waterblock.test.js`. Each uses a small fixture, `W = { id: 'w', kind: 'rect', minX: -20, maxX: 20, minZ: -20, maxZ: 20, islands: [{ x: 0, z: 0, r: 5 }], decks: [{ x1: -3, z1: -4, x2: -12, z2: -16, halfW: 0.9 }] }`:
  - `an island in a rect is dry land, and the water round it is water`:
    - `inWater([W], 0, 0)` and `inWater([W], 4.9, 0)` are false;
    - `inWater([W], 5.1, 0)` is true;
    - `waterGap(W, 0, 6)` is within 1e-9 of −1;
    - `waterGap(W, 0, 4)` is within 1e-9 of 1.
  - `isWalkableAt holds a cat 0.35 inside the island's rim`: with `{ bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, colliders: [], waters: [W] }`, (4.6, 0) is walkable and (4.7, 0) is not.
  - `a strip deck is dry along its whole length and width, and nowhere past it`:
    - points at t ∈ {0, 0.5, 1} × the strip, with side offsets ±0.85, are on the deck and not in water;
    - a side offset of 0.95 is water;
    - 0.1 m past either end along u is water unless it is on the island.
  - `nearestDry lands a point beside the island on its rim, and a point beside the strip on the strip`:
    - `nearestDry([W], 0, 6, 0.6)` is within 1e-6 of (0, 4.4);
    - from the side of the strip's middle, 1.5 m out, the result is on the deck at ≤ 0.9 − 0.6 = 0.3 from its centreline and and within 1.2 m of the query point;
    - `nearestDry([W], 0, 0, 0.6)` is the point itself.
  - `onDeck still reads a rect deck exactly as before` (the Seaside pier rect, unchanged values).
- [ ] In `test/water.test.js`'s generic block:
  - `declares at least one well-formed water footprint` also accepts, on a rect, `islands` with finite `x`, `z` and `r > 0` each.
  - A deck may be a rect (as now) or a strip with finite ends, a length > 0 and `halfW > 0`.
- [ ] In `test/minimap.test.js`:
  - `buildMapLayer keeps a rect water's islands and a strip deck`.
  - `paints an island in the ground colour over its water` (the deck-painting test's canvas stub: a fill in the ground colour comes after the water fill and before the path-tone fill).
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run test/waterblock.test.js test/water.test.js test/minimap.test.js`. Expected: the island and strip assertions fail.
- [ ] **Step 3: Implement** the four builder functions and the corner map. Add a short comment on each new branch saying why:
  - an island is a hole of ground, not a deck (a deck is raised boards: ruling R42);
  - a strip is how a diagonal bridge stays one deck.
- [ ] **Step 4: Run the full suite** and confirm it passes. Every existing area builds the same: no world file uses either feature yet.
- [ ] **Step 5: Commit.** `git add src/world/builder.js src/ui/minimap.js test/waterblock.test.js test/water.test.js test/minimap.test.js`, then commit `feat(water): islands in a rect footprint, and strip decks for a diagonal bridge`

### Task 2: Draw a lake with an island in it

**Files:**
- Modify: `src/render/water.js` (`shoreDepth`, `createWater`)
- Test: `test/waterfx.test.js`, `test/water.test.js` (the "draws that footprint from the declaration" case)

**Interfaces:**
- Consumes: Task 1's `islands`.
- Produces:
  - **`shoreDepth`:** for a rect with islands, it is the minimum of today's value over `shores` and `hypot(x − x_i, z − z_i) − r_i` over every island. An island's rim is always a shore.
  - **`createWater`:** for a rect with islands, the geometry is a `THREE.ShapeGeometry`:
    - the rect, centred on the footprint's centre exactly as the `PlaneGeometry` is, with one hole per island (`absarc`, `segments` steps);
    - hole centres at local `(x_i − cx, −(z_i − cz))`, because local y becomes world −z under the mesh's flat rotation;
    - its `uv` attribute rewritten to the PlaneGeometry's mapping, `((x + w/2)/w, (y + h/2)/h)`, so the baked ramp and the normal map line up exactly as they do on a plain rect.
  - Everything else (tiers, material, update, dispose) is unchanged.

- [ ] **Step 1: Write the failing tests** in `test/waterfx.test.js`, with the Task 1 fixture `W` (decks dropped):
  - `shoreDepth is 0 on an island's rim and grows away from it`: 0 at (5, 0); 1 at (6, 0); with `shores: []`, the rect's own edges don't count.
  - `a rect with islands is drawn as a holed plane over the rect's exact box`:
    - the geometry type is `ShapeGeometry`, and `parameters.shapes.holes.length` is 1;
    - the bounding box is 40 × 40 within 1e-6;
    - `mesh.position` is (0, y, 0).
  - `the hole is where the island is`: a ray straight down at (0, 0) and at (4.5, 0) misses the mesh; at (5.5, 0) and at (15, 15) it hits.
  - `a holed plane's uv matches a plain plane's`: for a vertex at the rect's corners, `uv` is (0, 0) or (1, 1) as a `PlaneGeometry`'s is.
  - `the low tier draws the same holed geometry` (`quality: 'low'`).
- [ ] In `test/water.test.js`, extend `draws that footprint from the declaration`: a footprint with `islands` matches a `ShapeGeometry` mesh whose bounding box is the rect's size, centred on the rect, with `parameters.shapes.holes.length === w.islands.length`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Add a comment by the holed plane saying why it is the declaration verbatim, with the ground showing through, rather than a ground-coloured disc painted over the water.
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `git add src/render/water.js test/waterfx.test.js test/water.test.js`, then commit `feat(water): draw a rect of water with round islands cut out of it`

### Task 3: A walk's cats keep to where they can stand

**Files:**
- Create: `src/roam.js`
- Modify: `src/straycats.js`:
  - the cast's placement (line ~439);
  - the colony cat's clamp (~441);
  - the legendary extra (~506);
  - `turnHostile`'s recoil clamp (~614);
  - the Far Call target (~674);
  - the shy scurry (~729);
  - the wander target (~782).
- Modify: `src/ghosts.js` (placement ~95, wander target ~192)
- Test: `test/roam.test.js` (new), `test/straycats.test.js`, `test/ghosts.test.js`, `test/cowalkstreams.test.js` (must pass unchanged)

**Interfaces:**
- Produces, from `src/roam.js` (pure, no THREE):
  - **`roamPoint(area, u, v) -> { x, z }`** for `u, v` in [0, 1):
    - with `area.roam = { x, z, r }`, it returns `(x + r√u cos 2πv, z + r√u sin 2πv)`;
    - without one, `(lerp(minX × 0.7, maxX × 0.7, u), lerp(minZ × 0.7, maxZ × 0.7, v))`, exactly today's.
  - **`roamClamp(area, x, z, inset) -> { x, z }`**:
    - with `roam`, it pulls the point radially to `roam.r − inset` from the centre, only if it is further out;
    - without one, it is today's clamp to `[min + inset, max − inset]` on each axis.
- Callers keep their draw order and draw count. `roamPoint` takes the two draws they already make, so `strayStream`, the wander streams and the co-walk seeds never shift.

- [ ] **Step 1: Write the failing tests**:
  - `roam.test.js`:
    - `without a roam disc, roamPoint and roamClamp are today's numbers exactly`: for 50 (u, v) pairs and Woods-sized bounds, results `toEqual` the lerp and clamp formulas;
    - `with one, every point lands inside the disc, and a clamp only ever pulls inward`: 1000 pairs, all within `r`; a point inside the disc comes back unchanged.
  - `straycats.test.js`:
    - `strays on an area with a roam disc spawn and stay inside it`: an island-like area (bounds as in "The island in numbers", `roam` r 10.5), 3 strays, seeds 1..200 through `strayStream`. Every stray starts within 10.5. After 120 s of `update` at 1/30 s (the cat parked at the spawn, then at each roam edge), every stray is still within 10.5. Include a shy cat scurrying from a fast approach, a cross cat's recoil, and a Far Call.
    - `a colony cat stored off the island is pulled back onto it`.
    - `the legendary extra spawns inside the disc`.
    - `without a roam disc, the Woods' strays stand exactly where they did`: positions for seeds 1..20 equal a snapshot computed with the old lerp formula inline in the test.
  - `ghosts.test.js`: `ghosts on an area with a roam disc spawn and wander inside it`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** One comment at the top of `roam.js` says why: the island's bounds are mostly lake, and strays are bounds-only by design (`player.js`'s note), so the area tells them where land is instead.
- [ ] **Step 4: Run the full suite** and confirm it passes, `cowalkstreams` included.
- [ ] **Step 5: Commit.** `git add src/roam.js src/straycats.js src/ghosts.js test/roam.test.js test/straycats.test.js test/ghosts.test.js`, then commit `feat(strays): an area can keep its strays and ghosts to a roam disc`

### Task 4: One island, one bridge, seen the same from every shore

**Files:**
- Create: `src/world/lake.js`
- Modify: `src/world/builder.js`: `plankBridge(x1, z1, x2, z2, w, y, thick) -> THREE.Mesh`, a `BoxGeometry(w, thick, len)` centred between the ends at `y`, `rotation.y = atan2(x2 − x1, z2 − z1)`, colour `0x8a6a44`, the `'wood'` surface at the Seaside pier's tile scale.
- Modify: `src/world/woods.js`, `src/world/river.js`, `src/world/moor.js`, `src/world/pines.js`: each replaces its own mound, tree and plank code with `addIslandView(scene, '<id>', { wind })`.
  - `RIVER_ISLAND`, `MOOR_ISLAND` and `PINES_ISLAND` become `fromWoodsDisc('<id>')`, and `PINES`' `BRIDGE_FOOT` becomes `fromWoods('pines', …ISLAND_BRIDGE_WOODS[1])`.
  - `moor.js` no longer declares `ISLAND_BRIDGE_WOODS`; `pines.js` imports it from `./lake.js`.
- Test: `test/lake.test.js` (new), and the island tests in `test/woods.test.js`, `test/river.test.js`, `test/moor.test.js` and `test/pines.test.js`, wherever they hard-code r 9, the old rim end `(-77.4, -79.2)`, or y 0.3. Each of those is rewritten to read `ISLAND_WOODS` and `ISLAND_BRIDGE_WOODS`. `test/budget.test.js` (the Woods gains one mesh).

**Interfaces:**
- Produces, from `src/world/lake.js` (frozen):
  - `FRAMES` (the table in "The island in numbers");
  - `fromWoods(areaId, x, z) -> { x, z }`;
  - `fromWoodsDisc(areaId) -> { x, z, r, rise }`;
  - `ISLAND_WOODS`, `ISLAND_BRIDGE_WOODS`, `BRIDGE_PLANK`;
  - `islandBridgePlank(areaId) -> THREE.Mesh`: `plankBridge` from the Pines' shore end to the island end, in that area's frame, named `islandBridge` (the River's convention: `rotation.y` is `atan2(dx, dz)` from the shore end to the island end);
  - `addIslandView(scene, areaId, { wind }) -> void`: three top-level scene children:
    - the mound, a `SphereGeometry(r, 24, 8)` squashed to `rise`, colour `0x6a9a50`, `'grass'`;
    - `b.tree(x, z, treeScale, { wind })` raised to `rise − 0.2`;
    - `islandBridgePlank(areaId)`.

    Children, not a Group, so the shipped "something stands at the island's centre" and `getObjectByName('islandBridge')` tests read them as they do now.
- Consumes: Task 1 nothing; `b.tree`.

- [ ] **Step 1: Write the failing tests** in `test/lake.test.js`:

```js
const SHORES = { woods: buildWoods, river: buildRiver, moor: buildMoor, pines: buildPines };

it('the bridge runs from 0.6 m onto the island to 0.2 m onto the Pines shore', () => {
  const [[ix, iz], [fx, fz]] = ISLAND_BRIDGE_WOODS;
  const I = ISLAND_WOODS;
  expect(Math.hypot(ix - I.x, iz - I.z)).toBeCloseTo(I.r - 0.6, 6);
  const foot = fromWoods('pines', fx, fz); // the Pines' own foot, unchanged
  expect(foot.x).toBeCloseTo(BRIDGE_FOOT.x, 9);
  expect(foot.z).toBeCloseTo(BRIDGE_FOOT.z, 9);
  // the bridge points the same way on her map as in the world
  const [[bx0, by0], [bx1, by1]] = BRIDGE; // src/territories.js: shore -> island, board y is south
  const board = Math.atan2(bx1 - bx0, by1 - by0), world = Math.atan2(ix - fx, iz - fz);
  expect(Math.abs(board - world)).toBeLessThan(Math.PI / 180);
});

for (const [id, build] of Object.entries(SHORES)) {
  it(`${id} paints the one island and the one bridge`, () => {
    const scene = new THREE.Scene();
    build(scene);
    scene.updateMatrixWorld(true);
    const at = fromWoodsDisc(id);
    const tree = scene.children.find((o) => o.isGroup && Math.hypot(o.position.x - at.x, o.position.z - at.z) < 1e-6);
    expect(tree.scale.x).toBeCloseTo(ISLAND_WOODS.treeScale, 6);
    const plank = scene.getObjectByName('islandBridge');
    const [a, b] = ISLAND_BRIDGE_WOODS.map(([x, z]) => fromWoods(id, x, z));
    expect(plank.position.x).toBeCloseTo((a.x + b.x) / 2, 6);
    expect(plank.position.z).toBeCloseTo((a.z + b.z) / 2, 6);
    expect(plank.position.y).toBeCloseTo(BRIDGE_PLANK.y, 6);
    expect(plank.geometry.parameters.depth).toBeCloseTo(Math.hypot(a.x - b.x, a.z - b.z), 6);
    expect(plank.geometry.parameters.width).toBe(BRIDGE_PLANK.w);
    expect(plank.rotation.y).toBeCloseTo(Math.atan2(a.x - b.x, a.z - b.z), 6);
  });
}
```

  - `the island and the bridge are out of reach on every shore`: for each shore,
    - the island's centre is outside its `bounds`;
    - 16 rim points at r 13 are `inWater` of its waters;
    - no collider or perch is within `r + 2` of the centre;
    - the plank's world box doesn't touch the bounds, and no point along it is `isWalkableAt`.

    This also proves r 13 still fits every neighbour's lake.
  - `the neighbours' island records are derived, not typed`: `RIVER_ISLAND`, `MOOR_ISLAND` and `PINES_ISLAND` deep-equal `fromWoodsDisc` for their ids.
  - `nothing in lake.js reads the edition`.
- [ ] In each neighbour test file, replace the r 9, the old rim end and the y 0.3 literals with the `lake.js` values. Every other assertion in those tests stays as it is.
- [ ] In `test/budget.test.js`, the Woods' measured comment gains one mesh, and the caps are unchanged.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** `lake.js` and `plankBridge`, and rewire the four shores. Write a comment at the top of `lake.js` saying why the island and the bridge live there:
  - they are one place seen from five maps;
  - `test/lake.test.js` is the only thing that keeps the five in step.
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `git add src/world/lake.js src/world/builder.js src/world/woods.js src/world/river.js src/world/moor.js src/world/pines.js test/lake.test.js test/woods.test.js test/river.test.js test/moor.test.js test/pines.test.js test/budget.test.js`, then commit `feat(lake): one island and one bridge, painted the same from every shore`

### Task 5: The island map: ground, lake, bridge, far shores and horizon

**Files:**
- Create: `src/world/island.js`
- Modify: `verify-places.html`: `AREAS` gains `island`, and `VIEWS.island = '2,1.6,12,0,2,0'`, from the south shore looking north over the Meeting Ring to the Old Ash and the bridge.
- Test: `test/island.test.js` (new: copy `test/pines.test.js`'s canvas stub, `segDist`, `flood`, `reaches`, `reachesWithin`), `test/water.test.js`, `test/budget.test.js`

**Interfaces:**
- Consumes:
  - Tasks 1–4;
  - `b.ground`, `b.applySky`, `b.horizonBand` (with `sideTints`), `b.pineStand` (I2), `b.tree`;
  - `createWater`;
  - `islandBridgePlank`, `fromWoodsDisc`, `ISLAND_WOODS` from `./lake.js`;
  - tests only: `PINES_WATERS`, `BRIDGE_FOOT`, and the Pines area's colliders.
- Produces, from `src/world/island.js` (frozen, values from "The island in numbers"):
  - `SPAWN`, `ISLAND_LAND`, `BRIDGE_DECK`, `ISLAND_WATERS`, `ISLAND_HORIZON`, `shorePines()`;
  - `build(scene, { water = {}, wind } = {}) -> areaData`, named `'The island'`, with every key `pines.js` returns plus `roam`. The content keys Task 6 fills may be `[]` for now.

  The header comment covers, in `river.js`'s style:
  - what the island is: the meeting place her map stars;
  - where each side faces: north-west up the bridge to the Pines' shore and its truce stones; the Pines' dark pines to the north; the Moor's heather and its river mouth to the north-east; the Woods across the lake to the south-east; the River's reeds close by to the south-west;
  - that the island is a hole cut in the lake, so it is real ground;
  - that the bridge is the one walkway, and why it ends at the Pines' shore;
  - why `roam` exists.

  No word "edition" in any form.

- [ ] **Step 1: Write the failing tests** in `test/island.test.js`:
  - `declares the lake, the bay and the Moor's river, the island cut out of both lakes`:
    - ids in order;
    - `area.waters` equals `ISLAND_WATERS`;
    - `lake` and `lake-bay` each carry `islands: [ISLAND_LAND]`;
    - only `lake-bay` carries a deck, `BRIDGE_DECK`;
    - all frozen.
  - `the island's lake is the Pines' lake`: for each of `lake`, `lake-bay`, `moor-river` and `moor-mouth`, the box equals the Pines record of the same id minus (28, 28). `ISLAND_LAND` is `fromWoodsDisc('island')` without `rise`, and is (0, 0, 13).
  - `the truce stones stand where the Pines' do`: `truceStones` exists, and each of `(-19, -24.4)` and `(-15.8, -24.4)` + (28, 28) is a Pines collider centre within 1e-6.
  - `every water is drawn from its own footprint, at the scene root`, and `draws overlapping waters at different heights` (lake/lake-bay, moor-river/moor-mouth, moor-mouth/lake).
  - `the bridge deck is no wider than the plank the kids see`:
    - from 2 m above, rays at 9 points along the deck (t 0.05..0.95) × 5 side offsets in [−halfW, halfW] all hit `islandBridge`;
    - `2 × halfW` ≥ 1.8, and ≤ the plank's width − 0.2.
  - `the bridge joins the island with no wet gap, and stops the cat at the Pines' shore` (Review Focus 5):
    - stepping in 0.1 m steps along the bridge's centreline from `(-6.6, -8.8)` (on the island, r 11) to the foot, every point is `isWalkableAt` until z < −23 (the bounds), and the last walkable point is within 0.2 m of z −23;
    - a cat 1.2 m to the side of the deck's middle is not walkable, and `nearestDry` from there lands on the deck.
  - `everything on the island is reached from the spawn, and the bridge only over its deck`:
    - `reaches(area, …)` is true for the island's rim points at r 12 every 30°, for the deck's middle and for its Pines end at z −22.8;
    - with `decks: []`, the deck's middle is not reached, and the rim points still are;
    - the dry pocket `(8, -21.5)` is never reached, so nothing may be placed there.
  - `the horizon faces the island's neighbours`: one band; `ISLAND_HORIZON.sideTints` exactly; `avoid` holds `LAKE`, `LAKE_BAY` and `MOOR_RIVER`; no `rooftops`.
  - `the far shore's pines stand on the Pines' and the River's land, clear of the bridge`:
    - `shorePines()` is deterministic, with 20–60 pines;
    - every pine is out of bounds by ≥ 2, within 60 m, has `waterClearance` ≥ 2.5 and passes the land rule;
    - every pine is ≥ `1 + 1.3 × scale + 0.5` from the deck's centreline segment and ≥ 8 m from the foot;
    - `shorePines` holds exactly two meshes.
  - `returns every key pines.js returns plus roam, named 'The island'`; `is built the same every time`; `nothing on the island reads the edition`.
  - `test/water.test.js`: `WATERED.island = buildWith(buildIsland)`, and a block `nearestDry round the island and its bridge`. Its spots, each at margins 0.35, 0.5 and 0.6, carry the Woods block's two expectations (clear by the margin, within 5 m):
    - `[0, 13.3]` just off the south rim;
    - `[0, -13.3]` off the north rim, where the bay and the lake overlap;
    - `[-13.4, 0]` off the west rim, in the bay only;
    - `[-11.04, -17.22]` 1.5 m beside the bridge's middle (its centre `(-12.24, -16.32)` plus 1.5 × the side normal `(0.8, -0.6)`);
    - `[-6.84, -11.12]` 1.2 m beside the deck where it meets the rim;
    - `[-18, -21.5]` 1.5 m beside the deck, 1 m from its Pines end, with the Pines' shore 1.5 m north.
  - `test/budget.test.js`: `['island', buildIsland, 450, 380, 60000]` and `['island', buildIsland, 260, 205]`, plus `the island stays small: at most 60 meshes, 45 casters and 30,000 triangles as built` (the traversal helper). Expect about 15–25 meshes for this task.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement**:
  - sky, ground and waters (`createWater` per record, heights and shores from the numbers table);
  - the plank via `islandBridgePlank('island')`;
  - the Old Ash with no collider yet (Task 6 adds the chain);
  - `shorePines`, the truce stones and the horizon band;
  - `roam` in the returned record.
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `git add src/world/island.js verify-places.html test/island.test.js test/water.test.js test/budget.test.js`, then commit `feat(island): the island's ground, its lake, the bridge and the far shores`

### Task 6: The island: the Meeting Ring, the Old Ash, the Watch Rock, and things to find

**Files:**
- Modify: `src/world/island.js`:
  - POIs, scenics, collectibles, both chains, the Meeting Ring, the gold bushes, the puddle, critters and the moment;
  - `ISLAND_KEEP_CLEAR` built from these records;
  - `islandReeds()`.
- Modify: `src/goldmice.js` (`island` entry after `pines`; the header counts the areas)
- Test:
  - `test/island.test.js`;
  - `test/goldmice.test.js`: `Object.keys(GOLD_MICE)` ends `'pines', 'island'`; `GOLD_TOTAL` 27;
  - `test/docks.test.js` (`GOLD_TOTAL` 27);
  - `test/climbing.test.js`:
    - `AREAS.island`;
    - `['island-find-5', 'island']` in `ELEVATED`;
    - `SHIPPED_HOPS` gains `'gm-island-1': 2, 'gm-island-2': 2, 'gm-island-3': 0, 'island-find-5': 1`;
    - every ground-mice list gains `'gm-island-3'`;
    - the skilled hop tables gain `'gm-island-1': 1, 'gm-island-2': 1`;
    - `GATED.island` is `[]`, and `UNGATED.island` has length 10 (six stones and four chain perches);
  - `test/spots.test.js`, `test/goalsarea.test.js` (`island` in their area lists);
  - `test/minimap.test.js`: `BUILDS.island`; `buildMapLayer for the island has ground, edge, four waters, two with the island, one strip deck, no paths, and one block (the Old Ash)`.

**Interfaces:**
- Consumes: Task 5's `build`; `b.bush`, `b.puddle`, `b.reedBed`; `GOLD_MICE.island`.
- Produces:
  - `GOLD_MICE.island`, `ISLAND_KEEP_CLEAR: Array<[x, z]>`, `MEETING_STONES: Array<{ x, z }>`, `islandReeds() -> Array<{ x, z }>`, and the numbers table's content;
  - meshes named `oldAsh`, `ashBoulder`, `meetingRing`, `watchRock`, `watchRockStep` and `reeds`.

- [ ] **Step 1: Write the failing tests**:
  - `island: eight POIs, at least 2 m from water (the bridge one on its deck) and clear of every collider by 1.6`.
  - `island: five collectibles, three scenics, the Meeting Ring's six stones, and two vantage perches` (exact records).
  - `the Old Ash chain is two hops and its limb can't be reached from the grass`; the same for the Watch Rock. Use exact perch records and collider radii, `canReach` both ways, and `reachesWithin` the first step.
  - `the Old Ash's limb reaches out past the trunk`:
    - in world space, the limb's box spans z 0.6..2.2 south of the trunk at y 1.85..2.15;
    - the mouse at (0, 1.8) and the perch at (0, 1.5) are both further from the axis than the trunk's world radius at y 2.0 (0.35 → 0.25 over the 2 m trunk, × 2.6) plus 0.3.
  - `puts the climbing golden mice on the chain tops and hides the third among three bushes` (the bushes have no collider).
  - `every find, POI, scenic, golden mouse and race ring is reachable on foot from the spawn` (the Pines' `targets()`, with a `firstStep` for the two chains). The bridge's find and POI are reached only with the deck.
  - `the island's golden mice are in sight from the chase camera`. Use the Pines test's camera (a cat 3 m out, the camera 4.5 m further and 2.2 m up, a ray to the mouse at y + 0.12 that hits nothing before it):
    - for `gm-island-1`, from the south, east and west; from the north the trunk stands in the way, and the comment says so;
    - for `gm-island-2`, from the north, south and west; east of it is the lake within 3 m, and the comment says so.
  - `the Watch Rock is as wide at the foot as its collider` (`radiusBottom === 0.9`).
  - `goals: every goal drawn on the island can be finished there`, and `the island never offers tipping, a box or head scratches` (over 400 seeds, `seen.size === GOAL_POOL.length - 3`).
  - `carries its critters, one moment and one puddle, and no villagers` (exact).
  - `islandReeds is seeded and stands on the island's rim, clear of the bridge, the spawn and every find`: 18–30 clumps, each at r 12.4–12.8 and on dry ground, with the clearances above. One merged `noCast` mesh, `reeds`.
  - `race: an island course of five rings is drawn from its POIs` (`seedFromCode('2026-11-01-island')`).
  - `the island's labels are our own words`:

```js
const BOOK_PLACES = ['gathering', 'fourtrees', 'great rock', 'great oak', 'highrock', 'highstones',
  'moonstone', 'moonpool', 'sunningrocks', 'tree-bridge', 'treebridge', 'starclan'];
const labels = [...area.scenics, ...area.collectibles, ...area.perches, ...area.moments]
  .map((r) => r.label).filter(Boolean).concat(area.name);
for (const l of labels) for (const w of BOOK_PLACES) expect(l.toLowerCase()).not.toContain(w);
```

  - The goldmice, climbing, spots and minimap additions as listed under Files.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - The Meeting Ring's six stones are one merged mesh; it is 0.4 m tall, so the caster sweep lets it cast.
  - The two chain boulders share one material made per `build`.
  - Run the reeds after `ISLAND_KEEP_CLEAR`.
- [ ] **Step 4: Run the full suite.** Both budget tables and the island's own cap must pass. Write the measured built and merged numbers into `test/budget.test.js`'s comment tables.
- [ ] **Step 5: Commit.** `git add src/world/island.js src/goldmice.js test/island.test.js test/goldmice.test.js test/docks.test.js test/climbing.test.js test/spots.test.js test/goalsarea.test.js test/minimap.test.js test/budget.test.js`, then commit `feat(island): the Meeting Ring, the Old Ash, the Watch Rock and the island's finds`

### Task 7: Register the island

**Files:**
- Modify: `src/progression.js`:
  - `CATALOG.areas.island = { name: 'The island', price: 0, requires: { area: 'pines', walks: 1 }, edition: 'canon' }`, after the Pines;
  - `island: 0` in `defaultState().walks`, with the NaN comment naming `island`.
- Modify: `src/game/walk.js` (`AREAS` gains `island`), `src/marks.js` (`MARK_AREAS` gains `'island'` before `'den'`; `emptyMarks` gains `island: []`)
- Modify:
  - `src/render/grass.js` (`GRASS_STYLES.island = MARSH`);
  - `src/render/clouds.js` (`CLOUD_AREAS` gains `island`);
  - `src/render/pawprints.js` (`AREA_RULES.island`);
  - `src/render/ambient.js` (`case 'island': return 'leaves';`);
  - `src/audio.js`: the River's branch becomes `areaKey === 'river' || areaKey === 'island'`, with its comment naming both.
- Test:
  - `test/progression.test.js` (every `walks` and `marks` deep-equal gains `island`);
  - `test/marks.test.js`, `test/grass.test.js`, `test/clouds.test.js`, `test/pawprints.test.js`;
  - `test/ambient.test.js` (`VIEW.island = [2, 8.5]`);
  - `test/audio.test.js`, `test/lobby.test.js`, `test/dressingroom.test.js`, `test/colonypanel.test.js`.

**Interfaces:**
- Consumes: Tasks 5–6's `build`.
- Produces: `island` as a known area id everywhere above.

- [ ] **Step 1: Write the failing tests**:
  - `progression: the island is free, clan-only, and opens after 1 Pines walk`:
    - the catalog record exactly;
    - `canBuy('areas', 'island')` is false at 0 Pines walks and true at 1 with 0 points;
    - `buy` leaves `points` unchanged.
  - `progression: in Legacy the island can be neither bought nor set, and state.area stays put`.
  - `progression: a fresh save counts island walks from 0`:
    - `completeWalk('island')` makes it 1;
    - `an unlocked island survives a reload`;
    - `a stored save with no island keys loads with walks.island 0 and marks.island []`.
  - `marks: the island keeps marks like any area`.
  - `grass`, `clouds`, `pawprints`, `ambient` (`'leaves'`, by day and at dusk).
  - `audio: the island laps and sings like the River, never gulls or a horn`: `ambienceProbe('island')` produces the same layer counts as `ambienceProbe('river')`, by day and in rain.
  - `lobby: a joiner who hasn't unlocked the island still accepts an island proposal as an override`.
  - `dressingroom: Legacy lists today's four places and never the island`.
  - `colonypanel: an island cat's place reads The island in both editions`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.**
- [ ] **Step 5: Commit.** `git add src/progression.js src/game/walk.js src/marks.js src/render/grass.js src/render/clouds.js src/render/pawprints.js src/render/ambient.js src/audio.js test/progression.test.js test/marks.test.js test/grass.test.js test/clouds.test.js test/pawprints.test.js test/ambient.test.js test/audio.test.js test/lobby.test.js test/dressingroom.test.js test/colonypanel.test.js`, then commit `feat(island): register the island as a Clan Edition area`

### Task 8: Open the island on the territory map, and keep Legacy off it

**Files:**
- Modify: `src/territories.js`:
  - `ISLAND` becomes `{ id: 'island', areaId: 'island', name: 'The island', status: 'built', outline: … }` (outline unchanged);
  - the per-region state (owned, selected, locked, canOpen, line) moves into one function used for each `TERRITORIES` entry and for `ISLAND`, so the model returns `island: { ...ISLAND, owned, selected, locked, canOpen, line }`;
  - `opensAfterLine` says `walk` when `req.walks === 1`.
- Modify: `src/ui/territorymap.js`. When the island is built, its `<g>` gets:
  - `stateClasses`, `data-dr-place="island"` and a `<title>` of name · line;
  - an invisible `tm-hit` copy of the outline;
  - the line as a second small text at `(461, 352)`, under the island.

  Draw it last, after the built regions, so its small tap target is never under a neighbour's. When it isn't built, it renders exactly as today.
- Modify: `src/ui/dressingroom.js`: `otherPlaces` also leaves out `ISLAND.areaId`, so the island is on the map and never a card.
- Test: `test/territories.test.js`, `test/dressingroom.test.js`, `test/dressingroomcontroller.test.js`, `test/edition.test.js`, `test/walk.edition.test.js`

**Interfaces:**
- Consumes: `CATALOG.areas.island` (Task 7); the shipped Legacy guards; `rivalForWalk`.
- Produces: `territoryMapModel(...).island` with the region fields above; `ISLAND.areaId`.

- [ ] **Step 1: Write the failing tests**:

```js
// test/territories.test.js
it('the island is locked until 1 Pines walk, then "Tap to explore", then "tap to walk here"', () => {
  const s = clanState();
  s.unlocked.areas.push('woods', 'river', 'pines'); s.walks.pines = 0;
  let isl = territoryMapModel(s, CATALOG).island;
  expect(isl).toMatchObject({ name: 'The island', areaId: 'island', status: 'built', locked: true, canOpen: false, owned: false });
  expect(isl.line).toBe('opens after 1 walk in The Pines and Swamp · 0/1 so far');
  s.walks.pines = 1;
  expect(territoryMapModel(s, CATALOG).island).toMatchObject({ locked: false, canOpen: true, line: 'Tap to explore' });
  s.unlocked.areas.push('island');
  expect(territoryMapModel(s, CATALOG).island).toMatchObject({ owned: true, line: 'tap to walk here' });
});

it('every first-release place is on the map; only the Gorge is unexplored', () => {
  const m = territoryMapModel(clanState(), CATALOG);
  expect(m.regions.filter((r) => r.status === 'soon')).toEqual([]);
  expect(region(m, 'gorge')).toMatchObject({ status: 'later', line: 'unexplored', canOpen: false });
  const html = renderTerritoryMapHtml(m);
  expect(regionHtml(html, 'island')).toContain('data-dr-place="island"');
  expect(regionHtml(html, 'gorge')).not.toContain('data-dr-place');
  // Twolegplace, the Woods, the River, the Moor, the Pines and the island
  expect((html.match(/data-dr-place=/g) || []).length).toBe(6);
});

it('two walks still reads "walks"', () => {
  expect(opensAfterLine({ area: 'woods', walks: 2 }, 1, 'canon', CATALOG)).toBe('opens after 2 walks in The Woods · 1/2 so far');
});

// test/edition.test.js
test('the shipped Legacy guards cover the island, and the truce holds there', () => {
  expect(effectiveArea({ edition: 'legacy', area: 'island' }, CATALOG)).toBe('neighborhood');
  expect(effectiveArea({ edition: 'canon', area: 'island' }, CATALOG)).toBe('island');
  expect(roomAreaMove({ edition: 'legacy', area: 'island' }, CATALOG, 'park')).toBe('override');
  expect(roomAreaMove({ edition: 'legacy', area: 'park' }, CATALOG, 'island')).toBe('override');
  expect(rivalForWalk('island', 'canon')).toBeNull();
  expect(rivalForWalk('island', 'legacy')).toBeNull();
  expect(areaInEdition(CATALOG.areas.island, 'legacy')).toBe(false);
});
```

  - Rewrite the older `the map has the lake, the island…` test's `status: 'soon'` to `'built'`. Every other assertion in it stays.
  - `dressingroom: Clan's Other places are still the Park, the Seaside and the Docks` (the island never shows as a card).
  - `dressingroom: the island's locked place line says "1 walk"`.
  - `dressingroom: Legacy with the island chosen marks the Cozy Neighborhood card "today's walk"`.
  - `dressingroomcontroller: tapping the locked island buys nothing and keeps the area`, and `tapping the opened island selects it` (a save at 0 and then 1 Pines walk).
  - `walk.edition: a Legacy kid whose place is the island walks the Neighborhood and keeps the island`.
    - Use the Pines test's shape, extended: buy the Pines, one Pines walk, buy the island, `setArea('island')`, `setEdition('legacy')`.
    - Add `vi.mock('../src/world/island.js', (orig) => stubBuild('island', orig))` beside the file's other mocks.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.**
- [ ] **Step 5: Commit.** `git add src/territories.js src/ui/territorymap.js src/ui/dressingroom.js test/territories.test.js test/dressingroom.test.js test/dressingroomcontroller.test.js test/edition.test.js test/walk.edition.test.js`, then commit `feat(island): open the island on the territory map`

### Task 9: Colony feeding on the island

**Not held:** the live `colony_feed` already accepts `'island'`, and `test/colony.test.js` already pins the repo SQL line listing all six territory ids. This task deploys with the rest.

**Files:**
- Modify: `src/colony.js`: append `'island'` to `COLONY_AREAS`.
- Modify: `test/legendary.test.js` line 17: `const NO_LEGENDARY_YET = ['woods', 'river', 'moor', 'pines', 'island']; // their legendary cats come with a later plan`.
- Modify: `test/colony.test.js`. Every "the colony doesn't feed here yet" example naming `'island'` (the Pines plan moved them there) now names `'gorge'`, which no map uses yet:
  - the `feedsHere(...)` false assertions;
  - `feedCat still refuses a territory the colony does not feed in yet`.

  Likewise, the `'island'` example in `test/editions.invariants.test.js` ("cats in territories this build cannot walk yet") becomes `'gorge'`.
- Test: `test/colony.test.js`, `test/editions.invariants.test.js`, `test/legendary.test.js`

**Interfaces:**
- Consumes: `feedsHere`, `feedCat`, `emptyColony`; the `boldName` and `ME` fixtures.

- [ ] **Step 1: Write the failing tests**:

```js
// test/colony.test.js
describe('the island feeds', () => {
  it('feedsHere is true on the island', () => {
    expect(feedsHere('island')).toBe(true);
    expect(feedsHere('gorge')).toBe(false);
    expect(feedsHere('den')).toBe(false);
  });
  it('an island stray can be fed solo, and its spot is kept', () => {
    const r = feedCat(emptyColony(), { name: boldName, by: ME, walk: 'walk-1', area: 'island', x: -6.5, z: 4, head: 0 });
    expect(r.result).toBe('ok');
    expect(r.colony.cats[0]).toMatchObject({ name: boldName, area: 'island', x: -6.5, z: 4 });
  });
});

// test/editions.invariants.test.js
test('the caps are still unchanged with the island feeding', () => {
  expect([COLONY_MAX, SOLO_MAX]).toEqual([24, 12]);
});
```

  If `spotOf` rounds, assert the rounded values it returns.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement**, and update `test/legendary.test.js` line 17.
- [ ] **Step 4: Run the full suite.**
- [ ] **Step 5: Commit.** `git add src/colony.js test/colony.test.js test/editions.invariants.test.js test/legendary.test.js`, then commit `feat(island): colony feeding on the island`

### Task 10: Check it live, and write it down

**Files:**
- Create: `public/places/island.jpg`
- Modify: `docs/VISUAL-PASS.md`. Add a short "The island" entry with:
  - the built and merged mesh, caster and triangle counts;
  - the shore pine and reed counts;
  - the in-game draw counts;
  - what was and wasn't checked.

- [ ] **Step 1: Run the full suite and the build.** Expected: all pass.
- [ ] **Step 2: Check it live** with a temporary launch entry rooted at this worktree (the default `whisker-walk-dev` server serves the main checkout). Drive the touch joystick and orbit with synthetic `TouchEvent`s, as the Woods check learned to.
  - **Home screen.** In Clan Edition, on a save with 0 and then 1 Pines walk:
    - the island says "opens after 1 walk in The Pines and Swamp · 0/1 so far", then "Tap to explore";
    - tapping it opens and selects it;
    - no "Other places" card for it.

    Take screenshots at 1280 × 720 and at the mobile preset (375 × 812). The island's small tap target works on the phone, and doesn't steal taps from the Pines, the Moor, the Woods or the River (3 px sampling round its outline).
  - **Legacy.** Flip to Legacy: four cards, no island. On an island-chosen save, the Cozy Neighborhood card says "today's walk". Flip back, and the island is selected again.
  - **Start an island walk.**
    - The first view looks north over the Meeting Ring to the Old Ash, with the bridge running off to the Pines' dark shore.
    - The corner map shows the island as ground in the lake, the diagonal bridge in the path tone, and the N badge at the top.
    - Foam rings the island's shore.
    - The horizon shows dark pines to the north, heather to the north-east, the Woods' green across the lake and the River's reeds close to the south-west.
  - **Walk the bridge to its end and push on.** The cat stops on the planks between the truce stones, and the camera doesn't sit inside a shore pine. Walk back and step onto the island without a hitch. Push off each side of the bridge: the cat stops at the plank's edge.
  - **The race,** if today's course uses the bridge's ring: run it.
  - **Climb the Old Ash and the Watch Rock.** Both mice are in sight from round them.
  - **Strays.** Three strays stay on the island through a few minutes of wandering, a fast approach on a shy one, and a Far Call. Feed one; it joins the colony as an island cat.
  - **No rival patrol** appears at any time.
  - **Sound:** water lapping, wind, birdsong by day.
  - **`?perf`:** the island's draw count on the same tier as the other territories'. Record them all.
  - **The picture:** `verify-places.html?area=island` builds. Take the 640 × 360 `island.jpg` from `VIEWS.island`, moving the camera if the Old Ash's trunk fills the frame, and write the final view into `VIEWS.island`.
  - No console errors. Reset the viewport to desktop afterwards.
- [ ] **Step 3: Write the VISUAL-PASS entry.**
- [ ] **Step 4: Commit.** `git add public/places/island.jpg docs/VISUAL-PASS.md verify-places.html`, then commit `docs(island): the island's budget and live check`
