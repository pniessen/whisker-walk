// =============================================================================
// THE REEF, WING B: THE CORAL GARDEN'S NORTH (milestone R5). Pure data and pure functions (no THREE, no clock, no Math.random; the scatter is a seeded
// stream): the shallow cave behind the coral that holds shell three (the just-right one) and the air pocket that rings it, the three lantern corals, the
// sea snail's home (Marlo's old shell), the clumps of coral at three heights and the stage the housewarming parade glides past. reefwingparts.js draws
// them; world/reefhouse.js runs the lanterns and the parade; the tests read them. North is -z, heights are metres over the seabed.
// docs/superpowers/plans/2026-11-26-reef.md sections 3.3 (steps 4 to 7), 4.2 and 8 (R5). The numbers marked "start" are tuned from pictures.
// Additive on purpose: nothing of the first release's chapter 1 reads this file but the story's shell list and colliders (reefstory.js), so the wing can be
// cut (drop the three calls in world/reef.js and the life's wiring) and nothing else is hidden.
// =============================================================================

import { REEF_BOUNDS, reefY, scatterCoral, scatterKelp } from './reefplan.js';
import { mulberry32 } from '../rng.js';

const P3 = (x, z) => Object.freeze({ x, z });

// ---- the cave and shell three -----------------------------------------------------------------------------------------------
// A shallow alcove of three boulders and a lintel slab (no roof, so the view into it is open from the chase camera), its mouth facing south (+z).
export const CAVE = Object.freeze({
  x: 26, z: -21, // the middle of the floor
  mouth: P3(26, -18.2), // where the sand opens out
  boulders: Object.freeze([
    Object.freeze({ x: 26, z: -23.6, r: 1.5, h: 2.4 }), // the back
    Object.freeze({ x: 22.9, z: -21.8, r: 1.3, h: 2.1 }), // the left
    Object.freeze({ x: 29.1, z: -21.8, r: 1.3, h: 2.1 }), // the right
  ]),
  lintel: Object.freeze({ x: 26, z: -22.9, w: 6.2, d: 1.1, y: 2.2 }), // a slab laid across the two sides, over the back (an arch, not a roof)
});
export const SHELL_THREE = Object.freeze({ id: 2, kind: 'right', x: 26, z: -20.4, y: 0, minLift: 0, reach: 1.7 });
// The air pocket that rings the cave's floor (it refills the gauge: shell three teaches that a pocket gives air again).
export const CAVE_POCKET = Object.freeze({ x: 26, z: -19.2 });

// ---- the three lantern corals, touched in this order -----------------------------------------------------------------------
// A tall coral spire with a dark orb on top that glows when it is touched. They lead from the garden toward the cave, so the third is the nearest to it.
export const LANTERNS = Object.freeze([P3(12.5, -15.5), P3(16.6, -19.6), P3(21.2, -16.4)].map((p, i) => Object.freeze({ id: i, ...p, h: 1.7, touch: 1.8, r: 0.42 })));
export const LANTERN_COUNT = LANTERNS.length;
export const LANTERN_COLORS = Object.freeze([0xff8fb4, 0xffd36e, 0x8fe6ff]); // the three glows, one each (a pink, a gold, a sea blue)

// Marlo's old shell, left as a sea snail's home beside the cave once he has tried the new one on.
export const SNAIL_HOME = Object.freeze({ x: 30.4, z: -17.6 });

// ---- the housewarming's stage ---------------------------------------------------------------------------------------------------
export const STAGE = Object.freeze({ x: 21, z: -19 }); // the parade glides past this (the lanterns and the cave mouth are all within 8 m of it)

// Things the wing's clumps keep clear of: the cave and its mouth, the lanterns and the snail's home, the story's other places (the numbers are
// reefstory.js's own: test/reefwing.test.js holds them equal), the finds and the collectibles nearby. [x, z, r].
export const WING_AVOID = Object.freeze([
  [CAVE.x, CAVE.z, 4.2], [CAVE.mouth.x, CAVE.mouth.z, 3.2], [CAVE_POCKET.x, CAVE_POCKET.z, 2.2], [SNAIL_HOME.x, SNAIL_HOME.z, 1.8],
  ...LANTERNS.map((l) => [l.x, l.z, 2.2]),
  [STAGE.x, STAGE.z, 1.4],
  [17.2, 1.6, 2.4], [14, -4, 2], [20, 6, 2], [11.5, 5.5, 1.8], [17.5, -1.5, 2], // the ledge, the two floating mice, the pocket, the oyster
  [24, -12, 1.6], [30, -8, 1.6], [6, -24, 1.6], // a found-outfit spot and two collectibles
].map((k) => Object.freeze(k)));

// ---- the clumps at three heights ------------------------------------------------------------------------------------------------
// { kind, x, z, s, h (1 low, 2 middle, 3 tall), yaw, hue }. Low ones are brain and rock, middle ones branch and fan, tall ones are spires (the plan's "three
// heights"); the tall ones are one InstancedMesh, the others are merged by material. The same seed, the same answer.
export const WING_ZONE = Object.freeze({ x: 20, z: -20, r: 11.5 });
export const WING_COUNT = Object.freeze({ low: 12, mid: 12, tall: 8 });
const KINDS_BY_HEIGHT = Object.freeze({ 1: Object.freeze(['brain', 'rock']), 2: Object.freeze(['branch', 'fan', 'tube']), 3: Object.freeze(['spire']) });
const SIZE_BY_HEIGHT = Object.freeze({ 1: [0.32, 0.3], 2: [0.7, 0.45], 3: [0.55, 0.3] }); // [base, spread]

function clearOfWing(x, z, extra) {
  for (const [kx, kz, kr] of WING_AVOID) if (Math.hypot(x - kx, z - kz) < kr + extra) return false;
  if (x < REEF_BOUNDS.minX + 2 || x > REEF_BOUNDS.maxX - 2 || z < REEF_BOUNDS.minZ + 2 || z > REEF_BOUNDS.maxZ - 2) return false;
  return true;
}

export function scatterWing() {
  const rng = mulberry32(0x77696e67);
  const old = [...scatterCoral(), ...scatterKelp().map((k) => ({ x: k.x, z: k.z, s: 0.3 }))];
  const out = [];
  for (const h of [3, 2, 1]) { // the big ones first, so the small ones fill round them
    const want = h === 3 ? WING_COUNT.tall : h === 2 ? WING_COUNT.mid : WING_COUNT.low;
    let tries = 0;
    let added = 0;
    while (added < want && tries++ < 6000) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * WING_ZONE.r;
      const x = WING_ZONE.x + Math.cos(a) * r;
      const z = WING_ZONE.z + Math.sin(a) * r;
      const [base, spread] = SIZE_BY_HEIGHT[h];
      const s = base + rng() * spread;
      const list = KINDS_BY_HEIGHT[h];
      const kind = list[Math.floor(rng() * list.length)];
      const yaw = rng() * Math.PI * 2;
      const hue = Math.floor(rng() * 4);
      if (!clearOfWing(x, z, s + 0.3)) continue;
      if (old.some((o) => Math.hypot(o.x - x, o.z - z) < o.s + s + 0.7)) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.s + s + 0.5)) continue;
      out.push({ kind, x, z, s, h, yaw, hue });
      added++;
    }
  }
  return out;
}
export const wingClumps = () => scatterWing().filter((k) => k.h < 3);
export const wingSpires = () => scatterWing().filter((k) => k.h === 3);

// ---- what is solid ------------------------------------------------------------------------------------------------------------------
// The cave's three boulders, the lanterns, the spires and the larger middle clumps (a circle a little smaller than the drawn thing, as the coral's are).
export const wingColliders = () => [
  ...CAVE.boulders.map((b) => Object.freeze({ x: b.x, z: b.z, r: Math.round(b.r * 0.85 * 100) / 100 })),
  ...LANTERNS.map((l) => Object.freeze({ x: l.x, z: l.z, r: l.r })),
  ...wingSpires().map((k) => Object.freeze({ x: k.x, z: k.z, r: Math.round(k.s * 0.6 * 100) / 100 })),
  ...wingClumps().filter((k) => k.s >= 0.75).map((k) => Object.freeze({ x: k.x, z: k.z, r: Math.round(k.s * 0.8 * 100) / 100 })),
];

export const shellThreeY = () => reefY(SHELL_THREE.x, SHELL_THREE.z) + SHELL_THREE.y;
// A tall spire's height from its size (metres): the three heights of the plan are low clumps, middle clumps and these.
export const spireHeight = (s) => 1.7 + (s - 0.55) * 4;
export const spireBaseY = (k) => reefY(k.x, k.z) - 0.05;
