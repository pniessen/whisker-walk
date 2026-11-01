import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The same headless canvas stub every world test uses (see test/park.test.js
// for why getImageData and the gradients need real answers).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const pines = await import('../src/world/pines.js');
const { WOODS_WATERS } = await import('../src/world/woods.js');
const { RIVER_WATERS, RIVER_PATHS, RIVER_ISLAND } = await import('../src/world/river.js');
const {
  build: buildMoor, MOOR_WATERS, MOOR_PATHS, MOOR_ISLAND, ISLAND_BRIDGE_WOODS,
} = await import('../src/world/moor.js');
const { inWater } = await import('../src/world/builder.js');
const { isWalkableAt } = await import('../src/player.js');

const {
  build, SPAWN, PINES_WATERS, PINES_PATHS, TRUCE_PATH, PINES_ISLAND, BRIDGE_FOOT, PINES_HORIZON,
} = pines;

const built = () => {
  const scene = new THREE.Scene();
  const area = build(scene);
  return { scene, area };
};
const { scene, area } = built();
const byId = (id) => PINES_WATERS.find((w) => w.id === id);

// Distance from (x, z) to the segment (x1, z1)-(x2, z2).
function segDist(x, z, [x1, z1, x2, z2]) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
}

// Distance from (x, z) to an axis-aligned rectangle (0 inside it). Kept with
// reachesWithin for the find and scenery tests the content tasks add here.
const rectDist = (d, x, z) => Math.hypot(Math.max(d.minX - x, 0, x - d.maxX), Math.max(d.minZ - z, 0, z - d.maxZ));

// Flood-fill the cells a grounded cat may stand on (player.js's own rule) on a
// 0.5 m grid from SPAWN. Each area record is flooded once and remembered.
const STEP = 0.5;
const floods = new WeakMap();
function flood(a) {
  if (floods.has(a)) return floods.get(a);
  const { minX, maxX, minZ, maxZ } = a.bounds;
  const nx = Math.round((maxX - minX) / STEP) + 1;
  const nz = Math.round((maxZ - minZ) / STEP) + 1;
  const seen = new Uint8Array(nx * nz);
  const ok = (i, j) => isWalkableAt(a, minX + i * STEP, minZ + j * STEP);
  const si = Math.round((SPAWN.x - minX) / STEP);
  const sj = Math.round((SPAWN.z - minZ) / STEP);
  expect(ok(si, sj), 'the spawn is walkable').toBe(true);
  const stack = [[si, sj]];
  seen[si * nz + sj] = 1;
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = i + di, q = j + dj;
      if (p < 0 || q < 0 || p >= nx || q >= nz || seen[p * nz + q] || !ok(p, q)) continue;
      seen[p * nz + q] = 1;
      stack.push([p, q]);
    }
  }
  const f = { minX, minZ, nx, nz, seen };
  floods.set(a, f);
  return f;
}

// Whether the flood reached any cell strictly within `r` of (x, z): where a
// cat can stand to climb onto a perch, or to pick something up.
function reachesWithin(a, x, z, r) {
  const f = flood(a);
  for (let i = Math.floor((x - r - f.minX) / STEP); i <= Math.ceil((x + r - f.minX) / STEP); i++) {
    for (let j = Math.floor((z - r - f.minZ) / STEP); j <= Math.ceil((z + r - f.minZ) / STEP); j++) {
      if (i < 0 || j < 0 || i >= f.nx || j >= f.nz || !f.seen[i * f.nz + j]) continue;
      if (Math.hypot(f.minX + i * STEP - x, f.minZ + j * STEP - z) < r) return true;
    }
  }
  return false;
}

// Whether the flood reached the grid cell at (x, z).
function reaches(a, x, z) {
  const f = flood(a);
  const i = Math.round((x - f.minX) / STEP), j = Math.round((z - f.minZ) / STEP);
  return i >= 0 && j >= 0 && i < f.nx && j < f.nz && f.seen[i * f.nz + j] === 1;
}

describe('the Pines: water', () => {
  it("declares the lake, the bay, the Black Mire's two reaches, four bogs and the Moor's river", () => {
    expect(PINES_WATERS.map((w) => w.id)).toEqual([
      'lake', 'lake-bay', 'mire-north', 'mire-west', 'bog-1', 'bog-2', 'bog-3', 'bog-4', 'moor-river', 'moor-mouth',
    ]);
    expect(area.waters).toEqual(PINES_WATERS);
    expect(Object.isFrozen(PINES_WATERS)).toBe(true);
    for (const w of PINES_WATERS) expect(Object.isFrozen(w), w.id).toBe(true);
  });

  it('every water is drawn from its own footprint, at the scene root', () => {
    for (const w of PINES_WATERS) {
      const m = scene.children.find((o) => o.isMesh && o.name === `water:${w.id}`);
      expect(m, w.id).toBeTruthy();
      const p = m.geometry.parameters;
      if (w.kind === 'circle') {
        expect(m.geometry.type).toBe('CircleGeometry');
        expect(p.radius).toBe(w.r);
        expect([m.position.x, m.position.z]).toEqual([w.x, w.z]);
      } else {
        expect(m.geometry.type).toBe('PlaneGeometry');
        expect([p.width, p.height]).toEqual([w.maxX - w.minX, w.maxZ - w.minZ]);
        expect([m.position.x, m.position.z]).toEqual([(w.minX + w.maxX) / 2, (w.minZ + w.maxZ) / 2]);
      }
    }
    expect(area.waterFx.map((fx) => fx.mesh.name)).toEqual(PINES_WATERS.map((w) => `water:${w.id}`));
  });

  it('draws overlapping waters at different heights, so they never z-fight', () => {
    const y = (id) => scene.children.find((o) => o.name === `water:${id}`).position.y;
    expect(y('lake')).not.toBe(y('lake-bay'));
    expect(y('mire-north')).not.toBe(y('mire-west'));
    expect(y('moor-river')).not.toBe(y('moor-mouth'));
    expect(y('moor-mouth')).not.toBe(y('lake'));
  });

  it("the Black Mire's two reaches meet watertight", () => {
    const n = byId('mire-north'), w = byId('mire-west');
    expect(n.maxZ).toBe(w.maxZ);
    expect(n.maxX).toBe(w.maxX);
    // The corner square's own edges are banks (a footprint's edge is dry), so
    // the grid runs over its inside, the seam between the two reaches included.
    const mire = [n, w];
    for (let x = -31.75; x <= -27.25 + 1e-9; x += 0.25) {
      for (let z = -10.75; z <= -6.25 + 1e-9; z += 0.25) {
        expect(inWater(mire, x, z), `(${x}, ${z})`).toBe(true);
      }
    }
  });

  it('the deep swamp can be reached only over the decks, and over either one alone', () => {
    const deep = [[-44, -26], [-45, -20], [-40, -36], [-46, -46]];
    for (const [x, z] of deep) expect(reaches(area, x, z), `(${x}, ${z})`).toBe(true);
    const noDecks = { ...area, waters: PINES_WATERS.map((w) => ({ ...w, decks: [] })) };
    for (const [x, z] of deep) expect(reaches(noDecks, x, z), `(${x}, ${z}) without decks`).toBe(false);
    // the mire only cuts off the deep swamp
    for (const [x, z] of [[-34, 24], [-18, -42], [40, -4]]) expect(reaches(noDecks, x, z), `(${x}, ${z})`).toBe(true);
    for (const keep of ['mire-north', 'mire-west']) {
      const one = { ...area, waters: PINES_WATERS.map((w) => (w.id === keep ? w : { ...w, decks: [] })) };
      for (const [x, z] of deep) expect(reaches(one, x, z), `only ${keep}'s deck: (${x}, ${z})`).toBe(true);
    }
  });

  it("the log bridge's deck is no wider than the log the kids see above the water", () => {
    const mire = byId('mire-north');
    const deck = mire.decks[0];
    const log = scene.getObjectByName('logBridge');
    expect(log).toBeTruthy();
    const waterY = scene.getObjectByName('water:mire-north').position.y;
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    // the log runs along x here: across the deck's whole width (z), at three
    // places over open water
    for (const x of [mire.minX + 0.5, (mire.minX + mire.maxX) / 2, mire.maxX - 0.5]) {
      for (let k = 0; k <= 10; k++) {
        const z = deck.minZ + (deck.maxZ - deck.minZ) * (k / 10);
        ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(log, true)[0];
        expect(hit && hit.point.y > waterY, `(${x}, ${z.toFixed(2)}) is open water`).toBe(true);
      }
    }
    expect(deck.maxZ - deck.minZ).toBeGreaterThanOrEqual(1.5);
    // -29.1 - -30.9 is 1.7999999999999972 in floating point: 1.8 m as written
    expect(deck.maxZ - deck.minZ).toBeGreaterThanOrEqual(1.8 - 1e-9);
    // and it spans the mire, landing on dry ground at both ends
    expect(deck.minX).toBeLessThan(mire.minX);
    expect(deck.maxX).toBeGreaterThan(mire.maxX);
  });

  it('the stepping stones cover their whole deck, with no open water anywhere on it', () => {
    const mire = byId('mire-west');
    const deck = mire.decks[0];
    const stones = scene.getObjectByName('steppingStones');
    expect(stones).toBeTruthy();
    const waterY = scene.getObjectByName('water:mire-west').position.y;
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    // the stones run along z here: every 5 cm across the mire, and across the
    // deck's full width (x), edges included
    const wet = [];
    for (let z = mire.minZ; z <= mire.maxZ + 1e-9; z += 0.05) {
      for (let k = 0; k <= 8; k++) {
        const x = deck.minX + (deck.maxX - deck.minX) * (k / 8);
        ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(stones, false)[0];
        if (!hit || hit.point.y <= waterY) wet.push(`(${x.toFixed(2)}, ${z.toFixed(2)})`);
      }
    }
    expect(wet.slice(0, 8)).toEqual([]);
    expect(deck.maxX - deck.minX).toBeGreaterThanOrEqual(1.5);
    expect((deck.maxX - deck.minX) / 2).toBeGreaterThanOrEqual(0.75);
    expect(deck.minZ).toBeLessThan(mire.minZ);
    expect(deck.maxZ).toBeGreaterThan(mire.maxZ);
  });

  it("the Pines' edges match the Moor's west edge and the River's north edge", () => {
    const w = (list, id) => list.find((x) => x.id === id);
    const lake = w(PINES_WATERS, 'lake'), bay = w(PINES_WATERS, 'lake-bay');
    const mLake = w(MOOR_WATERS, 'lake'), rLake = w(RIVER_WATERS, 'lake');
    const rFar = w(RIVER_WATERS, 'lake-far'), wLake = w(WOODS_WATERS, 'lake');
    // the Moor is +100 in x: one north shore across the border, and the Moor's east shore
    expect(lake.minZ).toBe(mLake.minZ);
    expect(lake.maxX).toBe(mLake.maxX + 100);
    expect(mLake.minX + 100).toBeLessThan(area.bounds.maxX);
    // the River is +100 in z: one west shore across the border, and the River's south shore (R3)
    expect(lake.minX).toBe(rLake.minX);
    expect(lake.maxZ).toBe(rLake.maxZ + 100);
    expect(rLake.minZ + 100).toBeLessThan(area.bounds.maxZ);
    // the bay round the island is the River's far lake; the corner is the Woods' (+100, +100)
    expect([bay.minX, bay.maxX, bay.minZ, bay.maxZ]).toEqual([rFar.minX, rFar.maxX, rFar.minZ + 100, rFar.maxZ + 100]);
    expect([lake.maxX, lake.maxZ]).toEqual([wLake.maxX + 100, wLake.maxZ + 100]);
    // the Moor's far water round the island is the same bay, +100 in x
    const mFar = w(MOOR_WATERS, 'lake-far');
    expect([mFar.minX + 100, mFar.maxX + 100, mFar.minZ, mFar.maxZ]).toEqual([bay.minX, bay.maxX, bay.minZ, bay.maxZ]);
    // the Moor's river, pouring into the lake just past the east edge
    for (const [mine, theirs] of [['moor-river', 'river-west'], ['moor-mouth', 'river-mouth']]) {
      const p = w(PINES_WATERS, mine), m = w(MOOR_WATERS, theirs);
      expect([p.minX, p.maxX, p.minZ, p.maxZ]).toEqual([m.minX + 100, m.maxX + 100, m.minZ, m.maxZ]);
      expect(p.minX).toBeGreaterThan(area.bounds.maxX);
    }
    // the River's north path comes in at the same x; no path crosses the Moor border
    const ends = (paths, pick) => paths.flatMap(([x1, z1, x2, z2]) => [[x1, z1], [x2, z2]]).filter(pick);
    expect(ends(PINES_PATHS, ([, z]) => z === 50).map(([x]) => x)).toEqual(ends(RIVER_PATHS, ([, z]) => z === -50).map(([x]) => x));
    expect(ends(PINES_PATHS, ([x]) => x === 50)).toEqual([]);
    expect(ends(MOOR_PATHS, ([x]) => x === -50)).toEqual([]);
  });
});

describe('the Pines: the island, the bridge and the truce path', () => {
  it('the island and the bridge are where the Woods, the River and the Moor show them', () => {
    expect(PINES_ISLAND).toEqual({ x: RIVER_ISLAND.x, z: RIVER_ISLAND.z + 100, r: 9, rise: 1.4 });
    expect([PINES_ISLAND.x, PINES_ISLAND.z]).toEqual([MOOR_ISLAND.x + 100, MOOR_ISLAND.z]);
    expect([PINES_ISLAND.x - 100, PINES_ISLAND.z - 100]).toEqual([-72, -72]);
    expect(Object.isFrozen(PINES_ISLAND)).toBe(true);

    const [[ix, iz], [sx, sz]] = ISLAND_BRIDGE_WOODS.map(([x, z]) => [x + 100, z + 100]);
    expect(BRIDGE_FOOT).toEqual({ x: sx, z: sz });
    expect(Object.isFrozen(BRIDGE_FOOT)).toBe(true);

    const plank = scene.getObjectByName('islandBridge');
    expect(plank).toBeTruthy();
    expect(Math.abs(plank.position.x - (ix + sx) / 2)).toBeLessThan(0.01);
    expect(Math.abs(plank.position.z - (iz + sz) / 2)).toBeLessThan(0.01);
    expect(Math.abs(plank.geometry.parameters.depth - Math.hypot(ix - sx, iz - sz))).toBeLessThan(0.01);
    // the River's convention: the yaw from the shore end to the island end
    expect(Math.abs(plank.rotation.y - Math.atan2(ix - sx, iz - sz))).toBeLessThan(1e-6);
  });

  it('the cat walks to the bridge foot and stops at the shore', () => {
    expect(reaches(area, BRIDGE_FOOT.x, 4.3)).toBe(true);
    const [[ix, iz]] = ISLAND_BRIDGE_WOODS.map(([x, z]) => [x + 100, z + 100]);
    for (let k = 0; k < 20; k++) {
      const t = 0.05 + (0.95 * k) / 19;
      const x = BRIDGE_FOOT.x + (ix - BRIDGE_FOOT.x) * t, z = BRIDGE_FOOT.z + (iz - BRIDGE_FOOT.z) * t;
      expect(isWalkableAt(area, x, z), `${t.toFixed(2)} of the way: (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(false);
    }
    expect(byId('lake').decks ?? []).toEqual([]);
    expect(byId('lake-bay').decks ?? []).toEqual([]);
    const I = PINES_ISLAND;
    for (const c of area.colliders) expect(Math.hypot(c.x - I.x, c.z - I.z)).toBeGreaterThan(I.r + 2);
    for (const p of area.perches) expect(Math.hypot(p.x - I.x, p.z - I.z)).toBeGreaterThan(I.r + 2);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = I.x + Math.cos(a) * I.r, z = I.z + Math.sin(a) * I.r;
      expect(inWater(PINES_WATERS, x, z), `rim ${k}`).toBe(true);
    }
  });

  it('the truce path runs from the River to the bridge', () => {
    expect(TRUCE_PATH).toHaveLength(4);
    expect(Object.isFrozen(TRUCE_PATH)).toBe(true);
    for (let i = 1; i < 4; i++) {
      expect([TRUCE_PATH[i][0], TRUCE_PATH[i][1]], `segment ${i}`).toEqual([TRUCE_PATH[i - 1][2], TRUCE_PATH[i - 1][3]]);
    }
    expect([TRUCE_PATH[0][0], TRUCE_PATH[0][1]]).toEqual([-26, 50]);
    const last = TRUCE_PATH[3];
    expect(Math.hypot(last[2] - BRIDGE_FOOT.x, last[3] - BRIDGE_FOOT.z)).toBeLessThanOrEqual(2.5);
    expect(segDist(SPAWN.x, SPAWN.z, TRUCE_PATH[0])).toBeLessThanOrEqual(1.6);
  });

  it("the horizon faces the Pines' neighbours", () => {
    expect(scene.children.filter((o) => o.name === 'horizonBand')).toHaveLength(1);
    // more pines, the Moor's heather, the River's green, the swamp going on
    expect(PINES_HORIZON.sideTints).toEqual({ north: 0x3f5a46, east: 0x9a8a9c, south: 0x7f9a66, west: 0x4a5a44 });
    expect(PINES_HORIZON.rooftops).toBeUndefined();
    for (const id of ['lake', 'mire-north', 'mire-west', 'moor-river', 'moor-mouth']) {
      expect(PINES_HORIZON.avoid, id).toContain(byId(id));
    }
    expect(Object.isFrozen(PINES_HORIZON)).toBe(true);
  });
});

describe('the Pines: the area record', () => {
  it("returns every key moor.js returns, named 'The Pines and Swamp'", () => {
    const moor = buildMoor(new THREE.Scene());
    for (const k of Object.keys(moor)) expect(area, k).toHaveProperty(k);
    expect(area.name).toBe('The Pines and Swamp');
    expect(area.spawn).toEqual({ x: SPAWN.x, z: SPAWN.z });
    expect(SPAWN).toEqual({ x: -26, z: 44 });
    expect(area.bounds).toEqual({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
  });

  it('is built the same every time', () => {
    const again = built().area;
    const plain = (a) => JSON.parse(JSON.stringify({ ...a, waterFx: undefined }));
    expect(plain(again)).toEqual(plain(area));
  });

  it('nothing in the Pines reads the edition', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/world/pines.js', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/edition/i);
  });
});
