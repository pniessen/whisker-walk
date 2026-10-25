# Whisker Walk v21 Stream 3b — Deeper Verbs and More to Touch: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the walk verbs that leave the world changed — carry a thing in your mouth (and home to the den), knock things off ledges so they stay down, prey that gets away, flaps that swing, places to drink, eat and nap — plus private marks that persist per area and that the 3a rival clans can contest, a dog in every area, rain that makes you drop things, four legendary cats, and the gold mice shown plainly.

**Architecture:** Every rule lives in a DOM-free, THREE-free leaf module (`propsets.js` for the curated prop data and ids, `marks.js`, `carry.js`, `dogs.js`, `legendary.js`), each with its own entity/render module beside it following the shipped `rivalcats.js` / `goldmice.js` create-update-dispose pattern. Within-walk state lives on the session and dies at `endWalk`; across-walk state is one additive save key, `state.marks`, that is never on any wire. Co-walk sync is three new event types (`knock`, `carry-pick`, `carry-drop`) plus a fix that makes the existing `tip` ids agree between devices. Nothing new draws from `walkRng`.

**Tech Stack:** Three.js ~0.185, Vite 8, Vitest 4, Supabase JS 2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-25-whisker-walk-v21-the-clan-design.md` §9 (the 3b paragraph) and §11 ("The 3b answers already given") — the owner's decisions. Parent: `docs/superpowers/specs/2026-10-24-whisker-walk-v21-reason-to-come-back-design.md`, "Stream 3 — Deeper verbs and more to touch" and §10.1. Read with `docs/superpowers/handoffs/2026-10-25-v21-stream3a-handoff.md`, "The five things most likely to bite you".

## Global Constraints

- **No SQL and no RPC change.** If any task appears to need one (a legendary cat joining the colony is the likeliest), stop and ask the owner. Never write or run SQL.
- `SAVE_VERSION` stays **4**. New save fields are additive and sanitized-with-default (`defaultState()` + one line in `sanitizeState`), total over garbage, own-property reads only.
- **`CAT_NAMES` is never extended, reordered or resized** (48, pinned). **No new consumer of `walkRng`**, eager or lazy. New randomness gets its own seeded stream: `Math.random` solo, `mulberry32((roomSeed ^ SALT) >>> 0)` in a room walk, or `seedFromCode(...)` over stable strings. A co-walk with a non-partner must behave exactly as it does today.
- **Nothing in 3b takes away points, taming, colony cats or marks.** The dog and rain are recoverable, funny, never retroactive (v21 spec §10.1). A contested mark is never deleted. The only way a mark ever leaves the save is the per-area cap's oldest-out rule.
- **Marks are PRIVATE.** They live in `state.marks` only. They never go on the colony wire (`colonysync.js`) or the co-walk wire (`netevents.js`). (The whole save does ride in the player's *own* cloud save row via `cloudsync.js`; that is the player's backup, not sharing, and is fine.)
- **The colony is shared and untouched.** `COLONY_MAX` (24), `SOLO_MAX` (12), `TAME_FEEDS`, `feedCat`, `canFeed`, `mergeColony` are not modified. A legendary cat joins only through the existing feed path.
- New cat names must pass `isStrayName`, the feed RPC regex `^[A-Za-z][A-Za-z ]{0,23}$`, and the family-pet safety gate `isGrudgeableStray` (`src/straycats.js`). Each needs a `CAT_PREFIXES` entry (`src/clanwords.js`), and the "all names distinct" tests stay green.
- **No new score.** Carry, drop, marks, push-through, drink/eat/nap and the dog pay **nothing** and record no feat. The only awards in 3b are a knock-off (the shipped `mischief` award, exactly as `tip`) and meeting a legendary cat for the first time (`legend`); spotting a dog keeps paying exactly what it pays today. Nothing new enters a goal or `AWARDS`.
- **Every borrowed Warrior Cats word lives only in `src/clanwords.js`** (3a's structural test scans `src/` literals for `RANK_WORDS`, `OUTSIDE_WORDS` and `CLAN_SUFFIX`). A toast naming a rival clan uses `rivalFor(areaId).name`; never type "Clan", "elder", "warrior" etc. in a literal.
- Kid-friendly copy throughout; the players are 11 and 9. Toasts are short and never scold.
- **Parallel session.** Another branch is editing `CATALOG.cats` (progression.js), `src/cat/model.js`, `src/cat/brain.js`, `src/catvoice.js`, `src/catreplies.js`, the cat blurbs in `src/ui/homebase.js` and a comment label in `src/straycats.js`. Do not touch those spots beyond what a task names.
- `render/quality.js` stays the only place a tier is decided. Decals are flat (`scent.js`'s `CircleGeometry` + `MeshBasicMaterial` idiom), never `render/mergeprops.js`. Everything new is created after `mergeStaticProps` runs, so nothing new is merged.
- Pure logic in leaf modules; `ui/*` renderers return strings and escape every interpolated value. Coerce untrusted data at the sanitizer, escape at render, never throw.
- Tests: `npx vitest run --exclude '.claude/**' <file>` for one file; `npx vitest run --exclude '.claude/**'` for the suite. Without the exclude, other worktrees' copies are picked up.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## Review Focus

Five input classes the spec implies and no happy-path test exercises. Each has its test in the owning task.

1. **A hostile or stale co-walk event** — a `carry-pick`/`carry-drop`/`knock` with an unknown id, a non-string id, a non-finite or out-of-bounds `pos`, the receiver's own id, or an id the receiver is itself carrying; and a `tip` from a pre-3b build whose ids came from the old global counter. Each must be a silent no-op that never throws and never writes the save. *Tasks 8 and 10.*
2. **The walk ends while something is in your mouth** — via the End button, in the den, or with the partner leaving the room while *they* carry. Exactly one den mark is written for your own item and none for theirs; their item vanishes with their cat. *Tasks 6 and 8.*
3. **A save the marks code has never seen** — a v20 save with no `marks`, a mark with an unknown area or kind, a stray `__proto__` key, non-finite coordinates, nine or ninety marks in one area, a prop id that no longer exists. It loads; valid marks survive; the renderer skips what it cannot place rather than throwing. *Tasks 3 and 11.*
4. **Determinism under co-walk** — a legendary cat, the dog, prey, carry and rain must draw nothing from `walkRng`; the stray spawn's draw count stays exactly 47 + 5×count with a legendary present; a walk with a non-partner never shows a legendary cat. *Tasks 13, 17 and 18.*
5. **Pushback never takes anything** — a rival contesting a mark, the cap evicting one, the dog chasing, rain making you drop: points, taming, colony cats and marks are unchanged by each (the dropped item stays on the ground, pickable). *Tasks 9, 12 and 16.*

---

## File Structure

**Create (pure, no THREE/DOM):**
- `src/propsets.js` — the curated per-area prop data and every prop id: carryables, knockables, markables, flaps/gaps, rest spots, prey hides, the dog's yard, the den's keep slots. Plus `frameColliders(flap)`.
- `src/marks.js` — mark kinds, cap, sanitizer, add/re-mark/contest rules, fade.
- `src/carry.js` — the mouth: pick, drop, rain grip, end-of-walk outcome.
- `src/dogs.js` — dog yard rules: notice, chase outcome, landing.
- `src/legendary.js` — the four legendary cats, the odds, who appears.

**Create (THREE):**
- `src/carryables.js` — carryable meshes, holding, following a cat's mouth; `buildCarryMesh(kind)`.
- `src/knockables.js` — ledge items that fall and stay down.
- `src/render/playermarks.js` — the player's mark decals/meshes, fading, contested look.
- `src/pushthrough.js` — flaps and gaps that swing.
- `src/rests.js` — bowls, dishes and nap spots.
- `src/yarddog.js` — the dog entity and its chase.
- Tests: `test/propsets.test.js`, `test/marks.test.js`, `test/carry.test.js`, `test/carryables.test.js`, `test/knockables.test.js`, `test/playermarks.test.js`, `test/pushthrough.test.js`, `test/rests.test.js`, `test/dogs.test.js`, `test/yarddog.test.js`, `test/legendary.test.js`.

**Modify:** `src/tippables.js`, `src/weather.js`, `src/progression.js` (marks only — not `CATALOG.cats`), `src/straynames.js`, `src/straycats.js` (the `STRAY_NAMES` line and a `createStrayCats` option), `src/clanwords.js` (four `CAT_PREFIXES` entries), `src/critters.js`, `src/rivalcats.js` (a read-only position getter), `src/render/bordermarks.js` (a `ring` field on list entries), `src/world/neighborhood.js` and `src/world/docks.js` (remove the critter dog), `src/game/interactions.js`, `src/game/netevents.js`, `src/game/walk.js`, `src/game/avatar.js`, `src/main.js`, `src/ui/hometabs.js`, `src/ui/homebase.js` (header substats only), `src/journal.js` (count only), and their tests.

---

## Cut lines

Build everything. If the stream must be shortened, cut from the bottom, in this order, and tell the owner what was cut:

1. **Task 19** (wet paw prints) — the smallest piece of within-walk persistence; nothing depends on it.
2. **Task 14's gaps** — keep the flaps.
3. **Task 15's outdoor rest spots** — keep the den's drink/eat/nap.
4. **Task 12's border scent-over** — keep the patrol contesting the player's marks (that half is in the owner's scope list by name).

**Never cut:** Tasks 1–11 (carry is REQUIRED, and marks are what 3a's rival clans exist to contest), Task 13, Task 16, Tasks 17–18 and Task 4. Every other cut needs the owner's say.

---

# Phase 1 — Foundations

### Task 1: Tippable ids both devices agree on

**Files:**
- Modify: `src/tippables.js:53,111`
- Test: `test/tippables.test.js`

**Interfaces:**
- Produces: tippable ids are `tip-0 … tip-(n-1)`, by index in the `spots` array passed to each `createTippables` call. Every later co-walk event relies on ids being per-area and per-index, never a page-lifetime counter.

The shipped `nextId` is module-level and never reset, so two co-walkers who have taken different numbers of walks since loading the page disagree on every id and a remote `tip` hits the wrong prop or none.

- [ ] **Step 1: Write the failing tests**

```js
test('ids are by index and identical across calls', () => {
  const spots = [{ x: 0, z: 0, kind: 'pot' }, { x: 3, z: 1, kind: 'can' }];
  const a = createTippables(scene, spots);
  const b = createTippables(scene, spots);
  expect(a.list.map((e) => e.id)).toEqual(['tip-0', 'tip-1']);
  expect(b.list.map((e) => e.id)).toEqual(['tip-0', 'tip-1']);
});
test('a remote tip by id lands on the same prop on both devices', () => {
  const spots = [{ x: 0, z: 0, kind: 'pot' }, { x: 3, z: 1, kind: 'can' }];
  createTippables(scene, spots); // an earlier walk on this page
  const mine = createTippables(scene, spots);
  const theirs = createTippables(scene, spots);
  theirs.tip(theirs.list[1]);
  expect(mine.tipById(theirs.list[1].id)).toBe(true);
  expect(mine.list[1].tipped).toBe(true);
  expect(mine.list[0].tipped).toBe(false);
});
test('an unknown or legacy id is a no-op', () => {
  const t = createTippables(scene, [{ x: 0, z: 0, kind: 'pot' }]);
  for (const id of ['tip-57', 'tip--1', '', null, 42, '__proto__']) expect(t.tipById(id)).toBe(false);
  expect(t.list[0].tipped).toBe(false);
});
```

- [ ] **Step 2: Run** `npx vitest run --exclude '.claude/**' test/tippables.test.js` — expect FAIL (ids keep counting).
- [ ] **Step 3: Implement.** Make the counter local to `createTippables`. Grep `test/` for any assertion on the old numbering (`tip-` plus a number) and update it to the index form. Header comment: ids are per call, by index, so both co-walkers agree.
- [ ] **Step 4: Run** `test/tippables.test.js test/interactions.test.js test/netevents.test.js` — expect PASS.
- [ ] **Step 5: Commit** — `fix(verbs): tippable ids by index so co-walkers tip the same prop`

### Task 2: The curated prop set

**Files:**
- Create: `src/propsets.js`, `test/propsets.test.js`

**Interfaces:**
- Consumes: the four area builders (for the test only).
- Produces, all frozen:
  - `PROP_ID = /^[a-z]{2,12}-[a-z]{2,12}-\d{1,2}$/` and `isPropId(v) → bool`.
  - `CARRY_KINDS: readonly string[]` — `['sock','toymouse','leaf','stick','pinecone','acorn','shell','driftwood','cap','rope','glove','ribbon']`.
  - `KNOCK_KINDS` — `['cup','flowerpot','can','book','bucket']`.
  - `REST_KINDS` — `['drink','eat','nap']`.
  - `propsFor(areaId) → { carryables:[{id,kind,x,z}], knockables:[{id,kind,x,z,y,fallTo:{x,z}}], markables:[{id,kind:'post'|'tree'|'bollard',x,z,nearBorder:boolean}], flaps:[{id,kind:'flap'|'gap',x,z,rotY,width}], rests:[{id,kind,x,z,mesh:boolean}], hides:[{x,z}], dogYard:{x,z,r,kennel:{x,z}}|null, keepSlots:[{x,z,y}] }` — a fresh deep copy every call; an unknown or hostile id (`'__proto__'`, `42`, `null`, `'future-area'`) returns the same shape with every list empty and `dogYard: null`.
  - `frameColliders(flap) → [{x,z,r}]` — circles of `r = 0.3` spaced `0.45` along the flap's frame (total length `width + 2.4`, centred on `x,z`, along `rotY`), leaving the middle `width` open.
  - `allPropIds() → Set<string>`.

Ids are `<area>-<kind>-<n>`, e.g. `park-stick-1`, `docks-flap-1`, `den-nap-1`. Counts per outdoor area: **4 carryables, 3 knockables, 3 markables (exactly one `nearBorder: true`), 1 flap + 1 gap, 3 rests (one of each kind, all `mesh: true`), 3 hides, 1 dog yard**. The den: **3 rests** (drink and eat at the existing `petBowls` at (4.6, 6.6), `mesh: false`; nap at an existing den fixture, `mesh: false`), **8 keepSlots** on the floor near the hearth, nothing else.

Dog yards: neighborhood centred on the existing dog-yard fence `(18..26, -28..-20)` → `{x:22, z:-24, r:4}`; docks at the current critter dog `(30, 20)`; park and seaside are yours to place. Flavour carry kinds by area (socks and toy mice in the neighborhood, sticks and pinecones in the park, shells and driftwood at the seaside, rope and caps at the docks).

Placement is yours, inside these rules — the test enforces every one against the **real built areas** (copy the `document` stub from `test/rivalworld.test.js:6-33`):

- [ ] **Step 1: Write the failing tests** — one `describe` per area, plus:

```js
test.each(AREAS)('%s: every id is unique, well-formed and namespaced by area', (a) => { /* isPropId, startsWith(a+'-'), no repeats across allPropIds() */ });
test.each(AREAS)('%s: walk-up props stand on walkable ground clear of colliders and water', (a) => {
  // carryables, rests (mesh:true), hides, markables' approach point, every dog kennel:
  // isWalkableAt(area, x, z) and every collider cleared by c.r + CAT_RADIUS + 0.3
});
test.each(AREAS)('%s: no prop crowds the spawn, a gold mouse, a collectible, a scenic or a POI', ...); // ≥ 2 m
test.each(AREAS)('%s: nothing but the nearBorder markable is inside or on a rival disc', ...);
// nearBorder markable: | hypot(x-cx, z-cz) - r | <= 1.5 (the contest band, Task 12) and walkable
test.each(AREAS)('%s: each knockable sits on a real perch and falls onto walkable ground', ...);
// some perch p with hypot(dx,dz) <= 0.6 and |p.y - y| < 0.05; fallTo walkable, 0.6..1.6 m from (x,z)
test.each(AREAS)('%s: a flap opening is walkable and its frame is not', ...);
// isWalkableAt at (x,z) true with the frame colliders appended; frameColliders don't overlap
// any existing collider centre; the frame never crosses a rival disc or the patrol ring
test.each(AREAS)('%s: the dog yard holds no other prop, POI, collectible, scenic, gold mouse or spawn, and is clear of the rival disc by 2 m', ...);
test('the den: three rests (drink, eat at the bowls), eight keep slots, nothing else', ...);
test('propsFor is total and returns fresh copies', () => { /* hostile ids → empty shape; mutating one result never reaches the next */ });
test('frameColliders leaves the opening clear', () => { /* no circle within width/2 of centre along the frame axis */ });
```

- [ ] **Step 2: Run** — FAIL (module missing).
- [ ] **Step 3: Write `src/propsets.js`.** Data plus the two small functions; header comment says this is the single home of 3b prop ids (v21 spec "The id cost": only a curated set gets ids), and that an id must never be renamed once shipped because saved marks key on it. Zero imports: the test, not the module, checks placement against `rivalclans.js` and the built areas.
- [ ] **Step 4: Run** — PASS. Then the full suite.
- [ ] **Step 5: Commit** — `feat(verbs): a curated, id'd prop set for each area`

### Task 3: Private marks, and their save key

**Files:**
- Create: `src/marks.js`, `test/marks.test.js`
- Modify: `src/progression.js` (`defaultState`, `sanitizeState`, three methods), `test/progression.test.js`

**Interfaces:**
- Consumes: `isPropId`, `CARRY_KINDS` (Task 2).
- Produces:
  - `MARK_KINDS = ['scratch','dig','drop','border','den']`, `MARKS_PER_AREA = 8`, `MARK_AREAS = ['neighborhood','park','seaside','docks','den']`.
  - Mark shape: `{ kind, id: string|null, x, z, at: number /* ms */, contested: boolean, item: string|null }`. `id` is a prop id for `scratch`/`drop`/`border`/`den` (border ids are `<area>-border-<ring index>`), `null` for `dig`. `item` is a `CARRY_KINDS` entry for `drop`/`den`, else `null`.
  - `emptyMarks() → {neighborhood:[],park:[],seaside:[],docks:[],den:[]}`.
  - `sanitizeMarks(v) → marks` — total; drops bad entries; `|x|,|z| <= 200`; keeps the newest `MARKS_PER_AREA` per area by `at`; output sorted oldest→newest.
  - `markKey(m) → string` — `kind:id` for `scratch`/`border`; `kind:id:at` for `drop`/`den` (the same stick can be carried home twice); `dig:<round(x)>,<round(z)>` for `dig`. Keys are unique within an area after `sanitizeMarks` (dedupe on key, newest wins).
  - `addMark(marks, area, mark) → { marks, changed }` — pure, returns a new object. A `scratch` or `border` mark with the same key as an existing one **replaces** it (newest `at`, `contested: false`) — that is a re-mark. Everything else appends. Then the oldest beyond the cap fall off.
  - `contestMark(marks, area, key) → { marks, changed }` — sets `contested: true`; never removes; a `border` or `den` mark is never contestable (`changed: false`).
  - `markOpacity(rankFromNewest) → number` — `1` for ranks 0–5, `0.55` for 6, `0.3` for 7. ("Six to eight per area, oldest fading.")
  - progression: `state.marks` (default `emptyMarks()`), `marksIn(area) → mark[]` (a copy), `addMark(area, mark) → bool`, `contestMark(area, key) → bool`. Each saves immediately and returns whether the save changed.

- [ ] **Step 1: Write the failing tests** — in `test/marks.test.js`:

```js
test('a ninth mark pushes out the oldest, and only the oldest', ...);
test('re-marking a scratch refreshes it and clears contested', ...);
test('dig marks key by rounded spot; two digs a metre apart are two marks', ...);
test('contesting never removes a mark, and border/den marks cannot be contested', ...);
test('markOpacity: six full, then fading', () => {
  expect([0,1,2,3,4,5].map(markOpacity)).toEqual([1,1,1,1,1,1]);
  expect(markOpacity(6)).toBeLessThan(1); expect(markOpacity(7)).toBeLessThan(markOpacity(6));
});
test('sanitizeMarks survives garbage', () => {
  for (const v of [null, 7, 'x', [], { __proto__: { neighborhood: [] } }, { park: 'x' }, { moon: [] }]) {
    expect(sanitizeMarks(v)).toEqual(emptyMarks());
  }
});
test('sanitizeMarks keeps valid marks and drops each kind of bad one', () => {
  // unknown kind, bad id, non-finite x, |z|>200, at not finite, item not a CARRY_KINDS,
  // dig with an id, drop without an item, 90 marks in one area (→ newest 8)
});
test('sanitizeMarks keeps a well-formed id it does not recognise', ...); // a prop removed later: keep, renderer skips
```

In `test/progression.test.js`:

```js
test('a v20 save with no marks loads with empty marks', ...);
test('marks round-trip through save and load', ...);
test('a save with marks still loads under the pre-3b sanitizer shape', ...); // sanitizeState ignores unknown keys: build a save, delete nothing, load — other fields intact
test('addMark and contestMark change nothing but marks', ...); // points, colony, friends, golden identical
```

- [ ] **Step 2: Run both files** — FAIL.
- [ ] **Step 3: Implement** `src/marks.js` (imports `./propsets.js` only) and the progression changes, following the `sanitizeGifts`/`leaveGift` pattern. Header comment on `marks.js`: marks are PRIVATE (v21 spec Stream 3), the cap is the only removal, contest never deletes (v21 §10.1, clan spec §6.7).
- [ ] **Step 4: Run** both files, then the suite — PASS.
- [ ] **Step 5: Commit** — `feat(marks): private per-area marks in the save, capped at eight, oldest fading`

### Task 4: Gold mice, plainly — "x of 12"

**Files:**
- Modify: `src/ui/hometabs.js`, `src/ui/homebase.js` (the `hb-substats` block, :670-676, only), `src/journal.js` (its found count only)
- Test: `test/hometabs.test.js`, `test/journal.test.js`

**Interfaces:**
- Consumes: `KNOWN_GOLD`, `GOLD_TOTAL` from `src/goldmice.js`.
- Produces: `goldenFound(golden, known) → int` — the number of **distinct** ids in `golden` that are in `known` (an array or anything else → 0). `renderGoldenTallyHtml(found, total) → string` — `<span>🥇 ${found} of ${total} golden mice</span>`, both numbers coerced to finite non-negative integers, `found` clamped to `total`.

- [ ] **Step 1: Failing tests**

```js
test('goldenFound counts distinct known ids only', () => {
  const known = new Set(['gm-park-1', 'gm-park-2']);
  expect(goldenFound(['gm-park-1', 'gm-park-1', 'gm-fake-9', 3], known)).toBe(1);
  expect(goldenFound(null, known)).toBe(0);
});
test('the tally reads "x of 12" and never more than the total', () => {
  expect(renderGoldenTallyHtml(3, 12)).toContain('3 of 12 golden mice');
  expect(renderGoldenTallyHtml(99, 12)).toContain('12 of 12');
  expect(renderGoldenTallyHtml(NaN, 12)).toContain('0 of 12');
});
```

Journal: the footer's found count now comes from `goldenFound` (so a shape-valid fake id cannot push it past 12).

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** In `homebase.js`'s `hb-substats`, add one `${renderGoldenTallyHtml(goldenFound(s.golden, KNOWN_GOLD), GOLD_TOTAL)}` line after "best walk". Change nothing else in homebase.js. Always shown, including 0 of 12 — the point is that a child sees there is something to find.
- [ ] **Step 4: Run** both test files and the suite — PASS.
- [ ] **Step 5: Eye-check** the home base at desktop width and at 375 px (`resize_window` mobile): the tally sits on the substats line and does not wrap the header into a taller block than before by more than one line.
- [ ] **Step 6: Commit** — `feat(home): show the golden mice as "x of 12" on the home base`

---

# Phase 2 — Carry (REQUIRED)

### Task 5: The mouth — carry rules and carryable meshes

**Files:**
- Create: `src/carry.js`, `src/carryables.js`, `test/carry.test.js`, `test/carryables.test.js`

**Interfaces:**
- Consumes: `CARRY_KINDS`, `propsFor` (Task 2).
- Produces, `src/carry.js` (pure):
  - `RAIN_GRIP = 6` (seconds of carrying in falling rain before the item slips), `MOVED_MIN = 1.5` (metres an item must move from its home to count as left somewhere).
  - `createMouth() → { held: {id,kind}|null, grip: number, dropped: Map<id,{kind,x,z,homeX,homeZ}> }`.
  - `pick(mouth, item) → bool` — refuses when already holding; removes `item.id` from `dropped`.
  - `drop(mouth, x, z, home) → {id,kind}|null` — records `dropped.set(id, {kind,x,z,homeX,homeZ})`; resets `grip`.
  - `tickRain(mouth, dt, raining) → bool` — accumulates `grip` only while holding and raining; returns `true` exactly once when it reaches `RAIN_GRIP` (the caller then drops); `grip` resets on drop/pick and does **not** reset when the rain pauses.
  - `walkEndMarks(mouth, area, now) → mark[]` — one `den` mark (`area: 'den'` target, `id` = the held id, `item` = its kind, `x: 0, z: 0`) if holding; one `drop` mark per `dropped` entry whose distance from home ≥ `MOVED_MIN`. Returns `[{ area, mark }]` pairs.
- Produces, `src/carryables.js` (THREE):
  - `buildCarryMesh(kind) → THREE.Object3D` — a small primitive per kind (< 0.25 m), unknown kind → a small grey sphere; never throws.
  - `createCarryables(scene, list) → { list: [{id,kind,mesh,onGround,holder,homeX,homeZ}], nearest(pos, maxDist) /* on the ground only */, hold(id, holderObj), placeAt(id, x, z), take(id) /* off the ground, held by nobody visible */, update(dt), dispose() }`. A held item is a **scene child** repositioned each `update` at its holder's mouth — `holder.userData.parts.head.localToWorld(MOUTH)` with `MOUTH = (0, -0.08, -0.24)`, falling back to the holder's position + 0.3 m up when it has no head. It is never parented to a cat, because `remotecats.js` disposes every child of a removed remote's group. A holder that is no longer in the scene (`!holder.parent`) hides the item.

- [ ] **Step 1: Failing tests** — `carry.test.js`:

```js
test('one thing at a time', ...);
test('rain grip: slips once after RAIN_GRIP seconds of rain, not in dry weather', ...);
test('a pause in the rain does not reset the grip, a drop does', ...);
test('walk end: a held item goes to the den; a moved drop leaves a mark; an unmoved one does not', ...);
test('walk end with nothing held and nothing dropped writes nothing', ...);
test('picking an item back up removes its pending drop mark', ...);
```

`carryables.test.js` (stub scene with real `THREE.Scene`):

```js
test('nearest ignores held items', ...);
test('a held item follows its holder\'s mouth and is never a child of the cat', ...);
test('an item whose holder left the scene hides, and dispose is idempotent', ...);
test('buildCarryMesh never throws and stays small', () => { for (const k of [...CARRY_KINDS, 'nope', undefined]) { /* Box3 size < 0.3 */ } });
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** both modules. Each mesh and material is disposed in `dispose()` (the `goldmice.js` pattern).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(carry): a mouth that holds one thing, and things to hold`

### Task 6: Carry in a walk — pick up, put down, bring it home

**Files:**
- Modify: `src/game/interactions.js`, `src/game/walk.js`, `src/main.js`
- Test: `test/interactions.test.js`

**Interfaces:**
- Consumes: Task 5's `createMouth`/`pick`/`drop`/`walkEndMarks`, `createCarryables`; Task 3's `progression.addMark`.
- Produces: `session.carry = { mouth, items }` (an inert stand-in in the den: `items.list` empty); prompt kinds `'carry'` (`data`: the item) and `'drop'`. `handleInteract` sends nothing yet (Task 8 adds the events).

Prompt order in `updateInteractions`: **`carry` goes right after `collect`; `drop` goes last, after `gift-leave`.**
- `carry`: mouth empty, grounded (`!s.perched`), an item on the ground within 1.2 m → `'E — pick up the ${label}'` where label is a plain-English name for the kind (sock, toy mouse, leaf, stick, pine cone, acorn, shell, bit of driftwood, bottle cap, bit of rope, glove, ribbon).
- `drop`: holding, and no other prompt matched → `'E — put the ${label} down'`.
- Neither pays anything, records a feat, or touches `s.walk.carried` (that is the pocket counter for collectibles, a different thing).
- At `endWalk`, before the dispose sequence: write every `walkEndMarks` pair through `progression.addMark`, and add one summary line when a `den` mark was written: `You brought the ${label} home. It's in the den now. 🏠`.
- `main.js` per-frame: `session.carry.items.update(dt)` beside `tippables.update`.

- [ ] **Step 1: Failing tests** (`promptHarness` style):

```js
test('near a carryable with an empty mouth: "E — pick up the stick"', ...);
test('holding something, with nothing else near: "E — put the stick down"', ...);
test('a stray in range still wins over drop', ...);
test('picking up and putting down pay nothing and record no feat', ...); // points, feats unchanged; no discovery
test('no carry prompt while perched', ...);
test('the collect pocket counter is untouched by carrying', ...);
```

And a `walk.js` text-level or harness test (follow how `test/rivalcats.test.js:339` slices walk.js) that the end-of-walk block calls `walkEndMarks` once and writes through `progression.addMark` only.

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Create the carryables right after `createTippables` in `startWalk` from `propsFor(areaId).carryables`.
- [ ] **Step 4: Run** `test/interactions.test.js` and the suite — PASS.
- [ ] **Step 5: Eye-check** (browser pane): pick up a carryable in the park, walk with it, see it in the cat's mouth from the orbit camera; put it down; pick it up again. Then on the **mobile preset**: the prompt pill reads "pick up the stick" / "put the stick down" and tapping it works. End a walk holding something and read the summary line.
- [ ] **Step 6: Commit** — `feat(carry): pick things up, put them down, and bring one home`

### Task 7: The den keeps what you carry

**Files:**
- Create: `src/render/playermarks.js` (den half here; outdoor half in Task 11), `test/playermarks.test.js`
- Modify: `src/game/walk.js` (the den branch)

**Interfaces:**
- Consumes: `progression.marksIn('den')`, `markOpacity`, `propsFor('den').keepSlots`, `buildCarryMesh`.
- Produces: `createPlayerMarks(scene, areaId, marks, { keepSlots = [] } = {}) → { list: [{key, kind, mesh, contested}], sync(marks), setContested(key), update(t), dispose() }`. In the den, `den` marks are placed **newest first into `keepSlots[0..7]`** (their stored `x,z` are ignored) as `buildCarryMesh(item)` resting on the floor, with `markOpacity(rank)` applied. Other kinds in the den are ignored. `sync(marks)` rebuilds only what changed (by `markKey`).

- [ ] **Step 1: Failing tests**

```js
test('the den shows each kept item, newest in the first slot', ...);
test('the seventh and eighth kept items are fainter', ...);
test('an unknown item kind still renders (fallback mesh) and an empty den renders nothing', ...);
test('sync adds a new item and drops the evicted ninth-oldest one', ...);
test('dispose removes every mesh and disposes every geometry and material once', ...);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**; create in the den branch of `startWalk`, dispose in `endWalk`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Eye-check:** carry two different things home from two walks, visit the den, see both on the floor near the hearth; check nothing overlaps a den cat's home or blocks the camera wedge (`DEN_CAMERA_WEDGE`).
- [ ] **Step 6: Commit** — `feat(den): the den keeps what you carry home`

### Task 8: Carrying in a co-walk

**Files:**
- Modify: `src/game/interactions.js`, `src/game/netevents.js`, `src/game/walk.js`
- Test: `test/netevents.test.js`, `test/interactions.test.js`

**Interfaces:**
- Consumes: `session.carry.items` (`take`, `placeAt`, `hold`), `session.remotes.list` (`{playerId, group}`), `session.areaData.bounds`.
- Produces two **additive** event types:
  - `{ v:1, id, type:'carry-pick', itemId }` — sent on a successful local pick when `s.net`.
  - `{ v:1, id, type:'carry-drop', itemId, pos:[x,z] }` — sent on every local drop (by the player or by rain).

Receiver rules (`applyRemoteEvent`):
- `carry-pick`: `itemId` must be a string naming an item in `s.carry.items.list`; the sender must be a remote in `s.remotes.list`. The item leaves the ground and is held by that remote's group. **If the receiver is holding that same item, nothing changes for the receiver — both cats hold one, nobody loses** (ruling: a simultaneous grab must never have a loser between two siblings; items are not unique treasures).
- `carry-drop`: the same id check, plus `pos` an array of two finite numbers inside `areaData.bounds`; the item is placed there on the ground. If the receiver is holding it, ignore.
- A remote that disappears (`DESPAWN_AFTER`, or leaving) takes its held item with it: it stays hidden for the rest of the walk on the receiver.
- Neither event pays points, writes the save, or records a mark on the receiver.

- [ ] **Step 1: Failing tests** (`netevents.test.js` harness):

```js
it('a partner pick takes the item off my ground and into their mouth', ...);
it('a partner drop puts it down where they left it', ...);
it.each([
  ['unknown id', { itemId: 'park-stick-99' }],
  ['non-string id', { itemId: 7 }],
  ['prototype key', { itemId: '__proto__' }],
  ['non-finite pos', { pos: [NaN, 0] }],
  ['out of bounds', { pos: [9999, 0] }],
  ['short pos', { pos: [1] }],
  ['sender not in this walk', { id: 'stranger-0000' }],
])('%s is ignored without throwing or saving', ...);
it('a pick for the item I am holding leaves mine in my mouth', ...);
it('a remote that leaves while carrying takes the item with it', ...);
it('no carry event pays points or writes the save', ...);
```

`interactions.test.js`: a local pick and a local drop each send exactly one event with the right shape; solo (no `s.net`) sends none.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** both files and the suite — PASS.
- [ ] **Step 5: Eye-check:** open two browser-pane tabs in one room (or the fake hub if the dev build has one) and watch one cat's pick and drop on the other screen. If a two-device room cannot be driven from the pane, say so in the report and rely on the tests — do not fake it.
- [ ] **Step 6: Commit** — `feat(carry): co-walkers see each other pick things up and put them down`

### Task 9: Rain makes you drop what you carry

**Files:**
- Modify: `src/weather.js`, `src/game/walk.js` or `src/main.js` (the per-frame hook), `src/game/interactions.js` (shared drop path)
- Test: `test/weather.test.js`, `test/carry.test.js`, `test/interactions.test.js`

**Interfaces:**
- Consumes: `tickRain` (Task 5); the existing private `createRainSchedule` phase.
- Produces: `weather.isRaining() → bool` — `true` only while `condition === 'rain'` **and** the schedule's phase is `'rain'` (not during the rainbow or after). Draws nothing from any rng. A walk with no weather object (dusk, den) reads as not raining.

When `tickRain` returns `true`, drop the item where the cat stands through the same drop path a player drop uses (so the `carry-drop` event goes out and a walk-end `drop` mark can follow), and toast once per slip: `Your paws are too slippery — you dropped the ${label}! 💧`. The item is on the ground at the cat's feet and can be picked straight back up (and slips again after another `RAIN_GRIP` seconds of rain). Nothing else happens: no points, no freeze, no feat.

- [ ] **Step 1: Failing tests**

```js
test('isRaining is true only in the rain phase of a rainy walk', ...); // clear/sunset → false; rain → true until stopAt, false in rainbow/after
test('isRaining draws nothing', ...); // a counting rng: same call count before and after many isRaining calls
test('a rain slip drops the item at your paws, pickable, and costs nothing', ...); // points, feats, marks unchanged; item onGround; prompt is "pick up" again
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Eye-check** on a rainy walk. Use a dev override if `walk.js` or settings already has one; otherwise force rain from the pane's JS console for the check only, and never commit an override. Carry something, wait, and watch it slip and the toast appear.
- [ ] **Step 6: Commit** — `feat(carry): rain makes your paws slippery and you drop what you carry`

---

# Phase 3 — Knock-downs, marks and the rival clans

### Task 10: Knock it off the ledge, and it stays down

**Files:**
- Create: `src/knockables.js`, `test/knockables.test.js`
- Modify: `src/game/interactions.js`, `src/game/netevents.js`, `src/game/walk.js`, `src/main.js`
- Test: `test/interactions.test.js`, `test/netevents.test.js`

**Interfaces:**
- Consumes: `propsFor(areaId).knockables`, `KNOCK_KINDS`.
- Produces: `createKnockables(scene, list) → { list:[{id,kind,group,down,anim}], nearest(pos, perchY, maxDist) /* standing only, |perchY - y| < 0.3 */, knock(entry) → bool, knockById(id) → bool, update(dt), dispose() }`. A knock animates a short fall from `(x, y, z)` to `fallTo` on the ground (≈ 0.5 s arc, a tip onto its side, a small settle) and **stays there for the rest of the walk**. Both devices land it at the same `fallTo`.
- Prompt kind `'knock'`, placed **right after `collect`, before `carry`**: perched, within 1.0 m, standing → `'E — knock it off! 😼'`.
- Award: `log.awardOnce('mischief', 'knock-' + id, 'knocked it off the ledge!')` — the same award and feat a `tip` pays, nothing more. `critters.dismayNear(pos, 8)` as `tip` does.
- Event: `{ v:1, id, type:'knock', knockId }`. Receiver: `knockById`, then the existing `maybeSnipeToast`; no points. Unknown / non-string / already-down ids are no-ops.

- [ ] **Step 1: Failing tests**

```js
test('a knocked cup falls to its fallTo and stays down', ...);
test('knocking twice is refused, and knockById on a down item is false', ...);
test('nearest only offers standing items at the cat\'s perch height', ...);
test('dispose is idempotent and frees every geometry and material', ...);
// interactions:
test('perched beside a cup: "E — knock it off! 😼", and knocking pays the tip award once', ...);
test('knock sends one knock event in a room walk and none solo', ...);
// netevents:
it.each([['unknown', 'docks-cup-9'], ['number', 3], ['proto', '__proto__']])('a %s knock id is ignored', ...);
it('a remote knock knocks it down here and pays nothing', ...);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Eye-check:** climb onto a garden wall in the neighborhood, knock a flowerpot off, watch it land and stay; walk away and back; it is still down. Check the falling item gets no floating contact shadow.
- [ ] **Step 6: Commit** — `feat(verbs): knock things off ledges, and they stay knocked off`

### Task 11: Your marks in the world

**Files:**
- Modify: `src/render/playermarks.js` (the outdoor half), `src/game/interactions.js`, `src/game/walk.js`
- Test: `test/playermarks.test.js`, `test/interactions.test.js`

**Interfaces:**
- Consumes: `propsFor(areaId).markables`, `progression.marksIn/addMark`, Task 6's walk-end drop marks, the existing `dig` handler.
- Produces:
  - Rendering per kind, outdoors: `scratch` — three short dark claw stripes on a small vertical quad at the markable's base, facing the approach side; `dig` — a flat, darker filled-in-hole decal (`CircleGeometry(0.28)`, `scent.js` idiom, y 0.02); `drop` — `buildCarryMesh(item)` lying on the ground at `x,z`, not interactive; `border` — a small player-coloured paw decal at the border point (Task 12 wires the rival side). Every mark takes `markOpacity(rank)` within its area. A mark whose `id` names no current prop still renders at its stored `x,z`; a mark with neither a usable id nor finite `x,z` is skipped.
  - The **contested look**: the mark's colour goes to the pale sandy `0xe6d9b8` that `bordermarks.js` uses for contested, at its own opacity. `setContested(key)` swaps it; `sync` restores it from the save.
  - Prompt kind `'mark'`, after the existing `scratch` (head scratches) branch: within 1.2 m of a markable that has no *uncontested* scratch mark of mine → `'E — scratch your mark into it'`. Pays nothing; `progression.addMark(area, {kind:'scratch', id, x, z, at: Date.now(), ...})`, then `playermarks.sync`.
  - The existing `dig` handler also writes a `dig` mark at the dig spot.

- [ ] **Step 1: Failing tests**

```js
test('each kind renders where it should, and the oldest two are fainter', ...);
test('a mark for a prop that no longer exists renders at its stored spot', ...);
test('a mark with no usable position is skipped, not thrown on', ...);
test('setContested swaps to the contested look and sync keeps it', ...);
// interactions:
test('beside a fence post: "E — scratch your mark into it"; scratching pays nothing and writes one mark', ...);
test('no mark prompt on a post already marked, uncontested', ...);
test('a contested mark offers the prompt again, and re-marking clears contested', ...);
test('digging a treasure also leaves a dig mark', ...);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Eye-check:** scratch a post, dig a treasure, drop a carried thing 3 m from its home, end the walk, walk the same area again: all three marks are there. Repeat until nine marks exist in one area and see the oldest fade then go.
- [ ] **Step 6: Commit** — `feat(marks): leave your mark, and find it there next time`

### Task 12: The rival clans contest your marks

**Files:**
- Modify: `src/rivalcats.js` (a getter only), `src/render/bordermarks.js` (a `ring` field only), `src/game/walk.js`, `src/game/interactions.js`, `src/marks.js`
- Test: `test/marks.test.js`, `test/bordermarks.test.js`, `test/rivalcats.test.js`, `test/interactions.test.js`

**Interfaces:**
- Consumes: `rivalFor`, `patrolPath`; `createRivalPatrol`; `createBorderMarks`'s `contested` option and `setContested`.
- Produces:
  - `CONTEST_REACH = 1.5`; `contestable(areaId, mark) → bool` (pure, in `marks.js`) — `true` for an uncontested `scratch`/`dig`/`drop` mark with `|hypot(x-cx, z-cz) - r| <= CONTEST_REACH` for that area's rival; `false` for `border`/`den`, unknown areas, or no rival.
  - `shouldContest(areaId, mark, patrolPos) → bool` — `contestable` and `hypot(mark - patrolPos) <= CONTEST_REACH`.
  - `createRivalPatrol(...)` gains a read-only `get pos() → {x,z}` (the patrol cat's current spot). Its imports do not change (`test/rivalcats.test.js:330` pins them).
  - `session.rival` gains `patrolPos() → {x,z}|null` and `borderMarks` (the `createBorderMarks` handle, or `null`); `NO_RIVAL` gets `patrolPos: () => null, borderMarks: null`.
  - `createBorderMarks` list entries gain `ring: <index in borderMarks(areaId)>`, so a saved ring index finds its decal on either tier.
  - **Rival → player:** while walking an area with a rival, at most 4 times a second, every mark that `shouldContest` gets `progression.contestMark(area, markKey(m))` and `playermarks.setContested(key)`. One toast per walk, the first time: `${rivalFor(areaId).name} scented over your mark! Scratch it again to take it back. 🐾`.
  - **Player → rival (border scent-over):** prompt kind `'border-mark'`, right after `'mark'`: within 1.0 m of a rendered border decal whose ring index has no `border` mark of mine → `'E — scent over their mark'`. Writes `{kind:'border', id: \`${areaId}-border-${ring}\`, x, z}` and calls the decal's `setContested(listIndex)`. At walk start, `createBorderMarks` gets `contested:` the list indices of my saved `border` marks for this area. A `border` mark is never contested back (Task 3's rule) — it *is* the contest.
  - **The 3a structural test still holds:** the walk.js slice from `"The rival's border and its patrol"` to `session.rival = {` must not gain `progression.`, `colony`, `award` or any of the other banned words (`test/rivalcats.test.js:339`). Compute the saved border indices **before** that comment, and put the contest loop in its own block **after** the `session.rival = { ... }` object, reading `session.rival.patrolPos()` and `session.rival.borderMarks`.

- [ ] **Step 1: Failing tests**

```js
// marks.test.js
test('only marks near the rival border are contestable, never border or den marks', ...);
test('shouldContest needs the patrol within reach', ...);
test('unknown areas and the den contest nothing', ...);
// bordermarks.test.js
test('each decal knows its ring index, on the low tier too', ...); // maxMarks: 8 keeps 6, ring values 0,2,4,...
// rivalcats.test.js
test('the patrol exposes where it is and still imports nothing new', ...);
// interactions.test.js
test('near a rival border mark: "E — scent over their mark"; it writes a border mark and pays nothing', ...);
test('a contested mark survives: same count before and after, only contested flips', ...);
test('contesting touches nothing but marks', ...); // points, colony, friends, grudges, golden unchanged
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** all five files and the suite — PASS (including the untouched 3a structural tests).
- [ ] **Step 5: Eye-check:** scratch the `nearBorder` markable in the docks, wait for the patrol to pass, see it go pale and read the toast; scratch it again and it is yours. Scent over one of their border marks and see it go pale; reload into a new walk and it is still pale.
- [ ] **Step 6: Commit** — `feat(clan): rival clans scent over your marks, and you can scent over theirs`

---

# Phase 4 — The world pushes back, and has places to be

### Task 13: Prey that evades

**Files:**
- Modify: `src/critters.js`, `src/game/walk.js` (pass hides)
- Test: `test/critters.test.js`

**Interfaces:**
- Consumes: `propsFor(areaId).hides`.
- Produces: `createCritters(scene, spawns, { ..., hides = [] })`. For `mouse`, `rat` and `squirrel` only:
  - `PREY_NOTICE = 3.5`, `PREY_NOTICE_STALKED = 1.2`, `HIDE_REACH = 0.4`.
  - A prey critter that is not already fleeing notices the cat within `PREY_NOTICE` (within `PREY_NOTICE_STALKED` while the cat is stalking, i.e. `markStalked`'s `isStalking`) and runs, at its existing dash speed, to the **nearest hide within 15 m**; with none, it dashes away exactly as a pounce-tag does today.
  - Reaching a hide: `hidden = true`, `group.visible = false`, `spottable = false`. A hidden critter is skipped by `nearest`, `pounceCatch`, `markStalked`, `catchAt`, `reactToMeow`, `dismayNear` and Far Call, **for the rest of the walk**.
  - A successful `pounceCatch` still pays exactly as today (`hunt`, slow-mo, fanfare are the caller's), and the caught critter then runs to its hide and hides — caught and released, never removed.
  - `onHide(critter)` option: called once when a critter hides *without* having been caught, so the walk can toast `The ${type} dived under cover! 🐭` (one toast per critter).
  - Birds, seagulls, butterflies and the rest are unchanged. Nothing new draws from the injected `rng` or from `Math.random` beyond the existing `phase`.

- [ ] **Step 1: Failing tests**

```js
it('a mouse bolts for its hide when the cat trots up, and stays hidden', ...);
it('a stalking cat gets much closer before the mouse notices', ...);
it('a hidden critter cannot be pounced, spotted, meowed at or called', ...);
it('a caught mouse pays once and then hides too', ...);
it('with no hides it dashes away and comes back, as before', ...);
it('birds are untouched', ...); // same positions frame by frame as before the change, on a seeded run
it('evasion draws nothing from the injected rng or from Math.random', ...); // spy both
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** Check that a hidden critter's mover decal (`decals.follow`) hides with it; if `contactshadows.js` does not honour `visible`, set the decal's radius to 0 through whatever handle `follow` offers, and say so in the report.
- [ ] **Step 4: Run** `test/critters.test.js test/interactions.test.js test/pounce.test.js` and the suite — PASS.
- [ ] **Step 5: Eye-check:** in the neighborhood, trot at a mouse (it bolts and vanishes under cover, toast), then stalk another one and catch it.
- [ ] **Step 6: Commit** — `feat(prey): mice and squirrels bolt for cover, and what gets away stays hidden`

### Task 14: Push through flaps and gaps

**Files:**
- Create: `src/pushthrough.js`, `test/pushthrough.test.js`
- Modify: `src/game/walk.js`, `src/main.js`

**Interfaces:**
- Consumes: `propsFor(areaId).flaps`, `frameColliders`.
- Produces: `createPushThroughs(scene, flaps) → { list:[{id,kind,group,swing,vel,pushed}], colliders: [{x,z,r}], update(dt, movers: THREE.Vector3[]), dispose() }`.
  - `flap`: a garden-gate panel with a cat flap in it; `gap`: a hedge section with a cat-sized gap and leaves in it.
  - A mover crossing the flap's plane within `width / 2` of its centre gives the flap a swing impulse in its direction of travel (a damped spring on `rotation.x` of the flap leaf; the hedge's leaves rustle and the hedge sways for a gap).
  - **It stays swinging until you go home:** after the first push, the swing never decays below a gentle `0.06 rad` sway.
  - `movers` is the local cat plus every remote cat, so a partner's push swings it on my screen too, with no wire event.
  - No points, no feat, no sound unless `audio.js` already has a fitting one (check; do not add synthesis).
  - In `startWalk`, after `clearSpot` has moved the POIs and before `createPlayer`'s first `update`, append `pushThroughs.colliders` to `areaData.colliders` so the frame blocks the cat and the opening does not.

- [ ] **Step 1: Failing tests**

```js
test('walking through the opening swings the flap the way you went', ...);
test('passing beside the frame, outside the opening, does nothing', ...);
test('a pushed flap keeps a gentle sway for good', ...); // after 120 s of update, |swing| amplitude >= 0.05
test('a remote cat pushes it too', ...);
test('the frame colliders leave the opening walkable', ...); // isWalkableAt with them appended
test('dispose is idempotent', ...);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `test/pushthrough.test.js test/rivalworld.test.js test/propsets.test.js` and the suite — PASS.
- [ ] **Step 5: Eye-check:** walk through a flap and a gap in two areas, from both sides; walk away and look back — still swaying. Check the frame reads as a gate or hedge, not floating geometry, and that the cat cannot clip through the frame.
- [ ] **Step 6: Commit** — `feat(verbs): cat flaps and hedge gaps that swing when you push through`

### Task 15: Drink, eat and nap — with no score

**Files:**
- Create: `src/rests.js`, `test/rests.test.js`
- Modify: `src/game/interactions.js`, `src/game/avatar.js`, `src/game/walk.js`
- Test: `test/interactions.test.js`

**Interfaces:**
- Consumes: `propsFor(areaId).rests`, `REST_KINDS`.
- Produces:
  - `createRests(scene, rests) → { list:[{id,kind,x,z,group|null}], nearest(pos, maxDist), dispose() }` — builds a water bowl / birdbath for `drink`, a food dish / fish crate for `eat`, a sunny cushion or warm doormat for `nap`; `mesh: false` entries (the den's bowls and nap fixture) get no new mesh.
  - Prompt kind `'rest'`, right after `'border-mark'`: grounded, within 1.2 m → `'E — have a drink'` / `'E — have a nibble'` / `'E — curl up for a nap'`.
  - `handleInteract('rest')` sets `session.rest = { kind, t }`: `drink`/`eat` hold the existing head-down `'sniff'` pose for 3 s with a soft lap/munch toast (`Slurp, slurp. 💧` / `Nom nom. 🐟`); `nap` holds `'nap'` with `audio.purr` until the player moves (`player.inputActive`), toast `Zzz… 💤`. The pose priority in `avatar.js` puts `rest` right after `sniff`.
  - **No score:** no `log.award*`, no `recordFeat`, no goal progress, no discovery event. Ever.
- [ ] **Step 1: Failing tests**

```js
test('each rest kind gets its own prompt', ...);
test('drinking, eating and napping pay nothing, record no feat and move no goal', ...); // points, feats, goals, bus discovery spy
test('a nap lasts until you move', ...);
test('the den rests use the bowls already there and add no mesh', ...);
test('createRests never throws on an empty or unknown list', ...);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Eye-check:** drink, eat and nap once outdoors and once in the den, desktop and mobile preset (the prompt pill must work for all three).
- [ ] **Step 6: Commit** — `feat(verbs): somewhere to drink, eat and nap, for nothing but the fun of it`

### Task 16: A dog in every area

**Files:**
- Create: `src/dogs.js`, `src/yarddog.js`, `test/dogs.test.js`, `test/yarddog.test.js`
- Modify: `src/world/neighborhood.js:315`, `src/world/docks.js:422` (delete the `dog` critter spawn only), `src/game/walk.js`, `src/game/interactions.js` (spotting), `src/main.js`
- Test: the area tests that count critter spawns, `test/interactions.test.js`

**Interfaces:**
- Consumes: `propsFor(areaId).dogYard`, `isWalkableAt` (player.js), `chaseAllowed` (rivalcats.js).
- Produces, `src/dogs.js` (pure, imports nothing that stores progress):
  - `DOG_NOTICE_STALKED = 0.5` (fraction of the yard radius at which a stalking cat is noticed), `DOG_LANDING_OFFSET = 1.5`, `DOG_COOLDOWN = 8`.
  - `inYard(yard, x, z) → bool` (false for null / non-finite).
  - `dogNotices(yard, catPos, { stalking }) → bool` — in the yard, and within `r * DOG_NOTICE_STALKED` of the centre if stalking.
  - `dogLanding(yard, catPos, isWalkable) → {x,z}|null` — on the centre→cat ray at `r + DOG_LANDING_OFFSET`, then the `findLanding` search pattern from `rivalcats.js` (6 steps out, then ±15° arcs); `null` means no chase.
- Produces, `src/yarddog.js` (THREE): `createYardDog(scene, yard, { reducedMotion, isWalkable, canChase, fearless, onChase, onBark, onSettled }) → { update(dt, catPos, avatar, { stalking }), spotPos: {x,z}|null, dispose() }`. Unknown yard → an inert `NO_DOG`.
  - The dog lies by its kennel, head up, tail going. When `dogNotices` and `canChase()` and its cooldown is clear: `onBark()` (the caller plays `audio.bark()`), then **if not `fearless`** a chase exactly like the rival patrol's scamper (write `catPos.x/z` along a smoothstep to the landing over 0.65 s — 0.3 s reduced motion — with a small hop; the dog bounds after the cat to the yard edge and stops), `onChase()` once, `onSettled()` on arrival, `DOG_COOLDOWN` from then. `fearless` cats (breed special `'fearless'` or `'steady'`, the same pair the shipped bark-freeze spares) are only barked at.
  - Toasts (walk.js): chase `Woof! The dog chased you off its lawn! 🐕`, fearless `The dog barks. You don't even flinch. 😼`.
  - **Takes nothing.** No points, no freeze, no drop (a carried item stays in your mouth), no marks, no taming. `yarddog.js` and `dogs.js` must not import `progression`, `colony`, `discoveries`, `enemies` or `marks` — pin it like `test/rivalcats.test.js:330`.
  - The two shipped critter dogs are removed from `critterSpawns`, so each area has exactly one dog. The journal still records a dog: `updateInteractions`' spotting pass treats `s.dog.spotPos` like a critter (`awardOnce('critter', 'spot-dog', …)` + `recordSighting('dog')`), so spotting a dog pays what it paid before.
  - Perched cats are safe (`chaseAllowed` — taunting the dog from the fence is the joke), and photo mode never chases.

- [ ] **Step 1: Failing tests**

```js
// dogs.test.js
test('inYard and dogNotices, walking and stalking', ...);
test('the landing is outside the yard and walkable, or null', ...); // against the real built areas, like rivalworld.test.js
test('hostile input is never in the yard', ...);
// yarddog.test.js
test('a trotting cat in the yard is chased out once, then the dog cools down', ...);
test('a fearless cat is barked at and not moved', ...);
test('a perched cat or photo mode is never chased', ...);
test('the dog takes nothing: its modules import nothing that stores progress', ...);
// interactions / area tests
test('each area has exactly one dog, and no dog critter spawn remains', ...);
test('spotting the dog still pays the critter award and records a sighting', ...);
test('a chase leaves a carried item in your mouth', ...);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** the new files, `test/neighborhood.test.js test/docks.test.js test/critters.test.js test/interactions.test.js` and the suite — PASS.
- [ ] **Step 5: Eye-check** all four dogs: trot into each yard (chased out, toast), stalk in (closer before it notices), sit on a fence beside the yard (safe). On the mobile preset, run one chase and confirm the joystick still works afterwards.
- [ ] **Step 6: Commit** — `feat(risk): a dog in every area that chases you off its lawn and takes nothing`

---

# Phase 5 — Legendary cats

### Task 17: Four legendary names that every gate accepts

**Files:**
- Modify: `src/straynames.js`, `src/straycats.js` (the `STRAY_NAMES` line only), `src/clanwords.js` (four `CAT_PREFIXES` entries after the kit block)
- Create: `src/legendary.js` (the name→area table only, here), `test/legendary.test.js`
- Test: `test/straycats.test.js`, `test/clannames.test.js`, `test/clanwords.test.js`

**Interfaces:**
- Produces:
  - `LEGENDARY_NAMES = ['Duchess', 'Professor Whiskers', 'Captain Barnacle', 'Lord Midnight']` in `straynames.js` — a **third separate block**, never appended to `CAT_NAMES`. `isStrayName` accepts them (its `NAME_SET` gains the block).
  - `straycats.js:162` — `STRAY_NAMES` gains `...LEGENDARY_NAMES`, so a legendary cat walking as a stray passes `isGrudgeableStray` and stays feedable (the exact lesson of 3a commit `122ec02`). Touch that one line and its import, nothing in the D2 comment block above it.
  - `LEGENDARY_BY_AREA = { neighborhood: 'Duchess', park: 'Professor Whiskers', seaside: 'Captain Barnacle', docks: 'Lord Midnight' }` and `isLegendaryName(v) → bool` in `src/legendary.js`.
  - `CAT_PREFIXES` gains one hand-picked word per legendary name, obeying every rule its test enforces (3–8 letters, `/^[A-Z][a-z]{2,7}$/`, unique, not a stored name, not a `PREFIXES` or `RIVAL_PREFIXES` word, no denied or invalid name with `kit`, `paw` or any `WARRIOR_SUFFIXES` entry, no doubled consonant at the join). Key order: `CAT_NAMES`, then `KIT_NAMES`, then `LEGENDARY_NAMES`.

If any of the four names fails a gate — a test, `isShy(name)` being true (see below), or a clash with a `CATALOG.cats` name, including the incoming `D2` and `Digit` — replace that name with another kid-friendly grand title and record the swap in the report. **Names must not be shy** (`isShy(name) === false`), so a child walking alone can tame one; pin it.

- [ ] **Step 1: Failing tests / test updates**

```js
// legendary.test.js
test('four legendary names, one per colony area, in a block of their own', () => {
  expect(LEGENDARY_NAMES).toHaveLength(4);
  expect(Object.keys(LEGENDARY_BY_AREA).sort()).toEqual([...COLONY_AREAS].sort());
  for (const n of LEGENDARY_NAMES) { expect(CAT_NAMES).not.toContain(n); expect(KIT_NAMES).not.toContain(n); }
});
test('every legendary name passes isStrayName, the feed RPC regex and the family-pet gate', () => {
  for (const n of LEGENDARY_NAMES) {
    expect(isStrayName(n)).toBe(true);
    expect(n).toMatch(/^[A-Za-z][A-Za-z ]{0,23}$/);
    const cat = { name: n }; expect(isGrudgeableStray({ strays: [cat] }, cat)).toBe(true);
  }
});
test('no legendary cat needs a second feeder', () => { for (const n of LEGENDARY_NAMES) expect(isShy(n)).toBe(false); });
test('a legendary cat can be fed and tamed through the ordinary feed path', ...); // feedCat ×6 → tamed, no new field on the cat
```

Update, without weakening any assertion: `test/clannames.test.js`'s `ALL_NAMES` becomes `[...CAT_NAMES, ...KIT_NAMES, ...LEGENDARY_NAMES]` (64), "60 distinct warrior names" → 64, "180 distinct clan names" → 192, the unique-word test → 64; the "keeps its old prefix (20 kept)" test walks only the first 60 (legendary prefixes are hand-picked and say so). `test/straycats.test.js` — the family-pet disjointness test (`:502`) and the RPC regex test (`:962`) include `LEGENDARY_NAMES`; `CAT_NAMES` is still exactly 48. `test/clanwords.test.js:88` — no legendary name is a `PREFIXES`, `CAT_PREFIXES` or `RIVAL_PREFIXES` word.

- [ ] **Step 2: Run** the four test files — FAIL.
- [ ] **Step 3: Implement.** Header comment on the block in `straynames.js`, in the voice of the `KIT_NAMES` one: a separate block so `CAT_NAMES` and `walkRng` are untouched; the server needs no change because `colony_cats.name` is plain text and the RPC regex is pinned.
- [ ] **Step 4: Run** the four files and the suite — PASS.
- [ ] **Step 5: Commit** — `feat(legendary): four legendary cats' names, accepted by every gate`

### Task 18: Finding a legendary cat

**Files:**
- Modify: `src/legendary.js`, `src/straycats.js` (`createStrayCats` option), `src/game/walk.js`, `src/game/interactions.js` (`awardStrayGreet`)
- Test: `test/legendary.test.js`, `test/straycats.test.js`, `test/interactions.test.js`

**Interfaces:**
- Consumes: Task 17's tables; `state.friends`, `catsInArea(colony, area)`.
- Produces, `src/legendary.js` (pure):
  - `ODDS_EARLY = 1 / 5`, `ODDS_LATE = 1 / 20`, `A_COUPLE = 2`, `LEGEND_SALT = 0x1e6e7d00`.
  - `isFound(state, name) → bool` — I have greeted it (`friends[name].greets >= 1`) **or** it is a cat in the shared colony.
  - `foundCount(state) → int` over the four.
  - `legendaryOdds(found) → number` — `found < A_COUPLE ? ODDS_EARLY : ODDS_LATE`.
  - `legendaryFor(state, areaId, u) → name|null` — the area's legendary cat appears when it is **not in the colony for this area** (then it is already cast as a colony cat) and either it is found (a found-but-not-yet-fed cat always comes back, so it can be fed) or `u < legendaryOdds(foundCount(state))`. Unknown area, the den, or a non-finite `u` → `null`.
  - `legendaryRoll(roomSeed) → number` — `Math.random()` solo; `mulberry32((roomSeed ^ LEGEND_SALT) >>> 0)()` in a room walk, so a partner pair rolls the same `u`.
- `createStrayCats(..., { extras = [] })` — each `{ name, rng }` adds one stray **after** the ordinary cast, drawing its x, z, facing, personality and timer from **its own `rng`**, never from the walk's. It is a real entry in `strays` (so `isGrudgeableStray`'s identity half holds), uses `isShy(name)` for personality like a colony cat, and wanders on `strayWanderRng`. walk.js passes `extras: [{ name, rng: mulberry32((seedFromCode(name) ^ (roomSeed ?? random)) >>> 0) }]` **only on a colony walk** (`colonyWalk`, so solo or partner-only) and never in the den.
- A legendary stray looks the part: a soft gold glow decal under it (flat, follows it; `scent.js` idiom) and `✨ ` before its name on the tag. No stored per-cat field.
- `awardStrayGreet`: the first greet *ever* of a legendary cat (its `greets` going 0 → 1) also pays `log.award('legend', 'legend-' + name, \`a legendary cat — ${name}! ✨\`)` and `audio.fanfare()`. Later greets pay the ordinary friend award only.
- Joining the colony is the ordinary feed path — nothing new. If `canFeed` says `'full'`, it says so as it does for any cat.

- [ ] **Step 1: Failing tests**

```js
test('one in five until a couple are found, then one in twenty', () => {
  expect(legendaryOdds(0)).toBe(1 / 5); expect(legendaryOdds(1)).toBe(1 / 5);
  expect(legendaryOdds(2)).toBe(1 / 20); expect(legendaryOdds(4)).toBe(1 / 20);
});
test('a found cat always comes back until it is fed; a colony cat is cast as one instead', ...);
test('the den, unknown areas and a bad roll show no legendary cat', ...);
test('partners roll the same number; solo rolls do not touch walkRng', ...);
// straycats.test.js
test('a legendary extra draws nothing from the walk rng', () => {
  // count calls of a counting rng with and without extras: exactly 47 + 5 * count both times
});
test('a legendary extra is a real, grudgeable, feedable stray', ...);
// interactions.test.js
test('meeting a legendary cat for the first time pays legend once, ever', ...);
// walk-level (text slice or harness)
test('a walk with a non-partner never passes extras', ...);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS, and the "colony cats do not change how many walkRng values a spawn draws" tests (`test/straycats.test.js:813-835`) unchanged.
- [ ] **Step 5: Eye-check** with the roll forced in the console (never committed): meet Captain Barnacle at the seaside, see the glow and the ✨ tag, read the toast; feed it; check the Colony tab shows it with its clan name.
- [ ] **Step 6: Commit** — `feat(legendary): one rare cat in every area, who can join the colony`

---

# Phase 6 — Below the first cut line

### Task 19: Wet paws print until they dry

**Files:**
- Create: `src/wetpaws.js` (pure), `test/wetpaws.test.js`
- Modify: `src/game/avatar.js`, `src/game/walk.js`

**Interfaces:**
- Produces: `src/wetpaws.js` — `WET_TIME = 12`, `PRINT_STEP = 0.45`, `PRINT_LIFE = 20`; `wetAfter(event) → seconds` (`'puddle'` → `WET_TIME`, `'drink'` → `4`, `'rain'` → `WET_TIME` refreshed while `isRaining()`); `printDue(state, catPos) → bool` (true every `PRINT_STEP` metres travelled while wet). avatar.js lays a `kitten.js`-style paw print (dark, `CircleGeometry(0.06)`, y 0.02) when due; each fades over `PRINT_LIFE` and is disposed. Capped at 60 live prints. Nothing saved, nothing synced, no score.

- [ ] **Step 1: Failing tests** — wet after a puddle, prints every step while wet, dry after `WET_TIME`, rain keeps you wet, cap of 60, nothing drawn from any rng.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5: Eye-check:** step in a puddle on a rainy walk and see the prints behind you fade.
- [ ] **Step 6: Commit** — `feat(verbs): wet paws leave prints until they dry`

---

## Self-review notes (for the executor)

- Spec coverage, §9's 3b list → tasks: carry 5–9; knock-down-and-stays-down 1, 10; prey 13; push-through 14; drink/eat/nap 15; prop ids 1–2; within-walk persistence 1, 6, 10, 13, 14, 19; six to eight marks per area, oldest fading 3, 7, 11; the den keeps what you carry and it counts as a mark 6, 7 (ruling: it is a mark of the **den**'s own eight, see the ledger); one dog per area 16; rain drops what you carry 9; four legendary cats 17–18; gold mice "x of 12" 4; co-walk sync of knock-downs and carried items 1, 8, 10; rival clans contest marks 12.
- Rulings already taken in this plan, to be copied into the ledger at setup: no new score except knock (as tip) and first legendary meeting; prey is tagged-and-released, never carried; a simultaneous co-walk grab has no loser; the den's kept items are the den's own eight marks; dropped-item marks are decorative, not pickable on later walks; a carryable always starts at home; legendary cats only on colony walks; legendary names are non-shy; `border` marks are never contested back.
