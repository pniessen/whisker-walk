# Holiday keepsakes build plan (2026-11-27)

Spec: `docs/superpowers/specs/2026-11-27-holiday-merch-design.md`. Follows the owner rules in force: milestones merge behind a flag (`?holiday=`, default on once the owner looks), Sonnet builds, Haiku checks, one full suite on the rebased branch before every merge, start-up growth reported.

## Files (new unless noted)
`src/holidays.js` (table, window helper, override, pure, no imports, clock passed in); `src/foundwear/holidaywear.js` (records, like gifts.js); `src/cat/holidaymeshes.js` (lazy chunk, mesh builders); `src/world/spots/holiday.js` (hand-placed find spots, per area); `src/holidaywords.js` (names, both sets); `src/ui/holidaybasket.js` (home line + dressing hint); edits to `src/progression.js` (catalog rows, `holidays` save field, rebuild, merge), `scripts/buildjson.mjs` (chunk entry), `test/budget.test.js` (row).

## Milestones and budgets (measured then set; planning figures)

| Milestone | Content | Start-up | Chunk `holiday` |
|---|---|---|---|
| H0 Calendar | `holidays.js` window helper, yearly recurrence, New-Year span, `?holiday=` override; unit tests with injected clock (leap year, 31 Dec, 1 Jan, DST, wrong clock) | +0.3 kB | none |
| H1 Save + catalog | `holiday:` prize rows, `holidays` bitmask, rebuild on load, cloud-merge union, shop/trade/code exclusion tests, sanitize hostile payload | +0.6 kB | none |
| H2 Winter Lights pieces | four meshes + names (both sets), dressing-room fit test, picture page `verify-holiday-winter.html` | +0.8 kB | about 2 kB |
| H3 Find + basket | basket line on home, one find per area in Neighborhood, Park, Farm, reach test with no skills, spawn clear, co-walk credit to both, reduced-motion pass | +1.0 kB | +0.5 kB |
| H4 Winter release pass | Haiku checks banned words and word-set structure; flat-trace fixture unchanged; iPad 7 smoke at lowest rung; owner picture look | none | none |
| H5 Harvest Moon, Spring Bloom, Summer Splash | 12 pieces data-only on the same machinery, three picture pages | +1.5 kB total | about +6 kB |

Totals planned: start-up about +4 kB of 720 (665.7 now, ceiling intact, allowance 5 kB), chunk about 9 kB of 100 kB. Budget row: `['holiday', buildHoliday, 12, 1, 9000]` pattern, measured then set at +12 percent.

## Tests per milestone
Window helper at every edge; save sanitize, cloud-merge union, no-loss on load; `prize` untouchable by shop, trade, redeem; every record fits (the `giftwearfit` pattern); find spots in bounds, off colliders, clear of spawn; co-walk agreement from the room seed; banned-word scan; `wordset` and `serieswords` tests; reduced-motion; pad reach. Focused tests per file plus `npm run build`; full suite once on the rebased branch before merge.

## Risks
A wrong or edited device clock only moves a window (nothing is lost). Winter window opens 1 Dec: if H3 is not ready, ship H0-H2 and a code-given set via `redeemcodes.js` as a fallback. Fairground and Market stay untouched (no budget room).
