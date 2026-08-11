# Whisker Walk v9 — "Home Base, Tidied" — Design Spec

**Date:** 2026-08-11
**Status:** Approved scope (user-selected)
**Base:** deployed multiplayer PWA (v8 in-game chat is live). This wave
restructures the home base screen, which has accumulated one section per
prior wave and become a long, cluttered single scroll.

## Problem

`src/ui/homebase.js` renders the entire home base as one flat `innerHTML`
pass with ~11 stacked sections, and the primary call to action — **Start
the walk** — sits at the very bottom, below every selector, roster, and
settings block. Three overlapping social blocks ("Cat friends", "Player
pets", "Friend codes") plus "Walk together" repeat two identical `🐾🐾`
headers. Account/system controls (Sync, Settings, Start over) are inline
with gameplay. On mobile this is a long, disorienting scroll.

## Solution: persistent hero + tabbed panels

Reorganize the home base DOM (not its behavior) into a persistent hero
zone plus a tab bar with four focused panels. This is a **reorganization
and light consolidation**, not a rewrite: every existing handler, flow,
and safety property is preserved.

### Persistent hero (always visible, above the tabs)

- Equipped cat's thumbnail + pet name (or cat style name if unnamed) and
  the rank/points line (moved out of the scroll).
- The **Start the walk 🐾** button, pinned here, retaining all current
  room-aware states: normal "Start the walk 🐾", host "Waiting for host…"
  (disabled), and joined-guest states exactly as today.
- The hero does not scroll away with the panels (sticky within the home
  base container).

### Tab bar — four tabs

1. **Play 🎽** (default active): "Your cat", "Accessories", "Where to?" —
   the pre-walk loadout cards, unchanged.
2. **Social 🐾**: "Walk together" (host/join + pet-name gate + your
   shareable friend code) at top, then one **Friends** section containing
   two clearly labeled sub-groups under a single header — **Player pets**
   (players, with last-seen + hide ✕, the async roster) and **Stray cats**
   (strays, with greet hearts) — kept as distinct sub-lists because they
   carry different metadata, then the "Add a friend by code" input. The
   two duplicate `🐾🐾` section headers collapse into this one Friends
   header.
3. **Album 📸**: the photo grid, unchanged.
4. **Settings ⚙️**: the five toggles (volume, invert-Y, left-handed,
   reduced motion, hide chat), the **Sync ☁️** section, and **Start over**.

### Tab behavior

- Switching tabs shows/hides panels client-side; no reload, no walk
  restart, no server calls triggered by switching.
- `render()` currently rebuilds the whole `innerHTML` on nearly every
  interaction (buy/equip/room/sync changes). The **active tab must persist
  across those re-renders** — stored in the module-scoped section-state
  block alongside the existing sync/friend-code/player-pets state, so a
  buy or equip doesn't bounce the user back to the default tab.
- Default tab on first open of a session is **Play**.

## Invariants preserved (must not regress)

- **All existing behavior:** buy/equip/unequip, area select, host/join,
  pet-name gating (`hasValidPetName`), sync save/load/overwrite-confirm
  flow, friend-code add flow, the async Player-pets roster render (the
  `playerPetsToken` re-entrancy guard and the after-render async hook),
  settings toggles applied live via `onSettingsChange`, reset-save.
- **XSS safety:** every server-derived / untrusted string stays escaped
  via `escapeHtml` at its render site (pet names, breeds, album labels,
  friend names, room codes, sync preview). No new unescaped interpolation.
- **MP gating:** Social/Sync features remain gated on `MP` / `sync.available`
  and degrade silently when offline/unconfigured; solo-local play is
  unaffected.
- **The primary flow still works:** pick cat/accessory/area in Play →
  Start (always visible) launches the walk.

## Out of scope

- No new gameplay, no new social/network features, no copy rewrites
  beyond removing the duplicated headers and relabeling the merged
  Friends list.
- No change to `main.js` walk logic, `net.js`, or any backend/SQL.
- Modal/drawer navigation (the alternative that was not chosen).

## Testing

- Home base is DOM UI, verified in the browser like the rest of
  `homebase.js` (no unit test suite for it today). Verification: build +
  full existing suite stay green; browser check that (a) the hero + Start
  are visible without scrolling, (b) each tab shows only its sections,
  (c) the active tab survives a buy/equip re-render, (d) solo vs MP both
  render correctly, (e) left-handed and reduced-motion unaffected.
- Any pure helper extracted during the refactor (e.g. an active-tab
  resolver) gets a small unit test.
