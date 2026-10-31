# Clan Edition: the River and Marshes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The River and Marshes as the second all-new Clan Edition territory: a reedbed-and-wet-meadow map on the Woods' west border, walkable by both kids, opened from the home-screen territory map after two Woods walks.

**Architecture:** A new outdoor area, `src/world/river.js`, built the way `src/world/woods.js` is (seeded scenery, water footprints with dry decks, `KEEP_CLEAR` built from the content records, a side-tinted horizon). It is registered in the same tables the Woods was, flipped from `'soon'` to `'built'` in `src/territories.js`, and fed by the colony only after the Woods' colony task has shipped. Three small builder pieces (willow, pine, lily pads) are added; everything else reuses what the Woods plan built.

**Tech Stack:** Vanilla JS, Three.js 0.185, Vite 8, Vitest 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-editions-and-territories-design.md` (Owner's answers 1–10, §3, §4, §8 step 4). Template and foundation: `docs/superpowers/plans/2026-10-31-clan-edition-woods.md` (Tasks 1–9 built on branch `woods`; Tasks 10–12 assumed landed as that plan describes).

**Why this territory is next.** §8's order is: 1 the Woods, 2 clans, 3 kittypets, 4 the River and Marshes, 5 the Moor. Steps 2 and 3 "need no new maps", so the River and Marshes is the next *territory*. It also shares the most with the Woods: the pond on the border, the river running between them, and the long Twolegplace path.

## Global Constraints

- `SAVE_VERSION` stays 4. New save content is the `river` key in `walks` and `marks` (additive, defaulted) and the `'river'` unlock id. `river` is already in `TERRITORY_AREAS` (`src/colony.js`), so the colony keeps River cats on any build that has the Woods foundation.
- The clan spec's §8 invariants hold: **no cat un-tames, no cat is dropped, a v4 save still loads, `COLONY_MAX` (24) and `SOLO_MAX` (12) are unchanged.**
- The area id is `river`; the catalog name is `The River and Marshes`. It is Clan-only: `{ name: 'The River and Marshes', price: 0, requires: { area: 'woods', walks: 2 }, edition: 'canon' }` (spec §3, "Unlocking territories").
- An area builds identically in both editions: `src/world/river.js` never reads the edition. Nothing on the wire changes.
- No rival patrol, legendary cat, prop set (carryables, knockables, rests, flaps), kittypet wanderer, or walkable island in the River in this plan.
- Sea Legs is a shortcut, never a key: everything a kid must reach north of the river is reachable dry over a deck.
- Budget: the Cozy Neighborhood's. At most 450 meshes, 380 casters and 60,000 triangles as built; 260 meshes and 205 casters merged (`test/budget.test.js`).
- Every borrowed *Warrior Cats* word stays in `src/clanwords.js`. This plan adds none; its labels are plain words ("the sun-warmed rocks", "the old willow").
- **Tasks 1–6 and 8 deploy as one unit.** Task 7 deploys after the Woods' Task 11 is live (owner step 2).
- Comments and docs are plain and say why. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npx vitest run --exclude '.claude/**'`. Build: `npm run build`.

### Lessons from building the Woods, applied from the start

These come from the Woods' ledger (`.superpowers/sdd/2026-10-31-clan-edition-woods/progress.md`). Each is a rule here, not a fix round later.

1. **Content before scenery.** The finds, perches and chains (Task 3) are laid out before any tree or reed (Task 4), and `KEEP_CLEAR` is built from those records, so a find can never move without its clearance moving with it.
2. **Dense where the place is dense.** The Woods' first 32 trees read as parkland and had to become 73 plus undergrowth. The River's density is its **reedbeds** (300–480 clumps) and its riverbank willows, not a forest; the test floors below pin it.
3. **A deck is what the kids can see.** Deck records are the visible walkable top: the log bridge's 1.8 m hewn flat, the stepping stones' covered strip. Both are proven by raycasts, as in `test/woods.test.js`.
4. **`nearestDry` at overlapping waters.** The River has three overlap zones (two right-angle river corners and the pond over the river). `builder.nearestDry` already handles them (the Woods' ring-search fallback); Task 2 adds the River's spots to `test/water.test.js`. No change to `nearestDry`.
5. **A golden mouse is never inside a trunk or a crown.** The willow's mouse sits out on a visible limb, clear of the trunk, below the crown, and a raycast proves it can be seen. The Old Willow is built **without** `wind`, so the limb and the mouse on it never part (the Woods' deferred "mouse doesn't sway with the limb").
6. **The corner map shows no small colliders.** `buildMapLayer` draws only colliders with `r >= 1`; every River collider is a trunk or a rock under 1 m, so the corner map shows water, decks and paths, and the test says `blocks` is `[]` on purpose.
7. **Small Woods minors not repeated:** the tall rock's base radius equals its collider (0.9); the two chain boulders share one material; the bank reeds also keep clear of every find; the grass-density sweep covers the River's own bounds (±50 m).

## Review Focus

1. **A save with the River unlocked, played in Legacy, or a Legacy kid joining a River co-walk.** Legacy walks the Neighborhood and `state.area` stays `'river'`; the joiner walks the River as an override. Tests in Task 6.
2. **A save or cloud payload from a device without the River** (no `river` keys, or a colony cat with `area: 'river'` before River feeding). It loads with every cat, `walks.river` 0, `marks.river` `[]`; the cat is kept and shown but cannot be fed. Tests in Tasks 5 and 7.
3. **The river cutting the map in two, in three reaches.** Every POI, ring, find, scenic and golden mouse north of the river is reachable dry over either deck alone, and none without a deck. Tests in Tasks 2–4.
4. **A scent treat or yarn ball landing at a river corner or where the pond overlaps the river.** `nearestDry` lands it dry within 5 m. Tests in Task 2.
5. **Tapping the River on the territory map before 2 Woods walks.** Nothing is bought, `state.area` doesn't change, and the line reads `opens after 2 walks in The Woods · 1/2 so far`; the Moor, the Pines, the Gorge and the island still can't be tapped. Tests in Task 6.

## Owner steps

These are for the owner (the parent), not the implementer.

1. **Update both devices before either kid walks the River.** After the deploy that carries Tasks 1–6 and 8, on **both** devices close every Whisker Walk tab (and the home-screen app), reopen it, and check that the home-screen map shows **The River and Marshes** in colour with an "opens after…" or "Tap to explore" line, not "coming soon". An old build drops the River unlock, its walk count and its marks, and its lobby ignores a River walk proposal.
2. **Before Task 7 is deployed, confirm the colony server accepts `river`.** The Woods plan's owner step 2 already put all six territory ids in `colony_feed`, so no new SQL is needed. In the Supabase SQL editor run:

   ```sql
   select prosrc like '%''river''%' from pg_proc where proname = 'colony_feed';
   ```

   Expected: `true`. If it says `false`, run the Woods plan's owner step 2 first. Also confirm the Woods' colony task (its Task 11) is deployed.
3. **Check the River on the iPhone 18** after Task 8: a River walk on the HIGH tier holds 60 fps. Note its draw count beside the Woods' and the Neighborhood's.
4. **Show her the River** and ask two things: whether the long path coming in at the south-east corner (to line up with the Woods) looks right to her, and whether "the sun-warmed rocks" and "the old willow" are good names (they are plain words, standing in for places in the books).

## What this plan defers (each gets its own plan)

- **The per-kid clan pick**, the allies rule and the **homage names** (decisions 2 and 3). Until then the River has **no rival patrol**.
- **Kittypets** and their **wanderers** into territories (decision 6).
- **The island and its bridge**, with the truce path. The River only *shows* them across the lake; the real bridge starts on the Pines' shore (§3).
- **Border crossings** (§8 step 6). With the River built, the Woods has two built neighbours (Twolegplace and the River), which is when §3 says they become worth doing.
- **The Moor, the Pines and Swamp**, and later the Gorge.
- In the River: prop sets, a legendary cat, and "Camp" wording.
- Woods minors carried, unchanged here: shore-foam seams where water footprints overlap (needs a per-edge option in `water.js`); trees on the corner map; the yarn ball's per-frame `nearestDry` in an overlap.

## Files

| File | Responsibility |
|---|---|
| `src/world/builder.js` | Gains `willow`, `pine`, `lilyPads` |
| `src/world/river.js` (new) | The River and Marshes map |
| `src/goldmice.js` | `river` entry; `GOLD_TOTAL` becomes 18 |
| `src/progression.js` | Catalog entry and `walks.river` |
| `src/game/walk.js` | `AREAS` gains `river` |
| `src/marks.js` | `MARK_AREAS` and `emptyMarks` gain `river` |
| `src/render/{grass,clouds,pawprints,ambient}.js`, `src/audio.js` | River entries |
| `src/territories.js` | The River flips to `'built'` |
| `src/colony.js` | `COLONY_AREAS` gains `river` (Task 7) |
| `verify-places.html`, `public/places/river.jpg`, `docs/VISUAL-PASS.md` | Picture, view and the written check |

## The River and Marshes in numbers

Coordinates are metres, x east, z south (north is −z, as the corner map draws it). Her board puts the Woods to the east (sharing the pond), the Pines and Swamp to the north (overlapping a little), the lake to the north-east, and the far west where the river comes in. Her river runs along the north third, jogs south, and runs east into the pond (`RIVER` in `src/territories.js`, board y 375–393 then 451–463), so the map's river has three reaches.

| Thing | Value |
|---|---|
| `bounds` | `{ minX: -50, maxX: 50, minZ: -50, maxZ: 50 }` |
| `SPAWN` | `{ x: 44, z: 40 }`, on the long path where it comes in from the Woods' side |
| Ground | `b.ground(120, 0x7d9c55, { surface: 'grass' })`; `groundBounce: 0x7d9c55` |
| Sky | `b.applySky(scene, 0xa9d4e0, 0xdde8dc)`; `skyDusk: { top: 0x283652, horizon: 0x6a6478 }` |
| `LAKE` | `{ id: 'lake', kind: 'rect', minX: 26, maxX: 120, minZ: -90, maxZ: -32 }` (the lake's south-west shore; past z −90 is the Pines' far shore) |
| `RIVER_WEST` | `{ id: 'river-west', kind: 'rect', minX: -120, maxX: 19, minZ: -34, maxZ: -29, decks: [LOG_BRIDGE] }` (in from the far west) |
| `RIVER_BEND` | `{ id: 'river-bend', kind: 'rect', minX: 14, maxX: 19, minZ: -34, maxZ: -9 }` (her jog south; no deck) |
| `RIVER_EAST` | `{ id: 'river-east', kind: 'rect', minX: 14, maxX: 120, minZ: -14, maxZ: -9, decks: [STEPPING_STONES] }` (on into the Woods, at the Woods' z −14..−9) |
| `POND` | `{ id: 'pond', kind: 'circle', x: 44, z: -6, r: 6 }` (6 m inside the east edge, as the Woods' is 6 m inside its west edge) |
| `POOLS` | `pool-1 (-30, 12) r 3.5`, `pool-2 (-12, 34) r 2.5`, `pool-3 (-40, 33) r 3`, each `kind: 'circle'` |
| `LOG_BRIDGE` | `{ minX: -22.9, maxX: -21.1, minZ: -35.5, maxZ: -27.5 }`; drawn `b.logBridge(-22, -35.5, -22, -27.5, 3.0, 0.16, 1.9)` |
| `STEPPING_STONES` | `{ minX: 27.5, maxX: 28.5, minZ: -15.5, maxZ: -7.5 }`; drawn `b.steppingStones(28, -15, 28, -8, 10, { rMin: 0.75, rMax: 0.85, jitter: 0.05, stagger: 0.03 })` |
| Water draw | colour `0x5f98a8` (the Woods' river: one water) for lake, river and pond; `0x6f8f80` for the pools. Heights: lake 0.03, river-west 0.035, river-bend 0.02, river-east 0.035, pond 0.045, pools 0.03. Shores: lake `['minX', 'maxZ', 'minZ']`, river-west `['minZ', 'maxZ', 'maxX']`, river-bend `['minX', 'maxX']`, river-east `['minZ', 'maxZ', 'minX']`, pond and pools all edges |
| `RIVER_PATHS` (3 m wide, `surface: 'sand'`, `color: 0x8a7556`) | long path `[50,40,28,40]`, `[28,40,4,30]`; bank path `[4,30,-10,10]`, `[-10,10,-22,-26]`; north path `[-22,-37,-26,-50]`; pond path `[28,40,34,8]`, `[34,8,28,-6]` |
| The wet meadow | open circle at `(2, 28)`, radius 9: no trees, no reeds |
| The west reedbed | the rectangle `x -50..-31, z -27..22` |
| Old Willow chain | mossy boulder `(-14, -24.5)` y 0.72 `'stone'` (collider r 0.7) → willow `(-12.4, -23.1)` scale 1.6 (collider r 0.8), branch perch y 2.1 `'tree'`, label `'old willow lookout'`, vantage; root collider `(-13.23, -23.83)` r 0.35 |
| Sun-warmed Rocks chain | warm rock `(34, -26)` y 0.72 `'stone'` (collider r 0.7) → pillar `(33, -27)` y 1.9 `'stone'` (collider r 0.9, `rTop 0.75, rBottom 0.9`), label `'sun-warmed rocks'`, vantage |
| Fallen log | `b.fallenLog(6, 20, 5, 1.2)`, perch `(6, 20)` y 0.5 `'tree'`, colliders r 0.4 at `(4.51, 19.42)`, `(6, 20)`, `(7.49, 20.58)` |
| `pois` (9) | `(2,28)`, `(-24,4)`, `(-16,-18)`, `(-30,-42)`, `(8,-42)`, `(22,-22)`, `(42,-22)`, `(36,24)`, `(-40,-12)` |
| `scenics` | `{ id: 'lake-island', x: 29, z: -29, label: 'the lake and the island' }`, `{ id: 'river-pond', x: 34, z: 0, label: 'the pond on the border' }`, `{ id: 'old-willow', x: -13.9, z: -21.9, label: 'under the old willow' }` |
| `collectibles` | `river-find-1 (-20, 14) 'a smooth pebble by the pool'`; `river-find-2 (24, -18) 'a kingfisher feather'`; `river-find-3 (-38, -40) 'a mussel shell from the riverbank'`; `river-find-4 (30, 30) 'a silver fish scale'`; `river-find-5 (34, -26, y 0.72) 'a sun-warmed pebble on the low rock'` |
| Golden mice | `gm-river-1 (-13.15, -23.1, y 2.1)` out on the Old Willow's limb; `gm-river-2 (33, -27, y 1.9)` top of the Sun-warmed Rocks; `gm-river-3 (-32, 40, y 0)` hidden among bushes at `(-30,38)`, `(-34,38)`, `(-32,43)` |
| `KEEP_CLEAR` | every POI, scenic, collectible, golden mouse, chain perch, gold bush, puddle and the spawn |
| Willows | `riverTrees().willows`: 14–24, scale 1.1–1.5, along the banks (Task 4) |
| Alders | `riverTrees().alders` (`b.tree`): 6–14, scale 0.9–1.3, in the drier south-east toward the Woods |
| Pines | `riverTrees().pines` (`b.pine`): 5–10, scale 1.1–1.6, on the north strip where the Pines and Swamp reach over the border |
| Reeds | `riverReeds()`: 300–480 clumps in one `b.reedBed` |
| Lily pads | `riverLilyPads()`: 15–40 pads on the pond's west half and the three pools, one `b.lilyPads` |
| Island on the horizon | mound (flattened sphere r 9, rise 1.4) and `b.tree(72, -56, 2.6)` at `(72, -56)`; the island bridge as one plank box from `(52, -90)` to `(64.5, -61)`, y 0.3, 2 m wide, named `islandBridge`. All outside `bounds`, no collider |
| Horizon | `kind: 'hills'`, inner 56, outer 116, height 4, wavelength 40, colour `0x7f9a66`, salt 37, `avoid: [LAKE, RIVER_WEST, RIVER_EAST]`, `sideTints: { north: 0x3f5a46, east: 0x4f7a48, south: 0x8a9a62, west: 0xa3a878 }`, no rooftops |
| `critterSpawns` | birds at the first four willows; ducks `(42,-4)`, `(40,-7)`, `(45,-2)` on the pond and `(-31,11)`, `(-29,13)` on pool-1; butterflies `(0,24)`, `(5,28)`, `(-1,31)`; mice `(-36,-2)→(-40,8)` and `(24,30)→(30,26)`. No squirrels, no villagers |
| `moments` | `{ id: 'duck-parade', type: 'duck', label: 'a duck leading her ducklings out of the pond', x: 36, z: 4, from: { x: 44, z: -6 } }`, `{ id: 'mouse-dash', type: 'mouse', label: 'a harvest mouse dashing through the reeds', x: -28, z: -6, from: { x: -44, z: 2 } }` |
| `puddles` | `{ x: 18, z: 34, r: 0.9 }`, `{ x: -4, z: 2, r: 0.8 }`, `{ x: 40, z: 12, r: 0.7 }` |
| `boxes`, `tippables` | `[]` |
| Grass | `GRASS_STYLES.river = MARSH`: `{ color: 0x86a457, hMin: 0.14, hMax: 0.36, width: 1.0, warm: 0.14, sway: 0.4, reach: 1.4, density: marshDensity }`; `marshDensity(x, z) = 0.9 * smooth01(0.3, 0.6, patchNoise(x, z, 4.4, 43))` |
| Paw prints | `AREA_RULES.river = { ground: null, path: 'wetSand', strip: null }`: the muddy paths take dark, crisp prints |
| Ambient life | `ambientKind('river')` is `'fluff'` (reed seed drifting), `'moths'` at dusk |
| Sound | wind, a quiet water lap, birdsong (rain wash in rain, crickets at dusk) |

All of this was checked with a standalone flood fill before writing: every POI, find, scenic and mouse is at least 2 m from water (`lake-island` and POI `(22,-22)` are the tightest, at 3.0), every path stays at least 2.5 m clear of open water, the north is unreachable without a deck and reachable with either one alone.

---

### Task 1: Builder pieces the River needs

**Files:**
- Modify: `src/world/builder.js` (after `brambleBed`)
- Test: `test/builder.test.js`

**Interfaces:**
- Produces (no colliders emitted by any of them):
  - `willow(x, z, scale = 1, { wind } = {}) -> THREE.Group` with three meshes: the trunk (same geometry and material as `tree`'s), a crown (`blobGeometry(x, z, 1.6, { lobes: 2, saltBase: 40 })` squashed to 0.75 in y, at local y 2.8, tint `organicTint(0x7fa04a, x, z, 10)`), and **one merged curtain**, named `willowCurtain`, of 18 thin hanging strands (`BoxGeometry(0.06, len, 0.06)`, colour `0x8aaa52`, `'foliage'`) hung from local radius 1.35–1.55 between local y 2.9 and a bottom never below local y 1.2. Placement by `hash01`, never `Math.random`. Tags `userData.canopy = { y: 2.8, r: 1.6 }` like `tree`, and registers with `wind` as `tree` does.
  - `pine(x, z, scale = 1, { wind } = {}) -> THREE.Group` with two meshes: a trunk (`CylinderGeometry(0.18, 0.26, 1.6, 6)` at local y 0.8, `'bark'`) and one merged foliage geometry of three cones, `ConeGeometry(1.3, 1.8, 7)` at y 2.0, `(1.0, 1.6, 7)` at y 2.9, `(0.65, 1.3, 7)` at y 3.7, colour `0x2f5a3a`, `'foliage'`. No `userData.canopy` (no leaves fall from a pine).
  - `lilyPads(pads: Array<{ x, z, r }>, seed, y = 0.06) -> THREE.Mesh`: each pad a flat `CircleGeometry(r, 10, notch, 2π − 0.5)` (a notch of 0.5 rad at a `hash01` angle), merged into one mesh, colour `0x4f8a3a`, `castShadow = false`, `userData.noCast = true`.

- [ ] **Step 1: Write the failing tests** in `test/builder.test.js`:
  - `willow is three meshes and its curtain never hangs below 1.2`: `g.children.filter((o) => o.isMesh)` has length 3; `g.getObjectByName('willowCurtain')`'s `geometry.boundingBox.min.y >= 1.2 - 1e-6`; `g.userData.canopy` equals `{ y: 2.8, r: 1.6 }`.
  - `willow is the same at the same spot`: two `willow(3, 4)` calls give equal position arrays for every child geometry.
  - `pine is two meshes, never taller than 4.4 at scale 1`: `new THREE.Box3().setFromObject(pine(0, 0)).max.y <= 4.4`; no `userData.canopy`.
  - `lilyPads is one flat mesh out of the shadow pass`: every vertex y within 1e-6 of 0.06; `castShadow === false`; `userData.noCast === true`; an empty list builds an empty geometry without throwing.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run test/builder.test.js`. Expected: `willow is not a function` and the like.
- [ ] **Step 3: Implement** the three functions, each with a short comment on what it is and why its shape (the curtain's floor is so a cat walks under a willow and sees in).
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `feat(builder): willow, pine and lily pads for the River and Marshes`

### Task 2: The River: ground, water, crossings, paths and horizon

**Files:**
- Create: `src/world/river.js`
- Modify: `verify-places.html` (`AREAS` gains `river`; `VIEWS.river = '-6,1.4,6,-20,0.4,-26'`, from the bank path looking up to the old willow and the log bridge)
- Test: `test/river.test.js` (new; copy `test/woods.test.js`'s canvas stub, `segDist`, `rectDist`, `flood`, `reaches` and `reachesWithin` helpers), `test/water.test.js` (`WATERED.river`, and a `nearestDry` block), `test/budget.test.js` (both tables)

**Interfaces:**
- Consumes: `logBridge`, `steppingStones`, `horizonBand` (with `sideTints`), `waterGap`, `inWater` from `src/world/builder.js`; `createWater` from `src/render/water.js`; `WOODS_WATERS`, `WOODS_PATHS` from `src/world/woods.js` (tests only).
- Produces, from `src/world/river.js`:
  - `SPAWN`, `RIVER_WATERS` (`[LAKE, RIVER_WEST, RIVER_BEND, RIVER_EAST, POND, POOL_1, POOL_2, POOL_3]`, ids `lake`, `river-west`, `river-bend`, `river-east`, `pond`, `pool-1`, `pool-2`, `pool-3`), `RIVER_PATHS`: frozen, with the values in "The River and Marshes in numbers".
  - `build(scene, { water = {}, wind } = {}) -> areaData`, `name: 'The River and Marshes'`, returning every key `park.js` returns. Content keys Task 3 fills may be `[]` for now.
  - The header comment, in woods.js's style: what the River is, where each edge faces (east the Woods and the shared pond, north the Pines and Swamp, north-east the lake, west the far west the river comes from, the long path at the south-east), and why the two decks exist.

- [ ] **Step 1: Write the failing tests** in `test/river.test.js`, adapting the Woods' water block:
  - `declares the lake, the three reaches of the river, the pond and three pools`: ids in order; `area.waters` equals `RIVER_WATERS`; all frozen.
  - `every water is drawn from its own footprint, at the scene root` (the Woods test, unchanged but for the list).
  - `draws overlapping waters at different heights`: the heights of river-west and river-bend differ, of river-bend and river-east differ, and of river-east and the pond differ.
  - `the three reaches meet, and the pond overlaps the river`: `RIVER_BEND.minZ === RIVER_WEST.minZ`, `RIVER_BEND.maxX === RIVER_WEST.maxX`, `RIVER_BEND.maxZ === RIVER_EAST.maxZ`, `RIVER_BEND.minX === RIVER_EAST.minX`; and every point from the pond's centre north into river-east is wet.
  - `the river can be crossed only at the two decks`, and either deck alone is enough. Targets: the `lake-island` scenic spot `(29, -29)`, the north strip `(-30, -42)` and the lakeshore `(22, -22)`.

```js
it('the river can be crossed only at the two decks', () => {
  const north = [[29, -29], [-30, -42], [22, -22]];
  for (const [x, z] of north) expect(reaches(area, x, z), `(${x}, ${z})`).toBe(true);
  const noDecks = { ...area, waters: RIVER_WATERS.map((w) => ({ ...w, decks: [] })) };
  for (const [x, z] of north) expect(reaches(noDecks, x, z), `(${x}, ${z}) without decks`).toBe(false);
  for (const keep of ['river-west', 'river-east']) {
    const one = { ...area, waters: RIVER_WATERS.map((w) => (w.id === keep ? w : { ...w, decks: [] })) };
    for (const [x, z] of north) expect(reaches(one, x, z), `only ${keep}'s deck: (${x}, ${z})`).toBe(true);
  }
});
```

  - `the log bridge's deck is no wider than the log the kids see above the water`, and `the stepping stones cover their whole deck, with no open water anywhere on it`: the two Woods raycast tests, pointed at `logBridge` over river-west (the deck runs along z) and `steppingStones` over river-east (the stones run along z, so sweep z across the river every 5 cm and x across the deck's width).
  - `the River's east edge matches the Woods' west edge`:

```js
it("the River's east edge matches the Woods' west edge", () => {
  const wPond = WOODS_WATERS.find((w) => w.id === 'pond');
  const rPond = RIVER_WATERS.find((w) => w.id === 'pond');
  // the shared pond: same size, same z, the same distance in from the shared edge
  expect([rPond.r, rPond.z]).toEqual([wPond.r, wPond.z]);
  expect(area.bounds.maxX - rPond.x).toBe(wPond.x - -50);
  // the river crosses the border at the same z
  const wRiver = WOODS_WATERS.find((w) => w.id === 'river-west');
  const rRiver = RIVER_WATERS.find((w) => w.id === 'river-east');
  expect([rRiver.minZ, rRiver.maxZ]).toEqual([wRiver.minZ, wRiver.maxZ]);
  expect(rRiver.maxX).toBeGreaterThan(area.bounds.maxX);
  // the long path leaves the Woods west and enters the River east at the same z
  const wEnd = WOODS_PATHS.flatMap(([x1, z1, x2, z2]) => [[x1, z1], [x2, z2]]).find(([x]) => x === -50);
  const rEnd = RIVER_PATHS.flatMap(([x1, z1, x2, z2]) => [[x1, z1], [x2, z2]]).find(([x]) => x === 50);
  expect(rEnd[1]).toBe(wEnd[1]);
});
```

  - `the island and its bridge are out on the lake and out of reach`: the island centre `(72, -56)` is outside `bounds` and inside `LAKE`; `islandBridge` exists and its world bounding box lies wholly outside `bounds`; its south end is within 1 m of the island's rim and its north end at `z <= LAKE.minZ`; no collider or perch within 20 m of the island centre.
  - `paints one horizon band`.
  - `returns every key park.js returns, named 'The River and Marshes'`; `is built the same every time` (JSON of the area record minus `waterFx`); `nothing in the River reads the edition` (the source has no `/edition/i`).
  - `test/water.test.js`: `WATERED.river = buildWith(buildRiver)`; and a block `nearestDry where the River's waters touch` with spots `[13.6, -28.6]` (bank at the south-west inside corner), `[15, -30]` (in that corner's water), `[19.4, -14.4]` (bank at the north-east inside corner), `[17, -12]` (in that corner's water), `[38.5, -8.6]` (bank where the pond meets the river), `[40, -9.5]` (the overlap) and `[44, -11]` (the pond's north rim inside the river), each at margins 0.35, 0.5 and 0.6, asserting the Woods block's two expectations (clear by the margin, within 5 m).
  - `test/budget.test.js`: `['river', buildRiver, 450, 380, 60000]` and `['river', buildRiver, 260, 205]`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** `src/world/river.js`: the sky, ground, waters (`createWater` per record, `shores` and heights from the numbers table), the two decks (named `logBridge` and `steppingStones`), the paths, the island mound and tree, `islandBridge`, and the horizon band.
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `feat(river): the River's ground, water, crossings, paths and horizon`

### Task 3: The River: things to find, climb and race

**Files:**
- Modify: `src/world/river.js` (POIs, scenics, collectibles, both chains, the fallen log, the gold bushes, puddles, critters, moments; and `KEEP_CLEAR`, built from these records and exported for Task 4's tests as `RIVER_KEEP_CLEAR`)
- Modify: `src/goldmice.js` (`river` entry after `woods`; header says six areas; `GOLD_TOTAL` is 18)
- Test: `test/river.test.js`; `test/goldmice.test.js` (18, keys gain `river`); `test/docks.test.js` line 315 (`GOLD_TOTAL` 18, "since the River"); `test/climbing.test.js` (`AREAS.river`; `['river-find-5', 'river']` in `ELEVATED`; `SHIPPED_HOPS` gains `'gm-river-1': 2, 'gm-river-2': 2, 'gm-river-3': 0, 'river-find-5': 1`; every "ground mice" list gains `'gm-river-3'`; the skilled hop tables gain River rows shaped like the Woods' `'gm-woods-1': 1, 'gm-woods-2': 1`; `UNGATED.river` has length 5); `test/spots.test.js` (`river` in `areas`)

**Interfaces:**
- Consumes: Task 2's `build`; `GOLD_MICE` (river.js reads `GOLD_MICE.river` into `KEEP_CLEAR`, as woods.js does).
- Produces: `GOLD_MICE.river` (`gm-river-1..3`), `RIVER_KEEP_CLEAR: Array<[x, z]>`, and the content in the numbers table. The Old Willow is `b.willow(-12.4, -23.1, 1.6)` **with no `wind`**, named `oldWillow`, carrying a limb child like the Great Oak's (`CylinderGeometry(0.07/s, 0.12/s, 0.75/s, 6)`, rotated to lie along x, at local `(-0.6/s, 1.9/s, 0)`). The two chain boulders share one material.

- [ ] **Step 1: Write the failing tests** (the Woods' "things to find" block, with the River's numbers):
  - `river: nine POIs, all at least 2 m from water and clear of every collider` (by 1.6, so `clearSpot` leaves each ring on its POI).
  - `river: five collectibles, three scenics, at least one vantage perch` (exact records).
  - `river: the Old Willow chain is two hops and the branch can't be reached from the ground`; `river: the Sun-warmed Rocks chain is two hops` (exact perch records, collider radii, `canReach` both ways, and `reachesWithin` the first step).
  - `puts the climbing golden mice on the chain tops and hides the third among three bushes`: the willow mouse is within 1.0 m of the branch perch and more than `0.45 + 0.12` from it (clear of the trunk); the rocks mouse matches the pillar perch's y; the three bushes exist with no collider.
  - `every find, POI, scenic, golden mouse and race ring is reachable on foot from the spawn` (the Woods' `targets()` with a `firstStep` for the two chains), and named spots north of the river `[[29, -29], [-30, -42], [24, -18]]` reached.
  - `the Old Willow's golden mouse is in sight from the ground`: the Woods' raycast test against `scene.getObjectByName('oldWillow')`, from the boulder `(-14, -24.5)` and the `old-willow` scenic `(-13.9, -21.9)` at eye height 0.9.
  - `the tall rock is as wide at its foot as its collider`: the pillar mesh's `geometry.parameters.radiusBottom === 0.9`.
  - `carries its critters, two moments and three puddles, and no villagers`: `critterSpawns.filter((c) => c.type !== 'bird')`, `moments` and `puddles` equal the lists in the numbers table exactly, and each puddle has its `CircleGeometry` at its spot. The birds sit in willows, which arrive in Task 4, so `critterSpawns` here maps `riverTrees().willows.slice(0, 4)` through a `riverTrees` that returns empty lists until then; Task 4 tests the birds.
  - `race: a River course of five rings is drawn from its POIs`: `raceCourse(area.pois, seedFromCode('2026-11-01-river'))` has 5 distinct POIs from the nine.
  - goldmice, climbing and spots additions as listed under Files.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `feat(river): POIs, finds, golden mice, perches and critters`

### Task 4: The River: willows, alders, pines, reeds and lily pads

**Files:**
- Modify: `src/world/river.js`
- Test: `test/river.test.js`, `test/climbing.test.js` (`GATED.river`), `test/minimap.test.js`

**Interfaces:**
- Consumes: Task 1's `willow`, `pine`, `lilyPads`; `b.tree`, `b.reedBed`; `sureClawsTreePerch`; `RIVER_KEEP_CLEAR` (Task 3); `mulberry32`, `seedFromCode`.
- Produces, from `src/world/river.js`:
  - `riverTrees() -> { willows, alders, pines }`, each `Array<{ x, z, scale }>`, rounded to 2 decimals, seeded by name (`'river-willows'`, `'river-alders'`, `'river-pines'`). Every candidate draws its three numbers (dx, dz, scale) whether kept or not, so moving one clearance never reshuffles the rest. A spot is kept only if it **fits**: at least 3 m from every water edge (decks ignored), 4 m from either deck rectangle, 3 m from every path centreline, 4 m from every `RIVER_KEEP_CLEAR` point and from the fallen log's segment, outside the wet meadow, inside `bounds`, and at least 4 m from every tree already kept (willows first, then alders, then pines).
    - **Willows** (cap 24, scale `1.1 + 0.4 × rng()`, jitter ±1.5 m): candidates every 8 m along lines 4 m out from each river bank (river-west's banks at z −38 and z −25 for x −48..12; river-bend's at x 10 and x 23 for z −30..−12; river-east's at z −18 and z −5 for x 22..36), every 60° on a ring 4 m out from each pool, and every 45° from 90° to 270° on a ring 4 m out from the pond (its River side).
    - **Alders** (`b.tree`; cap 14, scale `0.9 + 0.4 × rng()`, jitter ±3 m, kept when `rng() < 0.6`): a 10 m grid over `x −10..50, z 0..50`.
    - **Pines** (cap 10, scale `1.1 + 0.5 × rng()`, jitter ±2 m, kept when `rng() < 0.5`): a 6 m grid over `x −50..12, z −50..−38`.
  - `riverReeds() -> Array<{ x, z }>`, seeded `'river-reeds'`. A clump is kept only if it is inside `bounds`, out of every water (decks ignored), at least 2 m from either deck, 2.3 m from every path centreline, 3 m from every `RIVER_KEEP_CLEAR` point, 4 m from the spawn, outside the wet meadow and at least `0.8 × scale` from every trunk. Sources:
    - the west reedbed: a 1.8 m grid over its rectangle, jitter ±0.6 m, kept when `rng() < 0.8`, at least 0.5 m from water;
    - every 2 m along each river bank, 0.5 m out;
    - the lakeshore: every 2 m along z −31.5 for x 26..50 and along x 25.5 for z −50..−32;
    - every 1.5 m round each pool and round the pond's west half, 0.5 m out.
  - `riverLilyPads() -> Array<{ x, z, r }>`, seeded `'river-lilies'`: on each pool and the pond's west half (x < 44), every 1.2 m round a ring at 0.6 of the water's radius, each pad moved in or out by up to 0.15 of the radius, kept when `rng() < 0.6`, `r = 0.22 + 0.16 × rng()`.
  - In `build`: willows and alders with `{ wind }`, a collider `r2(0.5 × scale)` and a `sureClawsTreePerch` each; pines with `{ wind }` and a collider `r2(0.4 × scale)`, **no** fork perch (a pine has no low fork); one `b.reedBed(riverReeds(), seedFromCode('river-reeds'))` named `reeds`; one `b.lilyPads(riverLilyPads(), seedFromCode('river-lilies'))` named `lilyPads`.

- [ ] **Step 1: Write the failing tests**:
  - `riverTrees is deterministic, keeps its clearances and its counts`: two calls deep-equal; willows 14–24, alders 6–14, pines 5–10; each tree at least 3 m from water, 3 m from paths, 4 m from every deck rect, 4 m from the spawn, outside the meadow, inside bounds.
  - `leaves the marsh walkable: no two trunks closer than a cat can pass between` (the Woods test over all three lists, pine radius 0.4 × scale).
  - `plants each willow and alder with a collider and a Sure Claws fork, and each pine with a collider and no fork`.
  - `the birds sit in the first four willows`: `critterSpawns.filter((c) => c.type === 'bird')` equals `riverTrees().willows.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z }))`.
  - `riverReeds is seeded, and a real reedbed`: two calls deep-equal; 300–480 clumps; at least 150 of them inside the west reedbed's rectangle.
  - `keeps every reed off the paths, the crossings, the spawn, the meadow and every find`: path ≥ 2.3, deck ≥ 2, spawn ≥ 4, meadow ≥ 9, every `RIVER_KEEP_CLEAR` point ≥ 3, and none in the water.
  - `the reeds and the lily pads are single merged meshes out of the shadow pass, with no colliders`.
  - `every lily pad floats on the pond's west half or a pool`: each pad is in water (`inWater` over the pond and pools) and, on the pond, `x < 44`.
  - `no tree or reed stands on anything a kid looks for` (the Woods test: every target and every chain rock vs trees ≥ 4 m and reeds ≥ 3 m).
  - The reachability test from Task 3 runs again with the trees in, unchanged.
  - `test/climbing.test.js`: `GATED.river.length` is at least 20 and every one is `'tree'` (willows plus alders).
  - `test/minimap.test.js`: `BUILDS.river`; `buildMapLayer for the River has ground, edge, eight waters, two with decks, and paths, and no blocks`, with the comment that every River collider is a trunk or a rock under 1 m, below the map's block cut.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite**, including both budget tables. If the triangle ceiling is near, lower the reed cap toward 300 before touching trees; the counts the tests pin are the contract.
- [ ] **Step 5: Commit.** `feat(river): willows, alders, pines, reedbeds and lily pads`

### Task 5: Register the River

**Files:**
- Modify: `src/progression.js`
  - `CATALOG.areas.river = { name: 'The River and Marshes', price: 0, requires: { area: 'woods', walks: 2 }, edition: 'canon' }`, after `woods`.
  - `river: 0` in `defaultState().walks`, with the NaN comment extended to name `river`.
- Modify: `src/game/walk.js` (`AREAS` gains `river`)
- Modify: `src/marks.js` (`MARK_AREAS` becomes `['neighborhood', 'park', 'seaside', 'docks', 'woods', 'river', 'den']`; `emptyMarks` gains `river: []`)
- Modify: `src/render/grass.js` (`marshDensity` exported, `MARSH`, `GRASS_STYLES.river = MARSH`), `src/render/clouds.js` (`CLOUD_AREAS` gains `river`), `src/render/pawprints.js` (`AREA_RULES.river`), `src/render/ambient.js` (`case 'river': return dusk ? 'moths' : 'fluff';`)
- Modify: `src/audio.js` `startAmbient`: a `river` branch with `windLayer()`, `waterLapLayer()`, then `rainLayer()` in rain or else `birdsongLayer()` unless dusk. Crickets at dusk come from the shared line below it.
- The dressing-room card needs no code: `buildDressingModel` already lists only `areaInEdition` entries (Legacy never sees the River) and puts territories on the map, not under "Other places". The picture `public/places/river.jpg` comes in Task 8; until then the card's `onerror` drops the image.
- Test: `test/progression.test.js` (every `walks` deep-equal gains `river: 0` and every `marks` deep-equal gains `river: []`, including the v20 load test at lines 2039–2041 and the `EMPTY` marks at 2746), `test/marks.test.js`, `test/grass.test.js`, `test/clouds.test.js`, `test/pawprints.test.js`, `test/ambient.test.js` (`river` in its builds and `VIEW.river = [-24, 4]`), `test/audio.test.js`, `test/lobby.test.js` (`knownAreas` gains `river`), `test/dressingroom.test.js`

**Interfaces:**
- Consumes: Tasks 2–4's `build`.
- Produces: `river` as a known area id everywhere above.

- [ ] **Step 1: Write the failing tests**:
  - `progression: the River is free, clan-only, and opens after 2 Woods walks`: the catalog record exactly; `canBuy('areas','river')` false at 1 Woods walk and true at 2 with 0 points; `buy` unlocks it without changing `points`.
  - `progression: in Legacy the River can be neither bought nor set, and state.area stays put` (the Woods test of the same name, with `river`).
  - `progression: a fresh save counts River walks from 0`, and `completeWalk('river')` makes it 1; `an unlocked River survives a reload`.
  - `progression: a stored save with no river keys loads with walks.river 0 and marks.river []`.
  - `marks: the River keeps marks like any area`.
  - `grass: the River grows marsh grass`: `GRASS_STYLES.river.density === marshDensity`; over a 1 m grid on x, z in −50..50 it stays within `[0, 0.9]`, is 0 somewhere and above 0.5 somewhere.
  - `clouds`: `CLOUD_AREAS` contains `river`. `pawprints`: `AREA_RULES.river` equals `{ ground: null, path: 'wetSand', strip: null }`. `ambient`: `ambientKind('river')` is `'fluff'` and `'moths'` at dusk.
  - `audio: river ambience is wind, a water lap and birdsong, never gulls`, and `a rainy river swaps the birdsong for the rain wash`, in the docks tests' style.
  - `lobby: a joiner who hasn't unlocked the River still accepts a River proposal as an override`.
  - `dressingroom: Legacy lists today's four places and never the River`; `Clan's Other places are still the Park, the Seaside and the Docks`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.**
- [ ] **Step 5: Commit.** `feat(river): register the River and Marshes as a Clan Edition area`

### Task 6: Open the River on the territory map, and keep Legacy quiet there

**Files:**
- Modify: `src/territories.js`: the `river` entry becomes `{ id: 'river', areaId: 'river', name: 'The River and Marshes', x: 232, y: 488, r: 160, status: 'built' }`; the comment "both built places cost 0 paws" becomes "every built territory costs 0 paws".
- Test: `test/territories.test.js` (the layout expectation's `river` row becomes `{ id: 'river', areaId: 'river', x: 232, y: 488, r: 160, status: 'built' }`; in "coming soon and unexplored regions can't be tapped" the model loop becomes `['moor', 'pines']`, the HTML loop `['moor', 'pines', 'gorge', 'island']`, and the `data-dr-place` count 3), `test/dressingroomcontroller.test.js`, `test/edition.test.js`, `test/walk.edition.test.js`, `test/colonypanel.test.js`

**Interfaces:**
- Consumes: `territoryMapModel`, `opensAfterLine` (Woods Task 10); `effectiveArea`, `roomAreaMove`, `rivalForWalk`, `placeName` (Woods Task 1); `CATALOG.areas.river` (Task 5).

- [ ] **Step 1: Write the failing tests**:

```js
// test/territories.test.js
it('the River is locked until 2 Woods walks, then "Tap to explore", then "tap to walk here" once opened', () => {
  const s = clanState();
  s.walks.woods = 1; s.unlocked.areas.push('woods');
  let river = region(territoryMapModel(s, CATALOG), 'river');
  expect(river).toMatchObject({ name: 'The River and Marshes', areaId: 'river', locked: true, canOpen: false, owned: false });
  expect(river.line).toBe('opens after 2 walks in The Woods · 1/2 so far');
  expect(regionHtml(renderTerritoryMapHtml(territoryMapModel(s, CATALOG)), 'river')).toContain('data-dr-place="river"');
  s.walks.woods = 2;
  river = region(territoryMapModel(s, CATALOG), 'river');
  expect(river).toMatchObject({ locked: false, canOpen: true, line: 'Tap to explore' });
  s.unlocked.areas.push('river');
  expect(region(territoryMapModel(s, CATALOG), 'river')).toMatchObject({ owned: true, line: 'tap to walk here' });
});

// test/edition.test.js
test('Legacy never walks or sets the River', () => {
  expect(effectiveArea({ edition: 'legacy', area: 'river' }, CATALOG)).toBe('neighborhood');
  expect(effectiveArea({ edition: 'canon', area: 'river' }, CATALOG)).toBe('river');
  expect(roomAreaMove({ edition: 'legacy', area: 'river' }, CATALOG, 'park')).toBe('override');
  expect(rivalForWalk('river', 'canon')).toBeNull();
  expect(placeName('river', 'legacy', CATALOG)).toBe('The River and Marshes');
});
```

  - `dressingroomcontroller: tapping the locked River buys nothing and keeps the area`; `tapping the opened River selects it` (the Woods pair, with a save at 1 and then 2 Woods walks).
  - `walk.edition: a Legacy kid whose place is the River walks the Neighborhood and keeps the River` (the Woods test of the same shape: the save buys the Woods and the River, `setArea('river')`, `setEdition('legacy')`; the mocked Neighborhood build records `'neighborhood'`; `state.area` stays `'river'`).
  - `colonypanel: a River cat's place reads The River and Marshes in both editions`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.**
- [ ] **Step 5: Commit.** `feat(river): open the River and Marshes on the territory map`

### Task 7: Colony feeding in the River (after owner step 2)

**Do not merge this task until the Woods' colony task (Woods plan Task 11) is merged and live, and the owner has confirmed owner step 2.**

**Files:**
- Modify: `src/colony.js` (`COLONY_AREAS` becomes `['neighborhood', 'park', 'seaside', 'docks', 'woods', 'river']`)
- Modify: `test/legendary.test.js` line 17. The Woods task exempted the Woods by name; the River has no legendary cat either, so the exemption becomes a named list: `const NO_LEGENDARY_YET = ['woods', 'river']; // their legendary cats come with a later plan` and `expect(Object.keys(LEGENDARY_BY_AREA).sort()).toEqual(COLONY_AREAS.filter((a) => !NO_LEGENDARY_YET.includes(a)).sort())`.
- Test: `test/colony.test.js`, `test/editions.invariants.test.js`, `test/legendary.test.js`

**Interfaces:**
- Consumes: `feedsHere`, `feedCat`, `emptyColony`, `TERRITORY_AREAS` (Woods Task 3).

- [ ] **Step 1: Write the failing tests**:

```js
// test/colony.test.js
test('feedsHere is true in the River once the server accepts it', () => {
  expect(feedsHere('river')).toBe(true);
  expect(feedsHere('moor')).toBe(false);
  expect(feedsHere('den')).toBe(false);
});
test('a River stray can be fed solo, and its spot is kept', () => {
  const r = feedCat(emptyColony(), { name: TAMED_CAT.name, by: ME, walk: 'walk-1', area: 'river', x: -24.5, z: 6 });
  expect(r.result).toBe('ok');
  expect(r.colony.cats[0]).toMatchObject({ area: 'river', x: -24.5, z: 6 });
});
test('the repo SQL already accepts the River', () => {
  expect(readFileSync('docs/supabase-colony.sql', 'utf8')).toContain("'woods', 'moor', 'river', 'pines', 'island', 'gorge'");
});

// test/editions.invariants.test.js
test('the caps are still unchanged with the River feeding', () => {
  expect([COLONY_MAX, SOLO_MAX]).toEqual([24, 12]);
});
```

  `TAMED_CAT` and `ME` are the fixture names the Woods' colony tests use; if `spotOf` rounds, assert the rounded values it returns.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement**, and update `test/legendary.test.js` line 17 as above.
- [ ] **Step 4: Run the full suite.**
- [ ] **Step 5: Commit.** `feat(river): colony feeding in the River and Marshes`

### Task 8: Check it live, and write it down

**Files:**
- Create: `public/places/river.jpg`
- Modify: `docs/VISUAL-PASS.md` (a short "The River and Marshes" entry: build-time and merged mesh, caster and triangle counts from `test/budget.test.js`, tree and reed counts, the in-game draw count, what was and wasn't checked)

- [ ] **Step 1: Run the full suite and the build.** Expected: all pass.
- [ ] **Step 2: Check it live.** Start the `whisker-walk-dev` server (port 5174), or a temporary launch entry rooted at this worktree as the Woods check did. The automated browser can't hold keys down, so use what it can do.
  - Home screen in Clan Edition, on a save with 2 Woods walks: the River region is in colour and says "Tap to explore"; tapping it opens and selects it. Screenshot at 1280 × 720 and at the mobile preset (375 × 812).
  - Flip to Legacy on the title: the four cards, no River, and a River-chosen save's dock says Cozy Neighborhood; flip back.
  - Start a River walk: the corner map shows the lake, the three reaches, the pond, the pools, both decks and the paths; the horizon shows dark pines to the north, the Woods' green to the east, and the island with its bridge across the lake from the `lake-island` scenic.
  - From the Old Willow's boulder, the golden mouse on its limb is in sight (the Woods' gm-woods-1 question, asked here in the running game).
  - Walk into the west reedbed: the reeds stand round the cat, and the corner map still shows where it is.
  - `?perf`: the River's draw count on the same tier as the Woods' and the Neighborhood's readings; record all three.
  - `verify-places.html?area=river` builds; take the 640 × 360 `river.jpg` from `VIEWS.river`. If a trunk fills the frame, move the camera along the bank path and write the final view into `VIEWS.river`.
  - No console errors. Reset the viewport to desktop afterwards.
- [ ] **Step 3: Write the VISUAL-PASS entry.**
- [ ] **Step 4: Commit.** `docs(river): the River's budget and live check`
