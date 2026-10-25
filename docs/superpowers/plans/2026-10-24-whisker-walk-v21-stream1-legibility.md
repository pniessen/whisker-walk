# Whisker Walk v21 — Stream 1: Legibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every quest objective findable by scent and by a visible beacon, with a distance readout, so no objective is ever a blind search.

**Architecture:** A new DOM-free, three-free leaf module (`src/questscent.js`) owns the policy decisions — how warm the trail is, how often it re-lays, what the HUD prints. `game/interactions.js` calls it once a frame from `updateSenses` and renders through the existing `scent.trailTo`, so the quest trail looks like the nose trail the game already draws rather than a second visual language. A beacon mesh at the quest target replaces the current 10-metre pop-in reveal. `ui/hud.js` gains an optional distance argument on `setObjective`.

**Tech Stack:** Three.js ~0.185, Vite 8, Vitest 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-24-whisker-walk-v21-reason-to-come-back-design.md` (Stream 1, items 1.1–1.3; §9 items 10 and the distance-readout call; §4 anti-goals)

## Scope

This plan covers **Stream 1 only**, minus items 1.4 (lock copy) and 1.5 (area thumbnails), which are `ui/homebase.js` and `thumbnails.js` edits and move to the Track C plan to avoid conflicting with the Stream 5 start-screen rebuild. See the spec's §10 track table.

The spec covers six streams. Per the scope rule, each gets its own plan so each produces working, testable software on its own. This is plan 1 of 6. Streams 2, 3, 4, 5 and 6 are not in this document.

## Global Constraints

- No new dependencies. Three.js, Vite, Vitest, Supabase only.
- Pure logic lives in DOM-free, three-free leaf modules so it is unit-testable headless. `src/questscent.js` must import nothing.
- Determinism: anything derived from the `(date, area)` seed must agree across devices in a co-walk. The quest trail draws jitter from the shared `walkRng` via `scent.trailTo`.
- `SAVE_VERSION` stays 4. This stream adds no save state.
- Two render tiers only; `render/quality.js` is the single place a tier is decided. This stream adds no tier knob.
- Anti-goal (spec §4): recoverable, funny, never retroactive. Nothing here may punish.
- Anti-goal (spec §9.10): the trail must **not** be gated behind stalking, and only one trail may be attributable to the active quest.
- `npm test` must pass; the deploy workflow runs it before building.

## Review Focus

Five conditions the spec implies that no task's happy path exercises. Each has its test added to the owning task.

1. **No quest on this walk.** Den walks have no villager, so `s.quest` is `null` and `s.questObject` is `null`. Every new per-frame call must no-op rather than throw. — Task 2.
2. **Cat standing on the target.** Distance ≈ 0 must not divide by zero, emit `NaN` warmth, or print `"NaN m"`. — Tasks 1 and 4.
3. **Quest completed mid-walk.** State flips to `complete`; the trail must stop re-laying, the beacon must hide, and the HUD distance must clear rather than freeze at its last value. — Tasks 2 and 3.
4. **Twitchy Nose active at the same time as a quest.** Two trails exist at once. They must be visually distinguishable, or the player follows the wrong one. — Tasks 1 and 2 (the `QUEST_TRAIL_COLOR` assertion in Task 1, the `trailTo` colour round-trip in Task 2).
5. **Reduced motion.** `prefers-reduced-motion` already drops rain particles and the body bob, and forces the `LOW` tier. The trail is the fairness fix, so it must still be laid — reduced, not removed. — Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/questscent.js` | **New.** Pure policy: trail warmth, re-lay cadence, HUD distance text. Imports nothing. |
| `test/questscent.test.js` | **New.** Unit tests for the above. |
| `src/scent.js` | **Modify.** `trailTo` gains a `color` option so the quest trail can be told apart from the nose trail. |
| `src/game/interactions.js` | **Modify.** `updateSenses` lays the quest trail; `updateInteractions` drops the glasses-only 10m reveal. |
| `src/game/walk.js` | **Modify.** Build the beacon at the quest target. |
| `src/quests.js` | **Modify.** Objective copy: remove the letter quest's now-redundant parenthetical. |
| `src/ui/hud.js` | **Modify.** `setObjective(text, meters)`. |
| `verify-questtrail.html` | **New, gitignored.** Visual harness for the trail and beacon. |

---

### Task 1: Quest-scent policy module

**Files:**
- Create: `src/questscent.js`
- Test: `test/questscent.test.js`

**Interfaces:**
- Consumes: nothing. This module imports nothing.
- Produces:
  - `scentWarmth(dist: number, opts?: { near?: number, far?: number }) -> number` — 0..1. Returns 1 at or inside `near` (default 4), 0 at or beyond `far` (default 60), linear between. Non-finite or negative `dist` returns 0.
  - `trailCadence(dist: number, opts?: { hot?: number, cold?: number }) -> number` — seconds until the next trail should be laid. `hot` (default 1.2) when warm, `cold` (default 4) when cold, interpolated by `scentWarmth`. Never returns 0 or a non-finite number.
  - `objectiveDistance(dist: number) -> string | null` — `null` for non-finite or negative input; `"here"` below 2; otherwise `"<n> m"` with `n` rounded to a whole number.
  - `QUEST_TRAIL_COLOR: number` — `0x7fd4ff`, deliberately not `scent.js`'s `0xf2e04e` nose yellow.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import { scentWarmth, trailCadence, objectiveDistance, QUEST_TRAIL_COLOR } from '../src/questscent.js';

describe('scentWarmth', () => {
  it('is 1 at or inside near, 0 at or beyond far, and between in between', () => {
    expect(scentWarmth(0)).toBe(1);
    expect(scentWarmth(4)).toBe(1);
    expect(scentWarmth(60)).toBe(0);
    expect(scentWarmth(200)).toBe(0);
    const mid = scentWarmth(32);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('warms monotonically as the cat closes in', () => {
    expect(scentWarmth(10)).toBeGreaterThan(scentWarmth(40));
  });

  it('returns 0 for hostile input rather than NaN', () => {
    for (const bad of [NaN, Infinity, -1, undefined, null, '12']) {
      expect(scentWarmth(bad)).toBe(0);
    }
  });
});

describe('trailCadence', () => {
  it('re-lays sooner when warm than when cold', () => {
    expect(trailCadence(0)).toBeLessThan(trailCadence(60));
  });

  it('never returns zero or a non-finite interval', () => {
    for (const d of [0, 4, 32, 60, 500, NaN, -1]) {
      const c = trailCadence(d);
      expect(Number.isFinite(c)).toBe(true);
      expect(c).toBeGreaterThan(0);
    }
  });
});

describe('objectiveDistance', () => {
  it('reads "here" on top of the target and whole metres otherwise', () => {
    expect(objectiveDistance(0)).toBe('here');
    expect(objectiveDistance(1.9)).toBe('here');
    expect(objectiveDistance(23.4)).toBe('23 m');
    expect(objectiveDistance(23.6)).toBe('24 m');
  });

  it('returns null for hostile input rather than "NaN m"', () => {
    for (const bad of [NaN, Infinity, -1, undefined, null]) {
      expect(objectiveDistance(bad)).toBe(null);
    }
  });
});

describe('QUEST_TRAIL_COLOR', () => {
  it('is not the nose-trail yellow', () => {
    expect(QUEST_TRAIL_COLOR).not.toBe(0xf2e04e);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/questscent.test.js`
Expected: FAIL — cannot resolve `../src/questscent.js`.

- [ ] **Step 3: Implement the four exports in `src/questscent.js`**

Guard every incoming number through a single local `finiteNonNeg(v)` helper, the same defensive shape `progression.js`'s `asFiniteNonNeg` uses, so one guard covers all three functions — note it must reject non-numbers such as `'12'`, not coerce them. `scentWarmth` must return 1 at exactly `near` and 0 at exactly `far`, so write the clamp with both endpoints inclusive.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/questscent.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/questscent.js test/questscent.test.js
git commit -m "feat(quests): pure scent-policy module for objective tracking

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Lay the quest scent trail

**Files:**
- Modify: `src/scent.js` — `trailTo`'s options
- Modify: `src/game/interactions.js` — `updateSenses` (around line 340) and `updateInteractions` (around line 503)
- Test: `test/questscent.test.js` (extend), `test/scent.test.js` (extend)

**Interfaces:**
- Consumes: `scentWarmth`, `trailCadence`, `QUEST_TRAIL_COLOR` from Task 1.
- Produces:
  - `scent.trailTo(from, to, opts)` gains `color` in `opts`, defaulting to the existing nose yellow so every current caller is byte-identical.
  - `questTrailStep({ quest, scent, catPos, since, reducedMotion }) -> { laid: boolean, endpoint: {x,z} | null }` exported from `src/questscent.js` — the per-frame decision, pure apart from the `scent` handle it is given. `since` is the accumulated seconds since the last lay, owned by the caller. `reducedMotion` is optional and defaults to `false`.

- [ ] **Step 1: Write the failing tests**

```js
// test/questscent.test.js — appended
import { questTrailStep } from '../src/questscent.js';

const stubScent = () => {
  const calls = [];
  return { calls, trailTo: (from, to, opts) => { calls.push({ from, to, opts }); return to; } };
};
const activeQuest = () => ({ state: 'active', type: 'glasses', target: { x: 40, z: 0 } });

describe('questTrailStep', () => {
  it('lays a trail toward the target once the cadence has elapsed', () => {
    const scent = stubScent();
    const r = questTrailStep({ quest: activeQuest(), scent, catPos: { x: 0, z: 0 }, since: 99 });
    expect(r.laid).toBe(true);
    expect(scent.calls).toHaveLength(1);
    expect(scent.calls[0].opts.color).toBe(QUEST_TRAIL_COLOR);
  });

  it('does not lay again before the cadence has elapsed', () => {
    const scent = stubScent();
    const r = questTrailStep({ quest: activeQuest(), scent, catPos: { x: 0, z: 0 }, since: 0 });
    expect(r.laid).toBe(false);
    expect(scent.calls).toHaveLength(0);
  });

  // Review Focus 1
  it('no-ops when there is no quest on this walk', () => {
    const scent = stubScent();
    for (const quest of [null, undefined]) {
      expect(questTrailStep({ quest, scent, catPos: { x: 0, z: 0 }, since: 99 }).laid).toBe(false);
    }
    expect(scent.calls).toHaveLength(0);
  });

  // Review Focus 3
  it('no-ops for an offered or completed quest', () => {
    const scent = stubScent();
    for (const state of ['offered', 'complete']) {
      const quest = { ...activeQuest(), state };
      expect(questTrailStep({ quest, scent, catPos: { x: 0, z: 0 }, since: 99 }).laid).toBe(false);
    }
    expect(scent.calls).toHaveLength(0);
  });

  // Review Focus 2
  it('no-ops when the cat is standing on the target', () => {
    const scent = stubScent();
    const quest = { ...activeQuest(), target: { x: 0, z: 0 } };
    expect(questTrailStep({ quest, scent, catPos: { x: 0, z: 0 }, since: 99 }).laid).toBe(false);
  });

  it('survives a scent handle with no trailTo', () => {
    const quest = activeQuest();
    expect(() => questTrailStep({ quest, scent: null, catPos: { x: 0, z: 0 }, since: 99 })).not.toThrow();
    expect(() => questTrailStep({ quest, scent: {}, catPos: { x: 0, z: 0 }, since: 99 })).not.toThrow();
  });

  // Review Focus 5 — reduced motion REDUCES the trail, never removes it:
  // the trail is the fairness fix this whole stream exists to ship.
  it('still lays a trail under reduced motion, with fewer prints', () => {
    const plain = stubScent();
    const reduced = stubScent();
    const at = { quest: activeQuest(), catPos: { x: 0, z: 0 }, since: 99 };
    expect(questTrailStep({ ...at, scent: plain }).laid).toBe(true);
    expect(questTrailStep({ ...at, scent: reduced, reducedMotion: true }).laid).toBe(true);
    expect(reduced.calls[0].opts.steps).toBeLessThan(plain.calls[0].opts.steps);
    expect(reduced.calls[0].opts.steps).toBeGreaterThan(0);
  });
});
```

```js
// test/scent.test.js — appended to the createScent describe
it('trailTo passes a custom colour through to its decals and defaults to nose yellow', () => {
  const added = [];
  const sc = { add: (o) => added.push(o), remove() {} };
  const scent = createScent(sc, AREA, () => 0.4);
  added.length = 0;
  scent.trailTo({ x: 0, z: 0 }, { x: 5, z: 0 }, { color: 0x7fd4ff });
  expect(added.some((o) => o.material?.color?.getHex?.() === 0x7fd4ff)).toBe(true);
  added.length = 0;
  scent.trailTo({ x: 0, z: 0 }, { x: 5, z: 0 });
  expect(added.some((o) => o.material?.color?.getHex?.() === 0xf2e04e)).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/questscent.test.js test/scent.test.js`
Expected: FAIL — `questTrailStep` is not exported; `trailTo` ignores `color`.

- [ ] **Step 3: Thread `color` through `scent.js`**

`layTrail` already accepts `color` and defaults it to `0xf2e04e`. Add `color` to `trailTo`'s destructured options with that same default and pass it down. No other change in this file.

- [ ] **Step 4: Implement `questTrailStep` in `src/questscent.js`**

Return `{ laid: false, endpoint: null }` unless all of: `quest` is truthy, `quest.state === 'active'`, `scent?.trailTo` is a function, the planar distance from `catPos` to `quest.target` is finite and at least 0.5, and `since >= trailCadence(dist)`. Otherwise call `scent.trailTo(catPos, quest.target, { maxDist, steps, peak, color: QUEST_TRAIL_COLOR })` and return its endpoint.

Scale `steps` and `peak` by `scentWarmth(dist)` so the trail thickens as the cat closes in — that gradient is the warmer/colder signal, and it is the whole point of item 1.1. Keep `maxDist` clipped the way `trailTo` already clips the nose trail: a full-length trail "reads as a road, not a scent" (see the comment on `trailTo`), and the player must still walk it.

- [ ] **Step 5: Wire it into `updateSenses` in `src/game/interactions.js`**

Accumulate `since` on the state object (`s.questTrailSince`), add `dt`, call `questTrailStep`, and reset `since` to 0 when `laid` is true. `updateSenses` is already called once a frame from `updateInteractions` (line ~701), so no new call site is needed.

**Review Focus 5 (reduced motion):** the trail is the fairness fix and must still be laid. Reduce it rather than remove it — halve `steps` when the reduced-motion setting is on, matching how rain particles are already dropped rather than the whole weather system.

**Review Focus 4 (two trails at once):** Twitchy Nose keeps its yellow; the quest trail uses `QUEST_TRAIL_COLOR`. Both may be present and are distinguishable by colour, so an earned ability is not suppressed to satisfy the one-trail rule.

- [ ] **Step 6: Drop the glasses-only proximity reveal**

In `updateInteractions` (around line 503), delete the `s.quest.type === 'glasses'` branch that sets `s.questObject.visible` from a 10-metre check. Task 3 replaces it with a beacon. Leave the `collectibleMeshes` reveal loop immediately below it untouched.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS, including the pre-existing `scent`, `quests` and `interactions` suites.

- [ ] **Step 8: Commit**

```bash
git add src/questscent.js src/scent.js src/game/interactions.js test/questscent.test.js test/scent.test.js
git commit -m "feat(quests): track objectives by scent instead of blind search

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Objective beacon, and consistent objective copy

**Files:**
- Modify: `src/game/walk.js:741-785` — the `if (giver)` block
- Modify: `src/quests.js` — `TEXTS.letter.objective`
- Test: `test/quests.test.js` (extend)
- Create: `verify-questtrail.html` (gitignored by the existing `verify-*.html` rule)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `questObject.userData.beacon` — the beacon `THREE.Mesh`, so a later stream can find it without re-deriving it from children.

- [ ] **Step 1: Write the failing test**

```js
// test/quests.test.js — appended
it('no objective text tells the player how to find the target', () => {
  // Every quest now carries a beacon and a scent trail, so per-quest
  // "look for the sparkle" hints are both redundant and inconsistent.
  for (let i = 0; i < QUEST_TYPES.length; i++) {
    const q = createQuest(rngQueue(i / QUEST_TYPES.length + 0.01, 0), SPOTS);
    expect(q.texts.objective).not.toMatch(/sparkle|look for/i);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/quests.test.js`
Expected: FAIL — the letter objective is `'Deliver the letter 📨 (look for the sparkle)'`.

- [ ] **Step 3: Rewrite `TEXTS.letter.objective` in `src/quests.js`**

Exact copy: `'Deliver the letter 📨'`. Do not touch the other two objectives, any `offer`, `prompt` or `done` string, or `QUEST_TYPES`.

- [ ] **Step 4: Build the beacon in `src/game/walk.js`**

Inside the existing `if (giver)` block, after `questObject` is positioned and before `scene.add(questObject)`: add a beacon child to `questObject` — a tall thin emissive marker visible from across the area, following the idiom the quest-giver marker two dozen lines above already uses (`ConeGeometry` + `litMaterial(colour, { emissive })`). Park it on `questObject.userData.beacon`.

The beacon must be tall enough to clear the area's props, since the whole defect being fixed is that the target cannot be seen from a distance. It becomes visible with `questObject` on accept (`interactions.js:878` already sets `questObject.visible = true`), and hides with it on completion (line 884) — **Review Focus 3** is satisfied by the existing lines, so verify them rather than adding new ones.

Draw-call note: this is one mesh per walk, added as a child of an object already in the scene. It does not go through `render/mergeprops.js`, which merges static area props.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Visually verify, because the suite structurally cannot**

Create `verify-questtrail.html` on the pattern of the existing `verify-*.html` harnesses, rendering the Cozy Neighborhood through the real renderer settings with a quest accepted and a beacon at the target. Per `docs/VISUAL-PASS.md`'s open items, the older area harnesses never set `castShadow` and so have never shown shadows — set it in this one.

Confirm by eye: the beacon is findable from across the area, the trail reads as prints rather than a road, and the quest trail is distinguishable from a Twitchy Nose trail.

- [ ] **Step 7: Commit**

```bash
git add src/game/walk.js src/quests.js test/quests.test.js
git commit -m "feat(quests): beacon at the objective, consistent objective copy

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: HUD distance readout

**Files:**
- Modify: `src/ui/hud.js` — `setObjective`
- Modify: `src/game/interactions.js` — the per-frame objective update
- Test: `test/hud.test.js` (create if absent; otherwise extend)

**Interfaces:**
- Consumes: `objectiveDistance` from Task 1.
- Produces: `hud.setObjective(text: string | null, meters?: number | null)` — second argument optional. All three existing call sites (`interactions.js:877`, `interactions.js:883`, `walk.js:1539`) keep working unchanged.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { createHud } from '../src/ui/hud.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="hud"></div>';
});

describe('hud.setObjective', () => {
  it('prints the objective alone when no distance is given', () => {
    const hud = createHud();
    hud.setObjective('Find the lost glasses 👓');
    const el = document.querySelector('#hud-objective');
    expect(el.classList.contains('hidden')).toBe(false);
    expect(el.textContent).toContain('Find the lost glasses');
    expect(el.textContent).not.toMatch(/\bm\b/);
  });

  it('appends a whole-metre distance when given one', () => {
    const hud = createHud();
    hud.setObjective('Find the lost glasses 👓', 23.4);
    expect(document.querySelector('#hud-objective').textContent).toContain('23 m');
  });

  // Review Focus 2
  it('never prints NaN for a hostile distance', () => {
    const hud = createHud();
    for (const bad of [NaN, Infinity, -1]) {
      hud.setObjective('Find it', bad);
      expect(document.querySelector('#hud-objective').textContent).not.toMatch(/NaN|Infinity|-1/);
    }
  });

  // Review Focus 3
  it('clears entirely when the objective is cleared', () => {
    const hud = createHud();
    hud.setObjective('Find it', 23);
    hud.setObjective(null);
    expect(document.querySelector('#hud-objective').classList.contains('hidden')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/hud.test.js`
Expected: FAIL — `setObjective` takes one argument and ignores the second.

If the run fails for want of a DOM, add `// @vitest-environment jsdom` at the top of the file; check whether another suite in `test/` already establishes a DOM environment and follow that precedent rather than introducing a second one.

- [ ] **Step 3: Extend `setObjective` in `src/ui/hud.js`**

Signature `setObjective(text, meters)`. Render the objective and, when `objectiveDistance(meters)` returns non-null, the distance as a separate child element so it can be styled apart from the objective text — use `textContent` on both, never `innerHTML`, matching the escape-at-render discipline `setRoster` documents one method above.

Per the spec's §9 author's call, the nose leads and the number is there for a player who is stuck rather than pushed at one who is not: style it as secondary to the objective text, not as the headline.

- [ ] **Step 4: Feed the distance once a frame from `src/game/interactions.js`**

In `updateInteractions`, while `s.quest?.state === 'active'`, call `hud.setObjective(s.quest.texts.objective, dist)` with the planar cat-to-target distance. `setObjective` is now called every frame, so give it the same unchanged-value early return that `setPrompt` already uses and documents — otherwise it rebuilds DOM nodes sixty times a second.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/hud.js src/game/interactions.js test/hud.test.js
git commit -m "feat(hud): distance readout on the active objective

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Done when

- A glasses or kitten quest can be found from across the area by following prints, with a beacon visible at range and a metre count on the HUD.
- `npm test` passes.
- `verify-questtrail.html` has been looked at, not just run.
- No save state was added and `SAVE_VERSION` is still 4.
