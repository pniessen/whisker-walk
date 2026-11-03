# polish-fightcam2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fights frame the two cats bigger and side-on with no big trunk filling the screen; name tags stop stacking on each other and on the HUD; the Journal's "friendly neighbour" looks like the new dressed Twoleg.

**Architecture:** Three independent changes in three owned files. (1) `src/fightcam.js` `chooseFightView` gets tighter rings, a side-on preference and a "frame clutter" cost, plus a `clutter` list of in-front trees that `createFightCam` hides like blockers. (2) `src/nametag.js` gets a pure screen-space `declutterTags` and render-time glue in `fitOnRender` (one frame of lag) that drops a farther tag's subtitle, nudges it up, or hides it, and hides any tag on a HUD box. (3) `src/journal.js` draws the villager as an inline SVG Twoleg.

**Tech Stack:** Three.js 0.185, Vite 8, Vitest 4, plain ES modules.

**Spec:** scratchpad `polish-survey-3.md` (Build B2; polish rows #2, #12, #14) and `polish-common.md` (shared rules, survey-3 section). Shots: `snaps-survey3/` (`pl-pl-f1-*`, `hag-desk-f1-*`, `w-gorge-day-*-camp`, `probe-woods06`, `w-woods-dusk-desk-05-poi`, `04-Journal-*`).

## Global Constraints

- Touch only `src/fightcam.js`, `src/nametag.js`, `src/journal.js` (+ their tests, + `test/fightcamworld.test.js` pins). No edits to walk.js, main.js, treefade.js, style.css, critters.js, cat/*.
- No `Math.random`; no draws on walkRng/strayStream. The fight camera is not in the flat trace; flat trace must stay sha256 `d2657f022d09b1d6507af42e30ce9666bfea29b3e52c2add1c218399a53a72f0`.
- Gameplay unchanged: no collider, spawn, route or cat position changes.
- Tests: `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` all green, plus `npm run build`. Long geometry sweeps keep explicit timeouts (120_000+). Floats vs fixtures use `closeDiffs`.
- Commits: explicit `git add <paths>`; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Copy the kids read: short, warm, plain.

## Review Focus

1. A phone held upright must still get the side-on wide view it gets today (tight rings don't fit it) — Task 1 test `portrait keeps a side-on view`.
2. Clutter hiding must never hide a stand pine (obj null) or a tree behind the cats — Task 1 test `clutter lists only hideable trees in front of the pair`.
3. A tag hidden by the declutter must not flicker on/off frame to frame: decisions come from the *natural* (un-nudged) rects — Task 2 test `decisions are stable when applied`.
4. Fake 2D contexts / no `document` / renderer without `info` (headless tests) must not throw — Task 2 test `fitOnRender with a bare renderer`.
5. A mood repaint (cross → forgiven) on a tag whose subtitle is dropped must repaint the one-line texture too — Task 2 test `setNameTagMood refreshes the short texture`.

---

### Task 1: Fight framing — tighter, side-on, no trunk wall

**Files:**
- Modify: `src/fightcam.js` (RINGS, constants near l.96–117, `candidates`, `chooseFightView`, `createFightCam.choose`)
- Test: `test/fightcam.test.js`; re-measure pins in `test/fightcamworld.test.js` only if its counts move (write the reason in the MODES comment).

**Interfaces:**
- Produces: `RINGS` (exported, frozen, each `{ d, h, rank }`), new exports `SIDE_COST`, `CLUTTER_COST`, `CLUTTER_HIDE`, `frameClutter(pos, view, occluder, aspect, fovY, bottom, nearDepth) -> number` (share of the above-sheet frame the tree covers, 0..1, 0 when wholly behind `nearDepth`), and `chooseFightView(...)` return gains `clutter: Occluder[]` (always an array; hideable, in front of the pair, each covering ≥ `CLUTTER_HIDE`).

- [ ] **Step 1: Write the failing tests** in `test/fightcam.test.js` (new `describe('framing: tight, side-on, no trunk wall')`, using the file's `subject`, `sceneOf`, `BOUNDS`, `PORTRAIT`, `LAND`, `DESK`, pair `me {0.8,0}`, `it {-0.8,0}`):
  - `on open ground, landscape and desktop take a ring of d <= 3.4`: for yaw0 in [0, 1, π, -2.5] → `RINGS[v.ring].d <= 3.4`, `v.clear`.
  - `on open ground every frame turns side-on`: for PORTRAIT, LAND, DESK and yaw0 in [0, 0.6, 1, 2.6, π, π/2+0.6] → with `ax = atan2(axis.x, axis.z)`, `Math.abs(Math.cos(yaw - ax)) < 0.27` (within 15° of perpendicular).
  - `portrait keeps a side-on view`: PORTRAIT, yaw0 0 → `RINGS[v.ring].d >= 4.2` and side-on as above, `ourCatHidden(v.pos, subj) === 0`.
  - `landscape cats fill at least a quarter of the frame height`: real subject `fightReach({x:FIGHT_GAP/2,z:0},{x:-FIGHT_GAP/2,z:0},()=>true,{actions:true})`, LAND, yaw0 0; project my anchor at y 0.08 and y 0.85 → `(top.y - bottom.y) / 2 >= 0.25` (NDC height share).
  - `a big oak beside the line is avoided`: oak `{ kind:'tree', x: 1.6, z: 2.2, scale: 1.4 }` (in front of the pair on the +z side, off every camera→cat line from yaw0 0); DESK, yaw0 0 → `frameClutter` of that oak for the chosen view `< CLUTTER_HIDE`, or the oak is in `v.clutter`.
  - `clutter lists only hideable trees in front of the pair`: ring the pair with oaks at radius 2.6–3.2 plus a stand pine; for every returned view each `o` in `v.clutter` has `o.obj` truthy and its centre depth (projectPoint z) less than the pair's middle depth; and `v.clutter` never shares an entry with `v.blockers`.
  - `createFightCam hides clutter and shows it again`: as the existing blockers test (l.558) but with a clutter oak: `obj.visible === false` while the fight is on, `true` after `update` with `subject: null` until weight 0, and after `dispose()`.
- [ ] **Step 2: Run** `npx vitest run test/fightcam.test.js` — Expected: the new tests FAIL (no `frameClutter`, rings too wide, yaw kept).
- [ ] **Step 3: Implement in `src/fightcam.js`:**
  - RINGS: prepend `{ d: 3.0, h: 1.15 }` and `{ d: 3.4, h: 1.3 }`; ranks `0, 0.1, 0.25, 0.4` for the four tight rings (3.0, 3.4, 4.2, 4.6), the eight wide rings `i + 0.6`. `LAST_RESORT_RING` stays "the first wide ring" (find by `d === 5.5 && h === 2.2`).
  - `SIDE_COST = 8`: in `candidates`, add `SIDE_COST * Math.abs(Math.cos(yaw - ax))` (0 side-on, 8 end-on), on top of AXIS_COST.
  - `frameClutter`: for each shape of the occluder (cyl: centre at mid-height, half-width r, half-height (y1-y0)/2; ell: centre, r, ry), depth z from `projectPoint`; skip if `z >= nearDepth`; clamp z to ≥ 0.3; NDC rect = centre ± (half-width/(z·tanV·aspect), half-height/(z·tanV)); clip to x∈[-1,1], y∈[bottom,1]; sum areas / (2·(1-bottom)); return min(1, sum). `nearDepth` = the smallest depth of the subject's anchors (`me[0]`, `it[0]`) minus `CAT_BODY`.
  - In `candidates`, cost += `CLUTTER_COST * Σ frameClutter` over `near` occluders (`CLUTTER_COST = 20`), using the view `viewFrom(pos, mid, fovY, lookY)` (cheap aim; not fitLow) and the frame bottom in use. Pre-filter occluders whose centre is farther from `pos` than `|pos - mid|` (they are behind the pair). `candidates` therefore needs `near, aspect, fovY, bottom, lookY` passed in.
  - After the choice (every return path), set `clutter` = hideable (`o.obj`) near occluders not in `blockers` whose `frameClutter` for the returned view ≥ `CLUTTER_HIDE = 0.12`.
  - `createFightCam.choose`: hide `next.clutter` exactly like `next.blockers` (push to `hidden`).
  - Update the header comment block (HOW / rings) in plain words.
- [ ] **Step 4: Fix the old tests the rulings change, then run** `npx vitest run test/fightcam.test.js test/fightcamworld.test.js test/gorgeclan.test.js test/treefade.test.js test/clanfight.test.js`. Allowed rewrites only: `with no trees it keeps the current angle` becomes "with no trees it takes the nearer side-on angle" (yaw within 15° of perpendicular, the side nearer yaw0); `on open ground at desktop it takes a tight ring` changes `v.ring <= 1` to `v.ring <= 3`. fightcamworld `maxHidden`/`maxNotUnder`/`maxBrushed` may be re-measured (log the new numbers in the MODES comment); any frame/occlusion `expect` failure is a real bug — fix the code, not the test. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/fightcam.js test/fightcam.test.js test/fightcamworld.test.js` — `feat(fightcam): tighter side-on fight framing, steer off and hide trunk walls`.

### Task 2: Name tags de-overlap each other and the HUD

**Files:**
- Modify: `src/nametag.js`
- Test: create `test/nametagdeclutter.test.js`

**Interfaces:**
- Produces:
  - `export function declutterTags(entries, hud = [], out = new Map()) -> Map<entry, { hide: boolean, dropSub: boolean, lift: number }>` — pure. `entries: [{ rect: {l,t,r,b} (CSS px, y down), depth: number, sub: boolean }]`, `hud: [{l,t,r,b}]`.
  - `export const TAG_GAP_PX = 4`, `export const SUB_DROP_KEEP = 2 / 3` (share of a two-line rect height left when the subtitle drops; lower edge kept), `export const LIFT_MAX_TAGS = 1.5` (max lift, in the tag's own rect heights).
  - `fitTagToView(tag, camera, viewW, viewH, minBottomY = -Infinity, rectOut = null)` — new optional `rectOut` is filled with the fitted, natural (pre-declutter) `{l,t,r,b,depth}` in CSS px, or left untouched when the tag is off screen (returns as today).
- Algorithm for `declutterTags` (not determined by the signature): order entries by depth ascending (ties: list order). For each: start from `rect`; if it meets (positive-area intersection, after growing each placed rect by TAG_GAP_PX) a placed rect and `sub` → `dropSub`, rect.t = rect.b − (rect.b − rect.t)·SUB_DROP_KEEP; if it still meets one → lift = max over met placed of (rect.b − placed.t + TAG_GAP_PX), shift rect up by lift; if lift > LIFT_MAX_TAGS · rect height, or the shifted rect still meets a placed rect, or rect.t < 0 → `hide`. Then a non-hidden rect that meets any `hud` rect → `hide`. Non-hidden rects are placed.

- [ ] **Step 1: Write the failing tests** (`test/nametagdeclutter.test.js`):
  - `two apart tags are untouched`: two rects 100 px apart → both `{hide:false, dropSub:false, lift:0}`.
  - `the farther two-line tag drops its subtitle first`: near `{l:100,t:100,r:300,b:160}` depth 4, far two-line `{l:120,t:150,r:320,b:240}` depth 6 → far `dropSub:true`, `lift:0` (its kept rect t = 240 − 90·2/3 = 180 ≥ 160+4); near untouched.
  - `then it is nudged up`: near `{l:100,t:100,r:300,b:160}` depth 4, far one-line `{l:120,t:140,r:320,b:200}` depth 6 → far `hide:false`, `dropSub:false`, `lift === 200 - 100 + TAG_GAP_PX` (104 ≤ 1.5·60, and the lifted rect's t = 36 ≥ 0).
  - `a tag that can't clear is hidden`: far tag exactly on top of the near one (same rect) one-line → `hide:true`.
  - `a tag on a HUD box is hidden; the nearest too`: HUD rect `{l:0,t:680,r:1280,b:705}` and a tag rect crossing it → `hide:true`, even when it is the only tag.
  - `decisions are stable when applied`: running `declutterTags` twice on the same natural rects gives equal maps (the caller always passes natural rects).
  - `fitOnRender with a bare renderer`: a tag from `makeNameTag` (with the `document` stub from `test/nametagfit.test.js`), `tag.onBeforeRender({ getSize: (v) => v.set(1280, 720) }, null, camera)` twice with no `info` → no throw.
  - `a dropped subtitle swaps to a one-line texture and back`: drive two overlapping two-line tags through `onBeforeRender` for two frames with a renderer stub `{ getSize, info: { render: { frame } } }` (frame 1 then 2), HUD cache empty → after frame 2 the farther tag's `material.map !== tag.userData.fullMap` and its matrixWorld y scale ≈ one-line ratio (`0.35/0.525` of before); move it apart, two more frames → `material.map === tag.userData.fullMap`.
  - `setNameTagMood refreshes the short texture`: after a dropSub, `setNameTagMood(tag, { cross: true })` → the short texture's `needsUpdate` was set (version bumped) and `tag.userData.shortCross === true`.
- [ ] **Step 2: Run** `npx vitest run test/nametagdeclutter.test.js` — Expected: FAIL (no `declutterTags`).
- [ ] **Step 3: Implement in `src/nametag.js`:**
  - `declutterTags` as specified.
  - `fitTagToView` fills `rectOut` from the fitted sprite (centre ± half its fitted size, converted with `k`, x/y to CSS px, y down) and `depth`.
  - Runtime glue (module state, one `WeakMap` per renderer, no per-frame allocation beyond reused arrays): frame id = `renderer.info?.render?.frame`; without it, glue is off (today's behaviour exactly). On the first tag of a new frame: decisions = `declutterTags(lastFrameEntries, hudRects())`; then this frame's entries start empty. Each tag: fit (natural), push its entry, then apply its decision from last frame: `hide` → `mw.makeScale(0,0,0)`; `dropSub` → map = short one-line texture (lazily painted with `paintTag(name, cross, legend, wide=true)` on a 256×64 canvas, stored on `userData.shortMap`; the full map kept on `userData.fullMap`), scale x by `TAG_SCALE_X / SUB_TAG_SCALE_X` and y by `TAG_SCALE_Y / SUB_TAG_SCALE_Y`, lower edge kept; `lift` → move up by `lift / k` world units in camera space. A tag with no decision uses `fullMap`.
  - `hudRects()`: cached for 250 ms (`performance.now()`), only with a `document`; rects of `#hud-prompt:not(.hidden)`, `.hud-fight-ask`, `#hud-toasts .toast`, `#hud-controls`, `.hud-fight`, `.tui-actions`, `.tui-zoom`, `.tui-pause` with width and height > 0 and computed `display !== 'none'`/`visibility !== 'hidden'`, made relative to the renderer canvas's own rect.
  - `setNameTagMood`: if `userData.shortMap` exists, repaint its canvas for the new mood, set `needsUpdate`, record `userData.shortCross`.
  - Header comment for the new section (why one frame of lag; why natural rects).
- [ ] **Step 4: Run** `npx vitest run test/nametag*.test.js test/chatbubble*.test.js test/clancats*.test.js test/intruders*.test.js` — Expected: PASS (existing tag tests untouched).
- [ ] **Step 5: Commit** `git add src/nametag.js test/nametagdeclutter.test.js` — `feat(nametag): tags step aside for each other and the HUD`.

### Task 3: The Journal's neighbour is a dressed Twoleg

**Files:**
- Modify: `src/journal.js`
- Test: `test/journal.test.js`

**Interfaces:**
- Produces: `CRITTER_INFO` villager entry gains `art: string` (an inline `<svg>`); `renderJournalHtml` renders `art` in place of the emoji glyph when present (spotted and unspotted; the `.silhouette` filter darkens it as it does the emoji). Other entries are unchanged (their `toEqual` tests stay).

- [ ] **Step 1: Write the failing tests** in `test/journal.test.js`:
  - `the villager is drawn as a Twoleg`: `CRITTER_INFO.find(c=>c.id==='villager').art` starts with `<svg`, has `viewBox`, `aria-hidden="true"`, and has ≥ 7 shapes (two legs, two shoes, coat, scarf, head, hat — count `<path|<rect|<circle|<ellipse|<polygon`).
  - `the villager card renders the art, spotted and not`: `renderJournalHtml({ villager: 0 })` contains the svg inside `journal-emoji silhouette`, and not `🧑`; with `{ villager: 2 }` the spotted card contains the svg and `×2`.
- [ ] **Step 2: Run** `npx vitest run test/journal.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement**: an SVG ~ `viewBox="0 0 24 32"`, `width="0.75em" height="1em"` (fits the 1.6rem glyph box), front view of the Twoleg in `src/critters.js` (read-only reference): trousers `#4a5468` two legs, shoes `#3a3330`, tapered coat `#6a8ac0` (wider at the hips), one arm raised in a wave, scarf `#d8a640` at the collar with a short hanging end, head `#e8c8a8`, red bobble hat `#d8503a` with a cream bobble `#f4f0e8`. Plain shapes, no text, no ids, no scripts.
- [ ] **Step 4: Run** `npx vitest run test/journal.test.js test/homebase*.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** `git add src/journal.js test/journal.test.js` — `feat(journal): the friendly neighbour is a dressed Twoleg`.

### Task 4 (controller, not a subagent): full suite, build, flat trace, live after-shots

- [ ] `npx vitest run --exclude '.claude/**' --exclude '.worktrees/**'` green; `npm run build` ok; `shasum -a 256 test/fixtures/flat-trace.json` = `d2657f02…72f0`.
- [ ] Re-run the scratchpad harness (`snaps-polish-fightcam2/harness/runb.sh a`, `tags.mjs a`), build the before/after pairs in `pairs/`, record draw calls during a fight (hidden trees can only lower them).
