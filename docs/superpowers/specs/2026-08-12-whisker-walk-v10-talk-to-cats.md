# Whisker Walk v10 — "Talk to the Cats" — Design Spec

**Date:** 2026-08-12
**Status:** Approved scope (user-selected)
**Base:** deployed multiplayer PWA. Built on top of the logo-branding branch
(B1 icon, C1 hero wordmark, A2 boot splash), so this wave ships branding +
feature together in one deploy.

## Summary

Three related additions, one combined wave:

1. **Keyboard chat controls** — chat is currently reachable only by tapping
   the 💬 button, but a desktop walk holds **pointer lock** (cursor hidden,
   mouse drives the camera — `src/player.js:147` only rotates while
   `api.locked`), so the button is unreachable on a PC. Add number-key + `T`
   controls that work under pointer lock.
2. **Chat input in solo walks** — today the chat wheel/keys appear only in
   co-walks (`session.net`). Enable them in solo walks too, because there are
   AI cats to talk to.
3. **Talk to AI cats, get in-character replies** — send a curated phrase at a
   nearby AI cat; it answers with a personality-appropriate **canned** line
   as a speech bubble. Fully local — no free text, no LLM, no backend, no
   moderation, works offline.

## Design decisions (locked)

- **Reply engine: canned, in-character.** Each personality has a small pool
  of written lines; no LLM. Offline, free, safe, deterministic.
- **Which cats: all AI cats** — wandering strays and the named family cats
  (Zeetoo/keenNose, Rosa/fearless, Robbie/pouncer, Hagrid/bird), each in its
  own voice. (Villagers, if present as messageable NPCs, use a generic
  friendly pool.)
- **Friendship: a greeting counts, but capped.** A friendly *greeting*
  message counts as one friendship greet toward that cat, reusing the exact
  greet path booping uses and honoring the existing **per-walk "greeted" flag**
  — so chatting is an alternate way to greet a cat you meet, never a faster
  one (talking to an already-booped cat replies but adds no friendship).
  Emotes and farewells are pure flavor (no friendship effect).
- **Rollout: one combined wave**, including the pending logo branding, one
  deploy at the end.

## Features

### 1. Keyboard chat controls (works under pointer lock)

- **`1`–`9`, `0`** send the ten phrases by tray order (1 = first phrase … 0 =
  tenth). Works while pointer-locked — no cursor needed. This is the primary
  desktop path.
- **`T`** ("talk") toggles the phrase tray open; opening **releases pointer
  lock** (`document.exitPointerLock()`) so the cursor returns and the tray
  (and mute list) is readable/clickable.
- **`Esc`** closes the tray. Because browsers only grant pointer lock on a
  user gesture, closing does **not** force re-lock — it returns to the game's
  existing "click to resume look" state (the same lock-loss flow the game
  already uses when the player alt-tabs or pauses; `mousedown` re-acquires via
  the current handler). Sending a phrase by number key while locked never
  touches lock at all — that path needs no cursor.
- A brief on-screen **hint** when chat input first becomes available in a walk
  ("Press 1–9 to chat · T for more").
- All chat keys are gated to walks where chat input is active (see Feature 2)
  and do not collide with movement (arrows/space) or the existing `C`/`M`
  bindings. Number keys are ignored when a text input is focused (home base).

### 2. Chat input available in solo walks

- The chat wheel + keyboard controls become active whenever the walk has a
  **messageable target** — i.e. always in co-walks (players) and in solo walks
  when AI cats are present (effectively every walk). The 💬 button shows in
  solo walks now, not just co-walks.
- In co-walks, sending still broadcasts to players (v8) **and** can be aimed at
  a nearby AI cat for a reply. Ghost visitors are AI-driven and may reply like
  strays (reusing the same canned path).

### 3. Talk to AI cats + replies

- **Targeting:** a sent phrase is aimed at the nearest AI cat within a short
  range, reusing `strayCats.nearest(catP, range)` (the same query booping
  uses). Your phrase shows as a bubble over your cat; ~0.6s later the targeted
  cat replies with a bubble over its head (reusing `src/chatbubble.js`).
- **Replies (`src/catreplies.js`, new, pure):** maps
  `(personality, phraseIntent) → line`. Phrase intents bucket the catalog:
  `greeting` (Hi!, Over here!), `play` (Wanna play?, Zoomies!!), `compliment`
  (Nice cat!, Good walk!), `farewell` (Bye!, Brb), `emote` (❤️ 🐾 ✨ …), plus a
  `misc` fallback. Each of the 10 personalities has a short pool per intent
  (Hagrid answers in clucks — "Bwak?!"). Selection is seeded from the cat's id
  + phrase so a given cat's reply is stable within an interaction but varies
  across cats and messages. Pure and unit-tested.
- **Friendship nudge:** if the phrase intent is `greeting` and the target cat
  hasn't been greeted this walk (the existing per-walk flag), route it through
  the same greet/award path booping uses (one greet, same points/level-up
  toasts). Otherwise reply only, no friendship change.

## Safety, offline, cost

- Curated **both** directions (player picks a phrase; cat replies from a
  written pool) → the messaging channel carries no free-form text in either
  direction. No XSS surface, no moderation, no API cost, fully offline. This
  is the same safety posture as v8, extended to NPC replies.

## Reuse / new files

- **Reuse:** `chat.js` (phrase catalog), `chatbubble.js` (bubbles over cats),
  `chatwheel.js` (tray), the v8 send path, `strayCats.nearest`, the existing
  stray greet/award path + per-walk greeted flag.
- **New:** `src/catreplies.js` (intent bucketing + personality line pools +
  seeded selection); a small keyboard-input module or additions to the
  existing keydown handler for the chat keys; wiring in `src/main.js`
  (solo-walk enablement, nearest-cat targeting, reply emission, hint).

## Out of scope

- Free-text chat and any LLM/generative replies (explicitly declined).
- New multiplayer/server surface — none; all local.
- Conversation history/logs.

## Testing

- Unit (Vitest): `catreplies.js` — intent bucketing for every catalog phrase;
  every (personality × intent) returns a non-empty in-character line; seeded
  selection is deterministic for a fixed (catId, phrase) and varies across
  cats; Hagrid returns cluck-flavored lines. Keyboard mapping (number→phrase)
  is a pure function, unit-tested (and ignores presses when a text field is
  focused).
- Existing suite stays green; `npx vite build` green.
- Browser/screenshot verification of: keyboard send under pointer lock, `T`
  releasing lock + tray, a cat reply bubble, and the solo-walk 💬 button.
- Final whole-branch review (most capable model) + fix wave per SDD, then
  merge branding + feature together and deploy once.
