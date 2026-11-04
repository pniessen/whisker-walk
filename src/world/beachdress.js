// Seaside beach dressing (polish-beach).
//
// sandTint is a pure helper (no Three objects, no Math.random), so tests and
// the ground tint can call it freely. dressBeach adds the painted beach: one
// flat, noCast, vertex-coloured mesh ('beachPaint') lying just above the sand
// with a fresh seaweed tide line and a faint old wrack line on the wet band,
// wind ripples on the open front beach, a striped towel near the spawn, the
// beach umbrella's soft shade and the dug moats round the two sandcastles.
//
// Looks only: nothing here has a collider, a perch or a pickup, and the paint
// keeps off every find, rest, perch and prop (beachKeepOut) so a kid never
// mistakes a mark for the thing to look for.
//
// seaside.js imports this module and this module imports seaside.js, so
// nothing at this module's top level may read seaside.js's bindings: they are
// only used inside functions, which run after both modules have loaded.
import * as THREE from 'three';
import { hash01 } from './builder.js';
import { smoothField, PAINT_Y, Tris, lin, scale3, smoothstep, unit, dressMesh } from './dressing.js';
import { withLocalUuids } from './localuuids.js';
import { propsFor } from '../propsets.js';
import { DISCS } from '../rivalclans.js';
import { BEACH, WET_TINT, wetness } from './seaside.js';

// Linear multipliers [r, g, b] laid over the sand's authored colour. This is an
// authored variation (warmer, a touch darker, patchy over ~40m), not a fix for
// the sand texture: the speckle tile is left alone. The dry, pale, greyer back
// beach sits west of x -20 and blends in over 15m so it reads as drift sand
// under the dune grass. Smooth on purpose: the ground's vertices are 2.2m apart
// and must interpolate it faithfully.
export function sandTint(x, z) {
  const f = smoothField(x, z, 41, 22);
  const m = 1 + 0.06 * f;
  let r = 0.965 * m + 0.015 * f;
  let g = 0.94 * m;
  let b = 0.895 * m - 0.01 * f;
  const u = Math.min(1, Math.max(0, (-20 - x) / 15));
  const t = u * u * (3 - 2 * u);
  const lift = 1 + 0.03 * t;
  r *= lift;
  g *= lift;
  b *= lift * (1 + 0.02 * t);
  return [r, g, b];
}

// ---------------------------------------------------------------------------
// The painted beach (polish-beach Task 2).

// Paint on the wet band (x 21.8..25.4, y 0.008) sits above it; dry-sand paint
// sits on PAINT_Y. The towel is cloth lying on the sand, so it sits between
// the two, over the umbrella's shade, which darkens it where they overlap.
// All three are under the contact-shadow decals (0.015).
export const TIDE_Y = 0.011;
export const TOWEL_Y = 0.008;
const TIDE_FROM_X = 21.7;

// Where the beach things are, near the spawn on the bare front beach (the
// castles are Task 3's; their moats are painted here).
export const BEACH_SPOTS = Object.freeze({
  towel: Object.freeze({ x: 12.5, z: 39.5, yaw: 0.35 }),
  umbrella: Object.freeze({ x: 11.2, z: 40.6 }),
  castles: Object.freeze([Object.freeze({ x: 9.5, z: 28 }), Object.freeze({ x: 13.8, z: 4.5 })]),
});
const TOWEL = { w: 1.0, l: 1.9 };

// Every point the beach's paint and props must keep clear of, with its
// clearance r: the area record's finds, rests, perches and props, plus the
// scenery seaside.js places but does not list (rocks, bushes, billboard,
// benches, lamps), the props propsets.js places, the gold mice, the spawn,
// the dog's yard and the rival clan's disc. Reads `area`; never changes it.
export function beachKeepOut(area) {
  const out = [];
  const add = (list, r) => { for (const p of list || []) out.push({ x: p.x, z: p.z, r }); };
  const addXZ = (list, r) => { for (const [x, z] of list) out.push({ x, z, r }); };
  add(area.pois, 1.6);
  add(area.collectibles, 1.4);
  add(area.scenics, 1.4);
  add(area.boxes, 1.2);
  add(area.tippables, 1.0);
  add(area.perches, 1.4);
  addXZ([[-8, 10], [-20, -2], [4, 24], [-28, 18], [12, -10], [-32, -10], [-32, 30]], 1.4);
  addXZ([[-14, 30], [-2, -14], [-24, -20], [8, 2], [-30, 5], [12, 20]], 1.6);
  addXZ([[15, 34]], 2.6);
  addXZ([[18, 14], [18, -18]], 1.6);
  addXZ([[20, 30], [20, -30]], 0.8);
  const props = propsFor('seaside');
  for (const key of ['carryables', 'knockables', 'markables', 'rests']) add(props[key], 1.2);
  add(props.flaps, 1.5);
  addXZ([[-28, 18], [-29, 19], [-32.3, -10.4]], 1.2);
  out.push({ x: area.spawn.x, z: area.spawn.z, r: 3 });
  out.push({ x: props.dogYard.x, z: props.dogYard.z, r: props.dogYard.r + 1 });
  out.push({ x: DISCS.seaside.cx, z: DISCS.seaside.cz, r: DISCS.seaside.r + 1 });
  return out;
}

const UP = [0, 1, 0];
const yAt = (x) => (x > TIDE_FROM_X ? TIDE_Y : PAINT_Y);

// One flat triangle, wound to face up whichever way its corners came in.
function tri(T, a, b, c, ca, cb, cc, y) {
  const cross = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
  if (cross < 0) { [b, c] = [c, b]; [cb, cc] = [cc, cb]; }
  T.v(a[0], y ?? yAt(a[0]), a[1], UP, ca);
  T.v(b[0], y ?? yAt(b[0]), b[1], UP, cb);
  T.v(c[0], y ?? yAt(c[0]), c[1], UP, cc);
}

// A painted stroke along a polyline [[x, z], ...]: tapered at both ends (so a
// dash reads as a soft mark, not a bar), each edge wobbling per sample.
// col(x, z) gives each vertex's colour.
function stroke(T, pts, halfW, col, { salt = 0, wobble = 0.35, taper = 0.35 } = {}) {
  const n = pts.length;
  if (n < 2) return;
  const L = [];
  const R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const c = pts[Math.min(n - 1, i + 1)];
    let dx = c[0] - a[0];
    let dz = c[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const t = i / (n - 1);
    const w = halfW * (taper + (1 - taper) * Math.sin(Math.PI * t));
    const wl = w * (1 + wobble * (hash01(i, 3, salt) * 2 - 1));
    const wr = w * (1 + wobble * (hash01(i, 7, salt) * 2 - 1));
    L.push([pts[i][0] + dz * wl, pts[i][1] - dx * wl]);
    R.push([pts[i][0] - dz * wr, pts[i][1] + dx * wr]);
  }
  const C = (p) => col(p[0], p[1]);
  for (let i = 0; i < n - 1; i++) {
    tri(T, L[i], R[i], L[i + 1], C(L[i]), C(R[i]), C(L[i + 1]));
    tri(T, R[i], R[i + 1], L[i + 1], C(R[i]), C(R[i + 1]), C(L[i + 1]));
  }
}

// Samples z0..z1 at about `step`, mapping each z to [x(z), z].
function alongZ(z0, z1, step, xOf) {
  const k = Math.max(2, Math.round(Math.abs(z1 - z0) / step));
  const pts = [];
  for (let j = 0; j <= k; j++) {
    const z = z0 + ((z1 - z0) * j) / k;
    pts.push([xOf(z), z]);
  }
  return pts;
}

const mul = (a, b, k = 1) => [a[0] * b[0] * k, a[1] * b[1] * k, a[2] * b[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const PIER_MOUTH = (z) => Math.abs(z + 10) < 2.5;

// The umbrella's soft shade: 0.7 in its core, back to 1 (no change) at its
// rim. The sun is low in the west-north-west (rig.js SUN_POSITION), so the
// shade leans east-south-east of the pole and stretches that way a little.
const SUN_AWAY = (() => { const l = Math.hypot(36, 24); return [36 / l, 24 / l]; })();
function shadeCentre() {
  return [BEACH_SPOTS.umbrella.x + 0.5, BEACH_SPOTS.umbrella.z + 0.3];
}
function shadeE(x, z) {
  const [cx, cz] = shadeCentre();
  const dx = x - cx;
  const dz = z - cz;
  const u = dx * SUN_AWAY[0] + dz * SUN_AWAY[1];
  const v = -dx * SUN_AWAY[1] + dz * SUN_AWAY[0];
  return Math.hypot(u / 1.3, v) / 1.1;
}
export function shadeK(x, z) {
  return 1 - 0.3 * (1 - smoothstep(0.7, 1.3, shadeE(x, z)));
}

// The fresh line of seaweed the last high tide left: it follows the wet
// edge's own wander (seaside.js wetness) a little way down the wet ramp. The
// painted wrack (below) and the shells and kelp (Task 3) both lie along it.
//
// Only the edge's long wander: its shorter 0.91 wave is damped and the line's
// own wiggle kept tiny, because from a cat's eye a line that swings 0.3m
// across in a metre or two reads as a row of slashes across the shore.
export function tideX(z) {
  const reach = 0.32 * Math.sin(z * 0.33 + 1.3) + 0.06 * Math.sin(z * 0.91);
  return 22.85 - 0.8 * reach + 0.02 * Math.sin(z * 1.7 + 0.4);
}

// A thin flat sliver from (x0, z0) to (x1, z1): pointed at both ends, half
// width w at its widest, its sides wobbling a little and its middle bowed
// sideways by `bow`. Two triangles (one waist) or four (two waists).
function sliver(T, x0, z0, x1, z1, w, col, { salt = 0, waists = 2, bow = 0 } = {}) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len; const uz = dz / len;
  const nx = uz; const nz = -ux;
  const ts = waists === 1 ? [0.5] : [0.33, 0.67];
  const L = []; const R = [];
  ts.forEach((t, k) => {
    const cx = x0 + dx * t + nx * bow * Math.sin(Math.PI * t);
    const cz = z0 + dz * t + nz * bow * Math.sin(Math.PI * t);
    const ww = w * (waists === 1 ? 1 : 0.85 + 0.15 * hash01(k, salt, 451));
    const wl = ww * (0.7 + 0.6 * hash01(k, salt, 452));
    const wr = ww * (0.7 + 0.6 * hash01(k, salt, 453));
    L.push([cx + nx * wl, cz + nz * wl]);
    R.push([cx - nx * wr, cz - nz * wr]);
  });
  const a = [x0, z0]; const b = [x1, z1];
  const C = (p) => col(p[0], p[1]);
  tri(T, a, L[0], R[0], C(a), C(L[0]), C(R[0]));
  for (let k = 0; k < ts.length - 1; k++) {
    tri(T, L[k], L[k + 1], R[k], C(L[k]), C(L[k + 1]), C(R[k]));
    tri(T, R[k], L[k + 1], R[k + 1], C(R[k]), C(L[k + 1]), C(R[k + 1]));
  }
  const n = ts.length - 1;
  tri(T, L[n], b, R[n], C(L[n]), C(b), C(R[n]));
}

// The wet band's own colour at (x, z) (seaside.js wetSandBand).
function wetSandAt(sand, x, z) {
  const k = wetness(x, z);
  const t = sandTint(x, z);
  return [0, 1, 2].map((c) => sand[c] * t[c] * (1 + (WET_TINT[c] - 1) * k));
}

const TIDE_GAP = (z0, z1) => PIER_MOUTH(z0) || PIER_MOUTH(z1) || (z0 < -12.5 && z1 > -7.5);

function paintTideLines(T, sand) {
  // The fresh wrack: short thin bits of brown, olive and near-black weed
  // lying along the line (wave-laid, so nearly all of them point along the
  // shore), a little scattered either side of it, with tiny scraps between.
  // Each bit is mixed a quarter of the way towards the wet sand under it so the
  // line reads as weed lying on sand, not as dark marks painted on it.
  const WEEDS = [0x6e5f3e, 0x7b6844, 0x655a3a, 0x806c48, 0x5c5236].map(lin);
  const weedCol = (base, h) => (x, zz) => mix(base, wetSandAt(sand, x, zz), 0.25)
    .map((v) => v * (0.94 + 0.1 * h) * (0.97 + 0.06 * hash01(x * 9, zz * 9, 402)));
  const along = (z, off) => {
    const ang = Math.atan2(tideX(z + 0.25) - tideX(z - 0.25), 0.5);
    return [tideX(z) + off, ang];
  };
  let z = -44;
  let i = 0;
  while (z < 44) {
    const len = 0.22 + 0.55 * hash01(i, 11, 401) ** 1.3;
    const gap = 0.12 + 0.5 * hash01(i, 13, 401);
    const z1 = Math.min(44, z + len);
    if (!TIDE_GAP(z, z1)) {
      const zm = (z + z1) / 2;
      const off = 0.12 * signed(hash01(i, 19, 401));
      const [xm, ang0] = along(zm, off);
      const ang = ang0 + 0.1 * signed(hash01(i, 23, 401));
      const hl = (z1 - z) / 2;
      const sx = Math.sin(ang) * hl; const sz = Math.cos(ang) * hl;
      const base = pick(WEEDS, hash01(i, 17, 401));
      sliver(T, xm - sx, zm - sz, xm + sx, zm + sz, 0.03 + 0.025 * hash01(i, 29, 401),
        weedCol(base, hash01(i, 31, 401)), { salt: 410 + i, waists: len > 0.55 ? 2 : 1, bow: 0.04 * signed(hash01(i, 37, 401)) });
    }
    // Scraps: one or two tiny bits in most gaps, at any angle near the line.
    const scraps = hash01(i, 41, 401) < 0.4 ? 0 : hash01(i, 43, 401) < 0.75 ? 1 : 2;
    for (let s = 0; s < scraps; s++) {
      const zc = z1 + gap * (0.25 + 0.5 * hash01(i, 47 + s, 401));
      if (zc >= 44 || TIDE_GAP(zc - 0.1, zc + 0.1)) continue;
      const [xc, a0] = along(zc, 0.22 * signed(hash01(i, 53 + s, 401)));
      const ang = a0 + 0.7 * signed(hash01(i, 59 + s, 401));
      const hl = 0.03 + 0.06 * hash01(i, 61 + s, 401);
      const sx = Math.sin(ang) * hl; const sz = Math.cos(ang) * hl;
      sliver(T, xc - sx, zc - sz, xc + sx, zc + sz, 0.015 + 0.015 * hash01(i, 67 + s, 401),
        weedCol(pick(WEEDS, hash01(i, 71 + s, 401)), 0.5), { salt: 470 + i * 2 + s, waists: 1 });
    }
    z = z1 + gap;
    i++;
  }

  // The old wrack line from an earlier, higher tide: a faint, thin, broken
  // greyed line on the landward side, wet-aware so it darkens with the band.
  const dryFrom = 22.04;
  const wrackX = (zz) => Math.max(dryFrom, tideX(zz) - 0.62 + 0.05 * Math.sin(zz * 2.3));
  const grey = [0.84, 0.81, 0.76];
  const wrackCol = (x, zz) => wetSandAt(sand, x, zz).map((v, c) => v * grey[c]);
  z = -43.5;
  i = 0;
  while (z < 44) {
    const len = 0.5 + 1.1 * hash01(i, 41, 403);
    const gap = 0.8 + 1.8 * hash01(i, 43, 403);
    const z1 = Math.min(44, z + len);
    if (!TIDE_GAP(z, z1)) {
      sliver(T, wrackX(z), z, wrackX(z1), z1, 0.035 + 0.02 * hash01(i, 47, 403), wrackCol,
        { salt: 430 + i, waists: len > 0.9 ? 2 : 1 });
    }
    z = z1 + gap;
    i++;
  }
}

// Is (x, z) clear for a ripple? Off the keep-outs (with a little more room),
// the towel and the shade, the castle moats, and on the open front beach.
function rippleClear(keep, x, z) {
  if (x < 5.1 || x > 17.2) return false;
  if (Math.hypot(x - BEACH_SPOTS.umbrella.x, z - BEACH_SPOTS.umbrella.z) < 3.4) return false;
  if (BEACH_SPOTS.castles.some((c) => Math.hypot(x - c.x, z - c.z) < 1.5)) return false;
  return keep.every((k) => Math.hypot(x - k.x, z - k.z) >= k.r + 0.3);
}

function paintRipples(T, ground, keep) {
  // Wind off the sea (east) heaps the dry sand into low ridges across it, so
  // they run roughly north-south. They come in little fields of 3-5 nearly
  // parallel strokes, each a darker trough with, on most, a paler crest on
  // its west side where the low sun catches it.
  const trough = (x, z) => scale3(ground(x, z), 0.88 + 0.03 * Math.sin(x * 4.7 + z * 2.1));
  const crest = (x, z) => scale3(ground(x, z), 1.05);
  let strokes = 0;
  for (let f = 0; f < 60 && strokes < 26; f++) {
    const cx = 6 + 10.5 * hash01(f, 1, 501);
    const cz = -28 + 72 * hash01(f, 2, 501);
    const count = 3 + Math.floor(hash01(f, 3, 501) * 3);
    const spacing = 0.42 + 0.14 * hash01(f, 4, 501);
    const bend = 0.6 * (hash01(f, 5, 501) * 2 - 1);
    const lean = 0.12 * (hash01(f, 6, 501) * 2 - 1);
    for (let s = 0; s < count && strokes < 26; s++) {
      const seed = f * 10 + s;
      const len = 2.5 + 2.5 * hash01(seed, 7, 502);
      const z0 = cz - len / 2 + 0.8 * (hash01(seed, 8, 502) * 2 - 1);
      const x0 = cx + (s - (count - 1) / 2) * spacing;
      const ph = hash01(seed, 9, 502) * 6.28;
      const xOf = (z) => {
        const t = (z - z0) / len;
        return x0 + lean * (z - cz) + bend * (t - 0.5) * (t - 0.5)
          + 0.12 * Math.sin(z * 0.9 + ph) + 0.04 * Math.sin(z * 2.3 + ph);
      };
      const pts = alongZ(z0, z0 + len, 0.9, xOf);
      const hasCrest = hash01(seed, 10, 502) > 0.4;
      const crestPts = pts.map(([x, z]) => [x - 0.14, z]);
      if (!pts.every(([x, z]) => rippleClear(keep, x, z))) continue;
      if (hasCrest && !crestPts.every(([x, z]) => rippleClear(keep, x, z))) continue;
      stroke(T, pts, 0.05, trough, { salt: 510 + seed, wobble: 0.3, taper: 0.2 });
      // The crest is a little shorter than its trough.
      const crestRun = crestPts.length >= 4 ? crestPts.slice(1, -1) : crestPts;
      if (hasCrest) stroke(T, crestRun, 0.035, crest, { salt: 610 + seed, wobble: 0.3, taper: 0.2 });
      strokes++;
    }
  }
  return strokes;
}

function paintShade(T, ground) {
  // A polar grid in the shade's own ellipse, each vertex coloured by shadeK,
  // so the core is soft-edged and the outer ring meets the sand exactly.
  const [cx, cz] = shadeCentre();
  const n = 12;
  const rings = [0.62, 1.0, 1.32];
  const at = (ring, i) => {
    const a = (i / n) * Math.PI * 2;
    const r = 1.1 * rings[ring] * (1 + 0.08 * (hash01(ring, i % n, 701) * 2 - 1));
    const u = Math.cos(a) * r * 1.3;
    const v = Math.sin(a) * r;
    return [cx + u * SUN_AWAY[0] - v * SUN_AWAY[1], cz + u * SUN_AWAY[1] + v * SUN_AWAY[0]];
  };
  const col = (p) => scale3(ground(p[0], p[1]), shadeK(p[0], p[1]));
  const c = [cx, cz];
  for (let i = 0; i < n; i++) {
    const p = at(0, i);
    const q = at(0, i + 1);
    tri(T, c, p, q, col(c), col(p), col(q));
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let i = 0; i < n; i++) {
      const a = at(ring, i); const b = at(ring, i + 1);
      const d = at(ring + 1, i); const e = at(ring + 1, i + 1);
      tri(T, a, d, b, col(a), col(d), col(b));
      tri(T, b, d, e, col(b), col(d), col(e));
    }
  }
}

function paintTowel(T) {
  // Five stripes (red, cream, blue, cream, red) across a 1.0 x 1.9 m towel,
  // its corners a touch uneven as cloth lies, shaded where the umbrella's
  // shade falls across it.
  const { x, z, yaw } = BEACH_SPOTS.towel;
  const stripes = [0xe05a4f, 0xf4efe4, 0x3f8fc6, 0xf4efe4, 0xe05a4f].map(lin);
  const rows = stripes.length * 2;
  const cols = 3;
  const sa = Math.sin(yaw);
  const ca = Math.cos(yaw);
  const P = [];
  for (let j = 0; j <= rows; j++) {
    const row = [];
    for (let i = 0; i <= cols; i++) {
      const along = -TOWEL.l / 2 + (TOWEL.l * j) / rows + 0.015 * (hash01(i, j, 801) * 2 - 1);
      const across = -TOWEL.w / 2 + (TOWEL.w * i) / cols + 0.015 * (hash01(i, j, 802) * 2 - 1);
      row.push([x + along * sa + across * ca, z + along * ca - across * sa]);
    }
    P.push(row);
  }
  for (let j = 0; j < rows; j++) {
    const base = stripes[Math.floor(j / 2)];
    const col = (p) => base.map((v) => v * shadeK(p[0], p[1]));
    for (let i = 0; i < cols; i++) {
      const a = P[j][i]; const b = P[j][i + 1]; const c = P[j + 1][i]; const d = P[j + 1][i + 1];
      tri(T, a, b, c, col(a), col(b), col(c), TOWEL_Y);
      tri(T, b, d, c, col(b), col(d), col(c), TOWEL_Y);
    }
  }
}

function paintMoats(T, ground) {
  // The dug ring round each sandcastle: damp sand turned up, darker, with
  // uneven rims.
  const n = 12;
  BEACH_SPOTS.castles.forEach((c, ci) => {
    const rim = (r, i, salt) => {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 + 0.08 * (hash01(ci, i % n, salt) * 2 - 1));
      return [c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr];
    };
    const inner = (p) => scale3(ground(p[0], p[1]), 0.76);
    const outer = (p) => scale3(ground(p[0], p[1]), 0.84);
    for (let i = 0; i < n; i++) {
      const a = rim(0.75, i, 901); const b = rim(0.75, i + 1, 901);
      const d = rim(0.95, i, 902); const e = rim(0.95, i + 1, 902);
      tri(T, a, d, b, inner(a), outer(d), inner(b));
      tri(T, b, d, e, inner(b), outer(d), outer(e));
    }
  });
}

// The dry sand's own linear colour at (x, z), read off the ground plane's
// vertex colours (builder.js's macro variation times sandTint) exactly as
// the GPU interpolates them across its triangles, so a paint vertex at k = 1
// is the sand under it. Without the plane (a bare scene), sandTint alone.
function groundSampler(groundMesh) {
  const sand = lin(BEACH);
  const col = groundMesh?.geometry.attributes.color;
  if (!col) return { colour: (x, z) => mul(sand, sandTint(x, z)), uv: null };
  const { width, height, widthSegments: sx, heightSegments: sy } = groundMesh.geometry.parameters;
  groundMesh.updateMatrix();
  const inv = groundMesh.matrix.clone().invert();
  const v = new THREE.Vector3();
  // The plane's cell coordinates (fx, fy) at world (x, z).
  const cell = (x, z) => {
    v.set(x, 0, z).applyMatrix4(inv);
    return [(v.x + width / 2) / (width / sx), (height / 2 - v.y) / (height / sy)];
  };
  const at = (i, j) => { const k = j * (sx + 1) + i; return [col.getX(k), col.getY(k), col.getZ(k)]; };
  const colour = (x, z) => {
    const [fx, fy] = cell(x, z);
    const ix = Math.min(sx - 1, Math.max(0, Math.floor(fx)));
    const iy = Math.min(sy - 1, Math.max(0, Math.floor(fy)));
    const u = Math.min(1, Math.max(0, fx - ix));
    const w = Math.min(1, Math.max(0, fy - iy));
    // PlaneGeometry's two triangles per cell: (a, b, d) and (b, c, d).
    const A = at(ix, iy); const B = at(ix, iy + 1); const C = at(ix + 1, iy + 1); const D = at(ix + 1, iy);
    const m = u + w <= 1
      ? [0, 1, 2].map((c) => A[c] + u * (D[c] - A[c]) + w * (B[c] - A[c]))
      : [0, 1, 2].map((c) => C[c] + (1 - u) * (B[c] - C[c]) + (1 - w) * (D[c] - C[c]));
    return mul(sand, m);
  };
  // The plane's own uv at (x, z), so the paint can wear the sand's speckle
  // tile in register with the ground under it.
  const uv = (x, z) => { const [fx, fy] = cell(x, z); return [fx / sx, 1 - fy / sy]; };
  return { colour, uv };
}

function buildPaint(keep, groundMesh) {
  const T = new Tris();
  const sand = lin(BEACH);
  const { colour, uv } = groundSampler(groundMesh);
  paintTideLines(T, sand);
  paintRipples(T, colour, keep);
  paintShade(T, colour);
  paintMoats(T, colour);
  paintTowel(T);
  const geo = T.geometry();
  // The ground's speckle map (when it has one) on the same uvs, and the same
  // light response (roughness 0.92, no metal), so a k = 1 paint is the sand
  // itself: the tile's mean (~0.96) darkens both alike and the grain runs on
  // across a mark's edge instead of stopping at it.
  const map = groundMesh?.material?.map ?? null;
  if (uv) {
    const pos = geo.attributes.position;
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const [u, w] = uv(pos.getX(i), pos.getZ(i));
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = w;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  const gm = groundMesh?.material;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: gm?.roughness ?? 0.92,
      metalness: gm?.metalness ?? 0,
      ...(map && uv ? { map } : {}),
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  mesh.name = 'beachPaint';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.noCast = true;
  // Rain and dusk darken the sand (walk.js collects userData.ground); the
  // paint lies on it and must darken with it or it would glow.
  mesh.userData.ground = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// The beach dressing (polish-beach Task 3): the small raised things on the
// sand, all in one noCast, vertex-coloured, FrontSide mesh ('beachDressing'):
// shells, kelp and pebbles along the painted tide line, three starfish, three
// bleached logs, two sandcastles in their painted moats with a bucket and
// spade by the big one, the beach umbrella over its painted shade and towel,
// and the boardwalk's finished edge (kerb boards and short posts).
//
// Looks only, like the paint: no collider, perch or pickup, and every prop
// keeps clear of beachKeepOut so it is never mistaken for a find. Every
// shape is closed against the sand or faces up (bottoms omitted: the sand
// hides them), except the umbrella's canopy and the flags, which are thin
// and so are built twice, once facing each way.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const signed = (h) => h * 2 - 1;
const vary = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const pick = (list, h) => list[Math.min(list.length - 1, Math.floor(h * list.length))];
// The wet band's top (seaside.js, y 0.008) or the dry sand (0).
const sandY = (x) => (x > 21.8 ? 0.008 : 0);

// Places a prop's own-space points in the world: scale, tilt about x, then
// about z, then yaw about y (three.js's sense), then move.
function place({ x = 0, y = 0, z = 0, yaw = 0, tx = 0, tz = 0, s = 1 } = {}) {
  const [kx, ky, kz] = Array.isArray(s) ? s : [s, s, s];
  const cX = Math.cos(tx); const sX = Math.sin(tx);
  const cZ = Math.cos(tz); const sZ = Math.sin(tz);
  const cY = Math.cos(yaw); const sY = Math.sin(yaw);
  return (p) => {
    let px = p[0] * kx; let py = p[1] * ky; let pz = p[2] * kz;
    [py, pz] = [py * cX - pz * sX, py * sX + pz * cX];
    [px, py] = [px * cZ - py * sZ, px * sZ + py * cZ];
    [px, pz] = [px * cY + pz * sY, -px * sY + pz * cY];
    return [px + x, py + y, pz + z];
  };
}
const AT_WORLD = (p) => p;

// Collects props as raw triangles. Each triangle comes in the prop's own space
// and is turned so its face points along face(centroid) before it is placed
// (positive scales keep the turn), then lit flat by its placed normal.
class Props {
  constructor() { this.T = new Tris(); }
  put(tris, face, at, col) {
    for (const t of tris) {
      let [a, b, c] = t;
      const cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      if (dot(cross(sub(b, a), sub(c, a)), face(cen)) < 0) [b, c] = [c, b];
      const A = at(a); const B = at(b); const C = at(c);
      const n = unit(...cross(sub(B, A), sub(C, A)));
      for (const W of [A, B, C]) this.T.v(W[0], W[1], W[2], n, typeof col === 'function' ? col(W) : col);
    }
  }
}
// Face choosers: away from a point inside a convex shape, towards a point, up.
const outFrom = (o) => (c) => sub(c, o);
const towards = (o) => (c) => sub(o, c);
const faceUp = () => UP;

// --- shapes, in a prop's own space (y up, sitting on y 0) ----------------
function ringPts(n, r, y, { phase = 0, wob = 0, salt = 0, sz = 1 } = {}) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const rr = r * (1 + wob * signed(hash01(i, salt, 991)));
    pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr * sz]);
  }
  return pts;
}
// The side wall between two rings of the same length.
function bandTris(lo, hi) {
  const out = [];
  for (let i = 0; i < lo.length; i++) {
    const j = (i + 1) % lo.length;
    out.push([lo[i], lo[j], hi[i]], [lo[j], hi[j], hi[i]]);
  }
  return out;
}
const fanTris = (ring, apex) => ring.map((p, i) => [apex, p, ring[(i + 1) % ring.length]]);
// An n-sided post or tower from y0 to y1 (radius r0 to r1), top cap optional.
function prismTris(n, r0, r1, y0, y1, { top = true, phase = 0, wob = 0, salt = 0 } = {}) {
  const lo = ringPts(n, r0, y0, { phase, wob, salt });
  const hi = ringPts(n, r1, y1, { phase, wob, salt });
  const out = bandTris(lo, hi);
  if (top) out.push(...fanTris(hi, [0, y1, 0]));
  return out;
}
// A box over y0..y0+h centred on x and z, no bottom; ends: false drops its
// two z faces (a board butted against the next).
function boxTris(w, h, d, { y0 = 0, ends = true, ox = 0, oz = 0 } = {}) {
  const x0 = ox - w / 2; const x1 = ox + w / 2; const z0 = oz - d / 2; const z1 = oz + d / 2; const y1 = y0 + h;
  const quad = (a, b, c, e) => [[a, b, c], [a, c, e]];
  const out = [
    ...quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]),
    ...quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]),
    ...quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]),
  ];
  if (ends) {
    out.push(...quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]));
    out.push(...quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]));
  }
  return out;
}
const boxFace = (h, y0 = 0, ox = 0, oz = 0) => outFrom([ox, y0 + h / 2, oz]);

// --- where everything goes (pure: no Three objects) ---------------------
const SHELL_COLS = [0xf3e6d6, 0xeec2b4, 0xf0c89a, 0xf6ede2, 0xe8b9a6];
const STAR_COLS = [0xe9774f, 0xf09a4a];
const PEBBLE_COLS = [0x8d8a84, 0x6f7377, 0x9a8a72, 0xa59d90, 0x7c6f60];
const KELP_COLS = [0x4a4a24, 0x5a5529, 0x655530];
const UMBRELLA_TILT = 0.12;

function planBeach(area) {
  const keep = beachKeepOut(area);
  const b = area.bounds;
  const items = [];
  const big = BEACH_SPOTS.castles[0];
  const towel = BEACH_SPOTS.towel;
  const umb = BEACH_SPOTS.umbrella;
  // Clear of every keep-out and every prop placed so far, out of the sea,
  // off the deck (with the prop's own reach) and inside the bounds.
  const clear = (x, z, r, room = 0) => x + r < 24.6
    && !(x + r > 18 && x - r < 22 && Math.abs(z) - r <= 45)
    && x - r >= b.minX && x + r <= b.maxX && z - r >= b.minZ && z + r <= b.maxZ
    && !(z + r > -12.5 && z - r < -7.5 && x > 21)
    && keep.every((k) => Math.hypot(x - k.x, z - k.z) >= k.r + r)
    && items.every((q) => Math.hypot(x - q.x, z - q.z) >= q.r + r + room);
  // The towel, the umbrella and the moats are painted; loose shells and
  // stones keep off them.
  const offPaint = (x, z, r) => Math.hypot(x - towel.x, z - towel.z) >= 1.1 + r
    && Math.hypot(x - umb.x, z - umb.z) >= 1.5 + r
    && BEACH_SPOTS.castles.every((c) => Math.hypot(x - c.x, z - c.z) >= 1.05 + r);
  const add = (it) => { items.push(it); return it; };

  add({ kind: 'umbrella', x: umb.x, z: umb.z, r: 1.0 });
  add({ kind: 'castle', x: big.x, z: big.z, r: 0.62, big: true, yaw: 0.3 });
  const small = BEACH_SPOTS.castles[1];
  add({ kind: 'castle', x: small.x, z: small.z, r: 0.46, big: false, yaw: -0.45 });

  // The bucket and spade, just outside the big moat on the side the spawn
  // looks from.
  const toSpawn = Math.atan2(area.spawn.z - big.z, area.spawn.x - big.x);
  for (let k = 0; k < 12; k++) {
    const a = toSpawn + 0.5 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.45;
    const bx = big.x + Math.cos(a) * 1.25; const bz = big.z + Math.sin(a) * 1.25;
    const sx = big.x + Math.cos(a + 0.32) * 1.45; const sz = big.z + Math.sin(a + 0.32) * 1.45;
    if (clear(bx, bz, 0.1) && clear(sx, sz, 0.18)) {
      add({ kind: 'bucket', x: bx, z: bz, r: 0.1, tilt: 0.05 });
      add({ kind: 'spade', x: sx, z: sz, r: 0.18, yaw: a + 1.9 });
      break;
    }
  }

  // Three bleached logs; nudged along the beach if a spot is taken.
  const logs = [
    { x: 23.1, z: 14.5, L: 2.0, rad: 0.095, yaw: Math.PI / 2 + 0.22, branch: true },
    { x: 22.9, z: -25.5, L: 1.4, rad: 0.075, yaw: Math.PI / 2 - 0.3 },
    { x: 10.5, z: -24, L: 1.7, rad: 0.085, yaw: 0.9 },
  ];
  for (const g of logs) {
    for (const dz of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4]) {
      if (clear(g.x, g.z + dz, g.L / 2)) { add({ kind: 'driftwood', ...g, z: g.z + dz, r: g.L / 2 }); break; }
    }
  }

  // Along the tide line: seaweed clumps, shells, two starfish, stones.
  const tideSpot = (z, off) => [tideX(z) + off, z];
  const zFrom = Math.max(-44, b.minZ + 0.6);
  const zTo = Math.min(44, b.maxZ - 0.6);
  for (const zs of [33.5, -28.5]) {
    for (let k = 0; k < 10; k++) {
      const z = zs + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.7;
      const [x] = tideSpot(z, 0.25);
      if (clear(x, z, 0.15, 0.1)) {
        add({ kind: 'starfish', x, z, r: 0.15, tide: true, salt: items.length });
        break;
      }
    }
  }
  const nKelp = 15;
  for (let i = 0; i < nKelp; i++) {
    for (let k = 0; k < 6; k++) {
      const z = zFrom + ((i + 0.5 + 0.35 * signed(hash01(i, k, 1101))) / nKelp) * (zTo - zFrom);
      const [x] = tideSpot(z, 0.1 * signed(hash01(i, k, 1102)));
      if (clear(x, z, 0.17, 0.1)) {
        add({ kind: 'kelp', x, z, r: 0.17, tide: true, salt: i * 7 + k });
        break;
      }
    }
  }
  let shells = 0;
  for (let i = 0; i < 120 && shells < 26; i++) {
    const z = zFrom + hash01(i, 1, 1201) * (zTo - zFrom);
    const [x] = tideSpot(z, -0.3 + 0.85 * hash01(i, 2, 1201));
    const r = 0.05 + 0.03 * hash01(i, 3, 1201);
    if (clear(x, z, r, 0.06)) { add({ kind: 'shell', x, z, r, tide: true, salt: i }); shells++; }
  }
  const cluster = (cx, cz, n, salt, tide) => {
    for (let j = 0, got = 0; j < n * 4 && got < n; j++) {
      const a = hash01(j, salt, 1301) * Math.PI * 2;
      const d = 0.08 + 0.3 * hash01(j, salt, 1302);
      const x = cx + Math.cos(a) * d * (tide ? 0.7 : 1);
      const z = cz + Math.sin(a) * d * (tide ? 1.4 : 1);
      const r = 0.04 + 0.07 * hash01(j, salt, 1303) ** 1.5;
      if (clear(x, z, r) && offPaint(x, z, r)) {
        add({ kind: 'pebble', x, z, r, tide, salt: salt * 31 + j });
        got++;
      }
    }
  };
  for (let i = 0; i < 7; i++) {
    const z = zFrom + ((i + 0.3 + 0.4 * hash01(i, 1, 1401)) / 7) * (zTo - zFrom);
    cluster(tideX(z) + 0.15, z, 3 + Math.floor(hash01(i, 2, 1401) * 4), 40 + i, true);
  }
  for (let i = 0; i < 6; i++) {
    const cx = -30 + (i + 0.2 + 0.6 * hash01(i, 3, 1401)) * (40 / 6);
    const cz = -30.5 - 2.5 * hash01(i, 4, 1401);
    cluster(cx, cz, 4 + Math.floor(hash01(i, 5, 1401) * 3), 60 + i, false);
  }

  // The front beach: a few more shells and the third starfish.
  for (let k = 0; k < 40; k++) {
    const x = 6 + 11 * hash01(k, 1, 1501); const z = -26 + 66 * hash01(k, 2, 1501);
    if (clear(x, z, 0.15, 0.3) && offPaint(x, z, 0.15)) { add({ kind: 'starfish', x, z, r: 0.15, salt: 99 }); break; }
  }
  let front = 0;
  for (let i = 0; i < 80 && front < 11; i++) {
    const x = 6 + 11 * hash01(i, 3, 1501); const z = -26 + 70 * hash01(i, 4, 1501);
    const r = 0.05 + 0.03 * hash01(i, 5, 1501);
    if (clear(x, z, r, 0.4) && offPaint(x, z, r)) { add({ kind: 'shell', x, z, r, salt: 500 + i }); front++; }
  }
  return items;
}

// Every raised prop the dressing places: { kind, x, z, r } (r its reach on
// the sand), plus tide: true for the ones laid along the tide line.
export function beachAnchors(area) {
  return planBeach(area).map(({ kind, x, z, r, tide }) => (tide ? { kind, x, z, r, tide } : { kind, x, z, r }));
}

// --- the props -------------------------------------------------------------
function addShell(P, it) {
  const h = 0.024 + 0.14 * (it.r - 0.05);
  const y0 = sandY(it.x);
  const base = vary(lin(pick(SHELL_COLS, hash01(it.salt, 1, 1601))), 0.94 + 0.1 * hash01(it.salt, 2, 1601));
  const rim = ringPts(5, it.r, 0, { phase: hash01(it.salt, 3, 1601), wob: 0.12, salt: it.salt, sz: 0.85 });
  const apex = [-0.3 * it.r, h, 0];
  const at = place({ x: it.x, y: y0, z: it.z, yaw: hash01(it.salt, 4, 1601) * 6.28,
    tx: 0.1 * signed(hash01(it.salt, 5, 1601)), tz: 0.1 * signed(hash01(it.salt, 6, 1601)) });
  P.put(fanTris(rim, apex), outFrom([-0.1 * it.r, -0.05, 0]), at, (W) => vary(base, 0.88 + 0.16 * Math.min(1, Math.max(0, (W[1] - y0) / h))));
}

function addStarfish(P, it) {
  const y0 = sandY(it.x);
  const R = 0.12 + 0.03 * hash01(it.salt, 1, 1701);
  const col = lin(pick(STAR_COLS, hash01(it.salt, 2, 1701)));
  const rot = hash01(it.salt, 3, 1701) * 6.28;
  const C = [it.x, y0 + 0.025, it.z];
  const tips = []; const notches = [];
  for (let i = 0; i < 5; i++) {
    const a = rot + (i / 5) * Math.PI * 2 + 0.15 * signed(hash01(it.salt, 10 + i, 1701));
    const L = R * (0.88 + 0.24 * hash01(it.salt, 20 + i, 1701));
    tips.push([it.x + Math.cos(a) * L, y0 + 0.004, it.z + Math.sin(a) * L]);
    const b = rot + ((i + 0.5) / 5) * Math.PI * 2;
    notches.push([it.x + Math.cos(b) * R * 0.38, y0 + 0.012, it.z + Math.sin(b) * R * 0.38]);
  }
  const tris = [];
  for (let i = 0; i < 5; i++) tris.push([C, notches[(i + 4) % 5], tips[i]], [C, tips[i], notches[i]]);
  P.put(tris, faceUp, AT_WORLD, (W) => vary(col, W[1] > y0 + 0.02 ? 1.08 : W[1] > y0 + 0.008 ? 1 : 0.86));
}

function addPebble(P, it) {
  const y0 = sandY(it.x);
  const base = vary(lin(pick(PEBBLE_COLS, hash01(it.salt, 1, 1801))), 0.9 + 0.2 * hash01(it.salt, 2, 1801));
  const rim = ringPts(6, it.r, -0.004, { phase: hash01(it.salt, 3, 1801), wob: 0.18, salt: it.salt, sz: 0.7 + 0.3 * hash01(it.salt, 4, 1801) });
  const apex = [0.25 * it.r * signed(hash01(it.salt, 5, 1801)), it.r * (0.45 + 0.15 * hash01(it.salt, 6, 1801)), 0.2 * it.r * signed(hash01(it.salt, 7, 1801))];
  const at = place({ x: it.x, y: y0, z: it.z, yaw: hash01(it.salt, 8, 1801) * 6.28 });
  P.put(fanTris(rim, apex), outFrom([0, -it.r, 0]), at, (W) => vary(base, 0.85 + 0.25 * Math.min(1, (W[1] - y0) / (it.r * 0.5))));
}

function addKelp(P, it) {
  const y0 = sandY(it.x);
  const rot = hash01(it.salt, 1, 1901) * Math.PI;
  for (let k = 0; k < 3; k++) {
    const a = rot + (k / 3) * Math.PI + 0.25 * signed(hash01(it.salt, 2 + k, 1901));
    const len = 0.22 + 0.08 * hash01(it.salt, 5 + k, 1901);
    const w = 0.022 + 0.012 * hash01(it.salt, 8 + k, 1901);
    const ph = hash01(it.salt, 11 + k, 1901) * 6.28;
    const col = vary(lin(pick(KELP_COLS, hash01(it.salt, 14 + k, 1901))), 0.9 + 0.2 * hash01(it.salt, 17 + k, 1901));
    const ca = Math.cos(a); const sa = Math.sin(a);
    const pt = (t, side) => {
      const along = (t - 0.5) * len;
      const across = 0.03 * Math.sin(t * 4.5 + ph) + side * w * (1 - 0.6 * Math.abs(t - 0.4));
      return [it.x + ca * along - sa * across, y0 + 0.01 + 0.004 * k + 0.02 * Math.sin(Math.PI * t), it.z + sa * along + ca * across];
    };
    const tris = [];
    const ts = [0, 0.35, 0.7];
    for (let s = 0; s < ts.length - 1; s++) {
      tris.push([pt(ts[s], -1), pt(ts[s], 1), pt(ts[s + 1], -1)], [pt(ts[s], 1), pt(ts[s + 1], 1), pt(ts[s + 1], -1)]);
    }
    tris.push([pt(0.7, -1), pt(0.7, 1), pt(1, 0)]);
    P.put(tris, faceUp, AT_WORLD, (W) => vary(col, 0.85 + 4 * (W[1] - y0 - 0.01)));
  }
}

function addDriftwood(P, it) {
  const { L, rad } = it;
  const s = hash01(it.x, it.z, 2001);
  const base = vary(lin(s > 0.5 ? 0xc4b8a4 : 0xb3a690), 0.95 + 0.08 * hash01(it.x, it.z, 2002));
  const grain = lin(0x9a8b74);
  const xs = [-L / 2, -L / 6, L / 6, L / 2];
  const rs = [0.72, 1, 0.92, 0.8].map((k) => k * rad);
  const zOff = [0, 0.04, -0.03, 0.02].map((k, i) => k * signed(hash01(i, it.x, 2003)) * L);
  const axis = (i) => [xs[i], rs[i] * 0.86, zOff[i]];
  const rings = xs.map((x, i) => {
    const pts = [];
    for (let j = 0; j < 6; j++) {
      const a = Math.PI / 6 + (j / 6) * Math.PI * 2;
      const rr = rs[i] * (1 + 0.1 * signed(hash01(i, j, 2004 + it.z)));
      const c = axis(i);
      pts.push([x, c[1] + Math.cos(a) * rr, c[2] + Math.sin(a) * rr]);
    }
    return pts;
  });
  const at = place({ x: it.x, y: sandY(it.x), z: it.z, yaw: it.yaw });
  const col = (W) => vary(base, 0.88 + 0.18 * hash01(Math.round(W[0] * 9), Math.round(W[2] * 9), 2005) + 0.6 * (W[1] - rad));
  for (let i = 0; i < 3; i++) {
    const mid = [(xs[i] + xs[i + 1]) / 2, (axis(i)[1] + axis(i + 1)[1]) / 2, (zOff[i] + zOff[i + 1]) / 2];
    // Faces 4 and 5 are the flat underside (ring vertices 2 and 3 straddle
    // the bottom): it lies on the sand, so it is left out.
    P.put(bandTris(rings[i], rings[i + 1]).filter((_, k) => k !== 4 && k !== 5), outFrom(mid), at, col);
  }
  const capTris = (ring) => [[ring[0], ring[1], ring[2]], [ring[0], ring[2], ring[3]], [ring[0], ring[3], ring[4]], [ring[0], ring[4], ring[5]]];
  P.put(capTris(rings[0]), () => [-1, 0, 0], at, grain);
  P.put(capTris(rings[3]), () => [1, 0, 0], at, grain);
  if (it.branch) {
    // A short broken branch off the side of the long log, leaning up a little.
    const b0 = [L * 0.18, rad * 0.95, rad * 0.5];
    const d = unit(0.55, 0.4, 0.75);
    const u = unit(...cross(d, [0, 1, 0]));
    const v = cross(u, d);
    const ring = [];
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2;
      ring.push([0, 1, 2].map((c) => b0[c] + 0.04 * (Math.cos(a) * u[c] + Math.sin(a) * v[c])));
    }
    const tip = [0, 1, 2].map((c) => b0[c] + 0.42 * d[c]);
    const inner = [0, 1, 2].map((c) => b0[c] + 0.1 * d[c]);
    P.put(fanTris(ring, tip), outFrom(inner), at, col);
  }
}

function castleCol(it) {
  const t = sandTint(it.x, it.z);
  const damp = lin(BEACH).map((v, c) => v * t[c] * 0.86 * [1.02, 1, 0.96][c]);
  return (W) => vary(damp, 0.86 + 0.16 * Math.min(1, W[1] / 0.5) + 0.04 * signed(hash01(Math.round(W[0] * 20), Math.round(W[2] * 20), 2101)));
}

// A stick flag streaming west (the wind is off the sea), seen from either side.
function addFlag(P, at, top, len, colHex) {
  const T = at(top);
  const pole = (y) => at([top[0], y, top[2]]);
  const P1 = pole(top[1] - 0.06);
  const tipA = [T[0] - len, (T[1] + P1[1]) / 2 - 0.004, T[2] + 0.02];
  const tri = [[T, P1, tipA]];
  const col = lin(colHex);
  P.put(tri, () => [0, 0, 1], AT_WORLD, col);
  P.put(tri, () => [0, 0, -1], AT_WORLD, vary(col, 0.85));
}

function addCastle(P, it) {
  const at = place({ x: it.x, y: 0, z: it.z, yaw: it.yaw });
  const col = castleCol(it);
  const tower = (x, z, r, y0, y1, capR, capH, salt) => {
    const tr = prismTris(6, r, r * 0.9, y0, y1, { top: false, phase: salt, wob: 0.06, salt });
    P.put(tr.map((t) => t.map((p) => [p[0] + x, p[1], p[2] + z])), outFrom([x, (y0 + y1) / 2, z]), at, col);
    const cap = fanTris(ringPts(6, capR, y1, { phase: salt }), [0, y1 + capH, 0]);
    P.put(cap.map((t) => t.map((p) => [p[0] + x, p[1], p[2] + z])), outFrom([x, y1 + capH / 4, z]), at, col);
  };
  const mound = (r0, r1, h) => {
    P.put(prismTris(8, r0, r1, 0, h, { wob: 0.07, salt: it.big ? 3 : 4 }), outFrom([0, h / 2, 0]), at, col);
  };
  const box = (w, h, d, y0, ox = 0, oz = 0) => P.put(boxTris(w, h, d, { y0, ox, oz }), boxFace(h, y0, ox, oz), at, col);
  const pole = (x, z, y0, y1) => {
    P.put(prismTris(4, 0.009, 0.008, y0, y1, { top: false }).map((t) => t.map((p) => [p[0] + x, p[1], p[2] + z])),
      outFrom([x, (y0 + y1) / 2, z]), at, lin(0x8a6a48));
  };
  if (it.big) {
    mound(0.6, 0.46, 0.07);
    box(0.42, 0.26, 0.42, 0.07);
    for (const [ox, oz, w, d] of [[0, 0.185, 0.1, 0.05], [0, -0.185, 0.1, 0.05], [0.185, 0, 0.05, 0.1], [-0.185, 0, 0.05, 0.1]]) {
      box(w, 0.06, d, 0.33, ox, oz);
    }
    [[0.21, 0.21], [-0.21, 0.21], [0.21, -0.21], [-0.21, -0.21]].forEach(([x, z], i) => {
      tower(x, z, 0.1, 0.07, 0.43 + 0.03 * hash01(i, 1, 2102), 0.115, 0.11, i + 1);
    });
    tower(0, 0, 0.085, 0.33, 0.46, 0.1, 0.09, 7);
    pole(0, 0, 0.5, 0.645);
    addFlag(P, at, [0, 0.645, 0], 0.12, 0xe0473c);
  } else {
    mound(0.44, 0.34, 0.06);
    box(0.3, 0.18, 0.22, 0.06);
    box(0.06, 0.05, 0.05, 0.24, 0, 0.085);
    box(0.06, 0.05, 0.05, 0.24, 0, -0.085);
    tower(0.17, 0, 0.085, 0.06, 0.4, 0.1, 0.1, 11);
    tower(-0.17, 0, 0.085, 0.06, 0.34, 0.1, 0.1, 12);
    pole(0.17, 0, 0.45, 0.6);
    addFlag(P, at, [0.17, 0.6, 0], 0.11, 0xf2c23a);
  }
}

function addBucket(P, it) {
  const at = place({ x: it.x, y: 0, z: it.z, tx: it.tilt, yaw: 0.4 });
  const red = lin(0xd9483b);
  const outer = prismTris(6, 0.07, 0.095, 0, 0.14, { top: false });
  P.put(outer, outFrom([0, 0.07, 0]), at, (W) => vary(red, 0.9 + 0.8 * W[1]));
  const inner = prismTris(6, 0.064, 0.089, 0.02, 0.14, { top: false });
  P.put(inner, (c) => [-c[0], 0, -c[2]], at, vary(red, 0.72));
  P.put(fanTris(ringPts(6, 0.064, 0.02), [0, 0.02, 0]), faceUp, at, vary(red, 0.6));
}

function addSpade(P, it) {
  const at = place({ x: it.x, y: 0, z: it.z, yaw: it.yaw });
  const blue = lin(0x3d7cc9);
  const lay = (w, h, d, ox, k) => {
    const tr = boxTris(d, h, w, { y0: 0, ox, oz: 0 });
    P.put(tr, boxFace(h, 0, ox, 0), at, vary(blue, k));
  };
  lay(0.022, 0.022, 0.2, -0.02, 0.95);
  lay(0.08, 0.02, 0.025, -0.13, 0.85);
  lay(0.1, 0.012, 0.12, 0.14, 1.08);
}

function addUmbrella(P, it) {
  const yaw = Math.atan2(-SUN_AWAY[1], SUN_AWAY[0]);
  // Leans towards its painted shade (away from the low sun).
  const at = place({ x: it.x, y: 0, z: it.z, tz: -UMBRELLA_TILT, yaw });
  const white = lin(0xf4efe4);
  P.put(prismTris(6, 0.025, 0.022, 0, 1.92, { top: false }), outFrom([0, 1, 0]), at, (W) => vary(white, 0.9 + 0.05 * W[1]));
  const apexY = 1.93;
  const n = 8;
  const gores = [0xe05a4f, 0xf4efe4].map(lin);
  const pt = (r, a, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
  const top = []; const under = [];
  const apex = [0, apexY, 0];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2; const a1 = ((i + 1) / n) * Math.PI * 2; const am = (a0 + a1) / 2;
    const m0 = pt(0.5, a0, apexY - 0.12); const m1 = pt(0.5, a1, apexY - 0.12);
    const r0 = pt(1.0, a0, apexY - 0.3); const r1 = pt(1.0, a1, apexY - 0.3); const rm = pt(0.93, am, apexY - 0.26);
    const tris = [[apex, m0, m1], [m0, r0, rm], [m0, rm, m1], [m1, rm, r1]];
    const col = gores[i % 2];
    top.push({ tris, col });
    under.push({ tris: tris.map((t) => t.map((p) => [p[0], p[1] - 0.008, p[2]])), col });
  }
  const mid = [0, 0.6, 0];
  for (const g of top) P.put(g.tris, outFrom(mid), at, g.col);
  for (const g of under) P.put(g.tris, towards(mid), at, vary(g.col, 0.92));
  P.put(fanTris(ringPts(5, 0.028, apexY - 0.01), [0, apexY + 0.06, 0]), outFrom([0, apexY + 0.01, 0]), at, white);
}

// The boardwalk's edges: a low kerb board along each side, butted plank to
// plank, and a short post every 7.5m standing against its outside face. The
// east kerb breaks for the pier's mouth; posts skip anything they would
// crowd (benches, lamps, the box, tippables, the water bowl, the spawn).
// Weathered timber: greyer and a little darker than the deck (0xa08050 under
// its wood tile), so the edge reads as old boards, not as fresh orange trim.
const KERB_COL = 0x7a6852;
const POST_SKIP = [[18, 14], [18, -18], [20, 30], [20, -30], [19, 24], [17, 15], [17, -17], [21, 29], [17.5, 8]];
function addBoardwalkEdge(P, area, keep) {
  const kerb = lin(KERB_COL);
  const runs = [[18, -45, 45], [22, -45, -11.6], [22, -8.4, 45]];
  runs.forEach(([x, z0, z1], ri) => {
    let z = z0;
    let k = 0;
    while (z < z1 - 1e-6) {
      const len = Math.min(z1 - z, 4.5 + 3 * hash01(ri, k, 2201));
      const tooShort = z1 - (z + len) < 1.5;
      const L = tooShort ? z1 - z : len;
      const first = z === z0; const last = tooShort;
      const tris = boxTris(0.08, 0.095, L, { y0: -0.015, ends: false });
      // Only the run's own two ends show an end face.
      const ends = boxTris(0.08, 0.095, L, { y0: -0.015 }).slice(6);
      if (first) tris.push(...ends.slice(0, 2));
      if (last) tris.push(...ends.slice(2, 4));
      P.put(tris, boxFace(0.095, -0.015), place({ x, z: z + L / 2 }), vary(kerb, 0.9 + 0.14 * hash01(ri, k, 2202)));
      z += L;
      k++;
    }
  });
  const post = lin(0x6c5c4a);
  for (const [x, east] of [[17.88, false], [22.12, true]]) {
    for (let i = 0; i < 12; i++) {
      const z = -41.25 + 7.5 * i;
      if ([...POST_SKIP, [area.spawn.x, area.spawn.z]].some(([px, pz]) => Math.hypot(x - px, z - pz) < 1.6)) continue;
      if (east && Math.hypot(x - 22, Math.max(0, -11.5 - z, z + 8.5)) < 1.6) continue;
      if (keep.some((q) => Math.hypot(x - q.x, z - q.z) < q.r)) continue;
      P.put(boxTris(0.16, 0.42, 0.16), boxFace(0.42), place({ x, z }), vary(post, 0.9 + 0.15 * hash01(i, x, 2203)));
    }
  }
}

const BUILDERS = {
  shell: addShell, starfish: addStarfish, pebble: addPebble, kelp: addKelp, driftwood: addDriftwood,
  castle: addCastle, bucket: addBucket, spade: addSpade, umbrella: addUmbrella,
};

function buildDressing(area, keep) {
  const P = new Props();
  for (const it of planBeach(area)) BUILDERS[it.kind](P, it);
  addBoardwalkEdge(P, area, keep);
  return dressMesh([P.T.geometry()], { name: 'beachDressing', side: THREE.FrontSide });
}

// Dresses the Seaside's beach from its area record (which it reads, never
// changes). Adds its meshes to the scene and returns them.
export function dressBeach(scene, area) {
  const keep = beachKeepOut(area);
  // The 140m dry-sand plane (seaside.js build), whose colours the paint matches.
  const groundMesh = scene.children.find((c) => c.isMesh && c.userData.ground
    && c.geometry?.parameters?.width === 140 && c.geometry.attributes.color);
  const paint = withLocalUuids('seaside-beach-paint', () => buildPaint(keep, groundMesh));
  const dressing = withLocalUuids('seaside-beach-dressing', () => buildDressing(area, keep));
  scene.add(paint);
  scene.add(dressing);
  return { paint, dressing };
}
