import { joystickVector, classifyTouch } from '../touchinput.js';

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
// callbacks = { onMove(vec|null), onOrbit(dx, dy), onAction(name) }
// action names: pounce | meow | yarn | camera | pause | interact | tapWorld
export function createTouchUI(root, callbacks) {
  const { onMove, onOrbit, onAction } = callbacks;

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
  `;
  root.appendChild(wrap);

  const joystick = wrap.querySelector('#tui-joystick');
  const nub = wrap.querySelector('.tui-joystick-nub');

  let joyTouch = null; // { id, originX, originY }
  let orbitTouch = null; // { id, lastX, lastY, startX, startY, startT }

  function showJoystick(x, y) {
    joystick.classList.remove('hidden');
    joystick.style.left = `${x}px`;
    joystick.style.top = `${y}px`;
    nub.style.transform = 'translate(0px, 0px)';
    onMove({ x: 0, z: 0, mag: 0 });
  }

  function moveJoystick(x, y) {
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
    return !!(target && target.closest && target.closest('.tui-btn, .tui-pause'));
  }

  wrap.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (isButtonTarget(t.target)) continue; // let the button's own click handler fire
      e.preventDefault();
      const x = t.clientX;
      const y = t.clientY;
      if (joyTouch === null && x < window.innerWidth * 0.4) {
        joyTouch = { id: t.identifier, originX: x, originY: y };
        showJoystick(x, y);
      } else if (orbitTouch === null) {
        orbitTouch = { id: t.identifier, lastX: x, lastY: y, startX: x, startY: y, startT: performance.now() };
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
        onOrbit(dx, dy);
      }
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
        orbitTouch = null;
        if (cls === 'tap') onAction('tapWorld');
      }
    }
  }
  wrap.addEventListener('touchend', handleTouchEnd, { passive: false });
  wrap.addEventListener('touchcancel', handleTouchEnd, { passive: false });

  for (const btn of wrap.querySelectorAll('.tui-btn')) {
    btn.addEventListener('click', () => onAction(btn.dataset.action));
  }
  wrap.querySelector('#tui-pause').addEventListener('click', () => onAction('pause'));

  return {
    setVisible(visible) {
      wrap.classList.toggle('hidden', !visible);
      if (!visible) {
        joyTouch = null;
        orbitTouch = null;
        hideJoystick();
      }
    },
  };
}
