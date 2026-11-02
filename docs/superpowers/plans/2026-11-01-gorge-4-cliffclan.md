# The Gorge, part 4: CliffClan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CliffClan moves into the Gorge. Its camp is on the Wide Ledge, with a cave den in the rock behind it. It has a cast of sixteen with its own names, coats and camp colour. The Moor is its neighbour both ways, so GaleClan warriors cross the Gorge's floor and CliffClan warriors cross the Moor. And CliffClan can be picked at last.

**Architecture:**
- **The camp is a disc camp with a ledge variant.** `DISCS.gorge` is an ordinary disc on the Wide Ledge, so trespass, the patrol ring, border marks, the chase, markers and the clan's cast all work as they do in the other four territories. `campLayout('gorge')` returns the same `{ cx, cz, den, rock, seats }` shape. Its seats are authored rather than turned from `CAMP_TURN`, because the den is a cave (`den.cave: true`) and not a bramble dome.
- **The den is cut into the rock.** It is part 2's `CAMP_DEN_RESERVE` rock mass, turned into a roofed opening (`CAMP_DEN`) at the Wide Ledge's height. `rockTerrain`, the ground, the ceilings and the corner map all pick it up from the shape record.
- **Clan cats get their own ground.** Strays keep `STAND_ON`. The clan gets `CLAN_STAND_ON`: `STAND_ON` plus the path legs, the Lookout, the turn, the Wide Ledge and the camp den. `clanWalkableFor` reads it through one new helper, `clanGroundArea`. `roamHomes` learns to count only points on the home's own level.
- **The Moor becomes a neighbour.** `HOMES.gorge` becomes `['moor']`, and the Moor's row gains `'gorge'`. There are two new intruder routes: GaleClan into the Gorge, and CliffClan into the Moor.
- **The switch.** `HOMES.gorge.pickable` flips to `true`, and `CAMP_AT.gorge` puts the camp on the territory map.

**Tech Stack:** Vanilla JS (ES modules), Three.js 0.185, Vite 8, Vitest 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-01-gorge-design.md`. This plan covers owner decisions 6, 9 and 11, the "CliffClan" section, and "How it is split" item 4. It builds on:
- part 1, the ground engine: `…-gorge-1-ground-height.md`, rulings R4, R7, R9–R11;
- part 2, the map: `…-gorge-2-map.md`, G2, G7, G10 and the numbers table;
- part 3, the caves: `…-gorge-3-caves.md`, C4 and C8.

It extends the clan plans `2026-10-31-clan-life-1-cast-camp-verbs.md`, `2026-10-31-clan-life-2-intruders-fights.md` and `2026-10-31-clan-edition-pick-your-clan.md`.

## Global Constraints

Part 2's and part 3's Global Constraints hold unchanged. These are restated because they bind here:

- **Flat maps are unchanged.**
  - `test/flattrace.test.js` passes at every commit, and `test/fixtures/flat-trace.json` is never re-recorded.
  - The Moor's trace is safe: the trace's Moor intruder is slot 0. Its hash picks index 0, which is StormClan, both with two neighbours and with three. The planner measured this. Task 1 pins it.
- **The one knowing change elsewhere (spec decision 9).** From slot 3 on, about a third of the Moor's intruder visits become CliffClan warriors on the new route. The Woods', the River's and the Pines' visits stay identical, and Task 1 pins that with a fingerprint.
- **Determinism.**
  - No new draw on `walkRng` or `strayStream`.
  - The camp, the cast, the seats and the routes are pure functions of the area id.
  - Roaming homes come from the area's own `${areaId}|roam` stream.
  - Intruder visits come from the wall clock, as today.
  - Any new randomness must use a date-seeded stream, `mulberry32(seedFromCode('<date>-gorge-…'))`. This plan adds none.
  - Co-walkers agree with nothing on the wire.
- **`SAVE_VERSION` stays 4.**
  - The only new stored values are `clanPick.mine === 'gorge'`, which the sanitizer already accepts since `isClanId('gorge')` is true, plus `marks.gorge` and scar entries keyed `gorge-<slot>`, which `isCastId` accepts once the cast exists. All are additive.
- **Untouched:** part 2's one-way `gorge-town` post, `goatToday`, the goat, and every border post.
- **Our own words.**
  - Clan names come only from `src/clanwords.js`.
  - Every new cast word passes `test/clanwords.test.js` and `test/clancast.test.js`. A word that fails is swapped for one that passes. The rule is never weakened.
- **Budget:** the Cozy Neighborhood's, as in part 2. The camp adds two meshes: the rock, and the bedding, which is `noCast`.
- **Commits:**
  - Use explicit `git add <paths>`, never `-A` or `.`.
  - Every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Never merge to main and never push.
  - Don't touch other worktrees.
- **Grids over Gorge ground are offset by 0.25 m.** On an exact rock boundary `ground.y` returns the wall's height (e.g. `y(-18, -20) = 9`, `y(20, 40) = 20`), while `onlyOn` counts edges as inside. So every grid sweep in this plan samples cell centres, at `n · 0.5 + 0.25`, and never lands on a rect edge.
- **Tests:** `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`. The build is `npm run build`.

## Rulings (the planner's calls, 2026-11-02; each with what it costs if wrong)

- **K1. The camp is one disc on the Wide Ledge: `DISCS.gorge = { cx: 12, cz: 41.5, r: 5.2, den: { minX: 20, maxX: 26, minZ: 37, maxZ: 43 } }`.**
  - The planner probed this on the built Gorge:
    - all 16 patrol points and all 12 mark points have ground y 8;
    - the ring keeps 1.0 m inside the lip (x 5.8), 2.8 m off the back wall (x 20) and 1.3 m off the south wall (z 48);
    - its north edge, z 36.3, is 0.8 m inside `WIDE_LEDGE_RECT`, so the B → C turn (z 32–35.5) and the ring at (10.5, 33.5) are never in camp;
    - no other walkable level lies under the disc or the den in 2D, so `isTrespassing`'s 2D test is exact here.
  - `den` is optional and is read only by `isTrespassing`: inside the den's rectangle also counts as the camp. So a chase never lands her in the den, and a patrol buddy's walk ends at its mouth.
  - **The den's back is out of the patrol's notice.** The patrol walks the ring (x ≤ 17.2) and notices within `NOTICE_DIST` 4.5 m, as everywhere. So it chases her in the front of the den, about x ≤ 21.5, and not at the back. Sneaking past into the nursery unseen is the game: rivalcats.js's own rule is that "stalking is fun, not a trap". Cost if wrong: a den-wide notice is one flag in `createRivalPatrol`. It lives on the Gorge's disc only, so every other disc is unchanged. It is a literal in `rivalclans.js`, a leaf module, and a test pins it equal to `CAMP_DEN`.
  - Cost if wrong: these are numbers in one record. The ring tests catch a bad move.
- **K2. The den is a cave off the ledge's back wall.**
  - `CAMP_DEN = rect(20, 26, 37, 43, WIDE_LEDGE, 'campDen', 'den')`, with `id: 'campDen'` and `mouth: { x: 20, z: 40 }`.
  - Its ceiling is `WIDE_LEDGE + CAMP_DEN_HEADROOM`, with `CAMP_DEN_HEADROOM = 2.6`. That is a corridor's headroom: room for kits to hop and for part 3's close camera.
  - It replaces `CAMP_DEN_RESERVE` in the openings, so `eastMassS` is cut round it. It is not in `GORGE_DENS`, so it gets no nap and no den tests of its own. It is not in `GORGE_CAVES`, so `caveDepth` is 0 there and the nursery is never darkened.
  - Part 3's close camera and rain shelter apply on their own, because `ground.ceil` is finite there.
  - `WIDE_LEDGE_RECT` loses its `reserved` tag.
  - Cost if wrong: if the owner wants the den dark, add it to `GORGE_CAVES` with a `path`. That is one record.
- **K3. The ledge layout** (`LEDGE_CAMPS.gorge` in `src/world/camp.js`, authored and frozen).
  - `den: { x: 23, z: 40, r: 0, h: 0, cave: true }`: the den's centre, and no collider.
  - `rock: { x: 8.3, z: 41.5, r: 0.6, h: 0.8 }`: on the ledge's lip side, 1.9 m in from the lip.
  - The seats:
    - `leader: { x: 8.3, z: 41.5, y: 0.8, face: Math.PI / 2 }`, on the rock and looking west out over the gorge (spec: "a rock at the ledge's lip looking out");
    - `deputy: { x: 9.5, z: 41.5 }`, 1.2 m from the rock towards the centre;
    - `elders: [{ x: 24.8, z: 38.4 }, { x: 24.8, z: 41.6 }]`, at the back of the den;
    - `kits: [{ x: 21.6, z: 38.8 }, { x: 22.6, z: 39.4 }, { x: 22.6, z: 40.6 }, { x: 21.6, z: 41.2 }]`, the nursery inside the den. Kits 0 and 1, and 2 and 3, are the hop pairs.
  - **Why the rock isn't right at the lip.** The patrol ring must clear every collider by `0.6 + CAT_RADIUS + 0.4` (rivalworld). With the ring 1.0 m inside the lip, the rock can be no nearer the lip than x 8.1. The probe measured 0.90 m from the rock's edge to the ring, against 0.75 needed.
  - Every seat is at least 0.6 m from the rock's edge and at least 0.5 m from every other seat. Every seat in the den is at least 1.2 m from its walls.
  - Cost if wrong: these are numbers, held by Task 3's tests.
- **K4. Clan ground in the Gorge.**
  - `CLAN_STAND_ON` is `STAND_ON` plus leg A `[2.4,5.4,-2,34]`, the Lookout `[2.4,8.8,-8,-2]`, leg B `[5.8,8.8,-2,32]`, the turn and the Wide Ledge `[5.8,20,32,48]`, leg C `[9.2,12.2,-18,32]` and `CAMP_DEN`.
  - It never includes a lip, a deep cave, a small den or the Snug Cave stop.
  - `area.clanStandOn` holds it. `clanWalkableFor` checks against `clanGroundArea(area)`: the same area with `keepOut.onlyOn` swapped for `clanStandOn`, cached per area, and the area itself when it has none.
  - So a clan cat can walk her up the cliff path on patrol, and strays still can't.
  - Cost if wrong: a buddy that should stop at the path's foot is one rectangle list.
- **K5. Roaming homes count only their own level.**
  - `roamHomes(areaId, area, isWalkable)` reads `area.ground`. When the ground is not flat, a point on the 2 m ring or the 6 m circle counts only if `ground.sameLevel(x, z, px, pz)`.
  - Flat ground skips the check, so the four shipped camps' homes are bit-identical, and a test pins that.
  - Without this, the probe put two homes on path legs, counting floor points 1 m below as their ring. With it, the eight homes are six on the floor and the Narrows and two on the clifftop, with 6 m circle counts of 12–14 out of 16.
  - Cost if wrong: none to other maps.
- **K6. The cast** (`CLAN_CAT_PREFIXES.gorge`, in slot order).
  - The words are `Crag, Granite, Scree, Sprig, Flint, Merlin, Shale, Pika, Gully, Bluff, Tarn, Puff, Nimble, Stonecrop, Thrift, Crest`.
  - That gives Cragstar, an elder Granite…, Screekit, Sprigkit, warriors Flint…, Merlin… and Shale… (the raiders, slots 4–6), Pikapaw, Gullypaw, a deputy Bluff…, an elder Tarn…, Puffkit, Nimblekit, Stonecrop…, Thrift… and Crestpaw.
  - The planner checked each word against stray names, kit names, the other casts and the Gorge's labels. Pebble, Tumble and Juniper are stray names, and Kestrel and Eagle are on `clanwords.test.js`'s taken list, so all five were dropped. The review checked the other fourteen against every rule in that file; Merlin and Thrift were checked against `validPetName` and `DENIED_NAMES` at every suffix.
  - The other clans' first nine were chosen by the owner's daughter. These are the planner's: see Owner question 1.
  - Cost if wrong: any word is a one-string swap until shipped.
- **K7. Coats: ginger, russet and white.** The coats have to read against cool grey rock (`ROCK_LOW 0x59606c`), sand ledges (`0x9c8a70`, `ROCK_HIGH 0xc4b08e`) and the dark floor (`0x5f5d52`). Every rock tone has HSL saturation ≤ 0.35. Every coat base has saturation ≥ 0.45 or lightness ≥ 0.85. The rows are:
  - `coat('tabby', 0xc8682a, 0xf0d2b0, 0x8a3e16, { stripes: true, headStripes: true })`, a ginger tabby;
  - `coat('tabby', 0xb5532a, 0xf4ece4, 0x7a3014, { whiteLegs: true, chin: true })`, russet and white;
  - `coat('tabby', 0xd9925a, 0xf6e6d0, 0xa4602c, { stripes: true })`, pale ginger;
  - `coat('calico', 0xf2ece6, 0xfaf8f4, 0xc8682a, { patch2: 0x5a3a2a, patches: true })`, white with ginger and brown patches;
  - `coat('tabby', 0xc0401e, 0xe8c0a0, 0x7a2410, { fluffy: true })`, fiery red.

  Against every other clan's palette the planner computed a mean distance of at least 89, and every base-to-base distance at least 40, which is `clancast.test.js`'s rule. The closest pair is 41.5: `0xb5532a` against the Woods' `0xa0703f`. The Woods' mean distance is 89.0.
  - Cost if wrong: one row each.
- **K8. The camp colour is `CLAN_COLOURS.gorge = '#9c3b22'`, brick.**
  - It is unlike the other four (green, purple, blue, dark green).
  - Its contrast is 6.1:1 on `CAMP_MARK.badge`. The badge's edge is 4.8:1 on `LAND.gorge`. `test/campmarks.test.js` covers both on its own once the key exists.
  - `CAMP_AT.gorge = [850, 400]`: south-east of the region's centre (815, 353), as the camp sits on the walkable map. The badge (r 21) stays inside r 80, since 58.6 + 21 ≤ 80.
  - The region is small and its label sits at `LABEL_AT.gorge (815, 340)`. If the live check finds the badge on the label, nudge the camp within the region and/or `LABEL_AT.gorge` up. Record the values.
  - Cost if wrong: two numbers.
- **K9. The neighbours.**
  - `HOMES.gorge = row(['moor'], true)` and `HOMES.moor = row(['woods', 'pines', 'gorge'], true)`. The Gorge is appended last.
  - **Re-checking the Moor's patrol order (decision 9).** Since clan life (pick-your-clan D7's note), a patrol runs only where neither kid is at home (`walk.js`: `clanHome` gives `NO_RIVAL`). So `patrolClanFor` only ever returns the territory's own clan on a walk.
  - The rows are mutual, so the neighbour rule works both ways in data. Appending keeps every existing pick pair's `patrolClanFor('moor', …)` answer identical: two picks can't block three neighbours. A test pins every pair.
  - With picks `{gorge, moor}`, `patrolClanFor('gorge', …)` is `null`, so the Gorge has no patrol. That matches today's "none means no patrol".
  - What does change is the Moor's intruder mix: three neighbours now share the slots.
  - Cost if wrong: reordering one row.
- **K10. The routes.** The planner probed both on the built maps with the clan's ground (every 0.5 m clan ground, clear of colliders by `CAT_RADIUS`, clear of water, and at least 3 m beyond the camp's edge):
  - `INTRUDER_ROUTES.gorge.moor = route([-49.5, -6.9], [-20, -6.9], [-15.9, -14], [-15.9, -49.5])`, 73.2 m.
    - It comes in from the Moor through the Narrows, 4.1 m north of the spawn (−44, −11) and 7.1 m from the race pad. That is outside `CHALLENGE_RANGE` (3.5), so a CliffClan kid never gets the Fight pill the moment a walk starts. (The first probe's z −8 was 3 m from the spawn, which is inside it.) It crosses to the west half of the floor and goes north, out the north edge.
    - It threads the floor's column of tors (x −12.6 to −14.2). It stays 2.1 m off the west wall and `denW2`, and stays west of the stream.
  - `INTRUDER_ROUTES.moor.gorge = route([49.5, -2], [30, -5], [20, -30], [20, -49.5])`, 66.2 m.
    - It comes in from the Gorge side of the east edge, 12 m south of the `moor-gorge` post (z −2 against −14), crosses the heath and goes out the north edge.
    - It stays far wide of the camp (−1, −43).
  - Both visits finish inside `INTRUDER_PERIOD` (10 + 73.2 / 0.9 = 91.3 s < 120). The probe measured the closest collider at 0.31 m beyond `CAT_RADIUS` in the Gorge and 0.20 m in the Moor.
  - Cost if wrong: four points each.
- **K11. Fights stay on the floor, and the parked step questions don't arise.** Part 1 parked two owner questions: fights across a 0.3–0.5 m step (allowed now), and a perched cat standing level. The camp and the routes are laid out so that neither can happen here:
  - Every Gorge route sample, and every clan-ground point within `CHALLENGE_KEEP` (10 m) of one, stands at ground y 0 with gradient 0. So no challenge or fight there ever spans a step, a lip or a slope, and none is on the path or in a cave (spec: "never on the narrow path or in a cave").
  - The camp, the den and every seat are one flat level (y 8, gradient 0), with no lip inside the disc. So the leader on her rock and every seated cat stand level, which is correct.
  - No intruder ever reaches the ledge, so no fight happens there.
  - Cost if wrong: if the owner later allows fights on ledges, that is a route change plus part 1's open questions.
- **K12. Fewer strays in the Gorge.**
  - As in every camp territory, the clan replaces strays one for one. `lonersFor('gorge', 22, 0)` is 5, and `(14, 0)` is 4.
  - The Snug Cave's homed stray is still the first ordinary stray (part 3, C8). On a walk where fed colony cats fill every loner slot (four or more fed Gorge cats on LOW, five or more on HIGH), the Snug Cave is empty that walk.
  - Cost if wrong: if the owner wants the cave always occupied, `homes` must take a colony slot too. That is part 3's option, not this plan's.

## Review Focus

1. **A kid who isn't CliffClan climbing past the camp.**
   - On the turn, on leg C or on the floor below the ledge, she is never trespassing and never chased.
   - Chased from anywhere the patrol notices her (the disc and the front of the den), she lands on the ledge's level, outside the camp, never past the lip.
   - Tested in Task 3 (`'the chase in the Gorge lands on the ledge, outside the camp, never over the lip'`).
2. **A CliffClan kid challenging a GaleClan warrior on the Gorge floor near the west wall.**
   - The fight stands on flat floor.
   - The fight camera's choice with the ground stays out of rock and in frame.
   - Tested in Task 4 (`'a fight on the Gorge's route stands on flat floor and its camera stays out of rock'`).
3. **Co-walking sisters, one CliffClan and one GaleClan, in the Gorge or the Moor.**
   - Both devices see the same visitor at the same moment.
   - A visitor of either kid's clan is never hostile.
   - At home there is no patrol.
   - Tested in Task 4 (`'sisters in CliffClan and GaleClan: same visitor, never hostile to either'`).
4. **Picking CliffClan on an existing save, then reloading.** The pick sticks, the save stays v4, the home welcome says CliffClan, and Legacy can't pick it. Tested in Task 5.
5. **A LOW-tier Gorge walk with fed colony cats.**
   - The clan's nine spawn on their seats and homes.
   - Every loner and colony cat still stands on `STAND_ON`, never in the camp.
   - With no fed cats the Snug Cave has its cat (K12).
   - Tested in Task 3 (`'a Gorge walk's strays: the clan takes their slots, the Snug Cave keeps its cat'`).

---

### Task 1: Start from part 3, and pin what must not move

**Files:** none new.

- [ ] **Step 1: Check the base.**
  - Run `git merge-base --is-ancestor gorge-design HEAD && echo parts-2-3-in`. This branch is cut from `gorge-design`.
  - If part 3 has merged to main since, run `git merge main` and record conflicts in the merge commit.
  - Confirm these names with `grep -n`, and record any difference as a two-column table (plan name → real name) in the commit body:
    - `CAMP_DEN_RESERVE`, `WIDE_LEDGE_RECT`, `STAND_ON`, `CORRIDOR_HEADROOM`, `mapShapes`, `GORGE_GROUND_SPEC` in `src/world/gorgeshape.js`;
    - `ROCK_WALKS` and `GORGE_KEEP_CLEAR_RECTS` in `src/world/gorge.js`;
    - `campLayout`, `campDiscs`, `addCamp`, `CAMP_TURN` in `src/world/camp.js`;
    - `clanWalkableFor` in `src/world/clanground.js`;
    - `roamHomes`, `CLAN_COATS`, `CLAN_COLOURS` in `src/clancast.js`;
    - `visitAt`, `INTRUDER_ROUTES` in `src/intruders.js`;
    - `CAMP_AT` in `src/territories.js`, and `LABEL_AT` (a non-exported const) in `src/ui/territorymap.js`;
    - `CAMP_SOON_LINE` in `src/ui/clanpicker.js`;
    - `ground.sameLevel`, `ground.gradient`, `seatOnGround` in `src/ground.js`.
- [ ] **Step 2: Baselines.** Run the full suite and the build. Record:
  - the test count;
  - every area's budget numbers;
  - `shasum -a 256 test/fixtures/flat-trace.json`;
  - a fingerprint of `visitAt(a, k · 120 + 30)` for k 0–399 for woods, river and pines (clan and member id per slot, joined, then hashed);
  - the Moor's slot list for k 0–15.
- [ ] **Step 3: Write the pins.** Add `test/gorgeclan.test.js`. Copy `test/gorge.test.js`'s canvas stub. Its first tests:
  - `'the other territories' intruders never change'`: the three fingerprints equal the recorded strings.
  - `"the Moor's first visitor is the flat trace's, and stays so"`: the first slot of `visitAt('moor', …)` with a visit is slot 0, clan `woods`.
  - Both pass now.
- [ ] **Step 4: Commit** `test/gorgeclan.test.js` with the message `test(cliffclan): pin the intruders that must not move`. Put the baselines in the body.

### Task 2: The den in the rock behind the Wide Ledge

**Files:**
- Modify: `src/world/gorgeshape.js`, `src/world/gorge.js`
- Test: `test/gorgeshape.test.js`, `test/gorge.test.js`, `test/minimap.test.js`, `test/builder.test.js`, `test/rig.test.js`, `test/budget.test.js` (the measured comment only)

**Interfaces:**
- Produces from `gorgeshape.js`:
  - `CAMP_DEN` (K2), frozen;
  - `CAMP_DEN_HEADROOM = 2.6`;
  - `CLAN_STAND_ON` (K4), frozen rects.
  - `CAMP_DEN_RESERVE` is removed.
  - `WIDE_LEDGE_RECT` has no `reserved` key.
  - `CEILINGS` gains the den's cap. `GORGE_GROUND_SPEC.strips` gains the den. `mapShapes()` lists it with `tone: 'rock'`, as the dens are.
- Produces from `gorge.js`:
  - `ROCK_WALKS` gains `CAMP_DEN` and is exported;
  - `GORGE_KEEP_CLEAR_RECTS` holds `WIDE_LEDGE_RECT` and `CAMP_DEN`, so no scenery is scattered in the camp;
  - `areaData.clanStandOn = CLAN_STAND_ON`.

- [ ] **Step 1: Write the failing tests.**
  - `gorgeshape.test.js`:
    - Replace `'the reserved wide ledge and den are left for part 4'` with `'the camp den is cut into the rock at the Wide Ledge's height'`:
      - `CAMP_DEN` is `[20, 26, 37, 43]` at y 8, kind `'den'`, mouth `(20, 40)`;
      - no mass overlaps it;
      - its ceiling is at 10.6;
      - every point 0.3 m outside it is rock except across x = 20;
      - `ground.y(23, 40) === 8` and `ground.ceil(23, 40)` is 10.6 within the inset.
    - Add `CAMP_DEN` to the shared flood's targets. The den's back corner `(25.5, 42.5)` is reached.
    - The flood's `'nothing reached stands on rock'` and lip tests pass unchanged.
    - `'clan ground is every open ledge and path, never a lip, cave or small den'`:
      - every `CLAN_STAND_ON` cell on a 0.25 m grid is reached by the flood and has a shape of kind `'walk'` or `'den'` (the camp den only) under it;
      - no `GORGE_CAVES` rect, `GORGE_DENS` rect or lip overlaps `CLAN_STAND_ON` by more than 1e-9.
  - `gorge.test.js`:
    - `'the reserved wide ledge holds nothing'` becomes `'the camp ledge and den hold only the camp'`: no POI, find, scenic, mouse, ring, rest, hide or scenery item is inside `WIDE_LEDGE_RECT` or `CAMP_DEN`.
    - `'no rock hangs over walkable ground'` keeps passing with the den's cap. This is part 2's raycast test.
    - `'the den's mouth and cap are drawn from the ground'`: a ray east from `(19.5, 8.15, 40)` enters the den unblocked, and a ray straight up from `(23, 8.05, 40)` hits `rockFaces` at 10.6 within 0.02.
  - `minimap.test.js`: the Gorge's rock list equals `mapShapes()`. Update any pinned count, with a one-line reason.
  - `gorge.test.js`: `expect(CEILINGS).toHaveLength(14)` becomes 15.
  - `builder.test.js` (~845) and `rig.test.js` (~217) build `rockTerrain` from `WALK_SHAPES` plus caves plus `GORGE_DENS`, next to the real `MASSES` and `CEILINGS`. Once the masses are cut round the den, the den floor would be missing there. Both build from the exported `ROCK_WALKS` instead, and their rim and overhang tests run again.
- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run test/gorgeshape.test.js test/gorge.test.js test/minimap.test.js test/builder.test.js test/rig.test.js`.
- [ ] **Step 3: Implement** K2 and K4's data. Update both files' header comments: the camp lives on the Wide Ledge, and its den is cut into the east rock.
- [ ] **Step 4: Run the full suite.**
  - Expected: PASS.
  - Write the Gorge's re-measured built and merged numbers into `test/budget.test.js`'s comment. They move by the den's faces only.
  - The flat-trace hash is unchanged.
- [ ] **Step 5: Commit** `src/world/gorgeshape.js src/world/gorge.js test/gorgeshape.test.js test/gorge.test.js test/minimap.test.js test/builder.test.js test/rig.test.js test/budget.test.js` with the message `feat(gorge): CliffClan's den cut into the rock behind the Wide Ledge`.

### Task 3: CliffClan's cast and its camp

**Files:**
- Modify:
  - `src/clanwords.js`: `CLAN_CAT_PREFIXES.gorge` (K6), and the header line "No gorge row yet" removed;
  - `src/clancast.js`: `CLAN_COATS.gorge` (K7), `CLAN_COLOURS.gorge` (K8), and `roamHomes` level-aware (K5);
  - `src/rivalclans.js`: `DISCS.gorge` (K1), `isTrespassing` reading `den`, and the header's per-camp note;
  - `src/world/camp.js`: `LEDGE_CAMPS`, `campLayout`, `campDiscs`, `addCamp`;
  - `src/world/clanground.js`: `clanGroundArea`, `clanWalkableFor`;
  - `src/clancats.js`: `seatFor` keeps a seat's `face`;
  - `src/world/gorge.js`: `addCamp(scene, { colliders, ground }, 'gorge')`, after the tors and pines and before the return.
- Test: `test/clanwords.test.js`, `test/clancast.test.js`, `test/scars.test.js`, `test/camp.test.js`, `test/rivalclans.test.js`, `test/rivalworld.test.js`, `test/clancats.world.test.js`, `test/clancats.test.js`, `test/edition.test.js`, `test/budget.test.js` (the comment), `test/gorgeclan.test.js`

**Interfaces:**
- Consumes: Task 2's `CAMP_DEN`, `CLAN_STAND_ON` and `areaData.clanStandOn`; `ground.sameLevel` and `ground.gradient` (part 1); `seatOnGround`.
- Produces:
  - `castFor('gorge')` gives 16 members.
  - `isTrespassing(areaId, x, z)` is true inside the disc, or inside `DISCS[areaId].den` when present.
  - `LEDGE_CAMPS = { gorge: { den, rock, seats } }` (K3), frozen. `campLayout(areaId)` returns `{ cx, cz, ...LEDGE_CAMPS[areaId] }`, with fresh objects, when the area has a ledge camp. Otherwise it returns today's layout.
  - `campDiscs('gorge')` is `[rock]`: a cave den is no collider.
  - `addCamp(scene, area, areaId)`:
    - for a ledge camp: one `clanCamp` group holding `campRock` and `campBedding`;
    - `campBedding` is one merged `noCast` mesh: six discs (r 0.45, 0.06 tall, colour `0x9a7a4a`, `surfaceProps('foliage')`), one under each elder and kit seat;
    - the group's children are seated with `seatOnGround(group, area.ground, { children: true })` whenever `area.ground` is given;
    - one collider, the rock.
  - `clanGroundArea(area) → area`, and `clanWalkableFor(area, areaId)` reading it (K4).
  - `roamHomes(areaId, area, isWalkable)` is level-aware when `area.ground` is not flat (K5).
  - `createClanCats` faces a seat with `face` that way, and every other seat as today.

- [ ] **Step 1: Write the failing tests.**
  - `clanwords.test.js`: `CLAN_IDS_WITH_WORDS` gains `'gorge'`, and the distinct count becomes 80. So every rule in that file, including the taken list and the canon-word scan, covers CliffClan's words. Remove the header line "No gorge row yet" in `clanwords.js`.
  - `scars.test.js` (~58): `isCastId('gorge-1')` becomes true. Use `'gorge-99'` or `'island-1'` for the false case.
  - `clancast.test.js`:
    - `CLANS` gains `'gorge'`.
    - `'clanCast gives nothing for a clan with no row…'` (~113) drops `'gorge'`. The sixteen-names, own-palette and fixed-cast tests then cover it.
    - `'no clan cat name is shared across clans'` expects 80.
    - The colours line gains `gorge: '#9c3b22'`.
    - `castFor`'s lists move `'gorge'` from "none" to "a camp".
    - New, `"CliffClan's coats stand out on the Gorge's rock"`: every `CLAN_COATS.gorge` base has HSL saturation ≥ 0.45 or lightness ≥ 0.85, and every Gorge tone has saturation ≤ 0.35. The tones are `ROCK_LOW`, `ROCK_HIGH` and `LEDGE_COLOR` imported from `src/world/builder.js` (~2947), plus the floor's `0x5f5d52`, so the test fails if the rock is recoloured.
  - `camp.test.js`:
    - Keep `CAMPS` as the four disc camps.
    - `'is null where there is no clan cast'` drops `'gorge'`.
    - New `describe('the ledge camp in the Gorge')`:
      - `'is the authored layout on the disc's centre'`: `campLayout('gorge')` deep-equals `{ cx: 12, cz: 41.5, ...LEDGE_CAMPS.gorge }` and is a fresh object each call.
      - `'the leader looks out from the rock; every ground seat is clear of the rock and of each other'`: K3's clearances.
      - `'the nursery and the elders are in the den, the deputy and the rock on the ledge'`: kits and elders inside `CAMP_DEN` with 1.2 m to its walls; the deputy and the rock inside `WIDE_LEDGE_RECT` and inside the disc.
      - `'addCamp draws the rock and the bedding on the ledge, with one collider'`: two meshes, `campBedding` noCast. On the real Gorge ground, the rock's lowest vertex is at y 8 within 0.01. Exactly one collider is pushed.
      - `'campDiscs is the rock alone'`.
  - `rivalclans.test.js`, `'the Gorge's den counts as its camp, and no other disc has one'`:
    - `isTrespassing('gorge', 23, 40)` is true, as is `(12, 41.5)`; `(10.5, 33.5)` is false, as is `(3.9, 40)`;
    - `DISCS.gorge.den` equals `CAMP_DEN`'s bounds;
    - no other disc has `den`.
  - `rivalworld.test.js`:
    - `BUILD` gains `gorge`. The ring, collider, reach and camp tests then run on it.
    - In `'the den and the rock are colliders…'`, a layout whose `den.cave` is true checks the rock alone.
    - In `'no seat or roaming home is in … a keep-out'`, `keepOutPoint` is called on `clanGroundArea(area)`.
    - `'nothing the player must reach sits inside the den or the rock'` skips a den with `r: 0`.
    - New, `'the chase in the Gorge lands on the ledge, outside the camp, never over the lip'`. This is Review Focus 1.
      - Use the real patrol: `patrolAt('gorge', t)` every 0.25 s over one lap. Every clan-ground cat spot on the offset 0.5 m grid over the disc and the den that `chaseOutcome('gorge', cat, patrol)` chases at some t is a case. `isWalkable` is walk.js's own `(x, z) => isWalkableAt(area, x, z)`.
      - At least 40 cases, some of them in the den with x < 21.5.
      - No den cell with x > 22 is ever chased (K1).
      - Each case's `findLanding('gorge', out.to, isWalkable, { ground, from: cat })`:
      - is not null;
      - is not trespassing;
      - has `ground.y === 8`;
      - satisfies `ground.canStep(cat, landing)`.
  - `clancats.world.test.js`: `WORLDS` gains `gorge`. All sixteen spawn, and two minutes of wander stays on clan ground.
  - `clancats.test.js`, `'a seat with a face is faced that way; seats without one face the camp centre'`. Use a stub layout.
  - `edition.test.js`: `'the shipped Legacy guards cover the Gorge, and no camp is there until part 4'` becomes `'the shipped Legacy guards cover the Gorge, and CliffClan patrols its camp'`. `rivalForWalk('gorge', 'canon')` and `rivalForWalk('gorge', 'canon', ['moor'])` are both `{ name: 'CliffClan', clan: 'gorge', cx: 12, cz: 41.5, r: 5.2 }`, and Legacy is `null`. The disc exists from this task on, so this is where the pin moves.
  - `gorgeclan.test.js`:
    - `"the four shipped camps' roaming homes are unchanged"`: `roamHomes` for woods, river, moor and pines deep-equals literal values. Print those values from the unmodified code before Step 3, and paste them into the test.
    - `"the Gorge's homes stand on their own level"`: eight homes. Each has its 2 m ring and at least 12 of its 16-point 6 m circle on clan ground at `sameLevel`. None is on a leg, the Lookout or the ledge.
    - `'the camp is one flat level'`. This is K11's camp half. At every seat, every ring and mark point, and on the offset 0.5 m grid over the disc and the den, `ground.y === 8` and the gradient is 0. No lip cell is inside the disc.
    - `"a Gorge walk's strays: the clan takes their slots, the Snug Cave keeps its cat"`. This is Review Focus 5. `lonersFor('gorge', 22, 0)` is 5, and `(14, 0)` is 4. With `createStrayCats` on the Gorge at those counts and `strayStream(7)`, the first ordinary stray is homed at the Snug Cave. Every other stray stands on `STAND_ON` over 600 frames, never in `CLAN_STAND_ON`'s ledge or den rects.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** K1, K3, K4, K5, K6 and K7.
  - `campLayout` checks `Object.hasOwn(LEDGE_CAMPS, areaId)` before `CAMP_TURN`.
  - `camp.js` imports `CAMP_DEN` from `gorgeshape.js`, which is pure, so there is no cycle.
  - `rivalclans.js` stays a leaf and holds the den as a literal.
  - Update `rivalclans.js`'s and `camp.js`'s header notes with the Gorge's probe numbers.
- [ ] **Step 4: Run the full suite.** Expected: PASS, with the flat-trace hash unchanged. Write the Gorge's re-measured budget numbers, with the camp's two meshes, into `test/budget.test.js`'s comment.
- [ ] **Step 5: Commit** `src/clanwords.js src/clancast.js src/rivalclans.js src/world/camp.js src/world/clanground.js src/clancats.js src/world/gorge.js test/clancast.test.js test/camp.test.js test/clanwords.test.js test/scars.test.js test/rivalclans.test.js test/rivalworld.test.js test/clancats.world.test.js test/clancats.test.js test/edition.test.js test/budget.test.js test/gorgeclan.test.js` with the message `feat(cliffclan): CliffClan's cast and its camp on the Wide Ledge`.

### Task 4: The Moor as neighbour, both ways

**Files:**
- Modify: `src/clanhomes.js` (K9), `src/intruders.js` (K10, with each route's comment in the file's style)
- Test: `test/clanhomes.test.js`, `test/intruders.test.js`, `test/rivalworld.test.js`, `test/fightcamworld.test.js`, `test/gorgeclan.test.js`, `test/borderposts.test.js` (runs unchanged)

**Interfaces:**
- Produces: `HOMES.gorge.neighbours = ['moor']` (still `pickable: false` until Task 5), `HOMES.moor.neighbours = ['woods', 'pines', 'gorge']`, `INTRUDER_ROUTES.gorge = { moor }` and `INTRUDER_ROUTES.moor.gorge`.

- [ ] **Step 1: Write the failing tests.**
  - `clanhomes.test.js`, `"the Moor's patrols are what they were for every pair of picks"`. For every pair from `[null, woods, moor, river, pines]`, `patrolClanFor('moor', picks)` equals a table written out in the test from today's rule. Also `patrolClanFor('gorge', ['gorge', 'moor'])` is `null`, and `patrolClanFor('gorge', ['gorge'])` is `'moor'`.
  - `intruders.test.js`:
    - `TERRITORIES` gains `'gorge'`. The route count is 10, the title names the Gorge, and `'no intruders outside…'` drops `'gorge'`.
    - The Moor's "both neighbours come visiting" becomes all three.
    - New, `"the Gorge is visited by GaleClan only, and the Moor by all three"`.
  - `rivalworld.test.js`: `FACING.gorge = { moor: 'west' }` and `FACING.moor` gains `gorge: 'east'`; routes total 10. The six route checks then run on both new routes.
  - `fightcamworld.test.js`:
    - `BUILD` gains `gorge`.
    - Run it and pin the Gorge's measured `maxHidden`, `maxNotUnder` and `maxBrushed` in both modes, plus the Moor's new ones if its route adds views, each with a one-line comment like the file's.
    - If `followBlocked` is 0 on the Gorge (its floor pines stand back from the route), allow 0 for the Gorge only and say why in the comment.
  - `gorgeclan.test.js`:
    - `"the Gorge's route is on flat floor, wide of the path, the caves and the dens"`. This is K11's route half. Every route sample, and every clan-ground point within 10 m of one on the offset 0.5 m grid, has `ground.y === 0` and gradient 0. Every sample is at least 12 m from every leg, lip and ledge rect, and at least 2 m from every cave and den rect.
    - `"a fight on the Gorge's route stands on flat floor and its camera stays out of rock"`. This is Review Focus 2.
      - Every 2 m along the route, from 8 directions, run `fightReach(spot, foeAt, clanWalkable, { actions: true, reachY, terrain: ground })` as `fightcamworld` does.
      - Every staged spot has ground y 0.
      - `chooseFightView({ …, ground })` puts the camera at or above `ground.y + CAM_ROCK_CLEAR` and below `ground.ceil − CAM_CEIL_CLEAR`. Both constants come from `src/camzoom.js`.
      - This is the Gorge's rock check. `fightcamworld.test.js` runs flat (no `ground`), and its comment says so.
    - `'sisters in CliffClan and GaleClan: same visitor, never hostile to either'`. This is Review Focus 3.
      - Over 400 slots, `intruderAt('gorge', t)` and `intruderAt('moor', t)` are equal across two calls.
      - `isHostile(v, { clanHome: true, picks: ['gorge', 'moor'] })` is false for every visitor of either area.
      - With picks `['gorge']`, a GaleClan visitor in the Gorge is hostile.
      - With picks `['moor']`, a CliffClan visitor in the Moor is hostile.
    - Task 1's two pins still pass: the other three territories are unchanged, and the Moor's slot 0 is StormClan.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** K9 and K10. In `clanhomes.js`'s header, note that the Moor's row gained the Gorge last, and why (K9).
- [ ] **Step 4: Run the full suite**, the long `fightcamworld` included. Expected: PASS, with the flat-trace hash unchanged.
- [ ] **Step 5: Commit** `src/clanhomes.js src/intruders.js test/clanhomes.test.js test/intruders.test.js test/rivalworld.test.js test/fightcamworld.test.js test/gorgeclan.test.js` with the message `feat(cliffclan): the Moor and the Gorge are neighbours, with a route each way`.

### Task 5: CliffClan can be picked, and its camp is on the map

**Files:**
- Modify:
  - `src/clanhomes.js`: `gorge: row(['moor'], true)`, and the comment updated;
  - `src/territories.js`: `CAMP_AT.gorge` (K8), and the comment naming the Gorge's camp;
  - `src/ui/clanpicker.js`: `clanPickerModel(state, territories = TERRITORIES, homes = HOMES)` gains a `homes` parameter, so the not-pickable branch and `CAMP_SOON_LINE` stay testable for a future clan once no real clan is greyed.
- Test: `test/clanhomes.test.js`, `test/clanpicker.test.js`, `test/homebase.edition.test.js`, `test/territories.test.js`, `test/progression.test.js`

- [ ] **Step 1: Write the failing tests.**
  - `clanhomes`: `'all five clans can be picked'`.
  - `clanpicker`:
    - five cards, all pickable, with CliffClan's line `HOME_LINES.gorge` ("rocks, cliff dens and tall pines") and no `aria-disabled`;
    - `'a clan that is not pickable shows greyed with camp coming soon'`: the old CliffClan card assertions, run against `clanPickerModel(state, TERRITORIES, { ...HOMES, gorge: { neighbours: ['moor'], pickable: false } })`.
  - `homebase.edition`:
    - `"tapping CliffClan's card picks nothing"` (~258) becomes `'tapping CliffClan's card picks it'`: picking CliffClan saves `clanPick.mine === 'gorge'` and pushes once;
    - `'a refused pick (the gorge) neither changes the save nor pushes'` (~278) now clicks a forged `data-…-pick="island"`;
    - `not.toContain('value="gorge"')` (~293) is the Clan Edition settings select, built from `pickableClans()`, so it becomes `toContain('value="gorge"')`.
  - `progression`, `'a CliffClan pick survives a reload, and the save stays v4'`. This is Review Focus 4. `setClanPick('gorge')` is true in Clan Edition and false in Legacy. A reload gives `mine === 'gorge'`, the stored record's version field is still 4 (read the raw stored record as the file's other save tests do), and `homeWelcome('gorge', state)` is `"Home to CliffClan's land 🏡"`.
  - `territories`:
    - drop `expect(CAMP_AT).not.toHaveProperty('gorge')` (~157) and the `null` camp beside it;
    - `'the pines region has a camp, the island region and the town do not'` (~253): `clanOf(s, 'gorge')` is now a camp;
    - the Gorge region's `camp` is `{ x: 850, y: 400, color: '#9c3b22', … }` in Clan Edition;
    - a CliffClan pick makes it `mine`;
    - `'every camp sits inside its own region'` now covers it.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.** Expected: PASS, with the flat-trace hash unchanged.
- [ ] **Step 5: Commit** `src/clanhomes.js src/territories.js src/ui/clanpicker.js test/clanhomes.test.js test/clanpicker.test.js test/homebase.edition.test.js test/territories.test.js test/progression.test.js` with the message `feat(cliffclan): CliffClan can be picked, and its camp is on the map`.

### Task 6: Check CliffClan live

**Files:** Modify: `docs/VISUAL-PASS.md` (a "CliffClan" entry).

- [ ] **Step 1:** Run the full suite and the build. Confirm the flat-trace hash against Task 1's.
- [ ] **Step 2: Live**, with a temporary launch entry rooted at this worktree, on a port no other build uses. Don't start a server another worktree owns. Use synthetic touch events, as earlier checks did.
  - **The home screen:**
    - The picker shows CliffClan as a normal card. Pick it.
    - The territory map shows the brick camp badge in the Gorge, not over its label (K8: nudge and record if it is).
    - On a Gorge walk the corner map shows the camp marker on the Wide Ledge, in brick.
  - **The Gorge as CliffClan (at home):**
    - The ledge camp: Cragstar on the rock looking out over the gorge, the deputy beside it, the kits hopping in the den and the elders napping at its back.
    - Touch noses, boop, and patrol together with a warrior from the floor up the path.
    - Wait for a GaleClan visitor on the floor (`?` clock helpers if the build has them). Challenge it, fight and win.
      - The fight stands on the floor.
      - The camera never enters the west wall.
      - The name tags read.
    - The home welcome toast.
  - **The Gorge as GaleClan (not at home):**
    - CliffClan's patrol walks the ring on the ledge.
    - Walking in gets her chased: she lands on the ledge, never over the lip.
    - At the den's mouth she is chased. At its back, past the patrol's notice, she can sit with the kits unseen (K1).
    - Climbing the turn and leg C past the camp never starts a chase.
  - **The Moor as GaleClan:** a CliffClan visitor comes in from the east edge, can be challenged, and leaves by the north edge.
  - **Look:**
    - The coats read against the rock on the floor, the ledge and the clifftop.
    - The den's mouth reads as a cave.
    - Part 3's close camera eases in inside the den and out again.
  - **`?perf`** at the camp, on the floor, and on the clifftop look-down facing south, which now sees the camp with its cats. Record them beside part 2's and part 3's readings. If the look-down is over 10% slower than part 3's, stop and report.
  - Check there are no console errors, then reset the viewport.
- [ ] **Step 3:** Write the VISUAL-PASS entry, with what was and wasn't checked. If K8's badge was nudged, commit `src/territories.js` and/or `src/ui/territorymap.js` (`LABEL_AT.gorge`) with it, and keep `test/territories.test.js`'s camp values in step. Commit `docs/VISUAL-PASS.md` (plus those files) with the message `docs(cliffclan): CliffClan's live check`. Report to the controller that the branch is ready for review and not merged.

## Owner steps

1. **Update both devices** before either kid picks CliffClan.
   - An old build keeps a `gorge` pick but shows it as not pickable.
   - It drops scars from CliffClan cats.
   - It sees different Moor visitors from an updated co-walker.
2. **The iPhone 18 check:** on HIGH, 60 fps at the camp and on the clifftop looking down at it.
3. **Show her CliffClan** before the names ship for good (Owner question 1).

## Owner questions

Nothing blocks the build. The build uses each default below.

1. **The cast's names (K6).** The other clans' first nine words were your daughter's. CliffClan's are the planner's: Cragstar, Granite…, Screekit, Sprigkit, Flint…, Merlin…, Shale…, Pikapaw, Gullypaw, then Bluff…, Tarn…, Puffkit, Nimblekit, Stonecrop…, Thrift… and Crestpaw.
   - **Default:** ship these.
   - Any word she picks instead is a one-line swap, if it passes the name tests.
2. **The den is lit, not dark (K2).**
   - **Default:** lit, because it is the nursery.
   - Making it dark like the deep caves is one record.

## What this plan defers

- A legendary cat in the Gorge (`NO_LEGENDARY_YET` keeps `'gorge'`), and the kittypet wanderer (`WANDER_AREAS` stays without it).
- Fights on ledges. Part 1's open questions about fights across a small step and a perched cat standing level stay parked. K11 keeps this plan clear of both.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-01-gorge-4-cliffclan.md`. I recommend **subagent-driven** execution. Tasks 3–5 each change data that many existing world tests read: rivalworld, fightcamworld, the flat trace and the clan casts. A gate per task catches a broken pin before the next task builds on it.
