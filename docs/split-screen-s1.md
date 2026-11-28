# Split screen, S1: the dynamic split and merge (`?split=1`)

Builds on S0 (`docs/split-screen-s0.md`). Default off; without `?split=1` nothing here loads or runs (start-up stays 678.3 kB gzipped, as in S0).

## The rule (`src/coop/splitrule.js`, pure, no DOM, lazy)
Exported constants: `SPLIT_AT = 0.8`, `MERGE_AT = 0.5` (both x `maxSeparation(lens, top)`, the widest gap the shared camera can frame), `HOLD_MS = 1000`, `TRANSITION_MS = 400`.
- shared -> split: gap > 0.8 x maxSep AND the shared zoom is at its widest step (`level >= top - 0.05`), or the cats are on different levels (`!sameLevel`: House, Treehouse, Reef, Gorge) at any distance.
- split -> shared: gap < 0.5 x maxSep AND `sameLevel`. Between 0.5 and 0.8 the current state stays.
- Each state is held at least 1000 ms after a change (a gap hovering on a line cannot flicker; checked in `test/splitrule.test.js`).
- The change slides for about 400 ms (smoothstep). `t` runs 0 (shared) .. 1 (split) linearly and monotone; `dividerX` = `1 - 0.5 x ease(t)`: 1 shared (the right view has no width), 0.5 split. Reduced motion snaps in one step.
- The leash (`LEASH_MARGIN` 0.95 x maxSep) still holds the cats while shared, so the shared camera can always reach the 0.8 line. Once the split is up the leash is off.

## Wiring
- `coop.frame` (index.js) publishes `coop.splitInfo = { gap, maxSep, top, sameLevel }` each frame, only when `ctx.split()` is not `null` (flag on). `ctx.split()` is now `split.active()` (true while any part of the split picture is up, so each cat keeps its own camera and the shared camera, leash and edge markers are off) or `null` when the flag is off.
- `splitview.draw` (after `coop.frame`) steps the rule and draws: shared -> returns false (the composer, bloom and the shared camera, exactly as in normal couch play); split or mid-slide -> two views in the rectangles from `viewRects` (device-pixel tiling, as `splitPlan`). Mid-slide the left view (cat one's own camera) is clipped to `dividerX` and the right view (cat two's) takes the rest; aspects follow the rectangles.
- One frame of lag: the rule runs after `coop.frame`, so the camera mode follows the decision a frame later.
- Divider: a 6 px DOM strip (2 px dark line with soft edges, `pointer-events:none`, z-index 8), moved to the right view's left edge each frame, hidden when shared. Chosen over a clear-colour gap because the views tile the buffer exactly and it costs no draw.
- Debug line (bottom of screen, on with `?split=1`): `split <mode> · gap N m · t T · <reason> · frame ms · cpu draw ms · draws · tris`. The `?perf` panel still counts both passes. Dev server only: `window.__split` (draw, state(), active()).

## Try it
`npm run dev`, then `/?coop=1&tv=1&split=1&perf=1`, two pads (second pad A joins). Walk apart on the open Neighborhood street: past about 0.8 of the widest gap the picture slides to two halves; walk back to under half and it merges. Picture page: `tools/verify/verify-split-s1.html` (drives the game with two fake pads; `node scripts/record-page.mjs --url <dev>/tools/verify/verify-split-s1.html --out <dir> --shots shared,slide,split --size 1920x1080`; `slide` freezes the loop, so take `split` in a second run). Contact sheet: `tools/verify/split-s1-contact.png` (shared, mid-slide, split).

## Known gaps / not verified
- The camera jumps from the shared midpoint camera to cat one's own at the first slide frame (no camera blend); worth a look on a TV.
- Mid-slide the right view is squeezed (its aspect narrows), not revealed by a moving window.
- Merge is untested live (tests cover the rule, not the picture going back); the different-level forcing is tested in the rule only, not in House/Treehouse/Reef/Gorge.
- All S0 gaps stand (shadow fit follows cat one, shadow map drawn per view, one HUD across both halves, no bloom in split, minimap and quest list over the divider). S2 to S4 are for those.
- No real pads or TV; fake pads on this Mac in headless Chrome only. Split cost is still about double the draws.
