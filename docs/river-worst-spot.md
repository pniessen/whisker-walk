# The grown River's worst spot (engineering review 3, P2)

Measured 2026-11-27 with `?grow` on (the default), using `test/helpers/growbudget.js` (`measureStreams`, `worstSpot`, 5 m grid), the River built, merged and caster-swept as `test/riversouth.test.js` does. Nothing in art or ranges was changed.

## Now

Worst spot: x -35, z 0 (the west bank by the reedbed).

| | meshes | casters | triangles | est. draws (meshes + casters) |
|---|---|---|---|---|
| measured | 212 | 148 | 69,598 | about 360 |
| test ceiling | 222 | 155 | 70,000 | about 377 |

Where it comes from (fixed 70 meshes / 17 casters / 29,021 triangles, plus 468 always drawn):

| stream | tiles in range | meshes | casters | triangles |
|---|---|---|---|---|
| core trees (hide 65 m) | 31 | 99 | 99 | 10,612 |
| west trees (hide 65 m) | 8 | 32 | 32 | 3,540 |
| west small (hide 38 m) | 8 | 8 | 0 | 6,294 |
| core small (merged runs) | 39 | 0 | 0 | 2,476 |
| core-fine (merged runs, hide 20 m) | 39 | 0 | 0 | 13,160 |

Trees are the draw cost: 131 of the 142 streamed meshes, every one a caster, so 262 of about 360 draws are trees (47 core and 13 west tree groups are the biggest kinds of object). Triangles are mostly the fixed ground, not the streams.

## Proposal (not applied)

The `trees` layer hides at 65 m (shows at 55 m). Trees past about 45 m are a few pixels; pulling its hide to 45 m (show about 38) drops the worst spot to 174 meshes / 114 casters / 66,282 triangles with small at 30 (about 288 draws, -20%); with small left at 38 it is about 292 draws. Hide trees at 40 m: 163 / 103 / 65,159 (about 266 draws, -26%).

| hide fine / small / trees | meshes | casters | triangles | draws |
|---|---|---|---|---|
| 20 / 38 / 65 (now) | 212 | 148 | 69,598 | 360 |
| 20 / 38 / 55 | 201 | 137 | 68,844 | 338 |
| 20 / 38 / 50 | 193 | 129 | 68,450 | 322 |
| 20 / 34 / 45 | 178 | 114 | 67,166 | 292 |
| 20 / 30 / 45 | 174 | 114 | 66,282 | 288 |
| 20 / 38 / 40 | 167 | 103 | 66,522 | 270 |
| 16 / 30 / 40 | 160 | 100 | 63,885 | 260 |

Recommended first step: trees hide 65 to 45 (show 55 to 38), which needs a look from the iPad for pop-in at the tree line (fog or the stand-ins already cover the gap). Second, if still needed: merge each tree tile's groups into one caster mesh per tile (the core's 47 groups to about 31, one per tile in range), which needs the strip's tile builder to merge by material per tile, as `mergeStaticProps` does for the core. Then the three ceilings in the grow tests can drop by hand; they no longer fail when art gets lighter.
