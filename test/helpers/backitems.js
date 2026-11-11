import { it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../../src/cat/model.js';
import { animateCat } from '../../src/cat/animator.js';
import { BACK_ITEM_IDS, STRAP_GREY } from '../../src/cat/backitems.js';

// Shared by test/catbackitems.test.js and catbackitems.<item>.test.js. The
// sweep below raycasts every item vertex against the fur and the cover in
// nine poses for 84 cats (~100 s); it is defined here once and run per back
// item from its own file, so vitest runs the three side by side. The
// assertions are exactly as they were in catbackitems.test.js.
//
// Every measure is in the cat's own frame (world / cat.scale.x).

export const DESCRIBE = 'back items are shaped things on the back (accessories polish Task 2)';
export const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
export const kitCat = (breed, back, body = null, simple = false) => buildCat(breed, { ...BARE, back, body }, { simple });
export const itemsOf = (cat) => {
  const out = [];
  cat.traverse((o) => { if (o.isMesh && o.userData.backItem) out.push(o); });
  return out;
};
export const tris = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
export const meshTris = (objs) => { let n = 0; for (const o of objs) o.traverse((m) => { if (m.isMesh) n += tris(m); }); return n; };
// strap vertices (found by their colour): they lie on the cover by design, so
// "resting on it" is measured over the item itself
export const STRAP = new THREE.Color(STRAP_GREY);
export const isStrap = (col, i) => Math.abs(col.getX(i) - STRAP.r) + Math.abs(col.getY(i) - STRAP.g) + Math.abs(col.getZ(i) - STRAP.b) < 1e-4;

// Out of the cover and resting on it, in every pose: rays from the item's
// vertices toward the torso's centre meet the cover (cape or shell, when one
// is worn) before the fur, and the vertex is outside both; its nearest
// vertex is within 2 cm of the cover (no floating cube in the stalk).
export const BREEDS = ['tabby', 'digit', 'persian', 'mainecoon', 'd2'];
export const COVERS = [null, 'cape', 'hoodie', 'sweater'];
const POSES = [['follow', 1.3, 0], ['follow', 0.4, 1.5], ['follow', 1.3, 1.5], ['stalk', 1.3, 0], ['nap', 1.3, 0], ['perch', 1.3, 0], ['perch', 0.4, 0], ['requestPet', 1.3, 0], ['requestPet', 2.2, 0]];
const coverOf = (cat, body) => {
  const kids = cat.userData.parts.body.children.filter((c) => c.isMesh && !c.userData.backItem && c !== cat.userData.parts.underside);
  if (body === 'cape') return kids.find((c) => c.userData.cape);
  if (body) return kids.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
  return null;
};
const ray = new THREE.Raycaster();
const v = new THREE.Vector3(), C = new THREE.Vector3(), dir = new THREE.Vector3(), F = new THREE.Vector3();
// full builds on every breed; simple builds (strays, clan cats) on two
export const CASES = [
  ...BREEDS.flatMap((b) => BACK_ITEM_IDS.flatMap((id) => COVERS.map((c) => [b, id, c, false]))),
  ...['tabby', 'digit'].flatMap((b) => BACK_ITEM_IDS.flatMap((id) => COVERS.map((c) => [b, id, c, true]))),
];
export function coverSweep(item) {
  it.each(CASES.filter(([, id]) => id === item))('%s %s over %s (simple %s): out of the cover, touching it, in every pose', (breed, id, body, simple) => {
    const cat = kitCat(breed, id, body, simple);
    const { body: torso, underside } = cat.userData.parts;
    const cover = coverOf(cat, body);
    if (body) expect(cover, 'the cover').toBeTruthy();
    for (const [state, t, speed] of POSES) {
      animateCat(cat, state, t, speed, false);
      cat.updateMatrixWorld(true);
      const s = cat.scale.x;
      torso.getWorldPosition(C);
      for (const m of itemsOf(cat)) {
        const p = m.geometry.attributes.position, col = m.geometry.attributes.color;
        let nearest = Infinity;
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
          dir.copy(v).sub(C).normalize();
          F.copy(v).addScaledVector(dir, 1);
          ray.set(F, dir.clone().negate());
          const fur = ray.intersectObjects([torso, underside], false)[0];
          const cov = cover ? ray.intersectObject(cover, false)[0] : null;
          const over = cov && (!fur || cov.distance < fur.distance) ? cov : null;
          const toSurface = ((over ?? fur)?.distance ?? Infinity) - 1;
          if (!isStrap(col, i)) nearest = Math.min(nearest, toSurface / s);
          if (i % 7) continue;
          const where = `${state} t ${t} v ${speed} vertex ${i}`;
          expect(fur ? (fur.distance - 1) / s : 1, `${where}: outside the fur`).toBeGreaterThanOrEqual(0);
          if (over) expect((over.distance - 1) / s, `${where}: outside the ${body}`).toBeGreaterThanOrEqual(-0.0005);
        }
        expect(nearest, `${state} t ${t} v ${speed}: resting on it`).toBeLessThanOrEqual(0.02);
      }
    }
  }, 120_000);
}
