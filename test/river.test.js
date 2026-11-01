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

const river = await import('../src/world/river.js');
const { WOODS_WATERS, WOODS_PATHS } = await import('../src/world/woods.js');
const { build: buildPark } = await import('../src/world/park.js');
const { inWater } = await import('../src/world/builder.js');
const { isWalkableAt } = await import('../src/player.js');

const { build, SPAWN, RIVER_WATERS, RIVER_PATHS, RIVER_ISLAND } = river;

const built = () => {
  const scene = new THREE.Scene();
  const area = build(scene);
  return { scene, area };
};
const { scene, area } = built();
const byId = (id) => RIVER_WATERS.find((w) => w.id === id);

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

// Whether the flood reached the grid cell at (x, z).
function reaches(a, x, z) {
  const f = flood(a);
  const i = Math.round((x - f.minX) / STEP), j = Math.round((z - f.minZ) / STEP);
  return i >= 0 && j >= 0 && i < f.nx && j < f.nz && f.seen[i * f.nz + j] === 1;
}

describe('the River: water', () => {
  it('declares the lake, the far lake round the island, the three reaches of the river, the pond and three pools', () => {
    expect(RIVER_WATERS.map((w) => w.id)).toEqual([
      'lake', 'lake-far', 'river-west', 'river-bend', 'river-east', 'pond', 'pool-1', 'pool-2', 'pool-3',
    ]);
    expect(area.waters).toEqual(RIVER_WATERS);
    expect(Object.isFrozen(RIVER_WATERS)).toBe(true);
    for (const w of RIVER_WATERS) expect(Object.isFrozen(w)).toBe(true);
  });

  it('every water is drawn from its own footprint, at the scene root', () => {
    for (const w of RIVER_WATERS) {
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
    expect(area.waterFx.map((fx) => fx.mesh.name)).toEqual(RIVER_WATERS.map((w) => `water:${w.id}`));
  });

  it('draws overlapping waters at different heights, so they never z-fight', () => {
    const y = (id) => scene.children.find((o) => o.name === `water:${id}`).position.y;
    expect(y('lake')).not.toBe(y('lake-far'));
    expect(y('river-west')).not.toBe(y('river-bend'));
    expect(y('river-bend')).not.toBe(y('river-east'));
    expect(y('river-east')).not.toBe(y('pond'));
  });

  it('the three reaches meet, and the pond overlaps the river', () => {
    const w = byId('river-west'), bend = byId('river-bend'), e = byId('river-east');
    expect(bend.minZ).toBe(w.minZ);
    expect(bend.maxX).toBe(w.maxX);
    expect(bend.maxZ).toBe(e.maxZ);
    expect(bend.minX).toBe(e.minX);
    const pond = byId('pond');
    for (let z = pond.z; z > e.minZ; z -= 0.25) {
      expect(inWater([pond, e], pond.x, z), `(${pond.x}, ${z})`).toBe(true);
    }
  });

  it('the river can be crossed only at the two decks', () => {
    const north = [[29, -29], [-30, -42], [22, -22]];
    for (const [x, z] of north) expect(reaches(area, x, z), `(${x}, ${z})`).toBe(true);
    const noDecks = { ...area, waters: RIVER_WATERS.map((w) => ({ ...w, decks: [] })) };
    for (const [x, z] of north) expect(reaches(noDecks, x, z), `(${x}, ${z}) without decks`).toBe(false);
    for (const keep of ['river-west', 'river-east']) {
      const one = { ...area, waters: RIVER_WATERS.map((w) => (w.id === keep ? w : { ...w, decks: [] })) };
      for (const [x, z] of north) expect(reaches(one, x, z), `only ${keep}'s deck: (${x}, ${z})`).toBe(true);
    }
  });

  it("the log bridge's deck is no wider than the log the kids see above the water", () => {
    const deck = byId('river-west').decks[0];
    const rw = byId('river-west');
    const log = scene.getObjectByName('logBridge');
    expect(log).toBeTruthy();
    const waterY = scene.getObjectByName('water:river-west').position.y;
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const z of [rw.minZ + 0.5, (rw.minZ + rw.maxZ) / 2, rw.maxZ - 0.5]) {
      for (let k = 0; k <= 10; k++) {
        const x = deck.minX + (deck.maxX - deck.minX) * (k / 10);
        ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(log, true)[0];
        expect(hit && hit.point.y > waterY, `(${x.toFixed(2)}, ${z}) is open water`).toBe(true);
      }
    }
    expect(deck.maxX - deck.minX).toBeGreaterThanOrEqual(1.5);
    expect(deck.minZ).toBeLessThan(rw.minZ);
    expect(deck.maxZ).toBeGreaterThan(rw.maxZ);
  });

  it('the stepping stones cover their whole deck, with no open water anywhere on it', () => {
    const deck = byId('river-east').decks[0];
    const re = byId('river-east');
    const stones = scene.getObjectByName('steppingStones');
    expect(stones).toBeTruthy();
    const waterY = scene.getObjectByName('water:river-east').position.y;
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const wet = [];
    for (let z = re.minZ; z <= re.maxZ + 1e-9; z += 0.05) {
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
    expect(deck.minZ).toBeLessThan(re.minZ);
    expect(deck.maxZ).toBeGreaterThan(re.maxZ);
  });

  it("the River's east edge matches the Woods' west edge", () => {
    const wPond = WOODS_WATERS.find((w) => w.id === 'pond');
    const rPond = RIVER_WATERS.find((w) => w.id === 'pond');
    // the shared pond: same size, same z, the same distance in from the shared edge
    expect([rPond.r, rPond.z]).toEqual([wPond.r, wPond.z]);
    expect(area.bounds.maxX - rPond.x).toBe(wPond.x - -50);
    // the river crosses the border at the same z
    const wRiver = WOODS_WATERS.find((w) => w.id === 'river-west');
    const rRiver = RIVER_WATERS.find((w) => w.id === 'river-east');
    expect([rRiver.minZ, rRiver.maxZ]).toEqual([wRiver.minZ, wRiver.maxZ]);
    expect(rRiver.maxX).toBeGreaterThan(area.bounds.maxX);
    // the long path leaves the Woods west and enters the River east at the same z
    const wEnd = WOODS_PATHS.flatMap(([x1, z1, x2, z2]) => [[x1, z1], [x2, z2]]).find(([x]) => x === -50);
    const rEnd = RIVER_PATHS.flatMap(([x1, z1, x2, z2]) => [[x1, z1], [x2, z2]]).find(([x]) => x === 50);
    expect(rEnd[1]).toBe(wEnd[1]);
    // the lake's south shore is one line across the border (R3)
    const wLake = WOODS_WATERS.find((w) => w.id === 'lake');
    const rLake = RIVER_WATERS.find((w) => w.id === 'lake');
    expect(rLake.maxZ).toBe(wLake.maxZ);
  });
});

describe('the River: the island and the horizon', () => {
  it('the island stands where the Woods shows it (R2)', () => {
    // The Woods draws it at (-72, -72); the River's map sits 100 m west of the Woods'.
    expect(RIVER_ISLAND).toMatchObject({ x: -72 + 100, z: -72 });
    expect(Object.isFrozen(RIVER_ISLAND)).toBe(true);
  });

  it('the island and its bridge are out on the lake and out of reach', () => {
    const { bounds } = area;
    const I = RIVER_ISLAND;
    const outside = (x, z) => x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ;
    expect(outside(I.x, I.z)).toBe(true);
    const lakes = [byId('lake'), byId('lake-far')];
    expect(inWater([byId('lake-far')], I.x, I.z)).toBe(true);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = I.x + Math.cos(a) * I.r, z = I.z + Math.sin(a) * I.r;
      expect(inWater(lakes, x, z), `rim ${k}`).toBe(true);
    }
    for (const c of area.colliders) expect(Math.hypot(c.x - I.x, c.z - I.z)).toBeGreaterThan(20);
    for (const p of area.perches) expect(Math.hypot(p.x - I.x, p.z - I.z)).toBeGreaterThan(20);
    // something is standing there
    const there = scene.children.filter((o) => Math.hypot(o.position.x - I.x, o.position.z - I.z) < 0.01);
    expect(there.length).toBeGreaterThanOrEqual(2);

    const bridge = scene.getObjectByName('islandBridge');
    expect(bridge).toBeTruthy();
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(bridge);
    const touches = box.min.x <= bounds.maxX && box.max.x >= bounds.minX
      && box.min.z <= bounds.maxZ && box.max.z >= bounds.minZ;
    expect(touches).toBe(false);
    // its two ends: the plank runs along its local z, turned to its yaw
    const half = bridge.geometry.parameters.depth / 2;
    const ends = [-1, 1].map((s) => [
      bridge.position.x + Math.sin(bridge.rotation.y) * half * s,
      bridge.position.z + Math.cos(bridge.rotation.y) * half * s,
    ]);
    const [north, south] = ends.sort((a, c) => a[1] - c[1]);
    // the south end is on the island's rim, the north end past the far lake's north edge
    expect(Math.abs(Math.hypot(south[0] - I.x, south[1] - I.z) - I.r)).toBeLessThan(1);
    expect(north[1]).toBeLessThanOrEqual(byId('lake-far').minZ);
  });

  it('paints one horizon band', () => {
    expect(scene.children.filter((o) => o.name === 'horizonBand')).toHaveLength(1);
  });
});

describe('the River: the area record', () => {
  it("returns every key park.js returns, named 'The River and Marshes'", () => {
    const park = buildPark(new THREE.Scene());
    for (const k of Object.keys(park)) expect(area, k).toHaveProperty(k);
    expect(area.name).toBe('The River and Marshes');
    expect(area.spawn).toEqual({ x: SPAWN.x, z: SPAWN.z });
    expect(area.bounds).toEqual({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
  });

  it('is built the same every time', () => {
    const again = built().area;
    const plain = (a) => JSON.parse(JSON.stringify({ ...a, waterFx: undefined }));
    expect(plain(again)).toEqual(plain(area));
  });

  it('nothing in the River reads the edition', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/world/river.js', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/edition/i);
  });
});
