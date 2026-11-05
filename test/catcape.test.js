import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat, CAPE_TIE } from '../src/cat/model.js';
import { SKULL, HEAD } from '../src/cat/torso.js';
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

// The same against the whole fur: the torso and the underside (the chest,
// which counter-yaws under the turned torso in the cross and drops in the sit).
const outsideFur = (cat, P) => {
  const { body, underside } = cat.userData.parts, s = cat.scale.x;
  const C = body.getWorldPosition(new THREE.Vector3());
  const Pw = P.clone().multiplyScalar(s);
  const dir = Pw.clone().sub(C).normalize(), F = Pw.clone().addScaledVector(dir, 1);
  ray.set(F, dir.clone().negate());
  const hit = ray.intersectObjects([body, underside], false)[0];
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

  // Owner, 2026-11-04: a cape fastens at the THROAT. Its two front edges run
  // from the shoulders to the front of the neck, under the chin, where ONE
  // gold clasp pins them (it was a brooch on the front of each shoulder). The
  // clasp and both front bands are one vertex-coloured mesh on the body
  // (userData.capeClasp), re-laid every frame (cape.js layCapeTie) so the
  // clasp rides the neck as the collar's charm does. userData.tie holds the
  // vertex ranges ({ clasp: [start, count] | null, bands: [[start, count] ×2],
  // rows }) and userData.at the clasp's centre, body-local.
  const tieOf = claspOf;
  const atOf = (cat) => cat.userData.parts.body.localToWorld(new THREE.Vector3(...tieOf(cat).userData.at)).divideScalar(cat.scale.x);
  const rangeVerts = (cat, [start, count]) => verts(tieOf(cat), cat.scale.x).slice(start, start + count);
  // How far a cat-frame point lies outside the skull (an ellipsoid, torso.js
  // SKULL, on the head), in units of the skull's size: > 1 outside.
  const skullOut = (cat, P) => {
    const { head } = cat.userData.parts;
    const L = head.worldToLocal(P.clone().multiplyScalar(cat.scale.x));
    return Math.hypot(L.x / (SKULL.R * SKULL.SCALE[0]), L.y / (SKULL.R * SKULL.SCALE[1]), L.z / (SKULL.R * SKULL.SCALE[2]));
  };
  it.each(CASES)('%s %s (simple %s): one gold clasp at the throat, the front edges running to it from the shoulders', (b, id, simple) => {
    const cat = kitCat(b, id, simple);
    animateCat(cat, 'follow', 1.3, 0, false);
    cat.updateMatrixWorld(true);
    const s = cat.scale.x, { body, head, underside } = cat.userData.parts;
    const tie = tieOf(cat), bc = world(body, s), hc = world(head, s);
    const chest = underside.localToWorld(new THREE.Vector3(...underside.userData.chestCentre)).divideScalar(s);
    // Digit wears her own tag collar: her cape is pinned under its tag (below)
    expect(!!tie.userData.tie.clasp, 'a clasp').toBe(b !== 'digit');
    const c = atOf(cat);
    expect(Math.abs(c.x), 'on the midline').toBeLessThanOrEqual(0.01);
    expect(c.z, 'in front of the chest').toBeLessThan(chest.z - 0.1);
    expect(c.y, 'under the chin').toBeLessThan(hc.y - 0.15);
    expect(c.y, 'up at the neck, not down the chest').toBeGreaterThan(bc.y);
    expect(c.distanceTo(hc), 'at the throat, near the head').toBeLessThanOrEqual(0.3);
    // a gold disc, round (not squashed by the torso's scale): every gold
    // vertex within r of its centre, its rim at r, none nearer than its
    // flattened face; the ruby in its face
    if (tie.userData.tie.clasp) {
      const col = tie.geometry.attributes.color, ruby = new THREE.Color(CAPE_TIE.ruby);
      const [start, count] = tie.userData.tie.clasp;
      const all = rangeVerts(cat, tie.userData.tie.clasp);
      const isRuby = (i) => Math.abs(col.getX(start + i) - ruby.r) + Math.abs(col.getY(start + i) - ruby.g) + Math.abs(col.getZ(start + i) - ruby.b) < 1e-4;
      const reach = all.filter((P, i) => !isRuby(i)).map((P) => P.distanceTo(c));
      expect(reach.length, 'gold').toBeGreaterThan(0);
      expect(reach.length, 'a ruby').toBeLessThan(count);
      // (r is in the head's frame, as every neck piece is: × HEAD.SCALE on the cat)
      const r = CAPE_TIE.r * HEAD.SCALE;
      expect(Math.max(...reach)).toBeCloseTo(r, 3);
      expect(Math.min(...reach)).toBeGreaterThanOrEqual(r * CAPE_TIE.flat - 1e-3);
    }
    // the bands: one each side, from the cloth at the shoulder to the clasp
    const cloth = verts(capeOf(cat), s);
    const { bands, rows } = tie.userData.tie;
    expect(bands).toHaveLength(2);
    const sides = bands.map((r) => {
      const V = rangeVerts(cat, r);
      const start = V[0].clone().add(V[1]).multiplyScalar(0.5), end = V[2 * rows - 2].clone().add(V[2 * rows - 1]).multiplyScalar(0.5);
      expect(Math.min(...cloth.map((P) => P.distanceTo(start))), 'starts on the cloth').toBeLessThanOrEqual(0.03);
      expect(end.distanceTo(c), 'ends at the clasp').toBeLessThanOrEqual(CAPE_TIE.r * HEAD.SCALE + 0.005);
      expect(start.y, 'from the shoulder').toBeGreaterThan(bc.y - 0.02);
      return Math.sign(start.x);
    });
    expect(sides[0] * sides[1], 'one each side').toBe(-1);
  });

  // In every pose (all the cat's states, walking too), every vertex of the
  // clasp and the bands is out of the fur (body and underside, along the ray
  // from the body centre), out of the skull, and off the ground.
  const ALL_STATES = [...STATES, 'arch', 'swipe', 'roll', 'pinning', 'pinned', 'flinch', 'rearUp', 'backUp', 'swim', 'wade', 'shake'];
  const TIE_SWEEP = ALL_STATES.flatMap((st) => [0.4, 1.3, 2.2].flatMap((t) => [[st, t, 0], ...(WALKING.includes(st) ? [[st, t, 1.5]] : [])]));
  it.each(CASES)('%s %s (simple %s): in every pose the clasp and the front edges stay out of the chest and the head', (b, id, simple) => {
    const cat = kitCat(b, id, simple);
    for (const [state, t, speed] of TIE_SWEEP) {
      animateCat(cat, state, t, speed, false);
      cat.updateMatrixWorld(true);
      const s = cat.scale.x, label = `${state} t ${t} speed ${speed}`;
      let fur = Infinity, skull = Infinity, low = Infinity;
      for (const P of verts(tieOf(cat), s)) {
        fur = Math.min(fur, outsideFur(cat, P));
        skull = Math.min(skull, skullOut(cat, P));
        low = Math.min(low, P.y);
      }
      expect(fur, `${label}: out of the fur`).toBeGreaterThanOrEqual(0.002);
      expect(skull, `${label}: out of the head`).toBeGreaterThanOrEqual(1);
      expect(low, `${label}: off the ground`).toBeGreaterThanOrEqual(0);
      // and the clasp still at the throat: under the head's centre, near it
      const c = atOf(cat), hc = world(cat.userData.parts.head, s);
      expect(c.distanceTo(hc), `${label}: clasp near the head`).toBeLessThanOrEqual(0.32);
    }
  }, 180_000);

  // The clasp rides the neck as the collar does: with a plain ring on (the
  // studded collar keeps the clasp), in every pose the clasp's centre is
  // within 5 cm of where the collar would hang a charm (the throat spot,
  // carried on the collar); it differs only where the clasp is pushed out
  // of the chest (the sniff, the swim: 4-5 cm).
  it.each(['tabby', 'mainecoon', 'digit'])('%s: the clasp stays with the collar at the throat in every pose', (b) => {
    const cat = buildCat(b, { ...BARE, body: 'cape', collar: 'studded' });
    const collar = cat.userData.parts.head.userData.collar, tie = tieOf(cat);
    expect(tie.userData.tie.clasp).toBeTruthy();
    const local = new THREE.Vector3(...tie.userData.tie.throat).sub(collar.position);   // the collar sits unturned on the head as built
    for (const [state, t, speed] of TIE_SWEEP) {
      animateCat(cat, state, t, speed, false);
      cat.updateMatrixWorld(true);
      const want = collar.localToWorld(local.clone()).divideScalar(cat.scale.x);
      expect(atOf(cat).distanceTo(want), `${state} t ${t} speed ${speed}`).toBeLessThanOrEqual(0.05);
    }
  }, 120_000);

  // With the throat already taken (a collar's charm: bell, heart, tag,
  // sparkle star; or any neck-slot item) the gold clasp is left off and the
  // front edges meet under that piece; a plain ring (studded, glow) keeps it.
  const THROAT = [['collar', 'bell', false], ['collar', 'heart', false], ['collar', 'tag', false], ['collar', 'sparklecollar', false],
    ['collar', 'studded', true], ['collar', 'glow', true],
    ...['bandana', 'necktie', 'bowtie', 'scarf', 'streamerscarf'].map((n) => ['neck', n, false])];
  it.each(THROAT)('%s %s: the clasp shows %s', (slot, item, shows) => {
    for (const b of ['tabby', 'mainecoon']) {
      const cat = buildCat(b, { ...BARE, body: 'cape', [slot]: item });
      const tie = tieOf(cat);
      expect(!!tie.userData.tie.clasp, b).toBe(shows);
      expect(tie.userData.tie.bands).toHaveLength(2);
    }
  });
  it('Digit wears her own tag: her cape is pinned under it', () => {
    expect(tieOf(kitCat('digit', 'cape', false)).userData.tie.clasp).toBeNull();
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
      // a tail vertex near the fur with the cape between it and the body
      // centre; in the sit every tail vertex, near the fur or not (the curl
      // lies more than 2 cm out, beside the haunch; the sit's own checks
      // below look from the camera)
      const sit = state === 'requestPet' || state === 'perch';
      let covered = 0;
      for (const P of meshVerts(tail, s)) {
        if (!sit && outside(cat, P) > 0.02) continue;
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

  // The sit (polish-pose fix wave). The upright sit curls the tail forward
  // round the left haunch, on the ground beside it, well over 2 cm out of the
  // fur, so the check above did not see the standing hem lying over it (192
  // of 464 seen tabby tail vertices from behind and above, the cloth within
  // 0.1 mm of link 2). In the sit the cape wears its sit cloth (model.js
  // CAPE_SIT). Seen from the walk camera's distance and height behind the
  // cat and behind-left (the side the tail curls to), of the tail vertices
  // that the body, chest and legs do not hide, at most 3% may be behind a
  // cape piece; and no tail vertex comes within 1 cm of the cloth.
  const SITS = ['requestPet', 'perch'].flatMap((st) => [0, 0.5, 1, 1.5, 2, 2.5, 3].map((t) => [st, t]));
  const EYES = { behind: [0, 1.3, 2.0], behindLeft: [-0.8, 1.3, 2.0] };
  const capePieces = (cat) => cat.userData.parts.body.children.filter((c) => c.userData.cape || c.userData.capeClasp || c.userData.capeDots);
  it.each(CASES)('%s %s (simple %s): sitting, the whole tail curl shows from behind', (b, id, simple) => {
    const cat = kitCat(b, id, simple);
    const cast = new THREE.Raycaster(), d = new THREE.Vector3(), E = new THREE.Vector3();
    for (const [state, t] of SITS) {
      animateCat(cat, state, t, 0, false);
      cat.updateMatrixWorld(true);
      const s = cat.scale.x, { body, underside, legs, tail } = cat.userData.parts;
      const fur = [body, underside], cloth = capePieces(cat);
      for (const [eye, at] of Object.entries(EYES)) {
        E.fromArray(at).multiplyScalar(s);
        let seen = 0, under = 0;
        for (const P of meshVerts(tail, s)) {
          const Pw = P.multiplyScalar(s), far = d.subVectors(Pw, E).length();
          cast.set(E, d.normalize());
          cast.far = far - 1e-4;
          if (cast.intersectObjects(fur, false).length || cast.intersectObjects(legs, true).length) continue;
          seen++;
          if (cast.intersectObjects(cloth, false).length) under++;
        }
        expect(seen, `${state} t ${t} ${eye}: tail seen`).toBeGreaterThan(0);
        expect(under / seen, `${state} t ${t} ${eye}: ${under}/${seen} under the cape`).toBeLessThanOrEqual(0.03);
      }
    }
  }, 180_000);

  it.each(CASES)('%s %s (simple %s): sitting, the cloth never comes within 1 cm of the tail', (b, id, simple) => {
    const cat = kitCat(b, id, simple);
    const tri = new THREE.Triangle(), q = new THREE.Vector3();
    for (const [state, t] of SITS) {
      animateCat(cat, state, t, 0, false);
      cat.updateMatrixWorld(true);
      const s = cat.scale.x, tv = meshVerts(cat.userData.parts.tail, s);
      let near = Infinity;
      for (const m of capePieces(cat)) {
        const cv = verts(m, s), ix = m.geometry.index.array;
        for (let f = 0; f < ix.length; f += 3) {
          const A = cv[ix[f]], B = cv[ix[f + 1]], C = cv[ix[f + 2]];
          tri.set(A, B, C);
          // a quick bound first: no face edge is longer than 0.3 here
          for (const P of tv) {
            if (P.distanceTo(A) - 0.3 > near) continue;
            tri.closestPointToPoint(P, q);
            near = Math.min(near, q.distanceTo(P));
          }
        }
      }
      expect(near, `${state} t ${t}: the cloth's nearest to the tail`).toBeGreaterThanOrEqual(0.01);
    }
  }, 180_000);

  it.each(CAPES)('%s: the sit cloth is worn only in the sit', (id) => {
    const cat = kitCat('tabby', id, false);
    const cloth = capePieces(cat).filter((m) => m.userData.capeGeo);
    expect(cloth).toHaveLength(id === 'cape' ? 1 : 2);
    for (const state of [...STATES, 'follow']) {
      animateCat(cat, state, 1.3, 0, false);
      const sit = state === 'requestPet' || state === 'perch';
      for (const m of cloth) expect(m.geometry, state).toBe(sit ? m.userData.capeGeo.sit : m.userData.capeGeo.stand);
    }
  });

  // Leaving a pose puts it back: the cape and clasp never move on the body,
  // so after a sit or a nap a follow gives a fresh follow's cloak exactly
  // (the clasp and front bands are re-laid every frame: their vertices too).
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
      expect(Array.from(claspOf(cat).geometry.attributes.position.array), `${state}: the clasp and bands`).toEqual(Array.from(claspOf(fresh).geometry.attributes.position.array));
      for (const m of pieces(cat)) if (m.userData.capeGeo) expect(m.geometry === m.userData.capeGeo.stand, `${state}: the standing cloth back on`).toBe(true);
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
