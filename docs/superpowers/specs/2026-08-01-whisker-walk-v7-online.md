# Whisker Walk v7 — "Always Online" — Design Spec

**Date:** 2026-08-01
**Status:** Approved scope (user-selected); awaiting Supabase table setup
**Base:** deployed multiplayer mobile game. Wave 7 of the user-selected
enhancement set: cloud saves, ghost visits, persistent player friendships,
PWA install, settings. (Wave 8 — co-walk verbs + charm pack — follows in
its own spec.)

## Identity & security model (no accounts, capability-based)

Every player already has a `playerId` UUID in localStorage. v7 adds a
client-generated high-entropy `playerSecret` beside it. All writes go
through Postgres **SECURITY DEFINER RPC functions** that validate the
secret (or, for saves, a save-code that IS the capability). The
publishable key + RLS deny all direct table writes; reads are limited to
what ghosts/friendships need. No emails, no passwords, no auth flow.

## Features

### 1. Cloud save sync

- Home base gains **"Sync ☁️"**: *Save to cloud* uploads the full save +
  album under a generated, human-readable **save code** (e.g.
  `PLUM-OTTER-CROW-42`, ~40 bits + secret suffix stored locally);
  *Load from cloud* with a code pulls it onto this device (with a
  confirm-overwrite step showing both saves' rank/points/best-walk).
- Auto-sync after each walk when a code is linked. Conflict rule: cloud
  write wins only if its `lifetimePoints` ≥ the stored row's (monotonic
  stat — prevents an old device clobbering progress); otherwise prompt.
- Solves the current phone-vs-desktop split save.

### 2. Pet profiles + persistent player friendships

- On any online action, the client upserts its **pet profile** (petName,
  breed, accessories, rank title, lastSeen) via RPC.
- **Boops persist**: a confirmed co-walk boop calls the friendship RPC —
  same 1/3/6 ladder as stray cats (met ♡ / friend ♥ / best friend 💕),
  keyed by the unordered player pair, one increment per pair per walk.
- Home base **Cat Friends** roster gains a "player pets" section with
  friendship hearts and last-seen.

### 3. Ghost visits 👻 (occasional, per user choice)

- At solo walk start, fetch profiles of befriended player pets; each has
  a **1-in-3 roll** to appear as a ghost: their real model + accessories
  + name tag, wandering on stray AI, slightly translucent.
- Greeting a ghost counts a friendship greet (once per walk per pet) and
  awards `friend` points. Best-friend ghosts may carry a gift (+10,
  reusing the gift flow).
- **Friend codes**: your pet's shareable code (short hash of playerId)
  can be entered at home base to befriend someone you've never co-walked
  with (starts the ladder at "met").

### 4. PWA install

Web app manifest (icons generated from the cat model thumbnails), theme
color, standalone display; service worker with cache-first app-shell so
solo play works offline (network features degrade gracefully — the
existing MP gating already handles it). Update flow: SW takes over on
next launch; no custom UI.

### 5. Settings ⚙️

Home base section: master volume slider, mute toggle (syncs with M),
invert camera Y, left-handed mode (joystick zones mirrored), reduced
motion (disables rain particles + screen bob), reset save (existing
button moves here). Stored in localStorage `whisker-walk-settings`.

## Database setup (user runs once in Supabase SQL editor)

Three tables + four RPCs; the SQL is provided in the setup snippet
(docs/supabase-setup.sql). Tables: `saves(code pk, secret, payload jsonb,
lifetime int, updated_at)`, `profiles(player_id pk, secret, pet_name,
breed, accessories jsonb, rank_title, last_seen)`, `friendships(pair pk,
a_id, b_id, greets int, last_walk text, updated_at)`. RLS: select allowed
on profiles/friendships (public data), denied on saves (RPC-only); all
writes via `upsert_save`, `load_save`, `upsert_profile`, `record_friend_greet`
SECURITY DEFINER functions validating secrets/codes.

## Out of scope for v7

Leaderboards/photo wall (later), co-walk verbs + charm pack (v8),
account recovery beyond save codes, moderation tooling.

### Known limitation — unilateral friendships

`record_friend_greet` validates the CALLER's own identity (`p_my_id` +
`p_my_secret`) but never validates `p_other_id` — any client that knows
(or guesses/enumerates) another player's `playerId` can drive greets
against them, including via the friend-code flow, with no consent step
on the victim's side. Those greets surface as uninvited ghost visits
(`spawnGhosts`) and Player pets roster rows on the victim's own device.

v7 mitigates the symptom client-side only: home base's Player pets
roster lets a player hide any visitor (✕ button), which adds that
`playerId` to a per-device `whisker-walk-blocked` set (see
`src/blocklist.js`) and filters it out of both the roster and future
ghost spawns on that device. This does not stop the greet from being
recorded server-side, and does not protect a different device/browser
signed in as the same victim. Server-side moderation and rate-limiting
of `record_friend_greet` are deferred to v8.
