// =============================================================================
// THE CRYSTAL CAVE'S STORY: THE PLAN AND LUMI'S MOVES (milestone C2, chapter 1). Pure data and pure functions (no THREE, no clock, no Math.random): where Lumi
// waits, where the rose spark stone lies, which crystal takes it, how a shy glow-worm follows her, the picture each goal is shown with. world/crystallife.js draws
// and runs them; the tests read them. North is -z. The rules of the steps are src/crystalmission.js's. The numbers marked "start" are tuned from pictures.
// =============================================================================

import { CRYSTAL_BOUNDS, ROSE_GREAT, crystalColliders, crystalY } from './crystalplan.js';
import { WING_STONES, WING_CRYSTALS, HEART_GREAT } from './crystalwingplan.js';

// Lumi, the baby glow-worm: waits just inside the entrance; once met she follows at a shy distance and waits.
export const LUMI = Object.freeze({
  start: Object.freeze({ x: 3.4, z: 21.2 }),
  radius: 0.25, // her own body, for the push out of crystals
  reach: 2.6, // she can say hello (Interact) from this far
  speed: 1.8, // m/s crawling (she speeds up when left far behind, never past maxSpeed)
  maxSpeed: 4.4,
  far: 5.6, // farther than this and she hurries after her
  near: 3.2, // she stops when this close (shy)
  shy: 1.7, // closer than this and she backs off (unless she carries nothing, she is only shy)
  backOff: 2.6,
  seen: 10, // m: she is this near and Lumi peeks out with a picture (once a walk)
});

// The great crystals the stones go to, in order (rose, blue, gold: milestone C5 added the last two). `reach` is how near the cat must stand to set a stone.
export const CRYSTALS = Object.freeze([
  Object.freeze({ id: 'rose', x: ROSE_GREAT.x, z: ROSE_GREAT.z, reach: 3.7, hue: 'rose' }),
  ...WING_CRYSTALS,
]);
// The Heart Crystal: stand within `reach` of it (a ring of small crystals round it) and the action button wakes it (or replays the show once the story is done).
export const HEART = Object.freeze({ x: HEART_GREAT.x, z: HEART_GREAT.z, reach: HEART_GREAT.reach });

// The spark stones, in order: the rose one on the far side of a crystal cluster in the Rose hall (a glint hangs over it); the sky one on the Blue Pool's far shore;
// the gold one in a nook ringed by glints in the Gold Gallery.
export const STONES = Object.freeze([
  Object.freeze({ id: 0, hue: 'rose', x: -18.76, z: 9.24, reach: 1.7, hideBehind: Object.freeze({ x: -17.19, z: 10.77 }) }),
  ...WING_STONES,
]);
export const STONE_Y = 0.35; // m over the floor

// What is solid in the story: nothing beyond the world's own colliders.
export const storyColliders = () => crystalColliders();

// The picture a goal is shown with: a spark or a heart (never text).
export const BUBBLE_ICON = Object.freeze({ spark: '✨', heart: '💗' });

const hyp = Math.hypot;

// Push a point out of the colliders (and in from the walk's edge). Returns true when it moved.
export function pushOut(p, colliders, pad = LUMI.radius) {
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
  const x = Math.min(CRYSTAL_BOUNDS.maxX - 0.5, Math.max(CRYSTAL_BOUNDS.minX + 0.5, p.x));
  const z = Math.min(CRYSTAL_BOUNDS.maxZ - 0.5, Math.max(CRYSTAL_BOUNDS.minZ + 0.5, p.z));
  if (x !== p.x || z !== p.z) moved = true;
  p.x = x; p.z = z;
  return moved;
}

// One step of Lumi, in place: m = { x, z, yaw, moving }. `follow` false: she stays where she is (not met yet). A shy follower: crawls after her when she is far,
// stops when near, backs off a little when crowded. No fail, no clock.
export function lumiStep(m, cat, dt, { follow = true, colliders = storyColliders() } = {}) {
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
  m.moving = false;
  if (!follow || !cat || step === 0) return m;
  const dx = cat.x - m.x;
  const dz = cat.z - m.z;
  const d = hyp(dx, dz);
  let dir = 0;
  let speed = LUMI.speed;
  if (d > LUMI.far || (m.chasing && d > LUMI.near)) {
    dir = 1;
    m.chasing = true;
    speed = Math.min(LUMI.maxSpeed, LUMI.speed + Math.max(0, d - LUMI.far) * 0.5);
  } else if (d < LUMI.shy) {
    dir = -1;
    speed = 1.2;
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

// The stone's spot and its height over the world's zero.
export const stoneWorldY = (s) => crystalY(s.x, s.z) + STONE_Y;
