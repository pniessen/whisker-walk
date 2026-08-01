# Whisker Walk v7 "Always Online" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cloud save sync, pet profiles + persistent player friendships, ghost visits, PWA install, settings.

**Spec:** `docs/superpowers/specs/2026-08-01-whisker-walk-v7-online.md`. Database is LIVE: tables `saves/profiles/friendships` + RPCs `upsert_save/load_save/upsert_profile/record_friend_greet` per `docs/supabase-setup.sql` (already run by the user — do not modify the SQL contract; the client must match it).

## Global Constraints

- All online features gate on the existing `MP` env flag and degrade silently when offline/unconfigured; solo-local play never regresses.
- Capability model: `playerSecret` (crypto-random, localStorage `whisker-walk-secret`, generated beside playerId) authorizes profile/friendship writes; the save code authorizes save access. NEVER log or render secrets.
- Save codes: `WORD-WORD-WORD-NN` from a 256-word safe list (≈27 bits) — the stored `secret` column does the real protecting; the code is the address. Case/format-normalized on input.
- RPC calls via `supabase.rpc(name, args)` using the SAME dynamically-imported client the realtime transport uses (share one `getClient()` in net.js — refactor allowed).
- Cloud writes send `lifetime = state.lifetimePoints`; treat RPC result strings (`created/updated/stale/denied`) per spec (stale → prompt user).
- Friend code = first 10 chars of playerId; lookup via `profiles` public select with a `like` prefix match.
- Tests + `npx vite build` green every commit. Baseline: 119 tests.

---

### Task 1: cloud.js — RPC client, codes, secrets

**Files:** create `src/cloud.js`; modify `src/net.js` (extract shared `getSupabaseClient(url, key)`); test `test/cloud.test.js`.

**Interfaces:**
- `generateSaveCode(rng?)` → `PLUM-OTTER-CROW-42` style (3 words from an embedded 256-word list + 2 digits); `normalizeSaveCode(input)` (trim/upper/hyphen-normalize); `getOrCreateSecret(storage)` (crypto.randomUUID×2 concat; storage-guarded).
- `createCloud(rpc)` where `rpc(name, args) -> Promise<data>` is injectable (fake in tests; real = supabase client's `.rpc` unwrapped, throwing on error):
  - `saveToCloud(code, secret, payload, lifetime)` → `'created'|'updated'|'stale'|'denied'`
  - `loadFromCloud(code)` → `{payload, secret, lifetime} | null`
  - `pushProfile(profile)` → `'ok'|'denied'` (args mapped to p_-prefixed RPC params)
  - `recordGreet(myId, mySecret, otherId, walkStamp)` → greets int (-1 denied)
  - `fetchProfiles(playerIds)` and `findByFriendCode(prefix)` → public selects on `profiles` (injectable `select` fn beside rpc: `createCloud({rpc, select})`).
  - `fetchFriendships(myId)` → rows where a_id or b_id = myId (public select).
- TDD ≈8 tests with fakes: code format/normalization, secret persistence, arg mapping (p_ prefixes exact), result passthrough, friend-code prefix query shape.
- After unit green: **live smoke test from node** (like v5 precedent, env from .env.local): create→load→update→stale→denied cycle against the real `saves` table with a throwaway code; profile upsert + wrong-secret denial; record_friend_greet dedupe per walk. Print results in the report (never print secrets).
- Commit: `feat: cloud RPC client with save codes and capability secrets`

### Task 2: Cloud save sync UI + auto-sync

**Files:** modify `src/ui/homebase.js`, `src/main.js`, `src/progression.js` (export a `serialize()/replaceState(payload)` pair for full-save transfer including album? album lives separately — payload = `{save, album, settings?}` composed in main), `src/style.css`; extend progression tests for replaceState.

- Home base **Sync ☁️** section (MP-gated): unlinked → "Save to cloud" (generates code, uploads, shows the code BIG with "write this down"), "Load from cloud" (code input → preview both saves' rank/points/bestWalk → confirm overwrite → replaceState + reload UI). Linked (localStorage `whisker-walk-cloudcode`) → status line "☁️ synced as PLUM-OTTER-CROW-42 · after every walk", Unlink button, manual Sync-now.
- Auto-sync: after `endWalk` summary continue (and after shop purchases), fire-and-forget `saveToCloud` when linked; 'stale' → toast prompting manual resolution in Sync section (side-by-side compare, choose keep-cloud or push-mine — push-mine allowed via a `force` … NO force in RPC contract; resolution = load cloud OR accept stale-block until local lifetime exceeds; display explanation. Keep simple per spec.).
- replaceState: validates payload version (accepts v2/v3 via existing migration path — reuse the loader logic by writing payload to storage then re-running createProgression; simplest correct approach: `progression.replaceFromPayload(payload)` writes raw to storage and reloads state via the existing load path, then homebase re-renders).
- Commit: `feat: cloud save sync with linkable save codes`

### Task 3: Profiles + persistent player friendships

**Files:** modify `src/main.js`, `src/ui/homebase.js`.

- Push profile: on room host/join and on cloud link (walk-together already collects petName): `cloud.pushProfile({playerId, secret, petName, breed: equipped.cat, accessories, rankTitle})`, and refresh after each walk while linked/named.
- Boop persistence: in `completeBoop`, alongside the local award, `cloud.recordGreet(session.playerId, secret, otherId, session.walkStamp)` fire-and-forget; toast level-ups on returned greets hitting 1/3/6 (`{name} is now your FRIEND across walks! ♥`).
- Roster: home base Cat friends section gains **"Player pets 🐾🐾"** subsection: `fetchFriendships(myId)` + `fetchProfiles` → rows with hearts (1/3/6 ladder), pet name, breed, last-seen ("2h ago"). Async render (section shows "loading…" then fills; errors → quiet omission).
- Commit: `feat: persistent cross-walk player friendships`

### Task 4: Ghost visits + friend codes

**Files:** create `src/ghosts.js`; modify `src/main.js`, `src/ui/homebase.js`; test `test/ghosts.test.js`.

- `rollGhosts(rng, friends)` pure: each friend (greets ≥1) rolls < 1/3; cap 4 ghosts. TDD.
- `createGhosts(scene, area, profiles, rng)`: builds each pet via `buildCat(breed, accessories, {simple:true})` at 0.5 opacity (traverse materials: `transparent=true, opacity=0.5`), name tag "{petName} 👻", stray-style wander (reuse straycats FSM via extraction OR minimal own wander — reuse `createStrayCats`' wander by instantiating with a custom list? simplest: ghosts.js implements the same small wander loop; acceptable duplication ~40 lines).
- Solo `startWalk` (not in rooms): when MP && friendships exist, async-fetch then spawn ghosts (they can pop in a second after walk start — fine); greet prompt "touch noses with {petName} 👻" → local `friend` award + `cloud.recordGreet` (same pair dedupe per walk) ; best-friend (greets ≥6) ghosts: 30% gift on first approach (reuse gift award).
- Friend codes: home base input "Add a friend by code" → `findByFriendCode` → confirm card (pet name/breed) → immediately `recordGreet` once (starts 'met') → roster refresh. Your own code shown beside it (first 10 of playerId, styled as `CAT-${prefix}`? plain prefix fine).
- Commit: `feat: ghost visits from befriended pets and friend codes`

### Task 5: PWA install

**Files:** create `public/manifest.webmanifest`, `public/sw.js`, `public/icons/icon-192.png`, `public/icons/icon-512.png` (generate: node script using the thumbnail renderer is heavy — instead create simple flat PNG icons via a tiny node canvas-free approach: write SVG icons and ALSO reference SVG in manifest (supported broadly) — provide `icon.svg` (cozy flat cat silhouette on the game's navy background, hand-authored SVG) plus PNGs rendered from it via `npx @squoosh/cli`? No new deps: hand-write SVG only, manifest accepts SVG for modern Chrome/Android; iOS needs PNG apple-touch-icon — generate the two PNGs with a one-off node script using no deps? Not possible without a rasterizer. PRAGMATIC: commit SVG icon + use it in manifest; add `apple-touch-icon` pointing at a 180px PNG generated ONCE by the implementer via the running browser (canvas toDataURL → save) and committed as a binary. Implementer judgment allowed; report what was done.); modify `index.html`, `vite.config.js` (copy public/ handled by vite automatically), `src/main.js` (SW registration, base-aware).

- Manifest: name/short_name "Whisker Walk", start_url & scope "." (base-relative), display standalone, background/theme `#1c2431`, icons.
- SW (~40 lines, hand-written): install → precache `['.', 'index.html']` + hashed assets discovered at runtime via cache-first-with-network-fallback on same-origin GETs (simple runtime caching, versioned cache name bumped by build hash unavailable → use a constant + network-first for index.html to pick up deploys, cache-first for hashed /assets/). Register in main.js `if ('serviceWorker' in navigator && import.meta.env.PROD)` with the correct base path.
- Verify: build + `vite preview`, check manifest/SW load, Lighthouse-style manual checks (installable criteria).
- Commit: `feat: PWA manifest and offline app shell`

### Task 6: Settings + release

**Files:** create `src/settings.js` (load/save/defaults, TDD ~4 tests); modify `src/ui/homebase.js` (Settings ⚙️ section: volume slider, invert Y, left-handed, reduced motion; move Start-over here), `src/audio.js` (master volume factor), `src/player.js` (invert Y), `src/ui/touchui.js` (mirrored zones when left-handed), `src/weather.js`/`src/main.js` (reduced motion: skip rain particles + walk bob), `README.md`.

- Settings persisted at `whisker-walk-settings`; applied live (no reload).
- Full regression; emulated-mobile spot-check of left-handed mirroring; final whole-branch review (most capable model) + fix wave per SDD; merge gate with user; deploy; post-deploy: verify PWA installability from the live URL and cloud sync round-trip between the controller's node client and the deployed site.

## Plan Self-Review Notes

- SQL contract is fixed/live — Task 1's live smoke test is the guard against client/contract drift.
- Ghost fetch is async-after-walk-start by design (pop-in accepted). Rooms and ghosts are mutually exclusive (ghosts solo-only).
- PWA icon rasterization is the one fuzzy step — implementer latitude granted, must report the approach.
- Settings touch many modules shallowly; the final review must diff for missed `Math.random`-in-seeded-walk or engagement-gate regressions like prior waves.
