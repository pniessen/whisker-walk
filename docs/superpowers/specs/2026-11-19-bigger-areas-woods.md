# Bigger areas: the Woods grows south (step 3, 2026-11-19)

The Woods' part of [the bigger areas design](2026-11-19-bigger-areas-design.md).
Everything here is behind `?grow=1`; with the switch off the Woods is today's
game, bit for bit.

## What it is

- **The core streams near the cat**, through `world/streamcore.js`'s seam, as
  the River's does: the 69 scatter oaks (`streamTree`), the reeds on the fine
  layer, the ferns, the brambles and the forest floor (`streamSmall`). The
  Great Oak, the lookout rock, the crossings, the camp, the golden mouse's
  bushes and the island stay whole. Same build, same Math.random draws, same
  objects, colliders, forks and critters (`test/woodsgrowcore.test.js`,
  `test/woodssouth.test.js`), and the recorded walk is the fixture with the
  switch on (`test/woodsgrowtrace.on.test.js`).
- **The south strip**, z 50..90, x -50..50 (the Woods' only free edge; the
  Woods becomes 100 x 140 m, 1.4x). `src/world/woodssouth.js`. Ten 20 m tiles,
  each scattering from its own seeds.
  - Trees: the core's mix (oak, round, birch, by `builder.canopyKind`) on a
    jittered 3 x 3 grid a tile, kept with a chance of 0.30 at the old edge
    falling to 0.11 at the rim: 20 trees on 4,000 m² (the core has 69 on
    10,000, a fifth of it lake and river), 0.72x the core's to the square
    metre, thinner toward the hills. Streamed per tile, with stand-ins.
  - Low things the strip writer draws, per tile: woodland tussocks, thickest
    where the sun gets in (the hollow's rim, the glade's edge), stones in twos
    and threes, kingcups round the spring.
  - The Woods' own undergrowth (ferns 50, brambles 5, forest floor: leaves
    round every strip tree, moss, mushrooms, foxgloves, the glade's
    bluebells), from the strip's own per-tile seeds at about half the core's
    density. The strip writer (`render/striptiles.js` SMALL_KINDS) has no
    fern, bramble or floor shapes, and that file is not this agent's to
    edit, so these are built once at the start, as three merged meshes, and
    tagged `streamSmall` like the core's. **The core's streams therefore
    cover the grown rectangle** (`coreStreams({ rect: GROWN })`, 10 m tiles
    over 100 x 140 m): the strip's undergrowth is drawn in runs, one per
    tile, near the cat, and as stand-ins past the small layer's range, as
    the core's is. (If SMALL_KINDS gains a fern, a bramble and the floor's
    bits one day, they can move into the tiles and be built on demand.)
- **The thing to find: the sandy hollow.** A dip of pale sand (an oval 10 x
  8.4 m) ringed by a low earth bank, grassy on top, with ferns on its outer
  flank. The bank is solid (a ring of colliders) but for two gaps: north,
  where the faint trail comes in from the long path's bend at (0, 44), and
  south-east, toward a little spring pool just outside. On the west lip
  stands the **old split stump**, a broken giant with a ring of splinters
  round a flat shelf of heartwood: a cat hops onto its great root's knuckle
  (0.62 m) from the sand, then up to the shelf (1.75 m), the lookout over
  the hollow. Plain claws cannot jump to the shelf from the grass, so the
  root is the way up. East across the strip, a **bluebell glade**: an
  opening in the oaks carpeted with bluebells, the ground tinted violet so
  it reads from across the wood.
  - Rests: a nap on the warm sand in the middle of the hollow, a drink at
    the spring (rests.js kinds, `mesh: false`).
  - Finds: a sycamore seed with paper wings (on the shelf), a speckled
    pebble from the spring, a soft tuft of rabbit fur in the bluebells, a
    hazelnut a squirrel forgot (far south-west). Scenic: the hollow, "the
    training hollow" in the family's words and "the sandy hollow" in the
    everyday set (both phrase tables, one block each marked Woods south).
- **The edges.** Bounds z -50..90. The ground runs 10 m past the new edge
  (a patch, x -60..60, z 60..100, its tint seamless with the core's at
  z 60). The core ground's apron past z 50 is tinted anew (the strip's floor
  instead of the old edge's plain fade); inside the old edge it is today's,
  vertex for vertex, and the grass reads the same tint. The hills ring the
  grown rectangle (`horizonBand`'s `rect`, 6 m out, 184 cells round), and the
  edge scrub moved out with them. `rect` takes plain hills only, so the
  square band is built first exactly as today (its throwaway blocks keep the
  Woods' pinned Math.random draws), then its ring and edge are swapped for
  the grown ones under local uuids and its cottages and lit windows kept:
  they stand on the east side, where both rings are one height field. The
  spring joins the waters.
- **Never stuck**: every standable 0.5 m spot of the strip floods from the
  spawn; the hollow's bank opens only at its two gaps; the path finder
  reaches every find, rest and tile.

## The numbers

Counted as `test/budget.test.js` counts, at the worst spot a cat can stand,
every slot at its layer's `hide` range (`test/helpers/growbudget.js`):

| | meshes | casters | triangles |
|---|---|---|---|
| the Woods today (switch off) | 182 | 152 | 68,810 |
| grown, worst spot (0, -5), the middle of the core | 217 | 177 | 67,654 |
| grown, at the spawn (44, 12) | 177 | 137 | 55,673 |
| grown, in the hollow (-14, 71) | 177 | 127 | 56,261 |
| grown, at the south rim (0, 85) | 141 | 91 | 50,907 |

Ceilings in `test/woodsgrowcore.test.js`: 228 / 186 / 70,000. The 35 meshes
over today are the strip's: its trees in range (two meshes each), its ground,
spring, sand, paint, trail (four hidden data strips and the ribbon) and
hollow, its three undergrowth meshes, and one for all the stand-ins, less the
core's trees out of range. The worst spot is in the core's middle, where
nearly all of it is within the trees layer's 65 m: streaming saves little
there, and everywhere else it saves a lot.

The harness walk (8 m/s, every frame rendered, high tier, day): from the
spawn west through the wood, down the trail into the hollow, round the strip
to the east rim and back up the east side. Switch on: rendered triangles at
most 105,425 (97,890 in the core, 104,263 in the strip), draw calls at most
258, stream update at most 2.8 ms in a frame (0.017 ms on average; the
machine was shared by five agents, load average 50). Switch off, the same
path: 115,120 triangles, 297 draw calls.

## A mixed pair

A position in the strip is an ordinary position. A device without the switch
clamps its own cat to the core. A co-walker with the switch on, standing in
the strip, is drawn on the other device where it stands: past the old edge,
on the plain apron or out on the first of the hills. Nothing breaks; it just
looks odd until both devices have the switch.

## For the owner

- From the pictures: the hollow, the old stump, the spring and the glade.
- "The training hollow" (the family's words) and "the sandy hollow"
  (everyday) for the scenic: builder's picks.
- The strip is thinner than the core by design (half density, thinning to
  the rim); it reads as open oak wood. More trees cost triangles at the
  worst spot, which has about 2,300 to spare.
