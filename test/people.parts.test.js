import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { personFor } from '../src/people/look.js';
import { HAIR_STYLES, neckFrame, dropDegenerate, limbGeo, hairShell } from '../src/people/shapes.js';
import { JOINTS, JOINT_INDEX, JOINT_PARENT, jointRest, personParts } from '../src/people/parts.js';

const HATS = [null, { kind: 'bobble', color: 0xd8503a }, { kind: 'cap', color: 0x8a7a5a }, { kind: 'sunhat', color: 0xe8d8a8 }];
const TOPS = ['tshirt', 'jumper', 'coat', 'dress'];
const BOTTOMS = ['trousers', 'shorts', 'skirt'];
const KINDS = ['child', 'adult', 'older'];
const SEXES = ['m', 'f'];
const DETAILS = ['near', 'far'];

const tris = (parts) => parts.reduce((n, p) => n + p.geo.index.count / 3, 0);
const tagged = (parts, tag) => parts.filter((p) => p.tag === tag);
function* verts(parts) {
  for (const p of parts) {
    const a = p.geo.getAttribute('position');
    for (let i = 0; i < a.count; i++) yield [a.getX(i), a.getY(i), a.getZ(i)];
  }
}
// The highest (or, from the side, outermost) hit of a ray on some parts.
function hit(parts, origin, dir) {
  const rc = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...dir).normalize());
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const hits = rc.intersectObjects(parts.map((p) => new THREE.Mesh(p.geo, mat)), false);
  return hits.length ? hits[0].point : null;
}

describe('people parts', () => {
  it('one joint per vertex', () => {
    expect(JOINTS.length).toBe(20);
    expect(Object.isFrozen(JOINTS)).toBe(true);
    expect(JOINTS.slice(0, 8)).toEqual(['root', 'pelvis', 'chest', 'neck', 'head', 'eyeL', 'eyeR', 'mouth']);
    for (const n of JOINTS) expect(JOINT_INDEX[n]).toBe(JOINTS.indexOf(n));
    for (const n of JOINTS) if (n !== 'root') expect(JOINTS.indexOf(JOINT_PARENT[n])).toBeLessThan(JOINTS.indexOf(n));
    expect(JOINT_PARENT.eyeL).toBe('head'); expect(JOINT_PARENT.eyeR).toBe('head'); expect(JOINT_PARENT.mouth).toBe('head');
    const looks = [];
    for (const kind of KINDS) for (const sex of SEXES) looks.push(personFor({ x: 3, z: 4, kind, sex, glasses: true, hat: HATS[looks.length % 4] }));
    for (const look of looks) {
      for (const detail of DETAILS) {
        for (const p of personParts(look, detail)) {
          expect(JOINTS).toContain(p.joint);
          const g = p.geo;
          expect(g.index).toBeTruthy();
          for (const k of ['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight']) expect(g.getAttribute(k), `${p.tag} ${k}`).toBeTruthy();
          const si = g.getAttribute('skinIndex');
          const sw = g.getAttribute('skinWeight');
          for (let i = 0; i < si.count; i++) {
            expect(si.getX(i)).toBe(JOINT_INDEX[p.joint]);
            expect([si.getY(i), si.getZ(i), si.getW(i)]).toEqual([0, 0, 0]);
            expect([sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)]).toEqual([1, 0, 0, 0]);
          }
          const pos = g.getAttribute('position');
          for (let i = 0; i < pos.count * 3; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
        }
        // the eyes follow their own joints, the smile its own
        const parts = personParts(look, detail);
        for (const p of [...tagged(parts, 'eye'), ...tagged(parts, 'catchlight')]) {
          p.geo.computeBoundingBox();
          expect(p.joint).toBe(p.geo.boundingBox.min.x < 0 && p.geo.boundingBox.max.x < 0.02 ? 'eyeL' : 'eyeR');
        }
        for (const p of tagged(parts, 'mouth')) expect(p.joint).toBe('mouth');
      }
    }
  });

  it('dropDegenerate drops only zero-area triangles', () => {
    // nothing to drop: the geometry is left exactly as it was
    const tube = new THREE.LatheGeometry([new THREE.Vector2(0.1, 0), new THREE.Vector2(0.12, 0.2), new THREE.Vector2(0.1, 0.4)], 7);
    const idx = Array.from(tube.index.array);
    const pos = Array.from(tube.getAttribute('position').array);
    dropDegenerate(tube);
    expect(Array.from(tube.index.array)).toEqual(idx);
    expect(Array.from(tube.getAttribute('position').array)).toEqual(pos);
    // a limb's two tips: one zero-area triangle per side at each end
    const segs = 8;
    const limb = limbGeo(0.4, 0.05, 0.04, { segs, rings: 4, capN: 2 });
    const before = limb.index.count / 3;
    dropDegenerate(limb);
    expect(limb.index.count / 3).toBe(before - 2 * segs);
    // every vertex left is used, and the shape is unchanged (same box)
    for (const g of [limb, hairShell(personFor({ kind: 'adult' }).dims, HAIR_STYLES.bald, 12, 8)]) {
      const used = new Set(g.index.array);
      expect(used.size).toBe(g.getAttribute('position').count);
      const a = g.getAttribute('position');
      const v = [0, 1, 2].map(() => new THREE.Vector3());
      for (let i = 0; i < g.index.count; i += 3) {
        v.forEach((p, k) => p.fromBufferAttribute(a, g.index.getX(i + k)));
        const e = Math.max(v[0].distanceTo(v[1]), v[1].distanceTo(v[2]), v[2].distanceTo(v[0]));
        expect(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).length() / e).toBeGreaterThan(1e-6);
      }
    }
    limb.computeBoundingBox();
    expect(limb.boundingBox.min.y).toBeCloseTo(-0.44, 6);
    expect(limb.boundingBox.max.y).toBeCloseTo(0.05, 6);
  });

  it('joint rest places', () => {
    for (const def of [{ kind: 'adult', sex: 'm', height: 1.8 }, { kind: 'adult', sex: 'f', height: 1.6 }, { kind: 'child', sex: 'f', height: 1.3 }]) {
      const look = personFor({ x: 1, z: 2, ...def });
      const d = look.dims;
      const at = jointRest(d);
      expect(Object.keys(at).sort()).toEqual([...JOINTS].sort());
      for (const n of JOINTS) { expect(at[n].length).toBe(3); for (const v of at[n]) expect(Number.isFinite(v)).toBe(true); }
      const nk = neckFrame(d);
      expect(at.head[1]).toBeCloseTo(nk.topY, 9);
      expect(at.head[2]).toBeCloseTo(nk.topZ, 9);
      const parts = personParts(look, 'near');
      for (const [L, sd] of [['L', -1], ['R', 1]]) {
        const eye = tagged(parts, 'eye').find((p) => p.joint === `eye${L}`);
        eye.geo.computeBoundingBox();
        const b = eye.geo.boundingBox;
        const c = b.getCenter(new THREE.Vector3());
        expect(Math.sign(at[`eye${L}`][0])).toBe(sd);
        expect(at[`eye${L}`][0]).toBeCloseTo(c.x, 6);
        expect(at[`eye${L}`][1]).toBeCloseTo(c.y, 6);
        // the eyeball's centre: behind the dot's back (front is -z)
        const [px, , pz] = at[`eye${L}`];
        expect(pz).toBeGreaterThan(b.max.z);
        // a 0.3 rad turn about y slides the dot's centre at least 3 mm sideways
        const rot = new THREE.Matrix4().makeTranslation(px, 0, pz)
          .multiply(new THREE.Matrix4().makeRotationY(0.3))
          .multiply(new THREE.Matrix4().makeTranslation(-px, 0, -pz));
        const moved = eye.geo.clone().applyMatrix4(rot);
        moved.computeBoundingBox();
        const mc = moved.boundingBox.getCenter(new THREE.Vector3());
        expect(Math.abs(mc.x - c.x), `${def.kind} eye${L}`).toBeGreaterThanOrEqual(0.003);
      }
      const mouth = tagged(parts, 'mouth')[0];
      mouth.geo.computeBoundingBox();
      const mc = mouth.geo.boundingBox.getCenter(new THREE.Vector3());
      expect(at.mouth[0]).toBeCloseTo(0, 9);
      expect(Math.abs(at.mouth[1] - mc.y)).toBeLessThan(0.002);
      expect(Math.abs(at.mouth[2] - mc.z)).toBeLessThan(0.004);
    }
  });

  it('a bigger smile, corners up, and warmer cheeks', () => {
    const look = personFor({ x: 1, z: 2, kind: 'adult', sex: 'f', height: 1.66 });
    const d = look.dims;
    const parts = personParts(look, 'near');
    const smile = tagged(parts, 'mouth');
    expect(smile.length).toBe(1);
    smile[0].geo.computeBoundingBox();
    const b = smile[0].geo.boundingBox;
    // 0.42 of the head's half-width measure the prototype's 0.34 came from (2 x 0.17 headXr)
    expect((b.max.x - b.min.x) / d.headXr).toBeGreaterThan(0.38);
    expect((b.max.x - b.min.x) / d.headXr).toBeLessThan(0.5);
    // the corners are above the middle
    const pos = smile[0].geo.getAttribute('position');
    let cornerY = -Infinity; let midY = Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getX(i)) > (b.max.x - b.min.x) * 0.45) cornerY = Math.max(cornerY, pos.getY(i));
      if (Math.abs(pos.getX(i)) < 0.003) midY = Math.min(midY, pos.getY(i));
    }
    expect(cornerY).toBeGreaterThan(midY + 0.005);
    const cheeks = tagged(parts, 'cheek');
    expect(cheeks.length).toBe(2);
    const skin = new THREE.Color(look.skin);
    const col = cheeks[0].geo.getAttribute('color');
    // warmer (redder against blue and green), never lighter
    expect(col.getX(0)).toBeCloseTo(skin.r, 2);
    expect(col.getX(0) - col.getZ(0)).toBeGreaterThan(skin.r - skin.b);
    expect(col.getY(0)).toBeLessThan(skin.g);
  });

  it('hair never covers the eyes', () => {
    const looks = [];
    const styles = Object.keys(HAIR_STYLES);
    for (const hairStyle of styles) for (const hat of HATS) looks.push(personFor({ x: looks.length * 1.7, z: 3, hairStyle, hat }));
    for (let i = 0; looks.length < 40; i++) looks.push(personFor({ x: -9 + i * 2.3, z: 11 - i, hairStyle: styles[i % styles.length] }));
    expect(looks.length).toBe(40);
    for (const look of looks) {
      for (const detail of DETAILS) {
        const parts = personParts(look, detail);
        const eyes = tagged(parts, 'eye');
        expect(eyes.length).toBe(2);
        let eyeTop = -Infinity; let eyePlane = -Infinity;
        for (const [, y, z] of verts(eyes)) { eyeTop = Math.max(eyeTop, y); eyePlane = Math.max(eyePlane, z); }
        for (const [, y, z] of verts([...tagged(parts, 'hair'), ...tagged(parts, 'hat')])) {
          if (z < eyePlane) expect(y, `${look.hairStyle} ${look.hat?.kind} ${detail}`).toBeGreaterThan(eyeTop);
        }
      }
    }
  });

  it('a visible neck', () => {
    for (const [def, min] of [[{ kind: 'adult', sex: 'm', height: 1.80 }, 0.06], [{ kind: 'child', sex: 'f', height: 1.30 }, 0.04], [{ kind: 'child', sex: 'm', height: 1.30 }, 0.04]]) {
      for (const top of TOPS) {
        for (const detail of DETAILS) {
          const parts = personParts(personFor({ x: 2, z: 5, ...def, top: { kind: top } }), detail);
          let chin = Infinity; let notch = -Infinity;
          for (const [x, y, z] of verts(tagged(parts, 'head'))) if (Math.abs(x) < 0.02 && z < 0) chin = Math.min(chin, y);
          for (const [x, y, z] of verts(tagged(parts, 'chest'))) if (Math.abs(x) < 0.02 && z < 0) notch = Math.max(notch, y);
          expect(Number.isFinite(chin) && Number.isFinite(notch)).toBe(true);
          expect(chin - notch, `${def.kind} ${top} ${detail}`).toBeGreaterThanOrEqual(min);
        }
      }
    }
  });

  it('shoulders slope', () => {
    for (const def of [{ kind: 'adult', sex: 'm', height: 1.8 }, { kind: 'adult', sex: 'f', height: 1.66 }, { kind: 'older', sex: 'm', height: 1.7, girth: 1.08 }, { kind: 'adult', sex: 'm', girth: 0.94 }]) {
      for (const detail of DETAILS) {
        const look = personFor({ x: 6, z: 1, ...def });
        const d = look.dims;
        const chest = tagged(personParts(look, detail), 'chest');
        const shR = d.shoulderX + d.uaR[0] * 0.25;
        for (const sd of [-1, 1]) {
          const atShoulder = hit(chest, [sd * 0.86 * shR, 5, 0], [0, -1, 0]);
          const atNeck = hit(chest, [sd * 1.35 * d.neckR, 5, 0], [0, -1, 0]);
          expect(atShoulder && atNeck).toBeTruthy();
          expect(atNeck.y - atShoulder.y, `${def.sex} ${detail}`).toBeGreaterThanOrEqual(0.03);
        }
      }
    }
  });

  it('no leg through a flare', () => {
    const defs = [];
    for (const kind of KINDS) for (const sex of SEXES) {
      defs.push({ kind, sex, top: { kind: 'coat' } }, { kind, sex, bottom: { kind: 'skirt' } }, { kind, sex, top: { kind: 'dress' } }, { kind, sex, top: { kind: 'coat' }, bottom: { kind: 'skirt' } });
    }
    for (const def of defs) {
      for (const detail of DETAILS) {
        const look = personFor({ x: 4, z: -2, ...def });
        const d = look.dims;
        const flares = tagged(personParts(look, detail), 'flare');
        expect(flares.length).toBeGreaterThan(0);
        // a coat over a skirt stays outside it down to the coat's hem
        if (flares.length === 2) {
          const [skirt, coat] = flares;
          const cp = coat.geo.getAttribute('position');
          let hemY = Infinity;
          for (let i = 0; i < cp.count; i++) hemY = Math.min(hemY, cp.getY(i));
          const ring = [];
          for (let i = 0; i < cp.count; i++) if (Math.abs(cp.getY(i) - hemY) < 1e-6) ring.push(new THREE.Vector3(cp.getX(i), 0, cp.getZ(i)));
          for (let i = 0; i + 1 < ring.length; i++) {
            const mid = ring[i].clone().add(ring[i + 1]).multiplyScalar(0.5);
            if (mid.length() < 1e-6) continue;
            const p = hit([skirt], [0, hemY + 0.001, 0], [mid.x, 0, mid.z]);
            expect(p, `skirt hit ${def.kind} ${def.sex} ${detail} ${mid.toArray()}`).toBeTruthy();
            expect(Math.hypot(p.x, p.z), `coat over skirt ${def.kind} ${detail}`).toBeLessThan(mid.length());
          }
        }
        for (const f of flares) {
          // its ring at hip height, at each side
          for (const sd of [-1, 1]) {
            let r = -Infinity;
            for (const [x, y] of verts([f])) if (Math.abs(y - d.hipY) < 1e-4) r = Math.max(r, sd * x);
            expect(r, `${def.kind} ${def.top?.kind} ${def.bottom?.kind} ${detail}`).toBeGreaterThan(d.hipX + d.thR[0] * 1.06);
          }
        }
      }
    }
  });

  it('no arm through a short sleeve', () => {
    // the sleeve's round top stays outside the arm's own (a cone over a
    // round cap let the skin show through at the shoulder)
    const jointOf = (part) => part.geo.getAttribute('skinIndex').getX(0);
    for (const kind of KINDS) for (const sex of SEXES) for (const top of ['tshirt']) {
      const look = personFor({ x: 2, z: 1, kind, sex, top: { kind: top } });
      const d = look.dims;
      for (const detail of DETAILS) {
        const parts = personParts(look, detail);
        for (const [sd, L] of [[-1, 'L'], [1, 'R']]) {
          const j = JOINT_INDEX[`upperArm${L}`];
          const sleeve = tagged(parts, 'sleeve').filter((p) => jointOf(p) === j);
          const arm = tagged(parts, 'arm').filter((p) => jointOf(p) === j);
          expect(sleeve.length, `${kind} ${sex} ${detail}`).toBe(1);
          const ax = sd * d.shoulderX;
          const bottom = d.shoulderY - d.upperArm * 0.5;
          for (const [x, y, z] of verts(arm)) {
            const r = Math.hypot(x - ax, z);
            if (y < bottom || r < 1e-6) continue;
            const p = hit(sleeve, [ax, y, 0], [x - ax, 0, z]);
            expect(p, `${kind} ${sex} ${detail} ${L}: the arm at y ${y.toFixed(3)} is above the sleeve`).toBeTruthy();
            expect(Math.hypot(p.x - ax, p.z), `${kind} ${sex} ${detail} ${L} at y ${y.toFixed(3)}`).toBeGreaterThanOrEqual(r - 1e-6);
          }
        }
      }
    }
  });

  it('the trousers\' top: thigh tops inside the seat, the seat\'s rim inside the thighs, its top inside the shirt', () => {
    // ruling R9: no jutting rim where the seat meets the thighs or the chest.
    // (1) the thighs' round tops (and a pair of shorts' tops) are inside the
    // seat; (2) below the hips the seat stays within the thighs' outline
    // (their two tubes and the band between them, front to back); (3) near,
    // the seat's top is inside the chest above the shirt's hem
    const M = 0.002;
    const jointOf = (part) => part.geo.getAttribute('skinIndex').getX(0);
    const thighJ = new Set([JOINT_INDEX.thighL, JOINT_INDEX.thighR]);
    const xz = (x, z) => Math.hypot(x, z);
    // a horizontal ray turned 1e-4 rad, so it never runs exactly along a
    // lathe's seam edge (and slips between its two triangles)
    const ray = (on, o, dx, dz) => hit(on, o, [dx * Math.cos(1e-4) - dz * Math.sin(1e-4), 0, dx * Math.sin(1e-4) + dz * Math.cos(1e-4)]);
    for (const kind of KINDS) for (const sex of SEXES) for (const bottom of BOTTOMS) for (const top of ['tshirt', 'coat']) {
      for (const girth of [0.94, 1.08]) {
        const look = personFor({ x: 6, z: 3, kind, sex, girth, top: { kind: top }, bottom: { kind: bottom } });
        const d = look.dims;
        for (const detail of DETAILS) {
          const label = `${kind} ${sex} ${bottom} ${top} ${girth} ${detail}`;
          const parts = personParts(look, detail);
          const seat = tagged(parts, 'seat');
          expect(seat.length, label).toBe(1);
          const thighs = parts.filter((p) => thighJ.has(jointOf(p)) && (p.tag === 'leg' || p.tag === 'shorts'));
          const legs = thighs.filter((p) => p.tag === 'leg');
          expect(legs.length, label).toBe(2);
          // (1) every thigh vertex at or above the hips is inside the seat
          for (const [x, y, z] of verts(thighs)) {
            if (y < d.hipY - 1e-6) continue;
            const r = xz(x, z);
            const p = ray(seat, [0, y, 0], x, z);
            expect(p, `${label}: no seat round a thigh top at y ${y.toFixed(3)}`).toBeTruthy();
            expect(xz(p.x, p.z) + M, `${label}: a thigh top out of the seat at y ${y.toFixed(3)}`).toBeGreaterThanOrEqual(r);
          }
          // (2) below the hips, every seat vertex is within the thighs' outline
          for (const [x, y, z] of verts(seat)) {
            if (y >= d.hipY - 1e-6) continue;
            const sd = x < 0 ? -1 : 1;
            const ax = sd * d.hipX;
            if (Math.abs(x) >= d.hipX) {
              const p = ray(legs, [ax, y, 0], x - ax, z);
              expect(p, `${label}: the seat below a thigh at y ${y.toFixed(3)}`).toBeTruthy();
              expect(xz(x - ax, z), `${label}: the seat juts out of a thigh at y ${y.toFixed(3)}`).toBeLessThanOrEqual(xz(p.x - ax, p.z) + M);
            } else if (Math.abs(z) > 1e-9) {
              const p = ray(legs, [ax, y, 0], 0, Math.sign(z));
              expect(p, label).toBeTruthy();
              expect(Math.abs(z), `${label}: the seat in front of or behind the thighs at y ${y.toFixed(3)}`).toBeLessThanOrEqual(Math.abs(p.z) + M);
            }
          }
          // (3) near, above the shirt's hem the seat is inside the chest
          if (detail === 'near' && top !== 'dress') {
            const chest = tagged(parts, 'chest');
            let hem = Infinity;
            for (const [, y] of verts(chest)) hem = Math.min(hem, y);
            for (const [x, y, z] of verts(seat)) {
              if (y <= hem + 1e-4 || xz(x, z) < 1e-6) continue;
              const p = ray(chest, [0, y, 0], x, z);
              expect(p, `${label}: no chest round the seat at y ${y.toFixed(3)}`).toBeTruthy();
              expect(xz(x, z), `${label}: the seat through the shirt at y ${y.toFixed(3)}`).toBeLessThanOrEqual(xz(p.x, p.z) - M);
            }
          }
        }
      }
    }
  }, 60000);

  it('triangle targets', () => {
    const counts = { near: [Infinity, 0], far: [Infinity, 0] };
    const add = (look) => {
      for (const detail of DETAILS) {
        const n = tris(personParts(look, detail));
        counts[detail][0] = Math.min(counts[detail][0], n);
        counts[detail][1] = Math.max(counts[detail][1], n);
      }
    };
    for (const kind of KINDS) for (const sex of SEXES) for (const hairStyle of Object.keys(HAIR_STYLES)) for (const hat of HATS) {
      for (const top of TOPS) for (const bottom of BOTTOMS) {
        add(personFor({ x: 1, z: 1, kind, sex, hairStyle, hat, top: { kind: top }, bottom: { kind: bottom }, glasses: true }));
      }
    }
    add(personFor({ x: 311.5, z: 77.25, kind: 'adult', sex: 'm', top: { kind: 'tshirt' } }));
    expect(counts.near[1]).toBeLessThanOrEqual(2800);
    expect(counts.far[1]).toBeLessThanOrEqual(600);
  }, 60000);

  it('far keeps the neck, drops the face', () => {
    for (const kind of KINDS) {
      const tags = new Set(personParts(personFor({ x: 5, z: 5, kind, glasses: true, hairStyle: 'ponytail' }), 'far').map((p) => p.tag));
      for (const t of ['neck', 'collar', 'eye', 'chest', 'head', 'hair']) expect(tags.has(t), t).toBe(true);
      for (const t of ['mouth', 'brow', 'nose', 'catchlight', 'ear', 'cheek', 'thumb', 'deltoid']) expect(tags.has(t), t).toBe(false);
      const near = new Set(personParts(personFor({ x: 5, z: 5, kind, glasses: true }), 'near').map((p) => p.tag));
      for (const t of ['mouth', 'brow', 'nose', 'catchlight', 'ear', 'cheek', 'thumb', 'deltoid', 'eye', 'neck', 'collar', 'glasses']) expect(near.has(t), t).toBe(true);
    }
  });
});
