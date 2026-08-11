# Whisker Walk v9 "Home Base, Tidied" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the cluttered single-scroll home base into a persistent hero (cat + rank + Start button) plus four tabbed panels (Play / Social / Album / Settings), consolidating the three overlapping social blocks.

**Architecture:** Pure tab helper in a new `src/ui/hometabs.js`; `src/ui/homebase.js` `render()` restructured to emit a sticky hero + a tab bar + four panels (only the active one shown), moving existing section markup verbatim into panels. A module-scoped `activeTab` persists across `render()`'s full-innerHTML rebuilds. All existing delegated handlers, async flows, and `escapeHtml` sites are preserved unchanged.

**Tech Stack:** Vanilla ES modules, Vitest. No new dependencies. No backend/SQL changes.

**Spec:** `docs/superpowers/specs/2026-08-11-whisker-walk-v9-homebase-tabs.md`.

## Global Constraints

- **Reorganization only** — no behavior change. Every existing handler (`btn-start`, `btn-reset`, `wt-*`, `friend-code-*`, `sync-*`, buy/equip/unequip, `hide-player`, volume `input`, checkboxes, `dusk-toggle`) keeps working. All are delegated on `root` (position-independent), so moving sections between containers must not break them.
- **XSS safety preserved:** every server-derived/untrusted string stays escaped via `escapeHtml` at its render site. Do not remove or relocate any `escapeHtml(...)` call. No new unescaped interpolation.
- **MP gating preserved:** Social/Sync features stay gated on `rooms.available` / `sync.available` / `cloud.available`; solo-local play unaffected.
- **The async player-pets roster must still fill:** `render()` ends with `if (cloud && cloud.available) loadPlayerPets();` and `loadPlayerPets()` targets `#player-pets-roster` — that element must still exist in the DOM after render (inside a panel is fine; `querySelector` finds hidden elements).
- **Default tab is `play`.** Switching tabs triggers no reload, no walk restart, no network calls.
- Tests + `npx vite build` green every commit. **Baseline: 200 tests.**

---

### Task 1: `src/ui/hometabs.js` — pure tab resolver

**Files:**
- Create: `src/ui/hometabs.js`
- Test: `test/hometabs.test.js`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `HOME_TABS: string[]` (the ordered tab ids) and `resolveTab(id) -> string` (returns `id` if it's a known tab, else `'play'`).

- [ ] **Step 1: Write the failing test** — `test/hometabs.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { HOME_TABS, resolveTab } from '../src/ui/hometabs.js';

describe('home base tabs', () => {
  it('lists the four tabs in order, play first', () => {
    expect(HOME_TABS).toEqual(['play', 'social', 'album', 'settings']);
  });
  it('resolveTab keeps a known id', () => {
    for (const t of HOME_TABS) expect(resolveTab(t)).toBe(t);
  });
  it('resolveTab falls back to play for unknown/empty/non-string', () => {
    expect(resolveTab('nope')).toBe('play');
    expect(resolveTab('')).toBe('play');
    expect(resolveTab(undefined)).toBe('play');
    expect(resolveTab(null)).toBe('play');
    expect(resolveTab(42)).toBe('play');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/hometabs.test.js`
Expected: FAIL (cannot resolve `../src/ui/hometabs.js`).

- [ ] **Step 3: Implement `src/ui/hometabs.js`**

```js
// The home base tab set and a resolver that clamps any unknown/stale tab id
// back to the default. Pure — no DOM — so it's unit-tested; homebase.js
// imports it for the tab bar and for persisting the active tab across
// render() rebuilds.
export const HOME_TABS = ['play', 'social', 'album', 'settings'];

export function resolveTab(id) {
  return HOME_TABS.includes(id) ? id : 'play';
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/hometabs.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/hometabs.js test/hometabs.test.js
git commit -m "feat: pure home base tab resolver"
```

---

### Task 2: `homebase.js` — hero + tab bar + four panels

**Files:**
- Modify: `src/ui/homebase.js` (import `hometabs`; add `activeTab` state; restructure `render()`; add tab-switch handling; keep all existing helpers/handlers)
- Modify: `src/style.css` (sticky hero, tab bar, panel show/hide — append only)

**Interfaces:**
- Consumes: `HOME_TABS`, `resolveTab` from `./hometabs.js`.
- Produces: no new exports; `createHomeBase(...)` public API unchanged.

**Context — current `render()` structure** (`src/ui/homebase.js:354-414`): sets `root.innerHTML` to a `.homebase-scroll` wrapper containing, in order: `header.hb-header` (title + points + rank), then `<section>`s for **Your cat**, **Accessories**, **Where to?**, **Photo album**, **Cat friends** (which also contains `${renderPlayerPets()}`), **Walk together** (`renderWalkTogether()`), the conditional **Sync** section, `renderSettings()`, and a `footer.hb-footer` holding the optional dusk toggle + the `#btn-start` button. It ends with `if (cloud && cloud.available) loadPlayerPets();`.

- [ ] **Step 1: Add tab state + import.** At the top of `src/ui/homebase.js` with the other imports, add:

```js
import { HOME_TABS, resolveTab } from './hometabs.js';
```

With the other module-scoped state vars (near `playerPetsToken`, `friendCodeError`, etc.), add:

```js
  let activeTab = 'play';
```

- [ ] **Step 2: Restructure `render()`'s innerHTML.** Replace the `.homebase-scroll` body so it is: a sticky hero, then a tab bar, then four panels. Keep every existing section's inner markup **byte-for-byte** — only move each into its panel. Concretely, `root.innerHTML` becomes:

```js
    root.innerHTML = `
      <div class="homebase-scroll">
        <div class="hb-hero">
          <header class="hb-header">
            <h1>🐈 Whisker Walk</h1>
            <div class="hb-header-right">
              <div class="hb-points">🐾 ${s.points} whisker points</div>
              <div class="hb-substats">
                <span>🏆 ${rank.title} — ${nextLine}</span>
                <span>best walk: ${s.bestWalk} 🐾</span>
              </div>
            </div>
          </header>
          <div class="hb-hero-start">
            ${glowReady ? `<label class="dusk"><input type="checkbox" id="dusk-toggle" /> Dusk walk ✨</label>` : ''}
            ${waitingForHost
              ? `<button id="btn-start" class="primary" disabled>Waiting for host…</button>`
              : `<button id="btn-start" class="primary">Start the walk 🐾</button>`}
          </div>
        </div>
        <nav class="hb-tabs" role="tablist">
          <button class="hb-tab" data-tab="play" role="tab">🎽 Play</button>
          <button class="hb-tab" data-tab="social" role="tab">🐾 Social</button>
          <button class="hb-tab" data-tab="album" role="tab">📸 Album</button>
          <button class="hb-tab" data-tab="settings" role="tab">⚙️ Settings</button>
        </nav>
        <div class="hb-panels">
          <div class="hb-panel" data-panel="play">
            <section><h2>Your cat</h2><div class="cards">
              ${Object.entries(CATALOG.cats).map(([id, c]) => card('cats', id, c, 'walking today')).join('')}
            </div></section>
            <section><h2>Accessories</h2><div class="cards">
              ${Object.entries(CATALOG.accessories).map(([id, a]) => card('accessories', id, a, `on (${a.slot})`)).join('')}
            </div></section>
            <section><h2>Where to?</h2><div class="cards">
              ${Object.entries(CATALOG.areas).map(([id, a]) => card('areas', id, a, 'today’s walk')).join('')}
            </div></section>
          </div>
          <div class="hb-panel" data-panel="social">
            <section class="walk-together"><h2>Walk together 🐾🐾</h2>
              ${renderWalkTogether()}
            </section>
            <section><h2>Cat friends 🐾</h2><div class="friends-list">
              ${Object.entries(s.friends).length
                ? Object.entries(s.friends)
                    .sort(([, a], [, b]) => b.greets - a.greets)
                    .map(([name, f]) => `<div class="friend-row">
                      <span class="friend-icon">${LEVEL_ICON[progression.friendLevel(name)] ?? '♡'}</span>
                      <span class="friend-name">${escapeHtml(name)}</span> — ${escapeHtml(f.breed)}, ${f.greets} greets
                    </div>`).join('')
                : '<div class="tag">No cat friends yet — go touch noses!</div>'}
            </div>
            ${renderPlayerPets()}
            </section>
          </div>
          <div class="hb-panel" data-panel="album">
            <section><h2>Photo album 📸</h2><div class="photos">
              ${album.photos.length
                ? album.photos.map((p) => `<figure><img src="${escapeHtml(p.thumb)}" alt="${escapeHtml(p.label)}"><figcaption>${escapeHtml(p.label)} — ${escapeHtml(p.area)}</figcaption></figure>`).join('')
                : '<div class="tag">No photos yet — press C on a walk to raise the camera!</div>'}
            </div></section>
          </div>
          <div class="hb-panel" data-panel="settings">
            ${sync && sync.available ? `<section class="walk-together sync-cloud"><h2>Sync ☁️</h2>${renderSync()}</section>` : ''}
            ${renderSettings()}
          </div>
        </div>
      </div>`;
    activeTab = resolveTab(activeTab);
    applyActiveTab();
    if (cloud && cloud.available) loadPlayerPets();
```

(Note: the **Cat friends** section keeps `${renderPlayerPets()}` immediately after it for now — Task 3 merges them into one Friends section. Do not change `renderPlayerPets`/`renderSettings`/`renderSync`/`renderWalkTogether`/`card` internals in this task.)

- [ ] **Step 3: Add `applyActiveTab()` + tab-click handling.** Add this helper (near `render`):

```js
  function applyActiveTab() {
    for (const btn of root.querySelectorAll('.hb-tab')) {
      btn.classList.toggle('active', btn.dataset.tab === activeTab);
      btn.setAttribute('aria-selected', btn.dataset.tab === activeTab ? 'true' : 'false');
    }
    for (const panel of root.querySelectorAll('.hb-panel')) {
      panel.classList.toggle('active', panel.dataset.panel === activeTab);
    }
  }
```

In the existing delegated `root.addEventListener('click', ...)` handler, add a branch at the TOP (before the other id checks) that switches tabs without a full re-render:

```js
    const tabBtn = e.target.closest('.hb-tab');
    if (tabBtn) {
      activeTab = resolveTab(tabBtn.dataset.tab);
      applyActiveTab();
      return;
    }
```

- [ ] **Step 4: Append CSS to `src/style.css`** (match the existing dark cozy palette; the hero sticks to the top of the scroll container, panels show/hide):

```css
.hb-hero { position: sticky; top: 0; z-index: 3; background: #1c2431;
  padding: 12px 0 8px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.hb-hero-start { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.hb-hero-start .primary { flex: 1; }
.hb-tabs { position: sticky; top: 0; z-index: 2; display: flex; gap: 4px;
  background: #1c2431; padding: 8px 0; }
.hb-tab { flex: 1; padding: 10px 6px; border: none; border-radius: 10px;
  background: #2b3648; color: #cdd6e4; font-size: 14px; cursor: pointer; }
.hb-tab.active { background: #3a4a63; color: #fff; }
.hb-panel { display: none; }
.hb-panel.active { display: block; }
```

- [ ] **Step 5: Verify.** Run `npx vitest run` (full suite must stay green — this task adds no unit tests but must not break the 200 + Task 1's) and `npx vite build` (must succeed).

Run: `npx vitest run && npx vite build`
Expected: tests pass (≥ 204), build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/ui/homebase.js src/style.css
git commit -m "feat: home base hero + tabbed panels"
```

---

### Task 3: `homebase.js` — consolidate the Social panel's friends blocks

**Files:**
- Modify: `src/ui/homebase.js` (merge the "Cat friends" section and `renderPlayerPets()` into one **Friends** section with two labeled sub-groups; keep the friend-code block)

**Interfaces:** no new exports; `loadPlayerPets()` still targets `#player-pets-roster`.

**Goal:** In the Social panel, replace the separate "Cat friends 🐾" section + `renderPlayerPets()` (which carries its own "Player pets 🐾🐾" `<h3>`) with ONE `<section><h2>Friends 🐾</h2>` containing two labeled sub-groups — **Player pets** and **Stray cats** — then the friend-code block. This removes the duplicate `🐾🐾` headers.

- [ ] **Step 1: Extract the stray-cats list into a helper.** Add near `renderPlayerPets`:

```js
  function renderStrayFriends() {
    const s = progression.state;
    const entries = Object.entries(s.friends);
    return `<h3>Stray cats</h3>
      <div class="friends-list">
        ${entries.length
          ? entries
              .sort(([, a], [, b]) => b.greets - a.greets)
              .map(([name, f]) => `<div class="friend-row">
                <span class="friend-icon">${LEVEL_ICON[progression.friendLevel(name)] ?? '♡'}</span>
                <span class="friend-name">${escapeHtml(name)}</span> — ${escapeHtml(f.breed)}, ${f.greets} greets
              </div>`).join('')
          : '<div class="tag">No cat friends yet — go touch noses!</div>'}
      </div>`;
  }
```

- [ ] **Step 2: Change `renderPlayerPets()` to be a sub-group, not a standalone section.** Update its heading from `<h3>Player pets 🐾🐾</h3>` to `<h3>Player pets</h3>` and DROP the `${renderFriendCode()}` call from inside it (the friend-code block moves to the Friends section body in Step 3). Keep the `#player-pets-section` wrapper and `#player-pets-roster` placeholder id unchanged so `loadPlayerPets()` still works. Result:

```js
  function renderPlayerPets() {
    if (!cloud || !cloud.available) return '';
    return `
      <div id="player-pets-section" class="player-pets">
        <h3>Player pets</h3>
        <div id="player-pets-roster" class="tag">loading…</div>
      </div>`;
  }
```

- [ ] **Step 3: Replace the Social panel's friends markup** (from Task 2) with a single Friends section. In `render()`, the `social` panel becomes:

```js
          <div class="hb-panel" data-panel="social">
            <section class="walk-together"><h2>Walk together 🐾🐾</h2>
              ${renderWalkTogether()}
            </section>
            <section class="friends-section"><h2>Friends 🐾</h2>
              ${renderPlayerPets()}
              ${renderStrayFriends()}
              ${cloud && cloud.available ? renderFriendCode() : ''}
            </section>
          </div>
```

(If `cloud` is unavailable, only the stray-cats sub-group shows — matching today's behavior where player pets / friend codes are cloud-gated.)

- [ ] **Step 4: Verify.** Run `npx vitest run && npx vite build`. Full suite green, build succeeds. Confirm `renderFriendCode` is now referenced only from the Friends section (grep for stray duplicate calls).

- [ ] **Step 5: Commit**

```bash
git add src/ui/homebase.js
git commit -m "feat: consolidate home base social into one Friends section"
```

---

## Plan Self-Review Notes

- **Spec coverage:** sticky hero + Start → T2 (`.hb-hero`/`.hb-hero-start`); four tabs Play/Social/Album/Settings → T2 panels; active-tab persistence across render() → T2 (`activeTab` + `resolveTab` + `applyActiveTab`, called at the end of every render()); Social consolidation into one Friends section with Player-pets + Stray-cats sub-groups → T3; pure helper unit-tested → T1; XSS escaping preserved → sections moved verbatim, no `escapeHtml` removed; async roster still fills → `#player-pets-roster` id preserved in T2/T3, `loadPlayerPets()` call retained.
- **Type/name consistency:** `activeTab` / `resolveTab` / `HOME_TABS` used consistently across T1–T2; `data-tab` (buttons) vs `data-panel` (panels) matched in `applyActiveTab`; `#player-pets-section` / `#player-pets-roster` ids unchanged so `loadPlayerPets()` and the `hide-player` handler keep working.
- **Handler safety:** all interactive handlers are delegated on `root` (verified: `btn-start`, `btn-reset`, `wt-*`, `friend-code-*`, `sync-*`, `hide-player`, buy/equip via `data-action`, volume `input`, checkboxes), so relocating their markup into panels/hero does not detach them. The new tab-switch branch uses `e.target.closest('.hb-tab')` and returns early, before the id checks.
- **No unit tests for DOM:** home base has no DOM test harness (node env, no jsdom); T2/T3 are browser-verified + covered by build/suite-green and the T1 helper test. The controller runs the browser verification (hero visible without scroll; each tab isolates its sections; active tab survives a buy/equip re-render; solo vs MP both render).
- **Fuzzy step:** T2 Step 2 asks to move section markup "verbatim" into panels; the exact current markup is reproduced in the plan so the implementer transcribes rather than reinvents.
