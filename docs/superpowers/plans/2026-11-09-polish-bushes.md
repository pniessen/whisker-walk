# polish-bushes (Pass 10, item 10-3): bushes that read as leafy shrubs

**Problem.** At walk height the default bush (`shrubGeometry()`) still reads as a cluster of faceted green rocks (survey 10, broken #2: `w-woods-day-desk-04/06-poi`).

**Why two passes missed it.** polish-pines2 built the clusters from 5-point rings, so each lump had a pentagon outline. polish-shrubs only rounded the *normals*, and the close shots show that worked: the lumps shade smoothly now. But the outline stayed five-sided and had no leaves on its edge, and at walk height the outline is what makes it read as stone. So this pass changes the outline.

**Scope.** In `src/world/builder.js`: `shrubGeometry()`, the `SHRUB_*` constants, and `bush()` (non-beach branch: material side). Tests: `test/shrubs.test.js` and `test/twolegplace.test.js` (one assertion keyed on the old FrontSide), plus area pins raised only by what the bushes add.

## Steps
1. **Rings:** `K` goes from 5 to 7 (`SHRUB_K`). Each mid and shoulder corner is pushed in by up to `SHRUB_JIT` and nudged up or down, keyed on the corner (hash only).
2. **Leaf fringe:** each cluster gets 16 (crown) or 14 (side) diamond leaf cards, using brambleLeaves' recipe. Each card is rooted under the lump's skin and lies up along it like a shingle, tipped out from it. It comes in one of two greens, with a dark root and a lit tip. Its normals are set out from the lump and up. The cards are appended to part B, so the geometry count stays at 3 and the uuid draws don't change.
3. **Creases:** on each side cluster, the faces turned in toward the bush's middle, and low down, are darkened by up to `SHRUB_CREASE`.
4. **Material:** `bush()` makes the shrub material `DoubleSide` and calls `bothSidesLit` (dressing.js), so the cards light the same from either side.
5. **Footprint:** the side clusters sit about 0.03 m further in, and the leaves are short (`SHRUB_LEAF` 0.18 m). The bounding sphere stays under 0.91 and the footprint grows by under about 8 cm.
6. **Budget:** at most +220 triangles a bush. Measured: 108–133 → 264–327, i.e. +156 to +194. Woods total ≤ +600. Report every area.
7. **Checks:** the full suite, the build, and the flat-trace sha. Before/after pairs for the Woods POIs, Woods dusk on the phone, the Neighbourhood, the Park, and a 10 m view.
