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
// 0.5 m grid from SPAWN, and say whether (x, z) was reached.
function reaches(a, x, z) {
  const STEP = 0.5;
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
  return seen[Math.round((x - minX) / STEP) * nz + Math.round((z - minZ) / STEP)] === 1;
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
      for (const seg of WOODS_PATHS) expect(segDist(t.x, t.z, seg), `${at} on a path`).toBeGreaterThanOrEqual(3);
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
