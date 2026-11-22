# The Family Home: design

Date: 2026-11-22. Status: design only, written for the owner's approval. Branch `family-home`. No game code is written by this document.
Builds on `2026-11-20-old-house-design.md` (read it first) and borrows the zone drawing from `2026-11-22-old-house-wing-design.md`.

## Privacy rule (binding, applies to every file this work adds)

The place is called "the family home" and nothing else. The repo, docs, code, tests, test names and commit messages never hold the street address, the town, listing text, prices, photos or any person's real name. The only personal content is the layout (room sizes and how they join), and it must not ship in the public Pages bundle. The cats' names D2, Digit and Robbie are already in the public catalogue (`CATALOG.cats`) and may be used; no other names are written.

## Intent

The owner: "for our private edition, build a world that looks like our family home." His children (a girl of 11, a boy of 9) get a place in the game that is their own house, seen as a cat sees it: sunny window slots, a stove to nap beside, a sunken bed, a theater cushion. The residents are the family cats. There are no people figures at all.

## What the owner decided (binding)

1. All the layout facts are true and are replicated (listed below).
2. "Just cats": D2, Digit and Robbie are the residents, reusing the family-cats code. No people.
3. A **separate private build**, not in the public bundle.
4. First slice: ground floor, living room and basement. The barn and yard are the second step.
5. The exterior is a unique mid-century modern one and must be recognisable.

## Layout facts to replicate (approximate, feet)

Contemporary two-storey house, redesigned 2001, mid-century modern exterior: low, flat-pitched shingle roof with wide overhangs, auburn siding, walls of floor-to-ceiling windows, clerestory strips, a balcony deck off the living room, a patio, a wooded lot on a gentle slope.

- Ground floor: open kitchen 26x17 with a dining area, dining room 18x16, bedrooms 12x12 and 13x12, a bathroom, a mud room, a laundry.
- Upper floor: very large living room 32x21 (wood stove, French doors, balcony deck, vaulted ceiling), primary suite 25x15 (sunken bedroom, soaking tub), two more baths, a loft.
- Basement: finished walk-out family room 25x15 with a wood stove, plus a home theater.
- Outside (second step): detached barn-workshop-garage 69x42 with a 950 sq ft office/guest suite above, chickens and garden beds, a wooded 6.4-acre lot abutting conservation land.

The theater, loft, mud room, laundry and bath sizes are not given; this design sets them (marked "set" below) and the owner may change them.

## 1. The private-edition mechanism

### Facts about today's build

- `vite.config.js` has one config with two modes today: the website (base `/whisker-walk/`, outDir `dist`, deployed by `.github/workflows/deploy.yml` after four test shards) and `ios` (relative base, outDir `ios/web`).
- Places load lazily: `src/world/areas.js` maps an id to `() => import('./house.js')`. `scripts/buildjson.mjs` and `test/buildsize.test.js` hold the 720 kB start-up ceiling and the 100 kB per-place ceiling (`AREA_GZIP_CEILING_KB`).
- The save is `localStorage['whisker-walk-save']` (`src/progression.js`), optionally mirrored to the database by `src/cloud.js`.
- The repo is to go private (release decisions, 2026-11-17), but the Pages site is public whatever the repo is.

### Options

| | A. Build flag, same code, dead-code elimination | B. Separate entry page and boot file | C. Private package in a second repo | D. Public build with a runtime-fetched private layout |
|---|---|---|---|---|
| How | `vite build --mode family` sets `__PRIVATE_FAMILY__ = true`; `areas.js` registers the `family` place only `if (__PRIVATE_FAMILY__)`. In the public build the flag is the literal `false`, so Rollup removes the registration and the dynamic import, and the chunk is never emitted. Layout lives in `src/family/`, imported only from that branch. | `family.html` plus `src/familymain.js` wires the game by hand | `src/family/` is a git submodule or npm package; public builds alias it to an empty stub | The public game has a locked place; its layout JSON comes from a password host |
| Public bundle excludes it | By build (tree-shaking) and proven by a grep test | By not listing the entry | By not having the files at all; strongest | Engine code and structure are public; fails the offline-first rule |
| Drift from the real game | None: one boot path | High: the boot wiring is copied and diverges | None, but two repos to keep in step | None |
| Cost | Lowest | Medium, forever | Highest: cross-repo CI, the nightly iOS refresh, worktrees | Medium, weaker |

### Recommendation: A, with C kept as the fallback

Take **A**. The repo is going private, so layout data in `src/family/` is already private; what must be guaranteed is the *public bundle*, and A plus the test below does that at the lowest cost. If the repo ever stays public, move `src/family/` to a private submodule (C) with no change to the rest: the flag and the stub alias make that a one-task swap. B is rejected (drift). D is rejected (offline-first, and it leaves the room names in public code).

### Concrete mechanism

- `vite.config.js`: a new mode `family` (`FAMILY_MODE`, next to `IOS_MODE`): relative base, `outDir: 'dist-family'`, `define: { __PRIVATE_FAMILY__: true }`. Every other mode defines it `false`. A `vitest` global defines it `false` too, and family tests switch it with a helper (`test/helpers/family.js`).
- `npm run build:family` and `npm run preview:family` (preview on the local network, `--host`). `dist-family/` is in `.gitignore`. The deploy workflow only ever uploads `dist`.
- `src/family/` holds everything private: `familyplan.js` (layout data), the family's furniture, finds and lines. Nothing outside `src/family/`, the flag block in `areas.js`, `worldmap.js`'s flag block, and the tests may import from it.
- The family build adds one place to the world map and to `CATALOG.areas`, behind the flag, so the game offers it like any other place (unlocked from the start in the private build; there is no paw price to earn).
- **Where it is served.** Phase one: the owner's machine and the home network (`npm run preview:family`), which also serves the iPads over wifi. Phase two: a private static host behind a login (for example Cloudflare Pages with Access, since the domain already lives on Cloudflare); only the family's email addresses can load it. Never GitHub Pages.
- **iOS wrapper.** The nightly refresh builds the public game from main and must stay public. Add a second Xcode target and bundle id ("Whisker Walk Home") whose build step runs `vite build --mode family` into `ios/web-family`. The public target's build is unchanged, so the public app never contains the family files. The family target is built by hand (`npm run ios:family`), outside the nightly schedule, until the owner asks for it to join. Free 7-day signing applies to it like to the main app.
- **Saves are kept apart.** In the family build, `SAVE_KEY` is `whisker-walk-family-save` (a build constant, so the public build can never read or write it) and its cloud mirror is off (no Supabase client is created, so no family layout id, room name or find ever reaches the database). A private host is a different origin, so even the browser stores are separate; the key makes it true on `localhost` and on iOS too. The family save starts fresh with the shop's starting paws; whether to import a public save is open question 2.
- **Offline.** The family build keeps the service worker and its precache list, like the website, so an iPad opens it without wifi.

### How the public build provably excludes it

A test file `test/privateedition.test.js` (it runs `vite build` programmatically into a temp directory, outside `dist`, using the public mode; it is a heavy test and goes in `test/heavy.js`) checks, on the built files:

1. No emitted file name contains `family`, and the manifest has no entry whose source is under `src/family/`.
2. A sentinel string, `ww-private-family-3c91`, is declared once in `src/family/sentinel.js` and a second unique token in every other `src/family/` file. The public output (every `.js`, `.html`, `.json`, `.css`, including `sw.js` and `precache.json`) contains none of them, and none of the room ids from the plan (the test reads the ids from the plan module and greps for each).
3. The same build run in `family` mode into another temp directory DOES contain them. This keeps the test from passing vacuously (a broken grep would fail here).
4. A static check: no file outside the allowed list imports a path under `src/family/` (a regex over `src/`), and the flag block is the only reference in `areas.js` and `worldmap.js`.
5. `deploy.yml` gets a final guard step after `vite build`: `grep -rl ww-private-family dist && exit 1 || true`, so a regression is caught on the real artifact too.

A second, local-only tool, `scripts/privacy-scan.mjs`, reads a **gitignored** denylist file (`private-denylist.local.txt`, which holds the address, town and names, written by the owner, never committed) and scans every tracked file, every commit message and every built bundle for those strings. It is run before each merge. The list itself is never in the repo, so the guard cannot leak what it guards.

## 2. Floor plan and levels

### The one real constraint

The ground allows one walkable height per spot (`src/ground.js`, and the Old House spec's split-level ruling). The real house is truly stacked (the living room over the ground floor). Changing the ground to hold two heights at one spot would touch the player, critters, golden mice, co-walk and every recorded walk. So, as for the Old House:

**Decision: an unfolded plan.** Every room keeps its real size and its real neighbours on its own floor, but the floors sit side by side on the plan (never one over another) and the stairs join them. The gentle slope of the lot makes this natural: the lawn falls away to the south, so the basement is a lower pavilion at the foot of the slope, the ground floor is the middle shelf, and the upstairs sits on a raised shelf to the east on posts over the falling lawn. The house reads as a stepped, split-level composition from outside, which suits the mid-century look (low volumes, long overhangs). True stacking stays out of scope (open question 1).

### Scale

The game's cat is large against real rooms, and the Old House rooms are about 8 to 10 m. **1 ft = 0.5 m** on the plan, so the 32x21 living room is 16 x 10.5 m. That keeps the plan a readable copy of the real numbers (a test pins the room sizes in feet times 0.5). Wall height stays the game's 2.8 m (the cat's view), and the living room's vaulted ceiling shows as a taller north wall (4.6 m) with a clerestory band, not as a drawn ceiling.

### Levels (reusing the engine's four-level shape)

| Level id | y | What |
|---|---|---|
| `basement` | -2.7 | walk-out family room, theater, patio (the engine's `cellar` slot, renamed) |
| `ground` | 0 | kitchen, dining, bedrooms, bath, mud room, laundry |
| `upstairs` | 2.7 | living room, deck, primary suite, two baths |
| `loft` | 5.0 | the loft (the engine's `attic` slot), reached by a ladder-stair from the living room |

The plan data has the same shape as `houseplan.js` (`LEVELS`, `ROOMS`, `STAIRS`, `DOORWAYS`, `WINDOWS`, `BOUNDS`). Milestone M0 (below) makes the house engine take its plan as an argument so both houses share the camera, walls, stairs, levels and life code; today's old house is the first plan.

### Rooms (metres on the plan; x east, z south; the front is south, the lot falls south)

Ground, y 0, x 0 to 36, z 0 to 17 (kitchen and dining area are one open room, as in the listing):

| Room | Size ft | Size m | Position |
|---|---|---|---|
| Mud room (the cat enters here) | 8x12 (set) | 4 x 6 | x 0..4, z 8..14; door to the outside on the west |
| Kitchen with dining area | 26x17 | 13 x 8.5 | x 4..17, z 0..8.5 |
| Dining room | 18x16 | 9 x 8 | x 4..13, z 8.5..16.5 |
| Laundry | 8x8 (set) | 4 x 4 | x 0..4, z 4..8, off the mud room |
| Bathroom | 8x8 (set) | 4 x 4 | x 13..17, z 8.5..12.5 |
| Bedroom 1 | 12x12 | 6 x 6 | x 17..23, z 0..6 |
| Bedroom 2 | 13x12 | 6.5 x 6 | x 17..23.5, z 6..12 |

A central open passage, x 13..17 at z 12.5..16.5, is the foot of the main stair.

Upstairs, y 2.7, x 40 to 62 (to the east of the ground floor, over the falling lawn, on posts):

| Room | Size ft | Size m | Position |
|---|---|---|---|
| Living room | 32x21 | 16 x 10.5 | x 40..56, z 5..15.5; stove on the east wall; French doors on the south to the deck |
| Balcony deck | 8x24 (set) | 4 x 12 | x 42..54, z 15.5..19.5 on posts, open rail, a small outside stair to the lawn |
| Primary suite | 25x15 | 12.5 x 7.5 | x 40..52.5, z -2.5..5; sunken bedroom (a 0.4 m step down by a short ramp, see below) and a soaking tub alcove |
| Bath 2 and bath 3 | 6x8 (set) each | 3 x 4 | one off the suite, one off the living room's west end |
| Loft landing (to the loft) | 12x10 (set) | 6 x 5 | at y 5.0, x 56..62, z 5..10, reached by `loft` stair from the living room's east end |

Basement, y -2.7 (a lower pavilion at the foot of the slope, south of the ground floor, x 2 to 28, z 22 to 30):

| Room | Size ft | Size m | Position |
|---|---|---|---|
| Walk-out family room | 25x15 | 12.5 x 7.5 | x 2..14.5, z 22..29.5; wood stove on the north wall; walk-out glass doors on the south to the patio |
| Home theater | 14x16 (set) | 7 x 8 | x 14.5..21.5, z 22..30; curtain doorway; tiered cushions |
| Patio | | 12 x 5 | x 2..14, z 29.5..34.5, open to the lawn at y -2.7 |

### Joins

- **Arrival.** The cat enters from the lawn at the **mud room's west door** (the real arrival side), landing facing east; the world map entry and the "enter the house from outside" use the existing gateway shape (`src/gateways.js`).
- **Main stair** `ground` to `upstairs`: a covered breezeway runs east from the open passage along z 14 (ground level, x 17 to 31.9), then the stair rises from (31.9, 14) to (40, 14): 2.7 m over 8.1 m (1 in 3, the engine's cap), 2.4 m wide, its top opening at the living room's west wall. The camera rules already treat stairs as walled.
- **Basement stair** `ground` to `basement`: from the dining room's south end at (9, 16.5) south to (9, 22), a 1-in-3 flight of 8.1 m, but only 5.5 m lie between the dining room and the basement pavilion, so it is laid as two runs of 4.05 m meeting at a landing (the plan takes two stairs that share a landing; M0 checks this).
- **Walk-out door**: the family room's south glass doors lead to the patio at y -2.7, which meets the lawn; the lawn is a ground strip falling from y 0 at z 17 to y -2.7 at z 29.5 (a 1-in-4.7 slope, within the engine's 1-in-3 cap), so the cat can also walk from the front yard down the slope to the patio, and the camera never dips below drawn grass (the Old House's H4 ruling).
- **Deck**: its stair to the lawn comes down on the east side; the deck is a floor at y 2.7 with a rail, the posts below are drawn.
- **Loft stair**: living room east end up to the loft landing (2.3 m rise over 6.9 m).
- **Sunken bedroom**: one small ground disc 0.4 m down with a ramp strip of 1.6 m (grade 1 in 4), so the cat can walk into the sunken bed without a "step" and the camera follows. A test pins the sunken step as walkable both ways.
- **Bounds:** the plan's bounds are about x -4 to 66, z -6 to 36, and the corner map scales to fit.

No two rooms share an x,z on different levels; the existing "every x, z has one level" plan test applies unchanged.

## 3. The mid-century exterior: a modelling brief

The recognisable exterior is a first-class feature, not an afterthought, since it is what the family will point at.

- **Roof.** Low-pitched or flat, thin-edged. Drawn as slabs (one lid per zone: ground, upstairs, basement pavilion, loft), dark grey-brown shingle texture from the atlas (a horizontal-course shingle cell). **Wide overhangs**: 1.6 m beyond the walls on the south (the glass side) and 1.0 m on the other sides, with a slim fascia board 0.25 m thick. A shallow single slope on the upstairs lid (0.12 rise), flat on the others.
- **Siding.** Auburn (reddish-brown) vertical-board cell, the main wall colour outside (around 0x7a3b22 before lighting). Walls are shared with the Old House's wall sections; the exterior face takes the siding cell, the interior face a warm plaster or wood cell.
- **Glass walls.** The south walls of the kitchen/dining, living room and family room are almost all window: floor-to-ceiling panes in 4 m sections with thin dark mullions, glass drawn as the engine's pane material. Section windows are 2.4 m high with a 0.05 m sill.
- **Clerestory.** A continuous strip of high windows under the roof edge on the north walls (the living room's tall wall 4.6 m, with a band at 3.4 to 4.4 m), which let sun in at slant angles; they drive the sunbeam slots.
- **Deck.** A cantilevered balcony, wood-plank cell, rail with vertical slats, round posts (hex posts, as the Market's) going down to the falling lawn; a barbecue shape and two chairs as tiny props.
- **Patio.** Flagstone-look cell, low stone wall, the walk-out doors, a stove chimney.
- **Chimney.** One plain tall flue per stove, a flat cap, as plain boxes.
- **Wooded lot.** A ring of tree clusters (reuse the Woods and Pines tree builders, a handful of merged conifers and bare-trunk hardwoods) on the slope with a thin fence; the front of the lot is open, so the house is seen from the outside. A path runs from the entry to the mud room's door.
- **Look from outside.** The first view on arrival is the exterior seen from the lawn, roofs on. When she enters a zone's footprint or zooms out one step, that zone's roof lid fades out (the same rule that sinks walls: `housewalls.js`), so from the first zoom-out step she sees the dollhouse: floor, furniture, cats, with walls sunk near the camera and the other zones' roofs still on, giving a view of a stepped mid-century massing with the active zone cut open.
- **Dollhouse and the unfolded plan.** The cut-away already hides the zone above and sinks near walls from the first zoom-out step in the old house; here the roof lids are the new piece (`houseroofs.js`), hidden by the same state as the near-wall sinking, never a pop: a fade of 0.4 s.
- **Triangle cost of the exterior** is in the budget table. It is drawn in the fixed set, so it must stay small: slabs and boxes, no curved geometry beyond the hex posts.

## 4. Room contents and activities

Everything is cat-fun and storybook-warm, never scary, no jump scares. The words go through the word tables for both word sets.

**Kitchen / dining area.** Knock-overs (a fruit bowl, a pepper mill, a mug, a loaf of bread) on the counter and the island, reached by a stool climb; a sunny floor patch ("slot") under the glass wall; mice in the pantry corner (`src/critters.js`).
**Dining room.** A long table with a runner; a hanging plant to swat; a sunny slot under the window; a chair-to-table climb route.
**Bedrooms.** Bedroom 1: a made bed to bounce on, a sock basket to dig in. Bedroom 2: a bookshelf climb and a window perch with a bird feeder outside (birds are a drawn flutter, no catching).
**Bathroom.** A bath mat, a sink to drink from, a tub edge to balance along (a rooftop-style move).
**Mud room.** A boot rack and coats on hooks to leap from; a cat flap in the door (a discovery: the cat flap that rings a tiny bell).
**Laundry.** A basket of warm towels to curl up in (nap spot) and the dryer top.
**Living room (the heart of the first slice).** The wood stove with a hearth rug (a **stove hearth nap**: staying within reach for a few seconds warms her, a tiny glow, the "purr" sound); the French doors to the deck; a sofa with a throw to knead; a coffee table with knock-overs; tall shelves to climb; the vaulted ceiling's clerestory throws **sunbeam slots** on the floor that move slowly across it through the day (using the day clock the game already has); a ceiling fan that turns.
**Primary suite.** The **sunken bed nap** (walk down the ramp and lie in the bed; tiny pillow-fort effect), the soaking tub alcove (drink, a rubber duck to knock in), a window seat.
**Loft.** A reading nook above the living room: cushions, a telescope, a view down over the room and out to the trees.
**Basement family room.** A wood stove with a second **hearth nap**, a rug and bean bags, a shelf of board games to knock over, a ball pit corner of yarn balls.
**Home theater.** The **theater cushion**: sit on the front-row cushion to start a drifting screen of tiny shapes, a popcorn bowl to knock over, a curtain to walk through.
**Deck and patio.** Deck rail balance route to the top of the post; a pot plant; a wooded view; a birdbath. Patio flagstones to sun on.
**Golden mice.** The existing golden-mice system (`src/goldmice.js`): six in M1, two per floor-zone; four more in M3. Hand-placed, seeded on the room seed only.
**Discoveries (`src/discoveries.js`).** M2 adds about eight, each a small storybook moment: the cat flap's bell; the sunbeam found in the living room; the stove's warm glow; the sunken bed's pillow fort; the theater's first picture; the clerestory's view of treetops; the deck rail's bird; the basement's yarn pit. Each pays once per walk and counts for both children on a co-walk.
**Found items.** Four wearables per area (the found-outfits pattern), family-flavoured and invented (a knitted scarf, a tiny reading-glasses pair, a paper crown, a bell). They are new find-only items and are named by the owner and his daughter.
**Yarn ball.** One lies somewhere each walk, as everywhere.
**Climbing routes.** Shelf-to-shelf and stool-to-counter, using the Rooftops moves, every leap lands.

## 5. The cat residents

D2, Digit and Robbie live in the home, reusing the family-cats Easter egg (they are existing `CATALOG.cats` ids with their coats in `src/cat/model.js`; the family cats' coat fixes remain that branch's business). They are not Colony cats and not strays, and Rosa is not included.
- **Behaviour reuses the Old House's resident-cat code** (`houselife.js`, the arrival/greeting lines in `housecats.js`): each cat has two or three home spots, moves between them on a slow timer, and says one hint line when the child comes near that points at something not yet found.
- **D2** (large, calm): the stove hearth or a sunbeam slot, the sofa. Gentle hints.
- **Digit** (young, leggy): zoomies along a route (a short run of seeded waypoints), the theater cushion, the loft. Playful hints, and a "chase me" mini-moment (never a fight).
- **Robbie** (compact, chaotic): in the kitchen near the knock-overs; his line is a joke about the thing he just knocked off.
- The children's own cat is the player; if she plays D2, Digit or Robbie, that cat is simply not shown as a resident (a test).
- Friendship is the Old House's per-child record, kept in the family save: finding everything in the home earns a special entry for each of the three; there is no new currency.
- **Count.** Three residents always present plus the player and the partner is five cats on screen at most; each costs about 4,000 to 9,000 triangles (Old House measure: one kitten 8,800), so residents are drawn only in the active zone (see budgets). Co-walk: both children see each other anywhere in the house, as in the Old House.

## 6. Budgets

Known today (from the wing spec's measure at main 544daaf3): the Old House's worst spot is 63,292 triangles, 308 meshes, 171 casters against the ceiling of 70,000 / 450 / 380; its chunk is 34.5 kB gz against 100; start-up is 704.8 kB gz against 720. Walls are in the fixed set and never culled, which is why the wing spec adds zone drawing. The family home takes that as its **base design**, not a retrofit.

Ceilings for the family home (the street ceiling, the aim 10 percent under it at the worst spot): **450 meshes, 380 casters, 70,000 triangles ceiling; 300 / 200 / 55,000 aim**, measured at the worst spot by the existing `measureHouse` helper pointed at the family plan.

| Zone | What is in it | Drawn in full when she is | Triangle ceiling (full) | Far stand-in |
|---|---|---|---|---|
| Shell (fixed) | all walls as simple sections, roof lids (when on), siding, glass panes, posts, trees, lawn | always | 24,000 (walls 14,000, roofs 3,000, posts and trees 7,000) | |
| Z1 Kitchen and dining | kitchen, dining room, mud room, laundry | in Z1 or the stair that touches it | 9,000 | 400 |
| Z2 Bedrooms and bath | two bedrooms, bath | in Z2 | 6,000 | 300 |
| Z3 Living room and deck | the living room, deck, loft landing | in Z3 | 11,000 | 500 |
| Z4 Suite | primary suite, baths | in Z4 | 7,000 | 350 |
| Z5 Basement | family room, theater, patio | in Z5 | 9,000 | 400 |
| Cats and things | the player, the partner, up to three residents drawn in the active zone, walk things | | 10,000 | |
| Worst spot sum | shell + the largest zone (Z3) + one neighbour (Z1) + cats + walk things, with stand-ins for the rest | | 24 + 11 + 9 + 10 = 54,000 | under the 55,000 aim and the 70,000 ceiling |

Zone drawing (`createZoneDrawing`, specified in the wing spec) is built in M1, not later. Roof lids are in the fixed set but are hidden whenever she is in that zone or the camera is at the first zoom-out step or farther, so the worst spot never carries the roof of the zone she is in; the test measures with the active zone's lid hidden.

**Chunk.** `family` is its own lazy chunk (its own `AREA_GZIP_CEILING_KB` entry 100; the aim is 60 kB gz including the plan, furniture and lines); the start-up chunk grows by under 0.5 kB, the flag block, and the 720 kB start-up ceiling is not raised. In the public build the chunk is not produced at all.

**Textures.** The family atlas is the Old House atlas plus cells for shingle, auburn siding, flagstone, plank deck and rug; one extra 256 px atlas at most (the Market went to 8x8; the count is pinned by a test).

**Camera tests.** The never-lost-behind-a-wall suite (`test/housecamera.test.js`) is run for the family plan: every room, every doorway, both stair ends, the deck, the patio and the loft, for both players, at every zoom step, the glass walls included (a glass wall sinks the same as a plain one, panes hidden together). New cases: the camera does not enter the deck rail; the slope lawn never leaves the camera under drawn grass; the sunken step is walkable both ways; in the dollhouse view the roof of the active zone is hidden. The budget test and the plan test (one level per x, z; every room reachable from the entry; stair grade at most 1 in 3; sizes equal the feet times 0.5) are parametrised over the plan.

## 7. Milestones (each mergeable by itself)

- **M0. A plan-agnostic house engine (public repo, no personal data).** The house code takes its plan from an argument; the old house is the only plan and all its tests and its triangle pins stay identical. Also the private flag, `build:family`, the privacy test and the CI guard (with an empty `src/family/` holding a one-room test plan so the grep test has something to prove). Merge-safe: the public build is unchanged.
- **M1. The shell and the first slice.** The exterior (roofs, siding, glass, deck, trees, patio), the ground floor, the living room with its stove, the basement with the walk-out door and the theater, the stairs and the loft stair, the zone drawing, the three resident cats standing at their spots, the world-map place and the family save. Camera, plan and budget tests green. Pictures for the owner from the test page.
- **M2. Details, discoveries and the cats' life.** The primary suite and baths, the rest of the room contents above, golden mice, discoveries, found items, knock-overs, climbing routes, resident hints and friendship, the family sound (creaks, the stove), dusk lamps, co-walk and pad checks, the iOS family target.
- **M3. The barn and the yard.** The barn-workshop-garage 69x42 ft (34.5 x 21 m) with its upstairs guest suite on the same split-level system (the guest suite beside the barn, joined by an outside stair), the chicken run, garden beds, the wooded lot with a trail to the conservation land edge (a little boundary stone and a fence; the lot itself is only as large as one more zone), chickens as a drawn flutter with golden mice and a few discoveries.

## 8. Risks

- **The engine is coupled to one plan.** `house.js`, `houseplan.js` and the walk code import constants directly. M0's refactor is the first risk; it is behaviour-preserving and pinned by the existing tests (the old house's triangle counts and the camera suite must not move).
- **Fidelity versus the ground rule.** The unfolded plan changes how the real house is arranged, so the owner may find it less like home than hoped. Mitigation: real sizes and neighbours per floor, the stepped exterior, and a clear picture-based sign-off before M2.
- **The exterior's cost.** Overhangs, glass and posts are cheap as boxes but are always drawn. The fixed set ceiling of 24,000 is measured in M1's first task.
- **Glass walls and the camera.** Floor-to-ceiling glass makes "the wall sinks" less visible and the interior reads through it; tests plus pictures decide.
- **Leaking the private content.** A merge with a wrong import, a stray string in a test name, or a commit message. Mitigation: the grep tests, the local denylist scan before every merge, and the rule above in every task.
- **A second iOS target.** Signing and the nightly refresh must not pick up the family target. Mitigation: its own scheme, excluded from `ios/refresh.mjs`, and a test that the public build output lacks the sentinel.
- **The save.** A separate key means the children's public cats and paws are not in the family build unless imported.
- **Budget growth.** The worst-spot test blocks any addition over the ceiling.

## 9. Open questions (my recommended answer after each)

1. **Unfolded plan or true stacking?** Recommend the unfolded plan for M1 to M3; true stacking is a separate engine design if the family still wants it afterwards.
2. **Does the family build start with a fresh save or import the children's public save?** Recommend a one-time "copy my cat over" import from the public game's exported save text, done in M2; M1 starts fresh with the starter paws.
3. **Where is it served for the iPads?** Recommend the home network first (`preview:family`), then a private host behind a family-only login (Cloudflare Access), then the iOS family target; never a public URL.
4. **Is the repo staying private?** Recommend yes (already decided); if it ever turns public, move `src/family/` into a private submodule (option C) before that day.
5. **Scale: 1 ft = 0.5 m, with the game's 2.8 m walls.** Recommend yes; a bigger scale makes the cat too small in the glass rooms.
6. **Sizes I set (theater, loft, mud room, laundry, baths, deck).** Recommend the owner corrects them from memory in one list before M1 starts; defaults in this document are used otherwise.
7. **Does the family build unlock the family home at the start, or earn it?** Recommend unlocked from the start (it is already theirs), and the rest of the game's places stay as the public game has them.
