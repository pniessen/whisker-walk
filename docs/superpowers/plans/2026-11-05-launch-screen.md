# Launch screen (Direction A) — plan

Spec: `docs/superpowers/specs/2026-11-05-launch-screen-design.md`. Branch `launch-a`.
UI only: the flat trace must not move.

## Task 1 — dressing-room model and markup (src/ui/dressingroom.js)
Tests first in test/dressingroom.test.js.
- `HOME_SHEETS` gains `menu` and `places`; `MENU_TILES` (together, colony,
  journal, album, skills, social) and `GROWNUP_SHEETS` (settings, sync, code);
  `SHEET_LABEL` reworded (Friends, Save).
- Model: `worn` list, `currentPlace.line` (`StormClan land`), `lockedCount`.
- `renderDressingRoomHtml`: top bar, hero + strip (`🔒 N more` toggle), Wearing
  summary / wardrobe, Today's walk card, dock. No pills, no count labels, no
  clan cards, no map on home.
- `renderPlacesSheetHtml(model, { clanLine, denHtml })`: map + more places + den
  (Clan), or cards + den (Legacy).

## Task 2 — controller (src/ui/dressingroomview.js)
Tests in test/dressingroomview.test.js, test/dressingroomcontroller.test.js.
- UI state: `wardrobe`, `moreCats` replace `pill`; actions `wardrobe`,
  `more-cats`; `setPill` removed. `builder-done` lands in the wardrobe.
- `placesHtml()`; `onPlaced(outcome)` callback after a place tap.

## Task 3 — home base (src/ui/homebase.js)
Tests in test/homebase.*.test.js.
- Header pills (points, rank, quiet visit pill, Menu); title not a button and the
  toggle handler removed.
- Menu sheet (stats, six tiles, grown-ups row) and Places sheet (clan line,
  den card); Back goes to the Menu for sheets opened from it.
- `show({ sheet: 'places' })` replaces `show({ pill: 'where' })` (main.js).
- Settings: an "Advanced" group (fps readout, graphics quality).
- Enter starts the walk on home.

## Task 4 — the clan moment (src/ui/clanpicker.js + homebase.js)
Tests in test/clanpicker.test.js and a new test/clanmoment.test.js.
- `clanMomentDue(state, catalog)` pure gate; `renderClanMomentHtml`.
- homebase mounts `#clan-moment` outside the root; queued behind the
  celebration, notice and news; seen flag in localStorage; pick → `pickClan`.

## Task 5 — styles (src/style.css)
- Rewrite the `.dr` block for the new layout (desktop grid, phone column,
  no scroll at 1280×800 / 390×844); HUD pills; pink only on Start.
- Menu tiles, places sheet, clan moment card, sheet header.
- Restyle Play together / Friends / Sync buttons to pills.
- verify-dressingroom.html follows the new markup.

## Task 6 — checks
Full suite, build, flat-trace sha, live tap-through (desktop + phone), after
shots and pairs, opus whole-branch review, merge main, rerun.
