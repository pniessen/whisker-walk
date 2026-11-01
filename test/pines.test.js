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
const { inWater, waterGap, waterClearance } = await import('../src/world/builder.js');
const { isWalkableAt } = await import('../src/player.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { clearSpot } = await import('../src/world/spots.js');
const { raceCourse } = await import('../src/race.js');
const { seedFromCode } = await import('../src/rng.js');
const { propsFor } = await import('../src/propsets.js');

const {
  build, SPAWN, PINES_WATERS, PINES_PATHS, TRUCE_PATH, PINES_ISLAND, BRIDGE_FOOT, PINES_HORIZON,
  PINES_KEEP_CLEAR, FROG_HIDES, pinesTrees,
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

describe('the Pines: things to find, climb and race', () => {
  const POIS = [[-14, 30], [-34, 24], [-18, 6], [-6, -8], [-18, -42], [12, -40], [34, -30], [40, -4], [-44, -26]];
  const perchAt = (x, z) => area.perches.find((p) => p.x === x && p.z === z && !p.requires);
  const collider = (x, z) => area.colliders.find((c) => c.x === x && c.z === z);
  const waterDist = (x, z) => Math.min(...PINES_WATERS.map((w) => waterGap(w, x, z)));
  const GOLD_BUSHES = [[28, -40], [32, -40], [30, -45]];
  // Where the race rings stand: each POI pushed clear of colliders and water,
  // exactly as the game does.
  const rings = () => area.pois.map((p) => clearSpot(p, area.colliders, area.bounds, area.waters));

  it('pines: nine POIs, all at least 2 m from water and clear of every collider by 1.6', () => {
    expect(area.pois.map((p) => [p.x, p.z])).toEqual(POIS);
    for (const p of area.pois) {
      const at = `poi (${p.x}, ${p.z})`;
      expect(waterDist(p.x, p.z), at).toBeGreaterThanOrEqual(2);
      // clear by clearSpot's own margin, so a race ring stands on the POI
      for (const c of area.colliders) {
        expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, `${at} by (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(1.6);
      }
    }
    expect(rings().map((p) => [p.x, p.z])).toEqual(POIS);
  });

  it('pines: five collectibles, three scenics, at least two vantage perches', () => {
    expect(area.collectibles).toEqual([
      { id: 'pines-find-1', x: -20, z: 20, label: 'a fat pine cone' },
      { id: 'pines-find-2', x: 24, z: -14, label: 'an owl feather' },
      { id: 'pines-find-3', x: -46, z: 22, label: 'a tuft of bog cotton' },
      { id: 'pines-find-4', x: -40, z: -36, label: 'a shiny beetle shell' },
      { id: 'pines-find-5', x: -37, z: -15, y: 0.72, label: 'a mossy pebble on the low stone' },
    ]);
    expect(area.scenics).toEqual([
      { id: 'island-bridge', x: 8, z: 1, label: 'the bridge to the island' },
      { id: 'black-mire', x: -24, z: -22, label: 'the black mire' },
      { id: 'swamp-heart', x: -45, z: -20, label: 'the heart of the swamp' },
    ]);
    const vantages = area.perches.filter((p) => p.vantage);
    expect(vantages.length).toBeGreaterThanOrEqual(2);
    for (const v of vantages) expect(typeof v.label).toBe('string');
  });

  it("pines: the Lightning Stump chain is two hops and its top can't be reached from the ground", () => {
    const low = perchAt(4, -28);
    const top = perchAt(3, -29);
    expect(low).toEqual({ x: 4, z: -28, y: 0.72, kind: 'stone' });
    expect(top).toEqual({ x: 3, z: -29, y: 1.9, kind: 'stone', label: 'lightning stump', vantage: true });
    expect(collider(4, -28)?.r).toBe(0.7);
    expect(collider(3, -29)?.r).toBe(0.9);
    expect(canReach(low, { x: low.x, z: low.z }, 0)).toBe(true);
    expect(canReach(top, { x: low.x, z: low.z }, low.y)).toBe(true);
    expect(canReach(top, { x: top.x, z: top.z }, 0)).toBe(false);
    expect(reachesWithin(area, low.x, low.z, BASE_CLIMB_BUDGET.reachLow)).toBe(true);
  });

  it("pines: the Frog Stones chain is two hops and its top can't be reached from the ground", () => {
    const low = perchAt(-37, -15);
    const top = perchAt(-38, -16);
    expect(low).toEqual({ x: -37, z: -15, y: 0.72, kind: 'stone' });
    expect(top).toEqual({ x: -38, z: -16, y: 1.9, kind: 'stone', label: 'frog stones', vantage: true });
    expect(collider(-37, -15)?.r).toBe(0.7);
    expect(collider(-38, -16)?.r).toBe(0.9);
    expect(canReach(low, { x: low.x, z: low.z }, 0)).toBe(true);
    expect(canReach(top, { x: low.x, z: low.z }, low.y)).toBe(true);
    expect(canReach(top, { x: top.x, z: top.z }, 0)).toBe(false);
    expect(reachesWithin(area, low.x, low.z, BASE_CLIMB_BUDGET.reachLow)).toBe(true);
  });

  it('pines: the fallen pine is a perch and a seat', () => {
    expect(perchAt(-14, 42)).toEqual({ x: -14, z: 42, y: 0.5, kind: 'tree' });
    for (const [x, z] of [[-14.58, 40.63], [-14, 42], [-13.42, 43.37]]) expect(collider(x, z)?.r, `(${x}, ${z})`).toBe(0.4);
    const log = scene.getObjectByName('fallenPine');
    expect(log).toBeTruthy();
    expect([log.position.x, log.position.z, log.rotation.y]).toEqual([-14, 42, 0.4]);
  });

  it('the tall pillars are as wide at the foot as their colliders', () => {
    for (const name of ['lightningStump', 'frogStone']) {
      const tall = scene.getObjectByName(name);
      expect(tall, name).toBeTruthy();
      expect(tall.geometry.parameters.radiusBottom, name).toBe(0.9);
      expect(tall.geometry.parameters.radiusTop, name).toBe(0.75);
      expect(tall.geometry.parameters.height, name).toBe(1.9);
      expect(tall.geometry.parameters.radialSegments, name).toBe(7);
    }
    expect(scene.getObjectByName('lightningStump').position).toMatchObject({ x: 3, y: 0.95, z: -29 });
    expect(scene.getObjectByName('frogStone').position).toMatchObject({ x: -38, y: 0.95, z: -16 });
    // the stump charred, the stone mossy grey
    expect(scene.getObjectByName('lightningStump').material.color.getHex()).toBe(0x3e342c);
    expect(scene.getObjectByName('frogStone').material.color.getHex()).toBe(0x7a8270);
    // the two boulders, one material made per build
    const rocks = ['lightningStumpRock', 'frogStoneRock'].map((n) => scene.getObjectByName(n));
    for (const r of rocks) expect(r).toBeTruthy();
    expect([rocks[0].position.x, rocks[0].position.z]).toEqual([4, -28]);
    expect([rocks[1].position.x, rocks[1].position.z]).toEqual([-37, -15]);
    expect(rocks[0].material).toBe(rocks[1].material);
    expect(built().scene.getObjectByName('frogStoneRock').material).not.toBe(rocks[0].material);
  });

  it('puts the climbing golden mice on the chain tops and hides the third among three bushes', () => {
    const [stump, stones, hidden] = GOLD_MICE.pines;
    expect(GOLD_MICE.pines).toEqual([
      { id: 'gm-pines-1', x: 3, z: -29, y: 1.9 },
      { id: 'gm-pines-2', x: -38, z: -16, y: 1.9 },
      { id: 'gm-pines-3', x: 30, z: -42, y: 0 },
    ]);
    expect(perchAt(stump.x, stump.z)?.y).toBe(stump.y);
    expect(perchAt(stones.x, stones.z)?.y).toBe(stones.y);
    expect(hidden.y).toBe(0);
    for (const [x, z] of GOLD_BUSHES) {
      const bush = scene.children.find((o) => o.position.x === x && o.position.z === z);
      expect(bush, `bush (${x}, ${z})`).toBeTruthy();
      // a cat pushes through a bush: nothing stands in its way
      expect(collider(x, z)).toBeUndefined();
    }
  });

  // Everything a kid hunts for, with where a cat must stand to get it: on the
  // spot itself for a POI, a race ring, a scenic, a ground find or a frog
  // hide; within the climb reach of the first rock of the chain an elevated
  // one sits on.
  const targets = () => {
    const firstStep = (x, z) => {
      if (Math.hypot(x - 3, z - -29) < 1.5) return perchAt(4, -28);
      if (Math.hypot(x - -38, z - -16) < 1.5) return perchAt(-37, -15);
      return null;
    };
    const list = [
      ...area.pois.map((p) => ({ what: `poi (${p.x}, ${p.z})`, ...p })),
      ...rings().map((p) => ({ what: `race ring (${p.x}, ${p.z})`, ...p })),
      ...area.scenics.map((p) => ({ what: p.id, ...p })),
      ...area.collectibles.map((p) => ({ what: p.id, ...p })),
      ...GOLD_MICE.pines.map((p) => ({ what: p.id, ...p })),
      ...FROG_HIDES.map((p) => ({ what: `frog hide (${p.x}, ${p.z})`, ...p })),
    ];
    return list.map((t) => {
      if (!(t.y > 0)) return t;
      const step = firstStep(t.x, t.z);
      expect(step, `${t.what} sits on no chain`).toBeTruthy();
      return { ...t, step };
    });
  };

  it('every find, POI, scenic, golden mouse, frog hide and race ring is reachable on foot from the spawn', () => {
    const missed = [];
    for (const t of targets()) {
      const ok = t.step
        ? reachesWithin(area, t.step.x, t.step.z, BASE_CLIMB_BUDGET.reachLow)
        : reaches(area, t.x, t.z);
      if (!ok) missed.push(t.what);
    }
    expect(missed).toEqual([]);
  });

  it('keeps every find, chain perch, bush, puddle, frog hide, truce stone, the bridge foot and the spawn in PINES_KEEP_CLEAR', () => {
    const has = (x, z) => PINES_KEEP_CLEAR.some(([px, pz]) => Math.abs(px - x) < 1e-9 && Math.abs(pz - z) < 1e-9);
    const chainPerches = area.perches.filter((p) => !p.requires && p.y > 0.6);
    expect(chainPerches).toHaveLength(4);
    const all = [
      ...area.pois, ...area.scenics, ...area.collectibles, ...GOLD_MICE.pines, ...chainPerches,
      ...GOLD_BUSHES.map(([x, z]) => ({ x, z })), ...area.puddles, ...FROG_HIDES,
      { x: 9.0, z: 3.6 }, { x: 12.2, z: 3.6 }, BRIDGE_FOOT, SPAWN,
    ];
    for (const p of all) expect(has(p.x, p.z), `(${p.x}, ${p.z})`).toBe(true);
    // and nothing else: 9 POIs + 3 scenics + 5 collectibles + 3 golden mice +
    // 4 chain perches + 3 gold bushes + 2 puddles + 3 frog hides + 2 truce
    // stones + the bridge foot + the spawn
    expect(all).toHaveLength(36);
    expect(PINES_KEEP_CLEAR).toHaveLength(36);
    expect(Object.isFrozen(PINES_KEEP_CLEAR)).toBe(true);
    // the bridge foot is derived in floating point, so it is matched within a hair
    expect(PINES_KEEP_CLEAR.some(([x, z]) => Math.abs(x - 10.6) < 1e-6 && Math.abs(z - 4.8) < 1e-6)).toBe(true);
  });

  // The chase camera at the default zoom step (camzoom step 1): a cat 3 m
  // from the pillar, the camera 4.5 m further out and 2.2 m up. Nothing in the
  // way: not the pillar, not its boulder, not the merged pine stand and not
  // any near pine (both come with the scenery, and this runs again then,
  // unchanged).
  const blockers = (pillar, rock) => {
    const list = [scene.getObjectByName(pillar), scene.getObjectByName(rock)];
    for (const l of list) expect(l).toBeTruthy();
    scene.traverse((o) => {
      if (o.name === 'standTrunks' || o.name === 'standFoliage') list.push(o);
    });
    for (const t of pinesTrees().near) {
      const tree = scene.children.find((o) => o.position.x === t.x && o.position.z === t.z);
      expect(tree, `near pine (${t.x}, ${t.z})`).toBeTruthy();
      list.push(tree);
    }
    return list;
  };
  const inSight = (m, sides, objects) => {
    scene.updateMatrixWorld(true);
    const target = new THREE.Vector3(m.x, m.y + 0.12, m.z);
    for (const [dx, dz] of sides) {
      const cam = new THREE.Vector3(m.x + dx * 7.5, 2.2, m.z + dz * 7.5);
      const dir = target.clone().sub(cam);
      const ray = new THREE.Raycaster(cam, dir.clone().normalize(), 0, dir.length());
      expect(ray.intersectObjects(objects, true).length, `camera ${dx},${dz}`).toBe(0);
    }
  };

  it("the Lightning Stump's and the Frog Stones' golden mice are in sight from the chase camera", () => {
    const [stump, stones] = GOLD_MICE.pines;
    inSight(stump, [[0, -1], [0, 1], [-1, 0], [1, 0]], blockers('lightningStump', 'lightningStumpRock'));
    // The Frog Stones from the north and the west only: its east camera is
    // over mire-north and its south camera over mire-west, where no cat stands.
    inSight(stones, [[0, -1], [-1, 0]], blockers('frogStone', 'frogStoneRock'));
  });

  it('carries its critters, one moment and two puddles, and no villagers', () => {
    expect(area.critterSpawns.filter((c) => c.type !== 'bird')).toEqual([
      // dry beside bog-1 and bog-2, not through them as the plan drew them,
      // so a cat can stalk them
      { type: 'frog', x: -35, z: 21, x2: -35.5, z2: 16 },
      { type: 'frog', x: -40, z: 35, x2: -40, z2: 30 },
      { type: 'frog', x: -34, z: -26, x2: -40, z2: -30 },
      { type: 'squirrel', x: -12, z: -34 }, { type: 'squirrel', x: 20, z: -20 },
      { type: 'duck', x: 34, z: 14 }, { type: 'duck', x: 36, z: 16 }, { type: 'duck', x: 38, z: 13 },
      { type: 'mouse', x: 10, z: -36, x2: 16, z2: -30 },
      { type: 'mouse', x: -20, z: -44, x2: -14, z2: -38 },
    ]);
    expect(area.critterSpawns.filter((c) => c.type === 'bird'))
      .toEqual(pinesTrees().near.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })));
    expect(area.critterSpawns.some((c) => c.type === 'villager' || c.type === 'butterfly')).toBe(false);
    expect(area.moments).toEqual([
      { id: 'frog-plop', type: 'frog', label: 'a frog hopping for the bog', x: -36.1, z: 16, from: { x: -30, z: 22 } },
    ]);
    expect(area.puddles).toEqual([{ x: -6, z: 38, r: 0.9 }, { x: 22, z: -6, r: 0.8 }]);
    for (const p of area.puddles) {
      expect(scene.children.some((o) => o.position.x === p.x && o.position.z === p.z && o.geometry?.type === 'CircleGeometry')).toBe(true);
    }
    expect(area.boxes).toEqual([]);
    expect(area.tippables).toEqual([]);
  });

  it('every critter but a duck patrols dry ground, clear of the water, where a cat can reach it', () => {
    // decks ignored: a log or a stone is no place for a frog to pace
    const undecked = PINES_WATERS.map((w) => ({ ...w, decks: [] }));
    const walkers = area.critterSpawns.filter((c) => c.type !== 'duck');
    expect(walkers.filter((c) => c.x2 !== undefined).length).toBeGreaterThanOrEqual(5);
    for (const c of walkers) {
      const x2 = c.x2 ?? c.x, z2 = c.z2 ?? c.z;
      for (let k = 0; k <= 40; k++) {
        const x = c.x + (x2 - c.x) * (k / 40), z = c.z + (z2 - c.z) * (k / 40);
        const at = `${c.type} (${c.x}, ${c.z}) at (${x.toFixed(2)}, ${z.toFixed(2)})`;
        expect(inWater(PINES_WATERS, x, z), at).toBe(false);
        expect(waterClearance(undecked, x, z), at).toBeGreaterThanOrEqual(0.6);
      }
      expect(reaches(area, c.x, c.z), `${c.type} (${c.x}, ${c.z})`).toBe(true);
      expect(reaches(area, x2, z2), `${c.type} (${x2}, ${z2})`).toBe(true);
    }
    // each bog-side frog ends its patrol by its own hide
    const frogs = area.critterSpawns.filter((c) => c.type === 'frog');
    expect(Math.hypot(frogs[0].x2 - FROG_HIDES[0].x, frogs[0].z2 - FROG_HIDES[0].z)).toBeLessThanOrEqual(1);
    expect(Math.hypot(frogs[1].x2 - FROG_HIDES[1].x, frogs[1].z2 - FROG_HIDES[1].z)).toBeLessThanOrEqual(1);
  });

  it("the frog hides are the Pines' hides, each dry, reachable and 0.4 m off a bog", () => {
    expect(FROG_HIDES).toEqual([{ x: -36.1, z: 16 }, { x: -40.6, z: 30 }, { x: -34.1, z: -22 }]);
    const s = propsFor('pines');
    expect(s.hides).toEqual(FROG_HIDES);
    for (const h of s.hides) {
      const at = `(${h.x}, ${h.z})`;
      expect(inWater(PINES_WATERS, h.x, h.z), at).toBe(false);
      expect(Math.abs(waterClearance(PINES_WATERS, h.x, h.z) - 0.4), at).toBeLessThan(0.01);
      expect(reaches(area, h.x, h.z), at).toBe(true);
    }
    for (const k of ['carryables', 'knockables', 'markables', 'flaps', 'rests', 'keepSlots']) expect(s[k], k).toEqual([]);
    expect(s.dogYard).toBeNull();
  });

  it('race: a Pines course of five rings is drawn from its POIs', () => {
    const course = raceCourse(area.pois, seedFromCode('2026-11-01-pines'));
    expect(course).toHaveLength(5);
    expect(new Set(course).size).toBe(5);
    for (const p of course) expect(area.pois).toContain(p);
  });
});
