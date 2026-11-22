import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { isWalkableAt, isWadeableAt } = await import('../src/player.js');
const { DISCS } = await import('../src/rivalclans.js');
const { floodFrom } = await import('./helpers/flood.js');
const { perchHops } = await import('./helpers/findreach.js');
const { SPAWN_CLEAR, PICKUP } = await import('../src/foundwear/rules.js');
const { FIND_LOOKS, SPOT_ID, FIND_SPOTS, spotsIn, findSpotsKey, FIND_KEY } = await import('../src/foundwear/spots/index.js');
const { yarnSpotsFor, propsFor } = await import('../src/propsets.js');
const { groundOf } = await import('../src/ground.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { CHICK_SPOT_SETS, goatRoute } = await import('../src/farmjobs.js');
const { FARM_HIDES } = await import('../src/world/farm.js');
const { FAIR_HIDES } = await import('../src/world/fair.js');
const { STALLS: MARKET_STALLS, MARKET_HIDES } = await import('../src/world/marketplan.js');

// Scripted job points per area: a find never sits where a job's animal or
// object is placed (PICKUP is 1 m, so a find that close doubles up with it).
const JOB_CLEAR = 3;
// The Fair's: its games' and finds' anchors (each a point { x, z }, or a list of them) and its hides.
const FAIR_JOB_ANCHORS = ['tinCanPlay', 'tinCanCounter', 'tinCans', 'duckPool', 'duckPoolSide', 'bellPad', 'bellPole', 'fortuneDoor', 'fortuneSeat', 'fortuneBall', 'musicBox', 'candyfloss', 'candyflossPan', 'juggler', 'jugglerWatch', 'balloonCart', 'wheelBoard', 'teacupsBoard', 'merryGoRoundBoard', 'helterDoor', 'helterSlideOff', 'coasterBoard'];
const JOB_POINTS = {
  farm: (area) => [...CHICK_SPOT_SETS.flat(), ...goatRoute(area.anchors), ...FARM_HIDES],
  fair: (area) => [...FAIR_JOB_ANCHORS.flatMap((k) => area.anchors[k]), ...FAIR_HIDES],
  // the Market's: every treat (the sneak's) and every hide, the apple crate and where the bucket lands
  market: (area) => [...MARKET_STALLS.filter((s) => s.treat).map((s) => s.treat), ...MARKET_HIDES, area.anchors.apples, propsFor('market').knockables[0].fallTo],
};

const YARN_CLEAR = 3;
const THING_CLEAR = 2;

// Every walk area's builder. The tests below run for each one that has spots
// (src/foundwear/spots/index.js), so a new area's spots file is all it needs.
const ALL_BUILDERS = {
  neighborhood: '../src/world/neighborhood.js', park: '../src/world/park.js', seaside: '../src/world/seaside.js',
  docks: '../src/world/docks.js', woods: '../src/world/woods.js', river: '../src/world/river.js',
  moor: '../src/world/moor.js', pines: '../src/world/pines.js', gorge: '../src/world/gorge.js',
  farm: '../src/world/farm.js', fair: '../src/world/fair.js', market: '../src/world/market.js',
};
const BUILDERS = Object.fromEntries(Object.entries(ALL_BUILDERS).filter(([id]) => spotsIn(id).length > 0));
it('every area with spots has a builder here', () => {
  for (const id of Object.keys(FIND_SPOTS)) expect(Object.hasOwn(ALL_BUILDERS, id), id).toBe(true);
  expect(Object.keys(BUILDERS).sort()).toEqual(Object.keys(FIND_SPOTS).filter((id) => spotsIn(id).length > 0).sort());
});
// How near the stone, the seat or the rim under a raised spot must be.
const REST_TOL = 0.05;
describe.each(Object.keys(BUILDERS))('%s find spots', (areaId) => {
  let area, flood, scene, ground;
  beforeAll(async () => {
    scene = new THREE.Scene();
    area = (await import(BUILDERS[areaId])).build(scene);
    scene.updateMatrixWorld(true);
    ground = groundOf(area);
    const stand = (x, z) => isWalkableAt(area, x, z) || isWadeableAt(area, x, z);
    flood = floodFrom(area, area.spawn, stand);
  });
  const spots = () => spotsIn(areaId);
  it('10 to 15 spots, ids fw-<area>-<n>, unique, each with a known look', () => {
    expect(spots().length).toBeGreaterThanOrEqual(10); expect(spots().length).toBeLessThanOrEqual(15);
    for (const s of spots()) { expect(s.id).toMatch(SPOT_ID); expect(s.id.startsWith(`fw-${areaId}-`)).toBe(true); expect(FIND_LOOKS).toContain(s.look); }
    expect(new Set(spots().map((s) => s.id)).size).toBe(spots().length);
  });
  it('none within 15 m of the spawn', () => {
    for (const s of spots()) expect(Math.hypot(s.x - area.spawn.x, s.z - area.spawn.z), s.id).toBeGreaterThanOrEqual(SPAWN_CLEAR);
  });
  it('inside the shared core of the map, 1.5 m in', () => {
    const b = area.core ?? area.bounds;
    for (const s of spots()) { expect(s.x).toBeGreaterThanOrEqual(b.minX + 1.5); expect(s.x).toBeLessThanOrEqual(b.maxX - 1.5); expect(s.z).toBeGreaterThanOrEqual(b.minZ + 1.5); expect(s.z).toBeLessThanOrEqual(b.maxZ - 1.5); }
  });
  it('every ground spot stands on open or wading ground and is reached on foot from the spawn', () => {
    for (const s of spots().filter((t) => t.y === 0)) {
      expect(isWalkableAt(area, s.x, s.z) || isWadeableAt(area, s.x, s.z), s.id).toBe(true);
      expect(flood.reachesWithin(s.x, s.z, PICKUP.r), s.id).toBe(true);
    }
  });
  it('every raised spot is at most 3 hops up a chain that starts on reached ground, with no skills', () => {
    for (const s of spots().filter((t) => t.y > 0)) {
      const hops = perchHops(area.perches, s, { groundOk: (x, z) => flood.reachesWithin(x, z, 1.5) });
      expect(hops, s.id).toBeGreaterThanOrEqual(1); expect(hops, s.id).toBeLessThanOrEqual(3);
    }
  });
  it('at least a third need no climbing', () => {
    expect(spots().filter((s) => s.y === 0).length).toBeGreaterThanOrEqual(Math.ceil(spots().length / 3));
  });
  // A raised find lies on the boulder, the bench or the rim, never in the air
  // beside it: straight down from 0.3 m above it the first thing of the area's
  // own (not grass, water, the sky or a sprite) is within REST_TOL of it.
  it('every raised spot rests on something', () => {
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    for (const s of spots().filter((t) => t.y > 0)) {
      const y = ground.y(s.x, s.z) + s.y;
      ray.set(new THREE.Vector3(s.x, y + 0.3, s.z), down);
      ray.far = 0.3 + 1;
      const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.isMesh && h.object.visible !== false
        && !/grass|water|sky/i.test(h.object.name ?? '') && !h.object.isSprite);
      expect(hit, `${s.id}: nothing under it`).toBeTruthy();
      expect(Math.abs(hit.point.y - y), `${s.id}: ${hit.point.y.toFixed(3)} under a find at ${y.toFixed(3)}`).toBeLessThan(REST_TOL);
    }
  });
  // Two things in one pick-up window would be taken at once: two chimes, two
  // cards, two nose targets. So no find within 2 m of a golden mouse or a
  // collectible at its own height (the pick-up window's rule, PICKUP.dy): a
  // find on a boulder is not taken with a mouse up the oak above it.
  it('never beside a golden mouse or a collectible: 2 m clear', () => {
    const mice = GOLD_MICE[areaId] ?? [];
    expect(mice.length).toBeGreaterThan(0);
    for (const s of spots()) {
      for (const m of mice) {
        if (Math.abs((m.y ?? 0) - s.y) >= PICKUP.dy) continue;
        expect(Math.hypot(s.x - m.x, s.z - m.z), `${s.id} by ${m.id}`).toBeGreaterThanOrEqual(THING_CLEAR);
      }
      for (const c of area.collectibles) {
        if (Math.abs((c.y ?? 0) - s.y) >= PICKUP.dy) continue;
        expect(Math.hypot(s.x - c.x, s.z - c.z), `${s.id} by ${c.id}`).toBeGreaterThanOrEqual(THING_CLEAR);
      }
    }
  });
  // A find is a nook of its own: 1.5 m (sideways, any height) from every point
  // of interest's centre, scenic and labelled perch (a lookout, "king of the
  // roof"), where she stops for something else.
  it('never at a point of interest: 1.5 m from every POI, scenic and labelled perch', () => {
    const marks = [...(area.pois ?? []), ...(area.scenics ?? []), ...(area.perches ?? []).filter((p) => p.label)];
    expect(marks.length).toBeGreaterThan(0);
    for (const s of spots()) {
      for (const m of marks) expect(Math.hypot(s.x - m.x, s.z - m.z), `${s.id} by ${m.label ?? m.id ?? `(${m.x}, ${m.z})`}`).toBeGreaterThanOrEqual(1.5);
    }
  });
  // The dog's yard is its chase area: a find there is a fetch with a dog on it.
  it("never in the dog's yard: its radius and 1.5 m more (as the yarn ball's rule)", () => {
    const yard = propsFor(areaId).dogYard;
    if (!yard) return;
    for (const s of spots()) expect(Math.hypot(s.x - yard.x, s.z - yard.z), s.id).toBeGreaterThanOrEqual(yard.r + 1.5);
  });
  it('never on a scripted job point: 3 m from every one the area exposes', () => {
    const pts = JOB_POINTS[areaId]?.(area) ?? [];
    if (Object.hasOwn(JOB_POINTS, areaId)) expect(pts.length, areaId).toBeGreaterThan(0);
    for (const s of spots()) for (const p of pts) expect(Math.hypot(s.x - p.x, s.z - p.z), `${s.id} by (${p.x}, ${p.z})`).toBeGreaterThanOrEqual(JOB_CLEAR);
  });
  // The rival patrol notices within 4.5 m of its disc and chases; a clan cat
  // gets a fight. So no find within the disc's radius and 1.5 m more.
  it("never in a rival patrol's disc: its radius and 1.5 m more", () => {
    const d = DISCS[areaId];
    if (!d) return;
    for (const s of spots()) expect(Math.hypot(s.x - d.cx, s.z - d.cz), s.id).toBeGreaterThanOrEqual(d.r + 1.5);
  });
  it('never beside the yarn ball: 3 m from both its spots', () => {
    const yarn = yarnSpotsFor(areaId);
    expect(yarn.length).toBe(2);
    for (const s of spots()) {
      for (const y of yarn) expect(Math.hypot(s.x - y.x, s.z - y.z), s.id).toBeGreaterThanOrEqual(YARN_CLEAR);
    }
  });
});
it('the Woods spots sit in the open: no trunk within 2 m, no fern or bramble within 1.2 m, none in the camp (the generic disc rule is above)', async () => {
  const { woodsTreeSpots, woodsUndergrowth } = await import('../src/world/woods.js');
  const trees = woodsTreeSpots(); const { ferns, brambles } = woodsUndergrowth(); const camp = DISCS.woods;
  for (const s of spotsIn('woods')) {
    for (const t of trees) expect(Math.hypot(s.x - t.x, s.z - t.z), s.id).toBeGreaterThanOrEqual(2);
    for (const f of [...ferns, ...brambles]) expect(Math.hypot(s.x - f.x, s.z - f.z), s.id).toBeGreaterThanOrEqual(1.2);
    expect(Math.hypot(s.x - camp.cx, s.z - camp.cz), s.id).toBeGreaterThan(camp.r);
  }
});
it('spotsIn reads own keys only', () => {
  expect(spotsIn('park')).toBe(FIND_SPOTS.park);
  expect(spotsIn('den')).toEqual([]);
  expect(spotsIn('toString')).toEqual([]);
  expect(spotsIn(undefined)).toEqual([]);
  expect(Object.isFrozen(FIND_SPOTS)).toBe(true);
});
it('the spot key is a uint32 that moves when any spot moves, and not when a look changes', () => {
  expect(Number.isInteger(FIND_KEY) && FIND_KEY >= 0 && FIND_KEY < 2 ** 32).toBe(true);
  const moved = { ...FIND_SPOTS, park: FIND_SPOTS.park.map((s, i) => (i ? s : { ...s, x: s.x + 0.5 })) };
  const relooked = { ...FIND_SPOTS, park: FIND_SPOTS.park.map((s, i) => (i ? s : { ...s, look: 'grass' })) };
  expect(findSpotsKey(moved)).not.toBe(FIND_KEY);
  expect(findSpotsKey(relooked)).toBe(FIND_KEY);
  expect(findSpotsKey(FIND_SPOTS, 2)).not.toBe(FIND_KEY);
});
it('perchHops: 0 on the ground, Infinity out of reach, and counts a two-step chain', () => {
  const chain = [{ x: 0, z: 0, y: 0.72 }, { x: 1.2, z: 0, y: 1.9 }];
  expect(perchHops(chain, { x: 5, z: 5, y: 0 })).toBe(0);
  expect(perchHops(chain, { x: 1.2, z: 0, y: 1.9 })).toBe(2);
  expect(perchHops(chain, { x: 30, z: 0, y: 4 })).toBe(Infinity);
});
it('perchHops: a perch a skill opens is no step', () => {
  const chain = [{ x: 0, z: 0, y: 0.72, requires: 'sure-claws' }, { x: 1.2, z: 0, y: 1.9 }];
  expect(perchHops(chain, { x: 1.2, z: 0, y: 1.9 })).toBe(Infinity);
  expect(perchHops(chain, { x: 1.2, z: 0, y: 1.9 }, { groundOk: () => false })).toBe(Infinity);
});
