import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { colorParts, dressMesh } from './dressing.js';
import { withLocalUuids } from './localuuids.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { PARK } from './holidayspots.js';

// City Park beauty round (docs/beauty-backlog.md, PRK-1 plus the furniture):
// ONE vertex-coloured, non-casting mesh (named parkBeauty) that adds the small
// things a walker sees at cat height. It draws nothing from Math.random (its
// own seeded stream, uuids local), so every existing seeded layout stays put.
//   * benches: armrests, a capped back rail, dark slat gaps, iron end feet;
//   * lamp posts: a stone plinth, a collar, a lantern cap and a finial;
//   * the fountain: two flower beds in the lawn round it, kept clear of the
//     three walks, the scenic spot and the holiday ring;
//   * the pond: pebbles on the shore, reed clumps, lily pads;
//   * the big trees: a mulch ring and root flares at the foot;
//   * the north meadow: wildflower clumps.
// Everything near a holiday prop (the tree and the menorah, holidayspots.js)
// is left out, so the decor sits clean.

export const PARK_BENCHES = Object.freeze([[3, 26, -0.5], [-4, 14, 0.7], [-10, -20, 2.2], [14, -28, -2.4]]);
export const PARK_LAMPS = Object.freeze([[2, 40], [-12, 10], [-4, -14], [10, -32]]);
const FOUNTAIN = Object.freeze({ x: 0, z: 20 });
const POND = Object.freeze({ x: -14, z: 2, r: 7 });
const PATHS = Object.freeze([[0, 48, 0, 20], [0, 20, -4, 4], [-4, 4, -8, -18], [-8, -18, 12, -30], [0, 20, 16, 10]]);
const HOLIDAY_KEEP = Object.freeze([
  [PARK.tree.x, PARK.tree.z, 2.6], [PARK.menorah.x, PARK.menorah.z, 2.8],
]);

const FLOWER_HUES = [0xe86a6a, 0xf2c94c, 0xf4f0e6, 0xa77ad8, 0xf09ac0, 0xff9a4a];
const TONES = {
  wood: 0x6e4e30, woodDark: 0x3a2a1a, iron: 0x2c2c34, stone: 0x9a968c, stoneLo: 0x7c786f,
  soil: 0x4a3724, mulch: 0x4b3a26, bark: 0x5a4028, green: 0x4e8a3e, greenLo: 0x3c6e32,
  reed: 0x7a8a3c, cattail: 0x5a3a22, pad: 0x4a8a48, padLo: 0x3c7440, brass: 0xc8a050,
};

function distSeg(px, pz, [x1, z1, x2, z2]) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
}
export const nearWalk = (x, z, m) => PATHS.some((p) => distSeg(x, z, p) < m);
export const nearHoliday = (x, z) => HOLIDAY_KEEP.some(([hx, hz, r]) => Math.hypot(x - hx, z - hz) < r);

// A part collector: geometry, a colour and a transform (position, yaw, scale).
function kit() {
  const parts = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  return {
    parts,
    add(geo, color, x, y, z, { yaw = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0 } = {}) {
      e.set(rx, yaw, rz, 'YXZ');
      q.setFromEuler(e);
      s.set(sx, sy, sz);
      p.set(x, y, z);
      geo.applyMatrix4(m4.compose(p, q, s));
      parts.push(colorParts(geo, color));
    },
  };
}
// A local frame (a bench or lamp, turned about Y) to world.
const frame = (ox, oz, yaw) => (lx, lz) => [ox + lx * Math.cos(yaw) + lz * Math.sin(yaw), oz - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

function benches(k) {
  for (const [bx, bz, yaw] of PARK_BENCHES) {
    const at = frame(bx, bz, yaw);
    const put = (geo, color, lx, y, lz, o = {}) => { const [x, z] = at(lx, lz); k.add(geo, color, x, y, z, { yaw, ...o }); };
    for (const sx of [-1, 1]) {
      put(new THREE.BoxGeometry(0.07, 0.05, 0.46), TONES.wood, sx * 0.76, 0.74, 0.0);       // armrest
      put(new THREE.BoxGeometry(0.06, 0.2, 0.06), TONES.iron, sx * 0.76, 0.64, 0.18);       // its front post
      put(new THREE.BoxGeometry(0.1, 0.05, 0.5), TONES.iron, sx * 0.7, 0.03, 0);            // iron foot
    }
    put(new THREE.BoxGeometry(1.68, 0.045, 0.12), TONES.woodDark, 0, 1.12, -0.25);         // capped rail
    for (let i = 0; i < 4; i++) {                                                          // slat gaps
      put(new THREE.BoxGeometry(1.58, 0.004, 0.012), TONES.woodDark, 0, 0.542, -0.19 + i * 0.125);
    }
    for (let i = 0; i < 2; i++) put(new THREE.BoxGeometry(1.58, 0.012, 0.01), TONES.woodDark, 0, 0.86 + i * 0.16, -0.205);
  }
}

function lamps(k) {
  for (const [x, z] of PARK_LAMPS) {
    k.add(new THREE.CylinderGeometry(0.17, 0.2, 0.34, 6), TONES.stone, x, 0.17, z);           // plinth
    k.add(new THREE.CylinderGeometry(0.11, 0.17, 0.12, 6), TONES.stoneLo, x, 0.38, z);
    k.add(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 6), TONES.brass, x, 1.2, z);              // collar
    k.add(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 6), TONES.brass, x, 3.04, z);
    k.add(new THREE.CylinderGeometry(0.14, 0.1, 0.06, 6), TONES.iron, x, 3.08, z);             // cradle
    k.add(new THREE.ConeGeometry(0.3, 0.26, 6), TONES.iron, x, 3.62, z);                       // lantern cap
    k.add(new THREE.OctahedronGeometry(0.06, 0), TONES.brass, x, 3.8, z);                       // finial
  }
}

function fountainBeds(k, rnd) {
  const deg = Math.PI / 180;
  for (const [a0, a1] of [[-4, 62], [118, 228]]) {
    const n = 2 * Math.round(((a1 - a0) * deg * 4.5) / 0.84);
    // the soil strip and its edging stones
    for (let i = 0; i < n; i++) {
      const a = (a0 + ((a1 - a0) * (i + 0.5)) / n) * deg;
      const ax = FOUNTAIN.x + Math.cos(a) * 4.5, az = FOUNTAIN.z + Math.sin(a) * 4.5;
      const seg = ((a1 - a0) * deg * 4.5) / n;
      if (i % 2 === 0) { // the soil and the edging stones, one long piece per two clumps
        const ar = a + (((a1 - a0) * deg) / n) * 0.5;
        k.add(new THREE.BoxGeometry(seg * 2.05, 0.02, 1.0), TONES.soil, FOUNTAIN.x + Math.cos(ar) * 4.5, 0.02, FOUNTAIN.z + Math.sin(ar) * 4.5, { yaw: -ar + Math.PI / 2 });
        for (const r of [3.96, 5.04]) {
          k.add(new THREE.BoxGeometry(seg * 1.85, 0.1, 0.13), (i / 2) % 2 ? TONES.stone : TONES.stoneLo,
            FOUNTAIN.x + Math.cos(ar) * r, 0.05, FOUNTAIN.z + Math.sin(ar) * r, { yaw: -ar + Math.PI / 2 });
        }
      }
      for (const r of [4.25, 4.78]) {
        const hue = FLOWER_HUES[Math.floor(i / 2 + (r > 4.5 ? 3 : 0)) % FLOWER_HUES.length];
        for (let j = 0; j < 2; j++) {
          const fx = FOUNTAIN.x + Math.cos(a + (rnd() - 0.5) * 0.06) * (r + (rnd() - 0.5) * 0.14);
          const fz = FOUNTAIN.z + Math.sin(a + (rnd() - 0.5) * 0.06) * (r + (rnd() - 0.5) * 0.14);
          const h = 0.2 + rnd() * 0.16;
          k.add(new THREE.ConeGeometry(0.012, h, 3, 1, true), TONES.green, fx, 0.02 + h / 2, fz);
          k.add(new THREE.OctahedronGeometry(0.07 + rnd() * 0.03, 0), hue, fx, 0.02 + h, fz, { sy: 0.7 });
        }
        if (r < 4.5) k.add(new THREE.OctahedronGeometry(0.17, 0), TONES.greenLo, FOUNTAIN.x + Math.cos(a) * r, 0.07, FOUNTAIN.z + Math.sin(a) * r, { sy: 0.45 });
      }
    }
  }
}

function pond(k, rnd) {
  const R = POND.r;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + (rnd() - 0.5) * 0.12;
    const r = R + 0.35 + rnd() * 0.8;
    const x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r;
    if (nearWalk(x, z, 2.1) || nearHoliday(x, z)) continue;
    const sz = 0.1 + rnd() * 0.17;
    k.add(new THREE.OctahedronGeometry(sz, 0), rnd() < 0.5 ? TONES.stone : TONES.stoneLo, x, sz * 0.25, z,
      { yaw: rnd() * 6, sy: 0.55, sx: 1 + rnd() * 0.5 });
  }
  for (let c = 0; c < 7; c++) {
    const a = (c / 7) * Math.PI * 2 + 0.4 + (rnd() - 0.5) * 0.3;
    const r = R + 0.25;
    const cx = POND.x + Math.cos(a) * r, cz = POND.z + Math.sin(a) * r;
    if (nearWalk(cx, cz, 2.4) || nearHoliday(cx, cz)) continue;
    const blades = 6 + Math.floor(rnd() * 4);
    for (let b = 0; b < blades; b++) {
      const h = 0.9 + rnd() * 0.7;
      const bx = cx + (rnd() - 0.5) * 0.5, bz = cz + (rnd() - 0.5) * 0.5;
      k.add(new THREE.ConeGeometry(0.025, h, 3), TONES.reed, bx, h / 2, bz, { rx: (rnd() - 0.5) * 0.25, rz: (rnd() - 0.5) * 0.25 });
      if (b % 4 === 0) k.add(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 4), TONES.cattail, bx, h * 0.8, bz);
    }
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, r = 1.5 + rnd() * 3.6;
    const x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r;
    const pr = 0.28 + rnd() * 0.2;
    k.add(new THREE.CircleGeometry(pr, 9, 0.5, Math.PI * 2 - 0.5), i % 2 ? TONES.pad : TONES.padLo, x, 0.045, z, { rx: -Math.PI / 2, yaw: rnd() * 6 });
    if (i % 3 === 0) k.add(new THREE.OctahedronGeometry(0.08, 0), 0xf6dce8, x, 0.09, z, { sy: 0.8 });
  }
}

const TREES = [[-24, 30], [-30, 10], [-26, -14], [-16, -34], [8, -38], [22, -22], [28, 0], [24, 24], [12, 36], [-6, 34], [6, -8], [16, -6]];
function treeFeet(k, rnd) {
  for (const [x, z] of TREES) {
    if (nearHoliday(x, z)) continue;
    const scale = 1.2 + ((x + z) % 4) * 0.15;
    const r = 0.55 + 0.55 * scale;
    k.add(new THREE.CircleGeometry(r, 10), TONES.mulch, x, 0.014, z, { rx: -Math.PI / 2 });
    const a0 = rnd() * 6;
    for (let i = 0; i < 4; i++) {
      const a = a0 + (i * Math.PI) / 2 + (rnd() - 0.5) * 0.5;
      const len = 0.7 + 0.2 * scale;
      k.add(new THREE.ConeGeometry(0.14 * scale, len, 4, 1, true), TONES.bark, x + Math.cos(a) * (len * 0.5 + 0.28 * scale), 0.07, z + Math.sin(a) * (len * 0.5 + 0.28 * scale),
        { rz: -Math.PI / 2, yaw: -a, sx: 0.6 });
    }
  }
}

function meadow(k, rnd) {
  const cx = 12, cz = -30;
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, r = 2 + rnd() * 7;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (nearWalk(x, z, 2) || (Math.hypot(x - 14, z + 28) < 2.2)) continue;
    const hue = FLOWER_HUES[i % FLOWER_HUES.length];
    for (let j = 0; j < 5; j++) {
      const fx = x + (rnd() - 0.5) * 0.9, fz = z + (rnd() - 0.5) * 0.9, h = 0.22 + rnd() * 0.22;
      k.add(new THREE.ConeGeometry(0.01, h, 3, 1, true), TONES.green, fx, h / 2, fz);
      k.add(new THREE.OctahedronGeometry(0.08 + rnd() * 0.03, 0), j === 0 ? 0xf2c94c : hue, fx, h, fz, { sy: 0.7 });
    }
  }
}

// Called once from build(), after the trees and benches are planted.
export function addParkBeauty(scene) {
  const k = kit();
  const rnd = mulberry32(seedFromCode('park-beauty'));
  const mesh = withLocalUuids('park-beauty', () => {
    benches(k); lamps(k); fountainBeds(k, rnd); pond(k, rnd); treeFeet(k, rnd); meadow(k, rnd);
    const m = dressMesh([mergeGeometries(k.parts, false)], { name: 'parkBeauty', side: THREE.FrontSide, roughness: 0.9 });
    m.userData.noMerge = true;
    return m;
  });
  for (const p of k.parts) p.dispose();
  scene.add(mesh);
  return mesh;
}
