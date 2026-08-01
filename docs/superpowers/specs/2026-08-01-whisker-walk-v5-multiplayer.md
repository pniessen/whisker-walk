# Whisker Walk v5 — Multiplayer — Design Spec

**Date:** 2026-08-01
**Status:** Approved by user (2026-08-01)
**Base:** deployed single-player game (GitHub Pages, https://pniessen.github.io/whisker-walk/)

## Vision

Cozy co-presence, not competition. Other players' pets — cats and one
notable chicken — share your neighborhood: you touch noses, rally a yarn
ball back and forth, pile up for naps, clear goals together, and build
friendships that persist whether or not you're online at the same time.
Every interaction is a gift to both parties; nothing bad can ever be done
*to* another player. That single rule replaces most of what makes
multiplayer engineering hard (anti-cheat, authority, moderation of
mechanics).

## Phases

Ship in order; each phase is independently valuable and independently
shippable.

### Phase 0 — Public deploy ✅ (done)

Static hosting on GitHub Pages with auto-deploy from main.

### Phase 1 — Async social (no live connections)

A small backend (see Infrastructure) storing three things:

1. **Player profiles:** chosen player name + their pet loadout (character,
   accessories) + rank + best walk. Created lazily on first "go online"
   action; identified by a generated player ID stored in localStorage
   (no accounts, no passwords, no email).
2. **Leaderboards:** best walk score, lifetime points, cats befriended.
   Top-50 lists plus "you and your neighbors" slice.
3. **Photo wall:** opt-in public posting of album photos (thumbnail +
   label + player name). Paginated feed at home base. A report button and
   a server-side allowlist of label strings (labels are already
   game-generated, never free text — the only user-generated content is
   the thumbnail image itself).

### Phase 1.5 — Ghost visits (async presence, the sleeper hit)

- After meeting another player (Phase 2) — or by entering a friend code —
  their pet appears in your **solo** walks as a wandering NPC: their real
  character and accessories, driven by the existing stray AI, name-tagged
  with their pet's name.
- Greeting a ghost builds a persistent **player friendship** (same
  met/friend/best-friend ladder as stray cats, stored server-side for
  both players).
- Best-friend ghosts can carry **mailbox gifts**: leave a collectible
  addressed to a friend; it spawns in their next walk with a tag.
- Requires only Phase 1 infrastructure plus a `ghosts` endpoint (fetch
  friends' loadouts at walk start). No realtime anything.

### Phase 2 — Live co-walks (room codes)

- Home base gains **"Walk together"**: host starts a room → 4-letter code;
  up to 4 players join. Everyone walks the same area with the same world
  seed.
- Live sync via a WebSocket relay (see Infrastructure). The host's client
  is tie-breaker for the rare conflicting event; there is no authoritative
  server simulation.

### Phase 3 — Ambient park (maybe never)

Persistent shared space with drop-in presence, sharded ~10 players/room.
Explicitly out of scope until Phase 2 proves fun.

## Player-to-player interactions (Phase 2 unless noted)

Reuse existing verbs — proximity, timing, and shared objects; no menus.

**Rituals**
- **Touch noses:** both press E within 1.5 units → synchronized boop +
  heart particle; records a mutual player-friendship greet (once per walk
  per pair). Level-ups toast on both screens.
- **Mutual grooming:** both idle adjacent ≥4s → grooming animations aimed
  at each other; small bond bonus.
- **Nap piles:** napping within 1 unit of a napping friend links the
  poses; 3+ = "nap pile" award for all participants.

**Play**
- **Yarn rallies:** any player's ball; consecutive *alternating* bats
  build a rally counter (3/6/10 hits = escalating awards for both).
  Simulation authority: last player to touch it.
- **Tag:** pounce landing within 1 unit of a friend starts tag (both get
  a toast); tagged player is "it", roles flip on touch, 60-second round,
  everyone involved gets points. Speed +10% while fleeing.
- **Ambush pounce:** stalk + pounce onto a friend = playful tackle;
  points to both ("you ambushed" / "you got ambushed").
- **Duet meows:** V near a friend opens a 3s reply window → harmonized
  meows (Hagrid's cluck harmonizes hilariously); villagers applaud.

**Cooperation**
- **Duo goals:** with 2+ players, the goal deck adds pair cards: both sit
  in one box ("if we fits, we sits"), photograph each other (simultaneous
  snap windows), tip 5 between you, one treasure each.
- **Relay quests:** letter quest becomes a nose-to-nose handoff; kitten
  search completes for whoever finds it and the kitten follows them; both
  get the award.
- **Shared album pages:** photos from co-walks land in every
  participant's album tagged with who was present.

## Technical architecture

### The core sync model: shared canon, local ambiance

- **Shared canon (synced):** player positions/poses/headings (10 Hz,
  interpolated), discrete events (bat, tip, dig, greet, meow, snap, quest
  progress, goal completion), yarn ball spawn/position (from its current
  authority), walk seed, weather roll.
- **Local ambiance (never synced):** critter wander paths, rain
  particles, butterflies, stray-cat movement. Each client's ambiance
  differs invisibly. Strays' *identities* (names present) come from the
  seed so everyone can greet the same Pickles; their moment-to-moment
  positions are local.
- Deterministic worlds come free: every world-gen module already accepts
  an injected `rng`. A room shares one seed → identical layout,
  tippables, treats, secrets (one unicorn for everyone), quest, goals
  deck.

### Wire protocol (Phase 2)

JSON over WebSocket; ~15 message types, all small:

```
join {room, playerId, name, loadout}      → roster, seed, area
state {pos, yaw, pose, speed}             (10 Hz, unreliable-tolerant)
event {type, ...payload}                  (bat/tip/dig/greet/meow/...)
leave / ping / host-migration
```

Client applies remote events through the existing bus (`bus.emit` with a
`remote: true` flag so handlers skip re-broadcasting). Remote players are
`RemoteCat` instances: `buildCat(loadout)` + `animateCat(pose)` + position
interpolation — the stray pipeline with a socket for a brain.

### Infrastructure

- **Phase 1/1.5:** any managed store works; simplest is Supabase (free
  tier: Postgres + REST + row-level security) called directly from the
  browser. Alternative: a ~100-line Express app on the GCP instance.
- **Phase 2:** a ~250-line Node WebSocket relay (rooms, seed assignment,
  broadcast, host migration on disconnect) on the GCP instance behind
  Caddy (automatic TLS — required: Pages is https, so sockets must be
  wss). Capacity: an e2-micro comfortably relays hundreds of concurrent
  sockets; a 4-player room generates ~3 KB/s.
- GitHub Pages remains the only game host; the client reads
  `VITE_RELAY_URL` at build time and disables multiplayer UI gracefully
  when unset or unreachable — single-player never regresses.

### Identity & persistence

- `playerId`: random UUID in localStorage. Display name chosen at first
  online action (filtered against a modest blocklist). No accounts;
  losing localStorage = new identity (acceptable at this scale; an
  export/import save feature mitigates and is worth building anyway).
- Player friendships/gifts/leaderboards live server-side keyed by
  playerId pairs. Local saves stay the source of truth for everything
  single-player.

### Safety & abuse (proportionate to a cozy game)

- No free text anywhere in-game (names are the only input; blocklist +
  length limits). No chat — meows are the chat.
- All interactions are structurally positive; there is nothing to grief
  *with* except proximity, and you can always walk away.
- Photo wall is the one UGC surface: report button hides on first report
  pending manual review (it's a hobby game; the queue is an email).
- Room codes are unguessable-enough (4 chars from a 30-symbol alphabet ≈
  810k combinations, rooms expire after an hour idle).

## Award additions (Phase 2)

`rally: 6, tag: 8, ambush: 4, nappile: 10, duet: 5` — through the
existing discovery log; duo-goal cards reuse `goal`/`jackpot`.

## Explicitly out of scope

Accounts/OAuth, voice/text chat, PvP or any negative-sum mechanic,
server-authoritative physics, mobile touch controls (separate effort),
matchmaking with strangers (rooms are code-invite only), Phase 3 until
Phase 2 has been played and loved.

## Open questions for review

1. Phase order confirmation — leaderboard/photo wall first, or jump
   straight to ghost visits (they're arguably more "Whisker Walk")?
2. Supabase (managed, no ops) vs. GCP instance (one box for everything,
   more setup) for Phase 1 storage?
3. Should ghost pets appear in *every* solo walk once befriended, or
   occasionally (surprise value)?
4. Player display names: per-player or per-pet (you name your cat, not
   yourself)?
