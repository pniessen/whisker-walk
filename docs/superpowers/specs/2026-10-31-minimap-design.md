# Whisker Walk — corner map (design)

2026-10-31. Owner's idea, shaped with him in chat; mockups at
https://claude.ai/artifact/4AneAJNHCzqF7tHZr4n7ZH (private to the owner).

## Why

The game camera shows the cat's surroundings up close but never the whole
area. That makes the zoomies challenge (race.js: five rings at the area's POIs)
hard: the HUD says "Race: ring 2/5" and nothing says which way ring 2 is. A
small always-on map gives the missing "where am I in this place" picture.

The players are a girl of 11 and a boy of 9. Success: a kid glances at the
corner, sees the next ring, and heads for it.

## Goals

- A small round map, always on, in a corner of the walk screen.
- Two modes, chosen per player:
  - **North up** (owner's pick): the map holds still, the cat's arrow turns.
  - **Turns with the cat** (his daughter's pick): the cat always points up,
    the map rotates around it.
- Shows: the area's simple shape, the player's cat, zoomies rings, the active
  quest target, and scenic spots.
- Costs nothing on the iPhone's 3D budget.

## Non-goals

- No full-screen or pull-up map; it lives in the corner only.
- No route lines or turn-by-turn directions.
- No fog of war or "explored" shading.
- No map in the den (a single room).

## Anti-goals (a failure even if it works)

- **Spoiling hidden finds.** Golden mice, secrets, gifts, collectibles,
  carryables, critters and strays never appear. Finding them is the game.
- **Covering the cat or the controls**, on phone or desktop, in either
  handedness.
- **Adding 3D draw calls.** The map is 2D page UI, never part of the
  Three.js scene.
- **Nagging.** Nothing blinks or pulses for attention except the one next
  ring during a race.

## What the map shows

| Thing | How | When |
|---|---|---|
| The area | Ground tone, paths, water, building/large-prop footprints, the walkable edge | Always |
| Your cat | Dot with a nose showing heading | Always |
| Next zoomies ring | Bright ring marker with its number | During a race |
| The ring after | Same marker, dimmed | During a race |
| Race start pad | Small flat-ring marker | Race available, not yet started *(builder's call whether this helps or clutters)* |
| Quest target | One marker | Only while a quest is **accepted** (quests.js state `active`); gone when complete. Offered-but-not-accepted quests don't show |
| Scenic spots | Small star per entry in the area's `scenics` | Always; **hollow until visited this walk, filled after** |
| Co-walkers' cats | Small dot, no nose, coloured from that cat's coat (breed) | In a co-walk *(my call; the game has no per-player colour today, and nothing new goes on the wire)* |

"Visited this walk" means whatever the walk already counts as a scenic visit
(interactions.js / the scenic discovery award); the builder should reuse that
signal, not invent a new radius.

## Modes and the switch

- **Tap the map** to flip between the two modes. A small badge on the rim shows
  the current mode: an "N" in north-up, an arrow in turning mode.
- The same choice also appears in Settings, labelled in plain words
  ("Map: north up / turns with me"), for anyone who doesn't find the tap.
- The choice is remembered **with the player's save** (progression.js state),
  not device settings, so it follows the kid through cloud sync. Add it as an
  additive field, sanitised on load, defaulting to north-up; SAVE_VERSION stays 4
  like every other additive field. The two kids play on separate devices, so
  one save per device is one save per kid and each keeps their own mode.
- The tap must not start a camera drag or reach the joystick. #hud is
  `pointer-events: none`; only the map element opts back in.

## Scale and framing *(my call)*

- The map is **centred on the cat** in both modes and shows a fixed radius
  around it, sized so most of an area fits (about 35 m; builder tunes per
  area so the biggest area still reads).
- Anything that matters but lies outside the circle (a ring, the quest target,
  a scenic star) is drawn **pinned to the rim**, at the bearing it lies in,
  so the next ring is never invisible.
- Turning mode rotates by the camera's heading (what the player sees as
  "forward"), not the cat body's, so "up on the map" always means "ahead on
  screen". Builder checks catcam.js for the right yaw.

## Look

- Coin-sized: about 110 px across on a phone, about 150 px on desktop.
- A soft cream disc with a thin dark rim, in the HUD's existing pill style
  (rgba dark backgrounds, rounded), so it belongs with the points and area
  pills.
- Each area gets its own ground tone from data it already has
  (`groundBounce` or the ground colour), so the Seaside map reads sandy and
  the Park green.
- The cat is the strongest mark on the map; rings use the race's gold.
- Corner: **top-right**, and the HUD around it moves *(my call — every corner
  is already in use)*:
  - the area-name pill (`.hud-area`) becomes a small caption under the map;
  - the co-walk roster (`.hud-roster`, today at top 64px / right 16px) moves
    down to sit below the map and its caption;
  - in left-handed mode the pause button (`body.left-handed .tui-pause`, which
    takes that same top-right spot) sits immediately left of the map instead.
  - Top-left (points, goals, right-handed pause), top-centre (quest objective)
    and the bottom corners (joystick, action buttons) stay as they are.
  - The `?perf` readout is a developer overlay and doesn't count.
- Hidden while the photo viewfinder is up, while paused, and on the summary.

## How it is built

- **2D canvas in the HUD**, drawn by a new module (e.g. `src/ui/minimap.js`)
  with the HUD's `{ update, dispose }` shape.
- **The static layer** (ground, paths, water, footprints, edge) is drawn **once
  per walk** into an offscreen canvas from data the world already provides:
  `areaData.bounds`, `areaData.waters`, path strips (grass.js's
  `flatFootprints(scene)` already reads these off the scene), and building
  footprints (from colliders and/or box meshes, read **before** the prop merge
  if needed). No hand-drawn per-area art.
- **Per frame**, only the transform and the handful of markers change. Redraw
  at most ~30 times a second and only when something moved, so it is cheap on
  the phone's CPU.
- Ring positions come from the live race controller (race.js), the quest from
  the walk's quest object, scenics from `areaData.scenics`, co-walkers from
  remotecats.js.
- Purely local: no wire events, never `walkRng`.

## Reduced motion

Honour the player's explicit choice: a kid who picked "turns with me" keeps
it. *(My call; the owner may prefer forcing north-up under reduced motion.)*

## Testing

- Pure helpers unit-tested: world→map transform in both modes, rim pinning
  and bearing, which markers show in which state (race idle, running, done;
  quest offered, active, complete; scenic visited or not), the save field's
  sanitising and default.
- A test that hidden things (golden mice, secrets, collectibles) are never
  passed to or drawn by the map.
- Seen in the real game on desktop and at phone size, in all four outdoor areas, both
  modes, both handednesses; a race run end to end with the map.

## Left to the builder

Exact pixel sizes, colours, marker shapes, the per-area radius, how building
footprints are extracted, redraw throttling, and the Settings row's exact
placement. All within the anti-goals above.
