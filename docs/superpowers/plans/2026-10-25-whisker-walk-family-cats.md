# Family Cats Easter Egg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the family cats D2 and Digit to the cat shop, fix Robbie's inverted coat, and remove Rosa (who died) with a one-time 40-point refund and one gentle line.

**Architecture:** New cats are rows in four parallel tables (`CATALOG.cats`, model `STYLE`/`EYE_COLORS`, `PERSONALITIES`, `VOICES`) plus replies and a shop blurb. Coat details come from small new `STYLE` flags in `src/cat/model.js`. Rosa's retirement is a pure pass over the RAW parsed save in `loadState`, before the sanitizer drops her id, guarded by an additive `retired` marker; a transient farewell line is handed to the home base once.

**Tech Stack:** Vanilla JS (ES modules), three.js, Vite, Vitest.

**Spec:** the owner's brief for this session plus memory note `whisker-walk-family-cats-easter-egg.md`; reference photos under `~/.claude/uploads/eccb7380-6164-4a48-9b22-d22379a805ba/` (D2 `3437b014-image.jpg`, Robbie + D2 `fe9ee490-image.jpg`, Digit `e86030d7-image.jpg`).

## Global Constraints

- Tests: `npx vitest run --exclude '.claude/**'` (never bare `vitest`, it picks up other worktrees).
- `SAVE_VERSION` stays `4`. New save fields are additive and sanitized with a default.
- Do NOT edit `src/clanwords.js` or `src/clannames.js` (another session owns them).
- Commit trailer, exactly: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- No SQL. Never commit on `main`; never push or merge.
- Match the surrounding code: dense explanatory comments where the file already has them, same naming idiom.
- The players are 11 and 9. Anything Rosa-related is short and kind.
- The model is deterministic (no `Math.random`) and every breed has a mesh ceiling in `test/catmodel.test.js`.

## Review Focus

1. A save that owned Rosa loaded twice (reload before any other save): refund exactly once. Test in Task 1.
2. "Load from cloud" (`replaceFromPayload`) of an old payload that still has Rosa: refunds that payload once and persists. Test in Task 1.
3. A co-walker or ghost on an older build sending `breed: 'rosa'`: must fall back to tabby, never crash `buildCat`. Already whitelisted by `PERSONALITIES` in `remotecats.js:70` and `ghosts.js:41`; Task 3 adds a test.
4. Digit's longer legs: paws still at ground level in every pose, and body-slot accessories (sweater, cape, backpack) still sit on the raised body. Test in Task 4.
5. The farewell card and the "While you were out" news card both wanting the screen on the same boot: the farewell wins, news waits. Test/check in Task 2.

---

### Task 1: Retire Rosa in the save (refund, marker, farewell line)

**Files:**
- Modify: `src/progression.js` (`CATALOG.cats`, `defaultState`, `sanitizeState`, `loadState`, `createProgression`, `replaceFromPayload`)
- Test: `test/progression.test.js`

**Interfaces:**
- Produces: `progression.takeFarewell(): string | null` (returns the line once, then null). Exported const `ROSA_FAREWELL` for tests. Save field `retired: string[]`.

- [ ] **Step 1: Write failing tests** in `test/progression.test.js`, `describe('retiring Rosa')`, using the file's existing in-memory storage helper:
  - owned + equipped: raw v4 save `{ points: 10, unlocked.cats: [...starters, 'rosa'], equipped.cat: 'rosa' }` → `state.points === 50`, `unlocked.cats` lacks `'rosa'`, `equipped.cat === 'tabby'`, `state.retired` contains `'rosa'`, `takeFarewell()` returns a string containing `'Rosa'` and `'Tabby'`, and a second `takeFarewell()` returns `null`.
  - owned, not equipped: points +40, `takeFarewell() === null`.
  - never owned: points unchanged, `retired` contains `'rosa'`.
  - idempotent: after the first load, storage already holds the stripped save with the marker (read `storage.getItem` directly, without any further mutation); a second `createProgression(storage)` gives the same points and no farewell.
  - marker honoured: a raw save with `retired: ['rosa']` and `'rosa'` still in `unlocked.cats` → no refund.
  - `replaceFromPayload` of a Rosa-owning payload → +40 once, persisted.
  - v3 save with Rosa equipped → refunded and farewell (retirement runs before migration).
  - a fresh `defaultState` save has `retired: ['rosa']`; garbage `retired` (`'x'`, `[1]`, `['nope']`) sanitizes to the known ids only.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3: Implement.**
  - Remove `rosa` from `CATALOG.cats`.
  - `const RETIRED_CATS = { rosa: { name: 'Rosa', price: 40 } };` with a comment: Rosa was a real family cat who died; this is the one-time refund.
  - `export const ROSA_FAREWELL = (catName) => \`We'll always love Rosa. 💛 Your 40 points are back, and ${catName} will walk with you today.\`` (DRAFT wording; the owner signs it off. Keep it in this one place.)
  - `retireCats(parsed) → { parsed, farewell }`, pure: for each id in `RETIRED_CATS` not in `asStringArray(parsed.retired)`: if raw `unlocked.cats` includes it, add the price to `points` (via `asFiniteNonNeg`, never to `lifetimePoints`); if raw `equipped.cat === id`, set `farewell = id`. Always add every retired id to `retired`. Non-objects pass through untouched.
  - `loadState` calls `retireCats` on the parsed object before the version branches and returns `{ state, changed, farewell }` (update both call sites). `changed` is true when the raw save lacked any retired id.
  - `defaultState().retired = Object.keys(RETIRED_CATS)`; `sanitizeState` keeps `retired` as `asStringArray(...)` filtered to `RETIRED_CATS` keys, deduped. Comment: additive, so `SAVE_VERSION` stays 4.
  - `createProgression` and `replaceFromPayload`: when `changed`, `save()` immediately; when `farewell`, hold `ROSA_FAREWELL(CATALOG.cats[state.equipped.cat].name)` in a closure variable that `takeFarewell()` returns and clears.
- [ ] **Step 4:** Run the full suite, expect PASS (fix any test that listed `rosa` in `CATALOG`, e.g. `test/brain.test.js` loops the catalog).
- [ ] **Step 5:** Commit `feat(cats): retire Rosa with a one-time refund and a gentle line`.

### Task 2: Show the farewell line on the home base

**Files:**
- Modify: `src/ui/homebase.js` (new `showNotice`, gate in `showNews`), `src/main.js` (call after the first `homebase.show()`), `src/style.css` only if a modifier is needed
- Test: `test/homebase*.test.js` if a homebase DOM test harness exists; otherwise this task is eye-checked in Task 6.

**Interfaces:**
- Consumes: `progression.takeFarewell()` from Task 1.
- Produces: `homebase.showNotice(text: string): boolean`.

- [ ] **Step 1:** If a homebase DOM test exists, add: `showNotice('x')` renders a card with the text (as `textContent`, never `innerHTML`) and one OK button; OK removes it; `showNews(...)` returns `false` while the notice is up.
- [ ] **Step 2:** Implement `showNotice` reusing the `.colony-news` / `.colony-news-card` / `.colony-news-btn` look: no heading, the one line in a `<p>`, an `OK` button, Escape also closes, focus the button. It has its own element and handlers and must NOT call `markColonySeen`. `hide()` removes it too. `showNews` returns false while a notice is up.
- [ ] **Step 3:** In `main.js`, right after the boot `homebase.show()`, `const note = progression.takeFarewell(); if (note) homebase.showNotice(note);`. Read how the boot sequence and the news pull at `main.js:~402` are ordered and make sure the notice is shown first.
- [ ] **Step 4:** Full suite PASS. Commit `feat(home): a one-time notice card for the Rosa farewell`.

### Task 3: Remove Rosa from every other table and comment

**Files:**
- Modify: `src/cat/model.js:14,18`, `src/cat/brain.js:15`, `src/catvoice.js:12`, `src/catreplies.js:72-79`, `src/ui/homebase.js:33`, `src/samples.js:2`, `src/straycats.js:135`, `docs/RECORDING-PETS.md` (present-tense family guide; leave historical plans/specs alone)
- Test: `test/catmodel.test.js`, `test/catvoice.test.js`, `test/brain.test.js`, `test/straycats.test.js:560`, `test/interactions.test.js:1265`, `test/samples.test.js`, `test/net.test.js`, `test/remotecats.test.js`

- [ ] **Step 1:** Remove the `rosa` rows/entries. Comments that list the family pets list the current ones and say so without dwelling.
- [ ] **Step 2:** Tests: drop `rosa` from breed lists and `CEILING`; `brain.test.js:17`'s `rosa.special` check moves to a breed that is still `'fearless'` (`black`); the hard-coded family-pet name loops in `straycats.test.js` and `interactions.test.js` read `Object.values(CATALOG.cats).map((c) => c.name)` instead; `net.test.js` / `remotecats.test.js` / `samples.test.js` use `'robbie'` / `'Robbie'` where they used Rosa as a sample.
- [ ] **Step 3:** Add a test in `test/remotecats.test.js`: a remote profile with `breed: 'rosa'` normalizes to `'tabby'` (and builds without throwing).
- [ ] **Step 4:** `grep -rni rosa src test` returns only the Task 1 retirement code and its tests. Full suite PASS. Commit `chore(cats): remove Rosa from the model, voices, replies and shop`.

### Task 4: Coat flags in the cat model, and Robbie's real coat

**Files:**
- Modify: `src/cat/model.js` (STYLE comment block, `buildCat`)
- Test: `test/catmodel.test.js`

**Interfaces:**
- Produces these optional `STYLE` flags (Task 5 uses them):
  - `whiteLegs: true` — limb cylinders use `s.belly`, not `pointColor`.
  - `socks: true` — paws are white `0xf5f5f5` regardless of `belly`.
  - `band: true` — a `s.belly` band across the shoulders (`onBody`, `at: [0, 0.58, -0.30]`, `halfX ≈ 1.45`, `halfZ ≈ 0.14`); when `band` and `stripes` are both set, the front-most stripe is skipped so the two never overlap (overlap z-fights).
  - `headStripes: true` — three thin `s.accent` forehead stripes on the skull (the tabby "M"), `onSkull`.
  - `chin: true` — a small white patch under the muzzle (`addMarking` on the muzzle, its own radius and scale).
  - `ears: number` — ear cone scale (default 1).
  - `legLen: number` — leg length factor (default 1), see Step 3.
  - `tagCollar: true` — a built-in black collar with a round silver tag, drawn only when `accessories.collar` is null (never two collars).

- [ ] **Step 1: Failing tests:**
  - `STYLE` is private, so the new flags are tested in Task 5 through `d2` and `digit`. Here, test Robbie: `buildCat('robbie')`'s body mesh colour is dark (luminance < 0.2), its limbs and paws are white (luminance > 0.8), and the body carries white markings.
- [ ] **Step 2:** Run, FAIL.
- [ ] **Step 3: Implement the flags.** `legLen` algorithm, applied after all parts and accessories are added and before `g.scale.setScalar(s.scale)`:
  ```
  Δ = 0.26 * (legLen - 1)
  each leg: leg.position.y += Δ; limb geometry rebuilt at height 0.26*legLen, limb.position.y = -0.13*legLen; paw.position.y -= Δ
  every other direct child of g (body, belly, head, ruff, tail, body-slot accessories): position.y += Δ
  g.userData.base = { ...base, bodyY: 0.34 + Δ, headPos: [0, 0.56 + Δ, -0.44] }
  ```
  (The animator positions body and head only from `userData.base`, so it keeps working.)
- [ ] **Step 4: Robbie's real coat** (photo `fe9ee490-image.jpg`): mostly black on top. `robbie: { base: 0x1a1a1e, belly: 0xf5f5f5, accent: 0xf5f5f5, scale: 1.05, cow: true, whiteLegs: true }`, and rewrite the `cow` markings for that coat: two large white flank patches low on each side of the body (one merged mesh) and a narrow white blaze up the forehead between the eyes (skull), replacing the old black splashes. Black cap and ears come from `base`; muzzle, chest and paws from `belly`. Eye colour from the photo: yellow-green (`0xb8b040`).
- [ ] **Step 5:** Full suite PASS (raise Robbie's `CEILING` only if needed and by the exact count). Commit `fix(cats): Robbie is a black cat with white socks and flanks, not the reverse`.

### Task 5: Add D2 and Digit, and rename the family-pet rule's label

**Files:**
- Modify: `src/progression.js` (`CATALOG.cats`), `src/cat/model.js` (`STYLE`, `EYE_COLORS`), `src/cat/brain.js`, `src/catvoice.js`, `src/catreplies.js`, `src/ui/homebase.js` (`CAT_BLURBS`), `src/samples.js:2` comment, `src/straycats.js:134-170`, `src/enemies.js:301`, `src/progression.js:~1217`, `src/game/interactions.js:886,975,1153`, `src/straynames.js:15`, `src/nametag.js:10,106` (only where they mean the strays-only rule)
- Test: `test/catmodel.test.js`, `test/catvoice.test.js`, `test/straycats.test.js`, `test/interactions.test.js`

**Interfaces:**
- Consumes: the Task 4 flags.
- Produces: catalog ids `d2` (`name: 'D2'`) and `digit` (`name: 'Digit'`), price 40 each, after `robbie`, before `hagrid`.

- [ ] **Step 1: Failing tests:** add `d2`, `digit` to `BREEDS` and `CEILING` in `catmodel.test.js` and to `catvoice.test.js`'s list. New tests: `digit` is smaller than `d2` (bounding-box length); `digit`'s legs are longer relative to its body than `tabby`'s (paw-to-belly height over body length); `digit` in every pose, dressed (`sweater`, `cape`, `backpack`) and bare, still rests at ground level (reuse the existing ground test shape); `digit` with `{ collar: 'bell' }` has exactly one collar. In `straycats.test.js`'s strays-only describe: `avatarNames` contains `'D2'` and `'Digit'`, and `isGrudgeableStray` refuses both when forced into the stray array.
- [ ] **Step 2:** Run, FAIL.
- [ ] **Step 3: Rows** (colours tuned in the browser in Task 6; start here):
  - `d2`: `{ base: 0x5a4a3a, belly: 0xf5f5f2, accent: 0x2e261e, scale: 1.15, stripes: true, headStripes: true, whiteLegs: true, band: true, fluffy: true }`, eyes green-gold `0xa8b040`. Large tabby-and-white: tabby cap, white muzzle/chest/belly/legs, white shoulder band, dark tabby back and tail.
  - `digit`: `{ base: 0x7a6248, belly: 0xc8b090, accent: 0x2a2018, scale: 0.82, stripes: true, headStripes: true, socks: true, chin: true, ears: 1.25, legLen: 1.2, tagCollar: true }`, eyes `0xa0a048`. Young, slender, big-eared, bold stripes, four white socks, small white chin, black collar with a round tag.
  - `PERSONALITIES`: `d2` big and calm (`speed: 1.9, pull: 3, special: 'steady'`, weights like `mainecoon`); `digit` young and quick (`speed: 2.7, pull: 8, special: 'chaser'`, weights like `siamese`).
  - `VOICES`: `d2: { pitch: 0.78, rate: 0.85, gain: 1.05 }`, `digit: { pitch: 1.3, rate: 1.3, gain: 0.9 }`.
  - `catreplies.js`: a `d2` set (gentle giant, unhurried, warm) and a `digit` set (excited kitten, everything is new), same six keys and counts as `robbie`.
  - `CAT_BLURBS`: `d2: 'Gentle giant — big, fluffy, never in a hurry'`, `digit: 'Kitten — all legs and ears, chases everything'`.
- [ ] **Step 4: Rename the label.** The v20 spec decision "D2" (strays only, never family pets or ghosts) now collides with the cat D2. In code comments and test describe names, call it "the strays-only rule"; keep ONE pointer `(v20 spec decision D2)` at the main block in `straycats.js` so the spec stays findable. Update that block's family-pet list (Zeetoo, Robbie, D2, Digit, Hagrid) and replace its stale `progression.js:178-181` line reference with "`CATALOG.cats` in progression.js". Do not touch D1/D3/D5 labels. Do not touch historical docs.
- [ ] **Step 5:** Full suite PASS. Commit `feat(cats): D2 and Digit join the family cats`.

### Task 6: Eye-check in the browser (controller, not a subagent)

- [ ] Start `whisker-walk-dev` (`.claude/launch.json`, port 5174). Seed a save via `localStorage` with lots of points; buy and equip D2, Digit and Robbie; look at each in the shop thumbnail and on a walk (close-up and chase camera), and compare against the photos. Tune colours/patch sizes in `STYLE` and re-run the suite.
- [ ] Rosa refund: write a v4 save that owns and equips `rosa` with known points, reload, confirm +40, Tabby equipped, the notice card shows once with the line, and a second reload shows nothing and keeps the points.
- [ ] Commit any tuning `fix(cats): tune family-cat coats against the photos`.
