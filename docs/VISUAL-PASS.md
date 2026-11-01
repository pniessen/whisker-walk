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

  **Resolved (Stream 4 step 1, 2026-10-25): it is ~1050-class, not ~525.** The
  scene is drawn once per frame. See "Stream 4 step 1 — the draw-call answer"
  at the end of this document.

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

  **Closed (Stream 4 step 1).** The game's rig now lives in
  `src/render/rig.js`: sun, hemisphere fill, shadow bias, and the caster rule
  with its thresholds. `walk.js`, `test/budget.test.js` and these four pages
  all import it, so they cannot drift apart again. The four pages are now
  tracked in git, while the other `verify-*.html` stay scratch. Each one wires
  `createShadowFit` the way `verify-lighting.html` does, and now shows real
  shadows. Their HUDs print caster counts that equal this document's
  unmerged build-time figures: park 134, docks 424, seaside 33,
  neighborhood 314. The pages do not run `mergeStaticProps`, so harness draw
  counts are still the unmerged ones. As before, never size a budget from a
  harness number.

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

---

# Stream 4 step 1 — the draw-call answer (branch `worktree-v21-stream4-perf`)

## The answer

**The true per-frame figure is ~1050-class, not ~525. The scene is drawn once
per frame.** Measured 2026-10-25 on the "Ready?" screen of a real walk, Cozy
Neighborhood, solo and unseeded, in the in-game readout (`?perf`). The readout
was cross-checked against a raw count of every `gl.drawElements` /
`drawArrays` / instanced draw issued between two consecutive rAF callbacks:

| tier | raw gl draws per tick | readout total | shadow pass | scene | other | scene passes |
|---|---|---|---|---|---|---|
| high (desktop) | 1220, all 30 ticks | 1220 | 379 | 827 | 14 | 1 |
| low (desktop, forced) | 1121, all 10 ticks | 1121 | 229 | 892 | 0 | 1 |
| low (375×812, touch) | — | 552–616 | 155–203 | 373–413 | 0–6 | 1 |

The phone row is pane emulation at 375×812, three unseeded walks: 567 =
shadow 155 + scene 412 + other 6 (first walk), 552 = 179 + 373 + 0, and
616 = 203 + 413 + 0. The single "other 6" frame came on the first walk of a
page load, was not seen again, and is unexplained.

The two counts agree to the call. "Scene passes 1" means `renderer.render` is
handed the walk's scene exactly once per frame, so nothing in the game or in
the capture path renders it twice. The raw count needs no help from three: it
counts what reaches the GPU.

On the high tier, "other" is the composer's full-screen passes: the bloom
mip chain plus the output pass. That is 14 quads, as measured (bloom's 5-mip
chain plus composite and output), and they cost fill rate,
not draw-call overhead. The low tier has no composer, so "other" is 0.

Rows from different walks are **not** comparable with each other. Each walk
re-rolls strays, critters, secrets, collectibles and sky life, which moves the
total by ~250 calls (see "A measurement caveat worth carrying" above).
1050 → 1220 is most likely that variance plus content landed since, not a
counting change. The phone row is smaller mainly because a touch device gets
14 strays instead of 22, and its narrower view culls more.

## A trap for anyone reading `renderer.info` — `autoReset`

three resets `renderer.info` at the top of **every** `renderer.render()` call
(`info.autoReset` defaults to true). On the high tier, a frame is
`composer.render()`. The scene pass is followed by the bloom and output passes,
and each of those is its own `renderer.render(fullScreenQuad)`. So anything that
reads `renderer.info.render.calls` after a high-tier frame sees **only the last
full-screen pass**, about one call, not half or double the frame. A per-frame
total therefore needs `info.autoReset = false` and one `info.reset()` per frame.
That is what `src/render/perfstats.js` does, and only while the readout is on.
It wraps `renderer.render` and `renderer.shadowMap.render` to split the total
into shadow / scene / other.

Shadow draws happen inside the scene's `renderer.render` (three calls
`shadowMap.render` before drawing the scene), so they were always part of the
1050. They are not a second pass that could be double-counted.

## What the numbers say, before any fps reading

- The shadow pass is about 31% of the draws on high (379/1220) and 20% on low
  (229/1121). It is the biggest single lever left, and casters are what Wave 3.3 already trims.
- The high tier's composer adds only 14 draws (bloom's 5-mip chain plus
  composite and output); its cost is fill rate on a
  2× pixel-ratio buffer. Whether that matters is exactly what the owner's
  desktop fps reading will say.
- **No fps figure in this section, deliberately.** Under automation the pane
  throttles rAF to about 10 ticks, so the readout's fps and frame-time lines
  are meaningless there. The owner takes those readings on the desktop and the
  iPhone 18 (`docs/superpowers/handoffs/2026-10-25-stream4-measurement.md`).

# Adaptive Auto (Stream 4 step 2, branch `worktree-v21-stream4-adaptive`)

Auto no longer looks at the pointer. Every device starts a walk on the high
rung, and `src/game/adaptquality.js` steps it down one rung at a time if its
frames stay slow. The step is remembered per device in
`localStorage['whisker-walk-adapt']` (never the save), so the next walk starts
there. Manual High/Low turn adaptation off; Auto + reduced motion stays LOW.
`?perf` shows the rung on its own line, e.g.
`auto rung 1/3 · start 0 (top) · 0→1: 72% of frames over 20 ms for 4 s`.

## The rungs — fill rate first

The iPhone 18 readings put CPU at 4.6–5.5 ms of a 16.7 ms frame, so a phone
that struggles is GPU/fill-bound.

| Rung | name | Changes from the rung above | Live? |
|---|---|---|---|
| 0 | `high` | today's HIGH, 22 strays | — |
| 1 | `high` | pixel ratio cap 2 → 1.5 (44% fewer pixels) | live |
| 2 | `high` | postFx off, MSAA 0 | live; bloom fades out over 1.5 s |
| 3 | `low` | today's LOW exactly: shadow 1024, no normal maps, env 0.32, 14 strays | next walk |

Rung 3 is what every phone got before this branch, so adaptation can never
make a device worse than it was.

## The thresholds, and why

- **20 ms, more than half the frames, over 4 s.** The iPhone 18's *worst*
  frame on HIGH is 18 ms, so the target phone never trips. Over half above
  20 ms is a median under 50 fps — missing vsync most frames on 60 Hz. A
  4 s window is too long for a GC pause or shader compile to reach 50%.
- **5 s warm-up** at walk start (shader compiles, texture uploads), **1 s
  settle** after each step, so steps are at least 5 s apart.
- **Gaps over 250 ms are discarded**: a background tab, a debugger or a
  throttled automation pane is not a slow device, and never steps down.
- **At least 30 kept frames** before any decision. The 5 s warm-up starts at
  the walk's first frame, not before the (slow, synchronous) area build.
- **A frame-rate cap is not a slow device.** Low Power Mode, battery saver or
  a 30 Hz display pin every frame at ~33 ms. When the floor step comes due,
  the live steps are judged together: if the mean frame time is not at least
  10% (`ADAPT.minGain`) better than at the walk's first trigger, the floor is
  skipped, the start-of-walk memory is written back, and the walk stops
  adapting (live changes stay; nothing pops back). A walk that started on
  rung 2 has nothing to judge and steps as before.

## Desktop

The same adaptation runs on desktop Auto — it protects a weak laptop iGPU. A
healthy desktop never trips it (the owner's M2: worst frame 9.4 ms against
20 ms), so in practice nothing changes there.

## The thermal gap

There is no 5-minute reading. The governor runs for the whole walk, not just
its start, so a phone that heats up at minute 4 steps down then; it starts
lower next time, and the retry below lets a cooled phone climb back.

## Retry

At walk start, if the remembered rung is above 0, at least 5 walks have
started since the last step-down and `waitDays` (starting at 7) have passed,
the walk starts one rung higher. If it steps down again, `waitDays` doubles
(cap 56); if it runs a full judged 4 s window without stepping down, the
retry has held and `waitDays` resets to 7. A retry walk too short to judge
proves nothing, so the next walk retries the same rung. A `steppedAt` in the
future (clock change) is clamped to now. One rung at a time.

# Stream 4 round two — grass

Short swaying tufts on the Park and Cozy Neighborhood lawns
(`src/render/grass.js`, wired in `game/walk.js`, tests in `test/grass.test.js`).

## Technique

- **One `THREE.InstancedMesh`, one `MeshStandardMaterial`** (roughness 0.95,
  like the lawn's 'grass' preset), so it takes the same sun, hemisphere, IBL and
  fog as everything else. A tuft is 5 single-triangle blades written in both
  windings (10 triangles), 6–15 cm tall. Normals point up, so a tuft is lit like
  the lawn under it. Vertex colour darkens the root; each tuft gets a small
  brightness/warmth tint via `instanceColor`.
- **World lattice, view-following patch.** Tufts sit on a fixed world lattice,
  and every property (jitter, height, turn, tint, whether the cell grows a tuft
  at all) is a hash of the WORLD cell (`hashCell`, integer mixing). A slow value
  noise adds taller and shorter patches. The patch is centred `0.6 × radius` in
  front of the camera (`shadowfit.js`'s `fitCentre`), just past the cat. The CPU
  re-lays the instance buffer only when that centre crosses a ~2 m chunk
  (`snapCentre`), about once a second at a trot. The edge fade runs in the
  vertex shader against the live centre, so the circle glides while the tufts
  stay put. Tufts shrink to nothing between 55% and 100% of the radius, so
  there is no visible edge.
- **Sway in the vertex shader** (`onBeforeCompile`): tips only (local y²), a
  travelling wave across the lawn, scaled by `wind.js`'s own gust envelope and
  rain intensity (1.7). Reduced motion sets the amplitude to 0. Vertex sway is
  fine here, unlike `wind.js`'s rigid sway, because grass has no collider.
- **Coverage mask**, built once per walk (~4 ms). It is a 0.5 m grid over
  `bounds`: each cell is clear, blocked or an edge, and only edge cells pay
  for the exact per-tuft test. No grass outside bounds, in water
  (`waterClearance` + 0.35 m), on anything flat lying on the ground (paths,
  sidewalks, puddles; read off the scene as oriented strips and discs, so a
  diagonal park path masks its own strip), within colliders (+0.15 m) or on
  `boxes`. A masked tuft is never written to the buffer.

## Cost

| | main pass | shadow pass |
|---|---|---|
| draw calls | **1** | **0** |

The harness confirms this: `verify-places.html?area=park&grass` vs without is
119 vs 118 `renderer.info.render.calls`, with the shadow pass included.
`castShadow` is false, and `rig.js`'s caster sweep and `mergeprops.js` both
skip `userData.grass`. The mesh is added after `createContactShadows`,
`mergeStaticProps` and `assignShadowCasters`, so none of them ever sees it.
It is `frustumCulled = false` (instances move; it is always in view anyway)
and `receiveShadow = true` (a tuft under a tree is shaded; costs fragment work,
not draws).

| tier | radius | spacing | max tufts | max triangles |
|---|---|---|---|---|
| high (rungs 0–2) | 9 m | 0.30 m | 4,053 | 40,530 |
| low (rung 3) | 6 m | 0.42 m | 1,129 | 11,290 |

Drawn counts are lower: an open lawn draws ~3,500 on high, the park's
path/pond junction ~2,200, and the neighbourhood crossroads ~940. Knobs are
`grassRadius` / `grassSpacing` in `quality.js`. They are read at walk start, so
an adaptive step to rung 3 thins the grass on the next walk; the live steps
(1, 2) don't touch it.

## Not done

- No grass in the den's window garden, at Seaside or at the Docks.
- No GPU-side layout. The CPU re-lays a few thousand matrices about once a
  second; the matrices could move onto the GPU if a phone ever shows it in a
  profile.
- No interaction: the cat doesn't part the grass, and tufts don't flatten
  under it.
- Keep-outs are the collider circles, so a house has a bare apron of up to
  ~1.5 m in front of its long walls (its r 3.4 circle against a 5×4 m body).
- No fps reading. The owner's desktop and iPhone 18 readings are still the
  check that matters.

# Stream 4 round two — the Docks (2026-10-31)

Found by looking at each area from the real spawn camera (`catcam.cameraOffset`,
looking toward -z), not from the harness's flattering views.

- **Quays, bridge roads and pavements are flagstone.** They were the shared
  untextured path beige `0xcbb8a0`, the brightest flat surface in the darkest
  palette, and the cat spawns on one. New `flagstone` tile (2.4 m, two courses
  of large slabs, mortar joints, sparse weathering flecks) and preset
  (roughness 0.88, normalScale 0.3). Quay `0x8c877e`, pavement `0x9c978d`.
  `path()` and `sidewalk()` take a `color` option. **0 draw calls.**
- **wetStone roughness 0.42 → 0.55.** The spawn camera faces the 19.1° sun;
  at 0.42 the quay's specular lobe crossed the bloom threshold (1.1) and the
  high tier smeared it into a white haze over roughly a fifth of the first
  frame. The harness never showed it (no bloom, different camera). At 0.55 a
  soft wet gradient remains. **0 draw calls.**
- **The skyline has windows.** `horizonBand({ kind: 'skyline' })` now gives
  each block one of five facade tones and a grid of window quads on its
  inward face, as vertex colours on the same merged mesh. About 1,300 extra
  triangles; hills bands are unchanged. **0 draw calls.**

Tried and dropped: a stronger sand drift tint at Seaside made no visible
difference — the beach is pale enough that ACES washes the streaks out. Seaside's
empty pale beach is the next candidate (a darker wet-sand band at the
waterline, or dune grass from `render/grass.js`).

## Stream 4 round three — the Seaside (2026-10-31)

Looked at from the cat's camera, the beach was a near-white plain, the sand met
the sea in a ruler-straight line, and the cliff was one flat tan wall. Four
changes, all in `world/seaside.js` and `render/grass.js`:

- **Warmer sand.** `BEACH` 0xe0d0a0 → 0xdcc28e (ground and `groundBounce`).
  An authored colour change, not texture compensation; the "sand is not
  colour-compensated" rule still holds. **0 draw calls.**
- **Wet sand at the waterline.** One vertex-coloured plane from under the
  boardwalk (x 21.8) to 0.4 m under the sea (x 25.4), with a wavy wet edge.
  The tint has to be strong (~0.35): the beach sits so far up ACES's shoulder
  that a 0.7 multiplier measured 207 against dry sand's 221 on screen
  (invisible) and 0.5 only 191. At 0.35 the damp sand lands near 165.
  Roughness 0.8 — damp, not glossy. **+1 draw call, 0 shadow.**
- **Cliff strata.** The bluff and the overlook get vertex-colour rock bands,
  a darker damp foot, and an uneven top edge. Only top vertices move, and only
  in y, so the seaward face and its colliders at z -37 are unchanged.
  **0 draw calls.**
- **Dune grass.** `render/grass.js` now has styles (`GRASS_STYLES`): the
  lawns keep the old turf, Seaside gets marram — 12–30 cm, khaki-green, in
  ~2.6 m clumps with bare sand between, a stronger sway, and a 1.5× reach
  because clumps on open sand are seen from further away. It grows only on
  the back beach (none east of x 4) and along the cliff foot, so the spawn,
  the boardwalk and the wet sand stay bare (the cliff-foot strip stops at
  x 8–14). Same mesh, mask and shader as the lawn. Because it is tall enough
  to bury a fish, walk.js now also keeps grass 0.5 m clear of ground-level
  collectibles, golden mice and scenic spots (`groundFinds`).
  **+1 draw call, 0 shadow.** Instance capacity on high roughly doubles
  (4k → 8k tufts, ~82k triangles) because of the 1.5× reach; only the
  clumps are drawn.

Review fixes: grass was growing on the wet sand at the south end (the
cliff-foot zone ignored x) and around fish-3 and the overlook; the wet band
moved from y 0.012 to 0.008 so it sits clearly under the contact-shadow
decals (0.015); the lawn's tufts are now pinned to golden values from the
pre-style code.

Verified in game: a Seaside walk on this Mac ran at 119 fps with no console
errors. Not verified: the iPhone, and walking the cat into the grass in game
(the automated browser can't send held keys); the dune grass was checked in
`verify-places.html?area=seaside&grass`.

The beach's brightness problem is the lighting, not the sand: anything pale
there is compressed by the tone curve. Lowering the beach's exposure (sun or
hemisphere strength for this area) would be the bigger lever, and it would
change every prop on the beach, so it was left alone.

## Stream 4 round four — paw prints (2026-10-31)

The cat leaves a trail of little paws that fades away (`render/pawprints.js`).
Prints alternate left and right of the line the cat walks, one per stride of
real travel (0.24–0.6 m, longer at a trot), toes pointing the way it went with
a slight outward splay. Only while the paws are on the ground: not perched,
not mid-pounce (`player.hopY`), not swimming, and nothing across a teleport.

- **Surfaces.** A small per-area rule plus the ground strips read off the
  scene (a strip named `path` is a path; any other flat strip is a sidewalk or
  the boardwalk). Seaside: deep, darker prints in dry sand, darker still and
  crisp on the wet band (`wetness() >= 0.3`), none on the boardwalk. Docks:
  damp prints on the cobbles, fainter on the flagstone quays and pavements,
  drying 30% quicker. Park and Neighbourhood: faint dusty prints on gravel
  paths only — none on the lawn or the sidewalks. Never in water, on a deck
  over water (pier, bridges) or in a puddle. The den gets the no-op stub.
- **One draw call.** One InstancedMesh, a 2-triangle quad per print with the
  paw (heel pad + four toe beans) drawn as a distance field in the fragment
  shader — no texture. Fade is on the GPU from per-slot laid-at time and
  sequence number, so the CPU writes one slot per print and two uniforms a
  frame. **+1 main-pass draw, 0 shadow** (castShadow false; `userData.pawPrints`
  is skipped by rig.js and mergeprops.js). Measured +1 total calls in
  `verify-places.html`. Transparent, depthWrite off, polygonOffset, at
  y 0.012: over the wet sand (0.008) and paths (0.01), under the contact
  shadows (0.015, which draw after it: renderOrder -2 vs -1).
- **Ring.** Fixed capacity; a new print overwrites the oldest, and the last six
  slots before reuse fade out first, so a sprint never makes a print pop.
- **Tiers** (`pawPrints`, `pawFade` in quality.js): rungs 0–2 keep 96 prints
  for 9 s; the low rung 48 prints for 6 s. Life is scaled per surface (stone
  0.7, gravel 0.85). Reduced motion needs nothing: prints don't move.
- **Local only.** No wire events and no seeded game RNG (per-print jitter is
  a hash of the print's own sequence number). Co-walkers' cats don't leave
  prints on my screen — a possible follow-up.

Looked at in `verify-places.html?area=<id>&paws[=low]` (a hand-placed trail)
on this Mac: sand, wet sand, Docks cobbles and quays, park gravel. At 12 cm
the prints read as dots from the game camera, so they are 17 cm; cobble
prints at 0.32 alpha vanished into the setts, so they are 0.6. The pale rim
round dry-sand prints barely shows under ACES. Not verified: a real walk in
game (the automated browser can't hold keys), the iPhone, dusk, and rain.
## Stream 4 round four — clouds (2026-10-31)

**What.** `render/clouds.js`: soft low-poly clouds drifting across the
Neighborhood, Park, Seaside and Docks skies (the den gets a no-op stub).
Each cloud is 3–6 squashed icosahedron puffs with a flat underside. The
vertex colours hold the shading (a baked facet light and how high up the puff
each face sits); the shader turns that into near-white tops over a darker
underside, using the live fog colour, so the undersides still read against
the Seaside's near-white horizon and the clouds re-tint themselves when a
shower clears. At dusk the lit side goes warm and dim (peach mixed into the
dusk horizon) and the underside drops below the horizon colour, so nothing
glows white against a purple sky. Fog is off for the clouds (they sit past
the fog's 110–130 m) and a gentler manual haze pulls the far ones toward the
horizon instead. Not tone-mapped, so they match the sky background, which
isn't tone-mapped either.

**Where.** Centred on the camera every frame, like a sky that is kilometres
away: no parallax, and every vertex stays inside the 300 m far plane wherever
the cat walks. Centres sit within 220 m of the camera, never closer than
55 m across the wind (straight overhead is out of view anyway). Bases are at
least 30 m up, raised per area until a cloud at the disc's edge clears the
horizon band's crest seen from the area centre (only the Docks' skyline is
tall enough to lift the floor). They drift along the lawn's wind direction (0.8, 0.6) at
0.6–1.1 m/s, wrap from the downwind end of their chord to the upwind end, and
dissolve and re-grow over the last 45 m of each end rather than popping.
Reduced motion: they hold still. Layout comes from a hash of the area id on
its own mulberry32 stream; walkRng is untouched and nothing goes on the wire.

**Cost.** One InstancedMesh, one material: **+1 main-pass draw call, 0
shadow-pass draws** (`castShadow` false; rig.js and mergeprops.js skip
`userData.clouds`). Measured in `verify-places.html?clouds`: 423 → 424
calls. About 50 instances × 80 triangles on high.

**Tiers.** `cloudCount` in quality.js: 10 on rungs 0–2, 6 on the low rung.
Same single draw call either way; 0 would turn them off.

**Replaced.** `skylife.js` used to drift six clouds of its own (2–3 separate
lit meshes each, overhead at y 22–28, up to ~18 draw calls whenever they were
in frame). Those are gone and skylife.js is birds only; its `advanceClouds`
helper and test went with them.

**Not verified.** Only checked in `verify-places.html?clouds[=low][&dusk]`
from low cameras (y ~2) in all four areas, day and dusk; not in a real walk,
not on the iPhone, not under rain or sunset weather. At the default chase-cam
pitch the frame only shows sky up to ~7° above level (render/sky.js), and most
clouds sit at 8–20°, so they show when the camera tilts up or sits low rather
than in every default frame.
## Stream 4 round four — ambient life (2026-10-31)

Small, gentle motion, one effect per area, all in `render/ambient.js`:

- **Park:** leaves let go from under the real tree canopies (read off the
  scene: `builder.tree()` now tags its Group with `userData.canopy`), swing
  and tumble down in ~10 s on the same wind as the grass (`WIND_DIR`, wind.js's
  gust envelope, 1.7× in rain), rest on the lawn for a few seconds, then fade.
  Only trees within 26 m of the view drop leaves. Mostly yellow-greens with
  some gold and rust.
- **Seaside:** soft mist puffs rise and thin along the waterline (the sea
  record's `minX`, x 25), within 16 m along the shore of the view.
  No gull shadow: a Points sprite always faces the camera, so a "shadow" on
  the sand would stand upright from the cat's low camera. It would need a
  second, ground-flat mesh, and that is a second draw.
- **Docks:** at dusk walks only (`duskActive`), three moths circle each of the
  8 lamp posts nearest the view (`builder.lampPost()` tags `userData.lampGlobeY`),
  with a slow wing flutter. By day, a dozen faint sunlit motes over the canal
  (additive, barely there).
- **Neighbourhood:** a dozen dandelion seeds riding the breeze, 0.4–1.8 m up.
- **Den:** nothing.

**Cost: +1 main-pass draw call per outdoor area, 0 shadow-pass draws.** One
`THREE.Points` with a canvas sprite and a patched `PointsMaterial` (per-point
size, rotation and squash, so leaves tumble and moths flap without geometry).
CPU-simulated into fixed buffers allocated at walk start; no per-frame
allocation. Created after the caster sweep and the merge, beside grass, and
flagged `userData.ambient` so rig.js and mergeprops.js skip it.

**Tiers:** `ambientScale` on the ladder — 1 on rungs 0–2 (40 leaves, 26 mist
puffs, 24 moths, 14 motes, 12 seeds), 0.5 on the low rung. Still one draw; the
low rung halves the soft-sprite overdraw (the mist is the big one).

**Kids' comfort:** nothing is drawn within 1.5 m of the camera (plus the
sprite's half-size, faded over the next 0.8 m), near the cat, or on the line
of sight from the camera to the cat. **Reduced motion:** no mesh at all — a
frozen leaf in mid-air reads as a glitch, and every effect here is motion.

Purely local: its own PRNG, never `walkRng`, no wire events.

Checked in `verify-places.html?area=…&ambient[=low]` (and `&dusk` for the
moths; `window.__ambientStep(seconds)` runs the simulation) from cat-height
cameras. Not verified: in a real walk, on the iPhone, in rain, or the
fill-rate cost of the mist on the low rung.

### Review fixes (2026-10-31)

- **No per-frame allocation:** `cloudPlace(cloud, t, out)` and the trail's
  `step(…, out)` fill a scratch object when given one (clouds.js and
  pawprints.js pass theirs); `paws.update` returns its reused print; main.js
  mutates one `pawState` instead of building `{ x, z, grounded }` per frame;
  ambient.js flags its four attributes directly instead of looping a fresh
  array of names.
- **Leaves never hide a find:** `createAmbient` takes walk.js's
  `grassKeepOut` as `keepOut`. A leaf coming down inside a circle (padded
  0.15 m) fades out over its last 0.8 m of fall and goes back to its tree
  instead of resting there.
- **Weather:** `createAmbient` takes the weather api and reads it live. Rain
  dims the points to ~65% (`RAIN_TINT`) and hides the motes and dandelion
  fluff; both ease back over 2 s when the shower stops (`isRaining()`). A
  sunset walk warm-dims them to ~75% (`SUNSET_TINT`). Clouds get a `sunset`
  palette (cream-peach tops a step above the 0xf8c890 horizon, mauve
  undersides): the fog tint alone left them on the day palette, whose tops
  are near-white. Rain clouds still use the day palette over the grey fog.
- **Paw prints on dry sand:** `sand` 0x7a6440 @ 0.85 → 0x4e3d2a @ 1 (rim
  kept). In `verify-places.html?area=seaside&paws`, the nearest pad's
  darkening went from 47 to 92 of the sand's 209 (sRGB luma). `wetSand`
  alpha 0.62 → 0.75 (74 → 90 of 184 on the wet band).
- **Birds:** main.js's slow-mo comment no longer claims co-walk birds and
  clouds are identical (clouds left skylife.js; bird timers run on each
  client's own dt). New `test/skylife.test.js`.

## Corner map (2026-10-31)

A coin-sized disc in the top-right of the walk screen (150 px on desktop,
110 px in touch mode), drawn on its own 2D `<canvas>` by
`src/ui/minimap.js`. The area caption sits under it and the roster moves
below that.

- **Shows:** the ground, area edge, water, path strips, big colliders as
  blocks, the player's cat, co-walkers as dots in their coat colour, the
  next race ring and the one after it (dimmed), the race pad, the quest
  target, and scenic spots (filled once visited). Markers off the disc are
  pinned to its rim.
- **Never shows:** golden mice, secrets, gifts, collectibles, carryables,
  critters or strays. `buildMapLayer` and `mapMarkers` only name the keys
  above, so nothing hidden can leak in.
- **Modes:** North up (default) or Turns with me. On a touch screen a tap
  on the map flips it; Settings → Map sets it anywhere (on desktop the map
  only shows while the pointer is locked, so a click goes to the game). It
  is kept per save (`progression.state.mapMode`).
- **Hidden:** while paused or at the Ready? card, in the viewfinder, and in
  the den (no map there).
- **Layout around it:** the points/rank row and the race/quest objective
  pill are centred in the band left of the map. On a phone (≤480 px) the
  objective drops below the map and its caption, and a long rank title ends
  in an ellipsis rather than wrapping. Left-handed, the pause button sits
  just left of the map. In the den the caption is a plain pill at the right
  edge, with the roster back under it.
- **Cost:** 0 draw calls. It adds nothing to the Three.js scene, and it
  repaints at most 30 times a second, only when something on it changed.

## Camera zoom (2026-10-31)

The 11-year-old playtester asked for "a zoom in/out feature that is easier
to use". There was no camera zoom at all, so the kids were pinch-zooming the
browser page. `src/camzoom.js` adds four fixed steps; the camera eases
between them in about 0.25 s, and jumps there under Reduced motion.

| Step | Distance | Height | |
|---|---|---|---|
| 0 | 3.0 m | 1.5 m | close |
| 1 | 4.5 m | 2.2 m | **default: today's camera, unchanged** |
| 2 | 7.0 m | 3.8 m | |
| 3 | 11.0 m | 6.5 m | far: height grows faster, so the view tilts down over the area |

- **Controls.** Touch: a round + / − pair (44 px) centred under the action
  cluster, mirrored with it in left-handed mode, inside the orbit area in both
  modes; and a two-finger pinch on the orbit area (one step per 30% change in
  finger spread). A second finger within 150 ms of a still first finger is
  its pinch partner wherever it lands, so a mid-screen pinch that straddles
  the joystick zone never walks the cat; after a pinch the remaining finger
  does not orbit until both lift. Desktop: the wheel, one step per gesture
  (a gesture ends after a 200 ms pause, so a trackpad flick with its momentum
  tail is exactly one step and slow notches step once each), and `+`/`=`, `-`
  matched by character then key position (non-US layouts, numpad), no key
  repeat. All only during an engaged walk. The den's "no room" toast is
  throttled to one per 2.5 s. The HUD and pause-card hints list them.
- **Remembered per device** in `settings.cameraZoom` (0–3, junk → 1), never
  the save. Purely local: no wire events, no `walkRng`.
- **Page zoom.** `#game` and `.touch-ui` were already `touch-action: none`
  and the touch layer already cancels its touches; the touch layer now also
  cancels Safari's `gesturestart`/`gesturechange`, so a pinch over the game
  zooms the camera, not the page. Those are cancelled on all of `#hud`, so a
  pinch starting on the corner map does not zoom the page either. Wheel/ctrl+wheel and ctrl +/- are only
  cancelled during an engaged walk; menus and the home base keep browser zoom.
- **Safety.** There was no camera collision before. Beyond the default
  distance only (steps 0–1 are byte-identical to the old camera): the camera
  is held no farther outside the area bounds than the default camera could
  already go (bounds + 4.5 m); if it lands inside a big collider footprint
  (r ≥ 1.9: houses, warehouses, billboards, cliffs, containers — colliders
  have no heights, so footprints are the only test): the whole cat→camera
  segment is tested, and the camera stops just before the first footprint it
  would enter, never closer than 4.5 m. A 1.5 m soft band outside each
  footprint ramps the limit down to the tangent point so it has no jump
  there; player.js then eases it (in at ≤ 12 m/s, out at ≤ 6 m/s after a
  0.3 s hold, so grazing an edge does not pump). A house closer than 4.5 m
  behind the cat still leaves the camera inside it, as the default always
  did. Camera y is floored at 0.5 m. **The den caps at step 1**: the
  default camera already reaches its walls, so zooming out indoors only shows
  a toast.
- **Draw cost** (Neighbourhood spawn, high tier, desktop browser at 375×812
  phone emulation, `?perf`): default 985–1004 draws (shadow 399–429, scene
  542–591); far 962–993 (shadow 330–372, scene 607–620). The shadow box is
  fitted ahead of the camera, so moving the camera back trades shadow draws
  for scene draws and the total stays flat. The shadow box still covers the
  cat and the near street at the far step (cat, car and lamp-post shadows
  present in the screenshot); objects at the far end of the street, which are
  only on screen at the far step, sit near its edge.

## Not verified

- On a real iPhone/iPad: pinch feel, that Safari no longer page-zooms over the
  game, and frame time at the far step (the fps in the automated pane is
  meaningless: it runs as a background page).
- Desktop wheel and keys live: the automated browser cannot take pointer lock,
  so a walk never becomes engaged there. The handlers are unit-tested
  (`test/camzoom.test.js`).
- The den cap and the building pull-in in the running game (unit-tested only).
- Footprints have no height, so the far camera is pulled in for a house even
  where it would have seen over the roof.

## The Woods — budget and live check (2026-10-31)

The Woods is held to the Cozy Neighborhood's ceilings (plan Global
Constraints). Measured off `build(scene)` the way `test/budget.test.js` does:

| area | meshes built | casters built | triangles | meshes merged | casters merged |
|---|---|---|---|---|---|
| woods | **172** / 450 | **152** / 380 | 44,462 / 60,000 | **170** / 260 | **150** / 205 |
| river | **159** / 450 | **133** / 380 | 45,344 / 60,000 | **157** / 260 | **131** / 205 |
| neighborhood (for scale) | 381 | 314 | 25,899 | 218 | 169 |

Merging folds almost nothing away here (172 → 170): the trees, rocks and
logs are already one or two meshes each, and the ferns and brambles are one
bed mesh apiece. The Woods spends triangles (low-poly canopies) rather than
meshes, which is the trade this budget wants.

**In-game draw calls.** `?perf`, tier forced to high (the Auto setting
stepped down on its own while the pane was in the background, so it was
pinned for these), 375×812 phone emulation with touch, one unseeded walk per
row. "Ready" is the first frame of the walk from the spawn; "spin" orbits the
camera about ten steps of ~45° on the spawn and gives the lowest and highest
frame.

| area | Ready (3 walks) | spin, min–max |
|---|---|---|
| **woods** | 478, 446, 414 | 349–833 |
| neighborhood | 898, 962, 956 | 216–1004 |
| seaside | 934, 932, 844 | 276–931 |
| docks | 370, 247, 348 | 329–827 |

The Woods is no higher than the Neighborhood on the same tier, and sits with
the Docks at the bottom of the four even with four water bodies. The spawn
faces north into open wood, so its Ready frame is cheap (scene ~95–140,
shadow ~260–370); the most expensive views look west or south across the
whole wood. Walking the cat around (pane at its own 499×727, touch, high)
the highest frame seen was 946 (shadow 510, scene 422) by the great oak
looking west, and 834–897 on the glade path looking south over the river.
Rows from different walks are not comparable to the call (see "A
measurement caveat worth carrying"): strays, critters and finds re-roll.

**Checked live** (a throwaway save on its own origin, 2 Neighborhood walks):

- Home screen, Clan Edition, at 1280×720 and 375×812: six regions, the
  lake, the island, the river, the pond, the paths and the bridge; the Woods
  says "Tap to explore". A real click on the Woods `<g>` selects it (save
  `area: 'woods'`, the dock says "Walking in The Woods").
- The Woods' tap area does not bleed into the Moor or the River: of 2,696
  points sampled on a 3 px grid that hit the Woods' target, every one lies
  inside the Woods' own land shape and under no other region's.
- Flip to Legacy on the title: four cards (Cozy Neighborhood, City Park,
  Seaside, The Old Docks), no Woods, the dock says Cozy Neighborhood, the
  save keeps `area: 'woods'`; flip back and the Woods is selected again.
- A walk in the Woods (the automated pane can now drive the touch joystick
  and the orbit drag with synthetic `TouchEvent`s, so the cat really walked):
  the corner map shows the paths, the river corner and the east edge; the
  east horizon carries the skyline blocks; from the glade the lake opens out
  to the north-west with the island's tree on it.
- **The log bridge** reads as a crossing from the glade path: the log's
  flat top runs straight on from the path end, and the cat crossed it both
  ways. **The stepping stones** read as one stone causeway across
  river-north, and the cat crossed them, but only once lined up: the deck
  strip is 1 m wide while the stones draw about 1.6 m wide, so a cat at
  z -27.86 standing on the stones' visible edge was stopped by the water.
  At z -28.7 it walked straight over.
- **gm-woods-1** is not hidden by the canopy. From the chase camera it shows
  on its limb, under the canopy's lower edge, from the north (5 m and 2.4 m),
  the south (6 m and 2.4 m) and the west. From the east it is behind the
  trunk, because the limb grows west; that is the trunk, not the canopy.
- **Ferns and brambles in shade.** They take no shadow, but they don't look
  wrong: a fern lying across a canopy shadow's edge is one even mid-green,
  close to the shaded grass and a little darker than the lit grass, so it
  reads as a plant rather than glowing. The brambles are dark enough that the
  missing shadow doesn't show.
- `verify-places.html?area=woods` builds (`__calls` 104 at the spawn view, no
  console errors). The card picture `public/places/woods.jpg` is the spawn
  view at 640×360 (`44,2.9,16.5 → 44,0.4,4`, now `VIEWS.woods`), and the
  home dock shows it.
- No console errors anywhere above.

**Seen, not fixed:**

- On the glade path looking south (cat at -4.5, -18.8) the chase camera sits
  inside an oak's canopy and half the screen is a flat green wall. Only
  houses pull the camera in, and the Woods is the first area dense with
  trees right beside a path.
- In Legacy with `area: 'woods'` the dock says Cozy Neighborhood but no card
  is marked "today's walk": the Cozy Neighborhood card says "tap to walk
  here".
- Looking north-west over the lake toward the sun, the water's glare blooms
  into a broad white patch on the high tier.

**Not checked:** a real iPhone (frame time, thermal), desktop with pointer
lock, the low tier, and walking every POI.

**Fixed after the branch review (2026-10-31):**

- The canopy over the glade path: a tree now keeps 1.5 + 1.6 × scale + 0.5 m
  from a path's centreline (the path's half-width, its canopy's reach, half a
  metre), not a flat 3 m. Three trees go: 69 in all, not 72. The Woods now
  builds 172 meshes / 152 casters / 44,462 triangles, 170 / 150 merged.
  Camera-side canopy hiding is still deferred.
- The stepping stones: fourteen rounder stones (16 sides) in a straight line,
  and the deck widened from ±0.5 m to ±0.75 m. The stones leave the water at
  about ±0.83 m, and the deck stays inside what the raycast test proves dry.
- Legacy with the Woods chosen marks the Cozy Neighborhood card "today's
  walk" (checked live on a throwaway save, with the page title and splash
  reading Legacy Edition).

## The River and Marshes — budget and live check (2026-10-31)

Held to the same ceilings as the Woods. Built, the River is 159 meshes, 133
casters and 45,344 triangles; merged it is 157 meshes and 131 casters (see
the table in the Woods' entry above). It has 24 willows, 14 alders, 9 pines,
393 reed clumps (215 of them in the west reedbed) and 25 lily pads. Like the
Woods it spends triangles, not meshes: reeds and trees are cheap in draws.

**In-game draw calls.** Spawn, Ready screen, HIGH tier, desktop 1024x768 css
at 2x, one walk each (so the rows are only roughly comparable; strays and
finds re-roll):

| area | draws | shadow | scene | triangles |
|---|---|---|---|---|
| river | 740 | 302 | 424 | 144,618 |
| woods | 486 | 279 | 173 | 96,378 |
| neighborhood | 1,347 | 333 | 1,000 | 163,562 |

The River sits between the Woods and the Neighborhood. Its extra scene
draws over the Woods (424 against 173) are not the reeds, pads and pools:
those are about 5 draws, one each. After merging, the River's static scene is
157 draws against the Woods' 170. The likely cause is the spawn view (not
measured per object). Both cats start facing north; the Woods' spawn is
(44, 12), so the camera looks across about 62 m of map, while the River's is
(44, 40) and looks up the whole 90 m. The HIGH tier scatters 22 strays over
+/-35 m, each about 25 meshes, so roughly 10 are in frame at the River's spawn
against about 4 at the Woods' (about 150 draws more), plus more scenery. That
fits the shadow pass barely differing (302 against 279) and the narrow phone
screen dropping the River's scene draws to 144.
On a 750x1624 phone portrait view the River spawn was 444 draws (shadow 286,
scene 144, 106,796 triangles). These are the desktop and emulated-phone
numbers only; the iPhone reading is still the owner's step.

**Checked live.** The map card is locked ("opens after 2 walks in The
Woods"), becomes "Tap to explore" after two Woods walks, and tapping it
unlocks and selects it for 0 points; phone map too. Legacy shows four cards
and no River, with the Cozy Neighborhood marked "today's walk", and flips
back. A River walk on phone touch: the corner map shows path and edge, the
spawn view is the long path with willows ahead, no console errors. The Old
Willow's golden mouse is in plain sight from the chase camera (a marker
stood in, as the harness doesn't draw mice). The 14 stepping stones read as
one ford about 1.7 m wide. The chase camera never ended up inside a canopy
on the bank, long or pond paths. The east edge shows the pond and the river
leaving east, matching the Woods' west edge. The card picture is the pool-1
view (lily pads, reeds, willows); the bank-path view was mostly bare grass.

**Not checked.** Holding keys to walk (the automated browser can't), the
reedbed from inside on foot, the corner map's waters and decks (only the path
and edge near the spawn were seen), the horizon's side tints by eye, iPhone fps and thermals, dusk and rain audio by
ear. The golden-mice counter reads "0 of 18" in both editions: Legacy counts
mice it can't reach, a pattern left over from the Woods.

**Open items, left for the owner.**
- The west reedbed reads thin live: scattered single stalks over grass, not
  a bed (215 clumps over about 930 m2). More or denser clumps would cost
  little, but it is a taste call, so it is not changed here.
- The pools read silver from above because they reflect the sky. Flat from
  the scenic and card angles; not seen from on foot.
- The island bridge reads only as a thin line from the lake-island scenic.

## The Moor — budget and live check (2026-10-31)

Held to the same ceilings as the Woods and the River. Measured off
`build(scene)` the way `test/budget.test.js` does, re-measured for this entry:

| area | meshes built | casters built | triangles | meshes merged | casters merged |
|---|---|---|---|---|---|
| moor | **76** / 450 | **50** / 380 | 40,288 / 60,000 | **75** / 260 | **49** / 205 |
| woods | 172 | 152 | 44,462 | 170 | 150 |
| river | 159 | 133 | 45,344 | 157 | 131 |

The comment in `test/budget.test.js` says 40,282 triangles; the build now
gives 40,288 (the last lake-lip fix moved a few). It has 10 thorns, 7 pines,
398 heather cushions, 19 gorse clumps and 127 reed clumps. The Moor is the
cheapest of the three in meshes and casters: the heather, gorse and reeds are
one bed mesh each, and there are only 17 trees against the Woods' 69.

**In-game draw calls.** `?perf`, HIGH tier pinned in Settings, the spawn's
Ready frame, one walk per reading (strays and finds re-roll, so rows are only
roughly comparable). Desktop is 1024x768 css at 2x, as the River's row was:

| area | draws | shadow | scene | triangles |
|---|---|---|---|---|
| **moor** | 701, 697 | 297, 290 | 390, 393 | 135,580, 132,782 |
| woods | 451 | 271 | 166 | 93,580 |
| neighborhood | 1,377 | 479 | 884 | 168,586 |
| river (its entry) | 740 | 302 | 424 | 144,618 |

On the phone portrait view (375x812 at 2x, touch) the Moor spawn was 376
draws (shadow 242, scene 120, 86,852 triangles), against the River's 444.
The Moor sits with the River, between the Woods and the Neighborhood, for the
same reason the River does: its spawn (46, 44) looks up the long north path
across most of the 100 m map, so more of the 22 strays are in frame. These are
desktop and emulated-phone numbers; the iPhone reading is still the owner's.

**Checked live** (a throwaway save on the worktree's own port, 2 Woods walks;
the touch joystick and orbit driven with synthetic `TouchEvent`s, and the cat
moved between spots by setting its position, then walking):

- Home screen, Clan Edition, at 1280x720 and 375x812: the Moor is in colour
  and says "Tap to explore"; a real tap unlocks and selects it (save
  `area: 'moor'`, the region says "today's walk", the dock says "Walking in
  The Moor" and, once `moor.jpg` was in place, shows it).
- The Moor's tap area does not bleed: with another region selected, all
  2,537 points on a 3 px grid that hit the Moor's target lie inside the Moor's
  land shape and under no other tappable region (13 also lie under the Pines'
  painted land where the two drawn shapes overlap; the Pines is not
  tappable). While the Moor is selected its 9 px outline catches a thin rim
  just outside the shape, as any selected region's does.
- Legacy: four cards (Cozy Neighborhood, City Park, Seaside, The Old Docks),
  no map, no Moor; with `area: 'moor'` the dock says Cozy Neighborhood and the
  Cozy Neighborhood card says "today's walk"; flipping back selects the Moor
  again.
- **The stepping stones**, walked on their visible edges: at z 29.3 and at
  z 30.7, west and east, the cat crossed the whole river (x 25.5 to 15 and
  back) without a stop. A control at z 28.6, off the deck, stopped at x 23.35
  (the water's edge plus the cat's radius). **The log**: crossed north and
  south at x 4, and at its edges x 3.4 and x 4.6; a control at x 2.5 stopped at
  z 1.35. The stones read as one grey causeway.
- **No camera in a canopy.** Every path, sampled every 0.5 m on its centreline
  and 1.2 m either side, looking along it both ways, at the close, default and
  far zoom steps (7,380 camera spots, placed exactly where `cameraOffset` puts
  them): no camera inside any mesh taller than 1.5 m, and no tree or tor within
  6 m of any of them. The closest call is a POI ring: at the close zoom step the
  camera passes through the (40, 8) ring beside the north path, as POI rings do
  everywhere.
- **gm-moor-2** is in plain sight on its limb from the chase camera: from
  beside the boulder and from the north, south and west of the old hawthorn,
  the first thing a ray from the camera to the mouse meets is the mouse. From
  the east it is behind the trunk (the limb grows west), as `gm-woods-1` is.
  **gm-moor-1** shows on the High Tor's top from the north, south, east, west
  and the boulder side, small but clear from 5 m.
- **The rabbits** at the warren: walking in from (26, -21), both rabbits
  bolted for the burrow at (37.34, -30.97) and vanished into it. The journal
  counts them as `rabbit` ("Moor Rabbit").
- **The edges**: from the `moor-lake` scenic the lake shore runs along z 8,
  with the island and its tree out on the lake and the island bridge a thin
  line off its north-west side; the dark pines stand on the west strip; the
  river leaves south at x 18-23 into the Woods' green horizon; the north path
  meets the south edge at x 46.
- `verify-places.html?area=moor` builds (`__calls` 62 at the card view, no
  console errors). The first `VIEWS.moor` (high path, `24,3.0,-22`) was half sky
  over bare grass, so the card picture is now taken over the river bend from
  its north-east bank (`24,4.5,-14 → 4,0.3,6`): the log bridge, the bridge
  path, heather and thorns, the lake and the island's tree beyond.
- No console errors from the game anywhere above.

**Seen, not fixed:**

- **Shore foam over open water where waters overlap.** Each water paints foam
  along whole edges, so at the overlaps a bank's foam runs on across water.
  At the bend, river-west's `maxZ` bank (z 1) shows as a pale line straight
  across river-south between x 18 and 23, visible from the chase camera on the
  east bank. At the mouth, river-mouth's banks run on 2 m past the lake shore
  (z 8 to 10) and its surface ends in a straight seam in the open lake at
  z 10. The Woods and the River use the same per-edge `shores`, so they may
  show the same at their own bends.
- In the place-picture harness (no fog), the horizon hills cut away over the
  lake leave a stair-stepped white notch on the skyline to the west and
  north-west of the island. In the walk the haze softened it.

**Not checked:** the wind and birdsong by ear; the corner map's waters, decks
and tors as a whole (only the part round the cat was seen); the horizon's
side tints by eye beyond the views above; holding keys on desktop (the
automated browser can't lock the pointer); iPhone fps and thermals; dusk and
rain.

## The Pines and Swamp, with the island — budget and live check (2026-11-01)

The island and its bridge are part of the Pines walk, so this one entry covers
the finished Pines. Held to the Cozy Neighborhood's ceilings, like the Woods,
the River and the Moor. Measured off `build(scene)` the way
`test/budget.test.js` does, re-measured for this entry:

| pines | meshes built | casters built | triangles | meshes merged | casters merged |
|---|---|---|---|---|---|
| without island content (db8777d) | 130 | 96 | 43,668 | 128 | 94 |
| island as ground, bridge walkable (3078eab) | 127 | 93 | 43,248 | 125 | 91 |
| with the island (25f5200) | 138 | 101 | 45,180 | 135 | 98 |
| **after the review (now)** | **112** / 450 | **75** / 380 | **44,642** / 60,000 | **109** / 260 | **72** / 205 |

The island content (the Old Ash, the Meeting Ring as one merged mesh, the
Watch Rock and its step, the boulder, the bushes, the puddle, the reeds) adds
11 meshes, 8 casters and 1,932 triangles over 3078eab. The scenery at
25f5200: 40 near (swaying) pines and 86 in the merged still stand, 133 ferns,
45 toadstool clusters, 160 reed clumps (141 on the Pines' shores and bogs, 19
round the island) and 20 lily pads. After the review's canopy fix (below):
27 near pines and 83 in the stand, 136 ferns, 47 toadstool clusters, the same
160 reeds and 20 pads; 129 colliders (one per pine, 110, plus 19). Thirteen
fewer swaying pines is 26 fewer meshes and casters.

**In-game draw calls.** `?perf`, HIGH tier pinned in Settings, the same
method as the Moor's: desktop is 1024x768 css at 2x, phone portrait is
375x812 at 2x with touch. Strays (22) and finds re-roll each walk, so rows are
only roughly comparable. "Island" is the cat on the island's landing looking
back up the bridge to the shore; "truce path" is the cat on the truce path's
middle leg, looking along it toward the bridge.

| area | view | desktop draws (shadow / scene) | desktop triangles | phone draws |
|---|---|---|---|---|
| **pines** | spawn | 824-870 (213-310 / 527-609) | 190,400-201,418 | 451-479 |
| **pines** | island, looking back up the bridge | 799, 841, 940 (352-423 / 433-503) | 183,656-209,400 | 628, 646 |
| **pines** | truce path, toward the bridge | 729, 843 (367-431 / 348-398) | 175,290-193,062 | 640 |
| moor | spawn (its entry) | 701, 697 | 135,580 | 376 |
| river | spawn (its entry) | 740 | 144,618 | 444 |

The Pines is the busiest of the clan territories: 85 to 130 draws over the
River at the spawn on desktop, and a little over the River on the phone. Most
of the extra is the pines themselves (40 swaying pines are two meshes each,
plus their shadows) and the spawn's long view down the truce path past most
of the map. It is still well under the Neighborhood's 1,377. These are desktop
and emulated-phone numbers; the iPhone reading is the owner's.

**Checked live** (a throwaway save on the worktree's own port; the touch
joystick and orbit driven with synthetic `TouchEvent`s, the cat moved between
spots by setting its position, then walking; the automated browser's own
frame clock was throttled while the app window was out of view, so frames were
driven from a timer: draw counts are unaffected, fps readings are not used):

- **Territory map**, at 1280x720 and 375x812. With 1 River walk the Pines and
  the island star both say "opens after 2 walks in The River and Marshes ·
  1/2 so far"; tapping either changes nothing. With 2 River walks both say
  "Tap to explore"; tapping the star (a real tap on the phone) unlocks and
  selects the Pines (save `area: 'pines'`, the dock says "Walking in The Pines
  and Swamp", both the Pines and the star read "today's walk"), exactly what
  tapping the Pines does. The star's line reads "in the Pines and Swamp".
- **The star steals no taps.** Every 3 px over the island's outline plus 40 px
  round it (1,190 points at 1280x720, 1,024 on the phone): no point inside the
  island's shape goes anywhere but the star, and every point that reaches the
  star outside its shape (5 at 1280x720, 3 on the phone; 20 and 10 while it is
  selected, from the selection outline) is over no other tappable region.
  The same sweep over the whole Pines region (6,241 / 3,844 points) finds
  nothing inside the Pines going elsewhere and, unselected, no Pines tap
  outside its shape; selected, its outline catches a thin rim (12 points over
  the Moor and 14 over the River at 1280x720), as every selected region's
  does. On the phone the star's target is about 14 px across: small, but a
  real tap on it works.
- **Legacy**: four cards (Cozy Neighborhood, City Park, Seaside, The Old
  Docks), no map, no Pines; with `area: 'pines'` the Cozy Neighborhood card and
  the dock say "today's walk"; flipping back selects the Pines again.
- **The bridge.** Steering down the truce path from (-4, 2) to its end, up to
  the foot and along the bridge onto the island, then all the way back: no
  stop, no wet frame, no stall (a frame with the stick held and under 2 cm of
  movement); the cat passes between the truce stones both ways (crossing
  their line at x 11.2 going out, 10.5 coming back). Pushing straight off
  either side from the middle of the plank holds the cat at the edge (at most
  0.90 m and 0.86 m off the centreline, the deck being 0.9 m each side), never
  wet, with the shipped edge bob of about 0.3 m. The four fixed-stick cases:
  (1) south from (10.6, 2.5) for 6 s slides along the deck's edge onto the
  island; (2) along the bridge from the foot for 8 s ends on the island;
  (3) due east from the deck's middle for 3 s slides along the east edge (at
  most 0.89 m off the centreline) and ends on the island, never wet;
  (4) back up the bridge from the landing for 8 s passes between the truce
  stones at x 9.98 and ends on dry land north of the shore. No case had a wet
  frame.
- **The corner map** (north-up): the island is filled like the land, out in
  the lake; the bridge is a path-tone line from the shore to it; the N badge is
  at the top; with the cat mid-bridge its dot sits on the bridge line.
- **On the island**: the cat hops up and sits on the Meeting Ring's stones
  (y 0.4, tried on two); three ducks paddle on the lake off the island's
  north-east; the two birds are at the Old Ash's foot.
- **Golden mice from the chase camera** (the cat 3.5 m out on each side, the
  first thing a ray from the camera meets): gm-pines-1 on the Lightning Stump
  from N, E, W, NE and SE; gm-pines-2 on the Frog Stones from S, NE and NW;
  gm-pines-3 in its bushes from N, E, W, NE, NW and SE; gm-pines-4 on the Old
  Ash's limb from S, W, NE, SW and NW (from the north the trunk is in the way,
  as with gm-woods-1); gm-pines-5 on the Watch Rock from N, E, NE, SW and SE;
  gm-pines-6 in the island's bushes from E, S, NE, NW and SW (bushes hide it
  from the other three, by design). The remaining sides mostly missed the
  mouse's thin top rather than hitting anything. gm-pines-6 was picked up by
  the cat during the bridge runs, so it is reachable.
- **Strays** (22): over 7.4 minutes sampled five times a second, none stood on
  the island, the bridge, the lake or the bay; the closest any came to the lake
  or bay boxes was 0.6 m (the keep-out margin). Strays waiting by the bridge
  foot rest exactly on the bridge capsule's edge. **A yarn ball** thrown onto
  the island's north rim (28, 15.5), with eight strays carried to the lake's
  north shore and the bay's: none came closer than 8.5 m; the one in range
  walked to the shore (z 7.4) and stopped. No stray on land can be within the
  8 m a playful stray reacts at, so a ball on the island draws none across.
  **A Far Call** from the island (Far Call skill on the save): the four strays
  within 22 m walked toward the cat along the shore and stopped at the
  keep-out's edge (z 7.4 and 4.4); none stepped onto the bridge or the island.
- **The frog**: walking at the bog-1 frog, "You spotted a croaking frog", then
  it hopped off and "The frog plopped into the bog! 🐸"; the journal gained
  `frog` (Bog Frog).
- **Gift Paws** (skill on the save): no prompt at any of the island's three
  scenics (the end of the bridge, the meeting ring, the lake view);
  "leave a gift at ..." at the Pines' three (the bridge to the island, the
  black mire, the heart of the swamp).
- **The race**: the courses for 1-21 November each have at most one ring on
  the island or the bridge (none on 1 November, exactly one on the other 20).
- **No camera in a canopy, except at four near pines** (before the review's
  fix). Every path and the
  bridge, sampled every 0.5 m on the centreline and 1.2 m either side (0.6 m
  on the bridge), looking along it both ways, at the close, default and far
  zoom steps, cameras placed exactly where `cameraOffset` and
  `cameraPullScale` put them (9,522 spots), each tested for being inside a
  mesh by rays: 10 spots were inside a near pine's lowest cone, 9 of them at
  the far step. A finer pass round those pines (0.25 m, five offsets, all four
  steps) found 26 spots, at most 0.51 m inside. The still stand never comes
  within its cones' reach of any camera (closest margin +0.21 m) and the Old
  Ash keeps 1.45 m; the bridge is clear. See "Seen, not fixed".
- **The edges.** South at the spawn: the River's green hills over the border.
  East from the east path: the Moor's river running in to the lake between the
  Moor's heather hills. The lake's north shore at z 8 from (38, 4), with the
  island, its stones and a stray on the shore. South-east from the island's
  rim: the open lake to the horizon, the Woods' green hills to the south-east
  and the Moor's heather to the north-east. From the bay's south shore: the
  island and the lake.
- `verify-places.html?area=pines` builds (`__calls` 100, no console errors).
  At `VIEWS.pines` (`-6,1.6,-2 → 28,1.0,28`) no trunk fills the frame (truce
  path, truce stones, the bridge, the island and the Old Ash), so the view is
  unchanged and `public/places/pines.jpg` is taken from it.
- **The suite and the build** pass (155 files, 4,336 tests; 4,342 after the
  review's fixes).
- No console errors from the game anywhere above.

**After the review** (code and tests only; the in-game draw counts above
and the live checks were not re-run):

- **The canopy clip is fixed.** The canopy rule now measures from each path
  stretched 7 m (the far step's distance) past both its ends, so no pine
  stands where the camera swings at a bend or a path's end. A new test in
  `test/pines.test.js` walks the cat down every path (on the centreline and
  1.2 m either side, every 0.5 m, facing both ways and 0.17 rad either side)
  and the bridge deck, places the camera as `cameraOffset` does at the close,
  default and far steps (pitch -0.25, 0.18, 0.85) and the farthest step
  (pitch 0.18), and finds no camera inside any pine's trunk or cone. The
  farthest step with the view dragged right down can still graze; that is
  not asserted. Near pines went from 40 to 27, the stand from 86 to 83.
- **Strays keep off the mire and the bogs.** The Pines' keepOut is now
  `PINES_KEEP_OUT`: the island's shapes plus both reaches of the Black Mire
  and the four bogs. A test drives three strays on the real Pines area for a
  minute on fifty seeds, sent straight at the mire's corner, across it and
  into every bog: none stands in any water and none moves more than a step a
  frame. The cost: no stray crosses the log bridge or the stepping stones, so
  none walks between the deep swamp and the rest. `keepout.js` now pushes a
  point out of a rect's rounded corner straight away from the corner, which
  stopped a small overshoot at the mire's corner.
- **The island plank is marked noCast** in all four maps, so it stays out of
  the shadow pass on purpose rather than by float rounding.
- Neither fix was looked at in the browser.

**Not checked by eye:**

- **Sound.** Not heard. In code the Pines' ambience is a low wind hush and the
  frogs with no birdsong at any hour (`audio.js`, the `pines` branch), and the
  island is the same walk with no per-position switch, so it sounds the same.
- **Whether the still stand looks dead beside the swaying near pines.** The
  sway is motion; stills can't show it, and the browser here could not play the
  walk in real time.
- **Dark and dense.** From the paths the forest reads as an open, mid-green
  pine wood under light fog, with bright grass between the trunks; it does not
  read dark. The deep swamp reads open and grey-green. A taste call for the
  owner.
- **Floating stand trunks.** The stand's trunks have no contact-shadow disc
  (the stand is over `contactshadows.js`'s `MAX_SPAN`), but the sun's shadow
  map grounds them, and at walking distance they don't read as floating. If
  the owner sees otherwise, the follow-up is a per-tree footprint list in the
  stand's `userData` for `scanFootprints` to read.

**Seen, not fixed:**

- **The far zoom step puts the camera inside four near pines' lowest cone.**
  (Fixed after the review; see "After the review".)
  At the truce path's first bend, cat at (-25.96, 32.27) walking south-east,
  far step: the camera is in the pine at (-30.47, 37.88) and a quarter of the
  frame is green cone. On the east path's east end, cat at (17.63, -26.51)
  walking west, far step: up to 0.51 m inside the pine at (24.43, -29.21). At
  the default step, cat at (-7.65, -16.85) on the pine/east-path junction
  walking east: 0.37 m inside the pine at (-12.21, -15.16), a green wedge at
  the frame's foot. The pine at (-3.78, 14.01) grazes at the far step. The
  canopy rule keeps cones off a path's corridor, but the far camera sits 7 m
  behind the cat and leaves the corridor at bends and segment ends. Looking
  across a path at the far step (not checked systematically) does the same,
  for example in the deep swamp at (-43, -25) looking east.
- **Strays walk in the Black Mire and the bogs.** (Fixed after the review; see
  "After the review".) The keep-out covered the lake,
  the bay and the bridge only. Over the 7.4 minutes, six strays spent time in
  mire-north, mire-west or bog-1 (2,315 samples); one shows standing on the
  mire in the deep-swamp picture. The Woods' and the River's strays were not
  checked for the same.
- **Shore foam.** No foam line runs up the bay from the lake's west edge: the
  lake keeps only its north shore. The known short stripes (the lake's z 8
  shore over the bay for x 26-30; the mire's corner at x -32, z -11..-6) were
  not picked out at the browser's resolution. The lake's west shore at x 26,
  z 44-50, by the bay's south-east pocket, has no foam, as its comment says.
- **The horizon over the lake opening.** Where the hills stop for the lake and
  the Moor's river, the heather hills end in flat-edged slabs with white sky
  between them and the water, the same notch the Moor's entry saw in the
  place-picture harness, here in the walk too, from the bridge and the east
  path.

**Not checked:** holding keys on desktop (the automated browser can't lock the
pointer); iPhone fps and thermals; dusk and rain; the colony and co-walk on
the island; the ducks' whole circuit round the island (seen paddling off its
north-east only).

## Border posts — live check (2026-11-01)

Headless Chromium (SwiftShader), Clan Edition unless noted, branch
`border-crossings` at 61f9e8d.

**Checked and right:**

- All 19 posts give the right line from 1 m inside: "E — Head to …?" on a save
  with everything owned (Twolegplace, the Woods, the Moor, the River and
  Marshes, the Pines and Swamp), "The Gorge: not explored yet" at moor-gorge,
  and the locked lines on a fresh save ("🔒 The River and Marshes opens after 2
  walks in The Woods · 1/2 so far", "🔒 The Woods opens after 2 walks in
  Twolegplace · 1/2 so far"). On touch the pill drops the "E — " as designed.
- The crossing card at woods-moor-path, with a race running: "Head to the
  Moor? / This walk ends here, and you keep everything you found. / Your race
  stops here." Keep exploring puts the pause card back and the walk resumes; E
  again, Yes, let's go! gives the summary with "Next stop: the Moor! 🧭" and
  "It's picked on your map."; the Woods walk counted (3 → 4); Continue opens
  the home screen on Where to with the Moor as today's walk; Start walks the
  Moor.
- Walked with arrow keys, no wading, never stuck (largest drift off the
  centreline 0.7 m): the Moor trail (4, -7) → (-49.3, -11) and back, the Pines
  trail (33, -11) ↔ (49.3, -11), and the town footpath from the spawn to its
  west end and the post. The cleared strips read as trails; the joins are the
  same overlapping-strip bends every path has.
- Posts look right: cloth in the neighbour's map colour (lavender for the Moor,
  green for the River, tan for Twolegplace); board on the outward side; no fern
  or reed through any Woods post (one fern stands about a metre behind
  woods-moor-path).
- Corner map: brown arrows at the posts, pinned to the rim when off the disc,
  pointing out over their edge in north-up and turning mode. At the Woods
  spawn four of the six show, which isn't cluttered.
- Legacy: no posts, no footpath, no post line anywhere, no arrows on the map.
- No console or page errors.

**Draws** (HIGH, 1280×720, `?perf`, 10 s average at the spawn; posts and
footpath hidden for the second number): Neighborhood 1434 / 1427 at the spawn,
724 / 714 looking at town-river; Woods 608 / 598 at the spawn, 660 / 650
looking at woods-town-short. So the dressing costs about 7-10 draws. Each post
is 3 meshes and none casts a shadow. Clan against Legacy in the Neighborhood
(1371 against 1264) is mostly not the posts.

**Seen, not fixed:**

- **River: the race pad sits at the foot of river-woods-long.** The pad (46, 37)
  is 1.6 m from the post (47.5, 37.6), 4 m from the spawn. Walking up from the
  spawn side gives "E — start today's zoomies race! 🏁". The post line shows
  only from its north, east or south, or once the race has started, and the
  yellow ring is drawn round the post's foot.
- **The board's tip doesn't read as an arrow.** It is a 4 cm-high flat
  three-sided cone lying on its side. From walking height the board looks like
  a plain plank with a small nub at the end.
- **The corner-map arrowhead is almost equilateral** (7 × 6.4 px). In turning
  mode at in-between headings it looks like it points the wrong way: at yaw
  -1.2 the town's west arrows seem to point right. The angle maths is correct.
  A longer, thinner head would fix it.
- At the town spawn, town-moor's arrow is due north and hides under the N badge.
- The post's prompt pill stays visible, dimmed, under the crossing card.

**Not checked (left for the owner):** the co-walk crossing with two paired
devices (the localhost-only browser can't reach the room transport; the logic
is unit-tested), and the iPhone 18 reading in the Neighborhood and the Woods.
