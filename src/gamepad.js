// Thin DOM glue for game controllers. Polls navigator.getGamepads() once per
// frame from the game's own loop and decides who owns the pad:
//   walk  (engaged, or the clan-fight sheet): gamepadinput.js's pure step,
//         sent down the SAME paths touch uses;
//   none  (the "Off to ..." crossing): the pad does nothing;
//   menu  (everything else): the menu navigator (gamepadnav.js).
// A button held across a switch is ignored until it is let go. Safe no-op
// where the Gamepad API is missing (older iOS/Safari builds).
import { createPadState, stepPad, applyDeadZone, isPressed, PAD_BUTTONS } from './gamepadinput.js';
import { repeatGate } from './gamepadnavcore.js';
import { line } from './tutorialwords.js';

const DPAD = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const STICK_NAV = 0.5; // a menu step needs a firm push
const SCROLL_PX_PER_SEC = 700;

export function createGamepad({
  win = window, nav = navigator,
  getEngaged, getCameraMode, isFighting, isWalkingOn, canResume,
  onMove, onOrbit, onAction, onResume, toast,
  menuNav = null, padBack = null, doc = typeof document === 'undefined' ? null : document,
}) {
  const supported = typeof nav?.getGamepads === 'function';
  let activeIndex = null;
  let state = createPadState();
  let announced = false;
  let mode = 'walk';
  let clock = 0;
  let gate = null;
  let held = new Set(); // buttons down when the owner changed: ignored until let go
  let prevDown = new Set();

  // The focus ring shows only after the pad was used, and goes on any other input.
  const setRing = (on) => { try { doc?.body?.classList?.[on ? 'add' : 'remove']('pad-focus'); } catch { /* no DOM */ } };
  const ringOff = () => setRing(false);
  const RING_OFF = ['pointerdown', 'keydown', 'touchstart'];
  for (const t of RING_OFF) win.addEventListener?.(t, ringOff, true);

  const pick = () => {
    let pads;
    try { pads = nav.getGamepads() || []; } catch { return null; }
    if (activeIndex != null && pads[activeIndex]?.connected) return pads[activeIndex];
    for (const p of pads) {
      if (p && p.connected && p.mapping === 'standard') { activeIndex = p.index; state = createPadState(); return p; }
    }
    activeIndex = null;
    return null;
  };

  if (supported) {
    win.addEventListener?.('gamepadconnected', (e) => {
      if (e.gamepad?.mapping !== 'standard') return; // unknown layout: do nothing rather than guess
      if (activeIndex == null) { activeIndex = e.gamepad.index; state = createPadState(); }
      if (!announced) { announced = true; toast?.(line('pad.connected')); }
    });
    win.addEventListener?.('gamepaddisconnected', (e) => {
      if (e.gamepad?.index !== activeIndex) return;
      activeIndex = null;
      // Let go of the stick if it was held when the cable came out.
      if (state.moving) onMove?.(null);
      state = createPadState();
    });
  }

  const modeNow = () => {
    if (!menuNav) return 'walk';
    if (isWalkingOn?.()) return 'none';
    return getEngaged?.() || isFighting?.() ? 'walk' : 'menu';
  };

  // One frame in menu mode. `down` = the pad's buttons as booleans, armed ones only.
  function menuFrame(pad, down, dt) {
    const axes = pad.axes ?? [];
    const edge = (i) => down[i] && !prevDown.has(i);
    let dir = null;
    for (const i of Object.keys(DPAD)) if (down[i]) dir = DPAD[i];
    if (!dir) {
      const x = axes[0] || 0, y = axes[1] || 0;
      if (Math.hypot(x, y) > STICK_NAV) dir = Math.abs(x) >= Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
    }
    const r = repeatGate(gate, clock, !!dir);
    gate = r.state;
    const rs = applyDeadZone(axes[2], axes[3]);
    const sx = rs.x * SCROLL_PX_PER_SEC * dt, sy = rs.y * SCROLL_PX_PER_SEC * dt;
    const used = dir || rs.mag > 0 || down.some((d, i) => d && edge(i));
    if (used) setRing(true);
    if (dir && r.fire) {
      const el = doc?.activeElement;
      const slider = (dir === 'left' || dir === 'right') && (el?.type === 'range' || el?.tagName === 'SELECT');
      if (slider) menuNav.alt(dir);
      else menuNav.step(dir, clock);
    }
    if (sx || sy) menuNav.scroll(sx, sy);
    if (edge(PAD_BUTTONS.A)) menuNav.press();
    if (edge(PAD_BUTTONS.B)) padBack?.();
    if (edge(PAD_BUTTONS.L1)) menuNav.zoom?.('out');
    if (edge(PAD_BUTTONS.R1)) menuNav.zoom?.('in');
    if (edge(PAD_BUTTONS.START) && canResume?.()) onResume?.();
  }

  return {
    supported,
    destroy() { for (const t of RING_OFF) win.removeEventListener?.(t, ringOff, true); },
    // Called once per frame, whether or not a walk is live.
    poll(dt) {
      if (!supported) return;
      const pad = pick();
      if (!pad) return;
      clock += dt * 1000;
      const next = modeNow();
      const raw = (pad.buttons ?? []).map(isPressed);
      const downSet = (arr) => new Set(arr.flatMap((d, i) => (d ? [i] : [])));
      if (next !== mode) {
        // Let go of the stick if the walk had it; whatever is held now stays ignored.
        if (mode === 'walk' && state.moving) onMove?.(null);
        state = createPadState();
        gate = null;
        held = downSet(raw);
        prevDown = new Set(held);
        mode = next;
        if (mode === 'menu') menuNav.enter();
      }
      for (const i of [...held]) if (!raw[i]) held.delete(i);
      const buttons = raw.map((d, i) => d && !held.has(i));
      if (mode === 'none') return;
      if (mode === 'menu') {
        menuFrame(pad, buttons, dt);
        prevDown = downSet(buttons);
        return;
      }
      // Walk: today's step, with held-over buttons masked out until let go.
      const masked = held.size ? { ...pad, buttons } : pad;
      const engaged = !!getEngaged?.();
      const r = stepPad(state, masked, dt, { engaged, cameraMode: !!getCameraMode?.(), fighting: !!isFighting?.() });
      if (r.move !== undefined) onMove?.(r.move);
      if (r.orbit) onOrbit?.(r.orbit.dx, r.orbit.dy);
      for (const name of r.actions) {
        if (name === 'pause' && !engaged) { if (canResume?.()) onResume?.(); }
        else onAction?.(name);
      }
    },
  };
}
