// =============================================================================
// THE REEF: THREE FRIENDLY DIVERS, A RESEARCH SHIP ABOVE THE SHIMMER AND A BIG SPOTTED SHARK (milestone R18), THE PLAN. Pure numbers and pure poses: no THREE, no clock,
// no Math.random (the little variety there is comes from hash01 with one salt of its own). reefdiversparts.js draws from these, reefdiverslive.js runs them.
//   * the divers: two buddies drifting in a slow loop over the open sand east of the Coral Garden, and one hovering beside the ship's dive ladder. They swim 3 m and more
//     over the seabed, above the float ceiling (2.2 m), so they are never in her way and have no collider; when she comes within about 10 m they turn her way and wave,
//     and if she comes close they ease aside. Wetsuits, bare heads, goggles pushed up, a tank on the back, fins.
//   * the research ship: a mid-size hull lying on the shimmer ceiling (a keel under it, the deck seen through it), a dive ladder hanging from its rail and a small yellow
//     submersible on two cables. Never moves but a little bob.
//   * the big spotted shark: a long slow loop far beyond the north edge, never nearer than SHARK_KEEP to the walkable bounds.
// =============================================================================
// (A stage chunk imports nothing from the Reef's main chunk, so it never splits that chunk: the few numbers it needs from reefplan.js are copied here, and
// test/reefdivers.test.js holds them equal; the seabed's height is handed in by the life through useGround.)
const SURFACE_Y = 9; // reefplan.js SURFACE_Y
const REEF_BOUNDS = Object.freeze({ minX: -48, maxX: 48, minZ: -42, maxZ: 42 }); // reefplan.js REEF_BOUNDS
const TAU = Math.PI * 2;
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** A whole number and a salt to a number from 0 to 1, by integer arithmetic only (reefseals.js hash01, the same on every device). */
export function hash01(n, salt) {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((salt | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
let reefY = () => 0;
/** The life hands in the seabed's height (reefplan.js reefY). */
export const useGround = (fn) => { reefY = fn; };
export const GROUND_NUMBERS = Object.freeze({ SURFACE_Y, REEF_BOUNDS });

export const DIVER_SALT = 0x64697665; // 'dive': one salt, different from every other creature's (test/reefdivers.test.js)
const wrap = (a) => { const r = (a + Math.PI) % TAU; return (r < 0 ? r + TAU : r) - Math.PI; };
const turnToward = (from, to, k) => from + wrap(to - from) * k;

// ---- the ship ---------------------------------------------------------------------------------------------------------------------
// It lies along x (yaw pi/2 turns the drawing's z along the world's x); the dive ladder hangs from the south rail near the stern.
export const VESSEL = Object.freeze({ x: 28, z: 22, yaw: Math.PI / 2, length: 24, beam: 5.4, keelY: 7.2, waterY: SURFACE_Y, range: 26 });
export const LADDER_AT = Object.freeze({ x: VESSEL.x - 6.5, z: VESSEL.z + 2.8, top: 10.3, bottom: 4.4 }); // world
export const SUB = Object.freeze({ lx: -4.4, lz: 2, y: 6.0 }); // the submersible's centre in the ship's own frame (x to port, z along the ship)

// ---- the divers ---------------------------------------------------------------------------------------------------------------------
export const WAVE_FROM = 10; // she is seen at this distance (metres, along the ground)
export const WAVE_FULL = 7; // and the wave is whole from here in
export const EASE_NEAR = 2.8; // inside this a diver eases aside
export const LOOKS = Object.freeze([
  Object.freeze({ accent: [32, 190, 200], skin: [236, 190, 150], hair: [92, 62, 42], style: 'short' }),
  Object.freeze({ accent: [255, 140, 40], skin: [150, 98, 66], hair: [30, 24, 22], style: 'tail' }),
  Object.freeze({ accent: [180, 220, 40], skin: [214, 164, 120], hair: null, style: 'bare' }),
]);
// kind 'drift': a loop (centre, radii, tilt, rate in rad/s, level over the seabed); kind 'hover': stays near (x, z) at a fixed height, facing `face`.
export const DIVERS = Object.freeze([
  { id: 0, kind: 'drift', cx: 24, cz: 8, a: 5.5, b: 3.6, rot: 0.4, w: 0.07, dir: 1, level: 3.1, phase: 0 },
  { id: 1, kind: 'drift', cx: 24, cz: 8, a: 5.5, b: 3.6, rot: 0.4, w: 0.07, dir: 1, level: 3.5, phase: 0.16 }, // the buddy, a little behind and a little higher
  { id: 2, kind: 'hover', x: LADDER_AT.x, z: LADDER_AT.z + 1.2, y: 4.9, face: Math.PI },
].map((d) => Object.freeze(d)));
export const DIVER_COUNT = Object.freeze({ high: 3, low: 2, lite: 2 });

// diverPose(d, t, cat, out): { x, y, z, yaw, pitch, wave (0 to 1), kick (rad), beat (rad), look }. `cat` is { x, z } or null.
export function diverPose(d, t, cat = null, out = {}) {
  const T = Math.max(0, t);
  const ph = hash01(d.id, DIVER_SALT) * TAU;
  let x; let z; let heading;
  if (d.kind === 'drift') {
    const th = d.dir * d.w * T + d.phase * TAU;
    const ex = d.a * Math.cos(th); const ez = d.b * Math.sin(th);
    const cs = Math.cos(d.rot); const sn = Math.sin(d.rot);
    x = d.cx + ex * cs - ez * sn; z = d.cz + ex * sn + ez * cs;
    const dx = d.dir * (-d.a * Math.sin(th)); const dz = d.dir * (d.b * Math.cos(th));
    heading = Math.atan2(dx * cs - dz * sn, dx * sn + dz * cs);
    out.y = reefY(x, z) + d.level + 0.14 * Math.sin(0.5 * T + ph);
    out.pitch = -0.1;
  } else {
    x = d.x + 0.3 * Math.cos(0.3 * T + ph); z = d.z + 0.3 * Math.sin(0.25 * T + ph);
    heading = d.face;
    out.y = d.y + 0.12 * Math.sin(0.45 * T + ph);
    out.pitch = 0.9; // upright, one hand on the ladder
  }
  out.wave = 0;
  if (cat) {
    const dx = cat.x - x; const dz = cat.z - z; const dist = Math.hypot(dx, dz);
    out.wave = smooth((WAVE_FROM - dist) / (WAVE_FROM - WAVE_FULL));
    heading = turnToward(heading, Math.atan2(dx, dz), 0.7 * out.wave);
    if (dist < EASE_NEAR) { // never in her way: ease aside along the line from her, and a little up
      const k = (1 - smooth((dist - 1.2) / (EASE_NEAR - 1.2))) * 1.4;
      const ux = dist > 1e-3 ? -dx / dist : Math.sin(heading); const uz = dist > 1e-3 ? -dz / dist : Math.cos(heading);
      x += ux * k; z += uz * k; out.y += 0.3 * k;
    }
  }
  out.x = x; out.z = z; out.yaw = heading;
  out.kick = 2.2 * T + ph;
  out.beat = 3.4 * T + ph;
  out.look = LOOKS[d.id % LOOKS.length];
  return out;
}

// ---- the shark ----------------------------------------------------------------------------------------------------------------------
// A whale-shark's loop: long, slow and far. Its nearest point is 10 m beyond the north edge of the walk (SHARK_KEEP is the test's floor), at 4 m over the seabed.
export const SHARK = Object.freeze({ cx: 14, cz: -62, a: 38, b: 10, secs: 150, level: 4.0, size: 1.6, range: 34 });
export const SHARK_KEEP = 8;
export const SHARK_STILL = SHARK.secs * 0.2; // the picture reduced motion keeps: in the north-east, in view from the edge
// sharkPose(t, out): { x, y, z, yaw, pitch, roll, beat (the tail's swish), size }
export function sharkPose(t, out = {}) {
  const T = Math.max(0, t);
  const th = TAU * (T / SHARK.secs);
  out.x = SHARK.cx + SHARK.a * Math.cos(th); out.z = SHARK.cz + SHARK.b * Math.sin(th);
  out.yaw = Math.atan2(-SHARK.a * Math.sin(th), SHARK.b * Math.cos(th));
  out.y = reefY(out.x, out.z) + SHARK.level + 0.3 * Math.sin(5 * TAU * T / SHARK.secs);
  out.pitch = 0.04 * Math.cos(5 * TAU * T / SHARK.secs);
  out.roll = 0.05 * Math.sin(3 * TAU * T / SHARK.secs);
  out.beat = TAU * T / 4.6;
  out.size = SHARK.size;
  return out;
}
/** The shortest distance from a point to the walkable rectangle (0 inside it). */
export const outsideBounds = (x, z) => Math.hypot(Math.max(REEF_BOUNDS.minX - x, 0, x - REEF_BOUNDS.maxX), Math.max(REEF_BOUNDS.minZ - z, 0, z - REEF_BOUNDS.maxZ));
