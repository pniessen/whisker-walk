// Pure math for game-controller walking: dead zones, edge detection, the
// button map and the "only talk when something changed" rule. No DOM here —
// gamepad.js owns navigator.getGamepads() and the events.
//
// Standard layout (DualSense / Xbox / most pads in Chrome, Safari, Firefox):
//   buttons 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle, 4 L1, 5 R1,
//   9 Start/Options; axes 0/1 left stick, 2/3 right stick.
//
// Our map (feeds the same action names touch uses):
//   A/Cross -> pounce/climb (or, in the photo viewfinder, take the photo)
//   X/Square -> interact (sniff, talk, pick up)
//   B/Circle -> meow
//   Y/Triangle -> photo mode on/off
//   L1 -> zoom out, R1 -> zoom in
//   Start/Options -> pause (and resume while paused)
//   left stick -> move (a light push stalks), right stick -> orbit camera

export const PAD_BUTTONS = Object.freeze({ A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, START: 9 });

export const STICK_DEAD = 0.18;
// Camera speed at full right-stick push, in the units player.addOrbit takes
// (yaw -= dx*0.0045, pitch += dy*0.004): about 2.3 and 1.4 radians a second.
export const ORBIT_PX_PER_SEC_X = 520;
export const ORBIT_PX_PER_SEC_Y = 350;

/** Button name -> action name handleTouchAction/zoomBy understand. */
export const BUTTON_ACTIONS = Object.freeze({
  [PAD_BUTTONS.A]: 'pounce',
  [PAD_BUTTONS.B]: 'meow',
  [PAD_BUTTONS.X]: 'interact',
  [PAD_BUTTONS.Y]: 'camera',
  [PAD_BUTTONS.L1]: 'zoomOut',
  [PAD_BUTTONS.R1]: 'zoomIn',
  [PAD_BUTTONS.START]: 'pause',
});

/** Y / Triangle is photo mode everywhere except a den walk with no viewfinder up, where it opens the den panel. */
export const yOpensDen = (name, denActive, cameraMode) => name === 'camera' && !!denActive && !cameraMode;

/** Radial dead zone, rescaled so the edge of the zone reads 0 and a full push 1. */
export function applyDeadZone(x, y, dead = STICK_DEAD) {
  const ax = Number.isFinite(x) ? x : 0;
  const ay = Number.isFinite(y) ? y : 0;
  let mag = Math.hypot(ax, ay);
  if (mag <= dead) return { x: 0, y: 0, mag: 0 };
  if (mag > 1) mag = Math.min(mag, 1.5); // some pads overshoot the unit circle
  const scaled = Math.min(1, (mag - dead) / (1 - dead));
  const k = scaled / Math.hypot(ax, ay);
  return { x: ax * k, y: ay * k, mag: scaled };
}

/** Left stick -> the {x, z, mag} shape player.setTouchMove takes (z = screen-down). */
export function stickToMove(ax, ay, dead = STICK_DEAD) {
  const s = applyDeadZone(ax, ay, dead);
  return { x: s.x, z: s.y, mag: s.mag };
}

/** Right stick -> a frame's addOrbit(dx, dy); frame-rate independent. */
export function orbitDelta(ax, ay, dt, dead = STICK_DEAD) {
  const s = applyDeadZone(ax, ay, dead);
  if (s.mag === 0 || !(dt > 0)) return { dx: 0, dy: 0 };
  return { dx: s.x * ORBIT_PX_PER_SEC_X * dt, dy: s.y * ORBIT_PX_PER_SEC_Y * dt };
}

export function isPressed(b) {
  if (b == null) return false;
  if (typeof b === 'number') return b > 0.5;
  return !!b.pressed || (b.value ?? 0) > 0.5;
}

/** Indices pressed this frame but not last frame (no repeat while held). */
export function pressedEdges(prev, current) {
  const out = [];
  for (let i = 0; i < current.length; i++) {
    if (current[i] && !prev[i]) out.push(i);
  }
  return out;
}

export function createPadState() {
  return { buttons: [], moving: false };
}

/**
 * One frame of one pad. Returns what to do:
 *   move   undefined = leave the touch/keyboard path alone; a vector = call
 *          setTouchMove(vec); null = the stick just went idle, call
 *          setTouchMove(null) ONCE.
 *   orbit  null, or {dx, dy} to hand to addOrbit.
 *   actions  action names pressed this frame, in button order.
 * opts.cameraMode turns A into a photo shutter; opts.fighting drops the
 * action buttons (the clan-fight card owns them); opts.engaged = the walk is
 * live (when it is not, only Start does anything, and sticks are ignored).
 */
export function stepPad(state, pad, dt, opts = {}) {
  const { cameraMode = false, fighting = false, engaged = true } = opts;
  const out = { move: undefined, orbit: null, actions: [] };
  const axes = pad?.axes ?? [];
  const cur = (pad?.buttons ?? []).map(isPressed);
  const edges = pressedEdges(state.buttons, cur);
  state.buttons = cur;

  const mv = engaged ? stickToMove(axes[0], axes[1]) : { x: 0, z: 0, mag: 0 };
  if (mv.mag > 0) {
    out.move = mv;
    state.moving = true;
  } else if (state.moving) {
    out.move = null;
    state.moving = false;
  }
  if (engaged) {
    const o = orbitDelta(axes[2], axes[3], dt);
    if (o.dx !== 0 || o.dy !== 0) out.orbit = o;
  }

  for (const i of edges) {
    let name = BUTTON_ACTIONS[i];
    if (!name) continue;
    if (name === 'pause') { out.actions.push(name); continue; } // Start always works
    if (!engaged || fighting) continue;
    if (name === 'pounce' && cameraMode) name = 'tapWorld';
    out.actions.push(name);
  }
  return out;
}
