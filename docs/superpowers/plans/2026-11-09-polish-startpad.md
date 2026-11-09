# polish-startpad (Pass 11, item 11-2)

Survey: polish-survey-11.md, ranked #2 and #9, broken #2.

## Start pad (src/race.js, the start-pad block in createRace + its helpers)
- Replace the flat yellow `RingGeometry` + emissive yellow material with one merged geometry (`padGeometry`) and one material:
  - a worn ring of earth (r 0.9–1.3, soft 0.2 m alpha edges, wobbled radii), a see-through brown (`PAD_LOOK.earth` at `wear` 0.42) so it darkens whatever ground it lies on in that ground's own tone (grass, path, cobbles, sand);
  - eight cream paw prints (main pad + four toes, low domed fans, vertex alpha 1) walking anticlockwise round the ring.
- No emissive by day. At dusk `createRace(..., { dusk })` sets a warm emissive at half the old ring's (0x453810), masked to the stones by a two-line `onBeforeCompile` (smoothstep on vertex alpha).
- Follows `ground.y` per vertex (the Gorge's slopes), 4.5 cm up instead of 2 cm: the old ring sat under the Seaside boardwalk (3 cm) and never showed there. Same x/z, same prompt radius, same `race.pad`.
- Still 1 geometry, 1 material, 1 mesh, no Math.random: the flat trace stays af079017…b83a. 392 triangles (≤ 400).
- Tiny edit outside the block: walk.js's two `createRace` calls pass `dusk: !!duskLookNow`.

## Flower crown (src/cat/hats.js `flower()`, `FLOWER_*`)
- `FLOWER_TILT`: the two side flowers (s ±0.185) turn 25° outward about the ring's direction, hinged near their outer edge, so a side view sees their faces.
- `FLOWER_CUP` 0.011 → 0.014. No new triangles. Leaf crown untouched.

## Checks
- Full suite + build; flat trace sha unchanged.
- Before/after: `w-<area>-day-desk-00-start` for all 9 areas, Moor/Woods/Docks dusk, Gorge and Seaside phone, pad close-ups, crown side shots on the walk and on the stage.
