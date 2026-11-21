# The Old House, step 2: things to do — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every room of the Old House something to do, as the spec's "What there is to do" lists it (minus found outfits):
- three golden mice;
- six discoveries: the clock, the piano, the attic window, the bookcase with the secret stair behind it, and two more;
- knock-overs, mice in the pantry and the cellar, the yarn ball;
- two climbing routes up the furniture with the Rooftops moves.

It also gets daily goals and the corner map like every other place (owner, 2026-11-21), and dust motes, the clock's tick and creaks. All of it stays behind `?house=1`, Clan Edition only, solo, with no catalog row.

**Architecture:**
- **Climbable tops are ground.** A bookcase, wardrobe or window-seat top she can stand on is a raised flat strip of the house's ground over that piece's footprint, called a "ledge". This is how the Rooftops' roofs work: one height per spot, and nothing walks under a bookcase. The traversal moves (`src/traversal.js`) join ledges to the floor and to each other. Knock-over pieces (counters, the mantel) are ordinary perches (`src/climbing.js`).
- **Everything new is data or code in the house chunk.**
  - Placements are pure data: `src/world/houseplan.js` (ledges, the secret stair), `src/world/housemoves.js` (the moves and perches) and `src/world/housethings.js` (the mice, finds, map). The build hands them to the walk through `areaData`, the way the Rooftops hands over `traversal`, `perches`, `scenics` and `anchors`.
  - The house life runs the rest: `src/world/housefinds.js` (the discoveries), `src/world/housesound.js` and `src/world/houseair.js`.
- **Start-up learns the house only as data reads with fallbacks.** These are one-line seams:
  - `walk.js`: `areaData.goldMice`, `knockables`, `hides` and `yarnSpots`, and the life's arguments;
  - `goals.js`: `areaData.goalTypes`;
  - `ui/minimap.js`: `areaData.mapGround`;
  - `discoveries.js`, `ui/hud.js`: one award type;
  - `audio.js`: `tick()` and `creak()`;
  - `clanphrases.js`: the house's lines.

  Nothing in start-up names the house.

**Tech Stack:** Plain ES modules, Three.js 0.185, Vite 8, Vitest 4, headless Chrome through `scripts/record-page.mjs` (unchanged), ffmpeg.

**Spec:** `docs/superpowers/specs/2026-11-20-old-house-design.md`, "Build order" item 2. Sections used:
- "What there is to do" (all but found outfits);
- "The house" (the room table);
- "Goals";
- "Anti-goals";
- "Look and feel" (motes, creaks, the clock);
- "Fit with the game" (co-walk determinism, Clan Edition only);
- "Constraints".

Found outfits are step 4. The old cat is step 3.

**Read first:** the step 1 plan, `docs/superpowers/plans/2026-11-20-old-house-step1-house-camera.md`. Its "Updates (2026-11-21)" section (U1–U16) still holds: no symlink, rule S1, words in both sets, the flat-trace fixture, timeouts, port 5404, both builds. So do its rulings H1–H8 and the ledger's R1–R16 (`.superpowers/sdd/2026-11-20-old-house-step1-house-camera/progress.md`). This plan wins where they disagree.

## Rulings (my calls; the owner can overturn each)

- **D1. Climbable furniture tops are ledges, so they are ground, not perches.**
  - A row in `HOUSE_FURNITURE` gains `ledge: true`. `houseGroundSpec()` then adds a flat strip at `level y + h` over that piece's footprint.
  - A ledge piece has no colliders: the cliff at its edge stops her, as a roof's does.
  - Why: the traversal moves run from ground to ground (`traversal.js` reads every hop's end heights from `ground.y`), and a perch cannot carry a balance walk, a leap or a drop. Ground still has one height at each spot, and the floor under a bookcase was never walkable.
  - Cost: H3's worry comes back near ledges. With the camera over a ledge, the rock rule (`camzoom.js`) pulls the view in toward her. Review Focus 1 and Task 3 test it.
- **D2. Two climbing routes, and two short climbs.** Every move is one she has on her first walk: no `requires`, no Long Leap, no Spring Paws.
  - Climbs rise 1.5 m or less. Drops fall 1.5 m or less ("drop down in short steps"). Leaps are 1.5–3.0 m long with |rise| ≤ 0.6.
  - **Library:**
    1. floor → new library steps (0.9 m, beside the ladder) → north bookcase n2 (2.25);
    2. a balance along a shelf plank to bookcase n1;
    3. a leap across the corner to the west bookcase (golden mouse 1);
    4. a drop to a new stack of big books (1.0), then a drop to the floor.
  - **Bedroom:**
    1. floor → new linen chest (0.6) → new bookshelf (1.6);
    2. a leap to the wardrobe (2.05, golden mouse 2). This is the spec's "leap from the wardrobe to the bookcase top", both ways;
    3. drops back down by the chest.
  - **Short climbs:**
    - the attic's new window seat (0.5), under the round window;
    - the piano's keyboard (0.75), a ledge in front of the piano. The piano's body behind it becomes a ledge too, with no move onto it, so no collider pushes her off the keys.
  - Moved for it: the library's west bookcase slides north along its wall, between the windows, until the corner leap is 1.5–3.0 m.
  - Not built: the banister balance. The stairs are walled both sides, so there is no banister to walk.
  - Not built: hiding in the wardrobe. There is no hiding verb indoors.
- **D3. The levels are drawn for the floor under her.** House life passes `house.floor.y(x, z)` to the level drawing, not her paws' height. `house.floor` is `houseFloorGround()`, the ground without ledges.
  - Why: on the wardrobe (4.45 m) her paws are nearer the attic's floor (4.2) than the bedroom's (2.4), and the drawing would flip to the attic.
- **D4. Seven knock-over perches and six knockables of today's kinds.**
  - The perches (kind `'furniture'`, at their tops): both kitchen counters (0.92), the kitchen table (0.76), the parlour mantel (1.3), the hall console (0.8), the library desk (0.8), and the bed (0.6, just for the jump).
  - The knockables:
    - a cup on counter A, a can on counter B, a cup on the table;
    - a book on the mantel, a flowerpot on the console, a book on the desk.
  - Ids are `house-<kind>-<n>`. They are handed over as `areaData.knockables`, so nothing goes into `propsets.js`.
- **D5. Three golden mice, outside `GOLD_MICE`.**
  - `gm-house-1` is on the library's west bookcase, `gm-house-2` on the wardrobe, and `gm-house-3` is hidden on the cellar floor between the barrels and the crates.
  - They are handed over as `areaData.goldMice`, and `createGoldMice` takes an optional `list`.
  - `GOLD_MICE`, `KNOWN_GOLD`, `GOLD_TOTAL` (36) and `goldForEdition` do not change. `goldForEdition` counts any area missing from the catalog, so a `GOLD_MICE.house` entry would show 39 to every player, Legacy and the unflagged included.
  - A house mouse is saved in `state.golden` like any other (its id passes `GOLD_ID_PATTERN`), and it counts toward Whisker Sense's "Find 3 golden mice".
  - Child-visible: while the house is a developer switch, the home tally and the journal still read "of 36" and do not count it. Step 4 adds the count with the catalog row (owner question 2).
- **D6. Six discoveries, paid once a walk, with no button.**
  - They use a new award type, `housefind`: 12 🐾 (what a Farm or Fair find pays), once a walk, and the toast is its own whole line.
  - Each has a data spot and a trigger:
    - she arrives (the attic window seat);
    - she stays for a moment (the clock 1.0 s, the bookcase 0.6 s, the toy box 0.5 s);
    - she stays still (the cushion, 1.5 s);
    - she walks along (the piano).
  - The two extras:
    - **a cat-shaped dent in an old cushion** on the parlour hearth, which foreshadows the old cat ("someone else naps here too");
    - **a box of old toys** in the attic, whose lid tips and lets three little toys tumble out.
  - Why no E press: nothing to aim, so it is not fiddly on a phone. A child finds them by exploring, and step 3's hints point at them.
- **D7. The clock strikes the hour on her device's clock**, once for each hour, 1–12 times (15:00 strikes 3).
  - It strikes when she stays at its foot.
  - It ticks quietly whenever she is within 7 m.
  - It strikes again only after she has walked off and come back.
  - The time is local sound, not a placement, so co-walk agreement does not matter. Tests inject `now`.
- **D8. The piano plays a note for every key she steps onto**: eight keys, C4 to C5, west to east. Six different keys in one go plays a tune and pays.
- **D9. Step 2 builds the hidden passage: a secret stair from the library to the bedroom.**
  - `HOUSE_STAIRS` gains `secret`: (−6, 2) → (−6, −6.4), width 2.4, rising 2.4 m over 8.4 m (0.286), through the courtyard step 1 kept free for it. It arrives in the bedroom 5 m from the back stair's foot. That is the spec's "short shortcut … to the back stair": library, secret stair, back stair, attic.
  - A bookcase stands shut in the opening, with colliders across it. It swings 90° into the library on its west hinge when she stays within 1.1 m of it for 0.6 s, from either side. So coming down from the bedroom, she is never shut in.
  - It stays open for the rest of the walk. A walk picked up again finds it shut, and it opens again for her without paying twice.
  - Why: "the bookcase opening" onto nothing would be a discovery with nothing behind it.
  - Cost: new walls, a new stair in every camera test, and a fourth level link.
- **D10. Four mice: two by a new pantry cupboard in the kitchen, two in the cellar.**
  - The pantry is a tall cupboard on the kitchen's east wall with flour sacks beside it. The rooms stay as approved.
  - Each mouse's cover (`areaData.hides`) is in its own room, and no other cover on its level is nearer. A test proves a chased mouse never crosses a wall, because `critters.js` reads no colliders.
- **D11. Daily goals only from what the house can finish.**
  - `areaData.goalTypes = ['mischief', 'photo', 'play', 'scenic']`, so each day rolls three of "Knock 3 things over", "Take 2 photos", "Play with a yarn ball" and "Visit 2 special places". `goalFits` answers from that list when an area gives one.
  - Left out:
    - "Spot 4 animals", because a mouse that hides unseen cannot be spotted again that walk;
    - "Pounce on 2 animals", for the same reason;
    - the rest, which the house has nothing for.
  - The draw count stays at three. No other area gives a list, so every other place's pool is unchanged.
- **D12. The corner map is a floor plan on the lawn.**
  - `areaData.mapShapes` draws the rooms and stairs in the `'ledge'` tone and the walls as 0.5 m `'rock'` lines with the doorways left open.
  - `areaData.mapGround` is the lawn's green.
  - Split levels never overlap, so one flat plan holds every floor. Golden mice and finds are never on it. The three special places are.
- **D13. Three special places (scenics):** the grandfather clock, the fireside and the round attic window.
  - They pay 'scenic' for a visit, mark the corner map, and serve "Visit 2 special places" and photos.
  - A Gift Paws gift left at one is never found (no ghosts or strays indoors), as on the Rooftops. This is accepted.
- **D14. The yarn ball lies at one of two spots and stays in its room.**
  - `toy.update` reads no colliders, so a batted ball would roll through a wall. House life applies `toyStop` after it: a ball crossing a wall line anywhere but a doorway or stair mouth is stopped at the wall.
  - The shut bookcase counts as a wall.
- **D15. Sound under the existing switch.**
  - `audio.js` gains `tick(volume)` and `creak(volume)`, both through `tone()`, so `setMuted` silences them.
  - The clock's strike uses `playTune`, and the piano uses `musicBoxNote`.
  - Creaks:
    - on any stair, once every 1.4 m she climbs or goes down;
    - in the attic, once every 11 s while she walks, on a fixed schedule with no random draws.
  - All quiet.
- **D16. Dust motes in sunbeams are the house's own.**
  - They live in `houseair.js`, not `render/ambient.js`.
  - By day, every window but the cellar's throws one soft slanted beam into its room, with motes drifting in it.
  - There is one beam mesh and one points mesh per level, drawn only for levels in full.
  - None at dusk. Under reduced motion the motes hold still.
- **D17. The words are the same in both word sets.** Every new line is a `LATER` entry in `clanphrases.js` with no series word, so the everyday set takes the table's line. `offclanwords.js` gains nothing unless a line changes. The owner may want Clan flavour (question 4).
- **D18. Step 1's own house tests are edited only where step 2 changes what they promise.** Each edit is named in its task:
  - the record now has life, mice, goals and a map;
  - there are four stairs;
  - ledge pieces have no colliders;
  - the stair test opens the bookcase.

  No other existing test is edited, except the snapshot refresh (U4) and `test/housegame.test.js`'s goals and map line.
- **D19. Co-walk is ready, not done.** Every placement is data, and the bob phases, motes and creak schedule never draw on `walkRng`. The bookcase opens on each device for that device's cat. Step 4 makes it open for both.

## Questions only the owner can answer

1. **The two extra discoveries:** the cat-shaped dent in the hearth cushion and the box of old toys in the attic. Are they right? Would he like a third, for example a creaky floorboard in the bedroom that squeaks a little tune?
2. **The golden-mouse tally:** the house's three are found and saved now, but join the "of 36" count in step 4 with the catalog row (D5). Is that fine, or should the tally count them now for a device with `?house=1`?
3. **The clock:** it strikes the real hour, up to 12 bongs (D7). Or would he rather it always plays one short chime?
4. **Clan words:** the house's new lines read the same in both word sets (D17). Should his daughter's Clan words have their own flavour ("the Twolegs' tall clock")? If so, she and he can name them.
5. **The secret stair** opens when she stands at the bookcase (D9). Or would they rather she has to find one odd book and press it?

## Global Constraints

- **Work only in** `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/house`, on branch `house`. Use absolute paths.
  - Never touch the main checkout, or `.claude/worktrees/people` (another builder's).
  - Never merge, push or stash, and never read `.env*`.
  - Dispatch no subagents.
- **Commits:** `git add <exact paths>`, never `-A` or `.`. Every message starts "Old House step 2: " and ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tests:**
  - During a task, run only its own files: `npx vitest run test/<file> ...`. The controller runs the full suite.
  - Rule S1: tests check behaviour, never source text (no `readFileSync` of `src/`).
  - Whole-walk tests carry 60–90 s timeouts, and a file over 30 s goes into `test/heavy.js` `HEAVY_COST`.
  - Float fixtures compare with `closeDiffs`.
  - A test that builds a scene or a player stubs `document` as `test/flattrace.test.js` does, then uses `await import(...)`.
- **Bytes** (`scripts/buildjson.mjs`: start-up at most 700 kB gzipped, a place at most 100 kB):
  - Measure with `npm run build 2>&1 | grep -E "^start-up|^  house "`.
  - Task 1 records the baseline: `S0` for start-up, `H0` for the house chunk.
  - Every task's report gives both numbers and stays inside its own budget. In all:
    - start-up grows by at most **1.5 kB** over `S0`;
    - the house chunk ends at most **H0 + 18 kB** and under **45 kB**.
  - Outside tests, the picture page and `src/world/areas.js`, nothing imports a `src/world/house*.js` module.
  - `test/areas.test.js` and `test/lazybuild.test.js` pass.
- **Words:**
  - Every child-facing word goes through `phrase()` or `words()`, for both word sets.
  - No series word goes in a string literal outside the tables, and `test/clanwords.test.js` stays clean.
  - A task that adds a phrase refreshes the snapshots with `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`, then reverts every change that is not its own. In particular it reverts the spurious `notReached` entries in `test/fixtures/series-words-on-source.json` (U4).
  - Captions on the picture page and in the tours are plain words.
- **Determinism:**
  - Placements are data. Anything varied comes from `hash01(x, z, salt)` (`src/world/builder.js`) or the walk's own salted streams, never `walkRng` and never `Math.random` in `src/world/house*.js`.
  - `test/fixtures/flat-trace.gameplay.json` must not move: after each task `git status --short test/fixtures` shows only intended snapshot files.
  - No other place's walk, draws, goals, golden mice, map or look may change.
- **No people, no old cat, no found outfits.** `critterSpawns` holds only `'mouse'` rows. No house module imports `buildTwolegFigure`, `src/fairshow.js` or the villager.
- **Ground:** one walkable height per spot (`src/ground.js`). Climbing is ledges joined by traversal moves, plus perches. Ground is never stacked.
- **Spec values, verbatim:**
  - "**Golden mice** hidden around the house, using the existing golden-mice system (`src/goldmice.js`)."
  - "**Discoveries** (`src/discoveries.js`): the clock chiming the hour, a tune on the piano, the view from the attic window, and the bookcase opening. The builder adds two or three more in the same spirit, for example a cat-shaped dent in an old cushion or a box of old toys."
  - "**The yarn ball** lies somewhere each walk, as in every area."
  - "**Mice to chase** in the pantry and the cellar (`src/critters.js`)."
  - "**Knock-overs** on the kitchen counters, mantel and shelves (`src/knockables.js`, as in the den)."
  - "**Climbing routes** up the furniture, using the Rooftops moves (`src/traversal.js`): balance along a shelf edge or the banister, leap from the wardrobe to the bookcase top, drop down in short steps. Every leap lands, and nothing can go wrong, as on the Rooftops."
  - "A child finds something within the first minute: a golden mouse, a discovery, a climb." "Every room has something to do. No room is just a corridor."
  - "If the camera ever shows a wall instead of the cat, the house has failed. That holds for any room, any corner and either player."
  - "No ghosts, no jump scares, no pitch-dark rooms. The cellar is dim and friendly: warm lamp light, cobwebs, barrels, mice."
  - "Stairs, doorways and climbs must work with the same thumb controls as outdoors. No precise jumps."
  - "The house must not be the place that stutters."
  - "Warm wood, wallpaper, rugs, old lamps and dust motes in sunbeams." "Creaks and the clock ticking as quiet ambient sound, all under the game's existing sound switch."
  - "Golden mice, discoveries and finds follow the same two-player rules as outdoors: deterministic from the room seed, never from `walkRng`."
  - "the street ceiling of 450 meshes, 380 shadow casters and 70,000 triangles, measured at the worst spot in the house". Aim for 300 / 200 / 55,000, at every level, day and dusk.
  - "Offline-first: nothing contacts the database."

## Review Focus

1. **She stands on the floor with her back to a bookcase, the camera swung over its top.**
   - Expected: she is seen, and the view eases in without a jump.
   - Test: Task 3, `beside a ledge on the floor, she is seen and the camera never jumps`.
2. **A thumb holds the stick hard off the edge of a ledge or the piano keys.**
   - Expected: she stays on, and a marked way down is always within reach.
   - Test: Task 2, `pushing off any ledge's edge keeps her on it, and a way down is within 1 m`.
3. **The ball is batted hard at a wall, a corner, the shut bookcase or a doorway.**
   - Expected: it stops at the wall and rolls on through the doorway.
   - Test: Task 4, `a ball batted at any wall stops at it; through a doorway it rolls on`.
4. **A mouse is chased into a corner or toward a doorway.**
   - Expected: it never passes through a wall, and it ends hidden in its own room.
   - Test: Task 4, `the mice keep to their rooms`.
5. **A walk is picked up again on the wardrobe, on the secret stair, or after the bookcase opened.**
   - Expected: she is back on the wardrobe with upstairs drawn. The bookcase is shut but opens for her. Nothing pays twice.
   - Test: Task 6, `a walk picked up again pays nothing twice, and finds her where she was`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/world/houseplan.js` | modify | The secret stair, `SECRET_BOOKCASE`, `secretColliders`, ledge rows and new pieces, ledge strips in the ground, `houseFloorGround()`. Pure. |
| `src/world/housemoves.js` | create | `HOUSE_MOVES`, `HOUSE_PERCHES`, `HOUSE_ROUTES`, `houseMovesArea()`. Pure. |
| `src/world/housethings.js` | create | Golden mice, knockables, hides, mice, yarn spots, scenics, finds, goal types, map shapes, `toyStop`. Pure. |
| `src/world/housefinds.js` | create | The six discoveries at run time: triggers, animations, the bookcase's colliders, the pay. |
| `src/world/housesound.js` | create | The tick, the creaks. |
| `src/world/houseair.js` | create | Sunbeams and dust motes. |
| `src/world/houseparts.js`, `src/world/house.js`, `src/world/houselife.js` | modify | Draw the new pieces; hand the walk the new record; run the finds, sound, air and `toyStop`. |
| `src/game/walk.js`, `src/goldmice.js`, `src/goals.js`, `src/propsets.js`, `src/ui/minimap.js`, `src/discoveries.js`, `src/ui/hud.js`, `src/audio.js`, `src/clanphrases.js` | modify | One-line seams (Task 5), the phrases (Tasks 4, 6), the two sounds (Task 7). |
| `src/world/housetour.js`, `verify-house.html` | modify | New shots and tours; the page's walk things and `hud=1`. |
| `test/helpers/housewalk.js`, `test/helpers/housebudget.js` | modify | Moves, perches and the open bookcase; the walk's own things in the budget. |
| `test/housesecret.test.js`, `test/housemoves.test.js`, `test/housethings.test.js`, `test/housefinds.test.js`, `test/housesound.test.js`, `test/houseair.test.js` | create | The tests named below. |

**Names:**
- A **ledge** is a furniture top that is ground.
- A **move** is one traversal record (crossing, climb, drop, gap).
- A **find** is one of the six discoveries.
- Find ids: `clock`, `piano`, `window`, `bookcase`, `cushion`, `toys`. Pay keys are `house-find-<id>`.

---

### Task 1: The secret stair and the shut bookcase

**Files:**
- Modify: `src/world/houseplan.js`, `src/world/houseparts.js`, `src/world/house.js`
- Modify: `test/helpers/housewalk.js` (add the `secretOpen` option)
- Modify: `test/housecamera.test.js` (the stair test passes `secretOpen: true`), `test/houseplan.test.js` (the `LEVEL_LINKS` line: four links)
- Create: `test/housesecret.test.js`

**Interfaces:**
- Consumes: step 1's plan, sections, colliders and `houseFlood`.
- Produces:
  - `HOUSE_STAIRS[3] = { id: 'secret', from: 'ground', to: 'upstairs', x0: -6, z0: 2, x1: -6, z1: -6.4, width: 2.4 }`, so `LEVEL_LINKS` has four entries.
  - `SECRET_BOOKCASE = freeze({ x: -6, z: 2, w: 2.4, d: 0.42, h: 2.25, hinge: freeze({ x: -7.2, z: 2 }), openS: 1.2, reach: 1.1, holdS: 0.6 })`.
    - Shut, its leaf spans x [−7.2, −4.8], centred on the wall line.
    - Open, it is turned +90° about the hinge, standing into the library along z from 2 to 4.4.
  - `secretColliders(open: boolean) → [{ x, z, r: COLLIDER_R, level: 'ground', secret: true }]`, every `COLLIDER_STEP` along the leaf's centreline. `houseColliders()` appends `secretColliders(false)`.
  - `houseparts.js`:
    - `secretBookcaseGroup(material) → THREE.Group`: its pivot is at the hinge;
    - its `userData` carries `secretBookcase: true`, `fadeOccluder` and `noContactShadow`, and `houseDetail` / `houseLevel: 'ground'`.
  - `areaData.house.secret = { group, shut: secretColliders(false), open: secretColliders(true) }`.
  - `createHouseWalk({ secretOpen = false })` swaps the shut colliders for the open ones in its area.
- Bytes: house chunk ≤ +2 kB; start-up 0. Record `S0` and `H0` first, before any edit.

- [ ] **Step 1: Measure the baseline.** Run `npm run build 2>&1 | grep -E "^start-up|^  house "` and note `S0` and `H0` for the report.
- [ ] **Step 2: Write the failing tests** in `test/housesecret.test.js`:

```js
it('climbs from the library to the bedroom through the courtyard, 1 in 3 or less', () => {
  const s = HOUSE_STAIRS.find((q) => q.id === 'secret');
  expect(rectInside(stairRect(s), { minX: -14, maxX: -1.5, minZ: -6.4, maxZ: 2 })).toBe(true);
  expect(2.4 / 8.4).toBeLessThanOrEqual(MAX_PATH_GRADE);
  expect(area.ground.y(-6, -2.2)).toBeCloseTo(1.2, 6);
  expect(LEVEL_LINKS).toHaveLength(4);
});
it('opens the library\'s north wall and the bedroom\'s south wall for it, and no other wall', () => {
  // no wall section of library-n or bedroom-s overlaps x (-7.2, -4.8); every other section id and extent is
  // unchanged from the step-1 list (compare against a copy of houseSections() built with the secret stair filtered out)
});
it('shut, the bookcase closes the library side; open, she walks through and up', () => {
  for (const x of [-7, -6.5, -6, -5.5, -5]) expect(isWalkableAt(area, x, 2)).toBe(false);
  const open = { ...area, colliders: swapSecret(area.colliders, true) };
  expect(houseFlood(open, { x: -6, z: 4 }).reachesWithin(-6, -2.2, 0.5)).toBe(true);
  expect(houseFlood(area, { x: -6, z: 4 }).reachesWithin(-6, -2.2, 0.5)).toBe(true);   // round by the hall and the bedroom
});
it('from the stair\'s foot she is never shut in: the bedroom is always a way out', () => {
  expect(houseFlood(area, { x: -6, z: 1.2 }).reachesWithin(-3, -10, 1)).toBe(true);
});
it('draws the bookcase shut in the opening: a tall piece on the ground level that fades', () => {
  // build a scene: one object with userData.secretBookcase; fadeOccluder set; houseLevel 'ground';
  // its world box covers x [-7.2, -4.8] at z 2 within 0.25 m
});
```

  `rectInside`, `stairRect` and `swapSecret` are small helpers local to the file.
- [ ] **Step 3: Run them to see them fail.** Run `npx vitest run test/housesecret.test.js`. Expected: FAIL.
- [ ] **Step 4: Write the stair, the bookcase and its colliders.** Change `test/houseplan.test.js`'s `LEVEL_LINKS` expectation to add `['ground', 'upstairs']` last (D18). Give `createHouseWalk` the `secretOpen` option, and pass `secretOpen: true` in the step-1 test `on every stair at every view step`.
- [ ] **Step 5: Run them, and the step-1 house files, to see them pass.**
  - Run `npx vitest run test/housesecret.test.js test/houseplan.test.js test/house.test.js test/housecamera.test.js test/housebudget.test.js test/housetour.test.js`.
  - Expected: PASS.
  - If a never-lost spot on the new stair fails, fix its sections or the bookcase, never the test.
- [ ] **Step 6: Commit** the seven files with message "Old House step 2: a secret stair from the library to the bedroom, behind a shut bookcase".

### Task 2: Ledges and the climbing routes

**Files:**
- Modify: `src/world/houseplan.js`, `src/world/houseparts.js`, `src/world/house.js`, `src/world/houselife.js`
- Modify: `test/house.test.js` (the colliders line: ledge pieces have none, D18)
- Create: `src/world/housemoves.js`, `test/housemoves.test.js`

**Interfaces:**
- Consumes: `createTraversal`, `validateTraversal`, `BASE_ABILITIES` (`src/traversal.js`); `canReach`, `BASE_CLIMB_BUDGET` (`src/climbing.js`); `floodTraversal` (`test/helpers/traversalflood.js`).
- Produces:
  - **New and changed furniture rows.**
    - New pieces:
      - `library-steps` (0.6 × 0.6, h 0.9) beside the ladder in front of n2;
      - `library-bigbooks` (0.7 × 0.5, h 1.0) on the west wall;
      - `bedroom-chest` (0.8 × 0.5, h 0.6) between the wardrobe and the new `bedroom-shelf`;
      - `bedroom-shelf` (0.9 × 0.35, h 1.6) on the north wall, clear of the window;
      - `attic-seat` (1.6 × 0.6, h 0.5) under the round window;
      - `parlour-keys` (1.3 × 0.3, h 0.75) in front of the piano.
    - With `ledge: true`: `library-books-n1`, `library-books-n2`, `library-books-w` (moved north, D2), `library-steps`, `library-bigbooks`, `bedroom-wardrobe`, `bedroom-chest`, `bedroom-shelf`, `attic-seat`, `parlour-keys`, `parlour-piano`.
  - `HOUSE_LEDGES`: `[{ id, room, level, minX, maxX, minZ, maxZ, y }]`, one per ledge row. Its footprint is axis-aligned, and `y` is the level's y plus `h`.
  - `houseGroundSpec()` adds one flat strip per ledge.
  - `houseFloorGround() → createGround(spec without the ledge strips)`.
  - `furnitureColliders(f)` is `[]` for a ledge row.
  - The stand-ins still draw ledge pieces: `f.r > 0 || f.ledge`.
  - `housemoves.js`:
    - `HOUSE_MOVES = { crossings, climbs, drops, gaps }` in `traversal.js`'s spec shape. It holds the two routes and the two short climbs of D2, one `'plank'` crossing, and no `requires`.
    - `HOUSE_PERCHES`: the seven of D4, each `{ id, x, z, y, kind: 'furniture' }`.
    - `HOUSE_ROUTES = { library: [moveIds], bedroom: [...], attic: [...], piano: [...] }`, in walking order.
    - `houseMovesArea(area = houseArea()) → { ...area, traversal: createTraversal(HOUSE_MOVES, area.ground), perches: HOUSE_PERCHES }`.
  - `house.js`:
    - the record gains `traversal`, `perches` and `house.floor`;
    - one faint paw-mark decal mesh per level at every hop's take-off (`noCast`, `noMerge`, tagged `houseDetail`);
    - the shelf plank drawn on its crossing.
  - `houselife.js`: `drawing.update(house.floor.y(catPos.x, catPos.z))`, and `settle` likewise (D3).
- Bytes: house chunk ≤ +4 kB; start-up 0.

- [ ] **Step 1: Write the failing tests** in `test/housemoves.test.js`:

```js
it('every move is valid', () => {
  expect(validateTraversal(HOUSE_MOVES, { ground: area.ground, bounds: area.bounds, colliders: area.colliders })).toEqual([]);
});
it('every move is hers on her first walk: no Long Leap, no Spring Paws, short drops', () => {
  for (const h of area.traversal.hops) {
    expect(h.requires).toBe(null);
    if (h.kind === 'climb') expect(h.dy).toBeLessThanOrEqual(1.5);
    if (h.kind === 'drop') expect(-h.dy).toBeLessThanOrEqual(1.5);
    if (h.kind === 'leap') { expect(h.dist).toBeGreaterThanOrEqual(1.5); expect(h.dist).toBeLessThanOrEqual(3.0); expect(Math.abs(h.dy)).toBeLessThanOrEqual(0.6); }
  }
  expect(area.traversal.crossings.map((c) => c.kind)).toEqual(['plank']);
});
it('never stuck: every ledge with a move is reached from the spawn, and the spawn from it', () => {
  const f = floodTraversal(area, { abilities: BASE_ABILITIES });
  const home = f.regionAt(area.spawn.x, area.spawn.z);
  for (const l of ledgesWithMoves()) {
    const r = f.regionAt(cx(l), cz(l), l.y);
    expect(f.reachable(home).has(r), l.id).toBe(true);
    expect(f.reachable(r).has(home), l.id).toBe(true);
  }
});
it('a ledge is one height: no collider stands on it and the floor under it is its room\'s', () => {
  for (const l of HOUSE_LEDGES) {
    expect(area.ground.y(cx(l), cz(l))).toBeCloseTo(l.y, 9);
    expect(houseFloorGround().y(cx(l), cz(l))).toBe(levelY(l.level));
    expect(area.colliders.filter((c) => inRect(c, l, -0.05))).toEqual([]);
  }
});
it('pushing off any ledge\'s edge keeps her on it, and a way down is within 1 m', () => {
  // the real player (createHouseWalk({ moves: true }) from Task 3, or the player on houseMovesArea() directly):
  // on each ledge's centre, hold the stick outward in 8 directions for 1 s each: her ground stays the ledge's y (±0.01);
  // from every 0.25 m cell of every ledge with a move, some move's take-off or crossing end is within 1.0 m
});
it('every knock-over perch is one jump from the floor', () => {
  for (const p of HOUSE_PERCHES) expect(floorSpotsNear(p).some((s) => canReach(p, s, 0, BASE_CLIMB_BUDGET)), p.id).toBe(true);
});
it('on the wardrobe she is still upstairs; on a bookcase, still on the ground floor', () => {
  // build a scene; life = record.life({ scene, reducedMotion: true }); settle at the wardrobe top, then update:
  // life.drawing.current === 'upstairs'; on library-books-n2's top: 'ground'; up the main stair: the step-1 hysteresis holds
});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/housemoves.test.js`. Expected: FAIL.
- [ ] **Step 3: Write the ledges, `housemoves.js`, the drawn pieces, the plank, the marks and the floor-reading drawing.**
  - Place the moves so that the take-off spots are clear of every collider by `SPOT_BODY`.
  - In `test/house.test.js`'s colliders line, the expected furniture colliders leave out the ledge rows (D18).
- [ ] **Step 4: Run them to see them pass.**
  - Run `npx vitest run test/housemoves.test.js test/houseplan.test.js test/house.test.js test/houselevels.test.js test/housebudget.test.js`.
  - Expected: PASS.
  - Run `npm run build` and record the sizes.
- [ ] **Step 5: Commit** the seven files with message "Old House step 2: furniture to climb (ledges, a plank, leaps and short drops) and perches to knock things from".

### Task 3: Never lost on any climb

**Files:**
- Modify: `test/helpers/housewalk.js`, `test/housecamera.test.js` (a new `describe('never lost on a climb')`), `test/heavy.js` (if the file passes 30 s)
- Modify, only if a spot fails: `src/world/houseplan.js` (a piece's place) or a `SINK` distance (never `downS` / `holdS` / `upS`, ruling R1)

**Interfaces:**
- Consumes: `createTraversalLive` (`src/traversallive.js`); `createTreeFade`, `findFadeOccluders` (`src/treefade.js`); Task 2's `houseMovesArea`, `HOUSE_LEDGES`, `HOUSE_PERCHES`, `HOUSE_ROUTES`.
- Produces, in `createHouseWalk({ reducedMotion, pace, secretOpen, moves = false })`. With `moves`, the area is `houseMovesArea()`, and each frame runs `traversal.update` before `player.update`, as main.js orders it. It adds:
  - `placeOnLedge(id, x, z, yaw, zoom)`;
  - `placeOnPerch(perch, yaw, zoom)`, which sets `player.perchY = perch.y` and `session.perched`;
  - `jump()`, which presses the traversal's jump button;
  - `frame(dt)`.

- [ ] **Step 1: Write the failing tests:**

```js
it('never lost on a ledge: every 0.25 m cell of every ledge, 8 directions, all four view steps', () => {
  // place on each cell, yaw k*PI/4, zoom 0..3: blockers() is [] and the camera is not inside a standing section (pad 0.1)
}, 90_000);
it('never lost on a perch: every knock-over perch, 8 directions, all four view steps', () => { /* likewise */ }, 60_000);
it('never lost on a move: along the plank and through every hop, eased, at every view step', () => {
  // for each route in HOUSE_ROUTES, zoom 0..3, reducedMotion false, 1/60: walk to each take-off and jump() (or push onto the plank);
  // the longest run of frames with blockers() non-empty is <= 15; no frame moves the camera more than 0.25 m; she ends each move on its far end (±0.05)
}, 90_000);
it('beside a ledge on the floor, she is seen and the camera never jumps', () => {
  // every floor cell within 0.8 m of a ledge's footprint, 8 directions, zoom 0..3: blockers() is [];
  // then walking along each ledge's foot at 1/60 for its length: no frame moves the camera more than 0.25 m
}, 90_000);
it('the piece she stands on never fades', () => {
  // a built scene, createTreeFade([...findFadeOccluders(scene)]); on each ledge's centre, 8 directions, zoom 0..3, settle 1 s:
  // the fade target of that ledge's own piece is opaque (its materials' opacity === 1)
}, 60_000);
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/housecamera.test.js`. Expected: FAIL, because the helper has no `moves`.
- [ ] **Step 3: Extend the helper. Then fix what fails** by a piece's place or a `SINK` distance, with a one-line why each. Never loosen a test.
- [ ] **Step 4: Run them to see them pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** the changed files with message "Old House step 2: never lost on a climb: every ledge, perch and move at every view step".

### Task 4: The finds, placed

**Files:**
- Create: `src/world/housethings.js`, `test/housethings.test.js`
- Modify: `src/world/houseplan.js` (new pieces: `kitchen-pantry` (1.2 along z × 0.5, h 2.0, tall, on the east wall), `kitchen-sacks`, `attic-toybox` (0.8 × 0.5, h 0.5), `parlour-cushion` (0.7 round, r 0, walked over))
- Modify: `src/world/houseparts.js`, `src/world/house.js`, `test/house.test.js` (the "empty of life" line: mice only, D18)
- Modify: `src/clanphrases.js` (`LATER`) and the snapshot fixtures

**Interfaces:**
- Consumes: Tasks 1–2; `isPropId`, `KNOCK_KINDS` (`src/propsets.js`); `createCritters`, `HIDE_REACH` (`src/critters.js`); `createToy` (`src/toy.js`); `GOLD_MICE`, `GOLD_TOTAL` (`src/goldmice.js`, read only).
- Produces in `housethings.js`:
  - `HOUSE_GOLD_MICE`: `[{ id: 'gm-house-1', x, z, y: 0 }, { id: 'gm-house-2', ... }, { id: 'gm-house-3', ... }]` (D5). `y` is the height above the ground there, so 0 on a ledge.
  - `HOUSE_KNOCKABLES`: the six of D4, each `{ id: 'house-<kind>-<n>', kind, x, y, z, fallTo: { x, z } }`, in `propsets.js`'s knockable shape.
  - `HOUSE_HIDES`: `[{ x, z, room }]`, four of them: under the pantry and the dresser, behind the barrels and under the cellar's shelf A.
  - `HOUSE_MICE`: `[{ type: 'mouse', x, z, x2, z2, room }]`, two in the kitchen and two in the cellar.
  - `HOUSE_YARN_SPOTS`: `[{ x, z, words: 'house.yarn.hall' }, { x, z, words: 'house.yarn.kitchen' }]`.
  - `HOUSE_SCENICS`: `[{ id: 'clock' | 'fireside' | 'attic-window', x, z, words: 'house.scenic.<id>' }]`.
  - `HOUSE_FINDS`: `[{ id, room, trigger: 'stay' | 'still' | 'arrive' | 'along' | 'secret', x, z, r, holdS, ledge? }]`, the six of D6.
    - `clock`: `stay`, r 1.2, 1.0 s.
    - `piano`: `along`, `ledge: 'parlour-keys'`.
    - `window`: `arrive`, `ledge: 'attic-seat'`.
    - `bookcase`: `secret`, r 1.1, 0.6 s.
    - `cushion`: `still`, r 0.35, 1.5 s.
    - `toys`: `stay`, r 1.0, 0.5 s.
  - `HOUSE_GOAL_TYPES = freeze(['mischief', 'photo', 'play', 'scenic'])`.
  - `HOUSE_MAP_GROUND = 0x6f9a52` (the lawn).
  - `houseMapShapes() → [{ minX, maxX, minZ, maxZ, tone: 'ledge' | 'rock' }]`: rooms and stairs as `'ledge'`; `wall` and `stair` sections as 0.5 m `'rock'` strips.
  - `toyStop(px, pz, x, z, { secretOpen = false } = {}) → null | { x, z }`:
    - `null` when the step stays in one room or stair, or passes through a doorway or a stair mouth (the secret mouth only when `secretOpen`);
    - otherwise the last point before the wall line, pulled 0.3 m back inside.
- The record (`house.js`):
  - `goldMice: HOUSE_GOLD_MICE`, `knockables`, `hides`;
  - `critterSpawns`: `HOUSE_MICE` without `room`;
  - `yarnSpots`: `[{ x, z, where: phrase(words) }]`;
  - `scenics`: `[{ id, x, z, label: phrase(words) }]`;
  - `goalTypes`, `mapShapes`, `mapGround`;
  - `house.finds: HOUSE_FINDS`.
- Phrases (`LATER`, D17):
  - `'house.scenic.clock': 'the grandfather clock'`;
  - `'house.scenic.fireside': 'the fireside'`;
  - `'house.scenic.attic-window': 'the round attic window'`;
  - `'house.yarn.hall': 'on the hall runner'`;
  - `'house.yarn.kitchen': 'by the kitchen table'`.
- Bytes: house chunk ≤ +4 kB; start-up ≤ +0.3 kB.

- [ ] **Step 1: Write the failing tests** in `test/housethings.test.js`:

```js
it('three golden mice, two up a climb and one tucked away in the cellar, none in GOLD_MICE', () => {
  expect(HOUSE_GOLD_MICE.map((m) => m.id)).toEqual(['gm-house-1', 'gm-house-2', 'gm-house-3']);
  for (const m of HOUSE_GOLD_MICE) expect(m.id).toMatch(/^gm-[a-z]{1,24}-[1-9]$/);
  expect(GOLD_MICE.house).toBeUndefined(); expect(GOLD_TOTAL).toBe(36);
  // gm-house-1 and -2: on a ledge (ground.y there === that ledge's y) whose region floodTraversal reaches from the spawn;
  // gm-house-3: roomAt === 'cellar', houseFlood(area).reachesWithin(x, z, 0.9)
});
it('every knockable stands on a perch at its height and falls onto its own room\'s floor', () => {
  expect(HOUSE_KNOCKABLES.length).toBeGreaterThanOrEqual(3);
  for (const k of HOUSE_KNOCKABLES) {
    expect(isPropId(k.id) && KNOCK_KINDS.includes(k.kind)).toBe(true);
    const p = nearestPerch(k); expect(Math.abs(p.y - k.y)).toBeLessThan(0.01);
    expect(Math.hypot(p.x - k.x, p.z - k.z)).toBeGreaterThanOrEqual(0.35);
    expect(roomAt(k.fallTo.x, k.fallTo.z)).toBe(roomAt(k.x, k.z));
    expect(isWalkableAt(area, k.fallTo.x, k.fallTo.z)).toBe(true);
  }
});
it('the mice keep to their rooms: chased from every side, none crosses a wall, each ends hidden in its room', () => {
  // createCritters(scene, record.critterSpawns, { ground, hides: HOUSE_HIDES, rng: () => 0.5, motionRng: () => 0.5 });
  // for each mouse and 8 approach directions, a stand-in cat runs at it at 3.5 m/s from 5 m for 10 s (1/60):
  // every frame roomAt(mouse) === its room; at the end it is hidden
}, 60_000);
it('the yarn ball\'s spots are clear floor, and say where in words in both sets', () => { /* reachesWithin 0.3; clearance 0.6 from colliders; inEachWordSet(() => phrase(w)) non-empty */ });
it('a ball batted at any wall stops at it; through a doorway it rolls on', () => {
  // the real createToy on the house ground: for every wall section's middle and every room corner, from 1 m inside,
  // bat toward it at 6 m/s and step 3 s at 1/60 applying toyStop after toy.update: roomAt(ball) never changes;
  // batted through each doorway's centre it ends in the far room; at the shut bookcase it stays in the library
});
it('every special place and find is on ground she can reach in its room', () => { /* houseFlood or floodTraversal reach; roomAt === room */ });
it('each goal type has something to finish in the house', () => {
  expect(HOUSE_KNOCKABLES.length).toBeGreaterThanOrEqual(3); expect(HOUSE_SCENICS.length).toBeGreaterThanOrEqual(2);
  expect(HOUSE_YARN_SPOTS.length).toBe(2);
});
it('the corner map\'s shapes are the rooms, the stairs and the walls, with the doorways open', () => { /* each room rect present as 'ledge'; no 'rock' strip crosses a doorway's middle */ });
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/housethings.test.js`. Expected: FAIL.
- [ ] **Step 3: Write `housethings.js`, the new pieces, the record fields and the five phrases.** Then refresh the snapshots, and revert the drift that is not yours.
- [ ] **Step 4: Run them to see them pass.**
  - Run `npx vitest run test/housethings.test.js test/house.test.js test/housebudget.test.js test/clanwords.test.js test/clanphrases.test.js test/serieswords*.test.js`.
  - Expected: PASS.
  - Run `npm run build` and record the sizes.
- [ ] **Step 5: Commit** the changed files (snapshots by exact path) with message "Old House step 2: golden mice, knock-overs, mice in the pantry and the cellar, the yarn ball's spots, special places and the floor plan".

### Task 5: Into the walk: the seams, the goals and the corner map

**Files:**
- Modify: `src/game/walk.js`, `src/goldmice.js`, `src/goals.js`, `src/propsets.js`, `src/ui/minimap.js`, `src/discoveries.js`, `src/ui/hud.js`
- Modify: `test/housegame.test.js` (the "no daily goals, no sky birds and no corner map" test becomes the first test below, D18)

**Interfaces:**
- Consumes: Task 4's record.
- Produces. Each edit is found by its quoted code:
  - `walk.js`:
    - `const goals = indoor ? null : createGoals(walkRng, areaData);` → `isDen ? null : …`
    - `session.minimap = indoor ? null : createMinimap(` → `isDen ? null : …`
    - `createKnockables(scene, propsFor(areaId).knockables, { ground })` → `createKnockables(scene, areaData.knockables ?? propsFor(areaId).knockables, { ground })`
    - `hides: propsFor(areaId).hides,` → `hides: areaData.hides ?? propsFor(areaId).hides,`
    - `yarnSpotFor(areaId, <key>)` → `yarnSpotFor(areaId, <key>, areaData.yarnSpots)`
    - `session.goldMice = areaId in GOLD_MICE` → `session.goldMice = (areaId in GOLD_MICE || areaData.goldMice)`, with `list: areaData.goldMice` added to its options
    - the life's argument object `areaData.life?.({ scene, sun, … })` gains `log, hud, toy`
  - `goldmice.js`: `createGoldMice(scene, areaId, foundIds, { ground, rng, list = null })` reads `list ?? GOLD_MICE[areaId] ?? []`.
  - `goals.js`: `goalFits` starts with `if (Array.isArray(areaData.goalTypes)) return areaData.goalTypes.includes(goal.type);`.
  - `propsets.js`: `yarnSpotFor(areaId, key, spots = yarnSpotsFor(areaId))`, which picks among `spots` with the same hash.
  - `minimap.js`: `areaData.mapGround ?? areaData.groundBounce ?? 0x6cb058`.
  - `discoveries.js`: `AWARDS.housefind = 12`.
  - `hud.js`: `'housefind'` joins the whole-line types in `discoveryText`.
- Bytes: start-up ≤ +0.4 kB; house chunk 0.

- [ ] **Step 1: Write the failing tests** in `test/housegame.test.js`, on real walks through `test/helpers/walklife.js`:

```js
it('has daily goals it can finish, the corner map, and no sky birds', () => {
  const r = houseWalk();
  expect(r.goals.goals).toHaveLength(3);
  for (const g of r.goals.goals) expect(HOUSE_GOAL_TYPES).toContain(g.type);
  expect(r.minimap).not.toBe(null); expect(r.skyLife).toBe(0);
});
it('lays out its golden mice, knock-overs, mice and yarn ball from its own record', () => {
  // session.goldMice.list ids = the gm-house ids not in state.golden; session.knockables.items ids = HOUSE_KNOCKABLES ids;
  // critters.list: 4, all 'mouse'; session.toy.spot equals one of HOUSE_YARN_SPOTS (x, z); its yarn goal's how-slot is that spot's words
});
it('a golden mouse found in the house is saved, and the tally stays 36 until step 4', () => {
  // recordGolden('gm-house-1') === true; state.golden includes it; goldForEdition(state.edition, CATALOG).size === 36
});
it('draws the corner map as the house\'s floor plan on the lawn', () => {
  // buildMapLayer(areaData, scene).ground === '#6f9a52'; rock and ledge lists non-empty; the cat's marker sits inside the hall at the spawn
});
it('every other place is as it was: the den has no goals or map; the park rolls the same goals, mice, knock-overs and yarn spot', () => {
  // den walk: goals null, minimap null; park walk on a fixed seed: goal ids, golden mice ids, knockable ids, hides, yarn spot
  // equal to a park walk from the same seed with areaData's house keys absent (they are); goalFits(park pool) unchanged
});
it('a house find\'s toast is its own line', () => {
  expect(AWARDS.housefind).toBe(12);
  expect(discoveryText({ type: 'housefind', label: 'The old clock bongs 3 times! 🕰️' })).toBe('The old clock bongs 3 times! 🕰️');
});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/housegame.test.js`. Expected: FAIL.
- [ ] **Step 3: Make the seven edits.**
- [ ] **Step 4: Run them, and the files that read these modules, to see them pass.**
  - Run `npx vitest run test/housegame.test.js test/goals.test.js test/goldmice.test.js test/goldedition.test.js test/yarnspots.test.js test/propsets.test.js test/minimap*.test.js test/hud*.test.js test/flattrace.test.js test/walkcast.test.js`.
  - Expected: PASS, and `git status --short test/fixtures` is empty.
  - Run `npm run build` and record the sizes.
- [ ] **Step 5: Commit** the eight files with message "Old House step 2: the house hands the walk its golden mice, knock-overs, mice and yarn ball; daily goals and the corner map inside".

### Task 6: The discoveries come alive

**Files:**
- Create: `src/world/housefinds.js`, `test/housefinds.test.js`
- Modify: `src/world/houselife.js`, `src/world/house.js`, `src/world/houseparts.js` (the clock's pendulum, the piano's eight keys, the toy box's lid and three toys, the bookcase's pivot)
- Modify: `src/clanphrases.js` (`LATER`, six lines), the snapshot fixtures
- Modify: `test/housegame.test.js` (the resume test below)

**Interfaces:**
- Consumes: Task 4's `HOUSE_FINDS`, `toyStop`; Task 1's `areaData.house.secret`; Task 5's life arguments `log`, `hud`, `toy`, `audio`.
- Produces:
  - `FIND_KEY = (id) => \`house-find-${id}\``, and `PIANO_SCALE = [262, 294, 330, 349, 392, 440, 494, 523]` (Hz, west to east).
  - `createHouseFinds({ finds, secret, colliders, parts, log, hud, audio, reducedMotion = false, now = () => new Date() }) → { update(dt, t, catPos), get open(), dispose() }`.
    - Speed is measured from `catPos` between frames, as `critters.js` measures it. `STILL = 0.25` m/s.
    - **clock:** after `holdS` within `r` of its spot, it strikes: `n = now().getHours() % 12 || 12`.
      - It plays `audio.playTune` with `n` notes at 196 Hz, 1.1 s apart.
      - It pays `log.awardOnce('housefind', FIND_KEY('clock'), phrase('house.find.clock', n))`.
      - It strikes again only after she has been beyond `r + 1` m.
      - The pendulum swings at 1 Hz. Under reduced motion it stands still.
    - **piano:** while her paws are within 0.1 m of the keys' ledge top, entering key `k` plays `audio.musicBoxNote(PIANO_SCALE[k])`. Six different keys since she stepped up pays `phrase('house.find.piano')`.
    - **window:** her paws on the seat's ledge pays `phrase('house.find.window')`.
    - **bookcase:** after `holdS` within `SECRET_BOOKCASE.reach` of (−6, 2), it opens.
      - The shut colliders are spliced out of the live `colliders` array and the open ones pushed in, at the swing's start.
      - The pivot turns to +π/2 over `openS` (at once under reduced motion). It pays `phrase('house.find.bookcase')`.
      - It stays open. `open` reads true.
    - **cushion:** still within `r` for `holdS` calls `audio.purr(1.2)` and pays `phrase('house.find.cushion')`.
    - **toys:** after `holdS` within `r`, the lid tips and the three toys slide to their resting spots over 0.8 s (at once under reduced motion). It pays `phrase('house.find.toys')`.
    - Each pays once a walk by the log's own rule. A strike, a note or the lid may happen again; the toast does not.
  - `createHouseLife(scene, house, { reducedMotion, log, hud, audio, toy, colliders, now })` composes the finds. After them, it applies `toyStop(px, pz, x, z, { secretOpen: finds.open })` to an active, unheld `toy` from last frame's x, z, and on a stop calls `toy.setPosition({ x, y: 0, z })`.
  - `house.js`'s `life` passes `log`, `hud`, `audio`, `toy`, `areaData.colliders` and the parts from the life's arguments.
- Phrases (`LATER`, D17):
  - `'house.find.clock': (n) => \`The old clock bongs ${n} ${n === 1 ? 'time' : 'times'}! 🕰️\``;
  - `'house.find.piano': 'You played a tune on the old piano! 🎵'`;
  - `'house.find.window': 'What a view over the rooftops from the round window!'`;
  - `'house.find.bookcase': 'The bookcase swings open… a secret stair! 🗝️'`;
  - `'house.find.cushion': 'A cat-shaped dent in the cushion… someone else naps here too 💤'`;
  - `'house.find.toys': 'A box of old toys! A wooden mouse rolls out 🧸'`.
- Bytes: house chunk ≤ +5 kB; start-up ≤ +0.3 kB.

- [ ] **Step 1: Write the failing tests** in `test/housefinds.test.js`, using a real `createDiscoveryLog({ addPoints, recordFeat })` and stub `hud` and `audio` that record calls:

```js
it('the clock strikes the hour when she stays at its foot, and pays once a walk', () => {
  const f = finds({ now: () => new Date(2026, 10, 21, 15, 0) });
  stay(f, clockSpot, 1.1);
  expect(audio.calls.playTune[0][0]).toHaveLength(3);
  expect(log.count(FIND_KEY('clock'))).toBe(1); expect(points).toBe(12);
  walkAway(f, 3); stay(f, clockSpot, 1.1);
  expect(audio.calls.playTune).toHaveLength(2); expect(points).toBe(12);
});
it('the piano plays a note for each key she steps on, and a tune for six', () => { /* walk the keys' ledge west to east at its y: 8 notes, rising; pays at the sixth */ });
it('the attic window pays when she is up on the seat, not below it', () => { /* at the seat's x, z on the floor: nothing; at its ledge y: pays */ });
it('the bookcase swings open when she stands at it, from either side, and stays open', () => {
  // from the library side (z 3.0) and, in a second run, from the stair side (z 1.0): after 0.6 s open is true;
  // colliders holds no shut circle and every open one; isWalkableAt({ ...area, colliders }, -6, 2) is true;
  // pivot.rotation.y reaches PI/2 by openS (± one frame), at once with reducedMotion; still open after she leaves
});
it('the cushion pays only when she stays still on it', () => { /* trotting across: nothing; still 1.5 s: purr and pay */ });
it('the box of toys tips out its toys when she noses at it', () => { /* lid rotation changes; the three toys reach their spots; pays */ });
it('the ball stays in the room: the life stops it at the wall', () => {
  // a built scene, the real createToy, life with toy: bat it at the hall's west wall away from the doorway: roomAt stays 'hall'
});
it('every find speaks from the word tables in both sets, with no series word in the everyday set', () => {
  // for each find id: inEachWordSet(() => phrase(`house.find.${id}`, 3)) are strings; the off set's has no series word (test/helpers/offwords.js)
});
```

  And in `test/housegame.test.js`:

```js
it('a walk picked up again pays nothing twice, and finds her where she was', async () => {
  // a house walk: open the bookcase and strike the clock (finds paid), end with a resume note on the wardrobe top;
  // resume: the cat is on the wardrobe (ground.y === its ledge y), the life draws 'upstairs';
  // log.count('house-find-clock') === 1 and standing at the clock pays 0; the bookcase is shut and opens again when she stands at it
}, 90_000);
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/housefinds.test.js test/housegame.test.js`. Expected: FAIL.
- [ ] **Step 3: Write `housefinds.js`, the parts, the life wiring and the six phrases.** Then refresh the snapshots, and revert the drift that is not yours.
- [ ] **Step 4: Run them to see them pass.**
  - Run `npx vitest run test/housefinds.test.js test/housegame.test.js test/housecamera.test.js test/house.test.js test/clanwords.test.js test/clanphrases.test.js test/serieswords*.test.js`.
  - Expected: PASS.
  - Run `npm run build` and record the sizes.
- [ ] **Step 5: Commit** the changed files with message "Old House step 2: the clock strikes, the piano plays, the bookcase opens onto the secret stair, and three more things to find".

### Task 7: Sound and air

**Files:**
- Modify: `src/audio.js`, `src/world/houselife.js`, `src/world/house.js`
- Create: `src/world/housesound.js`, `src/world/houseair.js`, `test/housesound.test.js`, `test/houseair.test.js`

**Interfaces:**
- Produces:
  - `audio.js`:
    - `tick(volume = 1)`: one soft click, `tone(2200, 0.03, { gain: 0.012 * v })`;
    - `creak(volume = 1)`: `tone(170, 0.35, { type: 'sawtooth', gain: 0.018 * v, slideTo: 130 })`;
    - both clamp `v` to [0, 1] and make nothing at 0. `tone()` already makes nothing when muted.
  - `housesound.js`:
    - `TICK_R = 7`, `CREAK_EVERY_M = 1.4`, `ATTIC_CREAK_S = 11`;
    - `createHouseSound(audio, { clock, stairs, attic }) → { update(dt, t, catPos), dispose() }`.
      - A tick every 1.0 s while she is within `TICK_R` of the clock, at volume `0.6 * (1 - d / TICK_R)`.
      - A creak at 0.5 volume for every `CREAK_EVERY_M` she climbs or descends on any stair.
      - In the attic, while she moves faster than 0.25 m/s, a creak at 0.35 volume every `ATTIC_CREAK_S`.
      - No random draws.
  - `houseair.js`:
    - `SUNBEAM = freeze({ length: 3.2, drop: 1.6, width: 0.9, opacity: 0.12, motes: 14 })`;
    - `createHouseAir(scene, { windows, rooms, levels, dusk, reducedMotion }) → { update(dt, t, fullLevels), dispose() }`.
      - By day, one merged beam mesh per level: a soft quad slanting down from each window, the cellar's left out.
      - One `THREE.Points` per level of `SUNBEAM.motes × beams` motes drifting inside the beams, seeded by `hash01`.
      - Beams are additive, `depthWrite: false`, `noCast`, `noMerge`, and tagged `houseDetail` / `houseLevel`.
      - Only levels in `fullLevels` are shown. At dusk nothing is made. Under reduced motion the motes do not move.
  - `createHouseLife(..., { dusk })` runs both. `house.js` passes `dusk` from the life's arguments.
- Bytes: start-up ≤ +0.3 kB; house chunk ≤ +3 kB.

- [ ] **Step 1: Write the failing tests:**

```js
// test/housesound.test.js
it('the clock ticks quietly near it, once a second, and not at all 8 m away', () => { /* 3 s at 2 m: 3 ticks, each volume < 0.6; 3 s at 8 m: none */ });
it('a stair creaks as she climbs it, a few times, never at every step', () => { /* up the main stair (8.4 m): 6 creaks ± 1 */ });
it('the attic creaks now and then while she walks, the same every time', () => { /* two 30 s runs: identical creak times */ });
it('muted, the house makes no sound at all', () => {
  // the real createAudio with a fake AudioContext counting createOscillator; setMuted(true):
  // tick, creak, playTune([...]), musicBoxNote(262): 0 oscillators; unmuted, tick(): >= 1 (the counter works)
});
// test/houseair.test.js
it('by day the windows throw sunbeams with motes in them; at dusk there are none', () => { /* counts per level; dusk: no objects */ });
it('the motes stay inside their beams and draw nothing from Math.random', () => { /* spy Math.random: 0 calls over 10 s of updates; every mote inside its beam's box */ });
it('under reduced motion the motes hold still', () => { /* positions identical after 5 s */ });
it('draws the air only on levels drawn in full', () => { /* update with fullLevels {attic, upstairs}: the ground and cellar air hidden */ });
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/housesound.test.js test/houseair.test.js`. Expected: FAIL.
- [ ] **Step 3: Write the two sounds, `housesound.js`, `houseair.js` and the life wiring.**
- [ ] **Step 4: Run them, plus `test/audio.test.js` and `test/housegame.test.js`, to see them pass.**
  - Expected: PASS. The house still "sounds like the den" (the fire, no crickets).
  - Run `npm run build` and record the sizes.
- [ ] **Step 5: Commit** the seven files with message "Old House step 2: dust motes in the sunbeams, the clock's quiet tick and creaky stairs, all under the sound switch".

### Task 8: The worst spot, with everything in it

**Files:**
- Modify: `test/helpers/housebudget.js`, `test/housebudget.test.js`
- Modify, only if over an aim: `src/world/houseparts.js` (merge pieces, `noCast` small things)

**Interfaces:**
- Consumes: everything above.
- Produces: `houseWalkThings(scene, record) → dispose()`. It adds what the walk adds, from the record:
  - `createKnockables(scene, record.knockables, { ground })`;
  - `createGoldMice(scene, 'house', new Set(), { ground, list: record.goldMice, rng: () => 0.5 })`;
  - `createCritters(scene, record.critterSpawns, { ground, hides: record.hides, rng: () => 0.5, motionRng: () => 0.5 })`;
  - `createToy(scene, { ground })` placed at the first yarn spot;
  - the life (finds parts and air) settled at each level.

  `measureHouse` runs after it.

- [ ] **Step 1: Write the failing tests:**

```js
for (const light of ['day', 'dusk']) for (const secret of ['shut', 'open']) {
  it(`every level's drawn set, with the walk's own things, is under 450 meshes, 380 casters, 70,000 triangles (${light}, bookcase ${secret})`, () => {
    // per level: meshes <= 450, casters <= 380, triangles <= 70_000; log the worst for the report
  }, 60_000);
}
it('every level is near the aims with everything in it: 300 meshes, 200 casters, 55,000 triangles', () => { /* worst level, day and dusk */ });
it('opening the bookcase adds no draw', () => { /* shut and open measures equal */ });
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/housebudget.test.js`. Expected: FAIL (no `houseWalkThings`).
- [ ] **Step 3: Write the helper, then fix any aim that is missed** by merging or `noCast`. Never loosen a ceiling or an aim.
- [ ] **Step 4: Run them to see them pass.** Same command. Expected: PASS. Report the worst level's numbers, day and dusk.
- [ ] **Step 5: Commit** with message "Old House step 2: the worst spot with everything in it stays under the old-iPad ceiling".

### Task 9: Shots and tours for step 2

**Files:**
- Modify: `src/world/housetour.js`, `test/housetour.test.js`, `test/helpers/housewalk.js`

**Interfaces:**
- Consumes: Task 3's helper (`moves: true`, `jump()`); `createYardPilot`'s step shapes (`src/world/traversalyard.js`: `{ jump: true }`, `{ wait: s }`).
- Produces:
  - `HOUSE_SHOTS` gains these, each `shot(at, face, zoom, caption, { ledge?, perch?, open?, hud? })`:
    - `clock`, `piano` (on the keys), `attic-window` (on the seat);
    - `bookcase-open` (`open: true`), `secret-stair`;
    - `cushion`, `toys`;
    - `knock` (on counter A's perch beside the cup), `mice` (the pantry);
    - `gold-library` (on the west bookcase by the mouse), `gold-wardrobe`, `climb-plank`;
    - `hud` (the hall, zoom 1, `hud: true`).
  - `HOUSE_TOURS` gains two:
    - `climb`: the library route from the library door, ending back on the floor;
    - `things`, the film, 40–60 s:
      1. the clock strikes (a 2 s `wait`);
      2. the library climb to the mouse;
      3. the bookcase opens and she goes up the secret stair;
      4. the bedroom leap to the wardrobe;
      5. up the back stair to the window seat;
      6. a zoom out to Far.
  - `createHousePilot` learns `{ jump: true }` (it presses the traversal's jump once on arrival) and `{ wait: s }`.
  - Captions are plain words.

- [ ] **Step 1: Write the failing tests:**

```js
it('walks the climb tour with the real player, the stick and the jump button alone', () => {
  // createHouseWalk({ moves: true, reducedMotion: false }), 1/30, at most 120 s: done, failed null;
  // her paws reached library-books-w's y (±0.05) and she ends on the floor; the longest blocked run <= 8 frames
}, 90_000);
it('the things film shows every find and the secret stair in 40 to 60 s', () => {
  // walked as the page walks it, with createHouseFinds and stub log: every find id paid once; she passed z -2 on the secret stair;
  // sim time 40..60 s; the longest blocked run <= 8 frames
}, 90_000);
it('puts every new shot where the camera sees her', () => { /* each new shot placed (on its ledge or perch where named): blockers() is [] */ });
```

- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/housetour.test.js`. Expected: FAIL.
- [ ] **Step 3: Write the shots, the tours and the pilot's two steps.**
- [ ] **Step 4: Run them to see them pass.** Same command. Expected: PASS. Add the file to `HEAVY_COST` if it takes over 30 s.
- [ ] **Step 5: Commit** with message "Old House step 2: the shots and the film tour of everything to do".

### Task 10: The picture page, the pictures, the film and the builds

**Files:**
- Modify: `verify-house.html`

**Interfaces:**
- Consumes: everything above; `scripts/record-page.mjs` as it is.
- The page gains:
  - the walk's things (Task 8's `houseWalkThings`, rebuilt from the record);
  - `createTraversalLive` in `main.js`'s frame order;
  - the life with stub `log` and `hud`, whose toast line becomes the caption;
  - `open=1`, which starts with the bookcase open;
  - `hud=1`, which mounts the real corner map (`createMinimap` with `buildMapLayer(record, scene)`) and lists the day's three goals rolled by `createGoals(ownStream(seed, 1), record)` as plain text, top right, as in the game.
  - `__shot` honours the new shot options. Space presses the jump button. The header comment lists the new params.

- [ ] **Step 1: Write the page changes.**
- [ ] **Step 2: Look at it.**
  - Start Vite as a background job: `npx vite --port 5404 --strictPort`.
  - Open `http://localhost:5404/verify-house.html` in the Browser pane.
  - Expected: no console errors and `__ready === true`. Each route climbs with the arrows and Space, the bookcase opens, the clock strikes and `-` zooms out.
  - Then open `http://localhost:5404/?house=1` with the save seeded `muted: true` (U7). Start Explore and check that the goals and the corner map show in the house, and that the park's walk still has its own.
- [ ] **Step 3: Make the pictures and the films** into `/private/tmp/claude-501/-Users-pniessen--claude-spares-spare-gcns3j/e37e3895-a9b0-4a89-9360-a15387ffb2e4/scratchpad/house-step2/` (not committed):
  - Day: `node scripts/record-page.mjs --url 'http://localhost:5404/verify-house.html?drive=1&bare' --out <dir> --shots clock,piano,attic-window,bookcase-open,secret-stair,cushion,toys,knock,mice,gold-library,gold-wardrobe,climb-plank`.
  - Dusk: the same with `&dusk=1`, into `<dir>/dusk`.
  - Goals and the corner map: `--shots hud` with `&hud=1`, day into `<dir>`, and with `&dusk=1` into `<dir>/dusk`.
  - The films: `--tour things` (expected: `things.mp4`, 40–60 s) and `--tour climb`.
  - The contact sheet: `ffmpeg -y -pattern_type glob -i '<dir>/*.png' -filter_complex "scale=480:-1,tile=4x4" <dir>/sheet.png`.
  - Look at every picture and at frames of both films. Check that:
    - no wall stands between the camera and the cat;
    - nothing is scary and no room is pitch-dark at dusk;
    - the motes show by day and not at dusk;
    - the ledge she stands on is drawn, not faded;
    - no mouse is outside its room;
    - the map reads as the house.
  - Fix and re-run anything that is wrong.
- [ ] **Step 4: The builds.**
  - Run `npm run build`. Expected: success, with start-up ≤ `S0` + 1.5 kB and the house chunk ≤ `H0` + 18 kB and under 45 kB.
  - Run `npm run build:ios`. Expected: success.
  - Then `git status --short` shows only `verify-house.html`.
- [ ] **Step 5: Commit** `verify-house.html` with message "Old House step 2: the picture page shows every thing to do, the climbs, the goals and the corner map".
- [ ] **Step 6: Hand-off report** (to the agent that launched this plan; no file). It covers:
  - the commits;
  - the picture, sheet and film paths;
  - `S0`, `H0` and the final sizes;
  - the worst level's meshes, casters and triangles, day and dusk;
  - every `SINK` or piece placement Task 3 changed, and why;
  - the knobs the owner may want: the find hold times, the clock's strike, `TICK_R`, `CREAK_EVERY_M`, `SUNBEAM`, the move lengths;
  - the five owner questions above.
