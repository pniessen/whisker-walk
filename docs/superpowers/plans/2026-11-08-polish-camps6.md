# polish-camps6: a mossy Highrock and cupped nests (Pass 8, item 8-5)

Survey 8, broken #1 / ranked #4: the Highrock's moss was painted per face, so
each rock read as a grey icosahedron with hard lime triangles (a football),
and the nests read as flat green rings from above.

Scope: `src/world/camp.js` only (`highrockGeometry`, `HIGHROCK`, `nestsMesh`,
`NEST`), plus its tests (camp.test.js, camplooks.test.js).

## Plan
1. Soft normals for the rock (`softNormals`): each corner takes the
   angle-weighted average of the face normals at its place whose faces meet
   its own under a 48° crease, so the stones and the boulder's sides shade
   round and the ledge lips, joints and the flat top keep crisp edges.
2. Colour per corner, not per face, from the corner's place and soft normal:
   grey by height with a soft value-noise mottle; dark joints from the
   normal facing down; darker cracks (×0.42) as zigzag seams of corners up
   the boulder; pale lichen patches by noise on the sides; moss where the
   normal faces up, in noisy patches, olive at a patch's edge into the
   clan's moss at its heart.
3. Nests become cups: a dark hollow (moss lerped to bracken, ×0.5), an inner
   wall, a raised lit moss rim (crest 0.12 m), a shaded outer bank; bracken
   fronds on the crest; soft normals. 70 → 90 triangles a nest (+120 a camp).
4. Same rock.h, collider, perch, reach/back/clear, positions; campDressing
   untouched; the Gorge's ledge camp shares the code (pressed nests).
5. Tests: the rock's per-face colour test becomes a per-corner one (no
   harlequin: one colour per place+normal), a new soft/crisp normals test,
   nest cup test (rim above hollow, hollow darker), vertex pins 1260 → 1620.

Determinism: hash01 / value noise of positions only; no Math.random, no
walkRng; everything still built under withLocalUuids.

## Result
- Tuned live: moss patches by value noise at 4.5/m, edge 0.66–0.9, shade
  0.74, heart (clan moss) only in the cores; drawn normals keep 35 % of each
  face's own (`HIGHROCK.facet`) so stones stay softly low-poly, not pillows.
- Triangles: +120 per camp (nests only; the rock is unchanged at
  HIGHROCK_TRIS). Woods 66,488, River 63,182, Moor 63,536, Pines 65,621,
  Gorge 66,539. Meshes and casters unchanged. riverdress pin +120.
