# The Greenhouse: milestones, tests and budget checks

Date: 2026-11-22. Spec: `docs/superpowers/specs/2026-11-22-greenhouse-design.md`. Status: draft, waiting for the owner's answers to the spec's six questions. Nothing here is built.

## Rules for every milestone (the Market's and the Lighthouse's, adapted)

- Work in a worktree on a branch `greenhouse`, never the main checkout. Merge and push only with the owner's yes (or the standing pre-approval he gives for a finished build).
- `git add` exact paths. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- `test/fixtures/flat-trace.gameplay.json` must not move: `git diff --exit-code test/fixtures/flat-trace.gameplay.json` after every task.
- No change to shared traversal code (`traversal.js`, `traversallive.js`). If a task seems to need one, stop and report.
- New randomness comes from its own salted stream or `hash01(x, z, salt)` (`src/world/warehouselook.js`): `GH_SEED_SALT`, `GH_WATER_SALT`, `GH_BUTTERFLY_SALT`, `GH_SOUND_SALT`, each distinct from every salt in `walk.js` and `foundwear/rules.js`. No `Math.random`, `Date.now` or `performance.now`; shader meshes run on one `uTime` and hashed phases; `build` runs in `withLocalUuids`.
- Every player-facing line goes through the word tables, in both sets; no series word in a string literal.
- Offline-first: nothing contacts the database. No new network message type or field (the can and pots are per device; a knocked can rides the existing `tip` event).
- Tests do not read `src/` as text; whole-walk tests get 60 to 90 s timeouts; float fixtures use `closeDiffs` (CI is Linux). Loading the chunk's modules paints no canvas (the dapple texture is made inside `build`).
- No full suite until the owner says so; run the files a task names. Check load first (`uptime` against `sysctl -n hw.ncpu`).
- Preview ports and pictures: a vite on its own port (`--strictPort`), muted; pictures to the session scratchpad. Stop only the server you started.
- Models: Sonnet builds, Haiku checks and measures, Opus for the final review (the owner's routing note).

## File map

| File | Status | Holds | Joins |
|---|---|---|---|
| `src/world/greenhouseplan.js` | create | Pure data: bounds, spawn, ground, colliders (houses, fountain, shed, cacti, palms), doors, perches, scenics, pois, spawns, seed and pot candidate spots, gold mice, rests, tippables, `GREENHOUSE_REGISTRATION` | place chunk |
| `src/world/greenhouse.js` | create | `build(scene, opts)`, area record, `GRASS_HOOKS` if needed | place chunk |
| `src/world/greenhouseglass.js` | create | The glass-house kit: frame, panes, plinth, doors, mist sheets, sun shafts, dapple, the shader materials | place chunk |
| `src/world/greenhouseparts.js` | create | Shed, cold frames, cans, pot stacks, fountain court, hedges, catnip beds | place chunk |
| `src/world/greenhouseplants.js` | create | Palms, bananas, tree ferns, cacti, orchids, hibiscus, lilies, koi | place chunk |
| `src/world/greenhouselife.js` | create | Butterflies, frogs, sparrows, koi bubble, the seeds job, the watering job, shelter test | place chunk |
| `src/world/greenhousefinds.js` | create | `noteGreenhouseFind`, the six find rules | place chunk |
| `src/world/greenhousesound.js` | create | Drips, trickle, birds, rain patter on `audio.getContext()` | place chunk |
| `src/greenhousepages.js` | create | `GREENHOUSE_FIND_IDS`, page ids, `GREENHOUSE_JOURNAL_TYPES`, page words | start-up |
| `src/greenhouseflag.js` | create | `?greenhouse=1` dev switch (later a shortcut) | start-up |
| `src/foundwear/spots/greenhouse.js`, `spots/index.js` | create, modify | 12 spots | start-up |
| `src/foundwear/head.js`, `src/cat/hats.js` | modify | the gardener's hat (the bucket hat's shape, new colours) | start-up |
| `src/world/areas.js` | modify | loader and `AREA_ENTRY_MODULES` row | start-up |
| `src/progression.js` | modify | catalog row, `walks.greenhouse`, `JOURNAL_TYPES` | start-up |
| `src/discoveries.js` | modify | `greenhousefind`, `greenhousejob` | start-up |
| `src/goldmice.js`, `src/propsets.js`, `src/rests.js`, `src/marks.js` | modify | `GOLD_MICE.greenhouse`, yarn, hides, rests, `MARK_AREAS` | start-up |
| `src/critters.js` | modify (tiny) | a `tint` option for the butterfly | start-up |
| `src/render/clouds.js`, `ambient.js`, `pawprints.js`, `src/audio.js` | modify | area rows | start-up |
| `src/journal.js`, `src/ui/hud.js`, `src/ui/territorymap.js` | modify | pages, summary labels, icon and label | start-up |
| `src/hints.js`, `src/tutorialwords.js`, `src/game/tips.js` | modify | the place hint and its picture | start-up |
| `src/clanphrases.js`, `src/offclanwords.js` | modify | phrases in the `LATER` table, the everyday set's overrides | start-up |
| `src/worldmap.js`, `src/gateways.js` | modify | place, land colour, road; the gate pair (a Farm end, a Greenhouse end) | start-up |
| `src/world/farm.js` | modify (small) | cut the north fence for the gate (`cutForGates`) and draw its gate | Farm chunk |
| `src/game/walk.js`, `src/main.js` | modify | the flag, the life hook (small, local edits) | start-up |
| `test/budget.test.js` | modify | rows (built and merged), the Farm's `endsFor` expectation | |
| `verify-greenhouse.html`, `verify-places.html`, `public/places/greenhouse.jpg` | create, modify | test page, card picture | |

## M0: Recon and the proofs (no place yet)

Goal: prove the risky things on a test page before building art.

1. **One glass house.** A single Palm-House-sized frame with the pane mesh (front faces only, gradient alpha, `userData.window`), mist sheets, three sun shafts and the dapple quad, in the browser and headless. Check: the pane is invisible from inside, the building fade and the window hide work as the town's houses do, `dusk.js` leaves it alone or warms it, the cat is seen through the glass from outside, and there are no visible sorting seams with the water and the fountain. Measure draw calls and the overdraw (a screenshot at three tiers) on the oldest iPad.
2. **The pond.** A `waters` circle with a 1.5 m wading band (the Farm's `POND`), the koi shader mesh under it, lily pads on top: she wades, the water state is right, the fish are seen through the surface. Reduced motion freezes them.
3. **The seed packets.** Read `collectibles.js` and `farmjobs.js` and pick the model for a pickup that is not a collectible and is not carried (a count that stays per device). If neither fits, the packet is a proximity trigger with a mesh.
4. **The can.** A carried `job` item picked and put down; the rain-slip rule inside and outside glass, and `setSheltered` toggling when the camera is under a house.
5. **The fountain kit.** Where `parkfountain.js` and the Market's fountain code live; what a shared module does to each chunk's gzip count (`areaDownloads`). Decide: shared module, or a small copy.
6. **The Farm's north edge.** Which x is open 2.5 to 3.5 m inside the north fence; the gate's `cutForGates` cut; the Farm's built numbers before and after.
7. **The camera** at the Palm House's ridge height and among six palms (`camzoom`).

**Tests:** a throwaway test page and a short recording for the owner. `test/greenhouseglass.test.js` (kept): `the pane mesh is transparent, not a caster, front-sided and tagged as a window`; `a house's boxes fade the building and hide the panes`; `two builds are identical`.

**Gate:** the owner looks at the page picture and says the glass and the mist look right. If the front-face trick shows seams, switch to a double-sided pane with half the alpha (more overdraw, so re-measure).

## M1: The garden (ground, shapes, no life, no glass)

Goal: a walkable, drawn Greenhouse garden behind `?greenhouse=1`, with nothing alive and the glass houses as plain frames.

- `greenhouseplan.js`: bounds, spawn, ground strips and the lawn, colliders (fountain, shed, the house footprints with their door gaps, the cacti rings, the palms), the pond circle and its band, perches (pot stacks, barrel, benches, cold frames, the shed roof).
- `greenhouse.js`, `greenhouseparts.js`, `greenhouseplants.js`: the garden, fountain court, catnip beds, pond, shed, kitchen garden, outer trees, horizon band. The area record (`name`, `bounds`, `spawn`, `colliders`, `ground`, `waters`, `perches`, `pois`, `critterSpawns`, `scenics`, `collectibles`, `tippables`, `boxes`, `rests` data).
- Registered as a loader and entry row in `areas.js`; `?greenhouse=1` starts a solo walk. No catalog row yet.

**Tests (new `test/greenhouseplan.test.js`, `test/greenhouse.test.js`):**
- `ground validates` (`validateGround`).
- `the spawn, every scenic, collectible, tippable, box and rest is walkable` and `none stands in water or a collider`.
- `every door gap is open and 3 m wide; the frame is solid`.
- `the garden, the Palm House and the shed are all reachable from the spawn by walking` (a flood fill on the real ground).
- `a cat in the pond band is wading, never stuck; the pond's middle is blocked`.
- `the shed roof is reached from the ground in three hops within the base climb budget`.
- `deterministic: two builds are identical` (positions, counts).
- Budget: `['greenhouse', buildGreenhouse, 280, 210, 62000]` in `AREAS`; measure and record the built numbers.

**Budget checks:** `npx vitest run test/budget.test.js test/areas.test.js test/lazybuild.test.js`; then `npm run build` and read the place chunk and the start-up lines. Gates: place chunk at most 25 kB gz at M1; start-up at most 709.1 (`areas.js` rows only).

## M2: Glass, mist and light (the Palm House first)

- The glass-house kit applied to the Palm House: frame, panes, plinth, four doors, six palms, the fern island, hanging baskets, mist, shafts, dapple, the warm floor, the sunbeam nap patch, the door curtains.
- `setSheltered` while the camera is under glass; the rain patter loop is M3's sound.
- Trim 1,200 triangles from hedges and bushes to meet the aim if needed.

**Tests (`test/greenhouseglass.test.js`, `test/greenhouseair.test.js`):**
- `the Palm House is walkable all round the fern island on a 2.2 m clear loop`.
- `mist and shafts are noCast, noMerge and run on one uniform; reduced motion freezes them`.
- `no Math.random, Date.now or performance.now in the mist, the shafts or the dapple`.
- `the dapple texture is made in build, never at import` (`test/areaimport.test.js` still passes).
- `a rain walk is dry inside: the shelter flips on a camera inside a house box and back off outside`.
- A picture and a short recording of the Palm House at day and dusk, on all three tiers.

**Budget checks:** measured build against 280 / 210 / 62,000 and the aim 150 / 70 / 52,000; place chunk at most 40 kB gz; the Farm's and the Fairground's numbers unchanged (a full `test/budget.test.js` run). **Frame check on the oldest iPad and the iPhone** before M3 starts.

## M3: Life, jobs and things to do (stage A: garden and Palm House)

- Koi (shader), frogs, sparrows, the fountain's sparrow bath; the three finds that stage A can find (`palm`, `koi`, `catnip`) and their rules; the catnip beds and the nap rests as rest rows; collectibles (5), tippables (6), the box; three golden mice; the yarn ball; moments; the sound module.
- The watering job (can, eight candidate pots, the pick and the put-back) and the seeds job (three sets of five spots, the count, the seed tray, the sprouts). Spots in the three rooms are left out until stage B.
- All lines in both word sets; the place hint; `greenhousepages.js` and the journal pages for the stage-A finds; `AWARDS.greenhousefind` and `greenhousejob`.

**Tests:**
- `test/greenhousefinds.test.js`: `each find is found by its rule and not by anything near it`; `the first find ever pays 12 and says its line; later walks count once and say nothing`; `a resumed walk pays and counts nothing twice`; `two players each find it on their own save`.
- `test/greenhousejobs.test.js`: `the seeds job and the watering job have no clock and no failing state`; `every seed spot in every set is reachable from the spawn`; `the five packets are picked once each and the count survives a resumed walk`; `a can slipped in rain can be picked up again`; `the job pays 25 once a walk each`; `nothing is sent to a partner`.
- `test/greenhousegold.test.js`: `three golden mice, ids valid, none beside a find, a collectible or a discovery; each reachable without skills`; `Clan totals 48 and Legacy 24`.
- `test/greenhousegoals.test.js`: `every daily goal the area lists can be finished` (six tippables, a box, critters, scenics); `createGoals still draws exactly three`.
- `test/greenhousewords.test.js`: every phrase exists in both sets, reads the same except the catnip lines and the people line; the series-words and off-words snapshots updated for this place's lines only.
- `test/greenhousesound.test.js`: nothing plays and no AudioContext is asked for while muted.
- Journal: `JOURNAL_TYPES` and `GREENHOUSE_JOURNAL_TYPES` equal; the save sanitiser keeps the ids.

**Budget checks:** `npm run build`: start-up at most 710.5 kB gz; place chunk at most 50 kB (hard 100); `test/savesize.test.js` (under 150 kB); snapshot drift reviewed by hand.

## M4: Into the game (stage A ships)

- `CATALOG.areas.greenhouse` row (100 paws, after 2 Farm walks, both editions), `walks.greenhouse: 0`, the place card and its picture, `STREET_PLACES`, `STREET_LAND`, the road `farm-greenhouse`, `STREET_ICON`, the label point, the gate pair `farm-greenhouse` and `greenhouse-farm`, `?greenhouse=1` becomes a shortcut, the 12 found-outfit spots and the gardener's hat, area rows (clouds, ambient, pawprints, marks, audio), the hint row.

**Tests:**
- `test/worldmap.test.js`: the circle clears every other circle and label; the road clears the Farm, the Fairground and the coast; the gateways list gains a ninth row; `a Legacy save shows it too`.
- `test/gateways.test.js`, `gatewayspots.test.js`, `gatewaylook.test.js`: `the Farm's new end stands on open ground 2.5 to 3.5 m inside the north edge`; `the Greenhouse's end arrives facing in, 3.65 m clear`; `a gate is live only once the catalog row exists`.
- `test/progression.test.js`: `the offer is 100 after 2 Farm walks`; `a save that walked ?greenhouse=1 owns nothing it did not buy`; `an old save loads with walks.greenhouse 0`.
- `test/foundspots.test.js`: 12 spots, none within 15 m of the spawn, none in water, none at a golden mouse or collectible; `validateFoundWear` passes for the hat.
- `test/budget.test.js`: the Farm's `endsFor('farm')` expectation gains `['farm-greenhouse', 'farmgate']`; its numbers re-measured; a `greenhouse` merged row (+12 % of measured).
- Co-walk: `test/greenhousecowalk.test.js` (both see the same seeds and pots from the room seed; a tipped can follows `tipById`; the hat follows `findsAgreed`).

**Budget checks:** start-up at most 711.0 kB (stop at 711.5); place chunk reported; the Farm's triangles under 62,000; `test/areaimport.test.js`.

## M5: Polish, pictures and device checks (stage A)

- Look pass: palm greens, glass tint, mist density, the pond's colours, the catnip flowers, the shed's paint, the card picture.
- The owner's pictures: arrival, the fountain court, the Palm House with the mist and shafts, the pond, the catnip bed, the shed, the world map with the new place.
- Device checks: an older iPad (frame rate, overdraw), the iPhone (the owner reads it), a DualSense for the can and the pots, TV mode (the sun shafts' calm, text legibility, sound level), touch on a phone (prompt length, the glass fade).
- Update the memory-style notes the owner keeps (a short status file) when merged.

**Tests:** the full suite once, after a load check and the owner's word; `npm run build` for the final sizes (start-up at most 711.0, place chunk, save size).

## M6: Stage B, the three rooms (after the owner's go)

- The Orchid Room, the Cactus House and the Butterfly Room with their glass, mist and shafts; orchids, cacti, hibiscus, the stream bed; four chaseable butterflies and the ambient cloud (`GH_BUTTERFLY_SALT`); the three finds (`orchid`, `cactus`, `butterfly`) and their pages; three scenic spots; the seed and pot spot sets gain room spots (a new set, so the stage-A sets are unchanged).
- Journal ids for the three finds are appended to `JOURNAL_TYPES` (start-up data); the save sanitiser keeps them.
- **No outfit spot, no golden mouse and no stage-A scenic id changes** (`FIND_KEY` stays).

**Tests:** `test/greenhouserooms.test.js` (each room walkable to its back, 3 m doors, cactus rings block, the high shelf reached in one hop, butterflies flutter off when chased and are never caught); the finds, goals and words tests extend to the new ids; the Orchid and Butterfly scenic ids are in the scenic list.

**Budget checks:** the built numbers against 280 / 210 / 62,000 (estimate 104 / 40 / 53,200; stage A alone about 70 / 28 / 36,000); place chunk at most 55 kB gz; start-up at most 711.0; a frame check on the oldest iPad with the Butterfly Room's cloud and the rain patter.

## Budget table to keep updated

| Check | Baseline now | Gate |
|---|---|---|
| Start-up gz | 708.9 kB | M1 at most 709.1; M3 at most 710.5; M4, M5 and M6 at most 711.0; stop at 711.5; ceiling 720, never raised |
| Place chunk gz | none | M1 at most 25; M2 at most 40; M3 at most 50; M6 at most 55; hard 100 |
| Built meshes / casters / triangles | none | 280 / 210 / 62,000; aim 150 / 70 / 52,000 (estimate 104 / about 40 / 53,200) |
| Merged meshes / casters | none | about 80 / 40 (re-pin at +12 % of measured) |
| Life (meshes, casters, triangles) | none | at most 12, 0, 3,000 |
| Farm triangles with the new gate | about 53,400 of 62,000 | under 62,000 |
| Save size | about 101 kB | under 150 kB |
| Flat trace fixture | unchanged | `git diff --exit-code` clean |
| Shared traversal code | unchanged | `git diff --exit-code src/traversal.js src/traversallive.js` clean |

If the Lighthouse merges first, add its own 2.3 kB to the baseline and keep this table's deltas, not its absolute numbers.

## Left to the builder

The exact layout numbers, the glass kit's rib spacing and arch profile, the mist's density and colour, the sun shafts' angle, the dapple's pattern, the pond's colours and fish count, the palms' leaf shapes, the cactus shapes, the seed and pot candidate spots, the hat's look, the exact find spots, and which of the three seed sets and four pots the room seed picks.
