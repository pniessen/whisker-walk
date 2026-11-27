# Crystal Cave second story: build plan (C0 to C8)

Status: **plan; nothing built.** Design and owner decisions: `docs/superpowers/specs/2026-11-27-crystal-story2-design.md`. Model plans: `2026-11-27-crystal-moon-wave2.md` (seams first, stage slots, prompt arbiter, partner events), `2026-11-27-reef-wave2.md` (bitmask saves, journal ids by first id), the Snowville/Treehouse/Jungle job files (`snowvillejob.js`, `treehousejob.js`, `junglejob.js`, with their `*live.js` and `*words.js`), and `crystalerrand.js` (the day-after pattern). Rules as always: merge one at a time when the focused tests and the full suite pass; budgets are measured, then set at +12 percent; positions marked "start" are tuned from pictures.

## Facts the plan stands on (re-check each in C0)

- Save today: `state.crystal = { step, sparks, album, forge, songs }` (`progression.js` default near `:626`, `sanitizeCrystal` near `:990`, `MERGE_RULES.crystal` at `catmerge.js:197-199`). The prize pattern: `crystalcirclet` (`progression.js:345`, owned when `forge & 8`, unlocked at `:1280`).
- Stages: `crystalstages.js` holds `ST`, `CRYSTAL_STAGE_MODULES` and `loadCrystalStages()` (two stages); `areas.js:70` loads them with stage A; the build row is in `scripts/buildjson.mjs` (crystal: stage ceiling 65, total 120; at C5 total was 57.7). Stage A is 43.8 of 65.
- Start-up 672.5 of 720 kB (`MAIN_GZIP_CEILING_KB`). Draw row full: only no-new-mesh passes, or raise it on purpose (owner decision 8).
- Floor `crystalY`; no `ceil`; at most one PointLight; zoom capped at step 2; bounds 72 x 64 m. Free pockets: south-west corner and the east edge near (31, -8). `CRYSTAL_CLEARS` clears rim rocks and pebbles after scatter.
- Journal ids come from `src/crystalpages.js` (`CRYSTAL_WING_PAGES`, `WING_LIVE`, `WING_OF`); pinned tests find ids by first id, so appending is safe, but `docks.test.js` journal counts and `crystalseams.test.js` length checks move by 5 (see Traps).
- Gold mice: `gm-crystal-1..5` today. GOLD total is read from `KNOWN_GOLD`, so add `gm-crystal-6`, `gm-crystal-7` and fix the pinned counts (the list in `reef-wave2` decision 3 is the starting set, plus whatever is on main when C0 begins: re-run the grep).
- Prompt arbiter, partner routing (`wc-` kinds go to wing C before falling through to Lumi) and ST stage slots exist: add `wd-` routing the same way.

## Decisions (one line each; the owner's yes on the spec's D-list covers them)

1. **Save.** `state.crystal = { ..., deep, chimes }`; `deep` 0..15 with `crystalDeep = (b) => (b & 8 ? 15 : b & 4 ? 7 : b & 2 ? 3 : b & 1)`; `chimes` 0..4095. Sanitiser `n(v?.deep, 15)`, `n(v?.chimes, 4095)`; merge ORs both; both go in the default, `savekeys` SENTINELS (`crystal: { step: 1, deep: 1, chimes: 1 }`), and the hostile-payload test.
2. **Prize.** `prismcharm`, slot `neck`, `prize: true`, `crystal: 'deep'`, owned when `deep & 8` (unlock line next to `:1280`), drawn in `src/cat/` (start-up growth 0.2 kB or less), plus `AWARDS.crystaldeep: 40` and `AWARDS.deepjob: 25` (`discoveries.js` near `:62`).
3. **Journal.** Reserve `ccwall`, `ccdeep`, `ccprism`, `cctink`, `ccchimes` in C0 in `CRYSTAL_DEEP_PAGES` (own array, so no existing length test moves) plus `WING_LIVE.deep` style switches.
4. **Stage.** A third stage `crystaldeep` (`src/world/crystalstagedeep.js`) added to `CRYSTAL_STAGE_MODULES`, `loadCrystalStages()` (a third import in the `Promise.all`), `STAGED_AREAS` crystal row in `buildjson.mjs` (stage ceiling stays 65, total stays 120), `lazybuild.test.js`'s Crystal block and the `ST.deep` slot. Everything the Deep draws lives in this stage; stage A gets only the prompt-source line.
5. **Nothing in the Deep touches the floor.** The hall is a merged-mesh building on `crystalY`; its footprints are cleared via `CRYSTAL_CLEARS`; hall colliders are circle chains; no `ceil`; zoom cap unchanged.
6. **Mission rules** (`crystaldeepmission.js`, pure): `normalize`, `apply`, `credit`, `nextGoal`, copied from `crystalforgejob.js`/`crystalmission.js` (copy, do not refactor tested files). Unlock `isOpen(rec)`: `step >= 7 && songs === 7 && popcount(album) >= 2`.
7. **Prism puzzle** (`crystaldeepprism.js`, pure): three stands, three faces each, `turn(i)` cycles; solved when all faces equal the door's pattern; the solved state is a pure function of the three face indices, always reachable, no fail. Shape (circle, diamond, star) is the same index as colour.
8. **Wall phrase** (`crystaldeepwall.js`, pure, built like `crystalsongplan.js`): one 5-note phrase on `ROOT`, pads light in order; wrong step or a wait just fades the pads and replays; no fail sound.
9. **Tink** is a shy follower modelled on Lumi (`lumiStep`, copied into `crystaldeeptink.js`) with its own `near/far/shy`; nothing saved while carried; never lost: next walk he is at his nest (bit 1 and 2 not 3) or at his nook (bit 3).
10. **Errand** (`crystaldeeperrand.js` and `crystaldeeperrandlive.js`) is `planDeepErrand(roomSeed, visits)` returning `{ kind, spot }`, four kinds (`tune`, `prisms`, `moss`, `hide`), six spots, same hash helper shape as `snowvillejob.js`; pays `AWARDS.deepjob` once a walk through the log's `awardOnce` under its own key, and the lowest unset `chimes` bit.
11. **Co-walk.** Partner events `wd-wall`, `wd-prism`, `wd-found`, `wd-home`, `wd-errand` routed in C0 (before falling through to Lumi); one event per finished step; `credit()` is order-tolerant.
12. **Reduced motion and LOW.** Pure drawing helpers return still variants (wall open, beams steady, Tink still); LOW keeps half the glints; verified by tests on the pure functions.
13. **Words.** `crystaldeepwords.js`: literal phrase ids `crystal.deep.*`, both editions the same plain lines (no series word, banned list scanned); the guide (`crystalguide.js`) gets one goal line per step and a chip.
14. **Names.** `crystaldeepnames.js` holds `NAMES`; everything else imports it; a test scans every other file for the literal placeholder strings.
15. **Parallel.** C0 alone; then C1, C2 in parallel; then C3 and C4; then C5 alone; then C6 and C7; C8 last. Shared files after C0: one mouse line each in `goldmice.js`, and nothing else.

## Traps (pinned tests that move; find by first id, do not edit tests blindly)

- Journal: `docks.test.js` journal counts (+5), any test pinning the last journal ids, `crystalseams.test.js`'s page counts; the new ids are in their own array so `toHaveLength(12)` and the `CRYSTAL_WING_PAGES` six do not move.
- Save shape: `toEqual` on the whole `state.crystal` in `crystalseams.test.js`, `crystalx0.test.js`, `savekeys.test.js`, `crystalmission.test.js` default checks.
- Gold: `goldmice.test.js` counts ("per area"), `crystalfinds`, `crystalseams` and every test that pins the global total (see `reef-wave2` decision 3's list); `fixtures/series-words-off-home.json`.
- Stages: `lazybuild.test.js` Crystal block; `areacoverage` and `savekeys` stay green.
- Scatters: `crystaldecor.js` and finds read the mouse lists; keep them on the first three ids by name (`CRYSTAL_GOLD` first three) and prove it byte-identical.

## Milestones

| M | What | Size | Budget (kB gz, planning) | Needs |
|---|---|---|---|---|
| C0 Seams and site | save keys, merge, defaults, SENTINELS, `prismcharm`, awards, journal ids and pages (stubs), 2 gold stubs, `ST.deep` slot and third stage (empty), `wd-` routing, prompt-source line, `NAMES`, flood picture of the site and the fallback | M | start-up +0.6 max, stage A +0.1 | none |
| C1 Pure rules | mission, unlock, prism puzzle, wall phrase, Tink follower, errand plan, all with tests | M | stage about 4 | C0 |
| C2 Hall shell | passage, Deep Hall, door-crystal, nest, nook: drawing, colliders, clears, near-switch, low stand-in, reduced-motion stills | L | stage +6 to 8; triangles 6,000 or fewer | C0 |
| C3 Wall and prisms live | wall opens, prisms turn, door lights, prompts through the arbiter | M | +2 to 3 | C1, C2 |
| C4 Tink live | greeting, follow, nest, nook, charm pay, journal and guide lines, `wd-` credit | M | +2 to 3 | C1, C2 |
| C5 Story pass | whole story end to end, the carried-thing endings, two cats in a room, both editions | M | none | C3, C4 |
| C6 Errand and album | four errand kinds, chime bars, album, `ccchimes` | M | +2 to 3 | C5 |
| C7 Gold mice and polish | two mice placed, journal photo spots, guide line, pictures | S | +0.3 | C5 |
| C8 Device checks (needs the owner) | iPad 7, iPhone, reduced motion, LOW; draw row and triangle readings | S-M | none | all |

C0 alone (touches every shared file). C1 and C2 together (C1 is pure files; C2 draws). C3 and C4 together (own files each; the arbiter slot is already wired). C6 and C7 together after C5.

## Tests per milestone

- **C0:** hostile-payload merge for `deep` and `chimes` (negative, fractional, huge, strings); bits imply; start-up growth 0.6 kB or less; scatters byte-identical; `lazybuild` sees three Crystal stages; the empty stage loads; the arbiter returns null when the slot is empty; two physics rows unchanged.
- **C1:** every prism start reaches solved by turns alone; wall phrase never fails; Tink never leaves the floor; errand same seed same result, every spot reachable by a floor flood from the spawn; `credit()` order-free.
- **C2:** floor flood reaches the nest, the nook, the door-crystal and both mice; no collider traps the cat (the passage is 2.2 m or more wide); camera clear at step 2 in the hall; footprints cleared; hall triangles and mesh count measured; no PointLight added.
- **C3 and C4:** step gating (`isOpen`), the carry endings (leaving mid-follow, teleport, room end), partner credit both ways, prompts do not fight (one arbiter test of all sources at the passage, the nest and the nook).
- **C5:** the full story with a scripted cat, twice (solo and room); the prize once only; words scan both editions.
- **C6:** the four errands pay once a walk, never twice; album fills lowest bit; replay across two walks gives different errands.
- **C8 (hand):** iPad 7 hall frame time, LOW and reduced-motion pictures, one real cat-and-child walk of the whole story.

## Risks

Sanitiser or merge dropping the new keys (C0 test). The scatters reshuffling (use `CRYSTAL_CLEARS`, never `KEEP_OUT`). The camera inside the hall walls or the door-crystal. The south-west pocket too tight (C0's picture decides; fallback east). Draw row and iPad 7 frame time at the hall. Prompt crowding at the singing chamber (arbiter order: Lumi, errand, wing B, boat, cart, forge, pads, deep). A carried moss pad out through the passage (set down on leaving the Deep). Banned words in new text.
