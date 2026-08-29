# Whisker Walk — Visual Realism Pass

> Drafted 2026-08-28 against the live build (Cozy Neighborhood, high tier,
> desktop). Every number below is **measured**, not estimated — the rig is
> `verify-lighting.html` (gitignored, same convention as `verify-park.html`),
> which reproduces `walk.js`'s exact renderer, light and shadow setup against
> `world/neighborhood.js` and exposes `__stats()`, `__count()`, `__probe()`
> and a shadows-on/off A/B.
>
> Goal: kill the *blocky, flat, pixelated* read without losing the cozy
> low-poly art direction and without spending frame time we don't have.

---

## 0. The measurement that reframes the whole problem

```
Cozy Neighborhood, camera at spawn, high tier:
  scene contents        380 meshes,  7,321 triangles
  per frame             580 draw calls, 11,210 triangles
                        (main pass + shadow pass, post-cull)
```

**This scene is draw-call bound and nowhere near triangle bound.** 7.3k
triangles is roughly half a percent of what a mid-range phone GPU will chew
through at 60fps. 580 draw calls is where the frame actually goes.

That single fact sets the strategy for the entire pass:

- **Geometric detail is nearly free** — bevels, higher segment counts,
  rounded silhouettes, a segmented ground plane. Going from 7k to 150k
  triangles costs essentially nothing *provided the mesh count doesn't move*.
- **Every new mesh is expensive.** A "add a soft shadow blob under each prop"
  fix that adds 380 meshes costs more than tripling the polygon budget.
- So the plan front-loads a **draw-call reclamation wave** (Wave 3) and then
  spends the reclaimed budget on silhouette and depth. Detail is paid for in
  *merges and instances*, not in polygons.

---

## 1. Diagnosis — what "blocky, flat, pixelated" actually is

### Pixelated

**Antialiasing is silently off on the high tier.** `main.js:75` constructs the
renderer with `antialias: true`, but on the high tier `walk.js` renders through
`EffectComposer`, and three r185's composer allocates its own target with
`new WebGLRenderTarget(w, h, { type: HalfFloatType })` — **no `samples`**
(`node_modules/three/examples/jsm/postprocessing/EffectComposer.js:69`). The
canvas's MSAA buffer is never drawn into. The result is backwards from what the
tier system intends: **low-tier phones get MSAA, high-tier desktops get none.**

Secondary: high-frequency tiled maps at grazing angles (the sidewalk sett grid
running to the horizon) crawl. Anisotropy is already capped at 4, which is the
right call; the crawl that remains is an AA problem, not a filtering one.

### Flat

Four separate causes, in order of how much each contributes:

1. **`AmbientLight(0xbfd8ff, 0.9)` is a constant added to every surface
   regardless of its normal** (`walk.js:327`). It is, by construction, the
   thing that removes form. Against a sun at 2.2 and an IBL at 0.45, it is a
   large share of the light on any surface facing away from the sun — so a
   wall's shaded side and its lit side differ far less than they should.

2. **The sun is at ~54° elevation** — `sun.position.set(30, 50, 20)`, i.e.
   near-noon, the single flattest light angle there is. A 3m tree casts a 2.2m
   shadow that barely escapes its own canopy.

3. **Shadows are on but contribute almost nothing.** Measured by A/B
   (`__shadowsOn()` / `__shadowsOff()`, full-frame pixel diff): shadows change
   **1.45% of screen pixels**, max delta 82/765 RGB. Two reasons — the flat sun
   angle above, and resolution: the shadow camera is fixed at ±70 world units
   to cover the *entire* 110m area, so at 2048 that's **6.8 cm per texel**
   (13.7 cm on the low tier's 1024). Nothing smaller than a car has a legible
   contact shadow. The cat itself does not visibly touch the ground.

4. **The sky is a flat `THREE.Color`** (`builder.js:132`). No gradient, no
   horizon lift, no sun-side warmth. A single unbroken cyan field meeting a
   single unbroken green field at a hard line is most of the "cardboard"
   impression in a wide shot.

Also contributing: no normal maps, no AO of any kind, no vertex colours, and a
120m ground plane that is **two triangles of one flat colour** — a billiard
table under everything.

### Blocky

- 30 `BoxGeometry` call sites, zero bevels. A perfectly sharp 90° edge never
  catches a highlight, which is what makes a box read as a primitive rather
  than an object.
- Low segment counts where the silhouette is actually visible — trunks,
  bollards, lamp globes, fountain bowls.
- The horizon is a dead-straight line where the flat ground plane ends.
- No `flatShading` anywhere, and no instancing, merging or LOD anywhere — so
  the existing blockiness is being paid for at full price.

---

## 2. What is *not* the problem (and must not be "fixed")

- **The texture system.** `render/textures.js` is deliberate and correct: an
  0.87 luminance floor, darken-only painters, a stacked-alpha budget and a hard
  clamp. Its job is a hint of grain that resolves to flat colour at distance.
  The flatness is a **lighting** problem, and reaching for louder textures to
  fix a lighting problem is exactly how cozy-low-poly becomes muddy-low-poly.
  Wave 5 touches this file, and only to add *normal* maps derived from the
  existing painters — the colour floor stays.
- **The surface preset table.** `materials.js`'s 17 presets are well argued and
  correctly calibrated against this specific dim IBL probe. Wave 1 changes the
  light; if anything in that table needs re-calibrating afterwards it's a
  targeted follow-up, not a rewrite.
- **The tone mapping / exposure.** ACES at 1.1 is calibrated and is a
  documented owner boundary (`game/composer.js` owns it, Night Eyes multiplies
  it). Nothing below touches `toneMappingExposure` except as a possible
  half-step trim in Wave 1 if the lower sun blows out lit faces.
- **The art direction.** Nothing here proposes photorealism. Every item is in
  service of *readable form* — surfaces that tell each other apart, objects
  that sit on the ground, a sky with depth.

---

## 3. The waves

Ordered so each wave makes the next land harder, and so the two cheapest
waves ship first and can be judged before anything structural is committed.

---

### Wave 1 — Free wins (no geometry, no draw calls, hours)

Four changes, all of them numbers. Together these are expected to be the
largest single step in the whole plan, and none of them costs a draw call.

| # | Change | File | Cost |
|---|---|---|---|
| 1.1 | Give the composer a multisampled target | `game/composer.js` | ~10–15% fill, high tier only |
| 1.2 | `AmbientLight` → `HemisphereLight` | `game/walk.js` | zero |
| 1.3 | Drop the sun to ~25° and fit the shadow camera to the view | `game/walk.js` | zero |
| 1.4 | Gradient sky background | `world/builder.js` | zero (background draws either way) |

**1.1 — MSAA on the composer target.** Pass an explicit render target into
`EffectComposer` with `samples: 4`:

```js
const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
composer = new EffectComposer(renderer, rt);
```

Must be resized alongside the composer in `resize()`. Put `samples` on the
quality tier (`quality.js`: `msaaSamples: 4` high / `0` low) so the tier stays
the one place that decides. This is the single highest-ratio line in the plan.

**1.2 — Hemisphere light.** `new THREE.HemisphereLight(skyColor, groundColor,
intensity)` costs exactly what an `AmbientLight` costs — no shadow map, no
extra pass — but its contribution varies with the surface normal's Y. Up-facing
surfaces take sky, down-facing take bounce from the ground. Every mesh in the
game gains vertical form for free. Start from the existing ambient colour as
the sky term (`0xbfd8ff`) and take the ground term from the area's own dominant
ground colour, which each area already knows — a green bounce in the park, a
sand bounce at Seaside, a grey one at the Docks. Expect to drop the intensity
below 0.9 once the sun's contrast is restored by 1.3.

**1.3 — Sun angle and shadow fit.** Two independent halves:

- *Angle.* `sun.position.set(30, 50, 20)` → **`(36, 15, 24)`**, taking elevation
  from 54.2° to **19.1°**. Shadow length goes from 0.72× an object's height to
  2.89×. This is what makes a low-poly scene read as three-dimensional, and it
  is two numbers.

  *Corrected during implementation, twice — read this before touching the sun.*

  **The drafted 25° does not work.** At exactly 25° the shadow A/B measures
  1.50%, i.e. no better than what it replaced: that is close to the angle where
  the neighborhood's shadows still fail to clear the props casting them, and the
  single-camera metric has a cliff there (1.5% → 4.4% → 10.3% across 25°→22°→
  19°). Tuning on a cliff is how a number becomes accidental, so the rig grew a
  24-view panel (6 positions × 4 yaws through the real chase camera) where the
  sweep is smooth and monotonic, and 19.1° is where that curve flattens.

  **Intensity goes UP, 2.2 → 3.0, not down.** The draft braced for blow-out at
  the grazing angle. The geometry does the opposite, and the reason is the
  camera: under a 28°-down chase camera the ground is most of the screen, and a
  low sun lights the *ground* far less, not more.

  | | ground irradiance | sun-facing wall |
  |---|---|---|
  | 54.2°, I=2.2 | 1.784 | 1.287 |
  | 19.1°, I=3.0 | 0.983 (**0.55×**) | 2.834 (**2.2×**) |

  Left at 2.2 the world goes flat and dim and the shadows lose their contrast.
  Measured at 3.0: not one pixel reaches 252 in any channel — ACES rolls off
  long before clipping — and mean frame luminance still drops 3.4%. Bright lit
  faces against a darker ground is the raking-light read the wave is for.
  `toneMappingExposure` stays untouched (a test asserts it).
- *Fit.* The shadow camera is fixed at ±70 to cover the whole area from world
  origin. Follow the player instead — reposition the light and its target each
  frame relative to the camera and tighten to ~±20, which covers everything
  inside the fog's useful range. That is 40 units over 2048 = **2.0 cm per
  texel, a 3.5× sharpening**, and the low tier's 1024 becomes sharper than the
  high tier is today. **Caveat, and it is not optional:** a moving shadow
  camera shimmers unless its position is snapped to whole shadow-map texels
  each frame. Budget for the snapping, and add a test that asserts the frustum
  actually contains the camera's near volume.

**1.4 — Gradient sky.** Replace `scene.background = new THREE.Color(top)` with
a small equirectangular `CanvasTexture` — a vertical multi-stop gradient from
`skyTop` down to the horizon, painted once per area palette and memoised the
way `textures.js` memoises its tiles. A few KB of VRAM, and it fixes the hard
sky/ground seam that reads as cardboard in every wide shot. Keep it in step
with `scene.fog`'s horizon colour, which already exists and is already correct.

*Correction, measured during implementation:* this costs **one** extra draw
call, not zero as originally drafted. Three's `WebGLBackground` clears to a
solid for a `Color` background but inserts an internal full-screen `planeMesh`
for any `Texture` background. That is unavoidable for any real per-pixel sky
through the public API, it is a singleton rather than per-mesh or per-area, and
it never enters the scene graph (`__count()`, shadow casting and endWalk's
teardown are all untouched by it). Measured 580 → 581 in the harness. Still far
cheaper than the inverted-sphere alternative, which would add this same call
*plus* a real mesh.

*Calibration constraint, measured during implementation, and the thing that
matters most here:* the game camera is pitched **27.7° down** (`cameraOffset(0,
0.18)`, height 2.93, looking at y=0.6), so with a 70° FOV the top of frame is
only **7.3° above horizontal**. In the equirect `v = acos(dir.y)/π`
coordinate, normal play only ever shows **v ∈ [0.46, 0.50]**, widening to
[0.335, 0.50] with the camera pitched fully up. A gradient authored across the
full hemisphere is therefore ~96% invisible, and whatever sits at v ≈ 0.46 is
effectively the entire sky. Place the stops in that band, and check the result
against all five area palettes plus the sunset and rain pairs in `weather.js` —
several of those horizon colours are already near-white by authorship, so a
haze lift that reads as atmosphere on the Docks washes the neighborhood out.

**Verification gate:** re-run `verify-lighting.html`, confirm the shadow A/B
moves from 1.45% of pixels to something in the 8–15% range, and confirm
`renderer.info.render.calls` has not moved.

**Result: 1.51% → 10.28%, and draw calls went DOWN 581 → 407.** The gate asked
for calls to hold steady; the ±20 frustum culls 174 casters out of the shadow
pass that the ±70 box was drawing, a 30% reduction on an identical image. That
makes Wave 3.3 cheaper rather than harder.

Two measured caveats worth carrying forward:

- **Shadow contribution is strongly view-dependent.** The 24-view panel means
  10.47%, but ranges **0% to 44%** depending on where the sun sits relative to
  the view direction. The sun's azimuth is 56.3° from +z, so a camera looking
  down −z has it 124° behind — shadows fall away from the viewer and hide behind
  their own casters. The mean passes; the distribution is wide. If shadows still
  read as absent in normal play, the lever is the sun's **azimuth** relative to
  the areas' main sightlines, not its elevation or intensity.
  *Closed — the azimuth was the lever, but "relative to the areas' main
  sightlines" was the wrong frame for it; see "Closed after the fact" below.*
- **The shadows are soft.** Max single-pixel delta is 174/765, so the deepest
  shade only darkens ~23%; the HemisphereLight and the IBL fill it back in. That
  is a fill-depth question, and Wave 2.1's contact decals are the right lever for
  it — not a deeper shadow term.

---

### Wave 2 — Grounding (the AO wave)

Objects currently float. This wave puts them on the ground.

**2.1 — Instanced contact-shadow decals.** A soft radial-gradient alpha quad
lying just above the ground under every prop. This is the cheap, art-directed
substitute for AO and it suits low-poly far better than SSAO does. **Build it
as a single `InstancedMesh` per area** — 380 props, one draw call, one shared
64px gradient texture. Emit the instances from the existing builder helpers
(each already knows its own footprint radius) into an array the area returns,
the same way `colliders`, `waters` and `tippables` are already returned.
Anything that moves — the cat, strays, critters — needs its own small pool of
instances updated per frame, not a static one.

**2.2 — Ground-plane macro variation.** Segment `builder.ground()` from
`PlaneGeometry(size, size)` to `PlaneGeometry(size, size, 48, 48)` and write
low-frequency colour variation into **vertex colours** — patches of drier and
lusher grass, damp streaks on the Docks' stone, wind-drift on Seaside's sand.
2.3k extra triangles, zero extra draw calls, zero extra texture memory, and it
kills the billiard-table read. Vertex colours multiply the material colour the
same way the maps do, so the existing luminance discipline carries over
unchanged; keep the same 0.87-ish floor.

Do the same for `path()` and `sidewalk()`, which have the same problem at
smaller scale.

**2.3 — SSAO/GTAO — high tier only, and only if 2.1 and 2.2 don't land it.**
Real screen-space AO is 1.5–3ms and on a scene of large flat facets it tends to
draw a dark outline around everything, which fights the art direction. Treat it
as optional, gate it behind a new `quality.js` flag, and judge it against
Wave 2.1's result rather than against today's build.

---

### Wave 3 — The draw-call budget (pure performance; the enabler)

Nothing in this wave changes a pixel. It exists to pay for Waves 4–6, and it is
where the user's "balance with performance" constraint is actually satisfied.
Target: **380 meshes / 580 calls → under 150 calls**, on the same image.

**3.1 — Merge static props per spatial cell.** Most of the 380 meshes are
static and non-interactive: house walls, roofs, fence posts, kerbs, trim. Merge
them with `BufferGeometryUtils.mergeGeometries`, grouped by *(material,
spatial cell)*. Two constraints that decide the design:
- Group by material, because merging across materials needs geometry groups and
  gives back multi-material meshes that draw once per group anyway.
- Group by ~30m spatial cell, **not** area-wide, so per-object frustum culling
  survives. One merged mesh for the whole area is culled all-or-nothing and can
  easily be slower than what it replaced.
- Merge only props with no interaction, no wind registration, no tippable
  entry and no per-walk material swap. The dusk window-glow traversal
  (`walk.js:414`) mutates `userData.window` materials in place — windows must
  stay out of the merge or the traversal must move ahead of it.

**3.2 — Instance the repeated props.** Fence posts, kerb setts, leaf litter,
flower heads, bollards, the Wave 2.1 decals. Each becomes one `InstancedMesh`.

**3.3 — Stop every mesh from casting.** `walk.js:653` sets
`castShadow = receiveShadow = true` on *every* mesh via `scene.traverse` —
including water planes, particles, glow rings and props too small to cast a
legible shadow at any resolution. Each caster is a draw in the shadow pass,
which is why 380 meshes produce 580 calls. Once Wave 2.1 lands, small props
have a contact decal and don't need to cast. Give the builders an explicit
`castShadow` opt-out and let the traversal respect it.

**3.4 — Lock it in with a test.** The suite already covers every area
(`neighborhood.test.js`, `park.test.js`, `docks.test.js`, `seaside.test.js`,
`den.test.js`). Add a mesh-count and caster-count ceiling per area so the next
density pass can't silently spend the budget this wave just recovered.

---

### Wave 4 — Silhouette (spend the reclaimed budget)

Now that triangles are affordable and meshes are not, spend triangles.

**4.1 — `roundedBox()` in `builder.js`, swapped in behind the 30 box call
sites.** A 2–3 cm chamfer on every box edge. The bevel catches a specular
highlight along every edge, and that highlight is the entire difference between
"a crate" and "a cube". Costs ~130 triangles per box over the current 12 —
about 4k triangles across an area, which at this budget is noise. Do it as a
helper with the same signature as `BoxGeometry` so the swap is mechanical, and
memoise the geometries by dimension so the mesh count doesn't move.

**4.2 — Segment-count pass on the round primitives.** 47 cylinders, 18 cones,
18 tori, 9 spheres. Raise the counts wherever the silhouette is actually seen
close up — trunks, bollards, lamp globes, fountain bowls, barrels. A few
hundred triangles total. Note the constraint `materials.js` already documents:
low-sided cylinders take `surfaceMaterialNoMap` because planar tiling smears at
the silhouette — **raising the segment count may make some of those trunks
mappable again**, which is a free material upgrade riding along with this item.

**4.3 — Break the horizon.** *Not* by displacing the ground plane. Terrain
displacement collides with the collider system (2D circles at y=0), spawn
placement, `clearSpot`, water clearance and the player controller — it is a
system change wearing a visual change's clothes, and it is out of scope here.
Instead: a purely decorative silhouette band beyond `bounds` — low hills for
the park and neighborhood, a rooftop skyline for the Docks, dunes and a headland
for Seaside. One or two merged meshes, no colliders, fully inside the fog's far
distance so it fades correctly. Same payoff, ~2 draw calls, no system risk.

---

### Wave 5 — Material depth

**5.1 — Derived normal maps.** `textures.js` already paints 8 tiles on a canvas
and already reads them back for `clampToFloor`. A height→normal derivation
(Sobel over the same luminance the clamp already computes, packed into RGB) is
~30 lines in the same file, needs no new art, no new painters and no new asset
fetch, and gives real relief to brick, cobble, shingle, plank, gravel and sand.
This is the item that fixes "surfaces look printed on". Memoise alongside the
colour tiles, expose as `preset.normalScale` in the `SURFACE_PRESETS` table so
each surface can dial its own strength, and gate the whole thing on the high
tier the way `surfaceTexture()` already gates colour maps.

**5.2 — Revisit the calibration.** Once Waves 1, 2 and 5.1 have landed, the
material table was calibrated against a light rig that no longer exists — a dim
uniform ambient and a near-noon sun. Re-check the gloss band (`materials.js`
documents it as roughly 0.15–0.5 for this specific probe) and the 0.87 colour
floor. The floor may be able to relax a little now that lighting is carrying
the form; that is a judgement to make **by eye against the new rig**, not a
number to pick in advance.

---

### Wave 6 — The cat

The hero asset, on screen 100% of the time, currently a smooth-shaded assembly
of primitives (`cat/model.js`, 697 lines) with no shadow contact. Worth its own
wave once the world around it is right, because a lot of what reads as "flat
cat" today is actually "cat with no contact shadow and no directional light".
Re-judge it after Waves 1–2 before committing to any modelling work.

---

## 4. Per-tier budget

Every item above declares its tier behaviour, and `render/quality.js` stays the
single place that decides. Proposed new knobs:

| Knob | High | Low | Wave |
|---|---|---|---|
| `msaaSamples` | 4 | 0 (canvas MSAA already applies) | 1.1 |
| `shadowMapSize` | 2048 | 1024 | existing |
| `shadowFitRadius` | 20 | 20 | 1.3 |
| `contactDecals` | on | on (1 draw call — keep it) | 2.1 |
| `groundVertexColors` | on | on (free) | 2.2 |
| `ssao` | optional | off | 2.3 |
| `normalMaps` | on | off | 5.1 |
| `horizonBand` | on | on | 4.3 |

The pattern: anything that costs **draw calls or nothing** ships on both tiers;
anything that costs **fill rate or texture bandwidth** is high-tier only. That
is the same line `textures.js` already draws, extended.

## 5. Verification

Each wave gates on the rig rather than on a subjective look:

- `verify-lighting.html` (already written) — `__count()` for scene contents,
  `__stats()` for `renderer.info.render`, `__shadowsOn/Off()` for the shadow
  contribution A/B, `__probe(x,y)` for exact sRGB readback. Extend it with a
  frame-time sampler and a per-area switch.
- A **budget test** in the suite (Wave 3.4): mesh count, caster count and
  triangle count ceilings per area. Triangles get a generous ceiling; meshes
  get a tight one. That asymmetry is the whole strategy, written down where a
  future density pass will trip over it.
- The existing `verify-park.html` / `verify-docks.html` / `verify-seaside.html`
  / `verify-neighborhood.html` harnesses all need Wave 1's light rig copied in,
  or they will keep rendering the old lighting and quietly disagree with the
  game. Note that none of them currently set `castShadow`/`receiveShadow` at
  all, so **they have never shown shadows** — worth fixing in the same pass.

## 6. Suggested sequencing

Waves 1 and 2 are independent of everything else and should ship and be judged
first — they are cheap, they are reversible, and they may well change the
appetite for Waves 4–6. Waves 5 and 6 are judgement calls to make against the
post-Wave-2 image, not now.

*Corrected after Wave 2 landed:* **Wave 3 is NOT a prerequisite for Wave 4.**
The claim above — that Wave 4 is affordable only on the budget Wave 3 recovers
— was wrong, and wrong in a way worth naming: Wave 4's items (rounded boxes,
higher segment counts) spend **triangles**, and triangles were never the
constraint. Measured after Wave 2: 553 draw calls against **24,982 triangles**,
up from 7,321, with no draw-call cost at all. Only 4.3's horizon band costs a
call or two.

That matters because 3.1 (spatial merging) is the single riskiest change in the
plan, and it grew a new hazard after Wave 2.1 shipped: **merging static props
would break the contact-decal scan**, which walks top-level `scene.children` and
derives one footprint per prop — merged cells would produce one decal per cell.
It would also have to preserve the dusk `userData.window` material swap and the
wind registry. So Wave 3 was split:

- **3.3 (caster trimming) and 3.4 (budget test) proceed.** These are the safe,
  high-value half, and 2.1's contact decals are precisely what makes trimming
  the caster list safe — small props keep their grounding from something cheaper
  than a shadow-map draw.
- **3.1 and 3.2 (merging and instancing) are deferred**, pending a decision on
  whether the remaining draw-call win justifies the interactivity risk. Wave 1
  already banked 581 → 407 for free via shadow-frustum culling, so the headline
  motivation for merging is substantially weaker than when this was drafted.

---

# Outcome (2026-08-28)

All waves executed except 3.1/3.2, which were deliberately deferred (see §6).
**72 test files / 1597 tests passing**, up from 66 / 1315 at the start.

## What shipped

| Wave | Item | Result |
|---|---|---|
| 1.1 | MSAA on the composer target | 4x restored on the high tier; the quality inversion is gone |
| 1.2+1.3 | HemisphereLight, 19.1° sun, player-following texel-snapped shadow fit | shadow A/B **1.51% → 10.28%**; draw calls **581 → 407** |
| 1.4 | Gradient sky | top-of-frame byte-identical to the authored colour; +1 draw call |
| 2.1 | Instanced contact shadows | **+2 draw calls total**; the cat touches the ground |
| 2.2 | Ground macro variation (vertex colours) | 0 draw calls, 0 texture memory |
| 3.3 | Caster trimming | draw calls −9% to −44% by area, 0.001–0.25% pixel change |
| 3.4 | Budget test (`test/budget.test.js`) | mesh/caster/triangle ceilings per area |
| 4.1 | Chamfered boxes | 12 → 44 tris/box, bbox bit-identical, 0 meshes, 0 draw calls |
| 4.2 | Segment counts | 30 call sites; one map promotion (`roofTank`) |
| 4.3 | Horizon band | +1 mesh, +2 draw calls per outdoor area |
| 5.1 | Derived normal maps | 6 of 8 surfaces; high tier only |
| 6 | The cat | markings re-seated on the body surface; **mesh delta negative** |
| — | Organic tree canopies (pulled forward) | 0 draw calls |

## Four things this plan got wrong

Recorded because the corrections are more useful than the original text.

1. **Sun elevation.** Drafted 25°; measures 1.50%, no better than what it
   replaced. Correct answer 19.1°, found by building a 24-view panel after
   noticing the single-camera metric had a cliff at the drafted angle.
2. **Sun intensity.** Drafted "trim it for blow-out". Correct answer was to
   RAISE it 2.2 → 3.0: under a 28°-down camera the ground dominates the frame,
   and a low sun lights the ground *less* (0.55x), not more.
3. **"Zero extra draw calls" for the sky.** It is one — three inserts a
   full-screen `planeMesh` for any Texture background.
4. **Wave 3 as a prerequisite for Wave 4.** It is not. Wave 4 spends triangles,
   and triangles were never the constraint.

## Coupling worth remembering

The waves were not independent, and the order mattered more than drafted:

- **Wave 1 inverted Wave 5's calibration.** At the old 54° sun, walls were ~2x
  more sensitive to normal perturbation than ground. At 19.1° the ground is
  **8.3x more sensitive than walls** — a ~17x swing. A normal-map table written
  before Wave 1 would have been wrong in the opposite direction.
- **Wave 1 exposed a latent defect in the cat.** Breed markings had always stood
  ~6cm proud of the body; a 54° sun flat-lit them, a 19.1° sun gives each one a
  rim highlight and a cast shadow onto the fur beneath. The geometry was always
  wrong; the lighting only stopped hiding it.
- **Wave 2.1 is what made Wave 3.3 safe.** Trimming the caster list is only
  acceptable because small props keep their grounding from a decal that costs a
  fraction of a shadow-map draw.

## Closed after the fact (2026-08-28, same day)

### Sun azimuth — CLOSED. `(36, 15, 24)` → `(-36, 15, -24)`

The antipode: same 43.27m ground radius, same y, so **19.1° elevation by
construction** and intensity untouched at 3.0. The sun keeps the compass axis
Wave 1.3 gave it and changes only which end of it it sits on — from behind the
player's shoulder to in front of it, so shadows travel toward the camera and
across the frame instead of away from it and behind their own casters.

**Global, not per-area**, and that was measured rather than assumed. Sweeping
the bearing in 15° steps through all four outdoor areas, the aggregate
"views under 2%" curve has one broad plateau at 214–238° with no cliff in it,
and fitting four separate per-area numbers recovers only 4 more views out of
96 than the single one does. The reason the per-area gain is that small is the
useful part: **the defect was the sun's angle to the chase camera, and the
chase camera is identical in every area.** The plan's premise that each area
has its own dominant sightline did not survive contact with the areas either —
the neighborhood is a crossroads (two sightlines at right angles), the park is
deliberately open, the Docks' canal and warehouse row both run east–west, and
only the seaside has a single shore line.

Panel distribution, 24 views per area through the real chase camera:

| | min | p25 | median | mean | max | under 2% |
|---|---|---|---|---|---|---|
| neighborhood before | 0.09 | 2.69 | 6.52 | 10.48 | 44.10 | 6/24 |
| neighborhood after | **0.71** | **2.90** | 5.51 | 8.01 | **26.94** | **3/24** |
| park before | 0.30 | 1.30 | 2.24 | 4.40 | 23.86 | 10/24 |
| park after | **0.55** | **1.89** | **4.15** | 3.70 | **8.00** | **7/24** |
| seaside before | 0.00 | 0.13 | 0.28 | 1.06 | 7.59 | 22/24 |
| seaside after | **0.05** | **0.78** | **3.78** | 9.27 | 41.41 | **10/24** |
| docks before | 0.70 | 7.87 | 18.39 | 19.73 | 58.39 | 1/24 |
| docks after | **0.97** | 4.25 | 8.27 | 11.51 | **36.72** | 1/24 |
| **all 96 before** | 0.00 | 1.29 | 3.23 | 8.92 | 58.39 | 39/96 |
| **all 96 after** | **0.05** | **2.39** | **5.09** | 8.12 | **41.41** | **21/96** |

The mean goes DOWN and that is the result, not a cost — a mean of 10% made of
a 0% view and a 44% view is a worse image than a uniform 9%. Standard
deviation 12.38 → 9.36. Every area's minimum rises and every area's maximum
falls. Dusk (sun 0.7) and all three weather branches (sunset 1.5, rain 1.1,
rainbow 2.2) move the same way, with zero clipped pixels and mean frame
luminance within 2.2% throughout.

Shimmer re-checked, and with a stricter test than Wave 1 used: camera frozen,
fit centre drifting a quarter-texel at a time along the light basis's own
lateral axis, 16 steps. Exactly 4 texel-boundary crossings, 5 distinct snapped
centres, and **0 frames that changed without crossing a texel** — on both
tiers and in two areas. The basis is exactly as well conditioned as before,
because its conditioning depends only on the angle to world-up.

*A defect found on the way:* `verify-lighting.html` had never carried Wave
3.3's caster rule — it still ran `scene.traverse(o => o.castShadow = true)`, so
the 120m ground plane, the horizon band and the seaside's 80×140 sea plane were
all casting in the harness and in nothing else. On the seaside that put 73% of
a frame under a horizon-band shadow the game never draws. Fixed, along with
adding the contact decals and the cat, before any azimuth was chosen.

### `CAST_TALL_HEIGHT` — CLOSED, kept at 1.3

Re-judged after the azimuth moved, on the hypothesis that a better azimuth
makes small-prop shadows more worth keeping. **Measured, it does the
opposite.** Restoring mailbox casting (threshold 1.2) buys 0.197% of pixels
standing right beside them, down from 0.442% at the old azimuth, for an
unchanged +7.9 draw calls (+2.6% of a 299-call frame); across the ordinary
panel it is 0.024%. The two frames are indistinguishable by eye in the
strongest of the 24 views. The reason is that the frame changed underneath it:
at the new azimuth the lamp posts, trees and gables already rake long shadows
across the same ground, so a mailbox's 3.5m line mostly lands inside one.

Worth recording: the constant is **not balanced on a slope**. Enumerated across
all four outdoor areas, the props that fail the tall test but clear the flat one
are eight mailboxes at 1.23m, one Docks prop at 1.25m, and then nothing until
0.93m. Any value in [1.26, 1.30] is the same rule, and moving it is a complete
no-op in the park and at the seaside.

Traded: eight mailboxes and one Docks prop keep a symmetric contact blob
instead of a raking line; the frame keeps ~8 draw calls. No budget ceiling in
`test/budget.test.js` moved, because no caster count moved.

## Open items

- **Waves 3.1/3.2 deferred.** Merging would break the contact-decal scan (one
  footprint per top-level scene child), the dusk `userData.window` swap and the
  wind registry. Wave 1 already banked most of the draw-call win for free.
- **In-game measurement: partially closed, and it moved a conclusion.**
  The walk can be measured without pointer lock after all — `renderFrame()` sits
  outside the `player.engaged` guard (`main.js`), so the "Ready?" screen renders
  the real scene through the real renderer, composer and MSAA. Measured there,
  Cozy Neighborhood, high tier: **exactly 1050 draw calls and ~106,700 triangles
  per rAF tick**, perfectly stable (13/13 frames identical, min = max = median).

  **Frame rate is still NOT measured.** Under automation the pane only
  composites during a screenshot, so rAF is throttled to ~10 ticks in several
  seconds. Any fps number from this environment would be meaningless. A real
  reading needs devtools on a desktop and, more importantly, a real phone.

  One caveat that is honestly unresolved: it cannot be fully excluded that the
  capture mechanism forces a second render per tick, which would put the true
  figure near 525. The stability argues against it but does not disprove it.

  **Why this matters more than the number itself:** every harness measures
  ~360-580 calls, because a harness builds only `world/<area>.js` plus a cat.
  The real walk also carries critters, strays, remotes, secrets, collectibles,
  ghosts, sky life, fx, scent, tippables, race rings, nametags and chat bubbles.
  So **the harnesses understate real frame cost by roughly 2x.** Every wave's
  measurement was a before/after on the SAME harness, so all the deltas in this
  document stand unchanged — but the absolute budget picture does not.

  Consequence: the recommendation below to skip Waves 3.1/3.2 was reasoned from
  ~400 calls. At ~1050 there is materially more to reclaim, and that call should
  be re-made against an in-game number rather than a harness one.
- **`verify-{park,docks,seaside,neighborhood}.html` still carry the old rig**
  and still never set `castShadow` — they have never shown shadows.

---

# Waves 3.1 / 3.2 — done (branch `feat/draw-call-reclaim`)

Deferred twice, then taken up once an in-game measurement showed the harnesses
were understating frame cost by ~2x. **73 test files / 1668 tests passing.**

## The move that made it safe

The drafted design was "merge per (30m spatial cell, material)" — merging
ACROSS top-level scene children. That is what carried the whole hazard list:
the contact-decal scan, the caster-trim rule, the dusk window swap, the wind
registry, and a convention four files state verbatim ("the mesh goes into the
scene DIRECTLY and never into a Group").

The eligible fraction was measured BEFORE anything was built, and it settled the
design: cross-child merging versus same-child-only differs by **+0.0 to +13.3
percentage points**, because almost all the available win is *inside* a single
prop, not between props.

| area | cross-child | same-child only | hazard list buys |
|---|---|---|---|
| neighborhood | 24.1% | 20.7% | +3.4 pp |
| park | 14.0% | 14.0% | **+0.0 pp** |
| docks | 53.3% | 40.0% | +13.3 pp |
| seaside | 29.2% | 26.2% | +3.0 pp |
| den | 47.5% | 44.4% | +3.1 pp |

So only the same-child half was built. That single restriction **discharges the
entire hazard list by construction rather than by vigilance**: `scene.children`
keeps its count, order and identity, every top-level bbox is unchanged to the
float, and every consumer sees exactly what it saw. Tests pin all three.

The general lesson: when a change needs a long list of things to be careful
about, look for the restricted version where the list cannot apply. Here it cost
almost nothing.

## Results

Build-time, deterministic, pinned in `test/budget.test.js`:

| area | meshes | casters | triangles |
|---|---|---|---|
| neighborhood | 381 → **218** | 314 → **169** | identical |
| park | 172 → **113** | 134 → **89** | identical |
| docks | 520 → **312** | 424 → **233** | identical |
| seaside | 65 → **48** | 33 → **28** | identical |
| den | 284 → **151** | 173 → **86** | identical |

−42% meshes, −45% casters, **zero triangles moved** — merging re-parents
existing geometry, it does not create any.

In-game, seeded so both runs build the same world: **1293 → 1110 draw calls
(−14.2%)**. Triangles +2.7%, from coarser culling granularity (a merged prop is
culled whole).

Pixel A/B across 24 views per area: 0.0004–0.0117% of pixels moved, all
one-pixel runs on silhouette edges — the signature of a vertex transform moving
from GPU-multiply to CPU-baked float32, not of anything drawn in the wrong place.

**3.2 (instancing) was deliberately not done, and the reasoning is sound:**
inside a group an InstancedMesh and a merged mesh are both exactly one draw
call, and merging needs no per-leaf geometry identity. Instancing *across* props
is the thing the hazard list forbids — one scene child for eight mailboxes is
one contact decal for eight mailboxes.

## A measurement caveat worth carrying

The report claimed the doc's 1050 baseline was "1293 in this tree because
density commits landed since". **That is not the reason** — no commits landed
between the two measurements. The difference is per-walk randomness: strays,
critters, secrets, collectibles, sky life and weather all vary, and unseeded
walks differ by ~250 draw calls. An unseeded in-game number is therefore only
comparable to itself. The seeded A/B is the valid one, and any future in-game
perf comparison must seed the world the same way.

## Two silent bugs found while building it

1. Rejecting meshes on `geometry.groups.length > 1` excluded nearly every
   indexed primitive — *every* THREE primitive emits groups (a box has six) and
   the renderer only reads them for array materials. Cost 55 merges in the den
   alone before it was caught in a diff of two key variants.
2. Merging a Mesh parented to another Mesh: `traverse()` finds both, and
   `removeFromParent()` on the parent takes the child with it. Surfaced as
   **504 triangles missing from a cat** in the first pixel A/B. Fixed with a
   leaves-only rule plus `userData.noMerge` on the cat group, so a future caller
   running the merge at the wrong moment degrades to "no merge" rather than to a
   cat with welded legs.

## Also fixed here

`vite.config.js` gains `testTimeout: 30000`. The suite outgrew vitest's 5s
default — `textures.test.js` (~24s, Sobel derivation plus seam-wrap
equivariance) and `mergeprops.test.js` (~21s, builds whole areas) now do real
work, and under parallel load the heavy files intermittently tripped the limit.
That produced "Test timed out in 5000ms" on tests that pass alone, which is a
false negative, and a suite that fails at random is one people stop believing.
30s is a hang guard, not a budget for slow tests.
