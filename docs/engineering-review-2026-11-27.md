# Engineering review, 2026-11-27 (harden, lighten, refactor)

Scope: main at 33a998de, read-only review (no src edits). Every number below came from a command run in the `eng-review` worktree on 2026-11-26/27 unless marked **(est.)**. Severity high/med/low; effort S (under 1 builder run), M (1-2), L (3+).

## 0. Measurements

| What | Number | Command |
|---|---|---|
| Full suite, this Mac | 19,212 passed, 61 skipped, 0 failed; 468 s wall; 4,364 s summed file time | `npx vitest run --reporter=json` |
| Test files / src lines | 766 entries in test/ (incl. helpers); src 207,819 lines total | `ls test`, `wc -l` |
| CI deploy runs, last 40 | 26 cancelled, 12 success, 1 failure, 1 in progress; runs that finish take 5-9 min | `gh run list --limit 40` |
| Worktrees / branches | 184 worktrees (172 under `.worktrees/`, 14 GB there), 184 branches, 173 merged into main, 10 not merged | `git worktree list`, `git branch --merged main` |
| Token log (2026-11-26 on) | 56 work calls, 5,467,428 tokens: sonnet 84.0%, haiku 12.4%, opus 3.7%; retries/fails 8 calls = 242,582 tokens (4.4%) | `python3 cat-game-token-log/summarize.py` |

Slowest files this run (s, under 8-way load): fairgames 255, housecamera 163, folds 135, gorge 108, fightcamworld.pines 102, **reefridelive 99**, fightcamworld.moor 96, **reeflabshow 94**, fightcamworld 85, **marketlive 83**, builder 82. Slowest single tests: builder "no rock hangs over walkable ground" 68.7 s, fightcamworld.moor 64.6 s, folds 62.6 s, housecamera 61.3 s, fairgames 57.4 s. The 30 s `testTimeout` (vite.config.js:113) is therefore exceeded per test by about ten tests; they only pass because the heavy ones carry their own timeouts. Nothing failed on this machine, so the timeouts seen under load are CI/load only.

## 1. Ranked findings

### F1 (HIGH, S): a failed Reef/Crystal/Moon stage download can never be retried in the same session
Evidence: `src/world/reefstages.js:11-15`, `src/world/crystalstages.js:11-15`, `src/world/moonstages.js:25-29` all do `loading ??= Promise.all([import(...)])`. A rejected import (offline blip, flaky mobile) is cached in `loading` for the page's life. `src/game/areaload.js:5` promises "forgets a failure so the next ask retries", and does call the loader again, but `AREA_LOADERS.reef` / `.crystal` (areas.js) call `loadReefStages()` / `loadCrystalStages()`, which hand back the same rejected promise. So after one failed fetch the child sees the area refuse until she reloads the page. Moon's stage A path is safe (`moonlate.js:23` retries once), and plain areas are safe.
Fix: in all three, `loading = Promise.all(...).then(() => ST).catch((e) => { loading = null; throw e; })`. Add a test per file that rejects the first import and succeeds the second via the area loader (`createAreaLoader` with an injected loader is already testable).

### F2 (HIGH, S): the heavy-test list is stale, so CI shards are unbalanced and slow files start late
Evidence: `test/heavy.js` lists 31 files; reefridelive (99 s), reeflabshow (94 s), marketlive (83 s) are not in it (`grep -c` gave 0 each), while fairgames, housecamera, folds, gorge, builder, catnap, farmjobs are. CI deals shards by these seconds (heavy.js header), so new reef files are dealt as ordinary files.
Fix: regenerate `HEAVY_COST` from the JSON report (any file over 20 s) with a small script `scripts/heavycost.mjs` that reads a `vitest --reporter=json` output and prints the table; commit the new table. Re-run CI and compare shard times.

### F3 (MED, S): CI cancels most runs; the test shards are paid for and thrown away
Evidence: `gh run list --limit 40`: 26 of 40 cancelled (`concurrency: cancel-in-progress: true` in `.github/workflows/deploy.yml`, one push every 5-10 min on build days). Each cancelled run has already burned up to 4 shard machines. Also the 1 failure (run 45935365993, 2026-11-27 03:38) was the Linux float hash in `crystalx0.test.js` ("byte-identical to main (recorded hashes)"), fixed since.
Fix: keep cancel-in-progress for the deploy/build/smoke jobs only; give the `test` job its own concurrency group per `github.sha` with no cancel, or (cheaper) skip the shards when the head commit is not the newest (`if: github.sha == github.event.repository...` is not available, so use a first step `git fetch && [ "$(git rev-parse origin/main)" = "$GITHUB_SHA" ]` that exits the job early). Net effect: a superseded push stops after seconds instead of minutes.

### F4 (MED, M): no test makes a new `state.*` key survive the sanitiser
Evidence: only one sanitiser exists (`sanitizeState`, `src/progression.js:1198`; `sanitizeSave` is a wrapper, line 1196). `test/catmerge.test.js:23-31` already enforces generically that every `freshStateKeys()` key has a `MERGE_RULES` entry and the reverse. Nothing enforces that `sanitizeState` keeps a non-default value for the key: a new key with no line in `sanitizeState` is silently dropped on load and in the cloud path (the comment at progression.js:165 names exactly this failure).
Fix: a generic test `test/savekeys.test.js`: for every key of `freshStateKeys()`, build a state where that key is set to a "changed" value derived from its default (number+1, true/false flip, string+'x' only for free-text keys is wrong, so use an explicit `SENTINEL_OVERRIDES` map for the keys whose shape is restricted: ids, arrays of ids from CATALOG), run `sanitizeSave`, assert the key is not equal to the default again. A missing sentinel for a new key fails the test with a clear message ("add a sentinel for foo"). This makes the rule "every key in sanitiser and MERGE_RULES" machine-checked.

### F5 (MED, M): per-frame allocation in stray and critter loops
Evidence: `src/critters.js:783,792,793,848,857,871` and `src/straycats.js:873,936,938,1002,1030,1070` call `.clone()` / `new THREE.Vector3()` inside per-critter update branches (about 22 and 13 alloc-shaped sites; `critters.js` already has module scratch vectors `_vp/_head/_top` at 317-319 showing the pattern). `src/world/crystallife.js:355` makes `new THREE.Color(COLORS.bright)` every call of `placeGlow` (the module already owns `_want`/`_mix` scratch colours at 349-350). On an iPad 7 these become GC pauses; not measured on a device, so rank by code reading only.
Fix: hoist scratch vectors/colours to module level and use `.copy().sub()` / `.set()`; for crystallife make `COLORS.bright` a module constant. Verify with a one-off counter (`console.count` around `Vector3` constructor via a test spy) that a 600-frame walk allocates zero in those branches. Keep behaviour identical; run `critters`, `straycats`, `crystallife` tests.

### F6 (MED, M): sw.js and prefetch have no handling for a half-cached build
Evidence: `public/sw.js` precaches every file of a build and keeps 3 builds (`KEEP_BUILDS = 3`, line 30). `main.js:703-713` prefetches up to 10 areas at start-up regardless of connection. On a cellular iPhone the child downloads reef/crystal/moon (about 65 kB each stage A, stages 97-121 kB, per docs/beauty-backlog.md section 4) before she goes there. Failure of a prefetch is only `note('area', err)` (areaload.js:57); the user never sees it, which is right, but it also never retries on `online`.
Fix: in `areaload.js`, add `window.addEventListener('online', () => prefetch queue again)` for ids that failed prefetch; skip prefetch of reef/crystal/moon when `navigator.connection?.saveData` is true. Small, testable with the injected loader.

### F7 (MED, S): per-file `slice(N, M)` pins on JOURNAL_TYPES
Evidence: `test/progression.test.js:1198-1204` pins `JOURNAL_TYPES.slice(0,14)`, `(14,20)`, `(20,30)`, `(30,35)` by absolute position; `test/farmjobs.test.js:95` pins `slice(20, 30)`. Any new journal type inserted in the middle (not appended) breaks these; the newer tests (roofsfinds, reefdivers, crystalx0, reefmore, cavelife) anchor with `indexOf(IDS[0])`, which is sturdier. Not a `slice(-N)` of the whole list, but the same brittleness.
Fix: convert the five absolute-position pins to an `expect(JOURNAL_TYPES).toEqual(expect.arrayContaining(...))` plus an "ids are unique and each group is contiguous" check using `indexOf`. Add the rule to the test conventions: "append-only checks use indexOf, never absolute offsets."

### F8 (MED, S): platform-dependent recorded hashes
Evidence: 54 test files mention `hash`; the run 45935365993 failure was `crystalx0.test.js` "byte-identical to main (recorded hashes)" failing on Linux while passing on this Mac (full suite green here). Per the owner's CI rule, floats must go through `closeDiffs`.
Fix: a shared helper `test/helpers/stablehash.js` that rounds every number to 4 decimals (or 1e-6 relative) before hashing, and replace the raw `JSON.stringify` hashes in crystalx0 and moonx0 first. Add a lint-style test that greps test/ for `createHash(` without importing the helper.

### F9 (MED, M): hot files and fan-in
Evidence (`wc -l`, import counts by grep): `src/game/walk.js` 3,313 lines, 11 importers; `src/progression.js` 2,964 lines, 18 importers; `src/main.js` 1,714; `src/player.js` 1,322; `src/marketlive.js` 1,179; `src/straycats.js` 1,126. The reef/crystal/moon world files are small (reef.js 154, crystal.js 139, moonlife.js 295, catmerge.js 315; reef/crystal have 2 and 1 importers) because their weight is in staged files (`moonscope.js` 651, `reefmarlo.js` 534, `crystallife.js` 516). The hot spots are walk.js and progression.js.
Fix: split progression.js along its existing seams: (a) the sanitisers (`sanitizeState` plus the ~20 `sanitize*` functions, lines 522-1200) into `src/progressionsanitize.js`, (b) CATALOG into `src/catalog.js`. Keep `progression.js` re-exporting both so 18 importers do not change. For walk.js: extract the walk-end/reward block and the net wiring into `src/game/walkend.js` and `src/game/walknet.js` (the file already imports from `./netevents.js`, `./crossing.js`, `./rooms.js` for the same reason).

### F10 (LOW, M): near-identical `*words.js` / `*live.js` / `*parts.js` families
Evidence: counts by filename: 38 `*words.js`, 33 `*live.js`, 38 `*parts.js`, 7 `*pages.js`, 18 `*life*.js` under src/. `cavelifewords.js` 32 lines, `moonlifewords.js` 26, `reeflifewords.js` 39 are the same shape (word table + `phrase(id, ...)`), and each has its own banned-word test (`coopwords`, `denwords`, `lighthousewords`, `padwords`, `clanwords`, ...).
Fix: a single `src/wordtable.js` helper (`defineWords(areaId, familySet, offSet)`) and one generic test that globs `src/**/*words.js`, loads both sets, and runs the banned-word scan on every value (see section 4). That removes the one-test-per-area pattern. Do not touch the word text.

### F11 (LOW, S): 53 `verify-*.html` files at the repo root
Evidence: `ls` of the worktree root shows 53 `verify-*.html` scratch pages beside index.html. They are not imported anywhere (`grep verify vite.config.js` finds nothing, so they are not build inputs).
Fix: move to `tools/verify/` or delete those older than the last release, after the owner agrees. Reduces root clutter and prevents a stray page being deployed if `vite.config.js` ever globs the root.

### F12 (LOW, S): 184 worktrees, 14 GB
Evidence: `git worktree list | wc -l` = 184; `du -sh .worktrees` = 14 GB; `git branch --merged main` lists 173 branches already in main (all but about one are checked out in a worktree, marked `+`). 10 branches are not merged: couch-coop-design, crystal-c5-song, custom-domain, device-audit, family-engine, family-home-m1a, headroom-script, int23, moon-m1-station, suit-dive-moon-design.
Fix (owner decision, nothing deleted here): `git worktree remove` for each merged worktree with a clean status, then `git branch -d` for the merged branches (git refuses to delete unmerged ones with `-d`). A script `scripts/prune-merged-worktrees.mjs --dry-run` that lists them first would make this safe; the nightly iOS refresh runs from main, so main must stay untouched.

## 2. Objective-by-objective notes

**(1) Device performance.** Budgets (from docs/beauty-backlog.md section 4, measured 2026-11-26, plus test/budget.test.js ceilings): tight areas are Woods 68,810 of 70,000 triangles, Pines 67,403/70,000, Gorge 66,539/70,000, Seaside 31,093/34,900, Fair chunk 96.4 of 100 kB, Moon and Reef stage A chunks 64.7 and 65.0 of 65 kB, Greenhouse 74/83 meshes, Crystal draw row 13/13. These are code-size and triangle budgets; no shadow-per-frame or iPad 7 measurement was run in this review (no device). The M1/M2 target and iPad 7 floor are not encoded in a test, only per-area ceilings. Per-frame allocations: see F5.

**(2) Memory and loading.** Area loader (`src/game/areaload.js`): caches packs, joins in-flight loads, 15 s timeout, forgets failures, keeps a pack that arrives after timeout. Weak spot: the three staged loaders (F1). Moon stages retry once (`moonlate.js:23`, "never an error screen"). Service worker keeps 3 builds, never touches non-/assets/ URLs. No texture memory measurement was run.

**(3) Accessibility.** 162 src files mention reduced motion; the 21 `*life*.js`/`*live.js` area files all have a reduced/calm reference except pure-data ones (`cavelife.js`, `cavelifeparts.js`, `cavelifewords.js`, `moonlifewords.js`, `reeflifewords.js`; the cave's live file `cavelifelive.js` has 4). Touch targets: `src/style.css` sets 44 px on cards, settings buttons and the pause/map buttons (lines 280, 481, 520, 543, 658, 664, 693, 720); the in-walk HUD hint keys are 22-30 px but are labels, not buttons. A generic check that every `button` rule has `min-height: 44px` was not run; propose adding it to a test (low).

**(4) Privacy.** Every network call: `src/net.js:533` (Supabase realtime channel `room:<code>`, presence key from `playerId`+device tag, profile = pet name, breed, accessories, finds, walkOn), `src/cloud.js:349` (`client.rpc` with named RPCs; secrets and codes in the body, not the URL), `src/teleport.js:273` and `main.js` (`prefetch` = static chunk loads of own files). No `fetch(`, `sendBeacon`, analytics or third-party script anywhere in src/ or index.html. Chat is an enum of 16 phrases and emotes (`src/chat.js:5-22`), peers map the id locally, so the channel cannot carry free text. The one child-typed string that leaves the device is the pet name (profile). Room code is in the channel name, not in a URL. Word sets: `test/offwords.test.js` globs `src/**/*.js` (line 49) for the everyday set; the family-set scan is per-area test files (F10 proposes one glob).

**(5) Online/co-walk.** `WALK_ON = 1` (`src/gatecross.js:20`); a roster only walks on when every member has `walkOn === WALK_ON` (line 239), so an older build without the field blocks walk-on cleanly (the pause card returns after `WALK_ON_WAIT_MS` = 16 s, crossing.js:46). `areaLifeSender` (`netevents.js:46-50`) sends `{v:1, type:'area-life', area, ev}`; an older build ignores unknown types (the receive chain at line 358 has no default branch), and the receiver ignores an event whose `area` differs from its own (line 358). Risk: bumping WALK_ON to 2 later will strand every older partner; plan a `walkOn >= 1` rule before that day. Not tested live in this review.

**(6) Test health.** Above, plus F2, F7, F8. `testTimeout` 30 s in vite.config.js:113; reefridelive and reeflabshow are in the 90-100 s file class and are not in the heavy list.

**(7) Build/CI.** Pipeline: 4 test shards (`npx vitest run --shard=n/4`), build, private-edition marker grep, Pages deploy, smoke (`scripts/smoke.mjs`, 8 min cap). Cancelled runs: F3. `keepalive.yml` pings Supabase `profiles_by_ids` with an empty list.

**(8) Process and token cost.** From `calls.csv` (63 rows): lean-builder 33 calls 3.98 M tokens, lean-checker 20 calls 0.69 M, lean-advisor 4 calls 0.21 M, general-purpose 2, main-session 2 checkpoints 0.44 M. Biggest single calls: greenhouse-g4 build 306 k, crystal-c1 build 282 k, reef-r1 build 289 k, reef-checkpoint-final 270 k. All 8 retries (4.4% of tokens) are one pattern: the builder ran only focused tests, then the checker's full-suite run found 3-4 red tests from the fixtures (greenhouse-g4 x4, reef-r1 x3, reef-r6 x3), costing a checker retry plus a builder fix (reef-r1: 18.5 k + 33.6 k + 16 k). Opus: 3 escalations, all changed the plan (199 k tokens) = good value, keep.

## 3. Lessons proposed for the standing rules
1. A builder whose change touches a shared table (JOURNAL_TYPES, phrase tables, budget rows, area lists, MERGE_RULES) must also grep tests/ for that table's name and run those files; that is the cause of every retry in the log.
2. Never cache a promise in a module variable without clearing it on rejection (F1).
3. Anything hashed or compared as floats in a test goes through the shared helper (F8).
4. Pins use `indexOf` anchors, never absolute offsets (F7).
5. Any test file over about 20 s in a full run goes into `test/heavy.js` in the same commit (F2).
6. Prune merged worktrees at the end of each wave (F12).

## 4. Banned-word scan coverage
`test/offwords.test.js:49` globs every `src/**/*.js` for the everyday set. The family set has per-area word tests (`coopwords`, `denwords`, `lighthousewords`, `padwords`, `clanwords`, `freshcat.words`, `buttonwords`, 17 files whose names contain "words"/"banned"/"profan"). No single test iterates all `*words.js` modules; a new area whose words test is forgotten is not scanned. F10 closes that.

## 5. Ready-to-launch builder briefs (top 8)

Every brief: worktree off main, `npm ci`, focused tests plus `npm run build`, commit message ends `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, report under 150 words, no merge.

**B1 (F1) retry after a failed stage download.** Branch `stage-retry`. In `src/world/reefstages.js`, `crystalstages.js`, `moonstages.js` make `loading` reset to null when the promise rejects (rethrow). Add `test/stageretry.test.js`: for each loader, inject a failing then succeeding import (use `vi.doMock` on the stage module or export a `__setImporters` test hook) and prove the second `loadXStages()` call succeeds; also through `createAreaLoader` for reef and crystal. Run: stageretry, areaload, areas, lazybuild, reef/crystal area tests, `npm run build`. Budget: no chunk may grow more than 0.1 kB.

**B2 (F2) refresh the heavy-test table.** Branch `heavy-refresh`. Add `scripts/heavycost.mjs` (reads a vitest JSON report path, prints `HEAVY_COST` rows for files over 20 s, rounded) with a small test. Run `npx vitest run --reporter=json --outputFile=<scratch>/vt.json`, update `test/heavy.js` with the new rows (reefridelive, reeflabshow, marketlive at least). Run test/heavy tests and `npx vitest run test/shard*`. Report old vs new predicted shard seconds.

**B3 (F3) stop paying for cancelled test shards.** Branch `ci-cancel`. Edit `.github/workflows/deploy.yml`: add a first step to the `test` job that exits early (job success, skip the rest) when `git ls-remote origin main` is not `$GITHUB_SHA`; keep `cancel-in-progress` for the group. Do not change the shard count. Validate with `actionlint` if installed, else by reading; no push to main in the builder run (open a branch and report).

**B4 (F4) generic save-key survival test.** Branch `save-keys-test`. Add `test/savekeys.test.js` as described in F4 with an explicit `SENTINELS` map; fail with a "add a sentinel for <key>" message for keys with none. Do not edit `src/`. If some key is found dropped, list it in the report, do not fix it. Run: savekeys, catmerge, savefixture, savesize.

**B5 (F5) stop per-frame allocations.** Branch `frame-allocs`. Hoist scratch vectors/colours in `src/critters.js` (lines 783-871), `src/straycats.js` (873-1070) and `src/world/crystallife.js:355`. First write a test counting `THREE.Vector3`/`Color` constructions over 600 simulated frames (before: nonzero, after: zero in those branches). Behaviour must not change: run critters, straycats, crystallife, crystalx0, budget tests and `npm run build`.

**B6 (F7+F8) brittle pins.** Branch `test-pins`. Replace the absolute `JOURNAL_TYPES.slice(a, b)` pins in `test/progression.test.js:1198-1204` and `test/farmjobs.test.js:95` with `indexOf`-anchored contiguous-group checks; add `test/helpers/stablehash.js` and use it in `crystalx0.test.js` and `moonx0.test.js`. Test files only. Run those four files and `catmerge`.

**B7 (F10 + section 4) one banned-word test for every word table.** Branch `words-scan`. Add `test/allwords.test.js` that globs `src/**/*words.js`, loads each module's exported tables (both the family and everyday sets via `src/world` word-table seam), and runs the banned-word list used by `offwords.test.js` over every string value; fail names the file and key. No src edits. Report any hit without fixing.

**B8 (F12) safe prune script.** Branch `prune-worktrees`. Add `scripts/prune-merged-worktrees.mjs` with `--dry-run` default and `--apply`: for each worktree whose branch is merged into main and whose `git status --porcelain` is empty, print (or remove) the worktree and `git branch -d` the branch; skip main, the current worktree and any with changes. Unit test with a temp git repo. Do NOT run `--apply` against the real repo; the owner decides.
