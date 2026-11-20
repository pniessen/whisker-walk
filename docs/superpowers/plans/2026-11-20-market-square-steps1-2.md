# The Market Square, steps 1 and 2: the square and the sneak — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Market Square as a walkable place behind `?market=1` (cobbles, six stalls and a café, a fountain, bunting, day and dusk, its card picture and a test page), then the sneak on it: stallholders behind their counters on a readable rhythm with a "busy" bubble, noticing, grab and munch, a playful shoo and hop, the coo that is the two-child distraction, a treats tally, pay, teamwork pay, and a film for the owner.

**Architecture:**
- **The plan of the square, pure:** `src/world/marketplan.js`. Stalls, the café, the fountain, colliders, hides, POIs, `marketArea()` (headless) and `MARKET_REGISTRATION` (the rows the shared tables copy, as `FAIR_REGISTRATION` does). No THREE.
- **The look:** `src/world/marketparts.js` (shared geometries, one awning-and-produce atlas, the treat meshes, the bubble) and `src/world/market.js` (`build(scene, opts)`, `setMarketDusk`).
- **The sneak:** `src/marketrules.js` (pure: the rhythm, the tell, noticing) and `src/marketlive.js` (`createMarketLive`: the stallholders, the treats, grab/munch/shoo/coo). `src/marketnone.js` is the main-graph leaf (`NO_MARKET`, the treat item ids). `src/game/marketplay.js` says what each event pays and shows.
- **In the game:** its own lazy chunk through F6's `AREA_LOADERS.market` (world `market.js`, life `createMarketLive`). `CATALOG.areas` has no row and the world map has no spot. A walk there starts only from `?market=1` (`src/marketflag.js`, the `src/grow.js` pattern), solo, Clan Edition, with `areaOverride: 'market'`.

**Tech Stack:** Plain ES modules, Three.js 0.185, Vite 8, Vitest 4, Node 26, headless Chrome through `scripts/record-page.mjs`, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-11-20-market-square-design.md` (approved by the owner 2026-11-20), "Build order" items 1 and 2. Sections used: "The square", "How a sneak works", "Two children together", "Calls I made after the builder check", "Look and feel", "Constraints", "Goals", "Anti-goals". Steps 3 and 4 are outlined at the end.

**Depends on (in this order on `main`):** `rooftops-2` (step 2), the Old House step 1 (`house`), and F6 lazy area loading (`f6-lazy`, plan `docs/superpowers/plans/2026-11-20-f6-lazy-areas.md` on that branch). The main script is at the 900 KB ceiling, so the Market arrives only as its own lazy chunk, registered the F6 way. Task 0 stops if any of the three is missing.

## Rulings (Claude's calls; the owner can overturn each)

- **M1. Step 1 ships behind a flag and nothing offers it.** No `CATALOG.areas.market`, no `MARKET_REGISTRATION.catalog` (it is `null` until step 4), no world-map spot, no unlock. `?market=1` makes Explore start a solo Clan Edition Market walk (never in a room), after the `roofs` and `house` branches. `walks.market: 0` exists so a walk counts and its resume note is kept with the flag.
- **M2. Who stands where.** Four stallholders guard treats: fishmonger, baker, cheese stall, milk cart. The flower and fruit stalls have a serving-only stallholder each (no rhythm, no noticing, nothing to guard). The café has nobody watching: its crumbs are under a table, the easy first try. Every stallholder stands inside its stall's colliders, so no cat can reach one.
- **M3. Watching means facing front.** A stallholder watches only while serving and while busy with the tell up. Turning away, turned away and turning back watch nothing. The bubble shows from "busy" until they start to turn back. So the bubble means "get ready, then go", and its going means "they're turning round now".
- **M4. A grab while watched is a shoo, not a grab.** Pressing the action button while watched (being cooed at included) starts the shoo and the hop, and the treat stays out. Otherwise the coo would be a free treat.
- **M5. The coo.** A watched cat whose speed stays under `STILL_SPEED` for `STILL_S` is cooed at for `COO_S`. While cooing, that stall notices no other cat. One coo per stop: she must move and stop again for another. If the cooed cat moves toward the treat, the coo ends and she is shooed.
- **M6. Treats in the mouth are a mouth state.** `carry.js` gains a `treat` flag beside `job` and `toy`: never a keepsake, never slips in rain, no drop prompt, no carry-pick from the carryables path. The cream is lapped where it stands (head down, no mouth mesh) but uses the same mouth state and timers.
- **M7. Partner munching with no new message.** On a grab, the walk sends the existing `carry-pick` event with `itemId: 'market-treat-<stall>'`, no new type, no new field. A current build routes that id to `market.remotePick` before its carryables lookup, shows the treat in the partner's mouth and munches it on a timer, and never touches its own treats. An older build finds no such carryable and ignores it, as `applyRemoteCarry` already does for an unknown id.
- **M8. Teamwork pay, each device on its own.** The eater's device pays the eater her ordinary treat pay and shows a teamwork line. The distracter's device pays the distracter `AWARDS.teamtreat` when the partner's treat pick for a stall arrives while that stall is cooing at her, or within `TEAM_GRACE_S` of the coo ending. Once per stall per walk on each side.
- **M9. Pay.** `AWARDS.treat = 6` and `AWARDS.teamtreat = 6`. A treat pays once per stall per walk (`awardOnce`, key `market-treat-<stall>`). The tally counts every treat eaten. A resumed walk sets the tally to the number of treat keys already paid.
- **M10. No strays, no wanderer, no dog, no rival border, not a colony area** (`strays: false`, as rooftops-2 reads it). Stray cats at the stalls would blur the rhythm a child is reading. No database change.
- **M11. No step-2 line names a stallholder,** so every line is the same in both word sets and no new word is needed. Step 4 adds the Twoleg word where a line needs one ("In the clan words the stallholders are Twolegs").
- **M12. No letters in any texture.** Stall signs show pictures (a fish, a loaf, a wedge, a churn, a cup), and the bubble is three dots. So no text escapes the word tables.

## Questions only the owner can answer

1. **The names** (the spec sends them to him and his daughter): Fishmonger with a fish head on ice, Baker with a sausage roll, Cheese stall with a nibble of cheddar, Milk cart with a saucer of cream, Café crumbs. And the prompt verb "snaffle" ("E — snaffle the fish head").
2. **The pay:** 6 🐾 a treat (once per stall per walk) and 6 🐾 to the distracting child for teamwork (M9)?
3. **No stray cats in the square** (M10)?
4. **The pictures and the film:** do the square, the stalls and the dusk look right, is the card picture the one, and does the sneak feel right (the bubble readable, the shoo funny)?

## Global Constraints

Copied verbatim from the spec's "Constraints" and "Anti-goals":

- "**Performance (my call, after the builder check):** the street places have their own lower ceilings in `test/budget.test.js` (Park 210/170/40,000, Farm 280/210/62,000, Fairground 250/180/75,000 provisional). The Market takes the Farm's: **280 meshes, 210 shadow casters and 62,000 triangles**. Stalls share geometry and one awning and produce atlas. Stallholders reuse the villager figure from `src/critters.js`."
- "**Determinism for two players:** stall cycles and treat placement are data or seeded on their own salted streams. `test/fixtures/flat-trace.gameplay.json` doesn't move."
- "**Offline-first:** nothing contacts the database."
- "**Text** is pitched for a 9-year-old and goes through the word tables for both word sets. No series words go in string literals outside them."
- "**Download size:** the main script is near the 900 KB ceiling, so this waits for lazy area loading (F6), or ships as its own lazy chunk."
- "**Merge and push** need the owner's yes. Each build step ends with the full suite green and pictures for the owner."
- "**Telling off a child.** Shoos are playful: a laugh in the voice, a broom waved in the air. Nobody chases her far or traps her, and the broom never hits her."
- "**Unreadable timing.** If a child can't see when a stallholder is about to turn, it's unfair. The tell must show before the turn as well as during it."
- "**People in the way.** As at the Fairground, a person never stands where the cat is, never pushes her and never follows her. The stallholders stay behind their counters."
- "**A crowded, slow square.** It must stay calm to look at, and stay smooth on an old iPad."

The build rules for this branch:

- **Work only in** `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/market`, on branch `market`. Never touch the main checkout. Never merge, push, or touch the database or any `.env` file.
- **Commits:** `git add <exact paths>`, never `-A` or `.`. Every message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Two-player determinism:** stall cycles come from the time of day plus the walk's seed (`roomSeed ?? soloSeed`) on their own salted stream (`MARKET_STALL_SALT`), never `walkRng`, never `Math.random`. After every task: `git diff --exit-code test/fixtures/flat-trace.gameplay.json`.
- **No new network message:** no new event type and no new field. Only the existing `carry-pick` with a new `itemId` value (M7).
- **Words:** every new line is a `phrase()` id in `src/clanphrases.js`'s `LATER` table, read through `src/marketwords.js`. Labels in the area record (collectibles, scenics) are plain words, the same in both sets. `areaData.name` is the fallback `'The Market Square'`; step 4 moves it into `PLACE_WORDS`.
- **Offline-first:** nothing here touches the network beyond M7's event, and nothing touches the database.
- **Deterministic build:** no `Math.random`, `Date.now` or `performance.now` in the plan, parts or build. Variation comes from `hash01(x, z, salt)` (`src/world/warehouselook.js`). `build` runs inside `withLocalUuids`, as `fair.js` does. Loading `market.js` or `marketlive.js` paints no canvas and draws no random number (F6's `test/areaimport.test.js` checks every loader).
- **Tests:** `node_modules` is symlinked; do not run `npm ci`. Run single files during a task (`npx vitest run test/<file>`). The full suite runs in Tasks 6 and 14. Before it, check `uptime` against `sysctl -n hw.ncpu`, and wait while the 1-minute load is above the core count. New tests check behaviour, never `src/` as text (F6's rule).
- **Nothing that ships changes, except what a task names.** `SAVE_VERSION` stays. `CATALOG.areas` stays. Every other area's counts stay. No existing test is edited except where a task names it. No fixture changes except the series-words snapshots (Task 10).
- **Line numbers** are not given: F6 and the house rewrite the sites. Find each by the quoted code.

## Review Focus

1. **Two cats stop at one stall at once, or the cooed cat walks straight at the treat.**
   - Expected: one coo, at the first to stop. The other is never noticed while it lasts. The cooed cat walking toward the treat is shooed, and walking away just ends the coo.
   - Test: Task 12, `while one cat is cooed at, the stall notices no other cat` and `the cooed cat who walks at the treat is shooed; one who walks off is not`.
2. **The hop lands her against a crate, the fountain or the square's edge.**
   - Expected: the hop stops short at the obstacle, she is never put inside a collider, and the stick works the whole time.
   - Test: Task 12, `the hop goes away from the counter, stops at anything solid, and never takes the stick`.
3. **The partner's treat pick arrives on a build or a walk that has no Market** (a non-Market walk, a stale event after the walk changed, an older build).
   - Expected: nothing moves, nothing throws, no carryable is taken.
   - Test: Task 13, `a treat pick on a walk without the Market changes nothing`.
4. **She presses the action button with the yarn ball (or a sock) in her mouth, or while perched, swimming or munching.**
   - Expected: with something held, she sets it down and takes the treat. Perched, swimming or already munching, no treat prompt.
   - Test: Task 13, `a full mouth sets down what it holds and takes the treat` and `no treat prompt perched, swimming or munching`.
5. **A walk resumed after closing the game, mid-munch or after treats were paid.**
   - Expected: paid treats stay paid, the tally starts at their count, and a treat that was mid-munch is simply gone (not a keepsake, not paid twice).
   - Test: Task 13, `a resumed walk keeps its paid treats and their count`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/world/marketplan.js` | create | Bounds, spawn, `STALLS`, `CAFE`, `FOUNTAIN`, colliders, `MARKET_HIDES`, POIs, collectibles, scenics, `MARKET_SHOTS`, `marketArea()`, `MARKET_REGISTRATION`. Pure (Task 1). |
| `src/world/marketparts.js` | create | Shared geometries and materials, `createMarketAtlas`, `buildTreatMesh`, `createBubbleTexture`, `buildBroom` (Task 2; the last three used by Task 11). |
| `src/world/market.js` | create | `build(scene, opts)`, `setMarketDusk(area, k)`, the area's `life` hook (Task 3). |
| `src/marketflag.js` | create | `marketOn()`, `setMarket(v)`, `marketResumable(ids)` (Task 4). |
| `src/world/areas.js` | modify | `AREA_LOADERS.market`, `AREA_ENTRY_MODULES.market` (Tasks 4, 11). |
| `src/game/walk.js`, `src/main.js`, `src/progression.js` | modify | The flag's branch, the resume filter, `walks.market` (Task 4); the market's life, frame call and summary tile (Task 13). |
| per-area tables (Task 5 list) | modify | The Market's rows. |
| `verify-market.html` | create | The test page: shots, dusk, `__info` (Task 6); the live sneak and tours (Task 14). |
| `verify-places.html`, `public/places/market.jpg` | modify, create | The card picture (Task 6). |
| `src/carry.js`, `src/game/interactions.js` | modify | The `treat` flag (Task 7); the treat prompt and act (Task 13). |
| `src/marketrules.js` | create | `MARKET`, `STALL_TIMES`, `MARKET_STALL_SALT`, `stallOffsets`, `stallPhase`, `inWatchZone`, `isHidden`, `stallSees` (Tasks 8–9). |
| `src/clanphrases.js`, `src/marketwords.js` | modify, create | The market lines (Task 10). |
| `src/marketnone.js` | create | `NO_MARKET`, `TREAT_ITEM_PREFIX`, `treatItemId`, `treatStallOf` (Task 11). |
| `src/marketlive.js` | create | `createMarketLive` (Tasks 11–12). |
| `src/game/marketplay.js` | create | `handleMarketEvent`, `restoreMarket` (Task 13). |
| `src/discoveries.js`, `src/ui/hud.js`, `src/ui/screencards.js`, `src/game/netevents.js`, `src/game/session.js` | modify | Two award types, their own lines, the tally tile, the treat-pick route, `session.market` (Task 13). |
| `test/marketplan.test.js`, `test/marketparts.test.js`, `test/market.test.js`, `test/marketgame.test.js`, `test/marketrules.test.js`, `test/marketlive.test.js`, `test/marketplay.test.js`, `test/helpers/marketrig.js` | create | The tests named below. |

**Names:** the area id is `market` everywhere, and the name is "The Market Square". Stall ids: `fish`, `baker`, `cheese`, `milk`, `cafe`, `flowers`, `fruit`. Treat kinds: `fishhead`, `sausageroll`, `cheddar`, `cream`, `crumbs`. `TREAT_STALLS = ['fish', 'baker', 'cheese', 'milk']` (watched, in this order everywhere a stream is drawn).

**Headless test stub:** any test that builds the area stubs `document` as `test/budget.test.js` does (lines 10–24), then imports with `await import(...)`.

## Files shared with other branches

| File | Also changed by | At rebase |
|---|---|---|
| `src/game/walk.js` | rooftops-2 (`roofsOn` branch, `strays === false`), house (`houseOn` branch, `indoor`), f6-lazy (`startWalkWhenReady`, `pack.life`), map-gateways (dressing, `arrive`, `walkOn`, `session.roomSeed`) | Keep all. The market branch goes after the roofs and house branches. The market life sits after the Fair's in `startWalk`. |
| `src/main.js` | rooftops-2 and house (`readResume` `areaIds`), f6-lazy (loader, prefetch), map-gateways (wiring, `sendState` area) | Wrap whatever expression `areaIds:` has in `marketResumable(...)`. |
| `src/world/areas.js` | f6-lazy (creates it), rooftops/house when they register there | Add the `market` line after the others. |
| `src/progression.js`, `test/progression.test.js` | rooftops-2 (`roofs: 0`), house (`house: 0`) | Keep every key; `market` last. |
| `src/game/session.js` | rooftops-2 (`countsDusk`), map-gateways (four fields) | Keep all. |
| `src/game/interactions.js` | map-gateways (the gate prompt) | The treat prompt sits after the Fair's; independent lines. |
| `src/game/netevents.js` | map-gateways (routes `walk-on`) | Independent branches. |
| `src/clanphrases.js`, `test/fixtures/series-words-*.json` | f6-lazy (`start.*`), map-gateways (`gate.*`) | Keep every block; never hand-merge the JSON: re-run the refresh in Task 10 after merging `main`. |
| `src/audio.js` | rooftops-2 (`roofs` branch), house (`isIndoor`) | Independent lines. |
| `test/budget.test.js` | map-gateways (seaside row) | Add rows only. |

---

## The square (decisions every task uses)

North is −z and east is +x, in metres. Bounds `{ minX: -30, maxX: 30, minZ: -30, maxZ: 32 }`. Spawn `{ x: 0, z: 29 }`, facing north. The ground is flat cobbles (`FLAT_GROUND`), with a ring of paler flagstones round the fountain. Town shop fronts close the square on all four sides, just outside the bounds.

| id | kind | at (x, z) | front faces | counter w × d | treat | notes |
|---|---|---|---|---|---|---|
| fountain | — | (0, 0) | — | basin r 3.2 | — | collider r 3.4; a three-tier spire |
| fish | treat | (−15, 4) | the fountain | 3.0 × 2.0 | `fishhead` on ice, y 0.55 | blue-white awning |
| baker | treat | (−9, −15) | the fountain | 3.0 × 2.0 | `sausageroll` on a cooling rack, y 0.6 | red-white awning; flour sacks beside it (step 3's nap) |
| cheese | treat | (9, −15) | the fountain | 2.6 × 1.8 | `cheddar` on a board on a barrel, y 0.55 | yellow-white awning |
| milk | treat | (15, 4) | the fountain | 2.2 × 1.4 (a cart) | `cream` saucer on the cart's step, y 0.3 | green-white awning |
| flowers | serve-only | (−15, 18) | the fountain | 2.6 × 1.6 | — | buckets of flowers; a hide under its trestle |
| fruit | serve-only | (0, −24) | south | 3.0 × 1.8 | — | a crate of apples at its end (step 3's rolling fruit) |
| cafe | unwatched | tables (9, 19), (12.5, 21.5), (9.4, 24.2) | — | — | `crumbs` under table 0, y 0 | chairs, a striped café awning on the shop front |

- **"Front faces the fountain"** means the stall's `face` is the unit vector from `at` toward (0, 0). Local frame: +z along `face`, the counter's front line at local z = d/2, the keeper at local (0, −d/2 + 0.45), the back shelf at local z = −d/2.
- **Treat spot:** at the counter's front corner on the hide's side: local (±(w/2 − 0.3), d/2 + 0.35).
- **Hide:** under a trestle table at the stall's side, local (±(w/2 + 1.2), d/2 − 0.3), r 0.6, no collider (the trestle top is at 0.75 m; the cat walks under it).
- **Colliders:** each stall's counter-and-keeper footprint is covered by circles along its width (r = d/2 + 0.1), so the keeper's spot is never walkable. The café tables, trestles, bunting poles and lamp posts have none or a pole-sized one (r ≤ 0.15).
- **Bunting:** six strings from the stall awnings' outer poles to a mast on the fountain's spire, one merged mesh, `noCast`.
- **Lamp posts:** four, `builder.lampPost`, at (±10, ±10), so dusk lights their globes and lamp pools. Stall lanterns: a string on each treat stall's awning edge, one shared lantern material.
- The builder may shift any stall by up to 2 m, or turn it by up to 20°, to make the tests below pass. The ids, kinds and treats are fixed.

---

## Step 1: the square

### Task 0: Start from main with Rooftops step 2, the Old House step 1 and F6 merged

**Files:** none changed.

- [ ] **Step 1:** Check each is merged: `git log main --oneline | grep -m1 "Rooftops step 2"`, `git log main --oneline | grep -m1 "Old House step 1"`, `git log main --oneline | grep -m1 "F6 Task 9"`. If any is missing, stop and report: this plan builds after all three.
- [ ] **Step 2:** `git merge main` into `market` (this branch has only the spec and this plan, so nothing conflicts).
- [ ] **Step 3:** Confirm F6's names exist: `src/world/areas.js` exports `AREA_LOADERS` and `AREA_ENTRY_MODULES`; `walk.js` has `startWalkWhenReady`; `test/helpers/headlesswalk.js` exports `headlessLifecycle`. If a name differs, use the merged name everywhere below and say so in Task 4's commit.
- [ ] **Step 4:** `npm run build` and note the start-up size line. `npx vitest run --dir test` is green before any change; a red test here is not this plan's to fix: report it.

### Task 1: The plan of the square

**Files:**
- Create: `src/world/marketplan.js`
- Test: `test/marketplan.test.js`

**Interfaces:**
- Produces:
  - `MARKET_BOUNDS`, `MARKET_SPAWN`, `FOUNTAIN` (`{ x, z, r }`), `CAFE` (`{ tables: [{ x, z }], crumbs: { x, z } }`).
  - `STALLS`: frozen `{ id, kind: 'treat' | 'serve' | 'cafe', at: { x, z }, face: { x, z }, w, d, treat: { kind, x, z, y } | null, keeper: { x, z } | null, hide: { x, z, r } | null }[]`, in the table's order.
  - `TREAT_STALLS = ['fish', 'baker', 'cheese', 'milk']`; `stallById(id)`.
  - `toStall(stall, x, z) → { lx, lz }` and `fromStall(stall, lx, lz) → { x, z }` (the local frame above).
  - `MARKET_COLLIDERS` (`{ x, z, r }[]`), `MARKET_HIDES` (`{ x, z, r }[]`: every stall's hide plus the café's table 0).
  - `marketArea() → { name: 'The Market Square', bounds, spawn, colliders, waters: [], perches: [] }` (headless, for `isWalkableAt`).
  - `MARKET_REGISTRATION = { id: 'market', catalog: null, propSet, clouds, ambient, pawprints, budget, view, colony: false, strays: false }`. Task 5 fills the rows; `view` is `MARKET_SHOTS.card` (Task 6).
  - `MARKET_SHOTS`: `{ name: 'px,py,pz,lx,ly,lz' }` (filled in Task 6).
- Consumes: `isWalkableAt` (`src/player.js`).

- [ ] **Step 1: Write the failing tests** (pure)

```js
it('is a calm square, about 60 by 60 metres', () => { /* (maxX-minX) and (maxZ-minZ) each 55..65 */ });
it('has the seven stalls of the spec, four of them watched', () => {
  expect(STALLS.map((s) => s.id)).toEqual(['fish', 'baker', 'cheese', 'milk', 'flowers', 'fruit', 'cafe']);
  expect(STALLS.filter((s) => s.kind === 'treat').map((s) => s.id)).toEqual(TREAT_STALLS);
  expect(STALLS.filter((s) => s.treat).map((s) => s.treat.kind)).toEqual(['fishhead', 'sausageroll', 'cheddar', 'cream', 'crumbs']);
});
it('no stallholder can be reached: each keeper stands where no cat can', () => {
  for (const s of STALLS.filter((s) => s.keeper)) expect(isWalkableAt(a, s.keeper.x, s.keeper.z), s.id).toBe(false);
});
it('every treat can be reached from the cobbles', () => {
  // for each treat, some walkable point within 0.8 m (TREAT_REACH) of it, sampled on a 0.1 m grid
});
it('every watched stall has a hide a short dash from its treat', () => {
  // hide walkable at its centre; dist(hide, treat) - 0.8 <= 3.0; the straight line between them walkable at 0.1 m steps
});
it('the first treat is close: the café crumbs within 14 m of the spawn, on a walkable straight line', () => { /* … */ });
it('every stall is clear of the fountain and of each other by 2 m, and inside the bounds', () => { /* … */ });
it('one stall watches each treat: no treat spot lies in front of another stall', () => {
  // the spot's local z under every other stall is < d/2 or > d/2 + 3.2 (MARKET.WATCH_DEPTH, Task 8), or |lx| > w/2 + 1.0
});
it('has 12 POIs and 5 collectibles on free cobbles, 3 m from every collider', () => { /* … */ });
it('nothing offers it yet', () => expect(MARKET_REGISTRATION.catalog).toBeNull());
```

`a = marketArea()`. The treat-zone test uses literal 3.2 and 1.0 here; Task 9 replaces them with `MARKET.WATCH_DEPTH` and `MARKET.WATCH_SIDE`.

- [ ] **Step 2: Run** `npx vitest run test/marketplan.test.js`. Expected: FAIL (no module).
- [ ] **Step 3: Implement** `src/world/marketplan.js` from "The square" above, with a short header: an ASCII map, the local frame, M2 and why the keepers sit inside colliders.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `src/world/marketplan.js test/marketplan.test.js`, with the message "Market step 1: the plan of the square (six stalls, the café, the fountain), every keeper out of reach and every treat a short dash from a hide".

### Task 2: The parts kit and the one atlas

**Files:**
- Create: `src/world/marketparts.js`
- Test: `test/marketparts.test.js`

**Interfaces:**
- `createMarketAtlas() → { texture: THREE.DataTexture, size: 128, cells: 16 }`. A 4 × 4 grid of 32 px cells from fixed pixel tables:
  - cells 0–5: awning stripes (blue, red, yellow, green, pink, café brown), each two colours on cream;
  - cells 6–10: produce (apples, oranges, flowers, bread, cheese rind);
  - cells 11–15: the sign pictures (fish, loaf, wedge, churn, cup), on painted boards, no letters (M12).
  - The same pixels every call. No canvas.
- `atlasCell(i) → { u0, v0, u1, v1 }`.
- `marketMaterials() → { stall, awning, cobble, stone, metal, glass, lantern, cloth }`. One set per build. `awning` and `stall` use the atlas as `map`. `lantern` is emissive, `emissiveIntensity: 0` until dusk.
- `PARTS` (shared geometries, made once per build): unit box, stall post, counter, awning sheet (a gently sagging strip, UVs across one atlas cell), crate, basket, trestle, café table, café chair, lantern bulb, bunting pennant.
- For Task 11:
  - `buildTreatMesh(kind) → THREE.Group` (under 0.25 m, origin at its middle, `noCast`), for every treat kind;
  - `createBubbleTexture() → THREE.DataTexture` (32 × 32: a white rounded bubble with three dark dots, a dark outline);
  - `buildBroom() → THREE.Group` (handle 1.1 m and bristles, origin at the grip, `noCast`).

- [ ] **Step 1: Write the failing tests:**
  - `the atlas is the same twice and paints no canvas` (spy `document.createElement`);
  - `every awning sheet's UVs stay inside its own cell`;
  - `there is a treat mesh for every treat kind, small and casting nothing`;
  - `the bubble and the broom are made without a canvas or a random number`.
- [ ] **Step 2: Run** `npx vitest run test/marketparts.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `src/world/marketparts.js`. It draws no uuid outside `withLocalUuids`, since `build` calls it inside one.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `src/world/marketparts.js test/marketparts.test.js`, with the message "Market step 1: the stall kit, one awning-and-produce atlas, the treats, the bubble and the broom".

### Task 3: The square drawn, day and dusk, and its budget

**Files:**
- Create: `src/world/market.js`
- Modify: `test/budget.test.js` (one import and one row in each of `AREAS` and `MERGED_AREAS`)
- Test: `test/market.test.js`

**Interfaces:**
- `build(scene, { water, wind } = {}) → area record` with `fair.js`'s keys: `name`, `colliders`, `bounds`, `spawn`, `boxes`, `waters: []`, `waterFx: []`, `pois`, `collectibles`, `scenics`, `critterSpawns`, `moments: []`, `puddles`, `groundBounce`, `skyDusk`, `tippables`, `perches: []`. Plus:
  - `strays: false` (M10);
  - `treatMeshes: { [stallId]: THREE.Object3D }`, one display treat per treat stall and the café, at its `treat` spot (Task 11 hides and shows them);
  - `keepers: { [stallId]: { x, z, yaw } }` for the six stalls with one;
  - `anchors: { flourSacks, apples, bench, basket }` (`{ x, z, y }`, for step 3);
  - `life: (ctx) => createMarketLook(area, ctx)`.
- What it draws: the cobbles and flagstones; the fountain (basin, water disc, spire; it may reuse `src/world/parkfountain.js`'s stone and water, a shared chunk with the Park being fine under F6's check); the seven stalls from `PARTS` (posts, counter, back shelf, awning, sign, produce crates and baskets); the trestles; the café tables and chairs; four lamp posts; the stall lanterns; the bunting; the shop fronts round the edge (one merged mesh a side, atlas windows); a far band of town roofs (`noCast`, `builder.horizonBand`'s pattern).
- `critterSpawns`: two birds only (pigeons are step 3).
- `skyDusk: { top: 0x2a3358, horizon: 0xa86e62 }`. `groundBounce`: the cobble colour.
- `setMarketDusk(area, k) → void` (`k` 0..1): the lantern material's `emissiveIntensity` = `1.6 · k`; the "packing up" mesh (cloths over two displays, stacked crates) visible when `k > 0.5`, and the produce baskets mesh hidden then. The treats stay. Idempotent.
- `createMarketLook(area, { dusk }) → { update() {}, dispose() {} }`: calls `setMarketDusk(area, dusk ? 1 : 0)` once. It allocates nothing per frame.
- `test/budget.test.js`:
  - `AREAS`: `['market', buildMarket, 280, 210, 62000]`, with a comment giving the measured numbers and "the Farm's ceilings (spec, 2026-11-20)".
  - `MERGED_AREAS`: `['market', buildMarket, measured merged meshes + 12%, measured merged casters + 12%]`.
- `test/market.test.js` pins the exact built and merged counts and the build's `Math.random` draws, as `test/fair.test.js` does.

- [ ] **Step 1: Write the failing tests** (`test/market.test.js`)
  - `the record has every key an area has`;
  - `each stall is drawn at its plan spot, facing its way` (each `userData.stall` group's position within 0.05 of `at`, its yaw within 0.02 of `atan2(face.x, face.z)`);
  - `the colliders are the plan's` (`toEqual(MARKET_COLLIDERS)`);
  - `every treat is drawn at its spot and casts nothing`;
  - `dusk lights the lanterns and packs up, and the treats stay` (`setMarketDusk(area, 1)`: emissive > 0, packing visible, every `treatMeshes` entry visible; `setMarketDusk(area, 0)` puts it back);
  - `the look hook lights the lanterns on a dusk walk only`;
  - `the build is the same twice, inside withLocalUuids, drawing on Math.random N times` (N measured);
  - `the built counts are pinned, within the aim (180 / 110 / 45,000)`;
  - `nothing in the square fades` (no `userData.window` mesh; only the lamp posts are fade occluders).
- [ ] **Step 2: Run** `npx vitest run test/market.test.js test/budget.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `src/world/market.js`, every position read from `marketplan.js`. If the aim is missed, trim casters first (`noCast` on anything under 1.3 m), then triangles. The 280 / 210 / 62,000 ceiling never rises.
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/mergeprops.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `src/world/market.js test/market.test.js test/budget.test.js`, with the message "Market step 1: the square drawn (stalls, awnings, crates, fountain, bunting, café, shop fronts), lanterns and packing up at dusk, inside the Farm's ceilings".

### Task 4: Into the game behind `?market=1`, as its own download

**Files:**
- Create: `src/marketflag.js`, `test/marketgame.test.js`
- Modify: `src/world/areas.js`, `src/game/walk.js` (`beginWalkFromHomebase`), `src/main.js` (`readResume`'s `areaIds`), `src/progression.js` (`defaultState().walks`), `test/progression.test.js` (the three `walks` objects only)

**Interfaces:**
- `marketOn() → boolean` and `setMarket(value)`, exactly the `growOn` / `setGrow` pattern, reading `?market=1` at call time. `marketResumable(ids) → ids.filter((id) => id !== 'market' || marketOn())`.
- `areas.js`: `AREA_LOADERS.market = () => import('./market.js').then((world) => ({ id: 'market', world, life: {} }))`; `AREA_ENTRY_MODULES.market = ['src/world/market.js']`.
- `walk.js`, `beginWalkFromHomebase`, after the `roofsOn` and `houseOn` branches: `if (marketOn() && isClanEdition(progression.state) && !getPendingRoom()) { startWalkWhenReady({ duskMode, areaOverride: 'market' }); return; }`.
- `main.js`: `areaIds: marketResumable(<the existing expression>)`, plus the import.
- `progression.js`: `market: 0` last in `defaultState().walks`, and a clause in its comment ("And the Market Square (?market=1 only; not in CATALOG.areas until step 4): market: 0.").
- Nothing else in walk.js changes in step 1: the area builds through `pack.world.build`, its `strays: false` is read by rooftops-2's line, and its dusk look comes from `walk.js`'s `applyDusk` plus its own `life` hook.

- [ ] **Step 1: Write the failing tests** (`test/marketgame.test.js`; behaviour only, over F6's `headlessLifecycle`)
  - `nothing offers the Market: no catalog row, no map spot`: `Object.hasOwn(CATALOG.areas, 'market')` false; `STREET_PLACES.some((p) => p.areaId === 'market')` false; `nextThing(state, { catalog: CATALOG })` never names it.
  - `the flag starts a solo Market walk in Clan Edition`: `setMarket(true)`, `beginWalkFromHomebase({ duskMode: false })`, await it; `getSession().areaId === 'market'`.
  - `the flag starts nothing in Legacy, and never in a room`: with Legacy, the save's own place; with a pending room, the room path (no market session).
  - `without the flag Explore walks the save's own place`.
  - `a Market walk note is dropped without the flag` (`readResume(storage, { now, areaIds: marketResumable(Object.keys(state.walks)) })`: null without, kept with `setMarket(true)`).
  - `counts a Market walk` (`completeWalk('market')` → `walks.market === 1`; an old save loads with `walks.market === 0`).
  - `the Market is its own download`: `(await AREA_LOADERS.market()).world` is `await import('../src/world/market.js')`; `AREA_ENTRY_MODULES.market` contains `'src/world/market.js'`.
  - `a Market walk has no strays and no wanderer` (session: `strayCats.strays` empty, no wanderer).
  - Every test resets `setMarket(null)` in `afterEach`.
- [ ] **Step 2: Run** `npx vitest run test/marketgame.test.js test/progression.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the flag and the four wiring changes.
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/areas.test.js test/areaimport.test.js test/walkready.test.js test/walkresume.test.js test/rooms.test.js test/flattrace.test.js`. Expected: PASS. `git diff --exit-code test/fixtures/flat-trace.gameplay.json`.
- [ ] **Step 5: Commit** the seven files, with the message "Market step 1: in the game behind ?market=1 (solo, Clan Edition), its own download; nothing offers it until step 4".

### Task 5: Every per-area list

**Files:** the checklist is `git show --stat 5daf75a5` (the Fairground's registration), minus its catalog, golden-mouse, grass, `tutorialwords` and `nextthing` rows, and Rooftops step 2's Task 10 list. Concretely:
- `src/marks.js`: `MARK_AREAS` and `emptyMarks()`.
- `src/propsets.js`: `SETS.market` (copied from `MARKET_REGISTRATION.propSet`); no `YARN_SPOTS` row (step 3).
- `src/render/ambient.js`: `case 'market': return 'fluff'`.
- `src/render/clouds.js`: `CLOUD_AREAS` and `AREA_SKY.market = { clouds: 8, banks: 2 }`.
- `src/render/pawprints.js`: `AREA_RULES.market = { ground: null, path: 'cobble', strip: null }` (use the nearest existing path look if `cobble` is not one, and say which).
- `src/audio.js`: a `market` branch in `startAmbient`: the town hum and running water from the existing layers, no birdsong. Under the existing sound switch.
- Every test table those files' tests keep that lists areas by id (`marks`, `propsets`, `ambient`, `clouds`, `pawprints`, `audio`, `edges`, `sky`, `minimap`): grep each for `fair` and add a `market` entry with its own value.
- No `GRASS_STYLES`, `GROUND_TINTS`, `REST_LOOKS` or gold-mice row. Not in `COLONY_AREAS`.

**Interfaces:** `MARKET_REGISTRATION` (Task 1) holds each row in its table's shape:
- `propSet`: `carryables: []`, `knockables: []`, `markables: []`, `flaps: []`, `rests: []`, `hides: MARKET_HIDES` (critters flee to them too), `dogYard: null`, `keepSlots: []`. Step 3 fills the rest.
- `clouds`, `ambient`, `pawprints`: the values above.

- [ ] **Step 1: Write the failing tests** (`test/market.test.js`, the `test/fair.test.js` pattern)
  - `each registration row is in its table` (one `expect` per table);
  - `an old save loads with marks.market []`;
  - `not a colony area, no dog yard, no strays`.
- [ ] **Step 2: Run** `npx vitest run test/market.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the rows, and add `market` to each listed test table.
- [ ] **Step 4: Run** `npx vitest run test/market.test.js test/marks.test.js test/propsets.test.js test/ambient.test.js test/clouds.test.js test/pawprints.test.js test/audio.test.js test/edges.test.js test/sky.test.js test/minimap.test.js test/progression.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the exact files changed, with the message "Market step 1: in every per-area list (marks, props, ambient, clouds, pawprints, audio); no grass, no colony".

### Task 6: The test page, the pictures, the card picture, the worst spots, the full suite

**Files:**
- Create: `verify-market.html`, `public/places/market.jpg`
- Modify: `verify-places.html`, `src/world/marketplan.js` (`MARKET_SHOTS`, `MARKET_REGISTRATION.view`)
- Test: `test/market.test.js`

**Interfaces:**
- `MARKET_SHOTS` names: `spawn` (the spawn view over the café to the fountain), `fountain`, `fish`, `baker`, `cheese`, `milk` (each from 3 m in front of its counter at cat height), `cafe`, `overview` (high, from the south-west), `phone` (the spawn view, used at 390 × 844), `card` (from the café side, looking over the bunting to two stalls and the fountain).
- `verify-market.html` follows `verify-places.html`'s rig (sun, build, fill, shadow fit, caster sweep, `mergeStaticProps`), for the market only:
  - `?dusk=1` runs `applyDusk` and `setMarketDusk(area, 1)`;
  - `window.__ready = true` after the first render;
  - `window.__shot(name)` places the camera from `MARKET_SHOTS[name]` and answers `name`;
  - `window.__info()` returns `{ calls, triangles }` from `renderer.info.render` after a render.
- `verify-places.html`: `market` in its `AREAS` and `VIEWS.market = MARKET_REGISTRATION.view`; `&glow=1` runs `setMarketDusk(area, 1)` as it does `setFairGlow`.

- [ ] **Step 1: Write the failing test** `every shot is inside the square, above the ground and looks at it` (each `MARKET_SHOTS` entry parses to six finite numbers; the eye is inside the bounds or within 15 m of them, y between 0.3 and 30; the look point is inside the bounds). Run it: FAIL. Implement the shots. Run: PASS.
- [ ] **Step 2: The pictures.**
  - Start `npx vite --port 5178 --strictPort` in the background.
  - Day: `node scripts/record-page.mjs --url 'http://localhost:5178/verify-market.html' --out <scratchpad>/market-step1 --shots spawn,fountain,fish,baker,cheese,milk,cafe,overview,card --size 1280x720`.
  - Dusk: the same with `?dusk=1` and `--out <scratchpad>/market-step1-dusk`.
  - Phone: `--shots phone --size 390x844`, day and dusk.
  - Card: `verify-places.html?area=market`, saved as `public/places/market.jpg` (JPEG, about 30 KB, as `fair.jpg` is).
- [ ] **Step 3: The worst spots.** For each shot, and for the Farm at its own view, read `window.__info()`. Record a table of calls and triangles in the report. If the Market's worst is more than 20% above the Farm's worst, trim and re-shoot before going on. Stop vite.
- [ ] **Step 4: The full suite.** Check `uptime` against `sysctl -n hw.ncpu`, then `npx vitest run --dir test`. Expected: all green. A failure that passes alone twice is load flake: note it, never edit it away. `npm run build`: the start-up size is unchanged from Task 0 within 0.5 kB, and the Market's own download is printed under `AREA_GZIP_CEILING_KB`.
- [ ] **Step 5: Commit** `verify-market.html verify-places.html public/places/market.jpg src/world/marketplan.js test/market.test.js`, with the message "Market step 1: the test page, the card picture and the picture views".
- [ ] **Step 6: The report for the owner** (step 1 ends here): the pictures' paths (day, dusk, phone), the worst-spot table, the built and merged counts, the start-up and Market download sizes, and the owner questions.

---

## Step 2: the sneak

### Task 7: Treats are their own kind of thing in the mouth

**Files:**
- Modify: `src/carry.js` (`pick`, `drop`, `tickRain`, `walkEndMarks`), `src/game/interactions.js` (the drop prompt's condition; `tickCarryRain` is covered by `tickRain`)
- Test: `test/carry.test.js`, `test/interactions.test.js`

**Interfaces:**
- `pick(mouth, { id, kind, treat: true })` holds `{ id, kind, treat: true }`. It still refuses when the mouth is full (the caller sets down first, Task 13).
- `drop(mouth, x, z)` of a treat returns `{ id, kind, treat: true }` and records no `dropped` entry.
- `tickRain(mouth, dt, true)` never returns true for a treat, and its grip stays 0.
- `walkEndMarks` skips a held treat (no den keepsake).
- `eatHeld(mouth) → { id, kind } | null`: clears a held treat (and only a treat), for the munch.
- `interactions.js`: the drop prompt shows only when `!carry.mouth.held.treat`.

- [ ] **Step 1: Write the failing tests**

```js
it('a treat is never a keepsake, never slips and is never put down by hand', () => {
  const m = createMouth();
  expect(pick(m, { id: 'market-treat-fish', kind: 'fishhead', treat: true })).toBe(true);
  for (let i = 0; i < 100; i++) expect(tickRain(m, 0.1, true)).toBe(false);
  expect(walkEndMarks(m, 'market', 1)).toEqual([]);
  expect(eatHeld(m)).toEqual({ id: 'market-treat-fish', kind: 'fishhead' });
  expect(m.held).toBeNull();
});
it('eatHeld leaves anything that is not a treat alone', () => { /* sock held → eatHeld null, sock still held */ });
it('a treat set down leaves no drop mark', () => { /* drop → treat flag; walkEndMarks [] */ });
// test/interactions.test.js
it('no put-it-down prompt for a treat in the mouth', () => { /* stand-in session with mouth.held treat → prompt not 'drop' */ });
```

- [ ] **Step 2: Run** `npx vitest run test/carry.test.js test/interactions.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the flag in `carry.js` (a comment line beside `job` and `toy`) and the prompt condition.
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/carryables.test.js test/netevents.test.js test/flattrace.test.js`. Expected: PASS; flat trace unchanged.
- [ ] **Step 5: Commit** `src/carry.js src/game/interactions.js test/carry.test.js test/interactions.test.js`, with the message "Market step 2: a treat is its own kind of thing in the mouth (never kept, never slips, eaten not put down)".

### Task 8: The rhythm and the tell, pure

**Files:**
- Create: `src/marketrules.js`
- Test: `test/marketrules.test.js`

**Interfaces:**
- `MARKET` (frozen): `BUSY_S: 1.6, TURN_S: 0.4, STILL_SPEED: 0.3, STILL_S: 1.0, APPROACH: 0.15, COO_S: 4.0, SHOO_S: 1.2, SHOO_REST_S: 2.0, HOP_DIST: 1.2, HOP_S: 0.3, TREAT_REACH: 0.8, HOLD_S: 1.0, MUNCH_S: 0.8, REFILL_S: 25, HIGH_Y: 1.8, TEAM_GRACE_S: 1.5, SHOO_TOAST_GAP: 6, WATCH_DEPTH: 3.2, WATCH_SIDE: 1.0, STALK_SHARE: DOG_NOTICE_STALKED` (imported from `src/dogs.js`, the one idea borrowed from `dogNotices`).
- `STALL_TIMES` (frozen data, seconds): `fish { serve: 4.5, away: 4.2 }`, `baker { serve: 5.4, away: 3.6 }`, `cheese { serve: 3.8, away: 4.6 }`, `milk { serve: 6.0, away: 3.8 }`. The timings are data, so no two stalls move in lockstep whatever the seed.
- `periodOf(id) = serve + BUSY_S + TURN_S + away + TURN_S`.
- `MARKET_STALL_SALT = 0x3a7c51e9` (distinct from every salt in `walk.js`).
- `stallOffsets(seed) → { [id]: seconds }`: `rng = mulberry32(((seed >>> 0) ^ MARKET_STALL_SALT) >>> 0)`; exactly one draw per stall in `TREAT_STALLS` order, `offset = rng() · periodOf(id)`.
- `stallPhase(id, offset, clock, out = {}) → out { phase, k, watching, bubble, facing }`:
  - `u = ((clock + offset) mod P + P) mod P`;
  - `phase` is `'serve' | 'busy' | 'turn' | 'away' | 'back'`, in that order; `k` is 0..1 through the phase;
  - `watching` is true in `serve` and `busy` only (M3);
  - `bubble` is true in `busy`, `turn` and `away`;
  - `facing` is 0 facing front, 1 facing the back shelf, eased through `turn` and `back`.
  - No allocation when `out` is passed.

- [ ] **Step 1: Write the failing tests**

```js
it('two devices with the same seed and clock see the same stallholder at the same moment', () => {
  const a = stallOffsets(1234), b = stallOffsets(1234);
  for (let t = 0; t < 120; t += 0.1) for (const id of TREAT_STALLS) expect(stallPhase(id, a[id], 1e9 + t)).toEqual(stallPhase(id, b[id], 1e9 + t));
});
it('the seed only shifts each stall in its cycle', () => { /* stallOffsets(1) !== stallOffsets(2) for some id; each offset in [0, periodOf) */ });
it('the bubble shows a full BUSY_S before the turn, stays while turned away, and goes as they turn back', () => {
  // sweep one period at 0.01 s: every watching→not-watching change is preceded by >= 1.6 s of bubble while watching;
  // bubble false throughout 'back'
});
it('every watched stall turns away for at least 3.5 s each cycle, and no cycle is longer than 13 s', () => { /* … */ });
it('never in lockstep: no two stalls share a period', () => { /* periods pairwise differ by > 0.3 s */ });
it('draws one number a stall from its own stream and never touches Math.random', () => { /* spy */ });
```

- [ ] **Step 2: Run** `npx vitest run test/marketrules.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** `marketrules.js` imports only `src/rng.js` and `src/dogs.js` (both zero-THREE).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `src/marketrules.js test/marketrules.test.js`, with the message "Market step 2: each stall's rhythm from the time of day and the walk's seed, with the busy bubble before, during and not after the turn".

### Task 9: Noticing, pure

**Files:**
- Modify: `src/marketrules.js`, `test/marketplan.test.js` (its literal 3.2 and 1.0 become `MARKET.WATCH_DEPTH` and `MARKET.WATCH_SIDE`)
- Test: `test/marketrules.test.js`

**Interfaces:**
- A cat as the rules see it: `{ x, z, stalking: boolean, high: boolean }`.
- `inWatchZone(stall, x, z, stalking) → boolean`: in the stall's local frame, `|lx| ≤ w/2 + WATCH_SIDE` and `d/2 ≤ lz ≤ d/2 + depth`, where `depth = WATCH_DEPTH`, or `WATCH_DEPTH · STALK_SHARE` while stalking.
- `isHidden(hides, cat) → boolean`: `cat.high` (perched at or above `HIGH_Y`, on an awning), or within `r` of a hide's centre.
- `stallSees(stall, look, cat, hides) → boolean`: `look.watching && !look.cooing && inWatchZone(...) && !isHidden(hides, cat)`. `look.cooing` is set by the live stall (Task 12); the pure phase never sets it.

- [ ] **Step 1: Write the failing tests**
  - `a walking cat is seen anywhere in front of the counter, out to WATCH_DEPTH`;
  - `a crouched cat is seen only within half that`;
  - `a stallholder turned away, turning, or cooing at someone sees nobody`;
  - `under a trestle or up on an awning, nobody sees her`;
  - `beside or behind the stall, nobody sees her` (the zone is in front only);
  - `every treat spot is in its own stall's zone, walking and crouched` (so a treat always needs the rhythm or the coo).
- [ ] **Step 2: Run** `npx vitest run test/marketrules.test.js test/marketplan.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `src/marketrules.js test/marketrules.test.js test/marketplan.test.js`, with the message "Market step 2: noticing (a zone in front of the counter, half as deep for a crouched cat, nobody while turned away, nobody under a stall or on an awning)".

### Task 10: The words

**Files:**
- Modify: `src/clanphrases.js` (`LATER`, a new `// ---- the Market Square (2026-11-20): its own words, the same in every set ----` block)
- Create: `src/marketwords.js`
- Modify: `test/fixtures/series-words-*.json` (snapshot refresh only)
- Test: `test/marketplay.test.js` (create)

**Interfaces:**
- Phrase ids and text (the same in both word sets, M11; the owner may reword):
  - `'market.treat.fishhead'`: `'a fish head'`; `'market.treat.sausageroll'`: `'a sausage roll'`; `'market.treat.cheddar'`: `'a nibble of cheddar'`; `'market.treat.cream'`: `'a saucer of cream'`; `'market.treat.crumbs'`: `'some crumbs'`.
  - `'market.grab.fishhead'`: `'E — snaffle the fish head'`; `'market.grab.sausageroll'`: `'E — snaffle the sausage roll'`; `'market.grab.cheddar'`: `'E — snaffle the cheddar'`; `'market.grab.cream'`: `'E — lap up the cream'`; `'market.grab.crumbs'`: `'E — snaffle the crumbs'`.
  - `'market.eat.first'`: `(treat) => \`Yum! You snaffled ${treat}! 😋\`` (the award's line).
  - `'market.eat.again'`: `(treat) => \`Yum, ${treat} again! 😋\``.
  - `'market.shoo'`: `'Oi, you rascal! 🧹'`. `'market.laugh'`: `'Ha! You cheeky thing! 😄'`. `'market.coo'`: `'Aww, look at you! 💕'`.
  - `'market.team.eater'`: `(partner) => \`Teamwork! ${partner} kept them busy 🐾\``.
  - `'market.team.distracter'`: `(partner) => \`Teamwork! You kept them busy while ${partner} snaffled a treat 🐾\`` (the award's line).
  - `'market.summary.treats'`: `'treats'`.
- `src/marketwords.js` exports `TREAT_WORDS = { [kind]: { name, prompt } }` and `MARKET_LINES = { eatFirst, eatAgain, shoo, laugh, coo, teamEater, teamDistracter, summaryTreats }`, each a function calling `phrase('<id in full>')`, as `src/farmwords.js` does.

- [ ] **Step 1: Write the failing tests** (`test/marketplay.test.js`)
  - `every treat has its name and its prompt, and every prompt names its treat`;
  - `the market's lines say the same in both word sets and hold no series word` (`withStandInWords` for each set; `seriesFilter` finds nothing in any market line or in the area's collectible and scenic labels).
- [ ] **Step 2: Run** `npx vitest run test/marketplay.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the block and `marketwords.js`. Then `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords test/offwords.test.js`.
- [ ] **Step 4: Check** `git diff --stat test/fixtures/` and `git diff test/fixtures/`: every added line is a `market.` id, and none is removed. Then `npx vitest run test/serieswords test/offwords.test.js test/clanwords.test.js test/clanphrases.test.js test/marketplay.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `src/clanphrases.js src/marketwords.js test/marketplay.test.js` and the refreshed fixtures, with the message "Market step 2: its lines in the phrase table, the same in both word sets".

### Task 11: The stallholders behind their counters, and the tell

**Files:**
- Create: `src/marketnone.js`, `src/marketlive.js`, `test/helpers/marketrig.js`
- Modify: `src/world/areas.js` (`life: { createMarketLive }`, `AREA_ENTRY_MODULES.market` gains `'src/marketlive.js'`)
- Test: `test/marketlive.test.js`

**Interfaces:**
- `src/marketnone.js` (main graph, no imports):
  - `TREAT_ITEM_PREFIX = 'market-treat-'`; `treatItemId(stallId) → string`; `treatStallOf(itemId) → stallId | null` (only the five known ids; anything else, including `'__proto__'`, is null).
  - `NO_MARKET = Object.freeze({ stalls: [], treats: null, actionFor: () => null, act: () => false, update() {}, remotePick: () => false, restore() {}, dispose() {} })`.
- `src/marketlive.js`:

```js
// createMarketLive(scene, area, opts) → MarketLive
//   opts: { seed, now = () => Date.now() / 1000, reducedMotion = false, ground = FLAT_GROUND,
//           isFree = () => true, onEvent = () => {} }
// MarketLive: { stalls: StallLive[], treats: number, actionFor(s), act(action, s, ctx), update(dt, t, { cat, player, session }),
//               remotePick(remote, itemId), restore(log), dispose() }
// StallLive: { id, phase, watching, bubble, cooing: null | { who, t }, shooT, treatOut, refillT }
```

- This task builds the people, their turning and the tell. Task 12 adds everything a cat does.
  - One figure per stall with a keeper (`buildTwolegFigure({ x, z })` from `src/critters.js`, so the look comes from the spot, no roll), at `area.keepers[id]`, with its contact shadow and no other cast.
  - Each frame: `stallPhase(id, offset, now(), look)` for the treat stalls; the figure's yaw is the front yaw turned by `facing · π`. The two serve-only figures stay facing front and their arm does the villager's serving sway.
  - One bubble sprite per treat stall (`createBubbleTexture`, one shared material), 0.5 m wide, 0.45 m above the head, shown while `bubble`. With `reducedMotion` it does not bob.
  - A broom per treat stall, held by the figure's arm, hidden until a shoo.
  - `update` allocates nothing. `dispose` removes and frees everything it added.

- [ ] **Step 1: Write the failing tests** (`test/marketlive.test.js`, over `marketRig`)
  - `test/helpers/marketrig.js`: `marketRig({ seed = 7, clock = 1e9 } = {}) → { live, area, scene, cat, player, session, events, setClock(c), step(dt, n = 1), place(x, z), walk(dx, dz, speed), stall(id) }`. It stubs `document` (the headless stub above), builds `market.js`, a stand-in cat group, `player { speed, stalking, perchY: 0, inputActive }`, and `session { carry: { mouth: createMouth() }, remotes: { list: [] }, playerId: 'me', perched: null, net: { sendEvent: vi.fn() } }`.
  - `each stallholder stands behind its counter, where no cat can stand`;
  - `the stallholder turns to the back shelf when the rhythm says, and back again`;
  - `the bubble is up exactly when the rhythm says`;
  - `two rigs with one seed and one clock pose every stallholder alike`;
  - `the people are added after the build, cast no shadow but their own contact shadow, and go on dispose`;
  - `update reuses its own objects` (each stall's phase record and the figures' groups are the same objects after 600 frames);
  - `creating the stallholders draws nothing from Math.random`.
- [ ] **Step 2: Run** `npx vitest run test/marketlive.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `marketnone.js`, the people half of `marketlive.js`, the rig and the loader's `life`.
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/areas.test.js test/areaimport.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the five files, with the message "Market step 2: the stallholders behind their counters, turning to the back shelf in their own rhythm, the busy bubble over their heads".

### Task 12: Grab and munch, shoo and dash, the coo, the refill

**Files:**
- Modify: `src/marketlive.js`
- Test: `test/marketlive.test.js`

**Interfaces:**
- The cats it reads each frame: the local cat (`cat.position`, `player.speed`, `player.stalking`, `player.perchY`), and each `session.remotes.list` entry (`group.position`, `speed`, `pose === 'stalk'` as stalking, height above ground). Each cat has its own still timer and its distance to each treat last frame (for `APPROACH`). The local cat is checked first.
- Per treat stall, per frame (watching per `stallSees`, with `look.cooing = !!stall.cooing`):
  - **Coo** (M5): a seen cat still for `STILL_S`, not yet cooed this stop, starts `cooing = { who: 'me' | playerId, t: 0 }`. The figure turns to face her (at most 60° off front), the bubble is hidden, and `onEvent({ type: 'coo', stall, who })`. It ends after `COO_S`, when she leaves the zone, or when she moves (speed over `STILL_SPEED`). The rhythm runs on underneath, so after the coo the stall is back in step with the other device.
  - **Shoo:** a seen cat moving (speed over `STILL_SPEED`) whose distance to the treat falls by more than `APPROACH` m/s, while the stall's `shooT` and its `SHOO_REST_S` are over. The cooed cat walking at the treat counts too. `shooT = SHOO_S`: the broom waves over the counter. `onEvent({ type: 'shoo', stall, who, laugh })`, where `laugh` is true when that cat holds a treat (then no hop). For the local cat without a treat: the **hop** moves her `HOP_DIST` along the stall's `face`, over `HOP_S`, one `isFree`-checked step a frame, stopping at the first refused step. It adds to her own movement and never takes the stick. `session.landTime = 0.12` when it ends. A remote cat gets the broom only.
- **The treat** (per device): `treatOut` true at the start. `actionFor(s) → { kind: 'grab', stall, prompt } | null`:
  - the nearest treat out within `TREAT_REACH` of the cat;
  - on the ground: not perched, not swimming, `!s.carry.mouth.held?.treat`;
  - `prompt` is `TREAT_WORDS[kind].prompt()`.
- `act(action, s, { dropHeld }) → boolean`:
  - if the stall sees her now (M4), start the shoo (with the hop) and return false;
  - else, if the mouth holds something, `dropHeld()` first;
  - then `pick(mouth, { id: treatItemId(stall), kind, treat: true })`, `treatOut = false`, `refillT = REFILL_S`, the display mesh is hidden, and `onEvent({ type: 'grab', stall })`; return true.
- **Munch:** the treat mesh shows in her mouth (`placeInMouth` from `src/carryables.js`; none for the cream, M6) for `HOLD_S`. Then `s.sniffTime = MUNCH_S`. At `HOLD_S + MUNCH_S`, `eatHeld(mouth)`, `treats += 1`, and `onEvent({ type: 'eat', stall, kind, teamWith })`. `teamWith` is the remote `playerId` the stall was cooing at (or within `TEAM_GRACE_S` of it ending), else null.
- **Refill:** `refillT` counts down by `dt`; at 0 the treat is laid out again (this device only).
- `remotePick(remote, itemId) → boolean`: false unless `treatStallOf(itemId)` names a stall here and `remote` is in `session.remotes.list`. Then it shows that treat in her mouth on a `HOLD_S + MUNCH_S` timer (never touching `treatOut`). It emits `onEvent({ type: 'remote-eat', stall, who })`, and `onEvent({ type: 'team', stall, partner: remote.playerId })` when that stall is cooing at `'me'` (or did, within `TEAM_GRACE_S`).
- The café's crumbs are never watched and have no figure.

- [ ] **Step 1: Write the failing tests** (`test/marketlive.test.js`)
  - `a treat is taken while the stallholder is turned away, in the mouth, then eaten within two seconds`;
  - `the action button while watched is a shoo and a hop back, and the treat stays out`;
  - `a cat walking toward the treat while watched is shooed; one walking across the front is not`;
  - `a crouched cat is shooed only within half the distance`;
  - `a still cat is cooed at, never shooed, and the stallholder faces her for COO_S`;
  - `one coo per stop`;
  - `while one cat is cooed at, the stall notices no other cat`;
  - `the cooed cat who walks at the treat is shooed; one who walks off is not`;
  - `a cat with a treat in her mouth is laughed at, keeps it, and is not hopped`;
  - `the hop goes away from the counter, stops at anything solid, and never takes the stick` (with a refusing `isFree` 0.5 m behind her she moves under 0.5 m; the stick's own movement during the hop is kept);
  - `the broom stays over the counter and never reaches the cat` (the broom's world tip stays inside the stall's footprint plus 0.3 m in front, over a whole shoo);
  - `under a trestle or on an awning she is never shooed`;
  - `a snaffled treat is laid out again after REFILL_S, on this device only`;
  - `the café crumbs are never watched, and the first treat comes well inside a minute` (walk at 2 m/s from the spawn straight to the crumbs: grab before 15 s of walk time);
  - `a cat waiting at a stall's hide gets a safe window to its treat within one cycle` (for each treat stall and 20 seeds);
  - `the partner's treat pick shows a munch on her and leaves my treats and my mouth alone`;
  - `teamwork: a pick from the stall cooing at me is my teamwork, and only from that stall`;
  - `the life draws no Math.random and nothing but its seed`.
- [ ] **Step 2: Run** `npx vitest run test/marketlive.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the sneak half of `marketlive.js`.
- [ ] **Step 4: Run** `npx vitest run test/marketlive.test.js test/marketrules.test.js test/carry.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `src/marketlive.js test/marketlive.test.js test/helpers/marketrig.js`, with the message "Market step 2: grab and munch, a playful shoo and a short hop back, the coo for a still cat (the distraction), refills on each device".

### Task 13: In the walk: the prompt, the pay, the tally and teamwork

**Files:**
- Create: `src/game/marketplay.js`
- Modify:
  - `src/game/walk.js` (the market's life, beside the Fair's; `restoreMarket` on a resume; `session.market?.dispose()` in `endWalk`; the summary tile);
  - `src/game/session.js` (`['market', "the Market Square's stallholders and treats (marketlive.js), or NO_MARKET"]`);
  - `src/main.js` (`session.market.update(dt, t, { cat: session.cat, player, session })` right after `session.fair.update`);
  - `src/game/interactions.js` (the treat prompt after the Fair's block; the `'market'` branch in `handleInteract`);
  - `src/game/netevents.js` (`applyRemoteCarry`);
  - `src/discoveries.js` (`treat: 6`, `teamtreat: 6`, with a comment);
  - `src/ui/hud.js` (`discoveryText`: `treat` and `teamtreat` say their own line);
  - `src/ui/screencards.js` (`summaryStatsHtml`'s optional `treats`).
- Test: `test/marketplay.test.js`, `test/hud.test.js`, `test/netevents.test.js`

**Interfaces:**
- `walk.js`:
  - `const market = areaId !== 'market' ? NO_MARKET : pack.life.createMarketLive(scene, areaData, { seed: roomSeed ?? soloSeed, reducedMotion, ground, isFree: (x, z) => isWalkableAt(areaData, x, z), onEvent: (e) => handleMarketEvent(e, { hud, audio, log, session, once: marketOnce, nameOf }) })`;
  - `nameOf = (id) => safeRemoteName(session.remotes.list.find((r) => r.playerId === id)?.petName, 'Your partner')`;
  - after a resume's `log.restore`, `restoreMarket(market, log)`;
  - the summary passes `treats: session.market.treats ?? undefined`.
  - `NO_MARKET` comes from `../marketnone.js`. `walk.js` imports nothing from `marketlive.js`.
- `handleMarketEvent(e, { hud, audio, log, session, once, nameOf })`:
  - `'grab'`: nothing to pay.
  - `'eat'`: `log.awardOnce('treat', \`market-treat-${e.stall}\`, MARKET_LINES.eatFirst(TREAT_WORDS[e.kind].name()))`. If it paid 0, `hud.toast(MARKET_LINES.eatAgain(...))`. `audio.trill(0.8)`. With `e.teamWith`: `hud.toast(MARKET_LINES.teamEater(nameOf(e.teamWith)))`.
  - `'team'`: `log.awardOnce('teamtreat', \`market-team-${e.stall}\`, MARKET_LINES.teamDistracter(nameOf(e.partner)))`.
  - `'shoo'` with `who === 'me'`: the shoo or laugh line, at most once every `SHOO_TOAST_GAP` seconds; `audio.landThump()` when hopped. With a remote `who`: nothing.
  - `'coo'` with `who === 'me'`: `once('market-coo', MARKET_LINES.coo())`.
  - `'remote-eat'`: nothing.
- `restoreMarket(market, log)`: `market.restore(log)` sets `treats` to the number of `market-treat-` keys in `log.entries()`.
- `interactions.js`:
  - the prompt: `if (!s.prompt && s.market) { const action = s.market.actionFor(s); if (action) { s.prompt = { kind: 'market', data: action }; setPrompt(action.prompt); } }`, placed right after the Fair's block;
  - `handleInteract`: `'market'` → `if (s.market.act(s.prompt.data, s, { dropHeld: () => putDownCarried(s, { kick: false }) }) && s.net) s.net.sendEvent({ v: 1, id: s.playerId, type: 'carry-pick', itemId: treatItemId(s.prompt.data.stall) });`.
- `netevents.js` `applyRemoteCarry`: after the remote is found and before the carryables lookup, `if (ev.type === 'carry-pick' && s.market?.remotePick(remote, ev.itemId)) return;`.
- `summaryStatsHtml({ …, treats })`: when `Number.isInteger(treats)`, one more tile `tile('😋', treats, MARKET_LINES.summaryTreats())` after the cats-greeted tile. Without `treats`, the output is byte for byte today's.

- [ ] **Step 1: Write the failing tests**
  - `test/marketplay.test.js`:
    - `eating pays a treat once per stall per walk, and the tally counts every treat`;
    - `teamwork: the eater and the distracter are both paid, each on her own device` (two `marketRig`s with one seed and clock; Ana stands still in front of the baker on rig A, rig B sees her as a remote; Ben grabs the sausage roll on rig B; B's `carry-pick` is handed to A's `remotePick`; each `handleMarketEvent` with its own discovery log; A paid `AWARDS.teamtreat`, B paid `AWARDS.treat` and shown the eater line);
    - `teamwork pays once per stall per walk`;
    - `a resumed walk keeps its paid treats and their count`;
    - `the shoo line shows at most once every SHOO_TOAST_GAP seconds`;
    - `a full mouth sets down what it holds and takes the treat` (yarn and sock: the existing `putDownCarried` path, its `carry-drop` sent for the sock, none for the yarn);
    - `no treat prompt perched, swimming or munching`;
    - `a Market walk sends carry-pick with the treat's id, and nothing new` (the only events sent across a sneak are `carry-pick` with `itemId` `market-treat-<stall>`, plus `carry-drop` for a set-down sock);
    - `a non-Market walk has NO_MARKET: no prompt, no tally tile`;
    - `the summary shows the treats tile on a Market walk only, and is unchanged elsewhere` (`summaryStatsHtml(args)` `toBe` today's string; with `treats: 3` it contains `3` and `treats`).
  - `test/netevents.test.js`:
    - `a treat pick on a walk without the Market changes nothing` (`s.market = NO_MARKET`, and `s.market` undefined: no item held, nothing throws);
    - `a treat pick goes to the Market before the carryables` (a stand-in carryable given the id `market-treat-fish` stays on the ground, and `remotePick` was called once).
  - `test/hud.test.js`: `a treat and teamwork say their own line`.
- [ ] **Step 2: Run** `npx vitest run test/marketplay.test.js test/netevents.test.js test/hud.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/interactions.test.js test/discoveries.test.js test/progression.test.js test/session.test.js test/walkresume.test.js test/walkready.test.js test/screens.test.js test/flattrace.test.js`. Expected: PASS. `git diff --exit-code test/fixtures/flat-trace.gameplay.json`.
- [ ] **Step 5: Commit** the files above, with the message "Market step 2: in the walk (treat prompt, pay once per stall, a treats tally on the summary, teamwork pay on each child's own device) over the existing carry-pick, no new message".

### Task 14: The film, the phone check, the worst spots, the full suite

**Files:**
- Modify: `verify-market.html`, `src/world/marketplan.js` (`MARKET_TOURS`)
- Test: `test/marketlive.test.js`

**Interfaces:**
- `MARKET_TOURS` (data, the `YARD_TOURS` shape, plus a scripted partner for `team`):
  - `sneak`: from the spawn, the café crumbs; then to the fishmonger's hide, wait for the bubble, crouch in, snaffle, munch; then at the baker, walk straight in while watched, shoo, hop, dash under the trestle, wait, snaffle.
  - `team`: a partner cat stops in front of the cheese stall and is cooed at, while the cat sneaks round and snaffles the cheddar; both teamwork lines show in the caption.
- `verify-market.html?live=1&drive=1`: `createMarketLive` on the built square with `now` driven by the page's fixed step from a fixed start clock, a real cat model (`buildCat`) posed with `animateCat`, the partner as a second cat in `session.remotes.list`, and the walk's `handleMarketEvent` toasts drawn as captions. `__tour(name)` starts a tour and answers its name; `__frame() → { done, caption }` runs one 1/30 s step and a render.

- [ ] **Step 1: Write the failing test** `both tours finish and pay what the film shows`: drive each tour headless through `marketRig` with the same pilot. `sneak` ends with 3 treats and a shoo; `team` pays one `treat` on one side and one `teamtreat` on the other. Run: FAIL. Implement `MARKET_TOURS`. Run: PASS.
- [ ] **Step 2: The film.** With `npx vite --port 5178 --strictPort` in the background:
  - `node scripts/record-page.mjs --url 'http://localhost:5178/verify-market.html?live=1&drive=1' --out <scratchpad>/market-step2 --tour sneak --size 960x540`;
  - the same with `--tour team`;
  - shots at `--size 390x844` of the fishmonger serving, busy (bubble up) and turned away, from the `phone` view, to check the bubble reads at phone size.
- [ ] **Step 3: The worst spots,** live: `__info()` at the four treat stalls with the people on. Record calls and triangles beside step 1's table. If a spot is more than 20% above the Farm's worst, trim (the people's shadows first) before going on. Stop vite.
- [ ] **Step 4: The full suite.** Load check, then `npx vitest run --dir test`. Expected: all green (flake rule as Task 6). `git diff --exit-code test/fixtures/flat-trace.gameplay.json`. `npm run build`: start-up within 2 kB of Task 0 (only `marketnone.js`, `marketplay.js`, `marketwords.js` and the phrases join it), the Market's download printed under its ceiling.
- [ ] **Step 5: Commit** `verify-market.html src/world/marketplan.js test/marketlive.test.js`, with the message "Market step 2: the sneak and teamwork tours for the owner's film, and the phone-size bubble check".
- [ ] **Step 6: The report for the owner:** the films' and pictures' paths, the worst-spot table, the start-up and Market download sizes, the four owner questions, and what waits for steps 3 and 4.

---

## Steps 3 and 4 (outline only; each gets its own plan)

- **Step 3, the rest:** golden mice (three, `goldmice.js`, one on an awning); discoveries (the fountain, pigeons she can scatter, a nap on the baker's warm flour sacks at `anchors.flourSacks`, a street musician, a ride in a parked bicycle basket at `anchors.basket`), with a find and a journal page each, the Farm's pattern; the yarn ball's `YARN_SPOTS.market`; climbing routes (crate → awning perches at `HIGH_Y` or above, so the awning-top rule of Task 9 comes alive); the fruit that rolls from its crate (a tippable); the propSet's carryables, knockables, markables and rests; four found-outfit spots (names from the owner and his daughter); the market sounds (chatter, a bicycle bell, pigeons).
- **Step 4, into the game:** `CATALOG.areas.market` (proposal: 150 🐾 after 2 town explores, through `areaOffer`), `MARKET_REGISTRATION.catalog` copied in; `STREET_PLACES` spot in `src/worldmap.js`; the town gateway after world-map step 3; the tour hint ("Wait till they turn around…") in the queued tour-hints work; `PLACE_WORDS.market` and any stallholder word ("Twolegs" in the clan words) in both word sets; the flag retired.

---

## Self-review (done while writing)

- **Spec coverage:**
  - The square, its stalls and treats, the fountain, bunting, crates: Tasks 1–3. Day and dusk ("lanterns glow, and the treats are still there"): Task 3. Budget at the Farm's ceilings: Task 3. Card picture and test page: Task 6. Flag only, no catalog, map or unlock: M1, Task 4. Own lazy chunk: Task 4, checked by F6's build check in Tasks 6 and 14.
  - Stallholders behind counters, villager figure: Task 11. The rhythm with its own timing per stall and the refill wait: Tasks 8 and 12. The tell before, during and gone on the turn back: Tasks 8 and 11. Noticing (front zone, half for crouched, none turned away, safe under a stall and on an awning): Task 9. The grab with the action button, in the mouth, munched within a couple of seconds: Tasks 7 and 12. A full mouth drops and takes the treat: Task 13. Spotted: the line, the broom, the short hop, control kept, the treat stays out, a laugh if she has it: Task 12. Pay through the awards, a tally where the walk's counts show, once per walk: Task 13.
  - Two children: same turns from the time of day and the seed's own stream (Task 8); the distraction by stopping, never shooed when still, solo too (Task 12, M5); own treats per device, partner seen munching (M7, Task 12); teamwork pays both (M8, Task 13); no new network message (M7). The film: Task 14.
  - Text in both word sets: Task 10. Offline-first and determinism: Global Constraints, checked each task.
  - Left out on purpose: everything in "Steps 3 and 4".
- **Type consistency:** `TREAT_STALLS`, `STALLS`, `stallById`, `toStall`/`fromStall` (Task 1) are used by Tasks 8, 9, 11 and 12. `MARKET` and `stallPhase(id, offset, clock, out)` (Task 8) by Tasks 11 and 12. `stallSees(stall, look, cat, hides)` with `look.cooing` (Task 9) by Task 12. `treatItemId` and `treatStallOf` (Task 11) by Tasks 12 and 13. `eatHeld` (Task 7) by Task 12. `TREAT_WORDS` and `MARKET_LINES` (Task 10) by Tasks 12 and 13. `marketRig` (Task 11) by Tasks 12–14. `setMarketDusk` (Task 3) by Task 6.
- **Proportion:** the code blocks are tests and signatures. The layout table and the constants are the decisions; the stall drawing, the hop's look and the broom's look are the builder's, as the spec's "Left to the builder" says.
- **Merge-order risk:** F6, the house and map-gateways all rewrite the series-words fixtures. After merging `main`, re-run Task 10's refresh rather than hand-merging JSON.

## Owner's answers (2026-11-20)

- **Names:** fishmonger, baker, cheese stall, milk cart and café stay for now (he and his daughter may rename them from the pictures), but the button word is **"grab"**, not "snaffle" ("E — grab the fish head").
- **Pay:** 6 🐾 a treat and 6 🐾 for teamwork, as in M9.
