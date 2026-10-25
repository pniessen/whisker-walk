# Redeem Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Type a code in the home base, receive points / accessories / cats, once per save.

**Architecture:** A new pure module `src/redeem.js` (normalise, hash, redeemer with rate limit, HTML renderer), a data file `src/redeemcodes.js` of PBKDF2 hashes, one small `redeemCode` method + `redeemed` save field in `src/progression.js`, a few wiring lines in `src/ui/homebase.js`, and a Node script `scripts/make-code.mjs`.

**Tech Stack:** Vanilla ES modules, Vite, Vitest, Web Crypto (`globalThis.crypto.subtle`, present in browsers on https/localhost and in Node ≥ 20; this machine has Node 26).

**Spec:** `docs/superpowers/specs/2026-10-25-whisker-walk-redeem-codes-design.md` — read it first; this plan does not repeat its copy or rationale.

## Global Constraints

- Work only on branch `worktree-v21-redeem-codes`. Never commit to main, never push, never merge.
- SAVE_VERSION stays 4. `redeemed` is additive and sanitised.
- No plain-text code in any committed file, commit message, or test. Tests use their own throwaway codes and their own tables, hashed at test time.
- Everything a code gives must be an id already in `CATALOG.cats` / `CATALOG.accessories`.
- Kid-friendly copy, exactly as the spec's UI section words it.
- Keep `progression.js` and `homebase.js` edits small and self-contained (other sessions edit those files in parallel).
- Tests: `npx vitest run --exclude '.claude/**'`. Test files live in `test/`.
- Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## Review Focus

1. Double-tap / Enter+click while hashing → pays once (redeemer pending promise + synchronous `redeemCode` check).
2. A hostile cloud save with `redeemed: "x"`, `[1, '__proto__', 'ZZ…']`, or 10,000 entries → sanitised to valid unique hex, capped at 500, never throws.
3. A table entry naming an id later removed from CATALOG → skipped at redeem time, the rest of the bundle still pays; if nothing is left to give, the code still counts as used and the message says so kindly (pays 0, never crashes).
4. `crypto.subtle` missing (http on a LAN IP) → the box shows a kind "codes don't work here" line instead of throwing.
5. The rest key in localStorage is junk / future-dated by years → treated as not resting (rest-until more than 5 min ahead is ignored).

---

### Task 1: Normalise and hash

**Files:**
- Create: `src/redeem.js`
- Test: `test/redeem.test.js`

**Interfaces:**
- Produces: `normalizeCode(input: any) → string`; `hashCode(normalized: string, subtle = globalThis.crypto?.subtle) → Promise<string>` (64 lowercase hex); constants `REDEEM_SALT = 'whisker-walk-redeem-v1'`, `REDEEM_ITERATIONS = 100000`.

- [ ] **Step 1: Failing tests** — `normalizeCode`: `'tuna-moon 7k3q' → 'TUNAM00N7K3Q'`; `'  T.u_n-a  '` → `'TUNA'`; `'il1IL' → '11111'`; `'oO0' → '000'`; `'🐾cat🐾' → 'CAT'`; `null`/`42`/`{}` → `''`. `hashCode`: returns `/^[0-9a-f]{64}$/`; same input twice → same output; `hashCode('A') !== hashCode('B')`; pin one vector computed independently in the test with `node:crypto`'s `pbkdf2Sync(normalized, REDEEM_SALT, 100000, 32, 'sha256').toString('hex')`; `hashCode('X', undefined)` rejects with an Error whose message contains `'crypto'`.
- [ ] **Step 2:** Run `npx vitest run test/redeem.test.js` → FAIL (module missing).
- [ ] **Step 3:** Implement in `src/redeem.js`. Normalise order: `String` only if typeof string (else `''`) → `toUpperCase()` → strip `/[^A-Z0-9]/g` → `O→0`, `I→1`, `L→1`. Hash: `importKey('raw', utf8, 'PBKDF2')` → `deriveBits({ name:'PBKDF2', hash:'SHA-256', salt: utf8(REDEEM_SALT), iterations }, key, 256)` → hex. Module stays DOM-free and import-free except what Task 3 adds.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(redeem): normalise and hash redeem codes`.

### Task 2: Save field and `redeemCode`

**Files:**
- Modify: `src/progression.js` (defaultState: one field; sanitizeState: one line; api: one method; one small `sanitizeRedeemed` helper)
- Test: `test/progression.redeem.test.js`

**Interfaces:**
- Produces: `state.redeemed: string[]`; `progression.redeemCode(hash: string, reward: { points?: number, accessories?: string[], cats?: string[] }) → { ok: true, items: Item[], points: number } | { ok: false, reason: 'used' | 'bad-hash' }` where `Item = { kind: 'cats'|'accessories', id, name, owned: boolean, refund: number }` and `points` is the total added to `state.points` (gift points + refunds). Exported constant `REDEEMED_MAX = 500`.

- [ ] **Step 1: Failing tests** (use the existing in-memory storage pattern from `test/progression.test.js`):
  - fresh save has `redeemed: []`.
  - `redeemCode(H, { points: 50, accessories: ['wizard'], cats: ['hagrid'] })` → ok; `points` +50; `lifetimePoints` unchanged; `wizard` and `hagrid` unlocked; not equipped; `redeemed` contains H.
  - same call again → `{ ok:false, reason:'used' }`, points unchanged.
  - owned item: `bell` (starter) and `tabby` → not duplicated in `unlocked`, refund = CATALOG price (`bell` 20, `tabby` 0), `owned: true`.
  - unknown ids `'nope'` skipped, rest paid; reward with only unknown ids → still ok with `items: []`, `points: 0`, hash marked.
  - negative / NaN / string points → 0 points added.
  - `redeemCode('not-hex', …)` → `{ ok:false, reason:'bad-hash' }`.
  - persistence: after redeem, a new `createProgression(sameStorage)` still sees H as used; `replaceFromPayload(oldSaveWithoutH)` makes H usable again on that save (documents the once-per-save rule).
  - sanitizer: payload `redeemed` of `'x'`, `[1, '__proto__', 'A'.repeat(64), H, H]` → `[H]`; 600 valid unique hashes → length 500 (keep the LAST 500, newest).
  - `version` stays 4.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Validate hash `/^[0-9a-f]{64}$/`. Points via `asFiniteNonNegInt`. All mutations then exactly one `save()`. Add `redeemed: []` to defaultState with a short "Additive, so SAVE_VERSION stays 4" comment, matching neighbours. When over the cap on write, drop the oldest.
- [ ] **Step 4:** Run this file and `test/progression*.test.js` → PASS.
- [ ] **Step 5:** Commit `feat(progression): redeemed codes field and redeemCode`.

### Task 3: Code table and redeemer (with rate limit)

**Files:**
- Create: `src/redeemcodes.js` (exports `REDEEM_CODES = {}` with the format comment from the spec; Task 4 adds the starter entry)
- Modify: `src/redeem.js`
- Test: `test/redeem.test.js`, `test/redeemcodes.test.js`

**Interfaces:**
- Consumes: Task 1 `normalizeCode`, `hashCode`; Task 2 `redeemCode`.
- Produces: `createRedeemer({ progression, codes = REDEEM_CODES, hash = hashCode, now = Date.now, storage = globalThis.localStorage }) → { redeem(input) → Promise<Result>, cooldownLeft() → seconds:int, busy() → boolean }`.
  `Result = { kind: 'gift', items, points } | { kind: 'used' } | { kind: 'unknown' } | { kind: 'empty' } | { kind: 'resting', seconds } | { kind: 'unsupported' }`.
  Constants: `REST_KEY = 'whisker-walk-redeem-rest'`, `FREE_MISSES = 3`, `FIRST_REST_MS = 30000`, `MAX_REST_MS = 300000`, `FORGIVE_MS = 600000`.

- [ ] **Step 1: Failing tests** (fake `now`, fake storage map, a test table built by hashing throwaway codes, a small fake progression or the real one on memory storage):
  - empty → `empty`; no miss counted.
  - unknown → `unknown`; 3rd miss → `unknown` and then `cooldownLeft() === 30`; next call → `resting` with seconds 30, hash NOT called.
  - after 30 s, one more miss → rest 60; then 120, 240, 300, 300 (cap).
  - a hit clears the miss count; 10 min with no miss clears it.
  - a correct code typed while resting still → `resting` (gentle, but consistent).
  - hit → `gift` with items/points from `redeemCode`; same again → `used` (a `used` result is not a miss).
  - two concurrent `redeem(code)` calls → points paid once, both resolve (second may be `used` or the same `gift` object).
  - storage junk (`'{'`, `'{"until":"x"}'`, until = now + 1 year) → not resting; `storage` getter that throws → still works.
  - `hash` rejecting → `unsupported`, not counted as a miss.
  - `redeemcodes.test.js` table guard on the REAL `REDEEM_CODES`: every key `/^[0-9a-f]{64}$/`; every entry gives something (points > 0 or a non-empty list); every id in CATALOG; `label` is a string ≤ 60 chars; no `label`, when normalised and hashed, matches a key in the table (catches a code pasted into the label).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Rest state `{ misses, until, last }` JSON in `REST_KEY`; every read/write in try/catch; ignore `until > now + MAX_REST_MS`. Rest length on the Nth miss past `FREE_MISSES - 1` = `min(MAX_REST_MS, FIRST_REST_MS * 2^(N - FREE_MISSES))`. In-flight: keep one pending promise; `redeem` while pending returns it.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(redeem): code table, redeemer and gentle rate limit`.

### Task 4: `make-code` script and the starter code

**Files:**
- Create: `scripts/make-code.mjs`
- Modify: `src/redeemcodes.js` (one starter entry)
- Test: `test/makecode.test.js`

**Interfaces:**
- Consumes: Task 1 `normalizeCode`, `hashCode`; `CATALOG` from `src/progression.js`.
- Produces: exported pure helpers in the script for testing: `parseArgs(argv: string[]) → { code?, points, accessories, cats, label }`, `inventCode(rng = Math.random) → string` (`WORD-WORD-XXXX`), `validateReward(reward) → string[]` (error messages, empty = ok), `entryLine(hash, reward) → string`. Running the file as main prints the output block from the spec and exits 1 with a friendly error on invalid input. Guard main with `import.meta.url === pathToFileURL(process.argv[1]).href`.

- [ ] **Step 1: Failing tests:** `parseArgs(['--points','50','--acc','wizard','--acc','crown','--cat','hagrid','--label','Hi'])` → `{ points:50, accessories:['wizard','crown'], cats:['hagrid'], label:'Hi' }`; `inventCode` matches `/^[A-Z]+-[A-Z]+-[A-HJKMNP-Z2-9]{4}$/` and its alphabet excludes O 0 I 1 L; `validateReward` flags unknown ids by name, an empty reward, a `--code` shorter than 8 normalised chars (warning text includes `'short'`); `entryLine` output, evaluated as a JS object literal, round-trips to the same reward and its key equals `await hashCode(normalizeCode(code))`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Word list of exactly 128 unique short (3–7 letter) cat-flavoured words; add a test that the list has 128 unique entries, (no look-alike issue matters for words, since both sides normalise). Use `crypto.getRandomValues` for the default rng.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Run the script once: `node scripts/make-code.mjs --points 25 --acc beanie --label "Welcome gift"`. Paste ONLY the printed entry line into `src/redeemcodes.js`. Report the plain code back to the controller in your final message — do not write it to any file. Re-run the table-guard test → PASS.
- [ ] **Step 6:** Commit `feat(redeem): make-code script and a starter code` (message must not contain the code).

### Task 5: The code box in the home base

**Files:**
- Modify: `src/redeem.js` (add `renderRedeemHtml`)
- Modify: `src/ui/homebase.js` (Cats panel: one `${...}` after `renderDenSection()`; one submit handler; module variables `redeemText`, `redeemMsg`, `redeemBusy`; create one redeemer)
- Modify: `src/style.css` (a few `.redeem-*` rules, reusing existing tokens/classes)
- Test: `test/redeem.test.js`

**Interfaces:**
- Consumes: Task 3 `createRedeemer`, `Result`.
- Produces: `renderRedeemHtml({ text: string, busy: boolean, result: Result | null, catalog }) → string` and `redeemMessage(result, catalog) → string` (plain text, exact spec copy).

- [ ] **Step 1: Failing tests:** `redeemMessage` for each kind uses the spec's exact copy; gift with points 50 + wizard → `'🎉 Surprise! You got 50 🐾 and the Wizard Hat!'`; gift with two items and an owned one reads naturally (`…, the Crown and 25 🐾 for the Top Hat you already had!`); gift with nothing → `'🎉 You opened it! There was nothing new inside this time — but thanks for trying it! 💛'`; `resting` uses the seconds number (`'…Try again in 45 seconds. 😴'`, and `1 second` singular); `unsupported` → `'Codes can’t be opened on this page. Ask a grown-up to open the game the usual way. 🐾'`. `renderRedeemHtml`: contains a `<form class="redeem-form">` with input `id="redeem-input"` having `autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40"`, a submit button `Open it!` (disabled + `Opening…` when busy), the escaped `text` as the value (test with `"><script>`), and the message in an `aria-live="polite"` element.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement renderer. In `homebase.js`: submit handler (delegated, `e.preventDefault()`), keep `redeemText` updated in the existing `input` listener for `#redeem-input`, set busy → `render()` → await `redeem` → set result, clear text on `gift`/`used` → `render()`. After a gift, the existing `render()` shows new points and cards, and call `sync?.autoSync?.()` exactly as the `buy` handler does. Restore focus to `#redeem-input` after render.
- [ ] **Step 4:** Run the full suite `npx vitest run --exclude '.claude/**'` → all PASS.
- [ ] **Step 5:** Commit `feat(home): a secret-code box on the Cats tab`.
