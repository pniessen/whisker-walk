# polish-hotpixel (Pass 10, item 10-1): the Moor bloom flare

Goal: no more yellow-white bloom disc on the Moor when the far stream bank is a
sliver in frame, without changing how the water dressing looks.

## What the probe found
- `survey10/probe10moor6.mjs` reproduces it: in the composer's own buffer
  (HalfFloat, 4×MSAA) one `waterdress:band` pixel at (1129,233) reads 32,752.
- A drawRange binary search pins it to one band triangle (index 4912): a
  bank-row quad 30 m away seen almost edge-on. Two of its corners are 0.06 px
  apart on screen, so it is a sub-pixel-thin sliver.
- With 4×MSAA a sample can be covered while the pixel centre lies far outside
  the sliver; without centroid sampling the varyings are extrapolated there.
  `vColor` reads ~128 and its alpha ~1,531 (vertex values are ≤ 0.9 / ≤ 0.7).
  Normals, degenerate-triangle culling and `centroid` (ignored by SwiftShader)
  do not change it; clamping the vertex colour does.

## Plan
1. `bandMaterial()`: in `onBeforeCompile`, clamp `diffuseColor` to 0–1 right
   after `color_fragment` (the extrapolated varying is the root cause), and
   clamp the final colour/alpha to 0–1 (the band is never HDR, so a bad
   normal or view vector can't make a hot pixel either).
2. `bandGeometry()`: give the band an up `normal` attribute (it was the only
   lit mesh without one; `normalize(vec3(0))` is undefined on real GPUs), and
   wind every triangle up so DoubleSide's back-face flip never points it down.
3. Keep the foam breathe and the sea swash (vertex shader untouched).
4. No composer.js guard unless the all-area scan finds non-band hits that
   can't be fixed at their source.
5. Scan every area (spawn + every `spots.mjs` stop) for pixels > 4, NaN, Inf;
   before/after shots for the acceptance list; full suite, build, flat trace.

0 triangles.
