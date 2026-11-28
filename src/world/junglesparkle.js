// =============================================================================
// THE JUNGLE LODGE: BEAUTY PASS 1 (2026-11-28), colour and air. What the earlier rounds left out: flowers in more colours than each zone's one accent (hot pink, scarlet, white, violet,
// sky blue, coral, in small wild clusters), sun-dapple patches lying on the forest floor, a string of bunting along the veranda's front, a woven rug and a round doormat on the deck;
// and the air itself: butterflies that drift about the flower clusters (and lift away, gently, when she comes near) and fireflies that glow and wander in the shade. The still pieces go
// in stage b's non-casting merged bucket (no mesh, no collider, no word, no shadow); the butterflies are ONE small mesh and the fireflies ONE Points, both made by the walk's life.
// Paid for by cheaper shapes elsewhere (the grass blades and buttress roots in junglepolish.js lost their hidden bottom caps). Its own seeded streams, so every existing layout stays
// put. Draws no random number at run time and reads no clock (time arrives as `t`). Reduced motion: the butterflies sit still on their flowers and the fireflies hold a steady dim glow;
// the lower rungs keep fewer of each. No light is added.
// =============================================================================
import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import * as P from './jungleplan.js';
import { COL, paint, pad, dotTexture } from './jungleparts.js';
import { isLowTier } from './junglelight.js';

export const SPARKLE = Object.freeze({
  anchors: 7, perAnchor: 3, dapples: 14, flags: 20,
  butterflies: Object.freeze({ high: 10, low: 6, lite: 4 }),
  fireflies: Object.freeze({ high: 30, low: 18, lite: 8 }),
});
export const BLOOMS = Object.freeze([0xff4f9a, 0xe8302c, 0xfafaf2, 0x9a5ae0, 0x5ab8ff, 0xff7a5a]);
const WINGS = Object.freeze([[0xffa030, 0xff6a20], [0x5ab8f0, 0x3a7ad8], [0xf060a0, 0xc03a82], [0xf8e050, 0xf0b030], [0xfafaf2, 0xc8d8f0]]);
const BUNTING = Object.freeze([0xff4f9a, 0xffa030, 0xf8e050, 0x3ac8b8, 0x9a5ae0, 0x6ac84a]);
const TAU = Math.PI * 2;

export const rungOf = (tier) => (tier && tier.shadows === false ? 'lite' : isLowTier(tier) ? 'low' : 'high');

/** The plan: pure and seeded. { anchors: [{ x, z, blooms: [{ dx, dz, hex }] }], dapples: [{ x, z, r, yaw }], fireflies: [{ x, z, y, ph, a, b, c }] }. */
export function sparklePlan() {
  const solid = P.jungleColliders();
  const free = (x, z, m) => P.clearOf(x, z, m) && !solid.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + m);
  const B = P.JUNGLE_BOUNDS;
  const rng = mulberry32(0x73706b6c); // 'spkl'
  const anchors = [];
  for (let tries = 0; anchors.length < SPARKLE.anchors && tries++ < 4000;) {
    const x = anchors.length < 3 ? -9 + rng() * 18 : B.minX + 4 + rng() * (B.maxX - B.minX - 8); // the first three beside the ring and the court, where she walks most
    const z = anchors.length < 3 ? 22 + rng() * 11 : B.minZ + 4 + rng() * (B.maxZ - B.minZ - 8);
    if (!free(x, z, 1.6) || anchors.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) continue;
    const base = Math.floor(rng() * BLOOMS.length);
    const blooms = Array.from({ length: SPARKLE.perAnchor }, (_, i) => { const a = rng() * TAU; const d = 0.2 + rng() * 0.55; return { dx: Math.cos(a) * d, dz: Math.sin(a) * d, hex: BLOOMS[(base + i * 2 + (rng() < 0.3 ? 1 : 0)) % BLOOMS.length] }; });
    anchors.push({ x, z, blooms });
  }
  const trees = P.scatterTrees().filter((k) => !k.rim);
  const dapples = [];
  for (let tries = 0; dapples.length < SPARKLE.dapples && tries++ < 4000;) {
    const k = trees[Math.floor(rng() * trees.length)];
    const a = rng() * TAU; const d = 1.4 * k.s + rng() * 1.8;
    const x = k.x + Math.cos(a) * d; const z = k.z + Math.sin(a) * d;
    if (!free(x, z, 0.6) || dapples.some((o) => Math.hypot(o.x - x, o.z - z) < 2.4)) continue;
    dapples.push({ x, z, r: 0.55 + rng() * 0.5, yaw: rng() * TAU });
  }
  const fireflies = [];
  for (let tries = 0; fireflies.length < SPARKLE.fireflies.high && tries++ < 4000;) {
    const k = trees[Math.floor(rng() * trees.length)];
    const a = rng() * TAU; const d = 0.8 + rng() * 2.6;
    const x = k.x + Math.cos(a) * d; const z = k.z + Math.sin(a) * d;
    if (!free(x, z, 0.3)) continue;
    fireflies.push({ x, z, y: 0.5 + rng() * 1.7, ph: rng() * TAU, a: 0.25 + rng() * 0.3, b: 0.4 + rng() * 0.4, c: 0.2 + rng() * 0.25 });
  }
  return { anchors, dapples, fireflies };
}

// ---- the still pieces (stage b's soft bucket) ----------------------------------------------------------------------------------------
const tri = (a, b, c) => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(...c)]);
const both = (a, b, c) => [tri(a, b, c), tri(a, c, b)]; // a flag seen from either side (the paint material draws one face)

/** The pieces as [geometry, colour, jitter]; pure, so the tests count them. */
export function sparkleParts() {
  const out = [];
  const gy = P.jungleY;
  const { anchors, dapples } = sparklePlan();
  anchors.forEach((an) => an.blooms.forEach((f, i) => { // a short stem (open cone, three sides) and a bloom: an eight-sided diamond
    const x = an.x + f.dx; const z = an.z + f.dz; const y = gy(x, z);
    out.push([new THREE.ConeGeometry(0.02, 0.4, 3, 1, true).translate(x, y + 0.2, z), COL.leafDeep, i]);
    out.push([new THREE.OctahedronGeometry(0.13, 0).scale(1, 0.7, 1).translate(x, y + 0.44, z), f.hex, 0]);
  }));
  dapples.forEach((d, i) => out.push([pad(6).scale(d.r, 1, d.r * 0.7).rotateY(d.yaw).translate(d.x, gy(d.x, d.z) + 0.05, d.z), i % 2 ? 0xe0dc84 : 0xd0d878, 0]));
  // the veranda: bunting from post to post just in front of the hanging pots, a woven rug on the deck and a round doormat at the foot of the ramp
  const L = P.LODGE; const posts = P.LODGE_POSTS;
  const top = P.LODGE_WALL.top - 0.55;
  const z = L.z1 + 0.05;
  const n = SPARKLE.flags;
  const x0 = posts[0].x; const x1 = posts[posts.length - 1].x;
  const sag = (x) => { const t = (x - x0) / (x1 - x0); return top - 0.28 * Math.sin(((t * (posts.length - 1)) % 1) * Math.PI); }; // a scallop between each pair of posts (about)
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) / n) * (x1 - x0); const y = sag(x);
    out.push(...both([x - 0.2, y, z], [x + 0.2, y, z], [x, y - 0.4, z]).map((g) => [g, BUNTING[i % BUNTING.length], 0]));
  }
  const deck = L.deck + 0.1;
  const plane = (w, d, x, y, zz) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, zz);
  out.push([plane(2.4, 1.5, -9.0, deck, 16.5), 0xb4503c, 0]);
  out.push([plane(2.0, 1.1, -9.0, deck + 0.012, 16.5), 0xe8d8b0, 0]);
  out.push([plane(1.6, 0.4, -9.0, deck + 0.024, 16.5), 0x2fa89a, 0]);
  out.push([pad(8).scale(0.6, 1, 0.45).translate(-6, deck + 0.0, 17.4), 0xc8a060, 0]);
  return out;
}

export function drawSparkle(kit, M) {
  for (const [geo, hex, j] of sparkleParts()) kit.put('paint', M.paint, paint(geo, hex, j), { noCast: true });
}

// ---- the air (the walk's life) -----------------------------------------------------------------------------------------------------
const flapAt = (t, ph) => 0.15 + 0.95 * (0.5 + 0.5 * Math.sin(t * 13 + ph * 5));

/** One butterfly's position and heading at time t: a slow figure-eight about its flowers. Pure; fills `out`. */
export function butterflyAt(b, t, out = { x: 0, y: 0, z: 0, yaw: 0 }) {
  const a = t * b.speed + b.ph;
  const dx = b.rx * Math.cos(a); const dz = b.rz * 2 * Math.cos(2 * a);
  out.x = b.x + b.rx * Math.sin(a);
  out.z = b.z + b.rz * Math.sin(2 * a);
  out.y = P.jungleY(b.x, b.z) + b.h + 0.22 * Math.sin(a * 1.7 + b.ph);
  out.yaw = Math.atan2(dx, dz);
  return out;
}

function fillButterfly(arr, o, x, y, z, yaw, f) {
  const fx = Math.sin(yaw); const fz = Math.cos(yaw); const rx = fz; const rz = -fx;
  const cl = Math.cos(f) * 0.17; const lift = Math.sin(f) * 0.17;
  let k = o;
  const put = (px, py, pz) => { arr[k++] = px; arr[k++] = py; arr[k++] = pz; };
  for (const s of [1, -1]) {
    const A = [x + fx * 0.05, y, z + fz * 0.05]; const D = [x - fx * 0.07, y, z - fz * 0.07];
    const Bp = [x + rx * cl * s + fx * 0.07, y + lift, z + rz * cl * s + fz * 0.07];
    const Cp = [x + rx * cl * s * 0.75 - fx * 0.11, y + lift * 0.8, z + rz * cl * s * 0.75 - fz * 0.11];
    if (s > 0) { put(...A); put(...Bp); put(...Cp); put(...A); put(...Cp); put(...D); } else { put(...A); put(...Cp); put(...Bp); put(...A); put(...D); put(...Cp); }
  }
}

/** createJungleAir({ scene, tier, reducedMotion }) -> { butterflies, fireflies, update(dt, t, catPos, rain), dispose() } */
export function createJungleAir({ scene, tier = null, reducedMotion = false }) {
  const rung = rungOf(tier);
  const { anchors, fireflies: homes } = sparklePlan();
  const nB = SPARKLE.butterflies[rung];
  const nF = SPARKLE.fireflies[rung];
  const flies = Array.from({ length: nB }, (_, i) => {
    const an = anchors[i % anchors.length];
    return { x: an.x, z: an.z, rx: 0.9 + 0.35 * (i % 3), rz: 0.7 + 0.3 * (i % 2), h: 0.75 + 0.2 * (i % 4), speed: 0.35 + 0.05 * (i % 5), ph: i * 1.3, lift: 0 };
  });
  const bPos = new Float32Array(nB * 12 * 3);
  const bCol = new Float32Array(nB * 12 * 3);
  const c = new THREE.Color();
  flies.forEach((_, i) => {
    const [a, b2] = WINGS[i % WINGS.length];
    for (let v = 0; v < 12; v++) { c.setHex(v % 6 < 3 ? a : b2); bCol.set([c.r, c.g, c.b], (i * 12 + v) * 3); }
  });
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
  const butterflies = new THREE.Mesh(bGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }));
  butterflies.name = 'jungle:butterflies';
  butterflies.frustumCulled = false;
  butterflies.castShadow = false;
  Object.assign(butterflies.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(butterflies);

  const fPos = new Float32Array(nF * 3);
  const fCol = new Float32Array(nF * 3);
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
  const fires = new THREE.Points(fGeo, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, size: 0.42, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
  fires.name = 'jungle:fireflies';
  fires.frustumCulled = false;
  Object.assign(fires.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(fires);

  const pose = { x: 0, y: 0, z: 0, yaw: 0 };
  function draw(t, cat, rain, dt) {
    const tt = reducedMotion ? 0 : t;
    flies.forEach((b, i) => {
      butterflyAt(b, tt, pose);
      const near = cat && Math.hypot(cat.x - b.x, cat.z - b.z) < 3.2 ? 1 : 0; // she comes near: they rise a little and flutter faster, then settle back
      b.lift += (near - b.lift) * Math.min(1, Math.max(0, dt) * 2.5);
      const f = reducedMotion ? 0.8 : flapAt(t * (1 + 0.5 * b.lift), b.ph);
      fillButterfly(bPos, i * 36, pose.x, pose.y + 0.7 * b.lift, pose.z, pose.yaw, f);
    });
    bGeo.attributes.position.needsUpdate = true;
    const dim = 1 - 0.85 * Math.min(1, rain);
    for (let i = 0; i < nF; i++) {
      const h = homes[i];
      const x = h.x + 0.9 * Math.sin(tt * h.a + h.ph); const z = h.z + 0.9 * Math.cos(tt * h.c + h.ph * 1.3);
      fPos[i * 3] = x; fPos[i * 3 + 2] = z; fPos[i * 3 + 1] = P.jungleY(h.x, h.z) + h.y + 0.35 * Math.sin(tt * h.b + h.ph);
      const g = (reducedMotion ? 0.45 : Math.max(0.05, Math.sin(t * 1.3 + h.ph * 3)) ** 2) * dim;
      fCol[i * 3] = 0.95 * g; fCol[i * 3 + 1] = 0.85 * g; fCol[i * 3 + 2] = 0.3 * g;
    }
    fGeo.attributes.position.needsUpdate = true;
    fGeo.attributes.color.needsUpdate = true;
  }
  draw(0, null, 0, 0);
  return {
    butterflies,
    fireflies: fires,
    update(dt, t, catPos, rain = 0) { if (!reducedMotion) draw(t, catPos, rain, dt); },
    dispose() {
      scene.remove(butterflies, fires);
      bGeo.dispose(); butterflies.material.dispose();
      fGeo.dispose(); fires.material.dispose();
    },
  };
}
