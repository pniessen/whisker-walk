# The Family Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Builder: Sonnet. Capture steps (pictures, film, build-size and budget readouts, console runs): Haiku. No Opus.

**Goal:** A private-edition world that looks like the owner's family home, built on the Old House engine, shipped only in a separate private build.

**Architecture:** M0 makes the house engine plan-agnostic and adds the private build flag, the build/save separation and the public-bundle exclusion tests. M1 to M3 add `src/family/` (plan, parts, life) behind `__PRIVATE_FAMILY__`.

**Tech Stack:** vanilla JS, three.js, vite (mode `family`), vitest.

**Spec:** `docs/superpowers/specs/2026-11-22-family-home-design.md` (read it first, with `2026-11-20-old-house-design.md`).

## Global Constraints

- Work in worktree `.worktrees/family-home` (branch `family-home`); commit there only. Never touch the main checkout. The owner approves merge and push; do neither. One milestone is one merge.
- **Privacy (hard):** never write the street address, town, listing text, prices, photos or any real person's name into the repo, docs, code, test names, comments or commit messages. Call it "the family home". Cat names D2, Digit, Robbie only (already in `CATALOG`). Layout data lives only in `src/family/`. Before every commit run `node scripts/privacy-scan.mjs` (Task 5).
- Never raise a ceiling: start-up 720 kB gz (`MAIN_GZIP_CEILING_KB`), per-place 100 kB (`AREA_GZIP_CEILING_KB`), worst spot 450 meshes / 380 casters / 70,000 triangles (aim 300 / 200 / 55,000). Measure before and after each task that adds drawing.
- The old house must not change: its triangle pins, `test/housecamera.test.js`, `test/housebudget.test.js` and the determinism traces stay green and unmoved through M0. If one moves, stop.
- No `Math.random`: `hash01` or seeded streams only; golden mice, discoveries and finds are deterministic from the room seed (co-walk rule).
- Words: every line through `phrase()` ids for both word sets; no series words in literals (`test/clanwords.test.js`).
- Do not edit `src/game/walk.js`, `src/player.js`, `src/game/interactions.js` except where a task names them. No database work. The family build never creates a Supabase client.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Full suite: `npx vitest run`, judged by the failed count (never 18:30-19:30 local; the 7 pm refresh runs then). Heavy tests live in `test/heavy.js`.

## Review Focus

1. **Public exclusion (Tasks 3-5):** the public build contains no family file, token or room id; the test proves it AND proves the same grep finds them in the family build.
2. **Old house untouched (Tasks 1-2):** every old-house test and pin unchanged after the plan-argument refactor.
3. **Never lost behind a wall (M1):** glass walls, the deck, the slope lawn and the sunken step, both players, every zoom step.
4. **Worst-spot budget (M1):** with zone drawing and the roof lids hidden in the active zone.
5. **Privacy scan** clean on code, tests, docs and commit messages.

---

# M0. Plan-agnostic engine and the private build (no personal data)

### Task 1: Map how the house depends on its one plan (Haiku, read-only)

- [ ] List every import of `houseplan.js` constants in `src/world/house*.js`, `src/houselevels.js`, `src/game/*` and `test/house*.test.js` (grep `HOUSE_LEVELS`, `HOUSE_ROOMS`, `HOUSE_STAIRS`, `HOUSE_DOORWAYS`, `HOUSE_WINDOWS`, `HOUSE_BOUNDS`, `HOUSE_FRONT_DOOR`, `SECRET_`).
- [ ] Write the list as comments in the PR description only (no file). Mark each use "per-plan" (becomes an argument) or "fixed" (secret bookcase, front door: stays old-house-only, optional in a plan).
- [ ] Record the current numbers: `BUDGET_LOG=1 npx vitest run test/housebudget.test.js --reporter=verbose`.

### Task 2: Make the house engine take its plan as an argument (Sonnet)

**Files:** modify `src/world/houseplan.js`, `src/world/house.js`, `src/world/houseparts.js`, `src/houselevels.js`, the walk's house wiring; create `test/houseplanarg.test.js`.

- [ ] Write the failing test first: `build(scene, { plan })` with a tiny two-room, two-level fake plan builds, `plan` defaults to the old house, and `houseColliders(plan)`, `houseSections(plan)` and the level drawing accept a plan. Expected: fail (no `plan` option).
- [ ] Introduce `OLD_HOUSE_PLAN = { id, levels, rooms, stairs, doorways, windows, bounds, frontDoor?, secret? }` assembled from the existing exports (the exports stay, so no import changes).
- [ ] Thread `plan` through `build`, `houseSections`, `houseColliders`, `createLevelDrawing`, the sink rules (`housewalls.js`) and the camera helpers, defaulting to `OLD_HOUSE_PLAN`.
- [ ] Run all `test/house*.test.js` and `test/budget.test.js`: unchanged, including every triangle pin. Commit "refactor(house): the engine takes its plan as an argument".
- [ ] Also test that a plan with two stairs sharing a landing walks (a cat goes ground to basement across two runs); fix the stair code if it fails.

### Task 3: The private flag and the family mode (Sonnet)

**Files:** `vite.config.js`, `src/world/areas.js` (flag block only), `package.json`, `.gitignore`, `test/helpers/family.js`, create `test/familyflag.test.js`.

- [ ] Failing test: `vite.config.js` exports `FAMILY_MODE`; the config for mode `family` has `build.outDir === 'dist-family'`, relative base and `define.__PRIVATE_FAMILY__ === 'true'`; every other mode's define is `'false'`.
- [ ] Add the mode, the `build:family` and `preview:family` (`vite preview --host --outDir dist-family`) scripts, `dist-family/` in `.gitignore`. Declare `__PRIVATE_FAMILY__` for vitest as `false` (`test.define`).
- [ ] In `areas.js` add the one block `if (__PRIVATE_FAMILY__) loaders.family = () => import('../family/index.js')` with a one-room placeholder `src/family/index.js` exporting a trivial `build`.
- [ ] Check by hand: public `vite build` emits no chunk for it; `vite build --mode family` does. Commit.

### Task 4: Separate save and no cloud in the family build (Sonnet)

**Files:** `src/progression.js` (the `SAVE_KEY` constant only), `src/cloud.js` (one guard), create `test/familysave.test.js`.

- [ ] Failing tests (with the flag helper switching the constant): `SAVE_KEY` is `whisker-walk-save` publicly and `whisker-walk-family-save` in the family build; in the family build `cloud` creates no client and every sync call is a no-op; a public save in storage is never read by the family build and the reverse.
- [ ] Implement with a single exported `SAVE_KEY` chosen from the flag. Commit.

### Task 5: The public-exclusion test, the CI guard and the privacy scan (Sonnet; Haiku runs it)

**Files:** create `src/family/sentinel.js`, `test/privateedition.test.js` (add to `test/heavy.js`), `scripts/privacy-scan.mjs`, edit `.github/workflows/deploy.yml`, `.gitignore` (`private-denylist.local.txt`).

- [ ] Write the tests first (they fail until the sentinel exists):
  1. A programmatic public build into a temp dir: no emitted file name contains `family`; the manifest has no source under `src/family/`.
  2. No emitted text file (`.js .html .json .css`, `sw.js`, `precache.json`) contains the sentinel token or any room id exported by the family plan module.
  3. The same build in `family` mode contains them (guards against a vacuous pass).
  4. Static: no file outside `src/family/`, the `areas.js` and `worldmap.js` flag blocks, `vite.config.js` and the tests imports a path under `src/family/` (regex over `src/`).
- [ ] `src/family/sentinel.js` exports `ww-private-family-3c91`; every future `src/family/*.js` file starts with a comment holding a second token `ww-private-family-file`.
- [ ] `deploy.yml`: after the build step add `grep -rl "ww-private-family" dist && exit 1 || true`.
- [ ] `scripts/privacy-scan.mjs`: reads the gitignored `private-denylist.local.txt` (one string per line; if absent it prints a warning and exits non-zero locally), scans tracked files, `git log` messages and `dist/` and `dist-family/` text for each string, case-insensitive. Test it with a temporary denylist created inside the test (a harmless dummy string), never a real one.
- [ ] Haiku step: run the full suite plus `node scripts/privacy-scan.mjs`; report the failed count and the scan result. Commit. **M0 ends here: a mergeable, behaviour-neutral change. Owner's yes to merge.**

---

# M1. The shell, the ground floor, the living room and the basement

### Task 6: Measure the starting points (Haiku)

- [ ] Run `BUDGET_LOG=1` for the old house; record the fixed set per level. Record `vite build` gzip sizes for the start-up and `house` chunks. These are the "before" numbers in the PR.

### Task 7: The plan data and its tests (Sonnet)

**Files:** create `src/family/familyplan.js`, `test/familyplan.test.js`.

- [ ] Tests first: levels `basement -2.7, ground 0, upstairs 2.7, loft 5.0`; every room's size equals its feet times 0.5 (a table of the listed room sizes: kitchen 26x17, dining 18x16, bedrooms 12x12 and 13x12, living 32x21, suite 25x15, family room 25x15); no two rooms or stairs on different levels share any x, z; every room is reachable from the entry on foot (a graph search over doorways and stairs, the walk-out door included); every stair is at most 1 in 3; the lawn strip from y 0 to y -2.7 is at most 1 in 3 and meets the patio; the sunken step is walkable both ways (`ground.canStep`).
- [ ] Implement the plan from the spec's room tables, one export object `FAMILY_PLAN` in the engine's plan shape. Commit.

### Task 8: The ground (Sonnet)

**Files:** `src/family/familyground.js`, `test/familyground.test.js`.

- [ ] Tests first: `y(x, z)` at the mud-room door is 0; at the patio is -2.7; along each stair is linear; the deck is 2.7; the loft landing 5.0; the slope lawn never below the drawn grass; the cat never falls off an edge (the engine's edge rule).
- [ ] Implement with `createGround` strips and discs from the plan. Commit.

### Task 9: Atlas cells and the exterior (Sonnet; Haiku captures pictures)

**Files:** `src/family/familyparts.js`, `test/familyexterior.test.js`.

- [ ] Tests first (triangle counts, names, no `Math.random`): each roof lid (ground, upstairs, basement pavilion, loft) exists as one mesh named `familyRoof:<zone>` with a shallow slope or flat top, overhang 1.6 m on the glass side and 1.0 m elsewhere; the fixed shell (walls, glass panes, siding, posts, chimneys, trees) is at most 24,000 triangles; the deck has rail and posts to the lawn.
- [ ] Build the shingle, auburn siding, flagstone and plank atlas cells (a single extra atlas at most); the glass-wall sections (4 m panes, thin mullions); the clerestory band on the tall north wall; the deck; the patio; the wooded ring using the Woods tree builders.
- [ ] Haiku step: render `verify-family.html` (scratch page, gitignored like the other verify pages; it must not be committed) from the front, the deck side, the patio and the dollhouse; save PNGs to the scratchpad and report. Commit code only.

### Task 10: The roof lids and the dollhouse cut-away (Sonnet)

**Files:** `src/family/familyroofs.js`, `src/world/housewalls.js` (a roof-hook only), `test/familyroofs.test.js`.

- [ ] Tests first: a roof lid is visible when she is outside; hidden (faded over 0.4 s, no pop) when she is inside that zone's footprint; at zoom step 0 only the lid of her own zone hides; from step 1 up every lid over her drawn zones hides; never a lid between the camera and the cat.
- [ ] Implement with the sink-state machine's output (no new timers). Commit.

### Task 11: Zone drawing (Sonnet)

**Files:** `src/family/familyzones.js` (or the shared `createZoneDrawing` from the wing branch if merged first; check `main`), `test/familyzones.test.js`.

- [ ] Tests first: five zones Z1 to Z5; only her zone and the zones joined to hers by a stair or doorway are in full detail; all others use stand-ins that cost less than the detail (triangles and meshes) and have no casters; a partner on another zone is always drawn.
- [ ] Implement. If the wing's `createZoneDrawing` is already on main, reuse it; if not, write it here in a shape the wing can adopt (note this in the PR). Commit.

### Task 12: Rooms and furniture, first slice (Sonnet)

**Files:** `src/family/familyrooms.js`, `test/familyrooms.test.js`.

- [ ] Tests first: per-zone full-detail triangle ceilings from the spec (Z1 9,000, Z3 11,000, Z5 9,000; Z2 and Z4 only their shell in M1); a furniture list per room (data) with every item inside its room's footprint and not blocking a doorway or stair mouth; every item on the plan is reachable by a cat (no sealed corners); the stoves have a hearth rug and a reach disc.
- [ ] Data tables for the ground floor (kitchen island, dining table, beds, mud-room rack, laundry basket), the living room (stove, sofa, coffee table, shelves, French doors), the basement (stove, rug, bean bags, shelf, theater tiers). Use merged shared geometry. Commit.

### Task 13: Residents, standing at their spots (Sonnet)

**Files:** `src/family/familycats.js`, `test/familycats.test.js`.

- [ ] Tests first: D2, Digit and Robbie each have two home spots (the stove hearth, a sunbeam, the theater cushion, the kitchen counter); drawn only in the active zone's detail set; a player cat that is one of them hides that resident; the three never overlap a spot; no Rosa anywhere (`grep -ri rosa src/family` empty).
- [ ] Implement standing and slow spot-to-spot timers reusing the Old House resident code; no hints yet. Commit.

### Task 14: The camera and budget suites on the family plan (Sonnet)

**Files:** `test/familycamera.test.js`, `test/familybudget.test.js`.

- [ ] Parametrise the existing never-lost cases (copy the case builders, do not duplicate the logic): every room, doorway and stair end, the deck, the patio, the loft, both players, every zoom step; glass sections sink with their panes; the camera never enters the rail or dips under drawn grass.
- [ ] Budget: worst spot per level and per zone, day and dusk, with the cats and walk things, 450 / 380 / 70,000 held and 300 / 200 / 55,000 as the aim; zone stand-ins cheaper than their detail; roof lids hidden in the active zone.
- [ ] If a figure is over, stop and report; never raise a ceiling.

### Task 15: Into the private game (Sonnet)

**Files:** `src/family/index.js`, `src/worldmap.js` and `src/progression.js` (flag blocks only), `test/familygame.test.js`.

- [ ] Tests first (flag on): the place appears on the world map and in `CATALOG.areas`, unlocked from the start; Explore starts a walk there; co-walk spawns two cats; `SAVE_KEY` is the family one; the family place is absent with the flag off.
- [ ] Implement `build`, the arrival at the mud-room door, the gateway from the lawn. Commit.

### Task 16: M1 sign-off pictures and sizes (Haiku)

- [ ] Run the full suite; `vite build` (public) and `vite build --mode family`: report gzip sizes of start-up, `family` chunk (ceiling 100, aim 60) and the public bundle's grep result.
- [ ] Capture: exterior front, deck side, patio, dollhouse at zoom step 1 over the living room, the stove nap, the basement walk-out; save to the scratchpad. **M1 ends: owner's yes to merge.**

---

# M2. Details, discoveries, the cats' life

### Task 17: Upstairs rest of the house and the ground floor's rest (Sonnet)

- [ ] Tests first for Z2 and Z4: primary suite with the sunken bed (ramp walkable both ways), soaking tub, two baths, loft furniture; the per-zone ceilings (Z2 6,000, Z4 7,000, Z3 11,000); camera tests for the new rooms.
- [ ] Implement and re-run the budget; if any worst-spot figure passes the aim, simplify props before touching a ceiling.

### Task 18: Golden mice, finds, knock-overs, mice (Sonnet)

- [ ] Tests first: six golden mice (two per zone group) placed from a fixed table and the room seed, all reachable; four found items per area, find-only wearables, deterministic spots; knock-overs on the counter, coffee table and shelves, no new knockable kinds (stop and ask if one is needed); pantry mice via `critters.js`; one yarn ball per walk.
- [ ] Implement. Commit.

### Task 19: Discoveries and climbing routes (Sonnet)

- [ ] Tests first: eight discoveries (cat-flap bell, sunbeam, stove glow, sunken-bed fort, theater picture, clerestory view, deck-rail bird, basement yarn pit), each once per walk, counting for both on co-walk; climbing routes (stool to counter, shelf to shelf, rail balance), every leap lands.
- [ ] Implement using `src/discoveries.js` and `src/traversal.js`. Words through `phrase()`.

### Task 20: Sunbeam slots, sleeping, hearth warmth (Sonnet)

- [ ] Tests first: a sunbeam slot is lit within its time window from the game's day clock, moves slowly across the floor, and is a nap spot (reach disc, lie-down pose, small calm effect); the stove hearth warms after 3 s within reach; the theater cushion starts a drifting picture; all deterministic.
- [ ] Implement. Commit.

### Task 21: Resident hints, friendship, sound (Sonnet)

- [ ] Tests first: each resident gives at most one hint line per visit, aimed at something this child has not found, via both word sets; friendship per child in the family save when everything is found; stove crackle and creaks under the sound switch.
- [ ] Implement with the Old House's hint and friendship code. Commit.

### Task 22: Co-walk, pad reach, dusk, the iOS family target (Sonnet; Haiku captures)

- [ ] Tests first: co-walk both cats visible across zones; pad and thumb reach for every nap spot and climb; dusk lamps and no dark room.
- [ ] iOS: second target and bundle id, `build:ios-family` into `ios/web-family` from `--mode family`, excluded from `ios/refresh.mjs`; add a test that the public iOS build (`--mode ios`) lacks the sentinel.
- [ ] Haiku: full suite, sizes, privacy scan, and the sign-off pictures. **M2 ends: owner's yes to merge.**

---

# M3. The barn and the yard

### Task 23: Barn plan and ground (Sonnet)

- [ ] Tests first: a barn 34.5 x 21 m on level `ground`, joined to the yard by two doors; the guest suite (950 sq ft, about 237 m2 on the plan at 0.5 m per ft, roughly 15 x 16 m) on the `upstairs` level beside the barn, joined by an outside stair; plan tests extended (one level per x, z; reachable; grades).
- [ ] Implement and budget (the yard zone Z6, the barn Z7, the guest suite Z8; each zone ceiling 8,000).

### Task 24: Chickens, garden beds, the wooded lot (Sonnet)

- [ ] Tests first: chickens as a drawn idle flutter with no catch and no fear (a hint at most); garden beds with a knock-over trowel; the lot's trail to a boundary stone and fence at the lot's edge; trees merged.
- [ ] Implement.

### Task 25: Barn contents, golden mice, discoveries (Sonnet)

- [ ] Tests first: workshop bench and hay-loft route, four more golden mice, three more discoveries (the hay loft view, the chicken egg, the workbench's dropped screw), resident hints for Robbie's barn spot.
- [ ] Implement.

### Task 26: M3 sign-off (Haiku)

- [ ] Full suite, build sizes (family chunk under 100 kB), grep proof, privacy scan, pictures of the barn, yard and the whole lot from the dollhouse. **M3 ends: owner's yes to merge.**
