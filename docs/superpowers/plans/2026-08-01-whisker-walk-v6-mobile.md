# Whisker Walk v6 "Mobile" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full touch playability — virtual joystick with analog stalk, orbit drag, tappable action buttons and prompt pill, engagement-based pause, responsive/safe-area UI, mobile perf tuning. Desktop unchanged.

**Spec:** `docs/superpowers/specs/2026-08-01-whisker-walk-v6-mobile.md` — read it first.

## Global Constraints

- Desktop behavior byte-for-byte unchanged: keyboard/pointer-lock paths must not regress; touch layer only activates on `pointer: coarse` (or first touch event).
- Joystick: dead zone 0.15, stalk threshold 0.45 (fraction of max radius 60 px), anchored where the thumb lands in the left 40%.
- Tap vs drag: <300 ms AND <10 px total movement.
- All new HUD elements: min 44 px targets, `env(safe-area-inset-*)` aware.
- Perf knobs on coarse pointers: shadow 1024², DPR cap 1.5, strays 14.
- Tests + `npx vite build` green every commit. Baseline: 112 tests.

---

### Task 1: Touch input math + player abstraction

**Files:**
- Create: `src/touchinput.js`
- Modify: `src/player.js`
- Test: `test/touchinput.test.js`

**Interfaces:**
- `src/touchinput.js` pure math (no DOM):
  - `joystickVector(originX, originY, x, y, maxR = 60, dead = 0.15) -> {x, z, mag}` — screen-space thumb offset to a movement vector: `dx=(x-originX)/maxR`, `dy=(y-originY)/maxR`, clamp magnitude to 1, magnitudes below `dead` → `{x:0, z:0, mag:0}`; returns z = dy (screen down = toward camera).
  - `isStalkMag(mag, threshold = 0.45) -> bool` (0 < mag < threshold).
  - `classifyTouch(startT, endT, startX, startY, endX, endY) -> 'tap'|'drag'` per the 300 ms/10 px rule.
- `src/player.js` additions (keyboard paths untouched):
  - `setTouchMove(vec|null)` — `{x, z, mag}` in camera-relative space (same convention as `moveDirection`: x right, z forward-negative… IMPORTANT: define clearly — the joystick vector is screen-space; player converts: forward = -z screen-up, applying yaw exactly like `moveDirection` does for keys. Touch move overrides keys when non-null; pace scales by `mag`, and `stalking` getter returns true when a touch vector is active with `isStalkMag(mag)` (Shift unchanged for desktop).
  - `addOrbit(dx, dy)` — applies the same yaw/pitch math as the mousemove handler (sensitivity 0.0045/0.004 — roughly 2× mouse, tuned for thumbs).
  - `engaged` concept: `api.engaged` getter returns `api.locked || touchEngaged`; `setTouchEngaged(bool)`. The lockchange bus event also fires (`player:lockchange` with `{locked: engaged}`) when touch engagement toggles, so the existing overlay logic reuses it — rename nothing.

- [ ] **Step 1: Failing tests** — `test/touchinput.test.js` (~6 tests: dead zone zeroes, clamped magnitude, direction signs, stalk band edges, tap vs drag time/distance boundaries).
- [ ] **Step 2: fail.** **Step 3: implement touchinput.js.** **Step 4: pass.**
- [ ] **Step 5: player.js wiring** — in `update()`, movement source: `const dir = touchMove ? touchDirection(touchMove, yaw) : moveDirection(keys, yaw);` where touchDirection rotates the screen vector by yaw and scales target speed by `mag` (stalk factor still applied via the existing speedFactor path — main's stalk check must read `player.stalking` which now ORs the touch-stalk condition). Simulation-gate compatibility: everywhere `main.js` checks `player.locked` for the sim gate and key guards will be switched to `player.engaged` in Task 2 — THIS task only adds the getters/setters without changing main.js.
- [ ] **Step 6: tests + build; desktop dev-server boot unchanged.** **Step 7: Commit** — `git commit -m "feat: touch input math and player touch abstraction"`

---

### Task 2: Touch UI layer — joystick, orbit, buttons, tappable prompt

**Files:**
- Create: `src/ui/touchui.js`
- Modify: `src/main.js`, `src/ui/hud.js`, `src/style.css`, `index.html` (viewport meta)

**Interfaces:**
- `index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">` (replace existing viewport tag).
- `detectTouch()` in touchui: `matchMedia('(pointer: coarse)').matches`, plus a one-time `touchstart` listener that upgrades hybrids.
- `createTouchUI(root, callbacks)` where callbacks = `{ onMove(vec|null), onOrbit(dx, dy), onAction(name) }` with names `pounce|meow|yarn|camera|pause|interact`:
  - Renders into `#hud`: joystick base+nub (hidden until a touch lands in the left 40%, anchors there, follows within maxR, disappears on release → `onMove(null)`), right-region orbit capture (touchmove deltas → `onOrbit`; `classifyTouch` on release → if tap, `onAction('tapWorld')`), action cluster (four buttons), ⏸ button.
  - `setVisible(bool)`; buttons dispatch `onAction`.
  - All touch handlers `preventDefault()`; elements `touch-action: none`.
- `hud.js`: prompt pill becomes tappable on touch — `setPrompt(text, tappable)` renders a `<button class="hud-prompt-btn">` (strip a leading "E — " for display) that fires a provided `onPromptTap` (wired via a new `hud.onPromptTap(fn)`); desktop keeps the passive pill.
- `main.js` wiring:
  - Sim gate + key guards: replace `player.locked` with `player.engaged` in the animation loop and in guards that gate GAMEPLAY actions (KeyE/T/Space/V/C handlers keep working on hybrids — they check `player.engaged` too). Pointer-lock acquisition stays desktop-only: the overlay resume button on touch calls `player.setTouchEngaged(true)` instead of `requestPointerLock` (branch on `isTouch`).
  - Overlay copy on touch: "Tap to explore".
  - `createTouchUI` callbacks: onMove → `player.setTouchMove(v)`; onOrbit → `player.addOrbit(dx, dy)`; onAction: pounce→ the Space handler's logic extracted into `doPounceOrClimb()`, meow→`doMeow()`, yarn→`doYarn()`, camera→`doCameraToggle()`, pause→`player.setTouchEngaged(false)`, interact/promptTap→`handleInteract(session)`, tapWorld→ `if (session?.cameraMode) snapPhoto(session)`. EXTRACT those four keydown bodies into named functions called from both the key handlers and touch actions (pure refactor for desktop).
  - Touch UI shown only during walks on touch devices (`touchUI.setVisible(!!session && isTouch)` on start/end).
  - Hide `.hud-controls` bar on touch (CSS `@media (pointer: coarse)`).
- CSS: joystick (translucent circles), action cluster grid, ⏸, `padding: env(safe-area-inset-…)` on hud anchors, `#game { touch-action: none; }`, `html, body { overscroll-behavior: none; }`, prompt-button ≥44 px.

- [ ] Steps: implement; verify desktop unchanged (dev server + keyboard). Touch verification: use the browser preview's mobile emulation (resize to mobile preset + touch events) — joystick appears and moves the cat, orbit drags, buttons fire, prompt tap works, pause/resume cycles. **Commit** — `git commit -m "feat: touch controls — joystick, orbit, action buttons, tappable prompts"`

---

### Task 3: Responsive + mobile perf

**Files:**
- Modify: `src/style.css`, `src/main.js`, `src/ui/homebase.js` (if needed for tap targets/inputs)

**Interfaces:**
- Coarse-pointer perf in `startWalk`: `const coarse = matchMedia('(pointer: coarse)').matches;` → shadow mapSize 1024 when coarse; stray count `coarse ? 14 : 22`; after renderer init `renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2))`.
- Home base: pet-name/join inputs `font-size: 16px` (prevents iOS zoom), buttons min-height 44 px on coarse, section paddings tightened at `max-width: 480px`.
- HUD: goals panel and roster chip scale down at small widths; summary card fits portrait.

- [ ] Steps: implement; verify in emulated mobile viewport (portrait AND landscape screenshots of home base + walk). **Commit** — `git commit -m "feat: responsive mobile layout and coarse-pointer performance tuning"`

---

### Task 4: Verification pass + README + release

**Files:**
- Modify: `README.md`; fixes as found.

- [ ] Full regression + build.
- [ ] Emulated-mobile end-to-end (controller does this in the main session or the implementer via preview tools if available): home base renders and scrolls; start walk; joystick move + stalk-tilt pose; orbit; pounce/meow/yarn/camera buttons; tappable prompt on a collectible; pause/resume; summary; a Walk-together room hosts from mobile viewport.
- [ ] README: mobile controls paragraph.
- [ ] **Commit** — `git commit -m "docs: mobile controls and v6 release polish"`

## Plan Self-Review Notes

- Engagement refactor risk is the sharp edge: every `player.locked` gameplay guard must move to `player.engaged`, but pointer-lock-specific logic (requestPointerLock, lockchange overlay behavior on DESKTOP) stays lock-based. The bus event reuse (emitting player:lockchange on touch engagement) keeps the overlay logic single-pathed.
- Keydown-body extraction (doPounceOrClimb etc.) is a pure refactor consumed by both input paths — reviewers should diff-check the extracted logic is move-only.
- Photo snap on touch = tap in camera mode (tapWorld), matching the desktop mousedown semantics.
