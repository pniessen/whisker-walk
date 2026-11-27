// Snowville round three: the ski slope on the hill's west flank. The plan (an open slalom line clear of everything solid, six gates, free hop-off spots reachable on foot, the run always
// ends and the gates can be cleared at the slowest and the fastest speed), the layout kept as it was (the detail plan's things did not move), and the later milestones' tests below.
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
const K = await import('../src/world/snowvilleskisplan.js');
const L = await import('../src/world/snowvillesledplan.js');
const D = await import('../src/world/snowvilledetailplan.js');
const W = await import('../src/world/snowvillewingplan.js');
const P = await import('../src/world/snowvilleplan.js');
const Q = await import('../src/world/snowvillefindsplan.js');

const area = build(new THREE.Scene());
const B = P.SNOWVILLE_BOUNDS;

describe('the plan', () => {
  it('an open winding run on the hill\'s west flank, inside the bounds, west of the sled run', () => {
    expect(K.SKI_LEN).toBeGreaterThan(18);
    expect(K.SKI_SPEC.loop).toBe(false);
    expect(K.SKI_SPEC.vMax).toBeLessThanOrEqual(5.0 + 1e-9);
    expect(K.START.z).toBeLessThan(K.LANDING.z - 12);
    expect(Math.hypot(K.START.x - P.HILL.x, K.START.z - P.HILL.z)).toBeLessThan(P.HILL.r);
    expect(K.START.x).toBeLessThan(P.HILL.x);
    for (const p of K.SKI_PATH) expect(p.x > B.minX + 2 && p.x < B.maxX - 2 && p.z > B.minZ + 2 && p.z < B.maxZ - 2).toBe(true);
    // the two runs never cross: every ski point is at least 6 m from every sled point
    for (const a of K.SKI_PATH) for (const b of L.RUN_PATH) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(5);
  });
  it('the run ends in under twelve seconds even at the slowest speed, and the speed limit is gentle', () => {
    expect(K.SKI_LEN / K.SKI_SPEC.vMin).toBeLessThan(12);
  });
  it('the line and its lane are clear of every solid, the hill\'s lantern and rock, the finds and the mice', () => {
    const solids = [...area.colliders];
    for (let s = 0; s <= K.SKI_LEN; s += 0.5) {
      const p = K.skiPos(s);
      for (const c of solids) expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, `s ${s} vs ${JSON.stringify(c)}`).toBeGreaterThan(K.SKI_SPEC.laneHalf + 0.3);
      for (const z of Object.values(Q.SNOWVILLE_FIND_ZONES).flat()) expect(Math.hypot(p.x - z.x, p.z - z.z)).toBeGreaterThan(z.r + 1.0);
      for (const m of [...Q.SNOWVILLE_GOLD, ...Q.SNOWVILLE_COLLECTIBLES]) expect(Math.hypot(p.x - m.x, p.z - m.z)).toBeGreaterThan(1.8);
    }
    expect(Math.hypot(W.HILL_LANTERN.x - K.START.x, W.HILL_LANTERN.z - K.START.z)).toBeGreaterThan(8);
    expect(Math.hypot(W.SUMMIT.x - K.START.x, W.SUMMIT.z - K.START.z)).toBeGreaterThan(6);
  });
  it('the rack, the bench and the arch stand clear of the lane and of each other, in bounds, and are solid in the place', () => {
    for (const t of [K.RACK, K.BENCH]) {
      let near = Infinity;
      for (let s = 0; s <= K.SKI_LEN; s += 0.25) { const p = K.skiPos(s); near = Math.min(near, Math.hypot(t.x - p.x, t.z - p.z)); }
      expect(near, JSON.stringify(t)).toBeGreaterThan(K.SKI_SPEC.laneHalf + 0.9);
      for (const c of [...P.snowvilleColliders(), ...W.wingColliders(), ...D.detailColliders()]) expect(Math.hypot(t.x - c.x, t.z - c.z) - c.r - t.r).toBeGreaterThan(0.8);
      expect(t.x > B.minX + 2 && t.x < B.maxX - 2 && t.z > B.minZ + 2 && t.z < B.maxZ - 2).toBe(true);
    }
    expect(Math.hypot(K.RACK.x - K.BENCH.x, K.RACK.z - K.BENCH.z)).toBeGreaterThan(1.8);
    expect(Math.hypot(K.RACK.x - K.START.x, K.RACK.z - K.START.z)).toBeLessThan(4.2); // a step or two from the start
    expect(area.colliders.some((c) => c.x === K.RACK.x && c.z === K.RACK.z)).toBe(true);
    expect(area.colliders.some((c) => c.x === K.BENCH.x && c.z === K.BENCH.z)).toBe(true);
  });
  it('every hop-off spot is free and in bounds, and reachable on foot from the spawn; there are plenty, near the start and the landing, and a free spot is near every point of the run', () => {
    expect(K.SKI_HOPS.length).toBeGreaterThanOrEqual(10);
    const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
    for (const h of K.SKI_HOPS) {
      expect(h.x > B.minX + 2 && h.x < B.maxX - 2 && h.z > B.minZ + 2 && h.z < B.maxZ - 2).toBe(true);
      for (const c of area.colliders) expect(Math.hypot(h.x - c.x, h.z - c.z) - c.r, JSON.stringify(h)).toBeGreaterThan(1.0);
      expect(flood.reachesWithin(h.x, h.z, 1.0), JSON.stringify(h)).toBe(true);
    }
    for (const at of [K.START, K.LANDING]) expect(Math.min(...K.SKI_HOPS.map((h) => Math.hypot(h.x - at.x, h.z - at.z)))).toBeLessThan(4);
    for (let s = 0; s <= K.SKI_LEN; s += 1) { const p = K.skiPos(s); expect(Math.min(...K.SKI_HOPS.map((h) => Math.hypot(h.x - p.x, h.z - p.z))), `s ${s}`).toBeLessThan(6); }
  });
  it('the detail plan\'s things are where they were (the slope\'s keep-out moved none): the counts of birches, stumps, snowmen and the well', () => {
    expect([D.birches().length, D.stumps().length, D.snowmen().length, D.detailColliders().length]).toEqual([10, 8, 3, 22]);
  });
});

describe('the gates', () => {
  it('six of them, alternating right and left, along the line, in order, clear of the solids, each reachable on a lane', () => {
    expect(K.GATES).toHaveLength(6);
    K.GATES.forEach((g, i) => {
      expect(Math.abs(g.lat)).toBeLessThanOrEqual(K.SKI_SPEC.laneHalf);
      expect(Math.sign(g.lat)).toBe(i % 2 ? -1 : 1);
      if (i) expect(g.s - K.GATES[i - 1].s).toBeGreaterThan(2.4);
      expect(g.s).toBeGreaterThan(1); expect(g.s).toBeLessThan(K.SKI_LEN - 1.5);
      for (const c of area.colliders) expect(Math.hypot(g.x - c.x, g.z - c.z) - c.r).toBeGreaterThan(1.0);
    });
    // the line itself is outside every gate (she has to lean), and the lane's edge is inside it
    for (const g of K.GATES) { expect(Math.abs(0 - g.lat)).toBeGreaterThan(K.GATE_TOL); expect(Math.abs(Math.sign(g.lat) * K.SKI_SPEC.laneHalf - g.lat)).toBeLessThanOrEqual(K.GATE_TOL); }
  });
  const skiRun = (steer, vFwd) => {
    let r = createPathRide(K.SKI_PATH, K.SKI_SPEC, 0);
    const cleared = new Set();
    let t = 0;
    while (r.s < K.SKI_LEN - K.FINISH && t < 40) {
      const prev = r.s;
      r = stepPath(r, steer(r, t), 1 / 30, K.SKI_SPEC, K.SKI_PATH);
      for (const i of K.gatesCleared(prev, r)) cleared.add(i);
      t += 1 / 30;
      void vFwd;
    }
    return { t, cleared, r };
  };
  // a steering bot: the stick points to the next gate's side
  const bot = (r) => { const g = K.GATES.find((q) => q.s > r.s - 0.01); return { fwd: 0, side: g ? Math.sign(g.lat) * 0.55 : 0 }; };
  it('a child who leans towards each gate clears all six, at the slowest speed and at the fastest', () => {
    const slow = skiRun((r) => ({ ...bot(r), fwd: -1 }));
    expect(slow.cleared.size).toBe(6);
    expect(slow.t).toBeLessThan(12);
    const fast = skiRun((r) => ({ ...bot(r), fwd: 1 }));
    expect(fast.cleared.size).toBe(6);
    const mid = skiRun((r) => bot(r));
    expect(mid.cleared.size).toBe(6);
  });
  it('holding the line without steering clears none, and the run still ends: nobody is stuck, nobody fails', () => {
    const idle = skiRun(() => null);
    expect(idle.cleared.size).toBe(0);
    expect(idle.t).toBeLessThan(12);
    for (const stick of [() => ({ fwd: -1, side: 0 }), () => ({ fwd: 1, side: 1 }), () => ({ fwd: NaN, side: Infinity }), (r, t) => ({ fwd: Math.sin(t * 5.3), side: Math.cos(t * 3.1) })]) {
      const run = skiRun(stick);
      expect(run.t).toBeLessThan(12);
      expect(run.r.s).toBeGreaterThanOrEqual(K.SKI_LEN - K.FINISH);
    }
  });
});
