# Clan Edition: the Island and its Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the island in the lake, and the one bridge to it, walkable inside the Pines and Swamp walk. The island holds the meeting place, where cats from every clan gather under a truce.

**Architecture:**
- **No new area.** The island and the bridge become new ground inside `src/world/pines.js`'s map. That map already holds both inside its own bounds: the island at (28, 28) and the bridge foot at (10.6, 4.8).
- **Two engine changes make that possible:**
  - **islands:** dry discs cut out of a rect water footprint, in the logic and in the drawn mesh. A disc that crosses the rect's edge becomes a notch in the outline.
  - **strip decks:** an oriented deck, for the diagonal bridge.
- **Island content** lives in a new records module, `src/world/island.js`, in Pines coordinates. `pines.js` builds it into its own area.
- **Cats stay off the island.** The Pines walk's strays and ghosts are kept off the lake, the island and the bridge by a keep-out on the area record. Every position and every target they move to is checked against it.
- **One island everywhere.** The island and the bridge move into one shared module, `src/world/lake.js`:
  - radius 13;
  - the plank lowered to 0.06 m and run 1 m onto the Pines' shore.

  The Woods, the River and the Moor paint the island from it, and the Woods gains the bridge.
- **The territory map's island marker** leads to the Pines.

**Tech Stack:** Vanilla JS, Three.js 0.185, Vite 8, Vitest 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-editions-and-territories-design.md`: Owner's answers 7 and 8, §3, §4 and §8 step 8. The owner's decisions below change two lines there: §3's "its map is small" and §8 step 8's "a small map of its own". The island is part of the Pines walk instead.

Templates:
- `docs/superpowers/plans/2026-10-31-clan-edition-woods.md` and `…-river.md` (merged);
- `…-moor.md` (branch `moor`);
- `…-pines.md` (planned; **this plan builds on it**).

## Owner's decisions (2026-10-31)

1. **Owner's decision: the kid walks over from the Pines.** The bridge is crossed during a Pines walk.
   - **Coordinator's ruling:** the island is **part of the Pines walk, not its own area**. That means:
     - no `island` walk, catalog entry, unlock or walk count;
     - no separate marks or sound;
     - no "Other places" handling.
   - The bridge and the island become walkable inside the Pines map.
2. **Owner's decision: the names stay.**
   - **The Meeting Ring**: six flat sitting stones round the tree.
   - **The Old Ash**: the big tree every shore shows.
   - **The Watch Rock**: a tall rock on the east shore.
3. **Owner's decision: the island grows to 26 m across** (radius 13) in every map. Its centre and the bridge's Pines end stay put, so the bridge's span over water shortens from 20 m to 16.6 m.
4. **Owner's decision: no cats on the island.** No strays, no colony feeding, no patrol. It is the meeting place: finds, golden mice and wildlife only.
   - The Pines walk's strays and ghosts keep off the island and the bridge.
   - `'island'` is not added to `COLONY_AREAS`.
   - The "can't feed here" test examples stay `'island'`. That is now true for good.

**Coordinator's rulings:**
- **Sound.** The island uses the Pines' sound, since it is the same walk.
- **No special moment.** No dusk or full-moon moment.
- **Golden mice.** The island's golden mice belong to the Pines area: `GOLD_MICE.pines` grows from 3 to 6, and `GOLD_TOTAL` from 24 to 27.
- **Strays stay off the water** in the Pines. The keep-out covers the `lake` and `lake-bay` rects as well as the bridge (review I3).
- **The island takes no gifts.** Its scenics never offer Gift Paws' "leave a gift" (review I4).
- **Races and quests take at most one island POI each,** so the bridge stays a choice and never becomes the default (owner question 3). This is done without changing any rng draw count (Task 7).

**Recommended order: fold this into the Pines build**, on the `pines` branch:
1. Run Pines Tasks 1–8.
2. Run this plan's Tasks 1–7.
3. Run this plan's Task 8 in place of Pines Task 9.

**Why fold it in:**
- Main never ships the scenery-only bridge ("the cat stops at the shore"), which this plan would undo days later.
- One iPhone check covers the finished Pines.
- The Pines plan's bridge tests are rewritten once, by Task 5 here, before they ever reach main.

If the Pines merges first anyway, this plan runs unchanged as its own branch right after it.

## Global Constraints

- **No new area, no new save content.** `SAVE_VERSION` stays 4.
  - The new finds (`pines-find-6..10`) and golden mice (`gm-pines-4..6`) are ids the save already stores by shape. `state.golden` is checked by the `gm-<word>-<n>` shape; finds are stored by id.
  - `island` stays in `TERRITORY_AREAS` (`src/colony.js`) as a reserved id that no map uses.
- **The clan spec's §8 invariants hold:**
  - no cat un-tames and no cat is dropped;
  - a v4 save still loads;
  - `COLONY_MAX` (24) and `SOLO_MAX` (12) are unchanged.
- **Nothing reads the edition.** An area builds the same in both editions.
  - `src/world/island.js`, `lake.js` and `src/keepout.js` never contain `/edition/i`, comments included.
  - Nothing on the wire changes.
  - Every new rule is computed the same on both co-walk devices from shared data: the area records, the date seed and the strays' own streams.
- **Legacy never reaches the island.** The island is inside the Pines, which is `edition: 'canon'`. The Pines plan's Legacy guards cover it, and Task 7 re-asserts them.
- **The truce.**
  - There is no rival patrol in the Pines: `rivalForWalk('pines', …)` stays `null`.
  - No cat stands on the island, the bridge or the lake.
  - `ISLAND_KEEP_OUT` is exported so the clan-pick plan can keep any future patrol off it, as it does `TRUCE_PATH`.
- **Our own words only.**
  - Labels never use a word the borrowed-word scan checks: `kit`, `apprentice`, `warrior`, `elder`, `queen`, `medicine cat`, `deputy`, `leader`, `loner`, `rogue`, `kittypet`, `Twolegplace`, `Clan`.
  - Labels never use a book place name either: "Gathering", "Fourtrees", "Great Rock", "Great Oak", "Highrock", "Highstones", "Moonstone", "Moonpool", "Sunningrocks", "tree-bridge" and the like.
- **Sea Legs is a shortcut, never a key.** The island is reached dry, over the bridge deck.
- **Budget.** The Pines keeps the Cozy Neighborhood's ceiling:
  - at most 450 meshes, 380 casters and 60,000 triangles as built;
  - at most 260 meshes and 205 casters merged.

  The island adds about 12 meshes and 10 casters to the Pines' 120–150. Count by `traverse`, with `noCast` meshes counted.
- **Comments and docs** are plain and say why.
- **Commits** use an explicit `git add <files>`. Every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Commands.** Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`. Build: `npm run build`.

### Design choices this plan makes

1. **The diagonal bridge gets an oriented deck, not a rotated frame.**
   - Today's decks are axis-aligned rectangles, but the bridge runs on a bearing of (0.6, 0.8).
   - Rotating a frame is out, for two reasons:
     - the corner map draws an "N" badge and assumes −z is north (`src/ui/minimap.js`);
     - the Pines frame is shared with every neighbour.
   - So decks gain one shape, a strip `{ x1, z1, x2, z2, halfW }`. That costs three pure functions plus the corner map's deck painter.
2. **The island is a hole cut in the lake, not a deck.**
   - A rect footprint gains `islands: [{ x, z, r }]`. In the logic, a point is water only if it is inside the rect **and** outside every island.
   - In the drawing, the water mesh is the rect minus the discs:
     - a disc wholly inside the rect is a hole;
     - a disc that crosses an edge is a notch cut into the outline;
     - a disc wholly outside the rect is ignored.

     The Pines' island crosses both `lake`'s west edge (x 26) and `lake-bay`'s east edge (x 30), so both meshes get a notch.
   - The ground plane shows through, so the island is real ground. Grass, race rings and shore foam all work there.
   - Paw prints don't. The Pines' paw-print rule has `ground: null`, so the island's grass takes no prints, the same as the rest of the Pines' grass.
   - It is not a deck because a deck means "raised boards": carrying refuses to set things down on one (ruling R42), and paw prints skip it.
3. **Strays keep out by exclusion, not an inverted roam disc.**
   - It is cheaper: one pure function, `keepOutPoint(area, x, z)`.
   - It is applied in two places:
     - to every position a stray or ghost is given (spawn, recoil, scurry, and the end of each frame's move);
     - to every target and `home` it is sent towards (wander, Far Call, the toy).
   - No rng draw is added anywhere.
   - Other areas have no keep-out, so their cats are byte-for-byte unchanged.
4. **The territory map's island marker leads to the Pines.**
   - The marker becomes part of the Pines' tap target (`data-dr-place="pines"`), with its own small line: "in the Pines and Swamp".
   - Tapping the star is the obvious thing to do, and it should go where the island actually is.
   - Before the Pines is open, the marker reads like the Pines: locked, with the Pines' line.

### Checked against the code: does the Pines map handle it?

There are no blockers.
- **Bounds.** The Pines' bounds are ±50. The island spans x 15..41 and z 15..41. The deck runs from (20.56, 18.08) to (10.0, 4.0), all inside.
- **Corner map.** It gains islands and strip decks in Task 1. It is built from `areaData` once per walk, so the island shows as land and the bridge in the path tone.
- **Camera.**
  - `camzoom.cameraPullScale` limits the chase camera to the bounds plus a margin. The island's east rim is at x 41, so the camera 4.5 m behind a cat there sits at x 45.5, inside 50.
  - The view-following shadow camera needs nothing.
  - The Old Ash's canopy bottom is at about 3.1 m, above the camera's 2.2 m.
- **Contact shadows.** The Meeting Ring is one merged mesh 12 m across, over `contactshadows.js`'s `MAX_SPAN` of 6.5, so it gets no contact shadow. That is fine for 0.4 m stones, and the reason is written in a comment beside it.
- **Things that would fill the island once it is dry ground:**
  - the Pines' seeded pines, ferns and toadstools need one more fit rule, "not on the island" (Task 5). Every candidate already draws all its numbers whether kept or not, so the Pines' other counts don't move. If one does move, the test records why.
  - Grass will grow on the island, at the Pines' pine-floor density. That is wanted.
- **Deck-distance rules.** The Pines' fit rules measure distance to its decks with `rectDist`. A strip deck has no `minX`, so `rectDist` on it would return NaN.
  - The Pines' `DECKS` list therefore stays exactly `[LOG_BRIDGE, STEPPING_STONES]`, the two mire decks, named explicitly.
  - The bridge gets its own segment-distance rule.
  - No fit rule may iterate over the waters' decks (review I7).

### Dependencies

- **From the Pines plan:**
  - from `pines.js`: `PINES_WATERS`, `LAKE`, `LAKE_BAY`, `DECKS`, `BRIDGE_FOOT`, `PINES_ISLAND`, `TRUCE_PATH`, `PINES_KEEP_CLEAR`, `pinesTrees`, `pinesUndergrowth` and `pinesReeds`;
  - the truce stones' colliders at (9.0, 3.6) and (12.2, 3.6);
  - `test/pines.test.js`'s helpers.
- **From the Moor plan:** `ISLAND_BRIDGE_WOODS` and `MOOR_ISLAND`. Task 4 moves the bridge into `lake.js`.
- **Test values once the Pines has merged:**
  - `GOLD_TOTAL` goes from 24 to **27**;
  - `GOLD_MICE.pines` holds **6**;
  - the territory map has **6** `data-dr-place` targets: Twolegplace, the Woods, the River, the Moor, the Pines, and the island leading to the Pines;
  - `NO_LEGENDARY_YET` and `COLONY_AREAS` are unchanged.
- **If the Moor merges after this plan,** `lake.js` defines `ISLAND_BRIDGE_WOODS` with Task 4's numbers. The Moor then imports it and paints with `addIslandView`.

### Lessons carried in, as rules

1. **Content comes before scenery.** The island's records join `PINES_KEEP_CLEAR` (Task 6) before the reeds are placed.
2. **Every goal can be finished.** The island adds no tippables, boxes or villagers, and the Pines' 400-seed goal test runs unchanged.
3. **Canopy clearance from a path** is `PATH_W / 2 + canopy reach + 0.5`. For the bridge, treated as a 2 m path:
   - the Old Ash's canopy reaches `1.6 × 2.6 = 4.16` m, so it keeps 5.66 m from the bridge's centreline (it stands 12.4 m away);
   - every Pines pine keeps `1 + 1.3 × scale + 0.5` from it.
4. **A deck is what the kids see, at least 1.5 m wide, proven by raycast.** The deck is 1.8 m wide on a 2.0 m plank. The plank runs the deck's whole length, onto land at both ends, the way the Woods' log runs onto its banks.
5. **A flood fill with the real `isWalkableAt`** reaches every island find from the Pines' spawn. Without the bridge deck, none of the island is reached.
6. **Golden mice are in sight from the chase camera.**
7. **Budget by traversal**, with `noCast` meshes counted.
8. **`nearestDry` is tested where waters overlap:** the bay over the lake on both sides of the island, the rim, and the bridge's sides.
9. **Edges agree with every neighbour, asserted in tests:** the island, the bridge and its foot (Task 4).

## Review Focus

1. **A stray reaching the island, the bridge or the lake, by any route:**
   - a toy thrown onto the island, which a playful stray runs after;
   - a shy stray scurrying from a fast approach on the shore;
   - a Far Call from the island;
   - a cross cat's recoil towards the water;
   - a stray spawned inside the lake (0.7 × the bounds reaches x 35, z 35);
   - a colony cat's stored spot inside the keep-out.

   In every case the stray ends outside the keep-out on every frame. Every other area's cats stay byte-for-byte where they are. Tests in Task 3 and Task 5.
2. **The kid walks the truce path onto the bridge and off its far end onto the island.**
   - There is no wet gap at either end, and the cat passes between the truce stones.
   - Pushing off either side of the plank stops the cat at its edge.
   - **Fixed stick**, using `test/waterblock.test.js`'s `drive` on the built Pines. No case puts the cat in water on any frame.

     | Start | Stick held | For | Expected |
     |---|---|---|---|
     | `(10.6, 2.5)` | due south | 6 s | onto the deck, sliding along its edge toward the island; ends on the deck or the island |
     | the foot | along the bridge, `(0.6, 0.8)` | 8 s | ends on the island |
     | the deck's middle | due east | 3 s | stops at the deck's edge and holds still (within 1 cm over the last second) |
     | the island landing | back up the bridge, `(-0.6, -0.8)` | 8 s | ends on land north of the shore, between the truce stones |

   Tests in Task 5.
3. **A yarn ball, scent treat or race ring landing in the water** beside the bridge, just off the island, or where the bay meets the lake. `nearestDry` lands it on the island or the deck, within 5 m. Tests in Tasks 1 and 5.
4. **Pines scenery growing on the island once it is dry.** No pine, fern or toadstool stands on the island, and the Pines' other scenery counts are unchanged, or the test records why one moved. Tests in Task 5.
5. **Tapping the island's star on the territory map.**
   - Before the Pines is open, it does what tapping the Pines does: nothing is bought, and the Pines' locked line shows.
   - After the Pines opens, it selects the Pines.
   - Legacy has no territory map at all.

   Tests in Task 7.

## Owner steps

These are for the owner (the parent), not the implementer.

1. **Update both devices** before either kid walks the Pines with the island. This is the same step as the Pines plan's, and nothing new is stored.
2. **No SQL.**
3. **Check the Pines on the iPhone 18** after Task 8, island included: 60 fps on HIGH, standing on the island looking back up the bridge.
4. **Show the playtester the island.**

## What this plan defers

- **A gathering night,** with the kids' colony cats coming to the Meeting Ring at dusk or at a full moon. It is ruled out for now: it would need colony cats shown outside their own area.
- **An island-only legendary cat or patrol.** Never, under decision 4.
- **Known horizon-only mismatches.** Both are in fog and left as they are:
  - the Woods' and the River's `lake` rects run past the Pines' shore, beyond their own bounds;
  - the neighbours paint the island as a 1.4 m dome, while it walks flat.
- **The foam on `lake`'s west shore.** In the Pines, `lake`'s shores become `['minZ']` only (Task 5). Its `minX` foam line at x 26 ran up through the bay's water and into the island's foam ring.
  - The cost: about 6 m of real lake shore inside the bounds (x 26, z 44..50, by the pocket at (25.6, 44.4)) loses its foam.
  - The bay's own south-shore foam is kept.

## Files

| File | Responsibility |
|---|---|
| `src/world/builder.js` | `islands` on rect footprints (`waterGap`, `nearestDry`); strip decks (`onDeck`, `nearestDry`); `plankBridge` |
| `src/render/water.js` | `rectMinusDiscs`; `shoreDepth` and `createWater` for a rect with islands |
| `src/ui/minimap.js` | Islands, filled like the land, and strip decks on the corner map |
| `src/keepout.js` (new) | `keepOutPoint`: where a walk's cats never stand |
| `src/straycats.js`, `src/ghosts.js` | Apply it to every position, target and `home` |
| `src/world/lake.js` (new) | The frames, the island and the bridge, defined once; `islandBridgePlank`, `addIslandView` |
| `src/world/woods.js`, `river.js`, `moor.js` | Paint the island and the bridge with `addIslandView` |
| `src/world/pines.js` | The island cut out of the lake; the walkable bridge; scenery kept off the island; the island's content built in; `keepOut` |
| `src/world/island.js` (new) | The island's records and meshes, in Pines coordinates |
| `src/goldmice.js` | `gm-pines-4..6` |
| `src/race.js` | `raceCourse` takes at most one POI per `group` |
| `src/game/interactions.js` | `openScenicNear` skips a scenic marked `gifts: false` |
| `src/territories.js`, `src/ui/territorymap.js` | The island's star leads to the Pines |
| `docs/VISUAL-PASS.md`, `public/places/pines.jpg` | The written check; the picture is retaken if the view changes |

## The island in numbers

All in **Pines coordinates**: metres, with x east and z south (north is −z). A Woods point (x, z) is the Pines point (x + 100, z + 100).

**`lake.js` frames:** `FRAMES = { woods: [0, 0], river: [100, 0], moor: [0, 100], pines: [100, 100] }`.

### The shared island and bridge

| Thing | Value |
|---|---|
| `ISLAND_WOODS` (lake.js) | `{ x: -72, z: -72, r: 13, rise: 1.4, treeScale: 2.6 }` |
| `ISLAND_BRIDGE_WOODS` (lake.js) | `[[-79.44, -81.92], [-89.4, -95.2]]`. The first point is 0.6 m onto the island. The second is the Pines' shore foot, 0.2 m onto land (unchanged). The span is 16.6 m long, running (−0.6, −0.8) from the island |
| `BRIDGE_PLANK` (lake.js) | `{ w: 2, thick: 0.12, y: 0.06, landRun: 1.0 }`. The plank runs from the island end past the foot by `landRun` along the same line, onto the Pines' land: 17.6 m in all. Every shore draws it this way |
| `PINES_ISLAND` | `fromWoodsDisc('pines')` = `{ x: 28, z: 28, r: 13, rise: 1.4 }` |
| `ISLAND_LAND` | `{ x: 28, z: 28, r: 13 }` |
| `BRIDGE_DECK` | `{ x1: 20.56, z1: 18.08, x2: 10.0, z2: 4.0, halfW: 0.9 }`. It covers the plank's whole length, 0.1 m in from each side. See "Why the deck and plank run 1 m onto land" below |
| Pines `LAKE`, `LAKE_BAY` | Same boxes as before, plus `islands: [ISLAND_LAND]` on both. `LAKE_BAY.decks = [BRIDGE_DECK]`. `LAKE`'s shores become `['minZ']` |
| `ISLAND_KEEP_OUT` | `{ rects: [{ minX: 26, maxX: 86, minZ: 8, maxZ: 66 }, { minX: 0, maxX: 30, minZ: 5, maxZ: 44 }], capsules: [{ x1: 20.56, z1: 18.08, x2: 10.0, z2: 4.0, r: 1.5 }], margin: 0.6 }`. The rects are the lake and the bay as solid boxes, so the island inside them is covered too. The capsule is the bridge, deck included, plus 0.6 m each side. The Pines' area record carries it as `keepOut` |

**Why the deck and plank run 1 m onto land.** The cat is held 0.35 m clear of water (`WATER_MARGIN`), and the foot is only 0.2 m onto land. A deck ending at the foot would leave a band at the shore the cat can't cross. The extra metre is over land, so it adds no walkable water, and the plank covers it so the deck is still what the kids see. The deck lies wholly in `lake-bay` (x < 26).

### The island's landmarks

| Thing | Value |
|---|---|
| The Old Ash | `b.tree(28, 28, 2.6, { wind })` at y 0, named `oldAsh`, collider r 1.0 |
| The Old Ash's limb | A child of the tree, in its scaled frame (s = 2.6): `CylinderGeometry(0.07/s, 0.12/s, 1.6/s, 6)`, `rotation.x = π/2`, local `(0, 2.0/s, 1.4/s)`. It reaches 0.6–2.2 m south of the trunk at y 2.0. Colour `0x7a5230`, `'bark'` |
| Old Ash chain | Mossy boulder `(28, 31.2)` y 0.72 `'stone'` (collider r 0.7, named `ashBoulder`) → limb perch `(28, 29.5)` y 2.1 `'tree'`, label `'old ash lookout'`, vantage |
| The Meeting Ring (`MEETING_STONES`) | Six stones at r 6 round the Old Ash: `(33.2, 31)`, `(28, 34)`, `(22.8, 31)`, `(22.8, 25)`, `(28, 22)`, `(33.2, 25)`. Each is `CylinderGeometry(0.55, 0.65, 0.4, 9)` at y 0.2, colour `0x9a9488`, `'cobble'`, with collider r 0.6 and a perch at y 0.4 `'stone'`. All six are merged into one mesh, `meetingRing`. The bridge comes in through the gap between `(22.8, 25)` and `(28, 22)` |
| Watch Rock chain | Low rock `(37, 29)` y 0.72 `'stone'` (the Woods' mossy boulder shape, collider r 0.7, named `watchRockStep`) → `CylinderGeometry(0.75, 0.9, 1.9, 7)` at `(38, 28)`, colour `0x8e8c88`, `'cobble'`, named `watchRock`, collider r 0.9, perch y 1.9 `'stone'`, label `'watch rock'`, vantage |

### What's appended to the Pines' lists

| Thing | Value |
|---|---|
| Island POIs (8, each `group: 'island'`, after the Pines' 9) | `(34.7, 34.7)`, `(25.5, 38)`, `(18, 28)`, `(19.8, 23.3)`, `(28, 18)`, `(34.7, 21.3)`, `(25.5, 24.2)`, and `(15.76, 11.68)` on the bridge, 8 m from the island end. Appended, so `secrets.js`'s indices into the first nine don't move |
| Island scenics (3, each `gifts: false`) | `{ id: 'bridge-landing', x: 22, z: 20.5, label: 'the end of the bridge' }`; `{ id: 'meeting-ring', x: 30.5, z: 25.5, label: 'the meeting ring under the old ash' }`; `{ id: 'lake-view', x: 35.5, z: 36, label: 'the lake, looking over to the Woods' }` |
| Island finds (5) | `pines-find-6 (24.5, 35.5) 'a smooth white pebble'`; `pines-find-7 (33, 18.5) 'a grey goose feather'`; `pines-find-8 (17.5, 31) 'a snail shell at the water's edge'`; `pines-find-9 (12.76, 7.68) 'a pine cone dropped on the planks'` (on the deck, 13 m out); `pines-find-10 (28, 22, y 0.4) 'a bright beetle wing on a meeting stone'` |
| Island golden mice (added to `GOLD_MICE.pines`) | `gm-pines-4 (28, 29.8, y 2.1)` out on the Old Ash's limb; `gm-pines-5 (38, 28, y 1.9)` on top of the Watch Rock; `gm-pines-6 (21.5, 35.2, y 0)` hidden among bushes at `(22, 33.5)`, `(20, 35)` and `(22.5, 36.5)`, which have no colliders |
| Island puddle | `{ x: 19.5, z: 26.5, r: 0.8 }` |
| Island critters (6) | Birds at `(26.5, 28)` and `(29.5, 28)`, either side of the Old Ash's trunk; butterflies at `(31, 32)`, `(25, 32)` and `(30, 24)`; a mouse running `(24, 37.5) → (27, 39.5)` |
| Ducks | The Pines' ducks already paddle round the island. One Pines duck moves from `(36, 16)` to `(37, 15)`, 15.8 m from the centre, so none sits within 2 m of the bigger rim |
| Island moment | `{ id: 'duck-ring', type: 'duck', label: 'ducks paddling past the island', x: 31, z: 17.6, from: { x: 38, z: 15 } }`. The cat watches from the north shore, 10.8 m from the centre, on dry ground |
| Island reeds | `islandReeds()`: one clump every 2.5 m round r 12.6 from (28, 28). Each is kept ≥ 3 m from every island record and ≥ 2 m from the deck's centreline. Expect 18–30. They are appended to `pinesReeds()`'s output and drawn in the same merged `reeds` mesh |

**Checked by hand:**
- **POIs.** Every island POI is ≥ 1.6 m plus the collider's radius from every collider, and ≥ 2.5 m inside the rim. The tightest is `(25.5, 24.2)`, 2.82 m from the stone at `(22.8, 25)`.
- **Gaps.** Every gap between colliders is wider than a cat:
  - boulder to trunk, 1.5 m;
  - boulder to the south stone, 1.5 m;
  - Watch Rock to the waterline, 2.1 m.

  The Watch Rock's two colliders overlap, so there is no gap there to check.
- **Truce stones.** They are 2.4 m apart inside, and the deck's foot lies between them.
- **Ducks.** The Pines' ducks at `(34, 14)`, `(37, 15)` and `(38, 13)` are 15.2, 15.8 and 18.0 m from the island's centre, all on water.
- **The Pines' `nearestDry` spots** `[28, 6.5]`, `[30.4, 7.6]` and `[25.6, 44.4]` are all clear of the r 13 island.

---

### Task 1: Dry land in water: islands in a rect footprint, and strip decks

**Files:**
- Modify `src/world/builder.js`:
  - the "WATER FOOTPRINTS" header block: two lines describing `islands` and strip decks;
  - `waterGap`, `onDeck`, `pushOutOf` and `clampInto`.
- Modify `src/ui/minimap.js`: `buildMapLayer` and the water painter.
- Test: `test/waterblock.test.js`, `test/water.test.js` (the shape checks in the generic block), `test/minimap.test.js`

**Interfaces:**
- **Produces, for rect footprints:** an optional `islands: Array<{ x, z, r }>`.
  - `waterGap(w, x, z)` = `max(rectGap, max_i(r_i − hypot(x − x_i, z − z_i)))`.
  - `pushOutOf` adds one candidate per island: the point at `r_i − margin` from the island's centre, along (x, z) − centre. At the dead centre it pushes +x.
  - `islands` on a circle footprint is not supported. `waterGap` ignores it, and a comment says so.
- **Produces, for decks:** a deck is either today's rect, or a strip `{ x1, z1, x2, z2, halfW }`. They are told apart by `Number.isFinite(d.x1)`.
  - `onDeck`: let u be the unit vector from end 1 to end 2, `len` the length, and n = (−u_z, u_x). The point is on the strip when `0 ≤ (p − a)·u ≤ len` and `|(p − a)·n| ≤ halfW`.
  - `clampInto` for a strip clamps:
    - t to `[margin, len − margin]`, or `len / 2` if `len ≤ 2 × margin`;
    - the side offset to `±(halfW − margin)`, or 0 if `halfW ≤ margin`.

    It returns `a + t u + s n`.
- **Produces, for the corner map:** `buildMapLayer` keeps `islands` on rect waters and copies a strip deck as `{ kind: 'strip', x1, z1, x2, z2, halfW }`.
  - The painter fills each island exactly as the map's land is filled (the layer's `ground` colour), after all the water and before the decks.
  - It paints a strip deck as a rotated rectangle in the path tone.

- [ ] **Step 1: Write the failing tests** in `test/waterblock.test.js`. They use this footprint: `W = { id: 'w', kind: 'rect', minX: -20, maxX: 20, minZ: -20, maxZ: 20, islands: [{ x: 0, z: 0, r: 5 }], decks: [{ x1: -3, z1: -4, x2: -12, z2: -16, halfW: 0.9 }] }`.
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
    - from 1.5 m to the side of the strip's middle, the result is on the deck, ≤ 0.3 m from its centreline, and within 1.2 m of the query point;
    - a dry point comes back unchanged.
  - `onDeck still reads a rect deck exactly as before`, using the Seaside pier with its unchanged values.
- [ ] Extend `test/water.test.js`'s generic block. `declares at least one well-formed water footprint` also accepts:
  - `islands` on a rect, each with finite `x`, `z` and `r > 0`;
  - a strip deck with finite ends, a length > 0 and `halfW > 0`.
- [ ] Add to `test/minimap.test.js`:
  - `buildMapLayer keeps a rect water's islands and a strip deck`.
  - `paints an island like the land, over its water`. With the deck test's canvas stub, a fill in the ground colour comes after the water fill and before the path-tone fill.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run test/waterblock.test.js test/water.test.js test/minimap.test.js`
- [ ] **Step 3: Implement.** Give each new branch a short comment saying why:
  - an island is a hole of ground, not a deck, because a deck is raised boards (ruling R42);
  - a strip is how a diagonal bridge stays one deck.
- [ ] **Step 4: Run the full suite.** Every existing area must build exactly as before.
- [ ] **Step 5: Commit.** `git add src/world/builder.js src/ui/minimap.js test/waterblock.test.js test/water.test.js test/minimap.test.js`, then commit `feat(water): islands in a rect footprint, and strip decks for a diagonal bridge`

### Task 2: Draw a lake with an island in it, holes and notches both

**Files:**
- Modify `src/render/water.js`: `rectMinusDiscs`, `shoreDepth` and `createWater`.
- Test: `test/waterfx.test.js`, and `test/water.test.js` (its "draws that footprint from the declaration" case)

**Interfaces:**
- Consumes: Task 1's `islands`.
- Produces **`rectMinusDiscs(box, discs, segments) -> { outline: Array<[x, z]>, holes: Array<{ x, z, r }> }`**, a pure function in world x/z. It walks the rect's perimeter counter-clockwise from `(minX, minZ)`:
  - **A disc wholly inside the rect** (each edge ≥ 1e-6 beyond its rim) goes to `holes`.
  - **A disc wholly outside** is dropped.
  - **A disc crossing the perimeter** turns into a notch:
    1. Find where the circle crosses the perimeter.
    2. Replace the stretch of perimeter inside the disc with the disc's arc that lies inside the rect, sampled every `2π / segments`, running from the entry crossing to the exit crossing.
  - **It throws** for:
    - a disc that crosses the perimeter more than twice (it would cut the rect apart or swallow a corner pair);
    - two discs that overlap each other.

    No map needs either case, and a comment says so.

  A disc that swallows exactly one corner crosses twice, on two different edges, and is a valid notch. The arc then replaces the corner.
- Produces **`shoreDepth`** for a rect with islands: the minimum of today's value over `shores` and `hypot − r_i` over each island. An island's rim is always a shore.
- Produces **`createWater`** for a rect with islands. The geometry is a `THREE.ShapeGeometry(shape, segments)`, so `segments` is passed as the shape's `curveSegments`:
  - the shape's outline is `rectMinusDiscs(...).outline`, moved to the mesh's local frame: `(x − cx, −(z − cz))`, because local y becomes world −z under the flat rotation;
  - each entry in `holes` is a `Path` with `absarc` round the moved centre;
  - the `uv` attribute is rewritten to the PlaneGeometry's mapping, `((x + w/2)/w, (y + h/2)/h)`, so the baked ramp and the normal map line up exactly as they do on a plain rect.
- Tiers, material, update and dispose are unchanged.

- [ ] **Step 1: Write the failing tests** in `test/waterfx.test.js`:
  - `rectMinusDiscs makes a hole of an inside disc and a notch of an edge-crossing one`:
    - `rectMinusDiscs({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, [{ x: 0, z: 0, r: 5 }], 64)` has one hole and a four-point outline;
    - with the disc at (18, 0) instead, it has no holes, and the outline has the rect's four corners plus an arc whose every point is at r 5 from (18, 0) and has x ≤ 20;
    - a disc at (0, 0) with r 25 throws;
    - two overlapping discs throw.
  - `the Pines' lake and bay are drawn with the island notched out of both`:

```js
const islands = [{ x: 28, z: 28, r: 13 }];
const lake = { id: 'lake', kind: 'rect', minX: 26, maxX: 86, minZ: 8, maxZ: 66, islands };
const bay = { id: 'lake-bay', kind: 'rect', minX: 0, maxX: 30, minZ: 5, maxZ: 44, islands };
for (const w of [lake, bay]) {
  const fx = createWater(w, { quality: 'low' });
  const g = fx.mesh.geometry;
  expect(g.type).toBe('ShapeGeometry');
  // area of the drawn triangles vs rect minus (disc ∩ rect), the latter by a 0.05 m sample grid
  expect(Math.abs(triangleArea(g) - expectedArea(w)) / expectedArea(w)).toBeLessThan(0.005);
  fx.mesh.updateMatrixWorld(true);
  for (const [x, z] of [[28, 28], [27, 20], [29, 36], [17, 28], [39, 28]]) {
    if (x < w.minX || x > w.maxX) continue;
    expect(rayDownHits(fx.mesh, x, z), `${w.id} at (${x}, ${z})`).toBe(false);
  }
  for (const [x, z] of [[w.minX + 1, w.minZ + 1], [w.maxX - 1, w.maxZ - 1]]) {
    expect(rayDownHits(fx.mesh, x, z)).toBe(true);
  }
  fx.dispose();
}
```

  - `shoreDepth is 0 on an island's rim and grows away from it`: 0 at (5, 0) and 1 at (6, 0) for an inside disc. With `shores: []`, the rect's own edges don't count.
  - `a holed plane's uv matches a plain plane's` at the rect's corners.
  - `the low tier draws the same notched geometry`.
- [ ] Extend `test/water.test.js`'s `draws that footprint from the declaration` case. A footprint with `islands` matches a `ShapeGeometry` mesh whose bounding box is the rect's size and is centred on the rect. Its `parameters.shapes.holes.length` equals the number of islands wholly inside the rect.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Comment two things beside the code:
  - by `rectMinusDiscs`: why a crossing disc must be a notch, not a hole. ShapeGeometry's triangulator assumes every hole lies inside the outline, and a hole that crosses it drops or mis-fills triangles.
  - by the shape: why it is the declaration verbatim with the ground showing through, rather than a ground-coloured disc laid over the water.
- [ ] **Step 4: Run the full suite.**
- [ ] **Step 5: Commit.** `git add src/render/water.js test/waterfx.test.js test/water.test.js`, then commit `feat(water): draw a rect of water with round islands cut out of it, as holes or notches`

### Task 3: A walk's cats keep out of places they mustn't stand

**Files:**
- Create `src/keepout.js`.
- Modify `src/straycats.js`. Pass every value below through `keepOutPoint`, drawing nothing extra:
  - **positions:**
    - the cast's placement (~443), which also sets `home`;
    - the colony cat's clamp (~441);
    - the legendary extra (~508), which also sets `home`;
    - `turnHostile`'s recoil, after its bounds clamp (~614);
    - the shy scurry, after its bounds clamp and before its `continue` (~729);
    - the end of each stray's per-frame move, once;
  - **targets:**
    - the Far Call target (~673);
    - the toy target (~744);
    - the wander target from `home` (~781).
- Modify `src/ghosts.js`:
  - placement (~100), which also sets `home`;
  - the wander target (~192);
  - the end of each ghost's per-frame move.
- Test: `test/keepout.test.js` (new), `test/straycats.test.js`, `test/ghosts.test.js`, and `test/cowalkstreams.test.js` (which must pass unchanged)

**Interfaces:**
- Produces **`keepOutPoint(area, x, z) -> { x, z }`** from `src/keepout.js`. It is pure, with no THREE.
  - `area.keepOut` is optional: `{ rects: Array<{ minX, maxX, minZ, maxZ }>, capsules: Array<{ x1, z1, x2, z2, r }>, margin }`.
  - A point is **inside** if it is within `margin` of a rect, or within `r` of a capsule's segment.
  - **It settles like `nearestDry`.** Up to four passes; in each, take the first shape the point is inside and move the point to the nearest candidate exit that lies inside `area.bounds` inset by 0.5:
    - for a rect, the four edges pushed out by `margin`;
    - for a capsule, straight out from the nearest point on its segment (+x when exactly on it).

    If the point is still inside something after that, a ring search runs: rings 0.25 m apart out to 30 m, 32 angles each starting due east, sampling only points inside the inset bounds. It returns the first point outside every shape.
  - With no `keepOut`, the point comes back as it was.
- Draws no rng, so `strayStream`, the wander streams and the co-walk seeds never shift. Both co-walkers compute the same push.

- [ ] **Step 1: Write the failing tests.** They use **literal** shapes, because the Pines' `ISLAND_KEEP_OUT` doesn't exist until Task 5. Define `KO = { rects: [{ minX: 26, maxX: 86, minZ: 8, maxZ: 66 }, { minX: 0, maxX: 30, minZ: 5, maxZ: 44 }], capsules: [{ x1: 20.56, z1: 18.08, x2: 10.0, z2: 4.0, r: 1.5 }], margin: 0.6 }` and `AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, keepOut: KO }`.
  - `keepout.test.js`:
    - `no keep-out leaves every point alone`.
    - `a point in the lake goes to a shore inside the bounds, never out past them`:
      - (40, 40) ends outside both rects (by their margin) and inside the inset bounds. Its first exit west lands in the bay, so this also exercises the settle passes.
      - (45, 45)'s nearest exits (x 86.6, z 66.6) are out of bounds, so it goes west to (25.4, 45), which is clear of the bay.
    - `a point on the bridge's land end goes out sideways`.
    - `a point where the bay's and the lake's margins meet the capsule ends outside all three`.
    - `a point outside every shape is unchanged`.
    - `the same input always gives the same output`.
  - `straycats.test.js`:
    - `strays on an area with a keep-out never stand in it`. Use `AREA` with 3 strays over seeds 1..200 from `strayStream`. At spawn, and through 120 s of `update` at 1/30 s, every stray is outside every shape. During the run the cat is parked on the island, then on the bridge, then at the bridge foot. The run includes:
      - a playful stray chasing a toy thrown to (28, 28);
      - a shy stray scurrying from a fast approach at the shore, (24, 2);
      - a cross cat's recoil from a cat standing between it and the bay;
      - a Far Call from (28, 30).
    - `a colony cat stored inside the keep-out is moved out of it, and so is its home`.
    - `a wander target drawn from home never lands inside the keep-out`.
    - `without a keep-out, the Woods' strays stand exactly where they did`. Positions for seeds 1..20 equal a snapshot computed in the test with the old formula.
  - `ghosts.test.js`: `ghosts on an area with a keep-out spawn and wander outside it`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** One comment at the top of `keepout.js` says why it exists. The meeting place is under a truce with no cats on it (owner's decision 4), and in the Pines strays stay off the lake. Strays only respect the bounds, by design (see `player.js`'s note), so the area names the places they never go.
- [ ] **Step 4: Run the full suite**, `cowalkstreams` included.
- [ ] **Step 5: Commit.** `git add src/keepout.js src/straycats.js src/ghosts.js test/keepout.test.js test/straycats.test.js test/ghosts.test.js`, then commit `feat(strays): an area can keep its strays and ghosts out of places`

### Task 4: One island, one bridge, seen the same from every shore

**Files:**
- Create `src/world/lake.js`.
- Modify `src/world/builder.js`: add `plankBridge(x1, z1, x2, z2, w, y, thick) -> THREE.Mesh`. It is a `BoxGeometry(w, thick, len)` centred between the ends at `y`, with `rotation.y = atan2(x2 − x1, z2 − z1)`, colour `0x8a6a44`, and the `'wood'` surface at the Seaside pier's tile scale.
- Modify `src/world/woods.js`, `river.js` and `moor.js`:
  - each replaces its own mound, tree and plank code with `addIslandView(scene, '<id>', { wind })`;
  - `RIVER_ISLAND` and `MOOR_ISLAND` become `fromWoodsDisc('<id>')`;
  - `moor.js` no longer declares `ISLAND_BRIDGE_WOODS`.
- Modify `src/world/pines.js`:
  - import `ISLAND_BRIDGE_WOODS` from `./lake.js`;
  - `PINES_ISLAND = fromWoodsDisc('pines')`;
  - `BRIDGE_FOOT = fromWoods('pines', …ISLAND_BRIDGE_WOODS[1])`;
  - the plank becomes `islandBridgePlank('pines')`.

  The Pines keeps its mound and raised tree in this task. Task 5 replaces them.
- Test: `test/lake.test.js` (new).
- Rewrite the island tests in `test/woods.test.js`, `test/river.test.js`, `test/moor.test.js` and `test/pines.test.js` wherever they hard-code the old numbers:
  - r 9;
  - the old rim end `(-77.4, -79.2)`;
  - y 0.3;
  - a plank length of 20.

  Each now reads `ISLAND_WOODS`, `ISLAND_BRIDGE_WOODS` and `BRIDGE_PLANK`. The plank's shore end moves 1 m onto land, which still satisfies the River's "north end past the far lake's north edge" (−96.0 ≤ −95) and the Moor's "north-west end at `z <= LAKE_FAR.minZ`" (4.0 ≤ 4.8).
- Update `test/budget.test.js`: the Woods gains one mesh.

**Interfaces:**
- Produces, frozen, from `src/world/lake.js`:
  - `FRAMES`;
  - `fromWoods(areaId, x, z) -> { x, z }`;
  - `fromWoodsDisc(areaId) -> { x, z, r, rise }`;
  - `ISLAND_WOODS`, `ISLAND_BRIDGE_WOODS`, `BRIDGE_PLANK`;
  - `bridgeEnds(areaId) -> [{ x, z }, { x, z }]`: the island end, and the land end (the foot plus `landRun`);
  - `islandBridgePlank(areaId) -> THREE.Mesh`: `plankBridge` from the land end to the island end, named `islandBridge`;
  - `addIslandView(scene, areaId, { wind }) -> void`, which adds three top-level scene children:
    - the mound, a `SphereGeometry(r, 24, 8)` squashed to `rise`, colour `0x6a9a50`, `'grass'`;
    - `b.tree(x, z, treeScale, { wind })` raised to `rise − 0.2`;
    - `islandBridgePlank(areaId)`.

    They are top-level so the shipped "something stands at the island's centre" tests still find them.

- [ ] **Step 1: Write the failing tests** in `test/lake.test.js`:

```js
it('the bridge runs from 0.6 m onto the island to the Pines shore, and its plank 1 m on onto land', () => {
  const [[ix, iz], [fx, fz]] = ISLAND_BRIDGE_WOODS;
  const I = ISLAND_WOODS;
  expect(Math.hypot(ix - I.x, iz - I.z)).toBeCloseTo(I.r - 0.6, 6);
  const foot = fromWoods('pines', fx, fz);
  expect(foot.x).toBeCloseTo(10.6, 9);
  expect(foot.z).toBeCloseTo(4.8, 9);
  const [, land] = bridgeEnds('pines');
  expect(land.x).toBeCloseTo(10.0, 9);
  expect(land.z).toBeCloseTo(4.0, 9);
  // the bridge points the same way on the playtester's map as in the world
  const [[bx0, by0], [bx1, by1]] = BRIDGE; // src/territories.js: shore -> island, board y is south
  const board = Math.atan2(bx1 - bx0, by1 - by0), world = Math.atan2(ix - fx, iz - fz);
  expect(Math.abs(board - world)).toBeLessThan(Math.PI / 180);
});

for (const [id, build] of Object.entries({ woods: buildWoods, river: buildRiver, moor: buildMoor, pines: buildPines })) {
  it(`${id} draws the one bridge`, () => {
    const scene = new THREE.Scene();
    build(scene);
    const plank = scene.getObjectByName('islandBridge');
    const [a, b] = bridgeEnds(id);
    expect(plank.position.x).toBeCloseTo((a.x + b.x) / 2, 6);
    expect(plank.position.z).toBeCloseTo((a.z + b.z) / 2, 6);
    expect(plank.position.y).toBeCloseTo(BRIDGE_PLANK.y, 6);
    expect(plank.geometry.parameters.depth).toBeCloseTo(Math.hypot(a.x - b.x, a.z - b.z), 6);
    expect(plank.geometry.parameters.width).toBe(BRIDGE_PLANK.w);
    expect(plank.rotation.y).toBeCloseTo(Math.atan2(a.x - b.x, a.z - b.z), 6);
  });
}
```

  - `the Woods, the River and the Moor paint the one island out of reach`. For each of the three:
    - a tree group stands at `fromWoodsDisc(id)` with scale `treeScale`;
    - the centre is outside `bounds`;
    - 16 rim points at r 13 are `inWater` of that map's waters;
    - no collider or perch is within `r + 2` of the centre;
    - the plank's world box doesn't touch the bounds.

    Together these prove r 13 still fits each neighbour's lake.
  - `the neighbours' island records are derived, not typed`: `RIVER_ISLAND`, `MOOR_ISLAND` and `PINES_ISLAND` deep-equal `fromWoodsDisc` for their ids.
  - `nothing in lake.js reads the edition`.
- [ ] Rewrite the literals in the four neighbour test files listed under Files. Every other assertion in them stays.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** A comment at the top of `lake.js` says why the island and the bridge live there: they are one place seen from four maps, and `test/lake.test.js` keeps them in step.
- [ ] **Step 4: Run the full suite.**
- [ ] **Step 5: Commit.** `git add src/world/lake.js src/world/builder.js src/world/woods.js src/world/river.js src/world/moor.js src/world/pines.js test/lake.test.js test/woods.test.js test/river.test.js test/moor.test.js test/pines.test.js test/budget.test.js`, then commit `feat(lake): one island and one bridge, painted the same from every shore`

### Task 5: The Pines: the island becomes ground and the bridge becomes walkable

**Files:**
- Modify `src/world/pines.js`:
  - **The lake.** `LAKE` and `LAKE_BAY` gain `islands: [ISLAND_LAND]`. `LAKE_BAY` gains `decks: [BRIDGE_DECK]`. `LAKE`'s shores become `['minZ']` (see "What this plan defers").
  - **The island's ground.** The Pines' mound and raised tree go; the Old Ash arrives in Task 6.
  - **Keep-out.** The area record gets `keepOut: ISLAND_KEEP_OUT`.
  - **The duck** at `(36, 16)` moves to `(37, 15)`.
  - **Fit rules.** `pinesTrees`, `pinesUndergrowth` and the shore lines in `pinesReeds` gain one more rule: **not within `ISLAND_LAND.r + 1` of the island's centre**. `pinesTrees` also keeps `1 + 1.3 × scale + 0.5` from `BRIDGE_DECK`'s centreline segment.
  - **Decks in the fit rules.** `DECKS` stays explicitly `[LOG_BRIDGE, STEPPING_STONES]`, and a comment says why: `rectDist` reads `minX`, which a strip deck doesn't have.
  - **The header comment.** "The bridge waits for the island" becomes: the bridge is walkable; the island is ground cut out of the lake; no cat stands on the lake, the bridge or the island (owner's decision 4).
- Modify `src/world/island.js` (new): `ISLAND_LAND`, `BRIDGE_DECK` and `ISLAND_KEEP_OUT`, frozen, with the values in "The island in numbers" and derived from `lake.js`.
- Test: `test/pines.test.js`, `test/water.test.js`, `test/minimap.test.js`

**Interfaces:**
- Consumes: Tasks 1–4; the Pines plan's `pinesTrees`, `pinesUndergrowth`, `pinesReeds`, `TRUCE_PATH` and `DECKS`.
- Produces: `ISLAND_LAND`, `BRIDGE_DECK` and `ISLAND_KEEP_OUT` from `src/world/island.js`; `area.keepOut` on the Pines.

- [ ] **Step 1: Rewrite or add these Pines tests as failing tests.** The Pines tests this task breaks, each rewritten here:
  - Pines Task 3's `every water is drawn from its own footprint, at the scene root`: `lake` and `lake-bay` now match notched `ShapeGeometry` meshes, using the Task 2 rule.
  - Pines Task 3's `the cat walks to the bridge foot and stops at the shore` and the island assertions in `the island and the bridge are where…`: replaced by the tests below.
  - Pines Task 5's `buildMapLayer for the Pines…`. The strip count changes. The reviewer measured 16 → 14 once the scene changes; recount from the built scene, and write the cause in the test's comment. That layer now also has three waters with decks (mire-north, mire-west, and lake-bay with its strip) and two with the island. Note in the comment that grass now grows on the island.

  New and rewritten tests:
  - `the island is ground cut out of the lake, and the bridge is the only way to it`:
    - `lake` and `lake-bay` carry `islands: [ISLAND_LAND]`;
    - only `lake-bay` carries `BRIDGE_DECK`;
    - `reaches(area, 28, 40)`, `reaches(area, 40, 28)` and `reaches` at the deck's middle are true;
    - with `BRIDGE_DECK` removed from `lake-bay`, none of the three is reached, and every target on the Pines mainland still is.
  - `the truce path runs straight onto the bridge and the bridge onto the island` (Review Focus 2). Walk in 0.1 m steps:
    1. from the truce path's last point `(10.6, 2.5)` to `(10.6, 4.8)`;
    2. then along the deck's centreline to `(23.4, 21.9)`, on the island at r 7.6.

    Every point is `isWalkableAt`. A cat 1.2 m to the side of the deck's middle is not walkable, and `nearestDry` from there lands on the deck.
  - `holding the stick in one direction never puts the cat in the water`: Review Focus 2's four fixed-stick cases, driven with `test/waterblock.test.js`'s `drive` (export it, or copy its harness) on the built Pines.
  - `the bridge deck is no wider than the plank the kids see`:
    - rays from 2 m above hit `islandBridge` at 11 points along the deck's **whole** length (t 0..1) × 5 side offsets in `[−halfW, halfW]`;
    - `2 × halfW` is ≥ 1.8 and ≤ the plank's width − 0.2;
    - the deck's last metre, past the foot, is over dry land (not `inWater` with decks ignored).
  - `no pine, fern, toadstool or shore reed grows on the island, and the rest of the Pines is as it was`:
    - none of `pinesTrees().near`, `.stand`, `ferns`, `toadstools` or the shore reeds is within 14 m of (28, 28);
    - the near and stand pine counts, ferns, toadstools and shore reeds equal the numbers measured on the Task 4 commit, which are written into the test. If one differs, the test's comment names the candidates that dropped and the rule that dropped them;
    - every pine keeps `1 + 1.3 × scale + 0.5` from the deck's centreline;
    - `DECKS` deep-equals `[LOG_BRIDGE, STEPPING_STONES]`.
  - `the Pines keeps its cats off the lake, the island and the bridge`:
    - `area.keepOut` deep-equals `ISLAND_KEEP_OUT`;
    - `keepOutPoint` moves every island rim point, every deck point and a point in the lake's middle to a point that is dry, inside the bounds and outside all three shapes.
  - Drop the mound's assertions. `PINES_ISLAND` keeps its derived record from Task 4.
- [ ] Add a block to `test/water.test.js`: `nearestDry round the island and its bridge`. Test each spot at margins 0.35, 0.5 and 0.6, with the Woods block's two expectations:
  - `[28, 41.3]`;
  - `[28, 14.7]`, where the bay and the lake overlap;
  - `[14.6, 28]`, in the bay only;
  - `[16.96, 10.78]`, 1.5 m beside the bridge's middle;
  - `[21.16, 16.88]`, 1.2 m beside the deck where it meets the rim;
  - `[10, 6.5]`, 1.5 m beside the deck on its west side, 1 m short of the foot.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite**, both budget tables included.
- [ ] **Step 5: Commit.** `git add src/world/pines.js src/world/island.js test/pines.test.js test/water.test.js test/minimap.test.js` (plus `test/waterblock.test.js` if `drive` is exported), then commit `feat(pines): the island is ground and the bridge is walkable, with no cats on either`

### Task 6: The island: the Meeting Ring, the Old Ash, the Watch Rock, and things to find

**Files:**
- Modify `src/world/island.js`:
  - the records `ISLAND_POIS` (each `group: 'island'`), `ISLAND_SCENICS` (each `gifts: false`), `ISLAND_COLLECTIBLES`, `ISLAND_PERCHES`, `MEETING_STONES`, `ISLAND_BUSHES`, `ISLAND_PUDDLES`, `ISLAND_CRITTERS` and `ISLAND_MOMENTS`;
  - `islandReeds()`;
  - `buildIsland(scene, { wind }) -> { colliders, perches }`, which adds the Old Ash with its limb, the boulder, the Meeting Ring, the Watch Rock and the bushes. A comment by the Meeting Ring says it gets no contact shadow (12 m across, over `MAX_SPAN`).
- Modify `src/world/pines.js`:
  - `build` calls `buildIsland` and appends every island list to the Pines' own;
  - `PINES_KEEP_CLEAR` gains the island records;
  - `pinesReeds()` appends `islandReeds()`.
- Modify `src/goldmice.js`: append `gm-pines-4..6` to `pines`, and update the header's count.
- Test:
  - `test/pines.test.js`;
  - `test/goldmice.test.js`: `GOLD_MICE.pines` has 6; `GOLD_TOTAL` is 27;
  - `test/docks.test.js`: `GOLD_TOTAL` is 27;
  - `test/climbing.test.js`:
    - `['pines-find-10', 'pines']` in `ELEVATED`;
    - `SHIPPED_HOPS` gains `'gm-pines-4': 2, 'gm-pines-5': 2, 'gm-pines-6': 0, 'pines-find-10': 1`;
    - every ground-mice list gains `'gm-pines-6'`;
    - the skilled hop tables gain `'gm-pines-4': 1, 'gm-pines-5': 1`;
    - `UNGATED.pines` has length 15: the Pines' 5, plus six stones and four chain perches;
  - `test/minimap.test.js`: the Pines now has one block, the Old Ash at r 1.0.

**Interfaces:**
- Consumes: Task 5; `b.tree`, `b.bush`, `b.puddle`; `GOLD_MICE.pines`.
- Produces:
  - the records above;
  - meshes named `oldAsh`, `ashBoulder`, `meetingRing`, `watchRock` and `watchRockStep`;
  - longer Pines lists: 8 more POIs, 3 more scenics, 5 more finds, 1 more puddle, 6 more critters and 1 more moment;
  - 10 more Pines colliders.

- [ ] **Step 1: Write the failing tests** in `test/pines.test.js`, in a `describe('the island')`. These are the Pines tests this task breaks, each rewritten here:
  - Pines Task 4's exact `critterSpawns` / `moments` / `puddles` test. It now holds the island's 6 critters, the duck at `(37, 15)`, the `duck-ring` moment and the island puddle.
  - Pines Task 4's golden-mice records test, which goes from 3 to 6.
  - Pines Task 4's `nine POIs`, which becomes 17, and `five collectibles, three scenics`, which becomes 10 and 6.
  - Pines Task 5's collider count, which becomes `near + stand + 19`: the Pines' 9 plus the island's 10.
  - Pines Task 4's `race: a Pines course of five rings is drawn from its POIs`. If it pins ring positions, recompute them after Task 7's cap and say so in its comment.

  New tests:
  - `eight island POIs, at least 2 m from water (the bridge one on its deck) and clear of every collider by 1.6`.
  - `the island's five finds, three scenics (no gifts), the Meeting Ring's six stones and two vantage perches`, as exact records.
  - `the Old Ash chain is two hops and its limb can't be reached from the grass`, and the same for the Watch Rock. Each checks exact perch records and collider radii, `canReach` both ways, and `reachesWithin` the first step.
  - `the Old Ash's limb reaches out past the trunk`:
    - in world space, the limb spans z 28.6..30.2 at y 1.85..2.15;
    - the mouse at (28, 29.8) and the perch at (28, 29.5) are each further from the axis than the trunk's radius at y 2.0, plus 0.3. The trunk tapers from 0.35 to 0.25 over its 2 m height, scaled by 2.6.
  - `the climbing golden mice sit on the chain tops, and the third hides among three bushes`. The bushes have no collider.
  - `every island find, POI, scenic and golden mouse is reached on foot from the Pines' spawn, and only over the bridge`. Use the Pines' `targets()`, with a `firstStep` for the two chains.
  - `the island's golden mice are in sight from the chase camera`. Use the Pines test's camera: a cat 3 m out, the camera 4.5 m further and 2.2 m up, and a ray to the mouse at y + 0.12 that hits nothing first.
    - `gm-pines-4` from the south, east and west. From the north the trunk is in the way, and the comment says so.
    - `gm-pines-5` from the north, south and west. The lake is 3 m east, and the comment says so.
  - `the Watch Rock is as wide at the foot as its collider`: `radiusBottom === 0.9`.
  - `the island's birds stand either side of the Old Ash, clear of its trunk`: each is > 1.0 + 0.35 from (28, 28).
  - `islandReeds is seeded and stands on the rim, clear of the bridge and every find`: 18–30 clumps, all at r 12.4–12.8 and dry.
  - `goals: every goal drawn in the Pines can still be finished there`: the shipped test, unchanged.
  - `the island's labels are our own words`:

```js
const BOOK_PLACES = ['gathering', 'fourtrees', 'great rock', 'great oak', 'highrock', 'highstones',
  'moonstone', 'moonpool', 'sunningrocks', 'tree-bridge', 'treebridge', 'starclan'];
const labels = [...ISLAND_SCENICS, ...ISLAND_COLLECTIBLES, ...ISLAND_PERCHES, ...ISLAND_MOMENTS].map((r) => r.label).filter(Boolean);
for (const l of labels) for (const w of BOOK_PLACES) expect(l.toLowerCase()).not.toContain(w);
```

  - `nothing in island.js reads the edition`.
  - The goldmice, docks, climbing and minimap changes listed under Files.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - The Meeting Ring is one merged mesh. It is 0.4 m tall, so it casts shadows.
  - The two chain boulders share one material, made once per `build`.
- [ ] **Step 4: Run the full suite.** Write the Pines' new built and merged numbers into `test/budget.test.js`'s comment tables; the caps are unchanged.
- [ ] **Step 5: Commit.** `git add src/world/island.js src/world/pines.js src/goldmice.js test/pines.test.js test/goldmice.test.js test/docks.test.js test/climbing.test.js test/minimap.test.js test/budget.test.js`, then commit `feat(island): the Meeting Ring, the Old Ash, the Watch Rock and the island's finds`

### Task 7: One island POI per race, no gifts on the island, and the star leads to the Pines

**Files:**
- Modify `src/race.js`. `raceCourse(pois, seed)` shuffles exactly as now, with the same rng and the same number of draws. It then takes the first five POIs in shuffled order, **skipping any POI whose `group` matches a POI already taken**. POIs without a `group` are never skipped, so every existing area's course is unchanged.
  - The Pines has 9 POIs with no group, so five always exist.
  - **Quests need nothing.** `createQuest` draws one target from the list, so it can never take more than one island POI. A comment in `walk.js` beside `createQuest` says so.
- Modify `src/game/interactions.js`: `openScenicNear` skips a scenic with `gifts === false`. That means no "leave a gift" prompt and no stash, so no ghost ever brings one from there.
- Modify `src/territories.js`:
  - `ISLAND` becomes `{ id: 'island', areaId: 'pines', name: 'The island', status: 'built', outline: … }` (the outline is unchanged), with a comment that the island is walked as part of the Pines (owner's decision 1);
  - the per-region state (owned, selected, locked, canOpen, line) moves into one function, used for each `TERRITORIES` entry and, through its `areaId`, for `ISLAND`;
  - the model returns `island: { ...ISLAND, owned, selected, locked, canOpen, line }`, carrying the Pines' state.
- Modify `src/ui/territorymap.js`. When the Pines is built, the island's `<g>` gets:
  - `stateClasses`, `data-dr-place="pines"`, and a `<title>` of `The island, in the Pines and Swamp · <line>`;
  - an invisible `tm-hit` copy of its outline;
  - a second small text, `in the Pines and Swamp`, at `(461, 352)`.

  It is drawn last, so its small target is never under a neighbour's. Before the Pines is built it renders exactly as it does today.
- Test: `test/race.test.js`, `test/interactions.test.js`, `test/territories.test.js`, `test/dressingroomcontroller.test.js`, `test/edition.test.js`

**Interfaces:**
- Consumes: the Pines' POIs with `group: 'island'` and its scenics with `gifts: false` (Task 6); the Pines' catalog entry; the shipped Legacy guards.
- Produces:
  - `raceCourse` with the one-per-group rule;
  - `openScenicNear` skipping no-gift scenics;
  - `territoryMapModel(...).island` carrying the Pines' region state;
  - `ISLAND.areaId === 'pines'`.

- [ ] **Step 1: Write the failing tests**:

```js
// test/race.test.js
it('takes at most one POI from any group, with the same shuffle', () => {
  const pois = [...Array.from({ length: 9 }, (_, i) => ({ x: i, z: 0 })),
    ...Array.from({ length: 8 }, (_, i) => ({ x: i, z: 10, group: 'island' }))];
  for (let seed = 1; seed <= 300; seed++) {
    const c = raceCourse(pois, seed);
    expect(c).toHaveLength(5);
    expect(c.filter((p) => p.group === 'island').length).toBeLessThanOrEqual(1);
  }
  // no groups: identical to before
  const plain = pois.slice(0, 9);
  expect(raceCourse(plain, 42)).toEqual(oldRaceCourse(plain, 42)); // the old body, copied into the test
});
```

  - `interactions: a scenic marked gifts: false is never offered for a gift`: the cat at the scenic with Gift Paws gets no `gift-leave` prompt, and a normal scenic beside it still does.
  - `territories.test.js`:

```js
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
```

  - `edition.test.js`:

```js
test('the island is inside the Pines, so Legacy never walks it and no patrol is there', () => {
  expect(effectiveArea({ edition: 'legacy', area: 'pines' }, CATALOG)).toBe('neighborhood');
  expect(Object.hasOwn(CATALOG.areas, 'island')).toBe(false);
  expect(rivalForWalk('pines', 'canon')).toBeNull();
});
```

  - Pines Task 7 tests this breaks, each rewritten:
    - its `m.island toMatchObject({ status: 'soon' })` becomes `status: 'built', areaId: 'pines'`;
    - its can't-be-tapped loop `['gorge', 'island']` becomes `['gorge']`;
    - its place count goes from 5 to 6.
  - `dressingroomcontroller: tapping the island before the Pines opens buys nothing; after, it selects the Pines`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.**
- [ ] **Step 5: Commit.** `git add src/race.js src/game/interactions.js src/game/walk.js src/territories.js src/ui/territorymap.js test/race.test.js test/interactions.test.js test/territories.test.js test/dressingroomcontroller.test.js test/edition.test.js test/pines.test.js`, then commit `feat(island): one island POI per race, no gifts on the island, and its star leads to the Pines`

### Task 8: Check it live, and write it down

When folded into the Pines build, this replaces the Pines plan's Task 9. Run that task's checks too, with the bridge items changed as below.

**Files:**
- Modify `docs/VISUAL-PASS.md`: add a "The Pines and Swamp, with the island" entry giving:
  - the built and merged mesh, caster and triangle counts, before and after the island;
  - the island's reed count;
  - the in-game draw counts;
  - what was and wasn't checked.
- Modify, only if the view changed: `public/places/pines.jpg` and `verify-places.html` (`VIEWS.pines`).

- [ ] **Step 1: Run the full suite and the build.** Expected: all pass.
- [ ] **Step 2: Check it live** with a temporary launch entry rooted at this worktree. Drive the touch joystick and orbit with synthetic `TouchEvent`s, as the Woods check learned to.
  - **Territory map**, at 1280 × 720 and at the mobile preset:
    - the island's star reads "in the Pines and Swamp";
    - tapping it does exactly what tapping the Pines does, both while the Pines is locked and once it is open;
    - its small target works on the phone and doesn't steal taps from the Pines, the Moor, the Woods or the River (sample every 3 px round its outline).
  - **Walk the truce path onto the bridge and over to the island:**
    - the cat passes between the truce stones with no stop at the shore, and steps onto the island's grass without a hitch;
    - pushing off either side of the plank stops the cat at its edge;
    - the four fixed-stick cases in Review Focus 2 behave the same live;
    - the camera never sits inside a pine or the Old Ash's canopy.
  - **The corner map:**
    - the island is filled like the land, in the lake;
    - the diagonal bridge shows in the path tone;
    - the N badge is at the top;
    - the cat's dot crosses the bridge.
  - **On the island:**
    - foam rings its shore, with no foam line running up the bay from the lake's west edge;
    - both golden mice are in sight from round the Old Ash and the Watch Rock;
    - the Meeting Ring's stones can be sat on;
    - ducks paddle round the island, and two birds hop at the Old Ash's foot.
  - **Strays:**
    - three strays never set foot on the lake, the island or the bridge through a few minutes;
    - a yarn ball thrown onto the island draws a playful stray only to the shore;
    - a Far Call from the island brings none over.
  - **Gifts.** A Gift Paws save gets no "leave a gift" prompt at any island scenic.
  - **The race.** On a few days' courses, at most one ring is on the island or the bridge.
  - **Sound.** It is the Pines' (a low hush and frogs), on the island too.
  - **`?perf`.** Take the Pines' draw count twice: standing on the island looking back up the bridge, and on the truce path.
  - No console errors. Reset the viewport to desktop afterwards.
- [ ] **Step 3: Write the VISUAL-PASS entry.**
- [ ] **Step 4: Commit.** `git add docs/VISUAL-PASS.md`, plus `public/places/pines.jpg verify-places.html` if changed. Then commit `docs(island): the island's budget and live check`
