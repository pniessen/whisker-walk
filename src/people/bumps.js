// The soft bumps of a person (rulings R28-R30): the fixed circles the cat
// slides round, as she slides round a post or a bench. player.update keeps
// her middle (by r + CAT_RADIUS), her head's middle (by r + her head's
// radius) and her body's two ends (by r + her body's radius) out of every
// one. A grown-up who kneels for the head scratch has three: one on the body,
// one where the kneel's raised knee is and one where its back foot is; the
// circles stand there all walk, kneeling or standing, and never grow or move
// (people never push her). Older people (who bow) and children (who never
// kneel) have the body's circle only. A skirt, a dress or a coat's skirt
// adds circles over its cloth as it hangs in their kneel or bow (ruling
// R32). Every radius comes from the person's own body and clothes (their look
// is the spot's, so two co-walkers have the same).
import * as THREE from 'three';
import { kneelSpots, legPose } from './pose.js';
import { flareProfiles, drapeWeights } from './parts.js';

// radii (m), in the person's height scale and girth (dims.s, the height over
// 1.75 m, times the look's girth): fitted to the largest and smallest of each
// kind in the clothes that stand out most (a coat over a skirt), every
// preset cat, every side and heading (Task 11 fix 1c report)
export const BUMP = Object.freeze({
  BODY: 0.335, // a grown-up's body, standing or kneeling
  OLDER: 0.3, // an older person's body, standing or bowing
  CHILD: 0.35, // a child's body (standing: children never kneel for the scratch)
  BACK: 0.06, // the body's circle sits this far behind their middle (their back
  // and the kneel's thigh need more room than their front, where she stands)
  KNEE: 0.1, // the kneel's raised knee
  FOOT: 0.06, // the kneel's back foot
  CLOTH: 0.08, // a circle over cloth that hangs out past the others (ruling R32)
  CLOTH_IN: 0.03, // cloth is covered this far inside a circle's edge
});

// The circles, figure frame: [{ x, z, r }], into `out` (made once per person).
export function bumpCircles(look, out = []) {
  out.length = 0;
  const s = look.dims.s * look.girth;
  const back = BUMP.BACK * look.dims.s;
  if (look.kind === 'child') { out.push({ x: 0, z: back, r: BUMP.CHILD * s }); return out; }
  if (look.kind === 'older') { out.push({ x: 0, z: back, r: BUMP.OLDER * s }); return clothCircles(look, 'bow', out); }
  out.push({ x: 0, z: back, r: BUMP.BODY * s });
  const k = kneelSpots(look);
  out.push({ x: k.kneeX, z: k.kneeZ, r: BUMP.KNEE * s }, { x: k.footX, z: k.footZ, r: BUMP.FOOT * s });
  return clothCircles(look, 'kneel', out);
}

// Ruling R32: a skirt, a dress or a coat's skirt follows the kneel's raised
// thigh (parts.js drapeWeights), so it hangs out past the body's and the
// knee's circles. Its points as they hang in the person's held pose (the
// kneel; an older person's bow) are sampled round and down the flare; any
// not CLOTH_IN inside a circle gets one of its own (radius CLOTH x s): the
// farthest from the body first, its circle set in toward the body so the
// point is CLOTH_IN inside it. Fixed at the walk's start like the others,
// from the look alone, so co-walkers have the same.
const ROUND = 32; // samples round a flare
const DOWN = 3; // samples down each stretch of its profile
const _q = { pelvis: new THREE.Quaternion(), thighL: new THREE.Quaternion(), thighR: new THREE.Quaternion() };
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _w = [0, 0, 0];
function clothCircles(look, mode, out) {
  const flares = flareProfiles(look);
  if (!flares.length) return out;
  const d = look.dims;
  const s = d.s * look.girth;
  const leg = legPose(look, mode);
  _q.pelvis.setFromEuler(_e.set(leg.pelvisRot[0], leg.pelvisRot[1], leg.pelvisRot[2], 'XYZ'));
  _q.thighL.setFromEuler(_e.set(leg.thighL[0], leg.thighL[1], leg.thighL[2], 'XYZ'));
  _q.thighR.setFromEuler(_e.set(leg.thighR[0], leg.thighR[1], leg.thighR[2], 'XYZ'));
  // a point as built, where the held pose puts it (figure frame, x and z):
  // the pelvis's turn about the hips' middle, each thigh's about its hip
  const pts = [];
  const place = (x, y, z, hemY) => {
    drapeWeights(d, hemY, x, y, z, _w);
    let px = 0, pz = 0;
    for (let j = 0; j < 3; j++) {
      if (_w[j] <= 0) continue;
      const hx = j === 0 ? 0 : j === 1 ? -d.hipX : d.hipX;
      _v.set(x - hx, y - d.hipY, z);
      if (j > 0) _v.applyQuaternion(j === 1 ? _q.thighL : _q.thighR);
      _v.x += hx;
      _v.applyQuaternion(_q.pelvis);
      px += _w[j] * (_v.x + leg.pelvis[0]);
      pz += _w[j] * (_v.z + leg.pelvis[2]);
    }
    pts.push(px, pz);
  };
  for (const f of flares) {
    const hemY = f.pts[0][1];
    for (let i = 0; i + 1 < f.pts.length; i++) {
      for (let k = 0; k < DOWN; k++) {
        const r = f.pts[i][0] + (f.pts[i + 1][0] - f.pts[i][0]) * (k / DOWN);
        const y = f.pts[i][1] + (f.pts[i + 1][1] - f.pts[i][1]) * (k / DOWN);
        for (let n = 0; n < ROUND; n++) {
          const phi = (n / ROUND) * Math.PI * 2; // as THREE's lathe: x = r sin, z = r cos
          place(r * Math.sin(phi), y, r * Math.cos(phi) * f.sz, hemY);
        }
      }
    }
  }
  // (inside the body's, knee's and foot's circles as they are: they were
  // fitted with the stiff cloth on; inside a cloth circle by CLOTH_IN)
  const n0 = out.length;
  const inside = (x, z) => {
    for (let i = 0; i < out.length; i++) {
      const c = out[i];
      if (Math.hypot(x - c.x, z - c.z) <= c.r - (i < n0 ? 0 : BUMP.CLOTH_IN * s)) return true;
    }
    return false;
  };
  const body = out[0];
  const rc = BUMP.CLOTH * s;
  const reach = rc - BUMP.CLOTH_IN * s; // a cloth circle covers points this near its middle
  const left = [];
  for (let i = 0; i < pts.length; i += 2) if (!inside(pts[i], pts[i + 1])) left.push(pts[i], pts[i + 1]);
  // each new circle: of the circles set in toward the body from a point left
  // (that point just covered), the one that covers the most points left
  while (left.length) {
    let bx = 0, bz = 0, most = -1;
    for (let i = 0; i < left.length; i += 2) {
      _a.set(left[i] - body.x, 0, left[i + 1] - body.z).normalize().multiplyScalar(reach - 1e-6);
      const cx = left[i] - _a.x, cz = left[i + 1] - _a.z;
      let n = 0;
      for (let j = 0; j < left.length; j += 2) if (Math.hypot(left[j] - cx, left[j + 1] - cz) <= reach) n++;
      if (n > most) { most = n; bx = cx; bz = cz; }
    }
    out.push({ x: bx, z: bz, r: rc });
    for (let i = left.length - 2; i >= 0; i -= 2) if (Math.hypot(left[i] - bx, left[i + 1] - bz) <= reach) left.splice(i, 2);
  }
  return out;
}
