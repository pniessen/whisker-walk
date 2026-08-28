# Whisker Walk — Session Handoff

> **Read this first.** This is the canonical orientation doc for future Claude
> Code sessions on this project. It captures what the game is, how it's built,
> what's shipped, the operational facts (URLs, backend, deploy), and where to
> look next. Specs and plans live in `docs/superpowers/{specs,plans}/`; this
> doc is the map to all of it.

**Last updated:** 2026-08-27 (v18 CF-9 closed; v20 "Ruffled Fur" built) · **Branch:** `main`, with v19-prep + v20 work UNCOMMITTED in the tree · **Tests:** 984 passing (56 files)

---

## 1. What this is

**Whisker Walk** — a third-person, "be the cat" 3D walking game. You *are* a
cat wandering cozy low-poly neighborhoods, meeting stray cats, collecting
discoveries, earning ranks, and (as of v7) co-walking with real friends,
keeping a cloud-synced save, and getting ghost visits from befriended pets.

- **Live site:** https://pniessen.github.io/whisker-walk/
- **Local dev:** `http://localhost:5174` (`npm run dev` — pinned via `.claude/launch.json` `--strictPort`)
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
| `src/main.js` | Boot + wiring only (~630 lines): builds every system, owns the live `session` binding, and holds the input/bus handlers and the render loop. The game logic it used to carry now lives in `src/game/*` (below) |
| `src/game/walk.js` | `startWalk`/`endWalk`, `beginWalkFromHomebase`/`beginDenWalk`, async ghost spawning |
| `src/game/interactions.js` | Prompt scan (`updateInteractions`), `handleInteract`, the shared `awardStrayGreet`, and the meow/yarn/pounce/camera action helpers + touch dispatch |
| `src/game/netevents.js` | Co-walk wire events: `applyRemoteEvent`, boop/tag convergence, yarn rally, duet |
| `src/game/avatar.js` | Per-frame cat state: pose ladder, timers, puddles/boxes, yarn batting, pounce-tag + grooming detection, `updateMoments` |
| `src/game/rooms.js` | Room lobby (`pendingRoom`, host/join/leave, `walk-config` dispatch) + `pushProfileNow` |
| `src/game/cloudsync.js` | Lazy `getCloud`/`getPsecret` + the home base's Sync ☁️ `sync` object |
| `src/game/photo.js`, `src/game/composer.js`, `src/game/labels.js`, `src/game/util.js` | Photo mode; the lazy bloom rig + per-frame draw; critter display names; shared pure helpers (`escapeHtml`, `nowSec`, `hashName`) |
| `src/net.js` | Supabase client (shared memoized dynamic import), realtime transport, fake hub for tests |
| `src/cloud.js` | `createCloud({rpc,select})` — save/load/profile/greet/friend-code RPC client; `generateSaveCode`, `getOrCreateSecret` |
| `src/progression.js` | Save state, `sanitizeState` (hostile-payload hardening), `summarizeSaveForPreview`, the RANKS ladder (extended in v18), `recordSkillUnlocks`/`sanitizeSkills`, save version **4** |
| `src/album.js` | Photo album + `sanitizeAlbumPayload` (drops non-`data:image/` thumbs, caps sizes) |
| `src/blocklist.js` | Per-device block set for unwanted ghost visitors |
| `src/settings.js` | `createSettings(storage)` — volume/mute/invertY/leftHanded/reducedMotion |
| `src/ghosts.js` | `rollGhosts` (pure), ghost model spawning for solo walks |
| `src/cat/model.js` | `buildCat(breed, accessories, opts)` + `buildChicken` (Hagrid) |
| `src/cat/brain.js` | `PERSONALITIES` (10 entries incl. family pets) |
| `src/ui/homebase.js` | Home base: Sync ☁️, Player pets roster, friend codes, Settings ⚙️ — **all server strings escaped** |
| `src/fx.js` | Score popups + particle bursts (per-walk, disposed at endWalk) |
| `src/catvoice.js` | Per-breed voice params for the formant meow synthesis |
| `src/skylife.js` | Clouds + bird flyovers (own seeded rng stream) |
| `src/climbing.js` | `canReach`/`bestPerch` perch-chain rules |
| `src/journal.js`, `src/goldmice.js`, `src/kitten.js` | v15 collection/story systems |
| `src/verbs.js`, `src/race.js`, `src/samples.js` | v16 co-walk verbs, daily race, sampled voices |
| `src/den.js` + `src/world/den.js`, `src/music.js` | v17 den catalog/world + generative lofi |
| `src/skills.js` | **v18 ability catalog** — the eleven `SKILLS` entries + `SKILL_FAMILIES`, `hasSkill`/`unlockedSkills`/`skillProgress`, and the `friendRungs()` ♡→♥→💕 rung table (THE one copy; Charmer moves it). Deliberately **zero imports** so it is callable from a unit test, the home-base UI, and the render loop alike — and so `progression.js`'s import of `SKILL_IDS` is unconditionally cycle-free. Every predicate takes a hostile payload and never throws |
| `src/gifts.js` | v18 Gift Paws: gifts stashed at scenic spots, `pickFoundGift`, `NO_GIFTS` |
| `src/world/docks.js` | v18 fifth area, The Old Docks — crane, crates, plank bridges, canal, perch array |
| `src/game/celebrate.js` | v18 ability-unlock celebration card (shared by the mid-walk and end-of-walk unlock paths) |
| `docs/supabase-setup.sql` | **LIVE DB contract** — see §4 |

## 3. Feature waves (all shipped and deployed)

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
- **v8 "Say Hi"** — live in-game chat during co-walks. Curated phrase/emote tray (💬 button), speech bubbles over cats (`src/chatbubble.js` mirrors `nametag.js`), per-player mute + `hideChat` setting. **Safety keystone: only a phrase-ID enum crosses the wire** (`src/chat.js` catalog; `net.js` `chat` broadcast kind) — no free text, so no moderation surface. Files: `src/chat.js`, `src/chatbubble.js`, `src/ui/chatwheel.js`, chat wiring in `src/main.js`. Spec/plan: `docs/superpowers/{specs,plans}/2026-08-11-whisker-walk-v8-chat.md`. **Lesson:** the live Supabase transport must subscribe to every broadcast kind `createNet.handleBroadcast` handles — the final review caught `chat` missing from `createSupabaseTransport.join` (unit tests passed because the fake hub is kind-agnostic). Verify multiplayer wire changes with a live two-client round-trip, not just unit tests.
- **v9 "Home Base, Tidied"** — the home base became a sticky hero (cat wordmark + rank + Start) over tabs (`src/ui/hometabs.js` + restructured `src/ui/homebase.js`; originally four — Play/Social/Album/Settings — now six, see the tab split and v18 entries below). Consolidated the three social blocks into one Friends section. Reorganization only — all handlers/escaping preserved.
- **Logo branding** — B1 refined-face app icon (`public/icon.svg`), C1 wordmark lockup as the home base hero title (`homebase.js`), A2 chibi mascot as a boot splash (`index.html` `#splash` + fade script, fallback timeout so it can't trap the player). Shipped with v10.
- **v11 "Cat Couture"** — six layered cosmetic slots (head/face/neck/body/back/feet + collar), 12 new items, save v3→4 migration (no data loss), slot-grouped Accessories UI, slot-aware thumbnail framing. Hoodie hood renders up/down by head-slot state; Hagrid gracefully skips what doesn't fit a chicken.
- **v12 "Juice & Polish"** — WebAudio master bus (gain→compressor→generated-impulse reverb, `src/audio.js`), formant-synthesized meow/purr/trill with per-breed voices (`src/catvoice.js`), tone-mapping/IBL calibration (exposure 1.1, envIntensity 0.45/0.32), FX system (`src/fx.js`: "+N 🐾" popups + particle bursts), collect arpeggio + jackpot fanfare.
- **v13 "Alive World"** — world density pass (sidewalks/fences/scatter, new `sidewalk`/`leafLitter`/`bike` builders), drifting clouds + bird flyovers (`src/skylife.js`, own seeded rng — never walkRng), warm window glow on dusk walks, layered ambience (wind/waves/rain beds + gull/cricket/birdsong accents composed by area/dusk/rain).
- **v14 "Cat Athletics"** — zoomies (earned sprint: 1.5s full-speed charge → pace×1.55 drift, FOV kick, trail, whoosh; freeze instantly cancels), parkour perch chains with `src/climbing.js` (`canReach`/`bestPerch` — highest-reachable selection; perched cats skip the collider push), rooftop collectibles, stalk-and-pounce critter tag (mouse critter, 20s cooldown, perfect-sneak slow-mo), movement audio + landing squash pose.
- **v15 "Collector's Journal"** — four ADDITIVE save fields (journal/golden/streak/kitten — no version bump; per-field sanitize with size caps), critter journal Album grid (`src/journal.js`), nine golden mice at parkour spots (`src/goldmice.js`), the 3-walk lost-kitten story arc (`src/kitten.js` — E-mash-proofed: encounter guards + plan-kind dispatch), daily streak bonus, dated/framed album photos.
- **v16 "Together"** — ghosts answer chat in the named-cat voices (Zeetoo/Rosa/Robbie/Hagrid reachable at last); co-walk verbs: pounce-tag (boop-style awardOnce convergence), mutual grooming (local detection from synced poses), duo goal (`goal-progress` events, `noteDuoRemote` never re-broadcasts); daily zoomies race (`src/race.js` — date+area-seeded 5-ring course, identical across devices, local best); sampled pet voices (`src/samples.js` — manifest-driven, synth fallback; `docs/RECORDING-PETS.md` tells the family how to record the real cats). **All new events ride the existing `event` broadcast kind — live-verified with a two-process bot round-trip through the real Supabase relay.**
- **v17 "Cozy Den"** — walkable furnished den (`src/den.js` catalog + `src/world/den.js` interior; buy/place furniture from the home base; open fourth wall + inward spawn for the follow camera; cattree is a climbable perch; ghosts and stage-3 Mochi visit; fireplace-crackle ambience; `completeWalk(areaId)` so den walks count `walks.den`), seeded generative lofi music (`src/music.js` — pentatonic phrases, mood per walk type, `musicVolume` setting, mute-safe).
- **Tab split (post-v17, `085f61e`)** — the home base now has **five tabs: Cats 🐱 / Accessories 🎩 / Social / Album / Settings** (v18 added a sixth, Skills 🐾, between Accessories and Social). The old Play tab was renamed Cats (cat pick, areas, den section); the slot-grouped accessory shop ("Dress up your cat") moved to its own Accessories tab. `resolveTab`'s unknown-id fallback clamps a stale persisted `'play'` id to `'cats'` (test-pinned in `test/hometabs.test.js`).
- **v18 "Cat Skills"** — the wave that turned lifetime play into **earned abilities**. `src/skills.js` is a pure, zero-import catalog of **eleven** permanent always-on abilities across four families (Traversal 🧗 / Senses 👃 / Social 💕 / Mischief 😼), each gated on a **feat predicate** read straight off the save — no loadout, no respec, no prerequisites. `hasSkill(state, id)` is THE contract every ability gates its effect behind, and it returns the **union** of "the save lists it as earned" and "its predicate is satisfied right now", so an ability is never revoked by a later threshold change and never dead waiting on the UI. New **Skills 🐾** home-base tab (a sixth tab; render helper `renderSkillsHtml` lives in `hometabs.js`, not `homebase.js` — see the gotcha below) shows every ability with its progress bar and its feat.
  - **The challenge-unlock model.** Four feats originally read a *proxy* counter and were closed by adding a **parallel tally** next to the existing award (`feats.perch`, `feats.race`, `state.duskWalks`) rather than retyping the award. Award types are read by the goals system, so retyping one silently rebalances live gameplay. **If a future feat needs a counter that doesn't exist, add one alongside — never repurpose an award.**
  - **The Old Docks** (`src/world/docks.js`) — a fifth walk area: gantry crane, crates, plank bridges, a canal, three golden mice, its own dockside-rat critter, and (Task 4.0) its own harbour ambience (water lap + gulls + a rare distant horn). `walks.docks` joins the walk tallies.
  - **Extended rank ladder** — the ranks run further up (`src/progression.js` RANKS, topping out at Whisker Legend) so a player with lifetime points from eleven ability grinds still has somewhere to climb.
  - **Unlock celebration** — `src/game/celebrate.js` shows an ability card + `audio.unlockFanfare()` + an FX burst. Routed through one `celebrateNewSkills()` in `walk.js` so both the mid-walk and the end-of-walk unlock paths share it and neither can double-fire.
  - **Gifts** — `src/gifts.js` + Gift Paws lets you stash a gift at a scenic spot for ghosts and co-walkers to find; `state.gifts` holds at most 8 outstanding.
  - **Descoped: Sea Legs** (twelfth ability, swimming). Water in this game has never carried colliders, so every water body is *already* a walk-over surface — the ability as specified would have made the cat strictly slower, and making water block would put the pond ducks behind an ability. **Removed from the catalog entirely, not left locked**, because its feat was perfectly earnable and would have celebrated an unlock that did nothing. Full reasoning: **CF-12** in the v18 plan. Reinstating it is a v19 item (make water real, relocate the pond ducks, then open it) — the Docks was deliberately authored for that, with a test pinning that nothing required sits in the canal.
- **v10 "Talk to the Cats"** — message a nearby AI cat with a curated phrase, get a personality-appropriate **canned** reply as a speech bubble (`src/catreplies.js`, pure `(personality,intent)→line`, all 10 voices incl. Hagrid clucks). Greetings count one **capped** friendship greet (shared `awardStrayGreet`, `stray.greeted` guard — never out-farms booping). **Keyboard chat** (`src/chatkeys.js` + `main.js` keydown): number row `1`–`0` sends *under pointer lock* (fixes desktop-unusable chat — the 💬 button was unreachable with the cursor captured), `Enter` opens the tray (releases pointer lock), `Esc` closes; chat now works in **solo** walks too. **Lesson:** the reply seed must be numeric — `session.walkStamp` is the STRING `'walk-<ms>'`, so `string + number` fed `pick()` `NaN>>>0=0` and made every same-breed cat reply identically; fixed with `seedFromCode(walkStamp)+hashName(name)`. Known limitation: named-cat voices (zeetoo/rosa/robbie/hagrid) aren't reachable in-game yet (strays spawn the 6 base breeds; ghost-reply wiring is a future follow-up).

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

- **Run:** `npm run dev` (localhost:5174, pinned `--strictPort`). **Test:** `npx vitest run --dir test` (764 green).
  **Build:** `npx vite build`. **Preview prod:** `npx vite preview`.
  - **Always pass `--dir test`.** Agent worktrees live under `.claude/worktrees/`,
    *inside* the project, so vitest's default glob collects their copied suites
    and silently multiplies the count.
  - **`npx`/`node` are not on PATH** in agent sandboxes. The direct shim always
    works: `/Users/pniessen/.local/share/mise/shims/npx vitest run --dir test`.
  - **A worktree has no `node_modules`** — resolution walks up to the parent
    repo's, which is why nesting worktrees inside the project works at all.
    Do **not** "fix" this by running `npm install` in a worktree.
  - **Agent worktrees branch from `main`, not from the working branch.** Every
    task brief must open with a base check (does the branch's newest file
    exist?) and a `git merge --ff-only <branch>` if not. The tell is a stale
    baseline test count.
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
  - **`src/ui/homebase.js` cannot be imported by the test suite** — it calls
    `document.getElementById` at module scope and there is no jsdom here. Pure
    render helpers therefore belong in `src/ui/hometabs.js` (the split
    `journal.js` already uses for `renderJournalHtml`, and `renderSkillsHtml`
    now uses too). Follow that split rather than adding a DOM shim.
  - **Derive counts from the catalog, never from a literal.** The Skills tab
    footer is `${earnedCount}/${SKILLS.length}` and `sanitizeSkills`' cap is
    `KNOWN_SKILL_IDS.size` — which is exactly why dropping the twelfth ability
    could not desync either of them.

## 7. Open threads / next steps

- **UNCOMMITTED WORK IN THE TREE (2026-08-27).** Four pieces of work are built,
  green (984 tests, 56 files) and `vite build`-clean, but **not committed** —
  `git status` will show a large diff on a clean-looking `main`. Commit or
  branch before starting anything new. In order:
  1. **v18 CF-9 closed** — Spring Paws' pounce arc (`player.js` `pounceArc`/
     `hopOffset`, plus a paws-projection fix in `game/avatar.js`) and Sure Claws'
     per-prop climbability (`climbing.js` `PERCH_KINDS`/`climbKinds`, 49 gated
     `requires: 'sure-claws'` scenery perches across the five world files). The
     activating one-liner is in `game/interactions.js` and is test-guarded.
  2. **Stray RNG, fully seeded** — `createStrayCats` drew position/facing/timer
     from bare `Math.random()` despite taking an injected rng, so co-walkers saw
     the same cats in different places. Fixed; the wander FSM then got per-stray
     `mulberry32` streams (`seedFromCode(name)`-derived, salted) so idle wander
     is deterministic too, without adding a second lazy `walkRng` consumer.
  3. **v20 "Ruffled Fur"** — the enemy/grudge system. Spec:
     `docs/superpowers/specs/2026-08-27-whisker-walk-v20-ruffled-fur.md`, whose
     §2 (locked decisions D1–D7) and §7 (status as shipped) are the things to
     read before touching it. **Not yet seen on screen** — see that §7.
  4. Doc updates: this file, and the v18 plan's CF-9 entry annotated closed.

- **v19 water: the CONTENT PASS IS DONE (commit `a4a9cec`); the COLLIDER WAVE
  is what remains.** Areas now declare their water as data (`waters`, in
  `builder.js` — `{kind:'circle'|'rect'}` plus optional `decks` for dry
  structure standing over water: the seaside pier, the Docks' two bridges).
  Water meshes are built FROM those records, so mesh and data cannot drift.
  Four stranded items were relocated, `scent.js` now keeps dig treats out of
  water, and `test/water.test.js` pins the invariants for every area — including
  a flood-fill proving the dry land is one connected component reachable from
  spawn on foot.
  **The next wave is: turn `waters` into actual colliders (honouring `decks`),
  relocate nothing further, then reinstate Sea Legs** (`src/skills.js`'s descope
  note and CF-12 in the v18 plan are the context). Two things to carry in:
  the park path has a vertex inside the pond so it will read as running into a
  lake once water is solid (cosmetic, `park.js:26-27`); and the collision system
  is circles-only (`{x,z,r}` in `player.js` and `world/spots.js`), so a rect
  footprint needs either several circles or a format extension.

- **Superseded — kept for the reasoning.** v19 was previously BLOCKED on a content pass:
  Reinstating Sea Legs needs water to carry colliders, and a recon of every
  water body found this must come first:
  - `src/world/park.js:89` has a POI at **(-14, 2) — the pond's exact centre**.
    It feeds daily race waypoints and quest targets, and `clearSpot` cannot push
    it out because the pond has no collider for it to see. With solid water,
    ~5-in-8 park races would contain an unreachable ring, and `race.js` checks
    only the *current* ring with no skip or timeout, so **one bad ring stalls the
    whole daily race**. ~25% of park walks also scatter a dig-treat into the pond.
  - `test/spots.test.js:80` passes today and would keep passing — it measures
    gap-to-nearest-collider, and water is not one. False confidence, not coverage.
  - Seaside `fish-1` (33,-14) and the `pier-end` scenic (34,-18) sit 2.5m and
    6.5m off the pier deck in open water; both become permanently unobtainable,
    and because `pier-end` is a valid gift-stash spot, **gifts already saved
    there become unreachable forever** — that is live save data.
  - The Docks is clean and already test-pinned (`test/docks.test.js`), as
    designed in v18.

- **v18 "Cat Skills" is MERGED to `main` and deployed** (merge `16cef66`,
  2026-08-18; Pages deploy green, `origin/main` in sync).
  Wave close-out (Task 4.0) was done: Sea Legs removed per CF-12, Gift Paws
  lowered to 3, Docks ambience added, docs updated. 764 tests green, `vite
  build` clean, Skills tab browser-verified. **Read the entire Carry-forward
  section of `docs/superpowers/plans/2026-08-18-whisker-walk-v18-cat-skills.md`
  before touching this wave** — it holds the rulings (CF-6 held-meow descope,
  CF-8 Spring Paws budget, CF-11 Long Zoomies wording, CF-12 Sea Legs). Its
  CF-9 — two unimplemented ability halves — is now CLOSED (2026-08-27 —
  Spring Paws got a real ballistic pounce arc, Sure Claws got per-prop perch
  kinds plus 49 gated scenery props; see the annotated CF-9 entry). CF-7's
  bare `Math.random()` gift roll is **fixed** — `src/game/walk.js:489` draws
  from `walkRng()`. The final whole-branch review then found and fixed two real
  bugs, both recorded in the spec's "Status as shipped" section: `feats.perch`
  was farmable by re-taking one perch, and Big Swat's doubled reach shadowed
  the greet/quest/scratch/boop/dig prompts.
- v7–v10 + logos are complete, merged to `main`, deployed.
- **Phase 0 renderer upgrade — SHIPPED (2026-08-14, deployed).** PBR
  `MeshStandardMaterial` (`src/render/materials.js` `litMaterial`) under a
  runtime-baked asset-free `RoomEnvironment`+PMREM IBL map (`scene.environment`),
  ACES tone mapping, tuned shadows, and a subtle `EffectComposer`+`UnrealBloomPass`
  bloom. A quality tier (`src/render/quality.js` `resolveQuality`, `quality`
  setting) gates the full stack to the high tier; mobile/reduced-motion stay on
  the light path with the composer **never allocated** (lazy `ensureComposer`).
  Plan: `docs/superpowers/plans/2026-08-12-whisker-walk-phase0-renderer.md`.
  **Caveat: the by-eye palette calibration was NOT done** (browser was gated all
  session) — it shipped with the plan's default values (sun 2.2, ambient 0.9,
  exposure 1.0, envIntensity high 0.35 / low 0.25). If the daylight/dusk/rain
  palette reads off on the live site, the levers are `renderer.toneMappingExposure`
  (try 1.05–1.15) and `scene.environmentIntensity` — NOT `weather.js`. Deferred
  housekeeping: stale `MeshLambertMaterial` comment in `src/ghosts.js`; the
  `* 2.js` Finder-dup files still linger.
- **v11–v17 program (2026-08-14): ALL SHIPPED.** Seven waves executed
  autonomously via the master plan
  (`docs/superpowers/plans/2026-08-13-whisker-walk-v11-v17-master.md`), each
  merged to `main` after a per-task review loop + whole-branch final review +
  browser verification + live-site smoke. Full task-by-task history (including
  every parked/deferred minor with rulings) in the SDD ledger that lived at
  `.superpowers/sdd/2026-08-13-whisker-walk-v11-v17-master/progress.md`
  (git-ignored scratch; the git history is now the record). The Phase-0 palette
  caveat above is RESOLVED (v12 calibrated by eye: exposure 1.1, envIntensity
  0.45/0.32); the `* 2.js` dup files are deleted (were gitignored, never
  tracked); the v10 ghost-reply follow-up shipped in v16.
- **Verification workaround (important for future sessions):** automated
  browsers cannot acquire pointer lock, so the desktop "Start exploring"
  overlay never dismisses under automation. Verify gameplay via mobile
  emulation (`resize_window` mobile → reload → JS-dispatch pointerdown/up/click
  on "Tap to explore"), drive buttons via `[data-action]` clicks, and expect a
  spurious `WrongDocumentError` console entry (harness artifact, not a bug).
  `.claude/launch.json` pins vite to port 5174 `--strictPort` so the preview
  tab and server agree (orphaned vites on 5173 caused port chaos once).
- **Save format note:** still version 4. v15/v16/v17 fields
  (journal/golden/streak/kitten/race/den, walks.den) and the v18 fields
  (**`skills`/`feats`/`duskWalks`/`gifts`**, plus `walks.docks`) are all
  ADDITIVE — sanitized per-field with defaults, so old payloads load
  losslessly and old clients ignore the extra keys. **No back-fill:** the v18
  tallies start at zero on an existing save rather than being reconstructed
  from history, which is a locked spec decision, not an oversight. `skills`
  is validated against the live catalog (`SKILL_IDS`) and capped at its
  length, so an id the catalog no longer knows — e.g. `'sea-legs'` from a v18
  dev build — is simply dropped and the rest of the save survives intact
  (test-pinned). Any future SHAPE change still needs a version bump +
  migration + no-data-loss tests (the v11 3→4 migration is the template).
- **Remaining backlog:** async/offline friend messaging (needs tables + RPCs +
  moderation); relay quests; emote wheel; leaderboards / photo wall;
  **server-side moderation + rate-limiting of `record_friend_greet`** (still
  the real fix for the unilateral-friendship hole); save-carries-identity;
  photo sticker picker (descoped from v15 in favor of automatic frames).
- **Deferred minors worth a polish pass someday:** streak/race day boundary is
  UTC not local; perch-cancel-on-input could be edge-triggered so chains climb
  with keys held; `buy()`/`buyDenItem` lack an `Object.hasOwn` guard
  (console-only `__proto__` NaN, self-heals on reload); recorded pet voices
  skip duet pitch harmonization; endWalk's scene traversal disposes the shared
  Sprite geometry (pre-existing, self-healing); THREE.Clock/PCFSoftShadowMap
  deprecation warnings; `apple-touch-icon` is SVG.
- **For the family:** drop 1–2s recordings of the real cats into
  `public/sounds/` per `docs/RECORDING-PETS.md` and the game speaks in their
  voices.

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
