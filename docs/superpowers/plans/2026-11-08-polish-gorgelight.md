# polish-gorgelight (Pass 9, item 9-5): a Gorge day with warmth and clarity

Survey 9 ranked #5: the Gorge is the last milky place. Pass 8's clear-day grade
(weather.js CLEAR_DAY_LOOK) skipped it on purpose because the Gorge has its own
fog. Colour, light and material only: 0 triangles, guard mesh count unchanged,
no collider/walk/spawn change, no new seeded draws.

## Tasks
1. **Gorge day grade.** `GORGE_DAY_LOOK` in gorge.js, in CLEAR_DAY_LOOK's shape
   (sky top bluer and deeper, horizon/fog pulled a little toward it and darker
   but still warm, fog 80/215 instead of 60/175, env x0.76, fill x0.88,
   exposure x0.9). The build sets `scene.userData.dayLook`; weather.js's
   `applyClearDay` uses an area's own look when one is set, and only then
   grades a non-flat map. GORGE_SKY / GORGE_FOG stay the authored entry state,
   so rain (which adjusts what it finds), sunset and dusk are byte-identical.
   (Tiny edit outside the owned files: weather.js, 4 lines.)
2. **Floor wash.** FLOOR_WASH: the wall feet darker damp sand (`foot`, was a
   paler band), a warm ochre in the open middle (`ochre`), damp stream and
   drift bands as before. Trail colour warmer and a shade darker (0xb59a70).
   Pebble speckle parked: the floor plane is a 2.5 m grid.
3. **Clifftop.** MEADOW_SAND a shade warmer; darker drifts from the meadow
   lattice read at another scale (`MEADOW_DRIFT`, no draws). Tors greyer
   (0x9a948a) with lichen and rust spots and a darker foot in vertex colours.
4. **Lip stones and scree.** `warmStones()` warms greyish vertex colours of the
   `lips` mesh and the scree bed after the build (colour only).
5. **Tunnels.** caveroom.js `TUNNEL_LOOK`: canyon brown at the mouth, darker
   on the way in, the chamber's colour at its door. Echo liner a warm dusky
   grey (was blue-grey).
6. **Near wall.** `ROCK_KNEE` in gorgeRockTint compresses the palest vertex
   colours (the pale vertical haze at 2-3 m); rockshade's strata untouched.
7. Tests: test/gorgelight.test.js; gorge7/gorge5/gorge.test pins updated with
   comments. Full suite, build, flat trace sha, before/after pairs (desk +
   phone, day, dusk, rain, caves, clifftop, wall).
