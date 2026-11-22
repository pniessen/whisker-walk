# Rooftops step 5, discoveries and skills: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Rooftops gets its six things to discover (each a journal page the first time, nothing pointing at them), the two skills its moves were built for (Tightrope Tail after 20 crossings, Long Leap after 15 leaps), three golden mice, bird sounds, and a small dusk polish: the spec's "Build order" item 4, less two-player height (on main since step 4).

**Architecture:** Start-up code learns only data: two skills rows, two feat names, six journal ids with their words, one award type, three gold-mouse rows, one nap spot, one `audio.isMuted()` and two one-line hooks in `walk.js` and `main.js`. Everything that behaves is in the Rooftops chunk: a pure trigger table (`src/world/roofsfinds.js`), the moments that play when one is found (`src/world/roofsmoments.js`), the following pigeon (`roofsflock.js` / `roofsbirds.js`), the smoke ring (`roofsair.js`), the bird sounds (`src/world/roofssound.js`) and the lights' evening (`src/roofslife.js`). The area life already runs every frame after `player.update`; it is handed the walk's `log`, `progression` and `hud` once and the `session` each frame.

**Tech Stack:** Plain ES modules, Three.js 0.185, Vite 8, Vitest 4 (jsdom per file where a test needs a document), Web Audio (synthesised, no samples), headless Chrome via `scripts/record-page.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-19-rooftops-design.md`: "Things to discover", "Learning", "Light", "The birds", "Claude's calls", "Constraints", "Anti-goals". Earlier plans whose rulings still hold: step 1 (`2026-11-19-rooftops-step1-moves.md`: the abilities seam, the `cross` and `land` events), step 2 (`2026-11-19-rooftops-step2-place.md`: `anchors.discoveries`, the flood), step 3 (`2026-11-20-rooftops-step3-life.md`: S3 smoke, S9 no sound yet, S11 the flock draws on nothing), step 4 (`2026-11-21-rooftops-step4-into-game.md`: T2 lists this step's work).

## What is already there (recon 2026-11-21, read-only)

- **The moves' learning seam is wired** (step 1). `moveAbilities(state)` (`src/traversal.js`) reads `hasSkill(state, 'tightrope-tail' | 'long-leap')`. `steady` gives `TIGHTROPE_SPEED` 1.7 m/s and `WOBBLE.steady` 0.4. `longLeap` opens the three `requires: LONG_LEAP_ID` gaps (`long-lantern`, `long-dormer`, `long-terrace`, 3.6–4.5 m). Without the skill she stops and looks. Both stay false because `hasSkill` fails closed on ids the catalog lacks. **Missing:** the two catalog rows and any count.
- **The tally events exist** but nothing counts them. `createTraversalLive` emits `{ type: 'cross', id }` when she steps off the far end of a crossing, and `{ type: 'land', kind, id }` when a hop lands. `walk.js` hands them to `traversalEventEffects(e, { audio, fx, cat, bus })`, which plays sounds only.
- **Feats:** `progression.recordFeat(type)` accepts AWARDS keys plus `EXTRA_FEAT_TYPES = ['perch', 'race']`. The skill check runs mid-walk on the bus's `discovery` event (`celebrateNewSkills`, `walk.js`).
- **Journal pages** are `JOURNAL_TYPES` (`progression.js`) plus `CRITTER_INFO` rows (`journal.js`). Their words come from a start-up words file through `phrase()`. The Fairground's finds (`src/game/fairplay.js` `noteFairFind`) are the pattern: AWARDS paid the first time ever, `recordSighting(page)` on each walk it is found, once-a-walk keys in the discovery log, so a resumed walk pays nothing twice.
- **The anchors:** `ROOFS_DISCOVERIES` (`roofsplan.js`) gives garden (16.6, 9.4, FLAT), loft (−33, −45.5, TANK), vane (26, −16.5, TOP), skylight (3.4, 5.0, FLAT), telescope (35, 8.85, SHOP) and chimney (−10, 7.5, RIDGE). `test/roofs.test.js` already proves each one is reached without Long Leap. The props are drawn: the garden with its string lights (`M.bulbs`), the skylight's lit pane (a warm window cell, no attic behind it), the telescope and its crate perch, the loft, the vane, and the warm stack's cowled pot (it smokes: `SMOKE_POTS[0]`).
- **Gold mice:** `GOLD_MICE` (`src/goldmice.js`) has no `roofs` row, and `GOLD_TOTAL` is 36. `createGoldMice` and `checkFind` already handle raised ground.
- **Audio** (`src/audio.js`, start-up) has no bird call for the Rooftops; its `roofs` ambience is a low wind with no birdsong. `getContext()` and `getMaster()` are public, so chunk code can make sounds on the shared bus. The `muted` flag is private.
- **Light:** the evening deepens (sky, fog, sun, fill, sky glow, take-off glows: `roofslife.js`). The windows (`M.windows`, emissive 1.1), clock faces (`M.clock`, 1.9) and garden bulbs (`M.bulbs`, 1.5) hold one brightness all walk. They are made per build. The stars and moon come with the dusk sky (`render/nightsky.js`).
- **Start-up is 688.6 kB gzipped** (ceiling 700 kB; `npm run build`, 2026-11-21). The `roofs` chunk is 47.1 kB (ceiling 100 kB).

## Rulings (each: the decision, why, and the cost if wrong)

- **R1. Start-up gets data only, at most 2 kB in all.**
  - Start-up gets: the two skills rows, `'cross'` and `'leap'` in `EXTRA_FEAT_TYPES`, six `JOURNAL_TYPES` ids, six `CRITTER_INFO` rows, one new start-up file `src/roofspages.js` (ids and page words), 18 phrase lines, `AWARDS.roofsfind`, one `hud.js` type, three `GOLD_MICE` rows, one nap row in `propsets.js`, `audio.isMuted()`, a `tally` hook in `traversalEventEffects`, three names added to the life's context in `walk.js`, and one argument in `main.js`.
  - Estimate: about 1.5 kB gzipped. Tasks 3 and 9 measure it.
  - Why: about 11 kB is left under the ceiling, and other branches need it too.
  - Cost if wrong: if a task goes over, its words are the first thing to trim. Task 3 has the gate.
- **R2. The discoveries are journal pages, as the Fairground's finds are.**
  - Ids: `roofgarden`, `roofloft`, `roofvane`, `roofskylight`, `rooftelescope`, `roofchimney`, appended after the Fairground's.
  - The first find ever pays `AWARDS.roofsfind` = 12 (the same as `fairfind`) and shows its line. Every walk it is found on counts one on its page, once a walk, by key `roofs-find-<id>` in the discovery log.
  - A later walk says nothing; its moment (the moon, the ring, the view) is the repeat pleasure.
  - Why: the game already has this shape, and the journal is where a child looks.
  - Cost if wrong: an "again" line per find costs about 0.4 kB of start-up (owner question 2).
- **R3. How each is found.** Automatic. No prompt, no button. `y` is her paws' world height (`catPos.y`), within `dy` of the anchor's.

  | id | trigger | values |
  |---|---|---|
  | garden | on the roof terrace, near the bench | r 2.6 m, dy 0.4 |
  | loft | on the loft's roof | r 3.2, dy 0.4 |
  | vane | on the tower top | r 1.1, dy 0.4 |
  | skylight | standing at the attic window | r 1.0, dy 0.3 |
  | telescope | perched on the telescope crate (`session.perched` is that perch) | perch match within 0.05 m |
  | chimney | still by the warm stack | r 1.0, dy 0.4, still ≥ 1.5 s |

  - "Still" means her spot moved less than 0.05 m that frame; a nap is still.
  - Why: each discovery is a place she gets to, and the trigger is being there the way the spec says (stands, sits, looks). The radii come from each roof's size.
  - Cost if wrong: one number to tune per row.
- **R4. The words:** short, for a 9-year-old, the same in both word sets (no series words, and "someone", never a person word). Phrase ids `roofs.page.<id>.name`, `roofs.page.<id>.hint`, `roofs.find.<id>`:

  | id | page name | page hint (shown before it is found) | first-find line |
  |---|---|---|---|
  | garden | Rooftop Garden | High up, someone grows tomatoes. | A garden on the roof! Tomatoes and twinkly lights. 🍅 |
  | loft | Pigeon Loft | Where do the pigeons go home at night? | The pigeon loft! Coo, coo. One pigeon wants to come with you. 🕊️ |
  | vane | Top of the Clock Tower | Climb as high as a cat can go. | The very top! You can see the whole town. 🌇 |
  | skylight | The Attic Window | One roof has a warm, glowing window in it. | A peek in the attic window. Someone is reading a bedtime story. 📖 |
  | telescope | The Telescope | Someone looks at the sky from a roof. | You look through the telescope. Hello, moon! 🌕 |
  | chimney | Warm Chimney | Find a warm spot up high and sit a while. | A warm chimney! Puff, a smoke ring. What a cosy spot. 💨 |

  - Page emoji: 🍅 🕊️ 🧭 📖 🌕 💨.
  - The hint is the journal's own riddle on an unfound page, as every page has. Nothing in the world points at them (owner question 1).
- **R5. The following pigeon (B).**
  - On the first loft find of each walk, the perched pigeon on a loft perch nearest her (never the guide on its route) follows her.
  - Settled, if she is more than `FOLLOW.far` 7 m away, it takes the link from its perch that lands nearest `FOLLOW.sit` 4.5 m from her, never nearer than `FOLLOW.near` 3.5 m, and only if that is at least 1 m nearer her than it is now.
  - It coos when it lands (Task 7). It still flushes as any bird does, and keeps following after it lands.
  - It stops after `FOLLOW.time` 75 walk seconds, `FOLLOW.flights` 14 flights, or once she is more than `FOLLOW.lost` 30 m away. Then it is an ordinary pigeon, and S8 brings it home.
  - Per device, `hash01` tie-breaks.
  - Why: the anti-goal "nothing that chases the cat". It keeps its distance, lands beside her route, and gives up on its own.
  - Cost if wrong: the numbers (owner question 5).
- **R6. The smoke ring (F) and the nap.**
  - Once she has been still `SIT` 1.5 s by the warm stack, its pot puffs one ring, then one every `RING.every` 7 s while she stays still or naps. Moving stops it.
  - The ring: one torus, `TorusGeometry(0.16, 0.045, 5, 14)` (140 triangles), lying flat. `MeshBasicMaterial` 0xd8d4cc, transparent, `depthWrite: false`, casting nothing. It rises `RING.rise` 1.4 m over `RING.time` 3.2 s, grows to `RING.grow` 2.4×, fades from 0.75 to 0, and drifts 0.5 m downwind (`downwind()`). Under reduced motion it takes twice as long. Hidden between puffs.
  - A nap rest `roofs-nap-2` (kind `nap`, `mesh: false`; the warm bricks are the bed) on the stack at the anchor makes it "a cosy place to nap" through the game's own nap. Its prompt is the generic nap prompt, so it points at nothing.
  - Cost if wrong: one row and one mesh.
- **R7. The telescope's moon (E): a picture over the screen, not a camera move.**
  - A fixed, full-screen `div` made by chunk code: an eyepiece vignette (clear centre, edge `rgba(12,18,44,0.88)`, never black) round a pale moon disc 70vmin across with five soft craters (CSS radial gradients). `pointer-events: none`, `z-index: 1`, so the HUD and its toasts (2 and up, `src/style.css`) stay over it.
  - In over `MOON_VIEW.fadeIn` 0.8 s once she is on the crate. Held at most `MOON_VIEW.hold` 6 s, then out over `fadeOut` 0.8 s; out at once if she hops down. A slight 0.92 → 1 scale while it fades in, and none under reduced motion.
  - It shows every time she perches there; the page and the award come once (R2).
  - Why: a camera tilted up to a sky moon 270 m away needs a far view and is near the "dizzy camera" anti-goal. An overlay is gentle, cheap and certain to "fill the screen".
  - Cost if wrong: owner question 3.
- **R8. The view from the vane (C).**
  - When she has stood still `TOWER_VIEW.settle` 0.8 s on the tower top (not mid-hop: `session.traversal.busy` false), the camera eases round behind her. It sits `back` 2.4 m from her, away from the view, and `up` 1.5 m above her paws, looking at `look` (8, 4, 30): south over the terrace to the alley.
  - Blended as `fairlive.js` blends a ride's camera: weight `w` eases toward 1 at rate 1.6 per second. The camera is lerped from where `player.update` put it, and `lookAt` the blend of the two looks. When she moves, `w` eases back to 0.
  - The look is never more than `maxPitch` 18° down (step 2's own `tower` shot is 15.7°). No roll, no field-of-view change. None at all under reduced motion.
  - Why: the spec's goal "the view from the clock tower at dusk is the picture they want to show", and the anti-goal "no looking straight down a drop".
  - Cost if wrong: owner question 4.
- **R9. The attic (D): a painted pane, no person model.**
  - A `CanvasTexture` (128 × 160) painted once per walk by `paintAttic(ctx2d, w, h)`: warm lamplight, a grown-up's silhouette in an armchair holding a book, a child's silhouette tucked up in bed, the lamp's glow.
  - It sits on one `PlaneGeometry(SKYLIGHT.w − 0.08, SKYLIGHT.d − 0.08)` 0.035 m over the flat-house roof, `MeshBasicMaterial({ map, toneMapped: false })`. Always shown (it is what is under the glass). Two triangles, no caster. Headless (no `document`), there is no pane.
  - No camera move: she stands on the frame, and the follow camera looks down at the pane at its usual angle.
  - Why: "a silhouette will do", and it costs one draw.
  - Cost if wrong: if the pictures show it unreadable at phone size, paint it bolder. Not a camera move.
- **R10. Bird sounds: synthesised in the chunk, per device, muted respected.**
  - `src/world/roofssound.js` makes its own short tones on `audio.getContext()` / `audio.getMaster()`, so volume is the master's.
  - It plays nothing, and never asks for the context, while `audio.isMuted?.() !== false`. That is the one start-up addition: an audio without `isMuted` (a stub) is silent.
  - The calls, each tone's gain before the master × `loudness(d, ear) = clamp(1 − d/ear, 0, 1)²`:
    - The loft coos: one call every 2–4 s heard within `EAR.loft` 16 m of the loft's centre, gain ≤ 0.04.
    - A perched pigeon within 8 m coos every 6–12 s, ≤ 0.03.
    - A sparrow within 10 m chirps, two notes 3200 → 3800 Hz, every 4–9 s, ≤ 0.02.
    - A gull within 30 m cries (the game's gull shape, 1400 → 900 Hz sawtooth) every 12–24 s, ≤ 0.014.
    - A bird within 8 m that takes off flaps: six soft beats 60 ms apart, ≤ 0.03.
  - The schedule is `hash01(bird, call count, salt)`: no `Math.random`.
  - Why: samples would add downloads and licences, and the Farm's animals are synthesised already. Kept in the chunk because start-up has no room.
  - Cost if wrong: loudness needs the owner's ears (owner question 6).
- **R11. How the skills count.**
  - Tightrope Tail reads `feats.cross`: every crossing walked from end to end (the `cross` event), on any walk, need 20.
  - Long Leap reads `feats.leap`: every leap landed (`land` with `kind: 'leap'`, Long Leaps included; climbs and drops are not leaps), need 15.
  - Lifetime, per save, written at once (`recordFeat` saves), so a resumed walk never counts one twice.
  - In a room each device counts only its own cat (only she has a traversal runtime). A partner's crossings count on the partner's save.
  - The check runs after each tally, so the card shows on the crossing or leap that earns it.
  - Practice is the point, so a child may cross the same plank twenty times. Unlike the perch tally, which was gated against a farming exploit, a crossing takes several seconds and earns no points.
  - Numbers are the spec's first guesses.
  - Cost if wrong: one number each.
- **R12. Skills text stays in `skills.js`**, as its twelve siblings' does: the file is zero-import by design (its header). The two names are the spec's and are not series words.
  - Tightrope Tail: effect `'You walk planks, ridges and washing lines quicker and steadier.'`, feat `'Walk 20 crossings from end to end'`.
  - Long Leap: effect `'You can leap the wider gaps between the roofs.'`, feat `'Leap 15 gaps'`.
  - Both go in the traversal family, after Sea Legs.
- **R13. The golden mice** (y is metres above the ground there). Two high, one hidden low, the game's usual shape, all reached without Long Leap:
  - `gm-roofs-1` (−26.6, −34.4, 0): on the water tank's lid, one climb from the warehouse roof, on the west side, clear of `long-lantern`'s take-off.
  - `gm-roofs-2` (27.4, −15.6, 0): on the clock tower's lantern stage, a corner below the vane.
  - `gm-roofs-3` (−14.3, 21.0, 0): hidden in a back yard, in the nook between `bunker-4` and the party wall west of it.
  - The builder may move each up to 1 m to pass Task 2's tests.
  - Why: each is a climb or a nook, none is on a crossing, and none is beside another find.
  - Cost if wrong: coordinates.
- **R14. The dusk polish list** (small; the place already has every light the spec names):
  - P1. The lights come on as the sky deepens: the windows', clock faces' and garden bulbs' `emissiveIntensity` go from `GLOW.sunset` 0.55 of their built value at sunset to all of it at dusk, by `eveningAt`.
  - P2. The garden's string lights breathe: × (1 + 0.06 sin(1.1 t)) at walk second t. Still under reduced motion.
  - P3. The attic window shows its scene (R9).
  - P4. Never darker: the alley picture at 240 s is at least as bright as before this step (Task 9 measures it). The sun and fill end exactly at `applyDusk`'s values (step 2's).
  - Not done: fading the stars in. `nightsky.js` (start-up) has no opacity uniform, and popping 420 stars on at once would look worse than now.

## Global Constraints

- Work only in `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/rooftops-5` (branch `rooftops-5`). Never write to the main checkout. Do not read `.env.local`. No database work. No merge, no push.
- **Start-up:** 688.6 kB gzipped before this step (ceiling 700 kB). Growth is at most about 2 kB in all, so after the step it is at most 690.6 kB. Everything that behaves goes in the Rooftops chunk: `src/world/roofs*.js`, `src/roofslife.js`, and files only they import (`src/world/areas.js` packs; `src/roofsflag.js`'s note). Where start-up must know something, add the smallest data or a generic hook (R1).
- The `roofs` chunk stays under 100 kB gzipped (47.1 kB now).
- **Text:** every player-facing line goes through the word tables (phrases in `src/clanphrases.js` LATER, under `// ---- Rooftops step 5 (2026-11-21) ----`), and reads the same in both word sets. No series words in string literals outside the word tables.
  - Snapshots: `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`, and `UPDATE_OFF_SNAPSHOT=1 npx vitest run test/offwords.test.js` for the later-phrases fixture.
  - Keep only the new lines; revert spurious `notReached` entries in `test/fixtures/series-words-on-source.json`.
- **Determinism:** no `Math.random`, `Date.now` or `performance.now` in new code. Use `hash01` (`world/warehouselook.js`) and walk seconds. `test/fixtures/flat-trace.gameplay.json` must not move.
- **Tests:** none that read source text (rule S1, `docs/SESSION-HANDOFF.md`). Whole-walk tests get 60–90 s timeouts. Floats use `toBeCloseTo` or closeDiffs (CI is Linux). Run only the test files named (skip a named file that does not exist); the controller runs the full suite once.
- **Budgets:** the Rooftops stays inside `test/budget.test.js`'s street ceilings (450 meshes, 380 casters, 70,000 triangles). The life adds at most 5 meshes, no casters and at most 1,800 triangles.
- **Offline-first:** nothing contacts the database. Discoveries, skills and gold mice are per save; the following pigeon and the sounds are per device.
- **Anti-goals:** nothing frightening at height, no dizzy camera (no roll, no field-of-view change, at most 18° down), no looking straight down a drop, never dark, no falling, nothing that chases the cat.
- **Real-game checks:** port 5408 with `--strictPort`, game muted (seed `muted: true`, `--mute-audio`, never press M), headless. Pictures go to `/private/tmp/claude-501/-Users-pniessen--claude-spares-spare-gcns3j/e37e3895-a9b0-4a89-9360-a15387ffb2e4/scratchpad/rooftops-step5/`.
- **Shared files** (`src/game/walk.js`, `src/main.js`, `src/worldmap.js`, `src/progression.js`, `src/critters.js`, `src/audio.js`, `src/skills.js`): make the smallest edits. Other branches (people, market, house) change them too.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A walk picked up again after a find.** The log's restored keys mean no second award, no second line and no second page count that walk (Task 4, `a resumed walk pays and counts nothing twice`).
2. **Muted, or muted mid-walk.** No bird sound, and the AudioContext is never asked for while muted (Task 7, `muted: no sound, and no AudioContext asked for` and `muted mid-walk: silent from the next frame`).
3. **Reduced motion.** No tower-view camera, the ring at half speed, the moon only fades (Task 5, under each moment's test).
4. **An old save.** No roof pages, no `cross` or `leap` feats: it loads with six silhouettes at 0, both skills locked at 0/20 and 0/15, and the gold count at x/39 (Tasks 1–3, `an old save ...` in each).
5. **The pigeon at her heels.** The follower never lands within 3.5 m of her and gives up on its own; a child who stands still is never crowded (Task 6, `never nearer than 3.5 m, and it gives up`).

---

### Task 1: Tightrope Tail and Long Leap, and their counts

**Files:**
- Modify: `src/skills.js` (two rows after `sea-legs`, header counts), `src/progression.js` (`EXTRA_FEAT_TYPES`), `src/traversallive.js` (`traversalEventEffects`, `traversalTally`), `src/game/walk.js` (the traversal's `onEvent`, one argument)
- Test: `test/skills.test.js`, `test/traversal.test.js`, `test/traversallive.test.js`, `test/roofs.test.js`

**Interfaces:**
- Produces:
  - `SKILLS` rows `{ id: 'tightrope-tail', family: 'traversal', name: 'Tightrope Tail', effect, feat, progress: (s) => ({ have: featTally(s, 'cross'), need: 20 }) }` and `{ id: 'long-leap', ..., name: 'Long Leap', progress: featTally(s, 'leap'), need 15 }`, with R12's words.
  - `SKILL_IDS` is `['spring-paws', 'long-zoomies', 'fence-runner', 'sea-legs', 'tightrope-tail', 'long-leap', 'twitchy-nose', ...]`.
  - `EXTRA_FEAT_TYPES = ['perch', 'race', 'cross', 'leap']`.
  - `traversalEventEffects(e, { audio, fx, cat, bus, tally })`: `cross` calls `tally?.('cross')`; `land` with `kind === 'leap'` calls `tally?.('leap')` after its existing effects.
  - `traversalTally(progression, celebrate) → (type) => void`: `progression.recordFeat(type)`, then `celebrate()`.
  - `walk.js` passes `tally: traversalTally(progression, celebrateNewSkills)`.

- [ ] **Step 1: Write the failing tests.**
  - `test/skills.test.js`:
    - Rename the catalog test to `has the fourteen shipped abilities across four families`: `SKILLS` length 14, `SKILL_IDS` as above, families unchanged.
    - `Tightrope Tail is earned by 20 crossings, Long Leap by 15 leaps`: `expectBoundary('tightrope-tail', featState('cross'))` and `expectBoundary('long-leap', featState('leap'))`. Both rows are `family: 'traversal'`. Neither moves when other feats are 999 (`{ feats: { perch: 999, mischief: 999 } }` earns neither).
    - Review Focus 4: `an old save has neither, at 0 of 20 and 0 of 15`: `skillProgress({}, 'tightrope-tail')` is `{ have: 0, need: 20 }`, and `{ feats: { cross: '9e99' } }` reads 0.
  - `test/traversal.test.js`:
    - Turn the "unknown ids fail closed" line: `moveAbilities({ skills: ['long-leap', 'tightrope-tail'] })` is `{ steady: true, longLeap: true, climb: BASE_ABILITIES.climb }`.
    - Add `moveAbilities({ feats: { cross: 20 } }).steady === true` and `moveAbilities({ feats: { leap: 14 } }).longLeap === false`.
  - `test/traversallive.test.js`, in `traversalEventEffects`: with `tally` a spy, `cross` gives `['cross']` and `land`/`leap` gives `['leap']`. `land` with `drop` or `climb`, `mount`, `look`, and a `leap` spring give nothing. With no `tally` the existing assertions stand.
  - `test/traversallive.test.js`, `traversalTally records the feat and then checks the skills`: a real `createProgression` on memory storage. 20 × `cross` gives `feats.cross` 20 and `celebrate` called 20 times; `hasSkill(state, 'tightrope-tail')` is false after 19 and true after 20.
  - `test/roofs.test.js`, `fifteen leaps open the lantern roof; fourteen do not`: `floodTraversal(area, { abilities: moveAbilities({ feats: { leap: 15 } }) })` reaches the `lantern` place from the spawn, and with `leap: 14` it does not.
- [ ] **Step 2: Run** `npx vitest run test/skills.test.js test/traversal.test.js test/traversallive.test.js test/roofs.test.js`. Expected: FAIL on the new assertions only.
- [ ] **Step 3: Implement** the rows (each with a short note naming the counter, as its siblings have), the two feat names (and the comment above `EXTRA_FEAT_TYPES`), `tally` and `traversalTally`, and the one `walk.js` argument. Update the "twelve" comments in `skills.js`'s header.
- [ ] **Step 4: Run** the Step 2 command plus `npx vitest run test/progression.test.js test/traversalwiring.test.js test/hometabs.test.js test/dressingroom.test.js` (skip any that does not exist). Expected: PASS.
- [ ] **Step 5: Snapshots.** Refresh (Global Constraints). Only Skills-tab lines naming the two new abilities, and any `/12` turned `/14`, may be added. Then `npx vitest run test/serieswords test/offwords.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** with the message "Rooftops step 5: Tightrope Tail (20 crossings) and Long Leap (15 leaps) in the skills catalog, counted as she moves".

### Task 2: Three golden mice on the Rooftops

**Files:**
- Modify: `src/goldmice.js` (`GOLD_MICE.roofs`, the header count), `src/world/roofsplan.js` (`ROOFS_REGISTRATION.goldMice`)
- Test: `test/roofs.test.js`, `test/goldedition.test.js`, `test/docks.test.js`, `test/farm.test.js`, `test/fair.test.js` (their 36 pins)

**Interfaces:**
- Produces: `GOLD_MICE.roofs` with R13's three rows; `ROOFS_REGISTRATION.goldMice`, the same rows frozen; `GOLD_TOTAL` 39.

- [ ] **Step 1: Write the failing tests** in `test/roofs.test.js` (in the registration block, using its `reachedAt`, `oneLevel` and `clear` helpers):
  - `three golden mice, each on one level, clear, reached without Long Leap`:
    - The ids are `['gm-roofs-1', 'gm-roofs-2', 'gm-roofs-3']`.
    - For each: `oneLevel(m.x, m.z)`, `clear(m)`, and `reachedAt(m.x, m.z)`.
    - A reached cell within 0.9 m of it has its ground within 0.1 m of the mouse's, so `checkFind` can find it.
    - It is at least 1.5 m from every crossing end, hop end, collectible and discovery anchor.
    - Levels: `area.ground.y` is `LEVELS.TANK`, `LEVELS.LANTERN` and `LEVELS.GROUND`.
  - `the gold rows are the registration's`: `GOLD_MICE.roofs` deep-equals `plain(ROOFS_REGISTRATION.goldMice)`.
  - Counts: `GOLD_TOTAL` 39, `goldForEdition('canon', CATALOG).size` 39, `goldForEdition('legacy', CATALOG).size` 21 (the Rooftops is in Legacy: step 4's T5). Turn the 36 / 18 pins in `goldedition`, `docks`, `farm` and `fair` to 39 / 21, each comment saying "36 until the Rooftops added its three".
- [ ] **Step 2: Run** `npx vitest run test/roofs.test.js test/goldedition.test.js test/docks.test.js test/farm.test.js test/fair.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the rows, one comment line each saying where it is and how she gets there (R13), and the header's "thirty-nine: three in each of twelve areas, and the island's three".
- [ ] **Step 4: Run** the Step 2 command plus `npx vitest run test/climbing.test.js test/journal.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Rooftops step 5: three golden mice on the Rooftops (the tank, the lantern stage, a back-yard nook), none behind Long Leap".

### Task 3: Six journal pages, their words and their award

**Files:**
- Create: `src/roofspages.js` (start-up: imported by `journal.js`), `src/world/roofsfinds.js` (chunk: the find lines and `noteRoofsFind`; Task 4 adds the triggers)
- Modify: `src/progression.js` (`JOURNAL_TYPES`), `src/journal.js` (`CRITTER_INFO`), `src/clanphrases.js` (LATER), `src/discoveries.js` (`AWARDS.roofsfind`), `src/ui/hud.js` (`discoveryText`'s label-only types)
- Test: `test/roofsfinds.test.js` (create), `test/docks.test.js` (44 → 50), `test/fairsim.test.js` and `test/fairgames.test.js` (their `slice(-14, -9)` / `slice(-9)`, made position-free with `indexOf`)

**Interfaces:**
- Produces, in `src/roofspages.js`:
  - `ROOFS_FIND_IDS = ['garden', 'loft', 'vane', 'skylight', 'telescope', 'chimney']`
  - `roofsPageId(id) → 'roof' + id`
  - `ROOFS_JOURNAL_TYPES` (the six page ids)
  - `ROOFS_PAGE_WORDS[pageId] = { name: () => phrase('roofs.page.<id>.name'), hint: () => phrase(...) }`, each id spelled out in full.
- Produces, in `src/world/roofsfinds.js`:
  - `ROOFS_FIND_WORDS[id] = () => phrase('roofs.find.<id>')`
  - `roofsFindKey(id) → 'roofs-find-' + id`
  - `noteRoofsFind(id, { log, progression }) → { fresh, first, points }`, with `noteFairFind`'s rules and no "again" line (R2).
- Produces: `AWARDS.roofsfind = 12`; `discoveryText({ type: 'roofsfind', label })` returns `label`.

- [ ] **Step 1: Write the failing tests** in `test/roofsfinds.test.js`:
  - `six pages after the Fairground's, each with its name and hint`:
    - `ROOFS_JOURNAL_TYPES` equals `['roofgarden', 'roofloft', 'roofvane', 'roofskylight', 'rooftelescope', 'roofchimney']`, and `JOURNAL_TYPES.slice(-6)` equals it.
    - Each has a `CRITTER_INFO` row whose `name` and `hint` are R4's.
    - `renderJournalHtml({}, 0, 39)` contains each hint and none of the names.
  - `the first find ever pays 12 and says its line once; a later walk counts the page and says nothing`, using a real `createProgression` on memory storage, `createDiscoveryLog` and a `bus` spy:
    - The first call is `{ fresh: true, first: true, points: 12 }`, `journal.roofloft` is 1, and the `discovery` event's label is R4's loft line.
    - A second call that walk is `{ fresh: false, ... }` and changes nothing.
    - `log.startWalk()`, then a call: `{ fresh: true, first: false, points: 0 }`, the page is 2, and no `discovery` event.
  - Review Focus 4, `an old save without the pages loads with each at 0`: a raw save with no `roof*` keys, and `journal.roofvane: '<script>'`, sanitizes every page to 0.
  - `AWARDS.roofsfind` equals `AWARDS.fairfind`, and `discoveryText({ type: 'roofsfind', label: 'X' })` is `'X'`.
  - Turn `test/docks.test.js`'s `JOURNAL_TYPES` and `CRITTER_INFO` lengths to 50 (the comment adds "and the Rooftops' six finds"). Make the Fairground's two `slice` checks find their block by `JOURNAL_TYPES.indexOf('ridemgr')` and `indexOf('gamecans')`, so later pages never move them again.
- [ ] **Step 2: Run** `npx vitest run test/roofsfinds.test.js test/docks.test.js test/fairsim.test.js test/fairgames.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the start-up data, the 18 phrase lines (R4) and the chunk's `noteRoofsFind`. `journal.js` maps `ROOFS_FIND_IDS` with R4's emoji into rows, as it does the Fairground's.
- [ ] **Step 4: Run** the Step 2 command plus `npx vitest run test/journal.test.js test/clanphrases.test.js test/discoveries.test.js test/hud.test.js test/farmjobs.test.js`. Expected: PASS.
- [ ] **Step 5: Snapshots** (Global Constraints): only `roofs.page.*` and `roofs.find.*` lines added. Then `npx vitest run test/serieswords test/offwords.test.js test/wordset.test.js`. Expected: PASS.
- [ ] **Step 6: The gate.** Run `npm run build`. Expected: `start-up` at most 690.0 kB after Tasks 1–3. Over that, shorten the hints first. Note the number in the commit body.
- [ ] **Step 7: Commit** with the message "Rooftops step 5: six journal pages for the Rooftops' discoveries, their words in both sets, 12 🐾 the first time each is found".

### Task 4: Where the six are found

**Files:**
- Modify: `src/world/roofsfinds.js` (`FIND_RULES`, `findAt`), `src/roofslife.js` (the context's `log`, `progression`, `hud`; `update`'s fifth argument), `src/game/walk.js` (the life's context: `log, progression, hud`), `src/main.js` (`session.areaLife.update(dt, t, session.cat.position, camera, session)`)
- Create: `src/world/roofsmoments.js`
- Test: `test/roofsfinds.test.js`, `test/roofsmoments.test.js` (create), `test/roofslifectx.test.js`

**Interfaces:**
- Consumes: `noteRoofsFind`, `ROOFS_FIND_IDS` (Task 3).
- Produces:
  - `FIND_RULES` (R3's table, frozen).
  - `findAt(anchors, spot) → id | null`. `spot = { x, y, z, perched, still }`, where `perched` is `session.perched` (or null) and `still` is in seconds. The first rule that matches wins, in `ROOFS_FIND_IDS` order.
  - `createRoofsMoments(area, { log, progression, hud, birds, scene, reducedMotion, doc }) → { update(dt, catPos, camera, session), dispose() }`. It tracks `still`, calls `findAt`, and on a match not yet seen this walk calls `noteRoofsFind`, then `start(id)`. `start` is empty in this task; Tasks 5–6 fill it.
  - Without `log` or `progression` (the picture pages) nothing is noted; the moments still play.
  - The life's `update(dt, t, catPos, camera, session)` passes `session` on. Older callers, which pass four arguments, still work.

- [ ] **Step 1: Write the failing tests.**
  - `test/roofsfinds.test.js`:
    - `each discovery is found at its own spot and on its own level, and only there`: at each anchor (for the telescope, `perched` the crate perch from `ROOFS_PERCHES`; for the chimney, `still: 2`) gives its id. The same spot 1 m lower gives null. 4 m away gives null.
    - `the telescope is found from its crate, not beside it`: at the anchor, not perched, gives null. Perched on the garden bench gives null.
    - `the warm chimney wants her still for 1.5 s`: `still` 1.4 gives null; 1.5 gives `'chimney'`.
    - `the vane only on the tower top`: on the lantern stage, 1.2 m from the vane's foot at `LEVELS.LANTERN`, gives null.
  - `test/roofsmoments.test.js`, with a stand-in `session` (`{ perched: null, rest: null, traversal: { busy: false } }`):
    - `walking onto the loft writes its page once a walk`: frames with her on the loft give one `noteRoofsFind`. Off and back on that walk gives nothing more.
    - Review Focus 1, `a resumed walk pays and counts nothing twice`: `log.restore([['roofs-find-loft', 1]])` after `startWalk()`, then on the loft: no points and the page unchanged.
    - `two players in a room each find it on their own save`: two progressions, two logs, each paid once.
    - `no log, no progression: nothing is noted and nothing throws`.
  - `test/roofslifectx.test.js`, `the walk hands the life its log, progression and hud`, in the file's existing harness style.
- [ ] **Step 2: Run** `npx vitest run test/roofsfinds.test.js test/roofsmoments.test.js test/roofslifectx.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `findAt`, `createRoofsMoments` (made by the life, updated after the birds, disposed with it), and the two one-line hooks in `walk.js` and `main.js`.
- [ ] **Step 4: Run** the Step 2 command plus `npx vitest run test/roofslife.test.js test/roofswalk.test.js test/roofscowalk.test.js test/traversalwiring.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Rooftops step 5: the six discoveries found where she stands, sits or perches; the area life gets the walk's log and her session".

### Task 5: What each moment looks like (the view, the attic, the moon, the ring and the nap)

**Files:**
- Modify: `src/world/roofsmoments.js` (`TOWER_VIEW`, `towerView`, `MOON_VIEW`, `moonOpacity`, `createMoonOverlay`, `paintAttic`, `createAtticPane`), `src/world/roofsair.js` (`RING`, `ringAt`, `createSmokeRing`), `src/world/roofsplan.js` (the nap row in `ROOFS_REGISTRATION.propSet.rests`), `src/propsets.js` (its copy, start-up)
- Test: `test/roofsmoments.test.js`, `test/roofsair.test.js`, `test/roofslife.test.js` (the life's budget), `test/roofs.test.js` (the nap row)

**Interfaces:**
- Produces:
  - `TOWER_VIEW = { settle: 0.8, rate: 1.6, back: 2.4, up: 1.5, look: { x: 8, y: 4, z: 30 }, maxPitch: 18 * Math.PI / 180 }`.
  - `towerView(cat, outPos, outLook)`: pure.
  - `MOON_VIEW = { fadeIn: 0.8, hold: 6, fadeOut: 0.8 }`.
  - `moonOpacity(onFor, offFor) → 0..1`: `offFor` null while she is still on the crate.
  - `createMoonOverlay(doc) → { show(), hide(), update(dt), el, dispose() } | null` (null with no `doc`).
  - `paintAttic(ctx2d, w, h)`.
  - `createAtticPane(scene, area, doc) → THREE.Mesh | null`.
  - `RING = { time: 3.2, rise: 1.4, grow: 2.4, opacity: 0.75, drift: 0.5, every: 7 }`.
  - `ringAt(u) → { y, scale, opacity, drift }` for u in 0..1: eased out, monotone.
  - `createSmokeRing(scene, pot, { reducedMotion }) → { puff(), update(dt), mesh, dispose() }`.
  - Rest row `{ id: 'roofs-nap-2', kind: 'nap', x: ROOFS_DISCOVERIES.chimney.x, z: ROOFS_DISCOVERIES.chimney.z, mesh: false }`.
  - The moments' `start(id)`: `telescope` shows the moon, `chimney` starts the ring's clock, `vane` lets the view ease in. `garden`, `loft` and `skylight` have no extra look; the lights and the pane are always there, and the loft's pigeon is Task 6.
  - The moon and the ring also play on later finds and later walks: they follow where she is, not the page.

- [ ] **Step 1: Write the failing tests.**
  - `test/roofsair.test.js`:
    - `the ring rises, grows and fades over 3.2 s`: `ringAt(0)` is `{ y: 0, scale: 1, opacity: 0.75, drift: 0 }`; `ringAt(1)` is `{ y: 1.4, scale: 2.4, opacity: 0, drift: 0.5 }`; y, scale and drift never go down and opacity never goes up.
    - `one mesh, at most 160 triangles, casting nothing, hidden between puffs`.
    - Review Focus 3, `half speed under reduced motion`: still visible at 3.2 s, gone by 6.4 s.
  - `test/roofsmoments.test.js`:
    - `still by the warm chimney it puffs a ring, then one every 7 s; moving stops it`: count `puff()` over 20 s still, which is 3 (at 1.5, 8.5 and 15.5 s), then none in 10 s of moving.
    - `the tower view, at most 18 degrees down, behind her and above her paws`, from `towerView` at the vane's anchor:
      - the pitch from `outPos` to `outLook` is at most `maxPitch`;
      - `outPos.y - cat.y` is 1.5;
      - `outPos` is 2.4 m from her, on the far side from `look`.
    - `the tower view eases in once she is still, and out when she moves`: on the tower top with a camera, `w` is 0 until 0.8 s still, at most 0.65 by 1.4 s, and over 0.95 by 4 s. Moving takes it back under 0.05 within 3 s. It stays 0 mid-hop (`traversal.busy`) and, Review Focus 3, under reduced motion.
    - `the moon: in over 0.8 s on the crate, held at most 6 s, out over 0.8 s, out at once when she hops down`, from `moonOpacity`:
      - `moonOpacity(0.4, null)` ≈ 0.5, `(1, null)` is 1, `(6.4, null)` ≈ 0.5, `(7, null)` is 0;
      - `moonOpacity(2, 0.4)` ≈ 0.5.
    - `the moon picture is on top of the game, under the HUD, and never catches a tap` (`// @vitest-environment jsdom` in its own `describe` file, `test/roofsmoon.test.js`):
      - the element is fixed and full screen, with `pointer-events: none` and `z-index: 1`;
      - `dispose()` removes it;
      - `createMoonOverlay(undefined)` is null and the moments run without it.
    - `the attic pane sits on the skylight's glass`: two triangles, no caster, its centre at `SKYLIGHT`'s x and z, y `LEVELS.FLAT + 0.035`; null headless.
  - `test/roofslife.test.js`: turn the life's budget test into `the life adds at most five meshes, no casters, under 1,800 triangles`.
  - `test/roofs.test.js`: the nap row is in `SETS.roofs.rests`. Then the existing `each prop sits on its own level, clear of colliders, reached without Long Leap` covers it.
- [ ] **Step 2: Run** `npx vitest run test/roofsair.test.js test/roofsmoments.test.js test/roofsmoon.test.js test/roofslife.test.js test/roofs.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The view blends as `fairlive.js` does (lerp from where `player.update` left the camera, then `lookAt` the blended look).
  - The moon is CSS only: no image, no text in it (the toast says the line).
  - The pane's canvas is painted once per walk and disposed with the life.
  - The ring's pot is `area.potTops[SMOKE_POTS[0]]`.
- [ ] **Step 4: Run** the Step 2 command plus `npx vitest run test/propsets.test.js test/rests.test.js test/budget.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Rooftops step 5: the view from the vane, the attic's bedtime story, the moon through the telescope, the warm chimney's smoke ring and a nap spot by it".

### Task 6: The pigeon that follows her from the loft

**Files:**
- Modify: `src/world/roofsflock.js` (`FOLLOW`, `chooseFollow`), `src/world/roofsbirds.js` (`follow`, `following`, the follower in `update`), `src/world/roofsmoments.js` (`start('loft')` calls `birds.follow(catPos)`)
- Test: `test/roofsflock.test.js`, `test/roofsbirds.test.js`

**Interfaces:**
- Produces:
  - `FOLLOW = { time: 75, flights: 14, near: 3.5, sit: 4.5, far: 7, lost: 30 }`.
  - `chooseFollow(graph, index, bird, cat, taken) → { to, kind, shape } | null`: over the links from `bird.at`, by `chooseFlight`'s own `usable`, `landable`, `isTaken` and `keepsOff`. It scores `−|dist(to, cat) − FOLLOW.sit|` plus `chooseFlight`'s `hash01` tie, and keeps only landings at least `near` from her and at least 1 m nearer her than the bird is now.
  - `birds.follow(catPos) → birdId | null`: the perched pigeon on a `loft` perch nearest her, never the guide while `guideStep >= 0`; null if none.
  - `birds.following` (id or null).

- [ ] **Step 1: Write the failing tests.**
  - `test/roofsflock.test.js`:
    - `a follower's flight lands near her, never nearer than 3.5 m, and only if it gains on her`: from a loft perch, with her 12 m south on the warehouse roof, the chosen landing is at least 3.5 m from her and nearer her than the loft. With her 5 m away it is null.
    - `with nowhere nearer it waits, and the same question gives the same answer` (called twice; a `Math.random` spy counts 0).
  - `test/roofsbirds.test.js` (the file's critters harness):
    - `after the loft one pigeon follows her across the warehouse roof, then is a pigeon again`: drive her from the loft south-east along the roof at 1.2 m/s for 90 s.
      - `following` is set at once.
      - At 30 s it is within 10 m of her.
      - At no frame is it perched within 3.5 m of her (Review Focus 5).
      - After 75 s `following` is null.
    - `never the guide, and nothing when no pigeon is on the loft`.
    - `walking up to it flushes it as any bird; landed, it follows on`.
- [ ] **Step 2: Run** `npx vitest run test/roofsflock.test.js test/roofsbirds.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** The follower reuses `takeOff` and `land`. It counts its own flights, and stops (`following` null) at `time`, `flights` or `lost`, whichever comes first.
- [ ] **Step 4: Run** the Step 2 command plus `npx vitest run test/roofsmoments.test.js test/roofslife.test.js test/critters.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Rooftops step 5: at the loft one pigeon comes along with her for a while, keeping its distance".

### Task 7: The birds' sounds

**Files:**
- Create: `src/world/roofssound.js`
- Modify: `src/audio.js` (`isMuted()`, one method, start-up), `src/roofslife.js` (makes the sound where the place has birds and the context has `audio`)
- Test: `test/roofssound.test.js` (create), `test/audio.test.js`

**Interfaces:**
- Consumes: `birds.birds` (`{ kind, flying, pos }`), `birds.following` (Task 6), `ROOFS_DISCOVERIES.loft`.
- Produces:
  - `audio.isMuted() → boolean`.
  - `EAR = { loft: 16, pigeon: 8, sparrow: 10, gull: 30, flap: 8 }`.
  - `loudness(d, ear)`.
  - `CALLS`: each call's tones and gain, per R10.
  - `createRoofsSound(audio, { birds, loft }) → { update(dt, catPos), dispose() }`. Tones are oscillator plus gain envelope into `audio.getMaster()`. A take-off is a bird whose `flying` turned true since the last frame.

- [ ] **Step 1: Write the failing tests** with a fake audio whose `getContext()` returns a counting fake context:
  - `test/audio.test.js`: `isMuted follows setMuted`.
  - `test/roofssound.test.js`:
    - Review Focus 2:
      - `muted: no sound, and no AudioContext asked for`: 60 s beside the loft with `isMuted()` true, and `getContext` never called.
      - `muted mid-walk: silent from the next frame`.
      - `an audio without isMuted plays nothing`.
    - `beside the loft she hears cooing, louder nearer; 20 m away, none`: count coo oscillators in 30 s at 2 m and at 20 m; the peak gain at 2 m is above that at 10 m.
    - `a bird taking off near her flaps; one far away does not`.
    - `every tone is quiet before the master`: every gain at most 0.05.
    - `the same walk makes the same calls, and nothing draws on Math.random`: two runs give identical call lists, and a `Math.random` spy counts 0.
- [ ] **Step 2: Run** `npx vitest run test/roofssound.test.js test/audio.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** No node is made until the first call is due. `dispose()` stops anything still sounding.
- [ ] **Step 4: Run** the Step 2 command plus `npx vitest run test/roofslife.test.js test/roofslifectx.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Rooftops step 5: cooing at the loft and from pigeons nearby, sparrows' chirps, far gulls and the clatter of wings; silent when the game is muted".

### Task 8: Dusk polish

**Files:**
- Modify: `src/world/roofs.js` (the record's `eveningLights: { windows: M.windows, clock: M.clock, bulbs: M.bulbs }`, each with `userData.glowBase` set to its built `emissiveIntensity`), `src/roofslife.js` (`GLOW`, the lights in `apply()`)
- Test: `test/roofslife.test.js`, `test/roofs.test.js`

**Interfaces:**
- Produces: `GLOW = { sunset: 0.55, breathe: 0.06, rate: 1.1 }`. Every frame: `emissiveIntensity = glowBase × (GLOW.sunset + (1 − GLOW.sunset) × eveningAt(walk))`, and for the bulbs only, × `(1 + GLOW.breathe × sin(GLOW.rate × walk))` unless reduced motion. Set in place; nothing allocated.

- [ ] **Step 1: Write the failing tests** in `test/roofslife.test.js` (a stand-in area with three materials):
  - `the lights come up as the evening deepens`:
    - windows ≈ 0.605 at t 0 and 1.1 at 240 s;
    - clock ≈ 1.045 at t 0 and 1.9 at 240 s;
    - between those, never down for the windows and the clock;
    - the same at 600 s as at 240 s.
  - `the garden lights breathe 6% at dusk, and hold still under reduced motion`.
  - `never darker than the game's own dusk`: at 240 s and 600 s `sun.intensity` and `fill.intensity` equal their ends (from `applyDusk`). Skip it if step 2's test already says this.
  - Extend `update allocates nothing between sky steps` to the lights.
  - `test/roofs.test.js`: `the record's evening lights are its own materials, at their built brightness`.
- [ ] **Step 2: Run** `npx vitest run test/roofslife.test.js test/roofs.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** P1 and P2 (R14). P3 is Task 5's pane; P4 is measured in Task 9.
- [ ] **Step 4: Run** the Step 2 command plus `npx vitest run test/budget.test.js test/roofsload.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Rooftops step 5: the windows, the clock faces and the garden's string lights come up as the evening deepens; the string lights breathe".

### Task 9: Pictures, sizes and checks

**Files:**
- Modify: `verify-places.html` (`__shot` takes the moment names), `src/world/roofsplan.js` (`ROOFS_MOMENT_SHOTS`), `test/roofs.test.js`

**Interfaces:**
- Produces:
  - `ROOFS_MOMENT_SHOTS`: `{ garden, loft, vane, skylight, telescope, chimney, mice }`, each `{ view: 'px,py,pz,lx,ly,lz', t }`; `mice` is the tank's mouse.
  - `verify-places.html`'s `__shot(name)` also takes a `ROOFS_MOMENT_SHOTS` name (as step 3's life shots do). It builds the life with a stand-in cat at that discovery's anchor (perched on the crate for the telescope; still 2 s for the chimney; on the tower top 4 s for the vane, with the view's camera) and a stand-in session, and runs it to `t`. `scripts/record-page.mjs` is unchanged.

- [ ] **Step 1: Write the failing test** `has its seven moment views, each six numbers and a walk second`. Run `npx vitest run test/roofs.test.js`. Expected: FAIL. Implement `ROOFS_MOMENT_SHOTS`. Expected: PASS.
- [ ] **Step 2: Before set.** Copy step 4's pictures (`<scratchpad>/rooftops-step4/`) and step 3's `after/` place shots to `<scratchpad>/rooftops-step5/before/`. Read `__info()` for `alley`, `tower` and `card` at 240 s on main's build and note them.
- [ ] **Step 3: After set.**
  - Start `npx vite --port 5408 --strictPort` in the background (stop only that pid at the end).
  - Run `node scripts/record-page.mjs --url 'http://localhost:5408/verify-places.html?area=roofs&bare&size=1280x720' --out <scratchpad>/rooftops-step5/after --shots alley,terraces,tower,card --size 1280x720`.
  - Shoot the seven moments the same way: `--shots garden,loft,vane,skylight,telescope,chimney,mice`.
  - Phone size (375 × 812) for `telescope` (the moon) and `skylight` (the pane).
- [ ] **Step 4: The real game, muted.** Seed a save with `muted: true`, the Rooftops owned and `feats: { cross: 19, leap: 14 }`. Open `http://localhost:5408/?roofs=1` headless with `--mute-audio`, never pressing M. Picture and check:
  - `album-roofs.png`: the Album tab's six silhouettes and their hints, and `🥇 Golden mice: 0/39`.
  - `skills-traversal.png`: six traversal skills, Tightrope Tail 19/20 and Long Leap 14/15.
  - `console.txt`: no console errors over a 60 s walk in the alley.
- [ ] **Step 5: Never darker (P4).** Mean luminance of the `alley` picture at 240 s, after against before, is at least the same. Record both in `perf.md` with the draw calls and triangles for every shot, beside the before numbers. If a shot's draws are more than 5 above its before, find out why before going on.
- [ ] **Step 6: Sizes.** Run `npm run build`. Record in `perf.md`:

  | | before | after | limit |
  |---|---|---|---|
  | start-up (gzipped) | 688.6 kB | … | ≤ 690.6 kB (≤ 2 kB growth), ceiling 700 |
  | `roofs` chunk | 47.1 kB | … | under 100 kB |

  Over either limit: stop and report; do not trim silently.
- [ ] **Step 7: Determinism and budgets.** Run `npx vitest run test/flattrace.test.js test/flattrace.offwords.test.js test/budget.test.js test/roofs.test.js test/roofslife.test.js`. Expected: PASS, and `git diff --stat test/fixtures/flat-trace.gameplay.json` is empty.
- [ ] **Step 8: Commit** `verify-places.html src/world/roofsplan.js test/roofs.test.js`, with the message "Rooftops step 5: picture views for the six moments and the golden mice". Stop vite.
- [ ] **Step 9: The report** for the controller: the pictures' paths, `perf.md`'s tables, the before/after sizes, and the owner questions below. The controller runs the full suite once (load check first: `uptime` against `sysctl -n hw.ncpu`).

---

## Owner questions

1. The journal shows a hint on each unfound page ("High up, someone grows tomatoes."), as every page does. Keep these, or show the six with no hint at all, so nothing points at them?
2. On later walks a find counts quietly on its page. Or should each say a short "again" line? That costs about 0.4 kB of the start-up room.
3. The telescope shows the moon as a picture filling the screen. Or should the camera turn up to the sky's own moon?
4. At the top of the clock tower, the camera eases round to look out over the town once she stands still. Keep that, or leave the usual camera?
5. The loft's pigeon follows her for about 75 seconds, on every walk's first visit to the loft. Longer, shorter, or only ever once?
6. The cooing, chirps and gulls need ears, not pictures. After a walk with sound on, are they the right loudness?

## Self-review (done while writing)

- **Spec coverage:**
  - The six discoveries and their journal entries: Tasks 3–6.
  - No prompt points at them (R3, R6; owner question 1).
  - "Learning": Task 1. The 4.5 m gaps were placed in step 2, and Task 1 proves that 15 leaps open them.
  - Golden mice: Task 2. Two players: R11, Task 4.
  - "Light": Tasks 5 and 8, with P4 in Task 9.
  - The loft's cooing: Task 7. The birds' sounds were deferred by step 3's S9 to here.
  - Anti-goals: R5, R7, R8 and the Global Constraints, tested in Tasks 5–6.
  - Two-player height is already on main (step 4's T1).
- **Type consistency:**
  - `ROOFS_FIND_IDS`, `roofsPageId`, `noteRoofsFind` and `roofsFindKey` are defined in Task 3 and used in Tasks 4–5.
  - `findAt` and `createRoofsMoments` come from Task 4 and are extended in Tasks 5–6.
  - `birds.follow` and `birds.following` come from Task 6; Task 7 reads them.
  - The life's `update(dt, t, catPos, camera, session)` matches Task 4's `main.js` call.
  - `traversalTally(progression, celebrate)` comes from Task 1.
- **Proportion:** the blocks are tables of values and test assertions. Bodies are left to the builder, under named tests.
