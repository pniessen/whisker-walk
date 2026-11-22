// Thin DOM glue for game controllers (walk only). Polls navigator.getGamepads()
// once per frame from the game's own loop, runs gamepadinput.js's pure step,
// and sends the result down the SAME paths touch uses. Safe no-op where the
// Gamepad API is missing (older iOS/Safari builds).
import { createPadState, stepPad } from './gamepadinput.js';

export function createGamepad({
  win = window, nav = navigator,
  getEngaged, getCameraMode, isFighting, canResume,
  onMove, onOrbit, onAction, onResume, toast,
}) {
  const supported = typeof nav?.getGamepads === 'function';
  let activeIndex = null;
  let state = createPadState();
  let announced = false;

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
      if (!announced) { announced = true; toast?.('Controller connected 🎮'); }
    });
    win.addEventListener?.('gamepaddisconnected', (e) => {
      if (e.gamepad?.index !== activeIndex) return;
      activeIndex = null;
      // Let go of the stick if it was held when the cable came out.
      if (state.moving) onMove?.(null);
      state = createPadState();
    });
  }

  return {
    supported,
    // Called once per frame, whether or not a walk is live.
    poll(dt) {
      if (!supported) return;
      const pad = pick();
      if (!pad) return;
      const engaged = !!getEngaged?.();
      const r = stepPad(state, pad, dt, { engaged, cameraMode: !!getCameraMode?.(), fighting: !!isFighting?.() });
      if (r.move !== undefined) onMove?.(r.move);
      if (r.orbit) onOrbit?.(r.orbit.dx, r.orbit.dy);
      for (const name of r.actions) {
        if (name === 'pause' && !engaged) { if (canResume?.()) onResume?.(); }
        else onAction?.(name);
      }
    },
  };
}
