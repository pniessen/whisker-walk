# Whisker Walk v20 — "Ruffled Fur"

> Playtester request, 2026-08-27: *"when you greet a cat there should be a small
> chance the cat dislikes you and becomes an 'enemy', including potential that it
> will try to scratch you or otherwise have a mini-battle; however, if you offer a
> gift to an 'enemy' they could become a friend again."*

Status: **BUILT, 2026-08-27.** 984 tests green, `vite build` clean, every
wiring line mutation-verified (reverted in turn, confirmed a test fails).
**Not yet seen on screen** — see §7.

Files: `src/enemies.js` (new, pure catalog + rules), `src/progression.js`
(`state.grudges` + `deductPoints`/`recordGrudge`/`hasGrudge`/`forgiveGrudge`),
`src/game/interactions.js` (rupture, scuffle, reconciliation),
`src/straycats.js` + `src/game/walk.js` (born-cross strays), `src/nametag.js`
(the indicator), `src/audio.js` (`hiss`), `src/cat/animator.js` (`'cross'`).

---

## 1. The shape

Greeting a stray can go badly. The cat takes against you, and stays that way
across walks until you make it up to it with a gift. A cross cat hisses, and
if you crowd it, it swats — you lose a moment and some whisker points.

The emotional arc is **rupture → grudge → reconciliation**, and the whole point
is the third beat. Everything below is in service of making reconciliation feel
earned rather than automatic.

## 2. Locked decisions

These were settled with the user before any code was written. Later waves may
revisit them, but not silently.

### D1 — Grudges persist across walks
A new **additive** save field, no version bump, following the established
pattern (`sanitizeGifts` / `sanitizeFeats` — iterate a known vocabulary or
validate per-entry, cap the size, default on garbage). Version stays **4**.

Keyed on the cat's **name**, because that is the only identity a stray has
across walks (`state.friends` is keyed the same way, and breed is derived from
the name, so a given name is always the same cat). A grudge is therefore
remembered whenever that name is redrawn into a later walk's 22-of-48 shuffle.

### D2 — Strays only
Never the named family pets (Zeetoo, Rosa, Robbie, Hagrid) and never ghost
visitors. Those are the family's real cats; a child being scratched by their
own cat is not the feature anyone asked for.

### D3 — A scuffle costs SPENDABLE points, never lifetime points
The user explicitly chose a real point cost, having been told it would be the
first negative award in eighteen waves. It is honoured **without** breaking the
architecture, because the save already has two currencies:

- `state.points` — spendable, and **already goes down**: `buy()` deducts it for
  cats, hats and den furniture (`progression.js:670`, `:683`).
- `state.lifetimePoints` — monotonic, and the sole input to the rank ladder
  (`rankFor`).

A scuffle deducts **`state.points` only**, floored at zero. `lifetimePoints` is
never touched. So the player genuinely loses whisker points — fewer hats this
week, exactly the sting requested — but a bad roll can never demote a hard-won
rank title or make a cloud save appear to go backwards. Three tests pin
non-demotion (`progression.test.js:147`, `:285`, `:789`); all must stay green.

**This is the one place the wave gets to subtract. Nowhere else.**

### D4 — Hostility is a PRIVATE, per-device relationship fact
Not world-canonical. Not broadcast. No new wire `kind`.

This follows every other relationship in the game: `state.friends` is
per-device, the best-friend gift roll is solo-only, and stashed gifts are
explicitly private to whoever left them. `gifts.js:8-24` records a standing
scope ruling that abilities are strictly local and forbids adding a broadcast
kind; this wave does not revisit it.

Consequence, accepted: two co-walkers can disagree about whether a given cat is
cross. That is already true of every friendship fact in the game.

### D5 — A friend never turns on you
The roll is only offered for a cat you do not already know well. A cat at the
`friend` or `best` rung is immune, permanently. Charmer lowers the chance
further — it is the game's existing "cats like you more" ability and this is
exactly its territory.

### D6 — Reuse the existing vocabulary of stakes
The game already has precisely one hostile mechanic: the dog scare
(`critters.js:404` → `main.js:407`), which sets `freezeTime = 1.5`, halts the
player, plays the `scared` pose and toasts. A scuffle is built from that same
vocabulary plus a point cost, not from a new combat system. There are no hit
points, no health bar, and no way to lose a walk.

## 3. The RNG rule — read this before writing the roll

**`walkRng` is the wrong stream and must not be used.**

`game/walk.js:272-287` is explicit: `walkRng` may have no lazy or conditional
consumers, because two co-walkers on one room seed would draw it a different
number of times and silently diverge from that point on. A greet-time roll is
by definition lazy, conditional and player-paced — it is precisely the
forbidden case.

**And bare `Math.random()` is also wrong** — CF-7, the firefly desync, and the
Far Call approach note are three separate scars from exactly that.

Use a **derived per-(walk, cat) seed**, structured like the one `catreplies`
uses for picking a cat's spoken line: a per-walk base plus a per-cat offset,
salted. Both inputs are already in hand inside `awardStrayGreet`. It is
order-independent, so it cannot desync anything; it is stable within a walk, so
the same greet cannot be re-rolled; and because D4 makes hostility per-device,
it does not matter that `walkStamp` differs between clients.

> **CORRECTION (applied during the build).** This section originally specified
> `hashName(stray.name)` for the per-cat offset, copying `catreplies` verbatim.
> **Do not.** `hashName` (`game/util.js:28`) is a sum of character codes and
> collides on any letter permutation — measured against the real data it yields
> only **43 distinct values for the 48 shipped `CAT_NAMES`**. Harmless where
> `catreplies` uses it (two cats occasionally pick the same line); not harmless
> here, where it would mean pairs of cats sharing a hostility outcome on every
> walk forever. Use `seedFromCode` (FNV-1a) from `src/rng.js`.
>
> The same correction applies to any future per-cat stream. The stray **wander**
> streams added alongside this wave use `seedFromCode` too, with a different
> salt, so a cat's wander cannot be correlated with whether it turns cross —
> two cats walking in visible lockstep would have been the worse bug.

## 4. Behaviour

**The rupture.** On a greet that would otherwise befriend a stray, roll. On a
hostile result the cat hisses, recoils, and is marked cross in the save. The
greet pays no friendship award and records no greet — it did not go well.
`stray.greeted` is still set, so the player moves on rather than mashing E.

**The grudge.** A cross cat is visibly cross, and it will not offer the greet
prompt. See §4a — the indicator is a requested feature in its own right, not
decoration.

### 4a. The grudge indicator (requested by the user, 2026-08-27)

Three layers, all built from what already exists:

1. **The name tag.** `makeNameTag` (`nametag.js`) draws a dark rounded pill
   with the cat's name onto a 256×64 canvas. A cross cat gets a `😾` and a
   dusky-red pill instead of the neutral `rgba(20,26,38,0.7)`. One canvas,
   one texture, no new rendering path, and legible on a phone.
2. **Visible at distance.** Tags ship `visible = false` and only appear up
   close. A grudge tag must show from further out, for two reasons that pull
   in the same direction: the player can steer clear of a cat that will swat
   them, *and* can find the cat they want to make up with. The second is the
   whole point of the feature, so this is not optional polish.
3. **Body language.** The `scared` pose already flattens the ears and raises
   the tail (`animator.js:112-118`). A cross cat reads as cross before the tag
   is even legible. Note that strays are built `{ simple: true }`, which skips
   whiskers — so whisker-based expression is unavailable here.

**The hard requirement this creates:** the tag must be **redrawable mid-walk**.
`makeNameTag` builds its canvas once at spawn, but a grudge clears the instant
the gift is accepted, and the cat must visibly soften back to a normal tag on
the spot. Without that, the payoff beat — the entire reason the feature exists
— happens invisibly. Keep the canvas and its 2D context on the sprite so the
texture can be repainted with `needsUpdate`, rather than rebuilding the sprite
(which would leak the old texture; `endWalk`'s traversal already has a known
shared-geometry disposal wart, so do not add to it).

Applies to strays only, per D2 — remote co-walk pets share `makeNameTag` and
must be unaffected.

**The scuffle.** Crowd a cross cat and it swats: a hiss, a dust-puff scuffle,
the existing freeze, and a spendable-point deduction per D3. Must be
rate-limited per cat per walk so it cannot drain a player who is merely walking
past, and must never fire while the player is frozen already.

**The reconciliation.** Offer a gift to a cross cat and it forgives you — the
grudge is cleared from the save and the cat becomes greetable again (and the
greet then proceeds normally). "Could become a friend again" allows this to be
probabilistic, but a failed offer must not consume the gift, or the mechanic
becomes a slot machine a ten-year-old will hate.

### D7 — The gift is a treat bought with whisker points (resolved 2026-08-27)

The open question was what a "gift" is, given the game has no carried-gift
concept. **Resolved: 10 spendable whisker points**, matching `AWARDS.gift`,
deducted through the same `deductPoints` D3 introduced.

`s.walk.carried` was considered first and rejected. It is a per-walk cap (2, or
3 with the backpack) that **only ever increments** — nothing empties it — and a
collectible's points are awarded at *pickup*. So handing one over either costs
nothing (the points are already banked) or, if the slot were freed, becomes a
collect → give → collect farm. It is the wrong currency.

Points are the only non-farmable, scalable currency the game has; the cost is
symmetric with the 5-point scuffle; and "buy the cat a treat to say sorry"
reads correctly to a ten-year-old.

**The offer is deterministic — it always works.** The spec originally allowed
"could become a friend again" to be probabilistic. It is not, for a reason
worth keeping: an offer that can fail without consuming the gift is a slot
machine a child will mash, and one that consumes on failure is worse. The
grudge has already cost the player a friendship and some scuffles; the
reconciliation should land. If the player cannot afford the treat, the prompt
says so and nothing is consumed.

**Load-bearing detail.** The hostility roll is a pure function of `(walkStamp,
name)`, so a cat forgiven mid-walk would roll hostile again on the very next
greet and fall straight back into a grudge — the reconciliation would eat
itself. `createEnemyWalkLog().markForgiven(name)` is per-walk scratch state
(never persisted) that closes this, and must be set **only** when
`forgiveGrudge` actually returned true.

## 5. Invariants that must not break

- Save stays **version 4**; a v4 payload predating this field loads losslessly
  (`progression.test.js:1494` is the template).
- `sanitizeFriends`' existing three-field shape — check whether
  `progression.test.js:480` asserts it with `toEqual` before touching it.
- The greet dedup (`recordGreet`'s `lastWalk === walkStamp` guard) and the
  per-walk `stray.greeted` guard both still hold.
- `friendRungCrossed` still agrees with `friendLevel` at every step
  (`straycats.test.js:212` — the CF-4 regression guard).
- No new prompt may shadow an existing one (`interactions.test.js:888`).
- Nothing farmable: any new award or tally gates on its `awardOnce` actually
  paying, per the v18 `feats.perch` exploit and `interactions.test.js:255`.
- No new broadcast kind (D4).
- Goal balance: `'friend'` goals count `'friend'` discoveries. A hostile greet
  paying nothing slightly reduces the supply of friend awards per walk; keep
  the hostile chance low enough that a 3-friend goal is never in danger with 22
  strays on the map.

## 6. Adjacent bug found during recon (not caused by this wave)

`createStrayCats` (`straycats.js:89`) accepts an injected `rng` and uses it for
the name shuffle and personality roll, but draws **position, facing and initial
timer from bare `Math.random()`** (`:101-102`, `:104`, `:124`). Two co-walkers
on one room seed therefore see the same cats, with the same names and breeds,
standing in different places and wandering differently.

This is live on `main` and is the same class of defect as CF-7 and the firefly
desync. Fixed separately from this wave.

---

## 7. Status as shipped — decisions, catches and gaps

### Resolved during the build
- **D7 (the gift) and the deterministic offer** — see above; both were open
  questions the implementation had to close, and both are now locked.
- **The forgiven-cat loop.** The hostility roll is pure in `(walkStamp, name)`,
  so a cat forgiven mid-walk would roll hostile again on the very next greet.
  Closed with per-walk scratch state (`markForgiven`/`wasForgiven`), set only
  when `forgiveGrudge` actually returned true.
- **`hashName` is unfit for per-cat seeding.** The spec originally specified it,
  copying `catreplies`. It is a sum of char codes and collides on letter
  permutations — **43 distinct values across the 48 shipped `CAT_NAMES`**. Both
  `enemies.js` (hostility) and the stray wander streams use `seedFromCode`
  (FNV-1a) instead, with different salts so a cat's wander cannot be correlated
  with whether it turns cross.
- **`fearless`/`steady` still pay the point cost.** They skip the freeze, matching
  the dog scare exactly, but not the hiss, dust or cost. The special governs the
  player's NERVE — which is precisely what the freeze models — not damage.
  Letting two of ten breeds walk through the feature free would delete D3.
- **Affordability is checked BEFORE deducting**, not via `deductPoints(n) > 0`.
  `deductPoints` floors at zero, so the obvious form would take a player's last
  4 points for a 10-point treat, return truthy, and hand back nothing.
- **The greet-by-chat door.** `sendPhrase` finds its target with a plain
  `nearest()`, so the cross-cat guard lives inside `awardStrayGreet` itself, not
  only in the prompt scan — otherwise a chat greeting paid a full friendship
  award to a cat cross since a previous walk.
- **D2 made structural**, not incidental: a cat must be an object in *this
  walk's* `strays` array AND have a name in `CAT_NAMES`. Backed by a drift test
  asserting every `CATALOG.cats` name is absent from `CAT_NAMES`, derived from
  the real catalog rather than a hand-copied list of four.

### Known gaps
- **No visual pass.** Nothing could produce a cross cat until the last agent
  landed, so the tag and pose are verified against the real rig and a recording
  canvas but never rendered on screen. Two specifics to check in play: the
  `'cross'` pose's 0.22-rad torso yaw (head and legs are parented to the group,
  so an over-large value would dislocate the shoulders), and the cross label at
  its 24px floor on the longest stray name. At ~1.1 cross cats per 22-stray
  walk, a playtester meets one almost immediately.
- **HUD repaint knowledge is duplicated.** `main.js` repaints points only on a
  `'discovery'` bus event, and a deduction is not one, so `interactions.js`
  calls `hud.setPoints?.()` at both deduction sites. Accepted: the clean fix
  means threading the bus into `interactions.js`, which is more change than the
  wart justifies.
- **Co-walk wander still diverges on locally-triggered draws.** Per-stray RNG
  streams sync the idle FSM, but greeting a cat, a shy cat scurrying from *your*
  approach, or a playful cat chasing *your* toy all draw at different times for
  two players standing in different places. Per-cat streams cap the blast radius
  at the one cat involved; full convergence would need stray state on the wire,
  which D4 forbids.
- **`ghosts.js` carries a smaller copy of the wander FSM** using bare
  `Math.random()`. **Checked: not a bug.** Ghosts spawn on solo walks only
  (`walk.js:892` gates on `roomSeed === undefined`), so there is no co-walker to
  desync from.
