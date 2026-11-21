// =============================================================================
// PROTOTYPE — THROWAWAY (lifelike people, 2026-11-20). Not production code.
//
// Nothing in the game imports this file and no test covers it. It exists only
// so verify-people.html can draw the jointed person next to today's Twoleg
// (src/critters.js buildTwolegFigure) for the owner's pictures. The design it
// illustrates, and the rules the real build must keep (the Math.random
// contract, the budgets, the lazy download), are in
// docs/superpowers/specs/2026-11-20-lifelike-people-design.md. The real build
// starts again from that doc; it may borrow from here but owes this file
// nothing.
//
// What it shows:
//   * one rigidly skinned mesh per person (every vertex follows exactly one
//     joint, weight 1), so a jointed body of 17 joints still costs ONE draw
//     call, against the three today's figure costs;
//   * shaped parts built in code (lathed limbs with rounded ends that overlap
//     at the elbow and knee, a lathed torso with rounded shoulders, a neck,
//     mitten hands, shoes, a head with a softer jaw), vertex-coloured;
//   * a simple, friendly face (dark dot eyes with a catchlight, brows, a
//     nose, a small smile) on the near build, eyes only on the far build;
//   * hair shells clamped above the brows, hats, glasses;
//   * age, height, build, clothes and hair from the spawn's position (a hash,
//     never a roll), with overrides so the picture sheet can show each kind;
//   * poses: standing with a weight shift, mid-stride, waving, crouching,
//     juggling, and a look toward a point (the cat).
// Faces -z, like the critters. Metres.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, k) => a + (b - a) * k;

// The same hash today's figure dresses from (critters.js twolegHash): the spawn
// spot to the centimetre and a salt, in [0, 1). No rng is drawn.
export function spotHash(x, z, salt) {
  let h = Math.imul(Math.round(x * 100) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z * 100) | 0, 0x165667b1) ^ Math.imul(salt + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---- palettes ---------------------------------------------------------------
const SKINS = [0xefcfb4, 0xe6bf9e, 0xcf9d74, 0xa8734c, 0x7a5236];
const HAIR = Object.freeze({ dark: 0x3e2a1c, black: 0x221d1b, brown: 0x6b4529, auburn: 0x8e4a25, blond: 0xcfa86a, grey: 0x9e9a94, white: 0xe2ded6 });
const YOUNG_HAIR = ['dark', 'black', 'brown', 'auburn', 'blond'];
const TOPS = [0x5d7fb8, 0xc8604a, 0x5e9a6a, 0xd8a640, 0x8a6ab0, 0xe4e0d6, 0x3e5a7a, 0xd27a96, 0x7a8a4a];
const KID_TOPS = [0xe2433a, 0xf7c93b, 0x4eb86a, 0x4a9ad0, 0xe070b0, 0xff8a3a];
const BOTTOMS = [0x3e4a66, 0x4a4a52, 0x7a6a50, 0x2e2e36, 0x5a6a48];
const SKIRTS = [0x3e4a66, 0x8a3a4a, 0x4a6a8a, 0x6a5a8a, 0x2e2e36];
const SHOES = [0x3a3330, 0x5a3a28, 0xe8e4dc, 0x2a2a30];
const KID_SHOES = [0xd8503a, 0x4a9ad0, 0xe8e4dc, 0xf0a020];
const HATS = [0xd8503a, 0xe8b83a, 0x4a9ad0, 0x5ab06a, 0xd070a0];
const EYE = 0x2a211c;
const BROW_DARKEN = 0.75;
const LIP = 0xa8605a;
const GLASSES = 0x3a3a42;

const pickOf = (list, u) => list[Math.floor(u * list.length) % list.length];

// personFor(def) -> the person's look and body, from the spawn's spot. `def`
// may override any field (the picture sheet shows each kind on purpose).
export function personFor(def = {}) {
  const x = Number.isFinite(def.x) ? def.x : 0;
  const z = Number.isFinite(def.z) ? def.z : 0;
  const u = (salt) => spotHash(x, z, 20 + salt);
  const r0 = u(0);
  const kind = def.kind ?? (r0 < 0.18 ? 'child' : r0 < 0.36 ? 'older' : 'adult');
  const sex = def.sex ?? (u(1) < 0.5 ? 'm' : 'f');
  const h = u(2);
  const height = def.height ?? (
    kind === 'child' ? 1.16 + 0.26 * h
      : kind === 'older' ? (sex === 'm' ? 1.66 : 1.55) + 0.12 * h
        : (sex === 'm' ? 1.72 : 1.60) + 0.13 * h);
  const girth = def.girth ?? (0.94 + 0.14 * u(3));
  const skin = def.skin ?? pickOf(SKINS, u(4));
  let hairStyle, hairColor, top, bottom, hat = null, glasses = false;
  if (kind === 'child') {
    hairStyle = sex === 'm' ? 'short' : pickOf(['pigtails', 'ponytail', 'bob'], u(5));
    hairColor = pickOf(YOUNG_HAIR, u(6));
    top = { kind: pickOf(['tshirt', 'jumper', 'coat'], u(7)), color: pickOf(KID_TOPS, u(8)) };
    bottom = sex === 'f' && u(9) < 0.5 ? { kind: 'skirt', color: pickOf(SKIRTS, u(10)) } : { kind: u(9) < 0.75 ? 'shorts' : 'trousers', color: pickOf(BOTTOMS, u(10)) };
    if (u(11) < 0.3) hat = { kind: 'bobble', color: pickOf(HATS, u(12)) };
  } else if (kind === 'older') {
    hairStyle = sex === 'm' ? pickOf(['short', 'bald'], u(5)) : pickOf(['bun', 'bob'], u(5));
    hairColor = u(6) < 0.5 ? 'grey' : 'white';
    top = { kind: pickOf(['coat', 'jumper'], u(7)), color: pickOf(TOPS, u(8)) };
    bottom = sex === 'f' && u(9) < 0.6 ? { kind: 'skirt', color: pickOf(SKIRTS, u(10)) } : { kind: 'trousers', color: pickOf(BOTTOMS, u(10)) };
    glasses = u(11) < 0.6;
    if (sex === 'm' && u(12) < 0.35) hat = { kind: 'cap', color: 0x8a7a5a };
  } else {
    hairStyle = sex === 'm' ? pickOf(['short', 'short', 'crop'], u(5)) : pickOf(['bob', 'ponytail', 'long', 'bun'], u(5));
    hairColor = pickOf(YOUNG_HAIR, u(6));
    top = { kind: pickOf(sex === 'f' ? ['tshirt', 'jumper', 'coat', 'dress'] : ['tshirt', 'jumper', 'coat'], u(7)), color: pickOf(TOPS, u(8)) };
    bottom = top.kind === 'dress' ? { kind: 'skirt', color: top.color }
      : sex === 'f' && u(9) < 0.3 ? { kind: 'skirt', color: pickOf(SKIRTS, u(10)) }
        : { kind: 'trousers', color: pickOf(BOTTOMS, u(10)) };
    if (u(11) < 0.15) hat = { kind: sex === 'm' ? 'cap' : 'sunhat', color: sex === 'm' ? 0x8a7a5a : 0xe8d8a8 };
    else if (u(11) < 0.25) hat = { kind: 'bobble', color: pickOf(HATS, u(12)) };
  }
  const shoes = kind === 'child' ? pickOf(KID_SHOES, u(13)) : pickOf(SHOES, u(13));
  const look = {
    kind, sex, height, girth, skin,
    hairStyle: def.hairStyle ?? hairStyle,
    hair: HAIR[def.hairColor ?? hairColor] ?? def.hairColor ?? HAIR.dark,
    top: { ...top, ...(def.top ?? {}) },
    bottom: { ...bottom, ...(def.bottom ?? {}) },
    shoes: def.shoes ?? shoes,
    hat: def.hat === undefined ? hat : def.hat,
    glasses: def.glasses ?? glasses,
    seed: u(14), // the idle's own phase (never a roll)
  };
  look.dims = bodyDims(look);
  return look;
}

// The body's joints and widths, in metres, from height, kind, sex and girth.
export function bodyDims(look) {
  const H = look.height;
  const child = look.kind === 'child';
  const f = look.sex === 'f';
  const g = look.girth;
  const P = child
    ? { knee: 0.272, hip: 0.50, waist: 0.60, shoulder: 0.79, neck: 0.805, chin: 0.835 }
    : { knee: 0.285, hip: 0.525, waist: 0.615, shoulder: 0.815, neck: 0.832, chin: 0.866 };
  const s = H / 1.75;
  const limb = s * g * (f ? 0.93 : 1) * (child ? 0.95 : 1);
  const headH = H * (1 - P.chin);
  return {
    H, s,
    ankleY: 0.045 * H,
    kneeY: P.knee * H,
    hipY: P.hip * H,
    waistY: P.waist * H,
    shoulderY: P.shoulder * H,
    neckY: P.neck * H,
    chinY: P.chin * H,
    headH,
    // the head: a rounded egg, the jaw a little narrower
    headXr: headH * (child ? 0.40 : 0.37),
    headYr: headH * 0.5,
    headZr: headH * (child ? 0.45 : 0.43),
    shoulderX: H * (child ? 0.098 : f ? 0.099 : 0.108) * Math.sqrt(g),
    hipX: H * (f ? 0.056 : 0.052) * Math.sqrt(g),
    waistR: H * (f ? 0.074 : 0.083) * g,
    hipR: H * (f ? 0.104 : 0.094) * g,
    chestR: H * (f ? 0.096 : 0.106) * g,
    torsoZ: f ? 0.62 : 0.58,
    upperArm: H * (child ? 0.178 : 0.186),
    forearm: H * (child ? 0.14 : 0.146),
    hand: H * (child ? 0.098 : 0.104),
    footLen: H * 0.148,
    // limb radii (top, bottom)
    // real girths (a thigh about 55 cm round, a calf 37, an upper arm 30)
    // with a little for clothes: thinner read as spindly next to the cats
    uaR: [0.055 * limb, 0.045 * limb],
    faR: [0.046 * limb, 0.031 * limb],
    thR: [0.094 * limb * (f ? 1.04 : 1), 0.06 * limb],
    shR: [0.062 * limb, 0.035 * limb],
    neckR: 0.046 * s * Math.sqrt(g) * (f ? 0.9 : 1),
    stoop: look.kind === 'older' ? 1 : 0,
  };
}

// ---- geometry helpers ---------------------------------------------------------
const J = Object.freeze(['root', 'pelvis', 'chest', 'neck', 'head',
  'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR']);
const JI = Object.freeze(Object.fromEntries(J.map((n, i) => [n, i])));

// Paint a geometry one colour (or by a per-vertex function of its position),
// and bind every vertex of it to one joint, weight 1.
function part(geo, color, joint) {
  if (!geo.index) throw new Error('parts are indexed');
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    c.set(typeof color === 'function' ? color(pos.getX(i), pos.getY(i), pos.getZ(i)) : color);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = JI[joint]; sw[i * 4] = 1; }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  return geo;
}

// A limb: a lathed tube hanging from y=0 down to y=-len, tapering r0 -> r1
// (with an optional bulge, the calf or the forearm's muscle), each end closed
// by a rounded cap so two limbs overlap smoothly at the elbow or knee.
function limbGeo(len, r0, r1, { bulge = 0, bulgeAt = 0.3, segs = 8, rings = 6, capTop = 1, capBot = 1, capN = 2 } = {}) {
  const pts = [];
  // bottom cap (from the tip up)
  for (let i = 0; i <= capN; i++) {
    const a = (i / capN) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, r1 * Math.sin(a)), -len - r1 * capBot * Math.cos(a)));
  }
  for (let i = 1; i < rings; i++) {
    const k = i / rings; // 0 at the bottom
    const t = 1 - k;     // 0 at the top
    let r = lerp(r1, r0, k);
    r += bulge * Math.exp(-((t - bulgeAt) ** 2) / 0.04);
    pts.push(new THREE.Vector2(r, -len + len * k));
  }
  for (let i = 0; i <= capN; i++) {
    const a = (i / capN) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, r0 * Math.cos(a)), r0 * capTop * Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, segs);
}

// A lathed solid from (r, y) points, bottom to top, scaled in z (and x).
function lathe(points, segs, sx = 1, sz = 1) {
  const geo = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), segs);
  geo.scale(sx, 1, sz);
  return geo;
}

function ellipsoid(rx, ry, rz, ws, hs) {
  return new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz);
}

// The head's shape: an egg whose lower half narrows to a softer jaw.
function jawTaper(y, yr) {
  const k = clamp01(-y / yr); // 0 at the middle, 1 at the chin
  return { x: 1 - 0.24 * k * k, z: 1 - 0.1 * k * k };
}

function headGeo(d, ws, hs) {
  const geo = ellipsoid(d.headXr, d.headYr, d.headZr, ws, hs);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = jawTaper(y, d.headYr);
    p.setX(i, p.getX(i) * t.x);
    p.setZ(i, p.getZ(i) * t.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// The point on the face's front at (x, y), head-centre frame, pushed `out`
// metres along the normal-ish (straight forward).
function onFace(d, x, y, out = 0) {
  const t = jawTaper(y, d.headYr);
  const xr = d.headXr * t.x;
  const zr = d.headZr * t.z;
  const q = 1 - (x / xr) ** 2 - (y / d.headYr) ** 2;
  return -zr * Math.sqrt(Math.max(0, q)) - out;
}

// A hair shell: the head's egg a little larger, every vertex held between a
// top line (`top`, the polar angle from the crown) and a hairline that runs
// from `front` (above the brows) through `side` (over the ears) to `back`
// (the nape). The front line never comes below the brows: hair never covers
// the eyes. `flare` pushes the lower edge out (a bob).
function hairShell(d, { top = 0, front, side, back, thick = 1.07, flare = 0, reach = 1 }, ws, hs) {
  const geo = new THREE.SphereGeometry(1, ws, hs);
  const p = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const flat = Math.hypot(v.x, v.z);
    let theta = Math.acos(THREE.MathUtils.clamp(v.y, -1, 1));
    const fr = flat > 1e-6 ? -v.z / flat : 1; // 1 straight ahead, -1 behind
    const lim = fr >= 0 ? lerp(side, front, clamp01(fr * reach)) : lerp(side, back, -fr);
    theta = Math.min(Math.max(theta, top), Math.max(lim, top));
    const az = Math.atan2(v.x, v.z);
    const sy = Math.cos(theta);
    const sr = Math.sin(theta);
    let x = Math.sin(az) * sr;
    let z = Math.cos(az) * sr;
    let y = sy;
    const yy = y * d.headYr * thick;
    const t = jawTaper(yy, d.headYr);
    const fl = 1 + flare * clamp01(-y * 1.6);
    p.setXYZ(i, x * d.headXr * thick * t.x * fl, yy, z * d.headZr * thick * t.z * fl);
  }
  geo.computeVertexNormals();
  return geo;
}

const HAIR_STYLES = Object.freeze({
  // polar angles (radians from the crown) of the hairline
  short: { front: 0.34 * Math.PI, side: 0.47 * Math.PI, back: 0.62 * Math.PI, thick: 1.07 },
  crop: { front: 0.30 * Math.PI, side: 0.44 * Math.PI, back: 0.6 * Math.PI, thick: 1.045 },
  bob: { front: 0.31 * Math.PI, side: 0.7 * Math.PI, back: 0.72 * Math.PI, thick: 1.1, flare: 0.12 },
  long: { front: 0.33 * Math.PI, side: 0.66 * Math.PI, back: 0.72 * Math.PI, thick: 1.09 },
  ponytail: { front: 0.34 * Math.PI, side: 0.5 * Math.PI, back: 0.64 * Math.PI, thick: 1.07 },
  bun: { front: 0.34 * Math.PI, side: 0.5 * Math.PI, back: 0.64 * Math.PI, thick: 1.07 },
  pigtails: { front: 0.33 * Math.PI, side: 0.52 * Math.PI, back: 0.62 * Math.PI, thick: 1.07 },
  bald: { top: 0.5 * Math.PI, front: 0.5 * Math.PI, side: 0.62 * Math.PI, back: 0.68 * Math.PI, thick: 1.03, reach: 2.5 },
});

const darken = (hex, k) => { const c = new THREE.Color(hex); return c.multiplyScalar(k).getHex(); };

// ---- the build -----------------------------------------------------------------
// The parts of one person, in the figure's rest frame (standing, arms down),
// each bound to one joint. `near` picks the detail: the near build has the face,
// ears, thumbs and rounder segments; the far one has eyes only and fewer sides.
function personParts(look, near) {
  const d = look.dims;
  // segment counts: near about 2,000 triangles a person, far about 600
  const S = near ? { limb: 8, ring: 4, cap: 2, torso: 10, head: [12, 8], hair: [12, 8], hand: [6, 4], foot: [8, 5] }
    : { limb: 4, ring: 2, cap: 1, torso: 6, head: [7, 5], hair: [7, 5], hand: [4, 3], foot: [5, 3] };
  const out = [];
  const skin = look.skin;
  const top = look.top;
  const bot = look.bottom;
  const longSleeve = top.kind !== 'tshirt' && top.kind !== 'dress';
  const legSkin = bot.kind === 'skirt' || bot.kind === 'shorts';
  // ---- legs ----
  for (const [sd, L] of [[-1, 'L'], [1, 'R']]) {
    const x = sd * d.hipX;
    const thighLen = d.hipY - d.kneeY;
    const shinLen = d.kneeY - d.ankleY;
    const thighCol = legSkin ? skin : bot.color;
    if (bot.kind === 'shorts') {
      // a hem of its own: a crisp edge where vertex colours would blur
      out.push(part(limbGeo(thighLen * 0.5, d.thR[0] * 1.06, d.thR[0] * 0.97, { segs: S.limb, rings: 2, capN: S.cap, capBot: 0.15 }).translate(x, d.hipY, 0), bot.color, `thigh${L}`));
    }
    out.push(part(limbGeo(thighLen, d.thR[0] * 1.06, d.thR[1] * 1.05, { segs: S.limb, rings: S.ring, capN: S.cap, bulge: 0.006 * d.s, bulgeAt: 0.25 }).translate(x, d.hipY, 0), thighCol, `thigh${L}`));
    out.push(part(limbGeo(shinLen, d.shR[0], d.shR[1], { segs: S.limb, rings: S.ring, capN: S.cap, bulge: 0.01 * d.s, bulgeAt: 0.3 }).translate(x, d.kneeY, 0), legSkin ? skin : bot.color, `shin${L}`));
    // the shoe: a rounded last, flat underneath, its heel under the ankle
    const shoe = ellipsoid(d.footLen * 0.21, d.ankleY * 0.8, d.footLen * 0.5, ...S.foot);
    shoe.translate(x + sd * 0.004, d.ankleY * 0.62, -d.footLen * 0.24);
    const sp = shoe.getAttribute('position');
    for (let i = 0; i < sp.count; i++) if (sp.getY(i) < 0.004) sp.setY(i, 0.004);
    shoe.computeVertexNormals();
    out.push(part(shoe, look.shoes, `foot${L}`));
  }
  // ---- the pelvis: hips, seat and the trousers' top ----
  const pelvisCol = bot.kind === 'skirt' ? bot.color : bot.color;
  // the seat's widest ring sits just inside the thighs' outer edge, and its
  // underside tucks between them (wider, it read as a nappy over the legs)
  const crotch = d.hipY - d.thR[0] * 0.55;
  const seatR = Math.min(d.hipR, d.hipX + d.thR[0] * 0.8);
  out.push(part(lathe([
    [0, crotch - 0.015], [d.hipX * 0.8, crotch], [seatR * 0.9, d.hipY - 0.03 * d.s], [seatR, d.hipY + 0.02 * d.s],
    [lerp(seatR, d.waistR, 0.6), d.waistY - 0.01], [d.waistR * 0.98, d.waistY + 0.03 * d.s], [0, d.waistY + 0.04 * d.s],
  ], S.torso, 1, d.torsoZ + 0.05), pelvisCol, 'pelvis'));
  // ---- the chest: waist to shoulders, the shoulders rounded over to the neck ----
  const shR = d.shoulderX + d.uaR[0] * 0.35;
  const f = look.sex === 'f' && look.kind !== 'child';
  const chest = lathe([
    [0, d.waistY - 0.04 * d.s], [d.waistR, d.waistY - 0.04 * d.s], [d.waistR * 1.02, d.waistY + 0.03 * d.s],
    [lerp(d.waistR, d.chestR, 0.7), lerp(d.waistY, d.shoulderY, 0.45)], [d.chestR, lerp(d.waistY, d.shoulderY, 0.75)],
    [shR * 0.98, d.shoulderY - 0.02 * d.s], [shR * 0.82, d.shoulderY + 0.025 * d.s], [d.neckR * 2.2, d.neckY + 0.005],
    [d.neckR * 1.15, d.neckY + 0.012], [0, d.neckY + 0.014],
  ], S.torso, 1, d.torsoZ);
  if (f) {
    // a softer front: the chest a touch fuller below the collarbones
    const cp = chest.getAttribute('position');
    const mid = lerp(d.waistY, d.shoulderY, 0.62);
    for (let i = 0; i < cp.count; i++) {
      const y = cp.getY(i);
      const z = cp.getZ(i);
      if (z < 0) cp.setZ(i, z * (1 + 0.16 * Math.exp(-((y - mid) ** 2) / (0.006 * d.s))));
    }
    chest.computeVertexNormals();
  }
  out.push(part(chest, top.color, 'chest'));
  // deltoids: round off each shoulder where the arm meets it
  for (const [sd, L] of [[-1, 'L'], [1, 'R']]) {
    out.push(part(ellipsoid(d.uaR[0] * 1.04, d.uaR[0] * 1.0, d.uaR[0] * 1.06, S.hand[0], S.hand[1]).translate(sd * d.shoulderX * 0.96, d.shoulderY - 0.02 * d.s, 0), top.color, `upperArm${L}`));
  }
  // ---- a coat's skirt, a dress or a skirt: a flare from the waist ----
  // flares are sized from the thighs' outer edge, so a leg never pokes through
  const legOut = d.hipX + d.thR[0] * 1.1;
  if (top.kind === 'coat') {
    const hem = lerp(d.hipY, d.kneeY, 0.45);
    out.push(part(lathe([[legOut * 1.28, hem], [legOut * 1.12, d.hipY], [d.waistR * 1.06, d.waistY], [d.waistR * 1.04, d.waistY + 0.03]], S.torso, 1, 0.78), top.color, 'pelvis'));
  }
  if (bot.kind === 'skirt') {
    const hem = look.kind === 'older' ? lerp(d.kneeY, d.ankleY, 0.35) : lerp(d.hipY, d.kneeY, 0.92);
    out.push(part(lathe([[legOut * (look.kind === 'older' ? 1.4 : 1.5), hem], [legOut * 1.1, d.hipY], [d.waistR * 1.02, d.waistY], [d.waistR, d.waistY + 0.02]], S.torso, 1, 0.8), bot.color, 'pelvis'));
  }
  // ---- arms and hands ----
  for (const [sd, L] of [[-1, 'L'], [1, 'R']]) {
    const x = sd * d.shoulderX;
    const elbowY = d.shoulderY - d.upperArm;
    const wristY = elbowY - d.forearm;
    const sleeveEnd = d.shoulderY - d.upperArm * 0.5;
    out.push(part(limbGeo(d.upperArm, d.uaR[0], d.uaR[1], { segs: S.limb, rings: S.ring, capN: S.cap, bulge: 0.004 * d.s, bulgeAt: 0.35 }).translate(x, d.shoulderY, 0),
      longSleeve ? top.color : skin, `upperArm${L}`));
    if (!longSleeve) {
      out.push(part(limbGeo(d.shoulderY - sleeveEnd, d.uaR[0] * 1.1, d.uaR[0] * 1.02, { segs: S.limb, rings: 2, capN: S.cap, capBot: 0.15 }).translate(x, d.shoulderY, 0), top.color, `upperArm${L}`));
    }
    out.push(part(limbGeo(d.forearm, d.faR[0], d.faR[1], { segs: S.limb, rings: S.ring, capN: S.cap, bulge: 0.006 * d.s, bulgeAt: 0.25 }).translate(x, elbowY, 0),
      longSleeve ? top.color : skin, `forearm${L}`));
    // a mitten hand, palm to the thigh, and a thumb forward
    const hr = d.hand * 0.5;
    out.push(part(ellipsoid(hr * 0.36, hr, hr * 0.62, ...S.hand).translate(x + sd * 0.004, wristY - hr * 0.92, 0), skin, `hand${L}`));
    if (near) out.push(part(ellipsoid(hr * 0.2, hr * 0.42, hr * 0.2, 4, 3).rotateX(0.5).translate(x - sd * hr * 0.12, wristY - hr * 0.5, -hr * 0.45), skin, `hand${L}`));
  }
  // ---- neck and head ----
  const headCY = d.chinY + d.headYr * 0.92;
  out.push(part(limbGeo(d.neckY + 0.02 - d.chinY + d.headYr * 0.35, d.neckR, d.neckR * 1.08, { segs: S.limb, rings: 2, capN: S.cap }).translate(0, d.chinY + d.headYr * 0.35, d.headZr * 0.12), skin, 'neck'));
  const head = headGeo(d, ...S.head).translate(0, headCY, 0);
  out.push(part(head, skin, 'head'));
  // ears
  if (near) {
    for (const sd of [-1, 1]) {
      out.push(part(ellipsoid(d.headXr * 0.14, d.headYr * 0.2, d.headZr * 0.2, 5, 3).translate(sd * d.headXr * 0.98, headCY - d.headYr * 0.08, d.headZr * 0.08), darken(skin, 0.95), 'head'));
    }
  }
  // the face: friendly dark eyes (taller than wide), a catchlight, brows, a nose, a small smile
  const child = look.kind === 'child';
  const eyeY = -d.headYr * (child ? 0.16 : 0.05);
  const eyeX = d.headXr * (child ? 0.4 : 0.37);
  const eyeR = d.headXr * (child ? 0.115 : 0.095);
  for (const sd of [-1, 1]) {
    const ez = onFace(d, sd * eyeX, eyeY, -eyeR * 0.35);
    out.push(part(ellipsoid(eyeR, eyeR * 1.22, eyeR * 0.55, near ? 6 : 4, near ? 4 : 2).translate(sd * eyeX, headCY + eyeY, ez), EYE, 'head'));
    if (near) {
      out.push(part(ellipsoid(eyeR * 0.3, eyeR * 0.3, eyeR * 0.2, 4, 2).translate(sd * eyeX + eyeR * 0.3, headCY + eyeY + eyeR * 0.42, ez - eyeR * 0.5), 0xffffff, 'head'));
      // brows: a soft arch, the outer ends a little lower (a kind look)
      const by = eyeY + d.headYr * 0.24;
      const brow = new THREE.CapsuleGeometry(d.headXr * 0.022, d.headXr * 0.2, 2, 4).rotateZ(Math.PI / 2 + sd * 0.12);
      brow.translate(sd * eyeX, headCY + by, onFace(d, sd * eyeX, by, -0.002));
      out.push(part(brow, darken(look.hair, BROW_DARKEN), 'head'));
    }
  }
  if (near) {
    const ny = -d.headYr * (child ? 0.34 : 0.3);
    out.push(part(ellipsoid(d.headXr * 0.11, d.headYr * 0.12, d.headZr * 0.13, 6, 5).translate(0, headCY + ny, onFace(d, 0, ny, -d.headZr * 0.04)), darken(skin, 0.93), 'head'));
    const my = -d.headYr * (child ? 0.55 : 0.52);
    const smile = new THREE.TorusGeometry(d.headXr * 0.17, d.headXr * 0.025, 3, 8, Math.PI * 0.7);
    smile.rotateZ(Math.PI + Math.PI * 0.15); // the arc's middle at the bottom: a smile
    smile.translate(0, headCY + my + d.headXr * 0.12, onFace(d, 0, my, -0.003));
    out.push(part(smile, LIP, 'head'));
    if (look.glasses) {
      for (const sd of [-1, 1]) {
        const ring = new THREE.TorusGeometry(eyeR * 2.0, d.headXr * 0.022, 3, 12);
        ring.translate(sd * eyeX, headCY + eyeY, onFace(d, sd * eyeX, eyeY, 0.012));
        out.push(part(ring, GLASSES, 'head'));
      }
      const bridge = new THREE.CapsuleGeometry(d.headXr * 0.02, eyeX * 2 - eyeR * 4.2, 1, 3).rotateZ(Math.PI / 2);
      bridge.translate(0, headCY + eyeY + eyeR * 0.6, onFace(d, 0, eyeY, 0.012));
      out.push(part(bridge, GLASSES, 'head'));
    }
  }
  // ---- hair ----
  const style = HAIR_STYLES[look.hairStyle] ?? HAIR_STYLES.short;
  const hatOn = !!look.hat;
  const shell = hatOn ? { ...style, top: 0.3 * Math.PI } : style;
  if (!(hatOn && look.hairStyle === 'bald')) {
    out.push(part(hairShell(d, shell, ...S.hair).translate(0, headCY, 0), look.hair, 'head'));
  }
  const hy = headCY;
  if (look.hairStyle === 'ponytail' && !hatOn) {
    out.push(part(ellipsoid(d.headXr * 0.28, d.headYr * 0.62, d.headZr * 0.3, ...S.hand).rotateX(-0.5).translate(0, hy - d.headYr * 0.25, d.headZr * 1.12), look.hair, 'head'));
  } else if (look.hairStyle === 'bun' && !hatOn) {
    out.push(part(ellipsoid(d.headXr * 0.38, d.headXr * 0.36, d.headXr * 0.38, ...S.hand).translate(0, hy + d.headYr * 0.5, d.headZr * 0.8), look.hair, 'head'));
  } else if (look.hairStyle === 'pigtails') {
    for (const sd of [-1, 1]) {
      out.push(part(ellipsoid(d.headXr * 0.26, d.headYr * 0.42, d.headXr * 0.26, ...S.hand).rotateZ(sd * 0.4).translate(sd * d.headXr * 1.08, hy - d.headYr * 0.32, d.headZr * 0.25), look.hair, 'head'));
    }
  } else if (look.hairStyle === 'long') {
    out.push(part(ellipsoid(d.headXr * 0.95, d.headYr * 0.95, d.headZr * 0.36, ...S.hair).translate(0, hy - d.headYr * 0.75, d.headZr * 0.62), look.hair, 'head'));
  }
  // ---- hats ----
  if (hatOn) {
    const k = 1.1;
    if (look.hat.kind === 'bobble') {
      out.push(part(hairShell(d, { front: 0.3 * Math.PI, side: 0.42 * Math.PI, back: 0.5 * Math.PI, thick: 1.13 }, ...S.hair).translate(0, hy, 0), look.hat.color, 'head'));
      out.push(part(ellipsoid(d.headXr * 0.3, d.headXr * 0.3, d.headXr * 0.3, ...S.hand).translate(0, hy + d.headYr * 1.16, 0), 0xf4f0e8, 'head'));
    } else if (look.hat.kind === 'cap') {
      out.push(part(hairShell(d, { front: 0.27 * Math.PI, side: 0.34 * Math.PI, back: 0.42 * Math.PI, thick: 1.12 }, ...S.hair).translate(0, hy, 0), look.hat.color, 'head'));
      out.push(part(ellipsoid(d.headXr * 0.85, d.headYr * 0.05, d.headZr * 0.5, ...S.foot).translate(0, hy + d.headYr * 0.5, -d.headZr * 0.82), darken(look.hat.color, 0.9), 'head'));
    } else if (look.hat.kind === 'sunhat') {
      out.push(part(hairShell(d, { front: 0.3 * Math.PI, side: 0.36 * Math.PI, back: 0.4 * Math.PI, thick: 1.14 }, ...S.hair).translate(0, hy, 0), look.hat.color, 'head'));
      out.push(part(new THREE.CylinderGeometry(d.headXr * 2.0 * k, d.headXr * 2.05 * k, d.headYr * 0.05, S.torso + 4).translate(0, hy + d.headYr * 0.48, 0), look.hat.color, 'head'));
    }
  }
  return out;
}

// The joints: a Bone each, parented as a body is, at their rest places.
function makeBones(d) {
  const b = {};
  for (const n of J) { b[n] = new THREE.Bone(); b[n].name = n; }
  const at = {
    root: [0, 0, 0],
    pelvis: [0, d.hipY, 0],
    chest: [0, d.waistY, 0],
    neck: [0, d.neckY, 0],
    head: [0, d.chinY + d.headYr * 0.4, 0],
    upperArmL: [-d.shoulderX, d.shoulderY, 0], forearmL: [-d.shoulderX, d.shoulderY - d.upperArm, 0], handL: [-d.shoulderX, d.shoulderY - d.upperArm - d.forearm, 0],
    upperArmR: [d.shoulderX, d.shoulderY, 0], forearmR: [d.shoulderX, d.shoulderY - d.upperArm, 0], handR: [d.shoulderX, d.shoulderY - d.upperArm - d.forearm, 0],
    thighL: [-d.hipX, d.hipY, 0], shinL: [-d.hipX, d.kneeY, 0], footL: [-d.hipX, d.ankleY, 0],
    thighR: [d.hipX, d.hipY, 0], shinR: [d.hipX, d.kneeY, 0], footR: [d.hipX, d.ankleY, 0],
  };
  const parent = {
    pelvis: 'root', chest: 'pelvis', neck: 'chest', head: 'neck',
    upperArmL: 'chest', forearmL: 'upperArmL', handL: 'forearmL',
    upperArmR: 'chest', forearmR: 'upperArmR', handR: 'forearmR',
    thighL: 'pelvis', shinL: 'thighL', footL: 'shinL',
    thighR: 'pelvis', shinR: 'thighR', footR: 'shinR',
  };
  for (const n of J) {
    const p = parent[n];
    const [x, y, z] = at[n];
    if (p) {
      const [px, py, pz] = at[p];
      b[n].position.set(x - px, y - py, z - pz);
      b[p].add(b[n]);
    } else b[n].position.set(x, y, z);
    b[n].userData.rest = b[n].position.clone();
  }
  for (const n of ['pelvis', 'chest', 'neck', 'head']) b[n].rotation.order = 'YXZ';
  return b;
}

// buildPerson(def) -> { figure, look, bones, near, far, setDetail(which), stats }
// figure: a Group holding the joints and two skinned meshes (near and far
// detail) bound to the one skeleton; only one is visible, so it is one draw.
export function buildPerson(def = {}, { material } = {}) {
  const look = personFor(def);
  const d = look.dims;
  const figure = new THREE.Group();
  figure.name = 'person';
  const bones = makeBones(d);
  figure.add(bones.root);
  const mat = material ?? new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.86, metalness: 0 });
  const make = (near) => {
    const geo = mergeGeometries(personParts(look, near), false);
    geo.computeBoundingBox();
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, d.H * 0.5, 0), d.H * 0.75); // posed people stay inside it
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = near ? 'person-near' : 'person-far';
    mesh.frustumCulled = true;
    figure.add(mesh);
    return mesh;
  };
  const near = make(true);
  const far = make(false);
  figure.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(J.map((n) => bones[n]));
  near.bind(skeleton);
  far.bind(skeleton);
  far.visible = false;
  const tri = (m) => m.geometry.index.count / 3;
  const person = {
    figure, look, bones, near, far, skeleton,
    stats: { nearTris: tri(near), farTris: tri(far), joints: J.length },
    setDetail(which) { near.visible = which !== 'far'; far.visible = which === 'far'; },
  };
  return person;
}

// ---- poses ---------------------------------------------------------------------
function reset(p) {
  for (const n of J) { const b = p.bones[n]; b.rotation.set(0, 0, 0); b.position.copy(b.userData.rest); }
}

const SOLE = new THREE.Vector3();
const INV = new THREE.Matrix4();
// Lower the hips until the lower foot's sole is on the ground (y 0 in the
// figure's frame): no floating feet in a stride, a crouch sinks for real.
function groundFeet(p) {
  const d = p.look.dims;
  p.figure.updateMatrixWorld(true);
  INV.copy(p.figure.matrixWorld).invert();
  let minY = Infinity;
  for (const n of ['footL', 'footR']) {
    const m = p.bones[n].matrixWorld;
    for (const [dz, dy] of [[d.footLen * 0.24, 0], [-d.footLen * 0.72, 0], [-d.footLen * 0.3, 0]]) {
      SOLE.set(0, -d.ankleY + 0.004 + dy, dz).applyMatrix4(m).applyMatrix4(INV);
      minY = Math.min(minY, SOLE.y);
    }
  }
  // and the kneecaps, so a kneel rests on its knee
  for (const n of ['shinL', 'shinR']) {
    SOLE.set(0, -0.02 * d.s, -d.shR[0]).applyMatrix4(p.bones[n].matrixWorld).applyMatrix4(INV);
    minY = Math.min(minY, SOLE.y);
  }
  p.bones.pelvis.position.y -= minY;
}

// Arms hang a little out from the body and a little bent.
function relaxedArms(B, t, k = 1) {
  for (const [sd, L] of [[-1, 'L'], [1, 'R']]) {
    B[`upperArm${L}`].rotation.z = sd * 0.1 * k;
    B[`upperArm${L}`].rotation.x = 0.04;
    B[`forearm${L}`].rotation.x = 0.18 + 0.03 * Math.sin(t * 0.7 + sd);
  }
}

// Keep each foot flat on the ground under its leg.
function flatFeet(B) {
  for (const L of ['L', 'R']) {
    B[`foot${L}`].rotation.x = -(B[`thigh${L}`].rotation.x + B[`shin${L}`].rotation.x);
    B[`foot${L}`].rotation.z = -(B.pelvis.rotation.z + B[`thigh${L}`].rotation.z);
  }
}

// A look at a direction (yaw: radians to the figure's left is +, pitch: up +),
// shared between the chest, the neck and the head, the head doing most.
function lookToward(B, yaw = 0, pitch = 0) {
  const y = THREE.MathUtils.clamp(yaw, -1.3, 1.3);
  const pi = THREE.MathUtils.clamp(pitch, -0.7, 0.4);
  B.chest.rotation.y += y * 0.18;
  B.neck.rotation.y += y * 0.37;
  B.head.rotation.y += y * 0.45;
  B.neck.rotation.x += pi * 0.4;
  B.head.rotation.x += pi * 0.6;
}

function stoop(p) {
  const B = p.bones;
  const k = p.look.dims.stoop;
  if (!k) return;
  B.chest.rotation.x -= 0.15 * k;
  B.neck.rotation.x += 0.1 * k;
  B.head.rotation.x += 0.06 * k;
}

// pose(p, spec): spec { mode: 'stand' | 'walk' | 'wave' | 'crouch' | 'juggle',
//   t (seconds), phase (the stride, radians), lookYaw, lookPitch }
export function pose(p, spec = {}) {
  const B = p.bones;
  const t = spec.t ?? 0;
  const mode = spec.mode ?? 'stand';
  const child = p.look.kind === 'child';
  const older = p.look.kind === 'older';
  reset(p);
  if (mode === 'walk') {
    const ph = spec.phase ?? 0;
    const A = older ? 0.3 : child ? 0.46 : 0.4;
    for (const [sd, L] of [[-1, 'L'], [1, 'R']]) {
      const lp = ph + (sd > 0 ? Math.PI : 0);
      const th = A * Math.sin(lp);
      const knee = 0.07 + 0.95 * Math.max(0, Math.cos(lp + 0.35)) ** 2 + 0.12 * Math.max(0, Math.sin(lp)) * Math.max(0, -Math.cos(lp));
      B[`thigh${L}`].rotation.x = th;
      B[`shin${L}`].rotation.x = -knee;
      B[`foot${L}`].rotation.x = -(th - knee) * 0.8 - 0.18 * Math.max(0, Math.cos(lp)) * Math.max(0, -Math.sin(lp + 0.6));
      // arms swing with the other leg
      B[`upperArm${L}`].rotation.x = sd * A * 0.75 * Math.sin(ph);
      B[`upperArm${L}`].rotation.z = sd * 0.07;
      B[`forearm${L}`].rotation.x = 0.22 + 0.32 * Math.max(0, B[`upperArm${L}`].rotation.x / A);
    }
    B.pelvis.rotation.y = 0.08 * Math.sin(ph);
    B.chest.rotation.y = -0.12 * Math.sin(ph);
    B.neck.rotation.y = 0.04 * Math.sin(ph);
    B.pelvis.rotation.z = 0.025 * Math.cos(2 * ph);
    B.chest.rotation.x = -0.05;
    stoop(p);
  } else if (mode === 'crouch') {
    // down on one knee to her height (a hello, at the Fairground's distance):
    // the right knee on the ground, the left foot flat, a hand held out low
    // and still, palm down, for her to come to if she likes
    B.thighL.rotation.x = 1.4; B.thighL.rotation.z = -0.12; B.shinL.rotation.x = -1.45;
    B.thighR.rotation.x = -0.15; B.thighR.rotation.z = 0.06; B.shinR.rotation.x = -1.4;
    flatFeet(B);
    B.footR.rotation.x = 0.55; // toes tucked under
    B.chest.rotation.x = -0.28;
    B.neck.rotation.x = 0.12;
    B.upperArmR.rotation.x = 0.85; B.upperArmR.rotation.z = 0.08; B.forearmR.rotation.x = 0.3; B.handR.rotation.y = -1.3;
    B.upperArmL.rotation.x = 0.5; B.upperArmL.rotation.z = -0.1; B.forearmL.rotation.x = 1.0;
  } else {
    // standing, with a slow weight shift from one leg to the other
    const ph = t * (child ? 0.8 : 0.5) + p.look.seed * TAU;
    const s = Math.sin(ph);
    const amp = child ? 1.4 : older ? 0.6 : 1;
    B.pelvis.position.x += 0.014 * p.look.dims.s * s * amp;
    B.pelvis.rotation.z = 0.035 * s * amp;
    B.chest.rotation.z = -0.045 * s * amp;
    B.neck.rotation.z = 0.02 * s * amp;
    B.chest.rotation.x = -0.01 + 0.012 * Math.sin(t * 1.7); // breathing
    for (const [sd, L] of [[-1, 'L'], [1, 'R']]) {
      const relaxed = Math.max(0, -sd * s) * amp; // the leg the weight has left
      B[`thigh${L}`].rotation.x = 0.02 + 0.07 * relaxed;
      B[`thigh${L}`].rotation.z = -B.pelvis.rotation.z * 0.8;
      B[`shin${L}`].rotation.x = -(0.04 + 0.16 * relaxed + (older ? 0.08 : 0));
    }
    flatFeet(B);
    relaxedArms(B, t, older ? 0.8 : 1);
    stoop(p);
    if (mode === 'wave') {
      // a real wave: the right arm up and out, the elbow bent, the palm to her,
      // the forearm swinging from the elbow
      B.upperArmR.rotation.z = 1.95 + 0.04 * Math.sin(t * 7);
      B.upperArmR.rotation.x = 0.12;
      B.forearmR.rotation.x = 0;
      B.forearmR.rotation.z = 1.05 + 0.38 * Math.sin(t * 7);
      B.handR.rotation.y = -Math.PI / 2;
      B.handR.rotation.z = 0.15 * Math.sin(t * 7 + 0.6);
      B.head.rotation.z = -0.08;
    } else if (mode === 'juggle') {
      for (const [sd, L] of [[-1, 'L'], [1, 'R']]) {
        B[`upperArm${L}`].rotation.x = 0.35 + 0.12 * Math.sin(t * 4.6 + (sd > 0 ? 0 : Math.PI));
        B[`upperArm${L}`].rotation.z = sd * 0.12;
        B[`forearm${L}`].rotation.x = 1.25;
        B[`hand${L}`].rotation.y = sd * 0.6;
      }
    }
  }
  lookToward(B, spec.lookYaw ?? 0, spec.lookPitch ?? 0);
  groundFeet(p);
}

// The yaw and pitch (figure frame) from the figure's head to a world point.
const _hw = new THREE.Vector3();
const _q = new THREE.Quaternion();
export function lookAngles(p, world) {
  p.figure.updateMatrixWorld(true);
  p.bones.head.getWorldPosition(_hw);
  const dir = world.clone().sub(_hw);
  p.figure.getWorldQuaternion(_q);
  dir.applyQuaternion(_q.invert());
  const yaw = Math.atan2(-dir.x, -dir.z);
  const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
  return { yaw, pitch };
}

// For the crowd shot: the stride phase for metres walked (one full cycle is
// two steps; a step is about 0.8 of the leg's length).
export function strideFor(p, metres) {
  const legLen = p.look.dims.hipY;
  return (metres / (legLen * 1.6)) * TAU;
}
