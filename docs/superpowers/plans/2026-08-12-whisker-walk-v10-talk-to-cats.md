# Whisker Walk v10 "Talk to the Cats" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players message nearby AI cats with curated phrases and get canned in-character replies; make chat usable on desktop via keyboard (works under pointer lock); enable chat input in solo walks.

**Architecture:** A new pure `src/catreplies.js` maps `(personality, phrase-intent) → line`. `src/main.js` gains a shared `sendPhrase(phraseId)` that shows the local bubble, broadcasts to players in co-walks (v8), targets the nearest AI cat via the existing `strayCats.nearest`, and shows a reply bubble; a greeting routes through the existing stray-greet path (per-walk "greeted" flag caps it). Keyboard controls (number row sends, Enter opens the tray, Esc closes) reuse the v8 chat wheel/bubbles. All local — no free text either direction, no backend.

**Tech Stack:** Vanilla ES modules, Three.js, Vitest. No new deps. No backend/SQL changes. Built on `feature/talk-to-cats` (carries the logo commits) — branding + feature deploy together once.

## Global Constraints

- **No free text either direction.** Player sends a catalog phrase id (v8 `chat.js`); the cat replies from a written pool. No user- or model-generated text anywhere. No XSS/moderation surface, works offline.
- **Reuse, don't reinvent:** `chat.js` (`PHRASES`, `phraseById`), `chatbubble.js` (`createChatBubbles`), `chatwheel.js`, `strayCats.nearest(pos, range, opts)`, and the existing stray-greet award path in `handleInteract` (the `kind: 'stray'` boop). Do not fork these.
- **Friendship cap:** a greeting counts **one** greet toward a cat only if it is still `ungreetedOnly` this walk (the flag booping already sets) — talking can never out-farm booping. Non-greeting intents never touch friendship.
- **Keyboard keys must not collide** with existing in-walk bindings: `E` interact, `V` meow, `M` mute, `T` yarn, `C` camera, `Space` pounce (`src/main.js:846-879`). Use the **number row** (`Digit1`–`Digit0`) to send and **`Enter`** to open the tray. Ignore these when a text field is focused (`document.activeElement` is INPUT/TEXTAREA) so home-base typing is unaffected.
- **Pointer lock:** opening the tray calls `document.exitPointerLock()`; closing does NOT force re-lock (browsers require a user gesture) — it falls back to the game's existing click-to-look flow. Number-key sending never touches lock.
- Tests + `npx vite build` green every commit. **Baseline: 203 tests.**

---

### Task 1: `src/catreplies.js` — pure reply engine

**Files:** create `src/catreplies.js`; test `test/catreplies.test.js`.

**Interfaces (consumed by `main.js` in Task 2):**
- `intentFor(phraseId) -> 'greeting'|'play'|'compliment'|'farewell'|'emote'|'misc'`
- `countsAsGreet(phraseId) -> boolean` (true iff intent is `'greeting'`)
- `replyFor(personality, phraseId, seed) -> string` (seeded pick; deterministic for a fixed `(personality, phraseId, seed)`, varied across them; falls back to a generic pool for an unknown personality)
- `PERSONALITY_KEYS: string[]` (the breeds that have voices)

**Exact intent buckets** (covers every `chat.js` PHRASES id):
- greeting: `hi`, `follow`, `here`, `boop`
- play: `play`, `zoomies`
- compliment: `nice_cat`, `good_walk`
- farewell: `brb`, `bye`
- emote: `love`, `happy_cat`, `paw`, `sparkle`, `fish`, `laugh`
- (anything unknown → `misc`)

- [ ] **Step 1: Write the failing test** — `test/catreplies.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { intentFor, countsAsGreet, replyFor, PERSONALITY_KEYS } from '../src/catreplies.js';
import { PHRASES } from '../src/chat.js';

describe('intentFor', () => {
  it('buckets every catalog phrase into a known intent', () => {
    const known = new Set(['greeting', 'play', 'compliment', 'farewell', 'emote', 'misc']);
    for (const p of PHRASES) expect(known.has(intentFor(p.id))).toBe(true);
    expect(intentFor('hi')).toBe('greeting');
    expect(intentFor('zoomies')).toBe('play');
    expect(intentFor('nice_cat')).toBe('compliment');
    expect(intentFor('bye')).toBe('farewell');
    expect(intentFor('love')).toBe('emote');
    expect(intentFor('totally-unknown')).toBe('misc');
  });
});

describe('countsAsGreet', () => {
  it('is true only for greeting-intent phrases', () => {
    expect(countsAsGreet('hi')).toBe(true);
    expect(countsAsGreet('boop')).toBe(true);
    expect(countsAsGreet('zoomies')).toBe(false);
    expect(countsAsGreet('bye')).toBe(false);
    expect(countsAsGreet('love')).toBe(false);
  });
});

describe('replyFor', () => {
  it('returns a non-empty line for every personality and every non-emote phrase', () => {
    const sample = ['hi', 'play', 'nice_cat', 'bye'];
    for (const k of PERSONALITY_KEYS) {
      for (const id of sample) {
        const line = replyFor(k, id, 7);
        expect(typeof line).toBe('string');
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });
  it('is deterministic for a fixed (personality, phrase, seed) and varies across seeds/cats', () => {
    expect(replyFor('tabby', 'hi', 3)).toBe(replyFor('tabby', 'hi', 3));
    const across = new Set([replyFor('tabby', 'hi', 1), replyFor('tabby', 'hi', 2), replyFor('tabby', 'hi', 5), replyFor('tabby', 'hi', 9)]);
    expect(across.size).toBeGreaterThan(1); // not always the same line
  });
  it('gives Hagrid cluck-flavored replies', () => {
    const line = replyFor('hagrid', 'hi', 4).toLowerCase();
    expect(/bwak|cluck|bok|🐔/.test(line)).toBe(true);
  });
  it('falls back to a generic pool for an unknown personality', () => {
    const line = replyFor('nonexistent-breed', 'hi', 1);
    expect(typeof line).toBe('string');
    expect(line.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run test/catreplies.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement `src/catreplies.js`.** Structure (fill ALL personalities — the completeness test enforces it):

```js
// Canned, in-character cat replies. No LLM, no free text — a written pool per
// (personality, phrase-intent). Keeps messaging offline/safe like v8 chat.
const INTENT = {
  hi: 'greeting', follow: 'greeting', here: 'greeting', boop: 'greeting',
  play: 'play', zoomies: 'play',
  nice_cat: 'compliment', good_walk: 'compliment',
  brb: 'farewell', bye: 'farewell',
  love: 'emote', happy_cat: 'emote', paw: 'emote', sparkle: 'emote', fish: 'emote', laugh: 'emote',
};
export function intentFor(phraseId) { return INTENT[phraseId] || 'misc'; }
export function countsAsGreet(phraseId) { return intentFor(phraseId) === 'greeting'; }

// One pool per personality per intent. Every personality needs greeting/play/
// compliment/farewell/emote/misc (emote/misc may be short reaction lines).
// Style reference (WRITE ALL 10 personalities in this shape — tabby/persian/
// hagrid shown; add siamese, black, calico, mainecoon, zeetoo, rosa, robbie):
const REPLIES = {
  tabby:   { greeting: ['Oh! Hello there 🐾', 'Sniff sniff — hi!'], play: ['Ooh, what did you find?', 'Adventure? Yes!'], compliment: ['You have a good nose too!', 'Aw, shucks 😽'], farewell: ['Off exploring? Bye!', 'Leave a scent trail!'], emote: ['🐾'], misc: ['Curious…'] },
  persian: { greeting: ['*yawn* …hi.', 'Mm. Hello.'], play: ['…maybe after a nap.', 'Five more minutes 😴'], compliment: ['I know. Thank you.', 'Naturally.'], farewell: ['Bye… zzz.', 'Wake me never.'], emote: ['😴'], misc: ['…'] },
  hagrid:  { greeting: ['Bwak?! 🐔', 'Bok bok!'], play: ['BWAK BWAK BWAK!', 'Flap flap!'], compliment: ['Bok? Bwak 😳', 'Cluck ♥'], farewell: ['Bwaaak~', 'Bok. (bye)'], emote: ['🐔'], misc: ['Bwak.'] },
  // siamese, black, calico, mainecoon, zeetoo, rosa, robbie: same shape, in-voice.
};
const GENERIC = { greeting: ['Hi!', 'Mrrp?'], play: ['Play!', 'Pounce!'], compliment: ['Purr 😽', 'Thanks!'], farewell: ['Bye!', 'Later!'], emote: ['🐾'], misc: ['Mrrp.'] };

export const PERSONALITY_KEYS = Object.keys(REPLIES);

// Deterministic index from a small string+number hash (no Math.random — keeps
// a cat's reply stable within an interaction; varies across cats/seeds).
function pick(pool, seed, phraseId) {
  if (!pool || pool.length === 0) return '';
  let h = seed >>> 0;
  for (const ch of String(phraseId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}
export function replyFor(personality, phraseId, seed = 0) {
  const table = REPLIES[personality] || GENERIC;
  const intent = intentFor(phraseId);
  const pool = table[intent] || table.misc || GENERIC.misc;
  return pick(pool, seed, phraseId);
}
```

Give each personality ≥2 lines for greeting/play/compliment/farewell so the variation test passes.

- [ ] **Step 4: Run tests, verify pass** — `npx vitest run test/catreplies.test.js`.
- [ ] **Step 5: Commit** — `git add src/catreplies.js test/catreplies.test.js && git commit -m "feat: canned in-character cat reply engine"`

---

### Task 2: `main.js` — sendPhrase, solo-walk chat, AI-cat replies, friendship cap

**Files:** modify `src/main.js`.

**Context (current v8 wiring, `src/main.js`):** per-walk `chatBubbles`/`chatWheel` created ~1109-1129; `onPick` (1116) currently `if (!session.net) return;` then local bubble + `session.net.sendChat`; visibility `chatWheel.setVisible(Boolean(session.net))` (1129); interaction targeting uses `s.strayCats.nearest(catP, 2.5, { ungreetedOnly: true })` (1490) and `handleInteract` awards the stray greet on `E`.

- [ ] **Step 1: Add a shared `sendPhrase(phraseId)` in `startWalk`'s scope** (replacing the wheel's inline `onPick` body; the wheel's `onPick` becomes `onPick: sendPhrase`):

```js
    function sendPhrase(phraseId) {
      const p = phraseById(phraseId);
      if (!p) return;
      if (!sendGate.allow(session.playerId)) return;          // reuse existing 1500ms self-cooldown
      chatBubbles.show(session.cat, p.text);                   // local bubble
      if (session.net) session.net.sendChat({ v: 1, id: session.playerId, phraseId }); // players (v8)
      // Aim at the nearest AI cat and let it answer.
      const catP = session.cat.position;
      const target = session.strayCats.nearest(catP, 5);       // no ungreetedOnly — talk to any nearby cat
      if (target) {
        const breed = target.breed ?? target.group?.userData?.breed;
        const seed = (session.walkStamp ?? 0) + hashName(target.name);
        const line = replyFor(breed, phraseId, seed);
        setTimeout(() => { if (session && session.strayCats.list.includes(target)) chatBubbles.show(target.group, line); }, 600);
        // Friendship: a greeting counts once, only if this cat is still ungreeted this walk.
        if (countsAsGreet(phraseId)) greetStrayByChat(target);
      }
    }
```

Add small helpers: `hashName(name)` (sum char codes) and `greetStrayByChat(stray)` — the latter must reuse the SAME award path the `handleInteract` `kind: 'stray'` boop uses (award friend points + `progression` greet + level-up toast + set the stray's greeted flag so `nearest(..., {ungreetedOnly:true})` no longer returns it). Read `handleInteract`'s stray branch and factor its greet body into a shared function called by both boop and chat; do not duplicate the logic.

Import at top: `import { replyFor, countsAsGreet, intentFor } from './catreplies.js';`

- [ ] **Step 2: Enable chat input in solo walks.** Change visibility so the wheel/button shows whenever a walk is active (there is always at least a chance of AI cats): replace `chatWheel.setVisible(Boolean(session.net))` with `chatWheel.setVisible(true)`. Keep the v8 receive handler (`net.onChat`) exactly as-is inside the existing `if (session.net)` block. `getPlayers` stays `session.net ? … : []` (empty in solo, so the mute list is simply empty).

- [ ] **Step 3: Verify.** `npx vitest run` (203 green — this task adds no unit tests) and `npx vite build`. Browser: start a SOLO walk, confirm the 💬 button now shows; click a phrase near a stray → local bubble + the stray replies ~0.6s later; a greeting on an un-booped cat shows the friend toast, a second greeting to the same cat replies but gives no second toast.

- [ ] **Step 4: Commit** — `git add src/main.js && git commit -m "feat: talk to AI cats with in-character replies in solo and co-walks"`

---

### Task 3: keyboard chat controls (number row send, Enter tray, Esc close)

**Files:** create `src/chatkeys.js` (pure digit→phrase map + test); modify `src/main.js` (keydown wiring + hint); test `test/chatkeys.test.js`.

- [ ] **Step 1: Write the failing test** — `test/chatkeys.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { phraseIdForDigit } from '../src/chatkeys.js';
import { PHRASES } from '../src/chat.js';

describe('phraseIdForDigit', () => {
  const phraseKind = PHRASES.filter((p) => p.kind === 'phrase');
  it('maps Digit1..Digit9 to the first nine phrase-kind ids and Digit0 to the tenth', () => {
    expect(phraseIdForDigit('Digit1')).toBe(phraseKind[0].id);
    expect(phraseIdForDigit('Digit9')).toBe(phraseKind[8].id);
    expect(phraseIdForDigit('Digit0')).toBe(phraseKind[9].id);
  });
  it('returns null for non-digit or out-of-range codes', () => {
    expect(phraseIdForDigit('KeyT')).toBeNull();
    expect(phraseIdForDigit('Digit0', [])).toBeNull();
    expect(phraseIdForDigit('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement `src/chatkeys.js`:**

```js
import { PHRASES } from './chat.js';
// Number row → phrase id. Digit1..Digit9 = first nine 'phrase'-kind entries,
// Digit0 = the tenth. Emotes are reachable only via the tray, not the row.
export function phraseIdForDigit(code, phrases = PHRASES) {
  const m = /^Digit([0-9])$/.exec(code || '');
  if (!m) return null;
  const list = phrases.filter((p) => p.kind === 'phrase');
  const n = m[1] === '0' ? 10 : Number(m[1]);
  return list[n - 1]?.id ?? null;
}
```

- [ ] **Step 4: Run tests, verify pass.**

- [ ] **Step 5: Wire keydown in `src/main.js`** (inside the existing `document.addEventListener('keydown', …)` at line ~846, and gated so home-base typing is safe):

```js
    // chat keys — only during an active engaged walk, never while typing
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (session && player.engaged && !typing) {
      const digitPhrase = phraseIdForDigit(e.code);
      if (digitPhrase) { sendPhrase(digitPhrase); return; }
      if (e.code === 'Enter' && session.chatWheel) { session.chatWheel.openFromKeyboard?.(); return; }
      if (e.code === 'Escape' && session.chatWheel) { session.chatWheel.closeFromKeyboard?.(); return; }
    }
```

`sendPhrase` must be reachable from the keydown handler — hoist it to `session` (e.g. `session.sendPhrase = sendPhrase`) or module scope. Add `openFromKeyboard()`/`closeFromKeyboard()` to `createChatWheel` (Task 3b below) that open/close the tray and, on open, call `document.exitPointerLock()`.

- [ ] **Step 3b: Extend `src/ui/chatwheel.js`** with `openFromKeyboard()` (open the tray + `if (document.exitPointerLock) document.exitPointerLock()`) and `closeFromKeyboard()` (close the tray). Return them in the wheel's API. Do not change existing methods.

- [ ] **Step 6: On-screen hint.** When chat input first becomes available in a walk, show a one-time `hud.toast('Press 1–9 to chat · Enter for phrases')` (once per walk). Place beside the wheel creation in `startWalk`.

- [ ] **Step 7: Verify.** `npx vitest run` (≥ 205) + `npx vite build`. Browser (desktop): during a walk with pointer locked, press `1` → phrase sends + cat replies, cursor never needed; press `Enter` → tray opens and cursor returns (lock released); `Esc` closes. Confirm digits do nothing while a home-base text field is focused.

- [ ] **Step 8: Commit** — `git add src/chatkeys.js test/chatkeys.test.js src/main.js src/ui/chatwheel.js && git commit -m "feat: keyboard chat controls (number row + Enter), pointer-lock safe"`

---

### Task 4: Release — review, verify, ship with logos

- [ ] Full regression `npx vitest run` + `npx vite build`.
- [ ] Final whole-branch review (most capable model) focused on: no free-text path either direction; friendship greet is truly capped (reuses the greeted flag, no second award); keyboard keys don't collide or fire while typing or in solo/home base incorrectly; pointer-lock release/no-forced-relock; reply bubbles clean up with the walk (reuse v8 teardown `session.chatBubbles?.clear()`); solo play otherwise unchanged.
- [ ] One fix wave + scoped re-review if needed.
- [ ] Browser/screenshot proof of a cat reply + a keyboard send.
- [ ] Merge `feature/talk-to-cats` (branding + feature) to `main`, push, one deploy.

## Plan Self-Review Notes

- **Spec coverage:** canned replies → T1 (`catreplies.js`); all AI cats via nearest-stray targeting → T2; friendship greeting capped via existing greeted flag → T2 `greetStrayByChat`; emotes/farewells flavor-only → T1 `countsAsGreet`; keyboard `1`–`0`/Enter/Esc + pointer-lock-safe → T3; chat in solo walks → T2 Step 2; on-screen hint → T3 Step 6; offline/no-backend → local only. `T` replaced by `Enter` (yarn owns `T`, `src/main.js:869`).
- **Type consistency:** `sendPhrase(phraseId)`, `replyFor(personality, phraseId, seed)`, `countsAsGreet(phraseId)`, `phraseIdForDigit(code)` used consistently across tasks; `chatWheel.openFromKeyboard/closeFromKeyboard` defined in T3b and called in T3 Step 5.
- **Reuse guard:** targeting uses the existing `strayCats.nearest`; the greet award is factored from `handleInteract`'s stray boop, not duplicated (the plan requires extraction). Bubbles/wheel/catalog are the v8 modules.
- **Verification honesty:** pure logic (catreplies, chatkeys) is TDD'd; the main.js integration and pointer-lock behavior are browser-verified by the controller (the repo has no DOM test harness).
- **Fuzzy step:** `greetStrayByChat` must match the existing stray-greet award exactly — the implementer extracts it from `handleInteract`; the plan names the anchor (`kind: 'stray'`).
