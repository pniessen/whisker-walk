# Clan Edition: the Island and its Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the island in the lake, and the one bridge to it, walkable inside the Pines and Swamp walk. On the island is the meeting place, where cats from every clan gather under a truce.

**Architecture:**
- **No new area.** The island and the bridge are new ground inside `src/world/pines.js`'s map. The Pines map already holds them in its own bounds: the island at (28, 28) and the bridge foot at (10.6, 4.8).
- **Two engine changes make that possible:**
  - **islands:** dry discs cut out of a rect water footprint, both in the logic and in the drawn mesh;
  - **strip decks:** an oriented deck, for the diagonal bridge.
- **Island content** lives in a new records module, `src/world/island.js`, in Pines coordinates. `pines.js` builds it into its own area.
- **Cats stay off the island.** The Pines walk's strays and ghosts are kept off the island and the bridge by a small keep-out list on the area.
- **One island everywhere.** The island and the bridge move into one shared module, `src/world/lake.js`, with radius 13 and the plank lowered to 0.06 m. The Woods, the River and the Moor paint them from it, and the Woods gains the bridge.
- **The territory map's island marker** leads to the Pines.

**Tech Stack:** Vanilla JS, Three.js 0.185, Vite 8, Vitest 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-editions-and-territories-design.md` (Owner's answers 7 and 8, §3, §4, §8 step 8). The owner's decisions below change §3's "its map is small" and §8 step 8's "a small map of its own": the island is part of the Pines walk. Templates:
- `docs/superpowers/plans/2026-10-31-clan-edition-woods.md` and `…-river.md` (merged);
- `…-moor.md` (branch `moor`);
- `…-pines.md` (planned; **this plan builds on it**).

## Owner's decisions (2026-10-31)

1. **Owner's decision: getting there is walking over from the Pines.** The kid crosses the bridge during a Pines walk.
   - **Coordinator's ruling:** the island is **part of the Pines walk, not its own area**. So there is:
     - no `island` walk, catalog entry, unlock or walk count;
     - no separate marks or sound;
     - no "Other places" handling.

     The bridge and the island become walkable inside the Pines map.
2. **Owner's decision: the names stay.** **The Meeting Ring** (six flat sitting stones round the tree), **the Old Ash** (the big tree every shore shows) and **the Watch Rock** (a tall rock on the east shore).
3. **Owner's decision: the island grows to 26 m across** (radius 13) in every map. Its centre and the bridge's Pines end stay put, so the bridge shortens from 20 m to 16.6 m.
4. **Owner's decision: no cats on the island.** No strays, no colony feeding, no patrol. It is the meeting place, with finds, golden mice and wildlife only.
   - The Pines walk's strays (and ghosts) keep off the island and the bridge.
   - `'island'` is not added to `COLONY_AREAS`. The "can't feed here" test examples stay `'island'`, which is now true for good.

**Coordinator's rulings:**
- The island uses the Pines' sound, because it is the same walk.
- There is no dusk or full-moon moment.
- The island's golden mice belong to the Pines area: `GOLD_MICE.pines` grows from 3 to 6, and `GOLD_TOTAL` from 24 to 27.

**Recommended order: fold this into the Pines build**, on the `pines` branch:
1. Run Pines Tasks 1–8.
2. Then run this plan's Tasks 1–7.
3. Then run this plan's Task 8 instead of Pines Task 9.

**Why fold it in:**
- Main never ships the scenery-only bridge ("the cat stops at the shore"), which this plan would undo days later.
- One iPhone check covers the finished Pines.
- Pines Task 3's bridge tests are rewritten once, by Task 5 here, before they reach main.

If the Pines merges first anyway, this plan runs unchanged as its own branch right after it.

## Global Constraints

- **No new area, no new save content.** `SAVE_VERSION` stays 4.
  - The new finds (`pines-find-6..10`) and golden mice (`gm-pines-4..6`) are ids the save already stores by shape. `state.golden` is checked by `gm-<word>-<n>` shape, and finds by id.
  - `island` stays in `TERRITORY_AREAS` (`src/colony.js`) as a reserved id that no map uses.
- **The clan spec's §8 invariants hold:** no cat un-tames, no cat is dropped, a v4 save still loads, and `COLONY_MAX` (24) and `SOLO_MAX` (12) are unchanged.
- **Nothing reads the edition.** An area builds identically in both editions: `src/world/island.js`, `lake.js` and `keepout.js` never contain `/edition/i`, comments included. Nothing on the wire changes.
- **Legacy never reaches the island**, because it is inside the Pines, which is `edition: 'canon'`. The Pines plan's Legacy guards cover it, and Task 7 re-asserts them.
- **Truce.** There is no rival patrol in the Pines (`rivalForWalk('pines', …)` stays `null`), and no cat on the island or the bridge. `ISLAND_KEEP_OUT` is exported so the clan-pick plan can keep any future patrol off it, as it does `TRUCE_PATH`.
- **Our own words only.** Labels never use a scanned word (`kit`, `apprentice`, `warrior`, `elder`, `queen`, `medicine cat`, `deputy`, `leader`, `loner`, `rogue`, `kittypet`, `Twolegplace`, `Clan`). They never use a book place name either: "Gathering", "Fourtrees", "Great Rock", "Great Oak", "Highrock", "Highstones", "Moonstone", "Moonpool", "Sunningrocks", "tree-bridge" and the like.
- **Sea Legs is a shortcut, never a key.** The island is reached dry, over the bridge deck.
- **Budget.** The Pines keeps the Cozy Neighborhood's ceiling:
  - at most 450 meshes, 380 casters and 60,000 triangles as built;
  - 260 meshes and 205 casters merged.

  The island adds about 12 meshes and 10 casters to the Pines' 120–150. Count by `traverse`, with `noCast` meshes counted.
- **Comments and docs** are plain and say why.
- **Commits** use an explicit `git add <files>`; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Commands.** Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`. Build: `npm run build`.

### Design choices this plan makes

1. **The diagonal bridge gets an oriented deck, not a rotated frame.**
   - Today's decks are axis-aligned rectangles, and the bridge runs on a bearing of (0.6, 0.8).
   - The corner map draws an "N" badge and assumes −z is north (`src/ui/minimap.js`), and the Pines frame is shared with every neighbour, so rotating a frame is out.
   - So decks gain one shape, a strip `{ x1, z1, x2, z2, halfW }`. That is three pure functions plus the corner map's deck painter.
2. **The island is a hole cut in the lake, not a deck.**
   - A rect footprint gains `islands: [{ x, z, r }]`. In the logic, a point is water only inside the rect **and** outside every island. In the drawing, the water mesh is the same rect with round holes.
   - The ground plane shows through, so the island is real ground: grass, paw prints, race rings, contact shadows and shore foam all work.
   - A deck means "raised boards": carrying refuses to set things down on one (ruling R42), and paw prints skip it. That rules out making the island a deck.
3. **Strays keep out by exclusion, not an inverted roam disc.**
   - Cheaper: one pure function, `keepOutPoint(area, x, z)`, applied once where each stray's or ghost's position is written. Strays elsewhere are unaffected, because no other area has a keep-out list.
   - A stray following the cat stops at the shore end of the bridge.
4. **The territory map's island marker leads to the Pines.**
   - It becomes part of the Pines' tap target (`data-dr-place="pines"`), with its own small line, "in the Pines and Swamp".
   - Tapping the star is the obvious thing for her to do, and it should go where the island actually is. Before the Pines is open it reads like the Pines (locked, with the Pines' line).

### Checked against the code: does the Pines map handle it?

There are no blockers.
- **Bounds.** The Pines' bounds are ±50, and the island spans x 15..41, z 15..41. The deck runs from (10.6, 4.8) to (20.56, 18.08), all inside.
- **Corner map.** It gains islands and strip decks in Task 1, and it is built from `areaData` once per walk, so the island shows as ground and the bridge in the path tone.
- **Camera.**
  - `camzoom.cameraPullScale` limits the chase camera to bounds + margin: the island's east rim is at x 41, and the camera 4.5 m behind a cat there sits at x 45.5, inside 50.
  - The view-following shadow camera needs nothing.
  - The Old Ash's canopy bottom is at about 3.1 m, above the camera's 2.2 m.
- **Things that would wrongly fill the island once it is dry ground:**
  - the Pines' seeded pines;
  - ferns and toadstools;
  - grass, which is fine on the island.

  They need one more fit rule ("not on the island", Task 5). Every candidate already draws all its numbers whether kept or not, so the Pines' other counts don't move.

### Dependencies

- **From the Pines plan:**
  - `pines.js`: `PINES_WATERS`, `LAKE`, `LAKE_BAY`, `BRIDGE_FOOT`, `PINES_ISLAND`, `TRUCE_PATH`, `PINES_KEEP_CLEAR`, `pinesTrees`, `pinesUndergrowth`, `pinesReeds`;
  - the truce stones' colliders at (9.0, 3.6) and (12.2, 3.6);
  - `test/pines.test.js`'s helpers.
- **From the Moor plan:** `ISLAND_BRIDGE_WOODS` and `MOOR_ISLAND`. Task 4 moves the bridge into `lake.js`.
- **Test values with the Pines merged:**
  - `GOLD_TOTAL` 24 → **27**;
  - `GOLD_MICE.pines` holds **6**;
  - the territory map has **6** `data-dr-place` targets: Twolegplace, the Woods, the River, the Moor, the Pines, and the island leading to the Pines;
  - `NO_LEGENDARY_YET` unchanged;
  - `COLONY_AREAS` unchanged.
- **If the Moor merges after this plan,** `lake.js` defines `ISLAND_BRIDGE_WOODS` (Task 4's numbers), and the Moor imports it and paints with `addIslandView`.

### Lessons carried in, as rules

1. **Content before scenery.** The island's records join `PINES_KEEP_CLEAR` (Task 6) before the reeds.
2. **Every goal is finishable.** The island adds no tippables, boxes or villagers, and the Pines' 400-seed goal test runs unchanged.
3. **Canopy clearance from a path** is `PATH_W / 2 + canopy reach + 0.5`. For the bridge deck (2 m wide), with the deck as the path:
   - the Old Ash (reach `1.6 × 2.6 = 4.16`) keeps 5.66 m from its centreline (it is 12.4 m away);
   - every Pines pine keeps `1 + 1.3 × scale + 0.5` from it.
4. **A deck is what the kids see, at least 1.5 m wide, proven by raycast.** The bridge deck is 1.8 m wide on a 2.0 m plank.
5. **A flood fill with the real `isWalkableAt`** reaches every island find from the Pines' spawn. Without the bridge deck, none of the island is reached.
6. **Golden mice are in sight from the chase camera.**
7. **Budget by traversal**, with `noCast` meshes counted.
8. **`nearestDry` where waters overlap:** the bay over the lake on both sides of the island, the rim, and the bridge's sides.
9. **Edges agree with every neighbour, asserted in tests:** the island, the bridge and its foot (Task 4).

## Review Focus

1. **A stray walking onto the island or the bridge.** This covers:
   - a greeted stray following the cat over the bridge;
   - a shy one scurrying from a fast approach on the shore;
   - a Far Call from the island;
   - a cross cat's recoil;
   - a stray spawned (0.7 × bounds reaches x 35, z 35) or a colony cat's stored spot inside the island.

   Each one ends outside the keep-out, every frame, and every other area's cats stay byte-for-byte where they are. Tests in Task 3 and Task 5.
2. **The kid walking the truce path straight onto the bridge, and off its far end onto the island.**
   - No wet gap at either end; the cat passes between the truce stones.
   - Pushing off either side of the plank stops the cat at its edge.

   Tests in Task 5.
3. **A yarn ball, scent treat or race ring landing in the water** beside the bridge, just off the island, or where the bay meets the lake. `nearestDry` lands it on the island or the deck within 5 m. Tests in Tasks 1 and 5.
4. **Pines scenery growing on the island once it is dry.** No pine, fern or toadstool stands on the island, and the Pines' other scenery counts are unchanged. Tests in Task 5.
5. **Tapping the island's star on the territory map.**
   - Before the Pines is open, it does what tapping the Pines does (nothing bought, the Pines' locked line).
   - After, it selects the Pines.
   - In Legacy there is no map at all.

   Tests in Task 7.

## Owner steps

These are for the owner (the parent), not the implementer.

1. **Update both devices** before either kid walks the Pines with the island. This is the same step as the Pines plan's, and nothing new is stored.
2. **No SQL.**
3. **Check the Pines on the iPhone 18** after Task 8, island included: 60 fps on HIGH, standing on the island looking back up the bridge.
4. **Show her the island.**

## What this plan defers

- **A gathering night** (the kids' colony cats coming to the Meeting Ring at dusk or at a full moon). This is ruled out for now; it would need colony cats shown outside their own area.
- **An island-only legendary cat or patrol.** Never, under decision 4.
- **Known horizon-only mismatches.** The Woods' and River's `lake` rects run past the Pines' shore beyond their bounds, and the neighbours paint the island as a 1.4 m dome while it walks flat. Both are in fog and left as they are.

## Files

| File | Responsibility |
|---|---|
| `src/world/builder.js` | `islands` on rect footprints (`waterGap`, `nearestDry`); strip decks (`onDeck`, `nearestDry`); `plankBridge` |
| `src/render/water.js` | `shoreDepth` and `createWater` for a rect with islands (a holed plane) |
| `src/ui/minimap.js` | Islands and strip decks on the corner map |
| `src/keepout.js` (new) | `keepOutPoint`: where a walk's cats never stand |
| `src/straycats.js`, `src/ghosts.js` | Apply it at spawn and after every position write |
| `src/world/lake.js` (new) | The frames, the island and the bridge, once; `islandBridgePlank`, `addIslandView` |
| `src/world/woods.js`, `river.js`, `moor.js` | Paint the island and bridge with `addIslandView` |
| `src/world/pines.js` | The island cut out of the lake, the walkable bridge, the scenery kept off the island, and the island content built in |
| `src/world/island.js` (new) | The island's records and meshes, in Pines coordinates |
| `src/goldmice.js` | `gm-pines-4..6` |
| `src/territories.js`, `src/ui/territorymap.js` | The island's star leads to the Pines |
| `docs/VISUAL-PASS.md`, `public/places/pines.jpg` | The written check; the picture retaken if the view changes |

## The island in numbers

All in **Pines coordinates** (metres; x east, z south, north is −z). A Woods point (x, z) is the Pines point (x + 100, z + 100).

**`lake.js` frames:** `FRAMES = { woods: [0, 0], river: [100, 0], moor: [0, 100], pines: [100, 100] }`.

| Thing | Value |
|---|---|
| `ISLAND_WOODS` (lake.js) | `{ x: -72, z: -72, r: 13, rise: 1.4, treeScale: 2.6 }` |
| `ISLAND_BRIDGE_WOODS` (lake.js) | `[[-79.44, -81.92], [-89.4, -95.2]]`: the island end 0.6 m onto the island, then the Pines' shore end 0.2 m onto land (unchanged); 16.6 m long, direction (−0.6, −0.8) from the island |
| `BRIDGE_PLANK` (lake.js) | `{ w: 2, thick: 0.12, y: 0.06 }` |
| `PINES_ISLAND` | `fromWoodsDisc('pines')` = `{ x: 28, z: 28, r: 13, rise: 1.4 }` |
| `ISLAND_LAND` | `{ x: 28, z: 28, r: 13 }` |
| `BRIDGE_DECK` | `{ x1: 20.56, z1: 18.08, x2: 10.0, z2: 4.0, halfW: 0.9 }`. It runs from the plank's island end (`ISLAND_BRIDGE_WOODS[0]` through `fromWoods('pines', …)`) on past the foot `(10.6, 4.8)` by 1.0 m along the bridge's line, onto the Pines' dry land. **Why past the foot:** the cat is held 0.35 m clear of water (`WATER_MARGIN`), and the foot is only 0.2 m onto land, so a deck ending at the foot would leave a band at the shore the cat can't cross. The extra metre is over land, so it adds no walkable water. It lies wholly in `lake-bay` (x < 26). Length 17.6 m |
| Pines `LAKE`, `LAKE_BAY` | Unchanged boxes, plus `islands: [ISLAND_LAND]` on both; `LAKE_BAY.decks = [BRIDGE_DECK]` |
| `ISLAND_KEEP_OUT` | `[{ x1: 28, z1: 28, x2: 28, z2: 28, r: 14.5 }, { x1: 20.56, z1: 18.08, x2: 10.6, z2: 4.8, r: 1.5 }]`: capsules, the island plus 1.5 m and the bridge plus 0.6 m each side. On the Pines' area record as `keepOut` |
| The Old Ash | `b.tree(28, 28, 2.6, { wind })` at y 0, named `oldAsh`, collider r 1.0. Its limb is a child in the tree's scaled frame (s = 2.6): `CylinderGeometry(0.07/s, 0.12/s, 1.6/s, 6)`, `rotation.x = π/2`, local `(0, 2.0/s, 1.4/s)`, so it reaches 0.6–2.2 m south of the trunk at y 2.0. Colour `0x7a5230`, `'bark'` |
| Old Ash chain | Mossy boulder `(28, 31.2)` y 0.72 `'stone'` (collider r 0.7, named `ashBoulder`) → limb perch `(28, 29.5)` y 2.1 `'tree'`, label `'old ash lookout'`, vantage |
| The Meeting Ring (`MEETING_STONES`) | Six stones at r 6 round the Old Ash: `(33.2, 31)`, `(28, 34)`, `(22.8, 31)`, `(22.8, 25)`, `(28, 22)`, `(33.2, 25)`. Each is `CylinderGeometry(0.55, 0.65, 0.4, 9)` at y 0.2, colour `0x9a9488`, `'cobble'`, merged into one mesh `meetingRing`; collider r 0.6 and perch y 0.4 `'stone'` each. The bridge comes in through the gap between `(22.8, 25)` and `(28, 22)` |
| Watch Rock chain | Low rock `(37, 29)` y 0.72 `'stone'` (the Woods' mossy boulder shape, collider r 0.7, named `watchRockStep`) → `CylinderGeometry(0.75, 0.9, 1.9, 7)` at `(38, 28)`, colour `0x8e8c88`, `'cobble'`, named `watchRock`, collider r 0.9, perch y 1.9 `'stone'`, label `'watch rock'`, vantage |
| Island POIs (8, appended to the Pines' 9) | `(34.7, 34.7)`, `(25.5, 38)`, `(18, 28)`, `(19.8, 23.3)`, `(28, 18)`, `(34.7, 21.3)`, `(25.5, 24.2)`, `(15.76, 11.68)` (on the bridge, 8 m from the island end) |
| Island scenics (appended) | `{ id: 'bridge-landing', x: 22, z: 20.5, label: 'the end of the bridge' }`, `{ id: 'meeting-ring', x: 30.5, z: 25.5, label: 'the meeting ring under the old ash' }`, `{ id: 'lake-view', x: 35.5, z: 36, label: 'the lake, looking over to the Woods' }` |
| Island finds (appended) | `pines-find-6 (24.5, 35.5) 'a smooth white pebble'`; `pines-find-7 (33, 18.5) 'a grey goose feather'`; `pines-find-8 (17.5, 31) 'a snail shell at the water's edge'`; `pines-find-9 (12.76, 7.68) 'a pine cone dropped on the planks'` (on the deck, 13 m out); `pines-find-10 (28, 22, y 0.4) 'a bright beetle wing on a meeting stone'` |
| Island golden mice (appended to `GOLD_MICE.pines`) | `gm-pines-4 (28, 29.8, y 2.1)` out on the Old Ash's limb; `gm-pines-5 (38, 28, y 1.9)` top of the Watch Rock; `gm-pines-6 (21.5, 35.2, y 0)` hidden among bushes at `(22, 33.5)`, `(20, 35)`, `(22.5, 36.5)` (no colliders) |
| Island puddle (appended) | `{ x: 19.5, z: 26.5, r: 0.8 }` |
| Island critters (appended) | Birds ×2 at `(28, 28)`; butterflies `(31, 32)`, `(25, 32)`, `(30, 24)`; mouse `(24, 37.5) → (27, 39.5)`. The Pines' three ducks already paddle round the island |
| Island moment (appended) | `{ id: 'duck-ring', type: 'duck', label: 'ducks paddling round the island', x: 34, z: 18.5, from: { x: 38, z: 15 } }` |
| Island reeds | `islandReeds()`: one clump every 2.5 m round r 12.6 from (28, 28), kept ≥ 3 m from every island record, and ≥ 2 m from the deck's centreline. Expect 18–30. They are appended to `pinesReeds()`'s output and drawn in the same merged `reeds` mesh |

**Checked by hand:**
- Every island POI is ≥ 1.6 + radius from every collider (the tightest is `(25.5, 24.2)`, 2.82 from the stone at `(22.8, 25)`) and ≥ 2.5 m inside the rim.
- Every gap between colliders is wider than a cat: boulder to trunk 1.5, boulder to the south stone 1.5, Watch Rock to the waterline 2.1. The Watch Rock's two colliders overlap.
- The truce stones are 2.4 m apart inside, and the deck's foot lies between them.
- The Pines' ducks at `(34, 14)`, `(36, 16)` and `(38, 13)` are 15.2, 14.4 and 18 m from the island's centre: still on water.
- The Pines' `nearestDry` spots `[28, 6.5]`, `[30.4, 7.6]` and `[25.6, 44.4]` are all clear of the r 13 island.

---

### Task 1: Dry land in water: islands in a rect footprint, and strip decks

**Files:**
- Modify: `src/world/builder.js`:
  - the "WATER FOOTPRINTS" header block, with two lines describing `islands` and strip decks;
  - `waterGap`, `onDeck`, `pushOutOf` and `clampInto`.
- Modify: `src/ui/minimap.js` (`buildMapLayer` and the water painter).
- Test: `test/waterblock.test.js`, `test/water.test.js` (the shape checks in the generic block), `test/minimap.test.js`

**Interfaces:**
- **Produces, rect footprints:** an optional `islands: Array<{ x, z, r }>`.
  - `waterGap(w, x, z)` = `max(rectGap, max_i(r_i − hypot(x − x_i, z − z_i)))`.
  - `pushOutOf` adds one candidate per island: the point at `r_i − margin` from its centre along (x, z) − centre (+x at the dead centre).
  - `islands` on a circle footprint is not supported: `waterGap` ignores it, and a comment says so.
- **Produces, decks:** a deck is today's rect, or a strip `{ x1, z1, x2, z2, halfW }`, told apart by `Number.isFinite(d.x1)`.
  - `onDeck`: with u the unit vector from end 1 to end 2, `len` the length and n = (−u_z, u_x), the point is on the strip when `0 ≤ (p − a)·u ≤ len` and `|(p − a)·n| ≤ halfW`.
  - `clampInto` for a strip: clamp t to `[margin, len − margin]` (`len / 2` if `len ≤ 2 × margin`) and the side offset to `±(halfW − margin)` (0 if `halfW ≤ margin`); return `a + t u + s n`.
- **Produces, corner map:** `buildMapLayer` keeps `islands` on rect waters and copies a strip deck as `{ kind: 'strip', x1, z1, x2, z2, halfW }`.
  - The painter fills each island in the layer's `ground` colour after all the water and before the decks.
  - It paints a strip deck as a rotated rectangle in the path tone.

- [ ] **Step 1: Write the failing tests** in `test/waterblock.test.js`, with `W = { id: 'w', kind: 'rect', minX: -20, maxX: 20, minZ: -20, maxZ: 20, islands: [{ x: 0, z: 0, r: 5 }], decks: [{ x1: -3, z1: -4, x2: -12, z2: -16, halfW: 0.9 }] }`:
  - `an island in a rect is dry land, and the water round it is water`:
    - `inWater([W], 0, 0)` and `inWater([W], 4.9, 0)` are false;
    - `inWater([W], 5.1, 0)` is true;
    - `waterGap(W, 0, 6)` is within 1e-9 of −1;
    - `waterGap(W, 0, 4)` is within 1e-9 of 1.
  - `isWalkableAt holds a cat 0.35 inside the island's rim`: (4.6, 0) is walkable and (4.7, 0) is not.
  - `a strip deck is dry along its whole length and width, and nowhere past it`:
    - points at t ∈ {0, 0.5, 1} × the strip, with side offsets ±0.85, are dry;
    - an offset of 0.95 is water;
    - 0.1 m past the far end is water.
  - `nearestDry lands a point beside the island on its rim, and a point beside the strip on the strip`:
    - `nearestDry([W], 0, 6, 0.6)` is within 1e-6 of (0, 4.4);
    - from 1.5 m to the side of the strip's middle, the result is on the deck, ≤ 0.3 from its centreline and within 1.2 m of the query point;
    - a dry point comes back unchanged.
  - `onDeck still reads a rect deck exactly as before` (the Seaside pier, unchanged values).
- [ ] In `test/water.test.js`'s generic block, `declares at least one well-formed water footprint` also accepts:
  - a rect's `islands`, each with finite `x`, `z` and `r > 0`;
  - a strip deck with finite ends, a length > 0 and `halfW > 0`.
- [ ] In `test/minimap.test.js`:
  - `buildMapLayer keeps a rect water's islands and a strip deck`;
  - `paints an island in the ground colour over its water` (the deck test's canvas stub: a fill in the ground colour comes after the water fill and before the path-tone fill).
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run test/waterblock.test.js test/water.test.js test/minimap.test.js`
- [ ] **Step 3: Implement.** Add a short comment on each new branch saying why:
  - an island is a hole of ground, not a deck (a deck is raised boards: ruling R42);
  - a strip is how a diagonal bridge stays one deck.
- [ ] **Step 4: Run the full suite.** Every existing area builds the same.
- [ ] **Step 5: Commit.** `git add src/world/builder.js src/ui/minimap.js test/waterblock.test.js test/water.test.js test/minimap.test.js`, then commit `feat(water): islands in a rect footprint, and strip decks for a diagonal bridge`

### Task 2: Draw a lake with an island in it

**Files:**
- Modify: `src/render/water.js` (`shoreDepth`, `createWater`)
- Test: `test/waterfx.test.js`, `test/water.test.js` (the "draws that footprint from the declaration" case)

**Interfaces:**
- Consumes: Task 1's `islands`.
- Produces:
  - **`shoreDepth`:** for a rect with islands, it is the minimum of today's value over `shores` and `hypot − r_i` per island. An island's rim is always a shore.
  - **`createWater`:** for a rect with islands, the geometry is a `THREE.ShapeGeometry`:
    - the rect centred exactly as the `PlaneGeometry` is, with one hole per island (`absarc`, `segments` steps);
    - hole centres at local `(x_i − cx, −(z_i − cz))`, because local y becomes world −z under the flat rotation;
    - its `uv` rewritten to the PlaneGeometry's `((x + w/2)/w, (y + h/2)/h)`, so the ramp and normal map line up as on a plain rect.
  - Tiers, material, update and dispose are unchanged.

- [ ] **Step 1: Write the failing tests** in `test/waterfx.test.js`, with Task 1's `W` (decks dropped):
  - `shoreDepth is 0 on an island's rim and grows away from it`: 0 at (5, 0), 1 at (6, 0); with `shores: []`, the rect's edges don't count.
  - `a rect with islands is drawn as a holed plane over the rect's exact box`: the type is `ShapeGeometry`, `parameters.shapes.holes.length === 1`, the bounding box is 40 × 40, and the position is (0, y, 0).
  - `the hole is where the island is`: a downward ray at (0, 0) and at (4.5, 0) misses; at (5.5, 0) and at (15, 15) it hits.
  - `a holed plane's uv matches a plain plane's` at the rect's corners.
  - `the low tier draws the same holed geometry`.
- [ ] In `test/water.test.js`, `draws that footprint from the declaration` accepts, for a footprint with `islands`, a `ShapeGeometry` mesh with the rect's size and centre and `parameters.shapes.holes.length === w.islands.length`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Add a comment by the holed plane saying why it is the declaration verbatim, with the ground showing through, rather than a ground-coloured disc over the water.
- [ ] **Step 4: Run the full suite.**
- [ ] **Step 5: Commit.** `git add src/render/water.js test/waterfx.test.js test/water.test.js`, then commit `feat(water): draw a rect of water with round islands cut out of it`

### Task 3: A walk's cats keep out of places they mustn't stand

**Files:**
- Create: `src/keepout.js`
- Modify: `src/straycats.js`. Call `keepOutPoint` at:
  - the cast's placement (~439);
  - the colony cat's clamp (~441);
  - the legendary extra (~506);
  - the end of each stray's per-frame update (after the wander, follow, scurry, Far Call and recoil writes, once).
- Modify: `src/ghosts.js`: placement (~95), and the end of each ghost's per-frame update.
- Test: `test/keepout.test.js` (new), `test/straycats.test.js`, `test/ghosts.test.js`, `test/cowalkstreams.test.js` (must pass unchanged)

**Interfaces:**
- Produces, from `src/keepout.js` (pure, no THREE): **`keepOutPoint(area, x, z) -> { x, z }`**.
  - `area.keepOut` is an optional `Array<{ x1, z1, x2, z2, r }>` of capsules (a disc is a capsule with equal ends).
  - For each capsule the point is inside, it moves to the capsule's edge along the line from the nearest point on its segment (+x when on the segment).
  - Up to three passes, so a push out of one capsule into another settles.
  - With no `keepOut`, the input point comes back as is.
- No rng is drawn, so `strayStream`, the wander streams and the co-walk seeds never shift. Both co-walkers compute the same push.

- [ ] **Step 1: Write the failing tests**:
  - `keepout.test.js`:
    - `no keep-out list leaves every point alone`;
    - `a point in a disc goes to its rim, a point by a capsule's middle goes out sideways, and a point in two capsules ends outside both` (the island disc and bridge capsule from "The island in numbers");
    - `a point outside every capsule is unchanged`.
  - `straycats.test.js`:
    - `strays on an area with a keep-out never stand in it`. Use a Pines-sized area with `keepOut: ISLAND_KEEP_OUT`, 3 strays, seeds 1..200. At spawn, and through 120 s of `update` at 1/30 s, every stray is outside every capsule. The cat is parked on the island, then on the bridge, then at the bridge foot, and the run includes a greeted stray following, a shy stray scurrying from a fast approach, a cross cat's recoil and a Far Call.
    - `a colony cat stored inside the keep-out is moved out of it`.
    - `without a keep-out, the Woods' strays stand exactly where they did`: positions for seeds 1..20 equal a snapshot computed with the old formula in the test.
  - `ghosts.test.js`: `ghosts on an area with a keep-out spawn and wander outside it`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** One comment at the top of `keepout.js` says why: the meeting place is under a truce with no cats on it (owner's decision 4), and strays are bounds-only by design (`player.js`'s note), so the area names the places they never go.
- [ ] **Step 4: Run the full suite**, `cowalkstreams` included.
- [ ] **Step 5: Commit.** `git add src/keepout.js src/straycats.js src/ghosts.js test/keepout.test.js test/straycats.test.js test/ghosts.test.js`, then commit `feat(strays): an area can keep its strays and ghosts out of places`

### Task 4: One island, one bridge, seen the same from every shore

**Files:**
- Create: `src/world/lake.js`
- Modify: `src/world/builder.js`: `plankBridge(x1, z1, x2, z2, w, y, thick) -> THREE.Mesh`, a `BoxGeometry(w, thick, len)` centred between the ends at `y`, `rotation.y = atan2(x2 − x1, z2 − z1)`, colour `0x8a6a44`, the `'wood'` surface at the Seaside pier's tile scale.
- Modify: `src/world/woods.js`, `river.js`, `moor.js`: each replaces its own mound, tree and plank code with `addIslandView(scene, '<id>', { wind })`.
  - `RIVER_ISLAND` and `MOOR_ISLAND` become `fromWoodsDisc('<id>')`.
  - `moor.js` no longer declares `ISLAND_BRIDGE_WOODS`.
- Modify: `src/world/pines.js`:
  - imports `ISLAND_BRIDGE_WOODS` from `./lake.js`;
  - `PINES_ISLAND = fromWoodsDisc('pines')`;
  - `BRIDGE_FOOT = fromWoods('pines', …ISLAND_BRIDGE_WOODS[1])`;
  - the plank is `islandBridgePlank('pines')`.

  The Pines keeps its mound and raised tree in this task; Task 5 replaces them.
- Test: `test/lake.test.js` (new). Also rewrite the island tests in `test/woods.test.js`, `test/river.test.js`, `test/moor.test.js` and `test/pines.test.js` wherever they hard-code r 9, the old rim end `(-77.4, -79.2)`, y 0.3 or a plank length of 20: each reads `ISLAND_WOODS` and `ISLAND_BRIDGE_WOODS` instead. `test/budget.test.js` (the Woods gains one mesh).

**Interfaces:**
- Produces, from `src/world/lake.js` (frozen):
  - `FRAMES`;
  - `fromWoods(areaId, x, z) -> { x, z }`;
  - `fromWoodsDisc(areaId) -> { x, z, r, rise }`;
  - `ISLAND_WOODS`, `ISLAND_BRIDGE_WOODS`, `BRIDGE_PLANK`;
  - `islandBridgePlank(areaId) -> THREE.Mesh`: `plankBridge` from the shore end to the island end in that frame, named `islandBridge`;
  - `addIslandView(scene, areaId, { wind }) -> void`: three top-level scene children:
    - the mound, a `SphereGeometry(r, 24, 8)` squashed to `rise`, colour `0x6a9a50`, `'grass'`;
    - `b.tree(x, z, treeScale, { wind })` raised to `rise − 0.2`;
    - `islandBridgePlank(areaId)`.

    Top-level children, so the shipped "something stands at the island's centre" tests still find them.

- [ ] **Step 1: Write the failing tests** in `test/lake.test.js`:

```js
it('the bridge runs from 0.6 m onto the island to 0.2 m onto the Pines shore', () => {
  const [[ix, iz], [fx, fz]] = ISLAND_BRIDGE_WOODS;
  const I = ISLAND_WOODS;
  expect(Math.hypot(ix - I.x, iz - I.z)).toBeCloseTo(I.r - 0.6, 6);
  const foot = fromWoods('pines', fx, fz);
  expect(foot.x).toBeCloseTo(10.6, 9);
  expect(foot.z).toBeCloseTo(4.8, 9);
  // the bridge points the same way on her map as in the world
  const [[bx0, by0], [bx1, by1]] = BRIDGE; // src/territories.js: shore -> island, board y is south
  const board = Math.atan2(bx1 - bx0, by1 - by0), world = Math.atan2(ix - fx, iz - fz);
  expect(Math.abs(board - world)).toBeLessThan(Math.PI / 180);
});

for (const [id, build] of Object.entries({ woods: buildWoods, river: buildRiver, moor: buildMoor, pines: buildPines })) {
  it(`${id} draws the one bridge`, () => {
    const scene = new THREE.Scene();
    build(scene);
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

  - `the Woods, the River and the Moor paint the one island out of reach`: for each of the three,
    - a tree group stands at `fromWoodsDisc(id)` with scale `treeScale`;
    - the centre is outside `bounds`;
    - 16 rim points at r 13 are `inWater` of its waters;
    - no collider or perch is within `r + 2`;
    - the plank's world box doesn't touch the bounds.

    This proves r 13 still fits each neighbour's lake.
  - `the neighbours' island records are derived, not typed`: `RIVER_ISLAND`, `MOOR_ISLAND` and `PINES_ISLAND` deep-equal `fromWoodsDisc` for their ids.
  - `nothing in lake.js reads the edition`.
- [ ] Rewrite the literals in the four neighbour test files as listed under Files. Every other assertion in them stays.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Write a comment at the top of `lake.js` saying why the island and the bridge live there: one place seen from four maps, and `test/lake.test.js` is what keeps them in step.
- [ ] **Step 4: Run the full suite.**
- [ ] **Step 5: Commit.** `git add src/world/lake.js src/world/builder.js src/world/woods.js src/world/river.js src/world/moor.js src/world/pines.js test/lake.test.js test/woods.test.js test/river.test.js test/moor.test.js test/pines.test.js test/budget.test.js`, then commit `feat(lake): one island and one bridge, painted the same from every shore`

### Task 5: The Pines: the island becomes ground and the bridge becomes walkable

**Files:**
- Modify: `src/world/pines.js`:
  - `LAKE` and `LAKE_BAY` gain `islands: [ISLAND_LAND]`, and `LAKE_BAY` gains `decks: [BRIDGE_DECK]`;
  - the Pines' mound and raised tree are removed (the Old Ash arrives in Task 6);
  - `keepOut: ISLAND_KEEP_OUT` goes on the area record;
  - one more fit rule for `pinesTrees`, `pinesUndergrowth` and `pinesReeds` (the bay-shore and lake-shore lines): **not within `ISLAND_LAND.r + 1` of the island's centre**;
  - `pinesTrees` also keeps `1 + 1.3 × scale + 0.5` from `BRIDGE_DECK`'s centreline segment;
  - the header comment's "the bridge waits for the island" becomes: the bridge is walkable, the island is ground cut out of the lake, and no cat lives there (owner's decision 4).
- Modify: `src/world/island.js` (new): `ISLAND_LAND`, `BRIDGE_DECK` and `ISLAND_KEEP_OUT`, frozen, from "The island in numbers" (derived from `lake.js`).
- Test: `test/pines.test.js`, `test/water.test.js`, `test/minimap.test.js`

**Interfaces:**
- Consumes: Tasks 1–4; the Pines plan's `pinesTrees`, `pinesUndergrowth`, `pinesReeds` and `TRUCE_PATH`.
- Produces: `ISLAND_LAND`, `BRIDGE_DECK` and `ISLAND_KEEP_OUT` from `src/world/island.js`; `area.keepOut` on the Pines.

- [ ] **Step 1: Rewrite the Pines plan's bridge-as-scenery tests** (Pines Task 3, "the cat walks to the bridge foot and stops at the shore"; its Review Focus 5) **as failing tests**:
  - `the island is ground cut out of the lake, and the bridge is the only way to it`:
    - `lake` and `lake-bay` carry `islands: [ISLAND_LAND]`;
    - only `lake-bay` carries `BRIDGE_DECK` among the lake's waters;
    - `reaches(area, 28, 40)`, `reaches(area, 40, 28)` and the deck's middle are true;
    - with `BRIDGE_DECK` removed from `lake-bay`, none of the three is reached, and every Pines-mainland target still is.
  - `the truce path runs straight onto the bridge and the bridge onto the island` (Review Focus 2): in 0.1 m steps from the truce path's last point `(10.6, 2.5)` to `(10.6, 4.8)`, then along the deck's centreline to `(23.4, 21.9)` (r 7.6 on the island), every point is `isWalkableAt`. A cat 1.2 m to the side of the deck's middle is not walkable, and `nearestDry` from there lands on the deck.
  - `the bridge deck is no wider than the plank the kids see`:
    - from 2 m above, rays at 9 points along the plank's length (0.05..0.95 of the 16.6 m from the island end) × 5 side offsets in `[−halfW, halfW]` hit `islandBridge`;
    - the deck's last metre, past the foot, is over dry land (not `inWater` with decks ignored);
    - `2 × halfW` is ≥ 1.8 and ≤ the plank's width − 0.2.
  - `no pine, fern, toadstool or bay reed grows on the island, and the rest of the Pines is as it was`:
    - none of `pinesTrees().near`, `pinesTrees().stand`, `ferns`, `toadstools` or the shore reeds lies within 14 m of (28, 28);
    - the near and stand counts, ferns, toadstools and shore reeds equal the numbers measured before this task (write them into the test from a run on the Task 4 commit);
    - every pine keeps `1 + 1.3 × scale + 0.5` from the deck's centreline.
  - `the Pines keeps its cats off the island and the bridge`: `area.keepOut` deep-equals `ISLAND_KEEP_OUT`; the island capsule covers every rim point; the bridge capsule covers every deck point.
  - Drop the mound's assertions. `PINES_ISLAND` keeps its derived record (Task 4).
  - `test/water.test.js`: a block `nearestDry round the island and its bridge`. Each spot is tested at margins 0.35, 0.5 and 0.6, with the Woods block's two expectations:
    - `[28, 41.3]`;
    - `[28, 14.7]`, where the bay and the lake overlap;
    - `[14.6, 28]`, in the bay only;
    - `[16.96, 10.78]`, 1.5 m beside the bridge's middle;
    - `[21.16, 16.88]`, 1.2 m beside the deck where it meets the rim;
    - `[10, 6.5]`, 1.5 m beside the deck (west side), 1 m short of the foot.
  - `test/minimap.test.js`: the Pines' layer has three waters with decks (mire-north, mire-west and lake-bay, whose deck is a strip) and two with the island.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite**, both budget tables included.
- [ ] **Step 5: Commit.** `git add src/world/pines.js src/world/island.js test/pines.test.js test/water.test.js test/minimap.test.js`, then commit `feat(pines): the island is ground and the bridge is walkable, with no cats on either`

### Task 6: The island: the Meeting Ring, the Old Ash, the Watch Rock, and things to find

**Files:**
- Modify: `src/world/island.js`:
  - `ISLAND_POIS`, `ISLAND_SCENICS`, `ISLAND_COLLECTIBLES`, `ISLAND_PERCHES`, `MEETING_STONES`, `ISLAND_BUSHES`, `ISLAND_PUDDLES`, `ISLAND_CRITTERS`, `ISLAND_MOMENTS`, `islandReeds()`;
  - `buildIsland(scene, { wind }) -> { colliders, perches }`, which adds the Old Ash with its limb, the boulder, the Meeting Ring, the Watch Rock and the bushes.
- Modify: `src/world/pines.js`:
  - `build` calls `buildIsland` and appends every island list to the Pines' own;
  - `PINES_KEEP_CLEAR` gains the island records;
  - `pinesReeds()` appends `islandReeds()`.
- Modify: `src/goldmice.js`: `gm-pines-4..6` appended to `pines`, and the header's count.
- Test:
  - `test/pines.test.js`;
  - `test/goldmice.test.js` (`GOLD_MICE.pines` has 6; `GOLD_TOTAL` 27);
  - `test/docks.test.js` (`GOLD_TOTAL` 27);
  - `test/climbing.test.js`:
    - `['pines-find-10', 'pines']` in `ELEVATED`;
    - `SHIPPED_HOPS` gains `'gm-pines-4': 2, 'gm-pines-5': 2, 'gm-pines-6': 0, 'pines-find-10': 1`;
    - every ground-mice list gains `'gm-pines-6'`;
    - the skilled hop tables gain `'gm-pines-4': 1, 'gm-pines-5': 1`;
    - `UNGATED.pines` has length 15 (5 + six stones + four chain perches);
  - `test/minimap.test.js` (the Pines now has one block, the Old Ash at r 1.0).

**Interfaces:**
- Consumes: Task 5; `b.tree`, `b.bush`, `b.puddle`; `GOLD_MICE.pines`.
- Produces:
  - the records above;
  - meshes named `oldAsh`, `ashBoulder`, `meetingRing`, `watchRock` and `watchRockStep`;
  - the Pines' lists grow by 8 POIs, 3 scenics, 5 finds, 1 puddle, 7 critters and 1 moment;
  - the Pines' colliders grow by 10.

- [ ] **Step 1: Write the failing tests** (in `test/pines.test.js`, a `describe('the island')`):
  - `eight island POIs, at least 2 m from water (the bridge one on its deck) and clear of every collider by 1.6`.
  - `the island's five finds, three scenics, the Meeting Ring's six stones and two vantage perches` (exact records). The Pines now has 17 POIs, 6 scenics and 10 finds.
  - `the Old Ash chain is two hops and its limb can't be reached from the grass`; the same for the Watch Rock. Use exact perch records and collider radii, `canReach` both ways, and `reachesWithin` the first step.
  - `the Old Ash's limb reaches out past the trunk`:
    - in world space, the limb spans z 28.6..30.2 at y 1.85..2.15;
    - the mouse at (28, 29.8) and the perch at (28, 29.5) are further from the axis than the trunk's world radius at y 2.0 (0.35 → 0.25 over the 2 m trunk, × 2.6) plus 0.3.
  - `the climbing golden mice sit on the chain tops and the third hides among three bushes` (the bushes have no collider).
  - `every island find, POI, scenic and golden mouse is reached on foot from the Pines' spawn, and only over the bridge` (the Pines' `targets()`, with a `firstStep` for the two chains).
  - `the island's golden mice are in sight from the chase camera`. Use the Pines test's camera (a cat 3 m out, the camera 4.5 m further and 2.2 m up, a ray to y + 0.12 that hits nothing first):
    - `gm-pines-4` from the south, east and west; the trunk is in the way from the north, and the comment says so;
    - `gm-pines-5` from the north, south and west; the lake is 3 m east, and the comment says so.
  - `the Watch Rock is as wide at the foot as its collider` (`radiusBottom === 0.9`).
  - `the collider count is near + stand + 19` (the Pines' 9 plus the island's 10).
  - `islandReeds is seeded and stands on the rim, clear of the bridge and every find`: 18–30 clumps, at r 12.4–12.8, all dry.
  - `goals: every goal drawn in the Pines can still be finished there` (the shipped test, unchanged).
  - `the island's labels are our own words`:

```js
const BOOK_PLACES = ['gathering', 'fourtrees', 'great rock', 'great oak', 'highrock', 'highstones',
  'moonstone', 'moonpool', 'sunningrocks', 'tree-bridge', 'treebridge', 'starclan'];
const labels = [...ISLAND_SCENICS, ...ISLAND_COLLECTIBLES, ...ISLAND_PERCHES, ...ISLAND_MOMENTS].map((r) => r.label).filter(Boolean);
for (const l of labels) for (const w of BOOK_PLACES) expect(l.toLowerCase()).not.toContain(w);
```

  - `nothing in island.js reads the edition`.
  - The goldmice, docks, climbing and minimap changes as listed under Files.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - The Meeting Ring is one merged mesh (0.4 m tall, so it casts).
  - The two chain boulders share one material made per `build`.
- [ ] **Step 4: Run the full suite.** Write the Pines' new built and merged numbers into `test/budget.test.js`'s comment tables; the caps are unchanged.
- [ ] **Step 5: Commit.** `git add src/world/island.js src/world/pines.js src/goldmice.js test/pines.test.js test/goldmice.test.js test/docks.test.js test/climbing.test.js test/minimap.test.js test/budget.test.js`, then commit `feat(island): the Meeting Ring, the Old Ash, the Watch Rock and the island's finds`

### Task 7: The island's star leads to the Pines

**Files:**
- Modify: `src/territories.js`:
  - `ISLAND` becomes `{ id: 'island', areaId: 'pines', name: 'The island', status: 'built', outline: … }` (outline unchanged), with a comment saying the island is walked as part of the Pines (owner's decision 1);
  - the per-region state (owned, selected, locked, canOpen, line) moves into one function, used for each `TERRITORIES` entry and for `ISLAND` through its `areaId`;
  - the model returns `island: { ...ISLAND, owned, selected, locked, canOpen, line }`, with the Pines' state.
- Modify: `src/ui/territorymap.js`. When the Pines is built, the island's `<g>` gets:
  - `stateClasses`, `data-dr-place="pines"` and a `<title>` of `The island, in the Pines and Swamp · <line>`;
  - an invisible `tm-hit` copy of the outline;
  - a second small text `in the Pines and Swamp` at `(461, 352)`.

  Draw it last, so its small target is never under a neighbour's. Before the Pines is built it renders exactly as today.
- Test: `test/territories.test.js`, `test/dressingroomcontroller.test.js`, `test/edition.test.js`

**Interfaces:**
- Consumes: the Pines' catalog entry; the shipped Legacy guards.
- Produces: `territoryMapModel(...).island` with the Pines' region state; `ISLAND.areaId === 'pines'`.

- [ ] **Step 1: Write the failing tests**:

```js
// test/territories.test.js
it("the island's star is the Pines' way in, locked and opened with it", () => {
  const s = clanState();
  s.unlocked.areas.push('woods', 'river'); s.walks.river = 1;
  let m = territoryMapModel(s, CATALOG);
  expect(m.island).toMatchObject({ name: 'The island', areaId: 'pines', locked: true, canOpen: false });
  expect(m.island.line).toBe(region(m, 'pines').line);
  s.walks.river = 2; s.unlocked.areas.push('pines'); s.area = 'pines';
  m = territoryMapModel(s, CATALOG);
  expect(m.island).toMatchObject({ owned: true, selected: true, line: 'today’s walk' });
  const html = renderTerritoryMapHtml(m);
  expect(regionHtml(html, 'island')).toContain('data-dr-place="pines"');
  expect(regionHtml(html, 'island')).toContain('in the Pines and Swamp');
  // Twolegplace, the Woods, the River, the Moor, the Pines, and the island leading to the Pines
  expect((html.match(/data-dr-place=/g) || []).length).toBe(6);
});

// test/edition.test.js
test('the island is inside the Pines, so Legacy never walks it and no patrol is there', () => {
  expect(effectiveArea({ edition: 'legacy', area: 'pines' }, CATALOG)).toBe('neighborhood');
  expect(Object.hasOwn(CATALOG.areas, 'island')).toBe(false);
  expect(rivalForWalk('pines', 'canon')).toBeNull();
});
```

  - Rewrite the Pines plan's `m.island toMatchObject({ status: 'soon' })` to `status: 'built', areaId: 'pines'`, and its place count from 5 to 6.
  - `dressingroomcontroller: tapping the island before the Pines opens buys nothing; after, it selects the Pines`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.**
- [ ] **Step 5: Commit.** `git add src/territories.js src/ui/territorymap.js test/territories.test.js test/dressingroomcontroller.test.js test/edition.test.js`, then commit `feat(island): the island's star on the territory map leads to the Pines`

### Task 8: Check it live, and write it down

This replaces the Pines plan's Task 9 when folded in. Run its checks too, with the bridge items changed as below.

**Files:**
- Modify: `docs/VISUAL-PASS.md`. A "The Pines and Swamp, with the island" entry with:
  - the built and merged mesh, caster and triangle counts, before and after the island;
  - the island's reed count;
  - the in-game draw counts;
  - what was and wasn't checked.
- Modify (only if the view changed): `public/places/pines.jpg`, `verify-places.html` (`VIEWS.pines`).

- [ ] **Step 1: Run the full suite and the build.** Expected: all pass.
- [ ] **Step 2: Check it live** with a temporary launch entry rooted at this worktree. Drive the touch joystick and orbit with synthetic `TouchEvent`s, as the Woods check learned to.
  - **Territory map** at 1280 × 720 and the mobile preset:
    - the island's star reads "in the Pines and Swamp", and tapping it does what tapping the Pines does, locked and opened;
    - its small target works on the phone and doesn't steal taps from the Pines, the Moor, the Woods or the River (3 px sampling round its outline).
  - **Walk the truce path onto the bridge and over to the island.**
    - The cat passes between the truce stones with no stop at the shore, and steps onto the island's grass with no hitch.
    - Pushing off either side of the plank stops the cat at its edge.
    - The camera never sits inside a pine or the Old Ash's canopy.
  - **The corner map:**
    - the island is ground in the lake;
    - the diagonal bridge is in the path tone;
    - the N badge is at the top;
    - the cat's dot crosses the bridge.
  - **The island:**
    - foam rings its shore;
    - climb the Old Ash and the Watch Rock, and both mice are in sight from round them;
    - the Meeting Ring's stones can be sat on;
    - ducks round the island, birds in the Old Ash.
  - **Strays:**
    - three strays never set foot on the island or the bridge through a few minutes;
    - a greeted stray following the cat stops at the bridge foot and waits;
    - a Far Call from the island brings none over.
  - **Sound** is the Pines' (a low hush and frogs), on the island too.
  - **`?perf`:** the Pines' draw count standing on the island looking back up the bridge, and on the truce path.
  - No console errors. Reset the viewport to desktop afterwards.
- [ ] **Step 3: Write the VISUAL-PASS entry.**
- [ ] **Step 4: Commit.** `git add docs/VISUAL-PASS.md` (plus `public/places/pines.jpg verify-places.html` if changed), then commit `docs(island): the island's budget and live check`
