// =============================================================================
// THE ECHO DEEP, MILESTONE C2: THE HALL SHELL. The plan: pure data and pure functions (no THREE, no clock, no random number). crystaldeepparts.js draws it,
// crystaldeeplive.js runs it. North is -z; heights are metres over the floor at that spot. Docs: docs/superpowers/specs/2026-11-27-crystal-story2-design.md section 3.
//   * THE PASSAGE: a short walk south from the singing chamber (its middle (-27, -16), edge z -21) into the hall, at least 2.2 m wide.
//   * THE DEEP HALL (about (-28, -27), radius 4.5): three prism stands round the golden mouse, the door-crystal on the south rim, the nest ledge of Tink to the west.
//   * THE NOOK (entry side of the Rose hall): two pillars, a lintel with hanging crystals and a low pedestal where the Prism Charm will lie. Tink goes home here.
// Nothing here is a rule, a prompt or a find: the wall, the prisms, Tink and the charm are C3 and C4. The footprints are taken out of the rim rocks and pebbles AFTER
// they are scattered (CRYSTAL_CLEARS, never KEEP_OUT). The floor is crystalY everywhere: nothing in the Deep touches it, and there is no ceiling.
// =============================================================================

const f = Object.freeze;
const r2 = (v) => Math.round(v * 100) / 100;

export const PASSAGE_GAP_DEG = 24; // half the hall wall opening at the passage, degrees either side of +z
export const NEAR = 26; // the detail is drawn only within this of a site; beyond it a low stand-in glow stands in (the iPad 7 floor)
export const HALL = f({ x: -28, z: -27, r: 4.5 });
export const PASSAGE = f({ x: -28, z0: -21, z1: -22.6, halfW: 1.2 }); // the open width is 2 * halfW = 2.4 m
// the golden mice stay where src/goldmice.js has them (C7 places them for good): gm-crystal-6 in the hall, gm-crystal-7 on the nest ledge
export const HALL_MOUSE = f({ id: 'gm-crystal-6', x: -28, z: -26, y: 0 });
export const NEST_MOUSE = f({ id: 'gm-crystal-7', x: -31, z: -28, y: 0 });

// ---- the rectangles the rim rocks and pebbles are taken out of (after the scatter) ----------------------------------------------------------
export const HALL_CLEAR = f({ minX: -34, maxX: -22, minZ: -33, maxZ: -20.5 });
export const NOOK = f({ x: -6.5, z: 7, yaw: 0.8, pillarGap: 1.5, lintel: 2.3 });
export const NOOK_CLEAR = f({ minX: -10, maxX: -3, minZ: 3.5, maxZ: 10.5 });
export const DEEP_CLEARS = f([HALL_CLEAR, NOOK_CLEAR]);

// ---- the prisms and the door -----------------------------------------------------------------------------------------------------------------
// Faces 0 rose, 1 blue, 2 gold; the shape is the same index (0 circle, 1 diamond, 2 star), so colour alone is never the clue. DOOR_PATTERN is what the drawn door shows
// until the prism rules (C1, wired in C3) say otherwise: stand i must show face DOOR_PATTERN[i].
export const FACES = f(['rose', 'blue', 'gold']);
export const SHAPES = f(['circle', 'diamond', 'star']);
export const FACE_COLOURS = f([0xff6fa8, 0x62b8ff, 0xffc65a]);
export const DOOR_PATTERN = f([0, 1, 2]);
export const STANDS = f([f({ x: -30.4, z: -26, i: 0 }), f({ x: -25.6, z: -26, i: 1 }), f({ x: -28, z: -28.2, i: 2 })]);
export const DOOR = f({ x: -28, z: -30.8, h: 2.3, w: 1.3 });
export const NEST = f({ x: -31, z: -28, w: 1.7, d: 1.5, h: 0.9, reachFrom: f({ x: -29.4, z: -27.2 }) });
export const NEST_PERCH = f({ x: NEST.x, z: NEST.z, y: NEST.h, kind: 'stone' });
export const PEDESTAL = f({ x: NOOK.x, z: NOOK.z, h: 0.5, r: 0.5 }); // the charm lies here (C4)

// ---- the solid pieces: circle chains (the cat slides along them) ------------------------------------------------------------------------------
const RING_R = 4.9;
const WALL_R = 0.5;
const GAP_DEG = PASSAGE_GAP_DEG;
function hallWalls() {
  const out = [];
  const n = 30;
  for (let i = 0; i < n; i++) {
    const deg = (i / n) * 360;
    const off = Math.abs(((deg - 90 + 540) % 360) - 180);
    if (off < GAP_DEG) continue;
    const a = (deg * Math.PI) / 180;
    out.push(f({ x: r2(HALL.x + Math.cos(a) * RING_R), z: r2(HALL.z + Math.sin(a) * RING_R), r: WALL_R }));
  }
  return out;
}
export const HALL_WALLS = f(hallWalls());
const sideX = PASSAGE.halfW + 0.4; // a wall circle of 0.4 stands this far from the middle line
export const PASSAGE_WALLS = f([PASSAGE.z0, PASSAGE.z0 - 0.8, PASSAGE.z1 - 0.2].flatMap((z) => [f({ x: r2(PASSAGE.x - sideX), z, r: 0.4 }), f({ x: r2(PASSAGE.x + sideX), z, r: 0.4 })]));
export const STAND_COLLIDERS = f(STANDS.map((s) => f({ x: s.x, z: s.z, r: 0.42 })));
export const DOOR_COLLIDERS = f([f({ x: r2(DOOR.x - 0.55), z: DOOR.z, r: 0.6 }), f({ x: r2(DOOR.x + 0.55), z: DOOR.z, r: 0.6 })]);
export const NEST_COLLIDERS = f([f({ x: r2(NEST.x - 0.4), z: NEST.z, r: 0.55 }), f({ x: r2(NEST.x + 0.4), z: NEST.z, r: 0.55 })]);
const cy = Math.cos(NOOK.yaw);
const sy = Math.sin(NOOK.yaw);
export const NOOK_PILLARS = f([-1, 1].map((k) => f({ x: r2(NOOK.x + cy * NOOK.pillarGap * k), z: r2(NOOK.z + sy * NOOK.pillarGap * k), r: 0.4 })));
export const NOOK_COLLIDERS = f([...NOOK_PILLARS, f({ x: PEDESTAL.x, z: PEDESTAL.z, r: PEDESTAL.r })]);

export const deepColliders = () => [...HALL_WALLS, ...PASSAGE_WALLS, ...STAND_COLLIDERS, ...DOOR_COLLIDERS, ...NEST_COLLIDERS, ...NOOK_COLLIDERS].map((c) => ({ ...c }));
export const deepPerches = () => [{ ...NEST_PERCH }];

// Every solid or drawn piece footprint as [x, z, r]: what the tests keep clear of the finds, the mice, the stones, Lumi, the arch, the pool and the wander points.
export const footprint = () => [[HALL.x, HALL.z, HALL.r + 0.4], [NOOK.x, NOOK.z, NOOK.pillarGap + 0.6]];

// the sites the near-switch reads
export const SITES = f([f({ x: HALL.x, z: HALL.z }), f({ x: NOOK.x, z: NOOK.z })]);
export const nearDeep = (x, z, near = NEAR) => SITES.some((s) => Math.hypot(x - s.x, z - s.z) <= near);
