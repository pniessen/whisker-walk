# Whisker Walk v3 — "Cat Life" — Design Spec

**Date:** 2026-08-01
**Status:** Approved by user
**Base:** the third-person "you are the cat" game (post-pivot main). Seven
user-selected upgrades: four interaction systems, three graphics upgrades.

## Interactions

### 1. Knock things over (tippables)
- New prop set per area: terracotta flower pots, watering cans, small trash
  bins (procedural), placed near houses/fences/benches — neighborhood 5,
  park 4, seaside 4. The garden gnome is also tippable.
- Walk up to an untipped one: prompt `E — paw it over`. On tip: the object
  topples (rotates ~100° over ~0.5s with a small hop), `mischief` award (+4,
  once per object per walk), toast "Gravity check! 🐾", and any villager
  within 8 units does their arm-wave (dismay, re-using the wave animation).
- Module `src/tippables.js`: `createTippables(scene, spots)` →
  `{ list, nearest(pos, maxDist), tip(t), update(dt), dispose() }` with
  pure-testable topple-state logic.

### 2. Climbing & perching
- Areas define `perches`: `[{x, z, y, label?, vantage?}]` — bench seats
  (y≈0.55), car roofs (y≈1.3), big rocks (y≈0.65), plus one special vantage
  perch per area with a label and a scenic-style award ("king of the car
  roof", "fountain-edge lookout", "overlook boulder").
- **Space near a perch (≤1.2) climbs it** instead of pouncing: the cat hops
  up (0.25s arc), sits perched. Any arrow key hops back down. While perched:
  critter flee radius is halved (birds don't clock you up there) and vantage
  perches fire their awardOnce (`scenic` type, custom label).
- Player controller gains a `perchY` concept (cat y follows perch height).

### 3. Boxes + stalk mode
- 2–3 procedural cardboard boxes (open top, flaps) per area. Stand inside
  one for ~1s → `sits` award (+8, once per box per walk), toast
  "If I fits, I sits 📦", cat takes the sit pose.
- **Hold Shift to stalk**: speed drops to 45%, cat takes a low crouch pose,
  and critter flee radius is halved while stalking. Combos with pounce for a
  wholesome catch-and-release hunting loop. (Stalk and perch flee-halving
  don't stack below half.)
- `critters` gains `setFleeModifier(m)` (dynamic, per-frame; default 1).

### 4. Scent trails + meow
- Each walk buries 2 treats per area (random POI offsets, invisible mounds).
  Pressing `E` with no other prompt **sniffs** (1s sniff pose): if a buried
  treat is within 18 units (Tabby keenNose: 30), a glowing paw-print trail
  (6–8 small ground decals, fading) appears leading toward it. At the mound:
  `E — dig` → quick dig, treat pops out, `treasure` award (+12).
- Module `src/scent.js`: pure-testable trail-point generation + treat rolls.
- **V = meow**: plays the meow; villagers within 6 wave, strays within 8
  meow back (pitch-varied), birds within 5 startle and flee. No points —
  it's a toy.

## Graphics

### 5. Cat model overhaul (`src/cat/model.js` rewrite)
- Rounded plush-style procedural build, still low-poly flat-shaded: ellipsoid
  body (scaled sphere), sculpted head (sphere + muzzle + cheeks), curved
  ears with inner-ear color, real eyes (iris + pupil + shine), whisker lines
  (3/side), tapered 5-segment curling tail on nested pivots, cylinder legs
  with paw spheres. Fluffy breeds (Persian, Maine Coon) get a neck ruff.
- Breed color identities preserved (stripes, siamese points, calico patches).
- `userData.parts` contract extends to `{ body, head, tail, tailPivots[],
  legs[4], earL, earR, whiskers }` — accessories parented so they track the
  head (collars/bell/bandana/crown) exactly as before.
- Strays and the quest kitten automatically get the new model.

### 6. Animation polish (`src/cat/animator.js` rewrite)
- 4-beat walk gait (per-leg phase offsets) with body bob; springy lagged
  tail-chain sway; occasional ear twitches; **pounce squash-and-stretch**;
  new poses: `stalk` (low crouch), `perch` (upright sit), `groom` (head
  turned, front paw raised, looping), `stretch` (front-down butt-up, plays
  ~1s when waking from a nap).
- Idle cycle becomes: stand → groom (~6s) → sit (~10s) → nap (~16s), napper
  thresholds roughly halved; leaving nap plays the stretch first.
- Signature: `animateCat(cat, state, t, moveSpeed)` (unchanged callers).

### 7. Shadows
- `renderer.shadowMap` enabled (soft), sun casts with a ~±60-unit ortho
  shadow camera at 2048², all scene meshes cast+receive via a single
  traverse in `startWalk`. Target: still smooth on a typical laptop; if the
  frame rate suffers, drop to 1024² before shipping.

## Awards added

`mischief: 4, sits: 8, treasure: 12` (trail/vantage awards reuse existing
types with unique keys). All flow through the existing discovery log.

## Controls after v3

Arrows move · mouse orbits · **Shift stalk** · **Space pounce / climb** ·
E interact (paw over, dig, sniff, meow at neighbors…) · **V meow** ·
T yarn ball · C camera · M mute · Esc pause.

## Out of scope

Toon outlines (declined), roof-level climbing/parkour, interiors, fur
shells, critter AI changes beyond flee-modifier, physics engine.
