import * as THREE from 'three';
import { LEGS, TORSO, PAW_HALF } from './torso.js';

// The smooth limb (body refinement, docs/superpowers/specs/2026-11-01-body-refinement-design.md):
// each leg is ONE tube along a smooth curve, from a shoulder (front) or a
// thigh (hind) tapering to a slim ankle over the paw. No seams at the joints,
// no thigh sphere, no cankles. The shapes are the approved sketch's
// (2026-11-01-body-refinement-sketch.html), with the ankles brought over the
// paw and the top points lowered so the dome stays inside the body.
//
// A limb's vertex order is fixed and regular, because the folds (Task 5)
// write baked shapes into this same geometry: tube vertex `ring * sides + j`
// for ring 0 (top) .. rings (bottom), then the dome ring, then the dome's apex.
// userData.t is each vertex's curve parameter (0 top .. 1 bottom; the dome 0).

// Leg-local control points (hip pivot at 0, -y down, -z forward) for a limb
// of length LEGS.LEN, and the tube radius at each.
export const LEG_SHAPE = Object.freeze({
  // shoulder blade -> elbow (a little back) -> slim wrist -> over the paw
  front: Object.freeze({
    points: Object.freeze([[0, 0.015, 0.03], [0, -0.08, 0], [0, -0.19, -0.015], [0, -0.30, -0.01], [0, -0.335, -0.02]]),
    radii: Object.freeze([0.085, 0.062, 0.046, 0.038, 0.036]),
  }),
  // thigh -> knee forward -> hock back -> slim ankle -> over the paw
  hind: Object.freeze({
    points: Object.freeze([[0, 0.0, 0.01], [0, -0.09, -0.025], [0, -0.20, 0.05], [0, -0.27, 0.062], [0, -0.335, 0.02]]),
    radii: Object.freeze([0.10, 0.092, 0.062, 0.043, 0.036]),
  }),
});

// R5: a tube of sides x rings costs 2·sides·rings triangles, its dome 3·sides:
// full 210, simple 168. Same rings, so the same shape.
export const LIMB_SEG = Object.freeze({
  full: Object.freeze({ sides: 10, rings: 9 }),
  simple: Object.freeze({ sides: 8, rings: 9 }),
});

// R7: the top LEG_BLEND of the curve blends from the torso's painted colour
// into the leg colour.
export const LEG_BLEND = 0.18;

// The dome's one ring, this far round from the tube's top ring toward its apex.
const DOME_RING = Math.PI / 4;

const smooth = (k) => k * k * (3 - 2 * k);

// The radius at curve parameter t: each control point's radius, eased between
// neighbours with a smoothstep (so the taper has no kinks).
function radiusAt(radii, t) {
  const f = t * (radii.length - 1);
  const i = Math.min(radii.length - 2, Math.floor(f));
  return radii[i] + (radii[i + 1] - radii[i]) * smooth(f - i);
}
// Its slope, dr/dt.
function radiusSlope(radii, t) {
  const f = t * (radii.length - 1);
  const i = Math.min(radii.length - 2, Math.floor(f));
  const k = f - i;
  return (radii[i + 1] - radii[i]) * 6 * k * (1 - k) * (radii.length - 1);
}

// A tube along a Catmull-Rom curve through `points`, radius eased between
// `radii`, on rotation-minimising frames (no twist), welded around (no seam
// vertices), a 2-ring dome closing the top and the bottom left open (it ends
// inside the paw). Indexed; userData { t, sides, rings }.
export function tubeGeometry(points, radii, { sides, rings }) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const centres = [], tangents = [], normals = [];
  for (let i = 0; i <= rings; i++) {
    centres.push(curve.getPointAt(i / rings));
    tangents.push(curve.getTangentAt(i / rings).normalize());
  }
  // First normal: the leg's sideways axis (+x) made perpendicular to the
  // tangent; then the double-reflection rotation-minimising frame down the curve.
  const n0 = new THREE.Vector3(1, 0, 0).addScaledVector(tangents[0], -tangents[0].x);
  if (n0.lengthSq() < 1e-12) n0.set(0, 0, 1).addScaledVector(tangents[0], -tangents[0].z);
  normals.push(n0.normalize());
  for (let i = 0; i < rings; i++) {
    const v1 = centres[i + 1].clone().sub(centres[i]);
    const c1 = v1.dot(v1);
    const rL = normals[i].clone().addScaledVector(v1, (-2 / c1) * v1.dot(normals[i]));
    const tL = tangents[i].clone().addScaledVector(v1, (-2 / c1) * v1.dot(tangents[i]));
    const v2 = tangents[i + 1].clone().sub(tL);
    const c2 = v2.dot(v2);
    if (c2 > 1e-12) rL.addScaledVector(v2, (-2 / c2) * v2.dot(rL));
    normals.push(rL.addScaledVector(tangents[i + 1], -rL.dot(tangents[i + 1])).normalize());
  }

  // Normals are the surface's own (the ring's outward direction, tipped back
  // along the curve by the taper's slope), not averaged from faces: where the
  // hind knee bends tighter than the thigh is thick, a few faces behind the
  // knee fold over, and face-averaged normals would shade that as a dark pit.
  const count = (rings + 1) * sides + sides + 1;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const t = new Float32Array(count);
  const b = new THREE.Vector3(), d = new THREE.Vector3();
  const put = (k, x, y, z) => { pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; };
  const putN = (k, v) => { nor[k * 3] = v.x; nor[k * 3 + 1] = v.y; nor[k * 3 + 2] = v.z; };
  // A ring of `sides` vertices about c, radius r, in the plane (n, bi); each
  // normal its radial direction tipped by `slope` along -tan.
  const ring = (k0, c, n, bi, r, tan, slope, lift = 0) => {
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      d.set(ca * n.x + sa * bi.x, ca * n.y + sa * bi.y, ca * n.z + sa * bi.z);
      put(k0 + j, c.x + r * d.x, c.y + r * d.y, c.z + r * d.z);
      putN(k0 + j, d.multiplyScalar(Math.cos(lift)).addScaledVector(tan, -slope).normalize());
    }
  };
  const length = curve.getLength();
  for (let i = 0; i <= rings; i++) {
    b.crossVectors(tangents[i], normals[i]);
    ring(i * sides, centres[i], normals[i], b, radiusAt(radii, i / rings), tangents[i], radiusSlope(radii, i / rings) / length);
    t.fill(i / rings, i * sides, (i + 1) * sides);
  }
  // The dome: a sphere cap of the top ring's radius about the top centre,
  // reaching back up the curve (dome t stays 0).
  const r0 = radiusAt(radii, 0);
  b.crossVectors(tangents[0], normals[0]);
  const domeC = centres[0].clone().addScaledVector(tangents[0], -r0 * Math.sin(DOME_RING));
  const dome = (rings + 1) * sides;
  ring(dome, domeC, normals[0], b, r0 * Math.cos(DOME_RING), tangents[0], Math.sin(DOME_RING), DOME_RING);
  const apex = dome + sides;
  const top = centres[0].clone().addScaledVector(tangents[0], -r0);
  put(apex, top.x, top.y, top.z);
  putN(apex, tangents[0].clone().negate());

  const idx = [];
  const band = (up, down) => {
    for (let j = 0; j < sides; j++) {
      const j1 = (j + 1) % sides;
      idx.push(up + j, up + j1, down + j, up + j1, down + j1, down + j);
    }
  };
  for (let i = 0; i < rings; i++) band(i * sides, (i + 1) * sides);
  band(dome, 0);
  for (let j = 0; j < sides; j++) idx.push(apex, dome + (j + 1) % sides, dome + j);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.userData.t = t;
  geo.userData.sides = sides;
  geo.userData.rings = rings;
  return geo;
}

// The standing limb for a leg of length `len`: the points below the hip
// stretch in y by len / LEGS.LEN (the top point and the radii stay).
export function limbGeometry(len, hind, simple = false) {
  const { points, radii } = LEG_SHAPE[hind ? 'hind' : 'front'];
  const k = len / LEGS.LEN;
  const pts = points.map(([x, y, z]) => [x, y < 0 ? y * k : y, z]);
  return tubeGeometry(pts, radii, LIMB_SEG[simple ? 'simple' : 'full']);
}

// The limb's vertex colours: `topHex` (a hex or a THREE.Color, the torso's
// painted colour at the hip) at t 0, easing (smoothstep) into `legHex` by
// t = LEG_BLEND, `legHex` exactly below that.
export function paintLimb(geo, legHex, topHex) {
  const leg = new THREE.Color(legHex), top = new THREE.Color(topHex), c = new THREE.Color();
  const { t } = geo.userData;
  const col = new Float32Array(t.length * 3);
  for (let i = 0; i < t.length; i++) {
    const k = Math.min(1, Math.max(0, t[i] / LEG_BLEND));
    if (k >= 1) c.copy(leg);
    else if (k <= 0) c.copy(top);
    else c.copy(top).lerp(leg, smooth(k));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// R7: the torso's undeformed unit direction toward the point just under a
// hip at (x, z) in the cat's frame, (x, LEGS.HIP_Y - 0.04, z), for a torso
// with body factors `f`: where a limb's top colour is sampled (coatColourAt).
export function legTopDir(x, z, f = [1, 1, 1]) {
  const d = [
    x / (TORSO.SCALE[0] * f[0]),
    (LEGS.HIP_Y - 0.04 - TORSO.CENTRE_Y) / (TORSO.SCALE[1] * f[1]),
    z / (TORSO.SCALE[2] * f[2]),
  ];
  const L = Math.hypot(...d);
  return d.map((v) => v / L);
}

// ---------------------------------------------------------------------------
// THE FOOT (body refinement Task 4; the sketch's smoothFoot): one soft oval
// with a flat sole and a low rounded top, four toes scalloped into its front
// edge, and four small claws just showing at the toe tips (R6), all one
// vertex-coloured geometry on the shared white material. Its origin is where
// today's paw's centre was, so the sole is PAW_HALF below it and the heel
// where today's was.

// The claws' colour (the sketch's).
export const CLAW_HEX = 0xd9d4c8;
// R: the paw radius the oval is built from; TOES: each toe's centre across
// the foot, as a fraction of its half-width (the sketch's).
export const FOOT = Object.freeze({ R: 0.062, TOES: Object.freeze([-0.62, -0.21, 0.21, 0.62]) });

// The oval: half-width 0.95 R (the sketch's), reaching 1.3 R forward to the
// toes' base line (the sketch's) and 1.4 R back to the heel (today's paw's
// 1.42, so the heel stays where it was). Its top is 0.75 R up (the sketch's).
const FOOT_W = 0.95 * FOOT.R;
const FOOT_FRONT = 1.3 * FOOT.R;
const FOOT_BACK = 1.4 * FOOT.R;
const FOOT_TOP = 0.75 * FOOT.R;
// The front edge in the oval's unit outline: u across (-1 left .. 1 right),
// v forward (1 is the toes' base line). Each toe is a rounded tip (its centre
// and two flanks) and between neighbouring toes is a scallop; the middle toes
// reach furthest, the outer two sit a little back, as on a real paw. Left to
// right, from the side of the foot round the front to the other side.
const TOE_V = [1.0, 1.1, 1.1, 1.0]; // each toe's tip
const TOE_FLANK = [0.075, 0.03];       // a flank: this far across, this much behind the tip
const SCALLOP_V = [0.86, 0.98, 0.86]; // between toes 1|2, 2|3, 3|4
const FRONT_EDGE = (() => {
  const pts = [[-1, 0], [-0.86, 0.66]];
  FOOT.TOES.forEach((u, i) => {
    pts.push([u - TOE_FLANK[0], TOE_V[i] - TOE_FLANK[1]], [u, TOE_V[i]], [u + TOE_FLANK[0], TOE_V[i] - TOE_FLANK[1]]);
    if (i < 3) pts.push([(u + FOOT.TOES[i + 1]) / 2, SCALLOP_V[i]]);
  });
  pts.push([0.86, 0.66], [1, 0]);
  return pts;
})();
// Points round the heel, between the two sides (full / simple): the only
// difference between the two feet, so both have the same toes.
const HEEL_PTS = { full: 9, simple: 5 };
// The rings up the side, as [outline scale, height]: the flat sole's edge,
// the widest ring a little below the middle, a shoulder under the low top.
// The sole's centre and the top's apex close it.
const FOOT_RINGS = [[0.72, -PAW_HALF], [1, -0.25 * PAW_HALF], [0.78, 0.55 * FOOT_TOP]];
// R6: a claw is a 3-sided open cone, radius 0.0045 and 0.018 long, angled
// forward and down 0.5 rad, its tip CLAW_OUT beyond the toe's front point:
// the rest is inside the toe.
const CLAW = { R: 0.0045, LEN: 0.018, DIP: 0.5, OUT: 0.008 };

// The unit outline, closed, anticlockwise seen from above: the front edge
// left to right, then round the heel right to left.
function footOutline(simple) {
  const pts = FRONT_EDGE.slice();
  const n = HEEL_PTS[simple ? 'simple' : 'full'];
  for (let k = 1; k <= n; k++) {
    const a = (k / (n + 1)) * Math.PI;
    pts.push([Math.cos(a), -Math.sin(a)]);
  }
  return pts;
}
const outlineX = (u) => u * FOOT_W;
const outlineZ = (v) => -v * (v > 0 ? FOOT_FRONT : FOOT_BACK);

export function footGeometry(pawHex, simple = false) {
  const outline = footOutline(simple);
  const n = outline.length;
  const pos = [];
  const put = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1; };
  const sole = put(0, -PAW_HALF, 0);
  const ring0 = pos.length / 3;
  for (const [s, y] of FOOT_RINGS) for (const [u, v] of outline) put(outlineX(u) * s, y, outlineZ(v) * s);
  const apex = put(0, FOOT_TOP, 0);
  const idx = [];
  const at = (k, j) => ring0 + k * n + (j % n);
  // The outline runs anticlockwise from above (-z forward, +x right), so each
  // face is wound to face out.
  for (let j = 0; j < n; j++) idx.push(sole, at(0, j), at(0, j + 1));
  for (let k = 0; k < FOOT_RINGS.length - 1; k++) {
    for (let j = 0; j < n; j++) idx.push(at(k, j), at(k + 1, j), at(k + 1, j + 1), at(k, j), at(k + 1, j + 1), at(k, j + 1));
  }
  const top = FOOT_RINGS.length - 1;
  for (let j = 0; j < n; j++) idx.push(apex, at(top, j + 1), at(top, j));
  const footCount = pos.length / 3;

  // The claws, one at each toe's tip on the widest ring.
  const [, tipY] = FOOT_RINGS[1];
  const d = new THREE.Vector3(0, -Math.sin(CLAW.DIP), -Math.cos(CLAW.DIP));
  const a = new THREE.Vector3(1, 0, 0);
  const b = new THREE.Vector3().crossVectors(d, a);
  FOOT.TOES.forEach((u, i) => {
    const tip = new THREE.Vector3(outlineX(u), tipY, outlineZ(TOE_V[i])).addScaledVector(d, CLAW.OUT);
    const base = tip.clone().addScaledVector(d, -CLAW.LEN);
    const k0 = pos.length / 3;
    for (let j = 0; j < 3; j++) {
      const ang = (j / 3) * Math.PI * 2;
      const c = Math.cos(ang) * CLAW.R, sn = Math.sin(ang) * CLAW.R;
      put(base.x + a.x * c + b.x * sn, base.y + a.y * c + b.y * sn, base.z + a.z * c + b.z * sn);
    }
    const t = put(tip.x, tip.y, tip.z);
    for (let j = 0; j < 3; j++) idx.push(k0 + j, k0 + (j + 1) % 3, t);
  });

  const count = pos.length / 3;
  const col = new Float32Array(count * 3);
  const paw = new THREE.Color(pawHex), claw = new THREE.Color(CLAW_HEX);
  for (let i = 0; i < count; i++) (i < footCount ? paw : claw).toArray(col, i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// R8: today's plain paw (radius 0.062, flattened 0.62, long 1.42; no toes,
// no claws, no vertex colours), for feet items to sit on exactly as before.
export function plainPawGeometry() {
  const geo = new THREE.SphereGeometry(FOOT.R, 12, 9);
  geo.scale(1.02, 0.62, 1.42);
  return geo;
}
