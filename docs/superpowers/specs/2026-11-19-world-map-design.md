# One world: every place on one map, joined by gateways (design, 2026-11-19)

## Why

The owner asked (2026-11-19) for "a plan to knit all the areas together into
an integrated meta-map, like the Clan Cat areas but broader", one
"meta-geography that ties together all we've developed". Today Clan Edition
has a storybook map of the wild places (the older playtester's own drawing)
with border posts between them, while the street places (Park, Docks,
Seaside, Farm, Fairground) are separate picture cards with no place in any
world. The game should feel like one world a child can walk across and make
sense of.

Players: a girl of 11 (she drew the territory map) and a boy of 9, and soon
the public.

## Owner decisions (2026-11-19, all from questions with choices)

1. **Retire Legacy Edition.** Two versions remain, Clan Edition and the
   everyday-words version (crews instead of clans), and both share the one
   world map.
2. **The map lets the children** walk from place to place, see where
   everything is, pick a place on the map, and make sense of the world (all
   four).
3. **Gateways between places**, not one seamless world: each place stays its
   own walk; at its edge a path, gate, lane or bridge leads on, she walks
   through, and the next place opens. (One seamless world was offered and not
   chosen.)
4. **Claude drafts the layout, the owner approves.** He approved draft 1
   ("Looks right"), then, when the builder check found that two walks face
   differently from it, chose to **redraw the map** to match the walks rather
   than bend the gateways: draft 2, `img/2026-11-19-world-map-draft-2.svg`
   (awaiting his look).
5. **Unlock order follows the map:** the Docks open first (after the Park),
   the Seaside after the Docks. (Moving them on the map was offered and not
   chosen.)
6. **A shut gate can be opened right there:** until a place's walks are done
   the gate is shut with a friendly sign; once they are done the gate offers
   the place, with the usual "Get it?" card.
7. **Change place becomes the map only**: tapping a place shows its card as a
   pop-up. The picture-card list goes.
9. **Gateways walk straight on** (2026-11-19): a short "Off to the Farm!"
   moment, then she arrives at the matching gate in the new place, and a
   friend's room stays together. (Ending the walk as border posts do today was
   offered and not chosen.)
8. **Legacy saves move over quietly**: everything earned is kept; they wake up
   in the everyday-words version with the wild places on their map and meet the
   "pick your home" story moment when the Woods opens.

## Approaches considered

| | How | Trade-off | |
|---|---|---|---|
| **A** | **Gateways: each place its own walk, joined at its edges** | Reuses the border posts' crossing flow; each place keeps its own triangle budget; works the same for two players | **chosen** |
| B | One seamless world drawn near the cat | No breaks at all; a very large build, the riskiest for older iPads and for co-walks | not chosen |

## What exists today

- **The territory map** (`src/territories.js`, `src/ui/territorymap.js`): a
  1000 x 700 board drawn from her layout; town (843, 566), Woods, Moor,
  River, Pines with the lake and island, Gorge; paths, the river, the bridge;
  drawn on Change place in Clan Edition.
- **Border posts** (`src/borderposts.js`, `src/bordercross.js`,
  `src/game/crossing.js`): a post 2.5-3.5 m inside an edge names the place
  over it (rules R1-R6, `test/borderposts.test.js`). At it, a "Head to ...?"
  card ends the walk with `crossTo`: the summary shows, Continue opens home
  with the new place picked (`main.js` ~699-704), she presses Explore and
  starts at that area's usual spawn; a room is closed, not moved (the guest is
  told to start again from home). Posts and their prompt exist in Clan
  Edition only (`walk.js` ~614, `interactions.js` ~1179).
- **How the walks face** (from the builder check): the Seaside's sea covers
  everything east of x 25 with the cliff behind its north bound, so its only
  land entrance is the south beach end; the Park, the Fairground and the Farm
  are all entered by gate, lane and spawn on their south edges; the Docks is a
  canal-and-warehouse district with no sea edge. Draft 2 is drawn to fit. The town's posts are on its west and north
  edges; **its east and south edges are free**.
- **The unlock chain** (`CATALOG.areas` in `src/progression.js`): Park 50
  after 2 Neighborhood walks; Farm 75, Fairground 75 and Seaside 100 after 2
  Park walks; Docks 200 after 2 Seaside walks; the wild places free after
  walks in their neighbours.
- **Editions** (`src/edition.js`): `canon` (Clan) and `legacy`; the wild
  places are `edition: 'canon'`. The everyday word set exists
  (`src/offclanwords.js`) but is not switched on yet (series switch Phase 3).
- **Buying** goes through the "Get it?" card (`spendAsk`,
  `src/ui/confirmcard.js`).

## The world (draft 2, redrawn to match the walks)

Board widened to the east around her 1000 x 700 board, which keeps every
position she drew, her three paths and the bridge (draft 1 had nudged the
town and left out her paths; draft 2 fixes both).

- **Wild places, unchanged:** Pines and Swamp, Moor, River and Marshes, Woods,
  Gorge, the lake, the island, the river. Their border posts stay.
- **The Neighborhood (the town)** where she drew it. Inside it, reached from
  within, not by a gateway: **the Rooftops** (up the fire escape in the back
  alley) and **the House** (its front door), when those are built.
- **North-east of the town: the Park**, by a road from the town's east edge
  that curves up to the Park's south gate.
- **Off the Park: the Fairground** to the north (a lane from the Park's north
  edge to the fair's south gate) and **Appletree Farm** to the north-east (a
  farm lane from the Park's east edge to the farm's own south gate).
- **South of the town: the Docks**, by a road gateway on the town's south
  edge.
- **The Seaside** on the east coast with the sea to its east, joined to the
  Docks by a promenade from the Docks' east edge to the Seaside's south beach
  end.
- **The sea** along the east, bending round the south-east.
- **The den** is home and is not on the map.

The five gateways: town-Park, Park-Fairground, Park-Farm, town-Docks,
Docks-Seaside. Each is a pair, one on each side. The Woods-Seaside coast path
of draft 1 is gone: on draft 2 the Seaside is far from the Woods.
The Rooftops (Claude's call): its own place on the map inside the town, entered
by a gateway in the Neighborhood's back alley (the fire escape); it opens as
its own design says (100 coins after 2 Fairground walks).

## The new unlock order (decision 5)

| Place | Opens after | Price (Claude's call) |
|---|---|---|
| Park | 2 Neighborhood walks | 50 (unchanged) |
| Farm, Fairground | 2 Park walks | 75 (unchanged) |
| **Docks** | **2 Park walks** | **100** (the Seaside's old price, so the step after the Park costs the same) |
| **Seaside** | **2 Docks walks** | **200** (the Docks' old price) |
| Wild places | as today | free |

Saves keep every place they own. A save that owns the Seaside but not the
Docks keeps the Seaside, and the Docks open for it under the new rule. A save
whose Seaside is open-to-buy today (2 Park walks done, not bought) keeps it
open-to-buy (grandfathered, as the Farm's catalog comment did; Claude's call). The
Park's home line names the places it opens (Farm, Fairground, Docks), worded
as today's three-place line.

## Gateways

- **Look:** each suits its place: a road with a signpost (town-Park,
  town-Docks), a painted fair gate, a farm gate and lane, a promenade rail, a
  coast-path stile. Drawn like a border post's place in the edge rules
  (R1-R6), on the edge that faces the neighbour on the map.
- **Open place (decision 9):** walking up to it shows a small "Head to the
  Park?" card; yes plays a short "Off to the Park!" moment (no summary screen),
  and the next walk starts by itself with her at the twin gate in the new place.
  This is new machinery: an arrival spot per gateway in every street area (with
  the R5 spawn rules), an automatic start, and a room that stays together
  across the change. Points and goals of the walk just left are banked as at
  any walk end (quietly; the summary is not shown).
- **Shut place, walks not done (decision 6):** the gate is closed with a sign
  in plain words: "Opens after 2 walks in the Park. 1 to go!"
- **Shut place, walks done:** the gate offers it: "Open the Farm for 75 🐾?",
  through the usual "Get it?" card; yes opens the place and the crossing card
  follows. Not enough paws: "You need 30 more 🐾. Keep exploring!" (Claude's
  wording; through the word tables.)
- **Two players:** only the host's choice moves the room; the room stays
  together and both arrive at the twin gate. A guest who reaches a shut gate
  sees its sign only.
- **A guest who doesn't own the place (Claude's call):** she walks it this once
  without owning it (as room starts already allow, `areaOverride`); nothing is
  ever spent on her behalf. Today a guest's crossing calls `pickPlace` → `buy`
  and could spend silently; that path changes so a crossing never buys.
- **Border posts get the same walk-straight-on** in Clan Edition, so the two
  kinds of crossing feel alike (Claude's call; the builder may split it into
  its own step).
- **Budgets:** the Seaside has about 490 triangles left of 30,000 (and tight
  mesh and caster ceilings). Its gateway is paid for by trimming the Seaside
  first, as `test/budget.test.js` already notes ("the next Seaside build trims
  first"); the ceiling does not rise (Claude's call).
- **Grown areas:** no gateway sits on a growing edge, so `?grow=1` does not
  change any of them.

## The map screen (decision 7)

- **Change place is the map**, filling the sheet, with every place in both
  versions: soft land shapes, the water, paths and the gateways as small
  marks, a name on every place.
- **Each place shows its state:** open (bright, tap), locked (soft, a small
  lock and "Opens after 2 walks in the Park"), today's place (a ring), and in
  Clan Edition the clans' camps as today.
- **Tap a place:** a pop-up card with its picture, name, a line, and its one
  button (Go here / Open for N 🐾 / the lock line). Day / Dusk and the clan
  line stay at the top of the sheet.
- **Small phones:** the map pans and pinch-zooms; tap targets are at least
  44 px; every place has a label for screen readers.
- **Found outfits and golden mice** may later show small counts per place
  (not in this design).

## Retiring Legacy (decision 8)

- Depends on the everyday-words version being switched on (series switch
  Phase 3). Until then Legacy stays exactly as it is: its picture cards, no
  map, no gateways (Claude's call: nothing built for it that step 4 throws
  away).
- A save in `legacy` moves to the everyday-words version on load, once, with
  nothing lost: places, cats, outfits, points, walks. The wild places appear
  on its map, locked behind their usual walks; the clan pick happens as a
  story moment when the Woods opens, as for any new child.
- The edition switch leaves Game settings; `areaInEdition` and the `canon`
  marks go once nothing reads them.
- The save version does not change if the move can be done additively
  (builder checks).

## Build order

1. **The new unlock order** (decision 5) with save tests. Small; ships alone.
2. **The world map screen** (decision 7) from the approved draft, both
   versions, with pictures for the owner.
3. **The five gateways and walking straight on** (decisions 6 and 9), one
   area file each for the gates, with the borderposts rules extended to street
   places; then the arrival spots, the automatic start and the room staying
   together; then border posts moved to the same flow. Pictures.
4. **Legacy retirement** (decision 8), after series switch Phase 3.

Each step ends with the full suite green and pictures for the owner; merge and
push need his yes.

## Constraints

- Every border post rule (R1-R6) holds for the new gateways; `flat-trace.json`
  and other fixtures change only where a gateway's mesh is drawn, recorded
  once on purpose.
- Triangle budgets per area unchanged in spirit: a gateway is a few hundred
  triangles.
- Text for a 9-year-old, through the word tables, both word sets.
- Offline-first; no database change (places are on the save).
- Older iPads: the map is one SVG, drawn once per open.

## Goals

- A child can point at the map and say where she is and where she's going.
- Walking from the Park to the Farm feels like going somewhere, not loading.

## Non-goals

- A seamless world. Moving any wild place. New places.
- Showing counts (outfits, mice) on the map in this version.

## Anti-goals

- A gate that looks open but isn't, or a sign a 9-year-old can't read.
- Spending paws by accident at a gate (the "Get it?" card always asks).
- A Legacy child losing anything in the move.
