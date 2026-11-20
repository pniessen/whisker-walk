# Found outfits: wander and find something new to wear (design, 2026-11-19)

## Why

The owner asked (2026-11-19): "could the cat find various accessories in the
areas, eg wander and find a new hat". The Rooftops design had just named what
the game is for: "exploring, learning, having fun". Found outfits make
wandering pay on every walk, in every place, and give the children something
new to show each other.

Players: a girl of 11 (she loves Warrior Cats) and a boy of 9, and soon the
public.

## Owner decisions (2026-11-19, from questions with choices)

1. **Surprise finds on walks**, not fixed hiding spots like the golden mice.
2. **Every walk** has a find.
3. **Brand-new, find-only outfits**: never sold in the shop.
4. **Playing together: one find, both get it.** No race, no one left out.
5. **Hand-placed find spots**: 10-15 hiding spots per area in nooks worth
   exploring; each walk picks one.
6. **Four outfits per area** to start.
7. **Gentle help, no arrow** for a find she walks past (2026-11-19): the outfit
   twinkles from about 20 m, a soft chime plays when she is near, and a cat
   with the Twitchy Nose skill smells it like buried treasure. Still no map
   marker, no arrow, no prompt.
8. **Legacy Edition is retired** (2026-11-19, the world-map discussion): two
   versions remain, Clan Edition and the everyday-words version, both with
   every area. So a co-walk never puts a child in a place their version does
   not have.

## Approaches considered (placement)

| | How | Trade-off | |
|---|---|---|---|
| **A** | **Hand-placed spots per area; each walk's seed picks one** | Finds sit in nooks worth exploring; both players' devices agree from the shared seed; a test proves every spot can be reached | **chosen** |
| B | Any walkable point, picked by rule | Nothing to place; finds land in dull or awkward places, hard to test | not chosen |

## What exists today

- **Wearables** are items in `src/progression.js` with a slot (head, face,
  neck, collar, body, back, feet). Models live in `src/cat/` (`hats.js`,
  `glasses.js`, `neck.js`, `backitems.js`, `cape.js`, `drape.js`, ...) and are
  fitted to every cat shape (kitten, slim Siamese, small-eared Persian, the
  family cats, builder cats).
- **Prize items already exist**: 13 items with `prize: true` and price 0 that
  can only be won (visit prizes in `src/visits.js`; Fairground prizes with a
  `fair:` key, `src/fairprizes.js`). Found outfits are a third kind of prize.
- **Golden mice** (`src/goldmice.js`) are the fixed-spot collection: three per
  area, placed by hand, found once.
- **Shared randomness for two players**: a solo walk has its own seed; a
  partner walk uses the room seed, and features that must agree use a salted
  `mulberry32` off it (`src/game/walk.js`, the legendary cat's spot is the
  model). `walkRng` is room-seeded too, but nothing new may draw from it after
  the walk starts, so finds get their own salted stream.
- **Editions**: today the territories are in Clan Edition only
  (`areaInEdition`, `src/edition.js`). With Legacy retired (decision 8) every
  area is in both remaining versions.
- **Changing an outfit mid-walk is new**: nothing does it today. The
  Fairground's prizes are put on the save and wait for the next walk
  ("Your prize is waiting in the dress-up at home"). Wearing it at once means
  rebuilding the local cat in the walk and re-publishing the room profile
  (`rooms.retrackProfile`) so a partner's screen rebuilds her cat; perks read
  once at walk start (the Glow Collar's dusk) stay as they were for that walk.
- **Prizes are rebuilt from durable counters** on every load (`visitPrizesSeen`,
  the journal's game pages; `sanitizeState` in `src/progression.js`), which
  makes them add-only. Found outfits need a durable record of their own (their
  journal entries) for the same reason.
- **The co-walk message carries no height** (`pos` is exactly `[x, z]`).
- **Hagrid** is a playable hen: head, face, neck and collar items only.

## How it plays

- **Every walk in an area with finds has one find**, at one of that area's
  find spots, picked by the walk's seed.
- **The find is an outfit you do not own yet** from that area's four, in a
  fixed order per child (the seed rotates the start so it is not always the
  same first hat). **When a child owns all four of an area's outfits**, that
  area's find is a small coin pouch instead (Claude's call: 5 coins).
- **It is easy to notice (decision 7)**: the outfit sits in its nook (a hat on
  a fence post, a scarf caught on a branch, a necklace in a rock pool) and
  twinkles from about 20 m; a soft chime when she is within about 6 m; with
  Twitchy Nose, standing still near it draws the buried-treasure paw prints to
  it. No marker on the map, no arrow, no prompt.
- **Finding it**: the cat walks up to it (the same pick-up distance as a
  golden mouse). A small celebration card shows the outfit on the cat, with
  **Wear it** (puts it on now, during the walk: new machinery, see "What exists
  today") and **Later**. It goes into the wardrobe for good, and its journal
  entry is the durable record that rebuilds it on load.
- **Never twice in one walk**: one find per walk; once found, that walk has no
  more.
- **Playing together (owner's decision 4)**: both devices show a find at the
  SAME spot (the room seed picks it). Each child's device shows, and gives,
  the outfit that child does not own yet, so the two may see different hats on
  the same post. Whoever reaches it, both children get theirs (each device
  hands its own child's outfit when either cat reaches the spot); a child who
  owns the whole set gets the coin pouch. The partner's arrival is read from
  the existing co-walk position, flat: a partner passing within reach
  sideways counts even if under a perch spot (generous, and it fits "no race";
  Claude's call), so no new message is needed.
- **A partner on an older build (Claude's call)**: the room profile gains a
  small "finds" capability flag; finds are off for the whole walk unless every
  member has it, so one child never gets a find the other cannot see.
- **Not on**: the den (indoors, home) and the guided first walk (it has its
  own script). A walk that began with a border crossing is an ordinary walk
  and has its find. A find never sits within 15 m of the spawn.

## The spots

- 10-15 per area, placed by hand as data in their own file per area (so areas
  can be done in parallel), each `{ id, x, z, y, look }` where `look` says how
  the outfit sits there (on a post, hung on a branch, in grass, in water's
  edge, on a perch).
- Spots are in nooks worth reaching: behind a shed, on a low wall, under a
  bridge, among reeds, on a perch chain step. At least a third reachable
  without climbing; a few up a short perch chain; none needs a skill.
- **Tests**: every spot is reachable from the spawn by the walk's own rules
  (ground, perches); no spot is inside a collider, under water deeper than
  wading, or within 15 m of the spawn; ids are unique; two runs with the same
  seed pick the same spot; solo and partner picks follow the rules above.

## The outfits (a draft list: the owner, and the children, should change it freely)

Four per area, spread over the slots so each place gives a mix. Every one is
new, suits its place and is find-only.

| Area | Outfits |
|---|---|
| Neighborhood | Paperboy Cap (head), Bottle-top Collar (collar), Garden Glove Scarf (neck), Doormat Cape (body) |
| Park | Acorn Cap (head), Daisy Chain (neck), Kite-tail Ribbon (back), Puddle Wellies (feet) |
| Seaside | Sailor's Shell Necklace (neck), Starfish Clip (head), Bucket Hat (head), Beach-towel Cape (body) |
| Docks | Sailor Cap (head), Rope Collar (collar), Fisherman's Jumper (body), Anchor Charm (collar) |
| Farm | Straw Hat (head), Gingham Neckerchief (neck), Feather Plume (head), Hay-bale Backpack (back) |
| Fairground | Striped Boater (head), Candyfloss Puff (back), Ticket-stub Garland (neck), Heart-shaped Glasses (face) |
| Woods | Bird's-nest Hat (head), Moss Mantle (body), Pinecone Charm (collar), Fern Fan (back) |
| River | Lily-pad Hat (head), Reed Scarf (neck), Pebble Collar (collar), Kingfisher Feather (head) |
| Moor | Heather Crown (head), Shepherd's Shawl (body), Peat-stone Charm (collar), Bog-cotton Tufts (face) |
| Pines | Woolly Bobble Hat (head), Pine-sprig Scarf (neck), Snow Goggles (face), Sled Cape (body) |
| Gorge | Climber's Helmet (head), Rope Harness (body), Crystal Charm (collar), Eagle Feather (back) |

(44 outfits. Two heads in one area are fine. The Rooftops gets its four when
it is built. Hagrid the hen wears only the head, face, neck and collar ones;
a find of another slot still counts as found for him, and shows on her other
cats.)

Names go through the word tables, so both word sets read well; none uses a
series word.

## Everything else

- **Saves**: found outfits are owned items like any prize; old saves load
  cleanly with none. Cloud saves carry them as they carry prizes today.
- **Wardrobe**: find-only outfits show in the wardrobe once owned; an unowned
  one shows as a silhouette with "Found in the Woods" (Claude's call: so a
  child knows there is more to find and where), never a price.
- **Journal**: today's journal is one grid of cards plus a golden-mouse
  footer, and the Farm and Fairground already call their journal cards
  "finds". Found outfits get their own section, "Things to wear", with the
  area's four slots shown together (Claude's call on the name, to keep it
  apart from the Farm's and Fairground's finds).
- **Versions**: every area, and so every outfit, is in both remaining
  versions (decision 8).
- **Budget**: one outfit on the ground per walk is tiny; outfits on the cat
  follow the existing per-item triangle rules for wearables.

## Build order

0. **Depends on Legacy's retirement** only for the territory outfits; the
   street areas' finds can ship first.
1. **The machinery with one outfit**: item records (`find: '<area>'`), find
   spots for two areas (Park and Woods), the seeded pick (solo and partner),
   the glint and pick-up, the celebration with Wear it / Later, the coin pouch,
   the wardrobe silhouette, the journal page, tests. One new outfit modelled.
   Pictures and a short recording for the owner.
2. **The outfits**, in parallel by slot file (hats, face, neck and collar,
   body and back, feet), fitted to every cat shape, with picture sheets per
   cat for the owner (and his daughter) to approve.
3. **The spots for every area**, in parallel by area file, with the
   reachability tests.

Each step ends with the full suite green and pictures for the owner. Merge and
push need his yes.

## Constraints

- Deterministic for two players: the spot comes from the room seed (salted,
  own stream), never from `walkRng` or `Math.random`.
- No new network message: arrival is read from the co-walk position; the
  only room change is the capability flag in the profile.
- Offline-first; no database change.
- Text for a 9-year-old; names in the word tables.
- Older iPads: no per-frame allocation for the glint; one extra small mesh per
  walk.

## Goals

- On most walks a child finds something, and wants to show it.
- Both children on a co-walk come away with something.

## Non-goals

- Trading or gifting outfits (later, maybe).
- Fixed hiding spots or a "where is it" map.
- Finds in the den.

## Anti-goals

- A find that cannot be reached, or sits somewhere frustrating.
- One child getting a find and the other not on the same co-walk.
- A race between the two children for a find.
- Finds that feel like a chore (a list to tick off, a prompt nagging).
