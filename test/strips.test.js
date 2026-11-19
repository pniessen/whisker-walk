import { describe, it, expect } from 'vitest';
import {
  cutTiles, tileDistance, tileSeed, createStreamer, LAYERS, TILE_SIZE, FRAME_TRIANGLES, CHECK_EVERY,
  ABSENT, BUILT,
} from '../src/world/strips.js';

// Bigger areas: the strip-tile arithmetic (src/world/strips.js), with the mesh
// work replaced by counters.

const RECT = { minX: -90, maxX: -50, minZ: -50, maxZ: 50 };

// The streamer's arithmetic is tested on step 1's two layers (step 2 tuned
// the real ranges, world/strips.js LAYERS, held below and in
// test/striptiles.test.js); the state machine is the same for any.
const STEP1 = Object.freeze([{ id: 'small', show: 45, hide: 58 }, { id: 'trees', show: 90, hide: 105 }]);

// A streamer whose jobs take `steps` steps of `cost` triangles each.
function fake({ steps = 3, cost = 500, tiles = cutTiles(RECT), ...opts } = {}) {
  const log = { begun: [], dropped: [], cancelled: [], frameCosts: [] };
  const s = createStreamer({
    tiles,
    layers: STEP1,
    begin(tile, layer) {
      log.begun.push(`${layer.id}:${tile.index}`);
      let left = steps;
      return {
        cost: () => cost,
        step: () => --left <= 0,
        cancel: () => log.cancelled.push(`${layer.id}:${tile.index}`),
      };
    },
    drop: (tile, layer) => log.dropped.push(`${layer.id}:${tile.index}`),
    ...opts,
  });
  return { s, log, tiles };
}
const slot = (s, layerId, index) => s.slots.find((q) => q.layer.id === layerId && q.tile.index === index);

describe('cutting a strip into tiles', () => {
  it('cuts the River\'s west strip into ten 20 m tiles, in row order, covering it exactly', () => {
    const tiles = cutTiles(RECT);
    expect(tiles.length).toBe(10);
    expect(TILE_SIZE).toBe(20);
    tiles.forEach((t, i) => {
      expect(t.index).toBe(i);
      expect(t.maxX - t.minX).toBe(20);
      expect(t.maxZ - t.minZ).toBe(20);
    });
    expect(tiles[0]).toMatchObject({ minX: -90, minZ: -50, col: 0, row: 0 });
    expect(tiles[1]).toMatchObject({ minX: -70, minZ: -50, col: 1, row: 0 });
    expect(tiles[9]).toMatchObject({ maxX: -50, maxZ: 50, col: 1, row: 4 });
    // every point of the strip is in exactly one tile (edges go to the next)
    for (let x = -89.5; x < -50; x += 3.7) {
      for (let z = -49.5; z < 50; z += 3.7) {
        expect(tiles.filter((t) => x >= t.minX && x < t.maxX && z >= t.minZ && z < t.maxZ).length).toBe(1);
      }
    }
  });

  it('a strip that is not a whole number of tiles gets tiles of about the size', () => {
    const tiles = cutTiles({ minX: 0, maxX: 50, minZ: 0, maxZ: 30 });
    expect(tiles.length).toBe(6); // 3 by 2: 16.7 m by 15 m
    expect(tiles[5].maxX).toBeCloseTo(50, 9);
    expect(tiles[5].maxZ).toBeCloseTo(30, 9);
  });

  it('a tile\'s seed names its area, strip, index and stream', () => {
    expect(tileSeed('river', 'west', 3, 'trees')).toBe('river|west|3|trees');
    expect(new Set([0, 1, 2].flatMap((i) => ['trees', 'reeds'].map((st) => tileSeed('river', 'west', i, st)))).size).toBe(6);
  });

  it('the distance to a tile is 0 inside it and straight-line outside', () => {
    const t = cutTiles(RECT)[0]; // x -90..-70, z -50..-30
    expect(tileDistance(t, -80, -40)).toBe(0);
    expect(tileDistance(t, -60, -40)).toBe(10);
    expect(tileDistance(t, -67, -26)).toBe(5);
  });
});

describe('the ranges', () => {
  it('step 2: the reedbed nearest, then small things, then trees within about 65 m, each with room to pace', () => {
    expect(LAYERS.map((l) => l.id)).toEqual(['fine', 'small', 'trees']);
    const [fine, small, trees] = LAYERS;
    for (const l of LAYERS) expect(l.hide - l.show).toBeGreaterThanOrEqual(6);
    expect(small.show).toBeGreaterThan(fine.hide);
    expect(trees.show).toBeGreaterThan(small.hide);
    // the trees stay in full past the haze's start (40 m), and go about 65 m out
    expect(trees.show).toBeGreaterThan(40);
    expect(trees.hide).toBeGreaterThanOrEqual(60);
    expect(trees.hide).toBeLessThanOrEqual(70);
  });
});

describe('the streamer', () => {
  it('builds nothing while the cat is far, and what is in range when it comes near, nearest first', () => {
    const { s, log } = fake({ steps: 1, cost: 100 });
    s.update(50, 0, 1 / 60); // 100 m from the strip's near edge
    expect(log.begun).toEqual([]);
    for (let f = 0; f < 60; f++) s.update(-20, 0, 1 / 60); // 30 m off: small and trees both in range of the near tiles
    expect(slot(s, 'small', 5).state).toBe(BUILT); // x -70..-50, z -10..10: 30 m
    expect(slot(s, 'trees', 5).state).toBe(BUILT);
    expect(slot(s, 'small', 4).state).toBe(ABSENT); // x -90..-70: 50 m, past 45
    expect(slot(s, 'trees', 4).state).toBe(BUILT);
    // the nearest tile's layers come before any farther tile's
    const first = log.begun.slice(0, 2).map((k) => k.split(':')[1]);
    expect(first).toEqual(['5', '5']);
  });

  it('keeps one frame\'s building under the triangle budget; a slot waits for the next frame', () => {
    const { s } = fake({ steps: 4, cost: 700 });
    let most = 0;
    for (let f = 0; f < 600; f++) most = Math.max(most, s.update(-60, 0, 1 / 60));
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(FRAME_TRIANGLES);
    expect(s.stats.maxFrameTriangles).toBe(most);
    expect(s.stats.maxSteps).toBe(Math.floor(FRAME_TRIANGLES / 700));
    expect(s.pending).toBe(0);
  });

  it('a step dearer than the whole budget still runs, alone, so the queue cannot stall', () => {
    const { s } = fake({ steps: 2, cost: FRAME_TRIANGLES * 3 });
    for (let f = 0; f < 200; f++) s.update(-60, 0, 1 / 60);
    expect(s.stats.maxSteps).toBe(1);
    expect(s.pending).toBe(0);
  });

  it('stops for the time budget too, when it is given a clock', () => {
    let t = 0;
    const { s } = fake({ steps: 6, cost: 1, now: () => (t += 1.5), frameMs: 2 });
    for (let f = 0; f < 400; f++) s.update(-60, 0, 1 / 60);
    // each step takes 1.5 "ms": after the second the clock has passed 2 ms
    expect(s.stats.maxSteps).toBeLessThanOrEqual(2);
    expect(s.pending).toBe(0);
  });

  it('drops a built tile only past its hide range, so pacing a boundary builds once and drops nothing', () => {
    const { s, log } = fake({ steps: 1, cost: 100 });
    const small = STEP1[0];
    // tile 5's near edge is x -50; pace back and forth across the show line
    const xAt = (d) => -50 + d;
    for (let f = 0; f < 60 * 30; f++) {
      const d = small.show + 4 * Math.sin(f / 40); // 41..49 m: in and out of `show`, never past `hide`
      s.update(xAt(d), 0, 1 / 60);
    }
    expect(log.begun.filter((k) => k === 'small:5').length).toBe(1);
    expect(log.dropped.filter((k) => k.startsWith('small:'))).toEqual([]);
    for (let f = 0; f < 60; f++) s.update(xAt(small.hide + 1), 0, 1 / 60);
    expect(log.dropped).toContain('small:5');
    expect(slot(s, 'small', 5).state).toBe(ABSENT);
  });

  it('a slot that leaves the range half built is cancelled, and built afresh next time', () => {
    const { s, log } = fake({ steps: 1000, cost: FRAME_TRIANGLES });
    for (let f = 0; f < 30; f++) s.update(-60, 0, 1 / 60);
    expect(log.begun.length).toBe(1); // one job at a time: the head of the queue
    for (let f = 0; f < 30; f++) s.update(200, 0, 1 / 60);
    expect(log.cancelled).toEqual(log.begun);
    expect(s.pending).toBe(0);
    expect(s.slots.every((q) => q.state === ABSENT)).toBe(true);
  });

  it('looks at the ranges a few times a second, not every frame', () => {
    const { s } = fake({ steps: 1, cost: 1 });
    s.update(200, 0, 1 / 60); // the first update always looks
    s.update(-60, 0, 1 / 60);
    expect(s.pending).toBe(0); // not looked yet
    for (let t = 0; t < CHECK_EVERY; t += 1 / 60) s.update(-60, 0, 1 / 60);
    expect(s.stats.built).toBeGreaterThan(0);
    expect(CHECK_EVERY).toBeLessThanOrEqual(0.34);
  });

  it('settle builds everything in range at once; dispose drops it all', () => {
    const { s, log } = fake({ steps: 5, cost: 900 });
    s.settle(-70, 0);
    expect(s.pending).toBe(0);
    expect(s.slots.filter((q) => q.state === BUILT).length).toBe(log.begun.length);
    expect(log.begun.length).toBe(20); // every tile is within 45 m of the strip's middle
    s.dispose();
    expect(log.dropped.length).toBe(20);
    expect(s.slots.every((q) => q.state === ABSENT)).toBe(true);
  });
});
