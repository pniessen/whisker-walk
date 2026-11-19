import { describe, it, expect, afterAll } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { useBVH, firstHitRaycaster } from './helpers/bvh.js';
import { BREEDS, CAPES, BARE, meshVerts, capeOf, capePieces, EYES } from './helpers/cape.js';
import { BACK_ITEM_IDS } from '../src/cat/backitems.js';

// The pose sweeps raycast through a BVH (test/helpers/bvh.js). Here the BVH's
// answers are held against three's own brute-force raycast on the sweeps' own
// rays: two cats built and posed alike, one left as built (three's
// Mesh.raycast) and one through useBVH, cast at with the same rays. Every
// nearest hit agrees within 1e-6 (or both miss), and so does every hit of the
// full list. A small sample here; WW_BVH_FULL=1 runs every cat (all breeds,
// full and simple), both capes and every back item in more poses, the
// one-off check behind the switch (2026-11-19: see the commit).
//
// The rays are the ones the sweeps cast: from a point of one mesh (cloth,
// tail, item, balloon) at another (fur, cape, cover, legs, head). A ray cast
// at the very mesh whose vertex it passes through can be missed by the BVH
// (its boxes are rounded to float32, so a vertex on a box's face can fall a
// hair outside); no sweep casts such a ray.

const FULL = !!process.env.WW_BVH_FULL;
const TOL = 1e-6;
const POSES = FULL
  ? [['follow', 0.4, 0], ['follow', 1.3, 1.5], ['stalk', 2.2, 1.5], ['nap', 1.3, 0], ['requestPet', 1.3, 0], ['perch', 2.2, 0], ['pounce', 0.4, 0], ['cross', 1.3, 0], ['roll', 1.3, 0], ['swim', 2.2, 0]]
  : [['follow', 1.3, 1.5], ['requestPet', 1.3, 0], ['nap', 0.4, 0]];
const CATS = FULL ? BREEDS.flatMap((b) => [false, true].map((simple) => [b, simple])) : [['tabby', false], ['digit', true]];
const BACKS = FULL ? BACK_ITEM_IDS.flatMap((id) => [null, 'cape', 'sweater'].map((body) => [id, body])) : [['backpack', 'cape'], ['wings', null]];
const STEP = FULL ? 1 : 5;   // every vertex in the full run, every fifth here

// Casts one ray at the brute-force cat and at the BVH cat; returns the worst
// distance mismatch (Infinity: one hit and the other missed, or the lists of
// hits differ). The nearest hit (all the sweeps read) is compared as it is;
// in the full lists, hits on one mesh within 1e-9 of each other are one point
// of its surface (a ray through a vertex or an edge meets every triangle
// there, and rounding decides how many of them say so, in either raycast).
const brute = new THREE.Raycaster(), fast = new THREE.Raycaster(), first = firstHitRaycaster();
const points = (hits) => hits.filter((h, i) => !hits.slice(0, i).some((e) => e.object === h.object && Math.abs(e.distance - h.distance) <= 1e-9));
function mismatch(a, b, recursive, origin, dir, far = Infinity) {
  for (const r of [brute, fast, first]) { r.set(origin, dir); r.far = far; }
  const A = brute.intersectObjects(a, recursive), F = first.intersectObjects(b, recursive);
  if ((A.length > 0) !== (F.length > 0)) return Infinity;
  let worst = A.length ? Math.abs(A[0].distance - F[0].distance) : 0;
  const PA = points(A), PB = points(fast.intersectObjects(b, recursive));
  if (PA.length !== PB.length) return Infinity;
  for (let i = 0; i < PA.length; i++) worst = Math.max(worst, Math.abs(PA[i].distance - PB[i].distance));
  return worst;
}

// The same pose on both cats, posed one after another as the sweeps pose
// theirs (so the BVH follows each pose's rewritten points); the vertices
// are read from the brute-force one.
const pose = (cats, state, t, speed) => { for (const cat of cats) { animateCat(cat, state, t, speed, false); cat.updateMatrixWorld(true); } };
// The cover a back item rests on (as backitems.js coverOf finds it): the
// cape, or the biggest other piece on the body (a coat's shell).
const coverOf = (cat) => {
  const kids = cat.userData.parts.body.children.filter((c) => c.isMesh && !c.userData.backItem && c !== cat.userData.parts.underside);
  return kids.find((c) => c.userData.cape) ?? kids.sort((x, y) => y.geometry.attributes.position.count - x.geometry.attributes.position.count)[0];
};
const every = (list) => list.filter((_, i) => i % STEP === 0);
function check(a, b, points, label) {
  const s = a.scale.x, pa = a.userData.parts, pb = b.userData.parts;
  const C = pa.body.getWorldPosition(new THREE.Vector3());
  let rays = 0, worst = 0;
  const cast = (...args) => { rays++; worst = Math.max(worst, mismatch(...args)); };
  for (const [kind, P] of points) {
    const Pw = P.clone().multiplyScalar(s), dir = Pw.clone().sub(C).normalize(), F = Pw.clone().addScaledVector(dir, 1), back = dir.clone().negate();
    // inward from 1 m out (cape.js outside / outsideFur, backitems.js, the sit-upright files)
    cast([pa.body], [pb.body], false, F, back);
    cast([pa.body, pa.underside], [pb.body, pb.underside], false, F, back);
    // inward at the cover (backitems.js coverSweep: the cape, or a coat's shell)
    const ca = capeOf(a), cb = capeOf(b);
    if (kind === 'item' && coverOf(a)) cast([coverOf(a)], [coverOf(b)], false, F, back);
    if (kind === 'tail' && ca) {
      // outward from the centre, stopping at the vertex (cape.js tailSweep)
      cast([ca], [cb], false, C, dir.clone(), Pw.distanceTo(C));
      // from behind, stopping just short of it (cape.js sitSweep)
      for (const at of Object.values(EYES)) {
        const E = new THREE.Vector3().fromArray(at).multiplyScalar(s), d = Pw.clone().sub(E), far = d.length() - 1e-4;
        d.normalize();
        cast([pa.body, pa.underside], [pb.body, pb.underside], false, E, d, far);
        cast(pa.legs, pb.legs, true, E, d, far);
        cast(capePieces(a), capePieces(b), false, E, d, far);
      }
    }
    // the whole torso, its children too, and the head (catballoon.test.js inside)
    if (kind === 'balloon') {
      cast([pa.body], [pb.body], true, F, back);
      cast([pa.head], [pb.head], true, F, back);
    }
  }
  expect(rays, `${label}: rays cast`).toBeGreaterThan(0);
  expect(worst, `${label}: worst mismatch over ${rays} rays`).toBeLessThanOrEqual(TOL);
  return { rays, worst };
}

const totals = { rays: 0, worst: 0 };
const add = ({ rays, worst }) => { totals.rays += rays; totals.worst = Math.max(totals.worst, worst); };

describe('the BVH raycast agrees with three\'s own (test/helpers/bvh.js)', () => {
  it.each(CATS.flatMap(([b, simple]) => CAPES.map((id) => [b, id, simple])))('%s %s (simple %s): cape and tail rays', (b, id, simple) => {
    const build = () => buildCat(b, { ...BARE, body: id }, { simple });
    const a = build(), bv = useBVH(build());
    for (const [state, t, speed] of POSES) {
      pose([a, bv], state, t, speed);
      const s = a.scale.x;
      const points = [...every(meshVerts(capeOf(a), s)).map((P) => ['cape', P]), ...every(meshVerts(a.userData.parts.tail, s)).map((P) => ['tail', P])];
      add(check(a, bv, points, `${state} t ${t} speed ${speed}`));
    }
  }, FULL ? 600_000 : 30_000);

  it.each(CATS.flatMap(([b, simple]) => BACKS.map(([id, body]) => [b, id, body, simple])))('%s %s over %s (simple %s): back item rays', (b, id, body, simple) => {
    const build = () => buildCat(b, { ...BARE, back: id, body }, { simple });
    const a = build(), bv = useBVH(build());
    for (const [state, t, speed] of POSES) {
      pose([a, bv], state, t, speed);
      const s = a.scale.x, items = [];
      a.traverse((o) => { if (o.isMesh && o.userData.backItem) items.push(o); });
      const points = items.flatMap((m) => every(meshVerts(m, s)).map((P) => ['item', P]));
      add(check(a, bv, points, `${state} t ${t} speed ${speed}`));
    }
  }, FULL ? 600_000 : 30_000);

  it.each(CATS.flatMap(([b, simple]) => (FULL ? ['balloon', 'balloonbunch', 'tailballoon'] : ['balloon']).map((id) => [b, id, simple])))('%s %s (simple %s): balloon rays', (b, id, simple) => {
    const build = () => buildCat(b, { ...BARE, back: id }, { simple });
    const a = build(), bv = useBVH(build());
    for (const [state, t, speed] of POSES) {
      pose([a, bv], state, t, speed);
      const s = a.scale.x;
      const points = a.children.filter((c) => c.userData.float).flatMap((m) => every(meshVerts(m, s)).map((P) => ['balloon', P]));
      add(check(a, bv, points, `${state} t ${t} speed ${speed}`));
    }
  }, FULL ? 600_000 : 30_000);

  afterAll(() => {
    if (FULL) console.log(`BVH vs brute force: ${totals.rays} rays, worst distance mismatch ${totals.worst.toExponential(2)}`);
  });
});
