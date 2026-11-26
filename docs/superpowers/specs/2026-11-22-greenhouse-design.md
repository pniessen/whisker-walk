# The Greenhouse: a glass-house garden north of the Farm (design)

Date: 2026-11-22. Status: draft for the owner's approval. Design only: no feature code is written, merged or pushed.
Plan: `docs/superpowers/plans/2026-11-22-greenhouse.md`. Shaped like the Lighthouse design (`lighthouse-design` branch) so the two can be read side by side.

Area id `greenhouse`; catalog name "The Greenhouse" (the same in both word sets, so no `PLACE_WORDS` row, as the Seaside, the Docks and the Farm have none).

## Intent

The owner's idea: a botanical garden with humid glass rooms (a palm house, an orchid room, a cactus house, a butterfly room), a pond with fish and lily pads, catnip beds (a joy spot), a potting shed with watering cans, a fountain, glass you can see through, mist and warm light. Gentle things to do: find the gardener's lost seeds, water the plants, chase butterflies, nap in a sunny patch. Golden mice, discoveries, one found outfit (a gardener's hat). It reuses the cat's existing moves (hop, climb pots, small ledges) and is never scary.

The players are a girl of 11 (she loves Warrior Cats) and a boy of 9. It is a **non-clan place**: no rival patrol, no border posts, no clan cats, no colony feeding (so no database change). It is in both editions and reads right under both word sets. It needs **no change to shared traversal code** (the Lighthouse needed one new kind; this place needs none).

## What I checked in the code (2026-11-22, read-only, main at cedddec0)

| Fact | Where | What it means here |
|---|---|---|
| A place is real when it has a builder module, a line in `AREA_LOADERS` and `AREA_ENTRY_MODULES`, a `CATALOG.areas` row and a `state.walks` key | `src/world/areas.js` header, `src/progression.js` | `greenhouse` is `own('greenhouse', world)`, its own lazy download (ceiling `AREA_GZIP_CEILING_KB` = 100). Unknown ids reject, so nothing can call it before the row exists. |
| Farm opens after 2 Park walks (75 paws); Fairground the same; the Rooftops after 2 Fairground walks (100) | `progression.js` rows `farm`, `fair`, `roofs` | "After the Farm" is one rule: `requires: { area: 'farm', walks: 2 }`. |
| Places without `edition: 'canon'` are in both editions; the Market and the Old House are canon only | `edition.js areaInEdition`, catalog rows | No edition key: the Greenhouse is in Clan and Legacy. Golden mice rise by 3 in both. |
| `STREET_PLACES` (park, fair, farm, docks, seaside) with `x, y, r`; roads are `GATEWAYS`; gate ends are `GATEWAY_ENDS`; icons and label anchors are in `ui/territorymap.js` | `src/worldmap.js`, `src/gateways.js` | A new street place is one circle, one land colour, one road, one icon, one label point, and one gate pair. |
| The map test requires every circle to clear every other (`dist >= r1 + r2`), the sea to be east of every circle, and the Park, Fair, Farm and Seaside to be entered from their south side (it checks only roads whose `to` is one of those) | `test/worldmap.test.js` | A road from the Farm's north edge to the Greenhouse's south rim passes; the gateways list test gains one row. |
| Farm: bounds x -44..44, z -44..50; its pond is a `waters` circle (`POND`, shallow 1.5 m, a jetty deck); 21 trees; 1 border of picket fence (gate cut with `cutForGates`) | `src/world/farm.js` | The Farm's end of the road is a gate on its north edge (z -44), on open ground. The pond shape is the template for the Greenhouse's pond. |
| Ground is shapes; one walkable height per spot; hops gain at most 1.6 m (2.2 with Spring Paws); a drop is at most 3 m | `src/ground.js`, `src/climbing.js` | Everything here is flat ground plus props she hops onto. No stair, no crossing, no new traversal kind. |
| A building (house with occluder) fades when the camera is inside or near its box; its `userData.window` meshes are hidden while it is faded; `dusk.js` lights `userData.window` | `src/treefade.js` header, `builder.js` houseGlass | The glass houses can be treated as buildings: the camera is never blocked by glass or roof, and the panes vanish when it matters. See "Glass". |
| `isTransparentMat` -> never a shadow caster; casters are trimmed by height and span | `src/render/rig.js` | Glass and mist cost no shadow-pass draws. |
| Shader-animated, `noMerge`, `noCast` meshes driven by one `uTime` uniform, frozen under reduced motion, phases from a fixed hash | `world/parkfountain.js` (drops, ripples), `world/marshlife.js` (`marshMist`, `dragonflies`) | The fish, the mist, the light shafts and the ambient butterflies use this pattern. No `Math.random`. |
| `butterfly` is a chaseable, pounce-able critter (two box wings); a "trail butterfly" orbits the cat; `frog` is stalkable prey | `src/critters.js` | The chase works today; only the colour needs a small option. |
| A held item can be `job: true`: carried like any item, never a den keepsake, no drop mark; rain loosens the grip after 6 s (`RAIN_GRIP`) | `src/carry.js` | The watering can is a job item. |
| `weather.setSheltered(on)` hides the rain column under a ceiling (the Gorge's caves use it) | `weather.js`, `gorgelife.js` | Rain falls outside, and under glass she is dry. |
| Jobs have states that never lead backwards and no clock; per device; nothing sent | `src/farmjobs.js` header | The seeds job and the watering job copy the Farm's job rules. |
| Discoveries: each place pays one `AWARDS.<place>find` (12) the first time ever and counts once per walk; finds are automatic, with no prompt | `discoveries.js`, `marketfinds.js`, `marketpages.js` | Six finds, one new award `greenhousefind: 12`. |
| Rests are `drink`, `eat`, `nap`, pay nothing, send nothing; poses `sniff` (drink and eat) and `nap` (with a purr) exist | `src/rests.js`, `game/avatar.js` | The catnip beds are `eat` rests (the `sniff` pose) with a purr line. No new pose. |
| Golden mice: three per area in `GOLD_MICE`; `y` is added to the ground height under the spot, or is the explicit height of a perch | `src/goldmice.js` | `GOLD_TOTAL` is 45 now (Legacy shows 21). With this place: 48 and 24. |
| Found outfits: 10 to 15 spots per area, none within 15 m of the spawn, at most `WEAR_PER_AREA` (4) records per area; the Farm already has `strawhat` and `featherplume`, the Seaside a `buckethat` | `foundwear/index.js`, `spots/index.js`, `head.js` | The gardener's hat must not be a second straw hat. See "Found outfit". |
| Budgets: start-up gz ceiling `MAIN_GZIP_CEILING_KB` 720 (the owner's figure for today: 708.9); place chunk at most 100 kB; per-place mesh, caster and triangle ceilings (Farm and Market 280 / 210 / 62,000; Seaside 85 / 45 / 30,000; Rooftops 450 / 380 / 70,000); merged ceilings pinned at about +12 % of measured; save under 150 kB | `scripts/buildjson.mjs`, `test/budget.test.js`, `test/savesize.test.js` | See "Budgets". |
| Words: `phrase(id, ...args)`; one table `LATER` in `clanphrases.js`; the everyday set overrides ids in `offclanwords.js`; people and house words are `words().OUTSIDE_WORDS.people` / `.house` (Twolegs / kittypet in the Clan set; townspeople / house cat in the everyday set); hint lines are in `tutorialwords.js` | `clanphrases.js`, `clanwords.js`, `offclanwords.js` | Lines read the same in both sets except where they take a set word, and the catnip lines (see "Words"). |

**Not verified (the plan's M0 checks them):** that a transparent, gradient-coloured pane mesh tagged `userData.window` behaves under `dusk.js` and `treefade.js` as the house windows do; that the Farm's north edge has open ground for a gate; where the fountain's drops and ripples code lives for reuse and what a shared chunk does to the per-area size count; how a job pickup that is not a collectible is counted (the Farm's chicks follow instead of being picked up).

## Decisions I made (the owner can change any; the six that need him are at the end)

1. **Ordinary day, ordinary weather.** No `evening: true`. The place keeps the normal day and dusk looks and the walk's weather. Rain falls outside and patters on the glass; under glass she is dry (`setSheltered`). Rain makes this place cosier, not worse.
2. **The gardener is never shown.** A straw hat on a hook, muddy boots by the shed door, a half-drunk mug, a note. This keeps `people/index.js` out of the chunk and keeps "no person in the way" free (the Lighthouse's keeper rule).
3. **Never scary.** Nothing dark, nothing chases, nothing falls. Cacti are soft cartoon shapes ringed by a collider so she cannot walk into them, with no spines drawn as spikes. No bees. No heights above one pot stack; no ladder, no stair.
4. **Glass is a picture, not a material.** One merged pane mesh per house, seen from outside and invisible from inside (back-face culled). No refraction, no reflection probe, no real lights.
5. **Both jobs repeat every walk**, once a walk each, no clock, no failure, per device, as the Farm's jobs.
6. **Build in two stages.** Stage A (M1 to M4) is the garden, the pond, the fountain, the shed and the Palm House: a whole, shippable place with all three golden mice, all twelve outfit spots, the watering job, the catnip, palm and koi finds. The Orchid, Cactus and Butterfly rooms are stage B (M6 in the plan): their three finds' journal pages, the seeds job's room spots, the butterfly chase and the three scenic spots. Journal ids for the stage-B finds are appended when stage B ships (they are start-up data, a few bytes). The budget below is for both stages.

## The place

Metres. x east, z south (north is -z). First drafts for the builder to tune against the walkability and reach tests. The sky is open above the garden; the glass houses are buildings on flat ground (level 0 everywhere).

- **Bounds:** x -40..40, z -36..36 (80 x 72 m; the Farm is 88 x 94).
- **Spawn:** (0, 30), facing north: the fountain, then the Palm House's glass front straight ahead.
- **Gate (to the Farm):** a `signpost` at (0, 34.5), arriving at (0, 30.85) facing north (3.65 m clear, as every arrival).

### Plan view (north up)

```
 z -36 +-----------------------------------------------------------------+
       |        (outdoor strip: 4 trees, ferns, a bench)                 |
       |                   BUTTERFLY ROOM  x -10..10, z -32..-18         |
       |                   dome 8 m, door south at (0,-18)               |
 z -18 |           ----------------[door]----------------                |
       |  ORCHID ROOM            PALM HOUSE            CACTUS HOUSE      |
       |  x -32..-14            x -14..14, z -18..0    x 14..32          |
       |  z -15..-3             ridge 11 m, 28 x 18    z -15..-3         |
       |  ridge 5 m   [door]    palms, fern island    [door]  ridge 5 m  |
       |              (-14,-9)  sunbeam nap (-7,-5)   (14,-9)            |
 z   0 |                        [door S (0,0), 3 m]                      |
       |                                                                 |
 z   8 |  POND GARDEN            FOUNTAIN COURT           KITCHEN GARDEN |
       |  pond (-26,18) r 6.5   fountain (0,14) r 3.2     potting shed   |
       |  lilies, fish, frogs   catnip beds (+-11,12)     (28,16) 7 x 5  |
       |  stepping stones       sunny bench (-12,24)      cold frames    |
       |                                                  rain barrel    |
 z  36 +----------------------[gate (0,34.5)]---------------------------+
        x -40                    x 0                          x 40
```

| Zone | Footprint (m) | What is there |
|---|---|---|
| Gate court | x -8..8, z 26..36 | Spawn, the gate, gravel, two lamps, a bench |
| Fountain court | x -14..14, z 4..26 | The fountain (collider r 3.4), two catnip beds, clipped hedges, a sunny flagstone patch with a bench, the path north to the Palm House door |
| Pond garden | x -40..-14, z 6..30 | Pond (-26, 18) r 6.5 with a 1.5 m wading band, 5 stepping stones (flat, at ground height, a hop in the eye only), lily pads, 6 koi, 2 frogs, reeds, a willow, a bench |
| Kitchen garden and shed | x 14..40, z 6..30 | Potting shed (28, 16) 7 x 5 (door faces west, roof 2.4 m), cold frames (0.8 m glass-topped boxes), bean rows, a rain barrel, two stacks of flower pots, a cardboard box |
| Palm House | x -14..14, z -18..0 | Barrel-vaulted glass hall, ridge 11 m: six palms (7 to 10 m), banana plants, tree ferns, a raised fern island with a path round it, a warm tiled floor, hanging baskets, a sunbeam nap patch, mist. Doors: south (0, 0), west (-14, -9), east (14, -9), north (0, -18), each 3 m wide |
| Orchid Room | x -32..-14, z -15..-3 | Low and warm (ridge 5 m): orchid benches 0.7 m high with pots, hanging orchids, a pink-tinted light, a high shelf (1.0 m) |
| Cactus House | x 14..32, z -15..-3 | Sand floor, cacti in soft clusters with colliders, pots on low walls (0.5 m), one flowering cactus, bright light |
| Butterfly Room | x -10..10, z -32..-18 | Dome (ridge 8 m), flowering shrubs, a small stream (decor), butterflies, a hibiscus hedge at the back, a bench |
| Outer strips | x -40..-32, x 32..40, z -36..0 | Trees, ferns, a bench, the horizon band beyond |

Interiors are open floor 2.2 m or more between obstacles, so she never gets pinched and the camera has room. All doors are real gaps in the frame (the frame is solid), as the Lighthouse's lamp room.

### Map placement and unlock

- **World map:** `STREET_PLACES` gets `{ id: 'greenhouse', areaId: 'greenhouse', x: 1215, y: 150, r: 60 }`, north of the Farm. Distances (first draft): to the Farm (1235, 320) 171 (needs 145), to the Fairground (1060, 230) 174 (needs 145), to the coast point (1320, 160) the circle's east edge is 1275 (clear). The builder may move it up to 25 units. `STREET_LAND.greenhouse` is a minty glass green (`#bfe3b5`). Icon 🌿, `STREET_LABEL_AT.greenhouse` at (1215, 156).
- **Road:** `GATEWAYS` gets `farm-greenhouse`, from the Farm's north rim to the Greenhouse's south rim: `[[1235, 235], [1236, 226], [1226, 218], [1222, 210]]` (first draft; the builder checks it against the labels as Market step 4 did). A short road, as the Greenhouse is the Farm's neighbour.
- **Unlock:** `greenhouse: { name: 'The Greenhouse', price: 100, requires: { area: 'farm', walks: 2 } }`, no `edition`, placed after `farm` in the catalog list (place cards follow its order). It is not a kept offer. The Farm already needs 2 Park walks, so a save that can buy it has done both. Same price as the Rooftops; between the Farm's 75 and the Market's 150.
- **Gateways:** the Farm end `farm-greenhouse` is a `farmgate` set into the north picket fence (`cutForGates`), an `edge` end on open ground 2.5 to 3.5 m inside the bounds (the builder picks the x clear of the scarecrow at (7.6, -27), the wheat and the paddock; first guess x 14). The Greenhouse end `greenhouse-farm` is a `signpost` with `sign: true` at (0, 34.5), arriving at (0, 30.85). Both go in `GATEWAY_ENDS`; a live gate exists only once the catalog row does.
- **Dev switch:** `?greenhouse=1` starts a solo walk while the place is built (the `?roofs=1`, `?market=1` pattern); it becomes a shortcut at M4.

## Glass and mist (cheap, no real refraction)

The whole trick is five flat, cheap parts. None is a light and none samples the screen.

| Part | How | Cost |
|---|---|---|
| **Frames** | Mullions, ribs and the base wall merged into ONE opaque, vertex-coloured mesh per house (white-green paint, a darker plinth). `noCast`: the thin lattice would cost a shadow draw for no look; the floor gets the dapple below instead | 1 mesh per house |
| **Glass** | ONE transparent mesh per house, built from quads (about 400 for the Palm House). Colour is a vertical gradient (the Market's `gradientOf`, sky blue near the roof, paler at the base) with a low alpha (0.14 on walls, 0.26 on the roof), `depthWrite` off, and **front faces only**. From outside she sees the glass; from inside the glass is back-facing and is culled, so inside views are clear and cost no overdraw. Tagged `userData.window` so `treefade` hides it when the house fades, and `dusk.js` can warm it at dusk | 1 mesh, about 900 triangles |
| **Camera** | Each house registers as a building box (as the town's houses): the roof and walls fade when the camera is inside or close, and the panes are hidden outright (the roughedges rule). The cat is visible through the glass from every outside angle by simply being there. No camera special case | 0 |
| **Mist** | 3 to 5 flat, soft-edged sheets per house (0.4 to 0.9 m tall, near the floor and at the doors), one `marshMist`-style shader mesh with one `uTime`, slow drift, frozen under reduced motion, `noCast`, alpha-blended. A door curtain is two of the same sheets across the doorway. Outside, a vent puffs steam from the shed's pipe (the Rooftops' smoke) | 1 mesh per house group, about 200 triangles |
| **Warm light** | 2 to 6 sun shafts per house: tall, additive, vertex-faded cones or quads under the roof's ridge, swaying a few degrees over 20 s. On the floor, one flat multiply quad of **dapple** (a diamond grid of light squares, the roof lattice's shadow, drawn once on a small canvas texture inside `build`, never at import) per house. Warm tint on the floor's vertex colours, and `groundBounce` warm for the area | 2 meshes per house, about 80 triangles |

**Low tier:** drops the mist and the shafts, keeps the frames, the single glass layer and the dapple. **Overdraw ceiling:** a view from outside through two houses is at most 2 glass layers (back faces are culled); mist and shafts add at most 2 more, only on the high tier. I measure it at M2 on the oldest iPad.

**Moisture and rain:** glass panes get a slightly higher alpha in their lowest 0.4 m (a wet edge) in the gradient, no extra mesh. In rain, `setSheltered(true)` while the camera is inside a house's box, and a soft patter loop plays through `greenhousesound.js`.

## Things to do

All of it is optional, none has a clock, nothing fails.

| Thing | How it works | Pay (existing awards unless marked new) |
|---|---|---|
| **Explore** | Scenic spots (below) feed "visit 2 special places" and the corner map | `scenic` 8 each, first visit per walk |
| **The gardener's lost seeds** | A note on the shed door says the wind blew the seed packets away (the offer: a line, no text wall). Five packets lie in the open, picked from the room seed out of three sets of five spots (the Farm's chick sets pattern): under a hedge, on a lily-pond stone, behind a palm, on an orchid bench, in the butterfly room. She picks each by walking to it (a small paper packet; a rustle and a count, "3 of 5"). With five, she brings them to the seed tray on the shed's bench: the packets are sown, little green shoots pop up in the kitchen-garden bed. Nothing is carried (a cat holds one thing), so the count is a number | **New** `greenhousejob: 25`, once a walk (the Farm's `farmjob` number). Per device; nothing sent |
| **Water the plants** | The shed's watering can (a `job` carried item) is fetched; four drooping pots (picked from the seed out of eight candidate spots in the garden and houses: their leaves bow and a tiny cloud shows over each) are watered with the action button, each perks up with a sprinkle and a happy chime. After the fourth the can goes back to its hook. A can slips if carried in falling rain for 6 s (the existing rule): she picks it up again, recoverable and funny | `greenhousejob: 25`, once a walk (same award, a second key). Per device; nothing sent |
| **Chase butterflies** | Four real `butterfly` critters in the Butterfly Room (chaseable, they flutter off) plus a cloud of ambient ones that cannot be caught. The "pounce on 2 animals" goal fits. Never a catch that hurts | `critter`, `pounce`, as everywhere |
| **Catnip beds (a joy spot)** | Two beds, each a rest of kind `eat` (the `sniff` pose, as a bowl). A purr, hearts, a happy line. Pays nothing and can be done any number of times | The catnip find pays once; the rest pays nothing (the rest rule) |
| **Nap in a sunny patch** | Two `nap` rests: the sunbeam on the Palm House's warm tiles, and a sunny bench in the court. A purr, as every nap | Nothing (the rest rule) |
| **Discoveries** (6 journal pages, below) | Found by doing, never prompted | **New** `greenhousefind: 12`, first time ever; later walks count once on the page |
| **Golden mice** (3) | Hidden; see below | The golden-mouse award |
| **Collectibles** (5) | A snail shell, a tiny brass trowel, a blue pot shard, a dried pink rose, a glass marble | `collectible` 10 |
| **Mischief and play** | Tippables: two watering cans, three flower pots, a bin (6, so "knock 3 things over" fits); a cardboard box by the shed ("sit in a box"); frogs and butterflies to stalk and pounce | The usual awards |
| **Drink** | The fountain's rim (a `drink` rest) | Nothing (the rest rule) |
| **Yarn ball** | One lies somewhere each walk (`propsets.js`) | as everywhere |
| **Moments** | A frog plops into the pond; a sparrow bathes in the fountain | `moment` 12 |
| **Found outfit** | One hidden find a walk at one of 12 spots (below) | free |

### The six discoveries (found automatically)

| Id | Journal page | How it is found |
|---|---|---|
| `palm` | Under the Palms | Standing in the Palm House's centre ring for 2 s: a cool drop of mist lands on her nose |
| `koi` | Pond Watcher | Sitting still at the pond's north rim for 3 s: a fat orange fish blows a bubble |
| `catnip` | The Catnip Bed (Clan: The Catmint Bed) | Starting a rest at either bed |
| `orchid` | The Orchid Bench | Standing by the blue orchid on the first bench for 2 s: it opens |
| `cactus` | The Cactus Flower | Sitting beside the flowering cactus for 2 s: a pink flower pops open |
| `butterfly` | Butterfly on Your Nose | Sitting still in the Butterfly Room's middle for 3 s: one lands on her head |

Journal types appended to `JOURNAL_TYPES`: `ghpalm, ghkoi, ghcatnip, ghorchid, ghcactus, ghbutterfly` and the two jobs `ghjobseeds, ghjobwater`, in a new `src/greenhousepages.js` (start-up: ids and word lookups only, as `roofspages.js` and `marketpages.js`). The find rules live in the chunk (`greenhousefinds.js`, as `marketfinds.js`). Each find is its own way at its own spot, so one spot never finds two.

### Golden mice (3, none beside a find, a collectible or a discovery)

| Id | Where | Reached by |
|---|---|---|
| `gm-green-1` | The potting shed's roof (explicit height about 2.5 m), at (29.5, 15.2) | Three hops: ground, the pot stack (0.7 m), the rain barrel (1.3 m), the roof (2.4 m). Base climb rule only |
| `gm-green-2` | The Palm House's north-west corner, behind the banana plants, (-12, -16), ground level | Walking |
| `gm-green-3` | The fallen willow log at the pond's far side (0.8 m), (-34, 20) | One hop |

None needs Spring Paws, Long Leap or any skill. All three sit in stage A, so the three ids exist from the first release and never move. A test walks the real plan to each. Totals: Clan 48, Legacy 24 (Lighthouse not counted).

### Scenic spots (for the corner map, gifts and "visit 2 special places")

`greenhouse-palms` (the Palm House's centre, (0, -9)), `greenhouse-pond` ((-26, 10.4), the north rim), `greenhouse-orchids` ((-23, -9)), `greenhouse-butterflies` ((0, -26)), `greenhouse-shed` ((24, 16), the shed's door). Their ids are load-bearing once shipped (gifts persist them), so they are chosen once. Labels go through the word tables. Not on the corner map: golden mice, finds, collectibles, the seeds. The orchid and butterfly spots arrive with stage B (the catalog's scenic list is the area's own data, so nothing is saved for a room that is not built).

## Moves and skills

| Skill or move | Here |
|---|---|
| **Climb, hop up/down** | Pot stacks, benches, cold frames, the barrel, low walls and the shed roof are ordinary perches within the base climb budget (1.6 m, 2.2 with Spring Paws). Nothing is higher than 2.5 m |
| **Crossings, leaps** | None. A plank over the pond's neck would be a free `plank` crossing; I leave it out (an extra to add later, not needed) |
| **Sure Claws** | Not needed. The tree-fern trunks may be listed as marks later |
| **Sea Legs** | The pond's 1.5 m band is wading, as the Farm's pond (the Farm has no skill gate on it); nothing is deeper |
| **Night Eyes** | Not needed; the glass houses are bright at dusk (the glass warms) |

## Budgets

Ceilings follow the street places' ruling (the Farm's and the Market's): **280 meshes, 210 shadow casters, 62,000 triangles** for the build, and merged **about 80 / 40**, pinned at about +12 % over the measured numbers once built. The aim is 150 / 70 / 52,000 built. Estimates (built, before merging):

| Piece | Meshes | Triangles |
|---|---:|---:|
| Ground, paths, beds, lawns, ground paint | 6 | 3,200 |
| Palm House (frame, glass, plinth) | 3 | 6,300 |
| Orchid Room (frame, glass, plinth) | 3 | 3,800 |
| Cactus House | 3 | 3,600 |
| Butterfly Room (dome frame, glass) | 3 | 5,200 |
| Potting shed, cold frames, barrel, benches, cans, pot stacks, box | 16 | 4,200 |
| Palms, bananas, tree ferns (merged by kind) | 8 | 6,000 |
| Ferns, flowers, orchids, cacti, succulents, hanging baskets | 14 | 6,000 |
| Pond, lily pads, stepping stones, reeds, koi (one shader mesh) | 8 | 3,300 |
| Fountain (reused kit) with drops and ripples | 4 | 2,400 |
| Catnip beds, clipped hedges, topiary | 8 | 3,000 |
| Garden dressing (lamps, signs, outside trees, benches) | 14 | 2,800 |
| Mist, shafts, dapple, steam | 12 | 600 |
| Horizon band and its edge | 2 | 2,800 |
| **Built total** | **about 104** | **about 53,200** |
| Gate dressing (one signpost) | 2 | about 400 |
| Life (4 butterflies, ambient butterflies, 2 frogs, 3 sparrows, 2 job props): at most | 12 | 3,000 |

That is about 56,600 triangles drawn, under 62,000, with 5,400 to spare, and 104 meshes against 280. To reach the 52,000 aim I trim 1,200 in M2 (hedges, bushes). Casters: the palms (merged), the shed, hedges, the fountain, the outer trees (about 40 after merging); glass, frames, mist and small props are `noCast`. Triangles are cheap here; meshes and casters are the scarce ones (the budget test's own header).

| Gate | Value | Rule |
|---|---|---|
| Start-up chunk | **708.9 now; at most 710.5 after the words and rows (M3), at most 711.0 at M5; stop at 711.5** | `MAIN_GZIP_CEILING_KB` 720 is never raised. The place adds data rows only: about 1.9 kB gz (catalog row, 8 journal ids, about 60 phrases in the `LATER` table and the everyday overrides, a hint, 12 find spots and a hat, gateway and map rows, a flag module). Less than the Lighthouse's about 2.3 kB (no traversal kind) |
| Place chunk | aim 55 kB gz, hard 100 | `npm run build` prints it; `areaSizeProblems` fails over 100. If the fountain kit sits in a shared chunk, the plan reads how the build counts it |
| Farm's own ceilings | 280 / 210 / 62,000 (measured about 53,400 triangles) | The gate adds about 400; fits, no raise |
| Save size | under 150 kB (about 101 now) | Eight journal ids and one walks key add well under 0.2 kB |
| Frame rate | Old iPads matter most; the owner reads the iPhone | One glass mesh per house, back faces culled, no real lights, no full-screen effect; the low tier drops mist and shafts |

If the Lighthouse also merges, start-up goes up by its own 2.3 kB; the two together stay near 713.5, well under 720. Each place is gated on its own.

## Kit reused and art needed

**Reused (no new code, or tiny leaf additions):**

| Piece | From |
|---|---|
| Ground shapes, hedges, trees, ferns (`fernBed`), flowers, reeds, lily pads, the pond shape, stepping stones, the willow | `ground.js`, `world/builder.js`, `plants.js`, `farm.js` (`POND`), the Pines' lily pads, the River's tussocks |
| The fountain (basin, water, drops, ripples) | `world/parkfountain.js`, and the Market's fountain |
| Shader-animated meshes on one `uTime`, reduced-motion freeze, hashed phases | `parkfountain.js`, `marshlife.js` (`marshMist`, `dragonflies`) |
| Sky-glass gradient, mullions, sills, flower boxes | `world/market.js` `gradientOf` and the shop fronts' window kit |
| Building fade, window hide, dusk glass | `treefade.js`, `render/dusk.js` |
| Weather shelter | `weather.js` `setSheltered` (the Gorge's caves) |
| Critters `butterfly`, `frog`, `bird`; moments | `critters.js`, `propsets.js` hides |
| Carried `job` item, the Farm's job states | `carry.js`, `farmjobs.js` |
| Tippables `can`, `pot`, `bin`; the cardboard box; markables | `tippables.js`, `knockables.js`, `builder.js` |
| Rests (drink, eat, nap) and their poses and purr | `rests.js`, `game/avatar.js` |
| Journal pages and awards pattern | `marketfinds.js`, `marketpages.js`, `roofspages.js` |
| Gate looks | `world/gateway.js` (`farmgate`, `signpost`) |
| Found outfit piece (the bucket hat's shape) | `foundwear/head.js`, `cat/hats.js` |
| Ambient sound entry | `audio.js` (area rows), `marketsound.js` / `roofssound.js` pattern |

**New art:** the glass-house kit (arched rib frame, pane grid, plinth, doors, in four sizes); the dapple texture; mist sheets and sun shafts; six palm and banana and tree-fern shapes; cacti (3 shapes) and a flowering one; orchids (bench pots, hanging, the opening one); the potting shed (door, bench, hooks, seed tray, window); cold frames; watering cans; flower-pot stacks; the koi (shader mesh); a stream bed for the Butterfly Room; hibiscus; catnip beds; the seed packets (paper, 10 triangles each); the gardener's hat; a butterfly colour option (a tiny leaf change in `critters.js`); the card picture `public/places/greenhouse.jpg`; a test page `verify-greenhouse.html`.

## Found outfit (one, as asked)

A **gardener's hat**: a soft sage-green canvas hat with a wide brim and a small white daisy, a head piece reusing the Seaside's `buckethat` shape in new colours (id `gardenerhat`, 11 letters, emoji 🌼; name a placeholder, as for every found outfit; the owner and his daughter pick it). It is deliberately not a straw hat: the Farm already hides `strawhat`. Twelve find spots in `src/foundwear/spots/greenhouse.js` (the rules need 10 to 15, none within 15 m of the spawn, none in water, none at a golden mouse or collectible; a raised one at most 3 hops up; each rests on a mesh): four in the garden (a hedge foot, the willow, a stone, the sunny bench), three at the pond, two by the shed (one on a cold frame), three in the Palm House. All twelve are in stage A's ground, because adding or moving a spot changes `FIND_KEY` (builds with different spots never share finds), so stage B's rooms must not touch the list. After she has it, the walk's find is the coin pouch (5 paws), as for every place. A second and third outfit can follow (up to 4 records a place; a flower crown for the neck is the obvious one).

## Pad, phone and TV

| Concern | What I do |
|---|---|
| **Pad (DualSense)** | The existing stick and jump button only. The two actions (pick up the can, water a plant) use the one action button; rests and the seed tray use the action button too. No new button. TV mode's focus ring and glyphs come with it. The corner map shows the plan only |
| **Phone** | No new on-screen controls. Prompts are one short line (the playtesters' note that messages take a quarter of the screen). The glass houses fade so the cat is never hidden. The low tier drops the mist and shafts; the pond's fish are one shader mesh and cost nothing to drop |
| **TV** | Big flat shapes: thick frames, no tiny text on any sign. A greenhouse at rest is a postcard, so keep the sun shafts calm (a few degrees of sway, no flicker). Sound under the sound switch: drips, a trickle and a few birds, all soft (a living-room volume note, as TV mode's design says). Overdraw is the thing to watch on a big screen, so the glass uses back-face culling |
| **Camera** | Inside the Palm House the camera ceiling is the glass, which fades; there is no ground ceiling here, so `CAM_CEIL_CLEAR` is not involved. Doors are 3 m wide and floors are open, so the camera never has to squeeze |

## Words (both sets)

Every line goes through `phrase()` (new ids in `LATER`, under `// ---- The Greenhouse (2026-11-22) ----`) and `tutorialwords.js`; no series word appears in a string literal. "Same" means one line in both sets. Place name: none (catalog name "The Greenhouse"). The only lines that differ: the catnip lines (the Clan set says catmint, the plant the books use for healing), and the lines that take a set word at read time (`words().OUTSIDE_WORDS.people`: Twolegs in the Clan set, townspeople in the everyday set).

| Id | Clan Edition set | Everyday set |
|---|---|---|
| `hint.greenhouse` | Warm glass houses full of plants. Peek inside! | same |
| `greenhouse.scenic.palms` | the Palm House | same |
| `greenhouse.scenic.pond` | the lily pond | same |
| `greenhouse.scenic.orchids` | the orchid room | same |
| `greenhouse.scenic.butterflies` | the butterfly room | same |
| `greenhouse.scenic.shed` | the potting shed | same |
| `greenhouse.perch.pots` | the stack of flower pots | same |
| `greenhouse.perch.frame` | the cold frame | same |
| `greenhouse.perch.shelf` | the orchid shelf | same |
| `greenhouse.collect.snail` | a speckled snail shell | same |
| `greenhouse.collect.trowel` | a tiny brass trowel | same |
| `greenhouse.collect.shard` | a blue pot shard | same |
| `greenhouse.collect.rose` | a dried pink rose | same |
| `greenhouse.collect.marble` | a glass marble | same |
| `greenhouse.moment.frog` | a frog plopping into the pond | same |
| `greenhouse.moment.sparrow` | a sparrow splashing in the fountain | same |
| `greenhouse.seeds.note` | (people) One of the {people} left a note: the wind blew the seed packets away! 🌱 | {people} = townspeople; the line is otherwise the same |
| `greenhouse.seeds.pick` | A seed packet! {n} of 5. | same |
| `greenhouse.seeds.all` | That is all five! Take them back to the potting shed. | same |
| `greenhouse.seeds.done` | Seeds sown! Little green shoots pop up. 🌱 | same |
| `greenhouse.can.offer` | The plants look thirsty. Is there a watering can? | same |
| `greenhouse.can.prompt` | E — pick up the watering can | same |
| `greenhouse.water.prompt` | E — water the plant | same |
| `greenhouse.water.one` | Ahh! The plant stands up tall. 💧 | same |
| `greenhouse.water.all` | Everything is watered. The glass house sighs happily. 🌿 | same |
| `greenhouse.page.palm.name` / `.hint` | Under the Palms / It is cool and drippy under the big leaves. | same |
| `greenhouse.page.koi.name` / `.hint` | Pond Watcher / Sit very still by the pond. Who is down there? | same |
| `greenhouse.page.catnip.name` / `.hint` | The Catmint Bed / Something in the garden smells wonderful. | The Catnip Bed / Something in the garden smells wonderful. |
| `greenhouse.page.orchid.name` / `.hint` | The Orchid Bench / One orchid is shy. Wait beside it. | same |
| `greenhouse.page.cactus.name` / `.hint` | The Cactus Flower / Prickly plants have a soft secret. | same |
| `greenhouse.page.butterfly.name` / `.hint` | Butterfly on Your Nose / Butterflies like a cat who holds still. | same |
| `greenhouse.find.palm` | A cool drop of mist lands on your nose. 💧 | same |
| `greenhouse.find.koi` | A fat orange fish blows you a bubble. 🐟 | same |
| `greenhouse.find.catnip` | Catmint! It smells like a medicine cat's den. Mmmm. 🌿 | Catnip! Mmmm, it smells so good. 🌿 |
| `greenhouse.find.orchid` | The orchid opens up, just for you. 🌸 | same |
| `greenhouse.find.cactus` | A little pink flower pops open on the cactus. 🌵 | same |
| `greenhouse.find.butterfly` | A butterfly lands on your nose. Hold still! 🦋 | same |
| `greenhouse.job.seeds` / `greenhouse.job.water` (summary labels) | seeds sown / plants watered | same |

Lines are pitched for a 9-year-old, one line each, never a scold, never a scare. The Clan set's catmint line is the one place the series shows; the everyday set carries the same meaning in plain words. Refresh the snapshots as the Market's plan says (`UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`, plus `test/offwords.test.js`), keeping only this place's lines.

## Anti-goals (a failure even if it works)

- Anything dark or scary: no spiked cactus drawn to hurt, no bees or stinging things, no chase, no shout, no timer, nothing falls.
- A person in the way: none is shown. The gardener is a hat, a note and some boots.
- A pane that hides the cat, or a camera stuck behind glass or inside a palm.
- A real light, a screen-sampling effect or any refraction (cost, and the owner's "no real lights" rule).
- A second place's rules changed: the Farm gets one gate and nothing else; `flat-trace.gameplay.json` does not move; no shared traversal code changes.
- A job that can fail, lock or expire. A watering can that is lost for good (it slips in rain and she picks it up again).

## Risks

| Risk | Mitigation |
|---|---|
| Transparent panes interact badly with `dusk.js` window swaps or `treefade`'s window hiding | M0 builds one house and checks both on a test page; if they clash, the glass is excluded from the dusk swap and warmed by its own uniform |
| Overdraw on old iPads (glass, mist and shafts together) | Front faces only (inside views cost nothing), one glass mesh per house, the low tier drops mist and shafts, measured at M2 and M5 on the iPad and the iPhone |
| The camera inside an 11 m glass hall or a dense palm stand | Palms keep a clear loop path 2.2 m wide; the building fade handles walls and roof; M0 checks the camera at the Palm House's ridge |
| The fountain kit lives in another place's chunk | M0 reads where it sits; the kit goes in a shared module, or a small copy stays in the Greenhouse's chunk, and the per-area size count is read before choosing |
| A job pickup that is not a collectible has no precedent in pickups | M0 reads `collectibles` and `farmjobs`; the packets copy one of them. If neither fits, the seeds job counts "visited spots" by proximity, as the finds do |
| Seaside-style crowding on the map (Farm, Fair, coast) | Test checks circles and labels; the builder may move the circle 25 units |
| Place chunk grows past the aim | Aim 55; stage B's three rooms are the first to simplify; report at M2 |
| Start-up grows past the gate | Words go first (the Market's rule); never trim silently, never raise the ceiling |
| Fish and butterflies show an unseeded motion (a replay drift between co-walkers) | Fish and ambient butterflies are shader-driven from `uTime` and hashes; real critters are per device, as everywhere |

## Open questions for the owner (six)

1. **Where does it sit, and what does it cost?** North of the Farm on the world map, 100 paws after 2 Farm walks, in both editions, with a short road and a gate on the Farm's north fence. **Recommend: yes, as suggested** (it is the Farm's neighbour, mid-priced, and nothing else changes on the map).
2. **Is the gardener never shown?** The characters are the plants, the butterflies and the fish; the gardener is a hat on a hook, boots, a mug and a note. **Recommend: yes** (cheaper, no person in her way, no people code in the chunk).
3. **Do the two jobs repeat every walk?** The seeds and the watering each pay 25 paws once a walk, with new spots from the room seed, no timer, never failing. **Recommend: yes, once a walk each, as the Farm's jobs.**
4. **The gardener's hat: yes, and what is it called?** A sage-green canvas hat with a small daisy (not a straw hat, since the Farm has one), 12 find spots, the name is a placeholder; after it, finds become 5-paw pouches. **Recommend: one now, "Gardener's hat"; add a flower crown later if the pouches feel flat.**
5. **Catnip beds: just joy, and "catmint" in the Clan set?** A rest that pays nothing, repeatable, with a purr, hearts and a find the first time; the Clan set calls it catmint (the books' healing plant), the everyday set catnip. **Recommend: yes to both.**
6. **One go, or in two stages?** Stage A ships the garden, pond, fountain, shed and the Palm House (with the three golden mice and the hat's twelve spots); stage B adds the Orchid, Cactus and Butterfly rooms (and their three finds) as an update. The butterfly chase is in stage B. **Recommend: two stages, so the first place is a whole one soon; the rooms follow if the budget holds.** (If you want the butterflies on day one, the Butterfly Room moves into stage A and the Cactus House waits.)
