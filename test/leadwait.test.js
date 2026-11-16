// Lead and wait (src/leadwait.js) and the way round things (src/pathfind.js).
import { describe, it, expect } from 'vitest';
import { createLeader, yawToward, STEP_M, LEAD_AHEAD_M, LEAD_NEAR_M } from '../src/leadwait.js';
import { findPath, pathLength, pointAlong } from '../src/pathfind.js';

const run = (l, secs, child) => { let r; for (let t = 0; t < secs; t += 0.05) r = l.step(0.05, child); return r; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

describe('the leader', () => {
  it('sits and turns to look at the child', () => {
    const l = createLeader({ x: 0, z: 0, yaw: 0 });
    const r = run(l, 2, { x: 5, z: 0 });
    expect(r).toEqual({ speed: 0, pose: 'requestPet' });
    expect(l.pos).toEqual({ x: 0, z: 0 });
    expect(Math.cos(l.yaw - yawToward(0, 0, 5, 0))).toBeCloseTo(1, 3);
  });

  it('a few steps toward the child is that many half metres, no more', () => {
    const l = createLeader({ x: 0, z: 0 });
    l.steps(3);
    run(l, 5, { x: 0, z: -9 });
    expect(l.pos.z).toBeCloseTo(-3 * STEP_M, 1);
    expect(l.arrived).toBe(true);
  });

  it('approach stops the standoff short of the child, wherever the child goes', () => {
    const l = createLeader({ x: 0, z: 0 });
    l.approach({ standoff: 1.5 });
    const child = { x: 0, z: -10 };
    run(l, 3, child);
    child.x = 6; // the child wanders
    run(l, 20, child);
    expect(dist(l.pos, child)).toBeLessThanOrEqual(1.55);
    expect(dist(l.pos, child)).toBeGreaterThan(0.6);
  });

  it('lead: she never gets far ahead; she waits, looking back, and sets off again when the child comes', () => {
    const l = createLeader({ x: 0, z: 0 });
    l.lead([{ x: 0, z: -30 }]);
    const child = { x: 0, z: 0 };
    run(l, 30, child); // the child does not follow
    expect(l.waiting).toBe(true);
    expect(dist(l.pos, child)).toBeGreaterThan(LEAD_AHEAD_M - 0.2);
    expect(dist(l.pos, child)).toBeLessThan(LEAD_AHEAD_M + 0.5);
    expect(Math.cos(l.yaw - yawToward(l.pos.x, l.pos.z, 0, 0))).toBeCloseTo(1, 2); // looking back
    const stopped = l.pos.z;
    child.z = stopped + LEAD_NEAR_M - 0.5; // the child comes up
    run(l, 1, child);
    expect(l.pos.z).toBeLessThan(stopped);
    // walked all the way with her, she arrives and sits
    for (let i = 0; i < 400 && !l.arrived; i++) { child.z = l.pos.z + 2; l.step(0.05, child); }
    expect(l.arrived).toBe(true);
    expect(dist(l.pos, { x: 0, z: -30 })).toBeLessThan(0.5);
  });

  it('a pose is held where she stands, then she carries on', () => {
    const l = createLeader({ x: 0, z: 0 });
    l.goTo({ x: 0, z: -5 });
    l.pose('pounce', 1);
    expect(l.step(0.5, { x: 3, z: 0 })).toEqual({ speed: 0, pose: 'pounce' });
    expect(l.pos).toEqual({ x: 0, z: 0 });
    run(l, 0.6, { x: 3, z: 0 });
    expect(run(l, 0.2, { x: 3, z: 0 }).pose).toBe('follow');
  });

  it('a wall she cannot pass does not hold her for ever: she gives that point up', () => {
    const fix = (pos, px) => { if (pos.x > 2) pos.x = Math.max(px, 2); }; // a wall at x = 2
    const l = createLeader({ x: 0, z: 0, fix });
    l.goTo({ x: 10, z: 0 });
    run(l, 10, { x: 0, z: 5 });
    expect(l.arrived).toBe(true);
    expect(l.pos.x).toBeLessThanOrEqual(2.001);
  });
});

describe('the way round things', () => {
  const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
  it('open ground: one straight leg to the spot', () => {
    expect(findPath(() => true, bounds, { x: 0, z: 0 }, { x: 7.3, z: -11.2 })).toEqual([{ x: 7.3, z: -11.2 }]);
  });

  it('round a pond: every leg stays on dry ground', () => {
    const pond = (x, z) => Math.hypot(x, z + 8) < 5;
    const walkable = (x, z) => !pond(x, z);
    const from = { x: 0, z: 0 };
    const path = findPath(walkable, bounds, from, { x: 0, z: -16 });
    expect(path.length).toBeGreaterThan(1);
    let p = from;
    for (const q of path) {
      for (let k = 0; k <= 20; k++) expect(walkable(p.x + ((q.x - p.x) * k) / 20, p.z + ((q.z - p.z) * k) / 20)).toBe(true);
      p = q;
    }
    expect(path.at(-1)).toEqual({ x: 0, z: -16 });
    expect(pathLength(from, path)).toBeGreaterThan(16);
    expect(pathLength(from, path)).toBeLessThan(26);
  });

  it('an end inside something is moved to the nearest ground; no way at all gives null', () => {
    const rock = (x, z) => Math.hypot(x - 10, z) < 2;
    const path = findPath((x, z) => !rock(x, z), bounds, { x: 0, z: 0 }, { x: 10, z: 0 });
    expect(Math.hypot(path.at(-1).x - 10, path.at(-1).z)).toBeLessThan(3.2);
    const wall = (x) => x > 4 && x < 6;
    expect(findPath((x) => !wall(x), bounds, { x: 0, z: 0 }, { x: 10, z: 0 })).toBe(null);
  });

  it('a step the ground refuses (a rim) is gone round', () => {
    const canStep = (ax, az, bx) => !((ax < 5) !== (bx < 5)) || Math.abs(az) > 10; // a rim along x = 5, open beyond |z| 10
    const path = findPath(() => true, bounds, { x: 0, z: 0 }, { x: 10, z: 0 }, { canStep });
    expect(path.some((p) => Math.abs(p.z) > 10)).toBe(true);
  });

  it('pointAlong walks the path by metres', () => {
    const path = [{ x: 0, z: -4 }, { x: 3, z: -4 }];
    expect(pointAlong({ x: 0, z: 0 }, path, 2)).toEqual({ x: 0, z: -2 });
    expect(pointAlong({ x: 0, z: 0 }, path, 5)).toEqual({ x: 1, z: -4 });
    expect(pointAlong({ x: 0, z: 0 }, path, 99)).toEqual({ x: 3, z: -4 });
  });
});

describe('asking the way again and again', () => {
  it('a memo keeps the map\'s answers, so the second ask does not ask the map again', () => {
    const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
    let asked = 0;
    const walkable = (x, z) => { asked += 1; return Math.hypot(x, z + 8) >= 5; };
    const memo = {};
    const first = findPath(walkable, bounds, { x: 0, z: 0 }, { x: 0, z: -16 }, { memo });
    const cost = asked;
    const second = findPath(walkable, bounds, { x: 0, z: 0 }, { x: 0, z: -16 }, { memo });
    expect(second).toEqual(first);
    expect(asked - cost).toBeLessThan(cost / 2); // only the straight-line checks ask again
  });
});
