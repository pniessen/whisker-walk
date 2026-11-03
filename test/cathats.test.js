import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { HAT_IDS, buildHat } from '../src/cat/hats.js';

// Accessories polish, Task 1 (2026-11-03): the owner said "Many of the hats
// float above the cat's ears". Every hat is now one vertex-coloured mesh, in
// head-local space, seated ON the skull: its lowest rim lies on the skull
// ellipsoid all round, and the ears poke through brims and bands (ear holes).

const SKULL_R = [0.21, 0.193, 0.1995];
const rho = (v) => Math.hypot(v.x / SKULL_R[0], v.y / SKULL_R[1], v.z / SKULL_R[2]);
const TABBY_EAR_TIP = 0.18 + 0.15 / 2; // ear centre + half its height
// The old top hat's crown cylinder topped out at head-local 0.3 + 0.14/2.
const OLD_TOPHAT_TOP = 0.37;

function hatOf(cat) {
  const { head } = cat.userData.parts;
  return head.children.filter((o) => o.isMesh && o.userData.hat);
}
function verts(mesh) {
  const p = mesh.geometry.attributes.position, out = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i));
  return out;
}
// The candle hat's elastic runs down the cheeks and under the jaw (y < 0);
// those vertices are not the seat.
const seatVerts = (mesh) => verts(mesh).filter((v) => v.y >= 0);

describe('hats sit on the head (accessories polish Task 1)', () => {
  it('buildHat returns null for an unknown id', () => {
    expect(buildHat('nonsense')).toBeNull();
    expect(buildHat(null)).toBeNull();
  });

  it.each(HAT_IDS)('%s is one vertex-coloured mesh on the head', (id) => {
    const hats = hatOf(buildCat('tabby', { head: id }));
    expect(hats).toHaveLength(1);
    expect(hats[0].userData.hat).toBe(id);
    expect(hats[0].material.vertexColors).toBe(true);
    // head-local: added straight to the head, no transform of its own
    expect(hats[0].position.length()).toBe(0);
    expect(hats[0].quaternion.w).toBe(1);
    expect(hats[0].scale.x).toBe(1);
  });

  it.each(HAT_IDS)('%s stays in budget: <= 900 triangles, <= 450 simple', (id) => {
    const tris = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    expect(tris(buildHat(id))).toBeLessThanOrEqual(900);
    expect(tris(buildHat(id, { simple: true }))).toBeLessThanOrEqual(450);
  });

  const CASES = ['tabby', 'digit', 'persian', 'mainecoon'].flatMap((b) => [false, true].flatMap((simple) => HAT_IDS.map((id) => [b, id, simple])));
  it.each(CASES)('%s %s (simple %s) sits on the skull, not above it', (breed, id, simple) => {
    const hats = hatOf(buildCat(breed, { head: id }, { simple }));
    expect(hats).toHaveLength(1);
    const V = seatVerts(hats[0]).sort((a, b) => a.y - b.y);
    const low = V.slice(0, Math.max(1, Math.ceil(V.length * 0.05)));
    for (const v of low) expect(Math.abs(rho(v) - 1) * 0.2).toBeLessThanOrEqual(0.012);
    for (const v of V) expect(rho(v)).toBeGreaterThanOrEqual(0.97);
  }, 120_000);

  it('nothing floats: every hat starts below the ear tips', () => {
    for (const id of HAT_IDS) {
      const [hat] = hatOf(buildCat('tabby', { head: id }));
      const minY = Math.min(...seatVerts(hat).map((v) => v.y));
      expect(minY, id).toBeLessThan(TABBY_EAR_TIP);
    }
  });

  it('the crowns show their band from the side', () => {
    for (const id of ['crown', 'partycrown', 'leafcrown']) {
      for (const simple of [false, true]) {
        const V = verts(buildHat(id, { simple }));
        const near = V.filter((v) => Math.abs(rho(v) - 1) * 0.2 <= 0.03).length;
        expect(near / V.length, `${id} simple ${simple}`).toBeGreaterThanOrEqual(0.3);
      }
    }
  });

  it('hats stay under the shop thumbnail top (the old top hat\'s top)', () => {
    const bare = buildCat('tabby', { head: 'tophat' });
    const { head } = bare.userData.parts;
    bare.updateMatrixWorld(true);
    const limit = head.localToWorld(new THREE.Vector3(0, OLD_TOPHAT_TOP, 0)).y;
    for (const id of HAT_IDS) {
      const cat = buildCat('tabby', { head: id });
      cat.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(hatOf(cat)[0]);
      expect(box.max.y, id).toBeLessThanOrEqual(limit + 1e-6);
    }
  });
});
