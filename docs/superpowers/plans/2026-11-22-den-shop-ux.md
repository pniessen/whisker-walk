# Den shop UX: implementation plan

Spec: `docs/superpowers/specs/2026-11-22-den-shop-ux-design.md`. Not started; waits for the owner's answers to the open questions.

## Global constraints

- Work in a fresh worktree from main. No push or merge without the owner's yes. No database access.
- Start-up chunk 720 kB gz is never raised; baseline 709.5. This plan should lower it. Stop if it passes 709.5.
- No save change. `state.den` and `sanitizeDen` stay as they are.
- New text goes through word tables for both word sets (`src/ui/denwords.js`, `src/tv/padwords.js`).
- Run only the named tests while building; full suite once per milestone, not 18:30 to 19:30.
- Touch, keyboard, pad and TV behaviour after each milestone must be no worse than before it.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## M1. Panel in a lazy chunk (no visible change)

- [ ] Add `src/ui/denplan.js` (5x5 layout table, icon table) with `denplan.test.js` first.
- [ ] Add `src/ui/denwords.js` with `denwords.test.js` (both sets).
- [ ] Move `denshop.js` + `denshopview.js` behind `import()` with a start-up stub (`open`, `close`, `isOpen`, `isAsking`, `notNow`, `setActive`); existing `denshopview` / `denshop` tests still pass against the lazy module.
- [ ] Check start-up gz dropped; chunk listed in precache.

## M2. Buy then "Place it now"

- [ ] After `buyDenItem`: "is yours" card with Place it now / Later; place mode with item in hand over the existing dropdown list (temporary), tests for the sequence.
- [ ] `walkBackAction` gets the `placing` step; `backstack.test.js`.

## M3. Plan-view spot picker

- [ ] `denpanel.js`: tabs, plan-view buttons, hand bar, pick up / move / put away; replace the 12 selects and delete `spotlist.js` use.
- [ ] Pad: `gamepadnav.test.js` reachability from every cell; TV sizes (`tvcss`, `tvclutter`).
- [ ] Remove the `btn-den-shop` special case from `gamepadnav.js` and the desktop hint.

## M4. Home entry

- [ ] "🏠 My den" button in the start row, opens the Den sheet without a walk; Menu tile opens the same sheet; "Walk in" button; hidden with `roomState`.
- [ ] Y (den walks only) opens the panel (subject to open question 3); `padwords` lines.
- [ ] Milestone full-suite run, build size check, privacy scan.

## Owner hand checks (not agent-testable)

DualSense on the Mac (Y in the den, spatial moves over the plan, B ladder), TV glyph sizes at 10 ft, iPhone tap targets.

## Review focus

Anything den-only imported by a start-up module; a second way to buy that skips the confirm card; Y changing photo mode outside the den; any change to what Start/Esc do in other walks.
