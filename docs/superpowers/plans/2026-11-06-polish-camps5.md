# polish-camps5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The camp Highrock becomes a layered, mossy rock; nests become domed moss cushions with a bracken rim; bramble berries read as round fruit and crown lumps look soft; the leader's and deputy's name tags never cover each other or hide behind a cat.

**Architecture:** All geometry stays in `src/world/camp.js` (one non-indexed, vertex-coloured, flat-shaded mesh per part, built under `withLocalUuids` as now). Tag work stays in `src/nametag.js`: the declutter places the leader's tag last (so it is the one that lifts, on top), and every fitted tag is pulled a short way toward the camera along its view ray with its scale shrunk to match, so the same screen rect is drawn but a cat body or rock just in front of it no longer hides it.

**Tech Stack:** Three.js 0.185, Vitest 4. Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`.

**Spec:** scratchpad `polish-survey-7.md` → "Pass 7", section 7-3; shared rules `polish-common.md`.

## Global Constraints

- Owned code only: `src/world/camp.js` (`highrockGeometry`, `HIGHROCK`, `nestsMesh`, `NEST`, and in `ringMesh` only berry and lump shading), `src/nametag.js` (declutter/tag fit/bubble), and their tests.
- Gameplay identical: rock collider r 0.6, `rock.h` 0.8, the leader's seat y 0.8, flat top at rock.h (≥ 6 vertices within r 0.42 at y 0.78–0.82, none above 0.82 there), `reach` 0.78, `back` 0.68, `clear` 0.44 above `clearY` 0.82. `campDressing()` output byte-identical.
- No Math.random in builds (hash01 only); every new geometry is built inside the existing `withLocalUuids` callbacks. waterlooks BUILD_DRAWS and the Moor's 7944 stay.
- Flat trace sha256 stays af07901717f1b39482a7befce20f1a80dc09c7e31866ab11bb7459e61d97b83a. If only contact-shadow sizes move, isolation check per polish-common.md.
- Triangles per camp: ≤ +700 in all (Woods has 3.9k room shared with polish-pines2). Ring triangle count unchanged (RING_CLUMP_TRIS 59, RING_BERRY_TRIS 9). Draw calls unchanged (camp test: ≤ 8 merged meshes).
- Woods camp group stays under contact-shadow MAX_SPAN 6.5.
- Commits: explicit `git add <paths>`, never node_modules; message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. The Gorge ledge camp (`addLedgeCamp`, seated on sloped ground, nests pressed by `flat` 0.5): new rock and nests must still sit on the ledge, nothing under ground, the nests under 0.1 m there. Covered by existing camp.test.js Gorge cases; keep them.
2. A cat lying on a nest: the cushion's middle must stay low (≤ 0.06 m at r < 0.2 m) so a lying cat doesn't sink into moss.
3. A pulled tag must never cross the camera's near plane or flip: pull ≤ 40 % of the tag's depth, none when depth < 1 m.
4. The chat bubble sits above its cat's tag: with the pull, the bubble must still clear the tag on screen (bubble test in nametagfit.test.js plus one new one).
5. Two leaders' tags (a rival leader and the home leader) both marked top: they fall back to depth order among themselves.

---

### Task 1: A layered, mossy Highrock (model: opus)

**Files:** Modify `src/world/camp.js` (`HIGHROCK`, `highrockGeometry`, the comment above them); Test `test/camp.test.js` (Highrock cases ~l.162–250).

**Interfaces:** Produces `export const HIGHROCK_BOULDER_TRIS` (main boulder triangles, first in the geometry) and `export const HIGHROCK_TRIS` (total). Signature `highrockGeometry(rockSpot, away, opts)` unchanged; still non-indexed, `position` + `normal` + `color`, built round the origin.

Shape (decisions):
- Main boulder: 10 sides, strata as horizontal ledges: ring pairs (outer ring then an inset ring ~2 cm higher, 3–6 cm in) at about y 0.24 and 0.5, so each stratum is an upright band with a nearly flat ledge on top; a rounded shoulder (rings at ~0.72 r 0.5 and at rock.h r 0.40) into the flat top cap at exactly rock.h. Per-corner hash push ±6 %, keep the step-side lean.
- Back stone and two steps: `IcosahedronGeometry(1, 1)` (80 triangles each, rounded off), same placement table.
- Colour stays a per-face multiplier on the material's `look.rock` (material colour unchanged), may exceed 1 per channel:
  - grey value 0.70 at the foot to 1.0 at the top, ±6 % hash;
  - faces facing down (normal.y < −0.2: under each ledge) × 0.62 (dark joints);
  - a crack: on the boulder, the faces of one or two hash-picked columns × 0.7;
  - moss: up-facing faces (normal.y > 0.55) picked by hash with share 0.6 on the top cap and ledges (and the stones' tops), coloured `look.nest.moss` × 0.85 divided channel-wise by `look.rock` (both as linear THREE.Color), so the face shows moss green;
  - lichen: ~6 % of the side faces, `0xc9c79a` / look.rock channel-wise, × 0.95.
- Limits pass (reach/back/clear) as now, after all parts.

- [ ] Step 1: Rewrite the Highrock tests: within 0.8 m, 1.0–1.2 m tall, `count/3 === HIGHROCK_TRIS` and `HIGHROCK_TRIS <= 116 + 450`; one colour per face; mean luminance (0.2126r+0.7152g+0.0722b) of faces with y < 0.25 below that of faces with y > 0.7 among non-moss faces; some faces with normal.y > 0.55 have g/r > 1.15 (moss) and every face with g/r > 1.15 has normal.y > 0.5; some face with normal.y < −0.2 is darker than the median; flat-top test and the "stones keep clear" test with `3 * HIGHROCK_BOULDER_TRIS` in place of `3 * 56` and `verts.length === 3 * HIGHROCK_TRIS`. Update `BASE_VERTS.campRock` in test/camplooks.test.js to `3 * HIGHROCK_TRIS` with a comment.
- [ ] Step 2: Run `npx vitest run test/camp.test.js test/camplooks.test.js` — new cases FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run camp, camplooks, campdressing, flattrace, waterlooks tests — PASS.
- [ ] Step 5: Commit `feat(camps5): a layered, mossy Highrock with ledges, cracks and lichen`.

### Task 2: Domed moss nests with a bracken rim (model: sonnet)

**Files:** Modify `src/world/camp.js` (`NEST`, `nestsMesh`); Test `test/camp.test.js` or `test/camplooks.test.js`.

Shape per nest (≤ 100 triangles a nest; today 90): a low moss dome (a 10-segment fan plus two rings: centre ≤ 0.05 m, a raised rim bank to ~0.09 m at r ≈ 0.33, falling to 0 at r ≈ NEST.r + 0.06), coloured `look.nest.moss` × (0.8..1.15 hash) with the rim darker; then 10 bracken fronds round the rim, each 2 triangles (a bent leaf card from the bank top leaning out and up to ~0.14 m), `look.nest.bracken` × (0.85..1.1). `press` (the Gorge's `flat`) applies to every part as now. Mesh name, material and flags unchanged.

- [ ] Step 1: Tests: every nest vertex within NEST.r + 0.12 of its nest (xz) and between ground and 0.16 m (flat 1); vertices within r 0.2 are ≤ 0.06 m; triangles per nest ≤ 100; the existing moss-colour test still passes; some vertex is bracken × [0.85, 1.1].
- [ ] Step 2: Run — FAIL. Step 3: Implement. Step 4: Run camp*, flattrace, waterlooks — PASS.
- [ ] Step 5: Commit `feat(camps5): nests become domed moss cushions with a bracken rim`.

### Task 3: Rounder berries, softer crown lumps (model: sonnet)

**Files:** Modify `src/world/camp.js` (`BERRY`, the berry loop and crown lumps' normals in `ringMesh`); Test `test/camplooks.test.js`.

- Berries: same 3 triangles each (RING_BERRY_TRIS 9 kept), `BERRY.r` 0.028 → 0.04, `apex` 0.045 → 0.05, `at` 0.95 → 0.97; fruiting colour per face: the face whose normal points most up × 1.08 of the berry's colour, the others × 0.94 (all still in fruit × [0.9, 1.1], one factor across channels); buds unchanged.
- Crown lumps (the three octahedra): after `clampToClump`, set each vertex normal to the normalised direction from that lump's centre, so they shade round (no triangle change). The core keeps its facets.

- [ ] Step 1: Test: crown-lump vertex normals (triangles 20..43 of each clump) point within 60° of (vertex − lump centroid); berry triangle extents ≥ 0.07 m across. Step 2: FAIL. Step 3: Implement. Step 4: camp*, waterlooks pass. Step 5: Commit `feat(camps5): rounder bramble berries and soft-shaded crown lumps`.

### Task 4: Leader and deputy tags never cover each other (model: opus)

**Files:** Modify `src/nametag.js`; Test `test/nametagdeclutter.test.js`, `test/nametagfit.test.js`.

**Interfaces:** `declutterTags(entries, hud, out)` entries gain optional `top: boolean`; `makeNameTag` sets `tag.userData.top = true` when `sub` starts with `leader` (case-insensitive); `export const TAG_PULL_M = 1.5`, `export const TAG_PULL_SHARE = 0.4`.

- Order: entries with `top` placed after every entry without it (depth order within each group), so an overlapping leader tag is the one that drops its rank line/lifts — it ends up above.
- Pull: in `fitOnRender`'s frame path, after `applyDecision` (unless hidden), move the tag's matrixWorld translation toward the camera by `p = min(TAG_PULL_M, TAG_PULL_SHARE * depth)` (0 when depth < 1) and scale both scale columns by `(depth − p) / depth`, so its screen rect is unchanged. Before pulling, store the unpulled world top (`y + sy/2`) on `tag.userData.fitTop`; `fitBubbleOnRender` reads `fitTop` when present instead of the matrix.
- [ ] Step 1: Tests: a leader (top) nearer than a deputy whose rects overlap → the leader gets the lift, the deputy none; two top entries → depth order; a pulled tag projects to the same screen rect (±0.5 px) as unpulled and sits `p` m nearer; depth 0.8 → no pull; bubble stays above the tag's unpulled top.
- [ ] Step 2: FAIL. Step 3: Implement. Step 4: all `test/nametag*.test.js`, `test/chatbubble*.test.js`, owntag — PASS. Step 5: Commit `fix(camps5): the leader's tag goes on top, and tags pull toward the camera so a nearby cat or the Highrock no longer hides one`.

### After the tasks

Whole-branch review (opus), one fix wave, live AFTER shots (`camps5tools/camps.mjs`, SNDIR=after) and pairs, triangles via `camps5tools/tris6.mjs` before/after, full suite + `npm run build`.
