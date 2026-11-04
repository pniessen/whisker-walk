# polish-beach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Seaside's bare, washed-out beach a lovely beach: varied warm sand, a tide line of seaweed with shells and starfish, pebbles, driftwood, wind ripples, two sandcastles with flags, a striped towel and umbrella near the spawn, a finished boardwalk edge with posts, and a slightly deeper sky top.

**Architecture:** A new module `src/world/beachdress.js` (owned only by this build) builds two noCast meshes under `withLocalUuids`: `beachPaint` (flat vertex-coloured marks just above the sand) and `beachDressing` (small raised props). It also exports `sandTint(x, z)`, a smooth colour multiplier that `seaside.js` applies in place to the ground plane (via `dressing.js` `tintGround`) and to the wet-sand band, so the two stay matched. `seaside.js` calls `dressBeach(scene, record)` at the end of `build()` with the area record it is about to return, so keep-outs come from the real data.

**Tech Stack:** Three.js 0.185, Vitest 4, Vite 8.

**Spec:** scratchpad `polish-survey-4.md` ranked row #6 and "4B-2 polish-beach"; shared rules `polish-common.md` (Pass 4B section).

## Global Constraints

- Visual only. Colliders, bounds, walkable ground, spawn, POIs, collectibles, perches, critter spawns: unchanged.
- No Math.random: every new Three object is made inside `withLocalUuids('seaside-beach-…', …)`; randomness from `hash01` (builder.js). `test/waterlooks.test.js` BUILD_DRAWS seaside stays 860.
- Flat trace `test/fixtures/flat-trace.json` sha256 3dfb11a4d847498330c2f1bbc766add06531d4efadaab4c710868df495c1d838 unchanged.
- Seaside triangle ceiling 30,000 (test/budget.test.js) is NOT raised. Today 26,904; this build lands at ≤ 29,600.
- +2 meshes only (beachPaint, beachDressing); both `userData.noCast = true`, `castShadow = false`, `receiveShadow = true`.
- Do not touch boats, cliff, sea (`createWater` call), water.js, waterdress.js, grass.js.
- Commits: explicit `git add <paths>`, message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; long sweeps get explicit 120_000 timeouts.

## Layout facts (from seaside.js / propsets.js / grass.js)

- Ground plane 140×140 at y 0, 64×64 segments; wet band x 21.8..25.4 at y 0.008; boardwalk plane x 18..22, z -45..45 at y 0.03; sea from x 25 (y 0.05); pier x 22..46, z -11.5..-8.5.
- Spawn (18, 42); default camera looks north (-z). Bounds x -48..36, z -34..48.
- Dune grass grows west of x 4 and along the cliff foot (z < -24); the front beach x 4..18 is bare — that is where castles, towel, ripples go.
- Contact-shadow decals at y 0.015; paint must stay below.

## Review Focus

1. A prop overlapping an interactive thing (fish, box, bench, POI, rest, carryable shell) makes a kid think it is the find — test every dressing anchor ≥ its clearance from the keep-out list.
2. Rain and dusk darken `userData.ground` meshes only; untagged paint would glow light on dark wet sand — tag beachPaint and wet-sand as ground; test it.
3. Paint under the wet band (y 0.008) would be invisible — tide-line paint sits at y 0.011; test the y of every paint vertex by zone.
4. Props in open water or on the boardwalk deck look wrong — test no raised prop anchor lies at x ≥ 24.6 or inside x 18..22 (except the boardwalk's own edge boards/posts).
5. Sky top deepened must leave the horizon (fog) colour 0xe8e0d0 untouched.

---

### Task 1: Sand tint, wet band match, sky top

**Files:**
- Create: `src/world/beachdress.js`
- Modify: `src/world/seaside.js` (build(): applySky top; after `b.ground`, tint it; `wetSandBand()` multiplies by sandTint and tags ground)
- Modify: `test/sky.test.js` (seaside pair top), `test/seaside-visuals.test.js`
- Test: `test/beachdress.test.js`

**Interfaces:**
- Produces: `export function sandTint(x: number, z: number): [r, g, b]` — linear multipliers. `export const SKY_TOP = 0x88bce6` exported from seaside.js.

- [ ] **Step 1: failing tests** in `test/beachdress.test.js` (copy the document stub from test/seaside-visuals.test.js):
  - `sandTint is warm and a touch darker on average`: mean over a 2m grid of x -48..24, z -34..48: r in [0.93, 0.99], g in [0.90, 0.97], b in [0.84, 0.93], r > g > b.
  - `sandTint varies across the beach`: max−min of g over that grid ≥ 0.07 and ≤ 0.2.
  - `sandTint is smooth`: |g(x,z) − g(x+1,z)| < 0.02 everywhere on the grid (the ground's 2.2m vertices must interpolate it faithfully).
  - `the ground plane carries the tint`: build(scene); ground's color attribute at a vertex = macro value × sandTint at that vertex's world xz (compare to a build with tint stripped is not possible — instead assert the mean g of the ground's colour attribute < 0.975).
  - `wet sand is tagged ground and matches sandTint at its dry edge`: wet-sand `userData.ground === true`; for vertices with world x ≤ 21.9, colour ≈ sandTint (closeTo 3 digits).
  - In seaside-visuals: keep existing min-colour test (0.2 < min < 0.28) passing.
  - `seaside sky top is deeper, horizon unchanged`: `scene.background`/applySky is hard to read — assert `SKY_TOP === 0x88bce6` and that seaside.js still passes 0xe8e0d0 (read via scene.fog.color.getHex() === 0xe8e0d0).
- [ ] **Step 2:** run `npx vitest run test/beachdress.test.js` → FAIL (module missing).
- [ ] **Step 3: implement.** `sandTint`: base `[0.965, 0.94, 0.895]`; f = `smoothField(x, z, 41, 22)` (dressing.js); m = 1 + 0.06 f, warm shift r += 0.015 f, b −= 0.01 f; plus a drier, paler, greyer back beach for x < −20 blending over 15m (multiply by up to [1.0, 1.0, 1.02] and lighten 3%). Ground: `g.updateMatrix(); tintGround(g, sandTint)` in seaside.js right after `b.ground`. Wet band: multiply each vertex's colour by sandTint(worldX, worldZ) and set `m.userData.ground = true`. applySky top → `SKY_TOP`. Update test/sky.test.js seaside pairs to 0x88bce6 (two places).
- [ ] **Step 4:** run the three test files + test/seaside.test.js + test/waterlooks.test.js + test/flattrace.test.js → PASS.
- [ ] **Step 5: commit** `feat(seaside): warmer varied sand, wet band matched and rain/dusk-tinted, deeper sky top`.

### Task 2: beachPaint — tide lines, ripples, towel, shade

**Files:** Modify `src/world/beachdress.js`, `src/world/seaside.js` (call at end of build), Test `test/beachdress.test.js`

**Interfaces:**
- Produces: `export function dressBeach(scene: THREE.Scene, area: AreaRecord): { paint: Mesh, dressing: Mesh|null }` — adds meshes to scene. Task 2 adds only `paint`; Task 3 adds `dressing`. `export function beachKeepOut(area): {x,z,r}[]` — every point props must avoid (pois r1.6, collectibles r1.4, scenics r1.4, boxes r1.2, tippables r1.0, perches r1.4, rocks (perch list + [12,-10],[-32,-10],[-32,30]) r1.4, bushes [-14,30],[-2,-14],[-24,-20],[8,2],[-30,5],[12,20] r1.6, billboard (15,34) r2.6, benches (18,14),(18,-18) r1.6, lamps (20,±30) r0.8, all `propsFor('seaside')` carryables/knockables/markables/rests r1.2 (flaps r1.5), gold mice (-28,18),(-29,19),(-32.3,-10.4) r1.2, spawn (18,42) r3, dog yard (-8,-25) r5, rival disc (-34,36) r8).
- `export const TIDE_Y = 0.011`, `PAINT_Y` from dressing.js (0.005) for dry-sand paint.

- [ ] **Step 1: failing tests:**
  - `paint is one noCast mesh tagged ground`: name 'beachPaint', `userData.noCast`, `userData.ground === true`, vertexColors, castShadow false.
  - `paint stays flat and under the contact shadows`: every vertex y ∈ {PAINT_Y, TIDE_Y}; vertices with x > 21.7 have TIDE_Y, others PAINT_Y; all y < 0.015.
  - `no paint in the sea or on the deck`: every vertex x < 24.6 and not (18.1 < x < 21.9 && |z| < 45).
  - `tide line runs the beach`: paint triangles with centroid x in 22.2..23.8 cover ≥ 45% of the z range −44..44 in 1m bins, skipping |z+10| < 2.5 (pier mouth).
  - `the towel and shade sit near the spawn, clear of keep-outs`: export `BEACH_SPOTS` (frozen) with `towel {x:12.5,z:39.5,yaw}`, `umbrella {x:11.2,z:40.6}`, `castles [{x:9.5,z:28},{x:13.8,z:4.5}]`; each ≥ its r from every beachKeepOut point (excluding the spawn for the towel: ≥ 5 from spawn).
  - paint triangle count ≤ 1,100.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement.** Paint colours are linear `lin(BEACH)` × sandTint × k so marks match the sand they sit on; material MeshStandardMaterial white, vertexColors, roughness 0.92, FrontSide, polygonOffset −1/−1. Use `ribbon`/`blob` (dressing.js) then set y per zone. Contents:
  - Fresh tide line: dashed ribbon along x = 22.75 + 0.25·sin(z·0.41) + 0.12·sin(z·1.3), z −44..44, dashes 0.8–2.4m with 0.3–1.2m gaps from hash01, half-width 0.09–0.16, colour dark olive-brown 0x4f4a2a..0x6b5a32 (hash mix). Skip pier mouth.
  - Old wrack line: fainter (sand × 0.82 warm grey), thinner, at x 22.35 + wobble, sparser dashes.
  - Wind ripples: ~26 short wavy strokes on the dry front beach x 5..17, z −28..44, each 2.5–5m long running roughly north-south (perpendicular to the sea wind), half-width 0.05, colour sand × 0.9 with a sand × 1.04 highlight stroke 0.12m beside it; reject strokes passing within keep-out r.
  - Towel: 1.0 × 1.9 m rectangle at BEACH_SPOTS.towel, yaw 0.35, five stripes alternating 0xe05a4f / 0xf4efe4 / 0x3f8fc6, as quads.
  - Umbrella shade: soft blob r 1.1 at umbrella spot offset (+0.5, +0.3) (sun from the south-east-ish; check live), colour sand × 0.72, plus a ring blob r 1.4 at × 0.86 underneath for a soft edge (painted first; sorted by polygonOffset—same y; instead put the darker blob 0.0005 higher).
  - Castle moats: ring of sand × 0.8 round each castle (r 0.75..0.95 annulus, 12 segments).
- [ ] **Step 4:** run beachdress + seaside tests, waterlooks, flattrace, budget, silhouette (update silhouette seaside 66 → 67 with a note line, and its caster count unchanged) → PASS.
- [ ] **Step 5: commit** `feat(seaside): painted tide lines, wind ripples, a striped towel and umbrella shade`.

### Task 3: beachDressing — shells, starfish, pebbles, seaweed, driftwood, castles, umbrella, boardwalk edge

**Files:** Modify `src/world/beachdress.js`, Test `test/beachdress.test.js`, `test/budget.test.js` (comment block only), `test/silhouette.test.js` (count + note)

**Interfaces:** Consumes `beachKeepOut`, `BEACH_SPOTS`, `dressBeach` from Task 2. Produces mesh 'beachDressing' via `dressMesh` (dressing.js), side FrontSide for closed shapes.

- [ ] **Step 1: failing tests:**
  - `dressing is one noCast mesh`: name 'beachDressing', noCast, castShadow false, NOT tagged ground.
  - `seaside stays under its triangle ceiling with room`: budget-style count of the whole build ≤ 29,600; seaside meshes = 70 (68 + 2).
  - `anchors keep clear`: export `beachAnchors()` → `{kind, x, z, r}[]` of every raised prop (shell, starfish, pebble, kelp, driftwood, castle, bucket, umbrella); each anchor ≥ (its r + keep r) from every keep-out point, x < 24.6, and outside the deck x 18..22 (|z| ≤ 45); within bounds.
  - `heights`: dressing bbox max y ≤ 2.2 (umbrella); every vertex farther than 1.5m from the umbrella spot has y ≤ 0.65.
  - `nothing floats or sinks`: min y ≥ −0.02.
  - `boardwalk edge`: vertices exist with x ∈ [17.9, 18.05] and x ∈ [21.95, 22.1] spanning z −44..44 (edge boards); edge boards stop short of the pier mouth on the east side (no vertex with x ∈ [21.95, 22.1] and −11.5 < z < −8.5).
  - `deterministic`: two builds give byte-identical position arrays.
  - (existing) waterlooks BUILD_DRAWS seaside 860 and flat trace pass unchanged.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement**, colouring via `colorParts`, all geometry merged into one:
  - Shells (~36): along the tide line x 22.5..23.6 and scattered on the front beach (x 6..17, ~10); tiny flattened 5-segment cones (r 0.05–0.08, h 0.03), pale cream/pink/apricot 0xf3e6d6/0xeec2b4/0xf0c89a.
  - Starfish (3): flat 5-arm star, 10 triangles top + raised centre 0.025, r 0.14, coral 0xe9774f/0xf09a4a, two on the tide line, one on the front beach.
  - Pebbles (~50): squashed octahedra (r 0.04–0.11, y-scale 0.5), grey/slate/sand-brown, clustered: at the tide line in groups of 3–6, and at the cliff foot z −30..−33 x −30..10.
  - Seaweed clumps (~14) on the tide line: 3 crossed flat blades 0.25 long lying low (y ≤ 0.04), dark olive.
  - Driftwood (3): bleached grey-tan 6-sided log 1.2–2.2 m, r 0.07–0.1, one with a short branch; at (23.1, 14.5), (22.9, −25.5), (10.5, −24) if clear.
  - Sandcastles (2) at BEACH_SPOTS.castles: one big (keep 0.42 box, four 6-sided towers r 0.1 h 0.5 with cone caps, crenels optional), a smaller one (two towers); colour slightly damp sand (BEACH × 0.86, warm); a stick flag on the tallest tower (0.02 pole, 0.12 triangle red 0xe0473c / yellow 0xf2c23a). A red bucket (6-sided frustum) and blue spade beside the big castle.
  - Umbrella at BEACH_SPOTS.umbrella: pole 6-sided r 0.025 h 1.9 white, tilted 0.12 rad; canopy 8 gores alternating 0xe05a4f/0xf4efe4 as a shallow cone r 1.0 rise 0.3, with an underside (both faces built explicitly, FrontSide).
  - Boardwalk edge: kerb boards 0.08 × 0.1 (top y 0.08) along x 18.0 and x 22.0 over z −44.8..44.8 (east side broken at the pier mouth z −11.6..−8.4), colour 0x8a6a48; posts 0.16 × 0.16 × 0.42 every 7.5 m on both edges from z −41.25, skipping any post within 1.6m of a bench, lamp, box, tippable, rest or the pier mouth; bottom faces omitted.
- [ ] **Step 4:** run full suite; update test/silhouette.test.js seaside count (66 → 68) with a one-line note, and add a dated paragraph to test/budget.test.js's comment block with the before/after numbers → PASS. `npm run build` → OK.
- [ ] **Step 5: commit** `feat(seaside): shells, starfish, pebbles, seaweed, driftwood, sandcastles, umbrella and a finished boardwalk edge`.

### Task 4: Live check and tune (parent, not a subagent)

- Run `scratchpad/beach/shots.mjs after {day,sunset,phone}` on port 5261; compare with the BEFORE set; tune colours/sizes in beachdress.js only; make pairs in `snaps-polish-beach/pairs/`; record draw calls and triangles.
- Commit tuning `fix(seaside): beach tuning from the live check`.
