# F6: Loading Each Area's Code Only When Needed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game's start-up download stops carrying every area. Each area (its builder, and for the Farm and the Fairground their animals, rides and games) becomes its own chunk, loaded just before its first walk, cached for offline play by the service worker, and bundled in the iOS app. The start-up scripts go from 873.5 kB to about 640 kB gzipped.

**Architecture:** `startWalk` stays synchronous and draws exactly what it draws today. A new loader (`src/game/areaload.js`) fetches an area's "pack" (`src/world/areas.js`) *before* `startWalk` runs, and a new `startWalkWhenReady` in the walk lifecycle is the one door every caller uses (Explore, the den, a room start, a resumed walk). When the pack is already loaded it calls `startWalk` in the same tick, as today. Main-graph code that reached into area modules for small facts (grass tints, the camp layout, the truce path, beach wetness, farm job ids) gets those facts from small leaf modules or from the loaded pack. The build writes a `precache.json` of every hashed file. The service worker caches all of them on install and prunes by build list, not by count.

**Tech Stack:** Plain ES modules, Vite 8 (Rolldown, `build.manifest`), Vitest (`npx vitest run <file>`), a classic-script service worker, the iOS WKURLSchemeHandler shell (unchanged).

**Spec:** The owner's brief of 2026-11-20 (this plan carries its constraints verbatim below) and the technical review of 2026-11-19 (`report.md` in the review's scratchpad, items F5, F6 and "Leave alone"). The review has no F7 item. F5 (the 900 kB ceiling) is the related one, and it stays. The 2026-11-11 measurement that rejected lazy loading (about 10% saved, `startWalk` made async) is out of date: area-only code is now about 29% of the game, and this design keeps `startWalk` synchronous.

## Measured (2026-11-20, main 0b3d86e1, real `vite build`, Node gzip)

| Build | Start-up scripts (entry + static imports) | Notes |
|---|---|---|
| main today | **873.5 kB** (one 2,537 kB chunk) | found-outfits adds about 9 kB, Rooftops step 2 more |
| walk.js `AREAS` made lazy only | 828.2 kB | only den, docks and gorge split: `render/grass.js`, `render/pawprints.js`, `world/clanground.js` and walk.js's `camp.js` import keep the other nine in the main graph |
| + grass, pawprints, clanground, camp layout cut loose (Tasks 1-2) | 687.9 kB | |
| + Farm and Fair life loaded with their area (Task 5) | 651.4 kB | |
| + farm job ids split from `farmjobs.js` (Task 1) | **640.4 kB** | **-233 kB, -27%**. Index chunk 483.7 kB + shared three.js chunk 156.7 kB |

What entering an area downloads the first time (gzip, its pack minus what start-up already has): neighborhood 7.8, park 5.5, den 6.4, docks 12.0, seaside 12.8, moor 26.9, woods 28.6, river 33.3, pines 35.8, gorge 44.1, farm about 45, fair about 65 (world + rides + games). Loading any area module draws **no** `Math.random` and paints **no** canvas (checked by importing each one after `builder.js` and `textures.js`). So moving their evaluation later moves no random draw.

Measurement scripts (scratch, not committed) did a write-free `vite build` and walked `output[].imports` from the entry chunk. Task 7 makes this a committed check.

## Global Constraints

- The child never sees a broken or blank walk. A short "getting ready" moment on first entry to an area is fine, with the cat card (home) staying up. An error path falls back gracefully (retry, or stay home with a gentle line) and never loses the save.
- Co-walk: both players enter the same area together. If one device is still loading, the other waits or sees them arrive.
- The walk-trace determinism (`test/fixtures/flat-trace.gameplay.json`, frozen) must not move: no RNG draws reordered by async. `git diff --exit-code test/fixtures/` after every task.
- `startWalk` stays synchronous. Nothing awaits between its first line and its last. All waiting happens before it is called.
- No series words in string literals outside the word tables. New text goes through the word tables for both word sets (`phrase()` ids in `src/clanphrases.js`'s `LATER` table, checked by `test/offwords.test.js` with the 'off' set in use).
- Keep the 900 kB ceiling (`MAIN_GZIP_CEILING_KB = 900`). It now measures the start-up scripts honestly: index.html's module script **plus every chunk it imports statically**. A shared chunk must not hide size from it.
- Offline-first is a hard rule: every area works offline after one online visit; the iOS app bundles the whole build (`ios/web/assets/` holds every chunk; no service worker there).
- New tests check behaviour; they never read `src/` as text (docs/SESSION-HANDOFF.md). A text pin this change breaks is replaced by a behaviour test, not edited to match.
- No new packages. Do not touch the main checkout. No merge to main, no push, no database, no `.env`.
- Single test files while working on a task; the full suite (`npx vitest run --dir test`) at the end of Tasks 5, 6 and 9.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A page left open across a deploy, then a new area entered** (an iPad on the home screen overnight while CI deploys). Its old chunk names are gone from Pages. Expected: the service worker still has them, because pruning keeps the newest `KEEP_BUILDS = 3` build lists. Without a worker, the child gets a gentle line, the next Explore retries, and after two failures in a row the next Explore reloads the page (the save is in localStorage; nothing is lost). Pinned in Task 5 (failure count, reload on the third press) and Task 8 (prune keeps the previous builds' files).
2. **Explore pressed on an old iPad while the area is still loading**, then pressed again, or the den tile tapped. Expected: "Getting ready…" on the button after 150 ms, one load, one walk, the second press ignored. Sound still works, because the AudioContext is made inside the tap, before the wait. Pinned in Task 5 (busy guard, `audio.getContext` called before the load resolves).
3. **A co-walk where one device is slow or fails to load**, or is on an older build that has no such area (a sibling's updated phone proposes the Rooftops). Expected: the slow one shows "Starting…" and joins late, and the other sees them arrive. The failing one stays home with the line and stays in the room, and its next Explore gets today's "X is exploring" answer. Neither device crashes. Pinned in Task 6 (rooms: starting stays true while loading, an unknown area ends in 'failed', leaving the room during the load starts nothing).
4. **A first launch offline after an update whose install could not precache everything** (a flaky hotel network). Expected: the next online page load tops up the missing files. An offline walk into an area never visited and never cached gets the offline line, never a blank. Pinned in Task 8 (top-up on navigation) and Task 5 (offline line).
5. **A walk resumed at launch whose area cannot load** (cache cleared by Safari's 7-day rule, then opened offline). Expected: home with the line, the resume note kept (its try already counted), settled by today's `RESUME_MAX_TRIES` rule on a later launch. A build error still settles at once, as today. Pinned in Task 6.

---

## File Structure

New:
- `src/world/areas.js`: the one registry: `AREA_LOADERS` (literal dynamic imports) and `AREA_ENTRY_MODULES` (which source files make each pack). The "how to add an area" comment moves here from walk.js.
- `src/game/areaload.js`: `createAreaLoader()`, which caches packs, retries after a failure and times out.
- `src/world/camplayout.js`: `campLayout`, `campDiscs`, `CAMP_TURN`, `LEDGE_CAMPS`, the layout constants (camp.js lines ~60-193). camp.js re-exports.
- `src/world/pinespaths.js`: `PINES_PATHS`, `TRUCE_PATH`, `BRIDGE_FOOT` (pines.js re-exports).
- `src/world/seasidewet.js`: `wetness` (seaside.js re-exports).
- `src/farmjobids.js`: `FARM_JOB_IDS`, `FARM_FIND_IDS`, `jobJournalId`, `findJournalId`, `FARM_JOURNAL_TYPES`, `JOB_STATES`, `FARM_HAT_ID`, `FARM_HAT_KIND`, `JOB` (farmjobs.js lines 30-91; farmjobs.js re-exports).
- `src/farmnone.js` (`NO_FARM`), `src/fairnone.js` (`NO_FAIR`): farmanimals.js / fairlive.js re-export.
- `scripts/precache.mjs`: `precacheManifest(fileNames)`.
- Tests: `test/arealeaves.test.js`, `test/areas.test.js`, `test/areaimport.test.js`, `test/areaload.test.js`, `test/walkready.test.js`, `test/lazybuild.test.js`, `test/swprecache.test.js`; helpers `test/helpers/headlesswalk.js` (lifted out of walkfreed.test.js), `test/helpers/fakesw.js`, `test/helpers/realbuild.js`.

Modified: `src/game/walk.js`, `src/main.js`, `src/game/rooms.js`, `src/game/crossing.js`, `src/render/grass.js`, `src/render/pawprints.js`, `src/world/clanground.js`, `src/game/farmplay.js`, the area modules with grass hooks (`neighborhood`, `park`, `woods`, `river`, `moor`, `pines`, `farm`, `fair`), `src/ui/colonypanel.js`, `src/ui/homebase.js`, `src/clanphrases.js`, `public/sw.js`, `vite.config.js`, `scripts/buildjson.mjs`, `scripts/smoke.mjs`, docs.

**Files shared with `rooftops-2`** (it merges first; Task 0): `src/game/walk.js` (import block, `AREAS`, `beginWalkFromHomebase`'s `roofsOn()` branch), `src/main.js` (the `readResume` line), `src/render/pawprints.js` (its `AREA_RULES.roofs`; we change only the seaside import), and `test/roofsgame.test.js` (its `import * as roofs` text pin breaks here and is replaced in Task 5). found-outfits-2 shares none of these, but it adds about 9 kB to start-up.

---

### Task 0: Start from main with Rooftops step 2 merged

**Files:** none changed; numbers recorded in the commit message of Task 1.

- [ ] **Step 1:** Check `git log main --oneline | grep -m1 "Rooftops step 2"` shows the merge. If it does not, stop: this plan builds after rooftops-2 merges.
- [ ] **Step 2:** `git merge main` into `f6-lazy`; resolve nothing (this branch has only the plan).
- [ ] **Step 3:** `npm run build` and note the `main script … kB gzipped` line (expected about 873.5 kB + Rooftops + whatever else landed). This is the "before" number.
- [ ] **Step 4:** `npx vitest run --dir test` is green before any change. A red test here is not this plan's to fix: report it.

---

### Task 1: Small facts leave the area modules

The main graph imports four area modules only for small facts. Those facts move into leaf modules, and the area modules re-export them, so every existing import (tests, verify pages, trace helpers) keeps working.

**Files:**
- Create: `src/world/camplayout.js`, `src/world/pinespaths.js`, `src/world/seasidewet.js`, `src/farmjobids.js`, `src/farmnone.js`, `src/fairnone.js`
- Modify: `src/world/camp.js` (move lines ~60-193, re-export), `src/world/pines.js` (move `PINES_PATHS` 243-255, `TRUCE_PATH` 261, `BRIDGE_FOOT` 272; re-export), `src/world/seaside.js` (move `wetness`, re-export), `src/farmjobs.js` (move 30-91, re-export), `src/farmanimals.js` (`NO_FARM` re-export), `src/fairlive.js` (`NO_FAIR` re-export)
- Modify importers: `src/game/walk.js:48` → `../world/camplayout.js`, and `NO_FARM`/`NO_FAIR` imports → `../farmnone.js`/`../fairnone.js` (walk.js keeps importing `createFarmAnimals`, `createFairLive`, `createFairShow` until Task 5); `src/world/clanground.js:28` → `./pinespaths.js`; `src/render/pawprints.js:3` → `../world/seasidewet.js`; `src/game/farmplay.js:20` → `../farmjobids.js`
- Test: `test/arealeaves.test.js`

**Interfaces:**
- Produces: `camplayout.js`: `campLayout(areaId) -> layout|null`, `campDiscs(areaId)`, `CAMP_TURN`, `LEDGE_CAMPS` (identical objects; imports only `../rivalclans.js`, `../clancast.js`). `pinespaths.js`: `PINES_PATHS`, `TRUCE_PATH`, `BRIDGE_FOOT` (imports `./lake.js` only). `seasidewet.js`: `wetness(x, z) -> 0..1` (no imports). `farmjobids.js`: the constants named above (no imports). `farmnone.js`: `NO_FARM`; `fairnone.js`: `NO_FAIR` (no imports).
- Rule for leaf modules: a leaf imports no area module (`src/world/<area>.js` or anything only an area imports). Task 7's build check is what enforces it.

- [ ] **Step 1: Write the failing test** `test/arealeaves.test.js` (same canvas stub as `test/budget.test.js` before the imports):

```js
it('each fact is the same object from its leaf and from its area', async () => {
  expect((await import('../src/world/camp.js')).campLayout).toBe((await import('../src/world/camplayout.js')).campLayout);
  expect((await import('../src/world/camp.js')).campDiscs).toBe((await import('../src/world/camplayout.js')).campDiscs);
  expect((await import('../src/world/pines.js')).TRUCE_PATH).toBe((await import('../src/world/pinespaths.js')).TRUCE_PATH);
  expect((await import('../src/world/pines.js')).BRIDGE_FOOT).toBe((await import('../src/world/pinespaths.js')).BRIDGE_FOOT);
  expect((await import('../src/world/seaside.js')).wetness).toBe((await import('../src/world/seasidewet.js')).wetness);
  expect((await import('../src/farmjobs.js')).JOB).toBe((await import('../src/farmjobids.js')).JOB);
  expect((await import('../src/farmjobs.js')).FARM_JOB_IDS).toBe((await import('../src/farmjobids.js')).FARM_JOB_IDS);
  expect((await import('../src/farmanimals.js')).NO_FARM).toBe((await import('../src/farmnone.js')).NO_FARM);
  expect((await import('../src/fairlive.js')).NO_FAIR).toBe((await import('../src/fairnone.js')).NO_FAIR);
});
it('the camp layout answers as before', async () => {
  const { campLayout, campDiscs } = await import('../src/world/camplayout.js');
  expect(campLayout('neighborhood')).toBeNull();
  for (const id of ['woods', 'river', 'moor', 'pines', 'gorge']) expect(campLayout(id)?.seats.kits).toHaveLength(4);
  expect(campDiscs('woods').length).toBeGreaterThan(0);
});
```

- [ ] **Step 2:** `npx vitest run test/arealeaves.test.js` → FAIL (modules not found).
- [ ] **Step 3:** Move the code (cut and paste; no edits to bodies), add the re-exports (`export { campLayout, campDiscs, CAMP_TURN, LEDGE_CAMPS } from './camplayout.js';` and the like), and switch the five importers listed above.
- [ ] **Step 4:** `npx vitest run test/arealeaves.test.js test/flattrace.test.js test/growtrace.on.test.js test/pawprints.test.js test/farmjobs.test.js test/camp.test.js test/rivalworld.test.js` → PASS; `git diff --exit-code test/fixtures/` clean.
- [ ] **Step 5: Commit** `git add` the new and changed files by name; message `F6 Task 1: small facts (camp layout, truce path, beach wetness, farm job ids, the no-farm and no-fair stand-ins) leave the area modules, re-exported where they were` with the Task 0 "before" number in the body.

---

### Task 2: The grass asks the area, not a table of imports

`render/grass.js` imports eight area modules for their ground tints and "nothing grows here" tests. Each area now hands its own over as `GRASS_HOOKS`, and the walk passes them to `createGrass`.

**Files:**
- Modify: `src/render/grass.js` (drop the 8 area imports at lines 7-14 and `GROUND_TINTS`; `PASTURE.density` stops calling `farmBare`; `GRASS_STYLES.farm.bare` and `.fair.bare` become `null`; new `grassStyle`; `createGrass` takes `hooks`)
- Modify: `src/world/{neighborhood,park,woods,river,moor,pines,farm,fair}.js`: export `GRASS_HOOKS`
- Modify: `src/game/walk.js:1527`: `createGrass(scene, { areaId, areaData, tier, camera, reducedMotion, keepOut: grassKeepOut, hooks: AREAS[areaId]?.GRASS_HOOKS })` (Task 5 changes `AREAS[areaId]` to the pack)
- Test: `test/grass.test.js`, `test/farm.test.js`, `test/fair.test.js`, `test/woodssouth.test.js` (their `GROUND_TINTS`/`GRASS_STYLES.farm|fair` assertions)

**Interfaces:**
- Produces: `export const NO_GRASS_HOOKS = Object.freeze({ tint: null, bare: null })` and `export function grassStyle(areaId: string, hooks = NO_GRASS_HOOKS): style|undefined`. It returns `GRASS_STYLES[areaId]` with `bare: hooks.bare ?? style.bare`, memoised per (areaId, hooks) so `tuftAt` sees one object.
- `createGrass(scene, { areaId, areaData, tier, camera, reducedMotion = false, keepOut = [], hooks = NO_GRASS_HOOKS })`: style = `grassStyle(areaId, hooks)`; tint sampler from `hooks.tint` (same `groundK > 0` rule as today).
- Each area's `GRASS_HOOKS = Object.freeze({ tint, bare })`: neighborhood `{ tint: neighborhoodLawnTint, bare: null }`, park `{ tint: parkLawnTint, bare: null }`, woods `{ tint: woodsGroundTint, bare: null }`, river `{ tint: riverGroundTint, bare: null }` (river.js imports it from riverdress.js), moor `{ tint: moorGroundTint, bare: null }` (from moordress.js), pines `{ tint: pinesGroundTint, bare: null }`, farm `{ tint: farmGroundTint, bare: farmBare }`, fair `{ tint: fairGroundTint, bare: fairBare }`. Seaside, docks, gorge, den export none (the walk passes `undefined`, which defaults).

- [ ] **Step 1: Rewrite the tint assertions as behaviour.** In `test/grass.test.js` replace the `GROUND_TINTS` block (719-727) with:

```js
it('every area that tints its tufts hands its tint over, and only those', async () => {
  const want = { river: riverGroundTint, moor: moorGroundTint, woods: woodsGroundTint, pines: pinesGroundTint, park: parkLawnTint, neighborhood: neighborhoodLawnTint };
  for (const [id, fn] of Object.entries(want)) expect((await import(`../src/world/${id}.js`)).GRASS_HOOKS.tint, id).toBe(fn);
  for (const id of ['seaside', 'docks', 'gorge', 'den']) expect((await import(`../src/world/${id}.js`)).GRASS_HOOKS, id).toBeUndefined();
});
it('grassStyle keeps a style as it is without hooks and adds an area\'s bare', () => {
  expect(grassStyle('park')).toEqual(GRASS_STYLES.park);
  const bare = () => true;
  expect(grassStyle('park', { tint: null, bare }).bare).toBe(bare);
  expect(grassStyle('park', { tint: null, bare })).toBe(grassStyle('park', { tint: null, bare }));
});
```

In `test/farm.test.js` (985-998) assert `farm.GRASS_HOOKS.tint === farm.farmGroundTint`, `farm.GRASS_HOOKS.bare === farm.farmBare`, and run the existing lattice with `grassStyle('farm', farm.GRASS_HOOKS)`: no tuft where `farmBare(x, z)`, and **the same tufts as `pastureDensity` gives everywhere else**. In `test/fair.test.js` (1736-1740) assert `fair.GRASS_HOOKS.tint === fair[REG.grass.groundTint]`, `fair.GRASS_HOOKS.bare === fair[REG.grass.bare]`, and that `grassStyle('fair', fair.GRASS_HOOKS)` minus `bare` equals `GRASS_STYLES.park`. Then fix `test/woodssouth.test.js` the same way.
- [ ] **Step 2:** Run those four files → FAIL.
- [ ] **Step 3:** Implement as in Interfaces.
- [ ] **Step 4:** Run the four files plus `test/flattrace.test.js test/growtrace.on.test.js test/budget.test.js` → PASS; fixtures unchanged.
- [ ] **Step 5: Commit** `F6 Task 2: each area hands the grass its own tint and bare ground (GRASS_HOOKS); render/grass.js imports no area`.

---

### Task 3: The area registry and its loader

**Files:**
- Create: `src/world/areas.js`, `src/game/areaload.js`
- Test: `test/areas.test.js`, `test/areaimport.test.js`, `test/areaload.test.js`

**Interfaces:**
- Produces, `src/world/areas.js` (imports nothing statically):

```js
// AreaPack = { id: string, world: Module /* has build(scene, opts) */, life: { createFarmAnimals?, createFairLive?, createFairShow? } }
export const AREA_ENTRY_MODULES: Readonly<Record<string, readonly string[]>>
//   'src/world/<id>.js' for every id; farm adds 'src/farmanimals.js'; fair adds 'src/fairlive.js', 'src/fairshow.js'
export const AREA_LOADERS: Readonly<Record<string, () => Promise<AreaPack>>>
//   ids: neighborhood, park, seaside, den, docks, woods, river, moor, pines, gorge, farm, fair, roofs
//   each loader uses literal import() paths; farm: Promise.all([import('./farm.js'), import('../farmanimals.js')])
//   → { id: 'farm', world, life: { createFarmAnimals } }; fair → life: { createFairLive, createFairShow }; others life: {}
//   (Task 5 is when walk.js uses `life`; the loaders carry it from now on.)
```

- Produces, `src/game/areaload.js`:

```js
export const AREA_LOAD_TIMEOUT_MS = 15000;
export class AreaLoadError extends Error {} // fields: areaId, kind: 'unknown' | 'failed' | 'timeout', cause
export function createAreaLoader({ loaders = AREA_LOADERS, timeoutMs = AREA_LOAD_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {})
  // -> { loaded(id): AreaPack | null,
  //      ensure(id): Promise<AreaPack>,      // one call to loaders[id] per success; joins a load in flight
  //      prefetch(id): void,                 // ensure() with the rejection noted (diagnostics note('area', err)) and swallowed
  //      ensureAll(ids = Object.keys(loaders)): Promise<AreaPack[]> }
```

Semantics: an id missing from `loaders` rejects at once with kind `'unknown'`. A rejected load is forgotten, so the next `ensure` calls the loader again. A load slower than `timeoutMs` rejects with kind `'timeout'`, and if it resolves later its pack is still kept as loaded (the next `ensure` is instant). `loaded(id)` is non-null only after the loader's promise has resolved.

- [ ] **Step 1: Write the failing tests.** `test/areas.test.js` (canvas stub as in budget.test.js):

```js
it('every place a child can walk has a loader, and the den too', () => {
  for (const id of [...Object.keys(CATALOG.areas), 'den']) expect(Object.hasOwn(AREA_LOADERS, id), id).toBe(true);
  expect(Object.keys(AREA_ENTRY_MODULES).sort()).toEqual(Object.keys(AREA_LOADERS).sort());
});
it('each loader hands over its own builder module, and the Farm and the Fair their life', async () => {
  for (const id of Object.keys(AREA_LOADERS)) {
    const pack = await AREA_LOADERS[id]();
    expect(pack.id).toBe(id);
    expect(pack.world).toBe(await import(`../src/world/${id}.js`));
    expect(typeof pack.world.build).toBe('function');
  }
  expect((await AREA_LOADERS.farm()).life.createFarmAnimals).toBe((await import('../src/farmanimals.js')).createFarmAnimals);
  const fair = (await AREA_LOADERS.fair()).life;
  expect(fair.createFairLive).toBe((await import('../src/fairlive.js')).createFairLive);
  expect(fair.createFairShow).toBe((await import('../src/fairshow.js')).createFairShow);
});
// test/areaimport.test.js: a file of its own, so no area module is evaluated before it
it('loading an area draws no random number and paints nothing', async () => {
  await import('../src/world/builder.js'); await import('../src/render/textures.js'); // what start-up already has
  const random = vi.spyOn(Math, 'random');
  const paint = vi.spyOn(document, 'createElement');
  for (const id of Object.keys(AREA_LOADERS)) {
    random.mockClear(); paint.mockClear();
    await AREA_LOADERS[id]();
    expect(random, id).not.toHaveBeenCalled();
    expect(paint, id).not.toHaveBeenCalled();
  }
});
```

`test/areaload.test.js` uses fake loaders and fake timers:

```js
it('loads once, joins a load in flight, then answers loaded()', async () => { /* two ensure('a') → loader called once; loaded('a') null before, pack after */ });
it('forgets a failed load, so the next ensure tries again', async () => { /* loader rejects once then resolves: 1st ensure rejects AreaLoadError kind 'failed' with cause; 2nd resolves; loader called twice */ });
it('an unknown place is refused without a load', async () => { /* ensure('nowhere') rejects kind 'unknown' */ });
it('gives up after AREA_LOAD_TIMEOUT_MS, and keeps a pack that arrives late', async () => { /* never-settling until released: advance 15000 → kind 'timeout'; release → loaded('a') is the pack; next ensure resolves without calling the loader */ });
it('prefetch never throws and never rejects', async () => { /* failing loader: prefetch('a') returns undefined; no unhandled rejection */ });
```

- [ ] **Step 2:** `npx vitest run test/areas.test.js test/areaimport.test.js test/areaload.test.js` → FAIL.
- [ ] **Step 3:** Implement both files. Move walk.js's "Every walkable area the game can build…" comment (lines ~179-184) into `areas.js`, rewritten for the new steps (Task 9 adds the recipe to the docs). Leave walk.js's `AREAS` alone for now.
- [ ] **Step 4:** The three files → PASS.
- [ ] **Step 5: Commit** `F6 Task 3: one registry of area packs (src/world/areas.js) and a loader that caches, retries and times out`.

---

### Task 4: The words and the Start button's "Getting ready…"

**Files:**
- Modify: `src/clanphrases.js` (`LATER` table, a new `// ---- getting a place ready (2026-11-20) ----` block)
- Modify: `src/ui/colonypanel.js` (`renderStartButtonHtml`), `src/ui/homebase.js` (state, render, API)
- Test: `test/colonypanel.test.js`, `test/homebase.launch.test.js`, `test/fixtures/series-words-on-later.json` (re-recorded)

**Interfaces:**
- Produces phrase ids (same text in both word sets; the owner may reword):
  - `'start.gettingReady'`: `'Getting ready…'`
  - `'start.notReady'`: `'That place isn’t quite ready yet. Try again in a moment! 🐾'`
  - `'start.notReadyOffline'`: `'That place needs the internet the first time. Try again when you’re online! 🐾'`
  - `'start.notReadyReload'`: `'Still not ready. Tap Explore once more and the game starts fresh. Everything you found is saved. 🐾'`
- `renderStartButtonHtml(room, { as = null, gettingReady = false } = {})`: `room?.starting` wins ("Starting…", as today); else `gettingReady` gives `<button id="btn-start" class="primary" disabled>` + `escapeHtml(phrase('start.gettingReady'))` + `</button>`; else today's output, byte for byte.
- `homebase.setGettingReady(on: boolean): void`: stores the flag and redraws the Start button. A redraw at home keeps it (it is read in render). `show()` does not clear it (the walk lifecycle clears it).

- [ ] **Step 1: Write the failing tests.** colonypanel.test.js: `renderStartButtonHtml(null, { gettingReady: true })` contains `disabled` and `Getting ready…`; `renderStartButtonHtml({ starting: true }, { gettingReady: true })` is today's `Starting…` button; `renderStartButtonHtml(null)` is unchanged (`toBe` today's string). homebase.launch.test.js: after `setGettingReady(true)` the root's `#btn-start` is disabled and says the phrase; after `setGettingReady(false)` it says `Explore` again.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Add the four entries to `LATER`. Re-record: `UPDATE_OFF_SNAPSHOT=1 npx vitest run test/offwords.test.js`; the only fixture diff is four added keys in `series-words-on-later.json`.
- [ ] **Step 4:** `npx vitest run test/colonypanel.test.js test/homebase.launch.test.js test/offwords.test.js test/serieswords.test.js test/clanwords.test.js` → PASS.
- [ ] **Step 5: Commit** `F6 Task 4: the getting-ready words in the phrase table, and Explore shows "Getting ready…" while a place loads`.

---

### Task 5: The walk loads its area first (`startWalkWhenReady`)

**Files:**
- Modify: `src/game/walk.js` (imports 17-28 and 83-89, `AREAS` at 185, `beginWalkFromHomebase`, `beginDenWalk`, `startWalk`'s area reads at ~668, 808, 1397, 1422, 1440, 1527, the return at 2709)
- Modify: `src/main.js` (create the loader, pass deps, boot prefetch, rooms thunk)
- Create: `test/helpers/headlesswalk.js` (the `lifecycle()`, `fakeEl`, `fakeDocument`, `anything`, `memStorage` and fixed-random pieces of `test/walkfreed.test.js`, exported; walkfreed.test.js imports them)
- Test: `test/walkready.test.js`; update `test/walkfreed.test.js`, `test/walk.edition.test.js`, `test/walk.visitprize.test.js` (pass a loader and `await areas.ensureAll(...)` in `beforeAll`), `test/frameorder.test.js` (mock `../src/game/areaload.js`)
- Replace text pins (behaviour tests in `test/areas.test.js` / `test/walkready.test.js`): `test/docks.test.js:467-482`, `test/farm.test.js:974-977`, `test/fair.test.js:1713-1717`, `test/roofsgame.test.js` (`import * as roofs`), and any other pin the full run shows broken

**Interfaces:**
- Consumes: `createAreaLoader`, `AreaPack` (Task 3); `homebase.setGettingReady` and the `start.*` phrases (Task 4); `NO_FARM`/`NO_FAIR` leaves (Task 1); `GRASS_HOOKS` (Task 2).
- `createWalkLifecycle({ …today's deps…, areas = createAreaLoader(), homeToast = () => {}, reloadPage = () => window.location.reload(), isOnline = () => navigator.onLine !== false })`
- Returns `{ beginWalkFromHomebase, beginDenWalk, startWalk, startWalkWhenReady, endWalk, takeCrossing }`.
- `export const GETTING_READY_DELAY_MS = 150; export const RELOAD_AFTER_FAILURES = 2;`
- `startWalkWhenReady(opts = {}): Promise<'started' | 'busy' | 'failed' | 'dropped'>`, same `opts` as `startWalk`:
  1. `areaId = opts.areaOverride ?? progression.state.area`.
  2. A start already waiting → `'busy'` (nothing else happens).
  3. `failures >= RELOAD_AFTER_FAILURES && isOnline()` → `reloadPage()`, `'failed'`.
  4. `areas.loaded(areaId)` → `startWalk(opts)` **in the same tick**, → `'started'`. A throw from it propagates synchronously, as today.
  5. Otherwise: `audio.getContext?.()` now (inside the tap); remember a token; after `GETTING_READY_DELAY_MS`, if still waiting, `getHomebase()?.setGettingReady?.(true)`. On `areas.ensure(areaId)`:
     - resolve: `setGettingReady(false)`. `'dropped'` if the token is stale, a session already exists, or `opts.roomSeed !== undefined && !getPendingRoom()`. Otherwise `failures = 0`, `startWalk(opts)` (a throw rejects the returned promise with that error), `'started'`.
     - reject: `setGettingReady(false)`, `failures += 1`, `note('area', err)`, and `homeToast(phrase(…))` with `'start.notReadyReload'` when `failures >= RELOAD_AFTER_FAILURES && isOnline()`, else `'start.notReadyOffline'` when `!isOnline()`, else `'start.notReady'` → `'failed'`.
- `startWalk(opts)` (still synchronous) reads, **as its first statement, before `wearPendingVisitPrize`**: `const pack = areas.loaded(areaOverride ?? progression.state.area); if (!pack) throw new Error(\`Whisker Walk: area "${id}" is not loaded; start walks with startWalkWhenReady\`);`. Then `const { createFarmAnimals, createFairLive, createFairShow } = pack.life;` (so the farm and fair lines read as they do now), `pack.world.build(scene, { placed: progression.state.den.placed, wind })` for the den and `pack.world.build(scene, { water: { quality: tier, reducedMotion }, wind })` otherwise, `if (areaId === 'fair') pack.world.setFairGlow(areaData, duskLookNow ? 1 : 0);`, `hooks: pack.world.GRASS_HOOKS`. The 12 (13 with roofs) `import * as` lines, the `AREAS` const and the static `createFarmAnimals`/`createFairLive`/`createFairShow` imports go. walk.js imports `createAreaLoader` only.
- `beginWalkFromHomebase`: the solo branches (and rooftops-2's `roofsOn()` branch) call `startWalkWhenReady` instead of `startWalk`. The room branch is unchanged. `beginDenWalk`: `startWalkWhenReady({ areaOverride: 'den' })`.
- main.js: `const areas = createAreaLoader();` before the lifecycle. Pass `areas` and `homeToast: cloudToast` to `createWalkLifecycle`. Pass `startWalk: (opts) => startWalkWhenReady(opts)` to `createRooms` (Task 6 makes rooms wait on it). Right after the boot `homebase.show()`: `areas.prefetch(effectiveArea(progression.state, CATALOG)); areas.prefetch('den');`.

- [ ] **Step 1: Write the failing tests** in `test/walkready.test.js`, over `headlessLifecycle({ areas })` with a loader whose `ensure` the test controls (a deferred around the real `AREA_LOADERS`):

```js
it('a loaded place starts in the same tick, as before', async () => { await areas.ensure('park'); const p = w.startWalkWhenReady({ areaOverride: 'park' }); expect(getSession()?.areaId).toBe('park'); expect(await p).toBe('started'); });
it('a place still loading starts once it has loaded, with "Getting ready…" only after 150 ms', async () => { /* fake timers; ensure pending: no session, setGettingReady not called at 149 ms, called with true at 150; release → session in park, setGettingReady(false) */ });
it('a quick load never shows "Getting ready…"', async () => { /* release at 50 ms → setGettingReady never called with true */ });
it('makes the sound context inside the tap, before waiting', () => { /* audio.getContext called before release */ });
it('a second Explore or the den while loading is ignored: one load, one walk', async () => { /* second call → 'busy'; loader called once */ });
it('a load that fails keeps her home with the gentle line, and Explore tries again', async () => { /* reject → 'failed', no session, homeToast(phrase('start.notReady')); next call calls the loader again */ });
it('offline, the line says the place needs the internet', async () => { /* isOnline false → 'start.notReadyOffline' */ });
it('after two failures online the line offers a fresh start and the next Explore reloads', async () => { /* 2nd failure → 'start.notReadyReload'; 3rd call → reloadPage called, loader not called */ });
it('a load that lands after she is already walking, or after the room is gone, starts nothing', async () => { /* 'dropped' */ });
it('startWalk without a loaded place throws before it touches the save', () => { /* pending visit prize stays pending; no session */ });
it('waiting draws nothing: a seeded walk loaded late is the same walk as one loaded first', async () => {
  // two lifecycles, roomSeed 1234, park, duskMode false: A preloaded (sync path), B through a deferred load
  // compare: weather.condition, secrets ids, strayCats.strays names + positions, goals ids, critters types + positions
});
it('a solo walk loaded late still takes its seed from the first random draw', async () => { /* nextWalkSeed(4242) queued; async path; session.soloSeed === 4242 */ });
it('a Fairground dusk walk lights the bulbs and a day walk does not', async () => { /* roomSeed walks: duskMode true → session.areaData.glow.level === 1; false → 0 */ });
it('the Farm walk gets its animals and the Fair its rides from the pack', async () => { /* session.farm !== NO_FARM in farm; session.fair !== NO_FAIR in fair; both NO_* in park */ });
```

- [ ] **Step 2:** `npx vitest run test/walkready.test.js` → FAIL.
- [ ] **Step 3:** Implement walk.js and main.js as in Interfaces. Lift the harness into `test/helpers/headlesswalk.js` and point walkfreed.test.js at it (its tests unchanged). In `walk.edition`, `walk.visitprize` and `walkfreed` pass `areas: createAreaLoader()` and `await areas.ensureAll([...the ids each file walks])` in `beforeAll`. Their synchronous `toThrow(STOP)` assertions then still hold: vitest's `vi.mock` applies to dynamic imports. In `test/frameorder.test.js` add `vi.mock('../src/game/areaload.js', () => ({ createAreaLoader: () => ({ loaded: () => null, ensure: () => new Promise(() => {}), prefetch() {}, ensureAll: async () => [] }) }))`. Replace the four registration pins listed under Files: their claim ("an area in the catalog that nothing can build") is now `test/areas.test.js`'s first two tests, and the fair glow pin is the dusk-bulbs test above.
- [ ] **Step 4:** `npx vitest run test/walkready.test.js test/walkfreed.test.js test/walk.edition.test.js test/walk.visitprize.test.js test/frameorder.test.js test/areas.test.js test/docks.test.js test/farm.test.js test/fair.test.js test/farmanimals.test.js test/fairgames.test.js test/shadowfit.test.js test/roofsgame.test.js` → PASS. Then the full suite → PASS; fixtures unchanged. `npm run build` now prints about 650 kB for the main script. The postbuild still measures only the index chunk until Task 7, so treat that number as a lower bound.
- [ ] **Step 5: Commit** `F6 Task 5: a walk loads its place before it starts (startWalkWhenReady); startWalk stays synchronous and draws as before; the Farm's animals and the Fair's rides and games come with their place`.

---

### Task 6: Co-walk, resume and crossings wait for the place

**Files:**
- Modify: `src/game/rooms.js` (`startRoomWalk`, `gather`, `startRoomTogether`, `getState`, the incoming-proposal handler; new dep `prefetchArea`)
- Modify: `src/main.js` (the resume block at ~964-981; `createRooms({ …, prefetchArea })`; `createCrossing({ …, prefetchArea })`)
- Modify: `src/game/crossing.js` (`confirm`, `onRemote`)
- Test: `test/rooms.test.js`, `test/crossing.test.js`, `test/walkready.test.js` (resume)

**Interfaces:**
- `createRooms({ …, startWalk, prefetchArea = () => {} })`. `startWalk` may now return a promise (`startWalkWhenReady`) or `undefined` (old test stubs); rooms wraps it in `Promise.resolve(...)`.
- Rooms: every proposal gathered (own or heard) calls `prefetchArea(proposal.area)`. `startRoomWalk` sets `startingWalk = true`, `notifyRoomChange()`, and awaits `Promise.resolve(startWalk(opts))`. A rejection is caught and `note('room', err)`. In `finally`: `startingWalk = false; notifyRoomChange()`. `getState().starting` is `!!gathering || startingWalk`. While `startingWalk`, `startRoomTogether` returns `false` and heard proposals are ignored.
- `createCrossing({ …, prefetchArea = () => {} })`: `confirm()` calls `prefetchArea(to)` after its guards; `onRemote` calls `prefetchArea(d.to)` once `d` is decided.
- main.js resume (also fixes today's bug: inside the `catch` the resume note named `note` shadows diagnostics' `note()`, so `note('resume', err)` throws a TypeError and the walk is never settled):

```js
if (resuming) {
  const resumeNote = markTried(window.localStorage, leftWalk.data);
  Promise.resolve()
    .then(() => startWalkWhenReady({ duskMode: resumeNote.dusk, areaOverride: resumeNote.areaId, resume: resumeNote }))
    .then(() => { /* 'failed': the note stays; its try is counted, RESUME_MAX_TRIES settles it on a later launch */ },
      (err) => { console.warn('Whisker Walk: could not pick the walk up', err); note('resume', err);
        clearResume(window.localStorage); settleAbandoned(progression, resumeNote); if (session) window.location.reload(); });
}
```

- [ ] **Step 1: Write the failing tests.** rooms.test.js (its harness's `startWalk` stub returns a deferred):

```js
it('stays "Starting…" while the place loads, and starts nothing twice', async () => { /* gather fires → getState().starting true until the deferred settles; startRoomTogether returns false meanwhile; a heard proposal adds no second start */ });
it('fetches the place while the room gathers', async () => { /* prefetchArea called with the proposal's area for own and heard proposals */ });
it('a place that fails to load leaves the member home and in the room', async () => { /* deferred resolves 'failed' → starting false, pendingRoom still set, no second start */ });
it('an older device that has no such place stays home, the other walks', async () => { /* proposal area 'nowhere' → startWalk resolves 'failed'; no throw */ });
```

crossing.test.js: `confirm()` solo and as host calls `prefetchArea(to)`; a led crossing calls it with `d.to`. walkready.test.js: a resume start whose load fails resolves `'failed'` and leaves the note in storage with `tries: 1`; a resume whose build throws rejects (main.js's handler settles it). Test that handler's effect through `settleAbandoned` and `clearResume` with a fake storage, the way `test/walkresume.test.js` does.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run test/rooms.test.js test/rooms.safety.test.js test/lobby.test.js test/crossing.test.js test/crossinglock.test.js test/walkready.test.js test/walkresume.test.js test/nearby.test.js test/offlinefirst.test.js` → PASS. Then the full suite.
- [ ] **Step 5: Commit** `F6 Task 6: a room start, a resumed walk and a border crossing wait for their place; a slow device joins late, a failed one stays home; the resume catch no longer throws`.

---

### Task 7: The build checks what start-up and each place download

**Files:**
- Modify: `vite.config.js` (`build.manifest: true` in both modes; a `precacheList()` plugin in the website build only)
- Create: `scripts/precache.mjs`, `test/helpers/realbuild.js`, `test/lazybuild.test.js`
- Modify: `scripts/buildjson.mjs` (measure start-up from `dist/.vite/manifest.json`; per-place check), `test/buildsize.test.js`, `test/iosbundle.test.js`

**Interfaces:**
- `scripts/precache.mjs`: `precacheManifest(fileNames: string[]) -> { build: string, files: string[] }`. `files` = the names under `assets/`, sorted, deduped. `build` = the first 12 hex digits of `sha1(files.join('\n'))`.
- `vite.config.js`: `precacheList()` = `{ name: 'precache-list', generateBundle(_, bundle) { this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(precacheManifest(Object.keys(bundle))) }); } }`, in `plugins` when `mode !== IOS_MODE`.
- `scripts/buildjson.mjs` (keeps `MAIN_GZIP_CEILING_KB = 900`, `mainScript`, `sizeProblem`; the message now says "The start-up scripts are …" and keeps "kB gzipped", "ceiling of", "MAIN_GZIP_CEILING_KB"):
  - `startupFiles(manifest) -> string[]`: the entry (`isEntry`) file plus every file reached through `imports` (never `dynamicImports`), each once.
  - `areaDownloads(manifest, entryModules = AREA_ENTRY_MODULES) -> { [areaId]: string[] }`: every file reached through `imports` from each listed module's chunk, minus `startupFiles`.
  - `export const AREA_GZIP_CEILING_KB = 100;` and `areaSizeProblems(kbById, ceilingKb = AREA_GZIP_CEILING_KB) -> string[]`, one line per place over, naming the place, its size and the constant.
  - `lazyProblems(manifest, entryModules = AREA_ENTRY_MODULES) -> string[]`, one line per listed module that is missing from the manifest, is not `isDynamicEntry`, or whose file is in `startupFiles`. It names the module and says an area is being imported from start-up code.
  - The postbuild prints the start-up size, each place's size, and fails (`exit 1`) on any problem.
- `test/helpers/realbuild.js`: `realBuild(mode) -> { chunks, manifest, gz(file) }`, using `build({ root, mode, logLevel: 'silent', build: { write: false } })` with `NODE_ENV=production` as iosbundle.test.js does.

- [ ] **Step 1: Write the failing tests.** buildsize.test.js, over a hand-made manifest (`index.html` → `_three.js` → nothing; `src/world/woods.js` dynamic → `_camp.js`; `src/world/park.js` statically imported by the entry):

```js
it('start-up is the entry and every chunk it imports, never a dynamic one', () => expect(startupFiles(M).sort()).toEqual(['assets/index.js', 'assets/three.js', 'assets/park.js']));
it('a place downloads its chunk and its own shared chunks, not start-up\'s', () => expect(areaDownloads(M, { woods: ['src/world/woods.js'] }).woods.sort()).toEqual(['assets/camp.js', 'assets/woods.js']));
it('names a place pulled into start-up, and one missing', () => { expect(lazyProblems(M, { park: ['src/world/park.js'] })[0]).toMatch(/src\/world\/park\.js/); expect(lazyProblems(M, { x: ['src/world/x.js'] })[0]).toMatch(/src\/world\/x\.js/); });
it('a place over its ceiling is named with its size', () => expect(areaSizeProblems({ fair: 100.1, park: 5 })).toEqual([expect.stringMatching(/fair.*100\.1 kB.*AREA_GZIP_CEILING_KB/)]));
it('precacheManifest lists assets only, sorted, with a build id that follows the files', () => { /* ['index.html','assets/b.js','assets/a.js','.vite/manifest.json'] → files ['assets/a.js','assets/b.js']; same files → same build; one more → different */ });
```

`test/lazybuild.test.js`, over `realBuild('production')`: `lazyProblems(manifest)` is `[]`. The start-up gzip passes `sizeProblem` and is at least 150 kB under the sum of every chunk (the split is real). Each place's download passes `areaSizeProblems`. `precache.json` is emitted and its `files` equal every emitted `assets/` file. iosbundle.test.js adds: the app build ships a dynamic chunk for every module in `AREA_ENTRY_MODULES`, and no `precache.json`.
- [ ] **Step 2:** Run `test/buildsize.test.js test/lazybuild.test.js test/iosbundle.test.js` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Those three → PASS. `npm run build` prints start-up about 640-660 kB plus each place, all under ceiling; `npm run build:ios` still builds and `ios/web/assets/` holds every place's chunk.
- [ ] **Step 5: Commit** `F6 Task 7: the build measures start-up as the entry plus its imports, checks each place is its own download under 100 kB, and lists every file for the service worker` with the measured before/after in the body.

---

### Task 8: The service worker keeps every place for offline play

Today's worker prunes to the newest `MAX_ASSETS = 12` hashed files. A build now has about 25, so the count prune would drop the current build's own place chunks: the offline walk into those places would fail with no warning.

**Files:**
- Modify: `public/sw.js`, `scripts/smoke.mjs`
- Create: `test/helpers/fakesw.js`, `test/swprecache.test.js`
- Modify: `test/swprune.test.js`, `test/postdeploysmoke.test.js`

**Interfaces:**
- `public/sw.js`: `CACHE = 'whisker-v2'` (the strategy changed). `PRECACHE_URL = new URL('precache.json', SCOPE).href`. Build lists are cached under `new URL('__builds/<build>', SCOPE).href` as JSON responses.
- Between `// prune:start` and `// prune:end` (pure; swprune.test.js reads them out as today):
  - `const KEEP_BUILDS = 3;`
  - `precacheUrls(list, scope) -> string[]`: absolute URLs of `list.files` entries that start with `assets/`. A malformed list gives `[]`.
  - `buildsToDrop(buildKeys, max) -> string[]`: the oldest keys beyond `max`, in insertion order.
  - `assetsToPrune(urls, keepUrls) -> string[]`: `/assets/` URLs not in `keepUrls`. It never touches non-`/assets/` URLs.
- `install`: `event.waitUntil(precache().catch(() => {}))` then `skipWaiting()`. `precache()` fetches `PRECACHE_URL` with `{ cache: 'no-store' }`, then adds `SHELL` and each listed file **one by one** (`Promise.allSettled`, skipping ones already cached), stores the list under its `__builds/` key, and resolves even when some files failed.
- `activate`: delete other caches, then `pruneAssets()`: drop build lists beyond `KEEP_BUILDS`; if no list remains, prune nothing; else delete `/assets/` entries outside the union of kept lists. Then `clients.claim()`.
- `fetch`: as today (navigation network-first; `/assets/` cache-first and cached on fetch, with no prune there now). Plus, after the first successful navigation response in a worker's life, `topUp()`, which runs `precache()` again, so a partial install is filled on the next online visit.
- `scripts/smoke.mjs`: `precacheProblems(text) -> string[]` (not JSON; no `files` array; a file outside `assets/`). `runChecks` fetches `precache.json`, then checks every listed file returns 200 with a script/stylesheet content type, exactly as it checks the page's own scripts.

- [ ] **Step 1: Write the failing tests.** `test/helpers/fakesw.js` runs the real `public/sw.js` with `new Function('self', 'caches', 'fetch', 'URL', 'Response', src)`: a Map-backed `caches`, an `addEventListener` registry, events with `waitUntil`/`respondWith` collecting promises, and a `fetch` stub keyed by URL (`404`, reject = offline). `test/swprecache.test.js`:

```js
it('install caches the shell, every listed file and the build list', async () => { /* precache.json files [a.js, b.js] → all cached */ });
it('one missing file does not stop the rest, and install still succeeds', async () => { /* b.js 404 → a.js cached, install resolves */ });
it('offline at install, the next online page load fills the gaps', async () => { /* install with fetch rejecting; then fetch online + a navigate event → a.js and b.js cached */ });
it('after one online visit, a place's chunk is served offline', async () => { /* install; fetch rejects; fetch event for assets/woods-x.js → cached response */ });
it('activate keeps the newest three builds\' files and drops the rest', async () => { /* lists for builds 1..4 installed in order → build 1's files deleted, 2-4 kept; shell, places/park.jpg, sounds/x untouched */ });
it('activate with no build list prunes nothing', async () => { /* old-style cache with 30 assets → all kept */ });
```

Rewrite `test/swprune.test.js` for the new pure functions: `KEEP_BUILDS >= 2`; `assetsToPrune` drops only `/assets/` URLs outside the keep set; `buildsToDrop` keeps the newest `max`; `precacheUrls` ignores non-`assets/` entries and malformed input; the build-stamp tests stay. Drop its `.then(pruneAssets)` text pins, which the activate test covers. postdeploysmoke.test.js: `precacheProblems` cases.
- [ ] **Step 2:** Run `test/swprecache.test.js test/swprune.test.js test/postdeploysmoke.test.js` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Those three → PASS; `test/iosbundle.test.js` still PASS (the app build never registers the worker).
- [ ] **Step 5: Commit** `F6 Task 8: the service worker caches every file of a build on install, tops up on the next online visit, and prunes by build list (three builds), so each place works offline after one visit`.

---

### Task 9: The new-area recipe, docs and the real-device check

**Files:**
- Modify: `docs/SESSION-HANDOFF.md` ("Where the big pieces live" and a short "Adding an area" list), `ios/README.md` (one line: every place is its own file under `ios/web/assets/`, served by the bundle scheme; nothing to do in the app), `src/world/areas.js` header comment

The recipe (write it in both places, in the project's words):
1. Build the area module `src/world/<id>.js` (and its parts). Nothing outside it and `src/world/areas.js` may import it. Shared facts the rest of the game needs go in a leaf module (Task 1's pattern).
2. Add its line to `AREA_LOADERS` (literal `import()`), and to `AREA_ENTRY_MODULES`, with any life module that only it uses.
3. If it grows grass with its own tint or bare ground, export `GRASS_HOOKS`.
4. The catalog row and `state.walks` key as before. `test/areas.test.js` and `test/lazybuild.test.js` fail if steps 2 or 1 were missed.
5. For the Old House and Rooftops step 3+: do the same; `npm run build` prints its download size.

- [ ] **Step 1:** Write the docs, and check nothing in `src/` still tells a reader to register an area in walk.js (the comment moved to areas.js in Task 3; `AREAS` went in Task 5).
- [ ] **Step 2:** Full suite → PASS; `git diff --exit-code test/fixtures/` shows only Task 4's `series-words-on-later.json` addition; `npm run build` and `npm run build:ios` both succeed.
- [ ] **Step 3: Manual check, for the owner** (record results in the merge message): on the Mac in Chrome with `npm run build && npm run preview`, open once online, wait 5 s, go offline (DevTools), reload, and walk into every place (each must start, the first maybe after "Getting ready…"). Then on an iPad in Safari against the deployed site, and in the app after the nightly refresh: enter the Farm, the Fairground and the Gorge once each. Two devices in a room: one starts the Fairground while the other has never loaded it, and both walk it.
- [ ] **Step 4: Commit** `F6 Task 9: how to add an area now (its own download), and the offline and two-device checks to run`.

---

## Self-review notes

- Spec coverage: blank-walk and error paths (Tasks 4-6), co-walk (Task 6), trace determinism (fixture diff each task; same-walk test in Task 5; import-draws-nothing test in Task 3), word tables (Task 4), 900 kB ceiling kept and made honest plus per-place check (Task 7), offline-first and iOS (Tasks 7-8), Rooftops (Task 0, roofs in the registry in Task 3, the `roofsOn()` branch in Task 5, recipe in Task 9), tests that must stay synchronous (fast path in Task 5; `ensureAll` in `beforeAll`).
- Names used across tasks: `createAreaLoader`, `loaded`, `ensure`, `prefetch`, `ensureAll`, `AREA_LOADERS`, `AREA_ENTRY_MODULES`, `AreaPack.{id, world, life}`, `startWalkWhenReady`, `setGettingReady`, `homeToast`, `prefetchArea`, `GRASS_HOOKS`, `grassStyle`, `startupFiles`, `areaDownloads`, `lazyProblems`, `areaSizeProblems`, `AREA_GZIP_CEILING_KB`, `precacheManifest`, `KEEP_BUILDS`, `buildsToDrop`, `assetsToPrune`, `precacheUrls`, `precacheProblems`.
- Left alone on purpose: splitting `startWalk`; the saves; `traversallive.js` (shared by the yard and the Rooftops); the per-area data tables in the main graph (prop sets, gold mice, marks, clouds, find spots), which are small.
