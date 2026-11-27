# Whisker Walk: beauty backlog

Drafted 2026-11-26 against main at 1b51b9e2. A ready, ranked, launchable list of beauty passes, so that an idle jobsite always has something good to run.

Sources: `npm run build` output (kB), a one-off build of every area through the `test/budget.test.js` counting function (meshes, casters, triangles), the budget rows themselves, `git log` (beauty / polish commits), `docs/superpowers/plans/*polish*`, `src/musicthemes.js`. Anything hand-counted or guessed is marked **(est.)**. Sizes in the headroom tables come from `npm run build`; a `npm run headroom` script is being queued, and when it lands it replaces the hand-copied numbers (re-measure with it, do not trust this file's numbers after the next wave).

## 1. How the backlog is used

**Priority rule (owner, 2026-11-26): beauty passes are FILLER.** Order of work:

1. **Intentional queue**: in-flight waves, new areas (Snowville, Treehouse, Jungle, ...), interconnectivity, wave-2 milestones.
2. **Small enablers**: the headroom script, staging moves that free room, test/CI fixes.
3. **Beauty filler**: this file.

A beauty pass never blocks or delays a queued build, and never takes a builder slot that a queued build could use. If in doubt, the queued build wins.

**Idle rule.** When no builder is free for items 1 and 2 and a slot is open:
- pick the top **unblocked** entry in the ranked list (section 3) that does not touch files an active builder touches (check `git worktree list` and each live branch's `git diff --name-only main`; shared files such as `src/render/sky.js`, `water.js`, `dusk.js` are the usual clash);
- max 3 builders at once, counting queued builds first;
- one entry per builder, one commit, merged and pushed under the standing autonomous-merge rule;
- log the pass in section 8 with date, commit and kB; strike or re-rate the entry.

**Standard rules every entry carries (the "STD block").** A lean-builder runs an entry unchanged if it follows these:
- Instanced or merged into the area's existing material buckets; the entry states a **draw-call cap** (usually 0 new meshes, max +1 noCast mesh). Per-vertex colour beats new meshes; new meshes cost draws, triangles are cheap (docs/VISUAL-PASS.md section 0).
- Animation freezes under reduced motion (shown still, not removed). LOW/LITE tiers draw less: drop the layer or halve its counts.
- Randomness comes from the pass's **own seeded stream** (not the walk's shared stream), so every existing seeded layout stays put.
- No banned words (`src/blocklist.js` and the owner's list); any new visible text exists in **both word sets** (Clan and everyday; `src/wordset.js`).
- The entry's budget line is stated; the pass re-pins the area's row in `test/budget.test.js` to measured +12% if it moves, and a staged area's ceiling in `scripts/buildjson.mjs`.
- Focused tests for changed files, then `npm run build`. A picture page `verify-<area>-beauty.html` (as the Crystal, Reef and Moon rounds did) shows before and after.

**Sizes.** S = one builder, one session, one or two files. M = two or three files or a shader plus data. **Impact** H/M/L is an estimate of how much a child notices it walking normally. **Rank score = impact / size** with H=3, M=2, L=1 and S=1, M=2 (so H/S = 3, M/S = 2, H/M = 1.5, M/M = 1, L/S = 1, L/M = 0.5). BLOCKED entries go last regardless of score.

## 2. What makes an area rich (checklist)

Score an area against these before picking a pass; the weakest line is the next pass.

1. **Ground variation**: at least three ground tones plus wear (paths, dust, mud, litter) and edge shading where ground meets objects.
2. **Mid-height clutter**: shrubs, crates, tubs, flowers between ankle and shoulder height, in clumps not in rows.
3. **Vertical interest**: something tall on every sightline (trees, chimneys, flags, towers), and a distinct skyline.
4. **Colour accents by zone**: each zone of the area has its own accent hue (not one shared palette).
5. **Light pools**: lamps, windows and shafts that make local light (dusk matters most), plus a distinct fog/sky mood for the area.
6. **Life**: small ambient creatures or movement that are not the player's mission (birds, butterflies, drifting smoke).
7. **Sound**: an area music theme and at least one place-specific ambient sound.
8. **Signage and story props**: things that say what happened here (a half-built sandcastle, a dropped hat) in both word sets.
9. **Seasonal/time dressing**: bunting, lanterns or colour shifts for dusk, weather and events, cheap to switch on.

## 3. Ranked list (unblocked first)

Top entries by score; ties broken by lower budget risk. Each entry's full brief is in section 5 under its area. IDs: area prefix + number.

| Rank | ID | Score | Impact/size | One line |
|---|---|---|---|---|
| 2026-11-27 | ~~PIN-2~~ | see git log | pines chunk 43.9 -> 48.0 kB; start-up 0 | Frost-tint patches (vertex colour) plus fallen twigs, tree roots, three amber fairy rings and path-edge tufts with harebells, folded into the pines floor mesh (no new mesh or draw; place triangles 67,403 -> 68,313, row 70,000 unchanged); picture page verify-pines-beauty.html |
| 2026-11-27 | ~~PIN-1~~ | see git log | pines chunk 43.9; start-up 0 | Needle-litter and sun-pool vertex colour (0 triangles); one noCast additive shaft mesh, strips only (worst spot 67,597 -> 67,697 triangles, 145 -> 146 meshes; row ceilings 152/80/70,000 unchanged); LOW/LITE hide, still under reduced motion; no picture page |
| 1 | NBH-1 | 3.0 | H/S | Front-garden flower clumps and lawn colour patches on the Neighborhood street |
| 2 | NBH-2 | 3.0 | H/S | Dusk window glows and porch-lamp light pools on the street houses |
| 3 | PRK-1 | 3.0 | H/S | Park flower beds and meadow clumps |
| 4 | MKT-2 | 3.0 | H/S | Market string bulbs and lantern light pools at dusk |
| 5 | LGT-1 | 3.0 | H/S | Lighthouse sea sparkle path and whitecaps |
| 6 | SEA-1 | 3.0 | H/S | Seaside tide-foam lines and wet-sand sheen (shader, no triangles) |
| 7 | MOR-1 | 3.0 | H/S | Moor heather drifts and gorse patches (vertex colour only) |
| 8 | RIV-1 | 3.0 | H/S | River sparkle and foam round the stepping stones |
| 9 | FRM-1 | 3.0 | H/S | Farm crop-row colour variation and field-edge wildflowers |
| 10 | ROF-1 | 3.0 | H/S | Rooftops chimney smoke and warm window flicker |
| 11 | GRN-1 | 3.0 | H/S | Greenhouse condensation drops on the glass (no mesh) |
| 12 | HSE-1 | 3.0 | H/S | Old House dust motes in window shafts |
| 13 | PIN-1 | 3.0 | H/S | Pines needle-litter ground and sun shafts |
| 14 | GRG-1 | 3.0 | H/S | Gorge strata bands and wet streaks on rock walls (vertex/shader) |
| 15 | CMP-1 | 3.0 | H/S | Clan camp fire glow pool and drifting sparks (shared camp code) |
| 16 | DCK-1 | 2.0 | M/S | Docks water glints and lamp reflections |
| 17 | DCK-2 | 2.0 | M/S | Docks lantern light pools on planks at dusk |
| 18 | PRK-2 | 2.0 | M/S | Park dappled light pools under trees |
| 19 | NBH-3 | 2.0 | M/S | Street pavement wear, leaf litter, puddle sheen |
| 20 | MKT-1 | 2.0 | M/S | Market cobble variation, chalk marks, puddles |
| 21 | MKT-3 | 2.0 | M/S | Market awning pattern variety and hand-painted sign boards |
| 22 | LGT-2 | 2.0 | M/S | Lighthouse thrift clumps and wind-bent grass sway |
| 23 | FRM-2 | 2.0 | M/S | Farm dusk window glows and lantern pools |
| 24 | ROF-2 | 2.0 | M/S | Rooftops rooftop gardens and pot-plant clumps |
| 25 | ROF-3 | 2.0 | M/S | Rooftops rain-puddle sheen and lamp pools |
| 26 | HSE-2 | 2.0 | M/S | Old House cat-toy and scratch-wear story props |
| 27 | RIV-2 | 2.0 | M/S | River bank reed and lily clumps |
| 28 | PIN-2 | 2.0 | M/S | Pines frost-tint ground patches |
| 29 | GRN-2 | 2.0 | M/S | Greenhouse bloom colour variety on beds |
| 30 | DEN-1 | 2.0 | M/S | Den warm glow pools and nesting rugs |
| 31 | SEA-2 | 2.0 | M/S | Seaside towels, buckets and kite props |
| 32 | SEA-3 | 3.0 | H/S est. | Seaside warm low-sun sky band (opt-in, as the Lighthouse did) |
| 33 | WDS-1 | 3.0 | H/S | Woods dapple and moss colour variance (vertex colour only, geometry-free so not blocked) |
| 34 | MOR-2 | 1.5 | H/M | Moor cloud shadows sliding over the ground |
| 35 | G-1 | 1.5 | H/M | Shared water sparkle shader (all water areas; touches shared files) |
| 36 | GRG-2 | 2.0 | M/S | Gorge hanging ferns and vines in crevices |
| 37 | MOR-3 | 2.0 | M/S | Moor standing stones and cairns |
| 38 | MKT-4 | 2.0 | M/S | Market pigeons and crumbs |
| 39 | REF-3 | 2.0 | M/S | Reef wreck dressing, in the wreck stage chunk |
| 40 | REF-4 | 2.0 | M/S | Reef lab dressing, in the lab stage chunk |
| 41 | MON-1 | 2.0 | M/S | Moon hill-wing dressing, in the hill stage chunk |
| 42 | MON-2 | 2.0 | M/S | Moon rover-wing track marks and wear, in the rover stage chunk |
| 43 | CRY-1 | 2.0 | M/S | Crystal glint twinkle shader (no mesh) |
| 44 | DEN-2 | 2.0 | M/S | Den hanging herbs and wall marks |

(Entries not listed above are lower scoring or blocked; see each area in section 5 and the blocked list in section 4. WDS-1 uses colour only, so the Woods triangle row does not block it.)

Passes that are **BLOCKED** are listed in section 4 and ranked last. Re-rank after every wave (section 6).

## 4. Measured headroom (all areas) and the BLOCKED list

kB gzipped, from `npm run build` on main 1b51b9e2 (2026-11-26). Meshes, casters, triangles: each area built through the `test/budget.test.js` counting function (`meshes/ceiling`, `casters/ceiling`, `triangles/ceiling`), measured today with a one-off copy of the test. The ceilings in the test rows are "measured +12%" rules, so a row can be re-pinned on purpose when a pass needs it.

Guard: every area chunk under `AREA_GZIP_CEILING_KB` = 100; Moon and Reef stage A, and every stage chunk, under 65 (`MOON_STAGE_GZIP_CEILING_KB`, `REEF_STAGE_GZIP_CEILING_KB`, `CRYSTAL_STAGE_GZIP_CEILING_KB`); totals 150 / 150 / 120; start-up 661.0 of 720 kB.

| Area | Chunk kB (ceiling) | Headroom | Meshes | Casters | Triangles | Status |
|---|---|---|---|---|---|---|
| neighborhood | 34.8 (100) | 65.2 | 402/450 | 326/380 | 40,386/70,000 | ok |
| park | 29.4 (100) | 70.6 | 178/210 | 135/170 | 28,214/40,000 | ok (32 meshes left) |
| docks | 35.6 (100) | 64.4 | 527/600 | 426/500 | 76,938/90,000 | ok |
| seaside | 43.8 (100) | 56.2 | 72/85 | 31/45 | 31,093/34,900 | tri-tight (3.8k left); colour/shader passes fine |
| den | 6.5 (100) | 93.5 | 288/340 | 174/220 | 16,269/40,000 | ok, lots of room |
| woods | 30.0 (100) | 70.0 | 184/450 | 154/380 | 68,810/70,000 | **BLOCKED for geometry** (1.2k tris left); colour-only ok |
| river | 34.7 (100) | 65.3 | 172/450 | 135/380 | 63,778/70,000 | ok, 6.2k tris |
| moor | 28.2 (100) | 71.8 | 88/450 | 48/380 | 64,120/70,000 | ok, 5.9k tris |
| pines | 44.6 (100) | 55.4 | 123/450 | 71/380 | 67,403/70,000 | tri-tight (2.6k left) |
| gorge | 44.9 (100) | 55.1 | 61/450 | 36/380 | 66,539/70,000 | tri-tight (3.5k left) |
| farm | 48.7 (100) | 51.3 | 244/280 | 176/210 | 53,259/62,000 | mesh-tight (36 left) |
| fair | 96.4 (100) | 3.6 | 175/250 | 109/180 | 68,572/75,000 | **BLOCKED** (tight; see below) |
| roofs | 57.9 (100) | 42.1 | 117/450 | 68/380 | 37,335/70,000 | ok |
| market | 75.0 (100) | 25.0 | 145/280 | 35/210 | 47,544/62,000 | ok |
| house | 54.0 (100) | 46.0 | per level (HOUSE_LEVELS rows, 450/70,000 shell) | | | ok |
| lighthouse | 33.3 (100) | 66.7 | 59/280 | 15/210 | 54,228/62,000 | ok |
| greenhouse | 37.1 (100) | 62.9 | 74/83 | 7/8 | 58,583/64,730 | mesh-tight (9 left) |
| moon (stage A) | 64.7 (65) | 0.3 | 25/28 | 6/9 | 36,816/41,200 | **BLOCKED** (stage A). Stage chunks: hill 22.0, launch 14.2, rover 16.5, station 0.4, late 3.4, all 121.1 of 150 |
| reef (stage A) | 65.0 (65) | 0.0 | 22/25 | 1/2 | 40,583/46,200 | **BLOCKED** (stage A). Stages: lab 15.3, wreck 6.4, ride 13.7, all 97.3 of 150 |
| crystal (stage A) | 43.4 (65) | 21.6 | 13/13 | 1/2 | 20,314/22,200 | **draw row full**: only no-new-mesh passes (or raise the row on purpose). Stages: wingc 10.4, play 5.2, all 57.7 of 120 |

**BLOCKED list (ranked last):**
- **Moon stage A** (64.7/65): every pass that adds code or data to `moon.js`'s own chunk. Frees room by moving Stage A content (the beauty scatter, paint code) into a stage chunk or `moonlate.js` (3.4 kB so far), as the idle ring move did (64.98 to 64.75). Entries MON-1 and MON-2 are written for the stage chunks, which have 40+ kB each, so they are NOT blocked. MON-3 (regolith colour variety in stage A) is blocked.
- **Reef main / stage A** (65.0/65): same rule. Move the decor and air code (`reefdecor.js`, `reefair.js`) into a new stage chunk first. REF-1 and REF-2 are blocked; REF-3 (wreck stage) and REF-4 (lab stage) are free.
- **Fairground** (96.4/100, 3.6 kB left, under the owner's example threshold): a pass can only add under about 2 kB (est.). To free room, move the show, coaster or stall dressing into a staged chunk (as the Reef and Moon do: `fairstages.js` would be the new seam), which the 65 kB per stage ceiling pattern covers. FAI-1 to FAI-3 are blocked until then.
- **Woods geometry** (68,810/70,000 triangles): WDS-3 is blocked until the row is raised on purpose (the other 70k areas are in the same spot) or hidden faces are trimmed.
- **Crystal draw row** (13/13): any entry that adds a mesh. CRY-1 is written to add none.
- **Greenhouse meshes** (74/83) and **Farm meshes** (244/280): fine for one or two pieces, not for a pass that adds new meshes per prop. Use existing buckets.

## 5. Areas

For each area: (a) rounds already done, (b) headroom (see section 4), (c) sparseness (est.), (d) ready-to-launch passes. All entries follow the STD block (section 1) unless a line says otherwise.

Sparseness columns are estimates: triangles and meshes per 1000 m2 from the table above divided by the walkable bounds in `*_BOUNDS` or the area's `bounds:` (Woods/River/Moor/Pines/Gorge assumed 100 x 100, which is an estimate; Den and House not computed). Palette = distinct `0x` hex literals across `src/world/<area>*.js` (a crude estimate: it counts the area's helper files and not shared palette tables). Fog/mood = whether the area's own files mention fog (`grep -i fog`), meaning it sets its own mood. Music from `src/musicthemes.js`.

### Neighborhood (the default street)
- (a) Done: polish rounds 1-4 and surveys 2-5 and passes 6-11 (`docs/superpowers/plans/2026-11-09-polish-daylight.md`, `-goldenhour`, `-hedgesky`, `-shrubs`, `-bushes`, `-foliage`, `-floors`, `-startpad`, `2026-11-06-polish-canopies.md`, `-cosy`, `-dusk7`). `docs/VISUAL-PASS.md` waves 3-4 for draw-call reclaim and silhouette. No round named "beauty" in git log.
- (b) 34.8 kB, 402/450 meshes, 40.4k/70k triangles. Ample.
- (c) 3.3k triangles and 33 meshes per 1000 m2 (est.); palette 30; own fog/mood yes; ambient life shared (`critters.js`, `skylife.js`, `yarddog.js`); music: null (the lofi base theme).
- (d)
  - **NBH-1** (H/S, 3.0): front-garden flower clumps and lawn colour patches. Brief: per house, 2-4 clumps of 3-5 small flowers (instanced, one `noCast` InstancedMesh, +1 mesh) in 4 hues chosen by house hash; lawn patches as vertex colour on the existing ground (0 meshes). Own seed stream; sway via `wind.js` frozen under reduced motion; LOW halves clump counts. Budget: +1 mesh, about +1,500 triangles (est.), chunk +1 kB (est.). Re-pin: `test/budget.test.js` neighborhood row if >450 meshes or >70k; any ground golden fixture.
  - **NBH-2** (H/S, 3.0): dusk window glows and porch-lamp pools. Brief: one shared emissive window material that brightens with dusk (via `dusk.js` weights), plus one merged noCast quad set for lamp pools on ground (additive, 0 casters). Dusk only; frozen under reduced motion (steady glow, no flicker); LOW skips pools. Budget: +1 mesh. Re-pin: neighborhood row.
  - **NBH-3** (M/S, 2.0): pavement wear, leaf litter, puddle sheen. Brief: decal-style vertex-colour wear on existing pavement strips; one merged leaf-litter noCast mesh at 60 scraps; puddle sheen only after rain via `weather.js`. Budget: +1 mesh.
  - **NBH-4** (M/M, 1.0): seasonal dressing: bunting strings and window pumpkins/wreaths switched by a date helper (one flag, default off outside the window; text-free). Brief: merged mesh per dressing; date logic in one pure function tested with fixed dates. Budget: +2 meshes; both word sets not needed (no text).

### Park
- (a) Done: `2026-11-02-polish-places.md`, `2026-11-06-polish-park2.md`, `2026-11-09-polish-fountainglow.md`, `src/world/parkfountain.js`.
- (b) 29.4 kB, 178/210 meshes (32 left), 28.2k/40k triangles.
- (c) 3.1k triangles and 19 meshes per 1000 m2 (est.): the sparsest street area by mesh density; palette 20; own fog yes; music `park` theme.
- (d)
  - **PRK-1** (H/S, 3.0): flower beds and meadow clumps. Brief: 8 clumps around paths and the fountain, one InstancedMesh (+1 mesh), 5 hues; frozen sway under reduced motion; LOW halves. Budget: +1 mesh, +1k triangles (est.).
  - **PRK-2** (M/S, 2.0): dappled light pools under trees. Brief: merged noCast soft quads under the 10 biggest canopies (leaf-light blobs as Greenhouse round 4 did); static; LOW drops. +1 mesh.
  - **PRK-3** (M/S, 2.0): pond/fountain sparkle: a small additive glint mesh with a time-scrolled alpha, frozen under reduced motion. +1 mesh.
  - **PRK-4** (M/S, 2.0): picnic blanket, kite and dropped-hat story props on the lawn (one merged mesh). +1 mesh.

### Docks
- (a) Done: `2026-11-02-polish-docks.md`, `2026-11-06-polish-docks2.md`, `2026-11-08-polish-quayside.md`, `src/world/docksdressing.js`, `warehouselook.js`.
- (b) 35.6 kB, 527/600 meshes (73 left), 76.9k/90k triangles.
- (c) 12.7k triangles and 87 meshes per 1000 m2 (est.): densest street area already; palette 90; fog yes; life: gulls (`seasidegulls.js`), `critters.js`; music `docks`.
- (d)
  - **DCK-1** (M/S, 2.0): water glints and lamp reflections (additive glint strip, scrolled; frozen under reduced motion). +1 mesh.
  - **DCK-2** (M/S, 2.0): lantern light pools on planks at dusk (merged noCast quads, dusk-weighted). +1 mesh.
  - **DCK-3** (L/S, 1.0): harbour life: cat-height rope coils, a fish-crate drip and drifting gull feather (Points, 12 max). +0 meshes.
  - **DCK-4** (M/S, 2.0): crate stencils and shipping signboards (texture atlas cells, both word sets for any words).

### Seaside
- (a) Done: `2026-11-04-polish-beach.md`, `-polish-water.md`, `-polish-waterlife.md`, `src/world/seasidedecor.js`, `seasidewet.js`, `seasidelife.js`, `seasidegulls.js`.
- (b) 43.8 kB, 72/85 meshes, 31.1k/34.9k triangles (3.8k left).
- (c) 4.5k triangles and 10.5 meshes per 1000 m2 (est.); palette 85; fog yes; music `seaside`.
- (d)
  - **SEA-1** (H/S, 3.0): tide-foam lines and wet-sand sheen as a shader on the existing sand/water meshes (0 meshes, 0 triangles). Time-scrolled; frozen under reduced motion; LOW uses a static band.
  - **SEA-2** (M/S, 2.0): towels, buckets and kite props, one merged mesh at under 800 triangles.
  - **SEA-3** (H/S est., 3.0): warm low-sun sky band, opt-in via `sky.js`/`dusk.js` exactly as `1ae6e13e` did for the Lighthouse. Touches shared sky files; check the idle rule for conflicts.
  - **SEA-4** (L/S, 1.0): shells and starfish scatter in the existing paint bucket.

### Den
- (a) Done: `2026-11-06-polish-cosy.md`, `src/world/dencosy.js`.
- (b) 6.5 kB, 288/340 meshes, 16.3k/40k triangles (most triangle room of any area).
- (c) triangle density not computed (bounds from `BOUND`); palette 59; fog not in area files; music = `house` theme.
- (d)
  - **DEN-1** (M/S, 2.0): warm glow pools and nesting rugs (merged mesh, 0 casters).
  - **DEN-2** (M/S, 2.0): hanging herbs, feathers and wall paw marks (Clan and everyday wording differences not needed: no text).
  - **DEN-3** (L/S, 1.0): drifting dust in the entrance light (Points, frozen under reduced motion).

### Farm (Appletree Farm)
- (a) Done: `7898435`, `7c4f291f` (lifelike animals and Fairground polish), `73c9b3b7` (farm-beauty: shaped animals; triangle ceiling for place, animals and jobs 75,000). `src/world/farmparts.js`, `farmshapes.js`, `farmmodels.js`.
- (b) 48.7 kB, 244/280 meshes (36 left), 53.3k/62k triangles.
- (c) 6.4k triangles and 29.5 meshes per 1000 m2 (est.); palette 60; own fog no; life `farmlife.js`, `farmanimals.js`; music `farm`.
- (d)
  - **FRM-1** (H/S, 3.0): crop-row colour variation and field-edge wildflowers (vertex colour on the wheat mesh, 0 meshes; flower dots in one existing bucket).
  - **FRM-2** (M/S, 2.0): dusk window glows and lantern pools (1 shared material plus +1 noCast mesh).
  - **FRM-3** (M/S, 2.0): ground wear: tractor tracks, mud puddles and hay scatter as vertex colour (0 meshes).
  - **FRM-4** (M/S, 2.0): chimney smoke puffs and a spinning weathervane (frozen under reduced motion). +1 mesh.

### Fairground (BLOCKED until staged)
- (a) Done: fair beauty round one `cf42c9e6`, `922b2e58`, round two `df315e4f`, `4fa2e3b9`, `1b9c6dce`, merge `add33075`; fair polish merge `7c4f291f`.
- (b) 96.4 kB of 100 (3.6 left), 175/250 meshes, 68.6k/75k triangles. See section 4.
- (c) 8.3k triangles and 21 meshes per 1000 m2 (est.); palette 110; fog not in area files (dusk mood via the "deeper field" rework); life `fairvisitors.js`, `fairshow.js`; music `fair`.
- (d) All blocked until a `fairstages.js` seam moves dressing into a lazy chunk. Free-room task (an enabler, item 2 in the priority order) is first: **FAI-0** (M): move show/coaster dressing into a staged chunk with its own ceiling. Then: **FAI-1** (M/S, 2.0) confetti and ticket litter in the sawdust; **FAI-2** (M/S, 2.0) colour zones for bunting and balloons; **FAI-3** (L/S, 1.0) glints on the ride metal.

### Rooftops
- (a) Done: round one `43157010` and round two Tasks A-G (`375269ef`, `8aed006f`, `66fc2ce7`, `03b6a0db`, `d44952b8`, `4dc38f08`, `07f61440`, `9ff8c3fa`), merges `b4812048`, `cedddec0`. Plans `2026-11-19-rooftops-step1-moves.md`, `-step2-place.md`.
- (b) 57.9 kB, 117/450 meshes, 37.3k/70k triangles.
- (c) 4.2k triangles and 13 meshes per 1000 m2 (est.); palette 195 (richest of all areas); fog yes; life `roofslife.js`, `roofsbirds.js`, `roofsflock.js`; music `roofs`.
- (d)
  - **ROF-1** (H/S, 3.0): chimney smoke puffs and warm window flicker (small Points; frozen under reduced motion).
  - **ROF-2** (M/S, 2.0): rooftop gardens: flat-roof pot-plant clumps (one InstancedMesh).
  - **ROF-3** (M/S, 2.0): rain-puddle sheen and lamp pools (weather-gated).
  - **ROF-4** (M/S, 2.0): rooftop string lights between aerials (one merged line mesh, glow at dusk).

### Market Square
- (a) Done: `87fdbdcc`, `898ee760`, `e9c80f2b` (stall rounds), `0332c14c` and merge `23ccf633` (buildings round). Plans in `docs/superpowers/plans/` (market). Backlog from memory: six missions, strays through props, 3-4 more stalls (not beauty).
- (b) 75.0 kB (25 left), 145/280 meshes, 47.5k/62k triangles.
- (c) 25.7k triangles and 78 meshes per 1000 m2 (est.): the densest area; palette 278 (est., many from `marketparts.js`); fog yes; life `marketlife.js`, `marketfolk.js`; music `market`.
- (d)
  - **MKT-1** (M/S, 2.0): cobble ground variation, chalk marks, puddles (vertex colour + one noCast decal mesh).
  - **MKT-2** (H/S, 3.0): string bulbs and lantern light pools at dusk (merged additive pools, dusk only).
  - **MKT-3** (M/S, 2.0): awning pattern variety and hand-painted sign boards (words in both word sets, blocklist check).
  - **MKT-4** (M/S, 2.0): pigeons and crumbs (small life, seeded, frozen under reduced motion).

### Old House (Old House, interior + front)
- (a) Done: `80fa677d`, `5a60f696`, `79dcd070` (beauty pass 1), `b1a678da` (round 2), merge `7a0e6f70`. Housing front: `src/world/oldhousefront.js`.
- (b) 54.0 kB; per-level budget rows (`HOUSE_LEVELS`); re-pin to measured when a level grows (the pass names it).
- (c) not computed (per-level); palette 224; fog yes (`houseair.js`); life `houselife.js`; music `house`.
- (d)
  - **HSE-1** (H/S, 3.0): dust motes in window shafts (Points, frozen under reduced motion).
  - **HSE-2** (M/S, 2.0): cat-toy and scratch-wear story props, one merged mesh per level.
  - **HSE-3** (M/S, 2.0): front garden hedges and flower boxes (`oldhousefront.js`).
  - **HSE-4** (L/S, 1.0): hearth flicker glow variation.

### Lighthouse
- (a) Done: `08a7a4a5` (beauty pass), `1ae6e13e` (round 2: warm sky band, sun glow, window glows, wrack, tide pool), merge `feeca708`. Files `lighthousebeauty.js`, `lighthouselife.js`, `lighthousesound.js`.
- (b) 33.3 kB, 59/280 meshes, 54.2k/62k triangles (7.8k left).
- (c) 7.2k triangles and 7.8 meshes per 1000 m2 (est.); palette 214; fog yes; life `lighthouselife.js`; music `lighthouse`.
- (d)
  - **LGT-1** (H/S, 3.0): sea sparkle path under the sun and whitecaps (shader on the sea mesh; 0 meshes; frozen under reduced motion).
  - **LGT-2** (M/S, 2.0): sea-thrift clumps and wind-bent grass (instanced, `wind.js`).
  - **LGT-3** (M/S, 2.0): beam dust and fog-bell mist at dusk (additive cone; frozen under reduced motion).
  - **LGT-4** (M/S, 2.0): far fishing boats and lit buoys (one merged mesh, 3 boats).

### Greenhouse
- (a) Done: rounds 1-4 (`2de080c1`, `6539dea8`, `7dc8903b`, `8401d344`), merges `bf1a35a5`, `81efdf1b`.
- (b) 37.1 kB, 74/83 meshes (9 left), 58.6k/64.7k triangles (6.1k left).
- (c) 10.2k triangles and 12.8 meshes per 1000 m2 (est.); palette 184; fog (glass cues) yes; life `greenhouselife.js`, `greenhousebutterflies.js`; music `greenhouse`.
- (d)
  - ~~**GRN-1**~~ (done 2026-11-27, see section 8): condensation drops on the glass (shader on the existing glass material, 0 meshes).
  - **GRN-2** (M/S, 2.0): bloom colour variety on beds (into the existing flower bucket).
  - **GRN-3** (M/S, 2.0): hanging planters and trailing vines (max +2 meshes; mesh row 83 is nearly full).
  - **GRN-4** (L/S, 1.0): pollen motes in shafts.

### Reef (stage A BLOCKED; stage chunks free)
- (a) Done: beauty rounds 1-6 (`204a33bc`, `d268c31f`, `cd8c67ee`, `aa53dceb`, `719baff4`, `af0674fa`), life round `6f5436aa`; merges `a9ee8f11`, `3007de35`, `33a18b51`, `2100aa90`. Picture page `verify-reef-beauty.html`.
- (b) Stage A 65.0/65 BLOCKED; lab 15.3, wreck 6.4, ride 13.7 of 65 each. 22/25 meshes, 40.6k/46.2k triangles.
- (c) 5.0k triangles and 2.7 meshes per 1000 m2 (est.); palette 319; fog yes; life `reeflife.js`, `reefcritters.js`, `reefbubbles.js`; music `reef`.
- (d)
  - **REF-1** (M/S, BLOCKED): caustic shimmer on sand. Needs a stage move first (see section 4).
  - **REF-2** (M/S, BLOCKED): anemone sway and fish colour variety.
  - **REF-3** (M/S, 2.0): wreck dressing in `reefwreck*` stage chunk (barnacles, hanging weed, lantern glow). Budget: wreck chunk +1 kB (est.), +0 meshes.
  - **REF-4** (M/S, 2.0): lab dressing in `reeflab*` stage chunk (tank glow, notes, bubbling jars). Same budget.

### Crystal Cave (draw row full)
- (a) Done: beauty rounds 1-6 (`fd82512b`, `30594e9c`, `141f733b`, `bcce3105`, `09422680`, `a907963c`), merges `f04b9848`, `6ee70145`, `59c7d96f`. `verify-crystal-beauty.html`. In flight: Crystal C3-C7 builders.
- (b) Stage A 43.4/65; wingc 10.4, play 5.2. Meshes 13/13, triangles 20.3k/22.2k.
- (c) 4.4k triangles and 2.8 meshes per 1000 m2 (est.); palette 149; fog yes; life `crystallife.js`, `crystalcritters.js`; music `crystal` (pentatonic chimes).
- (d)
  - **CRY-1** (M/S, 2.0): glint twinkle shader on the existing crystal buckets (0 meshes). Touches files active Crystal builders own; check the idle rule.
  - **CRY-2** (L/S, 1.0): coloured light pools on the floor under each crystal hue (vertex colour only).

### Moon (stage A BLOCKED; stage chunks free)
- (a) Done: beauty rounds 1-6 (`690f9476`, `41f68707`, `43898cb8`, `812b6c8b`, `6c4d0758`, `f4c0fca4`), buildings beauty `3706d65d`, suit kit beauty `63dc16be`; merges `4768bb1e`, `e4fae719`, `d236c913`, `6410744d`. Pictures `verify-moon-beauty1..4.html`.
- (b) Stage A 64.7/65 BLOCKED (`baa05126` brought it from 64.98 to 64.75); hill 22.0, launch 14.2, rover 16.5, station 0.4, late 3.4. 25/28 meshes, 36.8k/41.2k triangles.
- (c) 3.4k triangles and 2.3 meshes per 1000 m2 (est.); palette 152; fog yes (`moonsky.js`); life `moonlife.js`, `moonrobots*`; music `moon`.
- (d)
  - **MON-1** (M/S, 2.0): hill-wing dressing in `moonstagehill.js` (cairns, flag shadows, dust).
  - **MON-2** (M/S, 2.0): rover-wing track marks and wear in `moonstagerover.js`.
  - **MON-3** (M/S, BLOCKED): regolith colour variety in stage A.
  - **MON-4** (M/S, 2.0): launch-pad scorch and heat haze in `moonstagelaunch.js`.

### Clan territories (Woods, River, Moor, Pines, Gorge, camps)
- (a) Done: Woods `2026-11-04-polish-forestfloor.md`, `-polish-logs.md`, `-polish-brambles.md`, `-polish-canopies.md`; River/Moor `2026-11-03-polish-rivermoor.md`, `-polish-streams.md`, `-polish-pondrims.md`, `2026-11-09-polish-moorlook.md`; Pines `2026-11-06-polish-pines2.md`; Gorge `-gorge5..7`, `-gorgelight`, `-gorgewall`, `-gorgefloor`, `-gorgeday2`, `-gorgerock2`, `-gorgesky`; camps `2026-11-02-polish-camps.md` to `-camps6`, `2026-11-08-polish-campring.md`.
- (b) Chunks 28-45 kB; triangles 63.8k-68.8k of 70k, see section 4.
- (c) 100 x 100 assumed (est.): Woods 6.9k tris/18 meshes, River 6.4k/17, Moor 6.4k/9, Pines 6.7k/12, Gorge 6.7k/6 per 1000 m2 (est.); palettes 37, 51, 36, 45, 36; fog: Gorge yes, River/Moor via `marshlife.js`, Woods/Pines no fog code in their files (est.); life `marshlife.js`, `gorgelife.js`, `cavelife.js`; music: woods theme shared with Pines, River `river`, Moor and Gorge `air` minor.
- (d) per territory:
  - **WDS-1** (H/S, 3.0): dapple and moss colour variance (vertex colour in `forestfloor.js`, 0 triangles).
  - **WDS-2** (M/S, 2.0): light shafts and dust motes (Points; frozen under reduced motion).
  - **WDS-3** (M/S, BLOCKED): fallen leaves and mushroom rings (geometry; Woods is at 68.8k of 70k).
  - **WDS-4** (M/S, 2.0): dusk fireflies (Points, 16 max; LOW 8).
  - **RIV-1** (H/S, 3.0): sparkle and foam at the stepping stones (shader on the water mesh).
  - **RIV-2** (M/S, 2.0): bank reed and lily clumps (existing `riverdress.js` bucket).
  - **RIV-3** (M/S, 2.0): stepping-stone moss and wet darkening (vertex colour).
  - **MOR-1** (H/S, 3.0): heather drifts and gorse patches (vertex colour only; Moor uses only 88 meshes).
  - **MOR-2** (H/M, 1.5): cloud shadows sliding across the ground (a shader scroll; frozen under reduced motion).
  - **MOR-3** (M/S, 2.0): standing stones and cairns (instanced, in `moordress.js`).
  - ~~**PIN-1** (H/S, 3.0): needle-litter ground and sun shafts.~~ Done 2026-11-27 (section 8).
  - ~~**PIN-2** (M/S, 2.0): frost-tint patches.~~ Done 2026-11-27.
  - **PIN-3** (M/S, 2.0): mushrooms and ferns (about 2.6k triangles left; keep to 2k).
  - **GRG-1** (H/S, 3.0): strata bands and wet streaks on cliff walls (vertex or shader; 0 triangles).
  - **GRG-2** (M/S, 2.0): hanging ferns and vines in crevices (instanced, under 3k triangles).
  - **GRG-3** (M/S, 2.0): light pools through cave mouths.
  - **CMP-1** (H/S, 3.0): camp fire glow pool and drifting sparks (shared `camp.js`; one pass for all five territories; sparks Points, frozen under reduced motion).
  - **CMP-2** (M/S, 2.0): nest bedding variety (moss, feathers, pelts) in the existing camp bucket.

### Global (shared files, check idle rule)
- **G-1** (H/M, 1.5): water sparkle shader for all water (`src/render/water.js`, `waterdress.js`). Start-up chunk has 59 kB headroom (661.0 of 720). Conflicts with any area pass touching water files.
- **G-2** (M/M, 1.0): cloud shadows over all open areas (`clouds.js`).

## 6. Refresh (after every wave)

1. Re-run `npm run build` (or `npm run headroom` when it exists) and refresh section 4. Replace estimated numbers with measured ones; keep the "(est.)" tag only on hand guesses.
2. Re-run the budget counting for each area (the `test/budget.test.js` rows) and update meshes/casters/triangles.
3. Re-rank section 3: re-score, move newly blocked entries to the end and newly unblocked ones back up. Entries done are struck through and logged in section 8.
4. Add entries from the owner's screenshots (section 7) as new IDs with the standard brief.
5. New areas (Snowville, Treehouse, Jungle) get their own section the day they merge, scored against the checklist in section 2.

## 7. Owner picture requests

A screenshot from the owner helps most in these eight areas (noon walk, from the spawn, and one at dusk if possible); each is where measured density is lowest or the look is least checked:

1. **Moor**: only 88 meshes; sparsest of the territories.
2. **Gorge**: 61 meshes for 66k triangles; looks may be bare between rock walls.
3. **Woods**: colour-only room left; does the floor read as varied?
4. **Park**: the lowest mesh density of the street areas.
5. **Farm**: one flat field colour risk; own fog not set.
6. **Neighborhood**: the first screen every player sees; the benchmark for "rich".
7. **Seaside**: tight triangle room; check the sand/water look before deciding SEA-1 versus SEA-3.
8. **Den**: most triangle room, least looked-at (an interior).

## 8. Log of completed beauty passes

| Date | Entry | Commit | Chunk kB before/after | Notes |
|---|---|---|---|---|
| 2026-11-27 | ~~GRN-1~~ | COMMIT | 37.1 / 37.8 (greenhouse); start-up +0.01 | Condensation beads and runnels in the glass material's fragment shader; 0 meshes, 0 triangles, row unchanged; low tier none, medium beads only; runnels frozen under reduced motion; no picture page (shader, not renderable headless); warmth/lamp not wired (no light state) |

Past rounds before this file are listed under each area in section 5.
