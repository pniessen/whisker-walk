// =============================================================================
// THE FAIRGROUND: BEAUTY PASS 1 (2026-11-28), finery. Confetti and dropped popcorn on the midway and round the plaza, and a warm lantern on a little arm
// at every bunting pole with a pennant streaming from its top. All of it rides the fair's EXISTING lists (fence: flat, non-casting; bulbs: the glow mesh, so
// the lanterns chase and glow at dusk with the other bulbs; flags: the fluttering canvas; solid: the arms), so no mesh, no draw call and no caster is added.
// Its own seeded stream; no clock, no Math.random, no text. Flat pieces are one face, up (they are never seen from below).
// =============================================================================

import { mulberry32 } from '../rng.js';
import { lid } from './fairedge.js';
import { box, bulb, sheet, swayOf } from './fairkit.js';

const CONFETTI = Object.freeze([0xe8423a, 0xf6c92e, 0x3aa0e0, 0x4cba62, 0xf58a2e, 0xb061d6, 0xf59ac0, 0xfff0d0]);
const LANTERN = Object.freeze([0xffd75a, 0xff9a5a, 0xfff0b8, 0xff8f6a]);
const Y = 0.075; // over the lawn, the sawdust trail and the scuffs (0.04)

/** Pure, seeded. `ok(x, z, margin)` is the fair's open-ground check. Returns the confetti: [{ x, z, r, yaw, hex }]. */
export function confettiPlan(ok, count = 120) {
  const rng = mulberry32(0x636f6e66); // 'conf'
  const out = [];
  for (let tries = 0; out.length < count && tries++ < 6000;) {
    const mid = out.length % 3 !== 2;
    // the midway's trodden strip, or the ring round the plaza
    let x; let z;
    if (mid) { x = (rng() - 0.5) * 6.4; z = 10 + rng() * 34; } else {
      const a = rng() * Math.PI * 2; const d = 7.5 + rng() * 3.2; x = Math.sin(a) * d; z = Math.cos(a) * d;
    }
    if (mid || ok(x, z, 0.4)) out.push({ x, z, r: 0.07 + rng() * 0.06, yaw: rng() * 6, hex: CONFETTI[out.length % CONFETTI.length] });
  }
  return out;
}

/** Confetti onto `P` (the fair's non-casting list): little four-corner bits, two triangles each. */
export function drawConfetti(P, plan) {
  for (const c of plan) lid(P, c.r, Y, c.hex, 4, c.x, c.z, c.yaw);
}

/**
 * A lantern on an arm and a pennant, for the pole at (x, z) of height h; `toward` = [x, z], the way the arm reaches.
 * K = the fair's kit lists.
 */
export function poleFinery(K, x, z, h, toward, salt) {
  const dx = toward[0] - x; const dz = toward[1] - z; const l = Math.hypot(dx, dz) || 1;
  const ux = dx / l; const uz = dz / l;
  const y = 4.4;
  const ax = x + ux * 0.55; const az = z + uz * 0.55;
  box(K.solid, 0.04, 0.04, 0.55, (x + ax) / 2, y + 0.06, (z + az) / 2, 0x4a4038, { c: true, yaw: Math.atan2(ux, uz) }); // the arm
  bulb(K.bulbs, ax, y - 0.1, az, LANTERN[salt % LANTERN.length], 0.095); // the lantern's glass
  box(K.solid, 0.15, 0.04, 0.15, ax, y + 0.0, az, 0xc9a23a, { c: true }); // its brass cap
  // a pennant streaming from the pole top, a free tip that flutters
  const px = -uz; const pz = ux;
  swayOf(sheet(K.flags, [[x, h - 0.05, z], [x + px * 0.02, h - 0.55, z + pz * 0.02], [x + px * 1.1 + ux * 0.1, h - 0.3, z + pz * 1.1 + uz * 0.1]], CONFETTI[(salt * 3) % 6]), [0, 0, 1]);
}
