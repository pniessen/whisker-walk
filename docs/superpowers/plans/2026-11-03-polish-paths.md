# polish-paths — soft, joined trails in the wild maps (survey-4 Pass 4A-1)

**Goal.** In the Woods, River, Moor, Pines (and the Gorge, a flagged one-line edit) the paths stop being flat cut-out rectangles: soft worn edges that fade into the grass, round joins with no notches, rounded ends, a gentle width wobble, a few painted pebbles. Visual only.

**Source.** scratchpad/polish-survey-4.md, ranked #1 and build 4A-1. Before shots: scratchpad/snaps-polish-paths/before-*.jpg.

## What the path segments feed (must not change)
- The segment arrays (`WOODS_PATHS`, `RIVER_PATHS`, `MOOR_PATHS`, `MOOR_TRAIL`, `MOOR_GORGE_TRAIL`, `PINES_PATHS`, `PINES_TRAIL`, `GORGE_PATHS`) feed tree/fern/bed clearances, CAM_PATHS, TRUCE_PATH, moordress/riverdress. **Untouched.**
- The `path()` MESHES (name `'path'`, `PlaneGeometry`, matrix) are read at run time by grass.js `flatFootprints` (grass mask), pawprints.js `groundStrips` (which surface prints), walk.js wet/dusk lists, and by test/water.test.js, grass.test.js, gorge.test.js. **They stay, one per segment, same order, same transform, same `geometry.parameters`, same material** — but hidden (`visible = false`) and cut to a 1×1 plane (2 triangles). Hidden meshes skip the main and shadow passes, and mergeprops already skips them.
- Math.random draws (waterlooks BUILD_DRAWS): `path()` still makes exactly the same objects; the new trail mesh is built under `withLocalUuids`.

## Design
New `src/world/pathribbon.js`:
- `trailSegments(groups, { edge = 50 })` — pure. `groups` = `[{ segs, w }]`. Returns `[{ x1, z1, x2, z2, h }]` (h = w/2) where each END is classed: **joined** (within h_other + 0.05 of another segment's centreline) → unchanged; **edge** (|x| or |z| ≥ edge − 0.01) → extended 2 m outward; **free** (a dead end or a bridge/stones gap) → pulled back by h so the rounded tip lands on the authored end.
- `trailField(segs, x, z)` — CPU twin of the shader: `{ owner, sd, alpha }`, with `sd = min_i(dist(p, seg_i) − h_i) − wobble(p)` and alpha a smoothstep feather. Used by tests (water clearance of the visible trail).
- `trailGeometry(segs)` — one quad per segment (2 triangles), the segment's capsule bounds grown by the max wobble + feather; attributes `position` (y 0.01), `uv` (world x,z / tile metres), `trailSeg` (segment index).
- `trailMaterial(color, surface, segs)` — litMaterial with the surface map at repeat [1,1]; `onBeforeCompile` injects the field: each fragment finds the nearest segment (lowest index wins ties) and **discards unless it is its own quad's** (so overlapping quads draw each pixel exactly once: no double blending at joins), then alpha = feather, colour = worn centre / darker damp edge band / low blotches / sparse pebbles. `transparent`, `depthWrite: false`. `customProgramCacheKey` set; `clone()` overridden so weather.js's wet clone and dusk.js's tint clone keep the shader.
- `addTrails(scene, groups, style, key)` — calls `path(..., { footprint: true })` per segment in order (hidden 1×1 data meshes, scene.add each), then builds the trail mesh under `withLocalUuids('trail-uuids-' + key)`: name `'pathTrail'`, `userData.ground = true` (joins walk.js's wet and dusk lists unchanged), `renderOrder = -1` (first transparent, so prints, puddles and decals draw over it). Not noCast (rig.js's sweep gives it receiveShadow; transparency keeps it out of casting).

`builder.js path()` gains `{ footprint }`: PlaneGeometry(w, len, 1, 1), no macro paint, `visible = false`; everything else identical.

## Tasks
1. **pathribbon core + unit tests** (opus). `src/world/pathribbon.js`, the `footprint` option in `path()`, `test/pathribbon.test.js`: end classing (joined/edge/free) on hand cases and on WOODS_PATHS; field union/owner uniqueness on a sampled grid; quad covers every pixel with alpha > 0.002 of its owner; triangles = 2 × segments; material clone keeps onBeforeCompile and cache key; footprint mesh parameters equal the old mesh's.
2. **Wire the five areas** (sonnet). Replace the loops at woods.js:490, river.js:545, moor.js:555-559 (one call, three groups), pines.js:725-727 (one call, two groups), gorge.js:1088 (flagged). Tests: waterlooks draws unchanged; budget; grass/water/gorge path tests; a new sweep that the VISIBLE trail (CPU field alpha > 0.02) never lies in open water; River and Moor triangles ≤ before (report numbers).
3. **Look tuning, live** (parent). Shots at the fixed spots; adjust feather, wobble, edge band, pebbles per area colour; phone shot; rain and dusk.
4. Final whole-branch review (opus) + fix wave; merge main; full suite, build, flat-trace hash.

## Rulings
- Gorge included as a one-line flagged edit ("every wild map"). Cost if wrong: one line to revert.
- Alpha-blended trail instead of vertex-colour fade: the ground under a path is not one colour (macro patches, Moor crest tint), so a true blend is the only edge that matches. Cost: transparent-pass ordering; handled with renderOrder −1 and depthWrite off.
- Hidden 1×1 data meshes keep every reader of `'path'` meshes working unchanged. Cost: +1 mesh in the budget tally per area (draws go down).
