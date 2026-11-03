# polish-camps3: each clan's camp its own home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every clan camp (StormClan/Woods, BrookClan/River, GaleClan/Moor, DuskClan/Pines, CliffClan/Gorge) gets its own palette and floor material — bramble wall, floor, den, nests and Highrock tone — with no new triangles, meshes or Math.random draws.

**Architecture:** One frozen per-clan table `CAMP_LOOKS` in `src/world/camp.js`, read through `campLook(areaId)`. The existing builders (`denGeometry`, `ringMesh`, `clearingMesh`, `nestsMesh`, the rock materials in `addCamp` / `campRockMesh`) take a `look` argument instead of reading the module constants. Accents (berries, gorse flowers, heather, bulrush heads, fern tips) are whole triangles of the ring recoloured by a position hash (`speckle`), so the triangle count is unchanged.

**Tech Stack:** Three.js 0.185, Vitest 4.

**Spec:** scratchpad `polish-survey-3.md` rows #5 and #15, build B5a; shared rules `polish-common.md`.

## Global Constraints

- Only `src/world/camp.js` and tests (`test/camplooks.test.js`, new) change. `src/clancast.js` stays untouched unless needed.
- No new triangles, vertices, meshes, materials or Math.random draws: `test/camp.test.js` "44 Math.random draws" (flat) and "28" (Gorge) stay green; ring triangle count stays `28 * clumps + 24 * strands`.
- Colliders, seats, campLayout, campDressing, CAMP_TURN unchanged. Flat trace sha256 stays `d2657f022d09b1d6507af42e30ce9666bfea29b3e52c2add1c218399a53a72f0`; waterlooks BUILD_DRAWS unchanged.
- Every colour is from the table or a position hash (`hash01`), never Math.random/walkRng.
- The clearing's mesh keeps CircleGeometry, y 0.011, polygonOffset, noCast. Only its colour and `surface` change (surface must be a SURFACE_PRESETS key with a texture: 'sand', 'gravel' or 'grass').
- Unknown area ids fall back to the woods look (Legacy / any future camp).
- Commits: explicit `git add <paths>`; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`; long sweeps get explicit 120_000 timeouts.

## The palette (decided; copy exactly)

Clan card colours (src/ui/clanpicker.js emblems): woods #2f5a33, river #24516b, moor #5c3f68, pines #353d68, gorge #6b4128. Ground: woods 0x5f9a4a, river 0x7d9c55, moor 0x8a9558, pines 0x56603e.

| key | woods (StormClan, oak & fern bramble) | river (BrookClan, reeds & pebbles) | moor (GaleClan, gorse & heather) | pines (DuskClan, needles & moss) | gorge (CliffClan, sandstone) |
|---|---|---|---|---|---|
| ring.greens | 0x34521f, 0x46632a, 0x2a421c | 0x5e7f48, 0x6f8c50, 0x4a7466 | 0x56632a, 0x667030, 0x48522a | 0x1d3a2f, 0x27483a, 0x15302a | — |
| ring.strand | 0x3a2a18 | 0x56603a | 0x3e3622 | 0x24263a | — |
| ring.specks | [[0x4a1430, 0.07], [0x9a2630, 0.03]] (blackberries) | [[0x5a3a22, 0.06]] (bulrush heads) | [[0xe0b62a, 0.12], [0x9a5a8e, 0.09]] (gorse, heather) | [[0x4f7a3a, 0.07]] (fern tips) | — |
| den.base / streak | 0x34481f / 0x62803a | 0x5a6a3a / 0xa29e62 (woven reed, straw) | 0x4a4030 / 0x8a5a80 (dry heather) | 0x1e3228 / 0x3e5e3a (moss) | — |
| den.strand / frame | 0x3a2c1c / 0x5a4128 | 0x4a5a34 / 0x6a5a3a | 0x3a3022 / 0x6a5a3e | 0x2a2620 / 0x3e2e22 | — |
| floor color / surface | 0xa4845c / 'sand' (trampled earth) | 0xbdb8a8 / 'gravel' (pale pebbles) | 0x7e9c4c / 'grass' (cropped turf) | 0x7a5a3c / 'sand' (needle litter) | — (ledge) |
| nest moss / bracken | 0x6f8f3a / 0x8a6a3a | 0x6f9a6a / 0xb0a46a | 0x8a6a80 / 0xa89a62 | 0x5f8a3a / 0x6a4a30 | 0xa08a50 / 0xc8b48a |
| rock | 0x8a8a80 | 0x7d8890 | 0x9a9488 | 0x5e6070 | 0xb8825a |

The gorge row only needs `nest` and `rock` (a ledge camp has no ring, den or floor); give it the woods values for the rest so `campLook` always returns a full record.

## Review Focus

- A ring speck must recolour all three vertices of a triangle the same (flat facet), never a single vertex (would smear a gradient).
- Speck choice must hash a triangle's centroid, so the same camp is identical on every build (two builds → identical colour arrays).
- The Legacy / an unknown id must not throw (falls back to woods).
- The Gorge rock and bedding colours change but its 28 draws do not.
- The ring's foot-to-crown shading (RING_LOOK.foot/crown) still applies to the greens, not to specks.

---

### Task 1: CAMP_LOOKS table, wired into every camp piece, with ring specks

**Files:**
- Modify: `src/world/camp.js` (DEN_LOOK/RING_LOOK/CLEARING/NEST/ROCK_GREY users: `denGeometry`, `ringMesh`, `clearingMesh`, `nestsMesh`, `campRockMesh`, `addLedgeCamp`, `addCamp`)
- Test: `test/camplooks.test.js` (new)

**Interfaces:**
- Produces: `export const CAMP_LOOKS` (frozen, keys woods/river/moor/pines/gorge, each `{ ring: { greens, strand, specks }, den: { base, streak, strand, frame }, floor: { color, surface }, nest: { moss, bracken }, rock }`), `export function campLook(areaId) -> look` (woods for unknown ids). Geometry-shape constants (DEN_LOOK.bump/strands/doorClear, RING_LOOK.foot/crown/strandTube/strandMax/top, CLEARING.y/segments/edge, NEST.r/tube/squash) stay where they are.

- [ ] **Step 1: Record baselines before touching camp.js.** In a scratch node/vitest run on the unmodified code, for each of woods/river/moor/pines record `position.count` of campRing, campDen, campRock, campNests, campClearing geometries (addCamp into a fresh Scene, `{ colliders: [] }`), and for gorge campBedding and the rock. Pin them as a literal object `BASE_VERTS` in the new test.

- [ ] **Step 2: Write the failing tests in `test/camplooks.test.js`:**
  - `'every clan camp has its own look'`: for the five ids, all `floor.color` distinct among the four flat ones, all `rock` distinct across five, `ring.greens[0]` distinct across the four flat ones; `campLook('legacy-x')` equals `CAMP_LOOKS.woods`.
  - `'addCamp paints the floor and the rock in the clan's colours'`: for each flat id, `campClearing.material.color.getHex()` === look.floor.color and `campRock.material.color.getHex()` === look.rock; gorge: `campRock` color === 0xb8825a.
  - `'the ring carries the clan's specks as whole facets'`: for each flat id, walk the ring colour attribute in triangles; count triangles whose three vertex colours all equal (within 1e-6) a speck hex; each speck colour appears on ≥ 1 triangle and its share of triangles is within ±0.5 of its target share × (clump triangles / all triangles) … keep simple: ≥1 triangle and ≤ 2× the target share of all triangles; no triangle has exactly one or two vertices at a speck colour.
  - `'the den and the nests take the clan's colours'`: the den colour attribute's mean is closer to the clan's `den.base`/`streak` blend than to any other clan's (or simpler: woods den colours differ from pines den colours array-wise); nests contain a vertex colour derived from look.nest.moss (moss × factor in [0.8, 1.15] per channel ratio).
  - `'no new vertices'`: every pinned `BASE_VERTS` entry equal after the change.
  - `'the same camp twice is the same colours'`: two addCamp builds of 'moor' → identical ring colour arrays.

- [ ] **Step 3: Run `npx vitest run test/camplooks.test.js`** — expect FAIL (CAMP_LOOKS not exported).

- [ ] **Step 4: Implement.** Add CAMP_LOOKS + campLook; thread `look` into the builders (addCamp passes `campLook(areaId)`; addLedgeCamp passes `campLook('gorge')` for the rock colour and bedding). Rock materials keep `litMaterial(hex, surfaceProps('cobble'))` — same constructor, only the hex. Clearing: `litMaterial(look.floor.color, { surface: look.floor.surface, repeat: repeatFor(look.floor.surface, r*2, r*2), polygonOffset… })`. Add `speckle(geo, specks, salt)` run on the ring's clump parts (not strands): for each triangle i, `h = hash01(cx, cy, cz, salt)` on its centroid; walk specks cumulatively (`h < s0` → speck 0, `h < s0+s1` → speck 1); set all three vertex colours to that hex. Keep 0x… DOORWAY and the kill pile as they are.

- [ ] **Step 5: Run the camp suites:** `npx vitest run test/camplooks.test.js test/camp.test.js test/campdressing.test.js test/campmarks.test.js test/flattrace.test.js test/waterlooks.test.js test/budget.test.js` — expect PASS.

- [ ] **Step 6: Commit** `git add src/world/camp.js test/camplooks.test.js` — "feat(camps3): each clan's camp its own palette and floor".

### Task 2 (parent, not an implementer): live check and report

- AFTER shots with `scratchpad/camps3/camps.mjs <area> after [phone]` for woods/river/moor/pines/gorge (desk) and pines/moor (phone); pair them with the BEFORE shots; tune any colour that reads badly on screen (table values only) with a follow-up commit.
- Pines camp turn (#15): parked; it moves colliders and needs the owner. In walk view the camp pines are tree-fade occluders (builder.pine PINE_OCCLUDER); the survey's blocked view is the scripted high override camera, which the fade never runs for.
- Full test suite and `npm run build`.
