# Suit kit, the Reef and the Moon: plan

**Spec:** `docs/superpowers/specs/2026-11-22-suit-dive-moon-design.md` (design for owner approval; nothing is built).
**Rule for every milestone:** its own branch off main, a worktree under `.worktrees/`, pictures for owner sign-off where the look changes, the full suite and `npm run build` green, start-up at most 710 kB gz (ceiling stays 720, never raised), no ceiling in `test/budget.test.js` raised for an existing place. Merge and push only after the owner's yes (or the standing autonomous-merge permission if he gives it for this work).
**Builder model:** Sonnet builds, Haiku for look-ups and tests, Opus for the final review (owner's routing note).

## Order

1. **M0 Seams** (small). `src/placephysics.js` (frozen table, no rows yet), pure `effectiveWear(equipped, place, suitLook)`, the suit-hook slot in `model.js` / `wearkind.js`, `kind: 'door'` on a `GATEWAYS` row and its dotted mark on the world map, catalog rows `reef` and `moon` present but not live, reserved phrase ids, banned-word scan helper.
   - Tests: start-up growth at most 1.0 kB gz; flat-trace and player traces unchanged for every existing place; gateways/areas tests accept the door kind; word parity both sets.
2. **M1 Suit kit.** `src/cat/suitkit.js` (lazy), `space` and `dive` palettes, `verify-suit.html` picture sheet (all cat shapes; stand, sit, hop; Hagrid's helmet). Owner approves from pictures.
   - Tests: per-piece gate (at most 4 meshes, 900/450, pack 1,200/600, shell no more than the Sweater, no ground clip in follow/perch/requestPet/nap); kit sum at most 1,100/600; glass is `noCast`; crowd of three; zero start-up growth.
3. **M2 Reef shell.** `src/world/reef.js` (empty seabed, fog, shimmer ceiling), loader and entry-module lines, the pier ladder and bubble column in `seaside.js`, suit-up ritual and first-visit locker line, `floatY` and the kick button, the air gauge, camera table.
   - Tests: area builds with no `waters`; spawn clear; door round trip (Seaside, Reef, Seaside); float-reach gate with no skills; gauge property test (no path to a bad state); banned-word scan over Reef phrases; Seaside rows re-measured, ceilings unchanged; budget rows 200/140/45,000 added.
4. **M3 Reef content.** Six pages and finds (`divefind`, 12 paws), collectibles, three golden mice (two at float height), `pearlcollar` and four spots, fish school, bubbles, turtle, crabs, air pockets, sound.
   - Tests: found-spot reach with `floatY`; mouse total 45; awards and tally; both word sets and fixtures; reduced-motion pass.
5. **M4 Moon shell.** `src/world/moon.js` (craters, ridges, lander and locker door), moonlight pool under the Old Ash in `pines.js`, low-gravity numbers (hop x4 / x2.45, climb x2, skip), Earth quad and 700-star field, space look, camera easing.
   - Tests: hop and climb gate on the Moon's own budget; landing-frame test (thump on the frame the arc ends); every other place's trace unchanged; door round trip; Pines rows re-measured; budget rows 180/120/40,000.
6. **M5 Moon content.** Six pages and finds (`moonfind`), pebbles, three golden mice (ledges at 2.6 and 3.0 m), `moonglasses` and four spots, quiet sound, optional bounce ball.
   - Tests: found-spot reach; mouse total 48; fixtures; reduced motion.
7. **M6 Polish and hand checks.** Owner picture sign-off, iPhone 18 reading (perf readout), DualSense pass, one co-walk through each door.

M0 to M3 can ship alone (diving only). The Moon follows as a second release.

## Not in scope

Selling the suit, saving it in outfits, a StarClan story, strays or ghosts in the new places, a general A-to-B teleport framework beyond these two doors, an underwater view in the open Seaside, changes to swimming or Sea Legs.
