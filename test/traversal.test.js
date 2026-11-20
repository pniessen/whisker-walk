import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
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

it('WALK_SPEED is the player’s walk pace', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  expect(src).toContain(`let pace = ${T.WALK_SPEED};`);
});

it('wrapPi gives the shortest signed angle, in (-PI, PI]', () => {
  expect(T.wrapPi(0)).toBe(0);
  expect(T.wrapPi(Math.PI)).toBeCloseTo(Math.PI, 12);
  expect(T.wrapPi(-Math.PI)).toBeCloseTo(Math.PI, 12);
  expect(T.wrapPi(1.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 12);
  expect(T.wrapPi(-1.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI, 12);
  expect(T.wrapPi(7)).toBeCloseTo(7 - 2 * Math.PI, 12);
  for (let a = -20; a <= 20; a += 0.37) {
    const d = T.wrapPi(a);
    expect(d).toBeGreaterThan(-Math.PI);
    expect(d).toBeLessThanOrEqual(Math.PI);
    expect(Math.cos(d)).toBeCloseTo(Math.cos(a), 9); expect(Math.sin(d)).toBeCloseTo(Math.sin(a), 9);
  }
});

describe('mounting', () => {
  const t = T.createTraversal({ crossings: [plank] }, level);
  const out = { crossing: null, end: 0, u: 0 };
  it('mounts at an end when the stick points onto the crossing', () => {
    expect(T.crossingToMount(t, -2.7, 0.1, 3, 1, 0, out)).toBe(out);
    expect(out).toMatchObject({ crossing: t.crossings[0], end: 0 });
    expect(out.u).toBe(0); // behind the end: clamped
  });
  it('mounts at the far end, measuring from the length', () => {
    expect(T.crossingToMount(t, 2.3, 0, 3, -1, 0, out)).toBe(out);
    expect(out.end).toBe(1);
    expect(out.u).toBeCloseTo(t.crossings[0].length - 0.1, 12);
  });
  it.each([['pushing away', -1, 0], ['sideways', 0, 1], ['no push', 0, 0], ['a faint push', 0.1, 0]])('does not mount %s', (_, dx, dz) =>
    expect(T.crossingToMount(t, -2.6, 0, 3, dx, dz, out)).toBeNull());
  it('does not mount from another level', () => expect(T.crossingToMount(t, -2.6, 0, 0, 1, 0, out)).toBeNull());
  it('does not mount from farther than MOUNT_R', () => expect(T.crossingToMount(t, -2.4 - T.MOUNT_R - 0.05, 0, 3, 1, 0, out)).toBeNull());
  it('takes the nearer of two ends', () => {
    const two = T.createTraversal({ crossings: [plank, { ...plank, id: 'q', points: [{ x: -2.2, z: 0.3, y: 3 }, { x: 2.4, z: 0.3, y: 3 }] }] }, level);
    expect(T.crossingToMount(two, -2.3, 0.3, 3, 1, 0, out)).toBe(out);
    expect(out.crossing.id).toBe('q');
  });
});

describe('balanceStep', () => {
  const c = T.createTraversal({ crossings: [plank] }, level).crossings[0];
  it('never goes faster than the careful walk, and Tightrope Tail is quicker', () => {
    const st = { u: 1, v: 0 };
    for (let i = 0; i < 600; i++) { T.balanceStep(st, c, 1, 1 / 60, false); expect(Math.abs(st.v)).toBeLessThanOrEqual(T.BALANCE_SPEED); if (st.u >= c.length) break; }
    const st2 = { u: 1, v: 0 }; for (let i = 0; i < 60; i++) T.balanceStep(st2, c, 1, 1 / 60, true);
    expect(st2.v).toBeGreaterThan(T.BALANCE_SPEED);
    expect(st2.v).toBeLessThanOrEqual(T.TIGHTROPE_SPEED);
  });
  it('ignores a push under the dead zone', () => { const st = { u: 2, v: 0 }; T.balanceStep(st, c, T.ALONG_DEAD - 0.01, 0.1, false); expect(st).toEqual({ u: 2, v: 0 }); });
  it('eases toward the target speed', () => {
    const st = { u: 2, v: 0 };
    expect(T.balanceStep(st, c, 1, 0.1, false)).toBeNull();
    const k = 1 - Math.exp(-T.BALANCE_EASE * 0.1);
    expect(st.v).toBeCloseTo(T.BALANCE_SPEED * k, 12);
    expect(st.u).toBeCloseTo(2 + st.v * 0.1, 12);
  });
  it('steps off only when pushed out past an end', () => {
    const st = { u: 0.01, v: -1 };
    expect(T.balanceStep(st, c, 0, 0.1, false)).toBeNull(); expect(st.u).toBe(0); expect(st.v).toBe(0); // let go at the end: stays on
    expect(T.balanceStep(st, c, -1, 0.1, false)).toBe(0);
    const far = { u: c.length - 0.01, v: 1 }; expect(T.balanceStep(far, c, 1, 0.1, false)).toBe(1);
    expect(far.u).toBe(c.length);
  });
});

describe('spotFor', () => {
  const rooftops = createGround({ strips: [
    { x0: -6, z0: 0, x1: -2, z1: 0, width: 4, y0: 3 }, { x0: 2, z0: 0, x1: 6, z1: 0, width: 4, y0: 3 },
  ] });
  const gap = (id, x0, z0, x1, z1, more = {}) => ({ id, from: { x: x0, z: z0 }, to: { x: x1, z: z1 }, ...more });
  const out = { hop: null, look: false };
  const base = T.BASE_ABILITIES;
  it('picks the nearest take-off', () => {
    const t = T.createTraversal({ gaps: [gap('far', -3, 0.5, 2.3, 0.5), gap('near', -3, 0, 2.3, 0)] }, rooftops);
    expect(T.spotFor(t, -3, 0.1, 3, 0, 0, base, out)).toBe(out);
    expect(out.hop.id).toBe('near');
    expect(out.look).toBe(false);
  });
  it('lets facing break a tie, and the earlier hop win an exact tie', () => {
    const t = T.createTraversal({ gaps: [gap('east', -3, 0, 2.3, 0), gap('west', -3, 0, -3, 1.4)] }, rooftops);
    T.spotFor(t, -3, 0, 3, 1, 0, base, out); expect(out.hop.id).toBe('east');
    T.spotFor(t, -3, 0, 3, 0, 1, base, out); expect(out.hop.id).toBe('west');
    T.spotFor(t, -3, 0, 3, 0, 0, base, out); expect(out.hop.id).toBe('east');
  });
  it('ignores another level and anything beyond SPOT_R', () => {
    const t = T.createTraversal({ gaps: [gap('g', -3, 0, 2.3, 0)] }, rooftops);
    expect(T.spotFor(t, -3, 0, 0, 1, 0, base, out)).toBeNull();
    expect(T.spotFor(t, -3, T.SPOT_R + 0.05, 3, 1, 0, base, out)).toBeNull();
  });
  it('shows a gated gap as a look until Long Leap, then as a hop', () => {
    const t = T.createTraversal({ gaps: [gap('g', -2, 0, 2, 0, { requires: T.LONG_LEAP_ID })] }, rooftops);
    T.spotFor(t, -2, 0, 3, 1, 0, base, out); expect(out.look).toBe(true);
    T.spotFor(t, -2, 0, 3, 1, 0, { ...base, longLeap: true }, out); expect(out.look).toBe(false);
  });
  it('shows a 1.5 m climb as a look at climb 1.0 and a hop at 2.2', () => {
    const low = createGround({ strips: [{ x0: -4, z0: 0, x1: 0, z1: 0, width: 4, y0: 0 }, { x0: 0, z0: 0, x1: 4, z1: 0, width: 4, y0: 1.5 }] });
    const lt = T.createTraversal({ climbs: [{ id: 'c', from: { x: -0.8, z: 0 }, to: { x: 0.6, z: 0 } }] }, low);
    T.spotFor(lt, -0.8, 0, 0, 1, 0, { ...base, climb: 1.0 }, out); expect(out.look).toBe(true);
    T.spotFor(lt, -0.8, 0, 0, 1, 0, { ...base, climb: 2.2 }, out); expect(out.look).toBe(false);
  });
  it('prefers a usable spot to a look within SPOT_R', () => {
    const t = T.createTraversal({ gaps: [gap('look', -3, 0, 2.3, 0, { requires: T.LONG_LEAP_ID }), gap('use', -3, 0.7, 2.3, 0.7)] }, rooftops);
    T.spotFor(t, -3, 0, 3, 1, 0, base, out);
    expect(out.hop.id).toBe('use'); expect(out.look).toBe(false);
  });
});

describe('planHop and hopAt', () => {
  // a 3.3 m level leap between two roofs, from a press 0.6 m behind the take-off
  const roofs = createGround({ strips: [
    { x0: -6, z0: 0, x1: -2, z1: 0, width: 4, y0: 3 }, { x0: 1.3, z0: 0, x1: 6, z1: 0, width: 4, y0: 3 },
  ] });
  const leap = T.createTraversal({ gaps: [{ id: 'g', from: { x: -2, z: 0 }, to: { x: 1.3, z: 0 } }] }, roofs).hops[0];
  const plan = (hop = leap, rm = false) => T.planHop(hop, hop.x0 - 0.6, hop.z0, rm, {});
  const pt = () => ({ x: 0, y: 0, z: 0, phase: '', s: 0, onGround: false, tau: 0 });

  it('times the plan from the table', () => {
    const p = plan();
    expect(p).toMatchObject({ hop: leap, sx: -2.6, sz: 0, crouch: T.HOP.leap.crouch, land: T.HOP.leap.land, hang: T.HOP.leap.hang });
    expect(p.air).toBeCloseTo(T.HOP.leap.air + T.HOP.leap.airPerM * leap.dist, 12);
    expect(p.total).toBeCloseTo(p.crouch + p.air + p.land, 12);
    const r = plan(leap, true);
    expect(r).toMatchObject({ land: T.HOP.leap.landRM, hang: 0, air: p.air });
    // reduced motion's short crouch, but never a glide faster than her walk (0.6 m here)
    expect(r.crouch).toBeCloseTo(Math.max(T.HOP.leap.crouchRM, (1.5 * 0.6) / T.WALK_SPEED), 12);
    expect(r.crouch).toBeLessThan(p.crouch);
  });
  it('stretches the crouch for a big turn or a long glide, so neither outruns her', () => {
    const base = plan(); // 0.6 m glide, no turn: the table's crouch
    expect(base.crouch).toBe(T.HOP.leap.crouch);
    for (const rm of [false, true]) {
      const floor = rm ? T.HOP.leap.crouchRM : T.HOP.leap.crouch;
      const turn = T.planHop(leap, leap.x0 - 0.6, leap.z0, rm, {}, -2.4);
      expect(turn.crouch).toBeCloseTo(Math.max(floor, (1.5 * 2.4) / T.TURN_RATE), 12);
      const glide = T.planHop(leap, leap.x0, leap.z0 + 0.9, rm, {});
      expect(glide.crouch).toBeCloseTo(Math.max(floor, (1.5 * 0.9) / T.WALK_SPEED), 12);
      expect(turn.total).toBeCloseTo(turn.crouch + turn.air + turn.land, 12);
    }
    // a climb's short crouch is the one that stretches
    const up = createGround({ strips: [{ x0: -4, z0: 0, x1: 0, z1: 0, width: 4, y0: 0 }, { x0: 0, z0: 0, x1: 4, z1: 0, width: 4, y0: 1.5 }] });
    const climb = T.createTraversal({ climbs: [{ id: 'c', from: { x: -0.8, z: 0 }, to: { x: 0.6, z: 0 } }] }, up).hops[0];
    const c = T.planHop(climb, climb.x0 - 0.9, climb.z0, false, {}, Math.PI);
    expect(c.crouch).toBeCloseTo((1.5 * Math.PI) / T.TURN_RATE, 12);
    expect(c.air).toBe(T.planHop(climb, climb.x0, climb.z0, false, {}).air); // the arc is the same
  });
  it('times a drop by its fall, not its reach', () => {
    const g = createGround({ strips: [{ x0: -6, z0: 0, x1: -2, z1: 0, width: 4, y0: 3 }, { x0: -2, z0: 0, x1: 2, z1: 0, width: 4, y0: 1 }] });
    const drop = T.createTraversal({ drops: [{ id: 'd', from: { x: -2.2, z: 0 }, to: { x: -1, z: 0 } }] }, g).hops[0];
    expect(plan(drop).air).toBeCloseTo(T.HOP.drop.air + T.HOP.drop.airPerM * 2, 12);
  });
  it('glides to the take-off, flies, lands, and ends exactly on the landing spot', () => {
    const p = plan(); const o = pt();
    T.hopAt(p, 0, o); expect([o.phase, o.x, o.y, o.onGround, o.s]).toEqual(['crouch', -2.6, leap.y0, true, 0]);
    T.hopAt(p, p.crouch / 2, o); expect(o.x).toBeCloseTo(-2.3, 12); // smoothstep midpoint
    T.hopAt(p, p.crouch + p.air / 2, o);
    expect(o.phase).toBe('air'); expect(o.onGround).toBe(false);
    expect(o.y).toBeCloseTo(leap.y0 + leap.apex, 12); expect(o.x).toBeCloseTo((leap.x0 + leap.x1) / 2, 12);
    T.hopAt(p, p.crouch + p.air + p.land / 2, o);
    expect([o.phase, o.x, o.y, o.z, o.onGround]).toEqual(['land', leap.x1, leap.y1, leap.z1, true]);
    expect(o.tau).toBeCloseTo(0.5, 12);
    const seen = []; for (let e = 0; e <= p.total + 0.1; e += 0.01) { T.hopAt(p, e, o); if (seen[seen.length - 1] !== o.phase) seen.push(o.phase); }
    expect(seen).toEqual(['crouch', 'air', 'land', 'done']);
    T.hopAt(p, p.total + 5, o);
    expect(o.x).toBe(leap.x1); expect(o.y).toBe(leap.y1); expect(o.z).toBe(leap.z1);
  });
  it('hangs at the top unless motion is reduced', () => {
    const share = (rm) => { const p = plan(leap, rm); const o = pt(); let n = 0; const N = 1000;
      for (let i = 0; i < N; i++) { T.hopAt(p, p.crouch + (i + 0.5) / N * p.air, o); if (o.s >= 0.4 && o.s <= 0.6) n++; } return n / N; };
    expect(share(false)).toBeGreaterThan(0.26);
    expect(share(true)).toBeLessThan(0.22);
    const a = plan(), b = plan(leap, true); const oa = pt(), ob = pt();
    expect(b.air).toBe(a.air); expect(b.crouch).toBeLessThan(a.crouch); expect(b.land).toBeLessThan(a.land);
    T.hopAt(a, a.crouch + a.air * 0.5, oa); T.hopAt(b, b.crouch + b.air * 0.5, ob);
    expect(oa.s).toBeCloseTo(0.5, 12); expect(ob.s).toBeCloseTo(0.5, 12);
    expect(ob.y).toBeCloseTo(oa.y, 12); // same arc points for equal s
  });
  it('a climb arrives from above and a drop leaves with a little rise', () => {
    // rate of change of y with s, read by differencing the air phase
    const slope = (hop, s) => { const p = plan(hop); const o = pt(); const h = 1e-6;
      const y = (w) => { T.hopAt(p, p.crouch + p.air * w, o); return o.y; };
      return (y(s + h) - y(s - h)) / (2 * h); };
    const up = createGround({ strips: [{ x0: -4, z0: 0, x1: 0, z1: 0, width: 4, y0: 0 }, { x0: 0, z0: 0, x1: 4, z1: 0, width: 4, y0: 1.5 }] });
    const climb = T.createTraversal({ climbs: [{ id: 'c', from: { x: -0.8, z: 0 }, to: { x: 0.6, z: 0 } }] }, up).hops[0];
    expect(slope(climb, 0.999)).toBeLessThan(0);
    const down = createGround({ strips: [{ x0: -6, z0: 0, x1: -2, z1: 0, width: 4, y0: 3 }, { x0: -2, z0: 0, x1: 2, z1: 0, width: 4, y0: 1 }] });
    const t = T.createTraversal({ drops: [{ id: 'd', from: { x: -2.2, z: 0 }, to: { x: -1, z: 0 } }], gaps: [{ id: 'g', from: { x: -2.2, z: 0 }, to: { x: 0.2, z: 0 } }] }, down);
    expect(t.hops.map((h) => h.dy)).toEqual([-2, -2]);
    for (const h of t.hops) expect(slope(h, 0.001)).toBeGreaterThanOrEqual(0);
  });
  it('a frame of 0 changes nothing', () => {
    const p = plan(); const a = pt(), b = pt();
    for (const e of [0, 0.3, p.crouch + 0.2, p.total - 0.01, p.total + 1]) {
      T.hopAt(p, e, a); T.hopAt(p, e, b);
      expect(b).toEqual(a);
    }
    T.hopAt(p, p.crouch + 0.1, a); const first = { ...a }; T.hopAt(p, p.crouch + 0.1, a);
    expect(a).toEqual(first);
  });
});

describe('yaw and stick helpers', () => {
  it('stickToWorld is three’s applyAxisAngle about +y', () => {
    for (const [sx, sz, yaw] of [[0, -1, 0], [1, 0, 0.7], [0.6, -0.8, -2.1], [-0.3, 0.4, 3.0]]) {
      const v = new THREE.Vector3(sx, 0, sz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const o = T.stickToWorld(sx, sz, yaw, { x: 0, z: 0 });
      expect(o.x).toBeCloseTo(v.x, 12); expect(o.z).toBeCloseTo(v.z, 12);
    }
  });
  it('facingYaw is player.js’s rotation.y for a heading', () => {
    expect(T.facingYaw(0, 1)).toBeCloseTo(Math.PI, 12);
    expect(T.facingYaw(0, -1)).toBeCloseTo(2 * Math.PI, 12); // 0, mod 2π
    expect(T.facingYaw(1, 0)).toBeCloseTo(1.5 * Math.PI, 12);
  });
  it('behindYaw is facingYaw, mod 2π, and 0 for a cat facing north', () => {
    expect(T.behindYaw(0, -1)).toBe(0);
    const mod = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    for (const [fx, fz] of [[1, 0], [0.6, 0.8], [-0.7, 0.2], [0.1, -0.9]]) {
      const d = Math.abs(mod(T.behindYaw(fx, fz)) - mod(T.facingYaw(fx, fz)));
      expect(Math.min(d, 2 * Math.PI - d)).toBeCloseTo(0, 12);
    }
  });
  it('easeYawToward goes the short way, never faster than max, and holds at dt 0', () => {
    expect(T.easeYawToward(3.0, -3.0, 0, 5, 1)).toBe(3.0);
    const n = T.easeYawToward(3.0, -3.0, 0.1, 5, 1); expect(n).toBeGreaterThan(3.0); expect(n - 3.0).toBeLessThanOrEqual(0.1 + 1e-12);
    expect(T.easeYawToward(-3.0, 3.0, 0.1, 5, 1)).toBeLessThan(-3.0);
    expect(T.easeYawToward(0, 1, 0.1, 5, 100)).toBeCloseTo(1 - Math.exp(-0.5), 12);
  });
});
