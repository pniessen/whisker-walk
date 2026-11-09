# polish-goldenhour (Pass 11, item 11-5)

Survey: polish-survey-11.md ranked #5 (a sunset still looks like noon) and #7
(the Seaside cloud bank is a flat grey lens). Render-only; 0 triangles in area
builds, clouds +1 crown puff per bank (80 tris each, instanced).

## Scope (owned)
- `src/weather.js`: `SUNSET_LOOK` and the `condition === 'sunset'` branch.
- `src/render/clouds.js`: the sunset palette in `cloudPalette`, the bank
  shapes (`BANK_*`, `layoutBanks`) and a bank-only underside/shading in the
  cloud material (an instanced `aBank` attribute; still one InstancedMesh).

## Tasks
1. BEFORE shots: `walk.mjs woods/pines/seaside/docks/river sunset`, Seaside and
   Moor by day, phone pairs, Moor dusk and River rain (must not change), and
   `hdr11b.mjs woods/seaside/park sunset`.
2. Golden hour (`SUNSET_LOOK`): warmer, stronger lawn tint (cool ~[1.16, 0.95,
   0.72], dark ~0.9), env ~0.55, hemi a touch lower, a deeper amber sun.
   Elevation stays 15 deg; the Gorge keeps its sun height.
3. Sunset clouds: peach-gold undersides, lilac tops (`cloudPalette` 'sunset').
4. Banks: base row squash ~0.55, one more crown puff, a lighter and smoother
   underside for banks only (per-instance `aBank`; day clouds unchanged).
   Own seeded stream (`bankSeed`), none in the Gorge.
5. Tests: update the sunset palette and sunset-light pins to the new intent;
   pin the bank shape (squash, crown count, one InstancedMesh with aBank).
6. Full suite, build, flat trace sha unchanged; AFTER shots, HDR (no view > 4).
