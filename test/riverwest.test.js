import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub, buildRiver, fingerprint, budgetOf, trianglesOf } from './helpers/growriver.js';
import { floodFrom } from './helpers/flood.js';
import { bannedIn, withOffWords } from './helpers/offwords.js';

// Bigger areas, step 1 (docs/superpowers/specs/2026-11-19-bigger-areas-design.md):
// the River's west strip, behind the switch in src/grow.js.
//
// Three things are proved here:
//   * with the switch off the River is today's (the rest of the suite, which
//     runs with it off and is untouched, is the larger half of that proof);
//   * with it on, the old 100 x 100 m core did not move by a bit: every
//     object the core builds is byte-identical, in the same order, on the
//     same Math.random draws, apart from the three that are meant to reach
//     the strip (the hills, the river-west water, the mist);
//   * the strip itself is sound: the same on every device, dry, reachable,
//     with a collider under every trunk and something to find.
//
// Step 3 (2026-11-19) added the south strip (riversouth.js, held in
// test/riversouth.test.js). The River here is built with both, so the
// first two proofs now hold with the south strip there too; where a check
// reads what "the strip" added, it reads the west strip's share of each list
// (the west's things come before the south's).

vi.stubGlobal('document', canvasStub);

const river = await import('../src/world/river.js');
const dress = await import('../src/world/riverdress.js');
const west = await import('../src/world/riverwest.js');
const south = await import('../src/world/riversouth.js');
const b = await import('../src/world/builder.js');
const { setGrow, growOn } = await import('../src/grow.js');
const rig = await import('../src/render/rig.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { findPath } = await import('../src/pathfind.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { rainPuddleSpots } = await import('../src/weather.js');
const { roamHomes } = await import('../src/clancast.js');
const { clanWalkableFor } = await import('../src/world/clanground.js');
const { buildGrassMask } = await import('../src/render/grass.js');
const { buildMapLayer } = await import('../src/ui/minimap.js');
const { mulberry32 } = await import('../src/rng.js');
const { segDist } = await import('../src/segdist.js');
const { createRests } = await import('../src/rests.js');

// The first build of a process makes the shared surface textures (and draws
// their uuids); every later one does not. Throw one away so the counts compare.
buildRiver(river, setGrow, false);
const OFF = buildRiver(river, setGrow, false);
const ON = buildRiver(river, setGrow, true);
const CORE = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
// step 3: the south strip took the bounds on to z 90
const GROWN = { minX: -90, maxX: 50, minZ: -50, maxZ: 90 };
const isStrip = (o) => o.userData.strip !== undefined;
const coreKids = ON.scene.children.filter((c) => !isStrip(c));
const stripKids = ON.scene.children.filter((o) => o.userData.strip === 'west');
// The three core objects that are meant to reach the strip.
const REACHING = ['horizonBand', 'water:river-west', 'marshMist'];

describe('the switch', () => {
  it('is off unless it is asked for', () => {
    expect(growOn()).toBe(false);
    setGrow(true);
    expect(growOn()).toBe(true);
    setGrow(false);
    expect(growOn()).toBe(false);
    setGrow(null);
    expect(growOn()).toBe(false);
  });

  it('reads ?grow=1 from the address, and nothing else turns it on', () => {
    const at = (search) => { vi.stubGlobal('location', { search }); try { return growOn(); } finally { vi.unstubAllGlobals(); vi.stubGlobal('document', canvasStub); } };
    expect(at('?grow=1')).toBe(true);
    expect(at('?perf&grow=1')).toBe(true);
    expect(at('?grow=0')).toBe(false);
    expect(at('?grow')).toBe(false);
    expect(at('')).toBe(false);
  });

  it('off: the River is the 100 m square it was, with no strip in its data', () => {
    expect(OFF.area.bounds).toEqual(CORE);
    expect(OFF.area.core).toBeUndefined();
    expect(OFF.area.strips).toBeUndefined();
    expect(OFF.area.rests).toBeUndefined();
    expect(OFF.area.waters).toBe(river.RIVER_WATERS);
    expect(OFF.scene.children.some(isStrip)).toBe(false);
  });

  it('on: the walkable bounds are the core and the west strip, x -90..50 (and the south strip, to z 90)', () => {
    expect(ON.area.bounds).toEqual(GROWN);
    expect(ON.area.core).toEqual(CORE);
    // step 2: the core streams too, first (world/streamcore.js); step 3: the south strip last
    expect(ON.area.strips.map((s) => s.id)).toEqual(['core', 'core-fine', 'west', 'south']);
    expect(ON.area.strips[2]).toBe(west.WEST_STRIP);
    expect(west.WEST).toMatchObject({ minX: -90, maxX: -50, minZ: -50, maxZ: 50 });
  });
});

describe('with the switch on, the core did not move', () => {
  it('the build takes exactly the same Math.random draws', () => {
    expect(ON.draws).toBe(OFF.draws);
  });

  it('the core\'s objects are the same, in the same order, and the strip\'s come after them', () => {
    expect(coreKids.length).toBe(OFF.scene.children.length);
    expect(ON.scene.children.slice(0, coreKids.length)).toEqual(coreKids);
    expect(coreKids.map((c) => `${c.type}:${c.name}`)).toEqual(OFF.scene.children.map((c) => `${c.type}:${c.name}`));
  });

  it('every core object is byte-identical, but for the hills, the river-west water and the mist', () => {
    const differing = [];
    OFF.scene.children.forEach((c, i) => {
      if (fingerprint(c).join('\n') !== fingerprint(coreKids[i]).join('\n')) differing.push(c.name);
    });
    expect(differing).toEqual(REACHING);
  });

  it('the scatter lists are what they were', () => {
    const lists = () => JSON.stringify([
      river.riverTrees(), river.riverReeds(), river.riverLilyPads(),
      dress.riverTussocks(), dress.riverCattails(), dress.riverShrubs(), dress.riverExtraPads(), dress.riverFlowers(),
    ]);
    setGrow(false);
    const off = lists();
    setGrow(true);
    const on = lists();
    setGrow(null);
    expect(on).toBe(off);
  });

  it('the area\'s lists start with the core\'s own, unchanged', () => {
    const plain = (list) => list.map((p) => JSON.stringify(p));
    const { area: a } = OFF;
    const { area: g } = ON;
    expect(plain(g.colliders.slice(0, a.colliders.length))).toEqual(plain(a.colliders));
    expect(plain(g.perches.slice(0, a.perches.length))).toEqual(plain(a.perches));
    expect(plain(g.collectibles.slice(0, a.collectibles.length))).toEqual(plain(a.collectibles));
    expect(plain(g.scenics.slice(0, a.scenics.length))).toEqual(plain(a.scenics));
    for (const key of ['pois', 'critterSpawns', 'moments', 'puddles', 'spawn', 'boxes', 'tippables']) {
      expect(JSON.stringify(g[key]), key).toBe(JSON.stringify(a[key]));
    }
    // the waters keep their order; river-west is the same water, run further west
    expect(g.waters.slice(0, a.waters.length).map((w) => w.id)).toEqual(a.waters.map((w) => w.id));
    for (const [i, w] of a.waters.entries()) {
      if (w.id === 'river-west') expect(g.waters[i]).toEqual({ ...w, minX: west.WEST_RIVER_MINX });
      else expect(g.waters[i]).toBe(w);
    }
  });

  it('the core is as many meshes, casters and triangles as today', () => {
    const offScene = buildRiver(river, setGrow, false).scene;
    const onScene = buildRiver(river, setGrow, true).scene;
    const built = budgetOf(offScene.children, rig);
    const core = (scene) => scene.children.filter((c) => !isStrip(c));
    const same = (scene) => core(scene).filter((c) => !REACHING.includes(c.name));
    expect(budgetOf(same(onScene), rig)).toEqual(budgetOf(same(offScene), rig));
    mergeStaticProps(offScene);
    mergeStaticProps(onScene);
    const off = budgetOf(offScene.children, rig);
    const on = budgetOf(core(onScene), rig);
    // today's River, as test/budget.test.js counts it
    expect(built.triangles).toBe(63778);
    expect(off).toEqual({ meshes: 170, casters: 133, triangles: 63778 });
    expect(on.meshes).toBe(off.meshes);
    expect(on.casters).toBe(off.casters);
    // all of the difference in triangles is in the three objects that reach
    // the strip: longer hills with their reeds and trees, a longer mist
    const reach = (scene) => scene.children.filter((c) => REACHING.includes(c.name)).reduce((n, c) => n + trianglesOf(c), 0);
    expect(on.triangles - off.triangles).toBe(reach(onScene) - reach(offScene));
    expect(on.triangles - off.triangles).toBeLessThanOrEqual(1500);
  });
});

describe('what a walk reads from the bounds', () => {
  it('the walk\'s seeded spots stay on the core: rain puddles and the clan\'s roam homes are today\'s', () => {
    expect(rainPuddleSpots(ON.area, mulberry32(5))).toEqual(rainPuddleSpots(OFF.area, mulberry32(5)));
    for (const s of rainPuddleSpots(ON.area, mulberry32(9), 40)) expect(s.x).toBeGreaterThanOrEqual(-25);
    const homes = (area) => {
      const clanArea = { ...area, colliders: Object.freeze(area.colliders.map((c) => ({ ...c }))) };
      return roamHomes('river', clanArea, clanWalkableFor(clanArea, 'river'));
    };
    expect(homes(ON.area)).toEqual(homes(OFF.area));
    expect(homes(ON.area).length).toBeGreaterThan(0);
  });

  it('the cat, the map, the grass and the path finder use the grown bounds', () => {
    // a dry spot in the strip: a cat may stand there with the switch on only
    expect(isWalkableAt(ON.area, -80, 40)).toBe(true);
    expect(isWalkableAt(OFF.area, -80, 40)).toBe(false);
    expect(isWalkableAt(ON.area, -90.5, 40)).toBe(false);
    expect(buildMapLayer(ON.area, ON.scene).edge).toEqual(GROWN);
    const mask = buildGrassMask(ON.area, []);
    expect(mask.at(-83, 44)).toBe(1);
    expect(mask.at(-95, 44)).toBe(0);
    const walkable = (x, z) => isWalkableAt(ON.area, x, z);
    const way = findPath(walkable, ON.area.bounds, ON.area.spawn, { x: -86, z: 5 });
    expect(way).not.toBeNull();
    expect(way[way.length - 1].x).toBeLessThan(-84);
  });
});

describe('the ground, the river and the hills reach the new edge', () => {
  const ground = () => ON.scene.children.find((c) => c.userData.ground && c.geometry.parameters?.width === 120);
  const patch = () => ON.scene.children.find((c) => c.name === 'stripGround');

  it('the strip\'s ground is more of the same plane: same material, and no seam where they meet', () => {
    const g = ground(), p = patch();
    expect(p.material).toBe(g.material);
    expect(p.userData.ground).toBe(true);
    g.updateMatrixWorld(true); p.updateMatrixWorld(true);
    const at = (mesh) => {
      const m = new Map();
      const pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color, uv = mesh.geometry.attributes.uv;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        if (Math.abs(v.x + 60) > 1e-6) continue;
        expect(Math.abs(v.y)).toBeLessThan(1e-9);
        m.set(Math.round(v.z * 100), [col.getX(i), col.getY(i), col.getZ(i), uv.getX(i), uv.getY(i)]);
      }
      return m;
    };
    const a = at(g), c = at(p);
    expect(a.size).toBe(49); // the plane's 2.5 m grid, z -60..60
    expect([...c.keys()].sort()).toEqual([...a.keys()].sort());
    for (const [z, va] of a) va.forEach((n, k) => expect(c.get(z)[k], `z ${z / 100} component ${k}`).toBeCloseTo(n, 5));
    // and it runs 10 m past the new edge, as the core's does past the old
    const box = new THREE.Box3().setFromObject(p);
    expect(box.min.x).toBeCloseTo(-100, 6);
    expect(box.max.x).toBeCloseTo(-60, 6);
    expect(box.min.z).toBeCloseTo(-60, 6);
    expect(box.max.z).toBeCloseTo(60, 6);
  });

  it('the river runs on through the strip and under the hills, and a cat cannot walk on it', () => {
    const rw = ON.area.waters.find((w) => w.id === 'river-west');
    expect(rw.minX).toBeLessThanOrEqual(-150);
    for (let x = -89; x <= -51; x += 2) {
      expect(b.inWater(ON.area.waters, x, -31.5)).toBe(true);
      expect(isWalkableAt(ON.area, x, -31.5)).toBe(false);
    }
    const mesh = ON.scene.children.find((c) => c.name === 'water:river-west');
    const box = new THREE.Box3().setFromObject(mesh);
    expect(box.min.x).toBeLessThanOrEqual(-150);
    // the mist's sheets reach the new edge too
    const mist = new THREE.Box3().setFromObject(ON.scene.children.find((c) => c.name === 'marshMist'));
    expect(mist.min.x).toBeCloseTo(-90, 6);
  });

  const outside = (bd, x, z) => Math.max(x - bd.maxX, bd.minX - x, z - bd.maxZ, bd.minZ - z);
  const band = () => ON.scene.children.find((c) => c.name === 'horizonBand');

  it('the hills ring the grown ground: their inner rim is 6 m outside the bounds all round', () => {
    const pos = band().geometry.attributes.position;
    let nearest = Infinity;
    for (let v = 0; v < pos.count; v++) nearest = Math.min(nearest, outside(GROWN, pos.getX(v), pos.getZ(v)));
    expect(nearest).toBeCloseTo(6, 6);
    // the first ten metres are flat (under and just past the ground), then the hills
    for (let v = 0; v < pos.count; v++) {
      if (outside(GROWN, pos.getX(v), pos.getZ(v)) <= 15) expect(pos.getY(v)).toBeLessThan(0.31);
    }
    const box = new THREE.Box3().setFromBufferAttribute(pos);
    expect(box.min.x).toBeCloseTo(-156, 5);
    expect(box.max.x).toBeCloseTo(116, 5);
    expect(box.max.z).toBeCloseTo(156, 5); // step 3: the south strip's 40 m
    expect(box.max.y).toBeGreaterThan(2);
  });

  it('the edge\'s reeds and trees moved out with it: none is left standing where the old edge was', () => {
    // step 3: the band rings both strips
    const { horizon } = { horizon: { ...river.RIVER_HORIZON, rect: south.GROWN_BAND_RECT } };
    const spots = b.edgeSpots({ ...horizon.edge, rect: horizon.rect, avoid: ON.area.waters }, horizon.salt, ON.area.waters);
    expect(spots.length).toBeGreaterThan(120);
    expect(b.edgeSpots({ ...horizon.edge, rect: horizon.rect }, horizon.salt, ON.area.waters)).toEqual(spots);
    for (const s of spots) {
      // test/edges.test.js's rule, on the grown bounds
      expect(outside(GROWN, s.x, s.z), `${s.kind} at ${s.x.toFixed(1)},${s.z.toFixed(1)}`).toBeGreaterThanOrEqual(4.5);
      expect(Math.abs(s.ox) + Math.abs(s.oz)).toBe(1);
    }
    // the pieces keep the style's spacing on the longer sides
    const north = spots.filter((s) => s.kind !== 'tree' && s.oz === -1).map((s) => s.x).sort((p, q) => p - q);
    for (let i = 1; i < north.length; i++) expect(north[i] - north[i - 1]).toBeLessThan(4.5);
    const edge = band().children.find((c) => c.name === 'horizonEdge');
    const pos = edge.geometry.attributes.position;
    expect(pos.count).toBeGreaterThan(1000);
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      const out = outside(GROWN, x, z);
      expect(out, `vertex at ${x.toFixed(1)},${z.toFixed(1)}`).toBeGreaterThan(8);
      if (out <= 11) expect(y).toBeLessThanOrEqual(1.6);
      expect(b.waterClearance(ON.area.waters, x, z)).toBeGreaterThanOrEqual(1.0);
    }
  });
});

describe('the strip\'s scatter', () => {
  const tiles = west.WEST_TILES;
  const all = tiles.map((t) => west.westTileContent(t.index));
  const trees = west.westTrees();
  const waterGap = (x, z) => b.waterClearance(ON.area.waters, x, z);
  const lows = all.flatMap((c) => Object.values(c.small).flat());
  const trailGap = (x, z) => Math.min(...west.WEST_TRAIL.map((s) => segDist(x, z, ...s)));

  it('is the same on every device: a tile\'s content is a pure function of its index', async () => {
    const before = JSON.stringify(all);
    vi.resetModules();
    vi.stubGlobal('document', canvasStub);
    const again = await import('../src/world/riverwest.js');
    expect(again.westTileContent).not.toBe(west.westTileContent);
    // asked for in another order, so one tile cannot lean on another's stream
    const fresh = [...tiles].reverse().map((t) => again.westTileContent(t.index)).reverse();
    expect(JSON.stringify(fresh)).toBe(before);
    expect(west.westTileContent(3)).toBe(west.westTileContent(3));
  });

  it('every thing stands on its own tile, dry, off the trail and off the fallen willow', () => {
    tiles.forEach((t, i) => {
      for (const p of [...all[i].trees, ...Object.values(all[i].small).flat()]) {
        expect(p.x >= t.minX && p.x <= t.maxX && p.z >= t.minZ && p.z <= t.maxZ, `${p.x},${p.z} on tile ${i}`).toBe(true);
      }
    });
    for (const p of lows) {
      expect(waterGap(p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(0.2);
      expect(trailGap(p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(1.1);
    }
    for (const t of trees) {
      expect(waterGap(t.x, t.z)).toBeGreaterThanOrEqual(3);
      // the path's rule: half the trail, the canopy's reach, and half a metre
      expect(trailGap(t.x, t.z)).toBeGreaterThanOrEqual(west.WEST_TRAIL_W / 2 + 1.6 * t.scale + 0.5);
      for (const c of west.WEST_COLLIDERS) expect(Math.hypot(t.x - c.x, t.z - c.z)).toBeGreaterThan(4);
    }
  });

  it('no two trees crowd, in a tile or across two, nor a strip tree and a core tree', () => {
    const core = river.riverTrees();
    const others = [...core.willows, ...core.alders, ...core.pines];
    trees.forEach((t, i) => {
      for (const u of trees.slice(i + 1)) expect(Math.hypot(t.x - u.x, t.z - u.z)).toBeGreaterThanOrEqual(4);
      for (const u of others) expect(Math.hypot(t.x - u.x, t.z - u.z)).toBeGreaterThanOrEqual(2.5);
    });
  });

  it('is the River\'s own kinds, thinner than the core and thinner again toward the rim', () => {
    expect(new Set(trees.map((t) => t.kind))).toEqual(new Set(['willow', 'alder']));
    for (const t of trees) expect(t.kind === 'willow').toBe(waterGap(t.x, t.z) < 10);
    const coreTrees = river.riverTrees();
    const coreDensity = (coreTrees.willows.length + coreTrees.alders.length + coreTrees.pines.length) / 10000;
    const density = trees.length / 4000;
    expect(density).toBeLessThan(coreDensity * 0.75);
    expect(density).toBeGreaterThan(coreDensity * 0.4);
    const near = (list) => list.filter((p) => p.x >= -70).length;
    expect(near(trees)).toBeGreaterThan(trees.length - near(trees));
    const reeds = all.flatMap((c) => c.small.reed);
    expect(near(reeds)).toBeGreaterThan(3 * (reeds.length - near(reeds)));
    // about half the core's reeds to the square metre where the reedbed carries on
    const bed = (list, minX, maxX) => list.filter((p) => p.x >= minX && p.x < maxX && p.z > -27 && p.z < 22).length;
    const coreBed = bed(river.riverReeds(), -50, -40) / 10;
    const stripBed = bed(reeds, -60, -50) / 10;
    expect(stripBed).toBeLessThan(coreBed * 0.65);
    expect(stripBed).toBeGreaterThan(coreBed * 0.25);
    for (const kind of ['reed', 'tussock', 'cattail', 'marigold', 'stone']) {
      expect(all.reduce((n, c) => n + c.small[kind].length, 0), kind).toBeGreaterThan(8);
    }
    // no stretch is bare: every tile has low things on it (step 3 made the
    // tussocks fewer and bigger, for the budget with the south strip: 15, was 20)
    for (const c of all) expect(Object.values(c.small).flat().length).toBeGreaterThanOrEqual(15);
  });

  it('every tree has its collider and its Sure Claws fork from the start of a walk', () => {
    const tail = ON.area.colliders.slice(OFF.area.colliders.length);
    // the west strip's first, then the south strip's (step 3)
    expect(tail.length).toBe(trees.length + west.WEST_COLLIDERS.length + south.southTrees().length + south.SOUTH_COLLIDERS.length);
    trees.forEach((t, i) => {
      expect(tail[i]).toEqual({ x: t.x, z: t.z, r: t.r });
      expect(t.r).toBe(Math.round(0.5 * t.scale * 100) / 100); // the core's rule for a willow and an alder
    });
    const forks = ON.area.perches.slice(OFF.area.perches.length, OFF.area.perches.length + trees.length);
    trees.forEach((t, i) => expect(forks[i]).toMatchObject({ x: t.x, z: t.z, kind: 'tree' }));
  });
});

describe('something to find', () => {
  const walkable = (x, z) => isWalkableAt(ON.area, x, z);
  const flood = floodFrom(ON.area, ON.area.spawn, walkable);
  // what the west strip added: its share comes first, before the south strip's (step 3)
  const westShare = {
    collectibles: west.westCollectibles().length, scenics: west.westScenics().length,
    perches: west.westTreePerches().length + west.WEST_PERCHES.length,
  };
  const added = (key) => ON.area[key].slice(OFF.area[key].length, OFF.area[key].length + westShare[key]);
  const westRests = ON.area.rests.slice(0, west.WEST_RESTS.length);

  it('every spot of the strip a cat can stand on is reached from the spawn on foot', () => {
    let standable = 0;
    for (let x = -90; x <= -50; x += 0.5) {
      for (let z = -50; z <= 50; z += 0.5) {
        if (!walkable(x, z)) continue;
        standable++;
        expect(flood.reaches(x, z), `${x},${z}`).toBe(true);
      }
    }
    // most of the strip is ground to walk on
    expect(standable).toBeGreaterThan(0.8 * 81 * 201);
  });

  it('the path finder finds its way from the core to each find, each rest and every tile', () => {
    const targets = [
      ...added('collectibles').filter((c) => c.y === undefined), ...added('scenics'), ...westRests,
      ...west.WEST_TILES.map((t) => ({ x: (t.minX + t.maxX) / 2, z: (t.minZ + t.maxZ) / 2 })),
    ];
    expect(targets.length).toBe(3 + 1 + 2 + 10);
    for (const t of targets) {
      const way = findPath(walkable, ON.area.bounds, ON.area.spawn, t);
      expect(way, `${t.x},${t.z}`).not.toBeNull();
      const end = way[way.length - 1];
      expect(Math.hypot(end.x - t.x, end.z - t.z), `${t.x},${t.z}`).toBeLessThan(2.5);
    }
  });

  it('nothing to find or to stand on is under water', () => {
    const spots = [...added('collectibles'), ...added('scenics'), ...westRests, ...added('perches'), ...west.westTrees()];
    for (const p of spots) expect(b.waterClearance(ON.area.waters, p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(CAT_RADIUS);
    for (const [x1, z1, x2, z2] of west.WEST_TRAIL) {
      for (let k = 0; k <= 20; k++) {
        const x = x1 + ((x2 - x1) * k) / 20, z = z1 + ((z2 - z1) * k) / 20;
        expect(b.waterClearance(ON.area.waters, x, z)).toBeGreaterThanOrEqual(west.WEST_TRAIL_W / 2);
        expect(ON.area.colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + CAT_RADIUS), `trail at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
      }
    }
  });

  it('the trail leaves the long path at its bend and ends inside the strip', () => {
    const [x0, z0] = west.WEST_TRAIL[0];
    expect(river.RIVER_PATHS.some((s) => (s[0] === x0 && s[1] === z0) || (s[2] === x0 && s[3] === z0))).toBe(true);
    west.WEST_TRAIL.forEach((s, i) => { if (i) expect([s[0], s[1]]).toEqual([west.WEST_TRAIL[i - 1][2], west.WEST_TRAIL[i - 1][3]]); });
    const end = west.WEST_TRAIL[west.WEST_TRAIL.length - 1];
    expect(end[2]).toBeLessThan(-80);
    expect(end[2]).toBeGreaterThan(-90);
    const mesh = stripKids.find((c) => c.name === 'pathTrail');
    expect(mesh.userData.trail.length).toBe(west.WEST_TRAIL.length);
    // its hidden data strips are there for the grass and the paw prints
    expect(stripKids.filter((c) => c.name === 'path' && c.visible === false).length).toBe(west.WEST_TRAIL.length);
  });

  it('the fallen willow is a climb: four perches, each in reach of the last and higher, the first from the grass', () => {
    const chain = west.WEST_PERCHES;
    expect(chain.length).toBe(4);
    expect(added('perches').slice(-4)).toEqual([...chain]);
    chain.forEach((p, i) => {
      expect(p.kind).toBe('tree');
      expect(p.y).toBeGreaterThan(1);
      if (i) {
        expect(p.y).toBeGreaterThan(chain[i - 1].y);
        expect(canReach(p, chain[i - 1], chain[i - 1].y, BASE_CLIMB_BUDGET)).toBe(true);
      }
    });
    // from the grass beside the low end
    const low = chain[0];
    let from = null;
    for (let a = 0; a < Math.PI * 2 && !from; a += 0.2) {
      const p = { x: low.x + Math.cos(a) * 1.4, z: low.z + Math.sin(a) * 1.4 };
      if (walkable(p.x, p.z) && flood.reachesWithin(p.x, p.z, 0.6)) from = p;
    }
    expect(from).not.toBeNull();
    expect(canReach(low, from, 0, BASE_CLIMB_BUDGET)).toBe(true);
    const top = chain[3];
    expect(top.vantage).toBe(true);
    expect(top.label).toBe('fallen willow lookout');
    // the feather lies on the lookout
    expect(added('collectibles')[0]).toMatchObject({ id: 'river-find-6', x: top.x, z: top.z, y: top.y });
    // the trunk is solid under the perches
    for (const p of chain) expect(walkable(p.x, p.z)).toBe(false);
  });

  it('two spots to rest: a hollow to nap in and a stone to drink from, both on dry ground a cat can reach', () => {
    expect(westRests.map((r) => `${r.id}:${r.kind}:${r.mesh}`)).toEqual(['river-nap-1:nap:false', 'river-drink-1:drink:false']);
    for (const r of westRests) {
      expect(walkable(r.x, r.z), r.id).toBe(true);
      expect(flood.reaches(Math.round(r.x * 2) / 2, Math.round(r.z * 2) / 2) || flood.reachesWithin(r.x, r.z, 0.8), r.id).toBe(true);
    }
    const drink = westRests[1];
    expect(b.waterClearance(ON.area.waters, drink.x, drink.z)).toBeLessThan(1);
    // the walk joins them to the area's own rests (rests.add), with no mesh of their own
    const scene = new THREE.Scene();
    const rests = createRests(scene, []);
    rests.add(ON.area.rests);
    expect(scene.children.length).toBe(0);
    expect(rests.colliders).toEqual([]);
    expect(rests.nearest({ x: drink.x + 0.5, z: drink.z }, 1.2)).toMatchObject({ id: 'river-drink-1', kind: 'drink' });
    expect(rests.nearest({ x: westRests[0].x, z: westRests[0].z + 0.4 }, 1.2)).toMatchObject({ id: 'river-nap-1', kind: 'nap' });
    expect(rests.nearest({ x: -80, z: 40 }, 1.2)).toBeNull();
  });

  it('the fallen willow is one mesh that casts, and the still pool is water like the core\'s pools', () => {
    const g = stripKids.find((c) => c.name === 'fallenWillow');
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBe(1);
    const box = new THREE.Box3().setFromObject(g);
    expect(rig.castsFromBox(box)).toBe(true);
    expect(box.min.y).toBeLessThan(0.05); // it lies on the ground, nothing floats
    expect(box.max.y).toBeGreaterThan(1.8);
    expect(box.max.y).toBeLessThan(3.6);
    // the west strip's pool, then the south strip's (step 3)
    const pool = ON.area.waters[ON.area.waters.length - 2];
    expect(pool).toBe(west.STILL_POOL);
    expect(pool.shallow).toBe(1.0);
    expect(ON.area.waterFx.length).toBe(OFF.area.waterFx.length + 2);
    expect(stripKids.some((c) => c.name === 'water:pool-west')).toBe(true);
  });

  it('every new line on screen is plain words, the same in both word sets', () => {
    const lines = () => [
      ...added('collectibles').map((c) => c.label), ...added('scenics').map((c) => c.label), west.WEST_PERCHES[3].label,
    ];
    const on = lines();
    const off = withOffWords(lines);
    expect(on.length).toBe(6);
    expect(off).toEqual(on);
    for (const s of on) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(8);
      expect(s.length).toBeLessThanOrEqual(48);
      expect(bannedIn(s), s).toBeNull();
    }
    expect(new Set(on).size).toBe(6);
  });
});
