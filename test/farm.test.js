import { describe, it, expect } from 'vitest';
import { CLAN_TOTAL, EVERYDAY_TOTAL } from './helpers/goldtotals.js';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { climbBudget, canReach, SURE_CLAWS_ID } from '../src/climbing.js';
import { createProgression, CATALOG, JOURNAL_TYPES } from '../src/progression.js';
import { areaInEdition } from '../src/edition.js';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage as fakeStorage } from './helpers/storage.js';

stubCanvasDocument();

const farm = await import('../src/world/farm.js');
const { build, SPAWN, POND, JETTY, FARM_HIDES, WHEAT_FIELD, VEG_BEDS, PASTURE, GOAT_PADDOCK, HEN_RUN, APPLE_TREES, wheatGrowsAt, farmBare } = farm;
const { build: buildPark } = await import('../src/world/park.js');
const { GOLD_MICE, GOLD_TOTAL, goldForEdition } = await import('../src/goldmice.js');
const { isWalkableAt, isWadeableAt, CAT_RADIUS } = await import('../src/player.js');
const { inWater, onAnyDeck, waterClearance, shallowExcess } = await import('../src/world/builder.js');
const { propsFor, frameColliders, allPropIds, isPropId, CARRY_KINDS, KNOCK_KINDS, REST_KINDS } = await import('../src/propsets.js');
const { createKnockables } = await import('../src/knockables.js');
const { REST_LOOKS } = await import('../src/rests.js');
const { rivalFor, DISCS } = await import('../src/rivalclans.js');
const { COLONY_AREAS, feedsHere } = await import('../src/colony.js');
const { LEGENDARY_BY_AREA } = await import('../src/legendary.js');
const { MARK_AREAS, emptyMarks } = await import('../src/marks.js');
const { CLOUD_AREAS, AREA_SKY } = await import('../src/render/clouds.js');
const { ambientKind } = await import('../src/render/ambient.js');
const { AREA_RULES } = await import('../src/render/pawprints.js');
const { GRASS_STYLES, grassStyle, tuftAt, pastureDensity } = await import('../src/render/grass.js');
const { DRESSED_AREAS } = await import('../src/render/waterdress.js');
const { fishSpots } = await import('../src/render/fishjump.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');
const { findFadeOccluders } = await import('../src/treefade.js');
const { findPath } = await import('../src/pathfind.js');
const { PLACE_PICTURE } = await import('../src/ui/dressingroom.js');
const { clearSpot } = await import('../src/world/spots.js');
const { createScent } = await import('../src/scent.js');
const { mulberry32 } = await import('../src/rng.js');

const scene = new THREE.Scene();
const area = build(scene);
const set = propsFor('farm');

const dist = (a, c) => Math.hypot(a.x - c.x, a.z - c.z);
// Can a grounded cat stand at (x, z)? Bounds, colliders and dry ground: the
// test the running game applies.
const standable = (x, z) => isWalkableAt(area, x, z);
function standableWithin(x, z, range) {
  for (let r = 0; r <= range; r += 0.05) {
    for (let t = 0; t < 64; t++) {
      const th = (t / 64) * Math.PI * 2;
      if (standable(x + Math.cos(th) * r, z + Math.sin(th) * r)) return true;
    }
  }
  return false;
}
function nearestStandable(x, z, range = 3) {
  for (let r = 0; r <= range; r += 0.05) {
    for (let t = 0; t < 64; t++) {
      const th = (t / 64) * Math.PI * 2;
      const p = { x: x + Math.cos(th) * r, z: z + Math.sin(th) * r };
      if (standable(p.x, p.z)) return p;
    }
  }
  return null;
}
const inBounds = (p) => p.x >= area.bounds.minX && p.x <= area.bounds.maxX && p.z >= area.bounds.minZ && p.z <= area.bounds.maxZ;

// Everything the cat can walk to on dry ground from the gate, on a 0.5 m grid.
const CELL = 0.5;
const reached = (() => {
  const key = (i, j) => i * 10000 + j;
  const at = (i, j) => ({ x: area.bounds.minX + i * CELL, z: area.bounds.minZ + j * CELL });
  const start = [Math.round((SPAWN.x - area.bounds.minX) / CELL), Math.round((SPAWN.z - area.bounds.minZ) / CELL)];
  const seen = new Set([key(...start)]);
  const queue = [start];
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      const p = at(ni, nj);
      if (seen.has(key(ni, nj)) || !standable(p.x, p.z)) continue;
      seen.add(key(ni, nj));
      queue.push([ni, nj]);
    }
  }
  return (x, z, range = 1) => {
    const ci = Math.round((x - area.bounds.minX) / CELL);
    const cj = Math.round((z - area.bounds.minZ) / CELL);
    const n = Math.ceil(range / CELL);
    for (let i = ci - n; i <= ci + n; i++) {
      for (let j = cj - n; j <= cj + n; j++) {
        const p = at(i, j);
        if (seen.has(key(i, j)) && Math.hypot(p.x - x, p.z - z) <= range) return true;
      }
    }
    return false;
  };
})();

describe('Appletree Farm: the area record', () => {
  it('returns every field the Park returns, with the same types', () => {
    const park = buildPark(new THREE.Scene());
    for (const key of Object.keys(park)) {
      expect(area, `missing field ${key}`).toHaveProperty(key);
      expect(typeof area[key], `${key} type`).toBe(typeof park[key]);
      if (Array.isArray(park[key])) expect(Array.isArray(area[key]), `${key} is an array`).toBe(true);
    }
  });

  it('is named for its catalog entry', () => {
    expect(area.name).toBe('Appletree Farm');
    expect(area.name).toBe(CATALOG.areas.farm.name);
  });

  it('has bounds about the size of the Docks and the Seaside, and well-formed colliders', () => {
    const w = area.bounds.maxX - area.bounds.minX;
    const d = area.bounds.maxZ - area.bounds.minZ;
    expect(w).toBeGreaterThanOrEqual(76);
    expect(w).toBeLessThanOrEqual(90);
    expect(d).toBeGreaterThanOrEqual(80);
    expect(d).toBeLessThanOrEqual(95);
    expect(area.colliders.length).toBeGreaterThan(0);
    for (const c of area.colliders) {
      expect(Number.isFinite(c.x) && Number.isFinite(c.z) && c.r > 0).toBe(true);
      expect(inBounds(c), `collider at ${c.x},${c.z}`).toBe(true);
    }
  });

  it('spawns the cat at the farm gate, on dry ground clear of every collider', () => {
    expect(area.spawn).toEqual({ x: SPAWN.x, z: SPAWN.z });
    expect(standable(area.spawn.x, area.spawn.z)).toBe(true);
    for (const c of area.colliders) expect(dist(area.spawn, c)).toBeGreaterThan(c.r + CAT_RADIUS + 1);
    expect(dist(area.spawn, area.anchors.gate)).toBeLessThan(6);
    // south of the yard, with the lane between them
    expect(area.spawn.z).toBeGreaterThan(area.anchors.yard.z + 25);
  });

  it('has at least eight POIs for the race and the quests, each one walked to from the gate', () => {
    expect(area.pois.length).toBeGreaterThanOrEqual(8);
    for (const p of area.pois) {
      expect(standable(p.x, p.z), `poi ${p.x},${p.z}`).toBe(true);
      expect(reached(p.x, p.z), `poi ${p.x},${p.z} from the gate`).toBe(true);
      expect(inWater(area.waters, p.x, p.z)).toBe(false);
    }
    // spread over the whole farm, not bunched in the yard
    const xs = area.pois.map((p) => p.x);
    const zs = area.pois.map((p) => p.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(45);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(45);
  });

  it('leaves every POI where it is: each already stands clear enough for a race ring', () => {
    for (const p of area.pois) {
      const c = clearSpot(p, area.colliders, area.bounds, area.waters);
      expect({ x: c.x, z: c.z }, `poi ${p.x},${p.z}`).toEqual({ x: p.x, z: p.z });
    }
  });

  it('buries every scent treat on ground the cat can stand on', () => {
    const none = { add() {}, remove() {} };
    for (let seed = 0; seed < 300; seed++) {
      for (const tr of createScent(none, area, mulberry32(seed)).treats) {
        expect(standable(tr.x, tr.z), `seed ${seed}: treat at ${tr.x.toFixed(2)},${tr.z.toFixed(2)}`).toBe(true);
      }
    }
  });

  it('ships five collectibles with unique ids, each reachable', () => {
    expect(area.collectibles).toHaveLength(5);
    expect(new Set(area.collectibles.map((c) => c.id)).size).toBe(5);
    for (const c of area.collectibles) {
      expect(typeof c.label).toBe('string');
      if (c.y) {
        const stand = area.perches.find((p) => !p.requires && dist(p, c) < 1.6 && Math.abs(p.y - c.y) < 0.9);
        expect(stand, `${c.id} has no perch to be picked up from`).toBeTruthy();
      } else {
        expect(reached(c.x, c.z, 1.5), c.id).toBe(true);
      }
    }
  });

  it('ships three scenics the cat can stand at', () => {
    expect(area.scenics).toHaveLength(3);
    for (const s of area.scenics) {
      expect(typeof s.label).toBe('string');
      expect(reached(s.x, s.z, 2.9), s.id).toBe(true);
    }
  });

  it('has tippables, boxes and puddles on ground the cat can get to', () => {
    expect(area.tippables.length).toBeGreaterThanOrEqual(4);
    for (const t of area.tippables) {
      expect(['pot', 'can', 'bin']).toContain(t.kind);
      expect(reached(t.x, t.z), `tippable ${t.x},${t.z}`).toBe(true);
    }
    for (const bx of area.boxes) expect(standable(bx.x, bx.z), `box ${bx.x},${bx.z}`).toBe(true);
    for (const p of area.puddles) expect(standable(p.x, p.z), `puddle ${p.x},${p.z}`).toBe(true);
  });

  it('spawns only creatures the journal knows, and none that the design keeps for step 2', () => {
    const types = new Set(area.critterSpawns.map((c) => c.type));
    for (const t of types) expect(JOURNAL_TYPES).toContain(t);
    for (const t of ['duck', 'mouse', 'bird', 'butterfly']) expect(types.has(t), t).toBe(true);
    // The bolting mountain goat is gone (step 2): it hid for the whole walk.
    // The Farm's goats are its own animals (src/farmanimals.js).
    expect(types.has('goat')).toBe(false);
    // no dog (the Farm's dog is a friend, built later), no villager (no farmer yet)
    expect(types.has('dog')).toBe(false);
    expect(types.has('villager')).toBe(false);
    for (const c of area.critterSpawns) expect(inBounds(c), `${c.type} at ${c.x},${c.z}`).toBe(true);
  });

  it('keeps every duck on the pond and off the jetty', () => {
    const ducks = area.critterSpawns.filter((c) => c.type === 'duck');
    expect(ducks.length).toBeGreaterThanOrEqual(2);
    for (const d of ducks) {
      // a duck paddles a 2 m circle round its spawn
      for (let t = 0; t < 32; t++) {
        const x = d.x + Math.cos((t / 32) * Math.PI * 2) * 2;
        const z = d.z + Math.sin((t / 32) * Math.PI * 2) * 2;
        expect(Math.hypot(x - POND.x, z - POND.z), `duck at ${d.x},${d.z}`).toBeLessThan(POND.r - 0.5);
        expect(onAnyDeck(area.waters, x, z)).toBe(false);
      }
    }
  });

  it('keeps the goats\' shelter inside the paddock', () => {
    expect(FARM_HIDES[0].x).toBeGreaterThan(GOAT_PADDOCK.minX);
    expect(FARM_HIDES[0].z).toBeGreaterThan(GOAT_PADDOCK.minZ);
  });

  it('gives both moments a runner that lives on the farm', () => {
    expect(area.moments).toHaveLength(2);
    const types = new Set(area.critterSpawns.map((c) => c.type));
    for (const m of area.moments) {
      expect(m.from).toBeTruthy();
      expect(types.has(m.type), m.id).toBe(true);
      expect(inBounds(m) && inBounds(m.from)).toBe(true);
    }
  });

  it('says nothing a nine-year-old could not read, and no series word', () => {
    const words = [area.name, ...area.collectibles.map((c) => c.label), ...area.scenics.map((s) => s.label),
      ...area.moments.map((m) => m.label), ...area.perches.filter((p) => p.label).map((p) => p.label)].join(' ').toLowerCase();
    for (const w of ['clan', 'warrior', 'twoleg', 'kittypet', 'territory', 'starclan', 'apprentice', 'thunderpath', 'prey', 'rogue']) {
      expect(words.includes(w), w).toBe(false);
    }
  });
});

describe('Appletree Farm: the layout the owner approved', () => {
  const a = area.anchors;
  const centre = (r) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });

  it('puts the barn north of the yard and the three sheds down its east side, top to bottom', () => {
    expect(a.barnDoor.z).toBeLessThan(a.yard.z - 5);
    expect(Math.abs(a.barnDoor.x - a.yard.x)).toBeLessThan(3);
    for (const p of [a.tractor, a.grainStoreDoor, a.milkingShedDoor]) expect(p.x).toBeGreaterThan(a.yard.x + 8);
    expect(a.tractor.z).toBeLessThan(a.grainStoreDoor.z);
    expect(a.grainStoreDoor.z).toBeLessThan(a.milkingShedDoor.z);
  });

  it('puts the coop, the farmhouse with its kennel, and the vegetable beds west of the yard', () => {
    for (const p of [a.coop, a.farmhouseDoor, a.kennel, centre(a.vegPatch)]) expect(p.x).toBeLessThan(a.yard.x - 8);
    expect(a.coop.z).toBeLessThan(a.farmhouseDoor.z);
    expect(a.farmhouseDoor.z).toBeLessThan(centre(a.vegPatch).z);
    expect(dist(a.kennel, a.farmhouseDoor)).toBeLessThan(8);
  });

  it('puts the goats north-west, the cows along the east edge, the wheat north, the pond south-west and the orchard south-east', () => {
    const goats = centre(a.goatPaddock);
    expect(goats.x).toBeLessThan(-20);
    expect(goats.z).toBeLessThan(-15);
    const cows = centre(a.pasture);
    expect(cows.x).toBeGreaterThan(25);
    expect(a.pasture.maxZ - a.pasture.minZ).toBeGreaterThan(2 * (a.pasture.maxX - a.pasture.minX)); // long
    const wheat = centre(a.wheatField);
    expect(wheat.z).toBeLessThan(a.barnDoor.z - 10);
    expect(a.pond.x).toBeLessThan(-15);
    expect(a.pond.z).toBeGreaterThan(20);
    const apples = centre(a.orchard);
    expect(apples.x).toBeGreaterThan(10);
    expect(apples.z).toBeGreaterThan(20);
  });

  it('keeps the fields apart: no two of them overlap, and no building stands in one', () => {
    const fields = { wheat: WHEAT_FIELD, pasture: PASTURE, paddock: GOAT_PADDOCK, run: HEN_RUN, orchard: farm.ORCHARD, beds0: VEG_BEDS[0], beds1: VEG_BEDS[1] };
    const names = Object.keys(fields);
    const apart = (p, q) => p.maxX <= q.minX || q.maxX <= p.minX || p.maxZ <= q.minZ || q.maxZ <= p.minZ;
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) expect(apart(fields[names[i]], fields[names[j]]), `${names[i]} / ${names[j]}`).toBe(true);
    }
    // the pond is clear of all of them
    for (const [name, r] of Object.entries(fields)) {
      const dx = Math.max(r.minX - POND.x, 0, POND.x - r.maxX);
      const dz = Math.max(r.minZ - POND.z, 0, POND.z - r.maxZ);
      expect(Math.hypot(dx, dz), name).toBeGreaterThan(POND.r + 1);
    }
  });

  it('builds each thing the design lists, by name', () => {
    for (const name of ['barn', 'barnLoft', 'tractorShed', 'grainStore', 'milkingShed', 'henCoop', 'kennel', 'tractor', 'hayBales',
      'farmFences', 'farmGate', 'scarecrow', 'farmStructures', 'farmCrops', 'wheat', 'farmhouse', 'reeds', 'lilyPads']) {
      expect(scene.getObjectByName(name), name).toBeTruthy();
    }
    expect(scene.children.filter((c) => c.userData.appleTree)).toHaveLength(APPLE_TREES.length);
    expect(APPLE_TREES).toHaveLength(15);
  });

  it('draws nothing that is not a finite number', () => {
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 7) {
        expect(Number.isFinite(p.getX(i)) && Number.isFinite(p.getY(i)) && Number.isFinite(p.getZ(i)), o.name).toBe(true);
      }
    });
  });

  it('stands every farm model on the ground, not in the air and not sunk', () => {
    scene.updateMatrixWorld(true);
    for (const name of ['barn', 'tractorShed', 'grainStore', 'milkingShed', 'henCoop', 'kennel', 'tractor', 'hayBales', 'farmFences', 'scarecrow', 'farmhouse', 'wheat']) {
      const box = new THREE.Box3().setFromObject(scene.getObjectByName(name));
      expect(box.min.y, name).toBeGreaterThan(-0.1);
      expect(box.min.y, name).toBeLessThan(0.05);
    }
    // the jetty's posts go down into the pond bed; nothing else of the structures does
    expect(new THREE.Box3().setFromObject(scene.getObjectByName('farmStructures')).min.y).toBeGreaterThan(-0.35);
  });

  it('keeps wheat off the track and out of the scarecrow’s clearing, and shorter than the cat', () => {
    const wheat = scene.getObjectByName('wheat');
    const p = wheat.geometry.attributes.position;
    let top = 0;
    for (let i = 0; i < p.count; i++) {
      top = Math.max(top, p.getY(i));
      expect(p.getX(i)).toBeGreaterThan(WHEAT_FIELD.minX - 0.5);
      expect(p.getX(i)).toBeLessThan(WHEAT_FIELD.maxX + 0.5);
      expect(p.getZ(i)).toBeGreaterThan(WHEAT_FIELD.minZ - 0.5);
      expect(p.getZ(i)).toBeLessThan(WHEAT_FIELD.maxZ + 0.5);
      expect(Math.hypot(p.getX(i) - a.scarecrow.x, p.getZ(i) - a.scarecrow.z)).toBeGreaterThan(2);
    }
    expect(top).toBeLessThan(0.55); // the cat's ears are at about 0.4: she shows above it
    expect(wheatGrowsAt(a.scarecrow.x, a.scarecrow.z)).toBe(false);
    expect(wheatGrowsAt(-10, -35)).toBe(true);
    expect(wheat.userData.noCast).toBe(true);
  });

  it('makes each building one the camera can see through when it is in the way', () => {
    const occluders = findFadeOccluders(scene).filter((o) => o.box);
    const names = occluders.map((o) => o.obj.name);
    for (const name of ['barn', 'tractorShed', 'grainStore', 'milkingShed', 'henCoop', 'farmhouse']) expect(names, name).toContain(name);
  });

  it('fades the barn for a cat in the hayloft but not for one on the bales, and keeps the loft solid', () => {
    const barn = findFadeOccluders(scene).find((o) => o.obj.name === 'barn');
    const inBox = (p) => p.x >= barn.box.minX && p.x <= barn.box.maxX && p.z >= barn.box.minZ && p.z <= barn.box.maxZ;
    const [bale1, bale2, hayDoor, hayloft] = area.anchors.baleRoute;
    // the box is the walls and their trim, not the eaves or the hoist beam
    // (which reach 0.5 m and 1.25 m out, over the bales)
    expect(barn.box.maxZ).toBeLessThan(bale1.z - 0.2);
    expect(inBox(bale1)).toBe(false);
    expect(inBox(bale2)).toBe(false);
    expect(inBox(hayDoor)).toBe(true);
    expect(inBox(hayloft)).toBe(true);
    // the roof is its own mesh and is never merged back into the walls
    const group = scene.getObjectByName('barn');
    expect(group.children.map((c) => c.name)).toEqual(['barnBody', 'barnRoof', 'barnWindows']);
    expect(group.getObjectByName('barnRoof').userData.noMerge).toBe(true);
    // the loft's floor and hay are outside the group, so they do not fade with it
    const loft = scene.getObjectByName('barnLoft');
    expect(loft.parent).toBe(scene);
    expect(loft.isMesh).toBe(true);
  });

  it('fades the farm gate for a camera passing under its sign', () => {
    const gate = findFadeOccluders(scene).find((o) => o.obj.name === 'farmGate');
    expect(gate).toBeTruthy();
    expect(gate.near).toBeGreaterThan(0);
    expect(gate.top).toBeGreaterThan(3);
  });
});

describe('Appletree Farm: anchors for the animals and the jobs', () => {
  const a = area.anchors;
  const NAMES = ['gate', 'yard', 'barnDoor', 'baleRoute', 'hayloft', 'hayloftNest', 'rafters', 'tractor', 'tractorNest',
    'grainStoreDoor', 'grainStoreHole', 'grainStoreHoleFront', 'milkingShedDoor', 'milkingShedBackDoor', 'coop', 'coopDoor',
    'henRun', 'farmhouseDoor', 'kennel', 'kennelFront', 'vegPatch', 'goatPaddock', 'goatGate', 'goatStand', 'goatRock',
    'goatShelter', 'pasture', 'pastureGate', 'shadeTree', 'trough', 'wheatField', 'scarecrow', 'scarecrowFront',
    'scarecrowHat', 'pond', 'jetty', 'jettyEnd', 'orchard', 'appleTrees'];
  const isRect = (v) => Number.isFinite(v?.minX);
  const pointsOf = (v) => (Array.isArray(v) ? v : isRect(v)
    ? [{ x: v.minX, z: v.minZ }, { x: v.maxX, z: v.maxZ }, { x: (v.minX + v.maxX) / 2, z: (v.minZ + v.maxZ) / 2 }] : [v]);

  it('names every spot steps 2 and 3 need', () => {
    expect(Object.keys(a).sort()).toEqual([...NAMES].sort());
  });

  it('keeps every anchor inside the bounds', () => {
    for (const name of NAMES) {
      for (const p of pointsOf(a[name])) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.z), name).toBe(true);
        expect(inBounds(p), `${name} at ${p.x},${p.z}`).toBe(true);
      }
    }
  });

  // A spot on the ground is reachable if the cat can walk from the gate to
  // within `reach` of it. Things the cat stands AT are walked right up to;
  // things that are solid (a kennel, a tree) are walked up beside.
  it('lets the cat walk from the gate to every ground anchor', () => {
    const AT = ['gate', 'barnDoor', 'tractorNest', 'grainStoreDoor', 'grainStoreHoleFront', 'milkingShedDoor', 'milkingShedBackDoor',
      'coopDoor', 'farmhouseDoor', 'kennelFront', 'goatGate', 'goatShelter', 'pastureGate', 'trough', 'scarecrowFront', 'jettyEnd'];
    for (const name of AT) {
      expect(standable(a[name].x, a[name].z), `${name} is not standable`).toBe(true);
      expect(reached(a[name].x, a[name].z, 0.6), `${name} from the gate`).toBe(true);
    }
    const BESIDE = { yard: 1, coop: 2.6, kennel: 1.6, tractor: 2.6, grainStoreHole: 1.2, shadeTree: 1.6, scarecrow: 1.2 };
    for (const [name, reach] of Object.entries(BESIDE)) expect(reached(a[name].x, a[name].z, reach), `${name} from the gate`).toBe(true);
    for (const t of a.appleTrees) expect(reached(t.x, t.z, 1.4), `apple tree ${t.x},${t.z}`).toBe(true);
  });

  it('lets the cat walk into every field: fences stop nobody', () => {
    for (const name of ['henRun', 'vegPatch', 'goatPaddock', 'pasture', 'wheatField', 'orchard']) {
      const r = a[name];
      let open = 0;
      let all = 0;
      for (let x = r.minX + 0.5; x < r.maxX; x += 1) {
        for (let z = r.minZ + 0.5; z < r.maxZ; z += 1) {
          all++;
          if (reached(x, z, 0.4)) open++;
        }
      }
      // nearly all of it is open ground (the rest is a tree, a trough, the coop)
      expect(open / all, name).toBeGreaterThan(name === 'henRun' ? 0.75 : 0.9);
    }
  });

  it('keeps the cow’s walk in from the pasture to the milking shed open', () => {
    const from = { x: (a.pasture.minX + a.pasture.maxX) / 2, z: (a.pasture.minZ + a.pasture.maxZ) / 2 };
    for (const to of [a.pastureGate, a.milkingShedBackDoor, a.milkingShedDoor]) {
      const way = findPath((x, z) => standable(x, z), area.bounds, from, to);
      expect(way, `pasture to ${to.x},${to.z}`).toBeTruthy();
    }
    // the gap between the grain store and the milking shed is a clear two metres and more
    for (let x = 12; x <= 26; x += 0.25) expect(standable(x, 8), `the track at x ${x}`).toBe(true);
  });

  it('puts the raised anchors where the models are', () => {
    scene.updateMatrixWorld(true);
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const rc = new THREE.Raycaster();
    const topAt = (x, z, fromY, far = fromY + 1) => {
      rc.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
      rc.far = far;
      return rc.intersectObjects(meshes, false)[0]?.point.y ?? null;
    };
    // the loft floor is under the hayloft and the nest, and nothing is on it there
    for (const p of [a.hayloft, a.hayloftNest]) expect(topAt(p.x, p.z, p.y + 0.6, 1.2), `loft at ${p.x},${p.z}`).toBeCloseTo(p.y, 1);
    // the owl's beam
    expect(topAt(a.rafters.x, a.rafters.z, a.rafters.y + 0.3, 0.6)).toBeCloseTo(a.rafters.y, 1);
    // the scarecrow's hat, the goats' stand
    expect(topAt(a.scarecrowHat.x, a.scarecrowHat.z, a.scarecrowHat.y + 0.5, 1)).toBeCloseTo(a.scarecrowHat.y, 1);
    expect(topAt(a.goatStand.x, a.goatStand.z, a.goatStand.y + 0.5, 1)).toBeCloseTo(a.goatStand.y, 1);
    // behind the tractor: floor, under the shed roof
    expect(topAt(a.tractorNest.x, a.tractorNest.z, 1.5, 2)).toBeLessThan(0.05);
  });
});

describe('Appletree Farm: perches', () => {
  const base = climbBudget({});
  const spring = climbBudget({ skills: ['spring-paws'] });
  const free = area.perches.filter((p) => !p.requires);
  const gated = area.perches.filter((p) => p.requires);

  // BFS over the real perch array with the game's own rule (canReach), from
  // the ground: hop counts by perch.
  function hops(budget, perches) {
    const out = new Map();
    let frontier = [];
    for (const p of perches) {
      // off the ground: the cat walks to wherever suits (the standing spot is checked separately)
      if (canReach(p, { x: p.x, z: p.z }, 0, budget)) { out.set(p, 1); frontier.push(p); }
    }
    while (frontier.length) {
      const next = [];
      for (const from of frontier) {
        for (const p of perches) {
          if (out.has(p) || !canReach(p, from, from.y, budget)) continue;
          out.set(p, out.get(from) + 1);
          next.push(p);
        }
      }
      frontier = next;
    }
    return out;
  }
  const at = (x, z, y) => free.find((p) => Math.abs(p.x - x) < 0.01 && Math.abs(p.z - z) < 0.01 && Math.abs(p.y - y) < 0.01);

  it('gives every perch a kind the climbing rules know, inside the bounds and out of the pond', () => {
    for (const p of area.perches) {
      expect(['tree', 'fence', 'roof', 'crate', 'car', 'stone', 'furniture']).toContain(p.kind);
      expect(inBounds(p)).toBe(true);
      expect(inWater(area.waters, p.x, p.z)).toBe(false);
      expect(p.y).toBeGreaterThan(0);
    }
  });

  it('can start every chain from a spot the cat can stand on', () => {
    for (const p of free.filter((q) => q.y <= base.climb)) {
      const reach = p.y > 1 ? base.reachHigh : base.reachLow;
      expect(standableWithin(p.x, p.z, reach - 0.05), `perch y${p.y} at ${p.x},${p.z}`).toBe(true);
    }
  });

  it('climbs to the hayloft over the hay bales in four hops, and no way round them', () => {
    const route = area.anchors.baleRoute.map((p) => at(p.x, p.z, p.y));
    expect(route.every(Boolean)).toBe(true);
    const h = hops(base, free);
    expect(route.map((p) => h.get(p))).toEqual([1, 2, 3, 4]);
    // each step is inside one hop's climb and reach
    for (let i = 1; i < route.length; i++) {
      expect(route[i].y - route[i - 1].y).toBeLessThanOrEqual(base.climb);
      expect(dist(route[i], route[i - 1])).toBeLessThanOrEqual(base.reachHigh);
    }
    // the hay door is out of a single hop under every budget
    expect(route[2].y).toBeGreaterThan(spring.climb);
    // Spring Paws saves one bale, never the climb
    expect(hops(spring, free).get(route[3])).toBe(3);
    // without the bales there is no way up at all
    const noBales = free.filter((p) => !route.slice(0, 2).includes(p));
    expect(hops(spring, noBales).has(route[3])).toBe(false);
    expect(route[3].label).toBe('the hayloft');
    expect(route[3].vantage).toBe(true);
  });

  it('climbs the tractor in two hops and the goats’ stand off its rock', () => {
    const h = hops(base, free);
    const roof = free.find((p) => p.label === 'tractor roof');
    expect(h.get(roof)).toBe(2);
    expect(hops(spring, free).get(roof)).toBe(2);
    const stand = free.find((p) => p.label === 'the goats’ jumping stand');
    expect(h.get(stand)).toBeLessThanOrEqual(2);
    const rock = at(area.anchors.goatRock.x, area.anchors.goatRock.z, area.anchors.goatRock.y);
    expect(canReach(stand, rock, rock.y, base)).toBe(true);
  });

  it('reaches every ungated perch on the baseline budget', () => {
    const h = hops(base, free);
    for (const p of free) expect(h.has(p), `perch y${p.y} at ${p.x},${p.z}`).toBe(true);
  });

  it('has four vantage perches, each with a name', () => {
    const v = area.perches.filter((p) => p.vantage);
    expect(v).toHaveLength(4);
    for (const p of v) expect(typeof p.label).toBe('string');
  });

  it('opens the apple trees, the other trees and three fence tops to Sure Claws', () => {
    expect(gated.every((p) => p.requires === SURE_CLAWS_ID)).toBe(true);
    const trees = gated.filter((p) => p.kind === 'tree');
    expect(trees).toHaveLength(APPLE_TREES.length + 6);
    for (const t of APPLE_TREES) expect(trees.some((p) => p.x === t.x && p.z === t.z), `apple tree ${t.x},${t.z}`).toBe(true);
    expect(gated.filter((p) => p.kind === 'fence')).toHaveLength(3);
    const claws = climbBudget({ skills: [SURE_CLAWS_ID] });
    for (const p of gated) {
      const reach = p.y > 1 ? claws.reachHigh : claws.reachLow;
      expect(standableWithin(p.x, p.z, reach - 0.05), `gated perch at ${p.x},${p.z}`).toBe(true);
      expect(p.y).toBeLessThanOrEqual(2.0);
    }
  });

  it('stands every perch on something: the models’ real tops', () => {
    scene.updateMatrixWorld(true);
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const rc = new THREE.Raycaster();
    for (const p of free) {
      rc.set(new THREE.Vector3(p.x, p.y + 0.4, p.z), new THREE.Vector3(0, -1, 0));
      rc.far = 0.9;
      const hit = rc.intersectObjects(meshes, false)[0];
      expect(hit, `nothing under the perch y${p.y} at ${p.x},${p.z}`).toBeTruthy();
      expect(Math.abs(hit.point.y - p.y), `perch y${p.y} at ${p.x},${p.z} top ${hit.point.y}`).toBeLessThan(0.12);
    }
  });
});

describe('Appletree Farm: the duck pond', () => {
  it('declares one pond with a wadeable rim and a jetty, and draws it from that record', () => {
    expect(area.waters).toEqual([POND]);
    expect(POND.shallow).toBeGreaterThan(0);
    expect(POND.decks).toEqual([JETTY]);
    expect(area.waterFx).toHaveLength(1);
    expect(scene.children).toContain(area.waterFx[0].mesh);
    expect(area.waterFx[0].mesh.position.x).toBeCloseTo(POND.x, 6);
    expect(area.waterFx[0].mesh.position.z).toBeCloseTo(POND.z, 6);
  });

  it('lets every cat wade the rim, and holds the middle for swimmers', () => {
    // just inside the shore, all the way round (but not under the jetty)
    for (let t = 0; t < 48; t++) {
      const th = (t / 48) * Math.PI * 2;
      const x = POND.x + Math.cos(th) * (POND.r - 0.8);
      const z = POND.z + Math.sin(th) * (POND.r - 0.8);
      if (onAnyDeck(area.waters, x, z)) continue;
      expect(inWater(area.waters, x, z)).toBe(true);
      expect(isWadeableAt(area, x, z), `wading at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
    }
    // the middle is deep
    expect(shallowExcess(area.waters, POND.x - 1, POND.z + 2)).toBeGreaterThan(0);
    expect(isWadeableAt(area, POND.x - 1, POND.z + 2)).toBe(false);
    // and a pond this size has room to swim: four metres of deep water across
    expect(POND.r - POND.shallow).toBeGreaterThanOrEqual(4);
    expect(POND.shallow).toBeLessThanOrEqual(1.6); // the game's widest wading band
  });

  it('runs the jetty from dry ground out over the water, and the cat can walk its length', () => {
    const z = (JETTY.minZ + JETTY.maxZ) / 2;
    expect(inWater([{ ...POND, decks: [] }], JETTY.maxX, z)).toBe(false); // its landward end is on the bank
    expect(inWater([{ ...POND, decks: [] }], JETTY.minX, z)).toBe(true);  // its far end is over water
    for (let x = JETTY.maxX + 1; x >= JETTY.minX + 0.4; x -= 0.25) expect(standable(x, z), `the jetty at x ${x}`).toBe(true);
    expect(reached(area.anchors.jettyEnd.x, area.anchors.jettyEnd.z, 0.5)).toBe(true);
    // it ends in the deep, so a swimmer can jump in from its end
    expect(shallowExcess(area.waters, JETTY.minX - 0.5, z)).toBeGreaterThan(0);
  });

  it('puts nothing the player has to reach in the water', () => {
    const lists = {
      collectibles: area.collectibles, 'golden mice': GOLD_MICE.farm, scenics: area.scenics, pois: area.pois,
      tippables: area.tippables, perches: area.perches, boxes: area.boxes, puddles: area.puddles,
      carryables: set.carryables, rests: set.rests, markables: set.markables, hides: set.hides,
    };
    for (const [name, list] of Object.entries(lists)) {
      for (const p of list) expect(waterClearance(area.waters, p.x, p.z), `${name} at ${p.x},${p.z}`).toBeGreaterThan(0.5);
    }
    expect(inWater(area.waters, area.spawn.x, area.spawn.z)).toBe(false);
  });

  it('keeps every trail out of the water', () => {
    scene.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    for (const m of scene.children.filter((c) => c.name === 'path')) {
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        expect(inWater(area.waters, v.x, v.z), `a path corner at ${v.x.toFixed(1)},${v.z.toFixed(1)}`).toBe(false);
      }
    }
  });

  it('dresses the bank, and lets the pond’s fish jump', () => {
    expect(DRESSED_AREAS).toContain('farm');
    expect(fishSpots('farm', area).length).toBeGreaterThan(0);
  });
});

describe('Appletree Farm: golden mice', () => {
  it('adds three, for thirty-three in all and fifteen in the Legacy edition', () => {
    expect(GOLD_MICE.farm).toHaveLength(3);
    expect(GOLD_TOTAL).toBe(CLAN_TOTAL); // 42 until the Old House added its three, 39 until the Market added its three, 36 until the Rooftops added its three, 33 until the Fairground added its
    expect(goldForEdition('canon', CATALOG).size).toBe(CLAN_TOTAL); // 42 until the Old House added its three, 39 until the Market added its three
    expect(goldForEdition('legacy', CATALOG).size).toBe(EVERYDAY_TOTAL); // 24 while the Market had no catalog row (an area not in the catalog is counted); its Clan-only row (Market step 4) keeps its three out of Legacy; 18 until the Rooftops added its three
    expect(new Set(GOLD_MICE.farm.map((m) => m.id))).toEqual(new Set(['gm-farm-1', 'gm-farm-2', 'gm-farm-3']));
  });

  it('sits two on real perches every cat can climb to, and hides one on the ground', () => {
    const up = GOLD_MICE.farm.filter((m) => m.y > 0);
    const ground = GOLD_MICE.farm.filter((m) => m.y === 0);
    expect(up).toHaveLength(2);
    expect(ground).toHaveLength(1);
    for (const m of up) {
      const perch = area.perches.find((p) => !p.requires && p.x === m.x && p.z === m.z && p.y === m.y);
      expect(perch, `${m.id} is not on a perch`).toBeTruthy();
    }
    // findable by walking: checkFind's window is 1.0 across
    expect(reached(ground[0].x, ground[0].z, 0.95), ground[0].id).toBe(true);
    for (const m of GOLD_MICE.farm) expect(inWater(area.waters, m.x, m.z)).toBe(false);
  });
});

describe('Appletree Farm: the prop set', () => {
  const MARGIN = 0.3;
  const clearOf = (p, extra = MARGIN) => area.colliders.every((c) => dist(p, c) >= c.r + CAT_RADIUS + extra);
  const ok = (p) => standable(p.x, p.z) && clearOf(p);
  const LISTS = ['carryables', 'knockables', 'markables', 'flaps', 'rests'];
  const anchors = [area.spawn, ...GOLD_MICE.farm, ...area.collectibles, ...area.scenics, ...area.pois];
  function approachOf(m) {
    const holding = area.colliders.filter((c) => dist(m, c) < c.r + CAT_RADIUS + MARGIN);
    if (holding.length === 0) return { x: m.x, z: m.z };
    if (holding.length > 1) return null;
    const [c] = holding;
    const d = dist(m, c);
    const out = c.r + CAT_RADIUS + MARGIN + 0.01;
    return { x: c.x + ((m.x - c.x) / d) * out, z: c.z + ((m.z - c.z) / d) * out };
  }
  const points = [...set.carryables, ...set.knockables, ...set.markables, ...set.rests, ...set.hides,
    ...set.flaps, ...set.flaps.flatMap((f) => frameColliders(f))];

  it('has the street areas’ counts, with farm things to carry', () => {
    expect(set.carryables).toHaveLength(4);
    expect(set.knockables).toHaveLength(3);
    expect(set.markables).toHaveLength(3);
    expect(set.flaps.map((f) => f.kind).sort()).toEqual(['flap', 'gap']);
    expect(set.rests.map((r) => r.kind).sort()).toEqual([...REST_KINDS].sort());
    expect(set.rests.every((r) => r.mesh === true)).toBe(true);
    expect(set.hides).toHaveLength(3);
    expect(set.hides).toEqual(FARM_HIDES.map((h) => ({ x: h.x, z: h.z })));
    expect(set.keepSlots).toEqual([]);
    for (const c of set.carryables) expect(CARRY_KINDS).toContain(c.kind);
    for (const k of set.knockables) expect(KNOCK_KINDS).toContain(k.kind);
    for (const m of set.markables) expect(['post', 'tree', 'bollard']).toContain(m.kind);
    for (const r of set.rests) expect(REST_LOOKS[r.id], r.id).toBeTruthy();
  });

  it('has no dog yard and no rival border: nothing at the Farm chases the cat', () => {
    expect(set.dogYard).toBeNull();
    expect(set.markables.every((m) => m.nearBorder === false)).toBe(true);
    expect(Object.hasOwn(DISCS, 'farm')).toBe(false);
    expect(rivalFor('farm')).toBeNull();
    expect(area.critterSpawns.some((c) => c.type === 'dog')).toBe(false);
  });

  it('gives every prop a well-formed id of its own', () => {
    const all = allPropIds();
    for (const list of LISTS) {
      const byKind = {};
      for (const p of set[list]) {
        expect(isPropId(p.id), p.id).toBe(true);
        expect(p.id.startsWith('farm-'), p.id).toBe(true);
        const [, kind, n] = p.id.split('-');
        expect(kind, p.id).toBe(p.kind);
        (byKind[kind] ??= []).push(Number(n));
        expect(all.has(p.id)).toBe(true);
      }
      for (const ns of Object.values(byKind)) expect([...ns].sort((x, y) => x - y)).toEqual(ns.map((_, i) => i + 1));
    }
  });

  it('stands every walk-up prop on open ground, apart from the others', () => {
    const walkUps = [
      ...set.carryables.map((p) => ({ what: p.id, p })),
      ...set.rests.map((p) => ({ what: p.id, p })),
      ...set.hides.map((p, i) => ({ what: `hide ${i}`, p })),
      ...set.markables.map((m) => ({ what: m.id, p: approachOf(m), m })),
    ];
    for (const { what, p, m } of walkUps) {
      expect(p, `${what} has no side to stand on`).not.toBeNull();
      expect(ok(p), `${what} at ${p.x},${p.z}`).toBe(true);
      expect(reached(p.x, p.z, 0.6), `${what} from the gate`).toBe(true);
      if (m) expect(dist(p, m), `${what} approach`).toBeLessThanOrEqual(1.2);
    }
    const prompts = walkUps.filter((w) => !w.what.startsWith('hide'));
    for (let i = 0; i < prompts.length; i++) {
      for (let j = i + 1; j < prompts.length; j++) {
        expect(dist(prompts[i].p, prompts[j].p), `${prompts[i].what} vs ${prompts[j].what}`).toBeGreaterThanOrEqual(2.5);
      }
    }
  });

  it('crowds no spawn, golden mouse, collectible, scenic or POI', () => {
    for (const p of points) {
      for (const q of anchors) {
        expect(dist(p, q), `${p.id ?? 'prop'} at ${p.x},${p.z} vs ${q.id ?? 'anchor'} at ${q.x},${q.z}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('has something real to scratch at every markable that brings no post of its own', () => {
    scene.updateMatrixWorld(true);
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh && o.geometry?.type !== 'PlaneGeometry') meshes.push(o); });
    const rc = new THREE.Raycaster();
    for (const m of set.markables.filter((k) => !k.mesh)) {
      // a post or trunk stands within 0.4 m: look straight down from above it
      let found = false;
      for (const [dx, dz] of [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) {
        rc.set(new THREE.Vector3(m.x + dx, 6, m.z + dz), new THREE.Vector3(0, -1, 0));
        rc.far = 5.6;
        if (rc.intersectObjects(meshes, false).length) found = true;
      }
      expect(found, m.id).toBe(true);
    }
  });

  it('puts each knockable on the farmhouse bench and lands it on the grass', () => {
    for (const k of set.knockables) {
      const perch = area.perches.find((p) => !p.requires && dist(p, k) >= 0.35 && dist(p, k) <= 0.6 && Math.abs(p.y - k.y) < 0.1);
      expect(perch, `${k.id} has no perch under it`).toBeDefined();
      expect(isWalkableAt(area, k.fallTo.x, k.fallTo.z), k.id).toBe(true);
      const drop = dist(k, k.fallTo);
      expect(drop).toBeGreaterThanOrEqual(0.6);
      expect(drop).toBeLessThanOrEqual(1.6);
    }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(dist(set.knockables[i].fallTo, set.knockables[j].fallTo)).toBeGreaterThanOrEqual(0.5);
    // the real meshes, raycast like test/propsets.test.js does
    scene.updateMatrixWorld(true);
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const rc = new THREE.Raycaster();
    const topAt = (x, z, fromY) => {
      rc.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
      rc.far = fromY + 1;
      return rc.intersectObjects(meshes, false)[0]?.point.y ?? null;
    };
    const footprint = (group) => {
      group.updateMatrixWorld(true);
      const toLocal = group.matrixWorld.clone().invert();
      const bb = new THREE.Box3();
      group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.computeBoundingBox();
        bb.union(o.geometry.boundingBox.clone().applyMatrix4(toLocal.clone().multiply(o.matrixWorld)));
      });
      const pts = [];
      for (const fx of [0.1, 0.5, 0.9]) for (const fz of [0.1, 0.5, 0.9]) {
        const p = new THREE.Vector3(bb.min.x + (bb.max.x - bb.min.x) * fx, (bb.min.y + bb.max.y) / 2, bb.min.z + (bb.max.z - bb.min.z) * fz)
          .applyMatrix4(group.matrixWorld);
        pts.push([p.x, p.z]);
      }
      return pts;
    };
    const ks = createKnockables(new THREE.Scene(), set.knockables);
    for (const e of ks.list) {
      const k = set.knockables.find((s) => s.id === e.id);
      for (const [x, z] of footprint(e.group)) expect(topAt(x, z, k.y + 0.5), `${k.id} standing`).toBeCloseTo(k.y, 2);
      ks.knock(e);
      ks.update(5);
      for (const [x, z] of footprint(e.group)) expect(topAt(x, z, 3), `${k.id} landed`).toBeCloseTo(k.fallTo.y ?? 0, 2);
    }
    ks.dispose();
  });

  it('leaves each flap’s opening clear and its frame clear of everything built', () => {
    const others = [...set.carryables, ...set.rests, ...set.markables, ...set.knockables.map((k) => k.fallTo), ...set.hides];
    for (const f of set.flaps) {
      const frame = frameColliders(f);
      expect(frame.length).toBeGreaterThan(0);
      const withFrame = { ...area, colliders: [...area.colliders, ...frame] };
      const nx = Math.sin(f.rotY);
      const nz = Math.cos(f.rotY);
      for (const side of [-1, 0, 1]) expect(isWalkableAt(withFrame, f.x + nx * side, f.z + nz * side), `${f.id} side ${side}`).toBe(true);
      for (const c of frame) {
        for (const o of area.colliders) expect(dist(c, o), `${f.id} frame at ${o.x},${o.z}`).toBeGreaterThanOrEqual(c.r + o.r);
      }
      const ax = Math.cos(f.rotY);
      const az = -Math.sin(f.rotY);
      const reach = f.width / 2 + 1.5;
      for (const p of others) {
        const dx = p.x - f.x;
        const dz = p.z - f.z;
        const along = Math.max(-reach, Math.min(reach, dx * ax + dz * az));
        expect(Math.hypot(dx - along * ax, dz - along * az) - 0.3, `${f.id}`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('Appletree Farm: catalog, unlocking and old saves', () => {
  it('costs 75 coins after two Park walks, and is in both editions', () => {
    expect(CATALOG.areas.farm).toEqual({ name: 'Appletree Farm', price: 75, requires: { area: 'park', walks: 2 } });
    expect(areaInEdition(CATALOG.areas.farm, 'canon')).toBe(true);
    expect(areaInEdition(CATALOG.areas.farm, 'legacy')).toBe(true);
  });

  it('the Docks open beside it after the Park, and the Seaside after the Docks', () => {
    expect(CATALOG.areas.docks).toEqual({ name: 'The Old Docks', price: 100, requires: { area: 'park', walks: 2 } });
    expect(CATALOG.areas.seaside).toEqual({ name: 'Seaside', price: 200, requires: { area: 'docks', walks: 2 } });
  });

  it('cannot be bought on coins alone, or on walks alone', () => {
    const p = createProgression(fakeStorage());
    p.addPoints(9999);
    expect(p.canBuy('areas', 'farm')).toBe(false);
    p.completeWalk('park');
    expect(p.canBuy('areas', 'farm')).toBe(false);
    p.completeWalk('park');
    expect(p.canBuy('areas', 'farm')).toBe(true);

    const q = createProgression(fakeStorage());
    q.completeWalk('park');
    q.completeWalk('park');
    q.addPoints(74 - q.state.points);
    expect(q.canBuy('areas', 'farm')).toBe(false);
    q.addPoints(1);
    expect(q.buy('areas', 'farm')).toBe(true);
    expect(q.isUnlocked('areas', 'farm')).toBe(true);
  });

  it('can be chosen as the place to walk, in both editions, and that is saved', () => {
    for (const edition of ['canon', 'legacy']) {
      const storage = fakeStorage();
      const p = createProgression(storage);
      p.setEdition(edition);
      p.addPoints(500);
      p.completeWalk('park');
      p.completeWalk('park');
      expect(p.buy('areas', 'farm'), edition).toBe(true);
      p.setArea('farm');
      expect(p.state.area).toBe('farm');
      expect(createProgression(storage).state.area).toBe('farm');
    }
  });

  it('counts farm walks as real numbers from the first one', () => {
    const p = createProgression(fakeStorage());
    expect(p.state.walks.farm).toBe(0);
    p.completeWalk('farm');
    p.completeWalk('farm');
    expect(p.state.walks.farm).toBe(2);
  });

  it('loads a save from before the Farm with farm: 0, nothing lost and no gate closed', () => {
    const storage = fakeStorage({
      'whisker-walk-save': JSON.stringify({
        version: 4, points: 120,
        walks: { neighborhood: 5, park: 3, seaside: 2, den: 1, docks: 1 },
        unlocked: { cats: ['tabby'], accessories: ['bell'], areas: ['neighborhood', 'park', 'seaside', 'docks'] },
        area: 'docks',
      }),
    });
    const p = createProgression(storage);
    expect(p.state.walks.farm).toBe(0);
    expect(p.state.walks).toMatchObject({ neighborhood: 5, park: 3, seaside: 2, den: 1, docks: 1 });
    for (const id of ['neighborhood', 'park', 'seaside', 'docks']) expect(p.isUnlocked('areas', id), id).toBe(true);
    expect(p.state.area).toBe('docks');
    // already past the Park: the Farm is ready to buy
    expect(p.isUnlocked('areas', 'farm')).toBe(false);
    expect(p.canBuy('areas', 'farm')).toBe(true);
    p.completeWalk('farm');
    expect(p.state.walks.farm).toBe(1);
    expect(Number.isNaN(p.state.walks.farm)).toBe(false);
  });

  it('gives an old save an empty list of farm marks', () => {
    expect(MARK_AREAS).toContain('farm');
    expect(emptyMarks().farm).toEqual([]);
    const p = createProgression(fakeStorage({
      'whisker-walk-save': JSON.stringify({ version: 4, marks: { park: [] } }),
    }));
    expect(p.state.marks.farm).toEqual([]);
  });
});

describe('Appletree Farm: registered everywhere a street area is', () => {
  it('has clouds, drifting seed down, paw prints on its earth paths and pasture grass', () => {
    expect(CLOUD_AREAS).toContain('farm');
    expect(AREA_SKY.farm).toEqual({ clouds: 10, banks: 5 });
    expect(ambientKind('farm')).toBe('fluff');
    expect(ambientKind('farm', { dusk: true })).toBe('fluff');
    expect(AREA_RULES.farm).toEqual({ ground: null, path: 'gravel', strip: null });
    expect(GRASS_STYLES.farm.density).toBe(pastureDensity);
    expect(farm.GRASS_HOOKS.tint).toBe(farm.farmGroundTint);
    expect(farm.GRASS_HOOKS.bare).toBe(farm.farmBare);
    expect(GRASS_STYLES.farm.bare).toBeNull();
  });

  it('grows no grass tufts in the wheat or the vegetable beds, and plenty in the pasture', () => {
    expect(farmBare(0, -30)).toBe(true);
    expect(farmBare(-20, 17)).toBe(true);
    expect(farmBare(34, 0)).toBe(false);
    let wheat = 0;
    let pasture = 0;
    const s = 0.3;
    for (let i = -150; i < 150; i++) {
      for (let j = -150; j < 150; j++) {
        const t = tuftAt(i, j, s, grassStyle('farm', farm.GRASS_HOOKS));
        const plain = tuftAt(i, j, s, GRASS_STYLES.farm);
        if (!t) { if (plain) expect(farmBare(plain.x, plain.z)).toBe(true); continue; }
        expect(t).toEqual(plain);
        expect(t.h).toBeLessThanOrEqual(0.38 + 1e-9);
        if (t.x > WHEAT_FIELD.minX && t.x < WHEAT_FIELD.maxX && t.z > WHEAT_FIELD.minZ && t.z < WHEAT_FIELD.maxZ) wheat++;
        if (t.x > PASTURE.minX && t.x < PASTURE.maxX && t.z > PASTURE.minZ && t.z < PASTURE.maxZ) pasture++;
      }
    }
    expect(wheat).toBe(0);
    expect(pasture).toBeGreaterThan(3000);
  });

  it('has no colony feeding and no legendary cat yet (both wait for the owner)', () => {
    expect(COLONY_AREAS).not.toContain('farm');
    expect(feedsHere('farm')).toBe(false);
    expect(Object.hasOwn(LEGENDARY_BY_AREA, 'farm')).toBe(false);
  });

  it('has a card picture for the home screen', () => {
    expect(PLACE_PICTURE('farm')).toMatch(/places\/farm\.jpg$/);
    const jpg = readFileSync(new URL('../public/places/farm.jpg', import.meta.url));
    expect(jpg[0]).toBe(0xff);
    expect(jpg[1]).toBe(0xd8);
    expect(jpg.length).toBeGreaterThan(5000);
  });
});

describe('Appletree Farm: the drawing budget', () => {
  // test/budget.test.js holds the ceilings; this says what the Farm is made of.
  function stats(s) {
    let meshes = 0;
    let casters = 0;
    let triangles = 0;
    const box = new THREE.Box3();
    for (const child of s.children) {
      box.setFromObject(child);
      const eligible = castsFromBox(box);
      child.traverse((obj) => {
        if (!obj.isMesh) return;
        meshes++;
        const geo = obj.geometry;
        triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
        if (eligible && !isTransparentMat(obj.material) && !obj.userData.noCast) casters++;
      });
    }
    return { meshes, casters, triangles: Math.round(triangles) };
  }

  it('stays near the territories’ budget, well inside the Docks’', () => {
    const s = stats(scene);
    // test/budget.test.js's own ceilings for the Farm (measured 244 / 176 / 53,419)
    expect(s.meshes).toBeLessThanOrEqual(280);
    expect(s.casters).toBeLessThanOrEqual(210);
    expect(s.triangles).toBeLessThanOrEqual(62000);
  });

  it('builds the same farm every time', () => {
    const again = new THREE.Scene();
    const b2 = build(again);
    expect(stats(again)).toEqual(stats(scene));
    expect(b2.colliders).toEqual(area.colliders);
    expect(b2.perches).toEqual(area.perches);
    const first = scene.getObjectByName('wheat').geometry.attributes.position;
    const second = again.getObjectByName('wheat').geometry.attributes.position;
    expect(second.count).toBe(first.count);
    expect(Array.from(second.array.slice(0, 300))).toEqual(Array.from(first.array.slice(0, 300)));
  });

  it('keeps the low dressing out of the shadow pass', () => {
    for (const name of ['wheat', 'farmCrops', 'reeds', 'lilyPads']) expect(scene.getObjectByName(name).userData.noCast, name).toBe(true);
    const apples = [];
    scene.traverse((o) => { if (o.name === 'apples') apples.push(o); });
    expect(apples).toHaveLength(APPLE_TREES.length);
    for (const m of apples) expect(m.userData.noCast).toBe(true);
  });

  it('merges cleanly for the renderer', () => {
    const s = new THREE.Scene();
    build(s);
    mergeStaticProps(s);
    const after = stats(s);
    expect(after.meshes).toBeLessThanOrEqual(stats(scene).meshes);
    for (const name of ['barn', 'tractorShed', 'grainStore', 'milkingShed', 'henCoop', 'farmhouse']) expect(s.getObjectByName(name), name).toBeTruthy();
  });
});
