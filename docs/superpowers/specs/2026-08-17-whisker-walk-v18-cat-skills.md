# Whisker Walk v18 — "Cat Skills" — Design Spec

**Date:** 2026-08-17
**Status:** Implemented, with corrections — see **§Status as shipped** at the
end of this document before trusting any detail above it (notably: Sea Legs is
descoped, so the wave ships eleven abilities, not twelve).
**Base:** deployed game at v17 + post-v17 tab split, plus the in-flight
`src/main.js` module carve-out (see §Sequencing).

## Summary

Every point the player has ever earned buys a *look* — a cat, an outfit, a rug.
Nothing the player earns changes how the cat **plays**. A Mythical Feline moves
exactly like a House Cat on walk one, which is why the three existing areas stop
having anything left to give.

v18 adds **twelve earned abilities** across four families — traversal, senses,
social, mischief — each unlocked by completing a **specific feat**, not by
paying points. Abilities are permanent and always-on. Because most of them
change *where the cat can go* and *what the cat can perceive*, they retroactively
reopen the three shipped areas: rooftops that were unreachable on walk 1 become
reachable on walk 20, and collectibles that were a lucky stumble become findable.

Shipping alongside: the **rank ladder extends past its 2000-point dead end**, and
a fourth area — **The Old Docks** — exists to spend the new abilities in.

## Design decisions (locked)

- **Challenges, not purchases.** Each ability is gated behind a concrete feat
  ("find 3 golden mice", "tip over 25 things"). Points stay the cosmetic
  currency; skills become a second, independent progression axis. This is
  deliberate — points are already abundant late-game, so pricing skills would
  have made them a formality.
- **Always-on, no loadout.** An unlocked ability is permanently active. There is
  no equip screen, no slot budget, no build-crafting. For the 10–12-year-old
  audience, earning a skill should simply make you better forever.
- **Challenges are predicates over save state, not a new subsystem.** Nearly
  every feat is expressible against state the game already persists (`journal`,
  `golden`, `walks`, `friends`, `race`, `streak`). The one gap — lifetime tallies
  per discovery type — is closed by a single new additive field (§Save format).
- **No ability gates required content.** Every existing collectible, goal, quest,
  and golden mouse must remain completable with zero skills. Abilities make
  things *easier and faster*, and open *bonus* space (rooftop-only collectibles,
  the Docks canal) — they never become a prerequisite for something the game
  already asks the player to do.

## The twelve abilities

### Traversal

| Ability | Effect | Feat to unlock |
|---|---|---|
| **Spring Paws** | Pounce jump is markedly higher; climb budget in `canReach` rises 1.6 → 2.2, so perch chains need fewer intermediate steps | Reach 10 vantage perches |
| **Long Zoomies** | Zoomies charge runs 2.5s (from 1.5s) and recharges faster | Finish the daily race 3 times |
| **Fence Runner** | Wall-run: chain perch-to-perch along a fence line without dropping to ground between hops | Climb 25 times |

### Senses

| Ability | Effect | Feat to unlock |
|---|---|---|
| **Twitchy Nose** | A scent trail draws toward the nearest uncollected collectible in range (reuses `src/scent.js`) | Collect 20 treasures |
| **Night Eyes** | Dusk walks brighten — raised exposure + ambient so dusk is atmospheric rather than squint-inducing | Complete 5 dusk walks |
| **Whisker Sense** | A shimmer/ping when within ~12m of an unfound golden mouse | Find 3 golden mice |

### Social

| Ability | Effect | Feat to unlock |
|---|---|---|
| **Charmer** | Strays warm faster — the ♡→♥→💕 friendship ladder advances on fewer greets | Befriend 5 cats |
| **Far Call** | A held meow (V) carries far and draws nearby strays and critters toward you | Greet 30 cats |
| **Gift Paws** | Leave a gift at a scenic spot; ghosts and co-walkers can find it | Give or receive 5 gifts |

### Mischief

| Ability | Effect | Feat to unlock |
|---|---|---|
| **Sure Claws** | Climb-anything — the perch height budget lifts on trees and fences; props that were scenery become climbable | Tip over 25 things |
| **Big Swat** | Knock-over radius doubles; tipping cascades into neighbouring tippables | Tip over 40 things |
| **Sea Legs** | Swim — water becomes traversable at reduced speed (Docks canal, park pond, seaside shallows) | Complete 5 seaside walks |

**Risk ranking for the planner.** `Sea Legs` is by a wide margin the most
expensive item here — water traversal means a swim state, buoyant camera
handling, and collider suppression at water volumes, none of which exist today.
`Fence Runner` and `Gift Paws` are the next two (a new traversal mode and a new
persisted world-object respectively). **If the wave runs long, descope in that
order.** The other nine are parameter changes and render effects against systems
that already ship.

## Save format

**Additive only — no version bump.** Save stays version 4, following the v15
precedent (journal/golden/streak/kitten were added the same way): each new field
is sanitized independently with a default, so old payloads load losslessly and
older clients ignore the extra keys.

Two new fields:

- **`skills: []`** — array of unlocked ability ids. Sanitize: strings only, must
  be a known id from the static catalog, deduped, capped at the catalog length.
  Stored rather than derived so a later threshold change can never *revoke* an
  ability a child already earned, and so the UI can flag a skill as newly
  unlocked.
- **`feats: {}`** — lifetime tallies keyed by discovery type. Sanitize: known
  `AWARDS` keys only, each coerced through the existing finite-non-negative
  helper, capped.

`feats` is fed from **one hook point**: the `bus.emit('discovery', …)` already
emitted by `pay()` in [discoveries.js](src/discoveries.js). Every award type the
game has (`hunt`, `mischief`, `sits`, `treasure`, `friend`, `scenic`, `photo`,
`gift`, …) becomes a lifetime counter for free, which is what makes the feat
predicates cheap. **Note:** `feats` counts from the moment v18 ships — existing
players start at zero on the tallies and are *not* retroactively credited.
Feats that read pre-existing fields (`golden`, `journal`, `walks`, `race`) *are*
retroactive. This asymmetry is accepted; the alternative is a fake back-fill.

Cloud saves need no contract change — `docs/supabase-setup.sql` stores the
payload as opaque `jsonb`, so **the live Supabase SQL does not need re-running.**

## Rank ladder

`RANKS` in [progression.js:52](src/progression.js:52) currently dead-ends at
2000 / "Mythical Feline" — the progress bar simply stops. Extend:

| Points | Title |
|---|---|
| 0 | House Cat |
| 150 | Yard Prowler |
| 400 | Street Smart |
| 900 | Neighborhood Legend |
| 2000 | Mythical Feline |
| 3500 | Rooftop Royalty |
| 5500 | Shadow Prowler |
| 8000 | Nine Lives |
| 12000 | Whisker Legend |

Existing titles and thresholds are **unchanged**, so nobody is demoted. Ranks
stay purely point-gated and confer nothing mechanical — skills are the
mechanical axis, ranks are the prestige axis, and keeping them independent is
the point.

## The fourth area — "The Old Docks"

A night-lit canal and warehouse district. Chosen because it is the one setting
that exercises **all four** ability families at once:

- **Traversal** — crates, fire escapes, and warehouse roofs form the tallest
  perch chains in the game.
- **Senses** — it is dark, which finally gives Night Eyes something to do.
- **Mischief** — market stalls, crates, bins: the densest tippable field yet.
- **Social** — an alley-cat colony, the largest stray population of any area.
- **Sea Legs** — a canal cutting through the middle, crossable only by swimming.

Follows the existing area contract exactly (see [park.js](src/world/park.js)):
a `build(scene)` returning `colliders`, `bounds`, `spawn`, `pois`,
`collectibles`, `scenics`, `critterSpawns`, `moments`, `tippables`, `perches`,
`boxes`, `puddles`, `skyDusk`. It therefore inherits goals, quests, the daily
race, ambience, weather, ghosts, and co-walks with no per-system work.

- Catalog entry: `docks: { name: 'The Old Docks', price: 200, requires: { area: 'seaside', walks: 2 } }`
- `state.walks` gains a `docks: 0` key — **required**, not optional. `completeWalk`
  increments `state.walks[area]` unconditionally, so a missing key yields
  `undefined + 1 = NaN` permanently (the exact trap documented for `den` at
  [progression.js:160](src/progression.js:160)).
- Three golden mice, per the existing three-per-area pattern in
  [goldmice.js](src/goldmice.js) — two on perch-chain steps, one hidden at ground
  level. Coordinates must be derived from the perches that actually ship, not
  authored blind; Task 4.2 of v15 already had to move a full set for exactly
  this reason.
- New critter for the journal: an eleventh entry (rat or gull-variant) so the
  Docks adds a page rather than only re-showing known critters.

## UI

- **A sixth home-base tab: Skills 🐾.** The four families as sections; each
  ability a card showing name, effect, and either its feat with a progress bar
  ("Tip over 25 things — 18/25") or an earned state. Locked abilities show their
  feat in full — the challenge is the content, so hiding it would be
  self-defeating.
- **In-walk unlock moment.** Completing a feat mid-walk fires a celebration:
  FX burst + jackpot-tier fanfare + a card naming the new ability. This is the
  emotional payoff of the whole wave and should not be a line in the end-of-walk
  summary.
- The tab list is a data structure in [hometabs.js](src/ui/hometabs.js) with a
  `resolveTab` fallback that clamps unknown persisted ids — adding a sixth tab is
  a catalog edit plus a test pin, mirroring the post-v17 Cats/Accessories split.

## Non-goals

- No skill tree, prerequisites, or branching — twelve flat unlocks.
- No respec, no loadout, no skill points.
- No PvP or competitive use of abilities in co-walks. If one sibling has Spring
  Paws and the other doesn't, the co-walk still works; abilities are local and
  need no wire representation. **This is load-bearing: no new broadcast kind,
  no net protocol change.**
- No rebalancing of existing point awards.

## Risks and mitigations

- **Sea Legs is a genuinely new movement mode.** Treat it as its own task with
  its own review; descope first if the wave runs long.
- **Perch-budget changes are global.** Spring Paws and Sure Claws both alter
  `canReach`, which the shipped golden-mouse and rooftop-collectible placements
  were tuned against. Those placements must stay reachable *without* the skills
  and must not become trivially skippable *with* them — re-verify all nine
  existing golden mice under both states.
- **Determinism.** The Docks builder and its race course must thread the injected
  RNG. Never a bare `Math.random()` in seeded generation — this exact regression
  has been caught by reviewers more than once.
- **Feat counters must not be farmable into nonsense.** They ride the same
  `discovery` events that already carry the per-walk repeat-award caps, so
  inherited caps apply; confirm no feat is satisfiable by holding one key.

## Sequencing

**Implementation must start from the post-carve-out `src/main.js`.** A module
refactor of `main.js` is in flight in a separate worktree; v18 touches the walk
lifecycle, interaction handling, and render settings — precisely the seams being
extracted. Merge the refactor branch and confirm the 393-test baseline is green
*before* the first v18 task begins.

Suggested task order: save fields + feat counters → skills catalog + predicates →
Skills tab → the nine cheap abilities → rank ladder → the Docks → Fence Runner →
Gift Paws → Sea Legs.

---

## Status as shipped (appended 2026-08-18, Task 4.0)

**This section is a correction log, not a rewrite.** Everything above is the
spec as it was written on 2026-08-17 and is deliberately left intact — the
history is worth keeping. What follows records the three places where the
shipped code deliberately disagrees with it, and why. A spec that silently
disagrees with the code is worse than one that records its own corrections.

Full reasoning for each lives in the **Carry-forward** section of the plan,
`docs/superpowers/plans/2026-08-18-whisker-walk-v18-cat-skills.md`. Read that
section in full before touching this wave.

### The wave ships ELEVEN abilities, not twelve — Sea Legs is descoped (CF-12)

Cut per this spec's own stated descope order, but **not for time**: the ability
as specified does not do what the spec claims. Water in this game has never
carried colliders, so the park pond, the seaside sea and the Docks canal are
*already* walk-over surfaces. "Swim — water becomes traversable at reduced
speed" therefore describes traversal the player already has, minus speed, and
an earned ability must never be a downgrade.

Making water block instead would give it real value, but three park ducks spawn
*inside* the pond and the `duck-parade` moment originates there — which would
put a journal critter behind an ability, violating this spec's own non-goal
that no ability may gate content reachable today.

`sea-legs` is therefore removed from the `SKILLS` catalog **entirely**, not left
visible as locked or "coming soon": its feat (`walks.seaside >= 5`) is perfectly
earnable, so a visible entry would unlock with a celebration and then do
nothing. The §Traversal row for Sea Legs and its §Risks entry above are
superseded. Recommended as its own **v19** item — make water real (colliders +
a swim state), relocate the pond ducks to the shoreline, then reinstate the
ability that opens it. The Docks was deliberately authored for exactly this.

### Far Call is an ordinary meow that carries far, not a held one (CF-6)

The spec describes Far Call as a **held** V press. `main.js` fires `doMeow()` on
keydown with no keyup plumbing, so hold detection means new input handling in an
untested module for no gameplay gain. **The spec text is what is wrong here, not
the implementation** — and a plain press is simpler for a ten-year-old.

### The Long Zoomies wording was wrong (CF-11)

"Charge runs 2.5s (from 1.5s)" misread 1.5 as a burst duration; it is the
charge-**up** threshold, so taken literally the ability would have been a 67%
*nerf*. The two clauses were mapped onto the two knobs that actually exist:
charge-up 1.5 → **0.9s** ("recharges faster"), and the charge now survives
**2.5s** of interruption ("runs longer").

### Big Swat's "radius doubles" is the CASCADE radius, not the reach

§Mischief's Big Swat row reads "Knock-over radius doubles; tipping cascades
into neighbouring tippables". Shipped as a x2 on `tippables.nearest()`, which
is the same call `game/interactions.js` drives the **prompt** from — and the
tip branch sits second in the prompt chain. A 2.6m tip reach therefore
outranked stray greet (2.5), quest-accept (2.5), scratch (2.2), boop (1.5) and
dig (1.2). At the Docks, deliberately authored as both the densest tippable
field and the largest stray population, a Big Swat player standing near a
crate saw "E — paw it over" and **could not greet the cat in front of them**
without walking away from the crate. CF-2's failure shape a third time: an
ability earned by tipping 40 things making non-tipping play worse.

**Ruling (final review): "radius" means the cascade radius only.** The
prompt/target reach stays at the base 1.3m in every skill state; the cascade
keeps its doubled 2.6m and its `CASCADE_MAX_HOPS` bound. Chosen over
reordering the prompt chain, which would have changed shipped priorities to
fix one ability. The catalog's effect line dropped its reach clause to match.

### §Risks was wrong about farmability — two tallies do NOT ride `discovery`

§Risks says feat counters "ride the same `discovery` events that already carry
the per-walk repeat-award caps, so inherited caps apply". That is true of nine
of the eleven counters and **was false of the two that matter most**. Spring
Paws, Fence Runner and Long Zoomies needed counters no award type means on its
own, so `feats.perch` (`src/game/interactions.js`) and `feats.race`
(`src/main.js`) are recorded *beside* their `awardOnce` calls rather than
through `discoveries.js`'s `pay()` — outside the dedup the risk bullet was
relying on.

`feats.perch` was therefore genuinely farmable, and the mitigation as written
("confirm no feat is satisfiable by holding one key") is exactly the check that
would have caught it: climbing onto one walk-up-reachable perch and hopping
straight back down re-enters the branch, so **100 taps of Space on one perch
bought both Spring Paws (10) and Fence Runner (25)** while the deduped `scenic`
award paid 8 points once.

Fixed at the final review by gating each tally on its neighbouring `awardOnce`
returning non-zero, which is the same per-walk per-key cap rather than a second
scheme that could drift from it. `feats.race` got the same gate — `race.js`'s
`idle→running→done` machine gave it no way to re-fire, but the ungated shape is
what failed here and a future edit to `race.begin()` would have reopened it.
**Rule for anything after this wave: a `recordFeat` call outside `pay()`
inherits nothing and must gate itself.**

### Also worth knowing

- **Gift Paws' feat is 3 gifts, not 5** (Task 4.0). Giving a gift requires the
  ability, so before you hold it the only source is *receiving* — which needs a
  best-friend stray (6 greets, or 4 with Charmer) and then a `0.3` roll, at most
  once per walk. Five of those is a long RNG grind for the target player.
- **Two ability halves are unimplemented** (CF-9): Spring Paws' "markedly higher
  pounce jump" (`player.pounce()` has no vertical component at all) and Sure
  Claws' "props that were scenery become climbable" (shipped perch records carry
  no per-prop tag). Both abilities work; each is missing its second half.
- **Spring Paws kept the spec's 2.2 climb budget** (CF-8) — §Traversal and
  §Risks contradicted each other, and the §Risks wording was ruled imprecise.
  "Trivialized" means *reachable without climbing at all*, not *in fewer hops*.
- The §Sequencing baseline of "393 tests" is long stale; the wave finished at
  **758 passing across 52 files**.
