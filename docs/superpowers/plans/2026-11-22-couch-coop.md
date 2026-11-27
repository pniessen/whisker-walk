# Couch Co-op Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans, one milestone at a time. Steps use checkbox syntax.

**Goal:** Two cats in one place on one screen, two DualSense pads (or one pad and a keyboard), played from the sofa in TV mode.

**Spec:** `docs/superpowers/specs/2026-11-22-couch-coop-design.md` (read it first; this plan only orders the work).

**Architecture:** one lazy chunk `src/coop/*` plus a seam of at most 0.4 kB in start-up (`src/coopseam.js`). Cat 2 is a local co-walker: a headless mover (`createPlayer(..., { headless: true })`) drawn through `remotecats.js`, framed by a shared camera post-pass. One save, two cats (Option A).

## Global constraints (every task)

- Work only in a `.worktrees/couch-coop-*` branch per milestone. Never touch the main checkout, never push, never merge without the owner's yes. The live database is off limits.
- **Start-up chunk 709.5 of 720 kB gz, never raised.** The seam may add at most 0.4 kB; stop and re-plan at +0.6 kB. All other code is lazy; the build must fail if the coop chunk lands in start-up (`COOP_ENTRY_MODULES` guard, chunk ceiling 25 kB gz).
- Fair chunk 95.8 / 100 kB: stop if it passes 97.3. No place ceiling is raised; `test/coopbudget.test.js` pins "place + full cat + simple cat".
- **No save change, no cloud change** in M0 to M6. Couch settings are localStorage `whisker-walk-coop` (per device, like `tvMode`).
- Solo play with couch play off is byte-for-byte today's: seam functions are identity; every existing gamepad, player and walk test stays green unchanged.
- Offline-first: no request made by couch play; `test/offlinefirst.test.js` extended.
- All words through set-aware tables, both sets tested. No "Player 1/2": cat names.
- TV floors 24 / 20 px and 5 % safe margins on every new element; one toast at a time.
- Agents test with a fake `navigator.getGamepads` and the browser pane and say so; real-pad checks are the owner's.
- Run named test files while building; `npm test` once per milestone, never between 18:30 and 19:30 (check `date`).
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Milestones

### M0: measure and seam (no visible change)
- [ ] Build on main; record start-up and TV chunk sizes (baseline).
- [ ] `src/coopseam.js`: flag, `coopPoll` slot, `?coop=1` (page load only); identity when off.
- [ ] `player.js`: `headless` option (no document/canvas listeners). `gamepad.js`: `poll(dt, forcePad)`.
- [ ] `test/coopbudget.test.js`: heaviest outfits on a simple and a full cat; fair, docks, neighborhood place + two cats; set the ceilings from the measurement plus 5 %.
- [ ] `scripts/buildjson.mjs`: `COOP_ENTRY_MODULES`, ceiling 25 kB, lazy guard.
- [ ] Tests: seam identity, no listeners from a headless player, two movers replay one path identically, solo gamepad suite unchanged.
- Budget check: start-up delta <= 0.4 kB.

### M1: pads, join, second cat walks (Neighborhood only)
- [ ] `src/coop/padhub.js`: two slots from `getGamepads`, `stepPad` per slot, slot by press order, keyboard = player one.
- [ ] Join card and pause-on-disconnect card (real buttons, both word sets).
- [ ] Mover + local `remotes.applyState` (zero-delay flag), partner tag, colour ring and shape under each cat.
- [ ] Framing post-pass: midpoint, widen through the camera steps, safe box 85 % x 80 %, fixed yaw.
- [ ] Tests: assignment (same `id` twice, changed `index`, reconnect), pause on disconnect, framing maths, per-cat hop and pounce.
- Budget check: start-up unchanged since M0; coop chunk size; neighborhood combined-scene test.

### M2: camera and HUD completeness
- [ ] Follow-when-idle, rubber band, hold-D-pad-Down hop to friend, edge markers, quarter turn with held-stick lock, tight-place rule.
- [ ] HUD: two prompt slots, finder chips, one toast queue with merge, +N pop in the world.
- [ ] Tests: each rule with a fake clock; floors 24/20 px; marker >= 48 px; both word sets.
- Budget check: coop chunk <= 25 kB; fair chunk untouched.

### M3: parity for finding things; open places
- [ ] Cat 2 collects, catches, sniffs, talks, carries; shared goals, journal and golden mice; skills and a saved outfit for cat 2; summary tally.
- [ ] Enable Woods, River, Moor, Pines, Docks, Den (the per-place table row flips only with tests).
- [ ] Tests: finds counted once; save identical to a solo walk with the same finds; Sea Legs swim for cat 2.
- Budget check: `coopbudget` for each enabled place.

### M4: menus, fights, verbs between the cats
- [ ] Owner-pad rule for pause, map, confirms; place change moves both; crossings carry the partner.
- [ ] Fights (one at a time, challenger's pad), border patrol, grooming and pounce-tag between the two.
- [ ] Tests: non-owner ignored; confirm same pad; fight record writes challenger's key.
- Budget check: clan chunks grow by 0.5 kB each at most.

### M5: places, one merge each
a) open places recheck, b) Farm and Market, c) Gorge and caves, d) Old House, e) Fair rides (two riders), f) Rooftops.
- Each: its own test file, the row flips to ready only when green, the place's ceilings unchanged, the fair chunk <= 97.3 kB.

### M6: the owner's real-pad pass
- [ ] Owner plays with two DualSenses; tune speeds, leash, hold times, hint lengths; record readings (fps at 1080p and 4K, Fair/Docks/Neighborhood).

### M7 (optional, only if asked): second saved profile; split keyboard
- Option B of the spec; its own design review first.

## Review focus (each milestone)

- Anything coop imported by a start-up module (the build check must catch it).
- Any single-cat system reading cat 1 for cat 2 in a place not yet marked ready.
- A second keyboard/mouse listener from the mover; a second `setPixelRatio` caller.
- A focus ring owned by the wrong pad; a destructive action confirmable by the other kid.
- A raw glyph token or an English string outside a word table.

## Open questions

See spec section 16 (six, each with a recommended answer). M0 can start before they are answered; M1 needs Q1 and Q2.
