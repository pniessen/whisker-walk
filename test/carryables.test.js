import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCarryMesh, createCarryables, MOUTH } from '../src/carryables.js';
import { CARRY_KINDS } from '../src/propsets.js';

const LIST = [
  { id: 'a', kind: 'stick', x: 1, z: 1 },
  { id: 'b', kind: 'sock', x: 3, z: 0 },
];

function fakeCat(scene, x = 0, z = 0) {
  const cat = new THREE.Group();
  const head = new THREE.Group();
  head.position.set(0, 0.56, -0.44);
  cat.add(head);
  cat.userData.parts = { head };
  cat.position.set(x, 0, z);
  scene.add(cat);
  return cat;
}

describe('createCarryables', () => {
  it('places items on the ground with their homes', () => {
    const scene = new THREE.Scene();
    const c = createCarryables(scene, LIST);
    expect(c.list).toHaveLength(2);
    const a = c.list[0];
    expect(a).toMatchObject({ id: 'a', kind: 'stick', onGround: true, holder: null, homeX: 1, homeZ: 1 });
    expect(a.mesh.parent).toBe(scene);
    expect(a.mesh.position.x).toBe(1);
    c.dispose();
  });

  it('nearest ignores held items', () => {
    const scene = new THREE.Scene();
    const c = createCarryables(scene, LIST);
    const cat = fakeCat(scene);
    expect(c.nearest({ x: 1, z: 1 }, 1).id).toBe('a');
    c.hold('a', cat);
    expect(c.nearest({ x: 1, z: 1 }, 1)).toBe(null);
    expect(c.nearest({ x: 1, z: 1 }, 5).id).toBe('b');
    c.placeAt('a', 1, 1);
    expect(c.nearest({ x: 1, z: 1 }, 1).id).toBe('a');
    c.dispose();
  });

  it("a held item follows its holder's mouth and is never a child of the cat", () => {
    const scene = new THREE.Scene();
    const c = createCarryables(scene, LIST);
    const cat = fakeCat(scene, 4, 5);
    c.hold('a', cat);
    c.update(0.016);
    const item = c.list[0];
    const want = cat.userData.parts.head.localToWorld(MOUTH.clone());
    expect(item.mesh.position.distanceTo(want)).toBeLessThan(1e-6);
    expect(item.mesh.parent).toBe(scene);
    expect(cat.children.includes(item.mesh)).toBe(false);
    cat.position.set(10, 0, -2);
    cat.rotation.y = 1;
    c.update(0.016);
    const want2 = cat.userData.parts.head.localToWorld(MOUTH.clone());
    expect(item.mesh.position.distanceTo(want2)).toBeLessThan(1e-6);
    expect(item.mesh.visible).toBe(true);
    c.dispose();
  });

  it('a holder with no head carries the item 0.3 m above its position', () => {
    const scene = new THREE.Scene();
    const c = createCarryables(scene, LIST);
    const body = new THREE.Object3D();
    body.position.set(2, 1, 3);
    scene.add(body);
    c.hold('a', body);
    c.update(0.016);
    expect(c.list[0].mesh.position.toArray()).toEqual([2, 1.3, 3]);
    c.dispose();
  });

  it('an item whose holder left the scene hides, and dispose is idempotent', () => {
    const scene = new THREE.Scene();
    const c = createCarryables(scene, LIST);
    const cat = fakeCat(scene);
    c.hold('a', cat);
    c.update(0.016);
    expect(c.list[0].mesh.visible).toBe(true);
    scene.remove(cat);
    c.update(0.016);
    expect(c.list[0].mesh.visible).toBe(false);
    c.dispose();
    expect(() => c.dispose()).not.toThrow();
    expect(scene.children.length).toBe(0);
  });

  it('take hides an item held by nobody; placeAt brings it back', () => {
    const scene = new THREE.Scene();
    const c = createCarryables(scene, LIST);
    c.take('a');
    expect(c.list[0]).toMatchObject({ onGround: false, holder: null });
    expect(c.list[0].mesh.visible).toBe(false);
    expect(c.nearest({ x: 1, z: 1 }, 1)).toBe(null);
    c.placeAt('a', 7, 8);
    expect(c.list[0].mesh.visible).toBe(true);
    expect(c.list[0].mesh.position.x).toBe(7);
    expect(c.list[0].mesh.position.z).toBe(8);
    expect(c.list[0].homeX).toBe(1);
    c.dispose();
  });

  it('disposes every geometry and material exactly once', () => {
    const scene = new THREE.Scene();
    const c = createCarryables(scene, CARRY_KINDS.map((kind, i) => ({ id: `i${i}`, kind, x: i, z: 0 })));
    const counts = new Map();
    for (const it of c.list) {
      it.mesh.traverse((o) => {
        for (const r of [o.geometry, o.material]) {
          if (!r || counts.has(r)) continue;
          counts.set(r, 0);
          r.addEventListener('dispose', () => counts.set(r, counts.get(r) + 1));
        }
      });
    }
    expect(counts.size).toBeGreaterThan(0);
    c.dispose();
    c.dispose();
    for (const n of counts.values()) expect(n).toBe(1);
  });

  it('unknown ids are ignored without throwing', () => {
    const c = createCarryables(new THREE.Scene(), LIST);
    expect(() => {
      c.hold('zz', new THREE.Object3D());
      c.placeAt('zz', 0, 0);
      c.take('zz');
    }).not.toThrow();
    c.dispose();
  });
});

describe('buildCarryMesh', () => {
  it('never throws and stays small', () => {
    for (const k of [...CARRY_KINDS, 'nope', undefined, null, 7]) {
      const m = buildCarryMesh(k);
      expect(m).toBeInstanceOf(THREE.Object3D);
      const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
      const big = Math.max(size.x, size.y, size.z);
      expect(big).toBeGreaterThan(0);
      expect(big).toBeLessThan(0.25);
    }
  });
});
