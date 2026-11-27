// =============================================================================
// THE JUNGLE LODGE'S STORY: THE PLAN AND MOSSY'S MOVES (milestone J2, chapter 1). Pure data and pure functions (no THREE, no clock, no Math.random): where Mossy sits, where the
// first mango waits, the kitchen table that takes it, how she turns to look at the cat, the picture each goal is shown with. world/junglelife.js draws and runs them; the tests
// read them. North is -z. The rules of the steps are junglemission.js's. The places come from the plan (jungleplan.js: the veranda, the grove). Numbers marked "start" are tuned
// from pictures. Later milestones add the banana (across the log bridge) and the cacao (the canopy walk) to FRUITS and their spots to the table's slots.
// =============================================================================

import * as P from './jungleplan.js';
import { ST } from './junglestages.js';

// Mossy, the old tortoise who keeps the lodge: she sits on the veranda (she is no follower; she lives here). She turns, slowly, to look.
export const MOSSY = Object.freeze({
  start: Object.freeze({ x: P.MOSSY_SPOT.x, z: P.MOSSY_SPOT.z }),
  radius: P.MOSSY_SPOT.r,
  reach: 2.8, // she can be greeted (Interact) from this far
  seen: 11, // m: the cat is this near and Mossy looks up with a picture (once a walk)
  turn: 2.2, // rad/s, how fast she turns to look at the cat (she is a tortoise)
  look: 14, // m: she looks at the cat from this near
});

// The three fruit, in order (J2 draws the first, the mango lying under the mango tree in the grove; the others belong to stage B). `y` is how high it lies over the ground.
export const FRUITS = Object.freeze([Object.freeze({ id: 0, kind: 'mango', x: -24.4, z: 3.2, y: 0.16, reach: 1.9 })]);
// All three, in order: the mango is this file's; the banana bunch (across the log bridge) and the cacao pod (on the canopy walk's low branch) come from stage b (milestone J5,
// world/junglewingplan.js) once it is in. A fruit may need her up on a branch (`minY`, metres over the sea of the world's zero, the same height a cat's y is read in).
export const allFruits = () => [...FRUITS, ...(ST.b?.story?.fruits ?? [])];

// The kitchen table on the veranda: the deck is 0.55 m up, so a cat under it (on the ground below the skirt) is not at the table and the fruit has to be carried UP. `slots` is
// where each fruit sits once set down; `glow` is the warm glow over the table.
const DECK = P.LODGE.deck;
export const TABLE = Object.freeze({
  x: P.KITCHEN_TABLE.x, z: P.KITCHEN_TABLE.z, y: DECK, reach: 2.6, minY: DECK - 0.3, top: DECK + 0.62,
  slots: Object.freeze([[-0.28, 0.12], [0.02, -0.14], [0.3, 0.1]].map(([dx, dz]) => Object.freeze({ x: P.KITCHEN_TABLE.x + dx, y: DECK + 0.66, z: P.KITCHEN_TABLE.z + dz }))),
  glow: Object.freeze({ x: P.KITCHEN_TABLE.x, y: DECK + 0.85, z: P.KITCHEN_TABLE.z }),
});

// The picture a goal is shown with (never text).
export const BUBBLE_ICON = Object.freeze({ fruit: '🥭', table: '🍽️', heart: '💗', spark: '✨' });

export const storyColliders = () => P.jungleColliders();
const hyp = Math.hypot;

// Push a point out of the colliders (and in from the walk's edge). Returns true when it moved.
export function pushOut(p, colliders, pad = MOSSY.radius) {
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
  const B = P.JUNGLE_BOUNDS;
  const x = Math.min(B.maxX - 0.5, Math.max(B.minX + 0.5, p.x));
  const z = Math.min(B.maxZ - 0.5, Math.max(B.minZ + 0.5, p.z));
  if (x !== p.x || z !== p.z) moved = true;
  p.x = x; p.z = z;
  return moved;
}

// One step of Mossy, in place: m = { x, z, yaw, moving }. She stays where she is and turns (by the short way, at MOSSY.turn) to face a cat within MOSSY.look; with no cat or a
// cat far away she holds her heading. No fail, no clock (the walk's dt only).
export function mossyStep(m, cat, dt) {
  m.moving = false;
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
  if (!cat || step === 0) return m;
  const dx = cat.x - m.x;
  const dz = cat.z - m.z;
  if (hyp(dx, dz) > MOSSY.look || hyp(dx, dz) < 1e-6) return m;
  const want = Math.atan2(dx, dz);
  let d = (want - m.yaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  const k = Math.min(Math.abs(d), MOSSY.turn * step);
  m.yaw += Math.sign(d) * k;
  return m;
}
