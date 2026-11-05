# polish-logs: round the log bridges

**Goal:** the owner's "round the log bridges". From the walk camera and from low angles, each log bridge (Woods, River, Moor, Pines) reads as a round fallen trunk across the water, not a flat brown plank. Follows docs/superpowers/plans/2026-11-04-polish-crossings.md, which rebuilt `logBridge` and parked "the log's profile is still straight and low".

**Architecture:** render-side only, all inside `logBridge` / `logTrunkGeometry` in src/world/builder.js. The same objects as now (Group, Shape, one BufferGeometry, one Mesh, one material), so every pinned uuid draw stays. Walkable data (deck rects, colliders, hidden path footprints, trail tucks) and the area files don't change.

**Why it read flat:** the trunk was a 3 m circle cut by a 1.9 m chord at 0.16 m, so above the water (0.03) it showed a 13 cm, 45-degree bevel under a dead-flat 1.9 m board. The walked top can't rise (top y is pinned and paws must not float or sink), so roundness has to come from the profile under the top edge, from the top's own shading, and from parts that stand up outside the deck.

## Constraints
- Flat trace sha256 3dfb11a4…d838; waterlooks BUILD_DRAWS unchanged (woods 11344, river 15484, moor 7944, pines 11580, gorge 4488).
- No new meshes or casters; no Math.random; deterministic from the endpoints via hash01.
- The deck's ±0.9 m strip: the visual top is exactly `y` on the log's centre line and never above `y`, and at most ~4.5 cm below it at the deck's edge.
- Everything stays inside the trunk footprint `w` (fixes the stub that could poke out for unusual w/flat).
- Triangles: ≤ 600 per log (was 167; lands at 394). Logs live in Woods, River, Moor, Pines (the Gorge has none).
- Only builder.js `logBridge`/`logTrunkGeometry`, test/builder.test.js's logBridge tests, the budget comment in test/budget.test.js.

## Shape
- Cross-section built from a profile function of z: a hewn top with a slight crown (centre at y, about 3 cm down at the deck edge); a bark wane from a wavy hewn edge (`xh(z)` wanders 0.43–0.63 m; narrowed after the first live look, so more round bark shows on top) out to the flat's edge; a rounded shoulder that rolls over into a near-vertical bark flank bulging to ~1.14 m half-width just under the water line; straight to the bottom under the bulge (it is under the water or the bank everywhere). Normals from the profile itself (smooth, shared vertices on the bark, crisp crease at the hewn edge).
- Nine cross-sections along the log, closer together at the root end.
- Root flare at one end (seeded): over the last ~1.4 m the bark shoulders rise into two buttress humps up to ~0.28 m above the top, outside the walked strip, and the flank widens to the footprint's edge. The root end face is dark root/earth (earcut-triangulated, since the notch between the humps isn't star-shaped).
- Sawn end at the other end: concentric end-grain loops sampled at the outline's own points, so there are no T-junctions; inner loop fanned.
- Two broken branch stubs (6 sides, bent, pale jagged tip) on opposite flanks over the water, rising up and out above the top, clamped inside the footprint.
- Bark: mottled per vertex, darker low, moss on one side toward one end.

## Tasks
1. Tests first in test/builder.test.js (replace the old shape-specific logBridge tests: hewn flat 3 decimals, 220-triangle cap, fixed 0.63 wane line, radial normals about a 1.5 m circle, end grain at both ends) with: centre line at y; deck strip within 4.5 cm below y and never above; falls away past the flat; wavy hewn edge; rolling flank normals; root flare wide and above the top outside the deck, inside the footprint; sawn end grain (≥3 tones, dark rim) facing out; end faces have no T-junctions on their outline; stubs above the top and inside the footprint for several w/flat combos; ≤ 600 triangles; deterministic.
2. Implement in builder.js.
3. Area tests (woods/river/moor/pines deck-over-log), waterlooks, flattrace, budget; budget comment; full suite; build.
4. Review the branch once; fix wave.
5. Live shots (day, dusk, phone) from crossings' camera spots + the walk camera; pairs.
6. Merge main, rerun suite, report.

## Rulings
- R1 The walked top gets a crown that only falls: y on the centre line, ~3 cm down at the deck's edge (±0.9), ~4.5 cm at the flat's edge. Cost if wrong: a cat walking the very edge of the deck floats ≤ 4 cm.
- R2 `flat` now means the walked width (the top stays within a few cm of y across it); the hewn/bark colour line inside it wanders 0.43–0.63 m out. Cost if wrong: none for gameplay; a reviewer reading `flat` as "hewn wood width" would see bark over the deck's outer 27–47 cm.
- R3 The visual trunk is narrower than `w` (bulge ~2.3 m) except at the root flare, which reaches `w`. Cost if wrong: the log looks less massive than the "great oak" comment says.
- R4 Stubs and root humps stand above y outside the deck strip (no colliders; cats can't step there). Cost if wrong: a cat walking off the deck edge at the root end could clip a hump visually.
- R5 One end is a root flare, the other a sawn end; no splintered broken end. Cost if wrong: one fewer "fallen tree" cue.
