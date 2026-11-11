# Tails Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Survey-2 polish #6. The stalking tail stops being a straight spike: it is held low in a soft curve with the end lifted and the tip twitching. Long-furred cats (Persian, Maine Coon, the builder's long fur; a milder plume for other fluffy cats) get a full plume tail that is thicker along its length and tapers to a soft tip.

**Architecture:** Geometry lives in `src/cat/model.js` (the TAIL block, ~l.1100–1160) and `src/cat/torso.js` (TAIL, tailR). A new `PLUME` radius table in torso.js and `tailRadius(u, plume)` replace the uniform `tailFluff` factor for plumed cats; `plume` is read from the style (`tailPlume`, default derived: `tailFluff > 1` → 1, `fluffy` → 0.5, else 0). The stalk carriage is a pose in `src/cat/animator.js`: after the generic "lively lagged tail chain", a stalking cat with folds (`base.tailCurl` set, never Hagrid) writes its own root angle and per-pivot bends (`STALK_CARRIAGE`) and a deterministic, t-driven tip twitch.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4.

**Spec:** scratchpad `polish-survey-2.md` row #6 and Build B2; shots `snaps-survey2/c-all-stalk-side.jpg`, `c-body3-stalk-side.jpg`, `c-head-walk-three.jpg`, `c-body2-walk-side.jpg`.

## Global Constraints

- Work only in `<repo>/.worktrees/polish-tails`; dev server port 5237 only.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` (main: 248 files, 8,227 tests, green); also `npm run build`. Long geometry sweeps get explicit timeouts (120_000). Never weaken a test to absorb a load timeout.
- **Never touch `test/fixtures/hagrid-golden.json`.** Hagrid (a hen) must be byte-identical: no plume, no stalk carriage (gate on `base.tailCurl`, which only cats have).
- `test/fixtures/catgolden.json` is regenerated ONCE, in its own commit (Task 3), with `UPDATE_GOLDEN=1 npx vitest run test/catgolden.test.js` plus a dated header line in catgolden.test.js saying which keys moved.
- D2 (owner's real cat, look signed off) keeps her tail: STYLE.d2 gets `tailPlume: 0` explicitly.
- No Math.random; animation is a pure function of t (and moveSpeed). No new draws on walkRng/strayStream. Flat trace sha256 d2657f022d09b1d6507af42e30ce9666bfea29b3e52c2add1c218399a53a72f0 must not move (render-only change; the tail is not in the trace's positions).
- Mesh count unchanged (still 5 link meshes). Triangles: keep the link cylinder's 12 radial segments; a plume may add height segments (rings) but report tris before/after for persian/mainecoon full and simple. Digit's simple cat sits at the 5,500 cap — Digit has no plume.
- Existing pose tests must keep passing on their merits: cape clearance (test/catcape.test.js: no tail vertex under the cloth, root ≥ 4 cm from it, sit cloth ≥ 1 cm from the tail), nap (test/catnap.test.js), sit (test/catsitupright.test.js), folds/stalk (test/folds.test.js, `tailRootAboveRump`), walking-tail hook (test/cattail.test.js). If a plume breaks one, change the plume (e.g. keep the radius near the root at today's value), not the test — unless the test pins the OLD tail's exact radius, then update it with a comment saying why.
- Float fixtures compared with `closeDiffs` (test/helpers/closeto.js).
- Commits: explicit `git add <paths>`; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Live harness: `verify-catbody.html?breeds=…&state=…&speed=1.5&t=…&view=side|three|rear3&zoom=…&light=game[&acc=body:cape]`. Shot script: `node <scratchpad>/tails/shoot.mjs wip [regex]` → `scratchpad/snaps-polish-tails/wip/`; BEFORE shots with the same names are in `snaps-polish-tails/before/`. Look at your shots before reporting.

## Review Focus

1. Plume vs cape: the fuller tail near the root must still come out from under the hem (catcape tests, every breed, full and simple, in every state).
2. Plume vs sit/nap: the curled sitting tail must not swallow the fore paws or sink into the haunch; the nap tail lies on the ground (a fatter tail sinks deeper — check it still shows from above).
3. Stalk curve: the lowest tail vertex stays above the ground (≥ 1 cm, cat frame) at every phase/speed and for every breed incl. Digit (long legs) and Maine Coon (scale 1.3); the tail never pokes through the rump or hind legs.
4. Hagrid unchanged; D2 unchanged; tabby's non-stalk tail unchanged.

---

### Task 1: Plume tails (torso.js + model.js)

**Files:** Modify `src/cat/torso.js` (TAIL block ~l.27–42), `src/cat/model.js` (STYLE l.18–40: `tailPlume`, option doc ~l.67; TAIL block ~l.1100–1160). Test: add to `test/cattail.test.js` (or a new `test/tailplume.test.js`).

**Interfaces:** torso.js exports `PLUME` (radius knots at u = 0, 0.2, 0.4, 0.6, 0.8, 1, tail-local units before TAIL.SCALE) and `tailRadius(u, plume = 0)` = `tailR(u) + plume * (plumeKnot(u) - tailR(u))` with linear interpolation between knots. model.js `buildCat` reads `plume = s.tailPlume ?? (s.tailFluff > 1 ? 1 : s.fluffy ? 0.5 : 0)`; when `plume > 0` the uniform `tailFluff` factor is not applied (the plume replaces it); with `plume === 0` the tail is built exactly as today (byte-identical vertices).

Starting knots (tune visually, Task 1 step 4): today's tailR is `[0.072, 0.0603, 0.0486, 0.0369, 0.0252, 0.0135]`. Plume: `[0.074, 0.088, 0.094, 0.088, 0.068, 0.030]` — fuller all along, widest at u ≈ 0.4, a soft rounded tip (tip sphere = tailRadius(1)). The root ball stays TAIL.ROOT_BALL (0.072) or follows the root knot — whichever keeps catcape green.

Optional fur read (only if it looks good at walk distance; drop it if it looks spiky or faceted): give plumed links 3 height segments and modulate each ring's vertex radius by `1 + 0.06·plume·cos(6θ + ring·π/6)` (deterministic), so the silhouette has soft tufts. Joint spheres stay smooth.

- [ ] Step 1: failing tests — (a) persian and mainecoon (full and simple): the tail's link-2 mesh max radius about its own axis ≥ 1.6× tabby's at the same link (cat-frame, divided by cat.scale), and the tip link's end radius ≤ 0.6× its own link-2 radius (it tapers); (b) `lookToStyle({...DEFAULT_LOOK, fur:'long'})` cat is plumed like the Persian; fur 'fluffy' gets a plume between; (c) tabby, d2, digit, siamese tail vertices byte-identical to a build made with `tailPlume: 0` forced (no change for short-haired and D2); (d) Hagrid tail unchanged (hagrid golden covers it; assert `tailPlume` is ignored).
- [ ] Step 2: run, see them fail.
- [ ] Step 3: implement.
- [ ] Step 4: run the full suite; fix fallout by tuning the knots (see Global Constraints). Take `wip` shots `fluffy-*`, `cape-*`, `looks-walk-side` and look at them.
- [ ] Step 5: commit (`feat(tail): plume tails for long-furred cats`). Do NOT regenerate catgolden yet (its test will fail for persian/mainecoon keys only — say so in the report; Task 3 regenerates).

### Task 2: The stalking tail: low curve, lifted twitching tip (animator.js)

**Files:** Modify `src/cat/animator.js` (constants near STALK_TAIL ~l.670–680; after the "lively lagged tail chain" ~l.1113–1137). Test: add a describe block to `test/folds.test.js` or a new `test/stalktail.test.js`.

**Interfaces:** `export const STALK_CARRIAGE = Object.freeze({ rotX, pivotX: [5], twitch: {...} })` in animator.js. Applies when `state === 'stalk' && base.tailCurl` (cats), standing or creeping.

Shape (cat faces -z, the tail runs back along +z; a pivot's +rotation.x tips the chain DOWN): the root leaves the rump heading down-back a little more than today (rotX ≈ 0.40 vs today 0.28), the first two links droop slightly further (pivotX ≈ [0.05, 0.10, …]) so the middle hangs low (lowest centre-line point ≥ 4 cm, ideally 6–10 cm, over the ground for every breed), then the last links bend up (≈ [… , -0.25, -0.45, -0.5]) so the tip lifts clear (tip end above the lowest centre point by ≥ 8 cm × cat scale). Keep the generic tail's slow root bob (sin(t·2.1)·0.08) but damp the side sway on links 0–2 (a stalking tail is still); the last two pivots twitch: rotation.y += `TW.amp·sin(t·TW.freq)` gated by a slow envelope `max(0, sin(t·TW.slow))` plus a small constant flick so it is never dead still, and rotation.x of the tip pivot adds a small lift twitch. All functions of t only. With `reducedMotion`, keep the curve, drop the fast twitch (keep a slow one, like the cross lash honours it).

- [ ] Step 1: failing tests over breeds (all PRESETS but hagrid), t = 0..3 step 0.25, speeds 0 and 1.5: (a) centre line (pivot origins + tip end, as cattail.test.js `centreLine`) — lowest point y ≥ 0.04 × cat.scale over ground, and every tail vertex y ≥ 0.01 (ground at 0, world units / scale); (b) the tail is curved: the tip end lies ≥ 0.06 m (cat frame) above the lowest centre point, and the lowest centre point is not the root or the tip; (c) the tip twitches: over t in [0, 3] the tip end's x spans ≥ 0.04 m (cat frame) while the link-1 origin's x spans ≤ 0.03; (d) Hagrid's stalk pose identical to a build of today's code path (pivots' rotations equal what the generic chain writes — simplest: assert Hagrid's tailPivots rotation.x are all 0 in stalk); (e) the existing `tailRootAboveRump` stalk test still passes (root not moved).
- [ ] Step 2: run, fail. Step 3: implement. Step 4: full suite + `wip` shots `stalk-*`, `cape-stalk-side`, `phone-stalk`; look at them (side and rear3); the curve must read as one soft line, not a kink. Step 5: commit (`feat(stalk): low curved stalking tail with a twitching tip`).

### Task 3: Golden + live check

- [ ] Regenerate catgolden.json (only persian/mainecoon keys — and any fluffy look keys — should move; check with `git diff --stat` and a key-level diff; if tabby/d2/digit/hagrid keys move, stop and find out why). Header comment line dated 2026-11-03 in test/catgolden.test.js. Commit alone (`test(golden): regenerate catgolden for plume tails`).
- [ ] Full suite + build green; flat-trace hash check (`shasum -a 256 test/fixtures/flat-trace.json` and flattrace test green).
- [ ] After shots (`node …/tails/shoot.mjs after`), pairs into `snaps-polish-tails/pairs/` (stalk side, stalk rear3, fluffy walk rear3, fluffy groom/nap, cape walk + sit, phone).
