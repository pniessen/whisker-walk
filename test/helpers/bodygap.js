import * as THREE from 'three';
import { buildCat } from '../../src/cat/model.js';
import { animateCat } from '../../src/cat/animator.js';
import { buildSpot } from '../../src/people/figure.js';
import { spotKind } from '../../src/people/look.js';
import { pose, applyPose } from '../../src/people/pose.js';
import { catVolumes } from '../../src/people/reach.js';
import { JOINT_INDEX } from '../../src/people/parts.js';

// How near her head and body come to a person's own body (never the arms,
// which the head scratch keeps clear of her by its own rule), measured from
// the person's skinned triangles (corners, edge middles, centres) against the
// cat's head sphere and body capsule (catVolumes). Negative = she is inside.
export const CATS = ['tabby', 'siamese', 'persian', 'mainecoon', 'hagrid'];
const material = new THREE.MeshStandardMaterial({ vertexColors: true });
const ARMS = new Set(['upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR'].map((n) => JOINT_INDEX[n]));

export function spotsOfKind(kind, n, z = 7) {
  const out = [];
  for (let x = 0; out.length < n && x < 4000; x++) if (spotKind({ x, z }) === kind) out.push({ x, z });
  return out;
}

// the person's body samples (world, arms left out), in the mode, settled;
// `which`: the spot's person (1: a pair's child)
export function bodySamples(def, mode, which = 0) {
  const { people } = buildSpot(def, { material });
  const p = people[which];
  p.setDetail('near');
  const group = new THREE.Group();
  group.add(p.figure);
  group.updateMatrixWorld(true);
  for (let i = 0; i < 180; i++) { pose(p, { mode, t: i / 60 }); applyPose(p, 1 / 60); }
  group.updateMatrixWorld(true);
  p.mesh.skeleton.update();
  const geo = p.mesh.geometry;
  const idx = geo.index.array;
  const si = geo.getAttribute('skinIndex');
  const sw = geo.getAttribute('skinWeight');
  const v = [];
  const dominant = (i) => {
    let best = 0; let bw = -1;
    for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > bw) { bw = sw.getComponent(i, k); best = si.getComponent(i, k); }
    return best;
  };
  const pos = (i) => p.mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(p.mesh.matrixWorld);
  const keep = [];
  for (let i = 0; i < geo.getAttribute('position').count; i++) { keep[i] = !ARMS.has(dominant(i)); v[i] = keep[i] ? pos(i) : null; }
  const out = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = v[idx[t]]; const b = v[idx[t + 1]]; const c = v[idx[t + 2]];
    if (!a || !b || !c) continue;
    out.push(a, b, c,
      a.clone().add(b).multiplyScalar(0.5), b.clone().add(c).multiplyScalar(0.5), a.clone().add(c).multiplyScalar(0.5),
      a.clone().add(b).add(c).multiplyScalar(1 / 3));
  }
  return out;
}

const _cats = new Map();
function catOf(breed) {
  if (!_cats.has(breed)) {
    const cat = buildCat(breed);
    animateCat(cat, 'follow', 0.5, 0, false);
    _cats.set(breed, cat);
  }
  return _cats.get(breed);
}

// The smallest gap (m) from her head sphere and her body capsule to the
// samples, for her middle `dist` m from the person's middle, approached from
// `side` (rad round the person, 0 = in front of them), facing the person
// turned by `heading` (rad).
export function gapAt(samples, breed, dist, side, heading) {
  const cat = catOf(breed);
  cat.position.set(dist * Math.sin(side), 0, -dist * Math.cos(side));
  cat.rotation.y = Math.PI - side + heading;
  cat.updateMatrixWorld(true);
  return gapsFor(samples, cat);
}

// The same for a cat as she stands (her matrices up to date).
const _vol = { head: new THREE.Sphere(), body: { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 } };
export function gapsFor(samples, cat) {
  const vol = catVolumes(cat, _vol);
  const hc = vol.head.center; const hr = vol.head.radius;
  const a = vol.body.a; const b = vol.body.b;
  const abx = b.x - a.x; const aby = b.y - a.y; const abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let head = Infinity; let body = Infinity;
  for (const s of samples) {
    head = Math.min(head, Math.hypot(s.x - hc.x, s.y - hc.y, s.z - hc.z) - hr);
    let t = l2 > 0 ? ((s.x - a.x) * abx + (s.y - a.y) * aby + (s.z - a.z) * abz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    body = Math.min(body, Math.hypot(s.x - a.x - abx * t, s.y - a.y - aby * t, s.z - a.z - abz * t) - vol.body.r);
  }
  return { head, body };
}
