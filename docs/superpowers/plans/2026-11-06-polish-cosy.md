# polish-cosy (Pass 6, build 6-6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The den reads as a cosy cat den (wallpaper, dado rail, beams, a warm hanging lamp, a door with a cat flap, a rag rug), and the Pines' Warrior-Cats landmarks (truce stones, Lightning Stump, Frog Stones) stop looking like grey drums; the Black Mire is peaty, not black glass.

**Architecture:** Den dressing is a new module `src/world/dencosy.js` building four merged meshes, called once from `den.js build()`; nothing in the room's layout, colliders, perches, DEN_SPOTS or the shop changes. The Pines landmarks keep their exact Three object construction sequence (so the Math.random uuid draw pin stays 11580): each `new THREE.CylinderGeometry(...)` becomes a `new THREE.BufferGeometry()` filled from pure typed-array builders in a new `src/world/pineslandmarks.js`, and the materials gain `vertexColors: true`. The mire is a colour + glare change in `WATER_LOOK`.

**Tech Stack:** Three 0.185, Vitest 4, Vite 8.

**Spec:** scratchpad `polish-survey-6.md`, "Pass 6 → 6-6 polish-cosy" and ranked rows #5 and #6; `polish-common.md` hard rules.

## Global Constraints

- Determinism: no Math.random anywhere in build code; jitter uses `hash01` / `mulberry32(seedFromCode(...))` from `src/rng.js` (check which hash helper builder.js already imports and reuse it).
- `test/waterlooks.test.js` BUILD_DRAWS pines **11580** must not move. Den is not pinned there.
- Flat trace stays sha256 `af07901717f1b39482a7befce20f1a80dc09c7e31866ab11bb7459e61d97b83a` (`test/flattrace.test.js`).
- Colliders, perches, `DEN_SPOTS`, `DEN_FIXTURES`, `FIXED_PERCHES`, `TRUCE_STONES`, `PILLAR`, `CHAIN_*`, shop: unchanged values.
- Triangles: den ≤ +8,000 (from 13,582); Pines ≤ +2,000 (from 55,036). Caps: den 40k, Pines 70k.
- Draw calls nearly flat: den adds ≤ 4 meshes and ≤ 1 shadow caster; Pines adds 0 meshes.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; `npm run build`. Long geometry tests get explicit timeouts (120_000).
- Commits: explicit `git add <paths>` (never node_modules); message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Camera inside the den dressing: the follow camera sits at y≈2.2–2.9 at the default step and up to ~5.4 pitched up, and can be anywhere in the room → beams must sit at/above the wall top (bottom y ≥ 3.2) and the lamp shade bottom ≥ 2.75 at z ≤ -5.5 (far from the spawn camera path). Test pins both.
2. The open south (camera) wall: nothing new above 0.5 m inside DEN_CAMERA_WEDGE (|x| ≤ 3, z ≥ 4.5), and no beam at z > 2.5. Test pins it.
3. A placed furniture rug at an anchor z-fighting the rag rug → rag rug top y below 0.02 and centre ≥ 1.8 m from every DEN_SPOT. Test pins it.
4. A cat perched on the Lightning Stump / Frog Stones standing on a jagged top → the top within r ≤ 0.4 of centre is flat at PILLAR.y (±0.03), splinters only beyond r 0.5. Test pins it.
5. A cat walking round a landmark stopping short of / clipping into it → every vertex below y 0.3 lies within collider r (+0.02), and no vertex anywhere beyond r + 0.08. Test pins it.

---

### Task 1: The den's cosy shell

**Files:**
- Create: `src/world/dencosy.js`
- Modify: `src/world/den.js` (one call in `build()` after `wallDecor(scene)`; import)
- Modify: `test/silhouette.test.js` (den expected 284 → new count, with a one-line comment like the others)
- Test: `test/dencosy.test.js`

**Interfaces:**
- Produces: `export function cosyShell({ wallX = 9, wallZ = 9, wallH = 3.2, winHalf = 2.2, sillY = 1.0, winTop = 2.6 } = {}): THREE.Group` — group named `denCosy` holding exactly four meshes named `denWallpaper`, `denWoodwork`, `denRagRug`, `denLampGlow`. Also `export const DEN_DOOR = Object.freeze({ x: -7.3, w: 0.95, h: 2.1 })`, `export const RAG_RUG = Object.freeze({ x: -7.3, z: -7.55, rx: 0.75, rz: 0.48 })`, `export const BEAM_Z = Object.freeze([-6, -2, 2])`, `export const LAMP = Object.freeze({ x: 0, z: -6, shadeBottom: 2.78 })`.

Design (values fixed, shapes the implementer's call):
- **denWallpaper** (vertexColors, `userData.noCast = true`, receives shadow): thin quads 4 mm in front of the inner faces of the west (x = -8.9), east (x = 8.9) and north (z = -8.9) walls, skipping the window opening (|x| < winHalf + 0.15 between sillY and winTop) and the door span. Below the dado (0.08–0.95): a warm sage wainscot `0xa9b28a`. Between dado and picture rail (0.95–2.25): cream `0xe6d6bc` with soft vertical stripes 0.12 wide every 0.36 m in `0xd9c6a6`, and a small sprig (a 4-vertex diamond, ~0.06, `0x9aa77a` leaf / `0xc98a7a` bud alternating by hash) centred between stripes on 3 staggered rows. Above 2.35: plain, nothing.
- **denWoodwork** (vertexColors, casts): dado rail (0.05 tall × 0.05 deep at y 0.95, same three walls, broken at window/door); three beams E–W at z = BEAM_Z, 0.2 wide × 0.22 deep, bottom at wallH, spanning x -9..9, warm oak `0x8a6038` with darker ends; the door on the north wall at x DEN_DOOR.x (front face at z -8.76, painted sage-green `0x6f8a6a`, two recessed panels shaded darker, a brass knob `0xc9a24a`, architrave `0xf0e4d0` 0.08 wide round it) with a cat flap at its foot (0.32 × 0.3 frame `0x4a4a4a`, flap `0x7a8a7a`, bottom at 0.1); a curtain pelmet over the existing rail (box 4.4+1.4 wide × 0.22 tall at y winTop+0.38, z -8.65, `0x8a5a3a`); the lamp's cord (thin box from the middle beam's top at z LAMP.z… use the beam at z -6) and a cone shade (8 sides, top r 0.12, bottom r 0.32, height 0.3, `0xe8b86a`) whose bottom is LAMP.shadeBottom.
- **denRagRug** (vertexColors, noCast): oval of 6 concentric braided rings (alternating `0xb85a4e`, `0xe0c48a`, `0x5a7a8a`, `0x8a6a9a`, `0xd8a070`, `0x6a8a5a`), 28 segments, flat at y 0.012, centred at RAG_RUG.
- **denLampGlow** (`MeshBasicMaterial` warm `0xffd890`, noCast): a small 8-segment sphere bulb r 0.09 just inside the shade, plus nothing else. Tag `userData.fadeOccluder` is NOT needed (lamp is out of the camera path by position).
- One material per mesh (four materials). Built with plain `new THREE.*`; den is not in BUILD_DRAWS.

- [ ] **Step 1: Write the failing tests** in `test/dencosy.test.js`:
  - `cosyShell()` group has exactly 4 meshes with the 4 names; wallpaper, rug and glow have `userData.noCast === true`.
  - total triangles of the group ≤ 8000 and ≥ 1500.
  - every woodwork vertex with z > 2.5 (world) that is above y 0.5 has |x| > 3 (camera wedge; check over all four meshes, after `updateMatrixWorld`).
  - every beam/woodwork vertex with y > 2.9 is either ≥ 3.2 (beams) or belongs to the lamp/pelmet region (|z + 6| < 0.5 or z < -8.3) — i.e. nothing hangs into the camera band elsewhere.
  - rag rug: max y < 0.02; RAG_RUG centre ≥ 1.8 from every `DEN_SPOTS` entry.
  - `build(new THREE.Scene())` from `src/world/den.js` still returns identical `colliders`, `perches`, `spawn`, `bounds`, `tippables` to the current values (compare to a JSON snapshot taken from main inline in the test: build once, `JSON.stringify` the five fields, compare to the literal you record BEFORE changing den.js).
  - two `cosyShell()` builds produce byte-identical position arrays.
- [ ] **Step 2: Run** `npx vitest run test/dencosy.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement `cosyShell`** in `src/world/dencosy.js`; build each mesh's geometry as one indexed BufferGeometry of quads/boxes written straight into arrays (or merge with `mergeGeometries` from three/addons — fine here). Call `scene.add(cosyShell())` in `den.js build()` right after `wallDecor(scene)`.
- [ ] **Step 4: Run** `npx vitest run test/dencosy.test.js test/den.test.js test/denlive.test.js test/denfurniture.test.js test/dencats-den.test.js test/budget.test.js test/silhouette.test.js test/mergeprops.test.js` → update silhouette den count (284 → 288) with a comment `// Den 284 -> 288: polish-cosy's shell (wallpaper, woodwork, rag rug, lamp glow).`; all PASS. budget den stays under 340/220/40000 and merged 185/110.
- [ ] **Step 5: Commit** `git add src/world/dencosy.js src/world/den.js test/dencosy.test.js test/silhouette.test.js` — `feat(den): cosy shell — wallpaper, dado, beams, lamp, door with cat flap, rag rug`.

### Task 2: Pines landmarks and the peaty mire

**Files:**
- Create: `src/world/pineslandmarks.js`
- Modify: `src/world/pines.js:208-219` (MIRE_COLOR, mire WATER_LOOK entries) and `:858-889` (truce stones, pillars)
- Test: `test/pineslandmarks.test.js`

**Interfaces:**
- Produces (pure, no THREE objects constructed — only typed arrays, so the uuid draw count cannot move):
  - `standingStoneData(seedKey: string, r: number, h: number): { position: Float32Array, normal?: Float32Array, color: Float32Array, index: Uint16Array|Uint32Array }` — a 9-sided tapering, lumpy prism (3–4 height rings, vertices jittered ±12% radially by seeded hash, top domed and slightly tilted so the stone leans ≤ 6°), lichen/moss vertex colour: grey-green base `0x7a8270` darkened at the foot, moss `0x5f7a3e` on the top and north-facing (-z) side, pale lichen flecks `0xb8c09a` by hash on ~15% of vertices.
  - `lightningStumpData(r: number, h: number, rTop: number): {...same}` — charred split trunk: 10 sides, foot flare to r, bark `0x3e342c` darkening to char `0x1e1a18` toward the top; a flat standing top at y = h within radius 0.4; jagged splinters on the rim rising 0.15–0.45 above h on about half the rim (hash), one deep V-notch "split" on the east side (+x) down to h-0.6; a pale scar strip `0xd8cbb0`/`0xc0ae8a` running down the west side (-x) from the top to ~0.5 m.
  - `frogStoneData(r: number, h: number): {...same}` — a squat rounded boulder: 11-sided, 5 rings, bulging to ≤ r + 0.05 at 35% height, rounded shoulders to a flat top at y = h within radius 0.45; moss `0x5f7a3e` over the top and down the north side, stone `0x7a8270` elsewhere, darker damp foot `0x4f5546`.
  - `fillGeometry(geo: THREE.BufferGeometry, data): THREE.BufferGeometry` — sets attributes + index on an EXISTING geometry, calls `computeVertexNormals()` if no normal given; constructs nothing.
- pines.js: truce stones `new THREE.BufferGeometry()` filled from `standingStoneData('truce-' + i, r, TRUCE_STONE_RENDER_H)` with `TRUCE_STONE_RENDER_H = 1.25` (render-only; collider r unchanged), positioned with base at y 0 (`position.y = 0`; geometry spans 0..h). Pillars: `LIGHTNING_STUMP` → `lightningStumpData(PILLAR.rBottom, PILLAR.y, PILLAR.rTop)`, `FROG_STONE` → `frogStoneData(PILLAR.rBottom, PILLAR.y)`, mesh `position.y = 0`. All three materials get `vertexColors: true` and colour `0xffffff` (vertex colours carry the hue). Keep the same order and count of `new THREE.*` calls as today (Group, Material, then per stone Geometry+Mesh; per pillar Geometry+Material+Mesh).
- Mire: `MIRE_COLOR = 0x5a5432` (peaty tea brown-green); both mire WATER_LOOK entries gain `glare: 0.18, specCap: 0.22`. Bogs unchanged.

- [ ] **Step 1: Write the failing tests** in `test/pineslandmarks.test.js` (timeout 120_000 where the Pines is built):
  - each data builder is deterministic (two calls → identical arrays) and has no NaN.
  - foot rule: every vertex with y < 0.3 has hypot(x,z) ≤ r + 0.02; every vertex hypot ≤ r + 0.08.
  - perch rule for stump and frog: every vertex with hypot(x,z) ≤ 0.4 and y > h - 0.3 has |y - h| ≤ 0.03; stump has some vertex with y > h + 0.15 (splinters); frog stone max y ≤ h + 0.03.
  - standing stone: max y in [1.1, 1.35] for h 1.25, foot within r.
  - triangles: truce pair + stump + frog total ≤ 2000 more than today's (today: 2×28 + 2×28 for 7-sided cylinders ≈ 112; so total ≤ 2100).
  - built Pines (`build(new THREE.Scene())`): `truceStones` group has 2 meshes, `lightningStump`/`frogStone` exist with `material.vertexColors === true`; colliders and perches deep-equal a literal recorded from main before the change; water `mire-north` options: `WATER_LOOK` not exported, so check the built waterFx material: `scene.getObjectByName('water:mire-north').material.specularIntensity === 0.18`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/world/pineslandmarks.js` and the pines.js edits.
- [ ] **Step 4: Run** `npx vitest run test/pineslandmarks.test.js test/pines.test.js test/waterlooks.test.js test/flattrace.test.js test/budget.test.js test/goldmice.test.js test/water.test.js` → PASS. waterlooks pines must still be 11580 and the flat trace unchanged; if the flat trace moves, STOP and report (do not re-record).
- [ ] **Step 5: Commit** `git add src/world/pineslandmarks.js src/world/pines.js test/pineslandmarks.test.js` — `feat(pines): rough truce stones, a charred Lightning Stump, mossy Frog Stones, a peaty mire`.

### Task 3 (controller): verification

- [ ] Full suite + `npm run build`; `tris.mjs` before/after for den and Pines; after shots from `scratchpad/cosy/shots.mjs` (same camera spots as before), pairs into `snaps-polish-cosy/pairs/` incl. phone 390.
