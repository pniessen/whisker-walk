# The Old House's East Wing: design

Date: 2026-11-22. Status: drafted from a playtester's feedback and the owner's decisions of 2026-11-22; waiting for the owner's approval. Branch `house-wing`. Builds on `2026-11-20-old-house-design.md` (read it first) and **builds only after branch `house-beauty` has merged** (see "Order of work").

## Intent

A playtester asked for more rooms in the Old House: a bathroom, a solarium with sunny patches ("slots") to lie in, a living room with a sofa for cat naps, a secret cat "wonder room" (cat climbing tree, crinkly tunnel, other cat toys) and a kids' bedroom with bunk beds. The two players, a girl of 11 and a boy of 9, already know the house. This wing gives them five more places to explore, each with something to do, and one real secret to find.

## What the owner decided (binding)

1. All five are **new rooms**. The parlour and the existing bedroom do not change (a doorway cut into the parlour's east wall is the only touch on an old room).
2. They live in a **new wing**, joined at the house's existing split levels, with no room above another.
3. The wonder room is **secret**: found the way the bookcase stair is found, by a discovery.
4. Each new room gets **new discoveries**, not only furniture.
5. **Clan Edition only**, as the house is today.
6. **Budget is the designer's call.** Start-up chunk untouched (ceiling 720 kB gz, never raised, about 704.8 today). House chunk well under its 100 kB. Triangles: per-room limits below.

## Facts measured today (branch house-wing at main 544daaf3)

| Thing | Today | Ceiling |
|---|---|---|
| Start-up chunk | 704.8 kB gz | 720 |
| House chunk | 34.5 kB gz | 100 |
| Worst spot, day (ground level, one cat, Mochi) | 308 meshes, 171 casters, 63,292 triangles | 450 / 380 / 70,000 |
| Worst spot, dusk (same) | 305 / 171 / 63,729 | same |
| Other levels, day (cellar / upstairs / attic) | 61,684 / 60,972 / 50,046 triangles | same |
| "Fixed" set (always drawn: cats, walls, hedge, stairs, walk things) | 265 meshes, 46,896 triangles | |
| Walls inside it | ground 8,676, upstairs 2,196, cellar 1,918, attic 1,862 | |
| Ground level's furniture drawn in full | 31 meshes, 11,274 triangles (stand-in: 1 mesh, 348) | |

Read from `BUDGET_LOG=1 npx vitest run test/housebudget.test.js --reporter=verbose`. Two facts drive the whole budget design:

- **Headroom at the worst spot is only about 6,300 triangles**, and house-beauty (building now) will spend some of it.
- **Walls are never culled.** Every room's wall meshes sit in the fixed set (`houseWalls:<level>`), so five more rooms of walls would add about 9,000 triangles to every spot in the house, and the house would break its ceiling before a single chair was drawn. Only furniture is drawn by level today (`src/houselevels.js`), and by level, not by room, so every room on one level is drawn together.

So the wing needs **zone drawing** (below). It is the design's one new engine piece.

## Layout

East of the parlour, over the empty lawn. x east, z south, metres, as `houseplan.js`. Sizes are inner room sizes before wall thickness 0.2; the builder may nudge a wall by a metre if a test (below) asks.

```
GROUND (y 0)                                    z
 ... parlour |        LIVING ROOM       |        SOLARIUM        |.stair 'wing' (rises east)
   x4..14    |        x 14..22           |       x 22..30         |=======> x 30..38.4
  (fireplace)|   z 2..12  (8 x 10)       |   z 2..12  (8 x 10)    |   z 5.8..8.2 (2.4 wide)
             D1 (14, 10.2)               D2 (22, 7)               mouth (30, 7)
 cellar lid sits north of the living room and solarium (z <= 0.25), a 1.75 m lawn alley between.

UPSTAIRS (y 2.4)                                           (this stair's top is KIDS' west wall)
           x 38.4 .. 48
   z -3..2   +---------+  BATH  x 38.4..44, z -3..2 (5.6 x 5)       gap 1.2 m, then the
             |  BATH   |                                           wonder stair's rect
   z  2      +----D4---+---[wardrobe: shut secret leaf]---+  x 45.2..47.6 (centre 46.4)
             |        KIDS' ROOM  x 38.4..48, z 2..12 (9.6 x 10)   |
             | stair arrives (38.4, 7)  bunk beds, desk, toy chest |
   z 12      +-----------------------------------------------------+

ATTIC (y 4.2): the WONDER ROOM x 41..52, z -14..-4 (11 x 10), entered at its south edge
   z -4  from the secret stair 'wonder': (46.4, 2) -> (46.4, -4), 6.0 m long, rise 1.8 (1 in 3.33)
```

Whole house, from above (not to scale; old rooms unchanged):

```
 attic   bedroom                                           WONDER (secret)
 [-24..-14]  [-8..2]                                       [41..52, -14..-4]
                         kitchen            cellar              |  wonder stair
 library | hall | parlour | LIVING | SOLARIUM ==stair==> KIDS + BATH   (upstairs)
```

### How it joins (no stacked rooms)

- **D1** parlour to living room: a doorway cut in the parlour's east wall at z 10.2 (span 9.2 to 11.2, clear of the fireplace at z 6.05 to 7.95 and of the armchair at (11, 8.5)). The only edit to an old room's walls. The wall section builder already splits a wall around a doorway and lets two rooms share a wall.
- **D2** living room to solarium: doorway at (22, 7).
- **Stair `wing`**: ground to upstairs, from the solarium's east wall (30, 7) to (38.4, 7), 8.4 m, width 2.4, slope 0.286 (the same as the main stair). It crosses the lawn like the main stair crosses the courtyard, walled like every stair.
- **D4** kids' room to bathroom at (41, 2); **stair `wonder`** upstairs to attic from the kids' north wall at (46.4, 2), width 2.4, hidden by a shut wardrobe (below).
- Footprints: kids' room and bathroom are on level `upstairs` but over lawn, not over the living room or solarium; the wonder room is on level `attic` far from the attic (-24..-14). Every x, z has one level (`test/houseplan.test.js` already checks this and gets the new rooms for free).
- `HOUSE_BOUNDS` grows to x -24..52. The corner map scales to fit.
- Levels and heights are the existing four. **No new level.** Only new rooms, two stairs, three doorways.

### From outside, and in the dollhouse cut-away

Outside: the living room is a low gabled annex; the solarium is a glass-sided conservatory with sloped glass-look sills and a lean-to; the stair is a covered gallery rising 2.4 m along the lawn; the kids' room and bathroom are a second storey on the end with a chimney-pot; the wonder room is a small windowless-looking loft with one round porthole and no door, standing north of them. A child who notices it from the dollhouse view and asks "how do you get in there?" is the hint working. The house draws walls and no roofs, so nothing hides it from above.

Dollhouse: nothing new. The cut-away already lowers near walls at zoom Far and above. The wing's walls are normal wall sections (`houseSections`), so the same sink rules (`housewalls.js`) apply. The solarium's glass walls are mostly window (wide panes in 4 m sections), which sink and hide their panes together, as windows do.

## Zone drawing (the budget's engine)

Today: `createLevelDrawing` shows furniture of her level and of every level a stair joins (`fullLevels`). With the wing, "upstairs" would draw the bedroom, the kids' room, the bathroom and, through the back stair, the attic, all at once.

New: a **zone** is a set of rooms drawn together. `HOUSE_ZONES`: the existing four level ids stay zones (their behaviour is byte-for-byte what it is now); new zones `east` (living room, solarium), `kids` (kids' room, bathroom), `wonder`. Rules:

1. Her zone is drawn in full: furniture **and its walls**. A wing room's walls join the zone (a group `houseWalls:<zone>` tagged `houseDetail`), so a far wing room costs one stand-in, not its walls.
2. A zone joined to hers by a doorway or stair is drawn in full only while she is within `ZONE_NEAR` (5 m) of that doorway or stair, or standing in it. Otherwise it shows its **stand-in**: one plain mesh of its box, at most 120 triangles, no casters.
3. The wing's zones are decided by where she stands (`zoneAt(x, z)`), not by paws height (the wing's floors share heights with old levels, so `nextLevel` cannot tell them apart).
4. A partner in another zone is always drawn (as today). Their name tag draws over the walls.
5. The old zones never see wing zones as neighbours except `ground` and `east` through D1, and `upstairs` and `kids` through the wing stair's foot. Not through the secret stair until it is open.

Effect: in the wing, the old ground zone becomes a stand-in (saves about 11,000 triangles), so the wing's own worst spot is well under the old one. At the old worst spot (the hall) the wing adds nothing, because D1 is 6 m or more away; standing in the parlour's doorway to the wing adds at most the living room's limit.

## Budget (my call)

**Start-up chunk: untouched.** The wing may add the seams that cannot live elsewhere and no more: new award keys (`discoveries.js`, `hud.js`), a few goal rows, the phrase lines (`clanphrases.js`), the gold mouse rows (`goldmice.js`). Cap: **at most +0.8 kB gz in total** over the baseline taken at the start of M1 (S0, expected about 704.8, after house-beauty), checked every task, and every task reports it. New knock-over kinds, new sounds, new rest kinds and new materials are **not allowed in start-up code**: the wing reuses `cup`, `can`, `book` and `flowerpot` knock-overs and the existing `nap` rest, and its sounds are made in `housesound.js` from audio primitives that already exist. If the lines would break the +0.8 kB cap, the plan moves the wing's phrase lines into a lazy table inside the house chunk (open question 7).

**House chunk:** the wing's code and data go in new files (`housewing*.js`), a rough +14 kB gz (the seven old rooms cost 34.5 kB with all their logic; five rooms with fewer special parts). Cap **H0 + 18 kB and under 55 kB** at every milestone. **No second lazy chunk** unless the chunk passes 70 kB at M3; if it does, `housewingparts.js` and `housewingfinds.js` move behind a dynamic `import()` from `house.js`'s build, the way the house is behind `areas.js`.

**Triangles, per zone drawn in full** (walls, furniture, props, glass, floor decals, all merged; the stand-in is extra):

| Zone | Rooms | Triangles | Meshes | Casters |
|---|---|---|---|---|
| `east` | living room 3,000, solarium 2,400 | 5,400 | 45 | 25 |
| `kids` | kids' room 3,400, bathroom 2,000 | 5,400 | 50 | 30 |
| `wonder` | wonder room | 3,600 | 35 | 20 |

**Spot limits:** every zone's own worst spot (her zone in full, the nearest joined zone in full, the rest stand-ins), day and dusk, with Mochi, is at most **63,000 triangles, 330 meshes, 190 casters**: no worse than the old house is now. The existing 70,000 / 450 / 380 ceilings and the 55,000 / 300 / 200 aims hold for her cat alone, as today. If house-beauty leaves the old worst spot closer to 70,000 than today, the "near" zone at the parlour door is not drawn until she stands in the doorway (rule 2's `ZONE_NEAR` goes to 2 m), so the old worst spot never grows.

**Reuse that pays for it:** one wall and wood atlas for the whole house (the wing adds tiles to it, no new texture); the sofa is the armchair's parts, widened; the bunk bed is the bed's parts plus posts and a ladder; cushions, rugs, shelves and lamps are existing kits; every static prop goes through `mergeStaticProps`, so a room is a handful of draws; the tunnel's rings and the tree's platforms are one instanced-looking merged mesh each; sun patches are one decal mesh per slot room. A prop that costs more than 400 triangles needs a note in its task.

## The rooms, and what the cat does there

Every ledge is a furniture top she stands on (`HOUSE_LEDGES`) and every climb is one of the Rooftops moves with no skill needed (`housemoves.js` rules: climbs and drops at most 1.5 m, hops change height by more than 0.5, take-offs clear of walls). Everything below is data in `housewingplan.js`.

### Living room (8 x 10, ground)

A big old sofa against the north wall, facing the room, a low coffee table, a bookshelf, a rug, a fish tank on a stand, a standard lamp, a pot plant, a basket of knitting. Windows south.

- **Sofa nap.** The seat is a 0.55 m ledge (a hop from the floor 1 m out). She lies on it: the existing nap (E, or pad A, "curl up for a nap"), a purr, and a dent forms in the cushion. After 3 seconds still on the seat: discovery `sofa`.
- **Fish tank.** Stay at the tank 1 s: bubbles and a flash of fish. Discovery `fishtank`.
- **Knock-overs:** a mug on the coffee table (`cup`), a plant on the shelf (`flowerpot`).
- **Climb:** floor to sofa seat to the sofa's arm (0.9, a hop), then to the shelf top (1.45), drops back in short steps. Golden mouse (below).

### Solarium (8 x 10, ground)

A conservatory: glass walls on three sides (wide windows, low sills), wicker chairs, tall plants in pots, a tiled floor, a bird bath on the south side. Four **sunny slots**: warm gold patches on the floor, each 1.2 m across, soft edges, lit by day; at dusk they become pale moon patches (cool, fainter) so the room is still lovely and nothing breaks.

- **Lying in a slot.** A slot is a nap spot (existing `nap` rest, E or pad A). Lying in it the room goes calm: the slot's glow brightens and slowly pulses, dust motes drift slower, the house's tick softens, a purr. After 4 s lying still in a slot: discovery `sunslot` (once a walk). A different slot in the same walk adds a paw to a little count; all four slots in one walk is discovery `sunall` ("Sun-worshipper").
- **Stirring ends it**, as every nap does; nothing can keep her lying there.
- **Plants:** knock a pot (`flowerpot`). A garden mouse under the big fern (a mouse row, see below).
- **Climb:** wicker chair seat (0.55) to the plant stand (1.15), a sunny perch over the room, and drops back in short steps.

### Bathroom (5.6 x 5, upstairs)

A claw-foot bath, a sink and cabinet, a toilet with a cistern, a laundry basket, a bath mat, a window with frosted glass (the round one stays the attic's). It is a tight room; the camera section applies.

- **Bath tub.** The tub's rim is a 0.6 m ledge; she walks its rim and hops into the dry tub (a 0.3 m dip: the bathmat side is a ramp of towels so no precise jump). Discovery `bathtub` the first time she is in it.
- **Dripping tap.** Stay at the sink 1 s: a plink and a ripple. Discovery `tap`.
- **Knock-overs:** a toothbrush mug (`cup`) on the sink, a shaving-foam tin (`can`) on the cistern, a flower in a jar (`flowerpot`) on the windowsill.
- **Hide:** the laundry basket is a box she can sit in (the "Sit in a box" goal counts it).

### Kids' room (9.6 x 10, upstairs)

Two **bunk beds** (one pair on the north-west wall, a lone low bed under the window), a desk and chair, a toy chest, a bookshelf, a rug with a road drawn on it, posters, a night light, a blanket fort on the floor, and the **kids' wardrobe** in the north wall: the secret stair's mouth, shut. The wall beside the stair arrival (west) carries the door light.

- **Bunk climb.** Lower bunk: a 0.55 m ledge, a hop from the floor. Top bunk: a 1.55 m ledge, a hop (rise 1.0, take-off on the lower bunk's pillow end, a ladder drawn beside it as a marker). Discovery `bunk` on arriving at the top: "Top bunk!" The top bunk has a golden mouse (below) and the best view. She drops back in two short steps: to the lower bunk, then to the floor.
- **Blanket fort** (a box on the floor, walk-in, a low fading tent roof): `sits` goal counts it. Stay inside 1.5 s: a flashlight glow. Discovery `fort`.
- **Wardrobe.** Staying at the shut wardrobe 0.8 s swings it open onto the stair. Discovery `wardrobe` (the secret's gate).
- **Knock-overs:** a picture book (`book`) on the desk, a mug (`cup`) on the bedside shelf, a plant (`flowerpot`) on the windowsill.

### The wonder room (11 x 10, attic level, secret)

A big attic playroom lit by a round skylight shown as a pool of light and string lights. Cat toys and cat things only:

- **Cat tree**, four levels: base box 0.55, platform 1.15, platform 1.75, crown 2.3 (square, carpeted platforms 0.9 x 0.9 each; hops of 0.55 to 0.6 up, drops of the same). A **hammock** shelf on the north wall at 1.75 joins the tree's second platform by a 1.5 m leap and drops to the floor by short steps. Discovery `treetop` at the crown, a golden mouse there.
- **Crinkly tunnel**: a 3.0 m, 0.55 m wide open-topped tunnel of crinkly rings along the east wall with a bend; she crawls through (a quarter slower inside, a crinkle sound every half metre; the rings fade when the camera's line passes). Discovery `tunnel` on coming out the far mouth. Both mouths are open so she is never trapped.
- **Scratching post** (a sisal tower): stay at it 1.5 s, a scratch sound and shreds drift. Discovery `scratch`.
- **Feather wand on a spring** hung from a beam: it dances when she is within 1.2 m and swings back when she pounces (walks into it). Discovery `feather`. It also pays the `play` goal type.
- **A cardboard box castle** ("Sit in a box" goal), a second yarn-ball spot, a bell on a ball, a catnip plant that makes the room's lights twinkle (decor only, no gameplay effect).
- **Knock-overs:** none. It is a room to climb and play in, not to tidy.

## How the secret wonder room is found

It is found **exactly like the bookcase stair**: a discovery gates it.

1. The wardrobe stands shut in the kids' north wall, its leaf spanning the stair's mouth (a `SECRET_WARDROBE` record shaped like `SECRET_BOOKCASE`, the same swing, the same colliders-swap by tag, the same wall lintel over it). It reads as a plain wardrobe.
2. Clues, so a curious child can work it out: faint paw scratches on its door; a small light under it at night and a faint crinkle sound when she is within 2 m; the wonder room's round porthole seen from the dollhouse view; the old cat's hint (below).
3. **She stays at the wardrobe for 0.8 s** (from the front, or from the stair side later). It swings open away from her, shows the stair, the discovery `wardrobe` pays, a soft chime.
4. It stays open the rest of the walk. A walk picked up again finds it shut but opening for her again, as the bookcase does. The wonder room and its stair are **left off the corner map until it is open**, then they appear.
5. A partner's or either cat's hold completes it (as the bookcase's does); the other child sees it open.

## Discoveries: new, 13

They pay once a walk through the log's `awardOnce` as the house's six do (`FIND_KEY` `house-find-<id>`), under a new award type **`housewing`**: **8 🐾 each** (the old six pay 12; the wing is plentiful), `wardrobe` pays 12. Triggers are those of `housefinds.js` (stay, still, arrive, along, secret), plus one new one, `nap` (still, on the slot or seat, a longer hold). Names, both word sets. A line is plain text unless a word set supplies a word; **the Clan words come from the word tables** (`words()`), the everyday ones are the same table's other set. No series word is typed outside the tables.

| id | Room | Trigger | Everyday line | Clan line (the changed words) |
|---|---|---|---|---|
| `sofa` | living room | still on seat 3 s | The sofa is the best nap spot in the house! 💤 | same |
| `fishtank` | living room | stay 1 s at tank | So many fish! They glide right past your whiskers. 🐠 | same |
| `sunslot` | solarium | still in a slot 4 s | Warm sun on your fur. Pure bliss! ☀️ | same |
| `sunall` | solarium | napped in all four slots | You found every sunny spot. Sun-worshipper! 🌞 | same |
| `bathtub` | bathroom | arrive in the tub | A cat in the tub, and no water! 🛁 | same |
| `tap` | bathroom | stay 1 s at the sink | Plink, plink. A dripping tap makes ripples. 💧 | same |
| `bunk` | kids' room | arrive on the top bunk | Top bunk! The best view in the room. | kits' room, "the {kids} bunk" |
| `fort` | kids' room | stay 1.5 s in the fort | A secret fort, with a flashlight glow! 🔦 | same |
| `wardrobe` | kids' room | secret hold 0.8 s | The wardrobe swings open… a secret stair! 🗝️ | same |
| `tunnel` | wonder | exit the tunnel | Crinkle, crinkle, crinkle! Through the tunnel! 🌀 | same |
| `treetop` | wonder | arrive on the crown | King of the cat tree! 👑 | same |
| `scratch` | wonder | stay 1.5 s at the post | Scratch, scratch. That feels so good! | same |
| `feather` | wonder | pounce the wand | The feather dances away. You nearly got it! 🪶 | same |

Where the two sets differ it is by one word: the people are "Twolegs" or "townspeople" in the existing `OUTSIDE_WORDS.people`; the wing adds two **word keys** to both sets: `kids` (Clan: "Twoleg kits", everyday: "kids"), `wash` (Clan: "washing-place", everyday: "bathroom"), used in the room names a hint or a card may say. Every other line is shared, as the house's six are today ("same words in both sets for now" was my 2026-11-21 call; this keeps it). Each line is also a snapshot entry in `test/serieswords` and passes `clanwords.test.js`.

Counts: the house goes from 6 to 19 discoveries.

## Golden mice, mice, outfits, yarn

- **Golden mice (my proposal): add two.** `gm-house-4` on the **cat tree's crown** (the secret room's reward) and `gm-house-5` on the **kids' top bunk**. The house goes from 3 to 5 and `GOLD_TOTAL` from 45 to 47. Why not three? Two keep "one in the wing's regular rooms, one in the secret one", and the counter's "of N" changes by a smaller step. Why not zero? A secret room with nothing hidden in it is a let-down. New ids match the golden id pattern (`gm-<area>-<1..9>`) and the 64-id cap; old saves list only old ids and load as they are. The owner may choose 0 to 3 (open question 2). `housethings.js HOUSE_GOLD_MICE` and `goldmice.js` stay equal (an existing test); `GOLD_TOTAL` assertions in `goldmice.test.js` and `housethings.test.js` move to 47 in the task that adds them.
- **Mice to chase:** two new mouse rows (a garden mouse by the solarium's fern, a mouse by the kids' fort), each with a hide; hides are in `HOUSE_HIDES`.
- **Yarn ball:** two new spots (the living room rug, the wonder room), appended to `HOUSE_YARN_SPOTS` (the walk picks by its own stream; appending changes which spot a given walk seed picks, which is accepted, as no house recording exists).
- **Found outfits:** the house has **no spots file yet** (`spotsIn('house')` is empty, so the house has no finds), and the found-outfit rule wants 10 to 15 spots per area. The wing does **not** add a spots file. It records its **four candidate nooks** as data (`HOUSE_WING_NOOKS`: behind the sofa, on the top bunk's pillow, in the dry tub, on the cat tree's crown), each reachable, resting on a mesh, 3 m from yarn spots, so the house's later spots task takes them. A data test keeps them valid.

## Goals and the corner map

- `HOUSE_GOAL_TYPES` gains `sits` (the blanket fort, the laundry basket, the castle are `boxes`) and `housewing` (a new goal row: "Find 2 things in the new rooms", target 2, offered only where the area lists the type, so only the house ever draws it).
- The **corner map** (`houseMapShapes`) draws the wing's rooms, stairs and walls from the plan data. The **wonder room and its stair are not drawn until the wardrobe is open**, and the wardrobe's line is drawn as wall (as the bookcase's is). The minimap reads `areaData.mapShapes` once, so the reveal appends shapes and bumps a version the minimap checks (a one-line seam, Task in M3).
- **Scenic spots (goal `scenic`):** two more, `sunroom` (the solarium's middle, "the sunny conservatory") and `bunks` (the kids' room's window, "the bunk beds at the window").

## Co-walk across floors

- Both children can be anywhere in the wing, in any zone (rule 4: a partner is always drawn; their name tag shows over walls). A partner's cat is not culled when its zone is a stand-in for her.
- Finds watch every cat on the walk, hers first (as the six do). A find a partner makes pays this child too; the wardrobe swings away from the cat whose hold completed; the fish tank, tap, sofa and slots each have per-cat holds (`watcher`). Once-only finds (`treetop`, `bunk`, `tunnel`) are done for every cat once one has them. Sun slots are never "taken": two cats can lie in one slot's patch (it is 1.2 m across, two cats fit).
- The wardrobe and the wing stair are shared; the secret stair's colliders swap in the walk's live list for the whole walk, so a partner arriving later finds it open.
- The 2-player budget case: two dressed cats in the wing's worst room stay under 78,000 triangles (the owner's accepted rare case); the wing's zones are lighter than the old ground, so it should never be the worst.

## The old resident cat's hints

The old cat (spec step 3, "Old Thimble") **is not built yet**: no file exists for her. The wing adds her hints as **data** (`HOUSE_WING_HINTS`, lines in the tables) shaped for her hint system: one for each wing room that points at a find she has not made ("Have you been in the sunny glass room? The warm patches are lovely." ), and one cryptic one for the wonder room ("I hear the wardrobe purring at night... ") that appears only after she has seen the kids' room. A test checks every hint names a real find and a real room. When step 3 lands it reads the list. Her favourite spots gain the sofa. Friendship counts **every** discovery and golden mouse in the house, wing included: it reads `HOUSE_FINDS` and the golden list, which already include the wing (open question 3).

## Camera in tight rooms

The bathroom (5.6 x 5) and the secret stair are the tightest. Nothing new in the rules: walls between camera and cat sink, and "never lost" is tested over every reachable cell, 8 directions, all four view steps, three pitches (`housecamera.test.js` runs from the plan's rooms and stairs, so it covers the wing automatically; it gets slower, so `test/heavy.js` HEAVY_COST is raised for it). New cases written for the wing:

1. The bathroom's corners at the lowest pitch, with the tub and cistern faded.
2. The blanket fort and the tunnel: she is seen inside them at every view step (their low roofs and rings fade when the camera's line passes, as `fadingLedge` pieces do).
3. The cat tree's four platforms, hop to hop, camera never jumps; the crown at the lowest pitch (the camera cannot go inside the platforms above her).
4. The wing stair and the wonder stair at every view step, the wardrobe shut and open, the camera easing.
5. The solarium: glass walls sink and their panes hide together (the pane meshes follow the wall's fraction, as they do for any window).
6. A partner in the wonder room while she is in the kids' room: both seen, the partner's name tag over the wall.

The dollhouse zoom keeps every step in the wing, as in the house (no den cap).

## Pad and controller reach

Every new interaction is one of: walk there and stay or lie (finds), the existing jump button for hops, the existing nap prompt (E, pad A / X by `gamepadinput.js`), a perch's knock key. **No new HTML control, panel or menu.** So `data-pad-layer` has nothing to add; the toasts and the discovery card are the existing ones. Tests: a pad-driven walk reaches every wing find and golden mouse with the stick, the jump button and the interact button alone (`test/helpers/housewalk.js`, the stick-only autopilot `createHousePilot`).

## Save and migration

- **No new top-level save field.** Discoveries pay through `awardOnce` and keep only lifetime tallies in `state.feats`. Adding `housewing` to `AWARDS` makes it a valid feat key; `sanitizeFeats` keeps it, an old save with no `housewing` loads as 0. `test/savefixture.test.js` (the 2026-11-19 fixture) must still pass unchanged, plus a new assertion that `feats.housewing` is absent and reads 0.
- A **walk picked up again** restores its log entries, so a `house-find-sofa` key is added to nothing old; old snapshots lack new keys and just never had them. The wardrobe and tunnel are re-doable, as the bookcase is.
- **Golden mice:** two new ids appended to `state.golden` when found. Old saves load; a save with the new ids on an old build keeps its list (the list is not filtered by `KNOWN_GOLD`), but an old build's feat sanitiser drops `housewing` (accepted, as every earlier place; the tally is a count only).
- **Cloud sync and co-walk wire:** nothing new on the wire. Nothing contacts the database.
- **Old saves in the wing:** a save resumed mid-walk at a spot that is now inside the wing is impossible (it was lawn). A resume whose saved spot is invalid falls back as today (`restSpot`).

## Tests, by feature (all headless; see the plan for order)

- **Plan data** (`housewingplan.test.js`): rooms do not overlap; every x, z has one level; stairs at most 1 in 3 (0.3333); doorways and stair mouths clear of furniture; every ledge hop in range; ledge heights differ by more than 0.5 per hop; bunk and tree reachable by hops from the floor with no skills; the secret stair connects only through the wardrobe; every piece is inside its room.
- **Zone drawing** (`housezones.test.js`): her zone in full, joined zones near only, the old level behaviour byte-for-byte; the stand-ins' sizes.
- **Budget** (`housebudget.test.js`, extended): per-zone triangles, meshes and casters inside the table; spot limits; day and dusk; bookcase and wardrobe shut and open; Mochi; two dressed cats.
- **Camera** (`housecamera.test.js` plus `housewingcamera.test.js`): the cases above.
- **Finds** (`housewingfinds.test.js`): each trigger, once a walk, a partner's hold, a walk picked up again pays nothing twice, the wardrobe swing, the nap holds, `sunall`.
- **Moves** (`housemoves.test.js`, extended): every wing route walked by the real player with the jump button.
- **Words** (`serieswords*.test.js`, `clanwords.test.js`, `offwords.test.js`): every new line in both sets, snapshots refreshed with only the wing's entries.
- **Save** (`savefixture.test.js` and a new `housewing.save.test.js`): old fixture loads, tallies, golden ids.
- **Goldmice/areas/lazybuild**: counts to 47 and the wing's mice reachable; `areas.test.js` and `lazybuild.test.js` pass; the house chunk is the only one that imports `housewing*`.
- **Determinism**: the flat-trace fixture does not move; no `walkRng` or `Math.random` in `housewing*`.

## Picture checks (the owner decides from pictures)

`verify-house.html` gets shots (`HOUSE_SHOTS`) and tours (`HOUSE_TOURS`): `wing-outside` (dollhouse from the lawn, Farther), `living`, `solarium-day` and `solarium-dusk`, `sunslot` (her lying in a slot, Close), `bath`, `bunk-top`, `kids`, `wardrobe-shut`, `wardrobe-open`, `wonder`, `tree-crown`, `tunnel`, and a `wing` film (30 to 45 s: parlour, living room, solarium, up the stair, kids' room, the wardrobe opens, the wonder room, the tree, the tunnel, zoom out). Captions are plain words. **Before and after pictures** are needed for: the parlour (its new east door), the old house's outside from the south and the east (the wing now stands there), and the whole-house dollhouse at Farther. **Owner sign-off** on: the solarium's sun patches, the bunk beds, the tree and tunnel, and the wonder room's lighting, before M3 merges.

## Order of work

1. **`house-beauty` merges first.** It changes the same files (`houseparts.js`, `houseplan.js`, props and wall dressing). The wing branch then **rebases on main** and re-measures every number in the "Facts measured today" table (task 1 of the plan). If the headroom or the byte baseline moved, the limits above move with them and the owner is told.
2. Spec approval, then the plan (`docs/superpowers/plans/2026-11-22-old-house-wing.md`), three mergeable milestones.
3. Each merge and push needs the owner's yes, as house step work did.

## Non-goals

No people, no old cat built here, no new knock-over kinds, no new level heights, no changes to the parlour or the existing bedroom beyond the one doorway, no Legacy Edition, no new menu or HTML, no database work, no change to other places' walks or golden mice.

## Anti-goals

Scary, or a sofa nap that the camera cannot see; a hidden room she can get into without the discovery or get trapped in; a tunnel or fort where the cat is lost behind a wall; a slow wing on an old iPad (it must not stutter); a house that was fine and now exceeds its ceiling at the hall.

## Calls I made (the owner can change any)

1. East wing over the lawn: living room, solarium, a covered stair gallery, kids' room and bathroom upstairs, the secret room in the attic level to the north.
2. Zone drawing, with walls in the zones; no new levels.
3. Thirteen new discoveries paying 8 each (the wardrobe 12), a new `housewing` award.
4. Two new golden mice.
5. The wing's four outfit nooks are data only.
6. Sun patches become moon patches at dusk.
7. No second chunk unless measured.
