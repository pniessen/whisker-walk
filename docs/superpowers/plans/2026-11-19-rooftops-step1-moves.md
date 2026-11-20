# The Rooftops, step 1: the Moves on Their Own — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared module that gives any area four placed moves — the balance walk along a crossing, the leap at a marked gap, the drop at a marked drop spot and the climb-up at a placed spot — plus the camera that follows a balance walk, proven by tests and shown on a small picture page (the "yard") with before/after pictures and two short recordings for the owner to approve the feel.

**Architecture:**
- **Data and math, pure:** `src/traversal.js`. An area may return `traversal: createTraversal(spec, ground)` from `build()`. No shipped area does in this step.
- **The runtime:** `src/traversallive.js`. `createTraversalLive(...)` for an area with `traversal`, the frozen `NO_TRAVERSAL` everywhere else (the `NO_FAIR` pattern of `src/fairlive.js`).
- **Before the player moves:** the runtime's `update()` runs right before `player.update` in `main.js`. While she is on a crossing or in a hop it halts the player (`halt()` and `speedFactor = 0`), places her itself and writes `player.perchY` as "rail height minus the ground under her". So `player.update` places the camera for her new spot in the same frame, and its edge slide and collider push never act on her. `late()` adds the cosmetic pose touches after `game/avatar.js` has posed her.
- **The yard:** `src/world/traversalyard.js`. A 40 x 40 m test place built from raised ground (`src/ground.js`). It is not in `AREAS`. It is drawn by `verify-traversal.html` and recorded frame by frame by `scripts/record-page.mjs`, which drives headless Chrome over the DevTools protocol.

**Tech Stack:** Plain ES modules, Three.js 0.185, Vite 8, Vitest 4, Node 26 (built-in `WebSocket`), Google Chrome (headless), ffmpeg (`/opt/homebrew/bin/ffmpeg`).

**Spec:** `docs/superpowers/specs/2026-11-19-rooftops-design.md`. This plan is "Build order" item 1 only, with the sections "The two new moves", "Changing level", "Learning" (only as far as a seam for the two skills) and "Constraints". Steps 2–4 get their own plans.

## Global Constraints

- **Work only in the worktree** `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/rooftops` on branch `rooftops`. Never touch the main checkout. Never merge, never push.
- **Commits:** `git add <exact paths>`, never `-A` or `.`. Every message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tests:** `node_modules` is missing in the worktree. Run `npm ci` once, first. During tasks, run single files: `npx vitest run test/<file>`. The full suite (`npx vitest run`) runs once, in Task 10. Other agents share this machine: before the full run, check `uptime`. If the 1-minute load is above the core count (`sysctl -n hw.ncpu`), wait, or report rather than run. Under load the suite times out falsely.
- **Nothing that ships changes.**
  - No file in `test/fixtures/` changes. That covers `flat-trace.json`, `gorge-gameplay.json`, `catgolden.json`, `hagrid-golden.json`, `catpose-baseline.json` and the series-words snapshots.
  - No existing test is edited, except where a task names it.
  - `SAVE_VERSION`, the network message and every area's mesh, draw and triangle counts are unchanged.
  - No `src/world/*.js` other than the new yard returns `traversal`.
- **Spec values, verbatim:**
  - A gap is "up to about 3.5 m, the landing level or lower (never higher than the normal climb rule allows)". Long Leap gaps are "about 4.5 m".
  - "It always lands."
  - Drops: "at most about 3 m per hop".
  - Climb-ups: "within the normal climb rule (1.6 m, 2.2 with Spring Paws)".
  - On a crossing: "She cannot step off sideways and cannot fall." "Speed: a careful walk. Zoomies do not run on a crossing."
  - "the stick's push along the crossing's direction moves her; a sideways push does nothing. Keyboard the same. No extra button."
  - "The camera eases round behind her along the crossing, gently."
  - Anti-goals: "no dizzy camera, no looking straight down a drop"; "a drop that looks like a fall"; "A leap that misses, a crossing that tips the cat off".
- **Shared, not Rooftops-only:**
  - Nothing in `src/traversal.js` or `src/traversallive.js` names an area.
  - Crossings, gaps, drops and climbs are data an area returns.
- **Deterministic for two players:**
  - No `Math.random`, no `walkRng`, no `Date.now` / `performance.now` in either module.
  - Every motion is a function of the data, the stick and `dt`. The wobble is a function of time on the crossing.
- **Allocation:**
  - `update()` and `late()` allocate nothing. They use module or closure scratch objects.
  - Every pure function that returns a point takes an `out` and returns it.
- **Reduced motion** (`session.reducedMotion`, passed in at creation). Gameplay is identical: the same landings, the same crossing speed. Under reduced motion:
  - no wobble, no tail sway, no rump wiggle, no hang at the top of a leap, no landing bounce, no leap pitch;
  - shorter crouch and landing;
  - the camera never turns by itself.
- **Text:** step 1 adds no player-facing text to the game. The picture page's captions are page-only and are not under `src/`.
- **Offline-first:** nothing here touches the network or the database. No `.env` files are read.
- **Skills:** Tightrope Tail and Long Leap are **not** added in this step (step 4 adds them to `src/skills.js` with their feats).
  - Step 1 only builds the seam: `moveAbilities(state)` reads `hasSkill(state, 'tightrope-tail' | 'long-leap')`. Both are always false until the catalog has them, because `hasSkill` fails closed on an unknown id.
  - The runtime takes `abilities()` as an option, so tests drive both paths.
- **Line numbers** below are from `402148f5`. Find each site by the quoted code.

## Review Focus

1. **Frames of `dt` 0 and the 0.05 s clamp mid-leap or mid-crossing.**
   - Expected: she lands on exactly the same spot, a hop never ends early on a 0-length frame, and no frame puts her below the ground.
   - Test: Task 6, `lands on the same spot whatever the frame times`.
2. **Something else writes her position mid-move** (a chase scamper, a fight, a resumed note).
   - Expected: the next frame she is back on the rail or the arc, and she lands at the landing spot.
   - Test: Task 6, `keeps her on the arc when something else moves her mid-air`.
3. **The jump is mashed at a take-off spot and through the landing.**
   - Expected: exactly one leap, no ordinary pounce, and a press after she has landed works normally.
   - Tests: Task 6, `one leap per press however the button is mashed`; Task 8, the interactions half.
4. **The stick is held through the camera's swing, or pushed diagonally.**
   - Expected: she never reverses mid-crossing, and a diagonal push moves her at the along-crossing share of her speed.
   - Tests: Task 5, `with the stick held, the camera's swing never turns her round` and `a diagonal push moves her at its share of the speed`.
5. **The walk is paused, ended or resumed mid-move.**
   - Expected: the walk note puts her on free ground at the near end or at the landing, and `dispose()` leaves nothing held.
   - Tests: Task 5, `groundSpot and dispose`; Task 8, `walkresume notes the ground spot`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/traversal.js` | create | Pure data and math. Constants, `createTraversal`, `validateTraversal`, points on rails and arcs, mount and spot finding, the balance step, hop timing, yaw helpers, `moveAbilities`. No THREE. |
| `src/traversallive.js` | create | `NO_TRAVERSAL`, `createTraversalLive` (per-walk state, `update`, `jump`, `late`, `groundSpot`, `dispose`), `traversalEventEffects`. |
| `src/catcam.js` | modify | Add `moveVector(keys, out)`: the keys' screen-space push, no yaw. |
| `src/player.js` | modify | Add `api.stickInput(out)`. |
| `src/game/avatar.js` | modify | Pose and gait speed from `s.traversal`. |
| `src/game/interactions.js` | modify | The jump asks `session.traversal.jump` after the fair. No prompts while busy. |
| `src/main.js` | modify | `session.traversal.update` before `player.update`; `session.traversal.late` after `session.fair.late`. |
| `src/game/walk.js` | modify | Build the runtime or `NO_TRAVERSAL`, pass it to `createSession`, dispose it. |
| `src/game/session.js` | modify | The `traversal` field. |
| `src/game/walkresume.js` | modify | `traversal.groundSpot()` beside the fair's. |
| `src/world/traversalyard.js` | create | The yard: ground spec, traversal spec, `yardArea()`, the two tours, `createYardPilot`, `buildTraversalYard(scene)` (drawn). |
| `test/helpers/traversalflood.js` | create | `floodTraversal(area, opts)`: regions of raised ground joined by moves. It is the "never stuck" checker step 2 reuses. |
| `test/helpers/traversalwalk.js` | create | `yardWalk(opts)`: the real player and the runtime on the yard, in `main.js`'s frame order. |
| `verify-traversal.html` | create | The picture page (kept in the repo: `.gitignore` exception). |
| `scripts/record-page.mjs` | create | Headless Chrome over CDP: still shots and frame-by-frame recordings, then ffmpeg. |
| `.gitignore` | modify | `!verify-traversal.html`. |
| `test/traversal.test.js`, `test/traversallive.test.js`, `test/traversalyard.test.js`, `test/traversalwiring.test.js`, `test/recordpage.test.js` | create | The tests named below. |

**Two words to keep apart:** "crossing" already names the border crossings (`src/game/crossing.js`, `test/crossing.test.js`), and `moves` names the fight moves (`src/fightmoves.js`). This module is **traversal** everywhere: the file names, the session field `traversal`, the area field `traversal` and `NO_TRAVERSAL`. "Crossing" is used only inside it, for the record kind.

**Headless test stub:** every test file that creates a player or a cat stubs `document` exactly as `test/flattrace.test.js` lines 58–80 do (canvas `getContext` proxy, `addEventListener() {}`, `pointerLockElement: null`, `exitPointerLock() {}`). It then imports `src/` modules with `await import(...)`.

---

### Task 1: The data and its rules

**Files:**
- Create: `src/traversal.js`
- Test: `test/traversal.test.js`

**Interfaces:**
- Consumes: `STEP_MAX`, `LEVEL_TOL`, `MAX_PATH_GRADE`, `createGround` from `src/ground.js`; `BASE_CLIMB_BUDGET`, `SPRING_PAWS_CLIMB`, `climbBudget` from `src/climbing.js`; `hasSkill` from `src/skills.js`; `CAT_RADIUS` is **not** imported from player.js (THREE-free), so it is redeclared as `SPOT_BODY = 0.35`, with a test that it equals `CAT_RADIUS`.
- Produces: the constants below. Then:
  - `createTraversal(spec, ground) → Traversal`.
  - `validateTraversal(spec, { ground, bounds, colliders = [], wet = null }) → string[]`.
  - `crossingPoint(crossing, u, out) → out` (`{ x, y, z, tx, tz, grade }`).
  - `arcPoint(hop, apex, s, out) → out` (`{ x, y, z }`).
  - `arcClears(hop, apex, ground) → boolean`.
  - `moveAbilities(state) → { steady, longLeap, climb }`.
  - `BASE_ABILITIES`, `TIGHTROPE_TAIL_ID`, `LONG_LEAP_ID`.

**The spec an area writes** (all heights in world metres):

```js
{
  crossings: [{ id, kind, width = 0.3, points: [{ x, z, y }, ...] }],   // kind: CROSSING_KINDS
  gaps:   [{ id, from: { x, z }, to: { x, z }, requires = null, mark = null }],  // requires: null | LONG_LEAP_ID
  climbs: [{ id, from: { x, z }, to: { x, z }, mark = null }],
  drops:  [{ id, from: { x, z }, to: { x, z }, mark = null }],
}
```

**What `createTraversal` returns** (everything frozen):
- **`Traversal`**: `{ crossings: Crossing[], hops: Hop[] }`. The hops are the gaps, then the climbs, then the drops, each in declaration order. That order breaks ties in `spotFor`.
- **`Crossing`**: `{ id, kind, width, length, segs, ends }`.
  - Each seg is `{ x0, z0, y0, dx, dz, dy, len, u0, tx, tz, grade }`. `len` is the horizontal length, `u0` is the metres along the rail at the seg's start, `t` is the horizontal unit direction, and `grade = dy / len`.
  - `ends` is `[{ x, z, y, inX, inZ }, { ... }]`, where `in` is the unit horizontal direction from that end into the crossing.
- **`Hop`**: `{ id, kind: 'leap' | 'climb' | 'drop', x0, z0, y0, x1, z1, y1, dist, dy, requires, mark, apex }`.
  - `y0` and `y1` are `ground.y` at the two spots, so no hop height is authored.
  - `apex` is the smallest `h` in steps of `APEX_STEP` from `apexBase(hop)` up to `APEX_MAX` for which `arcClears(hop, h, ground)`; else `APEX_MAX`.
  - `apexBase(hop) = max(HOP[kind].apex + HOP[kind].apexPerM * dist, |dy| / 4 + APEX_MARGIN)`. The `|dy| / 4` term makes a climb arrive from above and a drop or downward leap leave with a little rise.

**The arc** (one formula for all three kinds): `x = x0 + (x1 - x0) s`, `z` likewise, `y = y0 + dy · s + 4 · apex · s (1 − s)`, for `s` in `[0, 1]`.

**`arcClears(hop, apex, ground)`:**
- It samples `s = i / 50` for `i` = 0..50.
- With `g = ground.y(x, z)`, a sample is "own level" when `|g − y0| ≤ STEP_MAX` or `|g − y1| ≤ STEP_MAX`.
- It needs `y ≥ g − 1e-9` on own level, and `y ≥ g + ARC_CLEAR − 1e-9` everywhere else (walls, lips, other roofs).

**Constants** (exported; the numbers are first guesses for the owner to tune from the recording, except the four the spec pins):

| name | value | why |
|---|---|---|
| `CROSSING_KINDS` | `['plank', 'ridge', 'gutter', 'line', 'pipe']` | spec's list |
| `SEG_MIN` | 0.2 | m |
| `CROSSING_MAX_LEN` | 12 | m |
| `END_INSET` | 0.35 | m: each end's first stretch of rail lies on its roof (so the mount glide ends over the roof) |
| `MOUNT_R` | 0.5 | m from an end |
| `MOUNT_DOT` | 0.5 | stick must point this much onto the crossing |
| `ALONG_DEAD` | 0.25 | an along-crossing push smaller than this does nothing |
| `BALANCE_SPEED` | 1.2 | m/s, "a careful walk" (her walk is 3.5) |
| `TIGHTROPE_SPEED` | 1.7 | m/s, with Tightrope Tail (step 4 earns it) |
| `BALANCE_EASE` | 6 | 1/s |
| `TURN_RATE` | 9 | rad/s, her turn on a crossing |
| `SNAP_EASE` | 14 | 1/s, the glide onto the rail |
| `CAM_FOLLOW_RATE` | 1.6 | 1/s |
| `CAM_TURN_MAX` | 1.1 | rad/s, "gently" |
| `SPOT_R` | 0.9 | m from a take-off / drop / climb spot |
| `SPOT_FACE_BONUS` | 0.4 | m off a candidate's score per unit of facing |
| `SPOT_BODY` | 0.35 | = player.js `CAT_RADIUS` |
| `GAP_MIN` | 1.0 | m |
| `GAP_MAX` | **3.5** | spec |
| `LONG_GAP_MAX` | **4.5** | spec |
| `LEAP_RISE_MAX` | **1.6** | = `BASE_CLIMB_BUDGET.climb`, spec |
| `DROP_MAX` | **3.0** | spec |
| `DROP_REACH` | 2.5 | m horizontal |
| `CLIMB_REACH` | 2.5 | m horizontal; a climb's rise ≤ `SPRING_PAWS_CLIMB` (2.2, spec) |
| `ARC_CLEAR` | 0.15 | m over walls and lips |
| `APEX_MARGIN` / `APEX_STEP` / `APEX_MAX` | 0.1 / 0.05 / 2.0 | m |
| `HOP` | `{ leap: { crouch: 0.5, crouchRM: 0.15, air: 0.45, airPerM: 0.07, apex: 0.45, apexPerM: 0.12, hang: 0.45, land: 0.22, landRM: 0.12 }, climb: { crouch: 0.15, crouchRM: 0.08, air: 0.35, airPerM: 0.08, apex: 0.3, apexPerM: 0, hang: 0, land: 0.15, landRM: 0.1 }, drop: { crouch: 0.12, crouchRM: 0.08, air: 0.4, airPerM: 0.12, apex: 0.2, apexPerM: 0, hang: 0, land: 0.22, landRM: 0.12 } }` | airPerM is per metre of distance (leap) or of rise/fall (climb, drop) |
| `LOOK_TIME` | 1.4 | s |
| `TIGHTROPE_TAIL_ID` / `LONG_LEAP_ID` | `'tightrope-tail'` / `'long-leap'` | step 4's catalog ids |
| `BASE_ABILITIES` | `{ steady: false, longLeap: false, climb: 1.6 }` | frozen |

**`validateTraversal` messages.** Each message is `` `${what} ${id}: ${phrase}` ``, where `what` is `crossing`, `gap`, `climb` or `drop`. The phrase is exactly one of:
- `has a non-finite number`
- `unknown kind`
- `needs two points or more`
- `has a segment shorter than 0.2 m`
- `is steeper than 1 in 3`
- `is longer than 12 m`
- `end 0 is off the ground` / `end 1 is off the ground` (`|y − ground.y| > STEP_MAX`)
- `does not lie on its roof for its first 0.35 m` (the rail's first and last `END_INSET` m: `|y − ground.y| ≤ STEP_MAX` at 0.05 m samples)
- `goes under the ground` (0.25 m samples, `y < ground.y − 1e-6`)
- `is wider than 3.5 m without Long Leap`
- `is wider than 4.5 m`
- `needs no Long Leap` (`requires` set at `dist ≤ GAP_MAX`)
- `unknown requirement`
- `is shorter than 1 m`
- `rises more than 1.6 m`
- `falls more than 3 m`
- `is not a drop` (fall ≤ `LEVEL_TOL`)
- `is not a climb` (rise ≤ `LEVEL_TOL`)
- `rises more than 2.2 m`
- `reaches more than 2.5 m`
- `arc hits the ground` (no apex up to `APEX_MAX` clears)
- `is outside the bounds` (a spot or end closer than `SPOT_BODY` to an edge)
- `is inside a collider` (distance < `r + SPOT_BODY`)
- `is in the water` (`wet(x, z)` true)
- `cannot be walked to from its own level`. Ring samples at radii 0.3, 0.6 and `SPOT_R` (for a hop's `from`) or `MOUNT_R` (for a crossing end), 16 angles each. Every sample with `|ground.y − level| ≤ STEP_MAX` must pass `ground.canStep(sample → spot)`.
- `duplicate id` (ids are unique across all four lists). The lists are checked in the order crossings, gaps, climbs, drops, and the later record of a pair is the one flagged.

- [ ] **Step 1: Write the failing tests** (`test/traversal.test.js`, pure; no document stub needed)

```js
import { createGround, STEP_MAX } from '../src/ground.js';
import * as T from '../src/traversal.js';
const level = createGround({ strips: [
  { x0: -6, z0: 0, x1: -2, z1: 0, width: 4, y0: 3 },   // roof A, x -6..-2
  { x0: 2, z0: 0, x1: 6, z1: 0, width: 4, y0: 3 },     // roof B, x 2..6
] });
const plank = { id: 'p', kind: 'plank', points: [{ x: -2.4, z: 0, y: 3 }, { x: 2.4, z: 0, y: 3 }] };
const ctx = { ground: level, bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } };

describe('createTraversal', () => {
  it('measures a crossing and its ends', () => {
    const t = T.createTraversal({ crossings: [plank] }, level);
    const c = t.crossings[0];
    expect(c.length).toBeCloseTo(4.8, 12);
    expect(c.ends[0]).toMatchObject({ x: -2.4, z: 0, y: 3, inX: 1, inZ: 0 });
    expect(c.ends[1]).toMatchObject({ x: 2.4, inX: -1 });
    expect(Object.isFrozen(c)).toBe(true);
  });
  it('crossingPoint walks the rail and returns its out', () => {
    const c = T.createTraversal({ crossings: [{ ...plank, points: [{ x: -2.4, z: 0, y: 3 }, { x: 0, z: 0, y: 2.7 }, { x: 2.4, z: 0, y: 3 }] }] }, level).crossings[0];
    const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0, grade: 0 };
    expect(T.crossingPoint(c, 2.4, out)).toBe(out);
    expect(out.y).toBeCloseTo(2.7, 12);
    T.crossingPoint(c, 1.2, out);
    expect(out).toMatchObject({ tx: 1, tz: 0 });
    expect(out.grade).toBeCloseTo(-0.125, 12);
    T.crossingPoint(c, -5, out); expect(out.x).toBe(-2.4);  // clamped
    T.crossingPoint(c, 99, out); expect(out.x).toBe(2.4);
  });
  it('takes a hop’s heights from the ground and lifts its apex until the arc clears', () => {
    const wall = createGround({ strips: [
      { x0: -4, z0: 0, x1: 0, z1: 0, width: 4, y0: 0 }, { x0: 0, z0: 0, x1: 4, z1: 0, width: 4, y0: 1.5 },
    ] });
    const t = T.createTraversal({ climbs: [{ id: 'c', from: { x: -0.8, z: 0 }, to: { x: 0.6, z: 0 } }] }, wall);
    const h = t.hops[0];
    expect([h.y0, h.y1, h.kind]).toEqual([0, 1.5, 'climb']);
    expect(T.arcClears(h, h.apex, wall)).toBe(true);
    expect(T.arcClears(h, h.apex - T.APEX_STEP, wall)).toBe(false);
  });
  it('orders hops gaps, climbs, drops', () => {
    const t = T.createTraversal({ drops: [{ id: 'd', from: { x: -2.4, z: 0 }, to: { x: -2.4, z: 1.5 } }],
      climbs: [{ id: 'c', from: { x: -2.4, z: 1.5 }, to: { x: -2.4, z: 0 } }], gaps: [{ id: 'g', from: { x: -2.4, z: 0 }, to: { x: 2.4, z: 0 } }] }, level);
    expect(t.hops.map((h) => h.id)).toEqual(['g', 'c', 'd']);
  });
});

describe('validateTraversal', () => {
  // `tall`: roof A at 3, a pit at 0, and roof C at 6.5 so a 3.5 m drop and a 2.4 m climb can be written
  const tall = createGround({ strips: [
    { x0: -6, z0: 0, x1: -2, z1: 0, width: 4, y0: 3 }, { x0: 2, z0: 0, x1: 6, z1: 0, width: 4, y0: 3 },
    { x0: -6, z0: 4, x1: -2, z1: 4, width: 4, y0: 6.5 }, { x0: -6, z0: -4, x1: -2, z1: -4, width: 4, y0: 5.4 },
  ] });
  const tctx = { ...ctx, ground: tall };
  const gap = (from, to, more = {}) => ({ gaps: [{ id: 'g', from, to, ...more }] });
  it('passes a good plank', () => expect(T.validateTraversal({ crossings: [plank] }, ctx)).toEqual([]));
  it.each([
    ['an end off the ground', { crossings: [{ ...plank, points: [{ x: -2.4, z: 0, y: 3.3 }, { x: 2.4, z: 0, y: 3 }] }] }, 'crossing p: end 0 is off the ground'],
    ['a rail under the ground', { crossings: [{ ...plank, points: [{ x: -2.4, z: 0, y: 3 }, { x: -3.6, z: 0, y: 2.8 }, { x: -2.2, z: 0.5, y: 3 }] }] }, 'crossing p: goes under the ground'],
    ['too steep', { crossings: [{ ...plank, points: [{ x: -2.4, z: 0, y: 3 }, { x: -1, z: 0, y: 3 }, { x: 0, z: 0, y: 4 }, { x: 1, z: 0, y: 3 }, { x: 2.4, z: 0, y: 3 }] }] }, 'crossing p: is steeper than 1 in 3'],
    ['a short gap with requires', gap({ x: -2.4, z: 0 }, { x: -4.4, z: 0 }, { requires: T.LONG_LEAP_ID }), 'gap g: needs no Long Leap'],
    ['a wide gap without it', gap({ x: -2.1, z: 0 }, { x: 2.1, z: 0 }), 'gap g: is wider than 3.5 m without Long Leap'],
    ['too wide even with it', gap({ x: -3, z: 0 }, { x: 3, z: 0 }, { requires: T.LONG_LEAP_ID }), 'gap g: is wider than 4.5 m'],
    ['a drop of 3.5 m', { drops: [{ id: 'd', from: { x: -4, z: 2.4 }, to: { x: -4, z: 1.6 } }] }, 'drop d: falls more than 3 m'],
    ['a climb of 2.4 m', { climbs: [{ id: 'c', from: { x: -4, z: -1.6 }, to: { x: -4, z: -2.4 } }] }, 'climb c: rises more than 2.2 m'],
    ['a spot in a collider', gap({ x: -2.4, z: 0 }, { x: 2.4, z: 0 }), 'gap g: is inside a collider', { colliders: [{ x: -2.6, z: 0, r: 0.3 }] }],
    ['a duplicate id', { crossings: [{ ...plank, id: 'g' }], ...gap({ x: -2.4, z: 1 }, { x: 2.4, z: 1 }) }, 'gap g: duplicate id'],
    ['an unknown kind', { crossings: [{ ...plank, kind: 'rope' }] }, 'crossing p: unknown kind'],
    ['a NaN', { crossings: [{ ...plank, points: [{ x: -2.4, z: 0, y: NaN }, { x: 2.4, z: 0, y: 3 }] }] }, 'crossing p: has a non-finite number'],
  ])('flags %s', (_, spec, message, more = {}) => expect(T.validateTraversal(spec, { ...tctx, ...more })).toContain(message));
});

describe('moveAbilities', () => {
  it('is the base set for any save until step 4 adds the two skills', () => {
    expect(T.moveAbilities({})).toEqual(T.BASE_ABILITIES);
    expect(T.moveAbilities({ skills: ['long-leap', 'tightrope-tail'] })).toEqual(T.BASE_ABILITIES); // unknown ids fail closed
    expect(T.moveAbilities(null)).toEqual(T.BASE_ABILITIES);
  });
  it('climbs on Spring Paws’ budget', () => expect(T.moveAbilities({ skills: ['spring-paws'] }).climb).toBe(2.2));
});

it('SPOT_BODY is the player’s CAT_RADIUS', async () => {
  // player.js needs the document stub: read the number from source instead
  const src = (await import('node:fs')).readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  expect(src).toContain(`export const CAT_RADIUS = ${T.SPOT_BODY};`);
});
```

Each `it.each` row must produce its own message among whatever else it flags, and the good plank must produce none. The `tall` ground has roof C at 6.5 m north of roof A (z 2..6), so the drop from (−4, 2.4) falls 3.5 m. Roof D is at 5.4 m south of roof A (z −6..−2), so the climb onto (−4, −2.4) rises 2.4 m.

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/traversal.test.js`. Expected: FAIL, `Cannot find module '../src/traversal.js'`.

- [ ] **Step 3: Implement `src/traversal.js` (part 1).**
  - Header comment: what the module is for (the spec's "shared machinery"), why a crossing is a rail and not ground, the arc formula, the allocation rule.
  - Write the constants, `createTraversal`, `crossingPoint` (a linear scan over `segs`), `arcPoint`, `arcClears`, `validateTraversal` and `moveAbilities`. Leave the motion functions to Task 2.
  - Why a crossing is a rail and not ground: a plank over the alley as a ground strip would make the alley a wall under it. `ground.js` allows one walkable height per spot.
  - `moveAbilities(state)` returns `BASE_ABILITIES` by identity when nothing is held. Otherwise it returns a new frozen object (the `climbBudget` pattern).

- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run test/traversal.test.js`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/traversal.js test/traversal.test.js
git commit -m "Traversal step 1: crossings, gaps, climbs and drops as data, with their rules"
```

---

### Task 2: The motions as pure math

**Files:**
- Modify: `src/traversal.js`
- Test: `test/traversal.test.js` (new describes)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `crossingToMount(trav, x, z, groundY, dirX, dirZ, out) → out | null`, with `out` = `{ crossing, end: 0 | 1, u }`.
  - `balanceStep(st, crossing, along, dt, steady) → null | 0 | 1`, with `st` = `{ u, v }`, mutated in place.
  - `spotFor(trav, x, z, groundY, faceX, faceZ, abilities, out) → out | null`, with `out` = `{ hop, look: boolean }`.
  - `planHop(hop, startX, startZ, reducedMotion, out) → out`. A `Plan` is `{ hop, sx, sz, crouch, air, land, hang, total }`.
  - `hopAt(plan, elapsed, out) → out`, with `out` = `{ x, y, z, phase: 'crouch' | 'air' | 'land' | 'done', s, onGround, tau }`.
  - `stickToWorld(sx, sz, yaw, out) → out`; `facingYaw(fx, fz)`; `behindYaw(fx, fz)`; `easeYawToward(cur, target, dt, rate, max)`.

**Rules the tests pin:**
- **`crossingToMount`** looks at the end nearest the cat, among the ends where all three hold:
  - the horizontal distance is ≤ `MOUNT_R`;
  - `|groundY − end.y| ≤ LEVEL_TOL`;
  - `hypot(dir) ≥ 0.2` and `dot(dir, in) ≥ MOUNT_DOT · hypot(dir)`.
  - `u` is the cat's projection on that end's own segment, clamped to the segment (end 0 measures from 0, end 1 from `length`).
- **`balanceStep`:**
  - `max = steady ? TIGHTROPE_SPEED : BALANCE_SPEED`.
  - `target = |along| < ALONG_DEAD ? 0 : along · max`.
  - `v += (target − v)(1 − e^(−BALANCE_EASE·dt))`, then `u += v·dt`.
  - At `u ≤ 0` it clamps to 0: it returns `0` if `target < 0`, else sets `v = 0`. At `u ≥ length` it does the same with `target > 0` and returns `1`. Otherwise it returns `null`.
  - The stick's magnitude is ≤ 1, so `|v| ≤ max` always.
- **`spotFor`:**
  - The candidates are the hops with `hypot(cat − (x0, z0)) ≤ SPOT_R` and `|groundY − y0| ≤ LEVEL_TOL`.
  - The score is `d − SPOT_FACE_BONUS · max(0, face · unit(x1 − x0, z1 − z0))`, plus `SPOT_R` when the hop would be a look. The lowest score wins, and ties go to the earlier hop.
  - `look` is true for a gap with `requires === LONG_LEAP_ID` without `abilities.longLeap`, and for a climb whose rise is more than `abilities.climb`.
- **`planHop`:**
  - `crouch` and `land` come from `HOP[kind]` (the `RM` values under reduced motion). `hang` is `0` under reduced motion.
  - `air = HOP.air + HOP.airPerM · (kind === 'leap' ? dist : |dy|)`, and `total = crouch + air + land`.
- **`hopAt`:**
  - In the crouch, `x, z` glide from `(sx, sz)` to `(x0, z0)` by smoothstep, with `y = y0`, `s = 0` and `onGround: true`.
  - In the air, `w = (e − crouch) / air` and `s = w + (hang / 2π) · sin(2πw)` (slow at the top). The point is `arcPoint(hop, hop.apex, s)`, with `onGround: false`.
  - In the land phase, the point is `(x1, y1, z1)`, with `onGround: true` and `tau` in `[0, 1)`.
  - Once done, it **assigns** `x = hop.x1`, `y = hop.y1` and `z = hop.z1`, which makes the landing exact.
- **`stickToWorld`** equals `new THREE.Vector3(sx, 0, sz).applyAxisAngle(UP, yaw)`: `x = sx·cos + sz·sin`, `z = −sx·sin + sz·cos`.
- **`facingYaw(fx, fz) = atan2(fx, fz) + π`**, which is player.js's `rotation.y` convention.
- **`behindYaw(fx, fz) = atan2(−fx, −fz)`**, which puts the follow camera (`catcam.cameraOffset`) behind her.
- **`easeYawToward`** turns the shortest way round by `Δ · (1 − e^(−rate·dt))`, capped at `max · dt`. It returns `cur` exactly when `dt` is 0.

- [ ] **Step 1: Write the failing tests**

```js
import * as THREE from 'three';
describe('mounting', () => {
  const t = T.createTraversal({ crossings: [plank] }, level);
  const out = { crossing: null, end: 0, u: 0 };
  it('mounts at an end when the stick points onto the crossing', () => {
    expect(T.crossingToMount(t, -2.7, 0.1, 3, 1, 0, out)).toBe(out);
    expect(out).toMatchObject({ crossing: t.crossings[0], end: 0 });
    expect(out.u).toBe(0); // behind the end: clamped
  });
  it.each([['pushing away', -1, 0], ['sideways', 0, 1], ['no push', 0, 0]])('does not mount %s', (_, dx, dz) =>
    expect(T.crossingToMount(t, -2.6, 0, 3, dx, dz, out)).toBeNull());
  it('does not mount from another level', () => expect(T.crossingToMount(t, -2.6, 0, 0, 1, 0, out)).toBeNull());
});
describe('balanceStep', () => {
  const c = T.createTraversal({ crossings: [plank] }, level).crossings[0];
  it('never goes faster than the careful walk, and Tightrope Tail is quicker', () => {
    const st = { u: 1, v: 0 };
    for (let i = 0; i < 600; i++) { T.balanceStep(st, c, 1, 1 / 60, false); expect(Math.abs(st.v)).toBeLessThanOrEqual(T.BALANCE_SPEED); if (st.u >= c.length) break; }
    const st2 = { u: 1, v: 0 }; for (let i = 0; i < 60; i++) T.balanceStep(st2, c, 1, 1 / 60, true);
    expect(st2.v).toBeGreaterThan(T.BALANCE_SPEED);
  });
  it('ignores a push under the dead zone', () => { const st = { u: 2, v: 0 }; T.balanceStep(st, c, T.ALONG_DEAD - 0.01, 0.1, false); expect(st).toEqual({ u: 2, v: 0 }); });
  it('steps off only when pushed out past an end', () => {
    const st = { u: 0.01, v: -1 };
    expect(T.balanceStep(st, c, 0, 0.1, false)).toBeNull(); expect(st.u).toBe(0); expect(st.v).toBe(0); // let go at the end: stays on
    expect(T.balanceStep(st, c, -1, 0.1, false)).toBe(0);
    const far = { u: c.length - 0.01, v: 1 }; expect(T.balanceStep(far, c, 1, 0.1, false)).toBe(1);
  });
});
describe('spotFor', () => { /* nearest wins; facing breaks a tie; another level is ignored; a gated gap is a look
  without longLeap and a hop with it; a 1.5 m climb is a look at climb 1.0; a usable spot beats a look within SPOT_R; nothing within SPOT_R → null */ });
describe('planHop and hopAt', () => {
  // a 3.3 m level leap on `level`'s two roofs, from a press 0.6 m behind the take-off
  it('glides to the take-off, flies, lands, and ends exactly on the landing spot', () => { /* phases in order;
    crouch x goes sx → x0; done: out.x === hop.x1 && out.y === hop.y1 && out.z === hop.z1 (toBe) */ });
  it('hangs at the top unless motion is reduced', () => { /* fraction of air samples with s in [0.4, 0.6]:
    > 0.26 with hang, < 0.22 reduced; reduced: same air time, shorter crouch and land, same arc points for equal s */ });
  it('a climb arrives from above and a drop leaves with a little rise', () => { /* dy/ds at s=1 < 0 for a climb;
    at s=0 ≥ 0 for a 2 m drop and a 2 m downward leap */ });
  it('a frame of 0 changes nothing', () => { /* hopAt(plan, e) twice equal; phase never advances at equal e */ });
});
describe('yaw and stick helpers', () => {
  it('stickToWorld is three’s applyAxisAngle about +y', () => {
    for (const [sx, sz, yaw] of [[0, -1, 0], [1, 0, 0.7], [0.6, -0.8, -2.1], [-0.3, 0.4, 3.0]]) {
      const v = new THREE.Vector3(sx, 0, sz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const o = T.stickToWorld(sx, sz, yaw, { x: 0, z: 0 });
      expect(o.x).toBeCloseTo(v.x, 12); expect(o.z).toBeCloseTo(v.z, 12);
    }
  });
  it('behindYaw is facingYaw, mod 2π, and 0 for a cat facing north', () => { expect(T.behindYaw(0, -1)).toBe(0); /* + 3 more */ });
  it('easeYawToward goes the short way, never faster than max, and holds at dt 0', () => {
    expect(T.easeYawToward(3.0, -3.0, 0, 5, 1)).toBe(3.0);
    const n = T.easeYawToward(3.0, -3.0, 0.1, 5, 1); expect(n).toBeGreaterThan(3.0); expect(n - 3.0).toBeLessThanOrEqual(0.1 + 1e-12);
  });
});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/traversal.test.js`. Expected: FAIL (the new names are not exported).
- [ ] **Step 3: Implement the eight functions in `src/traversal.js`,** with the rules above. Every one writes its result into `out` and returns it, or returns a number.
- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run test/traversal.test.js`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/traversal.js test/traversal.test.js
git commit -m "Traversal step 1: mounting, the balance step, take-off spots, the hop and its timing as pure functions"
```

---

### Task 3: The yard, and the "never stuck" checker

**Files:**
- Create: `src/world/traversalyard.js` (data and `yardArea()` only; the drawing comes in Task 9)
- Create: `test/helpers/traversalflood.js`
- Test: `test/traversalyard.test.js`

**Interfaces:**
- Consumes: `createGround`, `validateGround` from `src/ground.js`; Task 1.
- Produces:
  - `YARD_BOUNDS`, `YARD_SPAWN`, `YARD_GROUND` (a `createGround` spec), `YARD_TRAVERSAL` (a traversal spec).
  - `yardArea() → { name: 'yard', bounds, spawn, colliders: [], waters: [], perches: [], ground, traversal }`. It makes no THREE objects.
  - `floodTraversal(area, { step = 0.25, abilities = BASE_ABILITIES } = {}) → { regions, regionAt(x, z), levelOf(r), edges: Map<number, Set<number>>, reachable(fromRegion) → Set<number> }`.

**The yard** (x east, z south, north is −z; metres; flat rectangles become strips along x, `width = maxZ − minZ`). Levels: yard 0, LOW 1.5, HIGH 3.5. The module must not contain the text `life:` (`test/gorgelife.test.js` scans `src/world/` for it).

| piece | shape | y |
|---|---|---|
| bounds | x −20..20, z −20..20; spawn (0, 14) | |
| shed | rect x −16..−8, z −4.5..8 | 1.5 |
| tank | disc (−14, −3.5) r 1.0 | 2.6 |
| west | rect x −16..−8, z −16..−6 | 3.5 |
| east | rect x −2..8, z −16..−6 | 3.5 |
| house block (the pitched roof is drawn above it, Task 9) | rect x 8..13, z −16..−6 | 1.0 |
| chimney | disc (13.4, −11) r 0.9 | 3.5 |
| east2 | rect x −2..8, z −3.5..4 | 3.5 |
| lowE | rect x 10..18, z −3.5..4 | 1.5 |
| lowS | rect x 10..18, z 7.6..14 | 1.5 |
| fire escape (stairs as slope) | strip (−3.5, 0, y 0) → (−8.2, 0, y 1.5), width 1.6 | |

| move | data |
|---|---|
| `plank-1` plank | (−8.4, −13, 3.5) → (−1.6, −13, 3.5) |
| `plank-2` plank (leaning) | (−2.6, 6, 0) → (−8.0, 6, 1.5) → (−8.4, 6, 1.5) |
| `line-1` line (sags) | (−1.6, −9, 3.5) → (−2.0, −9, 3.5) → (−5, −9, 3.2) → (−8.0, −9, 3.5) → (−8.4, −9, 3.5) |
| `ridge-1` ridge | (7.6, −11, 3.5) → (13.4, −11, 3.5) |
| `gap-1` (level) | (3, −6.4) → (3, −3.1) |
| `gap-2` (down 2 m) | (7.6, 0) → (10.4, 0) |
| `gap-3` (Long Leap, 4.4 m) | (14, 3.6) → (14, 8.0), `requires: LONG_LEAP_ID` |
| `climb-1` yard→shed | (−12, 8.8) → (−12, 7.4) |
| `climb-2` shed→tank | (−14, −1.8) → (−14, −2.9) |
| `climb-3` tank→west | (−14, −4.1) → (−14, −6.4) |
| `drop-1` west→shed | (−12, −6.4) → (−12, −4.1) |
| `drop-2` lowE→yard | (17.6, 0) → (19.2, 0) |
| `drop-3` lowS→yard | (14, 13.6) → (14, 15.4) |
| `drop-4` shed→yard | (−8.4, 2) → (−6.6, 2) |

**`floodTraversal`:**
- It labels every grid cell over `area.bounds` into regions: connected components under `ground.canStep`, four-neighbour. All cells are labelled, not only those reached from the spawn. The 0.25 m grid follows `test/helpers/gorgeflood.js`.
- It then adds directed edges between regions:
  - each crossing joins `regionAt(end0)` and `regionAt(end1)`, both ways;
  - each hop runs `regionAt(from)` → `regionAt(to)`, when usable: a gap with `requires` only if `abilities.longLeap`, a climb only if its rise ≤ `abilities.climb`.
- `reachable(r)` is a BFS over the edges.
- Step 2 reuses it for the Rooftops' "never stuck" test.

- [ ] **Step 1: Write the failing tests** (`test/traversalyard.test.js`, no THREE)

```js
const Y = await import('../src/world/traversalyard.js');
const { validateGround } = await import('../src/ground.js');
const { validateTraversal, BASE_ABILITIES, GAP_MAX, DROP_MAX } = await import('../src/traversal.js');
const { floodTraversal } = await import('./helpers/traversalflood.js');
const area = Y.yardArea();

it('the yard’s ground and moves pass their rules', () => {
  expect(validateGround(Y.YARD_GROUND)).toEqual([]);
  expect(validateTraversal(Y.YARD_TRAVERSAL, { ground: area.ground, bounds: area.bounds })).toEqual([]);
});
it('has what step 1 promised: planks, a ridge, a washing line, three gaps, two raised levels joined by drops in steps', () => {
  const kinds = area.traversal.crossings.map((c) => c.kind);
  expect(kinds.filter((k) => k === 'plank').length).toBeGreaterThanOrEqual(2);
  expect(kinds).toContain('ridge'); expect(kinds).toContain('line');
  const gaps = area.traversal.hops.filter((h) => h.kind === 'leap');
  expect(gaps).toHaveLength(3);
  expect(gaps.filter((g) => g.dist > GAP_MAX)).toHaveLength(1);
  const drops = area.traversal.hops.filter((h) => h.kind === 'drop');
  expect(drops.every((d) => -d.dy <= DROP_MAX)).toBe(true);
  // west (3.5) → shed (1.5) → yard (0): a chain of drops
  expect(drops.map((d) => d.id)).toEqual(expect.arrayContaining(['drop-1', 'drop-4']));
});
it('is never stuck: from every place she can get to, there is a way back to the yard without Long Leap', () => {
  const all = floodTraversal(area, { abilities: { ...BASE_ABILITIES, longLeap: true } });
  const base = floodTraversal(area);
  const yard = base.regionAt(Y.YARD_SPAWN.x, Y.YARD_SPAWN.z);
  const visitable = all.reachable(all.regionAt(Y.YARD_SPAWN.x, Y.YARD_SPAWN.z));
  const stuck = [...visitable].filter((r) => !base.reachable(r).has(yard)).map((r) => base.levelOf(r));
  expect(stuck).toEqual([]);
});
it('every roof but lowS can be reached without Long Leap; lowS only with it', () => { /* regionAt(14, 10) ∈ all, ∉ base;
  regionAt of west, east, east2, lowE, chimney, tank ∈ base.reachable(yard) */ });
it('a plank over the yard leaves the yard walkable under it', () => {
  expect(area.ground.y(-5, -13)).toBe(0);
  expect(area.ground.canStep(-5, -14, -5, -12)).toBe(true);
});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/traversalyard.test.js`. Expected: FAIL (no module).
- [ ] **Step 3: Implement `src/world/traversalyard.js` (data plus `yardArea()`) and `test/helpers/traversalflood.js`.** If the validator flags a yard record, fix the record, not the rule. Then say so in the task report.
- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run test/traversalyard.test.js test/gorgelife.test.js`. Expected: PASS (gorgelife still sees only `gorge.js` and `river.js`).
- [ ] **Step 5: Commit.**

```bash
git add src/world/traversalyard.js test/helpers/traversalflood.js test/traversalyard.test.js
git commit -m "Traversal step 1: the test yard (two planks, a ridge, a washing line, three gaps, drops in steps) and the never-stuck flood"
```

---

### Task 4: The stick, without the camera turn

**Files:**
- Modify: `src/catcam.js` (after `moveDirection`, line 42)
- Modify: `src/player.js` (the `api` object, beside `inputDirection()`, line 688)
- Test: `test/traversallive.test.js` (first describe; it creates the document stub the later tasks share)

**Interfaces:**
- Produces:
  - `moveVector(keys, out) → out`: the same normalised (x, z) as `moveDirection(keys, 0)`, written into `out` (`{ x, z }` or a Vector3). It gives `(0, 0)` when no key is held.
  - `player.stickInput(out) → out`: `touchMove ? (x, z) of touchMove : moveVector(keys, out)`. It is screen-space, before any yaw, so `stickToWorld(stick, player.viewYaw())` equals `player.inputDirection()`.
  - Neither changes `moveDirection`, `touchDirection` or `update()`, so `flat-trace.json` cannot move.

- [ ] **Step 1: Write the failing tests**

```js
describe('the stick, read without the camera turn', () => {
  it('moveVector is moveDirection at yaw 0, into its out', () => { /* for the 8 key combinations: equal x, z; returns out; (0,0) when none */ });
  it('stickInput turned by the view yaw is inputDirection', () => {
    const player = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
    player.setAvatar(new THREE.Group(), 3.5); player.setViewYaw(0.9);
    player.setTouchMove({ x: 0.6, z: -0.8, mag: 1 });
    const out = { x: 0, z: 0 };
    expect(player.stickInput(out)).toBe(out);
    const w = stickToWorld(out.x, out.z, player.viewYaw(), { x: 0, z: 0 });
    const d = player.inputDirection();
    expect(w.x).toBeCloseTo(d.x, 12); expect(w.z).toBeCloseTo(d.z, 12);
  });
});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/traversallive.test.js`. Expected: FAIL (`moveVector` and `stickInput` are not defined).
- [ ] **Step 3: Implement both,** each with a one-line comment: "for the balance walk (src/traversallive.js), which turns the stick by its own held yaw".
- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run test/traversallive.test.js test/catcam.test.js test/flattrace.test.js`. Expected: PASS, with the flat trace byte-identical.
- [ ] **Step 5: Commit.**

```bash
git add src/catcam.js src/player.js test/traversallive.test.js
git commit -m "Traversal step 1: read the stick before the camera turn (catcam moveVector, player.stickInput)"
```

---

### Task 5: The balance walk and its camera

**Files:**
- Create: `src/traversallive.js`
- Create: `test/helpers/traversalwalk.js`
- Test: `test/traversallive.test.js`

**Interfaces:**
- Consumes:
  - Tasks 1–4.
  - The real player's `halt()`, `speedFactor`, `perchY`, `inputActive`, `stickInput(out)`, `viewYaw()` and `setViewYaw(v)`.
  - `session.perched`, `session.fight`, `session.chasing` and `session.idleTime`.
- Produces:
  - `createTraversalLive(trav, { ground, reducedMotion = false, abilities = () => BASE_ABILITIES, onEvent = () => {} })` → the API below.
  - `NO_TRAVERSAL`: frozen, `{ busy: false, crossing: null, hop: null, looking: null, phase: null, progress: 0, pose: null, speed: null, groundSpot() { return null; }, update() {}, jump() { return false; }, late() {}, dispose() {} }`.

**The API:**
- Getters:
  - `busy`: on a crossing or in a hop.
  - `crossing`: the Crossing or `null`.
  - `hop`: the current Hop or `null`.
  - `looking`: the Hop being looked at, or `null`.
  - `phase`: `'crossing' | 'crouch' | 'air' | 'land' | 'look' | null`.
  - `progress`: `u / length` on a crossing, `s` in a hop.
  - `pose`: `'stalk'` on a crossing and in the crouch, `'pounce'` in the air, `'land'` in the land phase, `'follow'` when looking, else `null`.
  - `speed`: `|v|` on a crossing, 0 in a hop or a look, else `null`.
- Methods:
  - `update(dt, t, { cat, player, session })`
  - `jump(ctx) → boolean` (Task 6)
  - `late(dt, t, ctx)` (Task 7; a no-op until then)
  - `groundSpot() → { x, z } | null`
  - `dispose()`
- Events, through `onEvent`:
  - `{ type: 'mount', id }`;
  - `{ type: 'cross', id }`, when she steps off at the end opposite the one she got on by. It is the tally step 4 counts for Tightrope Tail.

**`update` on the ground** checks for a mount. All of these must hold: `!busy`, `!session.perched`, `player.perchY === 0`, `!session.fight`, `!session.chasing` and `player.inputActive`. Then:
- Read `player.stickInput(stick)` and turn it by `player.viewYaw()` into world.
- Run `crossingToMount` with `ground.y(cat)`.
- On a mount:
  - Set `controlYaw = viewYaw` and `st = { u, v: 0 }`. The lateral offset is `cat − crossingPoint(u)`. Read `steady = abilities().steady`.
  - Call `player.halt()` and emit `mount`.
  - Fall through to the crossing branch in the same frame.

**`update` on a crossing** does these steps in order:
1. **Hold the yaw.** When `!player.inputActive`, set `controlYaw = null`. When the stick is pushed and `controlYaw` is null, set `controlYaw = player.viewYaw()`. Turn the stick by `controlYaw`, not by the live yaw, so a held stick keeps its world direction while the camera swings.
2. **Step along.** `along = dot(world, tangent at u)`, then run `balanceStep`.
3. **Off at an end** (`balanceStep` gave 0 or 1):
   - Put her exactly on that end with `perchY = 0` and keep her facing.
   - Clear the state and emit `cross` if `end !== mountEnd`. Return.
4. **Place her.**
   - Decay the lateral offset by `e^(−SNAP_EASE·dt)`. Her `x, z` is the rail point plus the offset.
   - `player.perchY = max(0, rail.y − ground.y(x, z))`.
   - `cat.position.set(x, rail.y, z)`.
5. **Face.** When `|v| > 0.05`, she faces `sign(v) · tangent`, and `cat.rotation.y` eases toward `facingYaw` at `TURN_RATE`.
6. **Camera.** When `!reducedMotion` and `|v| > 0.1`, call `player.setViewYaw(easeYawToward(viewYaw, behindYaw(facing), dt, CAM_FOLLOW_RATE, CAM_TURN_MAX))`.
7. **Hold the player.** `player.halt()`, `player.speedFactor = 0`, `session.idleTime = 0`.

Comment this order in the code. The runtime runs **before** `player.update`, so the player keeps her still (velocity 0, so no slide, no zoomies charge and no turn from velocity), and places the camera with this frame's yaw. `game/avatar.js` writes `speedFactor` after `player.update`, and this overrides it before the next one.

**`groundSpot()`:** on a crossing, the nearer end (`u < length / 2` gives end 0); in a hop, its landing; else `null`. **`dispose()`:** clears every state. Afterwards `busy` is false and `groundSpot()` is null.

**`test/helpers/traversalwalk.js`:** `yardWalk({ at, face, viewYaw, abilities, reducedMotion, cat })` → `{ area, player, cat, live, session, ctx, events, frame(dt = 1/60), run(seconds, dt), push(wx, wz), release(), jump(), trace }`.
- `at` puts the cat on `yardArea()`'s ground there. `face` sets `cat.rotation.y = facingYaw(...face)`. `viewYaw` defaults to `behindYaw(...face)`. `cat` defaults to a bare `THREE.Group`.
- `session` is `{ perched: null, fight: null, chasing: false, idleTime: 0 }`. `jump()` is `live.jump(ctx)`.
- The real player (`createPlayer(camera, { addEventListener() {} })`) has `setAvatar(cat, 3.5)`, `setGround(area.ground)`, `setReducedMotion`, `setViewYaw` and `enable()`.
- `push` turns a **world** direction into a stick once, with the current yaw: `stickToWorld(wx, wz, −viewYaw)` and `setTouchMove({ x, z, mag: hypot })`. It does not recompute it each frame.
- `frame(dt)` runs in `main.js`'s order:
  1. `live.update(dt, t, ctx)`;
  2. `player.update(dt, [], area.bounds, [])`;
  3. the avatar stand-in: `player.speedFactor = 1`, `cat.rotation.x = 0`, `cat.rotation.z = 0`;
  4. `live.late(dt, t, ctx)`;
  5. append `[x, y, z, rotation.y]` (as `toString`) to `trace`.

- [ ] **Step 1: Write the failing tests** (`test/traversallive.test.js`)

```js
describe('the balance walk', () => {
  it('walks onto plank-1 from the west roof, along it, and off onto the east roof', () => {
    const w = yardWalk({ at: [-9.0, -13], face: [1, 0], viewYaw: behindYaw(1, 0) });
    w.push(1, 0);
    for (let i = 0; i < 30 && !w.live.busy; i++) w.frame(); // 0.6 m from the end: a few frames' walk
    expect(w.live.crossing?.id).toBe('plank-1');
    w.run(0.3);
    while (w.live.busy) { w.frame(); expect(w.cat.position.z).toBeCloseTo(-13, 6); expect(w.cat.position.y).toBeCloseTo(3.5, 9); }
    w.run(0.5);
    expect(w.area.ground.y(w.cat.position.x, w.cat.position.z)).toBe(3.5);
    expect(w.cat.position.x).toBeGreaterThan(-1.6);
    expect(w.events.map((e) => e.type)).toEqual(['mount', 'cross']);
  });
  it('never walks faster than the careful walk, and zoomies never run on a crossing', () => { /* start (-15.5,-13) push east: player.zooming true before
    the plank; from the mount frame on: player.zooming false, per-frame |Δx|/dt ≤ BALANCE_SPEED + 1e-9 */ });
  it('a sideways push does nothing; letting go stops her; she turns round', () => { /* mid-plank: release 1.5 s; push (0,1) 1 s → x toBe
    unchanged; push (−1,0) 1 s → x decreases, rotation.y within 0.05 of facingYaw(−1,0) (mod 2π) */ });
  it('a diagonal push moves her at its share of the speed', () => { /* push (1,1)/√2 for 2 s: final per-frame speed within 2% of 0.7071 · BALANCE_SPEED */ });
  it('her height follows the washing line’s sag', () => { /* line-1 at x −5: y within 1e-9 of 3.2 */ });
  it('the camera eases round behind her, gently, and not at all with reduced motion', () => {
    const w = yardWalk({ at: [-9.0, -13], face: [1, 0], viewYaw: 1.2 });
    w.push(1, 0);
    let prev = w.player.viewYaw();
    for (let i = 0; i < 180; i++) { w.frame(); const y = w.player.viewYaw(); expect(Math.abs(y - prev)).toBeLessThanOrEqual(CAM_TURN_MAX / 60 + 1e-9); prev = y; }
    expect(Math.abs(angleDiff(prev, behindYaw(1, 0)))).toBeLessThan(0.15);
    const r = yardWalk({ at: [-9.0, -13], face: [1, 0], viewYaw: 1.2, reducedMotion: true });
    r.push(1, 0); r.run(3); expect(r.player.viewYaw()).toBe(1.2);
  });
  it('with the stick held, the camera’s swing never turns her round', () => {
    // on the east roof facing west with the camera ahead of her (west), she walks toward it
    const w = yardWalk({ at: [-1.0, -13], face: [-1, 0], viewYaw: behindYaw(1, 0) });
    w.push(-1, 0); // pushed once and held
    let x = w.cat.position.x;
    for (let i = 0; i < 900 && !w.events.some((e) => e.type === 'cross'); i++) { w.frame(); expect(w.cat.position.x).toBeLessThanOrEqual(x + 1e-9); x = w.cat.position.x; }
    expect(w.events.map((e) => e.type)).toEqual(['mount', 'cross']);
    expect(w.area.ground.y(w.cat.position.x, w.cat.position.z)).toBe(3.5); // off on the west roof
    expect(Math.abs(angleDiff(w.player.viewYaw(), behindYaw(-1, 0)))).toBeLessThan(0.3); // and the camera came round
  });
  it('does not mount when perched, in a fight or chased, or from the yard under the plank', () => { /* four cases, live.busy stays false */ });
  it('the leaning plank: from the yard up onto the shed', () => { /* plank-2 from (−2.2, 6) pushing west: off on the shed, ground 1.5 */ });
  it('groundSpot and dispose', () => { /* mid plank-1 nearer end 0 → {x:−8.4,z:−13}; after dispose busy false, groundSpot null */ });
  it('NO_TRAVERSAL does nothing', () => { /* jump false, busy false, pose/speed null, update/late/dispose do not throw, Object.isFrozen */ });
});
```

`angleDiff(a, b)` is a small local helper: `atan2(sin(a − b), cos(a − b))`.

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/traversallive.test.js`. Expected: FAIL (`traversallive.js` missing).
- [ ] **Step 3: Implement `src/traversallive.js` (crossings, `NO_TRAVERSAL`, `groundSpot`, `dispose`) and `test/helpers/traversalwalk.js`.** The header comment states the frame order and the reason for it, and what `NO_TRAVERSAL` is for.
- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run test/traversallive.test.js`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/traversallive.js test/helpers/traversalwalk.js test/traversallive.test.js
git commit -m "Traversal step 1: the balance walk on placed crossings, and the camera easing round behind her"
```

---

### Task 6: The leap, the drop, the climb-up and the look across

**Files:**
- Modify: `src/traversallive.js`
- Test: `test/traversallive.test.js`

**Interfaces:**
- Consumes: Tasks 2 and 5.
- Produces:
  - `jump({ cat, player, session }) → boolean`.
  - Events `{ type: 'leap' | 'climb' | 'drop', id }` when she springs (the start of the air), `{ type: 'land', kind, id }` at touchdown (the start of the land phase), and `{ type: 'look', id }`.
  - `traversalEventEffects(e, { audio, fx, cat, bus })`.

**`jump` returns, in order:**
1. `true` and does nothing while `busy` (this covers a crossing).
2. `false` when `session.perched`, `player.perchY !== 0`, `session.fight` or `session.chasing`.
3. Otherwise it runs `spotFor` with the cat's facing `(−sin rotation.y, −cos rotation.y)` and `abilities()` read on this press.
   - **No spot:** `false`.
   - **A look:**
     - `looking = hop`, for `LOOK_TIME`. `looking` is not `busy`.
     - Call `player.halt()` and turn her to face the landing.
     - Emit `look` and return `true`.
     - The stick ends a look at once. So does the timer.
   - **A hop:**
     - Plan it with `planHop(hop, cat.x, cat.z, reducedMotion, plan)` and set `elapsed = 0`.
     - Call `player.halt()` and return `true`.

**`update` in a hop:**
- `elapsed += max(dt, 0)`, then `hopAt`.
- On the ground (`onGround`), she is at `x, z` with `perchY = 0`. In the air, `perchY = max(0, y − ground.y(x, z))`, then `cat.position.set(x, y, z)`.
- During the crouch she turns toward `facingYaw(x1 − x0, z1 − z0)` at `TURN_RATE`. In the air and the land phase she faces it exactly.
- Emit the kind's event on the first air frame and `land` on the first land frame.
- At `'done'`: clear the hop. She is exactly at the landing, and `busy` is false.
- Each hop frame: `player.halt()`, `player.speedFactor = 0` and `session.idleTime = 0`, as on a crossing.

**`traversalEventEffects`:**
- `leap`, `climb` and `drop` play `audio.pounceWhoosh()`.
- `land` does three things: `fx.burst(cat.position, 0xcbb8a0, 8)`, `audio.landThump()` and `bus.emit('pounce:land', { water: false })`. The light tap in `src/haptics.js` listens for that last one.
- Anything else does nothing.
- It reads `fx` and `audio` with `?.`, so a stand-in may omit them.

- [ ] **Step 1: Write the failing tests**

```js
describe('the leap and the drop', () => {
  it('leaps the level gap: crouch, air, land, and ends exactly on the far roof', () => {
    const w = yardWalk({ at: [3, -7.0], face: [0, 1] });
    expect(w.jump()).toBe(true);
    const phases = [];
    while (w.live.busy) {
      w.frame(); phases.push(w.live.phase);
      expect(w.cat.position.y).toBeGreaterThanOrEqual(w.area.ground.y(w.cat.position.x, w.cat.position.z) - 1e-9);
    }
    expect([...new Set(phases)]).toEqual(['crouch', 'air', 'land', null]);
    const hop = w.area.traversal.hops.find((h) => h.id === 'gap-1');
    expect(w.cat.position.x).toBe(hop.x1); expect(w.cat.position.z).toBe(hop.z1);
    expect(w.player.perchY).toBe(0);
    expect(w.events.map((e) => e.type)).toEqual(['leap', 'land']);
  });
  it('leaps down gap-2 onto the lower roof', () => { /* lands (10.4, 0), ground 1.5 */ });
  it('climbs onto the shed at climb-1, and a climb above her budget is a look', () => { /* climb 1.6: lands (−12, 7.4);
    abilities climb 1.0: jump true, phase 'look', position unchanged, events ['look'], after LOOK_TIME phase null */ });
  it('at the gap too wide for her she looks across; with Long Leap she leaps it', () => { /* gap-3 from (14, 3.2) facing south */ });
  it('drops in steps from the west roof to the shed, and from the shed to the yard', () => { /* drop-1 then drop-4;
    first air frame y ≥ y0 − 1e-9 (a hop out, not a fall); lands exactly on each `to` */ });
  it('away from every spot the jump is not its business', () => { /* spawn: false; on the west roof 3 m from any spot: false;
    perched on a stand-in perch at a spot: false */ });
  it('lands on the same spot whatever the frame times', () => {
    const land = (dts) => { const w = yardWalk({ at: [3, -7.0], face: [0, 1] }); w.jump(); let i = 0; while (w.live.busy) w.frame(dts[i++ % dts.length]); return [w.cat.position.x, w.cat.position.z]; };
    const a = land([1 / 60]); expect(land([0.05])).toEqual(a); expect(land([1 / 60, 0, 0, 1 / 30])).toEqual(a);
  });
  it('keeps her on the arc when something else moves her mid-air', () => { /* at the first air frame: cat.position.set(0, 0, 10);
    next frame she is within 0.2 m of the arc; lands exactly on gap-1's `to` */ });
  it('one leap per press however the button is mashed', () => { /* jump() every frame for 2.5 s from the take-off: events has exactly
    one 'leap'; after landing on east2 (no spot near), jump() is false */ });
  it('is the same on two devices, and draws on no dice', () => {
    const real = Math.random; Math.random = () => { throw new Error('Math.random'); };
    try { const a = scriptedRun(); const b = scriptedRun(); expect(b).toEqual(a); } finally { Math.random = real; }
    // scriptedRun: plank-1 across, then to gap-1 and leap: returns w.trace
  });
  it('traversalEventEffects', () => { /* stubs record calls: land → burst at the cat, landThump, bus 'pounce:land' {water:false};
    leap/drop/climb → pounceWhoosh; mount/cross/look → nothing */ });
});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/traversallive.test.js`. Expected: FAIL (the new cases).
- [ ] **Step 3: Implement the hop, look, `jump` and `traversalEventEffects` in `src/traversallive.js`.**
- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run test/traversallive.test.js`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/traversallive.js test/traversallive.test.js
git commit -m "Traversal step 1: the leap that always lands, drops and climb-ups at placed spots, and the look across a gap too wide"
```

---

### Task 7: How she looks doing it (`late`), reduced motion and the steady tail

**Files:**
- Modify: `src/traversallive.js`
- Test: `test/traversallive.test.js`

**Interfaces:**
- Consumes: `cat.userData.parts` (`body`, `head`, `tail`, `tailPivots`, `legs`, `earL`, `earR`), as `src/cat/model.js` builds them. `late` runs after `animateCat` and `applyWaterLook`, which set `rotation.x` and `rotation.z` outright every frame. So `late` may write `rotation.x`, add to `rotation.z` and add to `rotation.y`.
- Produces: exported `WOBBLE = { every: 3.2, len: 0.7, amp: 0.07, rate: 9, steady: 0.4 }`, `TAIL_OUT = { rootX: -0.25, sway: 0.2, rate: 8.8 }`, `WIGGLE = { from: 0.55, yaw: 0.07, rate: 22 }`, `LEAP_PITCH = 0.22`, `LAND_BOUNCE = 0.05`, `EARS_UP = 0.05`, `HEAD_UP = 0.15`. All are first guesses to tune from the recording.

**`late(dt, t, { cat })`** (skip every part override for `cat.userData.breed === 'hagrid'`, as `src/fairlive.js` does, and for any missing part):

- **On a crossing:**
  - The tail is held out: `tail.rotation.x = TAIL_OUT.rootX`.
  - The tail sways: each `tailPivots[i].rotation.y = TAIL_OUT.sway · sin(TAIL_OUT.rate · onTime + i · 0.6)`. Under reduced motion the pivots get 0.
  - She pitches to the rail: `cat.rotation.x = clamp(atan(grade along her facing), ±0.35)`. A positive value raises the nose (`src/ground.js` convention).
  - Now and then she wobbles: with `p = onTime mod WOBBLE.every`, while `p < WOBBLE.len`, `cat.rotation.z += WOBBLE.amp · k · sin(π p / WOBBLE.len) · sin(WOBBLE.rate · onTime)`. `k = steady ? WOBBLE.steady : 1`. There is none under reduced motion.
  - `onTime` counts seconds on the crossing and is reset at a mount.
- **In the crouch:** for `crouchElapsed / crouch ≥ WIGGLE.from`, `cat.rotation.y += WIGGLE.yaw · sin(WIGGLE.rate · crouchElapsed)`. There is none under reduced motion.
- **In the air (leaps only):** `cat.rotation.x = LEAP_PITCH · (1 − 2s)`. It is 0 under reduced motion.
- **In the land phase:** `cat.position.y += LAND_BOUNCE · sin(π · tau)`. There is none under reduced motion.
- **Looking:** `earL.rotation.z = EARS_UP`, `earR.rotation.z = −EARS_UP` and `head.rotation.x = −HEAD_UP`. This is a pose, so it applies under reduced motion too.
- **Otherwise:** write nothing.

- [ ] **Step 1: Write the failing tests** (use `buildCat('tabby')` and `buildCat('hagrid')` from `src/cat/model.js` under the document stub; `yardWalk({ cat })` takes it)

```js
describe('how she looks', () => {
  it('holds her tail out and sways it on a crossing; still under reduced motion', () => { /* … */ });
  it('wobbles now and then, less with Tightrope Tail, never under reduced motion', () => {
    const maxRoll = (opts) => { const w = yardWalk({ ...opts, at: [-9.0, -13], face: [1, 0], cat: buildCat('tabby') }); w.push(1, 0); let m = 0; for (let i = 0; i < 300; i++) { w.frame(); if (w.live.crossing) m = Math.max(m, Math.abs(w.cat.rotation.z)); } return m; };
    expect(maxRoll({})).toBeGreaterThan(WOBBLE.amp * 0.5);
    expect(maxRoll({ abilities: () => ({ ...BASE_ABILITIES, steady: true }) })).toBeLessThanOrEqual(WOBBLE.amp * WOBBLE.steady + 1e-9);
    expect(maxRoll({ reducedMotion: true })).toBe(0);
  });
  it('leans nose-up walking up the leaning plank', () => { /* plank-2 westward: rotation.x > 0.2 mid-plank */ });
  it('wiggles before the leap, pitches through it, bounces on landing; none of it with reduced motion', () => { /* … */ });
  it('pricks her ears looking across; Hagrid’s parts are left alone', () => { /* tabby: earL.rotation.z === EARS_UP; hagrid: no throw, ears equal to before late */ });
  it('writes nothing when she is on the ground away from every move', () => { /* snapshot rotation, position and each part's rotation before and after late: equal */ });
});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/traversallive.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement `late`.**
- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run test/traversallive.test.js`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/traversallive.js test/traversallive.test.js
git commit -m "Traversal step 1: the balancing look (tail out, careful wobble), the bottom wiggle, the leap's lean and the landing bounce"
```

---

### Task 8: Into the game, inert everywhere today

**Files:**
- Modify: `src/game/session.js` (`FIELDS`, beside `['fair', …]`, line 102)
- Modify: `src/game/walk.js`:
  - the imports;
  - after the `fairLive` block (line 1346), build the runtime;
  - `createSession({ …, fair: fairLive, traversal: traversalLive, … })` (line 1522);
  - `session.traversal?.dispose();` beside `session.fair?.dispose();` (line 2539).
- Modify: `src/main.js`. Right before `player.update(dt, session.areaData.colliders, …)` (line 1021) add `session.traversal.update(dt, t, { cat: session.cat, player, session });`. Right after `session.fair.late(dt, t, { cat: session.cat, player, session });` (line 1351) add `session.traversal.late(dt, t, { cat: session.cat, player, session });`.
- Modify: `src/game/avatar.js`:
  - line 170: `const speed = s.chasing ? CHASE_GAIT_SPEED : s.fight ? (s.fightGait ?? 0) : s.traversal?.busy ? s.traversal.speed : player.speed;`
  - after `if (s.freezeTime > 0) pose = 'scared';` (line 215): `else if (s.traversal?.pose) pose = s.traversal.pose;`
- Modify: `src/game/interactions.js`:
  - in `doPounceOrClimb`, right after the `session.fair?.jump(...)` block (line 223): `if (session.traversal?.jump({ cat: session.cat, player, session })) { bus.emit('guide:did', { what: 'pounce' }); return; }`
  - in `updateInteractions`, right after the fight's early return (line 803), the same shape: `if (s.traversal?.busy) { setPrompt(null); s.lastPromptKind = null; return; }`. With a comment: "no prompts on a plank or in the air: what is near her in x, z is a floor below".
- Modify: `src/game/walkresume.js` line 88: `const down = session.fair?.groundSpot?.() ?? session.traversal?.groundSpot?.() ?? null;`
- Test: `test/traversalwiring.test.js`

**Interfaces:**
- Consumes: Tasks 5 and 6; `moveAbilities` (Task 1).
- Produces:
  - The walk.js line: `const traversalLive = areaData.traversal ? createTraversalLive(areaData.traversal, { ground, reducedMotion, abilities: () => moveAbilities(progression.state), onEvent: (e) => traversalEventEffects(e, { audio, fx: session.fx, cat, bus }) }) : NO_TRAVERSAL;`
  - The session field: `['traversal', 'the balance walk, leaps, drops and climb-ups (traversallive.js), or NO_TRAVERSAL where the area places none']`.
  - `session.fx` is read when an event fires, after `session` exists. Comment that.

- [ ] **Step 1: Write the failing tests** (`test/traversalwiring.test.js`)

```js
it('the session has a traversal field', () => expect(SESSION_FIELDS).toContain('traversal'));
it('walk.js builds it only for an area that places moves, and disposes it', () => {
  expect(walk).toMatch(/const traversalLive = areaData\.traversal \? createTraversalLive\(areaData\.traversal, \{/);
  expect(walk).toMatch(/: NO_TRAVERSAL;/);
  expect(walk).toMatch(/traversal: traversalLive,/);
  expect(walk).toContain('session.traversal?.dispose();');
});
it('main.js runs it before the player moves and touches her up after she is posed', () => {
  const up = main.indexOf('session.traversal.update(dt, t, { cat: session.cat, player, session });');
  const move = main.indexOf('player.update(dt, session.areaData.colliders');
  expect(up).toBeGreaterThan(main.indexOf('if (player.engaged) {')); expect(up).toBeLessThan(move);
  expect(main.indexOf('session.traversal.late(')).toBeGreaterThan(main.indexOf('session.fair.late('));
});
it('no shipped area places moves yet', () => {
  for (const f of readdirSync(new URL('../src/world/', import.meta.url)).filter((n) => n.endsWith('.js') && n !== 'traversalyard.js')) {
    expect(read(`world/${f}`), f).not.toMatch(/\btraversal\s*:/);
  }
});
describe('the avatar', () => { /* the pounce.test.js avatarHarness, copied:
  s.traversal = { busy: true, pose: 'stalk', speed: 1.1 } → s.pose 'stalk', s.idleTime 0;
  with s.freezeTime 1 → 'scared'; with NO_TRAVERSAL and with s.traversal undefined → 'follow' as before */ });
describe('the jump button', () => { /* interactions.test.js climbHarness, copied, with a perch in reach:
  traversal.jump → true: no perch taken, no pounce, guide:did emitted;
  → false: the perch is taken as before; fair.jump → true: traversal.jump never called */ });
it('no prompts while she is on a crossing or in the air', () => { /* groundsystems levelHarness, copied (HEIGHT_FIXTURE): at (8, 4.6)
  with the gift-leave scenic → prompt set; with session.traversal = { busy: true } → prompt null and the last setPrompt(null) */ });
it('walkresume notes the ground spot', () => { /* snapshotWalk with fair absent and traversal.groundSpot() → {x:-8.4,z:-13}: note x,z equal it */ });
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/traversalwiring.test.js`. Expected: FAIL.
- [ ] **Step 3: Make the seven edits above.**
- [ ] **Step 4: Run them to see them pass, and that nothing shipped moved.** Run `npx vitest run test/traversalwiring.test.js test/session.test.js test/interactions.test.js test/pounce.test.js test/avatarwater.test.js test/groundsystems.test.js test/walkresume.test.js test/flattrace.test.js test/gorgerock-guard.test.js`. Expected: PASS. `git status` shows no change under `test/fixtures/`.
- [ ] **Step 5: Commit.**

```bash
git add src/game/session.js src/game/walk.js src/main.js src/game/avatar.js src/game/interactions.js src/game/walkresume.js test/traversalwiring.test.js
git commit -m "Traversal step 1: wire the moves into the walk (jump button, frame order, pose, prompts, resume); every shipped area keeps NO_TRAVERSAL"
```

---

### Task 9: The yard drawn, its two tours, and the autopilot

**Files:**
- Modify: `src/world/traversalyard.js` (add `buildTraversalYard`, `YARD_TOURS`, `createYardPilot`)
- Test: `test/traversalyard.test.js`

**Interfaces:**
- Consumes:
  - `litMaterial` from `src/render/materials.js`.
  - The traversal API, through the `live` it is handed. It never imports `traversallive.js`, so the "before" page can run with `NO_TRAVERSAL`.
  - `stickToWorld`, `behindYaw` and `easeYawToward` from `src/traversal.js`.
- Produces:
  - **`buildTraversalYard(scene) → yardArea() + { meshes }`.** It draws with shared geometries:
    - each rectangle as a box from y 0 to its top;
    - discs as cylinders (the tank, the chimney stack from 0 to 3.5 with a pot);
    - the house block plus a pitched roof prism (eaves 1.0, ridge 3.5 along z = −11);
    - the fire escape as a sloped box with step lines;
    - planks as 0.3 m-wide, 0.05 m-thick boxes per segment;
    - the line as a thin tube with two posts and three hanging cloth quads;
    - a ridge cap on the ridge;
    - a 60 m ground plane.
    - Marks, as flat discs r 0.35 at 0.01 over the ground: take-off amber `0xf0a640`, landing pale `0xf4ead0`, drop spot blue `0x6aa0d8`, climb spot green `0x7cc46a`. Real marks are step 2's art.
  - **`YARD_TOURS = { climbs, leaps }`.** Each is `{ start: { x, z, face: [fx, fz] }, steps }`. A step is one of:
    - `{ say: 'caption' }`;
    - `{ walk: [x, z] }` (arrive within 0.3 m and not busy);
    - `{ jump: true }` (press once, wait until not busy and not looking, then 0.3 s);
    - `{ wait: s }`;
    - `{ abilities: { … } }`.
  - **`createYardPilot(tour, { setAbilities }) → { step(dt, { cat, player, live, ctx }) → { done, failed, caption } }`.**
    - It steers by `setTouchMove` toward the walk target: the world direction is turned with `stickToWorld(dir, −viewYaw)`, `mag` 1.
    - While she walks on the ground, it eases the view to behind her (`easeYawToward`, rate 2, max 1.5): a cinematic camera for the recording.
    - A step that takes longer than 20 s sets `failed` to its index and `done` to true.

**The two tours** (captions are page-only English for the owner):
- **`climbs`** (from (0, 14) facing north):
  1. say "A climb-up onto the shed"; walk (−12, 9.0); jump.
  2. walk (−14, −1.8); jump.
  3. walk (−14, −4.1); jump.
  4. say "The plank: a balance walk"; walk (−9.0, −13); walk (−4.6, −13); wait 0.8.
  5. say "She can stop and turn round"; walk (−6.0, −13); wait 0.6; walk (−1.2, −13).
  6. say "Along the washing line"; walk (−1.4, −9); walk (−8.8, −9).
  7. say "Down in steps"; walk (−12, −6.6); jump; walk (−8.6, 2); jump.
- **`leaps`** (from (2, −10) facing east):
  1. say "Along the ridge to the chimney"; walk (6.8, −11) (outside `MOUNT_R` of the ridge's end, so she does not get on early); walk (13.6, −11); wait 1.0; walk (7.0, −11).
  2. say "Leap!"; walk (3, −6.6); jump.
  3. say "Leap down"; walk (7.4, 0); jump.
  4. say "Too far for her yet: she looks across"; walk (14, 3.4); jump; wait 1.6.
  5. say "With Long Leap"; abilities { longLeap: true }; jump.
  6. say "Down to the yard"; walk (14, 13.4); jump.

- [ ] **Step 1: Write the failing tests** (add to `test/traversalyard.test.js`; the drawing test needs the document stub and `yardWalk`)

```js
it.each(['climbs', 'leaps'])('the %s tour runs to its end on the real player and runtime', (name) => {
  const tour = Y.YARD_TOURS[name];
  let abilities = BASE_ABILITIES;
  const w = yardWalk({ at: [tour.start.x, tour.start.z], face: tour.start.face, abilities: () => abilities });
  const pilot = Y.createYardPilot(tour, { setAbilities: (a) => { abilities = { ...BASE_ABILITIES, ...a }; } });
  let r; let frames = 0;
  do { r = pilot.step(1 / 30, w); w.frame(1 / 30); frames++; } while (!r.done && frames < 30 * 90);
  expect(r.failed ?? null).toBeNull();
  const kinds = w.events.map((e) => `${e.type}:${e.id ?? e.kind}`);
  if (name === 'climbs') expect(kinds).toEqual(expect.arrayContaining(['climb:climb-1', 'climb:climb-2', 'climb:climb-3', 'cross:plank-1', 'cross:line-1', 'drop:drop-1', 'drop:drop-4']));
  else expect(kinds).toEqual(expect.arrayContaining(['cross:ridge-1', 'leap:gap-1', 'leap:gap-2', 'look:gap-3', 'leap:gap-3', 'drop:drop-3']));
  expect(w.area.ground.y(w.cat.position.x, w.cat.position.z)).toBe(0); // back in the yard
  expect(frames / 30).toBeLessThan(60);
});
it('draws each roof with its top at its ground height, and a mark for each spot', () => { /* box tops vs YARD_GROUND y; marks count = 2 × hops */ });
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/traversalyard.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement the three exports.** If a tour step fails, move its waypoint, never a rule, and note it.
- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run test/traversalyard.test.js`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/world/traversalyard.js test/traversalyard.test.js
git commit -m "Traversal step 1: the yard drawn, and two scripted tours (climbs and crossings; leaps and drops) proven on the real player"
```

---

### Task 10: The picture page, the recorder, the pictures and the recordings

**Files:**
- Create: `verify-traversal.html`
- Create: `scripts/record-page.mjs`
- Create: `test/recordpage.test.js`
- Modify: `.gitignore` (after `!verify-visits.html`: a comment line plus `!verify-traversal.html`)

**Interfaces:**
- Consumes: Tasks 5–9; the rig as `verify-places.html` builds it:
  - `buildEnvMap`, `setTextureTier`;
  - `createSun`, `createFill`, `SUN_BIAS`, `assignShadowCasters`;
  - `createShadowFit(sun, camera, { radius: 20, mapSize: 2048 })`, updated each frame as `main.js` does: `shadows.update(ground.y(cat.x, cat.z), dt)`;
  - `buildCat`, `animateCat`, `createPlayer`, `pounceArc`.
- Produces:
  - **The page**, `verify-traversal.html`. URL parameters:
    - `traversal=0` (the "before": `NO_TRAVERSAL`, and the jump is the ordinary pounce);
    - `rm=1`;
    - `abilities=longleap,steady,spring`;
    - `tour=climbs|leaps` (autoplay in real time);
    - `drive=1` (no rAF loop; `__frame` drives);
    - `size=WxH` (default 960x540);
    - `bare` (no HUD).
    - Its window API is `__ready`, `__shot(name) → name`, `__tour(name)`, `__frame() → { done, caption }` (one fixed 1/30 s step plus a render) and `__snap(q)` (a JPEG data URL).
    - Keyboard play works: the arrows or W-A-S-D, and Space for the jump.
  - **The recorder**, `scripts/record-page.mjs`. `node scripts/record-page.mjs --url <url> --out <dir> (--shots a,b | --tour <name>) [--size 960x540] [--fps 30] [--max-frames 2700] [--chrome <path>]`. It exports `parseArgs(argv)` and `ffmpegArgs(framesDir, fps, outFile)`, and runs `main()` only when it is the entry script (the `scripts/smoke.mjs` pattern).

**The page's frame** (as `main.js` orders it):
1. `live.update`;
2. `player.update(dt, area.colliders, area.bounds, [])`;
3. `animateCat(cat, pageJump > 0 ? 'pounce' : live.pose ?? 'follow', t, live.busy ? live.speed : player.speed, rm)`;
4. `cat.rotation.x = 0; cat.rotation.z = 0`;
5. `live.late`;
6. `shadows.update`;
7. render.

**The shots** (each sets the cat at a start, facing its way, with the view behind her, then runs a press or push and stops at a condition on the runtime's state):

| shot | URL extra | start, face | does | stops when |
|---|---|---|---|---|
| before-plank | `traversal=0` | (−9.2, −13), east | push east | 1.5 s |
| plank | | (−9.2, −13), east | push east | on `plank-1`, progress ≥ 0.5 |
| plank-lean | | (−2.2, 6), west | push west | on `plank-2`, progress ≥ 0.5 |
| line | | (−1.0, −9), west | push west | on `line-1`, progress ≥ 0.5 |
| ridge | | (7.0, −11), east | push east | on `ridge-1`, progress ≥ 0.6 |
| before-climb | `traversal=0` | (−12, 9.4), north | jump | 0.15 s |
| climb | | (−12, 9.4), north | jump | air, progress ≥ 0.6 |
| crouch | | (3, −7.0), south | jump | crouch, 0.35 s in |
| leap | | (3, −7.0), south | jump | air, progress ≥ 0.5 |
| land | | (3, −7.0), south | jump | phase land |
| leap-down | | (7.0, 0), east | jump | air, progress ≥ 0.5 |
| look | | (14, 3.2), south | jump | look, 0.5 s in |
| long-leap | `abilities=longleap` | (14, 3.2), south | jump | air, progress ≥ 0.5 |
| drop | | (−12, −7.0), south | jump | air, progress ≥ 0.6 |

**The recorder:**
1. It spawns Chrome headless: `--headless=new --remote-debugging-port=0 --user-data-dir=<tmp> --window-size=W,H --ignore-gpu-blocklist`.
2. It reads the port from `<tmp>/DevToolsActivePort`, opens the page with `PUT /json/new?<url>` and speaks CDP over the global `WebSocket`, using `Runtime.evaluate` (`awaitPromise`, `returnByValue`) and `Page.captureScreenshot`.
3. It waits for `__ready`.
4. With `--shots`, for each name: `__shot(name)`, then a PNG to `<out>/<name>.png`.
5. With `--tour`: `__tour(name)`, then `__frame()` and a JPEG (q 85) to `<out>/<tour>-frames/f00001.jpg`, until `done`. Then it runs ffmpeg with `ffmpegArgs` (`-y -framerate <fps> -i <dir>/f%05d.jpg -c:v libx264 -pix_fmt yuv420p -crf 20 <out>/<tour>.mp4`).
6. It always kills Chrome in `finally`.

- [ ] **Step 1: Write the failing tests** (`test/recordpage.test.js`)

```js
import { parseArgs, ffmpegArgs } from '../scripts/record-page.mjs';
it('reads its arguments with defaults', () => {
  expect(parseArgs(['--url', 'http://localhost:5371/verify-traversal.html?drive=1', '--out', '/tmp/x', '--tour', 'climbs']))
    .toMatchObject({ tour: 'climbs', shots: [], size: { w: 960, h: 540 }, fps: 30, maxFrames: 2700 });
  expect(parseArgs(['--url', 'u', '--out', 'o', '--shots', 'a,b', '--size', '640x360']).shots).toEqual(['a', 'b']);
});
it('refuses a run with neither shots nor a tour, or with both, or without --url/--out', () => { /* throws, 4 cases */ });
it('builds the ffmpeg line', () => expect(ffmpegArgs('/d', 30, '/o/t.mp4')).toEqual(['-y', '-framerate', '30', '-i', '/d/f%05d.jpg', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '/o/t.mp4']));
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/recordpage.test.js`. Expected: FAIL (no script).
- [ ] **Step 3: Write `scripts/record-page.mjs`, `verify-traversal.html` and the `.gitignore` lines.** The page's header comment lists its parameters and its window API, as `verify-catbody.html` does.
- [ ] **Step 4: Run them to see them pass.** Run `npx vitest run test/recordpage.test.js`. Expected: PASS.
- [ ] **Step 5: Look at the page.**
  - Start Vite in the worktree on a free port, as a background job: `npx vite --port 5371 --strictPort`. Other agents use 5174 and 5361.
  - Open `http://localhost:5371/verify-traversal.html` in the Browser pane.
  - Expected: no console errors; `__ready === true`; the yard drawn; the arrows walk her, the plank takes her, and Space leaps at the amber mark.
- [ ] **Step 6: Make the pictures and the recordings** into `<scratchpad>/rooftops-step1/` (the session's scratchpad directory; not committed).
  - Every shot except the two `before-` ones: `node scripts/record-page.mjs --url 'http://localhost:5371/verify-traversal.html?drive=1&bare' --out <dir> --shots plank,plank-lean,line,ridge,climb,crouch,leap,land,leap-down,look,drop`.
  - The two `before-` shots: the same with `&traversal=0`.
  - `long-leap`: the same with `&abilities=longleap`.
  - The tours: `--tour climbs` and `--tour leaps`. Expected: `climbs.mp4` and `leaps.mp4`, each 20–45 s.
  - The contact sheet: `ffmpeg -y -pattern_type glob -i '<dir>/*.png' -filter_complex "scale=480:-1,tile=4x4" <dir>/sheet.png`. The tiles are in alphabetical order of the shot names, so list that order in the hand-off.
  - Look at every picture and at frames from both films: no cat inside a roof, no camera inside a wall, the balance pose readable.
  - Fix and re-run anything that is wrong before going on.
- [ ] **Step 7: Commit.**

```bash
git add verify-traversal.html scripts/record-page.mjs test/recordpage.test.js .gitignore
git commit -m "Traversal step 1: the yard's picture page and a headless recorder (shots and frame-by-frame films)"
```

- [ ] **Step 8: The full suite.** Check `uptime` against `sysctl -n hw.ncpu` (see Global Constraints), then run `npx vitest run`.
  - Expected: every file passes.
  - `git status --short test/fixtures` prints nothing.
  - Also run `npm run build`. Expected: success, and `dist/` has no `traversalyard` chunk, because nothing in the game imports the yard.
- [ ] **Step 9: Hand-off report** (to the agent that launched this plan; no file). It covers:
  - the commit list;
  - the picture and recording paths;
  - the knobs the owner may want changed, with their current values: `BALANCE_SPEED`, `WOBBLE`, `TAIL_OUT`, `HOP.leap.hang`, `HOP.leap.crouch`, `HOP.drop.air`, `CAM_TURN_MAX`;
  - every waypoint or yard record the tests made the implementer move;
  - what was not tried: a real device, touch, a co-walk.

---

## Self-review (done while writing)

**Spec coverage.**
- Crossings as data: Task 1. Balance walk: Task 5. Camera: Task 5. Balancing look: Task 7.
- Gaps, take-off, always lands, look across: Tasks 1, 2, 6.
- Drop spots, drops in steps of ≤ 3 m, climb-ups within 1.6 / 2.2: Tasks 1, 2, 6.
- "Never stuck (a test)": Task 3's flood, which step 2 reuses.
- Learning: the abilities seam (Task 1), `steady` (Tasks 5, 7), `longLeap` (Task 6), the tally events `cross` and `leap` (Tasks 5, 6). The two catalog entries are step 4.
- The small picture page with planks, a ridge, a washing line, three gaps and two levels joined by drops: Tasks 3, 9, 10. Before/after pictures and recordings: Task 10.
- Determinism: Task 6. Reduced motion: Tasks 5–7. Offline-first and no text: Global Constraints.
- Deliberately not here: marks as art, the place, birds, two-player height, the skills' catalog entries and feats, hints. They belong to steps 2–4.

**Types.**
- `createTraversal → { crossings, hops }` is used by Tasks 2, 3, 5, 6 and 9.
- `Plan` and `hopAt`'s `out` are only inside `traversallive.js`.
- `abilities()` is always a function returning `{ steady, longLeap, climb }`: in `yardWalk`, `createTraversalLive`, the walk wiring and the page.
- `progress`, `phase`, `pose` and `speed` getters are defined in Task 5 and used in Tasks 8–10.

**Proportion.** The tests are named with their key assertions, not written out in full. The only bodies given are formulas the signatures do not fix: the arc, the hang warp, the balance step and the camera ease.
