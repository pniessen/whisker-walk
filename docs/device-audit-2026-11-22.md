# Device audit: every player screen on four device profiles (2026-11-22)

Read-only audit on branch `device-audit`. No source file was changed.

## Method and limits

- **Screens** were listed from the UI code: `index.html` (splash), `src/ui/*` (home base, hud, touchui, denshop, dressingroom, catbuilder, confirmcard, minimap, etc.), `src/game/walk.js` (pause, summary, moments), `src/tv/*`, and `src/style.css` / `src/tv/tv.css`.
- **Profiles**: phone 390x844 touch, tablet 1180x820 touch, laptop 1440x900 keyboard+mouse, TV 1920x1080 and 3840x2160 with pad (`html.tv`).
- **Device branches in code**: touch is decided once at boot by `matchMedia('(pointer: coarse)')` (`src/ui/touchui.js:24-30`, `src/main.js:182-187`), with an upgrade on the first real touch (`src/main.js:412`). `body[data-input]` (`src/tv/input.js:27`) picks pad, touch or keys words. TV scale is `--tv-s` = 1 to 1920 px, 2 at 3840 (`src/tv/scale.js:7-9`).
- **Floor used here**: 12 px for any text a player reads on phone, tablet and laptop. The TV floor is 24 px (`src/tv/fonts.css` header; grown-ups' sheets 20 px).
- **Pictures** were taken with the Browser pane against the Vite dev server on port 5201 (stopped afterwards). They are in `/private/tmp/claude-501/-Users-pniessen-CLAUDE-CODE-projects-cat-game/1f62dfc3-a1ae-4ade-b4ef-152843c7faf6/scratchpad/device-audit/`:
  - `phone-home.jpg`, `phone-pause-card.jpg`, `phone-walk-hud.jpg` (phone, touch confirmed)
  - `phone-ready-card.jpg` (phone, shows keyboard words: taken before a reload, so the touch boot had not run; not a finding)
  - `tablet-pause-card-emulation-no-touch.jpg` (tablet preset did not expose touch or `pointer: coarse`, so the keyboard words are an emulation artifact; tablet cells are not verified)
  - `tv-1920-pause-card.jpg` (TV 1920x1080, `?tv=1`; measured, see D1)
  - `laptop-home.jpg` (laptop-size home base)
- **Not pictured**: 3840 TV, fights, dress-up, den shop, cat builder, Fairground, Market, Old House, confirm cards, letter picker, Change place map. Those cells are `unknown` unless the code alone settles them.
- Status key: **ok** (checked in code or picture), **defect** (named, with file:line), **unknown** (needs a picture), **n/a** (the profile never shows it).

## Screen grid

| # | Screen (code) | Phone 390x844 touch | Tablet 1180x820 touch | Laptop 1440x900 kb+mouse | TV 1920 / 3840 pad |
|---|---|---|---|---|---|
| 1 | Boot splash (`index.html` inline script, `#splash`; `tv.css` splash rules) | unknown | unknown | unknown | ok at 1920 by code (logo 310 px x `--tv-s`, word 75 px, edition 30 px); 3840 unknown |
| 2 | Welcome back card (`pauseCardFor`, `walk.js:2788`; copy `walk.js:237`) | ok (`phone-pause-card.jpg`: centred, view chips, hint box) | unknown (no touch in emulation) | unknown | defect: key list clipped, see D1 |
| 3 | Home again card (same card path, `walk.js:3283`) | unknown | unknown | unknown | unknown |
| 4 | Pause card, Esc / pause button (`walk.js:2788`, `tv.css:164-181`) | ok (same picture) | unknown | unknown | defect: D1 (same card) |
| 5 | Summary card (`walk.js:3149`; `style.css:959`; `tv.css` summary sizes) | unknown | unknown | unknown | ok by code (title 52 px x `--tv-s`) |
| 6 | Home base hub (`homebase.js`; `style.css:623` 900 px cap; `:1009` phone padding) | ok (`phone-home.jpg`: cards, Explore bar, no overflow) | defect (minor): hub stays a 900 px column, D6 | ok (`laptop-home.jpg`) | unknown |
| 7 | Menu sheet (`hb-tiles`, `style.css:2049-2054`; widen at 1000 px, `:2149-2171`) | unknown | ok by code (1000 px rule applies at 1180) | ok by code (1240 px wide) | unknown |
| 8 | Change place sheet and world map (`wm-card`, `style.css:1910-1918`; `.hb-places` grid `:2095-2171`) | unknown | ok by code (2 columns from 900 px) | ok by code (3 columns from 1400 px) | unknown (3 columns at 1920, map scale not checked) |
| 9 | Settings sheet (`settings-row` `:742`; `settings-group` `:814`) | defect: group headers 11 px, D4 | unknown | ok by code (760 px panel, `:2162`) | ok by code (`tv.css` settings rows 26 px x `--tv-s`) |
| 10 | Dress-up store (`dressingroom.js`; `.dr` `style.css:1437`; labels `:1508-1588`; phone layout `:1934-2005`) | defect: labels 10-11 px, D3 | defect: 1080 px cap on landscape tablet, D5 | ok (1080 px centred, a little empty) | unknown (`tv.css` 1700 px x `--tv-s` cap) |
| 11 | Cat builder (`catbuilder.js`; `.cb-*` `style.css:2452-2463`; TV name button `tv.css`) | unknown (notes 13 px, meets floor) | unknown | unknown | ok by code (name opener 36 px, `tv.css` cb-name-open) |
| 12 | Den shop and spot picker (`denshop.js`, `denshopview.js`; `ls-card` in `tv.css`; hint `style.css:2233-2240`) | n/a for the hint; list unknown | unknown | ok (key hint shows on hover-capable pointers, D12) | ok by code (`ls-card` 640 px x `--tv-s`, items 76 px) |
| 13 | Walk HUD top: points, rank, area chip (`hud.js`; `style.css:38`, `.hud-top`) | ok (`phone-walk-hud.jpg`) | unknown | unknown | ok by code (`tv.css` hud-top 30 px) |
| 14 | Corner map and area caption (`minimap.js`; `--map-size` `style.css:38`; `tv.css` `html.tv`) | ok (`phone-walk-hud.jpg`: caption sits on the scene, legible) | unknown | unknown | ok by code (`tv.css` map-size 36vw cap) |
| 15 | Objective, goals and roster (`hud.js:113-119`; `tv.css` hud-goals 24 px) | unknown (not in picture; goal line 13 px, `style.css:104`) | unknown | unknown | ok by code (24 px floor) |
| 16 | Key strip, hint card, prompt (`hud.js:118` `KEY_STRIP`; `style.css:129-147`; `:267`) | ok (strip hidden on coarse, `style.css:283-285`; hint and prompt seen) | unknown | unknown (strip shown; chip kbd 12 px, D13) | ok by code (hint 30 px x `--tv-s`) |
| 17 | Toasts and stacked bottom bands (`style.css:242-262`, `:291-303`) | unknown (stack risk, D7) | unknown | ok | unknown |
| 18 | Touch control cluster: pounce, meow, photo (`touchui.js:75-77`; `style.css:469-505`) | defect: labels 10 px, D2 | unknown (labels shown only when `tui-labelled`) | n/a (hidden without touch) | n/a (`tv.css` hides `.touch-ui` under pad) |
| 19 | Chat tray (`style.css:1054`, `:1131-1170`) | unknown | ok by code (tray offset 138 px, `:1143-1147`) | unknown | unknown |
| 20 | Fight: pill and buttons (`fightui.js`; `style.css:681`, `:2598-2623`) | unknown (stack, D7) | unknown | unknown | ok by code (`fight-key` hidden on pad, `tv.css`) |
| 21 | Pan map: Change place pan (`mappan.js`, `territorymap.js`) | unknown | unknown | unknown | unknown |
| 22 | Clan pick and join moment (`clanpicker.js`; `.join-moment` `style.css:2145-2229`) | unknown (note 13 px, `:2198`) | unknown | unknown | unknown |
| 23 | Confirm dialogs (`confirmcard.js`; `.confirm-card` max 380 px, `style.css:1715`) | unknown (380 px card in 390 px screen, gutter D9) | ok by code | ok by code | unknown |
| 24 | Letter picker (`tv/letterpickerview.js`; `tv.css` `.lp-*`) | n/a | n/a | n/a | ok by code (9 x 80 px keys, `tv.css`) |
| 25 | Party banners and gifts (`party.js`; `style.css:2694`, `:2763`) | ok by code (15 px banner) | unknown | unknown | unknown |
| 26 | Journal, album, skills (`.cards` `style.css:638`; grid 260 px at 1000 px+) | ok by code (120 px cards) | ok by code | ok by code | unknown |
| 27 | Area walks: Fairground, Market, Old House (`fairlive.js`, `marketlive.js`, `housecats.js`) | unknown (not traced) | unknown | unknown | unknown |

## Defects

- **D1 TV pause card: the key list is cut off at 1920x1080.** `src/tv/tv.css:165` caps every `html.tv .screen-panel` at `100vh - 2 * 5vh` (972 px at 1080). The panel scrolls (`overflow: auto`), and the two-column `.controls-hint` (`tv.css:181`) runs past the bottom. Measured in the browser: panel bottom 1026 px, hint bottom 1068 px, so the last row (zoom) is below the fold. A sofa player cannot reach it with the pad. Fix: tighten hint padding and gap, or shorten the list. Cheap CSS.
- **D2 Phone walk action labels are 10 px.** `src/style.css:500-502` (`.tui-label`, `font-size: 10px`), shown by `.tui-labelled` (`style.css:505`) and written by `src/ui/touchui.js:76-77` ("meow", "photo", "pounce"). Visible in `phone-walk-hud.jpg`. Cheap CSS.
- **D3 Phone dress-up labels are 10-11 px.** `src/style.css:1508` (spin hint 11 px at opacity .45, low contrast), `:1525` (`.dr-label` 11 px), `:1548` (`.dr-slot small` 10 px), `:1573` (11 px), `:1584` (`.dr-pick` 11 px), `:1588` (`.dr-pick small` 10 px). Cheap CSS.
- **D4 Phone settings group headers are 11 px uppercase.** `src/style.css:814` (`.settings-group`). Cheap CSS.
- **D5 Landscape tablet: dress-up store capped at 1080 px.** `src/style.css:1437-1438` (`.dr { max-width: 1080px }`). The tablet-width rule at `:1933` covers only `max-width: 600px` or portrait up to 1100 px, so 1180 landscape keeps the 1080 px column. Cheap CSS (a `min-width: 900px` rule).
- **D6 Tablet home hub stays a 900 px column.** `src/style.css:623`. Sheets widen at 1000 px (`:2149-2171`), the hub does not. Low priority. Cheap CSS.
- **D7 Walk HUD bottom stacks on touch.** The prompt rises to 222 px (`style.css:303`), toasts to 292 px, the fight pill to 360 px (`:291-303`), the touch cluster covers 210 px, and the chat tray ends at 292 px (`:1054`, `:1131`). On a 844 px phone, a fight with a toast and the tray open leaves a narrow strip. Not seen in a picture. Needs a picture during a fight and a layout pass. Code work.
- **D8 TV pause card at 3840 is unverified.** `src/tv/scale.js:6-9` doubles the scale at 3840, and the panel and its list both double, so the clipping in D1 may repeat. Needs a picture.
- **D9 Confirm card at 390 px.** `src/style.css:1715` (`max-width: 380px`). The 16 px side gutter from the spec needs 358 px or less. Check the overlay padding. Cheap CSS if confirmed.
- **D10 Input mode is fixed at boot.** `src/main.js:182-187` and `src/ui/touchui.js:24-30` decide touch from `pointer: coarse` once. A tablet with a keyboard or a touchscreen laptop keeps keyboard words (`walk.js:237` "(click)") until its first touch. Code-level risk; needs a device check.
- **D11 Den shop hint is hover-only.** `src/style.css:2233-2240` shows the key hint only under `(hover: hover) and (pointer: fine)`. On TV and tablets it never shows, which is probably right, but there is no pad or touch equivalent. Low.
- **D12 Laptop key chip is small.** `src/style.css:182-184` (chip 13 px, kbd 12 px). Meets the floor, but tight on a 1440 screen. Minor.

## Ranked gaps (top 10)

1. **TV pause card list clipped at 1080p** (D1). Cheap CSS.
2. **Phone walk action labels at 10 px** (D2). Cheap CSS.
3. **Phone walk bottom stacks prompt, toasts, fight pill, chat tray and cluster** (D7). Needs code and a picture during a fight.
4. **Phone dress-up labels at 10-11 px** (D3). Cheap CSS.
5. **Landscape tablet dress-up capped at 1080 px** (D5). Cheap CSS.
6. **Phone settings headers at 11 px** (D4). Cheap CSS.
7. **TV 3840 layout unverified** (D8). Picture needed; may share D1's fix.
8. **Input mode fixed at boot on hybrid devices** (D10). Code plus a device test.
9. **Confirm card gutter at 390 px** (D9). Cheap CSS if confirmed.
10. **Tablet hub 900 px column** (D6). Cheap CSS, low value.

Tail items: D11 (hover-only den hint) and D12 (laptop chip size).

## Next steps

- Cheap CSS fixes: D1, D2, D3, D4, D5, D9, D6. Each is one rule in `src/style.css` or `src/tv/tv.css`. Not done here (read-only).
- Pictures still needed: 3840 TV, a phone fight with toasts open, confirm cards at 390 px, a real tablet (touch emulation missing from the tablet preset), Fairground, Market and Old House.
- The Browser pane's tablet preset does not set `pointer: coarse`, so tablet cells must be checked on a real device or with a touch-emulating harness.

## Milestone 1 (device profiles): defects mapped to milestones, and the measured HUD grid

Added on branch `device-profiles-m1`. The audit above is unchanged.

| Defect | Milestone | Status |
|---|---|---|
| D7 phone walk HUD stacks (toasts, goals, hint) | M2 phone cleanup | measured and fixed here (below) |
| D2 phone touch labels 10 px, D3 dress-up labels 10-11 px, D4 settings headers 11 px, D9 confirm gutter | later phone pass (not in M2 scope: the plan's M2 is HUD clutter) | open |
| D5 landscape tablet dress-up 1080 px cap, D6 tablet hub 900 px | M3 tablet pass | open |
| D1 TV pause card clipped at 1080p, D8 TV 3840 unverified | M4 TV round 2 | open |
| D10 input mode fixed at boot, D11, D12 | unscheduled | open |

`verify-hud-grid.html` (repo root, dev server) is the repeatable grid for the walking HUD: it mounts the real `createHud()` with the real `style.css` in an iframe per profile (phone 390x844, tablet 1180x820, laptop 1440x900) and four states (walk, hint, burst of discoveries, hint + objective + toasts), and prints the share of the screen the HUD boxes cover. The touch control cluster and the TV profile are not in it.

Share of the screen covered by the HUD (before -> after the phone cleanup; identical in both word sets):

| State | Phone before | Phone after | Tablet | Laptop |
|---|---|---|---|---|
| walk (points, rank, map, 3 goals) | 14.4% | 7.8% | 5.7% | 6.4% |
| hint card up | 14.0% | 11.9% | 9.0% | 8.4% |
| two discoveries in a row | 20.7% | 10.3% | 7.8% | 8.0% |
| hint + objective + toasts | 22.3% | 16.5% | 11.8% | 10.5% |

Tablet and laptop are the same before and after.
