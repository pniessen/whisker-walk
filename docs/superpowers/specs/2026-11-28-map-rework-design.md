# World map rework: one continent, equal places, the Moon in the sky, the Reef at sea (design, 2026-11-28)

## Why

Owner feedback on Change place: "Jungle Lodge, Snowville, Moon etc. don't belong in the ocean." On the current map
(`img/map-rework/before.png`) the mainland is green land on the left and middle, but The Moon, The Jungle Lodge, Snowville
and The Reef are tiny islets floating in the blue strip on the right. Two later requests from the owner, through the
coordinator, widen the job:

- every place is drawn **the same size** (similar, within 25%): her old Clan areas (radius 150-170) were much bigger than the
  street places (46-90);
- the land should look like **real geography**: neighbouring places flow into one continent with natural borders, not round
  blobs with gaps; only genuinely separate places (the Moon in the sky, the Reef at sea) stand apart.

Place count, ids, unlock order, roads (the ten gateway pairs), cards, prices and names are unchanged. No game logic changes.

## What the map is made of today (read from the code)

- `src/worldmap.js`: the model. World 1700 x 880; her six board places (from `src/territories.js`, her 1000 x 700 drawing,
  radii 80-170), `STREET_PLACES` (r 46-90), `TOWN_PLACES` (the Rooftops, Market and Old House, r 46, on the town's rim),
  `GATE_PLACES` (Reef, Crystal Cave, Moon, Jungle, Snowville, r 46, drawn only once walked), `COAST` (the sea's west edge),
  `GATEWAYS` (ten roads, each one cubic from circle edge to circle edge).
- `src/ui/territorymap.js`: the drawing. Each place is a hand-wobbled blob with its own words; "islets" were soft blobs behind the
  three sea-side places. `src/countryside.js` + `src/ui/countryside.js` drew a patchwork of fields, hedges, lanes, ponds and
  trees in the gaps.
- `src/ui/mappan.js`: pan and zoom by viewBox only. Its limits are `WORLD_VIEW`; the zoom-out floor keeps the smallest tap target
  (the island's star, 92 across) at 44 px.
- `src/ui/placecard.js`: the card a tap opens. The mini-map (`minimap*.js`) is the in-walk corner map; it shares no data with this
  map, so it is untouched.

## The rework (layout A, shipped as the default)

**One radius.** Every place is r 84 (`PLACE_R`). Her six keep her order and stand within one grid step of where she drew
them; her river, lake, island, paths and bridge are drawn exactly as she made them. The island stays a small sub-pin of the
Pines (r 46) in its lake. Every place gets the same words (name 36, line 24, wrapped alike); the old three sizes are gone.

**One continent.** Each place is a patch of the same landmass: the ground nearer to it than to any other place (a Voronoi
patch, cut to the coast), with the shared border bent a little by hand, the same line from either side, and drawn as a soft
dashed ridge or forest edge. The patch is what a tap lands on. Her river, lake and paths run over it as natural dividers
and roads. The sea runs along the east and south; the coast has a sandy shore. The old patchwork of fields and the paper
rims and islets are removed (the patches are the ground now), which also pays for the new code.

**Geography (north is up).**

| Place | Where | Reason |
|---|---|---|
| Snowville | north row, between the Moor and the Treehouse village, over the Gorge | cold highlands on land, beside the Gorge and the Moor |
| The Jungle Lodge | north-east corner, east of the Greenhouse | warm side, next to the Greenhouse and Treehouse village |
| The Moon | up in the sky above the north edge, between the Fairground and the Farm columns | not in the sea: a moon-rock in a night sky, a hem of clouds where sky meets land, stars |
| The Moon-beam | a dotted line from the Park (where its gate is) up through the gap between the Fairground and the Farm and the Treehouse and the Greenhouse to the rock | reads as "up in the sky"; drawn only when the Moon is shown |
| The Reef | at sea off the south-east coast | the only place in the ocean: a scalloped patch of deep water with bubbles |
| The Crystal Cave | on land, south-west, level with the Docks | was a pennant by the Docks |
| Rooftops, Market, Old House | no longer on the town's rim: their own patches north-west, south-east and south-west of the town, each joined to it by its road | equal size leaves no room on a rim |

The row/column grid is 270 x 190 units so every name has room (the overlap test now covers every state and both word sets).
The world is 1840 x 920, with 240 units of sky above it (`WORLD_VIEW` is 1840 x 1160). The Docks-Seaside promenade now
runs along the south shore, under the Market.

## Candidate B (the alternative, not shipped)

`img/map-rework/layout-B.png`. Same continent and sizes, different geography: Snowville in the north-east highland corner
(with the Moon above it), the Gorge in the north row beside the Moor, the Rooftops directly north of the town, and the Jungle
Lodge on a south-east peninsula below the Seaside (the world is 1100 tall, the coast turns the corner).

| | A (shipped) | B |
|---|---|---|
| Snowville | north-centre, next to the Moor and Gorge, as asked | north-east corner |
| Jungle | north-east, warm side by the Greenhouse | south-east peninsula; makes the map 180 units taller, with the south-west corner empty |
| Moon beam | one clean vertical line through the Fairground/Farm gap | crosses the Farm's words |
| Roads | as before | same, plus a longer promenade |

A matches the owner's own description (Snowville north next to the Gorge/Moor, the Jungle warm and east near the
Greenhouse), keeps the map compact, and keeps the beam clean. B is a good alternative only if the owner wants the Jungle
on a southern coast.

## Pictures (headless, `tools/verify/verify-map-rework.html`, `scripts/record-page.mjs`)

All in `docs/superpowers/specs/img/map-rework/`: `before.png` (main), `layout-A.png`, `layout-B.png` (everything on,
everything walked, Clan words), `layout-A-fresh-save.png` (a fresh save: every place locked, everyday words).

## Budgets and tests

- Start-up (gzip): 673.85 kB of 720 (was 676.61; the removed countryside more than pays for the patches). The map is in the
  start-up bundle, so this is measured, not assumed.
- `test/worldmap.test.js` is rewritten around the new rules (same size within 25%, geography, no overlaps in every state and both
  word sets, roads edge to edge and in the open, camps clear of words, unlock facts kept); `countryside.test.js` goes with
  its module. `mappan`, `territories`, `homebase.map`, `worldmap.gates`, `gamepadnav-map` move to the new numbers.
  The series-words snapshots were re-recorded on purpose: only wrapping changed, plus the short lock line now shows
  on the three places that used to hide it.
- Pad hops: from the Docks, right is now the Market, and the Market's right is the Seaside.

## Decisions for the owner

1. Layout A or B (A recommended).
2. An iPad held upright (about 820 px of map) now shows a little under the whole width and pans a little, because the world
   is wider and the island star's 44 px floor binds. Everything else fits as before.
3. The countryside fields are gone. If the owner misses them, a few trees and flowers can be added back in the margins.
