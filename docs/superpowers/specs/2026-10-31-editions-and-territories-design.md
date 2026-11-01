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
   db `layouts/current`, version 22), on a 1000 × 700 board with north up.
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
8. **The lake and the island** (owner, 2026-10-31):
   - There is a **lake in the middle, where the four territories meet**: the
     Pines and Swamp, the Moor, the Woods, and the River and Marshes.
   - The lake has an **island, and the meeting place (★) is on the island.**
   - The river she drew, which nearly circles the ★, reads as this lake's
     shore and the streams feeding it. Each of the four territories has a
     stretch of lakeshore.
   - Builder:
     - The island is the shared, peaceful ground where cats from any clan
       meet. It's the natural spot for both kids' clans to gather together,
       which keeps them allies (decision 2).
     - The island is walkable, reached by a bridge (see below).
   - She drew both on her map (version 22):
     - the lake is a large outline around the middle (board x ≈ 400–520,
       y ≈ 205–425);
     - the island is a smaller land outline around the ★.
   - **Paths out of Twolegplace** (owner, version 22): Twolegplace has three
     paths, **to the Moor, the Woods, and the River and Marshes**:
     - north up to the Moor;
     - the short path into the Woods;
     - a long one west along the south edge, through the bottom of the
       Woods, to the River and Marshes.
     - These are the kittypets' routes into clan land, and the walking
       routes between Twolegplace and its neighbours.
     - None goes to the Pines and Swamp, so it stays the most out-of-the-way
       territory, the furthest from the Twolegs.
   - **A bridge goes to the island** (owner, 2026-10-31), so the island is a
     real place you walk to, not just a mark on the map.
     - It's a small map of its own.
     - The bridge is a deck over the lake, the same way the Seaside pier and
       the Docks bridges are decks over water today, so it needs no swimming.
     - **One shared bridge, from the Pines and Swamp's shore** (owner,
       2026-10-31), on the north-west side of the lake.
     - Cats from every other clan reach the island through Pines land. The
       way there is under a truce, as for a Gathering in the books: crossing
       Pines territory on the way to the island never starts a border scuffle
       or costs a kid anything. This matters because each kid may be in a
       different clan (decision 2).
   - **A small pond where the River and Marshes meet the Woods** (owner,
     2026-10-31): the loop in her river.
     - It sits on the border, so it belongs to both territories.
     - It's a good spot for fishing or drinking.
9. **Saves start on Clan Edition, and "Twolegplace" stays** (owner,
    2026-10-31).
    - Both kids already play with the clan features on, so existing and new
      saves start on Clan Edition, and Legacy is one tap away.
    - "Twolegplace" is kept as the place name. It is the one exception to
      the homage rule; changing it later is a one-line edit.
10. **What the Gorge looks like** (owner, 2026-10-31): rocks, dens dug into
   the cliff walls, and tall pine trees. It is still a later release.
   - Dens in the cliff walls make it the place where climbing and height
     matter most. That is why it waits until the game can do height
     (cliffs, ledges, perches you climb up to).
   - The cliff dens are natural spots to explore, hide in and nap in.

**Done (2026-10-31):** §3, §4 and §8 are rewritten around her drawing, and
text the decisions contradict is removed or marked *stale*. The first
implementation plan, the edition switch plus the Woods, is
`docs/superpowers/plans/2026-10-31-clan-edition-woods.md`.

---

## The short version

*Updated 2026-10-31 for decisions 1–9.*

- **One save, two editions.** Both editions read the same save: the same
  points, cats, colony and unlocks. Flip the edition any time on the home
  screen and flip it back, and nothing is lost.
- **Legacy Edition is the older plain game** (decision 1): no clan names, no
  rival clans, no clan words. The clan layer is hidden, not deleted, and comes
  back when the kid flips to Clan Edition.
- **Clan Edition is a new world** of all-new maps, laid out the way she drew
  it (§3): the Woods, the Moor, the River and Marshes, and the Pines and Swamp
  around a lake, with a walkable island in the middle and the Gorge to come
  later. Twolegplace is the Cozy Neighborhood, shared by both editions.
- **Each kid picks their own clan**, and the two kids' clans are always
  allies (decision 2).
- **Kittypets** are some of the old stray cats. They live in Twolegplace and
  now and then wander into a territory, where a kid can befriend them and
  bring them home, the way Rusty came to the clan (§2, §3).
- **The maps stay separate.** Each one shows its neighbours on the horizon,
  shared features line up across borders, and a territory map on the home
  screen shows the whole world. One continuous world stays rejected.
- **First step:** the edition switch, the territory map and the Woods (§8).

---

## 1. What each edition is

*Updated 2026-10-31: decisions 1 and 5 changed what Legacy is and made the
territories new maps. Text they contradict is rewritten or marked stale.*

### What the two editions share (everything that matters)

| Thing | Shared? | Notes |
|---|---|---|
| The save file | **Shared, one save** | The edition is one extra setting inside it. |
| Points, lifetime points, rank | Shared | One number. |
| Unlocked cats, accessories, areas | Shared | Buying in either edition buys it for both. |
| The colony (both kids' cats), feeds, taming | Shared | The same cats with the same progress. |
| Marks, walk counts, golden mice, gifts, skills, streak, visits, journal, den furniture | Shared | Stored per area id. The old four areas keep their ids; each new territory has its own id, so its walk counts, marks, golden mice, races and scenics start fresh (decision 5). |
| Your own cat and its name | Shared | The pet name (including a chosen `-star` name) is the same in both. |
| Each stray's real stored name | Shared | It never changes. Names on screen are a display layer, as the clan spec already does it. |

### What differs

| Thing | Legacy Edition | Clan Edition |
|---|---|---|
| Title | "Whisker Walk 2" + *Legacy Edition* | "Whisker Walk 2" + *Clan Edition* (the title already says this today) |
| Choosing where to walk | Today's list of area cards: Cozy Neighborhood, City Park, Seaside, The Old Docks | A territory map: tap a territory to walk there. Below it, "Other places" lists the Park, Seaside and Docks. |
| Places | The four areas, exactly as today | Twolegplace (the Neighborhood) and the new territory maps (§3) |
| Clan names, roles and ranks | Hidden: colony cats show by their own names | Shown, as today |
| Rival clans and their patrols | None | As today in the old areas. In the new territories, after the clan-pick step (§3). |
| Your clan | Hidden (still stored) | The clan each kid picks (decision 2) |
| Some strays | "Marmalade" (the older wording, no "loner") | "Marmalade the kittypet", wearing a collar (kittypets step) |
| The den | "Den" | "Camp" (words only, later) |

### The rule that keeps both kids safe

> **The edition never changes what a kid owns. An area is built the same
> way in both editions, so what you bump into, what spawns where, and
> anything sent between the two devices never depend on the edition.**

The edition changes three things only: the words, which places the home
screen offers, and whether this device runs the rival patrol (which is local
already). Good things follow:

- **Switching can never lose anything.** Nothing is converted or deleted.
  Clan progress stays in the save in Legacy, and Legacy's areas and unlocks
  stay owned in Clan Edition.
- ~~*Stale (decision 5):* each Clan territory *is* one of today's areas
  underneath, so progress maps across exactly.~~ The territories are new
  maps, so their progress starts fresh; everything a kid owns is shared (§3,
  "Unlocking territories").
- **Co-walks across editions just work.** If she is on Clan Edition and he is
  on Legacy, they walk the same world. He sees his edition's words, she sees
  hers. The rival patrol is worked out locally on each device with nothing
  sent between them, so a Legacy kid simply sees none. If she hosts a walk in
  the Woods, he can join it on Legacy, the same way a joiner can already walk
  an area they haven't unlocked.
- **The switch can be flipped any time from the home screen, but not during
  a walk.** A walk's world is built when it starts, so the new edition shows
  from the next walk.

### Where the switch lives

- **On the home screen title**: tap "Clan Edition" to switch. The same
  choice also sits in Settings, in plain words.
- **It is saved with the kid's save, not the device.** Cloud sync then carries
  it with her, the same way the corner map's north-up choice is designed to.
- **Existing saves start on Clan Edition.** *(Changed 2026-10-31.)* The
  draft said Legacy, back when Legacy meant "today's game". Decision 1 made
  Legacy the plain game, so starting there would hide the clan names, roles
  and rivals both kids see today. Starting on Clan Edition keeps what they
  see; Legacy is one tap away. A brand-new save starts on Clan Edition too.
  *(Owner to confirm.)*

### Builder notes (skip if you're not building it)

- Add `edition: 'legacy' | 'canon'` to `progression.js` state as an additive,
  sanitised field defaulting to `'canon'` (shown as "Clan Edition"; the id
  isn't `'clan'` because the borrowed-word scan flags that word in any
  `src/` string). `SAVE_VERSION` stays 4. Older
  builds drop the unknown field on save, so the kid quietly comes back on
  Clan Edition, which is harmless.
- **Test the invariant directly.** For any save, flipping the edition there
  and back leaves the state deep-equal apart from `edition`.
- All edition-dependent *words* go through `clanwords.js` (clan spec §6.8 and
  decision 3). Use a second data-only file beside it if that is tidier
  (`clancanon.js`, say). Keep the structural scan test covering it.
- **An area builds the same in both editions.** Nothing in a world file reads
  the edition: no collider, perch, POI or spawn may depend on it.
- **Legacy writes no clan field during a walk**: no rival border marks, no
  contested marks, and no role settling from a feed. Role settling still runs
  at sync time in both editions, because it is shared colony bookkeeping that
  keeps the two devices agreeing.
- The rival patrol (`rivalcats.js`) uses the shared wall clock and sends
  nothing over the network; the chase moves only the local cat. That is why
  its clan name and presence may vary by edition. Disc **positions** should
  not vary by edition, though, because `markcontest.js` and `marks.js` read
  them. Keep `DISCS` as it is and change only the clan each disc belongs to.
- The old four areas keep their ids (`neighborhood`, `park`, `seaside`,
  `docks`). New territories get new ids (§3, builder notes). Twolegplace is
  the `neighborhood` id under a Clan Edition name.

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
   Decision 6 adds the occasional **wanderer** into a territory: how often,
   how it is chosen, and why it never counts against a kid are in §3,
   "Twolegplace, and kittypets who wander". The ordinary stray cast is not
   changed, because changing who spawns where would make co-walks drift
   apart.
5. **They can be befriended, as today**: greet, friend, best friend.
6. **They can join the clan, as today.** This is the book-one moment. A
   kittypet who joins gets a clan name on the Colony card, with the old name
   kept underneath: ***Amberpaw*: once a kittypet called Marmalade.** A
   grown kittypet is never shown as a "-kit"; it starts at "-paw", as Rusty
   did. *(Stale, 2026-10-31: the owner dropped the old-name line and the
   -paw start. A kittypet that joins just takes its clan name, like any
   colony cat; see §8 step 3.)*
7. **The family cats are always kittypets and always keep their names.**
   Robbie, D2, Digit, Zeetoo and Hagrid are the kids' real house cats. In Clan
   Edition the home screen can say *"Robbie, a kittypet who walks with
   ThunderClan"* (with her chosen homage name in place of the books' one,
   per decision 3). The shop doesn't change.

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

*Rewritten 2026-10-31 around her drawing (decision 7, version 22) and
decisions 4–9. The earlier draft re-dressed today's areas as territories and
compared three ways of building that; decision 5 overturned it, so it is gone.
Every territory below is a **new map**.*

### The world at a glance

Six places sit around one lake. Twolegplace (the Cozy Neighborhood) is in the
south-east corner. The four clan territories of the first release each touch
the lake. The island in the lake is shared ground. The Gorge waits to the
east, for later.

| Place | Whose | What it is like | It borders | Its side of the lake |
|---|---|---|---|---|
| **Twolegplace** | Nobody's: the kittypets live here | The Cozy Neighborhood, exactly as it is, in both editions: houses, gardens, fences | The Woods (west, over the garden fence). Its paths also reach the Moor and the River and Marshes. The Gorge nearly touches it. | None |
| **The Woods** | The storm clan | Oak wood with ferns, bramble thickets and sunny clearings. Warm and sheltered; the middle of everything. | Twolegplace (east), the Moor (north), the River and Marshes (west, sharing the pond) | The south-east side, which is the Woods' own north-west corner. The river runs along this shore. |
| **The Moor** | The wind clan | Open heather on rolling hills, few trees, rabbits, and wind. The river crosses it. | The Pines and Swamp (west), the Woods (south). The north path from Twolegplace arrives on its east side. | The north-east side, where the river runs into the lake |
| **The River and Marshes** | The river clan | Reedbeds and wet meadow, the river coming in from the far west, good fishing, the pond | The Pines and Swamp (north; they overlap a little), the Woods (east, sharing the pond). The long path from Twolegplace arrives on its east side, by the Woods, at z 40 in line with the Woods' own long path (the owner's choice, 2026-10-31; this table first said south). | The south-west side |
| **The Pines and Swamp** | The shadow clan | Dark pine stands and a boggy swamp. No Twolegplace path reaches it: it is the furthest place from the Twolegs. | The Moor (east), the River and Marshes (south) | The north-west side, where the bridge to the island starts |
| **The island** | Nobody's: everyone's meeting place | A small grassy island with the ★ meeting place on it | Only the lake. One bridge reaches it. | All of it |
| **The Gorge** *(later)* | The sky clan | Rocks, dens dug into the cliff walls, tall pines (decision 9) | Nearly touches Twolegplace. The north path runs past its west side. | None |

The clan names above are placeholders. The real ones are homages that she
chooses from a short list (decision 3), in a later step.

### Water: the river, the pond, the lake and the island

- **The river** is one long river:
  - it comes in from the far west and runs through the River and Marshes;
  - it feeds **the pond**, which sits on the border between the River and
    Marshes and the Woods;
  - from the pond it runs east through the north of the Woods, along the
    lake's south shore;
  - it turns north up the side where the Woods meets the Moor;
  - then it runs west across the Moor and pours into the lake from the
    north, close to the Pines border.

  So it nearly rings the lake.
- **The pond** is small and belongs to both the River and Marshes and the
  Woods. It is a good place to fish or drink.
- **The lake** is in the middle, where four territories meet: the Pines and
  Swamp, the Moor, the Woods, and the River and Marshes. Each of them has its
  own stretch of shore, as listed in the table.
- **The island** is in the lake, with the ★ meeting place on it. It is a real
  place you can walk to:
  - **one bridge** reaches it, from the Pines and Swamp's shore on the
    north-west side of the lake;
  - the way there is under **a truce**, like a Gathering in the books.
    Crossing Pines land to reach the bridge never starts a chase or costs
    anything, and nothing on the island does either. This matters because the
    two kids may be in different clans (decision 2).
- **Water stops a cat in the game** (it has since v19; the Sea Legs ability
  lets a cat paddle). So wherever the river cuts a territory in two, the map
  gives it crossings: a fallen log, stepping stones, a plank bridge. Nothing a
  kid needs to reach is ever cut off by water. Sea Legs is a shortcut, never a
  key, the same rule the Docks follows today.

### The three paths out of Twolegplace

Twolegplace has three paths. They are the kittypets' ways into clan land, and
the walking routes between Twolegplace and its neighbours.

- **The short path** goes north-west, through a gap in the garden fence, into
  the Woods.
- **The north path** goes up between the Woods and the Gorge to the Moor.
- **The long path** goes west along the south edge, through the bottom of the
  Woods, to the River and Marshes.

None goes to the Pines and Swamp. In each map, a path meets the map's edge on
the side that faces Twolegplace, so the paths line up across maps.

### Twolegplace, and kittypets who wander

- **Twolegplace is the Cozy Neighborhood**, unchanged, and shared by both
  editions (decision 6). Clan Edition calls it Twolegplace; Legacy calls it
  the Cozy Neighborhood. It is the one place where the two editions' worlds
  meet.
- **Kittypets live there, and sometimes wander into a territory.** The plan
  for how often:
  - on about **one territory walk in five**, one kittypet turns up in that
    territory, near where a Twolegplace path comes in;
  - never more than one per walk, and never in Twolegplace itself, since they
    live there;
  - which kittypet, and whether one comes at all, depends only on **today's
    date and the territory**. So both devices in a co-walk see the same
    wanderer, whatever edition each kid is on.
  - A wanderer is an ordinary stray under today's rules: a kid can greet it,
    befriend it, feed it and bring it home, the way Rusty came to the clan.
    It never chases, is never chased, and **never counts against anyone**.
- *Builder:* the roll is seeded from `seedFromCode(date + '-wander-' +
  areaId)`, never `walkRng`, and adds nothing on the wire (decision 6). It
  belongs to the kittypets step, not to any territory's map.

### How separate maps share borders

Each territory is its own map, about 100 m across, and a walk happens in one
of them. Three things make them read as one world:

1. **Matching edges.** Each map's edge looks like the neighbour on the other
   side of it, and a feature on a border appears on both maps in the same
   place:
   - the pond sits on the Woods' west edge, and will sit on the River and
     Marshes' east edge;
   - the river leaves the Woods through its north edge, east of the middle,
     and enters the Moor at its south;
   - each territory's lakeshore faces the lake's middle;
   - each Twolegplace path meets the edge facing Twolegplace.
2. **Neighbours on the horizon.** Past each edge, the horizon shows the
   neighbour. From the Woods, for example:
   - heather hills to the north (the Moor);
   - flat reedbeds to the west (the River and Marshes);
   - rooftops over the garden fence to the east (Twolegplace);
   - the lake opening out to the north-west, with the island and its big
     tree out on the water.

   This is painted scenery with nothing to bump into, so it costs one or two
   draw calls.
3. **Border crossings.** Where a path or the river meets the edge of a map, a
   border post stands. Walking up to it asks "Head to the Moor?":
   - **yes** ends this walk the normal way, with its summary and points, and
     opens the home-screen territory map with the Moor picked, ready to
     start;
   - a neighbour that isn't built yet says "The Moor: not explored yet";
   - the post on the Twolegplace side goes back to Twolegplace the same way.

**What I recommend.** Build matching edges and horizons with every territory,
from the first one. Add border crossings as their own small step once two
neighbouring territories exist, going through the home-screen map as above.
Why:

- Every walk system (the race, golden mice, weather, strays, quests, the
  co-walk seed) is chosen once per map per walk. Going through the home
  screen keeps all of it exactly as solid as today.
- It cannot break a co-walk: a walk ends for both, and the next one is
  started together through today's "host proposes, both start" flow.
- The fog closes in at 40–130 m, so even a continuous world would show about
  what the horizon shows.

A **direct crossing** (step over the border and the next territory starts
straight away, with a short crossing card) can come later if she wants it.

**One big continuous world stays rejected.** It means weeks of engine work,
loading regions mid-walk on the iPhone, and re-anchoring every colony cat's
stored spot, and it puts the kids' progress at real risk for a view the fog
would mostly hide.

### Unlocking territories

- Progress in a territory starts fresh, because it is a new map with its own
  area id. Everything a kid owns (points, cats, colony, accessories) is
  shared, as always.
- **Each territory opens for free after two walks in a neighbour**, following
  the story of book one: start as a kittypet in Twolegplace, then into the
  Woods, then onward.

  | Territory | Opens after |
  |---|---|
  | The Woods | 2 walks in Twolegplace |
  | The River and Marshes | 2 walks in the Woods |
  | The Moor | 2 walks in the Woods |
  | The Pines and Swamp | 2 walks in the River and Marshes |
  | The island | 1 walk in the Pines and Swamp (its bridge is there) |
  | The Gorge (later) | to be decided with it |

- **Free on purpose.** A device that hasn't updated yet can drop an unlock it
  doesn't understand. A free unlock that drops comes straight back, and no
  points are lost with it.
- **Nothing is taken away.** Legacy's areas and unlocks are untouched. In Clan
  Edition, the City Park, the Seaside and the Old Docks are still there,
  listed under the territory map as "Other places". A kid never has to switch
  editions to reach an area they already own.

### Where the clans live *(waits for the clan-pick step)*

- Each kid picks a clan (decision 2), and the two kids' clans are always
  allies. A territory's computer-run patrol is its own clan's, or a
  neighbouring clan's when a kid picked that territory's clan ("your clan's
  home").
- That needs the clan pick and the homage names first. **Until then, a new
  territory has no rival patrol.** The truce on the way to the island holds
  from the day the island exists.

### Builder notes (skip if you're not building it)

- **Area ids, fixed now:** `woods`, `moor`, `river`, `pines`, `island`,
  `gorge`. Twolegplace stays `neighborhood`. The Park, Seaside and Docks keep
  their ids and are not territories.
- **The colony server** accepts only the four old area ids
  (`docs/supabase-colony.sql`, `colony_feed`, line 384). Add all six new ids
  in **one** owner edit before the first territory ships its colony feeding.
  Accepting an id no map uses yet is harmless, and it saves the owner a SQL
  step per territory. The exact line is in the Woods plan.
- **Update both devices before anyone walks a new territory.** A build that
  doesn't know an area id drops it from:
  - `unlocked.areas`;
  - `state.walks`;
  - `MARK_AREAS`;
  - `COLONY_AREAS`: `sanitizeCat` returns `null` for an unknown area, so an
    old build drops even a **tamed** colony cat from a new territory.

  The co-walk lobby already ignores a proposal for an area it doesn't know,
  so a stale joiner simply doesn't start. The Woods plan makes the colony
  sanitiser keep a cat in any well-formed area id it doesn't know, so from
  then on a stale build can't drop a colony cat this way.
- **Registering a new area** touches:
  - `CATALOG.areas` (with `edition: 'canon'`, `price: 0` and `requires`);
  - `defaultState().walks` (forgetting it pins walks at NaN forever);
  - `AREAS` in `game/walk.js`;
  - `MARK_AREAS`, `COLONY_AREAS`, `GOLD_MICE` (`GOLD_TOTAL` goes up by three);
  - `CLOUD_AREAS`, `GRASS_STYLES`, the pawprint `AREA_RULES`, `ambientKind`
    and the audio ambience;
  - a picture at `public/places/<id>.jpg`;
  - the cross-area tests: `budget`, `water`, `climbing`, `spots`, `minimap`.
- **Each map needs:** flat ground of about 100 × 100 m; eight or more POIs
  (the daily race picks five); five collectibles; three golden mice (two up
  perch chains, one hidden at ground level); three scenics; perches with at
  least one vantage; water footprints with dry decks wherever the cat must
  cross; and a horizon band painted for its neighbours.
- **Budget.** No map may cost more than the Cozy Neighborhood, the area the
  iPhone 18 was measured holding 60 fps in (`docs/VISUAL-PASS.md`, Stream 4).
  In `test/budget.test.js` terms that is at most 450 meshes and 380 casters
  as built, and 260 meshes and 205 casters merged. Check each map on the
  iPhone before calling it done.
- **No terrain.** Colliders are circles at y = 0, and ground is flat
  (`builder.js`). The Moor's hills live in its horizon. The Gorge waits until
  the game can do height (decision 9).
- **Horizons** use `builder.horizonBand`. A band that faces two kinds of
  neighbour needs one small addition: rooftops on one side only (Twolegplace
  seen from the Woods). The Woods plan adds it.
- **The island and the bridge.** The bridge is a deck over the lake, like the
  Seaside pier, so it needs no swimming. Its map is small. It is built after
  the Pines and Swamp, whose shore the bridge starts from.

---

## 4. The map sketch

Redrawn from her map (version 22, north up). Sizes are rough; what touches
what is exact.

```
                                   NORTH
 +--------------------------+   +-------------------------------+
 |   THE PINES AND SWAMP    |   |           THE MOOR            |       :
 |   dark pines and swamp,  |   |   open heather, wind, rabbits |       : the
 |   furthest from Twolegs  |   |                               |       : north
 |                          |   |    ~~~~~~~~~~~~~~~~~~~~~~~~   |       : path
 |                  +-------+---+-~~~+                     ~    |       :
 |   bridge  =======|==> (*) island  |   the river crosses ~    |       :
 |                  |    THE LAKE    |   the Moor and runs ~    |       :
 +------------------+                +---into the lake ----~----+       :
 +------------------+                +---------------------~----+       :  +---------+
 |                  +------+---+-----+                     ~    |       :  |  GORGE  |
~~~~~~~~~~~~~~~~~~~~~~~~~~(o)~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    |       :  | (later) |
 | THE RIVER AND MARSHES   | pond        THE WOODS              |       :  +---------+
 | reeds, wet meadow       |             oaks, ferns, clearings |       :
 |                         |                     ...............|.short.:......
 |                         |                                    | TWOLEGPLACE  |
 +.........................+....................................+ (the Cozy    |
   <... the long path runs west along the south edge ..........   Neighborhood, |
                                                                | both games)  |
                                                                +--------------+

  ~~~   water: the river (in from the far west), the lake, and the pond (o)
  ...   the three paths out of Twolegplace: short into the Woods, long along
        the south edge to the River and Marshes, and north to the Moor
  ===>  the one bridge to the island, from the Pines and Swamp's shore
  (*)   the meeting place on the island: shared ground, under a truce
```

**What touches what:**

- the Pines and Swamp and the Moor;
- the Pines and Swamp and the River and Marshes (they overlap a little);
- the River and Marshes and the Woods, at the pond;
- the Woods and the Moor, along the river;
- the Woods and Twolegplace, at the garden fence;
- all four clan territories and the lake;
- Twolegplace and the Gorge, nearly. The Gorge's side of the map stays an
  "unexplored" edge until it is built.

**Builder: her drawing in numbers** (1000 × 700 board, north up; territories
are circles):

| Place | Centre (x, y) | Radius |
|---|---|---|
| Twolegplace | 843, 566 | 110 |
| The Woods | 565, 500 | 170 |
| The Moor | 620, 161 | 165 |
| The Gorge | 815, 353 | 80 |
| The Pines and Swamp | 308, 199 | 150 |
| The River and Marshes | 232, 488 | 160 |
| ★ meeting place | 455, 314 | (on the island) |
| The lake | x 397–522, y 207–426 | (her outline) |
| The island | x 437–485, y 289–329 | (her outline) |

The home-screen territory map draws straight from this layout, kept as data
in the game (`src/territories.js` in the Woods plan).

---

## 5. Naming and ownership

*Settled by decision 3 (2026-10-31): close homages, not the books' exact
names, with a short list per clan for her to choose from. The recommendation
at the end of this section (canonical clan names) is **stale**. The facts
about the code and the public repository still hold.*

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

*Status 2026-10-31.* Answered by the owner's decisions: 1 (decision 1),
2 (decision 2), 3 (decision 3), 4 (decision 4), 5 (decisions 5, 7 and 8:
all-new maps from her drawing, so the "does the Docks feel like ShadowClan"
part no longer applies), and 8 (moot: Clan Edition's territories are new
maps, so Legacy's world never changes). Still open: 6 (the kittypet list),
7 (should Legacy get the new maps under plain names; the Woods plan keeps
them Clan-only, and a Legacy kid can still join a co-walk there) and 9 (a
direct crossing; §3 recommends crossings through the home-screen map first).
The original questions follow unchanged.

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

- No continuous open world (§3, "How separate maps share borders").
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
- **A clan war between siblings.** Each kid may pick a different clan
  (decision 2), so the two kids' clans are always allies: nothing scores one
  against the other, and patrols come only from the computer-run clans.
- **Chores**: nothing asks you to patrol or mark a border daily (the clan
  spec's §5 rule carries over).
- **Breaking co-walks.** If two kids on different editions ever see
  different walls, the design has failed.

---

## 8. Suggested build order

*Rewritten 2026-10-31 for decisions 1–9. Each step ships alone, and each one
leaves the kids something to play.*

**The first release** is Twolegplace (the Neighborhood, which already
exists), the Woods, the River and Marshes, the Moor, the Pines and Swamp, and
the island. **The Gorge comes later** (decision 4).

1. **The edition switch, the territory map, and the Woods.** Plan:
   `docs/superpowers/plans/2026-10-31-clan-edition-woods.md`.
   - The saved edition, a switch in Settings and on the title, and Legacy
     quietly hiding the clan layer (decision 1).
   - The home-screen territory map in Clan Edition, drawn from her layout,
     with the territories not built yet shown as "coming soon" and the
     Gorge's edge as "unexplored".
   - The Woods as a new map: paths, the pond, its stretch of lakeshore, the
     river with its crossings, POIs, collectibles, golden mice, the race,
     scenics, perches, undergrowth, a horizon showing its neighbours, and the
     corner map.
   - Colony feeding in the Woods turns on only after the owner's one SQL edit,
     which also covers every later territory.
2. **Clans: her pick of names, and each kid's clan.**
   - A short list of homage names per clan for her to choose from
     (decision 3).
   - Each kid picks a clan; the two kids' clans are always allies
     (decision 2).
   - Each territory gets its clan's patrol at a camp, following the "your
     clan's home" rule.
3. **Kittypets.** The kittypet names, collars in Clan Edition, "the
   kittypet" wording, "once a kittypet called…" on the Colony card (§2), and
   the occasional wanderer into a territory (§3).
   - *2026-10-31: the owner dropped "once a kittypet called…".* A kittypet
     that joins just takes its clan name, ranks like any other colony cat (no
     special -paw start), and the Colony card is unchanged. Plan:
     `docs/superpowers/plans/2026-10-31-clan-edition-kittypets.md`.
4. **The River and Marshes.** The pond on its east edge matches the Woods'.
5. **The Moor.** The river crosses it into the lake; the north path from
   Twolegplace arrives on its east side.
6. **Border crossings.** Border posts on the paths and the river, through the
   home-screen map (§3). Worth doing once the Woods has two built neighbours.
7. **The Pines and Swamp.** The bridge's shore. The truce path to the bridge
   is built here.
8. **The island.** A small map of its own, reached by the bridge, with the ★
   meeting place. It is where both kids' clans gather together.
9. *(Later)* **The Gorge**, once the game can do height. Measure it on the
   iPhone before calling it done.
10. *(Optional)* **Direct crossings**: step over a border and the next
    territory starts straight away.

Steps 2 and 3 need no new maps and can move earlier or later around steps
4–8. Each new map is held to the Cozy Neighborhood's budget and checked on the
iPhone (§3, builder notes).

---

## Builder notes: facts checked against the source (main at `70ac310`)

*Re-checked 2026-10-31 at main `fb6ba0f` (corner map, camera zoom, paw
prints, clouds and ambient life merged). Still true, plus:*

- `colony_feed` in `docs/supabase-colony.sql` line 384 is the only server
  check on area ids; the `colony_cats.area` column is plain text.
- `sanitizeCat` in `src/colony.js` returns `null` for an area outside
  `COLONY_AREAS`, tamed or not (see §3 builder notes).
- `game/lobby.js` ignores a walk proposal for an area missing from
  `CATALOG.areas`, so a stale joiner doesn't start rather than crashing.
- `state.golden` is checked by id shape (`gm-<word>-<n>`), not against the
  known list, so golden mice found in a new territory survive an old build.
- The corner map (`src/ui/minimap.js`) builds from `areaData` alone, so a new
  map gets it for free.
- The test suite at `fb6ba0f`: 139 files, 3366 tests, all passing.

*As first checked at `70ac310`:*

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
  `state.clan.name`; it stays stored, hidden in Legacy (decision 1).
- **Colony cats store `area` plus an area-local `x, z` spot** (clamped to
  ±200 m, `colony.js`). Any future world-coordinate scheme must stay a
  derived offset, never a rewrite of stored spots.
- **Family pets** live in `CATALOG.cats` (`progression.js`) and in
  `PERSONALITIES` (`cat/brain.js`): zeetoo, robbie, d2, digit and hagrid.
  Rosa is retired with a refund.
- The clan spec calls the 9-year-old a "sister" in places. He is a boy
  (corrected 2026-10-25).
- The test suite was green when this was written: 134 files, 3283 tests.
