// =============================================================================
// THE CRYSTAL CAVE'S WING B: THE PLAN (milestone C5). The Blue Pool with its stepping crystals, the Gold Gallery with its vein wall and the nook, the three great
// crystals still to come (blue, gold, and the Heart), the sky and gold spark stones, the passages' lamps. Pure data and pure functions (no THREE, no clock, no
// Math.random): world/crystalwingparts.js draws them, world/crystalwing.js runs them, the tests read them. Imports nothing from crystalplan.js (that file imports
// this one for the colliders), so every height here is "metres over the floor" and the build adds the floor. North is -z. Numbers marked "start" are tuned from pictures.
// docs/superpowers/plans/2026-11-26-crystal-cave.md sections 2 and 3.
//
// EVERYTHING ON FOOT. The pool is a shallow glowing basin you can walk through (no water collider, no swimming); the stepping crystals are low perches on a line
// across it, an OPTIONAL climb: the sky stone, the Blue crystal and the gold nook are all reached by floor alone (test/crystalwing.test.js floods the floor).
// =============================================================================

const f = Object.freeze;

// ---- the Blue Pool -----------------------------------------------------------------------------------------------------------
export const POOL = f({ x: 14, z: -4, r: 4.6 });
// Six stepping crystals across the pool's north half, 1.15 m apart (a hop is under the perch reach of 1.2 m), rising and falling a little. { x, z, h (top over the floor), r (collider) }
export const STEPPING = f([0, 1, 2, 3, 4, 5].map((i) => f({ x: 10.9 + i * 1.15, z: -6.2, h: [0.3, 0.5, 0.7, 0.8, 0.6, 0.4][i], r: 0.45 })));
// The Blue crystal (the sky stone's home) stands on the pool's west shore; the stone lies on the east shore, across the water.
export const BLUE_GREAT = f({ x: 7.5, z: -1.5, s: 2.2, hue: 'blue', yaw: 1.1, great: true, n: 7 });
export const SKY_STONE = f({ x: 19.2, z: -5.4, reach: 1.7 });

// ---- the Gold Gallery -------------------------------------------------------------------------------------------------------
export const GOLD_GREAT = f({ x: -12.5, z: -19.5, s: 2.2, hue: 'gold', yaw: 0.2, great: true, n: 7 });
// The vein wall: tall slabs of stone with gold seams along the north edge, broken by the nook. { x, z, r (collider), h (drawn height) }
const SLAB_X = [-17.5, -15.4, -13.3, -11.2, -9.2, -1.8, 0.3, 2.4, 4.5];
export const VEIN_SLABS = f(SLAB_X.map((x, i) => f({ x, z: Math.round((-28.6 + 0.6 * Math.sin(i * 1.7)) * 100) / 100, r: 1.05, h: 2.8 + 0.5 * ((i * 3) % 4) })));
// The nook: three rocks round the gold stone, open to the south (a 2 m gap), and a ring of glints round the stone.
export const NOOK = f({ x: -5.5, z: -26.2, rocks: f([f({ x: -7.4, z: -26.9, r: 0.9, h: 1.7 }), f({ x: -3.6, z: -26.9, r: 0.9, h: 1.7 }), f({ x: -5.5, z: -28.3, r: 1.0, h: 2.1 })]), glints: 9, glintR: 1.15 });
export const GOLD_STONE = f({ x: NOOK.x, z: NOOK.z, reach: 1.7 });

// ---- the Heart Crystal --------------------------------------------------------------------------------------------------------
export const HEART_GREAT = f({ x: 22, z: -22, s: 3.0, hue: 'heart', yaw: 0.6, great: true, n: 9, reach: 4.2 });
// a ring of small crystals round it (decor, walk through the gaps; none within 2 m of the golden mouse at (26, -26))
export const HEART_RING = f(Array.from({ length: 7 }, (_, i) => {
  const a = 0.3 + (i / 7) * Math.PI * 2;
  return f({ x: Math.round((HEART_GREAT.x + Math.cos(a) * 3.6) * 100) / 100, z: Math.round((HEART_GREAT.z + Math.sin(a) * 3.6) * 100) / 100, s: 0.7 + 0.12 * (i % 3), hue: 'heart', yaw: a, n: 4 });
}));
// where the pool's and the gallery's small crystals stand (decor): a loose ring round the pool (the west shore stays open), a row at the foot of the vein wall
export const POOL_RING = f(Array.from({ length: 9 }, (_, i) => {
  const a = -1.2 + (i / 9) * 4.6; // from the north-east round to the south, skipping the west
  return f({ x: Math.round((POOL.x + Math.cos(a) * 5.9) * 100) / 100, z: Math.round((POOL.z + Math.sin(a) * 5.9) * 100) / 100, s: 0.55 + 0.12 * (i % 3), hue: 'blue', yaw: i * 1.3, n: 4 });
}).filter((k) => Math.hypot(k.x - SKY_STONE.x, k.z - SKY_STONE.z) > 2.2));
export const GOLD_ROW = f([-16.5, -14.2, -12, -10.4, -0.9, 1.2, 3.3].map((x, i) => f({ x, z: -26.6 + 0.35 * Math.cos(i), s: 0.6 + 0.1 * (i % 3), hue: 'gold', yaw: i * 0.9, n: 4 })));

// ---- the three great crystals, in the order of the stones ----------------------------------------------------------------------
export const GREATS = f([null, BLUE_GREAT, GOLD_GREAT]); // index = stone id (0, the Rose crystal, is crystalplan.js's ROSE_GREAT)

// ---- the passages' lamps: little glints along the three passages that come on when everything is lit ------------------------
const along = (pts, every, side) => {
  const out = [];
  for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, az] = pts[s]; const [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / len; const nz = (bx - ax) / len;
    for (let d = every / 2; d < len; d += every) {
      for (const sd of [-side, side]) out.push(f({ x: Math.round((ax + ((bx - ax) * d) / len + nx * sd) * 100) / 100, z: Math.round((az + ((bz - az) * d) / len + nz * sd) * 100) / 100 }));
    }
  }
  return out;
};
export const PASSAGES = f([
  f({ id: 'pool', hue: 'blue', lamps: f(along([[0, 20], [7, 8], [12, 0]], 2.4, 1.7)) }),
  f({ id: 'gold', hue: 'gold', lamps: f(along([[7, 8], [0, -6], [-6, -18]], 2.4, 1.7)) }),
  f({ id: 'heart', hue: 'heart', lamps: f(along([[17, -5], [20, -14], [22, -18]], 2.4, 1.7)) }),
]);

// ---- what is solid in the wing: the great crystals (a little narrower than drawn), the stepping crystals, the vein slabs, the nook's rocks ------------
export const wingColliders = () => [
  f({ x: BLUE_GREAT.x, z: BLUE_GREAT.z, r: 1.3 }),
  f({ x: GOLD_GREAT.x, z: GOLD_GREAT.z, r: 1.3 }),
  f({ x: HEART_GREAT.x, z: HEART_GREAT.z, r: 1.9 }),
  ...STEPPING.map((s) => f({ x: s.x, z: s.z, r: s.r })),
  ...VEIN_SLABS.map((s) => f({ x: s.x, z: s.z, r: s.r })),
  ...NOOK.rocks.map((s) => f({ x: s.x, z: s.z, r: s.r })),
];

// The perches: the stepping crystals' tops. `floorY(x, z)` is the floor's height there (the build passes crystalY); kind 'stone', no skill needed.
export const wingPerches = (floorY) => STEPPING.map((s) => ({ x: s.x, z: s.z, y: Math.round((floorY(s.x, s.z) + s.h) * 100) / 100, kind: 'stone' }));

// ---- the spark stones for the story (crystalstory.js reads these) ---------------------------------------------------------------
export const WING_STONES = f([
  f({ id: 1, hue: 'blue', x: SKY_STONE.x, z: SKY_STONE.z, reach: SKY_STONE.reach, hideBehind: f({ x: POOL.x, z: POOL.z }) }),
  f({ id: 2, hue: 'gold', x: GOLD_STONE.x, z: GOLD_STONE.z, reach: GOLD_STONE.reach, hideBehind: f({ x: NOOK.rocks[2].x, z: NOOK.rocks[2].z }) }),
]);
export const WING_CRYSTALS = f([
  f({ id: 'blue', x: BLUE_GREAT.x, z: BLUE_GREAT.z, reach: 3.5, hue: 'blue' }),
  f({ id: 'gold', x: GOLD_GREAT.x, z: GOLD_GREAT.z, reach: 3.5, hue: 'gold' }),
]);
