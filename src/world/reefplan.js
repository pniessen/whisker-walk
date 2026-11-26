// =============================================================================
// THE REEF: THE PLAN (milestone R1, the water world). Every coordinate of the seabed, its zones, the spawn arch and ladder, the light shafts, the kelp
// and the coral, the air gauge's numbers: pure data and pure functions (no THREE, no clock, no Math.random; the scatters use a seeded stream).
// reefparts.js draws from these; the tests read them. North is -z, east is +x, heights are metres over the seabed's zero.
// docs/superpowers/plans/2026-11-26-reef.md sections 4 and 5. The numbers marked "start" are tuned from pictures.
// =============================================================================

import { STEP_MAX, MAX_GRADE, SUBSTEP, LEVEL_TOL, groundTilt } from '../ground.js';
import { mulberry32 } from '../rng.js';

export const REEF_NAME = 'The Reef';
export const REEF_BOUNDS = Object.freeze({ minX: -48, maxX: 48, minZ: -42, maxZ: 42 });
export const REEF_SPAWN = Object.freeze({ x: 0, z: 36 });
export const GROUND_SIZE = 130; // the drawn seabed reaches 65 m from the middle; the walk stops at the bounds and the fog closes the rest
export const SURFACE_Y = 9; // the shimmer ceiling's height (no water body: a quad, never a `waters` entry)
export const DUNE_MAX = 1.2; // the tallest a dune stands over the seabed's zero

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ---- the zones (plan section 4.2) -------------------------------------------------------------------------------------
const Z = (id, x, z, r, name) => Object.freeze({ id, x, z, r, name });
export const ZONES = Object.freeze([
  Z('ladder', 0, 36, 8, 'The Ladder'),
  Z('kelp', -24, 16, 12, 'Kelp Garden'),
  Z('coral', 16, 0, 14, 'Coral Garden'),
  Z('flats', -8, -14, 12, 'Sandy Flats'),
  Z('deep', -32, -34, 12, 'The Deep'),
]);
export const zoneAt = (x, z) => ZONES.find((k) => Math.hypot(x - k.x, z - k.z) <= k.r)?.id ?? null;

// ---- the spawn: the return arch, the ladder and the ring buoy (the stand-ins; the gate's own look is milestone R6) -----------
export const ARCH = Object.freeze({ x: 0, z: 31, w: 4.4, h: 3.4, depth: 1.1 }); // a coral arch, two pillars and a lintel, 5 m north of the spawn (she starts facing it)
export const LADDER = Object.freeze({ x: 4.6, z: 32.2, width: 0.7, rungs: 14 }); // hangs from the shimmer ceiling down to the sand
export const RING_BUOY = Object.freeze({ x: 4.6, z: 32.8, y: 1.7, r: 0.42 }); // hangs on the ladder's front
export const LADDER_FOOT = Object.freeze({ x: 3.2, z: 34.4 }); // where a warm bubble sets her down (open sand, beside the ladder)

// ---- the seabed -----------------------------------------------------------------------------------------------------------
// Smooth dunes between 0 and DUNE_MAX, flat round the spawn, and a soft rise beyond the walkable bounds so the edge is never a wall.
export function reefBaseY(x, z) {
  const n = 0.55 * Math.sin(x * 0.12 + 0.8) * Math.cos(z * 0.1 + 0.3) + 0.3 * Math.sin(x * 0.27 - z * 0.21 + 2) + 0.15 * Math.sin(z * 0.45 + x * 0.2);
  const open = smooth((Math.hypot(x - REEF_SPAWN.x, z - REEF_SPAWN.z) - 4) / 8); // flat within 4 m of the spawn, full dunes by 12
  let y = DUNE_MAX * 0.5 * (1 + n) * open;
  const dx = Math.max(REEF_BOUNDS.minX - x, 0, x - REEF_BOUNDS.maxX);
  const dz = Math.max(REEF_BOUNDS.minZ - z, 0, z - REEF_BOUNDS.maxZ);
  const d = Math.hypot(dx, dz);
  if (d > 0) y += 2.4 * smooth(d / 16);
  return y;
}
export const reefY = reefBaseY;

const EPS = 0.25;
// The ground in the shape the walk reads (src/ground.js's): made from the heightfield above, a step legal under the same rule as every raised ground.
export function createReefGround() {
  const y = reefY;
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

// ---- the light (plan section 4.3) ---------------------------------------------------------------------------------------
// Three shaft quads, each a tall strip tilted a little with the sun, dropped on the lite and low rungs. { x, z } is the foot, `w` its width.
export const SHAFTS = Object.freeze([
  Object.freeze({ x: 6, z: 26, w: 4.5, lean: 0.18, yaw: 0.5 }),
  Object.freeze({ x: -14, z: 4, w: 6, lean: 0.22, yaw: -0.3 }),
  Object.freeze({ x: 18, z: -18, w: 5, lean: 0.15, yaw: 0.9 }),
]);
// The fog and the sky of the sea (the colour at the horizon is the fog's, so the two agree) and the sun's cool light.
export const WATER_LOOK = Object.freeze({ top: 0x2a7fa0, horizon: 0x4aa6a8, fogNear: 6, fogFar: 40, sunColor: 0xdff4ff, sunIntensity: 1.6, hemiSky: 0x7ec8d8, sand: 0xecd9a0, sandShade: 0xc9b57e });

// ---- the air gauge (plan section 5) -------------------------------------------------------------------------------------
// Five bubbles, 90 s from full, hidden (and not draining) the first 20 s of a first visit; at two bubbles a soft line; at zero a warm bubble lifts
// her to the ladder, the gauge refills at once, nothing is lost.
export const AIR = Object.freeze({ bubbles: 5, seconds: 90, hideFirst: 20, softAt: 2, lift: 2.4, rise: 2.6 });

// ---- the kelp and the coral -------------------------------------------------------------------------------------------------
// Where nothing may stand: round the spawn, the ladder and arch, and every zone's middle (the story's places come in later milestones), plus
// a margin at the walk's edge. [x, z, r].
export const KEEP_OUT = Object.freeze([
  [REEF_SPAWN.x, REEF_SPAWN.z, 7], [ARCH.x, ARCH.z, 4], [LADDER.x, LADDER.z, 3],
  [-24, 16, 3], [16, 0, 3], [-8, -14, 3.5], [-32, -34, 4],
  [14, -4, 2], [20, 6, 2], [-36, -30, 2.5], // the three golden mice's places (src/goldmice.js)
].map((k) => Object.freeze(k)));

function clearOf(x, z, extra = 0) {
  for (const [kx, kz, kr] of KEEP_OUT) if (Math.hypot(x - kx, z - kz) < kr + extra) return false;
  if (x < REEF_BOUNDS.minX + 2 || x > REEF_BOUNDS.maxX - 2 || z < REEF_BOUNDS.minZ + 2 || z > REEF_BOUNDS.maxZ - 2) return false;
  return true;
}

// The kelp: tall blades in clumps, thickest in the Kelp Garden and a few outliers. { x, z, h, phase, lean }. A pure function of the plan.
export const KELP_COUNT = Object.freeze({ garden: 90, outliers: 24 });
export function scatterKelp() {
  const rng = mulberry32(0x6b656c70);
  const out = [];
  const garden = ZONES[1];
  let tries = 0;
  while (out.length < KELP_COUNT.garden && tries++ < 4000) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * garden.r;
    const x = garden.x + Math.cos(a) * r;
    const z = garden.z + Math.sin(a) * r;
    if (clearOf(x, z, 0.3)) out.push({ x, z, h: 2.6 + rng() * 2.6, phase: rng() * Math.PI * 2, lean: (rng() - 0.5) * 0.3 });
  }
  const want = KELP_COUNT.garden + KELP_COUNT.outliers;
  tries = 0;
  while (out.length < want && tries++ < 4000) {
    const x = REEF_BOUNDS.minX + rng() * (REEF_BOUNDS.maxX - REEF_BOUNDS.minX);
    const z = REEF_BOUNDS.minZ + rng() * (REEF_BOUNDS.maxZ - REEF_BOUNDS.minZ);
    if (clearOf(x, z, 0.3)) out.push({ x, z, h: 2.2 + rng() * 2, phase: rng() * Math.PI * 2, lean: (rng() - 0.5) * 0.3 });
  }
  return out;
}

// The coral: clumps by kind (brain, branch, fan, tube) and a few rocks, in the Coral Garden mostly. { kind, x, z, s (size), yaw, hue }; the big ones are colliders.
export const CORAL_KINDS = Object.freeze(['brain', 'branch', 'fan', 'tube', 'rock']);
export const CORAL_COUNT = Object.freeze({ garden: 26, rest: 22 });
export function scatterCoral() {
  const rng = mulberry32(0x636f7261);
  const out = [];
  const garden = ZONES[2];
  const place = (cx, cz, rad, n, tag) => {
    let tries = 0;
    let added = 0;
    while (added < n && tries++ < 4000) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * rad;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const s = 0.45 + rng() * 0.75;
      const kind = CORAL_KINDS[Math.floor(rng() * CORAL_KINDS.length)];
      const yaw = rng() * Math.PI * 2;
      const hue = Math.floor(rng() * 4);
      if (!clearOf(x, z, s + 0.4)) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.s + s + 0.6)) continue;
      out.push({ kind, x, z, s, yaw, hue, zone: tag });
      added++;
    }
  };
  place(garden.x, garden.z, garden.r, CORAL_COUNT.garden, 'coral');
  place(0, 0, 44, CORAL_COUNT.rest, 'rest');
  return out;
}
// The coral that is solid (a cat walks round it): the big clumps, a circle a little smaller than the drawn clump.
export const coralColliders = () => scatterCoral().filter((k) => k.s >= 0.7).map((k) => Object.freeze({ x: k.x, z: k.z, r: Math.round(k.s * 0.8 * 100) / 100 }));

// The seabed's own dressing: ripples run across the dunes (vertex colour, no texture).
export function rippleTone(x, z) {
  return 0.93 + 0.07 * Math.sin(x * 1.7 + Math.sin(z * 0.35) * 2.2) * Math.cos(z * 0.9 + x * 0.12) + 0.04 * Math.sin((x + z) * 0.31);
}

// Everything solid on the seabed: the arch's two pillars, the big coral, and the ladder's foot post (a cat walks round them; all within the bounds).
export const reefColliders = () => [
  Object.freeze({ x: ARCH.x - ARCH.w / 2 + 0.35, z: ARCH.z, r: 0.5 }),
  Object.freeze({ x: ARCH.x + ARCH.w / 2 - 0.35, z: ARCH.z, r: 0.5 }),
  ...coralColliders(),
];

// Places a wanderer may head for: open sand, each at least 1.5 m clear of every collider (the candidates that fall in the coral are dropped).
export const REEF_POIS = Object.freeze(
  [[0, 28], [-24, 24], [-30, 8], [6, 6], [-8, -6], [-20, -22], [10, -26], [30, -10], [30, 24], [-40, 30], [36, 36], [-10, 10]]
    .filter(([x, z]) => reefColliders().every((c) => Math.hypot(x - c.x, z - c.z) > c.r + 1.5))
    .map(([x, z]) => Object.freeze({ x, z })),
);
