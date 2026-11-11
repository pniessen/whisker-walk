# The Gorge, part 3: the Caves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Gorge's three deep caves feel like caves. They get darker the deeper she goes, with a soft warm glow round her cat so she always sees her way. The camera comes in close and low. Each chamber holds something worth the walk, and in the Snug Cave a cat lives. None of it is ever scary.

**Architecture:**
- A pure module, `src/caves.js`, says how deep into a cave a spot is, from part 2's `GORGE_CAVES` records.
- Part 2's `gorgeLife` hook grows three ways:
  - it dims the sun and fill by depth, through the same `composeIntensity` it already uses for shade;
  - it drives one warm `PointLight`, added when the Gorge walk starts, so no shader recompiles mid-walk;
  - it shows each cave's interior dressing only while her cat is near that cave.
- The camera eases to a close, low view under any ceiling (`src/camzoom.js` and `src/player.js`).
- Weather hides its rain under a ceiling, and the ambience adds drips by depth.
- `createStrayCats` gains fixed homes, so one ordinary stray lives in the Snug Cave with no change to any stream.

**Tech Stack:** Vanilla JS (ES modules), Three.js 0.185, Vite 8, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-01-gorge-design.md`: owner decision 2, "Caves", the anti-goals ("a cave that feels scary or a dark spot a young player can't see through"; "clipping into rock") and "How it is split" item 3. It builds on part 1 (`…-gorge-1-ground-height.md`, R8 camera rock and ceiling avoidance) and part 2 (`…-gorge-2-map.md`). Part 2 authored every cave's shape, ceilings, finds and the Echo Cave's golden mouse; **this plan changes no shape**.

## Global Constraints

Part 2's Global Constraints hold unchanged: nothing changes elsewhere, SAVE_VERSION 4, determinism, our own words, the budget, commits, and the test command. Added here:

- **Never scary.**
  - Lights never fall below `DARK_FLOOR = 0.3` of what they were outside.
  - At full depth the glow is on at `GLOW_MAX`.
  - Nothing flickers, nothing jumps out, and there are no sudden sounds: drips are soft and random-spaced, at most gain 0.02.
  - Every cave is short, bends once, and leads back the way it came.
- **Only the Gorge changes.** `caveDepth` is 0 wherever there is no cave, and `ground.ceil` is Infinity on every other map. So the cave framing, darkness, glow, shelter and drips never run elsewhere, and part 1's `test/flattrace.test.js` stays byte-identical.
- **No new draw on `walkRng` or `strayStream`.** The cave cat spends exactly the draws an ordinary stray spends.
- **Budget:** each deep cave's interior is at most two merged meshes. The interiors count in `test/budget.test.js`'s as-built row, which stays inside the Cozy Neighborhood's ceilings. In-game, at most one cave's interior is drawn at a time; their mouths are more than 24 m apart.

## Rulings (the planner's calls, 2026-11-01; each with what it costs if wrong)

- **C1. Depth.** `caveDepth(caves, x, z) → [0, 1]`.
  - Inside one of a deep cave's rectangles, it is the distance along the cave's `path` from the mouth to the point's projection onto that polyline, divided by the path's length.
  - It is 0 outside every deep cave, and 0 in the shallow dens: dens are for peeking and napping, not dark.
  - Cost if wrong: a den that feels too bright gets a `depth: 0.3` cap in its record.
- **C2. Darkness.**
  - The light factor is `1 − (1 − DARK_FLOOR) · depth`. It moves toward that target at a **linear** rate of 1.2 per second going in and 2.0 per second coming out, so leaving feels quick and bright (from 0.3 back to 1 in 0.35 s).
  - The sun gets `shade × dark`, and the fill gets `(0.85 + 0.15 · shade) × dark`, both through part 2's `composeIntensity`.
  - Exposure and bloom are untouched (game/composer.js owns them).
  - Cost if wrong: `DARK_FLOOR` is one constant.
- **C3. The glow.**
  - It is one `THREE.PointLight(0xffd9a8, 0, 6, 1.5)` with no shadow, added by `createGorgeLife` before the first frame and removed by `dispose`.
  - Each frame it sits at the cat + (0, 0.7, 0), with intensity `GLOW_MAX · smoothstep(0, 0.35, depth)` and `GLOW_MAX = 2.0`. It moves at C2's linear rates, scaled by `GLOW_MAX`.
  - It always exists on a Gorge walk, so the shaders are compiled with it from the start.
  - **What it costs:** every Gorge material is `MeshStandardMaterial`, so one more light is worked out for every lit pixel of the whole Gorge, the look-down included, even at intensity 0. Cutting its `distance` does not lower that cost. So Task 6 re-measures part 2's floor and look-down readings with the light in place.
  - **The fallback,** if the look-down loses frames on the iPhone: drop the `PointLight`. Use a soft additive glow disc on the ground under her cat (one small `noCast` mesh) plus a warm emissive lift on her own cat's materials while `depth > 0`. Both scale with depth.
  - Cost if wrong: the fallback is one task's work and changes no test about darkness.
- **C4. The camera under a ceiling.**
  - Wherever `ground.ceil(cat)` is finite (caves and dens), the zoom view eases at 3 /s toward `CAVE_VIEW = { dist: 2.4, height: 0.9 }`, taking the smaller of each value and the player's own step. It eases back out at 1.5 /s once she is out.
  - Part 1's R8 still runs after it, so rock and ceiling avoidance are unchanged.
  - Zoom input still changes the remembered step; it shows once she is out.
  - Cost if wrong: two constants.
- **C5. Interiors.**
  - Each deep cave gets one group, `caveInterior:<id>`. It holds one merged `noCast` mesh of crystals and glints (`caveCrystals`), emissive and soft, with a different colour per cave: Echo `0x9fc7d8`, Snug `0xe8c890`, Glitter `0xf2d27a`. For the Glitter Cave, a second mesh of gold flecks on the chamber walls.
  - A group is visible only while her cat is within `CAVE_SHOW_R = 12` m (2D) of any of its cave's rectangles and `|ground.y(cat) − cave.y| ≤ 3`.
  - The rock, the caps and the finds are part 2's and always drawn.
  - Cost if wrong: the look-down shows nothing inside the caves anyway, so the only risk is a pop-in at 12 m, which is out of sight round the bend.
- **C6. Rain stays outside.** `weather.setSheltered(on)` hides the rain column while `ground.ceil(camera)` is finite and shows it again outside. `walk.js` passes `weather: session.weather` into `gorgeLife`'s context. Every weather object, including the dusk no-op weather (`walk.js` ~622) and any early-return shape in `weather.js`, gets a `setSheltered` that does nothing when there is no rain. The rain sound is unchanged: you hear rain from a cave mouth.
  - Cost if wrong: one flag.
- **C7. Drips.** `dripLayer()` is a soft high plink, `tone(1800 + 600·Math.random(), 0.05, { gain: 0.02 · cave })`, at random gaps of 0.8–2.2 s. It is silent while `cave` is 0. `gorgeLife` sends `setAmbientMix({ high, cave: depth })`. `Math.random` is right here: audio is per-device and never on the wire.
  - Cost if wrong: none to play.
- **C8. The Snug Cave's cat.**
  - `createStrayCats(…, { homes: [{ x, z, roam }] })`. After the colony cats, the first ordinary stray of the cast takes the first home, and so on.
  - It still spends all five draws for its index, so the stream position after spawn stays `47 + 5 · count`.
  - Its position and home are the home's. Its wander targets stay within `roam` of home. Its personality is the rolled one with `'shy'` turned into `'bold'`, so she can greet it.
  - `areaData.strayHomes = [{ x: 22.5, z: 9.5, roam: 2 }]`.
  - Part 2 put the Snug Cave's bend and chamber in `STAND_ON`, so `dryGroundPoint` leaves the homed cat and its targets inside the cave.
  - The name changes walk to walk; the cave always has a cat. Both co-walkers draw the same cast from `strayStream(roomSeed)`, so they see the same cat.
  - Cost if wrong: if the owner wants a named, always-the-same cave cat, that is a new resident system, not this option.
- **C9. The corner map** draws each cave's `mouth` as a small dark arch marker. Nothing about the map changes inside a cave.

## Review Focus

1. **Walking out of a cave mid-darkness, or zooming out of it.** The light comes all the way back (factor 1) within 1 s of being out, and the camera returns to the chosen zoom. Tested in Task 3 (`'leaving a cave brings the light and the camera back'`).
2. **The walk ending inside a cave** (a border crossing, a quit, a fight-free walk end). The next walk, in any area, is lit as normal. `dispose` removes the glow light and restores both intensities. Tested in Task 3.
3. **Weather writing the sun while she is in a cave** (the rainbow phase). The rainbow's value becomes the new base and is still dimmed by depth. Tested in Task 3.
4. **A dusk walk in a chamber,** the darkest case. The light factor is never below `DARK_FLOOR`, and the glow is at `GLOW_MAX`. Tested in Task 3 by numbers and in Task 6 by a screenshot luminance check.
5. **The camera at a cave's bend at every zoom step.** It never goes inside rock or above the ceiling, and never pumps in and out. Tested in Task 2 (`'the camera walks each cave without entering rock'`).

---

### Task 1: Start from main with part 2 landed

**Files:** none new.

- [ ] **Step 1:** Check that part 2's branch is on main (`git merge-base --is-ancestor <part-2 branch> main`). If it isn't, stop and tell the controller.
- [ ] **Step 2:** Merge main. Confirm these names with `grep -n` and record any differences in the merge commit body:
  - `GORGE_CAVES` (with `id`, `mouth`, `path`, `rects`, `y`) and `CEILINGS` in `src/world/gorgeshape.js`;
  - `createGorgeLife`, `composeIntensity`, `shadeFor` in `src/gorgelife.js`;
  - `setAmbientMix` in `src/audio.js`;
  - `areaData.life` and `session.areaLife` in `src/game/walk.js`.
- [ ] **Step 3:** Run the full suite and the build, and record the Gorge's budget row. Commit the merge.

### Task 2: How deep, and the camera inside

**Files:**
- Create: `src/caves.js`, `test/caves.test.js`
- Modify: `src/camzoom.js` (`CAVE_VIEW`, `caveView(view, blend, out)`), `src/player.js` (the camera block: an eased `caveBlend`, only when `!ground.flat`), `test/camzoom.test.js`, `test/groundsystems.test.js`

**Interfaces:**
- Produces:
  - `caveDepth(caves, x, z) → number` (C1), allocation-free;
  - `caveAt(caves, x, z) → cave | null`;
  - `CAVE_VIEW = { dist: 2.4, height: 0.9 }`;
  - `caveView(view, blend, out = {}) → out`, with `dist = view.dist + (min(view.dist, 2.4) − view.dist) · blend`, and the same for `height`.

- [ ] **Step 1: Write the failing tests.**
  - `caves.test.js`:
    - `'depth is 0 at the mouth, rises along the path and is 1 at the end'`: for each of the three caves, 0 within 0.1 at `path[0]`, ≥ 0.95 at the last point, and never falling along 100 points on the path.
    - `'depth is 0 outside every cave and in every den'`: on a 0.5 m grid over the bounds, outside the caves' rectangles it is 0, and in every `GORGE_DENS` rectangle it is 0.
    - `'two calls agree'`: `Object.is`-equal on the grid.
  - `camzoom.test.js`, `'caveView eases each step toward the cave view and never widens it'`: at blend 1, step 3 gives 2.4 and 0.9, and step 0 gives 2.4 and 0.9 (its own 3.0 and 1.5 are capped). At blend 0 the view is unchanged.
  - `groundsystems.test.js`:
    - `'under a ceiling the camera comes in close and low'`: a headless player on the Gorge at zoom step 3 walks into the Echo Cave. Within 1 s of passing the mouth, the camera is ≤ 2.4 + 0.05 m behind the cat in 2D, and it is never above `ground.ceil(camera) − CAM_CEIL_CLEAR`.
    - `'the camera walks each cave without entering rock'`. This is Review Focus 5. At each zoom step 0–3, walk each cave's `path` in and back out at walking pace. Every frame, `camera.y ≥ ground.y(camera) + CAM_ROCK_CLEAR − 1e-6` and `camera.y ≤ ground.ceil(camera) − CAM_CEIL_CLEAR + 1e-6`. No frame-to-frame jump is over 0.6 m.
    - `'out of the cave the chosen zoom comes back'`: 2 s after leaving, the offset is the step-3 view again.
- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/caves.test.js test/camzoom.test.js test/groundsystems.test.js`.
- [ ] **Step 3: Implement** C1 and C4. The player holds `caveBlend`, reset in `setAvatar` and `snapPull`. On flat ground the code path is untouched.
- [ ] **Step 4: Run the full suite.** Expected: PASS, with the flat trace identical.
- [ ] **Step 5: Commit** `src/caves.js src/camzoom.js src/player.js test/caves.test.js test/camzoom.test.js test/groundsystems.test.js` with the message `feat(caves): cave depth, and a close low camera under a ceiling`.

### Task 3: Darker deeper, a warm glow, rain outside, drips inside

**Files:**
- Modify:
  - `src/gorgelife.js`: take `caves` and `weather` in its context; add C2, C3, C6 and C7; `update(dt, t, catPos, camera)`. Pass `camera` from `src/main.js`, `caves: areaData.caves` from `src/world/gorge.js`'s `life`, and `weather: session.weather` from `src/game/walk.js`.
  - `src/weather.js` (`setSheltered(on)`), `src/audio.js` (`dripLayer` in the `gorge` branch; `mix({ cave })`).
- Test: `test/gorgelife.test.js`, `test/weather.test.js`, `test/audio.test.js`

**Interfaces:**
- Produces:
  - `DARK_FLOOR = 0.3` and `GLOW_MAX = 2.0`;
  - `darkFor(depth) → 1 − 0.7 · depth`;
  - `gorgeLife.depth`, a getter for the eased depth;
  - `weather.setSheltered(on: boolean)`;
  - the drip layer's `mix({ cave })`.

- [ ] **Step 1: Write the failing tests** in `test/gorgelife.test.js`, with a stub sun and fill (`{ intensity }`) and Task 2's caves on part 2's ground:
  - `'deeper is darker, never below the floor'`. Walk the Echo Cave path: the sun's factor (intensity ÷ the outside value at the same shade) falls steadily to `DARK_FLOOR` ± 0.02 in the chamber and never below 0.3.
  - `'the glow comes on as she goes in and sits on her cat'`. It is 0 outside. In the chamber it is ≥ `GLOW_MAX` − 0.05 after 2 s. The light's position is the cat + (0, 0.7, 0) every frame.
  - `'the light comes back at a linear rate'`: from the chamber factor of 0.3, after `t` seconds out, the factor is `min(1, 0.3 + 2.0 · t)`.
  - `'leaving a cave brings the light and the camera back'`. This is Review Focus 1. From the chamber, walk out at zoomies speed: 1 s after the mouth the factor is ≥ 0.98 and the glow ≤ 0.05.
  - `'a weather write in a cave becomes the new base and stays dimmed'`. This is Review Focus 3. In the chamber, set `sun.intensity = 2.2` and update: the result is `2.2 × shade × dark`, within 1e-6.
  - `'dispose removes the glow and restores both lights'`. This is Review Focus 2. Dispose in the chamber: `scene.children` no longer holds the light, and the sun and fill are back at their bases.
  - `'a dusk walk's chamber is never darker than the floor rule'`. Start from dusk's sun 0.7: in the chamber the sun is ≥ 0.7 × 0.6 × 0.3 and the glow is at `GLOW_MAX`. This is Review Focus 4 by numbers.
  - `'rain is hidden under a ceiling'`: the camera in the Echo Cave corridor calls `weather.setSheltered(true)` once, and out on the floor `setSheltered(false)` once. The calls are edge-triggered, not every frame.
  - `'on any other area none of this exists'`: no `areaData.life`, so no light is added. Use a source pin that only `gorge.js` sets `life`.
  - `weather.test.js`, `'a sheltered camera sees no rain, and the rain comes back outside'`, and `'every weather shape has setSheltered'`, the dusk no-op included.
  - `audio.test.js`, `'drips only in a cave, and soft'`: with `cave` 0 the drip callback starts no oscillator; with `cave` 1, every gain it schedules is ≤ 0.02.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** C2, C3, C6 and C7.
- [ ] **Step 4: Run the full suite.** Expected: PASS.
- [ ] **Step 5: Commit** `src/gorgelife.js src/main.js src/game/walk.js src/world/gorge.js src/weather.js src/audio.js test/gorgelife.test.js test/weather.test.js test/audio.test.js` with the message `feat(caves): darker deeper, a warm glow round her cat, rain outside and drips inside`.

### Task 4: What the caves look like inside, and their mouths on the corner map

**Files:**
- Modify:
  - `src/world/builder.js`: `caveCrystals(spots, seed, { color }) → THREE.Group` holds one merged `noCast` mesh of small emissive octahedra, 0.06–0.18 m, 3–5 a spot, with `emissiveIntensity` 0.6. It is never taller than 0.3 m and never at a cat's head height on a wall the camera brushes: a spot is at most 0.25 m out from its wall face.
  - `src/world/gorge.js`: one `caveInterior:<id>` group per deep cave, its spots seeded by name along the chamber walls (10–16 per cave), plus the Glitter Cave's gold flecks. `userData.caveId` is set.
  - `src/gorgelife.js` (C5 visibility), `src/ui/minimap.js` (`layer.caves` from `areaData.caves`, mouths drawn as arches; every other area's layer has `caves: []`).
- Test: `test/builder.test.js`, `test/gorge.test.js`, `test/gorgelife.test.js`, `test/minimap.test.js`, `test/budget.test.js` (the Gorge's measured comment)

- [ ] **Step 1: Write the failing tests:**
  - `'caveCrystals is one merged noCast mesh, low and the same every time'`.
  - `'each deep cave has one interior group, inside its own rectangles, off the walking line'`. Every crystal vertex is inside a rectangle of its cave. Every crystal is 0.6 m or more from the cave's `path`, so none sits where the cat walks. No crystal is within 0.4 m of a find or the golden mouse.
  - `'an interior shows only near its cave and on its level'`: the Echo interior is shown at `(−16, 23.5)` (outside the mouth) and hidden at `(−3, 2)`. The Snug interior is hidden from leg A at `(5, 20)`, which is 10 m from its nearest rectangle in 2D but about 7 m below it, so only the level rule hides it. At most one interior is visible at any reached cell of part 2's flood.
  - `minimap`: the Gorge's layer has three cave mouths equal to `GORGE_CAVES[].mouth`, and every other area's has none.
  - `budget`: the Gorge's built and merged rows still pass, and the measured numbers are written into the comment.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** C5 and C9.
- [ ] **Step 4: Run the full suite.** Expected: PASS.
- [ ] **Step 5: Commit** `src/world/builder.js src/world/gorge.js src/gorgelife.js src/ui/minimap.js test/builder.test.js test/gorge.test.js test/gorgelife.test.js test/minimap.test.js test/budget.test.js` with the message `feat(caves): soft crystals inside each cave, drawn only near it, and cave mouths on the map`.

### Task 5: Someone lives in the Snug Cave

**Files:**
- Modify: `src/straycats.js` (C8's `homes` option), `src/world/gorge.js` (`strayHomes`), `src/game/walk.js` (pass `homes: areaData.strayHomes ?? []` to `createStrayCats`)
- Test: `test/straycats.test.js`, `test/gorge.test.js`

- [ ] **Step 1: Write the failing tests:**
  - `straycats`, `'a home is taken by the first ordinary stray, and the stream is unchanged'`. With a counting rng and `count` 6, the stream position after spawn is `47 + 5 · 6`, with and without `homes`. With `homes: [{ x: 22.5, z: 9.5, roam: 2 }]`, the first non-colony cast member stands at (22.5, 9.5). With one colony cat, the colony cat keeps its spot and the second cast member takes the home.
  - `'a homed stray stays home and is never shy'`: on the Gorge over 3000 frames, its distance from home is ≤ `roam` + 0.5 every frame, its y is `ground.y` (SNUG_Y), and its personality is never `'shy'`.
  - `'with no homes, every stray is exactly as before'`: the existing straycats tests are unchanged and the flat trace is identical.
  - `gorge`, `'the Snug Cave always has a cat, and both co-walkers see the same one'`: two `createStrayCats` calls with `strayStream(12345)` on the Gorge give the same name at the home.
  - A source pin that walk.js passes `homes:`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** C8.
- [ ] **Step 4: Run the full suite.** Expected: PASS.
- [ ] **Step 5: Commit** `src/straycats.js src/world/gorge.js src/game/walk.js test/straycats.test.js test/gorge.test.js` with the message `feat(caves): a cat lives in the Snug Cave`.

### Task 6: Check the caves live

**Files:** Modify: `docs/VISUAL-PASS.md` (a "The Gorge's caves" entry).

- [ ] **Step 1:** Run the full suite and the build.
- [ ] **Step 2: Live**, with a temporary launch entry rooted at this worktree.
  - **Walk in and out of each cave** at every zoom step, by day and on a dusk walk.
    - It darkens smoothly and the glow comes up warm.
    - The chamber is never black.
    - The camera stays close and low, and never shows the inside of rock or the sky through a ceiling.
  - **Screenshot the Echo Cave chamber** by day and at dusk, and the floor outside it.
    - The chamber frame's mean luminance must be at least 25% of the floor frame's.
    - Record both numbers. If dusk falls below that, raise `DARK_FLOOR` before anything else.
  - **Watch for the details:**
    - the crystals glint and don't pop in visibly;
    - the Snug Cave's cat is there and can be greeted;
    - the Glitter Cave's gold-flecked stone and the Echo Cave's golden mouse can be found in the dark;
    - rain stops at a cave mouth and starts again outside;
    - drips are heard only inside;
    - the corner map shows three mouths.
  - **Run `?perf` in each chamber,** and again on the floor and at the clifftop look-down **with the glow light in place**. Record them beside part 2's readings, which were taken without it. A chamber must not be slower than the floor.
  - If the look-down is slower than part 2's by more than 10%, stop and report before building C3's fallback.
  - **Leave a cave by quitting the walk** (Review Focus 2). Start a Woods walk: it is lit as normal.
  - Check there are no console errors, then reset the viewport.
- [ ] **Step 3:** Write the VISUAL-PASS entry, then commit `docs/VISUAL-PASS.md` with the message `docs(caves): the caves' live check`. Report to the controller that the branch is ready for review and not merged.

## Owner steps

1. **The iPhone 18 check:** on HIGH, walk into the Echo Cave chamber and the Glitter Cave chamber. Both must hold 60 fps and never look black. Do it once on a dusk walk too.
2. **Show her the caves** before naming anything for good. The names "the Echo Cave", "the Snug Cave" and "the Glitter Cave" are the planner's; if the kids pick others, each is one string in `GORGE_CAVES`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-01-gorge-3-caves.md`. I recommend **subagent-driven** execution. There are only five build tasks, but three of them touch the per-frame hot path (the camera, the lights, the strays). The cost of a mistake is a dark or scary moment for a young player, so a gate per task is worth it.
