import { describe, it, expect } from 'vitest';
import { createGround } from '../src/ground.js';
import * as T from '../src/traversal.js';
const level = createGround({ strips: [
  { x0: -6, z0: 0, x1: -2, z1: 0, width: 4, y0: 3 },   // roof A, x -6..-2
  { x0: 2, z0: 0, x1: 6, z1: 0, width: 4, y0: 3 },     // roof B, x 2..6
] });
const plank = { id: 'p', kind: 'plank', points: [{ x: -2.4, z: 0, y: 3 }, { x: 2.4, z: 0, y: 3 }] };
const ctx = { ground: level, bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } };

describe('createTraversal', () => {
  it('measures a crossing and its ends', () => {
    const t = T.createTraversal({ crossings: [plank] }, level);
    const c = t.crossings[0];
    expect(c.length).toBeCloseTo(4.8, 12);
    expect(c.ends[0]).toMatchObject({ x: -2.4, z: 0, y: 3, inX: 1, inZ: 0 });
    expect(c.ends[1]).toMatchObject({ x: 2.4, inX: -1 });
    expect(Object.isFrozen(c)).toBe(true);
  });
  it('crossingPoint walks the rail and returns its out', () => {
    const c = T.createTraversal({ crossings: [{ ...plank, points: [{ x: -2.4, z: 0, y: 3 }, { x: 0, z: 0, y: 2.7 }, { x: 2.4, z: 0, y: 3 }] }] }, level).crossings[0];
    const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0, grade: 0 };
    expect(T.crossingPoint(c, 2.4, out)).toBe(out);
    expect(out.y).toBeCloseTo(2.7, 12);
    T.crossingPoint(c, 1.2, out);
    expect(out).toMatchObject({ tx: 1, tz: 0 });
    expect(out.grade).toBeCloseTo(-0.125, 12);
    T.crossingPoint(c, -5, out); expect(out.x).toBe(-2.4);  // clamped
    T.crossingPoint(c, 99, out); expect(out.x).toBe(2.4);
  });
  it('takes a hop’s heights from the ground and lifts its apex until the arc clears', () => {
    const wall = createGround({ strips: [
      { x0: -4, z0: 0, x1: 0, z1: 0, width: 4, y0: 0 }, { x0: 0, z0: 0, x1: 4, z1: 0, width: 4, y0: 1.5 },
    ] });
    const t = T.createTraversal({ climbs: [{ id: 'c', from: { x: -0.8, z: 0 }, to: { x: 0.6, z: 0 } }] }, wall);
    const h = t.hops[0];
    expect([h.y0, h.y1, h.kind]).toEqual([0, 1.5, 'climb']);
    expect(T.arcClears(h, h.apex, wall)).toBe(true);
    expect(T.arcClears(h, h.apex - T.APEX_STEP, wall)).toBe(false);
  });
  it('orders hops gaps, climbs, drops', () => {
    const t = T.createTraversal({ drops: [{ id: 'd', from: { x: -2.4, z: 0 }, to: { x: -2.4, z: 1.5 } }],
      climbs: [{ id: 'c', from: { x: -2.4, z: 1.5 }, to: { x: -2.4, z: 0 } }], gaps: [{ id: 'g', from: { x: -2.4, z: 0 }, to: { x: 2.4, z: 0 } }] }, level);
    expect(t.hops.map((h) => h.id)).toEqual(['g', 'c', 'd']);
  });
});

describe('validateTraversal', () => {
  // `tall`: roof A at 3, a pit at 0, and roof C at 6.5 so a 3.5 m drop and a 2.4 m climb can be written
  const tall = createGround({ strips: [
    { x0: -6, z0: 0, x1: -2, z1: 0, width: 4, y0: 3 }, { x0: 2, z0: 0, x1: 6, z1: 0, width: 4, y0: 3 },
    { x0: -6, z0: 4, x1: -2, z1: 4, width: 4, y0: 6.5 }, { x0: -6, z0: -4, x1: -2, z1: -4, width: 4, y0: 5.4 },
  ] });
  const tctx = { ...ctx, ground: tall };
  const gap = (from, to, more = {}) => ({ gaps: [{ id: 'g', from, to, ...more }] });
  it('passes a good plank', () => expect(T.validateTraversal({ crossings: [plank] }, ctx)).toEqual([]));
  it.each([
    ['an end off the ground', { crossings: [{ ...plank, points: [{ x: -2.4, z: 0, y: 3.3 }, { x: 2.4, z: 0, y: 3 }] }] }, 'crossing p: end 0 is off the ground'],
    ['a rail under the ground', { crossings: [{ ...plank, points: [{ x: -2.4, z: 0, y: 3 }, { x: -3.6, z: 0, y: 2.8 }, { x: -2.2, z: 0.5, y: 3 }] }] }, 'crossing p: goes under the ground'],
    ['too steep', { crossings: [{ ...plank, points: [{ x: -2.4, z: 0, y: 3 }, { x: -1, z: 0, y: 3 }, { x: 0, z: 0, y: 4 }, { x: 1, z: 0, y: 3 }, { x: 2.4, z: 0, y: 3 }] }] }, 'crossing p: is steeper than 1 in 3'],
    ['a short gap with requires', gap({ x: -2.4, z: 0 }, { x: -4.4, z: 0 }, { requires: T.LONG_LEAP_ID }), 'gap g: needs no Long Leap'],
    ['a wide gap without it', gap({ x: -2.1, z: 0 }, { x: 2.1, z: 0 }), 'gap g: is wider than 3.5 m without Long Leap'],
    ['too wide even with it', gap({ x: -3, z: 0 }, { x: 3, z: 0 }, { requires: T.LONG_LEAP_ID }), 'gap g: is wider than 4.5 m'],
    ['a drop of 3.5 m', { drops: [{ id: 'd', from: { x: -4, z: 2.4 }, to: { x: -4, z: 1.6 } }] }, 'drop d: falls more than 3 m'],
    ['a climb of 2.4 m', { climbs: [{ id: 'c', from: { x: -4, z: -1.6 }, to: { x: -4, z: -2.4 } }] }, 'climb c: rises more than 2.2 m'],
    ['a spot in a collider', gap({ x: -2.4, z: 0 }, { x: 2.4, z: 0 }), 'gap g: is inside a collider', { colliders: [{ x: -2.6, z: 0, r: 0.3 }] }],
    ['a duplicate id', { crossings: [{ ...plank, id: 'g' }], ...gap({ x: -2.4, z: 1 }, { x: 2.4, z: 1 }) }, 'gap g: duplicate id'],
    ['an unknown kind', { crossings: [{ ...plank, kind: 'rope' }] }, 'crossing p: unknown kind'],
    ['a NaN', { crossings: [{ ...plank, points: [{ x: -2.4, z: 0, y: NaN }, { x: 2.4, z: 0, y: 3 }] }] }, 'crossing p: has a non-finite number'],
  ])('flags %s', (_, spec, message, more = {}) => expect(T.validateTraversal(spec, { ...tctx, ...more })).toContain(message));
});

describe('moveAbilities', () => {
  it('is the base set for any save until step 4 adds the two skills', () => {
    expect(T.moveAbilities({})).toEqual(T.BASE_ABILITIES);
    expect(T.moveAbilities({ skills: ['long-leap', 'tightrope-tail'] })).toEqual(T.BASE_ABILITIES); // unknown ids fail closed
    expect(T.moveAbilities(null)).toEqual(T.BASE_ABILITIES);
  });
  it('climbs on Spring Paws’ budget', () => expect(T.moveAbilities({ skills: ['spring-paws'] }).climb).toBe(2.2));
});

it('SPOT_BODY is the player’s CAT_RADIUS', async () => {
  // player.js needs the document stub: read the number from source instead
  const src = (await import('node:fs')).readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  expect(src).toContain(`export const CAT_RADIUS = ${T.SPOT_BODY};`);
});
