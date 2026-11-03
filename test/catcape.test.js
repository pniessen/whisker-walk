import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { PRESETS, STATES, meshCount } from './helpers/catfingerprint.js';

// polish-pose Task 2 (2026-11-02): a cape is a cloak. The owner: today's capes
// "look like a dishtowel draped over the tail, they don't cover the back or any
// other part of the body — capes are supposed to attach to the neck/shoulders."
// So a cape is now a cloth shell hung on the torso (model.js capeGeometry,
// ruling P2): fastened by a clasp at the neck, over the shoulders and down the
// back and flanks to a hem round the haunches, the tail coming out from under
// the hem. Hung on the body with no scale of its own, it follows every pose.
//
// Every measure is in the cat's own frame (world / cat.scale.x), so Digit
// (scale 0.82) is judged by her own size.

const BREEDS = PRESETS.filter((b) => b !== 'hagrid');
const CAPES = ['cape', 'confetticape'];
const CASES = BREEDS.flatMap((b) => CAPES.flatMap((id) => [false, true].map((simple) => [b, id, simple])));
const BARE = { collar: null, head: null, face: null, neck: null, feet: null, back: null };
const kitCat = (b, id, simple) => buildCat(b, { ...BARE, body: id }, { simple });
const capeOf = (cat) => cat.userData.parts.body.children.find((c) => c.userData.cape);
const claspOf = (cat) => cat.userData.parts.body.children.find((c) => c.userData.capeClasp);
const v = new THREE.Vector3();
const verts = (m, s) => {
  const out = [], p = m.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).divideScalar(s));
  return out;
};
const meshVerts = (obj, s) => {
  const out = [];
  obj.traverse((m) => { if (m.isMesh) out.push(...verts(m, s)); });
  return out;
};
const world = (o, s) => o.getWorldPosition(new THREE.Vector3()).divideScalar(s);

// How far a cat-frame point lies outside the torso's fur, along the ray from
// the body centre through it (negative: inside).
const ray = new THREE.Raycaster();
const outside = (cat, P) => {
  const { body } = cat.userData.parts, s = cat.scale.x;
  const C = body.getWorldPosition(new THREE.Vector3());
  const Pw = P.clone().multiplyScalar(s);
  const dir = Pw.clone().sub(C).normalize(), F = Pw.clone().addScaledVector(dir, 1);
  ray.set(F, dir.clone().negate());
  const hit = ray.intersectObject(body, false)[0];
  return hit ? (hit.distance - F.distanceTo(Pw)) / s : Infinity;
};

// The sweep: every state at three times, and the walking states at speed 1.5 too.
const WALKING = ['follow', 'stalk'];
const SWEEP = STATES.flatMap((st) => [0.4, 1.3, 2.2].flatMap((t) => [[st, t, 0], ...(WALKING.includes(st) ? [[st, t, 1.5]] : [])]));

describe('a cape is a cloak on the torso (polish-pose Task 2)', () => {
  it.each(CASES)('%s %s (simple %s): built on the body, nothing hung on the group', (b, id, simple) => {
    const cat = kitCat(b, id, simple);
    const cape = capeOf(cat), clasp = claspOf(cat);
    expect(cape, 'the cape on the body').toBeTruthy();
    expect(clasp, 'the clasp on the body').toBeTruthy();
    expect(cape.parent).toBe(cat.userData.parts.body);
    expect(clasp.parent).toBe(cat.userData.parts.body);
    expect(cape.material.side, 'double-sided cloth').toBe(THREE.DoubleSide);
    // nothing on the group carries a cape, and the old hang is gone everywhere
    for (const c of cat.children) {
      if (c === cat.userData.parts.body) continue;
      let carries = false;
      c.traverse((o) => { if (o.userData.cape || o.userData.capeClasp) carries = true; });
      expect(carries).toBe(false);
    }
    cat.traverse((o) => expect(o.userData.hang).toBeUndefined());
  });

  it.each(CASES)('%s %s (simple %s): standing, it covers the back from the neck to the haunch and down the flanks', (b, id, simple) => {
    const cat = kitCat(b, id, simple);
    animateCat(cat, 'follow', 1.3, 0, false);
    cat.updateMatrixWorld(true);
    const s = cat.scale.x, { body, head, legs } = cat.userData.parts;
    const P = verts(capeOf(cat), s);
    const bc = world(body, s), hz = world(head, s).z;
    const minZ = Math.min(...P.map((p) => p.z)), maxZ = Math.max(...P.map((p) => p.z));
    expect(minZ, 'from the neck').toBeLessThanOrEqual(hz + 0.25);
    const hipZ = Math.max(world(legs[2], s).z, world(legs[3], s).z);
    expect(maxZ, 'to the haunch').toBeGreaterThanOrEqual(hipZ);
    const mid = P.filter((p) => Math.abs(p.z - bc.z) < 0.05);
    expect(mid.length).toBeGreaterThan(0);
    expect(Math.min(...mid.map((p) => p.y)), 'down the flanks at mid-length').toBeLessThanOrEqual(bc.y);
    // and over the top: the spine at mid-length is under it
    expect(Math.max(...mid.map((p) => p.y)), 'over the back').toBeGreaterThan(bc.y);
  });

  // The clasp is a gold brooch on the front of each shoulder, where the cloak
  // is fastened (one mesh; userData.at holds each brooch's body-local centre).
  // The owner's "attach to the neck/shoulders": the spine end of the neck
  // edge lies under the head, so a clasp there would never be seen.
  it.each(CASES)('%s %s (simple %s): the clasp fastens it at the shoulders, at the neck edge', (b, id, simple) => {
    const cat = kitCat(b, id, simple);
    animateCat(cat, 'follow', 1.3, 0, false);
    cat.updateMatrixWorld(true);
    const s = cat.scale.x, { body, head } = cat.userData.parts;
    const clasp = claspOf(cat), bc = world(body, s), hc = world(head, s);
    expect(clasp.userData.at).toHaveLength(2);
    const pins = clasp.userData.at.map((p) => body.localToWorld(new THREE.Vector3(...p)).divideScalar(s));
    expect(pins[0].x * pins[1].x, 'one each side').toBeLessThan(0);
    for (const c of pins) {
      expect(c.z, 'in front of the torso centre').toBeLessThan(bc.z - 0.15);
      expect(c.y, 'above the torso centre').toBeGreaterThan(bc.y);
      expect(c.y, 'below the head centre').toBeLessThan(hc.y);
      // a brooch (r 0.032) sits on the cloth: its centre out of the fur, its
      // inner side within 3 cm of it
      const out = outside(cat, c);
      expect(out, 'on the fur').toBeGreaterThanOrEqual(0);
      expect(out - 0.032, 'within 3 cm of it').toBeLessThanOrEqual(0.03);
      // and seen from the front: outside the head's outline there
      expect(Math.hypot(c.x - hc.x, c.y - hc.y), 'clear of the head, from the front').toBeGreaterThan(0.21 * 1.06 * 0.95);
    }
    // round, not squashed by the torso's scale: as built, every vertex of a
    // brooch is r from its centre round its rim and no nearer than its face
    const built = kitCat(b, id, simple);
    built.updateMatrixWorld(true);
    const bb = built.userData.parts.body, bp = claspOf(built), sb = built.scale.x;
    const centres = bp.userData.at.map((p) => bb.localToWorld(new THREE.Vector3(...p)));
    const reach = [0, 1].map(() => [Infinity, 0]);
    for (const P of verts(bp, 1)) {
      const k = P.distanceTo(centres[0]) < P.distanceTo(centres[1]) ? 0 : 1, d = P.distanceTo(centres[k]) / sb;
      reach[k][0] = Math.min(reach[k][0], d); reach[k][1] = Math.max(reach[k][1], d);
    }
    for (const [lo, hi] of reach) {
      expect(hi).toBeCloseTo(0.032, 4);
      expect(lo).toBeGreaterThanOrEqual(0.032 * 0.7 - 1e-4);
    }
  });

  it.each(CASES)('%s %s (simple %s): in every state it stays out of the fur and the ground', (b, id, simple) => {
    const cat = kitCat(b, id, simple);
    const cape = capeOf(cat);
    for (const [state, t, speed] of SWEEP) {
      animateCat(cat, state, t, speed, false);
      cat.updateMatrixWorld(true);
      const s = cat.scale.x;
      let worst = Infinity, low = Infinity;
      for (const P of verts(cape, s)) {
        worst = Math.min(worst, outside(cat, P));
        low = Math.min(low, P.y);
      }
      const label = `${state} t ${t} speed ${speed}`;
      expect(worst, `${label}: out of the fur`).toBeGreaterThanOrEqual(0.002);
      expect(low, `${label}: out of the ground`).toBeGreaterThanOrEqual(-0.005);
    }
  }, 180_000);

  it.each(CASES)('%s %s (simple %s): in every state the tail is never covered', (b, id, simple) => {
    const cat = kitCat(b, id, simple);
    const cape = capeOf(cat);
    const cast = new THREE.Raycaster();
    for (const [state, t, speed] of SWEEP) {
      animateCat(cat, state, t, speed, false);
      cat.updateMatrixWorld(true);
      const s = cat.scale.x, { body, tail } = cat.userData.parts;
      const C = body.getWorldPosition(new THREE.Vector3());
      const label = `${state} t ${t} speed ${speed}`;
      // a tail vertex near the fur with the cape between it and the body centre
      let covered = 0;
      for (const P of meshVerts(tail, s)) {
        if (outside(cat, P) > 0.02) continue;
        const Pw = P.clone().multiplyScalar(s), d = Pw.distanceTo(C);
        cast.set(C, Pw.clone().sub(C).normalize());
        cast.far = d;
        if (cast.intersectObject(cape, false).length) covered++;
      }
      expect(covered, `${label}: tail vertices under the cape`).toBe(0);
      // and the root comes out behind the hem
      const root = world(tail, s);
      let near = Infinity;
      for (const P of verts(cape, s)) near = Math.min(near, P.distanceTo(root));
      expect(near, `${label}: the tail root clear of the cape`).toBeGreaterThanOrEqual(0.04);
    }
  }, 180_000);

  // Leaving a pose puts it back: the cape and clasp never move on the body,
  // so after a sit or a nap a follow gives a fresh follow's cloak exactly.
  it.each(BREEDS.flatMap((b) => [false, true].map((simple) => [b, simple])))('%s (simple %s): sit → follow and nap → follow give a fresh follow\'s cape', (b, simple) => {
    const fresh = kitCat(b, 'confetticape', simple);
    animateCat(fresh, 'follow', 2.1, 0, false);
    fresh.updateMatrixWorld(true);
    const pieces = (cat) => cat.userData.parts.body.children.filter((c) => c.userData.cape || c.userData.capeClasp || c.userData.capeDots);
    const want = pieces(fresh).map((m) => m.matrixWorld.toArray());
    expect(want).toHaveLength(3);
    for (const state of ['requestPet', 'perch', 'nap']) {
      const cat = kitCat(b, 'confetticape', simple);
      animateCat(cat, state, 1.3, 0, false);
      animateCat(cat, 'follow', 2.1, 0, false);
      cat.updateMatrixWorld(true);
      expect(pieces(cat).map((m) => m.matrixWorld.toArray()), state).toEqual(want);
    }
  });

  it.each(BREEDS.flatMap((b) => [false, true].map((simple) => [b, simple])))('%s (simple %s): one mesh per material, no new shadow casters', (b, simple) => {
    const bare = meshCount(buildCat(b, BARE, { simple }));
    // red cape + gold clasp; purple cape + one merged mesh of every dot + clasp
    expect(meshCount(kitCat(b, 'cape', simple)) - bare).toBe(2);
    expect(meshCount(kitCat(b, 'confetticape', simple)) - bare).toBe(3);
    const casters = (cat) => { let n = 0; cat.traverse((o) => { if (o.isMesh && !o.userData.noCast && (o.userData.cape || o.userData.capeClasp || o.userData.capeDots)) n++; }); return n; };
    expect(casters(kitCat(b, 'cape', simple)), 'was 2').toBeLessThanOrEqual(2);
    expect(casters(kitCat(b, 'confetticape', simple)), 'was 10').toBeLessThanOrEqual(10);
  });

  it.each(CAPES)('%s: the confetti dots are one vertex-coloured mesh on the cape', (id) => {
    const cat = kitCat('tabby', id, false);
    const dots = cat.userData.parts.body.children.filter((c) => c.userData.capeDots);
    if (id === 'cape') { expect(dots).toHaveLength(0); return; }
    expect(dots).toHaveLength(1);
    expect(dots[0].material.vertexColors).toBe(true);
    // every dot lies on the cape: out of the fur, and its centre within 1 cm
    // of the cloth along the ray from the body centre
    animateCat(cat, 'follow', 1.3, 0, false);
    cat.updateMatrixWorld(true);
    const s = cat.scale.x, body = cat.userData.parts.body, C = body.getWorldPosition(new THREE.Vector3());
    for (const P of verts(dots[0], s)) expect(outside(cat, P)).toBeGreaterThan(0);
    const cast = new THREE.Raycaster(), cape = capeOf(cat);
    // each dot's centre: the mean of its own vertices (eight equal spheres, in order)
    const p = dots[0].geometry.attributes.position, per = p.count / 8;
    expect(Number.isInteger(per)).toBe(true);
    for (let d = 0; d < 8; d++) {
      const c = new THREE.Vector3();
      for (let i = d * per; i < (d + 1) * per; i++) c.add(v.fromBufferAttribute(p, i));
      c.divideScalar(per).applyMatrix4(dots[0].matrixWorld);
      cast.set(C, c.clone().sub(C).normalize());
      cast.far = Infinity;
      const hit = cast.intersectObject(cape, false)[0];
      expect(hit, `dot ${d} over the cape`).toBeTruthy();
      expect(Math.abs(hit.distance - c.distanceTo(C)) / s, `dot ${d} on the cloth`).toBeLessThanOrEqual(0.01);
    }
  });

  it('Hagrid wears no cape (his rig shows none)', () => {
    for (const id of CAPES) {
      const hen = buildCat('hagrid', { ...BARE, body: id });
      let n = 0;
      hen.traverse((o) => { if (o.userData.cape || o.userData.capeClasp || o.userData.capeDots) n++; });
      expect(n).toBe(0);
      expect(meshCount(hen)).toBe(meshCount(buildCat('hagrid', BARE)));
    }
  });
});
