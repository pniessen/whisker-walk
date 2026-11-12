# The Gorge: design

*2026-11-01. The last Clan Edition territory, home of CliffClan. Described by
the owner from the older playtester's picture ("wandering in mountains,
caves, shadows"), answered in chat. Builds on the editions spec
(docs/superpowers/specs/2026-10-31-editions-and-territories-design.md:
owner decisions 4 and 10, §3 "Territories", the Gorge rows) and every
territory built since (the Woods, the River and Marshes, the Moor, the Pines
and Swamp with its island).*

## Why

Four of five territories are built. The Gorge was held back on purpose
(editions spec, decision 4): it is "the place where climbing and height
matter most" (decision 10), and the game could not do height. Today the
ground is flat everywhere; the only height is **perches**, props a cat hops
up onto (src/player.js `perchY`, the perch-chain rule in
src/game/interactions.js). The territory map already shows the Gorge as
"unexplored" (src/territories.js, status `later`), the Moor has a border post
saying "The Gorge: not explored yet", and CliffClan is the fifth clan in the
pick-your-clan list.

Success: a kid walks into a deep, shaded gorge, peeks into dens in the rock
walls, walks into a dark cave and finds a golden mouse or a cat living
there, then climbs a winding path up the cliffside and looks down over the
whole gorge from the top, with birds wheeling and maybe a mountain goat.
CliffClan lives on the ledges and in the caves.

## What the owner decided

1. **Feel:** mountains, caves and shadows. Rocks, dens dug into the cliff
   walls, tall pines (decision 10).
2. **Caves: a mixture of deep and shallow.**
   - Shallow dens in the cliff walls to peek into.
   - A few deep caves to walk into, where it gets dark.
   - Deep inside there is something to find: a prize (a golden mouse or
     treasure) or another cat.
3. **Climbing as well as the floor.** The cat can explore the gorge floor
   with the cliffs towering above, and climb.
4. **Climbing is a winding path up the cliff/hill side** (not ledge-to-ledge
   hopping as the main way up).
5. **At the top:** a view, some birds, maybe a goat, a prize, or another cat.
6. **CliffClan lives on ledges and in caves.**
7. **Edges stop her:** a cat can't jump or fall off the path or a ledge.
8. From the editions spec: the Gorge nearly touches Twolegplace; the north
   path runs past its west side; it is CliffClan's home (the owner named it
   CliffClan, 2026-10-31).
9. **CliffClan's neighbour is the Moor (GaleClan)** (owner, 2026-11-01).
   `HOMES.gorge` in src/clanhomes.js gains the Moor, and the Moor's row gains
   the Gorge; the Moor then gets a CliffClan intruder route and its patrol
   order is re-checked. This knowingly changes the Moor's patrols a little on
   existing saves (the one exception to "nothing changes elsewhere").
10. **The Gorge opens after 2 walks in the Moor** (owner), reached through
    the Moor's existing border post (today "The Gorge: not explored yet").
    No new post from Twolegplace; the Neighborhood is unchanged.
11. **Map first, camp later** (owner): the Gorge opens to the kids before
    CliffClan's camp is built, with CliffClan staying "territory coming soon"
    in the clan picker until the camp lands — the way the other four
    territories went.

## Claude's calls (flagged; the builder may push back with a reason)

### Height: the new engine piece

- **Walkable ground height, for the Gorge only.** The game gains a ground
  height function per area: `groundY(x, z)`, 0 everywhere on every existing
  map (so nothing else changes and no test or golden moves), and a real
  height field in the Gorge. Everything that stands on the ground uses it:
  the player and co-walkers, strays and clan cats, critters, the camera and
  its collision, shadows/contact shadows, paw prints, golden mice and finds,
  race rings, the yarn ball and toys, marks, and the fight placement. The
  builder decides how (a small heightmap, or ramps defined as shapes); the
  Gorge's cliff walls are colliders, not slopes.
- **Perches still work on top of ground height** (a perch's height is
  measured from the ground under it).
- **Edges stop her (owner):** every path and ledge edge with a drop is a
  low invisible wall (or a visible low rock lip where it reads well). No
  falling, no jumping down, no pounce or zoomies off an edge; a pounce that
  would land past an edge lands short. Climbing *down* is by the same path.
- **Slopes:** the winding path rises gently (Claude's guess: no steeper than
  about 1 in 3), with the cat's body tilting slightly to the slope and its
  speed a little slower uphill. Steps are not needed.
- **Determinism and co-walks:** heights come from the map data only (no rng),
  so both co-walkers' cats stand at the same height. Remote cats are drawn at
  `groundY` under their streamed position.

### The map

- **Size and place:** a territory map like the others (the territories are
  ~100 m squares with matched edges and horizons, editions spec §3), on the
  east side of the world map, nearly touching Twolegplace, with the north
  path running past its west side. The floor is a long gorge running roughly
  north–south, with a stream (Claude's guess: a thin stream down the floor,
  wadeable, with stepping stones), walls rising steeply on both sides, and
  one side climbable by the winding path.
- **The winding path:** switchbacks up the climbable wall, with **stops on
  the way** (Claude's guess): a lookout ledge partway up, a cave mouth
  halfway, and CliffClan's camp ledges. It ends on a **clifftop** with a
  view down the whole gorge — a natural photo spot and a race finish.
- **The top:** open rock and tall pines, with circling birds (a few ambient
  birds overhead, no new mesh-heavy flock), sometimes a **mountain goat**
  (a new critter that stands on high rocks and bounds away when the cat gets
  close, like the Moor's rabbit only bolting), and a prize or a cat (a golden
  mouse spot, a loner or a clan cat).
- **Shadows** (builder-check fix): there is no sun clock — the sun is fixed
  (`SUN_POSITION` in src/render/rig.js); time of day is only the per-walk
  dusk option and the sunset weather. So the gorge floor is **always in
  shade** (cooler, darker light), and the clifftop is bright and warm. A
  moving sun is out of scope (it would change every map).

### Caves

- **Shallow dens:** a handful of open alcoves in the walls at floor level and
  on ledges; the cat can walk in a body-length or two, sit and nap there.
  They are natural spots for golden mice, finds and clan cats.
- **Deep caves (2 or 3):** a tunnel into the rock that bends so the
  entrance light drops away, then a small chamber. It gets darker the deeper
  she goes, with **a soft glow around the player's cat** so the player always sees their way
  (Claude's call: never pitch black, never scary). Inside: a prize (golden
  mouse or treasure) or a cat (a loner, a CliffClan elder, or a kittypet who
  got lost — the builder picks per cave).
- **The camera in a cave** pulls in close and low, never through the rock.
  This is new engine work (builder-check fix): today the game has no camera
  collision at the normal zoom (src/camzoom.js), pulls in only beyond the
  default distance for circles of r ≥ 1.9, has no ceiling, and a fixed camera
  floor (`MIN_CAMERA_Y` 0.5). The height engine adds rock and ceiling
  avoidance for the Gorge (walls and caves). No
  minimap change inside; the corner map shows cave mouths.
- **Budget:** a cave's inside is a few merged meshes, and only the cave the
  cat is in (or near) needs its interior drawn.

### CliffClan

- **The camp is on ledges and in caves (owner).** Today a camp is one flat
  disc (`DISCS` in src/rivalclans.js, campLayout's den, leader's rock and
  fixed seats; trespass = inside the disc). Claude's call: CliffClan's camp
  is **one wide ledge partway up the path, with a cave den opening off its
  back wall** (the nursery and elders inside the den, the leader on a rock at
  the ledge's lip looking out, warriors and apprentices on the ledge). That
  fits the disc model with a Gorge variant of the layout, without a camp
  spread over several ledges.
- Everything clan life already does applies: the cast with names and ranks
  (src/clancast.js), the camp marker on both maps, touch noses / boop /
  patrol together, intruders from neighbouring clans and fights, a
  neighbour patrol, rival camps, pick-your-clan's "territory coming soon"
  note switching off, the border post on the Moor opening, and posts back to
  the Moor and Twolegplace.
- **CliffClan's neighbour is the Moor** (owner): GaleClan intruders come into
  the Gorge, CliffClan intruders go into the Moor, and the neighbour patrol
  at home follows the existing rules.
- **Fights only on the floor and wide ledges** where the fight camera can
  frame both cats, never on the narrow path or in a cave.
- **Clan colours** for CliffClan's cats and camp mark are picked to read
  well on the Gorge's rock colours.

### Everything else a territory has

Golden mice (the Gorge's own set, some in caves and up top), points of
interest and the daily race (builder-check fix: today's race shuffles five
random points in random order, src/race.js, which in the Gorge would send
kids up and down the path; so the Gorge gets a **fixed-order climb race**,
rings up the path to a clifftop finish, as a new race kind), weather, the colony (feeding, a legendary cat later), sounds
(Claude's guess: wind higher up, dripping water in caves, a stream on the
floor, the odd bird cry and goat bleat), a `places/gorge.jpg` card, the
unlock rule (owner: 2 walks in the Moor), Legacy not walking it (as the
other territories).

### Builder-check rulings (Claude's calls)

- **One walkable height per spot.** Colliders are flat circles with no
  height, and `groundY(x, z)` holds one height per spot, so nothing walkable
  sits above anything else walkable: caves go *into* rock with nothing
  walkable on top of them, and ledges never overhang a den. (Height-banded
  colliders and layered ground would roughly double the engine work; not
  needed for this layout.)
- **No dropping down where there is ground height.** Today a cat can drop
  from any perch to a lower perch or the ground from any distance
  (climbing.js, interactions). Wherever `groundY` is non-zero, drops are
  limited to perch-sized hops onto the ground right below, never off a path
  edge or the clifftop (owner decision 7).
- **Perch and golden-mouse heights become relative to the ground under
  them** (today `perch.y` and `mo.y` are absolute, and `player.perchY === 0`
  means "on the ground" in about six places); with `groundY` 0 elsewhere,
  nothing changes on other maps.
- **The horizon:** `horizonBand` is painted for an eye near the ground; from
  the clifftop the camera sees over it, so the Gorge has high rock rims all
  round (and/or its own taller horizon) so the view never shows past the
  map's edge.
- **The co-walk:** remote cats stand at `groundY` under their streamed
  position; both devices read the same map data.

### How it is split (four plans, in order)

1. **The ground-height engine**, its own plan and branch, invisible when
   merged: `groundY` 0 everywhere today, proven with a test-only height
   fixture and "nothing changed elsewhere" tests (goldens, budgets, every
   map). It covers the ~15 systems that stand on the ground (player and
   avatar, perches, golden mice, knockables, strays, clan cats, critters,
   intruders, rival cats, remote cats, paw prints, contact shadows, race
   rings, marks, toys and carryables, fight placement and fight camera),
   edge walls, slope tilt and speed, and rock/ceiling camera avoidance.
2. **The Gorge map:** floor and stream, the switchback path and its stops,
   the clifftop and its rims, border posts (the Moor's opens; posts back),
   the unlock, minimap, budget, the look-down check, golden mice, the climb
   race, sounds, the goat, `places/gorge.jpg`.
3. **The caves:** shallow dens and the deep caves with darkness, the glow
   around the cat, the camera inside, contents, and drawing only the cave
   the cat is in or near (may fold into plan 2 if it stays small).
4. **CliffClan:** the ledge-and-cave camp, cast and colours, the Moor as
   neighbour (both directions, routes, patrols), clan life, and switching off
   "coming soon".

## Constraints

- **Nothing changes elsewhere:** `groundY` is 0 on every other map, so their
  tests, goldens and behaviour stay exactly as they are.
- **Budget:** 60 fps on the iPhone 18 (HIGH) on the floor, in a cave and at
  the top looking down; held to the Cozy Neighborhood's mesh and caster
  budget like every territory (test/budget.test.js). Looking down from the
  top shows the whole gorge, which is the worst case for draws.
- **No save change beyond what territories already add** (SAVE_VERSION 4).
- **Determinism:** no new draws on walkRng or strayStream except where a
  territory's plan already allows them; co-walkers agree.
- **Our own words:** no Warrior Cats canon names; generic place words are
  fine (decision 3). Named spots (the lookout, the clifftop, caves) get
  plain or newly made names, checked against the banned list.
- **Kid-safe:** nothing frightening in caves; no falling; no dead ends that
  trap a cat (every cave and ledge path leads back).

## Goals

- The first map with real height: a winding climb and a view from the top.
- Caves that are fun to explore and always reward the walk in.
- CliffClan has a home that looks like the books' idea of a cliff clan
  without copying them.

## Non-goals

- No falling, jumping down, climbing walls freely or rope/ladder mechanics.
- No height on any other map (yet).
- No underground maze; caves are short and bend once or twice.

## Anti-goals

- A cave that feels scary or a dark spot a young player can't see through.
- A cat getting stuck, clipping into rock, or floating above a slope.
- The phone slowing down when looking down from the top.

## Left to the builder

- How ground height is represented and how each system reads it.
- The exact layout, path route, cave count and contents, and goat behaviour.
- Lighting values for shade, caves and the clifftop.
- Names for the spots, sounds, race course and golden-mouse places.
