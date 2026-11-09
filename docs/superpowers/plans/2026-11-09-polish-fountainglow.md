# polish-fountainglow (Pass 11, item 11-1)

Goal: the Park fountain stops feeding bloom (survey 11: HDR 36 by day, 600 at
sunset), its drops sparkle softly instead of reading as glass diamonds, and the
Park pond is calmer.

Root cause (survey 11's frozen probe, one layer hidden at a time): the drops
(`fountainDrops`) and then the ripples (`fountainRipples`).
- roughness 0.18 / 0.2: GGX peak 1/(pi a^2), a = roughness^2, ~300;
- the drops were flat-shaded octahedra, eight perfect mirrors each, so some face
  on some drop always lands on that peak;
- low sun is grazing, where Fresnel goes toward 1 (25x the head-on 0.04).

Plan (src/world/parkfountain.js, src/render/water.js, one line in park.js):
1. DROP_LOOK: roughness 0.5, metalness 0, softer blue-white 0xc4dcea, opacity 0.6.
2. Smooth per-vertex normals on the drop octahedra (a rounded bead, no facets).
3. DROP_WIDTH: side/forward cross-section 60% of before.
4. RIPPLE_LOOK: roughness 0.6.
5. Both shaders: `gl_FragColor.rgb = min(rgb, 1.0)` after `opaque_fragment`
   (FOUNTAIN_HDR_CAP); shader keys bumped to v2.
6. PARK_POND_LOOK in water.js (like MOOR_STREAM_LOOK): deeper, less saturated
   green-blue 0x6a9ca4, envIntensity 0.6, glare 0.3, specCap 0.4; park.js
   spreads it into the pond's createWater call.
7. Tests in test/park.test.js: looks, clamp present, smooth normals, widths.
8. Prove: hdrfountain.mjs park day/sunset (every base view < 2), hdr11b.mjs
   park day/sunset/dusk (no view > 4), before/after shots.

0 triangles: count and arcs unchanged. Reduced motion still freezes uTime.
