// =============================================================================
// SNOWVILLE'S STORY: THE PLAN AND TILLY'S MOVES (milestone V2, chapter 1). Pure data and pure functions (no THREE, no clock, no Math.random): where Tilly waits, where the first
// candle lies, which lantern takes it, how a shy hare follows her, the picture each goal is shown with. world/snowvillelife.js draws and runs them; the tests read them. North
// is -z. The rules of the steps are snowvillemission.js's. The coordinates sit inside the circles snowvilleplan.js keeps clear (KEEP_OUT). Numbers marked "start" are tuned
// from pictures.
// =============================================================================

import { SNOWVILLE_BOUNDS, snowY, snowvilleColliders, SQUARE_FIR } from './snowvilleplan.js';

// Tilly, the snow hare (the lamplighter's apprentice): waits by the gate court; once met she follows at a shy distance, hopping.
export const TILLY = Object.freeze({
  start: Object.freeze({ x: -8, z: 20 }),
  radius: 0.3, // her own body, for the push out of firs and cottages
  reach: 2.8, // she can be greeted (Interact) from this far
  speed: 2.2, // m/s when she follows (she speeds up when left far behind, never past maxSpeed)
  maxSpeed: 5,
  far: 6, // farther than this and she hurries after her
  near: 3.4, // she stops when this close (shy)
  shy: 1.8, // closer than this and she backs off a little
  seen: 11, // m: she is this near and Tilly looks up with a picture (once a walk)
});

// The three candles, in order (V2 draws the first; the pond's and the hill's belong to stage B). A glint hangs over the wanted one.
export const CANDLES = Object.freeze([Object.freeze({ id: 0, x: -1, z: 18, reach: 1.9 })]);
export const CANDLE_Y = 0.35; // m over the snow
// The three lanterns, in order (V2 stands the Square lantern, beside the village fir; the other two are stage B's).
export const LANTERNS = Object.freeze([Object.freeze({ id: 0, x: SQUARE_FIR.x - 2.6, z: SQUARE_FIR.z + 1.6, reach: 3.2, h: 2.3 })]);
export const candleWorldY = (c) => snowY(c.x, c.z) + CANDLE_Y;

// The picture a goal is shown with (never text).
export const BUBBLE_ICON = Object.freeze({ lantern: '🏮', spark: '✨', heart: '💗' });

export const storyColliders = () => snowvilleColliders();
const hyp = Math.hypot;

// Push a point out of the colliders (and in from the walk's edge). Returns true when it moved.
export function pushOut(p, colliders, pad = TILLY.radius) {
  let moved = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const need = c.r + pad;
      const d2 = dx * dx + dz * dz;
      if (d2 >= need * need) continue;
      const d = Math.sqrt(d2);
      p.x = c.x + (d > 1e-9 ? dx / d : 1) * need;
      p.z = c.z + (d > 1e-9 ? dz / d : 0) * need;
      moved = true;
    }
  }
  const B = SNOWVILLE_BOUNDS;
  const x = Math.min(B.maxX - 0.5, Math.max(B.minX + 0.5, p.x));
  const z = Math.min(B.maxZ - 0.5, Math.max(B.minZ + 0.5, p.z));
  if (x !== p.x || z !== p.z) moved = true;
  p.x = x; p.z = z;
  return moved;
}

// One step of Tilly, in place: m = { x, z, yaw, moving, chasing }. `follow` false: she stays where she is (not met yet). A shy follower: hops after her when she is far, stops
// when near, backs off a little when crowded. No fail, no clock.
export function tillyStep(m, cat, dt, { follow = true, colliders = storyColliders() } = {}) {
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
  m.moving = false;
  if (!follow || !cat || step === 0) return m;
  const dx = cat.x - m.x;
  const dz = cat.z - m.z;
  const d = hyp(dx, dz);
  let dir = 0;
  let speed = TILLY.speed;
  if (d > TILLY.far || (m.chasing && d > TILLY.near)) {
    dir = 1;
    m.chasing = true;
    speed = Math.min(TILLY.maxSpeed, TILLY.speed + Math.max(0, d - TILLY.far) * 0.5);
  } else if (d < TILLY.shy) {
    dir = -1;
    speed = 1.4;
    m.chasing = false;
  } else m.chasing = false;
  if (dir === 0 || d < 1e-6) return m;
  m.yaw = Math.atan2(dx * dir, dz * dir);
  m.x += (dx / d) * dir * speed * step;
  m.z += (dz / d) * dir * speed * step;
  pushOut(m, colliders);
  m.moving = true;
  return m;
}
