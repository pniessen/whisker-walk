# Whisker Walk — Redeem codes (v21 §10.4)

Date: 2026-10-25 · Branch: `worktree-v21-redeem-codes`

## Intent

Type a code, receive a thing. The owner hands codes to the two players (11 and
9) as small surprises. Build the mechanism; the owner decides how often to use
it. A code should feel like a present, never like a test you can fail.

## Decisions (owner, 2026-10-25)

1. **What a code gives:** a bundle of one or more of **points**, **accessories**
   and **cats**, by CATALOG id. No areas (they are earned by walking) and no den
   furniture. If the save already owns an item, it pays that item's CATALOG
   price in points instead, so a code is never wasted.
2. **Where codes live:** a hashed list shipped in the client
   (`src/redeemcodes.js`). Adding codes = edit that file + redeploy. No server,
   no SQL, no schema.
3. **Uses:** once per save. Each girl can redeem a given code once on her own
   save. (A code meant for one girl only is just a code given to one girl.)
4. **Making a code:** `node scripts/make-code.mjs` invents a friendly code,
   checks the rewards exist in CATALOG, and prints the code plus the one line to
   paste into `src/redeemcodes.js`. It never writes files.

## Goals

- Codes are case-insensitive and forgiving about spaces, dashes and look-alike
  characters.
- Wrong code → kind, non-scolding message.
- Gentle rate limit on guessing.
- Idempotent: a used code can never pay twice, including across reload or sync.
- No plain-text code anywhere in the shipped bundle or the repo.
- Everything a code gives already exists in CATALOG; nothing new renders.

## Non-goals

- Codes shared "once ever" across both players (would need a server).
- Expiry dates, server-side code management, analytics.
- Areas, den furniture, skills, or anything outside CATALOG cats/accessories.

## Anti-goals

- Copy that scolds, counts failures at the child, or sounds like a password
  prompt.
- A way to farm points (codes are once per save).
- Touching SAVE_VERSION (stays 4).

## Design

### Normalising a typed code (`src/redeem.js`, pure)

`normalizeCode(input)`: uppercase; drop every character that is not A–Z or
0–9 (spaces, dashes, dots, underscores, emoji); then fold look-alikes:
`O→0`, `I→1`, `L→1`. Empty after normalising = "type something first".
The script applies the exact same function, so folding cannot break a match.

### Hashing

`hashCode(normalized)` = PBKDF2-SHA256, 100,000 iterations, fixed salt
`whisker-walk-redeem-v1`, 32-byte output as lowercase hex. Browser: Web Crypto
(`crypto.subtle`). Script and tests: Node's `crypto.webcrypto.subtle`, the same
call, so one implementation serves both. The slow hash is the point: it turns
"read the bundle and try every code" from seconds into years for a 35-bit code.

### Codes

Generated as `WORD-WORD-XXXX`: two words from a 128-word cat-themed list in the
script (e.g. TUNA, MOON, WHISKER) plus four characters from an alphabet with no
look-alikes (no O, 0, I, 1, L). About 34 bits: impossible to guess by typing,
and slow to brute-force from the bundle (a GPU would still need days, which is
fine for this audience). The owner may instead pass
their own code with `--code`; the script warns if it is shorter than 8
characters after normalising.

### The code table (`src/redeemcodes.js`)

```js
export const REDEEM_CODES = {
  // label is the owner's private note; it ships, so never put the code in it.
  '<64 hex>': { label: 'Halloween 2026', points: 50, accessories: ['wizard'], cats: [] },
};
```

Shipped with **one** starter code (the builder makes it with the script and
reports the plain code to the owner in chat only, never in a file or commit).

### Redeem flow (`src/redeem.js`)

`createRedeemer({ progression, codes, hash, now, storage })` →
`{ redeem(input) → Promise<Result>, cooldownLeft() }`.

1. If cooling down → `{ kind: 'resting', seconds }`.
2. Normalise; empty → `{ kind: 'empty' }`.
3. Hash, look up in `codes`. Miss → count a miss → `{ kind: 'unknown' }`.
4. Hit → `progression.redeemCode(hash, reward)` → `{ kind: 'gift', items }` or
   `{ kind: 'used' }`.

A pending flag makes a second `redeem` while one is in flight return the same
promise, so double-tapping cannot race.

### The one progression hook (`src/progression.js`, small)

- New save field `redeemed: []` — hashes of codes this save has used.
  Sanitised: strings matching `/^[0-9a-f]{64}$/`, de-duplicated, capped at 500.
  Additive; SAVE_VERSION stays 4.
- New method `redeemCode(hash, reward)`. Synchronous: if `hash` is in
  `state.redeemed` → `{ ok: false, reason: 'used' }`. Otherwise, in one
  mutation: push the hash, add points, unlock each unowned cat/accessory (unknown
  ids skipped), convert owned ones to their price in points, then one `save()`.
  Returns `{ ok: true, items: [...] }` describing what was given.
- Code points go to `points` only, **not** `lifetimePoints` (rank is earned by
  walking), the same rule as Rosa's refund. *(Builder's call — see below.)*
- Unlocked cats/accessories are not equipped automatically.

**Why this is idempotent across reload and sync:** the marker and the reward
are written in the same synchronous mutation and the same `save()`. Cloud
"Load from cloud" replaces the whole save, so any save either has both the
reward and the marker or neither. Loading an older cloud save that predates the
redeem lets the code be used again on that save — but that save also lacks the
reward, so it still pays exactly once per save.

### Rate limit (gentle)

Three misses in a row → a 30-second rest; each further miss during the next
rest doubles it, capped at 5 minutes. A hit, or 10 minutes without a miss,
resets it. The count and rest-until time live in their own localStorage key
(`whisker-walk-redeem-rest`), not in the save, so they never sync. Hostile or
missing values read as "not resting".

### UI

A small section at the bottom of the **Cats** tab (the default tab, so it's
easy to find), built by a pure `renderRedeemHtml(view)` in `src/redeem.js`
(DOM-free, unit-tested) and wired in `homebase.js` with a few lines: one
`${...}` in the Cats panel, and one click/submit handler.

- Heading: **🎁 Got a secret code?**
- A text input (`autocomplete="off"`, `autocapitalize="characters"`,
  `spellcheck="false"`, max length 40) and an **Open it!** button. Enter submits.
- While hashing: button reads **Opening…** and is disabled.
- The typed text is kept across `render()` rebuilds (module variable).
- Messages (draft copy, owner signs off):
  - gift: **🎉 Surprise! You got 50 🐾 and the Wizard Hat!** (names from CATALOG;
    an owned item reads "…and 25 🐾 for the Top Hat you already had")
  - used: **You already opened this one — it's safe in your collection. 💛**
  - unknown: **Hmm, that code isn't one we know. Check the letters and try
    again! 🐾**
  - empty: **Type your code in the box first. 😺**
  - resting: **The code box is taking a little catnap. Try again in 30
    seconds. 😴**
- After a gift, re-render so points and new cards show at once, and call
  `sync.autoSync()` (as `buy()` does) so the present reaches the cloud.
- No `crypto.subtle` (plain-HTTP page on a LAN address) → result
  `unsupported`: **Codes can’t be opened on this page. Ask a grown-up to open
  the game the usual way. 🐾**
- A code whose items are all gone from CATALOG still counts as used: **🎉 You
  opened it! There was nothing new inside this time — but thanks for trying
  it! 💛**
- Every interpolated value is escaped.

### The script (`scripts/make-code.mjs`)

```
node scripts/make-code.mjs --points 50 --acc wizard --acc crown --cat hagrid --label "Halloween"
node scripts/make-code.mjs --code "pumpkin pie 2026" --points 20
```

Validates every id against CATALOG (imports `src/progression.js`), refuses an
empty reward, and prints:

```
Code for the girls:   TUNA-MOON-7K3Q
Paste into src/redeemcodes.js:
  '9f2c…': { label: 'Halloween', points: 50, accessories: ['wizard'], cats: [] },
```

## Tests (vitest)

- normalise: case, spaces, dashes, look-alikes, junk, emoji, empty.
- hash: stable known vector; same in script path and module.
- redeemCode: pays once; second call `used`; owned item → price in points;
  unknown id skipped; lifetimePoints unchanged; marker survives save/reload and
  `replaceFromPayload`; sanitizer drops junk `redeemed` entries.
- redeemer: unknown/empty/used/gift; rate limit escalation, cap, reset;
  hostile rest key; concurrent double-call pays once.
- table guard: every `REDEEM_CODES` key is 64 hex, every id is in CATALOG, every
  entry gives something; no `label` normalises to a code in the table.
- render: escaping, each message kind, disabled state.

## Left to the builder

- Word list, exact layout CSS (reuse existing `.card`/`.tag` classes).
- File-level structure inside `src/redeem.js`.

## Builder's calls, for the owner to check

- Code points don't raise rank (`lifetimePoints`).
- The box lives at the bottom of the Cats tab.
- Look-alike folding (O/0, I/1/L).
- One starter code ships; you get the plain code in chat.
- Rate limit numbers: 3 misses → 30 s, doubling to 5 min.
- Code-given accessories are ordinary items: they can be traded in the colony
  like anything bought. (Protecting them would touch colony.js and the
  wardrobe push, which another stream owns.) Side effect: if a sister trades
  an item over before the code is redeemed, the code pays its price in points.
