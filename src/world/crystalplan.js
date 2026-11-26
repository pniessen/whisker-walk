// =============================================================================
// THE CRYSTAL CAVE: THE PLAN (milestone C1, the cave world). Every coordinate of the floor, its zones, the return arch, the crystal clusters, the
// rim rocks, the dome and the glints: pure data and pure functions (no THREE, no clock, no Math.random; the scatters use seeded streams).
// crystalparts.js and crystallight.js draw from these; the tests read them. North is -z, east is +x, heights are metres over the floor's zero.
// docs/superpowers/plans/2026-11-26-crystal-cave.md sections 3 and 8. The numbers marked "start" are tuned from pictures.
// =============================================================================

import { STEP_MAX, MAX_GRADE, SUBSTEP, LEVEL_TOL, groundTilt } from '../ground.js';
import { mulberry32 } from '../rng.js';

export const CRYSTAL_NAME = 'The Crystal Cave';
export const CRYSTAL_BOUNDS = Object.freeze({ minX: -36, maxX: 36, minZ: -32, maxZ: 32 });
export const CRYSTAL_SPAWN = Object.freeze({ x: 0, z: 28 });
export const GROUND_SIZE = 130; // the drawn floor reaches 65 m from the middle; the walk stops at the bounds and the fog closes the rest
export const FLOOR_MAX = 1.0; // the tallest the floor stands over its zero

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---- the zones (plan section 3) ---------------------------------------------------------------------------------------
const Z = (id, x, z, r, name) => Object.freeze({ id, x, z, r, name });
export const ZONES = Object.freeze([
  Z('entry', 0, 24, 8, 'Entry Hall'),
  Z('court', 0, 28, 6, 'Spawn Court'),
  Z('rose', -18, 4, 12, 'Rose Hall'),
  Z('pool', 14, -4, 11, 'Blue Pool'),
  Z('gold', -6, -22, 11, 'Gold Gallery'),
  Z('heart', 22, -22, 11, 'The Heart'),
]);
export const zoneAt = (x, z) => ZONES.find((k) => Math.hypot(x - k.x, z - k.z) <= k.r)?.id ?? null;

// ---- the spawn: the return arch (the C6 gate marks it `own`; it stands at (0, 31) facing north, like the Reef's) --------------
export const ARCH = Object.freeze({ x: 0, z: 31, w: 4.4, h: 3.4, depth: 1.1 });

// ---- the floor ------------------------------------------------------------------------------------------------------------
// One smooth stone floor between 0 and FLOOR_MAX, flat round the spawn court and the entry hall, steeper than 0.5 nowhere. Past the walkable bounds
// it carries on level with the nearest edge (no wall, no rise): the dome's wall stands 10 m or more beyond it.
export function crystalY(x, z) {
  const px = clamp(x, CRYSTAL_BOUNDS.minX, CRYSTAL_BOUNDS.maxX);
  const pz = clamp(z, CRYSTAL_BOUNDS.minZ, CRYSTAL_BOUNDS.maxZ);
  const n = 0.5 * Math.sin(px * 0.11 + 0.7) * Math.cos(pz * 0.09 + 0.2) + 0.3 * Math.sin(px * 0.23 - pz * 0.19 + 1.3) + 0.2 * Math.sin(pz * 0.37 + px * 0.15);
  const open = smooth((Math.hypot(px - 0, pz - 26) - 6) / 8); // flat within 6 m of the entry hall's mouth, full floor by 14
  return FLOOR_MAX * 0.5 * (1 + n) * open;
}

const EPS = 0.25;
// The ground in the shape the walk reads (src/ground.js's), made from the function above; a step legal under the same rule as every raised ground.
export function createCrystalGround() {
  const y = crystalY;
  function canStep(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len === 0) return true;
    const n = Math.max(1, Math.ceil(len / SUBSTEP - 1e-9));
    const seg = len / n;
    const tol = STEP_MAX + MAX_GRADE * seg;
    let prev = y(ax, az);
    for (let i = 1; i <= n; i++) {
      const cur = y(ax + (dx * i) / n, az + (dz * i) / n);
      if (Math.abs(cur - prev) > tol) return false;
      prev = cur;
    }
    return true;
  }
  function slide(px, pz, pos) {
    if (canStep(px, pz, pos.x, pos.z)) return false;
    if (canStep(px, pz, pos.x, pz)) pos.z = pz;
    else if (canStep(px, pz, px, pos.z)) pos.x = px;
    else { pos.x = px; pos.z = pz; }
    return true;
  }
  const self = Object.freeze({
    flat: false,
    y,
    ceil: () => Infinity,
    canStep,
    slide,
    sameLevel: (ax, az, bx, bz) => Math.abs(y(ax, az) - y(bx, bz)) <= LEVEL_TOL,
    gradient(x, z, out) {
      out.x = (y(x + EPS, z) - y(x - EPS, z)) / (2 * EPS);
      out.z = (y(x, z + EPS) - y(x, z - EPS)) / (2 * EPS);
      return out;
    },
    tilt: (x, z, yaw, out) => groundTilt(self, x, z, yaw, out),
  });
  return self;
}

// ---- the dome -------------------------------------------------------------------------------------------------------------
// The ceiling is ONE inside-only lathed mesh (never a `ground.ceil`: that would trigger the den's cave view). Profile [radius, height], from the wall
// up to the crown. The walkable corner is 48.2 m from the middle, so the wall (58 m) stands 9.8 m beyond it and the dome is 13 m or more over every
// walkable point (the camera's farthest allowed step, 2, reaches about 4.5 m).
export const DOME_PROFILE = Object.freeze([[58, -1], [58, 6], [56, 9.5], [50, 13], [38, 15.6], [20, 17.2], [0, 17.8]].map((p) => Object.freeze(p)));
export function domeY(r) {
  const P = DOME_PROFILE;
  if (r >= P[0][0]) return P[1][1];
  for (let i = 1; i < P.length - 1; i++) {
    if (r >= P[i + 1][0]) {
      const [r0, y0] = P[i]; const [r1, y1] = P[i + 1];
      return y0 + ((y1 - y0) * (r0 - r)) / (r0 - r1);
    }
  }
  return P[P.length - 1][1];
}
export const STALACTITE_COUNT = 110;
// Stalactites hang from the dome by instance: { x, z, h (length), w (width at the root), y (where it hangs from) }.
export function scatterStalactites() {
  const rng = mulberry32(0x7374616c);
  const out = [];
  for (let i = 0; i < STALACTITE_COUNT; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 52;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.9;
    out.push({ x, z, h: 1.2 + rng() * 2.8, w: 0.25 + rng() * 0.35, y: domeY(Math.hypot(x, z)) });
  }
  return out;
}

// ---- the crystals ---------------------------------------------------------------------------------------------------------
export const HUES = Object.freeze(['rose', 'blue', 'gold', 'heart']);
// Where the three great crystals and the Heart will stand (the stones and the light show come in later milestones). The Rose crystal is built now.
export const ROSE_GREAT = Object.freeze({ x: -22, z: 1.5, s: 2.4, hue: 'rose', yaw: 0.4, great: true });

// Where nothing small may stand: round the spawn, the arch, every zone's middle, the three golden mice's places (src/goldmice.js), the great Rose
// crystal and a margin at the walk's edge. [x, z, r].
export const KEEP_OUT = Object.freeze([
  [CRYSTAL_SPAWN.x, CRYSTAL_SPAWN.z, 6], [ARCH.x, ARCH.z, 4],
  [0, 24, 3], [-18, 4, 3.5], [14, -4, 3.5], [-6, -22, 3.5], [22, -22, 3.5],
  [-28, 4, 2.5], [14, -4, 2.5], [26, -26, 2.5], // the mice (the second is the Blue Pool's own centre)
  [ROSE_GREAT.x, ROSE_GREAT.z, 3.4],
].map((k) => Object.freeze(k)));

function clearOf(x, z, extra = 0) {
  for (const [kx, kz, kr] of KEEP_OUT) if (Math.hypot(x - kx, z - kz) < kr + extra) return false;
  const m = 2.5;
  return x >= CRYSTAL_BOUNDS.minX + m && x <= CRYSTAL_BOUNDS.maxX - m && z >= CRYSTAL_BOUNDS.minZ + m && z <= CRYSTAL_BOUNDS.maxZ - m;
}

const hueAt = (x, z) => {
  const id = zoneAt(x, z);
  if (id === 'rose') return 'rose';
  if (id === 'pool') return 'blue';
  if (id === 'gold') return 'gold';
  if (id === 'heart') return 'heart';
  // the entry hall and the passages: a mix, by which chamber is nearest
  const d = (k) => Math.hypot(x - k.x, z - k.z);
  const near = [ZONES[2], ZONES[3], ZONES[4], ZONES[5]].map((k, i) => [d(k), HUES[i]]).sort((a, b) => a[0] - b[0]);
  return near[0][1];
};

// Clusters: the Rose crystal, a ring of small ones in the Rose hall, the entry hall's two sides, and a lighter scatter over the rest of the cave.
// { x, z, s (size), hue, yaw, n (prisms) }. A pure function of the plan.
export const CLUSTER_COUNT = Object.freeze({ rose: 14, entry: 8, rest: 22 });
export function scatterClusters() {
  const rng = mulberry32(0x63727973);
  const out = [{ ...ROSE_GREAT, n: 7 }];
  const place = (cx, cz, rad, n, hue) => {
    let tries = 0;
    let added = 0;
    while (added < n && tries++ < 4000) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * rad;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const s = 0.5 + rng() * 0.7;
      const yaw = rng() * Math.PI * 2;
      const k = 3 + Math.floor(rng() * 3);
      if (!clearOf(x, z, s * 0.6)) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.s * 0.7 + s * 0.7 + 0.8)) continue;
      out.push({ x, z, s, hue: hue ?? hueAt(x, z), yaw, n: k });
      added++;
    }
  };
  place(-18, 4, 12, CLUSTER_COUNT.rose, 'rose');
  place(0, 22, 9, CLUSTER_COUNT.entry, null);
  place(0, 0, 40, CLUSTER_COUNT.rest, null);
  return out;
}
// The clusters that are solid (a cat walks round them): the big ones, a circle a little smaller than the drawn cluster.
export const clusterColliders = () => scatterClusters().filter((k) => k.s >= 0.95).map((k) => Object.freeze({ x: k.x, z: k.z, r: Math.round(k.s * 0.55 * 100) / 100 + (k.great ? 0.3 : 0) }));

// The rim rocks: dark boulders in a ring just outside the walkable edge, so the edge is a rim of stone and never an empty floor. { x, z, s, yaw }.
export function scatterRim() {
  const rng = mulberry32(0x72696d73);
  const out = [];
  const B = CRYSTAL_BOUNDS;
  const side = (n, f) => { for (let i = 0; i < n; i++) { const t = (i + 0.2 + rng() * 0.6) / n; out.push({ ...f(t), s: 0.8 + rng() * 1.6, yaw: rng() * 6.28 }); } };
  const off = () => 1.2 + rng() * 3;
  side(16, (t) => ({ x: B.minX + t * (B.maxX - B.minX), z: B.minZ - off() }));
  side(16, (t) => ({ x: B.minX + t * (B.maxX - B.minX), z: B.maxZ + off() }));
  side(14, (t) => ({ x: B.minX - off(), z: B.minZ + t * (B.maxZ - B.minZ) }));
  side(14, (t) => ({ x: B.maxX + off(), z: B.minZ + t * (B.maxZ - B.minZ) }));
  return out.filter((k) => Math.hypot(k.x - ARCH.x, k.z - ARCH.z) > 5); // the arch's own gap stays open
}

// The floor's own dressing: small pebbles round the spawn court and the arch, in the stone's greys.
export function scatterPebbles() {
  const rng = mulberry32(0x70656262);
  const out = [];
  for (let i = 0; i < 40; i++) {
    out.push({ x: CRYSTAL_SPAWN.x + (rng() - 0.5) * 16, z: CRYSTAL_SPAWN.z + (rng() - 0.55) * 11, s: 0.08 + rng() * 0.12, yaw: rng() * 3 });
  }
  return out.filter((p) => Math.hypot(p.x - CRYSTAL_SPAWN.x, p.z - CRYSTAL_SPAWN.z) > 1.2);
}

// The glints: tiny sparks that hang by the crystals and twinkle. { x, z, y, hue, phase }; the lite and low rungs draw the first half only.
export const GLINT_COUNT = 90;
export function scatterGlints() {
  const rng = mulberry32(0x676c696e);
  const cl = scatterClusters();
  const out = [];
  for (let i = 0; i < GLINT_COUNT; i++) {
    const c = cl[Math.floor(rng() * cl.length)];
    const a = rng() * Math.PI * 2;
    const r = c.s * (0.5 + rng() * 1.6);
    const x = clamp(c.x + Math.cos(a) * r, CRYSTAL_BOUNDS.minX, CRYSTAL_BOUNDS.maxX);
    const z = clamp(c.z + Math.sin(a) * r, CRYSTAL_BOUNDS.minZ, CRYSTAL_BOUNDS.maxZ);
    out.push({ x, z, y: crystalY(x, z) + 0.3 + rng() * 2.2 * Math.max(0.6, c.s), hue: c.hue, phase: rng() * Math.PI * 2 });
  }
  return out;
}

// ---- the look -------------------------------------------------------------------------------------------------------------
// A warm cave: stone in violet-greys and a warm rose fog (the colour at the horizon is the fog's, so the two agree).
export const CAVE_LOOK = Object.freeze({
  top: 0x3a2a4c, horizon: 0x6a4a6c, fog: 0x6a4a6c, fogNear: 5, fogFar: 38,
  sunColor: 0xffe2d0, sunIntensity: 1.0, hemiSky: 0xc4a2d4, stone: 0x9a8a9c, stoneDark: 0x6c5a70,
});
export const HUE_COLOURS = Object.freeze({ rose: 0xff6fa8, blue: 0x62b8ff, gold: 0xffc65a, heart: 0xffa8f0 });

// Everything solid: the arch's two pillars and the big clusters (all within the bounds).
export const crystalColliders = () => [
  Object.freeze({ x: ARCH.x - ARCH.w / 2 + 0.35, z: ARCH.z, r: 0.5 }),
  Object.freeze({ x: ARCH.x + ARCH.w / 2 - 0.35, z: ARCH.z, r: 0.5 }),
  ...clusterColliders(),
];

// Places a wanderer may head for: open floor, each at least 1.5 m clear of every collider.
export const CRYSTAL_POIS = Object.freeze(
  [[0, 22], [-8, 16], [-30, 14], [-12, -2], [4, 6], [10, 8], [24, 4], [30, -10], [8, -16], [-20, -18], [-28, -26], [28, 22], [-26, 24]]
    .filter(([x, z]) => crystalColliders().every((c) => Math.hypot(x - c.x, z - c.z) > c.r + 1.5))
    .map(([x, z]) => Object.freeze({ x, z })),
);
