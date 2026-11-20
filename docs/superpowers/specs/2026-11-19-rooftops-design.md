# The Rooftops: a new street area with two new moves (design, 2026-11-19)

## Why

After the Farm the owner chose three new areas from a list of eight:
Fairground, Rooftops, Market Square. The Fairground is built. On 2026-11-19 he
asked for the Rooftops plan ("that sounded very interesting"), chose the
version with new moves, and said what it is for: **"I see the cats exploring,
learning, having fun."** He also asked for birds to chase on the roofs.

It is the game's first area played above the ground, and it gives the cat two
new ways to move that can later be used in every other area.

Players: a girl of 11 (she loves Warrior Cats) and a boy of 9, and soon the
public. Like every street area it is in both editions and reads the same under
both word sets.

## Owner decisions (2026-11-19)

1. **New moves, not just ramps and hops.** ("For roof let's add some new
   moves.")
2. **What it is for: exploring, learning, having fun.**
3. **Birds to chase on the roofs.**
4. **How the moves work: free roofs plus marked crossings** (his pick of three
   offered): the cat roams freely on each roof; planks, gutters, ridges and
   washing lines are crossings she balances along; leaps happen at gaps that
   are visibly marked, and a leap always lands.
5. **The house is a separate area,** designed after this one ("Whole
   opportunity house is just to do same activity types (explore, etc) in an
   indoor setting"). The Rooftops starts from a back alley, not from inside a
   house.
6. **Getting down is at marked drop spots,** and **drops are short, in steps**
   (his picks, 2026-11-19; see "Changing level").

## Approaches considered (the moves)

| | How | Trade-off | |
|---|---|---|---|
| A | Leap off any edge, balance on anything narrow | Freest; every edge in every area needs a landing rule; "never fall, never fail" is hard to keep | not chosen |
| B | Longer hops between set perch spots; planks and lines are end-to-end hops | Cheapest; feels like moves the cat already has | not chosen |
| **C** | **Walkable roofs (raised ground) plus placed crossings: balance along them, leap at marked gaps, always land** | Free exploring with crossings that cannot go wrong; crossings are data placed like perches, so any area can have them later; no leaping from just anywhere | **chosen** |

## What exists today (recon 2026-11-19, read-only)

- **Raised ground** (`src/ground.js`, built for the Gorge): ground made of
  strips (a segment with a width, flat or sloping end to end), discs and
  ceilings. The cat walks freely on it; `canStep` blocks a step up or down of
  more than 0.12 m plus a grade allowance, so a raised edge stops the cat in
  both directions. A flat roof is a strip. A wall is simply the edge of a
  higher strip. The Gorge's clifftop is at 12 m.
- **Perches and hops** (`src/climbing.js`): fixed standing spots reached by a
  hop; climbing up at most 1.6 m a hop (2.2 with Spring Paws), reach 2.6 m to
  a high perch (3.2 with Sure Claws); dropping down from a perch is allowed,
  but only to the ground of the cat's own level: `bestPerch` skips any perch
  whose ground is more than 0.5 m from the ground under the cat, and a hop
  down lands straight below (`src/game/interactions.js`, `src/game/avatar.js`).
  **Nothing today moves the cat between two levels of raised ground except a
  sloping strip** (the Gorge joins its levels with slopes of at most 1 in 3,
  `src/world/gorgeshape.js`). Perch kinds include `roof`. The Neighborhood's house ridges and the
  Docks' parapets, fire-escape landings and catwalks are perches already.
- **Moving perches** carry a riding cat (the cow in `src/farmanimals.js`; the
  Fairground's rides in their own version, `src/fairlive.js` and
  `src/fairsim.js`).
- **No falling anywhere in the game.**
- **Solid things are circles** (`src/keepout.js`); raised ground does not need
  them for walls.
- **Dusk exists and is cheap**: lit windows, emissive glows, stars, a
  crescent moon; no real lamps. A dusk walk today is chosen on the Change place
  sheet and needs the Glow Collar (`src/ui/homebase.js` duskChoiceHtml).
- **Tall things fade** when they come between the camera and the cat.
- **Chasing is tag** (`src/critters.js`): a pounce "catches" a bird, which
  flies off and is never removed or hurt; birds today live at ground level and
  flee up into the sky.
- **Skills**: twelve earned abilities (`src/skills.js`), each with a feat that
  earns it (Sure Claws, Spring Paws, Fence Runner ...).
- **Two players**: a co-walker's height is not sent between devices; the
  network message's `pos` is exactly two numbers (x, z), and an older app
  rejects any other `pos`, so height must travel in a new field.

## The two new moves (shared machinery, usable in any area later)

### The balance walk

- A **crossing** is a narrow path placed as data: a plank between roofs, a
  gutter along an eave, a roof ridge, a washing line, a pipe. Each has two (or
  more) ends that join walkable ground or perches.
- Walking onto a crossing's end puts the cat on it. While on it she moves only
  along it: forward, back, stop, turn round. She cannot step off sideways and
  cannot fall. At either end she steps off onto the ground or perch there.
- She looks like she is balancing: lower body, tail out and swaying, careful
  paws, a small wobble now and then (cosmetic, never a fail).
- Speed: a careful walk. Zoomies do not run on a crossing.
- Touch: the stick's push along the crossing's direction moves her; a sideways
  push does nothing. Keyboard the same. No extra button.
- The camera eases round behind her along the crossing, gently.

### The leap

- A **gap** is placed as data: a take-off spot on one roof and a landing spot
  across a gap, up to about 3.5 m, the landing level or lower (never higher
  than the normal climb rule allows).
- A take-off spot is marked so a child can see it: a chipped brick lip, a
  plank stub, a bird waiting on the far side, a soft glow at dusk.
- At a take-off spot the jump button (or paw button) leaps: crouch, bottom
  wiggle, spring, a short slow-down at the top of the arc, land with a small
  bounce. **It always lands.** Away from a take-off spot the jump is the normal
  jump.
- At a gap too wide for her (see learning), she stops at the edge and looks
  across, ears up: the child can see there is somewhere to go and another way
  round. No fall, no failure.

### Changing level (new; the builder check found nothing does this today)

Raised ground's edges are walls both ways, and perches never move the cat to a
different level, so going up onto a roof and coming down from one are new
moves, placed as data in the same shared module as crossings and gaps.

- **Drop spots (owner's decision):** the cat hops down only at spots a child
  can see: a gutter end over a shed roof, a pile of soft bin bags, a low wall,
  a skylight frame. The jump button there hops her down to the landing spot
  below. Away from a drop spot a roof edge stays a wall.
- **Short drops, in steps (owner's decision):** at most about 3 m per hop.
  Coming down from the tall roofs is a chain of drops, and the fire escape
  (stairs as sloping ground, as the Gorge joins its levels) is the quick way
  down from the warehouse. No long falls.
- **Climb-ups:** the way up is the mirror: a short hop onto a higher level
  within the normal climb rule (1.6 m, 2.2 with Spring Paws) at a placed spot,
  or stairs and ramps. The builder designs these.
- **Never stuck (a test):** from every walkable roof there is a way down to
  the alley by drops, stairs and crossings, without Long Leap; and every
  golden mouse and discovery can be reached from the alley the same way.

### Learning (practice makes it better)

Both moves work from the first visit. With practice they get better, the way
Sure Claws does, through two new skills in the skills catalog (traversal
family):

- **Tightrope Tail**: earned by finishing 20 crossings. The balance walk gets
  quicker and steadier (less wobble).
- **Long Leap**: earned by 15 leaps. A few wider gaps (about 4.5 m) open: short
  cuts and one extra rooftop corner. Nothing important (golden mice, the six
  discoveries, the way to any roof) needs Long Leap.

## The place

Seen from above, north up, about the size of the Farm (~100 x 100 m walkable,
the builder sizes it). Always evening: the sky starts at sunset and deepens
into dusk over the walk.

- **South: the back alley** (spawn), lit by one lamp: bins, crates, a low
  shed, a drainpipe and a fire escape. The first climb is easy: bin, shed roof,
  low garage roofs (2-3 m).
- **Middle: a row of terraced houses** (6-8 m): flat-topped back extensions,
  pitched roofs with walkable ridges and gutters, chimneys, skylights, washing
  lines between back windows, planks left by roofers.
- **North: the tall building and the clock tower**: the flat roof of an old
  warehouse or shop block (~12 m) with a water tank and a pigeon loft, and the
  clock tower (~16-18 m) with a weathervane at the top: the landmark on the
  skyline, seen from the alley.
- **Around the edge:** the streets below are not walkable. Parapets, roofs
  that end in a wall, and the drop to the street (seen, never entered: lit
  street lamps, a passing bus's lights far below) close the area. The town's
  roofs carry on into the haze.
- **Getting down:** marked drop spots and the fire escape; see "Changing
  level" above. A child is never stuck high
  up.

Steep pitched roofs are not walkable faces (raised ground allows a walkable
slope of at most 1 in 3); the cat walks their ridges and gutters as crossings
and the flat roofs as ground.

## The birds

- **Pigeons and sparrows** perch on ridges, chimneys, aerials and gutters,
  and peck on flat roofs.
- **Chasing is tag, as everywhere**: get close and they flutter off to another
  roof nearby (a short flight, not up into the sky); a pounce "catches" one,
  it flaps away, small reward as for any catch. Never hurt, never removed.
- **They lead the way.** Their flights go along routes the cat can follow, and
  they like to wait at the far end of a plank or a gap's landing spot, so
  chasing them shows a child where the crossings are. On the first visit one
  pigeon in the alley leads up to the first plank.
- **The pigeon loft** (discovery B) is where they all go home.

## Things to discover (no prompt points at them; each a journal entry the first time)

- A. **A rooftop garden**: tomato plants in pots, a bench, a watering can.
- B. **The pigeon loft**, cooing; one pigeon follows the cat for a while.
- C. **The weathervane** at the top of the clock tower: the highest point; the
  whole town spread out below.
- D. **A skylight** looking down into a lamp-lit attic where someone reads a
  story (a hint of the house area to come).
- E. **A telescope** on a flat roof: the cat looks and the moon fills the
  screen.
- F. **A warm chimney** that puffs a smoke ring when the cat sits by it: a
  cosy place to nap.

## Light

Always evening. Lit windows (emissive, on a shared atlas), lamp glows in the
alley, string lights in the rooftop garden, the clock face lit, stars and the
moon. No real lights. **No Glow Collar needed**: the area has its own evening
sky. Walks here count as dusk walks (for Night Eyes) only when the Glow Collar
is on, as the rule is today.

## Everything else an area has

As the Farm and Fairground did: every per-area list a street area appears in
(catalog and `defaultState.walks` with old saves loading cleanly, `AREAS` in
`walk.js`, marks, clouds, ambient, pawprints, audio, gold mice, prop sets,
perches, pois for the existing quests and the race, the home card picture,
budgets, both word sets). The Farm's and Fairground's step reports list them.

## Claude's calls (change freely)

- Name "The Rooftops", id `roofs`.
- Unlock: 100 coins after 2 walks at the Fairground (the next step along the
  chain). The Fairground's home line names it.
- Not in `COLONY_AREAS`: no database change.
- Three golden mice, all reachable without Long Leap; totals rise by 3 in each
  edition.
- Skill numbers (20 crossings, 15 leaps, gap 3.5 m and 4.5 m) are first
  guesses for the builder to tune from play.
- **Two players**: send the cat's height in a new field of the network
  message (not a third number in `pos`, which old apps reject) so a partner
  sees her on the roof; every area gains. The builder confirms a mixed pair of
  old and new apps still sees each other.
- No yard dog, no strays, no clan cats up here.

## Build order

1. **The moves on their own**: crossings, gaps, drop spots and climb-ups as
   data, the balance walk, the leap, the drop, the camera, tests, on a small
   picture page (planks, a ridge, a washing line, three gaps, two levels joined
   by drops) with before/after pictures and a short recording.
   The owner approves the feel from the recording.
2. **The place**: alley, terraces, tall building, clock tower, walkable roofs,
   crossings and gaps placed, edge and street below, evening light, lists,
   unlock, tests, card picture.
3. **The birds**: perching at height, short flights between roofs, leading
   routes, tag.
4. **Discoveries, the two skills, golden mice, two-player height, dusk
   polish.**

Each step ends with the full suite green and pictures for the owner. Merge and
push need his yes.

## Constraints

- Performance: aim for the street areas' ceiling (450 meshes / 380 casters /
  70,000 triangles, `test/budget.test.js`); facades share geometry and one
  window atlas; few shadow casters at dusk. Older iPads matter most; the owner
  reads the frame rate on his iPhone.
- Reuse: raised ground from `src/ground.js` for roofs; the critter tag rules
  for birds. Changing level between roofs is new (see "Changing level").
  Crossings and gaps get one shared module, not Rooftops-only code, so another
  area can place them later.
- Deterministic for two players: crossings, gaps and birds' routes are data or
  seeded; bird flights may be per device as birds are today.
- Text for a 9-year-old; any new label goes through the word tables for both
  word sets; no series words in string literals outside the word tables.
- Offline-first: nothing here contacts the database.

## Goals

- A child gets onto the first roof within the first minute, following a bird.
- Every crossing and every leap is fun to do again, and none can go wrong.
- The view from the clock tower at dusk is the picture they want to show.

## Non-goals

- Crossings and gaps in other areas (later, once the feel is approved).
- Inside the houses (the house area comes after).
- Weather on the roofs, rain or wind making things slippery.
- Timed challenges or scores.

## Anti-goals

- Falling, failing, or being stuck high up; a drop that looks like a fall.
- A leap that misses, a crossing that tips the cat off.
- Anything frightening at height: no dizzy camera, no looking straight down a
  drop, nothing that chases the cat.
- A dark area: evening, never black; the alley lamp and windows always light
  the way.
- Needing the Glow Collar to visit.
