# Whisker Walk v21 — Stream 2: The Shared Colony — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two siblings tame the same named strays over many walks, one bar per cat, until each cat comes home to the den — and each finds the other's work waiting when they open the game.

**Architecture:** A pure leaf module (`src/colony.js`) owns every rule: the taming ladder, the add-only merge, sanitizing, news, trades and rewards. `progression.js` stores the colony as one new save key and is still the only writer. A new SQL file adds six tables and nine `SECURITY DEFINER` RPCs that the owner runs. All colony reads and writes go through those RPCs, and the tables have no public select. `game/colonysync.js` talks to the cloud and degrades to a local single-player colony whenever the cloud is missing. The walk spawns colony cats at fixed spots, adds a feed verb, and puts tamed cats in the den. The home base gains a Colony tab and a "while you were out" card. Pair walks join a private room derived from the colony id, so nobody types a code and either player can start.

**Tech Stack:** Three.js ~0.185, Vite 8, Vitest 4, Supabase JS 2 (RPC + Realtime). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-24-whisker-walk-v21-reason-to-come-back-design.md` — Stream 2 and its four binding decisions; §9 items 1–4, 6–9; §10.3 (trading); §3, §4 and §5.

## Scope

This plan covers **Stream 2, including trading (§10.3)**. Not included: Stream 3's carry verb and persistent marks, and redeem codes (§10.4, "standalone, anywhere"). Carry will later compose with feeding: carrying a treat to a stray is a Stream 3 enrichment of the feed verb built here, not a prerequisite for it.

## Decisions this plan makes (builder's calls, per spec §7)

Every one of these can be changed with a constant. They are fixed here so tasks agree with each other.

| Question | Decision |
|---|---|
| Taming ladder | `TAME_FEEDS = 6` feeds fill the bar. Feeding is free, once per player per cat per walk, and only after you have greeted that cat on this walk. |
| Head start (decision 3) | Greets from **before this walk** set the starting offset on the **same** bar: 1 greet → 1, 3 → 2, 6+ → 3, using the base `friendRungs(false)` 1/3/6 ladder. The offset is recorded on each feed, and the cat uses the largest one recorded, so it can only grow. The UI may say "you already knew Peanut ♥" but never draws a second track. |
| Names (§9.2) | Cats arrive pre-named from `CAT_NAMES` and can never be renamed. The finder is whoever fed the cat first, and is shown as "found by …". |
| Fixed spot | A cat's spot is its `home` where it was first fed. It is stored once and never moved: first insert wins, on the server and in the merge. |
| Two-feeder cat (§9.6) | About 1 in 4 names are **shy**, derived from the name. A shy cat with a full bar stays in its area until a second, different colony member has fed it. The rule applies only while the colony has 2 members, so a solo player is never stuck. |
| Tamed is stored, not derived | The client that fills the bar sets `tamedBy`/`tamedWalk`, and they are never cleared. So taming can't regress (§9.2), even if pairing later makes a cat count as shy. |
| Colony size | `COLONY_MAX = 24` cats in total, in progress plus tamed (the server's cap too). That is room for two siblings who each filled a 12-cat colony solo before pairing (final review C1). The cap **never removes a tamed cat**: past it, untamed cats are trimmed, local-only ones before the server's. It equals `DEN_HOMES.length` (the 12 furniture anchors plus 12 cat-only spots), so every tamed cat gets a den home; a tamed cat past the last home, which only a hostile or hand-edited colony can reach, is left out of the den. |
| Colony members | At most **2** players (the siblings). One colony per player. No unpairing in-game (add-only); `docs/COLONY-SETUP.md` gives the owner the SQL to unpair. |
| Pairing (decision 4) | The inviter shows a 6-character code that expires in 20 minutes. The joiner types it in, and the inviter must then confirm the joiner's pet name. That is consent from both sides, and a stranger cannot start it. |
| Den (§9.2, §9.8) | Furniture stays per-device, which is already true and means the den is split by construction. Tamed cats get a deterministic home spot, from taming order, that nobody can move. Each UTC day, each cat does one deterministic thing: nap, box, knocked-over, window or groom. That is presentation, not progress, so §9.3 holds. |
| Rewards (§9.7) | Colony milestones of 1, 3, 6 and 12 tamed cats unlock an accessory on each device: the first item in that milestone's list that you don't already own. No points, ever. |
| Dressing | A cat's **finder** can give it one accessory from their own wardrobe. It appears on the cat in areas and the den, on both devices. |
| Trading (§10.3) | A one-for-one accessory swap between the two members. Each player has at most one open offer, and accepting is **final**. Starter accessories (`bell`, `bandana`) can't be traded. |
| Sync cadence | Pull at boot, when the home base reappears after a walk, on pair-room join, and after each pairing, dress or trade action. Push each feed at once (fire-and-forget). Every pull also re-pushes any of my feeds the server lacks, so nothing is lost offline and no outbox is needed. |
| Live co-walk | Colony cats spawn in a room walk only if every other roster member is my colony partner, so worlds with non-partners stay identical. A new `colony-feed` event shows the partner's feed live (display only, never saved). |
| Host problem (§9.9) | A non-host's Start sends a new `walk-request` event, and the host client answers with `walk-config` for the requester's area. The button never reads "Waiting for host…". |

## Global Constraints

- No new dependencies. Three.js, Vite, Vitest, Supabase only (spec §3, §5).
- `SAVE_VERSION` stays **4**. `colony` is a new key with a sanitizer and a default (spec §5). A v20 save must load unchanged plus `colony: emptyColony()`.
- Pure logic lives in DOM-free, three-free leaf modules: `src/straynames.js`, `src/colony.js`, `src/ui/colonypanel.js` and `src/game/lobby.js` import no THREE and touch no DOM (spec §5).
- Hostile-input discipline: every cloud value is coerced in `colony.js`'s sanitizers **and** escaped at render. Use `textContent` or `escapeHtml`, never a raw interpolation (spec §5).
- Solo play never depends on the network. Without `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, or with the SQL not yet run, the colony is a local single-player colony and everything else works (spec §5).
- Determinism: colony spawning must not change how many values a walk draws from `walkRng`, or in what order (see `game/walk.js`'s warning at `startWalk`; spec §5).
- No free text crosses the wire. Cat names come from `CAT_NAMES`, items from `CATALOG.accessories` and pet names through `validPetName`. Only `walk-request` and `colony-feed` are added as event types, and the wire format is otherwise unchanged (spec §3).
- Anti-goals (spec §4): no whisker points for any colony action. Taming never regresses, and no colony mechanic can be lost by the younger player.
- **The builder never runs the SQL** and cannot reach the Supabase project. The SQL ships as a file plus run instructions (spec Stream 2 decision 2).
- Never commit on `main`. Work in the `feat/v21-stream2-colony` worktree at `.claude/worktrees/stream2-colony`. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm test` must pass at every commit. The deploy workflow runs it.

## Review Focus

These are the five conditions the spec implies that the happy paths don't exercise. Each one's test lives in the owning task.

1. **Cloud missing or failing.** This covers the SQL not yet run (PostgREST `PGRST202`), offline, or an RPC throwing mid-sync. The local colony must keep working, feeds made offline must reach the server on a later pull, no error may escape, and no toast may repeat. — Task 5.
2. **Co-walk draw order.** Two co-walkers whose colony snapshots differ, and rooms with a non-partner, must draw exactly the same `walkRng` sequence as today. — Tasks 6 and 12.
3. **A shy cat with no partner, or a partner who never plays.** The cat must still be tameable solo, and a cat tamed solo must stay tamed after pairing. — Tasks 1 and 2.
4. **A hostile snapshot.** That means unknown cat names, `__proto__` keys, NaN or huge coordinates, 10,000-element arrays, HTML in a pet name, or an unknown accessory id. Each value is dropped or coerced, and every rendered string is escaped. — Tasks 4 and 8.
5. **A trade seen by two pulls or across a reload, or a traded item that is equipped.** The trade applies exactly once, the item is unequipped, and a starter item is never removed. — Task 2 (logic) and Task 11 (wiring).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/straynames.js` | **New, pure.** `CAT_NAMES` (moved), `strayBreed`, `isStrayName`. |
| `src/colony.js` | **New, pure.** Ladder, feed, merge, sanitizers, news, den moments, trades, rewards. |
| `src/straycats.js` | **Modify.** Import names/breed from `straynames.js`; `colonyCats` spawn option; `where` filter on `nearest`. |
| `src/progression.js` | **Modify.** `state.colony`; colony methods; export `STARTER_ACCESSORIES`. |
| `docs/supabase-colony.sql` | **New.** Owner-run schema: tables, RLS, nine RPCs. Idempotent. |
| `docs/COLONY-SETUP.md` | **New.** How to run it, how to test on two devices, how to unpair. |
| `src/cloud.js` | **Modify.** Colony RPC wrappers. |
| `src/game/colonysync.js` | **New.** Pull/push/pairing/trade orchestration with graceful degradation. |
| `src/game/interactions.js` | **Modify.** `stray-feed` and `den-cat` prompts and handlers. |
| `src/game/walk.js` | **Modify.** Colony spawns, den cats, `colonyWalk` flag, colony-aware lobby start. |
| `src/dencats.js` | **New.** Renders tamed cats and their daily moment in the den. |
| `src/ui/colonypanel.js` | **New, pure.** HTML for the Colony tab and the news card. |
| `src/ui/hometabs.js` | **Modify.** `'colony'` tab. |
| `src/ui/homebase.js` | **Modify.** Colony tab wiring, pairing polling, trades, news card, "Walk with …". |
| `src/game/lobby.js` | **New, pure.** Lobby event decision: who starts what, where. |
| `src/game/rooms.js` | **Modify.** `walkWithPartner()`, `walk-request` handling. |
| `src/game/netevents.js` | **Modify.** `colony-feed` display. |
| `src/main.js` | **Modify.** Create colony sync; boot pull; wire deps. |
| `.claude/launch.json` | **Modify.** A second dev config on port 5175 for this worktree (no `.env.local` here, so MP is off). |

Shared types, defined once (Task 1 creates them; every later task uses these exact field names):

```
Cat   = { name, finder, area, x, z, wear: string|null, tamedBy: string|null, tamedWalk: string|null }
Feed  = { cat, by, walk, head }            // head = head-start offset 0..3 at feed time
Trade = { id: number, from, to, give, want, status: 'offered'|'accepted'|'declined'|'cancelled' }
Colony = { id: string|null, partner: { playerId, petName, wardrobe: string[] } | null,
           cats: Cat[], feeds: Feed[], trades: Trade[],
           tradesApplied: number[], rewarded: string[],
           seen: { feedKeys: string[], tamed: string[], trades: number[], day: string|null } }
```

`walk` is a walk stamp (`/^walk-\d{1,16}$/`, as `game/walk.js` mints it). `by`, `finder`, `from` and `to` are player ids (`/^[A-Za-z0-9-]{8,64}$/`). A feed's key is `${cat}|${by}|${walk}`.

---

### Task 1: Stray names and the taming ladder

**Model:** sonnet.

**Files:**
- Create: `src/straynames.js`, `src/colony.js`, `test/colony.test.js`
- Modify: `src/straycats.js` (import from `straynames.js`, re-export `CAT_NAMES`)

**Interfaces:**
- Produces, from `src/straynames.js` (imports nothing):
  - `CAT_NAMES` (moved verbatim from `straycats.js`)
  - `STRAY_BREEDS`
  - `strayBreed(name) -> string`, the exact hash `straycats.js:225` uses
  - `isStrayName(v) -> boolean`
- Produces, from `src/colony.js` (imports only `straynames.js`, `skills.js`, `rng.js`, `net.js`):
  - `TAME_FEEDS = 6`, `HEAD_START_MAX = 3`, `COLONY_MAX = 12`, `FEEDS_MAX = 160`
  - `COLONY_AREAS = ['neighborhood','park','seaside','docks']`
  - `emptyColony() -> Colony`
  - `headStartFor(priorGreets) -> 0..3`
  - `isShy(name) -> boolean`
  - `tamingProgress(colony, name, { members = 1 } = {}) -> { have, need, headStart, byPlayer: Array<{by, n}>, feeders, tamed, needsSecondFeeder }`
  - `canFeed(colony, name, by, walk, { members = 1 } = {}) -> 'ok'|'fed-this-walk'|'tamed'|'waiting'|'full'`
  - `feedCat(colony, { name, by, walk, area, x, z, head }, { members = 1 } = {}) -> { colony, result, tamedNow, progress }`. Pure, so it never mutates its input.
  - `catsInArea(colony, area) -> Cat[]` (untamed, sorted by name)
  - `tamedCats(colony) -> Cat[]` (sorted by `tamedWalk` ms, then name)

- [ ] **Step 1: Write the failing tests** (`test/colony.test.js`)

```js
import { describe, it, expect } from 'vitest';
import { CAT_NAMES, strayBreed, isStrayName } from '../src/straynames.js';
import { CAT_NAMES as LEGACY } from '../src/straycats.js';
import { TAME_FEEDS, COLONY_MAX, emptyColony, headStartFor, isShy, tamingProgress,
  canFeed, feedCat, catsInArea, tamedCats } from '../src/colony.js';

const ME = 'aaaaaaaa-1111', SIB = 'bbbbbbbb-2222';
const feed = (c, name, by, n, extra = {}) =>
  feedCat(c, { name, by, walk: `walk-${1000 + n}`, area: 'park', x: 3, z: -4, head: 0, ...extra }, extra.ctx);
const shyName = CAT_NAMES.find(isShy), boldName = CAT_NAMES.find((n) => !isShy(n));

describe('straynames', () => {
  it('is the same list straycats exports, and breed is stable', () => {
    expect(LEGACY).toBe(CAT_NAMES);
    expect(strayBreed('Pickles')).toBe(strayBreed('Pickles'));
    expect(isStrayName('Pickles')).toBe(true);
    for (const bad of ['Zeetoo', '__proto__', '', null, 7]) expect(isStrayName(bad)).toBe(false);
  });
});

describe('the taming ladder', () => {
  it('head start follows the base 1/3/6 rungs and never exceeds 3', () => {
    expect([0, 1, 2, 3, 5, 6, 40].map(headStartFor)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    for (const bad of [NaN, -1, '6', undefined]) expect(headStartFor(bad)).toBe(0);
  });
  it('a stranger takes TAME_FEEDS feeds; a known cat fewer, on ONE bar', () => {
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS - 1; i++) c = feed(c, boldName, ME, i).colony;
    expect(tamingProgress(c, boldName).tamed).toBe(false);
    const r = feed(c, boldName, ME, 99);
    expect(r.tamedNow).toBe(true);
    let k = emptyColony();
    k = feed(k, boldName, ME, 1, { head: 3 }).colony;
    const p = tamingProgress(k, boldName);
    expect(p).toMatchObject({ have: 4, need: TAME_FEEDS, headStart: 3 });
  });
  it('once per player per cat per walk; a second player in the same walk counts', () => {
    let c = feed(emptyColony(), boldName, ME, 1).colony;
    expect(canFeed(c, boldName, ME, 'walk-1001')).toBe('fed-this-walk');
    expect(canFeed(c, boldName, SIB, 'walk-1001', { members: 2 })).toBe('ok');
  });
  it('attribution counts each feeder separately', () => {
    let c = emptyColony();
    c = feed(c, boldName, ME, 1).colony; c = feed(c, boldName, ME, 2).colony;
    c = feed(c, boldName, SIB, 3, { ctx: { members: 2 } }).colony;
    expect(tamingProgress(c, boldName, { members: 2 }).byPlayer)
      .toEqual(expect.arrayContaining([{ by: ME, n: 2 }, { by: SIB, n: 1 }]));
  });
  it('the finder and fixed spot are set by the first feed and never move', () => {
    let c = feed(emptyColony(), boldName, ME, 1, { x: 3, z: -4 }).colony;
    c = feed(c, boldName, SIB, 2, { x: 30, z: 30, ctx: { members: 2 } }).colony;
    expect(c.cats[0]).toMatchObject({ name: boldName, finder: ME, area: 'park', x: 3, z: -4 });
  });
  it('a full colony refuses a new cat but still feeds existing ones', () => {
    let c = emptyColony();
    CAT_NAMES.slice(0, COLONY_MAX).forEach((n, i) => { c = feed(c, n, ME, i).colony; });
    expect(canFeed(c, CAT_NAMES[COLONY_MAX], ME, 'walk-9')).toBe('full');
    expect(canFeed(c, CAT_NAMES[0], ME, 'walk-9')).toBe('ok');
  });
  it('tamed cats leave their area and line up in taming order', () => {
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, boldName, ME, i).colony;
    expect(catsInArea(c, 'park').map((x) => x.name)).not.toContain(boldName);
    expect(tamedCats(c).map((x) => x.name)).toEqual([boldName]);
    expect(canFeed(c, boldName, ME, 'walk-77')).toBe('tamed');
  });
  it('isShy is deterministic and roughly one in four', () => {
    const shy = CAT_NAMES.filter(isShy).length;
    expect(shy).toBeGreaterThanOrEqual(8); expect(shy).toBeLessThanOrEqual(16);
  });
  // Review Focus 3
  it('a shy cat with a full bar waits for a SECOND feeder only when paired', () => {
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, shyName, ME, i, { ctx: { members: 2 } }).colony;
    expect(tamingProgress(c, shyName, { members: 2 })).toMatchObject({ tamed: false, needsSecondFeeder: true });
    expect(canFeed(c, shyName, ME, 'walk-50', { members: 2 })).toBe('waiting');
    expect(feed(c, shyName, SIB, 51, { ctx: { members: 2 } }).tamedNow).toBe(true);
    let solo = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) solo = feed(solo, shyName, ME, i).colony;
    expect(tamingProgress(solo, shyName).tamed).toBe(true);
    expect(tamingProgress(solo, shyName, { members: 2 }).tamed).toBe(true); // pairing later never un-tames
  });
  it('feedCat never mutates its input', () => {
    const c = emptyColony();
    const snapshot = JSON.stringify(c);
    feed(c, boldName, ME, 1);
    expect(JSON.stringify(c)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/colony.test.js`
Expected: FAIL — cannot resolve `../src/straynames.js`.

- [ ] **Step 3: Create `src/straynames.js`. Then make `straycats.js` import `CAT_NAMES`/`strayBreed` from it and re-export `CAT_NAMES`.**

`straycats.js` keeps its own `BREEDS` constant only if something else uses it. Otherwise it uses `strayBreed`. Run `npx vitest run test/catnames.test.js test/straycats.test.js` to confirm the move is behaviour-identical.

- [ ] **Step 4: Implement the `colony.js` exports listed above.**

- `isShy`: `seedFromCode(name) % 4 === 0`, using `rng.js`'s FNV, not `hashName` (see the collision note at `straycats.js:60`). If that puts the count outside 8–16 for the shipped names, use `% 4 === 1` instead and say so in a comment.
- `tamingProgress`: `have = min(need, headStart + feeds)`, where `headStart` is the max `head` over that cat's feeds. `tamed` reads `cat.tamedBy != null`. `needsSecondFeeder = !tamed && have >= need && isShy(name) && members >= 2 && feeders < 2`.
- `canFeed`: returns `'waiting'` only to a player who has **already** fed a cat that `needsSecondFeeder`. A colony member who has not fed it yet gets `'ok'`, and their feed tames it. `'fed-this-walk'` takes precedence over both.
- `feedCat`: returns `result` equal to `canFeed`'s answer. It changes nothing unless the answer is `'ok'`. It sets `tamedBy`/`tamedWalk` on the feed that makes `have >= need` without `needsSecondFeeder`. It rounds the spot to 0.1 m.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/colony.test.js test/catnames.test.js test/straycats.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/straynames.js src/colony.js src/straycats.js test/colony.test.js
git commit -m "feat(colony): taming ladder — one bar per cat, head start, shy cats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Colony save state — sanitize, merge, trades, rewards

**Model:** opus. The merge is where add-only is enforced.

**Files:**
- Modify: `src/colony.js`, `src/progression.js`
- Test: `test/colony.test.js` (extend), `test/progression.test.js` (extend)

**Interfaces:**
- Consumes: Task 1's types and functions.
- Produces, from `colony.js`:
  - `sanitizeColony(v, { knownItems: Set<string> }) -> Colony`. It never throws, and its caps are: `COLONY_MAX` cats (first wins by name), only feeds whose cat survived, at most `TAME_FEEDS` feeds per (cat, by), `FEEDS_MAX` feeds in total, the 20 newest trades by id, the last 50 `tradesApplied`, `rewarded` limited to `COLONY_REWARDS` ids, `seen.feedKeys` ≤ `FEEDS_MAX`, and `wear` that is null or in `knownItems`.
  - `mergeColony(local, remote) -> Colony`. `remote` is `{ id, partner, cats, feeds, trades }`, and the result is sanitized again.
  - `unsyncedFeeds(local, remote, me) -> Feed[]` returns my feeds whose key the remote lacks.
  - `tradeEffect(trade, me) -> { remove, add } | null` (accepted trades only).
  - `COLONY_REWARDS = [{ id: 'tamed-1', tamed: 1, items: ['heart','bowtie','socks'] }, { id: 'tamed-3', tamed: 3, items: ['crown','wizard','tophat'] }, { id: 'tamed-6', tamed: 6, items: ['wings','cape','jetpack'] }, { id: 'tamed-12', tamed: 12, items: ['monocle','balloon','raincoat'] }]`
  - `rewardsDue(colony, owned: string[]) -> Array<{ id, item: string|null }>`
- Produces, from `progression.js`:
  - `export const STARTER_ACCESSORIES = ['bell', 'bandana']`, used by `defaultState`
  - `state.colony`
  - `feedColonyCat({ name, by, walk, area, x, z }) -> { result, tamedNow, progress }`
  - `mergeColonySnapshot(remote)`
  - `setColonyLink({ id, partner })`
  - `dressColonyCat(name, item, me) -> boolean`
  - `applyColonyTrades(me) -> Trade[]`
  - `grantColonyRewards() -> string[]`
  - `markColonySeen(ymd)`
  - `colonyMembers() -> 1 | 2`

**Merge rules**, the conflict policy (spec Stream 2 decision 1):
- `id`, `partner` and `trades` come from remote. `tradesApplied`, `rewarded` and `seen` come from local.
- Cats are a union by name. On conflict, remote wins `finder`/`area`/`x`/`z`/`wear`, and `tamedBy = remote.tamedBy ?? local.tamedBy`, with `tamedWalk` paired the same way. So tamed is an OR, and never cleared.
- Feeds are a union by key.

- [ ] **Step 1: Write the failing tests** — append to `test/colony.test.js`:

```js
import { sanitizeColony, mergeColony, unsyncedFeeds, tradeEffect, rewardsDue, COLONY_REWARDS } from '../src/colony.js';
const ITEMS = new Set(['heart', 'crown', 'tophat', 'bowtie', 'socks', 'wizard']);

describe('sanitizeColony', () => {
  it('returns an empty colony for garbage', () => {
    for (const bad of [null, 7, 'x', [], { cats: 'no' }]) expect(sanitizeColony(bad, { knownItems: ITEMS })).toEqual(emptyColony());
  });
  // Review Focus 4
  it('drops hostile cats, feeds and items', () => {
    const v = { cats: [
      { name: '__proto__', finder: ME, area: 'park', x: 0, z: 0 },
      { name: 'Pickles', finder: ME, area: 'moon', x: 0, z: 0 },
      { name: 'Noodle', finder: '<img>', area: 'park', x: 0, z: 0 },
      { name: 'Biscuit', finder: ME, area: 'park', x: NaN, z: 1e9, wear: 'laser' },
      ...Array.from({ length: 10000 }, () => ({ name: 'Fig', finder: ME, area: 'park', x: 0, z: 0 })) ],
      feeds: [{ cat: 'Ghost', by: ME, walk: 'walk-1', head: 0 }, { cat: 'Biscuit', by: ME, walk: 'walk-1', head: 99 }] };
    const c = sanitizeColony(v, { knownItems: ITEMS });
    expect(c.cats.map((x) => x.name)).toEqual(['Biscuit', 'Fig']);
    const b = c.cats[0];
    expect(Number.isFinite(b.x) && Math.abs(b.z) <= 200).toBe(true);
    expect(b.wear).toBe(null);
    expect(c.feeds).toEqual([{ cat: 'Biscuit', by: ME, walk: 'walk-1', head: 3 }]);
  });
});

describe('mergeColony — add-only', () => {
  const remoteOf = (c) => ({ id: 'col1', partner: { playerId: SIB, petName: 'Robin', wardrobe: [] }, cats: c.cats, feeds: c.feeds, trades: [] });
  it('unions feeds, keeps the server finder/spot, and never clears tamed', () => {
    let local = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) local = feed(local, boldName, ME, i, { x: 1, z: 1 }).colony;
    let remote = feed(emptyColony(), boldName, SIB, 50, { x: 9, z: 9 }).colony;
    const m = mergeColony(local, remoteOf(remote));
    expect(m.cats[0]).toMatchObject({ finder: SIB, x: 9, z: 9, tamedBy: ME });
    expect(m.feeds).toHaveLength(TAME_FEEDS + 1);
    expect(m.id).toBe('col1');
  });
  it('is idempotent', () => {
    const r = remoteOf(feed(emptyColony(), boldName, SIB, 1).colony);
    const once = mergeColony(emptyColony(), r);
    expect(mergeColony(once, r)).toEqual(once);
  });
  it('unsyncedFeeds lists only MY feeds the server lacks', () => {
    let local = feed(emptyColony(), boldName, ME, 1).colony;
    local = feed(local, boldName, SIB, 2, { ctx: { members: 2 } }).colony;
    expect(unsyncedFeeds(local, remoteOf(emptyColony()), ME).map((f) => f.by)).toEqual([ME]);
  });
});

describe('trades and rewards', () => {
  it('tradeEffect reads each side of an accepted swap, and nothing else', () => {
    const t = { id: 4, from: ME, to: SIB, give: 'tophat', want: 'crown', status: 'accepted' };
    expect(tradeEffect(t, ME)).toEqual({ remove: 'tophat', add: 'crown' });
    expect(tradeEffect(t, SIB)).toEqual({ remove: 'crown', add: 'tophat' });
    expect(tradeEffect({ ...t, status: 'offered' }, ME)).toBe(null);
    expect(tradeEffect(t, 'cccccccc-3333')).toBe(null);
  });
  it('rewardsDue skips owned items and milestones already granted', () => {
    let c = emptyColony();
    for (let i = 0; i < TAME_FEEDS; i++) c = feed(c, boldName, ME, i).colony;
    expect(rewardsDue(c, ['heart'])).toEqual([{ id: 'tamed-1', item: 'bowtie' }]);
    expect(rewardsDue({ ...c, rewarded: ['tamed-1'] }, [])).toEqual([]);
  });
});
```

Append to `test/progression.test.js`:

```js
it('a v20 save loads with an empty colony and SAVE_VERSION 4', () => { /* v20-shaped payload without `colony` → state.colony deep-equals emptyColony(); state.version === 4 */ });
it('feedColonyCat uses greets from BEFORE this walk as the head start', () => {
  /* recordGreet('Pickles','tabby','walk-5') six times across walks, then once with 'walk-9';
     feedColonyCat({ name:'Pickles', by: pid, walk:'walk-9', area:'park', x:0, z:0 })
     → progress.headStart === 3 (six prior greets), not computed from seven */
});
it('feedColonyCat refuses an unknown name or area without writing', () => { /* returns result !== 'ok', storage.setItem not called */ });
// Review Focus 5
it('applyColonyTrades applies an accepted trade exactly once, unequips, and never removes a starter', () => {
  /* own + equip 'tophat'; mergeColonySnapshot with accepted trade {id:4, from: me, give:'tophat', want:'crown'}
     → applyColonyTrades(me) returns [trade]; 'tophat' gone, 'crown' owned, equipped.head === null;
     second call → []; createProgression on the same storage (reload) then applyColonyTrades → [];
     a trade giving 'bell' → 'bell' still owned */
});
it('grantColonyRewards unlocks once per milestone and returns the items', () => { /* tame one cat → ['heart'] owned; second call → [] */ });
it('dressColonyCat only lets the finder dress, and only with an owned item', () => { /* finder + owned → true; other id → false; unowned item → false; null clears */ });
```

Write those progression tests out in full, using the file's existing `fakeStorage` helper and shape. The comments state exactly what each must assert.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/colony.test.js test/progression.test.js`
Expected: FAIL — `sanitizeColony` etc. not exported; `state.colony` undefined.

- [ ] **Step 3: Implement the `colony.js` additions.** Follow `progression.js`'s established sanitizer shape: validate every entry, iterate payload arrays but never use a payload value as an object key, and dedupe while capping. Clamp coordinates to ±200 m and round to 0.1. Clamp `head` to 0..`HEAD_START_MAX`. Validate the partner's `petName` with `validPetName`, falling back to `'your partner'`. Filter the partner's `wardrobe` to `knownItems`, at most 40 entries.

- [ ] **Step 4: Wire `progression.js`.**

- Add `colony: emptyColony()` to `defaultState` and `colony: sanitizeColony(parsed.colony, { knownItems })` to `sanitizeState`, where `knownItems` is the set of `CATALOG.accessories` keys.
- `feedColonyCat` computes `head = headStartFor(greets - (friends[name]?.lastWalk === walk ? 1 : 0))` and `members = colonyMembers()`, calls `feedCat`, and saves only when `result === 'ok'`.
- `applyColonyTrades` removes from `unlocked.accessories` unless the item is in `STARTER_ACCESSORIES`, nulls any `equipped` slot holding the removed item, adds the incoming item if it is a known accessory, and pushes the id to `tradesApplied`. All of that happens in one `save()`.
- `grantColonyRewards` pushes each due milestone id to `rewarded`, even when its `item` is null, so it never re-fires.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. The existing progression shape tests must still pass, so check any `toEqual` on the whole state and extend it with `colony` rather than weakening it.

- [ ] **Step 6: Commit**

```bash
git add src/colony.js src/progression.js test/colony.test.js test/progression.test.js
git commit -m "feat(colony): save key, add-only merge, trades and cosmetic rewards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The colony schema (owner-run SQL)

**Model:** opus. This is the riskiest single item in v21 (spec §10).

**Files:**
- Create: `docs/supabase-colony.sql`, `docs/COLONY-SETUP.md`, `test/colonysql.test.js`, `test/fixtures/colonyrpcs.js` (exports `RPCS`, the table below as `{ name: [args] }`, so Task 4's test can import it without importing a test file — importing a test file would register its suites twice)

**Interfaces — the contract.** Argument names are exactly these, because Task 4's wrappers and the contract test read them.

| RPC | Arguments | Returns |
|---|---|---|
| `colony_invite_open` | `p_player_id text, p_secret text` | jsonb `{status:'ok', code, expires_at}` \| `{status:'already-paired'\|'denied'}` |
| `colony_invite_join` | `p_player_id, p_secret, p_code text` | jsonb `{status:'pending', inviter_pet_name}` \| `{status:'bad-code'\|'self'\|'already-paired'\|'taken'\|'denied'}` |
| `colony_invite_answer` | `p_player_id, p_secret, p_accept boolean` | jsonb `{status:'paired', colony_id}` \| `{status:'declined'\|'no-joiner'\|'denied'}` |
| `colony_sync` | `p_player_id, p_secret, p_wardrobe jsonb` | jsonb, see below |
| `colony_feed` | `p_player_id, p_secret, p_cat text, p_walk text, p_area text, p_x real, p_z real, p_head integer, p_tamed boolean` | text `ok\|unpaired\|bad\|full\|denied` |
| `colony_dress` | `p_player_id, p_secret, p_cat text, p_item text` | text `ok\|not-finder\|bad\|unpaired\|denied` |
| `colony_trade_offer` | `p_player_id, p_secret, p_give text, p_want text` | jsonb `{status:'ok', id}` \| `{status:'not-owned'\|'bad'\|'unpaired'\|'denied'}` |
| `colony_trade_answer` | `p_player_id, p_secret, p_trade_id bigint, p_accept boolean` | text `accepted\|declined\|gone\|denied` |
| `colony_trade_cancel` | `p_player_id, p_secret, p_trade_id bigint` | text `cancelled\|gone\|denied` |

`colony_sync` returns one of three shapes:
- `{status:'denied'}`
- `{status:'unpaired', invite: null|{code, expires_at, joiner_pet_name|null}, joining: null|{inviter_pet_name}}`
- `{status:'paired', colony_id, members:[{player_id, pet_name, wardrobe}], cats:[{name, finder_id, area, x, z, wear, tamed_by, tamed_walk}], feeds:[{cat, by_id, walk, head}], trades:[{id, from_id, to_id, give, want, status}]}`

**Tables:**
- `colonies (id text pk default <16 random hex>, created_at)`
- `colony_members (player_id text pk, colony_id fk, wardrobe jsonb default '[]', joined_at)` — the player_id primary key is what makes it one colony per player
- `colony_invites (code text pk, inviter_id text unique, joiner_id text, created_at, expires_at)`
- `colony_cats (colony_id, name, finder_id, area, x, z, wear, tamed_by, tamed_walk, created_at, pk(colony_id,name))`
- `colony_feeds (colony_id, cat, by_id, walk, head, created_at, pk(colony_id,cat,by_id,walk))`
- `colony_trades (id bigserial pk, colony_id, from_id, to_id, give, want, status, created_at, decided_at)`

**Rules the SQL enforces:**
- Every RPC authenticates the caller exactly as `record_friend_greet` does: a `profiles` row whose `secret` matches.
- RLS is enabled on all six tables, with **no** select policy. `revoke all … from anon` on all of them. Walks stay private (§9 decided); reads go only through `colony_sync`.
- An internal helper, if any, is `revoke execute … from public, anon`.
- `colony_feed` validates:
  - name `^[A-Za-z][A-Za-z ]{0,23}$`
  - area in the four ids
  - walk `^walk-[0-9]{1,16}$`
  - `|x|,|z| ≤ 200`
  - `head` 0..3
- `colony_feed` refuses a new cat once the colony has 12, inserts the cat with `on conflict do nothing` (first finder wins), and inserts the feed with `on conflict do nothing`. A retry is a no-op `ok`.
- `colony_feed` with `p_tamed` sets `tamed_by`/`tamed_walk` only where they are null. They are never cleared.
- Invites expire after 20 minutes; opening a new one replaces the caller's old one. The code is 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. A colony has at most 2 members.
- `colony_invite_answer` with `accept` creates the colony (or reuses the inviter's), adds both members, and deletes the invite. With decline, it clears `joiner_id`.
- Trades:
  - one open offer per player — a new offer cancels the old one
  - `give` must be in the offerer's stored wardrobe and `want` in the partner's
  - only `to` may answer, only `from` may cancel, and only from `offered`
  - `accepted` is final
  - keep at most 50 trades per colony, deleting the oldest resolved ones
- `p_wardrobe` must be a jsonb array of at most 40 strings matching `^[a-z]{1,16}$`. Otherwise it is stored as `[]`.
- Idempotent throughout: `create table if not exists`, `create or replace function`, `drop policy if exists`.

- [ ] **Step 1: Write the failing contract test** (`test/colonysql.test.js`)

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { RPCS } from './fixtures/colonyrpcs.js';
const sql = readFileSync(new URL('../docs/supabase-colony.sql', import.meta.url), 'utf8');
/* test/fixtures/colonyrpcs.js:
export const RPCS = {
  colony_invite_open: ['p_player_id', 'p_secret'],
  colony_invite_join: ['p_player_id', 'p_secret', 'p_code'],
  colony_invite_answer: ['p_player_id', 'p_secret', 'p_accept'],
  colony_sync: ['p_player_id', 'p_secret', 'p_wardrobe'],
  colony_feed: ['p_player_id', 'p_secret', 'p_cat', 'p_walk', 'p_area', 'p_x', 'p_z', 'p_head', 'p_tamed'],
  colony_dress: ['p_player_id', 'p_secret', 'p_cat', 'p_item'],
  colony_trade_offer: ['p_player_id', 'p_secret', 'p_give', 'p_want'],
  colony_trade_answer: ['p_player_id', 'p_secret', 'p_trade_id', 'p_accept'],
  colony_trade_cancel: ['p_player_id', 'p_secret', 'p_trade_id'],
};
*/
const TABLES = ['colonies', 'colony_members', 'colony_invites', 'colony_cats', 'colony_feeds', 'colony_trades'];

describe('supabase-colony.sql', () => {
  it('defines every RPC with exactly the contract arguments, as SECURITY DEFINER', () => {
    for (const [name, args] of Object.entries(RPCS)) {
      const m = sql.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)[\\s\\S]*?\\$\\$`, 'i'));
      expect(m, name).toBeTruthy();
      expect(m[1].match(/p_[a-z_]+/g)).toEqual(args);
      expect(m[0]).toMatch(/security definer/i);
      expect(m[0]).toMatch(/set search_path = public/i);
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to anon`, 'i'));
    }
  });
  it('enables RLS on every table, revokes anon, and adds no select policy', () => {
    for (const t of TABLES) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${t}\\b`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${t} from anon`, 'i'));
      expect(sql).not.toMatch(new RegExp(`create policy[^;]*on public\\.${t}\\b`, 'i'));
    }
  });
  it('never touches the v7 tables or smuggles state through profiles', () => {
    expect(sql).not.toMatch(/upsert_profile|alter table public\.(saves|profiles|friendships)/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/colonysql.test.js`
Expected: FAIL — ENOENT `docs/supabase-colony.sql`.

- [ ] **Step 3: Write `docs/supabase-colony.sql`** to the contract and rules above. Model the header comment and auth check on `docs/supabase-setup.sql`. Comment every rule that enforces add-only.

- [ ] **Step 4: Write `docs/COLONY-SETUP.md`**, covering:
  1. Why this is needed (one sentence).
  2. How to run it: Supabase → SQL Editor → New query → paste the whole file → Run. Safe to re-run, and it does not touch the v7 tables.
  3. How to check it worked: Table Editor shows the six `colony_*` tables, and Database → Functions lists the nine RPCs.
  4. A two-device test checklist: pair, feed the same cat from both, see "while you were out", walk together via "Walk with …", trade.
  5. **How to unpair** (`delete from colony_members where player_id = '…'`), and how to find a player id (the friend code `CAT-XXXXXXXX` is its first 8 characters).
  6. What the game does before the SQL is run: the colony is local-only, with the line "Colony sharing isn't switched on yet."

- [ ] **Step 5: Run the test**

Run: `npx vitest run test/colonysql.test.js`
Expected: PASS.

- [ ] **Step 6 (needs the owner's approval, given at plan sign-off): execute the SQL against an in-memory Postgres.** Install `@electric-sql/pglite` into the session scratchpad (`npm i --prefix <scratchpad>/pg @electric-sql/pglite`, about 3 MB from npm, **not** added to `package.json`). Then run a scratch script that:
  - stubs a `profiles` table and an `anon` role
  - runs `docs/supabase-setup.sql` then `docs/supabase-colony.sql` **twice** (idempotence)
  - drives invite → join → answer → feed ×2 players → sync → trade offer → answer → sync, asserting each status

  Record the result in the commit body. If the owner declines, skip this step and record that in the hand-off.

- [ ] **Step 7: Commit**

```bash
git add docs/supabase-colony.sql docs/COLONY-SETUP.md test/colonysql.test.js test/fixtures/colonyrpcs.js
git commit -m "feat(colony): owner-run schema — private tables, nine add-only RPCs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cloud client and inbound snapshot sanitizer

**Model:** sonnet.

**Files:**
- Modify: `src/cloud.js`, `src/colony.js`
- Test: `test/cloud.test.js` (extend), `test/colony.test.js` (extend)

**Interfaces:**
- Consumes: the RPC contract (Task 3) and `sanitizeColony` (Task 2).
- Produces, from `createCloud`. Each wrapper maps camelCase to the `p_` names and passes the result through unchanged:
  - `colonyInviteOpen(id, secret)`
  - `colonyInviteJoin(id, secret, code)`
  - `colonyInviteAnswer(id, secret, accept)`
  - `colonySync(id, secret, wardrobe)`
  - `colonyFeed(id, secret, { cat, walk, area, x, z, head, tamed })`
  - `colonyDress(id, secret, cat, item)`
  - `colonyTradeOffer(id, secret, give, want)`
  - `colonyTradeAnswer(id, secret, tradeId, accept)`
  - `colonyTradeCancel(id, secret, tradeId)`
- Produces, from `colony.js`: `sanitizeSnapshot(raw, { me, knownItems }) -> { status: 'paired'|'unpaired'|'denied'|'bad', remote?: { id, partner, cats, feeds, trades }, invite?: { code, expiresAt, joinerPetName }|null, joining?: { inviterPetName }|null }`. It maps the SQL's snake_case to the shared types (`finder_id → finder`, `by_id → by`, …). `partner` is the member whose `player_id !== me`. Anything malformed gives `{ status: 'bad' }`.

- [ ] **Step 1: Write the failing tests**

```js
// test/cloud.test.js — appended
import { RPCS } from './fixtures/colonyrpcs.js';
it('every colony wrapper sends exactly the SQL contract arguments', async () => {
  const calls = [];
  const cloud = createCloud({ rpc: async (name, args) => { calls.push({ name, args }); return 'ok'; }, select: async () => [] });
  await cloud.colonyInviteOpen('id', 's'); await cloud.colonyInviteJoin('id', 's', 'K7P2QM');
  await cloud.colonyInviteAnswer('id', 's', true); await cloud.colonySync('id', 's', ['crown']);
  await cloud.colonyFeed('id', 's', { cat: 'Pickles', walk: 'walk-1', area: 'park', x: 1, z: 2, head: 1, tamed: false });
  await cloud.colonyDress('id', 's', 'Pickles', 'crown'); await cloud.colonyTradeOffer('id', 's', 'crown', 'tophat');
  await cloud.colonyTradeAnswer('id', 's', 4, true); await cloud.colonyTradeCancel('id', 's', 4);
  for (const { name, args } of calls) expect(Object.keys(args)).toEqual(RPCS[name]);
  expect(calls).toHaveLength(Object.keys(RPCS).length);
});
```

```js
// test/colony.test.js — appended. Review Focus 4.
import { sanitizeSnapshot } from '../src/colony.js';
describe('sanitizeSnapshot', () => {
  it('maps a paired snapshot and picks out the partner', () => {
    const s = sanitizeSnapshot({ status: 'paired', colony_id: 'c0ffee00c0ffee00',
      members: [{ player_id: ME, pet_name: 'Mo', wardrobe: [] }, { player_id: SIB, pet_name: 'Robin', wardrobe: ['crown', 'laser'] }],
      cats: [{ name: 'Pickles', finder_id: SIB, area: 'park', x: 1, z: 2, wear: null, tamed_by: null, tamed_walk: null }],
      feeds: [{ cat: 'Pickles', by_id: SIB, walk: 'walk-1', head: 0 }], trades: [] }, { me: ME, knownItems: ITEMS });
    expect(s.status).toBe('paired');
    expect(s.remote.partner).toEqual({ playerId: SIB, petName: 'Robin', wardrobe: ['crown'] });
    expect(s.remote.cats[0].finder).toBe(SIB);
  });
  it('escape-proofs a hostile pet name and survives any shape', () => {
    const s = sanitizeSnapshot({ status: 'paired', colony_id: 'x', members: [{ player_id: SIB, pet_name: '<script>' }] }, { me: ME, knownItems: ITEMS });
    expect(s.remote.partner.petName).toBe('your partner');
    for (const bad of [null, 'paired', [], { status: 'paired', members: 'x', cats: {} }]) {
      expect(() => sanitizeSnapshot(bad, { me: ME, knownItems: ITEMS })).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/cloud.test.js test/colony.test.js`
Expected: FAIL — the wrappers don't exist.

- [ ] **Step 3: Implement the wrappers and `sanitizeSnapshot`.** Non-finite coordinates coerce to 0 before clamping, the same rule as `sanitizeColony`. Extend the `cloud.js` header comment that says arg names must match the SQL so it names both SQL files.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/cloud.test.js test/colony.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cloud.js src/colony.js test/cloud.test.js test/colony.test.js
git commit -m "feat(colony): cloud RPC wrappers and inbound snapshot sanitizer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Colony sync — pull, push, pairing, graceful degradation

**Model:** opus.

**Files:**
- Create: `src/game/colonysync.js`, `test/colonysync.test.js`
- Modify: `src/main.js` (create it after `createRooms`, pull once at boot, `pull()` on summary-continue beside `sync.autoSync()`)

**Interfaces:**
- Consumes: the Task 4 wrappers and `sanitizeSnapshot`; the Task 2 progression methods; `pushProfileNow` from `game/rooms.js`.
- Produces: `createColonySync({ MP, pid, getCloud, getPsecret, pushProfileNow, progression, onChange }) -> colonySync`, with:
  - `available: boolean` (equal to `MP`)
  - `status() -> { mode: 'local'|'needs-name'|'unpaired'|'paired'|'offline'|'not-set-up', invite, joining, lastError }`
  - `pull() -> Promise<{ appliedTrades: Trade[], rewards: string[] }>`. It is single-flight (a concurrent call returns the in-flight promise) and never rejects.
  - `pushFeed(feed)`, fire-and-forget, only when paired
  - `pairing.open()`, `pairing.join(code)` and `pairing.answer(accept)`, each `-> Promise<{ ok, status }>`
  - `dress(name, item)`, `trade.offer(give, want)`, `trade.answer(id, accept)` and `trade.cancel(id)`, each `-> Promise<{ ok, status }>` and each ending in `pull()`
  - `onChange` is called after any status or colony change, so the home base re-renders.

`pull()`:
1. If `!MP`, set mode `local`.
2. If there is no valid pet name, set `needs-name`.
3. Await `pushProfileNow()`.
4. Call `colonySync(pid, psecret, wardrobe)`, where `wardrobe` is the owned accessories minus `STARTER_ACCESSORIES`.
5. `sanitizeSnapshot` the result.
6. If paired: `setColonyLink`, push each of `unsyncedFeeds` via `colonyFeed`, setting `tamed` when `cat.tamedBy === pid && cat.tamedWalk === feed.walk` (at most 40 per pull), and re-push `wear` for my finds where the local value differs.
7. `mergeColonySnapshot`, then `applyColonyTrades(pid)`, then `grantColonyRewards()`.

On a thrown error, set mode `not-set-up` when the error's `code === 'PGRST202'` or its message names a missing function, and `offline` otherwise. Log with `console.warn` once per mode change, not per call.

- [ ] **Step 1: Write the failing tests** (`test/colonysync.test.js`). Use a fake cloud whose methods record calls and return scripted values, plus a real `createProgression(fakeStorage())`.

```js
it('is local-only and makes no call when MP is off', async () => { /* pull() → status().mode 'local'; fake cloud untouched */ });
it('asks for a pet name before touching the cloud', async () => { /* petName null → mode 'needs-name'; no rpc */ });
// Review Focus 1
it('degrades to not-set-up when the SQL has not been run, and keeps the local colony', async () => {
  /* colonySync throws { code: 'PGRST202' } → mode 'not-set-up'; pull resolves; a local feed made before is still in state.colony.feeds */
});
it('degrades to offline on a network error and never rejects', async () => { /* throws TypeError('Failed to fetch') → mode 'offline'; await expect(pull()).resolves… */ });
it('pushes feeds made while offline on the next successful pull', async () => {
  /* paired snapshot with no feeds + local feed by pid → exactly one colonyFeed call with that walk; second pull after the server echoes it → no further colonyFeed */
});
it('concurrent pulls share one request', async () => { /* Promise.all([pull(), pull()]) → colonySync called once */ });
it('applies an accepted trade once even across two pulls', async () => { /* snapshot with accepted trade, two pulls → appliedTrades length 1 then 0 */ });
it('pairing.join reports bad-code without throwing', async () => { /* colonyInviteJoin → {status:'bad-code'} → { ok:false, status:'bad-code' } */ });
```

Write these out in full. The comments define the arrangement and assertions.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/colonysync.test.js`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement `src/game/colonysync.js`**, with `cloudsync.js`'s lazy-handle discipline: never create a cloud when `!MP`.

- [ ] **Step 4: Wire `main.js`.** Pass `colonySync` into `createInteractions`, `createWalkLifecycle`, `createRooms` and `createHomeBase`. Later tasks consume it; an unused optional parameter is fine at this commit. Call `colonySync.pull()` once after `homebase.show()` at boot, and beside `sync.autoSync()` in the summary-continue handler.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/colonysync.js src/main.js test/colonysync.test.js
git commit -m "feat(colony): sync that catches up offline feeds and degrades to local

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Colony cats at fixed spots, and the feed verb

**Model:** opus. It touches the shared-stream warning and the prompt ladder.

**Files:**
- Create: `src/game/lobby.js` with `rosterIsPartnerOnly(rosterIds, selfId, partnerId) -> boolean` only (Task 12 adds `decideLobbyEvent`), `test/lobby.test.js`
- Modify: `src/straycats.js`, `src/game/interactions.js`, `src/game/walk.js`
- Test: `test/straycats.test.js`, `test/interactions.test.js` (extend)

**Interfaces:**
- Consumes: `catsInArea`, `canFeed` and `tamingProgress` (Task 1); `progression.feedColonyCat` and `grantColonyRewards` (Task 2); `colonySync.pushFeed` (Task 5).
- Produces:
  - `createStrayCats(scene, area, count, rng, { grudges, roomSeed, colonyCats = [] })`. Each entry of `colonyCats` is `{ name, x, z, wear: { slot, id } | null }`. Each stray gains `colony: boolean`.
  - `strayCats.nearest(pos, maxDist, { …existing, where })`, where `where(stray) -> boolean` is an extra filter.
  - Prompt kind `'stray-feed'` (data: the stray).
  - `session.colonyWalk: boolean` (solo, or a room whose every other member is my partner).
  - The 'colony-feed' wire event `{ v:1, id, type:'colony-feed', cat }`, sent on a successful feed when `session.net && session.colonyWalk` (received in Task 12).

**Spawn rule:**
- Draw `shuffled(CAT_NAMES, rng)` and then the same five per-index draws (x, z, facing, roll, timer) for every `i < count`, exactly as today, so the draw count and order are unchanged.
- The cat list is `colonyCats` (up to `count`), then shuffled names not in the colony set.
- A colony entry overrides position and `home` with its spot, clamped to bounds. Its personality is `'shy'` when `isShy(name)`, and otherwise the rolled personality with `'shy'` mapped to `'bold'`. It wears its item through `buildCat(breed, { [slot]: id }, { simple: true })`.

- [ ] **Step 1: Write the failing tests**

```js
// test/straycats.test.js — appended. Review Focus 2.
const counting = () => { let n = 0; const f = () => { n++; return ((n * 0.6180339887) % 1); }; f.count = () => n; return f; };
it('colony cats do not change how many walkRng values a spawn draws', () => {
  const a = counting(), b = counting();
  createStrayCats(scene, AREA, 22, a);
  createStrayCats(scene, AREA, 22, b, { colonyCats: [{ name: 'Pickles', x: 5, z: 6, wear: null }] });
  expect(b.count()).toBe(a.count());
});
it('a colony cat stands at its fixed spot, once, and keeps its name', () => {
  const s = createStrayCats(scene, AREA, 22, () => 0.42, { colonyCats: [{ name: 'Pickles', x: 5, z: 6, wear: null }] });
  const p = s.strays.filter((x) => x.name === 'Pickles');
  expect(p).toHaveLength(1);
  expect(p[0]).toMatchObject({ colony: true });
  expect([p[0].home.x, p[0].home.z]).toEqual([5, 6]);
});
it('more colony cats than the count are truncated, never overflowing', () => {
  const many = CAT_NAMES.slice(0, 20).map((name) => ({ name, x: 0, z: 0, wear: null }));
  expect(createStrayCats(scene, AREA, 14, () => 0.3, { colonyCats: many }).strays).toHaveLength(14);
});
it('nearest honours a where filter', () => { /* two strays in range; where excludes the nearer → returns the farther */ });
```

```js
// test/lobby.test.js — Review Focus 2
it('a room with a non-partner spawns no colony cats', () => {
  expect(rosterIsPartnerOnly(['me', 'sib'], 'me', 'sib')).toBe(true);
  expect(rosterIsPartnerOnly(['me', 'sib', 'stranger'], 'me', 'sib')).toBe(false);
  expect(rosterIsPartnerOnly(['me', 'sib'], 'me', undefined)).toBe(false);
});
```

```js
// test/interactions.test.js — appended, using the file's existing session/progression fakes
it('offers the feed prompt only after the cat was greeted this walk', () => { /* ungreeted → 'stray'; after greet → 'stray-feed' "E — feed Pickles 🐟" */ });
it('a feed writes once per walk and pushes it to the colony sync', () => { /* handleInteract twice → feedColonyCat result 'ok' then no second feed; pushFeed called once with { cat:'Pickles', walk: s.walkStamp } */ });
it('never pays whisker points for feeding', () => { /* points unchanged after a feed and after a taming feed */ });
it('a cross cat is never offered food', () => { /* hasGrudge → prompt is 'stray-gift', never 'stray-feed' */ });
it('a rupture never touches the colony (spec §9.2: annoyed at one player, nobody loses progress)', () => { /* cat with 3 feeds; force shouldTurnHostile → grudge recorded; state.colony deep-equals its value before */ });
it('a shy cat waiting for the partner shows a no-op prompt naming them', () => { /* members 2, bar full → prompt text contains partner petName, handleInteract feeds nothing */ });
it('the taming feed toasts, grants the reward and does not spawn the cat again next walk', () => { /* tamedNow → toast mentions the den; grantColonyRewards called; catsInArea excludes it */ });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/straycats.test.js test/interactions.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the spawn rule in `straycats.js`.** Extend the `createStrayCats` header comment to explain why colony cats consume the same draws.

- [ ] **Step 4: Add the feed prompt and handler in `interactions.js`.**

The prompt goes immediately after the existing greet branch in the same slot: if there is no greet or treat prompt, take the nearest greeted, non-cross stray where `canFeed(...) === 'ok'` → `'stray-feed'`. A `'waiting'` cat shows `"<name> is shy — waiting for <partner> 🐾"` with no action.

Handler order: re-check `isGrudgeableStray && !hasGrudge && stray.greeted` → `feedColonyCat` → on `'ok'`:
- burst, trill and toast. The toast copy is exactly ``You fed ${name} 🐟 — ${have}/${need}`` when solo, and with a partner, `` (you ${mine} · ${partnerName} ${theirs})`` appended.
- `colonySync?.pushFeed`, and the `colony-feed` event when `colonyWalk`.
- On `tamedNow`: the toast ``${name} trusts you! She'll be waiting in the den 🏠``, `audio.fanfare()`, then for each item from `grantColonyRewards()`, the toast ``🎁 New for your wardrobe: ${CATALOG.accessories[item].name}``.

Add `colonySync` to `createInteractions`' deps.

- [ ] **Step 5: Wire `walk.js`.**
  - `colonyWalk = roomSeed === undefined || rosterIsPartnerOnly(rosterIds, pid, state.colony.partner?.playerId)`. It is true only when every roster id other than `pid` equals the partner id. A missing partner gives false; an empty other-roster gives true.
  - When `colonyWalk && !isDen`, pass `colonyCats = catsInArea(state.colony, areaId)` mapped with `wear` resolved to `{ slot: CATALOG.accessories[id].slot, id }`.
  - Put `colonyWalk` on the session.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Verify in a real walk.** Use the offline dev server, `whisker-walk-colony` on port 5175 (add that config to `.claude/launch.json` here: `npx vite --port 5175 --strictPort` from this worktree, where there is no `.env.local`).
  1. In devtools, seed `whisker-walk-save` with a colony cat in the neighbourhood **at the spawn point plus 3 m**.
  2. Start a walk: the cat is there, up close, with its tag; touch noses (E), and the prompt becomes "feed".
  3. Feed it, and read the toast.
  4. Reload and start again: it is in the same spot.

  Screenshot each.

- [ ] **Step 8: Commit**

```bash
git add src/straycats.js src/game/lobby.js src/game/interactions.js src/game/walk.js .claude/launch.json test/straycats.test.js test/lobby.test.js test/interactions.test.js
git commit -m "feat(colony): colony cats live at fixed spots; feed them to tame them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Tamed cats in the den, doing something different each day

**Model:** sonnet.

**Files:**
- Create: `src/dencats.js`, `test/dencats.test.js`
- Modify: `src/colony.js` (`denMoment`, `denHome`), `src/game/walk.js` (den branch), `src/game/interactions.js` (`'den-cat'` prompt)
- Test: `test/colony.test.js` (extend)

**Interfaces:**
- Produces, from `colony.js`:
  - `denMoment(name, ymd) -> { act: 'nap'|'box'|'knocked'|'window'|'groom', spot: 'home' | <DEN_SPOTS id> }`, deterministic from `seedFromCode(name + ymd)`. `window` uses spot `'window'`; `box` and `knocked` use a hashed `DEN_SPOTS` id; `nap` and `groom` use `'home'`.
  - `denHome(colony, name) -> number`, the index into `tamedCats(colony)`, which is the `DEN_SPOTS` index.
- Produces, from `dencats.js`: `createDenCats(scene, cats: Array<{ name, breed, wear, home: {x,z}, moment }>, { reducedMotion }) -> { list, nearest(pos, r), update(dt, t), dispose() }`.
  - Each cat stands 0.9 m from its spot toward the room centre, so furniture and cat never overlap.
  - `box` adds an open-top cardboard box with the cat's head showing.
  - `knocked` adds one small tipped object (cup or pot) beside it.
  - It uses `animateCat` poses `nap`/`groom`/`requestPet` and `makeNameTag`.
- Produces the prompt `'den-cat'`: "E — pet ${name}". The handler is `awardOnce('pet', 'den-' + name, \`a purr from ${name}\`)` plus `catVoice()`.

- [ ] **Step 1: Write the failing tests**

```js
// test/colony.test.js — appended
it('denMoment is the same all day and varies across days', () => {
  expect(denMoment('Pickles', '2026-10-24')).toEqual(denMoment('Pickles', '2026-10-24'));
  const acts = new Set(Array.from({ length: 14 }, (_, d) => denMoment('Pickles', `2026-11-${String(d + 1).padStart(2, '0')}`).act));
  expect(acts.size).toBeGreaterThanOrEqual(3);
});
it('each tamed cat gets its own home spot, in taming order', () => { /* tame A then B → denHome A 0, B 1 */ });
```

```js
// test/dencats.test.js — headless, scene = { add(){}, remove(){} } like catnames.test.js
it('builds one cat per entry, standing off its spot toward the centre', () => { /* home (6,-6) → |pos| < |home| */ });
it('a box moment adds a box, a knocked moment adds a tipped object', () => { /* scene.add count or group children differ by act */ });
it('nearest returns the cat in range and null otherwise', () => {});
it('dispose removes everything it added', () => {});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/colony.test.js test/dencats.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `denMoment`/`denHome` and `src/dencats.js`.** Draw-call note: there are at most 12 simple cats plus 12 small props, in an indoor room with no strays, which is below what a 22-stray outdoor walk costs. Don't merge them.

- [ ] **Step 4: Wire it in.** On `isDen`, `walk.js` builds den cats from `tamedCats(state.colony)`, using `strayBreed`, the wear resolved as in Task 6, `DEN_SPOTS[denHome]` and `denMoment(name, today)`, where `today` is `new Date().toISOString().slice(0, 10)`. It updates them in the render path, disposes them in `endWalk`, and registers each with `decals.follow`. `interactions.js` adds `'den-cat'` after the kitten branch.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Verify in the den, up close.** Seed three tamed cats, with today's moments forced to `box`, `knocked` and `nap` by picking names. Visit the den: each cat is visible from the spawn camera, no cat clips furniture or the wall, and the box and the knocked object read clearly. Check the camera wedge (`DEN_CAMERA_WEDGE`): no box blocks the opening shot. Screenshot.

- [ ] **Step 7: Commit**

```bash
git add src/colony.js src/dencats.js src/game/walk.js src/game/interactions.js test/colony.test.js test/dencats.test.js
git commit -m "feat(colony): tamed cats live in the den and get into something new each day

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The Colony tab — one bar per cat

**Model:** sonnet.

**Files:**
- Create: `src/ui/colonypanel.js`, `test/colonypanel.test.js`
- Modify: `src/ui/hometabs.js` (`HOME_TABS` gains `'colony'` after `'skills'`), `src/ui/homebase.js` (`TAB_LABEL.colony = '🐈 Colony'`, the panel, and dress `<select>` changes calling `colonySync.dress`), `src/style.css`
- Test: `test/hometabs.test.js` (update the pinned order)

**Interfaces:**
- Consumes: `tamingProgress`, `tamedCats`, `catsInArea` and `CATALOG`.
- Produces: `renderColonyHtml({ colony, me, members, status, owned: string[], catalog }) -> string`. Pure; every interpolated value goes through a local `escapeHtml`, copied from `hometabs.js`'s.

For each cat, ordered tamed first and then by progress, the panel shows:
- name and breed
- **one** `.colony-bar` (`role="progressbar"`, `aria-valuenow`, `aria-valuemax`) with the head-start part as a differently shaded segment **inside** it
- `"You already knew ${name} ♥"` when `headStart > 0`
- the attribution line `"you fed ${n} · ${partner} fed ${m}"`, or just `"you fed ${n}"` when solo
- the status: `"lives in your den 🏠"`, `"in ${areaName}"`, or `"shy — waiting for ${partner} 🐾"`
- `"found by you"` or `"found by ${partner}"`
- for my finds, a `<select data-colony-dress="${name}">` of my owned accessories plus "nothing"

It also shows the empty state "No colony cats yet — touch noses with a stray, then feed it 🐟", the full-colony line, and a header line for the mode. The status line copy is exact:

| Mode | Header line |
|---|---|
| `local` | `Just you for now` |
| `not-set-up` | `Colony sharing isn't switched on yet` |
| `offline` | `Can't reach the colony right now — your cats are safe on this device` |
| `paired` | `Shared with ${partner} 🐾` |

The pairing section is a placeholder `<div id="colony-pairing">` that Task 9 fills.

- [ ] **Step 1: Write the failing tests**

```js
it('renders exactly one progress bar per cat', () => { /* 3 cats → 3 .colony-bar */ });
it('shows the head start inside the bar and says why', () => { /* head 3 → one bar, a head-start segment, text "You already knew" */ });
it('attributes feeds per player and names the partner', () => { /* "you fed 2 · Robin fed 1" */ });
// Review Focus 4
it('escapes every name and status string', () => { /* partner petName '<b>x</b>' via a hand-built colony bypassing sanitize → no '<b>' in output */ });
it('offers dressing only on cats I found', () => { /* data-colony-dress only for finder === me */ });
it('the empty, full and four status modes each render their line', () => {});
```

Update `test/hometabs.test.js`'s pinned order to `['cats','accessories','skills','colony','social','album','settings']`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/colonypanel.test.js test/hometabs.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the renderer, the tab and its CSS.** The bar uses the existing `.skill-bar` visual language. Re-render on `colonySync`'s `onChange`.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify by eye at desktop and phone width (375 px).** Use a seeded colony with a solo cat, a head-started cat, a shy waiting cat and a tamed cat. Check that one bar per cat reads at a glance and nothing overflows. Screenshot both widths.

- [ ] **Step 6: Commit**

```bash
git add src/ui/colonypanel.js src/ui/hometabs.js src/ui/homebase.js src/style.css test/colonypanel.test.js test/hometabs.test.js
git commit -m "feat(colony): Colony tab — one bar per cat, with who fed what

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Pairing with mutual confirmation

**Model:** sonnet.

**Files:**
- Modify: `src/ui/colonypanel.js` (`renderPairingHtml`), `src/ui/homebase.js` (handlers and polling)
- Test: `test/colonypanel.test.js` (extend)

**Interfaces:**
- Consumes: `colonySync.pairing.*` and `colonySync.status()` (Task 5).
- Produces: `renderPairingHtml(status, { busy, error, hasPetName }) -> string`, with these states and this exact copy:

| State | Copy and controls |
|---|---|
| no MP | nothing |
| `needs-name` | `Give your pet a name in Social first, then you can share your colony.` |
| `unpaired`, no invite | `🐈 Share your colony with your brother or sister` — [Get a sharing code] — `Got a code?` [______] [Join] |
| inviting | `Your code: K7P2QM — read it out to them. It works for 20 minutes.` + `Waiting for them to type it…` |
| inviting, with a joiner | `${joiner} wants to share your colony. Is that them?` [Yes, share!] [No] |
| joining | `Waiting for ${inviter} to say yes…` |
| `paired` | nothing (the header line covers it) |

- While a pairing state is pending **and** the Colony tab is active, the home base polls `colonySync.pull()` every 3 s. It uses one timer handle, cleared on hide, on tab change, and on leaving the pending state.
- The code input is uppercased, trimmed and limited to 6 characters from the invite alphabet.
- Errors map to plain lines: `bad-code` → "That code didn't work — check it and try again.", `already-paired` → "This player is already sharing a colony.", `taken` → "Someone else is already using that code."

- [ ] **Step 1: Write the failing tests** — each state's copy and controls appear; joiner and inviter names are escaped; `needs-name` disables Join.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/colonypanel.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement it.** On a successful accept, toast `"You're sharing a colony with ${partner}! 🐾"` and `pull()`, which uploads both players' earlier local cats (Task 5's catch-up).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify by eye with a stub.** In the offline dev server, use devtools to replace `colonySync.status`/`pairing` with stubs that walk through every state, and screenshot each at 375 px. Live pairing can't be tested here because the SQL isn't run; it is item 1 of `COLONY-SETUP.md`'s checklist.

- [ ] **Step 6: Commit**

```bash
git add src/ui/colonypanel.js src/ui/homebase.js test/colonypanel.test.js
git commit -m "feat(colony): pair with a sibling — a short code, then a yes from both

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: "While you were out"

**Model:** sonnet.

**Files:**
- Modify: `src/colony.js` (`colonyNews`), `src/ui/colonypanel.js` (`renderNewsHtml`), `src/ui/homebase.js` (`showNews(html)` modal and its dismiss), `src/main.js` (show it after the boot pull and after each summary-continue pull)
- Test: `test/colony.test.js`, `test/colonypanel.test.js` (extend)

**Interfaces:**
- Produces: `colonyNews(colony, { me, ymd, rewards = [] }) -> { lines: string[], any: boolean }`. It returns plain text, and the renderer escapes it.
- Lines, in this order:
  1. per cat, the partner's unseen feeds: `${partner} fed ${name} 🐟` or `${partner} fed ${name} 🐟 ×${n}`
  2. per cat newly tamed since last seen: `${name} came home to the den! 🏠`
  3. a new cat found by the partner: `${partner} found a new cat: ${name}`
  4. an offer to me not yet seen: `${partner} wants to swap — have a look in Colony`
  5. per reward granted by this pull: `🎁 New for your wardrobe: ${item name}`
  6. when `seen.day !== ymd` and at least one cat is tamed, up to three den moments: `In the den: ${name} is stuck in a box` / `knocked something over` / `is napping on the windowsill` / `is having a wash` / `is curled up asleep`
- `any` is true when there is at least one line.
- `progression.markColonySeen(ymd)` records every feed key, tamed name and trade id, plus `day`.
- Produces: `renderNewsHtml(news, partnerName) -> string`, a card titled `While you were out 🐾` with a [Let's go!] button.

- [ ] **Step 1: Write the failing tests**

```js
it('lists the partner's feeds, collapsing repeats, and never my own', () => {});
it('is empty after markSeen, and the den lines come back the next day', () => {});
it('says nothing on a brand-new save', () => { /* emptyColony → any false */ });
it('renderNewsHtml escapes every line', () => {});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/colony.test.js test/colonypanel.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement it.** The card overlays the home base (spec §9.4: "first thing on open"). It shows at most once per pull, and dismissing it marks the news seen. It must not appear over a walk in progress.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify by eye.** Seed a save with partner feeds and a tamed cat, reload, and check the card is the first thing seen. Dismiss and reload: it doesn't return. Screenshot at desktop and 375 px.

- [ ] **Step 6: Commit**

```bash
git add src/colony.js src/ui/colonypanel.js src/ui/homebase.js src/main.js test/colony.test.js test/colonypanel.test.js
git commit -m "feat(colony): a 'while you were out' card, first thing on open

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Trading — a final swap between siblings

**Model:** sonnet.

**Files:**
- Modify: `src/ui/colonypanel.js` (`renderTradesHtml`), `src/ui/homebase.js` (handlers), `src/game/colonysync.js` (toast the applied trades)
- Test: `test/colonypanel.test.js`, `test/colonysync.test.js` (extend)

**Interfaces:**
- Consumes: `colonySync.trade.*` (Task 5) and `applyColonyTrades` (Task 2).
- Produces: `renderTradesHtml({ colony, me, owned }) -> string`. Shown only when paired. It has:
  - **Make a swap:** `<select data-trade-give>`, with my owned items minus starters; `<select data-trade-want>`, with partner wardrobe items I don't own; [Offer swap]. Under it, the line `Swaps are forever — no take-backs!`
  - **My open offer:** `You offered ${give} for ${want}` [Cancel]
  - **An offer to me:** `${partner} offers ${give} for your ${want}` [Swap!] [No thanks]. Swap needs a second click on `Yes — swap forever` (§10.3's final, said plainly to a 9-year-old).
  - When either list is empty, a line explaining why ("Unlock some accessories to trade", "${partner} has nothing you don't already have").
- A completed trade toasts once, after the pull that applied it: `Swapped! You got ${item name} 🎁`.

- [ ] **Step 1: Write the failing tests** — starters are never offered; partner items I own are hidden; the confirm step is required (the first click renders the confirm button rather than calling `answer`); all names are escaped; an accepted-trade pull toasts once (Review Focus 5 wiring).

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/colonypanel.test.js test/colonysync.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement it.**

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify by eye** with a stubbed paired status holding a partner wardrobe and an incoming offer, at both widths. Screenshot.

- [ ] **Step 6: Commit**

```bash
git add src/ui/colonypanel.js src/ui/homebase.js src/game/colonysync.js test/colonypanel.test.js test/colonysync.test.js
git commit -m "feat(colony): trade accessories with your sibling — final, said plainly

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Pair walks — no code, either player starts

**Model:** opus.

**Files:**
- Modify: `src/game/lobby.js`, `src/game/rooms.js`, `src/game/walk.js` (`beginWalkFromHomebase`), `src/game/netevents.js`, `src/ui/homebase.js`
- Test: `test/netevents.test.js` (create if absent, on the pattern of the other headless suites)

**Interfaces:**
- Produces, from `lobby.js` (pure): `decideLobbyEvent(ev, { roster, selfId, inWalk, knownAreas, unlockedAreas }) -> null | { kind: 'start', area, dusk, seed, override: boolean } | { kind: 'config', area, dusk }`.
  - A `walk-config` from `roster[0]` → `start`. The override is true when the area isn't unlocked.
  - A `walk-request` from another member, when `selfId` is the host and not `inWalk` → `config` for the request's area, but only if the area is a known id; `dusk` is coerced to a boolean.
  - Everything else → null, including a request when I'm not host, a config not from the host, `inWalk`, an unknown area or a missing id.
- Produces, from `rooms.js`: `rooms.walkWithPartner() -> Promise<{ ok }>`. It joins room code `'P' + colony.id`; colony ids are 16 random hex characters, are never exposed publicly, and so cannot be guessed. It sets `getState().pair = true` and fires `colonySync.pull()` without awaiting it (spec: read the pair's colony at join, never block).
- The lobby handler uses `decideLobbyEvent`. A `config` decision makes the host send `walk-config` with a fresh seed and start itself, exactly as `beginWalkFromHomebase` does today for the host's own Start.
- `beginWalkFromHomebase`, when I'm not host: send `{ v:1, id: pid, type:'walk-request', area: state.area, dusk }`, set a "Starting…" flag on the home base, and after 6 s with no walk, toast `${partner or 'They'} didn't answer — are they on the home screen?` and clear the flag.
- The Start button in a room reads `Start the walk together 🐾` for every member. "Waiting for host…" is gone.
- Social's Walk together section shows `[🐾 Walk with ${partner}]` when paired and MP is on, and nothing to type. Inside a pair room, the room panel reads `Walking with ${partner}` instead of `Room ${code}`.
- `netevents.js` handles `colony-feed`: when `s.colonyWalk && ev.id === partner.playerId && isStrayName(ev.cat)`, toast `${partner} fed ${ev.cat} 🐟` and burst at that stray if present. **It never writes the save.**

- [ ] **Step 1: Write the failing tests**

```js
// test/lobby.test.js
const R = [{ playerId: 'a-host' }, { playerId: 'b-kid' }];
const ctx = (o = {}) => ({ roster: R, selfId: 'a-host', inWalk: false, knownAreas: ['neighborhood', 'park', 'seaside', 'docks'], unlockedAreas: ['neighborhood'], ...o });
it('the host answers a member's request with a config for THEIR area', () => {
  expect(decideLobbyEvent({ type: 'walk-request', id: 'b-kid', area: 'park', dusk: 1 }, ctx())).toEqual({ kind: 'config', area: 'park', dusk: true });
});
it('only the host answers, and never mid-walk', () => {
  expect(decideLobbyEvent({ type: 'walk-request', id: 'a-host', area: 'park' }, ctx({ selfId: 'b-kid' }))).toBe(null);
  expect(decideLobbyEvent({ type: 'walk-request', id: 'b-kid', area: 'park' }, ctx({ inWalk: true }))).toBe(null);
});
it('ignores unknown areas and non-host configs', () => {
  expect(decideLobbyEvent({ type: 'walk-request', id: 'b-kid', area: 'moon' }, ctx())).toBe(null);
  expect(decideLobbyEvent({ type: 'walk-config', id: 'b-kid', area: 'park', seed: 1 }, ctx({ selfId: 'b-kid' }))).toBe(null);
});
it('a host config starts everyone, with an override for a locked area', () => {
  expect(decideLobbyEvent({ type: 'walk-config', id: 'a-host', area: 'park', dusk: false, seed: 7 }, ctx({ selfId: 'b-kid' })))
    .toEqual({ kind: 'start', area: 'park', dusk: false, seed: 7, override: true });
});
```

```js
// test/netevents.test.js
it('colony-feed from the partner toasts and never writes the save', () => {});
it('colony-feed from anyone else, or with a non-stray name, does nothing', () => {});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/lobby.test.js test/netevents.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `lobby.js` and wire `rooms.js`, `walk.js`, `netevents.js` and `homebase.js`.** `createSupabaseTransport` needs no change, because `walk-request` and `colony-feed` ride the existing `event` broadcast kind.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify by eye.** In the offline server, check the "Walk with …" button and the room panel copy with a stubbed paired status, and check that "Waiting for host…" no longer appears anywhere. Two real devices are item 3 of `COLONY-SETUP.md`'s checklist.

- [ ] **Step 6: Commit**

```bash
git add src/game/lobby.js src/game/rooms.js src/game/walk.js src/game/netevents.js src/ui/homebase.js test/lobby.test.js test/netevents.test.js
git commit -m "feat(colony): walk with your sibling — no code, and either of you can start

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: As-built notes, full check, and hand-off

**Model:** the coordinating session.

- [ ] **Step 1:** Add an "As built (Stream 2)" note to the spec's Stream 2 section, like Stream 1's. It records the decisions table above and anything that changed during execution.
- [ ] **Step 2:** Run `npm test`. It must pass, with a count higher than 1698.
- [ ] **Step 3:** Run `npm run build` and confirm it is clean (the deploy runs it).
- [ ] **Step 4:** Do an end-to-end look in the offline dev server, in one real session:
  1. Fresh save.
  2. Neighbourhood walk: greet a stray, feed it, end the walk.
  3. Colony tab shows one bar at 2/6 (1 greet head start + 1 feed).
  4. Seed five more feeds, reload: the news card appears.
  5. Den walk: the cat is there.

  Screenshot each step.
- [ ] **Step 5:** Run the whole-branch review (Opus), fix what it confirms, and run Step 2 again.
- [ ] **Step 6:** Hand the owner `docs/supabase-colony.sql` and `docs/COLONY-SETUP.md`. Offer the branch for merge. **Don't merge or push without asking.**

---

## Done when

- A child can greet and feed a stray across walks until it comes home to the den. The cat has one bar, starts ahead if you knew it, and shows who fed it.
- Two paired siblings feed the same cats. A shy cat needs both of them. Each sees the other's work on a "while you were out" card. They can walk together without a code, with either one starting, and they can swap accessories, which is final.
- With no network, or the SQL not yet run, all of the above works as a single-player local colony.
- `npm test` passes, `SAVE_VERSION` is still 4, and the owner has the SQL file and its run instructions.
