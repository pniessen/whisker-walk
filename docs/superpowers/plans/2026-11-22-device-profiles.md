# Device profiles: implementation plan (notes)

Spec: `docs/superpowers/specs/2026-11-22-device-profiles-design.md`. Each milestone is its own branch, merged on its own. Every one ends with: `npm test`, `npm run build`, start-up kB recorded, picture sheet when the look changes.

Budget rule: start-up 709.7 / 720 kB gz at the start. Stop and re-plan above 712.0 after M0 or above 715.0 at any point. Ceiling never raised.

## M0 Profile module, nothing visible
- Record: golden computed styles (about 60 selectors) at 390x844 and 1440x900 on current main; start-up kB; fair chunk 95.8.
- Build `src/profile.js` (`profileFor`, `applyProfile`, `getProfile`, `onProfile`), `src/profilevalues.js`, settings `profileOverride`, `?profile=`.
- Wire `main.js` (`isTouch`, pixel cap, `touch-mode` single writer) and `tv/index.js` (`setProfile('tv')`).
- Tests: `profile.test.js` (every rule row, overrides in every pair with `?tv=`, hysteresis), `profilevalues.test.js` (JS table equals CSS variables), `profilepin.test.js` (golden: phone and laptop unchanged, no `html.tv`), `tvseam.test.js` green, `buildsize.test.js` (profile + values <= 1.5 kB gz).
- Budget check: start-up delta <= 1.5 kB.

## M1 Audit
- Merge or read `device-audit`; map each defect cell to M2, M3 or M4; owner gets the grid.
- Tests: none new; the grid is the baseline for the picture sheet.

## M2 Phone cleanup (before skill badges)
- One toast at a time on phone (`MAX_TOASTS` by profile), collapsed goals pill, smaller corner map; `html.phone` rules in `style.css`.
- Update the golden file in the same commit; show the diff.
- Tests: toast cap per profile (`hud.test.js`), overflow at 390x844 on HUD states (hint, objective, fight), floors, golden diff reviewed.
- Budget check: CSS growth <= 0.5 kB gz.

## M3 Tablet pass
- `html.tablet`: map 160 px, side-by-side menus (home base tabs, Settings, Skills), 14 px text floor, 48 px targets.
- Tests: computed floors at 1180x820, overflow, laptop and phone goldens unchanged.
- Budget check: tablet CSS <= 2 kB gz, else lazy stylesheet.

## M4 TV round 2 into the values table
- Take the findings of `2026-11-22-tv-clutter-round2.md` (clan pick, dialogs, trip summary, Change place map, home base, unlock flow) and express sizes through the profile variables; one TV dialog card.
- Tests: floors 24/20 at 1920x1080 and 3840x2160, no horizontal overflow, safe-margin clipping check, pad navigation of the map.
- Budget check: tv chunk only; start-up unchanged.

## M5 Two-cat couch mode
Separate design first (shared camera vs split screen, per-player pad pick in `gamepad.js`, `createPlayer`).
