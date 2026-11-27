# Market Square: the stray fix and six missions

Date: 2026-11-27. Branch `market-missions` (off main). The owner picked the six; the answers to every open question below are defaults, chosen so a child can play without a rule book. Any of them can be flipped later in `src/world/marketerrands.js` (all numbers are one table).

## The stray fix

Cause: strays never read the area's `colliders` (only her own cat does). Every area that wants strays kept off its solid things names them in `keepOut`, and the Market's `MARKET_KEEPOUT` held only the treat stalls' watch zones and hides. So a stray walked straight through the stalls, the fountain, the lamps, the crate stacks and the musician. Fix: every solid circle in `MARKET_COLLIDERS` is also a keep-out capsule (r + 0.35, a cat's body). Test: `test/marketplan.test.js` pushes points in and around every solid and asserts the stray's push puts the centre outside it.

## The six missions (all per device, nothing sent, no clock that can fail her)

Each is a pure step machine (`src/world/marketerrands.js`), carried out by `src/world/marketerrandlive.js` inside the Market's life. Automatic: no new buttons, except the fish head, which is picked up and carried by the existing carry button. Each pays `AWARDS.marketjob` (25) once a walk, and counts on its own journal page (`mk...`) the first time and every later walk it is done, like the Farm's jobs.

| Mission | How it goes |
|---|---|
| Mouse in the cheese stall | A mouse sits behind the cheese stall. Each time she comes within 1.6 m it darts to the next of three spots; the next time it ducks into the cheese crate and is gone. Nothing is caught or hurt. |
| The lost glove | The glove already lying by the east bench (`market-glove-1`). Carry it to the flower seller (within 1.3 m of the front of her stall): she beams and the glove goes on her counter. Dropping it elsewhere loses nothing: pick it up again. |
| Pigeons off the cafe tables | Three pigeons sit on the three cafe tables. Coming within 1.7 m of a table sends its pigeon up and away (the walk's own seeded flap, no random). All three gone and the waiter nods. |
| Rooftop run on the awnings | Landing in the bicycle basket rings the bell. For 30 s after it, landing on three different stall awnings counts (an awning is a `roof` perch). Too slow: the run just stops; ring the bell again. |
| The hungry stray | A thin stray sits behind the fish stall (a real cat model, drawn only near). Coming within 4 m of him shows him hungry and puts a fish head in the bin by the fish stall's back corner (a carryable, never sent, never a mark). Carry it to him (within 1.6 m): he eats, purrs, sits. Fed once ever (journal `mkstray` above 0): on every later Market walk he is already following her, 2.2 m behind, kept off props by the same keep-out. |
| Sit through the fiddler's song | Within 3.2 m of the musician and still (under 0.25 m/s) for 14 s. Moving starts it again; a drink at the fountain, 2 m off, does not count (it is the fountain's own find). At 2 s a toast says a song has begun. |

## Defaults chosen

- **Partner credit:** none. Nothing is sent (the Market's life has no sender use; same as the Farm's jobs). Each child finishes her own.
- **Repeat:** each can be done every walk (pays once a walk). The stray is fed once ever; after that he follows.
- **Gold mice:** none. The plan does not need any.
- **Words:** one table (`src/clanphrases.js`, the later table), read through `src/world/marketerrands.js`; both word sets read the same lines, no series word is in any.
- **Where:** every spot is on free cobbles, 0.9 m clear of every solid, outside every treat stall's watch zone and hide, and 1.5 m from every golden find (`test/marketerrands.test.js`).
- **Budget:** props are made in the life, not in the build, so the build's meshes/triangles are unchanged. Chunk stays under 100 kB; start-up under 720 kB.
- **Save:** only six journal counts (`mkmouse`, `mkglove`, `mkpigeons`, `mkbell`, `mkstray`, `mkfiddle`); no new save key.
