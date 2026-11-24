// The Moon, milestone 7b: the bound (Tier 2 jumping), pure. The rules of world/moonbound.js, the property tests (never leaves the bounds or a collider, always lands, never
// lands inside a rift, never reaches a perch beyond the budget), the rifts' and ring gates' plan, the sources' `boundY` rule, the switch, the save's clamps and the per-cat merge.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as P from '../src/world/moonplan.js';
import { MOON_SPOTS } from '../src/foundwear/spots/moon.js';
import * as B from '../src/world/moonbound.js';
import * as J from '../src/world/moonjump.js';
import { build } from '../src/world/moon.js';
import { placeBudget } from '../src/placephysics.js';
import { canReach, bestPerch } from '../src/climbing.js';
import { sanitizeSave, CATALOG } from '../src/progression.js';
import { mergeSaves, useSaveTools } from '../src/catmerge.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });

const T = 1.08; // the Moon's pounce window
const H = 1.4; // the Moon's hop (3.6 with Spring Paws)
const ground = P.createMoonGround();
const world = { bounds: P.MOON_BOUNDS, colliders: P.MOON_COLLIDERS, rifts: P.RIFTS, canStep: ground.canStep };
const FPS = 60;

// a small seeded generator for the property tests (no Math.random: the same cases every run)
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// run one whole bound the way the walk does: each frame the stick (`aimAt(frame)`), the window counting down, an early end shortening it to the ease
function fly(start, aimAt = () => null, { fps = FPS, w = world, H: hh = H } = {}) {
  const dt = 1 / fps;
  const st = B.startBound({ ...start, T, H: hh });
  let win = T;
  const frames = [];
  let n = 0;
  while (!st.landed && n < 600) {
    const left = Math.max(0, win - dt);
    const was = st.ended;
    B.stepBound(st, dt, aimAt(n, st), w, left);
    win = st.ended && !was ? B.BOUND.ease : left; // an early end comes down over the ease (the live sets the walk's window to it)
    frames.push({ x: st.x, z: st.z, y: B.boundY(st), ended: st.ended });
    n++;
  }
  return { st, frames, n };
}

const free = (x, z) => !P.MOON_COLLIDERS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.35 + 0.3) && !B.riftAt(x, z, P.RIFTS) && P.MOON_BOUNDS.minX + 1 < x && x < P.MOON_BOUNDS.maxX - 1 && P.MOON_BOUNDS.minZ + 1 < z && z < P.MOON_BOUNDS.maxZ - 1;

describe('the bound, one flight', () => {
  const clear = { bounds: P.MOON_BOUNDS, colliders: [], rifts: [], canStep: null };
  it('a walk carries her about 5 m and a sprint about 9 m in the 1.08 s hang, on the hop\'s own parabola, and lands (y 0, landed)', () => {
    const walk = fly({ x: 0, z: 0, dx: 1, dz: 0, speed: B.boundSpeed(3.1) }, () => null, { w: clear });
    expect(walk.st.x).toBeGreaterThan(4.4);
    expect(walk.st.x).toBeLessThan(5.4);
    expect(walk.st.landed).toBe(true);
    expect(B.boundY(walk.st)).toBe(0);
    const peak = Math.max(...walk.frames.map((f) => f.y));
    expect(peak).toBeGreaterThan(H - 0.03);
    expect(peak).toBeLessThanOrEqual(H + 1e-9);
    const sprint = fly({ x: 0, z: 0, dx: 1, dz: 0, speed: B.boundSpeed(5.2) }, () => null, { w: clear });
    expect(sprint.st.x).toBeGreaterThan(8.2);
    expect(sprint.st.x).toBeLessThan(9.6);
    const spring = fly({ x: 0, z: 0, dx: 1, dz: 0, speed: B.boundSpeed(3.1) }, () => null, { w: clear, H: 3.6 });
    expect(Math.max(...spring.frames.map((f) => f.y))).toBeGreaterThan(3.5);
  });
  it('the take-off speed is her walk times 1.5, held between 4.2 and 8.6 m/s; only a run with the stick held, not stalking, off a perch, is a bound', () => {
    expect(B.boundSpeed(3.1)).toBeCloseTo(4.65, 2);
    expect(B.boundSpeed(0)).toBe(4.2);
    expect(B.boundSpeed(NaN)).toBe(4.2);
    expect(B.boundSpeed(9)).toBe(8.6);
    const ok = { lastSpeed: 3, inputHeld: true, stalking: false, perched: null };
    expect(B.boundWanted(ok)).toBe(true);
    expect(B.boundWanted({ ...ok, lastSpeed: 1.4 })).toBe(false); // stalking pace / a stroll
    expect(B.boundWanted({ ...ok, inputHeld: false })).toBe(false); // standing still: the plain hop
    expect(B.boundWanted({ ...ok, stalking: true })).toBe(false);
    expect(B.boundWanted({ ...ok, perched: {} })).toBe(false);
    expect(B.boundWanted({ ...ok, swimming: true })).toBe(false);
    expect(B.boundWanted({ ...ok, lastSpeed: NaN })).toBe(false);
  });
  it('steers at 60 percent: a stick pushed across bends the line, but less than the ground would, and the speed holds; a stick let go keeps the course', () => {
    const base = { x: 0, z: 0, dx: 1, dz: 0, speed: 5 };
    const straight = fly(base, () => null, { w: clear });
    const bent = fly(base, () => ({ x: 0, z: 1 }), { w: clear });
    expect(bent.st.z).toBeGreaterThan(1.2);
    expect(bent.st.z).toBeLessThan(5.4); // never more than all of it sideways
    expect(Math.hypot(bent.st.vx, bent.st.vz)).toBeCloseTo(5, 6);
    expect(straight.st.z).toBe(0);
    // let go after a push: it keeps its bent course
    const letGo = fly(base, (n) => (n < 15 ? { x: 0, z: 1 } : null), { w: clear });
    expect(letGo.st.z).toBeGreaterThan(0.5);
    expect(Math.atan2(letGo.st.vz, letGo.st.vx)).toBeGreaterThan(0.15);
    // 60 percent of the rate: one frame of a full sideways push turns the velocity by less than the ground's full lerp would
    const a = B.startBound({ ...base, T, H });
    B.stepBound(a, 1 / 60, { x: 0, z: 1 }, clear, T - 1 / 60);
    const ground1 = 1 - Math.pow(0.001, 1 / 60);
    expect(Math.abs(a.vz) / 5).toBeCloseTo(0.6 * ground1, 2);
  });
  it('is clamped to the bounds (she slides along the edge, still landing) and ends early, gently, at a collider (never inside its margin)', () => {
    const edge = fly({ x: P.MOON_BOUNDS.maxX - 1, z: 0, dx: 1, dz: 0, speed: 8 }, () => null, { w: { ...clear } });
    expect(edge.st.x).toBeLessThanOrEqual(P.MOON_BOUNDS.maxX);
    expect(edge.st.landed).toBe(true);
    const wall = { ...clear, colliders: [{ x: 3, z: 0, r: 1 }] };
    const hit = fly({ x: 0, z: 0, dx: 1, dz: 0, speed: 5 }, () => null, { w: wall });
    expect(hit.st.early).toBe(true);
    expect(hit.st.x).toBeLessThan(3 - 1 - 0.35 + 1e-6);
    expect(hit.st.x).toBeGreaterThan(1.3);
    expect(hit.st.landed).toBe(true);
    // she comes down over the ease (a quarter second), never snapping: the height falls monotonically after the hit
    const after = hit.frames.slice(hit.frames.findIndex((f) => f.ended));
    for (let i = 1; i < after.length; i++) expect(after[i].y).toBeLessThanOrEqual(after[i - 1].y + 1e-9);
    expect(after.length).toBeLessThanOrEqual(Math.ceil(B.BOUND.ease * FPS) + 3);
  });
  it('flies over a rift\'s own colliders (flagged `rift`) and no other', () => {
    expect(P.RIFT_COLLIDERS.length).toBeGreaterThan(0);
    for (const c of P.RIFT_COLLIDERS) expect(c.rift).toBe(true);
    const f = P.RIFTS[0];
    const mid = { x: (f.x0 + f.x1) / 2, z: (f.z0 + f.z1) / 2 };
    expect(B.blocked(P.RIFT_COLLIDERS, mid.x, mid.z)).toBe(false);
    expect(B.blocked([{ x: mid.x, z: mid.z, r: 1 }], mid.x, mid.z)).toBe(true);
  });
  it('a step the ground refuses (a tower\'s wall) ends it the same way', () => {
    const wall = { ...clear, canStep: (ax) => ax < 2 };
    const r = fly({ x: 0, z: 0, dx: 1, dz: 0, speed: 5 }, () => null, { w: wall });
    expect(r.st.early).toBe(true);
    expect(r.st.landed).toBe(true);
    expect(r.st.x).toBeLessThan(2.3);
  });
  it('is the same at any frame rate (a 20 fps phone, a 144 Hz screen) to within a step', () => {
    const a = fly({ x: 0, z: 0, dx: 1, dz: 0.2, speed: 5.5 }, () => null, { w: clear, fps: 20 }).st;
    const b = fly({ x: 0, z: 0, dx: 1, dz: 0.2, speed: 5.5 }, () => null, { w: clear, fps: 144 }).st;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.3);
  });
});

describe('the rifts: three trenches that only a bound crosses, and a bound never lands in one', () => {
  const area = build(new THREE.Scene());
  it('are three, 3.5 to 6.5 m wide, on level dust, off Dot\'s track, clear of every other thing and every pebble, find and mouse, with room to walk round', () => {
    expect(P.RIFTS).toHaveLength(3);
    expect(P.RIFTS.map((f) => f.w)).toEqual([3.5, 5, 6.5]);
    const others = [...P.JOB_POINTS, ...P.PEBBLES, ...P.MOON_MICE, ...P.MOON_POIS, P.CHEESE, P.ECHO, P.PIT_ROCK, P.STAR_TABLE];
    for (const f of P.RIFTS) {
      const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
      for (let i = 0; i <= 20; i++) {
        const x = f.x0 + ((f.x1 - f.x0) * i) / 20;
        const z = f.z0 + ((f.z1 - f.z0) * i) / 20;
        expect(Math.abs(P.moonY(x, z)), `ground at ${x},${z}`).toBeLessThan(0.12);
        expect(P.trackDistance(x, z), 'Dot\'s track').toBeGreaterThan(f.w / 2 + 2);
        for (const o of area.colliders) if (!o.rift) expect(Math.hypot(x - o.x, z - o.z), `${x},${z} vs ${o.x},${o.z}`).toBeGreaterThan(f.w / 2 + o.r + 1.5);
        for (const j of others) expect(Math.hypot(x - j.x, z - j.z)).toBeGreaterThan(f.w / 2 + 1.5);
        for (const j of MOON_SPOTS) expect(Math.hypot(x - j.x, z - j.z), `found-outfit spot ${j.id}`).toBeGreaterThan(f.w / 2 + 1.0); // (test/foundspots.test.js wants each reached on foot)
        expect(P.MOON_BOUNDS.minX + f.w / 2 + 2).toBeLessThan(x);
        expect(x).toBeLessThan(P.MOON_BOUNDS.maxX - f.w / 2 - 2);
      }
      expect(len).toBeGreaterThan(8);
    }
  });
  it('are walls to a walker (a row of colliders along each axis, no gap bigger than a cat) and the area carries them flagged', () => {
    for (const f of P.RIFTS) {
      const mine = area.colliders.filter((c) => c.rift && Math.abs(c.r - f.w / 2) < 1e-9 && B.axisPoint(f, c.x, c.z).d < 1e-6);
      expect(mine.length).toBeGreaterThan(3);
      // walking across the middle is blocked: no point on the cross-line gets in without a collider push (the cat is 0.35 wide)
      const m = { x: (f.x0 + f.x1) / 2, z: (f.z0 + f.z1) / 2 };
      expect(mine.some((c) => Math.hypot(m.x - c.x, m.z - c.z) < c.r)).toBe(true);
      // the scallops of the lip dip at most 0.05 m
      for (let i = 1; i < mine.length; i++) {
        const half = Math.hypot(mine[i].x - mine[i - 1].x, mine[i].z - mine[i - 1].z) / 2;
        expect(f.w / 2 - Math.sqrt((f.w / 2) ** 2 - half * half)).toBeLessThanOrEqual(0.05 + 1e-9);
      }
    }
  });
  it('a bound that would land inside a lip is bent to the lip\'s nearest edge, from either side', () => {
    const f = { x0: 0, z0: -10, x1: 0, z1: 10, w: 5 }; // an axis along z, 5 m wide: lip at |x| = 2.5 + 0.3
    const w = { bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 }, colliders: [], rifts: [f], canStep: null };
    for (const [x0, dir] of [[-6, 1], [6, -1], [-5, 1], [5, -1]]) {
      const r = fly({ x: x0, z: 0, dx: dir, dz: 0, speed: 4.6 }, () => null, { w });
      expect(B.riftAt(r.st.x, r.st.z, [f]), `from ${x0}`).toBeNull();
      expect(Math.abs(r.st.x)).toBeGreaterThanOrEqual(2.5 + P.RIFT_LIP - 1e-6);
      expect(r.st.landed).toBe(true);
    }
    // a bound that clears it lands on the far side as it was, untouched
    const far = fly({ x: -6, z: 0, dx: 1, dz: 0, speed: 8.6 }, () => null, { w });
    expect(far.st.x).toBeGreaterThan(3.05);
    // a landing in the middle of the real 3.5 m rift from a walk's reach (4.6 m) is a lip, not the trench
    const rf = P.RIFTS[0];
    const w2 = { ...world };
    const r2 = fly({ x: rf.x0 - 3.5, z: (rf.z0 + rf.z1) / 2, dx: 1, dz: 0, speed: 4.6 }, () => null, { w: w2 });
    expect(B.riftAt(r2.st.x, r2.st.z, P.RIFTS)).toBeNull();
  });
  it('a walk\'s bound crosses the 3.5 m rift and (from its lip) the 5 m one; from a stride back it falls short onto the near lip; the 6.5 m one needs a sprint', () => {
    const go = (f, speed, back) => {
      const z = (f.z0 + f.z1) / 2;
      const r = fly({ x: f.x0 - f.w / 2 - 0.4 - back, z, dx: 1, dz: 0, speed }, () => null);
      return { over: r.st.x > f.x0 + f.w / 2, short: r.st.x < f.x0 - f.w / 2, st: r.st };
    };
    const walk = B.boundSpeed(3.1);
    expect(go(P.RIFTS[0], walk, 0).over).toBe(true);
    expect(go(P.RIFTS[0], walk, 1.0).over).toBe(true);
    expect(go(P.RIFTS[1], walk, 0).over).toBe(true);
    expect(go(P.RIFTS[1], walk, 1.5).over).toBe(false);
    expect(go(P.RIFTS[1], walk, 1.5).short).toBe(true); // the near lip, not the trench
    expect(go(P.RIFTS[2], walk, 0).over).toBe(false);
    expect(go(P.RIFTS[2], walk, 0).short).toBe(true);
    expect(go(P.RIFTS[2], B.boundSpeed(5.6), 0).over).toBe(true);
    for (const f of P.RIFTS) for (const sp of [walk, B.boundSpeed(5.6)]) for (const back of [0, 0.8, 1.6, 3, 6]) expect(B.riftAt(go(f, sp, back).st.x, go(f, sp, back).st.z, P.RIFTS)).toBeNull();
  });
});

describe('the ring gates', () => {
  it('are five hoops of radius 1.2 m with centres 1.6 to 2.5 m over the dust, in a row west to east, clear of Dot\'s track, the colliders, the lane and each other', () => {
    expect(P.RING_GATES).toHaveLength(5);
    expect(P.RING_GATES.map((g) => g.y)).toEqual([1.6, 1.8, 2.0, 2.25, 2.5]);
    const area = build(new THREE.Scene());
    for (const [i, g] of P.RING_GATES.entries()) {
      expect(g.r).toBe(1.2);
      expect(P.trackDistance(g.x, g.z)).toBeGreaterThan(g.r + 3);
      for (const o of area.colliders) if (!P.RING_COLLIDERS.includes(o) && !area.colliders.some((q) => q === o && q.x === g.post.x && q.z === g.post.z)) expect(Math.hypot(g.x - o.x, g.z - o.z), `ring ${i} vs ${o.x},${o.z}`).toBeGreaterThan(g.r + o.r + 0.4);
      expect(Math.abs(g.z - P.JUMP_LANE.z)).toBeGreaterThan(P.JUMP_LANE.half + g.r + 2);
      if (i) expect(g.x - P.RING_GATES[i - 1].x).toBeGreaterThanOrEqual(6);
      expect(area.colliders.some((c) => c.x === g.post.x && c.z === g.post.z)).toBe(true);
    }
  });
  it('every ring can be flown through by a walk\'s bound at its apex, and the highest needs a bound near the top of its arc', () => {
    const clear = { bounds: P.MOON_BOUNDS, colliders: [], rifts: [], canStep: null };
    for (const g of P.RING_GATES) {
      const cy = ground.y(g.x, g.z) + g.y;
      // a bound along x through the middle of the hoop, its apex at the hoop (the arc's middle, 2.3 m from the start at 4.65 m/s)
      const st = B.startBound({ x: g.x - 2.4, z: g.z, dx: 1, dz: 0, speed: 4.65, T, H });
      let left = T;
      let through = false;
      let prev = { x: st.x, z: st.z, y: ground.y(st.x, st.z) };
      while (!st.landed) {
        left = Math.max(0, left - 1 / 60);
        B.stepBound(st, 1 / 60, null, clear, left);
        const y = ground.y(st.x, st.z) + B.boundY(st);
        through = through || B.throughRing(g, cy, prev.x, prev.z, prev.y, st.x, st.z, y);
        prev = { x: st.x, z: st.z, y };
      }
      expect(through, `ring at ${g.x} (${g.y} m)`).toBe(true);
    }
    // a hop that stays low (the plain 0.35 m hop) does not reach the lowest hoop's centre height, and a bound on the ground does not light it
    const g = P.RING_GATES[0];
    expect(B.throughRing(g, ground.y(g.x, g.z) + g.y, g.x - 1, g.z, 0.2, g.x + 1, g.z, 0.2)).toBe(false);
    // the plane must be crossed
    expect(B.throughRing(g, 2, g.x + 1, g.z, 2, g.x + 2, g.z, 2)).toBe(false);
    // and sideways beyond the radius misses
    expect(B.throughRing(g, 2, g.x - 1, g.z + 1.3, 2, g.x + 1, g.z + 1.3, 2)).toBe(false);
    expect(B.throughRing(g, 2, g.x - 1, g.z + 0.5, 2, g.x + 1, g.z + 0.5, 2)).toBe(true);
  });
});

describe('property tests: a thousand bounds over the real Moon', () => {
  const r = rng(7);
  const cases = [];
  while (cases.length < 1000) {
    const x = P.MOON_BOUNDS.minX + 2 + r() * (P.MOON_BOUNDS.maxX - P.MOON_BOUNDS.minX - 4);
    const z = P.MOON_BOUNDS.minZ + 2 + r() * (P.MOON_BOUNDS.maxZ - P.MOON_BOUNDS.minZ - 4);
    if (!free(x, z)) continue;
    const a = r() * Math.PI * 2;
    cases.push({ x, z, dx: Math.cos(a), dz: Math.sin(a), speed: B.boundSpeed(2.4 + r() * 3.6), steer: r() < 0.6, seed: Math.floor(r() * 1e9), hh: r() < 0.3 ? 3.6 : H });
  }
  // some near the rifts and the edges, where it matters
  for (let i = 0; i < 300; i++) {
    const f = P.RIFTS[i % 3];
    const side = i % 2 ? 1 : -1;
    const dist = f.w / 2 + 0.6 + r() * 7;
    const x = f.x0 + side * dist;
    const z = f.z0 + (f.z1 - f.z0) * r();
    if (!free(x, z)) continue;
    const a = (side > 0 ? Math.PI : 0) + (r() - 0.5) * 1.2;
    cases.push({ x, z, dx: Math.cos(a), dz: Math.sin(a), speed: B.boundSpeed(2.4 + r() * 3.6), steer: r() < 0.5, seed: Math.floor(r() * 1e9), hh: H });
  }
  for (let i = 0; i < 100; i++) {
    const x = r() < 0.5 ? P.MOON_BOUNDS.minX + 1.5 : P.MOON_BOUNDS.maxX - 1.5;
    const z = P.MOON_BOUNDS.minZ + 2 + r() * 96;
    if (!free(x, z)) continue;
    const a = r() * Math.PI * 2;
    cases.push({ x, z, dx: Math.cos(a), dz: Math.sin(a), speed: B.boundSpeed(5 + r() * 2), steer: false, seed: 1, hh: H });
  }
  const run = (c) => {
    const g = rng(c.seed);
    const stick = c.steer ? () => (g() < 0.5 ? { x: g() * 2 - 1, z: g() * 2 - 1 } : null) : () => null;
    return fly(c, (n) => (n % 4 === 0 ? stick() : null), { H: c.hh });
  };
  it('never leave the bounds and never enter a collider\'s margin (a rift\'s flown over), on any frame', () => {
    for (const c of cases) {
      const { frames } = run(c);
      for (const f of frames) {
        expect(f.x).toBeGreaterThanOrEqual(P.MOON_BOUNDS.minX);
        expect(f.x).toBeLessThanOrEqual(P.MOON_BOUNDS.maxX);
        expect(f.z).toBeGreaterThanOrEqual(P.MOON_BOUNDS.minZ);
        expect(f.z).toBeLessThanOrEqual(P.MOON_BOUNDS.maxZ);
        for (const o of P.MOON_COLLIDERS) if (!o.rift && Math.hypot(f.x - o.x, f.z - o.z) < o.r + 0.35 - 1e-6) throw new Error(`inside a collider at ${f.x},${f.z}: ${JSON.stringify(c)}`);
      }
    }
  });
  it('always land: the height is never below 0 or above the arc, it is 0 on the last frame, and the flight is over within the window plus the ease', () => {
    for (const c of cases) {
      const { st, frames, n } = run(c);
      expect(st.landed).toBe(true);
      expect(B.boundY(st)).toBe(0);
      expect(n).toBeLessThanOrEqual(Math.ceil((T + B.BOUND.ease) * FPS) + 4);
      for (const f of frames) { expect(f.y).toBeGreaterThanOrEqual(0); expect(f.y).toBeLessThanOrEqual(c.hh + 1e-9); }
      expect(frames[frames.length - 1].y).toBe(0);
    }
  });
  it('never land inside a rift\'s lip, and never come to rest over a trench', () => {
    let nearRift = 0;
    for (const c of cases) {
      const { st } = run(c);
      expect(B.riftAt(st.x, st.z, P.RIFTS), JSON.stringify(c)).toBeNull();
      if (P.RIFTS.some((f) => B.axisPoint(f, c.x, c.z).d < f.w / 2 + 8)) nearRift++;
    }
    expect(nearRift).toBeGreaterThan(250);
  });
  it('a bound that begins where no perch is in reach never lands on one; the rule never names a perch beyond any budget, and is alive (it names one it should)', () => {
    const area = build(new THREE.Scene());
    const budgets = [placeBudget({}, 'moon'), placeBudget({ skills: ['spring-paws'] }, 'moon'), placeBudget({ skills: ['sure-claws'] }, 'moon'), placeBudget({ skills: ['spring-paws', 'sure-claws'] }, 'moon')];
    const g = rng(99);
    let begun = 0;
    for (const c of cases) {
      const bud = budgets[Math.floor(g() * 4)];
      const stateOf = { skills: [] };
      const next = bestPerch(area.perches, { x: c.x, z: c.z }, 0, null, bud, { ground, state: stateOf });
      const { st } = run(c);
      const lp = B.landingPerch(area.perches, { x: c.x, z: c.z }, st, bud, ground);
      if (lp) expect(canReach(lp, { x: c.x, z: c.z }, 0, bud, ground.y(lp.x, lp.z) - ground.y(c.x, c.z)), 'a perch beyond the budget').toBe(true);
      if (!next) { begun++; expect(lp, `landed on a perch the press could not take: ${JSON.stringify(c)}`).toBeNull(); }
    }
    expect(begun).toBeGreaterThan(900);
    // alive: a perch she is over and could take from where she began is named (the highest of two)
    const perches = [{ x: 3, z: 0, y: 1, r: 1, kind: 'stone' }, { x: 3.2, z: 0.2, y: 2, r: 1, kind: 'stone' }, { x: 30, z: 0, y: 1, r: 1, kind: 'stone' }];
    expect(B.landingPerch(perches, { x: 0, z: 0 }, { x: 3, z: 0 }, budgets[0], null)).toBe(perches[1]);
    expect(B.landingPerch(perches, { x: 0, z: 0 }, { x: 30, z: 0 }, budgets[0], null)).toBeNull(); // over it but 30 m from the take-off: beyond the reach
    expect(B.landingPerch(perches, { x: 0, z: 0 }, { x: 3, z: 6 }, budgets[0], null)).toBeNull(); // not over any
  });
});

describe('moonY (the bound\'s height) is read only by the rings and the board', () => {
  const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
  const files = walk('src');
  const src = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
  it('only the bound\'s own files and the Moon\'s life (which hands the board its reader) name boundY', () => {
    const who = files.filter((f) => /\bboundY\b/.test(src.get(f))).map((f) => f.replace(/^src\//, '')).sort();
    expect(who).toEqual(['world/moonbound.js', 'world/moonboundlive.js', 'world/moonlife.js']);
  });
  it('nothing that reads perchY, the finds or the mice imports the bound, and nothing outside the Moon\'s files names its files', () => {
    for (const f of files) {
      const s = src.get(f);
      if (/moonbound/.test(s) && !/^src\/world\/moon/.test(f)) throw new Error(`${f} names the bound`);
    }
    for (const f of ['src/world/moonfinds.js', 'src/world/moonfindparts.js', 'src/world/moonbaselive.js', 'src/goldmice.js', 'src/game/interactions.js', 'src/climbing.js']) {
      expect(/moonbound|boundY/.test(src.get(f)), f).toBe(false);
    }
    // the board reads the height through a function it is handed (`air`), never the bound's module
    expect(src.get('src/world/moonjumplive.js')).not.toMatch(/moonbound/);
    expect(src.get('src/world/moonjumplive.js')).toMatch(/air\(\)/);
  });
  it('the bound\'s files import only three, the Moon\'s own files, the walk\'s pure rules (player, placephysics, climbing), the phrase table and the bus', () => {
    for (const f of ['moonbound', 'moonboundparts', 'moonboundlive', 'moonswitch']) {
      const s = src.get(`src/world/${f}.js`);
      for (const m of s.matchAll(/^import .*?from '(.+?)';/gm)) expect(m[1], `${f}: ${m[1]}`).toMatch(/^(three|\.\/moon[a-z]*\.js|\.\.\/(clanphrases|events|player|placephysics|climbing)\.js)$/);
    }
  });
});

describe('the switch: MOON_BOUND_ON false is exactly milestone 7a', () => {
  it('on: the courses, the colliders and the keep-outs are there', () => {
    expect(P.MOON_BOUND_ON).toBe(true);
    expect(P.RIFTS.length).toBe(3);
    expect(P.RING_GATES.length).toBe(5);
    expect(P.RIFT_COLLIDERS.length + P.RING_COLLIDERS.length).toBeGreaterThan(20);
  });
  it('off: no rift, no ring, no collider of them, the 7a rock keep-outs, nothing drawn, nothing hung on the walk', async () => {
    vi.resetModules();
    vi.doMock('../src/world/moonswitch.js', () => ({ MOON_BOUND_ON: false }));
    try {
      const Poff = await import('../src/world/moonplan.js');
      expect(Poff.MOON_BOUND_ON).toBe(false);
      expect(Poff.RIFTS).toEqual([]);
      expect(Poff.RING_GATES).toEqual([]);
      expect(Poff.RIFT_COLLIDERS).toEqual([]);
      expect(Poff.RING_COLLIDERS).toEqual([]);
      expect(Poff.MOON_COLLIDERS.some((c) => c.rift)).toBe(false);
      expect(Poff.MOON_COLLIDERS.length).toBe(P.MOON_COLLIDERS.length - P.RIFT_COLLIDERS.length - P.RING_COLLIDERS.length);
      expect(Poff.ROCK_KEEP_OUT.length).toBe(P.ROCK_KEEP_OUT.length - 4);
      // the kit and the life
      const { build: buildOff } = await import('../src/world/moon.js');
      const scene = new THREE.Scene();
      const area = buildOff(scene);
      expect(scene.getObjectByName('moon:rings')).toBeUndefined();
      expect(area.colliders.some((c) => c.rift)).toBe(false);
    } finally {
      vi.doUnmock('../src/world/moonswitch.js');
      vi.resetModules();
    }
  });
});

describe('the record: hostile jump saves are clamped, and a longer bound of one cat merges per cat (the keys are milestone 0\'s; M7a\'s tests hold the rest)', () => {
  const fresh = (over = {}) => sanitizeSave({ version: 4, ...over });
  it('the save keeps whole centimetres 0 to 2000, plain cat ids only, six cats at most, whatever it is handed (a bound can reach 9.4 m, never 21 m)', () => {
    const m = fresh({ moon: { jump: { tabby: 912.9, 'x y': 5, big: 99999, neg: -4, nan: NaN, str: '800', obj: { a: 1 } } } }).moon.jump;
    expect(m.tabby).toBe(912);
    expect(m.big).toBe(2000);
    expect(Object.hasOwn(m, 'x y')).toBe(false);
    for (const k of ['neg', 'nan', 'str', 'obj']) expect(m[k] ?? 0).toBe(0);
    expect(Object.keys(fresh({ moon: { jump: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`cat${i}`, 100])) } }).moon.jump)).toHaveLength(6);
    for (const bad of [null, [], 'x', 7, true]) expect(fresh({ moon: { jump: bad } }).moon.jump).toEqual({});
  });
  it('a bound of 9.4 m is a record of 940 cm for the cat that made it; a shorter one keeps the best; a hostile in-memory record is never copied on', () => {
    expect(J.improve({ jump: { tabby: 700 } }, 'tabby', 940)).toMatchObject({ record: true, kept: true, moon: { jump: { tabby: 940 } } });
    expect(J.improve({ jump: { tabby: 940 } }, 'tabby', 900)).toMatchObject({ record: false, kept: false });
    const r = J.improve({ jump: { tabby: 700, evil: 1e9, 'a b': 4, nan: NaN } }, 'tabby', 940);
    expect(r.moon.jump).toEqual({ tabby: 940, evil: 2000 });
  });
  it('two devices\' saves merge per cat to the longer of each, either way round', () => {
    const a = fresh({ moon: { jump: { tabby: 940, ginger: 300 } } });
    const b = fresh({ moon: { jump: { tabby: 700, ginger: 480, tux: 520 } } });
    const want = { tabby: 940, ginger: 480, tux: 520 };
    expect(mergeSaves({ local: a, cloud: b }).save.moon.jump).toEqual(want);
    expect(mergeSaves({ local: b, cloud: a }).save.moon.jump).toEqual(want);
  });
});
