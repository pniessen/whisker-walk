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
import { smoothField, PAINT_Y, Tris, lin, scale3, smoothstep } from './dressing.js';
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

// A flat irregular fan of n triangles; centre and rim colours from col.
function clump(T, x, z, r, col, { n = 7, salt = 0, wobble = 0.35, sx = 1 } = {}) {
  const rim = [];
  const rot = hash01(x, z, salt + 5) * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const rr = r * (1 + wobble * (hash01(x + i, z, salt) * 2 - 1));
    rim.push([x + Math.cos(a) * rr * sx, z + Math.sin(a) * rr]);
  }
  const c0 = col(x, z, 0);
  for (let i = 0; i < n; i++) {
    const p = rim[i];
    const q = rim[(i + 1) % n];
    tri(T, [x, z], p, q, c0, col(p[0], p[1], 1), col(q[0], q[1], 1));
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

function paintTideLines(T, sand) {
  // The fresh line of seaweed the last high tide left: it follows the wet
  // edge's own wander (seaside.js wetness) a little way down the wet ramp.
  const tideX = (z) => {
    const reach = 0.32 * Math.sin(z * 0.33 + 1.3) + 0.16 * Math.sin(z * 0.91);
    return 22.85 - 0.8 * reach + 0.08 * Math.sin(z * 1.7 + 0.4);
  };
  const weedA = lin(0x4f4a2a);
  const weedB = lin(0x6b5a32);
  let z = -44;
  let i = 0;
  while (z < 44) {
    const h = hash01(i, 11, 401);
    const len = 0.8 + 1.6 * h;
    const gap = 0.3 + 0.9 * hash01(i, 13, 401);
    const z1 = Math.min(44, z + len);
    if (!PIER_MOUTH(z) && !PIER_MOUTH(z1) && !(z < -12.5 && z1 > -7.5)) {
      const base = mix(weedA, weedB, hash01(i, 17, 401));
      const shift = 0.05 * (hash01(i, 19, 401) * 2 - 1);
      const xOf = (zz) => tideX(zz) + shift;
      stroke(T, alongZ(z, z1, 0.55, xOf), 0.09 + 0.07 * hash01(i, 23, 401),
        (x, zz) => mix(base, weedA, 0.5 + 0.5 * Math.sin(zz * 5.1 + x * 3.3)).map((v) => v * (0.92 + 0.12 * hash01(x * 7, zz * 7, 402))),
        { salt: 410 + i, wobble: 0.45 });
      // Some dashes have a thin second strand of darker weed just seaward,
      // shorter and off-centre, so the line reads as tangled wrack rather
      // than a row of dashes. Kept clear of the main strand's widest edge.
      if (hash01(i, 53, 401) > 0.55) {
        const off = 0.34 + 0.08 * hash01(i, 59, 401);
        const f0 = 0.1 + 0.3 * hash01(i, 61, 401);
        const f1 = f0 + 0.45 + 0.25 * hash01(i, 67, 401);
        const s0 = z + len * f0;
        const s1 = Math.min(z1, z + len * Math.min(1, f1));
        if (s1 - s0 > 0.4) {
          stroke(T, alongZ(s0, s1, 0.55, (zz) => xOf(zz) + off), 0.04 + 0.02 * hash01(i, 71, 401),
            () => scale3(weedA, 0.8), { salt: 440 + i, wobble: 0.4 });
        }
      }
      // Now and then a heap of weed in the gap after the dash.
      const zc = z1 + gap / 2;
      if (hash01(i, 29, 401) > 0.6 && gap > 0.6 && !PIER_MOUTH(zc) && zc < 44) {
        const r = 0.14 + 0.12 * hash01(i, 31, 401);
        clump(T, tideX(zc) + 0.1 * (hash01(i, 37, 401) * 2 - 1), zc, Math.min(r, gap / 2 - 0.05),
          (x, zz, rim) => (rim ? base : weedA), { n: 6, salt: 420 + i, wobble: 0.4, sx: 1.3 });
      }
    }
    z = z1 + gap;
    i++;
  }

  // The old wrack line from an earlier, higher tide: a faint, thin, broken
  // greyed line on the landward side, wet-aware so it darkens with the band.
  const dryFrom = 22.04;
  const wrackX = (zz) => Math.max(dryFrom, tideX(zz) - 0.62 + 0.05 * Math.sin(zz * 2.3));
  const grey = [0.84, 0.81, 0.76];
  const wrackCol = (x, zz) => {
    const k = wetness(x, zz);
    const wet = [0, 1, 2].map((c) => 1 + (WET_TINT[c] - 1) * k);
    return mul(mul(sand, sandTint(x, zz)), wet).map((v, c) => v * grey[c]);
  };
  z = -43.5;
  i = 0;
  while (z < 44) {
    const len = 0.5 + 1.1 * hash01(i, 41, 403);
    const gap = 0.8 + 1.8 * hash01(i, 43, 403);
    const z1 = Math.min(44, z + len);
    if (!PIER_MOUTH(z) && !PIER_MOUTH(z1) && !(z < -12.5 && z1 > -7.5)) {
      stroke(T, alongZ(z, z1, 0.6, wrackX), 0.04 + 0.02 * hash01(i, 47, 403), wrackCol,
        { salt: 430 + i, wobble: 0.3 });
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

function paintRipples(T, sand, keep) {
  // Wind off the sea (east) heaps the dry sand into low ridges across it, so
  // they run roughly north-south. They come in little fields of 3-5 nearly
  // parallel strokes, each a darker trough with, on most, a paler crest on
  // its west side where the low sun catches it.
  const trough = (x, z) => mul(sand, sandTint(x, z), 0.88 + 0.03 * Math.sin(x * 4.7 + z * 2.1));
  const crest = (x, z) => mul(sand, sandTint(x, z), 1.05);
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

function paintShade(T, sand) {
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
  const col = (p) => mul(sand, sandTint(p[0], p[1]), shadeK(p[0], p[1]));
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

function paintMoats(T, sand) {
  // The dug ring round each sandcastle: damp sand turned up, darker, with
  // uneven rims.
  const n = 12;
  BEACH_SPOTS.castles.forEach((c, ci) => {
    const rim = (r, i, salt) => {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 + 0.08 * (hash01(ci, i % n, salt) * 2 - 1));
      return [c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr];
    };
    const inner = (p) => mul(sand, sandTint(p[0], p[1]), 0.76);
    const outer = (p) => mul(sand, sandTint(p[0], p[1]), 0.84);
    for (let i = 0; i < n; i++) {
      const a = rim(0.75, i, 901); const b = rim(0.75, i + 1, 901);
      const d = rim(0.95, i, 902); const e = rim(0.95, i + 1, 902);
      tri(T, a, d, b, inner(a), outer(d), inner(b));
      tri(T, b, d, e, inner(b), outer(d), outer(e));
    }
  });
}

function buildPaint(keep) {
  const T = new Tris();
  const sand = lin(BEACH);
  paintTideLines(T, sand);
  paintRipples(T, sand, keep);
  paintShade(T, sand);
  paintMoats(T, sand);
  paintTowel(T);
  const mesh = new THREE.Mesh(
    T.geometry(),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
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

// Dresses the Seaside's beach from its area record (which it reads, never
// changes). Adds its meshes to the scene and returns them.
export function dressBeach(scene, area) {
  const keep = beachKeepOut(area);
  const paint = withLocalUuids('seaside-beach-paint', () => buildPaint(keep));
  scene.add(paint);
  return { paint, dressing: null };
}
