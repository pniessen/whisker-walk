# polish-gorgewall (Pass 8, item 8-1): crisp, layered sandstone walls

Survey 8 ranked #1: the Gorge walls read as a blurry beige-brown smear with a
pale haze band along the foot. The survey's probe (`gwall2.mjs`) showed it is
the `rockFaces` vertex colours, not the fog or the shader: turning the vertex
colours off gives crisp rock.

## Why the vertex colours smear
- The shell's vertices are ~1.2 m apart along a wall and 1 m apart up it. A
  colour change between two vertices is a gradient over the whole cell.
- The recess darkening (25% at full depth) follows the gullies, which change
  every cell along the wall: soft vertical streaks.
- The 1.1 m strata bands do not sit on the 1 m rows, so each band edge is a
  1 m blur.
- The talus tint at the foot is a pale grey (0x9d9384): the haze band.

## Plan (colour only, 0 triangles)
1. `builder.js` `rockTerrain()`/`rockArrays()` colour code:
   - `ROCK_LOW` a muted brown (0x7f7062) instead of cool grey; still cooler than the top
     (builder.test "darker and cooler at the bottom") and dull (clancast, saturation caps).
   - `RECESS_DARK` 0.25 -> 0.1 (no streaks), vertex strata +-9% -> +-6%.
   - An undercut darkening over each wall's foot (rockrelief's undercut band), from `foot`.
   - A lighter colour on up-facing shell vertices (ledges, shelves, rims), by the smooth normal.
2. `rockshade.js`:
   - `TALUS_TINT` a damp cool brown 0x6e6355 (the foot darker, not paler); talus 0.2..0.9 m.
   - Per-pixel strata: each band between two bedding lines gets a hashed
     rust / cream / ochre hue and +-12% shade, with a crisp edge (bedding lines 6% -> 8% dark); far off it
     settles to the palette mean (fwidth fade, no moire). Walls only.
   - Flutes calmer at walk distance (tilt 0.35 -> 0.26, near calm 2..9 m).
3. `gorge.js`:
   - the tint passed to `rockTerrain`: `gorgeRockTint` wraps `narrowsTint` with its recess
     darkening at a third and its vertex bands at 60% (narrows.js itself unchanged);
   - the clifftop sand (`MEADOW_SAND`/`MEADOW_DRY`) a touch warmer;
   - small edit outside the brief: the floor's talus apron `MEADOW_TALUS` darker damp gravel
     (0x8d7a63, was pale grey 0xa59b89), since it continued the pale foot band onto the floor.
4. Test pins moved with the values: rockshade TALUS_TINT, gorgerock2 MEADOW_TALUS,
   gorge5 nearLo/nearHi.

## Checks
- Full suite + build; flat trace sha unchanged; Gorge triangles and meshes unchanged.
- Before/after: gwall2 3-way, gorge walks day/dusk/rain desk and phone, gorge.mjs spots.
