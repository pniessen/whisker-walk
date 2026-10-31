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

const woods = await import('../src/world/woods.js');
const { build: buildPark } = await import('../src/world/park.js');
const { waterGap, inWater } = await import('../src/world/builder.js');
const { isWalkableAt } = await import('../src/player.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { clearSpot } = await import('../src/world/spots.js');
const { raceCourse } = await import('../src/race.js');
const { seedFromCode } = await import('../src/rng.js');

const { build, SPAWN, WOODS_WATERS, WOODS_PATHS, woodsTreeSpots, woodsUndergrowth } = woods;

const built = () => {
  const scene = new THREE.Scene();
  const area = build(scene);
  return { scene, area };
};
const { scene, area } = built();
const byId = (id) => WOODS_WATERS.find((w) => w.id === id);

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

// Whether the flood reached the grid cell at (x, z).
function reaches(a, x, z) {
  const f = flood(a);
  const i = Math.round((x - f.minX) / STEP), j = Math.round((z - f.minZ) / STEP);
  return i >= 0 && j >= 0 && i < f.nx && j < f.nz && f.seen[i * f.nz + j] === 1;
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

describe('the Woods: water', () => {
  it('declares the lake, the pond and both reaches of the river', () => {
    expect(WOODS_WATERS.map((w) => w.id)).toEqual(['lake', 'pond', 'river-west', 'river-north']);
    expect(area.waters).toEqual(WOODS_WATERS);
    expect(Object.isFrozen(WOODS_WATERS)).toBe(true);
    for (const w of WOODS_WATERS) expect(Object.isFrozen(w)).toBe(true);
  });

  it('every water is drawn from its own footprint, at the scene root', () => {
    for (const w of WOODS_WATERS) {
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
    expect(area.waterFx.map((fx) => fx.mesh.name)).toEqual(WOODS_WATERS.map((w) => `water:${w.id}`));
  });

  it('draws the overlapping waters at different heights, so they never z-fight', () => {
    const y = (id) => scene.children.find((o) => o.name === `water:${id}`).position.y;
    expect(new Set(['pond', 'river-west', 'river-north'].map(y)).size).toBe(3);
  });

  it('the pond overlaps the river, so the water is continuous', () => {
    const pond = byId('pond');
    const river = byId('river-west');
    // The pond's centre is closer to the river than its own radius: the two
    // footprints share water, with no dry strip between them.
    expect(waterGap(river, pond.x, pond.z)).toBeLessThan(pond.r);
    // and every point on the straight line from the pond's centre into the
    // river is wet
    for (let z = pond.z; z > river.minZ; z -= 0.25) {
      expect(inWater([pond, river], pond.x, z), `(${pond.x}, ${z})`).toBe(true);
    }
  });

  it('the two reaches of the river meet', () => {
    const w = byId('river-west');
    const n = byId('river-north');
    expect(w.maxX).toBe(n.maxX);
    expect(n.maxZ).toBe(w.maxZ);
  });

  it('the river can be crossed only at the two decks', () => {
    expect(reaches(area, -20, -24)).toBe(true);
    const noDecks = { ...area, waters: WOODS_WATERS.map((w) => ({ ...w, decks: [] })) };
    expect(reaches(noDecks, -20, -24)).toBe(false);
    // and either deck alone is enough
    for (const keep of ['river-west', 'river-north']) {
      const one = { ...area, waters: WOODS_WATERS.map((w) => (w.id === keep ? w : { ...w, decks: [] })) };
      expect(reaches(one, -20, -24), `only ${keep}'s deck`).toBe(true);
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
    // wide enough that a thumb on the stick doesn't bounce off the bank
    expect(deck.maxX - deck.minX).toBeGreaterThanOrEqual(1.8);
    // and it spans the river, landing on dry ground at both ends
    expect(deck.minZ).toBeLessThan(river.minZ);
    expect(deck.maxZ).toBeGreaterThan(river.maxZ);
  });

  it('the stepping stones cover their whole deck, with no open water anywhere on it', () => {
    const deck = byId('river-north').decks[0];
    const river = byId('river-north');
    const stones = scene.getObjectByName('steppingStones');
    expect(stones).toBeTruthy();
    const waterY = scene.getObjectByName('water:river-north').position.y;
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
    // and the deck is as wide as the stones look: a cat walking along their
    // visible edge is on the deck, not stopped by the water (live bug, the
    // strip was ±0.5 m under stones drawn to about ±0.75)
    expect((deck.maxZ - deck.minZ) / 2).toBeGreaterThanOrEqual(0.75);
    // and the crossing runs from bank to bank
    expect(deck.minX).toBeLessThan(river.minX);
    expect(deck.maxX).toBeGreaterThan(river.maxX);
  });
});

describe('the Woods: trees', () => {
  const CLEARING = { x: 4, z: 12, r: 9 };

  it('woodsTreeSpots is deterministic and keeps its clearances', () => {
    const a = woodsTreeSpots();
    expect(woodsTreeSpots()).toEqual(a);
    // a wood, not a park: closer to eighty trees than thirty (the cap is the
    // shadow-caster budget, see test/budget.test.js)
    expect(a.length).toBeGreaterThanOrEqual(60);
    expect(a.length).toBeLessThanOrEqual(80);
    for (const t of a) {
      const at = `(${t.x}, ${t.z})`;
      for (const w of WOODS_WATERS) expect(waterGap(w, t.x, t.z), `${at} near ${w.id}`).toBeGreaterThanOrEqual(3);
      // the canopy (1.6 m x scale across, at camera height) stays half a
      // metre off the path's edge, so the camera never walks into one
      const pathClear = 1.5 + 1.6 * t.scale + 0.5;
      for (const seg of WOODS_PATHS) expect(segDist(t.x, t.z, seg), `${at} on a path`).toBeGreaterThanOrEqual(pathClear);
      expect(Math.hypot(t.x - CLEARING.x, t.z - CLEARING.z), `${at} in the clearing`).toBeGreaterThanOrEqual(CLEARING.r);
      expect(Math.hypot(t.x - SPAWN.x, t.z - SPAWN.z), `${at} on the spawn`).toBeGreaterThanOrEqual(4);
      for (const w of WOODS_WATERS) {
        for (const d of w.decks ?? []) expect(rectDist(d, t.x, t.z), `${at} by a crossing`).toBeGreaterThanOrEqual(4);
      }
      expect(t.scale).toBeGreaterThanOrEqual(1);
      expect(t.scale).toBeLessThanOrEqual(1.6);
      expect(t.x).toBeGreaterThanOrEqual(area.bounds.minX);
      expect(t.x).toBeLessThanOrEqual(area.bounds.maxX);
      expect(t.z).toBeGreaterThanOrEqual(area.bounds.minZ);
      expect(t.z).toBeLessThanOrEqual(area.bounds.maxZ);
    }
  });

  it('leaves the wood walkable: no two trunks closer than a cat can pass between', () => {
    const a = woodsTreeSpots();
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) {
        const gap = Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z) - 0.5 * a[i].scale - 0.5 * a[j].scale;
        expect(gap, `(${a[i].x}, ${a[i].z}) and (${a[j].x}, ${a[j].z})`).toBeGreaterThan(2 * 0.35);
      }
    }
  });

  it('plants each tree with a collider and a Sure Claws fork', () => {
    for (const t of woodsTreeSpots()) {
      expect(area.colliders.some((c) => c.x === t.x && c.z === t.z), `collider (${t.x}, ${t.z})`).toBe(true);
      expect(area.perches.some((p) => p.x === t.x && p.z === t.z && p.requires), `fork (${t.x}, ${t.z})`).toBe(true);
    }
  });
});

describe('the Woods: undergrowth', () => {
  const CLEARING = { x: 4, z: 12, r: 9 };
  const { ferns, brambles } = woodsUndergrowth();
  const decks = WOODS_WATERS.flatMap((w) => w.decks ?? []);
  const waterDist = (x, z) => Math.min(...WOODS_WATERS.map((w) => waterGap(w, x, z)));

  it('is seeded: the same ferns and brambles every time, and plenty of them', () => {
    expect(woodsUndergrowth()).toEqual({ ferns, brambles });
    expect(ferns.length).toBeGreaterThanOrEqual(80);
    expect(brambles.length).toBeGreaterThanOrEqual(8);
  });

  for (const [name, list, path, deck] of [['fern', ferns, 2.3, 3], ['bramble', brambles, 3.8, 7]]) {
    it(`keeps every ${name} off the paths, the crossings, the water, the spawn and the clearing`, () => {
      for (const p of list) {
        const at = `${name} (${p.x}, ${p.z})`;
        for (const seg of WOODS_PATHS) expect(segDist(p.x, p.z, seg), at).toBeGreaterThanOrEqual(path);
        for (const d of decks) expect(rectDist(d, p.x, p.z), at).toBeGreaterThanOrEqual(deck);
        expect(waterDist(p.x, p.z), at).toBeGreaterThanOrEqual(1.5);
        expect(Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z), at).toBeGreaterThanOrEqual(4);
        expect(Math.hypot(p.x - CLEARING.x, p.z - CLEARING.z), at).toBeGreaterThanOrEqual(CLEARING.r);
      }
    });
  }

  it('is drawn as two merged meshes out of the shadow pass, with no colliders', () => {
    for (const n of ['ferns', 'brambles']) {
      const m = scene.getObjectByName(n);
      expect(m?.isMesh, n).toBe(true);
      expect(m.userData.noCast, n).toBe(true);
    }
    for (const p of [...ferns, ...brambles]) {
      expect(area.colliders.some((c) => c.x === p.x && c.z === p.z)).toBe(false);
    }
  });
});

describe('the Woods: the island and the horizon', () => {
  const ISLAND = { x: -72, z: -72 };

  it('the island on the horizon is out on the lake and out of reach', () => {
    const { bounds } = area;
    const outside = ISLAND.x < bounds.minX || ISLAND.x > bounds.maxX
      || ISLAND.z < bounds.minZ || ISLAND.z > bounds.maxZ;
    expect(outside).toBe(true);
    expect(inWater([byId('lake')], ISLAND.x, ISLAND.z)).toBe(true);
    for (const c of area.colliders) expect(Math.hypot(c.x - ISLAND.x, c.z - ISLAND.z)).toBeGreaterThan(20);
    for (const p of area.perches) expect(Math.hypot(p.x - ISLAND.x, p.z - ISLAND.z)).toBeGreaterThan(20);
    // and something is actually standing there
    const there = scene.children.filter((o) => Math.hypot(o.position.x - ISLAND.x, o.position.z - ISLAND.z) < 0.01);
    expect(there.length).toBeGreaterThanOrEqual(2);
  });

  it('paints one horizon band', () => {
    expect(scene.children.filter((o) => o.name === 'horizonBand')).toHaveLength(1);
  });
});

describe('the Woods: the area record', () => {
  it("returns every key park.js returns, named 'The Woods'", () => {
    const park = buildPark(new THREE.Scene());
    for (const k of Object.keys(park)) expect(area, k).toHaveProperty(k);
    expect(area.name).toBe('The Woods');
    expect(area.spawn).toEqual({ x: SPAWN.x, z: SPAWN.z });
    expect(area.bounds).toEqual({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
    expect(area.boxes).toEqual([]);
    expect(area.tippables).toEqual([]);
  });

  it('is built the same every time', () => {
    const again = built().area;
    const plain = (a) => JSON.parse(JSON.stringify({ ...a, waterFx: undefined }));
    expect(plain(again)).toEqual(plain(area));
  });

  it('nothing in the Woods reads the edition', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/world/woods.js', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/edition/i);
  });
});

describe('the Woods: things to find, climb and race', () => {
  const POIS = [[4, 12], [-30, 2], [-20, -24], [30, -24], [36, 30], [-12, 32], [-36, 22], [16, -2], [40, -40]];
  const perchAt = (x, z) => area.perches.find((p) => p.x === x && p.z === z && !p.requires);
  const collider = (x, z) => area.colliders.find((c) => c.x === x && c.z === z);
  const waterDist = (x, z) => Math.min(...WOODS_WATERS.map((w) => waterGap(w, x, z)));
  // Where the race rings stand: each POI pushed clear of colliders and water,
  // exactly as the game does.
  const rings = () => area.pois.map((p) => clearSpot(p, area.colliders, area.bounds, area.waters));

  it('woods: nine POIs, all at least 2 m from water and clear of every collider', () => {
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

  it('woods: five collectibles, three scenics, at least one vantage perch', () => {
    expect(area.collectibles).toEqual([
      { id: 'woods-find-1', x: -8, z: 26, label: 'a glossy acorn' },
      { id: 'woods-find-2', x: 30, z: -34, label: 'a jay feather' },
      { id: 'woods-find-3', x: -28, z: -20, label: 'a snail shell by the river' },
      { id: 'woods-find-4', x: 32, z: 24, label: 'a dry oak leaf, just right for a nest' },
      { id: 'woods-find-5', x: -22, z: -26, y: 0.72, label: 'a ball of moss on the lookout rock' },
    ]);
    expect(area.scenics).toEqual([
      { id: 'lake-view', x: -26, z: -30, label: 'the lakeshore' },
      { id: 'woods-pond', x: -34, z: -2, label: 'the pond on the border' },
      { id: 'great-oak', x: 6, z: 23, label: 'the great oak' },
    ]);
    const vantages = area.perches.filter((p) => p.vantage);
    expect(vantages.length).toBeGreaterThanOrEqual(1);
    for (const v of vantages) expect(typeof v.label).toBe('string');
  });

  it("woods: the Great Oak chain is two hops and the branch can't be reached from the ground", () => {
    const boulder = perchAt(8, 20);
    const branch = perchAt(9.6, 21.4);
    expect(boulder).toEqual({ x: 8, z: 20, y: 0.72, kind: 'stone' });
    expect(branch).toEqual({ x: 9.6, z: 21.4, y: 2.1, kind: 'tree', label: 'great oak lookout', vantage: true });
    expect(collider(8, 20)?.r).toBe(0.7);
    expect(collider(9.6, 21.4)?.r).toBe(0.8);
    expect(canReach(boulder, { x: boulder.x, z: boulder.z }, 0)).toBe(true);
    expect(canReach(branch, { x: boulder.x, z: boulder.z }, boulder.y)).toBe(true);
    expect(canReach(branch, { x: branch.x, z: branch.z }, 0)).toBe(false);
    // and the boulder can be reached from ground a cat can walk to
    expect(reachesWithin(area, boulder.x, boulder.z, BASE_CLIMB_BUDGET.reachLow)).toBe(true);
  });

  it('woods: the Lookout Rocks chain is two hops', () => {
    const low = perchAt(-22, -26);
    const high = perchAt(-23, -27);
    expect(low).toEqual({ x: -22, z: -26, y: 0.72, kind: 'stone' });
    expect(high).toEqual({ x: -23, z: -27, y: 1.9, kind: 'stone', label: 'lookout rocks', vantage: true });
    expect(collider(-22, -26)?.r).toBe(0.7);
    expect(collider(-23, -27)?.r).toBe(0.9);
    expect(canReach(low, { x: low.x, z: low.z }, 0)).toBe(true);
    expect(canReach(high, { x: low.x, z: low.z }, low.y)).toBe(true);
    expect(canReach(high, { x: high.x, z: high.z }, 0)).toBe(false);
    expect(reachesWithin(area, low.x, low.z, BASE_CLIMB_BUDGET.reachLow)).toBe(true);
  });

  it('puts the two climbing golden mice on the chain tops and hides the third among three bushes', () => {
    const [oak, rocks, hidden] = GOLD_MICE.woods;
    // the oak's mouse is out along the branch, inside checkFind's 1.0 m of a
    // cat on the branch perch, and clear of the trunk (r 0.45 there) it would
    // otherwise be hidden in
    const branch = perchAt(9.6, 21.4);
    expect(branch.y).toBe(oak.y);
    expect(Math.hypot(oak.x - branch.x, oak.z - branch.z)).toBeLessThan(1.0);
    expect(Math.hypot(oak.x - branch.x, oak.z - branch.z)).toBeGreaterThan(0.45 + 0.12);
    expect(perchAt(rocks.x, rocks.z)?.y).toBe(rocks.y);
    expect(hidden.y).toBe(0);
    for (const [x, z] of [[-36, 28], [-40, 28], [-38, 33]]) {
      const bush = scene.children.find((o) => o.position.x === x && o.position.z === z);
      expect(bush, `bush (${x}, ${z})`).toBeTruthy();
      // a cat pushes through a bush: nothing stands in its way
      expect(collider(x, z)).toBeUndefined();
    }
  });

  // Everything a kid hunts for, with where a cat must stand to get it: on the
  // spot itself for a POI, a race ring, a scenic or a ground find; within the
  // climb reach of the first rock or boulder of the chain an elevated one sits
  // on (the chain tests above take it from there).
  const targets = () => {
    const firstStep = (x, z) => {
      if (Math.hypot(x - 9.6, z - 21.4) < 1) return perchAt(8, 20);
      if (Math.hypot(x - -23, z - -27) < 1.5) return perchAt(-22, -26);
      return null;
    };
    const list = [
      ...area.pois.map((p) => ({ what: `poi (${p.x}, ${p.z})`, ...p })),
      ...rings().map((p) => ({ what: `race ring (${p.x}, ${p.z})`, ...p })),
      ...area.scenics.map((p) => ({ what: p.id, ...p })),
      ...area.collectibles.map((p) => ({ what: p.id, ...p })),
      ...GOLD_MICE.woods.map((p) => ({ what: p.id, ...p })),
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
    // the glade north of the river, named, so a regression there says so
    for (const [x, z] of [[-20, -24], [-28, -20], [-26, -30]]) expect(reaches(area, x, z), `(${x}, ${z})`).toBe(true);
  });

  it('no tree, fern or bramble stands on anything a kid looks for', () => {
    const { ferns, brambles } = woodsUndergrowth();
    const trees = woodsTreeSpots();
    const spots = [
      ...targets(),
      ...area.perches.filter((p) => !p.requires && p.kind === 'stone').map((p) => ({ what: `rock (${p.x}, ${p.z})`, ...p })),
    ];
    for (const t of spots) {
      for (const tr of trees) expect(Math.hypot(t.x - tr.x, t.z - tr.z), `tree (${tr.x}, ${tr.z}) on ${t.what}`).toBeGreaterThanOrEqual(4);
      for (const f of ferns) expect(Math.hypot(t.x - f.x, t.z - f.z), `fern (${f.x}, ${f.z}) on ${t.what}`).toBeGreaterThanOrEqual(3);
      for (const br of brambles) expect(Math.hypot(t.x - br.x, t.z - br.z), `bramble (${br.x}, ${br.z}) on ${t.what}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the Great Oak's golden mouse sits under its canopy, in sight from the ground", () => {
    const oak = scene.getObjectByName('greatOak');
    expect(oak).toBeTruthy();
    const m = GOLD_MICE.woods[0];
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const target = new THREE.Vector3(m.x, m.y + 0.12, m.z);
    // from the boulder and from the scenic in front of the tree, at a cat's
    // eye height: nothing of the oak is between the eye and the mouse
    for (const [x, z] of [[8, 20], [6, 23]]) {
      const eye = new THREE.Vector3(x, 0.9, z);
      const dir = target.clone().sub(eye);
      const len = dir.length();
      ray.set(eye, dir.normalize());
      ray.far = len;
      expect(ray.intersectObject(oak, true), `from (${x}, ${z})`).toEqual([]);
    }
  });

  it('carries its critters, one moment and two puddles, and no villagers', () => {
    const birds = area.critterSpawns.filter((c) => c.type === 'bird');
    expect(birds).toEqual(woodsTreeSpots().slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })));
    expect(area.critterSpawns.filter((c) => c.type !== 'bird')).toEqual([
      { type: 'squirrel', x: -24, z: 30, x2: -30, z2: 10 },
      { type: 'squirrel', x: 28, z: -10, x2: 36, z2: -30 },
      { type: 'butterfly', x: 2, z: 8 }, { type: 'butterfly', x: 8, z: 14 }, { type: 'butterfly', x: -2, z: 12 },
      { type: 'duck', x: -44, z: -6 }, { type: 'duck', x: -42, z: -4 }, { type: 'duck', x: -46, z: -8 },
      { type: 'mouse', x: -9, z: 25, x2: -4, z2: 30 },
      { type: 'mouse', x: 30, z: 26, x2: 34, z2: 20 },
    ]);
    expect(area.moments).toEqual([
      { id: 'squirrel-dash', label: 'two squirrels racing up the great oak', x: 9, z: 24, from: { x: 20, z: 30 } },
    ]);
    expect(area.puddles).toEqual([{ x: 20, z: 34, r: 0.9 }, { x: -16, z: 6, r: 0.8 }]);
    for (const p of area.puddles) {
      expect(scene.children.some((o) => o.position.x === p.x && o.position.z === p.z && o.geometry?.type === 'CircleGeometry')).toBe(true);
    }
  });

  it('race: a Woods course of five rings is drawn from its POIs', () => {
    const course = raceCourse(area.pois, seedFromCode('2026-11-01-woods'));
    expect(course).toHaveLength(5);
    expect(new Set(course).size).toBe(5);
    for (const p of course) expect(area.pois).toContain(p);
  });
});
