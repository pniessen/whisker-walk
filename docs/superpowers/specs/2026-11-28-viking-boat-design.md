# The Viking boat (Fairground ride six)

One ride, one page. Owner asked for it on 2026-11-21 (memory: the Fairground backlog); on 2026-11-28 he raised the Fair chunk ceiling to 110 kB and the Fair triangle row to 80,000 to pay for it.

## What it is

A friendly longship with a green dragon head and tail on a swing frame: two red-and-cream A-frames, a beam, two arms down to the hull. Painted shields along both sides, a red-and-cream striped sail, two benches. Planks on the ground round it and a ticket post (a striped pole with a round shield) on the west side, where the way in is. No water, no weapons, no faces that frown: the dragon has big round eyes and a gold snout.

## How it plays (kids of 9 and 11, no fail screens)

- **Getting on.** Walk up to the stage round the boat and press the action (jump) button, like every other ride here. The paw hint shows up. Rides here have no ticket machine; the ticket post is the sign that says where to stand.
- **Seats for two.** Two benches, bow and stern. The second cat (a couch partner, or a room partner through the ride seat ids) gets the other bench; a taken bench is never offered. No messages: both devices read the same clock.
- **The ride.** A pendulum on a 29 s lap of the shared clock: 6 s still (time to climb aboard), the swing builds over 7 s, holds 9 s, settles over 7 s. One swing there and back takes 4.8 s. The top is 0.5 rad (about 29 degrees): the cat rises about 0.6 m and sweeps 2 m either way. It can only be boarded while the boat stands or has all but stopped, so nobody is thrown on.
- **Getting off.** Jump again or push the stick, at any moment. She hops down to free ground on the west side in the usual short hop, never under the swing.
- **The cat.** She leans with the hull; her ears go back at the top of each swing (not with reduced motion).
- **Reward.** First time on in a walk: one friendly line, `Hold on tight! The Viking boat starts to swing!` (once a walk through the walk toast gate). It has no journal page and writes nothing to the discovery log for the line. **Paws (owner decision, 2026-11-28):** a swing ridden to the end with her cat aboard (it swung, then came back calm) raises `boat-lap` in `src/fairlive.js`, and `noteBoatLap` (`src/game/fairplay.js`) pays `AWARDS.boatride` = 6 paws with the toast `What a swing! ...  +6 🐾`. Six is what a treat or a greet pays, a short errand's worth, well under a game win (15) or a find (12). The first 2 rides of a walk pay (`BOAT_PAY_CAP`, keys `fair-boat-ride-1/2` in the discovery log, so a walk picked up again does not repay), so the most a walk gives is 12; later swings just swing. Each device credits only its own cat, so a partner is paid on her own device. Reduced motion changes only the swing's size, not the timing or the pay. No new save key: the type adds only an `AWARDS` feat tally (the lifetime count of paid rides).
- **Sound.** Existing audio helpers only: `pounceWhoosh` as the boat passes the bottom, `creak` at each end of the swing, quieter with distance, silent past 16 m or while it stands. No new files.
- **Reduced motion.** The swing tops out at 0.2 rad (about 11 degrees), with no ears-back.

## Where it stands

South-east of the coaster at (29, 38.5), below its south turn (moved there 2026-11-28 after owner feedback: at (31, 3) it stood in the middle of the coaster). More than 5 m from every metre of track, clear of the station, the trees and the paths; the loop tree at (33.5, 17.5) stays where it was. Footprint: frame feet at x 28.9 and 33.1, planks 5.8 by 8 m, ground the swing sweeps 5.6 by 10.9 m (nobody lands there). Colliders: four feet, the ticket post, and two circles for the hull at rest.

## How it is built

- Rules are pure: `src/fairsim.js` (constants `RIDE.BOAT_*`, seats `boat-seat-0|1`, `setBoat`, the board zone in `jumpTarget`, the swept ground, `awayFrom`). No THREE, no clock of its own; `createFairSim(area, { reducedMotion })`.
- Drawing: `poseRides` in `src/fairlive.js` sets `swing.rotation.x`; the ride camera sits still on the side she boarded from; creak and whoosh events.
- Model: `vikingBoat` in `src/world/fairrides.js`: three meshes (`boatFrame`, `boatHull`, `boatBulbs`), one hanging Group, `noMerge` like the other rides. The hull is one carved skin plus boxes, discs and carved head and tail.
- Cat two: `src/coop/rides.js` needed nothing; it seats her through the same `jumpTarget`.
- Tests: `test/fairboat.test.js` (swing shape, gentle top, pure clock, arc, boarding only when calm, two seats, off at every moment of the lap, clear of track, cat two, line once, sound, reduced motion), plus the pins in `test/fair.test.js`, `test/fairgames.test.js`, `test/fairsim.test.js`.

## Cost, measured

| | before | after |
|---|---|---|
| Fair chunk, gzip | 99.5 kB | 101.3 kB (ceiling 110) |
| Start-up | 676.2 kB | 676.3 kB (growth 0.1; one phrase) |
| Place triangles (bare build) | 68,572 | 70,619 (+2,047) |
| Place + show (high tier) | 74,278 | 76,325 (row 80,000) |
| Meshes / casters (bare) | 175 / 109 | 178 / 111 |
| Meshes / casters (merged) | 160 / 104 | 163 / 106 |
| Draws | | +3 main pass, +2 shadow pass |
| Couch fair scene (place + both cats) | 95,168 | about 97,215 (ceiling 99,950 unchanged) |

Rows in `area-budgets.json` (250 meshes, 180 casters, 80,000 triangles) hold unchanged.

## Pictures

`tools/verify/verify-viking-boat.html` (shots `boat-site`, `boat-rest`, `boat-mid`, `boat-top`, `boat-head`, `boat-aboard`, `boat-aboard-top`; `?noboat` is the before; `?small` is reduced motion; `?mood=dusk`), read headless with `scripts/record-page.mjs`. Stored in `tools/verify/viking-boat-pics/`.
