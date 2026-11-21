# The Rooftops, step 3: the Roof Life — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Rooftops comes alive: pigeons, sparrows and two gulls perch on ridges, chimney pots, aerials, gutters and parapets and peck on the flat roofs; chased, they flutter roof to roof along the routes she can follow and wait at plank ends and gap landings; a pounce tags one, as everywhere; on her first visit one pigeon in the alley leads her up to the first plank; the pigeons' home is the loft. The washing moves in the wind, three chimneys smoke, and two house cats sleep on warm sills.

**Architecture:**
- **The flock's plan, pure:** `src/world/roofsflock.js`. The perches (every move's ends from `ROOFS_TRAVERSAL`, ridge points, peck spots, the loft, plus the spots `roofs.js` draws: pots, aerials, parapets, posts, walls), the flight links between them, the roster of fourteen birds, the guide's route, and the flight rules (`chooseFlight`, `flightPlan`, `flightPoint`). No THREE, no randomness.
- **The flock drawn and driven:** `src/world/roofsbirds.js`. Two instanced meshes (bodies, wings) for every bird, made by the area's life. In a walk each bird is also an ordinary critter (`area.critterSpawns`, type `bird` or `seagull`), so tag, stalking, the bell, a meow, spotting and the journal are the game's own rules (`src/critters.js`). The life is the only thing that MOVES them: after `critters.update` it writes each critter's position, flies it perch to perch when critters has flagged it `fleeing`, and lands it by clearing the flag. The critters' own meshes are hidden.
- **What the wind moves:** `src/world/roofsair.js`. The washing sways in a vertex shader on the existing cloth material (one uniform a frame); the smoke is one instanced mesh of puffs over three pots. One wind (`ROOFS_WIND` in `roofsplan.js`) for the vane, the washing and the smoke.
- **In the game:** `src/roofslife.js` (the area life) makes the flock, the smoke and the washing's clock, and breathes the sleeping cats. One line of `src/game/walk.js` (`startWalk`'s `areaLife` call) hands every area life the walk's `critters` and the place's `visits` (Task 1, the only shared change).

**Tech Stack:** Plain ES modules, Three.js 0.185 (`InstancedMesh`, `onBeforeCompile`), Vite 8, Vitest 4, Node 26, headless Chrome through `scripts/record-page.mjs`, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-11-19-rooftops-design.md`, "Build order" item 3 ("The birds: perching at height, short flights between roofs, leading routes, tag"). Sections used: "The birds", "Goals" (the first roof within a minute, following a bird), "Anti-goals" (nothing frightening, nothing that chases the cat), "Claude's calls" (no yard dog, no strays, no clan cats), "Constraints". Step 4 keeps: the six discoveries (B's following pigeon and F's smoke ring among them), the two skills, the golden mice, co-walker height, dusk polish. Step 2's plan (`docs/superpowers/plans/2026-11-19-rooftops-step2-place.md`) and its rulings R1–R8 still hold.

## Rulings (Claude's calls; the owner can overturn each)

- **S1. Cats sunning, without breaking "no strays, no clan cats up here".** Two house cats asleep on warm back-window sills: scenery only. No name, no label, no prompt, no journal page, not in `straycats.js` or any cat list; they never move but breathe, and sit where she cannot walk into them. Their own task (Task 6), last before the pictures, one commit.
  - Cost if wrong: revert one commit (two meshes, one data list).
- **S2. The set: pigeons, sparrows and two gulls.** The spec names pigeons and sparrows; the owner asked for pigeons and gulls. All three:
  - 8 pigeons: they lead, and the loft is their home;
  - 4 sparrows: low, in the yards and on the low roofs, short hops, never lead;
  - 2 gulls: on the high places (the warehouse's and the shop's parapets, the tower's ring), critter type `seagull`, so the game's gull rules hold: they keep further off (1.4×) and a pounce does not tag them, as at the Seaside and the Docks.
  - Cost if wrong: roster rows.
- **S3. Chimney smoke is ambient, the smoke ring is step 4.** Three pots smoke all walk, the warm chimney's (discovery F, stack −10's cowled pot) among them. Its ring when she sits by it stays in step 4.
- **S4. The washing sways in the shader.** The cloth material gets an `onBeforeCompile` patch (as `src/render/rustle.js` does for heather). Each cloth vertex carries `aSway`: its drop under its line along the line's downwind side, plus a phase. One uniform (walk seconds) is written per frame. No new mesh, no allocation. The drawn rest pose is today's. Under reduced motion it holds a still downwind lean.
  - Cost if wrong: the patch is cosmetic; without it the washing hangs as today.
- **S5. Birds are critters for tag; the life moves them (and the one shared change).** Tag, stalking, the bell, a meow, Far Call's rules, spotting and the journal all live in `critters.js`, `game/avatar.js` and `game/interactions.js`. Putting the birds in `area.critterSpawns` gives every one of those for free.
  - Critters' own bird flight goes up into the sky (6 m/s up for 18 s), which the spec rules out. So the roofs life writes each roof bird's position every frame, after `critters.update` and before the avatar's pounce check (`main.js` order: critters at ~1188, the area life at ~1239, `updateAvatar` at ~1483).
  - The life reads three of critters' per-critter fields: `def.roofBird` (which bird), `fleeing` (flushed), and on landing writes `fleeing = false`, `cooldown = 0`, `anchor`, `anchorHome`.
  - The life cannot reach the critters today: its context has no `critters`. F6's context for `areaData.life?.(...)` still has no `critters` or `visits`; Task 1 adds them to that one call in `walk.js`.
  - Not `critters.js` itself: it is start-up code, and a new critter type would also touch `labels.js` and the word sets.
  - Cost if wrong: a rename inside `critters.js` breaks the flock. Task 4's contract tests fail loudly on it, rather than birds flying into the sky.
- **S6. Leading is the flight graph.** Every perch is linked to the far end of every move that starts there (a crossing's two ends, a gap's or climb's or drop's take-off and landing), and to perches 3–10 m away whose arc clears every roof between.
  - A flushed pigeon prefers a move link, then the homeward one (fewer flights to the loft). So chasing pigeons walks a child along the planks, ridges and leaps, up the place toward the warehouse and the loft.
  - No flight ends nearer her than it began, or passes within 1.5 m of her.
  - Sparrows and gulls make local hops.
- **S7. The guide pigeon: first visit only, as the spec says.** With `visits === 0` one pigeon starts in the alley in front of the spawn. Each time she flushes it, it flies to its next stop: the bin's lid, the shed roof, plank-3's near end, plank-3's far end. Then it is an ordinary pigeon. On later visits it starts at plank-3's far end.
- **S8. The loft is home.** A pigeon that lands on the loft rests there. After `LOFT_REST` (90 s) it is back on its home perch, but only while she is more than 30 m from both and the home perch is out of the camera's view: no bird pops into sight, and none is ever removed.
- **S9. No sound in step 3.** `src/audio.js` is start-up code and has no bird sound. The loft's cooing comes with discovery B in step 4. The life calls no `audio` method.
- **S10. A caught pigeon is "a songbird" until step 4.** Pigeons and sparrows are critter type `bird`, whose label is `'a songbird'` (`src/game/labels.js`). Giving pigeons their own name needs a new critter type in start-up code. Step 4 changes shared code anyway.
  - Cost if wrong: the toast reads "a songbird" for a pigeon until then (owner question 3).
- **S11. The flock is per device and draws on nothing.** Every home, route and perch is data. A flight's choice is a pure function of (bird, its flight count, her spot), with `hash01` tie-breaks. No stream, no `Math.random`, no clock. The life's meshes are made inside `withLocalUuids`. Two co-walkers' birds start on the same perches. Their flights may differ, as birds do today (spec).
- **S12. Instanced, always drawn.** The flock is two `InstancedMesh`es and the smoke one, `frustumCulled = false`. That is three draw calls in every view, never 14 or 28: fourteen critter groups would otherwise draw two meshes each.

## Questions only the owner can answer

1. **Cats sunning (S1):** two house cats asleep on warm sills, scenery only. Does that sit right beside the spec's "no strays, no clan cats up here", or should they go?
2. **Gulls (S2):** keep the game's gull rules (they flutter off but a pounce does not tag them), or make them catchable like the pigeons?
3. **The name (S10):** a caught or spotted pigeon says "a songbird" until step 4 gives pigeons their own name. Can it wait?
4. **The guide (S7):** first visit only, or every visit until she has once crossed plank-3?
5. **The pictures and the film:** do the flights, the washing, the smoke and the sleeping cats look right?

## The owner's answers (2026-11-21)

These are his, and they override the rulings above where they differ.

1. **Cats sunning (S1):** keep the two sleeping house cats. Task 6 stays.
2. **Gulls (S2):** uncatchable, as at the Seaside: they flutter off, and a pounce does not tag them. (S2 as written.)
3. **The guide pigeon (S7):** she appears on every visit until the cat has once crossed plank-3, then retires. This replaces "first visit only".
4. **The pigeon's name (S10):** not asked of him. Left to the controller, which he can overturn: give pigeons their own name now ("a pigeon", through the word tables in both word sets) if that is a small change, else keep "a songbird" until step 4. The controller's call is in the SDD ledger and the step report.
5. **The pictures and the film:** still open; he answers from them.

## Global Constraints

- **Work only in** `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/rooftops-2`, branch `rooftops-2`. Never touch the main checkout. Never merge or push. No database, no `.env` file. Dispatch no subagents unless the controller does.
- **Commits:** `git add <exact paths>`, never `-A` or `.`. Every message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tests:** run single files only (`npx vitest run test/<file>`), after checking `uptime` against `sysctl -n hw.ncpu`. Wait while the 1-minute load is above the core count. Another suite may be running. Always also run `test/roofs.test.js test/roofsplan.test.js test/roofslife.test.js test/budget.test.js` after a task that touches the Rooftops' files. The full suite runs once, in Task 7, by the controller.
- **No start-up growth; a small chunk.** F6's gate (`scripts/buildjson.mjs`, printed by `npm run build`) caps the start-up scripts at `MAIN_GZIP_CEILING_KB = 700` and each place's own download at `AREA_GZIP_CEILING_KB = 100`. Step 3 adds nothing to start-up beyond Task 1's two fields. The Rooftops chunk is 35.57 kB gzipped before step 3; step 3's budget for it is at most 60 kB gzipped, well under the 100 kB ceiling. Never raise either constant.
  - All new code is in the Rooftops' lazily loaded chunk: files reachable only through F6's loader in `src/world/areas.js` (`roofs: () => import('./roofs.js').then((w) => own('roofs', w))`, with `roofs: Object.freeze(['src/world/roofs.js'])` in `AREA_ENTRY_MODULES`). `src/roofsflag.js` now keeps only `roofsOn`, `setRoofs` and `resumableAreaIds`. The chunk's files are `src/world/roofs.js`, `roofsparts.js`, `roofsplan.js`, `src/roofslife.js`, and the new `src/world/roofsflock.js`, `roofsbirds.js` and `roofsair.js`, which only they import.
  - New Rooftops modules import only `three`, `three/examples/jsm/utils/BufferGeometryUtils.js`, each other, and modules the roofs chunk already imports: `src/world/localuuids.js`, `src/world/warehouselook.js` (`hash01`), `src/render/materials.js`, `src/ground.js`, `src/traversal.js`.
  - No start-up module ever imports Rooftops code.
  - **The one shared change is Task 1** (one line of `src/game/walk.js`). After it, and again in Task 7, the start-up figure must stay at or below what it was before the task (and under 700 kB), and the roofs chunk at most 60 kB.
  - If any other task seems to need `walk.js`, `main.js`, `critters.js`, `roofsflag.js`, `src/world/areas.js`, area loading or `src/render/*`, STOP and report NEEDS_CONTEXT naming the file and why.
- **Budget** (`test/budget.test.js` ceilings, never raised: 450 meshes / 380 casters / 70,000 triangles; merged 64 / 34).
  - **Built**, today 114 / 68 / 36,707, merged 57 / 30. Only Task 6 adds meshes, two sleepers that are never merged and cast nothing: at most 116 / 68 / 37,400, merged 59 / 30.
  - **The life** (made per walk, not in the build count): at most 3 meshes (flock, wings, smoke), no casters, at most 1,600 triangles (birds ≤ 64 per body and ≤ 4 per wing; puffs 20 each).
  - **The worst spot** (the card, today 155 calls / 44,024 triangles): at most 160 calls and 46,300 triangles. The edge: at most 139 calls. No shot more than +5 calls or +2,300 triangles over `beauty2/after/perf.md`.
- **Deterministic for two players.**
  - Anything both players must agree on is data: the perches, the roster, the homes, the guide's route, the smoking pots, the sleepers.
  - Flights are pure functions of local state and may differ per device.
  - No `Math.random`, `Date.now` or `performance.now` in the plan, the flock, the air or the build. `build` keeps its pinned `Math.random` draw count.
  - The roof birds' idle phases come from critters' own `motionRng` (`CRITTER_MOTION_SALT`), never `walkRng`.
  - These do not move: `test/fixtures/flat-trace.gameplay.json`, `flat-trace.render.json`, `ROOFS_TOURS.firstRoof` and `.terrace` and their timing tests, the floods, every hop and rail.
- **Nothing that ships changes, except what a task names.** `SAVE_VERSION`, the network message, `CATALOG.areas` (still held back, step 2's R1), the golden-mouse totals and every other area's counts all stay as they are. No fixture changes. No existing test is edited, except where a task names it.
- **Words:** step 3 adds no text a child reads. If an implementer finds one is needed, it goes through the word tables in both `src/clanwords.js` and `src/offclanwords.js`, in plain words for a 9-year-old, with no series word in a literal. Tour captions are harness-only, plain, like `ROOFS_TOURS`' today.
- **Silent:** nothing here calls `audio`. Pictures and films use headless Chrome with `--mute-audio`. Never press M.
- **Tests check behaviour, never source text.** Offline-first: nothing here touches the network.
- **Spec values, verbatim:**
  - "Pigeons and sparrows perch on ridges, chimneys, aerials and gutters, and peck on flat roofs."
  - "get close and they flutter off to another roof nearby (a short flight, not up into the sky); a pounce 'catches' one, it flaps away, small reward as for any catch. Never hurt, never removed."
  - "Their flights go along routes the cat can follow, and they like to wait at the far end of a plank or a gap's landing spot".
  - "On the first visit one pigeon in the alley leads up to the first plank."
  - "The pigeon loft ... is where they all go home."
  - "A child gets onto the first roof within the first minute, following a bird."
  - "nothing that chases the cat". "No yard dog, no strays, no clan cats up here."
- **Line numbers** are from `bb2f5e73`. Find each site by its quoted code.

## Review Focus

1. **A bird she has cornered** (the tower top, the loft's far corner, a plank end with her on the plank).
   - Expected: it flies off away from her, or flutters where it is. Never toward her, never over her, never stuck in the air.
   - Test: Task 2, `cornered, it flies away from her or flutters where it is` and `a bird on the rail ahead of her leaves ahead, never back over her`.
2. **Flushed again mid-flight, a long frame (a tab coming back), or the game paused mid-flight.**
   - Expected: it keeps the flight it is on and lands exactly on its perch, never past it, and the critter's flag clears.
   - Test: Task 4, `flushed again while flying, it keeps its flight; a 2 s frame lands it on its perch`.
3. **The loft's birds going home while she can see.**
   - Expected: none appears or vanishes in view.
   - Test: Task 4, `pigeons that reach the loft rest there, and are back home only where she cannot see`.
4. **`critters.js` changed under the flock** (another worktree).
   - Expected: a failing test, not birds rising into the sky or tags that never land.
   - Test: Task 4, the four `the critters contract` tests, on the real `createCritters`.
5. **A perch that leads her somewhere bad**: over the street, onto a smoking pot, into a spot no move reaches.
   - Expected: no perch on a parapet over the street or on a smoking pot, and every pigeon home has a way to the loft.
   - Tests: Task 2, `no perch over the street, under a pitched roof's void or on a smoking pot` and `every pigeon's home has a way to the loft`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/game/walk.js` | modify (Task 1 only, one line) | `startWalk`'s `areaLife` call: the area life's context gains `critters` and `visits`. |
| `src/world/roofsflock.js` | create | Pure: perch list, flight links, home distances, roster, guide, flight choice and path (Task 2). |
| `src/world/roofsbirds.js` | create | `createRoofsBirds`: the instanced flock; adopting the critters; flights, landing, the guide, the loft (Tasks 3–4). |
| `src/world/roofsair.js` | create | The washing's shader sway and its CPU twin; the chimney smoke (Task 5). |
| `src/world/roofsplan.js` | modify | `ROOFS_WIND`, `SMOKE_POTS`, `ROOFS_SLEEPERS`, `ROOFS_TOURS.birds`, `ROOFS_LIFE_SHOTS`, re-pinned `budget`. |
| `src/world/roofs.js` | modify | Drawn bird spots, `birdPerches`, `critterSpawns`, the wash material and `aSway`, `potTops`, `smokePots`, the sleepers, the vane reads `ROOFS_WIND`. |
| `src/roofslife.js` | modify | Makes the flock, the smoke and the washing's clock; breathes the sleepers; `update(dt, t, catPos, camera)`. |
| `verify-places.html`, `verify-traversal.html` | modify (Task 7) | The life shots; the film with real critters. |
| `test/roofslifectx.test.js`, `test/roofsflock.test.js`, `test/roofsbirds.test.js`, `test/roofsair.test.js`, `test/helpers/followbird.js` | create | The tests named below. |
| `test/roofs.test.js`, `test/roofslife.test.js`, `test/budget.test.js` | modify | Where a task names it. |

**Names:** "perch" here means a bird perch (a `roofsflock.js` record), not a cat perch (`src/climbing.js`). "Proxy" means a roof bird's critter record in `critters.list`.

**Headless stubs:** tests that build the area or a player stub `document` as `test/flattrace.test.js` does, then `await import(...)`. Real-walk tests use `test/helpers/walklife.js`'s `lifecycle()`, as `test/roofswalk.test.js` does.

---

## The flock (decisions every task uses)

**Perch** `{ id, x, y, z, kind, peck, aliases }`, frozen. `kind` is one of:
- `move`: a crossing end `${id}:0` and `${id}:1`, or a hop's `${id}:from` and `${id}:to`. `y` is the rail's or the ground's height there.
- `ridge`: every 2 m along each ridge rail, at `RIDGE`.
- `roof` (`peck: true`), on a 1 m grid by `hash01`, at least 0.8 m from every take-off, 0.5 m from every rail, 0.4 m from a roof's edge, and 1.2 m from the colliders, the discoveries and the cat perches:
  - garages 3;
  - ext-3, ext-6, ext-9, ext-12: 1 each;
  - flatHouse 1, dormer 1;
  - cornerShop 2;
  - warehouse 8.
- `loft`: 6 on the loft's roof.
- `ground`: `guide:alley`, about (5.5, 36.5, 0), in the spawn's view within 25° of north, clear of colliders by 0.5 m. The builder may move it up to 1 m.
- Drawn, from `roofs.js`:
  - `pot`: each pot top, `pot:${stack}:${side}`;
  - `aerial`: `aerial:${stack}`;
  - `parapet`: the warehouse's and the shop's parapets except over a street, every 3 m, plus tower-1's ring corners;
  - `post`: the washing posts' T-bars, `post:${i}:${end}`;
  - `wall`: the yard walls' copings, one each.
- Two perches within 0.5 m (2D) and 0.3 m (height) are one. The first in the order moves, plan, drawn keeps its id, and the other's id goes into `aliases`. A route or roster may name either.

**Links** (`flightGraph(perches, traversal)`):
- **`move`**: a crossing's two ends both ways, and every hop's take-off → landing. Up to `FLIGHT.maxMove` = 12 m.
- **`hop`**: any two other perches 3–10 m apart (2D), at most 5 m up or 6 m down.
- Both kinds only if the arc (`flightPoint`) stays ≥ `FLIGHT.clearSky` 0.25 m above `skylineY` at 0.5 m samples, except within 0.6 m of either end.
- **`homeDist`**: the number of flights from a perch to a `loft` perch, by a breadth-first search over the links.

**Flight** (`flightPlan(a, b)`):
- `d` = 2D distance; `h = min(1.4, 0.6 + 0.08 d)`; `time = 0.5 + d / 6` s.
- `flightPoint`: x and z by `smoothstep(s)`; `y = a.y + (b.y − a.y)·s + h·4s(1 − s)`. Its top is never more than 1.4 m over the higher end.

**The choice** (`chooseFlight`), from perch `at` with her at `cat`. A candidate link must:
- be allowed for its kind (`BIRD_KINDS[kind].perches` and `.hop`);
- end at least 4 m from her (`FLIGHT.landFromCat`) and further from her than `at` by 0.5 m;
- keep every sample at s 0.1–0.9 at least 1.5 m from her (`FLIGHT.clearCat`);
- end on a perch no other bird is on.

Then the highest score wins:
- pigeon: `2·[move] + 1·[homeDist(to) < homeDist(at)] + 0.25·hash01(index, flights, 7)`;
- sparrow, gull: `−|d − 5| / 5 + 0.25·hash01(index, flights, 7)`.

With no candidate it returns `null`: the bird flutters in place (0.8 s, up 0.4 m and back).

**The guide** (`GUIDE`): bird `pigeon-guide`, start `guide:alley`, route `['bin-up:to', 'shed-up:to', 'plank-3:0', 'plank-3:1']`. While the route is unfinished, a flush flies it to the next stop. The route's own links are exempt from the 3 m minimum (the bin's lid to the shed is 1.95 m) but not from the cat rules. If the next stop breaks a cat rule, it flutters.

**The roster** (`ROOFS_BIRDS`, `{ id, kind, home }`, 14). The builder may swap homes within each line's rule:
- pigeons:
  - `pigeon-guide` at `plank-3:1`;
  - `plank-1:1`, `plank-2:1`, a side-return landing (`return-4-east:to`), `gutter-2:1`, `cornerShop-up:to`, `warehouse-up:to` and `loft:0`;
  - at least four of the eight at a move's far end, two on the warehouse;
- sparrows: two in the back yards (a `post` or a `wall`), one `roof` on the garages, one `roof` on a terrace flat roof;
- gulls: one on a warehouse `parapet`, one on tower-1's ring.

`BIRD_KINDS`:
- pigeon: critter `bird`, scale 1, hop 3–10 m, every perch kind but `post`, leads;
- sparrow: critter `bird`, scale 0.65, hop 3–6 m, perches `post wall roof move gutter` below 7 m;
- gull: critter `seagull`, scale 1.6, hop 4–10 m, perches `parapet pot aerial`.

---

### Task 1: ⚠ SHARED FILE: the area life is handed the walk's critters and the visit count

**Why shared:** the roofs life must reach the critters to move the roof birds (S5), and must know a first visit (S7). Nothing a lazily loaded file can reach holds either. One line of `src/game/walk.js`; nothing else shared changes in step 3.

**F6 has landed.** F6 moved area loading into `src/world/areas.js` (`areas.ensure` / `areas.loaded`) and `startWalk` (`src/game/walk.js`) reads the loaded pack (`const pack = areas.loaded(...)`, `areaData` built from `pack.world.build`). It did not change what the life is handed: the call is still `const areaLife = areaData.life?.({ scene, sun, fill, ground, reducedMotion, audio, weather, dusk: eveningLook }) ?? NO_AREA_LIFE;` (`walk.js` line 1727), with no `critters` or `visits`. So the addition is still needed. Both values are in scope there: `critters` is the `createCritters(...)` result made at line 998, and `state` / `areaId` are set at lines 729 and 733. Nothing else about loading needs to change for step 3.

**Files:**
- Modify: `src/game/walk.js` (line 1727, in `startWalk`, `const areaLife = areaData.life?.({ scene, sun, fill, ground, reducedMotion, audio, weather, dusk: eveningLook }) ?? NO_AREA_LIFE;`, and one sentence in the comment above it)
- Test: `test/roofslifectx.test.js` (create)

**Interfaces:**
- Produces: the life context gains `critters` (the walk's `createCritters` result, the object `session.critters` holds) and `visits` (`state.walks[areaId] ?? 0`, with `state` and `areaId` as `startWalk` already has them, the walks finished there before this one). The Gorge's life ignores both.

- [ ] **Step 1: Write the failing test.** Mock `../src/world/roofs.js` with `importOriginal`, wrapping `build` so its record's `life` pushes each `ctx` into a hoisted `seen.ctx` list before calling the real life. The stubs are as in `test/roofswalk.test.js`.

```js
it('the Rooftops\' life is handed the walk\'s critters and how many walks she has had there', async () => {
  await loadRoofs();
  const life = lifecycle();
  life.w.startWalk({ duskMode: false, areaOverride: 'roofs' });
  expect(seen.ctx.at(-1).critters).toBe(life.getSession().critters);
  expect(seen.ctx.at(-1).visits).toBe(0);
  life.w.endWalk();
  life.w.startWalk({ duskMode: false, areaOverride: 'roofs' });
  expect(seen.ctx.at(-1).visits).toBe(1);
  life.w.endWalk();
});
```

- [ ] **Step 2: Run** `npx vitest run test/roofslifectx.test.js`. Expected: FAIL (`critters` undefined).
- [ ] **Step 3: Implement** the two fields and the comment sentence ("The Rooftops' life also takes the walk's critters, to move its birds, and how many walks she has had there").
- [ ] **Step 4: Run** `npx vitest run test/roofslifectx.test.js test/roofswalk.test.js test/gorgelife.test.js test/walkfreed.test.js`. Expected: PASS.
- [ ] **Step 5: Gate.** Run `npm run build`. Expected: it passes, printing `start-up X kB gzipped (ceiling 700 kB)` and a `roofs` line under 100 kB (about 35.6 kB now). Put both in the report.
- [ ] **Step 6: Commit** `src/game/walk.js test/roofslifectx.test.js`, with the message "Rooftops step 3: every area life is handed the walk's critters and how many walks she has had there (the Rooftops' birds need both)".

### Task 2: The flock's plan (pure)

**Files:**
- Create: `src/world/roofsflock.js`
- Test: `test/roofsflock.test.js` (pure; ground and plan only)

**Interfaces:**
- Consumes: `ROOFS_TRAVERSAL`, `ROOFS_GROUND`, `LEVELS`, `STREETS`, `PITCHED`, `skylineY`, `ROOFS_COLLIDERS`, `ROOFS_DISCOVERIES`, `ROOFS_PERCHES` (`roofsplan.js`); `createGround` (`src/ground.js`); `hash01` (`src/world/warehouselook.js`).
- Produces (all frozen, per "The flock" above):
  - `FLIGHT = { min: 3, maxHop: 10, maxMove: 12, up: 5, down: 6, clearSky: 0.25, clearCat: 1.5, landFromCat: 4, speed: 6 }`, `BIRD_KINDS`, `ROOFS_BIRDS`, `GUIDE`, `LOFT_REST = 90`, `OUT_OF_SIGHT = 30`.
  - `flockPerches({ traversal, ground, drawn = [], smoking = [] }) → Perch[]`. `drawn` is `{ id, kind, x, y, z }[]` from the build. A drawn perch whose id is in `smoking` is left out.
  - `perchIndex(perches) → Map<id | alias, Perch>`.
  - `flightGraph(perches, traversal) → { links: Map<id, { to, kind, d }[]>, homeDist: Map<id, number> }`.
  - `flightPlan(a, b) → { d, h, time }` and `flightPoint(a, b, plan, s, out) → out` (`{ x, y, z }`).
  - `chooseFlight(graph, index, bird, cat, taken) → { to, kind } | null`. `bird` is `{ index, kind, at, flights, guideStep }`; `guideStep` is `-1` once the route is done; `taken` is a `Set` of perch ids.
  - `roofsCritterSpawns(birds, index) → { type, x, z, roofBird }[]`.

- [ ] **Step 1: Write the failing tests.** `P` = `flockPerches` on the plan alone; `G` = `flightGraph(P, ROOFS_TRAVERSAL)`.

```js
it('every move end is a perch, standing where she stands', () => {
  // every crossing end and every hop's from/to resolves through perchIndex; its y is
  // the rail's (crossings) or ground.y there (hops) within 0.02
});
it('ridges every 2 m, peck spots on the flat roofs, six on the loft, the guide in the alley', () => {
  // kind counts: ridge >= 2 per ridge rail; roof as listed (garages 3 ... warehouse 8); loft 6;
  // 'guide:alley' within 25 degrees of north from ROOFS_SPAWN and 3..6 m from it
});
it('no perch over the street, under a pitched roof\'s void or on a smoking pot', () => {
  // no perch inside STREETS; none but ridge/pot/aerial over PITCHED with y < FLAT;
  // flockPerches({ ..., drawn: [pot('pot:a'), pot('pot:b')], smoking: ['pot:a'] }) keeps only pot:b
});
it('every link is short and clears the roofs between', () => {
  // move links d <= 12, hop links 3..10, rise <= 5, fall <= 6; every flightPoint sample
  // (0.5 m apart, beyond 0.6 m of either end) >= skylineY + 0.25
});
it('a flight is a short arc, never more than 1.4 m over its higher end', () => {
  // for every link: max y over s in [0,1] <= max(a.y, b.y) + 1.4; flightPoint(s=0) is a, (s=1) is b
});
it('every pigeon\'s home has a way to the loft', () => {
  for (const b of ROOFS_BIRDS.filter((b) => b.kind === 'pigeon')) expect(Number.isFinite(G.homeDist.get(I.get(b.home).id))).toBe(true);
});
it('the flock: eight pigeons, four sparrows, two gulls, at the homes their kinds allow', () => {
  // counts; >= 4 pigeon homes are a move's far end (a crossing's end 1 or a hop's to);
  // 2 pigeon homes at WAREHOUSE level or above; a gull on a warehouse parapet and one on tower-1;
  // every home's kind is in its BIRD_KINDS perches; no two birds share a home
});
it('the guide\'s route is the alley, the bin, the shed and plank-3\'s two ends', () => {
  expect(GUIDE.route.map((id) => I.get(id).id)).toEqual([...]); // the four canonical ids
  // consecutive stops are each within the cat rules' reach of a move she makes between them
});
it('its critters: a bird or a seagull for each bird, at its home', () => {
  // roofsCritterSpawns: length 14; type 'bird' for pigeon and sparrow, 'seagull' for gull;
  // x, z the home's; roofBird the bird's id
});
it('no flight ends nearer her than it began, and none passes within 1.5 m of her', () => {
  // every perch p, every bird kind allowed there, 16 cat spots on a 2.2 m ring round p at p.y:
  // chooseFlight -> null, or dist(to, cat) >= 4 and > dist(p, cat) + 0.5, every sample >= 1.5 m away
});
it('a pigeon at a plank\'s or a gap\'s near end, chased from behind, flies to its far end', () => {
  // for each plank and each gap with no requirement: a pigeon at its from/end 0, the cat 2 m
  // behind (opposite the far end) -> chooseFlight(...).to is that move's far end
});
it('chased on and on, a pigeon\'s flights lead up the place to the loft', () => {
  // from plank-1:1, the cat always 2.2 m behind along the last flight: within 40 flights it lands
  // on a loft perch, every flight a link of G
});
it('sparrows and gulls make local hops and never lead', () => {
  // sparrow flights <= 6 m and below 7 m; gull flights between parapet/pot/aerial perches only
});
it('cornered, it flies away from her or flutters where it is', () => {
  // at the tower top, the loft's far corner and plank-3:1 with the cat on the plank 1 m short:
  // null, or a flight meeting the rules above
});
it('a bird on the rail ahead of her leaves ahead, never back over her', () => {
  // the cat on ridge-2 1.5 m behind a pigeon on its rail perch: the flight's every sample is >= 1.5 m
  // from her, and it lands further along (not on her side)
});
it('the guide flies stop by stop, then is a pigeon like the others', () => {
  // guideStep 0..3 -> the route's next stop; guideStep -1 -> the ordinary choice
});
it('the same chase gives the same flight, and nothing draws on Math.random', () => {
  // spy Math.random: zero calls across the file's flockPerches/flightGraph/chooseFlight runs;
  // two identical chooseFlight calls agree
});
```

- [ ] **Step 2: Run** `npx vitest run test/roofsflock.test.js`. Expected: FAIL (no module).
- [ ] **Step 3: Implement** `src/world/roofsflock.js`. Give it a short header that says what a perch is, the two kinds of link, the choice rule, the guide and the loft, and why a bird never flies toward her (the anti-goal).
- [ ] **Step 4: Run** `npx vitest run test/roofsflock.test.js test/roofsplan.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `src/world/roofsflock.js test/roofsflock.test.js`, with the message "Rooftops step 3: the flock's plan: perches on every move's ends, ridges, roofs and the loft, short flights that lead up the place and never toward her".

### Task 3: The flock drawn, perched

**Files:**
- Modify: `src/world/roofs.js` (collect the drawn spots; `record.birdPerches`), `src/roofslife.js` (make the flock)
- Create: `src/world/roofsbirds.js`
- Test: `test/roofsbirds.test.js` (create), `test/roofs.test.js`, `test/roofslife.test.js`

**Interfaces:**
- Consumes: Task 2's exports.
- `roofs.js`:
  - While drawing, it pushes `{ id, kind, x, y, z }` for every pot top (and the cowl's top on discovery F's pot), aerial top, parapet, post T-bar and yard-wall coping into `drawn`.
  - `record.birdPerches = flockPerches({ traversal: ROOFS_TRAVERSAL, ground, drawn, smoking: [] })`. Task 5 fills `smoking`.
  - `critterSpawns` stays `[]` here (Task 4).
- `createRoofsBirds(area, { scene, critters = null, visits = 0, reducedMotion = false }) → { birds, meshes, update(dt, catPos = null, camera = null), dispose() }`:
  - `birds`: `{ id, kind, at, flying, pos }[]` (live state, for the tests).
  - `meshes`: `[flock, wings]`: `InstancedMesh`es named `roofsFlock` (14) and `roofsFlockWings` (28), made inside `withLocalUuids('roofs-birds')`.
    - Vertex-coloured low-poly geometry (body, head, beak, tail ≤ 64 triangles; a wing ≤ 4); `instanceColor` per kind (pigeon 0x8d93a0, wing 0x7a8090; sparrow 0x8a6040 / 0x6e4a30; gull 0xeceae4 / 0xb8bcc2).
    - Scaled by `BIRD_KINDS[kind].scale`; `castShadow` false, `userData.noCast`; `frustumCulled = false` (S12).
  - Perched: a pigeon on a `roof` perch pecks (pitches 0.35 rad for 0.25 s every 1.5–3 s, by `hash01`); elsewhere a bird sits and turns its head every few seconds. Within 6 m of `catPos` it faces her. Wings are folded.
  - `update` allocates nothing and adds nothing to the scene. `dispose` removes both meshes and disposes their geometries and materials.
- `createRoofsLife`: if `area.birdPerches` is set, the life makes `createRoofsBirds(area, { scene, critters: ctx.critters ?? null, visits: ctx.visits ?? 0, reducedMotion: ctx.reducedMotion ?? false })`. `update(dt, t, catPos, camera)` passes `catPos` and `camera` on. `dispose` disposes it. Without `birdPerches` (the old tests' fake areas) nothing changes.

- [ ] **Step 1: Write the failing tests**
  - `test/roofs.test.js`:
    - `every bird perch sits on something drawn`: a ray down from 0.3 m above each perch meets a built mesh within 0.06 m of its `y`.
    - `the pots, the aerials, the parapets, the posts and the yard walls give perches`: drawn kinds present (pot ≥ 10, aerial 6, parapet ≥ 8 with none over a street, post 8, wall ≥ 6).
    - The existing `the built counts are pinned` still passes unchanged: the build draws no new mesh.
  - `test/roofsbirds.test.js` (built area, no critters):
    - `the flock is two meshes, casting nothing, fourteen birds at their homes`.
    - `a pigeon on a flat roof pecks; a bird on a ridge or a pot sits; near her, each faces her`.
    - `its update adds nothing to the scene and keeps its instance buffers`: the same `instanceMatrix.array` objects after 600 frames, and `scene.children.length` unchanged.
    - `making the flock draws nothing on Math.random`.
  - `test/roofslife.test.js`:
    - `the life makes the flock when the place has bird perches, and takes it away`: the scene's child count is back to before after `dispose`, and every geometry is disposed.
    - `the life adds at most three meshes, no casters, under 1,600 triangles` (counting after Task 5's smoke too; with the flock alone the count is two).
- [ ] **Step 2: Run** `npx vitest run test/roofsbirds.test.js test/roofs.test.js test/roofslife.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the drawn spots, `record.birdPerches`, `src/world/roofsbirds.js` (perched only; flights come in Task 4) and the life's wiring.
- [ ] **Step 4: Run** `npx vitest run test/roofsbirds.test.js test/roofs.test.js test/roofslife.test.js test/roofsflock.test.js test/budget.test.js`. Expected: PASS, with the built and merged counts unchanged.
- [ ] **Step 5: Commit** the five files, with the message "Rooftops step 3: the flock drawn: fourteen birds on ridges, pots, aerials, parapets and gutters, pecking on the flat roofs, in two draws".

### Task 4: Tag and leading: the birds are critters, the life flies them

**Files:**
- Modify: `src/world/roofs.js` (`record.critterSpawns`), `src/world/roofsbirds.js` (adoption, flights, the guide, the loft), `src/world/roofsplan.js` (`ROOFS_TOURS.birds`)
- Modify: `test/roofs.test.js`. Its two lines `expect(area.critterSpawns).toEqual([])` (~2032 and ~2327) become `expect(area.critterSpawns).toEqual(roofsCritterSpawns(ROOFS_BIRDS, perchIndex(area.birdPerches)))`. The second test's name loses nothing: still "no legendary cat, dog or strays".
- Create: `test/helpers/followbird.js`
- Test: `test/roofsbirds.test.js`

**Interfaces:**
- `record.critterSpawns = roofsCritterSpawns(ROOFS_BIRDS, perchIndex(record.birdPerches))`.
- `createRoofsBirds` with `critters`:
  - At creation it adopts every `c` in `critters.list` with `c.def.roofBird`. It hides each one's child meshes (`visible = false`), keeps the group visible (its contact decal follows it), and sets its position, `anchor` and `anchorHome` to the bird's perch.
  - With `visits === 0` the guide starts at `GUIDE.start`, with `guideStep` 0. Otherwise it starts at its home, with `guideStep` −1.
  - Every frame, for each bird:
    - if it is perched and its proxy is `fleeing`, it calls `chooseFlight` and starts that flight, or a flutter;
    - it advances the flight by `dt / time`, clamped so it lands exactly;
    - on landing it sets `at`, `flights + 1`, and moves the guide on a step (−1 after the last stop). It writes the proxy's `fleeing = false`, `cooldown = 0`, and its `anchor` and `anchorHome` to the perch;
    - it always writes the proxy's `group.position` to the bird's drawn spot.
  - In flight the wings beat (8 Hz, ±0.9 rad, gliding over the last 30%); under reduced motion they beat at 3 Hz, ±0.4.
  - A pigeon on a `loft` perch counts `restT`. Past `LOFT_REST` it goes back to its home perch, but only when she is more than `OUT_OF_SIGHT` from both perches and, with a `camera`, the home is outside the camera's frustum.
  - Without `critters` (the picture pages) no bird is ever flushed.
- `ROOFS_TOURS.birds`: the `YARD_TOURS` shape. The `firstRoof` steps, then walk to plank-3's near end (16, 29.3), along it to (16, 19.0), and on to the ext-10 roof.
- `followBird(w, getBird, area) → void`, called every frame (the test helper). Toward a target perch, by the moves alone:
  - the bird on her level (or at a crossing's end on it), or her on a crossing: push toward the bird;
  - otherwise, take the climb or gap whose `from` is on her level and whose `to` is nearest the bird: walk to its `from`; within 0.45 m, face along it and jump (at most every 0.5 s).

- [ ] **Step 1: Write the failing tests.** Each runs the real `createCritters` (`new THREE.Scene()`, the built area's `critterSpawns`, `{ ground, motionRng: mulberry32(7) }`) and the flock, frame by frame in `main.js`'s order: `critters.update(dt, t, catPos, catPos)`, then `birds.update(dt, catPos, camera)`.

```js
describe('the critters contract', () => {
  it('near a pigeon, it flutters to another roof nearby, never up into the sky', () => {
    // cat 1.5 m from the plank-1:1 pigeon, held still 4 s: its proxy was fleeing; it landed on
    // another perch 3..12 m away within 4 s; max y in flight <= max(from.y, to.y) + 1.4; landing
    // further from the cat; proxy.fleeing false after; proxy.group.position equals the bird's spot
  });
  it('a pounce tags a pigeon: it flaps off, nobody is removed, and it cannot be tagged again for 20 s', () => {
    // critters.pounceCatch(bird spot) -> { type: 'bird' }; it flies; critters.list length unchanged;
    // pounceCatch at its new perch 5 s later -> null; after 21 s -> { type: 'bird' }
  });
  it('a gull flutters off but is not tagged, as at the seaside', () => {
    // pounceCatch at the gull -> null; the cat within 3.4 m -> it flies
  });
  it('a meow within 5 m sends a bird off', () => { /* critters.reactToMeow(cat) -> it flies */ });
});
it('flushed again while flying, it keeps its flight; a 2 s frame lands it on its perch', () => {
  // mid-flight: proxy.fleeing = true again and critters.reactToMeow: same `to`;
  // one update(2.0): exactly on `to` (within 1e-6 + the perch bob), proxy.fleeing false
});
it('the guide pigeon: on the first visit it waits in the alley, then leads stop by stop to plank-3\'s far end', () => {
  // visits 0: at GUIDE.start; the cat brought within 2 m of it in turn: it lands on each route stop
  // in order; after the last it is an ordinary pigeon (guideStep -1). visits 1: it starts at its home
});
it('pigeons that reach the loft rest there, and are back home only where she cannot see', () => {
  // a pigeon landed on loft:2; cat 12 m away, 200 s: still there; cat > 30 m from loft and home,
  // camera looking away from home: home within LOFT_REST + 1 s; camera looking at home: still at the loft
});
it('in a real walk the roof birds are the walk\'s critters, drawn as one flock', () => {
  // lifecycle(); startWalk roofs: s.critters.list has 14 with def.roofBird; every proxy child
  // mesh is invisible; the scene has one roofsFlock and one roofsFlockWings; after
  // s.areaLife.update(1/30, t, s.cat.position, camera) each proxy's position is its bird's spot
});
it('following the guide pigeon, she is on a roof within a minute and over the first plank within ninety seconds', () => {
  // yardWalk({ area: built roofs area, at spawn, face north }) + critters + flock (visits 0);
  // followBird(w, guide) each frame: ground under her >= SHED by 60 s of walk time, and she
  // stands on ext-10 (y EXTENSION, x 14.5..17.5) by 90 s
});
it('the birds tour (the film): the guide is waiting at plank-3\'s far end before she gets there', () => {
  // createYardPilot(ROOFS_TOURS.birds) on yardWalk + critters + flock: done in under 45 s;
  // the guide lands on plank-3:1 before her z first goes below 21
});
```

- [ ] **Step 2: Run** `npx vitest run test/roofsbirds.test.js test/roofs.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the spawns, the adoption, flights and landing, the guide, the loft, `ROOFS_TOURS.birds` and `test/helpers/followbird.js`.
- [ ] **Step 4: Run** `npx vitest run test/roofsbirds.test.js test/roofs.test.js test/roofsflock.test.js test/roofswalk.test.js test/roofslife.test.js test/roofsplan.test.js test/critters.test.js`. Expected: PASS, with `ROOFS_TOURS.firstRoof` and `.terrace`'s tests unchanged.
- [ ] **Step 5: Commit** the files above, with the message "Rooftops step 3: the birds are critters for tag (pounce, bell, meow, journal) and the roofs' life flies them roof to roof; on the first visit a pigeon leads her from the alley over plank-3; the loft is home".

### Task 5: What the wind moves: the washing and the smoke

**Files:**
- Create: `src/world/roofsair.js`
- Modify: `src/world/roofsplan.js` (`ROOFS_WIND`, `SMOKE_POTS`), `src/world/roofs.js` (the vane's yaw from `ROOFS_WIND`; the cloth material; `aSway` on every cloth piece; `potTops`, `smokePots`, `washSway`; `smoking` passed to `flockPerches`), `src/roofslife.js`
- Test: `test/roofsair.test.js` (create), `test/roofs.test.js`, `test/roofslife.test.js`

**Interfaces:**
- `ROOFS_WIND = Object.freeze({ from: 0.6 })`: the vane's "where the wind is from tonight", which `roofs.js` now reads. The vane looks as before.
- `downwind() → [x, z]`, equal to `[−cos(from), −sin(from)]`.
- `SMOKE_POTS`: three pot ids. One is discovery F's cowled pot (stack −10, side −1). The other two are on different stacks and drawn (the test checks `potTops`).
- **The washing:**
  - `makeWashMaterial(material) → uniforms` `{ uWashT, uWashAmp, uWashRest }`, kept on `material.userData.wash`. `customProgramCacheKey` is `'roofs-wash-v1'`.
  - `swayAttribute(geometry, { lineY, nx, nz, phase }) → geometry` adds `aSway` (vec3): `(nx·depth, nz·depth, phase)` with `depth = max(0, lineY − y)`. `(nx, nz)` is the line's horizontal normal on its downwind side.
  - `WASH = { amp: 0.3, rest: 0.12, flutter: 1.9, gust: 0.12 }`.
  - `washSwayAt(sway, t, amp, out) → out` is the shader's offset on the CPU:
    - `k = WASH.rest + amp · (0.5 + 0.5·sin(flutter·t + phase)) · (0.7 + 0.3·sin(gust·t))`;
    - `x += sway.x·k`, `z += sway.z·k`, `y += depth·k²·0.5`.
  - The kit puts `aSway` on every piece in the `cloth` bucket after `prep`: zeros for the bike's tyres, the line's for each thing hanging. `record.washSway` is the uniforms.
- **The smoke:**
  - `SMOKE = { perPot: 7, life: 6, rise: 0.45, drift: 0.35, top: 3.2, size: [0.12, 0.5] }`.
  - `puffAt(pot, i, t, out) → out` `{ x, y, z, s }`. Its age is `(t / life + i / perPot) mod 1` of `life`. It rises at `rise`, drifts `downwind()` at `drift` with a small curl, and grows from 0 to `size[1]`, back to 0 over its last 15%.
  - `createRoofsSmoke(scene, pots, { reducedMotion }) → { mesh, update(t), dispose() }`: one `InstancedMesh` (`roofsSmoke`) of `IcosahedronGeometry(1, 0)` puffs. Grey 0xb8b4b0, `transparent`, opacity 0.55, `depthWrite` false, no casting, `frustumCulled = false`, made inside `withLocalUuids('roofs-smoke')`. Under reduced motion `t` runs at half speed.
  - `record.potTops`: `{ [potId]: { x, y, z } }`. `record.smokePots` is `SMOKE_POTS` looked up in it.
- `createRoofsLife` sets `uWashT` to walk seconds every frame, and `uWashAmp` to `WASH.amp` (0 under reduced motion). It makes the smoke when `area.smokePots` is set.

- [ ] **Step 1: Write the failing tests**
  - `test/roofsair.test.js`:
    - `the washing sways from its line: nothing on the line moves, the hem the most, always downwind, never more than 0.45 of its drop`;
    - `it swings in time, and holds a still lean with no amplitude`;
    - `swayAttribute gives each vertex its drop under the line, on the line's downwind side`;
    - `smoke rises from its pot and drifts downwind, never more than 3.2 m up or 2.5 m away`;
    - `each puff is born and gone at size 0, and the column is the same at the same time`;
    - `the smoke is one mesh of 21 puffs, casting nothing; making it draws nothing on Math.random`.
  - `test/roofs.test.js`:
    - `every thing on a line sways from it; the tyres do not`: `aSway` length 0 at each item's top vertices and growing down it; `(sway.x, sway.z) · downwind() ≥ 0`; the tyres' ranges all zero;
    - `the washing keeps its own material through the walk's prop merge`: after `mergeStaticProps`, two meshes carry `material.userData.wash`, with the same uniforms object as `record.washSway`;
    - `three pots smoke, the warm chimney's among them, each a drawn pot, and no bird perches on one`.
  - `test/roofslife.test.js`:
    - `the washing swings with walk time, and holds its lean under reduced motion`: `uWashT` equals the summed dt; `uWashAmp` is `WASH.amp`, or 0 with `reducedMotion`;
    - `the life makes the smoke and takes it away`.
- [ ] **Step 2: Run** `npx vitest run test/roofsair.test.js test/roofs.test.js test/roofslife.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the wind, the wash material and attributes, the smoke and the life's wiring.
- [ ] **Step 4: Run** the same files plus `test/roofsbirds.test.js test/roofsflock.test.js test/budget.test.js test/roofsplan.test.js`. Expected: PASS, with the built and merged counts unchanged and the build's `Math.random` count unchanged.
- [ ] **Step 5: Commit** the files above, with the message "Rooftops step 3: the wind on the roofs: the washing sways downwind from its lines and three chimneys smoke, the warm one among them".

### Task 6: Cats sunning (S1; owner question 1, one commit to drop if he says no)

**Files:**
- Modify: `src/world/roofsplan.js` (`ROOFS_SLEEPERS`, `ROOFS_REGISTRATION.budget`), `src/world/roofs.js` (`drawSleepers`, `record.sleepers`), `src/roofslife.js` (breathing)
- Modify: `test/roofs.test.js` (`MEASURED_BUILT`, `MEASURED_MERGED`), `test/budget.test.js` (the two Rooftops rows' comments only; ceilings unchanged)
- Test: `test/roofs.test.js`, `test/roofslife.test.js`

**Interfaces:**
- `ROOFS_SLEEPERS`: two `{ id, x, y, z, yaw, coat }`, each on a drawn back-window sill of the terrace. One coat is ginger (0xc8783a with cream 0xeadbc0), one grey and white (0x8a8c90 / 0xe8e6e0).
- Each sleeper is one mesh named `roofsSleeper:<id>`, curled: body, head tucked on its paws, ears, tail round. Vertex colours, ≤ 320 triangles, `userData.noMerge`, `noCast`.
- The life breathes each one: `scale.y = 1 + 0.02·sin(1.3·t + i)`, still under reduced motion. The sleepers have no label, no prompt and no list a game system reads.

- [ ] **Step 1: Write the failing tests**
  - `test/roofs.test.js`:
    - `two house cats sleep on warm sills, out of her reach`. Each sits on a drawn mesh (the ray down, as in Task 3). No ground she can walk to (the flood with `ALL`) lies within 0.6 m beside it, or within 1.0 m below it. It is 0.5 m clear of every rail, hop spot, POI, collectible and discovery.
    - `the sleepers are their own meshes, never merged, casting nothing`.
    - `the built counts are pinned`, re-pinned with the reason: +2 meshes, the measured triangles, merged +2.
  - `test/roofslife.test.js`:
    - `they breathe: a slow rise and fall under 3%, still under reduced motion`.
- [ ] **Step 2: Run** `npx vitest run test/roofs.test.js test/roofslife.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement**, then re-pin `MEASURED_BUILT`, `MEASURED_MERGED`, `ROOFS_REGISTRATION.budget` and the budget comments. Built must be at most 116 / 68 / 37,400, merged 59 / 30.
- [ ] **Step 4: Run** `npx vitest run test/roofs.test.js test/roofslife.test.js test/budget.test.js test/roofsplan.test.js test/roofsbirds.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the files above, with the message "Rooftops step 3: two house cats asleep on warm sills (scenery: no name, no play, out of her reach)".

### Task 7: The pictures, the film, the worst spots, the build, the full suite

**Files:**
- Modify: `src/world/roofsplan.js` (`ROOFS_LIFE_SHOTS`), `verify-places.html`, `verify-traversal.html`
- Test: `test/roofs.test.js`

**Interfaces:**
- `ROOFS_LIFE_SHOTS`: `{ name: { view: 'px,py,pz,lx,ly,lz', t } }` for:
  - `guide`: the alley at t 0, the guide on its first stop;
  - `plank`: from the shed, a pigeon waiting at plank-3's far end;
  - `washing`: line-2 close, at t 240.5;
  - `smoke`: along the ridges, three wisps;
  - `loft`: the warehouse roof, the loft and a gull on its parapet;
  - `sleeper`: one sleeping cat on its sill.
  - Kept out of `ROOFS_SHOTS`, whose eight-view and `ROOFS_SHOT_T` tests stand.
- `verify-places.html`: `__shot(name)` also takes a `ROOFS_LIFE_SHOTS` name, running the life to its `t`. The life's update is given `t`, a stand-in cat spot far away and the camera.
- `verify-traversal.html`:
  - `critters=1` builds `createCritters(scene, area.critterSpawns, { ground: area.ground, motionRng: mulberry32(7) })` and passes `{ critters, visits: 0 }` into `area.life`;
  - each frame runs `critters.update(dt, t, cat.position, cat.position)` before `life.update(dt, t, cat.position, camera)`;
  - its header comment lists `tour=birds`.

- [ ] **Step 1: Write the failing test** `has its six life views, each six numbers and a walk second`. Run `npx vitest run test/roofs.test.js`. Expected: FAIL. Implement `ROOFS_LIFE_SHOTS`. Expected: PASS.
- [ ] **Step 2: The before set.** Copy `<scratchpad>/rooftops-step2/beauty2/after/` (its PNGs and `perf.md`) to `<scratchpad>/rooftops-step3/before/`. `<scratchpad>` is `/private/tmp/claude-501/-Users-pniessen--claude-spares-spare-gcns3j/e37e3895-a9b0-4a89-9360-a15387ffb2e4/scratchpad`.
- [ ] **Step 3: The after set**, shot exactly as `beauty2/after/perf.md` says:
  - Start `npx vite --port 5177 --strictPort` in the background (5178 or 5179 if taken). Stop only that pid at the end.
  - Run `node scripts/record-page.mjs --url 'http://localhost:5177/verify-places.html?area=roofs&bare&size=1280x720' --out <scratchpad>/rooftops-step3/after --shots alley,terraces,ridge,gap,warehouse,tower,edge,guide,plank,washing,smoke,loft,sleeper --size 1280x720`, plus the card at 640x360.
  - Write `perf.md` there: `__info()` calls and triangles for each shot, beside the before numbers.
  - Check against the step-3 budget (Global Constraints). If a shot is over, trim (fewer peck spots drawn near, smaller puffs) and re-shoot.
  - Look at every picture beside its before by eye, and note what changed.
- [ ] **Step 4: The film.** Run `node scripts/record-page.mjs --url 'http://localhost:5177/verify-traversal.html?area=roofs&tour=birds&critters=1&drive=1&bare&size=1280x720' --out <scratchpad>/rooftops-step3/after/film --tour birds --size 1280x720`. Watch it: the guide flies ahead stop by stop and waits on ext-10; the washing moves; the smoke drifts. Stop vite.
- [ ] **Step 5: The build.** Run `npm run build`. Expected: it passes, with start-up no larger than after Task 1 (ceiling 700 kB) and the roofs chunk at most 60 kB gzipped (35.57 kB before step 3). Report both.
- [ ] **Step 6: The full suite** (the controller, once). Check `uptime` against `sysctl -n hw.ncpu`, then run `npx vitest run`. Expected: all green. A failure that passes alone twice is load flake: note it, never edit it away.
- [ ] **Step 7: Commit** `src/world/roofsplan.js verify-places.html verify-traversal.html test/roofs.test.js`, with the message "Rooftops step 3: the life's picture views and the birds film with real critters".
- [ ] **Step 8: The report for the owner.** Give the pictures' and the film's paths, the before/after table, the built, merged and life counts, the gate's number, the five owner questions, and what waits for step 4: the pigeon's own name, the loft's cooing and its following pigeon, the warm chimney's ring, the skills, the golden mice, height, dusk polish.

---

## Self-review (done while writing)

- **Spec coverage (step 3):**
  - Perching at height (ridges, chimneys, aerials, gutters) and pecking on flat roofs: Tasks 2–3.
  - Short flights roof to roof, not into the sky: Task 2 (rules), Task 4 (on the real critters).
  - Leading: they wait at plank ends and gap landings (homes, the choice), and chasing walks the routes (S6, Task 2's tests).
  - Tag, never hurt, never removed: Task 4's contract.
  - The first-visit guide: S7, Task 4. The loft as home: S8, Task 4. The Goal, "the first roof within the first minute, following a bird": Task 4's `followBird` test.
  - Anti-goals: nothing that chases the cat (Task 2's sweep); nothing frightening (short, low, silent flights; no perch over the street).
  - The owner's extras: gulls (S2), cats sunning (S1, Task 6), washing (S4, Task 5), smoke (S3, Task 5).
  - Left for step 4 on purpose: discoveries B and F, the skills, golden mice, height, dusk polish, bird sounds, the pigeon's name.
- **Type consistency:**
  - `flockPerches`, `perchIndex`, `flightGraph`, `chooseFlight`, `flightPlan`, `flightPoint`, `roofsCritterSpawns`, `ROOFS_BIRDS`, `GUIDE`, `LOFT_REST`, `OUT_OF_SIGHT` and `FLIGHT` are defined in Task 2 and used in Tasks 3–4.
  - `createRoofsBirds(area, { scene, critters, visits, reducedMotion })` is defined in Task 3 and extended in Task 4.
  - `ROOFS_WIND`, `downwind()`, `SMOKE_POTS`, `potTops`, `smokePots` and `washSway` come from Task 5. `smoking` is fed back to `flockPerches` there.
  - The life's `update(dt, t, catPos, camera)` matches `main.js`'s call.
- **Proportion:** the code blocks are tests and signatures. Coordinates and counts are the plan's decisions; exact peck spots, sills and drawn spots are left to the builder under the tests.
- **Risk:** Task 1 is the only shared hunk (S5). The critters contract tests are the guard on the other worktree's changes.
