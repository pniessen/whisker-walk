# The Market Square: design

Date: 2026-11-20. Status: drafted from the owner's answers on 2026-11-20, waiting for his approval.

## Intent

The Market Square is the third of the street areas the owner picked on 2026-11-18, after the Fairground and the Rooftops. The players are his two children, a girl of 11 who loves Warrior Cats and a boy of 9. Every other place gives them exploring, climbing and finding. This one gives them a cheeky cat's romp. She sneaks treats from busy market stalls, gets shooed with a broom, dashes off, and does it again.

## What the owner decided

- **Mostly treats and sneaking** (2026-11-20): the cat weaves under stalls, snaffles a fish head, naps on warm sacks and dodges a broom.
- **When spotted: a fun shoo and a dash.** A stallholder calls "Oi, you rascal!" and waves a broom, and she dashes off to hide under a stall. There is no penalty. If she grabbed the treat before she was spotted, it's hers.
- **Stallholders stay behind their counters and move in a clear rhythm.** Each stays at their own stall and now and then turns away, and a head turn and a "busy" bubble show when it's safe. A crouched cat is noticed only close up.
- **The playback was right** ("Market Sq sounds good").

## Goals

- A child snaffles her first treat within the first minute.
- A child can always tell when it's safe to go, and when she gets it wrong, the fun doesn't stop.
- Being spotted is funny, never upsetting.
- Two children can team up: one distracts, the other sneaks.

## Non-goals

- No real stealth-game difficulty: no fail screens, no restarts, no losing points.
- No errands or jobs. The Farm already has jobs.
- No shopping with paws. The shop stays where it is.

## Anti-goals (a failure even if it works)

- **Telling off a child.** Shoos are playful: a laugh in the voice, a broom waved in the air. Nobody chases her far or traps her, and the broom never hits her.
- **Unreadable timing.** If a child can't see when a stallholder is about to turn, it's unfair. The tell must show before the turn as well as during it.
- **People in the way.** As at the Fairground, a person never stands where the cat is, never pushes her and never follows her. The stallholders stay behind their counters.
- **A crowded, slow square.** It must stay calm to look at, and stay smooth on an old iPad.

## The square (my proposal, played back and accepted)

A cobbled market square in the town, with striped awnings, crates, baskets and a fountain in the middle.

| Stall | Treat to snaffle |
|---|---|
| **Fishmonger** | a fish head on ice |
| **Baker** | a sausage roll cooling on a rack |
| **Cheese stall** | a nibble of cheddar |
| **Milk cart** | a saucer of cream |
| **Café** (tables and chairs) | crumbs under a table, which are easy and good for a first try |
| **Flower stall, fruit stall** | no treats, but places to hide, and a fruit that rolls if she bumps the crate |

The builder may rename stalls or treats. The names go to the owner and his daughter.

## How a sneak works

- **The rhythm.** Each stallholder repeats a cycle: serving the front, a few seconds of "busy" with the tell showing, then turning away to the back shelf for a few seconds. Each stall has its own timing, so the square never moves in lockstep. A stall with a treat already snaffled waits a little while before laying out a new one.
- **The tell.**
  - Just before the stallholder turns away, a small "busy" bubble appears over their head.
  - While they're turned away, the bubble stays, and their back faces the cat.
  - As they turn back, the bubble goes.
  - The builder chooses the exact look, but it must read at phone size.
- **Noticing.** This reuses the dog's rule (`dogNotices` in `src/dogs.js`).
  - While a stallholder faces front, a walking cat is noticed inside a set distance in front of the counter.
  - A crouched cat is noticed only much closer.
  - While turned away, they notice nothing.
- **The grab.** She walks up to the treat and takes it with the ordinary action button. The treat goes into her mouth the way carrying works today (`src/carry.js`). She then eats it with a little munch somewhere away from the stall.
- **Spotted.** "Oi, you rascal!" (the words go through the word tables), the broom waves over the counter, and the cat does a short automatic hop back. The child keeps control right away. The stall's treat stays out, so she can try again.
  - If she already has the treat, she keeps it, and the shoo is just a laugh.
  - Hiding under a stall or a crate is safe: no one notices a cat under a stall.
- **Pay.** Each treat she eats pays paws through the existing awards (`src/discoveries.js`), with a treats tally for the walk shown where the walk's other counts show. The same treat pays once per walk.

## Two children together

Both see the same stallholders turn at the same moments. The cycles come from the room seed, on their own salted stream, never `walkRng`.

**The distraction:** when one cat sits in front of a stall and looks up (the existing sit), the stallholder turns to coo at her ("Aww, look at you!") and stays turned toward her for a few seconds. That leaves the back of the stall open for the other cat. It is the square's two-player trick, and a solo child can use it too by sitting at one stall while sneaking at the next.

## Also here, like every place

- **Golden mice** (`src/goldmice.js`).
- **Discoveries:** the fountain, pigeons she can scatter, a nap on warm flour sacks by the baker, a street musician, and a ride in a parked bicycle basket. The builder may add one or two in the same spirit.
- **Four found outfits**, with market-flavoured names (for example a little shopping-bag scarf or a market-trader's cap). The owner and his daughter pick the names, following the found-outfits rules.
- **The yarn ball** lies somewhere each walk.
- **Climbing:** onto crates and up onto the awnings. She can rest on top of an awning, where nobody notices her.

## Look and feel

- Morning-busy: striped awnings in warm colours, cobbles, bunting across the square, stacked crates and baskets of produce.
- At dusk the stalls start packing up, lanterns glow, and the treats are still there.
- Sounds: market chatter, a bicycle bell, the fountain and pigeons, all under the existing sound switch.

## Fit with the game

- **World map:** a street place in the town, in `STREET_PLACES` in `src/worldmap.js`. It joins the town by a gateway once world map step 3 lands.
- **Unlock (my proposal, the owner may change it):** 150 🐾 after 2 town explores, through `areaOffer` (`src/areaoffer.js`).
- **Editions:** Clan Edition with both word sets. In the clan words the stallholders are Twolegs, as everywhere. Legacy is being retired.
- **Co-walk:** both children together. Treats, discoveries, golden mice and finds follow the same two-player rules as the other places.
- **Guided tour:** one hint the first time she enters (for example "Wait till they turn around…"). It goes into the queued tour-hints work.

## Constraints

- **Performance:** the street ceiling of 450 meshes, 380 casters and 70,000 triangles (`test/budget.test.js`). Stalls share geometry and one awning and produce atlas. Stallholders reuse the villager figure from `src/critters.js`.
- **Determinism for two players:** stall cycles and treat placement are data or seeded on their own salted streams. `test/fixtures/flat-trace.gameplay.json` doesn't move.
- **Offline-first:** nothing contacts the database.
- **Text** is pitched for a 9-year-old and goes through the word tables for both word sets. No series words go in string literals outside them.
- **Download size:** the main script is near the 900 KB ceiling, so this waits for lazy area loading (F6), or ships as its own lazy chunk.
- **Merge and push** need the owner's yes. Each build step ends with the full suite green and pictures for the owner.

## Build order (my proposal)

1. **The square:** cobbles, stalls, awnings, crates, fountain, bunting, day and dusk, budget, card picture, and a test page. Pictures for the owner.
2. **The sneak:** stallholders behind their counters, the rhythm and tell, noticing, the grab and munch, the shoo and dash, the distraction, the treats tally and pay. Also a film for the owner, who approves the feel.
3. **The rest:** golden mice, discoveries (pigeons, sacks, musician, bicycle basket), the yarn ball, climbing routes, and found-outfit spots.
4. **Into the game:** the world-map place, the unlock, the gateway (after map step 3), the tour hint, and both word sets.

It is built after the Old House, and after lazy area loading makes room in the download (the owner's queue).

## Left to the builder

- The exact layout of the square and the stalls.
- The tell's look and the cycle timings, within the rules above.
- How the munch and the broom look.
- The extra discoveries.

## Approaches considered

1. **Stallholders behind their counters with a clear rhythm.** This is the chosen approach. It is easy for a 9-year-old to read, cheap to draw and fair. It reuses the villager figure and the dog's noticing rule, and it gives two players a natural distraction trick.
2. **Stallholders walking about between the stalls.** Livelier, but much harder to read, it brings people to cat height (which the Fairground's rules avoid), and it costs more triangles.
3. **Sight cones drawn on the ground.** Very clear, but it feels like a stealth test rather than a cheeky romp, and it looks out of place in a cozy market.
