# Clan Life, Part 2: Intruders and Fights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Now and then a warrior from a neighbouring clan walks across a territory. A kid who is at home there can challenge it to a "read the move" fight: best of three rounds, an honest clue, three big buttons. Win and it runs back over the border; lose and it walks on. Losing never takes anything, and both screens of a co-walk agree.

**This is Part 2 of 2.** It lands after `docs/superpowers/plans/2026-10-31-clan-life-1-cast-camp-verbs.md` (all of it) and uses its interfaces by name.

**Architecture:**
- **An intruder belongs to the territory and the clock**, exactly as the rival patrol does. `intruderAt(areaId, t)` is pure over the wall clock: which visit it is, which neighbour clan, which of that clan's warriors, and where on a hand-probed route. Every device in a walk computes the same intruder in the same place, whatever its edition or picks. No stream, no save, nothing on the wire.
- **Only the fight is local.** Hostility is per device: the intruder puffs up and offers a fight only to a kid who is at home there (`session.clanHome`) and whose picks don't include the intruder's clan. The fight runs on that kid's device.
- **Two events keep co-walks in step:** `intruder-fight` (hold it still, facing the fighter) and `intruder-done` (flee, or walk on). That is enough: the rounds themselves are not shown on the other screen (spec §4 asked the builder to confirm; this is the confirmation, and Part 1's "Questions for the owner" lists the rest). After a loss the intruder glides back onto the clock's position, so both screens agree again.
- **Pure rules, thin wiring.** `src/fight.js` is the whole fight as a pure state machine, `src/ui/fightui.js` the DOM, `src/game/clanfight.js` the controller that joins them to the intruder, sound and awards. The controller is given no progression object at all, and its lose path calls nothing but the intruder's `release`.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4, plain ES modules.

**Spec:** `docs/superpowers/specs/2026-10-31-clan-life-design.md`: decisions 4–7 and 9; "What stays true"; §4 in full; §5's table; the anti-goals.

## Depends on

1. **Clan Life Part 1**, all tasks. Used by name: `clanCast`, `castFor`, `RAIDER_SLOTS`, `tagSubFor`, `CLAN_COLOURS` (`src/clancast.js`); `campLayout` (`src/world/camp.js`); `session.clanHome`, `session.clanEdition`, `session.clanCats`; the stray count `lonersFor` (it already reserves the intruder's slot); `makeNameTag(name, { cross, sub })`.
2. **Pick your clan**, all tasks: `HOMES` (neighbours), `isClanId`, `clanName`, `picksOf`, `DISCS`, and the walk.js `picks` local.
3. **The new cat body**: this plan adds one pose (`swipe`) to `src/cat/animator.js`.

## Global Constraints

- Everything in Part 1's Global Constraints holds here too (streams, co-walk agreement, budget, SAVE_VERSION 4, our own words and the borrowed-word scan, reduced motion, tests by membership, commits, the test command).
- **Losing a fight changes nothing in progression.** No points, cats, unlocks, marks, walks, taming, grudges or feats. `src/fight.js`, `src/intruders.js` and `src/ui/fightui.js` import nothing that stores progress; `src/game/clanfight.js` is given no progression; its lose path is asserted structurally and by behaviour (Task 4).
- **Never sibling against sibling:** a kid is never offered a fight against a cat of either kid's clan (`picks.includes(intruder.clan)` → no fight). Fights only on land where you are at home, never in Legacy, the old areas, the island or someone else's territory.
- **Not a reflex test:** any tap within the answer window counts the same; speed never matters. The clue is honest: it always shows the move that follows.
- **Budget:** one intruder mesh at a time, inside the slot Part 1 reserved (`INTRUDER_SLOTS = 1`). A fight adds only short-lived `fx` bursts and the DOM panel.
- **Phone first:** the three move buttons sit in the bottom third of the screen, full width, each at least 88 px tall, with the safe-area inset. Desktop also takes keys.

## Builder's defaults

| Thing | Default |
|---|---|
| How often | one visit slot every `INTRUDER_PERIOD = 120` s of wall clock; 3 slots in 4 have an intruder (`h % 4 !== 0`); it enters `ENTER_AT = 10` s into its slot and walks at `INTRUDER_SPEED = 0.9` m/s. At most one at a time; about 3 in a 10-minute walk. |
| Who | a warrior (slots 4–6) of one of `HOMES[area].neighbours`, chosen by the slot's hash. |
| Where | one hand-probed route per (territory, neighbour clan): it enters at the map edge facing that clan and leaves at an edge; ≤ 90 m long; never within `r + 3` m of the camp centre (spec: "never at the camp's doorstep"). |
| Noticing | within 6 m it puffs up (`cross` pose) and hisses once per visit; within `CHALLENGE_RANGE = 3.5` m the Fight / Back off panel shows; it hides beyond 6 m. The intruder keeps walking while the panel is up. |
| Counters | crouches low → it will **pounce** → you **Dodge**; raises a paw → it will **swipe** → you **Pounce** (under the paw); backs up → it will **charge** → you **Swipe**. Teach line: "Crouch → Dodge · Paw up → Pounce · Backs up → Swipe". |
| Timings | square-off 1.2 s; each round's clue stays up for the whole answer window of 4.0 s (taps in the first 0.25 s are ignored, so a tap meant for the last round can't land); tumble 1.4 s (0.6 s dust puff with reduced motion); 0.8 s between rounds. Longest fight about 20 s. |
| Personality edge | `longerLook` (+1.0 s answer window) for `fearless`, `keenNose`, `chaser`; `secondLook` (once per fight, a round that times out replays its clue instead of being lost) for `steady`, `pouncer`, `napper`, `bird`. Every cat has one; neither changes what a wrong tap does, so neither decides a fight. |
| Moves | each round's move is `MOVES[floor(rng() * 3)]` from `mulberry32(seedFromCode(`${walkStamp}|${visit}|${attempt}`))`: local, no shared stream. |
| After | win: it runs back along its route to where it came in at `FLEE_SPEED = 4.5` m/s and is gone for the rest of its visit; `intruder: 12` points once per visit; the journal counts it. Lose: it glides back onto its route over 1.5 s and walks on; you can challenge it again after `RECHALLENGE_DELAY = 20` s. |
| Sound | `audio.hiss()` on squaring off; each round `audio.pounceWhoosh()` then `audio.landThump()` 0.25 s later. |
| Co-walk | `HOLD_MAX = 40` s: a hold with no `intruder-done` is released on its own. |

## Review Focus

1. **Two kids at home press Fight on the same intruder at once.** Expected: both fights run; the intruder flees on both screens if either wins; a later "walked on" never un-flees it. Test: Task 5 "fled wins over walked-on, in either order".
2. **The intruder belongs to a kid's clan** (sister picked GaleClan, a GaleClan warrior crosses StormClan's woods). Expected: no fight for either kid; it is a cat passing through. Test: Task 2 "an ally clan's cat is never hostile".
3. **A kid who never taps.** Expected: each round is lost only after the full window (4 s, or 5 s with the longer look); the second look replays once. Test: Task 3 "timeouts lose slowly, and the second look replays once".
4. **The fight is interrupted** (walk ends, the tab hides, the co-walker leaves, the device is Legacy). Expected: no award, no stuck input, intruder released; Legacy never shows the panel. Tests: Task 4 "ending the walk mid-fight releases the cat and pays nothing", "Legacy never shows the panel".
5. **Hostile or stale events** (`visit` not a number, another area, a sender who isn't a remote, a `done` for a visit that has ended). Expected: ignored, never thrown. Test: Task 5.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/intruders.js` | **create** | pure: schedule, routes, `intruderAt`; THREE: the walking, held and fleeing intruder |
| `src/fight.js` | **create**, pure | moves, counters, timings, edges, the best-of-three state machine |
| `src/cat/animator.js` | modify | the `swipe` pose (a raised front paw) |
| `src/ui/fightui.js` | **create** | challenge panel and fight panel: pure HTML renderers + a small DOM mount |
| `src/game/clanfight.js` | **create** | the controller: challenge → fight → outcome, the world choreography, awards |
| `src/game/walk.js`, `src/main.js`, `src/game/avatar.js`, `src/game/interactions.js` | modify | wiring; input held during a fight |
| `src/discoveries.js` | modify | `AWARDS.intruder = 12` |
| `src/journal.js`, `src/ui/homebase.js` | modify | "Intruders chased off" line (Clan Edition) |
| `src/game/netevents.js` | modify | `intruder-fight` / `intruder-done` |
| `src/style.css` | modify | the panels |

---

### Task 1: When and where intruders walk (pure)

**Files:**
- Create: `src/intruders.js` (the pure half only in this task)
- Test: `test/intruders.test.js`, `test/rivalworld.test.js` (built-map route checks)

**Interfaces:**
- Consumes: `HOMES`, `isClanId` (clanhomes); `castFor`, `clanCast`, `RAIDER_SLOTS` (clancast); `DISCS` (rivalclans); `seedFromCode` (rng).
- Produces:
  - Constants above: `INTRUDER_PERIOD`, `ENTER_AT`, `INTRUDER_SPEED`, `ROUTE_MAX = 90`, `FLEE_SPEED`, `NOTICE_RANGE = 6`, `CHALLENGE_RANGE`, `RECHALLENGE_DELAY`, `HOLD_MAX`.
  - `INTRUDER_ROUTES: Readonly<Record<areaId, Readonly<Record<ClanId, readonly {x, z}[]>>>>`: one route per neighbour clan for `woods`, `river` and `moor` (six routes), hand-probed (Step 3).
  - `visitAt(areaId, t) -> { visit: number, clan: ClanId, member: Member } | null`: `k = Math.floor(t / INTRUDER_PERIOD)`; `h = seedFromCode(`${areaId}|intruder|${k}`)`; `null` if `h % 4 === 0`, if `castFor(areaId)` is empty, or if there is no route for the clan. `clan = neighbours[(h >>> 2) % neighbours.length]` (only neighbours with a cast and a route); `member = clanCast(clan)[RAIDER_SLOTS[(h >>> 4) % 3]]`.
  - `intruderAt(areaId, t) -> { visit, clan, member, x, z, dx, dz, s } | null`: on the map only while `0 ≤ s ≤ length`, where `s = (t − k·PERIOD − ENTER_AT) · SPEED`; `(dx, dz)` is the unit heading. `null` for a bad `t`, an unknown area or an empty slot.
  - `routePoint(route, s) -> { x, z, dx, dz }` and `routeLength(route) -> number` (exported for the flee and the tests).

- [ ] **Step 1: Write the failing tests**

`test/intruders.test.js`:

```js
test('the same intruder in the same place on every device at the same moment', () => {
  for (const t of [1e9, 1e9 + 33.3, 1e9 + 500]) expect(intruderAt('woods', t)).toEqual(intruderAt('woods', t));
});
test('an intruder is always a warrior of a neighbouring clan, never the land\'s own clan', () => {
  for (let k = 0; k < 400; k++) {
    const v = visitAt('woods', k * INTRUDER_PERIOD + 30);
    if (!v) continue;
    expect(HOMES.woods.neighbours).toContain(v.clan);
    expect(v.clan).not.toBe('woods');
    expect(RAIDER_SLOTS).toContain(v.member.slot);
  }
});
test('about three slots in four have one, and at most one at a time', () => { /* 400 slots: 0.65 < rate < 0.85; intruderAt never returns two */ });
test('every visit leaves the map before the next slot begins', () => {
  for (const area of Object.keys(INTRUDER_ROUTES)) for (const route of Object.values(INTRUDER_ROUTES[area])) {
    expect(ENTER_AT + routeLength(route) / INTRUDER_SPEED).toBeLessThan(INTRUDER_PERIOD);
  }
});
test('no intruders outside the territories with camps', () => {
  for (const a of ['neighborhood', 'park', 'seaside', 'docks', 'den', 'island', '__proto__', undefined]) expect(intruderAt(a, 1e9 + 40)).toBeNull();
});
test('bad clocks give no intruder and never throw', () => { for (const t of [NaN, Infinity, -Infinity, '5', null]) expect(intruderAt('woods', t)).toBeNull(); });
test('intruders.js stays free of anything that stores progress', () => {
  /* import specifiers ⊆ ['three', './cat/model.js', './cat/animator.js', './nametag.js', './rng.js', './clanhomes.js', './clancast.js', './rivalclans.js'] */
});
```

`test/rivalworld.test.js`, a `describe('intruder routes in the real territories')` over every area with routes:
- each route's first and last points are within 1.5 m of a bounds edge, and the first is on the edge nearest the clan it belongs to (the woods' `moor` route enters from the north, `river` from the west; read each from the territory map's layout, and write the rule down in the route's comment);
- every point every 0.5 m along every segment is walkable (`isWalkableAt`) and clears every collider by `CAT_RADIUS`;
- every sample is ≥ `DISCS[a].r + 3` from the camp centre;
- length ≤ `ROUTE_MAX`.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/intruders.test.js test/rivalworld.test.js`
Expected: FAIL. `src/intruders.js` isn't found.

- [ ] **Step 3: Probe the routes, then implement.** Use a throwaway test (not committed) on each built map: 4–7 waypoints from the clan's side to another edge, along open ground and paths, round water and the camp. Write the six routes into `INTRUDER_ROUTES` with one comment per route naming where it goes (e.g. "in from the Moor side, down the east path, out by the river ford"). Then implement the pure functions. The header says why the intruder is a function of the clock (co-walk agreement with nothing on the wire) and that the island and the old areas never get one.

- [ ] **Step 4: Run them and check they pass**

Run: `npx vitest run test/intruders.test.js test/rivalworld.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/intruders.js test/intruders.test.js test/rivalworld.test.js
git commit -m "feat(clanlife): intruders from the neighbouring clans, scheduled by the clock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Intruders in the world

**Files:**
- Modify: `src/intruders.js` (the THREE half), `src/game/walk.js`, `src/main.js`
- Test: `test/intruders.test.js`, `test/walk.edition.test.js`

**Interfaces:**
- Consumes: Task 1; `buildCat`, `animateCat`, `makeNameTag`, `tagSubFor`; `session.clanHome`, `picks`.
- Produces:
  - `isHostile(intruder, { clanHome, picks }) -> boolean` (pure): `clanHome === true` and `picks` doesn't include `intruder.clan`.
  - `createIntruders(scene, areaId, { now = () => Date.now() / 1000, reducedMotion, showNames, hostile: (clan) => boolean, onNotice }) -> Intruders`:
    - builds the visit's cat (`buildCat(member.breed, undefined, { simple: true })`, scale 0.85) when a visit starts and disposes it when the visit ends, so at most one mesh exists; tag only when `showNames`: `makeNameTag(member.name, { cross: hostile(clan), sub: tagSubFor(member) })`;
    - `update(dt, catPos)`: in `walking`, the mesh sits at `intruderAt` (pose `follow`); when hostile and within `NOTICE_RANGE` of `catPos` it plays `cross` and calls `onNotice(current)` once per visit (walk.js plays `audio.hiss()`);
    - `current() -> { visit, clan, member, pos: {x, z}, state: 'walking' | 'held' | 'fleeing' | 'gone' } | null`;
    - `hold(visit, facePos)`: stops it where it is, facing `facePos`, pose `cross`; `release(visit)`: glides it to the clock's position over 1.5 s, then `walking`; `flee(visit)`: runs it back along its route towards the entry point at `FLEE_SPEED` (with reduced motion: a dust puff and it is gone), then `gone` until the visit ends; `isFled(visit)`. Each ignores a `visit` that isn't the current one. `hold` auto-releases after `HOLD_MAX`. Once fled, `hold`/`release` for that visit are ignored.
    - `dispose()`.
  - `walk.js`: `session.intruders = castFor(areaId).length && !isDen ? createIntruders(scene, areaId, { reducedMotion, showNames: isClanEdition(state), hostile: (clan) => isHostile({ clan }, { clanHome, picks }), onNotice: () => audio.hiss() }) : NO_INTRUDERS`, placed after the `clanHome` line (it needs `clanHome` and `picks`); disposed in `endWalk`. `NO_INTRUDERS` is the inert stub.
  - `main.js`: `session.intruders.update(dt, session.cat.position)` after the clan cats' update.

- [ ] **Step 1: Write the failing tests** (headless THREE, a fake clock):
- `the mesh follows the clock`: at two times its position equals `intruderAt`;
- `one mesh at a time: a new visit replaces the old one, and an empty slot has none in the scene`;
- `an ally clan's cat is never hostile`: `isHostile({ clan: 'moor' }, { clanHome: true, picks: ['woods', 'moor'] })` is false; `{ clanHome: false }` is false; `picks: ['woods']` with clan `moor` is true;
- `hostile and near: cross pose and one notice per visit`; `not hostile: it just walks past`;
- `hold, release and flee`: hold freezes it facing the point; release ends back on the clock within 1.5 s; flee ends `gone` at the route's start and stays gone until the next visit; a release after a flee changes nothing; a hold with no release lets go after `HOLD_MAX`;
- `reduced motion: flee is a puff, not a run`;
- `Legacy: no tag` (`showNames: false`);
- `walk.edition`: the source creates intruders after `const clanHome =` and passes `showNames: isClanEdition(`.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/intruders.test.js test/walk.edition.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.** The flee reuses the rival scamper's easing (`smooth`) and its rule that a chased cat ends on walkable ground: it runs along the route it walked, which Task 1 proved walkable, so it needs no `findLanding`.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/intruders.js src/game/walk.js src/main.js test/intruders.test.js test/walk.edition.test.js
git commit -m "feat(clanlife): intruders walk across your land and puff up when you come close

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The fight's rules (pure)

**Files:**
- Create: `src/fight.js`
- Test: `test/fight.test.js`

**Interfaces:**
- Consumes: nothing (zero imports).
- Produces:
  - `MOVES = ['pounce', 'swipe', 'charge']`, `BUTTONS = ['pounce', 'swipe', 'dodge']`, `COUNTER = { pounce: 'dodge', swipe: 'pounce', charge: 'swipe' }`.
  - `CLUES = { pounce: { pose: 'stalk', icon: '⬇️', text: 'It crouches low…' }, swipe: { pose: 'swipe', icon: '🐾', text: 'It raises a paw…' }, charge: { pose: 'cross', icon: '↩️', text: 'It backs up…' } }`.
  - `TIMING = { squareOff: 1.2, answer: 4.0, ignoreFirst: 0.25, tumble: 1.4, tumbleReduced: 0.6, beat: 0.8 }`, `LONGER_LOOK = 1.0`.
  - `EDGE_BY_SPECIAL = { fearless: 'longerLook', keenNose: 'longerLook', chaser: 'longerLook', steady: 'secondLook', pouncer: 'secondLook', napper: 'secondLook', bird: 'secondLook' }`; `edgeFor(special) -> 'longerLook' | 'secondLook' | null` (own-key read).
  - `createFight({ rng, edge = null, reducedMotion = false }) -> Fight`:
    - `phase: 'squareOff' | 'clue' | 'tumble' | 'beat' | 'over'`, `round` (1-based), `wins`, `losses`, `move` (this round's), `won` (set when over);
    - `step(dt) -> Event[]` advances the clock; `answer(button) -> Event[]` takes a tap. Events: `{ type: 'clue', round, move }`, `{ type: 'round', round, move, answer: button | null, won }`, `{ type: 'secondLook', round }`, `{ type: 'over', won }`.
    - Rules: `squareOff` → `clue` (round 1). In `clue`, a tap after `ignoreFirst` ends the round: won iff `COUNTER[move] === button`. A tap in `ignoreFirst`, in any other phase, or not in `BUTTONS` is ignored (returns `[]`). The window is `answer` (+ `LONGER_LOOK` with `longerLook`); at its end with no tap, `secondLook` (once per fight) emits `secondLook` and restarts the same clue's window; otherwise the round is lost. Then `tumble` (`tumbleReduced` with reduced motion), then `over` if `wins === 2 || losses === 2`, else `beat`, then the next `clue`. Each round's move is drawn when its clue starts: `MOVES[Math.floor(rng() * 3)]`.

- [ ] **Step 1: Write the failing tests**

```js
const seq = (moves) => { let i = 0; return () => (MOVES.indexOf(moves[i++ % moves.length]) + 0.5) / 3; };
const run = (f, s) => { const out = []; let t = 0; while (t < s) { out.push(...f.step(1 / 30)); t += 1 / 30; } return out; };

test('each counter is one line to teach, and every move has exactly one', () => {
  expect(COUNTER).toEqual({ pounce: 'dodge', swipe: 'pounce', charge: 'swipe' });
  expect(new Set(Object.values(COUNTER)).size).toBe(3);
});
test('the clue is honest: the round plays the move its clue showed', () => { /* every 'clue' event's move equals the following 'round' event's move */ });
test('right answers win two rounds and the fight', () => {
  const f = createFight({ rng: seq(['swipe', 'charge']) });
  run(f, TIMING.squareOff + 0.5);
  f.answer('pounce'); run(f, TIMING.tumble + TIMING.beat + 0.5);
  const ev = [...f.answer('swipe'), ...run(f, TIMING.tumble + 0.1)];
  expect(ev.at(-1)).toEqual({ type: 'over', won: true });
});
test('two wrong answers lose it, and losing is just over: won false', () => {});
test('speed never matters: a tap at 0.3 s and at 3.9 s score the same', () => {});
test('timeouts lose slowly, and the second look replays once', () => {
  /* no edge: the 'round' event (answer null) comes only after TIMING.answer s;
     longerLook: only after TIMING.answer + LONGER_LOOK;
     secondLook: the first timeout emits 'secondLook' and the same move again; the second timeout loses */
});
test('a tap in the first 0.25 s, between rounds or after the end is ignored', () => {});
test('it is best of three: never more than three rounds', () => { /* any answers: rounds ≤ 3; over exactly once */ });
test('every family cat gets one small edge', () => {
  for (const sp of ['keenNose', 'chaser', 'napper', 'fearless', 'pouncer', 'steady', 'bird']) expect(edgeFor(sp)).not.toBeNull();
  for (const bad of [undefined, '__proto__', 'toString']) expect(edgeFor(bad)).toBeNull();
});
test('fight.js imports nothing', () => { /* no import lines */ });
```

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/fight.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `src/fight.js`.** The header comment states the three promises (honest clue, speed never matters, losing is only `won: false`) and that `rng` is local to one fight.

- [ ] **Step 4: Run them and check they pass**

Run: `npx vitest run test/fight.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fight.js test/fight.test.js
git commit -m "feat(clanlife): the read-the-move fight rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The fight on screen

**Files:**
- Modify: `src/cat/animator.js` (the `swipe` pose)
- Create: `src/ui/fightui.js`, `src/game/clanfight.js`
- Modify: `src/game/walk.js`, `src/main.js`, `src/game/avatar.js`, `src/game/interactions.js`, `src/discoveries.js`, `src/journal.js`, `src/ui/homebase.js`, `src/style.css`
- Test: `test/animator.test.js`, `test/fightui.test.js`, `test/clanfight.test.js`, `test/discoveries.test.js`, `test/journal.test.js`

**Interfaces:**
- Consumes: Tasks 1–3; `PERSONALITIES` (`src/cat/brain.js`); `audio.hiss`, `audio.pounceWhoosh`, `audio.landThump`; `fx.burst`; `log.awardOnce`; `clanName`.
- Produces:
  - **`animateCat(cat, 'swipe', ...)`:** the front-left leg swung forward and up (about −1.2 rad), the body leaning back a little, head up. No paw goes below the ground; Hagrid's rig doesn't throw.
  - **`AWARDS.intruder = 12`** (so `state.feats.intruder` is the lifetime "chased off" tally, sanitised by the existing `FEAT_TYPES` path; no new save field).
  - **`renderChallengeHtml({ name, clan }) -> string`** and **`renderFightHtml({ phase, clue, round, wins, losses, line }) -> string`** in `fightui.js` (pure; names escaped). Copy, exactly:
    - challenge: `` `${name} of ${clanName(clan)} is on your land!` ``, buttons `Fight! 🐾` (`data-fight="go"`) and `Back off` (`data-fight="off"`);
    - square-off: `Read its move!`, and the teach line `Crouch → Dodge · Paw up → Pounce · Backs up → Swipe` (shown small for the whole fight);
    - clue: the clue's icon (large) and text;
    - three buttons `Pounce`, `Swipe`, `Dodge` (`data-move="pounce|swipe|dodge"`), always in that order;
    - round lines: won `Nice one! 🐾`, lost `It got that one!`, second look `Steady… look again 👀`;
    - round pips: two to win, shown as filled/empty paw marks.
  - **`createFightUi(root, { onFight, onBackOff, onMove })`**: mounts one `div.hud-fight` in `#hud`; `showChallenge(model)`, `showFight(model)`, `hide()`. Pointer and touch call the handlers. Keys: E = Fight, Q = Back off, 1/2/3 = Pounce/Swipe/Dodge, only while the panel shows. CSS: a bottom sheet; the three move buttons share the full width in one row, each at least 88 px tall and 30% wide, above `env(safe-area-inset-bottom)`; the clue icon at least 64 px; nothing important in the top half.
  - **`createClanFight({ intruders, ui, audio, fx, hud, log, areaId, walkStamp, playerSpecial, reducedMotion, sendEvent, now })`** in `src/game/clanfight.js`. No `progression` parameter, ever.
    - `update(dt, s)`: shows the challenge when `intruders.current()` is hostile, `walking`, within `CHALLENGE_RANGE` of `s.cat.position`, not locked for that visit, and no fight is on; hides it beyond `NOTICE_RANGE`. While fighting it steps the fight, writes the local cat's position (1.6 m from the intruder, facing it) every frame after `player.update`, sets `s.fightPose`, and plays the world beats: clue pose on the intruder (`charge` also eases it back 0.6 m); the player's answer pose (`pounce` hop, `swipe`, `dodge` = a 0.8 m side-step with `land`); the tumble (both cats circle their midpoint once with small hops, `pounce`/`cross` poses, two dust bursts; with reduced motion one dust puff and no circling); the round's loser steps back 0.4 m in `scared` for 0.4 s.
    - `startFight()`: `intruders.hold(visit, catPos)`, `audio.hiss()`, sends `intruder-fight` (Task 5), `s.fight = createFight({ rng: mulberry32(seedFromCode(`${walkStamp}|${visit}|${attempt}`)), edge: edgeFor(playerSpecial), reducedMotion })`.
    - `backOff()`: hides the panel; locks that visit's challenge until the cat has been beyond `NOTICE_RANGE` once. Nothing else.
    - On `over`, won: `intruders.flee(visit)`; `log.awardOnce('intruder', `intruder-${visit}`, `chased off ${name}`)`; toast `` `${name} ran back to ${clanName(clan)}'s land! 🏃` ``; send `intruder-done` `fled: true`.
    - On `over`, lost: `intruders.release(visit)`; lock the visit for `RECHALLENGE_DELAY`; toast `` `${name} shook it off and walked on. Try again soon!` ``; send `intruder-done` `fled: false`. **Nothing else.**
    - `abort()` (walk end, tab hidden): release the intruder, clear `s.fight` and `s.fightPose`, pay nothing, send `intruder-done` `fled: false`.
  - **Input:** `avatar.js` sets `player.speedFactor = 0` while `s.fight` is set and uses `s.fightPose` as the pose; `interactions.js` returns early from the prompt scan and `handleInteract` while `s.fight` is set; `chaseAllowed` (`rivalcats.js`) also requires `session.fight == null` so a patrol or the yard dog never moves a fighting cat.
  - **walk.js**: `session.clanFight = session.clanHome && session.intruders !== NO_INTRUDERS ? createClanFight({ ..., playerSpecial: PERSONALITIES[cat.userData.breed]?.special }) : NO_CLAN_FIGHT`; `endWalk` calls `session.clanFight.abort()` before disposing the intruders. `main.js` calls `session.clanFight.update(dt, session)` after `session.rival.update` and the dog.
  - **Journal:** `renderJournalHtml(journal, goldenFound, goldenTotal, { chasedOff } = {})` adds `🛡️ Intruders chased off: ${n}` to the footer when `chasedOff` is a finite number. `homebase.js` passes `{ chasedOff: s.feats?.intruder ?? 0 }` in Clan Edition only.

- [ ] **Step 1: Write the failing tests**

`test/animator.test.js`: `'swipe raises one front paw well above the other, and no paw goes below the ground'`, over a standard breed and Digit; Hagrid doesn't throw.

`test/fightui.test.js`: the challenge names the cat and its clan and escapes a hostile name; the fight HTML always has the three `data-move` buttons in order Pounce, Swipe, Dodge; the teach line is present in every phase; the clue phase shows the clue's icon and text; nothing in the HTML spells a `RANK_WORDS` value (`borrowedIn` on the output is `[]` apart from the composed clan name).

`test/clanfight.test.js` (fakes for intruders, ui, audio, fx, hud, log, sendEvent; a controllable clock):

```js
test('losing takes nothing: no award, no points, no save, only the intruder walks on', () => {
  const h = harness({ answers: 'wrong' });
  h.challenge(); h.fight(); h.runToEnd();
  expect(h.log.awardOnce).not.toHaveBeenCalled();
  expect(h.intruders.release).toHaveBeenCalledTimes(1);
  expect(h.intruders.flee).not.toHaveBeenCalled();
  expect(h.calls.filter((c) => !['release', 'toast', 'sendEvent', 'ui', 'audio', 'fx'].includes(c.kind))).toEqual([]);
});
test('clanfight.js is never given progression and imports nothing that stores progress', () => {
  /* source has no 'progression'; import specifiers ⊆ ['../fight.js', '../intruders.js', '../ui/fightui.js', '../clanhomes.js', '../rng.js'] */
});
test('the lose branch, as written, calls nothing but release, toast and the event', () => {
  /* slice clanfight.js between the markers `// LOST:` and `// END LOST`; strip comments; none of
     'log.', 'award', 'points', 'feat', 'colony', 'mark', 'grudge' appears */
});
test('winning chases it off, pays once per visit, and the journal tally comes from feats', () => {});
test('backing off costs nothing and the panel comes back only after you walk away and return', () => {});
test('a lost visit can be challenged again after 20 s, not before', () => {});
test('the cat holds still for the whole fight and moves again after', () => { /* s.fightPose set, then cleared */ });
test('ending the walk mid-fight releases the cat and pays nothing', () => {});
test('not at home, or an ally clan: no challenge at all', () => {});
test('reduced motion: no circling, one puff per round', () => {});
```

`test/walk.edition.test.js`: `createClanFight(` appears only under `session.clanHome &&`; Legacy can never be at home (Part 1's `clanHomeFor`), so **Legacy never shows the panel**; add that as a named test over `clanHomeFor('woods', 'legacy', ['woods'])`.

`test/rivalcats.test.js`: `chaseAllowed` is false while `session.fight` is set (beside the existing photo-mode case).

`test/discoveries.test.js`: `AWARDS.intruder === 12`. `test/journal.test.js`: the line shows with `{ chasedOff: 3 }` and not without; a hostile value renders 0.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/animator.test.js test/fightui.test.js test/clanfight.test.js test/discoveries.test.js test/journal.test.js test/walk.edition.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the interfaces above. Mark the lose branch with `// LOST:` … `// END LOST` comments for the structural test, and say in the header why the controller has no progression.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

- [ ] **Step 5: Check it in the app** (`npm run dev`, a Woods pick, the Woods): wait for an intruder (or set the clock: `Date.now` offset in the console), fight it on a 375 px-wide window with the mouse only, then with keys; lose one on purpose and check the points don't move; turn on reduced motion and fight again.

- [ ] **Step 6: Commit**

```bash
git add src/cat/animator.js src/ui/fightui.js src/game/clanfight.js src/game/walk.js src/main.js src/game/avatar.js src/game/interactions.js src/rivalcats.js src/discoveries.js src/journal.js src/ui/homebase.js src/style.css test/animator.test.js test/fightui.test.js test/clanfight.test.js test/rivalcats.test.js test/discoveries.test.js test/journal.test.js test/walk.edition.test.js
git commit -m "feat(clanlife): read the move and chase the intruder off; losing takes nothing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The fight's outcome on both screens

**Files:**
- Modify: `src/game/clanfight.js` (send), `src/game/netevents.js` (receive)
- Test: `test/netevents.test.js`, `test/clanfight.test.js`

**Interfaces:**
- Consumes: Tasks 2 and 4; `s.remotes.list`; `s.net.sendEvent`.
- Produces:
  - Sent by `clanfight.js` (only if `s.net`): `{ v: 1, id, type: 'intruder-fight', area, visit }` at `startFight`; `{ v: 1, id, type: 'intruder-done', area, visit, fled }` at the end (and from `abort`).
  - `applyRemoteEvent` handles both, on every device and edition (it is world state only, like `tip` and `carry-drop`): the sender must be a remote in this walk (`list.find`); `area === s.areaId`; `Number.isInteger(visit)` and `visit === s.intruders.current()?.visit`; `fled` a boolean. Then:
    - `intruder-fight`: `s.intruders.hold(visit, remote.group.position)`; if my challenge panel is up for that visit, hide it and toast `` `${petName} is already facing ${name}!` ``; my own fight on the same visit (both pressed at once) carries on.
    - `intruder-done`: `fled` → `s.intruders.flee(visit)`; else `s.intruders.release(visit)` (a no-op after a flee, so a win always beats a loss whichever order the two arrive in). If I'm mid-fight on that visit and it fled, my fight ends quietly: no award, no lock, panel hidden.
  - No points, toasts beyond the one above, saves or feats on the receiving side.

- [ ] **Step 1: Write the failing tests**
- `the sister's fight holds the intruder on my screen, facing her cat`;
- `fled wins over walked-on, in either order`;
- `a remote win ends my own fight on that visit with nothing paid`;
- `hostile and stale events are ignored`: a non-remote sender, another area, `visit` of `'3'`, `NaN`, `-1`, a past visit, `fled: 'yes'`, a missing `s.intruders`: no call, no throw;
- `Legacy screens follow too` (a session with `clanEdition: false` still holds and flees);
- `clanfight sends exactly one fight and one done per fight, and none solo`.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run test/netevents.test.js test/clanfight.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.** A comment in `netevents.js` says why two events are enough: the intruder's walk is the shared clock, so only "held" and "how it ended" need the wire; the rounds stay on the fighter's screen.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/clanfight.js src/game/netevents.js test/netevents.test.js test/clanfight.test.js
git commit -m "feat(clanlife): a fight's outcome reaches the co-walker's screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Live check

**Files:**
- Modify: `docs/superpowers/specs/2026-10-31-clan-life-design.md` (§4 "Co-walks": the two-event answer; the defaults table above, as built)

- [ ] **Step 1: Two browsers, one co-walk** (siblings, StormClan and GaleClan; then one device on Legacy):
  - In the Woods, both screens show the same intruder on the same route. A GaleClan intruder is offered to nobody (it's the sister's clan); a BrookClan one is offered to both.
  - One kid fights: the other screen shows the intruder held, facing her cat, then fleeing (win) or walking on (loss). Both press Fight at once: no stuck intruder.
  - On Legacy: the intruder walks, holds and flees, with no tag and no panel.
  - Lose a fight: points, colony, marks and feats are unchanged (compare the save before and after in devtools).
- [ ] **Step 2: Phone check** on the iPhone 18 (portrait): the three buttons are under the thumb, readable at arm's length, and nothing covers the two cats. With the perf readout on, note draws and fps mid-tumble beside Part 1's camp reading; expect 60 fps held. If not, stop and report.
- [ ] **Step 3: The fairness note.** Ask the owner to let the 9-year-old play five fights and the 11-year-old five. Record the wins in the commit body. If he wins far fewer (the anti-goal), the first fix is `TIMING.answer`, then the teach line's size; never make losing cost anything.
- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-10-31-clan-life-design.md
git commit -m "docs(clanlife): Part 2 live check, phone reading and the fairness note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Later territories (recipe)

A territory that gets Part 1's camp gets intruders by adding one `INTRUDER_ROUTES` row (one route per neighbour that has a cast) and its `rivalworld` route checks. **The Pines' routes must clear the island keep-out and the truce path to the bridge.** A neighbour clan with no `CLAN_CAT_PREFIXES` row (the Gorge, today) never sends intruders.
