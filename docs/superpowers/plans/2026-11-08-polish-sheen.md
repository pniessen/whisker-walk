# polish-sheen (Pass 9, item 9-4): glare, lawns, skyline windows, dusk sand

Branch `polish-sheen` from main 86e20b1. Port 5339. Render-only: no collider,
walkable, spawn or route changes; no new Math.random draws; 0 triangles except
the Docks skyline windows (cap +2k).

## Tasks
1. **Docks low-sun sheen.** The probe found the white glare on the first Docks
   frame is the ground's `wetStone` specular (roughness 0.55) bloomed. In
   `warmStone()` (docksdressing.js, which already owns the ground's look) give
   the ground its own rougher, lower-env material clone so the cobbles go
   matte; the wet patches and puddle glints are separate meshes and stay.
2. **Fountain rim.** Find what blooms white on the rim from a low camera
   (`s-park-day-03-trail-junction-low`) and calm it in parkfountain.js
   materials; water untouched.
3. **Moor yellow bloom.** Reproduce `s-moor-day-03-trail-water-low`, raycast
   and hide candidates one by one; fix only if in my files, else report owner.
4. **Docks skyline dusk windows.** A hidden `userData.duskWindow` child of
   `docksSkyline` (MeshBasic, fog off, toneMapped false, noCast, noMerge),
   ~60% of the skyline windows by hash, inside the existing withLocalUuids.
5. **Lawns.** Park, Neighbourhood, River ground hexes ~10% darker and a touch
   bluer; every copy (groundBounce, horizon nearColor, band colour, tests)
   kept in sync; a slow warm/cool lawn mottle for Park and Neighbourhood
   (tintGround on the lawn + GROUND_TINTS entries, LAWN tufts follow it).
6. **Seaside dusk sand.** `userData.duskLawnTint` on the beach ground: ~25%
   darker and cooler than the default dusk lawn tint.
7. Full suite, build, flat-trace sha, triangles, before/after pairs.
