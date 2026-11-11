# Body refinement (ruff, legs and feet, Hagrid): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every cat gets one smooth tapering leg per corner ending in a real foot (four scalloped toes, claw tips), legs that fold (not squash) when a cat sits, naps, stalks or is pinned, a small bib-style ruff on fluffy cats, and Hagrid gets a neck, a hen's body, folded wings, a seven-feather tail, a joined comb, two wattles and chicken feet, all at today's mesh counts and sizes, with the goldens regenerated once after the owner's screenshot sign-off.

**Architecture:**
- **A limb is a tube along a smooth curve** (`src/cat/limbs.js`): control points and a radius per point, welded rings, a rounded dome on top, vertex-coloured (leg colour, blending at the very top into the torso's painted colour there). Each leg is still exactly one limb mesh (first child) plus one paw mesh (`leg.userData.paw`, at `(0, PAW_Y, −0.012)`); toes and claws are geometry and vertex colour inside the paw mesh.
- **Folding is baked shapes written into the limb's own geometry** (R1). Each leg carries precomputed position/normal arrays for `stand`, `sit`, `tuck`, `crouch` and `ball`; `applyFold(leg, kind)` copies the arrays into the limb's one BufferGeometry and moves the paw (and any feet-item part hung after it) to the fold's foot spot, only when the fold changes. The animator picks the fold per state from one table; a fold marked `crouch` lowers the body exactly as today's leg squash did, so every body/head/tail height is unchanged.
- **Hagrid** is rebuilt in `buildChicken` from part geometries in `src/cat/hen.js`, merged into few vertex-coloured meshes at today's size, the same parts contract, his comb as two halves (`earL`/`earR`) and his neck inside the head group.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4, plain ES modules.

**Spec:** `docs/superpowers/specs/2026-11-01-body-refinement-design.md` (all of it, including "Builder-check rulings"). Look reference: `docs/superpowers/specs/2026-11-01-body-refinement-sketch.html` (open with `?show=ruff|legs|hagrid&yaw=1.6`); its shapes are the look, its triangle counts are not the budget. Builds on the fight build: `docs/superpowers/specs/2026-11-01-fight-moves-and-scars-design.md` and `docs/superpowers/plans/2026-11-01-fight-moves-and-scars.md`.

## Global Constraints

- **Order:** this lands after the fight moves and scars build. Task 1 merges `main` (which must already contain it) into this branch; nothing else starts before that.
- **Mesh counts unchanged:** `test/catmodel.test.js` CEILING / "final mesh ceilings" (exact, simple = full − 6), `test/catcustom.test.js` 31 / 25, the fight build's scarred caps (32 / 26, +1 only on a scarred cat), Hagrid ≤ 19. Each leg = one limb mesh (first child) + one paw mesh. The ruff stays inside the merged underside geometry.
- **Triangles (measured 2026-11-01 on main):** today's four legs + paws cost 1,344 in every build (front limb 48, hind limb 240, each paw 192); the ruff 144; Digit full 7,876 (124 under 8,000), Digit simple 5,192, D2 full 7,710, worst custom (stripes + fluffy/long) 7,710 full / 5,026 simple, Hagrid 1,724. **Ceilings become 9,000 full / 5,500 simple** (R4). Budgets: a limb ≤ 220 full / ≤ 180 simple, a foot ≤ 180 full / ≤ 160 simple, so a leg (limb + paw) ≤ 400 full / ≤ 340 simple; the ruff ≤ 360 full / ≤ 210 simple; Hagrid ≤ 4,500.
- **Simple builds** (strays, rivals, intruders, clan cats, ghosts, a partner's cat) may use fewer sides, never a different shape: same control points, same folds, same toes.
- **No new draw calls, no new shader programs:** limb and paw use `litMaterial(0xffffff, { vertexColors: true })` like the body; no SkinnedMesh, no morph targets.
- **No save or wire change:** SAVE_VERSION stays 4. **No rng:** nothing here draws a random number (`Math.random` or any stream).
- **Contracts kept:** limb is `leg.children[0]`; limbs still built from a length (`limbGeometry(LEGS.LEN * legLen, hind, simple)`); `leg.userData.paw` is a separate mesh at `(0, PAW_Y, −0.012)` standing; the bare paw's sole is `PAW_HALF` (0.0384) below its centre; the paw's heel (max z, leg-local) stays within 0.01 of today's 0.0747; the animator never writes a leg group's position; Hagrid's `legs[0..1]` real, `legs[2..3]` empty dummies, five `tailPivots`, `whiskers: []`, `noMerge`.
- **Goldens:** `test/fixtures/catgolden.json` and `test/fixtures/hagrid-golden.json` are regenerated **once**, in one commit, in Task 11, and **only after the owner's sign-off (Task 10)**. Until then `test/catgolden.test.js` is expected to fail on the changed keys and on Hagrid; every other test must pass at every commit. `catpose-baseline.json` and `accessory-mesh-delta.json` are never touched.
- **Test command:** `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; build: `npm run build`. "Suite green" below means: everything passes except `test/catgolden.test.js` (until Task 11).
- **Commits:** explicit `git add <paths>` (never `-A` or `.`), message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never merge to main, never push. Never delete a file you didn't create (the one exception: Task 11 deletes and rewrites `test/fixtures/hagrid-golden.json`, as the design orders); no wildcards in `rm`. Don't touch other worktrees.

## Rulings (Claude's, on what the design leaves to the builder)

Each is final for this build; "cost if wrong" is what changing it later would take.

- **R1 Fold mechanism: baked fold shapes written into the limb's one geometry.** Chosen over a SkinnedMesh with 2–3 bones (a skinned and a skinned-shadow-depth shader program per material type on the iPhone, bone matrices per leg per cat, and the paw/feet items would have to ride a bone, breaking the paw contract and the feet lift), over morph targets (a morph data texture per limb per cat, a new program variant, `Box3`/fight `catDims` reading unmorphed positions), and over swapping whole geometries (12 extra geometries per cat that the ten different dispose paths in `src/` would leak). One geometry per limb keeps every dispose path right, `Box3.setFromObject(…, true)`, `fingerprintCat` and the fight's `catDims` read the real folded positions, and the cost is a ~130-vertex array copy per leg only when a cat changes pose. Poses still snap as they do today. — cost: rewrite `applyFold`'s body; no caller changes.
- **R2 Fold shapes live in the ground frame.** A fold's control points are given as (height above ground, z from the hip) on the reference rig; the top point sits at `REF_RIG.HIP_Y − DROP` (the pose's own body drop), so the fold's top stays inside the lowered torso while the hip pivot stays put, and a long-legged Digit folds to the same visible shape as a tabby (as `fitLongLegs` already makes its body rest as low). Converted to leg-local by `y = g − hipY` for a fold marked `crouch` (the body drops by legLift with it). A fold that is not a crouch (`ball`) leaves the body at standing height, so its points ride with the hip like a standing leg: `y = g − REF_RIG.HIP_Y` (otherwise Digit's rolled legs hang 4–8 cm below its body). — cost: a table.
- **R3 Which states fold** (`FOLD_BY_STATE`): `nap` and the fight's `pinned` → `tuck` all four; `stalk` → `crouch` all four; `requestPet` and `perch` → `sit` on the hind legs (front stand); the fight's `roll` → `ball` all four. Every other state stands (the stretch keeps lengthening its legs by scale; `pinning` keeps standing legs on the other cat's back). Hagrid's legs have no folds and keep today's squash in every pose (a sitting hen hides her legs in her feathers). — cost: one table entry per state.
- **R4 The 9,000 full-build ceiling is needed.** Digit's full build has 124 triangles of headroom today and the fight build's scar mesh lands in that same headroom; the new legs at the design's ~350–400 per leg add up to +256 a cat and the ruff +216 on fluffy cats, so D2 full lands near 8,200 and Digit full near 8,150 before a scar. Simple stays 5,500 and holds (simple legs ≤ 1,360 against 1,344 today). The scene is draw-call bound (VISUAL-PASS §0) and camps use simple builds. — cost: none at the GPU's level; tests' numbers only.
- **R5 Leg segments:** a tube of `sides` × `rings` costs `2·sides·rings` triangles and its 2-ring dome `3·sides` more. Limb full 10 sides × 9 rings = 210; simple 8 sides × 9 rings = 168 (same rings, so the same shape). Foot ≤ 180 full / ≤ 160 simple including claws (fewer columns in simple, as long as the toe test still finds four toes). — cost: segment counts.
- **R6 Claws are four tiny merged slivers** (3-sided open cones, ~0.0045 × 0.018) in the paw geometry, vertex-coloured `CLAW_HEX = 0xd9d4c8` (the sketch's), so limb and paw are both vertex-coloured on the shared white material. — cost: a colour constant.
- **R7 Leg colours:** limb = today's leg colour (`s.whiteLegs ? s.belly : pointColor`), paw = today's paw colour (`s.socks ? WHITE_FUR : s.points ? s.accent : s.belly`). The only blend is the top `LEG_BLEND = 0.18` of the limb's curve (smoothstep from t 0 to 0.18), from the torso's painted colour at that leg (`coatColourAt(coat, dir)` with `dir` the torso-local direction of the point `(x_hip, hipY − 0.04, z_hip)`) to the leg colour. — cost: one constant.
- **R8 Feet items swap to today's paw shape**: `plainPawGeometry()` = today's `shapedBall(0.062, …, 1.02, 0.62, 1.42, 12, 9)` geometry (no toes, no claws, no vertex colours) with the item's material, so every boot sits exactly where it sits today. — cost: none.
- **R9 Ruff** (in the cat frame, anchored at `RUFF.AT = (0, 0.58, −0.30)`): bib sphere r 0.10 scaled (1.05, 1.05, 0.55) at AT + (0, −0.07, −0.05), colour `s.belly`; jaw fluff ×2 r 0.055 scaled (0.6, 1.0, 0.8) at AT + (±0.10, −0.02, −0.03), rolled ±0.3, colour `base → belly` 35%; five fringe cones r 0.026 length 0.07 (z scale 0.6) along the bib's lower edge as in the sketch. Nothing behind the neck. `NECK_FLUFFY` retuned so neck items rest on the bib (Task 7 test decides the numbers). — cost: constants.
- **R10 Hagrid's meshes** (≤ 15, under his 19 cap): body (body + breast colour + hackles + both wings, one vertex-coloured geometry: the animator's squash, nap and fluff then carry the wings); head group: skull+neck (first child, one mesh), beak (upper + lower, plain `0xf2a04e`, so the existing hat test still finds his head), wattles (one mesh, two lobes), comb front (`earL`), comb back (`earR`), eye L, eye R (eye + pupil merged, vertex-coloured, at today's eye spots); tail: three meshes (middle three feathers / the left pair / the right pair; seven feathers in all) all hung on `tailPivots[0]` — the pivots are nested and nap turns each by 0.55, so meshes on pivots 1 and 2 would fan apart by 1.1 and 1.65 rad; `tailPivots[1..4]` stay empty; legs: per real leg one shank mesh (feathery thigh + scaly yellow shank, first child) + one foot (`userData.paw`: three toes forward, one back, dark claws). Triangles ≤ 4,500. — cost: re-split meshes.
- **R11 Hagrid's comb** is baked upright at rest (each half's geometry counter-rolled by ∓0.22 about its pivot), its top ≤ 0.178 head-local and |z| ≤ 0.10, so the top hat's and wizard hat's brims (from 0.183) clear it and the beanie covers it, all unchanged. The animator damps his ear writes about the rest by `base.combGive = 0.25` (a twitch is a small wobble, the cross/fight ear-pin never splits the crest). — cost: one constant.
- **R12 Hagrid's re-placements:** eyes stay at `(±0.09, 0.03, −0.1)` so face items are untouched; hats untouched (R11); neck items and the collar move onto the new neck's front (Task 8 tests); `WATER_FIT.hagrid` is re-tuned only if needed so his swim sink stays within 0.03 of today's 0.380 (wade 0.235). — cost: constants.
- **R13 The live harness** is the committed `verify-catbody.html`, extended (Task 2) with the game's lighting, custom looks, clan styles, fight poses, a pin/roll pair, scars and water, so before and after shots come from the same URLs. — cost: none.
- **R14 A transitional guard** (`test/goldenscope.test.js`, Task 3) pins that, until regeneration, every golden line outside the legs, the fluffy cats' underside and Hagrid is byte-identical; Task 11 deletes it with the regeneration. — cost: none.

## Review Focus

- **A cat in boots (rainboots lift the paw, sneakers add a stripe, gold booties a cuff) sitting, napping, stalking, pinned or rolled:** the boot moves with the folded foot, sits on the ground and never floats or sinks — test in Task 5.
- **Digit (legs ×1.35, scale 0.82, legLift 0.2125) in every fold and in the fight's rear-up pitch:** nothing in the ground, no thigh through its back — test in Task 5 (fold sweep includes Digit) and Task 9 (fight placement re-run).
- **The partner's screen:** a partner's simple build folds to the same shape as the full build on the partner's own screen — test in Task 5.
- **Hagrid in states written for cats** (the fight's arch, rearUp, flinch, pinned, pinning, roll; swim; wade; shake; nap; sniff): no throw, no gap at the neck, comb not split — test in Task 8.
- **A cat disposed while folded** (strays, intruders, remote cats, thumbnails, den cats each have their own dispose loop): the limb's geometry object never changes identity through any fold, so every existing loop disposes it — test in Task 5.

---

### Task 1: Merge main (with the fight build) and record the baseline

**Files:** merge only.

- [ ] **Step 1: Check the fight build is on main.** All three must succeed: `git cat-file -e main:src/cat/scarmesh.js`, `git show main:src/cat/model.js | grep -q 'export function catDims'`, `git show main:src/cat/animator.js | grep -q "state === 'pinned'"`. **If any fails: stop and ask the coordinator** (this build must land after the fight build).
- [ ] **Step 2:** `git merge main` (this branch adds only docs; expect no conflicts). Run the suite (everything, catgolden included, must pass here) and `npm run build`. Note the file/test counts.
- [ ] **Step 3: Measure** with a scratch node script (outside the repo, importing the worktree's `src/cat/model.js`) and write the numbers into the merge commit's body: triangles and meshes for every preset full/simple, Hagrid, the worst custom look, and each preset **with two scars** (`scars: [{ site: 'face', stage: 'full', side: 'l' }, { site: 'hind', stage: 'full', side: 'r' }]`); `catDims` of tabby and Digit (`hindZ`, `pivotY`, `pinnedBackY`); `sinkTarget(hagrid, 'swim' | 'wade')`; each accessory's mesh delta on Hagrid; for tabby and Digit in every animator state, today's worst limb poke-out above the torso's top surface (the measure Task 5's `'nothing pokes out of the back'` uses).
- [ ] **Step 4: Commit** the merge: `git commit` (merge message `Merge main (fight moves and scars) into body-refine-design`, measurements in the body, the Co-Authored-By line last).

### Task 2: The live harness, and the BEFORE screenshots

**Files:**
- Modify: `verify-catbody.html`

**Interfaces:**
- Produces new URL params on `verify-catbody.html` (existing ones unchanged): `light=game` (the game's sun and fill from `src/render/rig.js` `createSun()` / `createFill(DEFAULT_GROUND_BOUNCE)`, the renderer's tone mapping, colour space and shadow settings as `src/main.js` sets them, `assignShadowCasters(scene)`, a grass-green ground that receives shadows); `look=<pattern>.<fur>.<coat>.<marks>` (a custom cat, size 1; ids from `PATTERNS`, `FURS`, `COATS`, `MARKS`); `clan=<clanId>:<i>` (cast member i of `clanCast(clanId)`, its breed and `style`, simple build); state accepts the fight states (`arch`, `rearUp`, `flinch`, `pinned`, `pinning`, `roll`) and `swim`/`wade` (a translucent water plane at `WATERLINE`, the group sunk by `sinkTarget`); `pair=pin|roll` (two tabbies staged as the fight stages them: `pin` = loser 'pinned', winner 'pinning' at the loser's spot lifted by `catDims(loser).pinnedBackY`; `roll` = both 'roll', group rolled 1.2 rad through `placeFrame`); `scars=1` (two scars, face + side, through `setCatScars`).

- [ ] **Step 1: Extend the harness** as above; open its index page and check every new link renders without a console error.
- [ ] **Step 2: Start it.** Add one entry to the **main checkout's** `<repo>/.claude/launch.json` (it carries other agents' entries and may already be modified: leave them alone, keep its formatting): `{ "name": "whisker-walk-body", "runtimeExecutable": "npx", "runtimeArgs": ["vite", "<repo>/.worktrees/body-refine-design", "--port", "5196", "--strictPort"], "port": 5196 }`. Check the port first (`lsof -nP -iTCP:5196 -sTCP:LISTEN` prints nothing; else the next free 519x). `preview_start` it.
- [ ] **Step 3: BEFORE shots.** Headless Chromium through the Playwright in `<other-project>/node_modules/playwright`, a script kept in your scratchpad (not the repo), 1280×800, `light=game`, into `<scratchpad>/snaps-body/before/`. The shot list (the same list Task 10 re-shoots): every preset, side and three-quarter, `follow`; `state=requestPet` and `state=nap` side for tabby, persian, robbie, d2, digit; `state=stalk` side tabby and digit; a custom cat (`look=stripes.fluffy.ginger.chocolate` and `look=socks.short.ginger.chocolate`) follow + nap; `simple=1` tabby (a stray); a clan cat (`clan=<first clan id>:0` and one fluffy-coated member if any); `breeds=hagrid` side, front, three-quarter, `nap`, `sniff`, and dressed with tophat + glasses + bowtie + collar; `pair=pin` and `pair=roll`; a simple intruder (`clan=…`) in `state=stalk` (the fight's crouch clue, which now folds); `acc=feet:rainboots` and `acc=feet:sneakers` tabby `follow` and `requestPet`; `state=swim` tabby and hagrid; `scars=1` tabby side; close-ups (zoom 0.5) of a front foot, the persian's ruff and Hagrid's head.
- [ ] **Step 4: In-game BEFORE pass and perf.** Serve the worktree's `index.html` from the same server; with the same Playwright and a fresh test save (Clan Edition where needed), shoot into `<scratchpad>/snaps-body/before/game/`: the player's cat walking, sitting and napping in the Neighborhood with strays near (a stray), the home territory's camp (clan cats), a custom fluffy cat, rainboots on, a swim at a lake or the Seaside, Hagrid equipped walking and swimming, and a fight (drive the intruder encounter as the fight build's live check did) at a pin and a roll. Write the script so Task 10 can re-run it unchanged. With `?perf`, record the desktop readout (draw calls, triangles, frame time) at the camp and mid-fight.
- [ ] **Step 5:** Stop the server; remove **only** the entry you added (`git -C <repo> diff .claude/launch.json` shows exactly what it showed before Step 2).
- [ ] **Step 6: Commit** `test(body): live harness gains the game's lighting, custom and clan cats, fight poses, scars and water` (`git add verify-catbody.html`).

### Task 3: The smooth limb

**Files:**
- Create: `src/cat/limbs.js`, `test/limbs.test.js`, `test/goldenscope.test.js`
- Modify: `src/cat/coat.js` (extract `coatColourAt`), `src/cat/model.js` (legs), `test/catmodel.test.js` (the plain-limb test; ceilings 9,000), `test/catcustom.test.js` (9,000), the fight build's scarred triangle caps wherever they live (8,000 → 9,000)

**Interfaces:**
- Produces (`src/cat/coat.js`): `coatColourAt(coat, unit, out = new THREE.Color()) → THREE.Color` — the per-vertex colour `paintCoat` computes for a unit direction; `paintCoat` now calls it (output byte-identical: Step 1 pins it).
- Produces (`src/cat/limbs.js`, imports `three`, `./torso.js`, `./coat.js` only):
  - `LEG_SHAPE = { front: { points, radii }, hind: { points, radii } }`, leg-local (hip at 0) for a limb of length `LEGS.LEN`, from the sketch except the ankles, which land over the paw at z −0.012: front points `[0,0.05,0.03] [0,−0.08,0] [0,−0.19,−0.015] [0,−0.30,−0.01] [0,−0.335,−0.02]`, radii `0.085 0.062 0.046 0.038 0.036`; hind points `[0,0.04,0.01] [0,−0.09,−0.025] [0,−0.20,0.05] [0,−0.27,0.062] [0,−0.335,0.02]`, radii `0.10 0.092 0.062 0.043 0.036`, except that the top point is lowered so the dome's top is ≤ hip + 0.10 (front top point y 0.015, hind 0.0; today's hind thigh reaches hip + 0.12): the top is inside the body, and a higher dome pokes out of the back in flinch, pinning and scared. A length `len` scales the y of the points below the hip by `len / LEGS.LEN` (the top point and the radii unchanged).
  - `LIMB_SEG = { full: { sides: 10, rings: 9 }, simple: { sides: 8, rings: 9 } }`, `LEG_BLEND = 0.18`.
  - `tubeGeometry(points, radii, { sides, rings }) → BufferGeometry` — Catmull-Rom curve, smoothstep radius between control points, rotation-minimising frames (no twist), rings welded around (no duplicate seam vertices), a 2-ring dome closing the top, the bottom end open; indexed; `userData.t` (Float32Array, each vertex's curve parameter 0 top … 1 bottom, dome vertices 0).
  - `limbGeometry(len, hind, simple = false) → BufferGeometry` — the stand tube for `LEG_SHAPE[hind ? 'hind' : 'front']` at `len`.
  - `paintLimb(geo, legHex, topHex) → geo` — a `color` attribute: `topHex` at t 0 blending (smoothstep) to `legHex` at t ≥ `LEG_BLEND`.
- Produces (`src/cat/model.js`): each leg's limb is `new THREE.Mesh(paintLimb(limbGeometry(LEGS.LEN, hind, opts.simple), legHex, topHex), litMaterial(0xffffff, { vertexColors: true }))`; the leg-length pass rebuilds it with `limbGeometry(LEGS.LEN * LEG_LEN, hind, opts.simple)` and repaints it. The paw is unchanged in this task.

- [ ] **Step 1: Write the failing tests** in `test/limbs.test.js`:
  - `'coatColourAt is what paintCoat paints'`: for tabby, calico, robbie, d2 and two custom looks, every torso vertex's colour equals `coatColourAt(coat, unit)` exactly.
  - `'a limb is one welded, smooth piece'`: for front/hind × full/simple: `mergeVertices(geo).attributes.position.count === geo.attributes.position.count`; one connected component; the only boundary edges form the bottom ring.
  - `'the front leg has a shoulder and the hind leg a thigh, both tapering to a slim ankle'`: the ring radius at t 0.05 is ≥ 0.08 (front) / ≥ 0.095 (hind) and at t 0.95 ≤ 0.04; the hind's widest ring is in its top third; radius never increases below the hind's widest ring by more than 0.002 (one bulge only: no "double bulge").
  - `'simple has fewer sides, never a different shape'`: same `userData.t` ring count; per ring the centre matches full within 1e-6 and the bounding boxes within 0.005.
  - `'a leg is one limb mesh and one paw mesh, and the limb is within budget'`: every preset and custom look, full and simple: `meshCount(leg) === 2`, `leg.children[0]` is the limb, `triangles(limb) ≤ 220` full / `≤ 180` simple (the whole-leg budget is Task 4's).
  - `'leg colours keep each cat's scheme'`: limb colour at t ≥ LEG_BLEND equals today's leg colour exactly (robbie and d2 `belly`, siamese `accent`, tabby `base`, a `points` custom look its accent); at t 0 equals `coatColourAt` at the leg's top direction; robbie's limb luminance > 0.8 for t ≥ LEG_BLEND (its top blends into his dark coat at the hip, as R7 intends; replaces the `material` luminance check in catmodel's Robbie test, which now reads vertex colours).
  - `'built from a length'`: Digit's limb's bottom ring centre sits at y = −0.335 × 1.35 (±0.005, leg-local) and the ring is inside the paw's box.
  - `'no randomness'`: `src/cat/limbs.js` source contains no `Math.random` and no `rng`.
  In `test/catmodel.test.js`: replace `'a hind leg is one mesh with a thick thigh; a front leg is a plain limb'` with `'a hind leg has a thick thigh, a front leg a shoulder (one limb mesh + paw each)'` (hind limb box width > 0.18, front limb width in [0.15, 0.19], `meshCount(leg) === 2`); change both `toBeLessThanOrEqual(8000)` to 9000 in catmodel and catcustom (and the fight build's scarred-variant triangle caps), with a comment naming R4. Create `test/goldenscope.test.js` (R14): for every `goldenKeys()` key, every fingerprint line whose depth path is **not** under a leg (`g.children.indexOf(leg)`) and, for fluffy cats, not the underside line, equals the golden's line; `meshes` equals the golden's. For the fluffy cats' `:dressed` keys (persian, mainecoon, d2) only `meshes` is compared, since Task 7 moves their neck items. Header comment: "Transitional: deleted with the golden regeneration (body refinement Task 11)."
- [ ] **Step 2:** Run `npx vitest run test/limbs.test.js test/catmodel.test.js test/goldenscope.test.js` — FAIL.
- [ ] **Step 3:** Implement `coatColourAt` (refactor), `limbs.js` above and the model.js wiring.
- [ ] **Step 4:** Run those plus `test/catcustom.test.js test/catpose.test.js test/animator.test.js test/catcoat.test.js test/fightactions.test.js` — PASS; suite green (catgolden fails on the leg lines only).
- [ ] **Step 5: Commit** `feat(body): each leg is one smooth tapering piece, shoulder and thigh, coloured as before` (explicit add of the files above).

### Task 4: The foot

**Files:**
- Modify: `src/cat/limbs.js`, `src/cat/model.js` (paw, feet items), `test/limbs.test.js`, `test/catmodel.test.js`

**Interfaces:**
- Produces (`src/cat/limbs.js`): `CLAW_HEX = 0xd9d4c8`; `FOOT = { R: 0.062, TOES: [−0.62, −0.21, 0.21, 0.62] }` (toe centres across the width, as in the sketch); `footGeometry(pawHex, simple = false) → BufferGeometry` — a soft oval with a flat sole and low rounded top, four toes scalloped into its front edge, four claw slivers merged at the toe tips (R6), vertex-coloured (`pawHex`, claws `CLAW_HEX`), ≤ 180 triangles, its sole exactly `PAW_HALF` below its origin, heel (max z) such that at the paw's position the heel is within 0.01 of today's 0.0747 leg-local; `plainPawGeometry() → BufferGeometry` (R8).
- Produces (`src/cat/model.js`): the bare paw is `new THREE.Mesh(footGeometry(pawColour, opts.simple), litMaterial(0xffffff, { vertexColors: true }))` at `(0, PAW_Y, −0.012)`. Every feet item first does `paw.geometry.dispose(); paw.geometry = plainPawGeometry();` then today's material and scale lines unchanged.

- [ ] **Step 1: Write the failing tests** in `test/limbs.test.js`:
  - `'four toes scalloped into the front edge'`: for full and simple feet, take the vertices in the lower 60% of the foot's height, bin x into 24 bins across its width, take each bin's front-most z; the profile has exactly 4 local forward maxima with ≥ 0.004 prominence, centred within 0.012 of `FOOT.TOES[i] × width/2`.
  - `'claws just showing at the toe tips'`: the `CLAW_HEX` vertices form 4 clusters, each within 0.015 of a toe's front-most point and protruding ≤ 0.012 beyond it.
  - `'a flat sole at PAW_HALF and the heel where it was'`: min y = −PAW_HALF (±1e-6) with ≥ 8 vertices within 0.002 of it; heel (max z) + (−0.012) within 0.01 of 0.0747; width (x) ≤ 0.13 (no clogs).
  - `'feet items get the plain paw'`: for booties, goldbooties, sneakers, rainboots, socks on tabby and Digit: the paw geometry has no `color` attribute, zero toe maxima, the item's colour, and its geometry equals `plainPawGeometry()`'s positions; the existing `'feet items hang from the paw'`, `'digit rests at ground level in every pose, dressed and bare'` and dressed `min ≥ −0.01` tests still pass.
  - `'paw colours keep each cat's scheme, no ready-made cat gains socks'`: the non-claw paw colour equals today's paw colour for every preset (digit WHITE_FUR, siamese accent, the others belly) and for the `socks`/`points` custom looks.
  - `'a smooth ankle'`: the limb's bottom ring is inside the paw's box and its radius ≥ 0.03.
  - `'a whole leg is within budget'`: every preset and custom look: `triangles(paw) ≤ 180` full / `≤ 160` simple and `triangles(leg) ≤ 400` / `≤ 340`.
  In catmodel's Robbie test, read the paw's luminance from its vertex colours (non-claw).
- [ ] **Step 2:** Run them — FAIL.
- [ ] **Step 3:** Implement. Construction is yours (a deformed sphere as in the sketch, or a custom grid) as long as the toe test holds within the budget.
- [ ] **Step 4:** Run `test/limbs.test.js test/catmodel.test.js test/catcustom.test.js test/catpose.test.js test/animator.test.js test/waterlook.test.js test/fightactions.test.js test/clanfight.test.js test/goldenscope.test.js` — PASS (the fight's `placeFrame` hind-paw ±0.03 test included: if it fails, fix the foot's heel, not the fight); suite green.
- [ ] **Step 5: Commit** `feat(body): real feet: a rounded foot with four toes and claw tips; boots keep a smooth paw` (explicit add).

### Task 5: Legs fold when a cat sits, naps, stalks, is pinned or rolls

**Files:**
- Modify: `src/cat/limbs.js`, `src/cat/model.js` (attach folds at the end of `buildCat`), `src/cat/animator.js`, `test/limbs.test.js`, `test/animator.test.js` (and any fight-branch assertion pinning the old squash/rotation tuck)
- Create: `test/folds.test.js`

**Interfaces:**
- Produces (`src/cat/limbs.js`):
  - `FOLDS` — `{ stand: { crouch: false }, sit: { crouch: true, drop: 0.02 }, tuck: { crouch: true, drop: 0.10 }, crouch: { crouch: true, drop: 0.10 }, ball: { crouch: false, drop: 0 } }`, each fold (but stand) with, per `front`/`hind`, `points` as `[g, z]` (height above ground, z from the hip; R2), `radii`, `paw: [g, z]` (paw centre) and `pawRotX`. Starting values (tune with the tests and the sign-off; keep every control point's g ≥ its radius + 0.002 and the top at `REF_RIG.HIP_Y − drop`):

    | fold | leg | points [g, z] | radii | paw [g, z], rotX |
    |---|---|---|---|---|
    | sit | hind | [0.28, 0] [0.13, −0.12] [0.05, 0.08] [0.04, −0.04] | 0.10 0.075 0.045 0.036 | [0.0415, −0.10], 0 |
    | tuck | front | [0.20, 0] [0.07, 0.06] [0.04, −0.08] | 0.085 0.05 0.036 | [0.0415, −0.13], 0 |
    | tuck | hind | [0.20, 0] [0.08, −0.10] [0.045, 0.08] [0.04, −0.02] | 0.10 0.075 0.043 0.036 | [0.0415, −0.07], 0 |
    | crouch | front | [0.20, 0] [0.14, 0.07] [0.05, −0.04] | 0.085 0.06 0.038 | [0.0415, −0.06], 0 |
    | crouch | hind | [0.20, 0] [0.12, −0.10] [0.08, 0.10] [0.04, 0.03] | 0.10 0.08 0.045 0.036 | [0.0415, −0.012], 0 |
    | ball | front | [0.30, 0] [0.21, 0.06] [0.19, −0.04] | 0.085 0.055 0.038 | [0.18, −0.07], −0.6 |
    | ball | hind | [0.30, 0] [0.22, −0.12] [0.17, 0] | 0.10 0.07 0.045 | [0.17, −0.07], 0.6 |
  - `FOLD_BY_STATE` (R3): `{ nap: ['tuck','tuck'], pinned: ['tuck','tuck'], stalk: ['crouch','crouch'], requestPet: ['stand','sit'], perch: ['stand','sit'], roll: ['ball','ball'] }` as `[front, hind]`.
  - `attachFolds(leg, { hind, simple, hipY, len }) → void` — stores `leg.userData.folds` (per kind `{ pos: Float32Array, nor: Float32Array, box: Box3, paw: Vector3, pawRotX }`, `stand` copied (`.slice()`) from the leg's current geometry, never the live arrays, the others built with the same `LIMB_SEG` as the stand limb so the vertex order matches; position/normal arrays cached module-level by `(hind, simple, hipY, kind)`), `leg.userData.rest` (the paw's and each later child's built position), sets `leg.userData.fold = 'stand'`, and sets the limb geometry's `boundingSphere` once to the union of all folds' spheres.
  - `applyFold(leg, kind) → void` — no-op when `leg.userData.folds` is missing or `leg.userData.fold === kind`; else copies `pos`/`nor` into the limb's existing position and normal arrays (`array.set`, `needsUpdate`), copies `fold.box` into the geometry's own `boundingBox` (`.copy`, never assigning a shared Box3, since `computeBoundingBox()` writes in place), places the paw at `rest[paw] + (fold.paw − stand.paw)` with `rotation.x = pawRotX`, and every later child (cuff, sneaker stripe) at the same move rotated about the paw centre; records the kind. No allocation (module scratch objects).
- Produces (`src/cat/model.js`): after the leg-length pass, `attachFolds(leg, { hind, simple: !!opts.simple, hipY, len: LEGS.LEN * LEG_LEN })` for each of the four legs. Hagrid gets none.
- Produces (`src/cat/animator.js`):
  - In `pose()`, after the base reset: `const f = FOLD_BY_STATE[state]; legs.forEach((leg, i) => applyFold(leg, f ? f[i < 2 ? 0 : 1] : 'stand'))` (one write per leg per pose change only).
  - The fold states stop squashing or swinging folded legs, **only on rigs with folds** (`legs[0].userData.folds`): nap and pinned drop `leg.scale.y = …`, stalk drops its `0.7`, requestPet/perch drop the hind `0.45` and `−0.5`, roll drops the `±ROLL.tuck` rotations. A rig without folds (Hagrid) keeps today's lines.
  - `fitLongLegs`: `crouch = legs.some((leg) => leg.scale.y < 1 || FOLDS[leg.userData.fold]?.crouch)`; a folded leg (fold ≠ stand) skips both the length re-fit and the ground cap and keeps `scale.y = 1` (a capped fold would be a squash; the ground tests below catch a bad fold table instead). Unfolded legs keep today's formulas exactly. Update the "Contract with pose()" comment: a fold marked `crouch` also lowers the body.

- [ ] **Step 1: Write the failing tests** in `test/folds.test.js` over tabby, persian, robbie, d2, digit, a custom fluffy look and a custom socks look, each full and simple, bare and in each of booties, goldbooties, sneakers, rainboots and socks:
  - `'folds, not squash'`: in nap, requestPet, perch, stalk, pinned and roll, every leg's `scale.y === 1` and the folded legs' `rotation.x === 0` (standing still, t 1.3).
  - `'the body rests exactly where it did'`: `body.position.y` `toBeCloseTo(base.bodyY − DROP[state] − (crouch ? base.legLift : 0) + (POSE_FIT[state]?.body ?? 0), 9)` with `DROP = { nap: 0.1, stalk: 0.1, pinned: 0.1 (PINNED.bodyDrop), requestPet: 0.02, perch: 0.02, roll: 0 }` and crouch false only for roll (tabby nap 0.24, requestPet 0.324, stalk 0.24 as measured on main); head position likewise unchanged; `test/catpose.test.js` stays green.
  - `'feet on the ground, nothing in it'`: every limb and paw vertex (precise `Box3`, the cat's frame) ≥ −0.01 in every animator state (cat states and the fight's), and in nap/requestPet/perch/stalk/pinned the folded paws' sole within 0.02 of the ground; walking stalk at speed 1.5, t ∈ {0.1, 0.4, …, 2.8}: min ≥ −0.01.
  - `'nothing pokes out of the back'`: in every animator state (the cat states, walking, and the fight's arch, rearUp, flinch, pinned, pinning, roll), no limb vertex with |x| ≤ the leg's hip x lies more than 0.005 above the torso's top surface at its x, z (downward ray hit on the body mesh); where today's rig already pokes more (Task 1 Step 3 records today's worst per state, e.g. pinning's hind thigh 0.156), no worse than today.
  - `'a folded leg stays attached'`: in every fold state, for every preset (Digit included), full and simple, each folded limb's top-ring centre lies inside the posed torso (bracketed by a downward and an upward ray hit).
  - `'nap folds all four under the body; sit tucks the hind legs under the haunch with the foot flat in front'`: nap — every paw's centre x/z inside the torso's posed box ±0.05; sit — hind paws' z ahead of the hip (smaller z) and `paw.rotation.x === 0`.
  - `'boots go with the foot'` (Review Focus): for every feet item, each fold's paw box and the item's hung parts keep their standing offsets from the paw (±1e-6 after un-rotating) and stay ≥ −0.01.
  - `'simple folds to the same shape'` (Review Focus): per fold, simple vs full limb boxes within 0.005.
  - `'back to standing is exact, and the geometry never changes identity'` (Review Focus): follow → nap → roll → requestPet → follow gives a fingerprint equal to a fresh build's; `limb.geometry` and its position array are the same objects throughout.
  - `'applyFold allocates nothing'`: its source body (comments stripped) has no `new `.
  - `'Hagrid keeps his squash'`: Hagrid's nap still sets `legs[0].scale.y === 0.25`; `applyFold` on his legs is a no-op.
  In `test/animator.test.js` and the fight branch's tests: update any assertion of the old roll leg rotation (`±ROLL.tuck`) or pinned leg scale (`0.3`) to the fold, with a comment naming this task.
- [ ] **Step 2:** Run `npx vitest run test/folds.test.js test/animator.test.js` — FAIL.
- [ ] **Step 3:** Implement; tune the fold table until the tests pass.
- [ ] **Step 4:** Run those plus `test/catpose.test.js test/catmodel.test.js test/fightactions.test.js test/clanfight.test.js test/waterlook.test.js test/goldenscope.test.js` — PASS (fight `catDims`: `pivotY` and `pinnedBackY` equal Task 1's numbers); suite green.
- [ ] **Step 5: Commit** `feat(body): legs fold at the joints to sit, nap, stalk, be pinned and roll, instead of squashing` (explicit add).

### Task 6: The ruff (committed with Task 7)

**Files:**
- Create: `src/cat/ruff.js`
- Modify: `src/cat/model.js` (`undersideGeometry`), `test/catmodel.test.js`

**Interfaces:**
- Produces (`src/cat/ruff.js`): `RUFF` (R9's numbers: `AT`, `BIB`, `JAW`, `FRINGE`, `JAW_MIX = 0.35`); `ruffGeometry(s, simple = false) → BufferGeometry` in the cat frame, vertex-coloured (bib and fringe `s.belly`, jaw fluff `base → belly` by `JAW_MIX`), ≤ 360 triangles full / ≤ 210 simple (fewer segments in simple, same shape); `userData.parts = { bib: [start, end], jaw: [...], fringe: [...] }` vertex ranges for the tests; every piece's `uv` deleted before merging, as `painted()` does today.
- Produces (`src/cat/model.js`): `undersideGeometry` builds `parts.ruff` from `ruffGeometry(s, opts.simple)` through its existing `toTorso` (replacing the torus); `ranges.ruff` stays.

- [ ] **Step 1: Write the failing tests** in `test/catmodel.test.js` (persian, mainecoon, d2, custom fluffy and long looks, full and simple):
  - `'a small bib, not a life preserver'`: ruff vertices (cat frame, before `g.scale`) all have z ≤ −0.24 (nothing behind the neck), x-extent ≤ 0.30, and the ruff's box volume ≤ 40% of today's torus's (`TorusGeometry(0.19, 0.075, 6, 12)` turned and placed as `undersideGeometry` does today, computed in the test); triangle budgets.
  - `'the bib is the belly colour'`: the bib's vertices are exactly `s.belly`; the jaw fluff is `lerp(base, belly, 0.35)`; five fringe points (connected components of the fringe range).
  - `'a dropping head passes over it'`: in sniff and nap, no ruff vertex that is outside the skull's ellipsoid (radius 0.21 × (1, 0.92, 0.95), the skull's frame) lies above the mouth line (head-local y above the nose's bottom) in front of the skull centre (the chin always overlaps the bib, as it overlaps today's torus).
  - `'short-haired cats have none'`: no `ranges.ruff` on tabby, robbie, digit, a short custom look.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run `test/catmodel.test.js test/catcustom.test.js test/cattorso.test.js test/goldenscope.test.js` — the neck-item tests on fluffy cats may now fail; everything else PASS.
- [ ] **Step 5: Do not commit yet.** Go straight to Task 7: its commit carries the ruff and the retune together, so no commit leaves a failing test.

### Task 7: Neck items rest on the new bib

**Files:**
- Modify: `src/cat/torso.js` (`NECK_FLUFFY`), `test/catmodel.test.js`

**Interfaces:**
- Produces: `NECK_FLUFFY = { forward, drop }` retuned (its comment says what it now rests on).

- [ ] **Step 1: Write the failing test** `'%s: %s rests on the bib, not floating in front of it'` for persian, mainecoon, d2 and a custom fluffy look × bandana, necktie, bowtie, scarf, streamerscarf, bell, heart, sparklecollar: for each item mesh in front of the ring's centre (as `onChest` skips the far half), a ray from the front along +z at the mesh's centre x/y hits the body/underside at `h`; the mesh's rear (`box.max.z`) is ≥ `h − 0.025` and its front (`box.min.z`) ≤ `h − 0.005`.
- [ ] **Step 2:** Run — FAIL (and the existing fluffy neck tests, if Task 6 broke them).
- [ ] **Step 3:** Retune `NECK_FLUFFY` until the new test and the existing `'lies on the chest, not inside it'` and `'stays under the chin, below the mouth and behind the nose'` tests pass for every CHEST_BREED plus d2.
- [ ] **Step 4:** Run `test/catmodel.test.js test/goldenscope.test.js` — PASS; suite green.
- [ ] **Step 5: Commit** Task 6's and this task's changes together: `feat(body): fluffy cats get a small white bib with a fringe instead of the ring, and neck items rest on it` (`git add src/cat/ruff.js src/cat/model.js src/cat/torso.js test/catmodel.test.js`).

### Task 8: Hagrid

**Files:**
- Create: `src/cat/hen.js`, `test/hagrid.test.js`
- Modify: `src/cat/model.js` (`buildChicken`), `src/cat/animator.js` (comb give), `src/cat/waterlook.js` (`WATER_FIT.hagrid`, only if needed)

**Interfaces:**
- Produces (`src/cat/hen.js`, imports `three` and BufferGeometryUtils only): `HEN` colours (`FEATHER = 0xb06a30` (today's, `coatColor` unchanged), `DARK = 0x9a5826`, `CREAM = 0xe8d0a8`, `HACKLE`, `TAIL = 0x2f2a22`, `SHEEN = 0x2e4a3a`, `COMB = 0xd83a3a`, `BEAK = 0xf2a04e`, `SHANK = 0xe2b14a`, `CLAW = 0x3a3128`) and geometry builders, each vertex-coloured unless noted, each in the frame its mesh hangs in: `henBodyGeometry()` (sketch's `henBody` deformation — full breast low at the front, back rising to the tail — with cream breast colour, hackle feathers over the neck join, and both folded wings: longer than tall, tapering to 3–4 feather tips at the back), `henSkullNeckGeometry()` (skull r 0.13 at the head origin + neck running down-back so its lower end sits ≥ 0.08 inside the body at rest; `userData.neckBase` = the lowest ring's centre, head-local, which `buildChicken` copies to `head.userData.neckBase`), `henBeakGeometry()` (upper hooked + lower, plain), `henWattlesGeometry()`, `henCombHalves() → [front, back]` (one joined crest with rounded points split front/back, each pre-rolled per R11), `henEyeGeometry()`, `henTailGeometries() → [middle3, leftPair, rightPair]` (all on `tailPivots[0]`) (seven long curved feathers, the middle longest, dark with a green sheen), `henShankGeometry()` (feathery thigh + scaly yellow shank: bands of darker yellow as vertex colour), `henFootGeometry()` (three toes forward, one back, dark claws; sole at the leg's ground).
- Produces (`buildChicken`): R10's meshes at today's anchors — body at y 0.42 (`base.bodyY`, `bodyScale` kept `[0.9, 0.85, 1.1]` with the geometry authored to give today's extents under it), head group at `(0, 0.78, −0.28)` with the skull+neck as `head.children[0]`, legs at `(±0.1, 0.3, 0.02)`, tail at today's pivot; accessories re-placed per R12; `parts` and `base` keys as today plus `base.combGive = 0.25`.
- Produces (`src/cat/animator.js`): in `animateCat` after `pose()`, when `base.combGive` is set: `earL.rotation.z = 0.22 + (earL.rotation.z − 0.22) · combGive` and `earR.rotation.z = −0.22 + (earR.rotation.z + 0.22) · combGive` (at rest exactly ±0.22).

- [ ] **Step 1: Write the failing tests** in `test/hagrid.test.js`:
  - `'the same size'`: standing, the whole bird's box is within x ±0.36, y [0, 1.0], z [−0.53, 0.62]; the body mesh's box (wings and hackles merged in) within 0.03 per side of today's body ∪ belly ∪ wings, `[−0.336, 0.131, −0.374, 0.336, 0.709, 0.374]`, the hackles' top ≤ 0.74; `head.position` `[0, 0.78, −0.28]`; the skull+neck mesh's top within 0.01 of today's 0.916 (world).
  - `'within his caps'`: meshes ≤ 15 bare (the 19 cap is a bare-build cap); each accessory adds exactly today's Hagrid mesh delta for that item (measured in the test against a build of today's numbers recorded in Task 1, e.g. sparklecollar +12, partycrown +11, leafcrown +9, studded +7); triangles ≤ 4,500; `buildCat('hagrid', …, { simple: true })` fingerprint equals the full build's.
  - `'the rig contract'`: `parts` has body, head, tail, five tailPivots, four legs (2 and 3 empty Groups), earL, earR, `whiskers: []`; `legs[i].children[0]` is the shank, `legs[i].userData.paw` the foot; `noMerge`.
  - `'a neck with no gap'` (Review Focus): in every state Hagrid plays (all cat states incl. sniff, nap and requestPet, swim, wade, shake at amount 1, walking and standing, t ∈ {0.3, 1.3}), the neck's lowest-ring centre (stored as `head.userData.neckBase`, head-local) is inside the posed body (bracketed by a downward and upward ray hit); the fight's six states (he never plays them: `actions: false`, `WIRE_POSE`) only must not throw.
  - `'a joined comb that stays joined'`: earL and earR are both comb-coloured; at rest their boxes overlap or touch along z (gap ≤ 0.005) and both are upright (box centre x within 0.01 of 0); in 'cross' and the fight's 'pinned' their tops stay within 0.03 of each other in x; comb top ≤ 0.178 and |z| ≤ 0.10 head-local.
  - `'wattles, a hooked beak, seven tail feathers, wings, chicken feet'`: wattles mesh has two components below the beak; beak plain `0xf2a04e` with two components; tail meshes hold seven components, the middle one longest, some vertices greenish (`g > r`); each wing longer (z) than tall (y); each foot has 3 toe tips with z < −0.05 and 1 with z > 0.03, `CLAW` vertices at each tip, sole min y in [−0.005, 0.01].
  - `'his items still fit'`: crowns (existing test) unchanged; tophat and wizard brims' lowest point ≥ comb top + 0.003; with the beanie, no comb vertex lies outside the beanie's shell; glasses/sunglasses/monocle/eyepatch keep today's positions; the collar ring encircles the neck at its height (ring centre within 0.02 of the neck axis, ring radius > neck radius + 0.01); bandana, necktie, bowtie, scarf: every vertex outside the skull+neck mesh (ray bracketing), their rear within 0.03 of its front surface.
  - `'his swim waterline barely moves'`: `sinkTarget(hagrid, 'swim')` within 0.03 of 0.380 and `'wade'` within 0.03 of 0.235.
  - `'his comb twitches a little'`: rest exactly ±0.22; for every state and t ∈ {0.3, 1.3, 2.9}, Hagrid's `earL.rotation.z − 0.22` equals 0.25 × the same value on a second Hagrid built with `base.combGive = 1` (likewise earR about −0.22).
  The existing Hagrid tests (catmodel accessory mesh tests, the crown test, waterlook's fluff and roll tests, animator's swipe/backUp no-throw) must stay green.
- [ ] **Step 2:** Run `npx vitest run test/hagrid.test.js` — FAIL.
- [ ] **Step 3:** Implement; scale the sketch's details by ~0.85 onto today's centres. Hint from the review: a neck base at head-local (0, −0.20, 0.08) leaves the body in sniff (head pitch 0.62); (0, −0.18, 0.16) stays inside.
- [ ] **Step 4:** Run `test/hagrid.test.js test/catmodel.test.js test/waterlook.test.js test/animator.test.js test/clanfight.test.js test/fight.test.js` — PASS (Hagrid still fights with today's tumble); suite green (catgolden's Hagrid keys fail, as expected).
- [ ] **Step 5: Commit** `feat(hagrid): a neck, a hen's body, folded wings, a real tail, a joined comb, wattles and chicken feet` (explicit add).

### Task 9: Scars and the fight on the new body

**Files:**
- Modify: `test/scarmesh.test.js` (the fight build's), and `src/cat/scarmesh.js` only if a test below fails

- [ ] **Step 1: Write the failing tests** in `test/scarmesh.test.js`:
  - `'shoulder and hind scars stay visible beside the new legs'`: for tabby, persian, digit and a custom look, both sides, standing: each strip's centroid lies outside every limb's tube (distance from the leg curve > the local radius + 0.005, sampled from the limb's own rings).
  - `'scars ride the new surfaces in the new poses'`: the existing "within 0.012 m of the skull / torso" check also runs in nap, requestPet, stalk, pinned and roll with folded legs.
  - `'Digit and tabby rear up on their new hind legs'` (Review Focus): each pitched 0.9 through `placeFrame` with its own `catPivot`: lowest hind-paw point within ±0.03 of the ground, every limb vertex ≥ −0.03, and nothing poking out of the back (Task 5's measure).
  - `'a scarred cat stays within caps'`: every preset and custom look with two scars: meshes = cap + 1, triangles ≤ 9,000 / 5,500.
- [ ] **Step 2:** Run `npx vitest run test/scarmesh.test.js` — if all pass, skip to Step 4.
- [ ] **Step 3:** If a scar is under a leg, move that site's body-local direction in `src/cat/scarmesh.js` the least that clears it (comment why).
- [ ] **Step 4:** Run `test/scarmesh.test.js test/fightactions.test.js test/clanfight.test.js test/fightcam.test.js test/fightcamworld.test.js test/intruders.test.js` and the suite — green.
- [ ] **Step 5: Commit** `test(body): scars stay visible and seated on the new legs and folded poses` (explicit add of what changed).

### Task 10: Live check, AFTER screenshots and the owner's sign-off — STOP HERE

**Files:** none committed unless a fix is needed (each fix: its own commit with a test, in the owning task's files).

- [ ] **Step 1:** `npm run build` — success. Re-add the Task 2 launch entry (same checks) and `preview_start` it.
- [ ] **Step 2: AFTER shots:** re-run the Task 2 script unchanged into `<scratchpad>/snaps-body/after/`; then a phone viewport (390×844, `isMobile`, `hasTouch`) pass of tabby, persian, digit and Hagrid side views. Build one side-by-side sheet per shot (before | after) as a single HTML page in the scratchpad.
- [ ] **Step 3: In the game:** re-run the Task 2 Step 4 script unchanged into `<scratchpad>/snaps-body/after/game/`. Check by eye every anti-goal: no seams, no floating parts, no cankles, toes not beads, feet not clogs, no life preserver, no "pumped up" cat, nothing through the ground or the body, boots on the feet, Hagrid's neck closed in nap and sniff.
- [ ] **Step 4: Performance:** the same `?perf` readouts as Task 2 Step 4. Draw calls within ±1% of Task 2's (strays and the camera move between runs; the mesh-count tests pin per-cat draws exactly); record the triangle change. The iPhone 18 reading on HIGH at the Seaside, a camp and a fight is the owner's (ask in Step 6).
- [ ] **Step 5:** Stop the server; remove only the launch entry (file byte-identical to before).
- [ ] **Step 6: STOP and ask the coordinator for the owner's sign-off.** Send: the before/after sheet link or paths, the in-game shots, the perf numbers, the measured triangle table (per preset full/simple, Hagrid, worst custom, scarred Digit), and the owner questions below. **Do not regenerate anything until the coordinator relays the owner's sign-off.** Changes asked for go back to the owning task (with a test where one can pin it), then Steps 1–6 again.
  - Owner questions: (1) napping front legs: sphinx (forearms forward, paws peeking out in front, as built) or a loaf (paws tucked out of sight)? (2) Is the claw tint (`0xd9d4c8`) visible enough on dark paws, or should claws be paler?

### Task 11: Regenerate the goldens, once (after sign-off only)

**Files:**
- Modify: `test/fixtures/catgolden.json`, `test/fixtures/hagrid-golden.json` (deleted and rewritten), `test/catgolden.test.js` (comment and the Hagrid test's name)
- Delete: `test/goldenscope.test.js` (created in Task 3)

- [ ] **Step 1: Confirm the sign-off** is in hand (the coordinator's message quoting the owner). If not: stop.
- [ ] **Step 2:** Rename the Hagrid test to `'%s matches its golden (write-once since the 2026-11-01 body refinement; built and animated)'` and update the file's header comment (the chicken changed once, on purpose, with the owner's sign-off; write-once again from here). The write-once code stays (`hagrid-golden.json` is written only if missing).
- [ ] **Step 3:** `rm test/fixtures/hagrid-golden.json test/goldenscope.test.js`, then `UPDATE_GOLDEN=1 npx vitest run test/catgolden.test.js` (writes both files), then `npx vitest run test/catgolden.test.js` twice — PASS both times (byte-identical builds).
- [ ] **Step 4:** Full suite and `npm run build` — everything passes, catgolden included. `git status` shows only the files above.
- [ ] **Step 5: Commit** `test(body): regenerate the cat and Hagrid goldens once, after the owner's screenshot sign-off` with `git add test/fixtures/catgolden.json test/fixtures/hagrid-golden.json test/catgolden.test.js test/goldenscope.test.js` (the last stages its deletion), naming the sign-off in the body.

---

## Self-review

- **Spec coverage:** ruff (small bib, jaw fluff, fringe, belly colour, z −0.30, nothing behind the neck, head passes over) → T6; NECK_FLUFFY retune → T7; one smooth tapering leg, shoulder, thigh with one bulge, slim ankle → T3; colour rules → T3/T4 (R7); foot with four toes, claws, smooth ankle → T4; feet items keep a smooth paw → T4 (R8); paw contract, PAW_HALF, paw z / catPivot → Global Constraints, T4, T5; fold not squash for sit/nap/stalk and the fight's tuck poses → T5; every cat (presets, Robbie, D2, Digit, custom, strays, clan cats, intruders, kittypets) → T3–T5 sweeps over presets, custom looks, simple builds; mesh counts and triangles → Global Constraints, T3, T9 (R4); Hagrid (neck in head group, body, wings, tail, comb as two pieces, wattles, beak, legs and feet, size, 19 cap, ignores simple, accessories, water fit, fight unchanged) → T8; scars on new surfaces → T9; screenshot sign-off then one regeneration with the Hagrid rename → T10, T11; live check with the requested shots → T2 (before), T10 (after); no save/wire/rng → Global Constraints and T3's randomness pin.
- **Fight build interplay:** merge first (T1, with a stop if it is not on main); the fight's `roll`/`pinned` fold (R3, T5); `catPivot`/`catDims` re-measured (T5 Step 4); `placeFrame` hind-paw test re-run (T4, T5); scarred caps raised with R4 (T3) and re-checked (T9); Hagrid fights as today (T8 Step 4).
- **Proportion:** no function bodies beyond the fold table and the cap formula, which the tests do not determine.
