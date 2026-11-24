# The Moon: a space adventure (design)

Status: design for owner approval (2026-11-23). Plan: `docs/superpowers/plans/2026-11-23-moon.md`.
Design only: nothing here is built. Every number marked "start" is a starting value the builder tunes from pictures.
Concept pictures (cheap placeholders, not the game), made with `verify-moon.html` (`?shot=earthrise|crater-rover|launchpad|layout`):
`earthrise.png`, `crater-rover.png`, `launchpad.png`, `layout.png` in the session scratchpad (`.../scratchpad/moon/`).
Builds on: `suit-dive-moon-design` (63d68c8a: the suit, the Moon sketch), `teleport-gates-design` (the gate that reaches it), the merged suit kit (`src/suithook.js`, `src/cat/suitkit.js`, `src/placephysics.js`).

## 0. Summary for a parent (half a page)

**The Moon is a big place of grey dust, craters and a friendly little moon base, with a story.** The cat steps through a glowing gate in her spacesuit and lands beside a small lander. A round helper robot called **Pip** is asleep there. Pip has one wish: to say **"Hello, Earth!"** The base has no power, so the cat helps: she hops up the moon-rock ledges in low gravity to fetch a glowing power cell, drives the little moon buggy **Dot** along a track of lights to fetch another, finds Earth in the observatory telescope by tracing star pictures (a Mouse, a Cat, a Fish...), chooses a stamp for a postcard (a paw, a star or a heart), loads it into a rocket and presses the big button. She watches the launch (a five-second countdown, then the rocket climbs into the stars). Last, she climbs the Earthrise Ridge and waits; Earth, big and blue over the horizon, blinks her stamp back in its night-side lights. That is the ending. Nothing can go wrong, nothing is timed, nobody is scary, and Pip beeps and shows pictures rather than long text.

**It is as big as the Fairground** (108 x 100 m of walkable ground against the Fairground's 88 x 94, about a third more) but very much emptier to draw: grey dust is cheap, so the Moon stays well under the Fairground's limits (about 50,000 triangles against its 75,000, chunk about 90 kB against its 96). It is built in **stages**, a base first, then three "wings" (Star Hill, the Launch Complex, the Lava Tube), each measured against its budget before it is merged, so the game never ships a Moon that is too heavy for an older iPad.

**Everything the owner asked for is in:** golden mice (3), six discoveries and six activity pages in the journal, one found outfit (a Starlight Cape) and a story prize (a Moon Badge), a rover to ride (two seats, so a sibling can come along), a rocket to launch, low-gravity jumping courses with a long-jump record per cat, Earth to look at and stars to trace. It works in **both editions** (the Clan Edition only adds light starry flavour to the words, for example "Silverpelt" for the star field; the everyday words have no series names). **After the story there is a reason to come back:** every walk Pip has a "postcard of the day" (one small errand worth 25 paws, like the Lighthouse jobs), the rover and the long-jump board keep your best, and twelve Earth postcards fill an album.

**Two things need your decision** (section 10): the Moon's gate stands in the Pines, which only the Clan Edition has, so the everyday edition needs its own gate (recommended: one on the Rooftops); and the real "bound" (jumping across gaps) is a bigger piece of work than the safe low-gravity hop, so it comes last and can be dropped without harming the story.

## 1. What was read (the facts this design stands on)

- **The suit design** (`suit-dive-moon-design`, section 6): a new place reached by a found door; physics row `moon: { medium: 'vacuum', pace: 0.9, hopHeightMul: 4, hopTimeMul: 2.45, climbMul: 2, skip: 0.1 }`; 100 x 100 m sketch with craters, ridges, a lander, six discoveries, 3 golden mice, a found outfit; Earth as one camera-facing quad; the suit is a draw-time look and never touches saved wear. This design replaces its small sketch with the large, story-led place the owner now asks for and keeps its seams.
- **The gate design** (`teleport-gates-design`): a gate is a `GATEWAY_ENDS` row of kind `tele` with `placement: 'inside'`, an explicit `arrive`, `look: 'stonering'`, a twin back, `needWalks`, `edition`; the Moon's gate is the Pines Meeting Ring, its home gate stands by the Moon's spawn; the gate plan's M3 is only the hand-off (gate end + arrival + suit look + test).
- **Pines is Clan-only.** `CATALOG.areas.pines` has `edition: 'canon'`, so an everyday ("Legacy") kid cannot see the Pines at all. The owner wants both editions, so a Pines-only gate would strand the everyday edition. See section 2 (decision D2) and Q1.
- **Suit kit** (merged: `src/suithook.js` `effectiveWear(equipped, place, look)`, `LOOK_OF_PLACE` empty; `src/cat/suitkit.js` the `space` look; `src/placephysics.js` an empty frozen table that **nothing reads yet** (`grep PLACE_PHYSICS src/player.js` finds nothing): the Moon's milestone M0 adds the one reading place).
- **The Fairground** (`src/world/fair*.js`): five files, 213 kB raw, one chunk 96.3 kB gz; built 68,572 triangles, 175 meshes, 109 casters (merged 160 / 104); ceilings 250 / 180 / 75,000 where the 75,000 is flagged "provisional, the owner's to change". How it stays inside: vertex-coloured meshes merged by material, only moving parts kept as separate meshes, hidden faces culled, every number pinned in `test/fair.test.js`, a polish pass that removes before it adds. Bounds `{-44..44, -44..50}` = 88 x 94 m = 8,272 m2.
- **Zone drawing** (`src/houselevels.js`, the Old House wing): what is far is one plain stand-in; the budget is judged at the worst spot, not just the built total. The Moon uses the same idea for its wings.
- **Lighthouse and Greenhouse** (flag-gated places): `?x=1` flag read at call time (`lighthouseflag.js`), a pure `*plan.js` of every coordinate, `*parts.js`, `*life.js`, `*finds.js`, `*pages.js` (journal ids and page words in start-up) and `*words.js` (lazy). Repeat jobs: the kitten and the lamp, 25 paws once a walk (`AWARDS.lighthousejob`), the kitten's hiding place from the room seed. Six finds paid once ever (`lighthousefind: 12`).
- **Hop, climb, leap** (`src/player.js` 270-360, `src/climbing.js`, `src/traversal.js`): the pounce hop is a render-only offset (`hopOffset(elapsed, {height, time})`, 0.35 m / 0.3 s, Spring Paws 0.9 m); what a cat can stand on is `climbBudget` (climb 1.6, reachHigh 2.6, reachLow 1.2; Spring Paws 2.2). Gap leaps (3.5 m, 4.5 with Long Leap, rise 1.6) belong to `traversal*.js` and the Rooftops. `player.speedFactor` (0 while halted by a scare or a crossing) is how other systems take the cat over (`traversallive.js`, rides).
- **Rides** (`src/fairsim.js`, `src/fairlive.js`, `src/game/fairplay.js`): a seat is a moving perch record; the cat is carried; a camera table per ride; every ride is a pure function of the shared clock so two devices agree; a way off at every moment. The cow's back (`farmanimals.js`) is the other carried-cat precedent.
- **Carrying** (`src/carry.js`): one item in the mouth at a time; what is still held at walk end goes to the den as a keepsake. Mission items must be flagged so they return to their spot instead (section 6.9).
- **Couch co-op** (`src/coop/`): `COOP_READY` per place (only `neighborhood` true), a headless second cat, a shared framing camera, cats leashed to the frame. **Pad map** (`gamepadinput.js`): A pounce, X interact, B meow, Y photo, L1/R1 zoom.
- **Gold mice** (`src/goldmice.js`): `GOLD_TOTAL` 48 today, Legacy shows 24; `goldForEdition` skips `edition: 'canon'` areas. `y` is the height over the ground at that spot.
- **Journal and awards** (`src/progression.js` journal id list, `src/discoveries.js` AWARDS, `src/lighthousepages.js`): ids are whitelisted in start-up; counts are "walks it was found or finished on"; `catmerge.js` merges `journal` per key by max, `golden` by union, `walks` as counters, `feats` per key by max; every top-level save key needs a rule there. `SAVE_VERSION` stays 4 for additive keys.
- **Sky** (`render/nightsky.js`, `world/roofssky.js`, `roofslife.js`): the Rooftops build their whole starry sky from their own chunk (`createRoofsSkyDress`) with no shared-code change; `CLOUD_AREAS` lists the places that get clouds (the Moon is not in it). A fixed-evening place sets `areaData.evening` (the Lighthouse's golden hour).
- **Budgets**: start-up 708.9 of 720 kB gz (ceiling never raised, TV mode wants a share), per-place chunk 100 kB gz (`AREA_GZIP_CEILING_KB`), per-place meshes / casters / triangles in `test/budget.test.js` (territories 450 / 380 / 70,000; Lighthouse and Greenhouse 280 / 210 / 62,000), merged ceilings.
- **Not found in the tree:** anything like a drivable vehicle (the rides are rails), a constellation game, a countdown, a rocket, a per-cat record board. All new.

## 2. Decisions in one table

| # | Question | Recommendation |
|---|---|---|
| D1 | Story | **"Hello, Earth!"** (Pip the helper robot, a postcard rocket, Earth blinks back). Alternatives in section 3.1. |
| D2 | How both editions reach it | The Clan gate stays the Pines Meeting Ring (gate plan). The everyday edition gets a **second gate on the Rooftops** (the gate plan's `archway` look, `edition: 'legacy'`), ending at the same Moon ring. Moon rows `moon-pines` and `moon-roofs`, one drawn ring, the home leg follows the edition. |
| D3 | Size | **108 x 100 m** (10,800 m2), 1.3 x the Fairground, eight places of interest, 214 m rover track. |
| D4 | How it stays in budget | Staged: a **base** then three **wings**; a chunk gate (94 kB) and a triangle gate (56,000 built) at every stage; zone drawing for the wings; instanced rocks; merged vertex-coloured meshes; one decal atlas; tiers by quality rung. Section 7. |
| D5 | Moon gravity | **Cartoon** gravity about one third of the game's own hop gravity (real is one sixth; a real 1.4 m hop would hang 2.6 s). Hop 1.4 m high, hang 1.1 s (Spring Paws 3.6 m), climb x2. Section 5. |
| D6 | Real jumping | Two tiers: **Tier 1** (the render hop, doubled climb, stepping-stone beams) ships with the base; **Tier 2** (the "bound": real horizontal travel, rifts, rings in the air, the long-jump record) is its own late milestone behind a decision gate. |
| D7 | Rover | Free steering with a collision-light kinematic sim; **fallback** is the on-rails "Rover Tour" (a pure function of the clock, like the Fairground's rides). |
| D8 | Rocket launch | Event the cat triggers at the Launch Desk (and watches from a mound); 5 s countdown, 17 s flight, a pure function of one start time, a reduced-motion path, no flashing. |
| D9 | Gold mice | **3** (pattern kept): Clan 48 to 51, everyday 24 to 27. |
| D10 | Journal | 6 discovery pages + 6 activity pages = **12** (`mn*` ids), one lazy words file, page names in start-up. |
| D11 | Outfits | Found: **Starlight Cape** (back; "Silverpelt Cape" in the Clan words), 12 hand-placed spots, both editions. Story prize: **Moon Badge** (collar). The suit is not an outfit. |
| D12 | Co-walk and couch | Steps are credited on both devices in a room; the rover has two seats; couch play opens as its own late milestone (`COOP_READY.moon`). |
| D13 | Save | One additive key `state.moon` (`step`, `cells`, `stamp`, `scope`, `jump`), `SAVE_VERSION` stays 4, one `catmerge` rule. |
| D14 | Start-up | Target at most **1.0 kB** gz, estimate 0.9. Section 7.7. |

## 3. The story and the mission

### 3.1 Three story options

| | Story | Uses | Weakness |
|---|---|---|---|
| A. **The Lost Rover** | A little rover, Dot, rolled off in a dust drift and its battery is low. Follow its pings across the crater field, find it in the lava tube, carry back a wheel and a solar panel, fix it, drive it home. | rover (the heart), cave, jumping, finds | Only the rover is the star. The rocket, telescope and Earth view become side things, and the story is over once Dot is home. |
| **B. Hello, Earth! (recommended)** | Pip wants to send a postcard home. The base has no power. Fetch two power cells (a climb and a drive), wake the base, find Earth in the telescope, write the postcard, load the rocket, launch it, and wait for Earth's reply on the Earthrise Ridge. | **every** feature the owner listed, once, in order: ledges and low gravity, rover, base, telescope, rocket launch, Earth view; Dot appears as the rover | A long chain (about 20 minutes the first time), so it is cut into **chapters** that each ship with a stage (section 3.3). |
| C. **The Lunar Lamp** | The big lamp on Star Hill went dark; carry three crystals to relight it and its beam sweeps the plain. | telescope hill, cave, crystals | It is the Lighthouse's job again (climb, light the lamp), so it feels repeated, and it has no rocket or rover role. |

**Recommendation: B.** It is the only one that gives each of the owner's five things a real job in the story, it has a clear and moving ending (the reply from Earth), and its replay hook (postcards) is natural. A's best idea (Dot) lives inside B.

### 3.2 The cast and the tone

- **Pip**, a small round helper robot with a lantern for a head, cat-sized. He beeps, rolls, bobs and shows **picture bubbles** (a battery, a dish, a rocket, an envelope). At most one short line a step. He follows her like the Lighthouse kitten (waits, never runs off), and the **meow button calls him**: he beeps and a gold ring shows the way to the next goal (a hint with no text and no fail).
- **Dot**, the rover, a six-wheeled buggy with a roll bar and a headlamp. Pip's best friend.
- **Earth**, big, blue and warm. Nothing in the Moon is dark, lonely or scary: no dead ends, no darkness (the lava tube glows), no meter that fails, no timer.
- Words are in both sets; the everyday set is the plain base, the Clan set adds light flavour only (section 7.8).

### 3.3 The mission: eight steps in three chapters

Chapters ship with the stages (section 7.2): the base is a complete first chapter, so the Moon is playable and satisfying before the wings exist.

| # | Chapter | Step and the puzzle | Touch | Pad | Keyboard |
|---|---|---|---|---|---|
| 1 | **1 Power** (base) | **Wake Pip.** Walk to the sleeping robot beside the lander (his lantern glints); press Interact. He wakes, beeps and rolls toward the dome; she follows. Teaches Interact, the ring hint, following. | stick, Interact button | stick, X | WASD, E |
| 2 | 1 | **Ridge cell.** A glowing power cell sits on the Skip Ridge's top ledge. Hop up the ledge chain (1.0, 2.1, 3.0 m; the Moon's doubled climb reaches it, Earth's would not). Pick it up (Interact). | stick, Pounce near a ledge, Interact | stick, A, X | WASD, Space, E |
| 3 | 1 | **Rover cell.** A second cell waits at the Far Beacon at the east end of the track (70 m away; she can walk it in about 20 s or drive Dot in 10). Get in Dot at the depot (Interact), steer along the lights, get out (Interact or Pounce), pick it up. | stick (steer), Interact, Pounce | stick, X, A | WASD, E, Space |
| 4 | 1 | **Wake the base.** Carry each cell to the Core in the dome (stand at the socket, Interact "Plug in"). With two cells the base wakes: lights, dish console and mission board come on; Earth glints. A short beat; page `mnstory` starts. (A third cell from the Lava Tube, chapter 4, makes the finale bigger.) | Interact | X | E |
| 5 | **2 Aim** (Star Hill) | **Find Earth in the telescope.** Climb Star Hill's spiral path to the observatory; Interact at the telescope; the scope view opens. **Trace the Mouse** (4 stars, shown faintly the first time) then **the Cat** (7 stars): tap or aim at the stars in order; a line draws between them; a wrong star makes a soft "hmm" and nothing is lost; a hint pulses the next star after 20 s. The dish locks on Earth. | tap / drag the sky, tap Close | stick moves a reticle that snaps to the nearest star, A pins, B closes | arrows, Space pins, Esc closes |
| 6 | **3 Hello** (Launch Complex) | **Write the postcard and load the rocket.** At the Message Desk in the dome, choose a stamp (a paw, a star or a heart) from three big pictures. The postcard is now carried (one item, in her mouth); carry it, or ride Dot, 80 m to the rocket and Interact at its mailbox slot. | big stamp buttons, Interact | left/right + A, X | 1 / 2 / 3 or arrows + Enter, E |
| 7 | 3 | **Launch.** Go to the Launch Desk and press the big red button (Interact). Five-second countdown, then lift-off; watch from the Viewing Mound (the camera stays, the sky tilts up gently). In a room, anyone's press launches for everyone. | Interact | X | E |
| 8 | 3 | **Earth answers.** Climb the Earthrise Ridge to Earthrise Rock (a three-ledge chain) and sit or wait there 6 m or nearer; about 40 s after launch (at once if she launched on an earlier walk) Earth's night side blinks **her stamp** and a chime plays. Pip dances, the dome lamp lights for good, the **Moon Badge** is hers (an owned collar), `moonstory` pays once (40 paws), the Great Cat star-picture (if finished) shines. | wait; look up (drag) | right stick up | mouse drag up |

**Chapter 4 (Lava Tube, optional bonus).** Carry the third **Deep Cell** out of the tube to the Core: the dome's Star Garden blooms, and the finale shimmer on Earth's rim is bigger. It adds no golden mouse (the mice stay 3, section 6.7), so the wing can be cut without hiding anything.

Progress is saved by step in `state.moon.step` and `cells` bits, so a walk can end anywhere; a carried item goes back to its place (never to the den, never lost). Whatever was sent stays sent (`step` 7 means "postcard sent, reply waiting"), so the reply is shown on the next walk without a relaunch.

### 3.4 Sibling-friendly co-walk (online rooms)

- Everything happens in the room's shared world and every device draws it. The **mission is each kid's own save**, with one generous rule: **a step done by anyone in the room counts on every device whose own step it is** (as the Market's treat teamwork credits the partner's device). So the older sister can carry the cell and the little brother still sees the base wake, and still gets his own journal page and paws.
- Two cats can sit in **Dot** (driver and a back-seat passenger); the passenger's Interact is the horn / headlights, so both have a button to press.
- The scope is one cat at a time; the other sees a "stargazing" cloud over the observatory.
- The rocket, the launch time and the reply are **one shared event** (`moon-launch` with the room clock time): both devices run the same pure flight, and the reply is seen by both.
- The long-jump board and the rover lap are per kid; a sibling's record is not shown.
- New events are ignored by older builds (the existing unknown-event rule), and a guest who has not walked the gate uses the gate plan's guest rule.

### 3.5 Couch co-op version (two cats, one screen)

Closed until the Moon's own late milestone flips `COOP_READY.moon` (the gate then says "Two cats go together when we're ready!"). When open: the shared framing camera and leash work as in the Neighbourhood; **Dot has two seats**, pad one steers, pad two is the **navigator** (A honks, Y flashes the beacon, X calls Pip's ring); the **telescope** takes both pads (pad one aims the reticle, pad two pins the star; either alone also works); the **launch** is a two-key "turn together" (both cats stand at the two buttons), but **a lone cat is never blocked**: Pip presses the second key after a short wait. One save (the active profile) records the mission.

### 3.6 Ending and replay hook

**The ending:** Earth blinks her stamp back, Pip dances, the dome's big lamp lights for good, the planted flag shows the stamp, and the Moon Badge is hers. The place now has a permanent glow (a lit dome and a beacon on the Earthrise Ridge) that tells her she finished it.

**Replay hook: "Pip's postcard of the day"** (as the Lighthouse's kitten and lamp). After the story, each walk Pip offers one small errand picked from the room seed (the same for a co-walk), worth **25 paws once a walk** (`AWARDS.moonjob`), and its Earth postcard goes in an **album of twelve** pictures:

1. Moon pebbles: bring three glowing pebbles to Pip's sample tray.
2. Dot's rounds: drive past five lit track posts in order (no timer).
3. A new star-picture: trace the day's guest constellation (a pool of twelve simple pictures).
4. Beat your bound: a long jump even 10 cm past your own record (only when Tier 2 is built; otherwise swapped for 1).
5. Second rocket: load a fresh stamp and launch again.
6. A lost glove: it landed at one of six spots (like the kitten's hiding places); carry it home to Pip.

Also repeatable on their own: the rover lap record, the long-jump board, finishing all five constellations (the Great Cat), 6 finds, 3 mice, a found outfit each walk.

## 4. The place

### 4.1 Size and shape

Walkable bounds `{ minX -54, maxX 54, minZ -50, maxZ 50 }` = **108 x 100 m = 10,800 m2**; the Fairground is 88 x 94 = 8,272 m2, so the Moon is 31 percent larger in area, with a longest straight walk of 130 m against 122 m. North is -z, east is +x. Walking pace 3.5 m/s: the landing site to the far corners is 25 to 30 s; the rover lap (214 m at 7 m/s) is about 31 s, on foot about a minute. Ground is drawn out to 130 m with a low rim of far hills so the edge is never a wall.

### 4.2 The places (coordinates in metres, heights over the ground)

| Place | Centre (x, z) | What is there | Zone |
|---|---|---|---|
| **Landing site** (spawn) | (0, 40); spawn (0, 45) facing north | the boxy lander (its deck at 3.0 m is a perch chain), a planted flag (6, 38), landing-light poles, the **return gate ring** (-10, 41) (5 stones, a lintel, a soft disc), Pip asleep at (3, 43), **Quiet Plain** (-30..-10, 44..49) of untouched dust | A (always) |
| **Moonbase Dome** | (-34, 26), radius 9 | glass dome on a white ring, the Core and its socket, the Message Desk, the Mission Board (picture icons for the steps), six glowing planters (the Star Garden), an airlock tunnel east, two modules | A |
| **Old Dish** | (-44, 14) | a big radio dish on a post with a ledge (a mouse) | A |
| **Crater field** | centre (-5, 8), radius 30 | six craters: Bunny Bowl (-14, 20) r 6 depth 1.2; **Echo Crater** (16, 12) r 8 depth 1.4; Twin Bowls (-2, 4) r 4 and (4, 7) r 3.5, depth 1.0 and 0.9; **Great Bowl** (-20, -4) r 12 depth 2.0 (the Moon Cheese at its bottom); **Sample Pit** (30, -8) r 5 depth 1.0 (a mouse) | A |
| **Rover Depot** | (30, 34) | a shed and Dot; the track starts here | A |
| **Rover track** | loop of 9 waypoints (30,34) (42,20) (46,0) (38,-18) (14,-26) (-10,-24) (-30,-14) (-26,4) (-6,24), 214 m | glowing posts every 6 m; Dot may leave it anywhere the ground is walkable; **Far Beacon** at (46, 0) (the Rover cell) | A |
| **Earthrise Ridge** | x -20..16, z -49..-44, tops at 3.2 m | long ridge with a ledge chain (1.0, 2.0/2.1, 3.0 m), **Earthrise Rock** at (-2, -47) (the viewing perch and a mouse), a bench; the Earth stands over it | A |
| **Bounce Park** | (0, -30) | **Skip Ridge** (8, -40) with the Ridge cell, the eight **Beam Hops** (x -12..12, heights 0.6 to 3.0), five **ring gates**, the **long-jump strip** (x -28..-10, z -22) with a board and posts every metre | A (Tier 1), later Tier 2 |
| **Star Hill** (wing B) | (-38, -32), height 5 m, radius 9 | a spiral path up, the observatory (dome, slit, telescope), the Star Table plaza (-30, -26) | B (drawn near) |
| **Launch Complex** (wing C) | pad (42, -34) radius 8; Launch Desk (30, -28); **Viewing Mound** (24, -20) height 2 | the pad, a gantry, the **rocket** (16 m), two fuel spheres, the desk with the big red button, benches on the mound | C (drawn near) |
| **Lava Tube** (wing D) | mouth (-41, 0) in the Cave Massif (-47, 0); the tube runs west and south to a chamber at (-50, 8) | a 24 m glowing tube, crystals, the **Deep Cell** on a pedestal; always lit by emissive crystals, never dark | D (drawn near) |

Wings are chosen so a wing's detail is far from the spawn (all more than 60 m, so zone drawing can hold them as stand-ins until she goes there). Rough straight-line walks from the spawn: Dome 39 m, Depot 32 m, Crater field centre 37 m, Cave 56 m, Star Hill 77 m, Launch pad 83 m, Earthrise Ridge 92 m.

The sketch is `layout.png` (top-down, labelled with these numbers, the Fairground's footprint dashed, the rover track dotted).

### 4.3 The sky and light

Always "earthrise": one hard white sun low in the east (long blue-grey shadows), a faint blue earthlight fill, a near-black navy sky (`areaData.evening: true`, not a dusk walk), **700 stars** (the Rooftops' chunk-code approach: the sky dress is the Moon's own file, so the shared sky code needs no change; the Moon is not in `CLOUD_AREAS`). A pale dust haze (fog 90 to 260 m) hides the far edge. **Earth** is one camera-facing quad about 8 degrees across, 21 degrees up, 12 degrees east of north, so from the spawn it hangs beside the lander and over the Earthrise Ridge (`earthrise.png`). Sound: a very quiet drone, soft footfalls, one chime for each beat.

## 5. Moon physics

### 5.1 The row and what it changes

`src/placephysics.js` gets exactly one row (the suit design's shape, one number changed):

```
moon: { medium: 'vacuum', pace: 0.9, hopHeightMul: 4, hopTimeMul: 3.6, climbMul: 2, reachMul: 1.5, skip: 0.1 }
```

Every other place is absent from the table and takes the same code path with every multiplier 1, so its numbers are byte-identical. A table test pins "exactly the rows that exist" and re-runs `flattrace.test.js`, `growtrace.*` and the climbing tests unchanged. The reading site is new in M0 (the suit M0 only created the table): `player.js` (hop arc, pace, skip), `game/interactions.js` (the pounce pose timer `session.pounceTime` scaled by `hopTimeMul` in **one** place so the landing thump stays on the arc's last frame), and `climbBudget` callers (climb x`climbMul`, reaches x`reachMul`).

### 5.2 The numbers

| | Earth (today) | Moon (start) | Notes |
|---|---|---|---|
| Gravity | the game's hop is about 31 m/s2 (a cartoon: 0.35 m in 0.3 s) | about **0.3 of that** (hop 1.4 m in 1.1 s) | Real Moon is 0.17 of Earth; a real 1.4 m hop would hang 2.6 s and bore a child. "A third" reads as floaty |
| Pounce hop height / hang | 0.35 m / 0.3 s | **1.4 m / 1.1 s** | Spring Paws 0.9 m becomes 3.6 m, same hang |
| Climb budget | 1.6 m (Spring Paws 2.2) | **3.2 m** (4.4), reaches 3.9 / 1.8 | the ledges and the three mice sit at 2.9 to 3.0 m; the arcs are decoration, reachability is the perch budget (existing rule), so reduced motion changes nothing about what she can reach |
| Walk | pace 1 | pace 0.9 and a 0.1 m skip each stride (none in reduced motion) | a "floaty" feel with no new locomotion |
| Air control | n/a | **full** in Tier 1 (the arc is only drawn; the stick moves her as on the ground); in Tier 2 the bound steers at 60 percent | no double jump, no air pounce |
| Landing | thump and poof | a soft "pff" (the thump lowered and filtered, `audio.js`), 10 dust puffs that hang 1.2 s with no drag | `fx.burst`, tier-scaled |
| Camera | follow at 4.5 m back, 2.2 m up | same; **eased vertical follow at 60 percent** of the hop's height | a 3.6 m bound must not fling the view; zoom steps untouched |
| Reduced motion | flat arc (`FLAT_POUNCE_ARC`) | flat arc, no skip, no dust hang, no camera ease | logical height still simulated for rings and the record |

### 5.3 What stays untouched, what is switched off

- **Traversal, leap and the flat-trace fixtures:** the Moon passes no traversal data (`area.traversal` empty), so `createTraversalLive` has nothing to do; Long Leap and Tightrope Tail behave as on any area with none. Climb caps change only through the `moon` row. Fixtures for every existing place do not move.
- **Swimming and wading:** the Moon has no `waters`, so `waterstate` never runs; there is no water-look code in the chunk.
- **Hops and skills on the Moon:** Spring Paws scales as above; Sure Claws and Fence Runner apply to the Moon's perches (all kind `stone` or `crate`); **zoomies** (sprint) allowed; **the tightrope walk and gap leaps are not used** (the Moon's crossings are beams, Tier 1 hops).
- **Off on the Moon:** strays, critters, ghosts, weather (no rain), the yard dog, rival borders and border patrol fights (`rivalForWalk` sees no rival), the yarn-ball share, the birthday gathering. The suit hides her neck/collar wear and her saved wear returns untouched at the gate.

### 5.4 Tier 2: the "bound" (real jumping)

Tier 2 is an optional, separate piece (`src/world/moonbound.js`, in the chunk) so that Tier 1 stays zero-risk. While she is airborne (a ground Pounce with the stick forward at run speed), `moonbound` halts the player (`speedFactor 0`, as `traversallive.js` does), moves the cat along a ballistic arc itself (hang 1.1 s, apex 1.4 m, about 5 m forward; a sprint start reaches 9 m), steers 60 percent, clamps to the bounds, never enters a collider (the arc ends early over one, gently), and lands on ground, a perch (through the normal `canReach` rule on the Moon's budget) or a beam. It exposes `moonY` (height above the ground while airborne), **read only by the ring gates and the long-jump board**; nothing that reads `perchY` (finds, mice, the perch chain) ever reads `moonY` (a test fails if anything else does, the `floatY` rule of the suit design). Courses: **rifts** (shallow trenches 3 to 7 m wide that only a bound crosses, never required by the story), **ring gates** (hoops she flies through), **the long-jump strip**. If the owner's hand test shows the bound feels worse than the plain hop, Tier 2 is dropped and the story, rover, rocket, scope and finds are unaffected (the courses fall back to Tier 1 beams; the "beat your bound" postcard is swapped).

## 6. Things to do

### 6.1 The rover ride (Dot)

- **Mount:** walk to Dot (depot or anywhere she was left) and press Interact ("Hop in"); the cat is carried onto the driver seat (the Fairground's seat model: a carried perch record; the existing `requestPet` sit pose, so **no new cat triangles and no cat-cap exposure**; the suit is drawn as usual). Interact or Pounce again at any time: "Hop out" onto free ground beside Dot (the `dismountSpot` rule: free ground, never inside a collider).
- **Steer:** the same stick / WASD input as walking, read in the camera frame: stick direction is the heading wanted, magnitude is speed; heading turns at 2.2 rad/s; speed up to 7 m/s, 5 m/s2 accelerate; crater slopes steeper than the walk limit slow it (never stick, never flip). Pad: left stick; keyboard: WASD. Meow honks and flashes the headlamp; Pounce gives a small bounce (render only, 0.5 m).
- **Collision:** a 1.3 m circle against the area's colliders (the player's own collider format, slide response), the bounds, and nothing else (cats and Pip are not blockers; nothing is hurt). Pure sim `src/world/moonrover.js` (no THREE): position, heading, speed from input and ground; the live part draws and slaves the cat.
- **Camera:** a ride camera table like the Fairground's `cameraFor`: 7 m behind, 3.5 m up, slight lead, eased in and out (`CAM_EASE`); zoom steps and L1/R1 still work; couch framing frames the rover.
- **Look and cost:** open roll-bar buggy, **at most 1,800 triangles, 6 meshes (chassis, nose, four wheels merged to one spinning pair if needed), 2 casters, no transparent canopy**; a dust trail of at most 60 pooled puffs (30 on LOW, none on LITE and in reduced motion).
- **Safe fallback:** the "Rover Tour": Dot drives the 214 m track by itself as a pure function of the shared clock (a seat on rails), the cat only rides and honks; zero collision cost, same on every device. A constant `ROVER_FREE` selects it; adaptive quality does not touch it (it is cheap); decided by the M3 hand test.
- **Online:** the driver's cat pose is already synced; Dot is drawn under the remote driver; only the mount and dismount events are new.

### 6.2 The rocket launch

- **The event:** `launch(T0)`: **5 s countdown** (a number bubble and a tick each second), ignition at T0+5, then a rise `y(t) = 0.5 a t2` with `a = 2.4 m/s2` for 5 s (30 m), then constant speed out of sight; at 22 s the sky holds a fading dot; at 40 s a fresh rocket is rolled out on the pad ("Ready") so a launch can repeat every minute. `launchPose(T0, now)` is a **pure function** of the room clock time, so every device agrees with no per-frame messages (the Fairground's rule).
- **Look:** the rocket (a nose cone, a yellow band, four fins; about 900 triangles, 3 meshes, 2 casters), the gantry swings back at T0+4; the plume is **one additive cone quad** plus a smoke pool of at most 150 Points puffs (HIGH), 40 (LOW), 0 (LITE), 0 (reduced motion).
- **Safe on low-end:** no real lights, no extra shadow pass; the plume's glow is one quad that eases in over 0.6 s and never covers more than a third of the screen; nothing flashes faster than 3 times a second.
- **Reduced motion:** no shake, no flash, no smoke; the rocket rises smoothly and the countdown is shorter (3 s), total 12 s.
- **Camera:** it stays where she is (the Viewing Mound, 21 m from the pad, or anywhere); during the first 8 s it tilts up gently to keep the rocket in the frame.
- **Triggers and watching:** the Launch Desk's red button (Interact) starts it, only after a postcard is loaded in the story (before that, a free "test launch" with no postcard, so a child can simply watch); anyone in the room can press; **the pad also launches by itself on a slow clock** (every 5 minutes of room time a siren sounds and a countdown board shows), so a child who only wants to watch can stand on the mound.

### 6.3 The telescope and the constellation game

- **The scope:** at the Star Hill observatory (and a simple binocular stand on Earthrise Rock that zooms on Earth, see 6.5) Interact opens an **opaque 2D canvas overlay** (the 3D render pauses under it); it draws the 700 seeded stars and the constellation stars brighter, a 60 x 40 degree window she pans (stick, drag, arrows). Disposed on close.
- **Five constellations (27 stars):** the **Mouse** (4), the **Cat** (7), the **Fish** (6), the **Crown** (5), the **Paw** (5), each a hand-placed list of (azimuth, elevation); a constellation is traced by tapping its stars in order; a tolerance of 40 px (touch), snap on pad. A wrong star: a soft "hmm", the line fades, no counter, no fail. A hint pulses the next star after 20 s (or the meow button).
- **Reward:** each traced constellation fills a journal page (`mnscope`) and glows in the real sky; **all five join as the Great Cat**, a faint cat-shaped star-picture that shines in the Moon's sky on every later walk (the cat-shaped reward) and is drawn on the observatory ceiling. Everyday names are plain; the Clan words add only "Silverpelt" for the Milky Way band.
- **Code:** `moonstars.js` (data and a pure solver, about 3 kB), `moonscope.js` (canvas draw and input, about 4 kB). Reduced motion: no twinkle, no star fade-in.

### 6.4 The jumping courses

- **Tier 1 (ships with the base):** the **Skip Ridge** chain (the Ridge cell), the **Earthrise Ridge** chain, eight **Beam Hops** (stepping beams 0.6 to 3.0 m, each at most 3.2 m above the last and within the Moon's reach 3.9 m, built from the Moon's own budget so each beam is reachable by the perch rule), and the doubled hop visuals everywhere.
- **Tier 2 (late):** five **ring gates** along the park (hoops at 1.6 to 2.5 m; a ring lights when she bounds through it, `moonY`), a handful of **rifts**, and the **long-jump strip**: stand on the line, bound, and the board reads the metres from the line to where she lands in centimetres. **Record board per cat:** `state.moon.jump[catId]` = best centimetres, shown on the board with the cat's name tag, a chime and "New record!" on a better jump; a sibling's cat has its own line.
- **Touch / pad / keyboard:** Pounce is the bound; the stick is the run-up and steering; nothing else.

### 6.5 Earth view

- **The sprite:** a camera-facing quad (40 m at 275 m, about 8 degrees, 21 degrees up, 12 east of north), a 256 px canvas: blue oceans, green land, white swirls, a rim glow, **the sun on its east so the west side falls into night with a few city lights** (the day/night side). A second faint cloud quad scrolls slowly (still in reduced motion). 2 quads, 4 triangles, 0 shadow cost.
- **The hidden message:** from **Earthrise Rock** a stone **binocular stand** (Interact) zooms on Earth's night side; the lights are a tiny picture. Each walk the picture is that day's postcard art (the album's twelve); after the story Earth blinks **her own stamp**. This is also the reply in step 8.
- **Look-up hint:** a one-time toast "Earth is out. Look up!" and the camera's pitch limit allows a clear view of 21 degrees (the default view reaches 7 to 30).

### 6.6 Finds and the journal

**Six discoveries** (found automatically by doing, `AWARDS.moonfind` 12 paws the first time ever, later walks count once on the page):

| id | Name (everyday) | How it is found |
|---|---|---|
| `mnflag` | The First Flag | stand by the planted flag at the landing site |
| `mnecho` | Echo Crater | stand in the Echo Crater's middle and meow (a soft echo) |
| `mndust` | Quiet Dust | walk 20 m across the untouched Quiet Plain (it keeps her paw prints) |
| `mncheese` | The Moon Cheese | reach the golden wedge at the Great Bowl's bottom |
| `mndish` | The Old Dish | stand beneath the Old Dish's big bowl |
| `mngarden` | The Star Garden | stand among the dome's six glowing planters |

**Six activity pages:** `mnstory` (Hello, Earth!, the walks she finished it on), `mnrover` (rides taken), `mnlaunch` (rockets launched), `mnscope` (constellations traced), `mnjump` (jump board used) and `mnjob` (Pip's postcards done). Page ids and names are start-up (`src/moonpages.js`, like `lighthousepages.js`); their hints and every other line are the lazy `moonwords.js`.

### 6.7 Golden mice (3) and what changes

Pattern kept (3 per place). **Totals: `GOLD_TOTAL` 48 to 51, the Clan Edition counter 48 to 51, the everyday edition's 24 to 27** (the Moon has no `edition: 'canon'`, so `goldForEdition` counts it in both). The mice (ids `gm-moon-1..3`, `y` over the ground):

1. `gm-moon-1` on the lander's upper deck, about (0, 41.5), y 3.0 (chain: moon rock 0.8, leg crossbar 1.9, deck 3.0): in sight of the arrival, so the first trip ends in a find (the gate plan's hint).
2. `gm-moon-2` on Earthrise Rock's top ledge, about (-2, -46), y 3.0.
3. `gm-moon-3` at the bottom of the Sample Pit behind a boulder, about (30.8, -9.6), y 0.

None needs a bound or the cave (so Tier 2 and wing D can be dropped without hiding a mouse); none sits within 2 m of a discovery spot, pebble or job point. Tests that change: the total-count test, the per-edition counts, `goldmice` area list; `src/goldmice.js` rows and `catmerge` `golden` need nothing.

### 6.8 Found outfit and the story prize

- **Found:** the **Starlight Cape** (back slot; a cape no larger than the Hero Cape, vertex-coloured stars), **12 hand-placed spots** (`src/foundwear/spots/moon.js`: on the ground, none within 15 m of the spawn, 2 m of a mouse or a pebble, 3 m of a job point, outside colliders), both editions. Because the suit overrides her back slot **on the Moon**, she sees the cape at home; the pickup shows it on a mannequin-free sparkle and a toast "Starlight Cape, in your wardrobe".
- **Prize:** the **Moon Badge** (collar slot: a small silver disc with a crescent and a star) for finishing the story, through the existing prize path (owned, put on if the slot is bare).
- Clan words name the cape "Silverpelt Cape"; no other series words.

### 6.9 Carrying

Cells and the postcard are `carryables` flagged `mission`: they are never a den keepsake at walk end (the mouth releases them back to their place), they do not drop in rain, and there is only ever one cell per socket. Pip's lantern glints on the carried item.

## 7. Technical plan

### 7.1 The pack

`src/world/moon.js` (`build(scene, opts)`), registered like the Lighthouse: an `AREA_LOADERS.moon` line, an `AREA_ENTRY_MODULES.moon` list, a `CATALOG.areas.moon` row (`price: 0`, both editions, `requires`: see Q1), `state.walks.moon`, `COOP_READY.moon: false`, a `placephysics` row, a budget row, a `goldmice` row, foundwear spots. A `?moon=1` flag (`moonflag.js`, read at call time) keeps it hidden until the gate hand-off, as the Lighthouse and Greenhouse were.

File map (all in the Moon's chunk unless noted): `moonplan.js` (every coordinate, perch, collider, route, spot: pure data), `moonparts.js` (the kit: rocks, ridge, dome, lander, depot, pad, observatory, cave), `moon.js` (the builder and zone tags), `moonzones.js` (pure zone logic), `moonsky.js` (stars, Earth, canvases), `moonmission.js` (the pure step machine), `moonlife.js` (Pip, carry, mission live, finds), `moonrover.js` and `moonroverlive.js`, `moonlaunch.js` (pure flight plus draw), `moonstars.js` and `moonscope.js`, `moonbound.js` (Tier 2), `moonfinds.js`, `moonwords.js` (lazy, both sets). **Start-up:** `moonpages.js`, `moonflag.js`.

### 7.2 The staged build

| Stage | Chapter | Adds | Ships when |
|---|---|---|---|
| **A. Base** (M1 to M4) | 1 Power | ground, craters, ridge, rocks, sky and Earth, landing site, dome, Old Dish, depot and rover, Skip Ridge and Earthrise Ridge, Bounce Park Tier 1, six finds, 3 mice, pebbles, the cape, steps 1 to 4 | behind `?moon=1`; live with gate M3 |
| **B. Wing Star Hill** (M5) | 2 Aim | hill, observatory, telescope game, five constellations, the Great Cat | its budget row passes |
| **C. Wing Launch Complex** (M6, M7) | 3 Hello | pad, gantry, rocket, desk, mound, postcard UI, launch, the reply; Tier 2 bound and the record board (M7b) | its budget row passes |
| **D. Wing Lava Tube** (M8) | 4 Deep cell | tube, crystals, the Deep Cell and the bigger finale | its budget row passes |
| **E. Replay and polish** (M9 to M11) | | Pip's postcards and the album, couch play, hand checks, perf, the beauty reserve | owner sign-off |

Each wing is built in **its own file group** and added to the same chunk. If a stage would push the chunk past **94 kB gz** or the built triangles past **56,000**, it does not merge: the stage is trimmed (the cut order is the beauty reserve, then ring gates, then the cave) or split into a second place **"The Far Side"** (its own 100 kB, reached by a second gate; the gate plan allows six pairs). A second lazy file in the same loader is **not** a way out: the budget script sums a place's files.

### 7.3 Budgets (the table, per stage)

Built = what `test/budget.test.js` measures; merged = as the renderer sees it. "Worst spot" = the visible place with zone drawing plus **three suited cats** (about 11,450 triangles each with the suit) and the rover, which is what an older iPad actually draws. All numbers start; each stage re-measures and pins its row.

| After stage | Meshes built / merged | Casters built / merged | Triangles built | Worst spot | Chunk gz | Start-up delta |
|---|---|---|---|---|---|---|
| M0 seams | 6 / 6 | 2 / 2 | 2,000 | n/a | 6 kB | at most 0.9 kB |
| A1 (M1: ground, sky, landing) | 40 / 28 | 24 / 12 | 15,500 | 50,000 | 24 kB | 0 |
| **A (M2 to M4, base)** | 100 / 58 | 56 / 30 | 27,500 | 58,000 | 52 kB | 0 |
| **B (M5, Star Hill)** | 125 / 72 | 66 / 38 | 33,000 | 60,000 | 66 kB | 0 |
| **C (M6 to M7, Launch + courses)** | 168 / 94 | 94 / 52 | 42,000 | 64,000 | 82 kB | 0 |
| **D (M8, Lava Tube)** | 184 / 102 | 100 / 56 | 46,500 | 65,500 | 90 kB | 0 |
| E (M9 to M11, with the beauty reserve) | at most 210 / 120 | at most 120 / 66 | at most 52,000 | at most 67,000 | at most 94 kB | at most 0.9 kB total |
| **Ceilings in `budget.test.js`** | **240 / 140** | **150 / 80** | **56,000** | **70,000** (a territory's) | **94 (the build's 100 stays)** | 1.0 total |

Fairground for comparison: 250 / 180 / 75,000 and 96.3 kB. The Moon is larger in area and smaller in cost because most of it is plain dust.

What each thing costs (start numbers): ground heightfield 7,000 triangles in 8 strips (craters are vertex displacement, not extra meshes); rocks 140 instanced in 4 InstancedMesh (small 70 and not casters, medium 40, large 20, boulder 10: 4,500 triangles); three ridges 2,400; lander 900 (7 meshes); gate ring 480 (6 meshes, 1 transparent); dome 2,800 with its interior 700 (glass is one transparent mesh, no shadow); two modules and airlock 800; Old Dish 500; depot 400; track posts 24 x 12 = 300 (one mesh); rover 1,800; Pip 500 (3 meshes); Earthrise ledges 1,000; Bounce Park 1,700; **Star Hill** hill 1,600 + observatory 2,200 + telescope 700; **Launch Complex** pad 400 + gantry 1,200 + rocket 900 + desk 400 + mound benches 500 + tanks 500 + smoke Points; **Lava Tube** shell 1,500 + mouth 1,000 + crystals 600 + floor and pedestal 600; sky and Earth 8 triangles.

**Draw calls and shadow casters for an older iPad.** Aim at the worst spot: at most **120 main-pass draw calls** (about 60 merged place meshes, 3 suited cats at about 14 meshes each, sky 3, particles 3) and **70 shadow-pass draws** (place casters 30 plus cats 10 each); one directional light, shadow map 2048 (1024 on LOW, none on LITE where the game's contact blobs stand in), shadow fit radius 20. Casters are only the big things (dome, lander, gantry, rocket, rover, observatory, boulders over 1 m); rocks under 0.5 m and every decal never cast (`trimShadowCasters`).

### 7.4 How it stays inside (the techniques)

1. **Cheap ground:** a heightfield in `createGround` strips and discs (as the Gorge), craters and ridges as displacement and vertex colour (dust, rim, shade), the game's existing `gravel` tile (no new texture, no new surface), the normal map on HIGH only.
2. **Merge by material per zone** (`createKit`, as the Lighthouse): dust, rock, white paint, steel, red, yellow, teal, dark, glow, crystal, glass: eleven materials, never more; only moving things (the rover, Pip, the rocket, the gantry arm, the telescope tube, ring gates that light, the Core's glow) stay separate meshes.
3. **Instancing** for rocks and pebbles; if a convention in `mergeprops.js` or `rig.js` rejects an `InstancedMesh`, the same rocks are merged per 25 m cell instead (measured in M1).
4. **Zone drawing** (`moonzones.js`, the `houselevels.js` pattern): a wing's detail is drawn when she is within 55 m (hysteresis 6 m, at most two wings at once); farther it is one plain stand-in silhouette. The base (landing, dome, crater field, depot, ridge) is always drawn. This holds the worst spot under the limit although the built total is larger.
5. **One decal atlas**: a 512 x 256 canvas made at build time (mission-board icons, stamps, distance posts, desk labels, constellation names, the Earth postcard art), one material, no image files, about 0.5 MB of texture memory, disposed at walk end. The telescope's sky canvas exists only while the scope is open.
6. **Tiers by quality rung** (`render/quality.js`): HIGH full; LOW halves the ground segments, drops small rocks and the smoke to 40, stops the wheel spin; LITE: no shadows, no smoke, static Earth, 350 stars. Adaptive Auto already steps these.
7. **Data-driven code size**: the plan files are tables (compress well), the kit builders are shared by every building, nothing is copy-pasted per object, words are lazy. The Fairground's 213 kB raw source became 96 kB; the Moon's estimate is 90 kB at the end (about 8 plan tables, 20 kit, 10 mission and UI, 6 scope, 6 rover, 7 launch, 4 bound, 6 words, 6 life and finds, 17 builder, the rest glue).
8. **Measure, then pin:** every stage adds a `budget.test.js` row at its measurement plus 12 percent (the Farm and Market ruling), a chunk size note in the plan, and a worst-spot picture count from the per-spot measure used for the Old House (the harness is `scripts` plus the `verify-*` pages).

### 7.5 Save, sync and the word set

- **One additive key** `state.moon = { step: 0..9, cells: bits, stamp: -1|0|1|2, scope: bits(5), jump: { catId: cm } }`, sanitised in `progression.js` (numbers clamped, `jump` at most 6 keys, ids matched against the cat id pattern, cm 0..2000), default `step 0`. `SAVE_VERSION` stays 4. Two key-list tests gain `moon` and `walks.moon`; `savesize` grows by under 100 bytes.
- **Merge** (`catmerge.js`): `step` max, `cells` OR, `scope` OR, `stamp` takes the newer side with the existing `newer()` rule, `jump` per key max. A mid-carry or mid-launch state is never saved.
- **Journal ids and awards:** `moonfind: 12`, `moonjob: 25`, `moonstory: 40` in `discoveries.js` AWARDS (their feat tallies are the lifetime counts); twelve ids in the journal whitelist; a `moon` row in `goldmice.js`.
- **Per-walk, never saved:** carried item, rover pose, launch time, scope selection, job of the day (from the room seed and `walks.moon`).

### 7.6 Phrases and both sets

New phrase ids go in the "later" table and the off-snapshot fixture is re-recorded once per milestone that adds ids (`UPDATE_OFF_SNAPSHOT=1`). `moonwords.js` is lazy and holds about 80 lines; `moonpages.js` holds the twelve page names in start-up (the journal is drawn before the place has ever been walked). The everyday set is the plain base; the Clan set adds light flavour only. Samples:

| id | Everyday | Clan |
|---|---|---|
| moon.arrive | Welcome to the Moon! | Welcome to the Moon! The stars are out. |
| moon.pip.wake | Beep! Hello! | Beep! Hello! |
| moon.pip.goal | Let's say hello to Earth! | Let's say hello to Earth! |
| moon.core.on | The base has power! | The base has power! |
| moon.earth | Earth is out. Look up! | Earth is out. Silverpelt shines beside it. |
| moon.scope.milky | The Milky Way is out. | Silverpelt is out. |
| moon.scope.hmm | Hmm, not that one. | Hmm, not that one. |
| moon.stamp.ask | Pick a stamp for your postcard. | Pick a stamp for your postcard. |
| moon.count.go | Lift-off! | Lift-off! |
| moon.reply | Earth says hello back! | Earth says hello back! |
| moon.badge | A Moon Badge! | A Moon Badge! |
| moon.cape | Starlight Cape, in your wardrobe. | Silverpelt Cape, in your wardrobe. |
| moon.job.glove | Earth lost a glove. Can you find it? | Earth lost a glove. Can you find it? |
| moon.rover.in | Hop in | Hop in |
| moon.home | Take the gate home when you're ready. | Take the stones home when you're ready. |

Tests: every id in both sets, `bannedIn()` clean in both, a banned-word scan over the Moon's strings, the structural test (no series word outside the word-set files) green. No "drown", "die", "dead", "scared" and the like appear (the suit design's banned list is the scan).

### 7.7 Start-up impact (target at most 1.0 kB gz, estimate 0.9)

| Item | Estimate |
|---|---|
| the one `placephysics` reading site in `player.js` / `interactions.js` / `climbBudget` callers (`hopHeightMul`, `hopTimeMul`, `climbMul`, `reachMul`, `skip`) | 0.30 kB |
| `state.moon` default, sanitiser, `catmerge` rule | 0.30 kB |
| catalog row, `walks.moon`, `AREA_LOADERS` and entry lines, `COOP_READY`, goldmice rows, three AWARDS | 0.15 kB |
| twelve journal ids and page names (hints lazy) | 0.15 kB |
| **Total** | **0.90 kB** |

Hard gate 1.0 kB in M0; never raise the 720 kB ceiling. The two gate hosts' tele rows are the gate plan's own 0.6 to 0.8 kB (counted there). If journal hints for found pages cannot load lazily without an awkward async redraw, they move into start-up (+0.35 kB) only with the owner's yes and after the `startup-trim` branch frees the same amount; the build fails otherwise.

### 7.8 Tests (the Moon's own, plus what must stay green)

`test/moon*.test.js`: area builds (no `waters`, spawn clear, every perch reachable on the Moon's own budget with `findreach`, colliders clear of the spawn and routes), plan consistency (every coordinate inside the bounds, none inside a crater too steep to walk), zone logic, mission machine (a property test: from any state, with any order of cell pickups, there is always a next step, and no path leads to a stuck state; carried items return), rover sim (bounds, colliders, slope, never stuck, a way off at every moment), launch (pure function: monotone, ends, same from any device clock), scope solver, bound (never leaves the bounds or a collider, always lands; Tier 2 only), found spots (`foundspots`), golden mice (3, total 51 and 27, `gm-moon-*` reach), word parity and banned scan, save sanitize and merge (a hostile payload cannot set `step` over 9 or a cm over 2000), `savesize`. Must stay green and unchanged: `flattrace*`, `growtrace*`, `climbing`, `placephysics` (exactly the rows it should have), `budget` (new rows only), `buildsize` and the build's start-up gate, `coopseam`, the offline precache gate (the Moon's chunk and the words file are in the precache list), `gateways`.

## 8. Input in one table (all three controls and TV)

| Action | Touch | Pad | Keyboard |
|---|---|---|---|
| Walk, steer the rover, aim the scope | left stick, drag the sky | left stick | WASD, arrows |
| Hop (a Moon hop), bound, jump out of the rover | Pounce button | A | Space |
| Interact: wake Pip, pick up, plug in, hop in, press the desk button, open the scope | context button | X | E |
| Call Pip (the hint ring), honk | Meow button | B | the meow key |
| Look up at Earth | drag up | right stick up | mouse or arrows |
| Zoom | pinch / buttons | L1 / R1 | + / - |
| Stamp choice, scope pin | tap | left/right + A, A | 1 2 3 / Space |

TV mode swaps the prompt text for glyph tokens (`padText()`), no new controls anywhere.

## 9. Risks

1. **Chunk size** (Fairground 96.3 of 100). Mitigation: the 94 kB gate, stages, data-driven code, the cut order and the Far Side split.
2. **The Tier 2 bound** touches movement (a halt and a carried arc) and the one place `moonY` could be read wrongly. Mitigation: its own milestone, a hand test, a test that only rings and the board read `moonY`, easy to drop.
3. **Hop timing scaled** (`session.pounceTime`) could play the landing thump in the air. Mitigation: one scale constant, one place, an animator test of the landing frame.
4. **Rover cost and getting stuck.** Mitigation: a circle sim with slide, a way off at every moment, the on-rails fallback.
5. **Instancing conventions** (contact shadows, caster trim, merging by scene child). Mitigation: measured in M1; merged cells as the alternative.
6. **Journal hints and start-up.** Mitigation: section 7.7.
7. **Two gate hosts** (Pines and the Rooftops) means two more host edits near their budgets. Mitigation: the gate plan's 6 meshes / 480 triangles allowance each; the archway look (5 meshes, 360 triangles) on the Rooftops.
8. **Length of the story** for a nine-year-old. Mitigation: chapters, the meow hint, no timers, step 8 completes in one sitting after step 7, saved by step.
9. **Mood.** An empty grey place can read lonely. Mitigation: Pip, Dot, warm lamps, glowing crystals, the big blue Earth, quiet but not silent sound.
10. **Edition drift.** Mitigation: the parity tests run over every new id.
11. **Photosensitivity.** Mitigation: the launch's eased glow and the 3-per-second rule; no flashing anywhere.

## 10. Open questions for the owner (with recommended answers)

1. **How does the everyday edition reach the Moon?** The Clan gate is the Pines Meeting Ring, which the everyday edition does not have. **Recommended: a second gate on the Rooftops** (the archway look), ending at the same Moon ring; the Moon's catalog `requires` becomes "Pines or Rooftops, 2 walks" by edition; the gate plan's M3 gains one row and one test. (Alternative: the Rooftops gate for both editions, simpler but less natural for Clan players.)
2. **Is the story "Hello, Earth!"?** **Recommended: yes**; Dot is the rover, Pip the helper.
3. **Is a longer first-time story (about 20 minutes, in chapters) right for a nine-year-old and an eleven-year-old?** **Recommended: yes**, because chapter 1 (power) is complete and fun on its own and there are no timers.
4. **Ship the safe low-gravity hop first and decide the real bound after a hand test?** **Recommended: yes**; Tier 2 is a late, droppable milestone.
5. **Rover: free steering or the on-rails tour?** **Recommended: free steering, with the tour as the automatic fallback** if M3's hand test or the perf readout says no.
6. **Three golden mice, or more because the place is large?** **Recommended: three** (pattern, simpler tests); the Star Garden and the wings add finds and pages instead.
7. **Paws:** `moonstory` 40 once, `moonjob` 25 once a walk, `moonfind` 12 once ever. **Recommended: yes** (the Lighthouse numbers, a little more for the story).
8. **Start-up budget:** may the Moon use up to 0.9 kB of the headroom (the gate plan uses 0.6 to 0.8, the suit M0 about 1.0, TV mode wants more)? **Recommended: yes, and ask for the `startup-trim` branch to merge first.**
9. **Is the Starlight Cape (found) plus the Moon Badge (prize) right?** **Recommended: yes.**
10. **The Moon's physical sizes (108 x 100 m, wings 55 m away).** **Recommended: yes; after the base ships, a hand test on the iPhone and an older iPad can shrink the wing ranges before any wing is built.**
