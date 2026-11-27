// =============================================================================
// THE TREEHOUSE'S STORY: THE PLAN AND NUTMEG'S MOVES (milestone T2, chapter 1). Pure data and pure functions (no THREE, no clock, no Math.random): where Nutmeg stands, where the
// first letter waits, which house takes it, how she turns to look at the cat, the picture each goal is shown with. world/treehouselife.js draws and runs them; the tests read
// them. North is -z. The rules of the steps are treehousemission.js's. The places come from the plan's ANCHORS (the post box at the roots, the Bakery deck). Numbers marked
// "start" are tuned from pictures.
// =============================================================================

import { ANCHORS, DECKS, treehouseColliders, TREEHOUSE_BOUNDS } from './treehouseplan.js';
import { ST } from './treehousestages.js';

// Nutmeg, the red squirrel postmistress: stands by the post box at the roots (she is no follower: she lives here, and her basket is too heavy to carry). She turns to look.
export const NUTMEG = Object.freeze({
  start: Object.freeze({ x: 1.6, z: 22.6 }), // start
  radius: 0.3,
  reach: 2.8, // she can be greeted (Interact) from this far
  seen: 11, // m: the cat is this near and Nutmeg looks up with a picture (once a walk)
  turn: 4, // rad/s, how fast she turns to look at the cat
  look: 14, // m: she looks at the cat from this near
});

// The three letters, in order (T2 draws the first, in the post box; the others belong to stage B). `y` is the height of the box's mouth.
export const LETTERS = Object.freeze([Object.freeze({ id: 0, x: ANCHORS.postBox.x, z: ANCHORS.postBox.z, y: 1.45, reach: 1.9 })]);
// The three houses, in order (T2 stands the Bakery's window on the low deck; the Bookshop and the Bell Tower are stage B's). `y` is the deck's height: a cat below it (on the
// ground under the deck) is not at the house, so the letter has to be carried UP; sill is where the posted letter sits and glow is the window.
const bakery = DECKS.find((d) => d.id === 'bakery');
export const HOUSES = Object.freeze([Object.freeze({
  id: 0, x: ANCHORS.bakery.x, z: ANCHORS.bakery.z, y: ANCHORS.bakery.y, reach: 2.4, minY: ANCHORS.bakery.y - 0.5,
  sill: Object.freeze({ x: bakery.hut.x + 0.9, y: bakery.y + 1.05, z: bakery.hut.z + bakery.hut.r - 0.1 }),
  glow: Object.freeze({ x: bakery.hut.x - 0.2, y: bakery.y + 1.3, z: bakery.hut.z + bakery.hut.r + 0.15 }),
})]);

// All three, in order: the first of each is this file's; the second and third (the sorting basket at the roots and the mail bag on the Bookshop deck; the Bookshop and the Bell Tower) come
// from the branches stage (milestone T5, world/treehousewingplan.js) once it is in.
export const allLetters = () => [...LETTERS, ...(ST.branches?.story?.letters ?? [])];
export const allHouses = () => [...HOUSES, ...(ST.branches?.story?.houses ?? [])];

// The picture a goal is shown with (never text).
export const BUBBLE_ICON = Object.freeze({ letter: '✉️', house: '🏠', heart: '💗', bell: '🔔', spark: '✨' });

export const storyColliders = () => treehouseColliders();
const hyp = Math.hypot;

// Push a point out of the colliders (and in from the walk's edge). Returns true when it moved.
export function pushOut(p, colliders, pad = NUTMEG.radius) {
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
  const B = TREEHOUSE_BOUNDS;
  const x = Math.min(B.maxX - 0.5, Math.max(B.minX + 0.5, p.x));
  const z = Math.min(B.maxZ - 0.5, Math.max(B.minZ + 0.5, p.z));
  if (x !== p.x || z !== p.z) moved = true;
  p.x = x; p.z = z;
  return moved;
}

// One step of Nutmeg, in place: m = { x, z, yaw, moving }. She stays where she is and turns (by the short way, at NUTMEG.turn) to face a cat within NUTMEG.look; with no cat or
// a cat far away she holds her heading. No fail, no clock (the walk's dt only).
export function nutmegStep(m, cat, dt) {
  m.moving = false;
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
  if (!cat || step === 0) return m;
  const dx = cat.x - m.x;
  const dz = cat.z - m.z;
  if (hyp(dx, dz) > NUTMEG.look || hyp(dx, dz) < 1e-6) return m;
  const want = Math.atan2(dx, dz);
  let d = (want - m.yaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  const k = Math.min(Math.abs(d), NUTMEG.turn * step);
  m.yaw += Math.sign(d) * k;
  return m;
}
