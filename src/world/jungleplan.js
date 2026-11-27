// =============================================================================
// THE JUNGLE LODGE: THE PLAN (milestone J1, the jungle world). Every coordinate of the green ground, its zones, the stone ring and its return gate, the stilted lodge with its
// veranda, the river's shallows, the giant leaves, the trees, ferns and mossy stones: pure data and pure functions (no THREE, no clock, no Math.random; the scatters use seeded
// streams, and the rain is a seeded schedule read off the time it is handed). jungleparts.js and junglelight.js draw from these; the tests read them. North is -z, east is +x,
// heights are metres over the ground's zero. docs/superpowers/plans/2026-11-27-new-areas-snowville-treehouse-jungle.md section 3 and 2026-11-27-connect-and-areas-decisions.md
// (no swimming: the river is shallows and bridges, and she can wade across anywhere). Numbers marked "start" are tuned from pictures.
// =============================================================================

import { STEP_MAX, MAX_GRADE, SUBSTEP, LEVEL_TOL, groundTilt } from '../ground.js';
import { mulberry32 } from '../rng.js';

export const JUNGLE_NAME = 'The Jungle Lodge';
export const JUNGLE_BOUNDS = Object.freeze({ minX: -44, maxX: 44, minZ: -38, maxZ: 38 }); // 88 x 76 m
export const JUNGLE_SPAWN = Object.freeze({ x: 0, z: 32 });
export const GROUND_SIZE = 160; // the drawn ground reaches 80 m from the middle; the walk stops at the bounds and the haze closes the rest
export const CANOPY_HILL = Object.freeze({ x: 24, z: -24, r: 14, h: 1.4 }); // the canopy walk's rise (stage B dresses it; the ground is here)
export const GROVE = Object.freeze({ x: -26, z: 2, r: 8 });

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---- the zones (plan 3.4) --------------------------------------------------------------------------------------------------
const Z = (id, x, z, r, name) => Object.freeze({ id, x, z, r, name });
export const ZONES = Object.freeze([
  Z('ring', 0, 32, 6, 'Stone Ring'),
  Z('lodge', -6, 17, 6, 'The Lodge'),
  Z('grove', GROVE.x, GROVE.z, GROVE.r, 'Fruit Grove'),
  Z('river', 10, -6, 7, 'River and Log Bridge'),
  Z('canopy', CANOPY_HILL.x, CANOPY_HILL.z, 10, 'Canopy Walk'),
]);
export const zoneAt = (x, z) => ZONES.find((k) => Math.hypot(x - k.x, z - k.z) <= k.r)?.id ?? null;

// ---- the spawn: the stone ring (the gate row marks it `own`; it stands at (0, 28) facing north, so she lands at z 31.6) -----------
export const RING = Object.freeze({ x: 0, z: 28, r: 1.9 });
// Five old, mossy stones leaning round a soft disc: the two front ones are the gate's solid pillars (telegate.js stonering: lx +-1.3), three stand behind.
export const RING_STONES = Object.freeze([[-1.3, 0, 1.9], [1.3, 0, 1.9], [-2.0, -1.25, 1.6], [0, -2.0, 2.1], [2.0, -1.25, 1.6]].map(([dx, dz, h]) => Object.freeze({ x: RING.x + dx, z: RING.z + dz, h })));
export const SIGNPOST = Object.freeze({ x: 4.6, z: 30.2, yaw: -0.5 }); // Mossy's signpost by the court
export const MOSS_POOL = Object.freeze({ x: -6.2, z: 31.5, r: 2.1 }); // a small shallow pool, only to look at (she may wade through it)

// ---- the lodge on stilts: a deck raised 0.55 m, a body at the back and a roofed veranda in front --------------------------------
export const LODGE = Object.freeze({ x0: -11.5, x1: -0.5, z0: 9, z1: 19, wallZ: 14.5, deck: 0.55, roofY: 3.4, skirt: 3.2 });
export const VERANDA = Object.freeze({ x0: -11.5, x1: -0.5, z0: LODGE.wallZ, z1: LODGE.z1 }); // under the roof: the rain's shelter
export const STEPS = Object.freeze({ x: -6, z: LODGE.z1, w: 3 }); // the open gap in the front rail, where the deck's ramp comes down
export const LANTERN = Object.freeze({ x: -6, z: 16.6, y: 2.9 }); // the veranda's one real light hangs here

// ---- the river: a slow brown stream she wades across (the bed dips 0.24 m; no swimming) ----------------------------------------
export const RIVER_PATH = Object.freeze([[-44, -6], [-32, -9], [-20, -6], [-8, -9], [4, -6], [10, -6], [20, -9], [32, -7], [44, -10]].map((p) => Object.freeze(p)));
export const RIVER_W = 3.1; // half the width of the water
export const RIVER_DEPTH = 0.24;
export function riverDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < RIVER_PATH.length - 1; i++) {
    const [ax, az] = RIVER_PATH[i]; const [bx, bz] = RIVER_PATH[i + 1];
    const t = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2), 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)));
  }
  return best;
}
export const LOG_BRIDGE = Object.freeze({ x: 10, z: -6, len: 8.2, yaw: 0.0, w: 1.3 }); // a fallen log laid across the river (north-south), banana side north
export const STEPPING = Object.freeze([[-14.2, -3.6], [-13.2, -5.4], [-12.4, -7.2], [-11.8, -9.0], [-11.2, -10.6]].map((p) => Object.freeze({ x: p[0], z: p[1] }))); // a line of flat stones across

// ---- the ground ------------------------------------------------------------------------------------------------------------
// One smooth green ground: gentle rises (a third of a metre or so), flat in the ring court, the lodge, the grove and the river's crossing, the canopy walk's 1.4 m rise, the lodge's
// raised deck, and the river bed. Never steeper than 0.5. Past the walkable bounds it carries on level with the nearest edge.
const hillBump = (x, z) => {
  const t = Math.hypot(x - CANOPY_HILL.x, z - CANOPY_HILL.z) / CANOPY_HILL.r;
  return t >= 1 ? 0 : CANOPY_HILL.h * (1 - t * t) * (1 - t * t);
};
const deckBump = (x, z) => {
  const dx = Math.max(LODGE.x0 - x, 0, x - LODGE.x1);
  const dz = Math.max(LODGE.z0 - z, 0, z - LODGE.z1);
  return LODGE.deck * (1 - smooth(Math.hypot(dx, dz) / LODGE.skirt));
};
export function jungleY(x, z) {
  const px = clamp(x, JUNGLE_BOUNDS.minX, JUNGLE_BOUNDS.maxX);
  const pz = clamp(z, JUNGLE_BOUNDS.minZ, JUNGLE_BOUNDS.maxZ);
  const roll = 0.16 * Math.sin(px * 0.09 + 0.5) * Math.cos(pz * 0.08 + 1.1) + 0.09 * Math.sin(px * 0.21 - pz * 0.17) + 0.05 * Math.cos(pz * 0.37 + px * 0.13);
  let flat = 1;
  for (const [cx, cz, r] of [[0, 32, 6], [-6, 14, 11], [GROVE.x, GROVE.z, 6], [10, -6, 7]]) flat = Math.min(flat, smooth((Math.hypot(px - cx, pz - cz) - r) / 5));
  const bed = -RIVER_DEPTH * (1 - smooth((riverDist(px, pz) - 1.3) / 1.8));
  return roll * flat + hillBump(px, pz) + deckBump(px, pz) + bed;
}

const EPS = 0.25;
// The ground in the shape the walk reads (src/ground.js's), made from the function above; a step legal under the same rule as every raised ground.
export function createJungleGround() {
  const y = jungleY;
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
    ceil: () => Infinity, // open sky above the leaves: no real ceiling
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

// ---- the giant leaves: a stalk and a broad leaf over her head; the leaf is also a rain shelter ---------------------------------
// { x, z, r (the leaf's reach), h (its height), yaw }. The two near the river are the plan's: one by the bridge, one under which a mouse will sit.
export const LEAVES = Object.freeze([
  [5, -2.6, 2.3, 2.6, 0.3], [16, -1.5, 2.0, 2.4, 1.2], [-24, 12, 2.2, 2.5, 2.2], [18, 14, 2.1, 2.5, 0.8], [-34, -2, 2.0, 2.4, 0.1], [30, 4, 2.2, 2.6, 1.9], [-4, -3.4, 1.9, 2.3, 2.7], [36, 24, 2.0, 2.4, 0.5],
].map(([x, z, r, h, yaw]) => Object.freeze({ x, z, r, h, yaw })));

// ---- the places that hold the story and the finds later: nothing small may stand there -----------------------------------------
// Round the spawn, the ring, the lodge's veranda (Mossy, the table, the boards' mouse, the kitchen), the grove's mango tree, the bridge and the banana bunch beyond it, the leaf's mouse, the
// canopy walk (cacao, the lookout, the mouse on the low branch), the raft landing, the sloth and the four found-outfit spots. [x, z, r].
export const KEEP_OUT = Object.freeze([
  [JUNGLE_SPAWN.x, JUNGLE_SPAWN.z, 6.5], [RING.x, RING.z, 4.5], [SIGNPOST.x, SIGNPOST.z, 1.8], [MOSS_POOL.x, MOSS_POOL.z, 3],
  [-6, 16.5, 5.5], [-3.4, 17.2, 2.4], [-9.4, 17, 2.4], [-6, 11.5, 3], // the veranda: Mossy, the boards, the kitchen
  [GROVE.x, GROVE.z, 4.5], [-20, 8, 2.5], // the mango tree and a path to it
  [10, -6, 4.5], [14, -14, 3], [5, -3.2, 3.2], [-2, -8, 3], // the log bridge, the banana bunch, the leaf mouse, the raft landing
  [CANOPY_HILL.x, CANOPY_HILL.z, 8], [26, -26, 2.5], [30, -30, 3], [-34, -16, 3], [36, 10, 3], // the canopy walk and its branch, the lookout, the sloth, the orchid
].map((k) => Object.freeze(k)));

function clearOf(x, z, extra = 0) {
  for (const [kx, kz, kr] of KEEP_OUT) if (Math.hypot(x - kx, z - kz) < kr + extra) return false;
  if (x > LODGE.x0 - 2.5 - extra && x < LODGE.x1 + 2.5 + extra && z > LODGE.z0 - 2.5 - extra && z < LODGE.z1 + 4 + extra) return false; // the lodge, its deck and ramp
  if (riverDist(x, z) < RIVER_W + 1.2 + extra) return false;
  for (const l of LEAVES) if (Math.hypot(x - l.x, z - l.z) < 1.8 + extra) return false;
  for (const s of STEPPING) if (Math.hypot(x - s.x, z - s.z) < 1.5 + extra) return false;
  const m = 2.5;
  return x >= JUNGLE_BOUNDS.minX + m && x <= JUNGLE_BOUNDS.maxX - m && z >= JUNGLE_BOUNDS.minZ + m && z <= JUNGLE_BOUNDS.maxZ - m;
}

// ---- the trees, ferns and stones ------------------------------------------------------------------------------------------------
// Trees: { x, z, s (scale, 1 = 7 m), kind ('broad' | 'palm'), rim }. Inside the walk they are solid (a trunk circle); beyond the bounds they make the green wall that closes the edge.
export const TREE_COUNT = Object.freeze({ scatter: 40 });
export function scatterTrees() {
  const rng = mulberry32(0x6a6e676c);
  const out = [];
  const add = (x, z, s, rim) => out.push({ x, z, s, kind: rng() < 0.3 ? 'palm' : 'broad', rim });
  let tries = 0;
  let n = 0;
  while (n < TREE_COUNT.scatter && tries++ < 8000) {
    const x = JUNGLE_BOUNDS.minX + rng() * (JUNGLE_BOUNDS.maxX - JUNGLE_BOUNDS.minX);
    const z = JUNGLE_BOUNDS.minZ + rng() * (JUNGLE_BOUNDS.maxZ - JUNGLE_BOUNDS.minZ);
    const s = 0.85 + rng() * 0.7;
    if (!clearOf(x, z, 1.4 * s)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 2.4 * (o.s + s) * 0.5 + 1.2)) continue;
    add(x, z, s, false); n++;
  }
  const B = JUNGLE_BOUNDS;
  const side = (k, f) => { for (let i = 0; i < k; i++) { const t = (i + 0.2 + rng() * 0.6) / k; add(...f(t), 1.3 + rng() * 1.1, true); } };
  const off = () => 2 + rng() * 5;
  side(18, (t) => [B.minX + t * (B.maxX - B.minX), B.minZ - off()]);
  side(16, (t) => [B.minX + t * (B.maxX - B.minX), B.maxZ + off()]);
  side(14, (t) => [B.minX - off(), B.minZ + t * (B.maxZ - B.minZ)]);
  side(14, (t) => [B.maxX + off(), B.minZ + t * (B.maxZ - B.minZ)]);
  // the ring's own gap stays open
  return out.filter((k) => !k.rim || Math.hypot(k.x - RING.x, k.z - RING.z) > 6);
}
export const treeColliders = () => scatterTrees().filter((k) => !k.rim).map((k) => Object.freeze({ x: Math.round(k.x * 100) / 100, z: Math.round(k.z * 100) / 100, r: Math.round(0.36 * k.s * 100) / 100 + 0.08 }));

// Ferns (low clumps, never solid), flowers (a few bright heads in them) and mossy stones. { x, z, s, yaw }.
export function scatterFerns() {
  const rng = mulberry32(0x6665726e);
  const out = [];
  let tries = 0;
  while (out.length < 110 && tries++ < 6000) {
    const x = JUNGLE_BOUNDS.minX + rng() * (JUNGLE_BOUNDS.maxX - JUNGLE_BOUNDS.minX);
    const z = JUNGLE_BOUNDS.minZ + rng() * (JUNGLE_BOUNDS.maxZ - JUNGLE_BOUNDS.minZ);
    const s = 0.7 + rng() * 0.9;
    const yaw = rng() * 6.28;
    const flower = rng() < 0.22 ? Math.floor(rng() * 4) : -1;
    if (!clearOf(x, z, s * 0.6)) continue;
    out.push({ x, z, s, yaw, flower });
  }
  return out;
}
export function scatterStones() {
  const rng = mulberry32(0x6d6f7373);
  const out = [];
  let tries = 0;
  while (out.length < 14 && tries++ < 4000) {
    const x = JUNGLE_BOUNDS.minX + 3 + rng() * (JUNGLE_BOUNDS.maxX - JUNGLE_BOUNDS.minX - 6);
    const z = JUNGLE_BOUNDS.minZ + 3 + rng() * (JUNGLE_BOUNDS.maxZ - JUNGLE_BOUNDS.minZ - 6);
    const s = 0.5 + rng() * 0.8;
    const yaw = rng() * 6.28;
    if (!clearOf(x, z, s * 1.2)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 4)) continue;
    out.push({ x, z, s, yaw });
  }
  return out;
}
export const stoneColliders = () => scatterStones().filter((k) => k.s >= 0.75).map((k) => Object.freeze({ x: Math.round(k.x * 100) / 100, z: Math.round(k.z * 100) / 100, r: Math.round(k.s * 0.8 * 100) / 100 }));

// ---- the look: warm green shade, a pale gold sun, soft green mist ---------------------------------------------------------------
export const JUNGLE_LOOK = Object.freeze({
  top: 0x7ec4d6, horizon: 0xe2f0d8, fog: 0xd2e8d0, fogNear: 20, fogFar: 105,
  sunColor: 0xfff0c8, sunIntensity: 1.0, hemiSky: 0xcfe8d4, hemiIntensity: 0.9, bounce: 0xc8e0b8,
  grass: 0x5c9a4a, grassShade: 0x3e7a3a, mud: 0x8a6a45,
});

// ---- the rain: a seeded schedule of showers, each followed by a rainbow, read off the time it is handed ---------------------------
// Pure: a cycle is a stretch of clear, a 30 s shower, then a 20 s rainbow. The lengths of the clear come from one seeded stream (the same for everyone who has the same seed; the walk's
// room seed will be passed in by the story milestone), so a show can always find rain to land on. The first shower is never in the first 45 s. With reduced motion nothing draws it.
export const RAIN_SEED = 0x7261696e;
export const RAIN = Object.freeze({ firstClear: 45, clearMin: 60, clearVar: 40, shower: 30, rainbow: 20, ramp: 3, fade: 2.5 });
export function createRainSchedule(seed = RAIN_SEED) {
  const rng = mulberry32(seed);
  const cycles = [];
  let end = 0;
  const extend = (t) => {
    while (end <= t && cycles.length < 20000) {
      const clear = (cycles.length ? RAIN.clearMin : RAIN.firstClear) + rng() * RAIN.clearVar;
      const c = { start: end, rainAt: end + clear, bowAt: end + clear + RAIN.shower, end: end + clear + RAIN.shower + RAIN.rainbow };
      cycles.push(c);
      end = c.end;
    }
  };
  const cycleAt = (t) => {
    const tt = Number.isFinite(t) && t > 0 ? Math.min(t, 1e6) : 0;
    extend(tt);
    let lo = 0; let hi = cycles.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cycles[mid].start <= tt) lo = mid; else hi = mid - 1; }
    return [cycles[lo], tt];
  };
  return {
    cycleAt: (t) => cycleAt(t)[0],
    phase(t) { const [c, tt] = cycleAt(t); return tt < c.rainAt ? 'clear' : tt < c.bowAt ? 'rain' : 'rainbow'; },
    // 0 to 1: the shower's strength, easing in and out over RAIN.ramp seconds
    intensity(t) { const [c, tt] = cycleAt(t); return smooth(Math.min((tt - c.rainAt) / RAIN.ramp, (c.bowAt - tt) / RAIN.ramp, 1)); },
    // 0 to 1: how much of the rainbow shows, fading in and out over RAIN.fade seconds
    rainbow(t) { const [c, tt] = cycleAt(t); return smooth(Math.min((tt - c.bowAt) / RAIN.fade, (c.end - tt) / RAIN.fade, 1)); },
  };
}
export const rainSchedule = createRainSchedule();

// The drops: a box round the camera's cat, as the snowflakes were; far fewer on the low rungs, none in reduced motion.
export const DROPS = Object.freeze({ count: 110, low: 55, box: 11, top: 9, fall: 11, len: 0.55 }); // start

// Under cover: the veranda and the giant leaves. Rain is hidden round her while she stands in one of these.
export function sheltered(x, z) {
  if (x >= VERANDA.x0 && x <= VERANDA.x1 && z >= VERANDA.z0 && z <= VERANDA.z1) return true;
  return LEAVES.some((l) => Math.hypot(x - l.x, z - l.z) <= l.r * 0.85);
}

// The rainbow's arc stands over the north edge (stage B's lookout looks at it): a half-ring 22 m across, 30 m out.
export const RAINBOW = Object.freeze({ x: 0, z: -60, r: 26, w: 3.2 });

// ---- everything solid --------------------------------------------------------------------------------------------------------------
// The ring's five stones, the lodge's body and its veranda posts, the leaves' stalks, the signpost, the trees and the big mossy stones.
export const LODGE_POSTS = Object.freeze([-11.2, -8.7, -6 - STEPS.w / 2 - 0.1, -6 + STEPS.w / 2 + 0.1, -3.3, -0.8].map((x) => Object.freeze({ x, z: LODGE.z1 - 0.2 })));
export const jungleColliders = () => [
  ...RING_STONES.map((s, i) => Object.freeze({ x: s.x, z: s.z, r: i < 2 ? 0.4 : 0.5 })),
  ...[-9, -6, -3].map((x) => Object.freeze({ x, z: 11.6, r: 2.9 })), // the lodge's body, a chain along its width
  ...LODGE_POSTS.map((p) => Object.freeze({ x: p.x, z: p.z, r: 0.2 })),
  ...LEAVES.map((l) => Object.freeze({ x: l.x, z: l.z, r: 0.22 })),
  Object.freeze({ x: SIGNPOST.x, z: SIGNPOST.z, r: 0.3 }),
  ...treeColliders(),
  ...stoneColliders(),
];

// Places a wanderer may head for: open ground, each at least 1.5 m clear of every collider.
export const JUNGLE_POIS = Object.freeze(
  [[0, 22], [-14, 24], [10, 22], [-18, 16], [8, 8], [-2, 4], [-16, 0], [20, 2], [34, 14], [-36, 14], [-30, -2], [-20, -16], [0, -18], [-8, -22], [14, -14], [20, -30], [-34, -28], [34, 26], [-36, 28]]
    .filter(([x, z]) => jungleColliders().every((c) => Math.hypot(x - c.x, z - c.z) > c.r + 1.5))
    .map(([x, z]) => Object.freeze({ x, z })),
);

// The mist: soft low patches that drift slowly along the river and the court (the light layer draws them; the low rungs draw half, reduced motion holds them still).
export const MIST_COUNT = 22;
export function scatterMist() {
  const rng = mulberry32(0x6d697374);
  const out = [];
  for (let i = 0; i < MIST_COUNT; i++) {
    const along = rng() * (RIVER_PATH.length - 1);
    const k = Math.min(Math.floor(along), RIVER_PATH.length - 2);
    const f = along - k;
    const x = RIVER_PATH[k][0] + (RIVER_PATH[k + 1][0] - RIVER_PATH[k][0]) * f + (rng() - 0.5) * 8;
    const z = RIVER_PATH[k][1] + (RIVER_PATH[k + 1][1] - RIVER_PATH[k][1]) * f + (rng() - 0.5) * 8;
    out.push({ x: clamp(x, JUNGLE_BOUNDS.minX, JUNGLE_BOUNDS.maxX), z: clamp(z, JUNGLE_BOUNDS.minZ, JUNGLE_BOUNDS.maxZ), y: 0.5 + rng() * 0.7, size: 5 + rng() * 4, phase: rng() * Math.PI * 2 });
  }
  return out;
}
