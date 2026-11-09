# polish-hedgesky (Pass 10, item 10-6)

Survey: scratchpad/polish-survey-10.md, ranked #6 and #7, broken #3.

## 1. Edge scrub reads as one mass (builder.js buildEdge scrub branch, EDGE_STYLES)

The Woods `scrub` and Pines `pinescrub` edges are a picket row of separate
humps: two round mounds a piece, each turned to a random yaw, a step of 2.9m,
heights rolled per mound, and a pale yellow-olive third green in the Woods.

- Mounds stretched along the edge (local x, laid on the piece's yaw instead of
  a random one) so neighbours overlap ~30-50%: the valley between two is only
  a third of the way down. Zero new triangles.
- Height on a slow wrap-around noise along the perimeter (`edgeNoise`, knots
  every ~4 pieces) instead of per mound, ±25%; every ~5th piece one mound
  stands taller and rounder (a bush rising out of the scrub).
- Colour: two greens per style blended on a second slow noise, per-mound
  ±4% and per-face ±5% value. The pale 0x6b8a3c variant is dropped.
- In/out jitter narrowed (style `jitter` 0.25) so the run stays a line.
- Clipped hedges (Park, Neighbourhood): height on the same slow noise so the
  top flows instead of stepping box to box. Otherwise unchanged.
- noCast, duskTint and the horizonEdge child are untouched.

## 2. Far cloud banks the walk camera can see (render/clouds.js)

The walk camera sees only ~7° above level; every cloud sits higher.

- `layoutBanks(areaId, n)`: long flat banks on their own seeded stream
  (`cloudbanks:<area>`), stratified round the compass, ~185m out, static in
  bearing apart from a slow ±1.5° swing and the puffs' billow. Three long low
  puffs (stretched 1.8x, squashed 0.42) plus two rounder crown puffs lifted
  onto the back, so a bank is a lumpy far cumulus, not a thin lens.
- Each bank's base clears the band's crest IN ITS OWN BEARING (a per-5°
  elevation profile measured from the area centre) by 0.5°, and the band's
  top by 4m, so they sit just over the hills where the hills are low.
- Per area: Moor and Seaside 5 banks and 12 high clouds, the Gorge 0 banks and
  7 high clouds, others 4-5 banks. Low rung: banks scale with cloudCount.
- Same single InstancedMesh and material (dusk/sunset palettes and haze free).
  ≤ 2,000 extra instanced triangles (5 banks x 5 puffs x 80), 0 draws.
- test/clouds.test.js: the old "clears the band" rule now covers the high
  clouds; banks get their own per-bearing rule, a visibility test and
  determinism tests.

## Checks
Full suite, build, flat trace af079017…b83a, triangle deltas, before/after
pairs in scratchpad/snaps-polish-hedgesky/pairs.
