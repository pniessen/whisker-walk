// =============================================================================
// THE BUTTERFLY ROOM'S BUTTERFLIES (milestone G6): four chaseable ones and an ambient cloud, ONE instanced mesh (a pair of wing
// quads each, flapped by scaling the instance across its body). The chasers rest over the shrubs and the hedge and flutter off to
// another one when she comes near; nothing ever catches or hurts one (they are this file's own, not src/critters.js's, whose
// butterflies a mid-air pounce removes). The cloud drifts on its own paths and notices nothing. When she sits still in the room's
// middle (the butterfly find), one lands on her head and stays until she moves. Every number is a hash01 of GH_BUTTERFLY_SALT and
// the walk's clock (frozen by reduced motion: wings half open, no orbit, no drift); no Math.random, no Date.now.
// =============================================================================

import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import { BUTTERFLY_ROOM, BUTTERFLY_ANCHORS, BUTTERFLY_HOME } from './greenhouserooms.js';
import * as P from './greenhouseplan.js';

export const GH_BUTTERFLY_SALT = 0x6e5d3;
export const CHASERS = 4;
export const CLOUD = 10;
export const FLEE_R = 2.3; // m: she comes this near a resting chaser and it flutters off
export const FLEE_FROM = 3.5; // m: where it settles is at least this far from her (else the farthest anchor)
export const FLUTTER_SPEED = 3.2; // m/s: under her walk, so a chase is a game, never a catch
export const LAND_MOVE = 0.4; // m: a butterfly on her head leaves when she has moved this far
export const LAND_MAX = 10; // s
// Beauty pass 2: THE POLLINATORS, three bees and three garden butterflies in the same instanced mesh (instances after the room's own;
// the low tier draws none). Each drifts between three flowers (hibiscus, the catnip beds, the kitchen bed, the court's baskets,
// the orchids): a short glide, then a long hover and a loop over the bloom, on the walk's clock alone (a pure function of it; reduced
// motion holds each at its first flower, wings half open). They never notice her and nothing can touch one.
export const POLLINATORS = 6;
const POLL_AVOID = 1.7; // m: a bee or butterfly this near her swings out round her
const POLL_COLOURS = Object.freeze([0xffc21a, 0xffb000, 0xf2a60c, 0xff7a1a, 0xfff2f6, 0x6aa6ff]);
const POLL_SITES = (() => {
  const hib = P.HIBISCUS_SPOTS.map(([x, z]) => [x, 1.5, z]);
  const nip = P.CATNIP_BEDS.map((b) => [b.x, 0.6, b.z]);
  const kit = [P.KITCHEN_BED.x, 0.6, P.KITCHEN_BED.z];
  const bask = P.COURT_LAMPS.map((l) => [l.x + (l.x < 0 ? 0.66 : -0.66), 2.0, l.z]);
  const orc = P.ORCHID_BENCHES.map((b) => [b.x, b.h + 0.55, b.z + 0.2]);
  return [
    [hib[0], orc[0], hib[1]], [nip[0], nip[1], kit], [bask[0], nip[0], bask[1]],
    [hib[1], orc[1], hib[0]], [kit, nip[1], bask[1]], [nip[1], hib[1], bask[0]],
  ];
})();
const pollinatorAt = (i, tt, out) => {
  const bee = i < 3;
  const S = POLL_SITES[i], T = bee ? 9 : 15, tr = bee ? 0.28 : 0.4;
  const u = tt / T + hash01(i, 11, GH_BUTTERFLY_SALT) * 3;
  const seg = Math.floor(u), f = u - seg;
  const a = S[((seg % 3) + 3) % 3], b = S[(((seg + 1) % 3) + 3) % 3];
  const k = f < tr ? (f / tr) * (f / tr) * (3 - 2 * (f / tr)) : 1;
  const arch = f < tr ? Math.sin((f / tr) * Math.PI) * 0.5 : 0;
  const r = bee ? 0.2 : 0.35, sp = bee ? 2.3 : 0.8;
  out.x = a[0] + (b[0] - a[0]) * k + Math.sin(tt * sp + i * 2.1) * r;
  out.z = a[2] + (b[2] - a[2]) * k + Math.cos(tt * sp * 0.8 + i * 1.3) * r;
  out.y = a[1] + (b[1] - a[1]) * k + arch + Math.sin(tt * sp * 1.3 + i) * (bee ? 0.07 : 0.18);
  return out;
};
const COLOURS = Object.freeze([0xf58a2a, 0xf6d23a, 0x4a8af0, 0xf27ab8, 0xb07ae0, 0xffffff]);

const wing = (side) => {
  const g = new THREE.BufferGeometry();
  const s = side;
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -0.03, s * 0.12, 0, -0.1, s * 0.15, 0, 0.03,
    0, 0, -0.03, s * 0.15, 0, 0.03, s * 0.06, 0, 0.11,
  ], 3));
  g.computeVertexNormals();
  return g;
};

const inRoom = (x, z) => x > BUTTERFLY_ROOM.x0 && x < BUTTERFLY_ROOM.x1 && z > BUTTERFLY_ROOM.z0 && z < BUTTERFLY_ROOM.z1;

export function createButterflies({ reducedMotion = false, lite = false } = {}) {
  const count = CHASERS + CLOUD + POLLINATORS;
  const L = wing(-1), Rg = wing(1);
  const merged = new THREE.BufferGeometry();
  const pa = L.attributes.position.array, pb = Rg.attributes.position.array;
  merged.setAttribute('position', new THREE.Float32BufferAttribute([...pa, ...pb], 3));
  merged.computeVertexNormals();
  L.dispose(); Rg.dispose();
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.InstancedMesh(merged, mat, count);
  mesh.name = 'ghButterflies';
  mesh.userData.noCast = true;
  mesh.userData.noMerge = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) mesh.setColorAt(i, col.set(i < CHASERS ? COLOURS[i] : COLOURS[Math.floor(hash01(i, 3, GH_BUTTERFLY_SALT) * COLOURS.length) % COLOURS.length]));

  for (let i = 0; i < POLLINATORS; i++) mesh.setColorAt(CHASERS + CLOUD + i, col.set(POLL_COLOURS[i]));
  if (lite) mesh.count = CHASERS + CLOUD; // (the low tier draws no pollinators)
  const pa0 = { x: 0, y: 0, z: 0 }, pa1 = { x: 0, y: 0, z: 0 };

  const anchorPos = (k) => ({ x: BUTTERFLY_ANCHORS[k][0], y: BUTTERFLY_ANCHORS[k][2], z: BUTTERFLY_ANCHORS[k][1] });
  const chasers = Array.from({ length: CHASERS }, (_, i) => {
    const a = anchorPos(BUTTERFLY_HOME[i % BUTTERFLY_HOME.length]);
    return { i, anchor: BUTTERFLY_HOME[i % BUTTERFLY_HOME.length], x: a.x, y: a.y, z: a.z, mode: 'rest', yaw: i * 1.7, flutters: 0, landedAt: -1, landX: 0, landZ: 0 };
  });
  // the cloud: each drifts on a slow Lissajous over the room, its own speeds and heights
  const cloud = Array.from({ length: CLOUD }, (_, i) => ({
    i,
    fx: 0.07 + 0.08 * hash01(i, 1, GH_BUTTERFLY_SALT), fz: 0.06 + 0.08 * hash01(i, 2, GH_BUTTERFLY_SALT),
    ph: hash01(i, 5, GH_BUTTERFLY_SALT) * Math.PI * 2, pz: hash01(i, 6, GH_BUTTERFLY_SALT) * Math.PI * 2,
    y0: 1.1 + 1.6 * hash01(i, 7, GH_BUTTERFLY_SALT), flap: 8 + 4 * hash01(i, 8, GH_BUTTERFLY_SALT),
    x: 0, y: 0, z: 0, yaw: 0,
  }));
  const taken = (k, self) => chasers.some((c) => c !== self && (c.anchor === k || c.target === k));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const put = (idx, x, y, z, yaw, open, size = 1) => {
    q.setFromEuler(e.set(0, yaw, 0));
    mesh.setMatrixAt(idx, m4.compose(pos.set(x, y, z), q, sc.set(open * size, size, size)));
  };
  let clock = 0;
  let disposed = false;
  let landed = null;

  function flutterOff(c, catPos) {
    const here = { x: c.x, z: c.z };
    void here;
    const ok = [];
    BUTTERFLY_ANCHORS.forEach((a, k) => {
      if (k === c.anchor || taken(k, c)) return;
      if (Math.hypot(a[0] - catPos.x, a[1] - catPos.z) >= FLEE_FROM) ok.push(k);
    });
    let pick;
    if (ok.length) pick = ok[Math.min(ok.length - 1, Math.floor(hash01(c.i + c.flutters, c.flutters * 7 + 1, GH_BUTTERFLY_SALT) * ok.length))];
    else {
      let far = -1;
      BUTTERFLY_ANCHORS.forEach((a, k) => {
        if (k === c.anchor || taken(k, c)) return;
        const d = Math.hypot(a[0] - catPos.x, a[1] - catPos.z);
        if (far < 0 || d > Math.hypot(BUTTERFLY_ANCHORS[far][0] - catPos.x, BUTTERFLY_ANCHORS[far][1] - catPos.z)) far = k;
      });
      pick = far < 0 ? c.anchor : far;
    }
    c.target = pick;
    c.mode = 'flee';
    c.flutters++;
  }

  return {
    mesh,
    get chasers() { return chasers.map((c) => ({ i: c.i, x: c.x, y: c.y, z: c.z, mode: c.mode, anchor: c.anchor, flutters: c.flutters, landed: c.mode === 'landed' })); },
    get cloud() { return cloud.map((c) => ({ x: c.x, y: c.y, z: c.z })); },
    // one lands on her head: the first chaser that is not already on her
    land(catPos) {
      if (disposed || landed) return false;
      const c = chasers.find((k) => k.mode === 'rest') ?? chasers[0];
      c.mode = 'landed';
      c.landedAt = clock;
      c.landX = catPos.x; c.landZ = catPos.z;
      landed = c;
      return true;
    },
    update(dt, t, catPos = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      const tt = reducedMotion ? 0 : t;
      for (const c of chasers) {
        if (c.mode === 'landed') {
          if (catPos && (Math.hypot(catPos.x - c.landX, catPos.z - c.landZ) > LAND_MOVE || clock - c.landedAt > LAND_MAX)) {
            landed = null;
            flutterOff(c, catPos);
          } else if (catPos) {
            c.x = catPos.x; c.y = catPos.y + 0.62; c.z = catPos.z;
          }
        } else if (c.mode === 'flee') {
          const a = anchorPos(c.target);
          const dx = a.x - c.x, dy = a.y - c.y, dz = a.z - c.z;
          const d = Math.hypot(dx, dy, dz);
          const mv = Math.min(d, FLUTTER_SPEED * step);
          if (d > 1e-6) { c.x += (dx / d) * mv; c.y += (dy / d) * mv; c.z += (dz / d) * mv; c.yaw = Math.atan2(dx, dz); }
          if (d - mv < 0.05) { c.anchor = c.target; c.target = undefined; c.mode = 'rest'; }
        } else {
          const a = anchorPos(c.anchor);
          const orbit = reducedMotion ? 0 : 0.3;
          c.x = a.x + Math.sin(tt * 0.9 + c.i * 1.9) * orbit;
          c.z = a.z + Math.cos(tt * 0.7 + c.i * 1.3) * orbit;
          c.y = a.y + (reducedMotion ? 0 : Math.sin(tt * 1.7 + c.i) * 0.12);
          if (!reducedMotion) c.yaw = tt * 0.9 + c.i * 1.9 + Math.PI / 2;
          if (catPos && inRoom(catPos.x, catPos.z) && Math.hypot(catPos.x - c.x, catPos.z - c.z) < FLEE_R && Math.abs(catPos.y - c.y) < 2.5) flutterOff(c, catPos);
        }
        const flapRate = c.mode === 'flee' ? 16 : 9;
        const open = reducedMotion ? 0.8 : 0.25 + 0.75 * Math.abs(Math.cos(clock * flapRate + c.i * 2));
        put(c.i, c.x, c.y, c.z, c.yaw, c.mode === 'landed' && !reducedMotion ? 0.45 + 0.45 * Math.abs(Math.cos(clock * 3)) : open, 1.15);
      }
      const R0 = BUTTERFLY_ROOM;
      const cx = (R0.x0 + R0.x1) / 2, cz = (R0.z0 + R0.z1) / 2;
      for (const k of cloud) {
        const x = cx + Math.sin(tt * k.fx + k.ph) * 8.2;
        const z = cz + Math.sin(tt * k.fz + k.pz) * 4.6;
        k.yaw = Math.atan2(x - k.x, z - k.z);
        k.x = x; k.z = z;
        k.y = k.y0 + (reducedMotion ? 0 : Math.sin(tt * 0.9 + k.ph) * 0.35);
        const open = reducedMotion ? 0.8 : 0.25 + 0.75 * Math.abs(Math.cos(clock * k.flap + k.ph));
        put(CHASERS + k.i, k.x, k.y, k.z, k.yaw, open, 0.9);
      }
      if (!lite) {
        for (let i = 0; i < POLLINATORS; i++) {
          pollinatorAt(i, tt, pa0); pollinatorAt(i, tt + 0.15, pa1);
          const bee = i < 3;
          // beauty pass 3: they swing round her (never through) and settle back as she walks on
          let detour = 0;
          if (catPos && !reducedMotion) {
            for (const o of [pa0, pa1]) {
              const dx = o.x - catPos.x, dz = o.z - catPos.z, d = Math.hypot(dx, dz);
              if (d < POLL_AVOID) {
                const k = (POLL_AVOID - d) / POLL_AVOID;
                const push = (POLL_AVOID - d) + 0.2;
                o.x += (d > 1e-3 ? dx / d : 1) * push; o.z += (d > 1e-3 ? dz / d : 0) * push; o.y += 0.5 * k;
                detour = Math.max(detour, k);
              }
            }
          }
          const yaw = reducedMotion ? 0 : Math.atan2(pa1.x - pa0.x, pa1.z - pa0.z);
          const open = reducedMotion ? 0.8 : 0.25 + 0.75 * Math.abs(Math.cos(clock * (bee ? 38 : 11) * (1 + 0.5 * detour) + i * 2));
          put(CHASERS + CLOUD + i, pa0.x, pa0.y, pa0.z, yaw, open, bee ? 0.75 : 1.4);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      disposed = true;
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    },
  };
}
