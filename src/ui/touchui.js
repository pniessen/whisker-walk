import { joystickVector, classifyTouch } from '../touchinput.js';
import { createPinchTracker } from '../camzoom.js';

// A second finger that lands within PINCH_PAIR_MS of a first finger that has
// not moved more than STILL_PX is that finger's pinch partner, wherever on the
// screen either of them landed. Without this the 40/60 zone split decides:
// on a 390 px portrait phone a pinch in the middle of the screen often puts
// one finger in the joystick zone, and the cat walks off instead of zooming.
export const PINCH_PAIR_MS = 150;
const STILL_PX = 10;

// Screen-space joystick clamp radius, in px — matches the plan's spec (60px
// max radius, tuned so the nub travel feels right on a phone-sized thumb).
const MAX_R = 60;
const DEAD = 0.15;

export function detectTouch() {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

// Some hybrid devices (touchscreen laptops, some tablets in desktop mode)
// report `pointer: fine` from matchMedia yet still send real touch events.
// Callers wire this up once at boot; the first touchstart anywhere upgrades
// them into touch mode. Returns an unsubscribe function.
export function onFirstTouch(callback) {
  const handler = () => {
    window.removeEventListener('touchstart', handler);
    callback();
  };
  window.addEventListener('touchstart', handler, { passive: true });
  return () => window.removeEventListener('touchstart', handler);
}

// Renders the touch control layer into `root` (the #hud element) and wires
// up joystick / orbit / action-button touch handling.
//
// callbacks = { onMove(vec|null), onOrbit(dx, dy), onAction(name), onZoom(dir) }
// action names: pounce | meow | yarn | camera | pause | interact | tapWorld |
// zoomIn | zoomOut (the + / − camera zoom pair). onZoom(dir) is the two-finger
// pinch on the orbit area: -1 zoom in (fingers apart), +1 zoom out.
// opts = { leftHanded } — settings.leftHanded at construction time; mirrors
// the joystick/orbit zone split (see touchstart below) and, via the
// body.left-handed CSS class, the action cluster / pause button positions
// (see style.css). Use setLeftHanded() on the returned handle to change it
// live without recreating the touch UI.
export function createTouchUI(root, callbacks, opts = {}) {
  const { onMove, onOrbit, onAction, onZoom = () => {} } = callbacks;
  let leftHanded = !!opts.leftHanded;
  document.body.classList.toggle('left-handed', leftHanded);

  const wrap = document.createElement('div');
  wrap.className = 'touch-ui hidden';
  wrap.innerHTML = `
    <div class="tui-joystick hidden" id="tui-joystick">
      <div class="tui-joystick-base"></div>
      <div class="tui-joystick-nub"></div>
    </div>
    <div class="tui-actions" id="tui-actions">
      <button class="tui-btn" type="button" data-action="pounce" aria-label="Pounce or climb">🐾</button>
      <button class="tui-btn" type="button" data-action="meow" aria-label="Meow">😺</button>
      <button class="tui-btn" type="button" data-action="yarn" aria-label="Yarn ball">🧶</button>
      <button class="tui-btn" type="button" data-action="camera" aria-label="Toggle camera">📷</button>
    </div>
    <button class="tui-pause" type="button" id="tui-pause" aria-label="Pause">⏸</button>
    <div class="tui-zoom" id="tui-zoom">
      <button class="tui-zoom-btn" type="button" data-action="zoomIn" aria-label="Zoom in">+</button>
      <button class="tui-zoom-btn" type="button" data-action="zoomOut" aria-label="Zoom out">−</button>
    </div>
  `;
  root.appendChild(wrap);

  const joystick = wrap.querySelector('#tui-joystick');
  const nub = wrap.querySelector('.tui-joystick-nub');

  let joyTouch = null; // { id, originX, originY, lastX, lastY, startT }
  let orbitTouch = null; // { id, lastX, lastY, startX, startY, startT, pinched }
  // A second finger on the orbit area (or any second finger that arrives
  // right behind a still first one, see PINCH_PAIR_MS) turns the orbit drag
  // into a pinch: { id, x, y }. Once pinched, the orbit finger never orbits
  // or taps again until it lifts, even if the other finger lifts first — no
  // camera swing and no stray photo at the end of a pinch.
  let pinchTouch = null;
  const pinch = createPinchTracker();
  const spread = () => Math.hypot(pinchTouch.x - orbitTouch.lastX, pinchTouch.y - orbitTouch.lastY);

  function showJoystick(x, y) {
    joystick.classList.remove('hidden');
    joystick.style.left = `${x}px`;
    joystick.style.top = `${y}px`;
    nub.style.transform = 'translate(0px, 0px)';
    onMove({ x: 0, z: 0, mag: 0 });
  }

  function moveJoystick(x, y) {
    joyTouch.lastX = x;
    joyTouch.lastY = y;
    const vec = joystickVector(joyTouch.originX, joyTouch.originY, x, y, MAX_R, DEAD);
    const dx = x - joyTouch.originX;
    const dy = y - joyTouch.originY;
    const dist = Math.min(Math.hypot(dx, dy), MAX_R);
    const angle = Math.atan2(dy, dx);
    nub.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
    onMove(vec);
  }

  function hideJoystick() {
    joystick.classList.add('hidden');
  }

  function isButtonTarget(target) {
    return !!(target && target.closest && target.closest('.tui-btn, .tui-pause, .tui-zoom-btn'));
  }

  // The prompt pill (#hud-prompt, tappable when a touch interaction is
  // available) sits visually above .touch-ui but shares the same screen
  // region. Ignore touches that land on it so its own click handler fires
  // instead of this layer stealing them as a joystick/orbit/tapWorld touch.
  function isPromptTarget(target) {
    return !!(target && target.closest && target.closest('.hud-prompt'));
  }

  wrap.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (isButtonTarget(t.target) || isPromptTarget(t.target)) continue; // let the button's own click handler fire
      e.preventDefault();
      const x = t.clientX;
      const y = t.clientY;
      // left-handed mirrors the zone split: joystick lives in the right 40%
      // instead of the left, orbit-drag takes the remaining (left) 60%.
      const inJoystickZone = leftHanded ? x > window.innerWidth * 0.6 : x < window.innerWidth * 0.4;
      const now = performance.now();
      const fresh = (f, sx, sy) => now - f.startT <= PINCH_PAIR_MS && Math.hypot(f.lastX - sx, f.lastY - sy) <= STILL_PX;
      if (orbitTouch && !pinchTouch && !orbitTouch.pinched && fresh(orbitTouch, orbitTouch.startX, orbitTouch.startY)) {
        // A pinch whose second finger landed in the joystick zone.
        pinchTouch = { id: t.identifier, x, y };
        orbitTouch.pinched = true;
        pinch.start(spread());
      } else if (joyTouch && !orbitTouch && fresh(joyTouch, joyTouch.originX, joyTouch.originY)) {
        // A pinch whose FIRST finger landed in the joystick zone: that finger
        // has not left the dead zone, so the cat has not moved. Drop the
        // joystick and make the two fingers a pinch.
        orbitTouch = {
          id: joyTouch.id, lastX: joyTouch.lastX, lastY: joyTouch.lastY,
          startX: joyTouch.originX, startY: joyTouch.originY, startT: joyTouch.startT, pinched: true,
        };
        joyTouch = null;
        hideJoystick();
        onMove(null);
        pinchTouch = { id: t.identifier, x, y };
        pinch.start(spread());
      } else if (joyTouch === null && inJoystickZone) {
        joyTouch = { id: t.identifier, originX: x, originY: y, lastX: x, lastY: y, startT: now };
        showJoystick(x, y);
      } else if (orbitTouch === null) {
        orbitTouch = { id: t.identifier, lastX: x, lastY: y, startX: x, startY: y, startT: now, pinched: false };
      } else if (pinchTouch === null && !orbitTouch.pinched) {
        pinchTouch = { id: t.identifier, x, y };
        orbitTouch.pinched = true;
        pinch.start(spread());
      }
    }
  }, { passive: false });

  wrap.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (joyTouch && t.identifier === joyTouch.id) {
        e.preventDefault();
        moveJoystick(t.clientX, t.clientY);
      } else if (orbitTouch && t.identifier === orbitTouch.id) {
        e.preventDefault();
        const dx = t.clientX - orbitTouch.lastX;
        const dy = t.clientY - orbitTouch.lastY;
        orbitTouch.lastX = t.clientX;
        orbitTouch.lastY = t.clientY;
        if (!orbitTouch.pinched) onOrbit(dx, dy);
      } else if (pinchTouch && t.identifier === pinchTouch.id) {
        e.preventDefault();
        pinchTouch.x = t.clientX;
        pinchTouch.y = t.clientY;
      }
    }
    if (pinchTouch && orbitTouch) {
      const dir = pinch.move(spread());
      if (dir) onZoom(dir);
    }
  }, { passive: false });

  function handleTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (joyTouch && t.identifier === joyTouch.id) {
        e.preventDefault();
        joyTouch = null;
        hideJoystick();
        onMove(null);
      } else if (orbitTouch && t.identifier === orbitTouch.id) {
        e.preventDefault();
        const cls = classifyTouch(
          orbitTouch.startT, performance.now(),
          orbitTouch.startX, orbitTouch.startY, t.clientX, t.clientY
        );
        const pinched = orbitTouch.pinched;
        orbitTouch = null;
        // Lifting either pinch finger ends the pinch; the finger left down
        // does nothing until it lifts (it does not snap back to orbiting).
        pinchTouch = null;
        if (cls === 'tap' && !pinched) onAction('tapWorld');
      } else if (pinchTouch && t.identifier === pinchTouch.id) {
        e.preventDefault();
        pinchTouch = null;
      }
    }
  }
  wrap.addEventListener('touchend', handleTouchEnd, { passive: false });
  wrap.addEventListener('touchcancel', handleTouchEnd, { passive: false });
  // iOS Safari ignores the viewport's user-scalable=no (an accessibility
  // choice) and still page-zooms on a pinch. touch-action: none plus the
  // preventDefaults above stop it on most browsers; Safari's own gesture
  // events are the remaining path, so they are cancelled too. On `root`
  // (#hud), not just this layer, so a pinch that starts on another HUD piece
  // (the corner map canvas sits above .touch-ui inside #hud) cannot zoom the
  // page either. #hud is hidden outside a walk, so the home base, menus and
  // settings keep the browser's zoom.
  for (const type of ['gesturestart', 'gesturechange']) {
    root.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }

  for (const btn of wrap.querySelectorAll('.tui-btn')) {
    btn.addEventListener('click', () => onAction(btn.dataset.action));
  }
  wrap.querySelector('#tui-pause').addEventListener('click', () => onAction('pause'));
  for (const btn of wrap.querySelectorAll('.tui-zoom-btn')) {
    btn.addEventListener('click', () => onAction(btn.dataset.action));
  }

  return {
    setVisible(visible) {
      wrap.classList.toggle('hidden', !visible);
      if (!visible) {
        joyTouch = null;
        orbitTouch = null;
        pinchTouch = null;
        hideJoystick();
      }
    },
    // Live-applies settings.leftHanded (homebase checkbox): flips the
    // touchstart zone split above AND, via the CSS class, the action
    // cluster (bottom-right -> bottom-left) / pause button (top-left ->
    // top-right) positions in style.css. Drops any touch in flight so a
    // mid-drag flip can't leave a joystick anchored on the wrong side.
    setLeftHanded(v) {
      leftHanded = !!v;
      document.body.classList.toggle('left-handed', leftHanded);
      joyTouch = null;
      orbitTouch = null;
      pinchTouch = null;
      hideJoystick();
    },
  };
}
