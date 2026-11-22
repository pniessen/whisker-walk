# Lighthouse Point: milestones, tests and budget checks

Date: 2026-11-22. Spec: `docs/superpowers/specs/2026-11-22-lighthouse-design.md`. Status: draft, waiting for the owner's answers to the spec's six questions. Nothing here is built.

## Rules for every milestone (the Market's, adapted)

- Work in a worktree on a branch `lighthouse`, never the main checkout. Merge and push only with the owner's yes (or the standing pre-approval he gives for a finished build).
- `git add` exact paths. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- `test/fixtures/flat-trace.gameplay.json` must not move: `git diff --exit-code test/fixtures/flat-trace.gameplay.json` after every task.
- New randomness comes from its own salted stream or `hash01(x, z, salt)` (`src/world/warehouselook.js`): `LIGHT_SHELL_SALT`, `LIGHT_KITTEN_SALT`, `LIGHT_SOUND_SALT`, each distinct from every salt in `walk.js` and `foundwear/rules.js`. No `Math.random`, `Date.now` or `performance.now`; the life runs on walk seconds; `build` runs in `withLocalUuids`.
- Every player-facing line goes through the word tables, in both sets; no series word in a string literal.
- Offline-first: nothing contacts the database. No new network message type or field (the lamp lever rides the existing `tip` event; the beam angle is time and room seed).
- Tests do not read `src/` as text; whole-walk tests get 60 to 90 s timeouts; float fixtures use `closeDiffs` (CI is Linux).
- No full suite until the owner says so; run the files a task names. Check load first (`uptime` against `sysctl -n hw.ncpu`).
- Preview ports and pictures: a vite on its own port (`--strictPort`), muted; pictures to the session scratchpad. Stop only the server you started.

## File map

| File | Status | Holds | Joins |
|---|---|---|---|
| `src/world/lighthouseplan.js` | create | Pure data: levels, ground strips, discs, ceilings, colliders, crossings, gaps, drops, climbs, perches, scenics, pois, spawns, gold mice, tippables, `LIGHTHOUSE_REGISTRATION` | place chunk |
| `src/world/lighthouse.js` | create | `build(scene, opts)`, `GRASS_HOOKS` if needed | place chunk |
| `src/world/lighthouseparts.js` | create | Tower, lamp room, lens, beam, cottage, rocks, pool and cave meshes | place chunk |
| `src/world/lighthouselife.js` | create | Gulls, crabs, the keeper's cat, the kitten job, the lamp job, beam phase, ship | place chunk |
| `src/world/lighthousefinds.js` | create | `noteLighthouseFind`, the six find rules | place chunk |
| `src/world/lighthousesound.js` | create | Bell, foghorn, echo, gull calls on `audio.getContext()` | place chunk |
| `src/lighthousepages.js` | create | `LIGHTHOUSE_FIND_IDS`, page ids, `LIGHTHOUSE_JOURNAL_TYPES`, page words | start-up |
| `src/lighthouseflag.js` | create | `?lighthouse=1` dev switch (later a shortcut) | start-up |
| `src/foundwear/spots/lighthouse.js` and `spots/index.js` | create, modify | 12 spots | start-up |
| `src/world/areas.js` | modify | loader and `AREA_ENTRY_MODULES` row | start-up |
| `src/progression.js` | modify | catalog row, `walks.lighthouse`, `JOURNAL_TYPES` | start-up |
| `src/traversal.js`, `src/traversallive.js` | modify | the `stair` kind and its gait | start-up |
| `src/discoveries.js` | modify | `lighthousefind`, `lighthousejob` | start-up |
| `src/goldmice.js`, `src/propsets.js`, `src/rests.js`, `src/marks.js` | modify | `GOLD_MICE.lighthouse`, yarn and hides, rests, `MARK_AREAS` | start-up |
| `src/render/clouds.js`, `ambient.js`, `pawprints.js`, `src/audio.js` | modify | area rows | start-up |
| `src/journal.js`, `src/ui/hud.js`, `src/ui/territorymap.js` | modify | pages, summary labels, icon and label | start-up |
| `src/hints.js`, `src/tutorialwords.js`, `src/game/tips.js` | modify | the place hint and its picture | start-up |
| `src/clanphrases.js`, `src/offclanwords.js` | modify | phrases in the `LATER` table, the everyday set's overrides | start-up |
| `src/worldmap.js`, `src/gateways.js` | modify | place, land colour, road; the gate pair | start-up |
| `src/tippables.js` | none (the `spot.build` hook exists) | | |
| `src/game/walk.js`, `src/main.js` | modify | the flag, the life hook (small, local edits) | start-up |
| `src/cat/hats.js`, `src/foundwear/head.js` | modify | the keeper's cap | start-up |
| `test/budget.test.js` | modify | rows (built and merged), the Seaside's new end | |
| `verify-lighthouse.html`, `verify-places.html`, `public/places/lighthouse.jpg` | create, modify | test page, card picture | |

## M0: Recon and the two proofs (no place yet)

Goal: prove the two risky things before building art.

1. A stair of three `stair` rail flights round a stub tower on a small test page, walked headless and in the browser: the cat mounts at the foot, walks up, steps off at a landing and at the gallery, walks back down, and the Rooftops' crossings are untouched.
2. A partner on another device sees the cat's height on the gallery (the Rooftops' height field; verify it exists and carries the stair's rail heights), or stop and report.
3. Confirm in a test that a pool of 0.15 m shallow water is walkable and does not slow or soak her wrongly (the Seaside's `shallow` precedent), or choose flat tinted discs.
4. The cave: the plateau strips leave the cave's footprint, the roof mesh covers it, and the camera stays clear of the ceiling (`camzoom`).

**Tests:** `test/traversal.test.js` additions: `a stair crossing walks at the normal pace in the normal pose`; `a stair flight does not count toward the Tightrope feat`; `every Rooftops crossing is exactly as before` (a fixed table of kinds, speeds, feats); `a hop off a landing lands on the plateau`. A page picture and a short recording for the owner.

**Gate:** the owner watches the recording and says the stair feels right. If he does not, switch to Plan B (side-by-side ground flights).

## M1: The place (ground, shapes, no life)

Goal: a walkable, drawn Lighthouse Point, behind `?lighthouse=1`, with nothing alive.

- `lighthouseplan.js`: the levels, the plateau (strips round the cave), the cove, the cliff path flights, the pool shelf, the tower's plinth disc and gallery disc, colliders (tower 3.6, cottage, wall, rocks, boat, bell), bounds.
- `lighthouse.js` and `lighthouseparts.js`: cove and sea, cliffs, plateau, tower (stairless for now), cottage, garden, wall, six pools, cave, Gull Rock, beach dressing, evening look (`evening: true`, `duskLight`), the area record (`name`, `bounds`, `spawn`, `colliders`, `ground`, `waters`, `perches`, `pois`, `critterSpawns`, `scenics`, `collectibles`, `tippables`, `boxes`, `evening`).
- Registered as a loader and entry row in `areas.js`; `?lighthouse=1` starts a solo walk. No catalog row yet.

**Tests (new `test/lighthouseplan.test.js`, `test/lighthouse.test.js`):**
- `ground validates` (`validateGround`: ceilings clear, no strip over 1 in 3).
- `the spawn, every scenic, collectible, tippable and box is walkable` and `none stands in water or a collider`.
- `the plateau is walkable from the cove by the cliff path alone` (a flood fill on the real ground).
- `the cave is walkable to its back and out again, and its roof is not walkable from the plateau`.
- `no cell of the sea or a pool shelf's void is reached`.
- `the tower's skirt is blocked and the stair foot is open`.
- `deterministic: two builds are identical` (positions, counts).
- Budget: `['lighthouse', buildLighthouse, 280, 210, 62000]` in `AREAS`; measure and record the built numbers.

**Budget checks:** `npx vitest run test/budget.test.js test/areas.test.js test/lazybuild.test.js`; then `npm run build` and read the place chunk and the start-up lines. Gates: place chunk at most 45 kB gz at M1; start-up at most 709.6 (areas.js rows only).

## M2: The climb (stair, gallery, lamp room, beam)

- The three stair flights with two landings, the gallery railing walk, the base leap, the Long Leap gap, drops and climbs as data in `lighthouseplan.js`'s traversal spec; `validateTraversal` passes.
- The lamp room (glass, ceiling, lens, lever as a tippable with `build`), the beam cone and sweep patch, the halo, the evening sky pieces, camera clearance.
- The lamp job: pull the lever, lens and beam on, ship's horn, `lighthousejob` once a walk.

**Tests (`test/lighthouseclimb.test.js`, `test/lighthousebeam.test.js`):**
- `never stuck`: from every walkable spot there is a way back to the spawn by walking, stairs, hops and drops without Long Leap or Spring Paws; every golden mouse, find spot and discovery is reached from the spawn the same way.
- `the stair's flights join the ground at both ends and at each landing`.
- `the gallery is walkable all round and the lamp room is entered by its door`.
- `a drop from the gallery is at most 3 m and lands on a landing`.
- `the lever tips once; a partner's tip lights the lamp on this device` (`tipById`); `a resumed walk restores a lit lamp`.
- `the beam angle is a function of walk seconds and the room seed (two devices agree)`; `unlit has no beam mesh visible`.
- `no Math.random, Date.now or performance.now in the beam, the lever or the job`.
- Picture and recording of the climb and the lighting, day-golden and dusk, for the owner.

**Budget checks:** measured build against 280 / 210 / 62,000 and the aim 150 / 70 / 52,000; place chunk at most 55 kB gz; the Rooftops' and Seaside's measured numbers unchanged (a full `test/budget.test.js` run).

## M3: Life and things to do

- Gulls and crabs (existing critters), the keeper's cat, the kitten job (three hiding spots from the room seed, the scent trail, the follow rules), the six discoveries and their rules, three golden mice, five collectibles, the yarn ball, the rests, moments, the fog bell, the echo, the cottage window, the ship, sounds.
- All lines in both word sets; the place hint; `lighthousepages.js` and the journal pages; `AWARDS.lighthousefind` and `lighthousejob`.

**Tests:**
- `test/lighthousefinds.test.js`: `each find is found by its rule and not by anything near it`; `the first find ever pays 12 and says its line; later walks count once and say nothing`; `a resumed walk pays and counts nothing twice`; `two players each find it on their own save`.
- `test/lighthousekitten.test.js`: `the kitten waits, never runs off and never fails`; `each of the three hiding places is reachable`; `no state has a clock`; `nothing is sent to a partner`; `the kitten's follow stops at the cottage door`.
- `test/lighthousegold.test.js`: `three golden mice, ids valid, none beside a find, a collectible or a discovery; each reachable without skills`; `Clan totals 48 and Legacy 24`.
- `test/lighthousegoals.test.js`: `every daily goal the area lists can be finished` (tippables, box, critters, scenics); `createGoals still draws exactly three`.
- `test/lighthousewords.test.js`: every phrase exists in both sets, reads the same except the two set-word lines; the series-words and off-words snapshots updated for this place's lines only.
- `test/lighthousesound.test.js`: nothing plays and no AudioContext is asked for while muted.
- Journal: `JOURNAL_TYPES` and `LIGHTHOUSE_JOURNAL_TYPES` equal; the save sanitiser keeps the eight ids.

**Budget checks:** `npm run build`: start-up at most 712.0 kB gz; place chunk at most 65 kB (hard 100); `test/savesize.test.js` (under 150 kB); `UPDATE_*` snapshot drift reviewed by hand.

## M4: Into the game

- `CATALOG.areas.lighthouse` row (150 paws, after 2 Seaside walks, both editions), `walks.lighthouse: 0`, the place card and its picture, `STREET_PLACES`, `STREET_LAND`, the road `seaside-lighthouse`, `STREET_ICON`, label position, the gate pair `seaside-lighthouse` and `lighthouse-seaside`, `?lighthouse=1` becomes a shortcut, the 12 found-outfit spots and the keeper's cap, area rows (clouds, ambient, pawprints, marks, audio), the hint row first in `HINTS`.

**Tests:**
- `test/worldmap.test.js`: the circle clears every other circle and label; the road clears the Seaside, the Docks and the coast; `a Legacy save shows it too`.
- `test/gateways.test.js`, `gatewayspots.test.js`, `gatewaylook.test.js`: `the Seaside's new end stands on open sand 2.5 to 3.5 m inside the bounds`; `the Lighthouse's end arrives facing in, 3.65 m clear`; `a gate is live only once the catalog row exists` (as for the Rooftops).
- `test/progression.test.js`: `the offer is 150 after 2 Seaside walks`; `a save that walked ?lighthouse=1 owns nothing it did not buy`; `an old save loads with walks.lighthouse 0`.
- `test/foundspots.test.js`: 12 spots, none within 15 m of the spawn, none in water, none at a golden mouse or collectible; `validateFoundWear` passes for the cap.
- `test/budget.test.js`: the Seaside's `endsFor('seaside')` expectation gains `['seaside-lighthouse', 'signpost']`; its dressed numbers re-measured; a `lighthouse` merged row.
- Co-walk: `test/lighthousecowalk.test.js` (a partner's height on the stair, the lever, the same beam angle, found outfit follows `findsAgreed`).

**Budget checks:** start-up at most 712.5 kB (stop at 713.0); place chunk reported; the Seaside's dressed triangles under 30,000 or a deliberate, documented raise; `test/areaimport.test.js` (loading the chunk's modules paints no canvas and draws no random number).

## M5: Polish, pictures and device checks

- Look pass: tower stripes, lens rings, cliff strata, pool colours, golden hour sky, cave glow, the card picture.
- The owner's pictures: arrival, the climb, the lamp room with the beam lit, a rock pool, the cave, the kitten at the door, the world map with the new place.
- Device checks: an older iPad (frame rate), the iPhone (the owner reads it), a DualSense on the stair, the leap and the lever, TV mode (the beam's size, text legibility), touch on a phone (prompt length, lamp-room glass fade).
- Update the memory-style notes the owner keeps (a short status file) when merged.

**Tests:** the full suite once, after a load check and the owner's word; `npm run build` for the final sizes (start-up at most 712.5, place chunk, save size).

## Budget table to keep updated

| Check | Baseline now | Gate |
|---|---|---|
| Start-up gz | 709.4 kB | M1 at most 709.6; M3 at most 712.0; M4 and M5 at most 712.5; stop at 713.0; ceiling 720, never raised |
| Place chunk gz | none | M1 at most 45; M2 at most 55; M3 at most 65; hard 100 |
| Built meshes / casters / triangles | none | 280 / 210 / 62,000; aim 150 / 70 / 52,000 |
| Merged meshes / casters | none | 70 / 36 (re-pin at +12 % of measured) |
| Life (meshes, casters, triangles) | none | at most 10, 0, 3,500 |
| Seaside dressed triangles | 29,125 of 30,000 | under 30,000, or a deliberate raise |
| Save size | about 101 kB | under 150 kB |
| Flat trace fixture | unchanged | `git diff --exit-code` clean |

## Left to the builder

The exact layout numbers, the stair's pitch and landing heights, the beam's look, the cave's liner, the pools' colours, the keeper's cat's and kitten's fur, the cap's look, the exact find spots, and which of the three kitten hiding places the room seed picks.
