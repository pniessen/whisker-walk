# polish-gorge6: arched small dens and fuller Gorge stream banks — Plan

**Goal:** the owner's "raise the triangle limit to 70k and finish the parked items: arch the small Gorge dens, ... fuller Gorge stream banks". The five small dens (denW1, denW2, denE, denLookout, denTop) stop reading as square holes; the Gorge stream's banks wander like the Moor/River's, with real bank stones and riffles, and pondrims' parked items (straight last ~9 m at z ±50, fill-vs-olive two-tone, hard-edged verge cells) are fixed where cheap.

**Continues:** `2026-11-04-polish-gorge5.md` (caveMouth, mouthArchesFor/appendArches) and `2026-11-04-polish-pondrims.md` (Gorge AREA_KNOBS in waterdress.js, FILL_LIFT).

## Constraints
- Gorge build ≤ ~65k triangles including the water dressing (ceiling 70,000; 58,959 today, dressing 584).
- Gorge guard 61 meshes / 36 casters; waterlooks BUILD_DRAWS gorge 4488; flat trace sha256 3dfb11a4…d838 — all unchanged.
- No Math.random; no new mesh/material/geometry in `build()`; arches are appended to rockFaces like gorge5's.
- Colliders, `gorgeGround()`, walkable data unchanged; gorgerock2's ground-agreement test stays green.
- FILL_LIFT (12 mm) stays. `BANK_BANDS` and every meadow rng loop unchanged (colour-only edits in `bankColor`).
- Files: src/world/gorge.js, src/world/caveroom.js (option only), src/render/waterdress.js, tests (gorge5/gorge6, waterdress, budget). Not builder.js (polish-logs owns logBridge).

## Task 1 — arches at the small dens
- `GORGE_DEN_ARCHES` (gorge.js): one record per GORGE_DENS entry via `mouthArch()` (half 1.3, headroom DEN_HEADROOM 1.8), each with `camH`.
- `caveMouth` takes optional `camH` (default MOUTH_CAM_H 1.9) and `n` (outline points). Ruling: a den's ceiling is 1.8 m and camzoom keeps the camera CAM_CEIL_CLEAR (0.3) under a ceiling, so the camera crosses a den mouth at ≤ 1.5 m: camH = DEN_HEADROOM − CAM_CEIL_CLEAR = 1.5.
- Smaller dens: fewer outline points, 2 threshold stones, a gentler mound (budget ~200–250 tris each).
- `computeMouthArches` loops the cave arches then the den arches (the den stones keep clear of the walk via the existing ground-agreement `clear`), byId gains the den ids. Tests: keys, budget, low-walk rule, camera rule with camH, rims seated, gorgerock2 ground agreement.

## Task 2 — fuller stream banks
- Raise the Gorge AREA_KNOBS toward the other areas: finer step, the generic 6-row band (wobbly lip), deeper bites, stones and 1–2 riffle stones per stop, drawn box a little past the bounds so the bite carries on to z ±50 (no straight last 9 m). Measure; target dressing ≤ ~4k so the area lands ≤ ~65k.
- Two-tone / hard verge: `bankColor` fades to the floor colour at the water's edge (so the sand-coloured bite fill meets sand, not olive) and at corners next to a missing bank cell (soft edges). Colour only.
- Update the Gorge dressing cap test to the new figure; log numbers in budget.test.js.

## Task 3 — check
Full suite, build, trace sha, live shots (day, dusk, phone) of every den mouth and the stream (walk camera + low), pairs in `snaps-polish-gorge6/pairs/`; merge main and rerun.
