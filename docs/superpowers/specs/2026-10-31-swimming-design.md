# Swimming and wading: design

*2026-10-31. From the playtester ("when a cat hits water there
should be a swimming type behaviour, rather than just walking across"),
answered by the owner in chat. Sketches the owner and playtester chose from:
https://claude.ai/artifact/RQ23zRXL6q23FHQPwqBgEr (they picked A, C and D).*

## Why

Today water is a wall unless the cat has the **Sea Legs** skill (earned
after 5 seaside walks, `src/skills.js`). With Sea Legs the cat crosses at
`SWIM_SPEED` 0.55 of its pace, but it looks exactly like walking: full
height, walking stride, as if the water were a floor (`src/player.js`
~570–610 sets `api.swimming`; nothing draws it). The playtester noticed.

Success: a kid walks into a pond and the cat wades in carefully with little
splashes, then, if it has Sea Legs, sinks to its shoulders and paddles
across with ripples trailing behind, then climbs out on the far bank and
shakes itself off. A kid without Sea Legs can still splash about in the
shallows.

## What the owner decided

1. **Shallows: wading (sketch C).** Near the edge the cat wades belly-deep
   with high, careful steps and small splashes.
2. **Deep water: paddling (sketch A).** The cat sinks to its shoulders; its
   head and the top of its back stay above the water, its legs paddle
   underneath, its tail floats, and a small V of ripples trails behind.
3. **Climbing out: the shake (sketch D).** On reaching dry land the cat stops
   briefly and shakes itself off with droplets flying.
4. **Every cat can wade into the shallow edge.** Sea Legs is needed only to
   swim out into deep water. (Today a cat without Sea Legs is stopped at the
   water's edge.)

## Claude's calls (flagged; the builder may push back with a reason)

- **What "shallow" means.** The game's water is flat footprints (rects and
  circles, `src/world/builder.js`) with no depth. `waterClearance(waters, x,
  z)` is a signed distance: negative inside water. So **shallow is the band
  within `SHALLOW` metres of the shore** (`waterClearance` between −SHALLOW
  and 0), and **deep is anything further in.** A starting value of about
  1.2 m; the builder tunes it by eye.
- **The wall moves, it doesn't vanish.** For a cat without Sea Legs, the
  shore push that keeps it dry today becomes a push that keeps it out of deep
  water: it can walk into the shallow band and no further. A cat with Sea
  Legs is never pushed, as today.
- **No new crossings for non-swimmers.** Wading must never let a cat
  without Sea Legs get from one bank of a water to the other bank. All dry
  land is already one connected piece (test/water.test.js), so "reachable"
  can't be the test. The test is about routes: for each water, no dry point
  on one bank gets a shorter walking route to a dry point on the other bank
  through the shallows. Small savings along the *same* bank (wading round a
  prop or a fence end that meets the water, a few metres) are fine.
  Each water footprint may carry its own shallow width, and narrow waters get
  a smaller band or none.
- **Depth is measured to a real shore.** Where footprints overlap (the
  Moor's river mouth over the lake, the Woods' pond over the river),
  `waterClearance`'s smallest distance can measure to an edge that runs under
  open water. That made a 92 m ford across the Moor's river mouth in a grid
  test. The depth used for shallow/deep must ignore footprint edges that lie
  inside another water.
- **Speeds.** Wading is a little slower than walking (about 0.8 of pace),
  swimming stays at `SWIM_SPEED` 0.55. Swimming must still beat every dry
  detour (the CF-12 rule in player.js).
- **What the cat can do in water.** Today interactions skip a swimming cat
  (rest, marks, carry, pounce; `src/game/interactions.js`). Swimming keeps
  that. Wading allows the usual verbs except resting and napping. Carrying
  stays as it is today: a cat with Sea Legs keeps hold of what it carries
  while it swims (the drop prompt hides and the rain slip pauses, as now),
  and a cat without Sea Legs can carry it into the shallows.
- **The shake.** About 0.8 s, once per climb-out: always after swimming,
  and after wading only when the cat was in the water for at least about 3
  seconds (so running in and out of the surf doesn't shake every time). The player can move during it at reduced speed, or it
  can be skipped by moving (the builder decides which feels better). With
  reduced motion: a short puff of droplets, no body wobble.
- **Look details.** Wading: legs hidden below the waterline, belly-deep, a
  higher, slower stride, small splash particles at the feet. Swimming: body
  lowered so the waterline sits at the shoulders, the head tilted up, a
  paddle cycle on the legs (mostly hidden), the tail lying on the surface,
  ripple rings and a V-wake while moving, a gentle bob while still. The
  water surface itself doesn't change.
- **Hagrid** (the chicken avatar) gets a cheap version: he sits lower in
  the shallows with his normal walk, floats and bobs at the surface in deep
  water, and fluffs his feathers instead of shaking. His goldens stay
  byte-identical.
- **Sound.** Soft splashes while wading, a paddle sound while swimming, a
  shake sound, through the existing audio module (`src/audio.js`).
- **Everywhere there's water.** The Park pond, the Seaside sea, the Docks
  canal, and the Woods, River and Moor waters (and the Pines and island when
  they're built). Seaside wading in the surf is the headline case.
- **Co-walks.** Each device draws its own cat; a remote co-walker's cat is
  drawn from its streamed position. A remote cat should look wading or
  swimming from where it is, computed on the viewing device from the same
  water footprints, not sent over the wire.
- **The Sea Legs description** changes to match: wading is for everyone,
  Sea Legs lets you swim out into deep water.

## Constraints

- **The new cat body** (merged 2026-10-31, `src/cat/model.js` and the
  animator) carries the poses. Hagrid's goldens stay byte-identical;
  `test/catgolden.test.js` and its fixtures are never regenerated.
- **Budget.** Splash, ripple and droplet effects are pooled and cheap: no
  per-frame allocation, a fixed small number of draw calls. Must hold 60 fps
  on the iPhone 18 at the Seaside.
- **No save change.** `SAVE_VERSION` stays 4. Nothing new is stored.
- **Critters, strays, ghosts and toys** keep ignoring water, as today (the
  ducks paddle inside footprints on purpose).
- **Golden mice and finds** stay reachable without Sea Legs; none may sit in
  a shallow band that a non-swimmer can only reach by wading if that would
  make them reachable through a new route. (The no-new-shortcuts test
  covers this.)
- **Decks** (bridges, piers, stepping stones) stay dry ground; wading never
  starts on a deck.

## Goals

- Water looks like water: the cat wades, swims and shakes.
- Every kid can play in the shallows; Sea Legs still matters.
- No map gains a crossing that a non-swimmer didn't have.

## Non-goals

- No drowning, no stamina, no getting tired, no penalty for swimming.
- No underwater view or diving.
- No depth maps or sloping lake beds; "deep" is distance from shore.
- No change to how strays, critters or ghosts treat water.

## Anti-goals

- A kid without Sea Legs finds a new way across a river or canal.
- The cat gets stuck at the shallow/deep line or jitters along it.
- The phone slows down at the Seaside.

## Left to the builder

- SHALLOW per water, wading speed, shake length and whether it can be cut
  short.
- The exact poses, splash and ripple look, and sound choices.
- How the shallow/deep line is enforced for non-swimmers (reusing
  `nearestDry`'s ring search or a new signed-distance push), as long as it
  doesn't jitter.
