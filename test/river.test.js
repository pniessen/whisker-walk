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
const { GOLD_MICE } = await import('../src/goldmice.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { clearSpot } = await import('../src/world/spots.js');
const { raceCourse } = await import('../src/race.js');
const { seedFromCode } = await import('../src/rng.js');
const { build: buildPark } = await import('../src/world/park.js');
const { inWater, waterGap } = await import('../src/world/builder.js');
const { isWalkableAt } = await import('../src/player.js');

const { build, SPAWN, RIVER_WATERS, RIVER_PATHS, RIVER_ISLAND, RIVER_KEEP_CLEAR, riverTrees } = river;
const { ZOOM_STEPS, DEFAULT_ZOOM_STEP } = await import('../src/camzoom.js');

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

describe('the River: things to find, climb and race', () => {
  const POIS = [[2, 28], [-24, 4], [-16, -18], [-30, -42], [8, -42], [22, -22], [42, -22], [36, 24], [-40, -12]];
  const perchAt = (x, z) => area.perches.find((p) => p.x === x && p.z === z && !p.requires);
  const collider = (x, z) => area.colliders.find((c) => c.x === x && c.z === z);
  const waterDist = (x, z) => Math.min(...RIVER_WATERS.map((w) => waterGap(w, x, z)));
  // Where the race rings stand: each POI pushed clear of colliders and water,
  // exactly as the game does.
  const rings = () => area.pois.map((p) => clearSpot(p, area.colliders, area.bounds, area.waters));

  it('river: nine POIs, all at least 2 m from water and clear of every collider', () => {
    expect(area.pois.map((p) => [p.x, p.z])).toEqual(POIS);
    for (const p of area.pois) {
      const at = `poi (${p.x}, ${p.z})`;
      expect(waterDist(p.x, p.z), at).toBeGreaterThanOrEqual(2);
      for (const c of area.colliders) {
        expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, `${at} by (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(1.6);
      }
    }
    expect(rings().map((p) => [p.x, p.z])).toEqual(POIS);
  });

  it('river: five collectibles, three scenics, at least one vantage perch', () => {
    expect(area.collectibles).toEqual([
      { id: 'river-find-1', x: -20, z: 14, label: 'a smooth pebble by the pool' },
      { id: 'river-find-2', x: 24, z: -18, label: 'a kingfisher feather' },
      { id: 'river-find-3', x: -38, z: -40, label: 'a mussel shell from the riverbank' },
      { id: 'river-find-4', x: 30, z: 30, label: 'a silver fish scale' },
      { id: 'river-find-5', x: 34, z: -26, y: 0.72, label: 'a sun-warmed pebble on the low rock' },
    ]);
    expect(area.scenics).toEqual([
      { id: 'lake-island', x: 29, z: -29, label: 'the lake and the island' },
      { id: 'river-pond', x: 34, z: 0, label: 'the pond on the border' },
      { id: 'old-willow', x: -13.9, z: -21.9, label: 'under the old willow' },
    ]);
    const vantages = area.perches.filter((p) => p.vantage);
    expect(vantages.length).toBeGreaterThanOrEqual(1);
    for (const v of vantages) expect(typeof v.label).toBe('string');
  });

  it("river: the Old Willow chain is two hops and the branch can't be reached from the ground", () => {
    const boulder = perchAt(-14, -24.5);
    const branch = perchAt(-12.4, -23.1);
    expect(boulder).toEqual({ x: -14, z: -24.5, y: 0.72, kind: 'stone' });
    expect(branch).toEqual({ x: -12.4, z: -23.1, y: 2.1, kind: 'tree', label: 'old willow lookout', vantage: true });
    expect(collider(-14, -24.5)?.r).toBe(0.7);
    expect(collider(-12.4, -23.1)?.r).toBe(0.8);
    expect(collider(-13.23, -23.83)?.r).toBe(0.35);
    expect(canReach(boulder, { x: boulder.x, z: boulder.z }, 0)).toBe(true);
    expect(canReach(branch, { x: boulder.x, z: boulder.z }, boulder.y)).toBe(true);
    expect(canReach(branch, { x: branch.x, z: branch.z }, 0)).toBe(false);
    expect(reachesWithin(area, boulder.x, boulder.z, BASE_CLIMB_BUDGET.reachLow)).toBe(true);
  });

  it('river: the Sun-warmed Rocks chain is two hops', () => {
    const low = perchAt(34, -26);
    const high = perchAt(33, -27);
    expect(low).toEqual({ x: 34, z: -26, y: 0.72, kind: 'stone' });
    expect(high).toEqual({ x: 33, z: -27, y: 1.9, kind: 'stone', label: 'sun-warmed rocks', vantage: true });
    expect(collider(34, -26)?.r).toBe(0.7);
    expect(collider(33, -27)?.r).toBe(0.9);
    expect(canReach(low, { x: low.x, z: low.z }, 0)).toBe(true);
    expect(canReach(high, { x: low.x, z: low.z }, low.y)).toBe(true);
    expect(canReach(high, { x: high.x, z: high.z }, 0)).toBe(false);
    expect(reachesWithin(area, low.x, low.z, BASE_CLIMB_BUDGET.reachLow)).toBe(true);
  });

  it('the fallen log is a seat and a first hop, with three colliders along it', () => {
    expect(perchAt(6, 20)).toEqual({ x: 6, z: 20, y: 0.5, kind: 'tree' });
    for (const [x, z] of [[4.51, 19.42], [6, 20], [7.49, 20.58]]) expect(collider(x, z)?.r, `(${x}, ${z})`).toBe(0.4);
  });

  it('the tall rock is as wide at its foot as its collider', () => {
    const pillar = scene.children.find((o) => o.position.x === 33 && o.position.z === -27 && o.geometry?.type === 'CylinderGeometry');
    expect(pillar).toBeTruthy();
    expect(pillar.geometry.parameters.radiusBottom).toBe(0.9);
    expect(pillar.geometry.parameters.radiusTop).toBe(0.75);
  });

  it('the two chain boulders share one material', () => {
    const boulders = [[-14, -24.5], [34, -26]].map(([x, z]) => scene.children.find((o) => o.position.x === x && o.position.z === z && o.geometry?.type === 'DodecahedronGeometry'));
    for (const m of boulders) expect(m).toBeTruthy();
    expect(boulders[0].material).toBe(boulders[1].material);
  });

  it('puts the climbing golden mice on the chain tops and hides the third among three bushes', () => {
    expect(GOLD_MICE.river.map((m) => m.id)).toEqual(['gm-river-1', 'gm-river-2', 'gm-river-3']);
    const [willow, rocks, hidden] = GOLD_MICE.river;
    // out along the limb, inside checkFind's 1.0 m of a cat on the branch
    // perch, and clear of the trunk (r 0.45 there) it would be hidden in
    const branch = perchAt(-12.4, -23.1);
    expect(branch.y).toBe(willow.y);
    expect(Math.hypot(willow.x - branch.x, willow.z - branch.z)).toBeLessThan(1.0);
    expect(Math.hypot(willow.x - branch.x, willow.z - branch.z)).toBeGreaterThan(0.45 + 0.12);
    expect(perchAt(rocks.x, rocks.z)?.y).toBe(rocks.y);
    expect(hidden.y).toBe(0);
    for (const [x, z] of [[-30, 38], [-34, 38], [-32, 43]]) {
      const bush = scene.children.find((o) => o.position.x === x && o.position.z === z);
      expect(bush, `bush (${x}, ${z})`).toBeTruthy();
      expect(collider(x, z)).toBeUndefined();
    }
  });

  // Everything a kid hunts for, with where a cat must stand to get it.
  const targets = () => {
    const firstStep = (x, z) => {
      if (Math.hypot(x - -12.4, z - -23.1) < 1) return perchAt(-14, -24.5);
      if (Math.hypot(x - 33, z - -27) < 1.5) return perchAt(34, -26);
      return null;
    };
    const list = [
      ...area.pois.map((p) => ({ what: `poi (${p.x}, ${p.z})`, ...p })),
      ...rings().map((p) => ({ what: `race ring (${p.x}, ${p.z})`, ...p })),
      ...area.scenics.map((p) => ({ what: p.id, ...p })),
      ...area.collectibles.map((p) => ({ what: p.id, ...p })),
      ...GOLD_MICE.river.map((p) => ({ what: p.id, ...p })),
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
    // north of the river, named, so a regression there says so
    for (const [x, z] of [[29, -29], [-30, -42], [24, -18]]) expect(reaches(area, x, z), `(${x}, ${z})`).toBe(true);
  });

  it("the Old Willow's golden mouse is in sight from the ground", () => {
    const willow = scene.getObjectByName('oldWillow');
    expect(willow).toBeTruthy();
    const m = GOLD_MICE.river[0];
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const target = new THREE.Vector3(m.x, m.y + 0.12, m.z);
    for (const [x, z] of [[-14, -24.5], [-13.9, -21.9]]) {
      const eye = new THREE.Vector3(x, 0.9, z);
      const dir = target.clone().sub(eye);
      const len = dir.length();
      ray.set(eye, dir.normalize());
      ray.far = len;
      expect(ray.intersectObject(willow, true), `from (${x}, ${z})`).toEqual([]);
    }
  });

  it("the Old Willow's golden mouse is in sight from the chase camera", () => {
    const willow = scene.getObjectByName('oldWillow');
    const m = GOLD_MICE.river[0];
    const trunk = { x: -12.4, z: -23.1 };
    const { dist, height } = ZOOM_STEPS[DEFAULT_ZOOM_STEP];
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const target = new THREE.Vector3(m.x, m.y + 0.12, m.z);
    const see = (cam, what) => {
      const dir = target.clone().sub(cam);
      const len = dir.length();
      ray.set(cam, dir.normalize());
      ray.far = len;
      expect(ray.intersectObject(willow, true).map((h) => h.distance.toFixed(2)), what).toEqual([]);
    };
    // a cat 3 m from the trunk on the north, south and west (the limb's side);
    // the east side is behind the trunk, as live for the Woods' oak
    for (const [side, dx, dz] of [['north', 0, -1], ['south', 0, 1], ['west', -1, 0]]) {
      const cx = trunk.x + dx * 3, cz = trunk.z + dz * 3;
      see(new THREE.Vector3(cx + dx * dist, height, cz + dz * dist), `cat on the ${side}`);
    }
    // a cat on the boulder, the camera behind it looking at the trunk
    const bx = -14, bz = -24.5;
    const away = new THREE.Vector2(bx - trunk.x, bz - trunk.z).normalize();
    see(new THREE.Vector3(bx + away.x * dist, 0.72 + height, bz + away.y * dist), 'cat on the boulder');
  });

  it('carries its critters, two moments and three puddles, and no villagers', () => {
    const birds = area.critterSpawns.filter((c) => c.type === 'bird');
    expect(birds).toEqual(riverTrees().willows.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })));
    expect(area.critterSpawns.filter((c) => c.type !== 'bird')).toEqual([
      { type: 'duck', x: 42, z: -4 }, { type: 'duck', x: 40, z: -7 }, { type: 'duck', x: 45, z: -2 },
      { type: 'duck', x: -31, z: 11 }, { type: 'duck', x: -29, z: 13 },
      { type: 'butterfly', x: 0, z: 24 }, { type: 'butterfly', x: 5, z: 28 }, { type: 'butterfly', x: -1, z: 31 },
      { type: 'mouse', x: -36, z: -2, x2: -40, z2: 8 },
      { type: 'mouse', x: 24, z: 30, x2: 30, z2: 26 },
    ]);
    expect(area.moments).toEqual([
      { id: 'duck-parade', type: 'duck', label: 'a duck leading her ducklings out of the pond', x: 36, z: 4, from: { x: 44, z: -6 } },
      { id: 'mouse-dash', type: 'mouse', label: 'a harvest mouse dashing through the reeds', x: -28, z: -6, from: { x: -44, z: 2 } },
    ]);
    expect(area.puddles).toEqual([{ x: 18, z: 34, r: 0.9 }, { x: -4, z: 2, r: 0.8 }, { x: 40, z: 12, r: 0.7 }]);
    for (const p of area.puddles) {
      expect(scene.children.some((o) => o.position.x === p.x && o.position.z === p.z && o.geometry?.type === 'CircleGeometry')).toBe(true);
    }
  });

  it('exports its keep-clear list, built from the records', () => {
    const has = (x, z) => RIVER_KEEP_CLEAR.some(([kx, kz]) => kx === x && kz === z);
    for (const p of [...area.pois, ...area.scenics, ...area.collectibles, ...GOLD_MICE.river, ...area.puddles, SPAWN]) {
      expect(has(p.x, p.z), `(${p.x}, ${p.z})`).toBe(true);
    }
    // the fallen log is kept clear along its length by Task 4's scenery rules
    for (const p of area.perches.filter((q) => q.x !== 6 || q.z !== 20)) expect(has(p.x, p.z), `perch (${p.x}, ${p.z})`).toBe(true);
    for (const [x, z] of [[-30, 38], [-34, 38], [-32, 43]]) expect(has(x, z), `bush (${x}, ${z})`).toBe(true);
  });

  it('race: a River course of five rings is drawn from its POIs', () => {
    const course = raceCourse(area.pois, seedFromCode('2026-11-01-river'));
    expect(course).toHaveLength(5);
    expect(new Set(course).size).toBe(5);
    for (const p of course) expect(area.pois).toContain(p);
  });
});
