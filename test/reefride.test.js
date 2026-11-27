// Reef R11: the pure ride sim. Hammered like the rover's: deterministic, never in a collider / keepOut / refused ground / out of bounds,
// never stuck, speed capped, turns slower at speed, depth within [seabed + 0.5, ceiling], a way off always exists.
import { describe, it, expect } from 'vitest';
import { RIDES, RIDE, MAX_SEATS, SEAT_OFFSET, createRide, stepRide, isFree, dismountSpot } from '../src/world/reefride.js';
import { REEF_BOUNDS } from '../src/world/reefplan.js';
import { mulberry32 } from '../src/rng.js';

const DT = 1 / 30;
const mkEnv = () => ({
  colliders: [{ x: 0, z: 0, r: 3 }, { x: 10, z: 4, r: 2 }, { x: 13, z: 4, r: 2 }, { x: -12, z: -8, r: 4 }, { x: 20, z: -20, r: 1 }],
  keepOut: [{ minX: -30, maxX: -20, minZ: 10, maxZ: 18 }, { minX: 25, maxX: 28, minZ: -5, maxZ: 30 }],
  // a raised block the ground refuses to step onto
  ground: { canStep: (ax, az, bx, bz) => !(bx > 30 && bx < 38 && bz > -30 && bz < -20) },
  groundY: (x, z) => 1.5 * Math.sin(x * 0.2) * Math.cos(z * 0.2) + 1.5,
  ceil: (x, z) => (x > 35 ? 3 : Infinity),
});
const inBlock = (x, z) => x > 30 && x < 38 && z > -30 && z < -20;

function randomStream(seed, n) {
  const r = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: r() * 2 - 1, z: r() * 2 - 1, lift: Math.round(r() * 2 - 1) * (r() < 0.5 ? 0 : 1) });
  return out;
}
function startFree(r, env, kind) {
  for (;;) {
    const x = REEF_BOUNDS.minX + r() * 96;
    const z = REEF_BOUNDS.minZ + r() * 84;
    if (isFree(x, z, env, RIDES[kind].radius) && !inBlock(x, z)) return [x, z];
  }
}

describe('specs', () => {
  it('scooter is the quicker, saucer the bigger and steadier and seats two; both frozen', () => {
    expect(RIDES.scooter.maxSpeed).toBe(7);
    expect(RIDES.saucer.maxSpeed).toBe(3.5);
    expect(RIDES.scooter.maxSpeed).toBeGreaterThan(RIDES.saucer.maxSpeed);
    expect(RIDES.saucer.radius).toBeGreaterThan(RIDES.scooter.radius);
    expect(RIDES.scooter.turn).toBeGreaterThan(RIDES.saucer.turn);
    expect(RIDES.saucer.seats).toBe(2);
    expect(RIDES.scooter.seats).toBe(1);
    expect(MAX_SEATS).toBe(2);
    expect(RIDES.saucer.seatsAt.length).toBe(2);
    expect(SEAT_OFFSET.scooter.y).toBeGreaterThan(0);
    for (const k of Object.values(RIDES)) { expect(Object.isFrozen(k)).toBe(true); expect(Object.isFrozen(k.seatsAt)).toBe(true); expect(Object.isFrozen(k.seatsAt[0])).toBe(true); }
    expect(Object.isFrozen(RIDES)).toBe(true);
    expect(Object.isFrozen(RIDE)).toBe(true);
  });
});

describe('driving', () => {
  const open = { colliders: [], bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 } };
  it('is deterministic: the same stream gives the same ride', () => {
    const run = () => {
      const env = mkEnv();
      const s = createRide('saucer', 5, 5, 1);
      const ys = [];
      for (const inp of randomStream(7, 600)) ys.push(stepRide(s, inp, DT, env));
      return JSON.stringify([s, ys]);
    };
    expect(run()).toBe(run());
  });
  it('speed never exceeds MAX_SPEED, and reaches it on a full push', () => {
    for (const kind of Object.keys(RIDES)) {
      const s = createRide(kind, 0, 0, 0);
      let top = 0;
      for (let i = 0; i < 300; i++) { stepRide(s, { x: 0, z: 1 }, DT, open); top = Math.max(top, s.speed); s.z = 0; }
      expect(top).toBeLessThanOrEqual(RIDES[kind].maxSpeed + 1e-9);
      expect(top).toBeCloseTo(RIDES[kind].maxSpeed, 5);
    }
    const s = createRide('scooter', 0, 0, 0);
    for (const inp of randomStream(3, 2000)) { stepRide(s, inp, DT, open); expect(s.speed).toBeLessThanOrEqual(7 + 1e-9); s.x = 0; s.z = 0; }
  });
  it('turns slower at higher speed, never faster than the spec', () => {
    const turnIn = (speed) => {
      const s = createRide('scooter', 0, 0, 0);
      s.speed = speed;
      stepRide(s, { x: 1, z: 0 }, 0.01, open);
      return s.yaw;
    };
    expect(turnIn(0)).toBeCloseTo(2.2 * 0.01, 5);
    expect(turnIn(7)).toBeLessThan(turnIn(0));
    expect(turnIn(7)).toBeGreaterThan(0);
  });
  it('a spot turn through half a circle: saucer slower than scooter', () => {
    const secs = (kind) => {
      const s = createRide(kind, 0, 0, 0);
      let t = 0;
      while (Math.abs(s.yaw) < Math.PI - 0.02 && t < 9) { stepRide(s, { x: 0, z: -1 }, DT, open); s.x = 0; s.z = 0; s.speed = 0; t += DT; }
      return t;
    };
    expect(secs('saucer')).toBeGreaterThan(secs('scooter') * 1.5);
  });
});

describe('under random sticks', () => {
  it('10,000 steps over random starts: never in a collider, keepOut, refused ground or out of bounds; depth in range', () => {
    const env = mkEnv();
    for (const kind of Object.keys(RIDES)) {
      const r = mulberry32(kind === 'scooter' ? 11 : 12);
      const k = RIDES[kind];
      let steps = 0;
      while (steps < 10000) {
        const [x, z] = startFree(r, env, kind);
        const s = createRide(kind, x, z, r() * 6);
        const stream = randomStream(Math.floor(r() * 1e9), 250);
        for (const inp of stream) {
          const y = stepRide(s, inp, DT * (1 + Math.floor(r() * 3)), env);
          steps++;
          expect(isFree(s.x, s.z, env, k.radius)).toBe(true);
          expect(inBlock(s.x, s.z)).toBe(false);
          const gy = env.groundY(s.x, s.z);
          const top = Math.max(gy + RIDE.minClear, Math.min(RIDE.ceiling, gy + env.ceil(s.x, s.z)));
          expect(y).toBeGreaterThanOrEqual(gy + RIDE.minClear - 1e-9);
          expect(y).toBeLessThanOrEqual(top + 1e-9);
          expect(s.speed).toBeLessThanOrEqual(k.maxSpeed + 1e-9);
        }
      }
    }
  });
  it('lift rises and dives smoothly (1.5 m/s) from the seat height and holds there with no lift', () => {
    const env = { colliders: [], groundY: () => 2 };
    const s = createRide('scooter', 0, 0, 0, 2);
    stepRide(s, { x: 0, z: 0, lift: 0 }, DT, env);
    expect(s.y).toBeCloseTo(2 + 1.1, 1); // seat height above the seabed
    const y0 = s.y;
    for (let i = 0; i < 30; i++) stepRide(s, { x: 0, z: 0, lift: 1 }, DT, env);
    expect(s.y - y0).toBeGreaterThan(1.2);
    expect(s.y - y0).toBeLessThan(1.6);
    for (let i = 0; i < 600; i++) stepRide(s, { x: 0, z: 0, lift: 1 }, DT, env);
    expect(s.y).toBeCloseTo(7, 5);
    for (let i = 0; i < 1200; i++) stepRide(s, { x: 0, z: 0, lift: -1 }, DT, env);
    expect(s.y).toBeCloseTo(2.5, 5);
  });
  it('follows rising seabed and never goes under it', () => {
    const env = { colliders: [], groundY: (x) => x * 0.5 };
    const s = createRide('saucer', 0, 0, Math.PI / 2);
    for (let i = 0; i < 400; i++) { stepRide(s, { x: 1, z: 0, lift: -1 }, DT, env); expect(s.y).toBeGreaterThanOrEqual(env.groundY(s.x) + 0.5 - 1e-9); }
  });
});

describe('never stuck', () => {
  it('from every start in a field of colliders a push away from the nearest obstacle for 3 s moves it away', () => {
    const r = mulberry32(5);
    const cs = [];
    for (let i = 0; i < 40; i++) cs.push({ x: -40 + r() * 80, z: -34 + r() * 68, r: 1 + r() * 2.5 });
    const env = { colliders: cs, keepOut: [{ minX: -10, maxX: 6, minZ: 20, maxZ: 26 }] };
    for (const kind of Object.keys(RIDES)) {
      const k = RIDES[kind];
      let tried = 0;
      for (let n = 0; n < 400; n++) {
        const [x, z] = startFree(r, env, kind);
        // nearest obstacle (collider edge, or the rectangle, or the wall)
        let best = Infinity, ax = 0, az = 0;
        for (const c of cs) { const d = Math.hypot(x - c.x, z - c.z) - c.r; if (d < best) { best = d; const L = Math.hypot(x - c.x, z - c.z) || 1; ax = (x - c.x) / L; az = (z - c.z) / L; } }
        for (const w of [[1, 0, x - REEF_BOUNDS.minX], [-1, 0, REEF_BOUNDS.maxX - x], [0, 1, z - REEF_BOUNDS.minZ], [0, -1, REEF_BOUNDS.maxZ - z]]) if (w[2] < best) { best = w[2]; ax = w[0]; az = w[1]; }
        const kk = env.keepOut[0];
        { const qx = Math.min(Math.max(x, kk.minX), kk.maxX), qz = Math.min(Math.max(z, kk.minZ), kk.maxZ); const d = Math.hypot(x - qx, z - qz); if (d < best && d > 0) { best = d; ax = (x - qx) / d; az = (z - qz) / d; } }
        if (best > k.radius + 3) continue; // only the ones near something
        tried++;
        const s = createRide(kind, x, z, Math.atan2(-ax, -az)); // facing the obstacle
        for (let i = 0; i < 90; i++) stepRide(s, { x: ax, z: az }, DT, env);
        const from = Math.hypot(s.x - x, s.z - z);
        expect(from).toBeGreaterThan(1.0);
        expect(isFree(s.x, s.z, env, k.radius)).toBe(true);
      }
      expect(tried).toBeGreaterThan(20);
    }
  });
  it('a bad start (inside a collider) is put out, never held there', () => {
    const env = { colliders: [{ x: 0, z: 0, r: 5 }] };
    const s = createRide('saucer', 0.1, 0, 0);
    stepRide(s, { x: 0, z: 0 }, DT, env);
    expect(isFree(s.x, s.z, env, 1.5)).toBe(true);
  });
  it('a pinch between two colliders: the step is not taken, never inside either', () => {
    const env = { colliders: [{ x: -2.2, z: 5, r: 2 }, { x: 2.2, z: 5, r: 2 }] }; // gap 0.4 m: no saucer fits
    const s = createRide('saucer', 0, 0, 0);
    for (let i = 0; i < 200; i++) { stepRide(s, { x: 0, z: 1 }, DT, env); expect(isFree(s.x, s.z, env, 1.5)).toBe(true); }
    expect(s.z).toBeLessThan(5);
  });
  it('ground.canStep refusal: the step is not taken and the speed into it is lost', () => {
    const env = { colliders: [], ground: { canStep: (ax, az, bx) => bx < 3 } };
    const s = createRide('scooter', 0, 0, Math.PI / 2);
    for (let i = 0; i < 200; i++) stepRide(s, { x: 1, z: 0 }, DT, env);
    expect(s.x).toBeLessThan(3);
    expect(s.speed).toBeLessThan(3);
  });
});

describe('dismountSpot', () => {
  it('always returns a free, in-bounds, collider-free spot outside the mount, over many cases including tight pinches', () => {
    const r = mulberry32(21);
    for (let n = 0; n < 600; n++) {
      const cs = [];
      for (let i = 0; i < 25; i++) cs.push({ x: -40 + r() * 80, z: -34 + r() * 68, r: 1 + r() * 3 });
      const env = { colliders: cs, keepOut: [{ minX: -8, maxX: 8, minZ: -3, maxZ: 3 }], ground: { canStep: (ax, az, bx, bz) => !inBlock(bx, bz) } };
      const kind = n % 2 ? 'saucer' : 'scooter';
      const [x, z] = startFree(r, env, kind);
      const s = createRide(kind, x, z, r() * 6);
      const toward = n % 3 === 0 ? null : { x: r() * 2 - 1, z: r() * 2 - 1 };
      const sp = dismountSpot(s, env, toward);
      expect(sp.ok).toBe(true);
      const e = { ...env, bounds: REEF_BOUNDS };
      expect(isFree(sp.x, sp.z, e, RIDE.catPad, 0.3)).toBe(true);
      expect(Math.hypot(sp.x - s.x, sp.z - s.z)).toBeGreaterThan(RIDES[kind].radius);
      expect(inBlock(sp.x, sp.z)).toBe(false);
    }
  });
  it('even walled in tight it answers (nearest push-out) with finite numbers', () => {
    const env = { colliders: [{ x: 0, z: 0, r: 40 }] };
    const sp = dismountSpot(createRide('saucer', 0, 45, 0), env);
    expect(Number.isFinite(sp.x) && Number.isFinite(sp.z)).toBe(true);
  });
});
