# The Rooftops, step 2: the Place — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Rooftops as a real place: the back alley, the garages and back extensions, the terrace with its ridges and gutters, the corner shop, the warehouse and the clock tower, every crossing, gap, climb and drop placed, the edge and the street below, always evening, in every per-area list, with its unlock written and its card picture taken. It is walkable behind `?roofs=1` and nobody can buy it until step 4 lands co-walker height.

**Architecture:**
- **The plan of the place, pure:** `src/world/roofsplan.js`. Levels, blocks, the ground spec, the moves, named places, the colliders, `roofsArea()` (headless, like `yardArea()`) and `ROOFS_REGISTRATION` (the rows the shared tables copy, as `FAIR_REGISTRATION` does). No THREE.
- **The look:** `src/world/roofsparts.js` (shared geometries, the window atlas, the marks) and `src/world/roofs.js` (`build(scene, opts)`, drawn from the plan). `src/roofslife.js` deepens the evening over the walk.
- **In the game:** `AREAS.roofs` in `walk.js` and every per-area table get the Rooftops. `CATALOG.areas` does **not**. A walk there starts only from `?roofs=1` (`src/roofsflag.js`, the `src/grow.js` pattern), solo, with `areaOverride: 'roofs'`, the way the den is walked.

**Tech Stack:** Plain ES modules, Three.js 0.185, Vite 8, Vitest 4, Node 26, headless Chrome through `scripts/record-page.mjs`, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-11-19-rooftops-design.md`, "Build order" item 2. Sections used: "The place", "Changing level" (placed drops and climb-ups, never stuck), "Light", "Everything else an area has", "Claude's calls", "Constraints", "Goals", "Anti-goals". Steps 3 (birds) and 4 (discoveries, the two skills, golden mice, two-player height, dusk polish) get their own plans. The world-map design (`docs/superpowers/specs/2026-11-19-world-map-design.md`, "The world" and its last paragraph) gives the Rooftops a spot inside the town.

## Rulings (Claude's calls; the owner can overturn each)

- **R1. How step 2 ships before co-walker height.** The place is built, tested and in every per-area list. The **one row held back is `CATALOG.areas.roofs`**: it lives in `ROOFS_REGISTRATION.catalog`, and step 4 copies it into the catalog after two-player height. Until then:
  - nothing offers it: no card, no home line, no Get it?, no gift and no room can name it. Each of those reads `CATALOG.areas`, and rooms filter by `knownAreas: Object.keys(CATALOG.areas)`;
  - `?roofs=1` makes Explore start a solo Rooftops walk (never in a room). That is how the owner and the picture pages walk it;
  - on the world map, once world-map is merged, it shows as "coming soon" (`worldMapModel` already does that for an id missing from the catalog).
  - Why: the spec asks for the place in step 2 and for height in step 4. A child must never see her partner's cat walking on air, and a row held out of the catalog is the only way to be sure no screen offers the place.
  - Cost if wrong: if the owner wants it playable at once, solo only, step 4 copies the row early, behind a "solo only" rule for rooms.
- **R2. The unlock in `areaOffer` terms:** `{ requires: { area: 'fair', walks: 2 }, price: 100 }`, read straight from the catalog row. There is no `KEPT_OFFERS` entry: no save could have bought it before. This matches the world-map design's own line ("100 coins after 2 Fairground walks").
- **R3. The front street is a street below, never entered.** The street between the terrace and the warehouse (and the side street west of the warehouse) is ground at −4 m, walled on every side. No move lands there, and a test proves no cell of it can be reached. The passing bus's lights run along it.
- **R4. Pitched roofs are never stood on.** A pitched roof's footprint is ground at `VOID` (6.0), 0.6 m under the flat roofs and gutters next to it. That makes a wall all round, and no move lands there. The cat walks its ridge and its gutter as crossings, as the spec says.
- **R5. The daily race and the quests stay on foot.** All 13 POIs lie in the region walkable from the spawn without a hop. The two fire escapes put the garage roof and the warehouse roof in that region.
- **R6. A collider blocks at every height** (`src/keepout.js` circles). A collider stands only where the ground inside its circle is one level.
- **R7. No building fades** (`treefade.js`). The roofs are what she stands on. No Rooftops group carries `userData.window`. Only the clock tower's body, below its first ledge, gets a `fadeOccluder`.
- **R8. No strays, no wanderer, no dog, no rival border, not a colony area.** No database change. `critterSpawns: []`, because step 3 adds the birds.

## Questions only the owner can answer

1. **Coming soon:** should the Rooftops show on the world map as "coming soon" before it opens (R1), or stay hidden until step 4?
2. **The unlock:** the map puts the Rooftops inside the town, up the back alley's fire escape. Keep "100 🐾 after 2 Fairground walks" (R2), or open it after the Neighborhood?
3. **The pictures:** do the alley, the terraces, the warehouse and the view from the clock tower look right? Is the card picture the one?

## Global Constraints

- **Work only in** `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/rooftops-2`, on branch `rooftops-2`. Never touch the main checkout. Never merge, push, or touch the database or any `.env` file. Dispatch no subagents unless the controller does.
- **Commits:** `git add <exact paths>`, never `-A` or `.`. Every message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tests:** `node_modules` is symlinked; do not run `npm ci`. During tasks, run single files: `npx vitest run test/<file>`. The full suite runs in Task 13. Before it, check `uptime` against `sysctl -n hw.ncpu`, and wait while the 1-minute load is above the core count.
- **Nothing that ships changes, except what a task names.**
  - `SAVE_VERSION` stays as it is.
  - The network message stays as it is.
  - `CATALOG.areas` stays as it is (R1).
  - The golden-mouse totals stay as they are (step 4 adds three).
  - Every other area's mesh, caster and triangle counts stay as they are.
  - No fixture changes except the series-words snapshots (Task 12, refreshed with `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`).
  - No existing test is edited, except where a task names it.
- **Spec values, verbatim:**
  - "about the size of the Farm (~100 x 100 m walkable)".
  - "South: the back alley (spawn), lit by one lamp: bins, crates, a low shed, a drainpipe and a fire escape. The first climb is easy: bin, shed roof, low garage roofs (2-3 m)."
  - "a row of terraced houses (6-8 m): flat-topped back extensions, pitched roofs with walkable ridges and gutters, chimneys, skylights, washing lines between back windows, planks left by roofers".
  - "the flat roof of an old warehouse or shop block (~12 m) with a water tank and a pigeon loft, and the clock tower (~16-18 m) with a weathervane at the top: the landmark on the skyline, seen from the alley".
  - "Around the edge: the streets below are not walkable."
  - Drops: "at most about 3 m per hop". Climb-ups: "within the normal climb rule (1.6 m, 2.2 with Spring Paws)".
  - Never stuck: "from every walkable roof there is a way down to the alley by drops, stairs and crossings, without Long Leap; and every golden mouse and discovery can be reached from the alley the same way".
  - "A few wider gaps (about 4.5 m) open: short cuts and one extra rooftop corner. Nothing important ... needs Long Leap."
  - Light: "Always evening ... No real lights. No Glow Collar needed ... Walks here count as dusk walks (for Night Eyes) only when the Glow Collar is on".
  - "Not in `COLONY_AREAS`". "No yard dog, no strays, no clan cats up here."
- **Performance:** at most 450 meshes, 380 casters and 70,000 triangles (`test/budget.test.js`); do not raise them.
  - Aim for 300 meshes, 120 casters and 60,000 triangles built.
  - Facades share geometries and one window atlas (a `DataTexture`).
  - Small things are `noCast`.
  - Measure draw calls and triangles at the worst spots (Task 13).
- **Deterministic:** no `Math.random`, `Date.now` or `performance.now` in the plan, parts or build. Variation comes from `hash01(x, z, salt)` (`src/world/warehouselook.js`). `build` runs inside `withLocalUuids` (as `fair.js` does), and its draw count is pinned. The bus and the evening's deepening are functions of walk time.
- **Words:** every new label is in plain words, the same in both word sets. The place's name goes through `PLACE_WORDS` in both `src/clanwords.js` and `src/offclanwords.js` (Task 12). No series word appears in a string literal outside the word tables.
- **Offline-first:** nothing here touches the network.
- **Line numbers** below are from `474af1ab`. Find each site by the quoted code.

## Review Focus

1. **A child walks to a spot no rule covers:** the gap where the garages end, the street's edge, the tower's 1 m rings.
   - Expected: walls, never a fall, and always a way back.
   - Test: Task 5, `no cell of the street or under a pitched roof can be reached` and `never stuck, with every ability`.
2. **Two crossings share an end** (a ridge meets the next ridge at a chimney). The stick is held through the step-off.
   - Expected: she walks straight onto the next one and never back onto the one she left.
   - Test: Task 4, `holding forward across a shared end walks onto the next crossing and never back`.
3. **A chase starts while she is on a plank or mid-leap** (any area that later has both a dog and moves).
   - Expected: no chase begins until she is off.
   - Test: Task 3, `no chase while the moves are busy`.
4. **A walk on the Rooftops is resumed after the flag is gone, or a room proposal names `roofs`.**
   - Expected: the note is dropped, and the proposal is ignored.
   - Tests: Task 9, `a Rooftops walk note is dropped without the flag` and `a room never walks the Rooftops`.
5. **The Glow Collar on, the Day choice picked, on the Rooftops.**
   - Expected: an evening look, and the walk counts as a dusk walk. Without the collar it looks the same and does not count.
   - Test: Task 8, `counts as a dusk walk only with the Glow Collar`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `test/helpers/traversalflood.js` | modify | Level-aware snap; throw on an end it cannot place (Task 1). |
| `test/helpers/traversalwalk.js` | modify | `yardWalk({ area })` option, default `yardArea()` (Task 4). |
| `src/traversal.js` | modify | `crossingToMount` skip and alignment (Task 4); validator fixes if Task 2 finds any. |
| `src/traversallive.js` | modify | `tryMount` passes the held end as the skip (Task 4). |
| `src/rivalcats.js` | modify | `chaseAllowed`: not while `session.traversal.busy` (Task 3). |
| `src/world/roofsplan.js` | create | Levels, blocks, ground spec, moves, places, colliders, POIs, collectibles, scenics, perches, anchors, `roofsArea()`, `ROOFS_REGISTRATION`, `ROOFS_SHOTS`, `ROOFS_TOURS`. Pure. |
| `src/world/roofsparts.js` | create | Shared geometries and materials, `createWindowAtlas`, `windowCell`, `addWindowQuads`, the marks (Task 6). |
| `src/world/roofs.js` | create | `build(scene, opts)` (Tasks 7–8). |
| `src/roofslife.js` | create | `createRoofsLife(area)`: the evening deepening, the bus, the clock face (Task 8). |
| `src/roofsflag.js` | create | `roofsOn()`, `setRoofs(v)` (Task 9). |
| `src/game/walk.js` | modify | `AREAS.roofs`, the evening split, strays off, the flag's start (Tasks 8–9). |
| `src/game/session.js` | modify | `countsDusk` field (Task 8). |
| `src/game/walkresume.js`, `src/main.js` | modify | The dusk count; the resume filter (Tasks 8–9). |
| per-area tables (Task 10 list) | modify | The Rooftops' rows. |
| `src/clanwords.js`, `src/offclanwords.js` | modify | `PLACE_WORDS.roofs` (Task 12). |
| `src/worldmap.js` (after world-map merges) | modify | The Rooftops' spot (Task 14). |
| `verify-places.html` | modify | `roofs` in its AREAS and VIEWS; evening look; `__ready`, `__shot`, `__info` (Task 13). |
| `public/places/roofs.jpg` | create | The card picture (Task 13). |
| `test/traversalflood.test.js`, `test/roofsplan.test.js`, `test/roofs.test.js`, `test/roofsparts.test.js`, `test/roofslife.test.js`, `test/roofsgame.test.js` | create | The tests named below. |

**Names:** the area id is `roofs` everywhere, and the name is "The Rooftops". As in step 1, "crossing" means a traversal record. The border crossings are `src/game/crossing.js`.

**Headless test stub:** any test that builds the area or a player stubs `document` as `test/flattrace.test.js` lines 58–80 do, then imports with `await import(...)`.

---

## The place (decisions every task uses)

North is −z and east is +x, in metres. Bounds: `{ minX: -46, maxX: 46, minZ: -50, maxZ: 46 }`. Spawn: `{ x: 4, z: 41 }`, facing north (rotation 0).

**`LEVELS`** (frozen, metres): `STREET -4, GROUND 0, BIN 0.9, BUNKER 1.2, SHED 2.0, GARAGE 2.8, EXTENSION 3.6, OUTRIGGER 5.1, VOID 6.0, FLAT 6.6, RIDGE 8.1, SHOP 9.6, WAREHOUSE 11.1, TANK 12.6, BELFRY 14.1, LANTERN 15.6, TOP 17.1`. The `VANE_TIP` is at 20.0 (drawn only).

- **Every climb rises 0.8–1.5 m.** That stays under 1.6, so a cat with no skills makes all of them.
- **Every drop falls 0.9–3.0 m.**

**`BLOCKS`** (`{ id, kind, ... }`, frozen; `kind` is `flat`, `pitched`, `street`, `stair` or `disc`). `ROOFS_GROUND` is built from them, with `base: 0`.

| id | kind | where (x0..x1, z0..z1) | y |
|---|---|---|---|
| alley, westGarden, backYards, shopYard, ginnel | (base) | the rest of the ground | 0 |
| street | street | −46..30, −13..3 | −4 |
| sideStreet | street | −46..−40, −50..−13 | −4 |
| bin-1 | disc | (14.5, 35.2) r 0.55 | 0.9 |
| shed | flat | 12..17, 29..34 | 2.0 |
| garages | flat | −30..12, 28..34 | 2.8 |
| alleyStair | stair | x −32..−30.4, from z 38.6 (0) north to 29.6 (2.8), landing −32..−30, 28..29.6 | 0 → 2.8 |
| bunker-k | flat | 1.4 × 1.4 at the yard foot of some extensions | 1.2 |
| ext-1..12 | flat | x −30+5(k−1) .. −26.5+5(k−1), z 12..20 | 3.6 |
| out-2, out-5, out-7, out-10 | flat | x as ext-k, z 12..16 | 5.1 |
| terrace | pitched | −30..30, 3..12 (eaves at z 3 and 12, ridge along z 7.5) | 6.0 (void) |
| flatHouse (house 7) | flat | 0..5, 3..12 | 6.6 |
| dormer (house 5) | flat | −10..−5, 8..12 | 6.6 |
| roofTerrace (house 10) | flat | 15..20, 8..12 | 6.6 |
| stack-x | disc | r 0.6 at (x, 7.5), x ∈ {−30, −20, −10, 0, 10, 20, 29.4} | 8.1 |
| cornerShop | flat | 30..38, −13..12 | 9.6 |
| warehouse | flat | −40..38, −50..−13 | 11.1 |
| warehouseStair | stair | in the ginnel, x 38..44, z −46..−30, four flights side by side | 11.1 → 0 |
| tank | disc | (−26, −34) r 1.3 | 12.6 |
| loft | flat | −36..−30, −48..−43 | 12.6 |
| lantern | flat | −21..−17, −36..−32 (no climb placed: Long Leap only) | 12.6 |
| tower-1 / belfry / lanternStage | flat | 22..30, −21..−13 / 23..29, −20..−14 / 24..28, −19..−15 | 12.6 / 14.1 / 15.6 |
| towerTop | disc | (26, −17) r 1.0 | 17.1 |

**Ground holds one height per spot, so stair flights sit side by side, never over one another.** Every flight is at most 1 in 3 (`validateGround`). The alley stair is the alley's fire escape. The warehouse stair is "the quick way down from the warehouse". The builder may shift any block by up to 1 m, or resize it by up to 15%, to make the moves pass their rules. The levels are fixed.

**The moves (`ROOFS_TRAVERSAL`).** The builder places the exact spots under `validateTraversal`. The routes and counts are fixed:

- **Up, with no skills:**
  - alley → bin-1 → shed → garages, by climbs. Or up the alley stair.
  - garages → ext-k: planks over the back yards (plank-1, plank-2).
  - Along the extensions: level leaps over the side returns.
  - ext-k → out-k → flatHouse, dormer or roofTerrace, by climbs.
  - flatHouse ↔ dormer and flatHouse ↔ roofTerrace: gutter-1 and gutter-2, along the back eave.
  - FLAT → stack: climbs. Stack → stack: ridge-1..6.
  - stack-29.4 → cornerShop → warehouse, by climbs.
  - warehouse → tank, loft and tower-1, by climbs. tower-1 → belfry → lanternStage → towerTop, by climbs.
  - tank ↔ loft: pipe-1, level.
- **Down, with no skills:** a drop mirrors every climb.
  - garages → a pile of bin bags in the alley (2.8).
  - shed → alley (2.0).
  - ext-k → bunker-k → back yard (2.4 then 1.2).
  - The warehouse stair runs from the warehouse to the ginnel.
- **Washing lines:** line-1 runs out-2 ↔ out-5 and line-2 runs out-7 ↔ out-10, both sagging to 0.3 m below 5.1.
- **Long Leap (exactly 3 gaps, `requires: LONG_LEAP_ID`, 3.6–4.5 m):**
  - tank → lantern. This is "the extra rooftop corner"; its way down is a drop to the warehouse.
  - Two short cuts, each joining two places already joined without it.
- **Counts:** crossings at least 3 planks, 6 ridges, 2 gutters, 2 lines, 1 pipe. Leaps: at least 6 with no requirement, plus the 3 Long Leaps.
- **Marks:** every hop has a `mark` from `HOP_MARKS = { leap: ['lip', 'stub'], drop: ['gutter', 'bags', 'wall', 'skylight', 'bunker'], climb: ['bin', 'crate', 'pipe', 'sill'] }`.

**Named places (`ROOFS_PLACES`, `{ id, x, z }`, a spot on each):** `shed, garages, ext-3, out-7, flatHouse, dormer, roofTerrace, stack-0, cornerShop, warehouse, tank, loft, tower-1, belfry, lanternStage, towerTop, lantern`.

**Discoveries' spots** (drawn in step 2, given life in step 4; `anchors.discoveries`):
- A: the garden, on roofTerrace.
- B: the loft.
- C: the vane, on towerTop.
- D: a skylight on flatHouse, with a lamp-lit attic under its glass.
- E: a telescope on cornerShop.
- F: the warm chimney, stack −10.

---

### Task 1: The flood helper throws, and snaps to the right level

**Files:**
- Modify: `test/helpers/traversalflood.js`
- Test: `test/traversalflood.test.js` (create)

**Interfaces:**
- Produces: `floodTraversal(area, opts)`, with the same signature and return as before, except:
  - `regionAt(x, z, y = undefined)`. With `y`, it returns the region of the nearest cell within `SNAP_CELLS = 2` cells (Chebyshev) with `|ground.y(cell) − y| ≤ STEP_MAX` and `ground.canStep(cell → (x, z))`. Without `y`, it returns the nearest cell as before.
  - Crossing ends join with `y = end.y`. A hop joins `regionAt(x0, z0, y0)` to `regionAt(x1, z1, y1)`.
  - A spot off the grid, or with no cell at its level, throws `` `floodTraversal: ${what} ${id} ${which} has no cell at its level` ``. `what` is `crossing` or the hop's kind; `which` is `end 0`, `end 1`, `from` or `to`.

- [ ] **Step 1: Write the failing tests**

```js
// test/traversalflood.test.js (pure; the ground and traversal modules only)
it('a drop landing beside a wall joins the level it lands on, not the roof', () => {
  // roof y 3 at x -6..0; yard y 0 east of it; drop from (-0.6, 0) to (0.12, 0):
  // the nearest grid cell to the landing (0, 0) is on the roof's edge
  const f = floodTraversal(areaWith({ drops: [{ id: 'd', from: S(-0.6, 0), to: S(0.12, 0) }] }), { step: 0.25 });
  expect(f.levelOf(f.regionAt(0.12, 0, 0))).toBe(0);
  expect([...f.edges.get(f.regionAt(-1, 0, 3))]).toContain(f.regionAt(2, 0, 0));
});
it('a move end off the grid throws, naming it', () => {
  expect(() => floodTraversal(areaWith({ drops: [{ id: 'far', from: S(-1, 0), to: S(99, 0) }] })))
    .toThrow('floodTraversal: drop far to has no cell at its level');
});
it('a crossing end with no ground at its height throws', () => {
  expect(() => floodTraversal(areaWith({ crossings: [{ id: 'c', kind: 'plank', points: [P(-2, 0, 5), P(2, 0, 5)] }] })))
    .toThrow('floodTraversal: crossing c end 0 has no cell at its level');
});
```

`areaWith(spec)` builds `{ bounds: ±10, ground, traversal: createTraversal(spec, ground) }` on that two-level ground. `P` and `S` are as in `src/world/traversalyard.js`.

- [ ] **Step 2: Run** `npx vitest run test/traversalflood.test.js`. Expected: FAIL (the first test lands on the roof's region; the others do not throw).
- [ ] **Step 3: Implement** the snap and the throw in `test/helpers/traversalflood.js`.
- [ ] **Step 4: Run** `npx vitest run test/traversalflood.test.js test/traversalyard.test.js`. Expected: PASS, with the yard's results unchanged.
- [ ] **Step 5: Commit** `test/helpers/traversalflood.js test/traversalflood.test.js`, with the message "Rooftops step 2: the never-stuck flood snaps each move end to its own level and throws on one it cannot place".

### Task 2: Every validator phrase has a test

**Files:**
- Test: `test/traversal.test.js` (add a `describe('validateTraversal, every phrase', …)`)
- Modify: `src/traversal.js`, only if a test finds a defect (say so in the commit)

**Interfaces:** consumes `validateTraversal(spec, ctx)` and the phrases listed in step 1's plan (Task 1).

- [ ] **Step 1: Write the failing-or-passing tests.** There is one `it` per phrase that no test pins today. Each builds the smallest spec on the step-1 `level` ground (roofs A and B at y 3) and asserts `toContain('<what> <id>: <phrase>')`.

| phrase | the record |
|---|---|
| `needs two points or more` | crossing with one point |
| `has a segment shorter than 0.2 m` | plank with a 0.1 m middle segment |
| `is longer than 12 m` | plank −6 → 6.5 over raised ground widened to ±8 |
| `does not lie on its roof for its first 0.35 m` | plank whose second point is 0.2 m from end 0 and 0.5 m higher |
| `unknown requirement` | gap with `requires: 'wings'` |
| `is shorter than 1 m` | gap 0.8 m |
| `rises more than 1.6 m` | gap onto a strip 1.8 m higher |
| `is not a drop` | drop between two spots on one roof |
| `is not a climb` | climb between two spots on one roof |
| `reaches more than 2.5 m` | a drop and a climb, each 2.8 m across (two `it`s) |
| `arc hits the ground` | gap with a 3 m wall strip between level roofs |
| `is outside the bounds` | a gap whose `to` lies 0.2 m from `maxX` |
| `is in the water` | `wet: (x) => x > 4` with a gap landing at x 5 |
| `cannot be walked to from its own level` | a gap `from` 0.45 m from a 0.1 m-wide, 1 m-high wall strip: the ring samples beyond the wall are on her level but `canStep` cannot cross it |

Each test also asserts the record trips no other phrase (`toHaveLength(1)`), except where the table says two.

- [ ] **Step 2: Run** `npx vitest run test/traversal.test.js`. Expected: all pass. If one fails because the validator is wrong, not the fixture, fix `src/traversal.js` and note it.
- [ ] **Step 3: Commit** `test/traversal.test.js` (plus `src/traversal.js` if changed), with the message "Rooftops step 2: a test for every phrase the moves' validator can say".

### Task 3: No chase while she is on a move

**Files:**
- Modify: `src/rivalcats.js` (`chaseAllowed`, about line 213, and its comment)
- Test: `test/rivalcats.test.js`

**Interfaces:** `chaseAllowed(player, session)` is also false when `session.traversal?.busy === true`. The rival patrol, the away fights and the yard dog all reach the cat through it (walk.js `canChase: () => chaseAllowed(player, session)`).

- [ ] **Step 1: Write the failing test**

```js
it('no chase while the moves are busy', () => {
  const player = { perchY: 0 };
  expect(chaseAllowed(player, { traversal: { busy: true } })).toBe(false);
  expect(chaseAllowed(player, { traversal: NO_TRAVERSAL })).toBe(true);
  expect(chaseAllowed(player, {})).toBe(true);
});
```

- [ ] **Step 2: Run** `npx vitest run test/rivalcats.test.js`. Expected: FAIL on the first expectation.
- [ ] **Step 3: Implement** the guard and one comment line ("Nor while she is on a crossing or in a hop: the moves own her position").
- [ ] **Step 4: Run** `npx vitest run test/rivalcats.test.js test/awayfight.test.js test/borderfight.test.js test/interactions.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `src/rivalcats.js test/rivalcats.test.js`, with the message "Rooftops step 2: no chase starts while she is on a crossing or in a hop".

### Task 4: Crossings that share an end

**Files:**
- Modify: `src/traversal.js` (`crossingToMount`, new `MOUNT_ALIGN_BONUS`), `src/traversallive.js` (`tryMount`), `test/helpers/traversalwalk.js` (an `area` option)
- Test: `test/traversal.test.js`, `test/traversallive.test.js`

**Interfaces:**
- `crossingToMount(trav, x, z, groundY, dirX, dirZ, out, skipCrossing = null, skipEnd = -1) → out | null`.
  - The end `(skipCrossing, skipEnd)` is never a candidate.
  - Among the candidates (within `MOUNT_R`, level, `dot ≥ MOUNT_DOT · dl`), the lowest `d − MOUNT_ALIGN_BONUS · dot / dl` wins, with `MOUNT_ALIGN_BONUS = 0.4`. With one candidate the result is as before.
- `tryMount` passes `heldCrossing, heldEnd` when `heldYaw !== null`, and drops its own after-check.
- `yardWalk({ area = yardArea(), ...rest })` places the cat and the runtime on `area`.

- [ ] **Step 1: Write the failing tests**

```js
// test/traversal.test.js — A and B share the end (0, 0) on roof y 3; A runs west, B north
it('at a shared end the push picks the crossing it points along', () => {
  expect(T.crossingToMount(t, 0, 0, 3, -1, 0, out).crossing.id).toBe('A');
  expect(T.crossingToMount(t, 0, 0, 3, 0, -1, out).crossing.id).toBe('B');
});
it('the end she just left is skipped, not the whole spot', () => {
  expect(T.crossingToMount(t, 0, 0, 3, 0, -1, out, A, 0).crossing.id).toBe('B');
  expect(T.crossingToMount(t, 0, 0, 3, -1, 0, out, A, 0)).toBeNull();
});
it('two crossings may share an end', () => expect(T.validateTraversal(sharedSpec, ctx)).toEqual([]));
// test/traversallive.test.js
it('holding forward across a shared end walks onto the next crossing and never back', () => {
  // ridge A then ridge B in a straight line, sharing a chimney disc; hold the stick north for 20 s
  const w = yardWalk({ area: twoRidges(), at: [0, 9.6], face: [0, -1] });
  w.push(0, -1); w.run(20);
  expect(w.events.filter((e) => e.type === 'mount').map((e) => e.id)).toEqual(['A', 'B']);
});
```

- [ ] **Step 2: Run** `npx vitest run test/traversal.test.js test/traversallive.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the skip, the alignment score, `tryMount`'s call and `yardWalk`'s option.
- [ ] **Step 4: Run** `npx vitest run test/traversal.test.js test/traversallive.test.js test/traversalyard.test.js test/traversalwiring.test.js`. Expected: PASS, with step 1's tests unchanged.
- [ ] **Step 5: Commit** the four files, with the message "Rooftops step 2: two crossings can share an end; a held push walks on to the next one and never back".

### Task 5: The plan of the place, and never stuck

**Files:**
- Create: `src/world/roofsplan.js`
- Test: `test/roofsplan.test.js`

**Interfaces:**
- Produces:
  - `LEVELS`, `BLOCKS`, `ROOFS_BOUNDS`, `ROOFS_SPAWN`, `ROOFS_GROUND`, `ROOFS_TRAVERSAL`, `HOP_MARKS`, `ROOFS_PLACES`, `PITCHED` (the `pitched` blocks' rects) and `STREETS` (the `street` blocks' rects).
  - `ROOFS_COLLIDERS` (`{ x, z, r }[]`).
  - `skylineY(x, z) → number`: the drawn top at a spot. That is the ground, except `RIDGE` over a pitched footprint, the tower stages' roofs, and `VANE_TIP` within 0.2 m of the vane.
  - `roofsArea() → { name: 'The Rooftops', bounds, spawn, colliders, waters: [], perches: [], ground, traversal }`.
- Consumes: `createGround`, `validateGround`, `STEP_MAX` (`src/ground.js`); `createTraversal`, `validateTraversal`, `LONG_LEAP_ID`, `BASE_ABILITIES` (`src/traversal.js`); `floodTraversal` (Task 1).

- [ ] **Step 1: Write the failing tests** (pure; with `abilities` set to `BASE`, `LL = { ...BASE, longLeap: true }` and `ALL = { longLeap: true, steady: true, climb: 2.2 }`)

```js
it('the ground and the moves pass their rules', () => {
  expect(validateGround(ROOFS_GROUND)).toEqual([]);
  expect(validateTraversal(ROOFS_TRAVERSAL, { ground: a.ground, bounds: ROOFS_BOUNDS, colliders: ROOFS_COLLIDERS })).toEqual([]);
});
it('is about the Farm’s size', () => { /* (maxX-minX) and (maxZ-minZ) each within 90..110 */ });
it('never stuck, with every ability: from anywhere she can get to, the alley without Long Leap', () => {
  for (const ab of [BASE, LL, ALL]) for (const r of flood(ab).reachable(spawnR)) expect(flood(BASE).reachable(r).has(spawnR)).toBe(true);
});
it('every named roof is reached without Long Leap; the lantern only with it', () => { /* ROOFS_PLACES */ });
it('no cell of the street or under a pitched roof can be reached', () => {
  // every 0.25 m cell inside STREETS and PITCHED (outside every disc and flat block over them)
  // is in no region reachable from the spawn with ALL
});
it('the fire escapes are stairs: the garage roof and the warehouse roof are walked to from the alley', () => {
  expect(flood(BASE).regionAt(...ROOFS_PLACES.warehouse)).toBe(spawnR);
  expect(flood(BASE).regionAt(...ROOFS_PLACES.garages)).toBe(spawnR);
});
it('the first roof is soon: a climb within 16 m of the spawn, the shed two hops up', () => { /* hop-count BFS */ });
it('has the crossings, gaps and marks the plan names', () => {
  // kinds: plank >= 3, ridge >= 6, gutter >= 2, line >= 2, pipe >= 1;
  // leaps with no requirement >= 6; exactly 3 with LONG_LEAP_ID, dist 3.6..4.5;
  // every hop has a mark in HOP_MARKS[kind]
  // every climb rises 0.8..1.5; every drop falls 0.9..3.0
});
it('the tower is on the skyline from the alley', () => {
  // the segment from (spawn.x, 2.5, spawn.z) to (26, 18.5, -17.9) stays above skylineY at 0.25 m samples
});
it('every collider stands on one level', () => {
  // ground.y at the centre and 8 rim points of each collider within STEP_MAX of each other
});
```

- [ ] **Step 2: Run** `npx vitest run test/roofsplan.test.js`. Expected: FAIL (no module).
- [ ] **Step 3: Implement** `src/world/roofsplan.js` from "The place" above. Give a short header like `traversalyard.js`'s: the map in ASCII, the levels, why pitched roofs are void (R4), why the street is −4 (R3), and the flights side by side.
- [ ] **Step 4: Run** `npx vitest run test/roofsplan.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `src/world/roofsplan.js test/roofsplan.test.js`, with the message "Rooftops step 2: the plan of the place (alley, terrace, warehouse, clock tower) with every move placed and a way down from everywhere".

### Task 6: The facade kit and the window atlas

**Files:**
- Create: `src/world/roofsparts.js`
- Test: `test/roofsparts.test.js`

**Interfaces:**
- `createWindowAtlas() → { texture: THREE.DataTexture, size: 64, cells: 16 }`.
  - A 4 × 4 grid of 16 px cells. Each has a frame and glazing bars, and RGBA from fixed tables.
  - Cells 0–7 are lit warm (curtain shades); 8–10 are lit cool (a TV's blue); 11–15 are dark or curtained.
  - The same pixels every call.
- `windowCell(x, z, i) → 0..15`, from `hash01`. Over any 200 windows, at least 60% are lit (cells 0–10).
- `addWindowQuads(list, out) → { geometry }`. `list` is `{ x, y, z, nx, nz, w, h, cell }[]`. It returns one indexed `BufferGeometry` (position, normal, uv, color). Each quad sits 0.02 m off its wall, along its normal.
- `roofsMaterials() → { brick, slate, render, metal, wood, glass, windows }`. They are created once per build; `windows` is emissive with the atlas as its `emissiveMap`.
- Shared geometries `PARTS`: unit box, chimney pot (cylinder, 10 sides), ridge cap, gutter, parapet coping, plank, line tube.
- Marks: `markMesh(kind, hop) → Object3D`. Kinds:
  - `lip`: a chipped brick lip on the edge.
  - `stub`: a plank stub.
  - `bags`: two bin bags.
  - `gutter`: a gutter end.
  - `wall`: a low wall.
  - `skylight`: a frame.
  - `bunker`: a coal bunker lid.
  - `bin`, `crate`, `pipe`, `sill`.
  - Each comes with one soft glow disc at the take-off (one shared additive material, `noCast`).

- [ ] **Step 1: Write the failing tests:**
  - `the atlas is the same twice and lights most windows`;
  - `every window quad uses the one windows material and stays inside its cell`;
  - `every mark kind in HOP_MARKS has a mesh, and its glow casts no shadow`.
- [ ] **Step 2: Run** `npx vitest run test/roofsparts.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `src/world/roofsparts.js`. It uses no `Math.random`, and draws no uuid outside `withLocalUuids`, since `build` calls it inside one.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `src/world/roofsparts.js test/roofsparts.test.js`, with the message "Rooftops step 2: the facade kit, one window atlas and the take-off marks".

### Task 7: The place drawn, part one: the alley and the terrace

**Files:**
- Create: `src/world/roofs.js`
- Modify: `test/traversalwiring.test.js`. Its test `no shipped area places moves yet` becomes `only the Rooftops places moves`: `roofs.js` is the one file in `src/world/`, besides the yard, that names `traversal:`. The edit lands here because this task's `roofs.js` is the first to return `traversal`.
- Test: `test/roofs.test.js`

**Interfaces:**
- `build(scene, { water, wind } = {}) → area record`. It has `fair.js`'s keys:
  - `name`, `colliders`, `bounds`, `spawn`, `boxes`, `waters: []`, `waterFx: []`, `pois`, `collectibles`, `scenics`, `critterSpawns: []`, `moments: []`, `puddles`, `groundBounce`, `skyDusk`, `tippables`, `perches`;
  - plus `ground`, `traversal`, `anchors`, `evening: true`, `strays: false`, `skySunset` and `duskLight`.
  - Part one fills what the alley and the terrace need. Task 8 fills the rest.
- What part one draws:
  - the alley: wall, one lamp (`builder.lampPost`, so dusk lights its globe and lamp pools follow), bins, crates, the shed, a drainpipe and the alley stair;
  - the garages, the back yards (walls, washing posts) and the bunkers;
  - the extensions, the outriggers and the terrace (back walls with atlas windows, pitched slate roofs, gutters, ridge caps, the stacks with pots);
  - the flat roofs, the planks, the washing lines with cloths, and every mark at its spot.

- [ ] **Step 1: Write the failing tests**
  - `each block's top is drawn at its ground height` (each `userData.block` mesh's bbox max y within 0.03 of its block's y; pitched: ridge mesh max y = RIDGE).
  - `each crossing is drawn along its rail` (each `userData.crossing` mesh's bbox spans both ends within 0.3 m).
  - `each hop has its mark within 0.5 m of its take-off`.
  - `nothing on the Rooftops fades` (no `userData.window` mesh; `findFadeOccluders` finds lamp posts only so far).
  - `the record has every key an area has` (the key list above).
- [ ] **Step 2: Run** `npx vitest run test/roofs.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** part one, inside `withLocalUuids`, reading every position from `roofsplan.js`.
- [ ] **Step 4: Run** `npx vitest run test/roofs.test.js test/traversalwiring.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `src/world/roofs.js test/roofs.test.js test/traversalwiring.test.js`, with the message "Rooftops step 2: the alley, the garages, the back extensions and the terrace drawn".

### Task 8: The place drawn, part two, and the evening

**Files:**
- Modify: `src/world/roofs.js`, `src/game/walk.js`, `src/game/session.js`, `src/game/walkresume.js`
- Create: `src/roofslife.js`
- Test: `test/roofs.test.js`, `test/roofslife.test.js`, `test/budget.test.js` (one row in each table)

**Interfaces:**
- What part two draws:
  - the corner shop (telescope);
  - the warehouse, with parapets, the tank, the loft (pigeon holes), the lantern (glass), pipe-1 and the warehouse stair;
  - the tower: the stages with railings, a lit clock face on each side at about 13.3 (fixed hands, 7:10), the vane (mast plus arrow and letters) to `VANE_TIP`, and a `fadeOccluder` cylinder from 11.1 to 12.3 only;
  - the street below (road, kerbs, three lamps at −4) and one bus (one mesh, emissive windows);
  - a far band of town roof silhouettes (one mesh, `noCast`, `builder.horizonBand`'s pattern);
  - the six discovery props, with `anchors.discoveries = { garden, loft, vane, skylight, telescope, chimney }` (`{ x, z, y }`).
- The rest of the record:
  - `colliders`: `ROOFS_COLLIDERS`.
  - `pois`: 13, all in the spawn's walk region (R5).
  - `collectibles`: 5, plain labels. One is in the alley; four are on roofs reached without Long Leap.
  - `scenics`: 3 (`the clock tower`, `the warehouse roof`, `the terrace roofs`).
  - `perches`: alley crates, the garden bench and the telescope crate, each on one level.
  - `skyDusk`: `{ top: 0x1f2a52, horizon: 0x8a5a6a }`. `skySunset`: `{ top: 0x4a5a8c, horizon: 0xe89a6a }`.
  - `duskLight`: `{ fogNear: 40, fogFar: 140 }` (the haze), with the rest at the defaults.
  - `life`: `createRoofsLife`.
- `createRoofsLife(area) → (ctx) => { update(dt, t), dispose() }`.
  - `t` is walk seconds. `eveningAt(t) = smoothstep(0, EVENING_RAMP, t)`, with `EVENING_RAMP = 240`.
  - The sky starts at `skySunset` and reaches `skyDusk`. `scene.background` is rebuilt only when the step `floor(eveningAt(t) · EVENING_STEPS)` changes (`EVENING_STEPS = 6`), and the old texture is disposed.
  - The fog colour and the sun and fill intensities lerp every frame on the existing objects (no allocation).
  - The bus runs along the street: `busAt(t, out)`, x from −60 to 60 over 14 s, every 45 s, hidden between runs.
- `walk.js`:
  - `const eveningLook = duskActive || areaData.evening === true;`
  - It gates `applyDusk` (about line 804), `applyLighting`'s `dusk:` (about 824), the clouds' and night sky's `dusk:` (about 1568), `audio.startAmbient`'s `dusk:` and the music mood.
  - The weather gate (about 842) gains `&& areaData.evening !== true`, so no rain on the roofs.
  - `duskActive` keeps every other use: the secrets roll, the fireflies, room configs and `session.duskActive`.
- The dusk count:
  - `session.countsDusk = duskActive || (areaData.evening === true && equipped.collar === 'glow')`.
  - `progression.completeWalk(session.areaId, { dusk: session.countsDusk })`.
  - The resume note's `duskActive: !!session.countsDusk`.
  - `countsDusk` is added to `session.js`'s FIELDS.
- `test/budget.test.js` rows:
  - `['roofs', buildRoofs, 450, 380, 70000]`, with a comment giving the measured numbers.
  - The merged table: `['roofs', buildRoofs, measured meshes + 12%, measured casters + 12%]`.
- `test/roofs.test.js` pins the exact built and merged counts and the build's `Math.random` draws, as `test/fair.test.js` does.

- [ ] **Step 1: Write the failing tests**
  - `test/roofs.test.js`:
    - `the tower is the highest thing, and only its body fades`;
    - `the street below is outside every walk region and has its lamps and the bus`;
    - `every POI is in the walk region of the spawn`;
    - `every collectible, scenic and discovery anchor is reached without Long Leap` (flood, `BASE`);
    - `the built counts are pinned, within the aim (300 / 120 / 60,000)`;
    - `the build draws N times on Math.random` (the measured N).
  - `test/roofslife.test.js`:
    - `the sky starts at sunset and is dusk by 240 s, rebuilt six times`;
    - `the bus runs the same at the same time`;
    - `update allocates nothing between sky steps` (spy on `skyBackground`).
  - `test/roofsgame.test.js` (create):
    - `counts as a dusk walk only with the Glow Collar` (walk.js source pins and a session harness: Day choice plus glow collar counts; plus no collar does not; both have the evening look);
    - `no weather on the roofs` (source pin on the gate).
- [ ] **Step 2: Run** `npx vitest run test/roofs.test.js test/roofslife.test.js test/roofsgame.test.js test/budget.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** part two, `src/roofslife.js` and the `walk.js`, `session.js` and `walkresume.js` changes.
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/traversalwiring.test.js test/walkresume.test.js test/session.test.js`. Expected: PASS.
  - If the aim (300 / 120 / 60,000) is missed, trim casters first (`noCast` on anything under 1.3 m), then triangles. The 450 / 380 / 70,000 ceiling never rises.
- [ ] **Step 5: Commit** the files above, with the message "Rooftops step 2: the warehouse, the clock tower, the street below and an evening that deepens over the walk; a Rooftops walk counts as dusk only with the Glow Collar".

### Task 9: Into the game, behind `?roofs=1`

**Files:**
- Create: `src/roofsflag.js`
- Modify: `src/game/walk.js` (`AREAS`, `beginWalkFromHomebase`, strays), `src/main.js` (`readResume`'s `areaIds`)
- Test: `test/roofsgame.test.js`

**Interfaces:**
- `roofsOn() → boolean` and `setRoofs(value)`, exactly the `growOn` / `setGrow` pattern, reading `?roofs=1`.
- `walk.js`:
  - `import * as roofs from '../world/roofs.js'`, and `AREAS` gains `roofs`.
  - In `beginWalkFromHomebase`: `if (roofsOn() && !getPendingRoom()) { startWalk({ duskMode, areaOverride: 'roofs' }); return; }`, placed before the existing solo branch.
  - Strays: `loners` is 0 and `wanderName` is null when `areaData.strays === false`.
- `main.js`: `readResume(..., { areaIds: Object.keys(progression.state.walks).filter((id) => id !== 'roofs' || roofsOn()) })`.
- `CATALOG.areas` is not touched.

- [ ] **Step 1: Write the failing tests** (`test/roofsgame.test.js`)
  - `the catalog does not have the Rooftops until step 4`: `expect(Object.hasOwn(CATALOG.areas, 'roofs')).toBe(false)`, with the reason in a comment.
  - `the flag starts a solo Rooftops walk, never in a room` (a source pin on the new branch, plus `roofsOn()` with `setRoofs`).
  - `a Rooftops walk note is dropped without the flag` (`readResume` with the filtered ids).
  - `a room never walks the Rooftops` (`rooms.js` `knownAreas` excludes `roofs`; a proposal for it is ignored).
  - `no strays, no wanderer on the Rooftops`.
- [ ] **Step 2: Run** `npx vitest run test/roofsgame.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the flag and the three wiring changes.
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/walkresume.test.js test/rooms.test.js test/straycats.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the four files, with the message "Rooftops step 2: in the game behind ?roofs=1 (solo only, no strays); nothing offers it until step 4".

### Task 10: Every per-area list

**Files:** the checklist is `git show --stat 5daf75a5`, the Fairground's own registration commit, minus its catalog, golden-mouse, `tutorialwords`, `nextthing` and grass rows. Add `YARN_SPOTS` (`src/propsets.js`, added after 5daf75a5). Concretely:
- `src/progression.js`: `defaultState().walks.roofs: 0`, plus one line in the walks comment.
- `src/marks.js`: `MARK_AREAS` and `emptyMarks()`.
- `src/propsets.js`: `SETS.roofs` and `YARN_SPOTS.roofs`.
- `src/rests.js`: `REST_LOOKS`.
- `src/render/ambient.js`: `case 'roofs': return 'moths'`, since the alley lamp is the lamp.
- `src/render/clouds.js`: `CLOUD_AREAS` and `AREA_SKY.roofs = { clouds: 6, banks: 4 }`, so the stars and the moon come with the dusk sky.
- `src/render/pawprints.js`: `AREA_RULES.roofs = { ground: null, path: 'gravel', strip: null }`.
- `src/audio.js`: a `roofs` branch in `startAmbient` (a far town hum, from the existing layers; no birdsong).
- Every test table the commit touched that lists areas by id: edges, sky, minimap, mergeprops, water, waterlooks, shore, fishjump, wadingroutes, climbing. Grep each for `fair` and add a `roofs` entry with its own value.
- No grass: no `GRASS_STYLES` or `GROUND_TINTS` row.

**Interfaces:** `ROOFS_REGISTRATION` (in `roofsplan.js`) holds each row in its table's own shape:
- `{ catalog, propSet, yarnSpots, restLooks, clouds, ambient, pawprints, budget, view, colony: false, strays: false }`.
- `propSet`: 4 carryables, 3 knockables, 3 markables (`nearBorder: false`), 1 flap, 3 rests (drink, eat, nap), 3 hides, `dogYard: null`, `keepSlots: []`.
- Everything sits on one level and is reached without Long Leap.

- [ ] **Step 1: Write the failing tests** (`test/roofs.test.js`, the `test/fair.test.js` pattern)
  - `each registration row is in its table` (one `expect` per table).
  - `each prop sits on its own level, clear of colliders, reached without Long Leap`.
  - `an old save loads with walks.roofs 0 and marks.roofs []`.
  - `not a colony area`.
- [ ] **Step 2: Run** `npx vitest run test/roofs.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the rows, and add `roofs` to each listed test table with its own value.
- [ ] **Step 4: Run** `npx vitest run test/roofs.test.js test/marks.test.js test/propsets.test.js test/yarnspots.test.js test/rests.test.js test/ambient.test.js test/clouds.test.js test/pawprints.test.js test/progression.test.js test/edges.test.js test/sky.test.js test/minimap.test.js test/audio.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the exact files changed, with the message "Rooftops step 2: in every per-area list (marks, props, yarn, rests, ambient, clouds, pawprints, audio), no grass, no colony".

### Task 11: The unlock, written and tested, not yet live

**Files:**
- Modify: `src/world/roofsplan.js` (`ROOFS_REGISTRATION.catalog`)
- Create: `test/helpers/withroofs.js`
- Test: `test/roofsgame.test.js`

**Interfaces:**
- `ROOFS_REGISTRATION.catalog = { name: 'The Rooftops', price: 100, requires: { area: 'fair', walks: 2 } }`.
- `withRoofs(catalog) → catalog'`: a copy with `areas.roofs` added after `fair` (the place cards' order). Step 4 makes the same edit in `src/progression.js`.

- [ ] **Step 1: Write the failing tests**
  - `the offer: after 2 Fairground walks, for 100` (`areaOffer(state, withRoofs(CATALOG), 'roofs')` equals `{ requires: { area: 'fair', walks: 2 }, price: 100 }`; a save with `keptOffers: ['roofs']` gets the same; `KEPT_OFFERS.roofs` is undefined).
  - `the Fairground's home line names it` (`nextThing` with `withRoofs`, `area: 'fair'`, `walks.fair: 1`: `home.opens` with `{ place: 'The Rooftops' }`).
  - `locked, then open to buy, then bought` (`placeState` across 0, 2 and 2-plus-owned Fairground walks).
  - `nothing in the real catalog offers it` (`nextThing(state, { catalog: CATALOG })` never names it, and `placeState(state, CATALOG, 'roofs').line` is `'coming soon'`).
- [ ] **Step 2: Run** `npx vitest run test/roofsgame.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the row and the helper.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `src/world/roofsplan.js test/helpers/withroofs.js test/roofsgame.test.js`, with the message "Rooftops step 2: its unlock as the world map orders it (100 after 2 Fairground walks), tested on a copy of the catalog; step 4 makes it live".

### Task 12: The words

**Files:**
- Modify: `src/clanwords.js`, `src/offclanwords.js` (`PLACE_WORDS.roofs: 'The Rooftops'`)
- Modify: `test/fixtures/series-words-*.json` (snapshot refresh only)
- Test: `test/roofsgame.test.js`

- [ ] **Step 1: Write the failing test** `the place's name is in both word sets`. `withStandInWords` (`test/helpers/standinwords.js`) reads `PLACE_WORDS.roofs` from each set as `'The Rooftops'`. No Rooftops label (`collectibles`, `scenics`, `perches[].label`, `anchors`) holds a word from `seriesFilter`.
- [ ] **Step 2: Run** `npx vitest run test/roofsgame.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the two rows. Then run `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`.
- [ ] **Step 4: Check** `git diff --stat test/fixtures/` and `git diff test/fixtures/`. Every added line names the Rooftops, and none is removed. Then run `npx vitest run test/serieswords test/roofsgame.test.js test/offwords.test.js test/clanwords.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the two sources, the refreshed fixtures and the test, with the message "Rooftops step 2: its name in both word sets".

### Task 13: The first roof on the real player, the pictures, the worst spots, the full suite

**Files:**
- Modify: `src/world/roofsplan.js` (`ROOFS_TOURS.firstRoof`, `ROOFS_SHOTS`, `ROOFS_REGISTRATION.view`), `verify-places.html`
- Create: `public/places/roofs.jpg`
- Test: `test/roofs.test.js`

**Interfaces:**
- `ROOFS_TOURS.firstRoof`: the `YARD_TOURS` shape. From the spawn: walk to bin-1's climb spot, jump, jump, jump onto the garage roof.
- `ROOFS_SHOTS`: `{ name: 'px,py,pz,lx,ly,lz' }` for:
  - `alley`: the spawn view, the tower on the skyline;
  - `terraces`: from out-7, along the back extensions;
  - `ridge`: on a ridge, looking along;
  - `gap`: a marked side-return leap;
  - `warehouse`: the roof, tank, loft and lantern;
  - `tower`: from the tower top, south over everything;
  - `edge`: the street below and the bus;
  - `card`: the card picture, from the alley, looking up at the terrace backs and the tower.
- `ROOFS_REGISTRATION.view` is `ROOFS_SHOTS.card`.
- `verify-places.html`:
  - `roofs` is in its AREAS, and `VIEWS.roofs` is `ROOFS_REGISTRATION.view`;
  - an `area.evening` build gets `applyDusk` and `createRoofsLife` advanced to `t = 240`;
  - `window.__ready = true` after the first render;
  - `window.__shot(name)` answers `name` after `__cam(...ROOFS_SHOTS[name])`;
  - `window.__info()` returns `{ calls, triangles }` from `renderer.info.render` after a render.

- [ ] **Step 1: Write the failing test** `the first roof in seconds, on the real player`. Drive `yardWalk({ area: roofsArea(), at: [ROOFS_SPAWN.x, ROOFS_SPAWN.z], face: [0, -1] })` with `createYardPilot(ROOFS_TOURS.firstRoof)`, in the way `test/traversalyard.test.js` drives the yard's tours. The tour is done in under 20 s of walk time, and she stands at y `GARAGE`.
- [ ] **Step 2: Run** `npx vitest run test/roofs.test.js`. Expected: FAIL. Then implement the tour. Expected: PASS.
- [ ] **Step 3: The pictures.**
  - Start `npx vite --port 5177 --strictPort` in the background.
  - Run `node scripts/record-page.mjs --url 'http://localhost:5177/verify-places.html?area=roofs&bare' --out <scratchpad>/rooftops-step2 --shots alley,terraces,ridge,gap,warehouse,tower,edge,card --size 1280x720`.
  - Save `card` as `public/places/roofs.jpg` (JPEG, about 30 KB, as `fair.jpg` is).
- [ ] **Step 4: The worst spots.** For each shot, and for the Fairground at its own view, read `window.__info()` through the same page. Record a table of calls and triangles in the report. If the Rooftops' worst is more than 20% above the Fairground's worst, trim and re-shoot before going on. Stop vite.
- [ ] **Step 5: The full suite.** Check `uptime` against `sysctl -n hw.ncpu`, then run `npx vitest run`. Expected: all green. A failure that passes alone twice is load flake: note it, never edit it away.
- [ ] **Step 6: Commit** `src/world/roofsplan.js verify-places.html public/places/roofs.jpg test/roofs.test.js`, with the message "Rooftops step 2: the first roof in seconds on the real player, the card picture and the picture views".
- [ ] **Step 7: The report for the owner.** Give the pictures' paths, the worst-spot table, the built and merged counts, the three owner questions, and what waits for steps 3 and 4.

### Task 14: The Rooftops on the world map (only after world-map is merged)

**Depends on:** branch `world-map` merged into `main`, and `main` merged into `rooftops-2`. If world-map has not merged when Task 13 is done, stop here and report. This task then runs after that merge, on this branch or as a small follow-up.

**Files:**
- Modify: `src/worldmap.js` (on `main` after the merge), its header line "Not on the map: ... the Rooftops"
- Test: `test/worldmap.test.js`

**Interfaces:**
- A new frozen list in `src/worldmap.js`: `TOWN_PLACES = [{ id: 'roofs', areaId: 'roofs', x: 883, y: 518, r: 46 }]` (draft 2's "Rooftops ↑" label). Its name is read from `words().PLACE_WORDS.roofs`.
- `worldMapModel` adds a `kind: 'town'` region for it, after the street places. Its `status` is `catalog.areas.roofs ? 'built' : 'soon'`, and its state is `placeState(...)`.
- `tapTargets` keeps the drawing order, and a later target wins a tap inside its circle, so the Rooftops beats the town over its own spot.
- Its card has no button while it is `soon` (`placeCardFor` already does that).

- [ ] **Step 1: Write the failing tests**
  - `the Rooftops is on the map inside the town, coming soon`.
  - `a tap on it picks the Rooftops; a tap on the town's centre still picks the town`.
  - `its card has no button`.
  - `with the catalog row (withRoofs) it is a place like the others`.
- [ ] **Step 2: Run** `npx vitest run test/worldmap.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Re-run `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords` if the map's text is snapshotted, and check that the diff holds only the Rooftops' line.
- [ ] **Step 4: Run** `npx vitest run test/worldmap.test.js test/placecard.test.js test/homebase.map.test.js test/serieswords`, then the full suite (load check first). Expected: PASS.
- [ ] **Step 5: Commit**, with the message "Rooftops step 2: on the world map inside the town, coming soon until it opens".

---

## Self-review (done while writing)

- **Spec coverage (step 2):**
  - The alley, terraces, tall building and clock tower: Tasks 5, 7 and 8.
  - Walkable roofs, and crossings and gaps placed: Task 5.
  - The edge and the street below: R3, Tasks 5 and 8.
  - The evening light: Task 8.
  - The lists: Tasks 9 and 10.
  - The unlock: Task 11.
  - The tests: every task.
  - The card picture: Task 13.
  - The leftovers from step 1: Tasks 1–4.
  - Co-walker height before the unlock: R1. Words: Task 12. The world map: Task 14.
  - Left out on purpose:
    - Birds (step 3).
    - Discovery behaviour, the two skills, golden mice, height and dusk polish (step 4; their spots are drawn and anchored here).
    - Found-outfit spots (found-outfits step 3 lists every area).
- **Type consistency:**
  - `regionAt(x, z, y)` is used by Tasks 1 and 5.
  - `crossingToMount(..., skipCrossing, skipEnd)` and `yardWalk({ area })` are used by Tasks 4 and 13.
  - `roofsArea()`, `ROOFS_PLACES`, `ROOFS_REGISTRATION` and `ROOFS_SHOTS` come from `roofsplan.js` throughout.
  - `withRoofs` is used by Tasks 11 and 14.
  - `areaData.evening` and `strays` are read by Tasks 8 and 9.
- **Proportion:** the code blocks are tests and signatures. Coordinates are the plan's decisions; the move spots are left to the builder under the validator and the flood.
- **Merge-order risk:** world-map also rewrites the series-words fixtures. After merging `main`, re-run the snapshot refresh rather than hand-merging JSON.
