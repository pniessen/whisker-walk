# Rooftops step 4, into the game: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Rooftops becomes a real place a child can unlock: 100 🐾 after 2 Fairground walks, a live card on the world map, a gate from the town and its twin in the back alley, pigeons with their own name, a first-visit hint, both word sets, and co-walks under the same rules as every other place.

**Architecture:** One catalog row (`CATALOG.areas.roofs`, copied from `ROOFS_REGISTRATION.catalog`) is the switch: every card, home line, offer, gift, room and gate already reads the catalog. The gateway pair is two `GATEWAY_ENDS` rows and one map road, plus one new gate look (`alleydoor`). The pigeon's name goes through the phrase table (`clanphrases.js`), read by `labels.js` at call time. The hint is one row at the seam at the top of `src/hints.js`.

**Tech Stack:** Three.js, plain ES modules, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-rooftops-design.md` ("Claude's calls": unlock, two players; "Everything else an area has"; "Constraints"), `docs/superpowers/specs/2026-11-19-world-map-design.md` ("The world", "Gateways", "Retiring Legacy"). Step 2's plan (`docs/superpowers/plans/2026-11-19-rooftops-step2-place.md`, rulings R1 and R2) and step 3's (`docs/superpowers/plans/2026-11-20-rooftops-step3-life.md`, S10) set up what this step finishes. The gateways plan (`docs/superpowers/plans/2026-11-20-world-map-step3-gateways.md`) set the reserve this step fills.

## Scope and rulings (the controller's brief, 2026-11-21)

The spec's own "Build order" item 4 reads "Discoveries, the two skills, golden mice, two-player height, dusk polish". The controller's brief for this step is different: **into the game** (unlock, map card, gateway, pigeon name, hint, word sets, co-walk). The brief governs. The spec has no section named "Fit with the game"; the brief's items are taken from "Claude's calls", "Everything else an area has" and the world-map design.

- **T1. Two-player height is already on main.** The partner-height work (2026-11-20) sends `h` (metres above the ground under her) on the state message, and `remotecats.js` draws her at `ground.y(x, z) + h` on the walk's own ground (`MAX_LIFT` 20 m). R1's reason for holding the row back is met, so the row goes in now. Task 6 proves it on the Rooftops.
- **T2. Not in this step** (left for a later Rooftops step, an owner question): the six discoveries' behaviour, Tightrope Tail and Long Leap in `src/skills.js`, the three golden mice, dusk polish, bird sounds.
- **T3. The `?roofs=1` switch stays, as a developer shortcut only.** With the row in the catalog it no longer gates anything: a Rooftops walk note always resumes (`resumableAreaIds` returns every walk id), and Explore with the switch still starts a solo Rooftops walk (never in a room), as the owner and the picture pages use it. Removing it would touch six test files and two shared files for no change a child sees.
- **T4. The gates.** Town end: a **signpost** at the north street end of the Neighborhood, `(0, -52)`, facing north, the mirror of `town-docks` at `(0, 52)`. The town's exits all have signposts, and the world map puts the Rooftops at the town's north rim. Rooftops end: a new look, **`alleydoor`**: a green wooden door in the back alley's brick wall (the wall `roofs.js` draws at `ROOFS_BOUNDS.maxZ`, z 46), placement `'inside'`, at `(14, 45.55)`, facing south, arriving at `{ x: 14, z: 42, yaw: 0 }`. The door's body has a dark doorway panel behind the leaf, so an open door shows a dark passage and the wall needs no hole (the wall stays whole in Legacy). The door opens **into the alley** (its leaf turns to `-LEAF_OPEN`), since opening outward would swing it through the wall.
- **T5. Legacy, minimal.** The row has no `edition`, so Legacy gets the Rooftops as a picture card in Change place, with the same unlock. Legacy gets no gate (the world-map design: "Until then Legacy stays exactly as it is: its picture cards, no map, no gateways"). World map step 4 (Legacy retirement) is not started, and nothing here is built for it.
- **T6. The pigeon's name** is `'a cooing pigeon'`, the phrase `'critter.pigeon'` in the phrase table's LATER block, the same in both word sets (the everyday set carries no override). Sparrows stay "a songbird" (they are songbirds), gulls "a seagull". Pigeons keep critter type `bird`, so tag, flight, sightings and the journal's counts are unchanged; the spawn carries `labelAs: 'pigeon'`, and only the shown name and the album key change.
- **T7. The hint line** is `'Follow the white pigeon up onto the roofs!'` (one line for touch and keys), picture `'🕊️'`, shown once ever, on the first Rooftops walk, ahead of every other hint due at the same check.

## Global Constraints

- Work only in `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/rooftops-4` (branch `rooftops-4`). Never write to the main checkout. Never run npm through a symlink. No merge, no push. Do not read `.env.local`. No database work.
- **Run no full test suite.** Targeted test files only (`npx vitest run test/<file>.test.js ...`). Never `pgrep -fl`; no unbounded wait loops.
- Unlock: `{ name: 'The Rooftops', price: 100, requires: { area: 'fair', walks: 2 } }`, after `fair` in `CATALOG.areas` (the place cards' order). No `KEPT_OFFERS` entry. Not in `COLONY_AREAS`.
- Text: every new line goes through the word tables (phrases in `src/clanphrases.js`, tutorial lines in `src/tutorialwords.js`). No series words in string literals outside the word tables. Refresh snapshots with `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`, then revert unrelated drift and the spurious `notReached` entries in `test/fixtures/series-words-on-source.json`.
- Determinism: `test/fixtures/flat-trace.gameplay.json` must not move.
- Tests: none that read source text (rule S1, `docs/SESSION-HANDOFF.md`). Whole-walk tests get explicit 60–90 s timeouts. Float fixtures use closeDiffs (CI is Linux).
- Shared files (`src/game/walk.js`, `src/main.js`, `src/worldmap.js`, `src/progression.js`, `src/critters.js`): smallest possible edits; other branches (people, market, house, fair touches, two birthday branches) change them too.
- Budgets: each street place stays inside `test/budget.test.js`'s ceilings with its gates; a gate look is at most 400 triangles over both meshes.
- Real-game checks: port 5408 with `--strictPort`, game muted (seed `muted: true`, `--mute-audio`, never press M).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A save that walked the Rooftops through `?roofs=1` before this step** (`walks.roofs` 2, not owned, 0 points): she does not own it, its card offers it at 100 🐾 only once she has 2 Fairground walks, and a Rooftops walk note left from then resumes (Task 3).
2. **A pigeon photographed after a songbird** gets its own album entry (`critter-pigeon`), and a sparrow or a Neighborhood bird still says "a songbird" (Task 1).
3. **The first Rooftops walk with another hint due at the same check** (`jump` at the alley bin): the Rooftops hint goes up first, once ever (Task 2).
4. **A Legacy Rooftops walk**: no door drawn, no gate prompt, the alley wall whole; the Rooftops picture card shows in Legacy's Change place (Tasks 3, 5).
5. **A partner on a plank over a back yard**, or mid-leap, is drawn at her height on the other device, not on the yard below; and a room's walk-on through the town's gate waits until every device has the Rooftops ready (Task 6).

---

### Task 1: Pigeons get their own name

**Files:**
- Modify: `src/clanphrases.js` (LATER table), `src/game/labels.js`, `src/world/roofsflock.js` (`roofsCritterSpawns`), `src/critters.js` (`pounceCatch` return, one field), `src/game/avatar.js:408`, `src/game/interactions.js:756`, `src/game/photo.js:18`
- Test: `test/labels.test.js` (create), `test/roofsflock.test.js`

**Interfaces:**
- Produces: phrase id `'critter.pigeon'` → `'a cooing pigeon'`; `labelFor('pigeon')` → that phrase, read when called; `critterLabel(c) → string`, `labelFor(c?.def?.labelAs ?? c?.type)`, taking a critter or a `pounceCatch` result; `critterKey(c) → string`, `c?.def?.labelAs ?? c?.type` (the album key's tail); `pounceCatch` returns `{ type, def, wasStalked }`.

- [ ] **Step 1: Write the failing tests.** In `test/labels.test.js`:
  - `labelFor('pigeon')` is `'a cooing pigeon'`; `labelFor('bird')` is `'a songbird'`; `labelFor('seagull')` is `'a seagull'`.
  - `critterLabel({ type: 'bird', def: { labelAs: 'pigeon' } })` is `'a cooing pigeon'`; `critterLabel({ type: 'bird', def: {} })` and `critterLabel({ type: 'bird' })` are `'a songbird'`.
  - `critterKey({ type: 'bird', def: { labelAs: 'pigeon' } })` is `'pigeon'`; `critterKey({ type: 'bird' })` is `'bird'`.
  - With a stand-in word set whose PHRASES carry `'critter.pigeon': 'a test pigeon'` (`test/helpers/standinwords.js`), `labelFor('pigeon')` is `'a test pigeon'`: the label is read through the table when called.
  In `test/roofsflock.test.js`: every spawn `roofsCritterSpawns` makes for a pigeon has `type: 'bird'` and `labelAs: 'pigeon'`; no sparrow or gull spawn has `labelAs`.
- [ ] **Step 2: Run** `npx vitest run test/labels.test.js test/roofsflock.test.js`. Expected: FAIL (no `critterLabel`, no phrase).
- [ ] **Step 3: Implement.** Add `'critter.pigeon': 'a cooing pigeon'` to LATER in `src/clanphrases.js` under a `// ---- Rooftops step 4 (2026-11-21) ----` heading. In `labels.js`, import `phrase` and return it for `'pigeon'` (keep every other label's text as it is). Pigeon spawns in `roofsCritterSpawns` get `labelAs: 'pigeon'`. `pounceCatch` returns `def: best.def` too. The three callers use `critterLabel(c)` / `critterLabel(hunted)`, and photo.js's key is `` `critter-${critterKey(c)}` ``. Sightings (`recordSighting`) and award keys (`spot-${c.id}`, `hunt-${hunted.type}`) are unchanged.
- [ ] **Step 4: Run** `npx vitest run test/labels.test.js test/roofsflock.test.js test/docks.test.js test/farmanimals.test.js test/critters.test.js test/clanphrases.test.js test/album.test.js test/photo.test.js` (skip any file that does not exist). Expected: PASS.
- [ ] **Step 5: Snapshots.** Run the snapshot refresh (Global Constraints), check `git diff test/fixtures` adds only `critter.pigeon` lines, revert anything else, then `npx vitest run test/serieswords test/offwords.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** with the message "Rooftops step 4: pigeons have their own name, 'a cooing pigeon', through the phrase table in both word sets".

### Task 2: The Rooftops' first-visit hint

**Files:**
- Modify: `src/hints.js` (the HINTS table and the seam comment), `src/tutorialwords.js`, `src/game/tips.js` (`HINT_PICS`)
- Test: `test/hints.test.js`, `test/tutorialwords.test.js` (only if it lists ids)

**Interfaces:**
- Produces: hint id `'roofs'`: `{ id: 'roofs', max: 1, ring: null, when: (f) => f.place === 'roofs' }`, the FIRST row of `HINTS`; line `'hint.roofs'`: `same('Follow the white pigeon up onto the roofs!')`; `HINT_PICS.roofs` = `'🕊️'`.

- [ ] **Step 1: Write the failing tests** in `test/hints.test.js`:
  - `the Rooftops hint goes up on a Rooftops walk, once ever`: `update(0.25, { place: 'roofs', walkNo: 5, t: 0 })` shows `'roofs'`; with `count('roofs')` 1 it never shows again; `{ place: 'park' }` never shows it.
  - `it wins when another hint is due at the same check`: facts `{ place: 'roofs', canJump: true, perched: false, walkNo: 5, t: 0 }` show `'roofs'`, not `'jump'`.
  - `hintMax('roofs')` is 1, and `HINT_IDS[0]` is `'roofs'`.
- [ ] **Step 2: Run** `npx vitest run test/hints.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the row, the line and the picture. Rewrite the seam comment to say the Rooftops' row is the first in the table and why (a place's own hint wins at the walk's first check).
- [ ] **Step 4: Run** `npx vitest run test/hints.test.js test/tips.test.js test/tutorialwords.test.js test/progression.tutorial.test.js`. Expected: PASS.
- [ ] **Step 5: Snapshots** as Task 1 Step 5 (only `hint.roofs` lines added), then `npx vitest run test/serieswords.tutorial.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** with the message "Rooftops step 4: a first-visit hint, 'Follow the white pigeon up onto the roofs!'".

### Task 3: The Rooftops opens

**Files:**
- Modify: `src/progression.js` (`CATALOG.areas`, the `defaultState.walks` comment), `src/roofsflag.js`, `src/world/roofsplan.js` (the `ROOFS_REGISTRATION.catalog` comment), `src/worldmap.js` (`TOWN_PLACES` model: pass `{ touch }`; header comment), `src/ui/territorymap.js` (an icon for the Rooftops), `test/helpers/withroofs.js`
- Test: `test/roofsgame.test.js`, `test/roofs.test.js`, `test/worldmap.test.js`, `test/dressingroom.test.js`, `test/fair.test.js`, `test/nextthing.test.js`, serieswords fixtures

**Interfaces:**
- Produces: `CATALOG.areas.roofs` = `{ name: 'The Rooftops', price: 100, requires: { area: 'fair', walks: 2 } }`, right after `fair`, and `test/roofs.test.js` checks it equals `ROOFS_REGISTRATION.catalog`; `resumableAreaIds(walks)` returns `Object.keys(walks)`; `roofsOn()` unchanged (ruling T3); the map's Rooftops region has `status: 'built'` and its card the usual Go here / Open for 100 🐾 / lock line; `STREET_ICON.roofs` (or a `TOWN_ICON`) = `'🕊️'`.

- [ ] **Step 1: Turn the R1 tests round, failing.** Each test that asserts the row is missing now asserts it is there:
  - `test/roofs.test.js` "holds its row out of the catalog (R1)": `CATALOG.areas.roofs` deep-equals `ROOFS_REGISTRATION.catalog`, and `Object.keys(CATALOG.areas)` has `roofs` right after `fair`.
  - `test/roofsgame.test.js`: "the catalog does not have the Rooftops until step 4" → `the catalog has the Rooftops, after the Fairground`; "a Rooftops walk note is dropped without the flag" → `a Rooftops walk note resumes, with the flag or without`; "a room never walks the Rooftops" → `a room walks the Rooftops like any place` (the same members, a proposal naming the Rooftops starts the walk on both); "the lobby's rule: a walk config or request naming the Rooftops is ignored" → it is honoured as for the Park; "nothing in the real catalog offers it" → `the real catalog offers it as the world map orders it`: `placeState` for a save with 1 Fairground walk is locked with the line `opensAfterLine` gives; with 2 walks and 100 points `canOpen`; `nextThing` with 1 Fairground walk names the Rooftops in the Fairground's home line.
  - Review Focus 1, in `test/roofsgame.test.js`: `a save that walked the Rooftops with the switch keeps nothing it did not buy`: `walks: { ...fresh, roofs: 2, fair: 0 }`, not owned: `placeState(...).owned` false and locked (Fairground walks 0 of 2).
  - `test/worldmap.test.js`: "the Rooftops is on the map inside the town, coming soon" → `... and open to unlock`: locked region for a fresh save (🔒, `status: 'built'`), an owned save's card has `action: 'go'`; "its card has no button" → `its card offers it for 100 🐾 once the Fairground walks are done`. With `touch: true` its line says Tap where a street place's would.
  - `test/dressingroom.test.js`: Legacy now lists seven places, the Rooftops among them (Review Focus 4), and still never a wild place.
  - `test/fair.test.js`: the Fairground is the fourth place, after the Farm and before the Rooftops.
- [ ] **Step 2: Run** `npx vitest run test/roofs.test.js test/roofsgame.test.js test/worldmap.test.js test/dressingroom.test.js test/fair.test.js`. Expected: FAIL on exactly the turned tests.
- [ ] **Step 3: Implement.** Add the row (one line plus a short comment naming this plan and ruling T1). `resumableAreaIds` keeps every id; the `roofsflag.js` header says the switch is a developer shortcut now (T3). Update the comments that say "until step 4" in the files listed. `withRoofs` returns a copy of a catalog that already has the row unchanged, so its callers keep working. The map's town places pass `{ touch }` to `placeState`.
- [ ] **Step 4: Run** the Step 2 files plus `npx vitest run test/placecard.test.js test/homebase.map.test.js test/homebase.edition.test.js test/territories.test.js test/unlockorder.test.js test/gifts.test.js test/rooms.test.js test/lobby.test.js test/walkresume.test.js test/roofswalk.test.js test/roofsload.test.js test/nextthing.test.js test/progression.test.js test/edition.test.js test/spendconfirm.test.js test/goldedition.test.js test/foundwear.test.js test/foundjournal.test.js test/gateways.test.js test/gatecross.test.js test/crossing.test.js`. Expected: PASS.
- [ ] **Step 5: Snapshots.** Refresh; the added lines name the Rooftops (its card, its home line, its Get it?, the map label) and nothing else moves. Where the stand-in-word-set test finds an "on"-set word, fix the source of that word (it must come through the word tables), not the test. Then `npx vitest run test/serieswords test/offwords.test.js test/clanwords.test.js test/wordset.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** with the message "Rooftops step 4: the Rooftops opens, 100 🐾 after 2 Fairground walks; a live card on the world map and a picture card in Legacy; ?roofs=1 stays as a developer shortcut".

### Task 4: The alley door look

**Files:**
- Modify: `src/gateways.js` (`GATE_LOOKS`, header), `src/world/gateway.js` (an `alleydoor` look, a per-look open angle, header)
- Test: `test/gatewaylook.test.js`, `test/gateways.test.js` (the `GATE_LOOKS` list)

**Interfaces:**
- Produces: `GATE_LOOKS` = `['signpost', 'fairgate', 'farmgate', 'promenade', 'alleydoor', 'none']`; `openAngle(look) → number`, exported from `world/gateway.js`: `-LEAF_OPEN` for `'alleydoor'`, `LEAF_OPEN` otherwise; `buildGateLook` and `addGatewayDressing` turn the hinge to `openAngle(end.look)` when open.

- [ ] **Step 1: Write the failing tests** in `test/gatewaylook.test.js`:
  - `the alley door: brick piers and a lintel, a dark doorway, a green door`: `buildGateLook` of an `alleydoor` end gives a `gateway` group with `gateBody` and `gateLeaf`; at most 400 triangles over both; the body's bounding box is at least 2.2 m tall and spans the two posts (x −GATE_HALF..GATE_HALF in local space).
  - `it opens into the place, not through the wall`: `openAngle('alleydoor')` is `-LEAF_OPEN`, `openAngle('signpost')` is `LEAF_OPEN`; with `addGatewayDressing(..., { isOpen: () => true })` the door's leaf's far end (world space) lies on the inward side of the end (for a south-facing end, z less than the end's z), and its leaf circles are not in the attached list; `setOpen(id, false)` puts them back.
  - Every other look's open leaf still swings out, as before.
- [ ] **Step 2: Run** `npx vitest run test/gatewaylook.test.js test/gateways.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `alleydoor(body, leaf, band)` beside the other looks, with `kit()`'s parts: two brick piers (about 0.36 m square, 2.3 m tall) at ±GATE_HALF, a brick lintel across their tops, a small sign board in the band colour on the lintel, and a near-black doorway panel just behind the opening on the outward side (local −z, the wall's side, about 0.35 m out from the posts' line, so it sits just in front of the wall face when the end stands 0.45 m inside the wall) filling it to the lintel; the leaf a pair of green plank doors as one leaf with two cross braces and a knob. Colours as named constants beside the file's others. Update the headers: the Rooftops' end is a door drawn here, not a `'none'` look.
- [ ] **Step 4: Run** `npx vitest run test/gatewaylook.test.js test/gateways.test.js test/budget.test.js`. Expected: PASS.
- [ ] **Step 5: Check by eye.** `verify-gates.html?look=alleydoor` on port 5408 (`npx vite --port 5408 --strictPort`): shut and open, both read as a door in a wall. Save a picture to the scratchpad's `rooftops-step4/` as `alleydoor-look.png`.
- [ ] **Step 6: Commit** with the message "Rooftops step 4: the alley door, a gate look that opens into the alley".

### Task 5: The gateway pair

**Files:**
- Modify: `src/gateways.js` (`GATEWAY_ENDS`), `src/worldmap.js` (`GATEWAYS`: one road)
- Test: `test/gateways.test.js`, `test/gatewayspots.test.js`, `test/walkon.test.js`, `test/gatecross.test.js`, `test/budget.test.js`, `test/worldmap.test.js`

**Interfaces:**
- Consumes: `alleydoor` (Task 4); `CATALOG.areas.roofs` (Task 3).
- Produces:
  - `neighborhood`: `end({ id: 'town-roofs', gateway: 'town-roofs', x: 0, z: -52, faces: 'north', to: 'roofs', twin: 'roofs-town', look: 'signpost' })`
  - `roofs`: `end({ id: 'roofs-town', gateway: 'town-roofs', x: 14, z: 45.55, faces: 'south', to: 'neighborhood', twin: 'town-roofs', look: 'alleydoor', placement: 'inside', arrive: { x: 14, z: 42, yaw: 0 } })`
  - `GATEWAYS` gains `{ id: 'town-roofs', from: 'neighborhood', to: 'roofs', road: [...] }`, a short road from the town up to the Rooftops' circle (`TOWN_PLACES.roofs`, centre (905, 458), r 46), ending on that circle's edge. The builder picks the four points from the map picture.
  - The builder may move the Rooftops' door along the wall (x within −20..30, z kept 0.45 m inside the wall) and its arrival with it, if a clearance rule fails; say so in the commit.

- [ ] **Step 1: Write the failing tests.**
  - `test/gateways.test.js`: the row table gains both rows; "every map road has one end on each side, and the two ends twin each other" covers `town-roofs`; `arrivalFor('town-roofs')` is `{ areaId: 'roofs', x: 14, z: 42, yaw: 0 }`; `arrivalFor('roofs-town')` is 3.6 m inside `(0, -52)`: `{ areaId: 'neighborhood', x: 0, z: -48.4, yaw: Math.PI }`.
  - `test/gatewayspots.test.js`: "has ten ends, all on an edge, in six built areas" → twelve ends, eleven on an edge and one inside (`roofs-town`), in seven areas; G1 and G5 hold for every edge end (the town's signpost among them); a new `the Rooftops' alley door stands in the alley wall`: its z within 0.5 m of `ROOFS_BOUNDS.maxZ`, a walkable spot on the alley's flood within `GATE_REACH` of it, its posts 1.2 m from every collider of the area, and 3 m from the spawn, every point of interest, collectible, scenic, perch and carryable; the arrival rule (clear, walkable, reachable, `GATE_REACH + 2` from every end) covers both new arrivals.
  - `test/gatecross.test.js`: `gateMomentHtml({ name: 'The Rooftops' })` holds "Off to the Rooftops!"; for a save with 1 Fairground walk the town gate's `gateStatus` is `shut` with the line "Opens after 2 walks in the Fairground. 1 to go!" (as `gate.shut` words it); with 2 walks and 100 points it is `buy`, with 60 points `short` ("You need 40 more 🐾. Keep exploring!"); owned, `go`. The alley door's status is always `go`.
  - `test/walkon.test.js`: a Neighborhood walk walks on through `town-roofs` and the Rooftops walk starts at (14, 42) facing north; a Rooftops walk walks on through `roofs-town` and the Neighborhood walk starts at (0, −48.4). Give each a 90 s timeout.
  - `test/walkon.test.js` or the file that holds the Legacy gate tests (Review Focus 4): a Legacy Rooftops walk has no `gateway` child and no gate prompt at (14, 44.5).
  - `test/budget.test.js`'s "with the gateways" block covers the Rooftops (its door) and the Neighborhood (three signposts) inside the same ceilings, built and merged.
- [ ] **Step 2: Run** `npx vitest run test/gateways.test.js test/gatewayspots.test.js test/gatecross.test.js test/walkon.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the two rows and the road. Rewrite the `gateways.js` header's reserve sentence ("Rooftops step 4 adds the pair ...") to say what is there now; keep House step 4's.
- [ ] **Step 4: Run** `npx vitest run test/gateways.test.js test/gatewayspots.test.js test/gatecross.test.js test/walkon.test.js test/budget.test.js test/worldmap.test.js test/crossing.test.js test/crossinglock.test.js test/flattrace.test.js test/roofswalk.test.js`. Expected: PASS, the flat trace's gameplay part unchanged.
- [ ] **Step 5: Commit** with the message "Rooftops step 4: a signpost at the town's north end and a green door in the Rooftops' alley wall; walk through either and go straight on".

### Task 6: Two players on the Rooftops

**Files:**
- Test: `test/roofsgame.test.js` (or `test/roofscowalk.test.js`, create), `test/remotecats.test.js`
- Modify: only what a failing test shows is wrong.

**Interfaces:**
- Consumes: `liftForState(perchY, seat)`, `createRemoteCats(scene, { ground })` (`src/remotecats.js`); the Rooftops' area record and ground (`src/world/roofs.js`); the traversal runtime that writes `player.perchY` on a crossing (`src/traversallive.js`); `decideWalkOnHave` (`src/gatecross.js`).

- [ ] **Step 1: Write the tests** (Review Focus 5):
  - `a partner on a plank is drawn at the plank's height`: on the Rooftops' ground, a cat on plank-1 at its middle, with `player.perchY` as the traversal runtime writes it, sends `liftForState(perchY).h`; a remote cat fed `{ x, z, h }` there is drawn with `position.y` within 0.02 m of the plank's rail height (`ground.y(x, z) + h`).
  - `mid-leap the same`: a sample from the middle of a leap's arc is drawn at the arc's height within 0.02 m.
  - `a room walks on through the town's gate only when every device has the Rooftops`: `decideWalkOnHave` for via `town-roofs` with one member not ready keeps everyone in the Neighborhood; all ready moves the room; a guest who does not own the Rooftops walks it with `walkOnMove(...)` `'override'`, and `pickOnCrossing` never buys it.
- [ ] **Step 2: Run** them: `npx vitest run test/roofsgame.test.js test/remotecats.test.js` (and the new file). Expected: PASS if T1 holds; if any fails, fix the code it names (smallest edit) and say so in the report.
- [ ] **Step 3: Commit** with the message "Rooftops step 4: two players on the Rooftops, proved: height on planks and leaps, a room through the town's gate together".

### Task 7: Pictures and builds

**Files:** none in the repo, unless a picture shows a fault (then a fix goes back to its task's files, with a test where one can pin it).

- [ ] **Step 1: Builds.** `npm run build` (start-up ≤ 700 kB, each place ≤ 100 kB) and `npm run build:ios`. Record the start-up, `roofs` and `neighborhood` chunk sizes.
- [ ] **Step 2: Pictures** on port 5408 (`--strictPort`, muted save, `--mute-audio`), saved to `/private/tmp/claude-501/-Users-pniessen--claude-spares-spare-gcns3j/e37e3895-a9b0-4a89-9360-a15387ffb2e4/scratchpad/rooftops-step4/`, phone (375 × 812) unless said: `map-locked.png` (1 Fairground walk), `map-open.png` (owned), `map-card-offer.png` and `getit-offer.png` (2 Fairground walks, 150 🐾: the card and the Get it? card), `gate-town-shut.png`, `gate-town-buy.png`, `gate-town-open.png`, `gate-roofs.png` (the alley door), `moment-off-to-roofs.png`, `arrived-roofs.png`, `hint-roofs.png`, `pigeon-caught.png` (the toast after a pounce on a pigeon), `everyday-words.png` (the map and the gate prompt in the everyday set, if the game can show it; else the snapshot lines), `legacy-card.png` (Legacy's Change place with the Rooftops card). Look at every picture.
- [ ] **Step 3: Report** the pictures' paths, the sizes, and anything a picture showed.
