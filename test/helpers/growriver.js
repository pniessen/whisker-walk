import * as THREE from 'three';
import { canvasDocument } from './canvas.js';

// Shared by the bigger-areas tests: the River built with the switch off or on,
// counting the real Math.random draws its build takes, and a few measures.

export const canvasStub = canvasDocument({ measureText: 10, pointerLock: true });

export function buildRiver(river, setGrow, on, opts) {
  setGrow(on);
  const real = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return real(); };
  try {
    const scene = new THREE.Scene();
    const area = river.build(scene, opts);
    return { scene, area, draws };
  } finally {
    Math.random = real;
    setGrow(null);
  }
}

// FNV-1a over a typed array's bytes.
export function fnv(arr) {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

// One line per mesh under `obj`: its name, where it stands, and a hash of
// every attribute and its index: any moved vertex or colour changes it.
export function fingerprint(obj) {
  const out = [];
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const attrs = Object.keys(g.attributes).sort().map((k) => `${k}:${fnv(g.attributes[k].array)}`).join(',');
    const idx = g.index ? fnv(g.index.array) : '-';
    const col = [].concat(o.material).map((m) => m.color?.getHexString?.() ?? '').join('/');
    out.push(`${o.name}|${fnv(new Float32Array(o.matrixWorld.elements))}|${attrs}|${idx}|${col}|${o.visible}`);
  });
  return out;
}

export const trianglesOf = (obj) => {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position?.count ?? 0) / 3;
  });
  return n;
};

// test/budget.test.js's own count (every mesh a draw; a caster by the walk's
// rule), over the given top-level children.
export function budgetOf(children, { castsFromBox, isTransparentMat }) {
  let meshes = 0, casters = 0, triangles = 0;
  const box = new THREE.Box3();
  for (const child of children) {
    box.setFromObject(child);
    const eligible = castsFromBox(box);
    child.traverse((obj) => {
      if (!obj.isMesh) return;
      meshes++;
      const geo = obj.geometry;
      triangles += (geo.index ? geo.index.count : geo.attributes.position?.count ?? 0) / 3;
      if (eligible && !isTransparentMat(obj.material) && !obj.userData.noCast) casters++;
    });
  }
  return { meshes, casters, triangles: Math.round(triangles) };
}
