// =============================================================================
// THE ROOFTOPS' FLOCK, DRAWN (Rooftops step 3). The fourteen birds of
// roofsflock.js's roster, on the place's perches (area.birdPerches), made per
// walk by the area's life (roofslife.js).
//
// TWO DRAWS (S12). Every bird is one instance of `roofsFlock` (body, head,
// beak and tail in one low-poly, vertex-coloured geometry) and two of
// `roofsFlockWings` (one wing, mirrored for the right): two InstancedMeshes,
// coloured per kind by instanceColor (BIRD_LOOK), scaled by the kind's
// BIRD_KINDS scale, casting nothing, never culled. Made inside
// withLocalUuids, so making them draws nothing on Math.random.
//
// PERCHED. A bird stands with its feet on its perch's spot. A pigeon on a
// `roof` perch (a peck spot on a flat roof) pecks: its nose dips 0.35 rad for
// 0.25 s, every 1.5 to 3 s. Any other bird sits and looks about: every 2 to
// 5 s it turns its head (the bird turns as one: it is one instance) to a new
// look within LOOK.reach of its rest heading. Within 6 m of her it stops
// and faces her. Its wings lie folded along its sides. All of it is hash01
// of the bird and a counter, and the flock's own walk seconds (the sum of the
// dt it is given): no randomness, no clock.
//
// THE LIVE STATE, `birds`: { id, kind, at, flying, pos } per bird. `at` is the
// perch it is on and `pos` the spot it is drawn at; the flights (Task 4)
// write both. update() reads them every frame, allocates nothing and adds
// nothing to the scene; dispose() takes both meshes away.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { withLocalUuids } from './localuuids.js';
import { hash01 } from './warehouselook.js';
import { BIRD_KINDS, ROOFS_BIRDS, perchIndex } from './roofsflock.js';

// Each kind's body and wing colours (the instances' colours).
export const BIRD_LOOK = Object.freeze({
  pigeon: Object.freeze({ body: 0x8d93a0, wing: 0x7a8090 }),
  sparrow: Object.freeze({ body: 0x8a6040, wing: 0x6e4a30 }),
  gull: Object.freeze({ body: 0xeceae4, wing: 0xb8bcc2 }),
});

export const PECK = Object.freeze({ pitch: 0.35, time: 0.25, every: Object.freeze([1.5, 3]) });
// how far a sitting bird looks round from its rest heading (rad), how often
// (s), how fast it turns (rad/s); and how near her it faces her (m)
export const LOOK = Object.freeze({ reach: 0.8, every: Object.freeze([2, 5]), turn: 5, near: 6 });

const SALT = Object.freeze({ rest: 41, look: 43, lookAt: 47, peck: 53 });

// ---------------------------------------------------------------------------
// The shapes, a pigeon's size (the instances scale them): feet at the origin,
// facing +z, its left to +x.

// A piece's vertices in one colour (multiplied by the instance's).
function shade(g, k) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3).fill(k);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}

function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

// The body (20 triangles), the head (8), the beak (3) and the tail (2).
function bodyGeometry() {
  const body = new THREE.IcosahedronGeometry(1, 0);
  body.scale(0.085, 0.075, 0.14);
  body.translate(0, 0.1, 0);
  const head = new THREE.OctahedronGeometry(0.055, 0);
  head.translate(0, 0.19, 0.11);
  const beak = new THREE.ConeGeometry(0.016, 0.05, 3, 1, true);
  beak.rotateX(Math.PI / 2); // its point forward
  beak.translate(0, 0.185, 0.185);
  const tail = quad([-0.035, 0.11, -0.1], [0.035, 0.11, -0.1], [0.05, 0.075, -0.24], [-0.05, 0.075, -0.24]);
  const g = mergeGeometries([shade(body, 1), shade(head, 0.82), shade(beak, 0.45), shade(tail, 0.75)]);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// One wing (2 triangles): its root along z at the shoulder (its leading edge
// toward +z), its span out along +x and swept back to its tip, so a beat is a
// turn about z (Task 4).
const WING = Object.freeze({ span: 0.2, root: Object.freeze([0.05, -0.06]), tip: -0.08 });
function wingGeometry() {
  const [f, b] = WING.root;
  const g = quad([0, 0, f], [0, 0, b], [WING.span, 0, WING.tip], [WING.span * 0.7, 0, f * 0.2]);
  return shade(g, 1);
}

// The folded left wing, in the bird's frame: its root at the shoulder, its
// span laid back along the body (a little in and down), its leading edge up
// and leaning in with the body's side. The right wing is its mirror.
const SHOULDER = Object.freeze({ x: 0.062, y: 0.12, z: 0.06 });
const FOLD = Object.freeze({ span: Object.freeze([-0.08, -0.05, -1]), edge: Object.freeze([-0.3, 1, 0]) });
function foldMatrices() {
  const span = new THREE.Vector3(...FOLD.span).normalize();
  const edge = new THREE.Vector3(...FOLD.edge);
  edge.addScaledVector(span, -edge.dot(span)).normalize();
  const side = new THREE.Vector3().crossVectors(edge, span);
  const left = new THREE.Matrix4().makeBasis(span, side, edge).setPosition(SHOULDER.x, SHOULDER.y, SHOULDER.z);
  const right = new THREE.Matrix4().makeScale(-1, 1, 1).multiply(left);
  return [left, right];
}

// ---------------------------------------------------------------------------

const lerp = (a, b, k) => a + (b - a) * k;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// createRoofsBirds(area, { scene, critters, visits, reducedMotion }) ->
// { birds, meshes, update(dt, catPos, camera), dispose() }. Perched only
// here: `critters`, `visits` and `reducedMotion` are for the flights (Task 4).
export function createRoofsBirds(area, { scene, critters = null, visits = 0, reducedMotion = false } = {}) { // eslint-disable-line no-unused-vars
  const index = perchIndex(area.birdPerches);
  const birds = ROOFS_BIRDS.map((r) => {
    const home = index.get(r.home);
    if (!home) throw new Error(`roofsbirds: ${r.id}'s home ${r.home} is not a perch`);
    return { id: r.id, kind: r.kind, at: r.home, flying: false, pos: { x: home.x, y: home.y, z: home.z } };
  });
  // what only this file reads: each bird's heading, look and pecks
  const idle = birds.map((b, i) => {
    const rest = hash01(i, 1, SALT.rest) * Math.PI * 2;
    return { scale: BIRD_KINDS[b.kind].scale, rest, yaw: rest, look: 0, lookK: 0, lookAt: lookTime(i, 0), peckK: 0, peckAt: peckTime(i, 0, 0), pitch: 0 };
  });

  const { flock, wings } = withLocalUuids('roofs-birds', () => {
    const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true, side: THREE.DoubleSide });
    const make = (name, geo, count) => {
      const m = new THREE.InstancedMesh(geo, mat(), count);
      m.name = name;
      m.castShadow = false;
      m.receiveShadow = false;
      m.userData.noCast = true;
      m.frustumCulled = false; // S12: always two draws
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return m;
    };
    const f = make('roofsFlock', bodyGeometry(), birds.length);
    const w = make('roofsFlockWings', wingGeometry(), birds.length * 2);
    const c = new THREE.Color();
    birds.forEach((b, i) => {
      f.setColorAt(i, c.setHex(BIRD_LOOK[b.kind].body));
      w.setColorAt(2 * i, c.setHex(BIRD_LOOK[b.kind].wing));
      w.setColorAt(2 * i + 1, c);
    });
    return { flock: f, wings: w };
  });
  const meshes = [flock, wings];
  scene.add(flock, wings);

  const [foldL, foldR] = foldMatrices();
  const m = new THREE.Matrix4();
  const mw = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const size = new THREE.Vector3();
  let walk = 0;

  function draw(i) {
    const b = birds[i];
    const s = idle[i];
    at.set(b.pos.x, b.pos.y, b.pos.z);
    euler.set(s.pitch, s.yaw, 0);
    rot.setFromEuler(euler);
    size.setScalar(s.scale);
    m.compose(at, rot, size);
    flock.setMatrixAt(i, m);
    wings.setMatrixAt(2 * i, mw.multiplyMatrices(m, foldL));
    wings.setMatrixAt(2 * i + 1, mw.multiplyMatrices(m, foldR));
  }

  function perch(i, dt, cat) {
    const b = birds[i];
    const s = idle[i];
    const p = b.pos;
    const near = cat && Math.hypot(cat.x - p.x, cat.y - p.y, cat.z - p.z) < LOOK.near;
    // where it looks: at her, else its rest heading and its look
    while (walk >= s.lookAt) {
      s.lookK++;
      s.look = (hash01(i, s.lookK, SALT.look) * 2 - 1) * LOOK.reach;
      s.lookAt += lookTime(i, s.lookK);
    }
    const pecks = !near && b.kind === 'pigeon' && index.get(b.at)?.kind === 'roof';
    const want = near ? Math.atan2(cat.x - p.x, cat.z - p.z) : pecks ? s.rest : s.rest + s.look;
    const off = wrap(want - s.yaw);
    const step = LOOK.turn * dt;
    s.yaw = wrap(Math.abs(off) <= step ? want : s.yaw + Math.sign(off) * step);
    // its pecks, on their own clock whether it pecks now or not
    while (walk >= s.peckAt + PECK.time) {
      s.peckK++;
      s.peckAt = peckTime(i, s.peckK, s.peckAt);
    }
    const u = (walk - s.peckAt) / PECK.time;
    s.pitch = pecks && u >= 0 && u <= 1 ? PECK.pitch * Math.sin(Math.PI * u) : 0;
  }

  for (let i = 0; i < birds.length; i++) draw(i);
  flock.instanceMatrix.needsUpdate = true;
  wings.instanceMatrix.needsUpdate = true;

  return {
    birds,
    meshes,
    update(dt, catPos = null, camera = null) { // eslint-disable-line no-unused-vars
      walk += dt;
      for (let i = 0; i < birds.length; i++) {
        perch(i, dt, catPos);
        draw(i);
      }
      flock.instanceMatrix.needsUpdate = true;
      wings.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const mesh of meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        mesh.dispose();
      }
    },
  };
}

// When bird i's look k ends (s after the last), and when its peck k starts:
// the first within the first interval, then every PECK.every apart.
function lookTime(i, k) {
  return lerp(LOOK.every[0], LOOK.every[1], hash01(i, k, SALT.lookAt));
}
function peckTime(i, k, last) {
  const gap = lerp(PECK.every[0], PECK.every[1], hash01(i, k, SALT.peck));
  return k === 0 ? gap * hash01(i, 0.5, SALT.peck) : last + gap;
}
