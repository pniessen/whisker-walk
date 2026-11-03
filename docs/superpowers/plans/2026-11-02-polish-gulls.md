# polish-gulls: the Docks gulls come alive

**Goal:** the Docks gulls stop being statues. A few gulls float on the canal and
bob with the swell (slow rise and fall, a little roll and pitch, each on its own
phase); the perched gulls (bollards, barge roofs, the red boat's bow) glance
about now and then with a head turn.

**Approach (one task):** all in the vertex shader of the existing merged
`docksDressing` mesh, so draw calls stay exactly flat.
- Every vertex of that mesh carries `aGull` (vec4): xyz = pivot, w = kind + phase
  (w 0 = static prop; 1..2 = floating gull, pivot at its waterline; 2..3 = a
  perched gull's head and beak, pivot at the neck). Phase is `hash01` of the spot.
- `onBeforeCompile` adds a rotation (roll/pitch for floaters, yaw for heads) and a
  lift for floaters, applied to both position and normal. One `uGullTime` uniform,
  set in the mesh's `onBeforeRender` from the frame clock. Per-frame cost: one
  uniform write.
- `FLOAT_GULLS`: three new gulls on the water (no legs), clear of bridges,
  barges, boats and the duck circles. Built inside `withLocalUuids` with the rest,
  so waterlooks BUILD_DRAWS docks stays 6916 and the flat trace is untouched.
- Reduced motion: docks.js passes `water.reducedMotion` to `dressDocks`; when set,
  no patch and no `onBeforeRender` — every gull holds still.
- Tests (test/docksdressing.test.js): float gull placement; attribute kinds and
  phases; "adds nothing that moves" becomes "only the gulls move, and not under
  reduced motion"; the shader patch compiles the expected chunks.

**Out of scope:** boats bobbing (the bow gull rides a static boat, so it is
treated as perched), gulls in flight, the seaside critter gulls.
