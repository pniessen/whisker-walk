# Bigger areas, step 3: the Pines and Swamp (2026-11-19)

The shared design is `2026-11-19-bigger-areas-design.md`; this is the Pines'
own notes and numbers. Everything here is behind `?grow=1`; with the switch
off the Pines is today's, object for object (`test/growpines.test.js`).

## What grows

- **Bounds** x -90..50, z -90..50: 140 x 140 m (1.96x). Two strips and the
  corner between them: **north** (z -90..-50, x -90..50, the corner included)
  and **west** (x -90..-50, z -50..50).
- **The edges were free.** The lake, the bay, the island and its bridge, the
  camp (-38, 41), the truce path and both border posts are all in the south
  and east. The one thing that crosses both edges is the Black Mire: it comes
  in from the north and leaves to the west, so it runs on through both strips
  (and on under the hills to 70 m past the new edges, as it did past the old).
  Its log bridge and stepping stones stay the only ways into the deep swamp,
  which is now three times the size; the test floods the grown area with the
  decks taken away and the old and new deep swamp are both cut off.
- North strip, east of the mire: more of the pine forest, about half the
  core's pines to the square metre (0.9 against 1.8 a 100 m2), thinner toward
  the rim; ferns, little mushrooms, moss, blueberries, needles and cones as the
  core's floor has them.
- West of the mire (north strip's west end, the corner, the west strip): the
  swamp going on. A few pines, silver dead pines standing in the wet, reeds
  on the mire's banks and in clumps over darker wet hollows in the ground,
  bog cotton round two new bogs, moss and mushrooms.
- Ground, hills and edge scrub reach the new edges (the hills ring the grown
  rectangle; the core ground is retinted only where its old north and west
  edges were, which are no edges now).

## Something to find

- **North: the Great Pine** at (8, -73), 23 m past the old edge: a builder
  pine at 3.4 times a pine's size, 14.6 m tall, over twice the tallest pine,
  seen over the forest from the Lightning Stump. Its long root is a climb of
  three hops to a seat against the trunk ("great pine roots", a lookout) with
  a blue jay feather on it; a mossy bed between two roots (nap); a little
  spring under the boughs with a flat stone (drink). A faint trail leaves the
  east path at its bend (18, -26), threads between the forest's own pines and
  ends at the spring. Finds: the jay feather, a squirrel's pile of pine nuts,
  a woodpecker's feather, and a black stone from the mire out in the deep
  swamp.
- **West: the Toadstool Ring** at (-73, 20) in the outer swamp: twelve big red
  toadstools (and six small ones) in a ring round an old mossy stump to sit on,
  moss inside to nap on, by a still bog pool with lily pads and bog cotton and
  a flat stone to drink from. A faint trail leaves the swamp path at its first
  bend (-36, 6). Finds: a snail shell in the ring, a sprig of bog myrtle at the
  far rim, a frog-green pebble by the far bog in the deep swamp, a wren
  feather.
- Labels in one `pines` block of the later phrase table
  (`src/clanphrases.js`), plain words, the same in both word sets (as the
  River's west strip); the test holds them against the everyday set's banned
  words.
- Critters, hides, POIs, golden mice, strays and clan cats stay in the core.

## How it streams (the decisions)

1. **The core**, through the seam: the 24 swaying pines `streamTree`; the
   ferns (91 triangles a fern, the costliest thing in the Pines) and the reeds
   (but the island's own ring) on the `fine` layer; the forest floor on
   `small`. The still stand of 82 pines stays whole: its tree fade reads each
   tree's range of its index, which drawing it in runs would shuffle. The
   toadstools (a Group of two meshes) and the lily pads stay whole too.
2. **The strips' scatter is built whole and streamed through the core
   stream.** A strip tile's own small layer is one mesh a tile and can only
   draw the five River kinds; a strip tree is two meshes and two casters a
   pine. The Pines is merged meshes by nature (a stand is two meshes however
   many pines), so the strips are built the core's way, from their own seeds
   tile by tile (`tileContent(strip, index)`, a pure function), as seven
   merged meshes: the still stand (trunks, boughs), the dead pines, the ferns,
   the floor (needles, cones, moss, blueberries, mushrooms, bog cotton) and the
   reeds, each drawn in runs, one per 10 m tile, through
   `coreStreams({ areaId: 'pines', rect: GROWN })`, the core stream over the
   whole grown rectangle. One draw a mesh however many tiles are near; far
   stand-ins from the seam. The two pines by the trails are their own swaying
   Groups, tagged as trees (as the core's path-side pines).
3. **The strips' stand fades tree by tree** from the area's own per-walk life
   (`areaData.life`, which walk.js already runs for the Gorge): a stand pine
   the camera is in or looks through is folded to a point in the stand (runs
   never touch vertices) and a see-through copy of that one pine stands in its
   place, easing at the tree fade's own rates. Without it the chase camera
   looks through a stand pine's boughs at about one spot and heading in five
   in the new forest (18% of 4,000 random ones).

## The numbers

Counted as `test/budget.test.js` counts, every slot at its layer's `hide`
range (`test/helpers/growbudget.js`), pinned in `test/growpines.test.js`:

| | meshes | casters | triangles |
|---|---|---|---|
| the Pines today (switch off) | 119 | 69 | 67,403 |
| worst spot for triangles, (-20, -35) by the mire | 145 | 76 | 67,597 |
| most meshes and casters anywhere, (-25, -10) | 147 | 80 | 64,466 |
| at the spawn | 125 | 58 | 58,593 |

Ceilings 152 / 80 / 70,000 at the worst spot, 154 / 84 anywhere. The 26 meshes
over today at the worst spot: two ground patches, three new waters, the two
landmarks (three), the trail and its eight hidden data strips, the lily pads,
the two trail-side pines, the seven run meshes and one for all the
stand-ins, less the core's swaying pines out of range. Everything drawn at
once would be 95,500; the core alone is the 67,403 it was.

In the harness (`tier=high`, every frame rendered, 8 m/s, spawn to the
Toadstool Ring, the deep swamp, the corner, past the Great Pine, back by the
north trail: 4,037 frames): stream update at most 0.8 ms in a frame (mean
0.01 ms), rendered triangles at most 127,746 (switch off on the same route:
126,002, shadows and grass included), draw calls at most 205 (199). The
machine was heavily loaded (load average 20-40) during the run.

## For the owner

- Pictures: BEFORE | AFTER sheets, day and dusk (the old edges looking out,
  inside each strip, each landmark, two far views).
- **Far stand-ins of the strips' stand** are the seam's spikes (a three-sided
  pyramid and a trunk blade a pine, `render/standins.js` proxiesOf), not the
  six-sided outlines the core's swaying pines get. Past 65 m in haze they read
  as dark cones (sheet `p9-far-north` shows them nearer than a walk ever does:
  the camera there is far from the cat). A seam change could give a merged
  mesh's tree items the six-way outline.
- The swamp strips are open, as the core's swamp is: wet hollows, reeds, dead
  pines and bog cotton, no undergrowth. More could go in.
- Two existing tests had to grow, as the River's step did: the later-lines
  fixture (`test/fixtures/series-words-on-later.json`) gains the twelve new
  rows (no row changes), and `test/gorgelife.test.js`'s list of areas with a
  `life` names the Pines. Other area agents adding lines or a life will touch
  the same two places.
- No seam file was changed. The core stream's rectangle is the grown one, not
  the core's (`world/streamcore.js` says `rect: BOUNDS`): it is how the strips'
  merged scatter streams with no change to `render/striptiles.js`. A walk's
  streamer looks at 1,176 slots every quarter second (the River's core 600).
- Positions in the strips are ordinary positions; a device without the switch
  treats them as it treats the River's west strip.

Pictures (in the session's scratchpad, `grow-pines/`): `sheet-day-1-edges.jpg`,
`sheet-day-2-strips.jpg`, `sheet-dusk-1.jpg`, `sheet-dusk-2.jpg`, and the two
landmarks close up in `sheet-landmarks-close.jpg`; single
frames in `before-day/`, `after-day/`, `before-dusk/`, `after-dusk/`; the walk
in `walk-on.txt` and `walk-off.txt`.
