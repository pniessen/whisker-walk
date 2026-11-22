# Device profiles: phone, tablet, laptop, tv

Status: design for owner approval (2026-11-22). Plan: `docs/superpowers/plans/2026-11-22-device-profiles.md`.
Audit data comes from branch `device-audit` (a Haiku agent is filling the grid; this doc links to it and does not repeat it).
Builds on TV mode (`src/tvseam.js`, `src/tv/*`) and the controller layer (`src/gamepad*.js`).

## Why
Four things each decide "what device is this?" on their own, and they can disagree:

| Today | Where | How it decides |
|---|---|---|
| Touch UI | `main.js` `isTouch = detectTouch()` (`ui/touchui.js`: `(pointer: coarse)`), upgraded once by `onFirstTouch`; mirrored as `body.touch-mode`; `getIsTouch` passed to about 14 files | pointer type, one-way upgrade |
| CSS layout | `src/style.css`: `@media (pointer: coarse)`, `max-width: 900/600/480`, `max-height: 500`, plus `body.touch-mode` rules | media queries and the body class (these two can disagree on a hybrid device) |
| TV mode | `html.tv` set by `src/tv/index.js` `start()`; `tvState.on`; `tvWanted()` for `?tv=`; `watchForTv`/`padOnBigScreen` for the offer | setting or `?tv=`, and a never-automatic offer |
| Pad | `gamepad.js` (pad picked in `pick()`), `tv/input.js` sets `body[data-input]` = pad / touch / keys | last real input |
| Pixel ratio | `main.js`: `coarse ? 1.5 : 2` cap (home base only) | `(pointer: coarse)` again |

Hardware tier is a different thing and stays as it is: `render/deviceprofile.js` (iOS app model/thermal) and `render/quality.js` rungs. To avoid a name clash the new module is called the **layout profile** (`src/profile.js`), and "device profile" in code still means the hardware one.

## Decisions
1. **One module, `src/profile.js`**, no imports, about 0.6 kB gzipped. It decides the layout profile `phone | tablet | laptop | tv`, sets `html.phone|tablet|laptop|tv` (exactly one), exposes `getProfile()` and `onProfile(fn)`, and keeps `html.tv` as the TV class so every `html.tv` rule keeps working.
2. **One table of design values** per profile (below). Start-up holds only the small numeric table the JS needs. Per-profile CSS is plain CSS custom properties on the four `html.<profile>` classes plus, for TV and tablet-only layouts, lazy CSS.
3. **One input layer**: prompts come from a table keyed by input (`touch | keys | pad`), extending the `padwords.js` / `glyphs.js` / `body[data-input]` machinery rather than inventing another.
4. **Phone and laptop are pinned**: with no override they must look and behave as they do today (tests below).
5. **Audit before change**: no layout change for tablet or TV round 2 without a measured defect in the `device-audit` grid.

## 1. Deciding the profile (`src/profile.js`)
Inputs (all read once and on `resize`, `orientationchange`, pad press and first touch):

| Signal | Source |
|---|---|
| primary pointer | `matchMedia('(pointer: coarse)')`, plus the existing first-touch upgrade |
| shortest side | `min(innerWidth, innerHeight)` in CSS px |
| controller is the active input | tvState.input === 'pad' (set by `tv/input.js`) or `onPadUse` |
| override | Settings "Screen layout" (auto, phone, tablet, laptop, tv) saved as `profileOverride`; `?profile=` for this page load only, never saved |
| legacy override | `?tv=1` forces `tv`, `?tv=0` forbids it; `settings.tvMode` forces `tv`; both keep their meaning |

Rule (first match wins):

| # | Condition | Profile |
|---|---|---|
| 1 | `?profile=X` | X |
| 2 | `?tv=1`, or `settings.tvMode`, or (tv chunk on) | tv |
| 3 | `settings.profileOverride` is not auto | that value |
| 4 | coarse pointer and shortest side < 600 | phone |
| 5 | coarse pointer and shortest side >= 600 | tablet |
| 6 | otherwise (fine pointer) | laptop |

Details:
- **Pad is not a profile on its own.** A pad on a laptop switches the *input table* (glyphs) and unlocks the TV *offer*, never the layout. TV stays opt-in (owner decision 4 of the TV design: never silently automatic). So "controller is the active input" feeds the input layer and the offer; it moves the layout only through the tv switch.
- **Shortest side, not width**: a phone in landscape (844 wide) is still a phone. Threshold 600 matches the existing `max-width: 600` rule and sits between a Plus-size phone (428) and an iPad mini (744 portrait).
- **Hysteresis**: the profile is recomputed on `resize` debounced to one animation frame, and a change inside one gesture (keyboard opening, rotation) is ignored unless it lasts 300 ms. Changes mid-play only swap the class and CSS variables; no walk, camera or state is rebuilt, and the profile never reloads a chunk except when tv turns on or off (already live today).
- **Fine pointer + touch events** (iPad with a keyboard or trackpad reports `fine` on some setups; touch laptops): coarse stays sticky once seen, as `isTouch` is now. iPad with keyboard therefore stays tablet when `maxTouchPoints > 0` and the shortest side >= 600 (add `maxTouchPoints > 0` to rule 5 and treat it as touch).
- **Compatibility seam**: `isTouch` in `main.js` becomes `getProfile() === 'phone' || 'tablet'` or the first-touch flag; `body.touch-mode` is kept (set from the same place) so the 110 `touch-mode` CSS rules do not need to move in the first milestones.

### Migration of existing code

| Existing | Change |
|---|---|
| `main.js` `coarse` pixel-ratio cap, `isTouch`, `onFirstTouch`, `body.touch-mode` | read `getProfile()`; behaviour identical for phone/tablet/laptop |
| `tvseam.js` `tvWanted`, `watchForTv`, `padOnBigScreen`, `bigScreenFullscreen`, `noTouch` | unchanged logic; `noTouch` uses the module's touch flag; `tvWanted` stays the `?tv=` parser |
| `tv/index.js` adds `html.tv` | calls `setProfile('tv')`; removing restores the computed profile (never leaves no class) |
| `tv/scale.js` `--tv-s`, `--tv-safe-*` | stay; they become the tv column of the values table |
| `homebase.js` `getIsTouch()` consumers (about 14 files) | unchanged signature in M0; moved to `getInput()` / `getProfile()` file by file later |
| `?tv=0/1` | still win, still never saved; `?tv=0` also blocks the saved tvMode as it does now |
| `style.css` `body.touch-mode`, `@media (pointer: coarse)` | untouched in M0 to M2; phone/laptop rules migrate to `html.phone/.laptop` only when a test pins the computed styles |

## 2. Table of design values (one source)
JS file `src/profilevalues.js` (numbers only, in start-up; target <= 0.8 kB gz) mirrors CSS custom properties on `html.<profile>` in `style.css` (phone, tablet, laptop; four values each) and in `tv/tv.css` (tv). A test asserts the JS table and the CSS variables agree.

| Value | phone | tablet | laptop | tv |
|---|---|---|---|---|
| min text size (px, computed) | today's (pinned) | 14 | today's (pinned) | 24 body, 20 small (floors, `fonts.css`) |
| tap / focus target min (px) | 44 | 48 | today's | 64 (`calc(64px * --tv-s)`) |
| spacing step (px) | today's | 1.25x today's | today's | `--tv-gap`, `--tv-gap-l` |
| safe margin | `env(safe-area-inset-*)` | same | 0 | 5vw / 5vh |
| messages at once (`MAX_TOASTS`) | 1 (was 2; phone cleanup M3) | 2 | 2 | 1 (`TV_MAX_TOASTS`) |
| toast timing | `toastLifeMs` | same | same | `tvToastTiming` 2.5 to 5 s |
| goals | collapsed pill | list | list | list, big |
| minimap `--map-size` | 110 px (today's) | 160 px (new, M4) | 150 px | `min(220px*s, 36vw)` |
| camera FOV (base) | 70 | 70 | 70 | 70 (open: wider, see Q5) |
| default zoom step | 1 | 1 | 1 | 1 |
| pixel ratio cap | 1.5 | 1.5 | 2 | pixel budget in `adaptquality.js` |
| quality start | `deviceprofile.js` table | same | high | high, step down under budget |
| fps target | 60 (30 last resort) | 60 | 60 | 60 |

"Today's (pinned)" means the cell is the current behaviour and a test fails if it changes. The three new values (tablet text 14, tablet map 160, phone one message) are the only intended changes before tv round 2.

Camera FOV and zoom live in `main.js` (`PerspectiveCamera(70)`, widening to 77 for zoomies) and `camzoom.js` (4 steps, step 1 = 4.5 m back). The table adds a per-profile default step only; the step stays a per-device setting.

## 3. One input layer
Today: text tokens (`⟦cross⟧`) and `padText/padFix/padHtml` in `tvseam.js`, `tv/padwords.js`, `tv/glyphs.js`, `tv/input.js`, plus touch/keys copy in `hints.js`, `tutorialwords.js`, and `how-keys` / `how-touch` spans toggled by `body.touch-mode`.

Plan: `src/promptkeys.js`, a table `id -> { touch, keys, pad }` for the shared prompts (interact, pounce, camera, pause, zoom, confirm, back), resolved by `body[data-input]`. In the first step it only wraps existing lines (no new copy); `how-keys/how-touch` CSS toggles move to it later. Glyph art stays in the tv chunk (`glyphs.js`); touch icons stay in `touchui.js` and `pawicon.js`. Word sets (Warrior Cats on/off) still resolve through the existing set-aware lookup.

## 4. Audit grid
Source: branch `device-audit` (about 25 screens x 4 profiles; cell = pass or defect with a measured value). Screens expected: launch, home base (four tabs), cat slot row, Settings, Skills, Journal, Den shop, dressing room, cat builder, clan pick, Change place map, place card, visit milestone, trip summary, pause card, walk HUD (goals, hint, toasts, prompt, minimap), touch controls, fight sheet, gateway / border / confirm dialogs, fairground, market, house. This doc only *uses* the grid: every milestone below names the grid rows it fixes, and a milestone is done when those cells are pass.

## 5. Test matrix
Fixed viewports: phone 390x844, tablet 1180x820, laptop 1440x900, tv 1920x1080 and 3840x2160 (tv at 2x device pixel ratio check: 3840x2160 at DPR 1).

| Check | How | Applies to |
|---|---|---|
| profile decision table | unit test of `profileFor({pointer, shortSide, tv, override, query})`, every row of the rule table, plus hysteresis | all |
| computed-style floors | jsdom cannot lay out; use the existing `scripts/smoke.mjs` / browser pass to read `getComputedStyle().fontSize` for a fixed selector list; floors 24/20 on tv, 14 on tablet | tv, tablet |
| overflow | `scrollWidth <= clientWidth` and no element `getBoundingClientRect()` outside the safe box on each screen | all |
| pinning phone/laptop | golden file: computed style of about 60 selectors at 390x844 and 1440x900 recorded on main before M0; test fails on any diff; plus a unit test that with no override and a default save `profileFor` is phone or laptop and `html.tv` is absent | phone, laptop |
| values table agreement | JS table equals CSS custom properties | all |
| budget | `test/buildsize.test.js` (start-up <= 720), `scripts/buildjson.mjs` lazy-chunk guard; a new test that `src/profile.js` + values table are under 1.5 kB gz together | build |
| picture sheet per release | one screenshot per screen per viewport into a contact sheet for the owner (the existing `scripts/record-page.mjs` / smoke path) | release |
| legacy | `?tv=1`, `?tv=0`, saved `tvMode`, offer rule (`test/tvseam.test.js`) unchanged and green | tv |

## 6. Order of work

| M | What | Profiles touched | Visible change |
|---|---|---|---|
| M0 | `profile.js`, values table, classes, Settings override, `?profile=`, pinning tests, seam to `isTouch` | none | none (classes only) |
| M1 | Audit lands (`device-audit`), defects triaged to milestones | none | none |
| M2 | Phone cleanup: one message at a time, goals pill collapsed, corner map smaller; done before skill badges | phone | yes |
| M3 | Tablet pass: bigger map, side-by-side menus, 14 px text floor, 48 px targets | tablet | yes |
| M4 | Fold TV round 2 into the table (clan pick, dialogs, map labels, summary card; the 110 `html.tv` rules take their sizes from variables) | tv | yes |
| M5 | Two-cat couch mode (later, separate design) | tv | later |

### Two-cat couch mode (outline only, later)
Two cats in one area, two pads, built on the tv profile. Open design point: **shared camera** (one chase camera framing both; simple, cheap, breaks when cats part) versus **split screen** (two cameras, half height each; doubles draws, so the pixel budget in `adaptquality.js` drops a rung per half). Constraints already in place: `gamepad.js` `pick()` takes one standard pad (activeIndex) and `createPlayer` is single; both must become per-player first. Owner decision 2 of the TV design ("nothing here may make two pads impossible") holds. Not designed here.

## Start-up budget
Start-up is 709.7 kB gzipped against a 720 ceiling (headroom 10.3 kB; the latest commit message on main says 709.4, so M0 measures it first). The ceiling is not raised for this work.
- `profile.js` plus values table: target <= 1.5 kB gz together (one 24-line module and a frozen object).
- No layout code in start-up beyond that. Tablet-only layouts (side-by-side menus, bigger map) are CSS under `html.tablet` in `style.css` (about 1 kB, small enough to stay) or, if over 2 kB, a lazy stylesheet loaded when the profile is tablet. TV CSS stays in `tv/tv.css` (15.8 kB raw) in the tv chunk.
- Stop and re-plan if start-up passes 712.0 kB after M0, or 715.0 kB at any point.
- Chunks that must not change: fairground (95.8 / 100 kB), area chunks.

## Files expected to touch

| File | Change |
|---|---|
| `src/profile.js` (new) | decision, classes, `getProfile`, `onProfile` |
| `src/profilevalues.js` (new) | numeric table |
| `src/settings.js` | `profileOverride` (enum auto, phone, tablet, laptop, tv), sanitised like `quality` |
| `src/main.js` | pixel ratio cap, `isTouch`, first-touch, `?profile=`, `tvLoader` hand-off |
| `src/tvseam.js`, `src/tv/index.js`, `src/tv/scale.js`, `src/tv/input.js` | route class and input through the profile module; no logic loss |
| `src/ui/touchui.js` | `detectTouch` becomes a thin wrapper |
| `src/ui/hud.js`, `src/ui/toastlife.js` | per-profile `MAX_TOASTS`, goals pill (M2) |
| `src/ui/minimap.js`, `src/ui/hometabs.js`, `src/ui/homebase.js` | map size, side-by-side layout (M3), Settings row for the override |
| `src/style.css` | custom properties per profile; phone/tablet rules; `touch-mode` rules migrate last |
| `src/tv/tv.css`, `src/tv/fonts.css`, `scripts/tvfonts.mjs` | M4 |
| `src/promptkeys.js` (new), `src/hints.js`, `src/tutorialwords.js` | input table (small, after M2) |
| `test/profile.test.js`, `test/profilevalues.test.js`, `test/profilepin.test.js` (new), `test/tvseam.test.js`, `test/buildsize.test.js` | tests |
| `scripts/buildjson.mjs` | only a guard that `profile.js` is in start-up and tablet CSS stays small; ceiling unchanged |

## Risks

| Risk | Handling |
|---|---|
| iPad with keyboard/trackpad reports fine pointer | `maxTouchPoints > 0` counts as touch; shortest side >= 600 gives tablet; override in Settings |
| Mac with a pad attached | stays laptop; the pad changes glyphs and enables the offer only |
| External monitor / window dragged between screens | recompute on resize; tv needs the switch, so a 4K monitor never becomes tv by itself |
| Rotation | shortest side is rotation-proof; keyboard-open resize on phone ignored by the 300 ms rule |
| Resize mid-play | class swap only; walk state untouched; test by resizing across 600 px in a walk harness |
| `touch-mode` and profile disagree | one writer (profile.js) for both |
| `?tv=0` vs saved tvMode vs override | order in the rule table; tests for every pair |
| Name clash with `render/deviceprofile.js` | named "layout profile"; file `profile.js` |
| Start-up budget | numbers above; guard test |
| Phone cleanup makes phone differ from "pinned" | pinned golden file is updated only in M2, in the same commit, and shows the diff |
| Tablet looks different on the iOS wrapper (WKWebView) | check in the iOS simulator; not verified here |

## Rollout
Every milestone is its own branch and merge, behind no flag except M0's invisible change. M0 ships first and soaks (classes only). M2 to M4 each ship with the picture sheet. Rollback is a revert of one merge; the Settings override ("Auto") is the user-level escape hatch. Save format, cloud save and database are not touched (one new localStorage settings key, per device).

## Open questions for the owner (6)

| # | Question | Recommended |
|---|---|---|
| Q1 | Should a controller ever switch the layout to tv by itself? | No. Keep the offer; tv stays opt-in. |
| Q2 | Phone shows one message at a time (today 2)? | Yes, with the kids' reading time kept (3 s minimum). |
| Q3 | Show the Settings "Screen layout" override to everyone, or behind a grown-up row? | Everyone, under Sound & controls, default Auto. |
| Q4 | Tablet min text 14 px and 48 px targets: OK as the floor? | Yes; check on a real iPad before M3 ships. |
| Q5 | Wider camera view (FOV or zoom step 2) on tv? | Not yet; look at pictures from M4 first. |
| Q6 | Should two-cat couch mode be split screen or a shared camera? | Shared camera first; split screen only if the cats part too often. |

## Could NOT verify
- Real behaviour of `(pointer: coarse)`, `maxTouchPoints` and `(hover: none)` on an iPad with a keyboard, in the iOS WKWebView, and on a Mac with a pad (no devices here).
- The exact current start-up size (709.7 given by the owner; 709.4 in a commit message; no build run in this session).
- The `device-audit` grid contents and any measured text sizes (not read).
- Whether 600 px is the right phone/tablet cut on an iPad in Split View (about 320 to 507 px wide windows would read as phone; probably right, untested).
- Camera FOV and zoom behaviour per profile on a real TV.
- That the 110 `body.touch-mode` rules and the `@media` rules always agree after the migration; the pinned golden file is what will say so.
