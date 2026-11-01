import * as THREE from 'three';
import { buildCat } from '../../src/cat/model.js';
import { animateCat } from '../../src/cat/animator.js';
import { LEGACY_BODY } from '../../src/cat/torso.js';

// Shared by the golden-fingerprint and pose-baseline tests (cat body reshape).

export const PRESETS = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon', 'zeetoo', 'robbie', 'd2', 'digit'];
export const STATES = ['follow', 'nap', 'stretch', 'groom', 'requestPet', 'perch', 'sniff', 'stalk', 'pounce', 'scared', 'cross', 'land'];
export const STANDING = ['follow', 'sniff', 'stretch', 'groom', 'pounce', 'scared', 'cross', 'land'];
export const CROUCH = ['nap', 'stalk', 'perch', 'requestPet'];
export const DRESSED = { collar: 'bell', head: 'tophat', face: 'glasses', neck: 'scarf', body: 'sweater', back: 'backpack', feet: 'sneakers' };

// "+ 0" turns -0 into 0.
export const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;
const r4a = (arr) => Array.from(arr, r4).join(',');

const weighted = (arr) => {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i] * (i % 7 + 1);
  return r4(sum);
};

export function meshCount(obj) {
  let n = 0;
  obj.traverse((o) => { if (o.isMesh) n++; });
  return n;
}

export function triangles(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return n;
}

function depthPath(o, root) {
  const idx = [];
  for (let n = o; n !== root; n = n.parent) idx.push(n.parent.children.indexOf(n));
  return idx.reverse().join('.') || 'root';
}

export function fingerprintCat(cat) {
  cat.updateMatrixWorld(true);
  const lines = [];
  let meshes = 0;
  let tris = 0;
  cat.traverse((o) => {
    if (!(o.isMesh || o.isLine)) return;
    const g = o.geometry;
    const m = o.material;
    const count = g.attributes.position.count;
    const color = g.attributes.color;
    const colourKey = color ? weighted(color.array) : m.color.getHexString();
    if (o.isMesh) {
      meshes++;
      tris += (g.index ? g.index.count : count) / 3;
    }
    lines.push(
      `${depthPath(o, cat)}|${g.type}|v${count}|p${weighted(g.attributes.position.array)}|c${colourKey}|t${+m.transparent}|vc${+!!m.vertexColors}|${r4a(o.position.toArray())}|${r4a(o.quaternion.toArray())}|${r4a(o.scale.toArray())}`,
    );
  });
  const box = new THREE.Box3().setFromObject(cat);
  return { meshes, tris, box: [...box.min.toArray(), ...box.max.toArray()].map(r4), lines };
}

export function buildFor(key) {
  const [breed, variant] = key.split(':');
  if (variant === 'full') return buildCat(breed);
  if (variant === 'simple') return buildCat(breed, undefined, { simple: true });
  if (variant === 'dressed') return buildCat(breed, DRESSED);
  const cat = buildCat(breed);
  if (variant === 'walk') animateCat(cat, 'follow', 2.7, 1.5, false);
  else animateCat(cat, variant, 1.3, 0, false);
  return cat;
}

export const goldenKeys = () => PRESETS.flatMap((b) => [`${b}:full`, `${b}:simple`, `${b}:dressed`]);
export const hagridKeys = () => [...STATES.map((s) => `hagrid:${s}`), 'hagrid:walk', 'hagrid:full', 'hagrid:dressed'];

export function poseMeasure(cat, state, t = 1.3) {
  animateCat(cat, state, t, 0, false);
  cat.updateMatrixWorld(true);
  const s = cat.scale.x;
  const ext = (objs) => {
    const box = new THREE.Box3();
    for (const o of objs) box.union(new THREE.Box3().setFromObject(o, true));
    return box;
  };
  const all = ext([cat]);
  // The torso is the body mesh and everything on it (since Task 6 that
  // includes the underside: belly, chest, ruff). The old rig, which recorded
  // the baseline, hung its belly separately as the group's second child.
  const torso = [cat.userData.parts.body];
  const belly = cat.children[1];
  if (!cat.userData.parts.underside && belly && belly.isMesh) torso.push(belly);
  const tb = ext(torso);
  return { min: r4(all.min.y / s), max: r4(all.max.y / s), torsoMin: r4(tb.min.y / s), torsoMax: r4(tb.max.y / s) };
}

// Cast from outside the surface, back towards the centre; a ray from inside a
// closed mesh misses its front faces.
export function surfaceHit(objects, centre, towards) {
  const list = Array.isArray(objects) ? objects : [objects];
  const cast = (to) => {
    const dir = to.clone().sub(centre).normalize();
    const ray = new THREE.Raycaster(centre.clone().addScaledVector(dir, 3), dir.clone().negate(), 0, 10);
    const hits = ray.intersectObjects(list, true);
    return hits.length ? hits[0].point.clone() : null;
  };
  // A ray straight along a mesh seam can slip between its two triangles: nudge
  // the target 0.01 mm sideways and retry.
  return cast(towards) ?? cast(towards.clone().add(new THREE.Vector3(1e-5, 0, 1e-5)));
}

// -----------------------------------------------------------------------------
// Painted coats (Task 4): the torso's vertex colours, read back per vertex
// against each vertex's undeformed unit direction.

// Every torso vertex of a freshly built cat: `u` is its undeformed unit
// direction (nose at -z), `c` its painted colour.
export function samples(breed, opts = {}) {
  const geo = buildCat(breed, undefined, opts).userData.parts.body.geometry;
  const unit = geo.userData.unit;
  const col = geo.attributes.color;
  const out = [];
  for (let i = 0; i < col.count; i++) {
    out.push({ u: [unit[i * 3], unit[i * 3 + 1], unit[i * 3 + 2]], c: new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)) });
  }
  return out;
}

// The sample whose direction is closest to `dir`.
export function nearest(list, dir) {
  const L = Math.hypot(...dir);
  let best = null;
  let bestDot = -Infinity;
  for (const s of list) {
    const d = (s.u[0] * dir[0] + s.u[1] * dir[1] + s.u[2] * dir[2]) / L;
    if (d > bestDot) { bestDot = d; best = s; }
  }
  return best;
}

// A point authored in the old torso's frame, as a unit direction on the torso
// (model.js's dirOn through LEGACY_BODY, normalised).
export function legacyDir(point) {
  const d = point.map((v, i) => (v - LEGACY_BODY.CENTRE[i]) / LEGACY_BODY.SCALE[i]);
  const L = Math.hypot(...d);
  return d.map((v) => v / L);
}

export const colourDistance = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
export const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
