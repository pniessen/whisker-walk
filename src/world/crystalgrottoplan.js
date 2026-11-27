// =============================================================================
// THE CRYSTAL CAVE'S WING C, MILESTONE C2: THE MUSHROOM GROTTO AND THE FORGE SHELL. The plan: pure data and pure functions (no THREE, no clock, no Math.random;
// the one scatter is a seeded stream). crystalgrottoparts.js draws it, crystalgrottolive.js runs it, the tests read it. North is -z; every height is metres over the
// floor at that spot. docs/superpowers/plans/2026-11-27-crystal-moon-wave2.md decisions 3, 5, 7 and 8.
//   * THE GROTTO (about (25, 12), radius 5): a ring of soft glowing mushrooms, caps 2 m tall or less, with the grotto's golden mouse (gm-crystal-4) on the floor in the
//     middle, on foot. The GIANT mushrooms stand outside the walkable edge, as a backdrop.
//   * THE FORGE (about (-24, 23), radius 5): a hearth that glows, a pool of warm light on the floor, an anvil, a bench, and a stone shelf that carries the golden mouse
//     (gm-crystal-5) one hop up. Only the shell: the forge job itself is milestone C3.
// Nothing here is a find, a rule or a prompt. The footprints are taken out of the rim rocks and pebbles AFTER they are scattered (CRYSTAL_CLEARS, never KEEP_OUT).
// =============================================================================

import { mulberry32 } from '../rng.js';

const f = Object.freeze;
const r2 = (v) => Math.round(v * 100) / 100;

export const GROTTO = f({ x: 25, z: 12, r: 5 });
export const FORGE = f({ x: -24, z: 23, r: 5 });
// The golden mice sit where src/goldmice.js has them (test/crystalgrotto.test.js holds the lists equal).
export const GROTTO_MOUSE = f({ id: 'gm-crystal-4', x: 25, z: 12, y: 0 });
export const SHELF_MOUSE = f({ id: 'gm-crystal-5', x: -25, z: 19.5, y: 1.0 });

// ---- the rectangles the rim rocks and pebbles are taken out of (after the scatter) ---------------------------------------------------------------
export const GROTTO_CLEAR = f({ minX: 19, maxX: 31, minZ: 6, maxZ: 18 });
export const FORGE_CLEAR = f({ minX: -30, maxX: -17, minZ: 17.5, maxZ: 29.5 });
export const GROTTO_CLEARS = f([GROTTO_CLEAR, FORGE_CLEAR]);

// ---- the grotto's mushrooms ------------------------------------------------------------------------------------------------------------------
// The ring: eight stems round the middle, a wide gap to the west (the cave's way in) and a small one to the east. { x, z, stem (height), cap (radius), h (stem + cap,
// at most MAX_CAP_TOP), hue: 0 teal, 1 violet, 2 pink, solid (a collider circle) }.
export const MAX_CAP_TOP = 2.0;
const RING = [[40, 3.4, 1.0, 0.8, 0], [65, 3.9, 1.2, 0.9, 1], [105, 3.9, 0.9, 0.75, 2], [145, 3.5, 1.1, 0.85, 0], [215, 3.6, 0.8, 0.7, 1], [255, 3.9, 1.3, 0.95, 2], [295, 3.5, 1.0, 0.8, 0], [0, 3.8, 0.9, 0.75, 1]];
export const RING_MUSHROOMS = f(RING.map(([deg, rad, stem, cap, hue]) => {
  const a = (deg * Math.PI) / 180;
  const h = r2(stem + cap * 0.55);
  return f({ x: r2(GROTTO.x + Math.cos(a) * rad), z: r2(GROTTO.z + Math.sin(a) * rad), stem, cap, h, hue, solid: true, stemR: r2(0.14 + cap * 0.1) });
}));
// The little ones: a seeded handful of buttons on the floor between the ring and the edge (never inside 2 m of the mouse, never across the way in). Not solid.
export function scatterButtons(n = 9) {
  const rng = mulberry32(0x67726f74); // 'grot'
  const out = [];
  let tries = 0;
  while (out.length < n && tries++ < 400) {
    const a = rng() * Math.PI * 2;
    const rad = 2.2 + rng() * 2.6;
    const x = r2(GROTTO.x + Math.cos(a) * rad);
    const z = r2(GROTTO.z + Math.sin(a) * rad);
    const cap = r2(0.2 + rng() * 0.18);
    const stem = r2(0.2 + rng() * 0.25);
    const hue = Math.floor(rng() * 3);
    if (Math.hypot(x - GROTTO_MOUSE.x, z - GROTTO_MOUSE.z) < 2) continue;
    if (RING_MUSHROOMS.some((m) => Math.hypot(m.x - x, m.z - z) < m.cap + cap + 0.7)) continue;
    if (Math.hypot(x - 20.7, z - 11.9) < 2.2) continue; // the cluster at the way in
    out.push(f({ x, z, stem, cap, h: r2(stem + cap * 0.55), hue, solid: false, stemR: 0.05 }));
  }
  return f(out);
}
export const BUTTONS = scatterButtons();
// The giants: outside the walkable edge (x 36), their caps a metre or more beyond it. { x, z, stem, cap, hue }.
export const GIANTS = f([[40.4, 7.2, 5.4, 2.0, 1], [41.4, 12.4, 7.0, 2.4, 0], [40.2, 17.6, 4.8, 1.9, 2]].map(([x, z, stem, cap, hue]) => f({ x, z, stem, cap, hue })));
export const GROTTO_COLLIDERS = f(RING_MUSHROOMS.filter((m) => m.solid).map((m) => f({ x: m.x, z: m.z, r: r2(m.stemR + 0.2) })));

// ---- the forge --------------------------------------------------------------------------------------------------------------------------------
export const HEARTH = f({ x: -23.5, z: 28, w: 2.6, d: 1.5, h: 0.9, back: 2.4 });
export const ANVIL = f({ x: -21.2, z: 26, r: 0.45, yaw: 0.5 });
export const BENCH = f({ x: -27.5, z: 27, w: 2.0, d: 0.7, h: 0.8, yaw: 0 });
// The shelf: a low ledge of stone, 1.0 m over the floor (a hop of 1.0, under the 1.6 a cat climbs), the golden mouse on its top. The perch stands in the middle of the top.
export const SHELF = f({ x: -24.4, z: 19.6, w: 2.0, d: 0.8, h: 1.0, reachFrom: f({ x: -24.4, z: 20.7 }) });
export const SHELF_PERCH = f({ x: SHELF.x, z: SHELF.z, y: SHELF.h, kind: 'stone' });
export const LIGHT_POOL = f({ x: -23.5, z: 25.8, r: 3.4 });
export const FORGE_COLLIDERS = f([
  f({ x: r2(HEARTH.x - 0.8), z: HEARTH.z, r: 0.8 }), f({ x: r2(HEARTH.x + 0.8), z: HEARTH.z, r: 0.8 }),
  f({ x: ANVIL.x, z: ANVIL.z, r: ANVIL.r }),
  f({ x: r2(BENCH.x - 0.6), z: BENCH.z, r: 0.4 }), f({ x: r2(BENCH.x + 0.6), z: BENCH.z, r: 0.4 }),
  f({ x: r2(SHELF.x - 0.6), z: SHELF.z, r: 0.5 }), f({ x: r2(SHELF.x + 0.6), z: SHELF.z, r: 0.5 }),
]);

// ---- what the stage hands to the cave ------------------------------------------------------------------------------------------------------
export const grottoColliders = () => [...GROTTO_COLLIDERS, ...FORGE_COLLIDERS].map((c) => ({ ...c }));
export const grottoPerches = () => [{ ...SHELF_PERCH }];
// The spots the photo and the journal read: { type: journal id, x, z, up (metres over the floor), range }.
export const SPOTS_C2 = f([
  f({ type: 'ccgrotto', x: GROTTO.x, z: GROTTO.z, up: 1.2, range: 8 }),
  f({ type: 'ccforge', x: HEARTH.x, z: HEARTH.z, up: 1.2, range: 8 }),
]);
// Every solid or drawn piece's footprint as [x, z, r]: what the tests keep clear of the finds, the mice, the stones, Lumi, the arch, the pool and the wander points.
export const footprint = () => [
  ...RING_MUSHROOMS.map((m) => [m.x, m.z, m.cap]), ...GROTTO_COLLIDERS.map((c) => [c.x, c.z, c.r]),
  [HEARTH.x, HEARTH.z, 1.6], [ANVIL.x, ANVIL.z, 0.8], [BENCH.x, BENCH.z, 1.2], [SHELF.x, SHELF.z, 1.3],
];
