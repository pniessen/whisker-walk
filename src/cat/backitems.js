import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import { TORSO, deformTorso, shellInflate, torsoUnitAt } from './torso.js';
import { CAPE, CAPE_SIT } from './model.js';

// BACK ITEMS AS SHAPED THINGS ON THE BACK (accessories polish Task 2, 2026-11-03).
//
// The owner: "the back accessories (wings, jetpack, tiny backpack) look like
// silly boxes". They were a blue cube parked over the back, two grey
// cylinders and two flat coloured plates, hung on the cat group and carried
// on the posed torso only in the sit: in the stalk the cube floated, and over
// the cape the pack sank into the cloth, the tanks were buried in it and the
// wings came out through it.
//
// Each item here is built ON the torso and hung on the body (model.js
// body.add), so it follows every pose as the coats and the cape do. Its
// pieces are made in an ITEM frame (x to the side, y out of the back, z toward
// the tail), turned onto a spot of the outer surface (backAnchor: the fur, the
// coat shell or the cape's cloth) and seated on it: lifted along the normal
// there until its lowest vertex is SEAT mm off that surface. Then the whole
// thing is brought back into the body's frame by 1 / bodyScale (placeOnBack),
// so the torso's scale does not squash it (as model.js onCape does for the
// clasp). Straps are drawn straight on the surface, a few mm out. One
// vertex-coloured mesh per item (two for the wings, which flutter).

export const BACK_ITEM_IDS = ['backpack', 'jetpack', 'wings'];

// Palette (the old items' colours, and the brief's new ones).
export const PACK_BLUE = 0x3a6ea5;
const PACK_FLAP = 0x2d5684;
const PACK_BUCKLE = 0xf2c14e;
export const STRAP_GREY = 0x55606e;
export const JETPACK_SILVER = 0xb8bcc4;
const JETPACK_RED = 0xd8303c;
const JETPACK_DARK = 0x3a3f48;
export const JETPACK_FLAME = 0xf2822e;
const FLAME_TIP = 0xffd65a;
export const WING_CORAL = 0xf29a8a;
export const WING_SAGE = 0x9fc9a0;
const WING_PLUM = 0x4a2a4a;
const WING_SPOT = 0xffffff;

// How far an item's lowest vertex sits off the surface it rests on (m, in
// the body-scaled frame). The wings sit a little higher: they flutter about
// their root.
const SEAT = 0.0025;
const WING_SEAT = 0.004;

const colourCache = new Map();
function rgb(hex) {
  if (hex instanceof THREE.Color) return hex;
  let c = colourCache.get(hex);
  if (!c) { c = new THREE.Color(hex); colourCache.set(hex, c); }
  return c;
}
const mix = (a, b, t) => rgb(a).clone().lerp(rgb(b), t);
const shade = (hex, k) => rgb(hex).clone().multiplyScalar(k);

// --- the surface ----------------------------------------------------------

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const coverK = (uy, cover) => (cover === 'fur' ? 1 : cover === 'shell' ? shellInflate(uy) : shellInflate(uy) * CAPE.inflate);

// The outer surface over the undeformed unit direction u, body-local (before
// the body's scale): the fur (torso.js torsoSurface), a coat shell (inflated
// by shellInflate, as model.js coatShell) or the cape's cloth (model.js
// capePoint: the shell's inflation, CAPE.inflate more, and its hem flared out
// sideways — nothing on the back, where the flare is 0).
function coverLocal(ux, uy, uz, cover, out) {
  const [x, y, z] = deformTorso(ux, uy, uz);
  const k = TORSO.R * coverK(uy, cover);
  out.set(x * k, y * k, z * k);
  if (cover === 'cape') out.x += Math.sign(ux) * CAPE.flare * smooth(0.3, -0.2, uy);
  return out;
}
const _u = new THREE.Vector3();
function coverScaled(u, cover, bodyScale, out = new THREE.Vector3()) {
  _u.copy(u).normalize();
  return coverLocal(_u.x, _u.y, _u.z, cover, out).multiply(_v3(bodyScale));
}
const _sv = new THREE.Vector3();
const _v3 = (a) => _sv.set(a[0], a[1], a[2]);

// The point on the outer surface over the unit direction `dir`, in the
// body-SCALED frame (divide by bodyScale to enter the body's own frame), its
// outward normal, and the forward tangent there (toward the head, -z, made
// perpendicular to the normal). `lift` moves the point out along the normal.
export function backAnchor(dir, { bodyScale, cover = 'fur' }, lift = 0) {
  const u = new THREE.Vector3(...dir).normalize();
  const at = coverScaled(u, cover, bodyScale);
  const t1 = new THREE.Vector3().crossVectors(u, Math.abs(u.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(u, t1).normalize();
  const e = 1e-3;
  const a = coverScaled(u.clone().addScaledVector(t1, e), cover, bodyScale).sub(at);
  const b = coverScaled(u.clone().addScaledVector(t2, e), cover, bodyScale).sub(at);
  const n = new THREE.Vector3().crossVectors(a, b).normalize();
  if (n.dot(at) < 0) n.negate();
  const fwd = new THREE.Vector3(0, 0, -1).addScaledVector(n, n.z).normalize();
  at.addScaledVector(n, lift);
  return { at, n, fwd };
}

// The item frame on an anchor: x to the side, y = n out of the back, z toward
// the tail.
function frameOf(anchor) {
  const y = anchor.n.clone().normalize();
  const z = anchor.fwd.clone().negate().normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(anchor.at);
}

// Turn geometry built in the item frame onto the anchor (body-scaled frame),
// then bring it into the body's frame by 1 / bodyScale (counter-scaled).
export function placeOnBack(geo, anchor, bodyScale) {
  geo.applyMatrix4(frameOf(anchor));
  geo.scale(1 / bodyScale[0], 1 / bodyScale[1], 1 / bodyScale[2]);
  return geo;
}

// How far the closest vertex of `geo` (body-scaled frame) is outside the
// surface, measured along the ray from the body's centre through it.
const _p = new THREE.Vector3(), _l = new THREE.Vector3(), _s = new THREE.Vector3();
const _ua = [0, 0, 0];
function clearance(geo, cover, bodyScale, which = null) {
  const p = geo.attributes.position;
  let low = Infinity;
  for (let i = 0; i < p.count; i++) {
    _p.fromBufferAttribute(p, i);
    _l.set(_p.x / bodyScale[0], _p.y / bodyScale[1], _p.z / bodyScale[2]);
    torsoUnitAt([_l.x, _l.y, _l.z], _ua);
    coverLocal(_ua[0], _ua[1], _ua[2], cover, _s).multiply(_v3(bodyScale));
    const c = _p.length() - _s.length();
    if (c < low) { low = c; if (which) which.fromBufferAttribute(p, i); }
  }
  return low;
}

// How far along the anchor's normal item-frame geometry must be lifted so its
// closest vertex is `gap` off the surface.
function seatLift(geo, anchor, cover, bodyScale, gap) {
  return gap - clearance(geo.clone().applyMatrix4(frameOf(anchor)), cover, bodyScale);
}
// The anchor over `dir`, lifted so `geo` (item frame) rests `gap` off the surface.
function seatedAnchor(geo, dir, cover, bodyScale, gap) {
  const lift = seatLift(geo, backAnchor(dir, { bodyScale, cover }), cover, bodyScale, gap);
  return backAnchor(dir, { bodyScale, cover }, lift);
}
// Straps (body-scaled frame) brought into the body's frame and merged with
// the placed item.
function withStraps(item, straps, bodyScale) {
  for (const g of straps) g.scale(1 / bodyScale[0], 1 / bodyScale[1], 1 / bodyScale[2]);
  const geo = mergeGeometries([item, ...straps]);
  geo.computeVertexNormals();
  return geo;
}

// --- geometry builders ----------------------------------------------------

// A grid of nu × nv vertices: f(i, j) -> { p, c, out? }; `out` hints which
// way the faces point (the winding is flipped if the hints disagree).
function grid(nu, nv, { wrapU = false } = {}, f) {
  const pos = new Float32Array(nu * nv * 3), col = new Float32Array(nu * nv * 3);
  const hints = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const k = i * nv + j, v = f(i, j), c = rgb(v.c);
      pos[k * 3] = v.p.x; pos[k * 3 + 1] = v.p.y; pos[k * 3 + 2] = v.p.z;
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      if (v.out) hints.push([k, v.out]);
    }
  }
  const idx = [];
  const iu = wrapU ? nu : nu - 1;
  for (let i = 0; i < iu; i++) {
    for (let j = 0; j < nv - 1; j++) {
      const a = i * nv + j, b = ((i + 1) % nu) * nv + j, c = ((i + 1) % nu) * nv + j + 1, d = i * nv + j + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return orient(geo, hints);
}
function orient(geo, hints) {
  if (!hints.length) return geo;
  const n = geo.attributes.normal;
  let vote = 0;
  for (const [k, out] of hints) vote += n.getX(k) * out.x + n.getY(k) * out.y + n.getZ(k) * out.z;
  if (vote < 0) {
    const ix = geo.index.array;
    for (let t = 0; t < ix.length; t += 3) { const s = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = s; }
    geo.computeVertexNormals();
  }
  return geo;
}
function paint(geo, colour) {
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = rgb(typeof colour === 'function' ? colour(p.getX(i), p.getY(i), p.getZ(i)) : colour);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// The rounded box with half sizes h = [hx, hy, hz] and corner radius r: a
// segmented box whose every point is carried onto the rounded surface.
// rbPoint(q, h, r, off) is the same projection for any point q on (or
// outside) the plain box, `off` further out along the surface normal.
function rbPoint(q, h, r, off = 0) {
  const inner = new THREE.Vector3(
    Math.max(-(h[0] - r), Math.min(h[0] - r, q.x)),
    Math.max(-(h[1] - r), Math.min(h[1] - r, q.y)),
    Math.max(-(h[2] - r), Math.min(h[2] - r, q.z)));
  const n = q.clone().sub(inner);
  if (n.lengthSq() < 1e-14) n.set(0, 1, 0);
  n.normalize();
  return [inner.addScaledVector(n, r + off), n];
}
function roundedBox(h, r, segs, colour) {
  let geo = new THREE.BoxGeometry(2 * h[0], 2 * h[1], 2 * h[2], ...segs);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  const p = geo.attributes.position, q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const [v] = rbPoint(q.fromBufferAttribute(p, i), h, r);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  paint(geo, colour);
  geo.computeVertexNormals();
  return geo;
}

// A lathe round `axis` from `base`: rows [t, r, colour] (t along the axis).
function lathe(rows, sides, base, axis) {
  const a = axis.clone().normalize();
  const u = new THREE.Vector3().crossVectors(a, Math.abs(a.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const w = new THREE.Vector3().crossVectors(a, u);
  return grid(sides, rows.length, { wrapU: true }, (i, j) => {
    const th = (i / sides) * Math.PI * 2, [t, r, c] = rows[j];
    const out = u.clone().multiplyScalar(Math.cos(th)).addScaledVector(w, Math.sin(th));
    return { p: base.clone().addScaledVector(a, t).addScaledVector(out, r), c, out: r > 1e-4 ? out : null };
  });
}

// A thin wedge (a fin): triangle a, b, c, `thick` through, along `n`.
function fin(a, b, c, n, thick, hex) {
  const h = n.clone().normalize().multiplyScalar(thick / 2);
  const P = [a, b, c].flatMap((v) => [v.clone().add(h), v.clone().sub(h)]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.flatMap((v) => [v.x, v.y, v.z])), 3));
  // faces: top (0 2 4), bottom (1 5 3), sides
  geo.setIndex([0, 2, 4, 1, 5, 3, 0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 0, 0, 5, 1]);
  paint(geo, hex);
  geo.computeVertexNormals();
  return orient(geo, [[0, h]]);
}

// --- straps ---------------------------------------------------------------

// The surface direction at body-local direction height uz and angle phi from
// the top (toward +x): u = (r sin phi, r cos phi, uz), r = sqrt(1 - uz²).
const ringDir = (uz, phi) => { const r = Math.sqrt(1 - uz * uz); return new THREE.Vector3(r * Math.sin(phi), r * Math.cos(phi), uz); };
// Where a cape's cloth ends round the flank at height uz (its edge, a = 1),
// the shorter of the standing and the sitting cloth.
function capeEdge(uz) {
  return Math.min(...[CAPE, CAPE_SIT].map((C) => {
    const s = Math.min(1, Math.max(0, (uz - C.zFront) / (C.zBackSide - C.zFront)));
    return s < 0.5 ? C.wrapFront + (C.wrapMid - C.wrapFront) * smooth(0, 0.5, s) : C.wrapMid + (C.wrapBack - C.wrapMid) * smooth(0.5, 1, s);
  }));
}
// The strap's path (the brief): from the pack's front corner `from` (body-
// scaled frame) forward to (uz STRAP.uz, phi STRAP.from), then down round the
// front of the shoulder at that height to phi STRAP.to — over a cape, ending
// just above its hem.
export const STRAP = Object.freeze({ uz: -0.45, from: 0.5, to: 2.3, out: 0.004, width: 0.016, thick: 0.004, hemGap: 0.1 });
function strap(from, side, cover, bodyScale, steps) {
  const fl = new THREE.Vector3(from.x / bodyScale[0], from.y / bodyScale[1], from.z / bodyScale[2]);
  const u0 = new THREE.Vector3(...torsoUnitAt(fl.toArray()));
  const uz0 = u0.z, phi0 = Math.atan2(Math.abs(u0.x), u0.y);
  const to = cover === 'cape' ? Math.min(STRAP.to, capeEdge(STRAP.uz) - STRAP.hemGap) : STRAP.to;
  // one smooth curve in (uz, phi): a cubic from the corner, heading forward,
  // turning onto the ring at uz STRAP.uz by phi STRAP.from, then round it
  const Q = [[uz0, phi0], [STRAP.uz, phi0], [STRAP.uz, STRAP.from], [STRAP.uz, to]];
  const path = [];
  for (let k = 0; k <= steps; k++) {
    const f = k / steps, g = 1 - f;
    const w = [g * g * g, 3 * g * g * f, 3 * g * f * f, f * f * f];
    path.push([0, 1].map((c) => w.reduce((a, wk, q) => a + wk * Q[q][c], 0)));
  }
  const C = [], N = [];
  for (const [uz, phi] of path) {
    const u = ringDir(uz, side * phi);
    const P = coverScaled(u, cover, bodyScale);
    // the normal there, by finite differences on the surface
    const e = 1e-3;
    const A = coverScaled(ringDir(uz, side * (phi + e)), cover, bodyScale).sub(P);
    const B = coverScaled(ringDir(Math.min(0.999, uz + e), side * phi), cover, bodyScale).sub(P);
    const n = new THREE.Vector3().crossVectors(A, B).normalize();
    if (n.dot(P) < 0) n.negate();
    C.push(P); N.push(n);
  }
  // a flat band: four corners (±width/2 across, ±thick/2 through) round
  // each centre STRAP.out off the surface; the last section pinched shut.
  const n = C.length;
  return grid(n, 5, {}, (i, j) => {
    const a = C[Math.max(0, i - 1)], b = C[Math.min(n - 1, i + 1)];
    const t = b.clone().sub(a).normalize();
    const nn = N[i].clone().addScaledVector(t, -N[i].dot(t)).normalize();
    const bn = new THREE.Vector3().crossVectors(t, nn).normalize();
    const end = i === n - 1 ? 0.25 : 1;
    const corner = [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]][j];
    const p = C[i].clone().addScaledVector(nn, STRAP.out + corner[1] * (STRAP.thick / 2) * end)
      .addScaledVector(bn, corner[0] * (STRAP.width / 2) * end);
    const out = nn.clone().multiplyScalar(corner[1]).addScaledVector(bn, corner[0]).normalize();
    return { p, c: STRAP_GREY, out };
  });
}

// --- the backpack ---------------------------------------------------------

// A soft rounded pack (half sizes, corner radius) bent to the back's curve
// (y -= x² / bend), centred over the unit direction `dir` (mid-back, behind
// the shoulder blades toward the middle, where the walk camera sees it; fix
// round 1 made it 1.35× the brief's 16 cm and moved it back from z 0.05, `k`
// scales its small parts); a darker flap over the top front half with a yellow
// buckle; a small pocket on the tail end; two grey straps.
export const PACK = Object.freeze({ dir: [0, 0.94, 0.18], size: [0.216, 0.115, 0.175], r: 0.04, bend: 0.5, puff: 0.016, belly: 0.07, k: 1.35 });
function backpack({ bodyScale, cover, simple, fx }) {
  const h = [PACK.size[0] / 2 * fx, PACK.size[1] / 2, PACK.size[2] / 2], K = PACK.k;
  const lift = h[1];   // the item frame's origin is on the surface; the pack stands on it
  const body = roundedBox(h, PACK.r, simple ? [4, 2, 3] : [7, 4, 6], (x, y, z) => (y < -h[1] + 0.012 * K ? shade(PACK_BLUE, 0.85) : PACK_BLUE));
  body.translate(0, lift, 0);
  // the flap: over the top's front half and down the front face, 3 mm off it,
  // its edges tucked onto the pack; the tongue longer in the middle
  const [fi, fj] = simple ? [5, 6] : [8, 9];
  const fw = h[0] - 0.008 * K, frontRows = Math.round(fj * 0.35);
  const tongue = (x) => (0.012 - 0.03 * (x / fw) ** 2) * K;
  const flap = grid(fi, fj, {}, (i, j) => {
    const x = -fw + (2 * fw * i) / (fi - 1);
    let q;
    if (j < frontRows) q = new THREE.Vector3(x, -0.006 + ((h[1] + 0.006) * j) / frontRows, -h[2] - 0.01);
    else q = new THREE.Vector3(x, h[1] + 0.01, -h[2] + ((tongue(x) + h[2]) * (j - frontRows)) / (fj - 1 - frontRows));
    const edge = i === 0 || i === fi - 1 || j === 0 || j === fj - 1;
    const [p, n] = rbPoint(q, h, PACK.r, edge ? 0.0012 : 0.0032);
    return { p: p.add(new THREE.Vector3(0, lift, 0)), c: j === fj - 1 ? shade(PACK_FLAP, 0.85) : PACK_FLAP, out: n };
  });
  const buckle = paint(new THREE.BoxGeometry(0.022 * K, 0.008 * K, 0.016 * K), PACK_BUCKLE);
  buckle.deleteAttribute('uv');
  buckle.translate(0, lift + h[1] + 0.006 * K, tongue(0) - 0.006 * K);
  // the pocket on the tail end, its top edge (the zip) in the flap's colour
  const ph = [Math.min(0.05 * K, h[0] - 0.02 * K), 0.022 * K, 0.014 * K];
  const pocket = roundedBox(ph, 0.01 * K, simple ? [2, 1, 1] : [4, 2, 2], (x, y) => (y > ph[1] - 0.006 * K ? PACK_FLAP : shade(PACK_BLUE, 1.06)));
  pocket.translate(0, lift - 0.01 * K, h[2] + ph[2] - 0.006 * K);
  const parts = [body, flap, buckle, pocket];
  // soft: the top domes up to PACK.puff in the middle and the sides belly out
  // (x × 1 + PACK.belly at mid-height); then the whole pack bends to the back
  const free = (v, hv) => Math.max(0, 1 - (v / hv) ** 2);
  for (const g of parts) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i) - lift, z = p.getZ(i);
      const dome = y > 0 ? PACK.puff * free(x, h[0]) * free(z, h[2]) * (y / h[1]) : 0;
      const nx = x * (1 + PACK.belly * free(z, h[2] + 0.01 * K) * free(y, h[1] + 0.01 * K));
      p.setXYZ(i, nx, y + lift + dome - nx ** 2 / PACK.bend, z);
    }
    g.computeVertexNormals();
  }
  const pack = mergeGeometries(parts);
  const anchor = seatedAnchor(pack, PACK.dir, cover, bodyScale, SEAT);
  const m = frameOf(anchor);
  // the straps start under the pack's front corners (its front edge)
  const corners = [-1, 1].map((side) => {
    const x = side * (h[0] - 0.02 * K);
    return new THREE.Vector3(x, lift - h[1] + 0.006 - x * x / PACK.bend, -h[2] + 0.015 * K).applyMatrix4(m);
  });
  const straps = corners.map((c, k) => strap(c, k ? 1 : -1, cover, bodyScale, simple ? 10 : 18));
  return [withStraps(placeOnBack(pack, anchor, bodyScale), straps, bodyScale)];
}

// --- the jetpack ----------------------------------------------------------

// A rounded back plate on the back over `dir`; two capsule tanks along the
// spine either side (x ±tankX, radius tankR, length tankL), silver, red nose
// cones toward the head; at the tail end two dark nozzle bells and orange
// flame cones pointing back and down; small red fins; straps like the pack's.
// Built at the brief's sizes and scaled by `k` (fix round 1: 1.2×, and moved
// back from z 0.1, so the walk camera sees it past the head).
export const JETPACK = Object.freeze({ dir: [0, 0.94, 0.17], k: 1.2, plate: [0.15, 0.025, 0.17], plateR: 0.011, tankX: 0.055, tankR: 0.04, tankL: 0.2, flameDir: [0, -0.32, 1] });
function jetpack({ bodyScale, cover, simple, fx }) {
  const J = JETPACK;
  const h = [J.plate[0] / 2 * fx, J.plate[1] / 2, J.plate[2] / 2];
  const plate = roundedBox(h, J.plateR, simple ? [3, 1, 3] : [5, 2, 5], (x, y) => (y > 0 ? shade(JETPACK_DARK, 1.25) : JETPACK_DARK));
  plate.translate(0, h[1], 0);
  const sides = simple ? 8 : 10;
  const parts = [plate];
  const R = J.tankR, L = J.tankL, ty = 2 * h[1] + R - 0.006;
  const S = JETPACK_SILVER, RED = JETPACK_RED, D = JETPACK_DARK;
  const tankRows = simple
    ? [[-L / 2, 0, RED], [-L / 2 + 0.03, R * 0.72, RED], [-L / 2 + 0.055, R, RED], [-L / 2 + 0.058, R, S], [0.03, R, S], [0.03, R * 1.08, RED], [0.045, R * 1.08, RED], [0.045, R, S], [L / 2 - 0.025, R * 0.92, S], [L / 2, 0, S]]
    : [[-L / 2, 0, RED], [-L / 2 + 0.012, R * 0.42, RED], [-L / 2 + 0.03, R * 0.74, RED], [-L / 2 + 0.048, R * 0.94, RED], [-L / 2 + 0.056, R, RED],
      [-L / 2 + 0.058, R * 1.06, D], [-L / 2 + 0.066, R * 1.06, D], [-L / 2 + 0.068, R, S], [0.03, R, S], [0.03, R * 1.08, RED], [0.045, R * 1.08, RED],
      [0.045, R, S], [L / 2 - 0.03, R * 0.96, S], [L / 2 - 0.012, R * 0.72, S], [L / 2, 0, S]];
  const flameDir = new THREE.Vector3(...J.flameDir).normalize();
  const coneSides = simple ? 6 : 8;
  for (const side of [-1, 1]) {
    const cx = side * J.tankX * fx;
    parts.push(lathe(tankRows, sides, new THREE.Vector3(cx, ty, 0), new THREE.Vector3(0, 0, 1)));
    // the nozzle bell under the tank's back end, opening back and down, and the flame from it
    const nb = new THREE.Vector3(cx, ty - R * 0.4, L / 2 - 0.018);
    parts.push(lathe(simple
      ? [[0, 0.015, D], [0.04, 0.027, D], [0.038, 0.019, shade(D, 0.6)], [0.03, 0, shade(D, 0.6)]]
      : [[0, 0.015, D], [0.016, 0.017, D], [0.032, 0.023, D], [0.04, 0.027, shade(D, 1.25)], [0.038, 0.02, shade(D, 0.6)], [0.03, 0, shade(D, 0.6)]], coneSides, nb, flameDir));
    parts.push(lathe(simple
      ? [[0.034, 0.019, JETPACK_FLAME], [0.07, 0.012, JETPACK_FLAME], [0.105, 0, FLAME_TIP]]
      : [[0.034, 0.019, JETPACK_FLAME], [0.052, 0.017, JETPACK_FLAME], [0.072, 0.011, mix(JETPACK_FLAME, FLAME_TIP, 0.5)], [0.092, 0.005, FLAME_TIP], [0.105, 0, FLAME_TIP]], coneSides, nb, flameDir));
    // a small red fin on the tank's outer side at the back
    const fy = ty + 0.004;
    parts.push(fin(new THREE.Vector3(cx + side * R * 0.9, fy, 0.02), new THREE.Vector3(cx + side * R * 0.9, fy, 0.085),
      new THREE.Vector3(cx + side * (R + 0.03), fy - 0.012, 0.095), new THREE.Vector3(0, 1, 0), 0.005, RED));
  }
  const pack = mergeGeometries(parts).scale(J.k, J.k, J.k);
  const anchor = seatedAnchor(pack, J.dir, cover, bodyScale, SEAT);
  const m = frameOf(anchor);
  const corners = [-1, 1].map((side) => {
    const x = side * (h[0] - 0.015) * J.k;
    return new THREE.Vector3(x, 0.004 * J.k, (-h[2] + 0.012) * J.k).applyMatrix4(m);
  });
  const straps = corners.map((c, k) => strap(c, k ? 1 : -1, cover, bodyScale, simple ? 10 : 16));
  return [withStraps(placeOnBack(pack, anchor, bodyScale), straps, bodyScale)];
}

// --- the wings ------------------------------------------------------------

// Butterfly wings: per side a forewing and a smaller hindwing, each a fan
// grid from the root (spokes × rings) in the wing's own plane, which faces
// the tail (the walk camera sees their faces). A spoke at angle psi goes out
// sideways and up (psi 0 straight out, pi/2 straight up); its length is the
// outline R(t) through `shape` [t, R/len] (t 0 the lowest spoke .. 1 the
// highest). The forewing is raised (psi from..to round ~45°, the wing ~40°
// off the back), the hindwing below it, nearly level, `layer` behind it
// (toward the tail), and both are cupped (z += cup·r², tips toward the tail).
// The plane is then leaned back `lean` (its top toward the tail) and turned
// `sweep` (its outer edge toward the tail), and the root seated on the back
// at the withers. The flutter turns each wing about its in-plane upright
// (the hinge), so the wings swing open and shut without dipping into the back.
// Fix round 1: 1.5× the brief's sizes (forewing 0.34), so from behind they
// spread wider than the body and show beside the head. Each wing hangs under
// a pivot (body child, scale 1 / bodyScale), so it lives in the body-SCALED
// frame and its flutter and sit stand are true rotations, not sheared by the
// torso's non-uniform scale.
export const WINGS = Object.freeze({
  dir: [0.12, 0.97, -0.1], lean: 0.44, sweep: 0.3, cup: 0.1, layer: 0.006, band: 0.82,
  fore: { len: 0.34, from: 0.22, to: 1.38, shape: [[0, 0.6], [0.35, 0.95], [0.6, 1], [0.85, 0.82], [1, 0.58]] },
  hind: { len: 0.24, from: -0.28, to: 0.42, shape: [[0, 0.68], [0.4, 1], [0.75, 0.92], [1, 0.62]] },
});
function outline(shape, t) {
  for (let k = 1; k < shape.length; k++) {
    if (t <= shape[k][0]) {
      const [t0, r0] = shape[k - 1], [t1, r1] = shape[k];
      return r0 + (r1 - r0) * smooth(0, 1, (t - t0) / (t1 - t0));
    }
  }
  return shape[shape.length - 1][1];
}
function wingPanel(W, { body, spots }, side, simple, layer) {
  const spokes = simple ? 8 : 13, rings = simple ? [0, 0.4, 0.7, 0.86, 1] : [0, 0.3, 0.55, 0.75, 0.88, 1];
  const r0 = 0.012;
  const veinEvery = simple ? 2 : 3;
  return grid(spokes, rings.length, {}, (i, j) => {
    const t = i / (spokes - 1), psi = W.from + (W.to - W.from) * t;
    const R = W.len * outline(W.shape, t), f = rings[j], r = r0 + (R - r0) * f;
    const p = new THREE.Vector3(side * Math.cos(psi) * r, Math.sin(psi) * r, WINGS.cup * r * r + layer);
    let col;
    if (f > WINGS.band) col = WING_PLUM;
    else if (f === 0) col = shade(body, 0.72);
    else {
      col = rgb(body);
      if (f < 0.35) col = mix(shade(body, 0.8), body, f / 0.35);
      if (i % veinEvery === 0 && i > 0 && i < spokes - 1) col = mix(col, WING_PLUM, 0.55);
      if (spots && spots(i, j, spokes, rings.length)) col = WING_SPOT;
    }
    return { p, c: col, out: new THREE.Vector3(0, 0, 1) };
  });
}
// 2-3 white spots near the forewing's tip: on the ring inside the band,
// between veins, on the spokes round the tip (t ~0.6).
const foreSpots = (i, j, spokes, nr) => {
  if (j !== nr - 3) return false;
  const tip = Math.round(0.6 * (spokes - 1));
  return spokes > 8 ? [tip - 2, tip - 1, tip + 1].includes(i) && i % 3 !== 0 : [tip - 1, tip + 1].includes(i) && i % 2 !== 0;
};
function wing(side, { bodyScale, cover, simple }) {
  const fore = wingPanel(WINGS.fore, { body: WING_CORAL, spots: foreSpots }, side, simple, 0);
  const hind = wingPanel(WINGS.hind, { body: WING_SAGE }, side, simple, WINGS.layer);
  const geo = mergeGeometries([fore, hind]);
  // lean the top toward the tail, then turn the outer edge toward the tail
  const turn = new THREE.Matrix4().makeRotationY(-side * WINGS.sweep)
    .multiply(new THREE.Matrix4().makeRotationX(WINGS.lean));
  geo.applyMatrix4(turn);
  const hingeDir = new THREE.Vector3(0, 1, 0).applyMatrix4(turn).normalize();
  const anchor = seatedAnchor(geo, [side * WINGS.dir[0], WINGS.dir[1], WINGS.dir[2]], cover, bodyScale, WING_SEAT);
  const m = frameOf(anchor);
  geo.applyMatrix4(m);   // body-scaled frame (the pivot's)
  // the vertex nearest the surface: the sit stands the wing up about it
  const low = new THREE.Vector3();
  clearance(geo, cover, bodyScale, low);
  const hinge = { point: anchor.at.toArray(), dir: hingeDir.transformDirection(m).toArray(), low: low.toArray() };
  return { geo, hinge };
}

// --- the items ------------------------------------------------------------

function mesh(id, geo, side) {
  const material = litMaterial(0xffffff, { vertexColors: true });
  if (side) material.side = THREE.DoubleSide;
  const m = new THREE.Mesh(geo, material);
  m.userData.backItem = id;
  m.name = `back:${id}`;
  return m;
}

// The objects for a back item, body-local: body.add each. `cover` is the
// outer surface it rests on: 'cape' (either cape), 'shell' (hoodie, raincoat,
// sweater) or 'fur'. The backpack and jetpack are one mesh each. The wings
// are two pivots (userData.wingPivot, scale 1 / bodyScale), each holding one
// wing mesh (userData.wing -1 | 1 and userData.hinge { point, dir, low } in
// the pivot's body-scaled frame, for animator.js's flutter). Every mesh has
// userData.backItem = id.
export function buildBackItem(id, { bodyScale = TORSO.SCALE, cover = 'fur', simple = false } = {}) {
  const fx = bodyScale[0] / TORSO.SCALE[0];
  const opts = { bodyScale, cover, simple, fx };
  if (id === 'backpack') return backpack(opts).map((g) => mesh(id, g));
  if (id === 'jetpack') return jetpack(opts).map((g) => mesh(id, g));
  if (id === 'wings') {
    return [-1, 1].map((side) => {
      const { geo, hinge } = wing(side, opts);
      geo.computeVertexNormals();
      const m = mesh(id, geo, true);
      m.userData.wing = side;
      m.userData.hinge = hinge;
      const pivot = new THREE.Object3D();
      pivot.name = `back:${id}:pivot`;
      pivot.userData.wingPivot = true;
      pivot.scale.set(1 / bodyScale[0], 1 / bodyScale[1], 1 / bodyScale[2]);
      pivot.add(m);
      return pivot;
    });
  }
  return [];
}

// --- the hood ---------------------------------------------------------------

// HOODS THAT LIE ON THE NECK (accessories polish Task 3, 2026-11-03).
//
// The hoodie's and raincoat's hood was a 0.17 ball behind the head (it read as
// Mickey-Mouse ears), a torus "bunch" at the neck under a hat, and it hung on
// the cat group at a head-relative spot, so in the nap it swung out through
// the face. The ruling: the hood is always DOWN, hat or no hat.
//
// It is a soft scoop lying on the coat shell at the withers, just behind the
// head: half an ellipsoidal shell (HOOD.size: wide × tall × deep), cut open by
// a plane whose normal (HOOD.open) faces up and toward the head, so its mouth
// looks forward at the back of the head, with a rolled rim in a darker shade
// of the coat along that mouth, a darker lining inside, and a fold line
// across its back. Its lower half is pressed nearly flat (HOOD.flat) and the
// whole thing is draped on the shell: every vertex keeps its height above the
// surface under it, so it follows the back's curve. The hoodie adds two white
// drawstrings with toggles hanging down the chest. One vertex-coloured mesh,
// hung on the body, so it follows every pose as the coat does.
//
// HOOD: `dir` the unit direction it lies over standing (the brief's
// (0, 0.75, -0.66) is inside the skull on this torso, whose back line is level
// with the head's centre; here the scoop's front is ~1.8 cm behind the
// skull), `napDir` where it slides to (animator.js slideHood), `size` [wide,
// tall, deep], `open` the mouth's normal (sphere space) and `cut` how far
// along it the mouth is cut, `flat` how much the lower half is pressed flat,
// `wrap` and `taper` its bend round the neck and its narrowing toward the
// tail, `thick` the shell, `roll` the rolled rim's radius, `fold` where the
// fold line crosses (0 the crown's end .. 1 the mouth), the shades of rim,
// lining and fold; `slide`, `still`, `tuck` and `steps` for slideHood and
// buildHood.
export const HOOD = Object.freeze({
  dir: [0, 0.93, -0.36], napDir: [0, 0.99, 0.12], slide: 0.07, still: 0.005, tuck: 0.1, steps: 4, size: [0.24, 0.05, 0.15], open: [0, 0.3, -0.95], cut: 0.05, flat: 0.12, wrap: 3, taper: 0.35,
  thick: 0.012, roll: 0.009, fold: 0.6, rimShade: 0.72, liningShade: 0.55, foldShade: 0.68,
});
export const DRAWSTRING_WHITE = 0xf4f4f0;
// The drawstrings: down the chest from unit-direction height top to bottom
// (`run`), `x` either side of the midline, `out` off the shell; a cord of
// radius `r` and a toggle (half length `tl`, radius `tr`) at its end. They
// hang low on the chest, below where the chin comes down in the sit, the
// stalk and the nap.
export const DRAWSTRING = Object.freeze({ x: 0.075, run: [-0.36, -0.74], out: 0.005, r: 0.0035, tl: 0.013, tr: 0.0075 });

// The hood's scoop in its item frame (x side, y out of the back, z toward the
// tail), before it is draped: a grid wrapping round the mouth (u) from the
// outer pole, over the outer shell to the mouth, over the rolled rim, and down
// the lining to the inner pole (v).
function hoodScoop(color, simple) {
  const [W, H, D] = HOOD.size, A = W / 2, C = D / 2, t = HOOD.thick;
  const n = new THREE.Vector3(...HOOD.open).normalize();
  const e1 = new THREE.Vector3(1, 0, 0), e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
  const psiMax = Math.acos(-HOOD.cut);
  const flat = (y, floor) => (y >= 0 ? y : y * HOOD.flat) + floor;
  // a point on the unit sphere's cap (psi from the pole -n), onto the
  // ellipsoid with half axes ax, the lower half pressed flat
  const onShell = (psi, th, ax, floor) => {
    const s = n.clone().multiplyScalar(-Math.cos(psi))
      .addScaledVector(e1, Math.cos(th) * Math.sin(psi)).addScaledVector(e2, Math.sin(th) * Math.sin(psi));
    return new THREE.Vector3(s.x * ax[0], flat(s.y * ax[1], floor), s.z * ax[2]);
  };
  const outer = [A, H, C], inner = [A - t, H - t, C - t];
  const outerRows = simple ? [0, 0.4, 0.7, 1] : [0, 0.22, 0.42, 0.6, 0.66, 0.72, 0.86, 1];
  const innerRows = simple ? [1, 0.6, 0] : [1, 0.75, 0.45, 0];
  const rollSteps = simple ? 3 : 5;
  const sides = simple ? 10 : 16;
  // the mouth's outward normal in the item frame (the plane's normal through
  // the ellipsoid map), for the roll
  const m = new THREE.Vector3(n.x / A, n.y / H, n.z / C).normalize();
  const rim = shade(color, HOOD.rimShade), lining = shade(color, HOOD.liningShade), fold = shade(color, HOOD.foldShade);
  const rows = [];
  for (const f of outerRows) rows.push({ kind: 'outer', f });
  for (let k = 0; k <= rollSteps; k++) rows.push({ kind: 'roll', f: k / rollSteps });
  for (const f of innerRows) rows.push({ kind: 'inner', f });
  return grid(sides, rows.length, { wrapU: true }, (i, j) => {
    const th = (i / sides) * Math.PI * 2, row = rows[j];
    if (row.kind === 'outer') {
      const p = onShell(psiMax * row.f, th, outer, 0);
      const isFold = !simple && Math.abs(row.f - HOOD.fold) < 0.04;
      if (isFold) p.y *= 0.9;   // the crease dips in a little
      return { p, c: isFold ? fold : color, out: p.clone().sub(new THREE.Vector3(0, H * 0.3, 0)) };
    }
    if (row.kind === 'inner') {
      const p = onShell(psiMax * row.f, th, inner, t * 0.6);
      return { p, c: lining };
    }
    // the roll: half a turn over the lip from the outer shell's edge to the lining's
    const po = onShell(psiMax, th, outer, 0), pi = onShell(psiMax, th, inner, t * 0.6);
    const c = po.clone().add(pi).multiplyScalar(0.5);
    const r = po.clone().sub(pi), g = r.length() / 2;
    r.normalize();
    const up = m.clone().addScaledVector(r, -m.dot(r)).normalize();
    const b = row.f * Math.PI, rr = Math.max(g, HOOD.roll);
    return { p: c.addScaledVector(r, Math.cos(b) * rr).addScaledVector(up, Math.sin(b) * rr), c: rim };
  });
}

// Lay item-frame geometry on the cover round an anchor: each vertex keeps its
// height (y) above the surface point under it (x, z on the anchor's tangent
// plane), plus `gap`, along the anchor's normal. Body-scaled frame.
function drape(geo, anchor, cover, bodyScale, gap) {
  const f = frameOf(anchor), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
  f.extractBasis(X, Y, Z);
  const p = geo.attributes.position, q = new THREE.Vector3(), u = [0, 0, 0], S = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    q.copy(anchor.at).addScaledVector(X, p.getX(i)).addScaledVector(Z, p.getZ(i));
    torsoUnitAt([q.x / bodyScale[0], q.y / bodyScale[1], q.z / bodyScale[2]], u);
    coverLocal(u[0], u[1], u[2], cover, S).multiply(_v3(bodyScale));
    // the surface point under q along the anchor's normal: S is on the ray
    // from the centre; step along Y to the plane through S
    S.addScaledVector(Y, p.getY(i) + gap);
    p.setXYZ(i, S.x, S.y, S.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// A drawstring hanging down the chest: a thin cord on the shell from `top` to
// `bottom` (unit-direction heights) at side x, and a toggle at its end.
function drawstring(side, [top, bottom], bodyScale, simple) {
  const S = DRAWSTRING, steps = simple ? 4 : 7, sides = simple ? 4 : 5;
  const C = [];
  for (let k = 0; k <= steps; k++) {
    const uy = top + (bottom - top) * (k / steps);
    const a = backAnchor([side * S.x, uy, -1], { bodyScale, cover: 'shell' }, S.out + S.r);
    C.push(a);
  }
  const cord = grid(C.length, sides + 1, {}, (i, j) => {
    const a = C[i], tg = C[Math.min(C.length - 1, i + 1)].at.clone().sub(C[Math.max(0, i - 1)].at).normalize();
    const nn = a.n.clone().addScaledVector(tg, -a.n.dot(tg)).normalize(), bn = new THREE.Vector3().crossVectors(tg, nn);
    const th = (j / sides) * Math.PI * 2, out = nn.clone().multiplyScalar(Math.cos(th)).addScaledVector(bn, Math.sin(th));
    return { p: a.at.clone().addScaledVector(out, S.r), c: DRAWSTRING_WHITE, out };
  });
  const end = C[C.length - 1], prev = C[C.length - 2];
  const dir = end.at.clone().sub(prev.at).normalize();
  const base = end.at.clone().addScaledVector(end.n, S.tr - S.r);
  const toggle = lathe([[0, 0, shade(DRAWSTRING_WHITE, 0.82)], [0.002, S.tr * 0.8, shade(DRAWSTRING_WHITE, 0.82)], [S.tl * 0.5, S.tr, shade(DRAWSTRING_WHITE, 0.9)],
    [S.tl * 1.5, S.tr, shade(DRAWSTRING_WHITE, 0.9)], [2 * S.tl - 0.002, S.tr * 0.8, shade(DRAWSTRING_WHITE, 0.82)], [2 * S.tl, 0, shade(DRAWSTRING_WHITE, 0.82)]], simple ? 5 : 6, base, dir);
  return [cord, toggle];
}

// The hood's geometry, body-local: its scoop over `dir` and the drawstrings,
// if any.
export function hoodGeometry(color, { bodyScale = TORSO.SCALE, simple = false, drawstrings = false, dir = HOOD.dir, flat = 1 } = {}) {
  const scoop = hoodScoop(color, simple);
  // pressed flat, the scoop's underside sits at y >= -flat·H; lift it onto 0
  let low = Infinity;
  const p = scoop.attributes.position;
  for (let i = 0; i < p.count; i++) low = Math.min(low, p.getY(i));
  scoop.translate(0, -low, 0);
  if (flat !== 1) scoop.scale(1, flat, 1);
  // the crown narrows toward the tail (x × 1 - taper at its end) and the
  // sides come forward round the back of the neck (z -= wrap·x²)
  const C = HOOD.size[2] / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * (1 - HOOD.taper * smooth(0, C, p.getZ(i)));
    p.setX(i, x);
    p.setZ(i, p.getZ(i) - HOOD.wrap * x * x);
  }
  drape(scoop, backAnchor(dir, { bodyScale, cover: 'shell' }), 'shell', bodyScale, SEAT);
  const parts = [scoop];
  if (drawstrings) for (const side of [-1, 1]) parts.push(...drawstring(side, DRAWSTRING.run, bodyScale, simple));
  const geo = mergeGeometries(parts);
  geo.scale(1 / bodyScale[0], 1 / bodyScale[1], 1 / bodyScale[2]);
  geo.computeVertexNormals();
  return geo;
}

// The hood (and, for the hoodie, its drawstrings): ONE vertex-coloured mesh,
// body-local, userData.hood = true; body.add it. When the head comes back
// over the shoulders (the cross cat's drawn-back chin, the pounce, the nap's
// head laid on the front of the back) it would sink into the hood, so the
// hood slides back along the back with it, from where it lies standing
// (HOOD.dir) to where it lies in the nap (HOOD.napDir; the drawstrings stay
// where they hang). One straight morph from end to end would cut a chord
// through the curved back (~28° of it) and sag into the coat partway, so the
// slide is HOOD.steps morph targets (relative), each the hood draped at
// slide s = k / steps along the way (its dir lerped from dir to napDir), and
// slideHoodTo(mesh, s) blends the two neighbours of s: the chord between
// neighbours is short enough to stay on the coat. animator.js slideHood
// sets s from how much nearer the hood the head has come (HOOD.slide).
// With a back item on (`tuck`), the spot it slides to is under the backpack
// or jetpack, behind the wings' roots, so as it slides it is also pressed
// flat (height × 1 → HOOD.tuck), tucked under the pack like a patch of coat.
export function buildHood(color, { bodyScale = TORSO.SCALE, simple = false, drawstrings = false, tuck = false } = {}) {
  const opts = { bodyScale, simple, drawstrings };
  const geo = hoodGeometry(color, { ...opts, dir: HOOD.dir });
  const a = geo.attributes.position.array, targets = [];
  const d0 = new THREE.Vector3(...HOOD.dir).normalize(), d1 = new THREE.Vector3(...HOOD.napDir).normalize();
  for (let k = 1; k <= HOOD.steps; k++) {
    const f = k / HOOD.steps;
    const dir = d0.clone().lerp(d1, f).normalize().toArray();
    const at = hoodGeometry(color, { ...opts, dir, flat: tuck ? 1 + (HOOD.tuck - 1) * f : 1 });
    const b = at.attributes.position.array, d = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) d[i] = b[i] - a[i];
    at.dispose();
    targets.push(new THREE.BufferAttribute(d, 3));
  }
  geo.morphAttributes.position = targets;
  geo.morphTargetsRelative = true;
  const m = new THREE.Mesh(geo, litMaterial(0xffffff, { vertexColors: true }));
  m.userData.hood = true;
  m.userData.hoodSlide = 0;
  // the standing hood's spot, body-scaled frame (animator.js slideHood)
  m.userData.hoodRef = backAnchor(HOOD.dir, { bodyScale, cover: 'shell' }).at.toArray();
  m.name = 'hood';
  return m;
}

// Slide the hood to s (0 standing .. 1 the nap's spot): blend the morph
// targets either side of s (target j lies at s = (j + 1) / steps; s = 0 is
// the geometry itself). Allocates nothing.
export function slideHoodTo(mesh, s) {
  const w = mesh.morphTargetInfluences, n = w.length;
  const x = Math.min(1, Math.max(0, s)) * n, k = Math.min(n - 1, Math.floor(x)), f = x - k;
  w.fill(0);
  if (k > 0) w[k - 1] = 1 - f;
  w[k] = f;
  mesh.userData.hoodSlide = s;
}
