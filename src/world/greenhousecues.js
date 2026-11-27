// THE GREENHOUSE'S FIND CUES: a soft column of small gold motes at each unfound find's spot, visible from a few metres. One merged,
// unlit, translucent mesh (one draw call); rebuilt (cheap, a few dozen tiny shapes) when a find is made, so a found find stops cueing.
// The motes' places come from the find zones and the hash (no Math.random, no clock); the twinkle is only the mesh's opacity, frozen
// under reduced motion; the LOW quality draws fewer motes. Nothing here touches colliders or layout.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash01 } from './warehouselook.js';
import { GREENHOUSE_FIND_ZONES } from './greenhouseplan.js';

export const CUE_SALT = 0x6e5d9;
const GOLD = new THREE.Color(0xffe27a);

// the cue points of one find: each zone's centre (the palm's ring: its middle radius)
export function cuePoints(id, zones = GREENHOUSE_FIND_ZONES) {
  return (zones[id] ?? []).map((z) => ({ x: z.x + (z.rMin ? (z.rMin + z.r) / 2 : 0), z: z.z }));
}

function column(p, y0, n, salt) {
  const geos = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const a = hash01(p.x + i, p.z, salt) * Math.PI * 2;
    const g = new THREE.OctahedronGeometry(0.05 + 0.03 * (1 - t), 0);
    g.translate(p.x + Math.cos(a) * 0.22 * (0.4 + t), y0 + 0.35 + t * 1.3, p.z + Math.sin(a) * 0.22 * (0.4 + t));
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < col.length; k += 3) { col[k] = GOLD.r; col[k + 1] = GOLD.g; col[k + 2] = GOLD.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  return geos;
}

// createFindCues({ scene, ground, quality, reducedMotion }) -> { mesh, update(t), setFound(ids), dispose() }
export function createFindCues({ scene, ground = { y: () => 0 }, quality = 'high', reducedMotion = false, ids } = {}) {
  const all = ids ?? Object.keys(GREENHOUSE_FIND_ZONES);
  const per = quality === 'low' ? 3 : 6;
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.name = 'greenhouse:findcues';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  const done = new Set();
  const rebuild = () => {
    const geos = [];
    for (const id of all) {
      if (done.has(id)) continue;
      for (const p of cuePoints(id)) geos.push(...column(p, ground.y(p.x, p.z), per, CUE_SALT));
    }
    mesh.geometry.dispose();
    mesh.geometry = geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry();
    mesh.visible = geos.length > 0;
  };
  rebuild();
  scene?.add(mesh);
  return {
    mesh,
    get remaining() { return all.filter((id) => !done.has(id)); },
    setFound(ids2) { let changed = false; for (const id of ids2) if (!done.has(id)) { done.add(id); changed = true; } if (changed) rebuild(); },
    update(t) { mat.opacity = reducedMotion ? 0.7 : 0.55 + 0.2 * Math.sin(t * 2.2); },
    dispose() { scene?.remove(mesh); mesh.geometry.dispose(); mat.dispose(); },
  };
}
