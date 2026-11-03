import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import { SKULL } from './torso.js';

// HATS THAT SIT ON THE HEAD (accessories polish Task 1, 2026-11-03).
//
// The owner: "Many of the hats float above the cat's ears". The old hats were
// primitives parked at a fixed height — brims at head-local y 0.23 and crowns
// and beads at 0.24, over a skull whose top is 0.193 — so every one hovered
// 4-5 cm over the head with daylight under it. Each hat here is ONE
// vertex-coloured mesh in head-local space (add it straight to the head),
// built ON the skull ellipsoid: a brim or band is draped over the skull's own
// surface a few millimetres out, so its lowest rim touches the head all the
// way round. The ears are left where they are and poke through brims and
// bands, which reads as ear holes.
//
// Hagrid still wears the old prize head items (model.js addPrizeHead); only
// the cat's head slot builds these.

export const HAT_IDS = ['crown', 'tophat', 'beanie', 'wizard', 'partycrown', 'leafcrown', 'candlehat'];

// Palette. The three shop hats' colours are model.js's own (it imports these
// for Hagrid's hats); the prize colours are the same hexes as model.js's
// PRIZE_* rows.
export const HAT_BLACK = 0x1c1c22;
export const BEANIE_COLOR = 0xd6602f;
export const WIZARD_COLOR = 0x4a3b8c;
const HAT_BAND = 0xd8303c;
const STAR_GOLD = 0xf2c14e;          // model.js CAPE_ACCENT, the old wizard star
const PRIZE_GOLD = 0xf5c518;
const PRIZE_RIBBON = 0xe0405a;
const PRIZE_TEAL = 0x4ec9d4;
const PRIZE_LEAF = [0x3f9e4d, 0x6cc070, 0x2f7d3e];
const TWIG = 0x6b4a2a;
const PRIZE_CAKE = 0xf2a0c0;
const CAKE_JAM = 0xd8607e;
const PRIZE_FROSTING = 0xfff4e0;
const PRIZE_FLAME = 0xffb02e;
const FLAME_TIP = 0xfff2a0;
const ELASTIC = 0xf7d8e4;
const POMPOM = 0xf5f5f5;
const FLOWERS = [[0xf2a0c0, 0xf2c14e], [0xf2e04e, 0xe0862e], [0xffffff, 0xf2c14e]]; // [petal, centre]

// The skull ellipsoid (model.js buildCat: ball(SKULL.R) scaled by SKULL.SCALE).
const SA = SKULL.R * SKULL.SCALE[0];
const SB = SKULL.R * SKULL.SCALE[1];
const SC = SKULL.R * SKULL.SCALE[2];

const colourCache = new Map();
function rgb(hex) {
  if (hex instanceof THREE.Color) return hex;
  let c = colourCache.get(hex);
  if (!c) { c = new THREE.Color(hex); colourCache.set(hex, c); }
  return c;
}
const mix = (a, b, t) => rgb(a).clone().lerp(rgb(b), t);
const shade = (hex, k) => rgb(hex).clone().multiplyScalar(k);

// --- the skull ------------------------------------------------------------

const skullRho = (x, y, z) => Math.hypot(x / SA, y / SB, z / SC);
function skullNormal(p) {
  return new THREE.Vector3(p.x / (SA * SA), p.y / (SB * SB), p.z / (SC * SC)).normalize();
}
// The skull's height over (x, z) (0 off the skull).
const skullY = (x, z) => SB * Math.sqrt(Math.max(0, 1 - (x / SA) ** 2 - (z / SC) ** 2));
// A point near the skull carried radially onto it, then `d` out along the
// surface normal there. Returns [point, normal].
function drape(q, d = 0) {
  const r = skullRho(q.x, q.y, q.z);
  const p = q.clone().divideScalar(r);
  const n = skullNormal(p);
  return [p.addScaledVector(n, d), n];
}
// The skull's ring at height y: azimuth phi 0 is the front (-z), +pi/2 is +x.
function ringPoint(phi, y) {
  const s = Math.sqrt(Math.max(0, 1 - (y / SB) ** 2));
  return new THREE.Vector3(SA * s * Math.sin(phi), y, -SC * s * Math.cos(phi));
}
// The surface direction up the skull (toward the crown) at a point.
function upSkull(p, n) {
  return new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
}

// --- geometry builders ----------------------------------------------------

// A grid of nu × nv vertices: f(i, j) -> { p: Vector3, c: colour, out?: Vector3 }.
// `out` hints which way that vertex's face should point; the winding is
// flipped if the hints disagree with it. Indexed, with position/normal/color.
function grid(nu, nv, { wrapU = false, wrapV = false } = {}, f) {
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
  const iu = wrapU ? nu : nu - 1, jv = wrapV ? nv : nv - 1;
  for (let i = 0; i < iu; i++) {
    for (let j = 0; j < jv; j++) {
      const a = i * nv + j, b = ((i + 1) % nu) * nv + j;
      const c = ((i + 1) % nu) * nv + ((j + 1) % nv), d = i * nv + ((j + 1) % nv);
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
  if (vote < 0) flip(geo);
  return geo;
}
function flip(geo) {
  const ix = geo.index.array;
  for (let t = 0; t < ix.length; t += 3) { const s = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = s; }
  geo.index.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// The same surface facing the other way (separate vertices, so each side
// keeps its own normals): a thin band that is seen from inside and out.
function backFace(geo) {
  const g = geo.clone();
  g.index = geo.index.clone();
  return flip(g);
}

// A tube through `centres` (Vector3[]), its section turned by `normals` (the
// skull normal under each centre): radius(i, a) and colour(i, a) per vertex.
function tube(centres, normals, { closed = false, sides, radius, colour }) {
  const n = centres.length;
  const T = [], N = [], Bn = [];
  for (let i = 0; i < n; i++) {
    const a = centres[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = centres[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const t = b.clone().sub(a).normalize();
    const bn = new THREE.Vector3().crossVectors(t, normals[i]).normalize();
    T.push(t); Bn.push(bn); N.push(new THREE.Vector3().crossVectors(bn, t).normalize());
  }
  return grid(n, sides, { wrapU: closed, wrapV: true }, (i, j) => {
    const a = (j / sides) * Math.PI * 2;
    const dir = N[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(Bn[i], Math.sin(a));
    return { p: centres[i].clone().addScaledVector(dir, radius(i, a)), c: colour(i, a), out: dir };
  });
}

// A small ball (any part with no seam to hide): SphereGeometry, its uv
// dropped, scaled, placed, and painted colour(y) by its unit-sphere height.
function blob(r, w, h, at, scale, colour, shape) {
  const geo = new THREE.SphereGeometry(r, w, h);
  geo.deleteAttribute('uv');
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const uy = p.getY(i) / r;
    if (shape) { const v = shape(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, v[0], v[1], v[2]); }
    const c = rgb(typeof colour === 'function' ? colour(uy) : colour);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.scale(...scale);
  geo.translate(at.x, at.y, at.z);
  geo.computeVertexNormals();
  return geo;
}

// A flat five-pointed star at `at`, facing `n`, `up` its first point, with a
// slight dome front and back (12 vertices: two centres and the rim twice).
function star(outer, inner, depth, at, n, up, hex) {
  const x = new THREE.Vector3().crossVectors(up, n).normalize();
  const y = new THREE.Vector3().crossVectors(n, x).normalize();
  const pts = [];
  const c = rgb(hex), back = shade(hex, 0.7);
  const push = (v, cc) => { pts.push([v, cc]); return pts.length - 1; };
  const front = push(at.clone().addScaledVector(n, depth), c);
  const rear = push(at.clone().addScaledVector(n, -depth * 0.5), back);
  const rimF = [], rimB = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer, a = (i / 10) * Math.PI * 2;
    const v = at.clone().addScaledVector(y, Math.cos(a) * r).addScaledVector(x, Math.sin(a) * r);
    rimF.push(push(v, c)); rimB.push(push(v.clone(), back));
  }
  const idx = [];
  for (let i = 0; i < 10; i++) {
    const j = (i + 1) % 10;
    idx.push(front, rimF[i], rimF[j], rear, rimB[j], rimB[i]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts.flatMap(([v]) => [v.x, v.y, v.z])), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pts.flatMap(([, cc]) => [cc.r, cc.g, cc.b])), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return orient(geo, [[front, n]]);
}

// A brim draped on the skull round (cx, cz): profile rows { r, d, c, out }
// (radius from the centre, distance off the skull, colour, +1 for a row whose
// face points away from the head). `wave(theta, f)` adds to d (f = 0 inner
// edge .. 1 outer edge): a floppy brim.
function drapedBrim(cx, cz, profile, segs, wave = () => 0) {
  return grid(segs, profile.length, { wrapU: true }, (i, j) => {
    const th = (i / segs) * Math.PI * 2, row = profile[j];
    const f = (row.r - profile[0].r) / (profile[profile.length - 1].r - profile[0].r || 1);
    const x = cx + Math.sin(th) * row.r, z = cz - Math.cos(th) * row.r;
    const [p, n] = drape(new THREE.Vector3(x, skullY(x, z), z), row.d + wave(th, Math.max(0, Math.min(1, f))));
    return { p, c: row.c, out: row.out ? n : null };
  });
}

// A lathe in a hat frame: rows [r, h, colour], turned round `axis` at `base`
// (the frame's x and z complete it). map(v) may bend the frame-local point.
function frameLathe(rows, segs, frame, map = (v) => v) {
  return grid(segs, rows.length, { wrapU: true }, (i, j) => {
    const th = (i / segs) * Math.PI * 2, [r, h, c] = rows[j];
    const local = map(new THREE.Vector3(Math.sin(th) * r, h, -Math.cos(th) * r));
    const p = frame.at(local);
    const out = r > 0.002 ? p.clone().sub(frame.at(map(new THREE.Vector3(0, h, 0)))) : null;
    return { p, c, out };
  });
}
function hatFrame(base, up) {
  const y = up.clone().normalize();
  const x = new THREE.Vector3(1, 0, 0).addScaledVector(y, -y.x).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize(); // +z: toward the back
  return { base, x, y, z, at: (v) => base.clone().addScaledVector(x, v.x).addScaledVector(y, v.y).addScaledVector(z, v.z) };
}

function finish(id, parts) {
  const geo = mergeGeometries(parts);
  const mesh = new THREE.Mesh(geo, litMaterial(0xffffff, { vertexColors: true }));
  mesh.userData.hat = id;
  mesh.name = `hat:${id}`;
  return mesh;
}

// --- the hats -------------------------------------------------------------

// Top hat: a black crown with a red band on a brim draped over the dome, set
// back 2 cm and tipped 0.12 rad to the cat's left (+x) — jaunty.
const TOPHAT = { at: [0.02, 0.02], tip: 0.12, brimIn: 0.06, brimR: 0.12, crownR: 0.075, crownH: 0.13 };
function tophat(simple) {
  const segs = simple ? 12 : 24;
  const [cx, cz] = TOPHAT.at, R = TOPHAT.brimR;
  const brim = drapedBrim(cx, cz, [
    { r: TOPHAT.brimIn, d: 0.003, c: HAT_BLACK },
    { r: R, d: 0.003, c: HAT_BLACK },
    { r: R + 0.004, d: 0.007, c: HAT_BLACK, out: 1 },
    { r: R, d: 0.011, c: HAT_BLACK, out: 1 },
    { r: TOPHAT.brimIn, d: 0.014, c: HAT_BLACK, out: 1 },
  ], segs);
  const base = new THREE.Vector3(cx, skullY(cx, cz), cz);
  const frame = hatFrame(base, new THREE.Vector3(Math.sin(TOPHAT.tip), Math.cos(TOPHAT.tip), 0));
  const r = TOPHAT.crownR, H = TOPHAT.crownH;
  const crown = frameLathe([
    [r - 0.002, 0.004, HAT_BLACK],
    [r, 0.014, HAT_BLACK],
    [r + 0.002, 0.014, HAT_BAND],
    [r + 0.003, 0.025, HAT_BAND],
    [r + 0.003, 0.038, HAT_BAND],
    [r + 0.001, 0.038, HAT_BLACK],
    [r + 0.004, H - 0.006, HAT_BLACK],
    [r + 0.001, H, HAT_BLACK],
    [0.001, H + 0.002, HAT_BLACK],
  ], segs, frame);
  return finish('tophat', [brim, crown]);
}

// Wizard hat: a floppy draped brim, a cone whose upper part bends back and
// droops, a gold band and gold stars.
const WIZARD = { at: [0, 0.01], brimIn: 0.075, brimR: 0.14, coneR: 0.09, coneL: 0.26, bendFrom: 0.08, bend: 3.0, bendPow: 1.0, base: -0.006 };
function wizardSpine(steps = 120) {
  // spine samples [s, y, z, angle] along the cone's length, bending toward +z
  const out = [[0, 0, 0, 0]];
  let y = 0, z = 0;
  const ds = WIZARD.coneL / steps;
  for (let i = 1; i <= steps; i++) {
    const s = i * ds, f = Math.max(0, (s - WIZARD.bendFrom) / (WIZARD.coneL - WIZARD.bendFrom));
    const a = WIZARD.bend * f ** WIZARD.bendPow;
    y += Math.cos(a) * ds; z += Math.sin(a) * ds;
    out.push([s, y, z, a]);
  }
  return out;
}
function wizard(simple) {
  const segs = simple ? 12 : 24;
  const [cx, cz] = WIZARD.at, R = WIZARD.brimR;
  const wave = (th, f) => 0.004 * f * f * (1 + Math.cos(3 * th + 0.6)) / 2;
  const brim = drapedBrim(cx, cz, [
    { r: WIZARD.brimIn, d: 0.003, c: WIZARD_COLOR },
    { r: R, d: 0.003, c: WIZARD_COLOR },
    { r: R + 0.004, d: 0.007, c: WIZARD_COLOR, out: 1 },
    { r: R, d: 0.011, c: WIZARD_COLOR, out: 1 },
    { r: WIZARD.brimIn, d: 0.013, c: WIZARD_COLOR, out: 1 },
  ], segs, wave);
  const base = new THREE.Vector3(cx, skullY(cx, cz) + WIZARD.base, cz);
  const frame = hatFrame(base, new THREE.Vector3(0, 1, 0));
  const spine = wizardSpine();
  const at = (s) => spine[Math.min(spine.length - 1, Math.round((s / WIZARD.coneL) * (spine.length - 1)))];
  const bendMap = (v) => {
    const [, y, z, a] = at(v.y);
    return new THREE.Vector3(v.x, y - v.z * Math.sin(a), z + v.z * Math.cos(a));
  };
  const L = WIZARD.coneL, r0 = WIZARD.coneR;
  const coneR = (s) => r0 * (1 - s / L) ** 0.85 + 0.003;
  const n = simple ? 6 : 10;
  const rows = [[coneR(0) - 0.003, 0, WIZARD_COLOR], [coneR(0.006) + 0.003, 0.006, STAR_GOLD], [coneR(0.026) + 0.003, 0.026, STAR_GOLD], [coneR(0.026), 0.026, WIZARD_COLOR]];
  for (let k = 1; k <= n; k++) {
    const s = 0.026 + ((L - 0.026) * k) / n;
    rows.push([k === n ? 0.001 : coneR(s), s, WIZARD_COLOR]);
  }
  const cone = frameLathe(rows, segs, frame, bendMap);
  // stars on the cone, each lying on its surface
  const parts = [brim, cone];
  for (const [s, az, size] of [[0.075, 0, 0.024], [0.13, 0.95, 0.015], [0.05, -1.25, 0.016]]) {
    const r = coneR(s);
    const p = frame.at(bendMap(new THREE.Vector3(Math.sin(az) * r, s, -Math.cos(az) * r)));
    const c = frame.at(bendMap(new THREE.Vector3(0, s, 0)));
    const nrm = p.clone().sub(c).normalize();
    const up = frame.at(bendMap(new THREE.Vector3(0, s + 0.01, 0))).sub(c).normalize();
    parts.push(star(size, size * 0.45, 0.003, p.addScaledVector(nrm, 0.0015), nrm, up, STAR_GOLD));
  }
  return finish('wizard', parts);
}

// Beanie: a knit cap hugging the skull (its radii × 1.06), down to y 0.09 at
// the brow and 0.02 at the nape, a rolled ribbed cuff round its rim and a
// white pompom on top.
const BEANIE = { shell: 1.06, rimFront: 0.09, rimBack: 0.02, cuffH: 0.036, cuffOut: 0.022, pompom: 0.034 };
const beanieRim = (phi) => (BEANIE.rimFront + BEANIE.rimBack) / 2 + ((BEANIE.rimFront - BEANIE.rimBack) / 2) * Math.cos(phi);
function beanie(simple) {
  const segs = simple ? 12 : 24, rows = simple ? 5 : 7;
  const knitDark = shade(BEANIE_COLOR, 0.86);
  const shell = grid(segs, rows, { wrapU: true }, (i, j) => {
    const phi = (i / segs) * Math.PI * 2;
    // the rim row tucks into the middle of the cuff
    const yRim = beanieRim(phi) + BEANIE.cuffH * 0.5;
    const thRim = Math.acos(Math.min(1, yRim / SB));
    const th = (j / (rows - 1)) * thRim;
    const u = new THREE.Vector3(Math.sin(th) * Math.sin(phi), Math.cos(th), -Math.sin(th) * Math.cos(phi));
    const p = new THREE.Vector3(u.x * SA, u.y * SB, u.z * SC).multiplyScalar(BEANIE.shell);
    return { p, c: i % 2 ? knitDark : BEANIE_COLOR, out: u };
  });
  // the cuff: a rolled band, flat on the skull underneath and fattest near
  // its top, so its lower edge lies on the head; ribbed by alternating
  // fat/thin, light/dark columns
  const cuffSegs = simple ? 24 : 36, sides = 6;
  const cuffDark = shade(BEANIE_COLOR, 0.72), cuffLight = shade(BEANIE_COLOR, 0.88);
  const cuff = grid(cuffSegs, sides, { wrapU: true, wrapV: true }, (i, j) => {
    const phi = (i / cuffSegs) * Math.PI * 2;
    const p0 = ringPoint(phi, beanieRim(phi));
    const n = skullNormal(p0), t = upSkull(p0, n);
    const a = (j / sides) * Math.PI * 2;
    const rib = i % 2 ? 1.12 : 0.88;
    const v = (BEANIE.cuffH / 2) * (1 - Math.cos(a));
    const d = 0.003 + (Math.sin(a) > 0 ? BEANIE.cuffOut * rib * Math.sin(a) * (1 - Math.cos(a)) / 2 : 0);
    const p = p0.clone().addScaledVector(n, d).addScaledVector(t, v);
    return { p, c: i % 2 ? cuffLight : cuffDark, out: Math.sin(a) > 0.1 ? n : null };
  });
  const top = SB * BEANIE.shell;
  const r = BEANIE.pompom;
  // a yarn ball: lumpy, a little squashed onto the cap
  const pom = blob(r, simple ? 6 : 8, simple ? 4 : 6, new THREE.Vector3(0, top + r * 0.75, 0), [1, 0.9, 1],
    (uy) => mix(POMPOM, 0xd8d8d8, Math.max(0, -uy) * 0.6),
    (x, y, z) => { const k = 1 + 0.12 * Math.sin(9 * x / r) * Math.sin(7 * z / r + 1) * Math.cos(5 * y / r); return [x * k, y * k, z * k]; });
  return finish('beanie', [shell, cuff, pom]);
}

// A band round the head on the skull, at height bandY(phi): front 0.12, back
// 0.15 — above the brow, under the ears' tips.
const BAND = { front: 0.12, back: 0.15 };
const bandY = (phi) => (BAND.front + BAND.back) / 2 - ((BAND.back - BAND.front) / 2) * Math.cos(phi);
function bandRing(segs, out) {
  const centres = [], normals = [];
  for (let i = 0; i < segs; i++) {
    const phi = (i / segs) * Math.PI * 2;
    const p = ringPoint(phi, bandY(phi)), n = skullNormal(p);
    centres.push(p.addScaledVector(n, out)); normals.push(n);
  }
  return { centres, normals };
}

// One flower lying on the skull at azimuth phi on the band: five petals (each
// a low lens) round a domed centre, facing out of the head.
function flower(phi, [petalHex, centreHex], size, simple) {
  const [c, n] = drape(ringPoint(phi, bandY(phi) + 0.004), 0);
  const up = upSkull(c, n);
  const side = new THREE.Vector3().crossVectors(up, n).normalize();
  const parts = [];
  const rim = simple ? 4 : 6;
  const petalDark = shade(petalHex, 0.85);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + phi * 0.7;
    const dir = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
    const across = new THREE.Vector3().crossVectors(n, dir);
    const mid = c.clone().addScaledVector(dir, size * 0.55);
    // a lens: rim on the skull at 7 mm, crest at 10 mm; the rim's points
    // round the petal's outline, each draped so the petal follows the head
    const pos = [], cols = [], idx = [];
    const [crest] = drape(mid, 0.0105);
    pos.push(crest); cols.push(rgb(petalHex));
    for (let m = 0; m < rim; m++) {
      const b = (m / rim) * Math.PI * 2;
      const q = mid.clone().addScaledVector(dir, Math.cos(b) * size * 0.5).addScaledVector(across, Math.sin(b) * size * 0.3);
      const [pq] = drape(q, 0.0068);
      pos.push(pq); cols.push(Math.cos(b) < -0.3 ? petalDark : rgb(petalHex));
    }
    for (let m = 0; m < rim; m++) idx.push(0, 1 + m, 1 + ((m + 1) % rim));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos.flatMap((v) => [v.x, v.y, v.z])), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols.flatMap((cc) => [cc.r, cc.g, cc.b])), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(orient(g, [[0, n]]));
  }
  const [cc] = drape(c, 0.009);
  const centre = blob(size * 0.32, simple ? 4 : 5, simple ? 2 : 3, new THREE.Vector3(), [1, 0.55, 1], centreHex);
  // turn the squashed ball to face out of the head
  centre.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
  centre.translate(cc.x, cc.y, cc.z);
  parts.push(centre);
  return parts;
}

// Flower Crown: a twisted green vine round the head on the skull, seven
// flowers along it: five across the brow and two behind, either side of the
// nape, where the walk camera sees them — none in the ears.
const FLOWER_AT = [0, 0.6, -0.6, 1.07, -1.07, 2.55, -2.55];
function crown(simple) {
  const segs = simple ? 16 : 28, sides = simple ? 4 : 5, tubeR = 0.0072;
  const { centres, normals } = bandRing(segs, 0.0068);
  const twists = 14;
  const vine = tube(centres, normals, {
    closed: true, sides,
    radius: (i, a) => tubeR * (1 + 0.18 * Math.cos(2 * (a + (twists * i * Math.PI * 2) / segs))),
    colour: (i, a) => (Math.cos(2 * (a + (twists * i * Math.PI * 2) / segs)) > 0 ? PRIZE_LEAF[0] : PRIZE_LEAF[2]),
  });
  const parts = [vine];
  FLOWER_AT.forEach((phi, k) => parts.push(...flower(phi, FLOWERS[k % 3], 0.05, simple)));
  return finish('crown', parts);
}

// Party Crown: one gold band, its bottom edge on the skull ring at y 0.14,
// its top zig-zagging up into five points 8 cm tall, flared a little outward;
// seen from inside too (both windings). A jewel on each point and one on the
// band's front.
const PARTY = { y: 0.14, tilt: 0, tip: 0.08, valley: 0.034, flare: 0.22, points: 5 };
function partycrown(simple) {
  const per = simple ? 4 : 6, cols = PARTY.points * per;
  const rowsV = simple ? [0, 0.35, 1] : [0, 0.15, 0.4, 0.7, 1];
  const ringY = (phi) => PARTY.y - PARTY.tilt * Math.cos(phi);
  const topH = (i) => {
    const f = (i % per) / per; // 0 at a point, 0.5 at a valley
    const tri = Math.abs(1 - 2 * f);
    return PARTY.valley + (PARTY.tip - PARTY.valley) * tri;
  };
  const gold = rgb(PRIZE_GOLD), goldDark = shade(PRIZE_GOLD, 0.78);
  const bandAt = (i, h) => {
    const phi = (i / cols) * Math.PI * 2;
    const p = ringPoint(phi, ringY(phi)), n = skullNormal(p);
    const radial = new THREE.Vector3(Math.sin(phi), 0, -Math.cos(phi));
    return { p: p.addScaledVector(n, 0.003).addScaledVector(radial, PARTY.flare * h).add(new THREE.Vector3(0, h, 0)), radial };
  };
  const outer = grid(cols, rowsV.length, { wrapU: true }, (i, j) => {
    const h = rowsV[j] * topH(i), { p, radial } = bandAt(i, h);
    return { p, c: mix(goldDark, gold, Math.min(1, h / 0.03)), out: radial };
  });
  const parts = [outer, backFace(outer)];
  const jr = simple ? [4, 3] : [6, 4];
  for (let k = 0; k < PARTY.points; k++) {
    const i = k * per, { p, radial } = bandAt(i, PARTY.tip - 0.016);
    parts.push(blob(0.011, ...jr, p.addScaledVector(radial, 0.006), [1, 1, 1], k % 2 ? PRIZE_TEAL : PRIZE_RIBBON));
  }
  const { p, radial } = bandAt(0, 0.016);
  parts.push(blob(0.013, ...jr, p.addScaledVector(radial, 0.007), [1, 1, 0.7], PRIZE_TEAL));
  return finish('partycrown', parts);
}

// Leaf Crown: laurel. A brown twig round the head on the skull, and fourteen
// pointed leaves lying on it in two overlapping rows, seven a side, their tips
// swept back toward a gap at the nape.
const LAUREL = { perSide: 7, from: 0.06, step: 0.36, len: 0.074, width: 0.03, rowOff: 0.003, slant: 0.42 };
function leaf(phi, side, row, hex, simple) {
  const [c0, n0] = drape(ringPoint(phi, bandY(phi)), 0);
  const up = upSkull(c0, n0);
  // the band's direction toward the back on this side
  const back = new THREE.Vector3().crossVectors(n0, up).multiplyScalar(-side).normalize();
  const dir = back.clone().multiplyScalar(Math.cos(LAUREL.slant)).addScaledVector(up, row * Math.sin(LAUREL.slant)).normalize();
  const across = new THREE.Vector3().crossVectors(n0, dir).normalize();
  // the stem on the twig, the leaf running back from it
  const mid = c0.clone().addScaledVector(up, row * LAUREL.rowOff).addScaledVector(dir, LAUREL.len * 0.5);
  const nu = simple ? 4 : 6, lift = row > 0 ? 0.002 : 0;
  const light = shade(hex, 1.12), dark = shade(hex, 0.82);
  return grid(nu, 3, {}, (i, j) => {
    const u = (i / (nu - 1)) * 2 - 1;        // -1 stem .. 1 tip
    const w = j - 1;                          // -1, 0 (midrib), 1
    const half = (LAUREL.width / 2) * Math.max(0, 1 - u * u) ** 0.8 * (1 - 0.25 * u);
    const q = mid.clone().addScaledVector(dir, (u * LAUREL.len) / 2).addScaledVector(across, w * half);
    const [p, n] = drape(q, (w === 0 ? 0.0075 : 0.004) + lift);
    return { p, c: w === 0 ? light : (w > 0 ? hex : dark), out: n };
  });
}
function leafcrown(simple) {
  const segs = simple ? 14 : 28, sides = simple ? 4 : 5;
  const { centres, normals } = bandRing(segs, 0.006);
  const twig = tube(centres, normals, {
    closed: true, sides, radius: () => 0.0048,
    colour: (i, a) => (Math.cos(a) > 0 ? TWIG : shade(TWIG, 0.75)),
  });
  const parts = [twig];
  for (const side of [-1, 1]) {
    for (let k = 0; k < LAUREL.perSide; k++) {
      const phi = side * (LAUREL.from + k * LAUREL.step);
      parts.push(leaf(phi, side, k % 2 ? -1 : 1, PRIZE_LEAF[(k + (side > 0 ? 1 : 0)) % 3], simple));
    }
  }
  return finish('leafcrown', parts);
}

// Candle hat: the little birthday cake seated on the crown of the head (its
// bottom follows the dome), pink with a jam layer, white frosting with five
// drips down the side, a striped candle and its flame on top, and a thin
// elastic from the cake down each cheek (in front of the ears) to under the jaw.
const CAKE = { r: 0.056, h: 0.042, frost: 0.012, drips: 5, candleR: 0.0075, candleH: 0.045 };
function candlehat(simple) {
  const parts = [];
  const r = CAKE.r;
  const yBot = skullY(r, 0) + 0.002, yTop = yBot + CAKE.h;
  const cakeSegs = simple ? 10 : 20;
  const cakeRows = [[r - 0.004, yBot, PRIZE_CAKE], [r, yBot + 0.004, PRIZE_CAKE], [r, yBot + 0.017, PRIZE_CAKE], [r + 0.001, yBot + 0.019, CAKE_JAM], [r + 0.001, yBot + 0.025, CAKE_JAM], [r, yBot + 0.027, PRIZE_CAKE], [r, yTop, PRIZE_CAKE]];
  const rows = simple ? [cakeRows[0], cakeRows[1], cakeRows[3], cakeRows[4], cakeRows[6]] : cakeRows;
  // the cake's bottom ring is draped on the dome
  parts.push(grid(cakeSegs, rows.length, { wrapU: true }, (i, j) => {
    const th = (i / cakeSegs) * Math.PI * 2, [rr, y, c] = rows[j];
    const x = Math.sin(th) * rr, z = -Math.cos(th) * rr;
    const yy = j === 0 ? skullY(x, z) + 0.002 : y;
    return { p: new THREE.Vector3(x, yy, z), c, out: new THREE.Vector3(x, 0, z) };
  }));
  // frosting: a cap with a skirt whose lower edge drips at five places
  const fSegs = simple ? 15 : 30;
  const drip = (th) => 0.004 + 0.02 * Math.max(0, Math.cos(CAKE.drips * th)) ** 3;
  const frostRows = (th) => [
    [r + 0.003, yTop - drip(th)], [r + 0.004, yTop - 0.002], [r + 0.002, yTop + CAKE.frost * 0.7],
    [r - 0.012, yTop + CAKE.frost], [0.001, yTop + CAKE.frost + 0.001],
  ];
  parts.push(grid(fSegs, 5, { wrapU: true }, (i, j) => {
    const th = (i / fSegs) * Math.PI * 2, [rr, y] = frostRows(th)[j];
    const x = Math.sin(th) * rr, z = -Math.cos(th) * rr;
    return { p: new THREE.Vector3(x, y, z), c: PRIZE_FROSTING, out: j < 3 ? new THREE.Vector3(x, 0, z) : new THREE.Vector3(0, 1, 0) };
  }));
  // the candle: spiral stripes, its top capped
  const cSegs = simple ? 6 : 8, cRows = simple ? 3 : 5, cy = yTop + CAKE.frost - 0.002;
  parts.push(grid(cSegs, cRows + 1, { wrapU: true }, (i, j) => {
    const th = (i / cSegs) * Math.PI * 2;
    const top = j === cRows, h = top ? CAKE.candleH : (j / (cRows - 1)) * CAKE.candleH;
    const rr = top ? 0.0005 : CAKE.candleR;
    const stripe = Math.cos(th + (h / CAKE.candleH) * Math.PI * 4) > 0;
    return { p: new THREE.Vector3(Math.sin(th) * rr, cy + h, -Math.cos(th) * rr), c: stripe ? PRIZE_TEAL : 0xffffff, out: top ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(Math.sin(th), 0, -Math.cos(th)) };
  }));
  // the flame: a teardrop, gold at the wick, pale at its tip
  const fr = 0.0115;
  parts.push(blob(fr, simple ? 5 : 6, simple ? 4 : 5, new THREE.Vector3(0, cy + CAKE.candleH + fr * 1.1, 0), [0.85, 1.6, 0.85],
    (uy) => mix(PRIZE_FLAME, FLAME_TIP, Math.max(0, uy)),
    (x, y, z) => { const k = y > 0 ? 1 - 0.6 * (y / fr) : 1; return [x * k, y, z * k]; }));
  // the elastic: one loop from the cake's right side, down the cheek, under
  // the jaw and up the other cheek, on the fur
  const n = simple ? 20 : 36, b0 = 0.22;
  const centres = [], normals = [];
  for (let k = 0; k < n; k++) {
    const b = b0 + ((2 * Math.PI - 2 * b0) * k) / (n - 1);
    const sb = Math.sin(b);
    const [p, nn] = drape(new THREE.Vector3(sb * SA, Math.cos(b) * SB, -0.6 * Math.abs(sb) * SC), 0.004);
    centres.push(p); normals.push(nn);
  }
  parts.push(tube(centres, normals, { sides: 3, radius: () => 0.0026, colour: () => ELASTIC }));
  return finish('candlehat', parts);
}

const BUILD = { crown, tophat, beanie, wizard, partycrown, leafcrown, candlehat };

export function buildHat(id, { simple = false } = {}) {
  const make = Object.hasOwn(BUILD, id ?? '') ? BUILD[id] : null;
  return make ? make(simple) : null;
}

// for tests / tuning
export const HAT_SHAPES = Object.freeze({ TOPHAT, WIZARD, BEANIE, BAND, PARTY, LAUREL, CAKE });
