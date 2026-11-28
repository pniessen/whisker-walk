# Fairground staging (design, 2026-11-28)

**Problem.** The Fairground download is 99.5 of 100 kB gzipped (`npm run headroom`; `AREA_ENTRY_MODULES.fair` = fair.js, fairlive.js, fairshow.js, people/index.js). The Viking boat (est. 5-7 kB), 1-2 more rides and the couch ride code have no room. Triangles are a separate wall (74.3k of 75k): staging frees bytes only.

## Where the 99.5 kB goes (measured, `npm run build`, sourcemap attribution)

| Part | kB gz | Chunk |
| --- | ---: | --- |
| fairrides.js (ride meshes and ride data) | 11.1 | fair.js chunk (31.6) |
| fairparts.js (stalls, fences, lights) | 9.4 | fair.js chunk |
| fair.js (layout, build) + fairedge.js | 9.3 + 1.8 | fair.js chunk |
| fairkit, farmshapes, park, parkfountain, holidayspots | 4.8 + 2.4 + 8.8 | shared chunks |
| fairsim.js (ride rules) + fairlive.js | 4.9 + 3.0 | fairlive chunk (8.0) |
| fairvisitors (crowd) + fairshow + fairgames | 5.1 + 4.8 + 3.1 | fairshow chunk (13.0) |
| farmsim.js (only the show needs it here) | 7.5 | shared chunk |
| people/index.js (people kit, shared with Market and others) | 23.6 | shared chunk |

Sounds, mice and finds are not in this download (walk extras and the start-up chunk). The couch ride code, `src/coop/rides.js`, is in the **coop chunk** (18.6 of 25 kB), not the Fair chunk, so it costs the Fair nothing; it reads seats from fairsim.js (`jumpTarget`).

## How the other places stage

Reef, Crystal, Snowville, Treehouse, Jungle and the house wing use *awaited* stages: the loader in `src/world/areas.js` does `Promise.all([landing, loadXStages()])`, so every stage is in before `build()` runs. The child sees and waits for exactly what he did before; only the per-chunk accounting changes (stage A under 100 kB, each stage under 65, all under a total of 120-150, rows in `STAGED_AREAS`). Only the Moon fetches in the background, with fade-in machinery (moonlate.js, about 4 kB). Fair rides are visible from the spawn and the crowd is part of the first picture, so a background stage would change what the child sees: **not recommended**. Reuse the awaited way.

## Recommended split (awaited, nothing visible changes)

- **Stage A (landing):** fair.js without ride meshes, fairlive.js + fairsim.js, people kit, and a small ride-data seam (dimensions, `coasterTrackPoints`, `helterSlidePath`, `trackPose`, `setOnTrack`: about 1 kB, kept in A because the world constants and the sim use them).
- **Stage `show`:** fairshow.js (crowd, games, the show) with farmsim.js.
- **Stage `rides`:** the ride mesh builders (merry-go-round, wheel, teacups, helter-skelter, coaster track, train, station, music box) in a new `src/world/fairstagerides.js` that fills `ST.rides` (the `reefstages.js` seam: `fairstages.js` exports `ST` and `loadFairStages()`). New rides (the Viking boat) are added here.

| Piece | Today | After show split (M1, measured) | After rides split (M2, estimated) |
| --- | ---: | ---: | ---: |
| A | 99.5 | **79.1** | ~69 |
| show | - | 20.4 | 20.4 |
| rides | - | - | ~10 |
| all together | 99.5 | 99.5 | ~100.5 (seam adds ~0.5 per stage) |
| A headroom (of 100) | 0.5 | 20.9 | ~31 |

The M1 numbers are measured from the real manifest (areaDownloads over the new entry lists, not committed). M2 is estimated from the source split (ride data is about 9% of fairrides.js raw). Fitting the new rides: the boat (~6 kB) and two more rides (~12 kB) land in `rides` (~28 kB, far under 65); the sim rules for each ride add about 1 kB each to fairsim.js in A (~72-75 kB). All stages ~115-120 kB, under a 150 total. The couch ride rows add little to the coop chunk (6.4 kB free).

## Decisions for the owner

1. **Staging versus a higher ceiling.** Default: stage (M1 now, M2 with the first new ride). A one-line raise of the Fair ceiling (as start-up went 700 to 720) is cheaper but buys only the raise, and it adds download for every place visit to the Fair.
2. **Triangles.** Default: ask separately, before the boat; the 75,000 ceiling is the next wall and staging does not move it.
3. Background stage for the far side of the fair: default no.

## Tests to change

- `scripts/buildjson.mjs`: `STAGED_AREAS` rows `fair` (stages `show`, then `rides`); `AREA_ENTRY_MODULES.fair` in `src/world/areas.js` loses `fairshow.js`; areas.js loader awaits `loadFairStages()`.
- `test/lazybuild.test.js` loops `STAGED_AREAS` (no edit, new rows checked: lazy, non-empty, under ceilings); `test/stageretry.test.js` expects `src/world/fairstages.js` + `loadFairStages` (add them); `scripts/headroom.mjs` `HEADROOM_STAGED` gets `fair`.
- `test/areacoverage.test.js`: unchanged (entry modules stay non-empty).
- M2 only: tests that call `build()` from fair.js directly must `await loadFairStages()` first: `fair.test.js`, `fairsim.test.js`, `fairjumps.test.js`, `fairgrounds.test.js`, `fairstalls.test.js`, `fairlights.test.js`, `coopm5fair.test.js`, `budget.test.js` (fair row), `areas.test.js`, `mergeprops.test.js`, `ambient.test.js`, `foundspots.test.js`, `wadingroutes.test.js` and the other files that import `world/fair.js`. Put the await in one helper.
- Flat traces and area budgets are unaffected: the build output is identical (`test/fixtures/area-budgets.json` fair row: same meshes and triangles; `flattrace*` have no fair row). Confirm with `test/fair.test.js` pins.
- Rule: never put code in an empty stage; each stage ships real modules from its first commit.

## Milestones (small builders)

1. **F1 show stage:** `STAGED_AREAS` row, entry-module edit, `fairstages.js` with `loadFairStages`, stageretry and headroom rows. No src logic change. Check: build log shows A about 79, show about 20.
2. **F2 ride-data seam:** move constants and track math out of fairrides.js into fairridedata.js (stays in A). Pure move, tests unchanged, size neutral.
3. **F3 rides stage:** mesh builders to `fairstagerides.js` via `ST.rides`; `build()` reads from ST; tests await the loader. A about 69, rides about 10.
4. **F4 Viking boat:** mesh in rides, rules in fairsim.js, couch seats in coop/rides.js (after the triangle decision).
5. **F5, F6:** the next rides, same shape.
