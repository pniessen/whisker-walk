# Whisker Walk v8 — "Say Hi" (In-Game Chat) — Design Spec

**Date:** 2026-08-11
**Status:** Approved scope (user-selected)
**Base:** deployed multiplayer PWA (v7 "Always Online" is live). This wave adds
live player-to-player messaging during co-walks, requested by players.

## Summary

Players in the same co-walk can send each other short messages that appear as
**speech bubbles above the sending cat's head**. Messages are chosen from a
**curated catalog of phrases + emotes** — there is no free-text input. Chat is
**ephemeral** (lives only for the duration of the walk; nothing is stored) and
**co-walk-only** (no chat in solo walks or with AI ghost visitors).

## Design decisions (locked during brainstorming)

1. **Messaging model:** live co-walk chat only — ephemeral, rides the existing
   Supabase Realtime room broadcast channel. **No new database tables or RPCs.**
2. **Composition:** curated phrases + emotes, no free text.
3. **Presentation:** world-space speech bubbles over the cat, not a text-log panel.

## The keystone — the wire never carries user text

Players send a **phrase ID (an enum)**, never words. A shared catalog maps each
ID to its display text; peers render the text from their own copy of the
catalog. The broadcast payload is `{ phraseId: 'nice_cat' }`.

Consequences:
- A malicious or modified client **cannot inject arbitrary text** through chat —
  an unrecognized `phraseId` is rejected on receipt, exactly as the existing
  `isValidStateMsg` / `isValidEventMsg` / `messageSizeOk` guards in `net.js`
  already reject malformed state/event messages.
- No user-authored content exists anywhere in the system, so there is **no
  profanity filter, PII scrubbing, moderation queue, or reporting flow to
  build** — the safety property is structural, not policed.

This is the safety cornerstone; every other feature depends on it.

## Features

### 1. Phrase catalog (`src/chat.js`)

- `PHRASES`: an ordered map of `id → { text, kind }` where `kind` is `'phrase'`
  or `'emote'`. Starter set (final wording tweakable in implementation):
  - Phrases: `hi` "Hi! 👋", `follow` "Follow me!", `nice_cat` "Nice cat! 😻",
    `play` "Wanna play?", `here` "Over here!", `good_walk` "Good walk!",
    `brb` "Brb 🐟", `boop` "Boop? 👉👈", `zoomies` "Zoomies!!", `bye` "Bye! 👋"
  - Emotes (tap-only, render as a large glyph in the bubble): `love` ❤️,
    `happy_cat` 😻, `paw` 🐾, `sparkle` ✨, `fish` 🐟, `laugh` 😹
- `isValidChatMsg(payload)`: returns true only for `{ phraseId }` where
  `phraseId` is a known catalog key and the object has no other meaningful
  fields; false for anything else (unknown id, non-string, extra payload,
  oversized). Pure, unit-tested.
- `createChatRateLimiter({ perMs, now })`: a small stateful helper with
  `allow(senderId)` → boolean, enforcing a minimum interval per sender.
  Pure/injectable clock, unit-tested.

### 2. Input UI (`src/ui/chatwheel.js`)

- A **💬 button** rendered only when the player is in a co-walk room
  (`MP && in-room`); hidden in solo walks, home base, and ghost visits.
- Tapping it opens a **phrase tray**: a grid of the catalog entries, one tap to
  send. Closes on selection or on tapping outside. Identical interaction on
  desktop (click) and mobile (tap) — no keyboard involved.
- Positioned to coexist with the existing touch UI layer without overlap
  (respects the left-handed-mode mirroring from v7 settings).

### 3. Speech bubbles (`src/chatbubble.js`)

- Renders a rounded speech bubble above a cat, built with the same
  `CanvasTexture` sprite technique as `src/nametag.js` (`makeNameTag`).
- **Billboard:** always faces the camera. Anchored above the cat's head,
  slightly higher than the name tag so both are legible.
- **Lifetime:** fades out after ~3.5s. A cat shows **one bubble at a time** — a
  new message replaces the current one.
- Emote entries render as a single large glyph; phrase entries render their text.

### 4. Send / receive wiring (`src/main.js`, `src/net.js`)

- `net.js`: add `'chat'` to the accepted broadcast kinds with validation via
  `isValidChatMsg`; invalid chat messages are dropped (consistent with existing
  message validation).
- **Send:** on phrase selection → show the bubble over the local player's own
  cat immediately (instant feedback), then `net.send('chat', { phraseId })`.
  A client-side cooldown (~1.5s) prevents self-spam.
- **Receive:** `onBroadcast('chat', …)` → render the bubble over that sender's
  remote-pet model, subject to: rate limiter, per-walk mute set, persistent
  blocklist, and the `hideChat` setting. Unknown/rate-limited/muted messages
  are silently ignored.

### 5. Comfort controls

- **Mute:** the in-walk co-walk roster gains a 🔇 toggle that silences a
  player's bubbles for the remainder of the walk (in-memory set — ephemeral,
  matching chat's lifetime). Players on the persistent per-device blocklist
  (`src/blocklist.js`) are auto-muted.
- **Settings:** a "Hide chat bubbles" toggle added to Settings ⚙️
  (`whisker-walk-settings`, `hideChat` default `false`), applied live.

## Testing

- Unit (Vitest, matching existing style): catalog integrity; `isValidChatMsg`
  accepts every known id and rejects unknown ids, non-strings, extra fields, and
  oversized payloads; rate-limiter interval behavior; mute/blocklist/hideChat
  filtering logic.
- `net.js` chat-kind validation test alongside the existing state/event tests.
- End-of-wave live two-player smoke test via the node bot (same pattern as the
  v5/v7 multiplayer waves): one client sends each phrase id; the other confirms
  a bubble is triggered and an unknown id is dropped.

## Out of scope for v8

- Async / offline messaging to friends (a persistent inbox) — deferred; would
  require new tables, RPCs, and stored-content moderation.
- Free-text chat of any kind.
- Chat with AI ghost visitors (they are not live players).
- Message history / logs / notifications.

## Security & privacy notes

- No new server surface: chat is broadcast-only over the existing room channel;
  no tables, RPCs, or persisted data are added.
- The phrase-ID enum design means the chat channel carries no free-form strings,
  so it is not an XSS or content-injection vector. Bubbles still render through
  the same escaped/canvas path as name tags (defense in depth).
- Nothing about chat is written to localStorage except the `hideChat` boolean.
