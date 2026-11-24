// The Moon, milestone 3: Dot's pure driving sim (world/moonrover.js) and the plan's course. The properties the plan asks for: the rover never
// leaves the bounds, is never inside a collider, is never stuck (the stick pointed away from a wall drives away from it, and a way off exists
// at every moment), and is deterministic for a given input stream; steep ground slows it but never stops it; the Rover Tour is a pure
// function of the distance along the track; the track itself is clear of every collider.
import { describe, it, expect } from 'vitest';
import * as P from '../src/world/moonplan.js';
import { ROVER, ROVER_FREE, createRover, stepRover, isFree, dismountSpot, tourLoop, tourLength, tourPoint, tourNearest, trackPosts } from '../src/world/moonrover.js';
import { mulberry32 } from '../src/rng.js';

const colliders = () => P.MOON_COLLIDERS.map((c) => ({ ...c }));
const env = () => ({ colliders: colliders(), bounds: P.MOON_BOUNDS, ground: P.createMoonGround() });
const DT = 1 / 30;

// the closest the circle comes to a collider's edge (negative: inside it)
function clearance(s, cs) {
  let worst = Infinity;
  for (const c of cs) worst = Math.min(worst, Math.hypot(s.x - c.x, s.z - c.z) - c.r - ROVER.radius);
  return worst;
}

describe('the switch', () => {
  it('free steering is on (the plan ships it; the Rover Tour is the one-constant fallback)', () => {
    expect(ROVER_FREE).toBe(true);
  });
});

describe('the sim: a rover on the Moon\'s ground', () => {
  it('accelerates to the plan\'s speed on a full push and no further: 7 m/s, 5 m/s2', () => {
    const e = { colliders: [], bounds: P.MOON_BOUNDS };
    const s = createRover(0, 0, 0);
    stepRover(s, { x: 0, z: 1 }, 1, e);
    expect(s.speed).toBeCloseTo(5, 1);
    for (let i = 0; i < 60; i++) { stepRover(s, { x: 0, z: 1 }, DT, e); s.z = 0; }
    expect(s.speed).toBeCloseTo(ROVER.maxSpeed, 5);
    expect(ROVER.maxSpeed).toBe(7);
    expect(ROVER.accel).toBe(5);
  });
  it('a half push is half the speed; no push brakes to a stop', () => {
    const e = { colliders: [], bounds: P.MOON_BOUNDS };
    const s = createRover(0, 0, 0);
    for (let i = 0; i < 90; i++) { stepRover(s, { x: 0, z: 0.5 }, DT, e); s.z = 0; }
    expect(s.speed).toBeCloseTo(3.5, 1);
    for (let i = 0; i < 60; i++) stepRover(s, { x: 0, z: 0 }, DT, e);
    expect(s.speed).toBe(0);
  });
  it('turns at the plan\'s 2.2 rad/s, never faster; a spot turn through half a circle takes about 1.4 s', () => {
    const e = { colliders: [], bounds: P.MOON_BOUNDS };
    const s = createRover(0, 0, 0);
    stepRover(s, { x: 1, z: 0 }, 0.1, e); // the stick wants east (yaw pi/2)
    expect(s.yaw).toBeCloseTo(0.22, 3);
    const t = createRover(0, 0, 0);
    let secs = 0;
    while (Math.abs(Math.abs(t.yaw) - Math.PI) > 0.01 && secs < 5) { stepRover(t, { x: 0, z: -1 }, DT, e); t.x = 0; t.z = 0; secs += DT; }
    expect(secs).toBeGreaterThan(1.3);
    expect(secs).toBeLessThan(1.6);
  });
  it('eases round a turn: pointed away from the wanted way it keeps a quarter of its speed, never skids at full tilt', () => {
    const e = { colliders: [], bounds: P.MOON_BOUNDS };
    const s = createRover(0, 0, 0);
    for (let i = 0; i < 60; i++) { stepRover(s, { x: 0, z: 1 }, DT, e); s.z = 0; }
    const fast = s.speed;
    for (let i = 0; i < 12; i++) { stepRover(s, { x: 0, z: -1 }, DT, e); s.z = 0; }
    expect(s.speed).toBeLessThan(fast);
    expect(s.speed).toBeGreaterThan(0);
  });
  it('is the same drive for the same stream of input, frame size and all: deterministic', () => {
    const run = (dt) => {
      const rng = mulberry32(7);
      const e = env();
      const s = createRover(P.DOT_PARK.x, P.DOT_PARK.z, P.DOT_PARK.yaw);
      for (let i = 0; i < 900; i++) { const a = rng() * 6.28; const m = rng() < 0.2 ? 0 : rng(); stepRover(s, { x: Math.sin(a) * m, z: Math.cos(a) * m }, dt, e); }
      return s;
    };
    expect(run(DT)).toEqual(run(DT));
    // a long frame is the same as the small steps it is made of
    const e1 = env(); const e2 = env();
    const a = createRover(0, 20, 0); const b = createRover(0, 20, 0);
    stepRover(a, { x: 0.3, z: 1 }, 0.2, e1);
    for (let i = 0; i < 6; i++) stepRover(b, { x: 0.3, z: 1 }, 0.2 / 6, e2);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.z).toBeCloseTo(b.z, 6);
  });
  it('a zero or negative frame moves nothing', () => {
    const s = createRover(1, 2, 0.5);
    stepRover(s, { x: 1, z: 0 }, 0, env());
    stepRover(s, { x: 1, z: 0 }, -1, env());
    expect(s).toMatchObject({ x: 1, z: 2, yaw: 0.5, speed: 0 });
  });
});

describe('collisions: never out of the bounds, never inside a collider', () => {
  it('under a long random stream of pushes (including flat out at walls, the dome, the shed and the boulders) the rover is never in a collider or out of the bounds, over many seeds', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rng = mulberry32(seed * 7919);
      const e = env();
      const s = createRover(P.DOT_PARK.x, P.DOT_PARK.z, P.DOT_PARK.yaw);
      let a = rng() * 6.28;
      let worst = Infinity;
      for (let i = 0; i < 3000; i++) {
        if (rng() < 0.03) a = rng() * 6.28; // a new way now and then; otherwise it holds, so it runs into things
        stepRover(s, { x: Math.sin(a), z: Math.cos(a) }, DT * (0.5 + rng()), e);
        worst = Math.min(worst, clearance(s, e.colliders));
        expect(s.x).toBeGreaterThanOrEqual(P.MOON_BOUNDS.minX + ROVER.inset - 1e-6);
        expect(s.x).toBeLessThanOrEqual(P.MOON_BOUNDS.maxX - ROVER.inset + 1e-6);
        expect(s.z).toBeGreaterThanOrEqual(P.MOON_BOUNDS.minZ + ROVER.inset - 1e-6);
        expect(s.z).toBeLessThanOrEqual(P.MOON_BOUNDS.maxZ - ROVER.inset + 1e-6);
      }
      expect(worst, `seed ${seed}`).toBeGreaterThan(-0.01);
    }
  });
  it('drives into the dome\'s wall and the shed head-on and stays out of them', () => {
    const e = env();
    for (const [x, z, yaw] of [[-12, 26, -Math.PI / 2], [-24, 20, Math.PI], [30, 40.2, -Math.PI / 2]]) {
      const s = createRover(x, z, yaw);
      const to = { x: Math.sin(yaw), z: Math.cos(yaw) };
      for (let i = 0; i < 400; i++) stepRover(s, to, DT, e);
      expect(clearance(s, e.colliders)).toBeGreaterThan(-0.01);
    }
  });
  it('the rover cannot get into the airlock (its clear width is under the rover\'s own)', () => {
    const e = env();
    const s = createRover(-12, P.AIRLOCK.z, -Math.PI / 2);
    for (let i = 0; i < 600; i++) stepRover(s, { x: -1, z: 0 }, DT, e);
    expect(s.x).toBeGreaterThan(P.AIRLOCK.x1);
  });
  it('is never stuck: from the worst corner it can reach, pushing away from the wall drives away from it within a couple of seconds', () => {
    const e = env();
    // jam it against the dome and the board and the shed, then push straight back out
    for (const [x, z] of [[-24.6, 26], [-24.6, 31], [P.SHED.x + 2.5, P.SHED.z - 4], [42, 5], [-34, 34.2], [P.OLD_DISH.x + 2.3, P.OLD_DISH.z]]) {
      const s = createRover(x, z, 0);
      for (let i = 0; i < 90; i++) { const a = i * 0.4; stepRover(s, { x: Math.sin(a), z: Math.cos(a) }, DT, e); } // wiggle into whatever is there
      const jam = { x: s.x, z: s.z };
      // away from the nearest collider
      let near = null; let nd = Infinity;
      for (const c of e.colliders) { const d = Math.hypot(s.x - c.x, s.z - c.z) - c.r; if (d < nd) { nd = d; near = c; } }
      const away = { x: s.x - near.x, z: s.z - near.z };
      for (let i = 0; i < 90; i++) stepRover(s, away, DT, e);
      expect(Math.hypot(s.x - jam.x, s.z - jam.z), `from ${x},${z}`).toBeGreaterThan(2);
    }
  });
  it('a pinch between two colliders is not taken (the step stands still rather than leave the rover inside one)', () => {
    const cs = [{ x: -2.0, z: 0, r: 1 }, { x: 2.0, z: 0, r: 1 }]; // a gap of 2 m: narrower than the rover (2.6 m)
    const s = createRover(0, 6, Math.PI);
    for (let i = 0; i < 300; i++) stepRover(s, { x: 0, z: -1 }, DT, { colliders: cs, bounds: P.MOON_BOUNDS });
    expect(clearance(s, cs)).toBeGreaterThan(-0.01);
    expect(s.z).toBeGreaterThan(0);
  });
});

describe('slopes: steep ground slows, never stops', () => {
  it('climbing the Earthrise Ridge\'s flank is slower than the same push on the plain, and still moves', () => {
    const ground = P.createMoonGround();
    const flat = { colliders: [], bounds: P.MOON_BOUNDS, ground };
    const run = (x, z, yaw) => { const s = createRover(x, z, yaw); let top = 0; for (let i = 0; i < 90; i++) { stepRover(s, { x: Math.sin(yaw), z: Math.cos(yaw) }, DT, flat); top = Math.max(top, s.speed); } return { s, top }; };
    const plain = run(0, 20, 0);
    expect(plain.top).toBeCloseTo(7, 1);
    // find the steepest uphill start inside the bounds and drive up it
    let best = { g: 0 };
    for (let x = -50; x <= 50; x += 2) for (let z = -48; z <= 48; z += 2) {
      for (let k = 0; k < 8; k++) {
        const yaw = (k / 8) * Math.PI * 2;
        const g = (P.moonY(x + Math.sin(yaw) * 0.25, z + Math.cos(yaw) * 0.25) - P.moonY(x - Math.sin(yaw) * 0.25, z - Math.cos(yaw) * 0.25)) / 0.5;
        if (g > best.g) best = { g, x, z, yaw };
      }
    }
    expect(best.g).toBeGreaterThan(0.28);
    const s = createRover(best.x, best.z, best.yaw);
    stepRover(s, { x: Math.sin(best.yaw), z: Math.cos(best.yaw) }, DT, flat);
    expect(s.grade).toBeGreaterThan(0.25);
    for (let i = 0; i < 60; i++) { s.x = best.x; s.z = best.z; stepRover(s, { x: Math.sin(best.yaw), z: Math.cos(best.yaw) }, DT, flat); }
    expect(s.speed).toBeLessThan(7);
    expect(s.speed).toBeGreaterThanOrEqual(ROVER.maxSpeed * ROVER.slopeMin - 1e-6);
  });
  it('the whole Moon is drivable: a rover pushed in any of 16 directions on a coarse grid of the plain always moves (the slowest it ever goes is a third of top speed)', () => {
    const ground = P.createMoonGround();
    const flat = { colliders: [], bounds: P.MOON_BOUNDS, ground };
    let slowest = Infinity;
    for (let x = -50; x <= 50; x += 10) for (let z = -46; z <= 46; z += 10) for (let k = 0; k < 16; k++) {
      const yaw = (k / 16) * Math.PI * 2;
      const s = createRover(x, z, yaw);
      for (let i = 0; i < 30; i++) { s.x = x; s.z = z; stepRover(s, { x: Math.sin(yaw), z: Math.cos(yaw) }, DT, flat); }
      slowest = Math.min(slowest, s.speed);
    }
    expect(slowest).toBeGreaterThan(ROVER.maxSpeed * ROVER.slopeMin * 0.7);
  });
});

describe('the way off: one press, always onto free ground', () => {
  it('dismountSpot is free of every collider (by a cat\'s margin) and inside the bounds, and outside the rover\'s own circle, from 3,000 places the rover can be', () => {
    const e = env();
    const rng = mulberry32(99);
    let n = 0;
    for (let i = 0; i < 6000 && n < 3000; i++) {
      const x = P.MOON_BOUNDS.minX + 1 + rng() * 106;
      const z = P.MOON_BOUNDS.minZ + 1 + rng() * 98;
      if (!isFree(x, z, e.colliders)) continue;
      n++;
      const s = createRover(x, z, rng() * 6.28);
      const to = dismountSpot(s, e);
      expect(to.ok, `${x},${z}`).toBe(true);
      expect(Math.hypot(to.x - s.x, to.z - s.z)).toBeGreaterThan(ROVER.radius + 0.5);
      for (const c of e.colliders) expect(Math.hypot(to.x - c.x, to.z - c.z)).toBeGreaterThanOrEqual(c.r + 0.5 - 1.1e-3); // (isFree's own 1 mm of slack)
      expect(to.x).toBeGreaterThan(P.MOON_BOUNDS.minX);
      expect(to.x).toBeLessThan(P.MOON_BOUNDS.maxX);
      expect(to.z).toBeGreaterThan(P.MOON_BOUNDS.minZ);
      expect(to.z).toBeLessThan(P.MOON_BOUNDS.maxZ);
    }
    expect(n).toBe(3000);
  });
  it('and from the corners of the map and hard against the dome, the shed and the beacon', () => {
    const e = env();
    for (const [x, z] of [[-53, -49], [53, 49], [-53, 49], [53, -49], [-24.6, 26], [P.SHED.x + 2.5, P.SHED.z], [P.FAR_BEACON.x - 2.5, P.FAR_BEACON.z], [-34, 34.5]]) {
      const s = createRover(Math.min(53, Math.max(-53, x)), Math.min(49, Math.max(-49, z)), 0);
      const to = dismountSpot(s, e);
      expect(to.ok, `${x},${z}`).toBe(true);
    }
  });
  it('prefers her side, the rover\'s right: the first answer in open ground is beside it', () => {
    const s = createRover(0, 20, 0);
    const to = dismountSpot(s, { colliders: [], bounds: P.MOON_BOUNDS });
    expect(to.x).toBeGreaterThan(2);
    expect(Math.abs(to.z - 20)).toBeLessThan(0.5);
  });
  it('always answers, even with colliders all round (the rover\'s own spot, pushed out)', () => {
    const ring = Array.from({ length: 24 }, (_, i) => ({ x: Math.cos((i / 24) * 6.28) * 13, z: Math.sin((i / 24) * 6.28) * 13, r: 14 }));
    const to = dismountSpot(createRover(0, 0, 0), { colliders: ring, bounds: P.MOON_BOUNDS });
    expect(Number.isFinite(to.x) && Number.isFinite(to.z)).toBe(true);
  });
});

describe('the course in the plan', () => {
  it('Dot\'s depot, track and beacon are inside the bounds and clear of every collider: the parked rover, every post and the whole loop by the rover\'s own width', () => {
    const cs = colliders();
    expect(isFree(P.DOT_PARK.x, P.DOT_PARK.z, cs)).toBe(true);
    for (const p of trackPosts(P.TRACK_POST_EVERY)) for (const c of cs) expect(Math.hypot(p.x - c.x, p.z - c.z), `post ${p.x},${p.z}`).toBeGreaterThan(c.r + 0.1);
    const L = tourLoop();
    for (const p of L.pts) expect(isFree(p.x, p.z, cs, P.MOON_BOUNDS, ROVER.radius, 1), `${p.x},${p.z}`).toBe(true);
    // the straight legs too (the posts stand on them)
    for (let i = 0; i < P.TRACK.length; i++) {
      const a = P.TRACK[i]; const b = P.TRACK[(i + 1) % P.TRACK.length];
      for (let k = 0; k <= 100; k++) expect(isFree(a.x + ((b.x - a.x) * k) / 100, a.z + ((b.z - a.z) * k) / 100, cs, P.MOON_BOUNDS, ROVER.radius - 0.1, 1)).toBe(true);
    }
  });
  it('the loop is the spec\'s: about 214 m (210 once the corners are cut), 9 waypoints, a post every 6 m, and every grade on it is a drive and not a climb', () => {
    expect(P.TRACK.length).toBe(9);
    expect(tourLength()).toBeGreaterThan(195);
    expect(tourLength()).toBeLessThan(225);
    expect(trackPosts(6).length).toBeGreaterThanOrEqual(34);
    expect(trackPosts(6).length).toBeLessThanOrEqual(38);
    const ground = P.createMoonGround();
    const g = { x: 0, z: 0 };
    for (const p of tourLoop().pts) { ground.gradient(p.x, p.z, g); expect(Math.hypot(g.x, g.z)).toBeLessThan(0.3); }
  });
  it('starts at the depot and passes the Far Beacon within a rover\'s width (the cell is 4 m from the track)', () => {
    expect(P.TRACK[0].x).toBe(P.DEPOT.x);
    expect(P.TRACK[0].z).toBe(P.DEPOT.z);
    expect(P.trackDistance(P.FAR_BEACON.x, P.FAR_BEACON.z)).toBeGreaterThan(ROVER.radius + 0.5 + 1);
    expect(P.trackDistance(P.FAR_BEACON.x, P.FAR_BEACON.z)).toBeLessThan(6);
  });
  it('the rocks stay clear of the track', () => {
    // (milestone 3's keep-clear in the scatter: no rock on the lights' way)
    expect(P.trackDistance(P.TRACK[3].x, P.TRACK[3].z)).toBe(0);
    expect(P.trackDistance(P.TRACK[3].x + 10, P.TRACK[3].z + 10)).toBeGreaterThan(5);
  });
});

describe('the Rover Tour: a pure function of the distance along the track', () => {
  it('tourPoint(s) is the same every time, wraps round the loop and always faces along it', () => {
    const L = tourLength();
    for (const s of [0, 3.3, 50, 120.5, L - 0.1, L + 17, -4]) {
      const a = tourPoint(s);
      const b = tourPoint(s);
      expect(a).toEqual(b);
      const w = tourPoint(s + L);
      expect(w.x).toBeCloseTo(a.x, 5);
      expect(w.z).toBeCloseTo(a.z, 5);
    }
    for (let s = 0; s < L; s += 7) {
      const a = tourPoint(s); const b = tourPoint(s + 0.5);
      const along = Math.atan2(b.x - a.x, b.z - a.z);
      let d = Math.abs(a.yaw - along); d = Math.min(d, Math.PI * 2 - d);
      expect(d).toBeLessThan(0.15);
    }
  });
  it('moves smoothly: never a jump of more than the step asked for, corners cut round', () => {
    let prev = tourPoint(0);
    for (let s = 0.25; s < tourLength(); s += 0.25) {
      const p = tourPoint(s);
      expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThan(0.4);
      prev = p;
    }
  });
  it('tourNearest finds where the track is closest to a point', () => {
    const p = tourPoint(80);
    expect(Math.abs(tourNearest(p.x + 0.3, p.z - 0.3) - 80)).toBeLessThan(2.5);
  });
});
