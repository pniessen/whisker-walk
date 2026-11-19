# Bigger areas, step 3: the Moor (2026-11-19)

The Moor's part of "grow the other areas" (the shared design is
`2026-11-19-bigger-areas-design.md`; this file is the Moor's notes and
numbers only). Everything here is behind `?grow=1`; with the switch off the
Moor is today's game exactly.

## What was built

1. **The core streams near the cat**, through `world/streamcore.js`'s seam:
   its 15 scatter trees (10 thorns, 5 border pines) are `streamTree`, its
   reeds are `streamSmall` on the `fine` layer (the River's reedbed rule),
   and its dressing (moor grass, clitter, boulders, shore stones) on the
   `small` layer. The dressing's far tors are not items: they stay whole, as
   three of them now stand inside the strip. Nothing in the core moves: the
   same Math.random draws, objects, colliders, forks, perches and critters
   (`test/moornorth.test.js`, and the recorded walk with the switch on,
   `test/growtrace.moor.on.test.js`).
2. **The north strip**, `world/moornorth.js`: z -90..-50 across the whole
   width (1.4x), the Moor's one free edge. Ten 20 m tiles, each tile's trees
   and low things from its own seeds.
3. **Something to find** (below).

## Keeping the camp tucked in

The camp sits 1 m inside the old north edge ((-1, -43), r 6). The strip does
not open out behind it: it begins behind **an old dry-stone wall** that runs
right across the moor 1.5 m past the old edge (z -51.7), from tor to tor.
The three big tors that stood on the skyline at (-14, -54), (20, -54) and
(38, -53.5) are inside the strip now and solid, and the wall runs up to
their flanks. The wall is whole for 50 m behind the camp; it has **two
tumbled gaps**, 4 m wide, at x -28.5 and x 29, 23 m and 25 m from the camp's
edge. The trail stays 16 m or more from the camp. From the camp the moor
still ends at a wall, with the tops of the standing stones showing over it.
A test closes both gaps and proves the strip cannot then be reached at all,
and opens them and proves every standable point of it can.

## The strip's things

- **The trail**: carries on from the end of the warren's sheep path
  (30, -42.5), round the tor there, through the east gap, along the north
  side of a tarn, and in at the open place of a ring of standing stones. A
  faint 1.3 m track. (One core heather cushion sits at its edge just inside
  the gap, 0.64 m from its centre line: the core does not move for it.)
- **The landmark, the standing stones** at (-4, -73): eight stones on a
  6.5 m ring, the ninth place left open toward the trail, the tallest (2.65
  m) at the back. In the middle **an old stone table** (a dolmen: two
  uprights under a capstone). The fallen slab beside it is the step up
  (y 0.55); the capstone (y 1.95) is the lookout and cannot be reached from
  the grass. Two short ring stones (1.35 and 1.45 m) are places to sit.
- **A tarn**, a little round pool of peaty water (r 3.4, wadeable), with
  reeds round it.
- **Two rests**: a mossy hollow in the stone table's lee to nap in, and a
  flat stone at the tarn's edge to drink from.
- **Four finds**: sheep's wool on the stone table (on the lookout), a green
  beetle by the tarn, bilberries by the far wall (north-east), a grouse
  feather in the heather (west, by the pines). One scenic, the standing
  stones. Each on its own tile.
- **Scatter**, at about half the core's density and thinner toward the rim:
  4 trees (3 thorns, 1 pine at the Pines' end), 75 heather spots (core 385),
  10 gorse clumps (most against the wall's north face), 107 moor-grass
  tussocks, stones in groups and clitter round the tors, tormentil (small
  yellow flowers, drawn as striptiles' marigold).
- **The edge**: bounds, ground (10 m past the rim), hills, the ground's edge
  wall and its hawthorns move 40 m north. Three new far tors stand past the
  new rim (z -95), so the skyline from the strip is a moor's.

## How the strip's heather and gorse stream

`render/striptiles.js`'s strip small layer knows reeds, tussocks, cattails,
marigolds and stones, not heather or gorse. So the strip's heather and gorse
are made by the core's own bed builders (`builder.heatherBed`,
`builder.gorseBed`) on the strip's spots, built whole at walk start, and
their four meshes go in the scene on their own, tagged `streamSmall` (the
heather on `fine`). For them to fall on tiles of their own, **the Moor's
`coreStreams` are cut over the grown Moor** (x -50..50, z -90..50), not the
core alone: the core's own things land on exactly the same 10 m and 5 m tiles
either way (the grown cut's tile edges include the core's). The heather's
flowers keep their rustle.

## Numbers

Counted as `test/budget.test.js` counts, merged, at the worst spot a cat can
stand with every slot at its layer's `hide` range
(`test/helpers/growbudget.js`, pinned in `test/moornorth.test.js`):

| | meshes | casters | triangles |
|---|---|---|---|
| the Moor today (switch off) | 87 | 47 | 64,120 |
| grown, worst spot (-10, -65), by the stones | 113 | 52 | 69,309 |
| grown, most meshes anywhere ((0, -55), past the wall) | 119 | 56 | 68,830 |
| grown, at the spawn | under 87 | | under 64,120 |

Ceilings 119 / 55 / 70,000 at the worst spot; nowhere over 125 / 59 / 70,000.
26 meshes over today at the worst spot, 32 at most anywhere (the strip's 10
fixed objects, 6 of them hidden trail data strips; its 4 streamed beds; its
trees; one for all the stand-ins).

**What the core cannot save**: the core's heather (23,100 triangles) and
gorse (3,596) are each a Group of two meshes, and `render/striptiles.js`
draws a tagged Group whole (it streams only single meshes), so they are
always drawn. They are most of the core's scatter.

In the harness (`tier=high`), walking the whole grown Moor at the zoomies,
3,006 frames, every frame rendered: stream update at most 1.7 ms in a frame
(mean 0.013 ms); rendered triangles at most 150,779 (shadows, grass and the
rest included), 148,058 in the core (today on the same path: 142,662); draw
calls at most 173 (today 160). In the core the Moor draws a little more than
today, not less as the River does, because its heather cannot stream.

## Needed in files this step may not edit (reported, not done)

1. `render/striptiles.js`: stream a tagged **Group** of single-material
   meshes (each child cut per tile, as a mesh is), so the core's heather and
   gorse can stream. It would save up to about 20,000 triangles at the
   Moor's worst spot and bring its core under today's count.
2. `world/builder.js` `edgeSpotsRect`: a rect `wall` edge had no gorse
   mounds (the square one has one every third piece), so with the switch on
   the Moor's ground-edge wall lost its gorse all round. **Done when the
   grow branches were combined (grow-all)**: the rect edge now makes
   `style === 'wall' && k % 3 === 0 → 'gorse'` as the square one does, 67
   mounds round the grown edge (today's square edge: 55, unchanged). They
   cost 804 triangles everywhere; the table above is re-measured with them
   (the harness frame-walk numbers above were taken before it).

## For the owner to decide

- The look, from the BEFORE | AFTER sheets.
- The north skyline is hazier with the switch on: the heather hills are 40 m
  further off, deep in the fog (40-130 m), so from the camp the north reads
  as white haze where it was purple hills. A candidate with the fog at
  40-165 m is pictured; it helps a little. Or accept it (from inside the
  strip the hills are near again).
- The labels (sheep's wool, green beetle, bilberries, grouse feather,
  "stone table lookout", "the standing stones on the moor top").
