# TV mode: couch play with a DualSense

Status: design for owner approval (2026-11-22). Plan: `docs/superpowers/plans/2026-11-22-tv-mode.md`.
Builds on the controller layer merged at 34112f3e (`src/gamepad.js`, `gamepadinput.js`, `gamepadnav.js`, `gamepadnavcore.js`).

## What it is
Full-screen play from a Mac plugged into a TV by HDMI, in Chrome, with the owner's Sony DualSense over Bluetooth. Nobody touches the keyboard, mouse or screen from start to finish. Everything reads from a sofa: bigger text, bigger HUD, button pictures instead of key names.

## Owner decisions (binding)
1. First delivery: Mac/laptop on HDMI in Chrome. iPad AirPlay / the iOS WKWebView is a later step (notes only).
2. One player, one cat, one pad. Nothing here may make two pads impossible later; nothing is built for two.
3. Cat-builder name entry is an on-screen letter-picker card that works for pad AND touch.
4. TV mode turns on from a Settings switch, plus an offer when a pad is used full-screen on a big display. Never silently automatic.
5. Offline-first: every TV file is in the precache, nothing is fetched at play time.

## Shape (decisions)
- **Own lazy chunk.** `src/tv/index.js` and everything under `src/tv/` load by dynamic `import()` only when TV mode is on. Start-up gets a seam of at most ~1.5 kB gzipped (`src/tvseam.js`: the on/off flag, `padText()` identity function, hook slots). Start-up is 703.5 kB against a 720 ceiling that is never raised; the build fails if the TV chunk lands in start-up.
- **One setting.** `tvMode` (boolean) and `tvOfferDeclined` (boolean) in `settings.js` (localStorage `whisker-walk-settings`, per device). Not in the save, not in the cloud save: no save migration, no cloud sanitiser change.
- **Look = CSS in the chunk.** `src/tv/tv.css` is imported by the chunk, so it loads with it. `html.tv` carries `--tv-s` (UI scale from window width: 1 at 1920 CSS px, up to 2 at 3840), safe margins `--tv-safe-x/-y` (5 %), and per-selector overrides. Nothing in `style.css` changes.
- **Words.** Pad wording lives in `src/tv/padwords.js`, one table keyed by the same ids as `tutorialwords.js`, resolved through a set-aware lookup (a word set may carry its own `PAD_LINES`, as it may carry `LINES`). Lines carry glyph tokens (for example `⟦cross⟧`); `padText()` turns them into inline SVG where the caller sets HTML and into plain symbols where it sets text. Both word sets are tested.
- **Glyphs follow the last input.** `body[data-input="pad|keys|touch"]` is set by the last real input. PlayStation glyphs for a Sony pad, Xbox glyphs for any other standard pad.
- **Quality.** A pixel budget (ceiling on drawn pixels) joins the existing rung cap in `adaptquality.js`; Auto still steps down below it.
- **Pause safety.** Pad disconnect, tab hidden or window blur while TV mode is on pauses the walk and raises a "controller disconnected" card.

## Anti-goals
- TV mode never turns itself on without a yes. "Not now" is remembered.
- No TV code, CSS or word table in start-up beyond the seam.
- Touch, mouse and keyboard play with TV mode off is byte-for-byte what it is now (seam functions are identity).
- No change to the live database, the save format, or the cloud save.

## Out of scope (noted)
iPad AirPlay and WKWebView pass-through; a second player; sound design for living-room volume (only a note: check master/music levels on the TV); text boxes for gift, friend, pair, join and sync codes (grown-up/online features, keyboard still needed).
