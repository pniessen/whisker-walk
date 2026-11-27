// Snowville round four: the snowmobile. The plan (a closed ring of lanes on the south-east lawn clear of everything solid, the garage and bench, two seat records, free hop-off spots reachable
// on foot, the ride always ends), the layout kept as it was, and the later milestones' tests below.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { floodFrom } from './helpers/flood.js';

stubCanvasDocument();
const { isWalkableAt } = await import('../src/player.js');
const { createPathRide, stepPath } = await import('../src/world/pathride.js');
const { loadSnowvilleStages } = await import('../src/world/snowvillestages.js');
await loadSnowvilleStages();
const { build } = await import('../src/world/snowville.js');
const M = await import('../src/world/snowvillemobileplan.js');
const L = await import('../src/world/snowvillesledplan.js');
const K = await import('../src/world/snowvilleskisplan.js');
const D = await import('../src/world/snowvilledetailplan.js');
const W = await import('../src/world/snowvillewingplan.js');
const P = await import('../src/world/snowvilleplan.js');
const Q = await import('../src/world/snowvillefindsplan.js');
const { strayHomes } = await import('../src/world/snowvillestrays.js');

const area = build(new THREE.Scene());
const B = P.SNOWVILLE_BOUNDS;
const inB = (x, z) => x > B.minX + 2 && x < B.maxX - 2 && z > B.minZ + 2 && z < B.maxZ - 2;

describe('the plan', () => {
  it('a closed ring on the south-east lawn, inside the bounds, away from the sled run and the ski slope', () => {
    expect(M.MOBILE_SPEC.loop).toBe(true);
    expect(M.MOBILE_SPEC.vMax).toBeLessThanOrEqual(6.5 + 1e-9);
    expect(M.MOBILE_LEN).toBeGreaterThan(30);
    expect(M.LAPS).toBe(2);
    for (const p of M.MOBILE_PATH) expect(inB(p.x, p.z)).toBe(true);
    for (const a of M.MOBILE_PATH) for (const b of [...L.RUN_PATH, ...K.SKI_PATH]) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(5);
  });
  it('the whole ride ends in under forty seconds even at the slowest speed', () => {
    expect(M.RIDE_LEN / M.MOBILE_SPEC.vMin).toBeLessThan(40);
  });
  it('the ring and its lane are clear of every solid, the finds, the mice and the friendly strays\' ground', () => {
    const solids = [...area.colliders];
    for (let s = 0; s < M.MOBILE_LEN; s += 0.5) {
      const p = M.mobilePos(s);
      for (const c of solids) expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, `s ${s} vs ${JSON.stringify(c)}`).toBeGreaterThan(M.MOBILE_SPEC.laneHalf + 0.3);
      for (const z of Object.values(Q.SNOWVILLE_FIND_ZONES).flat()) expect(Math.hypot(p.x - z.x, p.z - z.z)).toBeGreaterThan(z.r + 1.0);
      for (const m of [...Q.SNOWVILLE_GOLD, ...Q.SNOWVILLE_COLLECTIBLES]) expect(Math.hypot(p.x - m.x, p.z - m.z)).toBeGreaterThan(1.8);
      for (const h of strayHomes()) expect(Math.hypot(p.x - h.x, p.z - h.z), `${h.id} at s ${s}`).toBeGreaterThan(h.roam + M.MOBILE_SPEC.laneHalf);
    }
  });
  it('the garage and the bench stand clear of the lane and of the solids, in bounds,', () => {
    for (const t of [M.GARAGE, M.BENCH]) {
      let near = Infinity;
      for (let s = 0; s < M.MOBILE_LEN; s += 0.25) { const p = M.mobilePos(s); near = Math.min(near, Math.hypot(t.x - p.x, t.z - p.z)); }
      expect(near, JSON.stringify(t)).toBeGreaterThan(M.MOBILE_SPEC.laneHalf + 0.9);
      for (const c of [...P.snowvilleColliders(), ...W.wingColliders(), ...D.detailColliders(), ...K.skiColliders()]) expect(Math.hypot(t.x - c.x, t.z - c.z) - c.r - t.r).toBeGreaterThan(0.8);
      expect(inB(t.x, t.z)).toBe(true);
    }
    expect(Math.hypot(M.GARAGE.x - M.START.x, M.GARAGE.z - M.START.z)).toBeLessThan(M.REACH + 1);
  });
  it('every hop-off spot is free and in bounds, and reachable on foot from the spawn; a free spot is near every point of the ring and by the garage', () => {
    expect(M.MOBILE_HOPS.length).toBeGreaterThanOrEqual(12);
    const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
    for (const h of M.MOBILE_HOPS) {
      expect(inB(h.x, h.z)).toBe(true);
      for (const c of area.colliders) expect(Math.hypot(h.x - c.x, h.z - c.z) - c.r, JSON.stringify(h)).toBeGreaterThan(1.0);
      expect(flood.reachesWithin(h.x, h.z, 1.0), JSON.stringify(h)).toBe(true);
    }
    expect(Math.min(...M.MOBILE_HOPS.map((h) => Math.hypot(h.x - M.START.x, h.z - M.START.z)))).toBeLessThan(4);
    for (let s = 0; s < M.MOBILE_LEN; s += 1) { const p = M.mobilePos(s); expect(Math.min(...M.MOBILE_HOPS.map((h) => Math.hypot(h.x - p.x, h.z - p.z))), `s ${s}`).toBeLessThan(6); }
  });
  it('the detail plan\'s things are where they were (the lane\'s keep-out moved none): the counts of birches, stumps, snowmen and the well', () => {
    expect([D.birches().length, D.stumps().length, D.snowmen().length, D.detailColliders().length]).toEqual([10, 8, 3, 22]);
  });
});

describe('the two seats', () => {
  it('a seat record for the front and the back, a pure function of the machine, a little apart along its heading, at the seat height', () => {
    const r = createPathRide(M.MOBILE_PATH, M.MOBILE_SPEC, 5);
    const a = M.seatRecord(r, 0); const b = M.seatRecord(r, 1);
    expect(a.y).toBe(M.MOBILE.seatY);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.5);
    expect(M.seatRecord(r, 0)).toEqual(a);
    const ahead = (a.x - b.x) * Math.sin(r.heading) + (a.z - b.z) * Math.cos(r.heading);
    expect(ahead).toBeGreaterThan(0);
    expect(Math.abs(a.yaw - (r.heading + Math.PI))).toBeLessThan(1e-9);
  });
});

describe('the ride', () => {
  const ride = (steer) => {
    let r = createPathRide(M.MOBILE_PATH, M.MOBILE_SPEC, 0);
    let t = 0; let dist = 0;
    while (dist < M.RIDE_LEN - M.FINISH && t < 60) {
      const prev = r.s;
      r = stepPath(r, steer(r, t), 1 / 30, M.MOBILE_SPEC, M.MOBILE_PATH);
      dist += (((r.s - prev) % M.MOBILE_LEN) + M.MOBILE_LEN) % M.MOBILE_LEN;
      t += 1 / 30;
    }
    return { t, dist, r };
  };
  it('every stick, even a broken one, finishes the whole ride in under forty seconds, inside the lane', () => {
    for (const stick of [() => null, () => ({ fwd: -1, side: 0 }), () => ({ fwd: 1, side: 1 }), () => ({ fwd: NaN, side: Infinity }), (r, t) => ({ fwd: Math.sin(t * 5.3), side: Math.cos(t * 3.1) })]) {
      const run = ride(stick);
      expect(run.t).toBeLessThan(40);
      expect(run.dist).toBeGreaterThanOrEqual(M.RIDE_LEN - M.FINISH);
      expect(Math.abs(run.r.lat)).toBeLessThanOrEqual(M.MOBILE_SPEC.laneHalf + 1e-9);
    }
  });
});
