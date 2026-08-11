# Whisker Walk v8 "Say Hi" (In-Game Chat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live, ephemeral player-to-player chat during co-walks, sent as curated phrases/emotes that appear as speech bubbles above cats.

**Architecture:** Players broadcast a **phrase ID enum** (never free text) over the existing Supabase Realtime room channel; peers map the ID to display text from a shared catalog and render a fading world-space speech-bubble sprite over the sender's cat. Pure logic (catalog, validation, rate-limit, filter) lives in `src/chat.js`; the bubble sprite manager in `src/chatbubble.js`; the picker UI in `src/ui/chatwheel.js`; `net.js` gains a validated `'chat'` broadcast kind; `main.js` wires send/receive with mute + blocklist + hide-chat gating.

**Tech Stack:** Vanilla ES modules, Three.js (CanvasTexture sprites), Vitest. No new dependencies. No new backend (broadcast-only; no Supabase tables/RPCs).

**Spec:** `docs/superpowers/specs/2026-08-11-whisker-walk-v8-chat.md`.

## Global Constraints

- Chat is **co-walk-only** and **ephemeral**: active only when `session.net` is truthy (in a room); nothing persisted except the `hideChat` boolean; no chat in solo walks or with AI ghosts.
- **No free text ever crosses the wire.** The broadcast payload is exactly `{ v: 1, id: <senderPlayerId>, phraseId: <catalog key> }`. An unknown `phraseId` is rejected on receipt, exactly like the existing `isValidStateMsg`/`isValidEventMsg` guards in `net.js`.
- All online features gate on the existing `MP` flag and degrade silently when offline/unconfigured; solo-local play never regresses.
- Bubbles render through the same `document`-guarded CanvasTexture path as `src/nametag.js` (`makeNameTag`) — a null return means "headless, no sprite" and callers must no-op, keeping tests node-safe.
- Tests + `npx vite build` green every commit. **Baseline: 186 tests.**
- Never log secrets; chat carries none, but keep the bar.

---

### Task 1: `src/chat.js` — catalog, validation, rate limiter, filter

**Files:**
- Create: `src/chat.js`
- Test: `test/chat.test.js`

**Interfaces:**
- Consumes: nothing (leaf module, no imports).
- Produces:
  - `PHRASES: Array<{ id: string, text: string, kind: 'phrase'|'emote' }>` (ordered, for the tray).
  - `phraseById(id: string) -> { id, text, kind } | null`
  - `isValidChatMsg(msg) -> boolean` (true only for `{ v:1, id:string(non-empty), phraseId: known }`).
  - `createChatRateLimiter({ perMs?, now? }) -> { allow(senderId: string): boolean }`
  - `shouldShowIncomingChat(senderId, { hideChat?, isMuted?, isBlocked? }) -> boolean` (pure; no rate-limit side effect).

- [ ] **Step 1: Write the failing test** — `test/chat.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  PHRASES, phraseById, isValidChatMsg, createChatRateLimiter, shouldShowIncomingChat,
} from '../src/chat.js';

describe('chat catalog', () => {
  it('has unique non-empty ids and text, each kind phrase|emote', () => {
    expect(PHRASES.length).toBeGreaterThanOrEqual(12);
    const ids = new Set();
    for (const p of PHRASES) {
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.text).toBe('string');
      expect(p.text.length).toBeGreaterThan(0);
      expect(p.kind === 'phrase' || p.kind === 'emote').toBe(true);
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
    }
  });
  it('phraseById returns the entry or null', () => {
    expect(phraseById(PHRASES[0].id)).toEqual(PHRASES[0]);
    expect(phraseById('nope')).toBeNull();
    expect(phraseById(123)).toBeNull();
  });
});

describe('isValidChatMsg', () => {
  const good = { v: 1, id: 'player-abc', phraseId: PHRASES[0].id };
  it('accepts a well-formed message with a known phraseId', () => {
    expect(isValidChatMsg(good)).toBe(true);
  });
  it('rejects unknown phraseId, bad shapes, and injection attempts', () => {
    expect(isValidChatMsg({ ...good, phraseId: 'unknown' })).toBe(false);
    expect(isValidChatMsg({ ...good, phraseId: '<script>' })).toBe(false);
    expect(isValidChatMsg({ v: 2, id: 'x', phraseId: good.phraseId })).toBe(false);
    expect(isValidChatMsg({ v: 1, id: '', phraseId: good.phraseId })).toBe(false);
    expect(isValidChatMsg({ v: 1, id: 5, phraseId: good.phraseId })).toBe(false);
    expect(isValidChatMsg({ v: 1, id: 'x' })).toBe(false);
    expect(isValidChatMsg(null)).toBe(false);
    expect(isValidChatMsg('hi')).toBe(false);
  });
});

describe('createChatRateLimiter', () => {
  it('blocks a sender that fires again inside the window, per-sender', () => {
    let t = 1000;
    const rl = createChatRateLimiter({ perMs: 1200, now: () => t });
    expect(rl.allow('a')).toBe(true);
    t = 1500; expect(rl.allow('a')).toBe(false); // 500ms < 1200ms
    expect(rl.allow('b')).toBe(true);            // different sender, independent
    t = 2300; expect(rl.allow('a')).toBe(true);  // 1300ms >= 1200ms since a's last allow
  });
});

describe('shouldShowIncomingChat', () => {
  it('hides when hideChat, blocked, or muted; shows otherwise', () => {
    expect(shouldShowIncomingChat('a', {})).toBe(true);
    expect(shouldShowIncomingChat('a', { hideChat: true })).toBe(false);
    expect(shouldShowIncomingChat('a', { isBlocked: (id) => id === 'a' })).toBe(false);
    expect(shouldShowIncomingChat('a', { isMuted: (id) => id === 'a' })).toBe(false);
    expect(shouldShowIncomingChat('a', { isMuted: (id) => id === 'b' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/chat.test.js`
Expected: FAIL (cannot resolve `../src/chat.js`).

- [ ] **Step 3: Implement `src/chat.js`**

```js
// Live co-walk chat: a curated catalog of phrases/emotes. Players broadcast a
// phrase ID (an enum), never free text — peers map the id to display text from
// this same catalog, so the chat channel can never carry arbitrary strings.

export const PHRASES = [
  { id: 'hi', text: 'Hi! 👋', kind: 'phrase' },
  { id: 'follow', text: 'Follow me!', kind: 'phrase' },
  { id: 'nice_cat', text: 'Nice cat! 😻', kind: 'phrase' },
  { id: 'play', text: 'Wanna play?', kind: 'phrase' },
  { id: 'here', text: 'Over here!', kind: 'phrase' },
  { id: 'good_walk', text: 'Good walk!', kind: 'phrase' },
  { id: 'brb', text: 'Brb 🐟', kind: 'phrase' },
  { id: 'boop', text: 'Boop? 👉👈', kind: 'phrase' },
  { id: 'zoomies', text: 'Zoomies!!', kind: 'phrase' },
  { id: 'bye', text: 'Bye! 👋', kind: 'phrase' },
  { id: 'love', text: '❤️', kind: 'emote' },
  { id: 'happy_cat', text: '😻', kind: 'emote' },
  { id: 'paw', text: '🐾', kind: 'emote' },
  { id: 'sparkle', text: '✨', kind: 'emote' },
  { id: 'fish', text: '🐟', kind: 'emote' },
  { id: 'laugh', text: '😹', kind: 'emote' },
];

const BY_ID = new Map(PHRASES.map((p) => [p.id, p]));

export function phraseById(id) {
  return (typeof id === 'string' && BY_ID.get(id)) || null;
}

export function isValidChatMsg(msg) {
  return (
    !!msg &&
    typeof msg === 'object' &&
    msg.v === 1 &&
    typeof msg.id === 'string' &&
    msg.id.length > 0 &&
    typeof msg.phraseId === 'string' &&
    BY_ID.has(msg.phraseId)
  );
}

// Per-sender minimum interval. `allow(id)` returns false (and does NOT reset the
// clock) when called again inside perMs of that sender's last allowed call.
export function createChatRateLimiter({ perMs = 1200, now = () => Date.now() } = {}) {
  const last = new Map();
  return {
    allow(senderId) {
      const t = now();
      const prev = last.get(senderId);
      if (prev !== undefined && t - prev < perMs) return false;
      last.set(senderId, t);
      return true;
    },
  };
}

// Pure visibility filter (no side effects). Rate limiting is applied separately
// by the caller so this stays deterministic and re-checkable.
export function shouldShowIncomingChat(
  senderId,
  { hideChat = false, isMuted = () => false, isBlocked = () => false } = {},
) {
  if (hideChat) return false;
  if (isBlocked(senderId)) return false;
  if (isMuted(senderId)) return false;
  return true;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/chat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/chat.js test/chat.test.js
git commit -m "feat: chat catalog, message validation, rate limiter, visibility filter"
```

---

### Task 2: `src/net.js` — validated `'chat'` broadcast kind

**Files:**
- Modify: `src/net.js` (import `isValidChatMsg`; add `chatHandlers`, a `'chat'` branch in `handleBroadcast`, `sendChat`, `onChat`; add both to the returned object)
- Test: `test/net.test.js` (add a chat describe block)

**Interfaces:**
- Consumes: `isValidChatMsg` from `./chat.js`.
- Produces (on the object returned by `createNet`): `sendChat(msg)`, `onChat(fn)`. Message shape `{ v:1, id, phraseId }`. Echo-suppressed on `payload.id === selfId`, identical to state/event.

- [ ] **Step 1: Write the failing test** — append to `test/net.test.js`:

```js
import { createNet, createFakeHub } from '../src/net.js';
import { PHRASES } from '../src/chat.js';

describe('chat broadcast kind', () => {
  it('delivers valid chat to peers, suppresses echo, drops invalid', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('ROOM', { playerId: 'a', petName: 'Ada', breed: 'tabby', accessories: {} });
    await b.join('ROOM', { playerId: 'b', petName: 'Bea', breed: 'tux', accessories: {} });

    const aGot = [];
    const bGot = [];
    a.onChat((m) => aGot.push(m));
    b.onChat((m) => bGot.push(m));

    a.sendChat({ v: 1, id: 'a', phraseId: PHRASES[0].id });
    expect(bGot).toHaveLength(1);
    expect(bGot[0].phraseId).toBe(PHRASES[0].id);
    expect(aGot).toHaveLength(0); // echo suppressed for the sender

    a.sendChat({ v: 1, id: 'a', phraseId: 'totally-unknown' }); // invalid → dropped
    expect(bGot).toHaveLength(1);
  });
});
```

(If `test/net.test.js` already imports `createNet`/`createFakeHub`, reuse those imports instead of re-importing — add only the `PHRASES` import and the new `describe`.)

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/net.test.js`
Expected: FAIL (`a.onChat is not a function`).

- [ ] **Step 3: Implement in `src/net.js`**

At the top with the other imports, add:

```js
import { isValidChatMsg } from './chat.js';
```

Inside `createNet`, beside `const eventHandlers = [];` add:

```js
  const chatHandlers = [];
```

In `handleBroadcast`, after the `event` branch, add:

```js
    } else if (kind === 'chat') {
      if (!isValidChatMsg(payload)) return;
      if (payload.id === selfId) return; // echo suppression
      for (const fn of chatHandlers) fn(payload);
```

Beside `sendEvent`/`onEvent`, add:

```js
  function sendChat(msg) {
    if (!isValidChatMsg(msg)) return;
    transport.send('chat', msg);
  }

  function onChat(fn) {
    chatHandlers.push(fn);
  }
```

Add both to the returned object:

```js
  return { join, leave, sendState, sendEvent, sendChat, onState, onEvent, onChat, onRoster, isHost };
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/net.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/net.js test/net.test.js
git commit -m "feat: validated chat broadcast kind in net layer"
```

---

### Task 3: `src/chatbubble.js` — fading world-space speech-bubble manager

**Files:**
- Create: `src/chatbubble.js`
- Test: `test/chatbubble.test.js`

**Interfaces:**
- Consumes: `three` (Sprite/CanvasTexture), mirrors `src/nametag.js` `document`-guard.
- Produces:
  - `makeBubbleSprite(text) -> THREE.Sprite | null` (null when headless).
  - `createChatBubbles(scene, { makeSprite?, now? }) -> { show(target, text, t?), update(t?), clear(), activeCount }`.
  - Constants (module-local): `LIFETIME_MS = 3500`, `FADE_MS = 600`.
  - Behavior: `show` attaches a sprite to the target Object3D (so it follows the cat), replacing any existing bubble on that target; `update` fades opacity over the last `FADE_MS` and removes at `LIFETIME_MS`.

- [ ] **Step 1: Write the failing test** — `test/chatbubble.test.js` (uses fake sprites/targets so it needs no DOM or WebGL):

```js
import { describe, it, expect } from 'vitest';
import { createChatBubbles } from '../src/chatbubble.js';

function fakeTarget() {
  return { children: [], add(s) { this.children.push(s); }, remove(s) {
    const i = this.children.indexOf(s); if (i >= 0) this.children.splice(i, 1);
  } };
}
function fakeSpriteFactory() {
  return () => ({ material: { opacity: 1, map: { dispose() {} }, dispose() {} } });
}

describe('createChatBubbles', () => {
  it('shows, fades, and removes a bubble over its lifetime', () => {
    let t = 0;
    const scene = fakeTarget();
    const bubbles = createChatBubbles(scene, { makeSprite: fakeSpriteFactory(), now: () => t });
    const cat = fakeTarget();

    bubbles.show(cat, 'Hi! 👋', 0);
    expect(bubbles.activeCount).toBe(1);
    expect(cat.children).toHaveLength(1);

    t = 100; bubbles.update(t);
    expect(cat.children[0].material.opacity).toBe(1); // before fade window

    t = 3500 - 300; bubbles.update(t); // inside the 600ms fade window
    expect(cat.children[0].material.opacity).toBeLessThan(1);
    expect(cat.children[0].material.opacity).toBeGreaterThan(0);

    t = 3500; bubbles.update(t);
    expect(bubbles.activeCount).toBe(0);
    expect(cat.children).toHaveLength(0);
  });

  it('replaces an existing bubble on the same target', () => {
    let t = 0;
    const bubbles = createChatBubbles(fakeTarget(), { makeSprite: fakeSpriteFactory(), now: () => t });
    const cat = fakeTarget();
    bubbles.show(cat, 'Hi!', 0);
    bubbles.show(cat, 'Bye!', 10);
    expect(bubbles.activeCount).toBe(1);
    expect(cat.children).toHaveLength(1);
  });

  it('no-ops when the sprite factory returns null (headless)', () => {
    const bubbles = createChatBubbles(fakeTarget(), { makeSprite: () => null, now: () => 0 });
    const cat = fakeTarget();
    bubbles.show(cat, 'Hi!', 0);
    expect(bubbles.activeCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/chatbubble.test.js`
Expected: FAIL (cannot resolve `../src/chatbubble.js`).

- [ ] **Step 3: Implement `src/chatbubble.js`**

```js
import * as THREE from 'three';

export const LIFETIME_MS = 3500;
export const FADE_MS = 600;

// Rounded speech bubble drawn to a canvas, same CanvasTexture sprite technique
// as nametag.js. Guards on `document` so it's a safe no-op headless (tests/SSR):
// a null return means "no sprite" and callers must skip rendering.
export function makeBubbleSprite(text) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 40px Avenir, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(300, Math.max(90, ctx.measureText(text).width + 48));
  const x = (canvas.width - w) / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, 8, w, 60, 26);
  else ctx.rect(x, 8, w, 60);
  ctx.fill();
  // little tail
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 12, 66);
  ctx.lineTo(canvas.width / 2 + 12, 66);
  ctx.lineTo(canvas.width / 2, 86);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1c2431';
  ctx.fillText(text, canvas.width / 2, 40);

  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(1.9, 0.57, 1);
  sprite.position.y = 1.55; // above the name tag (which sits at 1.05)
  sprite.renderOrder = 10;
  return sprite;
}

// Manages at most one bubble per target Object3D. Bubbles are added as children
// of the target so they follow the cat automatically. now() is injectable and
// defaults to a monotonic clock.
export function createChatBubbles(scene, { makeSprite = makeBubbleSprite, now } = {}) {
  const clock = now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const active = new Map(); // target -> { sprite, bornAt }

  function disposeSprite(sprite) {
    if (sprite && sprite.material) {
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
    }
  }

  function removeFor(target, entry) {
    target.remove(entry.sprite);
    disposeSprite(entry.sprite);
    active.delete(target);
  }

  function show(target, text, t = clock()) {
    if (!target) return;
    const existing = active.get(target);
    if (existing) removeFor(target, existing);
    const sprite = makeSprite(text);
    if (!sprite) return; // headless: nothing to render
    target.add(sprite);
    active.set(target, { sprite, bornAt: t });
  }

  function update(t = clock()) {
    for (const [target, entry] of Array.from(active.entries())) {
      const age = t - entry.bornAt;
      if (age >= LIFETIME_MS) {
        removeFor(target, entry);
        continue;
      }
      const fadeStart = LIFETIME_MS - FADE_MS;
      const opacity = age <= fadeStart ? 1 : Math.max(0, 1 - (age - fadeStart) / FADE_MS);
      if (entry.sprite.material) entry.sprite.material.opacity = opacity;
    }
  }

  function clear() {
    for (const [target, entry] of Array.from(active.entries())) removeFor(target, entry);
  }

  return {
    show,
    update,
    clear,
    get activeCount() { return active.size; },
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/chatbubble.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/chatbubble.js test/chatbubble.test.js
git commit -m "feat: fading world-space speech-bubble manager"
```

---

### Task 4: `src/settings.js` — `hideChat` setting

**Files:**
- Modify: `src/settings.js` (add `hideChat` to `DEFAULTS` and `sanitize`)
- Test: `test/settings.test.js` (add cases)

**Interfaces:**
- Consumes: nothing new.
- Produces: `settings.get('hideChat')` / `settings.set('hideChat', bool)`; default `false`.

- [ ] **Step 1: Write the failing test** — add to `test/settings.test.js`:

```js
it('defaults hideChat to false, persists a set, ignores corrupt', () => {
  const store = makeMemoryStorage(); // reuse the test helper already in this file
  const s = createSettings(store);
  expect(s.get('hideChat')).toBe(false);
  s.set('hideChat', true);
  expect(s.get('hideChat')).toBe(true);
  const reloaded = createSettings(store);
  expect(reloaded.get('hideChat')).toBe(true);
});
```

(Use whatever in-file storage helper the existing settings tests use; if none is named `makeMemoryStorage`, mirror the existing pattern for constructing a fake storage.)

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/settings.test.js`
Expected: FAIL (`hideChat` is `undefined`).

- [ ] **Step 3: Implement in `src/settings.js`**

In `DEFAULTS`, add the field:

```js
  reducedMotion: false,
  hideChat: false,
```

In `sanitize`'s returned object, add the line:

```js
    reducedMotion: typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : DEFAULTS.reducedMotion,
    hideChat: typeof raw.hideChat === 'boolean' ? raw.hideChat : DEFAULTS.hideChat,
```

(The generic `set(key, val)` already handles any boolean key in `DEFAULTS`, so no change there.)

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/settings.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings.js test/settings.test.js
git commit -m "feat: hideChat setting"
```

---

### Task 5: `src/ui/chatwheel.js` — chat button + phrase tray (browser-verified)

**Files:**
- Create: `src/ui/chatwheel.js`
- Modify: `src/style.css` (append `.chat-wheel` / `.chat-tray` styles)

**Interfaces:**
- Consumes: `PHRASES` from `../chat.js`.
- Produces: `createChatWheel(root, { onPick, getPlayers, isMuted, toggleMute }) -> { setVisible(bool), refresh(), destroy() }` where:
  - `onPick(phraseId: string)` fires on a phrase/emote tap.
  - `getPlayers() -> Array<{ id: string, name: string }>` supplies the nearby-players mute list (called on tray open).
  - `isMuted(id) -> boolean`, `toggleMute(id)` drive the per-player 🔇 rows.
  - `setVisible(false)` hides the whole widget (button + tray) and closes the tray.

**Note:** This is DOM UI, verified in the browser like `touchui.js`/`homebase.js` (no unit test), not via a failing unit test.

- [ ] **Step 1: Implement `src/ui/chatwheel.js`**

```js
import { PHRASES } from '../chat.js';

// The in-walk chat control: a 💬 button that toggles a tray of curated
// phrase/emote buttons plus a per-player mute list. Co-walk-only — main.js
// calls setVisible(true) when in a room and setVisible(false) otherwise.
export function createChatWheel(root, { onPick, getPlayers, isMuted, toggleMute }) {
  const wrap = document.createElement('div');
  wrap.className = 'chat-wheel hidden';
  wrap.innerHTML = `
    <button class="chat-toggle" type="button" aria-label="Chat">💬</button>
    <div class="chat-tray hidden" role="menu">
      <div class="chat-phrases"></div>
      <div class="chat-mutes"></div>
    </div>`;
  root.appendChild(wrap);

  const toggle = wrap.querySelector('.chat-toggle');
  const tray = wrap.querySelector('.chat-tray');
  const phrases = wrap.querySelector('.chat-phrases');
  const mutes = wrap.querySelector('.chat-mutes');

  for (const p of PHRASES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chat-phrase' + (p.kind === 'emote' ? ' chat-emote' : '');
    b.textContent = p.text;
    b.addEventListener('click', () => { onPick(p.id); closeTray(); });
    phrases.appendChild(b);
  }

  function renderMutes() {
    mutes.innerHTML = '';
    const players = (getPlayers && getPlayers()) || [];
    for (const pl of players) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'chat-mute-row';
      const muted = isMuted && isMuted(pl.id);
      row.textContent = `${muted ? '🔇' : '🔈'} ${pl.name}`;
      row.addEventListener('click', () => { toggleMute(pl.id); renderMutes(); });
      mutes.appendChild(row);
    }
  }

  function openTray() { renderMutes(); tray.classList.remove('hidden'); }
  function closeTray() { tray.classList.add('hidden'); }
  toggle.addEventListener('click', () => {
    if (tray.classList.contains('hidden')) openTray(); else closeTray();
  });

  return {
    setVisible(v) { wrap.classList.toggle('hidden', !v); if (!v) closeTray(); },
    refresh() { if (!tray.classList.contains('hidden')) renderMutes(); },
    destroy() { wrap.remove(); },
  };
}
```

- [ ] **Step 2: Append styles to `src/style.css`** (match the existing dark cozy palette; keep it above the pause overlay's `z-index: 10` peers but below it — the tray is a sibling of the touch UI, so use `z-index: 5`):

```css
.chat-wheel { position: fixed; right: 16px; bottom: 96px; z-index: 5; }
.chat-wheel.hidden { display: none; }
.chat-toggle { width: 56px; height: 56px; border-radius: 50%; border: none;
  font-size: 26px; background: rgba(28,36,49,0.85); color: #fff; cursor: pointer; }
.chat-tray { position: absolute; right: 0; bottom: 68px; width: 260px;
  background: rgba(20,26,38,0.96); border-radius: 14px; padding: 10px; }
.chat-tray.hidden { display: none; }
.chat-phrases { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.chat-phrase { padding: 10px 8px; border: none; border-radius: 10px;
  background: #2b3648; color: #fff; font-size: 15px; cursor: pointer; }
.chat-emote { font-size: 22px; }
.chat-mutes { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.chat-mute-row { text-align: left; padding: 6px 8px; border: none; border-radius: 8px;
  background: transparent; color: #cdd6e4; font-size: 13px; cursor: pointer; }
body.left-handed .chat-wheel { left: 16px; right: auto; }
body.left-handed .chat-tray { left: 0; right: auto; }
```

- [ ] **Step 3: Verify in the browser** — `npm run dev`, and since chat needs a live room, confirm at minimum that the widget mounts and the tray opens. Quick check via the dev console on the running page:

```js
// In the browser devtools console on http://localhost:5173 after starting a walk:
document.querySelector('.chat-toggle')?.click();
document.querySelectorAll('.chat-phrase').length; // expect 16
```

Expected: tray opens; 16 phrase/emote buttons present. (Full co-walk visibility is exercised in Task 6.)

- [ ] **Step 4: Commit**

```bash
git add src/ui/chatwheel.js src/style.css
git commit -m "feat: chat wheel button + phrase tray UI"
```

---

### Task 6: `main.js` integration + release

**Files:**
- Modify: `src/main.js` (mount chat wheel; send path; receive path; per-walk mute set + rate limiter; bubble updates in the loop; teardown), `src/ui/homebase.js` (Settings ⚙️ "Hide chat bubbles" toggle), `README.md` (mention in-game chat).

**Interfaces (all already defined):** `createChatBubbles` (Task 3), `createChatWheel` (Task 5), `phraseById`/`createChatRateLimiter`/`shouldShowIncomingChat` (Task 1), `net.sendChat`/`net.onChat` (Task 2), `settings.get('hideChat')` (Task 4), `session.net`, `session.remotes.list` (`{ playerId, petName, group }`), the local player cat Object3D, and the per-device block list (`blockList.has(id)`).

- [ ] **Step 1: Mount chat + per-walk state.** Near where `createRemoteCats(scene)` is created in `startWalk`, add:

```js
import { createChatBubbles } from './chatbubble.js';
import { createChatWheel } from './ui/chatwheel.js';
import { phraseById, createChatRateLimiter, shouldShowIncomingChat } from './chat.js';
```

Then, per walk:

```js
    session.cat = cat; // expose the local player cat so the chat handler can anchor a bubble
    const chatBubbles = createChatBubbles(scene);
    const chatRate = createChatRateLimiter({ perMs: 1200 });   // receive-side, per remote sender
    const sendGate = createChatRateLimiter({ perMs: 1500 });   // local self-send cooldown
    const mutedIds = new Set();                                // per-walk, ephemeral
    session.chatBubbles = chatBubbles;

    const chatWheel = createChatWheel(document.body, {
      onPick: (phraseId) => {
        if (!session.net) return;
        if (!sendGate.allow(session.playerId)) return;
        const p = phraseById(phraseId);
        if (!p) return;
        chatBubbles.show(session.cat, p.text);            // instant local feedback
        session.net.sendChat({ v: 1, id: session.playerId, phraseId });
      },
      getPlayers: () => (session.net ? session.remotes.list.map((r) => ({ id: r.playerId, name: r.petName })) : []),
      isMuted: (id) => mutedIds.has(id),
      toggleMute: (id) => { if (mutedIds.has(id)) mutedIds.delete(id); else mutedIds.add(id); },
    });
    session.chatWheel = chatWheel;
    chatWheel.setVisible(Boolean(session.net));
```

- [ ] **Step 2: Wire receive.** In the `if (session.net)` block that already calls `net.onState`/`net.onEvent`, add:

```js
      net.onChat((msg) => {
        if (!shouldShowIncomingChat(msg.id, {
          hideChat: settings.get('hideChat'),
          isMuted: (id) => mutedIds.has(id),
          isBlocked: (id) => blockList.has(id),
        })) return;
        if (!chatRate.allow(msg.id)) return;
        const p = phraseById(msg.phraseId);
        if (!p) return;
        const entry = session.remotes.list.find((r) => r.playerId === msg.id);
        if (entry) chatBubbles.show(entry.group, p.text);
      });
```

(Use the same `settings` and `blockList` references main.js already holds. If `blockList` is named differently in scope, use that name; it is the `createBlockList(...)` instance with `.has(id)`.)

Also refresh the mute list when the roster changes — inside the existing `net.onRoster((roster) => { … })` handler, after `hud.setRoster(...)`, add:

```js
        session.chatWheel?.refresh();
```

- [ ] **Step 3: Update bubbles each frame + teardown.** In the per-frame update (where `remotes.update(dt, now)` is called), add:

```js
      session.chatBubbles?.update();
```

In `endWalk` (near `session.remotes.dispose()`), add:

```js
    session.chatBubbles?.clear();
    session.chatWheel?.destroy();
```

- [ ] **Step 4: Settings toggle.** In `src/ui/homebase.js`, in the Settings ⚙️ section next to the reduced-motion toggle, add a "Hide chat bubbles" checkbox bound to `settings.get('hideChat')` / `settings.set('hideChat', checked)`, mirroring the existing toggles' markup and escaping conventions exactly.

- [ ] **Step 5: Run the full suite + build.**

Run: `npx vitest run && npx vite build`
Expected: all tests pass (≥ 190), build succeeds.

- [ ] **Step 6: Browser verify (solo gating).** `npm run dev`; start a SOLO walk; confirm the 💬 button is **hidden** (no `session.net`). Confirm no console errors.

- [ ] **Step 7: Live two-player smoke test.** Using the node-bot pattern from prior multiplayer waves (`scratchpad/claude-player.mjs`, joining via `createSupabaseTransport` with a `zzz-` id so it never hosts): host a room on the dev site, have the bot join, and from the site tap several phrases — verify the bot receives valid `chat` messages and that a crafted unknown `phraseId` from the bot produces **no** bubble on the site. Confirm a muted player's bubbles stop showing. Capture a screenshot of a bubble over a remote cat.

- [ ] **Step 8: Commit.**

```bash
git add src/main.js src/ui/homebase.js README.md
git commit -m "feat: wire in-game chat — send, receive, mute, hide-chat, bubbles"
```

- [ ] **Step 9: Final whole-branch review + release.** Run the SDD final whole-branch review (most-capable model) focused on: the phrase-ID-only invariant (no free text path anywhere), co-walk-only gating (no chat in solo/ghost), teardown correctness (no bubble/sprite leak across walks), and left-handed layout. Address findings via one fix wave + scoped re-review. Then merge to `main`, push, and confirm the GitHub Pages deploy is green.

## Plan Self-Review Notes

- **Spec coverage:** phrase-ID wire model → T1+T2; curated catalog → T1; speech bubbles → T3; 💬 button + tray → T5; send/receive gating → T6; anti-spam rate limit → T1 (used in T6); per-player mute → T5 tray + T6 set; blocklist auto-mute → T6; hideChat setting → T4 + T6 toggle; co-walk-only + ephemeral → Global Constraints + T6 gating; live smoke test → T6 Step 7. No spec requirement is unmapped.
- **No new backend:** confirmed — chat is broadcast-only; no Supabase table/RPC/SQL touched, so the live DB contract is untouched.
- **Type consistency:** message shape `{ v:1, id, phraseId }` is identical across T1 (`isValidChatMsg`), T2 (`sendChat`/branch), and T6 (send/receive). `createChatBubbles(...).show(target, text)` and `.update()` signatures match between T3 and T6. `createChatWheel` callback names (`onPick/getPlayers/isMuted/toggleMute`) match between T5 and T6.
- **Test-environment safety:** all DOM/Three touch points (`makeBubbleSprite`, `chatwheel.js`) are `document`-guarded or browser-only-verified, so the node test run stays green; pure logic (T1) and the fake-injected bubble manager (T3) carry the unit coverage.
- **Fuzzy step:** T6 references a couple of in-scope variable names (`cat`, `blockList`, `settings`) by their role; the implementer has `main.js` open and the plan states the role precisely, so the binding is unambiguous.
