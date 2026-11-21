# The Old House, step 1: the house and the camera — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One continuous old house on split levels (seven rooms, three stairs), walls that sink between the camera and the cat, zoom that stays (a dollhouse cut-away when zoomed out), always-on near-the-cat level drawing, day and dusk light, a worst-spot budget, a "never lost behind a wall" test, a picture page, pictures and a short film for the owner. It is walkable only behind `?house=1`.

**Architecture:**
- **The plan, pure:** `src/world/houseplan.js` holds levels, rooms, stairs, doorways, wall sections, the ground spec, colliders, furniture placements and `houseArea()` (headless, like `yardArea()`). No THREE.
- **Two pure camera-side modules:**
  - `src/housewalls.js` decides which wall sections sink and eases their heights.
  - `src/houselevels.js` picks the cat's level and which levels are drawn in full.
- **The look:** `src/world/houseparts.js` (one atlas, one material, the pieces) and `src/world/house.js` (`build(scene, opts)`). `src/world/houselife.js` applies the two camera-side modules every frame through the area's `life` hook, which `main.js` already calls after `player.update`.
- **In the game:** `AREAS.house` in `walk.js`, started only by `?house=1` (`src/houseflag.js`), solo, Clan Edition. `CATALOG.areas` has no row. The house takes the den's indoor guards through `src/indoor.js`.

**Tech Stack:** Plain ES modules, Three.js 0.185, Vite 8, Vitest 4, headless Chrome through `scripts/record-page.mjs` (unchanged), ffmpeg.

**Spec:** `docs/superpowers/specs/2026-11-20-old-house-design.md`, "Build order" item 1. Sections used: "How it is built", "Calls I made after the builder check" (1 and 4), "Constraints", "Look and feel", "Anti-goals", "Non-goals", "Fit with the game" (Clan Edition only). Steps 2–4 get their own plans.

## Updates (2026-11-21)

This plan was written at `d320bd72`. Four things have landed on main since then, and `a906522d` merged them into `house`. These updates win over anything they contradict below. Line numbers are now from `a906522d`.

### How work runs now

- **U1. No symlink.** The worktree has its own `node_modules`. The "Setup, once" bullet in Global Constraints is withdrawn. Never run npm through a symlinked `node_modules`.
- **U2. The full suite** is `WW_PGLITE=/Users/pniessen/.npm/_npx/90d26507e643fcc0/node_modules/@electric-sql/pglite/dist/index.js npx vitest run`.
  - Before it, `ps -ax -o command | grep -E "^node .*vitest|/vitest/vitest.mjs"` must show no other real vitest. Never use `pgrep -fl`, and never write an unbounded wait loop.
  - No full suite from 18:30 to 19:30.
  - A single timeout while another suite runs is load: re-run that file alone. A run is judged by its "failed" count.
- **U3. No source-text tests** (rule S1, `docs/SESSION-HANDOFF.md`): no `readFileSync` of `src/`, and no pins on lines or comments. Task 8's tests are rewritten as behaviour on real walks (U12).
- **U4. Words, both sets.** Every child-facing word goes through the word tables, for both word sets. This replaces the "Words" bullet in Global Constraints.
  - Task 4 adds `house` to `PLACE_WORDS` in both tables: `'The Old House'` in `src/offclanwords.js` and `'The Old Twoleg Nest'` in `src/clanwords.js` (the spec's "an old Twoleg nest"; a placeholder the owner can rename). `areaData.name` is `words().PLACE_WORDS.house`, read in `build`. No string literal holds either name. `test/clanwords.test.js` already flags every clan `PLACE_WORDS` value found in a `src/` literal.
  - Refresh the snapshots with `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`, then revert any drift that isn't yours. `series-words-on-source.json` always picks up spurious `notReached` entries: revert those.
  - The test page's captions are plain words and contain no series word.
- **U5. Determinism.** `test/fixtures/flat-trace.gameplay.json` must not move.
- **U6. Long tests.** Long whole-walk tests carry explicit 60–90 s timeouts. Float fixtures compare with `closeDiffs`, because CI runs on Linux.
- **U7. Real-game checks** use a dev server on port **5404** with `--strictPort`, not 5381. The game stays muted: seed `muted: true`, run Chrome with `--mute-audio`, and never press M.
- **U8. Builds.** Task 9 runs both `npm run build` and `npm run build:ios`. The "900 kB" ceiling is withdrawn (U9).

### F6: every place is its own download

- **U9. The house is its own place chunk.** Each place loads through `src/world/areas.js` and `startWalkWhenReady` (`src/game/walk.js`, `src/game/areaload.js`). `startWalk` throws if the place isn't loaded.
  - Ceilings, from `scripts/buildjson.mjs`: start-up is at most 700 kB gzipped (`MAIN_GZIP_CEILING_KB`), and the house chunk is at most 100 kB (`AREA_GZIP_CEILING_KB`).
  - Task 8 adds the house to the registry: `house: () => import('./house.js').then((w) => own('house', w)),` in `AREA_LOADERS`, and `house: Object.freeze(['src/world/house.js']),` in `AREA_ENTRY_MODULES`.
  - Task 8 adds `if (houseOn()) areas.prefetch('house');` to `main.js`, beside `if (roofsOn()) areas.prefetch('roofs');`.
  - Outside tests and the picture page, only `src/world/areas.js` imports `src/world/house.js`.
  - `houseplan.js`, `houseparts.js`, `houselife.js`, `housewalls.js` and `houselevels.js` are reached only from `house.js`, so they all land in its chunk.
  - `houseflag.js` and `indoor.js` are in start-up and import nothing of the house. `housetour.js` is imported only by tests and the picture page.
  - `test/areas.test.js` and `test/lazybuild.test.js` must pass.
- **U10. The start goes through the loader.** There is no `const AREAS = { ... }` in `walk.js` any more. Task 8's `beginWalkFromHomebase` line goes right after the Rooftops line, `if (roofsOn() && !getPendingRoom()) return startWalkWhenReady(...)`, and reads:
  ```js
  if (houseOn() && isClanEdition(progression.state) && !getPendingRoom()) return startWalkWhenReady({ duskMode, areaOverride: 'house' });
  ```
  With both switches on, the Rooftops wins.

### Rooftops steps 2 and 3 (the "rooftops-2" of the shared-files table)

Both have landed. The shared-files table below is history. What actually landed is this:

- **U11. Files shared with the Rooftops.**
  - `walk.js`: the weather line is now `if (!duskActive && !isDen && areaData.evening !== true) {`. With `indoor` it becomes `if (!duskActive && !indoor && areaData.evening !== true) {`. The other six guards in Task 8 are found by their quoted code, as before.
  - `main.js`: `resumableAreaIds` already exists, in `src/roofsflag.js`. It takes the walks object, and `main.js` calls `readResume(..., { areaIds: resumableAreaIds(progression.state.walks) })`.
    - So `src/houseflag.js` exports `resumableHouseIds(ids) → ids.filter((id) => id !== 'house' || houseOn())` (an array in, an array out) and does **not** export a second `resumableAreaIds`.
    - `main.js` becomes `areaIds: resumableHouseIds(resumableAreaIds(progression.state.walks))`.
  - `progression.js`: `walks` ends `fair: 0, roofs: 0`. Add `house: 0` last, and add the clause to the comment above it.
  - `test/progression.test.js` has eight `walks` objects that end `roofs: 0`, not three. Each one gets `house: 0`.
    - Any other test whose fixed per-area table iterates `AREA_LOADERS` or the walks keys gets a `house` entry (for example `test/waterlooks.test.js` `BUILD_DRAWS`, if it fails).
    - Nothing else in an existing test is edited, except the snapshot refresh (U4).
  - `audio.js`: the two lines read exactly as quoted in Task 8. A Rooftops branch sits between them.
  - `src/traversal.js` exports `stickToWorld`, `facingYaw` and `behindYaw` (checked).
- **U12. What the Rooftops taught the walk.** An area record with `strays: false` gets no strays, no wanderer and no ghosts.
  - Task 4 adds `strays: false` to the house's `areaData`.
  - Task 8's tests follow `test/roofswalk.test.js` and `test/roofsload.test.js`: the real `createWalkLifecycle` through `test/helpers/walklife.js` `lifecycle()`, with real walks started and ended. The tests show that:
    - `?house=1` starts a solo house walk in Clan Edition and nowhere else (Legacy, or a room, walks as before);
    - a house walk waits for its download, and a failed download stays home with the gentle line;
    - a house walk note is dropped without the flag;
    - a house walk counts `walks.house`;
    - indoors there are no weather, secrets, strays, wanderer, legend, ghosts, goals, sky birds or corner map;
    - zoom step 3 is kept in the house;
    - the house sounds like the den (the fire, no crickets at dusk).
  - **Task 8 audit.** Check every `isDen` that Task 8 leaves in `walk.js`, and every system keyed by area, against a house walk: the grass (`GRASS_STYLES`), paw prints, gifts, carryables (`propsFor`), the villager giver, colony cats, the border and gate dressing, and the dusk lamp pools. For each one, record in the report whether it holds by data (the house hands it empty lists) or needs `indoor`.
    - Expected: no grass grows inside a room.
    - Expected: the lamp pools do come at dusk (`!isDen` already allows them).

### Map gateways (world map step 3)

- **U13. Only a seam in step 1.** `src/gateways.js` already reserves the end pair `town-house` / `house-town` for House step 4: `placement: 'inside'`, an explicit `arrive`, and `look: 'none'`, because the house draws its own door.
  - Step 1 adds no `GATEWAY_ENDS` row and no catalog row, so `liveEndsFor('house')` is `[]` and no gate is drawn. `gateways.js` does not change.
  - The seam is data. Task 1 adds to `houseplan.js`:
    ```js
    HOUSE_FRONT_DOOR = Object.freeze({ x: 0, z: 12, faces: 'south', arrive: Object.freeze({ x: 0, z: 9.5, yaw: 0 }) })
    ```
    This is the shut door on the Hall's south wall, and the spot and facing where she lands coming in (yaw 0 faces −z). `HOUSE_SPAWN` is the `arrive`'s x and z.
  - A Task 1 test checks that the door's x lies on the hall's south wall line, inside a `hall-s` section, and that the `arrive` spot is reachable.
  - Task 4 draws the shut door at `HOUSE_FRONT_DOOR`. `build` accepts the `gateEnds` that `walk.js` passes and, in step 1, ignores it. Step 4 opens the door when a `house-town` end comes in.

### Lifelike people (branch `people`, not merged)

- **U14. No people in step 1.** The house has no people and no resident cat yet.
  - No house module imports `buildTwolegFigure`, `src/critters.js`'s villager or `src/fairshow.js`. The house's `critterSpawns` is `[]`.
  - The neighbour houses come from `builder.js` `house()`, which draws no figure. Task 4 checks this.
  - The old cat (step 3) goes in her own module, apart from anything the people work will replace.

### The pictures and the film (Tasks 7 and 9)

- **U15. Shots.** `HOUSE_SHOTS` adds:
  - `dollhouse-far`: the parlour at zoom 2 (Far). `dollhouse` stays at zoom 3 (Farther). Owner question 2 is answered by the pair.
  - `stairs-back` and `stairs-cellar`, on those stairs at zoom 1.
  - `levels`: zoom 3 from the main stair's foot, so the split levels read.
  - Every shot passes the Task 7 shot test.
- **U16. Output.** The pictures go to `/private/tmp/claude-501/-Users-pniessen--claude-spares-spare-gcns3j/e37e3895-a9b0-4a89-9360-a15387ffb2e4/scratchpad/house/`, with `dusk/` and `before/` (`sink=0`) beneath it.
  - The film is **30–45 s**, not 40–90 s. If the grand tour runs longer at real time, Task 7 adds a shorter `film` tour. It shows every room, a stair up and a stair down, a wall sinking, and the zoom out to Farther, and it is walked by the same pilot and passes the same test as `grand`.
  - Step 1 sinks walls and never fades them (H1), so there is no fade picture. The `before/` picture is the comparison.

## Rulings (my calls; the owner can overturn each)

- **H1. Walls sink, never fade.** A section between the camera and the cat sinks to a 0.25 m stub. It goes down in 0.2 s. It rises only after it has not been wanted for 0.5 s, then takes 0.6 s.
  - Why sinking: it is calm, it needs no transparent materials (no sorting, no clones), and it costs no draws.
  - Window panes in a sinking section are hidden while it is below half height.
- **H2. No room has a ceiling or roof, as in the den.** At the default step the camera sits at the wall tops, so any ceiling would be between it and the cat at every step. The only overhead pieces are the lintels over doorways. They are sections with a stub of 0, so they sink to nothing. The cut-away therefore has walls and lintels to cut, and a later overhead piece (attic beams in step 2) joins the same rule as a section with stub 0.
- **H3. Walls stop the cat with collider chains**, not with raised ground. Each chain is circles of r 0.2 every 0.25 m along every solid wall run (doorways and stair openings are left open).
  - Why: a ground rim at a wall would make the camera's rock rule (`camzoom.js` `cameraClearFraction`) pull the camera onto the cat whenever she backs into a wall.
  - Circles have no height, but no two levels share any x, z (split levels), so a chain only ever touches its own floor. A test proves it.
- **H4. The lawn around the house is ground at 0.** Without it, the camera beside the sunken cellar could drop below the drawn lawn. With it, the rock rule keeps the camera above the lawn. The cellar and its stair are holes in the lawn.
- **H5. The layout** (x east, z south; all rectangles axis-aligned):

  | Level | y | Rooms (x range, z range) |
  |---|---|---|
  | `cellar` | −1.8 | Cellar [20, 30] × [−10, 0] |
  | `ground` | 0 | Hall [−4, 4] × [2, 12]; Library [−14, −4] × [2, 12]; Parlour [4, 14] × [2, 12]; Kitchen [4, 14] × [−8, 2] |
  | `upstairs` | 2.4 | Bedroom [−8, 2] × [−16, −6.4] |
  | `attic` | 4.2 | Attic [−24, −14] × [−16, −6] |

  - Stairs (centreline, width, rise/run):
    - `main`, ground→upstairs: (0, 2)→(0, −6.4), width 3.0, rise 2.4 over 8.4 m (0.286).
    - `back`, upstairs→attic: (−8, −11)→(−14, −11), width 2.4, rise 1.8 over 6.0 m (0.3).
    - `cellar`, ground→cellar: (14, −5)→(20, −5), width 2.4, rise −1.8 over 6.0 m (0.3).
  - Doorways (width 2.0, lintel at 2.2): Hall–Library at (−4, 7) on x = −4; Hall–Parlour at (4, 7) on x = 4; Parlour–Kitchen at (9, 2) on z = 2.
  - The front door is drawn shut on the Hall's south wall at x 0 (step 4 opens it). The Library is a dead end until step 2's hidden passage. Its future space, the courtyard [−14, −1.5] × [−6.4, 2], is lawn.
  - Spawn (0, 9.5), facing −z. Cat bounds [−24, 30] × [−16, 12].
- **H6. Level drawing.** The cat's level is the level whose floor is nearest her paws, with 0.3 m of hysteresis past a stair's midpoint. "Next to it" means joined by a stair.
  - Full: her level and its neighbours. The rest: each level's furniture is hidden and one stand-in mesh of plain boxes is shown.
  - Walls, floors, stairs, windows and lamps are always drawn.
  - Always on, not behind `?grow=1`. The drawn set depends only on her level, so the worst spot is the worst level.
- **H7. Into the game.** `?house=1` makes Explore start a solo house walk, in Clan Edition only (the spec: "Legacy Edition does not get it") and never in a room.
  - No `CATALOG.areas` row, so nothing offers it.
  - `walks.house` starts at 0, so a walk counts. A house resume note is dropped without the flag.
  - Like the den, the house has no weather, secrets, strays or wanderer, legend, daily goals, sky birds or minimap. Its ambient sound is the den's (the fire). It has no birdsong and no crickets.
- **H8. Tall furniture fades; floors never do.** A piece 1.6 m or taller is its own top-level group with `userData.fadeOccluder`, so `treefade.js` fades it. It stands with its back against a wall.
  - Window panes are top-level meshes. `findFadeOccluders` treats any group holding a `userData.window` mesh as a building and fades it whole, so a pane inside a level's walls group would fade that whole level.
- **H9. Not in step 1** (each named for its step):
  - dust motes (`render/ambient.js` `motes` look for a water rectangle; step 2 gives the house its own kind);
  - creaks and the clock's tick (step 2, with the clock);
  - the front door opening and the map spot (step 4);
  - how a partner on another level is marked (step 4's co-walk checks). Step 1 guarantees that level drawing never hides any cat.

## Questions only the owner can answer

1. **The feel:** do the walls sinking to a skirting-board stub (H1) look calm in the film, or would he rather they fade?
2. **The cut-away:** it starts at the "Far" view step. Should "Far" keep the walls and only "Farther" make the dollhouse?
3. **The layout:** is the plan in H5 right? It has the hall, library, parlour and kitchen on the ground, the bedroom up the big stair, the attic up a back stair, and the cellar down from the kitchen.
4. **Legacy:** H7 keeps `?house=1` to Clan Edition. Does any device he tests on still play Legacy?
5. **Later steps:** no daily goals and no corner map in the house, as in the den. Does he want them there once there are things to do (step 2)?

## Global Constraints

- **Work only in** `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/house`, on branch `house`.
  - Never touch the main checkout.
  - Never merge or push, and never touch the database or any `.env` file.
  - Dispatch no subagents unless the controller does.
- **Setup, once:** `ln -s /Users/pniessen/CLAUDE-CODE/projects/cat-game/node_modules node_modules`. Do not run `npm ci`.
- **Commits:** `git add <exact paths>`, never `-A` or `.`. Every message starts "Old House step 1: " and ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tests:**
  - During tasks, run single files: `npx vitest run test/<file>`.
  - The full suite runs in Task 9. Before it, check `uptime` against `sysctl -n hw.ncpu`, and wait while the 1-minute load is above the core count.
  - Any test that builds a scene or a player stubs `document` as `test/flattrace.test.js` does (the canvas `getContext` proxy, `addEventListener() {}`, `pointerLockElement: null`, `exitPointerLock() {}`), then imports with `await import(...)`.
- **Spec values, verbatim:**
  - "Split levels, never one room directly above another".
  - "each level is offset from the one below, with stairs or ramps between them (no slope steeper than 1 in 3, so a storey's stairs take about 7–9 m). The attic is the highest level and the cellar the lowest, each off to one side."
  - "A wall (or wall section) that comes between the camera and the cat sinks to a low stub or fades. Walls behind the cat stay full height, so rooms still read as rooms." "it must look calm, not flicker."
  - "The cat's own level and the ones next to it are drawn in full; levels further away are drawn simply." "A partner on another level is always visible."
  - "When she zooms out, walls near the camera and any roof or ceiling between camera and cat are cut away, so she sees her level from above like a dollhouse. The den's zoom cap (`src/camzoom.js`) does not apply here."
  - "Stairs are walkable slopes with the same thumb controls, and the camera eases as the floor changes."
  - "the street ceiling of 450 meshes, 380 shadow casters and 70,000 triangles, measured at the worst spot in the house: the most that is ever drawn at once, the way `test/helpers/growbudget.js` measures the grown areas".
  - "If the camera ever shows a wall instead of the cat, the house has failed. That holds for any room, any corner and either player."
  - "Stairs, doorways and climbs must work with the same thumb controls as outdoors. No precise jumps."
  - "No ghosts, no jump scares, no pitch-dark rooms. The cellar is dim and friendly: warm lamp light, cobwebs, barrels, mice."
  - "By day the light comes through the windows. At dusk the lamps glow, as the dusk choice does elsewhere." "Warm wood, wallpaper, rugs, old lamps".
  - "No weather, strays, dogs, enemies or fights indoors." "The den does not change, and the house does not connect to it."
  - "Legacy Edition does not get it".
  - "Determinism for two players: placements are data or seeded on their own salted streams." "Offline-first: nothing contacts the database."
  - "No series words in string literals outside them (`test/clanwords.test.js`)."
- **Performance:**
  - The ceilings above are asserted for every level's drawn set, day and dusk, after the merge (Task 5).
  - Aim for 300 meshes, 200 casters and 55,000 triangles at the worst level.
  - Walls, floors and furniture share one atlas material (`createHouseAtlas`, a `DataTexture`).
  - Small things are `noCast`.
- **Deterministic:**
  - No `Math.random`, `Date.now` or `performance.now` in the plan, parts, build, walls or levels.
  - Variation comes from `hash01(x, z, salt)` (`src/world/builder.js`).
  - `build` runs inside `withLocalUuids('house', ...)` and takes 0 real `Math.random` draws.
- **Nothing that ships changes, except what a task names:**
  - `SAVE_VERSION`, the network message, `CATALOG.areas`, the golden-mouse totals, every other area's counts and `src/world/den.js` stay as they are.
  - No fixture changes.
  - No existing test is edited except the three `walks` objects in `test/progression.test.js` (Task 8).
- **Words:** the only child-facing word in step 1 is the HUD fallback name `'The Old House'` (`areaData.name`). Step 4 moves it into `PLACE_WORDS` for both word sets. The test page's tour captions contain no series word.
- **Line numbers** are from `d320bd72`. Find each site by the quoted code.

## Shared with `rooftops-2` (not merged; the owner's queue merges it first)

Step 1 depends on nothing in `rooftops-2`. These files are touched by both branches:

| File | Rooftops-2 changes | Step 1 changes | At rebase |
|---|---|---|---|
| `src/game/walk.js` | `AREAS.roofs`, the `roofsOn` branch, `walkDusk`, the weather line, the wanderer line | `AREAS.house`, the `houseOn` branch, `indoor` guards | Keep both. The weather line becomes `if (!duskActive && !indoor && areaData.evening !== true) {`. Put the house branch after the roofs branch. |
| `src/main.js` | the `readResume` `areaIds` filter for `roofs` | wraps that expression in `resumableAreaIds(...)` | Wrap whatever expression is there. |
| `src/progression.js` | `walks.roofs: 0` | `walks.house: 0` | Keep both keys, `house` last. |
| `test/progression.test.js` | `roofs: 0` in three `walks` objects | `house: 0` in the same three | Keep both. |
| `src/audio.js` | a `roofs` ambient branch | the den branch and the crickets line read `isIndoor` | Independent lines. |

Not shared: `test/budget.test.js`, `verify-traversal.html`, `src/traversal.js` and `test/helpers/traversalwalk.js`. Step 1 only imports `stickToWorld`, `facingYaw` and `behindYaw` from `src/traversal.js`, which exist on main.

## Review Focus

1. **She is pressed into a room corner and the camera is swung to look along one wall** (a grazing line through two walls).
   - Expected: both walls sink and she is seen.
   - Test: Task 6, `never lost in any corner, 16 directions, three pitches`.
2. **A thumb wiggles in a doorway**, so the camera crosses a wall line back and forth every 0.1 s.
   - Expected: the wall goes down once and stays down. It never pumps.
   - Test: Task 2, `a wall wanted on and off every 0.1 s goes down once and stays down`.
3. **She is halfway up a stair at the Farther view**, the camera over the level below.
   - Expected: no wall hides her for more than 0.25 s, and the camera never jumps.
   - Test: Task 6, `on every stair at every view step: never lost, and the camera eases`.
4. **A house walk left open, then the game opened without `?house=1`, in Legacy, or in a room.**
   - Expected: the note is dropped, and the flag starts nothing.
   - Test: Task 8, `the flag starts a solo Clan Edition house walk only` and `a house walk note is dropped without the flag`.
5. **Reduced motion is on.**
   - Expected: walls drop at once, still wait 0.5 s before rising, then rise at once.
   - Test: Task 2, `reduced motion snaps, and still waits before rising`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/world/houseplan.js` | create | Levels, rooms, stairs, doorways, windows, sections, ground spec, colliders, furniture, `houseArea()`. Pure. |
| `src/housewalls.js` | create | Which sections sink; their eased heights; who blocks the view. Pure. |
| `src/houselevels.js` | create | The cat's level, the full set, and showing and hiding tagged level objects. |
| `src/world/houseparts.js` | create | `createHouseAtlas`, the shared material, section, pane, floor, stair, skirt, lamp and furniture builders. |
| `src/world/house.js` | create | `build(scene, opts)`, the sky, dusk light and life hook. |
| `src/world/houselife.js` | create | `createHouseLife`: applies sink heights and level drawing every frame. |
| `src/world/housetour.js` | create | `HOUSE_SHOTS`, `HOUSE_TOURS`, `createHousePilot`. Pure. |
| `src/houseflag.js`, `src/indoor.js` | create | `houseOn`, `setHouse`, `resumableAreaIds`; `INDOOR_AREAS`, `isIndoor`. |
| `src/game/walk.js`, `src/main.js`, `src/progression.js`, `src/audio.js` | modify | Task 8 only. |
| `verify-house.html`, `.gitignore` | create / modify | The picture page; `!verify-house.html`. |
| `test/helpers/houseflood.js`, `test/helpers/housewalk.js`, `test/helpers/housebudget.js` | create | Level-aware flood; real player on `houseArea()`; worst-level measure. |
| `test/houseplan.test.js`, `test/housewalls.test.js`, `test/houselevels.test.js`, `test/house.test.js`, `test/housebudget.test.js`, `test/housecamera.test.js`, `test/housetour.test.js`, `test/housegame.test.js` | create | The tests named below. |

**Names:**
- The area id is `house` everywhere.
- "Section" means one piece of wall, lintel or stair wall that sinks as a unit.
- "Level" is one of `cellar`, `ground`, `upstairs`, `attic`.

---

### Task 1: The plan of the house

**Files:**
- Create: `src/world/houseplan.js`, `test/helpers/houseflood.js`, `test/houseplan.test.js`

**Interfaces:**
- Consumes: `createGround`, `validateGround`, `MAX_PATH_GRADE` from `src/ground.js`.
- Produces (all frozen):
  - Constants: `HOUSE_ID = 'house'`, `BASE_Y = -3`, `LAWN_Y = 0`, `WALL_H = 2.8`, `WALL_T = 0.2`, `STUB_H = 0.25`, `DOOR_W = 2.0`, `DOOR_H = 2.2`, `SECTION_MAX = 4.0`, `COLLIDER_R = 0.2`, `COLLIDER_STEP = 0.25`, `TALL_H = 1.6`.
  - `HOUSE_LEVELS`: `[{ id: 'cellar', y: -1.8 }, { id: 'ground', y: 0 }, { id: 'upstairs', y: 2.4 }, { id: 'attic', y: 4.2 }]`.
  - `HOUSE_ROOMS`: `[{ id, level, minX, maxX, minZ, maxZ }]` in the order hall, library, parlour, kitchen, bedroom, attic, cellar (H5).
  - `HOUSE_STAIRS`: `[{ id, from, to, x0, z0, x1, z1, width }]` in the order main, back, cellar (H5).
  - `LEVEL_LINKS`: `[[from, to]]`, one per stair, in stair order.
  - `HOUSE_DOORWAYS`: `[{ id, rooms: [a, b], x, z, axis: 'x' | 'z', width }]`. `axis` is the wall line's fixed coordinate.
  - `HOUSE_WINDOWS`: `[{ room, side: 'n'|'s'|'e'|'w', at, width, sill, head, round }]`.
    - Hall s ×2, either side of the door.
    - Library w ×2.
    - Parlour s ×2.
    - Kitchen n ×2.
    - Bedroom n ×1.
    - Attic w ×1, `round: true`.
    - Cellar e ×1, small and high (sill 1.6).
  - `HOUSE_BOUNDS = { minX: -24, maxX: 30, minZ: -16, maxZ: 12 }`; `HOUSE_SPAWN = { x: 0, z: 9.5 }`.
  - `HOUSE_FURNITURE`: `[]` in this task. Task 5 fills it.
  - `houseGroundSpec() → { base: BASE_Y, strips, discs: [], ceilings: [] }`.
    - Each room is a flat strip along its x extent, with width = its z extent, at its level's y.
    - Each stair is a sloped strip.
    - The lawn is flat strips at `LAWN_Y` covering `HOUSE_BOUNDS` grown by 12 m, minus the cellar and cellar-stair rectangles, as non-overlapping rectangles.
  - `houseSections() → [{ id, kind: 'wall'|'lintel'|'stair', level, owner, side, x0, z0, x1, z1, base, height, stub, outer, window }]`.
    - Every room edge is walled except its doorways and stair openings.
    - An edge shared by two rooms on one level is drawn once, by the room earlier in `HOUSE_ROOMS`.
    - Solid runs are split into equal pieces no longer than `SECTION_MAX`. Each window sits wholly inside one piece.
    - A lintel over each doorway: `base = level y + DOOR_H`, `height = WALL_H - DOOR_H`, `stub = 0`.
    - Each stair has two side walls along its long edges: `base = min(y0, y1)`, `height = |rise| + WALL_H`, `stub = STUB_H`.
    - Walls: `base = level y`, `height = WALL_H`, `stub = STUB_H`.
    - `outer` is true when the far side is lawn or another level.
    - `id` is `${owner}-${side}-${k}`, for example `hall-s-0` or `main-e-1`.
  - `houseColliders() → [{ x, z, r, level }]`:
    - circles of `COLLIDER_R` every `COLLIDER_STEP` along every `wall` and `stair` section's centreline, both ends included;
    - then one circle per `HOUSE_FURNITURE` entry with `r > 0`;
    - `level` is the section's or piece's level, and a stair's circles take its `from` level (the player reads only `x`, `z`, `r`).
  - `roomAt(x, z) → id | null`; `stairAt(x, z) → id | null`.
  - `houseArea() → { ground, colliders, bounds, spawn, levels, links, rooms, stairs, sections }`, with `ground = createGround(houseGroundSpec())`.
- `test/helpers/houseflood.js`: `houseFlood(area, start = area.spawn, step = 0.5) → { cells: [{ x, z }], reaches(x, z), reachesWithin(x, z, r) }`.
  - A 4-neighbour flood on the bounds grid.
  - A cell is open when `isWalkableAt(area, x, z)` (`src/player.js`).
  - A move is allowed when `area.ground.canStep(a, b)`.

- [ ] **Step 1: Write the failing tests** in `test/houseplan.test.js`:

```js
it('splits the levels: no two rooms or stairs on different levels share any floor', () => {
  // footprints: every room rect, every stair as its axis-aligned rect (centreline ± width/2)
  for (const [a, b] of pairsOnDifferentLevels(footprints)) expect(overlapArea(a, b)).toBeLessThan(1e-9);
});
it('has a valid ground with no ceilings, and each room reads its own level', () => {
  expect(validateGround(houseGroundSpec())).toEqual([]);
  expect(houseGroundSpec().ceilings).toEqual([]);
  for (const r of HOUSE_ROOMS) expect(area.ground.y(cx(r), cz(r))).toBe(levelY(r.level));
  expect(area.ground.y(-8, -2)).toBe(LAWN_Y);          // the courtyard lawn
  expect(area.ground.y(17, -5)).toBeCloseTo(-0.9, 6);   // halfway down the cellar stair
});
it('rises 1 in 3 or less on every stair; a storey takes 7 to 9 m', () => {
  for (const s of HOUSE_STAIRS) expect(Math.abs(rise(s)) / run(s)).toBeLessThanOrEqual(MAX_PATH_GRADE + 1e-9);
  expect(run(stair('main'))).toBeGreaterThanOrEqual(7);
  expect(run(stair('main'))).toBeLessThanOrEqual(9);
  expect(LEVEL_LINKS).toEqual([['ground', 'upstairs'], ['upstairs', 'attic'], ['ground', 'cellar']]);
  expect(HOUSE_LEVELS.at(-1).id).toBe('attic'); expect(HOUSE_LEVELS[0].id).toBe('cellar');
});
it('from the spawn reaches every room and stair, and nowhere else', () => {
  const f = houseFlood(area);
  for (const r of HOUSE_ROOMS) expect(f.reachesWithin(cx(r), cz(r), 2.5), r.id).toBe(true);
  for (const s of HOUSE_STAIRS) expect(f.reachesWithin((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, 0.5), s.id).toBe(true);
  for (const c of f.cells) expect(roomAt(c.x, c.z) ?? stairAt(c.x, c.z), `${c.x},${c.z}`).not.toBeNull();
});
it('walls every room edge except doorways and stair openings; no section is longer than 4 m', () => {
  // per room edge: sum of its sections' lengths + its openings' widths === edge length (±1e-6),
  // unless the edge is drawn by the room earlier in HOUSE_ROOMS; ids unique; every window inside one section
});
it('keeps the cat 0.45 m off every solid wall, and no collider touches another level', () => {
  for (const s of houseSections().filter((q) => q.kind !== 'lintel')) {
    for (const side of [-1, 1]) expect(isWalkableAt(area, ...offsetFromMid(s, 0.45 * side))).toBe(false);
  }
  for (const c of area.colliders) {
    // a stair's circles may touch both of its levels' rooms; nothing else
    for (const fp of footprintsNotOn(c.level, stairLevelsOf(c))) expect(circleOverlapsRect(c, shrink(fp, 0.01))).toBe(false);
  }
});
it('leaves every doorway a clear path for her centre across its middle 0.6 m', () => {
  for (const d of HOUSE_DOORWAYS) for (const o of [-0.3, 0, 0.3]) expect(f.reachesWithin(...alongDoor(d, o), 0.26)).toBe(true);
});
```

`pairsOnDifferentLevels`, `overlapArea`, `cx`, `cz`, `levelY`, `stair`, `rise`, `run`, `offsetFromMid`, `footprintsNotOn`, `stairLevelsOf`, `circleOverlapsRect`, `shrink` and `alongDoor` are small helpers local to the test file.

- [ ] **Step 2: Run them to see them fail.** `npx vitest run test/houseplan.test.js`. Expected: FAIL (no module).
- [ ] **Step 3: Write `src/world/houseplan.js` and `test/helpers/houseflood.js`** to the Interfaces block. The lawn rectangles come from a small `rectMinus(outer, holes)` inside the module, which cuts the outer rectangle on the holes' edge coordinates and keeps the cells that no hole covers.
- [ ] **Step 4: Run them to see them pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/world/houseplan.js test/helpers/houseflood.js test/houseplan.test.js
git commit -m "Old House step 1: the plan of the house on split levels, its stairs, walls and colliders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Which walls sink

**Files:**
- Create: `src/housewalls.js`, `test/housewalls.test.js`

**Interfaces:**
- Consumes: the section shape from Task 1. Nothing else is imported, so the module stays THREE-free.
- Produces:
  - `SINK = Object.freeze({ downS: 0.2, holdS: 0.5, upS: 0.6, linePad: 0.25, nearCamera: 1.2, cutawayDist: 5.75, frontMargin: 0.5, paneHide: 0.5 })`; `PAWS_Y = 0.2`.
  - `segmentMeetsSection(a, b, s, pad = 0, height = s.height) → boolean`. `a` and `b` are `{x, y, z}`. The test is against the section's box: its centreline, `WALL_T / 2 + pad` either side, from `s.base` to `s.base + height`, in the section's own frame.
  - `makeView(cat, cam, lookY, out = {}) → { cam, look, paws, cat, cutaway }`.
    - `look` is the cat's position plus `lookY`; `paws` is plus `PAWS_Y`.
    - `cutaway` is true when the horizontal distance from camera to cat is at least `SINK.cutawayDist`, which lies between the Middle (4.5 m) and Far (7.0 m) steps.
  - `wantsDown(s, view) → boolean`, true when any of these holds:
    1. `segmentMeetsSection(cam, look, s, linePad)` or `segmentMeetsSection(cam, paws, s, linePad)`, at full height;
    2. the camera is within `nearCamera` of the section's centreline horizontally and below `s.base + s.height + 0.5`;
    3. `view.cutaway` and the section's nearest point to the camera is nearer (horizontally) than the cat by more than `frontMargin`.
  - `createWallSink(sections, { reducedMotion = false } = {}) → { update(dt, view), fraction(id), isDown(id) }`. `fraction` is in `[s.stub / s.height, 1]`.
    - Down is linear over `downS`.
    - Up waits until unwanted for `holdS` in a row, then is linear over `upS`.
    - Reduced motion jumps instead of easing, and keeps the wait.
    - `update` allocates nothing.
  - `blockers(sections, sink, view) → string[]`: ids whose current height (`fraction × height`) meets `cam→look` or `cam→paws` with pad 0.

- [ ] **Step 1: Write the failing tests:**

```js
const wall = { id: 'w', kind: 'wall', x0: -2, z0: 0, x1: 2, z1: 0, base: 0, height: 2.8, stub: 0.25 };
const cat = { x: 0, y: 0, z: -2 };
const behind = makeView(cat, { x: 0, y: 2.9, z: 2.4 }, 0.74);   // camera south of the wall, cat north
it('sinks a wall between camera and cat, not one behind the cat', () => {
  expect(wantsDown(wall, behind)).toBe(true);
  expect(wantsDown({ ...wall, z0: -4, z1: -4 }, behind)).toBe(false);
});
it('sinks a wall the camera stands beside, and lets a segment pass over a low one', () => {
  expect(wantsDown({ ...wall, z0: 3.3, z1: 3.3 }, behind)).toBe(true);   // 0.9 m from the camera
  expect(segmentMeetsSection({ x: 0, y: 3, z: 2 }, { x: 0, y: 3, z: -2 }, wall)).toBe(false);
});
it('cuts away walls in front of the cat when zoomed out, and keeps the far wall', () => {
  const far = makeView({ x: 0, y: 0, z: 0 }, { x: 0, y: 6.5, z: 8 }, 0.74);
  expect(far.cutaway).toBe(true);
  expect(wantsDown({ ...wall, z0: 4, z1: 4 }, far)).toBe(true);
  expect(wantsDown({ ...wall, z0: -4, z1: -4 }, far)).toBe(false);
});
it('goes down in 0.2 s, waits 0.5 s, rises in 0.6 s', () => { /* step at 1/60: fraction hits stub/height by 0.2 s (±1 frame); after release unchanged until 0.5 s, back at 1 by 1.1 s (±1 frame) */ });
it('a wall wanted on and off every 0.1 s goes down once and stays down', () => { /* 3 s of toggling: fraction never rises above stub/height after 0.2 s */ });
it('reduced motion snaps, and still waits before rising', () => { /* one update: at stub; unwanted 0.49 s: still at stub; 0.51 s: at 1 */ });
it('drops a lintel to nothing', () => { /* stub 0: fraction 0 */ });
it('names only standing walls that block', () => { /* a down wall is not in blockers; a standing one on the line is */ });
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run test/housewalls.test.js`. Expected: FAIL.
- [ ] **Step 3: Write `src/housewalls.js`.**
- [ ] **Step 4: Run them to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/housewalls.js test/housewalls.test.js
git commit -m "Old House step 1: walls between the camera and the cat sink, calmly, and cut away when zoomed out

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Which levels are drawn in full

**Files:**
- Create: `src/houselevels.js`, `test/houselevels.test.js`

**Interfaces:**
- Consumes: `HOUSE_LEVELS`, `LEVEL_LINKS` shapes from Task 1.
- Produces:
  - `LEVEL_SWITCH = 0.3`.
  - `nextLevel(curId, pawsY, levels) → id`. It moves to another level only when `|pawsY - other.y| + LEVEL_SWITCH < |pawsY - cur.y|`.
  - `fullLevels(id, links) → Set<id>`: the level and every level a stair joins it to.
  - `createLevelDrawing(scene, { levels, links, start }) → { update(pawsY), get current(), get full() }`. It walks `scene.children` once at creation. On each level change it writes `visible` only on:
    - objects with `userData.houseDetail` (shown when their `userData.houseLevel` is in the full set);
    - objects with `userData.houseSimple` (a level id; shown when it is not).

- [ ] **Step 1: Write the failing tests:**

```js
it('changes level 0.3 m past the stair midpoint, both ways', () => {
  let id = 'ground';
  for (const y of [0.6, 1.2, 1.34]) expect(id = nextLevel(id, y, HOUSE_LEVELS)).toBe('ground');
  expect(id = nextLevel(id, 1.36, HOUSE_LEVELS)).toBe('upstairs');
  expect(id = nextLevel(id, 1.06, HOUSE_LEVELS)).toBe('upstairs');
  expect(nextLevel(id, 1.04, HOUSE_LEVELS)).toBe('ground');
});
it('draws her level and its neighbours in full', () => {
  expect([...fullLevels('ground', LEVEL_LINKS)].sort()).toEqual(['cellar', 'ground', 'upstairs']);
  expect([...fullLevels('attic', LEVEL_LINKS)].sort()).toEqual(['attic', 'upstairs']);
  expect([...fullLevels('cellar', LEVEL_LINKS)].sort()).toEqual(['cellar', 'ground']);
});
it('swaps far levels for their stand-ins and never touches anything else (a partner stays visible)', () => {
  // fixture scene: per level one houseDetail group + one houseSimple mesh, plus a cat Group and an untagged mesh;
  // walk pawsY from -1.8 up to 4.2 in 0.05 steps: detail.visible === full.has(level), simple.visible === !full.has(level);
  // the cat and the untagged mesh keep visible === true at every step
});
it('is always on: the same with ?grow=1 on or off', () => { /* setGrow(true) / setGrow(false): identical visibility trace; finally setGrow(null) */ });
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Write `src/houselevels.js`.**
- [ ] **Step 4: Run them to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit** `src/houselevels.js test/houselevels.test.js` with message "Old House step 1: her level and the ones next to it drawn in full, the rest as simple stand-ins".

### Task 4: The shell, built

**Files:**
- Create: `src/world/houseparts.js`, `src/world/house.js`, `test/house.test.js`

**Interfaces:**
- Consumes:
  - Task 1's plan;
  - `withLocalUuids` (`src/world/localuuids.js`);
  - `hash01`, `applySky`, `tree`, `house as neighbourHouse` (`src/world/builder.js`);
  - `litMaterial` (`src/render/materials.js`);
  - `applyDusk`, `duskLook`, `createLampPools`, `DUSK` (`src/render/dusk.js`, the last three in tests).
- Produces:
  - `houseparts.js`:
    - `createHouseAtlas() → THREE.DataTexture`: 256×256 RGBA in 64-px cells, `HOUSE_ATLAS_CELLS` naming them. The cells are one wallpaper per room, outside brick, oak, pine and stone floors, light and dark wood, two rugs, and plaster. Pixels come from `hash01`.
    - `houseMaterial(atlas)`: one `litMaterial(0xffffff, { map: atlas })`.
    - `sectionMesh(section, material) → THREE.Mesh`:
      - its geometry's base is at local y 0, and `mesh.position.y = section.base`;
      - holes for its windows; wallpaper inside, brick outside, a skirting board and a dado rail;
      - `userData.houseSection = id`.
    - `paneMesh(section, window) → THREE.Mesh` with `userData.window = true` and `userData.houseSection = id`.
    - `floorMesh(room)`, `stairMesh(stair)` (a solid wedge whose treads straddle the ramp), `skirtMesh(room)` (from `LAWN_Y` up to a raised floor), `lampGroup(kind, x, y, z)` (`userData.lampGlobeY > 0`; the globe mesh has `userData.lampGlobe = true`, `userData.noMerge = true`).
  - `house.js`:
    - `HOUSE_SKY = { top: 0x9fd4e8, horizon: 0xcfe8f0 }`, `HOUSE_SKY_DUSK = { top: 0x2a3a5e, horizon: 0x6a5a7e }`, `HOUSE_GROUND_BOUNCE = 0x8a6440`.
    - `HOUSE_DUSK_LIGHT = { sunColor: 0xffc890, sunIntensity: 0.5, hemiSky: 0xc8a07a, hemiIntensity: 0.85, groundDim: 0.8, envScale: 0.6, fogNear: 60, fogFar: 160 }`.
    - `build(scene, { wind } = {}) → areaData`:
      - `name: 'The Old House'`, `ground`, `colliders`, `bounds`, `spawn` (from `houseArea()`);
      - `pois: []`, `collectibles: []`, `scenics: []`, `critterSpawns: []`, `moments: []`, `puddles: []`, `boxes: []`, `perches: []`, `tippables: []`;
      - `groundBounce`, `skyDusk: HOUSE_SKY_DUSK`, `duskLight: HOUSE_DUSK_LIGHT`;
      - `house: { levels, links, sections, start: 'ground', sectionMeshes: Map<id, Mesh>, panes: Map<id, Mesh[]> }`;
      - `life` (Task 6 sets it; `undefined` until then).
    - The scene: one top-level `Group` of section meshes per level (`userData.noMerge = true`, `userData.houseWalls = levelId`); floors, stairs and skirts as top-level meshes; panes as top-level meshes; one lamp group per room (two in the cellar), always drawn.
    - Outside: the lawn with the cellar hole, a hedge ring, three neighbour houses and four trees, all at least 8 m outside `HOUSE_BOUNDS`.

- [ ] **Step 1: Write the failing tests** in `test/house.test.js`:

```js
it('returns every key the den returns except its furniture', () => {
  const denKeys = Object.keys(buildDen(new THREE.Scene())).filter((k) => k !== 'furniture');
  expect(Object.keys(area)).toEqual(expect.arrayContaining(denKeys));
});
it('takes no Math.random draws and builds the same twice', () => {
  expect(drawsDuring(() => build(new THREE.Scene()))).toBe(0);
  expect(fingerprint(sceneA)).toEqual(fingerprint(sceneB));        // test/helpers/growriver.js
});
it('builds every section as one mesh in its level\'s walls group, its base at local 0', () => {
  for (const s of area.house.sections) {
    const m = area.house.sectionMeshes.get(s.id);
    expect(m.parent.userData.noMerge).toBe(true);
    m.geometry.computeBoundingBox();
    expect(m.geometry.boundingBox.min.y).toBeCloseTo(0, 6);
    expect(m.position.y).toBe(s.base);
  }
});
it('keeps window panes top-level, so the tree fade never takes a floor of the house for a building', () => {
  // every userData.window mesh inside HOUSE_BOUNDS has parent === scene and a houseSection with window: true;
  // every findFadeOccluders(scene) entry with a `box` lies wholly outside HOUSE_BOUNDS (the neighbours)
});
it('lights every room with a lamp, the cellar with two, and is never pitch-dark at dusk', () => {
  expect(duskLook(area).hemiIntensity).toBeGreaterThanOrEqual(DUSK.hemiIntensity);
  expect(duskLook(area).hemiIntensity).toBeGreaterThanOrEqual(0.7);
  // lamp groups per room by roomAt(lamp x, z): >= 1 each, cellar >= 2;
  // after applyDusk, every lampGlobe mesh has a non-zero emissive; createLampPools(scene) returns a mesh
});
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run test/house.test.js`. Expected: FAIL.
- [ ] **Step 3: Write `houseparts.js` and `house.js`.** Every part takes `hash01` for variation and runs inside the one `withLocalUuids('house', ...)` in `build`.
- [ ] **Step 4: Run them, and Task 1's tests, to see them pass.** `npx vitest run test/house.test.js test/houseplan.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the three files with message "Old House step 1: the shell drawn (walls in sections, floors, stairs, windows, lamps, the garden), day and dusk light".

### Task 5: The rooms furnished, and the worst-spot budget

**Files:**
- Modify: `src/world/houseplan.js` (fill `HOUSE_FURNITURE`), `src/world/houseparts.js` (furniture builders), `src/world/house.js` (place them, the stand-ins)
- Create: `test/helpers/housebudget.js`, `test/housebudget.test.js`
- Test: `test/houseplan.test.js`, `test/house.test.js` (add cases)

**Interfaces:**
- Consumes: `budgetOf` from `test/helpers/growriver.js` (import only, unchanged); `castsFromBox`, `isTransparentMat` from `src/render/rig.js`; `mergeStaticProps`.
- Produces:
  - `HOUSE_FURNITURE`: `[{ id, room, kind, x, z, rotY, r, h }]`. `r` is the collider radius, or 0 for anything walked over.
    - Hall: grandfather clock (tall), console table, bench, umbrella stand, runner.
    - Library: three bookcases (tall) on the west and north walls, a rolling ladder against one, a reading chair, a desk, a globe, a rug.
    - Kitchen: counters on the north wall, a range, a table and two chairs, a plate dresser (tall), a sink.
    - Parlour: a fireplace with mantel on the east wall, two armchairs, an upright piano on the south wall, a side table, a rug.
    - Bedroom: a big bed, a wardrobe (tall), a chest of drawers, a bedside table, a rug.
    - Attic: stacked boxes no higher than 1.4 m, an old trunk, an old chair, a rug.
    - Cellar: barrels, jar shelves (tall), crates, flat cobwebs (`noCast`).
  - Each tall piece (`h >= TALL_H`) is a top-level group:
    - `userData.fadeOccluder = [{ t: 'cyl', r: footprint half-diagonal, y0: 0, y1: h }]`;
    - `userData.houseDetail = true`, `userData.houseLevel = level`.
  - The other pieces of a room are one top-level group tagged the same way, merged by `mergeStaticProps`.
  - One stand-in mesh per level: a box per piece at its footprint and 0.9 × its height, one flat colour per room, `userData.houseSimple = level`, `userData.noCast = true`.
  - `test/helpers/housebudget.js`:
    - `measureHouse(scene, rig) → { fixed, detail: Map<level, cost>, simple: Map<level, cost>, at(levelId) }`, each cost a `budgetOf` result.
      - `fixed` is every top-level child without `houseDetail` or `houseSimple`.
      - `at(id)` is `fixed` plus the detail of every level in `fullLevels(id)` plus the stand-ins of the rest.
    - `houseWorstSpot(measure, levelIds) → { level, meshes, casters, triangles }`: the level with the most triangles.

- [ ] **Step 1: Write the failing tests:**

```js
// test/housebudget.test.js — the scene as walk.js renders it: build, mergeStaticProps, the caster rule
for (const light of ['day', 'dusk']) {
  it(`every level's drawn set is under 450 meshes, 380 casters, 70,000 triangles (${light})`, () => {
    const scene = new THREE.Scene(); const area = build(scene);
    mergeStaticProps(scene);   // walk.js's order: merge, then dusk
    if (light === 'dusk') { applyDusk({ scene, sun: createSun(), fill: createFill(area.groundBounce), areaData: area }); createLampPools(scene); }
    const m = measureHouse(scene, { castsFromBox, isTransparentMat });
    for (const { id } of HOUSE_LEVELS) {
      const s = m.at(id);
      expect(s.meshes, id).toBeLessThanOrEqual(450);
      expect(s.casters, id).toBeLessThanOrEqual(380);
      expect(s.triangles, id).toBeLessThanOrEqual(70000);
    }
    if (process.env.BUDGET_LOG) console.log(light, JSON.stringify(houseWorstSpot(m, HOUSE_LEVELS.map((l) => l.id))));
  });
}
it('draws far levels simply: a stand-in costs less than the detail it stands for', () => {
  for (const { id } of HOUSE_LEVELS) {
    expect(m.simple.get(id).meshes).toBeLessThan(m.detail.get(id).meshes);
    expect(m.simple.get(id).triangles).toBeLessThan(m.detail.get(id).triangles);
  }
});
// test/houseplan.test.js
it('stands every tall piece with its back to its room\'s wall', () => { /* distance from (x, z) to the nearest edge of its room <= 0.8 */ });
// test/house.test.js
it('makes every tall piece a fade occluder, and tags every detail object with a level', () => {
  // findFadeOccluders(scene) entries without a box: count === HOUSE_FURNITURE.filter(h >= TALL_H).length;
  // every houseDetail child has a houseLevel among HOUSE_LEVELS; exactly one houseSimple mesh per level, noCast
});
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run test/housebudget.test.js test/houseplan.test.js test/house.test.js`. Expected: the new cases FAIL.
- [ ] **Step 3: Furnish the rooms.** Keep every Task 1 test green: the flood still reaches every room, and every doorway and stair opening keeps its clear middle.
- [ ] **Step 4: Run them to see them pass.** Run the same three files, with `BUDGET_LOG=1` once. Expected: PASS, and the logged worst level is near the aims in Global Constraints. If it is over an aim, merge or simplify before going on.
- [ ] **Step 5: Commit** the seven files with message "Old House step 1: seven rooms furnished; the worst-spot budget at every level, day and dusk".

### Task 6: The house life, and never lost behind a wall

**Files:**
- Create: `src/world/houselife.js`, `test/helpers/housewalk.js`, `test/housecamera.test.js`
- Modify: `src/world/house.js` (set `areaData.life`)

**Interfaces:**
- Consumes: Tasks 2 and 3; `CAT_LOOK_Y` (`src/cat/model.js`); `createPlayer`, `DEFAULT_PITCH` (`src/player.js`); `maxZoomStep` (`src/camzoom.js`).
- Produces:
  - `createHouseLife(scene, house, { reducedMotion = false } = {}) → { update(dt, t, catPos, camera), dispose(), sink, drawing }`. Every frame it:
    1. makes the view (`makeView(catPos, camera.position, CAT_LOOK_Y)`);
    2. updates the sink and writes `sectionMeshes.get(id).scale.y = fraction`;
    3. shows each pane only while its section's fraction is at least `SINK.paneHide`;
    4. calls `drawing.update(catPos.y)`.

    `dispose()` puts every scale back to 1 and every pane and level object back to visible.
  - `house.js`: `areaData.life = ({ scene, reducedMotion }) => createHouseLife(scene, areaData.house, { reducedMotion })`. `walk.js` already calls `areaData.life?.(...)`, and `main.js` calls `areaLife.update(dt, t, cat.position, camera)` after `player.update`.
  - `test/helpers/housewalk.js`: `createHouseWalk({ reducedMotion = true } = {}) → { area, player, cat, camera, sink, place(x, z, yaw, zoom, pitch = DEFAULT_PITCH), frame(dt = 1 / 60), view(), blockers(), push(wx, wz), release() }`.
    - It runs on `houseArea()` with the real player (the `yardWalk` pattern) and a `createWallSink(area.sections, { reducedMotion })`.
    - `place` uses `setAvatar`, `setGround`, `setViewYaw`, `setCameraZoom(zoom, { instant: true })`, `addOrbit(0, (pitch - DEFAULT_PITCH) / 0.004)`, `enable`, then one `frame`.
    - `frame` runs `player.update(dt, area.colliders, area.bounds, [])`, then `sink.update(dt, view())`.

- [ ] **Step 1: Write the failing tests** in `test/housecamera.test.js`:

```js
it('never lost behind a wall: every reachable spot, 8 directions, all four view steps', () => {
  const w = createHouseWalk();
  const spots = [...gridOf(houseFlood(w.area).cells, 2.0), ...stairCells(0.5)];
  for (const [x, z] of spots) for (let k = 0; k < 8; k++) for (const zoom of [0, 1, 2, 3]) {
    w.place(x, z, (k * Math.PI) / 4, zoom);
    expect(w.blockers(), `${x},${z} yaw ${k} zoom ${zoom}`).toEqual([]);
    expect(cameraInsideStanding(w), `${x},${z} yaw ${k} zoom ${zoom}`).toBe(false);   // pad 0.1
  }
});
it('never lost in any corner, 16 directions, three pitches', () => {
  // every room corner, 0.6 m in along both walls (skipped where the flood does not reach it);
  // yaw k * PI / 8, zoom 0..3, pitch in [-0.25, DEFAULT_PITCH, 0.85]: blockers() is []
});
it('on every stair at every view step: never lost, and the camera eases', () => {
  const w = createHouseWalk({ reducedMotion: false });
  // for each stair, both directions, zoom 0..3: place 0.6 m outside its end, in the room, facing along it,
  // push along it for (run + 1.2) / 2.5 + 1 s at 1/60; every frame |dy camera| <= 0.06 and |dxz camera| <= 0.2;
  // the longest run of frames with blockers() non-empty is <= 15 (0.25 s); she ends at the far level (±0.05)
});
it('is a dollhouse zoomed out: the parlour\'s near walls go down, its far wall stands', () => {
  // place at the parlour's centre, facing north (yaw 0), zoom 3, settle 1 s eased:
  // every section whose nearest point is nearer the camera than the cat by more than SINK.frontMargin is at
  // stub / height (the parlour's south wall, the near halves of hall-e and parlour-e); every parlour-n section is at 1
});
it('keeps every view step in the house (the den cap is the den\'s only)', () => {
  expect(maxZoomStep(false)).toBe(3);
});
it('the life hook sinks the built meshes and hides panes on a sunk wall', () => {
  // build a scene; life = area.life({ scene, reducedMotion: true }); camera behind the cat at the spawn:
  // after update, sectionMeshes.get('hall-s-k').scale.y === STUB_H / WALL_H for the section on the line,
  // and its panes are hidden; dispose() puts scale 1 and visible true back
});
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run test/housecamera.test.js`. Expected: FAIL.
- [ ] **Step 3: Write `houselife.js`, the helper and the `life` line in `house.js`.**
- [ ] **Step 4: Run them to see them pass.** Expected: PASS, in under 30 s; if longer, add the file to `test/heavy.js` `HEAVY_COST`.
  - If a spot fails, fix the plan (a section's split, a doorway's place) or a `SINK` number. Each fix gets a one-line comment on why.
  - Never loosen a test.
  - Report any `SINK` number that changed in the hand-off.
- [ ] **Step 5: Commit** the four files with message "Old House step 1: the house life sinks the walls and draws the levels; never lost behind a wall, in any room, corner or view".

### Task 7: The tours for the film

**Files:**
- Create: `src/world/housetour.js`, `test/housetour.test.js`

**Interfaces:**
- Consumes: `stickToWorld`, `facingYaw` (`src/traversal.js`); `roomAt` (Task 1); `createHouseWalk` (Task 6).
- Produces:
  - `HOUSE_SHOTS`: `{ name: { at: [x, z], face: [fx, fz], zoom } }`.
    - One per room: `hall`, `library`, `parlour`, `kitchen`, `cellar`, `bedroom`, `attic`.
    - `stairs-up`: on the main stair, zoom 1.
    - `dollhouse`: the parlour at zoom 3.
    - `wall-sink`: her back to the hall's south wall, the camera beyond it.
  - `HOUSE_TOURS`: `{ grand: { start: { x, z, face }, steps } }`.
    - A step is `{ to: [x, z], caption }` or `{ zoom, hold, caption }`.
    - The grand route, through doorway centres:
      1. spawn, then the Library and back;
      2. the Parlour, then the Kitchen, down to the Cellar and back up;
      3. the Hall, up the main stair, the Bedroom, up the back stair, the Attic;
      4. zoom 3 for 3 s, then zoom 1.
    - Captions are short plain words ("Up the big stairs").
  - `createHousePilot(spec) → { step(dt, w) → { done, failed, caption } }`. `w` is `{ player, cat }`.
    - It pushes the stick toward the next `to` (`stickToWorld(wx, wz, -player.viewYaw(), stick)` then `player.setTouchMove`).
    - It arrives within 0.35 m, and fails a step after 25 s.

- [ ] **Step 1: Write the failing tests:**

```js
it('walks the grand tour with the real player and the stick alone', () => {
  // createHouseWalk({ reducedMotion: false }), the pilot, 1/30 steps, at most 300 s:
  // done, failed === null; the rooms visited (roomAt each frame) cover all seven ids;
  // the longest run with blockers() non-empty is <= 8 frames (0.25 s)
});
it('puts every shot on a reachable spot where the camera sees her', () => {
  // each shot's `at` reachesWithin 0.3; place with reducedMotion: blockers() is []
});
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Write `src/world/housetour.js`.**
- [ ] **Step 4: Run them to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit** `src/world/housetour.js test/housetour.test.js` with message "Old House step 1: the grand tour and the shots, walked by the real player".

### Task 8: In the game, behind `?house=1`

**Files:**
- Create: `src/houseflag.js`, `src/indoor.js`, `test/housegame.test.js`
- Modify: `src/game/walk.js`, `src/main.js`, `src/progression.js`, `src/audio.js`, `test/progression.test.js` (the three `walks` objects only)

**Interfaces:**
- Produces:
  - `src/houseflag.js`: `houseOn()` reads `?house=1` at call time, as `src/grow.js` does. `setHouse(v)` forces it (`null` goes back to the address bar). `resumableAreaIds(ids) → ids.filter((id) => id !== 'house' || houseOn())`.
  - `src/indoor.js`: `INDOOR_AREAS = Object.freeze(['den', 'house'])`; `isIndoor(id) → INDOOR_AREAS.includes(id)`.
- The edits, each found by its quoted code:
  - `walk.js`:
    - imports `import * as house from '../world/house.js';`, `import { houseOn } from '../houseflag.js';` and `import { isIndoor } from '../indoor.js';`;
    - `house` added to `const AREAS = { ... }`;
    - first in `beginWalkFromHomebase` (after a `roofsOn` branch if one is there): `if (houseOn() && isClanEdition(progression.state) && !getPendingRoom()) {\n      startWalk({ duskMode, areaOverride: 'house' });\n      return;\n    }`;
    - `const indoor = isIndoor(areaId);` on the line after `const isDen = areaId === 'den';`.
  - `walk.js` guards: `indoor` replaces `isDen` in exactly these seven:
    - the weather gate (`if (!duskActive && !isDen`);
    - `const secrets = isDen`;
    - `const legend = colonyWalk && !isDen`;
    - `const loners = isDen ? 0`;
    - `const goals = isDen ? null`;
    - `skyLife: isDen ?`;
    - `session.minimap = isDen ? null`.

    Every other `isDen` stays. That includes the zoom cap `maxZoomStep(isDen)`, so the house keeps all four steps.
  - `main.js`: `areaIds: resumableAreaIds(<the existing expression>)`, plus the import.
  - `progression.js`: `house: 0` last in `defaultState().walks`, and a clause in its comment ("And the Old House (?house=1 only; not in CATALOG.areas until step 4): house: 0.").
  - `audio.js`: `if (areaKey === 'den') {` becomes `if (isIndoor(areaKey)) {`, and `if (dusk && areaKey !== 'den')` becomes `if (dusk && !isIndoor(areaKey))`, plus the import.

- [ ] **Step 1: Write the failing tests** in `test/housegame.test.js` (source-text checks as `test/roofsgame.test.js` on `rooftops-2` does), and add `house: 0` to the three `walks` objects in `test/progression.test.js`:

```js
it('has no catalog row: nothing offers the house', () => expect(Object.hasOwn(CATALOG.areas, 'house')).toBe(false));
it('the flag starts a solo Clan Edition house walk only', () => {
  try { setHouse(null); expect(houseOn()).toBe(false); setHouse(true); expect(houseOn()).toBe(true); } finally { setHouse(null); }
  expect(walkSrc).toMatch(/const AREAS = \{[^}]*\bhouse\b[^}]*\};/);
  expect(walkSrc).toContain("if (houseOn() && isClanEdition(progression.state) && !getPendingRoom()) {\n      startWalk({ duskMode, areaOverride: 'house' });\n      return;\n    }");
});
it('a house walk note is dropped without the flag', () => {
  // readResume(storage, { now, areaIds: resumableAreaIds(Object.keys(createProgression(mem).state.walks)) }) with a fresh
  // note for 'house': null without the flag, kept with setHouse(true); mainSrc contains 'areaIds: resumableAreaIds('
});
it('counts a house walk', () => { /* p.completeWalk('house') → p.state.walks.house === 1 */ });
it('is indoors like the den: no weather, secrets, strays, legend, goals, birds or corner map', () => {
  expect(isIndoor('house')).toBe(true); expect(isIndoor('den')).toBe(true); expect(isIndoor('park')).toBe(false);
  expect(walkSrc).toContain('const indoor = isIndoor(areaId);');
  for (const s of ['const secrets = indoor', 'const legend = colonyWalk && !indoor', 'const loners = indoor ? 0',
    'const goals = indoor ? null', 'skyLife: indoor ?', 'session.minimap = indoor ? null'])
    expect(walkSrc).toContain(s);
  expect(walkSrc).toMatch(/if \(!duskActive && !indoor[ &)]/);
  expect(walkSrc).toContain('maxZoomStep(isDen)');            // the cap stays the den's
  expect(mainSrc).toContain("isDen: () => session?.areaId === 'den',");
});
it('sounds like the den indoors: the fire, never birdsong or crickets', () => {
  expect(audioSrc).toContain('if (isIndoor(areaKey)) {');
  expect(audioSrc).toContain('if (dusk && !isIndoor(areaKey)) layers.push(cricketLayer());');
});
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run test/housegame.test.js test/progression.test.js`. Expected: FAIL.
- [ ] **Step 3: Make the edits.**
- [ ] **Step 4: Run them, plus the files that read these sources, to see them pass.** `npx vitest run test/housegame.test.js test/progression.test.js test/audio.test.js test/session.test.js test/walkresume.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the eight files with message "Old House step 1: in the game behind ?house=1 (solo, Clan Edition), indoors like the den, all four view steps".

### Task 9: The picture page, the pictures, the film, the full suite

**Files:**
- Create: `verify-house.html`
- Modify: `.gitignore` (add `!verify-house.html` with a one-line comment, beside `!verify-traversal.html`)

**Interfaces:**
- Consumes: everything above; `scripts/record-page.mjs` as it is.
- The page follows `verify-traversal.html`: the same rig, the real cat and player, `main.js`'s frame order. Per frame:
  1. `player.update`;
  2. the house life;
  3. `createTreeFade([...findOccluders(scene), ...findFadeOccluders(scene)])`'s update;
  4. the shadow fit.

  `mergeStaticProps` and `createContactShadows` run after the build, as in `walk.js`.
- URL params, listed in the page's header comment:
  - `dusk=1`: `applyDusk` + `createLampPools`;
  - `rm=1`;
  - `zoom=0..3`;
  - `sink=0`: the "before": walls never sink;
  - `tour=grand`, `drive=1`, `size=WxH`, `bare`.
- Window API: `__ready`, `__shot(name)`, `__tour(name)`, `__frame() → { done, caption }`, `__snap(q)`, `__info() → { level, full, down, blockers }`.

- [ ] **Step 1: Write the page and the `.gitignore` line.**
- [ ] **Step 2: Look at it.**
  - Start Vite as a background job: `npx vite --port 5381 --strictPort`.
  - Open `http://localhost:5381/verify-house.html` in the Browser pane.
  - Expected: no console errors; `__ready === true`; the arrows walk her through every room and up every stair; walls sink calmly in front of her; `-` zooms out to the dollhouse.
- [ ] **Step 3: Make the pictures and the film** into `<scratchpad>/old-house-step1/` (not committed):
  - Day: `node scripts/record-page.mjs --url 'http://localhost:5381/verify-house.html?drive=1&bare' --out <dir> --shots hall,library,parlour,kitchen,cellar,bedroom,attic,stairs-up,dollhouse,wall-sink`.
  - Dusk: the same with `&dusk=1`, into `<dir>/dusk`.
  - The "before": `wall-sink` with `&sink=0`, into `<dir>/before`.
  - The film: `--tour grand`. Expected: `grand.mp4`, 40–90 s.
  - The contact sheet: `ffmpeg -y -pattern_type glob -i '<dir>/*.png' -filter_complex "scale=480:-1,tile=4x3" <dir>/sheet.png`.
  - Look at every picture and at frames of the film. Check that:
    - no wall stands between the camera and the cat;
    - no camera is inside a wall;
    - no pitch-dark room at dusk, and the cellar is warm;
    - no hole shows the void;
    - the stand-ins on far levels read as furniture shapes.
  - Fix and re-run anything that is wrong.
- [ ] **Step 4: Commit** `verify-house.html .gitignore` with message "Old House step 1: the house's picture page (shots, the grand tour, day and dusk)".
- [ ] **Step 5: The full suite.** Check `uptime` against `sysctl -n hw.ncpu`, then run `npx vitest run`.
  - Expected: every file passes, and `git status --short test/fixtures` prints nothing.
  - Then run `npm run build`. Expected: success, under the 900 kB gzip ceiling.
- [ ] **Step 6: Hand-off report** (to the agent that launched this plan; no file). It covers:
  - the commit list;
  - the picture, sheet and film paths;
  - the worst level's meshes, casters and triangles, day and dusk;
  - any `SINK` or plan number changed in Task 6, and why;
  - the knobs the owner may want to change: `STUB_H`, the `SINK` timings, `cutawayDist`, `LEVEL_SWITCH`;
  - the five owner questions above.
