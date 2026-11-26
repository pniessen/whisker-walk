# The Greenhouse: remaining milestones (G2 to G7), 2026-11-26

Supersedes the milestone numbering and the budget gates of `2026-11-22-greenhouse.md` (that file stays the reference for tests, file map and design). Spec: `docs/superpowers/specs/2026-11-22-greenhouse-design.md`.

## Where main really is (verified 2026-11-26)

Merged behind `?greenhouse=1`: **M0** (one glass house, mist, shafts, dapple, pond, `greenhouseglass.js`) and **M1** (real palms and plants, koi, the Park's fountain court, potting bench, kitchen bed, eight garden pots, **the seeds job and the watering job** in `greenhouselife.js`, tests `greenhousegame/glass/jobs/plants`). Budget rows exist (`['greenhouse', buildGreenhouse, 280, 210, 62000]`; merged 33 / 5). A teleport-gate spike `park-greenhouse` / `greenhouse-park` exists behind `?gates=1`.

**Not built:** shed, perches, catnip beds, collectibles, tippables, rests, scenics, boxes, critter spawns, moments, spawn gate court, outer trees and hedges; the six finds, pages and awards; golden mice; the found outfit; the real gate and unlock; sound; polish; stage B rooms.

Changes since the 2026-11-22 plan: (1) teleport gates exist, so the Farm-road `farmgate` plan is replaced by a gate decision (G4); (2) owner rules of 2026-11-26: milestones merge behind the flag on automatic checks, budgets are **measured then set** (area row at measured +12 percent, no stop inside headroom), start-up ceiling may rise up to 5 kB for this area (report it), release-candidate look once per area; (3) `GOLD_TOTAL` is already 51 / 27 (Moon), so the Greenhouse makes **54 / 30** and the Reef later 57 / 33.

## Milestones

Each: own worktree and branch off main, `git add` exact paths, flat-trace fixture untouched (`git diff --exit-code test/fixtures/flat-trace.gameplay.json`), no change to `traversal.js` / `traversallive.js`, both word sets, focused tests plus `npm run build`, merge behind `?greenhouse=1`.

| M | What | Size | Needs |
|---|---|---|---|
| **G2 Seams** | `greenhousepages.js` (six find ids, page ids, journal types, start-up data), `AWARDS.greenhousefind` 12 and `greenhousejob` 25, `discoveries.js`, `JOURNAL_TYPES`, `GOLD_MICE.greenhouse` rows (3 spots, `GOLD_TOTAL` 54 / 30 and the area-list tests, as the Moon's M4 did), `catmerge` untouched unless a new key appears (none planned: jobs stay per device, `walks.greenhouse` already exists), `greenhousefind` journal sanitiser keeps ids, `greenhousewords.js` skeleton in both sets. Start-up growth measured and reported (expected under 1 kB). | S-M | nothing |
| **G3 The garden fills** | Spawn court and gate stub, shed (door west, roof perch, three-hop climb), perches, catnip beds (`eat` rests), sunbeam and bench `nap` rests, fountain `drink` rest, collectibles 5, tippables 6, box, critter spawns (frogs, sparrows), moments, scenics 3 (stage A), outer trees and hedges, horizon, yarn ball, the three stage-A finds (`palm`, `koi`, `catnip`) and their rules, goals test, rain shelter (`setSheltered`) under the Palm House, area record completed. Budget row re-measured and set. | L | G2 |
| **G4 Into the game** | The gate and unlock (decision below), world-map place if the host needs one, 12 found-outfit spots and the gardener's hat (not a second straw hat), area rows (clouds, ambient, pawprints, marks, audio), hint row, card picture, `?greenhouse=1` becomes a shortcut, co-walk test. Flag stays until the release pass (R-pass below). | M | G3, advisor answer |
| **G5 Sound and life polish** | `greenhousesound.js` (drips, trickle, birds, rain patter; silent when muted), sparrow bath, frog plops, reduced-motion pass, banned-word and word-parity scans. | S | G3 |
| **G6 Stage B rooms** | Orchid Room, Cactus House, Butterfly Room, stream bed, four chaseable butterflies and the ambient cloud (`GH_BUTTERFLY_SALT`), three finds (`orchid`, `cactus`, `butterfly`) and pages appended, three scenic spots, room seed and pot spot sets as new sets (stage A sets unchanged). Budget row re-measured. | L | G3 |
| **G7 Release pass** | Beauty rounds by pictures (cheap tools first), iPhone 18 / iPad / TV readings via the perf readout, DualSense pass, iPad 7 start-and-play at the lowest rung, one co-walk, **owner's single look**, then the flag comes off. | M | G4 to G6 |

**Order and parallelism.** G2 first (it is the shared-seam milestone: `progression`, `goldmice`, `discoveries`, journal). The Reef's R0 seams start only after G2 has merged. G3 and G5 touch only Greenhouse files after G2 and can overlap with the Reef's R0 (at most two builders, one vitest suite at a time).

## Budget (measure, then set)

Planning figures only, none a gate: place chunk about 50 kB gz at stage A, 55 at stage B; built 150 / 70 / 52,000 aim (ceiling row 280 / 210 / 62,000 stays until measured, then the area row is set to measured +12 percent); merged 33 / 5 now, re-set per milestone; life at most 12 / 0 / 3,000; Farm triangles unchanged if no Farm gate is cut. Automatic guards that still fail the build: chunk 100 kB, start-up ceiling 720 (up to 5 kB rise allowed for this area, reported), save under 150 kB, no existing place's ceiling raised, flat trace and shared traversal code unchanged. Every milestone's merge note lists measured start-up, chunk, built numbers and the row it set.

## Decisions for the advisor window (queue in `decisions.md`)

1. **How is the Greenhouse reached?** Spec says a catalog row (100 paws, after 2 Farm walks) plus a Farm `farmgate` road. Teleport gates now exist (Moon: no catalog row, `needWalks 2`, price 0, `own` return ring; spike `park-greenhouse` already in place). Which host (Park vs Farm), which look, price 0 plus needWalks or the 100-paw row, and does it need a world-map circle?
2. **Save shape.** Confirm no new `state.greenhouse` key (jobs per device, `walks.greenhouse` only) and that appending stage-B journal ids later is safe for the sanitiser and `catmerge` on old saves.
3. **Shared-seam order.** Confirm Greenhouse G2 (gold totals 54 / 30, journal types, awards) before Reef R0 is safe, and that the Reef's 54 / 30 becomes 57 / 33.
