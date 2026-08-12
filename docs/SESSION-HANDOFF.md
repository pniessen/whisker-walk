# Whisker Walk — Session Handoff

> **Read this first.** This is the canonical orientation doc for future Claude
> Code sessions on this project. It captures what the game is, how it's built,
> what's shipped, the operational facts (URLs, backend, deploy), and where to
> look next. Specs and plans live in `docs/superpowers/{specs,plans}/`; this
> doc is the map to all of it.

**Last updated:** 2026-08-12 · **Branch:** `main` · **Tests:** 212 passing (29 files) · **Latest commit:** `92f99b3`

---

## 1. What this is

**Whisker Walk** — a third-person, "be the cat" 3D walking game. You *are* a
cat wandering cozy low-poly neighborhoods, meeting stray cats, collecting
discoveries, earning ranks, and (as of v7) co-walking with real friends,
keeping a cloud-synced save, and getting ghost visits from befriended pets.

- **Live site:** https://pniessen.github.io/whisker-walk/
- **Local dev:** `http://localhost:5173` (`npm run dev`)
- **Repo:** https://github.com/pniessen/whisker-walk
- Started as "first-person cat *walking* (you hold the leash)"; pivoted early
  on user feedback to **third-person "be the cat."** That framing is load-bearing
  — the camera follows the cat; the player controls the cat directly.

## 2. Tech stack & architecture

- **Vite + Three.js + Vitest**, vanilla ES modules, **no framework**.
- Procedural **low-poly 3D**: flat-shaded `MeshLambertMaterial`, hand-built
  geometry. No external model files — every cat/prop is built in code
  (`src/cat/model.js`).
- **Third-person follow camera**; orbit drag to look around.
- **Deterministic seeded worlds:** injected RNG (`mulberry32` / `seedFromCode`
  in `src/rng.js`) so a given seed/room code produces the same world. Never use
  bare `Math.random()` inside seeded walk generation — reviewers have caught
  this regression before; thread the injected RNG through.
- **Multiplayer is serverless:** Supabase Realtime (broadcast + presence
  channels) is the *entire* relay — no custom game server. Persistence (saves,
  profiles, friendships) is Supabase Postgres reached only through
  `SECURITY DEFINER` RPCs. Capability-based security, no accounts.
- **PWA:** manifest + service worker (network-first HTML, cache-first hashed
  assets, never intercept cross-origin Supabase). Boots offline for solo play.
- **Deploy:** GitHub Actions → GitHub Pages at base path **`/whisker-walk/`**.
  Build injects `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from repo secrets.

### Key source files

| File | Responsibility |
|------|----------------|
| `src/main.js` | Game orchestration: walk lifecycle, ghost spawning, boop/greet flow, home-base wiring, SW registration |
| `src/net.js` | Supabase client (shared memoized dynamic import), realtime transport, fake hub for tests |
| `src/cloud.js` | `createCloud({rpc,select})` — save/load/profile/greet/friend-code RPC client; `generateSaveCode`, `getOrCreateSecret` |
| `src/progression.js` | Save state, `sanitizeState` (hostile-payload hardening), `summarizeSaveForPreview`, RANKS, save version **3** |
| `src/album.js` | Photo album + `sanitizeAlbumPayload` (drops non-`data:image/` thumbs, caps sizes) |
| `src/blocklist.js` | Per-device block set for unwanted ghost visitors |
| `src/settings.js` | `createSettings(storage)` — volume/mute/invertY/leftHanded/reducedMotion |
| `src/ghosts.js` | `rollGhosts` (pure), ghost model spawning for solo walks |
| `src/cat/model.js` | `buildCat(breed, accessories, opts)` + `buildChicken` (Hagrid) |
| `src/cat/brain.js` | `PERSONALITIES` (10 entries incl. family pets) |
| `src/ui/homebase.js` | Home base: Sync ☁️, Player pets roster, friend codes, Settings ⚙️ — **all server strings escaped** |
| `docs/supabase-setup.sql` | **LIVE DB contract** — see §4 |

## 3. Feature waves (all shipped, merged, deployed)

The game was built in successive waves via the **superpowers SDD pipeline**
(brainstorm → spec → plan → fresh implementer subagent per task → per-task
review → whole-branch final review → fix waves). Each wave has a spec + plan
in `docs/superpowers/`.

- **v1** — core: be-the-cat, arrow-key movement, wandering interactive stray cats, cat/accessory/location selectors, starter unlocks.
- **v2 "Spice"** — more interactivity, richer cat graphics, menu thumbnails for each cat style and accessory.
- **v3 "Cat Life"** — goals, summary screen, ranks, always-on control reminders, 10× more cats with varied interactions.
- **v4 "Real Game"** — progression depth, discovery currency, quests/events. (Test baseline ~79→119.)
- **v5 "Co-Walks"** — live multiplayer co-walking via Supabase Realtime; pets are *named* (not "players"); occasional ghosts. Family pets added: **Zeetoo** (tabby), **Rosa** (tux), **Robbie** (cow cat), **Hagrid** (a chicken). Two-player boop acceptance test passed live.
- **v6 "Mobile"** — mobile-friendly: virtual joystick (lower-LEFT thumb), orbit drag (right side), touch engagement model, coarse-pointer perf tuning.
- **v7 "Always Online"** — cloud saves, persistent friendships, ghost visits, PWA, settings — see §5.
- **v8 "Say Hi"** (latest) — live in-game chat during co-walks. Curated phrase/emote tray (💬 button), speech bubbles over cats (`src/chatbubble.js` mirrors `nametag.js`), per-player mute + `hideChat` setting. **Safety keystone: only a phrase-ID enum crosses the wire** (`src/chat.js` catalog; `net.js` `chat` broadcast kind) — no free text, so no moderation surface. Files: `src/chat.js`, `src/chatbubble.js`, `src/ui/chatwheel.js`, chat wiring in `src/main.js`. Spec/plan: `docs/superpowers/{specs,plans}/2026-08-11-whisker-walk-v8-chat.md`. **Lesson:** the live Supabase transport must subscribe to every broadcast kind `createNet.handleBroadcast` handles — the final review caught `chat` missing from `createSupabaseTransport.join` (unit tests passed because the fake hub is kind-agnostic). Verify multiplayer wire changes with a live two-client round-trip, not just unit tests.
- **v9 "Home Base, Tidied"** — the home base became a sticky hero (cat wordmark + rank + Start) over four tabs: **Play / Social / Album / Settings** (`src/ui/hometabs.js` + restructured `src/ui/homebase.js`). Consolidated the three social blocks into one Friends section. Reorganization only — all handlers/escaping preserved.
- **Logo branding** — B1 refined-face app icon (`public/icon.svg`), C1 wordmark lockup as the home base hero title (`homebase.js`), A2 chibi mascot as a boot splash (`index.html` `#splash` + fade script, fallback timeout so it can't trap the player). Shipped with v10.
- **v10 "Talk to the Cats"** (latest) — message a nearby AI cat with a curated phrase, get a personality-appropriate **canned** reply as a speech bubble (`src/catreplies.js`, pure `(personality,intent)→line`, all 10 voices incl. Hagrid clucks). Greetings count one **capped** friendship greet (shared `awardStrayGreet`, `stray.greeted` guard — never out-farms booping). **Keyboard chat** (`src/chatkeys.js` + `main.js` keydown): number row `1`–`0` sends *under pointer lock* (fixes desktop-unusable chat — the 💬 button was unreachable with the cursor captured), `Enter` opens the tray (releases pointer lock), `Esc` closes; chat now works in **solo** walks too. **Lesson:** the reply seed must be numeric — `session.walkStamp` is the STRING `'walk-<ms>'`, so `string + number` fed `pick()` `NaN>>>0=0` and made every same-breed cat reply identically; fixed with `seedFromCode(walkStamp)+hashName(name)`. Known limitation: named-cat voices (zeetoo/rosa/robbie/hagrid) aren't reachable in-game yet (strays spawn the 6 base breeds; ghost-reply wiring is a future follow-up).

## 4. Backend — the LIVE Supabase contract ⚠️

**`docs/supabase-setup.sql` is already run against the live database.** The
user pasted it into the Supabase SQL editor and it succeeded ("Success. No
rows returned"). **Do NOT change this SQL contract without the user
re-running it** — the client in `src/cloud.js` is written to match it exactly.
Task 1 of any backend change should re-run the live smoke test (create → load
→ update → stale → denied) as the guard against client/contract drift.

- **Supabase project URL:** `https://axanxrcuqiqjvrlrkfdy.supabase.co`
- **Publishable (anon) key:** `sb_publishable_voYPq9a0tLxUhs2TxxGDwg_0641bAuN`
  (safe to expose — this is the public key; RLS + RPCs do the protecting).
- The database **password was never shared with Claude** and never should be.

**Tables:** `saves(code pk, secret, payload jsonb, lifetime, updated_at)`,
`profiles(player_id pk, secret, pet_name, breed, accessories, rank_title, last_seen)`,
`friendships(pair pk, a_id, b_id, greets, last_walk, updated_at)`.

**RPCs (`SECURITY DEFINER`):** `upsert_save`, `load_save(p_code,p_secret)`
(the code alone is the read capability; `p_secret` param exists but is unused
server-side), `upsert_profile`, `record_friend_greet(p_my_id,p_my_secret,p_other_id,p_walk)`
(returns `-1` on denied/no-profile).

**Security model:** capability-based, no accounts. `playerSecret` (localStorage
`whisker-walk-secret`) authorizes profile/friendship writes; the save code
authorizes save access. RLS denies all direct table writes; profiles/friendships
have public column-scoped reads; saves are RPC-only. **Never log or render secrets.**

**Known limitation (documented in v7 spec §"unilateral friendships"):**
`record_friend_greet` validates only the *caller's* identity, not `p_other_id`
— so someone who knows/guesses your `playerId` can drive greets against you,
surfacing as uninvited ghost visits. v7 mitigates client-side only: the Player
pets roster has a ✕ that adds the id to a per-device blocklist
(`src/blocklist.js`), filtering it from the roster and ghost spawns. **Real
fix (server-side moderation + rate-limiting) is deferred to v8.**

## 5. v7 "Always Online" — what shipped this session's context

1. **Cloud save sync** — Home base **Sync ☁️**: *Save to cloud* mints a
   human-readable code (`PLUM-OTTER-CROW-42`, from a 256-word list); typing it
   on another device pulls the save. Auto-syncs after each walk once linked.
   Monotonic conflict rule: cloud write wins only if its `lifetimePoints` ≥
   stored — an old device can't clobber a newer save. **This solves the user's
   real phone-vs-desktop split-save problem.**
2. **Persistent player friendships** — co-walk boops call `recordGreet` and
   persist on the ♡→♥→💕 (1/3/6) ladder, keyed by unordered player pair, one
   increment per pair per walk. Home base gets a **Player pets** roster.
3. **Ghost visits 👻** — befriended pets roll ~1-in-3 to appear (translucent)
   in your *solo* walks; greeting counts a greet; best-friends may bear gifts.
   **Friend codes** (`CAT-<prefix>`) let you befriend someone you've never
   co-walked with.
4. **PWA install** — real add-to-home-screen, standalone, offline solo play
   (reviewer verified by killing the server and reloading).
5. **Settings ⚙️** — volume, mute (syncs with M), invert-Y, **left-handed mode**
   (mirrors touch layout), reduced motion. Applied live, no reload.

**Security work in this wave was substantial** — the reviews caught, before
anything reached the user: a malformed cloud payload that could brick a save,
**two separate stored-XSS holes** (one only found by the final whole-branch
review, on the path where sanitization ran *after* rendering), a greet-farming
exploit (Date.now stamp defeating dedup), and the consent gap above. Fixes:
`sanitizeState` structural merge + `escapeHtml` at every render site +
`sanitizeAlbumPayload` + `summarizeSaveForPreview` (coerce-then-escape) +
idempotent-per-pair friend adds + self-add guard + petName-gating + blocklist.
Every fix independently re-probed with hostile payloads.

## 6. How to work on this repo

- **Run:** `npm run dev` (localhost:5173). **Test:** `npx vitest run` (186 green).
  **Build:** `npx vite build`. **Preview prod:** `npx vite preview`.
- **Verify in-browser** with the Browser-pane tools (never Bash for dev
  servers). Reviewers have repeatedly found real defects only visible by
  actually running the flow — do the browser verification, don't just read code.
- **Follow the SDD pipeline for any new wave:** brainstorm → spec in
  `docs/superpowers/specs/` → plan in `docs/superpowers/plans/` → subagent-driven
  execution. The final whole-branch review (most-capable model) has earned its
  keep every wave — do not skip it. Keep the ledger in
  `.superpowers/sdd/<plan>/progress.md`.
- **Multiplayer live-testing:** there's a node bot pattern (used this session as
  "Claude the black cat") that joins a room via the Supabase transport with a
  `zzz-claude-` ME prefix so it never becomes host. Useful for two-player
  acceptance tests without a second physical device.
- **Gotchas that bit us before:**
  - Bare `Math.random()` inside seeded walk generation breaks determinism.
  - Overlay z-index: the pause `#overlay` must stack **above** the touch-UI
    layer (`z-index: 10` in `style.css`) or "tap to explore" silently does nothing.
  - Ghosts are **solo-only** — re-check `isHost` at Start so a ghost never leaks
    into a room.
  - Escape every server-derived string at the render site (defense in depth on
    top of sanitize).

## 7. Open threads / next steps

- **No pending build work.** v7–v10 + logos are complete, merged to `main`, deployed.
- **Phase 0 renderer upgrade — PLANNED, NOT BUILT.** The highest-leverage 3D-detail
  win (user's stated #1 priority for the game's look): shadows tuning + PBR
  materials + runtime asset-free IBL (`RoomEnvironment`+PMREM) + ACES tone mapping
  + subtle bloom + a mobile quality tier. Plan:
  `docs/superpowers/plans/2026-08-12-whisker-walk-phase0-renderer.md`; the broader
  tech-stack study it came from was saved to a scratchpad (not in repo). Note:
  shadows are ALREADY wired (PCFSoft) — the win is materials + lighting. Biggest
  risk: the global look re-calibration (Lambert→Standard+IBL+ACES) needs by-eye
  tuning across weather/areas — get the browser preview working or do tight
  before/after screenshots.
- **v10 follow-up:** wire ghost visitors into the reply path so the named-cat
  voices (zeetoo/rosa/robbie/hagrid) become reachable.
- **Backlog** (mentioned in specs, not yet requested to build): async/offline
  friend messaging (a persistent inbox — deferred from v8, needs tables + RPCs +
  stored-content moderation); **co-walk
  verbs** (tag/zoomies, ambush pounce, mutual grooming, duo goals, relay quests);
  **charm pack** (emote wheel, critter journal, home interior, cat customization,
  lofi music); leaderboards / photo wall; **server-side moderation + rate-limiting
  of `record_friend_greet`** (closes the unilateral-friendship hole properly);
  save-carries-identity so phone+desktop appear as the same player.
- **Minor deferred:** `apple-touch-icon` is SVG (iOS may fall back to a
  screenshot icon).
- **Cleanup item (housekeeping):** stray Finder/iCloud copy-duplicate files
  exist in `src/` and `test/` — `blocklist 2.js`, `cloud 2.js`, `ghosts 2.js`,
  `settings 2.js` and their `*.test 2.js` counterparts. They are not the real
  sources (vitest runs 24 files, not 28) and should be deleted, but confirm with
  the user before removing in case one holds unmerged edits.

## 8. Environment notes

- **GCP instance** is available (user offered access early on) — a likely future
  deploy target if the game ever outgrows GitHub Pages + Supabase. Details
  unknown; not currently used.
- Deploy target today is **GitHub Pages** (free, static) + **Supabase** (free
  tier) — no server to run or pay for.
- **Supabase keep-alive:** free-tier projects pause after 7 days of inactivity.
  `.github/workflows/keepalive.yml` pings the `profiles` table Mon+Thu to keep
  it awake (reuses the deploy secrets). Caveat: GitHub disables cron workflows
  after 60 days of no repo commits — a dormant repo can still pause; one push
  re-arms it. It prevents pausing but won't un-pause an already-paused project
  (restore once from the dashboard, then it stays up). Pro ($25/mo) removes
  pausing entirely if the game ever gets real traffic.
