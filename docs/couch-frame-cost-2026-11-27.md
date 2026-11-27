# Couch play: what a frame really costs (2026-11-27)

Read-only analysis. No code changed: the one safe candidate (second cat drawn simple) is already the case (`src/coop/second.js` draws cat two through `src/remotecats.js`, `buildCat(..., { simple: true })`, pinned by `test/coopbudget.test.js`).

## How it was measured

- Whole scene = `test/coopbudget.test.js` (place + heaviest full cat + heaviest simple cat, both in the heaviest outfit, d2 in the fisherman jumper: 16,588 + 10,008 triangles, 55 + 51 meshes, plus 72 for the marks).
- Drawn set = a scratch sweep (not committed; same idea as `growbudget.js worstSpot`): build, `mergeStaticProps`, `assignShadowCasters`; every walkable cell of the place (`reachFrom`, about every 3 m), four headings, the chase camera (4.5 m back, 2.2 m up) and the widest couch zoom (`MAX_ZOOM_STEP`), 16:9, fov 70, far 300. A mesh counts when its bounding sphere meets the frustum. Casters = shadow casters within 20 m of the cat (the sun box, `shadowFitRadius`), by the walk rule. Worst cell shown. The Old House is not swept: its drawn set is zone-based and already measured at the worst pair by `test/coopm5house.test.js`.
- Not measured: milliseconds on any device (no iPad 7 reading exists), the walk life layer (sky, particles, critters), and grass tufts (only the Gorge of these seven has them).

## Finding 1: culling does almost nothing here

These places are built as a handful of huge merged meshes (6 to 50 meshes for the whole place). A merged chunk is drawn whole if any of it is in view, so the frustum removes at most about 1,100 triangles. The drawn set is the whole scene, within 1.5 percent. The place cannot be made cheaper per frame by where the cats stand; only by cutting geometry or by the cats.

## Finding 2: the cats are a third of the triangles and nearly all the shadow draws

Casters in the sun box: 107 to 126, of which the two cats are 106. The place adds 1 to 26.

## Table (worst spot; both cats dressed in the heaviest outfit)

| Place | Whole scene, couch | Drawn set, couch | Drawn set, solo (full cat only) | Draws (couch) | Casters in sun box (couch) | Place casters, triangles in shadow pass |
|---|---|---|---|---|---|---|
| Lighthouse | 80.9k | 79.8k (wide 80.7k) | 69.8k | 133 | 113 | 41.1k |
| Greenhouse | 85.3k | 84.4k (wide 85.0k) | 74.4k | 164 | 112 | 14.5k |
| Treehouse | 83.4k | 83.3k | 73.3k | 112 | 107 | 22.4k |
| Jungle | 76.6k | 76.5k | 66.5k | 114 | 109 | 9.3k |
| Snowville | 71.6k | 71.5k | 61.5k | 112 | 108 | 27.2k |
| Gorge | 93.2k | 95.5k (wide 95.2k) | 85.5k | 139 | 126 | 36.4k |
| Old House | 83.3k | 83.3k (zone worst pair, test/coopm5house) | 82.4k (one level) | 420 | 265 | not split |

Notes: Gorge measures above its coopbudget row because the sweep keeps the meshes of the heaviest cell and the cats on top; it is within the place ceiling pin. The Gorge also draws grass tufts that none of these numbers include (quality.js: up to about 41k triangles on HIGH, about 11k on LOW). Shadow pass triangles are extra on top of the drawn set: a frame is roughly drawn set + caster triangles (cats 26.6k + the place column), for example Lighthouse about 79.8k + 41.1k + 26.6k = 147k vertex work on HIGH or LOW with shadows on.

The 70,000 worst-spot line was set for one full cat. Solo (full cat alone) is already over it in Greenhouse, Treehouse, Gorge and Old House. Couch adds a flat 10.0k (a simple cat in the heaviest outfit; a bare simple cat is 5.0k).

## What each lever costs and buys

| Lever | Saves | Costs | Status |
|---|---|---|---|
| Second cat always simple | 6.6k triangles and a few draws against a second full cat | none | already done |
| Cat one also simple in couch | another 6.6k | the child own cat looks flatter; she picked its look | not recommended |
| Shadows off for cat two only | 51 shadow draws, 10.0k shadow triangles | cat two stands without a shadow while cat one has one; the two ground marks stay | needs a small change in remotecats or coop (not one line, a visible change) |
| Shadow-light rung (rung 4, parts under 0.3 m stop casting) | cat casters 106 to 34 (72 draws), about 10k of the 26.6k cat shadow triangles; place casters unchanged (merged chunks) | tiny shadows (paws, collars, whiskers) vanish | exists: adaptive rung 4 |
| Lite rung (rung 5, no shadow pass, pixel ratio 1, no clouds) | the whole shadow pass: 42k to 68k triangles per place, all caster draws | no shadows at all, thinner grass and strays | exists: adaptive rung 5 |
| LOW tier (rung 3) | post-fx off, pixel ratio 1.5, shadow map 1024, grass 11k not 41k (Gorge), strays 14 | softer picture, no bloom or MSAA | exists; iPad 7 already starts here by device profile |
| Zone culling / frustum | nothing at these places (merged chunks) | none | cannot help without splitting meshes |

No tier changes the triangle count of the place or of the cats: the tiers cut shadows, grass, post-fx and pixels. The cat simple variant is the only existing triangle lever for the cats.

## Recommendation

1. Keep the second cat simple and change no place ceiling: nothing here is a regression, and the 70k line is a single-cat line that couch cannot meet without a change in look.
2. Do not force a tier on the iPad Pro, iPhone 18 or desktop: the walks fit there already (iPhone 18 held 60 fps on HIGH in the Neighborhood, cpu 4.6 ms).
3. For an iPad 7 (and any device that starts on rung 3 or lower) start couch walks one rung lower, so the first couch minute is on the shadow-light rung (cats 106 to 34 casters) instead of spending it stuttering down the ladder. This is the largest saving that costs no geometry. It needs a small change in `adaptquality.js` (couch flag adds one to the start rung), with tests; not made here.
4. Keep shadows on for both cats on HIGH and MED. Shadow off for cat two alone is the cheapest visible trade if a real iPad reading shows trouble; try it only after that reading.
5. Before any further art in these seven places, remember the places are one merged chunk each: adding detail adds triangles to every frame in full, in both shadow and main pass when it casts.

## Owner decisions

- A. Start couch walks one rung lower on rung 3 or lower devices (recommended default: yes, shadow-light for iPad 7).
- B. Leave cat one full (recommended default: yes) or draw both cats simple in couch (saves 6.6k, flatter cat).
- C. Allow cat two without a shadow if an iPad 7 reading needs it (recommended default: not until a reading says so).
- D. Take a real iPad 7 couch reading in Greenhouse and Gorge (worst two) before deciding A to C.
