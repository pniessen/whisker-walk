# Split screen, spike S0 (`?split=1`)

Proves the two-view render only. Default off; normal play is untouched (one extra `null` check per frame in `renderFrame`, one `ctx.split` getter, no start-up growth: start-up is 678.3 kB gzipped, same as `main` to the 0.1 kB).

## What it is
- `src/coop/splitview.js` (lazy, imported by `main.js` only when the URL has `split=1`): `splitPlan(w, h, dpr)` (pure maths) and `createSplit` (draw + a one-line readout at the bottom of the screen).
- `renderFrame` in `main.js`: `if (!(split && split.draw(session))) composerRig.renderFrame(session)`. `draw` returns false unless couch co-op has cat two out, so one cat, the flag off, and every other path go through the composer exactly as before.
- Left half: the main camera (cat one's own follow camera). Right half: cat two's follow camera, which `createMover` (`src/coop/second.js`) now returns as `mover.cam` and the chunk publishes as `coop.second()` (set on the seam object as an extra property; the seam file is unchanged, `delete`d on stop).
- Each view: `setViewport` + `setScissor`, `setScissorTest(true)`, `aspect = (w/2)/h`, `renderer.render`. Composer and bloom are skipped while split (the sky and sun glow look flatter). Full viewport, scissor and the main camera's aspect are restored afterwards.
- With `split` on, `coop.frame` skips the shared midpoint camera, the leash (limit 1e6) and the edge markers / rings; each cat keeps its own camera.
- Readout: the `?perf` panel already counts both passes (`renderer.info.autoReset` is off, so draws and triangles accumulate over both renders; "scene passes 2"). The split line adds frame ms, cpu draw ms, draws, tris for both views.
- Tests: `test/splitview.test.js` (halves, aspects, odd widths with dpr 1/1.25/1.5/2/3 tile with no gap, scissor/viewport call order, restore, no-op without cat two). `frameorder`, `composer`, `coopseam`, `coopplay`, and `npm run test:pins` pass.

## Measured (this Mac, headless Chrome 2026-11-28)
GL renderer: `ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max)`. Dev server, `?rung=0` (top rung, no adaptive drop), vsync and the frame limiter off so rAF interval ~ frame cost. Neighborhood and Reef. "one" = one cat; "coop" = two cats, shared camera (today's couch play); "split" = this spike. Headless numbers are indicative only (3 s noisy, other builders were using the machine).

| place | size | one: rAF ms / draws / tris | coop: ms / draws / tris | split: ms / draws / tris |
|---|---|---|---|---|
| Neighborhood | 1280x720 | 4.7 / 1401 / 263k | 5.4 / 1329 / 269k | 6.4 / 2206 / 469k |
| Neighborhood | 1920x1080 | 4.8 / 1370 / 258k | 5.1 / 1175 / 241k | 5.6 / 1899 / 409k |
| Reef | 1280x720 | 2.2 / 189 / 129k | 4.4 / 213 / 132k | 5.4 / 297 / 246k |
| Reef | 1920x1080 | 3.1 / 188 / 129k | 4.6 / 202 / 132k | 4.6 / 313 / 246k |

Split costs about 1.0-1.3x coop and 1.2-2.5x one cat on an M2 Max, i.e. roughly double the draws and triangles, which is the real warning for a weaker Mac on a TV (the owner's target). In the Neighborhood, shadow draws went 407 -> 1002: the shadow map is rendered again inside each `renderer.render`.

## What looked wrong / not done (out of scope for S0)
- Pictures: `tools/verify/split-s0-contact.png` (Neighborhood and Reef, 1920x1080, two cats).
- Shadows: the shadow fit follows cat one's camera, so cat two's half has no (or wrong) cast shadows when the cats are apart (visible in the Neighborhood shot: no shadow under Siamese).
- Shadow map rendered twice per frame (see the shadow counts). Fix: render it once (`shadowMap.autoUpdate = false` plus one manual update for a fit covering both, or a lower rung while split).
- HUD overlays are one-per-screen, not per-view: quest list, minimap, perf panel, toast, "Welcome" card and the prompts sit across the centre line. The two prompt pills already sit one under each half.
- Camera-centred systems (grass, clouds, rain, treefade, striptiles, ambient) follow the main camera only; grass and tree fade near cat two are computed from cat one's view (not obviously wrong in a 10 m separation, expected to show at a longer distance).
- No bloom / OutputPass: with the composer skipped, tone mapping is the renderer's, so the picture is darker/flatter than single view.
- A ride, fight or find that moves cat two without `mover.player.update` leaves its camera where it was (`rides.frame` replaces that call).
- The camera dummy's fov/near/far are copied from the main camera each frame; the zoomies FOV kick is therefore shared.
- Edge markers, the leash and "tight place" logic are simply off in split.
- The split is fixed 50/50; the dynamic split from the owner's decision is not built.

## Single-camera assumptions actually hit
1. `composerRig.renderFrame` / RenderPass hold one camera at full size (skipped, not generalised).
2. `coop.frame` writes the shared camera over cat one's (turned off by `ctx.split`); the leash and `inBox` read the camera and its aspect (`lens.aspect`) as one screen, so the main camera's aspect is restored after each draw.
3. `createMover`'s camera was private; now exposed as `mover.cam`.
4. `renderer.info` resets on every `render()` unless `autoReset` is off; the readout sums both views by turning it off for the frame.
5. HUD (`hud.edge`, `hud.ring`) projects through `ctx.camera` only.
6. `session.drawOff` (a perch climb drawn as a jump) is applied in `composer.renderFrame`; repeated in `draw`.
7. Shadow fit, grass, clouds, rain, treefade, striptiles centre on `camera.position` (not changed).

## Try it
`npm run dev`, open `/?coop=1&tv=1&split=1&perf=1` with two pads (second pad X joins).
