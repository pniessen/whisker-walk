# Four More Market Square Stalls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Market Square gains the Butcher, Toy and yarn, Plant stall and Bric-a-brac stalls, each with its own treat, climb and knock-over, and a hop-to-reach sausage string that a cat on the cobbles cannot take flat-footed.

**Architecture:** `drawStall` in `src/world/market.js` becomes the one parametrised builder, driven by extended `RAW`, `STALL_LOOK`, `STALL_TIMES`, `CLIMB_LZ` and `ROOF_LABELS` tables plus a per-stall `props` list. Each stall appends to `TREAT_STALLS`, so `marketlive.js` already guards, times, shoos and pays it. The hop is about 15 lines in `marketlive.js` reading `session.pounceTime`; the rolling wool generalises `marketfruit.js`'s apples.

**Tech Stack:** vanilla JS, three.js, vite, vitest (fake-scene style as in `test/marketlive.test.js`).

**Spec:** `docs/superpowers/specs/2026-11-22-market-stalls-design.md`

## Global Constraints

- Work in worktree `.worktrees/market-stalls` (branch `market-stalls`); commit there only. Never touch the main checkout or `.claude/worktrees/house`. The owner approves merge and push; do neither.
- Budgets (never raise a ceiling): Market built at most 280 meshes, 210 casters, 62,000 triangles (`test/budget.test.js`, `test/market.test.js`). Measured at start: 111 meshes, 27 casters, 39,495 triangles built; 108 / 24 merged. Target 2,000-2,500 triangles and 2-4 merged meshes per stall, 8,000-10,000 triangles and 8-16 meshes for all four. Market chunk under 100 kB (64.8 kB now).
- Start-up gzip 697.1 of 720 kB: the 720 ceiling is never raised. No new code in `src/knockables.js` or `src/tippables.js`. A new knockable kind or a new sound means stop and ask.
- Pay is 6 paws plus 6 teamwork per treat, item id `market-treat-<stall>`, the existing `carry-pick` event. No new net message types.
- Words: every line goes through `phrase()` ids in `LATER` (`src/clanphrases.js`), read by `src/marketwords.js` or `ROOF_LABELS`; both word sets read them (the off set overrides no market line). No series word in any line.
- No `Math.random`: `hash01` or seeded streams only. Stall cycles come from `stallOffsets(seed)`; the old four offsets must not change (append to `TREAT_STALLS`). Determinism traces (`flat-trace.gameplay.json` and the others) must not move; if one moves, stop.
- Do not edit `src/game/walk.js`, `src/world/areas.js`, `src/player.js`, `src/game/interactions.js`. Read them only. No database work.
- Every action is the existing grab, hop (pounce), paw or climb button; no key-only action.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Full suite: `WW_PGLITE=/Users/pniessen/.npm/_npx/90d26507e643fcc0/node_modules/@electric-sql/pglite/dist/index.js npx vitest run`, judged by the failed count (never 18:30-19:30 local; the 7 pm refresh runs then). Real-game checks run muted.
- After the owner merges: regenerate the series snapshots with `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`, then revert any spurious `notReached` entries in `test/fixtures/series-words-*.json`.

## Review Focus

1. **The hop grab reachable from the ground or through the counter** (Task 5): flat-footed within 0.1 m gets no prompt; a hop from behind the counter, from the keeper side or from a lower perch never lands.
2. **A shoo during the pounce window** (Task 5): the watching keeper shoos and the string stays, once per pounce, never once per frame and never "taken without the shoo".
3. **A knock-over that never settles** (Tasks 3, 4, 5): every pot, cup and bucket row has a curated `fallTo` on free cobbles, off every lane and zone, not under another prop, equal on both screens.
4. **The 123-mesh `budget.test.js` pin** (Task 6): re-measured on purpose, as its comments say it was before; the 280 / 210 / 62,000 ceilings untouched; the treat meshes (`noMerge`) counted.
5. **Stall spots blocking lamp lanes, hides, stray routes or the spawn walk** (Tasks 1, 3, 4, 5, 6): each spot pinned by the plan test's lane, zone, hide-dash, clutter and spawn-lane checks; a failing spot moves along the nearest free edge and is reported.

---

## Rulings where the spec and the code disagree (spec is the authority)

- Spec Words lists a fourth kind `milksaucer`; Decision 1 (sardine tin) wins: the kind is `sardines`.
- The phrase table, `marketnone.js` ids and `propsets.js` rows are start-up files, so "start-up must not move" cannot be exactly zero. Ruling: add the minimum (terse lines, 7 knockable rows, 4 ids), record the delta in Task 7, and stop if start-up passes 698.0 kB.
- `session.pounceTime` counts down from 0.3: the hop window is elapsed 0.07-0.23 s, i.e. `pounceTime` 0.23 down to 0.07.
- The climb stack stands on the side away from the hide, about 1 m from the treat, beyond `TREAT_REACH` (0.8). The Butcher's rail perch therefore gets its own stack beside the string (Task 5 step 1), pinned by test.
- Knockables are only offered to a perched cat, so every pot, cup and the bucket needs a perch at its own height one hop up (the existing test at `marketplan.test.js` "each knockable is knocked from a perch").
- No "louder clatter" sound exists in existing code. Crockery is `cup` rows; the louder clatter is parked as an owner decision (see Task 4).

## File structure

- Modify `src/world/marketplan.js`: `RAW`, `TREAT_STALLS`, `CLIMB_LZ`, `ROOF_LABELS`, perches, `PROP_ROWS`, colliders, the `hang`/`hy` treat field, the rail perch.
- Modify `src/world/market.js`: `STALL_LOOK`, `drawStall` goods and props, treat meshes.
- Modify `src/world/marketparts.js`: atlas cells 18-29, `TREAT_KINDS`, `buildTreatMesh`.
- Modify `src/world/marketfruit.js`, `src/world/marketlife.js`: rolling set generalised (wool).
- Modify `src/marketrules.js`, `src/marketlive.js`, `src/marketwords.js`, `src/marketnone.js`, `src/clanphrases.js`, `src/propsets.js`.
- Tests: `test/marketplan.test.js`, `marketrules`, `marketlive`, `marketgame`, `marketcowalk`, `marketparts`, `marketfruit`, `market`, `budget`, `test/marketstalls.test.js` (new), `test/marketlive-hop.test.js` (new), fixtures `market-atlas-cells.json`, `series-words-*.json`.

### Task 0: Start-check

**Files:** none.

- [ ] **Step 1:** In `.worktrees/market-stalls` run `git status -sb`, `git fetch`, `git log --oneline HEAD..origin/main`. If main moved, `git merge origin/main`; resolve nothing by guessing, stop on conflicts.
- [ ] **Step 2:** Run the full suite (command above). Record the passed and failed counts. Do not continue past a non-zero failed count that is not already known.
- [ ] **Step 3:** Run `npm run build`. Record the start-up gzip (expect 697.1 kB) and the Market chunk size (expect 64.8 kB). Keep all numbers for the Task 7 comparison (in your report; no new file).

### Task 1: Parametrised builder and the Toy and yarn stall

**Files:** Modify `marketplan.js`, `market.js`, `marketparts.js`, `marketrules.js`, `marketwords.js`, `marketnone.js`, `clanphrases.js`; Test `test/marketstalls.test.js`, `marketplan`, `marketrules`, `marketparts`; fixture `market-atlas-cells.json`.

**Interfaces:**
- Consumes: `drawStall(s, kit)`, `STALL_LOOK`, `makeStall(raw)`, `stallOffsets`, `phrase`.
- Produces: `RAW` row `{ id: 'toys', kind: 'treat', at: [-16, -3], w, d, treat: ['wool', y], hide: true, keeper: true }`; `TREAT_STALLS` appended with `'toys'`; `STALL_TIMES.toys = { serve: 4.0, away: 3.4 }` (periods of the four new stalls: butcher 12.8, toys 9.8, plants 13.2, bric 9.4, each more than 0.3 from every other); `STALL_LOOK.toys = { awning, sign, paint, goods: 'toys', props }` (atlas cells from 18 up; cells 0-17 untouched); `TREAT_KINDS` gains `'wool'`; `TREAT_WORDS.wool`; `phrase` ids `market.treat.wool`, `market.grab.wool`, `market.perch.toys`; `treatStallOf('market-treat-toys') === 'toys'`; `buildTreatMesh('wool')`.

- [ ] **Step 1: Tests (all fail first).** `marketplan`: assert per stall (a loop over the new ids, so later tasks add only their id): `toys` is in `TREAT_STALLS` after the old four; `TREAT_STALLS.slice(0, 4)` equals the old four; `MARKET_KEEPOUT.capsules` length is `2 * TREAT_STALLS.length`; the toys treat spot is reachable from walkable cobbles within `TREAT_REACH`; its watch zone overlaps no other stall's zone (loop over `TREAT_STALLS`); `CLIMB_LZ.toys` yields a finite crates stack and roof perch; the stall stays out of the spawn lane (x -1.5..1.5, z 12..23) and the 2.5 m lane rule. `marketrules`: `stallOffsets(7)` old four values equal their recorded literals; every pair of `periodOf` differs by more than 0.3. `marketparts`: atlas cell sums for 0-15 equal the fixture; new cells 18+ are not cream; `buildTreatMesh('wool')` is a named group with `noCast`. `marketstalls`: for `phrase` ids named above, both word sets (`on`, `off`) return a non-empty string with no `{`; `treatStallOf` knows `toys`, still null for `__proto__`.
- [ ] **Step 2:** Run `npx vitest run test/marketstalls.test.js test/marketplan.test.js test/marketrules.test.js test/marketparts.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement the tables and the builder's `goods: 'toys'` branch (a shelf of boxed toys and a row of wool balls on the counter, merged by the kit's buckets). Add the phrase lines to `LATER` in `clanphrases.js`, the kind to `TREAT_WORDS`, the id to `TREAT_STALL_IDS` in `marketnone.js`, the plan row and `CLIMB_LZ`/`ROOF_LABELS` entries. The toy crates stack is the plain `crates` variant. Place at (-16, -3); if the plan test objects, move along the nearest free edge (west barrow `barrow-w` at (-16.5, -8) is close) and record the move.
- [ ] **Step 4:** Run the same tests, then `test/marketlive.test.js test/marketgame.test.js test/marketcowalk.test.js test/market.test.js` (their stall lists now include `toys`). Update their loops over `TREAT_STALLS`, the stall-count test (seven stalls, four watched, now eight, five) and the keep-out capsule count; keep every other assertion. Expected: PASS except `market.test.js` measured numbers.
- [ ] **Step 5:** Run `npx vitest run test/market.test.js`, read the new built numbers, write them into `MEASURED_BUILT` and `MEASURED_MERGED` with a dated comment (a measured update, not a ceiling change). Record triangles added; it must be 2,000-2,500.
- [ ] **Step 6:** Commit `feat: the toy and yarn stall, builder and its words`.

### Task 2: Rolling wool and the pull-along toy

**Files:** Modify `marketfruit.js`, `marketlife.js`, `market.js` (record `tippables`), `marketplan.js` (anchors); Test `test/marketfruit.test.js`.

**Interfaces:**
- Consumes: `applePaths(area, crateAt, mouthYaw)`, `createApples(scene, paths, {reducedMotion})`, `APPLES`.
- Produces: `rollPaths(area, crateAt, mouthYaw, spec: {n, r, roll: {min, max}, time, spread, salt})`, `createRollers(scene, paths, {reducedMotion, color})`; `applePaths`/`createApples` become calls to them with `APPLES` and give byte-identical paths; `WOOL = Object.freeze({ n, r, roll, time, spread, salt })`; two appended tippable rows (the yarn basket, the pull-along toy) after the apple crate, so existing `tip-<i>` ids do not move.

- [ ] **Step 1: Tests.** `applePaths` output for a fixed crate equals its recorded output from before the change (recorded by running the old code before any change, in this step); `rollPaths` with `WOOL` yields `n` paths, each point walkable, none inside any treat stall's watch zone or on a hide-to-treat line; same inputs give the same paths twice (both screens); `createRollers` under `reducedMotion` places each ball at its end at once; the tippable rows list ends with the two new kinds and the apple crate is still index 0.
- [ ] **Step 2:** Run `npx vitest run test/marketfruit.test.js`. Expected: FAIL.
- [ ] **Step 3:** Refactor, add the wool paths and the toy's `build` hooks, wire `marketlife.js` the way the apples are wired (`createRollers` when the basket's tippable is tipped). Salts distinct from `MARKET_APPLE_SALT` and `MARKET_PETAL_SALT`.
- [ ] **Step 4:** Run the file, then `test/marketlife.test.js test/market.test.js`. Expected: PASS (update the measured numbers if they moved).
- [ ] **Step 5:** Commit `feat: rolling wool and a pull-along toy to tip`.

### Task 3: Plant stall (catnip, tiered shelves, three clay pots)

**Files:** Modify `marketplan.js`, `market.js`, `marketparts.js`, `propsets.js`, `clanphrases.js`, `marketwords.js`, `marketnone.js`, `marketrules.js`; Test `test/marketstalls.test.js`, `marketplan`, `market`.

**Interfaces:**
- Consumes: Task 1's builder and tables.
- Produces: `RAW` row `plants` at (15, 6.5), treat `['catnip', y]` on a shelf-end spot within `TREAT_REACH` of the cobbles; `STALL_TIMES.plants = { serve: 6.4, away: 4.4 }`; `stallClimb('plants') -> { stack, crate, roof, tiers: [perch, perch] }` (two tier perches, kind `crate`, `MARKET_PERCHES` includes them); `PROP_ROWS.knockables` gains `market-pot-1..3` (kind `flowerpot`, curated `fallTo`) and `SETS.market.knockables` in `src/propsets.js` equals it (`test/market.test.js` holds the two equal); `TREAT_KINDS` gains `'catnip'`; phrase ids `market.treat.catnip`, `market.grab.catnip`, `market.perch.plants`.

- [ ] **Step 1: Tests.** `marketplan`: the treat is grabbable from walkable cobbles within 0.8 sideways; each tier perch is one hop from the cobbles or the stack with `BASE_CLIMB_BUDGET` (`canReach`); the three pots sit on the tiers at their perch height, each knocked from a perch beside it at its own height; each `fallTo` is free cobbles, outside every watch zone, lane and hide line, at least 0.3 m from every other pot's `fallTo` and from every treat (no chain); the plan's clutter test still passes with this stall. `marketstalls`: knocking pot 1 through `createKnockables` leaves pots 2 and 3 standing, and after the animation pot 1 rests exactly at `fallTo` (a set rest pose); a remote knock by id (second screen) ends in the same pose. Words in both sets; `market.perch.plants` is the lookout's label.
- [ ] **Step 2:** Run the three files. Expected: FAIL.
- [ ] **Step 3:** Implement; shelf tiers and pots drawn by the builder's `props` list (tier boards as `box`es; pots are the knockables' own meshes, so the shelf shows them from `PROP_ROWS`, not the merge). Edit `propsets.js` with the three rows, nothing else there.
- [ ] **Step 4:** Run the files plus `test/marketlive.test.js test/marketgame.test.js test/marketcowalk.test.js test/market.test.js` and update measured numbers. Expected: PASS.
- [ ] **Step 5:** Commit `feat: the plant stall, catnip, shelves and clay pots`.

### Task 4: Bric-a-brac (sardine tin, crockery, tower of trunks)

**Files:** Modify the same set as Task 3.

**Interfaces:**
- Consumes: Task 3's pattern.
- Produces: `RAW` row `bric` at (-9.5, 11), treat `['sardines', y]`, `STALL_TIMES.bric = { serve: 3.4, away: 3.6 }`; `stallClimb('bric').tiers` (the trunk tower's perches, top within a hop of the cobbles chain); knockables `market-crock-1..3` (kind `cup`, stacked on the trunk tower's ledge, each its own `fallTo`); `buildTreatMesh('sardines')` (open tin, own mouth mesh and eat tell); `TREAT_KINDS` gains `'sardines'`; phrase ids `market.treat.sardines`, `market.grab.sardines`, `market.perch.bric`.

- [ ] **Step 1: Tests.** Same shape as Task 3 for the tin, trunks and cups, plus: the three cups fall one at a time (knocking cup 2 leaves cups 1 and 3 up; `nearest()` then offers the next); `cream` tests untouched (`kind === 'cream'` still the only mouth-less treat); the tin has a mouth mesh (`meshFor`); the stall's spot clears the café crumbs line and the cafe tables (`CAFE.tables`), the crumbs' approach and `stack-sw`/`bench-sw`/`tub-sw-mid` clutter (spec flags this pocket as the crowded one; move one clutter item if the plan test objects and record it); `marketlive` treats it as any grab (pay 6 + 6, refill after `REFILL_S`).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. For the louder clatter: only if the existing knock path allows it without new sound or knockable code; otherwise leave the plain cup clatter and list it in the hand-off (owner decision).
- [ ] **Step 4:** Run the files plus the four stall-loop tests; update measured numbers. Expected: PASS.
- [ ] **Step 5:** Commit `feat: the bric-a-brac stall, sardines, trunks and crockery`.

### Task 5: Butcher (hanging sausages, the hop grab, hook rail)

The riskiest task. Do not start Step 3 before Step 2 is red for the right reasons.

**Files:** Modify `marketplan.js`, `market.js`, `marketparts.js`, `marketrules.js`, `marketlive.js`, `propsets.js`, `marketnone.js`, `clanphrases.js`, `marketwords.js`; Test `test/marketlive-hop.test.js` (new), `marketplan`, `marketstalls`.

**Interfaces:**
- Consumes: `session.pounceTime` (0.3 down), `session.perched` (the area's perch object), `pick(mouth, {id, kind, treat: true})`, `actionFor(s)`, `act(action, s, ctx)`, `shoo(row, me)`.
- Produces: treat row fields `hang: true`, `hy` (about 0.9); `MARKET.HOP_FROM = 0.07`, `MARKET.HOP_TO = 0.23` (elapsed seconds of the 0.3 s pounce), `inHopWindow(pounceTime: number) -> boolean` in `marketrules.js` (elapsed = `HOP_S - pounceTime`); rail perch `{ x, z, y, kind: 'crate', rail: 'butcher' }` in `MARKET_PERCHES`; `marketlive` hop-catch inside `update()` that calls `act()` once per pounce (latch reset when `pounceTime <= 0`); `actionFor` returns null for a `hang` treat unless `s.perched?.rail === st.id`; `act` accepts a perched cat only for a `hang` treat on its own rail. Treat mesh `sausages` and phrase ids `market.treat.sausages`, `market.grab.sausages`, `market.perch.butcher`. Bone bucket knockable `market-bones-1` (kind `bucket`, with `fallTo`) on a ledge with a perch at its height.

- [ ] **Step 1: Geometry tests (fail first).** Rail perch within 0.7 m of the string (sideways); the rail stack stands off the treat's approach line (hide-to-treat dash stays walkable, existing hide test) and off every lane and zone; the rail is reachable from the cobbles in one `canReach` hop with `BASE_CLIMB_BUDGET`; the plan places the stack beside the string on the hide side only if the dash test passes, else the string moves to the stack side (`treat` side override on the row). Test (a) from the spec: a ground cat within 0.1 m of the string, not pouncing: `actionFor` null, `act` false. `marketplan`'s "every treat can be reached from the cobbles" now skips `hang` rows and a new test says a `hang` treat is reached by a hop from the cobbles and by the rail.
- [ ] **Step 2: Behaviour tests in `test/marketlive-hop.test.js`** (fake session, fake cat, the spec's list): (b) pounce at elapsed 0.15 s: `act` succeeds and `carry-pick` carries `market-treat-butcher`; (c) the same with a flat arc (`reducedMotion`): succeeds (the check reads the timer, not rendered lift); (d) elapsed 0.01 s, 0.29 s, and 1.0 m away: fails; (e) a cat on the rail perch gets `actionFor` and `act` works; a cat on the lower crates gets nothing; (f) a cat perched anywhere else gets nothing, including a perch with `rail: 'other'`; (g) refill after `REFILL_S`, pay 6 paws + 6 teamwork as the other treats (`restore` counts it); (h) two sessions: the partner's `remotePick('market-treat-butcher')` removes the string for both; plus: **a shoo in the window** (keeper watching, cat in the zone, not hidden): the pounce does not take the string, the shoo fires once for the whole pounce (not each frame), `treatOut` stays true, no `carry-pick` event; **from behind** the counter or the keeper's side: no cat point within `TREAT_REACH` of the string is walkable, and a hop there fails; hopping while carrying another treat or mid-munch: false.
- [ ] **Step 3:** Run `npx vitest run test/marketlive-hop.test.js test/marketplan.test.js`. Expected: FAIL.
- [ ] **Step 4:** Implement the plan row (butcher at (14, -9), `STALL_TIMES.butcher = { serve: 5.8, away: 4.6 }`), the rail stack and perch, the sausage string and hook rail drawing, `inHopWindow`, the `marketlive` changes (shoo path shared with `act`; swing tell when a cat is within reach of the string), the bone bucket row in `propsets.js`. `HOP_FROM`/`HOP_TO` are first values; tuning by feel on the iPad is the owner's check afterwards (see hand-off).
- [ ] **Step 5:** Run the new tests until green, then the full Market set (`marketlive`, `marketgame`, `marketcowalk`, `marketplan`, `marketrules`, `market`). Expected: PASS. Run the follow camera check: `test/` camera tests that load a perch under an awning, or add one that asserts the rail perch is not inside the awning's camera-blocking volume; if the camera cannot cope, stop and report.
- [ ] **Step 6:** Commit `feat: the butcher, sausage string, hop grab and hook rail`.

### Task 6: Placement, clearance and budget re-pin, screenshots

**Files:** Modify `test/budget.test.js`, `test/market.test.js`, `test/marketplan.test.js`; run `verify-market.html`.

**Interfaces:** consumes all four stalls; produces updated pins and a record of final positions.

- [ ] **Step 1: Tests.** `marketplan`: over all eight treat stalls, the four lamp lanes (`MARKET_LAMPS`), every hide-to-treat dash, `MARKET_KEEPOUT`, stray routes (`keepOutPoint` leaves no stray inside any zone), the spawn walk (spawn (0, 20.5) to the fountain rim along a walkable line) and the café crumbs approach all hold; golden mice, collectibles and found-outfit spots (`MARKET_SPOTS`) are 1.5 m clear of every new zone, or the test names the one that moved. `budget.test.js`: market built at most 280 / 210 / 62,000 (unchanged); merged pin `['market', buildMarket, M, C]` re-measured on purpose: run the file, read the new measured pair, set the pin to measured +12% (its own comments' rule), and write the measured values in the comment line.
- [ ] **Step 2:** Run `npx vitest run test/budget.test.js test/market.test.js test/marketplan.test.js`. Expected: only the re-pin lines fail.
- [ ] **Step 3:** Update the measured numbers and the pin; rerun. Expected: PASS. Confirm total triangles 8,000-10,000 over the start (`39,495` + 8,000-10,000, about 48-50k of 62k).
- [ ] **Step 4:** Run `npm run dev`, open `verify-market.html`, take the counter shot for each new stall (`MARKET_SHOTS`) and a wide shot of each of the four pockets; check for clipping, floating props and the sausage string reading as hanging; muted. Save nothing but the findings.
- [ ] **Step 5:** Commit `test: market budget re-measured for four stalls`.

### Task 7: Final checks and hand-off

**Files:** none new.

- [ ] **Step 1:** Run the full suite (command above). Expected: failed count 0 (or no more than Task 0's).
- [ ] **Step 2:** Run `npm run build`. Record start-up gzip (must be at most 698.0 and always under 720; the delta from 697.1 is the phrase lines, 7 knockable rows and 4 ids) and the Market chunk (under 100 kB).
- [ ] **Step 3:** Run `rg -n "Math.random" src/world/market*.js src/marketlive.js src/marketrules.js`; expected: no new hits. Confirm the determinism traces are unmodified with `git diff --stat origin/main -- test/fixtures`: only `market-atlas-cells.json` and `series-words-*.json` may differ.
- [ ] **Step 4:** Report to the owner: final positions and any moved clutter, the measured numbers, the open decisions (louder clatter, hop window feel on an iPad), and that merge and push wait for the owner's yes. After the owner merges, run the post-merge snapshot regeneration (Global Constraints) and revert spurious `notReached` entries.
- [ ] **Step 5:** If any record changed, commit `docs: market stalls hand-off`.
