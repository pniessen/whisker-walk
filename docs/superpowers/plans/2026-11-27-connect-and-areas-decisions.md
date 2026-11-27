# Connect and areas: binding decisions (2026-11-27)

Advisor window (Opus) over `2026-11-27-area-interconnectivity.md` and `2026-11-27-new-areas-snowville-treehouse-jungle.md`, checked against main at 10d88027. The owner's one-word answers are marked "owner to confirm"; nothing below is built.

## Corrections to the drafts

- Start-up headroom is about 59 kB (660.7 of 720), not 11 kB.
- `src/world/pathride.js`, `crystalstages.js` and `promptarbiter.js` are on main.
- Wave 2 is half merged: the Crystal half of X0 is in (`forge`/`songs`, `ccboat` ids, `gm-crystal-4/5`, GOLD_TOTAL 64); the Moon half was not (no `relay`, no `mnstation`, no `gm-moon-4`, Moon ceiling still 135). The Moon half is now in progress.
- `GOLD_MAX_COUNT = 72` is at `src/progression.js:135`.
- The new-areas plan exists on main.

## 1. Interconnectivity

- **Regions as data (owner's grouping, 2026-11-27):** a pure `REGIONS` table with five regions: **Urban** (Town, Park, Rooftops, Market, Greenhouse); **Suburban and rural** (Farm, Fairground, Old House, Treehouse village); **Shore** (Docks, Seaside, Lighthouse, Reef, Crystal Cave); **Clan lands** (Woods, River, Moor, Pines, Gorge); **Faraway** (Moon, Snowville, Jungle lodge). The Treehouse gate stays in the Park, so it crosses from Urban into the rural region; Snowville's archway at the Farm and the Jungle's stone ring at the Greenhouse lead into Faraway. A test fails if any catalog place or `TELE_ENDS` place has no region. (The advisor had proposed four regions with the Greenhouse in Town and fields and the Fairground, Farm and Old House there too; the owner split Town and fields into Urban and Suburban/rural.)
- **The map is the everyday travel, gates are the story:** a map "Go there" starts at the place's normal spawn (`suitFor(areaId)` already dresses her by place, so milestone I2 is almost nothing).
- **Map circles for Reef, Crystal and Moon:** shown only once `walks[id] >= 1`, so the map never gives away a gate before she finds it. Greenhouse circle unchanged. Rough spots: Reef out in the sea east of the coast, Crystal as a small pennant near the Docks, Moon in the top margin; final spots from a map picture. Risk: placement checks in `test/worldmap.test.js`.
- **Moon catalog row** (after the Moon's wave 2 X0): `{ price: 0, requires: { area: 'park', walks: 2 }, gate: 'tele' }`, and remove the special Moon case in `placeLive`. Risks: a walk into the Moon changes from "visit once" (override) to "take", so 'moon' joins her places; a Moon card appears in the home-base picker; the equality test with `MOON_NEED_WALKS` moves.
- **Passport:** a journal page worked out from `walks[id] >= 1`. No new save key, no sanitiser or `MERGE_RULES` change. The "new stamp" toast fires when a count goes 0 to 1 and lives only for the session. No counters, no empty slots.
- **Back to where I came from:** small. Pass `cameFrom` through `startWalk` options (session only). Only after a gate or gateway, only solo or the room host, same crossing path.
- **Online-room gate refusal:** lift it, but four things break: (1) `gatecross.liveEnd` knows only map gateways and posts, so `decideWalkOnAsk` answers `to: null` and the guest never follows; fix with a gate lookup from `telehook` or about 0.3 kB of gate ids at start-up; (2) a partner on an older build says `WALK_ON = 1` but cannot plan a gate id: raise to 2 and send rooms with any version-1 member to the `endsHere` fallback; (3) a guest with gates off or the gate code not loaded must answer `ok: false` so the host gets a clean no; (4) whether a gate is awake stays the host's check, a guest who has not opened the place just visits it.
- **`TELE_PAIR_CAP`:** raise to 8. A hub is reconsidered at the ninth pair.

## 2. New areas

- **Gate hosts and looks:** Snowville: Farm archway with an icy disc tint (`discTint`), no snow on the Farm. Treehouse: Park hollow (the Park's third gate). Jungle: Greenhouse stone ring. No new look names; no host may be the Fairground.
- **Shared seams milestone N0, one commit:** `TELE_PAIR_CAP` 8; `GOLD_MAX_COUNT` 120 (not 80); gold totals re-pinned once to 74 Clan / 50 everyday, counted after wave 2's 65 / 41; journal prefixes `sv`/`sw`, `th`/`tl`, `jl`/`jw` (none taken; 51 ids, 17 per area, in new arrays); save keys `snowville`, `treehouse`, `jungle` in the sanitiser, `MERGE_RULES`, `BASE_WANTED` and defaults; flags `?snowville`, `?treehouse`, `?jungle`; couch rows false; SAVE_VERSION stays 4.
- **Build order:** Snowville, Treehouse, Jungle. After N0, the two world milestones (V1 and T1) run in parallel. The three gate commits go one at a time (they share `teleport.js`). Finds and life never run together within one area.
- **Budgets:** each area adds at most 1 kB to start-up (5 kB ceiling; past 680 kB stop and tell the owner). Area chunks 65 kB per stage, 150 total. The Fairground chunk (96.4 of 100 kB) must not be touched: no shared imports from its files. Farm, Park and Greenhouse re-measured after their gate goes in.
- **Jungle:** no swimming; the river is shallows and bridges.

## 3. Sequencing

1. Now, alongside wave 2: the room-gate fix (I3), the regions table, circles for Reef and Crystal (they touch `gatecross.js`, `crossing.js`, `worldmap.js`, which wave 2 does not).
2. Then wave 2's Moon X0 (Moon ceiling 150 kB), then the Moon catalog row and circle.
3. Then N0, after wave 2 has fully merged, so the gold totals move once. Then the areas.

Pinned tests that will move: about 17 gold-total files, `teleport.test.js:76` (pair cap), tests expecting a gate in a room to be refused, the JOURNAL_TYPES slice tests (find by first id), `lazybuild.test.js`, the worldmap placement tests.

## Owner questions (one-word answers; owner to confirm)

Interconnectivity: 1 passport Yes; 2 hub or gates Gates; 3 gates stay story moments Yes; 4 map circles for Reef, Crystal, Moon Yes; 5 Moon catalog row Yes; 6 regions Five (owner's grouping above); 7 online rooms through gates Yes; 8 couch play through gates Wait; 9 Back button Yes; 10 entries for the three new areas Plan's.

New areas: O1 gate cap 8; O2 Snowville season Always; O3 Treehouse entry Park; O4 Jungle Separate; O5 daughter names the characters Yes; O6 build order Snowville-first; O7 rides Later; O8 cheeks theme Tint-only; O9 both editions Yes; O10 flags default on Yes.

Wave 2: Moon ceiling 150 kB: Yes.

## Main risks

A partner on an older build can split a room at a gate. A missed sanitiser key silently drops save data. The Treehouse camera among decks and leaves.
