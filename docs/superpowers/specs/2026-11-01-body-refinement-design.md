# Body refinement: ruff, legs and feet, and Hagrid: design

*2026-11-01. From the 11-year-old playtester ("the bodies need more work —
much better than before, but let's keep refining to make them more
realistic") and the owner's notes on screenshots. Approved by the owner on a
3D sketch, iterated five times in chat:
https://claude.ai/artifact/GP7iqKND4yw3Ay5NFQfy8D. The sketch's source is kept
next to this file as `2026-11-01-body-refinement-sketch.html` (open it with
`?show=ruff|legs|hagrid&yaw=1.6` for a still side view); its shapes and
numbers are the reference for the look.*

## Why

The Version 2 cat body (merged 2026-10-31, src/cat/model.js, src/cat/torso.js)
was a big step, but up close three things still read as a toy:

1. **The fluffy cat's ruff** is a plain torus (`undersideGeometry`,
   model.js ~line 724) in the belly colour. On a dark coat with a white chest
   it reads as a life preserver round the neck.
2. **Legs** are a straight cylinder per leg (`limbGeometry`, model.js ~257;
   the hind leg merges a sphere thigh) ending in a separate flattened-ball paw
   (`shapedBall`). The joins show, the front legs have no shoulder, the paws
   are slabs with no toes, and the back legs looked like sticks.
3. **Hagrid** (`buildChicken`, model.js ~468): his head floats above his body
   with no neck, his tail is three discs, his wings are round patches, his
   comb is three separate balls with one blob of a wattle, and his feet are
   flat triangles on straight sticks.

## What the owner decided (on the sketch)

### The ruff (fluffy cats)

- **Small.** A modest white bib tucked under the chin and close to the chest,
  a little fluff behind the jaw blending coat colour into the bib, and a short
  fringe of soft points along the bib's lower edge.
- Two earlier, bigger versions were rejected: tufts all round the neck
  ("sausages"), and a large bib with coat-coloured cheek puffs ("makes the
  chest look gigantic"). Nothing round the back of the neck.
- In the sketch: bib radius 0.1 scaled (1.05, 1.05, 0.55); jaw fluff 0.055
  scaled (0.6, 1.0, 0.8), 35% from coat to white; five fringe points (cone
  r 0.026, length 0.07).

### Legs and feet (every cat)

- **Each leg is one smooth piece** that tapers from shoulder or thigh to the
  paw, with **no visible seam at any joint** ("too blocky" was the first
  try's verdict). The sketch builds it as a tube along a smooth curve with a
  radius per control point.
- **Front legs** grow out of the shoulder, bend very slightly back at the
  elbow and taper to a slim wrist. Sketch: points (0, 0.05, 0.03) →
  (0, −0.08, 0) → (0, −0.19, −0.015) → (0, −0.30, −0.01) → (0, −0.335, −0.02),
  radii 0.085, 0.062, 0.046, 0.038, 0.036.
- **Back legs** have a real thigh that grows out of the hip and tapers
  smoothly: knee forward, hock back, then a **slim ankle (no "cankles")**.
  **One** smooth bulge only — a separate haunch ball made a "double bulge"
  and was rejected — and not too thick ("a little skinnier"); not too thin
  either ("skinny and prosthetic" was rejected). Final sketch: points
  (0, 0.04, 0.01) → (0, −0.09, −0.025) → (0, −0.2, 0.05) → (0, −0.27, 0.062)
  → (0, −0.335, 0.035), radii 0.10, 0.092, 0.062, 0.043, 0.036.
- **Colour** blends along the leg from the coat at the top into the sock or
  leg colour lower down (sketch: white from about halfway on the back leg,
  a fifth of the way on the front), so the thigh reads as part of the body.
- **Feet:** one rounded foot per leg, a soft oval with a flat sole and a low
  rounded top, **four toes scalloped into its front edge**, and **small claws
  just showing** at the toe tips. A smooth ankle where the leg meets the
  foot.

### Hagrid ("new chicken looks great")

- **A neck** with neck (hackle) feathers joining his head to his body.
- **Body:** a full breast low at the front, the back rising toward the tail.
- **Wings** folded along his sides, longer than tall, tapering to a few
  feather tips at the back (not round patches).
- **Tail:** a fan of seven long curved feathers, the middle ones longest,
  dark with a faint green sheen.
- **Comb:** one joined crest with rounded points. **Wattles:** two hanging
  under the beak. **Beak:** slightly hooked, upper and lower.
- **Legs and feet:** feathery thighs, scaly yellow shanks, and clawed feet
  with three toes forward and one back.

## Claude's calls (flagged; the builder may push back with a reason)

- **Every cat gets it**: ready-made cats, Robbie, D2, Digit, the cat
  builder's custom cats, strays, clan cats, intruders and kittypets. Fluffy
  cats get the new ruff; short-haired cats have none, as today.
- **Mesh count stays the same per cat** (the 31 full / 25 simple caps in
  test/catmodel.test.js and test/catcustom.test.js, plus the fight build's
  +1 for a scarred cat). Each leg stays **one limb mesh + one paw mesh**:
  toes and claws are part of the paw's geometry (claws as vertex colour or a
  merged sliver), never extra meshes. The ruff stays inside the merged
  underside geometry.
- **Triangles:** the smooth limbs and scalloped paws must fit the existing
  per-cat triangle ceilings (8000 full / 5500 simple, per the cat-builder
  plan's tests). The `simple` build (strays, clan cats, intruders) uses fewer
  rings and sides so the iPhone 18 still holds 60 fps at a busy clan camp.
- **The paw contract stays:** `leg.userData.paw` remains a separate mesh at
  `PAW_Y` with the sole where it is today, because the feet accessories
  (boots and the like) write `paw.scale` and the `shapedBall` comment in
  model.js explains why. The new paw shape lives in its geometry, as today.
  Boots and other feet items must still sit right on the new paw.
- **Animation:** legs stay hip-pivoted groups (walk, trot, sit, pounce, swim
  paddle, the fight actions). The knee and hock bends are baked into the
  shape. Sit and lie-down poses must not push a paw or knee through the body
  or the ground; the builder checks every pose in the animator.
- **Markings and accessories stay placed**: socks, points, D2's shoulder band,
  Robbie's white flanks and bib, the calico's patches, collars and neck items
  (which sit at `NECK_FORWARD`; on fluffy cats today they drop onto the front
  of the ruff via `NECK_FLUFFY` — retune for the smaller ruff).
- **Hagrid's rig stays compatible**: `legs[0]`/`legs[1]` are his real legs
  and `legs[2]`/`legs[3]` hidden dummies; the comb stands in for the ears;
  his head/face/neck accessories still fit (re-place them for the new head
  and neck). Fight and swim behaviour for him is unchanged.
- **The goldens change on purpose, once.** test/fixtures/catgolden.json and
  test/fixtures/hagrid-golden.json pin every cat's and Hagrid's exact
  geometry and have been frozen. This build is the one deliberate exception:
  the builder regenerates them in a single commit **after** the owner signs
  off by screenshot (before/after of each ready-made cat, a custom cat, a
  stray, a clan cat and Hagrid, in the game's own lighting). The write-once
  rule then applies again to the new files.

## Constraints

- **Budget:** 60 fps on the iPhone 18 at the Seaside, a clan camp and a fight;
  mesh caps unchanged (see above).
- **No save change:** SAVE_VERSION stays 4; nothing new is stored or sent.
- **Determinism:** no new rng draws; co-walkers' cats still build the same.
- **Order:** this lands **after** the fight moves and scars build (branch
  `fight-design`, in progress), which hangs scars on the head and torso and
  adds fight poses; the body build rebases on it and keeps scars sitting on
  the new surfaces.

## Goals

- Up close, cats and Hagrid read as animals, not toys: no visible seams, no
  floating parts, real feet.
- The playtester's notes are each visibly fixed: no life preserver, no blocky
  legs, no cankles, toes and claws, a chicken with a neck, a real tail,
  feathered wings, a proper comb and wattles, chicken feet.

## Non-goals

- No fur rendering, textures or new materials.
- No change to heads, faces, eyes or tails of cats (they were approved in the
  Version 2 body).
- No new animations beyond keeping the existing ones correct on the new
  shapes.

## Anti-goals

- A cat that looks heavier, stockier or "pumped up" than today (the ruff and
  thigh iterations both overshot once).
- Feet that look like clogs or slabs again, or toes that read as separate
  beads.
- The phone slowing down at a busy camp.

## Left to the builder

- Exact geometry construction (tube along a curve, lathe, deformed sphere)
  and ring/side counts per build quality, within the triangle ceilings.
- How claws are coloured (vertex colour vs a merged sliver).
- Exact accessory re-placement for Hagrid and the retuned `NECK_FLUFFY`.
