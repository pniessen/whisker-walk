import * as THREE from 'three';
import { colorParts } from './dressing.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { seasideSpots, PIER_DECK, BOARDWALK, REEF_GATE_END } from './seasideplan.js';

// Seaside beauty round (docs/beauty-backlog.md, SEA-2 and SEA-4 plus the
// furniture): vertex-coloured, non-casting parts (merged into the seasideSandwork mesh) that
// adds the small things a walker sees at cat height. It draws nothing from
// Math.random (its own seeded stream, uuids local), so every existing seeded
// layout stays put.
//   * benches: armrests, a capped back rail, iron end feet;
//   * lamp posts: a stone plinth, a collar and a lantern cap;
//   * the strandline: tangled weed, shells and pebbles where the last wave
//     reached, with a few drift sticks;
//   * the dry beach: starfish, shells, pebbles and small marram tufts;
//   * the pier: mooring bollards, rope coils and a fish crate;
// The decor of seasidedecor.js (castles, towels, stands, posts) is untouched,
// and everything is kept clear of its spots, the deck and the boardwalk.

export const SEASIDE_BENCHES = Object.freeze([[18, 14, Math.PI / 2], [18, -18, Math.PI / 2]]);
export const SEASIDE_LAMPS = Object.freeze([[20, 30], [20, -30]]);
// props the beach already has: rocks, bushes, boxes, the billboard, the driftwood
const KEEP = Object.freeze([
  [-8, 10, 1.6], [-20, -2, 1.6], [4, 24, 1.6], [-28, 18, 2.2], [-32, 30, 1.6], [12, -10, 1.6], [-32, -10, 1.6],
  [-14, 30, 1.8], [-2, -14, 1.8], [-24, -20, 1.8], [8, 2, 1.8], [-30, 5, 1.8], [12, 20, 1.8],
  [19, 24, 1.2], [-14, 4, 1.2], [23, -6, 1.4], [15, 34, 2.6], [24, 0, 1.6], [-29, 19, 2],
]);

const TONES = {
  wood: 0x6e4e30, woodDark: 0x3a2a1a, iron: 0x2c2c34, stone: 0x9a968c, stoneLo: 0x7c786f, brass: 0xc8a050,
  weed: 0x4a5a2c, weedLo: 0x34421f, weedKelp: 0x6a5a2a, stick: 0x8a7458, pebble: 0xb4aa98, pebbleLo: 0x8c8474,
  star: 0xe07a4a, starLo: 0xc8553a, shellA: 0xf0e4d0, shellB: 0xe6b8a0, shellC: 0xd8c8ac,
  marram: 0x8a9a4c, marramLo: 0x6e7e38, rope: 0xc8b078, ropeLo: 0xa8925a, crate: 0xa88458, crateLo: 0x7a5e3a,
  fish: 0x9fb4c0, tar: 0x2e2a26,
};

const nearKeep = (x, z, m = 0) => KEEP.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r + m);
const nearSpot = (x, z, m = 0) => seasideSpots().some((s) => Math.hypot(x - s.x, z - s.z) < s.r + m);
const onPier = (x, z, m = 0) => x > PIER_DECK.minX - 1 - m && z > PIER_DECK.minZ - 0.8 - m && z < PIER_DECK.maxZ + 0.8 + m;
const nearGate = (x, z) => Math.hypot(x - REEF_GATE_END.x, z - REEF_GATE_END.z) < 2.2;
const onBoardwalk = (x) => x > BOARDWALK.minX - 0.8;
export const sandFree = (x, z, m = 0) => !nearKeep(x, z, m) && !nearSpot(x, z, m) && !onPier(x, z, m) && !nearGate(x, z)
  && !SEASIDE_BENCHES.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 1.4)
  && !SEASIDE_LAMPS.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 1);

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
const frame = (ox, oz, yaw) => (lx, lz) => [ox + lx * Math.cos(yaw) + lz * Math.sin(yaw), oz - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

function benches(k) {
  for (const [bx, bz, yaw] of SEASIDE_BENCHES) {
    const at = frame(bx, bz, yaw);
    const put = (geo, color, lx, y, lz, o = {}) => { const [x, z] = at(lx, lz); k.add(geo, color, x, y, z, { yaw, ...o }); };
    for (const sx of [-1, 1]) {
      put(new THREE.BoxGeometry(0.07, 0.05, 0.46), TONES.wood, sx * 0.76, 0.74, 0.0);       // armrest
      put(new THREE.BoxGeometry(0.06, 0.2, 0.06), TONES.iron, sx * 0.76, 0.64, 0.18);       // its front post
      put(new THREE.BoxGeometry(0.1, 0.05, 0.5), TONES.iron, sx * 0.7, 0.03, 0);            // iron foot
    }
    put(new THREE.BoxGeometry(1.68, 0.045, 0.12), TONES.woodDark, 0, 1.12, -0.25);         // capped rail
    for (let i = 0; i < 3; i++) put(new THREE.BoxGeometry(1.58, 0.004, 0.012), TONES.woodDark, 0, 0.542, -0.15 + i * 0.15);
  }
}

function lamps(k) {
  for (const [x, z] of SEASIDE_LAMPS) {
    k.add(new THREE.CylinderGeometry(0.17, 0.2, 0.34, 6), TONES.stone, x, 0.17, z);
    k.add(new THREE.CylinderGeometry(0.11, 0.17, 0.12, 6), TONES.stoneLo, x, 0.4, z);
    k.add(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 6), TONES.brass, x, 1.2, z);
    k.add(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 6), TONES.brass, x, 3.02, z);
    k.add(new THREE.ConeGeometry(0.3, 0.2, 6), TONES.iron, x, 3.62, z);
  }
}

// a starfish: five flat arms
function starfish(k, x, z, r, yaw, hue) {
  for (let i = 0; i < 5; i++) {
    const a = yaw + (i * Math.PI * 2) / 5;
    k.add(new THREE.ConeGeometry(r * 0.28, r, 3), hue, x + Math.sin(a) * r * 0.5, 0.012, z + Math.cos(a) * r * 0.5, { yaw: a, rx: Math.PI / 2 });
  }
  k.add(new THREE.CylinderGeometry(r * 0.3, r * 0.3, 0.02, 5), hue, x, 0.012, z);
}
function shell(k, rnd, x, z, y0 = 0) {
  const c = [TONES.shellA, TONES.shellB, TONES.shellC][Math.floor(rnd() * 3)];
  const r = 0.035 + rnd() * 0.03;
  k.add(new THREE.ConeGeometry(r, r * 1.5, 5), c, x, y0 + r * 0.45, z, { yaw: rnd() * 6.28, rz: 1.35, sx: 1 });
}
function pebble(k, rnd, x, z, y0 = 0) {
  const r = 0.03 + rnd() * 0.05;
  k.add(new THREE.OctahedronGeometry(r, 0), rnd() < 0.5 ? TONES.pebble : TONES.pebbleLo, x, y0 + r * 0.4, z, { sy: 0.6, yaw: rnd() * 6.28 });
}
function tuft(k, rnd, x, z) {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + rnd();
    const h = 0.28 + rnd() * 0.22;
    k.add(new THREE.ConeGeometry(0.018, h, 3, 1, true), i % 2 ? TONES.marram : TONES.marramLo, x + Math.sin(a) * 0.05, h / 2, z + Math.cos(a) * 0.05, { rx: Math.sin(a) * 0.35, rz: Math.cos(a) * 0.35 });
  }
}

// where the last wave reached: the sand x line follows wetness() in seasidewet.js
function strandline(k, rnd) {
  for (let i = 0; i < 40; i++) {
    const z = -36 + rnd() * 72;
    const x = 22.6 + rnd() * 1.9 + Math.sin(z * 0.33 + 1.3) * 0.28;
    if (onPier(x, z, 0.4) || nearGate(x, z) || nearSpot(x, z, 0.1) || nearKeep(x, z)) continue;
    const kind = rnd();
    if (kind < 0.35) {
      const L = 0.3 + rnd() * 0.5;
      k.add(new THREE.BoxGeometry(L, 0.015, 0.09 + rnd() * 0.07), rnd() < 0.5 ? TONES.weed : TONES.weedKelp, x, 0.02, z, { yaw: rnd() * 3.14, sy: 1 });
      k.add(new THREE.BoxGeometry(L * 0.6, 0.02, 0.07), TONES.weedLo, x + 0.05, 0.03, z + 0.05, { yaw: rnd() * 3.14 });
    } else if (kind < 0.6) shell(k, rnd, x, z, 0.008);
    else if (kind < 0.85) pebble(k, rnd, x, z, 0.008);
    else {
      const L = 0.5 + rnd() * 0.7;
      k.add(new THREE.CylinderGeometry(0.014, 0.018, L, 4), TONES.stick, x, 0.03, z, { rz: Math.PI / 2, yaw: rnd() * 3.14 });
    }
  }
  // a drift log beyond the one the beach has
  k.add(new THREE.CylinderGeometry(0.09, 0.11, 1.5, 6), 0x8c7658, 23.4, 0.1, 17.5, { rz: Math.PI / 2, yaw: -0.5 });
  k.add(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 5), 0x7c6648, 23.9, 0.06, 17.9, { rz: Math.PI / 2, yaw: 0.9 });
}

function beach(k, rnd) {
  let n = 0;
  for (let t = 0; t < 600 && n < 72; t++) {
    const x = -20 + rnd() * 37.5;
    const z = -30 + rnd() * 68;
    const kind = rnd();
    if (!sandFree(x, z, 0.3) || onBoardwalk(x)) continue;
    n++;
    if (kind < 0.12) starfish(k, x, z, 0.1 + rnd() * 0.05, rnd() * 6.28, rnd() < 0.6 ? TONES.star : TONES.starLo);
    else if (kind < 0.42) shell(k, rnd, x, z);
    else if (kind < 0.7) pebble(k, rnd, x, z);
    else tuft(k, rnd, x, z);
  }
  // marram clumps along the back of the beach, where the dunes begin
  for (let i = 0; i < 12; i++) {
    const x = -36 + rnd() * 18, z = -34 + rnd() * 70;
    if (!sandFree(x, z, 0.6)) continue;
    for (let j = 0; j < 3; j++) tuft(k, rnd, x + (rnd() - 0.5) * 0.5, z + (rnd() - 0.5) * 0.5);
  }
  // a rock pool beside the first boulder: a ring of small stones round dark water-wet sand
  const px = -6, pz = 13.2;
  k.add(new THREE.CylinderGeometry(0.55, 0.55, 0.006, 10), 0x6e6450, px, 0.006, pz, { sz: 0.8 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 6.28;
    k.add(new THREE.OctahedronGeometry(0.08 + rnd() * 0.04, 0), i % 2 ? TONES.stoneLo : TONES.stone, px + Math.sin(a) * 0.62, 0.04, pz + Math.cos(a) * 0.5, { sy: 0.6, yaw: rnd() * 6.28 });
  }
}

// the pier, deck at y 0.25: bollards, rope coils and a fish crate
function pier(k, rnd) {
  const y = 0.25;
  for (const [x, z] of [[27, -8.75], [27, -11.25], [41, -8.75], [41, -11.25]]) {
    k.add(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 6), TONES.tar, x, y + 0.15, z);
    k.add(new THREE.CylinderGeometry(0.1, 0.07, 0.06, 6), TONES.iron, x, y + 0.33, z);
  }
  for (const [x, z] of [[27, -8.9], [41, -11.1]]) {            // rope coil on a bollard
    k.add(new THREE.TorusGeometry(0.11, 0.025, 3, 7), TONES.rope, x, y + 0.2, z, { rx: Math.PI / 2 });
    k.add(new THREE.TorusGeometry(0.11, 0.025, 3, 7), TONES.ropeLo, x, y + 0.26, z, { rx: Math.PI / 2 });
  }
  const cx = 35.5, cz = -11.0;                                  // fish crate with a catch
  k.add(new THREE.BoxGeometry(0.55, 0.26, 0.4), TONES.crate, cx, y + 0.13, cz, { yaw: 0.2 });
  k.add(new THREE.BoxGeometry(0.58, 0.04, 0.43), TONES.crateLo, cx, y + 0.27, cz, { yaw: 0.2 });
  for (let i = 0; i < 3; i++) k.add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 5), TONES.fish, cx - 0.12 + i * 0.12, y + 0.31, cz + (rnd() - 0.5) * 0.1, { rz: Math.PI / 2, yaw: 0.2 + (rnd() - 0.5) * 0.4, sy: 1 });
}

// The geometry of the beauty round, for seasidedecor.js to merge into its sand mesh
// (seasideSandwork, noCast, dusk-dimmed like the sand), so the area gains no
// mesh and no draw. Its own seeded stream; the picture page switches it off
// through beautyControl to take the "before" pictures.
export const beautyControl = { on: true };
export function seasideBeautyParts() {
  if (!beautyControl.on) return [];
  const k = kit();
  const rnd = mulberry32(seedFromCode('seaside-beauty'));
  benches(k); lamps(k); strandline(k, rnd); beach(k, rnd); pier(k, rnd);
  for (const g of k.parts) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return k.parts;
}
