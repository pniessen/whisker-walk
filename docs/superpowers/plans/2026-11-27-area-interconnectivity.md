# How the areas connect: current state, strains, options, recommendation

Status: **DRAFT for owner discussion (2026-11-27). Docs only; nothing here is built.** Written from the code on `main` at 0e122229. Every file:line below was read in that tree; where a fact comes from a plan or spec and was not checked in code, it says so.

Note on inputs: the brief names `docs/superpowers/plans/2026-11-23-teleport-gates-design.md`; the real files are `docs/superpowers/specs/2026-11-23-teleport-gates-design.md` (the design) and `docs/superpowers/plans/2026-11-23-teleport-gates.md` (the milestones). The draft Snowville / Treehouse village / Jungle lodge plan is **not in the repo**: branch `plans-newareas` is at 36990b4c, a merge commit that holds no such file, and no file in `docs` or the worktrees mentions those names. Section 4.4 therefore plugs the three areas in from their names alone and says what it assumes.

## 1. Current state

### 1.1 Four ways of getting from place to place

1. **Map gateways ("walk straight on")** between street places. Rows in `GATEWAY_ENDS` (`src/gateways.js:95-164`), drawn as roads on the world map (`GATEWAYS`, `src/worldmap.js:83-101`). Looks `signpost`, `fairgate`, `farmgate`, `promenade`, `alleydoor`, `none` (`src/gateways.js:59`). Each place has a twin end back.
2. **Border posts** between the Clan-Edition territories (`BORDER_POSTS`, `src/borderposts.js:46-88`): Town to Woods / Moor / River; Woods to Town / River / Moor; River to Woods / Town / Pines; Moor to Woods / Gorge / Pines; Pines to River / Moor; Gorge to Moor / Town (one way, `src/borderposts.js:84-87`). They also walk straight on (comment at `src/borderposts.js:90-99`).
3. **Teleport gates**, "gates" for short: a separate table `TELE_ENDS` (`src/teleport.js:86-128`), deliberately kept out of `GATEWAY_ENDS` so the map cannot see them (`src/teleport.js:10-12`). Six looks (`src/teleport.js:48`), a swirl of 1.2 s (`src/teleport.js:19`), a suit per destination (`src/teleport.js:199-231`). Switched on for everyone in a browser since 2026-11-26 (`src/teleflag.js:1,7-15`).
4. **Change place / the world map.** `worldMapModel` (`src/worldmap.js:120-144`) draws the Clan board's regions, the street places (`STREET_PLACES`, `src/worldmap.js:37-50`) and the town's rim places (`TOWN_PLACES`, `src/worldmap.js:65-69`). Tap a circle, get a card (`placeState`, `src/territories.js:114-140`), then buy or go. Pan / zoom is in `src/ui/mappan.js` (`MIN_TARGET_PX` 44, `MAX_ZOOM` 4, lines 20-22).

### 1.2 Every place, how it is reached, what unlocks it

Unlock rules are `CATALOG.areas` rows (`src/progression.js`): `requires: { area, walks }` means "N walks in that area". Price 0 means free when the walks are done.

| Place | Reached by | Unlock (progression.js line) | Way back | On the map? |
|---|---|---|---|---|
| Town (`neighborhood`) | start; Home | always | Home / Change place | Clan board (territory board region) |
| Park | gate `town-park` (`gateways.js:97`) | 50 paws, 2 Town walks (`progression.js:380`) | `park-town` (`gateways.js:113`) | yes, `worldmap.js:38` |
| Farm | gate `park-farm` (`gateways.js:115`) | 75 paws, 2 Park walks (`progression.js:388`) | `farm-park` (`gateways.js:123`) | yes, `:40` |
| Fairground | gate `park-fair` (`gateways.js:114`) | 75 paws, 2 Park walks (`progression.js:394`) | `fair-park` (`gateways.js:119`) | yes, `:39` |
| Rooftops | gate `town-roofs` (`gateways.js:99`) | 100 paws, 2 Fair walks (`progression.js:400`) | `roofs-town` alley door (`gateways.js:150`) | yes, on the town, `:66` |
| Market Square (Clan only) | gate `town-market` (`gateways.js:106`) | 150 paws, 2 Town walks (`progression.js:406`) | `market-town` (`gateways.js:157`) | yes, `:67` |
| Old House (Clan only) | gate `town-house` (`gateways.js:110`) | 150 paws, 2 Market walks (`progression.js:412`) | `house-town` (`gateways.js:162`) | yes, `:68` |
| Docks | gate `town-docks` (`gateways.js:98`) | 100 paws, 2 Park walks (`progression.js:442`) | `docks-town` (`gateways.js:126`) | yes, `:41` |
| Seaside | gate `docks-seaside` (`gateways.js:132`) | 200 paws, 2 Docks walks (`progression.js:417`); an old save may keep the cheaper Park-based offer (`areaoffer.js:16-18`) | `seaside-docks` (`gateways.js:135`) | yes, `:42` |
| Lighthouse Point | gate `seaside-lighthouse` (`gateways.js:138`) | 150 paws, 2 Seaside walks (`progression.js:422`) | `lighthouse-seaside` (`gateways.js:143`) | yes, `:46` |
| Greenhouse | tele gate `park-greenhouse` (`teleport.js:88`) | free, 2 Park walks, `gate: 'tele'` (`progression.js:427`); gate wakes at the same count (`teleport.js:27`) | tele `greenhouse-park` (`teleport.js:125`) | yes, circle with no road (`worldmap.js:49`) |
| Reef | tele gate `seaside-reef` (`teleport.js:106`) | free, 2 Seaside walks (`progression.js:430`) | tele `reef-seaside` (`teleport.js:111`) | **no circle**: not in `STREET_PLACES` (`worldmap.js:37-50`) |
| Crystal Cave | tele gate `docks-crystal` (`teleport.js:117`) | free, 2 Docks walks (`progression.js:433`) | tele `crystal-docks` (`teleport.js:121`) | **no circle** |
| Moon | tele gate `park-moon` (`teleport.js:92`) | 2 Park walks (`teleport.js:25`), **no catalog row at all**: it is a walk override and nothing is bought (`teleport.js:132-138`; `areas.js:64`) | tele `moon-park` (`teleport.js:100`) | **no circle**, no row |
| Woods, River, Moor, Pines, Gorge (Clan only) | border posts (`borderposts.js:46-88`) | free, 2 walks of the previous territory: Woods after Town, River and Moor after Woods, Pines after River, Gorge after Moor (`progression.js:443-447`) | posts back; Gorge to Town one way | on the Clan territory board |
| Den | Home | always; not in the catalog (`areas.js:22`) | Home | Menu tile, not on the map (`worldmap.js:16`) |

The brief's "Moon / Moor / Gorge territories" are three different things: the Moon is a gate-only place with no catalog row; Moor and Gorge are Clan territories with posts.

Hosts and their gates today: the Park carries two (Greenhouse west, Moon east), the Seaside one (Reef), the Docks one (Crystal). The Reef plan's own decision D3 describes the model: "found, `needWalks 2`, both editions, price 0, a world-map dotted mark (gate plan M5)" (`docs/superpowers/plans/2026-11-26-reef.md`, section 2).

### 1.3 What is built and what is only planned

- **Built:** all rows above, the gates' look, swirl, suit, prompt, twin-arrival, prefetch at 12 m (`teleport.js:261-283`), walk-on with the room kept together (`teleHandoff`, `teleport.js:189-197`).
- **Not built (gate plan M5, `docs/superpowers/plans/2026-11-23-teleport-gates.md`, "M5: map marks and unlock"):** map marks for gates (`TELE_LINKS` does not exist: a grep of `src` finds none), a "wake" beat and journal line for gates (the design promises one, `specs/2026-11-23-teleport-gates-design.md` section 3.6; not checked in code), "Go there" from the map starting at the destination gate (design section 3.1 / map text, not built; `placeState` offers only buy / go-here, `territories.js:114-140`).
- **Consequence today:** a child who has been through the Reef gate has no map circle for it, and the Moon has no row for any list to show. The only way back into the Reef, Crystal Cave or Moon is the gate again (the Greenhouse is the one exception, with a circle). This is the first thing any connectivity design has to settle.

### 1.4 Together and apart

- **Online room (co-walk):** a map gateway or border post walks the room on together by an ask / have / walk-on exchange (`gatecross.js:167-240`; header of `game/crossing.js:1-24`). A tele gate hands the room on too (`keepRoom`, `seedFrom`, `teleport.js:189-197`) but **refuses in a room for now**: `teleStatus` returns `'room'` (`teleport.js:163-172`), so an online pair cannot go through a tele gate together at all.
- **Couch co-op (two cats, one screen):** only the town is ready (`src/coop/table.js:4-9`); every other place, including all gate places, is `false`, and `teleStatus` returns `'coop'` unless both ends are ready (`teleport.js:170`).
- So "keep partners together across places" works today for walk-straight-on gateways and posts, and not for tele gates.

### 1.5 Costs

- Start-up gz: ceiling `MAIN_GZIP_CEILING_KB = 720` (`scripts/buildjson.mjs:35`); the Reef plan puts the tree at about 709 kB (section 1 of `2026-11-26-reef.md`), so **about 11 kB of headroom for everything that follows**.
- Per place: its own chunk, ceiling 100 kB gz (`areas.js:14-17`); the Fairground sits at 95.8 / 100 (memory note, 2026-11-21).
- Gates: the whole gate machinery is one lazy chunk under 30 kB gz (M1 notes, `plans/2026-11-23-teleport-gates.md`), fetched only behind the gates switch (`src/telehook.js:1-30`); each gate look is at most 6 meshes, 480 triangles and one transparent draw; a gate pair is capped at `TELE_PAIR_CAP = 6` pairs per release (`teleport.js:22`, a test constant). **Today there are four pairs** (Greenhouse, Moon, Reef, Crystal). Snowville, Treehouse and Jungle would make seven if each took a gate, which is over the cap.
- A walk-on loads the destination chunk on approach (12 m prefetch, `gateways.js:54`), so a gate costs nothing at start-up beyond table rows.

## 2. Strains at 15 to 25 areas

Counted today: 15 walkable places plus den, plus the Clan board's five territories and the Moon. Three more is 18-19. These strains get worse with each addition.

1. **Map crowding.** The world is 1500 x 880 units (`worldmap.js:31`), on a phone opened zoomed to about half; every circle must stay at least 44 px (`mappan.js:20,37`). The smallest circles already use r 46 (`worldmap.js:46,66-68`). The east of the map is full between the coast (`worldmap.js:77`) and the Park. Reef, Crystal and Moon have no space reserved; three more land circles would also have to be found room.
2. **Too many gates.** Four pairs are in; the cap is six (`teleport.js:22`); the spec itself says past six "the optional gate garden hub (a list board in one existing late place) is the next step" (design, section on risks). The cap is hit by the next three areas alone.
3. **Gate look variety.** Looks exist for ring, arch, hollow, cleft, grotto, hatch (`teleport.js:48`), roughly one per gate. Each new place wants its own natural look, and each look is a triangle budget inside a host that is already near its own ceiling.
4. **Kids facing everything at once.** Unlock is walk-count plus paws, one rule per place (`progression.js:388-447`). With Greenhouse, Moon, Reef, Crystal each waking at "2 walks" of an unrelated host, a child who plays the Park and Docks twice can see four new things at once, with no order and no story reason. The place-card list (`dressingroom.js:183`) and the "next thing" hints (`nextthing.js:104`) tell her only what a single place opens.
5. **Co-walk.** Walk-straight-on keeps partners together; gates refuse in a room and in couch play (section 1.4). The more of the world is behind gates, the more of it a pair cannot visit together.
6. **Return arches.** Every gate place needs its own home arch drawn by the destination (`own: true`, `teleport.js:46`). Fine for four; the Moon's, the Reef's and the Crystal's are each separate art. There is also no "go back where I came from" if a place has two ways in (a place reached by a map road and a gate has no memory of which one she used; the twin is fixed per row, `gateways.js:193-201`).
7. **Load / size cost per gate.** Small at start-up but each destination is one 100 kB chunk and the host's table and prefetch; real cost is **build / test / art time**, and the 720 kB start-up ceiling, not bytes at runtime.
8. **No sense of a "world".** Street places form a map with roads; Clan territories a drawn board; the gate places hang off hosts with no place on the paper. A child cannot say where the Reef is, only "the thing at the Seaside pier". The world-map plans promised "have the world make sense" (memory note, world map).

## 3. Options

These are not exclusive; section 4 combines them.

### A. Hub and spoke: one travel hub

A single place (a station, a balloon port, a ferry dock or a lantern post) holds every gate or a board of destinations.

| For | Against |
|---|---|
| One place to learn; gate count stops being a constraint; one return arch in each spoke that always goes to the hub. | The design explicitly chose "many, each in the place whose story it belongs to" because a hub cuts the Moon's "moonlit ring on the Pines island" and the Reef's pier in half (design, "One hub or many?"). A hub is one more place to build and keep inside the area ceiling, and it makes every trip a two-step. Co-walk and couch must work in the hub. |
| Fits "a list of places" well on a phone. | The "world" would be a hub, not a world. |

Fit: good as an **optional late addition once gates pass six**, as the spec already says; poor as the main model now.

### B. Regional clusters

Group places into regions that read as a part of the world and share a look, an unlock and a map page:

| Region | Members (today and planned) |
|---|---|
| Town and street | Town, Park, Farm, Fairground, Rooftops, Market, Old House |
| Shore | Docks, Seaside, Lighthouse, Reef, (Crystal Cave via the Docks) |
| Clan lands | Woods, River, Moor, Pines, Gorge |
| Sky | Moon |
| Underground / glass | Crystal Cave, Greenhouse |
| Snowy / forest / jungle | Snowville, Treehouse village, Jungle lodge (planned) |

Rooftops sit in the Town cluster but could also read as sky; the Moon is alone in its cluster today.

| For | Against |
|---|---|
| Gives the world a shape and a place on paper for every area, even a gate-only one. The unlock can open a cluster rather than a place. Fits the map as one page per cluster, keeping every circle at 44 px. | Needs a decision on where Greenhouse, Moon, Crystal and the three new areas live. A cluster with one member (Moon) feels thin. Needs map UI work (pages or zoom levels). |
| Each cluster can own one gate look and one hub gate (see C), so look variety is bounded. | |

### C. Chains: A to B to C

A place beyond a place beyond a place (Docks to Seaside to Lighthouse, today). Fits the "walk, then arrive" feeling and costs nothing new, but a long chain means a long walk to get home, and the Reef shows a chain of gates is not what the owner picked (a tele gate hosted in a place where its story is). Use **chains inside a region** (as today), not across regions.

### D. The map as the main way to travel; gates as story versions

Change place already is the world map (memory note, world-map step 2). Make "Go there" from the map the everyday way into every place she owns, and keep gates as the **first-time, in-world story moment** for gate places. This is the spec's own plan (design section 3.5: once a destination is hers, the map card starts a walk at the destination's gate, "the swirl replaced by the normal start; the suit is on").

| For | Against |
|---|---|
| Solves the biggest gap today: a gate place with no map circle has no re-entry except the gate. Kids' mental model "tap the picture, go". Co-walk through the map already works (the map starts a walk in a room by the existing paths); only the gate needs fixing. | The map needs circles for Reef / Crystal / Moon, inside a crowded picture (strain 1). A gate walked past each time becomes a set piece, not a necessity (a feature: it stays a story moment, not a chore). |
| No new place or unlock system. | |

### E. Regional map pages / zoom levels

Instead of one world picture at all zoom levels: a first view with the region badges (Town and street, Shore, Clan lands, Sky, Underground, and the new ones), tap a region to zoom to that region's places at readable size. The map already pans and zooms to a max of 4 (`mappan.js:22`) and opens at about half the world on phones; a "region zoom" is a preset view of the same data. No second map, so a `worldMapModel` extension, not a new screen.

### F. Unlock progression and a travel journal

- **Clusters open as she plays.** The unlock rules already chain: each place needs walks in the one before. Add the region to the rule rather than a bigger number: a region's first place opens after its host region is "seen" (see 4.2 for a sensible default).
- **A passport with stamps.** One stamp per place she has walked, drawn on a journal page. The data already exists: `state.walks[area]` counts walks per place (`progression.js` row keys are state.walks keys, `areas.js:12-13`). A stamp page needs no save field: stamp = `walks[id] >= 1`. Feeds the visit milestone mechanics already merged (memory note: visit milestones). The design promised a gate journal line (design 3.6); a stamp page generalises it. Risk: an "everything collected" page invites a checklist feeling and pressure on an 11-year-old and a 9-year-old; keep it a picture book, no counters or percentages, no "missing" slots (a gap is a hint, not a lock).

### G. Return and "go back where I came from"

Today a gate's twin is fixed (`arrivalFor`, `gateways.js:193-201`; the gate plan's M1-M4 rows). For a place with exactly one way in this is "back where I came from". For a place with two (a map road and a gate), or for a map-started walk into a gate place, Home is the fallback (the menu's home button, M3 notes). Options: (1) keep the twin rule and add a small "Back to <place>" button in the pause card, remembered in the walk session, not the save; (2) none, keep Home as is. Option 1 is cheap (a field on the session) and does not touch saves.

### H. Co-walk across a gate: follow the leader

The online model for map gateways is "the host chooses, everyone goes" with an ask / have / walk-on exchange (design section 3.3; `gatecross.js:167-240`). The same exchange can carry a tele gate; today it is refused on purpose (`teleport.js:169`) as milestone 0 kept it simple. Couch play is a separate problem: only the town is couch-ready (`coop/table.js:4-9`). Recommendation: do online first, treat couch as part of each place's own couch milestone (the spec says so, "Couch co-op readiness per destination").

## 4. Recommendation

### 4.1 Shape

**B plus D plus F, with E when the map fills, and A held back.**

1. **Regions as the organising idea (B).** Give every place a region id in data only (a `REGIONS` table, pure, in `src/worldmap.js` or a new leaf file). Nothing a child sees changes at first.
2. **The map is the everyday way to travel, gates are the story (D).** Every place she owns has a circle and a "Go there" card, including Greenhouse (has one), Reef, Crystal and Moon. Each gate keeps its story look and wakes the first time (design 3.2), but after that she can tap the map; she is never forced through a gate twice. This closes the gap in section 1.3.
3. **A picture-book passport (F).** One journal page of stamps per region, derived from `walks[id] >= 1`, no new save key, no counters.
4. **Regional zoom (E)** only when a region is too crowded at 44 px; the Shore region (Docks, Seaside, Lighthouse, Reef, Crystal) will be first.
5. **Hub (A)** only after seven pairs. The first six stay in the places that fit them (design recommendation, kept).
6. **Return:** twin rule as now; a "Back to <place>" on the pause card is optional (G option 1, S size).
7. **Co-walk:** lift the room refusal for tele gates so a room goes through together (H), before the next three areas add more gates.

### 4.2 Unlock progression (a default)

Keep the existing `requires: { area, walks: 2 }` rule (it works with saves, the tests and the "next thing" hints). Make each **region's first place** the gate that opens the region: after two walks of a place in the earlier region, the region's circle and gate wake together; later places in that region follow their own "walks in the one before" rule as today (Seaside after Docks, Lighthouse after Seaside). No new save field. Suggested chain (owner to confirm):

Town and street, then Shore (Docks, Seaside, Lighthouse), then Reef and Crystal as the shore's hidden places, Sky (Moon) and Underground (Greenhouse) as gift places after the Park. The three new areas each take one of the existing hosts as their first step.

### 4.3 Phased milestones

Sizes follow the plans' convention: S about 1 to 1.5 h and under 250 lines, M about 3 h and 250 to 600 lines, L longer. No milestone adds a save key or touches `SAVE_VERSION` (4), and each keeps start-up growth under 0.5 kB gz (the 720 kB ceiling stays; the Reef plan's allowance and measure-then-set rule apply).

| # | Milestone | What | Size | Needs | Does not break |
|---|---|---|---|---|---|
| I0 | Region data | A pure `REGIONS` table (place id to region id, region name in both word sets), a test that every `CATALOG.areas` id and `TELE_ENDS` place has a region | S | nothing | no visible change; saves untouched |
| I1 | Map circles for gate places | Reef, Crystal and Moon circles in `STREET_PLACES` or a new `GATE_PLACES` list (shown by `areaShown`, `edition.js:44-47`); the Moon needs a catalog row or a model-only entry (`teleport.js:132-138`); each gets a pennant look, a hit radius at least 44 px; `worldmap.test.js` placement and tap-size checks | M | I0; owner picks places on the map from a picture | saves (no new key); `COOP_READY` already lists all three (`coop/table.js:8`); the card must not say "Get it?" for a price-0 place |
| I2 | Map "Go there" for a gate place | A walk that starts at the destination's gate (design 3.5) so the suit and arrival work the same; `placeState` stays pure | M | I1; gate M5's "go" wiring | gate tests, guided walk and tour exclusions (design section on exclusions) |
| I3 | Online room through a tele gate | Replace the `'room'` refusal (`teleport.js:169`) with the existing ask / have / walk-on exchange, a guest without the place borrows it (design 3.3) | M | I2 | room tests; older-build fallback (design risk table) |
| I4 | Passport page | One journal page of stamps per region from `walks`, in both word sets (everyday words: no series words), a quiet new-stamp toast; no counters | S | I0 | journal render tests; banned-word scan; nothing saved |
| I5 | Wake beat and journal line for gates | Gate plan M5 (not built): the first touch, a chime, a journal line | M | none (independent) | gate tests |
| I6 | Region view on the map | Region badges and tap-to-zoom, driven by `REGIONS`, in the lazy map code | M | I1; only if the map is too crowded | pan / zoom tests (`mappan.js`), pad focus order |
| I7 | "Back to <place>" | Remember the entry place in the walk session; a pause-card button | S | none | pause card tests |
| I8 | Hub board (only past six pairs) | A list board standing in one late place, calling the same walk-on | L | I3 | the pair cap test (`TELE_PAIR_CAP`, `teleport.js:22`) |

Order: I0, I1, I2 and I5 first (they close the gap that exists today), then I3 and I4, then I6 and I7 as needed. I8 is held back.

### 4.4 Where Snowville, Treehouse village and Jungle lodge plug in

The draft plan for these three is not in the repo (see the note at the top), so this is by name only and assumes each is a normal walkable area: an entry in `AREA_LOADERS` and `AREA_ENTRY_MODULES` (`areas.js:39-102`), a `CATALOG.areas` row, a `walks` key, a `COOP_READY` row (a test fails if missing, design section 2), a per-place budget row, and its own chunk under 100 kB gz.

| Area | Region | Entry | Notes |
|---|---|---|---|
| Snowville | Snowy (new region) | A **map gateway** (walk straight on) from the Town's free east/north edge or the Park, or a tele gate if it must feel remote | Needs a map spot; snowy suit-free; likely the first member of its own region |
| Treehouse village | Forest, joined to the Clan lands' Woods or Pines | A **climb** (an 'inside' row, as the Rooftops fire escape, `gateways.js:145-150`) from the Woods or Pines, not a tele gate | Keeps the gate count at four; fits "reach it by climbing" |
| Jungle lodge | Jungle (new region) | A tele gate from the Greenhouse (a jungle hung off glass is natural) or from the Farm | Would be pair five, under the cap of six |

This keeps the tele-pair count at five at most, under `TELE_PAIR_CAP`, with the other two entered by an ordinary gateway or a climb. All three get map circles (I1 pattern) and stamps (I4) for free once `REGIONS` has them. A fourth tele pair after these goes past the cap and triggers I8.

## 5. Open questions for the owner, each with a recommended default

1. **A passport with stamps for the children?** Default: **yes, as a picture book, no counters or percentages, derived from places she has walked, nothing saved** (I4). The owner's spec anti-goals are written around an 11-year-old and a 9-year-old; a missing slot must be a hint, never a nag.
2. **Hub or gates?** Default: **keep gates in their places, no hub** until pair seven (the design's own rule, `specs/2026-11-23-teleport-gates-design.md`), and raise the pair cap only by a conscious decision at six.
3. **Do gates stay as story moments once the map can take her there?** Default: **yes**: first time through a gate is the story and the wake; afterwards the map's "Go there" is the everyday way and the gate is still there to use (I2).
4. **Should Reef, Crystal Cave and the Moon get map circles?** Default: **yes, all three, small pennants off the coast and the top margin (design 3.5), shown once she has walked them** (I1). The alternative is leaving them gate-only, which strands a child who forgets where the gate was.
5. **Should the Moon get a catalog row?** Default: **yes** (price 0, `requires` Park 2 walks, `gate: 'tele'`) so lists, hints and the map all work; the design held it back only because a row adds a home-base card (`teleport.js:23-24`), and `areaShown` already hides gate-only rows (`edition.js:44-47`). Needs the golden mice and the journal counts checked (`edition.js:45` notes the Moon is counted by `areaInEdition`).
6. **Regions**: are the groupings in section 3B right (especially Greenhouse with the Crystal Cave, the Moon alone, the Rooftops in town)? Default: as listed; one place per region is fine.
7. **Online rooms through a gate**: lift the refusal (I3) before the three new areas? Default: **yes**, it is the strain most likely to disappoint a pair.
8. **Couch (two cats) through gates**: wait for each place's own couch milestone? Default: **yes** (`coop/table.js:4-9`); show the existing "not yet for two cats" line.
9. **"Back to where I came from" button** on the pause card? Default: **yes, small** (I7), session only.
10. **The three new areas**: confirm the entries in 4.4, or point me at the draft plan (it is not in the repo; branch `plans-newareas` has no such file).

## 6. Risks

- The 720 kB start-up ceiling has about 11 kB left; regions, the passport and the circles are all data and lazy map code, none should exceed 0.5 kB each, but the tests that measure the start-up bytes must run per milestone (the gate plan's own rule).
- Adding Moon / Reef / Crystal circles can disturb `test/worldmap.test.js` placement checks; place each from a map picture, as the Lighthouse's was (`worldmap.js:43-45`).
- A catalog row for the Moon changes the golden-mice and journal totals' inputs (the total counts through `areaInEdition`, `edition.js:44-47`): verify before merging.
- Passport and regions must read the same in the everyday word set; words go in both tables and the banned-word scan.
- Nothing here changes `SAVE_VERSION` or a key list; if a later step wants one (a favourite place, a stamp date), it goes through `catmerge` rules as the Reef's did.
