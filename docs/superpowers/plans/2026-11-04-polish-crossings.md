# polish-crossings: bridges, fords and the trails that meet them

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Survey 5, build 5-1 (broken #2 and #3, ranked #1). Grass stops growing through log and plank decks; trails run on under every bridge and ford instead of stopping 1–2 m short; log bridges read as real logs and stepping stones as natural stones.

**Architecture:** All render-side. `grass.js` keeps tufts off deck rects. `pathribbon.js` adds a short tuck segment from each free trail end near a deck to just under the deck's end (trail mesh only; the hidden `path` footprints don't change). `builder.js` `logBridge` gets its own smooth trunk geometry with bark/hewn-top/end-grain vertex colours and a branch stub; `steppingStones` and `plankBridge` get vertex colours only.

**Tech:** Three 0.185, Vitest 4. Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; `npm run build`.

## Hard constraints (every task)
- No Math.random in build code. `test/waterlooks.test.js` pins each area build's Math.random draws (BUILD_DRAWS: woods 11344, river 15484, moor 7944, pines 11580, gorge 4488). Three spends 4 draws per uuid (Object3D, BufferGeometry, Material, **Shape**). So a function must create the same number of uuid-bearing objects as before, or create extra ones inside `withLocalUuids` (src/world/localuuids.js). `BufferAttribute` has no uuid, so `setAttribute` is free.
- Flat trace stays sha256 3dfb11a4d847498330c2f1bbc766add06531d4efadaab4c710868df495c1d838 (`test/fixtures/flat-trace.json`).
- Deck records, colliders, walkable data, deck heights unchanged. The log's hewn top stays level at `y`, `flat` wide, and the trunk's full width stays `w` (existing tests in test/builder.test.js and the area tests raycast it).
- Draw calls flat: no new meshes. Triangles (baseline: logBridge 160 per bridge, steppingStones 896 (14 stones) / 512 (Gorge, 8), islandBridge 12): the log may add at most +60 per bridge; stones and plank add none.
- Only touch `logBridge`, `steppingStones`, `plankBridge` in builder.js (polish-twolegplace edits `house()`/`bush()` there). Only `src/render/grass.js` and `src/world/pathribbon.js` besides, plus a one-line `decks` option at each area's `addTrails` call (woods, river, moor, pines, gorge — flagged in the report).
- Commits: explicit `git add <paths>`, message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Rulings
- R1 Deck keep-out margin for tufts is 0.3 m (survey said ~0.2): tufts lean and stalks reach 0.38 m. Cost if wrong: a thin bare strip beside each bridge, which reads as a worn approach anyway.
- R2 Trail tuck: a free trail end within 2.5 m of a deck gets one extra segment (same width) from the end to a point on the deck's long axis placed so the capsule's round tip lies 0.5 m inside the deck's near short edge (`TUCK = 0.5`). The tuck end is never pulled back. Applied only when the area passes `decks` to `addTrails`. Cost if wrong: a trail tip peeking out beside a narrow deck over the bank.
- R3 Gorge's `addTrails` gets the same one-line `decks` option even though polish-gorge5 owns gorge.js (a single argument on one line, far from the corridor/fog/den code). Cost if wrong: a trivial merge conflict.
- R4 Stones and logs: vertex colours over white material colour (`vertexColors: true`); stones tagged `userData.duskTint = true` for 5-3's dusk hook (dusk.js already tints vertex colours). Logs are not tagged (dark bark already sits right at dusk).
- R5 The log keeps `w`, `flat` and `y` as given (3 m trunk, 1.9 m flat, top 0.16). It's made to read as a log by colour and shape, not by changing its size.

---

### Task 1: grass stays off decks (`src/render/grass.js`)
- [ ] Failing test in `test/grass.test.js`: for an area `{ bounds, waters: [{ kind:'rect', ..., decks:[{minX,maxX,minZ,maxZ}] }] }`, `grassAllowed` is false on the deck (over water and over the land part of the deck), false 0.25 m outside its side, true 0.5 m outside. Also a strip deck `{x1,z1,x2,z2,halfW}`. Plus: in the real River/Moor/Woods/Pines `layoutTufts` (or the mask) puts no tuft inside any deck + 0.3 m.
- [ ] Implement: `DECK_MARGIN = 0.3`; in `grassAllowed`, `if (area.waters?.length && deckDistance(area.waters, x, z) < DECK_MARGIN + slack) return false;` (`deckDistance` is exported from builder.js and handles rect and strip decks). Fix the "(decks count as dry)" comment.
- [ ] Full grass tests pass; commit.

### Task 2: trails reach the decks (`src/world/pathribbon.js` + area call sites)
- [ ] Failing tests in `test/pathribbon.test.js`: `trailSegments(groups, { decks })` appends one tuck segment per free end within 2.5 m of a deck; its far capsule tip is 0.5 m inside the deck's near short edge on the deck's long axis; the original end is not pulled back; with no `decks` the output is unchanged (existing tests). For each wild map (River, Moor, Pines, Woods, Gorge built with their waters' decks), every free end that was ≤ 2.5 m from a deck is now covered; and no point of any tuck capsule (radius `trailReach(h)`) outside the deck rects lies in water (`waterClearance` with decks stripped < 0) — so the trail never paints on open water beside a narrow deck. If that last check fails for a deck, shrink the tuck for that end (reduce the overlap) rather than paint water.
- [ ] Implement: deck frame helper (rect: long axis = crossing axis, strip: a→b); in `trailSegments` after the kinds, for each 'free' end with `deckDistanceRect ≤ REACH (2.5)`, mark it 'deck' (move 0) and push `{x1: end, x2: tip - axisIn * h + axisIn*TUCK ... }` (endpoint = edgeMid + axisIn*(TUCK − h)); `addTrails(scene, groups, style, key, { edge, decks })` passes decks through. `endKinds` unchanged.
- [ ] Each area's `addTrails` call passes `{ decks: <AREA>_WATERS.flatMap((w) => w.decks ?? []) }` (woods, river, moor, pines, gorge — one line each).
- [ ] Tests pass (trails, pathribbon, grass, waterlooks, flattrace); commit.

### Task 3: stones and planks get colour (`steppingStones`, `plankBridge`)
- [ ] Failing tests in `test/builder.test.js`: steppingStones geometry has a `color` attribute, material `vertexColors` true, `userData.duskTint` true; at least 3 distinct per-stone base tones (warm grey .. blue-grey); every stone's bottom-ring (skirt) vertices darker than its top; some (not all) stones have a greener top centre (moss). Vertex/triangle counts unchanged (existing tests). plankBridge has a `color` attribute: top face lighter than the side faces; counts unchanged; existing plank tests pass.
- [ ] Implement with `hash01` per stone (salt distinct from 61's existing 1..4). Material `surfNoMap`-equivalent with white colour + vertexColors (`litMaterial(0xffffff, { ...surfaceProps('cobble'), vertexColors: true })`). Same object count as before.
- [ ] waterlooks + flattrace pass; commit.

### Task 4: the log reads as a log (`logBridge`)
- [ ] Failing tests: the trunk mesh geometry has a `color` attribute and `vertexColors` material; the top's vertices are lighter (hewn) than the flank's (bark); end faces exist at both ends with at least 3 distinct ring tones and a dark bark rim; normals on the flank are smooth (radial); triangles per bridge ≤ 220; one mesh (no new meshes); the existing three logBridge tests and the area tests (deck no wider than log, top level at LOG_TOP) still pass.
- [ ] Implement: keep `new THREE.Shape()` (4 draws) and build ONE indexed `BufferGeometry` (4 draws, replacing ExtrudeGeometry's) from the shape's own points: perimeter samples dense on the visible upper flanks, coarse underneath; flank vertices shared with radial normals; the hewn top its own vertices (up normal) in three strips (centre lighter); end faces as a few concentric loops in the visible top band (bark rim, pale sapwood, two growth rings) — region below the ground needs no rings; a short broken branch stub (5–6 sides) on one flank above water, merged into the same arrays; a moss gradient on one upper flank toward one end. Deterministic from (x1,z1,x2,z2) via hash01.
- [ ] waterlooks, flattrace, builder, woods/river/moor/pines tests pass; commit.

### Task 5: final
- [ ] Whole-branch review (most capable model), one fix wave.
- [ ] Budget note in test/budget.test.js comment block (before/after tri, meshes) for River, Moor, Woods, Pines, Gorge.
- [ ] Merge current main, full suite, build, flat-trace sha check; AFTER shots + pairs.
