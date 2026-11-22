// The Lighthouse spike drawn (milestone 0), for verify-lighthouse.html only: plain
// shapes and flat colours, nothing the final place will keep. See lighthousespike.js.
import * as THREE from 'three';
import { litMaterial } from '../render/materials.js';
import { spikeArea, SPIKE_GROUND, TOWER, CAVE, POOL, STAIR, LANDINGS, GALLERY_Y, PLATEAU_Y } from './lighthousespike.js';

const C = { sand: 0xe6d3a3, sea: 0x4f8fb5, rock: 0x8d8478, grass: 0x8fa56a, red: 0xc8473a, white: 0xf3efe6, glass: 0xbfe3f0, stair: 0xb9a37f, post: 0x6e5a42, pool: 0x5aa7b8, lantern: 0xffc86b };

export function buildLighthouseSpike(scene) {
  const area = spikeArea();
  const g = new THREE.Group();
  const mats = new Map();
  const mat = (c, extra) => { const k = `${c}${JSON.stringify(extra ?? {})}`; if (!mats.has(k)) mats.set(k, litMaterial(c, extra)); return mats.get(k); };
  const add = (geo, c, x, y, z, extra) => { const m = new THREE.Mesh(geo, mat(c, extra)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const box = (x0, x1, y0, y1, z0, z1, c) => add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

  // the cove and the sea
  const sand = add(new THREE.PlaneGeometry(160, 160), C.sand, 0, -0.01, 0); sand.rotation.x = -Math.PI / 2; sand.castShadow = false;
  const sea = add(new THREE.PlaneGeometry(120, 160), C.sea, 98, 0.02, 0); sea.rotation.x = -Math.PI / 2; sea.castShadow = false;
  // the plateau: one block per strip (the cave's footprint left open) and the cave's roof over it
  for (const s of SPIKE_GROUND.strips) {
    const hz = s.width / 2;
    box(s.x0, s.x1, 0, PLATEAU_Y - 0.06, s.z0 - hz, s.z0 + hz, C.rock);
    box(s.x0 + 0.01, s.x1 - 0.01, PLATEAU_Y - 0.06, PLATEAU_Y, s.z0 - hz + 0.01, s.z0 + hz - 0.01, C.grass);
  }
  box(CAVE.minX, CAVE.maxX, CAVE.roof, PLATEAU_Y, CAVE.minZ, CAVE.maxZ, C.rock);
  box(CAVE.minX + 0.01, CAVE.maxX - 0.01, PLATEAU_Y - 0.06, PLATEAU_Y, CAVE.minZ + 0.01, CAVE.maxZ - 0.01, C.grass);
  add(new THREE.SphereGeometry(0.22, 12, 8), C.lantern, CAVE.minX + 1.2, 1.9, (CAVE.minZ + CAVE.maxZ) / 2, { emissive: C.lantern, emissiveIntensity: 1.2 }).castShadow = false;

  // the tower: striped shaft, gallery, rail, lamp room
  for (let i = 0; i < 5; i++) {
    const y0 = PLATEAU_Y + (i * (GALLERY_Y - PLATEAU_Y)) / 5;
    add(new THREE.CylinderGeometry(3.3 - i * 0.05, 3.4 - i * 0.05, (GALLERY_Y - PLATEAU_Y) / 5, 28), i % 2 ? C.white : C.red, TOWER.x, y0 + (GALLERY_Y - PLATEAU_Y) / 10, TOWER.z);
  }
  add(new THREE.CylinderGeometry(TOWER.gallery, TOWER.gallery - 0.2, 0.5, 36), C.rock, TOWER.x, GALLERY_Y - 0.25, TOWER.z);
  add(new THREE.TorusGeometry(TOWER.gallery - 0.15, 0.05, 6, 48), C.post, TOWER.x, GALLERY_Y + 1.0, TOWER.z).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(2.2, 2.2, 3.2, 20, 1, true), C.glass, TOWER.x, GALLERY_Y + 1.6, TOWER.z, { transparent: true, opacity: 0.35, side: THREE.DoubleSide }).castShadow = false;
  add(new THREE.ConeGeometry(2.6, 1.6, 20), C.red, TOWER.x, GALLERY_Y + 4.0, TOWER.z);
  add(new THREE.SphereGeometry(0.7, 14, 10), C.lantern, TOWER.x, GALLERY_Y + 1.4, TOWER.z, { emissive: C.lantern, emissiveIntensity: 0.6 });

  // the landings, the stair treads, and a post under every few metres
  for (const p of LANDINGS.slice(1)) add(new THREE.CylinderGeometry(STAIR.ledge, STAIR.ledge, p.y - PLATEAU_Y, 16), C.stair, p.x, (p.y + PLATEAU_Y) / 2, p.z);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const c of area.traversal.crossings) {
    c.segs.forEach((s, k) => {
      a.set(s.x0, s.y0, s.z0);
      b.set(s.x0 + s.dx, s.y0 + s.dy, s.z0 + s.dz);
      const len = a.distanceTo(b);
      const m = add(new THREE.BoxGeometry(1.0, 0.14, len + 0.04), C.stair, (a.x + b.x) / 2, (a.y + b.y) / 2 - 0.07, (a.z + b.z) / 2);
      m.lookAt(b.x, b.y - 0.07, b.z);
      if (k % 2 === 0 && s.y0 - PLATEAU_Y > 0.5 && s.dy !== 0) add(new THREE.CylinderGeometry(0.07, 0.07, s.y0 - PLATEAU_Y, 6), C.post, s.x0, (s.y0 + PLATEAU_Y) / 2, s.z0);
    });
  }
  // a striped bollard at the foot
  add(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 10), C.red, LANDINGS[0].x + 0.7, PLATEAU_Y + 0.35, LANDINGS[0].z - 0.5);

  // the pool and its rim stones
  add(new THREE.CylinderGeometry(POOL.r, POOL.r, 0.04, 28), C.pool, POOL.x, 0.03, POOL.z).castShadow = false;
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2;
    add(new THREE.SphereGeometry(0.4 + 0.1 * (i % 3), 8, 6), C.rock, POOL.x + (POOL.r + 0.25) * Math.cos(t), 0.15, POOL.z + (POOL.r + 0.25) * Math.sin(t));
  }
  scene.add(g);
  return { ...area, group: g };
}
