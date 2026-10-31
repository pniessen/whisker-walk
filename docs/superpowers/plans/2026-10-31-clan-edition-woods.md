# Clan Edition: the Edition Switch and the Woods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A saved Clan / Legacy edition switch, a home-screen territory map drawn from the 11-year-old's layout, and the Woods as the first all-new territory the kids can walk.

**Architecture:** The edition is one additive save field read through a small pure module (`src/edition.js`). Legacy hides the clan layer at display and walk-start time; it never deletes anything. The Woods is a new outdoor area built like `src/world/park.js`, registered in the same tables as the four existing areas, and offered only in Clan Edition through an inline-SVG territory map. Colony feeding in the Woods stays off until the owner has run one SQL edit.

**Tech Stack:** Vanilla JS, Three.js 0.185, Vite 8, Vitest 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-editions-and-territories-design.md` (decisions 1–9, §1, §3, §8). Also binding: the clan spec's §8 invariants, `docs/superpowers/specs/2026-10-25-whisker-walk-v21-the-clan-design.md`.

## Global Constraints

- `SAVE_VERSION` stays 4. Every new save field is additive, sanitised on load, and defaulted.
- The clan spec's §8 invariants hold and are pinned by tests: **no cat un-tames, no cat is dropped, a v4 save still loads, `COLONY_MAX` (24) and `SOLO_MAX` (12) are unchanged.**
- Legacy hides the clan layer; it never deletes it. Flipping the edition there and back leaves the save deep-equal apart from `edition`.
- A Legacy walk writes no clan field: no rival border marks, no contested marks, no role settling from a feed.
- An area builds identically in both editions. No world file reads the edition. Nothing on the wire changes.
- New edition default is `'clan'` for existing and new saves (spec §1, flagged for the owner).
- The Woods' area id is `woods`. Twolegplace is the `neighborhood` id under a Clan Edition name.
- The Woods costs 0 points and opens after 2 walks in the Neighborhood (`requires: { area: 'neighborhood', walks: 2 }`).
- Every borrowed *Warrior Cats* word lives in `src/clanwords.js`; the structural scan in `test/clanwords.test.js` covers any new word list.
- Sea Legs is a shortcut, never a key: nothing a kid must reach in the Woods is cut off by water except through a dry deck.
- The Woods' budget is the Cozy Neighborhood's: at most 450 meshes, 380 casters and 60,000 triangles as built; 260 meshes and 205 casters merged.
- No rival patrol, legendary cat, prop set (carryables, knockables, rests, flaps) or kittypet wanderer in the Woods in this plan.
- Comments and docs are plain and say why. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npx vitest run --exclude '.claude/**'` (139 files / 3,366 tests passing at the start). Build: `npm run build`.

## Review Focus

1. **A kid flips to Legacy while their chosen place is the Woods.** Legacy walks the Neighborhood and its dock says Cozy Neighborhood; flipping back shows the Woods again, with `state.area` never rewritten. Tests in Tasks 1 and 8.
2. **A Legacy kid joins a co-walk the Clan kid hosts in the Woods** (and the reverse in the Park). The joiner walks the host's area without unlocking it, sees no rival patrol in Legacy, and the Clan kid's patrol stays local. Tests in Tasks 1 and 7.
3. **A save from a device that hasn't updated** (no `edition`, no `woods` keys) **or a cloud payload with junk in the new fields.** It loads on Clan Edition with every cat, walk count and unlock intact; junk becomes the default. Tests in Tasks 2 and 3.
4. **The river cutting the Woods in two.** Every POI, race ring, collectible, scenic and golden mouse north of the river is reachable dry over the log bridge or the stepping stones. Tests in Tasks 5 and 6.
5. **Tapping a "coming soon" territory, the Gorge, or a still-locked Woods.** Nothing is bought and `state.area` doesn't change; the locked Woods shows "opens after 2 walks in Twolegplace · n/2". Tests in Task 10.

## Owner steps

These are for the owner (the parent), not the implementer.

1. **Update both devices before either kid walks the Woods.** After the deploy that carries Tasks 1–10, on **both** kids' devices close every Whisker Walk tab (and the home-screen app, if it is installed), reopen it, and check that Settings shows the new **Game edition** row. An old build that loads a save drops what it doesn't know: the Woods unlock and walk count, Woods marks, and (until Task 3 is on the device) any colony cat whose area is `woods`. The co-walk lobby on an old build ignores a Woods walk proposal, so a stale device simply won't join.
2. **Run one SQL edit in Supabase before Task 11 is deployed.** In `docs/supabase-colony.sql`, line 384 of the `colony_feed` function changes from

   ```sql
        or p_area is null or p_area not in ('neighborhood', 'park', 'seaside', 'docks')
   ```

   to

   ```sql
        or p_area is null or p_area not in ('neighborhood', 'park', 'seaside', 'docks', 'woods', 'moor', 'river', 'pines', 'island', 'gorge')
   ```

   A function body can't be patched one line at a time, so paste the whole `create or replace function public.colony_feed(...)` block (lines 371–419, with the new line) into the Supabase SQL editor and run it. Then check it took:

   ```sql
   select prosrc like '%''woods''%' from pg_proc where proname = 'colony_feed';
   ```

   Expected: `true`. All six territory ids go in now so later territories need no SQL; an id no map uses yet is harmless. Task 11 commits the same line to the repo copy.
3. **Check the Woods on the iPhone 18** after Task 12: a Woods walk on the HIGH tier holds 60 fps, the same reading the Neighborhood was given in Stream 4.

## What this plan defers (each gets its own plan)

- **The per-kid clan pick** and the allies rule (decision 2).
- **The homage name lists** for her to choose from (decision 3). Until then the Woods has **no rival patrol**.
- **Kittypets**: the name list, collars, "the kittypet" wording, and **wanderers** into territories (decision 6).
- **The other territories**: the River and Marshes, the Moor, the Pines and Swamp, and later the Gorge.
- **The island** and its bridge, with the truce path.
- **Border crossings** (spec §3). The Woods shows its neighbours on the horizon only.
- In the Woods: prop sets (carryables, knockables, rests, flaps, a dog yard), a legendary cat, and Clan Edition's "Camp" wording.

## Files

| File | Responsibility |
|---|---|
| `src/edition.js` (new) | Pure edition rules: sanitise, titles, place names, which area a Legacy walk uses, whether a rival runs |
| `src/clanwords.js` | Gains `PLACE_WORDS` (Twolegplace) |
| `src/progression.js` | `edition` field, `setEdition`, Woods catalog entry and walks key, Legacy feed skips role settling |
| `src/colony.js` | Keeps colony cats in well-formed unknown areas; `feedsHere(areaId)` |
| `src/game/walk.js`, `src/game/interactions.js` | Legacy: no rival, no outsider words; no feed prompt where the colony doesn't feed |
| `src/ui/homebase.js`, `src/ui/colonypanel.js` | The switch (title and Settings); Legacy shows plain colony cards and hides the star-name picker |
| `src/world/builder.js` | Horizon side tints and one-sided rooftops; log bridge, stepping stones, fallen log, reed bed |
| `src/world/woods.js` (new) | The Woods map |
| `src/goldmice.js`, `src/marks.js`, `src/render/{grass,clouds,pawprints,ambient}.js` | Woods entries |
| `src/territories.js` (new) | Her layout as data, and the territory map's model |
| `src/ui/territorymap.js` (new) | The territory map as inline SVG |
| `src/ui/dressingroom.js` | "Where to?" by edition: Legacy cards, or the map plus "Other places" |

## The Woods in numbers

Coordinates are metres, x east, z south (north is −z, as the corner map draws it). Her board puts the lake north-west of the Woods, the pond on its west edge, the river along its north, Twolegplace to the east and the Moor to the north (spec §3, §4).

| Thing | Value |
|---|---|
| `bounds` | `{ minX: -50, maxX: 50, minZ: -50, maxZ: 50 }` |
| `SPAWN` | `{ x: 44, z: 12 }`, on the short path where it comes in from Twolegplace |
| Ground | `b.ground(120, 0x5f9a4a, { surface: 'grass' })`; `groundBounce: 0x5f9a4a` |
| Sky | `b.applySky(scene, 0xa8d8c0, 0xd0ead8)`; `skyDusk: { top: 0x26344f, horizon: 0x5f5a72 }` |
| `LAKE` | `{ id: 'lake', kind: 'rect', minX: -120, maxX: -14, minZ: -120, maxZ: -34 }` (the Woods' lakeshore, opening to the north-west) |
| `POND` | `{ id: 'pond', kind: 'circle', x: -44, z: -6, r: 6 }` (on the west edge, shared with the River and Marshes) |
| `RIVER_WEST` | `{ id: 'river-west', kind: 'rect', minX: -40, maxX: 23, minZ: -14, maxZ: -9, decks: [LOG_BRIDGE] }` |
| `RIVER_NORTH` | `{ id: 'river-north', kind: 'rect', minX: 18, maxX: 23, minZ: -120, maxZ: -9, decks: [STEPPING_STONES] }` (turns north to the Moor) |
| `LOG_BRIDGE` | `{ minX: -6, maxX: -3, minZ: -15.5, maxZ: -7.5 }` |
| `STEPPING_STONES` | `{ minX: 16.5, maxX: 24.5, minZ: -30.5, maxZ: -27.5 }` |
| `WOODS_PATHS` (3 m wide, `surface: 'sand'`, `color: 0x9c7c58`) | short path `[50,12,26,6]`, `[26,6,6,10]`; long path `[50,40,0,44]`, `[0,44,-50,40]`; north path `[46,12,46,-50]`; glade path `[6,10,-4.5,-6]`, `[-4.5,-17,-18,-24]` |
| The clearing | open circle at `(4, 12)`, radius 9: no trees |
| Great Oak chain | mossy boulder perch `(8, 20)` y 0.72 `'stone'` (collider r 0.7) → oak `(9.6, 21.4)` scale 1.6 (collider r 0.8), branch perch y 2.1 `'tree'`, label `'great oak lookout'`, vantage |
| Lookout Rocks chain | `(-22, -26)` y 0.72 `'stone'` (collider r 0.7) → `(-23, -27)` y 1.9 `'stone'` (collider r 0.9), label `'lookout rocks'`, vantage |
| Fallen log | `b.fallenLog(-2, 16, 5, 0.3)`, perch `(-2, 16)` y 0.5 `'tree'`, three colliders r 0.4 spaced 1.6 m along its axis |
| `pois` (9) | `(4,12)`, `(-30,2)`, `(-20,-24)`, `(30,-24)`, `(36,30)`, `(-12,32)`, `(-36,22)`, `(16,-2)`, `(40,-40)` |
| `scenics` | `{ id: 'lake-view', x: -26, z: -30, label: 'the lakeshore' }`, `{ id: 'woods-pond', x: -34, z: -2, label: 'the pond on the border' }`, `{ id: 'great-oak', x: 6, z: 23, label: 'the great oak' }` |
| `collectibles` | `woods-find-1 (-8, 26) 'a glossy acorn'`; `woods-find-2 (30, -34) 'a jay feather'`; `woods-find-3 (-28, -20) 'a snail shell by the river'`; `woods-find-4 (32, 24) 'a dry oak leaf, just right for a nest'`; `woods-find-5 (-22, -26, y 0.72) 'a ball of moss on the lookout rock'` |
| Golden mice | `gm-woods-1 (9.6, 21.4, y 2.1)` top of the Great Oak; `gm-woods-2 (-23, -27, y 1.9)` top of Lookout Rocks; `gm-woods-3 (-38, 30, y 0)` hidden among bushes at `(-36,28)`, `(-40,28)`, `(-38,33)` |
| Scenery trees | `woodsTreeSpots()`: 24–32 trees, seeded (see Task 5) |
| Reeds | one `b.reedBed`, a clump every 2.5 m: round the pond's east half, along the lakeshore at z −33 for x −45..−16, and along both river banks, keeping 1.5 m clear of both decks |
| Island on the horizon | a low mound (flattened sphere, r 9) and `b.tree(-72, -72, 2.6)` at `(-72, -72)`, inside `LAKE` and outside `bounds`, no collider |
| Horizon | `kind: 'hills'`, inner 56, outer 116, height 7, wavelength 34, colour `0x5d8a55`, salt 31, `avoid: [LAKE]`, `sideTints: { north: 0x9a8a9c, east: 0x7e9a6e, south: 0x4f7a48, west: 0x8fa070 }`, `rooftops: { from: 0.1, to: 0.25, count: 14, height: 6 }` |
| `critterSpawns` | birds at the first four `woodsTreeSpots()`; squirrels `(-24,30)→(-30,10)` and `(28,-10)→(36,-30)`; butterflies `(2,8)`, `(8,14)`, `(-2,12)`; ducks `(-44,-6)`, `(-42,-4)`, `(-46,-8)`; mice `(-9,25)→(-4,30)` and `(30,26)→(34,20)`. No villagers. |
| `moments` | `{ id: 'squirrel-dash', label: 'two squirrels racing up the great oak', x: 9, z: 24, from: { x: 20, z: 30 } }` |
| `puddles` | `{ x: 20, z: 34, r: 0.9 }`, `{ x: -16, z: 6, r: 0.8 }` |
| `boxes`, `tippables` | `[]` (nothing Twoleg-made in the Woods) |

---

### Task 1: Edition rules

**Files:**
- Create: `src/edition.js`
- Modify: `src/clanwords.js` (add `PLACE_WORDS` after `OUTSIDE_WORDS`)
- Test: `test/edition.test.js`, `test/clanwords.test.js` (add `PLACE_WORDS` to `BORROWED` at line 102)

**Interfaces:**
- Consumes: `CLAN_SUFFIX` from `src/clanwords.js`; `rivalFor(areaId)` from `src/rivalclans.js`.
- Produces:
  - `PLACE_WORDS = Object.freeze({ twolegplace: 'Twolegplace' })` in `src/clanwords.js`.
  - `EDITIONS = Object.freeze(['clan', 'legacy'])`, `DEFAULT_EDITION = 'clan'`.
  - `sanitizeEdition(v) -> 'clan' | 'legacy'`.
  - `isClanEdition(state) -> boolean`: false only when `state.edition === 'legacy'`.
  - `editionTitle(edition) -> string`: `` `${CLAN_SUFFIX} Edition` `` or `'Legacy Edition'`.
  - `areaInEdition(entry, edition) -> boolean`: Legacy hides a catalog entry whose `edition` is `'clan'`; Clan shows everything.
  - `placeName(areaId, edition, catalog) -> string`: Twolegplace for `neighborhood` in Clan Edition, else the catalog name, `''` for an unknown id (own-property read).
  - `effectiveArea(state, catalog) -> string`: `'neighborhood'` when Legacy and `state.area` is clan-only, else `state.area`. Never writes.
  - `rivalForWalk(areaId, edition) -> rival | null`: `null` in Legacy, else `rivalFor(areaId)`.
  - `accessoryName(entry, edition) -> string`: `entry.legacyName` in Legacy when it has one, else `entry.name`.

- [ ] **Step 1: Write the failing tests** in `test/edition.test.js`:
  - `sanitizeEdition keeps the two editions and turns anything else into clan`: `'legacy'`→`'legacy'`, `'clan'`→`'clan'`; `undefined`, `null`, `'Legacy'`, `42`, `{}` → `'clan'`.
  - `isClanEdition is false only for legacy`: `{ edition: 'legacy' }` false; `{ edition: 'clan' }`, `{}`, `null` true.
  - `editionTitle names both editions`: `'Clan Edition'` and `'Legacy Edition'`.
  - `areaInEdition hides clan-only places in Legacy only`: `{ edition: 'clan' }` is false in `'legacy'`, true in `'clan'`; `{}` is true in both.
  - `placeName calls the Neighborhood Twolegplace in Clan Edition only`: with the real `CATALOG`, `('neighborhood','clan')` is `'Twolegplace'`, `('neighborhood','legacy')` is `'Cozy Neighborhood'`, `('park','clan')` is `'City Park'`, `('__proto__','clan')` is `''`.
  - `effectiveArea sends a Legacy walk to the Neighborhood when the chosen place is clan-only`: with `catalog = { areas: { neighborhood: {}, park: {}, woods: { edition: 'clan' } } }`, Legacy + `woods` → `'neighborhood'`, Clan + `woods` → `'woods'`, Legacy + `park` → `'park'`; the state object is unchanged afterwards.
  - `rivalForWalk: none in Legacy, today's in Clan`: `rivalForWalk('park','legacy')` is null; `rivalForWalk('park','clan')` equals `rivalFor('park')`; `rivalForWalk('woods','clan')` is null.
  - `accessoryName drops the clan word in Legacy only`: `{ name: 'Clan War Paint', legacyName: 'War Paint' }` gives `'War Paint'` in Legacy and `'Clan War Paint'` in Clan; `{ name: 'Bow' }` gives `'Bow'` in both.
  - In `test/clanwords.test.js`: `PLACE_WORDS is frozen, and the scanner flags its words`: `Object.isFrozen(PLACE_WORDS)` and `borrowedIn("const a = 'Twolegplace';")` contains `'Twolegplace'`.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run test/edition.test.js test/clanwords.test.js`. Expected: import errors / the new clanwords case fails.
- [ ] **Step 3: Implement** `src/edition.js` (pure: no DOM, no THREE, no `colony.js` import) and `PLACE_WORDS`.
- [ ] **Step 4: Run them and confirm they pass**, including the existing "no borrowed word is hard-coded" scan.
- [ ] **Step 5: Commit.** `feat(editions): edition rules and the Twolegplace place word`

### Task 2: The saved edition

**Files:**
- Modify: `src/progression.js`
  - `edition: 'clan'` in `defaultState()` after `mapMode` (around line 498), with a one-line comment that it is additive and SAVE_VERSION stays 4.
  - `edition: sanitizeEdition(parsed.edition)` in `sanitizeState`'s return (around line 858).
  - `setEdition(e)` next to `setMapMode` (around line 1182).
  - `feedColonyCat` (around line 1591): settle roles only when `isClanEdition(state)`.
- Test: `test/progression.test.js` (add `edition` to the destructure at line 1959 and its expected tuple)

**Interfaces:**
- Consumes: `sanitizeEdition`, `isClanEdition` from Task 1.
- Produces: `progression.state.edition: 'clan' | 'legacy'`; `progression.setEdition(edition)`: ignores anything but the two editions, saves only on a change.

- [ ] **Step 1: Write the failing tests**:
  - `a fresh save starts on Clan Edition`.
  - `setEdition('legacy') persists across a reload`, with the file's existing storage stub.
  - `setEdition ignores junk`: `setEdition('Legacy')` and `setEdition(null)` leave `'clan'`.
  - `junk edition in a stored or cloud payload loads as clan`: `'sideways'`, `42`, `null`, `{}`.
  - `an old v4 save without the field loads as clan`.
  - `a Legacy feed does not write clanRoles`: pick `n`, the first non-shy `CAT_NAMES` entry with `medicineOrder([{ name: n, tamedWalk: 'walk-1' }]).length === 1`. On a solo save with `edition: 'legacy'`, taming `n` with the file's `tameOne` helper (line 1933) leaves `state.clanRoles` equal to `{ medicine: null, deputy: null }`; on `'clan'` it sets `medicine` to `n`.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run test/progression.test.js`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass.**
- [ ] **Step 5: Commit.** `feat(editions): remember the edition in the save`

### Task 3: Pin the invariants, and keep colony cats from future areas

**Files:**
- Modify: `src/colony.js`
  - `sanitizeCat` (line 369–372): accept `area` when it is in `COLONY_AREAS` **or** matches `FUTURE_AREA_ID = /^[a-z]{2,16}$/`. Comment: a cat from a territory this build doesn't know is kept, never placed in a walk, and still lives in the den once tamed; this is what stops a stale build dropping a tamed cat (invariant 2).
  - `feedCat` still refuses an area outside `COLONY_AREAS` (no new cats in unknown areas).
  - Add `feedsHere(areaId) -> boolean`: `COLONY_AREAS.includes(areaId)`.
- Test: `test/editions.invariants.test.js` (new), `test/colony.test.js`

**Interfaces:**
- Consumes: `createProgression`, `sanitizeColony`, `mergeColony`, `COLONY_MAX`, `SOLO_MAX`, Task 2's `setEdition`.
- Produces: `feedsHere(areaId) -> boolean` from `src/colony.js`.

- [ ] **Step 1: Write the failing tests.** In `test/editions.invariants.test.js`, build one rich v4 save fixture (no `edition` key): three colony cats, two tamed (`tamedBy`/`tamedWalk` set), one of them with `area: 'woods'`; a clan name; both role verdicts; a border mark and a contested scratch in `marks.park`; walks, golden mice, points.
  - `flipping the edition there and back leaves the save deep-equal apart from edition`: load, `setEdition('legacy')`, `setEdition('clan')`; `JSON.parse(storage)` minus `edition` deep-equals the first load minus `edition`.
  - `no cat un-tames: tamedBy and tamedWalk survive load, a flip and a Legacy feed of another cat`.
  - `no cat is dropped: a tamed cat in the Woods, and one in an area this build has never heard of, both survive`: `sanitizeColony` keeps cats with `area: 'woods'` and `area: 'moor'`; `mergeColony(local, remote)` keeps both when only `local` has them.
  - `a hostile area is still refused`: `area: 'Woods!'`, `'__proto__'`, `''`, `'a'`, a 17-letter id are dropped.
  - `a v4 save still loads`: the fixture loads with every cat, walk count, unlock, mark and golden mouse it had, and `edition === 'clan'`.
  - `edition is the only new top-level key`: the sorted `Object.keys(state)` equal the sorted list of the 31 keys `sanitizeState` returned at `fb6ba0f` plus `'edition'`. Those 31 are `version, points, walks, unlocked, equipped, area, lifetimePoints, bestWalk, friends, petName, journal, golden, streak, kitten, race, den, skills, feats, duskWalks, gifts, grudges, colony, clanRoles, clan, marks, retired, redeemed, visits, visitPrizesSeen, visitPrizePending, mapMode`.
  - `the caps are unchanged`: `COLONY_MAX === 24`, `SOLO_MAX === 12`, `colonyCap(1) === 12`, `colonyCap(2) === 24`.
  - In `test/colony.test.js`: `feedsHere is true for the four colony areas and false for the Woods and the den`, and `feedCat still refuses an unknown area with 'bad'`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** the `sanitizeCat` change and `feedsHere`.
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `feat(editions): pin the colony invariants; keep cats from future territories`

### Task 4: Builder pieces the Woods needs

**Files:**
- Modify: `src/world/builder.js`
- Test: `test/builder.test.js`

**Interfaces:**
- Produces (all in `src/world/builder.js`, no colliders emitted by any of them):
  - `horizonBand({ ..., sideTints, rooftops })`. Both optional; omitted, the band is byte-identical to today.
    - `sideTints: { north, east, south, west }` (hex) colours the ring by side as vertex colours on the same mesh. Within 15 % of a side's length of a corner, the two sides' colours mix by `smoothstep`, so corners don't show a seam.
    - `rooftops: { from, to, count, height }` adds `count` skyline blocks on the perimeter arc `u ∈ [from, to)` (the `squarePoint` parameter: `0–0.25` is the east side) on any `kind`, merged into the same mesh.
  - `sideTint(x, z, tints) -> number`: the pure colour rule behind `sideTints`.
  - `rooftopSpots({ from, to, count }, inner, outer, salt) -> Array<{ x, z, yaw }>`: the pure placement behind `rooftops`, same `hash01` draws as the skyline.
  - `logBridge(x1, z1, x2, z2, w = 1.6, y = 0.14) -> THREE.Group`: a half-sunk trunk whose top is at `y`, like `bridgeDeck`'s deck height.
  - `steppingStones(x1, z1, x2, z2, n = 5) -> THREE.Mesh`: `n` flat stones at y 0.1, one merged geometry.
  - `fallenLog(x, z, length, yaw) -> THREE.Group`: a lying trunk whose top is at y 0.5.
  - `reedBed(spots: Array<{ x, z }>, seed) -> THREE.Mesh`: one merged mesh of reed clumps, at most 1.1 m tall (under rig.js's `CAST_TALL_HEIGHT` of 1.3, so it never casts).

- [ ] **Step 1: Write the failing tests**:
  - `horizonBand without the new options is unchanged`: position and index arrays equal a snapshot taken from the current code for the park's call.
  - `sideTint gives each side its colour`: `sideTint(0, -100, t) === t.north`, `(100, 0)` east, `(0, 100)` south, `(-100, 0)` west.
  - `rooftopSpots stay on their arc`: for `{ from: 0.1, to: 0.25, count: 14 }`, inner 56, outer 116, every spot has `x >= 56` and there are 14.
  - `horizonBand with rooftops is still one mesh`.
  - `logBridge's top is at y`: its bounding box `max.y` is within 0.01 of 0.14.
  - `steppingStones is one mesh with n stones' worth of vertices`, all below y 0.2.
  - `fallenLog's top is at 0.5`.
  - `reedBed is one mesh, never taller than 1.1`.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run test/builder.test.js`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite** (the horizon snapshot guards every existing area).
- [ ] **Step 5: Commit.** `feat(builder): horizon side tints and rooftops; log bridge, stones, fallen log, reeds`

### Task 5: The Woods: ground, water, paths, trees and horizon

**Files:**
- Create: `src/world/woods.js`
- Modify: `verify-places.html` (add `woods` to its `AREAS`)
- Test: `test/woods.test.js` (new, with `test/budget.test.js`'s canvas stub), `test/water.test.js` (add `woods` to `WATERED`), `test/budget.test.js` (both tables)

**Interfaces:**
- Consumes: Task 4's builder pieces; `createWater` from `src/render/water.js`; `sureClawsTreePerch` from `src/climbing.js`; `mulberry32`, `seedFromCode` from `src/rng.js`.
- Produces, from `src/world/woods.js`:
  - `SPAWN`, `WOODS_WATERS` (`[LAKE, POND, RIVER_WEST, RIVER_NORTH]`, with the decks), `WOODS_PATHS`, all frozen, with the values in "The Woods in numbers".
  - `woodsTreeSpots() -> Array<{ x, z, scale }>`: a 12 m jittered grid seeded by `seedFromCode('woods-trees')`, keeping a spot only if it is at least 3 m from every water edge (`waterClearance`), 3 m from every path centreline, 4 m from every POI, scenic, collectible, golden mouse, chain perch, the fallen log and the spawn, and outside the clearing; at most 32; scale `1.0 + 0.6 × rng()`.
  - `build(scene, { water = {}, wind } = {}) -> areaData`, with `name: 'The Woods'`. This task returns every key `park.js` returns; the content keys Task 6 fills may be `[]` for now.
  - Waters drawn by `createWater` from their own records (`shores` limited to the edges a cat can see, as the Seaside does), the decks drawn by `logBridge` and `steppingStones`, the reed bed, the island mound and tree, and the horizon band.

- [ ] **Step 1: Write the failing tests** in `test/woods.test.js`:
  - `every water is drawn from its own footprint, at the scene root`.
  - `the pond overlaps the river, so the water is continuous`.
  - `the river can be crossed only at the two decks`: a flood fill of dry cells (0.5 m grid, `player.js`'s walkable rule via `isWalkableAt`) from `SPAWN` reaches the glade `(-20, -24)`; with the two decks removed it doesn't.
  - `woodsTreeSpots is deterministic and keeps its clearances`: two calls deep-equal; 24–32 spots; each one at least 3 m from water and paths and outside the clearing.
  - `the island on the horizon is out on the lake and out of reach`: outside `bounds`, inside `LAKE`, and no collider or perch within 20 m of it.
  - `nothing in the Woods reads the edition`: the source of `src/world/woods.js` contains no `edition`.
  - `water.test.js`: add `woods` to `WATERED`, so "nothing the player must reach is in the water" and "no path runs through water" run on it.
  - `budget.test.js`: `['woods', buildWoods, 450, 380, 60000]` and `['woods', buildWoods, 260, 205]`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** `src/world/woods.js`, with a header comment in park.js's style saying what the Woods is, where its edges face, and why the decks exist.
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `feat(woods): the Woods' ground, water, paths, trees and horizon`

### Task 6: The Woods: things to find, climb and race

**Files:**
- Modify: `src/world/woods.js` (POIs, scenics, collectibles, perches, chains, critters, moments, puddles)
- Modify: `src/goldmice.js` (a `woods` entry; `GOLD_TOTAL` becomes 15; the header comment says five areas)
- Test: `test/woods.test.js`, `test/goldmice.test.js` (12 → 15 and "3 per area"), `test/climbing.test.js` (add `woods` to the golden-mouse hop BFS at line 602 and line 625), `test/spots.test.js` (add `woods` to the reachable-POI check)

**Interfaces:**
- Consumes: Task 5's `build`.
- Produces: `GOLD_MICE.woods` (three ids `gm-woods-1..3`), and the content in "The Woods in numbers".

- [ ] **Step 1: Write the failing tests**:
  - `woods: nine POIs, all at least 2 m from water and clear of every collider`.
  - `woods: five collectibles, three scenics, at least one vantage perch`.
  - `woods: the Great Oak chain is two hops and the branch can't be reached from the ground`: `canReach` from y 0 to the boulder, boulder to branch, and not ground to branch.
  - `woods: the Lookout Rocks chain is two hops`, same shape.
  - `goldmice: GOLD_TOTAL is 15, three per area, ids match the save's pattern`.
  - `climbing: every golden mouse in the Woods is reachable with no skills`, through the existing BFS, at hop counts 2, 2 and 0.
  - `spots: every cleared Woods POI is reachable dry from the spawn`.
  - `race: a Woods course of five rings is drawn from its POIs`: `raceCourse(pois, seedFromCode('2026-11-01-woods'))` returns 5 POIs from the nine.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `feat(woods): POIs, finds, golden mice, perches and critters`

### Task 7: Register the Woods

**Files:**
- Modify: `src/progression.js`
  - `CATALOG.areas.woods = { name: 'The Woods', price: 0, requires: { area: 'neighborhood', walks: 2 }, edition: 'clan' }`, after `docks`.
  - `woods: 0` in `defaultState().walks` (line 372), with the existing NaN comment extended.
- Modify: `src/game/walk.js` (`AREAS` gains `woods`, line 108)
- Modify: `src/marks.js` (`MARK_AREAS` and `emptyMarks` gain `woods`)
- Modify: `src/render/grass.js` (`GRASS_STYLES.woods = WOODLAND`; `WOODLAND = { color: 0x5a8f45, hMin: 0.1, hMax: 0.28, width: 1.1, warm: 0.06, sway: 0.25, reach: 1.2, density: woodsDensity }`; `woodsDensity(x, z) = 0.85 * smooth01(0.42, 0.72, patchNoise(x, z, 3.4, 29))`, exported)
- Modify: `src/render/clouds.js` (`CLOUD_AREAS` gains `woods`), `src/render/pawprints.js` (`AREA_RULES.woods = { ground: null, path: 'sand', strip: null }`), `src/render/ambient.js` (`ambientKind('woods') === 'leaves'`)
- Modify: `src/ui/dressingroom.js` (`buildDressingModel`'s `places` lists only entries for which `areaInEdition(entry, state.edition)` holds, so Legacy never shows the Woods; Clan Edition shows it as an ordinary card until Task 10)
- The picture `public/places/woods.jpg` (640 × 360, like `park.jpg`) is taken in Task 12; until then the card's `onerror` drops the image.
- Test: `test/progression.test.js`, `test/marks.test.js`, `test/grass.test.js`, `test/clouds.test.js`, `test/pawprints.test.js`, `test/ambient.test.js`, `test/minimap.test.js`, `test/lobby.test.js`, `test/dressingroom.test.js`

**Interfaces:**
- Consumes: Tasks 5–6's `build`; Task 1's `areaInEdition`.
- Produces: `woods` as a known area id everywhere above.

- [ ] **Step 1: Write the failing tests**:
  - `progression: the Woods is free, clan-only, and opens after 2 Neighborhood walks`: `canBuy('areas','woods')` is false at 1 walk and true at 2 with 0 points; `buy` unlocks it without changing `points`.
  - `progression: a fresh save counts Woods walks from 0`, and `completeWalk('woods')` makes it 1.
  - `progression: an unlocked Woods survives a reload`.
  - `marks: the Woods keeps marks like any area`.
  - `grass: the Woods grows undergrowth`: `GRASS_STYLES.woods.density === woodsDensity`; `woodsDensity` stays within `[0, 0.85]` and is both 0 and above 0.5 somewhere on a 1 m grid over the bounds.
  - `clouds`, `pawprints`, `ambient`: the Woods is listed / has its rule / gets `'leaves'`.
  - `minimap: buildMapLayer for the Woods has ground, edge, four waters with their decks, and paths`.
  - `lobby: a joiner who hasn't unlocked the Woods still accepts a Woods proposal as an override`, in the file's existing override case style.
  - `dressingroom: Legacy lists today's four places and never the Woods`; `Clan lists the Woods`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.**
- [ ] **Step 5: Commit.** `feat(woods): register the Woods as a Clan Edition area`

### Task 8: Legacy goes quiet in a walk

**Files:**
- Modify: `src/game/walk.js`
  - Line 1199: `if (isDen || !rivalForWalk(areaId, progression.state.edition))` in place of `!rivalFor(areaId)`. No patrol means no border decals, no border-mark prompt and no mark contest, so nothing writes a clan field.
  - Line 1516: `hud.setArea(placeName(areaId, progression.state.edition, CATALOG) || areaData.name)`.
  - `beginWalkFromHomebase` (line 295): solo `startWalk({ duskMode, areaOverride })` and room `startRoomTogether({ area })` both use `effectiveArea(progression.state, CATALOG)`; pass `areaOverride` only when it differs from `state.area`, so `state.area` is never rewritten.
- Modify: `src/game/interactions.js`
  - The three greet toasts and two grudge toasts (lines 804, 1158, 1191–1193): the outsider word is `''` when `!isClanEdition(progression.state)`, so Legacy reads "You met Pickles! ♡".
  - The feed prompt scan (around line 850): skip it when `!feedsHere(s.areaId)`.
- Test: `test/interactions.test.js` (the greet harness near line 3044), `test/walk.edition.test.js` (new, built like `test/walk.visitprize.test.js`, which stops a walk by throwing from a mocked builder)

**Interfaces:**
- Consumes: `rivalForWalk`, `placeName`, `effectiveArea`, `isClanEdition` (Task 1); `feedsHere` (Task 3).

- [ ] **Step 1: Write the failing tests**:
  - `interactions: in Legacy, meeting a stray says no outsider word`: with `edition: 'legacy'`, a greet toasts exactly `You met <name>! ♡`; with `'clan'`, the toast contains `the loner` (via `OUTSIDE_WORDS.met`, not a literal).
  - `interactions: no feed prompt where the colony doesn't feed`: a greeted, feedable stray with `s.areaId = 'woods'` gives no `'feed'` prompt; the same stray with `'park'` does.
  - `walk: the rival patrol is gated on the edition`: a source scan of `src/game/walk.js` finds `rivalForWalk(areaId, progression.state.edition)` and no `rivalFor(` call (the same kind of scan the 3a rival-slice test uses; `rivalForWalk` itself is tested in Task 1).
  - `walk: a Legacy kid whose place is the Woods walks the Neighborhood without losing the Woods`: with `vi.mock('../src/world/neighborhood.js')` whose `build` records its call and throws the harness's STOP (the area is built before the avatar, `walk.js` line 419), `beginWalkFromHomebase({})` on a Legacy save with `area: 'woods'` builds the Neighborhood, and `state.area` is still `'woods'` afterwards.
  - `walk: a Legacy room start proposes the Neighborhood`: with `getPendingRoom` truthy, the `startRoomTogether` spy receives `area: 'neighborhood'`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite** and confirm it passes.
- [ ] **Step 5: Commit.** `feat(editions): Legacy walks without the clan layer`

### Task 9: The switch on the home screen

**Files:**
- Modify: `src/ui/homebase.js`
  - Settings: a row after the Map row (around line 305), labelled `Game edition`, a `<select id="set-edition">` with `Clan Edition` (`clan`) and `Legacy Edition` (`legacy`); handled in the existing `change` listener (around line 1261) by `progression.setEdition(value)` then re-render.
  - Title (around line 832): `` `🐾 Whisker Walk 2: <button class="dr-edition" data-edition-toggle>${editionTitle(edition)}</button>` ``; a click on `[data-edition-toggle]` flips the edition and re-renders.
  - The star-name picker (line 199) renders only in Clan Edition.
  - The sheet dock's "Walking in" line (line 801–807) names `effectiveArea(...)` with `placeName(...)`.
  - `renderColonyHtml` gets `edition: s.edition`.
- Modify: `src/progression.js`: `CATALOG.accessories.warpaint` gains `legacyName: 'War Paint'`.
- Modify: `src/ui/dressingroom.js`: the slot label (line 89) and the slot picker (line 140) name an accessory with `accessoryName(entry, state.edition)`.
- Modify: `src/ui/colonypanel.js`: `renderColonyHtml({ ..., edition })`. In Legacy a card's headline is the stored name, there is no rank or role line, and the clan title (line 307) is not shown. Clan Edition is unchanged.
- Modify: `src/style.css`: `.dr-edition` as a text-styled button (no border, inherits the title font, underline on hover).
- Test: `test/homebase.edition.test.js` (new, copying `test/homebase.map.test.js`'s fakes), `test/colonypanel.test.js`

**Interfaces:**
- Consumes: `setEdition` (Task 2); `editionTitle`, `isClanEdition`, `placeName`, `effectiveArea`, `accessoryName` (Task 1).

- [ ] **Step 1: Write the failing tests**:
  - `the Settings edition control calls setEdition with the chosen value`, both ways.
  - `tapping the title's edition flips it and the title follows`: header HTML contains `Clan Edition`, then after the click `Legacy Edition`, and `progression.state.edition === 'legacy'`.
  - `Legacy hides the star-name picker; Clan shows it`.
  - `Legacy's dock says Cozy Neighborhood when the chosen place is the Woods`.
  - `dressingroom: Legacy names the war paint without the clan word`: the face-slot picker for an owner of `warpaint` shows `War Paint` in Legacy and `Clan War Paint` in Clan (through `CLAN_SUFFIX`, not a literal).
  - `colonypanel: a Legacy card shows the stored name and no rank`: a tamed `Pickles` renders `Pickles` and none of the `RANK_WORDS` values; the same colony in Clan renders `clanNameOf(...)`.
  - `colonypanel: Legacy shows no clan title`, given `clanName: 'MossClan'`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.**
- [ ] **Step 5: Commit.** `feat(editions): the edition switch in Settings and on the title`

### Task 10: The territory map on the home screen

**Files:**
- Create: `src/territories.js` (data and model; pure)
- Create: `src/ui/territorymap.js` (`renderTerritoryMapHtml`)
- Modify: `src/ui/dressingroom.js`
  - `buildDressingModel`: Clan Edition adds `territoryMap: territoryMapModel(state, catalog)` and `otherPlaces` (the Park, Seaside and Docks cards, today's `places` shape). Legacy is unchanged from Task 7.
  - `renderDressingRoomHtml`'s "Where to?" section: Legacy renders `places` as today; Clan renders the map, then `<p class="dr-label">Other places</p>` and `otherPlaces`.
  - `currentPlace.name` uses `placeName`.
- Modify: `src/style.css` (`.territory-map`: full width up to 520 px; built/locked/soon/later looks)
- Test: `test/territories.test.js` (new), `test/dressingroom.test.js`, `test/dressingroomcontroller.test.js`

**Interfaces:**
- Consumes: `placeName`, `isClanEdition`, `areaInEdition` (Task 1); `CATALOG.areas.woods` (Task 7).
- Produces:
  - `BOARD = { w: 1000, h: 700 }`; `TERRITORIES`: frozen, in this order —
    `{ id: 'twolegplace', areaId: 'neighborhood', x: 843, y: 566, r: 110, status: 'built' }`,
    `{ id: 'woods', areaId: 'woods', name: 'The Woods', x: 565, y: 500, r: 170, status: 'built' }`,
    `{ id: 'moor', areaId: null, name: 'The Moor', x: 620, y: 161, r: 165, status: 'soon' }`,
    `{ id: 'river', areaId: null, name: 'The River and Marshes', x: 232, y: 488, r: 160, status: 'soon' }`,
    `{ id: 'pines', areaId: null, name: 'The Pines and Swamp', x: 308, y: 199, r: 150, status: 'soon' }`,
    `{ id: 'gorge', areaId: null, name: 'The Gorge', x: 815, y: 353, r: 80, status: 'later' }`.
    Twolegplace's name comes from `PLACE_WORDS.twolegplace`.
  - Her water and paths, simplified from her drawing (board units):
    - `LAKE = [[397,370],[402,281],[405,241],[416,220],[431,209],[452,207],[472,209],[495,220],[507,237],[522,327],[517,352],[469,415],[450,426],[429,425],[400,408]]`
    - `ISLAND = { name: 'The island', status: 'soon', outline: [[437,307],[444,297],[456,291],[476,289],[485,309],[478,321],[464,329],[449,329],[440,320]] }`, `STAR = { x: 455, y: 314 }`
    - `POND = { x: 380, y: 463, r: 22 }`
    - `RIVER = [[143,376],[183,374],[195,394],[295,393],[275,451],[320,453],[339,437],[362,447],[402,462],[425,442],[446,442],[461,430],[544,424],[559,435],[579,434],[598,410],[623,406],[636,384],[630,374],[644,338],[642,304],[614,280],[634,226],[631,206],[614,199],[555,205],[504,178],[455,196]]`
    - `PATHS = { short: [[737,551],[716,538],[712,512]], north: [[717,518],[730,440],[721,366],[737,322],[747,236],[771,178]], long: [[738,554],[720,560],[667,624],[529,663],[377,639],[322,614]] }`
    - `BRIDGE = [[395,232],[444,297]]`
  - `territoryMapModel(state, catalog) -> { regions: Array<{ id, name, areaId, x, y, r, status, owned, selected, locked, canOpen, line }>, island, star, lake, pond, river, paths, bridge }`. `line` is one of: `today's walk`; `tap to walk here`; `Tap to explore` (free and open); `opens after N walks in Twolegplace · have/N so far`; `coming soon`; `unexplored`.
  - `renderTerritoryMapHtml(model) -> string`: one `<svg viewBox="0 0 1000 700" class="territory-map" role="img" aria-label="Territory map">`. A built region is a `<g data-dr-place="<areaId>">`, so the dressing-room controller's existing `onPlace` buys (free) or selects it; a `soon`/`later` region and the island have no `data-dr-place`. Every text node is escaped.

- [ ] **Step 1: Write the failing tests** in `test/territories.test.js`:
  - `the layout is her drawing`: six regions with the centres and radii above, and the star inside the island's outline.
  - `Twolegplace is the Neighborhood and is always open`.
  - `the Woods is locked until 2 Twolegplace walks, then "Tap to explore", then "tap to walk here" once opened`.
  - `the selected place says today's walk`.
  - `coming soon and unexplored regions can't be tapped`: the HTML for `moor`, `river`, `pines`, `gorge` and the island carries no `data-dr-place`.
  - `the map has the lake, the island, the pond, the river, three paths and the bridge`.
  - `names are escaped`: a catalog name `<b>` renders as `&lt;b&gt;`.
  - `dressingroom: Clan shows the map and the Park, Seaside and Docks under Other places`.
  - `dressingroomcontroller: tapping the locked Woods buys nothing and keeps the area`; `tapping the opened Woods selects it`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and the build.**
- [ ] **Step 5: Commit.** `feat(editions): the territory map on the home screen`

### Task 11: Colony feeding in the Woods (after owner step 2)

**Do not merge this task until the owner has run the SQL in "Owner steps" and confirmed both devices are on a build with Task 3.**

**Files:**
- Modify: `src/colony.js` (`COLONY_AREAS` gains `'woods'`)
- Modify: `docs/supabase-colony.sql` line 384, exactly as in owner step 2
- Test: `test/colony.test.js`, `test/editions.invariants.test.js`

**Interfaces:**
- Consumes: `feedsHere` (Task 3).

- [ ] **Step 1: Write the failing tests**:
  - `feedsHere('woods') is true`, and the Task 3 case that said false is updated in the same commit.
  - `a Woods stray can be fed and tamed solo`, through `feedCat`, keeping its spot.
  - `the repo SQL accepts the six territory ids`: read `docs/supabase-colony.sql` and assert line 384 contains `'woods', 'moor', 'river', 'pines', 'island', 'gorge'`.
  - `COLONY_MAX and SOLO_MAX are still 24 and 12`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite.**
- [ ] **Step 5: Commit.** `feat(woods): colony feeding in the Woods`

### Task 12: Check it live, and write it down

**Files:**
- Create: `public/places/woods.jpg`
- Modify: `docs/VISUAL-PASS.md` (a short "The Woods" entry: build-time and merged mesh and caster counts from `test/budget.test.js`, the in-game draw count, what was and wasn't checked)

- [ ] **Step 1: Run the full suite and the build.** Expected: all pass.
- [ ] **Step 2: Check it live.** Start the `whisker-walk-dev` server (port 5174). The automated browser can't hold keys down, so use what it can do.
  - Home screen in Clan Edition: the map shows six regions, the lake, the island and the paths; the Woods says "Tap to explore" on a save with 2 Neighborhood walks. Screenshot at 1280 × 720 and at the mobile preset (375 × 812).
  - Flip to Legacy on the title: the four cards, no Woods, the dock says Cozy Neighborhood; flip back.
  - Open and start the Woods: the corner map shows the lake, river, pond and paths; the horizon shows rooftops to the east and the island across the lake from the glade.
  - `?perf`: the Woods' draw count is no higher than the Neighborhood's on the same tier.
  - `verify-places.html?area=woods` builds. Take the 640 × 360 `woods.jpg` from the spawn view.
  - No console errors. Reset the viewport to desktop afterwards.
- [ ] **Step 3: Write the VISUAL-PASS entry.**
- [ ] **Step 4: Commit.** `docs(woods): the Woods' budget and live check`
