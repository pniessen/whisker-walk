// =============================================================================
// THE JUNGLE LODGE: BEAUTY PASS 4 (2026-11-28), stories in the details, the seasons and a rare surprise. NET ZERO triangles, no mesh, no caster, no light, no collider, no word.
//   * STORIES (still pieces in stage b's non-casting bucket; repaints and swaps of what was there, and a few small things paid for by trimming hidden undersides elsewhere):
//     the veranda (a half-carved cat post with shavings at one end, a low tea table with a pot, two cups and cushions at the other), the path (three hand-painted trail signs with
//     a house, a wave and a mango, and a line of muddy paw prints), the river bank (a fishing pole, a bucket of fish and a straw hat), the drying rack hung with painted gourds
//     (in jungleprops.js), a book left open in the hammock (jungleprops.js), and cat faces on the two totems (junglebeauty2.js).
//   * SEASONS by the date (wet: Nov to Apr; dry: May to Oct), only through uniforms the place already has: the haze's reach and tint, the sway cloth's tint, the mist, the river's
//     sparkles and a shrub's petals. Pure: `seasonOf(date)`.
//   * a RARE SURPRISE, from the walk's clock and pooled points / the flock's existing vertices only: parrots spiralling up in the sky, night-blooms opening for a minute at dusk, and
//     a chorus of distant monkeys (sound only). `surpriseAt(t)` and `bloomAt(t)` are pure and seeded.
// Draws no random number at run time; reads no clock (the date arrives from the caller). Reduced motion: nothing here moves (no surprise); the lower rungs draw fewer points.
// =============================================================================
import * as THREE from 'three';
import * as P from './jungleplan.js';
import { paint, pad } from './jungleparts.js';

const TAU = Math.PI * 2;
const hash = (n) => { let h = (n * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** The upper half of a non-indexed solid (its lower faces are never seen from the walk's camera, or lie under the ground): the faces whose middle is at or above y0. */
export function topHalf(g, y0 = 0) {
  const a = g.attributes.position.array; const o = [];
  for (let i = 0; i < a.length; i += 9) if ((a[i + 1] + a[i + 4] + a[i + 7]) / 3 >= y0 - 1e-4) for (let k = 0; k < 9; k++) o.push(a[i + k]);
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.Float32BufferAttribute(o, 3)); g.dispose();
  return r;
}

// ---- the seasons ------------------------------------------------------------------------------------------------------------------------------
export const seasonOf = (d) => { const m = (d instanceof Date ? d : new Date()).getMonth(); return m >= 10 || m <= 3 ? 'wet' : 'dry'; };
/** mist, glint, petals (a share), tint (the sway cloth's colour factor), far / near (the haze's reach), gold (how far the haze leans to gold) */
export const SEASON = Object.freeze({
  wet: Object.freeze({ mist: 1.7, glint: 1.8, petals: 1, tint: [1.14, 1.1, 1.14], far: 0.8, near: 0.8, gold: 0 }),
  dry: Object.freeze({ mist: 0.55, glint: 0.55, petals: 0.5, tint: [1, 0.92, 0.72], far: 1.22, near: 1.15, gold: 0.55 }),
});

// ---- the surprise ----------------------------------------------------------------------------------------------------------------------------
export const SURPRISE = Object.freeze({ slot: 210, chance: 0.5, spiral: 15, monkeys: 10, bloom: 60, dusk: 0.66 });
/** The surprise of walk time t: null, or { kind: 'spiral' | 'monkeys', age, dur, k }; one try a slot, about half of them happen, each a different time within its slot. Pure. */
export function surpriseAt(t) {
  const k = Math.floor(t / SURPRISE.slot);
  if (k < 0 || hash(k * 7 + 5) >= SURPRISE.chance) return null;
  const kind = hash(k * 11 + 2) < 0.5 ? 'spiral' : 'monkeys';
  const age = t - (k * SURPRISE.slot + 20 + 60 * hash(k * 13 + 3));
  return age >= 0 && age < SURPRISE[kind] ? { kind, age, dur: SURPRISE[kind], k } : null;
}
/** How open the night-blooms are at walk time t, 0 to 1: about half the dusks open them, a minute (twenty seconds opening, twenty open, twenty closing). Pure. */
export const bloomRamp = (a) => (a < 0 || a >= SURPRISE.bloom ? 0 : a < 20 ? a / 20 : a < 40 ? 1 : (60 - a) / 20);
export function bloomAt(t, DAY = 420) {
  const n = Math.floor((t - SURPRISE.dusk * DAY + 20) / DAY);
  return n < 0 || hash(n * 3 + 31) >= SURPRISE.chance ? 0 : bloomRamp(t - (n * DAY + SURPRISE.dusk * DAY - 20));
}
/** The night-bloom points: the first anchors' flower spots (pass 1's clusters), a glowing bloom each. [{ x, z, y, hex, big }] */
const NIGHT = Object.freeze([0x35f0d0, 0xb06aff, 0xff7ad0, 0x6aa0ff]);
export function bloomSpots(anchors, n) {
  const out = [];
  for (const an of anchors) for (const f of an.blooms) if (out.length < n) { const x = an.x + f.dx * 1.4; const z = an.z + f.dz * 1.4; out.push({ x, z, y: P.jungleY(x, z) + 0.3 + 0.2 * (out.length % 3), hex: NIGHT[out.length % NIGHT.length], big: out.length % 3 === 0 }); }
  return out;
}
/** Where the spiral's parrot b of n is at age: round a centre, rising and widening. Fills out { x, y, z, fx, fz }. Pure. */
export function spiralAt(b, n, age, cx, cz, y0, out = { x: 0, y: 0, z: 0, fx: 0, fz: 0 }) {
  const a = age * (1.25 - 0.03 * age) + (b / n) * TAU; const r = 2.2 + 0.28 * age + 0.5 * Math.sin(b * 2.1);
  out.x = cx + Math.cos(a) * r; out.z = cz + Math.sin(a) * r; out.y = y0 + 0.34 * age + 0.5 * Math.sin(b * 1.7 + age * 1.3) + 0.12 * b;
  out.fx = -Math.sin(a); out.fz = Math.cos(a);
  return out;
}

// ---- the stories (still pieces) ----------------------------------------------------------------------------------------------------------------
const DECK = P.LODGE.deck + 0.1;
export const SIGNS = Object.freeze([
  Object.freeze({ x: -3.4, z: 21.7, yaw: 0.45, board: 0xb4503c, ink: 0xf4ecd0, pic: 'house', pointYaw: 2.6 }),
  Object.freeze({ x: 1.4, z: 22.6, yaw: -0.4, board: 0x2f8a9a, ink: 0xf4ecd0, pic: 'wave', pointYaw: -2.6 }),
  Object.freeze({ x: -8.4, z: 23.2, yaw: 0.7, board: 0xe0a020, ink: 0x5a8a30, pic: 'mango', pointYaw: 1.5 }),
]);
export const STORY_SPOTS = Object.freeze({ carving: [-10.9, 15.5], tea: [-2.0, 15.9], bank: [-1.6, -3.5], prints: [[-1.0, 24.8], [-5.0, 21.6]] });

const _tri = new THREE.Triangle(); const _n = new THREE.Vector3();
/** One triangle, wound so its front faces `dir` (the paint material draws one face): [x, y, z] corners and an optional direction (default up). */
const tri3 = (a, b, c, dir = [0, 1, 0]) => {
  const A = new THREE.Vector3(...a); const B = new THREE.Vector3(...b); const C = new THREE.Vector3(...c);
  _tri.set(A, B, C).getNormal(_n);
  return new THREE.BufferGeometry().setFromPoints(_n.x * dir[0] + _n.y * dir[1] + _n.z * dir[2] >= 0 ? [A, B, C] : [A, C, B]);
};
export { tri3 };
const bx = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cone = (r, h, n, x, y, z) => new THREE.ConeGeometry(r, h, n, 1, true).translate(x, y, z);

/** The story pieces: [geometry, hex, jitter, bucket 'paint'], placed in the world. Pure. */
export function beauty4Parts() {
  const out = [];
  const put = (geo, hex, x, y, z, yaw = 0, j = 0) => out.push([geo.rotateY(yaw).translate(x, y, z), hex, j]);
  // veranda west end: a half-finished carving of a cat on a raw post, shavings round its foot and the knife left lying
  { const [x, z] = STORY_SPOTS.carving; const y = DECK;
    put(new THREE.CylinderGeometry(0.2, 0.22, 0.9, 6, 1, true).translate(0, 0.45, 0), 0x9a7a52, x, y, z, 0.3);
    put(bx(0.4, 0.32, 0.34, 0, 1.06, 0), 0xe8944a, x, y, z, 0.3); // the head, painted on one side only
    put(cone(0.1, 0.22, 4, -0.15, 1.33, 0), 0xe8944a, x, y, z, 0.3); put(cone(0.1, 0.22, 4, 0.15, 1.33, 0), 0xe8944a, x, y, z, 0.3);
    for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4; put(tri3([0, 0.012, 0], [0.16, 0.012, 0.04], [0.06, 0.012, -0.08]), 0xf4dca0, x + Math.cos(a) * (0.35 + 0.07 * i), y, z + Math.sin(a) * (0.3 + 0.05 * i), a * 2, i); }
    put(tri3([0, 0.02, 0], [0.26, 0.02, 0.03], [0.02, 0.02, 0.07]), 0xc8ccd0, x + 0.8, y, z + 0.45, 0.8); put(tri3([0, 0.02, 0], [-0.08, 0.02, 0.02], [0.02, 0.02, 0.07]), 0x6a4a2e, x + 0.8, y, z + 0.45, 0.8);
  }
  // veranda east end: a low round tea table with a pot, two cups and two floor cushions
  { const [x, z] = STORY_SPOTS.tea; const y = DECK;
    put(pad(8).scale(0.5, 1, 0.5).translate(0, 0.34, 0), 0xb88a58, x, y, z);
    for (let i = 0; i < 3; i++) put(cone(0.04, 0.34, 3, Math.cos(i * 2.1) * 0.3, 0.17, Math.sin(i * 2.1) * 0.3), 0x6a4a2e, x, y, z);
    put(topHalf(new THREE.OctahedronGeometry(0.17, 0).scale(1.1, 1, 1.1)).translate(0, 0.52, 0), 0x2fb8a8, x, y, z);
    put(cone(0.03, 0.14, 3, 0.2, 0.52, 0).rotateZ(-1.0), 0x2fb8a8, x, y, z);
    put(cone(0.07, 0.09, 5, -0.2, 0.39, 0.2), 0xff7aa0, x, y, z); put(cone(0.07, 0.09, 5, 0.12, 0.39, 0.26), 0xffd21a, x, y, z);
    put(pad(6).scale(0.34, 1, 0.34).translate(-0.8, 0.04, 0.2), 0xd8404c, x, y, z); put(pad(6).scale(0.34, 1, 0.34).translate(0.75, 0.04, 0.3), 0x9a5ae0, x, y, z);
  }
  // the path: three hand-painted signs (a post, a board, an arrow tip and a picture) and a line of muddy paw prints
  SIGNS.forEach((s) => {
    const y = P.jungleY(s.x, s.z); const ink = s.ink; const K = 1.45; const F = [0, 0, 1]; const Bk = [0, 0, -1];
    const ps = (g, hex) => put(g.scale(K, K, K), hex, s.x, y, s.z, s.yaw); // the whole sign is drawn at 1.45 times, so its picture reads from the walk's camera
    ps(cone(0.05, 1.4, 4, 0, 0.7, 0), 0x6a4a2e);
    ps(tri3([-0.5, 1.45, 0.04], [0.5, 1.45, 0.04], [0.5, 0.95, 0.04], F), s.board); ps(tri3([-0.5, 1.45, 0.04], [0.5, 0.95, 0.04], [-0.5, 0.95, 0.04], F), s.board);
    ps(tri3([0.5, 1.45, 0.04], [0.8, 1.2, 0.04], [0.5, 0.95, 0.04], F), s.board); // the board's pointed end
    ps(tri3([0.5, 1.45, -0.02], [0.5, 0.95, -0.02], [-0.5, 1.45, -0.02], Bk), 0x8a6a3e); // its back
    const f = (...p) => ps(tri3(...p.map(([a, b]) => [a, b, 0.06]), F), ink);
    if (s.pic === 'house') { f([-0.28, 1.0], [0.0, 1.38], [0.28, 1.0]); f([-0.18, 1.0], [0.18, 1.0], [-0.18, 1.2]); f([0.18, 1.0], [0.18, 1.2], [-0.18, 1.2]); } // a roof and a wall
    else if (s.pic === 'wave') { f([-0.4, 1.12], [-0.2, 1.3], [0.0, 1.12]); f([0.0, 1.12], [0.2, 1.3], [0.4, 1.12]); f([-0.36, 1.0], [0.0, 1.06], [0.36, 1.0]); } // two waves and a ripple
    else { ps(pad(6).scale(0.17, 1, 0.17).rotateX(Math.PI / 2).translate(-0.05, 1.18, 0.06), 0xf0a020); f([0.1, 1.3], [0.34, 1.4], [0.18, 1.2]); f([-0.22, 1.0], [-0.1, 1.0], [-0.16, 1.1]); } // a mango and its leaf
  });
  { const [a, b] = STORY_SPOTS.prints; const n = 6; const dx = b[0] - a[0]; const dz = b[1] - a[1]; const yaw = Math.atan2(dx, dz);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1); const side = i % 2 ? 1 : -1; const x = a[0] + dx * u + Math.cos(yaw) * 0.22 * side; const z = a[1] + dz * u - Math.sin(yaw) * 0.22 * side; const y = P.jungleY(x, z) + 0.05;
      put(pad(4).scale(0.1, 1, 0.12).translate(0, 0, 0), 0x6a4a2a, x, y, z, yaw, i); for (const sx of [-1, 1]) put(pad(3).scale(0.045, 1, 0.045).translate(sx * 0.075, 0, 0.14), 0x6a4a2a, x, y, z, yaw);
    } }
  // the river bank: a fishing pole leaning on the bank with its line, a bucket with two fish, and a straw hat
  { const [x, z] = STORY_SPOTS.bank; const y = P.jungleY(x, z);
    put(cone(0.025, 2.4, 3, 0, 1.15, 0).rotateZ(-0.5), 0x8a6a3e, x, y, z, 0.6);
    put(tri3([1.12, 2.05, 0], [1.16, 0.5, 0.01], [1.13, 2.05, 0.01], [0, 0, 1]), 0xe8e8e0, x, y, z, 0.6);
    put(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 6, 1, true).translate(-0.9, 0.15, 0.4), 0x4a7ab0, x, y, z);
    put(pad(6).scale(0.17, 1, 0.17).translate(-0.9, 0.27, 0.4), 0x2a6a8a, x, y, z);
    for (let i = 0; i < 2; i++) { put(tri3([0.8 + i * 0.12, 0.3, 0.4], [1.0 + i * 0.12, 0.34, 0.42], [0.88 + i * 0.12, 0.3, 0.5]), 0xe8a0a0, x, y, z); put(tri3([1.0 + i * 0.12, 0.34, 0.42], [1.08 + i * 0.12, 0.4, 0.4], [1.06 + i * 0.12, 0.3, 0.46]), 0xff6a4a, x, y, z); }
    put(cone(0.3, 0.12, 8, -0.5, 0.06, 0.8), 0xe8c870, x, y, z);
  }
  return out;
}

export function drawBeauty4(kit, M) {
  for (const [geo, hex, j] of beauty4Parts()) kit.put('paint', M.paint, paint(geo, hex, j), { noCast: true });
}
