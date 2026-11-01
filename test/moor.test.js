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
const { inWater, waterGap } = await import('../src/world/builder.js');
const { isWalkableAt } = await import('../src/player.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { clearSpot } = await import('../src/world/spots.js');
const { raceCourse } = await import('../src/race.js');
const { seedFromCode } = await import('../src/rng.js');
const { propsFor } = await import('../src/propsets.js');

const {
  build, SPAWN, MOOR_WATERS, MOOR_PATHS, MOOR_ISLAND, ISLAND_BRIDGE_WOODS, MOOR_HORIZON,
  TORS, WARREN_BURROWS, MOOR_KEEP_CLEAR, moorTrees, moorHeather, moorGorse, moorReeds,
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
  it('declares the lake, its bay round the island, the river\'s two reaches and its mouth', () => {
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
    // the plank's two centreline ends: it runs along its local z, turned to its yaw
    const plank = scene.getObjectByName('islandBridge');
    const half = plank.geometry.parameters.depth / 2;
    const plankEnds = [-1, 1].map((k) => [
      plank.position.x + Math.sin(plank.rotation.y) * half * k,
      plank.position.z + Math.cos(plank.rotation.y) * half * k,
    ]).sort((a, c) => a[1] - c[1]);
    const want = ISLAND_BRIDGE_WOODS.map(([x, z]) => [x, z + 100]).sort((a, c) => a[1] - c[1]);
    for (let i = 0; i < 2; i++) {
      expect(plankEnds[i][0], `end ${i} x`).toBeCloseTo(want[i][0], 6);
      expect(plankEnds[i][1], `end ${i} z`).toBeCloseTo(want[i][1], 6);
    }
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
    // past the bay's north edge, inside its x range
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

describe('the Moor: things to find, climb and race', () => {
  const POIS = [[40, 8], [30, 24], [6, -14], [-30, -14], [-24, -40], [20, -40], [-6, 20], [8, 44], [40, -24]];
  const perchAt = (x, z) => area.perches.find((p) => p.x === x && p.z === z && !p.requires);
  const collider = (x, z) => area.colliders.find((c) => c.x === x && c.z === z);
  const waterDist = (x, z) => Math.min(...MOOR_WATERS.map((w) => waterGap(w, x, z)));
  // Where the race rings stand: each POI pushed clear of colliders and water,
  // exactly as the game does.
  const rings = () => area.pois.map((p) => clearSpot(p, area.colliders, area.bounds, area.waters));

  it('moor: nine POIs, all at least 2 m from water and clear of every collider', () => {
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

  it('moor: five collectibles, three scenics, at least two vantage perches', () => {
    expect(area.collectibles).toEqual([
      { id: 'moor-find-1', x: 30, z: 14, label: 'a tuft of rabbit fur' },
      { id: 'moor-find-2', x: -28, z: -26, label: 'a skylark feather' },
      { id: 'moor-find-3', x: -6, z: 30, label: 'a smooth pebble from the lakeshore' },
      { id: 'moor-find-4', x: 10, z: -20, label: 'a sprig of white heather' },
      { id: 'moor-find-5', x: -18, z: -34, y: 0.72, label: 'a gorse flower on the low rock' },
    ]);
    expect(area.scenics).toEqual([
      { id: 'moor-lake', x: -10, z: 12, label: 'the lake and the island' },
      { id: 'river-bend', x: 28, z: -10, label: 'where the river turns west' },
      { id: 'warren', x: 34, z: -32, label: 'the rabbit warren' },
    ]);
    const vantages = area.perches.filter((p) => p.vantage);
    expect(vantages.length).toBeGreaterThanOrEqual(2);
    for (const v of vantages) expect(typeof v.label).toBe('string');
  });

  it("moor: the High Tor chain is two hops and its top can't be reached from the ground", () => {
    const low = perchAt(-18, -34);
    const top = perchAt(-19, -35);
    expect(low).toEqual({ x: -18, z: -34, y: 0.72, kind: 'stone' });
    expect(top).toEqual({ x: -19, z: -35, y: 1.9, kind: 'stone', label: 'high tor', vantage: true });
    expect(collider(-18, -34)?.r).toBe(0.7);
    expect(collider(-19, -35)?.r).toBe(0.9);
    expect(canReach(low, { x: low.x, z: low.z }, 0)).toBe(true);
    expect(canReach(top, { x: low.x, z: low.z }, low.y)).toBe(true);
    expect(canReach(top, { x: top.x, z: top.z }, 0)).toBe(false);
    expect(reachesWithin(area, low.x, low.z, BASE_CLIMB_BUDGET.reachLow)).toBe(true);
  });

  it("moor: the old hawthorn chain is two hops and its branch can't be reached from the ground", () => {
    const boulder = perchAt(-3.6, 36.6);
    const branch = perchAt(-2, 38);
    expect(boulder).toEqual({ x: -3.6, z: 36.6, y: 0.72, kind: 'stone' });
    expect(branch).toEqual({ x: -2, z: 38, y: 2.1, kind: 'tree', label: 'old hawthorn lookout', vantage: true });
    expect(collider(-3.6, 36.6)?.r).toBe(0.7);
    expect(collider(-2, 38)?.r).toBe(0.8);
    // the root that closes the crevice between the boulder and the trunk
    expect(collider(-2.83, 37.27)?.r).toBe(0.35);
    expect(canReach(boulder, { x: boulder.x, z: boulder.z }, 0)).toBe(true);
    expect(canReach(branch, { x: boulder.x, z: boulder.z }, boulder.y)).toBe(true);
    expect(canReach(branch, { x: branch.x, z: branch.z }, 0)).toBe(false);
    expect(reachesWithin(area, boulder.x, boulder.z, BASE_CLIMB_BUDGET.reachLow)).toBe(true);
  });

  it('moor: each tor is one hop up, and its top is where its perch is', () => {
    expect(TORS).toEqual([
      { x: 28, z: -44, r: 1.4, h: 1.5 },
      { x: -40, z: -22, r: 1.2, h: 1.2 },
      { x: 42, z: -6, r: 1.3, h: 1.4 },
      { x: 12, z: 18, r: 1.2, h: 1.1 },
    ]);
    scene.updateMatrixWorld(true);
    TORS.forEach(({ x, z, r, h }, i) => {
      const perch = perchAt(x, z);
      expect(perch, `tor ${i}`).toEqual({ x, z, y: h, kind: 'stone' });
      expect(collider(x, z), `tor ${i}`).toEqual({ x, z, r });
      expect(canReach(perch, { x, z }, 0), `tor ${i}`).toBe(true);
      // and a cat can walk up to it
      expect(reachesWithin(area, x, z, BASE_CLIMB_BUDGET.reachHigh), `tor ${i}`).toBe(true);
      const mesh = scene.getObjectByName(`tor-${i}`);
      expect(mesh, `tor-${i}`).toBeTruthy();
      const box = new THREE.Box3().setFromObject(mesh);
      expect(Math.abs(box.max.y - h), `tor-${i} top`).toBeLessThanOrEqual(0.05);
    });
  });

  it('the tall rock is as wide at its foot as its collider', () => {
    const tall = scene.getObjectByName('highTor');
    expect(tall).toBeTruthy();
    expect(tall.geometry.parameters.radiusBottom).toBe(0.9);
    expect(tall.geometry.parameters.radiusTop).toBe(0.75);
    expect(tall.geometry.parameters.height).toBe(1.9);
    expect(scene.getObjectByName('highTorRock')).toBeTruthy();
  });

  it('puts the climbing golden mice on the chain tops and hides the third among three bushes', () => {
    const [tor, thorn, hidden] = GOLD_MICE.moor;
    expect(GOLD_MICE.moor).toEqual([
      { id: 'gm-moor-1', x: -19, z: -35, y: 1.9 },
      { id: 'gm-moor-2', x: -2.75, z: 38, y: 2.1 },
      { id: 'gm-moor-3', x: -38, z: -42, y: 0 },
    ]);
    expect(perchAt(tor.x, tor.z)?.y).toBe(tor.y);
    // the hawthorn's mouse is out along the limb, inside checkFind's 1.0 m of
    // a cat on the branch perch, and clear of the trunk (r 0.45 there)
    const branch = perchAt(-2, 38);
    expect(branch.y).toBe(thorn.y);
    expect(Math.hypot(thorn.x - branch.x, thorn.z - branch.z)).toBeLessThan(1.0);
    expect(Math.hypot(thorn.x - branch.x, thorn.z - branch.z)).toBeGreaterThan(0.45 + 0.12);
    expect(hidden.y).toBe(0);
    for (const [x, z] of [[-36, -44], [-40, -44], [-38, -39]]) {
      const bush = scene.children.find((o) => o.position.x === x && o.position.z === z);
      expect(bush, `bush (${x}, ${z})`).toBeTruthy();
      // a cat pushes through a bush: nothing stands in its way
      expect(collider(x, z)).toBeUndefined();
    }
  });

  // Everything a kid hunts for, with where a cat must stand to get it: on the
  // spot itself for a POI, a race ring, a scenic or a ground find; within the
  // climb reach of the first rock of the chain an elevated one sits on.
  const targets = () => {
    const firstStep = (x, z) => {
      if (Math.hypot(x - -2, z - 38) < 1) return perchAt(-3.6, 36.6);
      if (Math.hypot(x - -19, z - -35) < 1.5) return perchAt(-18, -34);
      return null;
    };
    const list = [
      ...area.pois.map((p) => ({ what: `poi (${p.x}, ${p.z})`, ...p })),
      ...rings().map((p) => ({ what: `race ring (${p.x}, ${p.z})`, ...p })),
      ...area.scenics.map((p) => ({ what: p.id, ...p })),
      ...area.collectibles.map((p) => ({ what: p.id, ...p })),
      ...GOLD_MICE.moor.map((p) => ({ what: p.id, ...p })),
    ];
    return list.map((t) => {
      if (!(t.y > 0)) return t;
      const step = firstStep(t.x, t.z);
      expect(step, `${t.what} sits on no chain`).toBeTruthy();
      return { ...t, step };
    });
  };

  it('every find, POI, scenic, golden mouse and race ring is reachable on foot from the spawn', () => {
    const missed = [];
    for (const t of targets()) {
      const ok = t.step
        ? reachesWithin(area, t.step.x, t.step.z, BASE_CLIMB_BUDGET.reachLow)
        : reaches(area, t.x, t.z);
      if (!ok) missed.push(t.what);
    }
    expect(missed).toEqual([]);
    // the lakeshore heath, named, so a regression there says so
    for (const [x, z] of [[-6, 20], [-6, 30], [-10, 12]]) expect(reaches(area, x, z), `(${x}, ${z})`).toBe(true);
  });

  it('keeps every find, perch, bush, puddle, burrow and the spawn in MOOR_KEEP_CLEAR', () => {
    const has = (x, z) => MOOR_KEEP_CLEAR.some(([px, pz]) => px === x && pz === z);
    const all = [
      ...area.pois, ...area.scenics, ...area.collectibles, ...GOLD_MICE.moor,
      ...area.perches.filter((p) => !p.requires && !TORS.some((t) => t.x === p.x && t.z === p.z)),
      ...[[-36, -44], [-40, -44], [-38, -39]].map(([x, z]) => ({ x, z })),
      ...area.puddles, ...WARREN_BURROWS, SPAWN,
    ];
    for (const p of all) expect(has(p.x, p.z), `(${p.x}, ${p.z})`).toBe(true);
    // and nothing else: 9 POIs + 3 scenics + 5 collectibles + 3 golden mice +
    // 4 chain perches + 3 gold bushes + 2 puddles + 7 burrows + the spawn
    expect(all).toHaveLength(37);
    expect(MOOR_KEEP_CLEAR).toHaveLength(37);
    expect(Object.isFrozen(MOOR_KEEP_CLEAR)).toBe(true);
  });

  it("the hawthorn's golden mouse is in sight from the ground and from the chase camera", () => {
    const tree = scene.getObjectByName('oldHawthorn');
    expect(tree).toBeTruthy();
    const m = GOLD_MICE.moor.find((g) => g.id === 'gm-moor-2');
    scene.updateMatrixWorld(true);
    const target = new THREE.Vector3(m.x, m.y + 0.12, m.z);
    const clear = (eye) => {
      const dir = target.clone().sub(eye);
      const ray = new THREE.Raycaster(eye, dir.clone().normalize(), 0, dir.length());
      return ray.intersectObject(tree, true).length === 0;
    };
    // a cat's eye on the boulder and on the heath in front of the tree
    for (const [x, y, z] of [[-3.6, 0.72 + 0.9, 36.6], [-6, 0.9, 38]]) expect(clear(new THREE.Vector3(x, y, z)), `eye (${x}, ${z})`).toBe(true);
    // the chase camera at the default zoom step (camzoom step 1: 4.5 m out, 2.2 m up),
    // behind a cat 3 m from the trunk to the north, the south and the west (the limb's
    // side). The east is behind the trunk, as for the Woods' oak, and is not asserted.
    const T = { x: -2, z: 38 };
    for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0]]) {
      const cam = new THREE.Vector3(T.x + dx * 7.5, 2.2, T.z + dz * 7.5);
      expect(clear(cam), `camera ${dx},${dz}`).toBe(true);
    }
    // and behind a cat on the boulder, looking at the trunk
    const d = new THREE.Vector2(-3.6 - T.x, 36.6 - T.z).normalize();
    expect(clear(new THREE.Vector3(-3.6 + d.x * 4.5, 0.72 + 2.2, 36.6 + d.y * 4.5)), 'camera behind the boulder').toBe(true);
  });

  it("the High Tor's golden mouse is in sight from the chase camera", () => {
    const rocks = [scene.getObjectByName('highTor'), scene.getObjectByName('highTorRock')];
    for (const r of rocks) expect(r).toBeTruthy();
    const m = GOLD_MICE.moor.find((g) => g.id === 'gm-moor-1');
    scene.updateMatrixWorld(true);
    const target = new THREE.Vector3(m.x, m.y + 0.12, m.z);
    // a cat 3 m from the pillar on each of its four sides, the camera 4.5 m
    // further out and 2.2 m up (camzoom's default step)
    for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const cam = new THREE.Vector3(m.x + dx * 7.5, 2.2, m.z + dz * 7.5);
      const dir = target.clone().sub(cam);
      const ray = new THREE.Raycaster(cam, dir.clone().normalize(), 0, dir.length());
      expect(ray.intersectObjects(rocks, true).length, `camera ${dx},${dz}`).toBe(0);
    }
  });

  it('carries its critters, one moment and two puddles, and no villagers', () => {
    expect(area.critterSpawns.filter((c) => c.type !== 'bird')).toEqual([
      { type: 'rabbit', x: 32, z: -30, x2: 37, z2: -35 },
      { type: 'rabbit', x: 36, z: -29, x2: 30, z2: -24 },
      { type: 'rabbit', x: 4, z: 40, x2: 10, z2: 34 },
      { type: 'butterfly', x: -4, z: 24 }, { type: 'butterfly', x: 0, z: 26 }, { type: 'butterfly', x: -8, z: 26 },
      { type: 'duck', x: -20, z: 14 }, { type: 'duck', x: -18, z: 16 }, { type: 'duck', x: -22, z: 17 },
      { type: 'mouse', x: -26, z: -20, x2: -22, z2: -26 },
      { type: 'mouse', x: 10, z: -36, x2: 14, z2: -30 },
    ]);
    expect(area.critterSpawns.some((c) => c.type === 'villager' || c.type === 'squirrel')).toBe(false);
    expect(area.moments).toEqual([
      { id: 'rabbit-bolt', type: 'rabbit', label: 'a rabbit bolting for its burrow', x: 34, z: -32, from: { x: 26, z: -22 } },
    ]);
    expect(area.puddles).toEqual([{ x: 30, z: 40, r: 0.9 }, { x: -20, z: -18, r: 0.8 }]);
    for (const p of area.puddles) {
      expect(scene.children.some((o) => o.position.x === p.x && o.position.z === p.z && o.geometry?.type === 'CircleGeometry')).toBe(true);
    }
  });

  it("the warren's burrows are the Moor's hides, and every hide is dry and reachable", () => {
    expect(WARREN_BURROWS).toEqual([
      { x: 37.34, z: -30.97 }, { x: 35.28, z: -28.74 }, { x: 32.25, z: -28.97 }, { x: 30.54, z: -31.48 },
      { x: 31.44, z: -34.38 }, { x: 34.26, z: -35.49 }, { x: 36.89, z: -33.97 },
    ]);
    // a 3.5 m ring round the warren scenic
    for (const p of WARREN_BURROWS) expect(Math.hypot(p.x - 34, p.z - -32)).toBeCloseTo(3.5, 1);
    const s = propsFor('moor');
    expect(s.hides).toEqual([0, 2, 4].map((i) => WARREN_BURROWS[i]));
    for (const h of s.hides) {
      expect(inWater(MOOR_WATERS, h.x, h.z), `(${h.x}, ${h.z})`).toBe(false);
      expect(reaches(area, h.x, h.z), `(${h.x}, ${h.z})`).toBe(true);
    }
    for (const k of ['carryables', 'knockables', 'markables', 'flaps', 'rests', 'keepSlots']) expect(s[k], k).toEqual([]);
    expect(s.dogYard).toBeNull();
  });

  it('the birds sit in the first four thorns', () => {
    expect(area.critterSpawns.filter((c) => c.type === 'bird'))
      .toEqual(moorTrees().thorns.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })));
  });

  it('no tree, cushion, clump or reed stands on anything a kid looks for', () => {
    const { thorns, pines } = moorTrees();
    const heather = moorHeather(), gorse = moorGorse(), reeds = moorReeds();
    // every target, and the two grey boulders the chains start on (the tors
    // are rocks to climb, with their own clearances, so they are not here)
    const chainRocks = area.perches.filter((p) => !p.requires && p.kind === 'stone'
      && !TORS.some((t) => t.x === p.x && t.z === p.z));
    const spots = [...targets(), ...chainRocks.map((p) => ({ what: `rock (${p.x}, ${p.z})`, ...p }))];
    for (const t of spots) {
      for (const tr of [...thorns, ...pines]) expect(Math.hypot(t.x - tr.x, t.z - tr.z), `tree (${tr.x}, ${tr.z}) on ${t.what}`).toBeGreaterThanOrEqual(4);
      for (const h of heather) expect(Math.hypot(t.x - h.x, t.z - h.z), `heather (${h.x}, ${h.z}) on ${t.what}`).toBeGreaterThanOrEqual(3);
      for (const g of gorse) expect(Math.hypot(t.x - g.x, t.z - g.z), `gorse (${g.x}, ${g.z}) on ${t.what}`).toBeGreaterThanOrEqual(4.5);
      for (const r of reeds) expect(Math.hypot(t.x - r.x, t.z - r.z), `reeds (${r.x}, ${r.z}) on ${t.what}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('race: a Moor course of five rings is drawn from its POIs', () => {
    const course = raceCourse(area.pois, seedFromCode('2026-11-01-moor'));
    expect(course).toHaveLength(5);
    expect(new Set(course).size).toBe(5);
    for (const p of course) expect(area.pois).toContain(p);
  });
});

describe('the Moor: trees', () => {
  const decks = MOOR_WATERS.flatMap((w) => w.decks ?? []);
  const { thorns, pines } = moorTrees();
  const trees = [...thorns.map((t) => ({ ...t, reach: 1.6 * t.scale, r: 0.5 * t.scale })),
    ...pines.map((t) => ({ ...t, reach: 1.3 * t.scale, r: 0.4 * t.scale }))];

  it('moorTrees is deterministic, keeps its clearances and its counts', () => {
    expect(moorTrees()).toEqual({ thorns, pines });
    // lone thorns, as a moor has, and the Pines' trees over the west border
    expect(thorns.length).toBeGreaterThanOrEqual(5);
    expect(thorns.length).toBeLessThanOrEqual(12);
    expect(pines.length).toBeGreaterThanOrEqual(3);
    expect(pines.length).toBeLessThanOrEqual(8);
    for (const t of trees) {
      const at = `(${t.x}, ${t.z})`;
      for (const w of MOOR_WATERS) expect(waterGap(w, t.x, t.z), `${at} near ${w.id}`).toBeGreaterThanOrEqual(3);
      // the canopy stays half a metre off the path's edge, so the camera
      // following the cat down a path never ends up inside one
      for (const seg of MOOR_PATHS) expect(segDist(t.x, t.z, seg), `${at} on a path`).toBeGreaterThanOrEqual(1.5 + t.reach + 0.5);
      for (const d of decks) expect(rectDist(d, t.x, t.z), `${at} by a crossing`).toBeGreaterThanOrEqual(4);
      expect(Math.hypot(t.x - SPAWN.x, t.z - SPAWN.z), `${at} on the spawn`).toBeGreaterThanOrEqual(4);
      expect(t.x).toBeGreaterThanOrEqual(area.bounds.minX);
      expect(t.x).toBeLessThanOrEqual(area.bounds.maxX);
      expect(t.z).toBeGreaterThanOrEqual(area.bounds.minZ);
      expect(t.z).toBeLessThanOrEqual(area.bounds.maxZ);
    }
    for (let i = 0; i < thorns.length; i++) {
      for (let j = i + 1; j < thorns.length; j++) {
        expect(Math.hypot(thorns[i].x - thorns[j].x, thorns[i].z - thorns[j].z), `thorns ${i}, ${j}`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('leaves the moor walkable: no two trunks closer than a cat can pass between', () => {
    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        const a = trees[i], c = trees[j];
        const gap = Math.hypot(a.x - c.x, a.z - c.z) - a.r - c.r;
        expect(gap, `(${a.x}, ${a.z}) and (${c.x}, ${c.z})`).toBeGreaterThan(2 * 0.35);
      }
    }
  });

  it('plants each thorn with a collider and a Sure Claws fork, and each pine with a collider and no fork', () => {
    for (const t of thorns) {
      expect(area.colliders.some((c) => c.x === t.x && c.z === t.z && c.r === Math.round(50 * t.scale) / 100), `collider (${t.x}, ${t.z})`).toBe(true);
      expect(area.perches.some((p) => p.x === t.x && p.z === t.z && p.requires), `fork (${t.x}, ${t.z})`).toBe(true);
    }
    for (const t of pines) {
      expect(area.colliders.some((c) => c.x === t.x && c.z === t.z && c.r === Math.round(40 * t.scale) / 100), `collider (${t.x}, ${t.z})`).toBe(true);
      expect(area.perches.some((p) => p.x === t.x && p.z === t.z), `no fork (${t.x}, ${t.z})`).toBe(false);
    }
  });
});

describe('the Moor: heather, gorse, reeds and the warren', () => {
  const decks = MOOR_WATERS.flatMap((w) => w.decks ?? []);
  const heather = moorHeather(), gorse = moorGorse(), reeds = moorReeds();
  const near = (p, [x, z]) => Math.hypot(p.x - x, p.z - z);

  it('moorHeather is seeded, and a real heath', () => {
    expect(moorHeather()).toEqual(heather);
    expect(heather.length).toBeGreaterThanOrEqual(260);
    expect(heather.length).toBeLessThanOrEqual(420);
    const heath = heather.filter((h) => h.x >= -14 && h.x <= 18 && h.z >= 8 && h.z <= 50);
    expect(heath.length).toBeGreaterThanOrEqual(40);
  });

  it('moorGorse is seeded', () => {
    expect(moorGorse()).toEqual(gorse);
    expect(gorse.length).toBeGreaterThanOrEqual(10);
    expect(gorse.length).toBeLessThanOrEqual(30);
  });

  it('keeps every cushion, clump and reed off the paths, the crossings, the spawn and every find', () => {
    for (const [name, list, path, deck, spawn, clear] of [['heather', heather, 2.3, 3, 4, 3], ['gorse', gorse, 3.8, 7, 7, 4.5]]) {
      for (const p of list) {
        const at = `${name} (${p.x}, ${p.z})`;
        for (const seg of MOOR_PATHS) expect(segDist(p.x, p.z, seg), at).toBeGreaterThanOrEqual(path);
        for (const d of decks) expect(rectDist(d, p.x, p.z), at).toBeGreaterThanOrEqual(deck);
        expect(near(p, [SPAWN.x, SPAWN.z]), at).toBeGreaterThanOrEqual(spawn);
        for (const k of MOOR_KEEP_CLEAR) expect(near(p, k), `${at} by (${k})`).toBeGreaterThanOrEqual(clear);
      }
    }
    expect(reeds.length).toBeGreaterThanOrEqual(60);
    expect(reeds.length).toBeLessThanOrEqual(140);
    const undecked = MOOR_WATERS.map((w) => ({ ...w, decks: [] }));
    for (const p of reeds) {
      const at = `reeds (${p.x}, ${p.z})`;
      expect(inWater(undecked, p.x, p.z), at).toBe(false);
      for (const d of decks) expect(rectDist(d, p.x, p.z), at).toBeGreaterThanOrEqual(1.5);
      for (const seg of MOOR_PATHS) expect(segDist(p.x, p.z, seg), at).toBeGreaterThanOrEqual(2.3);
      for (const k of MOOR_KEEP_CLEAR) expect(near(p, k), `${at} by (${k})`).toBeGreaterThanOrEqual(3);
    }
  });

  it('the heather, gorse, reeds and burrows are merged meshes out of the shadow pass, with no colliders', () => {
    for (const n of ['heather', 'gorse', 'reeds', 'burrows']) {
      const o = scene.getObjectByName(n);
      expect(o, n).toBeTruthy();
      let meshes = 0;
      o.traverse((m) => {
        if (!m.isMesh) return;
        meshes++;
        expect(m.userData.noCast, `${n} ${m.name}`).toBe(true);
      });
      expect(meshes, n).toBeGreaterThan(0);
    }
    // a collider for each tree, the four tors, and the two chain boulders,
    // the High Tor's pillar, the old hawthorn and its root; none for a bed
    const { thorns, pines } = moorTrees();
    expect(area.colliders).toHaveLength(thorns.length + pines.length + 4 + 5);
  });
});
