# polish-faces: the tabby M and a black cat's face (2026-11-06)

Owner-approved change in src/cat/*. The body, proportions and stripe pattern are the older playtester's picks and are untouched. hats.js is another build's.

## Task 1: the tabby "M"
- `headStripes: 'M'` on the tabby and zeetoo: the letter itself (two legs over the inner eye corners, a V dipping to the nose bridge) rather than D2/Digit's three bars, which read as stripes from the front. D2 and Digit keep `true` (signed off from photos).
- Strokes are skull patches in `accent`, one mesh; `twist` on patchGeometry slants the V. 3x14 rings/segments per stroke, so the M costs 640 triangles (fewer than D2's bars).
- Built under `withLocalUuids('cat-face-M')`, so the cat build's Math.random draws are unchanged (the flat trace builds a tabby).
- Custom cats: the builder's "Tabby stripes" pattern gets the M too (lookToStyle). Clan coats keep their hand-picked flags.
- Pins: tabby/zeetoo mesh ceilings 30 -> 31 (simple 25), like D2/Robbie/calico with their one head marking; catgolden regenerated for tabby:*, zeetoo:* and black:* only.

## Task 2: the black cat's face
- `darkFace(s)` (head and muzzle near-black; `faceSheen` overrides): muzzle and cheeks lifted 12% toward a cool sheen tint at roughness 0.6, skull roughness 0.74, eyes with an emissive glow in their own colour (0.32) and glassy (0.3), catchlights 1.35x and lit.
- Materials only: no mesh, geometry or Math.random draw. Robbie (white muzzle) is not dark-faced and is unchanged.

## Checks
- test/catfaces.test.js: flags, the M's mesh/colour/budget/no-draw, eye contrast >= 6 vs the coat with glow, catchlights, muzzle contrast >= 1.3 vs the head and luminance < 0.09, nose contrast >= 3, no mesh/triangle cost, Robbie unchanged.
- Full suite, build, flat trace af07901717f1.
- Before/after shots: home stage front + 3/4 (desktop, 390 phone), Dress up, world day + dusk, verify page.
