# The Old House's East Wing: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or superpowers:executing-plans). Steps use checkbox syntax. Read `docs/superpowers/specs/2026-11-22-old-house-wing-design.md` first; this plan builds exactly that, and the spec wins where they differ.

**Goal:** Five new rooms in the Old House (living room, solarium, bathroom, kids' room, and a secret wonder room), in a new east wing, with 13 new discoveries, 2 golden mice, sunny slots and sofa naps, a cat tree and a crinkly tunnel, all inside the budget, in three mergeable milestones.

**Architecture (the short version):**
- **Data first.** The wing's rooms, stairs, doorways, windows, lamps, furniture and moves live in new pure-data files (`housewingplan.js`, `housewingmoves.js`, `housewingthings.js`) that the old plan files concatenate in with one-line seams. Drawing is in `housewingparts.js`, run-time finds in `housewingfinds.js`. Old files change by seams only, to keep the merge with house-beauty (which edits `houseparts.js` and `houseplan.js`) small.
- **Zone drawing** (new in `src/houselevels.js` plus tags in `house.js`): the engine that keeps the wing's walls and furniture out of the budget unless she is near.
- **Start-up chunk gets seams only**: award key, goal rows, phrase lines, two gold rows, word keys. Cap +0.8 kB gz.

## Order of work (binding)

1. Branch `house-beauty` is being built in parallel and edits the same house files. **This plan starts only after `house-beauty` has merged into `main`.** Task 1 rebases `house-wing` on that main (`git rebase main`, resolving conflicts in favour of main for anything beauty touched, then re-running the house tests) and **re-takes every baseline**. If the numbers moved, the limits in the spec move with them and the owner is told before Task 2.
2. Nothing is merged or pushed without the owner's yes. Each milestone ends with a report, pictures and a question.

## Global Constraints

- **Work only in** `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.worktrees/house-wing`, on branch `house-wing`, with absolute paths. Never write in, or run git or npm in, the main checkout. Never merge, push or stash. Never read `.env*`. No database work (offline-first).
- **Commits:** `git add <exact paths>`, never `-A` or `.`. Messages start "Old House wing: " and end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Models:** builders Sonnet; Haiku for look-ups and test runs; Opus for the Task 3 zone engine review and each milestone's final review (owner's model routing: one or two builds at a time).
- **Tests:** run a task's own files during the task, `npx vitest run test/<file>`; the controller runs the full suite at each milestone end. Tests check behaviour, never source text (no `readFileSync` of `src/`). Whole-walk tests carry 60 to 90 s timeouts; a file over 30 s goes into `test/heavy.js` `HEAVY_COST`. Float fixtures use `closeDiffs`. A test that builds a scene stubs `document` as `test/flattrace.test.js` does and uses `await import(...)`.
- **Bytes:** `npm run build 2>&1 | grep -E "^start-up|^  house "`. Task 1 records `S0` (start-up, expected about 704.8 kB) and `H0` (house chunk, expected about 34.5 kB). Every task reports both. Caps: start-up at most **S0 + 0.8 kB** in all, house at most **H0 + 18 kB and under 55 kB**. Over a cap: stop and report; never trim silently. Outside tests, the picture page and `src/world/areas.js`, nothing imports `src/world/housewing*.js` except `house.js`.
- **Words:** every child-facing word goes through `phrase()` or `words()`; no series word in a string literal outside the tables; `test/clanwords.test.js` stays clean. A task that adds a line refreshes snapshots with `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords` and then reverts every change that is not its own (in particular the spurious `notReached` entries in `test/fixtures/series-words-on-source.json`).
- **Determinism:** placements are data. Anything varied comes from `hash01(x, z, salt)` or the walk's salted streams, never `walkRng`, never `Math.random` in `src/world/housewing*.js`. `test/fixtures/flat-trace.gameplay.json` must not move: after each task `git status --short test/fixtures` shows only intended snapshot files. No other place's walk, draws, goals, golden mice, map or look may change.
- **Ground:** one walkable height per spot. Climbing is ledges joined by traversal moves. A hop changes height by more than 0.5 (`LEVEL_TOL`) and by at most 1.5 down or up.
- **Shared files** (`walk.js`, `main.js`, `progression.js`, `goldmice.js`, `goals.js`, `discoveries.js`, `hud.js`, `clanphrases.js`, `clanwords.js`, `offclanwords.js`, `interactions.js`): the smallest edits; other branches change them too.
- **Real-game and picture checks:** dev server on port **5405**, `npx vite --port 5405 --strictPort`; the game stays muted (seed `muted: true`, Chrome with `--mute-audio`, never press M).
- **Spec values, verbatim:** "A child finds something within the first minute"; "Every room has something to do. No room is just a corridor."; "If the camera ever shows a wall instead of the cat, the house has failed. That holds for any room, any corner and either player."; "Stairs, doorways and climbs must work with the same thumb controls as outdoors. No precise jumps."; "The house must not be the place that stutters."; "No ghosts, no jump scares, no pitch-dark rooms."; budget ceilings 450 meshes, 380 casters, 70,000 triangles at the worst spot, aims 300 / 200 / 55,000 for her cat alone.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/world/housewingplan.js` | create | Wing rooms, stairs, doorways, windows, lamps, furniture, ledges, secret wardrobe record. Pure. |
| `src/world/housewingmoves.js` | create | Wing climbs, drops, hops, tunnel, perches, routes. Pure. |
| `src/world/housewingthings.js` | create | Wing finds, golden mice, mice, hides, yarn spots, scenics, slots, nooks, hints, map shapes. Pure. |
| `src/world/housewingparts.js` | create | Draws the wing's pieces (sofa, bunks, tub, tree, tunnel...), sun patches, decals. |
| `src/world/housewingfinds.js` | create | The 13 discoveries at run time; the nap trigger; the wardrobe swing. |
| `src/world/houseplan.js` | modify | Seams: concatenate wing rows into rooms, stairs, doorways, windows, lamps, furniture; bounds; zone list; wardrobe lintel. |
| `src/houselevels.js` | modify | Zone drawing (`zoneAt`, `fullZones`), old behaviour unchanged for old levels. |
| `src/world/house.js`, `houselife.js`, `housemoves.js`, `housethings.js`, `houseair.js`, `housesound.js`, `housetour.js` | modify | Seams: build the wing, tag zones, run its finds, sound and air, shots and tours. |
| `src/game/interactions.js`, `src/rests.js` | modify | One seam: a rest may carry `y` (offered only when her feet are at least that high), so the sofa seat is a nap spot only on the seat. |
| `src/discoveries.js`, `src/ui/hud.js`, `src/goals.js`, `src/goldmice.js`, `src/clanphrases.js`, `src/clanwords.js`, `src/offclanwords.js`, `src/tutorialwords.js` | modify | `housewing` award, labels, goal rows, 2 gold rows, lines, word keys. |
| `src/ui/minimap.js` | modify | M3 only: a version check so revealed shapes redraw. |
| `verify-house.html`, `test/helpers/housewalk.js`, `test/helpers/housebudget.js` | modify | Shots and tours, the zone measure. |
| `test/housewingplan.test.js`, `housezones.test.js`, `housewingmoves.test.js`, `housewingfinds.test.js`, `housewingcamera.test.js`, `housewing.save.test.js`, `housewingcowalk.test.js`, `housewingwords.test.js` | create | The tests named below. |

**Names:** **zone** = rooms drawn together (`east`, `kids`, `wonder`, plus the four old levels). **slot** = a sunny patch. **find** = a discovery; wing find ids are in the spec's table; pay keys `house-find-<id>`.

---

## Milestone 1: the shell, and three furnished rooms (mergeable)

Result: the wing exists. Living room, bathroom and kids' room furnished and climbable; the solarium an empty glass room (rug, plants, wicker chairs, no slots yet); the wonder room does not exist yet; zone drawing keeps the budget; the camera is never lost.

### Task 1: Rebase, baselines, and the headroom note

**Files:** none new (reports only).
- [ ] Confirm `house-beauty` is merged to `main` (`git log main --oneline | head`). If not, **stop** and report.
- [ ] `git rebase main` in the worktree; `npm ci`; run `npx vitest run test/house*.test.js test/budget.test.js test/areas.test.js test/lazybuild.test.js`; all green.
- [ ] Take baselines and put them in the task report: `S0`, `H0`; `BUDGET_LOG=1 npx vitest run test/housebudget.test.js --reporter=verbose` (the worst-spot lines for day and dusk, fixed set, per-level detail and stand-in); the `fixed` breakdown by child (walls per level, hedge, stairs).
- [ ] Compare to the spec's table (day ground 63,292 / dusk 63,729; fixed 46,896; walls 8,676). Report the new **headroom** (70,000 minus the new worst spot). **If headroom is under 4,000, tell the owner** and use `ZONE_NEAR = 2` (see the spec) before Task 3.
- [ ] Commit nothing. Report numbers.

### Task 2: The wing's plan data (rooms, stairs, doorways, lamps, bare furniture)

**Files:** create `src/world/housewingplan.js`, `test/housewingplan.test.js`; modify `src/world/houseplan.js` (seams only), existing tests that count rooms.

Tests first (`test/housewingplan.test.js`, headless, no THREE):
- [ ] `no two rooms overlap, and every x, z has one level` (all rooms, wing and old; stair rectangles do not overlap rooms except at their mouths).
- [ ] `the wing's stairs rise at 1 in 3 or gentler` (0.286 and 0.30) and `their mouths meet room edges` (wing stair 30,7 to 38.4,7; wonder stair 46.4,2 to 46.4,-4 is added in M3, so this test lists only the wing stair in M1).
- [ ] `doorways are on shared edges and clear`: D1 at parlour east z 10.2, D2 at x 22 z 7, D4 at kids/bath z 2 x 41; no furniture footprint within 0.9 m of a doorway or the wing stair's mouth (reuse houseplan.test.js's rule).
- [ ] `every wing piece is inside its room`, and `the front door's arrival spot and the old rooms' furniture are unchanged` (a hash of the old rows).
- [ ] `HOUSE_BOUNDS` covers the wing; `levelAt` works for every new room.
- [ ] Update existing assertions that count rooms (7 to 10 in M1; the wonder room joins in M3) and stairs (4 to 5), with a comment saying why. No other assertion changes.

Implementation:
- [ ] `housewingplan.js` exports `WING_ROOMS` (`livingroom`, `solarium` on `ground`; `kids`, `bath` on `upstairs`), `WING_STAIRS` (`wing`), `WING_DOORWAYS` (D1, D2, D4), `WING_WINDOWS` (living south x2; solarium south x3, east none (stair), north x2, as wide as the 4 m section allows, sill 0.3, head 2.6; kids east and south; bath north frosted), `WING_LAMPS` (one per room, clear of doors), `WING_FURNITURE` (data rows in `piece()` shape: living room sofa, coffee table, shelf, tank, rug, lamp, plant; kids' room bunk, bunk-low, desk, chest, shelf, rug, fort; bath tub, sink, toilet, basket, mat; solarium chairs, plants, bird bath, rug), `WING_ZONES`.
- [ ] `houseplan.js`: `HOUSE_ROOMS = frozenAll([...OLD, ...WING_ROOMS])` and the same for stairs, doorways, windows, lamps, furniture; `HOUSE_BOUNDS.maxX = 52` (the wonder room in M3 reaches 52); export zones.
- [ ] Run `npx vitest run test/housewingplan.test.js test/houseplan.test.js test/houseroom.test.js test/housethings.test.js test/housewalls.test.js`.
- [ ] Bytes (start-up must not move). Commit "Old House wing: the plan data".

### Task 3: Zone drawing (the engine; the riskiest task, Opus review)

**Files:** modify `src/houselevels.js`, `src/world/house.js`, `test/helpers/housebudget.js`; create `test/housezones.test.js`.

Tests first:
- [ ] `the old levels behave exactly as before`: every case in `test/houselevels.test.js` still passes, unchanged.
- [ ] `her zone is drawn in full, a joined zone only within ZONE_NEAR of its doorway or stair, every other zone as its stand-in`.
- [ ] `zoneAt is by x, z, not by height`: a spot in the living room reads `east`, the hall `ground`, the kids' room `kids`, with equal paws heights.
- [ ] `settles at once on a resume` (like `settles on the nearest level at once`).
- [ ] `a partner in a stand-in zone is still drawn`.
- [ ] `the stand-in costs at most 120 triangles, no casters` for each wing zone.
- [ ] A measure: `test/helpers/housebudget.js measureHouse` learns zones (`houseZone` tags beside `houseLevel`), `at(zoneId)` returns her zone's total, the joined near zone included.

Implementation:
- [ ] `houselevels.js`: `createLevelDrawing` takes zones; `zoneAt(x, z)` from rooms; rule 3 and 5 of the spec; update on position, not only height; old levels' code path untouched.
- [ ] `house.js`: wing walls go in groups `houseWalls:<zone>` tagged `houseDetail`/`houseLevel:<zone>` (so their meshes toggle) while the old walls keep their fixed groups; each wing zone gets a stand-in box (`houseSimple`).
- [ ] Opus review of the engine: it is the only place that can silently break the old house (and the budget).
- [ ] `npx vitest run test/housezones.test.js test/houselevels.test.js test/housebudget.test.js test/houseload.test.js`. Commit.

### Task 4: The shell drawn: walls, glass, stairs, doors, floors, lamps, the outside look

**Files:** modify `src/world/house.js`, `houseparts.js` (dispatch line only), create `housewingparts.js` (walls' dressing, the solarium's glass, the stair gallery's roof-less look, lamps); `test/housewingshell.test.js`.

Tests first:
- [ ] `the wing's wall sections sink and rise like the old ones` (the existing `createWallSink` on the wing's sections; panes hide with their wall).
- [ ] `the parlour's east wall has the doorway and is otherwise unchanged` (section ids and lengths of the old walls other than parlour-east are equal to before).
- [ ] `the wing stair is walled like the others, slope 0.286, `wallFeet` do not raise the lawn beyond 0.3 m from its walls.
- [ ] `the wing builds with the headless document stub` (smoke) and `disposes` (no leaked geometry: the existing load test).
- Implementation: wing floors (tile, boards, rug zones), skirts, wall atlas tiles added to the one house atlas (no new texture), glass solarium sections: panes as one merged mesh per wall, lamps with dusk pools clipped to their rooms (`lampPoolClip`), outside look (a gable on the living room is a wall-top mesh, no roof draws over the interior).
- [ ] Bytes. Commit "the shell".

### Task 5: The living room, the kids' room and the bathroom furnished (and the per-zone budget)

**Files:** modify `housewingparts.js`, `houseparts.js` (atlas-tile additions only), `test/housebudget.test.js`.

Tests first (extend `test/housebudget.test.js`):
- [ ] `each wing zone's full set is within its limits`: east 5,400 / 45 / 25, kids 5,400 / 50 / 30 (triangles / meshes / casters), measured as the zone alone.
- [ ] `every zone's worst spot, day and dusk, with Mochi, is at most 63,000 triangles, 330 meshes, 190 casters`, and **`the old worst spot did not grow`** (the old ground's figure equals Task 1's, to the triangle).
- [ ] `a stand-in costs less than the detail it stands for` for the wing's zones (the existing stand-in test pattern).
Implementation: sofa (armchair parts widened, seat ledge 0.55, back as a collider piece, arms), coffee table, shelf with plant, fish tank (box plus a bubble sprite pair, in-budget), kids' bunk (bed parts, four posts, ladder, two ledges at 0.55 and 1.55), single bed, desk, chair, chest, fort (a tent of three planes that fades), tub (rim ledge 0.6, inner dip drawn dark), sink, toilet, basket, mat.
- [ ] Every piece goes through `mergeStaticProps`; a piece over 400 triangles gets a comment in its function.
- [ ] Commit "the furnished rooms".

### Task 6: What the cat can do in M1's rooms: climbs, nap spots, knock-overs, boxes

**Files:** create `src/world/housewingmoves.js`, `housewingthings.js` (M1 part); modify `housemoves.js`, `housethings.js`, `house.js`, `src/rests.js`, `src/game/interactions.js`; create `test/housewingmoves.test.js`; extend `test/housemoves.test.js`.

Tests first:
- [ ] `the sofa, the bunks and the bath rim are reachable by hops from the floor with no skills`: floor to seat to arm to shelf; floor to lower bunk (0.55) to top bunk (1.55) and back by short steps; bath mat ramp to rim to tub. Every hop's take-off is walkable (existing `housemoves.test.js` pattern, reused).
- [ ] `no precise jumps`: the autopilot `createHousePilot` with the jump button alone completes each route.
- [ ] `a nap rest with y is offered only on the seat` (`test/rests.test.js` or `interactions` test: rest at the sofa seat is not offered from the floor in front; the existing rests without `y` behave as before).
- [ ] `the knock-overs are on perches, use existing kinds only` (`cup`, `can`, `book`, `flowerpot`), each fallTo clear on its floor.
- [ ] `boxes`: the fort and the laundry basket are in `areaData.boxes`, and the `sits` goal counts them.
Implementation: moves, perches (`living-coffee`, `kids-desk`, `bath-sink`, `bath-cistern`, `kids-sill`), knockables (6), rests (sofa seat `y` 0.5, plus `nap` on the kids' rug), boxes, the seam in `restInReach` (offered when `s.rests.nearest(...)` item has no `y` or her paws are at `y` or higher).
- [ ] Bytes (interactions.js and rests.js are start-up: report the delta, expect under 0.05 kB). Commit.

### Task 7: Camera cases for the wing

**Files:** create `test/housewingcamera.test.js`; modify `test/heavy.js`.

Tests (these are the point; the task is mostly tests, with fixes where they fail):
- [ ] The existing "never lost" sweeps, run over the wing's flood: `houseFlood` from the spawn reaches the wing (the doorway), every cell, 8 directions, all four view steps (re-run as part of `housecamera.test.js`, now bigger).
- [ ] `the bathroom's four corners at the lowest pitch, with the tub and cistern fading`.
- [ ] `the blanket fort: she is seen inside at every view step; its roof fades when the line passes`.
- [ ] `the bunk: both bunks' ledges, every cell, all view steps; the camera never jumps climbing from the floor to the top bunk` (eased).
- [ ] `the wing stair at every view step, up and down, eased`.
- [ ] `the solarium's glass walls sink with their panes`.
- [ ] Raise `HEAVY_COST` for `housecamera.test.js` to the measured seconds.
- [ ] Commit "wing camera tests (and fixes)".

### Task 8: Goals, the corner map, scenics

**Files:** modify `src/goals.js` (nothing for M1 other than letting the house list `sits`), `housethings.js`, `test/housethings.test.js`, `test/housegame.test.js` as needed.
- [ ] Tests first: `HOUSE_GOAL_TYPES` has `sits` and the goal is completable (a box exists); `houseMapShapes` includes the wing's rooms, stairs and walls, and the map's bounds contain them; the minimap draws without error (`ui/minimap` test).
- [ ] Scenics `sunroom` and `bunks` (labels from the tables; lines in Task 10's table if M1 ships before M2, labels are plain words now).
- [ ] Commit.

### Task 9: Pictures and the M1 report

**Files:** modify `src/world/housetour.js`, `verify-house.html`, `test/housetour.test.js`.
- [ ] Shots `wing-outside`, `living`, `solarium-bare`, `bath`, `kids`, `bunk-top`, and the tour `wing-m1` (30 s): parlour door, living room, sofa hop, through the solarium, up the stair, the kids' room, bunk climb, bath, zoom out.
- [ ] Take pictures on port 5405 (day and dusk); before and after pictures of the parlour, the house from the south and the east, and the dollhouse at Farther.
- [ ] Full suite green (controller). Report `S0`, `H0` and the new numbers, per-zone budgets, the worst spot before and after.
- [ ] **Ask the owner** for the yes to merge M1 (pictures, the sofa seat, the bunk climb).

---

## Milestone 2: the solarium's slots, and the 13 discoveries (mergeable)

Result: sunny slots to lie in; 8 of the 13 discoveries (`sofa`, `fishtank`, `sunslot`, `sunall`, `bathtub`, `tap`, `bunk`, `fort`; the wardrobe and the wonder room's four come in M3), the words in both sets, one golden mouse (the top bunk; the crown's comes in M3), goals, hints data, the co-walk checked.

### Task 10: The words

**Files:** modify `src/clanphrases.js`, `src/clanwords.js`, `src/offclanwords.js`, `src/tutorialwords.js`; create `test/housewingwords.test.js`.
- [ ] Tests first: every wing find has a line for both word sets (`phrase()` per id, under each set); the word keys `kids` and `wash` exist in both sets and differ; no series word is a string literal in `src/world/housewing*.js`.
- [ ] Add the lines for the finds that M2 ships (spec table: `sofa`, `fishtank`, `sunslot`, `sunall`, `bathtub`, `tap`, `bunk`, `fort`), scenic and yarn labels, the goal text, the hint lines. Ids `house.find.<id>`, `house.scenic.sunroom`, `house.scenic.bunks`, `house.yarn.living`, `house.hint.*`.
- [ ] Refresh snapshots as the Global Constraints say. **Start-up bytes:** report; if the lines push over **S0 + 0.8 kB**, stop and ask about the lazy table (open question 7).
- [ ] Commit.

### Task 11: The award, the goal row, and the labels

**Files:** modify `src/discoveries.js`, `src/ui/hud.js`, `src/goals.js`, `src/progression.js` only if `EXTRA_FEAT_TYPES` needs it (it does not: `AWARDS` keys are feat keys).
- [ ] Tests first: `AWARDS.housewing` is 8; `feats.housewing` round-trips through `save`/`load`; `discoveryText({type:'housewing', label})` returns the label (as `housefind`); the HUD shows it without the type's name; the goal "Find 2 things in the new rooms" is only drawn for an area whose `goalTypes` has `housewing`, never in another place's pool (`goals.test.js` pool test).
- [ ] Add the `savefixture` assertion: the 2026-11-19 fixture loads and `feats.housewing` reads 0/absent.
- [ ] Bytes (start-up). Commit.

### Task 12: The finds engine

**Files:** create `src/world/housewingfinds.js`; modify `houselife.js`, `house.js` (hand over the find list and parts); create `test/housewingfinds.test.js`.

Tests first (modelled on `test/housefinds.test.js`):
- [ ] Each of the finds M2 ships pays once a walk with the right line, `awardOnce` key `house-find-<id>`, type `housewing`.
- [ ] `nap trigger`: still within r of the slot or seat for the hold (sofa 3 s, slot 4 s), speed under `STILL`; moving resets; a second slot adds a paw; `sunall` needs all four in one walk.
- [ ] Triggers `stay`, `arrive`, `along` reuse `housefinds.js`'s code, not a copy (import the helpers; the old six unchanged, their tests untouched).
- [ ] `a walk picked up again pays nothing twice`.
- [ ] `a partner's hold pays this child too, once-only finds are done for both` (`housewingcowalk.test.js`, below).
- [ ] `update allocates nothing per frame unless something happens`.
Implementation: one watcher per cat (as `createHouseFinds`), the new `nap` trigger, parts (tank bubbles, tap drip, the dent, the fort's glow), reduced-motion respected.
- [ ] Commit.

### Task 13: The solarium's slots, sun, calm and dusk

**Files:** modify `housewingparts.js`, `houseair.js`, `housesound.js`, `housewingthings.js`; extend `test/houseair.test.js`, `test/housesound.test.js`; add slots to `test/housewingplan.test.js`.
- [ ] Tests first: four slots, 1.2 m across, floor clear, inside the room, none under furniture; each is a `nap` rest (`mesh: false`); by day the patch is gold, at dusk pale blue (decal colour per light, from `dusk` flag); lying in a slot (a `calm` flag from the finds) slows the motes by half and softens the tick; reduced motion: no pulse.
- [ ] Sun patches: one decal mesh for the room (4 quads, additive, `noCast`), at most 40 triangles; dust motes in the solarium.
- [ ] Commit.

### Task 14: Mice, golden mice and yarn

**Files:** modify `housethings.js`, `src/goldmice.js`, tests `goldmice.test.js`, `housethings.test.js`.
- [ ] Tests first: `gm-house-5` on the kids' top bunk (0 y on ledge, reachable by the bunk route in at most 3 hops with no skills, 2 m from other collectibles and 3 m from yarn spots); `GOLD_TOTAL` 46 in M2 (47 after M3); `HOUSE_GOLD_MICE` equals `GOLD_MICE.house`; the old save fixture loads.
- [ ] Two new mouse rows with hides; two yarn spots (`living`, appended).
- [ ] Commit. (`gm-house-4`, the crown, comes in Task 21.)

### Task 15: Co-walk across floors, and the pad

**Files:** create `test/housewingcowalk.test.js`; modify `test/helpers/housewalk.js`.
- [ ] Tests: two cats; one in the kids' room, one in the living room (different zones, different heights): both drawn, the partner's name tag over the walls, the fixed set within budget; a find by either pays both (once-only done for both); a partner in a stand-in zone is visible; reduced motion.
- [ ] `a pad-style walk (stick, jump, interact only) reaches every M2 find and the golden mouse` using the existing stick-only autopilot.
- [ ] `no new data-pad-layer` is needed: assert no new HTML node is created by the wing's finds (the existing overlay test pattern).
- [ ] Commit.

### Task 16: The old cat's hints and the outfit nooks (data only)

**Files:** modify `housewingthings.js`, test `housewingplan.test.js`.
- [ ] `HOUSE_WING_HINTS`: one line per wing room pointing at a find she has not made, one cryptic one for the wonder room (shipped but unreachable until M3); every hint names a real room and a real find (test).
- [ ] `HOUSE_WING_NOOKS`: four nooks, each reachable (`test/helpers/findreach.js`), resting on a mesh (ray down), 3 m from yarn spots, 2 m from golden mice. **No spots file for the house is created.**
- [ ] Commit.

### Task 17: M2 budget, bytes, pictures, report

- [ ] `housebudget.test.js` with everything on (finds' parts, slots, mice, golden mouse); the aims and ceilings; two dressed cats in the worst wing room (the owner's 78,000 accepted case); Bytes; the full suite (controller).
- [ ] Shots `solarium-day`, `solarium-dusk`, `sunslot` (Close), `sofa-nap`, `fish`, `tap`; tour `wing-m2` (45 s).
- [ ] **Ask the owner**: merge M2? (slots, naps, word lines, coin amounts 8 and 12, 2 golden mice).

---

## Milestone 3: the secret wonder room (mergeable)

Result: the wardrobe, the secret stair, the wonder room, the tree, the tunnel, the toys, the last finds, the crown's golden mouse; the whole wing inside the budget.

### Task 18: The secret stair, the wardrobe and the room's plan data

**Files:** modify `housewingplan.js`, `houseplan.js` (the wardrobe lintel seam); tests `housewingplan.test.js`, `housesecret.test.js` pattern.
- [ ] Tests first (modelled on `test/housesecret.test.js`): the wonder stair climbs 1.8 m over 6.0 m (0.30), from the kids' north wall (46.4, 2) to the room's south edge (46.4, -4); the kids' north wall has the opening only when the secret stair exists, and no other wall changes; shut, the wardrobe's colliders close the opening; open, she walks through and up; she can never be trapped (the stair's foot and top are both in rooms with doors); the wardrobe's lintel sinks to nothing.
- [ ] `SECRET_WARDROBE` (shape of `SECRET_BOOKCASE`), `wardrobeColliders(open, into)`, the wonder room (11 x 10, attic level, round-window porthole), its lamp, `WING_ZONES.wonder`, `HOUSE_BOUNDS.maxX` to 52.
- [ ] Update room and stair count assertions (10 to 11, 5 to 6) with comments.
- [ ] Commit.

### Task 19: The wonder room drawn and its things (tree, tunnel, post, wand, castle, string lights)

**Files:** modify `housewingparts.js`, `housewingmoves.js`, `housewingplan.js`; extend `test/housewingmoves.test.js`, `test/housebudget.test.js`.

Tests first:
- [ ] `the cat tree's four levels are reachable by hops from the floor with no skills, hops of 0.55 to 0.6, drops back in short steps; the hammock leap lands (1.5 m, rise 0.6 or less)` (traversal data tests).
- [ ] `the tunnel has two open mouths and is never a trap` (both ends connected to the floor; width at least 0.55 m for her widest cat, a Maine Coon at 1.3 scale, using `CAT_SCALE_MAX`; the walk in and out for every breed in `houseguards.test.js`'s list).
- [ ] The `wonder` zone's limits: 3,600 triangles, 35 meshes, 20 casters; stand-in under 120.
- [ ] `the feather wand moves only when she is within 1.2 m and allocates nothing otherwise`.
Implementation: cat tree (four ledge squares, a trunk, sisal wrap, hammock), the tunnel (two collider rows with `fadingLedge` rings; slows her to 0.75 inside), post, wand on a beam, castle box (`boxes`), string lights, round skylight pool, second yarn spot `wonder`, catnip decor.
- [ ] Bytes. Commit.

### Task 20: The gate: the wardrobe discovery, the swing, the map reveal, the clues

**Files:** modify `housewingfinds.js`, `houselife.js`, `house.js`, `src/ui/minimap.js` (version check), `housewingthings.js`; tests `housewingfinds.test.js`, a minimap test.

Tests first:
- [ ] `staying at the shut wardrobe 0.8 s swings it open away from her (from the stair side too), pays `wardrobe` once, plays the chime; the swing's colliders swap in the walk's live list; it stays open this walk; a walk picked up again finds it shut and opens again`.
- [ ] `the wonder room and its stair are not in the corner map until open, then they are` (`areaData.mapShapes` unchanged at start; revealed shapes appended and the minimap redraws).
- [ ] `a partner's hold opens it for her too`.
- [ ] `the clue: the faint crinkle and the light under the door play when she is within 2 m, not when it is open`.
- [ ] `the wonder zone is not a neighbour of the kids' zone until the wardrobe is open` (rule 5), and `a cat that gets there is drawn`.
- [ ] Commit.

### Task 21: The wonder finds and the crown's golden mouse

**Files:** modify `housewingfinds.js`, `housewingthings.js`, `src/goldmice.js`, `clanphrases.js`; tests `housewingfinds.test.js`, `goldmice.test.js`, `housethings.test.js`.
- [ ] Tests first: `tunnel` (exit the far mouth), `treetop` (arrive at the crown), `scratch` (stay 1.5 s), `feather` (pounce) each pay once; `wardrobe` pays 12; `gm-house-4` on the crown (`GOLD_TOTAL` 47; the lists equal); the old cat's cryptic hint appears only after the kids' room is seen (data check).
- [ ] Lines for the four finds in both sets; snapshots.
- [ ] Commit.

### Task 22: Camera cases for the wonder room; the full budget; the chunk decision

- [ ] Tests (extend `housewingcamera.test.js`): the tunnel (seen inside at every view step), the tree's four platforms hop to hop (eased, never jumps), the crown at the lowest pitch, the wonder stair shut and open at every view step, a partner in the wonder room while she is in the kids' room.
- [ ] Budget: every zone and spot; day and dusk; wardrobe shut and open; Mochi; two dressed cats; the aims for her cat alone. `HEAVY_COST` updated.
- [ ] Bytes: if the house chunk is over 70 kB gz, move `housewingparts.js` and `housewingfinds.js` behind a dynamic `import()` in `house.js` (and list them in `areas.js`'s prefetch source list); otherwise **no second chunk**. Report the decision with numbers.
- [ ] Commit.

### Task 23: Pictures, film, the owner's hand test, the report

- [ ] Shots `wardrobe-shut`, `wardrobe-open`, `wonder`, `tree-crown`, `tunnel`, `wonder-outside`; the film `wing` (30 to 45 s, the full spec list); before and after pictures (parlour, house from the south and east, dollhouse at Farther) refreshed.
- [ ] `npm run build`; full suite; `git status --short test/fixtures`.
- [ ] **Ask the owner** for the yes to merge M3, and for his and his daughter's sign-off on the pictures.

---

## What the owner tests by hand (after each milestone)

**M1** (desktop, then iPad and iPhone): from the parlour's east doorway into the living room; hop on the sofa and lie down (E); through the solarium; the covered stair; the kids' room; climb the bunks to the top; the bathroom; zoom to Far in each room; any wall in the way of the cat is a failure. Frame rate stays smooth in the wing and in the hall.
**M2**: the four sunny slots at day and at dusk (lying in them feels calm); the toasts and coin amounts; the fish tank, the tap, the fort; a co-walk with one child upstairs and one in the living room; the pad (every find reachable).
**M3**: finding the wardrobe without being told (is the clue enough? does the old cat's line help?); the wonder room's tree, tunnel and toys; the secret never feels like a trap; zoom out in the wonder room; the crown mouse.

## Risks

1. **Zone drawing** can break the old house's drawing or leave a wing room with missing walls (Task 3): old-level tests unchanged; Opus review; the picture check from every doorway.
2. **Budget after house-beauty**: headroom may be lower than 6,300; the limits move (Task 1) or `ZONE_NEAR` shrinks.
3. **Camera in tight rooms and in the tunnel and fort** (Tasks 7, 22): the flood tests multiply; `housecamera.test.js` runtime grows; rings and fort roofs must fade.
4. **Merge conflicts with house-beauty** in `houseplan.js` and `houseparts.js`: wing data lives in new files and only seams touch the old ones; rebase in Task 1, again before each merge.
5. **Start-up bytes**: 15 kB left, and the owner never raises it; lines, an award key, a goal row, two gold rows, a word key pair cost about 0.6 to 0.8 kB (cap 0.8); the lazy table is the fallback.
6. **The nap seam in `interactions.js`** (shared, hot code): a `y` filter is one condition; its test guards every old rest.
7. **The secret feels like a trap or is never found**: the stair's foot is in a room with a door; the clues and hints in M3; the owner's test.
8. **The minimap's one-time read** (Task 20): needs a version check.
9. **The golden count**: any place that prints "of 45" changes to 47 (a grep test).
10. **Old iPads**: the stand-ins and the zone rule are the defence; the owner's iPad reading at M1 and M3.
11. **`restSpot` on a resume** inside a stand-in zone: tested (a walk picked up again in the kids' room draws it in full).

## Open questions (my recommendation first)

1. **Coin amounts** for the 13 finds: **8 each, the wardrobe 12** (the old six pay 12). Alternative: 12 for all.
2. **Golden mice:** **add 2** (the top bunk, the cat-tree crown; 45 becomes 47). Alternatives: none, or three (one in the solarium).
3. **Old cat's friendship** needs **every** discovery and golden mouse in the house, wing included. Alternative: the original six and three only, with the wing as a bonus badge.
4. **Sun patches at dusk:** pale moon patches (recommended) or hidden.
5. **Is the wing too far east (x to 52)?** Alternative: shorten the stair by using the existing back-stair spot is impossible; the sprawl is the price of no stacked rooms. Recommendation: accept.
6. **The wonder room visible from outside** as a small windowless loft with a porthole (recommended, a mystery), or hidden entirely.
7. **Where the wing's phrase lines live:** in the start-up phrase table (recommended while under the cap) or a lazy table in the house chunk.
8. **Tunnel slowdown:** 0.75 speed inside (recommended) or none.
9. **Found outfit nooks:** data only now (recommended); build the house's spots file when the owner wants house outfits.
10. **Names** for the old cat's hint lines and the kids' room in the Clan words ("Twoleg kits' nest"): shown to the owner and his daughter with the pictures.

## Self-review (done while writing)

- Spec coverage: layout (Task 2, 4), zones (3), rooms (5, 6, 13, 19), discoveries (10-12, 21), secret (18, 20), mice and outfits (14, 16), goals and map (8, 11, 20), co-walk (15), hints (16), camera (7, 22), pad (15), save (11), words (10), tests per feature, pictures (9, 17, 23), budget (3, 5, 17, 22).
- Order: Task 1 gates everything on house-beauty. Milestones M1 (shell, three rooms), M2 (solarium, discoveries), M3 (secret room) each end green and mergeable.
