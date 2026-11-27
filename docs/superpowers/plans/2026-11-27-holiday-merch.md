# Holiday keepsakes build plan (2026-11-27, revision 3)

Spec: `docs/superpowers/specs/2026-11-27-holiday-merch-design.md` (decisions D1 to D29). Owner rules in force: milestones merge behind a flag (`?holiday=`, default on only after the owner looks), Sonnet builds, Haiku checks, one full suite on the rebased branch before every merge, start-up growth reported, never raised ceilings.

## Files (new unless noted)
`src/holidays.js` (windows, the Hanukkah first-night table, `nightOf`, override, pure, clock passed in); `src/foundwear/holidaywear.js` (records); `src/cat/holidaymeshes.js` (lazy chunk); `src/world/spots/holiday.js` (finds and decor spots); `src/world/holidaydecor.js` (lazy per-area decor, merged and instanced); `src/holidaywords.js` plus entries in both word sets; `src/ui/holidayflair.js` (lazy, home and menu); edits: `src/progression.js` (catalog rows, `holidays` save field, shop shelf rule), `src/settings.js` (`holidayDecor: 'auto'|'christmas'|'hanukkah'|'off'`), `src/ui/homebase.js` and the menu sheet (hook and Settings row), `scripts/buildjson.mjs` (chunks), `test/budget.test.js` (rows).

## Milestones and budgets (planning, measured then set at +12 percent)

| Milestone | Content | Start-up | Lazy |
|---|---|---|---|
| H0 Calendar | `holidays.js`: fixed windows, 10-year Hanukkah table checked against two published calendars, `nightOf`, 2036+ fallback, table-covers-the-years test, `?holiday=` and `&night=`; edge tests (31 Dec, 1 Jan, 2027's New-Year span, DST, wrong clock) | +0.4 kB | none |
| H1 Save, catalog, shelf | `holiday:` prize rows, `holidays` bitmask, rebuild on load, cloud-merge union; seasonal shop shelf (shop shows a row only in its window plus the week before; owned items always usable); prize and shop exclusions | +0.8 kB | none |
| H2 Winter Lights pieces | four earned pieces, names in both sets, fit test, picture page | +0.6 kB | about 2 kB |
| H3 Christmas shop | five shop items (30, 35, 25, 30, 35 paws) and Little Gold Star; fit, picture page | +1.1 kB | about 3 kB |
| H4 Hanukkah shop | five shop items (25, 25, 30, 30, 35 paws) and Menorah Glow (shows `nightOf`); picture page; owner respect review of every picture | +1.1 kB | about 3 kB |
| H5 Settings and flair | `holidayflair.js`: light strip, greeting line, menorah or tree badge, snow-dust, tinted menu header; Settings row; nearer-holiday rule; reduced-motion, phone and TV pictures | +0.4 kB (hook, CSS variables) | about 2.5 kB |
| H6 Decor, cheapest first | per area, behind the window: Neighborhood, Old House, Farm, Market Square, Park (then Snowville when its build lands); merged or instanced per kind, no colliders, own seeded stream; each area's own budget row re-measured; reach test with no skills | +0.2 kB | about 12 kB across six, 4,000 triangles, at most 4 draws a place |
| H7 Finds and errand | ornaments, dreidels and gelt as finds (two per area at most), counter and kind line (no paws), three finds give the earned piece, co-walk credit to both | +0.4 kB | +0.5 kB |
| H8 Release pass | Haiku: banned-word scan, word-set structure, `serieswords`; flat-trace fixture unchanged; iPad 7 smoke at lowest rung; owner picture review (Christmas, Hanukkah equal) | none | none |
| H9 Later wave | Harvest Moon, Spring Bloom, Summer Splash on the same machinery | +1.5 kB | about +6 kB |

Totals for H0 to H8: start-up about **+5.0 kB of 720** (665.7 now), exactly the standing allowance, reported at each merge; if H1 to H5 overshoot, the first lever is moving all holiday names to the lazy chunk with the catalog rows storing only ids. Lazy about 25 kB total (all of it in `holiday`, `holidayflair` and `holidaydecor`), each under the 100 kB per-chunk guard.

## Order of risk
H0 then H1 first (calendar and save are the only things that can lose data); H5 early because the family sees it first; H6 after. Winter Lights window opens 1 Dec and Hanukkah 4 Dec 2026: if H3 to H7 cannot land by then, ship H0, H1, H2 and H5 and give the Christmas and Hanukkah sets by redeem code as the fallback, so nothing is missed.

## Tests per milestone
Window and night edges; save sanitize and merge union, no loss on cloud load; shop shelf shows only in season but owned items stay; prize items never tradable or redeemable except by code; every record fits the dressing room (the `giftwearfit` pattern); decor spots in bounds, off colliders, clear of spawn and of every find; flat-trace fixtures unchanged; Settings `off` builds nothing; reduced-motion pass; word-set parity (every id in both sets); banned-word scan; pad and TV reach; co-walk (host clock decides). Focused tests plus `npm run build` per milestone; full suite once on the rebased branch.

## Risks
Hanukkah table typo (mitigated by two-source check and the coverage test); a wrong device clock only moves a window; Fairground, Seaside and Docks untouched (no budget room); owner sensitivity on pictures gates H8.
