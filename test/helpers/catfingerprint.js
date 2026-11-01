import * as THREE from 'three';
import { buildCat } from '../../src/cat/model.js';
import { animateCat } from '../../src/cat/animator.js';

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
  const torso = [cat.userData.parts.body];
  const belly = cat.children[1];
  if (belly && belly.isMesh) torso.push(belly);
  const tb = ext(torso);
  return { min: r4(all.min.y / s), max: r4(all.max.y / s), torsoMin: r4(tb.min.y / s), torsoMax: r4(tb.max.y / s) };
}

// Cast from outside the surface, back towards the centre; a ray from inside a
// closed mesh misses its front faces.
export function surfaceHit(objects, centre, towards) {
  const dir = towards.clone().sub(centre).normalize();
  const ray = new THREE.Raycaster(centre.clone().addScaledVector(dir, 3), dir.clone().negate(), 0, 10);
  const hits = ray.intersectObjects(Array.isArray(objects) ? objects : [objects], true);
  return hits.length ? hits[0].point.clone() : null;
}
