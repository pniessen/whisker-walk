# Polish: camps, name tags, fight framing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clan camps read as Warrior Cats camps, camp name tags stop piling up, and the fight camera shows the player's own cat with bright score pips.

**Architecture:** `src/world/camp.js` gains a pure `campDressing(areaId)` (positions only, seeded by `seedFromCode`/`mulberry32`, never walkRng) and draws it as merged, mostly non-casting meshes. Everything new is visual only: no new colliders, no change to `campLayout` positions, seats or `campDiscs`. `src/nametag.js` gains a pure tag-budget helper that `src/clancats.js` uses; `src/intruders.js` hides the intruder's tag while my own fight holds it. `src/fightcam.js` adds a "does the intruder hide OUR cat" cost to its candidate ranking and tighter, lower rings; `src/ui/fightui.js` draws the pips as SVG paws.

**Tech Stack:** Three 0.185, Vite 8, Vitest 4, plain ES modules.

**Spec:** the controller's brief (survey items #2 and #4, pass-1 split items 7–9) in `scratchpad/polish-survey.md` lines 54–100, plus the shared rules in `scratchpad/polish-common.md`. Scratchpad = `<scratchpad>`.

## Global Constraints

- Work only in `<repo>/.worktrees/polish-camps` (branch `polish-camps`). Dev server port 5198 only. Never push or merge, never edit `.claude/launch.json`.
- Do NOT edit `src/world/builder.js`, `src/world/gorge.js`, `src/world/gorgeshape.js` (gorge-rock owns them), `src/cat/*`, `src/scars.js`, `src/weather.js`, `src/render/water.js`, or the water/bank parts of woods/moor/pines/seaside.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` (main: 222 files, 6,152 tests, all green) and `npm run build`. Long geometry sweeps get explicit timeouts (120_000/180_000). Never weaken a test to beat a load timeout.
- Determinism: no `Math.random`, no draws on walkRng or strayStream in anything a world build or walk runs. `test/fixtures/flat-trace.json` sha256 must stay `6b502ab6b1f9ce328fd6c6b7ce656fd473e50670708fac53985590bc9f0e54a7`; Moor build draw count stays 7944 (`test/flattrace.test.js`). If the trace moves, diff it key by key: only render-side fields may change, and then the re-record is a separate final commit.
- Gameplay unchanged: colliders, walkable ground, keep-out, spawn, routes, seats, homes, den trespass, touch-noses.
- Float fixtures compare with `closeDiffs` (test/helpers/closeto.js).
- Performance: iPhone 18 at 60 fps on HIGH. New dressing merged to one mesh per material; small/flat dressing `userData.noCast = true`. Main-pass draw budget for one flat camp: at most 8 (today 3). Report draws/triangles before and after.
- Copy the kids read: short, warm, plain.
- Commits: explicit `git add <paths>`; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rulings go in the ledger `scratchpad/polish-camps-ledger.md` with the cost if wrong.

## Rulings already made (controller)

- **R1 Trees stay.** The camp trees inside the discs (woods 3.44,-45.4; river 7.62,3.12; moor -1.58,-46.25; pines -35.92,43.2 and -39.31,37.51) are seeded plantings with colliders, climb forks and fixtures behind them. Moving them changes gameplay and determinism. The ring passes outside them; treefade (polish-5) already fades a tree between camera and cat. Cost if wrong: a follow-up that excludes the disc from planting, with fixture re-records.
- **R2 The ring is visual only.** No colliders; clumps are low (0.30–0.55 m) and spaced, so a cat walking a route through it reads as pushing through brambles. One entrance gap. Cost if wrong: cats visibly walk through the wall where routes cross it.
- **R3 Footprints stay.** Den collider r 1.1 and rock collider r 0.6, the leader's seat height (`rock.h` 0.8) and every seat stay. The Highrock gets taller by a back stone inside the same footprint, not by raising the leader.
- **R4 Tag budget.** At most 2 clan-cat tags show at once: the 2 nearest within reveal range, the buddy's (a clan cat walking with her) always one of them; a shown tag fades over the last 1 m of its range.
- **R5 Intruder tag** hidden while my own fight holds it (`state === 'held'` and held locally). Not hidden for a co-walker's fight or the challenge pill.

## Review Focus

1. A camp cat walking its patrol route out of camp — ring clumps must not sit on a route's first metres in a way that looks like a wall; the gap should face the camp's open side. (Task 1 test: no clump within 0.5 m of any seat or home; gap faces away from the den.)
2. Ring clumps meeting a tree trunk, boulder or other collider outside the disc — skip clumps that overlap any collider already in `area.colliders` (Task 1 test).
3. Clearing disc z-fighting with the ground or path decals at shallow camera angles (Task 2: polygonOffset + small lift; live check at camp-high and ground views).
4. The tag budget hiding her friend's name when she walks up to a cat that is 3rd-nearest because two kits sit closer (Task 4 test: the cat within touch range is always shown).
5. The new fight cost pushing the camera into a view the old guarantees reject (in rock, behind an unhideable stand pine, out of frame) — the new cost only reorders candidates; every existing check still applies (Task 5: existing world/gorge tests stay green, 0 of 420 Gorge frames in rock).

---

### Task 1: `campDressing(areaId)` — pure layout of the dressing

**Files:**
- Modify: `src/world/camp.js`
- Test: `test/campdressing.test.js` (new)

**Interfaces:**
- Consumes: `campLayout(areaId)`, `DISCS`, `CAMP_TURN`, `LEDGE_CAMPS` (existing), `seedFromCode`, `mulberry32` from `src/rng.js`.
- Produces: `export function campDressing(areaId, colliders = []) -> null | { ring: null | { r, gap: { a, half }, clumps: [{ x, z, s, h, rot }] }, clearing: null | { x, z, r }, nests: [{ x, z, r }], kill: { x, z } }`. `colliders` is the area's collider list at addCamp time (clumps overlapping any of them, by r + 0.25, are dropped). For a ledge camp: `ring: null`, `clearing: null`. A fresh object every call; same input → same output.

Values: ring radius `RING_R = disc.r - 0.6`; gap centred on `CAMP_TURN + π` (away from the den), half-width `0.33` rad; clumps every ~0.55 m of arc with ±0.12 m radial jitter, scale `s` 0.8–1.2, height `h` 0.30–0.55; clearing at the disc centre, `r = RING_R - 0.7`; one moss nest (r 0.4) under each elder and kit seat; the fresh-kill pile beside the rock on the centre side, ≥0.6 m from every seat and outside den/rock colliders + 0.3. Gorge: nests under its elders and kits (in the den) and the pile on the Wide Ledge (the y 8 level), ≥0.6 m from every seat and the rock, with `ground.y` equal at its spot to the seat level (test with `gorgeGround()` as camp.test.js does).

- [ ] **Step 1: Write failing tests** in `test/campdressing.test.js`: for each of woods/river/moor/pines — deterministic (two calls deep-equal); every clump's distance from (cx,cz) within `RING_R ± 0.15`; no clump inside the gap (angle to `CAMP_TURN+π` > `gap.half`); no clump within 0.5 m of any seat, the den or rock collider edge, or any roaming home (`roamHomes` in src/clancast.js; see camp.test.js for how it is called); passing a collider `{x,z,r}` on the ring drops the clumps it overlaps; no clump within (r + 0.25) of any collider of the real built map (build each area as `test/camp.test.js`/`rivalworld` do); clearing radius < RING_R; nests coincide with elder+kit seats; pile ≥ 0.6 m from every seat. Gorge: `ring === null`, `clearing === null`, nests at its seats, pile on the ledge level. Non-camp areas (`neighborhood`): `null`.
- [ ] **Step 2: Run** `npx vitest run test/campdressing.test.js` — expect FAIL (no export).
- [ ] **Step 3: Implement** `campDressing` in `src/world/camp.js` using a local `mulberry32(seedFromCode('camp-' + areaId))`. Do not touch `campLayout`.
- [ ] **Step 4: Run** the new test plus `test/camp.test.js test/gorgeclan.test.js test/flattrace.test.js` — expect PASS.
- [ ] **Step 5: Commit** `feat(camp): campDressing, the pure layout of a camp's ring, clearing, nests and fresh-kill pile`.

### Task 2: Draw the flat camps

**Files:**
- Modify: `src/world/camp.js` (`addCamp` and mesh helpers)
- Modify: `test/camp.test.js` (the "one group of three meshes" test describes the old look — rewrite it for the new structure; keep its collider and noCast assertions)
- Test: `test/camp.test.js`, `test/woods.test.js`, `test/river.test.js`, `test/moor.test.js`, `test/pines.test.js` (each expects exactly one `clanCamp` child — keep that true)

**Interfaces:**
- Consumes: `campDressing(areaId, area.colliders)` (Task 1).
- Produces: scene children `clanCamp` (Group: den mound, doorway frame, door, Highrock, nests, fresh-kill pile — merge-friendly: each material's meshes merge under `mergeStaticProps`), `campRing` (one merged mesh, `noCast`), `campClearing` (one flat mesh, `noCast`, `receiveShadow`). Ring and clearing are separate top-level children because the contact-shadow scan's MAX_SPAN is 6.5 m (see mergeprops.js header): `clanCamp`'s box must stay under it so den+rock keep their decal.

Look (all colours deterministic, no textures beyond existing `surfaceProps` presets):
- **Den:** woven bramble mound — the dome kept within r 1.1 / h 0.9, vertices displaced inward/outward ±6% by a hash of their position, darker base green 0x2f4a24 with vertex-colour streaks toward 0x4a6b33, plus 5–7 arched bramble strands (thin `TorusGeometry` half arcs, r 0.03–0.04) over it. Doorway: the dark door disc kept, framed by an arch of two or three stick/bramble tori in a brown 0x5a4128.
- **Highrock:** the existing dodecahedron base (leader stands at h 0.8 on it), plus 1–2 stacked stones: a taller back stone rising to ~1.5 m on the side away from the camp centre, and a smaller step stone; all within 0.7 m of the rock centre. Same grey material.
- **Ring:** clumps as low squashed icosahedrons (detail 0) in 2 greens, vertex coloured, merged to ONE mesh.
- **Clearing:** a polygon disc with a hash-jittered edge, sandy 0xc9b38a, at y 0.015 with `polygonOffset` (factor -1, units -1), `noCast`.
- **Nests:** low moss rings (torus, r 0.35, tube 0.09, squashed) 0x6f8f3a, `noCast`.
- **Fresh-kill pile:** 3–4 small brown/grey lumps (mouse/bird shapes need not be literal) ≤ 0.2 m tall, `noCast`.

- [ ] **Step 1: Write failing tests** in `test/camp.test.js`: for each flat camp — scene children names are exactly `['campClearing', 'campRing', 'clanCamp']` (sorted); colliders pushed are still exactly `[den, rock]` as today; `campRing` and `campClearing` have `userData.noCast === true`; every vertex of the den group parts stays within r 1.25 of the den centre and below y 1.0; every Highrock vertex within 0.75 m of the rock centre and the top ≥ 1.3 m; the box of `clanCamp` spans < 6.5 m in x and z; after `mergeStaticProps(scene)` the camp's main-pass meshes (`isMesh`, visible) number ≤ 8 across the three children.
- [ ] **Step 2: Run** `npx vitest run test/camp.test.js` — expect FAIL.
- [ ] **Step 3: Implement** in `addCamp` (flat branch only; the ledge branch is Task 3).
- [ ] **Step 4: Run** `npx vitest run test/camp test/woods test/river test/moor test/pines test/clan test/rivalworld test/flattrace test/contactshadows` — expect PASS. Check the flat-trace sha256. If it moved, do the isolation diff (Global Constraints) and report; do not re-record in this task.
- [ ] **Step 5: Commit** `feat(camp): bramble ring, sandy clearing, woven den, stacked Highrock, nests and fresh-kill pile`.

### Task 3: Gorge ledge camp dressing

**Files:**
- Modify: `src/world/camp.js` (`addLedgeCamp`)
- Modify/Test: `test/camp.test.js` (ledge describe block)

**Interfaces:**
- Consumes: `campDressing('gorge')` nests and pile (Task 1); the stacked Highrock helper (Task 2) may be reused for the ledge rock if the rock-alone footprint test stays green.
- Produces: top-level children `campBedding` (now moss nests on the ground under each seat, still one merged mesh, still `noCast`), `campRock`, and `campKill` (the pile, one merged `noCast` mesh, seated at `ground.y` under each lump). No ring, no clearing, no ground change.

- [ ] **Step 1: Update tests**: ledge children names `['campBedding', 'campKill', 'campRock']`; one collider (the rock) as today; the rock-alone footprint test still finds exactly one footprint at (8.3, 41.5); every `campKill` vertex within 0.25 m above `ground.y` at its x,z; the flat-ground variant stands at y 0.
- [ ] **Step 2: Run** `npx vitest run test/camp.test.js` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run test/camp test/gorge test/gorgeclan test/gorgeshape test/flattrace` — PASS.
- [ ] **Step 5: Commit** `feat(camp): moss nests and a fresh-kill pile on the Gorge's Wide Ledge`.

### Task 4: Name-tag declutter

**Files:**
- Modify: `src/nametag.js` (new pure helper), `src/clancats.js` (the tag loop in `update`, ~line 624), `src/intruders.js` (tag visibility, ~line 482)
- Test: `test/nametag.test.js` (helper), `test/clancats.test.js` (wiring), a test for intruders tag-in-fight in `test/intruders.test.js`

**Interfaces:**
- Produces: `export const CAMP_TAG_MAX = 2; export const TAG_FADE_M = 1;` and `export function tagBudget(entries, max = CAMP_TAG_MAX) -> Map<entry, opacity>` in `src/nametag.js`, where `entries = [{ d, range, keep }]` (`d` distance to her cat, `range` reveal range, `keep` true for the buddy). Returns the entries to show with opacity: in range only; `keep` first, then nearest; at most `max`; opacity `clamp((range - d) / TAG_FADE_M, 0, 1)` but 1 for the nearest. Entries not in the map are hidden.
- clancats: tag `visible` and `material.opacity` from `tagBudget`. Render-only: no change to any cat state.
- intruders: `cur.tag.visible = false` while `cur.state === 'held' && heldByMe()`.

- [ ] **Step 1: Failing tests** — `tagBudget`: 8 entries at d 0.5..3.9 range 4 → exactly 2 shown, the two nearest; a `keep` entry at d 3.5 is shown with the nearest; entries with d ≥ range never shown; the nearest has opacity 1; an entry at d 3.5 range 4 (second) has opacity 0.5; empty list → empty map. clancats: build a camp cast (as clancats.test.js does), put her cat at the camp centre, run `update` once, count visible tags ≤ 2, and the cat nearest her is visible. intruders: after `hold(visit, id, pos, { local: true })` and an `update`, the tag is not visible though she stands within range; after `release`, visible again; a non-local hold keeps it visible.
- [ ] **Step 2: Run** them — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run test/nametag test/clancats test/clanmates test/intruders test/clanfight test/flattrace` — PASS.
- [ ] **Step 5: Commit** `feat(nametag): at camp show only the two nearest clan tags; the intruder's tag steps aside in a fight`.

### Task 5: Fight framing keeps our cat in view, tighter and lower

**Files:**
- Modify: `src/fightcam.js` (`candidates`, `RINGS`, `AIM_Y`, new constants)
- Test: `test/fightcam.test.js`, `test/fightcamworld.test.js`, `test/gorgeclan.test.js`, `test/clanfight.test.js`, `test/treefade.test.js`

**Interfaces:**
- Produces: `export function ourCatHidden(pos, subject, g0 = 0) -> number` (0..1: the share of `subject.me` spots × CAT_HEIGHTS whose line from `pos` passes within `IT_BODY_R = 0.32` m of a vertical segment (y g0..g0+0.9) at any `subject.it` spot) and `export function itNearer(pos, subject) -> boolean` (the intruder's nearest spot is closer to `pos` than our cat's nearest spot by more than 0.3 m). `candidates()` adds `HIDE_COST * ourCatHidden + (itNearer ? NEAR_COST : 0)` to each candidate's cost, with `HIDE_COST = 10`, `NEAR_COST = 3`. Everything else in `chooseFightView` unchanged (same hard checks, same tree/rock rules).
- Framing: `AIM_Y` 0.3 → 0.12; prepend two tighter rings `{ d: 4.2, h: 1.5 }, { d: 4.6, h: 1.1 }` before the existing list (the existing rings stay as fallbacks). The frame check (`FIGHT_FRAME`) is unchanged, so on narrow screens tight rings simply fail `inFrame` and the chooser falls through.

- [ ] **Step 1: Failing tests** in `test/fightcam.test.js`: `ourCatHidden` is 1 for a camera straight behind the intruder on the line through both cats and 0 from straight behind our cat and from side-on; `itNearer` true/false for those two; on open flat ground with `yaw0` straight behind the intruder, `chooseFightView` returns a view with `ourCatHidden(view.pos, subject) === 0` and `itNearer === false`; the chosen view on open ground is ring 0 or 1 (the tight rings) at desktop aspect 16/9 and fov 70, and the pair's middle projects below NDC y 0.2.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run test/fightcam test/fightcamworld test/gorgeclan test/clanfight test/treefade test/flattrace` — PASS. Any existing test pinning a count that changes (e.g. a count of uncleared spots in fightcamworld) may be re-pinned only if the new value is no worse for the guarantee it guards; say which and why in the report. The Gorge check must still read 0 of 420 frames in rock, and no stand pine left unhidden.
- [ ] **Step 5: Commit** `feat(fightcam): prefer views where the intruder does not hide our cat; frame tighter and lower`.

### Task 6: Bright score pips

**Files:**
- Modify: `src/ui/fightui.js` (`pips`), `src/style.css` (`.pip` rules near line 1373 only)
- Test: `test/fightui.test.js`

**Interfaces:**
- Produces: `pips(n)` returns two `<span class="pip">` / `<span class="pip on">` each holding one inline SVG paw (viewBox 0 0 24 24: one pad and four toes). Empty: `fill="none"` with a gold stroke `#ffd45a`, stroke-width 1.8. On: `fill="#ffc93c"` with a dark edge `#5a3800`. `aria-hidden="true"` on the svg, and the `.fight-side` gets `aria-label="You: 1 of 2"` style text. CSS: `.pip svg { width: 28px; height: 28px; }`, opacity 1 for both (no dimming), `.fight-side` label text 1.05rem bold; in the `max-height: 500px` block 22px.

- [ ] **Step 1: Failing tests**: `renderFightHtml({ wins: 1, losses: 0 })` contains exactly one `pip on` in the You side and none in the It side; every pip contains an `<svg`; an on pip's svg has `fill="#ffc93c"`, an empty one `fill="none"`; the You side's aria-label reads `You: 1 of 2`. Update any existing assertion that looked for the 🐾 glyph in pips.
- [ ] **Step 2: Run** `npx vitest run test/fightui.test.js` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run test/fightui test/clanfight` — PASS.
- [ ] **Step 5: Commit** `feat(fightui): bigger gold score paws, filled against outlined`.

### Task 7: Full suite, build, live AFTER shots and pairs

**Files:** none in the repo (unless a fix is needed). Scratchpad only.

- [ ] **Step 1:** Full suite and `npm run build`; record counts. flat-trace sha256 check.
- [ ] **Step 2:** Start `npx vite --port 5198 --strictPort` in the worktree; run the AFTER commands in `scratchpad/snaps-polish-camps/harness/README.txt` with `SNAPDIR=scratchpad/snaps-polish-camps/after`; then `node harness/mergenum.mjs $SNAPDIR`. Stop the server.
- [ ] **Step 3:** Build 6–8 side-by-side pairs (before | after, labelled) into `scratchpad/snaps-polish-camps/pairs/`: woods camp ground, moor camp-high, pines or river camp, woods phone camp (390 wide), gorge ledge, hag fight squareoff or clue, ff phone fight beat. Python/PIL or ImageMagick, whichever is installed.
- [ ] **Step 4:** Look at every pair; list what reads better and anything that looks wrong (clumps in trees, z-fighting, a tag pile, our cat hidden, pips unclear).
- [ ] **Step 5:** Draw/triangle table before vs after from `before/numbers.json` and `after/numbers.json`.

### Task 5b (added by the controller after the Task 5 live check): cats just above the real sheet

Live, Task 5 put our cat in front, but on a phone held upright ~330 px of empty grass still lies between the cats and the sheet: the frame's bottom is the worst-case sheet (`FIGHT_FRAME.bottom` −0.08 ≈ a 46vh sheet) and the aim is a fixed `AIM_Y`, while the real portrait sheet is ~31% of the screen.

**Files:** `src/fightcam.js`, `src/main.js` (the one `fightCam.update` call, ~line 840), `test/fightcam.test.js`.

**Interfaces:**
- `chooseFightView({ ..., frameBottom = FIGHT_FRAME.bottom })` and `blendClear(..., frameBottom)`; `createFightCam().update(dt, { ..., sheetTop })` where `sheetTop` is the measured sheet's top edge in NDC (`1 - 2 * sheetPx / viewportPx`, from `#hud`'s `--fight-sheet-h`, null when unknown). `frameBottom = clamp(sheetTop + 0.06, -0.6, FIGHT_FRAME.bottom)`; null → `FIGHT_FRAME.bottom` (today's behaviour exactly).
- Per view, after the spot is chosen, the pitch is set so the lowest frame point sits at `frameBottom + 0.02` instead of the pair's middle at `AIM_Y`, provided every frame point still fits under `FIGHT_FRAME.top`; otherwise the old `AIM_Y` aim. Every check (inFrame, trees, rock, blend) runs on the view actually used.
- A new sheet height (the sheet grows when specials appear, or the phone turns) re-chooses like an aspect change does.

Tests: with `frameBottom` −0.4 on open ground at a portrait aspect (390/844), the chosen view's lowest frame point projects within [−0.4, −0.3]; with no `sheetTop` every existing test is unchanged; the Gorge in-rock test and fightcamworld counts stay green.
