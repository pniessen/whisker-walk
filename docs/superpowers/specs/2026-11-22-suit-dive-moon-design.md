# Suit kit, the Reef dive and the Moon: design

Status: design for owner approval (2026-11-22). Plan: `docs/superpowers/plans/2026-11-22-suit-dive-moon.md`.
Design only: nothing here is built. Every number marked "start" is a starting value the builder tunes from pictures.

Owner ideas (backlog): (1) the cat dives underwater, (2) the cat goes to the Moon, (3) one suit kit, a spacesuit on the Moon and the same pieces re-skinned as a diving suit.

## 1. What was read (the facts this design stands on)

- **Swimming** (`src/waterstate.js`, `src/cat/waterlook.js`, `src/player.js` ~960-1030, spec 2026-10-31): water is flat footprints (`waters`, rect/circle, `shallow` band), no depth. Modes `dry | wade | swim`; the cat just sinks its group (`WATER_FIT`), the surface is opaque. `SWIM_SPEED` 0.55, `WADE_SPEED` 0.8. The swimming spec's non-goals say "no underwater view or diving", so diving is new ground, not a change to swimming. Sea Legs gates deep water only.
- **Hop and climbing** (`src/player.js` ~255-360, `src/climbing.js`): the pounce hop is a render offset (`hopOffset`, 0.35 m base, Spring Paws 0.9 m, 0.3 s) that never touches `perchY`, finds, or the perch chain. What a cat can stand on is `climbBudget` (base 1.6 m, Spring Paws 2.2 m). Long Leap is a Rooftops gap-leap skill (`traversal*.js`, `leap` tally); nothing else uses it. Reduced motion flattens the hop (`FLAT_POUNCE_ARC`).
- **Finds** (`src/goldmice.js`, `src/foundwear/*`, `src/discoveries.js`): 42 golden mice, three per area (two on perches, one on the ground), `checkFind` window 1.0 m sideways, 0.9 m vertical, read from `perchY`. One found outfit per walk from a hand-placed spot list (4 outfits per place at most, `WEAR_PER_AREA`; each walk hides one; `planFind` skips none of this for a new place that has spots). Six "discovery pages" per newer place paid once ever (`roofsfind`, `marketfind`: 12 paws).
- **Places** (`src/world/areas.js`, `src/progression.js` CATALOG.areas, `src/worldmap.js`, `src/gateways.js`): a place is a lazy chunk (`AREA_LOADERS`, size ceiling `AREA_GZIP_CEILING_KB` 100) plus a catalog row (price, `requires: { area, walks }`). Gateways have two ends, `placement: 'edge' | 'inside'`; an `inside` end needs an explicit `arrive` and `look: 'none'` when the place draws its own door (the Rooftops fire escape and the Old House front door are precedent). The room stays together through a gateway.
- **Teleport doors** (memory note, owner 2026-11-21): doors that move the cat from A to B; they are FOUND, not bought, and live in NATURAL features (hollow tree, sett, rock cleft, gap under roots), not magic wardrobes. Not designed yet. This design makes the Reef and the Moon the first two instances (section 3.3).
- **Cat body and wear** (`src/cat/model.js`, `wearkind.js`, `outfits.js`, `foundwear/`): seven slots (`collar, head, face, neck, body, back, feet`). The bare cat is capped at 10,350 triangles full / 5,500 simple and "triangle caps are full" (realism notes), so wear is gated per item: at most 4 meshes, 900 / 450 triangles, a pack 1,200 / 600, a shell no more than the Striped Sweater, a cape no more than the Hero Cape (`test/foundwearfit.test.js`). Items are vertex-coloured meshes (`backitems.js`); a `shell` body kind hides the fur tufts it covers. Hagrid the hen wears only `head, face, neck, collar` (`HEN_SLOTS`).
- **Night and sky** (`src/render/nightsky.js`, `src/world/roofssky.js`): one `Points` of stars (no triangles), one camera-facing moon quad; the Rooftops swap in a richer sky texture, stars and moon from chunk code. Reusable for the Moon's sky with Earth as a second quad.
- **Budgets** (`test/budget.test.js`, `scripts/buildjson.mjs`): per-place ceilings of meshes / casters / triangles (Farm and Market 280 / 210 / 62,000; territories 450 / 380 / 70,000), a merged-mesh ceiling, a per-place gzip ceiling of 100 kB, and **start-up 708.9 of 720 kB gz, never raised** (about 11 kB left, and TV mode wants a share of it).
- **Words** (`src/clanphrases.js` `phrase()`, `src/wordset.js`, `src/offclanwords.js`): the Clan text is the default table; the everyday set overrides ids in its `PHRASES`. Series vocabulary lives only in the word-set files (structural test). New ids go in the "later" table and need the fixtures re-recorded (`UPDATE_OFF_SNAPSHOT=1`).
- **Pad and TV** (`src/gamepadinput.js`, `docs/.../tv-mode-design.md`): A/Cross is pounce; walk, menus and map work on a pad; TV mode adds glyph tokens (`padText()`) and a big-text layout, from its own lazy chunk.

## 2. Decisions in one table

| Question | Recommendation |
|---|---|
| Build first | Suit kit (small) then the Reef, then the Moon. Diving first, as you suggested: swimming, water look and the shake already exist. |
| Where the Reef lives | A **new small place, "The Reef"**, entered by a found dive door (a bubble column) at the end of the Seaside pier. Not a dive spot in the open Seaside scene, because the water there is an opaque plane and the Seaside is the tightest budget (85 meshes, 30,000 triangles ceiling). |
| Where the Moon lives | A **new small place, "The Moon"**, entered by a found door in a natural feature on the Pines island (a moonlight pool). Alternative: the Rooftops telescope. |
| Movement | Reef: a **float height** 0 to 2.2 m above the seabed, held up by a button, sinking gently on release. Moon: the existing hop and perch rules with a **gravity factor** (higher, slower hop; climb budget x2). No free 3D flying anywhere. |
| The suit | One kit of four pieces (helmet, body, pack, boots/fins) in a lazy file, drawn in two palettes. It is **not** in the shop, saved outfits or the dressing room; it overrides head, body, back and feet **at draw time** inside the two places and never touches her saved wear. A free suit comes from the locker on the first visit. |
| Breath | A kind "air bubbles" gauge in the Reef only. Empty means a warm bubble lifts her to the ladder with nothing lost. The word "drown" and its relatives never appear in the game (a phrase test scans for them). |
| Moon wording | Both sets play the same. The Clan set adds light starry flavour only ("Silverpelt" for the starfield), no ancestors, no dream-sharing. |

## 3. Shared ground rules

### 3.1 Two new places, small on purpose

Each is an area pack in its own chunk (`reef`, `moon`): a builder module, an `AREA_LOADERS` line, an `AREA_ENTRY_MODULES` line, a CATALOG.areas row, a `state.walks` key (additive, `SAVE_VERSION` stays 4, same as Market and House). Neither is bought with paws:

- `reef`: `{ name: 'The Reef', price: 0, requires: { area: 'seaside', walks: 2 } }`. The door can be found sooner; going through needs the walks (the "Get it?" card path of the world map does not apply to price 0, so the door's prompt carries the line).
- `moon`: `{ name: 'The Moon', price: 0, requires: { area: 'pines', walks: 2 } }`.

Both are in both editions (nothing series-specific in the mechanics). Each has 6 discovery pages, 3 golden mice, 4 found-outfit spots and one found outfit. That takes the golden mice from 42 to 48 (a test pins the total and the area list; update both).

### 3.2 A small "physics" seam, not a rewrite

One leaf module `src/placephysics.js` (start-up, under 0.4 kB gz) holds a frozen table keyed by place id, read by `player.js`:

```
reef: { medium: 'water', pace: 0.7, floatMax: 2.2, rise: 1.2, sink: 0.6 }
moon: { medium: 'vacuum', pace: 0.9, hopHeightMul: 4, hopTimeMul: 2.45, climbMul: 2, skip: 0.1 }
(every other place: absent = today's numbers, byte-identical)
```

`player.update` multiplies what it already computes (pace, hop arc, climb budget); a place absent from the table takes the same code path with multiplier 1. A test pins that the table has exactly two rows and that every existing place's player trace is unchanged (`test/flat-trace.*.json` precedent).

### 3.3 Doors: the first two "teleport doors"

A door is a gateway row pair (`GATEWAY_ENDS`) with `placement: 'inside'`, `look: 'none'` and an explicit `arrive`, exactly like the Rooftops fire escape and the Old House door, with two additions the teleport idea needs:

- the two places are not map neighbours, so the world map draws the pair as a small dotted door mark (a new `kind: 'door'` on the `GATEWAYS` row, no road), tap-to-travel works on the same pop-up card, locked until found;
- the door is FOUND: its place draws a natural feature, twinkles and chimes within range using the found-outfit machinery (`TWINKLE_RANGE` 20 m, `CHIME_RANGE` 6 m, `catReaches`), and the first touch writes "door found" to the walk log. Nothing new is saved: "found" is `walks[place] >= 1` or the first touch this walk.

Rules every door follows: two-way (the other end is a natural exit too), prompt before travel ("Suit up and dive in?" and Not now), the room travels together (as gateways do today), the next place starts downloading when she is within `GATE_PREFETCH_REACH` (12 m), no travel in the guided first walk, strays, critters and ghosts do not use doors.

## 4. The suit kit

### 4.1 Parts, slots and what they cost

One module `src/cat/suitkit.js` (lazy: imported only by the Reef and Moon chunks, never by start-up) builds four pieces, each ONE vertex-coloured mesh unless noted, so the whole suit is 5 to 6 meshes:

| Piece | Slot it overrides | Moon (space) look | Reef (dive) look | Triangles full / simple (start) |
|---|---|---|---|---|
| Helmet | head | clear bubble (transparent, no shadow), white neck ring, short antenna with a ball | clear bubble, yellow neck ring, a hose stub at the back | 230 / 120 (a 12x8 sphere is ~190, ring 24, antenna or hose stub 16-30) |
| Body suit | body, **kind `shell`** | white tube over the torso with grey joints, a small paw-flag patch on the chest (our own flag, not a country's) | yellow tube with blue trim | 260 / 140 (a shell hides the fur tufts it covers, so the net cost against a furry cat is smaller than this) |
| Pack | back, counts as a `pack` | boxy life-support pack, two small dials | air tank (cylinder) with a blue cap, a hose arc up to the helmet (3 segments) | 300 / 150 |
| Boots / fins | feet | chunky grey boots | flat yellow fins (8-triangle fans) | 160 / 80 for four paws |

Kit total start: 950 full / 490 simple, at most 6 meshes. Gates:

- each piece passes the existing found-outfit gate shape (at most 4 meshes, 900 / 450, pack 1,200 / 600, shell no more than the Sweater, nothing below ground in follow, perch, requestPet and nap poses, on every shape in `SHAPES`);
- new kit gate: the sum on one cat is at most 1,100 / 600, and a fully suited cat is pinned at its bare cap plus that (no change to the 10,350 / 5,500 bare caps, which stay untouched);
- a suited crowd (3 cats) draws at most 7 extra meshes per cat and adds no more than 1 transparent draw per cat (the helmet glass).

The cat's other slots while suited: `collar` stays (the bell still rings, a found collar still shows); `face` stays (glasses sit inside the bubble); `neck` is hidden under the suit's neck ring. Nothing she wears is changed or lost: see 4.2.

### 4.2 How it attaches (no shop, no save, no outfit)

The suit is **not** an accessory. It has no catalog row, so it can never be bought, traded, saved in an outfit slot (`sanitizeWear` already drops unknown ids), or given by a code. Instead a pure function `effectiveWear(equipped, place, suitLook)` returns the wear map the cat is DRAWN with:

```
effectiveWear = { ...equipped, head: 'suit-helmet', body: 'suit-body', back: 'suit-pack', feet: 'suit-boots', neck: null }   // only when the place has a suit look
```

- The place pack registers a small builder hook (the same hook shape `model.js` already calls for found pieces: `wearkind.js` gets the kind of each id) when its chunk loads; a cat drawn with a suit id and no hook registered shows nothing, so start-up carries only the hook slot (about 0.5 kB).
- `avatar.js` and the remote-cat draw both call `effectiveWear`. A partner's cat in the same place is drawn suited from where it is, computed on the viewing device, nothing sent over the wire (the same trick the swimming spec uses for remote wading).
- Leaving the place changes nothing to undo: her own wear is simply drawn again. This is why the full triangle cap is not a problem: the suit never stacks on top of her four slots, it replaces them for the length of the walk.
- **Hagrid the hen** gets the helmet only (his slots are head, face, neck, collar; `canWearNow`): a bubble over his head, his normal walk. His goldens stay byte-identical (`hagrid-golden.json` is never re-recorded; the suit is only drawn in the two places).

### 4.3 Recolour technique

One geometry, two palettes, chosen when the piece is built: `SUIT_LOOKS = { space: {...}, dive: {...} }` maps each vertex's part tag (body, trim, joint, glass, dial, hose, patch) to a colour, written into the vertex-colour attribute, so no extra mesh, texture or material. The geometry differs only where the look needs it (antenna vs hose stub, boots vs fins, boxy pack vs tank), each a separate small builder inside the same file. One shared `litMaterial`, plus one transparent material for the glass (opacity ~0.28, `depthWrite` false, `userData.noCast`).

### 4.4 Ears, tail and face

- **Ears:** inside the helmet; the head turns with the helmet (the bubble is parented to the head). The ear flicks and the swim pose's ears-back keep working. A hat in `head` is not drawn while suited.
- **Tail:** free. The suit is a tube over the torso only, so `tailCurl`, the tail lying on the surface in swim, and the Reef's slow streaming sway are untouched. A tail port is drawn as a small collar ring at the rump (6 triangles, same ring builder).
- **Face:** seen through glass; eyes, mouth and whisker animation keep running (`face.js`). The bubble is large enough (start: 1.25x the head radius) that whiskers do not poke through it. Reduced motion draws the same suit with no sparkle on "suit up".
- **Pose cost:** sits, naps and the loaf work in a suit (the shell follows the torso as the coat shells do); the lick-paw groom is skipped (the helmet is in the way): the Reef and Moon do not offer grooming.

### 4.5 Suit up (the locker ritual)

The door is the locker. Walking to it asks one question ("Suit up and dive in?"). Yes plays a 1.2 s montage (pieces pop on one after another, a few pooled sparkles; with reduced motion: they simply appear with one soft chime), then she goes through. The first visit adds a line ("A locker with a paw print on it!") and the suit is hers: first visit is `walks[place] === 0`, so no new save field.

I lean the same way as you: a locker, with a free suit. The alternatives and why not:

| Option | For | Against |
|---|---|---|
| Automatic on entering | zero friction | the ritual is half the fun; remote partners see a cat change mid-step |
| **Locker/door question (recommended)** | one tap on any input, feels like a story beat, replays each visit in 1.2 s, nothing to save | one extra confirm per visit |
| Locker as a separate station she must walk to | most ritual | easy to miss on a phone; adds a map object per place |

A co-walk partner without the place (not owned) uses the guest rule: the suit is a loaner ("Your friend has a spare suit for you!"), nothing is spent, and each device draws its own and its partner's suit.

### 4.6 Is it a wearable in the dress-up store? No.

It would need a catalog row, a price, a saved-outfit entry and a full-cap fit in the dressing room; and a shop item can be worn walking round the Park in a diving fin. Free, place-only, draw-time is smaller and cleaner. The reward-for-exploring items are the place's **found outfit**, which she can wear anywhere:

- Reef: `pearlcollar` (collar slot, shows over the suit).
- Moon: `moonglasses` (face slot, round silver glasses, shows inside the bubble).

Both are ordinary found-outfit records (`WEAR_ID` pattern, 4 spots per place, passes `foundwearfit`). The suit pieces' ids (`suit-helmet` etc.) are not found-outfit ids and are not in `FOUND_CATALOG`.

### 4.7 Reduced motion, pad and TV

- Reduced motion: no sparkle on suit up, no bubble swarms (a third of the particles, still pooled), no skip on the Moon, no float bob underwater, the hop arc is flat (`FLAT_POUNCE_ARC`). Nothing in a place needs the hop to be seen: the Moon's ledges are perches (section 6.3), so reachability never depends on animation.
- Pad: A / Cross is "kick" in the Reef (hold to float up, let go to sink) and pounce on the Moon. The door prompt and the gauge are menu-style cards a pad already navigates. TV mode: the gauge and hints use `padText()` tokens, so they read at couch size.
- Phones: the float button is the existing pounce button (held). Hit areas stay at least 44 px.

## 5. The Reef (diving)

### 5.1 Where it lives and the options

| Option | What it is | Verdict |
|---|---|---|
| A. Dive spot in the open Seaside scene | change the camera and the water at the Seaside | no: the water is an opaque plane with no depth, the Seaside is the tightest budget, and an underwater scene needs different fog and lighting from the sunny beach |
| B. Dive spot at the River or Docks canal | same, on a fresh-water place | no: the River's water is walked as 7 overlapping footprints; the Docks canal is a bus |
| **C. A new place, entered by a door at the Seaside pier end (recommended)** | its own chunk, its own light and fog, no `waters` footprints | one more place to maintain, in exchange for none of the risk above |
| D. A door at some other water | | the pier end is the only place with a deck over deep sea, so a bubble column beside it needs no Sea Legs |

The door is a column of bubbles rising beside the pier's end, a ring buoy and a ladder on the pier (drawn by `seaside.js`: 3 meshes, about 400 triangles, against 64 of 85 meshes and about 8,700 of 30,000 triangles). It is on a deck, so it never needs Sea Legs and never lets a non-swimmer cross anything. The Seaside's `SEASIDE_SPOTS`, golden mice and its tests move by nothing.

### 5.2 The place

About 100 x 80 m of walkable seabed (no water footprints: `waters: []`, so `stepWaterState` stays `dry` and the surface wading code never runs). The medium is set by the physics seam. Look: blue-green fog (start: near 6 m, far 38 m, exponential), a shimmer ceiling quad at y 9 (2 triangles, scrolled texture), a soft light shaft or three (3 additive quads), sand with ripple colouring, kelp (instanced sway), coral clumps, shells, a sunken boat. No real caustics; a scrolled light texture on the floor is one extra uv scroll.

Contents (budget aim 150 meshes, 100 casters, 30,000 triangles):

- **Six discoveries** (`reef.page.*`, paid 12 paws the first time, `divefind`): the Sunken Boat (find under the deck), the Pearl Oyster, the Kelp Garden's hidden seahorse, the Glow Cave (a small rock cleft lit by plankton), the Treasure Chest, the Old Anchor.
- **Collectibles:** shells and sea-glass on the seabed, the usual collectible rule (an existing `collectibles` list, 8 of them).
- **Fish and critters:** one instanced school (up to 40 small fish, 1 draw call), 6 bigger fish with a slow loop, a turtle, crabs on the sand; **bubbles**: one pooled `Points` (60 points, 20 in reduced motion).
- **Golden mice (3):** one on the ground behind the boat; two at float height (1.9 m and 2.0 m) in bubble columns, "reachable only by floating", as the other places keep two on perches.
- **Found outfit:** `pearlcollar` from 4 spots (a clam, the anchor, the boat, the chest-side). The pearl itself is the find.
- **Strays and ghosts:** none in the first build (critters and strays ignore the place, as they ignore water today).

### 5.3 Movement model

`api.floatY` is a new read-only height, 0 to `floatMax` (2.2 m), on top of the seabed height (flat 0 on this map). Rules:

- Held pounce/kick: floatY rises at `rise` 1.2 m/s (eased in over 0.2 s); released: it sinks at `sink` 0.6 m/s (eased) to the seabed. At the floor the cat **walks the sand** (pace 0.8, with the existing stalk/walk animation), above 0.3 m it **swims** (the existing `swim` pose, its legs paddling, its tail streaming back). Horizontal pace `pace` 0.7 in both (it must still beat every walking detour: the CF-12 rule, vacuous here since the whole map is one medium).
- `floatY` feeds `goldMice.checkFind` and the found-outfit pick-up (`catReaches`) exactly as `perchY` does for a perched cat: the window stays 0.9 m. It does not feed `perchY`, `climbBudget` or any collider rule, so nothing in the perch chain, the Long Leap or the border rules can see it. It is NOT the hop: the hop is a render offset that never finds anything (player.js ~255-300); floatY is a real position, so the two stay separate.
- Pouncing does not hop; "kick" is the whole use of the button here. Rests, naps, grooming and carrying are off (`interactions.js` already skips a swimming cat; the Reef sets the same flag on the whole place).
- A pad stick holds a float height by position, no new axis is added; the pad's A is the same held-kick.

### 5.4 Breath ("air bubbles")

A small row of five bubbles in the HUD (and a pack-mounted gauge drawn on the tank). Start: it lasts **90 s** from a full pack, in whole bubbles. It cannot hurt her:

1. Full to two bubbles: nothing changes.
2. At two bubbles: a soft line ("Your air bubbles are getting low. Float up for more!") and a ring of bubbles around the pack.
3. At zero: a warm bubble lifts her slowly to the ladder at the Reef's door ("A warm bubble lifts you up. No worries at all!"), her position is the ladder, the walk continues topside. Nothing is lost, there is no score, no timer on the walk, no cry or fall animation, and the gauge refills at once.
4. Air pockets (golden-edged bubbles over the Glow Cave, the boat, the anchor) refill it. A second visit's lift costs nothing either.
5. With reduced motion the lift is a fade-and-place (no rising animation).

A test scans the Reef's phrases and HUD strings for a banned list (drown, die, dead, hurt, panic, gasp, choke, scary) so a future line cannot say it. No sound for an empty gauge but a soft chime.

### 5.5 Camera

The chase camera is unchanged in form (`catcam.js` `cameraOffset`: distance 4.5, height 2.2, pitch -0.3 to 0.9) with three changes in the place table: distance 4.0, a floor clamp (camera y no lower than seabed + 0.4, so the sand never hides her), and a gentle follow of floatY at 60% so a kick does not whip the view. The user's zoom (`camzoom.js`) keeps working. There is no view of the surface from below except the shimmer ceiling.

## 6. The Moon

### 6.1 Where it lives and the options

| Option | Verdict |
|---|---|
| A. Moon as a night skin of an existing place | no: gravity, craters and the black sky change everything about the ground |
| **B. A new place entered by a natural door on the Pines island (recommended)** | the island is a quiet natural place already, with the Old Ash, the Meeting Ring and the Watch Rock; a "moonlight pool" in a hollow under the Old Ash's roots matches the owner's rule that doors live in natural features |
| C. A door by the Rooftops telescope | already has a "Telescope" discovery and a night sky, but it is a made thing, not a natural one, and the Rooftops are deep in the unlock order |
| D. A rocket at the Fairground | good fun but a made thing, and the fair's triangles are 74.3k of 75k |

The Pines island carries her birthday Gathering and its finds in its chunk (`areas.js` pines loader), so the door's mesh lives in `pines.js` (about 250 triangles, 2 meshes), its prompt in the Moon's phrases. If you prefer C, only the door rows change.

### 6.2 The place

About 100 x 100 m of grey dust, with 4 to 6 shallow craters (bowls 1.0 to 1.4 m deep, walked down and up), two rock ridges with ledges (the perch chains), a landed boxy lander (the spawn, with the locker door), a small planted paw flag, rocks, a tiny glass dome garden. Ground height from `createGround` strips and discs (as the Gorge); no heightmap.

Sky and light: a black-navy sky, the starfield (the `nightsky.js` `Points`, 700 stars here, no atmosphere haze, no clouds), **Earth** as one more camera-facing quad (a blue-green disc with white swirls from a canvas, about 4 degrees across, at 24 degrees elevation, off to the right so the default view just sees its edge and a look-up shows it), one hard sun (the rig's directional light, long blue-grey shadows), a faint earthlight fill. Very quiet: a slow low drone and soft footfalls; `music.js` plays nothing but a few notes.

Contents (aim 120 meshes, 80 casters, 25,000 triangles):

- **Six discoveries** (`moonfind`, 12 paws): the Planted Flag, Earthrise Rock (a ledge with the best view), the Echo Crater, the Little Rover (a lost toy), the Star Garden (glowing crystals), the Moon Cheese (a golden cheese wedge, a joke she will like).
- **Collectibles:** 8 moon pebbles, small glowing ones.
- **Golden mice (3):** two on ridge-ledge perches (heights 2.6 and 3.0 m, only reachable with the Moon's climb budget), one in a crater.
- **Found outfit:** `moonglasses` from 4 spots.
- **Critters:** none to start (a dust "bunny" is a later idea).
- **Space-mice moment (later):** a small bouncy toy ball to bat in low gravity; same machinery as the yarn ball, flagged as stretch.

### 6.3 Movement model: low gravity against the existing hop and leap rules

The hop stays a render offset; climbing stays the perch budget. The Moon changes only the numbers the player already reads:

| | Earth (today) | Moon (start) | Why |
|---|---|---|---|
| Pounce hop height | 0.35 m base, 0.9 m Spring Paws | 1.4 m, 3.6 m (`hopHeightMul` 4) | physically 1/6 g would be 6x; 4x reads well and keeps the arc on screen |
| Hop time | 0.3 s | 0.73 s (`hopTimeMul` 2.45 = sqrt 6) | the landing thump and dust poof are still driven off the same timer (`session.pounceTime` is scaled to match; one place) |
| Climb budget (perch chain) | 1.6 m / 2.2 m | 3.2 m / 4.4 m (`climbMul` 2) | the ledges and the golden mice at 2.6-3.0 m are meant to feel like a long bound up |
| Walk | pace 1 | pace 0.9, a small skip each stride (0.1 m, none in reduced motion) | the "floaty" feel without a new locomotion |
| Long Leap | gap leaps on the Rooftops | unchanged, not used | the Moon's craters are walked bowls, not gaps, so there is no new traversal to test in the first build; a crater-jump moment could use the leap machinery later |
| Pounce on a mouse or yarn | as today | as today | the arc is only decoration; catching needs no height |

Everything stays reachable because reachability is the perch budget, not the animation (reduced motion flattens the arc and changes nothing about what she can stand on): tests (section 8) run the existing "reach with N hops" gate (`test/helpers/findreach.js` precedent) on the Moon's own budget.

### 6.4 Camera and the suit

The default view reaches about 7 degrees above level, 30 looking up (render/sky.js): Earth at 24 degrees is "look up and there it is". Camera follow of a high hop is eased (60% of the hop's height) so a 3.6 m bound does not fling the view. Ears, tail and face behave as in 4.4; the antenna stays on the helmet, and the visor glass catches a small Earth reflection from a single, cheap constant highlight, not a real reflection.

## 7. Words

### 7.1 Clan Edition: the options

| Option | What changes | Verdict |
|---|---|---|
| A. Everyday only | both sets say the same | safest, but the Clan Edition misses a little magic |
| **B. Starry flavour only (recommended)** | the Clan text calls the starfield "Silverpelt" and the moon pool "the Moonpool"; no ancestors, no ghost cats, no dream-sharing | she loves the books; no death theme (the family lost Rosa, and a lost-cat story is not wanted here) |
| C. StarClan visits | ancestors appear and speak | not recommended: it brings in death as a place to visit, and ghost cats exist in the game for another purpose |

Mechanics: the default text in `clanphrases.js` is the everyday-neutral line for every id. The few Clan-flavoured lines (marked below) are entries in a new `PHRASES` block of the Clan set (`clanwords.js`, which `wordset.js` allows any set to carry), because that file is the only one allowed to hold borrowed vocabulary (structural test). The everyday set (`offclanwords.js`) needs no override for these ids. The tables below show the text each set actually shows.

### 7.2 Line by line

`R` = Reef, `M` = Moon, `S` = suit. "same" = identical in both sets. Lengths suit an 11 and a 9 year old.

**Place and doors**

| Id | Clan | Everyday |
|---|---|---|
| `area.reef.name` | The Reef | same |
| `area.moon.name` | The Moon | same |
| `reef.door.found` | Bubbles are rising by the pier! 🫧 | same |
| `reef.door.prompt` | Suit up and dive in? | same |
| `reef.door.back` | Climb the ladder back to the pier? | same |
| `moon.door.found` | A pool of moonlight hums under the Old Ash. 🌙 | A silver pool hums under the old tree. 🌙 |
| `moon.door.prompt` | Suit up and step into the Moonpool? | Suit up and step into the pool? |
| `moon.door.back` | Step back into the Moonpool? | Step back into the pool? |
| `door.notyet` | This door opens after {n} more walks at {place}. | same |
| `door.notnow` | Not now | same |

**Suit**

| Id | Clan | Everyday |
|---|---|---|
| `suit.name.space` | Space Suit | same |
| `suit.name.dive` | Diving Suit | same |
| `suit.locker.first.dive` | A locker with a paw print on it! Inside, a diving suit made for cats. 🤿 | same |
| `suit.locker.first.space` | A locker with a paw print on it! Inside, a space suit made for cats. 🧑‍🚀 | same |
| `suit.on` | Suit on! Helmet, back-pack, boots. Ready? | same |
| `suit.off` | Your own things are back on. | same |
| `suit.guest` | Your friend has a spare suit for you! | same |

**The Reef**

| Id | Clan | Everyday |
|---|---|---|
| `reef.hint.float` | Hold {pounce} to float up. Let go to sink. | same |
| `reef.air.label` | Air bubbles | same |
| `reef.air.low` | Your air bubbles are getting low. Float up for more! 🫧 | same |
| `reef.air.lift` | A warm bubble lifts you up. No worries at all! | same |
| `reef.air.pocket` | An air pocket! Your bubbles fill right up. | same |
| `reef.page.boat.name` / `.hint` | The Sunken Boat / Something big sleeps on the seabed. | same |
| `reef.page.oyster.name` / `.hint` | The Pearl Oyster / Some shells keep a secret. | same |
| `reef.page.kelp.name` / `.hint` | The Kelp Garden / Look closely among the waving leaves. | same |
| `reef.page.cave.name` / `.hint` | The Glow Cave / A rocky nook shines with tiny lights. | same |
| `reef.page.chest.name` / `.hint` | The Treasure Chest / Somebody lost something shiny. | same |
| `reef.page.anchor.name` / `.hint` | The Old Anchor / Rusty and heavy, and very still. | same |
| `reef.find.<id>.first` | You found {the-thing}! (6 lines, one per page, with emoji) | same |
| `reef.find.<id>.again` | the quiet line for a revisit (6 lines) | same |
| `wear.pearlcollar.name` | Pearl Collar | same |

**The Moon**

| Id | Clan | Everyday |
|---|---|---|
| `moon.sky.line` | Silverpelt twinkles all around you. ✨ | Stars twinkle all around you. ✨ |
| `moon.hint.bound` | Hop here: it is a long, slow bound! | same |
| `moon.page.flag.name` / `.hint` | The Planted Flag / Someone left a little paw flag. | same |
| `moon.page.earthrise.name` / `.hint` | Earthrise Rock / The best view of home. | same |
| `moon.page.echo.name` / `.hint` | The Echo Crater / A big bowl that answers back. | same |
| `moon.page.rover.name` / `.hint` | The Little Rover / A tiny toy truck, a long way from home. | same |
| `moon.page.garden.name` / `.hint` | The Star Garden / Crystals glow in the dust. | same |
| `moon.page.cheese.name` / `.hint` | The Moon Cheese / It is just a rock. Probably. | same |
| `moon.find.<id>.first` / `.again` | 6 + 6 lines | same |
| `wear.moonglasses.name` | Moon Glasses | same |

The `{pounce}` token follows `padText()`, so a pad shows the real button picture. Place names, doors and finds follow the existing id pattern (`roofs.page.*`).

## 8. Tests and budget checks (common to every milestone)

- **Start-up size:** `test/buildsize.test.js` and `scripts/buildjson.mjs` stay at 720 kB; no milestone may grow start-up by more than its share: seam work in M0 at most 1.0 kB gz (physics table 0.4, suit-hook slot 0.5, gateway door kind 0.1). Running total must stay at or below 710 kB. A suit or place file that lands in start-up fails the build (a `startupFiles` check naming `suitkit` and the two chunks).
- **Per-place ceilings in `test/budget.test.js`:** Reef 200 meshes / 140 casters / 45,000 triangles (aim 150 / 100 / 30,000), merged 140 / 90; Moon 180 / 120 / 40,000 (aim 120 / 80 / 25,000), merged 110 / 70. Chunk at most 60 kB gz (ceiling 100).
- **Cat caps:** bare cat 10,350 / 5,500 and the crowd cap untouched; suit gates as in 4.1.
- **Word tests:** every new id in both sets, `bannedIn()` clean in both, the Reef's phrases scanned for the banned list, fixtures re-recorded once per milestone that adds ids; the structural test (no series word outside the word-set files) stays green.
- **Water and swimming:** `test/water*.test.js` and `waterstate.test.js` untouched and green; the Seaside gains only the pier ladder and the bubble column (mesh and triangle rows re-measured, ceilings unchanged).
- **Save:** `SAVE_VERSION` stays 4; the two key-list tests gain `walks.reef` and `walks.moon` only; `test/savesize.test.js` unchanged in meaning.
- **Hagrid:** `test/hagrid.test.js` DELTA gains one head piece; goldens untouched.
- **Gamepad and TV:** the door prompt, the gauge and the hints are reachable and readable by pad; `gamepadnav` tests extended to the door card.

## 9. Milestones

| M | What | Tests and budget checks |
|---|---|---|
| **M0** Seams | `placephysics.js` table (empty rows), `effectiveWear` pure function and its hook slot, `kind: 'door'` gateway rows and the map's dotted mark, the two catalog rows disabled (not live), phrase ids reserved, the banned-word scan helper | start-up growth at most 1.0 kB; flat-trace tests unchanged for every place; gateway and areas tests accept the new kind; no visible change |
| **M1** Suit kit | `suitkit.js`, two looks, `verify-suit.html` picture sheet for owner sign-off (on all cat shapes, standing, sitting, in a hop), Hagrid's helmet | per-piece and kit gates, no-ground-clip poses, mesh and triangle sums, glass is `noCast`, crowd of 3, zero start-up growth |
| **M2** Reef shell | `reef.js` empty seabed, light, fog, shimmer ceiling; the dive door and ladder at the Seaside pier; suit-up ritual and the first-visit locker line; float movement and `floatY`; the air gauge; camera table | area test (builds, no `waters`, spawn clear, reachable), budget rows added, door round trip, float gate (all reachable heights from the spawn with no skills), gauge never reaches a bad state (property test: no path to a fail state), banned-word scan, Seaside rows re-measured |
| **M3** Reef content | six pages and finds, collectibles, 3 golden mice (two at float height), `pearlcollar` and its 4 spots, fish school, bubbles, turtle, crabs, air pockets, sound | found-spot gate (`foundspots` reach test with floatY), discovery awards and the `divefind` tally, mouse total 45, budgets, word fixtures in both sets, reduced-motion pass |
| **M4** Moon shell | `moon.js` ground, craters, ridges, lander and the locker door; the Pines moonlight pool; low-gravity numbers; Earth and starfield; the space suit look; camera easing | area test, hop and climb gate on the Moon's budget, existing places' player traces unchanged, budget rows, door round trip, Pines rows re-measured (its chunk carries the Gathering) |
| **M5** Moon content | six pages and finds, pebbles, 3 golden mice, `moonglasses`, sound, the quiet music, optional bounce ball | found-spot gate, awards, mouse total 48, fixtures, reduced motion |
| **M6** Polish and hand checks | owner's picture sign-off, iPhone 18 reading, DualSense, one co-walk through each door | frame times in the perf readout, no budget row raised |

Reef is M2-M3, Moon M4-M5. If the owner wants a smaller first release, M0-M3 ship alone (diving only).

## 10. Risks

1. **Start-up chunk.** About 11 kB headroom and TV mode wants some. Mitigation: everything big is lazy; the seams are tiny and measured; a milestone that exceeds its share does not merge.
2. **Float height as a second kind of height.** Two heights (perchY and floatY) could be confused. Mitigation: floatY lives only in the two places' table rows, is read only by finds and pick-ups, and a test fails if anything else reads it.
3. **Hop timing scaled on the Moon** touches the pounce-pose timer (`session.pounceTime`, the landing thump): a mismatch would play the thump while she is still in the air. Mitigation: one scale constant, one place, an animator test of the landing frame.
4. **Water vs diving.** Two ways to be in water (the Seaside's wading and the Reef's float) could drift. Mitigation: the Reef has no `waters`, so the swim code never runs there; the Seaside's rows only change by the door dressing.
5. **Transparent helmets.** Transparent draws are the costly kind on phones. Mitigation: one small sphere, no shadow, at most one per cat; a perf check at the crowd of three.
6. **Kids reaching the doors early.** The Moon after Pines walks is fine, but a co-walk with someone who has not unlocked the place is allowed through the guest rule: guests walk once, nothing spent (the world map rule for guests).
7. **Mood.** Underwater and space can read as lonely or scary. Mitigation: a warm light, friendly fish, a quiet but not silent soundtrack, no darkness, no meter that fails, no ancestors.
8. **Edition drift.** A new line in one set only. Mitigation: the existing set-parity tests run over every new id.

## 11. Open questions for the owner (recommended answers)

1. **Order and scope.** Build the suit kit and the Reef first (M0-M3), then the Moon? **Recommended: yes**, as you suggested; the Moon is a second release.
2. **Where do the doors stand?** The Reef's at the Seaside pier end (bubble column), the Moon's under the Old Ash on the Pines island (moonlight pool)? **Recommended: yes**; the other candidate is the Rooftops telescope.
3. **The suit: free from a locker, not in the shop, not a saved outfit?** **Recommended: yes**; her normal clothes are never touched and come straight back. The found outfits (`pearlcollar`, `moonglasses`) are the things she keeps.
4. **Moon words in the Clan Edition:** everyday only, starry flavour (Silverpelt, the Moonpool), or ancestors visiting? **Recommended: starry flavour only.**
5. **Is a breath gauge wanted at all?** It is gentle (warm bubble lift, nothing lost), but some children may still dislike a countdown. **Recommended: keep it, 90 s, hidden for the first 20 s on a first visit**; air pockets everywhere so a kid who never looks at it never sees a lift.
6. **Start-up headroom.** M0's seams use up to 1.0 kB of the 11 kB left, and TV mode takes some of the same. **Recommended: agree that these are the first claim on the headroom, and the ceiling stays at 720.**
