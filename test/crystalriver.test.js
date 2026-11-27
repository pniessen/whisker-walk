// The Crystal Cave, wing C, milestone C1: the underground river, the falls and the gentle boat (docs/superpowers/plans/2026-11-27-crystal-moon-wave2.md decisions 4, 5, 7, 8).
// Banks are colliders, the falls stand 9 m or more beyond the edge, the boat never leaves the water under any stick, a hop-off spot is always free and reachable on foot, the
// footprint is clear of every find, mouse, stone and Lumi's places, the rim clears leave every scatter else alone, one PointLight, reduced motion and LOW, both word sets.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as P from '../src/world/crystalplan.js';
import * as W from '../src/world/crystalwingplan.js';
import { CRYSTAL_FIND_ZONES, CRYSTAL_COLLECTIBLES, CRYSTAL_GOLD } from '../src/world/crystalfindsplan.js';
import { LUMI, STONES } from '../src/world/crystalstory.js';
import { SPOTS, STONE, BUG, SPARK } from '../src/world/crystalerrand.js';
import { createPathRide, stepPath, posAt, hopOffSpot } from '../src/world/pathride.js';
import { phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { createProgression } from '../src/progression.js';
import { memoryStorage } from './helpers/storage.js';

const { CRYSTAL_CLEARS } = P;
const cleared = CRYSTAL_CLEARS.length; // (empty until the stage chunk loads)
await import('../src/world/crystalstagewingc.js');
const { ST } = await import('../src/world/crystalstages.js');
const R = await import('../src/world/crystalriverplan.js');
const { createRiverLive, FALL_SIGHT, SEAT_FRAME } = await import('../src/world/crystalriverlive.js');
const { build } = await import('../src/world/crystal.js');
const { RIVER_LINES } = await import('../src/world/crystalriverwords.js');
const { WING_LIVE, wingPageShown } = await import('../src/crystalpages.js');
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n'); // (code only: the comments may name what the code never does)
const B = P.CRYSTAL_BOUNDS;

const built = () => { const scene = new THREE.Scene(); const area = build(scene); return { scene, area }; };
const allCols = () => [...P.crystalColliders(), ...R.riverColliders()];
const freeOf = (x, z, m) => allCols().every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + m);

// a flood of the floor on foot from the spawn: 0.4 m cells, a cell is blocked within a collider's radius + the cat's 0.3 m, a step must pass the ground's rule
function flood(cols) {
  const ground = P.createCrystalGround();
  const cell = 0.4;
  const key = (i, j) => `${i},${j}`;
  const seen = new Set();
  const q = [[Math.round(P.CRYSTAL_SPAWN.x / cell), Math.round(P.CRYSTAL_SPAWN.z / cell)]];
  seen.add(key(...q[0]));
  const blocked = (x, z) => x < B.minX + 0.5 || x > B.maxX - 0.5 || z < B.minZ + 0.5 || z > B.maxZ - 0.5 || cols.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.3);
  while (q.length) {
    const [i, j] = q.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (seen.has(key(ni, nj))) continue;
      const x = ni * cell, z = nj * cell;
      if (blocked(x, z) || !ground.canStep(i * cell, j * cell, x, z)) continue;
      seen.add(key(ni, nj));
      q.push([ni, nj]);
    }
  }
  return (x, z) => seen.has(key(Math.round(x / cell), Math.round(z / cell)));
}

describe('the banks are colliders, in the built area', () => {
  const { area } = built();
  it('every bank circle is in the area colliders, and each chain leaves no gap a cat fits through', () => {
    const have = new Set(area.colliders.map((c) => `${c.x},${c.z},${c.r}`));
    for (const c of R.riverColliders()) expect(have.has(`${c.x},${c.z},${c.r}`)).toBe(true);
    expect(R.riverColliders().length).toBeGreaterThan(50);
    // the water is not walkable: from the spawn the flood never reaches the river's middle, the pools' middles or the channel
    const reach = flood(area.colliders);
    for (const p of R.CENTRE) expect(reach(p.x, p.z), `${p.x},${p.z}`).toBe(false);
    expect(reach(R.PLUNGE.x, R.PLUNGE.z)).toBe(false);
    expect(reach(R.STILL.x, R.STILL.z)).toBe(false);
  });
  it('crystalColliders (and with it the decor scatter) is untouched: the banks join through the stage only', () => {
    expect(P.crystalColliders().some((c) => R.riverColliders().some((r) => r.x === c.x && r.z === c.z && r.r === c.r && r.r === R.BANK.r))).toBe(false);
  });
});

describe('the falls and the cliff', () => {
  it('stand 9 m or more beyond the walkable edge, inside the dome, and the camera never gets near', () => {
    const F = R.FALLS;
    expect(F.x - B.maxX).toBeGreaterThanOrEqual(R.FALLS_TOP_BEYOND);
    expect(F.x).toBeGreaterThanOrEqual(45);
    expect(F.x).toBeLessThanOrEqual(50);
    expect(F.cliff.x0 - B.maxX).toBeGreaterThanOrEqual(R.FALLS_TOP_BEYOND);
    for (const [x, z] of [[F.cliff.x1, F.cliff.z0], [F.cliff.x1, F.cliff.z1]]) {
      const r = Math.hypot(x, z);
      expect(r).toBeLessThan(58); // the dome's wall
      expect(P.domeY(r)).toBeGreaterThan(F.cliff.h + 2.5);
    }
    // the camera's farthest step (2) reaches 4.5 m, with the boat's pull-out: far from the cliff and under the dome (13 m) at every walkable point
    expect(4.5 * (1 + SEAT_FRAME.camOut) + SEAT_FRAME.camUp).toBeLessThan(13);
    expect(F.cliff.x0 - B.maxX).toBeGreaterThan(4.5 * 2);
  });
  it('the river and pools are inside the walkable bounds (the channel and the falls are the only parts outside)', () => {
    for (const p of R.CENTRE) expect(p.x + R.BANK.off + R.BANK.r).toBeLessThan(B.maxX);
    expect(R.PLUNGE.x + R.RING.plunge + R.BANK.r).toBeLessThan(B.maxX + 0.5);
    expect(R.STILL.x + R.RING.still + R.BANK.r).toBeLessThan(B.maxX);
  });
});

describe('the boat, the docks and the hop-off spots', () => {
  it('the path stays inside the water and clear of every bank under a random stick (never stuck)', () => {
    const inWater = (x, z) => R.CENTRE.some((c, i) => i + 1 < R.CENTRE.length && (() => { const b = R.CENTRE[i + 1]; const dx = b.x - c.x, dz = b.z - c.z; const t = Math.min(1, Math.max(0, ((x - c.x) * dx + (z - c.z) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - c.x - dx * t, z - c.z - dz * t) <= R.HALF_WIDTH - 0.4; })()) || Math.hypot(x - R.PLUNGE.x, z - R.PLUNGE.z) <= R.PLUNGE.r - 0.4 || Math.hypot(x - R.STILL.x, z - R.STILL.z) <= R.STILL.r - 0.4;
    for (const seed of [3, 11, 29]) {
      let a = seed;
      const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
      let r = createPathRide(R.BOAT_PATH, R.BOAT_SPEC);
      for (let i = 0; i < 12000; i++) {
        r = stepPath(r, { fwd: rnd() * 2 - 1, side: rnd() * 2 - 1 }, i % 5 === 0 ? 0.15 : 1 / 30, R.BOAT_SPEC, R.BOAT_PATH);
        expect(inWater(r.x, r.z), `${seed}:${i} ${r.x},${r.z}`).toBe(true);
        expect(R.riverColliders().every((c) => Math.hypot(r.x - c.x, r.z - c.z) >= c.r + 0.4)).toBe(true);
        expect(hopOffSpot(r, R.HOP_SPOTS)).toBeTruthy();
      }
    }
  });
  it('it stops at both docks within reach of both of that dock\'s spots, and the speeds are the spec boat\'s', () => {
    expect(R.BOAT_SPEC.vMin).toBe(0.6);
    expect(R.BOAT_SPEC.vMax).toBe(2.0);
    expect(R.BOAT_SPEC.stops.map((s) => s.name)).toEqual(['fall', 'pool']);
    for (const stop of R.BOAT_SPEC.stops) {
      const p = posAt(R.BOAT_PATH, stop.s, 0, true);
      const dock = R.DOCKS.find((d) => d.id === stop.name);
      for (const sp of dock.spots) expect(Math.hypot(sp.x - p.x, sp.z - p.z)).toBeLessThanOrEqual(R.BOAT.reach);
    }
    // a full lap with no stick: it reaches each stop and leaves again
    let r = createPathRide(R.BOAT_PATH, R.BOAT_SPEC);
    const seen = new Set();
    let moved = 0;
    for (let i = 0; i < 30 * 120; i++) { r = stepPath(r, null, 1 / 30, R.BOAT_SPEC, R.BOAT_PATH); if (r.stop) seen.add(r.stop); if (r.v > 0.5) moved++; }
    expect([...seen].sort()).toEqual(['fall', 'pool']);
    expect(moved).toBeGreaterThan(30 * 60);
  });
  it('every hop-off spot (dock and bank) is free, inside the bounds, and reachable on foot from the spawn', () => {
    const reach = flood(allCols());
    expect(R.DOCK_SPOTS.length).toBe(4);
    for (const sp of R.HOP_SPOTS) {
      expect(freeOf(sp.x, sp.z, 0.45), `${sp.x},${sp.z}`).toBe(true);
      expect(sp.x).toBeLessThanOrEqual(B.maxX - 1);
      expect(sp.z).toBeLessThanOrEqual(B.maxZ - 1);
      expect(reach(sp.x, sp.z), `${sp.x},${sp.z}`).toBe(true);
    }
    // from anywhere on the lap the nearest spot is close (nobody is set down far away)
    for (let s = 0; s < R.BOAT_LEN; s += 0.5) { const p = posAt(R.BOAT_PATH, s, 0, true); const sp = hopOffSpot(p, R.HOP_SPOTS); expect(Math.hypot(sp.x - p.x, sp.z - p.z)).toBeLessThan(7); }
  });
});

describe('the footprint is clear of everything a cat or Lumi comes to', () => {
  it('no find, collectible, mouse, stone, story point or great crystal is in the water, on the banks or on a dock', () => {
    const items = [
      ...Object.values(CRYSTAL_FIND_ZONES).flat().map((k) => [k.x, k.z, k.r]),
      ...CRYSTAL_COLLECTIBLES.map((k) => [k.x, k.z, 0.6]),
      ...CRYSTAL_GOLD.map((k) => [k.x, k.z, 0.8]),
      ...STONES.map((k) => [k.x, k.z, 1.0]),
      ...[LUMI.start, STONE, BUG, SPARK.start, ...SPOTS].map((k) => [k.x, k.z, 1.0]),
      [SPARK.ring.x, SPARK.ring.z, SPARK.ring.r], [W.HEART_GREAT.x, W.HEART_GREAT.z, 3], [W.POOL.x, W.POOL.z, W.POOL.r], [P.ARCH.x, P.ARCH.z, 3],
    ];
    for (const [x, z, r] of items) expect(R.inRiver(x, z, r), `${x},${z}`).toBe(false);
    for (const d of R.DOCKS) for (const [x, z, r] of items) expect(Math.hypot(d.x - x, d.z - z), `${d.id} dock`).toBeGreaterThan(r + 1);
    // the original three golden mice and the first two stubs have not moved
    expect(CRYSTAL_GOLD.slice(0, 3).map((m) => m.id)).toEqual(['gm-crystal-1', 'gm-crystal-2', 'gm-crystal-3']);
  });
});

describe('the clears: rim rocks and pebbles only, after the scatter', () => {
  it('CRYSTAL_CLEARS holds the footprint; no rock or pebble is inside it; clusters, KEEP_OUT and the other rocks stay', () => {
    expect(CRYSTAL_CLEARS.length).toBe(cleared + R.CLEARS.length);
    const rim = P.scatterRim();
    expect(rim.some((k) => P.inCrystalClear(k.x, k.z, k.s))).toBe(false);
    const saved = CRYSTAL_CLEARS.splice(0);
    const before = P.scatterRim();
    const peb = P.scatterPebbles();
    const clusters = P.scatterClusters();
    CRYSTAL_CLEARS.push(...saved);
    const gone = before.filter((k) => !rim.some((o) => o.x === k.x && o.z === k.z));
    expect(gone.length).toBeGreaterThan(0);
    expect(gone.every((k) => P.inCrystalClear(k.x, k.z, k.s))).toBe(true);
    expect(rim.length).toBe(before.length - gone.length);
    expect(P.scatterPebbles()).toEqual(peb);
    expect(P.scatterClusters()).toEqual(clusters);
    expect(P.KEEP_OUT.length).toBe(11);
    expect(read('src/world/crystalstagewingc.js')).not.toMatch(/KEEP_OUT/);
  });
});

describe('light, motion, words, journal', () => {
  const rigged = (extra = {}) => {
    const scene = new THREE.Scene();
    const ground = P.createCrystalGround();
    const progression = createProgression(memoryStorage());
    const player = { inputActive: false, perchY: 0, halt() {}, inputDirection: () => ({ x: 0, z: 0 }) };
    const river = createRiverLive({ scene, ground, colliders: [], player, progression, ...extra });
    const cat = new THREE.Object3D();
    const session = { cat, fair: undefined, perched: null };
    return { scene, river, player, progression, cat, session };
  };
  const tick = (r, n, dt = 0.05, t0 = 0) => { for (let i = 0; i < n; i++) { r.river.update(dt, t0 + i * dt, { x: r.cat.position.x, z: r.cat.position.z }, null, r.session); r.river.hooks.update(dt, t0 + i * dt, { cat: r.cat, player: r.player, session: r.session }); } };

  it('adds no light: the built cave has its one PointLight, and the river live adds none', () => {
    const count = (s) => { let n = 0; s.traverse((o) => { if (o.isLight && o.isPointLight) n++; }); return n; };
    const { scene } = built();
    expect(count(scene)).toBe(1);
    const r = rigged();
    expect(count(r.scene)).toBe(0);
    let lights = 0;
    r.scene.traverse((o) => { if (o.isLight) lights++; });
    expect(lights).toBe(0);
    expect(read('src/world/crystalriverparts.js') + read('src/world/crystalriverlive.js')).not.toMatch(/PointLight|SpotLight|DirectionalLight/);
    r.river.dispose();
  });
  it('the boat is offered only while it waits at a dock and she is near; the press boards; "Hop off" comes anywhere; the seat is the wire\'s', () => {
    const r = rigged();
    r.river.install(r.session);
    const dock = R.DOCKS[0];
    r.cat.position.set(dock.spots[0].x, 0, dock.spots[0].z);
    // wait for the boat to be in a dock with her standing there (the pool dock is the other end; test both)
    let offered = null;
    for (let i = 0; i < 4000 && !offered; i++) { tick(r, 1, 1 / 30, i / 30); offered = r.river.promptAt({ x: dock.spots[0].x, z: dock.spots[0].z }); }
    expect(offered).toBe(phrase('crystal.wc.boat.board'));
    expect(r.river.state.stop).toBe(dock.id);
    expect(r.river.interact()).toBe('on');
    tick(r, 2);
    expect(r.river.riding).toBe(true);
    expect(r.session.fair.riding).toEqual({ id: 'crystal-boat' });
    expect(r.session.perched).toBeTruthy();
    expect(r.player.perchY).toBeGreaterThan(0);
    expect(r.river.promptAt({ x: 0, z: 0 })).toBe(phrase('crystal.wc.boat.off'));
    tick(r, 60);
    expect(Math.hypot(r.cat.position.x - r.river.ride.x, r.cat.position.z - r.river.ride.z)).toBeLessThan(0.6);
    expect(r.river.interact()).toBe('off');
    tick(r, 2);
    expect(r.river.riding).toBe(false);
    expect(r.session.fair.riding).toBe(null);
    expect(r.session.perched).toBe(null);
    expect(r.player.perchY).toBe(0);
    expect(freeOf(r.cat.position.x, r.cat.position.z, 0.45)).toBe(true);
    expect(r.progression.state.journal?.ccboat ?? 0).toBeGreaterThan(0);
    r.river.dispose();
  });
  it('a walk that ends while she rides sets her down on a dock and gives the walk its own fair back', () => {
    const r = rigged();
    const orig = { marker: 1 };
    r.session.fair = orig;
    r.river.install(r.session);
    const dock = R.DOCKS[1];
    r.cat.position.set(dock.spots[0].x, 0, dock.spots[0].z);
    let offered = null;
    for (let i = 0; i < 4000 && !offered; i++) { tick(r, 1, 1 / 30, i / 30); offered = r.river.promptAt({ x: dock.spots[0].x, z: dock.spots[0].z }); }
    r.river.interact();
    tick(r, 3);
    tick(r, 200); // away from the dock, mid-river
    expect(r.river.riding).toBe(true);
    expect(r.session.fair.groundSpot()).toBeTruthy();
    r.river.dispose();
    expect(r.session.fair).toBe(orig);
    expect(R.DOCK_SPOTS.some((s) => Math.hypot(s.x - r.cat.position.x, s.z - r.cat.position.z) < 0.01)).toBe(true);
    expect(r.session.perched).toBe(null);
  });
  it('reduced motion freezes the flow, the fall and the bob (the boat still moves); LOW keeps half the spray', () => {
    const still = rigged({ reducedMotion: true });
    const m = (r, name) => r.scene.getObjectByName(name);
    tick(still, 5);
    const flow0 = m(still, 'cr:flow').instanceMatrix.array.slice(0, 16);
    const streak0 = m(still, 'cr:streaks').instanceMatrix.array.slice(0, 16);
    const spray0 = m(still, 'cr:spray').geometry.attributes.position.array.slice();
    const y0 = m(still, 'cr:boat').position.y - 0;
    const x0 = m(still, 'cr:boat').position.x;
    tick(still, 60, 0.05, 10);
    expect([...m(still, 'cr:flow').instanceMatrix.array.slice(0, 16)]).toEqual([...flow0]);
    expect([...m(still, 'cr:streaks').instanceMatrix.array.slice(0, 16)]).toEqual([...streak0]);
    expect([...m(still, 'cr:spray').geometry.attributes.position.array]).toEqual([...spray0]);
    expect(m(still, 'cr:boat').position.x).not.toBe(x0);
    // the bob: height depends only on the ground under it, never on the clock
    const g = P.createCrystalGround();
    const bp = m(still, 'cr:boat').position;
    expect(bp.y).toBeCloseTo(g.y(bp.x, bp.z) + R.WATER_LIFT, 6);
    expect(y0).toBeDefined();
    const moving = rigged();
    tick(moving, 5);
    const f0 = [...m(moving, 'cr:flow').instanceMatrix.array.slice(0, 16)];
    tick(moving, 40, 0.05, 10);
    expect([...m(moving, 'cr:flow').instanceMatrix.array.slice(0, 16)]).not.toEqual(f0);
    const high = m(moving, 'cr:spray').geometry.attributes.position.count;
    const low = rigged({ tier: { name: 'low', rung: 3, shadows: false } });
    expect(m(low, 'cr:spray').geometry.attributes.position.count).toBe(high / 2);
    for (const r of [still, moving, low]) r.river.dispose();
  });
  it('the sightings: the falls count when she comes within sight, once; the draws use no random number', () => {
    const r = rigged();
    r.river.update(0.05, 0, { x: 0, z: 28 }, null, r.session);
    expect(r.progression.state.journal?.ccfalls ?? 0).toBe(0);
    r.river.update(0.05, 0.05, { x: R.FALLS.x - FALL_SIGHT + 1, z: R.FALLS.z }, null, r.session);
    r.river.update(0.05, 0.1, { x: R.FALLS.x - FALL_SIGHT + 1, z: R.FALLS.z }, null, r.session);
    expect(r.progression.state.journal?.ccfalls).toBe(1);
    r.river.dispose();
    for (const f of ['crystalriverplan', 'crystalriverparts', 'crystalriverlive', 'crystalstagewingc']) expect(read(`src/world/${f}.js`), f).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
  it('both word sets say both lines, with no banned word; the two pages are live and shown', () => {
    for (const id of Object.keys(RIVER_LINES)) {
      expect(phrase(id)).toMatch(/\S/);
      expect(bannedIn(phrase(id))).toBeNull();
      withOffWords(() => { expect(phrase(id)).toBe(RIVER_LINES[id]); expect(bannedIn(phrase(id))).toBeNull(); });
    }
    expect(WING_LIVE.boat && WING_LIVE.falls).toBe(true);
    expect(wingPageShown('ccboat') && wingPageShown('ccfalls')).toBe(true);
    expect(wingPageShown('ccforge')).toBe(false);
  });
  it('the boat is small and low, everything but the cliff is under 2.5 m', () => {
    const r = rigged();
    const box = new THREE.Box3();
    for (const n of ['cr:water', 'cr:docks', 'cr:docklamps', 'cr:boat']) { box.setFromObject(r.scene.getObjectByName(n)); expect(box.max.y, n).toBeLessThan(2.5); }
    expect(R.BOAT.lanternY).toBeLessThan(1.5);
    expect(ST.wingc.createRiverLive).toBe(createRiverLive);
    r.river.dispose();
  });
});
