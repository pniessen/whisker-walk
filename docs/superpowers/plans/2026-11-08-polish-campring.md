# polish-campring (Pass 9, item 9-1): leafy bramble rings, nests that read as nests

Survey 9 ranked #1: the camp bramble rings read as dark faceted crystals; #10 / broken #5: the nests read as lime rings with a black hole from above. Only `src/world/camp.js` changes (ringMesh, RING_LOOK, LEAF, nestsMesh, a new NEST_TONE), plus test pins.

## Ring (ringMesh)
1. Soft normals on each clump's core (`softenAbout` after `clampToClump`), like the crowns, so the core stops showing as flat dark facets.
2. Core value lifted (0.42–0.78 → 0.58–1.04 of the clump green), crowns 0.74–1.36, and every lump's top leans a little toward a sunlit yellow-green (`warm`, up to 16% at the very top, t²). The clans keep their own greens.
3. Leaf cards: 9 per clump (were 6), len 0.16 / w 0.09 (were 0.11 / 0.06), on the upper two-thirds of the mound (0.55–1.35 rad), alternating a light and a deeper green; their shading normals get a lift up (`liftNormals`, +0.7 ŷ) so thin cards read lit, not black. RING_CLUMP_TRIS 59 → 62; RING_LEAF_FIRST (44) and RING_BERRY_TRIS (9) unchanged, berries still last.
4. Triangles: +3 a clump, 84 clumps → **+252 a camp** (Woods 6,300, River 6,303, Moor 6,318, Pines 6,285). Budget was ≤ +400.

## Nests (nestsMesh)
5. Flat camps (`NEST_TONE`): moss lerped 45% toward the clan's bracken and ×0.86, 22% of wall/crest/bank faces dry straw, 20% kept as the clan's own moss tufts (×0.86–0.98), hollow a warm brown (bracken lerped toward 0x6a4428, ×0.62) instead of near-black. No geometry change.
6. The Gorge ledge passes `tone = null`: its bedding is byte-identical.

## Unchanged
Clump spots, canes, colliders, `campDressing()` and the flat trace (no seeded draws; hash only). Highrock, den, nametags untouched.

## Pins
camp.test.js ring ≤ 6,200 → 6,500; camplooks.test.js ring vertices ≤ 18,600 → 19,500; the leaf-facing test checks 9 leaves.
