# Whisker Walk v21 — The Clan

**Stream 3, split in two and reordered. 3a (this document) is the clan; 3b is
the deeper verbs the v21 spec already describes.**

Companion to, and subordinate to,
`docs/superpowers/specs/2026-10-24-whisker-walk-v21-reason-to-come-back-design.md`
("the v21 spec"). Where the two disagree, the v21 spec's goals, non-goals,
anti-goals and constraints win. This document adds intent the v21 spec does not
contain and records the owner's decisions of 2026-10-25.

A builder check against the source was run before hand-over; §12 records what
it changed.

---

## 1. Intent, and the why

The owner's 11-year-old daughter — the player the whole of v21 is built for —
loves Erin Hunter's *Warrior Cats*. Her 9-year-old sister knows the books too.

That is the entire why, and it is a better one than the v21 spec had. v21's
problem statement is "give two kids a reason to come back," and its answer was
a shared colony plus deeper verbs. This document supplies the thing neither of
those had: **a world the players already care about before they open it.**

It is also, unexpectedly, a design shortcut. The Warrior Code is a published
list of fifteen rules about cats holding territory, and several of them are the
mechanics v21 had already decided to build, with reasons attached:

- **Code 11 — "Boundaries must be checked and marked daily. Challenge all
  trespassing cats."** This is the v21 spec's per-area persistent marks
  (§6, Stream 3), which the spec justifies only as "an area becomes
  recognisably lived-in." The code supplies a motive: the marks are a
  *border*, and there is someone to challenge.
- **Code 3 — "Elders and kits must be fed before apprentices and warriors."**
  This is carry (§9 item 5, REQUIRED) plus the shared colony den (Stream 2,
  merged). It gives the single highest-value verb in v21 somewhere to carry
  *to*, and it does it without a score.
- **Code 15 — "A warrior rejects the soft life of a kittypet."** The player's
  cat *is* a house cat that goes out for walks. The game is a kittypet playing
  at being a warrior, and that is the joke the elder sister will enjoy most.

**One rule of the fifteen is explicitly rejected.** Code 11 says boundaries
must be marked **daily**. The v21 spec's §9 item 3 ("colony progress advances
by PLAYER ACTION, never by a clock") and its grind anti-goal both forbid a
daily obligation. Marking is something a player *may* do and the marks persist;
nothing ever asks for it, nothing decays for want of it, and a missed day costs
nothing. See §5.

---

## 2. What the owner decided, 2026-10-25

Recorded as decisions, not suggestions. Each was put to the owner explicitly.

| # | Decision |
|---|----------|
| 1 | Depth: **flavour and mechanics**, not flavour alone. |
| 2 | Re-skin the shipped taming ladder as kit / apprentice / warrior. *Narrowed by decision 11 — see §6.2.* |
| 3 | Reach: **"maybe one day" public** — every borrowed term lives behind one swappable strings file from the start. |
| 4 | Both children know the books, so the vocabulary may be used as vocabulary. |
| 5 | Clan structure, the hierarchy, and a **two-part naming convention**, all in. |
| 6 | Cats already tamed get a **naming ceremony**, not a silent rename. *Narrowed by decision 11.* |
| 7 | Leader: **both players, one `-star` each**. Deliberately non-canonical. |
| 8 | Ranks in: **elders, medicine cat, queens and kits, deputy** — all four. |
| 9 | Rival clans: **one in every area.** Four. |
| 10 | Order: **clan first, verbs second.** |
| 11 | Names: **chosen for the player's own cat, derived for colony cats.** No new SQL in 3a. |
| 12 | Clan name: **minted locally; one name wins at pairing.** |
| 13 | Kits are **real cats that occupy no den slot until they become apprentices.** |

### Two decisions the author flagged against, and the owner confirmed

Both are recorded here so the builder does not re-litigate them, and so the
owner can change their mind cheaply later.

- **Carry waits.** The v21 spec's §9 item 5 makes carry REQUIRED and both
  playtest readers named it unprompted. Decision 10 puts it in 3b, behind all
  of the clan work. The owner chose this knowing it.
- **Four rival clans is the largest single item proposed for v21.** Larger
  than Stream 2's Supabase schema, which the v21 spec calls "the riskiest
  single item in the document." See §10 for the honest risk and the cut line.

### The author's calls, not the owner's

- The two players are **one clan**, never a clan each. Shared contribution over
  competition is the v21 spec's §4; two player clans would make a border
  between siblings.
- **Rank is never a score.** No rank appears in a points total, a goal, or
  `AWARDS`. See §5.
- **"The elder's clan name wins" is implemented as "the inviter's wins"** — see
  §6.6 for why the code cannot know which child is older, and why this is a
  faithful reading rather than a substitution.
- The remaining calls made in response to the builder check are listed in §12.

---

## 3. Goals

1. **A player who reads the books recognises the game in the first minute.**
   The names, the ranks, the den roles, the borders.
2. **A player who has not read them loses nothing.** Every borrowed structure
   must read as plain cat behaviour: a scent mark is a mark, a warrior name is
   a name, an elder is an old cat who cannot hunt.
3. **The name replaces a progress bar.** A cat's rung is legible from its name
   alone — `Mosskit`, `Mosspaw`, `Mossfur` — so the clan adds no new meter.
   This directly serves the v21 spec's "another progress bar" anti-goal.
4. **Naming is an event, and a safe one.** No text field; closed pools.
5. **No regression for the cats the children have already tamed.** Nothing is
   renamed in storage, nothing is lost, nothing un-tames.
6. **The marks from 3b have someone to matter to.** Four rival clans give
   territory a counterparty.

---

## 4. Non-goals

- **No new third-party dependencies, no new stack.** Inherited from the v21
  spec and unchanged.
- **No free text on the wire, and no change to the chat-safety model.**
- **No `SAVE_VERSION` bump.** Everything here is additive fields with
  sanitize-with-default, per the v21 spec's §5.
- **No new SQL and no change to the colony RPCs in 3a.** Decision 11 exists
  to buy this. See §6.2.
- **No rival-clan *combat*.** Rivals contest territory, scent over marks, and
  chase. Nothing here is a fight the 9-year-old can lose.
- **No reading comprehension test.** Nothing requires knowing the books, and
  nothing explains them either.
- **Not the books' plot.** No prophecies, no character arcs, no deaths. The
  structures and the vocabulary only.
- **No clan between the siblings.** One clan, two leaders.

---

## 5. Anti-goals — what makes this a failure even if it ships

- **A chore rota.** The single greatest risk in borrowing the Warrior Code is
  that it is written as *obligations*. Fifteen rules a kid must keep is the
  grind anti-goal with a licence. Every borrowed rule must arrive as an
  *affordance* — something you may do, that leaves a mark — never as a duty,
  a streak, a decay, or a reminder. If any screen in this feature can say
  "you haven't marked your borders today," the feature has failed.
- **Rank as rank.** If `-star` outranks `-paw` in anything other than a name,
  the 9-year-old is in a hierarchy with her sister. Rank must be descriptive,
  never a permission: no rank gates an area, a verb, a cosmetic, or a feed.
- **Losing a cat's name.** A name is permanent and belongs to the finder (v21
  spec §9 item 2). A migration, a merge, a sanitizer default or a rival clan
  may never change or drop one.
- **A fan-fiction engine.** The naming system generates from closed pools. It
  must not become a place to type free text, because that is the one thing the
  no-accounts, no-chat safety model rests on.
- **The elder sister's game.** If the 11-year-old understands the clan and the
  9-year-old is following her around being told what things mean, this has
  failed goal 2.
- **Breaking the merged colony.** Stream 2 is merged, working, and holds days
  of both children's progress. A regression there is not a bug, it is lost
  work. §8 lists the invariants.

---

## 6. The design

### 6.1 Names: prefix plus suffix, from closed pools

A clan name is two tokens: a **prefix** from a closed pool and a **suffix**
from a closed pool. `Moss` + `fur`.

Colony cat names today come from `CAT_NAMES` in `src/straynames.js`, a fixed
list of 48, and `isStrayName()` is the single gate every cloud-supplied name
passes — that is the whole of the no-free-text-on-the-wire model. **That gate
is not touched.** See §6.2.

The player's own cat is the one place a name is chosen. `state.petName` is free
text capped at 16 characters, blocklist-filtered by `validPetName()` in
`src/net.js`, and it already crosses the wire as a plain string in
`ghosts.js`, `remotecats.js` and `colony.js`'s partner record. A composed name
like `Mossstar` passes `validPetName` as it stands, so **a chosen clan name for
the player's cat needs no wire change, no schema change and no new column.**
The free-text path stays — a child who wants to call her cat Noodle may — and
the clan-name picker becomes the offered default.

**Pool contents are the builder's to choose**, with four hard rules:

- The pools contain ordinary English nature words — `Moss`, `Bramble`,
  `Ash`, `Dapple`, `Fern`, `Thistle`, `Pebble`; `-fur`, `-pelt`, `-claw`,
  `-tail`, `-stripe`, `-leap`, `-song`, `-wing`. The *convention* is what is
  recognisable; the words are generic.
- **No combination may produce a published character's name.** A deny list of
  the well-known ones (`Firestar`, `Bluestar`, `Graystripe`, `Tigerclaw`, and
  the rest findable on warriorcats.com's Cats pages) is checked at generation
  and in a unit test over the **full cross product** of the pools.
- **Every combination must pass `validPetName`.** Its blocklist check is a
  **substring** test, so some innocuous prefix+suffix pairs will be rejected;
  and its regex caps the whole name at 16 characters. Both are part of the
  same cross-product test, not an afterthought.
- Pool *size* must not change the number of `walkRng` draws anywhere. See
  §6.2's note on `shuffled(CAT_NAMES, rng)`.

### 6.2 Identity: the stored name is the key, the clan name is a display layer

**This section was rewritten after the builder check, and it is the most
important correction in the document.**

An earlier draft made the name's prefix the cat's identity — the save key, the
`state.friends` key, the `enemies.js` grudge key, the `denHome` key and the
input to the breed hash — and called that "the dangerous part." It was worse
than dangerous; it was unbuildable without breaking the children's colony:

- `sanitizeCat`, `canFeed`, `isFeedKey` and the `seen.tamed` list all validate
  names with `isStrayName()`. A re-keyed cat is **dropped on the next load**
  and can never be fed again.
- `public.colony_cats`'s primary key **is** `(colony_id, name)`. Re-keying is a
  primary-key migration, which decision 11 exists to avoid.
- `state.friends[name]` and `state.grudges` would keep the old key, orphaning
  the greet history and any grudge — the exact failure the change was meant to
  prevent.
- Breed is **stored** per friend (`state.friends[name].breed`) *and* re-derived
  from the name at render in `ui/colonypanel.js` and `game/walk.js`. Hashing a
  new prefix changes a known cat's coat colour at the moment of its ceremony.

**So the stored name never changes.** `CAT_NAMES`, `isStrayName()`,
`strayBreed()`, the friends and grudge keys, `denHome`, the feed keys and the
server primary key are all **exactly as they ship**. The clan name is a
presentation layer computed from the stored name:

```
clanName(storedName, rank) = prefixFor(storedName) + suffixFor(storedName, rank)
```

Both halves are pure functions of data both devices already have, so the two
children see the same clan name for the same cat with **no wire traffic, no SQL,
no merge change and no collision to arbitrate.** This also closes the hole the
check found in `mergeColony`: it returns the *remote* cat object for any cat
both sides hold, preserving only `tamedBy`/`tamedWalk`, so a new per-cat field
would be silently discarded at the next sync. A derived name cannot be
discarded, because it is never stored.

**Three consequences the builder must respect:**

1. `prefixFor` must be a **new** hash, not `strayBreed`'s, and must not reuse
   `seedFromCode` in a way that changes any existing draw. `isShy()` and
   `denMoment()` are already name-hashed and pinned by tests.
2. **Pool size must not touch `walkRng`.** `shuffled(CAT_NAMES, rng)` in
   `straycats.js` consumes `CAT_NAMES.length - 1` draws, and `game/walk.js`
   carries a standing warning that shifting draws changes gifts, weather,
   secrets and goals downstream. The clan pools are a *separate* list consumed
   outside `walkRng`; `CAT_NAMES` itself is not extended, reordered or resized.
3. **Two stored names may derive the same clan name.** The generator needs a
   stated tiebreak (a second suffix choice, or a salt from the stored name) and
   a test that the 48 shipped names yield 48 distinct clan names.

### 6.3 The rank ladder, mapped onto the bars that already ship

No new meter. The ranks are a relabelling of two ladders already in the code.

**Colony cats — `src/colony.js`, `TAME_FEEDS = 6`.** The table is indexed on
`tamingProgress(colony, name).have`, **not** on raw feed count, because
`headStartFor` gives a cat you already know up to `HEAD_START_MAX = 3` of the
bar — so a familiar cat is never a kit, which is correct and is the point:

| `have` | Rank | Name form |
|--------|------|-----------|
| 0–1 | kit | `Moss` + `-kit` |
| 2–5 | apprentice | `Moss` + `-paw` |
| 6 (tamed) | warrior | `Moss` + its earned suffix |

The bar's arithmetic does not change. `tamingProgress()` gains a derived rank;
`feedCat()`, `canFeed()`, `headStartFor()`, `settleTaming()` and the add-only
merge are untouched. **Every rank is derived, never stored.**

**Strays outside the clan — `src/skills.js`, `FRIEND_RUNGS = {met: 1,
friend: 3, best: 6}`:** these get the books' words for cats outside a clan,
which costs nothing but a strings change.

| Today | Becomes | Why it fits |
|-------|---------|-------------|
| a stray you have greeted | **loner** | the glossary's "lives peacefully on its own, doesn't defend territory" |
| a cross cat (`enemies.js` grudge) | **rogue** | the glossary's "potentially hostile cat who lives outside the Clans" |
| the player's own cat | **kittypet** turned warrior | Code 15, as a joke |

That third row is the whole v20 "Ruffled Fur" enemy system reframed into the
books' vocabulary with no mechanical change whatsoever.

### 6.4 Roles in the den

Rank (§6.3) is where a cat is on the taming ladder. A **role** is what it does
in the den. All four of the owner's choices are in.

**What a role is in 3a, stated plainly.** Decision 1 is "flavour and
mechanics", but decision 10 puts the clan first, and every *mechanic* for a
role lives in 3b — elders are fed by carry, the medicine cat pairs with herbs.
So in 3a a role is a **label plus a behaviour the den already has**:
`denMoment(name, ymd)` already ships, is already deterministic per cat per day,
and already produces nap / box / knocked-over / window / grooming moments. A
role selects and colours those. That is enough to serve the v21 spec's §9 item
8, and it is honest about what 3a delivers.

- **Elders.** Old cats who cannot hunt. Derived deterministically from the
  stored name, exactly as breed is, so both devices agree with no wire message.
  In 3b, carried prey feeds them and Code 3 becomes a mechanic.
- **Queens and kits.** See §6.5 — the one item here with real new storage.
- **Medicine cat.** Exactly one, and a hash over names yields zero or several,
  so it needs a **selection rule, not a predicate**: the lowest-sorting tamed
  cat whose derived trait is eligible, with `tamedCats()`'s existing
  `walkMs(tamedWalk) || byName` ordering as the tiebreak. It must not change
  hands when the next cat is tamed — once chosen, stored once, never moved.
- **Deputy.** The **first colony cat fed by both players**. The one appointed
  position in the den, and the reward for the exact behaviour v21 exists to
  encourage — neither child can earn it alone. Determinism needs care:
  `mergeColony` puts remote feeds first and local-only feeds after, so feed
  *list order differs per device*. Order by the feed's `walk-<ms>` stamp with
  the cat name as tiebreak, reusing `tamedCats()`'s idiom, and store the
  verdict once it is settled.
- **Leader — both players, one `-star` each.** Each child's own cat carries a
  `-star` name, chosen by her (§6.1). Non-canonical and chosen knowingly: it
  gives each child the best name in the books and makes neither one anybody's
  subordinate. The clan has two leaders and no one minds.

### 6.5 Queens and kits — the one piece with new storage

Decision 13: a kit is a real cat with a name, it occupies **no den slot** while
it is a kit, and it takes one when it becomes an apprentice.

`DEN_HOMES.length` is exactly `COLONY_MAX` (24) by construction, and `denHome()`
already returns `null` past the last home — so kits **must not** be ordinary
colony cats, or they would eat slots the children's tamed cats need, which §8.5
forbids outright.

The shape that satisfies decision 13 without new SQL:

- A queen is a role (§6.4). Her kits' **count and names are derived** from the
  queen's stored name plus a stable colony-local seed — so both devices show
  the same kits with no wire message and no row.
- A kit **renders beside its mother** in her den home. No `DEN_HOMES` entry,
  no `colony_cats` row, nothing in `COLONY_MAX`'s accounting.
- Becoming an apprentice is the transition that needs shared state, and it is
  the **existing** one: a kit that is fed becomes an apprentice and from that
  moment is an ordinary colony cat on the ordinary ladder, counted by
  `colonyCap` like any other.

**This is the largest open risk in 3a and the builder's first task.** A fed
kit's name has to pass `isStrayName()` and the server's `(colony_id, name)`
primary key, and a derived kit name is not in `CAT_NAMES`. Two ways out, and
the builder should resolve this before writing anything else:

- **Reserve names.** Extend the *validated vocabulary* with a kit block while
  leaving `CAT_NAMES` itself untouched for `walkRng` purposes (§6.2 note 2) —
  i.e. a second exported list that `isStrayName` also accepts. Keeps 3a
  SQL-free. **Recommended.**
- **Accept SQL.** If reserving names proves unworkable, kits need a schema
  change, and that puts 3a in the same risk class as Stream 2 — which decision
  11 was chosen to avoid. **This would need the owner's agreement**, because it
  reverses a decision they made, and the owner runs the SQL from a file.

### 6.6 The clan, and its name

One clan, shared by the two players.

The name is `<Prefix>Clan`, from the closed prefix pool. It **cannot** be
seeded from the colony id: `emptyColony()` sets `id: null`, the id is minted by
the server, `progression.js` treats a non-null id as the test for being paired,
and the id is deliberately never displayed because it is the pair room's name.
A solo colony has no id to seed from, and pairing would change the name.

So, per decision 12: **the clan name is minted locally** from a stable local
seed — the player's own id, which exists before any pairing and never changes —
and persisted as an additive save field. A child playing alone has a clan with a
name from the first walk.

**At pairing, one name wins and the other child's clan is renamed once.** The
owner's words were "the elder's wins". The code has no notion of which child is
older, so this is implemented as **the inviter's name wins**: the device that
created the invite keeps its clan name, the joiner adopts it, and each device
can tell which it was from the existing invite flow without any new field
crossing the wire. In practice the elder sister is the one who sets up pairing —
the v21 spec's §9 item 9 has her yelling the code across the house — so this is
a faithful reading rather than a substitution. **It is worth the owner knowing
that whoever invites decides**, and that the other child's clan name changes
once, visibly, at that moment. An unpair and re-pair must not change it again:
once adopted, the name is stored, not re-derived.

### 6.7 Rival clans — four, one per area

The owner's decision 9, and the largest content item here. One rival clan per
area: Cozy Neighborhood, the park, the seaside, the Docks. `COLONY_AREAS` is
these four; the fifth area in the v21 spec's §10.5 (Stream 6) brings its own
clan as part of that stream's work, and 3a neither builds it nor blocks it.

Each rival clan needs, and needs only:

- **A name and a naming style**, from the same pools and the same deny list.
- **A territory**: a sub-region of its area, with a border the player can see.
- **Visible scent marks** along that border — how the player knows where it is
  without a map or a readout.
- **A patrol**: rival cats that move along the border and react to a
  trespasser.
- **A cost for crossing**, which must be recoverable, funny and never
  retroactive, per the v21 spec's §4 as revised. Being chased back over the
  border is the model. Nothing lost, nothing taken, nothing undone.

**Rendering: flat decals, not merged props.** An earlier draft sent border
marks through `render/mergeprops.js`. That was wrong and would have cost the
builder real time. `mergeStaticProps` merges only build-time geometry, strictly
within one top-level scene child, and explicitly excludes anything with mutable
per-leaf state or created after the area build — a contested, re-markable mark
is both. Worse, `contactshadows.js`'s `MAX_SPAN` of 6.5 m would make a long
merged border strip's ground decal **vanish silently**. The established idiom
for exactly this is `scent.js`'s flat `CircleGeometry` + `MeshBasicMaterial`
decals, which `kitten.js` already copies. Use that, and budget it as fill rate
rather than draw calls.

**Determinism:** a rival clan's territory, marks and patrol must derive from
`(area)` or `(date, area)` seeds so both devices agree in a co-walk, exactly as
`scent.js`'s `trailPoints` and `spots.js`'s `clearSpot` already do. New draws
must not shift existing ones; a co-walk with a non-partner must behave exactly
as it does today.

**Scenting over a mark must not delete it.** Deleting a persistent mark is
explicitly forbidden by the v21 spec's §10.1. A contested mark is shown as
contested and is re-markable. Never gone.

### 6.8 The strings file, and decision 3

Every borrowed word — every rank name, every glossary term, the pools, the
clan-name suffix — lives in **one module** with no logic in it, and nothing
elsewhere in the source hard-codes a borrowed string. A short note at the top
records what came from the books, so that if this game ever leaves the family
the swap is one commit against one file.

The game's own vocabulary stays where it already is. This file is additive.

---

## 7. Constraints

Inherited from the v21 spec §5 in full, and these are the ones this design
leans on hardest:

- **`SAVE_VERSION` stays 4.** Clan names, the chosen pet name, role verdicts,
  the clan's own name and contested marks are additive fields with sanitizers
  and defaults.
- **No new SQL and no RPC change in 3a.** Decision 11. The one thing that might
  force it is kits (§6.5), and that comes back to the owner.
- **Hostile-input discipline.** Anything arriving from the cloud is coerced at
  the sanitizer and escaped at render. Derived names are composed locally from
  the client's own pools, which is why they are safe by construction.
- **Determinism.** Clan names, ranks, roles, kits and rival territory are all
  derived or seeded, never rolled.
- **`walkRng` determinism.** A co-walk with a non-partner must behave exactly
  as before; new draws must not shift existing ones, and `CAT_NAMES` is not
  resized (§6.2 note 2).
- **Two render tiers.** Border marks are flat decals (§6.7) — fill rate, so
  high-tier may take more than low. `render/quality.js` stays the only place a
  tier is decided.
- **Solo play never depends on the network.** A local colony gets a clan name,
  ranks, roles, kits and rival clans with no Supabase at all.
- **Tests are not optional.** Pure logic in DOM-free leaf modules. The pools,
  the deny list and `validPetName` over the full cross product, the 48-names-to-
  48-distinct-clan-names property, rank derivation off `tamingProgress().have`,
  the deputy and medicine-cat selection rules, and every sanitizer are all
  headless-testable, and should be.

---

## 8. Invariants against the merged colony

Decision 2's original form would have modified merged code holding both
children's progress. §6.2 removes most of that exposure. These remain
invariants, and should be tests before they are changes:

1. **No cat un-tames.** `tamedBy`/`tamedWalk` are stored precisely so taming
   never regresses; nothing here may derive them afresh.
2. **No cat is dropped.** `sanitizeColony` never trims a tamed cat, and
   `isStrayName()` stays the gate — which is why §6.2 leaves stored names
   alone. A cat whose derived clan name is somehow unavailable must fall back
   to its stored name, not vanish.
3. **A v20 save still loads**, and a save written by this version must still
   load on a build without it — additive fields, ignored when unknown.
4. **Nothing new is stored per colony cat.** `mergeColony` returns the remote
   cat object for every cat both sides hold, keeping only `tamedBy`/`tamedWalk`,
   so any new per-cat field is dropped at the next sync. This is the reason
   clan names are derived rather than stored, and the reason a role verdict
   that must be shared (deputy, medicine cat) is derived from synced data
   rather than written onto a cat.
5. **`COLONY_MAX`/`SOLO_MAX` are untouched.** The last colony regression came
   from a fix that moved both caps at once. Kits exist outside this accounting
   until they become apprentices (§6.5).

---

## 9. What lands where

**Stream 3a — The Clan (this document, first).**
Pools, the deny list and the cross-product tests; derived clan names as a
display layer; rank derivation on the shipped bars; the loner/rogue/kittypet
reframing; the four den roles with the deputy and medicine-cat selection rules;
a chosen `-star` name for each child's own cat; queens and kits; the clan's own
name and the pairing rule; the strings file; four rival clans with territory,
visible decal border marks, patrols and a recoverable crossing cost.

**Stream 3b — Deeper verbs and more to touch (the v21 spec §6, second).**
Carry (REQUIRED); knock-down-and-stays-down; prey that evades; push-through
flaps and gaps; drink/eat/nap with no score; prop ids for a curated set;
within-walk persistence; six to eight persistent marks per area; the dog, one
per area in its own spot; rain that drops what you carry; four legendary cats,
one per area, at 1 in 5 until a couple are found and 1 in 20 after; the gold
mice surfaced as a plain "x of 12" readout in the home base; co-walk sync of
knock-downs and carried items as additive wire events.

The owner's answers for all of 3b are recorded in §11 so that stream needs no
second brainstorm.

**The ordering cost, stated once.** 3a depends on nothing in 3b. 3b's marks
become borders once 3a exists, and 3a's rival clans have nothing of the
player's to contest until 3b's marks exist — so the two halves each improve
the other, and whichever lands second is where that payoff appears.

---

## 10. Risks, honestly

- **Four rival clans is the biggest thing in v21.** Territory, marks and
  patrols in all four areas is larger than Stream 2's Supabase schema, which
  the v21 spec calls the riskiest item in the version. It is in on the owner's
  explicit decision. **If anything has to be cut to land 3a, cut rival clans to
  one area first** — the Docks is the natural fit, and the rest of 3a stands
  alone without them.
- **Kits are the one item that could force SQL into 3a** and reverse decision
  11. §6.5 makes it the builder's first task for that reason.
- **Seven ranks is a lot of vocabulary for a 9-year-old**, and goal 2 is that
  she loses nothing. The real test is her, not a roleplayed reader.
- **Carry is REQUIRED and is now second.** If the children play 3a and the
  world still leaves nothing behind, the v21 spec's central diagnosis —
  "almost every verb resolves instantly and leaves nothing behind" — is
  untouched by all of this work.
- **Derived names mean nobody picks a colony cat's name.** Decision 11 buys
  safety with a real loss: the ceremony becomes a reveal rather than a choice,
  and the v21 spec's §9 item 2 ("names are permanent and belong to the finder")
  is satisfied only in the weak sense that nothing can change them. If the
  11-year-old minds, the fix is decision 11's third option and it costs SQL.
- **The real 11-year-old overrules this document.** She is available, she is
  the reason it exists, and the v21 spec already says she overrules the
  roleplayed playtest readers. She should be asked about the pools, the reveal
  and the rival clans before they are built, not after.

---

## 11. What is left to the builder

- **The pool contents**, their size, and the deny list's membership. Pick words
  that compose well; test the cross product against both the deny list and
  `validPetName`.
- **`prefixFor` and `suffixFor`** — the hashes, their tiebreak, and the proof
  that the 48 shipped names give 48 distinct clan names.
- **Resolving kits** per §6.5, before anything else is written.
- **How a role is derived** so a den has a sensible mix rather than six elders.
- **Rival territory shapes, border geometry, and patrol behaviour** per area,
  within the determinism and flat-decal constraints.
- **What "chased back over the border" does mechanically**, within recoverable,
  funny, never retroactive.
- **Where rank and role appear in the UI**, given they must never read as a
  score.
- **Test strategy**, per the v21 spec §7's established pattern.

### The 3b answers already given, for when that stream starts

Verbs: all five. Carry persistence: the den keeps what you carry **and** it
counts as a per-area mark. Mark density: six to eight per area, oldest fading.
Legendary cats: four, one per area, 1 in 5 per unmet cat until a couple are
found, then 1 in 20; they join the shared colony. Risk: a dog per area in a
fixed spot, plus rain that makes you drop what you carry, both as described in
the v21 spec's §10.1. Gold mice: surfaced plainly as "x of 12" in the home
base. Co-walk: knock-downs **and** carried items sync, as additive events.

---

## 12. The builder check, and what it changed

A fresh reviewer read the first draft of this document as a builder who could
not ask anything, and checked every claim it made against the source. It found
four false assertions about the existing code; all four were verified and all
four are fixed above. They are recorded here because each one would have cost
the builder real time.

| Claim in the first draft | Why it was wrong | Where it is fixed |
|---|---|---|
| The prefix becomes the cat's identity key | `isStrayName()` gates `sanitizeCat`, `canFeed`, `isFeedKey` and `seen.tamed`; `colony_cats`'s PK **is** `(colony_id, name)`; breed is also **stored** per friend and re-derived at render in two more modules. A re-keyed cat is dropped on load and changes coat colour. | §6.2, rewritten |
| `mergeColony` is add-only, so a ceremony survives a merge | It returns the **remote** cat object for any cat both sides hold, preserving only `tamedBy`/`tamedWalk`. Any new per-cat field is discarded at the next sync. Combined with "no SQL in 3a", the two statements were jointly impossible. | §6.2, §8.4 |
| The clan name is seeded from the colony id | `emptyColony()` sets `id: null`; the id is server-minted, so a solo colony has none and pairing changes it. It is also deliberately never displayed. | §6.6, decision 12 |
| Border marks must go through `render/mergeprops.js` | It merges only build-time, per-leaf-immutable geometry within one top-level scene child, and `contactshadows.js`'s 6.5 m `MAX_SPAN` would make a long merged strip's decal vanish silently. | §6.7 |

It also caught that `headStartFor` gives a known cat up to 3 of the 6-feed bar,
so the rank table must index on `tamingProgress().have` (§6.3); that "exactly
one medicine cat" needs a selection rule rather than a hash predicate (§6.4);
that the deputy needs a stated ordering because `mergeColony` makes feed list
order device-dependent (§6.4); that `DEN_HOMES.length` is exactly `COLONY_MAX`,
so kits cannot be ordinary colony cats (§6.5); that `shuffled(CAT_NAMES, rng)`
makes pool size a `walkRng` hazard (§6.2); that `validPetName`'s blocklist is a
substring test and its cap is 16 characters, both of which constrain the pools
(§6.1); and that the player's own cat needs no index-based wire change at all,
because a composed name already passes `validPetName` as a string (§6.1).

Three questions were the owner's and were put to them: they became decisions
11, 12 and 13. Everything else the check raised was settled by the author and
is marked where it applies.
