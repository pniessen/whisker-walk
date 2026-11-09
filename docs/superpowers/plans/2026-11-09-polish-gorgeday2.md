# polish-gorgeday2: CliffClan's canyon in colour (Pass 10, item 10-4)

Goal: by day the Gorge is no longer one beige. Dusk, rain and sunset look
byte-identical. 0 triangles, no new meshes or draws.

## Approach

The build's colours are shared by every time of day, so the day colour is a
**repaint applied only on a clear, non-dusk walk**: `build().life(ctx)` (gorge.js)
calls `paintGorgeDay(scene)` when `gorgeDayPaints(ctx)` is true, after the
walk's prop merge and before the Gorge life starts. It finds parts by
top-level name and writes **new** colour attributes (the rock's arrays are
cached between builds), touching only per-walk materials.

1. `GORGE_DAY_PAINT` (gorge.js), one table of linear multipliers:
   - walls terracotta and deeper over the damp foot (by height over the floor);
     tops warm sand; the clifftop warmer with darker drifts (meadow noise);
   - floor cooler grey-tan, darker by the stream and wall feet (the wash's own
     damp/foot weights, `floorWashParts`), green patches 0.4-4.5 m off the water;
     the meadow's floor-level cells take the same multiplier as the plane under them;
   - tors and the Summit Rock grey-brown (lichen left by a greyness weight);
     scree as the walls' stone; ledgeTops' material colour warmer.
2. rockshade.js `ROCK_DAY_SHADE`: bolder strata (rust/cream/ochre) holding a
   little farther, compiled only when `material.userData.rockDay` is set
   (program key `-day`). The default program text is unchanged.
3. `GORGE_DAY_LOOK`: a blue sky band (horizonToTop 0.5, topSat 0.35), and the
   haze bluer and ~30% farther (fog 105..280).

## Tests

test/gorgeday2.test.js: gating, new attributes with cached arrays untouched,
wall/floor/clifftop/tor multipliers, builds identical after a painted walk,
night program key unchanged, bluer sky. gorgelight.test.js's "warm haze"
assertion now reads "paler and greyer than the sky top".
