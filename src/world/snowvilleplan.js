// =============================================================================
// SNOWVILLE: THE PLAN (milestone V1, the snow world). Every coordinate of the snowy ground, its zones, the spawn court and its return arch, the village square with its
// cottages, fir, stall and board, the fir wood and the rocks: pure data and pure functions (no THREE, no clock, no Math.random; the scatters use seeded streams).
// snowvilleparts.js and snowvillelight.js draw from these; the tests read them. North is -z, east is +x, heights are metres over the ground's zero.
// docs/superpowers/plans/2026-11-27-new-areas-snowville-treehouse-jungle.md section 1 and 2026-11-27-connect-and-areas-decisions.md. Numbers marked "start" are tuned from pictures.
// =============================================================================

import { STEP_MAX, MAX_GRADE, SUBSTEP, LEVEL_TOL, groundTilt } from '../ground.js';
import { mulberry32 } from '../rng.js';

export const SNOWVILLE_NAME = 'Snowville';
export const SNOWVILLE_BOUNDS = Object.freeze({ minX: -40, maxX: 40, minZ: -36, maxZ: 36 }); // 80 x 72 m
export const SNOWVILLE_SPAWN = Object.freeze({ x: 0, z: 30 });
export const GROUND_SIZE = 150; // the drawn ground reaches 75 m from the middle; the walk stops at the bounds and the haze closes the rest
export const HILL = Object.freeze({ x: 22, z: -18, r: 17, h: 3 }); // the sled hill's bank (stage B dresses it; the ground is here)
export const POND = Object.freeze({ x: -24, z: -10, r: 8 }); // flat; stage B draws the ice

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---- the zones (plan 1.4) --------------------------------------------------------------------------------------------------
const Z = (id, x, z, r, name) => Object.freeze({ id, x, z, r, name });
export const ZONES = Object.freeze([
  Z('court', 0, 30, 6, 'Gate Court'),
  Z('square', -4, 8, 11, 'Village Square'),
  Z('pond', POND.x, POND.z, 9, 'The Pond'),
  Z('hill', HILL.x, HILL.z, 14, 'Sled Hill'),
  Z('wood', 0, -26, 10, 'Fir Wood'),
]);
export const zoneAt = (x, z) => ZONES.find((k) => Math.hypot(x - k.x, z - k.z) <= k.r)?.id ?? null;

// ---- the spawn: the return arch (the gate row marks it `own`; it stands at (0, 26.5) facing north, so she lands at z 30.1) ----------------
export const ARCH = Object.freeze({ x: 0, z: 26.5, w: 4.4, h: 3.4, depth: 1.1 });

// ---- the ground ------------------------------------------------------------------------------------------------------------
// One smooth snow ground: soft drifts (under 0.2 m), flat in the spawn court, the square and the pond, and the sled hill's bank (3 m, never steeper than 0.5 anywhere).
// Past the walkable bounds it carries on level with the nearest edge.
const hillBump = (x, z) => {
  const t = Math.hypot(x - HILL.x, z - HILL.z) / HILL.r;
  return t >= 1 ? 0 : HILL.h * (1 - t * t) * (1 - t * t);
};
export function snowY(x, z) {
  const px = clamp(x, SNOWVILLE_BOUNDS.minX, SNOWVILLE_BOUNDS.maxX);
  const pz = clamp(z, SNOWVILLE_BOUNDS.minZ, SNOWVILLE_BOUNDS.maxZ);
  const drift = 0.12 * Math.sin(px * 0.13 + 0.4) * Math.cos(pz * 0.11 + 0.9) + 0.07 * Math.sin(px * 0.29 - pz * 0.23 + 0.5) + 0.05 * Math.cos(pz * 0.41 + px * 0.17);
  let flat = 1;
  for (const [cx, cz, r] of [[0, 30, 6], [-4, 8, 11], [POND.x, POND.z, 9]]) flat = Math.min(flat, smooth((Math.hypot(px - cx, pz - cz) - r) / 5));
  return drift * flat + hillBump(px, pz);
}

const EPS = 0.25;
// The ground in the shape the walk reads (src/ground.js's), made from the function above; a step legal under the same rule as every raised ground.
export function createSnowvilleGround() {
  const y = snowY;
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
    ceil: () => Infinity, // open sky: no real ceiling
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

// ---- the village --------------------------------------------------------------------------------------------------------------
// A cottage's door is its local +z side; `to` is the point it faces. Footprint w (across the door side) x d, wall height h.
const C = (id, x, z, w, d, h, to, wall, roof) => Object.freeze({ id, x, z, w, d, h, yaw: Math.round(Math.atan2(to[0] - x, to[1] - z) * 1000) / 1000, wall, roof });
export const COTTAGES = Object.freeze([
  C('baker', 11, 1, 6, 4.6, 2.7, [-2, 5], 0xd9b98a, 0x8a4a3c), // the baker's house, beside the cocoa stall
  C('west1', -16, 14, 5, 4, 2.5, [-4, 10], 0xc79a6a, 0x5a6a86),
  C('west2', -17, 3, 5, 4, 2.5, [-4, 6], 0xe0cfae, 0x8a4a3c),
  C('east1', 9, 15, 5, 4, 2.5, [-2, 11], 0xb98458, 0x5a6a86),
  C('north1', -10, -5, 5.4, 4, 2.6, [-4, 4], 0xcfa97a, 0x6a4a58),
  C('gate1', -22, 21, 4.6, 4, 2.4, [-6, 25], 0xe0cfae, 0x5a6a86), // by the gate court
  C('gate2', 17, 24, 4.6, 4, 2.4, [4, 28], 0xc79a6a, 0x8a4a3c),
]);

// The square's own things.
export const SQUARE_FIR = Object.freeze({ x: -4, z: 8, h: 6.2 }); // the village's decorated fir; the Square lantern stands beside it later
export const STALL = Object.freeze({ x: 6.5, z: 7.5, w: 3, d: 1.8, yaw: -Math.PI / 2 }); // the cocoa stall (a warm spot), its counter facing west
export const BOARD = Object.freeze({ x: -9.5, z: 11, yaw: 0.5 }); // the postcard board
export const SNOWMAN = Object.freeze({ x: 4, z: 18 });
export const LAMPS = Object.freeze([[-3, 23], [3, 20], [-3.5, 14], [2.5, 11], [-9, 5], [7, 3], [-4.5, 31]].map((p) => Object.freeze({ x: p[0], z: p[1] })));
export const BRAZIER = Object.freeze({ x: 4.5, z: 31 }); // the court's hearth: the first warm spot, and the place of the one PointLight
export const HEARTH = Object.freeze({ x: -1.5, z: 3, r: 3.2 }); // the village hearth (milestone V5: story step 5; stage B draws it, the cheeks theme knows it from the start)

// Places that warm her cheeks (themed only; src/world/snowvillewarmth.js): [x, z, r].
export const WARM_SPOTS = Object.freeze([[BRAZIER.x, BRAZIER.z, 3.4], [STALL.x - 1.2, STALL.z, 3.2], [HEARTH.x, HEARTH.z, HEARTH.r]].map((k) => Object.freeze(k)));

// Door hues by zone (the beauty pass, V8): the gate court's two are teal, the square's red and gold, the west and north rows each their own.
export const DOOR_HUE = Object.freeze({ baker: 0xc8483f, west1: 0x3f7f9a, west2: 0xd69a2e, east1: 0x7a4a8a, north1: 0x3f8a6a, gate1: 0x2f8f8a, gate2: 0x2f8f8a });

// ---- where nothing small may stand -------------------------------------------------------------------------------------------
// Round the spawn, the arch, every zone's middle and what later milestones put down (Tilly's spot, the three lanterns' feet, the three candles, the four found-scarf spots
// and the three golden mice are all within these), and a margin at the walk's edge. [x, z, r].
export const KEEP_OUT = Object.freeze([
  [SNOWVILLE_SPAWN.x, SNOWVILLE_SPAWN.z, 6.5], [ARCH.x, ARCH.z, 4],
  [-4, 8, 6.5], [POND.x, POND.z, 10], [HILL.x, HILL.z, 9], [HILL.x - 8, HILL.z + 8, 3], [0, -26, 5], // zone middles and the hill's foot
  [-8, 20, 2.5], [-1, 18, 2.5], [20, -4, 2.5], // later: Tilly, the baker's window candle, the sled hill's path
  [-26, -4, 2.5], [26, -26, 2.5], [-8, -26, 2.5], [8, -30, 2.5], // later: the pond stump, the hill's top, the burrow, the Great Fir's foot
  [BRAZIER.x, BRAZIER.z, 2.5], [STALL.x, STALL.z, 3.4],
].map((k) => Object.freeze(k)));

export function clearOf(x, z, extra = 0) {
  for (const [kx, kz, kr] of KEEP_OUT) if (Math.hypot(x - kx, z - kz) < kr + extra) return false;
  for (const c of COTTAGES) if (Math.hypot(x - c.x, z - c.z) < Math.hypot(c.w, c.d) / 2 + 1 + extra) return false;
  const m = 2.5;
  return x >= SNOWVILLE_BOUNDS.minX + m && x <= SNOWVILLE_BOUNDS.maxX - m && z >= SNOWVILLE_BOUNDS.minZ + m && z <= SNOWVILLE_BOUNDS.maxZ - m;
}

// ---- the firs, drifts and rocks ------------------------------------------------------------------------------------------------
// Firs: { x, z, s (scale, 1 = 4.5 m), tiers }. Inside the walk they are solid (a trunk circle); beyond the bounds they make the treeline that closes the edge.
export const FIR_COUNT = Object.freeze({ wood: 22, scatter: 26, rim: 56 });
export function scatterFirs() {
  const rng = mulberry32(0x666972);
  const out = [];
  const add = (x, z, s, rim) => { out.push({ x, z, s, tiers: s > 1.1 ? 4 : 3, rim }); };
  let tries = 0;
  let n = 0;
  while (n < FIR_COUNT.wood && tries++ < 4000) { // the fir wood
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 14;
    const x = 0 + Math.cos(a) * r;
    const z = -26 + Math.sin(a) * r * 0.7;
    const s = 0.9 + rng() * 0.8;
    if (!clearOf(x, z, 0.8 * s)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 2.2 * (o.s + s) * 0.5 + 0.6)) continue;
    add(x, z, s, false); n++;
  }
  tries = 0; n = 0;
  while (n < FIR_COUNT.scatter && tries++ < 6000) { // singles over the rest, never in the village's middle
    const x = SNOWVILLE_BOUNDS.minX + rng() * (SNOWVILLE_BOUNDS.maxX - SNOWVILLE_BOUNDS.minX);
    const z = SNOWVILLE_BOUNDS.minZ + rng() * (SNOWVILLE_BOUNDS.maxZ - SNOWVILLE_BOUNDS.minZ);
    const s = 0.8 + rng() * 0.7;
    if (!clearOf(x, z, 1.2 * s) || Math.hypot(x - SQUARE_FIR.x, z - SQUARE_FIR.z) < 11) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 2.2 * (o.s + s) * 0.5 + 0.6)) continue;
    add(x, z, s, false); n++;
  }
  const B = SNOWVILLE_BOUNDS;
  const side = (k, f) => { for (let i = 0; i < k; i++) { const t = (i + 0.2 + rng() * 0.6) / k; add(...f(t), 1.2 + rng() * 1.1, true); } };
  const off = () => 2 + rng() * 5;
  side(18, (t) => [B.minX + t * (B.maxX - B.minX), B.minZ - off()]);
  side(14, (t) => [B.minX + t * (B.maxX - B.minX), B.maxZ + off()]);
  side(12, (t) => [B.minX - off(), B.minZ + t * (B.maxZ - B.minZ)]);
  side(12, (t) => [B.maxX + off(), B.minZ + t * (B.maxZ - B.minZ)]);
  // the arch's own gap stays open
  return out.filter((k) => !k.rim || Math.hypot(k.x - ARCH.x, k.z - ARCH.z) > 6);
}
export const firColliders = () => scatterFirs().filter((k) => !k.rim).map((k) => Object.freeze({ x: Math.round(k.x * 100) / 100, z: Math.round(k.z * 100) / 100, r: Math.round(0.42 * k.s * 100) / 100 + 0.05 }));

// Drifts (soft mounds against the cottages and in the open) and boulders. { x, z, s, yaw }. Drifts are not solid; the larger boulders are.
export function scatterDrifts() {
  const rng = mulberry32(0x64726674);
  const out = [];
  let tries = 0;
  while (out.length < 40 && tries++ < 4000) {
    const x = SNOWVILLE_BOUNDS.minX + rng() * (SNOWVILLE_BOUNDS.maxX - SNOWVILLE_BOUNDS.minX);
    const z = SNOWVILLE_BOUNDS.minZ + rng() * (SNOWVILLE_BOUNDS.maxZ - SNOWVILLE_BOUNDS.minZ);
    const s = 0.6 + rng() * 1.1;
    const yaw = rng() * 3.14;
    if (!clearOf(x, z, s * 0.8)) continue;
    out.push({ x, z, s, yaw });
  }
  return out;
}
export function scatterRocks() {
  const rng = mulberry32(0x726f636b);
  const out = [];
  let tries = 0;
  while (out.length < 14 && tries++ < 4000) {
    const x = SNOWVILLE_BOUNDS.minX + 3 + rng() * (SNOWVILLE_BOUNDS.maxX - SNOWVILLE_BOUNDS.minX - 6);
    const z = SNOWVILLE_BOUNDS.minZ + 3 + rng() * (SNOWVILLE_BOUNDS.maxZ - SNOWVILLE_BOUNDS.minZ - 6);
    const s = 0.5 + rng() * 0.9;
    const yaw = rng() * 6.28;
    if (!clearOf(x, z, s * 1.2)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 4)) continue;
    out.push({ x, z, s, yaw });
  }
  return out;
}
export const rockColliders = () => scatterRocks().filter((k) => k.s >= 0.8).map((k) => Object.freeze({ x: Math.round(k.x * 100) / 100, z: Math.round(k.z * 100) / 100, r: Math.round(k.s * 0.8 * 100) / 100 }));

// ---- the look: soft blue shadows, a pearl-white haze, a low pale sun -------------------------------------------------------
export const SNOW_LOOK = Object.freeze({
  top: 0x9dbbde, horizon: 0xd8e4f1, fog: 0xd8e4f1, fogNear: 22, fogFar: 120,
  sunColor: 0xfff1d8, sunIntensity: 0.62, hemiSky: 0xc4d6ee, hemiIntensity: 0.62, envScale: 0.5,
  snow: 0xdde6f1, snowShade: 0xbccfe6, bounce: 0xc9d8ea,
});
export const FLAKES = Object.freeze({ count: 60, reduced: 20, low: 30, box: 16, top: 9, fall: 0.7 }); // start: the walk's flake layer (snowvillelight.js)

// ---- everything solid --------------------------------------------------------------------------------------------------------------
// The arch's two pillars, each cottage (a chain of circles along its long side), the square's fir, the stall, the board, the lamp posts, the snowman, the firs and the big rocks.
export function cottageColliders(c) {
  const long = Math.max(c.w, c.d);
  const short = Math.min(c.w, c.d);
  const along = c.w >= c.d ? [Math.cos(c.yaw), -Math.sin(c.yaw)] : [Math.sin(c.yaw), Math.cos(c.yaw)];
  const n = Math.max(2, Math.ceil(long / short));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : -long / 2 + short / 2 + ((long - short) * i) / (n - 1);
    out.push(Object.freeze({ x: Math.round((c.x + along[0] * t) * 100) / 100, z: Math.round((c.z + along[1] * t) * 100) / 100, r: Math.round((short / 2 + 0.25) * 100) / 100 }));
  }
  return out;
}
export const snowvilleColliders = () => [
  Object.freeze({ x: ARCH.x - ARCH.w / 2 + 0.35, z: ARCH.z, r: 0.5 }),
  Object.freeze({ x: ARCH.x + ARCH.w / 2 - 0.35, z: ARCH.z, r: 0.5 }),
  ...COTTAGES.flatMap(cottageColliders),
  Object.freeze({ x: SQUARE_FIR.x, z: SQUARE_FIR.z, r: 0.9 }),
  Object.freeze({ x: STALL.x + 0.6, z: STALL.z, r: 1.1 }), Object.freeze({ x: STALL.x + 0.6, z: STALL.z - 1.1, r: 0.9 }), Object.freeze({ x: STALL.x + 0.6, z: STALL.z + 1.1, r: 0.9 }),
  Object.freeze({ x: BOARD.x, z: BOARD.z, r: 0.7 }),
  Object.freeze({ x: SNOWMAN.x, z: SNOWMAN.z, r: 0.7 }),
  ...LAMPS.map((l) => Object.freeze({ x: l.x, z: l.z, r: 0.3 })),
  Object.freeze({ x: BRAZIER.x, z: BRAZIER.z, r: 0.8 }),
  ...firColliders(),
  ...rockColliders(),
];

// Places a wanderer may head for: open ground, each at least 1.5 m clear of every collider.
export const SNOWVILLE_POIS = Object.freeze(
  [[0, 22], [-8, 16], [6, 20], [-12, 8], [2, 4], [-4, 1], [14, 8], [-20, 14], [20, 14], [-30, 8], [30, 6], [-14, -16], [8, -12], [0, -14], [-30, -24], [32, 24], [-30, 26]]
    .filter(([x, z]) => snowvilleColliders().every((c) => Math.hypot(x - c.x, z - c.z) > c.r + 1.5))
    .map(([x, z]) => Object.freeze({ x, z })),
);

// The glints on the snow: a seeded scatter of tiny sparks that twinkle (the light layer draws them; the low rungs draw half).
export const GLINT_COUNT = 70;
export function scatterGlints() {
  const rng = mulberry32(0x676c6e74);
  const out = [];
  for (let i = 0; i < GLINT_COUNT; i++) {
    const x = SNOWVILLE_BOUNDS.minX + rng() * (SNOWVILLE_BOUNDS.maxX - SNOWVILLE_BOUNDS.minX);
    const z = SNOWVILLE_BOUNDS.minZ + rng() * (SNOWVILLE_BOUNDS.maxZ - SNOWVILLE_BOUNDS.minZ);
    out.push({ x, z, y: snowY(x, z) + 0.05 + rng() * 0.12, phase: rng() * Math.PI * 2 });
  }
  return out;
}
