# polish-floors (Pass 11, item 11-4)

Goal: the floor fills the lower 40% of every frame. Make the Woods read as a
wood (not a park lawn with trees), the River a fresh meadow (not lime), and the
Moor's tufts heath (not straw). Colour only: 0 triangles, no new draws, no
gameplay change.

## Owned
- `src/world/forestfloor.js`: `woodsFloorTint()` and its constants; Woods-only
  reach options for `canopyShade` / `litterDepth` (defaults unchanged, so the
  Pines and the forest-floor placement are untouched).
- `src/render/grass.js`: `WOODLAND`, `MARSH`, `MOOR`, `LAWN` (colour / warm /
  hue only).
- `src/world/river.js`: `RIVER_GROUND` (the horizon near strip copies it).
- `src/world/riverdress.js`: `riverGroundTint()`.
- `src/world/park.js`: `PARK_LAWN` only if needed.

## Tasks
1. Before shots (walk.mjs: woods day/phone/dusk/sunset, river day/phone/rain,
   moor day/phone, park day, neighbourhood day) and triangle counts.
2. Woods: deeper cooler floor between the trees (WOOD_DIM down, a cool lean),
   mossier patches, canopy shade wider and softer, litter reaching ~1.5 m
   further; WOODLAND tufts a shade darker. Clearing and camp unchanged.
3. River: RIVER_GROUND and MARSH from yellow-lime to fresh meadow green; the
   DRY patches less straw-yellow. Still the brightest of the three forests.
4. Moor: MOOR tufts heath olive-brown, a stronger tawny lean per tuft.
5. LAWN: a small step toward a less acid green, checked in the Park and
   Neighbourhood.
6. Update colour pins in tests; full suite, build, flat trace sha, HDR guard,
   after shots and pairs.
