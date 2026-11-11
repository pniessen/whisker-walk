# Polish: the cat itself (polish-catlooks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cat look right where kids look at it: no "snowman" chest in the front sit, glasses and a wing on Hagrid that read, proud scars that show from the walk camera, a smooth Digit stalk, and a walking tail that reads from behind.

**Architecture:** All changes are in the cat's build (src/cat/*.js: geometry and vertex colours) and pose (src/cat/animator.js), plus src/scars.js only if a site constant must move. No new meshes on an undressed cat; dressed glasses stay at 3 meshes (test/fixtures/accessory-mesh-delta.json unchanged). The cat goldens are NOT regenerated per task: Tasks 1-7 leave `test/catgolden.test.js` red on purpose; Task 8 regenerates both goldens once, with a dated header line, after a key-by-key diff.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4, Playwright (headless Chromium from ~/CLAUDE-CODE/projects/chess-game) for the live check.

**Spec:** the controller's brief (survey items #6, #9, #13, #15 and polish-5's parked tail note) in `<scratchpad>/polish-survey.md` (ranked list ~line 54) and the shared rules in `.../scratchpad/polish-common.md`. Before shots: `.../scratchpad/snaps-polish-catlooks/before/` (sit-front, perch-front, lineup-perch-three, hagrid-*, scars-*, walk-rear, digit-stalk-*, home-*, walkgame-*).

## Global Constraints

- Work only in `<repo>/.worktrees/polish-catlooks` (branch `polish-catlooks`). Never push, never merge, never edit `.claude/launch.json`. Dev server (controller only) on port 5196.
- Files this build owns: `src/cat/*`, `src/scars.js`, `test/fixtures/catgolden.json`, `test/fixtures/hagrid-golden.json`. Do not edit `src/world/*`, `src/weather.js`, `src/render/water.js`, `src/nametag.js`, `src/fightcam.js`, `src/ui/fightui.js`. Tests may be added/edited anywhere under `test/`.
- Determinism: no `Math.random` in any build or walk code; no new draws on `walkRng` or the stray stream. Variation comes from sines of position or `hash01`/`mulberry32`.
- `test/fixtures/flat-trace.json` stays at sha256 `6b502ab6b1f9ce328fd6c6b7ce656fd473e50670708fac53985590bc9f0e54a7`; only Task 8 may re-record it, and only if every changed key is a contact-shadow/render size (positions and movement byte-identical).
- Gameplay unchanged: colliders, walkable ground, spawns, gate push-through (test/pushthrough.test.js) all stay green with their limits untouched.
- Caps: tabby full is 30 meshes (do not add a mesh to an undressed cat); every cat ≤ 9,000 triangles full and ≤ 5,500 simple (Digit simple is at 5,336 today: Tasks 1, 5 and 6 must keep it ≤ 5,500). Scar mesh: one mesh. Glasses: 3 meshes (accessory-mesh-delta.json `glasses: 3`, `sunglasses: 3`, `monocle: 4` unchanged).
- Goldens: during Tasks 1-7, `test/catgolden.test.js` (and only it, plus any test the task explicitly re-pins with a recorded reason) may fail. Do NOT run `UPDATE_GOLDEN`. Every other test must be green at each task's commit.
- Performance: no new shadow casters (new small parts get `castShadow = false` or ride an existing mesh); a transparent part uses `depthWrite: false`.
- Floats: any test comparing floats against a fixture uses `closeDiffs` from `test/helpers/closeto.js`. Geometry sweeps get an explicit timeout (`120_000`). Three other builds share this Mac: never weaken a test for a load timeout.
- Test command: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` (main: 222 files / 6,152 tests green) and `npm run build`. Use `npx vitest run test/<file>` while iterating.
- Commits: explicit `git add <paths>`; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Words: none of this adds kid-facing copy. Comments explain why, dated `polish-catlooks (2026-11-02)`.

## Review Focus

1. **Every coat, not just the tabby.** Chest blending must work on robbie (white bib on near-black), d2 (white band + bib), siamese (points), calico/patches, a custom look with `bib`, and the fluffy ruff cats (persian, mainecoon, d2). Task 1 sweeps every STYLE breed plus a custom look.
2. **Simple builds.** Every geometry change must hold on `{ simple: true }` (12×8 chest balls, simple ruff) and stay ≤ 5,500 triangles; Digit is the tightest. Tasks 1, 5, 6 assert simple.
3. **Dressed cats.** The flatter sit chest must not let neck items (necktie, bowtie, bandana, scarf, collar tag) sink into or float off the chest: the existing "rests on the bib/chest" tests in catmodel/catpose stay green untouched. Glasses on a cat that also wears a hat or eyepatch-less face swaps (sunglasses, monocle) keep their own meshes.
4. **Poses beyond the sit.** Forelegs moved for the sit must return exactly to standing (folds.test "back to standing is exact"); the scar's ear nick must ride the ear through `earPin` (cross, scared, arch) and nap; the tail hook must ease out when the cat stops and never appear on Hagrid.
5. **Gate clearance and the name tag.** The walking tail's highest point must not rise (pushthrough.test.js 1 cm margin; nametag CROSS_TAG_Y); Task 7 asserts the walking tail top is ≤ today's.

---

### Task 1: The chest and belly blend into the coat (no hard disc edge)

**Files:**
- Modify: `src/cat/model.js` `undersideGeometry` (~826) — the `painted` helper for belly and chest
- Modify: `src/cat/coat.js` — add the gradient helper
- Test: `test/catcoat.test.js` (append)

**Interfaces:**
- Produces: `export const UNDER_BLEND = Object.freeze({ inner: 0.35, outer: 0.85 })` in coat.js and `export function undersideColourAt(coat, bellyHex, unitFromPartCentre, unitOnTorso, out)` — returns the belly colour where the part faces straight out of the chest/belly (its "front" axis), easing (smoothstep) to `coatColourAt(coat, unitOnTorso)` at its rim. `inner`/`outer` are the cosine-distance band (0 = the part's front axis, 1 = 90° off it) over which it eases; the implementer may tune the two numbers by screenshot but must keep a soft band ≥ 0.3 wide.
- The chest's front axis is forward-and-down in the cat frame, `(0, -0.35, -1)` normalised; the belly's is straight down `(0, -1, 0)`. `unitOnTorso` is the vertex's direction from the torso centre in the torso's unit frame (divide by `TORSO.R * BS`), so the rim colour is exactly the coat painted under it (stripes, patches, Robbie's bib, D2's band).
- `coat.chest` (white on a `bib` cat) is the chest's "belly" colour; the belly ball uses `s.belly`.

- [ ] **Step 1: Write the failing tests** in `test/catcoat.test.js`:
  - `it('the chest has no hard edge: its rim takes the coat under it', …)` — for every STYLE breed (import STYLE from model.js; if not exported, use the breed list from `goldenKeys` or export STYLE): build `buildCat(breed)`, take the underside mesh (`parts.body.children.find(m => m.userData.underside)`), chest range `userData.ranges.chest`; for chest vertices whose position lies within 6 mm of the torso surface (use `torsoSurface` along the vertex's direction, scaled by the body scale), the vertex colour is within L1 0.12 of `coatColourAt(coat, unit)`; at least one chest vertex equals `coat.chest` (L1 < 0.02).
  - `it('the chest colour changes smoothly', …)` — for each chest triangle edge, the L1 colour step between its two vertices is ≤ 0.35 (today the hard edge is a full belly-to-coat step on tabby across one edge on the rim: assert the max step today is larger, so the test is red now).
  - same two for the belly range.
  - simple build: same assertions with `{ simple: true }` for `digit` and `tabby`.
- [ ] **Step 2: Run** `npx vitest run test/catcoat.test.js` — expected FAIL (new tests).
- [ ] **Step 3: Implement** `undersideColourAt` in coat.js and use it in `undersideGeometry` instead of the solid `painted` for `chest` and `belly` (keep the ruff as is: it is meant to be a bib). Keep vertex counts identical (colours only).
- [ ] **Step 4: Run** the file, then the full suite; expected: only `test/catgolden.test.js` red.
- [ ] **Step 5: Commit** `feat(cat): chest and belly ease into the coat (no snowman disc)`.

### Task 2: The sit: a flatter chest and forelegs as columns in front of it

**Files:**
- Modify: `src/cat/animator.js` — the `requestPet || perch` branch (~515) and `keepChestUnderHead` (~192)
- Modify: `src/cat/torso.js` — add `SIT` constants beside `POSE_FIT`
- Test: `test/catpose.test.js` or a new `test/catsit.test.js`

**Interfaces:**
- Produces: `export const SIT = Object.freeze({ chestDepth: 0.78, foreZ: …, foreTilt: … })` in torso.js. `chestDepth` scales the underside's depth (its own z, about the chest centre) in requestPet/perch only, so the chest stops bulging forward like a ball; every other state resets the underside's scale to exactly (1, 1, 1). `foreZ` (metres, cat frame, negative = forward) moves both front leg groups forward and `foreTilt` (rad) stands them as straight, vertical columns in the posed frame. The implementer picks `foreZ`/`foreTilt` by measurement so that the tests below pass; record the chosen numbers and why in a comment.
- `keepChestUnderHead` must stay correct with the underside scaled (position = what puts the chest centre where it would be unscaled).

- [ ] **Step 1: Write the failing tests** (`test/catsit.test.js`), for `tabby`, `persian`, `d2`, `digit`, `robbie` in both `requestPet` and `perch` (pose with `animateCat` at a fixed t, read world positions with `updateMatrixWorld(true)`):
  - `it('the sit chest is flatter: its front is at least 2 cm nearer the torso than today', …)` — today's front-most chest point (world z min of the underside's chest range) recorded from the code before the change into the test as literals per breed (compute them first on the unmodified tree; put them in the test file with a comment).
  - `it('the forelegs stand in front of the chest as straight columns', …)` — for legs[0] and legs[1]: the paw's world z is ≤ (chest front-most world z + 0.02) (i.e. at or ahead of the chest's front), the leg's axis (hip pivot to paw centre) is within 0.12 rad of vertical, and the paw's sole is on the ground (its lowest world y within ±0.006 of the standing pose's lowest paw y).
  - `it('leaving the sit restores the underside and front legs exactly', …)` — perch then follow: underside scale is exactly (1,1,1) and legs[0..1] position/rotation equal a fresh follow pose bit for bit.
  - `it('a dressed sit keeps neck items on the chest', …)` — with `{ neck: 'necktie' }` and `{ neck: 'bowtie' }` on tabby and persian in perch: the item's nearest vertex to the chest is within 1.5 cm of the chest surface (no floating, no sinking deeper than today + 5 mm). If an existing test already pins this, reference it instead and skip writing a duplicate.
- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Implement** in animator.js / torso.js. Digit and the long-leg `folds` rigs must look right too (Digit sits with `legLen` 1.35; use the fitted leg length, not a constant). Existing pinned pose fixtures (catpose-baseline.json, folds.test.js) that pin the OLD front-leg spot in the sit may be re-pinned only for requestPet/perch front legs, with a dated comment saying why.
- [ ] **Step 4: Run** the file, folds/catpose/catmodel/scarmesh, then the full suite (only catgolden red).
- [ ] **Step 5: Commit** `feat(cat): a flatter sit chest with forelegs standing in front of it`.

### Task 3: Glasses that read, sized per head (cats and Hagrid)

**Files:**
- Create: `src/cat/glasses.js`
- Modify: `src/cat/model.js` — the two `accessories.face === 'glasses' || 'sunglasses'` blocks (hen ~697, cat ~1240) call the new builder; monocle frames thicken to match
- Test: `test/glasses.test.js` (new); `test/hagrid.test.js` only if an existing glasses assertion pins the old torus

**Interfaces:**
- Produces: `export const GLASSES = Object.freeze({ cat: {...}, hen: {...} })` head specs and `export function buildGlasses(kind /* 'glasses'|'sunglasses' */, spec) -> THREE.Mesh[]` returning EXACTLY 3 meshes to `head.add`:
  1. frames: both rims + bridge (+ for the hen, short arms back to the skull are optional) merged into one geometry, `mat(frameColour)`; rim tube radius ≥ 0.009 on a cat (was 0.006), ring radius per spec;
  2. lenses: two flat discs merged, `MeshStandardMaterial`/litMaterial with `transparent: true, opacity: 0.25-0.35, depthWrite: false`, a faint blue-grey tint (`0xbfd8e8`) for glasses; sunglasses keep their dark lens (`SUNGLASSES_DARK`, opaque, as today's flattened ball shape is fine);
  3. glints: two small white flattened spots (≤ 6×4 segments each) merged, on the lens's upper-outer quarter just in front of it, unlit-looking (`MeshBasicMaterial` white or litMaterial with emissive) — never casting shadows.
  All three: `castShadow = false`.
- Spec per head: `{ eyes: [[x,y,z] right eye centre], normal: 'forward' | 'skull', skull: [ax,ay,az] (hen), ringR, tube, lift }`. Cat: eyes at `(±0.083, 0.03, -0.17)`, facing -z (today's spot), ringR 0.034. Hen: each rim centred on his eye (`(±0.09, 0.03, -0.1)`) pushed out along the skull normal there (as `henEyeGeometry` is turned in buildChicken, HEN_SKULL) by `lift`, facing along that normal, ringR = eye radius 0.022 + 0.012; the bridge arcs over the top of the beak's root between the two rims (it may be a short curved tube; it must not pass through the beak or the skull: test it).

- [ ] **Step 1: Write the failing tests** (`test/glasses.test.js`):
  - `it('glasses are three meshes on a cat and on Hagrid', …)` — mesh-count delta of `{ face: 'glasses' }` vs bare is 3 for tabby and hagrid (and 3 for sunglasses).
  - `it('the frames are thick enough to read', …)` — the frames geometry's rim tube ≥ 0.009 (read from a `userData.tube` the builder sets) and the rim ring radius = spec.ringR.
  - `it('Hagrid's rims sit over his eyes, facing out of the skull', …)` — each rim's centre is within 6 mm of the eye centre + normal·lift and the rim's axis is within 0.15 rad of that eye's skull normal; no rim vertex is inside the skull ellipsoid (HEN_SKULL) by more than 1 mm.
  - `it('the lens is a faint tint that never hides the eye', …)` — lens material `transparent`, `opacity` ≤ 0.35, `depthWrite` false (glasses); the lens disc lies in front of the eye's front-most point (for both heads).
  - `it('no part casts a shadow', …)`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `src/cat/glasses.js`, wire both builders in model.js, thicken the monocle rim to the same tube (monocle stays 4 meshes).
- [ ] **Step 4: Run** the file, `test/catmodel.test.js`, `test/hagrid.test.js`, `test/catpose.test.js` (accessory-mesh-delta), full suite (only catgolden red; hagrid golden red is expected too because `hagrid:dressed` wears glasses).
- [ ] **Step 5: Commit** `feat(cat): glasses with thick frames, a tinted lens and a glint, fitted to each head`.

### Task 4: Hagrid's wing as layered feathers

**Files:**
- Modify: `src/cat/hen.js` `henWing` (~254)
- Test: `test/hagrid.test.js` (append)

**Interfaces:**
- `henWing(s)` keeps its signature and stays inside `henBodyGeometry`'s merged body mesh (no new mesh; `userData.ranges.wingL/wingR` still name its vertex range). Shrink-wrap onto the flank (`henBodyHalfWidth`, `WING_SINK`) stays.
- New shape: a small rounded shoulder covert (keep today's shoulder ball) plus `WING_FEATHERS = 4` layered tapered feather blades, each a thin lens-shaped slab (wide near its root, tapering to a rounded point, ≤ 6 mm thick), laid overlapping like shingles from the shoulder back toward the tail, each a little longer, lower and further back than the one above, each tipped down and back. Vertex colour along each blade: `HEN.FEATHER`/`HEN.DARK` mix at the root to a darker tip (`mix(HEN.DARK, HEN.TAIL, 0.6)`) over the last ~35% of its length, with a thin lighter edge highlight on the top blade allowed. Build the blades as custom BufferGeometry (no `Math.random`).
- Triangle budget: the wing must not cost more triangles than today's per side (measure today's with `ranges` before changing); Hagrid stays ≤ 9,000 full / ≤ 5,500 simple.

- [ ] **Step 1: Write the failing tests:**
  - `it('the wing is four layered feathers with darker tips', …)` — the wing range's vertices split into ≥ 4 blades (expose `henWing`'s blade ranges as `geo.userData.ranges.wingFeathersR = [[start, count], …]` from `henBodyGeometry`); per blade, the mean luminance of its rear-most 25% of vertices (by z) is ≥ 15% darker than its front-most 25%; blades' rear tips step down and back (each tip's y lower and z greater than the one before).
  - `it('the wing lies on the flank', …)` — every wing vertex's |x| is within [halfWidth − 0.02, halfWidth + 0.03] of `henBodyHalfWidth` at its (y, z) (export it if needed).
  - `it('the wing costs no more triangles than before', …)` — literal from today's count.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `test/hagrid.test.js`, folds (Hagrid squash), full suite (catgolden + hagrid golden red only).
- [ ] **Step 5: Commit** `feat(hagrid): a wing of layered feathers with dark tips`.

### Task 5: Scars that show from the walk camera, in a healed pink

**Files:**
- Modify: `src/cat/scarmesh.js` (SCAR_COLOURS, SCAR_LAYOUT, setCatScars, fitScars)
- Modify: `src/scars.js` only if needed (no site list change: `SCAR_SITES` stays the same five; saves stay compatible)
- Test: `test/scarmesh.test.js` (edit pinned colour/width/vertex-count assertions with a dated comment; append new ones)

**Rulings (pre-made):**
- Colour: `full` becomes a paler healed pink `0xe0848f` (was 0xd04a5a), `pale` (for reddish coats) `0xf6c6cb`; `minDistance` stays 0.25 (re-check the "reads on every coat" test still passes; if a coat fails, adjust pale, not the test).
- Width: face 0.008 → 0.011, body sites 0.01 → 0.014. Lengths unchanged.
- `shoulder` moves to the top of the shoulder blade, where the walk camera (behind and ~25° above) sees it: dir about `[0.45, 1, -0.7]` (tune so the strips' centre is on the upper third of the torso and clear of the head, collar and back items' usual spot; the existing "shoulder and hind scars stay visible beside the new legs" test must stay green). `side` and `hind` rise a little (y +0.15 in dir) so the top line clears the flank's curve from behind; `back` and `face` stay.
- The face scar also gets an **ear nick** on the same side's ear: two short strokes in a shallow V (2 segments each) across the back of the ear near its outer edge, about 60% up from the ear's base, lifted 2 mm off the ear's back face, in the scar colour. It is fitted every frame to `head.matrix × ear.matrix` (the ear rolls with earPin), via a third vertex range in `userData` (`split` = end of face range, `earSplit` = end of ear-nick range; keep fitScars allocation-free). The cat's ears are `parts.earL` / `parts.earR` (cone geometry; check which one is +x).
- Caps: two scars ≤ 80 vertices / ≤ 64 triangles (R13 was 60/48), still ONE mesh, no shadow.

- [ ] **Step 1: Write the failing tests** (append to scarmesh.test.js):
  - `it('a scar shows from the walk camera', …)` — tabby and digit, each of shoulder/side/hind/back alone, posed `follow` walking (speed 1.5): place a camera 2.2 m behind and 1.0 m above the cat looking at its head (as the walk camera does), raycast from the camera to each scar strip vertex; at least 40% of scar vertices are unoccluded by the cat's other meshes (today shoulder is ~0%: verify red first).
  - `it('a face scar nicks the ear on its side, and the nick rides the ear', …)` — face scar on side 'r' and 'l': ear-nick vertices lie within 3 mm of the matching ear's back surface; after posing `cross` (earPin) the nick's vertices moved with the ear (distance to the ear surface still ≤ 3 mm).
  - `it('scars are a healed pink, a touch wider', …)` — colour and width literals above.
  - update the cap test to 80 / 64 and the "at most 60 vertices" test with a dated comment.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** scarmesh, scars, catmodel, catcustom (simple ≤ 5,500 with scars, Digit!), full suite (catgolden red only — note: scars are not in the golden unless a golden key is scarred; check).
- [ ] **Step 5: Commit** `feat(scars): healed-pink scars on top of the shoulder and an ear nick, seen from behind`.

### Task 6: Digit's stalk: smooth haunches and shoulders, a tail root that does not bulge

**Files:**
- Modify: `src/cat/limbs.js` (the folded thigh/shoulder shaping) and/or `src/cat/animator.js` stalk branch (~538); `src/cat/model.js` tail root ball only if the bulb is the root ball
- Test: `test/folds.test.js` (append)

**Interfaces / what to fix (look first, using the before shots `digit-stalk-side/three/back-*.jpg`):**
- In the stalk crouch the folded upper legs show as separate angular lumps on the flank at the shoulder and the hip. Make them read as one body: the part of each upper leg that stands out of the torso in the crouch must be no more than 1.2 cm proud of the torso surface, and its outline must blend (no crease deeper than 1 cm between the lump and the torso). Choose the means (narrower upper-leg top in the fold, the top sunk further into the torso in the fold, a torso haunch bulge that meets it): record the choice in a comment and the ledger.
- At the tail's root a rounded bulb stands above the rump line in the stalk (side view). Make the root blend into the rump: no tail-root vertex more than 1 cm above the rump's surface at that z in the stalk side profile.
- Keep folds.test's existing limits (feet on the ground, nothing out of the back, stays attached, back to standing exact) green unchanged.
- Digit simple stays ≤ 5,500 triangles.

- [ ] **Step 1: Write the failing tests:** `it('the stalk crouch has no separate lumps at shoulder and hip', …)` measuring, for Digit and tabby in `stalk` (t fixed, moving and still), the max outward distance of upper-leg vertices from the torso surface along the torso normal at their nearest torso point ≤ 0.012; `it('the tail root does not bulge above the rump in the stalk', …)`. Verify red today (log today's numbers into the ledger).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** folds, limbs, catpose, scarmesh ("scars stay out of the folded legs"), full suite.
- [ ] **Step 5: Commit** `fix(cat): Digit's stalk reads as one body; the tail root blends into the rump`.

### Task 7: A walking tail that reads from behind

**Files:**
- Modify: `src/cat/animator.js` (`TAIL_S`, the walking-carriage block at the end of the pose)
- Test: `test/catpose.test.js` or `test/cattail.test.js` (new)

**Ruling (pre-made):** from straight behind, a tail that only bends in its own vertical plane is foreshortened into a stub. A walking cat's tail reads as a **question mark**: up, with the last two links hooked over to one side. Add `TAIL_HOOK = [0, 0, 0.15, 0.55, 0.65]` (rotation.y per pivot, rad) eased in with the same weight `w` as `TAIL_S`, hooked to the cat's left for every cat (a fixed side: determinism, and it reads the same for both kids), and a little more lean of the upright part back over the rump (adjust `TAIL_S[0..1]` by up to 0.1 rad) only if the top stays under today's. The sway (`tailPivots[i].rotation.y += sin…`) still adds on top, so the hook swings gently. Not on Hagrid (no `c`), not when stopped (`w` 0), not in other states.

- [ ] **Step 1: Write the failing tests:**
  - `it('from behind, the walking tail spans a visible width and height', …)` — tabby, d2, digit walking (follow, speed 1.5) at several t: project the tail's vertices onto the plane facing a camera straight behind (x, y): the tail's x-extent ≥ 0.08 m and y-extent ≥ 0.18 m (today's x-extent is small: verify red).
  - `it('the walking tail is no taller than before', …)` — the tail's highest world y walking ≤ today's (record today's max over t ∈ {0, 0.3, … 3.0} as a literal per breed, plus 1 mm).
  - `it('stopping lets the hook go', …)` — speed 0 follow: every pivot rotation.y equals the plain sway (no hook).
  - `it('Hagrid has no hook', …)`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, pushthrough, nametag-related tests (`grep -l CROSS_TAG_Y test`), catpose, full suite.
- [ ] **Step 5: Commit** `feat(cat): the walking tail hooks over like a question mark, so it reads from behind`.

### Task 8: Regenerate the goldens once; flat-trace check; budgets

**Files:**
- Modify: `test/catgolden.test.js` (header comment: one dated line `// 2026-11-02, polish-catlooks: …` listing what changed), `test/fixtures/catgolden.json`, `test/fixtures/hagrid-golden.json`
- Maybe: `test/fixtures/flat-trace.json` (separate final commit, only under rule 1)

- [ ] **Step 1:** Save copies of both golden files to the scratchpad. Regenerate: `UPDATE_GOLDEN=1 npx vitest run test/catgolden.test.js` (for hagrid-golden.json, which is write-once, delete it first so it is rewritten).
- [ ] **Step 2:** Diff key by key (node script in the scratchpad): for every key, list which mesh lines changed. Every change must be one of: underside colours (Task 1), sit poses' underside scale / front legs (Task 2), glasses meshes (Task 3, dressed keys), Hagrid body mesh (Task 4), tail pivots in walking keys (Task 7), Digit stalk keys (Task 6), bounding boxes that follow from those. Any other change: stop and find out why.
- [ ] **Step 3:** Run the full suite. If `test/flattrace.test.js` fails, run the isolation check (re-record to a scratch copy, diff key by key); re-record only if only contact-shadow sizes changed, in a separate commit `test(flattrace): re-record for the cat's new bounding box (contact-shadow sizes only)`.
- [ ] **Step 4:** Report triangle and mesh counts before/after for tabby, d2, persian, digit (full and simple), hagrid, hagrid dressed, tabby with glasses, and a two-scar tabby.
- [ ] **Step 5: Commit** `test(golden): regenerate cat and Hagrid goldens for polish-catlooks`.
