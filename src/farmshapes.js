// =============================================================================
// The shapes Appletree Farm's animals are made of (src/farmmodels.js puts them
// together into a cow, a goat, a collie, a hen, a chick and a duckling).
//
// An animal here is not a pile of boxes and balls: each soft part is LOFTED, a
// skin drawn over a row of cross-sections along a spine, the way the cat's
// torso is one deformed shell (src/cat/torso.js). A cross-section has its own
// width, its own height above and below the spine, a flatter or rounder top
// and bottom and a pinch that makes the top narrower than the belly, so a
// dozen numbers a ring draw a barrel with a flat back, a deep chest, a keel
// under a neck or a knee on a leg.
//
// Every geometry made here is indexed, smooth-shaded, and carries a colour per
// corner and a texture coordinate, so any of them merge into one mesh and all
// of them wear the one material (farmAnimalMaterial, farmmodels.js). Nothing
// here is called per frame.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _d = new THREE.Color();

// ---- the patched cow's coat ------------------------------------------------------------------
// The one texture the animals' material carries: white everywhere but the
// black-and-white cow's patches. A patch drawn in a picture has a clean curved
// edge however coarse the mesh under it is (coloured per corner, the same
// patches came out as rows of saw teeth). Every other animal, and every other
// part of that cow, points all its corners at one white texel (WHITE_UV), so
// the picture changes nothing there.
//
// The picture is the cow's barrel unrolled: across it, rump to chest (COAT.Z0
// to COAT.Z1, in the model's metres); up it, once round the barrel from the
// belly line over the spine and back to the belly line (COAT.GIRTH metres).
export const COAT = Object.freeze({ Z0: -0.96, Z1: 0.9, GIRTH: 2.6, SIZE: 256 });
export const WHITE_UV = Object.freeze([0.5, 0.004]);
// Each patch: [along, round, half-length, half-height, a wobble of its own].
// Round is metres from the spine, + down her right side and - down her left.
const PATCHES = [
  [0.9, 0.0, 0.5, 0.86, 0.4],     // shoulders and withers, joined to her dark neck
  [0.05, 0.52, 0.3, 0.4, 2.1],    // a saddle patch on her right side
  [-0.2, -0.62, 0.36, 0.34, 4.0], // two on her left
  [0.28, -0.3, 0.2, 0.24, 1.2],
  [-0.92, 0.06, 0.4, 0.66, 5.3],  // the rump, round the root of her tail
];
// How dark (0 coat, 1 patch) the coat is `s` metres along and `a` round.
export function patchAt(s, a) {
  if (Math.abs(a) > 1.16) return 0; // her belly line is plain coat (WHITE_UV sits on it)
  let k = 0;
  for (const [ps, pa, rs, ra, ph] of PATCHES) {
    const ds = (s - ps) / rs;
    const da = (a - pa) / ra;
    const at = Math.atan2(da, ds);
    const edge = 1 + 0.11 * Math.sin(3 * at + ph) + 0.06 * Math.sin(5 * at + 2.3 * ph) + 0.03 * Math.sin(9 * at + ph);
    const t = Math.min(1, Math.max(0, (edge - Math.hypot(ds, da)) / 0.07 + 0.5));
    k = Math.max(k, t * t * (3 - 2 * t));
  }
  return k;
}
// The texture coordinate of a point on the barrel: z along, v the way round (0..1, 0.5 the spine).
export const coatUV = (z, v) => [(z - COAT.Z0) / (COAT.Z1 - COAT.Z0), v];

let coat = null;
// coatTexture(coatHex, patchHex) → the shared picture. Built once and kept for
// good: it is a quarter of a megabyte, and a walk's end frees the material
// that carries it, not this.
export function coatTexture(coatHex, patchHex) {
  if (coat) return coat;
  const n = COAT.SIZE;
  const data = new Uint8Array(n * n * 4);
  // sRGB bytes. The corner colour under it is the coat's, so the picture holds
  // the patch as a share of the coat: white where there is none.
  const share = [0, 1, 2].map((i) => {
    const sh = 16 - 8 * i;
    return Math.min(1, ((patchHex >> sh) & 255) / ((coatHex >> sh) & 255));
  });
  for (let j = 0; j < n; j++) {
    const a = ((j + 0.5) / n - 0.5) * COAT.GIRTH;
    for (let i = 0; i < n; i++) {
      const s = COAT.Z0 + ((i + 0.5) / n) * (COAT.Z1 - COAT.Z0);
      const k = patchAt(s, a);
      const o = (j * n + i) * 4;
      for (let ch = 0; ch < 3; ch++) data[o + ch] = Math.round(255 * (1 + (share[ch] - 1) * k));
      data[o + 3] = 255;
    }
  }
  coat = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  coat.colorSpace = THREE.SRGBColorSpace;
  coat.magFilter = THREE.LinearFilter;
  coat.minFilter = THREE.LinearMipmapLinearFilter;
  coat.generateMipmaps = true;
  coat.needsUpdate = true;
  return coat;
}

// ---- lofting ---------------------------------------------------------------------------------
// One number between p1 and p2 (t from 0 to 1), on a curve through all four
// that never overshoots them: a back drawn level between two rings stays level.
function between(p0, p1, p2, p3, t) {
  const d0 = p1 - p0, d1 = p2 - p1, d2 = p3 - p2;
  const m1 = d0 * d1 <= 0 ? 0 : (2 * d0 * d1) / (d0 + d1);
  const m2 = d1 * d2 <= 0 ? 0 : (2 * d1 * d2) / (d1 + d2);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
}

// What a section is read from between the keys. Its top and underside are
// read as themselves, not as a middle and two reaches, so a level back is
// exactly level.
const FIELDS = ['y', 'z', 'w', 'top', 'bottom', 'nt', 'nb', 'pinch'];
const ring = (k) => {
  const y = k.y ?? 0;
  const up = k.up ?? k.r ?? k.w, down = k.down ?? k.up ?? k.r ?? k.w;
  return { y, z: k.z ?? 0, w: k.w ?? k.r ?? 0.1, top: y + up, bottom: y - down, nt: k.nt ?? 2, nb: k.nb ?? 2, pinch: k.pinch ?? 0 };
};

// A ring for a body lying along z, given as its top, its underside and its
// widest height: at(z, top, bottom, halfWidth, { mid, nt, nb, pinch }).
export function at(z, top, bottom, w, { mid = (top + bottom) / 2, ...rest } = {}) {
  return { z, y: mid, w, up: top - mid, down: mid - bottom, ...rest };
}

// loft(keys, opts) → a skin over the cross-sections `keys`, in the order given.
//   key: { y, z, w, up, down, nt, nb, pinch } — the section's middle (it lies
//        in the animal's middle plane, x 0), its half-width, how far it reaches
//        above and below its middle, how square its top and bottom halves are
//        (2 an ellipse, 3 nearly a box, 1.3 a keel) and how much narrower its
//        top is than its bottom (0 none). `r` gives w, up and down at once.
//   opts.around   corners round each section (the seam, on the underside, has two)
//   opts.along    sections drawn: the keys are a smooth curve these are read from
//   opts.level    true keeps every section upright (a body along z); otherwise
//                 each is square to the spine where it sits (a neck, a leg, a horn)
//   opts.color    hex, or (x, y, z, u, v) => hex | [hexA, hexB, k]; u is the way
//                 along (0..1), v the way round (0 and 1 the underside, 0.5 the top)
//   opts.uv       (x, y, z, u, v) => [U, V]; everything else sits on WHITE_UV
//   opts.tipStart, opts.tipEnd   how far past its first and last section the
//                 skin is closed, to a point (0: closed flat)
export function loft(keys, { around = 10, along = keys.length, level = false, color = 0xffffff, uv = null, tipStart = 0, tipEnd = 0 } = {}) {
  const ks = keys.map(ring);
  const last = ks.length - 1;
  const rings = [];
  for (let i = 0; i < along; i++) {
    const f = along === 1 ? 0 : (i / (along - 1)) * last;
    const a = Math.min(last - 1, Math.floor(f));
    const t = f - a;
    if (along === ks.length) { rings.push(ks[i]); continue; }
    const r = {};
    for (const key of FIELDS) {
      const p1 = ks[a][key], p2 = ks[a + 1][key];
      const p0 = a > 0 ? ks[a - 1][key] : 2 * p1 - p2;
      const p3 = a + 2 <= last ? ks[a + 2][key] : 2 * p2 - p1;
      r[key] = between(p0, p1, p2, p3, t);
    }
    rings.push(r);
  }
  const cols = around + 1;
  const count = along * cols + 2;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const tex = new Float32Array(count * 2);
  const paint = (n, x, y, z, u, v) => {
    pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z;
    const got = typeof color === 'function' ? color(x, y, z, u, v) : color;
    if (Array.isArray(got)) _c.setHex(got[0]).lerp(_d.setHex(got[1]), got[2]);
    else _c.setHex(got);
    col[n * 3] = _c.r; col[n * 3 + 1] = _c.g; col[n * 3 + 2] = _c.b;
    const st = uv ? uv(x, y, z, u, v) : WHITE_UV;
    tex[n * 2] = st[0]; tex[n * 2 + 1] = st[1];
  };
  const dir = (i) => {
    if (level) return [0, 1];
    const a = rings[Math.max(0, i - 1)], b = rings[Math.min(along - 1, i + 1)];
    const len = Math.hypot(b.y - a.y, b.z - a.z) || 1;
    return [(b.y - a.y) / len, (b.z - a.z) / len];
  };
  for (let i = 0; i < along; i++) {
    const r = rings[i];
    const [ty, tz] = dir(i);
    const uy = tz, uz = -ty; // the section's own "up", square to the spine
    for (let j = 0; j < cols; j++) {
      const th = (j / around) * Math.PI * 2 + Math.PI; // from the underside, round over the top
      const s = Math.sin(th), c = Math.cos(th);
      const e = 2 / (c >= 0 ? r.nt : r.nb);
      const cc = Math.sign(c) * Math.abs(c) ** e;
      const lx = j === 0 || j === around ? 0 : Math.sign(s) * Math.abs(s) ** e * r.w * (1 - r.pinch * cc);
      const ly = cc * (c >= 0 ? r.top - r.y : r.y - r.bottom);
      paint(i * cols + j, lx, r.y + uy * ly, r.z + uz * ly, along === 1 ? 0 : i / (along - 1), j / around);
    }
  }
  const first = along * cols, end = first + 1;
  const [sy, sz] = dir(0), [ey, ez] = dir(along - 1);
  paint(first, 0, rings[0].y - sy * tipStart, rings[0].z - sz * tipStart, 0, 0.5);
  paint(end, 0, rings[along - 1].y + ey * tipEnd, rings[along - 1].z + ez * tipEnd, 1, 0.5);
  const index = [];
  for (let i = 0; i < along - 1; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * cols + j, b = a + cols;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  for (let j = 0; j < around; j++) {
    index.push(first, j, j + 1);
    const a = (along - 1) * cols + j;
    index.push(end, a + 1, a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(tex, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  // the seam's two columns are one line of skin: shade them as one
  const nor = g.getAttribute('normal');
  for (let i = 0; i < along; i++) {
    const a = i * cols, b = a + around;
    const x = nor.getX(a) + nor.getX(b), y = nor.getY(a) + nor.getY(b), z = nor.getZ(a) + nor.getZ(b);
    const len = Math.hypot(x, y, z) || 1;
    nor.setXYZ(a, x / len, y / len, z / len);
    nor.setXYZ(b, x / len, y / len, z / len);
  }
  return g;
}

// A ball (an egg, a bean: `scale` stretches it), its middle at the origin.
export function ball(r, { around = 8, rings = 5, color = 0xffffff, scale = null } = {}) {
  const keys = [];
  for (let i = 1; i <= rings; i++) {
    const a = (i / (rings + 1)) * Math.PI;
    keys.push({ y: 0, z: -r * Math.cos(a), r: r * Math.sin(a) });
  }
  const tip = r - r * Math.cos(Math.PI / (rings + 1));
  let paint = color;
  if (scale && typeof color === 'function') paint = (x, y, z, u, v) => color(x * scale[0], y * scale[1], z * scale[2], u, v);
  const g = loft(keys, { around, level: true, color: paint, tipStart: tip, tipEnd: tip });
  if (scale) g.scale(...scale);
  return g;
}

// Any of three's own shapes (a ring for a collar, a cone for a beak), in one colour.
export function solid(geo, color) {
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const tex = new Float32Array(n * 2);
  _c.setHex(color);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    tex[i * 2] = WHITE_UV[0]; tex[i * 2 + 1] = WHITE_UV[1];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(tex, 2));
  return geo;
}

// Turn (x, then y, then z), then move, a geometry where it belongs. `pre`
// moves it first (a limb by its own length, so it turns about its end).
export function put(g, { scale, pre, rot, at: to } = {}) {
  if (scale) g.scale(...scale);
  if (pre) g.translate(...pre);
  if (rot) { if (rot[0]) g.rotateX(rot[0]); if (rot[1]) g.rotateY(rot[1]); if (rot[2]) g.rotateZ(rot[2]); }
  if (to) g.translate(...to);
  return g;
}

// The same part on the animal's other side.
export function mirrored(g) {
  const m = g.clone();
  m.scale(-1, 1, 1);
  const index = m.getIndex();
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
  return m;
}
// A part and its mirror image: an ear and the other ear.
export const pair = (g) => [g, mirrored(g)];

export const merged = (pieces) => mergeGeometries(pieces, false);

// A colour part of the way from one to another, and a soft step for where.
export function mix(a, b, k) {
  return _c.setHex(a).lerp(_d.setHex(b), Math.min(1, Math.max(0, k))).getHex();
}
export function smooth(from, to, x) {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
}
