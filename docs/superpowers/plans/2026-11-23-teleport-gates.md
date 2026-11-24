# Teleport gates: plan

Spec: `docs/superpowers/specs/2026-11-23-teleport-gates-design.md`. Concept pictures: `verify-teleport-gates.html`. Builders: Sonnet by default, Haiku for look-ups and tests, Opus only for the final review. One or two builds at a time. Each milestone ends with a picture sheet (git add -f); run only the named test files per step, one full run at the end of M0, M3 and M5.

Sizes: S about 1 to 1.5 h and under 250 lines, M about 3 h and 250 to 600 lines.

## M0: spike (S to M). One gate pair between two existing places, behind a flag

- Files: `src/teleflag.js` (a `?gates=1` switch read at call time, like `lighthouseflag.js`); `src/gateways.js` (new fields `kind`, `suit`, `wake`, `edition`, `needWalks`, defaulted so no old row changes; `GATE_LOOKS` gains `'hollow'`); `src/teleport.js` (pure `isTele`, `teleStatus`, `teleHandoff`, `warm`); `src/game/walk.js` (read the flag for `gateEnds`, the swirl body in `walkOn`'s overlay, 1.2 s); one temporary pair `park-greenhouse` / `greenhouse-park` (both exist; the greenhouse also needs `?greenhouse=1`) in a placeholder look (one glowing hole mesh, no art); `world/gateway.js` placeholder look.
- Tests: `test/teleport.test.js` (status table, pure handoff, twin both ways), `test/gateways.test.js` (old rows unchanged, new validation).
- Shows the owner: a 5-frame picture of the swirl in and out, the prompt at phone width, the arrival, and the start-up delta in bytes (aim under 0.5 kB at this step).
- Exit: through and back works; closing the app on the far side starts there; reduced-motion fade works; nothing visible without the flag.

## M1: real gate art and prompts (M)

- Files: `src/world/telegate.js` (lazy; three looks `stonering`, `archway`, `hollow`, each at most 6 meshes / 480 triangles / 1 transparent draw; scrolled swirl disc; motes), `src/world/gateway.js` calls it; the Go through button (touch), pad `⟦confirm⟧`, TV `padText()`; phrases `tele.*` in the later table plus everyday overrides (`offclanwords.js`); card variant in `gatecross.js`.
- Tests: look budgets, phrases in both sets, no series words in the everyday set, banned-word scan, `UPDATE_OFF_SNAPSHOT=1` once, tap-size and pad order.
- Shows: the three looks in a real place at day and dusk, awake and dormant; phone, pad card and TV card. The owner picks the look per gate here.
- Exit: the spike pair redrawn in the chosen look; start-up delta quoted (target under 0.8 kB overall).

## M2: suit auto-wear and the return outfit (S to M). Needs `suit-kit-m0` merged

- Files: `src/suithook.js` `effectiveWear` read by the walk and avatars; `teleHandoff.suit` from the row; first-arrival suit-up montage from `suitkit.js`; toast `tele.suit`; `warm` also imports the kit.
- Tests: saved wear byte-identical after a round trip; Hagrid gets the helmet only; remote cats drawn suited by place; no suit id in a save, a code or `sanitizeWear` output.
- Shows: one suited arrival per look, a before / after outfit sheet, reduced motion.
- Exit: the spike pair can show either suit look; no new saved field.

## M3: Moon hand-off (M). Needs the Moon place from the suit design

- Files: rows `pines-moon` and `moon-pines` (look `stonering`, `suit: 'space'`, `needWalks: 2`, `edition: 'all'`, arrive spots from a map picture); the Pines Meeting Ring drawn by `telegate`; the Moon's return ring; `COOP_READY.moon` stays false (couch refusal line); budget rows; host spot clear of the Old Ash, the Watch Rock and every flat-trace route.
- Tests: Pines and Moon flat traces unchanged; Pines budget passes; `needWalks` equals `CATALOG.areas.moon.requires.walks`; a golden mouse within sight of the arrival (pure distance test); room walk-on accepts the moon via.
- Shows: the ring at dusk, a swirl to the Moon, the arrival in the helmet, home again.
- Exit: the Moon is reached and left, a room goes together, phone and pad checked.

## M4: Ocean (Reef) hand-off (M). Needs the Reef place

- Files: rows `seaside-reef` and `reef-seaside` (look `hollow`, `suit: 'dive'`); the pier-foot cleft by `telegate`, inside the allowance the dive design gives the pier door; the Reef's return arch.
- Tests: Seaside budget passes; Seaside spots and golden mice unchanged; no `waters` change; guest loaner path.
- Shows: the pier foot day and dusk, the blue swirl, the arrival, home.
- Exit: as M3 for the Reef.

## M5: map marks and unlock (M)

- Files: `src/worldmap.js` (`TELE_LINKS` derived from the gate table, gate marks, two destination pennants, card line "Find the gate in <host>"); lazy map code for the dotted curves; `teleStatus` wired to walk and map ("Go there" starts a walk at the destination gate); the wake beat, the journal line, the discovery credit, the hum / twinkle hook shared with found outfits; the pair-count cap test.
- Tests: map marks only for existing gates, hit areas at least 44 px, pad focus order, wake pays once, journal line in both sets, the map card never says "Get it?" for a price-0 gate place.
- Shows: the world map with gates in every state (dormant, awake, found, destination hers), a journal page, the wake in 4 frames with and without reduced motion.
- Exit: both pairs live; remove `?gates=1` (keep only for the spike pair or delete it); full suite and a deploy check.

## After M5 (not planned here)

Couch co-op readiness per destination, a gate garden hub if gates pass six, more destinations the owner names, a gate sound pass, TV-mode polish.

## Risks and rollback

- Everything is lazy and every row needs a catalog row: reverting is dropping the rows. The spike flag keeps it off in production until M5.
- Start-up weight is the one hard cap: the build script prints the delta each milestone and a milestone that takes the total past 1 kB stops and reports.
- Dependencies: M2 waits for `suit-kit-m0`, M3 and M4 for their places; M0, M1 and the map work of M5 do not.
