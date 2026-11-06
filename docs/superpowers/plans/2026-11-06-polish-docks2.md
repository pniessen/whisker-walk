# polish-docks2: warehouses with character — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Docks' five `warehouse()` buildings stop reading as flat pastel boxes: brick bands and a plinth, framed windows with sills, plank loading doors with a hoist beam, downpipes, and a stepped or saw-tooth roofline on the roofs no cat perches on.

**Architecture:** Zero new meshes. Every addition is baked into the geometry of a mesh `warehouse()` already makes, so the pre-merge mesh count (silhouette pin 519), the merged count, and the Math.random draw count (waterlooks docks 6916, flat trace) stay put. Each touched mesh keeps its `surfBox`/`box` call exactly as today (same draws, same caches); then, inside `withLocalUuids('warehouse-<x>,<z>')`, its `geometry` is swapped for a freshly built, vertex-coloured, non-cached BufferGeometry and its material gets `vertexColors = true`. The piece builders live in a new file `src/world/warehouselook.js`; builder.js changes only inside `warehouse()`.

**Tech Stack:** Three 0.185, Vitest 4.

**Spec:** scratchpad/polish-survey-7.md, "7-4 polish-docks2" (ranked #5), plus polish-common.md.

## Global Constraints
- builder.js: touch `warehouse()` only. docks.js: the `warehouseAt` calls / fish shed call only. Colliders, roof heights (deck y = h, parapet top = h + PARAPET), perches unchanged.
- No Math.random outside `withLocalUuids`; placement variation by a pure hash. Never call `roundedBox`, `box`, `surfBox`, `mat`, `litMaterial` inside the local stream (they cache geometries/textures across areas).
- waterlooks BUILD_DRAWS docks 6916; flat trace af07901717f1…7b83a; silhouette docks 519 meshes, 67 decals.
- Docks ≤ +12k triangles (64,334 now, cap 90k); merged meshes ≤ +5 (target 0).
- `userData.window` stays on every existing pane; panes are not moved or resized.
- Every mesh in a merge class keeps the same attribute set (position, normal, uv, color) and index state, so mergeprops still merges the four parapet lips into one.

## Mesh → what it carries (the bake map)
| existing mesh | material after | carries |
|---|---|---|
| `body` (children[0]) | its brick/siding material, `vertexColors` on, colour unchanged | 4 walls in horizontal bands (plinth band dark ×0.62, two darker "header" brick bands at window-head heights ×0.82, wall ×1 with a soft grime gradient near the ground), proud plinth ring (0.55 tall, +0.05), corner piers (0.34 wide, +0.06), a string course between window rows (h > 3.4), a cornice band under the parapet, stepped parapet panels (roofline 'stepped'). UVs in metres on one basis (u = metres/w, v = metres/h) on every face. `geometry.parameters = {width:w,height:h,depth:d}` kept for viewclear2. |
| `deck` | shingle material, `vertexColors` on | deck slab; saw-tooth north-light ridges (roofline 'sawtooth', glazing faces dark ×0.35); hoist beam + rope + hook (constant UV, wood-brown tint). |
| 4 `lip`s | each lip's own material, `vertexColors` on, colour → white | lip box (roofColor baked); lip 0 also carries the hopper heads + downpipes (roofColor ×0.8). |
| `door` | wood material, colour → white, `vertexColors` on | the shipped door + ledges, and the loading doors on the canal (−z) face; painted a hash-picked door colour. |
| `lintel` | flat material, colour → white, `vertexColors` on | the shipped lintel (0x5e5450 baked), every window's frame ring + glazing-bar cross (frame colour) and sill + head (stone colour), the loading-door jambs/head. |

## Rulings
- R1 Loading bay on the −z face (it faces the canal on every warehouse), between two window columns, at a hash-picked gap; upper loading door only when h ≥ 4; hoist beam only when h ≥ 3.4 (not the fish shed).
- R2 Roofline: `look.clear` points (perches) within 1.5 m of the footprint force 'flat'. Otherwise hash picks 'stepped' or 'sawtooth'. W1 and the fish shed stay flat (they carry perches).
- R3 The treefade box pins (treefade.test.js, contactshadows.test.js warehouse case) move by the trim's few cm; update them to the new measured numbers with a comment. viewclear2's limits (w + 0.3, d + 0.5) must still pass unchanged.

## Review Focus
1. Draw count / flat trace / silhouette 519 unchanged (a stray `box()` in the local stream would break the NEXT area's draws silently — waterlooks catches it).
2. The merged Docks count must not rise: four lips with mismatched attributes would split.
3. A perched cat on W1's parapet (17, 12.1, 5.3) and the tank (18.6, 13.6, 6.2), and the shed perch (5.2, −21.1, 2.1), must not be inside new geometry.
4. Dusk: windows still glow (pane materials untouched); trim must not glow or go white.
5. Deterministic: two builds give byte-identical geometry.

---

### Task 1: the masonry, the windows, the downpipes (warehouselook.js + warehouse())

**Files:** Create `src/world/warehouselook.js`; modify `src/world/builder.js` `warehouse()`; test `test/warehouselook.test.js`; update `test/treefade.test.js` / `test/contactshadows.test.js` warehouse numbers if they move.

**Interfaces — produces:**
- `warehouse(x, z, w, d, h, bodyColor, roofColor, bodySurface, look = {})` — `look = { clear?: [{x,z}], roofline?: 'flat'|'stepped'|'sawtooth' }`.
- In warehouselook.js: `pieceBuffer()` accumulator with `box(cx,cy,cz, sx,sy,sz, rgb, {skip, uvBasis})` and `quad(...)`, `toGeometry()` → indexed BufferGeometry (position, normal, uv, color); `lookFor(x, z, w, d, h, clear)` → `{ roofline, frame, stone, door, bay }` (pure hash).

- [ ] Step 1: failing tests in `test/warehouselook.test.js`: (a) `warehouse(...)` mesh count equals the shipped count for (20,16,10,8,5) and the shed (6,5,1.8); (b) Math.random draws for one `warehouse()` call equal the shipped count (spy Math.random); (c) every mesh carries a `color` attribute except panes; the four lips share attribute set; (d) every pane still `userData.window` and same position; (e) deterministic: two builds' positions arrays equal; (f) `buildDocks` triangles − 64,334 ≤ 12,000 and `mergeStaticProps` mesh count unchanged vs a pinned number measured before the change.
- [ ] Step 2: run, see (c)/(f-size) fail.
- [ ] Step 3: implement body + lintel trim + lip downpipes.
- [ ] Step 4: run the new test, waterlooks, silhouette, viewclear2, treefade, contactshadows, mergeprops, budget, docks, flattrace.
- [ ] Step 5: commit.

### Task 2: loading doors, hoist, rooflines, docks.js wiring

**Files:** `src/world/warehouselook.js`, `warehouse()` door/deck bakes, `src/world/docks.js` (pass `{ clear: <perches on that roof> }` to W1 and the shed), tests in `test/warehouselook.test.js`.

- [ ] Step 1: failing tests: W2/W3/W4 get a non-flat roofline and both kinds appear among them; W1 and the shed are 'flat'; no new geometry vertex lies within 0.6 m (xz) and above y − 0.3 of each roof perch; the hoist beam exists only when h ≥ 3.4.
- [ ] Step 2–4: implement, run the same test list.
- [ ] Step 5: commit.

### Task 3: numbers and live check (parent session)
- tris6 before/after, merged meshes/casters, BEFORE/AFTER pairs (desk day, dusk, sunset, phone 390 day + dusk), full suite + build.
