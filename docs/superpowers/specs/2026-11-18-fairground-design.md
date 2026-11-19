# The Fairground: a new street area (design, 2026-11-18)

## Why

After the Farm the owner asked for ideas for more areas and chose three:
Fairground, Rooftops, Market Square. The Fairground is first. It reuses what
the Farm introduced (riding something that moves, friendly company, small
things to finish) in a place that looks and plays nothing like a farm. Like
every street area it is in both editions and reads the same under both word
sets.

Players: a girl of 11 and a boy of 9, and soon the public.

## Owner decisions (2026-11-18)

1. **The first thing the children run to is the merry-go-round.** It is the
   centrepiece.
2. **Then the roller coaster.**
3. **Three more rides,** picked from six offered: Ferris wheel,
   helter-skelter, teacups.
4. **Two or three midway games.** He approved the three below, the prizes,
   the discoveries and visitors strolling about ("Looks good").
5. **Daytime fair that lights up at dusk.**
6. **Opens at the same time as the Farm and the Seaside.**
7. **Layout:** the draft map below, approved ("Looks good").
8. **Anti-goals,** confirmed: nothing frightens or chases the cat; no game or
   ride can be lost or failed; nothing costs coins to play; the cat can hop
   off any ride at any moment and is never stuck; visitors never step on or
   shoo the cat.

## Claude's calls (change freely)

- Name "The Fairground", id `fair`.
- 75 coins, requires 2 walks in the Park (same as the Farm). The Park's home
  line then has three places to name; word it for a 9-year-old ("One more walk
  here opens three new places!" or list them) and record the change.
- Not in `COLONY_AREAS` at first: no database change needed to ship.
- Three golden mice like every area (totals rise by 3 in each edition).
- No yard dog.

## The place

Seen from above, north up, about the size of the Farm.

- **South:** the fair gate (spawn) under an arch of bunting, then the midway:
  a broad path north with stalls on both sides.
- **Centre:** a round plaza with the merry-go-round, visible from the gate.
- **North end:** the Ferris wheel, tall behind the merry-go-round: the
  landmark on the skyline.
- **East side:** the roller coaster loops along the whole edge; its platform
  faces the plaza.
- **West:** the teacups. **North-west corner:** the helter-skelter.
- **On the midway:** tin-can alley and the ring-the-bell pole among the
  stalls; the hook-a-duck pool just off to the west side.
- **South-east, behind the stalls:** the fortune teller's tent and the backs
  of the tents where the juggler practises.
- **South-west:** a bandstand and a picnic lawn. **North-west of centre:** an
  open field.

## The rides (free, repeatable, never stuck, no fail)

Getting on is the normal jump or the paw button; getting off is jump again or
pushing the stick, at any moment, landing on free ground.

1. **Merry-go-round.** A turning platform with horses that rise and fall and
   music. The cat hops onto the platform, up onto a horse, rides round, and
   can hop from horse to horse while it turns.
2. **Roller coaster.** A small friendly one with a caterpillar or dragon
   train. The cat hops into a car at the platform; it clanks up the hill and
   swoops round the track with the camera following, then stops at the
   platform. Ears back, enjoying it. Gentle speeds; nothing scary. Hopping out
   mid-ride puts the cat safely on the ground beside the track.
3. **Ferris wheel.** Hop into a gondola at the bottom, carried slowly up and
   over. At the top a small platform can be hopped onto (discovery F); the
   next gondola takes the cat down again.
4. **Helter-skelter.** Climb the stairs inside the tower, slide down the
   spiral outside. Quick to repeat.
5. **Teacups.** Sit in a cup that spins while the floor turns. The cat
   wobbles for a few steps afterwards.

## Midway games (cannot be lost; a miss is just another go; free)

1. **Tin-can alley.** A pyramid of tins on a shelf; jump up and bat them all
   down. Reuses knocking things over.
2. **Hook-a-duck.** Rubber ducks bob round a small pool; wade in and catch
   one in the mouth; some have a star underneath. Reuses wading and carrying.
3. **Ring the bell.** Pounce on the pad; the marker shoots up the pole; a
   good pounce rings the bell.

**Prizes:** the first win at each game gives something to wear: a paper
crown, a prize ribbon, a balloon tied to the tail. Later wins give a few
coins. Each first win is a journal entry.

## Things to discover (no prompt points at them)

- A. The fortune teller's tent: a crystal ball that shows the cat's own face.
- B. The music box at the back of the merry-go-round, turning.
- C. The candyfloss stall: a wisp sticks to the cat's whiskers.
- D. The juggler practising behind the tents, who drops a ball to chase.
- E. A runaway balloon to chase across the open field.
- F. The platform at the top of the Ferris wheel.

Each is a journal entry the first time.

## People

Visitors stroll the midway and watch the rides (the existing villager
figures, a handful, simply animated). They walk round the cat, never over
her, and never shoo her. Some wave or crouch to say hello when she meows.

## Light

A daytime fair: bunting, striped awnings, bright paint. During the walk's
dusk the bulbs on the rides and the strings over the midway glow (emissive
material and a few cheap glows, not real lights), and the Ferris wheel turns
lit against the sky.

## Everything else an area has

As the Farm did: every per-area list a street area appears in (catalog and
`defaultState.walks` with old saves loading cleanly, `AREAS` in `walk.js`,
marks, clouds, ambient, pawprints, grass, audio, gold mice, prop sets,
perches, waters for the duck pool, pois for the existing quests and the race,
the home card picture, budgets). The Farm's step reports list them.

## Build order

1. **The place:** ground, midway, stalls, static rides, tents, bandstand,
   lists, unlock, tests, card picture.
2. **The rides moving and ridable,** one at a time: merry-go-round first, then
   Ferris wheel, teacups, helter-skelter, roller coaster last (it needs a
   following camera on a track).
3. **Games, prizes, discoveries, visitors, dusk lights.**

Each step ends with the full suite green and pictures for the owner, who
approves looks from pictures. Build starts after the Farm is merged, because
both add rows to the same lists.

## Constraints

- Performance: rides are the densest props in the game. Budget no larger than
  the Docks' (600 meshes / 500 casters / 90k triangles), aim for the
  territories' (450 / 380 / 70k); moving rides share geometry and cast few
  shadows. Older iPads matter.
- A riding cat is carried by a moving perch, as on the Farm's cow; reuse that
  machinery (`src/farmanimals.js`) rather than inventing a second one.
- Text for a 9-year-old; no series words; borrowed-word tests untouched.
- Offline-first: nothing here contacts the database.
- Two players: rides are simulated per device as the Farm's animals are,
  unless a shared ride clock is cheap (rides are deterministic in time, so
  two devices can agree without messages; the builder should try this).

## Goals

- Every ride is fun for ten seconds and safe to leave at any time.
- A child can win every game, and wants to show the prize.

## Non-goals

- No bumper cars, ghost train or swing boats in this version. No tickets,
  tokens or prices. No queueing. No scoring tables or high scores.

## Anti-goals

- Anything that frightens or chases the cat.
- A ride the cat cannot leave, or a game that can be lost.
- Visitors stepping on, blocking or shooing the cat.
- Motion on the roller coaster or teacups strong enough to make a child
  queasy: keep camera swings gentle.
