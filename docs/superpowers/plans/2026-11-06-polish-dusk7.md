# polish-dusk7 plan (Pass 7, item 7-6)

Render-only, colour/CSS/light changes. No triangles, no draws, no gameplay.

1. Birch trunk (builder.js `birchTrunkGeometry` + its bark colour in `tree()` is NOT touched: the vertex colours carry the new warm grey-white and darker marks). Check day read.
2. Seaside: cliff and overlook get `userData.duskTint` so they dim and cool at dusk; huts are already in the dusk-tinted horizonEdge, check and adjust only seaside-side materials.
3. Pines mire: `MIRE_COLOR` darker and peatier, glare/specCap lowered for the two mire entries.
4. Home stage (catstage.js lights only): less flat ambient, key from the front-left so the tabby's stripes read at rest.
5. Desktop sheets (style.css): Change place and Menu run wide, Settings centred at 760px.
6. Verify: before/after pairs (desktop + phone), tests, build, flat trace.
