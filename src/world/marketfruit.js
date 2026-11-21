// =============================================================================
// THE MARKET'S FRUIT AND FLOWERS (Market step 3, V1 and V2). Part of the
// Market chunk: imported only by world/market.js and world/marketlife.js.
//
// THE APPLE CRATE (buildAppleCrate) is the fruit stall's one tippable. Its
// model rides the tippable's own `build` hook (tippables.js), so she paws it
// over through the ordinary prompt and the ordinary `tip` net event, and both
// screens tip the same crate. Its origin is at its base, on the bottom edge it
// tips over: tippables.js turns a tipped prop -1.75 rad about its own z, so
// the crate is drawn on local x -CRATE.w..0 and, once over, lies on its side
// with its open top (its mouth) facing local +x turned by the prop's yaw,
// world (cos yaw, -sin yaw). Drawn about its centre it would sink half its
// width into the cobbles.
//
// THE APPLES (applePaths, createApples). When it goes over, six apples roll
// out of its mouth along paths that are data: each apple's angle in the fan
// and how far it rolls come from hash01(i, 0, MARKET_APPLE_SALT), and a path
// runs along its ray from the crate in 0.05 m steps, from the first walkable
// point past the mouth to the last walkable point within its roll, so an apple
// never rolls into anything solid. The same crate yaw (tippables.js derives it
// from the spot) gives the same paths on both screens. The apples are
// scenery: nothing solid, nothing she can touch, nothing paid. They roll a
// short way, ease to a stop and lie still for the rest of the walk (the calm
// square: test/marketfruit.test.js keeps every one out of each treat counter's
// watch zone and off every way to a treat).
//   One InstancedMesh, one draw call, hidden until the crate is over. Each
// apple tumbles out of the mouth, drops to the cobbles and rolls (its spin is
// its roll, distance over radius) to its end, where it is set exactly, so
// every screen ends on the same numbers. Under reduced motion they are simply
// there at their ends, at the same rest as everywhere else.
//
// THE PETALS (createPetals). Where the flower stall's bucket lands (its
// curated fallTo, propsets.js), about twelve flat petals lie in a ring round
// it. One merged mesh, hidden until shown, casting nothing.
//
// No Math.random, no clock: everything here is hash01 and walk seconds.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash01 } from './warehouselook.js';
import { isWalkableAt } from '../player.js';
import { withLocalUuids } from './localuuids.js';
import { FRUIT_CRATE } from './marketplan.js';

export const MARKET_APPLE_SALT = 113;
export const MARKET_PETAL_SALT = 127;

// n apples of radius r; each rolls roll.min..roll.max m past the mouth over
// `time` s; `spread` rad is the fan's whole width about the mouth's line.
export const APPLES = Object.freeze({ n: 6, r: 0.045, roll: Object.freeze({ min: 0.8, max: 2.2 }), time: 1.4, spread: 0.9 });
const STEP = 0.05; // m: the walkability samples along a ray
const MOUTH = 0.35; // m from the crate's spot: just past its mouth once over
const TUMBLE = 0.3; // m: an apple starts this far behind its path, at the mouth
const DROP = 0.1; // m: and this far up, falling to the cobbles in its first quarter
const STAGGER = 0.06; // s between one apple and the next

// the crate: a box of slats, local x -w..0, z -d/2..d/2, h high (the plan's numbers)
const CRATE = FRUIT_CRATE;
const SLAT_WOOD = 0xb98a55;
const POST_WOOD = 0x8a6238;
const APPLE_REDS = Object.freeze([0xc8322a, 0xd9452e, 0xb02a24, 0x9fbf3a, 0xd23c2c, 0xa8c040]);

const _c = new THREE.Color();
function painted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  _c.setHex(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const boxAt = (w, h, d, x, y, z, hex) => painted(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);

// buildAppleCrate() -> THREE.Group: a slatted crate heaped with apples, one
// mesh, under 300 triangles, its origin at its base on the edge it tips over.
export function buildAppleCrate() {
  return withLocalUuids('market-apple-crate', drawAppleCrate);
}
function drawAppleCrate() {
  const { w, d, h } = CRATE;
  const cx = -w / 2;
  const parts = [boxAt(w, 0.02, d, cx, 0.01, 0, SLAT_WOOD)]; // the bottom
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(boxAt(0.03, h, 0.03, cx + sx * (w / 2 - 0.015), h / 2, sz * (d / 2 - 0.015), POST_WOOD));
  }
  for (const y of [0.08, 0.23]) { // two slats a side, a gap between
    for (const sz of [-1, 1]) parts.push(boxAt(w, 0.06, 0.015, cx, y, sz * (d / 2 - 0.008), SLAT_WOOD));
    for (const sx of [-1, 1]) parts.push(boxAt(0.015, 0.06, d - 0.03, cx + sx * (w / 2 - 0.008), y, 0, SLAT_WOOD));
  }
  // the heap: a bed of apples just under the rim, five on top of it
  parts.push(painted(new THREE.PlaneGeometry(w - 0.04, d - 0.04).rotateX(-Math.PI / 2).translate(cx, h - 0.035, 0), 0xa82822));
  const heap = [[-0.09, -0.07], [0.08, -0.08], [0, 0.04], [-0.1, 0.09], [0.1, 0.08]];
  heap.forEach(([dx, dz], i) => {
    parts.push(painted(new THREE.IcosahedronGeometry(APPLES.r, 0).translate(cx + dx, h - 0.012 + (i === 2 ? 0.012 : 0), dz), APPLE_REDS[i]));
  });
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
  mesh.name = 'marketAppleCrate';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.noCast = true;
  const g = new THREE.Group();
  g.name = 'marketAppleCrate';
  g.add(mesh);
  return g;
}

// applePaths(area, crateAt, mouthYaw) -> [{ x0, z0, x1, z1 }] x APPLES.n. Pure.
// `mouthYaw` is the tipped crate's rotation.y: its mouth faces world
// (cos yaw, -sin yaw). Apple i's ray leaves the crate's spot at the fan's
// slot i, jittered within it; it rolls roll.min..roll.max past its start.
// x0 is the first walkable sample past the mouth, x1 the last walkable one
// before the roll runs out or the ray meets anything solid.
export function applePaths(area, crateAt, mouthYaw) {
  const { n, roll, spread } = APPLES;
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = hash01(i, 0, MARKET_APPLE_SALT);
    const jitter = (h * 7) % 1; // a second number from the same draw
    const a = mouthYaw + ((i + 0.5) / n - 0.5) * spread + (jitter - 0.5) * (spread / n);
    const ux = Math.cos(a);
    const uz = -Math.sin(a);
    const at = (s) => [crateAt.x + ux * s, crateAt.z + uz * s];
    let k = Math.ceil(MOUTH / STEP);
    const kMax = k + Math.ceil((roll.max + 1) / STEP);
    while (k < kMax && !isWalkableAt(area, ...at(k * STEP))) k++;
    const k0 = k;
    const kEnd = k0 + Math.floor((roll.min + (roll.max - roll.min) * h) / STEP + 1e-9);
    while (k < kEnd && isWalkableAt(area, ...at((k + 1) * STEP))) k++;
    const [x0, z0] = at(k0 * STEP);
    const [x1, z1] = at(k * STEP);
    out.push({ x0, z0, x1, z1 });
  }
  return out;
}

// The apples' one InstancedMesh (its uuids from a local stream: withLocalUuids).
function appleMesh(n) {
  const { r } = APPLES;
  const body = new THREE.IcosahedronGeometry(r, 1);
  const stem = new THREE.CylinderGeometry(0.004, 0.005, 0.022, 4, 1, true).translate(0, r + 0.008, 0);
  const parts = [painted(body, 0xffffff), painted(stem, 0x5a3a20)];
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'marketApples';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noCast = true;
  mesh.visible = false;
  mesh.frustumCulled = false; // they move after the first frame's bounds would be taken
  return { geo, mat, mesh };
}

// createApples(scene, paths, { reducedMotion }) -> { start(), update(dt), mesh, dispose() }.
export function createApples(scene, paths, { reducedMotion = false } = {}) {
  const n = paths.length;
  const { r, time } = APPLES;
  const { geo, mat, mesh } = withLocalUuids('market-apples', () => appleMesh(n));
  for (let i = 0; i < n; i++) mesh.setColorAt(i, _c.setHex(APPLE_REDS[i % APPLE_REDS.length]));

  // each apple's fixed numbers, made once: where it starts, its line, its spin's axis, its own turn
  const apples = paths.map((p, i) => {
    let ux = p.x1 - p.x0;
    let uz = p.z1 - p.z0;
    const len = Math.hypot(ux, uz);
    if (len > 1e-9) { ux /= len; uz /= len; } else { ux = 1; uz = 0; }
    const sx = p.x0 - ux * TUMBLE;
    const sz = p.z0 - uz * TUMBLE;
    return {
      sx, sz, x1: p.x1, z1: p.z1,
      run: Math.hypot(p.x1 - sx, p.z1 - sz),
      axis: new THREE.Vector3(uz, 0, -ux), // up x its line: the way it turns rolling along it
      turn: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash01(i, 1, MARKET_APPLE_SALT) * Math.PI * 2),
      delay: i * STAGGER,
    };
  });
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3(1, 1, 1);
  const _m = new THREE.Matrix4();

  function pose(i, u) {
    const a = apples[i];
    if (u >= 1) {
      _p.set(a.x1, r, a.z1);
      _q.setFromAxisAngle(a.axis, a.run / r); // the same rest on every screen, reduced motion or not
    } else {
      const e = 1 - (1 - u) * (1 - u) * (1 - u);
      const f = Math.max(0, 1 - u * 4);
      _p.set(a.sx + (a.x1 - a.sx) * e, r + DROP * f * f, a.sz + (a.z1 - a.sz) * e);
      _q.setFromAxisAngle(a.axis, (a.run * e) / r);
    }
    _q.multiply(a.turn);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
  }
  for (let i = 0; i < n; i++) pose(i, 0);

  let t = 0;
  let running = false;
  let started = false;
  function step() {
    let still = true;
    for (let i = 0; i < n; i++) {
      const u = reducedMotion ? 1 : Math.min(1, Math.max(0, (t - apples[i].delay) / time));
      if (u < 1) still = false;
      pose(i, u);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (still) running = false;
  }

  scene.add(mesh);
  return {
    mesh,
    start() {
      if (started) return;
      started = true;
      running = true;
      mesh.visible = true;
      step();
    },
    update(dt) {
      if (!running || !(dt > 0)) return;
      t += dt;
      step();
    },
    dispose() {
      scene.remove(mesh);
      geo.dispose();
      mat.dispose();
      mesh.dispose?.();
      running = false;
    },
  };
}

// createPetals(scene, at) -> { show(), mesh, dispose() }: about twelve flat
// petals in a ring round `at` (x, z, and the height of what it lies on, y),
// r <= 0.6, none under the thing itself. One merged mesh, hidden until shown.
const PETALS = Object.freeze({ n: 12, inner: 0.22, outer: 0.54, len: 0.075, wide: 0.045 });
const PETAL_COLOURS = Object.freeze([0xf2a0c0, 0xfff6ee, 0xf6d04d, 0xd8433c, 0xb48ad8]);
export function createPetals(scene, at) {
  const { n, inner, outer, len, wide } = PETALS;
  const pos = [];
  const col = [];
  const idx = [];
  const base = (Number.isFinite(at.y) ? at.y : 0) + 0.008; // over the landed thing's decal
  for (let i = 0; i < n; i++) {
    const h = hash01(i, 0, MARKET_PETAL_SALT);
    const h2 = hash01(i, 1, MARKET_PETAL_SALT);
    const h3 = hash01(i, 2, MARKET_PETAL_SALT);
    const a = (i / n) * Math.PI * 2 + (h - 0.5) * 0.4;
    const rr = inner + (outer - inner) * h2;
    const cx = Math.cos(a) * rr;
    const cz = Math.sin(a) * rr;
    const yaw = h3 * Math.PI * 2;
    const fx = Math.cos(yaw), fz = Math.sin(yaw); // along the petal
    const y = base + 0.002 * (i % 3);
    const v0 = pos.length / 3;
    // tip, side, back, side: a diamond lying flat
    pos.push(cx + fx * len / 2, y, cz + fz * len / 2);
    pos.push(cx - fz * wide / 2, y, cz + fx * wide / 2);
    pos.push(cx - fx * len / 2, y, cz - fz * len / 2);
    pos.push(cx + fz * wide / 2, y, cz - fx * wide / 2);
    _c.setHex(PETAL_COLOURS[Math.floor(hash01(i, 3, MARKET_PETAL_SALT) * PETAL_COLOURS.length)]);
    for (let k = 0; k < 4; k++) col.push(_c.r, _c.g, _c.b);
    // wound to face up: (b - a) x (c - a) has +y
    idx.push(v0, v0 + 2, v0 + 1, v0, v0 + 3, v0 + 2);
  }
  const { geo, mat, mesh } = withLocalUuids('market-petals', () => petalMesh(pos, col, idx));
  mesh.position.set(at.x, 0, at.z);
  scene.add(mesh);
  return {
    mesh,
    show() { mesh.visible = true; },
    dispose() {
      scene.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}
function petalMesh(pos, col, idx) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'marketPetals';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noCast = true;
  mesh.visible = false;
  return { geo, mat, mesh };
}
