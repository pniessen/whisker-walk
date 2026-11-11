# Accessories Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every wearable accessory fits the cat: hats sit ON the head, back items are shaped things that ride the back in every pose (and over a cape), hoods are hoods, neck items stay round the neck while walking.

**Architecture:** Cat-only builders move out of `src/cat/model.js` into two focused modules — `src/cat/hats.js` (head items, head-local) and `src/cat/backitems.js` (backpack, jetpack, wings, hood; body-local, hung on the torso like the cape). Each item is ONE vertex-coloured merged mesh (wings: one per side, so they can flutter). Back items and hoods hang on `parts.body`, so every pose (walk bob, stalk crouch, nap, sit) carries them for free; the sit's `ridesBody`/`sitShift` path is retired for them (balloons keep their float path). Neck items and the collar ride the neck in every pose (animator `fitNeck`). Hagrid's own accessory code (buildChicken, addPrize* with his anchors, buildCollar) is not changed.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4.

**Spec:** controller brief (owner: "Many of the hats float above the cat's ears, and the back accessories (wings, jetpack, tiny backpack) look like silly boxes"), scratchpad `polish-common.md`, `polish-survey-2.md` "Accessory notes", `pose-ledger.md` (backpack sinks into cape, jetpack tanks buried, wings through cloth; brooch sinks into Maine Coon chest in cross).

## Global Constraints

- Work only in `<repo>/.worktrees/polish-accessories`; dev server port 5221 only.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; also `npm run build`. Long geometry sweeps get explicit timeouts (120_000).
- Never touch `test/fixtures/hagrid-golden.json`; Hagrid's built meshes must stay byte-identical (hagrid golden must pass unchanged).
- `test/fixtures/catgolden.json` is regenerated ONCE, in its own commit at the end (Task 5), with `UPDATE_GOLDEN=1 npx vitest run test/catgolden.test.js` and a dated comment line added to the test's header.
- No Math.random in geometry; everything deterministic (hash-free fixed patterns are fine).
- Flat trace `test/fixtures/flat-trace.json` stays sha256 6b502ab6…54a7; Moor draw count 7944; waterlooks counts unchanged.
- Each accessory is one merged mesh per material (vertex colours, `litMaterial(0xffffff, { vertexColors: true })`); tiny parts never their own mesh. Mesh counts per accessory must be ≤ `test/fixtures/accessory-mesh-delta.json` (update the fixture DOWN to the new counts in the task that changes them).
- Float fixtures compared with `closeDiffs` (test/helpers/closeto.js).
- Commits: explicit `git add <paths>`; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Live check harness: `verify-catbody.html?breeds=…&acc=slot:id&state=…&view=…&light=game[&zoom=&at=]`. Shot script: `node <scratchpad>/acc-live/shots.mjs` with `WHICH=after ONLY=<regex>`; output in `scratchpad/snaps-polish-accessories/after/`, BEFORE shots with the same names in `before/`. Look at your shots before reporting.

## Review Focus

1. Coats + back items: a backpack/jetpack/wings over the hoodie, raincoat or sweater shell must sit on the shell, not in it (only the cape was reported, the shells have the same bug). Pinned in Task 2.
2. Narrow/small cats (Digit body [0.8,1,1], scale 0.82) and big ones (Maine Coon 1.3, D2 1.15 fluffy): items scale with fx and do not overhang/sink. Pinned in Tasks 1–2 by breed sweeps.
3. `opts.simple` builds (strays, clan cats) with accessories must still build (clan cats are simple). Pinned in every task's sweep.
4. Disposal: items hung on body must still be disposed with the cat (walk end disposes the group by traversal) — no shared geometry between cats that a dispose would break. Pinned in Task 2 (two cats built, one disposed, other's geometry still has its position attribute).
5. The dressing-room stage and thumbnails (catstage.js, sitting cats) render the new items without errors — Task 5 live check at phone size.

---

### Task 1: Hats that sit on the head (src/cat/hats.js)

**Files:**
- Create: `src/cat/hats.js`
- Modify: `src/cat/model.js` (the `accessories.head` branch ~l.1305–1340 and the cat's `addPrizeHead` call ~l.1408: the cat stops calling addPrizeHead; Hagrid's calls stay)
- Test: create `test/cathats.test.js`; update `test/catmodel.test.js` (prize-hat tests ~l.380–412) and `test/fixtures/accessory-mesh-delta.json`

**Interfaces:**
- Produces: `export const HAT_IDS = ['crown','tophat','beanie','wizard','partycrown','leafcrown','candlehat']`; `export function buildHat(id, { simple = false } = {}) -> THREE.Mesh | null` — one mesh, head-local (add straight to `head`), vertex-coloured, `userData.hat = id`. Returns null for an unknown id.

Facts the implementer needs (head-local units): skull = ellipsoid radii (0.21, 0.193, 0.1995) at the origin (SKULL in torso.js). Ears: cones r 0.075·EARS, h 0.15·EARS (0.19·EARS with tufts — Maine Coon), centred at (±0.12, 0.18 + lift, 0.01), tilted outward 0.22 rad; Digit has EARS 1.25. Eyes at y 0.03, z −0.165. Old hats floated: brims at y 0.23 over a skull top of 0.193, crowns/beads at 0.24.

Designs (all seated: the item's lowest rim within 1 cm of the skull surface all round; ears poke through brims/bands, which reads as ear holes):
- **tophat:** LatheGeometry: a brim (r≈0.12) that droops to follow the skull dome, a crown cylinder r≈0.075 h≈0.13 with a red band; set back slightly (z +0.02) and tipped 0.12 rad to one side — jaunty. Black `HAT_BLACK`, band 0xd8303c.
- **wizard:** brim like the tophat's (r≈0.14, `WIZARD_COLOR`), cone h≈0.26 whose upper third bends back (lathe then bend vertices by height), gold star(s) on the cone (flattened, merged), gold band.
- **beanie:** a knit cap hugging the skull: an ellipsoid shell cap (skull radii ×1.06) covering from the crown down to y≈0.09 at the front and y≈0.02 at the back, a ribbed cuff ring (torus-ish band with alternating light/dark rib colours) round the rim, a white pompom on top. Rust `BEANIE_COLOR`, cuff darker.
- **crown** (Flower Crown): a green twisted vine band round the head ON the skull (ring following the skull ellipse at y≈0.12 front … 0.15 back, ~5 mm out), with 7 flowers spaced round it (each 5 flattened petals round a yellow centre, pink/yellow/white per flower, facing out and up). The band must be visible from the side and from the 3/4 view.
- **partycrown:** a continuous gold crown band (one surface: bottom edge on the skull ring at y≈0.14, top edge zig-zagging up into 5 points, ~0.08 tall), slightly flared outward, double-sided via both windings, with a jewel (alternating 0x4ec9d4 / `PRIZE_RIBBON`) on each point and on the band front.
- **leafcrown:** laurel: a brown twig band on the skull ring (like the flower crown) with 12–14 pointed leaves (`PRIZE_LEAF` colours) lying along the band in two overlapping rows, tips swept backward toward a gap at the back.
- **candlehat:** the little cake (keep the idea: it is a birthday-candle hat) seated on the crown of the skull (bottom on the dome, not floating), frosting with 5 drips down the side, candle + flame on top, and a thin elastic string from the cake down each side to under the jaw.

- [ ] **Step 1: Write the failing tests** in `test/cathats.test.js` (120_000 timeout on the sweep):
  - `it.each(HAT_IDS)('%s is one vertex-coloured mesh on the head')`: `buildCat('tabby',{head:id})` → exactly one mesh under head with `userData.hat === id`, `material.vertexColors === true`.
  - `it.each(breeds×HAT_IDS)('%s %s sits on the skull, not above it')` for breeds tabby, digit, persian, mainecoon (full and simple): in head-local space, let the hat's vertices be V; the lowest 5 % of V by y each lies within 0.012 of the skull ellipsoid (|ρ−1|·0.2 ≤ 0.012 where ρ is the ellipsoid radius `hypot(x/0.21,y/0.193,z/0.1995)`), and no hat vertex has ρ < 0.97 (nothing sunk deep into the skull) except the candle hat's strings (skip vertices with y < 0).
  - `'nothing floats: every hat starts below the ear tips'`: min y of each hat (excluding strings) < ear tip y (0.255 for tabby).
  - `'the crowns show their band from the side'`: for crown, partycrown, leafcrown: at least 30 % of the hat's vertices lie within 0.03 of the skull ellipsoid (the band hugs the head).
  - `'hats stay under the shop thumbnail top'`: max world y of `buildCat('tabby',{head:id})` ≤ the old tophat's max y (0.70+0.09+0.37·1.06 ≈ 1.18; compute from the old constant, 0.37 head-local).
  - `'Hagrid's hats are unchanged'`: rely on hagrid golden (no new test) — just run it.
- [ ] **Step 2: Run** `npx vitest run test/cathats.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement `buildHat`** per the designs; build each piece as geometry, paint vertex colours, `mergeGeometries` (three/addons BufferGeometryUtils) into one; drop `uv`/align attributes before merging. In model.js the cat's head slot becomes `const hat = buildHat(accessories.head, { simple: opts.simple }); if (hat) head.add(hat);` and the cat no longer calls `addPrizeHead`. Keep each hat ≤ 900 triangles (≤ 450 simple).
- [ ] **Step 4: Update** `test/catmodel.test.js` prize-hat tests to the new single mesh (assert the same intent: above the skull top but seated; under the tophat's top), and lower the hat ids in `accessory-mesh-delta.json` to 1.
- [ ] **Step 5: Run** the hats test, `test/catmodel.test.js`, `test/hagrid.test.js`, `test/catgolden.test.js` (expect ONLY `*:dressed` golden keys to fail — they wear the tophat; note it, do not regenerate) → others PASS.
- [ ] **Step 6: Live check:** `WHICH=after ONLY='^hat-' node shots.mjs`; compare with before/ for every hat in close-three, close-front, stalk, nap, perch. Hats must read as hats from the walk camera (walk-rear3).
- [ ] **Step 7: Commit** `feat(cat): hats sit on the head — seated brims with ear holes, crowns with a visible band, one mesh each`.

### Task 2: Back items as shaped things on the back (src/cat/backitems.js)

**Files:**
- Create: `src/cat/backitems.js`
- Modify: `src/cat/model.js` (back slot ~l.1584–1611; ridesBody tagging ~l.1636), `src/cat/animator.js` (wing flutter; rideBody no longer needed for these items — keep it for any ridesBody item, it just finds none)
- Test: create `test/catbackitems.test.js`; update `test/catmodel.test.js` (~l.606–634 "rests on the back"), `test/catsitupright.test.js` (~l.232–330 riders), `test/fixtures/accessory-mesh-delta.json`

**Interfaces:**
- Produces: `export function backAnchor(dir: [x,y,z], { bodyScale: [sx,sy,sz], cover: 'fur'|'shell'|'cape' }, lift = 0) -> { at: THREE.Vector3, n: THREE.Vector3, fwd: THREE.Vector3 }` — body-SCALED frame (multiply by 1/bodyScale to enter the body's frame): the point on the outer surface over unit direction `dir` (fur: `torsoSurface(dir)`; shell: × `shellInflate(uy)`; cape: × `shellInflate(uy)·CAPE.inflate`), its outward normal, and the forward tangent (toward the head, −z, made perpendicular to n).
- Produces: `export function placeOnBack(geo, anchor, bodyScale) -> geo` — orients geometry built in an item frame (x side, y out of the back, z toward the tail) onto the anchor and divides by bodyScale (counter-scaled, as `onCape` does in model.js).
- Produces: `export function buildBackItem(id, { bodyScale, cover, simple }) -> THREE.Mesh[]` for 'backpack' | 'jetpack' | 'wings' — meshes to `body.add`. Wings return two meshes with `userData.wing = -1|1` and `userData.hinge` (body-local hinge axis point+dir) for the flutter. Every mesh `userData.backItem = id`.
- Consumes: `CAPE` (model.js export), `torsoSurface`, `shellInflate`, `TORSO` (torso.js).

`cover` is 'cape' for cape/confetticape, 'shell' for hoodie/raincoat/sweater, else 'fur'.

Designs (item frame; sizes for a standard cat, x widths × fx):
- **backpack:** a soft rounded pack (rounded box 0.16×0.085×0.13, corner r 0.03, its underside bent to the back's curve y −= x²/0.5) centred over unit dir (0, 0.93, 0.05) (mid-back, behind the shoulder blades); a darker flap over the top front half with a yellow buckle; a small front pocket on the tail end; two grey straps that run from the pack's front corners down round the front of each shoulder (tube following the cover surface at uz −0.45, φ from 0.5 to 2.3 rad, 4 mm out). Blue 0x3a6ea5, flap 0x2d5684, buckle 0xf2c14e, straps 0x55606e. One mesh.
- **jetpack:** a rounded back plate (0.15×0.025×0.17) on the back at dir (0,0.95,0.1); two capsule tanks lying along the spine either side (x ±0.055, r 0.04, length 0.2), silver; red nose cones toward the head; at the tail end two dark nozzle bells and orange flame cones pointing back-and-down; small red fins; straps like the backpack's. Colours `JETPACK_SILVER`, 0xd8303c, 0x3a3f48, `JETPACK_FLAME`. One mesh.
- **wings (Butterfly Wings):** per side, a forewing (rounded-triangle outline ≈0.24 long) and a smaller hindwing (≈0.16) built as fan grids from the root (≥8 spokes × 4 rings so the pattern has interior vertices), cupped slightly (z += 0.15·r²) and with the hindwing behind/below the forewing (layered, 6 mm apart). Vertex-colour pattern: coral `0xf29a8a` forewing / sage `0x9fc9a0` hindwing body, dark plum 0x4a2a4a edge band (r/R > 0.82) and veins (spokes), 2–3 white spots near the forewing tip. Root at the withers (dir (±0.12, 0.97, −0.15)), the wing raised ~40° from the back and swept 25° back, so it stands clear above the back in every pose. `material.side = THREE.DoubleSide`. One mesh per side.
- **Flutter:** in `animateCat`, any body child with `userData.wing` turns about its hinge by `side·0.12·sin(t·3)` (0 when `reducedMotion`, and at rest exactly its built rotation when the sine is 0) — store the rest quaternion on first use like `restore()` does; allocate nothing per frame.

- [ ] **Step 1: Failing tests** in `test/catbackitems.test.js` (120_000):
  - `it.each(['backpack','jetpack','wings'])('%s hangs on the body')`: every `userData.backItem` mesh's parent is `parts.body`; none is a cat child; no `ridesBody` anywhere.
  - mesh counts: backpack 1, jetpack 1, wings 2.
  - `'out of the cover, touching it'` for breeds tabby, digit, persian, mainecoon, d2 × cover {none, body:cape, body:hoodie, body:sweater} × states follow, walk (speed 1.5, t 0.4/1.3), stalk, nap, perch, requestPet: after `animateCat`, cast rays from each item vertex sample (every 7th vertex) toward the body centre: the vertex is outside the fur, and when a cape/shell is worn, outside that mesh too (ray from the vertex toward the torso centre meets the cape/shell before the fur — i.e. the vertex is not inside the cloth). And the item's nearest vertex is within 0.02 of the cover surface (it rests on it — no floating cube in the stalk).
  - `'wings stand above the back'`: in follow, each wing's max world y ≥ body top + 0.12.
  - `'flutter: rest exactly at sin 0, moves otherwise, still under reducedMotion'`.
  - `'disposing one cat leaves another intact'` (Review Focus 4).
  - triangle budget: backpack ≤ 1200, jetpack ≤ 1400, wings ≤ 900 total (simple builds half or less).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** backitems.js and wire model.js: the back slot calls `buildBackItem(accessories.back, { bodyScale: BODY_SCALE, cover, simple: opts.simple })` and `body.add`s each mesh; remove the old box/cylinder code and the wing sitShift (WING_SIT can go if unused). Balloons unchanged. Add the flutter to animator.js.
- [ ] **Step 4: Update** catmodel and catsitupright tests: their intent (rests on the back; in the sit the items ride the posed torso and stay out of the fur, over a cape too) re-expressed for body-hung items; delete assertions about sitShift/rest+carry math. Lower mesh deltas (backpack 1, jetpack 1, wings 2).
- [ ] **Step 5: Run** the touched test files + hagrid + catpose → PASS (dressed goldens still expected to fail, Task 5).
- [ ] **Step 6: Live check:** `ONLY='^back-|^kit|^dressed'`; every pose; with the cape the pack/tanks/wings sit on the cloth.
- [ ] **Step 7: Commit** `feat(cat): soft backpack, twin-tank jetpack and layered butterfly wings ride the back in every pose, over a cape or coat`.

### Task 3: Hoods that lie on the neck

**Files:**
- Modify: `src/cat/backitems.js` (add the hood), `src/cat/model.js` (`hoodOrBunch` ~l.1490; `hoodItems` g-children), `src/cat/torso.js` (HOOD_BUNCH_DROP becomes unused — delete if nothing else imports it)
- Test: `test/catbackitems.test.js` (append), update `test/catmodel.test.js` (~l.583 hood test, ~l.702–720 bunch tests)

**Interfaces:**
- Produces: `export function buildHood(color, { bodyScale, simple }) -> THREE.Mesh` — body-local, `userData.hood = true`, hung on body.

Design (ruling: the hood is always DOWN, with or without a hat — a hood lying on the neck behind the head, never a ball): a soft scoop — half an ellipsoidal shell (≈0.2 wide, 0.12 deep, 0.08 tall) with a rolled rim (darker shade of the coat colour) along its opening, lying on the coat shell at the withers just behind the head (dir ≈ (0, 0.75, −0.66), on the shell surface `shellInflate`), opening facing up and forward toward the back of the head, a fold line across it; plus two drawstrings with toggles hanging at the chest for the hoodie (white), none for the raincoat. One mesh (vertex colours).

- [ ] **Step 1: Failing tests:** hood is one mesh on `parts.body` for hoodie and raincoat, with and without a hat; no SphereGeometry radius 0.17 and no torus bunch anywhere; in nap/stalk/sit/walk/cross for tabby, digit, persian, mainecoon the hood's vertices stay outside the skull+muzzle ellipsoids of the posed head (world space, 1 cm margin) — the nap's "hood through the face" case; the hood's max y ≤ head centre y in follow (it lies on the neck, it is not ears).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** replace the old hood/bunch tests with the new intent (below the mouth, behind the nose, out of the head).
- [ ] **Step 5: Run** touched tests → PASS. **Step 6: Live:** `ONLY='^hood-'`. **Step 7: Commit** `feat(cat): hoods lie on the neck behind the head in every pose`.

### Task 4: Neck items stay round the neck; cape brooch clears the chest

**Files:**
- Modify: `src/cat/animator.js` (`COLLAR_ON_NECK` / `fitNeck` ~l.60–67, 444–459), `src/cat/model.js` (CAPE_CLASP if needed)
- Test: `test/animator.test.js` (~l.496–545), `test/catmodel.test.js` neck tests (~l.662–760), `test/catcape.test.js`

**Interfaces:** none new. `fitNeck(cat, state)` carries the collar and `head.userData.neckwear` on the neck in EVERY state for a rig with an underside (Hagrid, no underside, unchanged). At rest (follow, t where breathing is 0) the carry must be the identity within 1e-9 — if `neckMove` is not exactly identity at rest, compute `_X` relative so it is (assert it).

- [ ] **Step 1: Failing tests:** for tabby, digit, persian, mainecoon × neck items (bell, sparklecollar, studded, scarf, streamerscarf, bandana, necktie, bowtie) × states follow-walk (speed 1.5, t 0.4/1.3/2.2), requestPet, perch, nap, groom, cross: the item's front-most point is behind the nose and below the mouth (reuse the existing `noseBox`/mouth helpers in catmodel.test.js), and no item vertex is more than 0.06 in front of the posed chest's front (no "stick in the mouth"). Plus: cross pose, mainecoon, cape: each brooch centre (clasp `userData.at`) carried to world is outside the posed underside+body surface (ray test) — fix by moving the clasp (larger `lift` or a slightly lower/back a) only if it fails.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (drop the state gate; keep the underside guard). **Step 4:** update the old "restored in other poses" assertions to the new rule.
- [ ] **Step 5: Run** animator, catmodel, catcape, catsitupright, hagrid → PASS. **Step 6: Live:** `ONLY='^neck-|^cape-'`. **Step 7: Commit** `fix(cat): collars and neck items ride the neck in every pose`.

### Task 5: Golden, mesh deltas, numbers, final live pass

**Files:** `test/fixtures/catgolden.json`, `test/catgolden.test.js` (header comment line), `test/fixtures/accessory-mesh-delta.json` (if not yet final)

- [ ] **Step 1:** Run the whole suite; the only failures should be catgolden `*:dressed` keys (tophat, backpack, scarf/collar changed). Any other failure is a bug — fix it in the owning code, not the test.
- [ ] **Step 2:** `UPDATE_GOLDEN=1 npx vitest run test/catgolden.test.js`; check `git diff --stat` touches only catgolden.json (hagrid-golden.json unchanged); add the dated comment line; commit separately `test(golden): regenerate cat goldens for the accessories polish (dressed keys only)`.
- [ ] **Step 3:** Full suite + `npm run build` green; flat-trace sha256 check `shasum -a 256 test/fixtures/flat-trace.json` = 6b502ab6…54a7.
- [ ] **Step 4:** Triangles/meshes per accessory before/after: a scratch vitest script printing `[meshCount, triangles]` of `buildCat('tabby',{[slot]:id})` minus bare, full and simple, for every catalog accessory, run on this branch and on main (ec328ce, via `git show ec328ce:src/cat/model.js` in a temp worktree or by stashing) — record in the ledger.
- [ ] **Step 5:** Full after-shot run (all of shots.mjs + dr.mjs), pair sheets per family into `snaps-polish-accessories/pairs/` (hats, back, back-over-cape, hoods, neck, dressing room phone).
