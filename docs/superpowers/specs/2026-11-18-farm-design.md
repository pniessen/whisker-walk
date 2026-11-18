# Appletree Farm: a new street area (design, 2026-11-18)

## Why

The last five areas were all clan territories round the lake. The street side
(Neighborhood, Park, Seaside, Docks) has had nothing new since the Docks. The
owner asked for a new adventure area and chose a farm because "interacting with
other typical farm animals will be interesting". A farm is the game's own
place: it is in both editions and reads the same under both word sets.

Players: a girl of 11 and a boy of 9, and soon the public.

## Owner decisions (2026-11-18)

1. **Animals, in this order of importance:** cow, goat, chicken.
2. **The cow:** the cat walks around her, jumps on top of her, plays.
3. **The Farm has jobs to finish AND things to explore and discover.**
4. **Jobs and discoveries:** the owner said "you decide", then approved the
   list below ("Looks good").
5. **Where it opens:** third in the street chain (Neighborhood, Park, Farm).
6. **Layout:** the draft map below, approved ("Looks good").
7. **Anti-goals,** confirmed: no animal is ever hurt or eaten; nothing at the
   Farm frightens or chases the cat (the dog is a friend); no job has a timer
   or can be failed.

## Claude's calls (not the owner's words; change freely)

- Name: "Appletree Farm", id `farm`.
- Price 75 coins, requires 2 walks in the Park. It opens BESIDE the Seaside
  (which keeps `requires: park`), so no existing save finds a gate closed.
  Saves that are already past the Park see the Farm ready to buy.
- No entry in `COLONY_AREAS` at first, so no database change is needed to
  ship. Feeding strays at the Farm is a follow-up that needs the owner's yes
  for one SQL statement (`colony_feed`'s allow-list in
  `docs/supabase-colony.sql`).
- Three golden mice like every area: totals become 33 (Clan) and 15 (Legacy).
- No yard dog that chases. The Farm's dog is a friendly sheepdog.

## The place

Seen from above, north up. About the size of the Seaside or Docks ground.

- **South:** the farm gate (spawn) and a lane up to the farmyard.
- **Farmyard (the hub):** packed earth. North of it the red barn with a
  hayloft; hay bales beside the barn are the way up. Along the east side, top
  to bottom: tractor shed (with a tractor), grain store, milking shed.
- **West of the yard:** hen coop and run; farmhouse with the sheepdog's
  kennel; vegetable patch.
- **North-west:** goat paddock with rocks and a jumping stand.
- **East edge:** the long cow pasture, with a shade tree and a water trough.
- **North:** wheat field with a scarecrow.
- **South-west:** duck pond with a small jetty (wade and swim).
- **South-east:** orchard of apple trees (climbable with the tree skill).

The draft picture the owner approved is described by this list; the builder
may adjust distances for play.

## The animals

- **Cow (new, the first big animal).** Calm, grazes, wanders slowly inside the
  pasture, never startles. The cat can walk under and around her, jump onto
  her back (a moving perch), sit, ride and nap there, and jump off. A meow gets
  a moo. Two or three cows; one is the "job" cow.
- **Goat (exists as a small creature; here a character).** Cheeky. Hops on the
  rocks and stand, gently butts heads with the cat (a play moment, no knock
  back that could annoy), copies the cat's jump when she jumps nearby.
- **Hens and chicks.** Hens peck about the yard and flutter aside when the cat
  runs through; they settle again at once. Chicks follow a calm (walking) cat
  and scatter a short way from a running one.
- **Sheepdog.** Friendly. Wags, trots over, walks beside the cat for a while,
  lies down. Never barks at or chases the cat.
- **Also:** ducks and ducklings on the pond (ducklings swim after a swimming
  cat), mice in the grain store, an owl asleep in the barn rafters, a barn cat
  and her kittens in the hayloft.

## Jobs (each fits in one walk; none can be failed; no timers)

1. **Round up the chicks.** The hen has lost her chicks around the yard. Find
   each and walk it back to the coop.
2. **Bring the cow in.** Walk ahead of the job cow and she ambles after you to
   the milking shed. Reward: a saucer of milk.
3. **Catch the goat.** The goat has the farmer's hat. A chase round the yard
   and over the bales; cornered, the goat drops it. The cat carries the hat
   back to the farmhouse door.
4. **Barn mouser.** Chase the mice out of the grain store. They run out
   through a hole; nothing is caught or hurt.

A job is offered when the cat comes near its giver, can be ignored, and stays
available on later walks. Each finished job is a journal entry and pays coins
in line with the existing quests.

## Things to discover (no prompt points at them)

- A. The hayloft, reached by climbing the bales: the barn cat and her kittens.
- B. A hidden nest of eggs behind the tractor.
- C. An owl asleep in the rafters.
- D. The scarecrow, wearing something the cat can try on.
- E. Apples that drop when the cat climbs an orchard tree.
- F. Ducklings that follow a swimming cat.

Each discovery is a journal entry the first time.

## Everything else an area has

The builder uses the Docks and Seaside as models and adds `farm` to every
per-area list they appear in: catalog and `defaultState.walks` (with old saves
loading cleanly), the `AREAS` map in `walk.js`, marks, clouds, ambient,
pawprints, grass, audio, fish, legendary (or the "none yet" list), gold mice,
prop sets (carryables, knockables, rests, hides, flaps, keep slots), perches,
waters, critter spawns, pois for the existing quests and the race, the home
card picture `public/places/farm.jpg`, budgets in `test/budget.test.js`.

## Build order

1. **The place.** A walkable Farm with every list entry, existing mechanics
   (perches, water, existing small creatures), unlock, tests, card picture.
2. **The animals.** Cow (model, wandering, ride), goat character, hens and
   chicks, sheepdog, ducklings.
3. **Jobs and discoveries**, with journal entries.

Each step ends with the full suite green and before/after or tour pictures for
the owner, who approves looks from pictures.

## Constraints

- Performance: stay inside a budget no larger than the Docks' (600 meshes /
  500 casters / 90k triangles) and aim well below it; older iPads matter.
- Text for a 9-year-old reader. No series words anywhere (the area is shared
  by both word sets); the borrowed-word tests must pass untouched.
- Offline-first: nothing at the Farm contacts the database.
- "On" series snapshots and the cat shape fixtures stay byte-identical.

## Goals

- A child can spend a whole walk with the animals and not run out of things to
  try.
- The cow ride works on touch and keyboard and never traps the cat.

## Non-goals

- No farmer character to talk to in this version (the farmhouse door is the
  hand-in point). No riding the goat or the sheepdog. No crops to grow, no
  feeding animals for coins, no day and night cycle.
- No clan features: no borders, patrols, camp or fights at the Farm.

## Anti-goals

- An animal hurt, eaten or shown frightened for longer than a flutter.
- Anything that chases or scares the cat.
- A job with a timer, a fail state, or a nag.
