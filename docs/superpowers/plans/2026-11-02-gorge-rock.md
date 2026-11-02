# Gorge Rock Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Gorge's drawn rock reads as natural rock (broken crests, rounded corners, strata relief, edge stones, boulders at wall feet, warm sandstone colour) while the ground, colliders and every gameplay record stay exactly as they are.

**Architecture:** `rockTerrain()` (src/world/builder.js) keeps drawing the same exposed faces of the same shape records, but (1) tessellates them finer and makes the triangle soup *conforming* (no T-junctions, src/world/meshconform.js), then (2) moves every vertex by a displacement that is a pure function of its position (src/world/rockrelief.js). Because shared vertices are bitwise-equal positions and the mesh is conforming, a position-only displacement cannot open a crack. The field is zero on every walkable surface and at every wall foot, never stands proud of the true rock by more than `ROCK_PROUD`, and never recesses deeper than half the rock's thickness. Dressing (lip edge stones, half-buried foot boulders) is written straight into the existing merged meshes, so no draw call is added.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4, plain JS modules.

**Spec:** the owner's request ("Can we do a polish pass on the gorge so the rocks and cliffs aren't just right angles and straight lines?") and the controller brief (goal, hard constraints 1–7). Survey row: scratchpad `polish-survey.md`, Gorge row (#1).

## Global Constraints

- Gameplay doesn't change: `src/world/gorgeshape.js` and `src/ground.js` are not edited. createGround's shapes, heights, ceilings, colliders, perches, STAND_ON, CLAN_STAND_ON, lips-as-walls, cave headroom, routes, spawn points: identical (Task 1 pins them).
- `ROCK_PROUD = 0.15` m: no drawn rock vertex (shell or dressing) over walkable ground stands more than 0.15 m (2D) from a wall-forming rock column. Inside a cave or den void: 0.02.
- Walkable tops (every `kind: 'walk'` shape, cave/den floors, the camp den) are drawn exactly at the ground's height; vertices on them do not move.
- Cave/den ceilings are never drawn lower than the ground's ceiling.
- Determinism: no `Math.random`, no walkRng/strayStream. New noise uses an integer hash (`Math.imul`), no `Math.sin`/`Math.cos`/`Math.hypot` in anything a test pins exactly. Dressing writes raw position arrays (no per-stone THREE geometry objects, so no UUID draws).
- `test/fixtures/flat-trace.json` byte-identical to main (sha256 `6b502ab6b1f9ce328fd6c6b7ce656fd473e50670708fac53985590bc9f0e54a7`); flattrace.test.js `MOOR_BUILD_DRAWS` stays 7944. Never re-record.
- Draw calls: the Gorge's built scene keeps 54 meshes / 36 casters (`build(scene)`); `gorgeRock` keeps exactly three meshes `rockFaces`, `ledgeTops`, `lips`.
- Triangles: `rockFaces + ledgeTops + lips` ≤ 16,000 (today 5,570: 4,686 / 36 / 848). Whole Gorge build stays under budget.test.js's 60,000.
- Floats on CI: fixture comparisons use `closeDiffs` (test/helpers/closeto.js); geometry sweeps get explicit timeouts (`120_000`).
- Only the Gorge calls rockTerrain (checked: gorge.js, tests). Other territories must not change.
- Do NOT edit: src/cat/*, src/game/walk.js, src/main.js, src/style.css, src/treefade.js, src/ui/hud.js, src/fightcam.js, `.claude/launch.json`.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` and `npm run build`. Commits: explicit `git add <paths>`, message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A seam where a displaced wall meets an undisplaced surface (ledge top, ramp, groundPlane at y 0, cave floor): it must stay closed. Covered by Task 4's "conforming after relief" and "walk-top vertices unmoved" tests plus "every wall foot sits on its ground".
2. Thin rock (lips 0.4 m, slivers left by rectangle subtraction): two faces recessing toward each other must never cross. Covered by Task 3's thickness test and Task 4's "no vertex leaves its own side" test.
3. Cave mouths and corridors: nothing new pokes into a corridor, roofs never come down. Covered by Task 4's cave tests and the existing den/cave line-of-sight tests in test/gorge.test.js (which must still pass unchanged).
4. Things standing on rock tops (the goat on the shoulder at (3.5..7.5, -16) and its hide (8, -12.5); the pine stand on the west top): crest jag must not lift or drop rock under them. Covered by Task 3's keep-disc test and Task 4's pine-stand test.
5. Determinism across platforms: same build twice is identical, and nothing pinned depends on `Math.sin`. Covered by the existing "same every time" tests and Task 3's integer-noise test.

---

### Task 1: Gameplay guard (before any rock change)

Pins what must not move, recorded from the untouched branch.

**Files:**
- Create: `test/gorgerock-guard.test.js`
- Create: `test/fixtures/gorge-gameplay.json` (written by the test's record mode, then committed)

**Interfaces:**
- Produces: the fixture and test that every later task must keep green.

- [ ] **Step 1: Write the test.** Same `document` stub as test/builder.test.js. It builds `build(new THREE.Scene())` from src/world/gorge.js and computes:
  - `specSha`: sha256 of `JSON.stringify(GORGE_GROUND_SPEC)` (src/world/gorgeshape.js);
  - `groundSha`: sha256 of the string of `ground.y(x,z).toFixed(6)` and `ground.ceil(x,z)` (`'inf'` when Infinity, else `toFixed(6)`) over x, z from -62 to 62 step 0.5, joined with `,`;
  - `area`: `JSON.parse(JSON.stringify({ ...area, waterFx: undefined, ground: undefined, life: undefined }))`;
  - `meshes` / `casters`: counts of `isMesh` objects in the scene and of those with `castShadow` true;
  - `rockMeshes`: sorted names of the mesh children of `gorgeRock`.
  - Record mode: when `process.env.RECORD_GORGE_GUARD === '1'`, write these to `test/fixtures/gorge-gameplay.json` (pretty JSON) and pass. Otherwise read the fixture and assert: `specSha` and `groundSha` equal exactly; `closeDiffs(area, fixture.area)` is `[]`; `meshes === 54`, `casters === 36`, `rockMeshes` equals `['ledgeTops','lips','rockFaces']`. Timeout `120_000`.
- [ ] **Step 2: Record** with `RECORD_GORGE_GUARD=1 npx vitest run test/gorgerock-guard.test.js`, then run it again without the env var: PASS. Check the fixture's `meshes` is 54 and `casters` 36.
- [ ] **Step 3: Commit** `test/gorgerock-guard.test.js test/fixtures/gorge-gameplay.json` ("test(gorge-rock): pin the Gorge's ground and gameplay before the rock pass").

### Task 2: A conforming, finer rock shell (no displacement yet)

The same surface, cut finer, with no T-junctions anywhere across the three meshes.

**Files:**
- Create: `src/world/meshconform.js` (pure, no THREE)
- Create: `test/helpers/meshcheck.js` (independent T-junction finder for tests)
- Create: `test/meshconform.test.js`
- Modify: `src/world/builder.js` `rockTerrain()` and its header comment (~2916–3150)
- Test: `test/builder.test.js` (the Gorge rock block, ~845)

**Interfaces:**
- Produces: `conformTriangles(bins, { eps = 1e-6 } = {}) -> bins` in src/world/meshconform.js. `bins` is `{ [name]: number[][] }`, each a flat list of `[x,y,z]` vertices, three per triangle, wound as given. Returns new bins in which (a) every position is quantised to `eps` (`Math.round(v / eps) * eps`), and (b) no vertex of any bin lies strictly inside an edge of any triangle of any bin (within `eps`). A triangle with T-points only on one edge is fanned from the opposite vertex; with T-points on two or three edges it is fanned from its centroid. Every output triangle keeps the input triangle's winding and bin, and has area > 0.
- Produces: `findTJunctions(positionsByMesh, eps = 1e-5) -> string[]` in test/helpers/meshcheck.js: brute force with a spatial hash, written independently of meshconform.js; returns descriptions of offending (vertex, edge) pairs, at most 20.
- Produces: rockTerrain constants `ROCK_CELL = 1.6` (horizontal cell), `ROCK_ROW = 1.4` (wall row height), `CREST_BAND = 1.5` (depth of the tessellated ring round a rock top). Ledge-bin side faces are now subdivided like the rock (ledge *tops* stay one quad).

- [ ] **Step 1: Failing tests.** In test/meshconform.test.js: two coplanar squares sharing an edge, one split into 2 and the other into 4 along it → `findTJunctions` finds 1 offender before, `conformTriangles` output has none, total area unchanged (to 1e-9), every output triangle's normal points the same way as its source. A triangle with T-points on two edges is fanned from its centroid (output count = edge points + 3). In test/builder.test.js add `it('the rock shell has no T-junctions', …)`: `findTJunctions` over the three meshes' positions → `[]` (timeout `120_000`).
- [ ] **Step 2: Run** — the builder test fails today (tops are one quad against 2 m side cells).
- [ ] **Step 3: Implement** `conformTriangles` (spatial hash of unique quantised vertices, cell ~2 m; for each triangle edge collect hashed vertices strictly between its ends within `eps` of the segment, sorted along it). In rockTerrain: side faces cut into `ROCK_CELL` steps and `ROCK_ROW` rows for every bin (rock, lip and ledge sides); rock tops (masses and caps, not walks or lips) drawn as a ring of cells `CREST_BAND` deep whose cells along each edge use that edge's step breakpoints, plus the inner rectangle as one quad (whole top gridded when narrower than `2 * CREST_BAND`); walkable and lip tops stay one quad. Then `conformTriangles` over the three bins before building geometry. Update the header comment (cells, rows, ring, conformity).
- [ ] **Step 4: Run** test/meshconform.test.js, the whole test/builder.test.js, test/gorge.test.js, test/rig.test.js, test/gorgerock-guard.test.js: all PASS. Print the three meshes' triangle counts in the commit message.
- [ ] **Step 5: Commit** the five files ("feat(gorge-rock): conforming, finer rock shell").

### Task 3: The relief field

A pure function of position saying how far each rock vertex moves.

**Files:**
- Create: `src/world/rockrelief.js` (pure, no THREE)
- Create: `test/rockrelief.test.js`

**Interfaces:**
- Consumes: shape records as rockTerrain gets them (`{ minX,maxX,minZ,maxZ,y0,y1,along,kind }`; ceilings with `y0` = ceiling height).
- Produces (all exported from src/world/rockrelief.js):
  - `ROCK_PROUD = 0.15`, `CAVE_PROUD = 0.02`, `RELIEF_DEPTH = 0.8` (max recess), `CORNER_CUT = 0.7`, `FOOT_RISE = 1.0`, `CREST_JAG = 1.2`, `CREST_BAND = 1.5`, `FRAME_FADE = 3`.
  - `noise3(x, y, z, seed) -> [0,1)`: value noise on the integer lattice, smoothstep-trilinear, lattice hash by `Math.imul` (no `Math.sin`).
  - `createRockRelief({ walks, masses, ceilings, seed = 0, keep = [] }) -> { at(x, y, z) -> { dx, dy, dz, recess }, rockAt(x, y, z) -> boolean, wallNear(x, y, z, r) -> boolean }`. `keep` is `[{ x, z, r }]` discs where no rock top moves. `recess` is the horizontal inward move in metres (negative = proud), for colouring.
  - `rockAt`: true when (x, z) is in a mass, walk or lip column and y is below its top (`shapeY`), or in a ceiling cap's rectangle with ceiling < y < cap top (`capTopFor` from builder.js's logic; copy the rule, rockrelief.js must not import builder.js). Shapes indexed in a 4 m bucket grid.
  - `wallNear(x, y, z, r)`: some point within 2D distance r of (x, z) is `rockAt` at height y (16 directions on rings 0.05 m apart, plus the centre).

The field `at(p)` (every term continuous where it can be; all evaluated only from p):
1. **Walk surfaces don't move.** `W(p)` = highest of 0 and every `kind: 'walk'` shape, cave/den floor and camp den whose rectangle (closed, 1e-6) contains p.xz with height ≤ p.y + 1e-6. `h = p.y - W(p)`; foot factor `s = smoothstep(0, FOOT_RISE, h)`. A point on a walk surface has h = 0, so it gets 0.
2. **Inward direction.** `n_in` = normalised Σ of unit directions d over 8 compass directions at radius 0.3 weighted by `rockAt(p + 0.3 d, p.y - 0.02)`. If the sum's length < 0.2: no horizontal move.
3. **Recess** `r = -ROCK_PROUD + (ROCK_PROUD + RELIEF_DEPTH) * (0.55 * noise3(x/2.4, y/3.0, z/2.4) + 0.45 * strata(p))`, where `strata(p)` = hash of the band index `floor((y + 0.6 * noise3(x/6, 0, z/6)) / 1.1)` (a per-band depth in [0,1): the shelves). Plus the corner cut: `CORNER_CUT * clamp((0.5 - frac) / 0.25, 0, 1)` where `frac` = share of 16 points on a 0.75 m ring at height p.y - 0.02 that are `rockAt` (0.5 on a flat wall, 0.25 at a convex corner).
4. **Clamps.** `r ≤ thick/2 - 0.05` where `thick` = distance along `n_in`, stepping 0.05 m up to 2 m, to the first point not `rockAt` at height p.y - 0.02 (2 m when none). In a cave or den (any of the step-2 samples is inside a ceiling rectangle with floor < p.y < ceiling): `r ∈ [0, 0.08]` plus the corner cut. Else `r ≥ -ROCK_PROUD`.
5. **Fades.** Multiply r by `s` and by `clamp((frameDist - 1) / FRAME_FADE, 0, 1)` where frameDist is the 2D distance to the edge of the shapes' bounding frame (the ±62 box).
6. **Crest jag** (only for p on a rock top: p.y within 1e-6 of the highest mass or cap top at p.xz, and that shape isn't a walk or lip): `crest` = smallest of 8 compass distances (0.1 m steps, ≤ `CREST_BAND`) to a point whose ground (highest column top) is ≥ 1 m below p.y. `dy = min(CREST_JAG, 0.3 * drop) * (1 - crest / CREST_BAND) * (1.3 * noise3(x/1.3, 7.7, z/1.3) - 0.3)`, faded by the frame fade and by `clamp((dist to keep disc - r) / 1, 0, 1)`; 0 when no crest within the band.
7. `dx, dz = n_in * r`; `recess = r`.

- [ ] **Step 1: Failing tests** in test/rockrelief.test.js using the Gorge's records (`ROCK_WALKS` from gorge.js, `MASSES`, `CEILINGS`, seed 7, keep `[{ x: 8, z: -12.5, r: 1.2 }, { x: 3.5, z: -16, r: 1.2 }, { x: 5.5, z: -16, r: 1.2 }, { x: 7.5, z: -16, r: 1.2 }]`):
  - `at` is identical for identical input (two fields, 500 points); `noise3` gives the same value as a recorded literal for three inputs (pin computed values exactly: integer hash, no transcendental).
  - Walk surfaces: 400 points on walk tops (the legs, ledges, clifftop, cave floors, camp den; inside and on edges) → `dx = dy = dz = 0`.
  - Proud bound: for 2,000 points sampled on the true wall planes (from the shapes' edges where `rockAt` differs across the edge, heights between the lower ground and the top), the moved point `p + d` satisfies `wallNear(p + d, ROCK_PROUD + 1e-6)`; for points beside a cave void, `wallNear(…, CAVE_PROUD + 1e-6)`.
  - Thickness: on the lip column faces (lipA x = 2.0 outer face, heights in the lip band walk..walk+0.35) `|dx| ≤ 0.15 + 1e-9`.
  - Ceilings: points on every ceiling's underside → `dy = 0`.
  - Keep discs: points on the shoulder top within 1.2 m of (8, -12.5) → `dy = 0`.
  - The field does something: over the same 2,000 wall points the mean `|r|` > 0.2, at least 30% recess more than 0.3, and on the 20 m rims' crests the max `dy` > 0.5.
- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** src/world/rockrelief.js per the definition above, with a file header comment saying what each term is for and why the field is a pure function of position (watertight on a conforming mesh).
- [ ] **Step 4: Run** test/rockrelief.test.js → PASS (timeout `120_000` on the sweeps). Report how long 10,000 `at()` calls take (must be < 1 s).
- [ ] **Step 5: Commit** `src/world/rockrelief.js test/rockrelief.test.js` ("feat(gorge-rock): the rock relief field").

### Task 4: Apply the relief, warm the colour, restate the rock tests

**Files:**
- Modify: `src/world/builder.js` `rockTerrain()` (signature, displacement, colours, header comment), `ROCK_LOW`, `ROCK_HIGH`, strata constants
- Modify: `src/world/gorge.js` (pass `keep`; update the G5 comment on colours)
- Modify: `test/builder.test.js` (the Gorge rock block)

**Interfaces:**
- Consumes: Task 2's `conformTriangles`, Task 3's `createRockRelief`, `ROCK_PROUD`, `CAVE_PROUD`.
- Produces: `rockTerrain({ walks, masses, ceilings, seed = 0, relief = true, keep = [] })`. `relief: false` draws the Task 2 shell unmoved. The group's `userData.shellTris = { rockFaces, ledgeTops, lips }` (triangles before any dressing; Task 5 appends after them). gorge.js exports `GORGE_ROCK_KEEP` (the four discs listed in Task 3) and passes it.

- [ ] **Step 1: Restate the existing tests to the new bounds and add the new ones** (all with timeout `120_000`):
  - "every rim is drawn where the cat stops": rays start `ROCK_PROUD + 0.05` inside the edge, `far = ROCK_PROUD + 0.05 + 0.15`; keep the winding check.
  - "no rock hangs over walkable ground": a reached grid point is tested only when no wall is within `ROCK_PROUD + 0.01` (use `createRockRelief(...).wallNear` at y = ground + 0.05 … or the ground: any point within that 2D radius whose ground is ≥ 0.3 above or which is under a ceiling); then the old assertions.
  - "walkable tops drawn at ground height": margin `M = ROCK_PROUD + 0.05`.
  - "a lip closes the gap between legs": `hits[0].point.x ≥ edge - ROCK_PROUD`.
  - seams between equal masses: sample t from `lo + 1.0` to `hi - 1.0`.
  - "rock is darker and cooler at the bottom": unchanged (must still pass with the new colours).
  - NEW "no drawn rock stands proud over walkable ground": for every vertex v of the three meshes, if v is over walkable ground (not `rockAt(v)`, the highest column under v.xz is a walk/cave/den floor or base, and v.y is above it and below any ceiling there), then `wallNear(v.x, v.y, v.z, ROCK_PROUD + 1e-4)`; inside a cave or den rectangle under its ceiling, `CAVE_PROUD + 1e-4`.
  - NEW "the relieved shell is still conforming": `findTJunctions` over the first `userData.shellTris` triangles of each mesh → `[]`.
  - NEW "walk-top vertices don't move": build with `relief: false` and `relief: true`; every shell vertex of the unmoved build lying on a walk top appears (quantised) in the moved build at the same position — check via a set of the moved build's quantised positions.
  - NEW "roofs never come down": every vertex whose 2D position is inside a ceiling rectangle (inset 0.2) and within 0.3 of the ceiling height has `y ≥ ceiling - 1e-6`.
  - NEW "the rock has relief": over rockFaces vertices from the moved build vs the unmoved one (same order), ≥ 50% of wall vertices moved by > 0.05 and the rims' highest vertex is ≥ 20.5.
  - NEW "within its triangle budget": `rockFaces + ledgeTops + lips ≤ 16000`.
  - NEW in test/gorge.test.js: the pine stand's trees all stand on rock drawn at y 9 (a down-ray at each stand pine's (x, z) from 30 hits rockFaces at 9 ± 0.01).
- [ ] **Step 2: Run** → the NEW relief tests FAIL.
- [ ] **Step 3: Implement.** In rockTerrain after conforming: one relief field per call; for each unique quantised vertex compute `at()` once (Map by key), move every occurrence; recompute normals (flat). Colour from the vertex's ORIGINAL y: `ROCK_LOW = 0x6f6a66`, `ROCK_HIGH = 0xd2b48c`; strata bands 1.1 m (same warped band index as the relief's strata so colour and shelves line up), each band ×(1 ± 0.09) with alternate bands tinted warm (×[1.05, 0.98, 0.92]) or cream (×[1.02, 1.02, 0.99]); recesses darkened `× (1 - 0.25 * clamp(recess / RELIEF_DEPTH, 0, 1))`. Ledge bin keeps its plain material. gorge.js passes `keep: GORGE_ROCK_KEEP`. Rewrite the header comment's "Every vertex lies on its shape's own plane" paragraph to describe the relief and its bounds.
- [ ] **Step 4: Run** test/builder.test.js, test/gorge.test.js, test/rig.test.js, test/gorgerock-guard.test.js, test/caves.test.js, test/camp.test.js, test/gorgeclan.test.js, test/budget.test.js → PASS. Report triangle counts and rockTerrain build time.
- [ ] **Step 5: Commit** builder.js, gorge.js, builder.test.js, gorge.test.js ("feat(gorge-rock): relief and sandstone colour on the Gorge rock").

### Task 5: Edge stones on the lips, boulders at the wall feet

**Files:**
- Modify: `src/world/builder.js` (rockTerrain appends dressing after the shell)
- Modify: `test/builder.test.js`, `test/budget.test.js` (the Gorge comment's triangle numbers only)

**Interfaces:**
- Consumes: Task 4's field (for `rockAt`, `wallNear`, `at`), `userData.shellTris`.
- Produces: rockTerrain option `dressing = true`; `group.userData.dressing = { lipStones: n, footBoulders: m }`.

- [ ] **Step 1: Tests:**
  - lip stones: `userData.dressing.lipStones` between 200 and 360; every lip-stone vertex is within `[lipTop - 0.2, lipTop + 0.13]` vertically (lipTop = the lip's `shapeY` at the vertex's x, z clamped into the lip) and inside the lip's rectangle grown by 0.1.
  - foot boulders: between 40 and 90; each is in rockFaces after `shellTris.rockFaces`.
  - the "no drawn rock stands proud" test (Task 4) now runs over all vertices, dressing included, and still passes.
  - same every time (existing test covers it); triangle cap ≤ 16,000 still holds; `npx vitest run test/budget.test.js` passes.
  - cave mouths stay open: no boulder centre within 1.0 m of any cave or den mouth (`GORGE_CAVES[].mouth`, `GORGE_DENS[].mouth`, `CAMP_DEN.mouth`) — rockTerrain gets them via a new `mouths` option `[{x, z}]` from gorge.js.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - Lip stones (into `lips`): for each `kind: 'lip'` walk, along its long axis, stones of length 0.35–0.75 with 0.03–0.08 joints between them (lengths and joints from the integer hash); each a box 12 triangles: across the lip's 0.4 m plus 0.04–0.10 each side, bottom 0.18 below the lip top, top 0.04–0.12 above it (the lip's ramp height at the stone's middle); its eight corners pulled toward the box centre by 0–0.05 per axis (hash), never pushed out. Vertex colour: the rock colour at that height × 0.9–1.05.
  - Foot boulders (into `rockFaces`): candidates every 3.2 m (± 1 m hash jitter) along every drawn wall step whose outward foot is on walkable ground (floor, ledges, clifftop) and whose rock rises ≥ 1.0 m there; radius 0.45–0.9; centre `radius - 0.12` behind the true wall plane at the foot, 30% sunk below the ground; kept only where `rockAt` holds at the centre at foot + 0.3 and ≥ 1.0 m from mouths; capped at 90. Shape: the 12 icosahedron vertices (golden-ratio constants, no trig), each scaled 0.8–1.1 by hash, flattened ×0.7 in y; 20 triangles.
  - Both written as raw `[x,y,z]` triangles into the bins after conforming and relief, with colours; then normals.
  - Update budget.test.js's Gorge comment with the measured mesh/caster/triangle numbers (ceilings unchanged).
- [ ] **Step 4: Run** test/builder.test.js, test/gorge.test.js, test/budget.test.js, test/gorgerock-guard.test.js, test/caves.test.js, test/camp.test.js → PASS; full suite `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` → PASS; `npm run build` → OK; `shasum -a 256 test/fixtures/flat-trace.json` → `6b502ab6…`.
- [ ] **Step 5: Commit** ("feat(gorge-rock): edge stones on the lips and boulders at the wall feet").

### Task 6 (controller): live check and notes

- AFTER screenshots from the same fixed cameras (scratchpad `snaps-gorge-rock/scripts/shots.mjs after desk|phone`), `?perf` draws (`perf.mjs`), pair images, colour tuning if needed (ROCK_LOW/HIGH, strata only), a VISUAL-PASS.md entry with before/after numbers and rulings.
