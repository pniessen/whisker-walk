# The Old House: design

Date: 2026-11-20. Status: drafted from the owner's answers on 2026-11-19 and 2026-11-20; waiting for his approval.

## Intent

The owner asked for an area "inside a house": "Whole opportunity house is just to do same activity types (explore, etc) in an indoor setting." The players are his two children, a girl of 11 who loves Warrior Cats and a boy of 9. They have a dozen outdoor places. The house gives them the same kinds of fun they already know, indoors, in a setting that looks and feels unlike the streets and the territories.

## What the owner decided

- **A new house to visit, not the cat's own home.** It is its own place on the world map. The Cozy Den (`src/world/den.js`) stays her home, unchanged.
- **A big old house.** Creaky stairs, a dusty attic, a cellar, a library with tall shelves, a grandfather clock. Cozy and a little mysterious, never scary.
- **An old resident cat lives there.** She is a wise old house cat who knows every secret and gives hints. There are no people in the house.
- **One continuous house with see-through walls.** The cat walks freely between rooms and floors. Walls between the camera and the cat sink or fade. Only the cat's own floor is drawn in full.
- **The picture as played back on 2026-11-19 is right** ("Looks right").

## Goals

- A child finds something within the first minute: a golden mouse, a discovery, a climb.
- Every room has something to do. No room is just a corridor.
- Moving between rooms and floors never loses the cat behind a wall.
- Both children can explore it together and see each other anywhere in the house.
- A child who finds everything has made a friend of the old cat.

## Non-goals

- The den does not change, and the house does not connect to it.
- There are no people, no Twolegs to sneak past, and no stealth.
- No weather, strays, dogs, enemies or fights indoors.
- No furniture buying or placing. That stays the den's job.

## Anti-goals (a failure even if it works)

- **Scary.** No ghosts, no jump scares, no pitch-dark rooms. The cellar is dim and friendly: warm lamp light, cobwebs, barrels, mice.
- **Lost behind walls.** If the camera ever shows a wall instead of the cat, the house has failed. That holds for any room, any corner and either player.
- **Fiddly on a phone.** Stairs, doorways and climbs must work with the same thumb controls as outdoors. No precise jumps.
- **Slow on an old iPad.** The house must not be the place that stutters.

## The house (my proposal, played back and accepted)

Three floors plus a cellar, about seven rooms:

| Floor | Room | What it is for |
|---|---|---|
| Ground | **Hall** | The front door where she arrives, the big staircase and the grandfather clock. |
| Ground | **Library** | Tall shelves to climb, a rolling ladder, and a bookcase that swings open onto a hidden passage. |
| Ground | **Kitchen** | Counters, things to knock off, a pantry with mice. |
| Ground | **Parlour** | The fireplace, armchairs, and a piano whose keys play notes when she walks along them. |
| Upstairs | **Bedroom** | A big bed and a wardrobe to hide in (and leap from). |
| Top | **Attic** | Boxes, an old trunk, and a round window looking out over the rooftops. |
| Below | **Cellar** | Barrels, cobwebs, and mice, lit warm and friendly. |

How the rooms join is the builder's call: doorways, the main staircase, a narrow back stair or ladder to the attic, cellar steps from the kitchen. The hidden passage behind the library bookcase is a short shortcut, to the cellar or the back stair.

## What there is to do

The same kinds of fun as the outdoor places, as the owner asked:

- **Golden mice** hidden around the house, using the existing golden-mice system (`src/goldmice.js`).
- **Discoveries** (`src/discoveries.js`): the clock chiming the hour, a tune on the piano, the view from the attic window, and the bookcase opening. The builder adds two or three more in the same spirit, for example a cat-shaped dent in an old cushion or a box of old toys.
- **Found outfits:** four per area, as in the found-outfits design, hand-placed spots, and old-house-flavoured (e.g. a lace collar, a tiny reading-glasses pair). These follow found outfits steps 2 and 3, and the names go to the owner and his daughter.
- **The yarn ball** lies somewhere each walk, as in every area.
- **Mice to chase** in the pantry and the cellar (`src/critters.js`).
- **Knock-overs** on the kitchen counters, mantel and shelves (`src/knockables.js`, as in the den).
- **Climbing routes** up the furniture, using the Rooftops moves (`src/traversal.js`): balance along a shelf edge or the banister, leap from the wardrobe to the bookcase top, drop down in short steps. Every leap lands, and nothing can go wrong, as on the Rooftops.

## The old cat (owner: yes; details are my proposal)

- She lives in the house, usually in a favourite spot such as the parlour armchair by the fire, and moves to one or two other spots.
- When the cat comes near, she says a gentle hint line that points toward something not yet found ("Have you tried the top of the bookcase?"). Hints come from what this child hasn't found yet, and there are never more than a line or two a visit.
- **Friendship:** when a child has found every discovery and golden mouse in the house, the old cat becomes her friend and joins "My clan" (the owner's menu decision of 2026-11-19 puts every cat friend there). She is a friend, not a clan warrior or a recruit.
- **Her name** is a placeholder until the owner and his daughter choose one. Use "Old Thimble" in the everyday words and an elder-kittypet name in the clan words. Every line goes through the word tables for both word sets.

## Look and feel

- Warm wood, wallpaper, rugs, old lamps and dust motes in sunbeams.
- By day the light comes through the windows. At dusk the lamps glow, as the dusk choice does elsewhere.
- Creaks and the clock ticking as quiet ambient sound, all under the game's existing sound switch.
- No tall wall between the camera and the cat, ever. See below.

## How it is built (owner's choice: one house, see-through walls)

- **One continuous house** in one scene. The cat walks between rooms through doorways and between floors by stairs.
- **See-through walls.** A wall (or wall section) that comes between the camera and the cat sinks to a low stub or fades. Walls behind the cat stay full height, so rooms still read as rooms. The den's open-fourth-wall rule (`DEN_CAMERA_WEDGE`) generalises to "nothing tall between camera and cat" checked as the cat moves. Whether walls sink, fade, or both is the builder's call; it must look calm, not flicker.
- **Floors.** Only the cat's own floor is drawn in full. The floor above is hidden or cut away so it never blocks the view. The floor below is drawn simply, or not at all. This uses the same near-the-cat streaming idea the grown areas use (`src/world/streamcore.js`). On a two-player walk, the partner on another floor stays visible, for example drawn on their floor's simple version, or shown as a marker.
- **Stairs** are walkable slopes with the same thumb controls, and the camera eases as the floor changes.
- **The resident cat** reuses the existing cat model and rules where possible (stray and kittypet code in `src/housecats.js` and the strays), not a new animal.

## Fit with the game

- **Both editions.** In the clan words it is an old Twoleg nest. Every label goes through the word tables for both word sets.
- **World map:** a street place next to the town (Twolegplace) in `STREET_PLACES` in `src/worldmap.js`, drawn like the others.
- **Unlock (my proposal):** 150 🐾 after 2 town explores, through `areaOffer` (`src/areaoffer.js`). The owner may change it.
- **Co-walk:** both children explore together. Golden mice, discoveries and finds follow the same two-player rules as outdoors: deterministic from the room seed, never from `walkRng`.
- **Guided tour:** one short hint the first time she enters, and it goes into the queued tour-hints work.

## Constraints

- **Performance:** the street ceiling of 450 meshes, 380 shadow casters and 70,000 triangles at the worst spot (`test/budget.test.js`). Furnished rooms are dense, so share geometry (one wallpaper and wood atlas) and draw only the cat's floor in full. Older iPads matter most.
- **Determinism for two players:** placements are data or seeded on their own salted streams.
- **Offline-first:** nothing contacts the database.
- **Text** is pitched for a 9-year-old and goes through the word tables. No series words in string literals outside them (`test/clanwords.test.js`).
- **Merge and push** need the owner's yes. Each build step ends with the full suite green and pictures for the owner.

## Build order (my proposal)

1. **The house and the camera:** rooms, stairs, see-through walls, floor streaming, lighting, day and dusk, the budget at the worst spot, a never-lost-behind-a-wall test, and a test page. Pictures and a short film for the owner, who approves the feel.
2. **Things to do:** golden mice, discoveries (clock, piano, attic window, bookcase), knock-overs, mice, the yarn ball, and climbing routes with the traversal moves.
3. **The old cat:** her spots, hint lines, friendship and joining My clan, and her name from the owner.
4. **Into the game:** the world-map place, the unlock, the card picture, both word sets, co-walk checks, found-outfit spots (after found outfits step 3), and a tour hint.

This starts after Rooftops step 2 merges (the owner's queue), because it shares the traversal moves and the walk code.

## Left to the builder

- The exact floor plan, room sizes and how the rooms join.
- Whether walls sink, fade, or both, and the timing.
- How a partner on another floor is shown.
- The extra discoveries, within the spirit above.
- Which existing systems to reuse for the old cat and the piano notes.

## Approaches considered

1. **One continuous house with see-through walls.** Chosen. It is the only option that feels like exploring a big old house, and it reuses the near-the-cat drawing already proven in the River and the Woods.
2. **Rooms as separate scenes joined by doors.** This would be the simplest: each room gets the den's open-wall camera. But it feels like separate rooms rather than a house, and a partner disappears whenever they are in another room.
3. **The whole house as an open dollhouse.** Charming, but the cat is tiny on a phone, it is hard to control, and drawing every room in full goes over the triangle ceiling.
