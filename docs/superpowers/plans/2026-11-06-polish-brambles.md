# polish-brambles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The camp bramble rings (Woods, River, Moor, Pines) stop reading as crumpled paper balls and read as leafy bramble mounds with thorny canes arching over them and berries on most clumps.

**Architecture:** Render-only rewrite inside `src/world/camp.js`: `ringMesh()` builds each clump as a dark core lump, three smaller crown lumps, leaf cards and three berry pyramids; `ringCanes()`/`caneGeometry()` arch the canes higher and add thorn spikes. Still one merged, vertex-coloured, noCast mesh `campRing`, built under `withLocalUuids` (already the case via `addCamp`). Clump positions from `campDressing()` stay byte-identical.

**Tech Stack:** Three 0.185, Vitest 4.

**Spec:** scratchpad `polish-survey-6.md`, "Pass 6" → 6-3 and ranked row #1; shared rules in `polish-common.md`.

## Global Constraints

- Only `src/world/camp.js` functions `ringMesh`, `caneGeometry`, `ringCanes`, the ring entries of `CAMP_LOOKS`, `RING_LOOK`, `CANE` (plus new ring helpers next to them), and the ring tests in `test/camp.test.js`, `test/camplooks.test.js`, `test/campdressing.test.js`.
- `campDressing(a).ring.clumps` byte-identical (pinned test: woods first clump, 84 clumps).
- No Math.random; shapes from `hash01` only. Flat trace stays sha256 `af07901717f1b39482a7befce20f1a80dc09c7e31866ab11bb7459e61d97b83a`; waterlooks BUILD_DRAWS unchanged.
- Ring triangles ≤ old + 3,000 per camp (old: woods 3,240, river 3,252, moor 3,246, pines 3,258) → test cap **6,200** per ring. Whole camp cap in camp.test.js moves from 5,427 by the same delta (→ **8,400**).
- Every ring vertex: 0 ≤ y ≤ 1.0 m, within 0.6 m (xz) of a kept clump. Clump-part vertices inside `CLUMP_R·s` and ≤ `c.h` (as now).
- Ring stays one mesh, `noCast`, `castShadow=false`, vertex colours.

## Review Focus

1. Berry/leaf colours accidentally equal to a clan speck hex → the speck-share test miscounts. Berries are shaded (×0.9–1.1 by hash), never the bare speck hex.
2. Leaf cards are single-sided: they must face outward (normal · outward > 0) or they vanish from outside.
3. Cane thorns must stay ≤ 1.0 m and ≥ 0 and within 0.6 m of a clump (test already sweeps all ring verts).
4. Gate clumps (h up to 0.95) with crown lumps clamped to h: no vertex above 1 m.
5. Determinism: same camp twice → identical colours and positions (existing test).

---

### Task 1: Bramble mounds, leaf cards and berries (ringMesh)

**Files:** Modify `src/world/camp.js` (`RING_LOOK`, `CAMP_LOOKS` ring entries, `ringMesh`, new helpers beside it); tests `test/camp.test.js`, `test/camplooks.test.js`.

**Interfaces — Produces:** `export const RING_CLUMP_TRIS = 59` (core 20 + 3 crowns × 8 + 6 leaves + 3 berries × 3). Clump triangles come first in the merged ring, clump by clump in that part order; cane triangles after.

Design (per clump c, R = CLUMP_R·c.s, out/along as now):
- **Core** (hollow): `IcosahedronGeometry(1,0)`, top at 0.72·h, xz scale 0.95R × 0.85R, through `lumpy`; colour = clump green × (0.42 → 0.78 foot→crown).
- **Crowns** ×3: `OctahedronGeometry(1,0)`, centre azimuth `c.rot + k·2π/3 + jitter`, offset 0.42R from the clump centre (xz), radius rk ∈ [0.38R, 0.5R] by hash, top at h·[0.8, 1.0] (k with the highest hash gets 1.0), random yaw + tip ≤ 0.35 rad so they are not upright diamonds; through `lumpy` (clamps y ≤ h); colour = green × (0.78 → 1.22) plus `speckle` with the clan specks (specks only on core+crowns).
- **Leaf cards** ×6: one triangle each on the mound envelope (half-ellipsoid, horizontal semi-axis 0.8R, vertical 0.88h, azimuth by hash, elevation 0.25–1.1 rad), ~0.11·s long, 0.06·s wide, tip leaning out 0.03; winding flipped so its face normal points outward; colour = green lerped 25 % toward `0x9ab04a` × [1.0, 1.3].
- **Berries** ×3: a 3-sided pyramid (no base), base radius 0.028, apex 0.045 out along the envelope normal, on the envelope at 0.95 scale, elevation 0.3–0.95. If `hash01(c.x, c.z, 0, 50) < look.ring.fruitShare` the clump fruits: each berry picks from `look.ring.fruit` ([hex, weight]) by hash, × [0.9, 1.1]; else bud colour green × 0.7.
- Every clump-part vertex is then clamped: xz radius from (c.x, c.z) ≤ 0.98R, y in [0, h].
- `RING_LOOK` gains core/crown/leaf factors; CAMP_LOOKS ring gains `fruit` and `fruitShare`:
  woods `[[0x2b0d22,.75],[0xa3222c,.25]]`, .8; river `[[0x2b0d22,.8],[0xa3222c,.2]]`, .55; moor `[[0xe0b82e,.6],[0x2b0d22,.4]]`, .7; pines `[[0x2b0d22,.8],[0x8a1c2a,.2]]`, .6. Speck shares halved (they now land on small facets; berries carry the fruit).

- [ ] Step 1: update tests to the new counts: replace every `28 *` clump count with `RING_CLUMP_TRIS *` (camp.test.js "draws the ring…", camplooks "specks" and "no new vertices"); ring cap 3,360 → 6,200, vertex cap 10,080 → 18,600; camp cap 5,427 → 8,400. Add a test "each fruiting clump carries berries in the clan's fruit colours": for each camp, count clumps whose berry triangles (last 9 tris of each clump's 59) match some fruit hex × [0.9,1.1] on all corners; expect ≥ 40 % of clumps and ≤ 100 %. Add "leaf cards face outward": for each leaf tri, face normal · (centroid − clump centre, with y from 0) > 0.
- [ ] Step 2: run `npx vitest run test/camp.test.js test/camplooks.test.js test/campdressing.test.js` → FAIL.
- [ ] Step 3: implement.
- [ ] Step 4: same command → PASS.
- [ ] Step 5: commit `feat(camps): bramble mounds — core, crown lumps, leaf cards, berries`.

### Task 2: Canes arching over, with thorns

**Files:** `src/world/camp.js` (`CANE`, `ringCanes`, `caneGeometry`, ring strand colours); `test/campdressing.test.js`, `test/camp.test.js`, `test/camplooks.test.js`.

**Interfaces — Consumes:** Task 1's `RING_CLUMP_TRIS`. **Produces:** `export function caneTris(cane) -> 6·(n−1) + 3·thorns(n)`, thorns at interior points j odd (j = 1, 3, … ≤ n−2).

Design: `CANE.peak` [0.82, 0.94], `CANE.len` [1.8, 2.8] (more, shorter arches), `w0` 0.04, `w1` 0.018, foot stays 0.08. Thorn: a 3-sided spike from the tube surface at a hash angle, base radius 0.6·w, length 0.05 + 0.5·w, tilted 0.5 rad toward the cane's tip; coloured strand × 1.25 (clamped). Strand colours: woods `0x5a2f22`, river `0x6a4a30`, moor `0x5a3a26`, pines `0x4a3040`. Thorn and cane vertices obey 0 ≤ y ≤ 1.0.

- [ ] Step 1: tests: campdressing `checkCanes` width bounds → 0.018..0.04; max cane y ≥ 0.8; camp/camplooks ring count formula → `RING_CLUMP_TRIS·clumps + Σ caneTris(cane)`; add "every cane carries thorns": total ring tris − clump tris − 6·segs > 0 and equals 3·Σ thorns.
- [ ] Step 2: run the three test files → FAIL.
- [ ] Step 3: implement.
- [ ] Step 4: run → PASS; full suite `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'`, `npm run build`, flattrace + waterlooks green.
- [ ] Step 5: commit `feat(camps): bramble canes arch over the mounds, with thorns`.
