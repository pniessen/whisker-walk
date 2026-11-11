# Clan life in the territories: design

*2026-10-31. Comes from the playtester's notes, relayed by the
owner and answered by them in chat. Clan Edition only.*

## Why

The territories look like Warrior Cats territories, but nothing in them feels
like a clan lives there. The cats you meet are the same strays as in the old
areas ("Pickles the loner"), and nothing on the maps shows where a camp is.
The playtester wants to walk into StormClan's woods and *know* it: the cats
there are StormClan, their camp is on the map, your own clanmates are
friendly, and an enemy cat on your land means a fight.

Success: she walks into her clan's territory, sees her clanmates by name and
rank, boops one, goes on a patrol with a warrior, spots an intruder from a
neighbouring clan, and fights it off. The younger playtester can do all of
that too, and wins about as often as she does.

## What the owner decided

1. **Every cat in a territory belongs to a clan**, the full range: kits,
   apprentices, warriors, elders and the leader, with names that show their
   rank.
2. **The clan camp is clearly marked** on the corner map and on the territory
   map.
3. **With your own clan's cats you can touch noses, boop, and patrol
   together.**
4. **Another clan's cat on your clan's land means a fight**, and fights are
   **real: they can be won or lost.** "More realistic" (the playtester). This
   overrides the earlier "no battles / nothing the younger playtester can lose" rule
   (editions spec non-goals; v21 clan spec §4) for fights only.
5. **Win:** the intruder flees over the border back to its own territory.
   **Lose:** the intruder just carries on walking where it was going.
6. **During a fight** the cats hiss, claw each other, and jump and roll around.
7. **How the kid fights: "read the move".** Best of three rounds. Each round
   the enemy shows a clear clue before it acts (crouches low before a pounce,
   raises a paw before a swipe, backs off before a charge). The kid taps one
   of three big buttons, **Pounce**, **Swipe** or **Dodge**; each beats one of
   the enemy's moves. The clue stays up for a couple of seconds: it is about
   noticing, not speed. A small personality edge on top is fine (the owner
   saw this offered with option 1).
8. **The camp has its own leader cat** (2026-10-31). The clan in a territory
   has a separate leader at the camp; the kid's cat is not that clan's
   leader. The kid's own "-star" name from the v21 clan feature stays as it
   is: it belongs to their colony, not to the territory's clan.
9. **Allies share land** (2026-10-31). If the two kids picked different
   clans, each is at home on the other's clan's land too: greet, boop and
   patrol with its cats, and fight intruders there.

## What stays true (unchanged rules this design must keep)

- **Losing never takes anything.** No points, cats, unlocks, marks, walks or
  taming progress. A lost fight's whole cost is that the intruder stays.
  (The owner set the consequence; this keeps the editions spec anti-goal
  "either kid loses progress".)
- **Never partner against partner.** Fights are only against computer-run
  clans. The two kids' clans are always allies (decision 2 of the editions
  spec), so neither kid's clan cats ever fight the other kid.
- **Not a reflex test.** No move has to be tapped faster than a slow reader
  can. The clue is honest: it always shows the move that follows.
- **Legacy Edition sees no clan layer.** Legacy shows no clan names, no camp
  marks, no fights. Legacy can only reach a territory through a co-walk.
- **Co-walks agree.** Two kids walking together see the same cats in the same
  places. Names may differ by edition; positions, counts and who-is-where
  may not. Nothing here may add draws to `walkRng` or the strays' stream that
  shifts any existing cast.
- **Saves stay SAVE_VERSION 4.** Any new stored field is additive and
  sanitised. Clan cats themselves are never stored: like `clannames.js`, they
  are derived, so both devices compute the same ones with nothing on the
  wire.
- **Our own words.** No canon cat or place names; everything passes
  `test/clanwords.test.js`. Name parts come from `clanwords.js`
  (`WARRIOR_SUFFIXES`, `RANK_SUFFIX`, the clan prefixes).
- **The iPhone budget.** A territory's cats cost no more than today's strays
  there (22 on HIGH, 14 on the lower tier).

## How it fits what's already planned

- **Depends on "pick your clan"** (plan
  `docs/superpowers/plans/2026-10-31-clan-edition-pick-your-clan.md`, on
  main and reviewed, not built yet). That plan gives each
  territory a home clan (StormClan in the Woods, GaleClan on the Moor,
  BrookClan by the River, DuskClan in the Pines; CliffClan for the Gorge
  later), each kid's pick, a camp disc per territory (Woods (2, −43) r 6,
  River (5, 1) r 6; the Moor and Pines add one each), and the rule for which
  clan patrols where. This design builds on top of it and lands after it.
- **Depends on the new cat body** (merged on main): the fight poses and the
  clan cats' ranks (kit size, elder posture) use the new rig. There are no
  throwaway poses on the old rig.
- **Kittypets** (plan on main, not built) keep
  working: the wanderer still turns up 1 day in 5, and kittypets stay out of
  territory casts otherwise.
- **The island** stays cat-free (owner decision). No clan cat, intruder or
  fight on the island or the bridge.

## The parts

### 1. Who lives in a territory

In Clan Edition, a territory's cast becomes:

- **The home clan's cats**, the full range:
  - **near the camp:** the clan's own leader (decision 8), one or two elders and a few kits;
  - **around the territory:** apprentices and warriors.
- **Loners** *(Claude's call, flagged)*: a few loners stay, so colony feeding
  in the territories (shipped 2026-10-31) still has cats to feed and take
  home. The kittypet wanderer is still the occasional extra.
- **An intruder now and then:** a warrior from a neighbouring clan, on your
  clan's land only (see §4).

Which clan counts as "the home clan" follows the pick-your-clan plan's rules.
**You are at home** in your own clan's territory and in your partner's
clan's territory (decision 9): its cats are friendly, and you can fight
intruders there. Any other territory is home to that territory's clan, and
there you are the visitor: its patrol chases you off as rival patrols do
today, and there are no fights.

**Colony cats in a territory** *(Claude's call)*: a cat you have fed but not
tamed still stands at its spot as a loner. Tamed cats live in the den, as
today.

**Legacy in a co-walk** *(Claude's call)*: Legacy can only be in a territory
on a co-walk with a Clan Edition kid, and both screens must show the same
cats. So the Legacy device spawns the same clan cats, shown as plain,
unlabelled cats: no names, no ranks and no camp marks. They have no feed
prompt on either device, so the shared colony is never touched through
them. Intruders walk about on the Legacy screen too, but a fight can't be
started there.

**Names** show rank. Kits end in -kit, apprentices in -paw, the leader in
-star; warriors and elders get a full name (prefix plus a `WARRIOR_SUFFIXES`
word). Each name is followed by the clan where a label shows it, e.g.
"Thornfur of StormClan". Names are derived from a seed (territory, clan and
the cat's slot), so the same territory always has the same clan cats, every
walk, on both devices. *Claude's call:* the cast is fixed per territory and
clan (the same leader every time), not reshuffled per walk, so kids get to
know them.

**Clan cats can't be fed or tamed.** They belong to their clan. The feed
prompt never shows for one.

**Kids who haven't picked a clan yet:** every territory is someone else's
land, so there are no clanmates and no fights. The territory map's
pick-your-clan card is the nudge. *Claude's call.*

### 2. The camp, marked

- **In the world:** the camp disc gets something you can see from a
  distance, cheap enough for the budget: e.g. a bramble den mound and a
  leader's rock. The kits, elders and leader sit there.
- **Corner map:** a camp icon at the camp's position, in the clan's colour,
  in Clan Edition only.
- **Territory map:** each territory shows its camp icon, and the kid's own
  clan's camp is highlighted.

### 3. Your clanmates

- **Touch noses:** the existing greet verb, reused.
- **Boop:** the existing boop (today a friend-to-friend verb between players),
  reused against a clanmate.
- **Patrol together:** a warrior or apprentice falls in beside you and walks
  with you for a while (*Claude's call:* about a minute, or until you reach
  the border or the camp), then says goodbye. While it walks with you, it
  marks the border when you do.

Each of these can pay a small award once per cat per walk, in line with the
existing `AWARDS` table (e.g. `boop: 5`, `friend: 6`). *Claude's call.*

### 4. Intruders and fights

**When:** sometimes a warrior from a neighbouring clan is in a territory
(*Claude's call:* at most one intruder at a time, a few per walk, never at
the camp's doorstep on arrival). *Claude's call, for co-walk agreement:* an
intruder belongs to the territory, not to anyone's pick. It is scheduled
from the territory and the clock, like today's patrol, so every device in a
walk shows the same intruder in the same place whatever it knows about the
other kid's pick. Only a kid who is at home there (decision 9) gets the
fight prompt. To anyone else it is just a cat passing through. When you get close, it puffs up and hisses, and a
**Fight / Back off** choice appears. Backing off is always allowed and costs
nothing. *Claude's call:* the kid chooses, so a fight never starts by
surprise.

**The fight:**

1. Both cats square off: hissing, fur up.
2. **Three rounds.** Each round:
   - the enemy shows its clue (crouch → pounce, raised paw → swipe, backing
     up → charge), held for about 2 seconds, with a matching icon so a kid
     who misses the pose can still read it;
   - the kid taps **Pounce**, **Swipe** or **Dodge**;
   - the right counter wins the round. The builder sets the counters so each
     is easy to remember and teach in one line (e.g. dodge a pounce, pounce
     under a swipe, swipe a charge);
   - the round plays out as a tumble: claws, a jump, a roll, a dust cloud.
3. **Best of three:** win two rounds and the intruder flees; lose two and it
   shakes itself off and walks on.
4. **Not tapping in time** loses that round, but slowly: the clue has to have
   been readable for its full time first.

**Personality edge** (small, never decisive): e.g. a Fearless cat's clue
window is a bit longer, or a Steady cat gets one "second look" per fight.
The builder picks the exact edge from the existing `special` values in
`src/cat/brain.js`.

**Winning:** the intruder runs back over the border to its own territory,
reusing the rival patrol's scamper and landing logic in reverse. A small
award and a journal tally ("intruders chased off"). *Claude's call.*

**Losing:** the intruder carries on its way. You may challenge it again after
it has walked on a while (*Claude's call:* about 20 seconds). Nothing is
lost.

**Co-walks:** both kids must see the same intruder in the same place. A fight
happens on the device of the kid who started it. Its outcome (fled or not)
reaches the other device over the existing walk event channel
(`applyRemoteEvent`), so the intruder flees on both screens. The builder
confirms this is enough, or proposes something simpler.
*As built (Part 2):* two events are enough, because the intruder's walk is
already shared through the clock. `intruder-fight` says "I am holding this
visit's cat": on the partner's screen it stops and faces my cat, and the partner's Fight pill
for it goes away. `intruder-done` (`fled` true or false) says how my fight
ended. The rounds themselves stay on the fighter's screen. Holds are counted
per visit, so a partner's loss never lets it walk on while I am still fighting it,
and a hold with no word back lets go after 40 s. A win beats a loss in
either order: once it flees on a screen, a later "walked on" is ignored. If
both kids fight the same cat and either wins, it flees on both screens and
each kid who was fighting it is paid once (the award is keyed per visit).

**Reduced motion:** the tumble becomes a short dust puff, and the clue and
buttons work the same.

**Sound:** a hiss on squaring off and a scuffle sound per round, through the
existing audio module.

### 5. Their land vs yours

| Where | Residents | Intruders and fights | Patrol |
|---|---|---|---|
| Your clan's territory | your clanmates (friendly verbs) | yes: neighbouring-clan warriors, fights | (none hostile beyond intruders) |
| Another clan's territory | that clan's cats (no fights; greet only) | no | their patrol chases you off (today's rule) |
| Old areas (Neighborhood, Park, Seaside, Docks) | unchanged | no | unchanged |
| The island | no cats | no | no |

*Open for the builder:* whether your clan's own territory still has the
"neighbouring clan patrols at the same camp" rule from the pick-your-clan
plan, or whether intruders replace it there. Claude's lean: intruders replace
it. *Settled 2026-10-31 by the owner: intruders replace it (see below).*

## Owner's answers (2026-10-31, after planning)

Plans: `docs/superpowers/plans/2026-10-31-clan-life-1-cast-camp-verbs.md`
(cast, camp, clanmates) and
`docs/superpowers/plans/2026-10-31-clan-life-2-intruders-fights.md`
(intruders, fights, co-walk sync).

**Owner's decisions:**
1. **Intruders replace the neighbour patrol at your own camp** (§5's open
   question). On land where you are at home there is no patrol. This
   supersedes pick-your-clan's D7 for the clan-life era.
2. **Name words:** the 36 words the plan proposed.
3. **Each clan has its own colours**, so its cats read as one family and an
   intruder stands out: StormClan browns and tabbies, GaleClan light greys
   and creams, BrookClan grey-blues and silvers, DuskClan blacks and dark
   tortoiseshells (CliffClan later). Coats are derived from clan and slot,
   never stored; intruders wear their own clan's colours.
4. **A busier camp.**

**Coordinator's rulings:**
- HIGH cast: 1 leader, 1 deputy, 2 elders, 4 kits, 5 warriors, 3 apprentices
  (16) + 1 intruder slot + 5 loners = 22. LOW: 9 + 1 + 4 = 14. On HIGH, fed
  colony cats beyond 5 take the extra clan slots first, so up to 12 fed cats
  stay at their spots.
- An intruder from either kid's clan never starts a fight; it walks through.
- The teach line shows in every fight.
- No intruder dot on the corner map.
- The personality edges and award values stay as the plan proposed.
- After the plan review: when both kids fight the same intruder and one
  wins, both get the award once; touch noses and boop pay for the first 4
  cats a walk and patrols for 2 (about 96 points a walk from clan life at
  most); the draw budget's levers, in order, are camp cats casting no
  shadow, then merging the still cats, then 2 kits instead of 4; Root, Toad,
  Trout and Mint move to warrior slots so no kit or apprentice name is a
  book name.
- Part 1 draw reading (2026-11-01, headless Chromium, HIGH, Auto off, 10 s
  average; fps not meaningful there, about 3 to 4 on both builds; iPhone 18
  reading still pending, the owner's): camp view desktop Woods 413 (was
  313), River 645 (745), Moor 366 (263), Pines 873 (840); phone portrait
  396 (300), 662 (571), 381 (191), 532 (464); at most +190, inside lever
  1's expectation. Roaming spots: +25 to −188. No further lever needed.

**Part 2 as built (intruders and fights):**
- One visit slot per 120 s of wall clock; 3 slots in 4 bring a warrior of a
  neighbouring clan, 10 s into the slot, walking at 0.9 m/s. One at a time.
  Who and where come from the territory and the clock only, so co-walkers
  agree without sending anything.
- 8 routes, one per territory and neighbour: Woods (Moor, River), River
  (Pines, Woods), Moor (Woods, Pines), Pines (River, Moor). Each is clan
  ground all the way (never water, a wade band, a bog, the island or the
  truce path), at most 90 m, and at least 3 m outside the camp.
- It puffs up and hisses within 6 m; the Fight / Back off pill shows within
  3.5 m and stays up to 10 m. No pill while your cat is wading or swimming
  or off clan ground; never against either kid's clan, in Legacy, the old
  areas, the island, or on land that isn't yours.
- Counters: crouches → Dodge, raises a paw → Pounce, backs up → Swipe; the
  teach line shows in every fight. Square-off 1.2 s, answer window 4 s
  (first 0.25 s ignored), tumble 1.4 s (0.6 s puff with reduced motion),
  0.8 s between rounds. Edges: +1 s window (`fearless`, `keenNose`,
  `chaser`) or one second look (`steady`, `pouncer`, `napper`, `bird`).
- Win: it runs home along its route to the nearer end at 4.5 m/s (a puff
  with reduced motion), `intruder: 12` once per visit, and the journal's
  "chased off" tally. Lose: it walks on (catching up at most 2.5 m/s), you
  may try again after 20 s, and nothing in the save changes.
- Part 2 live check (2026-11-01, headless Chromium): an intruder walked,
  was fought, won and lost in all four territories; the save was
  byte-identical after each loss; every flee stayed on clan ground and out
  of the water; phone portrait buttons 88 px tall in the bottom third.
  Landscape (fixed 2026-11-01): one low sheet along the bottom, the clue,
  pips and a small teach line on the left and the three moves in one row on
  the right, each clamp(64px, 22vh, 88px) tall (83 px at 812×375, top 285,
  inside the bottom third from 250); the sheet is about a quarter of the
  height (top 279) and both cats stand above it; the chat wheel steps aside
  for the challenge pill as well as the sheet.
- Part 2 draw reading (2026-11-01, headless Chromium, HIGH, Auto off, 10 s
  average; fps about 2 to 4, not meaningful): the intruder is 24 to 25
  meshes, all casting. Beside it, it adds about +50 draws (desktop Woods,
  River, Pines +50 to +52, Moor +87; phone +48 to +72), roughly 25 main
  pass plus 25 shadow. Seen behind the camp from 9 to 35 m, +19 to +49.
  Mid-fight costs nothing measurable beyond that (the dust bursts are
  short). Camp views with an intruder in view, desktop: Woods 676, River
  656, Moor 573, Pines 416; phone 459, 556, 376, 441.
- Still the owner's: the iPhone 18 reading (60 fps held at the camps,
  mid-fight and with an intruder in view) and the fairness playtest (five
  fights each for the younger and the older playtester; if one of them wins far fewer, lengthen
  the answer window first, then the teach line's size; losing never costs
  anything).

## Amendment (2026-11-04): away fights, at the border patrol only

Playtester request: "be able to start a fight in another territory, if you
are outside your home territory" (a CliffClan kid in the Moor wants to fight
a MoorClan warrior). The owner chose the **border patrol fight**. This
amends §1's last paragraph, §5's table and the non-goal "no fights in
another clan's territory" as follows; everything else stands.

- In another clan's territory the camp's border patrol is now **a real
  warrior of that clan** (one of its warrior slots 4–6, picked from the room
  seed on a co-walk, else from the walk), with a name tag. While it is on
  patrol it is not also roaming the territory.
- When it catches you inside its border (where it used to chase you out at
  once) it **squares up** instead: "<Name> of <Clan> blocks your path!" with
  **Fight!** and **Run**. The fight is the same read-the-move fight as at
  home, under all of its rules.
- **Win:** "<Name> lets you pass." It goes back to its patrol and leaves you
  be for the rest of the walk (no pill, no chase), and you get the new
  `border` award (12 points) once a walk. It wears your scar back to camp.
- **Lose, Run, or no answer in 8 s:** you are chased back over the border
  exactly as before. Nothing is taken.
- Still never: fights in the water, at the island, in the old areas, in the
  den, in Legacy, or against either kid's clan (the patrol's clan never is
  one). At home nothing changes: intruders, no patrol.
- Co-walk: "she is facing it" and "her fight is over" go on the wire, so the
  patrol stands still on both screens while either kid fights it; each kid's
  outcome is her own.

Plan: `docs/superpowers/plans/2026-11-04-border-patrol-fight.md`.

## Goals

- A territory reads as a clan's home at a glance: names, ranks, a marked
  camp.
- Your own clan feels like yours: friendly verbs and a patrol buddy.
- A fight is exciting to watch, fair to a young player, and never costs
  anything.

## Non-goals

- No injuries, health bars, medicine cats or death.
- No fights with the other kid's cat, or in Legacy Edition.
- No fights in the old areas, at the island, or in another clan's territory
  (there you're the visitor; the patrol chases you). *Amended 2026-11-04:
  except with that territory's border patrol warrior (see the amendment).*
- No new server or SQL work.

## Anti-goals (a failure even if it ships)

- A kid loses anything from a fight.
- The faster kid reliably wins: if playtesting shows the younger playtester losing
  far more often than the older playtester, the clue window is too short.
- Two kids on a co-walk see different cats or different outcomes.
- A territory gets slower on the iPhone than it is today.

## Left to the builder

- Exact counts per rank, and where in each territory they stand.
- The camp's look, within budget.
- The move counters and the exact personality edge.
- Fight timings, awards and the challenge-again delay.
- How the fight UI sits on a phone screen (big buttons, thumb reach).

## Separate, still being designed

Swimming (the playtester's other request): a cat in water should swim, not
walk. It has its own design.
