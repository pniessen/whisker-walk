// The Pines' three Warrior-Cats landmarks as low-poly, faceted solids: the two
// truce stones by the bridge foot, the Lightning Stump by the east path and
// the Frog Stones in the deep swamp. Each used to be a plain 7-sided cylinder
// and read as a grey drum.
//
// Every builder here is PURE: it returns typed arrays and constructs no Three
// object at all. That matters because Three draws four Math.random calls for
// the uuid of every Object3D, geometry and material it makes, and
// test/waterlooks.test.js pins the Pines build's draw count; pines.js keeps
// its exact sequence of `new THREE.*` calls and only fills the geometry it
// already makes (`fillGeometry`). Jitter is seeded (rng.js), never random.
//
// Each solid is a stack of rings (a lumpy prism) closed by a top, written as
// separate triangles (no shared vertices) so computeVertexNormals gives flat
// facets: the same faceted look as the game's rocks. Colours are per vertex,
// sRGB hex converted to the linear values Three's colour management expects.
//
// The shapes keep two promises the cats rely on (test/pineslandmarks.test.js):
//   * the foot: below y 0.3 every vertex lies within the collider radius, and
//     nowhere beyond it by more than 0.08, so a cat walking round a landmark
//     neither stops short of it nor clips into it;
//   * the perch: the Lightning Stump's and the Frog Stones' tops are flat at
//     the perch height within 0.4 m of the centre, where a cat stands.

import { BufferAttribute } from 'three';
import { mulberry32, seedFromCode } from '../rng.js';

const TAU = Math.PI * 2;

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgb(hex) {
  return [
    srgbToLinear(((hex >> 16) & 255) / 255),
    srgbToLinear(((hex >> 8) & 255) / 255),
    srgbToLinear((hex & 255) / 255),
  ];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function scale(a, k) {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// A seeded stream of numbers in [0, 1) for one named landmark.
function stream(key) {
  return mulberry32(seedFromCode(key));
}

// Collects triangles into flat, unshared arrays. `colour(p, c, n)` is asked
// for each corner p with the triangle's centroid c and its unnormalised
// face normal n, and returns a linear [r, g, b].
function triKit(colour) {
  const pos = [];
  const col = [];
  const uv = [];
  const tri = (a, b, c) => {
    const cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      const k = colour(p, cen, n);
      col.push(k[0], k[1], k[2]);
      // cylindrical, one tile a metre round and up (the surface map, if any)
      const ang = Math.atan2(cen[2], cen[0]);
      uv.push(ang * Math.hypot(p[0], p[2]), p[1]);
    }
  };
  // a quad a-b-c-d (counter-clockwise seen from outside) as two triangles
  const quad = (a, b, c, d) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  const done = () => {
    const n = pos.length / 3;
    const index = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) index[i] = i;
    return {
      position: new Float32Array(pos),
      color: new Float32Array(col),
      uv: new Float32Array(uv),
      index,
    };
  };
  return { tri, quad, done };
}

// The side walls between consecutive rings (each ring an array of [x, y, z]
// going round counter-clockwise seen from above, i.e. increasing angle in
// the x→z plane, which faces outward with this winding).
function walls(kit, rings) {
  for (let r = 0; r + 1 < rings.length; r++) {
    const lo = rings[r];
    const hi = rings[r + 1];
    const n = lo.length;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      kit.quad(lo[k], hi[k], hi[k1], lo[k1]);
    }
  }
}

// A fan from a ring up (or across) to one apex.
function fan(kit, ring, apex) {
  const n = ring.length;
  for (let k = 0; k < n; k++) kit.tri(ring[k], apex, ring[(k + 1) % n]);
}

const ringAt = (n, k, phase = 0) => (k / n) * TAU + phase;

// --- the truce stones ---------------------------------------------------------

const STONE = rgb(0x7a8270);
const MOSS = rgb(0x5f7a3e);
const LICHEN = rgb(0xb8c09a);
const DAMP_FOOT = rgb(0x4f5546);

// A rough standing stone `h` tall standing in a collider of radius `r`: nine
// sides, four lumpy rings tapering up, a domed and slightly tilted top, the
// whole leaning a few degrees (≤ 6°) in a seeded direction. Grey-green,
// darker at the foot, moss over the top and down the north (-z) face, pale
// lichen flecks here and there.
export function standingStoneData(seedKey, r, h) {
  const rnd = stream(`standing-stone:${seedKey}`);
  const sides = 9;
  const phase = rnd() * TAU;
  const leanDir = rnd() * TAU;
  const lean = Math.tan((2.5 + rnd() * 3.5) * Math.PI / 180); // 2.5°..6°
  const lx = Math.cos(leanDir) * lean;
  const lz = Math.sin(leanDir) * lean;
  // one radial lump per side, shared up the stone so its faces run up it
  const lump = Array.from({ length: sides }, () => 1 + (rnd() * 2 - 1) * 0.12);
  // [height fraction, radius fraction]; the foot is within r even at +12%
  const profile = [[0, 0.88], [0.3, 0.84], [0.62, 0.7], [0.86, 0.52]];
  const rings = profile.map(([fy, fr], ri) => {
    const y0 = fy * h;
    return Array.from({ length: sides }, (_, k) => {
      const a = ringAt(sides, k, phase);
      const j = ri === 0 ? lump[k] : lump[k] * (1 + (rnd() * 2 - 1) * 0.05);
      const rr = r * fr * Math.min(j, ri === 0 ? 1.12 : 1.17);
      // the shoulder ring tilts: one side a little lower than the other
      const tilt = ri === profile.length - 1 ? Math.cos(a - leanDir - 1.3) * 0.05 * h : 0;
      return [Math.cos(a) * rr + lx * y0, y0 + tilt, Math.sin(a) * rr + lz * y0];
    });
  });
  const apex = [lx * h * 0.97 + r * 0.06 * Math.cos(leanDir + 2), h * (0.97 + rnd() * 0.03), lz * h * 0.97 + r * 0.06 * Math.sin(leanDir + 2)];
  const salt = seedFromCode(seedKey) % 997;
  const colour = (p, c, n) => {
    const t = clamp01(p[1] / h);
    let k = mix(DAMP_FOOT, STONE, clamp01(t / 0.35));
    // moss: the top, and the north face (normal toward -z) from mid-height up
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    const up = n[1] / nl;
    const north = -n[2] / nl;
    const mossAmt = clamp01((up - 0.35) * 2) + clamp01(north - 0.2) * clamp01((t - 0.25) * 2.5) * 0.9;
    k = mix(k, MOSS, clamp01(mossAmt));
    // lichen flecks, by hash of the vertex, on about 15% of the corners
    const fleck = hashUnit(p[0] * 7.1 + salt, p[1] * 5.3, p[2] * 6.7);
    if (fleck < 0.15) k = mix(k, LICHEN, 0.75);
    return scale(k, 0.94 + hashUnit(c[0], c[1] + salt, c[2]) * 0.1);
  };
  const kit = triKit(colour);
  walls(kit, rings);
  fan(kit, rings[rings.length - 1], apex);
  return kit.done();
}

// A small deterministic hash in [0, 1) of three numbers (no state).
function hashUnit(a, b, c) {
  const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

// --- the Lightning Stump ------------------------------------------------------

const BARK = rgb(0x3e342c);
const CHAR = rgb(0x1e1a18);
const SCAR_A = rgb(0xd8cbb0);
const SCAR_B = rgb(0xc0ae8a);

// The pine the lightning snapped: ten sides, the foot flared to `r` (the
// collider), the trunk tapering to `rTop` and broken off at `h` (the perch).
// The top is a flat standing area at h out to r 0.5, ringed by a jagged rim
// of splinters rising 0.15–0.45 m on about half of it, with one deep V-notch
// where it split down the east side (+x) to h − 0.6. A pale scar where the
// bark came off runs down the west side (-x) from the top to about 0.5 m.
// Bark darkening to char toward the top.
//
// The rim stays low (≤ h + 0.08) on the four compass lines, so the chase
// camera sees the golden mouse sitting on the centre from every side
// (test/pines.test.js "in sight from the chase camera").
export function lightningStumpData(r, h, rTop) {
  const rnd = stream('lightning-stump');
  const sides = 10;
  const ring = (y, rr, jitter) => Array.from({ length: sides }, (_, k) => {
    const a = ringAt(sides, k);
    const q = rr * (1 + (rnd() * 2 - 1) * jitter);
    return [Math.cos(a) * q, y, Math.sin(a) * q];
  });
  // foot flare, jittered inward only so the foot stays within the collider
  const foot = Array.from({ length: sides }, (_, k) => {
    const a = ringAt(sides, k);
    const q = r * (1 - rnd() * 0.04);
    return [Math.cos(a) * q, 0, Math.sin(a) * q];
  });
  const rings = [
    foot,
    ring(0.28, r * 0.9, 0.02),
    ring(0.75, rTop * 1.04, 0.03),
    ring(1.2, rTop * 1.01, 0.03),
  ];
  // The rim: the ten wall corners plus a tooth between each pair.
  const RIM_R = rTop;
  const cardinal = (deg) => {
    const m = ((deg % 90) + 90) % 90;
    return m < 1e-6 || 90 - m < 1e-6;
  };
  const rim = [];
  for (let i = 0; i < sides * 2; i++) {
    const deg = i * (360 / (sides * 2));
    const a = (deg * Math.PI) / 180;
    const q = RIM_R * (1 + (rnd() * 2 - 1) * 0.03);
    const roll = rnd();
    const tall = rnd();
    let y = h + 0.02 + roll * 0.05;
    if (i === 0) y = h - 0.6; // the split, on +x
    else if (i === 1 || i === sides * 2 - 1) y = h + 0.3 + tall * 0.15; // the split's two lips
    else if (!cardinal(deg) && roll < 0.55) y = h + 0.15 + tall * 0.3;
    rim.push([Math.cos(a) * q, y, Math.sin(a) * q]);
  }
  // the flat standing area: a ring at r 0.5, all at h, and the centre
  const inner = Array.from({ length: sides }, (_, k) => {
    const a = ringAt(sides, k);
    return [Math.cos(a) * 0.5, h, Math.sin(a) * 0.5];
  });
  const centre = [0, h, 0];

  const colour = (p, c, n) => {
    const t = clamp01(p[1] / h);
    // bark up to about half way, charring toward the broken top
    let k = mix(BARK, CHAR, clamp01((t - 0.5) / 0.5));
    // the broken top and the splinters' inner faces: raw, charred wood
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    if (n[1] / nl > 0.55) k = mix(CHAR, BARK, 0.35);
    // the scar: the wall faces round -x, from about 0.5 m to the top
    const ang = Math.atan2(c[2], c[0]); // -x is ±π
    const offWest = Math.PI - Math.abs(ang);
    if (offWest < 0.4 && n[1] / nl < 0.55 && p[1] >= 0.5) {
      k = hashUnit(p[0] * 3.1, p[1] * 4.7, p[2] * 2.3) < 0.5 ? SCAR_A : SCAR_B;
    }
    return scale(k, 0.95 + hashUnit(c[0] * 1.7, c[1] * 2.9, c[2] * 3.3) * 0.2);
  };
  const kit = triKit(colour);
  walls(kit, rings);
  // the top wall ring (10) up to the 20-point rim
  const top = rings[rings.length - 1];
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    const a = rim[2 * k];
    const m = rim[2 * k + 1];
    const b = rim[(2 * k + 2) % (sides * 2)];
    kit.tri(top[k], a, m);
    kit.tri(top[k], m, top[k1]);
    kit.tri(top[k1], m, b);
  }
  // the rim in to the flat ring (the splinters' inner faces)
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    const a = rim[2 * k];
    const m = rim[2 * k + 1];
    const b = rim[(2 * k + 2) % (sides * 2)];
    kit.tri(a, inner[k], m);
    kit.tri(inner[k], inner[k1], m);
    kit.tri(m, inner[k1], b);
  }
  // the flat top
  for (let k = 0; k < sides; k++) kit.tri(inner[k], centre, inner[(k + 1) % sides]);
  return kit.done();
}

// --- the Frog Stones ----------------------------------------------------------

// The Frog Stones' tall stone: a squat, rounded boulder `h` tall in a
// collider of radius `r`. Eleven sides, five rings: a damp foot within r, a
// belly bulging to at most r + 0.05 at 35% of its height, rounded shoulders,
// and a flat top at h out to r 0.45. Moss over the top and down the north
// side, grey-green stone elsewhere, a darker damp foot.
export function frogStoneData(r, h) {
  const rnd = stream('frog-stones');
  const sides = 11;
  const phase = 0.21;
  // [y, radius, jitter]
  const profile = [
    [0, r * 0.95, 0.04],
    [0.35 * h, r + 0.02, 0.03],
    [0.66 * h, r * 0.9, 0.04],
    [0.88 * h, r * 0.7, 0.05],
    [h, 0.45, 0],
  ];
  const rings = profile.map(([y, rr, jit], ri) => Array.from({ length: sides }, (_, k) => {
    const a = ringAt(sides, k, phase);
    let q = rr * (1 + (rnd() * 2 - 1) * jit);
    if (ri === 0) q = Math.min(q, r);
    if (ri === 1) q = Math.min(q, r + 0.05);
    return [Math.cos(a) * q, y, Math.sin(a) * q];
  }));
  const centre = [0, h, 0];
  const colour = (p, c, n) => {
    const t = clamp01(p[1] / h);
    let k = mix(DAMP_FOOT, STONE, clamp01(t / 0.3));
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    const up = n[1] / nl;
    const north = -n[2] / nl;
    const mossAmt = clamp01((up - 0.3) * 2.2) + clamp01(north - 0.1) * clamp01((t - 0.2) * 2) * 0.95;
    k = mix(k, MOSS, clamp01(mossAmt));
    if (hashUnit(p[0] * 5.9, p[1] * 3.7, p[2] * 4.1) < 0.12) k = mix(k, LICHEN, 0.6);
    return scale(k, 0.92 + hashUnit(c[0] * 2.3, c[1] * 1.9, c[2] * 2.7) * 0.14);
  };
  const kit = triKit(colour);
  walls(kit, rings);
  fan(kit, rings[rings.length - 1], centre);
  return kit.done();
}

// Sets `data` onto an EXISTING geometry: position, colour, uv and index, and
// the normals (flat facets, since no vertex is shared) when `data` has none.
// Constructs no Three object that draws a uuid (BufferAttributes have none).
export function fillGeometry(geo, data) {
  geo.setAttribute('position', new BufferAttribute(data.position, 3));
  if (data.color) geo.setAttribute('color', new BufferAttribute(data.color, 3));
  if (data.uv) geo.setAttribute('uv', new BufferAttribute(data.uv, 2));
  geo.setIndex(new BufferAttribute(data.index, 1));
  if (data.normal) geo.setAttribute('normal', new BufferAttribute(data.normal, 3));
  else geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}
