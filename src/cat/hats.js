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

export const HAT_IDS = ['crown', 'tophat', 'beanie', 'wizard', 'partycrown', 'leafcrown', 'candlehat', 'papercrown', 'acorncap',
  'paperboycap', 'buckethat', 'sailorcap', 'strawhat', 'stripedboater', 'starfishclip', 'featherplume', 'partyhat', 'birthdayhat', 'tradercap', 'keepercap', 'gardenerhat', 'crystalcirclet'];

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
    return { p, c: typeof row.c === 'function' ? row.c(i, j) : row.c, out: row.out ? n : null };
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
// back 2 cm and 2 cm off-centre toward +x, and tipped 0.12 rad the same way —
// jaunty, worn a little to one side.
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

// THE WREATH (polish-crown, 2026-11-06). The flower and leaf crowns used to
// ride a band round the head at the brow (front 0.12): on the home stage,
// whose camera looks down on a sitting cat, and at phone size the band and
// its leaves lay across the brow and the tops of the eyes and read as green
// goggles. They now sit ON TOP of the head like a wreath: a ring draped on the
// skull round (0, cz), WREATH.rx across (between the ears) and rz long, so its
// front is high on the forehead (y ~0.17, the eyes top out at 0.071) and its
// back tips down behind the ears, as a laurel is worn.
const WREATH = { cz: 0.03, rx: 0.07, rz: 0.125 };
// The skull point under the wreath at parameter a (0 front, +pi/2 the +x side,
// pi the back), `out` along the skull normal there. Returns [point, normal].
function wreathAt(a, out = 0) {
  const x = WREATH.rx * Math.sin(a), z = WREATH.cz - WREATH.rz * Math.cos(a);
  return drape(new THREE.Vector3(x, skullY(x, z), z), out);
}
// Even spacing along the ring: s in [0, 1) of the way round (0 the front,
// increasing toward +x) to the parameter a (a table of the draped ring's length).
const WREATH_ARC = (() => {
  const N = 720, len = [0];
  let prev = wreathAt(0)[0];
  for (let i = 1; i <= N; i++) {
    const p = wreathAt((i / N) * Math.PI * 2)[0];
    len.push(len[i - 1] + p.distanceTo(prev)); prev = p;
  }
  return { N, len, total: len[N] };
})();
function wreathParam(s) {
  const { N, len, total } = WREATH_ARC;
  const want = (((s % 1) + 1) % 1) * total;
  let lo = 0, hi = N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (len[m] <= want) lo = m; else hi = m; }
  const f = (want - len[lo]) / (len[hi] - len[lo] || 1);
  return ((lo + f) / N) * Math.PI * 2;
}
// A frame on the ring at s: the point, the skull normal, the ring's direction
// of travel (toward +x at the front) and `inward` (across the ring, toward its
// middle on top of the head).
function wreathFrame(s, out = 0) {
  const a = wreathParam(s);
  const [p, n] = wreathAt(a, out);
  const t = wreathAt(a + 1e-3, out)[0].sub(wreathAt(a - 1e-3, out)[0]);
  t.addScaledVector(n, -t.dot(n)).normalize();
  const inward = new THREE.Vector3().crossVectors(n, t).normalize();
  const mid = new THREE.Vector3(0, p.y, WREATH.cz);
  if (inward.dot(mid.sub(p)) < 0) inward.negate();
  return { p, n, t, inward };
}
function wreathRing(segs, out) {
  const centres = [], normals = [];
  for (let i = 0; i < segs; i++) {
    const { p, n } = wreathFrame(i / segs, out);
    centres.push(p); normals.push(n);
  }
  return { centres, normals };
}

// One flower lying on the skull at s of the way round the wreath: five petals
// (each a low lens) round a domed centre, facing out of the head.
// polish-startpad: `tilt` (radians) turns the whole flower outward about the
// ring's direction, pivoting near its outer edge (which stays on the skull)
// so its inner edge rests up on the vine: from side-on it shows its face.
function flower(s, [petalHex, centreHex], size, simple, tilt = 0) {
  const { p: c, n, inward: up } = wreathFrame(s);
  const phi = s * Math.PI * 2;
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
      // polish-catlight: the petal tips cup up, so a flower lying on top of
      // the head still has some height from exactly side-on
      // (a petal pointing forward lifts less: it must not reach toward the face)
      const [pq] = drape(q, 0.0068 + FLOWER_CUP * Math.max(0, Math.cos(b)) * (dir.z < 0 ? 0.4 : 1));
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
  if (tilt) {
    // the turn that takes n toward the outside of the ring (-up)
    let q = new THREE.Quaternion().setFromAxisAngle(side, tilt);
    if (n.clone().applyQuaternion(q).dot(up) > 0) q = new THREE.Quaternion().setFromAxisAngle(side, -tilt);
    const pivot = c.clone().addScaledVector(up, -size * FLOWER_PIVOT);
    const m = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    for (const g of parts) g.applyMatrix4(m);
  }
  return parts;
}

// Flower Crown: a twisted green vine round the wreath on top of the head,
// seven flowers along it: five across the front of the crown and two at the
// back, where the walk camera sees them (s: the share of the way round).
const FLOWER_AT = [0, 0.095, -0.095, 0.185, -0.185, 0.4, -0.4];
const FLOWER_SIZE = 0.044;
const FLOWER_CUP = 0.014; // how far a petal's tip lifts off the skull (polish-catlight 0.011; polish-startpad 0.014)
// polish-startpad: the two side flowers (s +-0.185) tilt 25 degrees outward so
// a side view sees a face, not an edge; the rest lie on the skull as before.
const FLOWER_TILT = [0, 0, 0, 0.44, 0.44, 0, 0];
const FLOWER_PIVOT = 0.8; // the tilt's hinge: this share of `size` out from the centre
function crown(simple) {
  const segs = simple ? 16 : 28, sides = simple ? 4 : 5, tubeR = 0.0068;
  const { centres, normals } = wreathRing(segs, 0.0064);
  const twists = 14;
  const vine = tube(centres, normals, {
    closed: true, sides,
    radius: (i, a) => tubeR * (1 + 0.18 * Math.cos(2 * (a + (twists * i * Math.PI * 2) / segs))),
    colour: (i, a) => (Math.cos(2 * (a + (twists * i * Math.PI * 2) / segs)) > 0 ? PRIZE_LEAF[0] : PRIZE_LEAF[2]),
  });
  const parts = [vine];
  FLOWER_AT.forEach((at, k) => parts.push(...flower(at, FLOWERS[k % 3], FLOWER_SIZE, simple, FLOWER_TILT[k])));
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

// Paper Crown (the Fairground's tin-can alley prize, src/fairprizes.js): the
// crown out of a party cracker. One band of thin paper, its bottom edge on
// the skull ring, cut along the top into six points and standing nearly
// straight (paper does not flare like the gold Party Crown); each point a
// different bright colour, a paler fold line round the band. No jewels.
const PAPER = { y: 0.14, tip: 0.07, valley: 0.03, flare: 0.08, points: 6 };
const PAPER_COLORS = [0xe2433a, 0xf7c93b, 0x2f6fc0, 0x4eb86a, 0xf08a2c, 0x9a5cc8];
function papercrown(simple) {
  const per = simple ? 2 : 4, cols = PAPER.points * per;
  const rowsV = simple ? [0, 0.4, 1] : [0, 0.12, 0.4, 0.7, 1];
  const topH = (i) => {
    const f = (i % per) / per; // 0 at a point, 0.5 at a valley
    return PAPER.valley + (PAPER.tip - PAPER.valley) * Math.abs(1 - 2 * f);
  };
  // the colour changes at each valley, so every point is one colour
  const paperAt = (i) => PAPER_COLORS[Math.floor(((i + per / 2) % cols) / per) % PAPER_COLORS.length];
  const bandAt = (i, h) => {
    const phi = (i / cols) * Math.PI * 2;
    const p = ringPoint(phi, PAPER.y), n = skullNormal(p);
    const radial = new THREE.Vector3(Math.sin(phi), 0, -Math.cos(phi));
    return { p: p.addScaledVector(n, 0.003).addScaledVector(radial, PAPER.flare * h).add(new THREE.Vector3(0, h, 0)), radial };
  };
  const outer = grid(cols, rowsV.length, { wrapU: true }, (i, j) => {
    const h = rowsV[j] * topH(i), { p, radial } = bandAt(i, h);
    const paper = paperAt(i);
    return { p, c: j === 1 && !simple ? mix(paper, 0xffffff, 0.35) : rgb(paper), out: radial };
  });
  return finish('papercrown', [outer, backFace(outer)]);
}

// Leaf Crown: laurel. A brown twig round the wreath on top of the head, and
// twenty pointed leaves lying on it in two overlapping rows, ten a side, each
// leaf's stem on the twig and the leaf running back from it toward the nape.
// The inner row lies on the top of the head, the outer row droops outward
// over the twig. (Before polish-crown it rode a band at the brow, front 0.12,
// and its lower leaves came down to the eyes: green goggles on the stage.) The
// leaves run all round: the last pair's stems a short V apart at the back.
// polish-catlight (Pass 10): from exactly side-on the leaves lay flat on the
// skull and the wreath read as a line. Each leaf now curls higher toward its
// tip (curl) and stands its far edge up off the twig (stand), so the wreath has
// a ~2.5 cm profile from the side. Same leaves, same triangles.
const LAUREL = { perSide: 10, from: 0.01, step: 0.0485, len: 0.064, width: 0.028, rowOff: 0.003, slant: 0.42, curl: 0.019, stand: 0.007 };
function leaf(s, side, row, hex, simple) {
  const { p: c0, n: n0, t, inward } = wreathFrame(s);
  // the ring's direction toward the back on this side
  const back = t.clone().multiplyScalar(side);
  const dir = back.clone().multiplyScalar(Math.cos(LAUREL.slant)).addScaledVector(inward, row * Math.sin(LAUREL.slant)).normalize();
  const across = new THREE.Vector3().crossVectors(n0, dir).normalize();
  // the stem on the twig, the leaf running back from it
  const mid = c0.clone().addScaledVector(inward, row * LAUREL.rowOff).addScaledVector(dir, LAUREL.len * 0.5);
  const nu = simple ? 4 : 6, lift = row > 0 ? 0.002 : 0;
  const light = shade(hex, 1.12), dark = shade(hex, 0.82);
  // the leaf's edge away from the twig (toward `inward` for the inner row,
  // away from it for the outer) is the one that stands up
  const far = Math.sign(across.dot(inward)) * row || 1;
  return grid(nu, 3, {}, (i, j) => {
    const u = (i / (nu - 1)) * 2 - 1;        // -1 stem .. 1 tip
    const w = j - 1;                          // -1, 0 (midrib), 1
    const half = (LAUREL.width / 2) * Math.max(0, 1 - u * u) ** 0.8 * (1 - 0.25 * u);
    const q = mid.clone().addScaledVector(dir, (u * LAUREL.len) / 2).addScaledVector(across, w * half);
    // each leaf curls up off the head toward its tip, so the wreath has some
    // height and reads from the front, not only from above
    const curl = LAUREL.curl * ((u + 1) / 2) ** 2;
    const stand = LAUREL.stand * Math.max(0, w * far) * (0.4 + 0.6 * (u + 1) / 2);
    const [p, n] = drape(q, (w === 0 ? 0.0075 : 0.004) + lift + curl + stand);
    return { p, c: w === 0 ? light : (w > 0 ? hex : dark), out: n };
  });
}
function leafcrown(simple) {
  const segs = simple ? 14 : 28, sides = simple ? 4 : 5;
  const { centres, normals } = wreathRing(segs, 0.006);
  const twig = tube(centres, normals, {
    closed: true, sides, radius: () => 0.0052,
    colour: (i, a) => (Math.cos(a) > 0 ? TWIG : shade(TWIG, 0.75)),
  });
  const parts = [twig];
  for (const side of [-1, 1]) {
    for (let k = 0; k < LAUREL.perSide; k++) {
      const at = side * (LAUREL.from + k * LAUREL.step);
      parts.push(leaf(at, side, k % 2 ? -1 : 1, PRIZE_LEAF[(k + (side > 0 ? 1 : 0)) % 3], simple));
    }
  }
  return finish('leafcrown', parts);
}

// Candle hat: the little birthday cake seated on the crown of the head (its
// bottom follows the dome), pink with a jam layer, white frosting with five
// drips down the side, and a striped candle and its flame on top. (The thin
// elastic it had down the cheeks and under the jaw was cut in the final
// review: it read as a wire circle across the face.)
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
  return finish('candlehat', parts);
}

// --- small pieces the found hats share (found outfits beauty pass) -----------

// A flat rosette facing `n` round `at`: `pts` rim points at radius r(a, k)
// (a from `up`, toward up x n), a domed front centre and a flatter back one,
// rim k coloured rim(k); the back a shade darker. 2 * pts triangles.
function rosette(at, n, up, pts, r, rim, centreHex, depth) {
  const x = new THREE.Vector3().crossVectors(up, n).normalize();
  const y = new THREE.Vector3().crossVectors(n, x).normalize();
  const P = [], C = [], idx = [];
  const push = (v, c) => { P.push(v); C.push(rgb(c)); return P.length - 1; };
  const f = push(at.clone().addScaledVector(n, depth), centreHex);
  const b = push(at.clone().addScaledVector(n, -depth * 0.4), shade(centreHex, 0.7));
  const rf = [], rb = [];
  for (let k = 0; k < pts; k++) {
    const a = (k / pts) * Math.PI * 2, rr = r(a, k);
    const v = at.clone().addScaledVector(y, Math.cos(a) * rr).addScaledVector(x, Math.sin(a) * rr);
    rf.push(push(v, rim(k))); rb.push(push(v.clone(), shade(rim(k), 0.72)));
  }
  for (let k = 0; k < pts; k++) { const j = (k + 1) % pts; idx.push(f, rf[k], rf[j], b, rb[j], rb[k]); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.flatMap((v) => [v.x, v.y, v.z])), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C.flatMap((c) => [c.r, c.g, c.b])), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return orient(geo, [[f, n]]);
}

// A ribbon bow at `at` facing out along `n`, `up` its up: two flattened
// loops either side, a knot, two short tails. Blobs, so it is round from
// every side; built along the axes, then turned into place.
function bow(at, n, up, hex, size, simple) {
  const [w, h] = simple ? [5, 3] : [6, 4];
  const parts = [-1, 1].map((s) => blob(size, w, h, new THREE.Vector3(size * 0.2, size * 0.15, s * size * 0.95), [0.38, 0.62, 1.05],
    (uy) => mix(hex, shade(hex, 0.7), Math.max(0, -uy) * 0.8)));
  parts.push(blob(size * 0.42, w - 1, h - 1, new THREE.Vector3(size * 0.35, 0, 0), [0.7, 0.9, 0.9], shade(hex, 0.85)));
  if (!simple) for (const s of [-1, 1]) {
    parts.push(blob(size * 0.5, 4, 3, new THREE.Vector3(size * 0.25, -size * 0.75, s * size * 0.45), [0.3, 1.3, 0.55], shade(hex, 0.92)));
  }
  const z = new THREE.Vector3().crossVectors(n, up).normalize(), y = new THREE.Vector3().crossVectors(z, n).normalize();
  const m = new THREE.Matrix4().makeBasis(n.clone().normalize(), y, z).setPosition(at);
  for (const g of parts) { g.applyMatrix4(m); g.computeVertexNormals(); }
  return parts;
}

// Acorn Cap (found outfits step 1; beauty pass): an acorn's cup worn as a cap.
// A shell on the skull's radii x 1.05 from the crown down to a rim high on the
// brow and lower at the back, knobbly with scales (every other vertex pushed
// out, darker; offset rows of them), paling toward the crown; a rolled lip under the rim (its lower
// edge lies on the head: the seat sweep), a curved stalk tipped toward +x, and
// an autumn oak leaf lying on the cap beside it.
const ACORN = { shell: 1.05, rimFront: 0.113, rimBack: 0.06, lipH: 0.018, stalkR: 0.011, stalkL: 0.05, tilt: 0.35, knob: 0.03 };
const ACORN_CUP = 0x8a5a2b, ACORN_SCALE = 0x6b4220, ACORN_STALK = 0x5a3a1c, ACORN_TOP = 0xb07a45, ACORN_LEAF = [0xe8902a, 0xc4561c, 0xf6c25a];
const acornRim = (phi) => (ACORN.rimFront + ACORN.rimBack) / 2 + ((ACORN.rimFront - ACORN.rimBack) / 2) * Math.cos(phi);
function acorncap(simple) {
  const segs = simple ? 14 : 28, rows = simple ? 6 : 10;
  const shell = grid(segs, rows, { wrapU: true }, (i, j) => {
    const phi = (i / segs) * Math.PI * 2;
    const thRim = Math.acos(Math.min(1, acornRim(phi) / SB));
    const th = (j / (rows - 1)) * thRim;
    const u = new THREE.Vector3(Math.sin(th) * Math.sin(phi), Math.cos(th), -Math.sin(th) * Math.cos(phi));
    // scales: a bump on every other vertex of every other row, the rows offset
    const knob = j % 2 === 1 && j < rows - 1 && (i + (j >> 1)) % 2 === 0;
    const p = new THREE.Vector3(u.x * SA, u.y * SB, u.z * SC).multiplyScalar(ACORN.shell * (knob ? 1 + ACORN.knob : 1));
    const pale = (1 - j / (rows - 1)) ** 2 * 0.55;
    return { p, c: knob ? mix(ACORN_SCALE, ACORN_CUP, pale) : j === rows - 1 ? ACORN_CUP : mix(ACORN_CUP, ACORN_TOP, pale), out: u };
  });
  // the lip: rolled, three rows on the skull; the top meets the shell's rim, the middle bulges (catching the light), the lowest lies 3 mm off the head
  const lip = grid(segs, 3, { wrapU: true }, (i, j) => {
    const phi = (i / segs) * Math.PI * 2;
    const [p, n] = drape(ringPoint(phi, acornRim(phi) - j * ACORN.lipH * 0.5), [0.012, 0.0112, 0.003][j]);
    return { p, c: [ACORN_SCALE, mix(ACORN_CUP, ACORN_TOP, 0.4), shade(ACORN_SCALE, 0.8)][j], out: n };
  });
  // the stalk: from just inside the crown, tipped toward +x and curling further
  const top = SB * ACORN.shell;
  const centres = [0, 0.4, 0.75, 1].map((k) => {
    const a = ACORN.tilt + 0.5 * k * k;
    return new THREE.Vector3(Math.sin(a) * (ACORN.stalkL + 0.006) * k, top - 0.006 + Math.cos(ACORN.tilt) * (ACORN.stalkL + 0.006) * k, 0);
  });
  const normals = centres.map(() => new THREE.Vector3(0, 0, -1));
  const stalk = tube(centres, normals, { sides: simple ? 4 : 6, radius: (i) => ACORN.stalkR * [1, 0.9, 0.85, 0.7][i], colour: (i) => (i === 3 ? mix(ACORN_STALK, ACORN_TOP, 0.5) : ACORN_STALK) });
  return finish('acorncap', [shell, lip, stalk, oakLeaf(simple)]);
}
// An autumn oak leaf lying on the cap, its stem by the stalk, running down
// toward the front right; lobed, its tip curling up, an orange midrib.
function oakLeaf(simple) {
  const nu = simple ? 5 : 9, len = 0.095, width = 0.052;
  const [c0, n0] = drape(new THREE.Vector3(0.006, SB, -0.012), 0);
  const dir = new THREE.Vector3(0.5, 0, -0.87).addScaledVector(n0, 0.87 * n0.z - 0.5 * n0.x).normalize();
  const across = new THREE.Vector3().crossVectors(n0, dir).normalize();
  return grid(nu, 3, {}, (i, j) => {
    const u = i / (nu - 1), w = j - 1;
    const lobes = simple ? 1 : 0.62 + 0.38 * Math.abs(Math.sin(u * Math.PI * 3));
    const half = (width / 2) * Math.sin(Math.PI * Math.min(1, u * 1.08)) ** 0.7 * lobes;
    const q = c0.clone().addScaledVector(dir, 0.01 + u * len).addScaledVector(across, w * half);
    const [p, n] = drape(q, ACORN.shell * SB - SB + 0.007 + (w === 0 ? 0.002 : 0) + 0.016 * u * u);
    return { p, c: w === 0 ? ACORN_LEAF[2] : ACORN_LEAF[(i + (w > 0 ? 1 : 0)) % 2], out: n };
  });
}

// --- found hats with brims (found outfits step 2, lane H; beauty pass) -------
//
// Five hats in the beanie's and the top hat's manner: the crown's bottom ring
// is DRAPED on the skull (3 mm off it), so the lowest rim lies on the head
// all the way round, and a brim is draped from that same ring, so it follows
// the head's curve down to the ears (which poke through, as ear holes). A
// wide brim keeps off the eyes by sitting back on the head (cz > 0): its
// front edge is high on the forehead (the test: lowBrow > eyeTop + 0.015).

// A front-only peak: for th within +-span of the front, a stiff flap that runs
// out from the rim point baseAt(th) along the way the head faces, dropping
// `slope` per unit out, shorter toward its ends. `top` paints the upper face
// by its share of the way out (a stitch line, a shine), with a row of its own
// at each share in `marks`; the underside and the edge are a shade darker.
function frontPeak(baseAt, span, len, slope, hex, n, top = () => hex, marks = []) {
  const dirAt = (th) => new THREE.Vector3(Math.sin(th), 0, -Math.cos(th));
  const rows = [[0, -0.002, -1], [1, -0.002, -1], [1.02, 0.0015, 0], [1, 0.005, 1], ...marks.map((w) => [w, 0.008 - 0.003 * w, 1]), [0, 0.008, 1]];
  return grid(n, rows.length, {}, (i, j) => {
    const th = -span + (2 * span * i) / (n - 1);
    const [w, lift, up] = rows[j];
    const reach = len * Math.max(0, Math.cos((th / span) * Math.PI / 2)) ** 0.6 * w;
    const p = baseAt(th).clone().addScaledVector(dirAt(th), reach).add(new THREE.Vector3(0, lift - slope * reach, 0));
    return { p, c: up > 0 ? top(w, j) : shade(hex, up < 0 ? 0.72 : 0.85), out: up ? new THREE.Vector3(0, up, 0) : dirAt(th) };
  });
}

// The round hats (Bucket Hat, Sailor Cap, Straw Hat, Striped Boater). `spec`:
//   at [cx, cz]   the crown's centre on the head (xz); cz > 0 sits it back
//   crownR        the crown's radius where it meets the skull
//   taper         its radius at the top, as a share of crownR
//   flare         [from, to]: the crown widens to `taper` between these shares
//                 of the wall (default: evenly up it)
//   crownH        how far its top stands above the skull's top
//   crownTop      'round' (a soft dome) or 'flat' (a disc)
//   brimW         the brim's width past the crown (0: none)
//   brimDroop     how much thinner the brim's outer edge is than its inner
//   wall          [[share of the wall, colour], ...] bottom to top: a band is
//                 rows of its colour low on the wall, close rows a crisp edge
//                 (a null colour is the crown's own); wallSimple, the simple
//                 build's
//   cap           [[radius share, colour], ...] a flat top's rings, rim in
//   segs, domeRows a full build's columns (24) and dome rows (3)
//   crown, brim   colours (a function (column, row) -> hex paints a weave)
//   rings         [[share of the brim's width, colour, soft], ...] stitched
//                 rings (soft: one row, a woven band rather than a line); a
//                 colour may be a function of the column
//   edge          the brim's bound edge colour (default: the brim's)
//   wave(th, f)   lifts the brim (f 0 inner edge .. 1 outer edge)
//   peak          { len, slope, span, c, shine } a front peak on the crown's foot
//   extra(parts, kit, simple) adds trims (a badge, a bow, a flower); kit.wallAt(th, f, out)
//                 is [point, outward] on the wall, th 0 the front, +pi/2 the +x side
const STRAW = [0xe3c26b, 0xcfa94e], STRAW_DARK = [0xc9a24a, 0xb08a36], STRAW_PALE = [0xeed28a, 0xdcbc68];
const BRIM_HATS = {
  buckethat: {
    at: [0, 0.02], crownR: 0.12, taper: 0.86, crownH: 0.05, crownTop: 'round', brimW: 0.062, brimDroop: 0.006, segs: 20, domeRows: 2,
    crown: 0xe9c46a, brim: 0xe9c46a,
    wall: [[0, 0x2fa6a0], [0.36, 0x2fa6a0], [0.4, 0xf7f3e8], [0.44, 0x2fa6a0], [0.52, 0x2fa6a0], [0.56, 0xe9c46a], [0.76, 0xe9c46a], [0.79, 0xc89b3c], [0.82, 0xe9c46a], [1, 0xe9c46a]],
    wallSimple: [[0, 0x2fa6a0], [0.5, 0x2fa6a0], [0.56, 0xe9c46a], [1, 0xe9c46a]],
    rings: [[0.38, 0xc89b3c], [0.72, 0xc89b3c]],
    extra: (parts, { wallAt }, simple) => {
      // a little pink scallop shell pinned on the band, front left
      const [p, d] = wallAt(-0.55, 0.3, 0.008), n = d.clone().add(new THREE.Vector3(0, 0.3, 0)).normalize();
      parts.push(rosette(p, n, new THREE.Vector3(0, 1, 0), simple ? 7 : 11,
        (a, k) => (Math.cos(a) < -0.8 ? 0.015 : 0.027 * (k % 2 ? 0.86 : 1)), (k) => (k % 2 ? 0xe8735c : 0xf8c0a8), 0xf8c0a8, 0.005));
    },
  },
  // The Gardener's Hat (Greenhouse G4): the Bucket Hat's shape in soft sage canvas, a wide brim, a darker band and a small white daisy.
  gardenerhat: {
    at: [0, 0.02], crownR: 0.115, taper: 0.9, crownH: 0.05, crownTop: 'round', brimW: 0.07, brimDroop: 0.006, segs: 20, domeRows: 2,
    crown: 0xa9c49a, brim: 0xa9c49a, edge: 0x8aa67c,
    wall: [[0, 0x6f8e62], [0.3, 0x6f8e62], [0.34, 0xf3efe0], [0.37, 0x6f8e62], [0.42, 0x6f8e62], [0.46, 0xa9c49a], [1, 0xa9c49a]],
    wallSimple: [[0, 0x6f8e62], [0.42, 0x6f8e62], [0.46, 0xa9c49a], [1, 0xa9c49a]],
    rings: [[0.5, 0x8aa67c, 1]],
    extra: (parts, { wallAt }, simple) => {
      // a small white daisy pinned on the band, front left
      const [at, d] = wallAt(-0.55, 0.3, 0.008), n = d.clone().add(new THREE.Vector3(0, 0.3, 0)).normalize();
      parts.push(rosette(at, n, new THREE.Vector3(0, 1, 0), simple ? 8 : 12, (a, k) => (k % 2 ? 0.01 : 0.022), (k) => (k % 2 ? 0xe8e4d8 : 0xfdfdf5), 0xf2c14e, 0.004));
    },
  },
  sailorcap: {
    at: [0, 0.03], crownR: 0.14, taper: 1.12, flare: [0.45, 1], crownH: 0.05, crownTop: 'flat', brimW: 0, brimDroop: 0,
    crown: 0xf2f2ee,
    wall: [[0, 0x24365c], [0.05, 0x24365c], [0.4, 0x24365c], [0.42, 0xf2c14e], [0.46, 0xf2c14e], [0.48, 0xf2f2ee], [0.85, 0xf2f2ee], [1, 0xe4e4de]],
    wallSimple: [[0, 0x24365c], [0.05, 0x24365c], [0.42, 0x24365c], [0.46, 0xf2c14e], [0.5, 0xf2f2ee], [1, 0xf2f2ee]],
    cap: [[1.0, 0xe4e4de], [0.96, 0xf2f2ee], [0.001, 0xfafaf6]],
    peak: { len: 0.048, slope: 0.2, span: 0.9, c: 0x1c1c22, shine: 0x4a4a58 },
    extra: (parts, { wallAt }, simple) => {
      // a gold anchor on the band's front, a gold button at each end of the peak
      const GOLD = 0xf2c14e;
      for (const th of [-0.85, 0.85]) parts.push(blob(0.0058, 5, 3, wallAt(th, 0.22, 0.002)[0], [1, 1, 1], GOLD));
      const [c, cN] = wallAt(0, 0.22, 0.004), X = new THREE.Vector3(1, 0, 0), U = new THREE.Vector3().crossVectors(cN, X).normalize();
      if (U.y < 0) U.negate();
      const at = (x, y) => c.clone().addScaledVector(X, x).addScaledVector(U, y);
      const a = 0.0125, stroke = (pts, r) => tube(pts, pts.map(() => cN), { sides: 4, radius: () => r, colour: (i, ang) => (Math.cos(ang) > 0 ? GOLD : shade(GOLD, 0.8)) });
      parts.push(stroke([at(0, -a), at(0, a * 0.8)], 0.0024), stroke([at(-a * 0.55, a * 0.42), at(a * 0.55, a * 0.42)], 0.0021));
      const arc = [], m = simple ? 3 : 6;
      for (let k = 0; k <= m; k++) { const t = Math.PI * (0.1 + 0.8 * k / m); arc.push(at(-Math.cos(t) * a * 0.8, -a * 0.3 - Math.sin(t) * a * 0.62)); }
      parts.push(stroke(arc, 0.0021), blob(0.0042, 5, 3, at(0, a * 0.98), [1, 1, 1], GOLD));
    },
  },
  strawhat: {
    at: [0, 0.02], crownR: 0.105, taper: 0.93, crownH: 0.055, crownTop: 'round', brimW: 0.08, brimDroop: 0.003, segs: 20,
    crown: (i, j) => STRAW[(i + j) % 2],
    brim: (i, j) => STRAW[(i + j) % 2],
    wall: [[0, 0xc0392b], [0.34, 0xc0392b], [0.38, null], [1, null]],
    wallSimple: [[0, 0xc0392b], [0.4, 0xc0392b], [0.45, null], [1, null]],
    rings: [0.12, 0.26, 0.4, 0.54, 0.68, 0.82].map((q, k) => [q, (i) => (k % 2 ? STRAW_PALE : STRAW_DARK)[i % 2], 1]),
    edge: 0xb08a36,
    wave: (th, f) => 0.006 * f * f * (1 + Math.cos(4 * th + 0.5)) / 2,
    extra: (parts, { wallAt }, simple) => {
      // a big white daisy tucked in the band, front left
      const [at, d] = wallAt(-0.6, 0.42, 0.009), n = d.clone().add(new THREE.Vector3(0, 0.35, 0)).normalize();
      parts.push(rosette(at, n, new THREE.Vector3(0, 1, 0), simple ? 12 : 20, (a, k) => (k % 2 ? 0.016 : 0.034), (k) => (k % 2 ? 0xe8e4d8 : 0xfdfdf5), 0xf2c14e, 0.003));
      parts.push(blob(0.012, simple ? 5 : 6, 3, at.clone().addScaledVector(n, 0.004), [1, 1, 0.7], (uy) => (uy > 0.3 ? 0xf7c93b : 0xd89a28)));
    },
  },
  stripedboater: {
    at: [0, 0.01], crownR: 0.105, taper: 1, crownH: 0.06, crownTop: 'flat', brimW: 0.055, brimDroop: 0, segs: 20,
    crown: 0xe8cf86, brim: 0xe8cf86, edge: 0xc9a85a,
    wall: [[0, 0xe2433a], [0.2, 0xe2433a], [0.22, 0xf5f5f5], [0.3, 0xf5f5f5], [0.32, 0xe2433a], [0.42, 0xe2433a], [0.44, 0xe8cf86], [0.72, 0xd8bc70], [1, 0xe8cf86]],
    wallSimple: [[0, 0xe2433a], [0.22, 0xf5f5f5], [0.32, 0xe2433a], [0.44, 0xe8cf86], [1, 0xe8cf86]],
    cap: [[1.0, 0xd8bc70], [0.72, 0xe8cf86], [0.45, 0xd8bc70], [0.001, 0xf0dc9a]],
    rings: [[0.55, 0xd8bc70, 1]],
    extra: (parts, { wallAt }, simple) => {
      // a red bow on the band's right side
      const [at, n] = wallAt(Math.PI / 2, 0.27, 0.003);
      parts.push(...bow(at, n, new THREE.Vector3(0, 1, 0), 0xe2433a, 0.021, simple));
    },
  },
};
function brimHat(id, spec, simple) {
  const segs = simple ? 12 : (spec.segs ?? 24);
  const [cx, cz] = spec.at, r0 = spec.crownR, R = r0 + spec.brimW;
  const dome = spec.crownTop === 'round' ? spec.crownH * 0.55 : 0;
  const top = SB + spec.crownH, wallTop = top - dome;
  const paint = (c, i, j) => (typeof c === 'function' ? c(i, j) : c);
  // the crown's foot at angle th: the draped ring
  const footAt = (th) => {
    const x = cx + Math.sin(th) * r0, z = cz - Math.cos(th) * r0;
    return drape(new THREE.Vector3(x, skullY(x, z), z), 0.003)[0];
  };
  const [f0, f1] = spec.flare ?? [0, 1];
  const grow = (f) => { const t = Math.min(1, Math.max(0, (f - f0) / (f1 - f0))); return spec.flare ? t * t * (3 - 2 * t) : t; };
  // a point on the wall: share f of the way from the foot to the wall's top
  const wallAt = (th, f, out = 0) => {
    const l0 = footAt(th), dir = new THREE.Vector3(Math.sin(th), 0, -Math.cos(th)), g = grow(f);
    const p = new THREE.Vector3(l0.x + (cx + dir.x * r0 * spec.taper - l0.x) * g, l0.y + (wallTop - l0.y) * f, l0.z + (cz + dir.z * r0 * spec.taper - l0.z) * g);
    return [p.addScaledVector(dir, out), dir];
  };
  const wall = (simple ? spec.wallSimple : spec.wall) ?? [[0, null], [0.5, null], [1, null]];
  const capRows = [];
  const dn = simple ? 2 : spec.domeRows ?? 3;
  if (dome) for (let k = 1; k <= dn; k++) { const a = (k / dn) * Math.PI / 2; capRows.push({ r: Math.cos(a), y: wallTop + dome * Math.sin(a) }); }
  else for (const [r, c] of spec.cap ? (simple ? [spec.cap[0], spec.cap[spec.cap.length - 1]] : spec.cap) : [[0.97], [0.001]]) capRows.push({ r, y: top + 0.0015 + 0.003 * (1 - r) * (1 - r), c });
  const crown = grid(segs, wall.length + capRows.length, { wrapU: true }, (i, j) => {
    const th = (i / segs) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(th), 0, -Math.cos(th));
    let p, c;
    if (j < wall.length) {
      p = wallAt(th, wall[j][0])[0];
      c = wall[j][1] ?? paint(spec.crown, i, j);
    } else {
      const cr = capRows[j - wall.length];
      p = new THREE.Vector3(cx + dir.x * r0 * spec.taper * cr.r, cr.y, cz + dir.z * r0 * spec.taper * cr.r);
      c = cr.c ?? paint(spec.crown, i, j);
    }
    return { p, c, out: p.clone().sub(new THREE.Vector3(cx, 0.05, cz)) };
  });
  const parts = [crown];
  if (spec.brimW > 0) {
    const dTop = Math.max(0.005, 0.010 - spec.brimDroop);
    const dAt = (rr) => 0.010 + (dTop - 0.010) * ((rr - r0) / spec.brimW);
    const bc = (i, j) => paint(spec.brim, i, j);
    const under = (i, j) => shade(paint(spec.brim, i, j), 0.8);
    const edge = spec.edge ?? bc;
    const profile = [{ r: r0, d: 0.003, c: under }, { r: R, d: 0.003, c: under }, { r: R + 0.004, d: (0.003 + dTop) / 2, c: edge, out: 1 }, { r: R, d: dAt(R), c: edge, out: 1 }];
    if (spec.edge) profile.push({ r: R - 0.006, d: dAt(R - 0.006), c: bc, out: 1 });
    const rings = [...(simple ? (spec.rings ?? []).slice(0, 1) : spec.rings ?? [])].sort((a, b) => b[0] - a[0]);
    for (const [q, rc, soft] of rings) {
      const rs = r0 + q * spec.brimW, c = (i, j) => paint(rc, i, j);
      if (soft) { profile.push({ r: rs, d: dAt(rs), c, out: 1 }); continue; }
      profile.push({ r: rs + 0.0018, d: dAt(rs), c: bc, out: 1 }, { r: rs, d: dAt(rs), c, out: 1 }, { r: rs - 0.0018, d: dAt(rs), c: bc, out: 1 });
    }
    profile.push({ r: r0, d: 0.010, c: bc, out: 1 });
    parts.push(drapedBrim(cx, cz, profile, segs, spec.wave));
  }
  if (spec.peak) {
    const { len, slope, span, c, shine } = spec.peak, n = simple ? 7 : 11;
    parts.push(frontPeak((th) => drape(footAt(th), 0.001)[0], span, len, slope, c, n, (w) => (Math.abs(w - 0.55) < 0.01 ? shine : c), shine ? [0.55] : []));
  }
  spec.extra?.(parts, { wallAt }, simple);
  return finish(id, parts);
}
const buckethat = (simple) => brimHat('buckethat', BRIM_HATS.buckethat, simple);
const gardenerhat = (simple) => brimHat('gardenerhat', BRIM_HATS.gardenerhat, simple);
const sailorcap = (simple) => brimHat('sailorcap', BRIM_HATS.sailorcap, simple);
const strawhat = (simple) => brimHat('strawhat', BRIM_HATS.strawhat, simple);
const stripedboater = (simple) => brimHat('stripedboater', BRIM_HATS.stripedboater, simple);

// Paperboy Cap: the beanie's crown (a shell on the skull's radii x 1.05, down
// to a rim high on the brow and low at the back, a band draped under it), its
// front puffed forward over the peak, in eight tweed panels with darker seams
// running up to a button on top, and a short stiff peak across the front only
// (within 0.9 rad of straight ahead) with a stitched line near its edge.
// The Market Trader's Cap (Market step 4) is the same cap in its own colours:
// a brown-and-green check (`check`: the panel's colour also turns with each
// row, three tones as a woven check makes them), no fleck.
const PAPERBOY = { shell: 1.05, rimFront: 0.125, rimBack: 0.045, lipH: 0.016, puff: 0.2, peakLen: 0.052, peakSlope: 0.3, span: 0.9, button: 0.012 };
const CAP_LOOKS = {
  paperboycap: { panel: [0x7d6b58, 0x6b5a48], peak: 0x4e4136, fleck: 0x8c7a64, stitch: 0xb8a68a },
  tradercap: { panel: [0x7a4a2a, 0x3f8046, 0x7a4a2a], check: 1, peak: 0x4a3a26, stitch: 0xd8c08a },
  // The Keeper's Cap (Lighthouse milestone 4): the same cap in navy, its stitching and its button brass.
  keepercap: { panel: [0x24365a, 0x1b2a47], peak: 0x141d30, stitch: 0xc9a24a, button: 0xc9a24a },
};
const paperboyRim = (phi) => (PAPERBOY.rimFront + PAPERBOY.rimBack) / 2 + ((PAPERBOY.rimFront - PAPERBOY.rimBack) / 2) * Math.cos(phi);
function peakedCap(id, simple) {
  const L = CAP_LOOKS[id], PEAK = L.peak;
  const segs = simple ? 16 : 32, rows = simple ? 5 : 8, per = segs / 8;
  const panel = (i, j) => {
    if (!simple && i % per === 0 && j < rows - 1) return shade(L.panel[1], 0.72);  // a seam
    if (!simple && L.fleck && (i * 7 + j * 3) % 5 === 0) return L.fleck;          // tweed fleck
    return L.panel[(Math.floor(((i + 0.5) * 8) / segs) % 2) + (L.check ? j % 2 : 0)];
  };
  const shell = grid(segs, rows, { wrapU: true }, (i, j) => {
    const phi = (i / segs) * Math.PI * 2;
    const thRim = Math.acos(Math.min(1, paperboyRim(phi) / SB));
    const th = (j / (rows - 1)) * thRim;
    const u = new THREE.Vector3(Math.sin(th) * Math.sin(phi), Math.cos(th), -Math.sin(th) * Math.cos(phi));
    const p = new THREE.Vector3(u.x * SA, u.y * SB, u.z * SC).multiplyScalar(PAPERBOY.shell);
    // puffed forward: the front of the crown bellies out over the peak, the rim itself stays
    p.z *= 1 + PAPERBOY.puff * Math.max(0, -u.z) * Math.sin((Math.PI * j) / (rows - 1)) ** 0.8;
    return { p, c: panel(i, j), out: u };
  });
  // the band: three rows, its top tucked under the shell's rim
  const lip = grid(segs, 3, { wrapU: true }, (i, j) => {
    const phi = (i / segs) * Math.PI * 2;
    const [p, n] = drape(ringPoint(phi, paperboyRim(phi) - j * PAPERBOY.lipH * 0.5), [0.010, 0.0085, 0.003][j]);
    return { p, c: j === 1 ? shade(PEAK, 1.12) : PEAK, out: n };
  });
  const peak = frontPeak((th) => drape(ringPoint(th, paperboyRim(th)), 0.010)[0], PAPERBOY.span, PAPERBOY.peakLen, PAPERBOY.peakSlope, PEAK, simple ? 7 : 11,
    (w) => (Math.abs(w - 0.8) < 0.01 ? L.stitch : PEAK), simple ? [] : [0.84, 0.8, 0.76]);
  const r = PAPERBOY.button;
  const button = blob(r, simple ? 5 : 6, simple ? 3 : 4, new THREE.Vector3(0, SB * PAPERBOY.shell + r * 0.3, 0), [1, 0.7, 1], (uy) => (L.button ?? (uy > 0.6 ? shade(PEAK, 1.3) : PEAK)));
  return finish(id, [shell, lip, peak, button]);
}
const paperboycap = (simple) => peakedCap('paperboycap', simple);
const tradercap = (simple) => peakedCap('tradercap', simple);
const keepercap = (simple) => peakedCap('keepercap', simple);

// --- clips (found outfits step 2, lane H, Task 3; beauty pass) ---------------
//
// Neither is a hat: each is a small thing clipped on the skull, still one
// vertex-coloured mesh in head space.

// Starfish Clip: five plump tapered arms lying on the skull (tube()s lifted
// with drape, their tips curling up a little) round a centre at the skull
// direction `dir` (right of the crown, in front of the ear's middle): orange
// on top, deeper coral down the flanks, a row of pale bumps along each arm's
// ridge and a pale knob in the middle.
const STARFISH = { dir: [0.55, 0.8, -0.25], reach: 0.046, radius: 0.0098, lift: 0.003, turn: 0.83, curl: 0.003 };
const STARFISH_ORANGE = 0xf28a3c, STARFISH_DOT = 0xf7c08a, STARFISH_DEEP = 0xd9582b;
const starfishAt = () => {
  const dir = new THREE.Vector3(...STARFISH.dir).normalize();
  return drape(new THREE.Vector3(dir.x * SA, dir.y * SB, dir.z * SC), 0);
};
function starfishclip(simple) {
  const [centre, n0] = starfishAt();
  const up = upSkull(centre, n0);
  const right = new THREE.Vector3().crossVectors(up, n0).normalize();
  const steps = simple ? 3 : 6, sides = simple ? 4 : 6;
  const parts = [];
  for (let k = 0; k < 5; k++) {
    const a = STARFISH.turn + (k / 5) * Math.PI * 2;
    const along = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(right, Math.sin(a));
    const centres = [], normals = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const [p, n] = drape(centre.clone().addScaledVector(along, STARFISH.reach * t), STARFISH.lift + STARFISH.curl * t ** 3);
      centres.push(p); normals.push(n);
    }
    parts.push(tube(centres, normals, {
      sides,
      radius: (i, ang) => STARFISH.radius * (1 - 0.78 * (i / (steps - 1)) ** 1.2) * (Math.cos(ang) < -0.3 ? 0.75 : 1),
      colour: (i, ang) => (Math.cos(ang) > 0.55 ? (i > 0 && i < steps - 1 && i % 2 === 1 ? STARFISH_DOT : STARFISH_ORANGE) : Math.cos(ang) > -0.3 ? STARFISH_DEEP : shade(STARFISH_DEEP, 0.8)),
    }));
  }
  const [hub, hubN] = drape(centre, STARFISH.lift + 0.004);
  parts.push(blob(0.0105, simple ? 5 : 6, simple ? 3 : 4, hub.addScaledVector(hubN, 0.001), [1, 1, 1], (uy) => (uy > 0.2 ? STARFISH_DOT : STARFISH_ORANGE)));
  return finish('starfishclip', parts);
}

// Feather Plume: a russet pheasant feather tucked behind the left ear. A 2 cm
// band on the skull at `dir` (low behind the ear, where it shows beside the
// head from the front) holds the quill, which rises between the skull's normal
// and straight up (`upright`) and curves back (toward +z) by `bend` radians over `len` metres; the
// vane runs from just above the band to the tip, wider on the trailing side,
// its two halves cupped, barred dark across, russet at the root to dark brown
// at the tip, with a notch on its leading edge.
const FEATHER = { dir: [-0.8, 0.45, 0.35], len: 0.23, bend: 0.36, upright: 0.8, band: 0.02, bandR: 0.011, vaneW: 0.03, vaneFrom: 0.02 };
const FEATHER_VANE = [0xa0522d, 0x3b2a20], FEATHER_QUILL = 0xf2e6c8, FEATHER_BAND = 0x5a3a1c, FEATHER_BAR = 0x5a2e18, FEATHER_EDGE = 0xd9a066;
// The feather's frame: its foot on the skull, n0 the way it leans (between
// the skull's normal and straight up), back the way it bends (toward +z),
// side across its vane.
function featherAt() {
  const dir = new THREE.Vector3(...FEATHER.dir).normalize();
  const [base, sn] = drape(new THREE.Vector3(dir.x * SA, dir.y * SB, dir.z * SC), 0);
  const n0 = sn.clone().add(new THREE.Vector3(0, FEATHER.upright, 0)).normalize();
  const back = new THREE.Vector3(0, 0, 1).addScaledVector(n0, -n0.z).normalize();
  return { base, n0, back, side: new THREE.Vector3().crossVectors(n0, back).normalize() };
}
function featherplume(simple) {
  const { base, n0, back, side } = featherAt();
  const steps = simple ? 5 : 10;
  const spine = [];
  const p = base.clone().addScaledVector(n0, -0.002);
  for (let i = 0; i < steps; i++) {
    spine.push(p.clone());
    const t = (i + 0.5) / (steps - 1), ang = FEATHER.bend * t;
    p.addScaledVector(n0.clone().multiplyScalar(Math.cos(ang)).addScaledVector(back, Math.sin(ang)), FEATHER.len / (steps - 1));
  }
  const quillN = spine.map(() => side.clone());
  const quill = tube(spine, quillN, { sides: simple ? 3 : 4, radius: (i) => 0.0034 * (1 - 0.6 * (i / (steps - 1))), colour: () => FEATHER_QUILL });
  // the vane: from vaneFrom up the spine, widest a third of the way up, to a point
  const i0 = Math.max(1, Math.round(FEATHER.vaneFrom / FEATHER.len * (steps - 1)));
  const vn = steps - i0, notch = Math.round(vn * 0.55);
  const tipHex = rgb(FEATHER_VANE[1]);
  const W = simple ? [-1, 0, 1] : [-1, -0.5, 0, 0.5, 1];
  const vane = grid(vn, W.length, {}, (i, j) => {
    const t = i / (vn - 1), e = W[j];
    let w = FEATHER.vaneW * Math.sin(Math.PI * Math.min(1, 0.22 + 0.78 * t) ** 0.8) * (1 - t ** 4) * (e < 0 ? 0.7 : 1);
    if (!simple && e === -1 && i === notch) w *= 0.45;
    const along = spine[Math.min(steps - 1, i0 + i + 1)].clone().sub(spine[i0 + i]).normalize();
    const pt = spine[i0 + i].clone().addScaledVector(side, e * w).addScaledVector(n0, e ? -Math.abs(e) * w * 0.28 : 0.0016)
      .addScaledVector(along, Math.abs(e) * w * 0.35);
    const bar = !simple && e !== 0 && i % 2 === 1 && t < 0.85;
    const c = Math.abs(e) === 1 && !simple ? mix(FEATHER_EDGE, tipHex, t) : bar ? mix(FEATHER_BAR, tipHex, t) : mix(FEATHER_VANE[0], tipHex, t);
    return { p: pt, c, out: back.clone().cross(side) };
  });
  // a little band round the quill's foot, resting on the skull, a bead on its front
  const segs = simple ? 6 : 8;
  const band = grid(segs, 2, { wrapU: true }, (i, j) => {
    const a = (i / segs) * Math.PI * 2;
    const q = base.clone().addScaledVector(side, Math.cos(a) * FEATHER.bandR).addScaledVector(back, Math.sin(a) * FEATHER.bandR);
    const [pp, n] = drape(q, 0.002);
    return { p: j ? pp.clone().addScaledVector(n0, FEATHER.band) : pp, c: FEATHER_BAND, out: q.clone().sub(base) };
  });
  const bead = blob(0.0055, 5, 3, base.clone().addScaledVector(n0, FEATHER.band * 0.55).addScaledVector(back, -FEATHER.bandR - 0.002), [1, 1, 1], 0xf2c14e);
  return finish('featherplume', [quill, vane, backFace(vane), band, bead]);
}

// Party Hat (a gift outfit, src/foundwear/gifts.js: the birthday's): a paper
// cone standing on the crown of the head, its tip leaning a little to her
// right, with spiral stripes of teal, gold and purple, a white frill round its
// foot lying on the skull and a white pompom on top.
const PARTYHAT = { at: [0.008, 0.004], r: 0.05, h: 0.135, lean: 0.03, frill: 0.0065, pom: 0.019 };
const PARTYHAT_STRIPES = [0x4ec9d4, 0xf5c518, 0x8a5cf0];
const PARTYHAT_WHITE = 0xfdfaf2;
function partyhat(simple) {
  const segs = simple ? 10 : 20, rows = simple ? 4 : 9;
  const [cx, cz] = PARTYHAT.at, R = PARTYHAT.r;
  const foot = (i) => {
    const th = (i / segs) * Math.PI * 2, x = cx + Math.sin(th) * R, z = cz - Math.cos(th) * R;
    return drape(new THREE.Vector3(x, skullY(x, z), z), 0.002)[0];
  };
  const tip = new THREE.Vector3(cx + PARTYHAT.lean, skullY(cx, cz) + PARTYHAT.h, cz);
  const axis = new THREE.Vector3(cx, skullY(cx, cz), cz);
  const cone = grid(segs, rows, { wrapU: true }, (i, j) => {
    const t = j / (rows - 1), p = foot(i).lerp(tip, t);
    const band = Math.floor(t * 4.5 + (i / segs) * 3) % 3;
    return { p, c: PARTYHAT_STRIPES[band], out: p.clone().sub(axis.clone().lerp(tip, t)) };
  });
  // the frill: a soft tube round the cone's foot, resting on the skull
  const centres = [], normals = [];
  for (let i = 0; i < segs; i++) {
    const th = (i / segs) * Math.PI * 2, x = cx + Math.sin(th) * (R + 0.002), z = cz - Math.cos(th) * (R + 0.002);
    const [p, n] = drape(new THREE.Vector3(x, skullY(x, z), z), PARTYHAT.frill + 0.001);
    centres.push(p); normals.push(n);
  }
  const frill = tube(centres, normals, { closed: true, sides: simple ? 3 : 4, radius: (i) => PARTYHAT.frill * (simple ? 1 : 0.85 + 0.15 * (i % 2)), colour: () => PARTYHAT_WHITE });
  const pom = blob(PARTYHAT.pom, simple ? 5 : 8, simple ? 4 : 6, tip.clone().add(new THREE.Vector3(0.002, PARTYHAT.pom * 0.6, 0)), [1, 1, 1], (uy) => mix(0xe8e0d0, PARTYHAT_WHITE, (uy + 1) / 2));
  return finish('partyhat', [cone, frill, pom]);
}

// Birthday Hat (a gift outfit, hers alone: the birthday event gives it): a
// real party hat, its wide foot sitting across the top of the head between
// the ears, a lilac cone with straight sides narrowing to a slim tip, standing
// straight up the head's own up axis (no sideways lean: the owner,
// 2026-11-21; the tip raked back only a hair). Raised white and gold polka
// dots, a gold trim round its foot on the skull, and a small fluffy tuft of
// eight little lumps on the tip (not a scoop: the owner, 2026-11-21).
// Measured from its rim, so the wider foot sitting lower on the dome does not
// lift the tip past the shop picture's top.
const BDAYHAT = { at: [0, 0.004], r: 0.068, h: 0.158, rake: 0.006, trim: 0.0066, dot: 0.012, taper: 1.18 };
const BDAYHAT_LILAC = 0xc39be8, BDAYHAT_SHADE = 0xa97fd6, BDAYHAT_DOTS = [0xfffaf2, 0xfffaf2, 0xf5c518], BDAYHAT_TRIM = 0xf5c518;
// the tuft: [x, y, z, r] round the tip, a low ring of five and three above
const BDAYHAT_TUFT = [[0, 0.005, -0.009, 0.0102], [0.0086, 0.005, -0.0028, 0.0102], [0.0053, 0.005, 0.0073, 0.0102], [-0.0053, 0.005, 0.0073, 0.0102], [-0.0086, 0.005, -0.0028, 0.0102],
  [0.0045, 0.0135, 0.002, 0.009], [-0.0045, 0.0135, 0.002, 0.009], [0, 0.0145, -0.0045, 0.009]];
function birthdayhat(simple) {
  const segs = simple ? 10 : 20, rows = simple ? 4 : 6;
  const [cx, cz] = BDAYHAT.at, R = BDAYHAT.r;
  const footAt = (th) => {
    const x = cx + Math.sin(th) * R, z = cz - Math.cos(th) * R;
    return drape(new THREE.Vector3(x, skullY(x, z), z), 0.002)[0];
  };
  const rimY = skullY(cx + R, cz);
  const tip = new THREE.Vector3(cx, rimY + BDAYHAT.h, cz + BDAYHAT.rake);
  const axis = new THREE.Vector3(cx, rimY, cz);
  // straight up from the foot to the tip, the girth narrowing a little faster
  // than a plain cone toward the top (taper), so the tip is slim
  const surface = (th, t) => {
    const foot = footAt(th), onAxis = axis.clone().lerp(tip, t);
    const k = (1 - t) ** BDAYHAT.taper;
    return onAxis.add(foot.sub(axis).multiplyScalar(k));
  };
  const outAt = (p, t) => { const o = p.clone().sub(axis.clone().lerp(tip, t)); o.y = 0; return o; };
  const cone = grid(segs, rows, { wrapU: true }, (i, j) => {
    const t = j / (rows - 1), th = (i / segs) * Math.PI * 2, p = surface(th, t);
    return { p, c: mix(BDAYHAT_SHADE, BDAYHAT_LILAC, Math.min(1, 0.4 + t)), out: outAt(p, t) };
  });
  // the trim: a soft gold tube round the cone's foot, resting on the skull
  const centres = [], normals = [];
  for (let i = 0; i < segs; i++) {
    const th = (i / segs) * Math.PI * 2, x = cx + Math.sin(th) * (R + 0.002), z = cz - Math.cos(th) * (R + 0.002);
    const [p, n] = drape(new THREE.Vector3(x, skullY(x, z), z), BDAYHAT.trim + 0.001);
    centres.push(p); normals.push(n);
  }
  const trim = tube(centres, normals, { closed: true, sides: simple ? 3 : 4, radius: () => BDAYHAT.trim, colour: () => BDAYHAT_TRIM });
  // the polka dots: raised beads half sunk in the cone, in staggered rings
  const parts = [cone, trim];
  const rings = simple ? [[0.18, 4], [0.45, 3]] : [[0.14, 6], [0.35, 5], [0.55, 4], [0.74, 2]];
  let k = 0;
  rings.forEach(([t, n], r) => {
    for (let i = 0; i < n; i++) {
      const th = ((i + (r % 2) * 0.5) / n) * Math.PI * 2 + 0.4;
      const p = surface(th, t), out = outAt(p, t).normalize();
      const size = BDAYHAT.dot * (1 - 0.4 * t);
      parts.push(blob(size, simple ? 4 : 5, simple ? 2 : 3, p.addScaledVector(out, size * 0.15), [1, 1, 1], BDAYHAT_DOTS[k++ % BDAYHAT_DOTS.length]));
    }
  });
  // the tuft: little soft lumps on the tip, creamy below and whiter on top
  for (const [x, y, z, r] of simple ? BDAYHAT_TUFT.slice(0, 5) : BDAYHAT_TUFT) {
    parts.push(blob(r, simple ? 4 : 5, 3, tip.clone().add(new THREE.Vector3(x, y, z)), [1, 0.9, 1], (uy) => mix(0xe6dcef, 0xfffcf6, (uy + 1) / 2)));
  }
  return finish('birthdayhat', parts);
}

// Crystal Circlet (the Crystal Cave's forge prize): a thin silver band, its bottom edge on the skull ring at the brow, three small crystals (sky, rose, gold) across the front.
function crystalcirclet(simple) {
  const cols = simple ? 12 : 20, ring = (phi, h) => { const p = ringPoint(phi, 0.14), n = skullNormal(p); return p.addScaledVector(n, 0.003).add(new THREE.Vector3(0, h, 0)); };
  const band = grid(cols, 2, { wrapU: true }, (i, j) => { const phi = (i / cols) * Math.PI * 2; return { p: ring(phi, j * 0.014), c: j ? 0xe4e9f2 : 0xaab3c4, out: new THREE.Vector3(Math.sin(phi), 0, -Math.cos(phi)) }; });
  const gems = [-0.3, 0, 0.3].map((phi, k) => blob(k === 1 ? 0.016 : 0.012, simple ? 4 : 6, simple ? 3 : 4, ring(phi, 0.01 + (k === 1 ? 0.004 : 0)).addScaledVector(new THREE.Vector3(Math.sin(phi), 0, -Math.cos(phi)), 0.007), [1, 1.25, 0.8], [0x62b8ff, 0xff6fa8, 0xffc65a][k]));
  return finish('crystalcirclet', [band, backFace(band), ...gems]);
}

const BUILD = { crown, tophat, beanie, wizard, partycrown, leafcrown, candlehat, papercrown, acorncap, paperboycap, buckethat, sailorcap, strawhat, stripedboater, starfishclip, featherplume, partyhat, birthdayhat, tradercap, keepercap, gardenerhat, crystalcirclet };

// The clips' ground looks (src/foundwear/display.js): the clip as worn (the
// simple build), turned so its face is up and propped toward -z, as if
// dropped against a tuft (quite flat, it would be a sliver from a cat's eye
// height): the feather half a radian, the starfish, small and round, nearly
// on its edge and half again its size, so it can be spotted on the sand.
// Any other id is its hat, as worn.
export function lyingClip(id) {
  const hat = buildHat(id, { simple: true });
  const [face, prop, k] = id === 'starfishclip' ? [starfishAt()[1], 1.0, 1.5] : id === 'featherplume' ? [featherAt().back, 0.5, 1] : [];
  if (hat && face) {
    hat.geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(face, new THREE.Vector3(0, Math.cos(prop), -Math.sin(prop))));
    hat.geometry.scale(k, k, k);
  }
  return hat;
}

// centred: a brimmed found hat built round the middle of the head rather than
// set back off the eyes (Hagrid's, src/cat/foundhead.js).
export function buildHat(id, { simple = false, centred = false } = {}) {
  if (centred && Object.hasOwn(BRIM_HATS, id ?? '')) return brimHat(id, { ...BRIM_HATS[id], at: [0, 0] }, simple);
  const make = Object.hasOwn(BUILD, id ?? '') ? BUILD[id] : null;
  return make ? make(simple) : null;
}

// for tests / tuning
export const HAT_SHAPES = Object.freeze({ TOPHAT, WIZARD, BEANIE, PARTY, LAUREL, CAKE, WREATH, PAPER, ACORN, PAPERBOY, BRIM_HATS, STARFISH, FEATHER });
