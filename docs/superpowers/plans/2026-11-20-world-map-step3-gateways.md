# World Map Step 3: The Five Gateways, Walking Straight On — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Clan Edition (and the everyday-words version), the five map roads become gates at the edges of the street places: walk up, read the sign, open a shut place right there through the usual "Get it?" card, say yes to "Head to the Farm?", see "Off to Appletree Farm!", and the next walk starts by itself at the twin gate in the new place, with a friend's room still together. Then the border posts walk straight on the same way.

**Architecture:** Gateway ends are data (`src/gateways.js`, one table per area, like `BORDER_POSTS`), drawn by walk.js after the area build (`src/world/gateway.js`, like the border dressing), so no area builder, shared system or flat-trace fixture sees them. Their rules and words are pure (`src/gatecross.js`). The walk lifecycle splits `endWalk` into banking, freeing and the summary, and adds one entry function, `walkOn({ via })`, that banks quietly, frees the walk (keeping the room), shows the moment and starts the next walk at the arrival spot. In a room the host sends one `walk-on` event with the next seed, which both devices derive from the room seed and the gate, so nothing is drawn from `walkRng`.

**Tech Stack:** Plain ES modules, Three.js r185, Vite, Vitest (`npx vitest run <file>`).

**Spec:** `docs/superpowers/specs/2026-11-19-world-map-design.md` (decisions 6 and 9, "Gateways", build order item 3, "Constraints") and the map, `docs/superpowers/specs/img/2026-11-19-world-map-draft-2.svg`. Steps 1 and 2 are merged (`src/areaoffer.js`, `src/worldmap.js`, the map screen). This build starts after Rooftops step 2 (branch `rooftops-2`) merges; rebase onto main first.

## Global Constraints

Copied verbatim from the spec:

- Every border post rule (R1-R6) holds for the new gateways; `flat-trace.json` and other fixtures change only where a gateway's mesh is drawn, recorded once on purpose.
- Triangle budgets per area unchanged in spirit: a gateway is a few hundred triangles.
- Text for a 9-year-old, through the word tables, both word sets.
- Offline-first; no database change (places are on the save).
- Older iPads: the map is one SVG, drawn once per open.
- **Gateways walk straight on** (2026-11-19): a short "Off to the Farm!" moment, then she arrives at the matching gate in the new place, and a friend's room stays together. (Ending the walk as border posts do today was offered and not chosen.)
- **A shut gate can be opened right there:** until a place's walks are done the gate is shut with a friendly sign; once they are done the gate offers the place, with the usual "Get it?" card.
- **Shut place, walks not done (decision 6):** the gate is closed with a sign in plain words: "Opens after 2 walks in the Park. 1 to go!"
- **Shut place, walks done:** the gate offers it: "Open the Farm for 75 🐾?", through the usual "Get it?" card; yes opens the place and the crossing card follows. Not enough paws: "You need 30 more 🐾. Keep exploring!" (Claude's wording; through the word tables.)
- **Two players:** only the host's choice moves the room; the room stays together and both arrive at the twin gate. A guest who reaches a shut gate sees its sign only.
- **A guest who doesn't own the place (Claude's call):** she walks it this once without owning it (as room starts already allow, `areaOverride`); nothing is ever spent on her behalf. Today a guest's crossing calls `pickPlace` → `buy` and could spend silently; that path changes so a crossing never buys.
- **Budgets:** the Seaside has about 490 triangles left of 30,000 (and tight mesh and caster ceilings). Its gateway is paid for by trimming the Seaside first, as `test/budget.test.js` already notes ("the next Seaside build trims first"); the ceiling does not rise (Claude's call).
- **Grown areas:** no gateway sits on a growing edge, so `?grow=1` does not change any of them.
- Anti-goals: A gate that looks open but isn't, or a sign a 9-year-old can't read. Spending paws by accident at a gate (the "Get it?" card always asks).

From the owner and the coordinator since the spec:

- `test/fixtures/flat-trace.gameplay.json` must not move. Both co-walkers get deterministic arrival spots. Nothing new draws from `walkRng`. Both partners cross together, as border crossings do.
- The Old House (`git show house:docs/superpowers/specs/2026-11-20-old-house-design.md`) will be entered through a front door in the town "like the gateways": a door-type gateway must be addable later with data only. Its door is not built now.
- The Rooftops (`rooftops-2`) is reached from the town by a gateway and stays locked until its own step 4: the data leaves room for it; no row is added now.
- Lazy area loading (F6, branch `f6-lazy`): the gateway entry path is one function, `walkOn`, so F6 can make it async in one place.
- Legacy Edition gets no gateways (spec, "Retiring Legacy": "Until then Legacy stays exactly as it is").
- Never touch the main checkout. No merge, no push, no database, no `.env`. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A double tap on "Yes, let's go!", or a tap during the moment**: one walk is banked and one walk starts, never two. Pinned in Task 7 (a second `walkOn` returns false) and Task 8 (a second confirm while going does nothing).
2. **A guest who doesn't own the place**: she walks it once, not a paw is spent, her own place (`state.area`) is unchanged, and her home screen afterwards shows her own place. Pinned in Task 5 (`pickOnCrossing`) and Task 9.
3. **Buy at the gate, then "Keep exploring"**: the place stays bought, the gate swings open at once, and the prompt now says "Head to …". Pinned in Task 8.
4. **The app closed during the "Off to …" moment**: on the next open nothing asks to be resumed and the walk just left is banked (walks, points, streak). Pinned in Task 7.
5. **A room where one device runs an older build** (no `walk-on`): the host's crossing falls back to today's crossing (the walk ends, the room closes), never two devices in two worlds in one room. Pinned in Task 9.
6. **The next place has not come** (F6, added 2026-11-21): she stays in the walk she is on, the pause card back with the gentle not-ready line; nothing is banked, nothing goes blank, the page never reloads mid-walk; in a room nobody moves unless every device has the place. Pinned in Tasks 7 and 9.

## Updates after F6 (2026-11-21)

Three things landed on main after this plan was written and were merged into this branch (41715034, main 5e44182d): **F6 lazy area loading** (every place is its own download through `src/world/areas.js` and `src/game/areaload.js`; every start goes through walk.js's `startWalkWhenReady`, which shows "Getting ready…" on a slow load, says the `start.notReady*` lines on a failure, and starts the page fresh on the next Explore after one online failure), **Rooftops step 2** (a `roofs` pack with no catalog row: not a place a child can pick), and **the menu build and partner-height** (optional `h` and `seat` on the state message, read leniently by `remotecats.js`). The plan stands except where this section says otherwise; where they differ, this section wins.

- **`walkOn` uses the real loader (Task 7).** It still is the one entry path through a gate, but its answer is now a Promise of `'walked' | 'refused' | 'failed' | 'dropped'`, like `startWalkWhenReady`'s. With the next place already loaded (the usual case, see prefetching) steps 1-6 run in the same tick as written: banked, freed and the moment up before `walkOn` returns, so `getSession()` is null right after the call. Without it: the walk stays live and paused under the moment, `s.walkingOn` makes a second `walkOn` resolve `'refused'`, and `areas.ensure(to)` runs; when it comes (and the session is still the same) steps 3-6 run, the moment's 1.2 s counted from when it first showed; when it fails, the pause card comes back, `hud.toast(phrase(online ? 'start.notReady' : 'start.notReadyOffline'))`, nothing is banked or freed and the page never reloads mid-walk. An online failure whose kind is not `'unknown'` counts toward `startWalkWhenReady`'s failure count (one counter in walk.js), so her next Explore from home for a place not here starts fresh, as F6 does today. The new walk at the end of the moment calls `startWalk` directly (its pack is here). Tests: the plan's `toBe(true)` / `toBe(false)` become `'walked'` / `'refused'`; add a case with a loader whose `farm` load rejects (she stays in the Park walk, `walks.park` unchanged, the pause card and the line) and one whose `farm` load is slow (the moment shows, the Park walk is still live, then the Farm walk starts). `walkHarness` takes an `areas` loader (default: a real `createAreaLoader()` with the walked places ensured in `beforeAll`).
- **Prefetching (Task 8; posts in Task 10).** As she comes within `GATE_PREFETCH_REACH = 12` m of a live gate whose status is `go` or `buy`, interactions calls the new dependency `prefetchArea(end.to)` once per end per walk (main.js passes `areas.prefetch`, which never throws); `askGate`, `askGateBuy` and `confirm` prefetch too, as `crossing.js` already does for posts. Task 10 does the same for border posts whose status is `go`.
- **In a room, both devices have the place before anyone moves (Task 9, replaces the host's send in its interface).** The host's yes in a room that can walk on: `going` set, the moment shows, `{ v: 1, id, type: 'walk-on-ask', from, via }` is sent now and again after `CROSS_RESEND_MS`, and the host ensures its own pack. A guest that hears a well-formed ask from the host (`decideWalkOnAsk`, same checks as `decideWalkOn` without the seed) ensures the pack and answers `{ v: 1, id, type: 'walk-on-have', via, ok }` (sent twice, as the ask). When the host has its pack and every remote still in the room has answered `ok: true` (`decideWalkOnHave` in `src/gatecross.js`, pure), it sends `walk-on` as planned (twice, the derived seed) and calls `walkOn({ via })`. Any `ok: false`, its own failure, or no full answer within `WALK_ON_WAIT_MS = AREA_LOAD_TIMEOUT_MS + 1000` gives the host its pause card back and a line (its own failure: the `start.notReady*` line; a friend's: the new phrase `'gate.friendNotReady': (name) => \`${name}'s game isn't ready for that place yet. Try again in a moment! 🐾\``, both word sets) and nobody moves. A guest whose own load failed sees its own `start.notReady*` toast. The mixed-room fallback (a roster without `walkOn`) is unchanged: today's crossing, the walk ends.
- **Rooftops (Task 1).** No gateway row is added. The seam is the catalog check in `liveEndsFor` (the `roofs` pack loads, but it has no `CATALOG.areas` row until its step 4) and `walkOn`'s loader, which already knows every pack in `AREA_LOADERS`. A `?roofs=1` walk draws no gates (`endsFor('roofs')` is empty). The `gateways.js` header names the pair of rows Rooftops step 4 adds.
- **States (Tasks 6 and 9).** `area` joins `h` and `seat` as an optional field: main.js's `sendState` sends `area: session.areaId` beside `...liftForState(...)`. `area` is checked as planned (a string of at most 32 characters, else the message is dropped; none is fine); `h` and `seat` keep their lenient reading in `remotecats.js`. `test/net.test.js` adds a state carrying all three that arrives whole. Older builds ignore `area`, and a state without one always passes `stateIsHere`.
- **Budgets (Task 4).** The Seaside's numbers (29,513 / 28,793 / 487) were measured before main moved: measure the bare and dressed counts on this tree and pin those. The trim is still the cliff's 720-triangle bottom face, the dressed Seaside stays at or under its old bare count, and no ceiling rises.
- **Word snapshots (Task 5).** Refresh with `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`, then revert any unrelated drift; `series-words-on-source.json` always picks up spurious `notReached` entries, which are reverted.
- **Task 11.** No rebase (main is merged). The dev server runs on port 5401 with `--strictPort`, muted (the save seeds `muted: true`, Chrome runs with `--mute-audio`, M is never pressed). Pictures and the film go to the session scratchpad's `gateways/` directory. The full suite is `WW_PGLITE=/Users/pniessen/.npm/_npx/90d26507e643fcc0/node_modules/@electric-sql/pglite/dist/index.js npx vitest run`, run only when no other vitest is running and not between 18:30 and 19:30; the builds are `npm run build` (start-up at most 700 kB, each place at most 100 kB) and `npm run build:ios`.
- **Always.** No tests that read source text (rule S1 in `docs/SESSION-HANDOFF.md`); whole-walk tests carry a 60-90 s timeout; floats in fixtures use `closeDiffs`; `src/world/builder.js` is imported by its public names only (another branch may split it behind re-exports); never `npm ci` / `npm install` in this worktree.

---

## Decisions this plan makes (the spec leaves them to the builder)

- **Where the gates live.** The spec's "one area file each for the gates" is one table per area in `src/gateways.js`, as `BORDER_POSTS` is. Putting gates in the area builders would put their colliders where strays and critters read them and move the frozen flat trace.
- **Prompt, then card.** Walking up shows the prompt line; E (or the touch action) opens the card, as a border post does. A card that opened by itself would pause her walk every time she passed a gate.
- **Gates read the save as the map does.** Status comes from `placeState` (the map's own function), so the sign counts finished walks only: on her second Park walk the Farm gate says "1 to go!", and the map agrees. Border posts keep counting the walk in progress, as today.
- **Walking through makes the new place today's place** when she owns it (`setArea`), as a room start does. An unowned free place (price 0, gate met) is taken, as the map's "Tap to explore" does, but never for a guest.
- **The look shows the state.** Every gate has a leaf (bar, door or gate) that is shut unless the status is `go`, and swings open the moment she buys.
- **The next room seed** is `seedFromCode(\`${roomSeed}>${via}\`)`: both devices compute it, nothing is drawn.

## File Structure

- Create `src/gateways.js`: the ten gate ends, constants, lookups, arrival spots. Pure, no imports.
- Create `src/world/gateway.js`: the gate looks (`signpost`, `fairgate`, `farmgate`, `promenade`, `none`), their lanes and colliders; `addGatewayDressing`.
- Create `src/gatecross.js`: status, prompt lines, the cards' and moment's markup, `walkOnMove`, `pickOnCrossing`, `nextRoomSeed`, `viaPlan`, `decideWalkOn`, `roomWalksOn`, `stateIsHere`. Pure.
- Create `verify-gates.html`: every look, shut and open, for the pictures.
- Modify `src/clanphrases.js` (five `gate.*` ids in `LATER`), `test/fixtures/series-words-on-later.json`.
- Modify `src/world/seaside.js` (the cliff's bottom face goes).
- Modify `src/net.js` (handler removers, an optional `area` on states), `src/game/rooms.js` (`walkOn` in the room profile).
- Modify `src/game/walk.js` (the dressing, `arrive`, `bankWalk` / `freeWalk` / `endWalk`, `walkOn`), `src/game/session.js` (four fields).
- Modify `src/game/crossing.js` (gate cards, buying, the host's event, the guest's follow), `src/game/interactions.js` (the gate prompt), `src/game/netevents.js` (route `walk-on`), `src/main.js` (wiring).
- Modify `src/bordercross.js` (a crossing never buys), `src/borderposts.js` (`POST_ARRIVE`).
- Tests: create `test/gateways.test.js`, `test/gatewayspots.test.js`, `test/gatewaylook.test.js`, `test/gatecross.test.js`, `test/walkon.test.js`, `test/helpers/walkharness.js`; modify `test/budget.test.js`, `test/walkfreed.test.js`, `test/net.test.js`, `test/rooms.test.js`, `test/session.test.js`, `test/crossing.test.js`, `test/interactions.test.js`, `test/bordercross.test.js`, `test/borderposts.test.js`, `test/offwords.test.js` (only through its fixture).

**Shared with other branches.** `rooftops-2` also changes `src/game/walk.js`, `src/game/session.js`, `src/main.js`, `test/budget.test.js` (and `src/worldmap.js`, which this plan only reads). `f6-lazy` has no commits yet; its work will change `src/game/walk.js` (the `AREAS` map and `startWalk`) and `src/main.js`. Rebase on main before Task 7 and again before Task 11.

---

### Task 1: The gate ends as data

**Files:**
- Create: `src/gateways.js`
- Test: `test/gateways.test.js`

**Interfaces:**
- Consumes: `GATEWAYS` from `src/worldmap.js` (tests only), `CATALOG` (tests only).
- Produces:
  - Constants: `GATE_REACH = 1.6`, `GATE_HALF = 1.4` (m, centre to each gate post along the edge), `GATE_POST_R = 0.15`, `ARRIVE_IN = GATE_REACH + 2`, `GATE_LOOKS = ['signpost', 'fairgate', 'farmgate', 'promenade', 'none']`, `PLACEMENTS = ['edge', 'inside']`, `INWARD_YAW = { north: Math.PI, south: 0, east: Math.PI / 2, west: -Math.PI / 2 }` (the cat's `rotation.y` facing into the area; rotation 0 faces −z). All frozen.
  - `gatewayEnd({ id, gateway, x, z, faces, to, twin, look, placement = 'edge', lane = null, arrive = null }) -> end` (frozen). Throws, naming the id, for a `faces` outside `FACINGS` (from `borderposts.js`, copied here to keep the file import-free: `['north', 'south', 'east', 'west']`), a `look` outside `GATE_LOOKS`, a `placement` outside `PLACEMENTS`, or `placement: 'inside'` without `arrive`. `faces` is the way the cat walks through. `arrive`, when given, is `{ x, z, yaw }`: where a cat coming in through this end lands. `lane` is `[x1, z1, x2, z2]` or null.
  - `GATEWAY_ENDS`: `{ neighborhood, park, fair, farm, docks, seaside }`, deep-frozen, rows below.
  - `endsFor(areaId, table = GATEWAY_ENDS) -> end[]` (own keys only, `[]` otherwise).
  - `endById(id, table = GATEWAY_ENDS) -> { areaId, end } | null`.
  - `liveEndsFor(areaId, catalog, table = GATEWAY_ENDS) -> end[]`: the ends whose `to` is an own key of `catalog.areas` (a place not built yet has no gate, as R3 holds the Gorge's post).
  - `gatewayNear(areaId, x, z, catalog, { reach = GATE_REACH, table = GATEWAY_ENDS } = {}) -> end | null`: the nearest live end within `reach`; null for non-finite input.
  - `arrivalFor(viaId, table = GATEWAY_ENDS) -> { areaId, x, z, yaw } | null`: where she lands after going through `viaId`: the twin end's area and its `arrive`, or, without one, the twin's spot moved `ARRIVE_IN` inward (opposite `faces`) with yaw `INWARD_YAW[twin.faces]`.

The ten ends (all `placement: 'edge'`; every spot probed on the built maps, re-proved in Task 2):

| area | id | gateway | x | z | faces | to | twin | look | lane |
|---|---|---|---|---|---|---|---|---|---|
| neighborhood | `town-park` | town-park | 52 | 0 | east | park | park-town | signpost | – |
| neighborhood | `town-docks` | town-docks | 0 | 52 | south | docks | docks-town | signpost | – |
| park | `park-town` | town-park | 0 | 49 | south | neighborhood | town-park | signpost | – |
| park | `park-fair` | park-fair | 0 | -47 | north | fair | fair-park | fairgate | [4, -25.2, 0, -47] |
| park | `park-farm` | park-farm | 42 | 10 | east | farm | farm-park | farmgate | [16, 10, 42, 10] |
| fair | `fair-park` | park-fair | 8 | 47 | south | park | park-fair | signpost | – |
| farm | `farm-park` | park-farm | -8 | 47 | south | park | park-farm | farmgate | – |
| docks | `docks-town` | town-docks | -10 | -37 | north | neighborhood | town-docks | signpost | – |
| docks | `docks-seaside` | docks-seaside | 35 | -20 | east | seaside | seaside-docks | promenade | – |
| seaside | `seaside-docks` | docks-seaside | 10 | 45 | south | docks | docks-seaside | promenade | – |

Why these edges: the town's east and south edges are free (spec); the Park's south gate is its walks' entrance, its north edge faces the Fairground and its east edge the Farm; the Fairground and the Farm are entered on their south edges, so their ends sit beside the lane into each (the spawn stands on the lane itself); the Docks' north edge faces the town and its east edge the Seaside; the Seaside's only land entrance is the south beach end. The Park's lanes join its own paths (`PARK_PATHS`: the fair lane leaves the path from (−8, −18) to (12, −30) at x 4, the farm lane leaves the east path's end at (16, 10)).

- [ ] **Step 1: Write the failing tests** in `test/gateways.test.js`:

```js
it('the constants, frozen', () => {
  expect([GATE_REACH, GATE_HALF, GATE_POST_R]).toEqual([1.6, 1.4, 0.15]);
  expect(ARRIVE_IN).toBeCloseTo(3.6, 12);
  expect(GATE_LOOKS).toEqual(['signpost', 'fairgate', 'farmgate', 'promenade', 'none']);
  expect(PLACEMENTS).toEqual(['edge', 'inside']);
  expect(INWARD_YAW).toEqual({ north: Math.PI, south: 0, east: Math.PI / 2, west: -Math.PI / 2 });
  expect(Object.keys(GATEWAY_ENDS)).toEqual(['neighborhood', 'park', 'fair', 'farm', 'docks', 'seaside']);
  expect(deepFrozen(GATEWAY_ENDS)).toBe(true);
});
it('the ten ends stand where the table says', () => {
  const rows = Object.entries(GATEWAY_ENDS).flatMap(([a, ends]) => ends.map((e) => [a, e.id, e.gateway, e.x, e.z, e.faces, e.to, e.twin, e.look, e.lane]));
  expect(rows).toEqual(TABLE); // the plan's table, typed out in the test
});
it('every map road has one end on each side, and the two ends twin each other', () => {
  for (const g of GATEWAYS) {
    const ends = Object.entries(GATEWAY_ENDS).flatMap(([a, es]) => es.filter((e) => e.gateway === g.id).map((e) => ({ a, e })));
    expect(ends.map(({ a, e }) => `${a}>${e.to}`).sort(), g.id).toEqual([`${g.from}>${g.to}`, `${g.to}>${g.from}`].sort());
    const [p, q] = ends.map(({ e }) => e);
    expect([p.twin, q.twin]).toEqual([q.id, p.id]);
  }
});
it('a bad row throws and names itself', () => {
  const ok = { id: 'x', gateway: 'g', x: 0, z: 0, faces: 'east', to: 'park', twin: 'y', look: 'signpost' };
  expect(() => gatewayEnd({ ...ok, faces: 'nort' })).toThrow(/x.*nort/);
  expect(() => gatewayEnd({ ...ok, look: 'arch' })).toThrow(/x.*arch/);
  expect(() => gatewayEnd({ ...ok, placement: 'roof' })).toThrow(/x.*roof/);
  expect(() => gatewayEnd({ ...ok, placement: 'inside' })).toThrow(/x.*arrive/);
});
it('lookups', () => {
  expect(endsFor('island')).toEqual([]); expect(endsFor('__proto__')).toEqual([]); expect(endsFor(7)).toEqual([]);
  expect(endById('park-farm')).toEqual({ areaId: 'park', end: GATEWAY_ENDS.park[2] });
  expect(endById('nope')).toBeNull();
  expect(gatewayNear('park', 42, 11.5, CATALOG).id).toBe('park-farm');
  expect(gatewayNear('park', 42, 11.7, CATALOG)).toBeNull();
  expect(gatewayNear('park', NaN, 0, CATALOG)).toBeNull();
});
it('she arrives at the twin, 3.6 m inside it, facing in', () => {
  const near = (a, b) => { expect(a.areaId).toBe(b.areaId); for (const k of ['x', 'z', 'yaw']) expect(a[k]).toBeCloseTo(b[k], 9); };
  near(arrivalFor('park-farm'), { areaId: 'farm', x: -8, z: 43.4, yaw: 0 });
  near(arrivalFor('town-park'), { areaId: 'park', x: 0, z: 45.4, yaw: 0 });
  near(arrivalFor('park-town'), { areaId: 'neighborhood', x: 48.4, z: 0, yaw: Math.PI / 2 });
  near(arrivalFor('docks-town'), { areaId: 'neighborhood', x: 0, z: 48.4, yaw: 0 });
  near(arrivalFor('town-docks'), { areaId: 'docks', x: -10, z: -33.4, yaw: Math.PI });
  near(arrivalFor('seaside-docks'), { areaId: 'docks', x: 31.4, z: -20, yaw: Math.PI / 2 });
  expect(arrivalFor('nope')).toBeNull();
});
it('a front door is data only (the Old House, later)', () => {
  const table = {
    neighborhood: [gatewayEnd({ id: 'town-house', gateway: 'town-house', x: 20, z: -8, faces: 'north', to: 'house', twin: 'house-town', look: 'none', placement: 'inside', arrive: { x: 20, z: -5, yaw: Math.PI } })],
    house: [gatewayEnd({ id: 'house-town', gateway: 'town-house', x: 0, z: 10, faces: 'south', to: 'neighborhood', twin: 'town-house', look: 'none', placement: 'inside', arrive: { x: 0, z: 7, yaw: 0 } })],
  };
  const withHouse = { areas: { ...CATALOG.areas, house: { name: 'The Old House', price: 150 } } };
  expect(liveEndsFor('neighborhood', CATALOG, table)).toEqual([]);
  expect(liveEndsFor('neighborhood', withHouse, table).map((e) => e.id)).toEqual(['town-house']);
  expect(gatewayNear('neighborhood', 20, -7, withHouse, { table }).id).toBe('town-house');
  expect(arrivalFor('town-house', table)).toEqual({ areaId: 'house', x: 0, z: 7, yaw: 0 });
  expect(arrivalFor('house-town', table)).toEqual({ areaId: 'neighborhood', x: 20, z: -5, yaw: Math.PI });
});
it('the Rooftops waits for its catalog row', () => {
  const table = { neighborhood: [gatewayEnd({ id: 'town-roofs', gateway: 'town-roofs', x: -30, z: 20, faces: 'north', to: 'roofs', twin: 'roofs-town', look: 'none', placement: 'inside', arrive: { x: -30, z: 23, yaw: Math.PI } })] };
  const noRoofs = { areas: Object.fromEntries(Object.entries(CATALOG.areas).filter(([k]) => k !== 'roofs')) };
  expect(liveEndsFor('neighborhood', noRoofs, table)).toEqual([]);
  expect(gatewayNear('neighborhood', -30, 20, noRoofs, { table })).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run test/gateways.test.js`. Expected: FAIL, `src/gateways.js` does not exist.
- [ ] **Step 3: Write `src/gateways.js`** with the signatures above and a header saying: pure data and lookups, no imports; what each field means; that a door or a climb (the Old House's front door, the Rooftops' fire escape) is a row with `placement: 'inside'`, an explicit `arrive` and usually `look: 'none'` (the area draws its own door), and appears only once its place has a catalog row (`liveEndsFor`); that Rooftops step 4 and House step 4 each add a pair of rows and nothing else.
- [ ] **Step 4: Run** `npx vitest run test/gateways.test.js`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/gateways.js test/gateways.test.js
git commit -m "World map step 3: the ten gate ends as data, with arrival spots; a door or a climb is a row of data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Where the gates stand (the border-post rules, for street places)

**Files:**
- Test: `test/gatewayspots.test.js` (create)
- Modify only if a check fails: `src/gateways.js` (a spot may move up to 2 m along its edge; then fix the plan's table and Task 1's test in the same commit)

**Interfaces:**
- Consumes: `GATEWAY_ENDS`, `GATE_HALF`, `GATE_POST_R`, `GATE_REACH`, `arrivalFor`, `endsFor` (Task 1); `BORDER_POSTS` (`src/borderposts.js`); the street builders; `floodFrom` (`test/helpers/flood.js`); `isWalkableAt` (`src/player.js`); `waterGap` (`src/world/builder.js`); `GOLD_MICE`; `PARK_PATHS`; `setGrow` (`src/grow.js`).
- Produces: nothing new; the rules below, numbered G1-G6 after the posts' R1-R6.

The rules, as the test states them (the canvas stub of `test/borderposts.test.js` at the top):

- **G1** every `edge` end's nearest bounds side is its `faces`.
- **G5** every `edge` end's centre is 2.5-3.5 m inside the nearest edge; each of its two gate posts (centre ± `GATE_HALF` along the edge) is 1.2 m or more from every area collider (`dist − c.r`); the centre is 2 m or more outside every water footprint (`waterGap`), 3 m or more from every point of interest, collectible, scenic and golden mouse, 2 m from every perch, `GATE_REACH + 2` m from the spawn, 3 m from the race start pad (spawn + (2, −3)), 3 m from every border post in the area; it is reachable on foot from the spawn (`reachesWithin(x, z, 1.2)` on the flood of `isWalkableAt`).
- **Arrival** for every end, `arrivalFor(end.id)`: walkable, on the flood from that area's spawn, 1.2 m from every collider and every gate post of that area, 2 m outside water, `GATE_REACH + 2` m from every end of that area, 2.5 m or more inside the bounds.
- **Lanes** every 0.5 m sample of a lane is 1.2 m from every collider and on the flood; each lane's first point is within 0.5 m of a `PARK_PATHS` segment and its last point is its end's centre.
- **Grown areas** with `setGrow(true)` each street area builds the same bounds as with `setGrow(false)` (no gate on a growing edge); `setGrow(null)` after.

- [ ] **Step 1: Write the test** with one `it` per rule above, looping over every end and naming `${areaId}/${end.id}` in each message.
- [ ] **Step 2: Run** `npx vitest run test/gatewayspots.test.js`. Expected: PASS (the spots were probed with these rules). A failure prints the end and the rule: move that end along its edge, never across, by at most 2 m, and update the table.
- [ ] **Step 3: Commit**

```bash
git add test/gatewayspots.test.js
git commit -m "World map step 3: the gates stand where the border-post rules say, and every arrival spot is clear and walkable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: How the gates look

**Files:**
- Create: `src/world/gateway.js`, `verify-gates.html`
- Test: `test/gatewaylook.test.js`

**Interfaces:**
- Consumes: `endsFor`, `GATE_HALF`, `GATE_POST_R` (Task 1); `clothKey` (`src/world/borderpost.js`); `LAND` (`src/territories.js`), `STREET_LAND` (`src/worldmap.js`); `path` (`src/world/builder.js`); `FLAT_GROUND`, `seatOnGround` (`src/ground.js`); `litMaterial`, `surfaceProps` (`src/render/materials.js`); `mergeVertices`, `mergeGeometries`.
- Produces:
  - `buildGateLook(end, { ground = FLAT_GROUND } = {}) -> THREE.Group | null`: a group named `'gateway'`, `userData.endId = end.id`, at the end's spot on the ground, turned to its `faces`; two meshes: `'gateBody'` (posts, frame and a band in the neighbour's map colour, one vertex-coloured indexed geometry, one material) and `'gateLeaf'` (the bar, doors or gate, its own group pivoting on its hinge post; `userData.noCast = true`, `userData.noMerge = true`). `look: 'none'` returns null.
  - `addGatewayDressing(scene, areaId, { ground = FLAT_GROUND, ends = endsFor(areaId), isOpen = () => false } = {}) -> { colliders, setOpen(endId, open), dispose() }`: adds each end's look and lane (a top-level gravel `path(...lane, 2)` named `'gateLane'`, seated on the ground) to `scene`; `colliders` holds two `{ x, z, r: GATE_POST_R }` per drawn end (none for `'none'`); `setOpen` turns the leaf to open (±π/2 about the hinge, away from the area) or shut (0), idempotent, unknown ids ignored; each leaf starts as `isOpen(end)` says. `dispose()` is a no-op kept for endWalk's one door (the scene sweep frees the meshes). Never touches `area.colliders`.
  - `NO_GATES = { colliders: [], setOpen() {}, dispose() {} }`.

The looks (each at most 400 triangles over both meshes):
- `signpost`: two posts and a fingerpost board pointing out over the edge, the band under the board; the leaf is a striped bar across the way.
- `fairgate`: two striped posts and an arched, painted top board; the leaf is a pair of low painted doors.
- `farmgate`: two square posts; the leaf is a five-bar wooden gate.
- `promenade`: a short rail each side with a lamp on one post; the leaf is a swing gate in the rail.

- [ ] **Step 1: Write the failing tests** in `test/gatewaylook.test.js`:

```js
for (const look of ['signpost', 'fairgate', 'farmgate', 'promenade']) {
  it(`${look}: two meshes, at most 400 triangles, a vertex-coloured body and a leaf the merge leaves alone`, () => {
    const end = Object.values(GATEWAY_ENDS).flat().find((e) => e.look === look);
    const g = buildGateLook(end);
    const meshes = []; g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.map((m) => m.name).sort()).toEqual(['gateBody', 'gateLeaf']);
    expect(meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0)).toBeLessThanOrEqual(400);
    const body = meshes.find((m) => m.name === 'gateBody');
    expect(body.geometry.attributes.color).toBeDefined();
    const leaf = meshes.find((m) => m.name === 'gateLeaf');
    expect([leaf.userData.noCast, leaf.userData.noMerge]).toEqual([true, true]);
    const scene = new THREE.Scene(); scene.add(g); mergeStaticProps(scene);
    expect(scene.getObjectByName('gateLeaf')).toBeDefined();
  });
}
it('the band is the neighbour\'s map colour', () => {
  const body = buildGateLook(endById('park-farm').end).getObjectByName('gateBody');
  expect(hasColour(body.geometry, STREET_LAND.farm)).toBe(true);  // within 1/255
  const town = buildGateLook(endById('park-town').end).getObjectByName('gateBody');
  expect(hasColour(town.geometry, LAND.town)).toBe(true);
});
it('the Park gets three gates, two lanes and two posts a gate', () => {
  const scene = new THREE.Scene();
  const d = addGatewayDressing(scene, 'park');
  expect(scene.children.filter((c) => c.name === 'gateway').map((c) => c.userData.endId)).toEqual(['park-town', 'park-fair', 'park-farm']);
  expect(scene.children.filter((c) => c.name === 'gateLane')).toHaveLength(2);
  expect(d.colliders).toHaveLength(6);
  // park-farm faces east, so its posts stand along z
  expect(d.colliders.slice(4)).toEqual([{ x: 42, z: 10 - GATE_HALF, r: GATE_POST_R }, { x: 42, z: 10 + GATE_HALF, r: GATE_POST_R }]);
});
it('shut until open, and setOpen swings it', () => {
  const scene = new THREE.Scene();
  const d = addGatewayDressing(scene, 'park', { isOpen: (e) => e.id === 'park-town' });
  const leafOf = (id) => scene.children.find((c) => c.userData.endId === id).getObjectByName('gateLeaf').parent;
  expect(leafOf('park-town').rotation.y).not.toBe(0);
  expect(leafOf('park-farm').rotation.y).toBe(0);
  d.setOpen('park-farm', true); expect(Math.abs(leafOf('park-farm').rotation.y)).toBeCloseTo(Math.PI / 2, 9);
  d.setOpen('park-farm', true); expect(Math.abs(leafOf('park-farm').rotation.y)).toBeCloseTo(Math.PI / 2, 9);
  d.setOpen('park-farm', false); expect(leafOf('park-farm').rotation.y).toBe(0);
  expect(() => d.setOpen('nope', true)).not.toThrow();
});
it("a 'none' look draws nothing and blocks nothing", () => {
  const door = gatewayEnd({ id: 'd', gateway: 'g', x: 0, z: 0, faces: 'north', to: 'park', twin: 'e', look: 'none', placement: 'inside', arrive: { x: 0, z: 3, yaw: Math.PI } });
  const scene = new THREE.Scene();
  expect(addGatewayDressing(scene, 'neighborhood', { ends: [door] }).colliders).toEqual([]);
  expect(scene.children).toHaveLength(0);
});
```

- [ ] **Step 2: Run** `npx vitest run test/gatewaylook.test.js`. Expected: FAIL (no module).
- [ ] **Step 3: Write `src/world/gateway.js`.** Build each body by merging its parts' geometries (indexed, `mergeVertices` where a part comes non-indexed) with per-part vertex colours, as `houseTrim` does; the leaf is a child group at the hinge post so turning it swings the leaf. The header says why walk.js adds the gates and not the area builders (the border dressing's R13 note, plus the frozen flat trace), and that a `'none'` look is for a door the area draws itself.
- [ ] **Step 4: Write `verify-gates.html`**, modelled on `verify-places.html`: a ground plane, the four looks in a row, shut on the left and open on the right, `?look=<id>` to show one, and an orbit view. No test.
- [ ] **Step 5: Run** `npx vitest run test/gatewaylook.test.js test/mergeprops.test.js`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add src/world/gateway.js verify-gates.html test/gatewaylook.test.js
git commit -m "World map step 3: the gates' looks (a signpost road, a painted fair gate, a farm gate, a promenade gate), shut until the place is open

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Budgets, and the Seaside pays first

**Files:**
- Modify: `src/world/seaside.js:679-683` (the cliff), `test/budget.test.js`
- Test: `test/budget.test.js`, `test/seaside.test.js`, `test/flattrace.test.js`

**Interfaces:**
- Consumes: `addGatewayDressing` (Task 3), `addBorderDressing`, `mergeStaticProps`, the budget file's `AREAS`, `MERGED_AREAS`, `budgetStats`.
- Produces: nothing new.

The trim: the cliff, `BoxGeometry(60, 8, 18, 60, 24, 6)` at y 4, loses its bottom face (BoxGeometry's group 3, −y: 60 × 6 segments, 720 triangles), which lies under the sand and is never seen. Its bounding box, its colliders and its strata are unchanged. The Seaside's bare build goes 29,513 → 28,793 triangles, and its gateway (at most 400) is added on top, so its headroom under 30,000 only grows.

- [ ] **Step 1: Write the failing tests** in `test/budget.test.js`, a new block after "with the Clan dressing" plus a history note in the file's comment style (before → after per area):

```js
describe('with the gateways (world map step 3)', () => {
  for (const [name, build, meshCeiling, casterCeiling, triangleCeiling] of AREAS.filter(([n]) => ['neighborhood', 'park', 'fair', 'farm', 'docks', 'seaside'].includes(n))) {
    const merged = MERGED_AREAS.find(([n]) => n === name);
    it(`${name}: dressed, still under ${meshCeiling} / ${casterCeiling} / ${triangleCeiling}, merged under ${merged[2]} / ${merged[3]}`, () => {
      const scene = new THREE.Scene();
      build(scene);
      if (name === 'neighborhood') addBorderDressing(scene, name);
      addGatewayDressing(scene, name);
      const before = budgetStats(scene);
      expect(before.meshes).toBeLessThanOrEqual(meshCeiling);
      expect(before.casters).toBeLessThanOrEqual(casterCeiling);
      expect(before.triangles).toBeLessThanOrEqual(triangleCeiling);
      mergeStaticProps(scene);
      const after = budgetStats(scene);
      expect(after.meshes).toBeLessThanOrEqual(merged[2]);
      expect(after.casters).toBeLessThanOrEqual(merged[3]);
    });
  }
  it('the Seaside paid for its gate first: dressed, it has at least the 487 triangles it had left', () => {
    const scene = new THREE.Scene();
    buildSeaside(scene);
    expect(budgetStats(scene).triangles).toBe(28793);
    addGatewayDressing(scene, 'seaside');
    expect(budgetStats(scene).triangles).toBeLessThanOrEqual(29513);
  });
});
```

and in `test/seaside.test.js`: `it('the cliff has no bottom face')`: no triangle of the mesh at (−10, 4, −46) has all three vertices at local y −4.

- [ ] **Step 2: Run** `npx vitest run test/budget.test.js test/seaside.test.js`. Expected: FAIL on 28,793 and on the bottom face.
- [ ] **Step 3: Drop the cliff's −y face** in `src/world/seaside.js` after `strata(...)`: remove group 3's index range and that group, with a comment giving the 720 triangles and why it is never seen.
- [ ] **Step 4: Run** `npx vitest run test/budget.test.js test/seaside.test.js test/flattrace.test.js`. Expected: PASS, and both flat-trace parts unchanged (the gates are not in any area build; the trim changes no bounding box). If the render part alone moves, re-record it with `UPDATE_TRACE=render npx vitest run test/flattrace.test.js` and say so in the commit; the gameplay part must not move.
- [ ] **Step 5: Commit**

```bash
git add src/world/seaside.js test/budget.test.js test/seaside.test.js
git commit -m "World map step 3: every street place stays inside its ceilings with its gates; the Seaside's cliff loses its hidden bottom face (720 triangles) first

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The rules and the words

**Files:**
- Create: `src/gatecross.js`
- Modify: `src/clanphrases.js` (`LATER`), `src/bordercross.js` (`crossingOutcome`), `test/fixtures/series-words-on-later.json`
- Test: `test/gatecross.test.js`, `test/bordercross.test.js`

**Interfaces:**
- Consumes: `placeState`, `lower` (`src/territories.js`); `placeName`, `roomAreaMove` (`src/edition.js`); `headTo`, `joinNames` (`src/bordercross.js`); `confirmCardHtml`, `spendAsk` (`src/ui/confirmcard.js`); `escapeHtml`; `seedFromCode` (`src/rng.js`); `phrase`; `endById`, `liveEndsFor`, `arrivalFor` (Task 1).
- Produces (all pure):
  - `GATE_MOMENT_MS = 1200`, `WALK_ON = 1`.
  - `gateStatus(end, state, catalog) -> { kind: 'go' | 'buy' | 'short' | 'shut', to, name, price, need, line }` from `placeState(state, catalog, end.to)`: owned → `go`; locked → `shut`, `line = phrase('gate.shut', req.walks, lower(placeName(req.area)), req.walks − have)`; `canOpen` → `go` when the price is 0, else `buy`; otherwise `short`, `need = price − points`, `line = phrase('gate.short', need)`. `name` is `placeName(end.to, state.edition, catalog)`.
  - `gatePrompt(status, { inRoom = false, isHost = false } = {}) -> { text, kind: 'gate' | 'gate-buy' | 'gate-info' }`: `go` → `'E — ' + headTo(name)` (`gate`), or for a room guest `${name} is this way 🧭` (`gate-info`); `buy` → `phrase('gate.buyPrompt', name, price)` (`gate-buy`), a guest gets the "is this way" line; `shut` and `short` → their `line` (`gate-info`).
  - `gateCardHtml({ name, extras = [] }) -> string`: `<div class="pause-card cross-card">`, `<h2>` `headTo(name)`, `<p>` `phrase('gate.keep')`, one `<p>` per extra, the buttons `#btn-cross-yes` "Yes, let's go!" and `#btn-cross-no` "Keep exploring" (the post card's ids, so main.js's wiring serves both). All escaped.
  - `gateBuyHtml({ name, price, points }) -> string`: `<div class="pause-card cross-card gate-buy">` + `confirmCardHtml(spendAsk({ kind: 'place', name, price, points }))`.
  - `gateMomentHtml({ name, ledBy = null }) -> string`: `<div class="pause-card cross-card gate-moment"><h1>${phrase('gate.off', lower(name))}</h1>` and, with `ledBy`, `<p>${phrase('cross.leading', ledBy, lower(name))}</p>`. Escaped.
  - `walkOnMove(state, catalog, to, { guest = false } = {}) -> 'set' | 'take' | 'override'`: owned and `roomAreaMove(...) === 'set'` → `set`; not a guest, not locked, price 0 → `take`; otherwise `override`.
  - `pickOnCrossing(progression, catalog, to, { guest = false } = {}) -> 'set' | 'take' | false`: applies `walkOnMove` (`setArea`; or `buy` of a free place then `setArea`), never buys a priced place; returns false for `override` or when `state.area` did not become `to`.
  - `nextRoomSeed(roomSeed, via) -> number`: `seedFromCode(\`${roomSeed >>> 0}>${via}\`) >>> 0`.
  - `viaPlan(via, table) -> { via, from, to, arrive } | null`: `from`/`to` from `endById`, `arrive` from `arrivalFor` (`{ x, z, yaw }`, without `areaId`). Task 10 widens it to posts.
  - `decideWalkOn(ev, { areaId, selfId, remoteIds, catalog, roomSeed }) -> { via, to, seed } | null`: accepts only `{ v: 1, type: 'walk-on', id, from, via, seed }` where `from === areaId`, `via` is one of `liveEndsFor(areaId, catalog)`, `ev.id` is in `remoteIds` and lowest of `[selfId, ...remoteIds]` (the host), and `seed === nextRoomSeed(roomSeed, via)`.
  - `roomWalksOn(roster) -> boolean`: a non-empty roster whose every member has `walkOn === WALK_ON`.
  - `stateIsHere(state, areaId) -> boolean`: false only when `state.area` is a string other than `areaId` (an older build sends no area).
- Phrases (`LATER`, same in both word sets):
  - `'gate.shut': (walks, place, toGo) => \`Opens after ${walks} ${walks === 1 ? 'walk' : 'walks'} in ${place}. ${toGo} to go!\``
  - `'gate.short': (need) => \`You need ${need} more 🐾. Keep exploring!\``
  - `'gate.buyPrompt': (name, price) => \`E — Open ${name} for ${price} 🐾?\``
  - `'gate.keep': 'You keep everything you found.'`
  - `'gate.off': (place) => \`Off to ${place}!\``
- `crossingOutcome({ crossTo, ledBy, together, clan, pick, catalog, edition })`: `pickPlace` is replaced by `pick(id) -> truthy when it is now her place`; walk.js passes `(id) => pickOnCrossing(progression, CATALOG, id, { guest: !!ledBy })`.

- [ ] **Step 1: Write the failing tests** in `test/gatecross.test.js` (save shapes as `test/bordercross.test.js` builds them; `farm = endById('park-farm').end`):

```js
const save = (o = {}) => ({ edition: 'canon', area: 'park', points: 40, walks: { neighborhood: 4, park: 1 }, unlocked: { areas: ['neighborhood', 'park'] }, keptOffers: [], ...o });
it('shut: says how many walks are left', () => {
  expect(gateStatus(farm, save(), CATALOG)).toMatchObject({ kind: 'shut', to: 'farm', line: 'Opens after 2 walks in City Park. 1 to go!' });
  expect(gateStatus(endById('docks-seaside').end, save({ area: 'docks', walks: { docks: 0 } }), CATALOG).line).toBe('Opens after 2 walks in the Old Docks. 2 to go!');
});
it('short of paws, then open to buy, then owned', () => {
  expect(gateStatus(farm, save({ walks: { park: 2 } }), CATALOG)).toMatchObject({ kind: 'short', need: 35, line: 'You need 35 more 🐾. Keep exploring!' });
  const buy = gateStatus(farm, save({ walks: { park: 2 }, points: 100 }), CATALOG);
  expect(buy).toMatchObject({ kind: 'buy', price: 75, name: 'Appletree Farm' });
  expect(gatePrompt(buy)).toEqual({ text: 'E — Open Appletree Farm for 75 🐾?', kind: 'gate-buy' });
  const go = gateStatus(farm, save({ unlocked: { areas: ['neighborhood', 'park', 'farm'] } }), CATALOG);
  expect(gatePrompt(go)).toEqual({ text: 'E — Head to Appletree Farm?', kind: 'gate' });
  expect(gatePrompt(go, { inRoom: true, isHost: false })).toEqual({ text: 'Appletree Farm is this way 🧭', kind: 'gate-info' });
  expect(gatePrompt(buy, { inRoom: true, isHost: false }).kind).toBe('gate-info');
  expect(gatePrompt(buy, { inRoom: true, isHost: true }).kind).toBe('gate-buy');
});
it('the town gate names the town in the word set in use', () => {
  const back = gateStatus(endById('park-town').end, save(), CATALOG);
  expect(back).toMatchObject({ kind: 'go', name: PLACE_WORDS.town });
  withOffWords(() => expect(gateStatus(endById('park-town').end, save(), CATALOG).name).toBe(words().PLACE_WORDS.town));
});
it('the card, the Get it? card and the moment', () => {
  const card = gateCardHtml({ name: 'Appletree Farm', extras: ['Pip comes too.'] });
  for (const s of ['Head to Appletree Farm?', 'You keep everything you found.', 'Pip comes too.', 'id="btn-cross-yes"', 'Yes, let\'s go!', 'Keep exploring']) expect(card).toContain(s);
  expect(card).not.toContain('Your trip ends here');
  const ask = gateBuyHtml({ name: 'Appletree Farm', price: 75, points: 100 });
  for (const s of ['Open Appletree Farm for 75 🐾?', 'You’ll have 25 🐾 left.', 'Yes, open it', 'Not now']) expect(ask).toContain(s);
  expect(ask.indexOf('confirm-card-no')).toBeLessThan(ask.indexOf('confirm-card-yes'));
  expect(gateMomentHtml({ name: 'The Fairground' })).toContain('<h1>Off to the Fairground!</h1>');
  expect(gateMomentHtml({ name: 'Appletree Farm', ledBy: 'Pip' })).toContain('Pip is leading the way to Appletree Farm! 🧭');
  expect(gateMomentHtml({ name: 'Appletree Farm', ledBy: '<b>' })).not.toContain('<b>');
});
it('a crossing never buys', () => {
  const p = createProgression(fakeStorage());
  p.replaceFromPayload({ version: 4, points: 100, walks: { neighborhood: 4, park: 2 }, unlocked: { areas: ['neighborhood', 'park'] } });
  expect(pickOnCrossing(p, CATALOG, 'farm')).toBe(false);
  expect(p.state.points).toBe(100);
  expect(p.state.unlocked.areas).not.toContain('farm');
  expect(walkOnMove(p.state, CATALOG, 'farm')).toBe('override');
  expect(walkOnMove(p.state, CATALOG, 'park')).toBe('set');
  // a free open place is taken by a solo cat, never by a guest
  p.replaceFromPayload({ version: 4, points: 100, walks: { neighborhood: 4 }, unlocked: { areas: ['neighborhood'] } });
  expect(walkOnMove(p.state, CATALOG, 'woods', { guest: true })).toBe('override');
  expect(pickOnCrossing(p, CATALOG, 'woods')).toBe('take');
  expect([p.state.points, p.state.area]).toEqual([100, 'woods']);
});
it('the next room seed is the same on every device and draws nothing', () => {
  const spy = vi.spyOn(Math, 'random');
  const a = nextRoomSeed(12345, 'park-farm');
  expect(nextRoomSeed(12345, 'park-farm')).toBe(a);
  expect(nextRoomSeed(12345, 'park-fair')).not.toBe(a);
  expect(nextRoomSeed(12346, 'park-farm')).not.toBe(a);
  expect(Number.isInteger(a) && a >= 0 && a < 2 ** 32).toBe(true);
  expect(spy).not.toHaveBeenCalled();
});
it('a guest follows only a well-formed walk-on from the host', () => {
  const ev = { v: 1, id: 'a', type: 'walk-on', from: 'park', via: 'park-farm', seed: nextRoomSeed(7, 'park-farm') };
  const ctx = { areaId: 'park', selfId: 'b', remoteIds: ['a'], catalog: CATALOG, roomSeed: 7 };
  expect(decideWalkOn(ev, ctx)).toEqual({ via: 'park-farm', to: 'farm', seed: ev.seed });
  for (const bad of [{ from: 'fair' }, { via: 'fair-park' }, { via: 'nope' }, { via: 7 }, { seed: 1 }, { type: 'border-cross' }, { id: 'z' }]) {
    expect(decideWalkOn({ ...ev, ...bad }, ctx), JSON.stringify(bad)).toBeNull();
  }
  expect(decideWalkOn(ev, { ...ctx, selfId: '0' })).toBeNull(); // the sender is not the host
});
it('room capability and the state filter', () => {
  expect(roomWalksOn([{ walkOn: 1 }, { walkOn: 1 }])).toBe(true);
  expect(roomWalksOn([{ walkOn: 1 }, {}])).toBe(false);
  expect(roomWalksOn([])).toBe(false);
  expect(stateIsHere({ area: 'park' }, 'park')).toBe(true);
  expect(stateIsHere({ area: 'farm' }, 'park')).toBe(false);
  expect(stateIsHere({}, 'park')).toBe(true);
});
```

In `test/bordercross.test.js`, the `crossingOutcome` tests pass `pick` instead of `pickPlace`, and one new case: a crossing whose `pick` returns false says no "It's picked on your map." line.

- [ ] **Step 2: Run** `npx vitest run test/gatecross.test.js test/bordercross.test.js`. Expected: FAIL.
- [ ] **Step 3: Write `src/gatecross.js`**, add the five phrases to `LATER` in `src/clanphrases.js` under a "world map step 3" heading, change `crossingOutcome` and its one caller in `src/game/walk.js` (`endWalk`) to `pick`.
- [ ] **Step 4: Re-record the later-lines fixture** on purpose: `UPDATE_OFF_SNAPSHOT=1 npx vitest run test/offwords.test.js`. Check: `git diff test/fixtures` shows only `series-words-on-later.json`, and in it only the five `gate.*` keys added. Then `npx vitest run test/offwords.test.js test/clanphrases.test.js test/serieswords*.test.js test/clanwords.test.js` passes without the switch (the "no phrase says one" test covers the new lines in the everyday set).
- [ ] **Step 5: Run** `npx vitest run test/gatecross.test.js test/bordercross.test.js test/crossing.test.js`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add src/gatecross.js src/clanphrases.js src/bordercross.js src/game/walk.js test/gatecross.test.js test/bordercross.test.js test/fixtures/series-words-on-later.json
git commit -m "World map step 3: what a gate says (shut, short of paws, open to buy, open) in both word sets, the next room seed, and a crossing that never buys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: A room can outlive a walk (net and rooms)

**Files:**
- Modify: `src/net.js:195-210, 335-358`, `src/game/rooms.js` (`roomProfile`)
- Test: `test/net.test.js`, `test/rooms.test.js`

**Interfaces:**
- Consumes: `WALK_ON` (Task 5).
- Produces:
  - `net.onState(fn)`, `net.onEvent(fn)`, `net.onChat(fn)`, `net.onRoster(fn)` each return `off()`, which removes that one handler; calling it twice is harmless. Nothing else about them changes (onRoster still replays).
  - A state message may carry `area`: a string of at most 32 characters; any other `area` makes the message invalid; none is still valid.
  - `roomProfile()` adds `walkOn: WALK_ON`, so the roster shows which members can walk on.

- [ ] **Step 1: Write the failing tests.** In `test/net.test.js`, with `createFakeHub` endpoints: an `off()`ed event handler stops hearing events while a second handler still hears them, and the same for state, chat and roster; a state with `area: 'park'` arrives with it, one with `area: 7` or a 33-character area is dropped, one without arrives. In `test/rooms.test.js`: the profile a host publishes carries `walkOn: 1`.
- [ ] **Step 2: Run** `npx vitest run test/net.test.js test/rooms.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the removers (splice the handler out of its array, by identity) and the `area` check; add `walkOn` to `roomProfile`.
- [ ] **Step 4: Run** `npx vitest run test/net.test.js test/netsafety.test.js test/rooms.test.js test/rooms.safety.test.js test/lobby.test.js`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/net.js src/game/rooms.js test/net.test.js test/rooms.test.js
git commit -m "World map step 3: a walk can take its room handlers off again, states can say which place they are from, and the room profile says a build can walk on

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Walking on (the lifecycle, solo)

**Files:**
- Modify: `src/game/walk.js` (`startWalk`, `endWalk`, the returned object), `src/game/session.js` (`FIELDS`)
- Create: `test/helpers/walkharness.js` (lifted from `test/walkfreed.test.js`'s `lifecycle()`, `memStorage`, `fakeEl`, `fakeDocument`, `anything`, `envMap`; `walkfreed.test.js` then imports it)
- Test: `test/walkon.test.js`, `test/walkfreed.test.js`, `test/session.test.js`, `test/frameorder.test.js`

**Interfaces:**
- Consumes: `addGatewayDressing`, `NO_GATES` (Task 3); `liveEndsFor` (Task 1); `gateStatus`, `viaPlan`, `walkOnMove`, `GATE_MOMENT_MS`, `gateMomentHtml`, `nextRoomSeed` (Task 5); the removers (Task 6).
- Produces:
  - `startWalk({ duskMode, roomSeed, areaOverride, resume, arrive = null })`: `arrive` is `{ x, z, yaw }`. The cat starts at `clearSpot(arrive, colliders, bounds, waters, 0.6)` facing `yaw` (`cat.rotation.y`, `player.setViewYaw`, the camera placed with `cameraOffset(yaw, ...)` as the camp lesson does) instead of the spawn. Nothing else moves: `areaData.spawn` still seeds the race pad, the kitten, the wanderer and the lessons, and no stream is drawn from differently.
  - In `startWalk`, right after the border dressing: `session.gates = !isDen && isClanEdition(state) ? addGatewayDressing(scene, areaId, { ground, ends: liveEndsFor(areaId, CATALOG), isOpen: (e) => gateStatus(e, state, CATALOG).kind === 'go' }) : NO_GATES`; its colliders join the live list beside the border posts' (R13), never `area.colliders` before the shared systems are built.
  - New session fields in `src/game/session.js`: `roomSeed` (the room walk's seed, undefined solo), `netOffs` (the removers of this walk's net handlers), `gates` (the gate dressing, or `NO_GATES`), `arrivedVia` (the end she came in by, or null). `startWalk` fills all four; every `net.on*` call in `startWalk` pushes its remover onto `session.netOffs`.
  - `endWalk(opts)` keeps its signature and behaviour, built from two new inner functions:
    - `bankWalk(session, { together }) -> { earned, isRecord, streak, goalsDone, discoveries, friendsGreeted, walkedWith, mochiArrived, broughtHome, guideLines }`: everything endWalk does before the teardown (completeWalk, scars, skills, streak, profile push, record, the kitten, the carried marks), in today's order.
    - `freeWalk(session, { keepRoom = false })`: the whole teardown, in today's order; it calls every `session.netOffs` remover; only without `keepRoom` does it `clearPendingRoom()` and `net.leave()`.
  - `walkOn({ via, ledBy = null, guest = false }) -> boolean`, returned beside `endWalk`. THE one entry path through a gate (F6 makes this function async and awaits the new area's code between steps 5 and 6, with the moment still showing):
    1. `s = getSession()`; false without one or when `viaPlan(via)` is null or its `from` is not `s.areaId`.
    2. `const keepRoom = !!s.net`; the room's seed for the next walk: `keepRoom ? nextRoomSeed(s.roomSeed, via) : undefined`; `duskMode = s.duskMode`.
    3. `onWalkEnded()`, `bankWalk(s, ...)`, then `arrivalLines(banked)` (the summary's own lines for a new best, a streak bonus, the kitten and what she brought home, unchanged words).
    4. `walkOnMove(progression.state, CATALOG, to, { guest })`: `set` → `setArea(to)`; `take` → `buy('areas', to)` (price 0) then `setArea(to)`; `override` → nothing.
    5. `freeWalk(s, { keepRoom })`; the overlay shows `gateMomentHtml({ name, ledBy })`.
    6. After `GATE_MOMENT_MS`, if no walk has started meanwhile: `startWalk({ duskMode, roomSeed, areaOverride: progression.state.area === to ? undefined : to, arrive })`, set `session.arrivedVia` to the twin's id, and call the new dependency `onWalkedOn(lines)`.
  - New `createWalkLifecycle` dependency: `onWalkedOn = () => {}` (main.js toasts the lines and calls `sync.autoSync()`, Task 8).

- [ ] **Step 1: Lift the harness.** Move `lifecycle()` and its helpers into `test/helpers/walkharness.js` as `walkHarness({ save, renderer, pendingRoom = null, onWalkedOn, onWalkEnded } = {}) -> { w, getSession, progression, overlay, storage }` (`overlay` a plain `{ innerHTML, classList }` the test can read; `storage` the progression's `memStorage`); `test/walkfreed.test.js` imports it. Run `npx vitest run test/walkfreed.test.js`: PASS, unchanged.
- [ ] **Step 2: Write the failing tests** in `test/walkon.test.js` (fake timers, a fixed day and `Math.random` stream as walkfreed does; save: Clan Edition, area park, owns neighborhood, park and farm, 2 Park walks, 100 points):

```js
it('walks straight on from the Park to the Farm: banked quietly, the moment, then the Farm at its gate', () => {
  const h = walkHarness({ save: parkSave, onWalkedOn: (l) => walked.push(l) });
  h.w.startWalk({});
  expect(h.getSession().areaId).toBe('park');
  expect(h.w.walkOn({ via: 'park-farm' })).toBe(true);
  expect(h.getSession()).toBeNull();
  expect(h.overlay.innerHTML).toContain('Off to Appletree Farm!');
  expect(h.overlay.innerHTML).not.toContain('Home again!');
  expect(h.progression.state.walks.park).toBe(3);
  expect(h.w.walkOn({ via: 'park-farm' })).toBe(false);   // a second tap during the moment
  vi.advanceTimersByTime(GATE_MOMENT_MS);
  const s = h.getSession();
  expect(s.areaId).toBe('farm');
  expect(s.cat.position.x).toBeCloseTo(-8, 9);
  expect(s.cat.position.z).toBeCloseTo(43.4, 9);
  expect(s.cat.rotation.y).toBe(0);
  expect(s.arrivedVia).toBe('farm-park');
  expect(h.progression.state.area).toBe('farm');
  expect(walked).toHaveLength(1);
});
it('nothing to resume once the moment is up, and the walk just left is saved', () => {
  const h = walkHarness({ save: parkSave, onWalkEnded: () => ended++ });
  h.w.startWalk({});
  h.w.walkOn({ via: 'park-farm' });
  // before the timer: the app could close now
  expect(ended).toBe(1);
  expect(JSON.parse(h.storage.getItem('whisker-walk-save')).walks.park).toBe(3);
});
it('a gate it does not have, or no walk, changes nothing', () => {
  h.w.startWalk({});
  expect(h.w.walkOn({ via: 'fair-park' })).toBe(false);
  expect(h.w.walkOn({ via: 'nope' })).toBe(false);
  expect(h.getSession().areaId).toBe('park');
});
it('arriving draws nothing from the shared stream', () => {
  // two walks of the Farm with roomSeed 99, one with arrive, one without:
  // the same weather condition, quest, goal ids and race rings
});
it('the Park has its three gates in Clan Edition, shut where she cannot go yet; Legacy has none', () => {
  // gate groups by endId; park-farm leaf open (owned), park-fair leaf shut (not owned); a Legacy save: no 'gateway' child
});
```

In `test/walkfreed.test.js`, one more case: a Park walk walks on to the Farm, the Farm walk ends; every resource of the Park scene was freed (the same `track` / `SHARED` check). In `test/session.test.js`, the four new field names.

- [ ] **Step 3: Run** `npx vitest run test/walkon.test.js test/walkfreed.test.js test/session.test.js`. Expected: FAIL.
- [ ] **Step 4: Implement** in `src/game/walk.js` and `src/game/session.js`. Split `endWalk` by moving code, not rewriting it; its comments move with it.
- [ ] **Step 5: Run** `npx vitest run test/walkon.test.js test/walkfreed.test.js test/session.test.js test/frameorder.test.js test/walk.edition.test.js test/walk.safety.test.js test/walk.visitprize.test.js test/walkresume.test.js test/cowalkstreams.test.js test/flattrace.test.js`. Expected: PASS, the flat trace unchanged.
- [ ] **Step 6: Commit**

```bash
git add src/game/walk.js src/game/session.js test/helpers/walkharness.js test/walkon.test.js test/walkfreed.test.js test/session.test.js
git commit -m "World map step 3: a walk can walk straight on: banked quietly, a short moment, the next walk at the twin gate; the gates are drawn on every Clan street walk

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: At the gate (prompt, cards, buying, solo crossing)

**Files:**
- Modify: `src/game/interactions.js` (the prompt chain beside the border posts' block, ~1178; `handleInteract` ~1948), `src/game/crossing.js`, `src/main.js` (deps, overlay clicks, `onWalkedOn`)
- Test: `test/interactions.test.js`, `test/crossing.test.js`

**Interfaces:**
- Consumes: `gatewayNear` (Task 1); `gateStatus`, `gatePrompt`, `gateCardHtml`, `gateBuyHtml` (Task 5); `walkOn` (Task 7); `crossExtras`; `CONFIRM_DELAY_MS` (`src/ui/colonypanel.js`).
- Produces:
  - `createInteractions({ ..., askGate = () => {}, askGateBuy = () => {} })`. In the prompt chain, just before the border posts' block and under the same conditions (Clan Edition, not perched, not swimming, no fight): `gatewayNear(s.areaId, catP.x, catP.z, CATALOG)` → `s.prompt = { kind, data: { end, status } }` from `gatePrompt(gateStatus(end, state, CATALOG), { inRoom: !!s.net, isHost: !!s.net?.isHost?.() })`. In `handleInteract`: `gate` → `askGate(s, data)`, `gate-buy` → `askGateBuy(s, data)`, `gate-info` → nothing.
  - `createCrossing({ ..., walkOn, progression, now = () => Date.now() })` gains:
    - `askGate(s, { end, status })`: as `ask` (same guards: a status of `go`, no crossing or fight up, solo or host); `s.crossing = { to, name, via: end.id, kind: 'gate' }`; the overlay shows `gateCardHtml` with `crossExtras(...)`; `releaseControl()`.
    - `askGateBuy(s, { end, status })`: a status of `buy`, solo or host; `s.crossing = { to, name, via, kind: 'gate', asking: 'buy', shownAt: now() }`; the overlay shows `gateBuyHtml({ name, price, points })`; `releaseControl()`.
    - `buyYes(e)`: only while `asking === 'buy'`, never for `e.detail > 1`, never before `CONFIRM_DELAY_MS` since `shownAt`; `progression.buy('areas', to)`: true → `s.gates.setOpen(via, true)` and `askGate` with the fresh status (the crossing card follows); false → the pause card back and `resumeWalk()`.
    - `confirm()` for `kind: 'gate'` solo: `walkOn({ via })` (Task 9 adds the room). `cancel()` and Back (`walkBackAction`'s `crossing` → `cross-no`) close the buy card too; nothing is bought.
  - main.js: `askGate`/`askGateBuy` into `createInteractions`; `walkOn` and `progression` into `createCrossing`; overlay clicks `confirm-card-yes` → `crossing.buyYes(e)`, `confirm-card-no` → `crossing.cancel()`; `onWalkedOn: (lines) => { for (const l of lines) hud.toast(l); sync.autoSync(); }`.

- [ ] **Step 1: Write the failing tests.** In `test/interactions.test.js`, beside the border-post cases, with `promptHarness({ areaId: 'park', askGate, askGateBuy })` and a Clan save:

```js
it('the Farm gate: shut, short, open to buy, open', () => {
  const h = gateHarness({ walks: { park: 1 } });
  h.walkTo(41, 10);
  expect(h.session.prompt.kind).toBe('gate-info');
  expect(h.prompts.at(-1)).toBe('Opens after 2 walks in City Park. 1 to go!');
  h.press(); expect(h.asked).toEqual([]);
  // walks.park 2, points 40: 'You need 35 more 🐾. Keep exploring!'
  // points 100: 'E — Open Appletree Farm for 75 🐾?', press → askGateBuy once with end.id 'park-farm'
  // farm owned: 'E — Head to Appletree Farm?', press → askGate once
});
it('a Legacy walk has no gate prompt', () => { /* edition legacy: no prompt at (41, 10) */ });
```

In `test/crossing.test.js`:

```js
it('a gate: ask then yes walks on, never ends the walk', () => {
  const { crossing, overlay, s, calls } = setup();
  crossing.askGate(s, farmGo());
  expect(s.crossing).toEqual({ to: 'farm', name: 'Appletree Farm', via: 'park-farm', kind: 'gate' });
  expect(overlay.innerHTML).toContain('You keep everything you found.');
  crossing.confirm();
  expect(calls.walkOn).toEqual([{ via: 'park-farm' }]);
  expect(calls.endWalk).toEqual([]);
});
it('buying at the gate asks first, then the crossing card follows', () => {
  const { crossing, overlay, s, calls, clock } = setup();
  crossing.askGateBuy(s, farmBuy());
  expect(overlay.innerHTML).toContain('Open Appletree Farm for 75 🐾?');
  crossing.buyYes({ detail: 1 });                 // too soon
  clock.t += CONFIRM_DELAY_MS; crossing.buyYes({ detail: 2 }); // a double tap
  expect(calls.buy).toEqual([]);
  crossing.buyYes({ detail: 1 });
  expect(calls.buy).toEqual([['areas', 'farm']]);
  expect(calls.setOpen).toEqual([['park-farm', true]]);
  expect(overlay.innerHTML).toContain('Head to Appletree Farm?');
  crossing.cancel();                               // Keep exploring: still bought, still open
  expect(calls.resume).toBe(1);
});
it('Not now buys nothing; a refused buy puts the pause card back', () => { /* cancel from the buy card; buy returning false */ });
it('a guest cannot open a gate card or buy', () => { /* s.net.isHost() false: askGate and askGateBuy do nothing */ });
```

- [ ] **Step 2: Run** `npx vitest run test/interactions.test.js test/crossing.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** in `src/game/interactions.js`, `src/game/crossing.js`, `src/main.js`.
- [ ] **Step 4: Run** `npx vitest run test/interactions.test.js test/crossing.test.js test/crossinglock.test.js test/frameorder.test.js test/backstack.test.js`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/game/interactions.js src/game/crossing.js src/main.js test/interactions.test.js test/crossing.test.js
git commit -m "World map step 3: at a gate she reads its sign, opens a place through the Get it? card, and walks straight on

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Two players walk on together

**Files:**
- Modify: `src/game/crossing.js` (`confirm` in a room, `onRemoteWalkOn`), `src/game/netevents.js` (route `walk-on`), `src/game/walk.js` (the `net.onState` handler drops `!stateIsHere`; `session.roomSeed`), `src/main.js` (`sendState` adds `area: session.areaId`; `onWalkOn` into `createNetEvents`)
- Test: `test/crossing.test.js`, `test/netevents.test.js`, `test/walkon.test.js`

**Interfaces:**
- Consumes: `decideWalkOn`, `nextRoomSeed`, `roomWalksOn`, `stateIsHere` (Task 5); removers and `area` (Task 6); `walkOn` (Task 7).
- Produces:
  - `createCrossing({ ..., getRoster = () => [] })`: main.js passes the pending room's roster (`getPendingRoom()?.roster ?? []`, main.js's own accessor from `createRooms`, every member's room profile, her own included).
  - `crossing.confirm()` for `kind: 'gate'` by a room host: when `roomWalksOn(getRoster())`, set `going`, send `{ v: 1, id, type: 'walk-on', from: s.areaId, via, seed: nextRoomSeed(s.roomSeed, via) }` now and again after `CROSS_RESEND_MS` (through the kept net, guarded only on the room still being the same), then `walkOn({ via })` at once (the room is kept, so there is no wait for the broadcast). When the roster cannot walk on: today's flow, `endWalk({ crossTo: to })` after the "Off we go!" pause.
  - `crossing.onRemoteWalkOn(s, ev)`: once per walk (`s.crossLed`); `decideWalkOn(ev, { areaId: s.areaId, selfId: s.playerId, remoteIds, catalog, roomSeed: s.roomSeed })`; toast `phrase('cross.leading', name, lower(target))`; `walkOn({ via: d.via, ledBy: name, guest: true })`. The guest's next seed is the same `nextRoomSeed`, so both build the same walk.
  - `createNetEvents({ ..., onWalkOn = () => {} })`: `ev.type === 'walk-on'` → `onWalkOn(s, ev)`.
  - In a room `walkOn` keeps the room (`freeWalk(s, { keepRoom: true })`), and the next walk picks up `getPendingRoom().net` as every room walk does; a guest's move is `set` only for a place she owns, else `override`.

- [ ] **Step 1: Write the failing tests.** In `test/crossing.test.js`: a host in a walk-on room sends exactly two `walk-on` events with the derived seed and calls `walkOn({ via: 'park-farm' })` once; a second confirm sends nothing more; a host whose roster has one member without `walkOn` gets `endWalk({ crossTo: 'farm' })` and no `walk-on` event; `onRemoteWalkOn` from the host calls `walkOn({ via: 'park-farm', ledBy: 'Pip', guest: true })` once and toasts "Pip is leading the way to Appletree Farm! 🧭", a second event changes nothing, an event from a non-host or with the wrong seed changes nothing. In `test/netevents.test.js`: a `walk-on` event reaches `onWalkOn`. In `test/walkon.test.js`, with a `createFakeHub` pending room (two endpoints, the test holding the partner's):

```js
it('in a room the room stays: same net, no leave, the next seed derived, old handlers gone', () => {
  const h = walkHarness({ save: parkSave, pendingRoom: room });
  h.w.startWalk({ roomSeed: 7 });
  const leave = vi.spyOn(room.net, 'leave');
  h.w.walkOn({ via: 'park-farm' });
  vi.advanceTimersByTime(GATE_MOMENT_MS);
  const s = h.getSession();
  expect(leave).not.toHaveBeenCalled();
  expect(s.net).toBe(room.net);
  expect(s.roomSeed).toBe(nextRoomSeed(7, 'park-farm'));
  // a state from the partner tagged area 'park' draws no cat in the Farm; one tagged 'farm' does
  // an event from the partner reaches the Farm walk's handler only (the Park walk's was taken off)
});
it('a guest who does not own the place walks it once and spends nothing', () => {
  // save without the farm, 100 points: walkOn({ via: 'park-farm', guest: true }) → the next walk is the Farm by override,
  // state.area still 'park', points still 100 (plus what the Park walk earned), unlocked.areas without 'farm'
});
```

- [ ] **Step 2: Run** `npx vitest run test/crossing.test.js test/netevents.test.js test/walkon.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run test/crossing.test.js test/netevents.test.js test/netevents.safety.test.js test/walkon.test.js test/cowalkstreams.test.js test/rooms.test.js test/lobby.test.js test/flattrace.test.js`. Expected: PASS, the flat trace unchanged.
- [ ] **Step 5: Commit**

```bash
git add src/game/crossing.js src/game/netevents.js src/game/walk.js src/main.js test/crossing.test.js test/netevents.test.js test/walkon.test.js
git commit -m "World map step 3: the host's yes walks the whole room on, both arrive at the twin gate, and a guest never spends a paw

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Border posts walk straight on too

**Files:**
- Modify: `src/borderposts.js` (`POST_ARRIVE`), `src/gatecross.js` (`viaPlan`, `decideWalkOn` accept post ids), `src/game/crossing.js` (`ask` / `confirm` for posts), `src/game/walk.js` (the camp lesson starts from the arrival)
- Test: `test/borderposts.test.js`, `test/gatecross.test.js`, `test/crossing.test.js`, `test/walkon.test.js`

**Interfaces:**
- Consumes: everything above; `BORDER_POSTS`, `POST_REACH`, `postsFor`.
- Produces:
  - `POST_ARRIVE` (deep-frozen): post id → the post she arrives at, or null for the area's spawn (one-way posts and posts with no post back):

| from | arrives at | | from | arrives at |
|---|---|---|---|---|
| town-woods | woods-town-short | | river-town-long | town-river |
| town-moor | null | | river-woods-pond | woods-river-pond |
| town-river | river-town-long | | river-pines-path | pines-river-path |
| woods-town-short | town-woods | | moor-woods-path | woods-moor-path |
| woods-town-long | town-river | | moor-woods-river | woods-moor-river |
| woods-river-long | river-woods-long | | moor-gorge | gorge-moor |
| woods-river-pond | river-woods-pond | | moor-pines-trail | pines-moor-trail |
| woods-moor-path | moor-woods-path | | pines-river-path | river-pines-path |
| woods-moor-river | moor-woods-river | | pines-moor-trail | moor-pines-trail |
| river-woods-long | woods-river-long | | gorge-moor | moor-gorge |
| | | | gorge-town | null |

  The R6 twins are the pairs the "twins line up" test already finds. `woods-town-long` and `river-town-long` both arrive at the town's footpath end (`town-river`), where the long path meets the town; check in the browser (Task 11) that she lands on the path she walked, and change only that row if not.
  - `viaPlan(postId)`: `from` the post's area, `to` its `to`, `arrive` the arrival post moved `ARRIVE_IN` inward with `INWARD_YAW[its faces]`, or null (the spawn). `decideWalkOn` accepts a post of this area as `via` too.
  - `crossing.ask(s, { post, status })` sets `s.crossing = { to, name, via: post.id, kind: 'post' }` and shows `gateCardHtml`; `confirm` takes the same walk-on path as a gate (solo, room host, mixed-room fallback). `crossCardHtml` stays for the fallback, so the recorded "on" fixture does not move.
  - In `startWalk`, the camp lesson's path and heading start from `resume ?? arrive ?? areaData.spawn`, and on a camp lesson walk its heading wins over the arrival's yaw.

- [ ] **Step 1: Write the failing tests.** In `test/borderposts.test.js`: every post has a `POST_ARRIVE` entry; each non-null entry is a post in the post's `to` area; every arrival spot is walkable, on that area's flood, 1.2 m from colliders, 2 m outside water and `POST_REACH + 2` m from every post of its area. In `test/gatecross.test.js`: `viaPlan('woods-moor-path')` is `{ via: 'woods-moor-path', from: 'woods', to: 'moor', arrive }` with `arrive` 3.6 m inside `moor-woods-path` (a south-edge post at (43.4, 47.5)), so `{ x: 43.4, z: 43.9, yaw: 0 }` (`INWARD_YAW.south`), and `viaPlan('town-moor').arrive` is null. In `test/crossing.test.js`: a post's yes calls `walkOn({ via: 'woods-moor-path' })` and never `endWalk`. In `test/walkon.test.js`: a Woods walk walks on through `woods-moor-path` and the Moor walk starts at the arrival; through `town-moor` it starts at the Moor's spawn.
- [ ] **Step 2: Run** `npx vitest run test/borderposts.test.js test/gatecross.test.js test/crossing.test.js test/walkon.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run test/borderposts.test.js test/bordercross.test.js test/gatecross.test.js test/crossing.test.js test/walkon.test.js test/guidewalk.test.js test/serieswords.test.js test/flattrace.test.js`. Expected: PASS, no fixture moved.
- [ ] **Step 5: Commit**

```bash
git add src/borderposts.js src/gatecross.js src/game/crossing.js src/game/walk.js test/borderposts.test.js test/gatecross.test.js test/crossing.test.js test/walkon.test.js
git commit -m "World map step 3: border posts walk straight on too, arriving at their twin post (or the spawn for a one-way post)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Full suite, pictures and a short film for the owner

**Files:** none in the repo. Pictures, the film and their scripts go in `$SCRATCH/world-map-step3/` (`$SCRATCH` = the scratchpad directory the session's system prompt names).

- [ ] **Step 1: Rebase and run everything.** Rebase onto main (Rooftops step 2 is in). `npx vitest run`, then `npm run build`. Expected: every file passes, the build succeeds; `git diff main --stat -- test/fixtures` shows only `series-words-on-later.json` (and `flat-trace.render.json` only if Task 4 said so).
- [ ] **Step 2: Serve** `npx vite --port 5367 --strictPort` in this worktree, in the background.
- [ ] **Step 3: Close-ups.** Headless Chrome (`--headless=new --remote-debugging-port=9337 --user-data-dir=$SCRATCH/world-map-step3/profile`) over the DevTools protocol with Node's built-in `WebSocket`, 1440 x 900: `verify-gates.html?look=<id>` for each look, shut and open: `look-signpost.png`, `look-fairgate.png`, `look-farmgate.png`, `look-promenade.png`.
- [ ] **Step 4: In the game.** A Clan save (as step 2's picture save, area park, 2 Park walks, 100 points, the farm not owned, the fair owned), written to `localStorage['whisker-walk-save']`; the dev handle `window.__ww` places the cat 3 m in front of each gate. Phone (375 x 812, mobile) and desktop: `gate-<end id>.png` for all ten ends (the gate in view with its prompt line), `farm-getit.png` (the Get it? card), `farm-card.png` (the crossing card after Yes), `farm-moment.png` ("Off to Appletree Farm!"), `farm-arrived.png` (at the Farm's gate), `fair-shut.png` from a save with 1 Park walk, `seaside-gate.png`. Look at every picture: the sign readable at phone size, a shut gate looks shut, an open one open, the moment's words large.
- [ ] **Step 5: The film**, about 20 seconds at phone size: on the Park save, walk up to the Farm gate, buy it, say yes, the moment, arrive and walk two steps into the Farm. `Page.startScreencast` frames to `$SCRATCH/world-map-step3/frames/`, then `ffmpeg -framerate 30 -pattern_type glob -i 'frames/*.jpg' -vf scale=750:-2 -pix_fmt yuv420p park-to-farm.mp4`.
- [ ] **Step 6: Clean up** the server and Chrome.
- [ ] **Step 7: Hand back** (no merge, no push): the commit hashes, the suite count, the absolute paths of the pictures and the film, and what to look at: the four looks, a shut gate against an open one, the signs' words, the Get it? card, the "Off to …" moment's length (1.2 s), and that co-walks and the everyday words are checked by tests only.

---

## Self-review

- **Spec coverage.** Five gateways, a pair each, on the edges facing their neighbours (Tasks 1-2); looks suiting each place (Task 3); R1-R6 for street places as G1/G5 plus arrival rules (Task 2); open place: card, moment, automatic start at the twin gate, banked quietly (Tasks 5, 7, 8); shut place signs and the Get it? card, never spending by accident (Tasks 5, 8); two players: host only, room together, same arrival, guest signs only, guest never buys (Tasks 5, 6, 9); border posts the same (Task 10); budgets with the Seaside trimmed first and no ceiling raised (Task 4); grown areas (Task 2); word tables, both sets (Task 5); offline, no database (nothing touches the cloud beyond today's `autoSync`); Legacy untouched (Tasks 7, 8); door rows and the Rooftops' reserve (Task 1); F6's one function (Task 7); pictures and a film (Task 11). The map screen does not change in this step; the spec's map section has no step-3 item.
- **Names across tasks.** `GATEWAY_ENDS`, `gatewayEnd`, `endsFor`, `endById`, `liveEndsFor`, `gatewayNear`, `arrivalFor`, `GATE_REACH`, `GATE_HALF`, `GATE_POST_R`, `ARRIVE_IN`, `INWARD_YAW`; `buildGateLook`, `addGatewayDressing`, `NO_GATES`; `gateStatus`, `gatePrompt`, `gateCardHtml`, `gateBuyHtml`, `gateMomentHtml`, `walkOnMove`, `pickOnCrossing`, `nextRoomSeed`, `viaPlan`, `decideWalkOn`, `roomWalksOn`, `stateIsHere`, `GATE_MOMENT_MS`, `WALK_ON`; `bankWalk`, `freeWalk`, `walkOn`, `onWalkedOn`; session `roomSeed`, `netOffs`, `gates`, `arrivedVia`; crossing `askGate`, `askGateBuy`, `buyYes`, `onRemoteWalkOn`; netevents `onWalkOn`; `POST_ARRIVE`. Prompt kinds `gate`, `gate-buy`, `gate-info`; event type `walk-on`.
- **Not in this plan:** the House's door and the Rooftops' fire escape (data rows in their own step 4s), Legacy's retirement (step 4), gate marks with states on the world map.
