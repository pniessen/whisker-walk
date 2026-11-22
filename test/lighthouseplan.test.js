import { describe, it, expect } from 'vitest';
import { validateGround } from '../src/ground.js';
import { shallowExcess, inWater } from '../src/world/water.js';
import * as L from '../src/world/lighthouseplan.js';

// Lighthouse Point, milestone 1: the plan as data. Everything here walks the real ground, the real
// colliders and the real waters, the way player.js does (a cat of radius 0.35, no Sea Legs: she wades
// the shallow bands and is turned back by anything deeper).

const area = L.lighthouseArea();
const CAT = 0.35;
const STEP = 0.5;
const { minX, maxX, minZ, maxZ } = area.bounds;
const nx = Math.round((maxX - minX) / STEP) + 1;
const nz = Math.round((maxZ - minZ) / STEP) + 1;
const cx = (i) => minX + i * STEP;
const cz = (j) => minZ + j * STEP;
const at = (i, j) => i * nz + j;

// standable: in bounds, clear of every collider, and dry or in a shallow band
const standable = (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ
  && area.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + CAT)
  && !(inWater(area.waters, x, z) && shallowExcess(area.waters, x, z) > 0);
const dry = (x, z) => standable(x, z) && !inWater(area.waters, x, z);

function flood(from) {
  const seen = new Uint8Array(nx * nz);
  const i0 = Math.round((from.x - minX) / STEP);
  const j0 = Math.round((from.z - minZ) / STEP);
  const stack = [[i0, j0]];
  seen[at(i0, j0)] = 1;
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = i + di;
      const q = j + dj;
      if (p < 0 || q < 0 || p >= nx || q >= nz || seen[at(p, q)]) continue;
      if (!standable(cx(p), cz(q))) continue;
      if (!area.ground.canStep(cx(i), cz(j), cx(p), cz(q))) continue;
      seen[at(p, q)] = 1;
      stack.push([p, q]);
    }
  }
  // is some reached cell within `range` of (x, z)?
  const near = (x, z, range = 0.8) => {
    const span = Math.ceil(range / STEP);
    const ci = Math.round((x - minX) / STEP);
    const cj = Math.round((z - minZ) / STEP);
    for (let i = ci - span; i <= ci + span; i++) {
      for (let j = cj - span; j <= cj + span; j++) {
        if (i < 0 || j < 0 || i >= nx || j >= nz || !seen[at(i, j)]) continue;
        if (Math.hypot(cx(i) - x, cz(j) - z) <= range) return true;
      }
    }
    return false;
  };
  return { seen, near, at: (x, z) => seen[at(Math.round((x - minX) / STEP), Math.round((z - minZ) / STEP))] === 1 };
}
const reached = flood(area.spawn);

describe('the ground', () => {
  it('ground validates: ceilings clear, no strip over 1 in 3', () => {
    expect(validateGround(L.LIGHTHOUSE_GROUND)).toEqual([]);
  });
  it('the levels: cove 0, plateau 6, cave floor 0 under a 2.6 roof, gallery 13.5, the path rises 0 to 6', () => {
    const g = area.ground;
    expect(g.y(14, 36)).toBe(0);
    expect(g.y(-20, -10)).toBe(6);
    expect(g.y(-11, -19)).toBe(0);
    expect(g.ceil(-11, -19)).toBe(2.6);
    expect(g.ceil(-20, -10)).toBe(Infinity);
    expect(g.y(L.TOWER.x + 4, L.TOWER.z)).toBe(13.5);
    expect(g.y(-2, 16)).toBeCloseTo(0, 6);
    expect(g.y(-24.4, 15.2)).toBe(3);
    expect(g.y(-24.4, 3.6)).toBeCloseTo(6, 6);
    const grades = [L.CLIFF_PATH.f1, L.CLIFF_PATH.f2].map((f) => Math.abs(f.y1 - f.y0) / Math.hypot(f.x1 - f.x0, f.z1 - f.z0));
    for (const gr of grades) expect(gr).toBeLessThan(1 / 3);
  });
  it('is the same ground twice (pure data)', () => {
    const b = L.lighthouseArea();
    for (const [x, z] of [[14, 36], [-20, -10], [-11, -19], [-24.4, 9]]) expect(b.ground.y(x, z)).toBe(area.ground.y(x, z));
  });
});

describe('the spots', () => {
  const spots = [
    ['spawn', [area.spawn]],
    ['scenic', area.scenics],
    ['collectible', area.collectibles],
    ['tippable', area.tippables],
    ['box', area.boxes],
    ['poi', area.pois],
    ['perch', area.perches],
  ];
  for (const [what, list] of spots) {
    it(`the ${what} spots are walkable, in no water and in no collider`, () => {
      expect(list.length).toBeGreaterThan(0);
      for (const s of list) {
        expect(dry(s.x, s.z), `${what} ${s.id ?? `${s.x},${s.z}`}`).toBe(true);
        expect(area.ground.ceil(s.x, s.z) - area.ground.y(s.x, s.z), `${what} ${s.id ?? `${s.x},${s.z}`}`).toBeGreaterThan(1.5);
      }
    });
  }
  it('five collectibles, three scenics, and ids that are unique', () => {
    expect(area.collectibles).toHaveLength(5);
    expect(area.scenics.map((s) => s.id)).toEqual(['lighthouse-cave', 'lighthouse-pools', 'lighthouse-cottage']);
    const ids = [...area.collectibles, ...area.scenics].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('no two collectibles or scenics share a spot (within 3 m)', () => {
    const all = [...area.collectibles, ...area.scenics];
    for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) expect(Math.hypot(all[a].x - all[b].x, all[a].z - all[b].z)).toBeGreaterThan(3);
  });
  it('the perches are in the base climb budget (1.6 m)', () => {
    for (const p of area.perches) expect(p.y).toBeLessThanOrEqual(1.6);
  });
});

describe('walking it', () => {
  it('the spawn is on the cove, in the open', () => {
    expect(area.spawn).toEqual({ x: 14, z: 36 });
    expect(reached.at(14, 36)).toBe(true);
  });
  it('the plateau is walkable from the cove by the cliff path alone', () => {
    // the path's foot, its landing, its top and then the plateau, the cottage's porch and the foot of the tower
    for (const [x, z] of [[-2, 16], [-12, 16], [-24.4, 15.2], [-24.4, 9], [-24.4, 4.5], [-20, -4], [-27.6, -7], [-18.3, -16.3]]) expect(reached.near(x, z, 0.8), `${x}, ${z}`).toBe(true);
    // and nothing else leads up: every plateau cell reached is on the path's side of the cliff, so
    // take the path out and the plateau is cut off from the cove
    const without = L.lighthouseGround();
    expect(without.canStep(-10, 6, -10, 2)).toBe(false); // the cliff face, as a 6 m wall
    expect(without.canStep(-5.5, -12, -7, -12)).toBe(false); // the plateau's east face (x -6)
  });
  it('the cave is walkable to its back and out again, and its roof is not walkable from the plateau', () => {
    expect(reached.near(-15.4, -19, 0.6)).toBe(true); // the back
    expect(reached.near(-6.5, -19, 0.6)).toBe(true); // the mouth
    expect(area.ground.y(-10, -19)).toBe(0);
    // the plateau cells over the cave are not ground she can step onto from beside it
    const g = area.ground;
    for (const z of [-21.5, -19, -16.5]) expect(g.canStep(-17.5, z, -15, z)).toBe(false);
    for (const x of [-14, -8]) { expect(g.canStep(x, -15, x, -17)).toBe(false); expect(g.canStep(x, -23, x, -21)).toBe(false); }
    expect(g.canStep(-3, -19, -10, -19)).toBe(true);
  });
  it('every rock pool is waded end to end: reached at its centre and across', () => {
    for (const p of L.POOLS) {
      expect(p.shallow).toBeGreaterThanOrEqual(p.r);
      expect(reached.near(p.x, p.z, 0.8), p.id).toBe(true);
      expect(reached.near(p.x - p.r + 0.5, p.z, 0.8), p.id).toBe(true);
      expect(reached.near(p.x + p.r - 0.5, p.z, 0.8), p.id).toBe(true);
    }
  });
  it('no cell of the deep sea is reached, and the shallow band of the east sea is the most she wades', () => {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        if (!reached.seen[at(i, j)]) continue;
        const x = cx(i);
        const z = cz(j);
        expect(shallowExcess(area.waters, x, z), `${x}, ${z}`).toBeLessThanOrEqual(0);
      }
    }
    expect(reached.near(36.5, 20, 0.5)).toBe(true); // the waterline's shallows
    expect(reached.near(39.5, 20, 0.5)).toBe(false);
  });
  it('the west sea and Gull Rock are not reached', () => {
    expect(reached.near(-43.5, -30, 0.6)).toBe(false);
    expect(reached.near(L.GULL_ROCK.x, L.GULL_ROCK.z, 3)).toBe(false);
  });
  it('the tower\'s skirt is blocked and the stair\'s foot is open', () => {
    const { x, z } = L.TOWER;
    for (let a = 0; a < 360; a += 15) {
      const r = (d) => [x + d * Math.cos((a * Math.PI) / 180), z + d * Math.sin((a * Math.PI) / 180)];
      // inside the shaft's collider she cannot be; in the skirt (r 3.95 to 4.6) the ground is the gallery, a wall
      expect(area.ground.canStep(...r(5.2), ...r(4.3)), `${a} deg`).toBe(false);
      expect(area.ground.y(...r(4.3))).toBe(13.5);
      expect(area.ground.y(...r(5.2))).toBe(6);
    }
    // the stair's foot (milestone 2's, radius 5.2, 45 degrees from the tower) is open ground
    const foot = [x + 5.2 * Math.cos(Math.PI / 4), z + 5.2 * Math.sin(Math.PI / 4)];
    expect(standable(...foot)).toBe(true);
    expect(reached.near(...foot, 0.5)).toBe(true);
  });
  it('the gallery is not reached in this milestone (the stair is milestone 2\'s)', () => {
    expect(reached.near(L.TOWER.x + 4.2, L.TOWER.z, 0.4)).toBe(false);
  });
});

describe('the data', () => {
  it('six pools of 1.4 to 2.4 m, none touching another or the sea, all clear of the spawn by 4 m', () => {
    expect(L.POOLS).toHaveLength(6);
    for (const p of L.POOLS) {
      expect(p.r).toBeGreaterThanOrEqual(1.4);
      expect(p.r).toBeLessThanOrEqual(2.4);
      expect(Math.hypot(p.x - area.spawn.x, p.z - area.spawn.z)).toBeGreaterThan(p.r + 4);
      expect(p.x + p.shallow).toBeLessThan(L.SEA_EAST.minX - 2);
    }
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) {
      const [p, q] = [L.POOLS[a], L.POOLS[b]];
      expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(p.shallow + q.shallow + 1);
    }
  });
  it('the keeper\'s cottage, the bell and the flagpole stand on the plateau, off the tower and the cave', () => {
    for (const [x, z] of [[L.COTTAGE.x, L.COTTAGE.z], [L.BELL.x, L.BELL.z], [L.FLAGPOLE.x, L.FLAGPOLE.z], [L.BENCH.x, L.BENCH.z]]) {
      expect(area.ground.y(x, z)).toBe(6);
      expect(Math.hypot(x - L.TOWER.x, z - L.TOWER.z)).toBeGreaterThan(8);
    }
  });
  it('the plateau, the pools, the path and the cave are inside the bounds; the stack is outside the walkable sea', () => {
    const { PLATEAU, CAVE } = L;
    expect(PLATEAU.minX).toBeGreaterThan(area.bounds.minX);
    expect(CAVE.minX).toBeGreaterThanOrEqual(PLATEAU.minX);
    expect(shallowExcess(area.waters, L.GULL_ROCK.x, L.GULL_ROCK.z)).toBeGreaterThan(0);
  });
});
