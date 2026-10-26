// =============================================================================
// The dog in its yard — the pure half (v21 Stream 3b, Task 16).
//
// Every outdoor area has one dog, lying by its kennel on a fixed lawn
// (propsets.js's dogYard: a centre, a radius and a kennel). Trot onto its lawn
// and it barks and chases you off; stalk in and you get halfway to its kennel
// before it notices. src/yarddog.js is the THREE half, and game/walk.js wires
// it up.
//
// THE DOG TAKES NOTHING (v21 spec section 10.1): no points, no freeze, no drop
// (a carried item stays in your mouth), no marks, no taming. This module and
// yarddog.js import nothing that stores progress, and test/yarddog.test.js
// pins both import lists, the way test/rivalcats.test.js pins rivalcats.js.
//
// ZERO IMPORTS. No randomness of any kind (never walkRng, never Math.random):
// everything here is a function of the yard and the cat's position.
// =============================================================================

// A stalking cat is noticed only this close to the yard's centre, as a
// fraction of the yard's radius; a walking or trotting one anywhere inside.
export const DOG_NOTICE_STALKED = 0.5;
// Where a chased cat is put: this far beyond the yard's edge.
export const DOG_LANDING_OFFSET = 1.5;
// Seconds with no new bark or chase after one ends, so toasts never stack.
export const DOG_COOLDOWN = 8;
// The breed specials the dog only barks at — the same pair the old critter
// dog's bark-freeze spared (retired with it in Task 16).
export const DOG_FEARLESS = Object.freeze(['fearless', 'steady']);

// findLanding's search pattern (rivalcats.js): further out along the ray in
// RAY_TRIES steps of RAY_STEP, then ARC_STEP rotations either way at the base
// reach.
const RAY_STEP = 0.75;
const RAY_TRIES = 6;
const ARC_STEP = Math.PI / 12;
const ARC_TRIES = 12;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

// A yard we can reason about: a finite centre and a positive finite radius.
// Own-property reads only, so a hostile object never reaches the prototype.
function yardOf(yard) {
  if (yard === null || typeof yard !== 'object') return null;
  const x = Object.hasOwn(yard, 'x') ? yard.x : undefined;
  const z = Object.hasOwn(yard, 'z') ? yard.z : undefined;
  const r = Object.hasOwn(yard, 'r') ? yard.r : undefined;
  if (!finite(x) || !finite(z) || !finite(r) || r <= 0) return null;
  const k = Object.hasOwn(yard, 'kennel') ? yard.kennel : null;
  const kennel = k !== null && typeof k === 'object' && finite(k.x) && finite(k.z) ? { x: k.x, z: k.z } : null;
  // A fenced yard's way out (propsets.js): a direction, normalised here; a
  // zero, non-finite or missing one is no exit.
  const e = Object.hasOwn(yard, 'exit') ? yard.exit : null;
  const el = e !== null && typeof e === 'object' && finite(e.x) && finite(e.z) ? Math.hypot(e.x, e.z) : 0;
  const exit = el > 1e-6 ? { x: e.x / el, z: e.z / el } : null;
  return { x, z, r, kennel, exit };
}

const isPt = (p) => p !== null && typeof p === 'object' && finite(p.x) && finite(p.z);

// isFearless(special) → true for a breed special the dog only barks at.
export function isFearless(special) {
  return typeof special === 'string' && DOG_FEARLESS.includes(special);
}

// inYard(yard, x, z) → whether (x, z) is on the dog's lawn: strictly inside
// the yard's radius. False for a bad yard or a non-finite point.
export function inYard(yard, x, z) {
  const y = yardOf(yard);
  if (!y || !finite(x) || !finite(z)) return false;
  return Math.hypot(x - y.x, z - y.z) < y.r;
}

// dogNotices(yard, catPos, { stalking }) → whether the dog sees the cat: on
// its lawn, and — while stalking — within r * DOG_NOTICE_STALKED of the
// centre. Never throws.
export function dogNotices(yard, catPos, { stalking = false } = {}) {
  const y = yardOf(yard);
  if (!y || !isPt(catPos)) return false;
  const d = Math.hypot(catPos.x - y.x, catPos.z - y.z);
  if (!(d < y.r)) return false;
  return stalking === true ? d <= y.r * DOG_NOTICE_STALKED : true;
}

// dogLanding(yard, catPos, isWalkable) → { x, z } just off the lawn, or null.
// First choice: on the ray from the yard's centre through the cat — or, for a
// fenced yard with an `exit`, out along the exit through the fence's opening
// (R38: a chase never scampers the cat through the fence) — at
// r + DOG_LANDING_OFFSET. If the walk's isWalkable(x, z) refuses it, the same
// search rivalcats.js's findLanding makes: further along the ray, then
// rotated round the circle. A cat dead on the centre of an open yard runs
// away from the kennel. Null — nothing walkable — means no chase, never a cat
// left on the lawn.
export function dogLanding(yard, catPos, isWalkable) {
  const y = yardOf(yard);
  if (!y || !isPt(catPos) || typeof isWalkable !== 'function') return null;
  let dx = y.exit ? y.exit.x : catPos.x - y.x;
  let dz = y.exit ? y.exit.z : catPos.z - y.z;
  let d = Math.hypot(dx, dz);
  if (d < 1e-6 && y.kennel) {
    dx = y.x - y.kennel.x;
    dz = y.z - y.kennel.z;
    d = Math.hypot(dx, dz);
  }
  if (d < 1e-6) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
  const ok = (x, z) => !inYard(y, x, z) && isWalkable(x, z) === true;

  const reach = y.r + DOG_LANDING_OFFSET;
  for (let k = 0; k <= RAY_TRIES; k++) {
    const rr = reach + k * RAY_STEP;
    const x = y.x + dx * rr;
    const z = y.z + dz * rr;
    if (ok(x, z)) return { x, z };
  }
  const base = Math.atan2(dz, dx);
  for (let k = 1; k <= ARC_TRIES; k++) {
    for (const sign of [1, -1]) {
      const a = base + sign * k * ARC_STEP;
      const x = y.x + Math.cos(a) * reach;
      const z = y.z + Math.sin(a) * reach;
      if (ok(x, z)) return { x, z };
    }
  }
  return null;
}
