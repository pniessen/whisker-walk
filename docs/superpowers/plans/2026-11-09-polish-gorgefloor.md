# polish-gorgefloor (Pass 11, item 11-6)

CliffClan's floor, scree, clifftop and near walls, by clear day only, plus the cave crystal colours. Render-only; 0 triangles; no new meshes, materials or seeded draws.

1. **Floor** (`GORGE_DAY_PAINT.floor`, `gorgeDayFloorMul`): a warmer tan in place of the grey-tan; darker damp margins along the stream and the wall feet; a slow sand/gravel mottle from two octaves of the meadow lattice (no new draws), faded where damp; the green patches near the water a dry sage, not lime.
2. **Scree** (`GORGE_DAY_PAINT.scree`): darker rust-brown, redder or browner along the bed by a slow noise.
3. **Clifftop** (`GORGE_DAY_PAINT.clifftop`, `gorgeDayMeadowTopMul`): the sand a shade darker and warmer; the meadow's green cells turned dry sage by how green each vertex is; the tufts' blades a little toward sage.
4. **Camp ledge** (`GORGE_DAY_PAINT.camp`, `ledge`): rock tops on the wide ledge and the turn ~12% lower in value; ledgeTops' material 12% lower.
5. **Near walls** (rockshade.js `ROCK_DAY_SHADE.strataNear*`): within ~7 m of the camera each band's hue strays from the strata mean up to 1.9x as far. The line is emitted only when the table has `strataNear`, so the night/dusk/rain program text is unchanged.
6. **Cave crystals** (caveroom.js `CRYSTAL_LOOK`, `crystalGlow`): the glow is a deeper, richer shade of the cave's colour (amber in the Glitter Cave), with darker feet and bright tips in the lit colour, so the facets read as lit edges.
7. Tests: update gorgeday2 for the warmer floor and sage greens; caveroom for the glow colour; a test that dusk/rain keep the build and the night program. Full suite, build, flat trace sha, HDR guard (gorge day + sunset), tris.
8. Before/after pairs: desktop + phone, day; dusk and rain unchanged.
