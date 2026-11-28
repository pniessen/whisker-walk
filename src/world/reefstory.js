// =============================================================================
// THE REEF'S STORY: THE PLAN AND MARLO'S MOVES (milestone R2). Pure data and pure functions (no THREE, no clock, no Math.random): where Marlo
// waits, where the two shells of chapter 1 lie, the coral ledge that holds the second, the bubble columns, how a shy crab follows her, and
// the picture each goal is shown with. world/reefmarlo.js draws and runs them; the tests read them. North is -z, heights are metres over the seabed.
// docs/superpowers/plans/2026-11-26-reef.md sections 3.2 and 3.3. The numbers marked "start" are tuned from pictures.
// =============================================================================

import { REEF_BOUNDS, reefColliders, reefY } from './reefplan.js';
import { SHELL_THREE, CAVE_POCKET, wingColliders } from './reefwing.js';
import { DEEP_POCKETS, deepColliders } from './reefdeep.js';

// Marlo, the hermit crab: waits on the sand beside the ladder; once met he follows at a shy distance and waits.
export const MARLO = Object.freeze({
  start: Object.freeze({ x: -4, z: 33.5 }),
  radius: 0.3, // his own body, for the push out of coral
  reach: 2.6, // she can say hello (Interact) from this far
  give: 2.8, // she can hand over a shell from this far
  speed: 2.0, // m/s walking (he speeds up when left far behind, never past MAX_SPEED)
  maxSpeed: 4.6,
  far: 5.6, // farther than this and he scuttles after her
  near: 3.4, // he stops when this close (shy)
  shy: 1.8, // closer than this and he backs off (unless she carries a shell for him)
  eager: 1.6, // with a shell for him in her mouth he comes this close
  backOff: 2.6, // he backs away to this far
  seen: 10, // m: she is this near and he waves and shows a picture (once a walk)
});

// The shells of chapter 1 (the third, the just-right one, is milestone R5's: reefwing.js SHELL_THREE, in STORY_SHELLS below). `y` is the shell's height over the seabed; `minLift` the float it takes
// to reach it (the ledge is reached only by floating); `reach` how near (horizontally) she must be.
export const SHELLS = Object.freeze([
  Object.freeze({ id: 0, kind: 'small', x: -22.4, z: 17.2, y: 0, minLift: 0, reach: 1.7 }),
  Object.freeze({ id: 1, kind: 'big', x: 17.2, z: 1.6, y: 1.4, minLift: 0.95, reach: 2.2 }),
]);

// The coral ledge: a flat-topped column 1.4 m tall (solid on the sand, so she cannot walk beneath it; she floats up beside it and over it).
export const LEDGE = Object.freeze({ x: 17.2, z: 1.6, r: 1.1, h: 1.4 });
// All three shells in the order Marlo wants them (milestone R5 adds the just-right one, in the cave behind the coral).
export const STORY_SHELLS = Object.freeze([...SHELLS, SHELL_THREE]);
// What is solid in the story: the ledge and (milestone R5) the cave's boulders, the lantern corals and the wing's spires and larger clumps.
export const storyColliders = () => [Object.freeze({ x: LEDGE.x, z: LEDGE.z, r: LEDGE.r }), ...wingColliders(), ...deepColliders()];

// The bubble columns: scenery, rising bubbles that also keep the scatter and the dens clear of their spots.
export const POCKETS = Object.freeze([
  Object.freeze({ x: 7, z: 29.5 }), // beside the ladder (the first, in sight of the spawn)
  Object.freeze({ x: -13, z: 22 }), // by the Kelp Garden's edge
  Object.freeze({ x: 11.5, z: 5.5 }), // by the coral ledge
  Object.freeze({ x: CAVE_POCKET.x, z: CAVE_POCKET.z }), // milestone R5: ringing the cave floor where shell three lies (shell three's landmark)
  ...DEEP_POCKETS, // milestone R8: the third chain, out from the Sandy Flats to the Glow Cave's mouth
]);
export const POCKET = Object.freeze({ height: 2.6 });

// The picture a goal is shown with: a shell, a question mark or a heart (never text).
export const BUBBLE_ICON = Object.freeze({ shell: '🐚', question: '❓', heart: '💗' });

const hyp = Math.hypot;

// Marlo's colliders: the seabed's solid things and the ledge.
export const marloColliders = () => [...reefColliders(), ...storyColliders()];

// Push a point out of the colliders (and in from the walk's edge), the Moon's pushOut for this place. Returns true when it moved.
export function pushOut(p, colliders, pad = MARLO.radius) {
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
  const x = Math.min(REEF_BOUNDS.maxX - 0.5, Math.max(REEF_BOUNDS.minX + 0.5, p.x));
  const z = Math.min(REEF_BOUNDS.maxZ - 0.5, Math.max(REEF_BOUNDS.minZ + 0.5, p.z));
  if (x !== p.x || z !== p.z) moved = true;
  p.x = x; p.z = z;
  return moved;
}

// One step of Marlo, in place: m = { x, z, yaw, moving }. `follow` false: he stays where he is (not met yet, or she is away). `eager`: a shell for
// him is in her mouth. A shy follower: scuttles after her when she is far, stops when near, backs off when she crowds him. No fail, no clock.
export function marloStep(m, cat, dt, { follow = true, eager = false, colliders = marloColliders() } = {}) {
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
  m.moving = false;
  if (!follow || !cat || step === 0) return m;
  const dx = cat.x - m.x;
  const dz = cat.z - m.z;
  const d = hyp(dx, dz);
  let dir = 0;
  let speed = MARLO.speed;
  if (eager) {
    if (d > MARLO.eager + 0.3) { dir = 1; speed = Math.max(speed, 2.6); }
  } else if (d > MARLO.far || (m.chasing && d > MARLO.near)) {
    dir = 1;
    m.chasing = true;
    speed = Math.min(MARLO.maxSpeed, MARLO.speed + Math.max(0, d - MARLO.far) * 0.5);
  } else if (d < MARLO.shy) {
    dir = -1;
    speed = 1.3;
    m.chasing = false;
  } else m.chasing = false;
  if (eager) m.chasing = false;
  if (dir === 0 || d < 1e-6) return m;
  m.yaw = Math.atan2(dx * dir, dz * dir);
  m.x += (dx / d) * dir * speed * step;
  m.z += (dz / d) * dir * speed * step;
  pushOut(m, colliders);
  m.moving = true;
  return m;
}

// The seabed height under a shell's spot, and the spot's own height over the world's zero.
export const shellWorldY = (s) => reefY(s.x, s.z) + s.y;
