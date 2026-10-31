# Whisker Walk — Clan Edition, Legacy Edition and the five territories (design)

2026-10-31. A design only: nothing here is built. It answers items 3, 4 and 5
of the 11-year-old playtester's feedback, passed on by her dad:

- **3.** A switchable **Clan Edition / Legacy Edition**.
- **4.** In Clan Edition, keep some of the old cat names as **kittypets**
  (house cats, as opposed to clan cats).
- **5.** In Clan Edition, the places should be the books' territories: the
  Woods (ThunderClan), the Moor (WindClan), the River and Marshes (RiverClan),
  the Pines and Swamp (ShadowClan) and the Gorge (SkyClan). They should be
  parts of one world, and some should share borders or overlap.

The three depend on each other, so they are designed together.

**Who reads this.** The owner (a parent) should be able to read the plain
sections in about ten minutes. Sections headed **Builder notes** are for
whoever builds it, and a parent can skip them.

**What this builds on.** The game was already reshaped toward *Warrior Cats*
in v21 Stream 3a (`docs/superpowers/specs/2026-10-25-whisker-walk-v21-the-clan-design.md`,
"the clan spec"). Its §2 decisions are settled and are not re-argued here. Its
§8 rules hold throughout: **no cat un-tames, no cat is dropped, an old save
still loads, and the colony caps stay as they are.**

---

## Owner's answers (2026-10-31): these override the draft below

The owner answered four of §6's questions. Where the draft below says
otherwise, these win:

1. **Legacy Edition is the older plain game, with no clan words.**
   - Legacy hides the v21 clan layer: clan names and roles, rival clans and
     their patrols, and clan wording.
   - It is still **hidden, not deleted.** The one-save rule holds. Clan
     progress (clan name, roles, marks, colony standing) stays in the save,
     untouched, and comes back when the kid flips to Clan Edition.
   - Cats tamed into the colony stay owned in Legacy. They show as the kid's
     cats, without clan titles.
   - **Co-walks across editions:** the rival patrol is already worked out
     locally on each device, so a Legacy kid simply sees none while a Clan kid
     sees them. Nothing on the wire changes.
   - This replaces "Legacy is today's game, unchanged" in the short version
     and in §1.
   - Builder: list every v21 3a surface that has to go quiet in Legacy, with a
     test that a Legacy walk spawns no rival patrol and shows no clan wording.
     A Legacy-only walk must not write to clan fields.
2. **Each kid picks their own clan.**
   - This runs into the anti-goal about sibling rivalry, so the design must
     make different clans **allies, never opponents**, for the two kids:
     - in a co-walk, the two kids' clans are always friends;
     - nothing scores one kid's clan against the other's;
     - rival patrols come only from the computer-run clans;
     - each territory's NPC clan is the one neither kid picked, or the
       territory's own clan when a kid picked it ("your clan's home").
   - Builder: per-kid clan choice is one more additive save field. The
     existing minted clan name (clan spec §2) becomes this choice in Clan
     Edition.
3. **Close homages, not the books' exact names.**
   - The code is on public GitHub, so clan and place names should clearly
     echo the books without copying them.
   - Propose a short list per clan for the 11-year-old to choose from before
     any names go into the game. Their meaning and flavour should match: the
     storm clan of the woods, the wind clan of the moor, the river clan, the
     shadow clan of the pines, the sky clan of the gorge.
   - Generic place words (the Woods, the Moor, the Gorge) are fine as they
     are.
   - This settles §5.
4. **The Gorge comes later.**
   - First release: Twolegplace, the Woods, the River and Marshes, the Pines
     and Swamp, and the Moor.
   - The Gorge (and its clan) is a later step, after the game can do height.
   - The territory map leaves a visible "unexplored" edge where the Gorge
     will join.

5. **All-new territories (answered after the four above).** Clan Edition's
   territories are **new maps**, not re-dressed versions of today's areas.
   Legacy keeps the Neighborhood, Park, Seaside and Docks exactly as they are.
   This overturns §3's recommendation and part of §1. Consequences the
   revised design has to work through:
   - **Progress no longer maps "exactly".**
     - New territories have new area ids, so walk counts, unlocks, marks,
       golden mice, races and scenics there start fresh.
     - Everything a kid owns (points, cats, colony, accessories) is still
       shared.
     - The revised design must say how a kid unlocks territories, and must
       never take away an unlocked Legacy area.
   - **The colony server** accepts only the four existing area ids. Every new
     territory needs the owner's one-line SQL change, and both kids' devices
     must update before anyone walks one (see the builder facts at the end).
   - **Much more work:** five new maps (four in the first release, the Gorge
     later), each with its own POIs, collectibles, golden mice, races,
     scenics, colliders, perches and props.
     - Build and ship them one territory at a time.
     - Each new map is held to the iPhone draw-call budget and the
       visual-pass standards in docs/VISUAL-PASS.md.
   - **Twolegplace** (where the kittypets live) must also be decided:
     - a new map;
     - or the Neighborhood, shared by both editions as the one place the two
       worlds meet.

     The second is cheaper, and it gives kittypets a home that exists in both
     editions.
   - **Borders and overlaps:** with all-new maps, shared borders can be built
     into the maps themselves, as matching edges and visible neighbours,
     rather than painted onto old horizons.

6. **Twolegplace is the Cozy Neighborhood, shared by both editions.**
   Kittypets mostly live there, but **occasionally wander into the clan
   territories**:
   - a rare, harmless visitor;
   - something a kid can meet, befriend or bring home, in the spirit of Rusty
     in book one.

   The revised design should say how often a wanderer appears, how it's
   chosen, and that it never counts against a kid. Builder: wanderers are
   local visuals or strays under the existing stray rules, and add nothing on
   the wire.
7. **The territory layout comes from the 11-year-old's own drawing.** She
   rearranged the proposal on 2026-10-31. It is saved in the "Clan Territory
   Map" artifact (https://claude.ai/artifact/K8j8579QoYSxJj1eFajuxC,
   db `layouts/current`, version 17), on a 1000 × 700 board with north up.
   Her layout replaces §3's.

   ```
                 N
       ┌───────────────┐┌────────────────┐
       │   PINES AND   ├┤      MOOR      │
       │     SWAMP  ~~~~~~~~~~~~~~~~~~~  │      (Gorge, later)
       └──────┬────────┘└──────┬─────~───┘     ┌─────────┐
              │          ★     │     ~         │  GORGE  │
       ┌──────┴────────┐ meeting place  ~      │ (later) │
     ~~~~~~~~~~~~~~~~~~~ ~~~~~~~~~~~~~~ ~      └────┬────┘
       │  RIVER AND (o)┼┤     WOODS      ├┐         │
       │   MARSHES     ││                ││ TWOLEG- │
       └───────────────┘└───────────.....┘│  PLACE  │
                                    path  └─────────┘
   ```

   **What touches (each pair shares a border):**
   - Pines and Moor;
   - Pines and River and Marshes (they overlap a little);
   - River and Marshes and Woods;
   - Woods and Moor;
   - Woods and Twolegplace;
   - Twolegplace and the Gorge, nearly (the Gorge is later anyway).

   **The ★ meeting place** sits in open ground in the middle, between the
   Pines, the Moor and the Woods, and belongs to no territory.

   **Her river** is one long river:
   - it enters from the far west and runs through the River and Marshes;
   - it makes a loop where the River and Marshes meet the Woods (read as a
     pond: to confirm);
   - it crosses the Woods eastward, turns north up the Woods–Moor side, then
     runs west across the Moor and ends at the Pines border;
   - so it nearly circles the meeting place.

   **A path** runs out of Twolegplace north-west into the Woods: the
   kittypets' way into clan land (to confirm).

   She left no notes and kept every territory's size. The Moor, Woods,
   Twolegplace and Gorge moved; the Pines and River barely did.
8. **What the Gorge looks like** (owner, 2026-10-31): rocks, dens dug into
   the cliff walls, and tall pine trees. It is still a later release.
   - Dens in the cliff walls make it the place where climbing and height
     matter most. That is why it waits until the game can do height
     (cliffs, ledges, perches you climb up to).
   - The cliff dens are natural spots to explore, hide in and nap in.

Next step: when the drawing arrives, revise §3 and the build order around it,
then write the implementation plan, one territory at a time.

---

## The short version

- **One save, two ways of telling it.** Both editions read the same save: the
  same points, cats, colony, marks and unlocks. The switch changes words,
  names and decoration. It never changes what a kid owns. Flip it any time on
  the home screen, and flip it back, and nothing is lost.
- **Legacy Edition is today's game, unchanged.** Clan Edition is the new layer
  on top. (Whether "today's game" is really what she means by Legacy is the
  first question in §6.)
- **Kittypets** are twelve of the old stray cats, the most house-cat-sounding
  ones. They live in Twolegplace (today's Cozy Neighborhood), wear collars and
  keep their names. They can be befriended and can join the clan, the way
  Rusty became Firepaw in book one.
- **Territories.** I recommend keeping separate maps rather than building one
  continuous world:
  - re-dress three of today's areas as territories, and keep the Neighborhood
    as Twolegplace;
  - build two new areas, the Moor and the Gorge;
  - make each map's horizon show its neighbours;
  - put a territory map on the home screen for choosing where to walk.

  A single continuous world would cost weeks of engine work and risk the
  colony and co-walks. The fog would also hide most of what it buys.

---

## 1. What each edition is

### What the two editions share (everything that matters)

| Thing | Shared? | Notes |
|---|---|---|
| The save file | **Shared, one save** | The edition is one extra setting inside it. |
| Points, lifetime points, rank | Shared | One number. |
| Unlocked cats, accessories, areas | Shared | Buying in either edition buys it for both. |
| The colony (both kids' cats), feeds, taming | Shared | The same cats with the same progress. |
| Marks, walk counts, golden mice, gifts, skills, streak, visits, journal, den furniture | Shared | All are stored under area ids that don't change (see below). |
| Your own cat and its name | Shared | The pet name (including a chosen `-star` name) is the same in both. |
| Each stray's real stored name | Shared | It never changes. Names on screen are a display layer, as the clan spec already does it. |

### What differs

| Thing | Legacy Edition | Clan Edition |
|---|---|---|
| Title | "Whisker Walk 2" + *Legacy Edition* | "Whisker Walk 2" + *Clan Edition* (the title already says this today) |
| Choosing where to walk | Today's list of area cards | A territory map: tap a territory to walk there |
| Place names | Cozy Neighborhood, City Park, Seaside, The Old Docks | Twolegplace, the Woods, the River and Marshes, the Pines and Swamp, plus the new Moor and Gorge |
| Rival clans | Today's four (HedgeClan, AlderClan, DuneClan, HeronClan) | The books' clans, each living in its own territory |
| Your clan | Today's minted clan name (for example MossClan) | The clan the kids pick (see §6, question 2) |
| Some strays | "Marmalade the loner" | "Marmalade the kittypet", wearing a collar |
| The den | "Den" | "Camp" (words only) |
| Decoration | Today's | Collider-free extras: ferns, reeds, border posts, horizons that show the next territory |

### The rule that keeps both kids safe

> **The edition never changes what a kid owns, and never changes the walkable
> world, what spawns where, or anything sent between the two devices.**

Three good things follow from that rule:

- **Switching can never lose anything.** Nothing is converted. Each Clan
  territory *is* one of today's areas underneath:
  - the Woods is the Park;
  - the River and Marshes is the Seaside;
  - the Pines and Swamp is the Docks;
  - Twolegplace is the Neighborhood.

  So "how does progress map across" has a one-word answer: **exactly.** Your
  12 walks in City Park are 12 walks in the Woods.
- **Co-walks across editions just work.** If she is on Clan Edition and he is
  on Legacy, they walk the same world. He sees "City Park" and she sees "the
  Woods", and each sees their own edition's words and decoration. The rival
  patrol is already worked out locally on each device, with nothing sent
  between them, so it can differ per edition without the two worlds drifting
  apart.
- **The switch can be flipped any time from the home screen, but not during
  a walk.** A walk's world is built when it starts, so the new edition shows
  from the next walk.

### Where the switch lives

- **On the home screen title**: tap "Clan Edition" to switch. The same
  choice also sits in Settings, in plain words.
- **It is saved with the kid's save, not the device.** Cloud sync then carries
  it with her, the same way the corner map's north-up choice is designed to.
- **Existing saves start on Legacy**, so nothing changes for either kid until
  one of them flips it. A brand-new save also starts on Legacy, and flipping
  takes one tap.

### Builder notes (skip if you're not building it)

- Add `edition: 'legacy' | 'clan'` to `progression.js` state as an additive,
  sanitised field defaulting to `'legacy'`. `SAVE_VERSION` stays 4. Older
  builds drop the unknown field on save, so the kid quietly falls back to
  Legacy, which is harmless.
- **Test the invariant directly.** For any save, flipping the edition there
  and back leaves the state deep-equal apart from `edition`.
- All edition-dependent *words* go through `clanwords.js` (clan spec §6.8 and
  decision 3). Use a second data-only file beside it if that is tidier
  (`clancanon.js`, say). Keep the structural scan test covering it.
- **Edition-only decoration carries no collider, no perch, no POI and no
  spawn.** Anything with a collider changes the world for both editions, so it
  needs the owner's OK because it changes Legacy.
- The rival patrol (`rivalcats.js`) uses the shared wall clock and sends
  nothing over the network; the chase moves only the local cat. That is why
  its clan name and presence may vary by edition. Disc **positions** should
  not vary by edition, though, because `markcontest.js` and `marks.js` read
  them. Keep `DISCS` as it is and change only the clan each disc belongs to.
- Areas stay keyed by today's ids (`neighborhood`, `park`, `seaside`,
  `docks`) everywhere: the save, `marks.js`, `goldmice.js`, the colony and the
  server. Territory names are a lookup from id to name per edition.

---

## 2. Kittypets

### How names work today

- **Strays** are drawn each walk from a fixed list of 48 food-and-fun names:
  Pickles, Marmalade, Baron von Fluff, Mochi and so on (`straynames.js`).
  There are also 12 kit names and 4 legendary cats: Duchess, Professor
  Whiskers, Captain Barnacle and Lord Lantern.
- In the world, a stray is called by that name: "You met Pickles the loner!"
  or "…the rogue" if it is cross with you (`colony.js`'s `outsideTag`).
- Once a stray joins the shared colony, its **Colony card** shows a clan name
  worked out from its stored name, for example Wrenkit → Wrenpaw → Wrenfur.
  The stored name "Pickles" never changes (clan spec §6.2).
- **The family cats** (Zeetoo, Robbie, D2, Digit, Hagrid) are not strays. They
  are cats a kid buys and walks *as*. A safety rule in `straycats.js` keeps
  family names out of the stray cast.
- The game already calls the *player's own cat* a kittypet: a house cat who
  goes out to play at being a warrior. That is the joke behind Warrior Code 15.

### Proposed rules

1. **Twelve named strays are kittypets.** The choice is fixed by name, so
   both devices agree and nothing new is stored. My proposed twelve are the
   most house-cat-sounding names: **Baron von Fluff, Sir Pounce, Marmalade,
   Biscuit, Mochi, Clementine, Petunia, Butterscotch, Truffle, Custard,
   Peaches, Waffles.** **Duchess**, the Neighborhood's legendary cat, is also
   a kittypet, the grandest one in Twolegplace. The other 36 strays stay
   loners and rogues. *She should pick or veto the list* (§6, question 6).
2. **Kittypets keep their old names, always.** In the world they are "Marmalade
   the kittypet", never a clan name.
3. **In Clan Edition, kittypets wear a collar** (decoration only, using the
   collar models the shop already has). Legacy shows them exactly as today.
4. **Where they appear.** Their home is Twolegplace (the Neighborhood).
   Strays are cast across all areas today, and changing who spawns where would
   make co-walks drift apart, so a kittypet will sometimes turn up in the Woods
   or on the Moor. In Clan Edition that reads as *"a kittypet out exploring"*,
   which is exactly what Rusty was. Keeping them strictly in Twolegplace is
   possible later, but it changes Legacy too, so it is the owner's call.
5. **They can be befriended, as today**: greet, friend, best friend.
6. **They can join the clan, as today.** This is the book-one moment. A
   kittypet who joins gets a clan name on the Colony card, with the old name
   kept underneath: ***Amberpaw*: once a kittypet called Marmalade.** A
   grown kittypet is never shown as a "-kit"; it starts at "-paw", as Rusty
   did.
7. **The family cats are always kittypets and always keep their names.**
   Robbie, D2, Digit, Zeetoo and Hagrid are the kids' real house cats. In Clan
   Edition the home screen can say *"Robbie, a kittypet who walks with
   ThunderClan"*. The shop doesn't change.

None of this renames, adds or removes a stored name, so the colony and the
server are untouched.

### Builder notes

- A `KITTYPET_NAMES` set in `straynames.js` that is a **subset** of the
  existing names, not a new block. `CAT_NAMES` is not touched (its
  length drives the seeded shuffle; see the clan spec §6.2 note 2). Add a test
  that every kittypet name passes `isStrayName`.
- Add `'kittypet'` as a third `outsideTag` key in Clan Edition. Legacy keeps
  `'met'`/`'grudge'` exactly.
- The "-paw floor" for a kittypet in the colony is the same display trick
  `colonyRankFor` already uses for fed kits. It is display only, with nothing
  stored (clan spec §8.4).
- A collar is a small child mesh on the stray. Use `castShadow: false`, which
  costs about one draw call per visible kittypet and nothing in the shadow
  pass. Better still, add it to the stray's existing merged body if
  `cat/model.js` allows.

---

## 3. Territories

### The proposed layout

The five clan territories and Twolegplace form **one map of six regions**.
Some share borders and two places belong to more than one clan, as in the
books.

| Territory | Clan | Built from | What makes it read as the place |
|---|---|---|---|
| **Twolegplace** | none (kittypets) | Cozy Neighborhood, unchanged | Houses, gardens and fences: where every walk's cat comes from |
| **The Woods** | ThunderClan | City Park | More trees and ferns at the edges; the pond and clearings stay |
| **The River and Marshes** | RiverClan | Seaside | The sea reads as the lake or river; wet sand reads as marsh; dune grass as reeds; the pier is the crossing |
| **The Pines and Swamp** | ShadowClan | The Old Docks | Dark and lamplit; pines along the west yard; the canal as a swamp ditch; the road edge is the Thunderpath. *The weakest fit of the four; see §6.* |
| **The Moor** | WindClan | **New area** | Open heather and wind, few props, rabbits in the grass |
| **The Gorge** | SkyClan | **New area** | A path between cliff walls, ledges to climb, a river at the bottom |

**Borders and overlaps:**

- **Twolegplace and the Woods** share the **garden fence**, the fence Rusty
  jumped.
- **The Woods and the Pines** are split by the **Thunderpath** (a road).
- **The Woods and the River** share the river. **Sunny Rocks** sits on it,
  and both clans claim it. This is the books' Sunningrocks, the classic
  contested place.
- **The Woods, the Moor and the River** meet at the **Gathering Hollow**, a
  neutral place that belongs to all of them.
- **The Moor and the River** share a **stream**.
- **The Moor and the Gorge** share the **gorge rim**: the moor's edge is the
  top of the gorge.
- **The River and the Pines** share the **marsh edge**.
- The Gorge touches only the Moor. SkyClan lives apart, as in the books.

### Map sketch

```
                                   NORTH
  +--------------------------------------+---------------------------+
  |                                      :                           |
  |              THE MOOR                :        THE GORGE          |
  |              WindClan                :        SkyClan            |
  |              (new map)          gorge rim     (new map)          |
  |                                      :                           |
  +-------- the stream ---------( * )----+---------------------------+
  |                        Gathering     |                           |
  |        THE WOODS        Hollow (all) |    THE RIVER & MARSHES    |
  |        ThunderClan                   |    RiverClan              |
  |        (was City Park)    [SUNNY ROCKS: Woods and River both     |
  |                            claim it]  ~~~~~~ the river ~~~~~~    |
  +=== garden fence ===+== Thunderpath ==+--- marsh edge ------------+
  |                    |                                             |
  |    TWOLEGPLACE     |          THE PINES & SWAMP                  |
  |    kittypets       |          ShadowClan                         |
  |    (was Cozy       |          (was The Old Docks)                |
  |     Neighborhood)  |                                             |
  +--------------------+---------------------------------------------+

  ===  a border you can see (fence, road)    ---  an ordinary shared edge
  :    the gorge rim                         ( * ) and [ ] places that more
                                                   than one clan claims
```

This is a starting point. The fastest way to get it right is to ask her to
draw it (§6, question 5).

### Where the clans live, and what "rival" means

- The clans' home is the **camp** (today's den), wherever their territory is.
- Every territory except the kids' own has its owning clan's patrol near a
  camp at its usual spot. Walking there is trespassing. As today, the only
  cost is being chased back out: funny, recoverable, and nothing lost.
- **In their own territory**, the patrol becomes the *neighbouring* clan
  patrolling the contested spot. If they pick ThunderClan, that is RiverClan
  at Sunny Rocks. Every area keeps exactly one rival, which honours clan-spec
  decision 9.
- Nothing here sets one sibling against the other. They are one clan
  (§6, question 2).

### Three ways to build it, cheapest first

The engine today builds **one area per walk**. Each area is about 80–110 m
across with flat ground and no terrain heights. On the iPhone 18, Cozy
Neighborhood draws about 300 calls a frame and the Docks about 400. Most of
those calls are shadow work (about 73–83%). The phone holds 60 fps in both
(`docs/VISUAL-PASS.md`, Stream 4 readings).

| | **(a) Rename and re-tint, separate maps** | **(b) Separate maps that visibly connect, plus a territory map** ← recommended | **(c) One big continuous world** |
|---|---|---|---|
| **What you get** | New names and colours on the four areas, two new areas. Nothing shows they connect. | (a), plus each map's horizon shows its neighbours, border posts at shared edges, Sunny Rocks and the Gathering Hollow as real places, and a territory map on the home screen to pick from. Later, optionally, walking across a border. | Walk from Twolegplace through the Woods to the Moor without stopping. |
| **iPhone draw calls and memory** | About the same as today. | About +2–4 draws per area, nothing extra in the shadow pass. Horizons are already one mesh per area and only get repainted. | Several regions loaded at once and swapped in as you walk. Near a border, about twice today's draws. Loading a region mid-walk risks a visible stutter. |
| **Co-walks** | Unchanged. | Unchanged. Crossing a border together uses today's "host proposes, both start" flow. | A rebuild. Positions sent between the devices only make sense inside one area, so two kids in different regions need new rules. |
| **The walk loop** | Unchanged. | Unchanged. A walk is still in one territory. | A rebuild. Weather, secrets, quests, goals, races, golden mice, legendary cats, rivals, marks and gifts are all chosen once per area per walk (about 25 source files key on the area id). |
| **Corner map (being built now)** | Unchanged. | Unchanged. Later it can label shared edges ("Moor ↑"). The home-screen territory map reuses its 2D drawing. | Its design (one area shape, centred on the cat) would need redoing. |
| **Unlocks** | Today's chain plus two new areas. | The same. In Clan Edition the chain tells the book-one story: start as a kittypet in Twolegplace, then into the Woods, and onward. | It needs a new idea of "unlocking part of a continuous world". |
| **Existing content that moves** | None. | None in today's areas. The two new areas need their own landmarks, race points, scenic spots and three golden mice each. | Everything is re-anchored to world coordinates: landmarks, golden mice, races, scenic spots, rival camps, marks, and every colony cat's fixed spot. That last one is shared data both kids depend on. |
| **Effort** | Smallest. | Moderate, in independent steps. | Weeks, with the highest risk to the colony and co-walks. |
| **Risk to the kids' progress** | Low | Low | **Real** |

**Why I recommend (b).** It delivers what she asked for: one world, named
territories, shared borders and contested places. Each map shows where it
sits, and the home-screen map shows the whole. It keeps every walk, colony cat
and co-walk exactly as solid as it is today.

Option (c)'s extra is walking across a border without a pause. The fog closes
in at 40–130 m, so you can't see a neighbouring territory from inside one
anyway. You see about what (b)'s painted horizon shows. (b)'s optional last
step ("cross the border": finish this walk, start the next territory with a
short crossing card) gets most of the feeling for a small fraction of the
cost.

**Why (a) alone falls short.** Five clans need five places, and Twolegplace is
where kittypets live. Even the cheapest honest version needs two new maps, or
it leaves one clan out at first. The Gorge is the natural one to wait
(§6, question 4). Without visible connections, (a) also gives "a park called
the Woods", not one world.

### Builder notes

- **New areas need a server change before colony cats can be fed in them.**
  `docs/supabase-colony.sql` lines 372–401 (the feed function) refuses any
  area outside `('neighborhood','park','seaside','docks')`. Until the owner
  runs a one-line SQL update, strays in the Moor and the Gorge can be greeted
  but not fed into the colony. Ship it that way first; it is safe.
- **Update both devices before anyone walks a new area.** An older build's
  sanitisers keep only the ids they know:
  - `unlocked.areas` (a bought area would vanish, with its points);
  - `state.walks` keys;
  - `MARK_AREAS`;
  - `COLONY_AREAS` (`colony.js` returns `null` for a cat in an unknown
    area).

  The site is one GitHub Pages deploy, so a refresh fixes it. A tab left open
  for a week does not. Consider a version check that holds a stale build back
  from saving.
- New area registration, from the existing comments:
  - a `CATALOG.areas` entry with `price`/`requires`;
  - a `defaultState().walks` key (forgetting it pins walks at NaN forever,
    per `progression.js`);
  - `AREAS` in `game/walk.js`;
  - `MARK_AREAS`, `COLONY_AREAS`, `DISCS`, `RIVAL_PREFIXES`, `GOLD_MICE`
    (`GOLD_TOTAL` goes from 12 to 18; check anything that says "12");
  - the per-area render tables: `render/ambient.js`, `clouds.js`,
    `grass.js`, `pawprints.js`, `rig.js`, `sky.js` and `water.js`;
  - `PLACE_PICTURE` in `homebase.js`;
  - five POIs (the race needs them) and three scenics.
- **No terrain.** Colliders are 2D circles at y = 0, and `builder.js` says
  plainly that displacing the ground is a systems change. So:
  - **The Moor** is flat heather with a rolling-hill horizon band. It is
    cheap, and it suits the iPhone because it has few shadow casters.
  - **The Gorge** is a flat floor between tall cliff-wall colliders, with
    height only through the existing perch and climb system (`climbing.js`).
    Cliffs are big shadow casters, so merge them, and measure on the iPhone
    before calling it done. The Gorge is the riskiest single item in this
    design.
- Horizon bands (`builder.js` around line 1040: one merged mesh per area,
  beyond `bounds`, no collider) are where "you can see the Moor from the
  Woods" lives. That is a repaint, not new geometry.
- Sunny Rocks and the Gathering Hollow are scenics (`scenics` entries) in one
  physical area each. The overview map draws them straddling the border.
- Option (b)'s optional crossing step: end the walk, then start the
  neighbour's walk with a crossing card and a combined summary at the end.
  A co-walk crossing is a host proposal through the existing `lobby.js` flow.
  `areaOverride` already lets a joiner walk an area they haven't unlocked.

---

## 4. The map sketch

See §3, "Map sketch". The table under "Borders and overlaps" lists each shared
edge in words.

---

## 5. Naming and ownership

**What the code does today.**

- Every word borrowed from *Warrior Cats* lives in one file, `src/clanwords.js`
  (clan spec decision 3: "maybe one day public").
- Generated cat names are ordinary nature words, and a deny list of
  **published character names** (Firestar, Bluestar and about 150 more)
  stops any generated name matching one.
- The four rival clans have **invented homage names** (HedgeClan, AlderClan,
  DuneClan, HeronClan), not the books' clans.
- The kids' own clan is minted from a closed list (MossClan and the like), and
  the save only accepts names built from that list.

**What the playtester wants:** the books' exact names, ThunderClan,
WindClan, RiverClan, ShadowClan and SkyClan, plus place names like
Twolegplace, Sunningrocks and Fourtrees.

**Something the owner should know before deciding.** The game's GitHub
repository is **public**, and the game and its "Clan Edition" page are on a
public web address. The page is marked so search engines don't list it, but
anyone with the link can open it. "A private family game" is true of who
plays it, not of who could see it.

**My recommendation, and it is the owner's call:**

- Use the **canonical clan names** in Clan Edition: ThunderClan, WindClan,
  RiverClan, ShadowClan, SkyClan. They are the whole point for her, and they
  are words, not characters.
- Use **light homages for place names**: Sunny Rocks for Sunningrocks, the
  Gathering Hollow for Fourtrees. Keep **Twolegplace** and **Thunderpath** as
  they are, because they are vocabulary, the same way "kittypet" already is.
- **Never use character names.** The deny list stays.
- Keep every canonical word in the one strings file. Then if the game ever
  goes truly public, one commit swaps them back to homages.
- If the owner prefers caution, the fallback is close homages throughout
  (for example ThunderClan → StormClan), at the same cost.

---

## 6. Questions only the playtester or the owner can answer

Ranked by how much the answer changes what gets built.

1. **What is "Legacy Edition"?** Is it (A) today's game exactly, which is
   what I assumed? Or (B) the older plain game, with no clan words at all,
   colony cats by their own names and no rival clans? *(For her, with the
   owner.)*
   - Why it matters: (A) costs nothing and risks nothing. (B) is a second
     words layer across the colony, rivals and toasts.
   - It also decides what the boy sees if Legacy is his preference.
   - The game's title already says "Clan Edition" today, so the word may mean
     something specific to her.
2. **Which clan is theirs, and is it one clan for both kids?** *(For both
   kids.)*
   - Her pick sets their home territory, where the rival patrols go, and the
     clan name on every screen.
   - The clan spec deliberately makes the siblings **one clan**, so there is
     no border between them.
   - If the boy wants a different clan, the choices are:
     - one shared clan anyway (recommended);
     - each kid "comes from" a clan as flavour, sharing one colony;
     - two clans. That reverses a deliberate design call and creates exactly
       the sibling rivalry the anti-goals forbid.
3. **Canonical names or homages?** *(For the owner; see §5.)* This changes
   the strings file and whether the save must accept new clan names. It is
   also a decision about a public repository.
4. **Must the Gorge exist from day one?** *(For her.)* It is the biggest and
   riskiest single build: the engine has no terrain, and cliffs are expensive
   shadow casters on the iPhone. SkyClan arrives late in the books too.
   Launching with four clans plus "the Gorge, coming soon" on the map
   halves the new-area work.
5. **Is the territory map right?** *(For her: ask her to draw it.)*
   - Does the Seaside feel like RiverClan?
   - Do the Docks feel like ShadowClan? That is my weakest match. If it
     feels wrong, ShadowClan becomes a third new area and the Docks stays a
     Twolegplace-side place.
   - Which borders and contested places matter to her?
6. **Which old names are kittypets, and should a kittypet who joins the clan
   keep its old name?** *(For her.)* This sets the list in §2 and the Colony
   card's wording. My default shows both: "Amberpaw, once a kittypet called
   Marmalade".
7. **Should the Moor and the Gorge appear in Legacy Edition too, under plain
   names** (for example "Windy Hills" and "The Canyon")? *(For the owner and
   the boy.)* If yes, both editions get the new places. If no, they are
   Clan-only, but co-walks still work, since a joiner can already walk an
   area they haven't unlocked.
8. **Should the world be able to change for Legacy too?** *(For the owner.)*
   For example, real extra trees in the Park that you bump into. Without that
   permission, Clan Edition's dressing must be decoration you walk through.
9. **Does she want to walk across a border during one walk?** *(For her.)*
   This is option (b)'s optional last step. If she doesn't care, skip it.

---

## 7. Goals, non-goals, anti-goals

### Goals

- A kid who reads the books opens Clan Edition and recognises the territories,
  the clans and the kittypets within a minute.
- One world. You can see where each territory sits and which ones it borders.
- Switching editions is instant, reversible and loses nothing.
- Each kid can play the edition they like, and they can still walk together.
- The iPhone keeps 60 fps in every territory.

### Non-goals

- No continuous open world (option c).
- No new clan mechanics: no battles, no prophecies, no plot.
- No changes to the colony's rules, caps or taming.
- No renaming of any stored cat name.

### Anti-goals (a failure even if it ships)

- **Either kid loses progress**: a cat, points, an unlock, a mark or a walk
  count, from switching, a co-walk across editions, or an un-updated device.
- **The 9-year-old loses to his sister on reflexes.** Nothing here may
  become a sibling contest. Territory is never held *against* each other, and
  rival chases stay recoverable and funny.
- **Anything legible only to book readers.** The Moor must read as "windy
  hills" and a kittypet as "a house cat with a collar" to someone who has
  never opened the books. Every borrowed word sits next to something you can
  see.
- **A clan war between siblings.** They are one clan.
- **Chores**: nothing asks you to patrol or mark a border daily (the clan
  spec's §5 rule carries over).
- **Breaking co-walks.** If two kids on different editions ever see
  different walls, the design has failed.

---

## 8. Suggested build order

Each step ships alone and is useful alone.

0. **Ask** questions 1–5 in §6. Questions 1 and 2 shape step 1. Question 5
   shapes steps 4–6.
1. **The edition switch, words only.**
   - The saved `edition` setting, the toggle on the title and in Settings.
   - Clan Edition's names for the four existing areas, the clans, the camp
     and the HUD words. The clan choice (question 2).
   - Legacy is byte-for-byte today.
   - Test: flipping never changes anything else in the save.
2. **Kittypets.** The name list, the collar in Clan Edition, "the
   kittypet" toasts, and "once a kittypet called…" on the Colony card.
3. **The home-screen territory map** (Clan Edition). Six regions, borders,
   Sunny Rocks and the Gathering Hollow. Tap to walk. The Moor and the Gorge
   are shown under mist as "not yet". Reuse the corner map's 2D drawing once
   that has landed.
4. **Re-dress the Woods, the River and the Pines.**
   - Decoration you walk through, plus repainted horizons showing the
     neighbours.
   - Border posts at the shared edges.
   - Each rival camp relabelled with its clan, and the contested spot in the
     kids' home territory.
   - One area per step if that is easier to review.
5. **The Moor** (WindClan): a new area. Colony feeding stays off there until
   the owner runs the one-line SQL update and both devices are updated.
6. **The Gorge** (SkyClan): a new area. Measure it on the iPhone before
   calling it done.
7. *(Optional)* **Crossing a border**: finish one walk and step into the
   neighbouring territory, solo or together.

Steps 1–3 need no new maps and carry almost no risk. They are probably what
she notices most.

---

## Builder notes: facts checked against the source (main at `70ac310`)

- **The title already reads "Whisker Walk 2: Clan Edition"**:
  - the home screen, in `src/ui/homebase.js` around line 825;
  - the splash, in `index.html` line 53;
  - the separate page `public/clan-edition.html`, which already draws a
    per-area territory map from the world files.
- Area sizes, from the `bounds` in each world file:

  | Area | Size |
  |---|---|
  | Neighborhood | 110 × 110 m |
  | Park | 90 × 102 m |
  | Seaside | 84 × 82 m |
  | Docks | 76 × 80 m |
- **Walks have no timer.** The player ends them (`endWalk`, `game/walk.js`),
  and `completeWalk(areaId)` counts the walk in the area actually walked.
- **Co-walk area choice**: `game/lobby.js` proposals carry `area` and `seed`.
  `override` lets a joiner walk an area they haven't unlocked without saving
  it.
- **The kids' clan name.** At pairing it is the one minted from the
  *smaller* player id (`game/colonysync.js` around line 326, rule R23). The
  clan spec's §6.6 said "the inviter's wins", and the code's comment explains
  why that changed. The save accepts only `PREFIXES` + `Clan`
  (`progression.js`, `ACCEPTED_CLAN_NAMES`), so a canonical clan **pick**
  should be a new additive field, displayed in Clan Edition. Do not overwrite
  `state.clan.name`; Legacy keeps showing it.
- **Colony cats store `area` plus an area-local `x, z` spot** (clamped to
  ±200 m, `colony.js`). Any future world-coordinate scheme must stay a
  derived offset, never a rewrite of stored spots.
- **Family pets** live in `CATALOG.cats` (`progression.js`) and in
  `PERSONALITIES` (`cat/brain.js`): zeetoo, robbie, d2, digit and hagrid.
  Rosa is retired with a refund.
- The clan spec calls the 9-year-old a "sister" in places. He is a boy
  (corrected 2026-10-25).
- The test suite was green when this was written: 134 files, 3283 tests.
