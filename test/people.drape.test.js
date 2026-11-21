import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildSpot } from '../src/people/figure.js';
import { JOINT_INDEX } from '../src/people/parts.js';
import { pose, applyPose, strideFor } from '../src/people/pose.js';

// The dress and the skirt (the owner, 2026-11-21, after the lifelike-people
// pictures): walking, the WHOLE skirt swings with the stride, each half with
// its own leg, and no leg comes through it; kneeling, the cloth goes over
// the raised knee as one piece (the thigh showed as through a slit, seen
// from the side) and stands out no further than the raised leg (a fold stood
// out behind her, to her left).

const material = new THREE.MeshStandardMaterial({ vertexColors: true });
const J = JOINT_INDEX;
const DRESS = { kind: 'adult', sex: 'f', height: 1.68, top: { kind: 'dress', color: 1 }, bottom: { kind: 'skirt', color: 1 } };
const SKIRT = { kind: 'adult', sex: 'f', height: 1.62, top: { kind: 'jumper', color: 1 }, bottom: { kind: 'skirt', color: 2 } };
const LOOKS = [
  ['a woman in a dress', DRESS],
  ['a woman in a skirt', SKIRT],
  ['a small woman in a skirt', { kind: 'adult', sex: 'f', height: 1.6, girth: 0.94, top: { kind: 'jumper', color: 1 }, bottom: { kind: 'skirt', color: 2 } }],
  ['a big woman in a dress', { kind: 'adult', sex: 'f', height: 1.73, girth: 1.08, top: { kind: 'dress', color: 1 } }],
  ['a small woman in a coat over a skirt', { kind: 'adult', sex: 'f', height: 1.6, girth: 0.94, top: { kind: 'coat', color: 1 }, bottom: { kind: 'skirt', color: 2 } }],
  ['a big man in a coat', { kind: 'adult', sex: 'm', height: 1.85, girth: 1.08, top: { kind: 'coat', color: 1 }, bottom: { kind: 'trousers', color: 2 } }],
];
// (they walk but never kneel: an older person bows, a child never kneels)
const WALKERS = [
  ...LOOKS,
  ['a small older woman in a skirt', { kind: 'older', sex: 'f', height: 1.55, girth: 0.94, top: { kind: 'jumper', color: 1 }, bottom: { kind: 'skirt', color: 2 } }],
  ['a girl in a skirt', { kind: 'child', sex: 'f', height: 1.3, top: { kind: 'jumper', color: 1 }, bottom: { kind: 'skirt', color: 2 } }],
];

// the person (a child: the pair's second), near, at the world's middle facing -z
function personOf(def) {
  const { people } = buildSpot({ x: 0, z: 7, ...def }, { material });
  const p = people[def.kind === 'child' ? 1 : 0];
  p.setDetail('near');
  new THREE.Group().add(p.figure);
  return p;
}
function refresh(p) {
  p.figure.parent.updateMatrixWorld(true);
  p.mesh.skeleton.update();
}
// the skinned vertices, world frame, into one flat array
function skinned(p, out) {
  refresh(p);
  const n = p.mesh.geometry.getAttribute('position').count;
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.mesh.getVertexPosition(i, v).applyMatrix4(p.mesh.matrixWorld);
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  return out;
}
// the cloth's triangles (every corner on a flare: pelvis and the thighs) and
// each joint's own triangles (every corner bound whole to it)
function partsOf(p) {
  const geo = p.mesh.geometry;
  const si = geo.getAttribute('skinIndex');
  const sw = geo.getAttribute('skinWeight');
  const idx = geo.index.array;
  const cloth = (i) => si.getX(i) === J.pelvis && si.getY(i) === J.thighL;
  const whole = (i) => (sw.getX(i) === 1 ? si.getX(i) : -1);
  const out = { cloth: [], joint: {}, rest: geo.getAttribute('position'), isCloth: cloth };
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (cloth(a) && cloth(b) && cloth(c)) out.cloth.push(a, b, c);
    else if (whole(a) >= 0 && whole(a) === whole(b) && whole(a) === whole(c)) (out.joint[whole(a)] ??= []).push(a, b, c);
  }
  return out;
}
// points on a joint's triangles (corners, edge middles, middles), world, with
// their rest place
function samples(P, tris, rest) {
  const out = [];
  const W = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
  for (let t = 0; t < tris.length; t += 3) {
    for (const w of W) {
      const s = { x: 0, y: 0, z: 0, ry: 0 };
      for (let k = 0; k < 3; k++) {
        const i = tris[t + k];
        s.x += w[k] * P[i * 3]; s.y += w[k] * P[i * 3 + 1]; s.z += w[k] * P[i * 3 + 2];
        s.ry += w[k] * rest.getY(i);
      }
      out.push(s);
    }
  }
  return out;
}
// the distances along a ray (o, d) at which it meets the triangles
function hits(P, tris, o, d) {
  const out = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
    const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
    const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
    const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const tx = o.x - P[a], ty = o.y - P[a + 1], tz = o.z - P[a + 2];
    const u = (tx * px + ty * py + tz * pz) / det;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (d.x * qx + d.y * qy + d.z * qz) / det;
    if (v < 0 || u + v > 1) continue;
    const s = (e2x * qx + e2y * qy + e2z * qz) / det;
    if (s > 0) out.push(s);
  }
  return out;
}
// the walk at a phase (0..1 of a stride cycle), the pose taken at once
function walkAt(p, u) {
  pose(p, { mode: 'walk', walked: (u * 2 * Math.PI) / strideFor(p, 1) });
  applyPose(p, 1 / 60, 0);
}
// the held kneel (an older person's bow), settled
function kneel(p) {
  for (let i = 0; i < 120; i++) { pose(p, { mode: 'kneel', t: i / 60 }); applyPose(p, 1 / 60); }
}

describe('the dress and the skirt in the stride', () => {
  it('the whole skirt swings: each quarter of the hem (front and back, left and right) moves with its own leg, about as far as the others', () => {
    // (before: the right half stayed with the hips, its hem moving 1-5 cm
    // over a stride against the left half's 30-47 cm)
    for (const [who, def] of WALKERS) {
      const p = personOf(def);
      const { rest } = partsOf(p);
      const geo = p.mesh.geometry;
      const si = geo.getAttribute('skinIndex');
      let hemY = Infinity;
      for (let i = 0; i < si.count; i++) if (si.getY(i) === J.thighL) hemY = Math.min(hemY, rest.getY(i));
      // the hem's corners in each quarter (well away from the sides)
      const quarter = { FL: [], FR: [], BL: [], BR: [] };
      for (let i = 0; i < si.count; i++) {
        if (si.getY(i) !== J.thighL || Math.abs(rest.getY(i) - hemY) > 1e-6) continue;
        const x = rest.getX(i), z = rest.getZ(i);
        if (Math.abs(z) < 0.5 * Math.hypot(x, z) || Math.abs(x) < 1e-3) continue;
        quarter[(z < 0 ? 'F' : 'B') + (x < 0 ? 'L' : 'R')].push(i);
      }
      const range = Object.fromEntries(Object.keys(quarter).map((q) => [q, [Infinity, -Infinity]]));
      const P = new Float64Array(si.count * 3);
      const pel = new THREE.Vector3();
      for (let k = 0; k < 24; k++) {
        walkAt(p, k / 24);
        skinned(p, P);
        p.bones.pelvis.getWorldPosition(pel);
        for (const [q, ids] of Object.entries(quarter)) {
          let z = 0;
          for (const i of ids) z += P[i * 3 + 2] - pel.z;
          z /= ids.length;
          range[q][0] = Math.min(range[q][0], z); range[q][1] = Math.max(range[q][1], z);
        }
      }
      const moved = Object.fromEntries(Object.entries(range).map(([q, [lo, hi]]) => [q, hi - lo]));
      const most = Math.max(...Object.values(moved));
      for (const [q, m] of Object.entries(moved)) {
        expect(m, `${who}: the hem's ${q} quarter, fore and aft over a stride`).toBeGreaterThan(0.12);
        expect(m, `${who}: the hem's ${q} quarter against the most (${most.toFixed(3)} m)`).toBeGreaterThan(0.7 * most);
      }
    }
  }, 60000);

  it('no leg comes through the cloth, front, back or side, at any phase of the stride', () => {
    // Every point of the thighs and the shins below the hips (above them the
    // thigh's round top sits inside the seat, which is the skirt's own
    // colour: test/people.parts.test.js), at a height the cloth covers (a
    // level ray from the hips' upright out through the point meets the
    // cloth), is inside it: no farther out than the cloth's farthest meeting.
    // (before: up to 9.8 cm out at the back, where the right half and the
    // back stayed with the hips while the legs swung)
    for (const [who, def] of WALKERS) {
      const p = personOf(def);
      const parts = partsOf(p);
      const d = p.look.dims;
      const n = parts.rest.count;
      const P = new Float64Array(n * 3);
      const pel = new THREE.Vector3();
      const o = new THREE.Vector3();
      const dir = new THREE.Vector3();
      let worst = -Infinity;
      let at = '';
      for (let k = 0; k < 48; k++) {
        walkAt(p, k / 48);
        skinned(p, P);
        p.bones.pelvis.getWorldPosition(pel);
        for (const j of ['thighL', 'thighR', 'shinL', 'shinR']) {
          for (const s of samples(P, parts.joint[J[j]], parts.rest)) {
            if (s.ry > d.hipY) continue;
            dir.set(s.x - pel.x, 0, s.z - pel.z);
            const r = dir.length();
            if (r < 1e-6) continue;
            dir.divideScalar(r);
            const h = hits(P, parts.cloth, o.set(pel.x, s.y, pel.z), dir);
            if (!h.length) continue;
            const out = r - Math.max(...h);
            if (out > worst) { worst = out; at = `phase ${k}/48, ${j} at y ${s.y.toFixed(3)}`; }
          }
        }
      }
      expect(worst, `${who}: ${at}`).toBeLessThanOrEqual(0);
    }
  }, 90000);
});

describe('the dress and the skirt in the kneel', () => {
  it('from the side, no slit: the raised thigh stays inside the cloth where the cloth is over it, and a skirt or a dress lies over its whole top', () => {
    // Points on the raised (left) thigh, from 5% to 85% of the way to the
    // knee (the hem is at 92%): a ray from the thigh's axis out through the
    // point that meets the cloth meets it beyond the point (before: the
    // thigh came up to 6.5 cm through a skirt or a dress near the hip). And
    // the thigh's top (its points facing up) from 10% to 75% of the way is
    // under the cloth (a coat is shorter: from the hip to its own hem).
    for (const [who, def] of LOOKS) {
      const p = personOf(def);
      const parts = partsOf(p);
      kneel(p);
      const P = skinned(p, new Float64Array(parts.rest.count * 3));
      const hip = p.bones.thighL.getWorldPosition(new THREE.Vector3());
      const axis = p.bones.shinL.getWorldPosition(new THREE.Vector3()).sub(hip);
      const L = axis.length();
      axis.normalize();
      const s3 = new THREE.Vector3();
      const c = new THREE.Vector3();
      const dir = new THREE.Vector3();
      const coat = def.top.kind === 'coat';
      const hemAt = coat ? 0.4 : 0.75;
      let through = 0, worst = 0, tops = 0, bare = 0;
      for (const s of samples(P, parts.joint[J.thighL], parts.rest)) {
        s3.set(s.x, s.y, s.z);
        const along = s3.clone().sub(hip).dot(axis);
        if (along < 0.05 * L || along > 0.85 * L) continue;
        c.copy(hip).addScaledVector(axis, along);
        dir.copy(s3).sub(c);
        const r = dir.length();
        dir.divideScalar(r);
        const h = hits(P, parts.cloth, c, dir);
        if (h.length && Math.max(...h) < r) { through++; worst = Math.max(worst, r - Math.max(...h)); }
        if (dir.y > 0.5 && along > 0.1 * L && along < hemAt * L) { tops++; if (!h.length) bare++; }
      }
      expect(through, `${who}: thigh points through the cloth (by up to ${worst.toFixed(3)} m)`).toBe(0);
      expect(tops, who).toBeGreaterThan(30);
      expect(bare, `${who}: of the thigh's top, ${tops} points`).toBe(0);
    }
  }, 60000);

  it('on the way down and up as well: the raised thigh comes through the cloth by at most 5 mm on any frame', () => {
    // The same points and rays as above, every 1/60 s frame of the 0.7 s
    // way down into the kneel and up again (before: up to 8.2 cm, the thigh
    // showing through the skirt for most of the way)
    for (const [who, def] of LOOKS.slice(0, 2)) {
      const p = personOf(def);
      const parts = partsOf(p);
      const P = new Float64Array(parts.rest.count * 3);
      const hip = new THREE.Vector3();
      const axis = new THREE.Vector3();
      const s3 = new THREE.Vector3();
      const c = new THREE.Vector3();
      const dir = new THREE.Vector3();
      let t = 0;
      const step = (mode) => { t += 1 / 60; pose(p, { mode, t }); applyPose(p, 1 / 60); };
      for (let i = 0; i < 120; i++) step('stand');
      let worst = 0;
      let at = '';
      for (let f = 0; f < 96; f++) {
        step(f < 48 ? 'kneel' : 'stand');
        skinned(p, P);
        p.bones.thighL.getWorldPosition(hip);
        p.bones.shinL.getWorldPosition(axis).sub(hip);
        const L = axis.length();
        axis.normalize();
        for (const s of samples(P, parts.joint[J.thighL], parts.rest)) {
          s3.set(s.x, s.y, s.z);
          const along = s3.clone().sub(hip).dot(axis);
          if (along < 0.05 * L || along > 0.85 * L) continue;
          c.copy(hip).addScaledVector(axis, along);
          dir.copy(s3).sub(c);
          const r = dir.length();
          dir.divideScalar(r);
          const h = hits(P, parts.cloth, c, dir);
          if (h.length && r - Math.max(...h) > worst) { worst = r - Math.max(...h); at = `frame ${f} (${f < 48 ? 'down' : 'up'})`; }
        }
      }
      expect(worst, `${who}: ${at}`).toBeLessThanOrEqual(0.005);
    }
  }, 60000);

  it('from behind, no fold: the cloth stands out to her left no farther than her raised leg (2 cm), and nowhere farther back than her body', () => {
    // (before: the cloth over the turned-out thigh stood 5.7-6.9 cm out past
    // the raised knee, a fold standing up behind her to her left)
    for (const [who, def] of LOOKS) {
      const p = personOf(def);
      const parts = partsOf(p);
      kneel(p);
      const P = skinned(p, new Float64Array(parts.rest.count * 3));
      const si = p.mesh.geometry.getAttribute('skinIndex');
      let cloth = -Infinity, leg = -Infinity, clothBack = -Infinity, bodyBack = -Infinity;
      for (let i = 0; i < parts.rest.count; i++) {
        const j = si.getX(i);
        if (parts.isCloth(i)) {
          cloth = Math.max(cloth, -P[i * 3]);
          clothBack = Math.max(clothBack, P[i * 3 + 2]);
        } else {
          if (j === J.thighL || j === J.shinL) leg = Math.max(leg, -P[i * 3]);
          bodyBack = Math.max(bodyBack, P[i * 3 + 2]);
        }
      }
      expect(cloth - leg, `${who}: out to her left past the raised leg`).toBeLessThanOrEqual(0.02);
      expect(clothBack, `${who}: behind`).toBeLessThan(bodyBack);
    }
  }, 60000);
});
