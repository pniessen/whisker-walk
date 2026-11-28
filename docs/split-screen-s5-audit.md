# Split screen S5a: rides, missions and prompts for either cat (audit + foundation)

Branch `split-s5a` (from `split-s4`). Facts read from the code on 2026-11-28; "cat one" is the walk's `session.cat` / `ctx.player`, "cat two" is the couch mover (`src/coop/second.js`, headless body + player). Ladder levels are the spec's actor parity ladder (`docs/superpowers/specs/2026-11-22-couch-coop-design.md` section 69): L0 walk/swim/hop/meow, L1 finds/sniff/carry, L2 groom/tag/fights, L3 place specials (Farm jobs, Market, Fair rides, Roofs, House).

## How a prompt reaches the button today

`game/interactions.js` asks `s.areaLife.promptAt(catP)` (cat one's position only) and presses `s.areaLife.interact()`. Each place's life builds one `createPromptArbiter([...])` (Crystal, Moon, Jungle, Snowville, Treehouse; the Reef had a copy in `reefprompt.js`). Every source reads its own closure state, written for cat one (`session.perched`, `player`, `hookSession.cat`). Cat two has its own prompt line (`coop.handle.prompt(slot)` / `own[1]`), filled only with finds, Farm and groom hints (`coop/index.js` `late`), and its Square press goes to `finds.interact`. Its ride seats exist only in the Fairground (`coop/rides.js`: "a ride is for cat one to earn").

## Table

Cats: **one** = reads cat one's session only; **friend** = an online partner's `credit()` event seat (never the couch cat); **any** = no cat state. Complexity is for making it work for cat two (S small, M medium, L large). "Done" = built in S5a.

| # | Place | Source (file) | What it does | Cat assumed | Cat two today | To make it either-cat |
|---|---|---|---|---|---|---|
| 1 | Fair | rides + fair games (`fairlive.js`, `coop/rides.js`) | seat rides, games | one, rides.js gives cat two its seat via the same sim | L3 (two riders; earns nothing: "a ride is for cat one to earn") | S: credit once to the household save (journal once-per-key already) |
| 2 | Moon | Dot, the rover (`moonroverlive.js`) | drive, seat 0 'me', seat 1 'friend' | one drives; 'friend' = partner event | L0 | **Done** for the passenger seat (S); cat two driving = L (needs per-cat input in the sim) |
| 3 | Moon | sled (`moonsledlive.js`) | path ride, one rider | one | L0 | M: carry body along the path (same as Reef seal pattern) |
| 4 | Moon | base, job, star, launch, relay, jump, bound (`moon*live.js`) | missions, hand-ins, goals | one (`hookSession`, progression) | L0/L1 | M each: missions are per household; give cat two a `forCats:'both'` hand-in source |
| 5 | Reef | seal ride (`reefsealride.js`) | ride a swimming seal, one cat per seal ('me'/'friend' claims) | one | L0 swim | **Done** (S): claim 'cat2', carried by `secondCarry` |
| 6 | Reef | mounts: Sea Scooter, Saucer (`reefridelive.js`) | steered swim rides | one | L0 swim | L: steered sim per cat |
| 7 | Reef | Marlo, errand, lab fuses, wreck chest, hatch (`reeflife.js`, `reefstorylife.js`, `reeflabstory.js`, `reefwrecklife.js`) | story, errands, hunts | one | L1 | M: `forCats:'both'` + per-household progress (already shared in `progression`) |
| 8 | Crystal | river boat, Lumi's cart (`crystalriverlive.js`, `crystalcartlive.js`) | path rides, one rider | one | L0 | M each (path carry) |
| 9 | Crystal | Lumi, errands, forge job, pads, deep wing (`crystal*live.js`) | story and jobs | one | L1 | M |
| 10 | Snowville | sled, skis, snowmobile (`snowville{sled,skis,mobile}live.js`) | path rides with paws awards | one | L0 | M each (skis steer, mobile 2 laps) |
| 11 | Snowville | Tilly, errand, wing, job (`snowville*live.js`) | story and jobs | one | L1 | M |
| 12 | Jungle | Mossy, errand, wing, strays, job (`junglelife.js`, `junglejoblive.js`, `junglewinglive.js`) | story and jobs | one | L1 | M |
| 13 | Treehouse | Nutmeg, errand, wing, lift stage (`treehouselife.js`; lift not built) | story and jobs | one | L1 | M |
| 14 | Market | six errands (`marketerrandlive.js` `second()`) | stall missions | per cat (`second(p, session)`) | L3 (already per cat) | none: the model to copy |
| 15 | Farm | jobs, saucer, scarecrow (`farmanimals.js` `secondStep/secondAction`) | jobs | per cat | L3 | none |
| 16 | Lighthouse | keeper's cat and kitten (`lighthouselife.js`, `lighthousecats.js`) | job, prompt | one | L1 | S |
| 17 | Greenhouse | plants job (`greenhouselife.js`) | job, prompt | one | L1 | S |
| 18 | House | partner tour (`houselife.js`) | looks at `partners[i].local` | any (sees both) | L3 | none |
| 19 | Any walk | lost kitten (`kitten.js`), race (`race.js`), birthday gathering, gifts, strays, den cats (`interactions.js` 879-1175) | one-offs through `s.prompt` | one | L1 (strays react to meow) | M: `s.prompt` is a single slot; needs a per-cat `s.prompt2` |
| 20 | Roofs | climbs and crossings (`game/crossing.js`, `traversal`) | cat one only (hop-to-friend is refused during one) | one | L3 by hop | M |
| 21 | Fights | clan, away, border patrol (`awayfight.js`, `clanfight.js`, `coop/fights.js`) | fight pill | per cat | L2 | none |

Headline counts (21 rows): **none needed 4** (rows 14, 15, 18, 21), **done in S5a 2** (rows 2 passenger seat, 5), **small 3** (rows 1, 16, 17), **medium 11** (rows 3, 4, 7-13, 19, 20), **large 2** (cat two driving Dot, row 2; steered Reef mounts, row 6).

Reading the table: ride rows all share one shape (a path or seal, one claim holder, the walk's `session.perched` for cat one). The seal-ride pattern in S5a is the template: a `forCats:'two'` pair of sources, a claim holder `'cat2'` beside `'me'` and `'friend'`, and `secondCarry(dt, body, player)` that seats the headless body. Story/job rows are all `progression`-based (household), so they need only a `forCats:'both'` source that takes the cat id.

## Foundation built in S5a

The places' stage-A chunks are pinned to the byte (`test/lazybuild.test.js`: Reef at 65.0 of 65 kB, Moon landing pinned at 64.98), so **nothing in a place's own files changed**; everything new is lazy and in the couch walk.

- `src/world/promptarbitercat.js` (lazy): the per-cat `createPromptArbiter`. `promptAt(catPos, catId = 0)` / `interact(catId = 0)`, one `used` slot per cat. `forCats` on a source: `'one'` (the DEFAULT when absent, so every source written before couch play stays cat one's), `'two'`, `'both'` (asked with `(pos, catId)`, pressed with `interact(catId)`). One argument = cat one, the same calls in the same order as the places' `promptarbiter.js` (held equal by test). `promptarbiter.js` and `reefprompt.js` are unchanged: a place that wants `'both'` sources switches its import when its stage-A budget allows.
- `src/coop/seats.js` (lazy): `loadSeat(areaId, host)`, a registry of per-place seats for cat two (rows: moon, reef). A seat is one `forCats:'two'` source in a per-cat arbiter plus `carry(dt, body, player)` / `release(body, player)`. `coop/index.js` fetches the seat when cat two joins a place with a row, routes its line to cat two's prompt slot (`own[1]`, glyph through `padText`; a find in reach wins), sends pad two's Square to it when its offer is showing, skips cat two's own step while it carries (`carried`: no leash, `perch` pose, no hop), and releases it on leaving, a place change, hop-off, the timer or cat one getting out.
- `src/coop/seatmoon.js`: cat two takes Dot's passenger seat while cat one drives (seat 0). Read from `life.rover.state/.sim` only; no claim is written into the rover.
- `src/coop/seatreef.js`: cat two rides a swimming seal. The claim is the Reef's own `sealRide.credit({kind:'seal-in'|'seal-out'})` (the co-walk partner's path), which answers null for a seal cat one or anyone holds, so one cat per seal holds for both cats. Cat two sits at the seal's photo spot (`life.spottable`).
- The household save is written once: `awardOnce('reeffind', 'reef-seal-ride')` is keyed (two cats, two rides, one award); `recordSighting` is once-ever; nothing is sent (a couch walk has no net).
- Cat two's lines are in the coop word table (`coop.seat.*`), so the series switch and the coop word test cover them.

Remaining: everything marked M or L above. Template for the rest: path rides (sleds, boats, carts, skis, snowmobile) copy `seatreef.js` (a claim the ride already shows, a position along the path, a timer); story/job hand-ins need a `'both'` source, which means the place's own arbiter import moving to `promptarbitercat.js` (a few bytes of stage A, so each needs a budget check or a stage move); one-offs through `s.prompt` (row 19) need a per-cat `s.prompt` slot.

## Numbers

Start-up 678.4 kB gzipped, the same as `split-s4` (0 change); coop chunk 20.9 kB (ceiling 25); Moon stage A 64.5, Reef stage A 65.0 (both unchanged or lower); `npm run test:pins` 920/920; coop*, reef*, moonrover*, lazybuild and the new tests 1116/1116.

## S5b status per row (branch `split-s5b`, 2026-11-28)

Three coop-side pieces, all lazy, no place file touched (every pinned chunk is unchanged): `src/coop/seatlend.js` (cat two is lent the place's own life for one asking at a time: `life.promptAt(pos2)` then `life.interact()`, each followed by an asking at cat one's position so her button slot is put back; the one-shot state lives in the life, so the second cat finds it done and awards stay keyed), `src/coop/seatpillion.js` (cat two hops on behind cat one on a path ride she is on: carried at her seat record, set down beside her the frame her ride ends or changes, on its own press, or when the walk or place changes; the ride's paws stay cat one's single award), and the Fairground credit in `src/coop/rides.js` (the same `ride` / `boat-lap` events cat one's ride sends, through `handleFairEvent`, keyed by the walk's log). `src/coop/seats.js` rows are now lists (a place can have several seat files). While cat one is on a ride (`session.fair.riding`) the lend offers cat two nothing, because the lives' first source is cat one's "Hop off".

| # | Status | Notes |
|---|---|---|
| 1 Fair rides | **done** | journal page counted once per walk (log key) and the Viking boat swing pays through `noteBoatLap` (capped 2 a walk, keyed). A swing both cats ride is paid by cat one's event only. Tests: `coopseatsmore`, `coopm5fair`, `coopm5gaps` (updated: they asserted "no save"; now only the journal page moves). |
| 2 Moon Dot | passenger seat done (S5a); **cat two driving deferred** (large: per-cat input in the rover sim) |
| 3 Moon sled | **done** (pillion, id `moon-sled`; not exercised on the real sled) |
| 4 Moon missions | **deferred**: the Moon arbiter's first sources are the rover's "riding" source and cat one's stage hooks; a lend there needs a guard on `rover.riding` and a real-life test; Moon A is pinned at 64.5 of 65 so the fix cannot go in the place |
| 5 Reef seal | done (S5a) |
| 6 Reef mounts | **deferred** (large) |
| 7 Reef story | **deferred**: the Reef's first source is cat one's seal "Hop off" and swimming states; needs a guard on `sealRide.state.seal` and a test on the real Reef; Reef A is at 65.0 of 65 |
| 8 Crystal boat, cart | **done** (pillion) |
| 9 Crystal story/jobs | **done** (lend). Not run against a real Crystal life: only Greenhouse and Lighthouse have headless tests of the lend |
| 10 Snowville sled, skis, snowmobile | **done** (pillion; cat two rides behind, not steering) |
| 11 Snowville story/jobs | **done** (lend, same caveat as 9) |
| 12 Jungle | **done** (lend, same caveat) |
| 13 Treehouse | **done** (lend for Nutmeg, errand, wing); the lift stage is not built |
| 16 Lighthouse | **done** (lend; tested: the kitten is found once) |
| 17 Greenhouse | **done** (lend; tested: the can is taken once, cat one's slot restored) |
| 19 Any-walk one-offs through `s.prompt` | **deferred**: a per-cat `s.prompt` slot is a change in `game/interactions.js` (start-up) |
| 20 Roofs | **deferred** |
| 14, 15, 18, 21 | none needed |

What needs the owner: nothing blocking. A real two-pad walk through each lent place (Crystal Lumi, Snowville Tilly, Jungle Mossy, Treehouse Nutmeg) and one pillion ride per place is the check worth doing on a device; the headless tests cover the mechanism, not each place's wording on the pad glyph.
