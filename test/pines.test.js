import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The same headless canvas stub every world test uses (see test/park.test.js
// for why getImageData and the gradients need real answers), plus the three
// listener members createPlayer touches, so the fixed-stick drives below can
// run the real player (the same shape as test/waterblock.test.js's).
vi.stubGlobal('document', {
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
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
  build: buildMoor, MOOR_WATERS, MOOR_PATHS, MOOR_ISLAND,
} = await import('../src/world/moor.js');
const { ISLAND_WOODS, ISLAND_BRIDGE_WOODS, BRIDGE_PLANK } = await import('../src/world/lake.js');
const { inWater, waterGap, waterClearance, nearestDry, onDeck } = await import('../src/world/builder.js');
const { isWalkableAt, createPlayer } = await import('../src/player.js');
const island = await import('../src/world/island.js');
const {
  ISLAND_LAND, BRIDGE_DECK, ISLAND_KEEP_OUT, LAKE_BOX, BAY_BOX,
  ISLAND_POIS, ISLAND_SCENICS, ISLAND_COLLECTIBLES, ISLAND_PERCHES, MEETING_STONES,
  ISLAND_BUSHES, ISLAND_PUDDLES, ISLAND_CRITTERS, ISLAND_MOMENTS, islandReeds,
} = island;
const { keepOutPoint } = await import('../src/keepout.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { clearSpot } = await import('../src/world/spots.js');
const { raceCourse } = await import('../src/race.js');
const { seedFromCode } = await import('../src/rng.js');
const { propsFor } = await import('../src/propsets.js');
const { cameraOffset } = await import('../src/catcam.js');
const { ZOOM_STEPS, MIN_CAMERA_Y } = await import('../src/camzoom.js');
const { PINE_CONES, PINE_TRUNK } = await import('../src/world/builder.js');

const {
  build, SPAWN, PINES_WATERS, PINES_PATHS, TRUCE_PATH, PINES_ISLAND, BRIDGE_FOOT, PINES_HORIZON,
  PINES_KEEP_CLEAR, FROG_HIDES, DECKS, pinesTrees, pinesUndergrowth, pinesReeds, pinesLilyPads,
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
      } else if (w.islands?.length) {
        // The lake and the bay are each drawn as the rect minus the island
        // (Island Task 2's rule): a ShapeGeometry the rect's size, centred on
        // it. The island crosses the lake's west edge (x 26) and the bay's east
        // edge (x 30), so in both it is a notch cut into the outline, not a
        // hole: no holes, and more than the rect's four corners.
        expect(['lake', 'lake-bay'], w.id).toContain(w.id);
        expect(m.geometry.type, w.id).toBe('ShapeGeometry');
        m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        expect(bb.max.x - bb.min.x, w.id).toBeCloseTo(w.maxX - w.minX, 6);
        expect(bb.max.y - bb.min.y, w.id).toBeCloseTo(w.maxZ - w.minZ, 6);
        expect([m.position.x, m.position.z]).toEqual([(w.minX + w.maxX) / 2, (w.minZ + w.maxZ) / 2]);
        expect(p.shapes.holes, w.id).toHaveLength(0);
        expect(p.shapes.getPoints().length, w.id).toBeGreaterThan(4);
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
  // The bridge deck's frame: its middle, the unit vector from its land end to
  // its island end (the bearing (0.6, 0.8)), and the side normal.
  const deckSeg = [BRIDGE_DECK.x1, BRIDGE_DECK.z1, BRIDGE_DECK.x2, BRIDGE_DECK.z2];
  const deckLen = Math.hypot(BRIDGE_DECK.x1 - BRIDGE_DECK.x2, BRIDGE_DECK.z1 - BRIDGE_DECK.z2);
  const along = { x: (BRIDGE_DECK.x1 - BRIDGE_DECK.x2) / deckLen, z: (BRIDGE_DECK.z1 - BRIDGE_DECK.z2) / deckLen };
  const side = { x: -along.z, z: along.x };
  const deckMid = { x: (BRIDGE_DECK.x1 + BRIDGE_DECK.x2) / 2, z: (BRIDGE_DECK.z1 + BRIDGE_DECK.z2) / 2 };
  const onIsland = (x, z) => Math.hypot(x - ISLAND_LAND.x, z - ISLAND_LAND.z) < ISLAND_LAND.r;
  it('the island and the bridge are where the Woods, the River and the Moor show them', () => {
    expect(PINES_ISLAND).toEqual({ x: RIVER_ISLAND.x, z: RIVER_ISLAND.z + 100, r: ISLAND_WOODS.r, rise: ISLAND_WOODS.rise });
    expect([PINES_ISLAND.x, PINES_ISLAND.z]).toEqual([MOOR_ISLAND.x + 100, MOOR_ISLAND.z]);
    expect([PINES_ISLAND.x - 100, PINES_ISLAND.z - 100]).toEqual([ISLAND_WOODS.x, ISLAND_WOODS.z]);
    expect(Object.isFrozen(PINES_ISLAND)).toBe(true);

    const [[ix, iz], [sx, sz]] = ISLAND_BRIDGE_WOODS.map(([x, z]) => [x + 100, z + 100]);
    expect(BRIDGE_FOOT).toEqual({ x: sx, z: sz });
    // the plank runs on past the foot by BRIDGE_PLANK.landRun, onto the Pines' land
    const run = BRIDGE_PLANK.landRun / Math.hypot(sx - ix, sz - iz);
    const lx = sx + (sx - ix) * run, lz = sz + (sz - iz) * run;
    expect(Object.isFrozen(BRIDGE_FOOT)).toBe(true);

    const plank = scene.getObjectByName('islandBridge');
    expect(plank).toBeTruthy();
    expect(Math.abs(plank.position.x - (ix + lx) / 2)).toBeLessThan(0.01);
    expect(Math.abs(plank.position.z - (iz + lz) / 2)).toBeLessThan(0.01);
    expect(Math.abs(plank.position.y - BRIDGE_PLANK.y)).toBeLessThan(1e-9);
    expect(Math.abs(plank.geometry.parameters.depth - Math.hypot(ix - lx, iz - lz))).toBeLessThan(0.01);
    // the River's convention: the yaw from the shore end to the island end
    expect(Math.abs(plank.rotation.y - Math.atan2(ix - sx, iz - sz))).toBeLessThan(1e-6);
  });

  it('the island is ground cut out of the lake, and the bridge is the only way to it', () => {
    // the island the neighbours paint, as flat ground: the same centre and radius
    expect(ISLAND_LAND).toEqual({ x: 28, z: 28, r: 13 });
    expect([ISLAND_LAND.x, ISLAND_LAND.z, ISLAND_LAND.r]).toEqual([PINES_ISLAND.x, PINES_ISLAND.z, PINES_ISLAND.r]);
    expect(Object.isFrozen(ISLAND_LAND)).toBe(true);
    expect(byId('lake').islands).toEqual([ISLAND_LAND]);
    expect(byId('lake-bay').islands).toEqual([ISLAND_LAND]);
    for (const w of PINES_WATERS) {
      if (w.id !== 'lake' && w.id !== 'lake-bay') expect(w.islands, w.id).toBeUndefined();
    }
    // the bridge is the bay's one deck, and no other water carries it
    expect(byId('lake-bay').decks).toEqual([BRIDGE_DECK]);
    expect(PINES_WATERS.filter((w) => (w.decks ?? []).includes(BRIDGE_DECK)).map((w) => w.id)).toEqual(['lake-bay']);
    expect(byId('lake').decks ?? []).toEqual([]);

    const island = [[28, 40], [40, 28], [deckMid.x, deckMid.z]];
    for (const [x, z] of island) expect(reaches(area, x, z), `(${x}, ${z})`).toBe(true);

    // Take the bridge away and none of it is reached, while everything a kid
    // hunts for on the mainland still is.
    const noBridge = { ...area, waters: PINES_WATERS.map((w) => (w.id === 'lake-bay' ? { ...w, decks: [] } : w)) };
    for (const [x, z] of island) expect(reaches(noBridge, x, z), `(${x}, ${z}) without the bridge`).toBe(false);
    const offIsland = (p) => !onIsland(p.x, p.z) && segDist(p.x, p.z, deckSeg) > BRIDGE_DECK.halfW + 1;
    const ground = [
      ...area.pois, ...area.scenics, ...area.collectibles, ...GOLD_MICE.pines, ...FROG_HIDES,
    ].filter((p) => !(p.y > 0) && offIsland(p));
    expect(ground.length).toBeGreaterThanOrEqual(20);
    for (const p of ground) expect(reaches(noBridge, p.x, p.z), `(${p.x}, ${p.z}) without the bridge`).toBe(true);
    // the climbs' first rocks, from beside them
    for (const [x, z] of [[4, -28], [-37, -15]]) {
      expect(reachesWithin(noBridge, x, z, BASE_CLIMB_BUDGET.reachLow), `rock (${x}, ${z})`).toBe(true);
    }
  });

  it('the truce path runs straight onto the bridge and the bridge onto the island', () => {
    // the truce path ends at (10.6, 2.5), 2.3 m short of the foot, and the
    // foot is on the deck's centreline
    expect(TRUCE_PATH[3].slice(2)).toEqual([10.6, 2.5]);
    expect(segDist(BRIDGE_FOOT.x, BRIDGE_FOOT.z, deckSeg)).toBeLessThan(1e-9);
    // walked in 0.1 m steps: up to the foot, between the truce stones, then
    // along the deck to 7.6 m from the island's centre
    const pts = [];
    for (let k = 0; k <= 23; k++) pts.push([10.6, 2.5 + k * 0.1]);
    const end = [23.4, 21.9];
    const n = Math.ceil(Math.hypot(end[0] - 10.6, end[1] - 4.8) / 0.1);
    for (let k = 1; k <= n; k++) pts.push([10.6 + ((end[0] - 10.6) * k) / n, 4.8 + ((end[1] - 4.8) * k) / n]);
    const dry = pts.filter(([x, z]) => !isWalkableAt(area, x, z)).map(([x, z]) => `(${x.toFixed(2)}, ${z.toFixed(2)})`);
    expect(dry).toEqual([]);
    expect(Math.hypot(end[0] - ISLAND_LAND.x, end[1] - ISLAND_LAND.z)).toBeCloseTo(7.6, 1);
    // between the stones' faces, with a cat's width to spare on each side
    expect(10.6 - (9.0 + 0.4 + 0.35)).toBeGreaterThan(0);
    expect(12.2 - 0.4 - 0.35 - 10.6).toBeGreaterThan(0);

    // 1.2 m to the side of the deck's middle is the bay, and the nearest dry
    // spot from there is back on the deck
    const off = { x: deckMid.x + side.x * 1.2, z: deckMid.z + side.z * 1.2 };
    expect(isWalkableAt(area, off.x, off.z)).toBe(false);
    const p = nearestDry(area.waters, off.x, off.z, 0.35);
    expect(onDeck(byId('lake-bay'), p.x, p.z), `(${p.x}, ${p.z})`).toBe(true);
    expect(isWalkableAt(area, p.x, p.z)).toBe(true);
  });

  // The real player, driven by a held touch stick on the built Pines: the
  // harness test/waterblock.test.js's drive uses, run here against this area.
  const FRAME = 1 / 60;
  function hold(start, dir, seconds) {
    const player = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
    const cat = new THREE.Object3D();
    player.setAvatar(cat, 3.5);
    player.enable();
    cat.position.set(start.x, 0, start.z);
    player.setTouchMove({ x: dir.x, z: dir.z, mag: 1 });
    const track = [];
    for (let t = 0; t < seconds; t += FRAME) {
      player.update(FRAME, area.colliders, area.bounds, area.waters);
      track.push({ x: cat.position.x, z: cat.position.z });
    }
    player.disable();
    const wet = track.filter((q) => inWater(area.waters, q.x, q.z)).map((q) => `(${q.x.toFixed(2)}, ${q.z.toFixed(2)})`);
    expect(wet.slice(0, 5), 'frames in the water').toEqual([]);
    return track;
  }
  const bay = () => byId('lake-bay');

  it('holding the stick in one direction never puts the cat in the water', () => {
    // From the truce path's end, due south: onto the deck, sliding along its
    // edge toward the island, and ending on the deck or the island.
    const south = hold({ x: 10.6, z: 2.5 }, { x: 0, z: 1 }, 6);
    expect(south.some((q) => onDeck(bay(), q.x, q.z))).toBe(true);
    const s = south.at(-1);
    expect(onDeck(bay(), s.x, s.z) || onIsland(s.x, s.z), `ends at (${s.x}, ${s.z})`).toBe(true);

    // From the foot, along the bridge: ends on the island.
    const over = hold(BRIDGE_FOOT, along, 8).at(-1);
    expect(onIsland(over.x, over.z), `ends at (${over.x}, ${over.z})`).toBe(true);

    // From the island landing (Task 6's bridge-landing spot), back up the
    // bridge: it passes between the truce stones and ends on dry land north
    // of the shore. Not "ends between the stones": in 8 s the cat walks on
    // some 16 m past them, so the test checks where it crossed their line.
    const back = hold({ x: 22, z: 20.5 }, { x: -along.x, z: -along.z }, 8);
    const i = back.findIndex((q) => q.z < 3.6);
    expect(i).toBeGreaterThan(0);
    expect(back[i].x).toBeGreaterThan(9.0 + 0.4);
    expect(back[i].x).toBeLessThan(12.2 - 0.4);
    const b = back.at(-1);
    expect(b.z).toBeLessThan(BAY_BOX.minZ);
    expect(isWalkableAt(area, b.x, b.z), `ends at (${b.x}, ${b.z})`).toBe(true);

    // From the deck's middle, due east: never wet, ends on the deck or the
    // island, and stays pressed to the deck's east edge through the last
    // second. Not "holds still": the bridge runs on a diagonal, so a stick held
    // due east has a part along it, and the cat slides along the edge toward
    // the island, as it slides along a bank at the water's edge. The small
    // bounce at a deck's edge (pushed back to 0.35 m in, then walking out to
    // the edge again) is how every deck already behaves, the Woods' and the
    // River's included.
    const east = hold(deckMid, { x: 1, z: 0 }, 3);
    const e = east.at(-1);
    expect(onDeck(bay(), e.x, e.z) || onIsland(e.x, e.z), `ends at (${e.x}, ${e.z})`).toBe(true);
    for (const q of east.slice(-60)) {
      const at = `(${q.x.toFixed(2)}, ${q.z.toFixed(2)})`;
      expect(onDeck(bay(), q.x, q.z) || onIsland(q.x, q.z), at).toBe(true);
      // the east side of the deck is -side; on the island the edge no longer applies
      if (onDeck(bay(), q.x, q.z) && !onIsland(q.x, q.z)) {
        const off = -((q.x - deckMid.x) * side.x + (q.z - deckMid.z) * side.z);
        expect(off, at).toBeGreaterThanOrEqual(0.5);
      }
    }

  });

  it('the bridge deck is no wider than the plank the kids see', () => {
    const plank = scene.getObjectByName('islandBridge');
    expect(plank).toBeTruthy();
    expect(plank.geometry.parameters.width).toBe(BRIDGE_PLANK.w);
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const D = BRIDGE_DECK;
    const misses = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const cx = D.x1 + (D.x2 - D.x1) * t, cz = D.z1 + (D.z2 - D.z1) * t;
      for (let j = 0; j <= 4; j++) {
        const o = -D.halfW + (2 * D.halfW * j) / 4;
        const x = cx + side.x * o, z = cz + side.z * o;
        ray.set(new THREE.Vector3(x, 2, z), down);
        if (!ray.intersectObject(plank, true)[0]) misses.push(`t ${t} side ${o.toFixed(2)}: (${x.toFixed(2)}, ${z.toFixed(2)})`);
      }
    }
    expect(misses).toEqual([]);
    // 1.8 m wide on a 2 m plank (float-derived, so within a hair)
    expect(2 * D.halfW).toBeGreaterThanOrEqual(1.8 - 1e-9);
    expect(2 * D.halfW).toBeLessThanOrEqual(BRIDGE_PLANK.w - 0.2 + 1e-9);
    // its last metre, past the foot, is over dry land
    const undecked = PINES_WATERS.map((w) => ({ ...w, decks: [] }));
    const past = Math.hypot(D.x2 - BRIDGE_FOOT.x, D.z2 - BRIDGE_FOOT.z);
    expect(past).toBeCloseTo(BRIDGE_PLANK.landRun, 9);
    for (let k = 0; k <= 10; k++) {
      const x = BRIDGE_FOOT.x + (D.x2 - BRIDGE_FOOT.x) * (k / 10), z = BRIDGE_FOOT.z + (D.z2 - BRIDGE_FOOT.z) * (k / 10);
      expect(inWater(undecked, x, z), `(${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(false);
    }
    // and its island end is on the island
    expect(onIsland(D.x1, D.z1)).toBe(true);
  });

  it('the bridge deck and the keep-out come from lake.js', () => {
    const [[ix, iz], [fx, fz]] = ISLAND_BRIDGE_WOODS.map(([x, z]) => [x + 100, z + 100]);
    const run = BRIDGE_PLANK.landRun / Math.hypot(fx - ix, fz - iz);
    const D = BRIDGE_DECK;
    for (const [got, want] of [[D.x1, 20.56], [D.z1, 18.08], [D.x2, 10.0], [D.z2, 4.0], [D.halfW, 0.9]]) {
      expect(got).toBeCloseTo(want, 9);
    }
    expect([D.x1, D.z1]).toEqual([ix, iz]);
    expect(D.x2).toBeCloseTo(fx + (fx - ix) * run, 12);
    expect(D.z2).toBeCloseTo(fz + (fz - iz) * run, 12);
    expect(Object.isFrozen(D)).toBe(true);
  });

  it('no pine, fern, toadstool or shore reed grows on the island, and the rest of the Pines is as it was', () => {
    const { near, stand } = pinesTrees();
    const { ferns, toadstools } = pinesUndergrowth();
    const reeds = pinesReeds();
    // The shore reeds are the five lines along the bay's and the lake's shores
    // (pinesReeds): x -0.5, z 4.5 and z 44.5 round the bay, z 7.5 and x 25.5
    // on the lake.
    const shore = reeds.filter((r) => r.x === -0.5 || r.z === 4.5 || r.z === 44.5 || r.z === 7.5 || r.x === 25.5);
    const lists = { near, stand, ferns, toadstools, shore };
    for (const [kind, list] of Object.entries(lists)) {
      for (const t of list) {
        expect(Math.hypot(t.x - ISLAND_LAND.x, t.z - ISLAND_LAND.z), `${kind} (${t.x}, ${t.z})`).toBeGreaterThanOrEqual(ISLAND_LAND.r + 1);
      }
    }
    // The counts measured before the island became ground (the island was
    // all water then, so nothing could grow there), unchanged: every
    // candidate draws all its numbers whether kept or not, and the new rules
    // only turn away candidates on the island itself.
    // The island's own ring of reeds (Island Task 6) is appended after the
    // Pines' 141, so the Pines' own reeds are counted without it.
    const ring = islandReeds();
    expect(reeds.slice(reeds.length - ring.length)).toEqual(ring);
    expect({
      near: near.length, stand: stand.length, ferns: ferns.length, toadstools: toadstools.length,
      shore: shore.length, reeds: reeds.length - ring.length, pads: pinesLilyPads().length,
    }).toEqual({ near: 27, stand: 83, ferns: 136, toadstools: 47, shore: 58, reeds: 141, pads: 20 });
    // The BUG 1 fix (the canopy rule measured from the paths stretched by the
    // far camera's 7 m) moved these from 40 near, 86 stand, 133 ferns and 45
    // toadstools: fewer pines by the paths' bends and ends, and the floor
    // fills in where they stood. The reeds and pads don't read the pines.
    // the bridge treated as a 2 m path: a pine's canopy never reaches over it
    for (const t of [...near, ...stand]) {
      expect(segDist(t.x, t.z, deckSeg), `pine (${t.x}, ${t.z})`).toBeGreaterThanOrEqual(1 + 1.3 * t.scale + 0.5);
    }
    // The fit rules' decks are the two mire crossings, named: their distance
    // rule (rectDist) reads a rect's minX, which a strip deck doesn't have.
    expect(DECKS).toEqual([byId('mire-north').decks[0], byId('mire-west').decks[0]]);
    expect(DECKS).toHaveLength(2);
  });

  it('the Pines keeps its cats off the lake, the island and the bridge', () => {
    expect(area.keepOut).toEqual(ISLAND_KEEP_OUT);
    // the same numbers as the literal shapes in test/keepout.test.js
    const KO = ISLAND_KEEP_OUT;
    expect(KO.rects).toEqual([
      { minX: 26, maxX: 86, minZ: 8, maxZ: 66 }, { minX: 0, maxX: 30, minZ: 5, maxZ: 44 },
    ]);
    expect(KO.margin).toBe(0.6);
    expect(KO.capsules).toHaveLength(1);
    const c = KO.capsules[0];
    for (const [got, want] of [[c.x1, 20.56], [c.z1, 18.08], [c.x2, 10.0], [c.z2, 4.0], [c.r, 1.5]]) expect(got).toBeCloseTo(want, 9);
    // derived: the lake and the bay as boxes, the bridge as its deck plus the margin
    const box = (w) => ({ minX: w.minX, maxX: w.maxX, minZ: w.minZ, maxZ: w.maxZ });
    expect(KO.rects).toEqual([box(byId('lake')), box(byId('lake-bay'))]);
    expect(KO.rects).toEqual([LAKE_BOX, BAY_BOX]);
    expect([c.x1, c.z1, c.x2, c.z2]).toEqual([BRIDGE_DECK.x1, BRIDGE_DECK.z1, BRIDGE_DECK.x2, BRIDGE_DECK.z2]);
    expect(c.r).toBeCloseTo(BRIDGE_DECK.halfW + KO.margin, 12);
    for (const o of [KO, KO.rects, KO.capsules, ...KO.rects, c]) expect(Object.isFrozen(o)).toBe(true);

    const rectGap = (r, x, z) => Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));
    const outside = (p) => KO.rects.every((r) => rectGap(r, p.x, p.z) >= KO.margin - 1e-9)
      && KO.capsules.every((k) => segDist(p.x, p.z, [k.x1, k.z1, k.x2, k.z2]) >= k.r - 1e-9);
    const b = area.bounds;
    const pts = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      pts.push([ISLAND_LAND.x + Math.cos(a) * ISLAND_LAND.r, ISLAND_LAND.z + Math.sin(a) * ISLAND_LAND.r]);
    }
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const cx = BRIDGE_DECK.x1 + (BRIDGE_DECK.x2 - BRIDGE_DECK.x1) * t, cz = BRIDGE_DECK.z1 + (BRIDGE_DECK.z2 - BRIDGE_DECK.z1) * t;
      for (const o of [-BRIDGE_DECK.halfW, 0, BRIDGE_DECK.halfW]) pts.push([cx + side.x * o, cz + side.z * o]);
    }
    pts.push([45, 37]); // the lake's middle, inside the bounds
    for (const [x, z] of pts) {
      const p = keepOutPoint(area, x, z);
      const at = `(${x.toFixed(2)}, ${z.toFixed(2)}) -> (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
      expect(inWater(area.waters, p.x, p.z), at).toBe(false);
      expect(p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ, at).toBe(true);
      expect(outside(p), at).toBe(true);
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
  // the island's eight, appended so secrets.js's indices into the first nine don't move
  const ISLAND_AT = [[34.7, 34.7], [25.5, 38], [18, 28], [19.8, 23.3], [28, 18], [34.7, 21.3], [25.5, 24.2], [15.76, 11.68]];
  const perchAt = (x, z) => area.perches.find((p) => p.x === x && p.z === z && !p.requires);
  const collider = (x, z) => area.colliders.find((c) => c.x === x && c.z === z);
  const waterDist = (x, z) => Math.min(...PINES_WATERS.map((w) => waterGap(w, x, z)));
  const GOLD_BUSHES = [[28, -40], [32, -40], [30, -45]];
  // Where the race rings stand: each POI pushed clear of colliders and water,
  // exactly as the game does.
  const rings = () => area.pois.map((p) => clearSpot(p, area.colliders, area.bounds, area.waters));

  it('pines: seventeen POIs, the Pines\' nine at least 2 m from water, all clear of every collider by 1.6', () => {
    expect(area.pois.map((p) => [p.x, p.z])).toEqual([...POIS, ...ISLAND_AT]);
    for (const p of area.pois.slice(0, 9)) expect(p.group, `poi (${p.x}, ${p.z})`).toBeUndefined();
    for (const p of area.pois.slice(9)) expect(p.group, `poi (${p.x}, ${p.z})`).toBe('island');
    for (const p of area.pois.slice(0, 9)) {
      const at = `poi (${p.x}, ${p.z})`;
      expect(waterDist(p.x, p.z), at).toBeGreaterThanOrEqual(2);
      // clear by clearSpot's own margin, so a race ring stands on the POI
      for (const c of area.colliders) {
        expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, `${at} by (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(1.6);
      }
    }
    for (const p of area.pois.slice(9)) {
      for (const c of area.colliders) {
        expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, `poi (${p.x}, ${p.z}) by (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(1.6);
      }
    }
    expect(rings().map((p) => [p.x, p.z])).toEqual([...POIS, ...ISLAND_AT]);
  });

  it('pines: ten collectibles, six scenics, at least two vantage perches', () => {
    expect(area.collectibles.slice(5)).toEqual(ISLAND_COLLECTIBLES);
    expect(area.scenics.slice(3)).toEqual(ISLAND_SCENICS);
    expect(area.collectibles).toHaveLength(10);
    expect(area.scenics).toHaveLength(6);
    expect(area.collectibles.slice(0, 5)).toEqual([
      { id: 'pines-find-1', x: -20, z: 20, label: 'a fat pine cone' },
      { id: 'pines-find-2', x: 24, z: -14, label: 'an owl feather' },
      { id: 'pines-find-3', x: -46, z: 22, label: 'a tuft of bog cotton' },
      { id: 'pines-find-4', x: -40, z: -36, label: 'a shiny beetle shell' },
      { id: 'pines-find-5', x: -37, z: -15, y: 0.72, label: 'a mossy pebble on the low stone' },
    ]);
    expect(area.scenics.slice(0, 3)).toEqual([
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
    // the Pines' three, then the island's three (the island describe below)
    expect(GOLD_MICE.pines).toEqual([
      { id: 'gm-pines-1', x: 3, z: -29, y: 1.9 },
      { id: 'gm-pines-2', x: -38, z: -16, y: 1.9 },
      { id: 'gm-pines-3', x: 30, z: -42, y: 0 },
      { id: 'gm-pines-4', x: 28, z: 29.8, y: 2.1 },
      { id: 'gm-pines-5', x: 38, z: 28, y: 1.9 },
      { id: 'gm-pines-6', x: 21.5, z: 35.2, y: 0 },
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
      // the island: the Old Ash's limb from its boulder, the Watch Rock from
      // its low rock, and a meeting stone is its own first step
      if (Math.hypot(x - 28, z - 29.65) < 1.5) return perchAt(28, 31.2);
      if (Math.hypot(x - 38, z - 28) < 1.5) return perchAt(37, 29);
      const stone = MEETING_STONES.find((m) => Math.hypot(x - m.x, z - m.z) < 0.1);
      if (stone) return perchAt(stone.x, stone.z);
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
    expect(chainPerches).toHaveLength(8);
    const all = [
      ...area.pois, ...area.scenics, ...area.collectibles, ...GOLD_MICE.pines, ...chainPerches,
      ...GOLD_BUSHES.map(([x, z]) => ({ x, z })), ...area.puddles, ...FROG_HIDES,
      { x: 9.0, z: 3.6 }, { x: 12.2, z: 3.6 }, BRIDGE_FOOT, SPAWN,
      ...MEETING_STONES, ...ISLAND_BUSHES,
    ];
    for (const p of all) expect(has(p.x, p.z), `(${p.x}, ${p.z})`).toBe(true);
    // and nothing else: 17 POIs + 6 scenics + 10 collectibles + 6 golden mice
    // + 8 chain perches + 3 gold bushes + 3 puddles + 3 frog hides + 2 truce
    // stones + the bridge foot + the spawn + the island's 6 meeting stones and
    // 3 bushes
    expect(all).toHaveLength(69);
    expect(PINES_KEEP_CLEAR).toHaveLength(69);
    expect(Object.isFrozen(PINES_KEEP_CLEAR)).toBe(true);
    // the bridge foot is derived in floating point, so it is matched within a hair
    expect(PINES_KEEP_CLEAR.some(([x, z]) => Math.abs(x - 10.6) < 1e-6 && Math.abs(z - 4.8) < 1e-6)).toBe(true);
  });

  // The chase camera at the default zoom step (camzoom step 1): a cat 3 m
  // from the pillar, the camera 4.5 m further out and 2.2 m up. Nothing in the
  // way: not the pillar, not its boulder, not the merged pine stand and not
  // any near pine (both come with the scenery, and this runs again then,
  // unchanged).
  const blockers = (...names) => {
    const list = names.map((n) => scene.getObjectByName(n));
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

  it('carries its critters, two moments and three puddles, and no villagers', () => {
    // the Pines' own, then the island's six after them
    const own = area.critterSpawns.slice(0, area.critterSpawns.length - 6);
    expect(area.critterSpawns.slice(-6)).toEqual([
      // either side of the Old Ash's trunk
      { type: 'bird', x: 26.5, z: 28 }, { type: 'bird', x: 29.5, z: 28 },
      { type: 'butterfly', x: 31, z: 32 }, { type: 'butterfly', x: 25, z: 32 }, { type: 'butterfly', x: 30, z: 24 },
      { type: 'mouse', x: 24, z: 37.5, x2: 27, z2: 39.5 },
    ]);
    expect(area.critterSpawns.slice(-6)).toEqual(ISLAND_CRITTERS);
    expect(own.filter((c) => c.type !== 'bird')).toEqual([
      // dry beside bog-1 and bog-2, not through them as the plan drew them,
      // so a cat can stalk them
      { type: 'frog', x: -35, z: 21, x2: -35.5, z2: 16 },
      { type: 'frog', x: -40, z: 35, x2: -40, z2: 30 },
      { type: 'frog', x: -34, z: -26, x2: -40, z2: -30 },
      { type: 'squirrel', x: -12, z: -34 }, { type: 'squirrel', x: 20, z: -20 },
      // the middle duck moved from (36, 16) to (37, 15), so none paddles within
      // 2 m of the island's rim
      { type: 'duck', x: 34, z: 14 }, { type: 'duck', x: 37, z: 15 }, { type: 'duck', x: 38, z: 13 },
      { type: 'mouse', x: 10, z: -36, x2: 16, z2: -30 },
      { type: 'mouse', x: -20, z: -44, x2: -14, z2: -38 },
    ]);
    expect(own.filter((c) => c.type === 'bird'))
      .toEqual(pinesTrees().near.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })));
    // butterflies only out on the open island, none under the dark pines
    expect(area.critterSpawns.some((c) => c.type === 'villager')).toBe(false);
    expect(own.some((c) => c.type === 'butterfly')).toBe(false);
    expect(area.moments).toEqual([
      { id: 'frog-plop', type: 'frog', label: 'a frog hopping for the bog', x: -36.1, z: 16, from: { x: -30, z: 22 } },
      { id: 'duck-ring', type: 'duck', label: 'ducks paddling past the island', x: 31, z: 17.6, from: { x: 38, z: 15 } },
    ]);
    expect(area.puddles).toEqual([{ x: -6, z: 38, r: 0.9 }, { x: 22, z: -6, r: 0.8 }, { x: 19.5, z: 26.5, r: 0.8 }]);
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
      if (c.type === 'bird' || c.type === 'butterfly') {
        // A bird sits at the foot of its pine, inside the trunk's collider:
        // a cat reaches it from beside the trunk. A butterfly hovers and
        // drifts rather than standing on one cell, so it is checked the same
        // way: within reach of where a cat can stand.
        expect(reachesWithin(area, c.x, c.z, 1.5), `${c.type} (${c.x}, ${c.z})`).toBe(true);
        continue;
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

  // It pins no ring positions, only that five distinct POIs are drawn, so
  // the island's eight (and Task 7's one-per-group cap) change nothing here.
  it('race: a Pines course of five rings is drawn from its POIs', () => {
    const course = raceCourse(area.pois, seedFromCode('2026-11-01-pines'));
    expect(course).toHaveLength(5);
    expect(new Set(course).size).toBe(5);
    for (const p of course) expect(area.pois).toContain(p);
  });
  // ---------------------------------------------------------------------------
  // The island (Island Task 6): the Meeting Ring, the Old Ash, the Watch Rock
  // and the things to find there, all built into the Pines from island.js.
  describe('the island', () => {
    const fromCentre = (p) => Math.hypot(p.x - ISLAND_LAND.x, p.z - ISLAND_LAND.z);
    const deckSeg = [BRIDGE_DECK.x1, BRIDGE_DECK.z1, BRIDGE_DECK.x2, BRIDGE_DECK.z2];
    const bay = () => byId('lake-bay');
    const noBridge = { ...area, waters: PINES_WATERS.map((w) => (w.id === 'lake-bay' ? { ...w, decks: [] } : w)) };

    it('eight island POIs, at least 2 m from water (the bridge one on its deck) and clear of every collider by 1.6', () => {
      expect(ISLAND_POIS).toEqual(ISLAND_AT.map(([x, z]) => ({ x, z, group: 'island' })));
      expect(area.pois.slice(9)).toEqual(ISLAND_POIS);
      for (const p of ISLAND_POIS) {
        const at = `poi (${p.x}, ${p.z})`;
        if (p === ISLAND_POIS[7]) {
          // on the bridge, 8 m from the island end
          expect(onDeck(bay(), p.x, p.z), at).toBe(true);
          expect(Math.hypot(p.x - BRIDGE_DECK.x1, p.z - BRIDGE_DECK.z1), at).toBeCloseTo(8, 6);
          expect(waterClearance(area.waters, p.x, p.z), at).toBeGreaterThanOrEqual(2);
        } else {
          expect(waterDist(p.x, p.z), at).toBeGreaterThanOrEqual(2);
          // and 2.5 m inside the rim
          expect(ISLAND_LAND.r - fromCentre(p), at).toBeGreaterThanOrEqual(2.5);
        }
        for (const c of area.colliders) {
          expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, `${at} by (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(1.6);
        }
        // the race ring stands on it
        const ring = clearSpot(p, area.colliders, area.bounds, area.waters);
        expect([ring.x, ring.z], at).toEqual([p.x, p.z]);
      }
    });

    it("the island's five finds, three scenics (no gifts), the Meeting Ring's six stones and two vantage perches", () => {
      expect(ISLAND_COLLECTIBLES).toEqual([
        { id: 'pines-find-6', x: 24.5, z: 35.5, label: 'a smooth white pebble' },
        { id: 'pines-find-7', x: 33, z: 18.5, label: 'a grey goose feather' },
        { id: 'pines-find-8', x: 17.5, z: 31, label: "a snail shell at the water's edge" },
        { id: 'pines-find-9', x: 12.76, z: 7.68, label: 'a pine cone dropped on the planks' },
        { id: 'pines-find-10', x: 28, z: 22, y: 0.4, label: 'a bright beetle wing on a meeting stone' },
      ]);
      expect(ISLAND_SCENICS).toEqual([
        { id: 'bridge-landing', x: 22, z: 20.5, label: 'the end of the bridge', gifts: false },
        { id: 'meeting-ring', x: 30.5, z: 25.5, label: 'the meeting ring under the old ash', gifts: false },
        { id: 'lake-view', x: 35.5, z: 36, label: 'the lake, looking over to the Woods', gifts: false },
      ]);
      expect(MEETING_STONES).toEqual([
        { x: 33.2, z: 31 }, { x: 28, z: 34 }, { x: 22.8, z: 31 }, { x: 22.8, z: 25 }, { x: 28, z: 22 }, { x: 33.2, z: 25 },
      ]);
      for (const s of MEETING_STONES) {
        expect(fromCentre(s), `stone (${s.x}, ${s.z})`).toBeCloseTo(6, 1);
        expect(perchAt(s.x, s.z), `stone (${s.x}, ${s.z})`).toEqual({ x: s.x, z: s.z, y: 0.4, kind: 'stone' });
        expect(collider(s.x, s.z)?.r, `stone (${s.x}, ${s.z})`).toBe(0.6);
      }
      expect(ISLAND_PERCHES).toEqual([
        { x: 28, z: 31.2, y: 0.72, kind: 'stone' },
        { x: 28, z: 29.5, y: 2.1, kind: 'tree', label: 'old ash lookout', vantage: true },
        { x: 37, z: 29, y: 0.72, kind: 'stone' },
        { x: 38, z: 28, y: 1.9, kind: 'stone', label: 'watch rock', vantage: true },
      ]);
      expect(ISLAND_PERCHES.filter((p) => p.vantage)).toHaveLength(2);
      // the beetle wing lies on the north stone, at its top
      expect(perchAt(28, 22).y).toBe(ISLAND_COLLECTIBLES[4].y);
      expect(ISLAND_PUDDLES).toEqual([{ x: 19.5, z: 26.5, r: 0.8 }]);
      expect(ISLAND_MOMENTS).toEqual([
        { id: 'duck-ring', type: 'duck', label: 'ducks paddling past the island', x: 31, z: 17.6, from: { x: 38, z: 15 } },
      ]);
      // the cat watches the ducks from the north shore, on dry ground
      const m = ISLAND_MOMENTS[0];
      expect(fromCentre(m)).toBeCloseTo(10.8, 1);
      expect(inWater(area.waters, m.x, m.z)).toBe(false);
      expect(inWater(area.waters, m.from.x, m.from.z)).toBe(true);
      // one merged mesh for the ring, and the bridge comes in through the gap
      // between the stones at (22.8, 25) and (28, 22)
      const ring = scene.getObjectByName('meetingRing');
      expect(ring?.isMesh).toBe(true);
      expect(ring.material.color.getHex()).toBe(0x9a9488);
      expect(ring.userData.noCast).toBeUndefined();
      // (the bridge points at the Old Ash: its line passes between the two
      // stones, each further off it than a stone's collider plus a cat)
      const len = Math.hypot(BRIDGE_DECK.x1 - BRIDGE_DECK.x2, BRIDGE_DECK.z1 - BRIDGE_DECK.z2);
      const ux = (BRIDGE_DECK.x1 - BRIDGE_DECK.x2) / len, uz = (BRIDGE_DECK.z1 - BRIDGE_DECK.z2) / len;
      const sideOf = ({ x, z }) => (x - BRIDGE_DECK.x1) * uz - (z - BRIDGE_DECK.z1) * ux;
      expect(Math.abs(sideOf({ x: 28, z: 28 }))).toBeLessThan(0.01);
      const [w, n] = [sideOf({ x: 22.8, z: 25 }), sideOf({ x: 28, z: 22 })];
      expect(Math.sign(w)).toBe(-Math.sign(n));
      for (const d of [w, n]) expect(Math.abs(d)).toBeGreaterThan(0.6 + 0.35);
    });

    const chainTest = (name, low, top, lowR, topR) => {
      expect(perchAt(low.x, low.z)).toEqual(low);
      expect(perchAt(top.x, top.z)).toEqual(top);
      expect(collider(low.x, low.z)?.r, name).toBe(lowR);
      expect(canReach(low, { x: low.x, z: low.z }, 0)).toBe(true);
      expect(canReach(top, { x: low.x, z: low.z }, low.y)).toBe(true);
      expect(canReach(top, { x: top.x, z: top.z }, 0)).toBe(false);
      expect(reachesWithin(area, low.x, low.z, BASE_CLIMB_BUDGET.reachLow)).toBe(true);
      if (topR !== undefined) expect(collider(top.x, top.z)?.r, name).toBe(topR);
    };

    it("the Old Ash chain is two hops and its limb can't be reached from the grass", () => {
      chainTest('old ash',
        { x: 28, z: 31.2, y: 0.72, kind: 'stone' },
        { x: 28, z: 29.5, y: 2.1, kind: 'tree', label: 'old ash lookout', vantage: true }, 0.7);
      // the trunk's collider, under the tree, not under the limb perch
      expect(collider(28, 28)?.r).toBe(1.0);
      // outside Sure Claws' 1.6-2.0 band for a 'tree' perch (src/climbing.js)
      expect(perchAt(28, 29.5).y).toBeGreaterThan(2.0);
      const ash = scene.getObjectByName('oldAsh');
      expect(ash).toBeTruthy();
      expect([ash.position.x, ash.position.y, ash.position.z, ash.scale.x]).toEqual([28, 0, 28, 2.6]);
      const boulder = scene.getObjectByName('ashBoulder');
      expect([boulder.position.x, boulder.position.z]).toEqual([28, 31.2]);
    });

    it("the Watch Rock chain is two hops and its top can't be reached from the grass", () => {
      chainTest('watch rock',
        { x: 37, z: 29, y: 0.72, kind: 'stone' },
        { x: 38, z: 28, y: 1.9, kind: 'stone', label: 'watch rock', vantage: true }, 0.7, 0.9);
      const rock = scene.getObjectByName('watchRock');
      const step = scene.getObjectByName('watchRockStep');
      expect(rock.position).toMatchObject({ x: 38, y: 0.95, z: 28 });
      expect(rock.material.color.getHex()).toBe(0x8e8c88);
      expect([step.position.x, step.position.z]).toEqual([37, 29]);
      // the two chain boulders share one material, made per build
      expect(step.material).toBe(scene.getObjectByName('ashBoulder').material);
      expect(built().scene.getObjectByName('watchRockStep').material).not.toBe(step.material);
    });

    it('the Watch Rock is as wide at the foot as its collider', () => {
      const p = scene.getObjectByName('watchRock').geometry.parameters;
      expect(p.radiusBottom).toBe(0.9);
      expect(p.radiusTop).toBe(0.75);
      expect(p.height).toBe(1.9);
      expect(p.radialSegments).toBe(7);
      expect(collider(38, 28)?.r).toBe(p.radiusBottom);
    });

    it("the Old Ash's limb reaches out past the trunk", () => {
      scene.updateMatrixWorld(true);
      const ash = scene.getObjectByName('oldAsh');
      const limb = ash.children.find((c) => c.geometry?.type === 'CylinderGeometry' && c.rotation.x !== 0);
      expect(limb).toBeTruthy();
      expect(limb.material.color.getHex()).toBe(0x7a5230);
      const box = new THREE.Box3().setFromObject(limb);
      expect(box.min.z).toBeCloseTo(28.6, 2);
      expect(box.max.z).toBeCloseTo(30.2, 2);
      expect(box.min.y).toBeGreaterThanOrEqual(1.85);
      expect(box.max.y).toBeLessThanOrEqual(2.15);
      expect(Math.abs(box.min.x - 28)).toBeLessThan(0.15);
      // The trunk tapers from 0.35 to 0.25 over its 2 m, scaled by 2.6: at
      // y 2.0 (local 2.0 / 2.6) it is this wide.
      const s = 2.6;
      const trunkAt2 = (0.35 - (0.1 * (2.0 / s)) / 2) * s;
      const mouse = GOLD_MICE.pines[3];
      expect(Math.hypot(mouse.x - 28, mouse.z - 28)).toBeGreaterThan(trunkAt2 + 0.3);
      expect(Math.hypot(28 - 28, 29.5 - 28)).toBeGreaterThan(trunkAt2 + 0.3);
      // and both sit over the limb
      expect(mouse.z).toBeGreaterThan(box.min.z);
      expect(mouse.z).toBeLessThan(box.max.z);
    });

    it('the climbing golden mice sit on the chain tops, and the third hides among three bushes', () => {
      const [, , , ash, watch, hidden] = GOLD_MICE.pines;
      expect(ash).toEqual({ id: 'gm-pines-4', x: 28, z: 29.8, y: 2.1 });
      expect(watch).toEqual({ id: 'gm-pines-5', x: 38, z: 28, y: 1.9 });
      expect(hidden).toEqual({ id: 'gm-pines-6', x: 21.5, z: 35.2, y: 0 });
      // inside checkFind's 1.0 m of the perch it stands by
      expect(Math.hypot(ash.x - 28, ash.z - 29.5)).toBeLessThan(1.0);
      expect(perchAt(28, 29.5).y).toBe(ash.y);
      expect(perchAt(watch.x, watch.z).y).toBe(watch.y);
      expect(ISLAND_BUSHES).toEqual([{ x: 22, z: 33.5 }, { x: 20, z: 35 }, { x: 22.5, z: 36.5 }]);
      for (const { x, z } of ISLAND_BUSHES) {
        expect(scene.children.find((o) => o.position.x === x && o.position.z === z), `bush (${x}, ${z})`).toBeTruthy();
        expect(collider(x, z)).toBeUndefined();
        expect(Math.hypot(hidden.x - x, hidden.z - z)).toBeLessThan(2);
      }
    });

    it("every island find, POI, scenic and golden mouse is reached on foot from the Pines' spawn, and only over the bridge", () => {
      const ids = new Set([...ISLAND_COLLECTIBLES, ...ISLAND_SCENICS, ...GOLD_MICE.pines.slice(3)].map((p) => p.id));
      const atIsland = (t) => ids.has(t.id) || ISLAND_POIS.some((p) => p.x === t.x && p.z === t.z && t.what.startsWith('poi'));
      const mine = targets().filter(atIsland);
      expect(mine).toHaveLength(8 + 5 + 3 + 3);
      const missed = [], leaked = [];
      for (const t of mine) {
        const on = (a) => (t.step
          ? reachesWithin(a, t.step.x, t.step.z, BASE_CLIMB_BUDGET.reachLow)
          : reaches(a, t.x, t.z));
        if (!on(area)) missed.push(t.what);
        if (on(noBridge)) leaked.push(t.what);
      }
      expect(missed).toEqual([]);
      expect(leaked).toEqual([]);
    });

    it("the island's golden mice are in sight from the chase camera", () => {
      const [, , , ash, watch] = GOLD_MICE.pines;
      const list = blockers('oldAsh', 'ashBoulder', 'meetingRing', 'watchRock', 'watchRockStep');
      // The Old Ash's mouse from the south, east and west. From the north the
      // trunk stands between the camera and the limb.
      inSight(ash, [[0, 1], [1, 0], [-1, 0]], list);
      // The Watch Rock's from the north, south and west. The lake is 3 m east
      // of it, so no cat stands where an east camera would follow from.
      inSight(watch, [[0, -1], [0, 1], [-1, 0]], list);
    });

    it("the island's birds stand either side of the Old Ash, clear of its trunk", () => {
      const birds = ISLAND_CRITTERS.filter((c) => c.type === 'bird');
      expect(birds).toHaveLength(2);
      for (const b of birds) expect(Math.hypot(b.x - 28, b.z - 28), `bird (${b.x}, ${b.z})`).toBeGreaterThan(1.0 + 0.35);
      expect(birds[0].x < 28 && birds[1].x > 28).toBe(true);
    });

    it('islandReeds is seeded and stands on the rim, clear of the bridge and every find', () => {
      const ring = islandReeds();
      expect(islandReeds()).toEqual(ring);
      expect(ring.length).toBeGreaterThanOrEqual(18);
      expect(ring.length).toBeLessThanOrEqual(30);
      const records = [
        ...ISLAND_POIS, ...ISLAND_SCENICS, ...ISLAND_COLLECTIBLES, ...ISLAND_PERCHES, ...MEETING_STONES,
        ...ISLAND_BUSHES, ...ISLAND_PUDDLES, ...GOLD_MICE.pines.slice(3), ...ISLAND_MOMENTS,
      ];
      for (const r of ring) {
        const at = `reed (${r.x}, ${r.z})`;
        expect(fromCentre(r), at).toBeGreaterThanOrEqual(12.4);
        expect(fromCentre(r), at).toBeLessThanOrEqual(12.8);
        expect(inWater(area.waters, r.x, r.z), at).toBe(false);
        expect(segDist(r.x, r.z, deckSeg), at).toBeGreaterThanOrEqual(2);
        for (const p of records) expect(Math.hypot(r.x - p.x, r.z - p.z), `${at} by (${p.x}, ${p.z})`).toBeGreaterThanOrEqual(3);
      }
      // drawn in the Pines' one merged reed bed
      expect(pinesReeds().slice(-ring.length)).toEqual(ring);
      expect(scene.children.filter((o) => o.name === 'reeds')).toHaveLength(1);
    });

    it('goals: every goal drawn in the Pines can still be finished there', () => {
      // The island adds no tippables, boxes or villagers, so nothing a goal
      // needs is new. The shipped goal test runs unchanged; this pins the
      // island's side of it.
      expect(area.tippables).toEqual([]);
      expect(area.boxes).toEqual([]);
      expect(ISLAND_CRITTERS.some((c) => c.type === 'villager')).toBe(false);
    });

    it("the island's labels are our own words", () => {
      const BOOK_PLACES = ['gathering', 'fourtrees', 'great rock', 'great oak', 'highrock', 'highstones',
        'moonstone', 'moonpool', 'sunningrocks', 'tree-bridge', 'treebridge', 'starclan'];
      const labels = [...ISLAND_SCENICS, ...ISLAND_COLLECTIBLES, ...ISLAND_PERCHES, ...ISLAND_MOMENTS].map((r) => r.label).filter(Boolean);
      expect(labels.length).toBeGreaterThanOrEqual(10);
      for (const l of labels) for (const w of BOOK_PLACES) expect(l.toLowerCase()).not.toContain(w);
    });

    it('nothing in island.js reads the edition', () => {
      const src = readFileSync(fileURLToPath(new URL('../src/world/island.js', import.meta.url)), 'utf8');
      expect(src).not.toMatch(/edition/i);
    });

    it('every island record is frozen', () => {
      for (const list of [ISLAND_POIS, ISLAND_SCENICS, ISLAND_COLLECTIBLES, ISLAND_PERCHES, MEETING_STONES,
        ISLAND_BUSHES, ISLAND_PUDDLES, ISLAND_CRITTERS, ISLAND_MOMENTS]) {
        expect(Object.isFrozen(list)).toBe(true);
        for (const r of list) expect(Object.isFrozen(r)).toBe(true);
      }
    });
  });
});

describe('the Pines: the forest', () => {
  const { near, stand } = pinesTrees();
  const all = [...near, ...stand];
  const BOUNDS = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  const undecked = PINES_WATERS.map((w) => ({ ...w, decks: [] }));
  const waterDist = (x, z) => Math.min(...undecked.map((w) => waterGap(w, x, z)));
  // the mire's two crossings; the island bridge has its own rule
  const decks = DECKS;
  const pathDist = (x, z) => Math.min(...PINES_PATHS.map((s) => segDist(x, z, s)));
  // builder.pine's lowest cone reaches 1.3 m per unit of scale; a path is 3 m wide
  const canopy = (t) => 1.5 + 1.3 * t.scale + 0.5;
  // the canopy rule's paths: each stretched by the far camera's distance at
  // both ends (pines.js's camPathDist)
  const stretch = ([x1, z1, x2, z2]) => {
    const len = Math.hypot(x2 - x1, z2 - z1), k = ZOOM_STEPS[2].dist / len;
    return [x1 - (x2 - x1) * k, z1 - (z2 - z1) * k, x2 + (x2 - x1) * k, z2 + (z2 - z1) * k];
  };
  const camPathDist = (x, z) => Math.min(...PINES_PATHS.map((s) => segDist(x, z, stretch(s))));
  const nearDist = (t) => canopy(t) + 4;
  const isNear = (t) => pathDist(t.x, t.z) < nearDist(t) || Math.hypot(t.x - SPAWN.x, t.z - SPAWN.z) < 12;

  it('pinesTrees is deterministic, dense, and keeps its clearances', () => {
    expect(pinesTrees()).toEqual({ near, stand });
    // 25, not 30: the BUG 1 fix keeps pines off the paths' bends and ends
    // (the far camera's swing), which took the near pines from 40 to 27
    expect(near.length).toBeGreaterThanOrEqual(25);
    expect(near.length).toBeLessThanOrEqual(40);
    expect(stand.length).toBeGreaterThanOrEqual(70);
    expect(stand.length).toBeLessThanOrEqual(150);
    for (const t of all) {
      const at = `pine (${t.x}, ${t.z})`;
      expect(t.x >= BOUNDS.minX && t.x <= BOUNDS.maxX && t.z >= BOUNDS.minZ && t.z <= BOUNDS.maxZ, at).toBe(true);
      expect(waterDist(t.x, t.z), at).toBeGreaterThanOrEqual(2.5);
      expect(camPathDist(t.x, t.z), at).toBeGreaterThanOrEqual(canopy(t));
      for (const d of decks) expect(rectDist(d, t.x, t.z), at).toBeGreaterThanOrEqual(4);
      for (const [px, pz] of PINES_KEEP_CLEAR) expect(Math.hypot(t.x - px, t.z - pz), `${at} on (${px}, ${pz})`).toBeGreaterThanOrEqual(4);
    }
    for (const t of near) expect(isNear(t), `near pine (${t.x}, ${t.z})`).toBe(true);
    // A pine a kid walks past never ends up still in the stand, unless the
    // forty swaying ones are full.
    if (near.length < 40) for (const t of stand) expect(isNear(t), `stand pine (${t.x}, ${t.z})`).toBe(false);
  });

  // BUG 1 from the live check: at a path's bend or end the chase camera sat
  // inside a pine's canopy. The far camera is 7 m behind the cat, so at a bend
  // or a segment's end it leaves the path's corridor. This walks the cat down
  // every path (and the bridge deck) and puts the camera exactly where
  // catcam.cameraOffset puts it, then asks whether that spot is inside any
  // pine: a trunk, or one of its three cones, each as wide as builder.js draws
  // it at that height, scaled by the pine's scale.
  //
  // Not asserted: the farthest step (11 m) with the view dragged right down to
  // pitch -0.25. There the camera hangs low and far enough out that it can
  // still graze a cone; the in-game pull-in (camzoom.js) and the short time a
  // kid holds that view make it rare, and keeping clear of it would empty the
  // forest round every path.
  it('the chase camera never ends up inside a pine, at a bend, an end or on the bridge', () => {
    // the solid of a pine at local height y (unscaled): the widest of the
    // cones whose span holds y, or the trunk below them
    const solidR = (y) => {
      let r = y >= 0 && y <= PINE_TRUNK.h ? PINE_TRUNK.rBottom : 0;
      for (const [R, h, cy] of PINE_CONES) {
        const top = cy + h / 2;
        if (y >= cy - h / 2 && y <= top) r = Math.max(r, (R * (top - y)) / h);
      }
      return r;
    };
    const insidePine = (cx, cy, cz) => {
      for (const t of all) {
        const r = solidR(cy / t.scale) * t.scale;
        if (r > 0 && Math.hypot(cx - t.x, cz - t.z) < r) return t;
      }
      return null;
    };
    const views = [];
    for (const step of [0, 1, 2]) for (const pitch of [-0.25, 0.18, 0.85]) views.push({ step, pitch });
    views.push({ step: 3, pitch: 0.18 });
    const off = new THREE.Vector3();
    const deck = [BRIDGE_DECK.x1, BRIDGE_DECK.z1, BRIDGE_DECK.x2, BRIDGE_DECK.z2];
    const walks = [
      ...PINES_PATHS.map((s) => ({ seg: s, sides: [0, 1.2, -1.2], what: `path [${s}]` })),
      { seg: deck, sides: [0], what: 'the bridge deck' },
    ];
    const hits = [];
    for (const { seg: [x1, z1, x2, z2], sides, what } of walks) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ux = (x2 - x1) / len, uz = (z2 - z1) / len;
      // the cat faces along the segment, either way; yaw puts the camera at
      // +sin(yaw), +cos(yaw) from the cat, so a cat facing (fx, fz) has yaw
      // atan2(-fx, -fz)
      const yaws = [];
      for (const [fx, fz] of [[ux, uz], [-ux, -uz]]) {
        const y0 = Math.atan2(-fx, -fz);
        yaws.push(y0, y0 + 0.17, y0 - 0.17);
      }
      for (let d = 0; d <= len + 1e-9; d += 0.5) {
        for (const o of sides) {
          const catX = x1 + ux * d - uz * o, catZ = z1 + uz * d + ux * o;
          for (const yaw of yaws) {
            for (const { step, pitch } of views) {
              const { dist, height } = ZOOM_STEPS[step];
              cameraOffset(yaw, pitch, dist, height, off);
              const cx = catX + off.x, cz = catZ + off.z;
              const cy = Math.max(off.y, MIN_CAMERA_Y);
              const t = insidePine(cx, cy, cz);
              if (t && hits.length < 20) {
                hits.push(`${what} cat (${catX.toFixed(1)}, ${catZ.toFixed(1)}) step ${step} pitch ${pitch} yaw ${yaw.toFixed(2)}: camera (${cx.toFixed(1)}, ${cy.toFixed(1)}, ${cz.toFixed(1)}) in pine (${t.x}, ${t.z}) x${t.scale}`);
              }
            }
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('keeps every pine off the fallen pine and clear round both climbs', () => {
    const h = 5 / 2, sx = Math.sin(0.4), sz = Math.cos(0.4);
    const log = [-14 - sx * h, 42 - sz * h, -14 + sx * h, 42 + sz * h];
    for (const t of all) {
      const at = `pine (${t.x}, ${t.z})`;
      expect(segDist(t.x, t.z, log), at).toBeGreaterThanOrEqual(3);
      expect(Math.hypot(t.x - 3, t.z - -29), at).toBeGreaterThanOrEqual(6);
      expect(Math.hypot(t.x + 38, t.z + 16), at).toBeGreaterThanOrEqual(6);
    }
  });

  it('leaves the forest walkable: no two trunks closer than a cat can pass between', () => {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const gap = Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) - 0.4 * all[i].scale - 0.4 * all[j].scale;
        expect(gap, `(${all[i].x}, ${all[i].z}) and (${all[j].x}, ${all[j].z})`).toBeGreaterThan(2 * 0.35);
      }
    }
  });

  it("pines stand on the River's border where the River's own pines stand", () => {
    // the River's ruling R1, from the other side: its north-edge pines go on over the border
    expect(all.filter((t) => t.x >= -6 && t.x <= 24 && t.z >= 40).length).toBeGreaterThanOrEqual(2);
  });

  it('plants a collider for every pine, a swaying pine for each near one, and the rest in one stand', () => {
    // the four chain colliders, the two truce stones and the three along the
    // fallen pine; then the island's ten: the Old Ash, its boulder, the six
    // meeting stones, the Watch Rock and its low rock
    expect(area.colliders).toHaveLength(near.length + stand.length + 19);
    for (const t of all) {
      expect(area.colliders.some((c) => c.x === t.x && c.z === t.z && c.r === Math.round(0.4 * t.scale * 100) / 100), `collider (${t.x}, ${t.z})`).toBe(true);
    }
    for (const t of near) {
      expect(scene.children.some((o) => o.isGroup && o.position.x === t.x && o.position.z === t.z && o.scale.x === t.scale), `near pine (${t.x}, ${t.z})`).toBe(true);
    }
    const standObj = scene.getObjectByName('pineStand');
    expect(standObj).toBeTruthy();
    const meshes = [];
    standObj.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes).toHaveLength(2);
    // a pine has no low fork
    expect(area.perches.some((p) => p.requires)).toBe(false);
  });

  it('the birds sit in the first four near pines, and two more in the Old Ash', () => {
    const birds = area.critterSpawns.filter((c) => c.type === 'bird' && Math.hypot(c.x - 28, c.z - 28) > 13);
    expect(area.critterSpawns.filter((c) => c.type === 'bird')).toHaveLength(6);
    expect(birds).toHaveLength(4);
    expect(birds).toEqual(near.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })));
  });
});

describe('the Pines: the forest floor and the swamp edge', () => {
  const { near, stand } = pinesTrees();
  const trunks = [...near, ...stand];
  const { ferns, toadstools } = pinesUndergrowth();
  const reeds = pinesReeds();
  const pads = pinesLilyPads();
  const undecked = PINES_WATERS.map((w) => ({ ...w, decks: [] }));
  const waterDist = (x, z) => Math.min(...undecked.map((w) => waterGap(w, x, z)));
  // the mire's two crossings; the island bridge has its own rule
  const decks = DECKS;
  const pathDist = (x, z) => Math.min(...PINES_PATHS.map((s) => segDist(x, z, s)));
  const h = 5 / 2, sx = Math.sin(0.4), sz = Math.cos(0.4);
  const log = [-14 - sx * h, 42 - sz * h, -14 + sx * h, 42 + sz * h];
  const inBounds = (x, z) => x >= -50 && x <= 50 && z >= -50 && z <= 50;

  it('pinesUndergrowth and pinesReeds are seeded, and a real forest floor and swamp edge', () => {
    expect(pinesUndergrowth()).toEqual({ ferns, toadstools });
    expect(pinesReeds()).toEqual(reeds);
    expect(pinesLilyPads()).toEqual(pads);
    expect(ferns.length).toBeGreaterThanOrEqual(100);
    expect(ferns.length).toBeLessThanOrEqual(220);
    for (const f of ferns) expect(f.x, `fern (${f.x}, ${f.z}) in the swamp`).toBeGreaterThanOrEqual(-27);
    expect(toadstools.length).toBeGreaterThanOrEqual(30);
    expect(toadstools.length).toBeLessThanOrEqual(60);
    expect(reeds.length).toBeGreaterThanOrEqual(100);
    expect(reeds.length).toBeLessThanOrEqual(220);
    expect(pads.length).toBeGreaterThanOrEqual(10);
    expect(pads.length).toBeLessThanOrEqual(35);
    const bogs = ['bog-1', 'bog-2', 'bog-3', 'bog-4'].map(byId);
    for (const p of pads) {
      expect(inWater(bogs, p.x, p.z), `pad (${p.x}, ${p.z})`).toBe(true);
      expect(p.r).toBeGreaterThanOrEqual(0.22);
      expect(p.r).toBeLessThanOrEqual(0.38);
    }
  });

  it('keeps every fern, toadstool and reed off the paths, the crossings, the spawn, the bridge foot and every find', () => {
    for (const [kind, list] of [['fern', ferns], ['toadstool', toadstools]]) {
      for (const f of list) {
        const at = `${kind} (${f.x}, ${f.z})`;
        expect(inBounds(f.x, f.z), at).toBe(true);
        expect(waterDist(f.x, f.z), at).toBeGreaterThanOrEqual(1.0);
        for (const d of decks) expect(rectDist(d, f.x, f.z), at).toBeGreaterThanOrEqual(3);
        expect(pathDist(f.x, f.z), at).toBeGreaterThanOrEqual(2.3);
        for (const [px, pz] of PINES_KEEP_CLEAR) expect(Math.hypot(f.x - px, f.z - pz), `${at} on (${px}, ${pz})`).toBeGreaterThanOrEqual(3);
        expect(Math.hypot(f.x - SPAWN.x, f.z - SPAWN.z), at).toBeGreaterThanOrEqual(4);
        expect(segDist(f.x, f.z, log), at).toBeGreaterThanOrEqual(2);
        for (const t of trunks) expect(Math.hypot(f.x - t.x, f.z - t.z), `${at} in a trunk`).toBeGreaterThanOrEqual(0.9 * t.scale);
      }
    }
    for (const r of reeds) {
      const at = `reed (${r.x}, ${r.z})`;
      expect(inBounds(r.x, r.z), at).toBe(true);
      expect(inWater(undecked, r.x, r.z), `${at} in the water`).toBe(false);
      for (const d of decks) expect(rectDist(d, r.x, r.z), at).toBeGreaterThanOrEqual(1.5);
      expect(pathDist(r.x, r.z), at).toBeGreaterThanOrEqual(2.3);
      // the spawn and the bridge foot are in PINES_KEEP_CLEAR
      for (const [px, pz] of PINES_KEEP_CLEAR) expect(Math.hypot(r.x - px, r.z - pz), `${at} on (${px}, ${pz})`).toBeGreaterThanOrEqual(3);
    }
  });

  it('the ferns, toadstools, reeds and lily pads are merged meshes out of the shadow pass, with no colliders', () => {
    for (const n of ['ferns', 'toadstools', 'reeds', 'lilyPads']) {
      expect(scene.children.filter((o) => o.name === n), n).toHaveLength(1);
      const meshes = [];
      scene.getObjectByName(n).traverse((o) => { if (o.isMesh) meshes.push(o); });
      expect(meshes.length, n).toBeGreaterThanOrEqual(1);
      expect(meshes.length, n).toBeLessThanOrEqual(2);
      for (const m of meshes) {
        expect(m.userData.noCast, n).toBe(true);
        expect(m.castShadow, n).toBe(false);
      }
    }
    for (const p of [...ferns, ...toadstools, ...reeds, ...pads]) {
      expect(area.colliders.some((c) => c.x === p.x && c.z === p.z), `(${p.x}, ${p.z})`).toBe(false);
    }
  });
});
