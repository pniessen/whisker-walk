# Bigger areas (design, 2026-11-19)

## Why

The owner asked how hard it would be to make each existing area twice as big
(2026-11-18), then asked whether the Woods, River and Moor could grow outward,
how the map could be drawn only near the cat, and on 2026-11-19 said: "Let's
also start to grow the other areas 2x."

## What three read-only studies found (2026-11-18)

- Every area is its own scene; a crossing ends one walk and starts another.
- **Triangles now** (static scenery, `test/budget.test.js` counting): Docks
  76,914 of 90,000; Woods 68,810, Pines 67,403, Gorge 66,539, Moor 64,120,
  River 63,778, each of 70,000; Neighborhood 41,006 of 70,000; Seaside 29,513
  of 30,000; Park 28,374 of 40,000. So no territory can take a strip of new
  scenery under today's whole-scene ceiling.
- **Free outer edges:** River west (−x) and south (+z); Woods south (+z) only;
  Moor north (−z) only. Pines has two (north, west). The Gorge is boxed in by
  rim rock. Street areas stand alone.
- **Scenery in the territories is scattered by rule from a seed**, looping
  over `BOUNDS`; changing `BOUNDS` reshuffles every existing tree. Street
  areas are placed entirely by hand.
- The camera's far plane is 300 m and nothing is skipped by distance; fog is
  opaque by 130 m. Shadows already follow the cat (±20 m).
- Things that follow the size: outsiders' routes (`ROUTE_MAX` 90 m), the
  Moor's camp 1 m inside its north edge, the square ground and horizon band,
  edge tests (4.5 m and 11 m rules), `flat-trace.json` ("never re-record"),
  the per-area tests that pin `BOUNDS` at ±50.

## Owner decisions

- Grow outward, not in place (his question of 2026-11-18, and his "Yes" to
  confirming the edges and writing this design).
- Start now, in parallel with the other work (2026-11-19).

## Claude's calls (change freely)

1. **"2x" is the aim, not a promise per area.** What the map allows: River
   140 x 140 m (1.96x), Woods and Moor 100 x 140 m (1.4x), Pines 140 x 140 m
   possible later, Gorge not at all without reshaping rock. Street areas can
   reach 2x but need hand-made content; they come after the territories.
2. **The old 100 x 100 m interior never changes.** Its scatter loops are
   frozen on a `CORE` constant; new ground is scattered from its own seeds.
   Fixtures for the interior stay byte-identical.
3. **New ground is drawn only near the cat** ("strip tiles"): each strip is
   cut into squares of about 20 m; a tile's scenery is a pure function of the
   area's seed and the tile's position; tiles within range of the cat are
   built and shown, far ones removed; building is spread over frames so the
   cat never stutters. Small things appear at about 40 m, trees at about 80 m,
   inside haze. Colliders and wander bounds for the whole strip exist from the
   start (they are cheap); only drawn shapes stream.
4. **The budget test changes what it measures for strips:** the interior's
   whole-scene ceiling stays; a strip is held to a worst-case "interior plus
   the fullest set of tiles in range" ceiling.
5. **Each strip gets something to find**: one landmark, a few hiding and
   resting spots, one golden-mouse-worthy nook (golden mice themselves are a
   later decision: the totals are shown on screen).
6. **Behind a switch until proven on a device.** A URL flag (`?grow=1`) turns
   strips on; off is today's game exactly. The owner reads the frame rate on
   his iPhone in Safari (and an older iPad when one is set up) before the
   switch is turned on for everyone.
7. **Order:** River west strip (the trial: the river already runs out that
   way, no neighbour, no camp near) → River south → Woods south → Moor north
   (camp and tors need care) → then street areas, Seaside first.

## Step 1: the trial (River, west strip, 40 m)

Build the strip-tile machinery and one strip:

- Bounds: the River's walkable bounds become core ∪ west strip when the flag
  is on (x −90..50). Everything that reads `area.bounds` must cope with a
  non-square, off-centre rectangle (minimap edge, grass mask, pathfinding,
  strays' wander, clan cats' roam homes, clouds' centre, rain puddles' formula,
  the camera clamps). Where a consumer must stay as it was for fixtures, it
  keeps reading the core.
- Ground, horizon band and edge dressing extend west; the river (already
  drawn to x −120), its banks, reeds and mist follow.
- Scatter for the strip: the River's own kinds (willows, alders, reeds,
  marsh plants) at about half the interior's density, thinner toward the rim.
- One landmark and a few spots to find (the builder proposes; the owner
  approves from pictures).
- Outsiders' routes, border posts, the camp: unchanged in this step (none is
  on the west edge).
- Saves and two players: positions in the strip are ordinary positions; a
  device without the flag clamps to the core. Say what a mixed pair sees.

**Proof the trial must give:** tiles appear and go without a visible pop or a
frame hitch (measured frame times in the harness with tiles streaming, and
the count of triangles and draws in view at the worst spot); the interior's
fixtures are byte-identical with the flag off AND on; a recorded walk with
the flag off is identical to today's.

## Constraints

- Older iPads matter most. No per-frame allocation in the tile loop.
- Offline-first; no database changes (colony cats' stored spots stay in the
  core).
- Text for a 9-year-old; any new label goes through the word tables for both
  word sets.

## Non-goals (this design)

- Doubling areas in place. Moving camps, the lake, bridges or border posts.
- The Gorge. New mechanics. New golden mice (until the owner decides).

## Anti-goals

- A bigger map that is only more walking: every strip has something to find.
- Any change to what a player on today's map sees while the flag is off.
- A stutter when walking outward.
