# Lighthouse and Cliffs: a new place beside Seaside (design)

Date: 2026-11-22. Status: draft for the owner's approval. Design only: no feature code is written, merged or pushed.
Plan: `docs/superpowers/plans/2026-11-22-lighthouse.md`.

Area id `lighthouse`; catalog name "Lighthouse Point" (the same in both word sets, so no `PLACE_WORDS` row, as the Seaside and the Docks have none).

## Intent

The owner's idea: a place beside Seaside and the Docks with a tall lighthouse the cat can climb (spiral stair, balcony, lamp room) and a turning beam; rock pools with crabs and shells; gulls; a cave under the cliff; a cliff path; a little keeper's cottage; a night look where the beam sweeps. Things to do: explore, discoveries, golden mice, a lamp-lighting task at dusk, finding the keeper's cat or a lost kitten (gentle, never scary), one found outfit. The Rooftops' moves and skills apply.

The players are a girl of 11 (she loves Warrior Cats) and a boy of 9. It is a **non-clan place**: no rival patrol, no border posts, no clan cats, no colony feeding (so no database change). It is in both editions and reads right under both word sets.

## What I checked in the code (2026-11-22, read-only)

| Fact | Where | What it means here |
|---|---|---|
| A place is real when it has a builder module, a line in `AREA_LOADERS` and `AREA_ENTRY_MODULES`, and a `CATALOG.areas` row plus a `state.walks` key | `src/world/areas.js` header, `src/progression.js` | `lighthouse` is one more `own('lighthouse', world)` loader, its own lazy download (`AREA_GZIP_CEILING_KB` = 100). Unknown ids reject, so nothing can call it before the row exists. |
| Seaside opens after 2 Docks walks (200 paws); the Docks after 2 Park walks (100) | `progression.js` rows `seaside`, `docks` | "After Seaside and Docks" is one rule: `requires: { area: 'seaside', walks: 2 }`. The Docks come with it. |
| Places without `edition: 'canon'` are in both editions | `edition.js areaInEdition` | No edition key. Golden mice rise by 3 in both: 45 to 48 Clan, 21 to 24 Legacy (`goldmice.js` `goldForEdition`). |
| The world map has `STREET_PLACES` (Park, Fair, Farm, Docks, Seaside) and `TOWN_PLACES` (Roofs, Market, House); roads are `GATEWAYS`; gate ends are `GATEWAY_ENDS` | `src/worldmap.js`, `src/gateways.js` | Lighthouse is a street place on the coast, north of Seaside. A road plus a gate pair (Seaside end, Lighthouse end). |
| Seaside: bounds x -48..36, z -34..48; its north is a 60 m sandstone bluff (z -55..-37) with colliders at z -37; spawn (18, 42); the sea is x > 25; a lamp at (20, -30) | `src/world/seaside.js` | The Seaside gate goes on the open north-east sand, at about (12, -31.5), not on the bluff. |
| An area that sets `evening: true` has the dusk look every walk, with no Glow Collar and no weather; `areaData.duskLight` overrides any key of the dusk look | `walk.js` (walkDusk), `render/dusk.js`, `roofs.js` | The Lighthouse is always evening, in a warm golden-hour dusk (Question 1). |
| Ground is shapes (strips, discs, ceilings); `y()` is the MAX of the shapes under a point; a rim of about 0.3 m or more is a wall both ways; no walkable strip is steeper than 1 in 3 | `src/ground.js` | One walkable height per spot. A spiral stair cannot stack its turns as ground (see "The climb"). |
| The Rooftops' warehouse stair is four flights side by side, never stacked | `src/world/roofsplan.js` header | Precedent for ground flights. Used for the cliff path, not for the tower. |
| Traversal: crossings (rails in the air, a polyline with a height per point, at most 12 m), leaps (1.0..3.5 m, 4.5 m with Long Leap), climbs and drops (3 m a hop); a crossing joins walkable ground at both ends | `src/traversal.js` | The tower stair is a chain of rail flights. The kinds are `plank, ridge, gutter, line, pipe`; a new `stair` kind is the one change to shared code. |
| Tightrope Tail: 20 crossings walked end to end; Long Leap: 15 leaps landed | `src/skills.js` | They apply as in the Rooftops (see "Moves and skills"). |
| Discoveries are journal pages; each place pays one `AWARDS.<place>find` the first time ever and counts once per walk; finds are found automatically, with no prompt pointing at them | `discoveries.js`, `roofspages.js`, `marketpages.js`, `JOURNAL_TYPES` in `progression.js` | Six finds, one new award `lighthousefind: 12`. |
| Golden mice: three per area in `GOLD_MICE`; `y` is added to the ground height under the spot; the mouse is found within 1.0 m and 0.9 m of the cat's paws | `src/goldmice.js` | Three mice, ids `gm-light-1..3`. |
| Daily goals: `GOAL_POOL` filtered by what the area can finish (`goalFits`); always exactly three draws | `src/goals.js` | No new goal. The area just has to be able to finish enough (tippables, a box, critters, scenics). |
| Jobs with no clock and no failure; per device; nothing sent | `src/farmjobs.js` header, `kitten.js` | The kitten job and the lamp job copy the Farm's job rules. |
| Tippables travel by id over the existing `tip` event; a spot may carry `build: () => Group` | `tippables.js` (`tipById`), Market spec V1 | The lamp lever is a tippable. A partner's pull lights the lamp on both screens with no new message. |
| Words: `phrase(id, ...args)`; one table `LATER` in `clanphrases.js`; a word set may override ids in its own `PHRASES`; people and house words come from `words().OUTSIDE_WORDS`; hint lines are in `tutorialwords.js` | `clanphrases.js`, `offclanwords.js`, `wordset.js` | Lines read the same in both sets except where they take a set word (house cat, people). |
| Found outfits: 10 to 15 spots per area, none within 15 m of the spawn; at most `WEAR_PER_AREA` (4) records; a find is a coin pouch once everything hidden is hers | `src/foundwear/spots/index.js`, `index.js`, `rules.js` | One outfit is allowed. The Rooftops have no spots; the Market has 12. |
| Budgets: start-up 709.4 of 720 kB gz (`MAIN_GZIP_CEILING_KB`, never raised); a place chunk at most 100 kB (`AREA_GZIP_CEILING_KB`); per-place mesh / caster / triangle ceilings in `test/budget.test.js` (Seaside 85/45/30,000; Farm and Market 280/210/62,000; Rooftops 450/380/70,000); the save stays under 150 kB | `scripts/buildjson.mjs`, `test/budget.test.js`, `test/savesize.test.js` | See "Budgets". |

Not verified (the plan checks them in M0): that a co-walker sees a partner's height on a stair (the Rooftops added height to the wire; I did not read the field); how a wading cat behaves in a very shallow pool (the Seaside's `shallow` band is the precedent).

## Decisions I made (the owner can change any; the six that need him are at the end)

1. **Always evening, golden hour into dusk.** Like the Rooftops: no Glow Collar, no weather, `evening: true`, with a warm `duskLight` override so it reads as sunset, not night. The beam is the star, so it must be visible every walk.
2. **The keeper is never shown.** A lit cottage window with a sleeping shape, a smoking chimney, a rocking chair, a lantern on a hook and a note on the door. The characters are the **keeper's cat** (an adult, at the cottage) and her **kitten**. This keeps `people/index.js` out of the chunk and keeps the "no person in the way" rule free.
3. **Never scary.** The cave is short (7 m), shallow, and lit by a hung lantern and sea-glitter. Nothing is dark, nothing chases, nothing falls. Heights have railings, and no move ends in a fall.
4. **The beam is a mesh, never a light.** "No real lights" is the game's rule. The beam is one additive cone, a soft sweep patch on the ground, and a halo at the lens.
5. **Both jobs repeat every walk** (once a walk, as the Farm's jobs do), with a new hiding place for the kitten from the room seed.
6. **The stair is rails.** A tower stair is a chain of `stair` rail flights round the tower with two landings.

## The place

Metres. x east, z south (north is -z). The sea is east. Numbers are first drafts for the builder to tune against the walkability and reach tests.

- **Bounds:** x -46..38, z -44..44 (84 x 88 m, a little bigger than the Seaside's walkable part).
- **Spawn:** (14, 36) on the cove beach, facing north. The lighthouse stands in view straight ahead.
- **Sea:** x > 36 (a `waters` rect with a shallow band, as `seaside.js` SEA), the pale horizon haze and a far ship.

### Plan view (north up)

```
 z -44 +--------------------------------------------+--------------------+
       | HEADLAND PLATEAU  y 6.0                   |  COVE BEACH y 0     |
       |  x -46..-6, z -44..4                       |  x -6..36           |
       |   [cottage]      ( LIGHTHOUSE )            |   driftwood, nets   |
       |   (-38,-8)        (-22,-20) r 3.6          |                     |
       |   garden, wall,    gallery y 13.5          |   (( cave mouth ))  |
       |   fog bell         lamp room to y 16.7     |    at (-6,-19)      |
       |   (-12, 0)         stair rails r 5.2       |    tunnel to x -16  |
       |                                            |                     |
       |   Gull Rock hop (Long Leap): to (-44,-30)  |   gm cave nook      |
 z   4 +---------[ cliff face, wall ]---------------+                     |
       |     F2 north y 3 -> 6   (-24, 15 -> 4)     |   rock pools x6     |
       |  L1 landing (-24,15) y 3                   |   (8..34, 10..32)   |
 z  16 |  F1 east-west y 0 -> 3  (-2,16 -> -22,16)  |   shells, crabs     |
       |  [cliff-foot rocks]                        |                     |
 z  44 +----------------------- gate (14,41) --------------[ sea x>36 ]---+
        x -46                  x -6                 x 14              x 38
```

| Zone | Footprint (m) | Level | What is there |
|---|---|---|---|
| Arrival cove | x -6..36, z 14..44 | 0 | Spawn, the gate to Seaside, sand, driftwood, an upturned rowing boat, a washed-up crate |
| Rock pools | x 8..34, z 10..32 | 0 | Six pools of 1.4 to 2.4 m radius ringed with rocks; crabs; shells; two low rocks she hops onto (0.72, the stone perches' height) |
| Cliff path | F1 (-2,16)->(-22,16), landing (-24,15) r 1.6, F2 (-24,15)->(-24,4) | 0 to 6 | Two ground flights side by side, 1.8 m wide, grades 1 in 6.7 and 1 in 3.7; posts and a rope rail |
| Headland plateau | x -46..-6, z -44..4, with the cave's footprint left out | 6.0 | The lighthouse, the cottage and its garden, a stone wall, a bench, the fog bell, a flagpole, a washing line |
| Lighthouse | centre (-22, -20); shaft radius 3.4; collider 3.6; gallery disc radius 4.6 | base 6, gallery 13.5, lamp room floor 13.5, lamp room roof (a ceiling) 16.7 | See "The climb" |
| Keeper's cottage | centre (-38, -8), 7 x 5 m | 6 | Stone, slate roof, a chimney, a lit window, a door ajar, a cat flap, a rocking chair on the porch |
| Sea cave | mouth (-6, -19), tunnel to x -16, z -22..-14; 2.6 m high; its roof is a ground ceiling | 0 | Shallow and lit; a hung lantern; shells; a nook at the back |
| Gull Rock | a sea stack at (-44, -30), 4.4 m from the plateau's north-west lip | 6 | A lookout perch for Long Leap; gulls |

The plateau is built as strips around the cave's footprint, so the cave's roof is a rock mesh that is not walkable (the Rooftops' pitched roofs and the Gorge's caves use the same trick: ground holds one height per spot).

The tower's gallery disc (radius 4.6, y 13.5) also fills the tower's skirt at the base: the cat cannot walk up to the tower wall on the plateau. She meets the tower through the stair. The disc is drawn as a thick stone plinth, so it reads as intended.

### Map placement and unlock

- **World map:** `STREET_PLACES` gets `{ id: 'lighthouse', areaId: 'lighthouse', x: 1295, y: 552, r: 52 }`. It sits on the coast, on the headland north of the Seaside. It is 169 units from the Seaside's centre (needs 142), 228 from the Park and 240 from the Farm, so no circle touches. `STREET_LAND.lighthouse` is a pale sea-mist grey-green (`#cfdad2`). The builder may move the circle up to 25 units to pass `test/worldmap.test.js`.
- **Road:** `GATEWAYS` gets `seaside-lighthouse`, from the Seaside's north rim to the Lighthouse's south-west rim: `[[1225, 610], [1250, 600], [1262, 585], [1275, 568]]` (first draft; the builder checks it against the labels as Market step 4 did).
- **Icon and label:** `STREET_ICON.lighthouse` is the tower (🗼); `STREET_LABEL_AT.lighthouse` just north of the circle.
- **Unlock:** `lighthouse: { name: 'Lighthouse Point', price: 150, requires: { area: 'seaside', walks: 2 } }`, no `edition`, placed after `seaside` in the catalog list (the place cards follow the list's order). It is not a kept offer. Seaside's own rule (2 Docks walks) means a save that can buy it has done both. The home line (`nextthing.js` rule 7) changes nothing today; the builder checks it.
- **Gateways:** the Seaside end `seaside-lighthouse` is a `signpost` with `sign: true`, an `edge` end at (12, -31.5) facing north (2.5 m inside the north bounds, clear of the lamp at (20, -30)). The Lighthouse end `lighthouse-seaside` is a `signpost` at (14, 41) facing south, arriving at (14, 37.4) facing north. Both go in `GATEWAY_ENDS`; a live gate exists only once the catalog row does.
- **Dev switch:** `?lighthouse=1` starts a solo walk while the place is built (the pattern `?roofs=1` and `?market=1` set), and becomes a shortcut at M4.

## The climb (the lighthouse)

Heights: cliff top 6.0; stair rises 7.5 to the gallery at 13.5; lamp room floor 13.5, its roof (a ceiling) 16.7; the lantern top and a weather vane about 18.5.

1. **Door and stair foot.** The stair starts on the plateau at the tower's south-east side, radius 5.2 (just outside the gallery disc), marked by a small striped bollard and a painted arrow on the plinth.
2. **Three rail flights, two landings.** Each flight is a polyline of about 10 m at grade about 1 in 4 round the tower at radius 5.2 (about 1.4 turns in all). A rail stays "in the air", so the ground under it is still the plateau: no flight stacks on another as ground would. The two landings are small stone ledges (2 x 2 m, y 9.5 and y 11.5, on solid stubs with railings and a window slot to look out). She can stop at a landing, sit, and look at the sea.
3. **The `stair` kind.** The Rooftops' balance walk is a careful, arms-out wobble (1.2 m/s): wrong and too slow for a stair. A new kind `stair` in `CROSSING_KINDS` uses the normal walking pose, no wobble, 2.4 m/s, 1.0 m wide, and does **not** count toward Tightrope Tail's 20 crossings. The whole climb is about 30 m, so about 13 seconds. This is the only change to shared traversal code (about 0.15 kB of start-up).
4. **The gallery.** A ring at y 13.5 (a disc, with the shaft's collider in the middle) with a railing. Along the railing's top runs one balance crossing (`pipe`, 9 m, the "railing walk"): it is the place's Tightrope Tail crossing, with a view straight out to sea. She steps off at either end.
5. **The lamp room.** A glass room on the gallery (radius 2.2, a door gap 1.4 m wide, the frame solid). Inside: the lens on a pedestal (collider radius 0.8), a ring of floor to walk, and the lamp lever. Its roof is a ground ceiling, so the camera rule that already holds the camera clear of ceilings (`CAM_CEIL_CLEAR`) applies; the glass fades when it comes between the camera and the cat, as tall things do.
6. **Coming down.** The three flights are two-way (walk back down the stair), so nobody is stuck. A marked drop spot also exists at the gallery's back rail onto the landing at 11.5 (a 2 m drop, within the 3 m drop rule), the quick way down. No fall that looks like a fall.
7. **Plan B (if the stair kind is refused):** three ground flights side by side on the plateau winding outward (about 40 m of footprint), no new traversal kind, a longer walk. I do not recommend it; the rail stair is shorter and truer to a lighthouse.

### The beam and night look

- `evening: true` with `duskLight` set to a warm low sun (golden hour), a sky from amber at the horizon to blue overhead, stars and a moon coming up (the Rooftops' `roofsmoon` and star pieces).
- **Lamp unlit on arrival, lit by her** (the task below). Unlit: a dull lens, no beam. Lit: the lens glows (emissive), a long soft additive cone (about 40 m, one mesh) turns once every 18 s, a pale pool sweeps the sea and the cove (one flat additive quad, skipped on the low quality tier), a halo at the lens, and moths round the lamp (the `moths` ambient). The beam does not light the ground (no real lights), so it is a picture, not a hazard.
- The beam's angle is a function of walk seconds and the room seed (the Fairground's way), so two screens match to a fraction of a second with no network message.

## Things to do

All of it is optional, none has a clock, nothing fails.

| Thing | How it works | Pay (existing awards unless marked new) |
|---|---|---|
| **Explore** | Scenic spots (below) feed "visit 2 special places" and the corner map | `scenic` 8 each, first visit per walk |
| **Light the lamp** (the dusk task) | Climb the stair, enter the lamp room, pull the lever (the action button, a tippable). The lens lights, the beam starts, a ship's horn answers far away | **New** `lighthousejob: 25`, once a walk (the Farm's `farmjob` number) |
| **Find the keeper's kitten** | The keeper's cat paces at the cottage door and looks down at the shore (the offer; no text wall). A kitten's mews and a paw-print trail (the quest scent) lead to one of three hiding places picked from the room seed: a pool ledge, the cave's nook, or under the upturned boat. The kitten follows her home (the `kitten.js` follow rules; it waits, never runs off). At the cottage door the mother purrs and they tumble in | `lighthousejob: 25`, once a walk. Per device; nothing sent |
| **Discoveries** (6 journal pages, below) | Found by doing, never prompted | **New** `lighthousefind: 12`, first time ever; later walks count once on the page |
| **Golden mice** (3) | Hidden; see below | The golden-mouse award |
| **Collectibles** (5) | Shells, blue sea glass, a starfish, a pearly button, a cork float | `collectible` 10 |
| **Mischief and play** | Tippables: two crab pots, a bucket, a lobster crate, a bin, the **lamp lever** (4 or more, so "knock 3 things over" fits); a cardboard box (so "sit in a box" fits); gulls and crabs to stalk and pounce (the "pounce on 2 animals" goal) | The usual awards |
| **Yarn ball** | One lies somewhere each walk (`propsets.js`) | as everywhere |
| **Moments** | A crab scurries out of a pool; a gull steals a chip | `moment` 12 |
| **Found outfit** | One hidden find a walk at one of 12 spots (below) | free |

### The six discoveries (found automatically)

| Id | Journal page | How it is found |
|---|---|---|
| `lamproom` | The Lamp Room | Standing inside the lamp room for 2 s |
| `pool` | Rock Pool Peek | Sitting still at a pool's rim for 2 s (a crab pops up) |
| `gull` | A Gull Friend | Sitting on the gallery or Gull Rock for 3 s: a gull lands beside her |
| `echo` | The Echo Cave | Meowing (the existing call button) at the cave's back wall |
| `bell` | The Fog Bell | Pawing the bell's rope (the action button): a clang, gulls scatter |
| `window` | The Lit Window | Standing under the cottage window for 2 s: a warm room, a sleeping shape, a purr |

Journal types appended to `JOURNAL_TYPES`: `lhlamproom, lhpool, lhgull, lhecho, lhbell, lhwindow` and the two jobs `lhjobkitten, lhjoblamp`, a new `src/lighthousepages.js` (start-up, ids and word lookups only, as `roofspages.js`).

### Golden mice (3, none beside a find spot, a collectible or a discovery)

| Id | Where | Reached by |
|---|---|---|
| `gm-light-1` | The gallery, on the sea side, opposite the lamp-room door (y 0 over the gallery disc) | The stair (the top of the climb) |
| `gm-light-2` | The sea cave's back nook (y 0), behind the lantern | Walking in (7 m) |
| `gm-light-3` | The high pool ledge (y 0.72 over a rock on the pools' north side), two hops up | Two climb hops within the base climb budget |

None needs Long Leap, Sea Legs, Spring Paws or a dusk collar. A test walks the real plan to each (the Rooftops' "never stuck" rule).

### Scenic spots (for the corner map, gifts and "visit 2 special places")

`lighthouse-gallery` (the balcony), `lighthouse-cave` (the sea cave), `lighthouse-pools` (the pool shelf), `lighthouse-cottage` (the porch), `lighthouse-gullrock` (Gull Rock, Long Leap only, a bonus). Their ids are load-bearing once shipped (gifts persist them), so they are chosen once. Labels go through the word tables. Not on the corner map: golden mice, finds, collectibles, the kitten.

## Moves and skills

| Skill or move | Here |
|---|---|
| **Climb, hop up/down** | The plateau, the rock stacks and the boat are ordinary perches within the base climb budget (1.6 m, 2.2 with Spring Paws). The cliff path is walked, not hopped |
| **Crossings** | Stair flights (new `stair` kind, normal gait). The gallery's railing walk and a plank from the cottage's wall to the woodshed roof are balance crossings (`pipe`, `plank`) |
| **Tightrope Tail** | Quicker and steadier on the railing walk and the plank (they count toward its 20). The stair is unaffected and does not count |
| **Leap** | One base gap (3.0 m) from the cottage roof ridge to the woodshed roof; counts toward Long Leap's 15 |
| **Long Leap** | One 4.4 m gap from the plateau's north-west lip to Gull Rock: a lookout and a gull chat (`lighthouse-gullrock`), a bonus only |
| **Sure Claws** | Opens the two beach boulders as perches (the Seaside's rule: the area lists them with `requires: SURE_CLAWS_ID`) |
| **Sea Legs** | Not needed; the pools are shallow and walkable (confirm the wading in M0) |
| **Night Eyes** | The place is always evening; it does not need the collar, and counts as a dusk walk only with the Glow Collar on (the Rooftops' rule) |

## Budgets

Ceilings follow the street places' ruling (the Farm's and the Market's): **280 meshes, 210 shadow casters, 62,000 triangles** for the build, and **70 / 36** (meshes / casters) merged, pinned at about +12 % over the measured numbers once built. The aim is 150 / 70 / 52,000 built. Estimates (built, before merging):

| Piece | Meshes | Triangles |
|---|---:|---:|
| Cove sand, wet band, sea slab, horizon | 5 | 2,600 |
| Headland and cliffs (strata boxes, plateau, gullies) | 8 | 10,500 |
| Cave liner, roof, lantern glow | 4 | 3,800 |
| Six rock pools (water disc, rim rocks) | 12 | 5,400 |
| Boulders and rocks scattered (about 30) | 3 | 3,600 |
| Lighthouse (shaft, bands, plinth, door, windows, gallery, 48 balusters, lamp room frame, glass, roof, vane) | 14 | 6,800 |
| Lens, pedestal, lever | 4 | 1,500 |
| Spiral stair (steps, handrail, two landings) | 5 | 1,700 |
| Cottage, chimney, garden wall, fence, bench, washing line, bell | 14 | 4,500 |
| Cliff path (steps, posts, rope) | 4 | 1,400 |
| Beach dressing (driftwood, nets, crab pots, buoys, boat, crates) | 14 | 4,200 |
| Shells, sea glass, starfish (merged) | 3 | 900 |
| Beach plants (8 marram and holly) | 8 | 1,600 |
| Gull Rock and arch | 3 | 2,200 |
| Beam, halo, sweep, stars | 4 | 120 |
| **Built total** | **about 105** | **about 50,800** |
| Gate dressing (one signpost) | 2 | about 400 |
| Life (crabs, gulls, cats, ship, kitten): at most | 10 | 3,500 |

That is about 54,700 triangles drawn, under 62,000. Casters: the tower, cottage, cliffs and plateau cast (about 30 after merging); small props and glass are `noCast`. Triangles are cheap here; meshes and casters are the scarce ones (the budget test's own header).

| Gate | Value | Rule |
|---|---|---|
| Start-up chunk | **709.4 now; at most 712.0 after the words and rows (M3), at most 712.5 at M5; stop at 713.0** | `MAIN_GZIP_CEILING_KB` 720 is never raised. The place adds data rows only: about 2.3 kB gz (catalog row, 8 journal ids, phrases in both tables, a hint, 10 to 15 find spots, gateway and map rows, one outfit, the `stair` kind, a flag module) |
| Place chunk | aim 65 kB gz, hard 100 | `npm run build` prints it; `areaSizeProblems` fails over 100 |
| Seaside's own ceilings | 85 / 45 / 30,000 | The new Seaside gate adds about 200 to 400 triangles to its dressed 29,125: it fits, narrowly. If it does not, raise Seaside's triangle ceiling on purpose, and say so in the commit |
| Save size | under 150 kB (about 101 now) | Eight journal ids and one walks key add well under 0.2 kB |
| Frame rate | Old iPads matter most; the owner reads the iPhone | One additive beam (about 8 % of the screen at most), no real lights, no full-screen effect; the sweep patch is skipped on the low tier |

## Kit reused and art needed

**Reused (no new code, or tiny leaf additions):**

| Piece | From |
|---|---|
| Cliff strata, rock relief and shade, boulders, beach bushes, bench, lamp post, cardboard box, platform | `world/builder.js`, `rocks.js`, `rockrelief.js`, `rocknormals.js`, `rockshade.js`, `beachdress.js` (`sandTint`) |
| Sea, foam, wet-sand band | `render/water.js`, `waterdress.js`, `seasidewet.js` |
| Raised ground, ceilings, the cave's hole in the plateau | `ground.js` (the Gorge's caves, the Rooftops' voids) |
| Crossings, leaps, climbs, drops, hop timing, camera ease | `traversal.js`, `traversallive.js` |
| Moths, smoke, washing line sway, coo and gull calls, the moon and stars | `roofsair.js`, `roofssound.js`, `roofsmoments.js`, `render/nightsky.js` |
| Journal pages and awards pattern | `roofsfinds.js`, `roofspages.js` and the Market's equivalents |
| Job rules (no clock, no failure, per device) | `farmjobs.js`; the follow rules in `kitten.js` |
| Tippable with its own look | `tippables.js` `spot.build` (the Market's hook) |
| Gate looks | `world/gateway.js` `signpost` |
| Critters (gull, crab), journal types `seagull`, `crab` | `critters.js`, `JOURNAL_TYPES` |
| Found outfit pieces | `foundwear/head.js`, `cat/hats.js` |
| Rests (drink, eat, nap) | `rests.js` rows `lighthouse-drink-1`, `-eat-1`, `-nap-1` (a bowl, a dish, a cushion on the porch) |
| Ambient sound | `audio.js`: the Seaside's surf and gulls branch, with `lighthouse` added to it |

**New art:** the striped tower and plinth; the gallery and railing; the lamp room's glass and a stepped lens (rings); the stair, landings and bollard; the beam cone and sweep patch; the keeper's cottage with a chimney puff and a lit window; the stone wall, garden and fog bell; the cave liner (a simple one, not the Gorge's chamber kit, whose records it does not share); the six rock pools; shells, sea glass, starfish; crab pots, buoys, an upturned rowing boat; Gull Rock with a small arch; a far ship (flat, on the horizon); the keeper's cat and the kitten (the existing cat model, scaled and recoloured); one outfit (below); the card picture `public/places/lighthouse.jpg`; a test page `verify-lighthouse.html`.

## Found outfit (one, as asked)

A **keeper's cap** (a navy cap with a small brass badge), a head piece reusing a shipped hat shape in new colours (name is a placeholder; the owner and his daughter pick it, as for every found outfit). Twelve find spots in `src/foundwear/spots/lighthouse.js` (the rules need 10 to 15, none within 15 m of the spawn, none in water, none at a golden mouse or collectible): three on the cove, four by the pools, three on the plateau, one in the cave, one at the cottage. After she has it, the walk's find is the coin pouch (5 paws), as for every place. A second and third outfit can be added later (up to 4 records a place) without changing the spots.

## Pad, phone and TV

| Concern | What I do |
|---|---|
| **Pad (DualSense)** | The stair, the railing walk and the leap use the existing movement stick plus the jump button, as the Rooftops did; the lever, the bell and the kitten use the one action button. No new button. TV mode's focus ring and glyphs come with it. The corner map shows the plan view only |
| **Phone** | No new on-screen controls. Prompts are one short line (the playtesters' note that messages take a quarter of the screen). The stair and the walk back down need no precision: the stick along the stair moves her. The lamp room's glass fades so the cat is never hidden. The low tier drops the sweep patch and flattens the pool water |
| **TV** | The gallery and the lit beam over the sea are the "postcard" picture. Big flat shapes, no tiny text on the lamp. Sound stays under the sound switch; the foghorn and bell are brief and soft (a living-room volume note, as TV mode's design says). No pixel-heavy overdraw: the beam is one cone |
| **Camera** | The camera eases round behind her along a stair (the crossing's gentle follow); it never looks straight down a drop; the lamp room's ceiling uses the existing camera rule |

## Words (both sets)

Every line goes through `phrase()` (new ids in `LATER`, under `// ---- Lighthouse Point (2026-11-22) ----`) and `tutorialwords.js`; no series word appears in a string literal. "Same" means one line in both sets. The few that take a set word do so at read time (`words().OUTSIDE_WORDS`). Place name: none (catalog name "Lighthouse Point").

| Id | Clan Edition set | Everyday set |
|---|---|---|
| `hint.lighthouse` | Follow the stairs up to the big lamp! | same |
| `lighthouse.scenic.gallery` | the lighthouse balcony | same |
| `lighthouse.scenic.cave` | the sea cave | same |
| `lighthouse.scenic.pools` | the rock pools | same |
| `lighthouse.scenic.cottage` | the keeper's porch | same |
| `lighthouse.scenic.gullrock` | Gull Rock | same |
| `lighthouse.perch.boat` | the upturned boat | same |
| `lighthouse.perch.pool` | the high pool ledge | same |
| `lighthouse.collect.shell` | a spiral shell | same |
| `lighthouse.collect.glass` | a piece of blue sea glass | same |
| `lighthouse.collect.starfish` | a little starfish | same |
| `lighthouse.collect.button` | a pearly button | same |
| `lighthouse.collect.cork` | a bobbing cork float | same |
| `lighthouse.moment.crab` | a crab scuttling out of a rock pool | same |
| `lighthouse.moment.chip` | a gull stealing a chip | same |
| `lighthouse.lever.prompt` | E — pull the lamp lever | same |
| `lighthouse.lamp.lit` | The lamp is lit! The beam sweeps over the sea. 🔦 | same |
| `lighthouse.lamp.ship` | Far away, a ship toots its horn. Thank you! 🚢 | same |
| `lighthouse.bell.prompt` | E — ring the fog bell | same |
| `lighthouse.kitten.offer` | (house) The cottage {house} keeps looking down at the shore. Her kitten is missing! 🐾 | with "house cat" in the {house} slot (the set's `OUTSIDE_WORDS.house`: kittypet or house cat) |
| `lighthouse.kitten.hear` | Mew! Mew! Where is that coming from? | same |
| `lighthouse.kitten.found` | There you are, little one! Stay close. 💕 | same |
| `lighthouse.kitten.prompt` | E — say hello to the kitten | same |
| `lighthouse.kitten.home` | Home safe! The kitten tumbles in and Mum purrs. 😻 | same |
| `lighthouse.page.lamproom.name` / `.hint` | The Lamp Room / The top of the tower glows when you get there. | same |
| `lighthouse.page.pool.name` / `.hint` | Rock Pool Peek / Sit very still at a rock pool. Who lives there? | same |
| `lighthouse.page.gull.name` / `.hint` | A Gull Friend / Gulls like a quiet cat on a high place. | same |
| `lighthouse.page.echo.name` / `.hint` | The Echo Cave / What happens if you call into the cave? | same |
| `lighthouse.page.bell.name` / `.hint` | The Fog Bell / The old bell by the cottage has a long rope. | same |
| `lighthouse.page.window.name` / `.hint` | The Lit Window / Someone left a light on in the cottage. | same |
| `lighthouse.find.lamproom` | The great lens turns the sunset to gold. ✨ | same |
| `lighthouse.find.pool` | A little crab waves a claw at you. 🦀 | same |
| `lighthouse.find.gull` | A gull lands next to you and chats about fish. 🐦 | same |
| `lighthouse.find.echo` | Mew-ew-ew… the cave sings your call back! 🎶 | same |
| `lighthouse.find.bell` | Clang! The gulls flap up all at once. 🔔 | same |
| `lighthouse.find.window` | (people) A warm room, and one of the {people} asleep in a chair. A purr from somewhere. 🏮 | {people}: Twolegs in the Clan set, townspeople in the everyday set (read from `OUTSIDE_WORDS.people`); the line is otherwise the same |
| `lighthouse.job.lamp` / `lighthouse.job.kitten` (summary labels) | lamp lit / kitten home | same |

Lines are pitched for a 9-year-old, one line each, never a scold, never a scare. Refresh the snapshots as the Market's plan says (`UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`, plus `test/offwords.test.js`), keeping only this place's lines.

## Anti-goals (a failure even if it works)

- Any fall, a fall-looking drop, a stuck cat high up, or a camera looking down a drop.
- Anything dark or scary: the cave, the beam or the kitten's search. No chase, no shout, no timer.
- A person in the way: none is shown.
- A beam that is a real light (cost) or that hides the cat.
- A second place's rules changed: the Seaside gets one gate and nothing else; `flat-trace.gameplay.json` does not move.

## Risks

| Risk | Mitigation |
|---|---|
| One walkable height per spot closes the tower's skirt and the cave's roof | Built into the plan on purpose (plinth drawing, plateau strips round the cave); tests walk the real ground |
| The `stair` kind touches shared start-up traversal code | One kind, one gait; the existing rails, hops and feats stay as they are; a test shows every Rooftops crossing is unchanged. Plan B above |
| Co-walker height on a stair not verified | M0 proves a partner sees her on the gallery, or the plan stops for a decision |
| The lamp lever as a tippable awards mischief paws | Accepted; it is 4 paws, once; the Market's crate does the same |
| The beam overdraw on old iPads | One cone, low tier drops the sweep, measured at M5 on the iPad and the iPhone |
| Seaside's triangle ceiling is nearly full | Measured at M4; fallback is a deliberate raise |
| World map crowding on the east coast | Test checks circles and labels; the builder may move the circle 25 units |
| The place chunk grows past 100 kB | Aim 65; the cave and cottage are the first to simplify; report at M2 |
| Start-up grows past the gate | Words go first (the rule the Market used); never trim silently, never raise the ceiling |

## Open questions for the owner (six)

1. **Always evening?** The place has the dusk look every walk (no collar), so the beam can sweep and the lamp task is always possible. Day gets no look of its own. **Recommend: yes, always golden-hour evening.**
2. **Unlock and editions?** 150 paws, after 2 Seaside walks (so after the Docks too), in both editions, ordered after Seaside on the map and in the place cards. **Recommend: yes, as suggested.**
3. **Keeper never shown?** The characters are the keeper's cat and her kitten; the keeper is a lit window, a chimney, a note on the door. **Recommend: yes** (cheaper, no person in her way, no new people code).
4. **Do the kitten and the lamp repeat every walk?** Each pays 25 paws once a walk, with the kitten hiding in one of three spots from the room seed. **Recommend: yes, once a walk each, as the Farm's jobs.**
5. **How many found outfits?** You asked for one: a keeper's cap (name to be picked). Twelve spots are required either way; after the cap, finds become 5-paw pouches. **Recommend: one now; add a second (a sea-glass charm for the neck) later if the pouches feel flat.**
6. **Names for the keeper's cat and the kitten?** Your daughter picks them. **Recommend: placeholders "Biscuit" (mother) and "Pebble" (kitten) until she decides.**
