# Whisker Walk v5 "Co-Walks" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live room-code co-walks for up to 4 players over Supabase Realtime — shared seeded worlds, remote pets rendered live, touch-noses/duet-meow/yarn-rally/nap-pile interactions, "Walk together" home-base UI.

**Architecture:** Supabase Realtime channels are the entire network layer (broadcast for state/events, presence for roster/host election — no server of ours anywhere). `src/net.js` wraps it behind a transport interface with an in-memory fake for tests. A shared room seed drives the existing rng-injected world-gen so all players generate identical walks. Remote players are `RemoteCat`s — the stray pipeline driven by interpolated network state. Canon events mirror over the existing bus with a `remote` flag.

**Decisions locked (user):** co-walks first (async phases later); Supabase; pets are named, players anonymous; ghost frequency (later phase) = occasional.

**Spec:** `docs/superpowers/specs/2026-08-01-whisker-walk-v5-multiplayer.md` — read it first.

## Global Constraints

- **Multiplayer must never regress single-player.** All net features are gated on `import.meta.env.VITE_SUPABASE_URL && VITE_SUPABASE_ANON_KEY`; when absent or unreachable, the "Walk together" UI shows a friendly "multiplayer not configured" state and everything else behaves exactly as today.
- Dependency budget: exactly one new runtime dep, `@supabase/supabase-js`.
- Room codes: 4 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L).
- Message schema version field `v: 1` on every payload; unknown versions ignored.
- State broadcasts at 8 Hz; interpolation window 150 ms; remote cats despawn 5 s after last state.
- Host = lexicographically-smallest playerId in presence (deterministic, no election protocol); host re-derives automatically on presence change (host migration for free).
- Awards added: `rally: 6, nappile: 10, duet: 5, boop: 5` (touch-noses between players).
- Pet names: 2–16 chars, letters/spaces/hyphens only, checked against a small blocklist; stored in the save (`petName`, save stays version 3 — additive field, no migration bump needed since v3 loader keeps unknown-compatible fields... it does not: version check is exact. ADD the field to defaultState and to the v2 migration; version stays 3 because v3 saves without petName get it defaulted via `state.petName ??= null` after load).
- All tests + `npx vite build` green at every commit. Baseline: 79 tests.

## Milestones

- **M1 (Tasks 1–4):** two browsers in one room see each other's pets move, with shared world + shared tippables/treats. Fully testable with a fake transport; end-to-end needs real Supabase keys.
- **M2 (Tasks 5–6):** the social interactions + polish + deploy secrets.

---

### Task 1: Seeded rooms — deterministic shared worlds

**Files:**
- Create: `src/rng.js`
- Modify: `src/main.js`
- Test: `test/rng.test.js`

**Interfaces:**
- `mulberry32(seed) -> rng()` — deterministic float rng; `seedFromCode(roomCode) -> int` (FNV-1a hash).
- `startWalk` gains an options field `{ duskMode, roomSeed }`; when `roomSeed` is set, EVERY world-random decision in startWalk uses `const rng = mulberry32(roomSeed)` instead of `Math.random`: weather roll + createWeather, rain puddle placement, bird filter unchanged (deterministic already), secrets rolls + createSecrets, quest creation, goals creation, stray creation (`createStrayCats(scene, areaData, 22, rng)` — names/personalities identical for all players), scent creation, gift rolls SKIPPED in rooms (gifts are solo-phase). Solo walks (`roomSeed` undefined) keep `Math.random` everywhere — zero behavior change.
- Note: transient gameplay randomness (bell jingle chance, moment timer jitter, toy bat impulse) stays `Math.random` — it's local ambiance.

- [ ] **Step 1: Failing tests** — `test/rng.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { mulberry32, seedFromCode } from '../src/rng.js';

describe('mulberry32', () => {
  it('is deterministic and uniform-ish in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(new Set(seqA).size).toBe(5);
  });

  it('different seeds diverge', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('seedFromCode', () => {
  it('maps room codes to stable ints, case-insensitively', () => {
    expect(seedFromCode('WXYZ')).toBe(seedFromCode('wxyz'));
    expect(seedFromCode('WXYZ')).not.toBe(seedFromCode('WXYA'));
    expect(Number.isInteger(seedFromCode('AB23'))).toBe(true);
  });
});
```

- [ ] **Step 2: fail.** **Step 3: Implement src/rng.js**

```js
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromCode(code) {
  let h = 0x811c9dc5;
  for (const ch of code.toUpperCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
```

- [ ] **Step 4: pass.** **Step 5: Thread roomSeed through startWalk** — mechanical substitution per the interface note; verify a temporary console assertion locally by starting two walks with the same forced seed and diffing `areaData`-derived state (implementer judgment; a cheap automated check: factor the "roll the walk" section minimally so the rng source is one variable). **Step 6: tests + build + solo walk unchanged in browser.** **Step 7: Commit** — `git commit -m "feat: seedable shared-world walks"`

---

### Task 2: Net transport — Supabase wrapper + fake

**Files:**
- Create: `src/net.js`
- Modify: `package.json` (add @supabase/supabase-js)
- Test: `test/net.test.js`

**Interfaces:**
- `generateRoomCode(rng?) -> 'XXXX'` from the constraint alphabet.
- `validPetName(name) -> bool` (2–16 chars, `/^[A-Za-z][A-Za-z -]{1,15}$/`, blocklist check).
- `createNet(transport) -> net` where transport is either `createSupabaseTransport(url, key)` or `createFakeTransport()` (test/in-memory, also exported):
  - `net.join(roomCode, profile) -> Promise<{ok, roster}>` — profile `{playerId, petName, breed, accessories}`; subscribes presence + broadcast.
  - `net.leave()`
  - `net.sendState(state)` / `net.onState(fn)` — `{v:1, id, pos:[x,z], yaw, pose, speed}`
  - `net.sendEvent(event)` / `net.onEvent(fn)` — `{v:1, id, type, ...payload}`
  - `net.onRoster(fn)` — `[{playerId, petName, breed, accessories}]`, fired on join/leave.
  - `net.isHost()` — smallest playerId in roster.
  - `createFakeTransport()` returns `{transportA, transportB, ...}`? Simpler: `createFakeHub()` returning `hub.transport()` instances that share an in-memory bus — tests wire two nets through one hub.
- All messages validated: wrong `v`, missing fields, or oversized (> 2 KB) → dropped silently.

- [ ] **Step 1: Failing tests** — `test/net.test.js` (uses the fake hub only; no Supabase in tests):

```js
import { describe, it, expect } from 'vitest';
import { createNet, createFakeHub, generateRoomCode, validPetName } from '../src/net.js';

describe('room codes and names', () => {
  it('generates 4-char codes from the safe alphabet', () => {
    const code = generateRoomCode(() => 0.5);
    expect(code).toHaveLength(4);
    expect(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(code)).toBe(true);
  });
  it('validates pet names', () => {
    expect(validPetName('Hagrid')).toBe(true);
    expect(validPetName('Sir Pounce-a-lot')).toBe(true);
    expect(validPetName('x')).toBe(false);
    expect(validPetName('a'.repeat(20))).toBe(false);
    expect(validPetName('h4x0r!!')).toBe(false);
  });
});

describe('createNet over a fake hub', () => {
  it('joins, exchanges roster, elects the smallest playerId as host', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('AB23', { playerId: 'aaa', petName: 'Zeetoo', breed: 'zeetoo', accessories: {} });
    await b.join('AB23', { playerId: 'bbb', petName: 'Hagrid', breed: 'hagrid', accessories: {} });
    expect(a.isHost()).toBe(true);
    expect(b.isHost()).toBe(false);
  });

  it('delivers state and events to the other peer only', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('AB23', { playerId: 'aaa', petName: 'A', breed: 'tabby', accessories: {} });
    await b.join('AB23', { playerId: 'bbb', petName: 'B', breed: 'rosa', accessories: {} });
    const seenByB = [];
    const seenByA = [];
    b.onState((s) => seenByB.push(s));
    a.onState((s) => seenByA.push(s));
    a.sendState({ v: 1, id: 'aaa', pos: [1, 2], yaw: 0, pose: 'follow', speed: 1 });
    expect(seenByB).toHaveLength(1);
    expect(seenByA).toHaveLength(0); // no echo
  });

  it('drops malformed messages', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('AB23', { playerId: 'aaa', petName: 'A', breed: 'tabby', accessories: {} });
    await b.join('AB23', { playerId: 'bbb', petName: 'B', breed: 'rosa', accessories: {} });
    const seen = [];
    b.onState((s) => seen.push(s));
    a.sendState({ v: 99, id: 'aaa', pos: [0, 0], yaw: 0, pose: 'follow', speed: 0 });
    a.sendState({ v: 1, id: 'aaa' }); // missing fields
    expect(seen).toHaveLength(0);
  });

  it('host migrates when the smallest id leaves', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('AB23', { playerId: 'aaa', petName: 'A', breed: 'tabby', accessories: {} });
    await b.join('AB23', { playerId: 'bbb', petName: 'B', breed: 'rosa', accessories: {} });
    await a.leave();
    expect(b.isHost()).toBe(true);
  });
});
```

- [ ] **Step 2: fail.** **Step 3: Implement src/net.js** — fake hub: in-memory map of room → Set of transport endpoints with presence dicts; Supabase transport: `createClient(url, key)`, `client.channel('room:' + code, { config: { broadcast: { self: false }, presence: { key: playerId } } })`, presence `track(profile)`, `.on('broadcast', {event: 'state'|'event'}, handler)`, send via `channel.send({type:'broadcast', event, payload})`. Both implement the same tiny interface `{join(code, profile, handlers), send(kind, payload), leave()}` so `createNet` holds all the logic (validation, roster sort, host calc) and the Supabase path stays too thin to need unit tests. `npm install @supabase/supabase-js`.
- [ ] **Step 4: pass** (fake-hub tests). **Step 5: tests + build.** **Step 6: Commit** — `git commit -m "feat: net layer with fake hub and supabase transport"`

---

### Task 3: Remote pets in the walk

**Files:**
- Create: `src/remotecats.js`
- Modify: `src/main.js`
- Test: `test/remotecats.test.js`

**Interfaces:**
- `createRemoteCats(scene) -> remotes`:
  - `upsert(profile)` — build the pet (`buildCat(breed, accessories, {simple:true})` + name-tag sprite reused from straycats' tag helper — EXTRACT that helper into `src/nametag.js` shared by both) on first sight.
  - `applyState(state)` — store target pos/yaw/pose/speed + timestamp.
  - `remove(playerId)`; `list`; `dispose()`.
  - `update(dt, now)` — interpolate positions toward target over the 150 ms window (lerp pos, shortest-arc lerp yaw), call `animateCat(cat, pose, t, speed)`, despawn after 5 s silence.
  - `nearest(pos, maxDist)` for interactions (Task 5).
- `main.js`: when a walk starts with an active room (`session.net`), wire `net.onRoster → upsert/remove`, `net.onState → applyState`, a 8 Hz `setInterval`-free accumulator in the loop sending local state (`pos/yaw` from cat + `s.pose` + speed), and `remotes.update(dt, t)` in the locked block. Remote pets are photo subjects (`key: 'friend-pet'`) and spot-able like strays.

- [ ] **Step 1: Failing tests** (fake scene; drive applyState/update; assert interpolation moves the group toward the target and despawn-on-silence works; upsert is idempotent per playerId). Write ~5 focused tests analogous to straycats'.
- [ ] **Step 2: fail.** **Step 3: Implement** (extract `src/nametag.js` with the document-guard; refit straycats to import it — no behavior change, straycat tests stay green).
- [ ] **Step 4: pass.** **Step 5: tests + build; solo unchanged.** **Step 6: Commit** — `git commit -m "feat: remote pets with interpolation and shared name tags"`

---

### Task 4: Canon events over the wire

**Files:**
- Modify: `src/main.js`, `src/tippables.js` (tipById), `src/scent.js` (digById)
- Test: extend `test/tippables.test.js`, `test/scent.test.js` (by-id lookups)

**Interfaces:**
- Outbound: after local canon actions succeed, `net.sendEvent`: `{type:'tip', tipId}`, `{type:'dig', treatId}`, `{type:'collect', collectibleId}`, `{type:'meow'|'cluck', pos}`, `{type:'boop-request', toId}` (Task 5 consumes), `{type:'pose-event', kind:'pounce'}`.
- Inbound handler: applies remote effects WITHOUT awarding points locally (their points are theirs): `tip` → `tippables.tipById(id)` (topple animation only), `dig` → `scent.digById(id)` (mound opens, treat pops), `collect` → remove that collectible mesh, `meow` → play the sound spatially-ish (volume by distance) + critter reactions.
- Shared-goal note: goals stay per-player this milestone (duo goals are M2/out); tips/digs/collects are first-come — remote application marks them consumed so the local player can't double-earn (prompts skip consumed objects; toast "Hagrid got there first! 🐔" when your prompt target got sniped).

- [ ] Steps: TDD the two by-id APIs; wire outbound sends beside each canon action (guarded `if (s.net)`); one inbound dispatcher `applyRemoteEvent(s, ev)`; verify with tests + build; commit — `git commit -m "feat: mirror canon world events between players"`

---

### Task 5: Social interactions — boops, duets, rallies, nap piles

**Files:**
- Modify: `src/main.js`, `src/discoveries.js` (AWARDS), `src/toy.js` (setPosition for authority handoff)
- Test: extend `test/discoveries.test.js`

**Interfaces & mechanics:**
- AWARDS `+ rally: 6, nappile: 10, duet: 5, boop: 5`.
- **Touch noses:** E near a remote pet (≤1.5) sends `boop-request {toId}` and shows "waiting for a boop back… 💕" for 4 s; if the other player E's back (their client sees your pending request via the event and their own proximity), both clients emit `boop-confirm` → each awards `boop` (awardOnce per pair per walk), heart particle, purr.
- **Duet meow:** after a remote `meow` within 8 units, replying V within 3 s → both clients award `duet` (once per pair per walk) and play the harmonized second voice (+4 semitone pitch factor 1.26 on the tone frequencies — add optional `pitch` param to `audio.meow/cluck`).
- **Yarn rally:** the ball's owner broadcasts its position in the state message (`toy: [x, z] | null`); non-owners render a ghost ball. A remote player batting (they send `{type:'bat'}` when within 0.5 of the rendered ball) transfers authority to them (`{type:'yarn-authority', toId}` from current owner). Alternating-player consecutive bats count a shared rally; at 3/6/10 both award `rally` (keys rally-3/6/10 per walk).
- **Nap pile:** while your pose is `nap`, count remote pets napping within 1.2; ≥1 → award `nappile` once per walk ("nap pile! 😴"), scaling toast text with count.
- [ ] Steps: tests for the new AWARDS; implement; manual two-fake-net verification via a dev harness page is NOT required (fake-hub integration test in `test/net.test.js` style covering boop handshake logic as pure functions where feasible); commit — `git commit -m "feat: co-walk social interactions"`

---

### Task 6: Walk-together UI, env gating, deploy secrets, release

**Files:**
- Modify: `src/ui/homebase.js`, `src/main.js`, `src/style.css`, `README.md`, `.github/workflows/deploy.yml`, `src/progression.js` (petName field)
- Test: extend `test/progression.test.js` (petName default + persistence)

**Interfaces:**
- Home base section **"Walk together 🐾🐾"** (env-gated): shows your pet name (editable, `validPetName`-checked, saved via `progression.setPetName`), a **Host a walk** button (generates code, joins, shows "Room QWZ3 — waiting for friends…" with live roster) and a **Join** input + button. Starting the walk while in a room: host picks area normally; joiners' area/dusk selectors lock to the host's (host broadcasts `{type:'walk-config', area, dusk, seed}` on start; joiners' Start button becomes "Join the walk").
- HUD during co-walks: small roster chip (pet names + 🟢) top-right under the area pill.
- endWalk leaves the room; summary card gains "walked with: {names}".
- Workflow: pass `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from repo Actions secrets into the build step env. Graceful-absence path verified (local dev without keys shows the not-configured state).
- README multiplayer section.
- [ ] Steps: implement; full regression; browser verification of the UI states (configured/unconfigured); the real two-browser end-to-end happens post-deploy with the user's Supabase keys (controller + user walk together as the final acceptance test 🐈🐔); commit — `git commit -m "feat: walk-together rooms UI and deploy wiring"`

---

## External dependency (user-provided, before Task 6 can fully ship)

1. User creates a free Supabase project (supabase.com → New project).
2. User provides the **Project URL** and **anon public key** (Settings → API). The anon key is designed to be public — it ends up in the client bundle either way.
3. I add both as GitHub Actions secrets (`gh secret set`) and to a local `.env.local` (gitignored) for dev testing.

Tasks 1–5 are fully buildable and testable against the fake hub without these.

## Plan Self-Review Notes

- Spec coverage: co-walk phase fully; async phases (leaderboard/ghosts/gifts) intentionally deferred per user's phase-order choice; duo goals/tag/ambush/grooming/relay-quests deferred to a follow-up wave (spec marks them Phase-2 features but this plan ships the four highest-charm interactions first — noted deviation, revisit in v5.1).
- Save version stays 3 with an additive `petName ??= null` post-load default (documented in Task 6).
- Risk register: Supabase Realtime rate limits (free tier defaults comfortably exceed 4 players × 8 Hz; if throttling appears, drop to 5 Hz and widen interpolation), clock skew (interpolation uses local receive-time only — no clock sync needed), tab-hidden throttling (rAF pauses → remote sees freeze then despawn; acceptable).
