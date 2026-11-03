// The Narrows: the Gorge's spawn corridor (x < -18, z -16..-6) between the
// west rim and the west wall. Its rock is recoloured here, warm and in
// visible strata with a sunlit rim, through builder.rockTerrain's `tint`
// option (colours only; no vertex moves). Outside NARROWS_ZONE the tint
// fades out over NARROWS_FADE metres and leaves the colour as it was.
import * as THREE from 'three';
import { MASSES } from './gorgeshape.js';
import { strataBand, noise3, RELIEF_DEPTH } from './rockrelief.js';
import { seedFromCode } from '../rng.js';
import { litMaterial, surfaceProps } from '../render/materials.js';

export const NARROWS_ZONE = Object.freeze({ minX: -62, maxX: -20, minZ: -18, maxZ: -4 });
export const NARROWS_FADE = 3; // metres of blend outside the zone
// Part of rockTerrain's cache key: bump it whenever narrowsTint changes.
export const NARROWS_TINT_KEY = 'narrows-2';

const SEED = seedFromCode('gorge-rock'); // the rock's own seed, so the bands match its shelves
const FOOT = new THREE.Color(0x8a7560); // warm umber at the wall foot
const CREST = new THREE.Color(0xd9b98c); // sunlit sandstone near the top
const SUN = new THREE.Color(0xf2d29a); // the rim's light
// Per band (mod 3): rust, cream, ochre, each with its own shade (darker,
// lighter, between) so two neighbouring 1.1 m bands always read apart; a
// little seeded noise on top keeps the repeat from showing.
const HUES = [[1.18, 0.88, 0.74], [1.03, 1.04, 1.02], [1.12, 1.0, 0.72]];
const BAND_LEVEL = [-1, 1, -0.1];
const BAND_SHADE = 0.22;
const BAND_NOISE = 0.15; // of BAND_SHADE
const RECESS_DARK = 0.3;
const RIM_LIFT = 0.28;
const RIM_SUN = 0.25;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// Distance in the ground plane from (x, z) to rectangle r (0 inside it).
const rectDist = (r, x, z) => Math.hypot(
  Math.max(r.minX - x, 0, x - r.maxX),
  Math.max(r.minZ - z, 0, z - r.maxZ),
);

// 1 inside the zone, easing to 0 at NARROWS_FADE outside it.
export function narrowsWeight(x, z) {
  const d = rectDist(NARROWS_ZONE, x, z);
  return d <= 0 ? 1 : 1 - smoothstep(0, NARROWS_FADE, d);
}

// The highest top of any rock mass within 1.0 m of (x, z), 0 if none.
export function localTop(x, z) {
  let top = 0;
  for (const m of MASSES) {
    if (rectDist(m, x, z) <= 1.0) top = Math.max(top, m.y0, m.y1 ?? m.y0);
  }
  return top;
}

// rockTerrain's tint: (x, y, z) the vertex before the relief, rgb its colour
// as rockColour made it, recess how deep the relief pushed it in.
export function narrowsTint(x, y, z, rgb, recess) {
  const w = narrowsWeight(x, z);
  if (w <= 0) return [rgb[0], rgb[1], rgb[2]];
  const top = localTop(x, z);
  const t = top > 0 ? clamp01(y / top) ** 0.8 : 0;
  const band = strataBand(x, y, z, SEED);
  const b3 = ((band % 3) + 3) % 3;
  const hue = HUES[b3];
  const level = (1 - BAND_NOISE) * BAND_LEVEL[b3] + BAND_NOISE * (2 * noise3(band, 0, 0, SEED + 5) - 1);
  const shade = (1 + BAND_SHADE * level)
    * (1 - RECESS_DARK * clamp01(recess / RELIEF_DEPTH));
  // No mass near (a lip out on the floor): no rim to light.
  const rim = top > 0 ? smoothstep(top - 1.6, top - 0.2, y) : 0;
  const lift = 1 + RIM_LIFT * rim;
  const sun = RIM_SUN * rim;
  const out = [0, 0, 0];
  const keys = ['r', 'g', 'b'];
  for (let i = 0; i < 3; i++) {
    const k = keys[i];
    const c = lerp(lerp(FOOT[k], CREST[k], t) * hue[i] * shade * lift, SUN[k], sun);
    out[i] = clamp01(lerp(rgb[i], c, w));
  }
  return out;
}

// =============================================================================
// THE DRESSING. One shadowless mesh (narrowsDressing): grass tufts on the
// walls' real shelves and crests, a few low shrubs on the crests, and, out of
// the corridor's west end, a low Moor (a rolling sheet, three mounds, a tor
// and a few pines) where the horizon band dips (NARROWS_VIEW, a keepLow
// capsule in GORGE_HORIZON). Tufts and shrubs are placed by ray-casting the
// built rockFaces (relief and all), so each sits where the rock really is.
// The arrays are computed once per page (rockTerrain caches its rock per page
// too) and copied into a fresh geometry each build: walk.js disposes it.
// =============================================================================

// The band is held at the waterline along this capsule, so the view shows.
// r 16: wide enough that the band's rising sides (KEEP_LOW_RAMP more) stay
// outside what the corridor's slot shows of it.
export const NARROWS_VIEW = Object.freeze({ x1: -58, z1: -11, x2: -130, z2: -11, r: 16 });

const WALL_N = -16; // the north wall's line (rock at z < -16, facing +z)
const WALL_S = -6; // the south wall's line (rock at z > -6, facing -z)
// The rock triangles a ray here can hit: centroid in the Narrows' box.
const ROCK_BOX = Object.freeze({ maxX: -18.5, minZ: -17.6, maxZ: -4.4 });
const SHELF = Object.freeze({
  x0: -49, x1: -20, dx: 1.3, y0: 1.5, dy: 1.0, out: 0.9, minNy: 0.15, minY: 1.2, cap: 50,
});
const TOPS = Object.freeze({
  x0: -49, x1: -19.5, dx: 1.1, back: [0.3, 1.0], above: 3, minNy: 0.5, drop: 0.6, tufts: 40, shrubs: 16,
});
const TUFT_GREENS = [0x7f9a52, 0x6f8040];
const TUFT_DRY = 0xb0a46e;
const SHRUB_LO = 0x5f7a3e, SHRUB_HI = 0x6f8a4a;
const SALT = 71;

// builder.js's private hash01 (the same as docksdressing.js's copy): a pure
// function of its arguments.
function hash01(x, z, salt) {
  const h = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

// rockFaces' triangles near the Narrows (9 floats each), so no ray scans the
// whole rock. Exported for the test that checks every tuft is on the rock.
export function narrowsRockTris(rockFaces) {
  const p = rockFaces.geometry.getAttribute('position').array;
  const n = rockFaces.geometry.getAttribute('normal')?.array;
  const out = [], nor = [];
  for (let i = 0; i < p.length; i += 9) {
    const cx = (p[i] + p[i + 3] + p[i + 6]) / 3;
    const cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
    if (cx < ROCK_BOX.maxX && cz > ROCK_BOX.minZ && cz < ROCK_BOX.maxZ) {
      for (let k = 0; k < 9; k++) out.push(p[i + k]);
      if (n) nor.push(n[i], n[i + 1], n[i + 2]);
    }
  }
  const tris = new Float32Array(out);
  tris.normals = n ? new Float32Array(nor) : null;
  return tris;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _hit = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
const _ray = new THREE.Ray();
// The nearest front-facing hit along the ray: { x, y, z, ny } or null.
function cast(tris, ox, oy, oz, dx, dy, dz) {
  _ray.origin.set(ox, oy, oz);
  _ray.direction.set(dx, dy, dz).normalize();
  let best = null, bestD = Infinity;
  for (let i = 0, t = 0; i < tris.length; i += 9, t++) {
    _a.fromArray(tris, i); _b.fromArray(tris, i + 3); _c.fromArray(tris, i + 6);
    if (!_ray.intersectTriangle(_a, _b, _c, true, _hit)) continue;
    const d = _hit.distanceToSquared(_ray.origin);
    if (d >= bestD) continue;
    bestD = d;
    let ny;
    if (tris.normals) ny = tris.normals[t * 3 + 1];
    else ny = _e1.subVectors(_b, _a).cross(_e2.subVectors(_c, _a)).normalize().y;
    best = { x: _hit.x, y: _hit.y, z: _hit.z, ny };
  }
  return best;
}

// Where the tufts and shrubs go. Every candidate draws its own hashes from its
// own grid position, so dropping one never moves another.
function placements(tris) {
  const shelf = [], crest = [], shrubs = [];
  // Shelves: rays from 0.9 m in front of each wall, down and in.
  for (const [wall, toWall, w] of [[WALL_N, -1, 0], [WALL_S, 1, 1]]) {
    for (let i = 0; SHELF.x0 + i * SHELF.dx <= SHELF.x1; i++) {
      const xg = SHELF.x0 + i * SHELF.dx;
      const top = localTop(xg, wall);
      for (let j = 0; SHELF.y0 + j * SHELF.dy <= top - 1; j++) {
        const yg = SHELF.y0 + j * SHELF.dy;
        const x = xg + 0.8 * (hash01(xg, yg + w * 50, SALT) - 0.5);
        const y = yg + 0.8 * (hash01(xg, yg + w * 50, SALT + 1) - 0.5);
        const h = cast(tris, x, y, wall - toWall * SHELF.out, 0, -0.6, 0.8 * toWall);
        if (h && h.ny > SHELF.minNy && h.y >= SHELF.minY) shelf.push({ ...h, seed: hash01(x, y, SALT + 2) });
      }
    }
  }
  // Crests: straight down onto the tops, a little back from each wall line.
  for (const [wall, toWall, w] of [[WALL_N, -1, 0], [WALL_S, 1, 1]]) {
    for (let i = 0; TOPS.x0 + i * TOPS.dx <= TOPS.x1; i++) {
      const xg = TOPS.x0 + i * TOPS.dx;
      const x = xg + 0.6 * (hash01(xg, w, SALT + 3) - 0.5);
      const back = TOPS.back[0] + (TOPS.back[1] - TOPS.back[0]) * hash01(xg, w, SALT + 4);
      const z = wall + toWall * back;
      const top = localTop(x, wall);
      if (top <= 0) continue;
      const h = cast(tris, x, top + TOPS.above, z, 0, -1, 0);
      if (!h || h.ny <= TOPS.minNy || h.y <= top - TOPS.drop) continue;
      const pick = hash01(xg, w, SALT + 5);
      const seed = hash01(xg, w, SALT + 6);
      if (pick < 0.3 && shrubs.length < TOPS.shrubs) shrubs.push({ ...h, seed });
      else if (crest.length < TOPS.tufts) crest.push({ ...h, seed });
    }
  }
  return { shelf: shelf.slice(0, SHELF.cap), crest, shrubs };
}

function builder() {
  const pos = [], col = [], nor = [];
  const vert = (x, y, z, c, n) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); nor.push(n[0], n[1], n[2]); };
  const UP = [0, 1, 0];
  const _u = new THREE.Vector3(), _v = new THREE.Vector3();
  // A flat-shaded triangle: its own face normal.
  const tri = (p, q, r, c) => {
    _u.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    _v.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]);
    _u.cross(_v).normalize();
    const n = [_u.x, _u.y, _u.z];
    vert(...p, c, n); vert(...q, c, n); vert(...r, c, n);
  };
  return { pos, col, nor, vert, tri, UP };
}

// Three blades, front and back faces, as gorge.js's meadow tufts.
// Sized to read from the floor (a shelf 2-8 m up): blades as wide and leaning
// as far as their height asks. One tuft in five is dry.
function tuft(B, t, height) {
  const dry = t.seed >= 0.8;
  const base = new THREE.Color(dry ? TUFT_DRY : TUFT_GREENS[t.seed < 0.4 ? 0 : 1]);
  const tip = base.clone().multiplyScalar(1.12);
  const rot = t.seed * 97.3;
  for (let k = 0; k < 3; k++) {
    const a = rot + (k * Math.PI * 2) / 3;
    const lean = height * (0.18 + 0.1 * k);
    const w = 0.09 * height;
    const bx = t.x + Math.cos(a) * 0.05, bz = t.z + Math.sin(a) * 0.05;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean;
    const h = height * (0.85 + 0.15 * k);
    // A hair into the rock, so no blade floats, but never below the shelves'
    // lowest height (nothing under 1.2 m over the walk).
    const y = t.y - Math.min(0.02, Math.max(0, t.y - SHELF.minY));
    B.vert(bx - px, y, bz - pz, base, B.UP); B.vert(bx + px, y, bz + pz, base, B.UP); B.vert(tx, y + h, tz, tip, B.UP);
    B.vert(bx + px, y, bz + pz, base, B.UP); B.vert(bx - px, y, bz - pz, base, B.UP); B.vert(tx, y + h, tz, tip, B.UP);
  }
}

// A flattened octahedron (8 faces), set into the crest.
function shrub(B, s) {
  const r = 0.25 + 0.15 * hash01(s.x, s.z, SALT + 7);
  const hh = 0.6 * r;
  const c = new THREE.Color(SHRUB_LO).lerp(new THREE.Color(SHRUB_HI), s.seed);
  const cy = s.y + 0.5 * hh;
  const rot = s.seed * 53.1;
  const ring = [0, 1, 2, 3].map((k) => {
    const a = rot + (k * Math.PI) / 2;
    return [s.x + Math.cos(a) * r, cy, s.z + Math.sin(a) * r];
  });
  const top = [s.x, cy + hh, s.z], bot = [s.x, cy - hh, s.z];
  for (let k = 0; k < 4; k++) {
    const p = ring[k], q = ring[(k + 1) % 4];
    B.tri(top, q, p, c);
    B.tri(bot, p, q, c);
  }
}

// --- the view out: a low Moor past the corridor's west end -------------------
// The sheet starts under the ground plane's edge (x -60), at EDGE_Y: a hair
// below the plane, over the band's floor (-0.03), so neither the band nor a
// gap shows where the Gorge's ground ends. Its first column is short (x0 to
// x0b) and its colour runs from the Gorge's floor sand to the Moor's by
// x -70, so the seam doesn't read as a line across the floor.
const VIEW = Object.freeze({ x0: -58, x0b: -62, x1: -130, z0: -44, z1: 22, n: 12, rise: 5, bump: 1.5 });
const EDGE_Y = -0.015;
const VIEW_START = -60; // where the rise and the bumps begin
const SAND_TO = -70; // the sand blends into the Moor's colours by here
const MOOR_GREEN = 0x7f8f55, HEATHER = 0x9a6f8c, DRY = 0xa89a6a;
const MOUNDS = Object.freeze([
  { x: -92, z: -20, r: 14, h: 7 },
  { x: -104, z: -2, r: 16, h: 9 },
  { x: -118, z: -14, r: 18, h: 11 },
]);
const TOR_COLOR = 0x8f8a80;
const PINES = Object.freeze([
  { x: -66, z: -15, s: 1.0 }, { x: -70, z: -5, s: 1.15 }, { x: -78, z: -13, s: 1.3 }, { x: -74, z: -9, s: 0.9 },
]);
const PINE_GREEN = 0x4f6a3c, TRUNK = 0x6b5440;
const VIEW_SEED = seedFromCode('narrows-view');
// gorge.js's GORGE_FLOOR_COLOR (not imported: gorge.js imports this file).
const FLOOR_SAND = 0x9a8a6a;

const sheetY = (x, z) => {
  if (x > VIEW_START) return EDGE_Y; // under the ground plane
  const t = clamp01((VIEW_START - x) / (VIEW_START - VIEW.x1));
  const bump = VIEW.bump * (2 * noise3(x / 16, 0, z / 16, VIEW_SEED) - 1);
  // never under EDGE_Y, so the band's floor never shows through a dip
  return Math.max(EDGE_Y, VIEW.rise * smoothstep(0, 1, t) + bump * smoothstep(0.03, 0.3, t));
};
const _cg = new THREE.Color(MOOR_GREEN), _ch = new THREE.Color(HEATHER), _cd = new THREE.Color(DRY);
const _cs = new THREE.Color(FLOOR_SAND);
const sheetColor = (x, z) => {
  const heather = smoothstep(0.45, 0.7, noise3(x / 12, 1, z / 12, VIEW_SEED + 1));
  const dry = smoothstep(0.5, 0.75, noise3(x / 18, 2, z / 18, VIEW_SEED + 2));
  const moor = _cg.clone().lerp(_cd, dry * 0.8).lerp(_ch, heather * 0.85);
  return _cs.clone().lerp(moor, smoothstep(VIEW_START, SAND_TO, x));
};

function view(B) {
  const { x0, x0b, x1, z0, z1, n } = VIEW;
  const P = (i, j) => {
    const x = i === 0 ? x0 : x0b + ((x1 - x0b) * (i - 1)) / (n - 1), z = z0 + ((z1 - z0) * j) / n;
    return [x, sheetY(x, z), z];
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = P(i, j), b2 = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      const mid = (p, q, r) => sheetColor((p[0] + q[0] + r[0]) / 3, (p[2] + q[2] + r[2]) / 3);
      // x decreases with i: (a, c, b2) and (a, d, c) face up.
      B.tri(a, b2, c, mid(a, b2, c));
      B.tri(a, c, d, mid(a, c, d));
    }
  }
  // Three low mounds, 8 sides x 3 rings, their foot sunk into the sheet.
  const tops = MOUNDS.map((m, mi) => {
    const baseY = sheetY(m.x, m.z) - 0.6;
    const rings = [[1, 0], [0.62, 0.55], [0.28, 0.9]].map(([fr, fh], ri) => Array.from({ length: 8 }, (_, k) => {
      const a = (k * Math.PI) / 4 + mi * 0.4;
      const wob = 1 + 0.12 * (hash01(mi, k + ri * 8, SALT + 8) - 0.5);
      const x = m.x + Math.cos(a) * m.r * fr * wob, z = m.z + Math.sin(a) * m.r * fr * wob;
      const y = ri === 0 ? sheetY(x, z) - 0.6 : baseY + m.h * fh;
      return [x, y, z];
    }));
    const apex = [m.x, baseY + m.h, m.z];
    const colAt = (p) => sheetColor(p[0] + 7, p[2] - 5);
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < 8; k++) {
        const p = rings[r][k], q = rings[r][(k + 1) % 8], s = rings[r + 1][(k + 1) % 8], t = rings[r + 1][k];
        B.tri(p, s, q, colAt(p));
        B.tri(p, t, s, colAt(p));
      }
    }
    for (let k = 0; k < 8; k++) B.tri(rings[2][k], apex, rings[2][(k + 1) % 8], colAt(apex));
    return apex;
  });
  // A grey tor on the middle mound's top: two stacked blocks.
  const tc = new THREE.Color(TOR_COLOR);
  const box = (cx, cy, cz, hx, hy, hz, a, c) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    const v = (sx, sy, sz) => [cx + sx * hx * ca - sz * hz * sa, cy + sy * hy, cz + sx * hx * sa + sz * hz * ca];
    const quad = (p, q, r, s) => { B.tri(p, q, r, c); B.tri(p, r, s, c); };
    const [a0, a1, a2, a3] = [v(-1, 1, -1), v(1, 1, -1), v(1, 1, 1), v(-1, 1, 1)];
    const [b0, b1, b2, b3] = [v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1)];
    quad(a0, a3, a2, a1); // top
    quad(b0, b1, b2, b3); // bottom
    quad(b0, a0, a1, b1);
    quad(b1, a1, a2, b2);
    quad(b2, a2, a3, b3);
    quad(b3, a3, a0, b0);
  };
  const t = tops[1];
  box(t[0], t[1] + 0.6, t[2], 2.2, 1.4, 1.6, 0.4, tc);
  box(t[0] + 0.4, t[1] + 2.5, t[2] - 0.2, 1.5, 0.7, 1.1, 0.9, tc.clone().multiplyScalar(1.06));
  // Low-poly pines: a four-sided trunk and two six-sided cone tiers.
  const pg = new THREE.Color(PINE_GREEN), tr = new THREE.Color(TRUNK);
  for (const p of PINES) {
    const y0 = sheetY(p.x, p.z) - 0.2;
    const s = p.s;
    const ring = (r, y, k, rot = 0) => {
      const a = rot + (k * Math.PI * 2) / (r.n);
      return [p.x + Math.cos(a) * r.r, y, p.z + Math.sin(a) * r.r];
    };
    const trunk = { r: 0.22 * s, n: 4 };
    for (let k = 0; k < 4; k++) {
      const lo1 = ring(trunk, y0, k), lo2 = ring(trunk, y0, k + 1);
      const hi1 = ring(trunk, y0 + 1.6 * s, k), hi2 = ring(trunk, y0 + 1.6 * s, k + 1);
      B.tri(lo1, hi2, lo2, tr); B.tri(lo1, hi1, hi2, tr);
    }
    for (const [r, yb, ht, shade] of [[1.7, 1.2, 3.0, 1], [1.2, 3.1, 2.8, 1.1]]) {
      const tier = { r: r * s, n: 6 };
      const yy = y0 + yb * s, apex = [p.x, yy + ht * s, p.z], mid = [p.x, yy, p.z];
      const c = pg.clone().multiplyScalar(shade);
      const under = pg.clone().multiplyScalar(0.7);
      for (let k = 0; k < 6; k++) {
        const q1 = ring(tier, yy, k, 0.3), q2 = ring(tier, yy, k + 1, 0.3);
        B.tri(q1, apex, q2, c);
        B.tri(q1, q2, mid, under);
      }
    }
  }
}

// Built once per page and reused: it assumes the Gorge's one fixed rock (its
// rockFaces never change between builds), so `rockFaces` is NOT part of any
// key. A second caller with different rock would get these stale tufts; key
// the cache on it (or drop it) before adding one.
let cached = null; // { pos, col, nor, counts, bases }

function compute(rockFaces) {
  const tris = narrowsRockTris(rockFaces);
  const { shelf, crest, shrubs } = placements(tris);
  const B = builder();
  for (const t of shelf) tuft(B, t, 0.4 + 0.3 * hash01(t.x, t.z, SALT + 9));
  for (const t of crest) tuft(B, t, 0.5 + 0.4 * hash01(t.x, t.z, SALT + 9));
  for (const s of shrubs) shrub(B, s);
  const before = B.pos.length / 9;
  view(B);
  const viewTris = B.pos.length / 9 - before;
  return {
    pos: new Float32Array(B.pos),
    col: new Float32Array(B.col),
    nor: new Float32Array(B.nor),
    counts: Object.freeze({ shelfTufts: shelf.length, crestTufts: crest.length, shrubs: shrubs.length, viewTris }),
    bases: [...shelf, ...crest, ...shrubs].map(({ x, y, z }) => Object.freeze({ x, y, z })),
  };
}

// Every shelf and crest tuft's base and every shrub's centre-base, from the
// last computed dressing (narrowsDressing must have run).
export function narrowsTuftBases() {
  if (!cached) throw new Error('narrowsTuftBases: narrowsDressing has not been built');
  return cached.bases.map((p) => ({ ...p }));
}

export function narrowsDressing(rockFaces) {
  if (!cached) cached = compute(rockFaces);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(cached.pos.slice(), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cached.col.slice(), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(cached.nor.slice(), 3));
  geo.computeBoundingSphere();
  // The 'grass' preset's light response with no map, as the meadow.
  const mat = litMaterial(0xffffff, { vertexColors: true, ...surfaceProps('grass') });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'narrowsDressing';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.noCast = true;
  mesh.userData.counts = { ...cached.counts };
  return mesh;
}
