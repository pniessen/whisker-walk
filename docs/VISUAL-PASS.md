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
## Stream 4 round four — ambient life

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
