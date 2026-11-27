# Map gateways (world-map step 3): finding and open question

Status: design stop, 2026-11-28. No code built.

## Finding: step 3 is already built and live

The brief describes a walk-through-the-edge gateway with a kind line, a fade, a room that stays together, unlock order and reduced motion. Main already has all of it:

- `src/gateways.js` holds 20 gate ends (`GATEWAY_ENDS`) for the 11 map roads in `GATEWAYS` (`src/worldmap.js`): town-park, park-fair, park-farm, town-docks, docks-seaside, town-roofs, town-market, town-house, seaside-lighthouse, farm-treehouse. Every road has both ends.
- `src/gatecross.js` (rules, words, `walkOnMove`, `decideWalkOn`), `src/world/gateway.js` (looks), and the `walkOn({ via })` entry in walk.js give: sign for a shut place, buy-at-the-gate card, "Off to ...!" moment, arrival at the twin gate, the room kept together (ask / have / walk-on), prefetch at 12 m, lazy area chunks, and a "Back to where I came from" button (572470bf).
- Border posts (`src/borderposts.js`) walk the Clan territories straight on the same way.
- Teleport gates (`src/teleport.js`, `TELE_ENDS`) already cover Greenhouse, Moon, Reef, Crystal Cave, Snowville and the Jungle, behind `?gates=0` to turn off.
- The memory note "steps 3 gateways ... not started" is stale. Plan: `docs/superpowers/plans/2026-11-20-world-map-step3-gateways.md`.

## What is genuinely not done

From `docs/superpowers/specs/2026-11-27-area-interconnectivity.md` (section 1.3, 1.4, 2):

1. Tele-gate places have no map road (Moon, Reef, Crystal Cave have no map circle; the Greenhouse has a circle but no road).
2. Tele gates refuse in an online room (`teleStatus` 'room') and in couch play ('coop'); map gateways do not.
3. Gate cap `TELE_PAIR_CAP = 6` is nearly reached.

These belong to the interconnectivity work (its options A to D), not to step 3.

## Owner decision needed (why no build)

Which of these does "Map gateways" mean now?

- (a) Give tele-gate places a map circle and a "go there" start at their gate (interconnectivity option D). Touches the crowded map.
- (b) Let tele gates carry an online room through (removes the `'room'` refusal; telehook I3 already added guest lookup).
- (c) Add a map road (plain walk-through gateway) for a place now behind a tele gate, replacing the swirl with the usual moment.
- (d) Nothing; step 3 is finished, mark the plan done.

## Constraints for whichever is chosen

Start-up must stay at or under 676.7 kB of 720; no area stage-A growth; code in lazy chunks; behind a default-off flag (like `?deep=1`) until the owner turns it on; `flat-trace.gameplay.json` must not move; nothing drawn from `walkRng`.
