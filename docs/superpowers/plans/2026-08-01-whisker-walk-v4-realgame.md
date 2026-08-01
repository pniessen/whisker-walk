# Whisker Walk v4 "A Real Game" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistent control bar, a populated cat society with named persistent friendships, per-walk challenge goals, an end-of-walk summary, and lifetime rank titles.

**Architecture:** progression.js grows to save-version 3 (migration from v2) with lifetimePoints/bestWalk/friends + RANKS. New `goals.js` (pure, discovery-bus-driven). `straycats.js` reworked for population/names/personalities. HUD gains a control bar, goals panel, and rank chip; home base gains the roster; a summary overlay slots into the endWalk flow.

**Spec:** `docs/superpowers/specs/2026-08-01-whisker-walk-v4-realgame.md` — read it first.

## Global Constraints

- New award values exactly: `goal: 15, jackpot: 40, gift: 10`.
- Save version 3; **version-2 saves migrate** (keep all fields, add `lifetimePoints` = current points, `bestWalk: 0`, `friends: {}`); v1/corrupt → fresh with warn.
- Friendship thresholds: 1 greet = met, 3 = friend, 6 = best friend; greets count once per walk per cat name.
- Ranks: House Cat 0 / Yard Prowler 150 / Street Smart 400 / Neighborhood Legend 900 / Mythical Feline 2000, keyed to `lifetimePoints`.
- Stray population 22/area using `buildCat(breed, accessories, { simple: true })`; final task perf-checks and may drop to 15.
- All tests + `npx vite build` green at every commit. Baseline: 67 tests.

---

### Task 1: Progression v3 — migration, lifetime, friends, ranks

**Files:**
- Modify: `src/progression.js`
- Test: extend `test/progression.test.js`

**Interfaces:**
- Produces: state gains `lifetimePoints`, `bestWalk`, `friends` (`{ [name]: { breed, greets, lastWalk } }`). `addPoints(n)` also accrues `lifetimePoints`. New api:
  - `recordGreet(name, breed, walkStamp) -> 'met'|'friend'|'best'|null` — increments `greets` only if `lastWalk !== walkStamp` (stamps it); returns the level name when a threshold (1/3/6) is crossed this call, else null.
  - `friendLevel(name) -> 'none'|'met'|'friend'|'best'` (greets ≥1/≥3/≥6).
  - `recordWalkScore(points) -> bool` — true (and saves) when it beats `bestWalk`.
  - `RANKS` export `[{at, title}, ...]` and `rankFor(lifetimePoints) -> {title, next}` (`next` = next rank object or null).
- Migration: `version === 2` → spread old state, add the three new fields, set version 3, warn-free.

- [ ] **Step 1: Write failing tests** — extend `test/progression.test.js`:

```js
import { createProgression, CATALOG, RANKS, rankFor } from '../src/progression.js';
```

```js
  it('migrates a v2 save keeping data and adding v3 fields', () => {
    const v2 = {
      version: 2, points: 77,
      walks: { neighborhood: 4, park: 0, seaside: 0 },
      unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
      equipped: { cat: 'siamese', collar: 'bell', outfit: null },
      area: 'neighborhood',
    };
    const p2 = createProgression(fakeStorage({ 'whisker-walk-save': JSON.stringify(v2) }));
    expect(p2.state.points).toBe(77);
    expect(p2.state.equipped.cat).toBe('siamese');
    expect(p2.state.lifetimePoints).toBe(77);
    expect(p2.state.bestWalk).toBe(0);
    expect(p2.state.friends).toEqual({});
    expect(p2.state.version).toBe(3);
  });

  it('accrues lifetimePoints through addPoints and never decreases on buy', () => {
    p.addPoints(50);
    p.buy('cats', 'black'); // costs 45
    expect(p.state.points).toBe(5);
    expect(p.state.lifetimePoints).toBe(50);
  });

  it('tracks friendship levels with one greet per walk per cat', () => {
    expect(p.recordGreet('Pickles', 'tabby', 'walk-1')).toBe('met');
    expect(p.recordGreet('Pickles', 'tabby', 'walk-1')).toBe(null); // same walk: no-op
    expect(p.state.friends.Pickles.greets).toBe(1);
    p.recordGreet('Pickles', 'tabby', 'walk-2');
    expect(p.recordGreet('Pickles', 'tabby', 'walk-3')).toBe('friend'); // 3rd greet
    expect(p.friendLevel('Pickles')).toBe('friend');
    for (const w of ['w4', 'w5']) p.recordGreet('Pickles', 'tabby', w);
    expect(p.recordGreet('Pickles', 'tabby', 'w6')).toBe('best');
    expect(p.friendLevel('Nobody')).toBe('none');
  });

  it('records best walk scores', () => {
    expect(p.recordWalkScore(30)).toBe(true);
    expect(p.recordWalkScore(20)).toBe(false);
    expect(p.recordWalkScore(45)).toBe(true);
    expect(p.state.bestWalk).toBe(45);
  });

  it('maps lifetime points to ranks', () => {
    expect(rankFor(0).title).toBe('House Cat');
    expect(rankFor(151).title).toBe('Yard Prowler');
    expect(rankFor(2500).title).toBe('Mythical Feline');
    expect(rankFor(2500).next).toBe(null);
    expect(rankFor(160).next.title).toBe('Street Smart');
    expect(RANKS).toHaveLength(5);
  });
```

- [ ] **Step 2: Run — verify the new tests fail** (also expect the old `starts fresh` test to keep passing — fresh defaults gain the new fields, so update its `equipped` assertion only if it breaks on strict equality elsewhere; do NOT weaken existing assertions otherwise)

- [ ] **Step 3: Implement** in `src/progression.js`:

```js
const SAVE_VERSION = 3; // v3: lifetime points, best walk, cat friends

export const RANKS = [
  { at: 0, title: 'House Cat' },
  { at: 150, title: 'Yard Prowler' },
  { at: 400, title: 'Street Smart' },
  { at: 900, title: 'Neighborhood Legend' },
  { at: 2000, title: 'Mythical Feline' },
];

export function rankFor(lifetimePoints) {
  let current = RANKS[0];
  let next = null;
  for (const r of RANKS) {
    if (lifetimePoints >= r.at) current = r;
  }
  const idx = RANKS.indexOf(current);
  next = idx + 1 < RANKS.length ? RANKS[idx + 1] : null;
  return { title: current.title, next };
}
```

`defaultState()` gains `lifetimePoints: 0, bestWalk: 0, friends: {},`. Load logic becomes:

```js
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === SAVE_VERSION) state = parsed;
      else if (parsed && parsed.version === 2) {
        state = { ...parsed, version: 3, lifetimePoints: parsed.points, bestWalk: 0, friends: {} };
      } else console.warn('Whisker Walk: incompatible save, starting fresh');
```

`addPoints(n)` adds `state.lifetimePoints += n;`. New methods on the api:

```js
    recordGreet(name, breed, walkStamp) {
      const f = state.friends[name] ?? (state.friends[name] = { breed, greets: 0, lastWalk: null });
      if (f.lastWalk === walkStamp) return null;
      f.lastWalk = walkStamp;
      f.greets += 1;
      save();
      if (f.greets === 1) return 'met';
      if (f.greets === 3) return 'friend';
      if (f.greets === 6) return 'best';
      return null;
    },
    friendLevel(name) {
      const g = state.friends[name]?.greets ?? 0;
      return g >= 6 ? 'best' : g >= 3 ? 'friend' : g >= 1 ? 'met' : 'none';
    },
    recordWalkScore(points) {
      if (points > state.bestWalk) {
        state.bestWalk = points;
        save();
        return true;
      }
      return false;
    },
```

- [ ] **Step 4: Run — pass.** **Step 5: Commit** — `git commit -m "feat: save v3 with migration, lifetime points, friendships, and ranks"`

---

### Task 2: Goals module + HUD goals panel

**Files:**
- Create: `src/goals.js`
- Modify: `src/discoveries.js` (AWARDS `goal: 15, jackpot: 40, gift: 10`), `src/ui/hud.js`, `src/style.css`, `src/main.js`
- Test: `test/goals.test.js`, extend `test/discoveries.test.js` (3 new award values)

**Interfaces:**
- Produces: `GOAL_POOL` — `[{ id, text, type, target }]` exactly: spot-critters/critter/4, collect/collectible/2, tip-things/mischief/3, greet-cats/friend/3, take-photos/photo/2, get-scratches/pet/1, yarn-play/play/1, dig-treasure/treasure/1, box-sit/sits/1, scenic-spots/scenic/2.
- `createGoals(rng) -> { goals, note(type) -> {completed?, jackpot?} }`: picks 3 distinct pool entries (seeded); `goals[i] = { id, text, type, target, progress, done }`; `note(type)` increments every matching not-done goal, marks done at target, returns `{completed: goal}` when one finishes and `{jackpot: true}` alongside when all three are done; ignores types `goal`/`jackpot` entirely.
- `hud.setGoals(goals|null)` renders the panel (null hides).

- [ ] **Step 1: Failing tests** — `test/goals.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createGoals, GOAL_POOL } from '../src/goals.js';

const rngQueue = (...vals) => () => (vals.length ? vals.shift() : 0.5);

describe('createGoals', () => {
  it('deals 3 distinct goals', () => {
    const g = createGoals(() => 0.99);
    expect(g.goals).toHaveLength(3);
    expect(new Set(g.goals.map((x) => x.id)).size).toBe(3);
  });

  it('tracks progress and completes at target with jackpot on the third', () => {
    const g = createGoals(rngQueue(0, 0, 0)); // deterministic first three pool entries
    const types = g.goals.map((x) => x.type);
    let completions = 0;
    let jackpot = false;
    for (const goal of g.goals) {
      for (let i = 0; i < goal.target; i++) {
        const res = g.note(goal.type);
        if (res.completed) completions += 1;
        if (res.jackpot) jackpot = true;
      }
    }
    expect(completions).toBe(3);
    expect(jackpot).toBe(true);
    expect(g.goals.every((x) => x.done)).toBe(true);
    expect(g.note(types[0]).completed).toBeUndefined(); // done goals stop counting
  });

  it('ignores goal/jackpot award types', () => {
    const g = createGoals(rngQueue(0, 0, 0));
    expect(g.note('goal')).toEqual({});
    expect(g.note('jackpot')).toEqual({});
  });
});
```

- [ ] **Step 2: fail.** **Step 3: Implement src/goals.js**:

```js
export const GOAL_POOL = [
  { id: 'spot-critters', text: 'Spot 4 critters', type: 'critter', target: 4 },
  { id: 'collect', text: 'Collect 2 treasures', type: 'collectible', target: 2 },
  { id: 'tip-things', text: 'Tip 3 things over', type: 'mischief', target: 3 },
  { id: 'greet-cats', text: 'Greet 3 cats', type: 'friend', target: 3 },
  { id: 'take-photos', text: 'Take 2 photos', type: 'photo', target: 2 },
  { id: 'get-scratches', text: 'Get head scratches', type: 'pet', target: 1 },
  { id: 'yarn-play', text: 'Have a yarn play session', type: 'play', target: 1 },
  { id: 'dig-treasure', text: 'Dig up a buried treasure', type: 'treasure', target: 1 },
  { id: 'box-sit', text: 'Sit in a box', type: 'sits', target: 1 },
  { id: 'scenic-spots', text: 'Visit 2 scenic spots', type: 'scenic', target: 2 },
];

export function createGoals(rng) {
  const pool = [...GOAL_POOL];
  const goals = [];
  while (goals.length < 3) {
    const i = Math.floor(rng() * pool.length);
    const [entry] = pool.splice(i, 1);
    goals.push({ ...entry, progress: 0, done: false });
  }
  return {
    goals,
    note(type) {
      if (type === 'goal' || type === 'jackpot') return {};
      const result = {};
      for (const g of goals) {
        if (g.done || g.type !== type) continue;
        g.progress += 1;
        if (g.progress >= g.target) {
          g.done = true;
          result.completed = g;
          if (goals.every((x) => x.done)) result.jackpot = true;
        }
      }
      return result;
    },
  };
}
```

- [ ] **Step 4: pass** (incl. the AWARDS additions + discoveries test extension). **Step 5: HUD panel + wiring**

`hud.js` template gains `<div class="hud-goals hidden" id="hud-goals"></div>` after the objective div; api gains:

```js
    setGoals(goals) {
      const el = root.querySelector('#hud-goals');
      el.classList.toggle('hidden', !goals);
      if (goals) {
        el.innerHTML = goals.map((g) =>
          `<div class="goal ${g.done ? 'done' : ''}">${g.done ? '✓' : '○'} ${g.text}` +
          (g.target > 1 ? ` — ${Math.min(g.progress, g.target)}/${g.target}` : '') + `</div>`
        ).join('');
      }
    },
```

CSS: `.hud-goals { position: absolute; top: 64px; left: 16px; background: rgba(20,26,38,0.55); border-radius: 10px; padding: 8px 12px; font-size: 0.85rem; display: flex; flex-direction: column; gap: 3px; } .goal.done { color: #7ee2a0; }` (objective pill already sits centered — no clash).

`main.js`: import `createGoals`; in `startWalk`: `const goals = createGoals(Math.random);` session gains `goals`; `hud.setGoals(goals.goals);`. In the `bus.on('discovery', ...)` handler add:

```js
    if (session?.goals) {
      const res = session.goals.note(/* the discovery's award type */);
      hud.setGoals(session.goals.goals);
      if (res.completed) log.award('goal', `goal-${res.completed.id}`, `goal complete: ${res.completed.text}`);
      if (res.jackpot) log.award('jackpot', 'jackpot', 'ALL GOALS COMPLETE! 🎯');
    }
```

The discovery event payload currently carries `{type, key, label, points, repeat}` — `type` is the award type; use it directly. `endWalk` adds `hud.setGoals(null);`.

- [ ] **Step 6: Verify** — tests + build + browser: goals panel lists 3 goals at walk start. **Step 7: Commit** — `git commit -m "feat: per-walk challenge goals with bonuses and jackpot"`

---

### Task 3: Cat society — population, names, personalities

**Files:**
- Modify: `src/cat/model.js` (simple option), `src/straycats.js` (rework), `src/main.js` (spawn count + stalk context)
- Test: `test/straycats.test.js` (extend), `test/catnames.test.js` (new)

**Interfaces:**
- `buildCat(breed, accessories?, opts?)` — `opts.simple` skips whiskers, eye shines, inner ears, cheeks (parts contract unchanged; `whiskers` may be an empty array).
- `src/straycats.js` exports `CAT_NAMES` (48 unique names) and `createStrayCats(scene, area, count, rng?)` — each stray gains `name` (unique per walk, chosen from CAT_NAMES), `personality` (`'bold'|'shy'|'playful'`, seeded), a name-tag sprite (canvas texture, visible within 4 of the player-cat), and behavior hooks:
  - `update(dt, t, catPos, opts)` where `opts = { stalking, catSpeed, toy }`:
    shy strays scurry (wander-away burst 2.5s) when the player-cat is within 4 moving fast (`catSpeed > 2.5`) and not stalking; playful strays run to an active toy within 8 and bat it (call `toy.bat(strayPos)` when within 0.5, with a 0.8s per-stray cooldown).
  - `nearest` unchanged; greet flow unchanged (per-walk `greeted` flag).
- `main.js` passes `createStrayCats(scene, areaData, 22)` and the new opts each frame.

- [ ] **Step 1: Failing tests** — `test/catnames.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { CAT_NAMES, createStrayCats } from '../src/straycats.js';

const scene = { add() {}, remove() {} };
const AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };

describe('cat society', () => {
  it('has at least 48 unique names', () => {
    expect(CAT_NAMES.length).toBeGreaterThanOrEqual(48);
    expect(new Set(CAT_NAMES).size).toBe(CAT_NAMES.length);
  });

  it('spawns 22 strays with unique names and valid personalities', () => {
    const s = createStrayCats(scene, AREA, 22, () => 0.42);
    expect(s.strays).toHaveLength(22);
    expect(new Set(s.strays.map((x) => x.name)).size).toBe(22);
    for (const st of s.strays) {
      expect(['bold', 'shy', 'playful']).toContain(st.personality);
    }
  });

  it('shy strays scurry from a fast non-stalking approach', () => {
    const s = createStrayCats(scene, AREA, 22, () => 0.42);
    const shy = s.strays.find((x) => x.personality === 'shy');
    const start = shy.group.position.clone();
    const catPos = start.clone();
    catPos.x += 2;
    for (let i = 0; i < 60; i++) s.update(0.05, i * 0.05, catPos, { stalking: false, catSpeed: 4, toy: null });
    expect(shy.group.position.distanceTo(catPos)).toBeGreaterThan(start.distanceTo(catPos));
  });
});
```

(Existing `straycats.test.js` calls `createStrayCats(scene, AREA, 3)` and `update(dt, t)` — update those call sites to the new signatures: pass a far-away catPos `{x:999,z:999}`-style Vector3 and default opts `{ stalking: false, catSpeed: 0, toy: null }`, keep assertions.)

- [ ] **Step 2: fail.** **Step 3: Implement**

`model.js`: `export function buildCat(breed, accessories = {...}, opts = {})` — wrap the whiskers block, shine, inner-ear, and cheek creation each in `if (!opts.simple) { ... }` (whiskers stays `[]` when simple).

`straycats.js` rework — keep the wander FSM; add:

```js
export const CAT_NAMES = [
  'Pickles', 'Marmalade', 'Baron von Fluff', 'Mochi', 'Biscuit', 'Clementine',
  'Noodle', 'Pumpkin', 'Sardine', 'Waffles', 'Miso', 'Turnip', 'Gadget',
  'Petunia', 'Sir Pounce', 'Dumpling', 'Olive', 'Paprika', 'Crumpet', 'Zucchini',
  'Maple', 'Tofu', 'Wasabi', 'Pretzel', 'Nimbus', 'Pepper', 'Butterscotch',
  'Fig', 'Tangerine', 'Cocoa', 'Sprout', 'Juniper', 'Meatball', 'Parsnip',
  'Ziggy', 'Bean', 'Churro', 'Anchovy', 'Popcorn', 'Gnocchi', 'Beignet',
  'Truffle', 'Ramen', 'Custard', 'Peaches', 'Static', 'Doppler', 'Comet',
];
```

Signature `createStrayCats(scene, area, count = 3, rng = Math.random)`. Per stray: unique name (shuffle CAT_NAMES with rng, take `count`), `personality: rng() < 0.25 ? 'shy' : rng() < 0.55 ? 'playful' : 'bold'`, build with `buildCat(breed, undefined, { simple: true })`. Name tag:

```js
    const tagCanvas = document.createElement('canvas');
    tagCanvas.width = 256;
    tagCanvas.height = 64;
    const tctx = tagCanvas.getContext('2d');
    tctx.font = 'bold 34px Avenir, sans-serif';
    tctx.textAlign = 'center';
    tctx.fillStyle = 'rgba(20,26,38,0.7)';
    tctx.beginPath();
    tctx.roundRect(28, 8, 200, 48, 22);
    tctx.fill();
    tctx.fillStyle = '#fff';
    tctx.fillText(name, 128, 42);
    const tagTex = new THREE.CanvasTexture(tagCanvas);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true }));
    tag.scale.set(1.4, 0.35, 1);
    tag.position.y = 1.05;
    tag.visible = false;
    group.add(tag);
```

(guard `document` for the test environment: `const tag = typeof document !== 'undefined' ? makeTag(name) : null;` and null-check where used). In `update(dt, t, catPos, opts = {})`:

- tag visibility: `if (s.tag) s.tag.visible = s.group.position.distanceTo(catPos) < 4;`
- shy scurry: if `s.personality === 'shy' && s.state !== 'greet' && s.scurry <= 0` and `catPos` within 4 and `opts.catSpeed > 2.5 && !opts.stalking` → `s.scurry = 2.5` with a direction away; while `s.scurry > 0` decrement and move away at 2.6 u/s (clamped to bounds), overriding wander.
- playful yarn: if `s.personality === 'playful' && opts.toy?.active` and toy within 8 → wander target = toy position; if within 0.5 and `s.batCooldown <= 0` → `opts.toy.bat(s.group.position); s.batCooldown = 0.8;` (decrement batCooldown by dt).

`main.js`: spawn `createStrayCats(scene, areaData, 22)`; the loop call becomes `session.strayCats.update(dt, t, session.cat.position, { stalking: player.stalking, catSpeed: player.speed, toy: session.toy });`.

- [ ] **Step 4: pass** (existing straycat tests updated). **Step 5: Verify in browser** — cats everywhere; approach fast → shy ones bolt; stalk close → greetable; name tags fade in within range; drop yarn near a playful stray → it joins the batting. Watch framerate with 22 plush-simple cats + shadows.

- [ ] **Step 6: Commit** — `git commit -m "feat: populated cat society with names and personalities"`

---

### Task 4: Friendship wiring, gifts, roster

**Files:**
- Modify: `src/main.js`, `src/ui/homebase.js`, `src/style.css`

**Interfaces:**
- Greeting a stray now: `progression.recordGreet(stray.name, stray.breed, session.walkStamp)` (walkStamp = `Date.now()` captured once in startWalk as `walk-${Date.now()}`); level-up returns toast: met → "You met {name}! ♡", friend → "{name} is now your friend! ♥", best → "{name} is your BEST friend! 💕". The `friend` award keeps firing per stray as before (key `friend-${stray.name}` now, so goals count it).
- Gifts: in startWalk, after strays spawn: for each stray whose `friendLevel(name) === 'best'`, roll 30% (`Math.random() < 0.3`) → mark `stray.hasGift = true`. In updateInteractions: a gift stray within 3 → `log.awardOnce('gift', 'gift-' + stray.name, `${stray.name} brought you a gift! 🎁`); stray.hasGift = false;`.
- Home base roster: `createHomeBase` renders a **Cat friends** section (after Photo album) from `progression.state.friends`: sorted by greets desc, each row `💕/♥/♡ {name} — {breed}, {greets} greets`; empty state "No cat friends yet — go touch noses!".
- HUD greet prompt becomes `E — touch noses with {name}`.

- [ ] **Step 1: Implement** the four pieces (all straightforward wiring; the greet handler branch changes from `awardOnce('friend', friend-${stray.id}, ...)` to use the name key and add the recordGreet + toast logic; note `Date.now()` is fine here — main.js is not a workflow script).
- [ ] **Step 2: Verify** — tests (no new), build, browser: greet toasts + persistent roster grows across walks (localStorage), prompt shows names.
- [ ] **Step 3: Commit** — `git commit -m "feat: persistent cat friendships, gifts, and the friends roster"`

---

### Task 5: Summary screen, control bar, rank display

**Files:**
- Modify: `src/main.js`, `src/ui/hud.js`, `src/style.css`, `src/ui/homebase.js`

**Interfaces:**
- **Control bar:** hud template gains `<div class="hud-controls" id="hud-controls">←↑↓→ move · ⇧ stalk · ␣ pounce/climb · E interact · V meow · T yarn · C camera · M mute · Esc menu</div>`, always visible while the HUD is shown; CSS: fixed to bottom center, muted (`rgba(20,26,38,0.5)`, font-size 0.8rem, border-radius 999px, padding 6px 18px). Move the prompt pill up (bottom: 96px) so they never overlap.
- **Rank chip:** hud template gains `<div class="hud-rank" id="hud-rank"></div>` inside `.hud-top` (after points); api `setRank(title)`. main sets it on walk start and inside the discovery handler: compute `rankFor(lifetimePoints)` before/after the award — actually simplest: keep `session.rankTitle`; after each discovery, `const r = rankFor(progression.state.lifetimePoints).title; if (r !== session.rankTitle) { session.rankTitle = r; hud.setRank(r); hud.toast(\`RANK UP — ${r}! 🏆\`); }`.
- **Summary screen:** startWalk records `session.startPoints = progression.state.points; session.discoveryCount = 0; session.friendToasts = 0;` (increment discoveryCount in the discovery handler; friendToasts on each recordGreet non-null). endWalk changes: compute `earned = progression.state.points - session.startPoints` (note: points only go UP during a walk — the shop is only at home base), `goalsDone`, `isRecord = progression.recordWalkScore(earned)`; instead of showing homebase immediately, render into `overlay` a `.summary-card` (points earned, discoveries, cats greeted, goals `x/3`, `NEW BEST WALK! 🏆` banner when isRecord, best-walk line otherwise, Continue button id `btn-summary-continue`); overlay click handler routes that button → hide overlay + `homebase.show()`. All other endWalk teardown happens immediately (dispose, hud.hide, player.disable etc.) — only the homebase.show moves behind the button.
- **Home base header:** shows `🏆 {rank title}` and `next: {n} 🐾 to {next title}` (or "top rank!") plus `best walk: {bestWalk} 🐾` — small line under the points header (import `rankFor` in homebase.js).

- [ ] **Step 1: Implement.** Careful with the overlay click handler: it already routes btn-resume/btn-end; add btn-summary-continue.
- [ ] **Step 2: Verify** — tests + build + browser: control bar always visible during walks, prompt clears it; rank chip present; end a walk → summary card with correct numbers → Continue → home base shows rank/best-walk lines.
- [ ] **Step 3: Commit** — `git commit -m "feat: walk summary, control bar, and rank display"`

---

### Task 6: Polish + perf + release

**Files:**
- Modify: `README.md`; possibly `src/main.js`/`src/straycats.js` (perf fallback)

- [ ] **Step 1: README** — add to the Play section: "Every walk deals 3 goals — clear them all for a jackpot. Befriend the neighborhood cats by name (greet them across multiple walks), earn rank titles, and beat your best-walk score."
- [ ] **Step 2: Full regression** — all tests + `npm run build`.
- [ ] **Step 3: Perf check** — dev server, start a walk, eyeball frame pacing with 22 strays + shadows (use browser tooling if available; otherwise reason from draw-call counts). If clearly choppy: drop stray count to 15 in main.js and note it in the report.
- [ ] **Step 4: Playtest checklist** — goals panel live-updates and pays bonuses; jackpot fires; summary numbers match; rank-up toast at 150 lifetime; shy/playful behaviors observable; gift fires from a best friend (may need repeated walks — verify code path by temporarily editing localStorage friends greets to 6, then RESTORE the save).
- [ ] **Step 5: Commit** — `git commit -m "docs: v4 README and release polish"`

---

## Plan Self-Review Notes

- Spec §1→Task 5, §2→Tasks 3-4, §3→Task 2, §4→Task 5, §5→Tasks 1+5, migration→Task 1, awards→Task 2.
- Contracts: walkStamp is main-owned (`walk-${Date.now()}`); goals consume discovery award types (greet emits `friend` awards keyed by name — still type `friend`, so the greet-cats goal counts).
- Deliberate simplifications: gift roll at walk start (not on sight); name pool 48 with 22 drawn per walk so recurring cats are guaranteed; summary earned-points assumes no spending mid-walk (true — shop only exists at home base).
