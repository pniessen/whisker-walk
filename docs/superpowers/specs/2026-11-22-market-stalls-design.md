# Market Square: four more stalls

Date: 2026-11-22. Status: owner's answers recorded (see Decisions). Branch `market-stalls`, from main c7ffb975. Builds on `2026-11-20-market-square-design.md`.

## Intent

The Market is live (69e8c6f4) with six stalls that have counters (fish, baker, cheese, milk cart, flowers, fruit) and a café. The owner wants "3-4 more stalls... more variety, more things to climb and knock over, new treats - all of it". Four new stalls give the square a second round of the same cheeky romp: the Butcher, Toy and yarn, Plant stall, and Bric-a-brac. Each has a new treat, a new climb and a new thing to knock over. The owner said "stalls sound right".

## Decided by the owner

- 3-4 more stalls, for variety, climbing, knocking over and new treats.
- **Approach 2:** one parametrised stall builder on the existing kit (`src/world/marketparts.js` counters, awnings, crates). Each stall differs by goods, props and one special behaviour. Four hand-built models were rejected (too many triangles). Re-skinning existing stalls was rejected (not enough variety).
- The four stalls and their treat / climb / knock-over:

| Stall | Treat | Climb | Knock over |
|---|---|---|---|
| Butcher | string of sausages (hangs overhead: a real hop, or the hook rail, reaches it) | hanging hook rail | bucket of bones |
| Toy and yarn | ball of wool that rolls when pushed | stack of toy crates | pyramid of yarn balls and a pull-along toy |
| Plant stall | catnip sprig | tiered shelves | three clay pots, each falls when pawed |
| Bric-a-brac | opened sardine tin | tower of trunks | stacked crockery, one piece falls at a time, loud clatter |

A sweet/toffee stall was passed over because toffee is a poor cat treat. The swap stays possible.

## Goals

- Each new stall is a place a child wants to go to, with a treat to snaffle on its own rhythm.
- Every stall has one thing to climb and one thing to knock over, within a hop's reach of the existing climb rules.
- Two children together still see the same square (same cycles, same knock results).

## Non-goals

The six Market missions; strays walking through props; the beauty pass on the buildings; taller people; controller/TV mode; new net messages; database work.

## Anti-goals (a failure even if it works)

- **Over budget.** Triangles, meshes or kB past the numbers below, or any ceiling raised.
- **Four stalls that play the same.** If swapping the sign changes nothing a child feels, we have built a re-skin, which the owner rejected.
- **A treat she cannot reach.** The shelved catnip must be grabbable from the cobbles within `TREAT_REACH` (0.8 m, which the code measures sideways only) by the same button as every other treat. The sausage string must be reachable by a hop or from the hook rail, by buttons she already has, and must NOT be reachable flat-footed.
- **A knock-over chain that never settles.** Every fall must end in a set rest pose, the same on both screens.
- **A crowded square.** The new stalls must not block the spawn-to-fountain walk, any view lane, or the café crumbs.
- **Breaking co-walk determinism**, or adding any key-only action.

## Constraints

- All text goes through the phrase table (`src/clanphrases.js`, the `LATER` table), read through `src/marketwords.js`. See Words.
- No `Math.random`: seeded streams or `hash01` only. Stall cycles come from `stallOffsets(seed)`.
- No new net message types. The sausage hop uses the same event. Treat grabs use the existing `carry-pick` event; knocks use the existing knock event.
- Do not edit `src/game/walk.js` or `src/world/areas.js`. Nothing here seems to need either.
- Everything lives in the lazy Market chunk. Start-up gzip must not move (697.0 of 720 kB) and the chunk must stay under 100 kB (64.8 kB now). Never raise a ceiling.
- Touch and controller: every new action is the existing grab, hop, paw or climb button.
- The Old House builder works in `.claude/worktrees/house`. Nothing here touches it.

## Approaches

1. **Four hand-built stall models.** Most freedom, but rejected by the owner: too many triangles.
2. **One parametrised builder on the existing kit (chosen).** The code already has this half-built: `drawStall` in `src/world/market.js` is driven by a `STALL_LOOK` table (awning cell, sign cell, paint, goods), and the plan is a `RAW` row table in `src/world/marketplan.js`. We extend the tables and add a `goods` kind per stall. Meshes merge by material bucket, so each stall adds triangles and few meshes.
3. **Re-skin existing stalls.** Rejected by the owner: not enough variety.

## Design

### Where they go

The square is 42 x 44 m (bounds x -21..21, z -21..23), with the fountain at the middle. Stalls stand about 11-17 m out and face the fountain. Each treat stall brings a watch zone (3.2 m deep in front of its counter) that no other stall's zone may overlap (`test/marketplan.test.js`).

The code has no list of free spots, and the rule that finds them is the plan test's. I ran a rough scan using the real colliders, keep-out capsules, POIs and collectibles (it did not check lamps' view lanes or hides, so it is a lead, not a layout). It found four pockets on the ring: about (14, -9) north-east between cheese and flowers; (15, 6.5) east-south-east between flowers and milk; (-16, -3) west-north-west between fish and baker, close to the west barrow; and (-9.5, 11) south-west beside the café, the crowded one. The spawn lane near x 0, z 15 also scans free and must stay empty. I could not settle which stall goes where. Proposed: Butcher (14, -9), Plant stall (15, 6.5), Toy and yarn (-16, -3), Bric-a-brac (-9.5, 11), moving one clutter item if the plan test objects. The builder fixes the numbers by running the plan test.

### The builder

`buildStall(spec)` is an extension of `drawStall`, not a new module. Input per stall:

- the `RAW` plan row (`id`, `at`, `w`, `d`, `treat`, `hide`, `keeper`);
- a `STALL_LOOK` row (awning cell, sign cell, paint, `goods` kind);
- a `STALL_TIMES` row (serve and away seconds);
- a `props` list: one climb (stack kind, perch height), one to three knockable rows, and an optional rolling set.

Output is the same as now: merged meshes in the kit's buckets, a `treatMeshes[id]`, `keepers`, and plan entries (colliders, perches, hides, keep-out, knockable rows).

What the kit already gives: counter, awning sheet and valance, sign board, crates, baskets, bunting, the people-kit stallholder, the atlas's free cells 18-31 for new awnings, sign pictures and goods. What is new: four `goods` drawings, four treat meshes, and four prop meshes (hook rail, toy crates, shelf tiers, trunks).

### Each stall's one special behaviour, on an existing mechanic

- **Guarded treat (all four).** Add the ids to `TREAT_STALLS` (`marketplan.js`), after the existing four. `stallOffsets` takes one draw per stall in that order, so the existing four keep their offsets. Add `STALL_TIMES` rows (every pair of periods must differ by more than 0.3 s). `marketlive.js` already loops over `TREAT_STALLS` for rhythm, noticing, shoo, grab and pay (6 paws plus 6 teamwork, item id `market-treat-<stall>`). `TREAT_KINDS` (`marketparts.js`) and `TREAT_WORDS` (`marketwords.js`) gain four kinds.
- **Butcher: the sausage string (the one real hop; see Decisions 2 and the Hop design).** Climb: the hook rail is a `crates` stack variant whose top perch sits under the rail. Knock: bucket of bones, an existing `bucket` knockable (`src/knockables.js`).
- **Toy and yarn: the rolling wool.** The treat is an ordinary grab. The roll maps onto `marketfruit.js`'s apple crate: a tippable with a `build` hook whose spilled items roll along data paths from the crate's yaw (`createApples`). A basket of wool balls is that crate with other parameters (count, radius, colour), so both screens roll the same paths. The pull-along toy is a second tippable. Climb: toy crates, the `crates` stack as now.
- **Plant stall: catnip.** The treat is an ordinary grab on a shelf-end spot. Climb: tiered shelves, as a crate stack variant with two perches. Knock: three clay pots, as three `flowerpot` knockables, each a curated one-shot fall (`knockables.js`). No chain.
- **Bric-a-brac: the sardine tin.** An ordinary grab with its own mouth mesh and eat tell, like the fish and baker treats. The milk cart keeps its `cream` saucer, so the `kind === 'cream'` tests stay as they are and need no refactor. Climb: trunks stack. Knock: stacked crockery as `cup` knockables, one piece falling at a time with a louder clatter sound, if the existing knockables allow it. If the clatter needs a new sound or knockable kind, stop and ask (start-up bundle).
- **Climbs.** `CLIMB_LZ`, `stallPerches` and `CLIMB_STACKS` in `marketplan.js` are already per stall. Each new stall gets a `CLIMB_LZ` entry and an awning perch with a `ROOF_LABELS` line.

### Hop design (Butcher sausages): the riskiest piece of the feature

What exists today. `pounce()` in `src/player.js` is a 0.3 s horizontal lunge plus a RENDER-ONLY lift (`hopOffset`: 0.35 m base, 0.9 m with Spring Paws, 0 under reduced motion). It never writes `perchY`; `avatar.position.y` carries the lift. Treat reach in `marketlive.js` (`actionFor`, `act`) is horizontal only and refuses a perched cat. Climbing is the perch chain (`bestPerch`/`canReach`, budget 1.6 m), driven from `src/game/interactions.js`. The treat grab is `pick(mouth, {id: 'market-treat-<stall>'})`, which sends the existing `carry-pick`.

Design. The sausage treat is flagged `hang` with a height `hy` (about 0.9 m, a new field on the plan's treat row). It is reachable in exactly two ways, both ending in the same `act()` and the same item id:
1. **Hop catch.** While a pounce is live (`session.pounceTime` between about 0.07 and 0.23 s of its 0.3 s) and the cat is within `TREAT_REACH` sideways, `marketlive.js`'s per-frame update calls `act()`. The check reads the pounce TIMER, not the rendered lift, so reduced motion (flat arc) and the baseline cat both still reach it. The pounce is the existing paw button, so touch and controller need nothing new. If the Butcher's tell says "eyes on you", the shoo rules apply as for any grab.
2. **Hook rail.** A cat perched on the stall's rail perch (`perchY >= hy - 0.3`) within reach gets the normal grab prompt and button. `actionFor`/`act` accept `s.perched` only for a `hang` treat and only when that perch is the stall's own rail.
A cat on the ground, not pouncing, gets no prompt and `act()` returns false.

New code vs reused. New: a `hang` / `hy` field on the treat row; about 15 lines in `marketlive.js` (the hop-window check, the perched-on-rail allowance); a `railPerch` id on the stall's perch list. Reused: pounce, perch chain, `pick`, `carry-pick`, `market-treat-<stall>`, shoo, munch, pay, refill. No change to `player.js`, `interactions.js` or the net layer; both are only read. Co-walk: the grab is local and the partner sees the pick event as for any treat; the hop window is a function of the local timer, no randomness.

Tests. (a) A cat on the ground within 0.1 m of the string, not pouncing, gets `actionFor` null and `act` false. (b) The same cat, pounce started, at 0.15 s: `act` succeeds and `carry-pick` carries `market-treat-butcher`. (c) The same with a flat arc (reduced motion) succeeds. (d) A pounce at 0.01 s or 0.29 s, or from 1.0 m away, fails. (e) A cat on the rail perch gets the prompt and `act` works; a cat on the lower crates does not. (f) A cat perched elsewhere gets nothing. (g) The treat refills and pays 6 + 6 as the others. (h) Two sessions: the partner's pick removes the string for both.

Risks. Stuck in air: none new, as the hop stays render-only and `halt()` still clears it. Camera: no new motion, and the rail perch is an existing perch kind, so check that the follow camera copes with a perch under an awning. Shooing while airborne: a shoo during the pounce window must cancel the grab, not leave the string taken without the shoo (test it). Reaching from below through the counter: the counter collider keeps her about a body-length off, and sideways reach is 0.8 m, so a hop at the counter front is the intended case; a hop from BEHIND the stall (keeper side) must be checked against `hides` and the keeper's view. Pounce cooldown: a missed hop must not feel like a failed button, so the sausages get a tell (a swing) when a cat is within reach. Window timing: 0.16 s of grab window is tight on a slow tablet; the builder may widen it up to the whole pounce, and must tune by feel on an iPad.

### Budget

The hop adds only a few lines in the lazy chunk and no meshes beyond the sausage string and rail. The code contradicts the figures I was given. Market's build is measured at 111 meshes, 27 casters and 39,495 triangles (108 / 24 merged), against ceilings of 280 meshes, 210 casters and 62,000 triangles (`test/budget.test.js`, `test/market.test.js`). That leaves about 22.5k triangles and 170 meshes, not 10k. I would still keep to the stated target, so the extra room is margin.

| | Triangles | Meshes (merged) |
|---|---|---|
| Per stall (counter, awning, sign, goods, stack, props, treat) | 2,000-2,500 | 2-4 (the kit merges by material) |
| Four stalls | 8,000-10,000 | 8-16 |
| Market after | about 48-50k of 62k | about 116-124 of 280 |

Separate pin: the merged-mesh regression table in `test/budget.test.js` holds the Market at 123 meshes and 27 casters (measured 108 / 24, +12%). Four stalls will likely cross it. That pin is re-measured on purpose, as its own comments say it was before, and is not a ceiling raise. The knockables and tippables are separate meshes outside the merge count. Chunk size: four goods drawings and builders add code. I could not measure it, and 35 kB of room is plenty. Start-up: all new kinds use existing knockable kinds and the tippable `build` hook, so no new code goes into `src/knockables.js` or `src/tippables.js`, which are in the start-up bundle. If a new knockable kind turns out to be needed, that is the one place start-up could move, so stop and ask.

### Words

One table, no second one to write. `clanphrases.js` holds the lines, and a word set may override ids in its own `PHRASES` (`wordset.js`, `offclanwords.js`). The off set overrides no market lines, so both sets read the new lines unless a line uses a series word, which none should. New ids in `LATER`, wired in `marketwords.js`:

- `market.treat.<kind>` and `market.grab.<kind>` for four kinds: sausages, wool, catnip, milksaucer (the milk saucer's name needs one that differs from `cream`'s);
- `market.perch.<stall>` for the four awnings;
- sign and stall names if shown, and the four stallholders' "busy" bubble needs no words.

Every new id is recorded in the series-words snapshots, so those fixtures are regenerated on purpose.

### Tests and fixtures expected to change

- `test/marketplan.test.js`: the treat-stall and treat-kind lists, the lane, zone and clearance checks over the new stalls.
- `test/marketrules.test.js`: `STALL_TIMES` and offsets for the new ids (the old offsets must not change).
- `test/market.test.js`, `test/budget.test.js`: the measured numbers.
- `test/marketparts.test.js`, `test/fixtures/market-atlas-cells.json`: the atlas's new cells (old cells' sums must not change).
- `test/marketlive.test.js`, `test/marketgame.test.js`, `test/marketcowalk.test.js`: the stalls in each loop, plus the hop tests (a) to (h) above.
- `test/fixtures/series-words-*.json`: the new phrase ids.
- Not expected to move: `flat-trace.gameplay.json` and the other determinism traces. If one moves, stop.

## Left to the builder

The exact positions (the plan test decides), the timings, the goods' pictures, the tell's look reused as it is, the hop window's exact bounds and the sausage height `hy` (tuned by feel), the rail perch height, how many knockables each stall carries within budget, the golden-mice and found-outfit spots (untouched unless one lands in a new stall's zone).

## Decisions (the owner's answers, 2026-11-22)

1. **Bric-a-brac treat: an opened sardine tin.** Not the milk saucer. The milk cart keeps its saucer of cream.
2. **Butcher sausages: a real hop to reach.** The owner chose this over the recommended ordinary grab. The sausages hang above ground reach; a hop (the pounce) or the hook rail reaches them. See the Hop design. This is the riskiest piece of the feature.
3. **Plant stall: three clay pots, each falls when pawed.** No clatter chain. Bric-a-brac's crockery uses the same one-at-a-time fall with a louder clatter if existing knockables allow it.
4. **Positions: Butcher (14, -9), Plant stall (15, 6.5), Toy and yarn (-16, -3), Bric-a-brac (-9.5, 11).** The builder verifies lamp view lanes, hides and stray routes. A spot that fails moves along the nearest free edge, and the builder records that in its report.
5. **Pay: assumed the same as the existing treats (6 paws plus 6 teamwork).** The owner was not asked; this is an assumption he can change.
