# Split screen, S3: a HUD for each half (`?split=1`)

Builds on S1 (`docs/split-screen-s1.md`). Default off; without `?split=1` nothing here loads. Start-up 678.4 kB gzipped (S1: 678.3; +0.1 from three one-line seams); the new code is one lazy chunk, `splithud` (about 3.0 kB gzipped, CSS included, injected as a `<style>` when the split first comes up).

## What it does (`src/coop/splithud.js`, called from `splitview.draw` each frame)
- While the rule says active: `html.coop-split`, plus `coop-split-slide` (0 < t < 1) or `coop-split-full` (t = 1), and `--sp-t`. In shared mode no class, no element: the HUD is exactly as today.
- Crossfade over the 400 ms slide: the walk's own goal line, goals column, badge row and corner map fade as (1 - t) and are hidden at t = 1; the two half HUDs fade in as t. `fade()` reports the pair.
- Two containers, `#sp-hud-0` (cat one, left) and `#sp-hud-1` (cat two, right), inside the safe margins (`--tv-safe-x/y`, 5 % otherwise), type scaled by `--tv-s`. Each: its own corner minimap (second and third `createMinimap` instances, built from `session.minimapKit`, centred on its own cat, the other cat a dot), the goal line, the next goal and its "how" line (the goals column shows only the next unfinished goal, as on a phone), the badge row, and a low stack: toasts, finder chip, prompt slot.
- Cat two's goal line mirrors cat one's: a quest/objective is one per walk, as in couch play today (one goal line for both).
- Prompts: the existing per-slot elements of `src/coop/hud.js` move into their half (back when the split ends); `prompt(slot)` is unchanged. Toasts: `chipShow` now also passes the toast's text, a hook (`coop.chipHook`) lets the split HUD match the toast element to its finder and move it into that half; unowned toasts (the walk's own, "You both found") stay centred. The chip follows its finder.
- Global and untouched: pause card, Ready card, story/tally cards, world map (all in `#overlay`, z-index 10; the half HUDs are z-index 9), the guided-walk hint (kept centred, narrower, moved up under the rank pill), the rank/points row (centre), and the Reef's quest arrow. The coop key strips (`.coop-hints`) are held to a half each so they no longer run into each other at 1280x720.
- Seams added elsewhere: `coop.secondPos` (index.js, cat two's position), `session.minimapKit` (walk.js, documented in session.js), the `text` argument of `chipShow`.

## Picture
`tools/verify/verify-split-s3.html` (`?place=reef` for the Reef; drives the game with two fake pads, then puts a prompt in each slot and a find toast up). Sheet: `tools/verify/split-s3-contact.png` (top: 1920x1080 scaled to half, bottom: 1280x720; left Neighborhood, right Reef; `html.tv` on).

## Not verified / known
- No real pads or TV; headless Chrome on this Mac only. A toast for cat one while cat two's toast is up was only seen for cat two (the coop queue paces them).
- "+N" pops, hop rings and edge markers are still projected through cat one's camera (edge markers and rings are off in split; pops are not fixed). S4 or later.
- The divider line passes through the centre rank pill and the centred hint bubble.
- The Reef's quest arrow ("25 m") is a world-space HUD piece and shows in cat one's half only.
- Cat two is shown prompts exactly as routed today; no S5 "cat one only" rule yet.
- The second corner maps repaint at the minimap's own 30/s throttle, three canvases while split.
