# Engineering review 2b, 2026-11-27 (advisor, read-only, main at 5b46f43a)

Covers Moon M1-M3, passport/Back, N0 seams, Snowville V1-V7, Treehouse T1-T4. Numbers are from reading code, not from a build. Open from review 1: B6.

## Findings (ranked)

- **G1 HIGH S: a new area's walk count can be lost.** The walks defaults are a hand-typed list (`src/progression.js:578`), the sanitiser keeps only those keys (`:1297`), `completeWalk` does `state.walks[areaId] += 1` (`:2168`). A catalog row without a walks key gives NaN in memory and 0 after every load. No test ties walks keys to `CATALOG.areas`.
- **G2 HIGH S: `savekeys` checks top-level keys only** (`test/savekeys.test.js:54-56,97`). `album` for Snowville/Treehouse is never round-tripped; `sanitizeNewArea` (`progression.js:990-993`) keeps only `step`, `album` and would silently drop a new Jungle field.
- **G3 MED S: start-up pin has ~0.2 kB left** (`test/lazybuild.test.js:88`, 658.0 + 6.7); a merge-conflict hotspot every milestone.
- **G4 MED S: gold total pinned 47 times in 23 test files** (goldmice, snowvillefinds, treehousefinds, fair, `series-words-off-home.json`).
- **G5 MED M: staged-area boilerplate copied five times** (`src/world/*stages.js`, `scripts/buildjson.mjs:86-146,228-257`); `stageretry.test.js` lists only reef/crystal/moon.
- **G6 MED M: Snowville and Treehouse mission/life files are near-copies** (Jungle would be the third).
- **G7 MED S: Moon flowers call `setBloom` every frame** (`src/world/moondeeplive.js:113,116,182`): 3 Vector3 per planter and an instanceMatrix upload each frame.
- **G8 MED S: no headroom on Reef stage A (65.0/65), Moon A (64.98), Fairground (96.4/100)**; nothing tells a builder which shared modules feed them (headroom script is on main: `npm run headroom`).
- **G9 LOW S: flags disagree on default** (Snowville ON, Treehouse and Jungle OFF).
- **G10 LOW S: `test/clanphrases.test.js` imports `REEF_LAB_LINES` three times**; hand-kept import list is breaking down; `test/heavy.js` lacks moon/snowville/treehouse.

Start-up trend: +6.5 kB over about 15 milestones (~0.4 kB each); 55 kB headroom is not urgent.

## Briefs (all: worktree off main, `npm ci`, focused tests + build, no merge, report under 150 words)

- **C1 (G1+G2) `area-coverage`:** add `test/areacoverage.test.js` (every `CATALOG.areas` id plus den has a walks key, loader, entry module, region, coop key); extend savekeys to round-trip each numeric sub-key (explicit CLAMPED list for derived bits). Test files only; report failures, do not fix.
- **C2 (G3+G4) `pin-ratchet`:** move the start-up figure into `test/fixtures/startup-kb.json` with a recorder script; derive gold totals from `GOLD_TOTAL === KNOWN_GOLD.size` everywhere except goldmice.
- **C3 (G5) `staged-table`:** one `STAGED_AREAS` table in `buildjson.mjs`; tests loop over it. No `src/` change.
- **C4 (G6) `fetch-mission`:** shared `src/world/fetchmission.js`; rebuild Snowville/Treehouse missions on it; tests unchanged; stage A growth <= 0.2 kB each.
- **C5 (G7) `moon-bloom`:** skip `setBloom` when unchanged, hoist vectors, test one upload over 600 frames.
- **C6 (G9+G10) `flags-words`:** make flag defaults consistent and documented; glob the word-table imports in clanphrases (as `allwords.test.js` does); add moon/snowville/treehouse to `test/heavy.js`.

Order: C1 first (only item that can lose a child's progress); C2 and C3 before the Jungle milestones multiply the pins.
