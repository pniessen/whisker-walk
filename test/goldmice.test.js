import { describe, it, expect } from 'vitest';
import { GOLD_MICE, KNOWN_GOLD, GOLD_TOTAL, createGoldMice } from '../src/goldmice.js';

// mirrors progression.js's GOLD_ID_PATTERN — every id here must survive
// sanitizeGolden's shape check or a real find would get silently dropped
// on the next save load.
const GOLD_ID_PATTERN = /^gm-[a-z]{1,24}-[1-9]$/;

describe('GOLD_MICE', () => {
  it('has exactly 9 mice total, 3 per area', () => {
    const all = Object.values(GOLD_MICE).flat();
    expect(all.length).toBe(9);
    expect(GOLD_MICE.neighborhood.length).toBe(3);
    expect(GOLD_MICE.park.length).toBe(3);
    expect(GOLD_MICE.seaside.length).toBe(3);
  });

  it('has unique ids, each matching the sanitize id pattern', () => {
    const all = Object.values(GOLD_MICE).flat();
    const seen = new Set();
    for (const m of all) {
      expect(GOLD_ID_PATTERN.test(m.id)).toBe(true);
      expect(seen.has(m.id)).toBe(false);
      seen.add(m.id);
    }
  });

  it('every mouse has finite x/z/y', () => {
    for (const m of Object.values(GOLD_MICE).flat()) {
      expect(Number.isFinite(m.x)).toBe(true);
      expect(Number.isFinite(m.z)).toBe(true);
      expect(Number.isFinite(m.y)).toBe(true);
    }
  });

  it('KNOWN_GOLD contains exactly the 9 GOLD_MICE ids, no more no less', () => {
    const ids = Object.values(GOLD_MICE).flat().map((m) => m.id);
    expect(KNOWN_GOLD.size).toBe(9);
    for (const id of ids) expect(KNOWN_GOLD.has(id)).toBe(true);
  });

  it('GOLD_TOTAL is 9', () => {
    expect(GOLD_TOTAL).toBe(9);
  });
});

const scene = { add() {}, remove() {} };

describe('createGoldMice', () => {
  it('spawns only mice not already in foundIds', () => {
    const found = new Set(['gm-neigh-1', 'gm-neigh-2']);
    const gm = createGoldMice(scene, 'neighborhood', found);
    expect(gm.list.map((m) => m.id)).toEqual(['gm-neigh-3']);
  });

  it('spawns all 3 for an area when nothing is found yet', () => {
    const gm = createGoldMice(scene, 'seaside', new Set());
    expect(gm.list.map((m) => m.id).sort()).toEqual(['gm-sea-1', 'gm-sea-2', 'gm-sea-3']);
  });

  it('spawns nothing for an unknown areaId', () => {
    const gm = createGoldMice(scene, 'den', new Set());
    expect(gm.list).toEqual([]);
  });

  it('checkFind vertical gate: a grounded cat cannot grab a high mouse, but a cat perched at matching height can', () => {
    const gm = createGoldMice(scene, 'neighborhood', new Set());
    const ridge = GOLD_MICE.neighborhood.find((m) => m.id === 'gm-neigh-1'); // y 4.1, the roof ridge
    const catPos = { x: ridge.x, z: ridge.z };
    expect(gm.checkFind(catPos, 0)).toBeNull(); // grounded, wrong height
    const found = gm.checkFind(catPos, ridge.y); // perched at the ridge's own height
    expect(found?.id).toBe('gm-neigh-1');
  });

  it('checkFind respects the 1.0 horizontal gate', () => {
    const gm = createGoldMice(scene, 'neighborhood', new Set());
    const ridge = GOLD_MICE.neighborhood.find((m) => m.id === 'gm-neigh-1');
    const farPos = { x: ridge.x + 5, z: ridge.z };
    expect(gm.checkFind(farPos, ridge.y)).toBeNull();
  });

  it('a ground-level mouse (y 0) is findable by an unperched cat (perchY 0)', () => {
    const gm = createGoldMice(scene, 'neighborhood', new Set());
    const ground = GOLD_MICE.neighborhood.find((m) => m.y === 0);
    const found = gm.checkFind({ x: ground.x, z: ground.z }, 0);
    expect(found?.id).toBe(ground.id);
  });

  it('remove despawns a mouse so it is no longer in list or findable', () => {
    const gm = createGoldMice(scene, 'park', new Set());
    const first = gm.list[0];
    gm.remove(first.id);
    expect(gm.list.find((m) => m.id === first.id)).toBeUndefined();
    expect(gm.checkFind({ x: first.x, z: first.z }, first.y)).toBeNull();
  });

  it('dispose clears the list', () => {
    const gm = createGoldMice(scene, 'seaside', new Set());
    gm.dispose();
    expect(gm.list).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// v18 Whisker Sense ('whisker-sense') — nearestUnfound. The ability's one
// hard rule is that a mouse the player has already found never pings, so both
// routes to "already found" are pinned: the spawn-time filter, and the live
// state.golden set handed in per query.
// ---------------------------------------------------------------------------
describe('createGoldMice.nearestUnfound (v18 Whisker Sense)', () => {
  it('returns the nearest mouse inside maxDist with its distance', () => {
    const gm = createGoldMice(scene, 'seaside', new Set());
    // gm-sea-3 sits ~40 units from the dune pair, so 3 units off it is
    // unambiguously nearest.
    const near = GOLD_MICE.seaside.find((m) => m.id === 'gm-sea-3');
    const hit = gm.nearestUnfound({ x: near.x + 3, z: near.z }, 12, new Set());
    expect(hit.mouse.id).toBe('gm-sea-3');
    expect(hit.dist).toBeCloseTo(3, 5);
  });

  it('returns null when nothing is inside maxDist', () => {
    const gm = createGoldMice(scene, 'park', new Set());
    expect(gm.nearestUnfound({ x: 500, z: 500 }, 12, new Set())).toBeNull();
  });

  it('picks the CLOSEST when two are in range, not the first in the list', () => {
    const gm = createGoldMice(scene, 'park', new Set());
    // The bench gm-park-1 (3, 26) and the oak top gm-park-2 (4.5, 27.3) sit
    // ~2 apart horizontally and both fall inside a 12m radius from either.
    // Standing on the oak top, the SECOND entry in the list must win.
    const oak = GOLD_MICE.park.find((m) => m.id === 'gm-park-2');
    const hit = gm.nearestUnfound({ x: oak.x, z: oak.z }, 12, new Set());
    expect(hit.mouse.id).toBe('gm-park-2');
    expect(gm.list[0].id).toBe('gm-park-1'); // i.e. not simply first-match
  });

  it('measures horizontally only, so a rooftop mouse pings from the pavement', () => {
    const gm = createGoldMice(scene, 'neighborhood', new Set());
    const ridge = GOLD_MICE.neighborhood.find((m) => m.id === 'gm-neigh-1'); // y 4.1
    const hit = gm.nearestUnfound({ x: ridge.x, z: ridge.z }, 12, new Set());
    expect(hit.mouse.id).toBe('gm-neigh-1');
    expect(hit.dist).toBeCloseTo(0, 5);
  });

  it('never pings a mouse listed in the live found set', () => {
    const gm = createGoldMice(scene, 'seaside', new Set());
    const target = GOLD_MICE.seaside[0];
    const at = { x: target.x, z: target.z };
    expect(gm.nearestUnfound(at, 3, new Set())?.mouse.id).toBe(target.id);
    // The same query, with that id now recorded as found, must not return it.
    const hit = gm.nearestUnfound(at, 3, new Set([target.id]));
    expect(hit === null || hit.mouse.id !== target.id).toBe(true);
  });

  it('never pings a mouse that was already found at spawn time', () => {
    const target = GOLD_MICE.seaside[0];
    const gm = createGoldMice(scene, 'seaside', new Set([target.id]));
    const hit = gm.nearestUnfound({ x: target.x, z: target.z }, 3, new Set());
    expect(hit === null || hit.mouse.id !== target.id).toBe(true);
  });

  it('stops pinging a mouse the moment it is caught and removed', () => {
    const gm = createGoldMice(scene, 'park', new Set());
    const first = gm.list[0];
    const at = { x: first.x, z: first.z };
    expect(gm.nearestUnfound(at, 1, new Set())).not.toBeNull();
    gm.remove(first.id);
    expect(gm.nearestUnfound(at, 1, new Set())).toBeNull();
  });

  it('tolerates a missing or non-Set foundIds rather than throwing', () => {
    const gm = createGoldMice(scene, 'park', new Set());
    const first = gm.list[0];
    const at = { x: first.x, z: first.z };
    expect(gm.nearestUnfound(at, 1).mouse.id).toBe(first.id);
    expect(gm.nearestUnfound(at, 1, null).mouse.id).toBe(first.id);
    expect(gm.nearestUnfound(at, 1, 'gm-park-1').mouse.id).toBe(first.id);
  });
});
