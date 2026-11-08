# polish-shrubs (Pass 9, item 9-2): leafy bushes, soft gorse, leafier brambles, round hedges

Survey: polish-survey-9.md ranked #2 and #3. Render-only; builder.js functions
`shrubGeometry`, `bush` (non-beach), `gorseBed`, `brambleBed`, `buildEdge`
(+ a two-line change in `edgeMesh`, which builds buildEdge's output).

## Tasks
1. **Shrubs (0 tris):** in `shrubGeometry`, pull each leaf cluster's vertex
   normals 70% (SHRUB_ROUND) toward the direction out from that cluster's own
   middle; the core keeps its smooth normal. Material hue a touch olive
   (SHRUB_GREEN 0x62994a, was 0x5aa04e). Positions, colours, uuid draws
   unchanged.
2. **Gorse (Moor, fewer tris):** lobes take brambleBed's recipe (corner
   jitter keyed on the corner, `softenFoliageNormals` 0.7, vertex colours dark
   foot 0x1f3020 to lit top 0x4f6a3a with a mottle). Flowers: 8 pale-butter
   (0xd9b84a..0xf2d65a) three-sided pyramids (r ~0.045, 3 tris) per lobe in
   the same two geometries a lobe (uuid draws unchanged), matte (roughness 1)
   so no white bloom. 40 -> 24 flower triangles a lobe.
3. **Brambles (Woods, +1,036 tris):** 7 two-triangle leaf cards appended to
   each lobe's own attributes (no new geometry), on its upper half, tipped out
   and up; material DoubleSide.
4. **Edges (0 tris):** every edge piece carries its own normals (flat, as
   flatShading drew them) and the hedge and scrub/pine-scrub mounds (and the
   wall's gorse mound) get rounded normals plus a dark-foot/lit-top vertex
   gradient; the hedge's green drifts between the style's greens. edgeMesh
   drops flatShading and the merged-normal recompute. noCast, duskTint, the
   horizonEdge child structure unchanged.
5. Tests: shrubs.test.js (rounded bush, gorse, brambles), edges.test.js
   (flatShading false, normals present). Full suite, build, trace sha.
6. Before/after shots (woods day/dusk/phone, moor beauty+spots, neighbourhood,
   pines) and pairs.

## Outcome
- Scrub/pine-scrub mounds also got a domed crown (+2 tris a mound; the
  flat-top prism read survived soft normals alone); hedge tops drawn in
  (HEDGE_CROWN 0.72) for a clipped, rounded crown at 0 tris.
- Gorse lobes also wear 7 narrow dark spines (brambleLeaves, +14 a lobe);
  net Moor -14 triangles.
- Triangles: Woods 65,408 -> 66,990 (brambles +1,036, scrub +546), Pines
  65,601 -> 66,113 (+512, forestfloor Pines pin +512), Moor 63,376 -> 63,362,
  River/Park/Neighbourhood unchanged. Meshes and casters unchanged.
- The Moor yellow-white bloom in s-moor-day-03 is NOT the gorse: it is
  unchanged with the gorse flowers re-made matte and pale.
