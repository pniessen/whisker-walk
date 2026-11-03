import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { buildBackItem, backAnchor, placeOnBack, BACK_ITEM_IDS, STRAP_GREY } from '../src/cat/backitems.js';
import { TORSO } from '../src/cat/torso.js';

// Accessories polish, Task 2 (2026-11-03): the owner said "the back
// accessories (wings, jetpack, tiny backpack) look like silly boxes". They are
// now a soft rucksack, a twin-tank rocket pack and layered butterfly wings,
// built ON the torso and hung on the body (src/cat/backitems.js), so they ride
// every pose and rest on whatever is outermost on the back: the fur, a coat
// shell or the cape's cloth.
//
// Every measure is in the cat's own frame (world / cat.scale.x).

const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
const kitCat = (breed, back, body = null, simple = false) => buildCat(breed, { ...BARE, back, body }, { simple });
const itemsOf = (cat) => {
  const out = [];
  cat.traverse((o) => { if (o.isMesh && o.userData.backItem) out.push(o); });
  return out;
};
const tris = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
const meshTris = (objs) => { let n = 0; for (const o of objs) o.traverse((m) => { if (m.isMesh) n += tris(m); }); return n; };
// strap vertices (found by their colour): they lie on the cover by design, so
// "resting on it" is measured over the item itself
const STRAP = new THREE.Color(STRAP_GREY);
const isStrap = (col, i) => Math.abs(col.getX(i) - STRAP.r) + Math.abs(col.getY(i) - STRAP.g) + Math.abs(col.getZ(i) - STRAP.b) < 1e-4;

describe('back items are shaped things on the back (accessories polish Task 2)', () => {
  it.each(BACK_ITEM_IDS)('%s hangs on the body', (id) => {
    const cat = kitCat('tabby', id);
    const items = itemsOf(cat);
    expect(items.length).toBeGreaterThan(0);
    for (const m of items) {
      // on the body; a wing under its pivot (scale 1 / bodyScale) on the body
      if (id === 'wings') {
        expect(m.parent.userData.wingPivot).toBe(true);
        expect(m.parent.parent).toBe(cat.userData.parts.body);
      } else expect(m.parent).toBe(cat.userData.parts.body);
      expect(m.userData.backItem).toBe(id);
      expect(m.material.vertexColors).toBe(true);
    }
    for (const c of cat.children) expect(c.userData.backItem).toBeUndefined();
    cat.traverse((o) => expect(o.userData.ridesBody).toBeUndefined());
  });

  it('mesh counts: backpack 1, jetpack 1, wings 2', () => {
    expect(itemsOf(kitCat('tabby', 'backpack'))).toHaveLength(1);
    expect(itemsOf(kitCat('tabby', 'jetpack'))).toHaveLength(1);
    const wings = itemsOf(kitCat('tabby', 'wings'));
    expect(wings).toHaveLength(2);
    expect(wings.map((w) => w.userData.wing).sort()).toEqual([-1, 1]);
    for (const w of wings) {
      expect(w.material.side).toBe(THREE.DoubleSide);
      expect(w.userData.hinge.point).toHaveLength(3);
      expect(Math.hypot(...w.userData.hinge.dir)).toBeCloseTo(1, 9);
    }
  });

  it('triangle budget: backpack <= 1200, jetpack <= 1400, wings <= 900 (simple half or less)', () => {
    const BUDGET = { backpack: 1200, jetpack: 1400, wings: 900 };
    for (const id of BACK_ITEM_IDS) {
      for (const cover of ['fur', 'shell', 'cape']) {
        const full = meshTris(buildBackItem(id, { bodyScale: TORSO.SCALE, cover }));
        const simple = meshTris(buildBackItem(id, { bodyScale: TORSO.SCALE, cover, simple: true }));
        expect(full, `${id} ${cover}`).toBeLessThanOrEqual(BUDGET[id]);
        expect(simple, `${id} ${cover} simple`).toBeLessThanOrEqual(BUDGET[id] / 2);
        expect(simple, `${id} ${cover} simple vs full`).toBeLessThanOrEqual(full / 2 + 1);
      }
    }
  });

  it('backAnchor: on the surface, its normal out of it, fwd toward the head; placeOnBack counter-scales', () => {
    const S = TORSO.SCALE;
    const fur = backAnchor([0, 1, 0], { bodyScale: S, cover: 'fur' });
    const shell = backAnchor([0, 1, 0], { bodyScale: S, cover: 'shell' });
    const cape = backAnchor([0, 1, 0], { bodyScale: S, cover: 'cape' });
    expect(fur.n.y).toBeGreaterThan(0.9);
    expect(fur.fwd.z).toBeLessThan(-0.9);
    expect(Math.abs(fur.n.dot(fur.fwd))).toBeLessThan(1e-9);
    expect(shell.at.y).toBeGreaterThan(fur.at.y);
    expect(cape.at.y).toBeGreaterThan(shell.at.y);
    const lifted = backAnchor([0, 1, 0], { bodyScale: S, cover: 'fur' }, 0.01);
    expect(lifted.at.distanceTo(fur.at)).toBeCloseTo(0.01, 9);
    // a point 1 cm out along y in the item frame lands 1 cm out along n, / bodyScale
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.01, 0]), 3));
    placeOnBack(geo, fur, S);
    const p = new THREE.Vector3().fromBufferAttribute(geo.attributes.position, 0).multiply(new THREE.Vector3(...S));
    expect(p.distanceTo(fur.at.clone().addScaledVector(fur.n, 0.01))).toBeLessThan(1e-6);
  });

  // Out of the cover and resting on it, in every pose: rays from the item's
  // vertices toward the torso's centre meet the cover (cape or shell, when one
  // is worn) before the fur, and the vertex is outside both; its nearest
  // vertex is within 2 cm of the cover (no floating cube in the stalk).
  const BREEDS = ['tabby', 'digit', 'persian', 'mainecoon', 'd2'];
  const COVERS = [null, 'cape', 'hoodie', 'sweater'];
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
  const CASES = [
    ...BREEDS.flatMap((b) => BACK_ITEM_IDS.flatMap((id) => COVERS.map((c) => [b, id, c, false]))),
    ...['tabby', 'digit'].flatMap((b) => BACK_ITEM_IDS.flatMap((id) => COVERS.map((c) => [b, id, c, true]))),
  ];
  it.each(CASES)('%s %s over %s (simple %s): out of the cover, touching it, in every pose', (breed, id, body, simple) => {
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

  it.each(BREEDS)('%s: the wings stand above the back', (breed) => {
    for (const body of COVERS) {
      const cat = kitCat(breed, 'wings', body);
      animateCat(cat, 'follow', 1.3, 0, false);
      cat.updateMatrixWorld(true);
      const torso = cat.userData.parts.body, s = cat.scale.x;
      const top = new THREE.Box3().setFromBufferAttribute(torso.geometry.attributes.position).applyMatrix4(torso.matrixWorld).max.y;
      for (const w of itemsOf(cat)) {
        const b = new THREE.Box3().setFromObject(w);
        expect((b.max.y - top) / s, `${body} wing ${w.userData.wing}`).toBeGreaterThanOrEqual(0.12);
      }
    }
  });

  it('flutter: rest exactly at sin 0, moves otherwise, still under reducedMotion', () => {
    const built = kitCat('tabby', 'wings');
    const rest = itemsOf(built).map((w) => [w.position.toArray(), w.quaternion.toArray()]);
    const cat = kitCat('tabby', 'wings');
    const now = () => itemsOf(cat).map((w) => [w.position.toArray(), w.quaternion.toArray()]);
    animateCat(cat, 'follow', 0, 0, false);
    expect(now()).toEqual(rest);
    animateCat(cat, 'follow', 0.5, 0, false);
    const moved = itemsOf(cat);
    moved.forEach((w, k) => expect(w.quaternion.angleTo(new THREE.Quaternion(...rest[k][1]))).toBeGreaterThan(0.1));
    // the two sides mirror each other: their hinge turns have opposite signs
    const [a, b] = moved;
    expect(Math.sign(a.quaternion.x * a.userData.hinge.dir[0] + a.quaternion.y * a.userData.hinge.dir[1] + a.quaternion.z * a.userData.hinge.dir[2]))
      .toBe(-Math.sign(b.quaternion.x * b.userData.hinge.dir[0] + b.quaternion.y * b.userData.hinge.dir[1] + b.quaternion.z * b.userData.hinge.dir[2]));
    // the hinge point stays put
    for (const w of moved) {
      const h = new THREE.Vector3(...w.userData.hinge.point);
      const before = h.clone();   // a point on the hinge, in the wing's own frame at rest = the pivot's
      expect(h.applyQuaternion(w.quaternion).add(w.position).distanceTo(before)).toBeLessThan(1e-9);
    }
    animateCat(cat, 'follow', 0.5, 0, true);
    expect(now()).toEqual(rest);
    animateCat(cat, 'nap', 2.1, 0, true);
    expect(now()).toEqual(rest);
  });

  // The flutter and the sit's stand are true rotations: each wing hangs under a
  // pivot that undoes the body's scale, so its world-space edges keep their
  // built lengths (× the cat's scale) in the sit and mid-flutter (within 1%;
  // follow at t 1.745 has the breathing at ~0 and the flutter near its peak).
  it.each(['tabby', 'digit', 'mainecoon'])('%s: the wings keep their shape in the sit and mid-flutter', (breed) => {
    for (const [state, t] of [['requestPet', 1.3], ['perch', 0.5], ['follow', Math.PI / 1.8]]) {
      const cat = kitCat(breed, 'wings', 'cape');
      animateCat(cat, state, t, 0, false);
      cat.updateMatrixWorld(true);
      const s = cat.scale.x;
      for (const w of itemsOf(cat)) {
        const p = w.geometry.attributes.position, ix = w.geometry.index.array;
        const a = new THREE.Vector3(), b = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
        let worst = 0;
        for (let k = 0; k < ix.length; k += 3) {
          a.fromBufferAttribute(p, ix[k]); b.fromBufferAttribute(p, ix[k + 1]);
          const built = a.distanceTo(b);
          if (built < 1e-4) continue;
          A.copy(a).applyMatrix4(w.matrixWorld); B.copy(b).applyMatrix4(w.matrixWorld);
          worst = Math.max(worst, Math.abs(A.distanceTo(B) / s / built - 1));
        }
        expect(worst, `${state} t ${t} wing ${w.userData.wing}`).toBeLessThanOrEqual(0.01);
      }
    }
  });

  it('disposing one cat leaves another intact (no geometry shared)', () => {
    for (const id of BACK_ITEM_IDS) {
      const a = kitCat('tabby', id, 'cape'), b = kitCat('tabby', id, 'cape');
      const geosOf = (cat) => { const s = new Set(); cat.traverse((o) => { if (o.isMesh) s.add(o.geometry); }); return s; };
      const ga = geosOf(a);
      for (const g of geosOf(b)) expect(ga.has(g), id).toBe(false);
      let disposed = 0;
      for (const m of itemsOf(b)) m.geometry.addEventListener('dispose', () => disposed++);
      a.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      expect(disposed, id).toBe(0);
      for (const m of itemsOf(b)) expect(m.geometry.attributes.position.count).toBeGreaterThan(0);
    }
  });
});
