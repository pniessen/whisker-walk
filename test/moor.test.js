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

const moor = await import('../src/world/moor.js');
const { build: buildWoods, WOODS_WATERS, WOODS_PATHS } = await import('../src/world/woods.js');
const { inWater } = await import('../src/world/builder.js');
const { isWalkableAt } = await import('../src/player.js');

const {
  build, SPAWN, MOOR_WATERS, MOOR_PATHS, MOOR_ISLAND, ISLAND_BRIDGE_WOODS, MOOR_HORIZON,
} = moor;

const built = () => {
  const scene = new THREE.Scene();
  const area = build(scene);
  return { scene, area };
};
const { scene, area } = built();
const byId = (id) => MOOR_WATERS.find((w) => w.id === id);

// Distance from (x, z) to the segment (x1, z1)-(x2, z2).
function segDist(x, z, [x1, z1, x2, z2]) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
}

// Distance from (x, z) to an axis-aligned rectangle (0 inside it).
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

describe('the Moor: water', () => {
  it('declares the lake, its far lip, the river\'s two reaches and its mouth', () => {
    expect(MOOR_WATERS.map((w) => w.id)).toEqual(['lake', 'lake-far', 'river-south', 'river-west', 'river-mouth']);
    expect(area.waters).toEqual(MOOR_WATERS);
    expect(Object.isFrozen(MOOR_WATERS)).toBe(true);
    for (const w of MOOR_WATERS) expect(Object.isFrozen(w)).toBe(true);
  });

  it('every water is drawn from its own footprint, at the scene root', () => {
    for (const w of MOOR_WATERS) {
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
    expect(area.waterFx.map((fx) => fx.mesh.name)).toEqual(MOOR_WATERS.map((w) => `water:${w.id}`));
  });

  it('draws overlapping waters at different heights, so they never z-fight', () => {
    const y = (id) => scene.children.find((o) => o.name === `water:${id}`).position.y;
    expect(y('river-south')).not.toBe(y('river-west'));
    expect(y('river-west')).not.toBe(y('river-mouth'));
    expect(y('river-mouth')).not.toBe(y('lake'));
    expect(y('lake')).not.toBe(y('lake-far'));
  });

  it("the river's reaches meet, and the mouth runs into the lake", () => {
    const s = byId('river-south'), w = byId('river-west'), m = byId('river-mouth'), lake = byId('lake');
    expect(s.minZ).toBe(w.minZ);
    expect(s.maxX).toBe(w.maxX);
    expect(m.minX).toBe(w.minX);
    expect(m.minZ).toBe(w.minZ);
    expect(m.maxZ).toBeGreaterThan(lake.minZ);
    // down the mouth's centreline from just inside the river's north bank
    // (z -4 itself is the bank, and a bank is dry) on into the lake to z 12
    const cx = (m.minX + m.maxX) / 2;
    for (let z = m.minZ + 0.25; z <= 12; z += 0.25) {
      expect(inWater(MOOR_WATERS, cx, z), `(${cx}, ${z})`).toBe(true);
    }
  });

  it('the lakeshore heath can be reached only over the decks, and over either one alone', () => {
    const heath = [[-6, 20], [8, 44], [-6, 30], [-10, 12], [-30, 4]];
    for (const [x, z] of heath) expect(reaches(area, x, z), `(${x}, ${z})`).toBe(true);
    const noDecks = { ...area, waters: MOOR_WATERS.map((w) => ({ ...w, decks: [] })) };
    for (const [x, z] of heath) expect(reaches(noDecks, x, z), `(${x}, ${z}) without decks`).toBe(false);
    // the moor top stays reachable without either: the river only cuts off the heath
    for (const [x, z] of [[-30, -14], [20, -40], [-45, 4]]) expect(reaches(noDecks, x, z), `(${x}, ${z})`).toBe(true);
    for (const keep of ['river-south', 'river-west']) {
      const one = { ...area, waters: MOOR_WATERS.map((w) => (w.id === keep ? w : { ...w, decks: [] })) };
      for (const [x, z] of heath) expect(reaches(one, x, z), `only ${keep}'s deck: (${x}, ${z})`).toBe(true);
    }
  });

  it("the log bridge's deck is no wider than the log the kids see above the water", () => {
    const deck = byId('river-west').decks[0];
    const river = byId('river-west');
    const log = scene.getObjectByName('logBridge');
    expect(log).toBeTruthy();
    const waterY = scene.getObjectByName('water:river-west').position.y;
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    // across the deck's whole width, at three places over open water
    for (const z of [river.minZ + 0.5, (river.minZ + river.maxZ) / 2, river.maxZ - 0.5]) {
      for (let k = 0; k <= 10; k++) {
        const x = deck.minX + (deck.maxX - deck.minX) * (k / 10);
        ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(log, true)[0];
        expect(hit && hit.point.y > waterY, `(${x.toFixed(2)}, ${z}) is open water`).toBe(true);
      }
    }
    // wide enough to steer onto with a thumb: the 1.5 m floor, and the log's 1.8
    expect(deck.maxX - deck.minX).toBeGreaterThanOrEqual(1.5);
    expect(deck.maxX - deck.minX).toBeGreaterThanOrEqual(1.8);
    // and it spans the river, landing on dry ground at both ends
    expect(deck.minZ).toBeLessThan(river.minZ);
    expect(deck.maxZ).toBeGreaterThan(river.maxZ);
  });

  it('the stepping stones cover their whole deck, with no open water anywhere on it', () => {
    const deck = byId('river-south').decks[0];
    const river = byId('river-south');
    const stones = scene.getObjectByName('steppingStones');
    expect(stones).toBeTruthy();
    const waterY = scene.getObjectByName('water:river-south').position.y;
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    // every 5 cm across the river, and across the deck's full width, edges
    // included: a stone is under every point, standing above the water
    const wet = [];
    for (let x = river.minX; x <= river.maxX + 1e-9; x += 0.05) {
      for (let k = 0; k <= 8; k++) {
        const z = deck.minZ + (deck.maxZ - deck.minZ) * (k / 8);
        ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(stones, false)[0];
        if (!hit || hit.point.y <= waterY) wet.push(`(${x.toFixed(2)}, ${z.toFixed(2)})`);
      }
    }
    expect(wet.slice(0, 8)).toEqual([]);
    expect(deck.maxZ - deck.minZ).toBeGreaterThanOrEqual(1.5);
    // as wide as the stones look, so a cat on their visible edge is on the deck
    expect((deck.maxZ - deck.minZ) / 2).toBeGreaterThanOrEqual(0.75);
    // and the crossing runs from bank to bank
    expect(deck.minX).toBeLessThan(river.minX);
    expect(deck.maxX).toBeGreaterThan(river.maxX);
  });

  it("the Moor's south edge matches the Woods' north edge", () => {
    // the river leaves the Woods north and enters the Moor south at the same x
    const wRiver = WOODS_WATERS.find((w) => w.id === 'river-north');
    const mRiver = MOOR_WATERS.find((w) => w.id === 'river-south');
    expect([mRiver.minX, mRiver.maxX]).toEqual([wRiver.minX, wRiver.maxX]);
    expect(wRiver.minZ).toBeLessThan(-50);
    expect(mRiver.maxZ).toBeGreaterThan(area.bounds.maxZ);
    // the lake crosses the border over the same x
    const wLake = WOODS_WATERS.find((w) => w.id === 'lake');
    const mLake = MOOR_WATERS.find((w) => w.id === 'lake');
    expect([mLake.minX, mLake.maxX]).toEqual([wLake.minX, wLake.maxX]);
    expect(wLake.minZ).toBeLessThan(-50);
    // and the lake's south shore is one line across the border (the River's R3 rule)
    expect(mLake.maxZ).toBe(wLake.maxZ + 100);
    // the north path leaves the Woods and enters the Moor at the same x
    const ends = (paths, z) => paths.flatMap(([x1, z1, x2, z2]) => [[x1, z1], [x2, z2]]).filter(([, pz]) => pz === z).map(([x]) => x);
    expect(ends(MOOR_PATHS, 50)).toEqual(ends(WOODS_PATHS, -50));
    // the island and its bridge are the Woods' own, 100 m on in z
    expect([MOOR_ISLAND.x, MOOR_ISLAND.z - 100]).toEqual([-72, -72]);
    const box = new THREE.Box3().setFromObject(scene.getObjectByName('islandBridge'));
    const [[, az], [, bz]] = ISLAND_BRIDGE_WOODS;
    // The plank's box reaches past its centreline ends by its half-width
    // turned with it (0.6 m in z for a 2 m plank running at this slant), so
    // the box is held to within a metre of the ends, not half a metre.
    expect(Math.abs(box.min.z - (Math.min(az, bz) + 100))).toBeLessThan(1);
    expect(Math.abs(box.max.z - (Math.max(az, bz) + 100))).toBeLessThan(1);
  });
});

describe('the Moor: the island and the horizon', () => {
  it('the island and its bridge are out on the lake and out of reach', () => {
    const { bounds } = area;
    const I = MOOR_ISLAND;
    const outside = (x, z) => x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ;
    expect(outside(I.x, I.z)).toBe(true);
    expect(I.r).toBe(9);
    const lakes = [byId('lake'), byId('lake-far')];
    expect(inWater(lakes, I.x, I.z)).toBe(true);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = I.x + Math.cos(a) * I.r, z = I.z + Math.sin(a) * I.r;
      expect(inWater(lakes, x, z), `rim ${k}`).toBe(true);
    }
    for (const c of area.colliders) expect(Math.hypot(c.x - I.x, c.z - I.z)).toBeGreaterThan(20);
    for (const p of area.perches) expect(Math.hypot(p.x - I.x, p.z - I.z)).toBeGreaterThan(20);
    // something is standing there: the mound and its tree
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
    // the south-east end is on the island's rim; the north-west end is out
    // past the far lip's north edge, inside its x range
    expect(Math.abs(Math.hypot(south[0] - I.x, south[1] - I.z) - I.r)).toBeLessThan(1);
    expect(south[0]).toBeGreaterThan(north[0]);
    const far = byId('lake-far');
    expect(north[1]).toBeLessThanOrEqual(far.minZ + 1e-9);
    expect(north[0]).toBeGreaterThanOrEqual(far.minX);
    expect(north[0]).toBeLessThanOrEqual(far.maxX);
  });

  it("the horizon faces the Moor's neighbours", () => {
    expect(scene.children.filter((o) => o.name === 'horizonBand')).toHaveLength(1);
    // heather, the Gorge's unexplored rock, the Woods, the pines
    expect(MOOR_HORIZON.sideTints).toEqual({ north: 0x9a8a9c, east: 0x8a8478, south: 0x4f7a48, west: 0x3f5a46 });
    // Twolegplace is not next to the Moor
    expect(MOOR_HORIZON.rooftops).toBeUndefined();
    for (const id of ['lake', 'lake-far', 'river-south']) expect(MOOR_HORIZON.avoid, id).toContain(byId(id));
    expect(Object.isFrozen(MOOR_HORIZON)).toBe(true);
  });
});

describe('the Moor: the area record', () => {
  it("returns every key woods.js returns, named 'The Moor'", () => {
    const woods = buildWoods(new THREE.Scene());
    for (const k of Object.keys(woods)) expect(area, k).toHaveProperty(k);
    expect(area.name).toBe('The Moor');
    expect(area.spawn).toEqual({ x: SPAWN.x, z: SPAWN.z });
    expect(SPAWN).toEqual({ x: 46, z: 44 });
    expect(area.bounds).toEqual({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
  });

  it('is built the same every time', () => {
    const again = built().area;
    const plain = (a) => JSON.parse(JSON.stringify({ ...a, waterFx: undefined }));
    expect(plain(again)).toEqual(plain(area));
  });

  it('nothing in the Moor reads the edition', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/world/moor.js', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/edition/i);
  });
});
