# Engineering review 4, 2026-11-27 (docs only, main at 42671de8)

Covers the 166 commits (49 merges) since review 3 (0d46ca1f..main): the beauty rounds for ten areas, the couch co-op rows (M5d), Moon lip, Rooftops, the CI-tail change. Unlike review 3 this one had `node_modules`, so figures are measured, not estimated. Everything below is from a build and a full `vitest run` made in worktree `eng-review-4` on 2026-11-27.

**Caveat on every timing.** The Mac was at load average about 50 (other builders running) during the full run, so seconds are inflated by perhaps 1.5 to 2 times. Ratios between files are more trustworthy than the totals. I ran the suite once; "flaky" below means "failed or crossed the timeout in this run, or noted in the brief", not a repeated measure.

## Findings (ranked: severity, effort S/M/L, recommended default)

### HIGH

- **B1 HIGH M: three downloads are within 1 kB of their ceiling.** `npm run build` (postbuild line from `scripts/buildjson.mjs`):

  | Download | Now (gzip) | Ceiling | Spare |
  |---|---|---|---|
  | Moon stage A | 64.7 kB | 65 | 0.3 kB (0.5%) |
  | Fair | 99.5 kB | 100 | 0.5 kB (0.5%) |
  | Reef stage A | 64.1 kB | 65 | 0.9 kB (1.4%) |
  | Market | 79.5 kB | 100 | 20.5 kB (fine) |
  | Moon all stages | 131.7 kB | 150 | 18.3 kB (12%) |
  | Reef all stages | 103.9 kB | 150 | 46 kB |
  | Start-up | 676.0 kB | 720 | 44 kB (6.1%) |

  Start-up is healthy: 676.0 now against 666.7 at review 3 (+9.3 kB over a long stretch of work), and the beauty rounds held it flat (675.87 to 676.02) because they folded decor into existing meshes. Only Moon A, Fair and Reef A are inside the 3% band (`TIGHT_KB = 3` in `scripts/headroom.mjs` calls them TIGHT). Any further Moon, Reef or Fair work will fail `lazybuild.test.js` on size, and the cheapest reaction (raise the ceiling) is the wrong one. **Default:** a brief for the next Moon, Reef or Fair change must move something to a later stage first (Reef already shows how: lab, wreck, ride are separate stages; the Fair has none). Fair is the only one with no stage to move into: plan a `fair` stage split (rides vs stalls) before the Viking boat from `whisker-walk-fair-backlog`. Do not touch the 720 start-up ceiling.

- **T1 HIGH S: the heavy-file cost table is stale, so CI shards are uneven and the local run is slow.** Full run: **858 test files, 21,234 tests (21,172 passed, 61 skipped, 1 failed), wall 9:01 (user 2586 s) at load 50.** 51 files took over 20 s and sum to 3,133 of 4,804 file-seconds (65%). The ten slowest files: fairgames 240 s, housecamera 234, gorge 144, folds 128, reefridelive 119, reeflabshow 118, fightcamworld.pines 98, fightcamworld.moor 92, foundwearfit 85, fightcamworld 83. `test/heavy.js` lists 28 files at older numbers (fairgames 178, housecamera 140, reeflabshow 58, foundwearfit 38, gorge 124), so the listed ones have grown 1.2 to 2.2 times, and four files over 40 s are not listed at all: `catdrape` 48, `dencats-den` 47, `holidaywear` 43, `housegame` 41. `reefridelive` (119 s) and `foundwearfit` are the largest growth. Effect on CI: `dealShards` splits by this table, and the latest live run (46051957880) shows the result: shard 1 took 7m27s, shards 2 to 4 took 4m02 to 4m36 (about 3 minutes of waiting on one machine). **Default:** run `node scripts/heavycost.mjs <json>` on a report (I left one at the scratchpad path used for this review; any `npx vitest run --reporter=json --outputFile=x.json` gives it) and paste the rows. Pure bookkeeping, should save about 2 to 3 minutes per deploy and rebalance. Re-do it every two or three review rounds.

- **C2 HIGH S: the CI-tail change does not cancel anything that is already running; a new push now waits.** `.github/workflows/deploy.yml` sets `concurrency: pages, cancel-in-progress: false` at workflow level. With that, a running run is never cancelled, and a newer push waits as the one pending run. The stale checks at the top of each shard and of `build` only help a run that *starts* after a newer push; a run whose shards are already running goes on to the end (4 to 8 minutes of shard time), and only `build` and `deploy` then skip (saving about 40 s). Review 3 asked for `cancel-in-progress: false` on the `deploy` job only. As written, the newest commit may wait the length of the previous run (about 8 minutes) before its own 8 minutes start, which is worse than before for the child waiting on a fix, and the minutes billed are about the same. Evidence in the run list: all three cancelled runs (16:19 to 16:35) predate the change; since then every run finished, but pushes were 8 to 16 minutes apart, so queueing has not been seen yet. **Default (S):** workflow-level `concurrency: {group: ci-${{ github.ref }}, cancel-in-progress: true}` for gate, test and build, and a job-level `concurrency: {group: pages-deploy, cancel-in-progress: false}` on `deploy` only. Then the stale checks become a cheap second line rather than the only one.

### MED

- **T2 MED S: one timeout failure under load, and the same pattern in two files.** `catdrape.test.js` failed in this run: "sitting and napping, no thigh comes through the cloth (a cat posed standing first)" took 38.3 s against the 30 s `testTimeout` (`vite.config.js:107`), message "STACK_TRACE_ERROR" from the runner. It passes alone. `reeflabshow` (118 s file, listed in heavy.js at 58) and `gorgelife` (25 s file) did not fail in this run but sit in the same band: 32 single cases exceeded 20 s, 4 of them over 30 s (they set their own longer timeouts: for instance `builder.test.js` "no rock hangs over walkable ground" 67 s). Under CI shards (4 machines, no neighbours) these are not at risk; they are a local-run risk, which is when a builder is told "one failure" and spends a turn. **Default:** give every case that takes more than 15 s in the report an explicit per-test timeout of 120 s (a table in `test/heavy.js` could export `SLOW_CASES` and a helper, but a plain third argument to `it` is enough), and add `catdrape` to `HEAVY_COST`.

- **T3 MED S: ratchets that fire on improvement or hide drift.** (a) `test/budget.test.js:649` still pins the Seaside at an exact `toBe(34157)`; any decor change in either direction goes red, the opposite of the upper-bound rule recorded at review 3. (b) The grass tint tolerance (`test/grass.test.js:771` default 0.04) has been loosened per beauty round: Woods 0.075 (`:832`), Pines 0.045 to 0.06 to 0.08 (`:854`), so the "tuft follows ground colour" check is now about half as strict in the two areas that changed most, and each round re-tunes it instead of the decor staying inside it. Not a bug, but the next beauty round will want a third bump. **Default:** change (a) to `toBeLessThanOrEqual`; for (b) say so in the beauty-round brief ("keep p95 at or under 0.08, report the value") and stop at 0.08.

- **H1 MED M: area headroom table (triangles, from a build of every area, merged or built as the test counts it).** Within 5% of the triangle row:

  | Area | Triangles | Row | Spare | Meshes / row | Casters / row |
  |---|---|---|---|---|---|
  | Gorge | 69,542 | 70,000 | 0.7% | 61 / 450 | 36 / 380 |
  | Woods | 69,379 | 70,000 | 0.9% | 184 / 450 | 154 / 380 |
  | Seaside | 34,157 | 34,900 | 2.1% | 72 / 85 | 31 / 45 |
  | Pines | 68,313 | 70,000 | 2.4% | 123 / 450 | 71 / 380 |
  | Reef (edge of the band) | 43,897 | 46,200 | 5.0% | 23 / 25 | 1 / 2 |

  Also worth seeing: mesh rows at **0% spare**: Crystal 13 / 13, Treehouse 6 / 6, Snowville 6 / 6 (these are built-meshes counts after merge; the rows were set at measured value). Mesh spare under 10%: Reef 8%, Greenhouse 10.8%, Moon 10.7%, Neighborhood 10.7%. Next band 5 to 10%: Snowville 5.2% (tri), Moor 7.3%, Farm 8.0%, Crystal 8.5%, Fair 8.6%, River 8.9%, Greenhouse 9.5%. Gorge, Woods, Pines and Moor are limited by the 70,000 triangle row; they have lots of mesh room (61 to 184 of 450), so a further beauty round there cannot add triangles, only recolour. The Gorge, Woods and Pines rows are unchanged since the start; each beauty round folded new decor into an existing mesh to stay under them. **Default:** the beauty rounds for these three are finished; list "triangle-neutral only" in the backlog (`docs/beauty-backlog.md`), and keep the 0%-spare mesh rows as they are (they are upper bounds and the three areas are final) but note them in the brief for any Crystal, Treehouse or Snowville change. Remember that `budget.test.js` counts `build(scene)` only; the life budget (`test/lifebudget.test.js`, review 3 P1) is the second number.

- **D1 MED S: duplicated code from the last 40 commits.** No dead modules: all 149 new `src/` files from this stretch are imported by something (I checked each new module name against `src/`). Duplicates found:
  - `src/world/woodsbeauty.js` and `src/world/pinesbeauty.js` are the same 168 lines with 22 of them different (width 0.022 versus 0.03, colour tables, counts): `tuft`, `twig`, `root`, `flat`, `sliver`, `hash01` are copied. A shared `src/world/floorbeauty.js` with a per-area table would cut about 120 lines, and a third floor (the Gorge has its own) would not copy a third time. (Chunk size gain: small, about 0.5 kB gzip each; do it for maintainability, not budget.)
  - `mulberry32` is defined locally in `src/world/holidaydecor.js:64` and `src/world/reeflabhull.js:10`, while `src/rng.js:1` exports one (the sequence is the same constants, so a swap should be identical, but check the pin tests).
  - `hash01` is local in `src/world/snowvillejob.js:31` and `src/world/crystaldeeperrand.js:33`; `distSeg` in `farmbeauty.js:29` and `parkbeauty.js:38` (different argument shapes).
  Low risk, small gain. **Default:** do the beauty floor merge (M) only when a fourth floor is wanted; swap the two `mulberry32` copies now (S).

- **R1 MED S: hygiene, worktrees.** `git worktree list | wc -l` is **104** (101 under `.worktrees/`, one under `.claude/worktrees/`, one prunable at a temp path `/private/tmp/...tv-clutter2/base`, plus main), about **13 GB** on disk (each about 180 MB because each has its own `node_modules`; this is the rule, not a fault). `node scripts/prune-merged-worktrees.mjs` (dry run only; I did not apply) reports 106 listed worktrees, **92 prunable and 14 skipped** (unmerged or changed). `git branch | wc -l` is 104: 93 merged into main, 11 not; remote branches 10 (`couch-m3-cloud`, `eng-review-3`, `jungle-r2-cloud`, `life-budget-cloud`, `map-spacing-cloud`, `moor-beauty-cloud`, `roofs-fixes-cloud`, `sw-timeout-cloud`, plus main and HEAD). Stash: **1**, `stash@{0}: WIP on snowville-r2: a42b7a95 Merge main into snowville-r2` (a merge-era WIP; check, then drop by hand). **Default (S, owner decision since it deletes):** run the prune with `--apply` once at a quiet moment and drop the stash after a look; this frees roughly 11 GB and makes `git worktree list` readable. The eight remote `-cloud` branches are older cloud runs; delete the merged ones with `git push origin --delete`.

### LOW

- **R2 LOW S: pictures in the repository.** `tools/verify` holds 247 tracked files (67 HTML pages, 180 PNGs), **45 MB in the working tree**; `docs/pictures` holds 24 files, 4.2 MB. Of everything added since review 3: **271 files, 51.3 MB** (all of it pictures and pages). `.git` pack is 77.5 MiB. The five largest are `tools/verify/moor-beauty-round-pics` 9.3 MB, `woods-beauty-pics` 6.6, `pines-beauty-pics` 6.4, `gorge-beauty-pics` 5.5, plus the older Moon sets. They are `before` and `after` stills for approval, not part of the build or any test (`grep tools/verify test/` finds none). Deleting them now does not shrink the clone (they stay in history); only a history rewrite would, and for a repo about to go private that is not worth the risk. **Default:** from now on commit the HTML page and ONE contact-sheet PNG per round, keep the `before` and `after` sets outside git (the scratchpad or `~/Pictures`); remove the five biggest `*-pics` directories from the tree in a docs-only commit if the owner agrees (S). Root files: the repository root is clean (9 files). In the MAIN checkout there are nine untracked, ignored `verify-*.html` files left from before the move to `tools/verify/` (`verify-cat.html`, `verify-castbudget.html`, ...): ignored by `.gitignore:14`, harmless, safe to delete by hand.

- **K1 LOW S: two process notes.** (a) `test/fixtures/startup-kb.json` was re-recorded in seven of the last 40 commits ("intNN: re-record start-up"), each time by hand after the merge, and the recorded value moved only between 675.87 and 676.02. A slack of 0.3 to 0.5 kB in `lazybuild.test.js` (the test already has "kb + slack") would end seven commits in forty. (b) The couch rows (`test/coopseam.test.js`, `test/coopbudget.test.js`, `src/coop/table.js`) changed 7, 7 and 6 times in the last 40 commits. They are the new bookkeeping hotspot; a single fixture for "which places are open to two cats" would remove the conflicts (same fix as T1 in review 3).

## Review 3 follow-ups (status, read from the tree)

- P1 life budget: `test/lifebudget.test.js` exists and passes (1 s). P2 worst spot: the `* 0.92` lower bounds are gone from the three grow tests, `docs/river-worst-spot.md` written; `budget.test.js` rows are in `test/fixtures/area-budgets.json` with `scripts/recordbudgets.mjs`. C1 ci-tail: landed, see C2 above. S1 all-text scan: branch `alltext-scan` exists, not merged at this commit. Branches `sw-timeout-cloud` and `touch-lint` also exist; not checked.
- G6 fetch-mission: still parked. D2 and D3 from review 3: still skipped for start-up size, which still has 44 kB of room, so a `FLAGS` table is affordable now (it measured +0.02 kB); still not urgent.

## Deploy workflow: read and first-live-run notes (item 6)

The brief says the workflow has never run live; it has. The commit with the C1 change (eab6d64b) is in main, and run 46051957880 (the int63 merge, 42671de8) finished **success**: gate 3 s, four shards (4m02, 4m36, 4m39, 7m27), then build, deploy and smoke; its jobs include the "Stale check (fails open)" steps, so the new file ran. What it has not yet done is meet a real stale push.

Read for mistakes:
- Fine: the `git ls-remote https://x-access-token:...` call needs no checkout, fails open, and compares `GITHUB_SHA`; the build job exports `stale` as an output and `deploy` is guarded by `needs.build.outputs.stale != 'true'`; a skipped build skips deploy and smoke (success is implied).
- Concern (C2): concurrency at workflow level, see above.
- Concern: a stale run leaves a **green** check on a commit whose tests never ran (every step after the stale check is skipped, the job still ends in success). The newest commit is always tested in full, so nothing wrong ships, but the commit list on GitHub will show tick marks on untested commits. Failing the step would be wrong (a skip would become a failure); better to write a `$GITHUB_STEP_SUMMARY` line "skipped: main moved to X". S.
- Minor: the same 10-line stale block is pasted three times (gate, shard, build). If it changes, it must change in three places. Move it to `scripts/stalecheck.sh` or a composite action once the checkout is not needed (the script would need a checkout; keep it inline or use `actions/github-script`). Low value.

To check on the first run that meets a stale push (push two commits within a minute):
1. The older run: gate shows `current=false` (log line "stale: main is <sha>") or, if it was already past the gate, the shards show the stale line and skip checkout, `npm ci` and vitest in seconds.
2. The older run never reaches `deploy` (job greyed as skipped), and `smoke` too.
3. The newer run is not shown as "cancelled" (only a third push in a row shows one "Canceled" run, the replaced pending one: expected).
4. The newer run starts immediately if the older one skipped, or waits for the older one if its shards were already running (C2): note how long.
5. The token in the `ls-remote` URL does not appear in clear in the log (GitHub masks `github.token`; look anyway).
6. After the repo goes private: the `ls-remote` call still works with `contents: read` (it should), and `scripts/smoke.mjs` still reaches the Pages URL.

## Suggested briefs

- **ci-concurrency (C2):** split concurrency as above; run it with two quick pushes; report minutes before and after.
- **heavy-table (T1, T2):** regenerate `HEAVY_COST`, add `catdrape`, `dencats-den`, `holidaywear`, `housegame`; per-test timeouts of 120 s on the cases over 15 s; report shard times of three CI runs.
- **small-ratchets (T3, K1):** Seaside `toBe` to `toBeLessThanOrEqual`; slack on the start-up pin; two `mulberry32` swaps.
- **fair-stage (B1):** plan a stage split for the Fair before any new ride; do not raise ceilings.
- **hygiene (R1, R2):** owner says yes, then `prune-merged-worktrees.mjs --apply`, stash drop, remote branch cleanup, pictures policy.

## The cheap one, done: `npm run test:pins`

Added to `package.json`. It runs fourteen files that guard what a change to one area can break in another, and no other test file is needed to see those pins:

`budget`, `housebudget`, `lifebudget`, `coopbudget` (draw, triangle and couch budgets), `growpines`, `riversouth`, `moornorth` (the worst-spot ceilings for the grown strips), `silhouette`, `twolegplace`, `viewclear2` (no building, tree or prop blocks the view or the cat), `grass` (the grass tint tolerance and styles), `foundwearfit` (every outfit on every cat shape), `areacoverage` (a new place wired everywhere) and `lazybuild` (the real production build: start-up size, chunk ceilings, stages). Measured: **14 files, 696 tests, all pass, 27 s wall** at the same load. Left out on purpose: `fairgames`, `housecamera`, `folds`, `gorge` and the `fightcamworld.*` files (each 80 to 240 s and single-area), `mergeprops` (24 s), and `coopseam`.
