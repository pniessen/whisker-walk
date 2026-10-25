# Whisker Walk v21 — A Reason to Come Back

**Date:** 2026-10-24
**Status:** design, approved for planning

---

## 1. Intent, and the why

Whisker Walk is played by two kids, aged 11 and 9, on separate devices, in
what they want to be the same world. That sentence is the whole design
constraint and it was not written down anywhere before this document.

The game is in good shape. Twenty versions of work have produced four
hand-built outdoor areas plus a den, ten cats, twenty-eight accessories across
seven slots, twelve earnable abilities, stray cats with names and memory,
critters, climbing, scent, weather, wind, water, gold mice, gifts, ghosts, a
journal, a photo album, four-player live co-walks with curated chat, cloud
sync, and a documented renderer pass with real draw-call measurements.

And the kids don't come back.

The owner's own definition of failure: *"if they didn't have a reason to care,
or come back."* That is the problem this version exists to solve. Everything
else here — more verbs, more objects, better pixels, a nicer start screen — is
in scope because the owner asked for it, but it is sequenced behind, and in
service of, the one thing that matters.

### Why the existing progression doesn't do this

Whisker Walk is not short of objectives. It has three dealt goals per walk, a
jackpot, rank titles, best-walk scores, a day streak, twelve ability feats, a
critter journal, a photo album, gold mice, and a furnishable den.

Almost all of it is **bookkeeping**. Whisker points, ranks and bests are
abstractions over play, not things a child wants. `🏆 House Cat — next: 150 🐾
to Yard Prowler` is a progress bar.

The two systems that already work the way children actually attach to things
were built almost incidentally:

- **`kitten.js`** — Mochi, who advances through stages and eventually *lives
  with you*. A relationship that changes.
- **`straycats.js`** — strays with names, who remember how many times you have
  greeted them, across walks, and who can be cross with you.

A kid who knows Mochi is at stage 2 has a reason to open the game. A kid
chasing 150 whisker points does not. **v21 takes the thing those two systems
do by accident and makes it the spine of the game.**

### The second finding: the game is unfair, not hard

Mid-brainstorm the 11-year-old volunteered that the existing objectives, "find
the lost glasses" specifically, are too difficult. Investigation confirmed this
is a missing affordance, not difficulty tuning. From `src/quests.js`, the three
objective strings as shipped:

| type | objective string |
|---|---|
| `kitten` | `Find the lost kitten 🐾` |
| `letter` | `Deliver the letter 📨 (look for the sparkle)` |
| `glasses` | `Find the lost glasses 👓` |

`createQuest` picks a random target from `targetSpots`; `tryComplete` succeeds
within a **2 metre** radius. The letter quest tells the player to look for a
sparkle, so its target is visually marked. **The kitten and glasses quests have
no marker, no waypoint, no arrow, and no hint of any kind.** The real task is
to sweep an entire hand-built area hunting an unmarked two-metre circle.

For children whose reference point is Roblox — where every objective carries a
glowing marker and a distance readout — this does not read as a challenge. It
reads as broken. Fixing it is the first work in this version.

### The third finding: they can't actually share a world

Live co-walks work and are well built. But they are **live only**, and joining
costs a four-character room code texted between devices, with the host
choosing the area and starting for everyone while the other child's button
reads "Waiting for host…".

Two consequences. The 9-year-old plays on the 11-year-old's schedule. And when
they are not online simultaneously — which is most of the time — the world
they supposedly share retains no evidence of each other whatsoever.

---

## 2. Goals

1. **A reason to come back tomorrow.** Something in the world changes while the
   player is away, and they can tell.
2. **A reason to care.** The thing that changes is a relationship with a named
   creature, not a number.
3. **Legibility.** A 9-year-old always knows what to do next and where to go.
   No objective is ever a blind search.
4. **Shared, asynchronously.** Both kids contribute to one world and each finds
   traces of the other without needing to be online at the same time.
5. **More verbs, with consequence.** Actions that leave the world changed
   rather than resolving instantly into a score.
6. **More to interact with.** Enough objects in each area to meet the verbs.
7. **Better looking, at a known frame rate.** Desktop pulls ahead; phone runs a
   simplified version.
8. **A start screen that keeps pace** with the game it opens.

## 3. Non-goals

- ~~No new walk areas.~~ **Reversed 2026-10-24** after playtest feedback: v21
  adds **one** new area. See §10. Deepening the existing four remains the
  priority and the new area is sequenced last.
- **No public walks and no strangers.** Decided 2026-10-24. Only the two
  players and invited friend codes, as today. This was the playtest's biggest
  structural request and it is declined deliberately: it collides with the
  no-accounts model, needs presence infrastructure, and puts unknown players
  near children. The cost is accepted — when one sibling is out, the game is
  single-player.
- No change to the live co-walk **wire format** or chat-safety model, and no
  change to the curated phrase set. *Clarification (author's call): this means
  no breaking protocol change. Adding a new `event` type is fine and
  backward-compatible — `game/netevents.js` ignores types it does not know. A
  literal reading of "no protocol change" would delete the live half of Stream
  2, which is not the intent.*
- No free-text chat, ever. (Existing constraint, restated because the colony
  feature creates pressure toward it.)
- No new third-party dependencies. Three.js, Vite, Vitest and Supabase are the
  stack.
- No accounts, logins, or personal data. Friend codes and room codes are the
  identity model.
- Not a rewrite. Every item below extends a system that already exists.

## 4. Anti-goals — what makes this a failure even if it ships

- **A checklist with a stopwatch.** Every mechanic must survive the test: a kid
  who ignores it entirely and just prowls should still be having a nice time.

  *Revised 2026-10-24.* An earlier draft stated this as "the pleasure of
  Whisker Walk is that nothing is at stake." The owner has since decided to
  **add real risk** (§10), so that sentence is withdrawn — but the anti-goal
  behind it is not. The replacement test for any risk mechanic:
  **recoverable, funny, and never retroactive.** A dog that chases you off is
  good. Rain that makes you drop what you are carrying is good. Anything that
  destroys accumulated progress — taming, colony membership, a persistent mark,
  a traded item — is forbidden, because it breaks the add-only rule in §9 and
  turns a sibling into a liability. Losing a thing you were holding is a story;
  losing four days of work is a reason to stop playing.
- **The 9-year-old losing.** Any mechanic that pits the siblings directly
  against each other on reflex or speed will be lost by the younger one every
  time. Shared contribution beats competition.
- **Another progress bar.** If the reward for the colony is whisker points,
  this version has failed.
- **Unfair objectives.** Shipping one more blind search would be worse than
  shipping nothing.
- **Grind.** Roblox-style constant reward drip is a legibility lesson, not a
  licence to add daily chores. A missed day must never punish.
- **Frame-rate regression on the phone.** Simplified is acceptable. Broken is
  not.

## 5. Constraints

- **Stack:** Three.js ~0.185, Vite 8, Vitest 4, Supabase JS 2. No additions.
- **Solo play never depends on the network.** Without
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, multiplayer shows "not
  configured" and everything else works offline. The colony **must** degrade to
  a single-player local colony under the same rule.
- **Determinism.** Anything derived from `(date, area)` seeds must agree across
  devices in a co-walk. `scent.js`'s `trailPoints` and `spots.js`'s `clearSpot`
  are pure for exactly this reason; new world content must follow.
- **Two render tiers only.** `render/quality.js` stays the single place a tier
  is decided. Existing discipline: anything costing **draw calls or nothing**
  ships on both tiers; anything costing **fill rate or texture bandwidth** is
  high-tier only. v21 relaxes this in one direction only — the high tier may
  now take work the low tier does not.
- **Measured baseline — and it is stale, so re-measure rather than quote it.**
  `docs/VISUAL-PASS.md` "Open items" records 1050 draw calls and ~106,700
  triangles per tick (Cozy Neighborhood, high tier, in-game) alongside a note
  that waves 3.1/3.2 were deferred. Those waves have since **landed at HEAD**
  (commit `281cd25`), and the seeded in-game A/B for them reads 1293 → 1110.
  Take a fresh number; do not plan against either figure above.
- **Frame rate has never been measured**, on any device. The same Open items
  section explains why — under automation rAF throttles to ~10 ticks over
  several seconds — and carries an unresolved caveat that the capture mechanism
  may force a second render per tick. A real reading needs devtools on a
  desktop and a real phone. See Stream 4.
- **Harnesses understate real cost by roughly 2×** — a `verify-*.html` builds
  only an area plus a cat, while the real walk also carries critters, strays,
  remotes, secrets, collectibles, ghosts, sky life, fx, scent, tippables, race
  rings, nametags and chat bubbles. Never size a budget from a harness number.
- **Hostile-input discipline.** Anything arriving from the cloud is coerced at
  the sanitizer *and* escaped at the render path. `progression.js` and
  `ui/hometabs.js` document why; colony state crossing the wire gets the same
  treatment.
- **Save schema: do NOT bump `SAVE_VERSION`.** An earlier draft asked for "a
  migration step"; that was wrong. `progression.js` is explicit that
  `SAVE_VERSION` stays 4 and additive fields sanitize-with-default instead —
  the precedent v18 and v20 both followed. Colony state is a new key with a
  sanitizer and a default, not a migration.
- **Tests are not optional.** The suite is ~75 files and the deploy workflow
  runs `npm test` before building. Pure logic lives in DOM-free leaf modules so
  it can be tested headless — `hometabs.js` and `journal.js` exist in their
  current shape for precisely this reason.

---

## 6. The five workstreams, in order

The order is deliberate and was set during the brainstorm. Each stream is
independently shippable and leaves the game better than it found it.

### Stream 1 — Legibility (first, and smallest)

Unblocks the 11-year-old's actual complaint. Nothing here is new technology.

**1.1 Scent-tracked objectives.** The signature fix. `scent.js` already exports
`trailPoints(from, to, rng, steps)`, which generates a deterministic trail
between two points and is already used for buried treats. Use it to lay a
scent trail from the quest giver to the quest target.

The cat has a nose; this is the most cat-appropriate solution available and it
replaces the game's most frustrating moment with its most characteristic verb.
Design notes:

- Faded paw-scent puffs along the trail, denser as the target nears.
- Legible without words: "warmer / colder" is understood by a 9-year-old.
- Revealed while stalking (Shift), so the player is *doing something* to track.
  This is the hook that makes it a skill rather than a map.
- Deterministic, so both devices in a co-walk see the same trail.

*As built (Stream 1):* the trail is laid from the cat's current position toward
the target, and re-laid on a warmth-scaled cadence, rather than as a fixed
giver-to-target path, so a kid who wanders off still gets a trail from where
they are. Each player in a co-walk therefore sees their own trail, not a shared
one; that supersedes the "deterministic" bullet above, and is fine because
quests are local to each device. Per §9.10 it is always on, not revealed by
stalking, which supersedes the stalking bullet above. The colour is violet (0xa64dff), distinct from the nose yellow and the
collectible pink. The beacon's base sits 1.6 m up so the target itself stays
visible beneath it.

**1.2 Objective markers.** Every active objective gets a visible world marker,
the way the letter quest's sparkle already does. No objective may rely on the
player sweeping an area.

**1.3 Distance readout.** On the HUD, for the active objective. Directly
borrowed from Roblox, where it is universal.

**1.4 Lock copy.** The area cards currently read `100 🐾 · 0/2 walks in City
Park` on the **Seaside** card — technically correct (Seaside unlocks after two
Park walks) but it names a different place than the card it sits on, and every
first read is "why is the Seaside card talking about the Park?" Rewrite as
`opens after 2 walks in the Park`, on the card it belongs to.
Source: `ui/homebase.js`'s `card()`, the `item.requires` branch.

**1.5 Area thumbnails.** Area cards are the only cards in the game with no
picture: `card()` hands `kind === 'areas'` a `null` thumbnail, while
`thumbnails.js` already renders cats and accessories off the real 3D models
into a throwaway WebGL context. Extend it to snap each area. The game's whole
appeal is its places and the place-picker is currently four text boxes.

### Stream 2 — The shared colony (the reason to come back)

This is the heart of v21.

**Four decisions the owner made after the builder check, all binding:**

1. **One shared colony.** Both kids tame the same cats and fill the same den.
   This is the expensive answer and it was chosen knowing that: it needs new
   Supabase schema — a colony table, a merge/append RPC, a conflict policy, a
   sync cadence, and a sanitizer for inbound rows.
2. **New SQL is allowed, and the owner will run it.** Design a proper
   idempotent schema block and hand it over to be pasted into Supabase → SQL
   Editor → New query → Run, exactly as `docs/supabase-setup.sql` already
   works. The builder cannot reach the project; the URL and anon key live in
   GitHub Actions secrets. **Do not** smuggle colony state through
   `upsert_profile`'s `p_accessories jsonb`.
3. **The colony starts empty, but cats you already know are EASIER to tame —
   and there is only ever ONE bar.** *(Revised 2026-10-24 after playtest
   feedback; see §9.)*

   No colony member is handed over for free, so day one still has something to
   do and the reason-to-come-back is not spent immediately. But existing
   `state.friends` greet counts **reduce the number of feeds** a cat needs. A
   head start, not a free cat. Fourteen greets on Peanut means Peanut is
   quicker to tame than a stranger, and those fourteen walks therefore meant
   something.

   **The hard requirement, and an earlier draft of this document got it
   exactly wrong:** that draft asked for the ♡/♥/💕 greet roster and the taming
   ladder to stand side by side as two parallel relationships on the same cat,
   with the instruction "do not quietly merge them." **Reverse that.** Two
   meters on one cat reads to a player as the game discarding work it had
   already credited — the words from the playtest were that it "feels like you
   deleted something" and "feels like the game cheated me." Both readers
   reached that independently and it was the strongest signal in the whole
   exercise.

   So: **one bar per cat.** Greet history feeds into it as a starting offset
   rather than sitting beside it as a rival meter. The builder may show *why* a
   cat is ahead ("you already know Peanut"), but must not render a second
   progress track.
4. **Pairing requires mutual confirmation.** Today `record_friend_greet` never
   validates `p_other_id`, so anyone holding a `CAT-XXXXXXXX` code can force a
   friendship row — and `blocklist.js` says in its own header that it is not a
   fix, only a per-device hide. A shared colony inherits that hole, which would
   let a stranger write into the kids' colony. Stream 2 therefore adds a
   pairing/invite flow (and likely a new RPC), and the no-room-code sibling
   join is built **on top of** that rather than on the existing unilateral add.
   This remains no-accounts and no-personal-data: friend codes stay the
   identity model.

**Author's call that follows from "one shared colony":** a colony member gets a
**fixed area and spot**, so it is genuinely "still there, behind the bins". That
is a real change to `createStrayCats`' spawn model, not an extension of it —
today strays are 22-of-48 (14 on `coarse`) redrawn every walk from a `walkRng`
shuffle, so no stray lives anywhere. Colony members must be spawned from colony
state, not from the shuffle; untamed strays keep the existing behaviour.

**Author's call on live co-walks:** when the kids walk together, **both clients
read the pair's colony at join**, so the cat they tamed together is present for
both. The alternative precedent in the codebase — `gifts.js`'s "each client sees
only its own" — is exactly the outcome a shared colony exists to prevent. This
adds a cloud read inside the join path and a new failure mode when one client is
offline; degrade to the local colony snapshot rather than blocking the join.

**The concept.** Strays are no longer only greetable acquaintances. They are a
**colony the players build together**: found, named, fed, gradually tamed over
multiple sessions, and eventually brought home to the den — where they stay,
visible, and get into trouble while nobody is watching.

**Why this and not something else** (owner's call on the goal, author's call on
the shape): it satisfies every goal at once. It changes while you are away
(goal 1). It is a named creature, not a number (goal 2). It is contributed to
rather than competed over, which dissolves the age gap (goals 4 and the
9-year-old anti-goal). It gives the persistent marks of Stream 3 a *reason* to
persist — the mess is the colony's, and it is how you learn something happened
without you.

**Asynchronous by design.** The 11-year-old walks after school, finds a
skittish stray behind the bins, feeds it twice, goes to bed. The 9-year-old
walks that evening, same colony, and the stray is still there, still half-tame,
and someone has obviously been working on it.

**Build on, do not replace:**
- `straycats.js` — already has names, per-stray greet counts, friendship state,
  and grudges.
- `kitten.js` — already models a staged relationship ending in "lives with
  you". This is the template for a taming ladder.
- `ghosts.js` — an asynchronous-*presence* feature, and the natural rendering
  hook for "a sibling was here". Note it transports no actions: it renders a
  friend's appearance off the public `profiles` select.
- `gifts.js` — the leave-a-gift verb. Note its own header says it is
  **local-only**: "a co-walker in the same room walk sees their own gifts and
  none of yours."

**Correction to an earlier draft of this document, and it matters.** This design
previously claimed `cloudsync.js` plus the `saves` table were "already the
mechanism for shared state". **They are not.** There is no cross-device
shared-mutable-state path in this codebase at all:

- `saves` is one row per *device save* — whole-payload last-write-wins,
  authorized by a row secret, with a monotonic guard: `upsert_save` returns
  `'stale'` when `p_lifetime < existing.lifetime` (`docs/supabase-setup.sql`).
  Two siblings pointing at one save code would **fuse** their points, cats,
  album and den, and whoever lost the lifetime race would get permanent
  `'stale'` rejections. This is not a shared colony; it is save corruption.
- `profiles` and `friendships` are the only genuinely cross-player tables.
  `profiles` carries appearance only; `friendships` carries a greet counter.
  Neither can hold colony state.

So a **shared** colony requires new schema: a table, a merge/append RPC, a
conflict policy, a sync cadence, and a sanitizer for inbound rows. That is the
bulk of Stream 2. **Two linked** colonies that visit each other can ride the
existing read-only `profiles`-shaped pattern at roughly a third of the cost.
See §8 — this is the owner's call and it gates the stream.

**Drop the room code for siblings.** A linked player should appear as joinable
without anyone typing four characters. Live co-walk protocol is unchanged; this
is about how a session is *entered*. (Author's call; the owner named the
friction, not the remedy.)

**Reward in cosmetics, not points.** Roblox's actual retention currency is
something you wear that other people can see. Whisker Walk has twenty-eight
accessories and ten cats already — the right currency exists, it is just gated
behind abstract points. Colony milestones should hand out wearables directly,
and a co-walk should show them off.

*As built (Stream 2):* the builder's calls are the "Decisions" table in
`docs/superpowers/plans/2026-10-24-whisker-walk-v21-stream2-colony.md`. In
short:

- `TAME_FEEDS = 6`. Earlier greets give a 1/2/3 head start on the same bar.
- About 1 name in 4 is shy and needs both siblings, but only while the colony
  has 2 members and the other sibling has fed a colony cat in the last 14
  days. A sibling who stops playing can't strand a shy cat.
- The colony holds at most 24 cats and 2 members. A child alone can start at
  most 12 cats, so two colonies filled solo before pairing always fit in the
  shared 24, and the cap never removes a tamed cat. The den has a home for each of the 24: the 12
  furniture spots plus 12 spots just for cats.
- Milestones at 1, 3, 6 and 12 tamed cats each unlock an accessory. They never
  give points.
- Starters (`bell`, `bandana`) can't be traded.

Things that changed or were added while building:

- **Tamed is stored and settled.** `tamedBy` and `tamedWalk` are never
  cleared. Every sync also runs a settle step, which tames a cat whose bar is
  full once the shy rule no longer applies, for example after the owner
  unpairs by hand, or once the other sibling hasn't fed any cat for 14 days.
  Without it, that cat could never come home.
- **A lone member counts as unpaired.** A colony with fewer than 2 members
  syncs as `unpaired`, so a child left alone after an unpair can pair again.
- **Colony names leave the ordinary stray pool.** On a colony walk, every
  colony cat's name is removed from the ordinary stray shuffle (a filter only:
  the draw count is unchanged). That way a colony cat never also turns up as a
  plain stray in another area. A room with any non-partner member is identical
  to before.
- **Den cats are the full cat model.** They use a "loaf" nap pose, because the
  first nap pose read as a pot. Their spots avoid the den's furniture.
- **The "While you were out" card is one line per cat**, biggest news first,
  at most 8 lines. Dismissing it marks only what was shown.
- **Trading** needs two taps: "Swap!", then "Yes — swap forever". The second
  tap is ignored for 600 ms, so a double-tap can't skip the warning. An offer
  of an item you already own, or of a starter, shows only "No thanks". When
  you trade an accessory away, it comes off any cat you dressed with it, on
  both devices.
- **Pair walks** join a room named after the colony id, which is never shown
  and can't be guessed. A non-host's Start asks the host, and the host answers
  with a walk-config for the asker's area. The Host and Join-by-code controls
  stay, so the kids can still walk with friends.
- **The new tab bar scrolls sideways on phones.** The Colony tab is the
  seventh tab, which doesn't fit at 375 px.
- **The schema is SQL the owner runs**: `docs/supabase-colony.sql`, with the
  steps in `docs/COLONY-SETUP.md`. Until it runs, or with no network,
  everything works as a single-player local colony.

### Stream 3 — Deeper verbs and more to touch

The owner asked for both; they are one stream because the verbs are worthless
without objects and the objects are scenery without verbs.

**Today's verb list**, from `game/interactions.js`: `collect`, `tip`,
`tip-gnome`, `dig`, `quest-accept`, `quest-complete`, `stray-gift`, `stray`,
`ghost`, `kitten`, `race`, `scratch`, `boop`, `gift-leave` — plus movement and
expression: prowl, stalk, pounce, climb, meow, sniff, yarn, camera.

**The diagnosis.** It is not the count. **Almost every verb resolves instantly
and leaves nothing behind.** You tip a gnome; it is tipped, scored, done.
Nothing is carried, nothing stays moved, nothing was trying to get away. A
cat's best moments all have consequence: the thing that falls off the shelf and
is *still on the floor*, the mouse that bolts under the porch, the bag you drag
across the room because you can.

**Persistence model (owner's decision, revised mid-conversation to a hybrid):**

- **Within a walk — the default, and most of it.** Knock something off a ledge
  and it stays on the ground until you go home. Prey that escaped stays hidden.
  A pushed flap stays swinging. Wet paws print until they dry. Cheap: no save
  growth, and `discoveries.js` already resets per walk via `startWalk()`'s
  `seen = new Map()`.
- **Across walks — a bounded set of marks, per area.** Your scratch on *that*
  fence post, the hole you dug in *that* lawn, the yarn ball abandoned on a
  porch three walks ago. **Capped per area, oldest fading out**, so an area
  becomes recognizably lived-in without becoming a landfill.

**Marks are PRIVATE — author's call, resolving a contradiction in an earlier
draft.** That draft described marks as a local save key while also justifying
them as "how you learn something happened without you", which only works if a
sibling's scratch shows up in your world. Both cannot be true cheaply: marks
are far more numerous than colony members, and sharing them would put every one
on the same new wire as the colony and force the question of what a mark's
identity is across two devices.

The resolution: **marks are yours, the colony is shared.** A mark records what
*you* did to an area, which is what makes the place feel like yours. The
"something happened without me" feeling comes from **colony state** — a stray
that is tamer than you left it, a new member in the den — which is a small,
bounded roster and is already crossing the wire for other reasons. This keeps
Stream 3 additive and local (one save key, a cap, a sanitizer) and unblocks it
from Stream 2 entirely: the two streams can be built in either order.

**The id cost, stated plainly.** Persisting "this specific gnome is on its
side" requires the prop to have an identity. POIs and spots have ids
(`yarn-roof`, `feeder-raid`, `mail-nap`); the general props built in
`world/builder.js` and the area files **do not** — the gnome you tip is
anonymous geometry. Because only *marked* props need ids, this work is bounded
to a curated set rather than every piece of geometry. A prop with an id also
becomes scratchable, movable, rememberable and photographable as *that* prop,
so the id work pays for more than persistence.

**Verb directions.** Carry is **required** (see §9, item 5 — both playtest
readers picked it out unprompted). The rest are author's suggestions; the
builder should choose a coherent subset rather than implement all of them.
- **Carry — REQUIRED.** Pick a thing up in the mouth and move it. The single
  highest-value verb, because it composes with everything: carry a gift to a
  stray, carry a toy to the den, carry prey home. Pairs directly with Stream 2.
- **Knock down, and leave down** — the existing `tip` with memory.
- **Prey that evades** — critters that flee, hide, and can genuinely be caught
  or genuinely lost. `critters.js` and the existing `hunt` award are the hooks.
  Watch the cozy anti-goal: losing must be funny, not punishing.
- **Push through** — flaps, gates, gaps. Traversal with a visible result.
- **Drink, eat, nap somewhere specific** — verbs with no score attached at all,
  which is what keeps the game from becoming a checklist.

**More to interact with.** Each area needs enough new props to meet the verbs.
Note the draw-call budget: new props must go through the `render/mergeprops.js`
static-merge path that waves 3.1/3.2 established, not added as loose meshes.

### Stream 4 — The visual pass, round two

**Nothing here starts until there is a real frame-rate number.** The owner
asked for "better graphics while keeping good runtime", and there is currently
no baseline to keep. Required first:

- A devtools reading on the owner's desktop.
- A reading on a real phone.
- Resolution of the double-count caveat in `VISUAL-PASS.md` (is it ~1050 or
  ~525?).

With a baseline, and with **desktop first and the phone allowed to run a
simplified version** (owner's decision), the high tier is free to take work the
low tier does not — which the budget table in `VISUAL-PASS.md` anticipated when
it noted that a "high tier, but this GPU is a laptop iGPU" case would need
somewhere to land. The remaining open items in that document are the starting
backlog, including `ssao`, which is already listed as optional-on-high.

Also noted there and worth closing: `verify-{park,docks,seaside,neighborhood}.html`
still carry the old rig and never set `castShadow`, so they have never shown
shadows at all.

### Stream 5 — The start screen (last)

Deliberately last. The owner's words: *"It's not the #1 priority, but if we
level up the game we should level up the start so it keeps pace."* Doing it last
means it dresses a game that has already changed.

**Direction: the dressing room.** The owner chose option B from three mockups,
having clicked between B and A seven times — so the built design is B with A's
hero cat folded in, and that hybrid was shown and accepted.

- Cat preview at **full height** as the hero, live, off the real model, draggable
  to spin.
- Portrait strip beneath it to swap cats.
- Accessory slots **beside** the preview, so a hat lands on the cat while you
  are looking at it.
- Destination cards **with pictures** across the bottom, not behind a "change
  place" link.
- Skills, Social, Journal, Album, Sync and Settings drop to a quiet bottom row.

**Author's calls, stated as such:**
- **Phone stacking.** Hero cat, portrait strip, then the two columns become
  three pills — Wearing / Where to / More — with the chosen panel below. The
  start button and current place **pin to the bottom** so the primary action
  never scrolls away. This is the real cost of a two-column design and pinning
  is how it gets paid.
- **The den shop leaves this screen.** Today the Cats tab is one long scroll
  doing four unrelated jobs: pick a cat, pick a place, buy den furniture, place
  den furniture into twelve slots. The shop and the slots move **inside the
  den**, where the player can see what they are arranging.

**Where the accepted mockups live.** They are on disk, outside the repo because
`.superpowers/` is gitignored:

    .superpowers/brainstorm/69803-1792884520/content/start-screen-directions.html   # the three options
    .superpowers/brainstorm/69803-1792884520/content/dressing-room-v2.html          # the accepted hybrid, desktop + phone

Read `dressing-room-v2.html` rather than rebuilding the layout from the bullets
above — it carries the spacing, the portrait strip's treatment, and how the
accessory column reads beside a full-height cat. If those files are gone, ship
a static mockup for sign-off before wiring anything, and name that as a step in
the plan rather than discovering it late.

**Correction for the builder:** the mockups show "3 of 11" cats and "2 of 8
slots". The real catalog is **10 cats, 28 accessories, 7 slots, 12 skills**. Use
the real numbers.

---

## 7. What is left to the builder

- **Choosing the verb subset** in Stream 3. The directions above are
  suggestions; a coherent three that compose well beats five that don't.
- **The taming ladder's shape** — how many stages, what each costs, what
  advances it. `kitten.js`'s staging is the template, not a specification.
- **The colony cap** in Stream 3's persistent marks, and per-area mark limits.
  Pick numbers that feel lived-in, then check them against save size.
- **Colony state schema and its migration step.** New key in
  `progression.js`, sanitizer, escape-at-render, and a migration that leaves a
  v20 save working.
- **How a linked sibling appears as joinable** without a room code, inside the
  existing identity model (friend codes, no accounts).
- **Which Stream 4 items to take**, once the frame-rate baseline exists. Do not
  pre-commit; the number decides.
- **Test strategy per stream.** Follow the established pattern: pure logic in
  DOM-free leaf modules, rendering checked with a `verify-*.html` harness,
  remembering the ~2× understatement.

## 8. Settled, and the one thing still outstanding

A fresh reviewer read this document as a builder who could not ask anything,
and raised eight questions. Four were answered from the code and are corrected
in place above — the `saves`-table claim in Stream 2, the save-version
instruction in §5, the stale draw-call baseline in §5, and where the accepted
start-screen mockups live in Stream 5. Three more were author's calls and are
marked as such where they apply: marks are private while the colony is shared
(Stream 3), "no protocol change" means no wire-format or chat-safety change
(§3), and colony members get fixed spots with both clients reading the pair's
colony at join (Stream 2).

Four were the owner's, and all four are now decided — see Stream 2's binding
decisions: one shared colony, new SQL allowed and owner-run, colony starts
empty, pairing requires mutual confirmation.

**Target phone: iPhone 18** (owner, 2026-10-24). That is the device the low
tier must hold up on, and it sizes Stream 5's phone layout and pinned start
button.

**This is better news than the plan assumed, and it has a consequence the
builder must not miss.** `quality.js` resolves the tier from
`matchMedia('(pointer: coarse)')`, so **any** touch device gets `LOW` — 1024
shadow map, `postFx` off, `normalMaps` off, pixel ratio capped at 1.5 — and
`createStrayCats` drops to 14 strays from 22 (`game/walk.js:810`). That
heuristic was written to protect weak phones from a desktop-shaped frame. A
current flagship is not that phone, and treating it as one leaves real
capability unused on the only phone that actually matters here.

So Stream 4 has a second job beyond adding pixels: **revisit the tier
resolver.** `quality.js`'s own comment already anticipates this — it notes that
`normalMaps` is a separate flag rather than a read of `name === 'high'`
precisely so "a future 'high tier, but this GPU is a laptop iGPU' case has
somewhere to land without inventing a third tier." The same seam serves the
reverse case: a strong phone that should take more than `coarse` currently
allows. Do **not** simply force `HIGH` on iOS; promote individual knobs against
measured numbers, which is what the per-knob flag design exists for.

**The measurement is still the owner's to take, and it genuinely blocks Stream
4.** It cannot be produced by a builder: under automation rAF throttles to ~10
ticks over several seconds, so any figure from that environment is meaningless.
The hand-off is therefore:

1. Build Stream 4's **in-game fps readout** first — a visible counter during a
   real walk, on both tiers. This is the whole of Stream 4 until step 3.
2. Owner reads it on the **desktop** (with devtools, to also resolve the
   double-count caveat above) and on the **iPhone 18**.
3. Those numbers decide which visual items to take, and which low-tier knobs
   the iPhone 18 can afford. Do not pre-commit to any of them.

Note for Track B (see §10): this is why rendering work cannot start on day one,
even though its files are otherwise disjoint from everything else.

---

## 9. Playtest feedback (2026-10-24) — adopted, and still open

Two independent readings of this document were commissioned from the target
player's perspective: an 11-year-old, heavy Roblox player. One read it cold as a
player, one as the older sibling who would share the colony with a 9-year-old.
Both were instructed not to be encouraging.

**Caveat for the builder:** these were roleplayed readings, not the real child.
Where the two readers reached the same conclusion independently, weight it
heavily. Where only the Roblox-comparison reader asked for a Roblox feature,
weight it lower — the prompt invited that answer. The real 11-year-old is
available and overrules both.

### Adopted — build these

1. **One bar per cat, with a head start.** See Stream 2 decision 3. The
   strongest signal in the exercise; both readers independently called the
   two-meter design a cheat.
2. **Add-only is the governing rule for everything shared.** The sibling
   reader traced every predicted fight to one root: a player undoing or moving
   something the other player did. Consequences:
   - **Taming never regresses.** This collides with shipped code —
     `straycats.js` already models grudges and cross cats. A cat may be annoyed
     at one player without losing the other player's progress, and a sibling
     scaring a half-tame cat must not wipe days of work.
   - **Names are permanent and belong to the finder.** Left open, a 9-year-old
     names a cat something stupid on purpose and it is in the den forever.
     Either the finder names it and nobody can change it, or cats arrive
     pre-named.
   - **Attribution is visible.** Show who fed what, plainly — "Peanut: you fed
     4, they fed 1" — not as points. Otherwise the kid who did most of the work
     watches the other claim the cat.
   - **Nobody rearranges anyone's den.** Twelve shared slots will be
     re-sorted forever. Split the den, or give each cat a spot owned by
     whoever tamed it.
3. **Colony progress advances by PLAYER ACTION, never by a clock.** This
   resolves the one place the two readers flatly contradicted each other. The
   sibling reader found async the best part of the whole plan; the cold reader
   attacked the premise — overnight taming is "the game telling me to go
   away," and timers do not pull a kid back, people do. The difference is that
   every good async moment the first reader described was *caused by her
   sibling*, and the bad one the second described was *caused by a timer*. So:
   no hatch timers, no overnight growth, nothing that rewards logging off. A
   colony changes only because the other player did something.
4. **A "while you were out" screen, first thing on open.** Named by the
   sibling reader as make-or-break: if the player has to go and find what
   changed, they won't, "and the whole plan dies." List it immediately — who
   fed what, what is new in the den, what got knocked over.
5. **Carrying is promoted from suggestion to requirement.** Stream 3 currently
   files it among directions the builder may skip. Both readers picked it out
   unprompted as one of the best ideas in the document. Do not skip it.
6. **A cat that needs two different feeders.** The sibling reader's own idea
   and the best in either report: a cat too frightened to come home unless
   **both** players have fed it. Her reasoning — "your whole plan is 'sharing
   is nice' and sharing is not automatically nice" — is sharper than anything
   in §2. This converts a sibling from an intruder into someone you go and
   fetch.
7. **Cosmetics must be visible to the other player.** Otherwise, in both
   readers' words, it is "a sticker in a drawer." A dressed colony cat shows up
   dressed on the other device.
8. **Cats must do things on their own in the den.** The one sentence in Stream
   2 the cold reader said she would come back for — "they get into trouble
   while nobody is watching" — and the sibling reader independently asked for
   the same: be somewhere different each day, be stuck in a box, have knocked
   something over.
9. **Fix the host problem, not just the room code.** Stream 2 proposed dropping
   the four-character code. The sibling reader says the code is irrelevant —
   "we live in the same house, I just yell it." The actual friction is
   `Waiting for host…` and the host choosing the area for both. Let either
   player start; let a joiner go somewhere else.
10. **The scent trail must not be stalk-gated.** Stream 1.1 reveals the trail
    while stalking. If the target is across a whole area that means
    sneak-walking the entire way — "that's not a skill, that's just slow."
    Keep the trail visible at walking pace, or make it short and only for the
    final approach. Show only the active quest's trail; two trails means
    following the wrong one.

### Decided by the owner, 2026-10-24 — see §10 for where each lands

- **Stakes: add real risk.** In.
- **Rarity: in.** Including surfacing the gold mice, which the reader correctly
  noted are nearly this already and currently buried.
- **Trading: in.**
- **Public walks with strangers: declined.** See §3.
- **New areas: one.** §3's non-goal reversed.
- **Redeem codes: in.**

### Author's calls, not owner decisions

- **Distance readout — smell-first, number available but not forced.** The
  readers disagreed outright: the sibling reader says the number is what
  actually prevents frustration and must never be hidden; the cold reader says
  drop the marker and number entirely because "markers are what every game has
  — the nose is yours." The nose leads; the number is there for a player who is
  stuck rather than pushed at one who isn't.
- **Journal and photo album — left alone in v21.** The cold reader called these
  homework and said she would never open the tab once. That is one roleplayed
  opinion against a shipped feature, so nothing is removed, but it is a reason
  not to invest further in them until the real player is asked.

---

## 10. Scope added 2026-10-24, and where it lands

Four owner decisions after the playtest add work. Each is placed against an
existing stream rather than bolted on, and each inherits that stream's rules.

**10.1 Real risk — folded into Stream 3.** It belongs with the verbs because it
is the same system: a world that can push back is a world where carrying,
stalking and hiding mean something. Bound by the revised anti-goal in §4 —
**recoverable, funny, never retroactive.** `enemies.js` already exists and is
the starting point rather than a new system. Candidates: a dog that chases the
cat off a lawn; rain that makes a carried item drop; prey that escapes for good
*in that walk*. Explicitly forbidden: anything that reduces taming, removes a
colony member, deletes a persistent mark, or takes back a trade.

**10.2 Rare finds — folded into Stream 3.** Find-based, so it belongs with the
objects. Two parts: a genuinely long-odds legendary cat, and **surfacing the
gold mice**, which the playtest correctly identified as nearly this mechanic
already and currently buried. Rarity must be a *find*, not a grind — it pays
off prowling, which is the behaviour this game wants to reward.

**10.3 Trading — folded into Stream 2.** It is the same wire and the same
schema work as the colony, and it obeys the same add-only rule: a completed
trade is final and cannot be reversed by either side. With two players this is
a sibling swap, not an economy, which keeps it small. It also directly serves
§9 item 7 — a cosmetic becomes worth having when it can be *given*. Note the
sequencing: trading depends on the colony's shared-state path, so it cannot
start before Stream 2's schema exists.

**10.4 Redeem codes — small, standalone, anywhere.** Type a code, receive a
thing. Trivial to build. One honest note for the owner: codes work socially
because they come from somewhere — a video, a group chat. With two players, the
owner is the one handing them out, which is either charming or a chore. Build
the mechanism; let the owner decide how often to use it.

**10.5 One new area — Stream 6, last.** Built the way the other four were, and
sequenced after everything else precisely because it competes with them. The
existing four areas are currently thin on things to touch, so Stream 3's props
land in them first; a fifth empty area would make the thinness worse, not
better.

### A warning about size, which the owner should read

v21 began as "give two kids a reason to come back." It is now that, plus
deeper verbs, plus more objects, plus a risk system, plus rarity, plus trading,
plus codes, plus a visual pass, plus a start-screen rebuild, plus a new area —
on top of new Supabase schema with a pairing flow, which is the riskiest single
item in the document.

The author recommended splitting this into a v21 of Streams 1–3 and a v22 of
Streams 4–6.

**OWNER DECISION, 2026-10-24: keep it as ONE version.** The recommendation is
recorded above for context and is now closed. v21 is all six streams.

What that means for the plan:

- **The sequencing in §6 and §10 holds exactly as written.** It was built to be
  shippable in stages, and it still is — the order does not change just because
  the version boundary did.
- **Three hard ordering constraints**, which are not stylistic: trading
  (§10.3) follows Stream 2's colony schema; Stream 4 follows the frame-rate
  measurement hand-off (§8), which only the owner can produce; and the new area
  (§10.5) follows Stream 3's props, so it is not built empty.
- **Land each stream on its own.** One version does not mean one merge. Each
  stream should ship behind its own branch and its own green suite, so the kids
  get Stream 1's fixes long before Stream 6 exists. The riskiest single item in
  the version — Stream 2's new Supabase schema plus the pairing flow — should
  not sit unmerged behind unrelated work.
- **The start screen is no longer deferrable.** It was the main thing the split
  would have postponed; in a single version it is simply Stream 5, in its
  stated position after the visual pass.
