# Whisker Walk — Design Spec

**Date:** 2026-07-31
**Status:** Approved by user

## Overview

Whisker Walk is a first-person, browser-based cat-walking game. The player holds a
leash and strolls through cozy low-poly environments while their cat — which has a
mind of its own — trots, sniffs, chases, and naps at the other end. Walks earn
**whisker points** from discoveries, which unlock new cat breeds, accessories, and
areas.

Core pillars, in priority order:

1. **Chill exploration** — no fail states, no timers; wandering is the game.
2. **Cat personality** — the cat is an autonomous companion, not a follower drone.
3. **Light progression** — discovery currency gives a reason to keep walking.

## Player experience

- First-person camera, WASD movement + mouse look (Pointer Lock API; click canvas
  to capture the mouse, Esc to release).
- The leash is a visible, physical rope from the player's hand to the cat. When the
  cat bolts or lags, the player feels it as a pull on their movement.
- Interactions: `E` to pet the cat when prompted, `E` to pick up found items.
- HUD: whisker point total, current-area name, discovery toasts, pet prompt.
- Home-base screen (HTML overlay, not 3D): choose cat, choose accessories, choose
  area, see unlock shop, start walk.

## Cats

Six breeds. Each is procedurally built from Three.js primitives (no external
assets), flat-shaded, with simple procedural animations (leg swing walk cycle,
sit, curl-up nap, tail sway, head turn).

| Breed | Personality | Gameplay effect |
|---|---|---|
| Tabby (starter) | Curious | Investigates points of interest; reveals hidden items at longer range |
| Siamese | Hyper | +40% walk speed; chases every bird; strongest leash pulls |
| Persian | Lazy | Slow; naps mid-walk; naps trigger bonus petting moments (extra points) |
| Black cat | Brave | Ignores scare-events (dogs, loud noises) that make other cats freeze/flee |
| Calico | Playful | Pounces butterflies/leaves; each pounce awards bonus points |
| Maine Coon | Steady | Calm; no negative reactions to puddles or scare-events' noise; gentle leash feel |

Personality = a per-breed config object: state-transition weights, walk speed,
leash pull strength, plus at most one special hook (e.g. Calico pounce bonus).
No general stat system (deep-stats approach was considered and rejected — YAGNI).

## Cat AI

A finite state machine ticked each frame:

- **Follow** — default; stays near a target point offset ahead of the player.
- **Sniff** — pauses at a nearby point of interest for a few seconds.
- **Distracted** — locks onto a critter (bird/butterfly/squirrel) and chases until
  it despawns or leash tension exceeds a threshold.
- **Nap** — curls up in place; ended by time or by petting.
- **RequestPet** — stops, looks at player, shows pet prompt; petting awards points.

Transition probabilities and durations come from the breed's personality config.
The leash imposes a hard distance cap: at max length, cat states that move away
from the player are interrupted and the cat is pulled back toward Follow.

## Leash

A spring-damper rope rendered as a line of segments (verlet chain for visual sag).
Mechanics: when taut, it applies (a) a drag on player movement speed and (b) a
recall force on the cat. No tangling/wrapping around obstacles in v1.

## Accessories

Two equip slots: **collar** and **outfit**. Each item has one small perk.

| Item | Slot | Perk |
|---|---|---|
| Bell collar | collar | Birds spawn closer / are attracted rather than fleeing early |
| Glow collar | collar | Unlocks dusk mode for any walk (firefly discoveries) |
| Bandana | outfit | NPC villagers wave; each wave awards points |
| Rain booties | outfit | Puddle crossings become bonus discoveries instead of cat-balk moments |
| Tiny backpack | outfit | Can carry one extra collectible per walk |
| Flower crown | outfit | Butterflies trail the cat (Calico synergy) |

## World & areas

Three areas, unlocked in order with whisker points. All geometry is procedurally
generated low-poly (flat-shaded `MeshLambertMaterial`-style, warm palette,
gradient sky). Each area is a hand-tuned layout generated from a seeded builder
function — same layout every visit, so discoveries feel like real places.

1. **Cozy Neighborhood** (start) — street grid, houses with gardens, mailboxes,
   parked cars, small playground. Critters: songbirds, squirrels, fenced dog
   (scare-event). Hidden collectibles: yarn balls.
2. **City Park** — winding paths, pond with ducks, large trees, benches, fountain.
   Higher critter density. Hidden collectibles: feathers.
3. **Seaside** — boardwalk, beach, cliffside path, fishing boats. Critters:
   seagulls, crabs. Hidden collectibles: little fish. Ambient wave audio.

## Discoveries & points

Discovery types, all proximity- or interaction-triggered, each firing a HUD toast
plus a whisker point award:

- **Critter spotting** — get within range of a bird/squirrel/etc. with line of sight.
- **Hidden collectibles** — small items tucked behind/under scenery; `E` to collect.
- **Petting moments** — respond to RequestPet (or a Persian nap) with `E`.
- **Scenic spots** — marked viewpoints (e.g. cliff overlook) award once per walk.
- **Little moments** — scripted ambient events (squirrel raids a bird feeder) that
  award if witnessed.

Repeatable discoveries award reduced points after first find per walk to keep
grinding gentle. Point values tuned so the second cat unlocks after ~2–3 walks.

## Progression & saving

- Single currency: whisker points. Spend in the home-base shop to unlock cats,
  accessories, and areas (areas also gate: Park requires Neighborhood walks, etc.).
- Save data (points, unlocks, equipped loadout, collectible tallies) persists to
  `localStorage` as one versioned JSON blob. Corrupt/missing save → fresh start
  with a console warning, never a crash.

## Technical architecture

- **Stack:** Vite + Three.js, vanilla ES modules, no framework, no backend.
- **UI:** HTML/CSS overlays for home base, HUD, toasts; the 3D canvas underneath.
- **Audio:** a handful of small synthesized/simple sounds (meow, bell, ambient loop
  per area) via WebAudio; kept minimal.

Module layout (one system per file/folder):

```
src/
  main.js            // bootstrap, game loop, state (home base vs walking)
  player.js          // first-person controller, pointer lock, collision
  cat/
    model.js         // procedural cat mesh builder (per-breed params)
    animator.js      // walk cycle, sit, nap, tail/head procedural animation
    brain.js         // FSM + personality configs
  leash.js           // spring/verlet rope physics + rendering
  world/
    builder.js       // shared low-poly prop builders (house, tree, bench...)
    neighborhood.js  // area layout
    park.js
    seaside.js
  critters.js        // birds/squirrels/etc: spawn, flee/idle behavior
  discoveries.js     // POI registry, proximity checks, point awards
  progression.js     // whisker points, unlock rules, localStorage save
  ui/
    hud.js           // points, toasts, prompts
    homebase.js      // cat/accessory/area selection + shop
  audio.js
```

Data flow: `main.js` owns the loop and passes a shared `GameState` to systems.
Systems communicate through a tiny event emitter (e.g. `discovery:found`,
`cat:requestPet`) rather than direct cross-imports, so each is testable alone.

## Error handling

- Pointer-lock denial or exit → pause overlay ("click to resume").
- WebGL unavailable → friendly message instead of a blank page.
- Save-load failures → reset to defaults with warning; write-failures are non-fatal.

## Testing

- **Unit tests (Vitest)** for pure logic: progression/unlock rules, save
  serialization + corrupt-save recovery, FSM transition selection given a seeded
  RNG, discovery point awards.
- **Manual playtesting** for feel: leash physics, cat animation, world layout,
  performance (target 60fps on a typical laptop).
- Rendering/Three.js code is exercised manually, not unit-tested.

## Out of scope for v1

Multiplayer, mobile/touch controls, full day-night cycle (beyond glow-collar dusk
mode), weather system, leash tangling around obstacles, downloadable 3D assets,
backend/cloud saves. The user's GCP instance may host the built game later; the
build is fully static, so deployment is trivial when wanted.
