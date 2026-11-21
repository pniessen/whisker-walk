# Lifelike People Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every Twoleg's box-and-ball figure with a jointed, lifelike person built in code (necks, faces that follow the cat, a real head-scratch touch), one draw a person, deterministic from its spot.

**Architecture:** A new folder `src/people/` builds each person as ONE rigidly skinned mesh on 20 joints (every vertex weight 1 to one joint), with a near and a far geometry swapped on that mesh, poses it with plain functions, and exposes a per-walk kit (`createPeopleKit`). Steps 1-2 build and test the module on its own, imported only by tests and `verify-people.html`, so start-up does not grow. Steps 3-6 wait for F6 (branch `f6-lazy`): the module then rides in the five place packs, and `critters.js`, `player.js`, `interactions.js`, `fairvisitors.js` and `fairshow.js` use it behind a switch.

**Tech Stack:** Plain ES modules, three.js 0.185 (`SkinnedMesh`, `Skeleton`, `Bone`), Vite 8, Vitest (`npx vitest run test/<file>`), `scripts/record-page.mjs` for headless pictures.

**Spec:** `docs/superpowers/specs/2026-11-20-lifelike-people-design.md`. Read it alongside this plan: the look, the numbers and every "my call" live there. The throwaway prototype (`prototype/people-figure.js`, commits `eb24235b`, `50ecc5ab`) shows the approved look; production code is new code in `src/people/` and Task 7 deletes the prototype.

## Global Constraints

(The spec's "Constraints", verbatim.)

- **The Math.random contract.** The real `Math.random` draws are pinned:
  building a villager takes exactly 41 (`test/critters.test.js`): one for its
  idle phase (`motionRng`, which falls back to `Math.random`), four for the
  critter's own Group's uuid, and 36 for the figure's nine uuid'd objects
  outside `withLocalUuids` (three meshes, three materials, three merged
  geometries). The area build counts elsewhere count them too.
- **The gameplay trace.** `test/fixtures/flat-trace.gameplay.json` records each
  critter Group's position and rotation (`pr(c.group)`), and must not move.
  The group never moves today; the figure inside it is placed only by
  `def.standOff`. The contact shadow decal follows the figure
  (`flat-trace.render.json`, re-recordable).
- **The look comes from the spot, never a roll.** Two co-walkers see the same
  person on the same spot.
- **The start-up script** is 896.3 of 900 kB gzip on main today. The figure
  code is about 7 kB gzip as the prototype stands (minified), more with the
  poses, LOD and look controller. The F6 build (branch `f6-lazy`, plan
  `docs/superpowers/plans/2026-11-20-f6-lazy-areas.md` there) makes each area
  a "pack" loaded before its walk (`src/world/areas.js`, `AREA_LOADERS` and
  `AREA_ENTRY_MODULES`; `src/game/areaload.js`; `startWalkWhenReady`), and
  measures start-up at about 640 kB, with a ceiling of about 100 kB per
  place's pack. F6's numbers are the baseline this build plans against.
- **The Fairground's own pins.** `test/fairgames.test.js` caps the show (people,
  balls, balloon, wisp) at 6,000 triangles (today 4,554 on the high tier) and
  the place plus the show at 75,000 (the place alone is 66,692). The 75,000
  holds; the show's own 6,000 rises to 8,000 because pairs add people (my
  call, see "The Fairground's test pins").
- **Old iPads.** The scene is draw-call bound (`test/budget.test.js`'s notes):
  draws are the scarce thing, triangles nearly free.

The spec's anti-goals bind every task too (nothing creepy, nothing that scares
a 9-year-old, no people crowding her at cat height, nothing slower on an old
iPad): read them in the spec.

### Working rules (the coordinator's brief, not the spec)

- Work in `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/people` on branch `people`. Never touch the main checkout. Never read `.env.local`. No database work. No merge, no push.
- Until Step 3, nothing in the game imports `src/people/`: only tests and `verify-people.html` do (start-up must not grow).
- No tests that read source text (rule S1, `docs/SESSION-HANDOFF.md`). Float fixtures use `closeDiffs` (CI runs on Linux).
- Implementers run targeted test files only. The controller runs the full suite (`npx vitest run`) and `npm run build`, only when `ps -ax -o command | grep -E "^node .*vitest|/vitest/vitest.mjs"` prints nothing, and never 18:30-19:30.
- Keep the game muted in any real-game run (seed `muted:true`, `--mute-audio`, never press M). Dev server: `npx vite --port 5398 --strictPort`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Pictures for the owner go to `/private/tmp/claude-501/-Users-pniessen--claude-spares-spare-gcns3j/e37e3895-a9b0-4a89-9360-a15387ffb2e4/scratchpad/people/build/<step>/`.

## Review Focus

- **She is perched above them** (on a wall or bench beside a villager) when she asks for head scratches: the hand never reaches up over the person's own shoulder height; it is held out. Test in Task 8.
- **She moves or turns in the middle of a touch:** the hand follows her head that frame or withdraws (rising first), and never passes through her head or body. Test in Task 8.
- **The quality rung drops during a walk:** the near/far switch distance follows the live rung (12 m, 7 m at LOW and below) on the next frame. Test in Task 6.
- **A co-walker's cat is near a person:** the eyes, head and touch go only to the local cat; the bump pushes only the local cat. Tests in Tasks 10 and 11.
- **A pair's child has a collider or water on both sides:** the child stands a step behind the grown-up, never inside a collider or in water. Test in Task 10.

---

## Step 1: the figure on its own (before F6). Ends in pictures.

### Task 1: The look and the body, from the spot

**Files:**
- Create: `src/people/look.js`
- Test: `test/people.look.test.js`

**Interfaces:**
- Produces:
  - `spotHash(x: number, z: number, salt: number): number` in [0, 1): the same integer hash as `critters.js`'s `twolegHash` (spot to the centimetre).
  - `spotKind(def: {x, z}): 'adult' | 'older' | 'child'`: `spotHash(x, z, 20)`; < 0.18 child, < 0.36 older, else adult.
  - `personFor(def: { x, z, kind?, sex?, height?, girth?, skin?, hairStyle?, hairColor?, top?, bottom?, shoes?, hat?, glasses? }): Look`; `Look = { kind, sex: 'm'|'f', height, girth, skin, hairStyle, hair, top: {kind, color}, bottom: {kind, color}, shoes, hat: {kind, color} | null, glasses: boolean, seed: number, dims: Dims }`. Overrides win.
  - `pairFor(def): { adult: Look, child: Look } | null`: non-null exactly when `spotKind(def) === 'child'`; both from the same spot (`kind` forced), so they share hair colour.
  - `bodyDims(look): Dims` with the spec's fractions (adult knee 0.285, hip 0.525, waist 0.615, shoulder 0.818, neck root 0.845 / 0.842 women, chin 0.872; child shoulder 0.785, neck root 0.808, chin 0.846), head radii (x 0.355 / child 0.385, y 0.5, z 0.425 / child 0.445 of head height), `neckLean: 0.23`, `neckR` (0.059 man, 0.05 woman, 0.056 child, × `H/1.75 × sqrt(girth)`), limb radii, `stoop` (1 for older).

- [ ] **Step 1: Write the failing tests**: `same spot, same person` (deep-equal Looks for one def built twice); `no Math.random` (spy `Math.random`, build 200 spots, 0 calls); `heights per kind` (200 spots: child 1.16-1.42, adult man 1.72-1.85, woman 1.60-1.73, older man 1.66-1.78, older woman 1.55-1.67); `proportions` (adult `(chinY - neckY)/H` close to 0.027, head height `H - chinY` close to 0.128 H; child head close to 0.154 H); `pairs` (`pairFor` non-null iff `spotKind === 'child'`; `pairFor({x: 14, z: 34}).adult.kind === 'adult'`; the eight street spots `(-16,12) (14,34) (4,27) (-8,-22) (18,16) (32,-10) (14,7) (-10,-8)` give pairs exactly at `(14,34) (-8,-22) (-10,-8)`, pinned).
- [ ] **Step 2: Run** `npx vitest run test/people.look.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `src/people/look.js`** with the spec's palettes and per-kind choices (the prototype's `personFor` is the reference for salts 20+ and lists).
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `People: the look and the body from the spot`.

### Task 2: Shapes and parts (body, neck, face, hair, clothes)

**Files:**
- Create: `src/people/shapes.js`, `src/people/parts.js`
- Test: `test/people.parts.test.js`

**Interfaces:**
- Consumes: `Look`, `Dims` (Task 1).
- Produces:
  - `shapes.js`: `limbGeo(len, r0, r1, opts)`, `lathe(points, segs, sx, sz)`, `ellipsoid(rx, ry, rz, ws, hs)`, `headGeo(d, ws, hs)`, `hairShell(d, style, ws, hs)`, `occiputTuck(y, z, d)`, `necklineDip(x, y, z, d)`, `neckFrame(d): { headCY, baseY, baseZ, topY, topZ, len, headCZ }`, `HAIR_STYLES`.
  - `parts.js`: `JOINTS` (frozen, in this order: `root, pelvis, chest, neck, head, eyeL, eyeR, mouth, upperArmL, forearmL, handL, upperArmR, forearmR, handR, thighL, shinL, footL, thighR, shinR, footR`), `JOINT_INDEX`, `jointRest(d): Record<JointName, [x, y, z]>` (rest places, figure frame; eyes at each eyeball's centre 0.6 of the eye depth inside the face; mouth at the smile's centre), `personParts(look, detail: 'near'|'far'): Array<{ geo: BufferGeometry, tag: string, joint: JointName }>` with tags `leg shoe seat chest collar deltoid arm sleeve shorts hand thumb neck head ear eye catchlight brow nose mouth cheek glasses hair hat flare`; every geo indexed, with `position normal uv color skinIndex skinWeight`.
- Values: the spec's "The figure", "The neck and the proportions" and "Expression" (smile 0.42 of the head's width, arc 0.8 of a half turn, line 1.4× v2's, corners up; warmer cheeks; eyes bound to `eyeL`/`eyeR`, smile to `mouth`). Segments: near `{ limb 8, ring 4, cap 2, torso 10, head [12, 8], hair [12, 8], hand [6, 4], foot [8, 5] }`, far `{ limb 4, ring 2, cap 1, torso 6, head [6, 4], hair [6, 4], hand [4, 3], foot [4, 3] }`; the hair shell's zero-area triangles are dropped (`dropDegenerate(geo)` in shapes.js) and the far build has eyes only on the face.

- [ ] **Step 1: Write the failing tests**:
  - `one joint per vertex`: every part's `skinWeight` is (1, 0, 0, 0) and its `skinIndex.x` is `JOINT_INDEX[part.joint]`; `JOINTS.length === 20`.
  - `hair never covers the eyes`: for 40 looks covering every `hairStyle` and hat, every `hair`/`hat` vertex with z in front of the eyes' plane is above the highest `eye` vertex.
  - `a visible neck`: adult man 1.80 m: the lowest `head` vertex at the front is at least 0.06 m above the highest front `chest` vertex at x = 0 (the neckline's dip); child 1.30 m at least 0.04 m.
  - `shoulders slope`: on the `chest` part, the top at |x| = 0.86 × shoulder radius is at least 0.03 m (adult) below the top at |x| = 1.35 × neckR.
  - `no leg through a flare`: for coat, skirt and dress looks, the flare's radius at hip height exceeds `hipX + thR[0] × 1.06`.
  - `triangle targets`: every combination by override of kind × sex × hairStyle × hat (null and each kind) × top kind × bottom kind, plus the juggler (`{x: 311.5, z: 77.25, kind: 'adult', sex: 'm', top: {kind: 'tshirt'}}`): near ≤ 2,800, far ≤ 600.
  - `far keeps the neck, drops the face`: the far parts include `neck` and `collar`, include `eye`, exclude `mouth brow nose catchlight ear`.
- [ ] **Step 2: Run** `npx vitest run test/people.parts.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `shapes.js` and `parts.js` (the prototype's v2 functions are the reference for every shape; the smile, cheeks and the three head joints are new). The far target is tight (the prototype's far build is 748-976): drop the deltoids, thumbs and hair extras from the far build first, then profile points. If 600 cannot be met without losing the neck, the collar or the eyes, stop and report: it gates the Fairground's pins (Task 14).
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `People: shapes and parts, with necks and the new faces`.

### Task 3: The figure and the determinism contract

**Files:**
- Create: `src/people/figure.js`
- Test: `test/people.figure.test.js`

**Interfaces:**
- Consumes: `personFor`, `pairFor` (Task 1); `personParts`, `JOINTS`, `jointRest` (Task 2); `withLocalUuids` (`src/world/localuuids.js`).
- Produces:
  - `PERSON_REAL_DRAWS = 36`.
  - `buildSpot(def, { material }): { people: Person[], pair: boolean }`: one Person, or two (adult then child) for a child spot. Everything is built inside one `withLocalUuids('person', ...)` call (bones, skeleton, its bone texture via `skeleton.computeBoneTexture()`, both geometries, the mesh); then exactly `PERSON_REAL_DRAWS` real `Math.random()` draws, once per call, pair or not.
  - `Person = { figure: Group, mesh: SkinnedMesh, look: Look, bones: Record<JointName, Bone>, skeleton: Skeleton, geometries: { near, far }, detail: 'near'|'far', inView: boolean, rest: Record<JointName, Vector3>, target: PoseBuffer, setDetail(d): void, stats: { nearTris, farTris, joints: 20 }, dispose(): void }`. Built at the FAR geometry. `mesh.boundingSphere` is fixed: centre (0, H/2, 0), radius 0.75 H. `pelvis, chest, neck, head` use Euler order `YXZ`. `dispose()` frees both geometries, the skeleton and its bone texture (not the shared material).
- [ ] **Step 1: Write the failing tests**: `takes exactly 36 real draws` (counting `Math.random` spy around `buildSpot` for a single spot and for a pair spot: 36 both); `no draw at first render` (after build, `skeleton.boneTexture` is not null); `built far, swaps near` (`mesh.geometry === geometries.far`, `detail === 'far'`; `setDetail('near')` makes `mesh.geometry === geometries.near`); `bounding sphere fixed` (after posing a wave, `mesh.boundingSphere` is unchanged); `same spot, same vertices` (two builds of one spot give identical `position` arrays for both details); `dispose frees` (spies on both geometries' and the bone texture's `dispose` called once).
- [ ] **Step 2: Run** `npx vitest run test/people.figure.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `figure.js`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `People: the skinned figure, near and far, and the Math.random contract`.

### Task 4: Poses (stand, walk, wave, dismay, kneel, bow, juggle) and grounding

**Files:**
- Create: `src/people/pose.js`
- Test: `test/people.pose.test.js`

**Interfaces:**
- Consumes: `Person` (Task 3).
- Produces:
  - `pose(person, spec: { mode: 'stand'|'walk'|'wave'|'dismay'|'kneel'|'bow'|'juggle', t: number, walked?: number, reducedMotion?: boolean }): void` writes the mode's joint rotations into `person.target`.
  - `applyPose(person, dt: number, ease = 0.3): void` eases the bones toward `person.target` (a change of mode blends over `ease` seconds; the right arm, when the head scratch had set it, blends from where the bones are, over long enough that the palm's own way stays within 1.2 m/s: final review, finding 1), then grounds: the hips are lowered until the lower sole or kneecap is at y = 0.
  - `strideFor(person, walked: number): number` (one cycle = two steps of 0.8 × hip height).
  - Values from the spec's "Movement" (weight shift period about 12.6 s for adults, stride amplitudes 0.4 / older 0.3 / child 0.46, the wave, the kneel with the hand at most 0.55 m in front of the person's middle, the bow with chest lean at most 0.5 rad, dismay: both hands up, palms out, chest back 0.1 rad). Reduced motion: no weight shift, no breathing, no wave swing.
- [ ] **Step 1: Write the failing tests**: `feet on the ground` (every mode at 20 times: the lowest sole or kneecap within 0.002 m of y = 0); `no skating` (walk: the planted foot's world z moves less than 0.02 m while it is the lower foot, walked advancing 0.01 m a frame); `a real wave` (the right hand above the head's top, the forearm within 0.35 rad of vertical); `kneel stays home` (pelvis x/z within 0.05 m of rest; right hand at most 0.55 m in front); `older people bow, never kneel` (`mode: 'kneel'` on an older look gives a bow: the right knee above 0.3 m); `eases` (switching wave to stand, the right upper arm's angle after 0.15 s is between the two poses); `reduced motion stills` (stand at t = 0 and t = 5 gives the same pelvis); `allocates nothing` (spy on `Vector3.prototype.clone`, `Matrix4.prototype.clone`, `Quaternion.prototype.clone`: 0 calls over 100 frames of every mode).
- [ ] **Step 2: Run** `npx vitest run test/people.pose.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `pose.js` (scratch vectors at module level).
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `People: poses, the walk and grounding`.

### Task 5: Expression: eyes that follow her, the head turn, glances, blinks, the smile

**Files:**
- Create: `src/people/gaze.js`
- Test: `test/people.gaze.test.js`

**Interfaces:**
- Consumes: `Person` (Task 3); runs after `applyPose` (Task 4).
- Produces:
  - `GAZE = { NEAR: 4, FAR: 5, EYE_LEAD: 0.15, EYE_MAX: 0.3, HEAD_IN: 0.6, HEAD_OUT: 0.8, LOOK_MAX: 75° in rad, BEHIND: 110° in rad, GLANCE_AFTER: 4, GLANCE_FOR: 1.2, GLANCE_YAW: 0.25, BLINK_MIN: 2.5, BLINK_MAX: 5.5, BLINK_TIME: 0.12, SMILE_X: 1.15, SMILE_Y: 1.1, SMILE_TIME: 0.4 }` (frozen).
  - `createGaze(look): GazeState`.
  - `stepGaze(person, gaze, dt, t, { target: Vector3 | null, reducedMotion?: boolean }): void`: `target` is her head's world position or null; near within `NEAR`, released beyond `FAR`; eyes lead, then head (45%), neck (37%), chest (18%) add their turn on top of the pose; glance away after `GLANCE_AFTER` s of looking (side from the spot hash), blink on every gaze shift; the mouth widens while near.
  - `blinkAt(seed: number, t: number): number` in [0, 1] (1 = shut), pure.
- [ ] **Step 1: Write the failing tests**: `blinks from the spot and the clock` (`blinkAt` is pure; over 60 s each gap between blinks is 2.5-5.5 s; two seeds differ; no `Math.random`); `eyes lead` (a target appearing 2 m ahead-left: after 0.15 s the eye joints have turned at least 80% of their way, the head under 40%); `turns are never fast` (the head joint's yaw never changes faster than 75° per 0.5 s); `near and far` (target at 4.5 m approaching from 6 m: no turn; reaching 3.9 m: turn starts; leaving to 4.6 m: still looking; beyond 5.1 m: easing back); `glances away` (looking 4 s, then for 1.2 s the head yaw moves at least 0.2 rad off the target, then back); `not behind` (a target 120° round: no turn); `reduced motion` (no glance; blinks remain); `smile widens near` (mouth joint scale x reaches 1.15 within 0.5 s of near, back to 1 after far); `local cat only`: the API takes one target; the test documents it.
- [ ] **Step 2: Run** `npx vitest run test/people.gaze.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `gaze.js`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `People: eyes that follow her, glances, blinks and a bigger smile`.

### Task 6: The kit: shared material, near/far switch, view culling, disposal

**Files:**
- Create: `src/people/index.js`
- Test: `test/people.kit.test.js`

**Interfaces:**
- Consumes: Tasks 1-5; `LOW_RUNG` (`src/render/quality.js`).
- Produces (the module's public face; later steps import only this file):
  - Re-exports `personFor`, `pairFor`, `spotKind`, `pose`, `applyPose`, `strideFor`, `createGaze`, `stepGaze`, `GAZE`.
  - `LOD = { NEAR: 12, NEAR_LOW: 7, HYSTERESIS: 1 }`; `lodNearFor(rung: number): number` (7 when `rung >= LOW_RUNG`).
  - `createPeopleKit({ camera, reducedMotion = false, lodNear = () => LOD.NEAR }): Kit`; `Kit = { material, people: Person[], buildSpot(def): { people: Person[], pair: boolean }, update(): void, dispose(): void }`. One `MeshStandardMaterial` (vertex colours, roughness 0.86, smooth) made inside `withLocalUuids('people-kit', ...)`. `update()` sets each person's `detail` (to far beyond `lodNear() + HYSTERESIS`, to near inside `lodNear() - HYSTERESIS`) and `inView` (its fixed sphere against the camera frustum); callers pose only `inView` people. `dispose()` disposes every person and the material.
- [ ] **Step 1: Write the failing tests**: `switch with hysteresis` (a person moved from 20 m to 0 m and back in 0.25 m steps: near at ≤ 11, far at ≥ 13, unchanged between); `live rung` (with `lodNear` returning 12 then 7 mid-run, a person at 9 m turns far on the next `update`); `out of view` (behind the camera: `inView` false); `kit material drawn locally` (building a kit takes no real `Math.random` beyond each spot's 36); `dispose` (every person's `dispose` and the material's called once); `update allocates nothing` (the clone spies of Task 4, 100 updates).
- [ ] **Step 2: Run** `npx vitest run test/people.kit.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `index.js`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `People: the kit, the near/far switch and view culling`.

### Task 7: The picture sheet on the real module; Step 1 pictures

**Files:**
- Modify: `verify-people.html` (import `/src/people/index.js` instead of the prototype; keep every shot; draw pairs with `buildSpot`; pose through `pose` + `applyPose` + `stepGaze`; add `window.__tour(name)` / `window.__frame()` for `record-page.mjs --tour`)
- Delete: `prototype/people-figure.js` (and the `prototype/` folder)

**Interfaces:**
- Consumes: Task 6's kit.

- [ ] **Step 1: Rewrite the page** with the shots of today's sheet plus `faces-near-day` (faces straight on, she at 2 m so they look at her and smile), `blink-day` (a frame mid-blink), `glance-day` (a frame in a glance away), and tours `gaze` (she walks past a lineup at 3 m: eyes lead, heads follow, glance, blink, ease back; 8 s) and `walk` (a man, a woman and a pair walking past; 6 s).
- [ ] **Step 2: Check** in the browser pane: the page loads with no console errors (`read_console_messages` onlyErrors empty).
- [ ] **Step 3: Render** with `node scripts/record-page.mjs` into `.../scratchpad/people/build/step1/`: shots `lineup-day,lineup-cateye-day,faces-front-day,faces-near-day,blink-day,glance-day,stride-day,wave-cateye-day,crouch-cateye-day,lineup-sunset,neck-side-day,neck-far-day,far-day,lod-close,crowd-spots` and tours `gaze`, `walk`.
- [ ] **Step 4: Look at every picture** (Read each PNG). Faces friendly, never staring; necks visible; feet on the ground; no part through another. Fix in the owning task's file and re-render if not.
- [ ] **Step 5: Commit** `People: the picture sheet draws the real module; the prototype goes`.

## Step 2: the head scratch touch (before F6). Ends in pictures.

### Task 8: The reach: kneel, hold out, touch her head, never through her

**Files:**
- Create: `src/people/reach.js`
- Modify: `src/people/index.js` (re-export), `verify-people.html` (scratch shots and tour)
- Test: `test/people.reach.test.js`

**Interfaces:**
- Consumes: `Person`, `pose`/`applyPose` (Tasks 3-4); `buildCat`, `catDims` (`src/cat/model.js`) in tests.
- Produces:
  - `REACH = { LEAN_MAX: 0.5, APPROACH: 0.7, ABOVE: 0.12, CLEAR: 0.01, STROKE: 0.02, STROKE_HZ: 1.5, WITHDRAW: 0.4, HELD_MAX: 0.55, HOLD_R: 2.5, MIN_TIME: 2.5, STAND_DELAY: 0.6 }`.
  - `headTopOffset(cat: Group): number`: the cat's head part's top above its origin (from its geometry's box), for the walk to add to the head's world position.
  - `catVolumes(cat: Group, out?): { head: Sphere, body: { a: Vector3, b: Vector3, r: number } }` (world space, for tests and the clearance guard).
  - `createScratch(): ScratchState`; `stepScratch(person, sc, dt, { headTop: Vector3 | null, volumes?: object }): 'held' | 'reaching' | 'resting' | 'withdrawing'`. It runs after `applyPose` with the person in `kneel` (or `bow`): a two-joint solve for the right arm (shoulder, elbow) puts the palm, facing down, `CLEAR` above `headTop` when the solve reaches with the chest leaning at most `LEAN_MAX`; the hand travels by way of the point `ABOVE` over her head; resting, it follows `headTop` each frame with the stroke; out of reach or with `headTop` higher than the person's own shoulder, the hand is held out (at most `HELD_MAX` in front, low, palm down); losing reach, it withdraws, rising first. Its first frame takes the hand where the pose has it, and the hand turns to palm down over 0.4 s while it is carried out (no jump at the hand-off; no way in starts before that, nor while the shoulder still moves: final review, finding 1).
- [ ] **Step 1: Write the failing tests**:
  - `never through her` (for each preset cat shape from `buildCat` (tabby, siamese, persian, mainecoon, hagrid) at a grid of positions 0.4-1.2 m in front of an adult and an older person, every 0.1 m, and headings every 45°: step 3 s at 1/60 s; every sample along the right upper arm, forearm and hand (every 0.02 m) stays at least 0.005 m outside `catVolumes`).
  - `touches when in reach` (cat at 0.65 m facing the person: within 1 s the state is 'resting' and the palm is within 0.02 m of `headTop + CLEAR` up).
  - `follows her head` (move `headTop` 0.03 m a frame for 10 frames while resting: palm stays within 0.02 m of it).
  - `holds out of reach` (cat at 1.5 m: 'held', hand ≤ 0.55 m in front, below 0.6 m).
  - `perched above` (headTop 1.3 m up at 0.7 m: 'held').
  - `she turns or leaves mid-touch` (rotate her 90° in one frame, or move her head 0.5 m away: never a sample inside her volumes; state 'withdrawing' then 'held').
- [ ] **Step 2: Run** `npx vitest run test/people.reach.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `reach.js`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Add to the page and render** into `.../people/build/step2/`: shots `scratch-touch-day` (a man kneeling, hand on a tabby's head, at the normal camera), `scratch-touch-cateye`, `scratch-held-day` (she at 1.5 m, hand held out), `scratch-older-day` (an older person's bow and reach); tour `scratch` (she walks up from 2 m, is touched, turns away: 6 s). Look at each.
- [ ] **Step 6: Commit** `People: the head scratch touch`.

## Step 3: the town (WAITS FOR F6). Ends in pictures.

Before Task 9: F6 is merged to main; rebase `people` onto main; run `npx vitest run test/people.*.test.js`.

### Task 9: The switch and the packs

**Files:**
- Create: `src/peopleflag.js`; Test: `test/peopleflag.test.js`
- Modify: `src/world/areas.js` (the `neighborhood`, `park`, `docks`, `seaside` loaders become `Promise.all([world, import('../people/index.js')])` giving `life: { createPeopleKit }`; `fair` adds `createPeopleKit` to its `life`; `AREA_ENTRY_MODULES` of those five add `'src/people/index.js'`), `src/game/walk.js` (pass `people: peopleOn() ? pack.life.createPeopleKit : null` to `createCritters` and `createFairShow`)
- Test: F6's `test/areas.test.js` and `test/lazybuild.test.js` (extend: those five packs expose `life.createPeopleKit`; `src/people/` is not in the start-up graph)

**Interfaces:**
- Produces: `peopleOn(): boolean` (`?people=1` on, else off; read at call time), `setPeople(value: boolean | null): void` (as `src/roofsflag.js`).
- [ ] Steps: failing tests, run (FAIL), implement, run (PASS), `npm run build` (start-up not larger than before the task), commit `People: the switch, and the figure in the five place packs`.

### Task 10: Villagers in town: the figure, pairs, poses, gaze

**Files:**
- Modify: `src/critters.js` (`createCritters` opts gain `people` (a `createPeopleKit`), `camera`, `reducedMotion`, `lodNear`; a villager builds with `kit.buildSpot(def)` when given; a pair's child is a second figure in the same group, 0.65 m to the adult's side, the side clear of `area.colliders` and waters by 0.18 + 0.1 m (else 0.6 m behind); `update(dt, t, playerPos, catPos, cat = null)` (`cat`: the local cat's object, a new last argument; `src/main.js` and `test/helpers/flattrace.js` pass `session.cat` / `cat`) poses `inView` villagers by the spec's priority (scratch kneel, dismay, wave, stand) with gaze on the local cat: the gaze target is her HEAD's world position (`cat.userData.parts.head` world position, into one reused Vector3; the same source as Task 12's `headTop`), not `catPos` (her feet); she is the target within `GAZE.NEAR`; with no `cat`, no gaze target; `dismayNear` also sets `c.dismayT = 1.5`; new `scratchHello(c)`; new `dispose()`; the figure is in its rest pose when the walk registers it with the contact shadows, so the decal's size is the same on every device), `src/game/walk.js` (the quest marker at `look.height + 0.35` on the adult; walk end calls `critters.dispose()`)
- Test: `test/critters.people.test.js`; keep `test/critters.test.js`'s 41-draw tests and add switch-on copies (41 for a single and for a pair spot)

**Interfaces:**
- Consumes: Task 9's kit factory; Tasks 4-6, 8.
- Produces: `critters.scratchHello(c)`, `critters.dispose()`, villager `c.people: Person[]` (adult first), `c.figure` (the adult's figure, so `villagerPos` is unchanged).
- Per frame, nothing allocated (final review): one options object per critters instance is reused for every `stepGaze` call (`gazeOpts.target = ...; gazeOpts.reducedMotion = ...`), and in Task 12 one for every `stepScratch` call (`scratchOpts.headTop`, `scratchOpts.volumes`); no object literal per frame. `pose()` takes `walked` in metres directly (it finds the stride itself; callers need no `strideFor`).
- [ ] Tests: `41 draws, switch on`; `the group never moves` (100 frames of every pose: group position and rotation unchanged); `a pair's child beside, clear` (both sides of a test spot blocked by colliders: the child is behind, outside every collider and water); `quest giver is the adult`; `gaze goes to the local cat only` (a remote cat closer than hers: the head turns to hers); `gaze at her head` (a tall cat sitting up close: the head's nod is toward her head, not her feet); `dismay pose` (after `dismayNear`, the dismay pose, and `meowWaveT` still 1.5). Then run the flat trace (`npx vitest run test/flattrace.test.js`) with the switch off: unchanged.
- [ ] Commit `People: villagers in town, with pairs and gaze`.

### Task 11: The soft bumps

**Files:**
- Modify: `src/player.js` (`update(dt, colliders, bounds, waters, bumps = NO_BUMPS)`: after the collider push, the same push for each bump, same perched exemption), `src/critters.js` (`bumps`: a persistent array of `{ x, z, r }`, adult 0.22, child 0.18, built once), `src/main.js` (pass `session.critters.bumps`), `test/helpers/flattrace.js` (pass `critters.bumps` to `player.update`; a run with `setPeople(true)` and the kit passed)
- Test: `test/bumps.test.js`; `test/flattrace.test.js` (both runs held to the frozen gameplay fixture; never re-recorded)

- [ ] Tests: `slides round` (a cat driven straight at a villager ends at least 0.57 m from its middle and past it); `perched exempt`; `remote cats not pushed` (only the local player takes bumps); `placements clear` (every gold mouse, find spot, yarn spot, quest target, poi and the spawn in the four street places is at least 0.57 + 0.1 m from every person, pairs' children included); flat trace unchanged with bumps on.
- [ ] Commit `People: the cat slides round a soft bump on each person`.

### Task 12: The head scratch in the walk; Step 3 pictures

**Files:**
- Modify: `src/game/interactions.js` (the 'scratch' branch also calls `s.critters.scratchHello(s.prompt.data)`), `src/critters.js` (`update(dt, t, playerPos, catPos, cat)`, the local cat from Task 10, feeds `stepScratch` both her head's top, `parts.head` world position + `headTopOffset(cat)` up, and her volumes, `catVolumes(cat, vol)` with one `vol` per critters instance filled in place, so the scratch's "never through her" guard holds in the walk; without `volumes` it does not; a fresh `createScratch()` each time a villager kneels for the scratch), `verify-people.html` (`scene=neighborhood|park|docks|seaside`: the place built, critters with the kit, a scripted cat)
- Test: `test/critters.people.test.js` (scratch: kneel lasts while she is within 2.5 m and at least 2.5 s; stands 0.6 s after she leaves; touches when she walks up; `stepScratch` is given her volumes: with her standing where the held hand would be, the arm keeps clear of her)
- Her head's box and ears are measured once per head object (reach.js `HEAD_BOX`, `OFF_EARS`, `EAR_CAP`, WeakMaps keyed by the part). If anything is added to her head mid-walk (a found hat or other wearable, see the found-outfits work), either the cat is rebuilt (a new head object: measured afresh) or the build clears that head's entries; confirm which before wiring, and test that a hat put on mid-walk is kept clear of.

- **Running the scratch (ruling R18, final review):** `stepScratch` runs on every frame the villager kneels for a scratch and stops only on the frame the pose mode changes; each kneel gets a fresh `createScratch()` (a reused state starts from a stale palm; stopping mid-kneel snaps the arm about 0.11 m).
- [ ] Render into `.../people/build/step3/`: each street place from the normal camera with a villager waving and from her eye height; a pair; a woman in a skirt or a dress kneeling for the scratch and walking (the skirt over the kneel and the stride); tours `slide` (she walks into a villager and slides round) and `scratch-town`. Look at each.
- [ ] Commit `People: the head scratch in town; Step 3 pictures`.

## Step 4: the Fairground (WAITS FOR F6). Ends in pictures.

### Task 13: Pairs in the visitors' simulation

**Files:**
- Modify: `src/fairvisitors.js` (a visitor whose `look` spot is a child spot is a pair: radius 0.65, `KEEP` to the nearer member, `childX`/`childZ` stepped beside (way ≥ 1.6 m clear) or a step behind; `bumps` array updated in place each step)
- Test: `test/fairgames.test.js` (extend every visitor rule to the child: never within `KEEP` of her middle, only on free ground, never in a swept ride)

- [ ] Commit `People: pairs at the Fairground walk together`.

### Task 14: The Fairground drawn with the kit; Step 4 pictures

**Files:**
- Modify: `src/fairshow.js` (people from the kit; poses from `walked`: `pose()` takes the metres walked directly (`spec.walked`) and finds the stride itself, so the show needs no `strideFor`; the kneel hello holds the hand out; the juggler dressed by hand at 1.76 m, hands following the nearest ball; gaze only when stopped; the visitors' bumps to `player.update` through walk.js), `test/fairgames.test.js` (show cap 6,000 → 8,000; place + show ≤ 75,000 unchanged; re-pin `MEASURED` and mesh counts)
- [ ] Render into `.../people/build/step4/`: `fair-day`, `fair-dusk`, `fair-close`, a kneel from her eye height, the juggler; tour `fair-walk` (6 s of the midway). Look at each.
- [ ] Commit `People: the Fairground's visitors and juggler; Step 4 pictures`.

## Step 5: performance and the switch on (WAITS FOR F6). Ends in pictures.

### Task 15: Measure, then default on

- [ ] Measure each place's worst spot in a real walk with `?people=1` and without (adaptive quality readings), and the LOW rung's 7 m switch. Pass: draws at every worst spot no more than today's; triangles no more than today's + 15,000; the owner's iPhone holds 60 fps on HIGH at the Fairground's worst spot (he reads it); the Fairground pins hold.
- [ ] `peopleOn()` defaults on; `?people=0` turns it off. Before/after pictures of every place into `.../people/build/step5/`.
- [ ] Commit `People: on by default`.

## Step 6: retire today's figure (after the owner has played; WAITS FOR F6 and his word)

### Task 16: Remove the old Twoleg

- [ ] Remove `buildTwolegFigure`, `twolegLook`, `twolegHead`, `twolegHash` and `src/peopleflag.js`; rewrite the tests that read them (`test/critters.test.js` three-mesh, arm, height, standOff `children[2]`, spawn-look and hair tests) for the new figure; the 41-draw tests stay. Full suite, build. Commit `People: today's figure retires`.
