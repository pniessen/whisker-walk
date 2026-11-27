# Crystal Cave wing C and the Moon's Old Relay Station (wave 2)

Status: **plan with the advisor's binding answers (Opus, 2026-11-27).** Nothing here is built. The Reef wave 2 plan (`2026-11-27-reef-wave2.md`) is the model: its decision 4 for rides, and its save, journal and gold-mice rules. Positions marked "start" are first guesses, tuned from pictures. Each milestone has a seam test that floods the floor and checks every collider, perch, find, mouse and story point. Merge one at a time when the full suite passes. Budgets are measured, then set at +12%.

Two numbers to re-check in X0: the Crystal chunk size today (the enrichment plan's 25.8 kB is old; it was 41.0 kB after decor and life), and the Moon download (decision 3B: raising the Moon total ceiling from 135 to 150 kB needs the owner's agreement before that part of X0 merges).

## Facts the answers rest on

- **Crystal save and merge.** The save is `{ step, sparks, album }` (`progression.js:943-947`), the default is at `progression.js:587`, the merge rule at `catmerge.js:188-190`. Lumi's arc ends at `STEP.done = 7` (`crystalmission.js:22`).
- **Crystal floor and camera.** The floor is `crystalY` with no real ceiling (`ceil: () => Infinity`, `crystalplan.js:77`). Hard rule at `crystal.js:6`: no `ceil`, walls 9 m or more beyond the walkable edge, at most one PointLight. Zoom is capped at step 2 (`camzoom.js:54`). The dome is 13 m or more over every walkable point (`crystalplan.js:92-95`). Bounds 72 x 64 m (`crystalplan.js:13`).
- **Crystal chunk.** One chunk today (`areas.js:69`).
- **Moon save.** `{ step, cells, stamp, scope, jump }` (`progression.js:928-937`), default at `:581`, merge rule at `catmerge.js:172-179`. The first arc ends at `STEP.replied = 8`; the saved step is capped at 9 (`moonmission.js:17,29`).
- **Moon ground and stages.** Ground has `ceil: () => Infinity` (`moonplan.js:437`). Stages load all at once with `Promise.all` (`moonstages.js:15`). Ceilings 65 per stage and 135 total (`buildjson.mjs:94-95`). The Reef's total is 150 (`:116`).
- **Prompts today.** Both places pick the action button's prompt with a hand-written chain: `crystal.js:108-116` and `moonlife.js:186-195` (Dot riding first). Partner events are routed at `crystal.js:118` (anything not `show` goes to Lumi) and `moonlife.js:196` (unknown kinds go to `base`).
- **Co-walk.** `ctx.sendEvent` is `areaLifeSender` (`netevents.js:46-51`). Received events go to `areaLife.credit` (`netevents.js:358`).
- **Journal.** `JOURNAL_TYPES` ends at the Moon life ids; the Reef R18 ids come after them.
- **Gold mice.** 62 Clan / 38 everyday. Crystal and Moon count in both editions. `GOLD_MAX_COUNT` is 72 (`progression.js:131`).

## Decisions

1. **Save** (SAVE_VERSION stays 4; bitmasks; merge is OR, then the sanitiser fills the bits a rule implies).
   - **Crystal:** `state.crystal = { step, sparks, album, forge, songs }`. `forge`: bits 0-2 are three ingredients in any order (glow-cap from the grotto, falls water, a rose shard from the end of the cart line); bit 3 is "circlet made", which implies 7. Sanitiser: `forge: reefLab(n(v?.forge, 15))`, reusing `reefLab` (`progression.js:955`). `songs`: bits 0-2 are three tunes learned, any order; sanitiser `n(v?.songs, 7)`.
   - **Moon:** `state.moon = { ..., relay }`. Bits 0-2 are three relay parts, bit 3 "station awake" (implies 7), bit 4 "the far station answered" (implies 31). Add an exported `moonRelay = (b) => (b & 16 ? 31 : b & 8 ? 15 : b & 7)` and sanitise with `n(v?.relay, 31)`.
   - Add every new key to BOTH sanitisers, the merge rules and the defaults (`:581`, `:587`) in X0.
   - **Not saved:** boat, cart and sled (no seat or record).
   - **Prizes** follow the bandana pattern (`progression.js:330, 1213`): `crystalcirclet` (head slot, owned when `forge & 8`) and `signaltag` (collar, owned when `relay & 16`). Both go in `BASE_ACCESSORIES`, plus paws. They are drawn in `src/cat/`, which loads at start-up: keep start-up growth to 0.3 kB or less.

2. **Journal.** Append at the END, Crystal first, then Moon. Keep the family prefixes: `cc` (place and activity pages; `cl` stays for cave life) and `mn` (`ml` stays for robots). Do not use `mo`.
   - Crystal: `ccboat`, `ccgrotto`, `ccfalls`, `ccforge`, `cccart`, `ccsong`.
   - Moon: `mnstation`, `mnsignal`, `mnrelay`, `mnsled`, `mnlap`.
   - Reserve all 11 in X0 (the sanitiser drops unknown ids). Put them in new lists `CRYSTAL_WING_PAGES` (`crystalpages.js`) and `MOON_WING_PAGES` (`moonpages.js`), included in `journal.js`. Use new JOURNAL_TYPES arrays so `crystalseams.test.js:118` (`toHaveLength(12)`) does not move. Both word sets.

3. **Gold mice: 65 / 41.** Add three stubs: `gm-crystal-4` (mushroom grotto floor, on foot), `gm-crystal-5` (forge shelf, one hop, within perch reach), `gm-moon-4` (relay tower ledge at y 3, one Moon hop, like `gm-moon-1`). They go into `goldmice.js`, `CRYSTAL_GOLD` (`crystalfindsplan.js`) and `MOON_MICE` (`moonplan.js`). Do NOT add them to `KEEP_OUT` (`crystalplan.js`) or `ROCK_KEEP_OUT`. **Trap:** the scatters read the mouse lists (`crystaldecor.js:39` reads `CRYSTAL_GOLD`, `moonbeautyplan.js:22` reads `MOON_MICE`). In X0 make both read only the first three ids, by name, and add tests that the decor and beauty sites are byte-identical before and after.

3B. **Owner sign-off: Moon total ceiling.** The Station stage puts the Moon at about 137 kB, over the 135 kB total. X0 raises `MOON_TOTAL_GZIP_CEILING_KB` to 150 (Reef parity), named in the commit. If the owner says no, the sled is cut.

4. **Rides: one new shared pure file, `src/world/pathride.js`.** Not `reefride.js` (free-roaming, with depth, lift and Reef bounds); boat, cart and sled all follow a path. Do not touch `reefride.js` or `moonrover.js`.
   - **The sim:** a path is a polyline, held as `{ s, v, lat }`. `stepPath(r, input, dt, spec, path)` paces itself between the spec's `vMin` and `vMax`; the stick only nudges the speed. `lat` (side-to-side, within +/- `spec.laneHalf`) is used by the sled only. Stops are named distances along the path. `posAt(s, lat)` returns x, z and heading. `hopOffSpot(r, spots)` picks from precomputed bank or platform spots; a test checks each is free and reachable on foot, so she can always hop off.
   - Same rules as `reefride.js`: no THREE, no clock, no randomness, sub-steps of 1/30 s or less. It imports nothing; each place passes its own path.
   - **Specs:** Boat 0.6-2.0 m/s, loops. Cart 1.0-3.0 m/s, ends at bumpers and rolls back the way it came. Sled 3-8 m/s, `laneHalf` 1.5, loops.
   - **Separate, one live file each:** drawing, the seat record and `perchY` (`moonroverlive.js:131, 166`), the camera's late step, words, and the path data in each place's plan file.
   - **Co-walk:** like the Reef: `session.fair.riding = { id: 'crystal-boat' | 'crystal-cart' | 'moon-sled' }` on the existing seat field. One seat each; a shared seat comes later.

5. **Crystal wing C** (inside the existing bounds; no new walls; no `ceil`; no PointLight; positions are start values).
   - **Waterfall:** the cliff and fall stand 9 m or more beyond the walkable edge (about x 45-50, z 22) and pour into a plunge pool at about (32, 22).
   - **River:** from the plunge pool south along x about 31.5 to a still pool at about (31, -6). Water drawn at `crystalY + 0.04`; `crystalY` itself never changes. Both banks are chains of circle colliders. The boat runs there and back between a north dock and a south dock, boarded by prompt.
   - **Mushroom grotto:** about (25, 12), radius 5. Caps 2 m tall or less; giant mushrooms only outside the walkable edge.
   - **Forge:** about (-24, 23), radius 5. A glowing hearth with emissive light and a light pool, an anvil and a bench. The forge job opens at step 7 or later.
   - **Cart track:** along x about -33 from the forge (z 22) to the singing chamber (z -14), following the floor at `crystalY + 0.35`; no drops.
   - **Singing chamber:** about (-27, -16), radius 5. Seven flat floor pads (raised 0.08 m or less, no hop needed). Each plays a pentatonic note from its own tone function in the stage on `humNote`'s root (`humNote` itself is not edited). Three echo tunes, no fail sound.
   - **Clearing space:** remove rim rocks, clusters and pebbles in each footprint AFTER they are scattered, with a `CRYSTAL_CLEARS` rectangle list like `reefplan.js:64`. Never use `KEEP_OUT`.
   - Reduced motion freezes the flow, the fall and the boat's bob (the rides still move). LOW keeps half the spray and drops. Words: "the Old Tracks", "Lumi's cart"; the banned word list applies.

6. **Moon: the Old Relay Station wing** (chosen over the garden dome, farm and dust lake because it carries the second arc the plan already names, a signal from another station).
   - **Station:** at about (44, 36), radius 7, about 12 m from Dot's track (`moonplan.js:108`). The roof is open to the sky: pillars, walls 2.2 m or less, and a relay tower that is a perch chain plus collider. No finite `ceil`: it would pull the camera in (`player.js:700, 720`) and clip Moon hops. It is wing E in `moonzones.js:16` with its own `near` of 26 (like the Lava Tube), so its detail is off from the spawn (45 m away), with a low stand-in shape.
   - **Sled lane:** a closed loop from a rack at about (14, 46), east along z about 45 to the station's south side, and back. Remove rocks and pebbles inside the corridor after they are scattered; never through `ROCK_KEEP_OUT`.
   - **Arc 2:** opens when `step >= 8`. The signal: Pip hears beeps (`mnsignal`). Three relay parts in any order: one at the lane's far end, one in the station, one on Earthrise Rock's foot. The station wakes (`relay` bit 3). The far station answers at Earthrise and she gets the `signaltag` (`relay` bit 4).

7. **Prompt arbiters.** New shared file `src/world/promptarbiter.js`, a copy of `reefprompt.js` (the Reef keeps its own).
   - Crystal sources, in order: Lumi, errand, wing B, boat, cart, forge, pads.
   - Moon sources, in order: riding (Dot or sled), base, job, star, launch, station or relay, then the rover and sled "Hop in" offers.
   - Wired in X0: the source list reads `ST` stage slots that return null until they are filled, so later milestones never edit `crystal.js` or `moonlife.js`.
   - Partner events (routed in X0 too): Crystal kinds starting `wc-` go to wing C (`wc-forge` for an ingredient or the circlet, `wc-song` for a finished tune) before falling through to Lumi. Moon kinds starting `relay-` go to the station, before falling through to `base`. Single notes are never sent.

8. **Stages and budget** (kB gz, planning).
   - **Crystal:** new `crystalstages.js` (a copy of `reefstages.js`) with stages `crystalwingc` (river, falls, boat, grotto, forge: 20-24) and `crystalplay` (cart, pads: 9-11), plus `pathride.js` (about 2), loaded with stage A at `areas.js:69`. Add `CRYSTAL_STAGE_ENTRY_MODULES` and `crystalDownloads` through `stagedDownloads` (`buildjson.mjs:98`). Ceilings 65 per stage, 120 total (start; set in X0 at measured +12%).
   - **Moon:** a 4th stage `moonstation` (wing 7-9, sled 4-5, arc 4-5, words 1-2: about 18-21). Update `moonstages.js:10, 15`, `buildjson.mjs:89-93, 213` and `lazybuild.test.js:66`. Moon total about 137: X0 raises the ceiling to 150 (3B).

9. **Parallel work.** Round 0: X0 and P1 together (P1 is a new file only). Round 1: C1, C5, M1. Round 2: C2, C4, M2. Round 3: C3, M3. Shared files after X0: only one mouse line each in `goldmice.js` and the plan file when a spot moves; one builder edits `goldmice.js` at a time.

10. **Risks.** The sanitiser or merge dropping the new keys, or partner events going to the wrong place. Scatters reshuffling (mouse lists, clears). The camera inside the falls cliff, the mushroom caps or the station walls. The cart or sled corridor hitting rim rocks, scattered rocks or rifts. The Moon's total download and the iPhone draw count (shadows are about 73% of draws). Too many prompts close together at the docks and racks. Carry endings (an ingredient held while boarding, a relay part held on the sled). Banned words ("old tracks" text: never collapse, trapped, stuck, dark).

## Traps (pinned tests that move)

- **Journal:** `docks.test.js` journal counts move by 11; `moonrobots.test.js:216` `slice(-6)` becomes a search from `'mldrone'`. `crystalseams`, `reefseams` and `cavelife` already search by first id: leave them.
- **Save shape** (the `toEqual` checks that pin the whole object): `crystalseams.test.js:53, 60, 69, 71, 78, 82, 99-112`; `moonseams.test.js:133, 140` and the rest of that block.
- **Gold 62 -> 65 and 38 -> 41:** `goldmice.test.js:10-14, 48-55` ("3 per area" becomes 5 in the cave, 4 on the Moon); `crystalfinds`, `crystalseams`, `moonfinds`, `moonseams`, the moongold equality test; `reefgold`, `reefseams`, `reeflabstory`, `reefwreck`, `reefgate`; `greenhousegate`, `greenhousegold`, `goldedition`; `docks`, `fair`, `farm`, `housegame`, `housethings`, `lighthousegold`, `roofs`; `fixtures/series-words-off-home.json`.
- **Stages:** `lazybuild.test.js:60-72` (the Moon list and the total ceiling), and a new Crystal stage block.

## Milestones

| M | What | Size | Needs |
|---|---|---|---|
| X0 Seams (both places) | save keys, merge, defaults, 11 ids, page and word stubs, 3 mouse stubs, mouse lists cut to the first three, prizes, Crystal stages and loader, Moon stage 4 and the 150 ceiling (owner sign-off), arbiters, partner-event routing, clears hooks, wing E | M-L | none |
| P1 Path sim | `pathride.js` | S-M | none |
| C1 River, falls, boat | stage `crystalwingc` | L | X0, P1 |
| C2 Grotto, forge shell, mice 4 and 5 | stage `crystalwingc` (own files) | M | X0 |
| C3 Forge job, circlet | | M | C1, C2 |
| C4 Cart on the Old Tracks | stage `crystalplay` | M | X0, P1 |
| C5 Singing chamber | stage `crystalplay` (own files) | S-M | X0 |
| M1 Station shell, mouse 4 | stage `moonstation` | L | X0 |
| M2 Sled lane | | M | X0, P1 |
| M3 Relay arc, signal tag | | M | M1 |
| Z Polish, device checks (needs the owner) | | M | all |

Tests per milestone: X0 hostile-payload merge, byte-identical scatters, start-up growth under 0.3 kB, two physics rows unchanged. P1 random stick input never leaves the path, a hop-off spot always exists, the same input always gives the same ride. C1 banks are colliders, the falls are 9 m or more beyond the edge, the camera stays clear at step 2. C2 and C4 footprints and the cart corridor are clear. C3 carry endings. C5 pure tune logic, partner credit. M1 floor flood reaches the tower and mouse, no `ceil`. M2 lane corridor clear, loop closed. M3 step gating (`>= 8`), the relay rules, partner credit.
