# polish-moorlook (Pass 10, item 10-5)

Survey 10 ranked #5, #8, #9: a richer Moor, a peaty stream, the GaleClan ring, the island boulders.
Colour, light and shading only: 0 triangles, 0 draws, no new seeded draws, no gameplay change. Heather parked (untouched).

1. **Turf** — `moor.js`: one `MOOR_TURF` hex (0x8a9558 → 0x6f8044) for the ground, the edge strip's
   `nearColor` and `groundBounce`. `moordress.js moorGroundTint()`: crests no longer bleach to straw,
   hollows a touch lighter, plus a slow (~12 m) heath mottle between peaty brown and moss green on its own
   field. Grass tufts follow the tint (GROUND_TINTS). Test: tint stays in 0.6..1.25.
2. **Stream** — `water.js`: `MOOR_STREAM_LOOK` (0x62857a peaty teal-brown, sky probe 0.6 (was 0.85), glare 0.32, specCap 0.4) and a new
   `envIntensity` option (default ENV_INTENSITY; the low tier scales ENV_INTENSITY_LOW by the same share,
   exactly 1.0 for every other water). `moor.js` spreads it into river-south/west/mouth only (the lake is
   shared with the Woods and Pines and keeps its hex). One-line tiny edit outside my files:
   `waterdress.js BANK_COLORS.moor` darker damp bank (not bandMaterial/bandGeometry).
3. **GaleClan ring** — `camp.js CAMP_LOOKS.moor.ring`: specks fewer (3 %/2.5 % → 1.2 %/1 %) and in the
   ring's own values (dull gorse gold, dark heather; no pale mauve); fruit dull gold + sloe on 45 % of clumps.
4. **Island boulders** — `island.js mossyBoulder()`: the Highrock recipe on the same dodecahedron: yaw and a
   slight one-axis narrowing by hash, mostly-round normals (35 % facet), per-corner colour (dark foot → light
   top, hash mottle, moss on up-facing corners, a little lichen) via vertexColors on the shared material.
   Top height and position unchanged (perch 0.72).
5. Tests + build, flat trace af079017…b83a, before/after pairs (desk + phone, day + dusk, rain).
6. Ruling: the island's "pale grey soap bars" in the survey shots are mostly the Meeting Ring's six stones
   (and the Watch Rock), not the two mossyBoulders; both get the same per-corner shading (shadeStone:
   dark foot, mottle, moss on the cap; material hexes kept for the tests). Meeting stones turned about y by
   hash (9-sided, round collider: no gameplay change).
