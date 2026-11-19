# Bigger areas, step 3: the River's south strip (2026-11-19)

Part of `2026-11-19-bigger-areas-design.md` (that file is the shared design;
this one is the south strip's notes and numbers). Behind `?grow=1`; with the
switch off the River is today's, byte for byte.

## What it is

Forty metres of new ground south of the River's old edge: z 50..90, x
-90..50, so it also takes in the south-west corner where it meets the west
strip's south end. With both strips the River is 140 x 140 m (1.96x).
Everything is in `src/world/riversouth.js`, wired in `src/world/river.js`
after the west strip.

- **A water-meadow.** The south is the marsh's drier side (its hills are the
  drier green), so it is grass with tussocks, buttercups and a few stones, a
  scatter of alders thinner toward the rim, and a damp hollow of reeds and
  cattails in the south-west corner where the west strip's reeds left off.
  The meadow between the old edge and the bank (z 50..70, x -90..12) has no
  trees, so a cat at the old edge sees the pale bank across it.
- **The landmark: the sand martins' bank.** A round pool (r 4.2, wadeable)
  the old river left behind, under a crescent of steep sandy bank on its
  south side, 2 m high in the middle and running out into the meadow at both
  ends. Its face looks north over the pool and is pocked with nest holes; its
  back is a grassy slope. One willow leans over the pool's west shore. A cat
  climbs it from its east end in four hops along the crest (each higher, the
  first from the grass, the top too high to reach from the ground) to the
  **sand bank lookout** over the pool and the meadow.
- **The faint trail**: two legs, from the long path where the pond path
  leaves it (28, 40), south-west across the meadow to the pool's east shore.
- **Two rests**: a warm sandy hollow to nap in on the shore under the bank's
  face, and a flat stone on the pool's north rim to drink from.
- **Four finds and a scenic**: a tiny white eggshell on the lookout, a soft
  owl feather in the far south-west corner, a dandelion clock in the far
  south-east meadow, a striped pebble on the sandy shore; the scenic is the
  bank seen from the trail's end. Six new lines, in one block in
  `src/clanphrases.js` marked for the south strip, the same in both word sets
  (as the west strip's are; `test/fixtures/series-words-on-later.json` gained
  the six, nothing else changed).
- Critters, hides, POIs, golden mice, strays and clan cats stay in the core.

Its scatter is its own: 14 tiles of 20 m (7 x 2), each tile's trees and low
things a pure function of the tile's index and its own seeds. Colliders,
Sure Claws forks (11 trees: ten alders and the willow) and the bank's 31 colliders exist from the
first frame; the trees, tussocks, buttercups, reeds, cattails and stones
stream on the step-2 layers with far stand-ins. The ground, the hills, their
edge reeds and trees, the water and the mist all reach the new edge; the
edge closes the River as the old one did (`test/riversouth.test.js` floods
every standable point of the strip from the spawn).

## The budget, and what it took

At the worst spot a cat can stand on the whole grown River (core + west +
south, every slot at its `hide` range, counted as `test/budget.test.js`
counts):

| | meshes | casters | triangles |
|---|---|---|---|
| the River today (switch off) | 170 | 133 | 63,778 |
| step 2, core + west, (-35, 0) | 205 | 147 | 68,745 |
| step 3, core + west + south, (-35, 0) | 212 | 148 | 69,598 |

Pinned in `test/riversouth.test.js` and `test/striptiles.test.js`: ceilings
222 / 155 / 70,000. The worst spot is still by the reedbed; anywhere in the
south strip is under 85% of the ceiling.

The worst spot had 1,255 triangles to spare after step 2, and everything the
south strip always draws (its ground, pool, paint, trail and bank) and all of
its far stand-ins land on it, 50 m off. A first build put it at 76,503.
What brought it under, in order of how little shows:

1. **Both strips' ground on a 5 m grid** (−1,504 south, −1,058 west). Every
   vertex of the plane's 2.5 m patch is kept (uvs, macro patches and tint are
   the plane's own, point for point); only the index changes. Along a seam
   with the core's plane or the other patch a 5 m cell is a fan that takes in
   the 2.5 m vertex halfway along, so the seam is the neighbour's own edges:
   the test checks every 2.5 m seam edge is shared, so nothing can open.
2. **The grown hills drawn a little coarser**: 168 cells round (3.6 m at the
   inner rim; 2.9 today) and 10 out (6 m; 5 today). 6,398 triangles with both
   strips, against 6,872 for step 2's west-only band. They are in haze at 56 m
   and more.
3. **Tussocks fewer and bigger**, in the south from the start and in the west
   strip too (−918 there): a tussock's far stand-in is a three-triangle spike,
   half of what it stands in for, so a meadow of many small tussocks costs a
   lot far off. The west strip's tile count floor in its test went from 20 to
   15 low things a tile for this.
4. The open meadow keeps the south strip's trees out of the trees layer's
   range of the reedbed; the bank is 668 triangles.

The 7 meshes over step 2 are the south strip's always-drawn things: ground,
pool, paint, trail, the bank, and 2 hidden data strips for the trail's two
legs. None of its trees is in range at the worst spot. That is 42 over
today's 170, 7 past the "about 35" (step 2 used all 35). Two more could go
by drawing both strips' ground as one mesh and both strips' paint as one
(same materials), at the cost of coupling the two strip modules; not done.

Everything drawn at once is 84,017 (step 2: 79,307): −1,058 west ground,
−918 west tussocks, −474 hills, +36 mist, +7,124 south (1,444 always drawn,
2,212 trees and 3,468 small things that stream).

## In the harness

Day and dusk, BEFORE (switch off) | AFTER (`?grow=1`), from the old edge
looking out, inside the strip, the SW corner, the trail, the bank, the
lookout and a far view: the four sheets in the scratchpad's
`grow-riversouth/` (`sheet-day-1.jpg`, `sheet-day-2.jpg`, `sheet-dusk-1.jpg`,
`sheet-dusk-2.jpg`, and `close-sheet.jpg` for the bank's face and ends).

A walk across the whole grown River at the zoomies (spawn, down the trail,
west along the south strip, up the west strip, through the reedbed, back),
every frame rendered: rendered triangles at most 119,325 (in the reedbed;
101,353 in the south strip), draw calls at most 235 (169 in the south strip).
The same route with the switch off: 124,424 and 261. Stream update at most
2.9 to 3.8 ms in one frame in five runs of six (6.9 in one), mean 0.02 to
0.03 ms, the most one build step took 1.3 to 2.1 ms (5 in the slow run). The
machine's load average was 34 to 56 throughout (five agents), so these
timings are noisy; step 2 measured 2.5 ms on a quieter machine.

## For the owner

- The bank, its holes and the open meadow are the builder's picks; the
  pictures are for yes or no.
- The hills are a little coarser with the switch on, and the west strip's
  tussocks fewer and bigger than step 2 showed: both for the budget.
- Meshes at the worst spot are 42 over today's (the brief's "about 35"); two
  can be won back by merging the strips' ground and paint, if wanted.
- The frame-time reading wants a quiet machine (or the iPhone).
