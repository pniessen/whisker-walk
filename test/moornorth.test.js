import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub, buildRiver as buildArea, fingerprint, fnv, budgetOf, trianglesOf } from './helpers/growriver.js';
import { floodFrom } from './helpers/flood.js';
import { bannedIn, withOffWords } from './helpers/offwords.js';

// Bigger areas, step 3 (docs/superpowers/specs/2026-11-19-bigger-areas-moor.md):
// the Moor's core streamed near the cat, and its north strip, behind the
// switch in src/grow.js.
//
// Proved here:
//   * with the switch off the Moor is today's (the rest of the suite, which
//     runs with it off and is untouched, is the larger half of that proof);
//   * with it on, the old 100 x 100 m core did not move by a bit: every
//     object the core builds is byte-identical, in the same order, on the
//     same Math.random draws, apart from the hills (they move out with the
//     edge); the core's scatter is tagged to stream and nothing else
//     (test/growcore.test.js's checks, for the Moor);
//   * the camp stays tucked in: an old wall, whole behind it, closes the old
//     edge, and the only ways through are its two gaps, well away from it;
//   * the strip itself is sound: the same on every device, reachable, with a
//     collider under every trunk, stone and tor and something to find;
//   * the budget at the worst spot a cat can stand.

vi.stubGlobal('document', canvasStub);

const moor = await import('../src/world/moor.js');
const dress = await import('../src/world/moordress.js');
const north = await import('../src/world/moornorth.js');
const b = await import('../src/world/builder.js');
const { setGrow } = await import('../src/grow.js');
const rig = await import('../src/render/rig.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { createStripTiles } = await import('../src/render/striptiles.js');
const { LAYERS, BUILT, tileDistance } = await import('../src/world/strips.js');
const { coreStreams, CORE_TILE, FINE_TILE } = await import('../src/world/streamcore.js');
const { measureStreams, worstSpot, ALL_LAYERS } = await import('./helpers/growbudget.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { findPath } = await import('../src/pathfind.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { rainPuddleSpots } = await import('../src/weather.js');
const { roamHomes } = await import('../src/clancast.js');
const { clanWalkableFor } = await import('../src/world/clanground.js');
const { DISCS } = await import('../src/rivalclans.js');
const { buildGrassMask } = await import('../src/render/grass.js');
const { buildMapLayer } = await import('../src/ui/minimap.js');
const { mulberry32 } = await import('../src/rng.js');
const { segDist } = await import('../src/segdist.js');
const { createRests } = await import('../src/rests.js');
const { createRustle } = await import('../src/render/rustle.js');

// The first build of a process makes the shared surface textures (and draws
// their uuids); every later one does not. Throw one away so the counts compare.
const buildMoor = (on, opts) => buildArea(moor, setGrow, on, opts);
buildMoor(false);
const OFF = buildMoor(false);
const ON = buildMoor(true);
const CORE = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
const GROWN = { minX: -50, maxX: 50, minZ: -90, maxZ: 50 };
const isStrip = (o) => o.userData.strip !== undefined;
const coreKids = ON.scene.children.filter((c) => !isStrip(c));
const stripKids = ON.scene.children.filter(isStrip);
// The one core object meant to reach the strip: the hills (and the ground's
// edge, a child of them) move 40 m north.
const REACHING = ['horizonBand'];
const tagged = (scene, kind) => scene.children.filter((o) => o.userData.stream === kind);
const added = (key) => ON.area[key].slice(OFF.area[key].length);

describe('the switch', () => {
  it('off: the Moor is the 100 m square it was, with no strip in its data', () => {
    expect(OFF.area.bounds).toEqual(CORE);
    expect(OFF.area.core).toBeUndefined();
    expect(OFF.area.strips).toBeUndefined();
    expect(OFF.area.rests).toBeUndefined();
    expect(OFF.area.waters).toBe(moor.MOOR_WATERS);
    expect(OFF.scene.children.some(isStrip)).toBe(false);
    expect(OFF.scene.children.filter((o) => o.userData.stream !== undefined)).toEqual([]);
  });

  it('on: the walkable bounds are the core and the north strip, z -90..50', () => {
    expect(ON.area.bounds).toEqual(GROWN);
    expect(ON.area.core).toEqual(CORE);
    expect(north.NORTH).toMatchObject({ minX: -50, maxX: 50, minZ: -90, maxZ: -50 });
    expect(ON.area.strips.map((s) => s.id)).toEqual(['core', 'core-fine', 'north']);
    expect(ON.area.strips[2]).toBe(north.NORTH_STRIP);
  });

  it('the core\'s streams come first, cut over the grown Moor: the core\'s things land on the same 10 m and 5 m tiles, and the strip\'s beds on tiles of their own', () => {
    const [core, fine] = ON.area.strips;
    expect([core, fine]).toEqual(coreStreams({ areaId: 'moor', rect: GROWN }));
    expect(core).toMatchObject({ id: 'core', prebuilt: true, layerIds: ['small', 'trees'] });
    expect(fine).toMatchObject({ id: 'core-fine', prebuilt: true, layerIds: ['fine'] });
    expect(core.tiles.length).toBe((100 / CORE_TILE) * (140 / CORE_TILE));
    expect(fine.tiles.length).toBe((100 / FINE_TILE) * (140 / FINE_TILE));
    // every tile edge of the core's own cut is a tile edge of this one
    const inner = coreStreams({ areaId: 'moor', rect: CORE })[0].tiles;
    for (const t of inner) expect(core.tiles.some((u) => u.minX === t.minX && u.maxX === t.maxX && u.minZ === t.minZ && u.maxZ === t.maxZ)).toBe(true);
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

  it('every core object is byte-identical, but for the hills', () => {
    const differing = [];
    OFF.scene.children.forEach((c, i) => {
      if (fingerprint(c).join('\n') !== fingerprint(coreKids[i]).join('\n')) differing.push(c.name);
    });
    expect(differing).toEqual(REACHING);
  });

  it('the scatter lists are what they were', () => {
    const lists = () => JSON.stringify([
      moor.moorTrees(), moor.moorHeather(), moor.moorGorse(), moor.moorReeds(), moor.moorDressItems(),
      dress.moorClitter(), dress.moorBoulders(), dress.moorGrass(), dress.moorShoreStones(),
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
    // the waters keep their order and are the same records; the tarn comes last
    expect(g.waters.slice(0, a.waters.length)).toEqual([...a.waters]);
    a.waters.forEach((w, i) => expect(g.waters[i]).toBe(w));
    expect(g.waters[g.waters.length - 1]).toBe(north.TARN);
  });

  it('the core is as many meshes and casters as today, its triangles moved only by the hills', () => {
    const offScene = buildMoor(false).scene;
    const onScene = buildMoor(true).scene;
    const core = (scene) => scene.children.filter((c) => !isStrip(c));
    const same = (scene) => core(scene).filter((c) => !REACHING.includes(c.name));
    expect(budgetOf(same(onScene), rig)).toEqual(budgetOf(same(offScene), rig));
    mergeStaticProps(offScene);
    mergeStaticProps(onScene);
    const off = budgetOf(offScene.children, rig);
    const on = budgetOf(core(onScene), rig);
    // today's Moor, as test/budget.test.js counts it
    expect(off).toEqual({ meshes: 87, casters: 47, triangles: 64120 });
    expect(on.meshes).toBe(off.meshes);
    expect(on.casters).toBe(off.casters);
    const reach = (scene) => scene.children.filter((c) => REACHING.includes(c.name)).reduce((n, c) => n + trianglesOf(c), 0);
    expect(on.triangles - off.triangles).toBe(reach(onScene) - reach(offScene));
    // the hills and the ground's edge, 40 m longer each way with the wall's
    // gorse all round it (67 mounds to today's 55): 1,518 more triangles
    expect(on.triangles - off.triangles).toBeLessThanOrEqual(1600);
  });
});

describe('the core\'s scatter, tagged to stream (world/streamcore.js)', () => {
  it('tags its scatter thorns and pines, its reeds, its dressing and the strip\'s own beds, and nothing else', () => {
    const { thorns, pines } = moor.moorTrees();
    const trees = tagged(ON.scene, 'trees');
    expect(trees.length).toBe(thorns.length + pines.length);
    expect(trees.map((g) => `${g.position.x},${g.position.z},${g.scale.x}`))
      .toEqual([...thorns, ...pines].map((t) => `${t.x},${t.z},${t.scale}`));
    expect(tagged(ON.scene, 'small').map((m) => `${m.name}:${m.userData.streamLayer}`)).toEqual([
      'reeds:fine', 'dressing:small',
      'north-heatherBase:fine', 'north-heatherBloom:fine', 'north-gorse:small', 'north-gorseBloom:small',
    ]);
    // the landmarks, the beds a Group holds and what gameplay looks up stay whole
    for (const name of ['oldHawthorn', 'highTor', 'logBridge', 'steppingStones', 'heather', 'gorse', 'burrows',
      'groundPaint', 'horizonBand', 'clanCamp', 'campRing', 'northStones']) {
      const o = ON.scene.children.find((c) => c.name === name);
      expect(o, name).toBeTruthy();
      expect(o.userData.stream, name).toBeUndefined();
    }
  });

  it('each tagged core thing is the switch-off build\'s, byte for byte, in the same place in the scene', () => {
    for (const o of coreKids.filter((c) => c.userData.stream)) {
      const i = ON.scene.children.indexOf(o);
      expect(fingerprint(o)).toEqual(fingerprint(OFF.scene.children[i]));
    }
  });

  it('the core\'s content (every tree, reed and dressing item, every collider and fork, every critter) is the switch-off list', () => {
    const lists = (area) => JSON.stringify({
      trees: moor.moorTrees(), reeds: moor.moorReeds(), dress: moor.moorDressItems(),
      colliders: area.colliders.slice(0, OFF.area.colliders.length), perches: area.perches.slice(0, OFF.area.perches.length),
      critters: area.critterSpawns,
    });
    expect(lists(ON.area)).toBe(lists(OFF.area));
  });
});

// A walk's scene as walk.js makes it, with its strip tiles.
function walkScene() {
  const { scene, area } = buildMoor(true);
  mergeStaticProps(scene);
  rig.assignShadowCasters(scene);
  const colliders = JSON.stringify(area.colliders);
  const perches = JSON.stringify(area.perches);
  const tiles = createStripTiles(scene, { strips: area.strips });
  return { scene, area, tiles, colliders, perches };
}

describe('the Moor streamed on a walk, through the east gap to the stones and back', () => {
  const w = walkScene();
  const ROUTE = [[46, 44], [46, 22], [34, -8], [40, -11], [30, -42.5], [31, -47], [29, -51.7], [24.5, -57.5],
    [17, -62], [8, -63.5], [0.6, -69.4], [-28, -60], [-28.5, -51.7], [-28, -40], [46, 44]];
  const DT = 1 / 60;
  w.tiles.settle(...ROUTE[0]);
  const scales = new Map([...tagged(w.scene, 'trees'), ...w.tiles.inventory().runMeshes.map((r) => r.mesh)].map((o) => [o, o.scale.toArray().join()]));
  let gap = null, grew = null, frames = 0;
  for (let i = 1; i < ROUTE.length; i++) {
    const [x0, z0] = ROUTE[i - 1], [x1, z1] = ROUTE[i];
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (8 * DT));
    for (let k = 1; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, z = z0 + ((z1 - z0) * k) / n;
      w.tiles.update(DT, x, z);
      frames++;
      for (const [o, s] of scales) if (o.scale.toArray().join() !== s && !grew) grew = `${o.name} at ${x.toFixed(1)},${z.toFixed(1)}`;
      w.area.strips.forEach((strip, st) => {
        if (!strip.prebuilt) return;
        for (const sl of w.tiles.streamers[st].slots) {
          const key = `${strip.id}|${sl.tile.index}|${sl.layer.id}`;
          if (!w.tiles.standIns.has(key)) continue;
          if ((sl.state === BUILT) === w.tiles.standIns.shown(key) && !gap) gap = `${key} at ${x.toFixed(1)},${z.toFixed(1)}`;
        }
      });
    }
  }

  it('never leaves a gap or draws a thing twice, and nothing of the core grows in or moves', () => {
    expect(frames).toBeGreaterThan(2000);
    expect(gap).toBeNull();
    expect(grew).toBeNull();
  });

  it('the strip\'s trees and small things were built and dropped as the cat came and went', () => {
    const s = w.tiles.streamers[2].stats;
    expect(s.built).toBeGreaterThan(10);
    expect(s.dropped).toBeGreaterThan(5);
  });

  it('streaming touches no collider or perch', () => {
    expect(JSON.stringify(w.area.colliders)).toBe(w.colliders);
    expect(JSON.stringify(w.area.perches)).toBe(w.perches);
  });

  it('the strip\'s heather flowers rustle as the core\'s do: the walk\'s rustle finds them in the scene', () => {
    const r = createRustle(w.scene, {});
    expect(r.count).toBe(2);
  });

  it('a strip bed keeps every vertex of its build: drawn whole, it is every triangle once', () => {
    const g = buildMoor(true);
    mergeStaticProps(g.scene);
    const t2 = createStripTiles(g.scene, { strips: g.area.strips.map((s) => ({ ...s, layers: ALL_LAYERS })) });
    t2.settle(0, 0);
    const triples = (geo, n) => {
      const at = (i) => (geo.index ? geo.index.getX(i) : i);
      const out = [];
      for (let i = 0; i < n; i += 3) out.push([at(i), at(i + 1), at(i + 2)].join(','));
      return out.sort();
    };
    const fresh = buildMoor(true).scene;
    for (const { mesh } of t2.inventory().runMeshes) {
      const was = fresh.children.find((c) => c.name === mesh.name);
      for (const name of Object.keys(was.geometry.attributes)) expect(fnv(mesh.geometry.attributes[name].array), `${mesh.name}.${name}`).toBe(fnv(was.geometry.attributes[name].array));
      const n = was.geometry.index ? was.geometry.index.count : was.geometry.attributes.position.count;
      expect(triples(mesh.geometry, mesh.geometry.drawRange.count), mesh.name).toEqual(triples(was.geometry, n));
    }
    t2.dispose();
  });
});

describe('what a walk reads from the bounds', () => {
  it('the walk\'s seeded spots stay on the core: rain puddles and the clan\'s roam homes are today\'s', () => {
    expect(rainPuddleSpots(ON.area, mulberry32(5))).toEqual(rainPuddleSpots(OFF.area, mulberry32(5)));
    const homes = (area) => {
      const clanArea = { ...area, colliders: Object.freeze(area.colliders.map((c) => ({ ...c }))) };
      return roamHomes('moor', clanArea, clanWalkableFor(clanArea, 'moor'));
    };
    expect(homes(ON.area)).toEqual(homes(OFF.area));
    expect(homes(ON.area).length).toBeGreaterThan(0);
  });

  it('the cat, the map, the grass and the path finder use the grown bounds', () => {
    expect(isWalkableAt(ON.area, 10, -80)).toBe(true);
    expect(isWalkableAt(OFF.area, 10, -80)).toBe(false);
    expect(isWalkableAt(ON.area, 10, -90.5)).toBe(false);
    expect(buildMapLayer(ON.area, ON.scene).edge).toEqual(GROWN);
    const mask = buildGrassMask(ON.area, []);
    expect(mask.at(30, -84)).toBe(1);
    expect(mask.at(30, -95)).toBe(0);
    const walkable = (x, z) => isWalkableAt(ON.area, x, z);
    const way = findPath(walkable, ON.area.bounds, ON.area.spawn, { x: 40, z: -84 });
    expect(way).not.toBeNull();
    expect(way[way.length - 1].z).toBeLessThan(-82);
  });
});

describe('the camp stays tucked in behind the old wall', () => {
  const walkable = (x, z) => isWalkableAt(ON.area, x, z);
  const camp = DISCS.moor;

  it('the wall runs right across, 1.5 m past the old edge, from tor to tor, with two gaps', () => {
    const xs = north.WALL_RUNS.flatMap((r) => r.map(([x]) => x));
    expect(Math.min(...xs)).toBeLessThan(-50);
    expect(Math.max(...xs)).toBeGreaterThan(50);
    for (const run of north.WALL_RUNS) for (const [, z] of run) expect(z).toBeLessThan(-51.5);
    expect(north.WALL_GAPS.map((g) => g.id)).toEqual(['west', 'east']);
    // the three old skyline tors stand in the strip now, solid
    expect(north.strippedTors().map((t) => [t.x, t.z])).toEqual([[20, -54], [-14, -54], [38, -53.5]]);
    for (const t of north.torColliders()) expect(walkable(t.x, t.z)).toBe(false);
  });

  it('the wall is whole behind the camp: its gaps are 25 m or more from the camp\'s edge, and the trail never comes within 15 m of it', () => {
    for (const g of north.WALL_GAPS) expect(Math.hypot(g.x - camp.cx, g.z - camp.cz) - camp.r).toBeGreaterThan(20);
    for (const s of north.NORTH_TRAIL) expect(segDist(camp.cx, camp.cz, ...s) - camp.r).toBeGreaterThan(15);
    // no cat crosses the old edge anywhere along the wall but at its gaps
    for (let x = -50; x <= 50; x += 0.5) {
      if (north.WALL_GAPS.some((g) => Math.abs(g.x - x) < 2.2)) continue;
      let open = true;
      for (let z = -50; z >= -56; z -= 0.1) if (!walkable(x, z)) { open = false; break; }
      expect(open, `a way north at x ${x}`).toBe(false);
    }
    // the camp is all on the core, and the wall stands off its edge
    expect(camp.cz - camp.r).toBeGreaterThan(-50);
    for (const c of north.WALL_COLLIDERS) expect(Math.hypot(c.x - camp.cx, c.z - camp.cz) - camp.r - c.r).toBeGreaterThan(1.5);
  });

  it('close the two gaps and the strip cannot be reached: the wall, the tors and the sides seal it', () => {
    const shut = { ...ON.area, colliders: [...ON.area.colliders, ...north.WALL_GAPS.map((g) => ({ x: g.x, z: g.z, r: 2.2 }))] };
    const flood = floodFrom(shut, shut.spawn, (x, z) => isWalkableAt(shut, x, z));
    for (let x = -49.5; x <= 49.5; x += 3) for (const z of [-60, -75, -88]) {
      if (isWalkableAt(shut, x, z)) expect(flood.reaches(x, z), `${x},${z}`).toBe(false);
    }
    expect(flood.reaches(0, -30)).toBe(true);
  });
});

describe('the ground, the hills and the edge reach the new rim', () => {
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
        if (Math.abs(v.z + 60) > 1e-6) continue;
        expect(Math.abs(v.y)).toBeLessThan(1e-9);
        m.set(Math.round(v.x * 100), [col.getX(i), col.getY(i), col.getZ(i), uv.getX(i), uv.getY(i)]);
      }
      return m;
    };
    const a = at(g), c = at(p);
    expect(a.size).toBe(49);
    expect([...c.keys()].sort()).toEqual([...a.keys()].sort());
    for (const [x, va] of a) va.forEach((n, k) => expect(c.get(x)[k], `x ${x / 100} component ${k}`).toBeCloseTo(n, 5));
    const box = new THREE.Box3().setFromObject(p);
    expect(box.min.z).toBeCloseTo(-100, 6);
    expect(box.max.z).toBeCloseTo(-60, 6);
    expect(box.min.x).toBeCloseTo(-60, 6);
    expect(box.max.x).toBeCloseTo(60, 6);
  });

  const outside = (bd, x, z) => Math.max(x - bd.maxX, bd.minX - x, z - bd.maxZ, bd.minZ - z);
  const band = () => ON.scene.children.find((c) => c.name === 'horizonBand');

  it('the hills ring the grown ground: their inner rim is 6 m outside the bounds all round', () => {
    const pos = band().geometry.attributes.position;
    let nearest = Infinity;
    for (let v = 0; v < pos.count; v++) nearest = Math.min(nearest, outside(GROWN, pos.getX(v), pos.getZ(v)));
    expect(nearest).toBeCloseTo(6, 6);
    for (let v = 0; v < pos.count; v++) {
      if (outside(GROWN, pos.getX(v), pos.getZ(v)) <= 15) expect(pos.getY(v)).toBeLessThan(0.31);
    }
    const box = new THREE.Box3().setFromBufferAttribute(pos);
    expect(box.min.z).toBeCloseTo(-156, 5);
    expect(box.max.z).toBeCloseTo(116, 5);
  });

  it('the edge\'s wall and hawthorns moved out with it: none is left where the old edge was', () => {
    const h = { ...moor.MOOR_HORIZON, rect: north.NORTH_BAND_RECT };
    const spots = b.edgeSpots({ ...h.edge, rect: h.rect }, h.salt, h.edge.avoid);
    expect(spots.length).toBeGreaterThan(150);
    for (const s of spots) {
      expect(outside(GROWN, s.x, s.z), `${s.kind} at ${s.x.toFixed(1)},${s.z.toFixed(1)}`).toBeGreaterThanOrEqual(4.5);
    }
    const edge = band().children.find((c) => c.name === 'horizonEdge');
    const pos = edge.geometry.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      const out = outside(GROWN, x, z);
      expect(out, `vertex at ${x.toFixed(1)},${z.toFixed(1)}`).toBeGreaterThan(8);
      if (out <= 11) expect(y).toBeLessThanOrEqual(1.6);
    }
  });

  it('the new far tors stand past the new edge, and the strip\'s stone is one mesh that casts', () => {
    for (const t of north.NEW_FAR_TORS) expect(outside(GROWN, t.x, t.z) - t.r).toBeGreaterThan(1.5);
    const stone = stripKids.find((c) => c.name === 'northStones');
    expect(stone.isMesh).toBe(true);
    const box = new THREE.Box3().setFromObject(stone);
    expect(rig.castsFromBox(box)).toBe(true);
    expect(box.min.y).toBeLessThan(0.05);
  });
});

describe('the strip\'s scatter', () => {
  const tiles = north.NORTH_TILES;
  const all = tiles.map((t) => north.northTileContent(t.index));
  const trees = north.northTrees();
  const lows = all.flatMap((c) => Object.values(c.small).flat());
  const trailGap = (x, z) => Math.min(...north.NORTH_TRAIL.map((s) => segDist(x, z, ...s)));

  it('is the same on every device: a tile\'s content is a pure function of its index', async () => {
    const before = JSON.stringify(all);
    const beds = JSON.stringify([north.northHeather(), north.northGorse()]);
    vi.resetModules();
    vi.stubGlobal('document', canvasStub);
    const again = await import('../src/world/moornorth.js');
    expect(again.northTileContent).not.toBe(north.northTileContent);
    const fresh = [...tiles].reverse().map((t) => again.northTileContent(t.index)).reverse();
    expect(JSON.stringify(fresh)).toBe(before);
    expect(JSON.stringify([again.northHeather(), again.northGorse()])).toBe(beds);
  });

  it('every thing stands on its own tile, off the trail, the wall, the stones and the tarn', () => {
    tiles.forEach((t, i) => {
      for (const p of [...all[i].trees, ...Object.values(all[i].small).flat()]) {
        expect(p.x >= t.minX && p.x <= t.maxX && p.z >= t.minZ && p.z <= t.maxZ, `${p.x},${p.z} on tile ${i}`).toBe(true);
      }
    });
    for (const p of [...lows, ...north.northHeather(), ...north.northGorse()]) {
      expect(trailGap(p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(1.1);
      expect(b.waterClearance([north.TARN], p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(0.4);
      expect(north.STONE_COLLIDERS.every((c) => Math.hypot(p.x - c.x, p.z - c.z) > c.r)).toBe(true);
    }
    for (const t of trees) {
      expect(trailGap(t.x, t.z)).toBeGreaterThanOrEqual(north.NORTH_TRAIL_W / 2 + (t.kind === 'pine' ? 1.3 : 1.6) * t.scale + 0.5);
      for (const c of [...north.WALL_COLLIDERS, ...north.STONE_COLLIDERS, ...north.torColliders()]) {
        expect(Math.hypot(t.x - c.x, t.z - c.z)).toBeGreaterThan(c.r + 2);
      }
    }
  });

  it('is the Moor\'s own kinds, thinner than the core and thinner again toward the rim', () => {
    expect(new Set(trees.map((t) => t.kind))).toEqual(new Set(['thorn', 'pine']));
    for (const t of trees) expect(t.kind === 'pine').toBe(t.x < -42);
    const core = moor.moorTrees();
    const coreTrees = core.thorns.length + core.pines.length;
    expect(trees.length / 4000).toBeLessThan((coreTrees / 10000) * 0.75);
    expect(trees.length / 4000).toBeGreaterThan((coreTrees / 10000) * 0.3);
    // the heather: about half the core's to the square metre, more of it in
    // the near half than the far
    const heather = north.northHeather();
    const coreHeather = moor.moorHeather().length / 10000;
    expect(heather.length / 4000).toBeLessThan(coreHeather * 0.65);
    expect(heather.length / 4000).toBeGreaterThan(coreHeather * 0.3);
    const near = (list) => list.filter((p) => p.z >= -70).length;
    expect(near(heather)).toBeGreaterThan(1.3 * (heather.length - near(heather)));
    const grass = all.flatMap((c) => c.small.tussock);
    expect(grass.length / 4000).toBeLessThan((dress.moorGrass().length / 10000) * 0.75);
    expect(near(grass)).toBeGreaterThan(grass.length - near(grass));
    expect(north.northGorse().length).toBeGreaterThanOrEqual(5);
    for (const kind of ['reed', 'tussock', 'marigold', 'stone']) {
      expect(all.reduce((n, c) => n + c.small[kind].length, 0), kind).toBeGreaterThan(5);
    }
    // no stretch is bare
    for (const c of all) expect(Object.values(c.small).flat().length).toBeGreaterThanOrEqual(8);
  });

  it('every tree, wall stone, tor and standing stone has its collider, and every thorn its Sure Claws fork, from the start of a walk', () => {
    const tail = ON.area.colliders.slice(OFF.area.colliders.length);
    expect(tail).toEqual(north.northColliders().map((c) => ({ x: c.x, z: c.z, r: c.r })));
    trees.forEach((t, i) => {
      expect(tail[i]).toEqual({ x: t.x, z: t.z, r: t.r });
      expect(t.r).toBe(Math.round((t.kind === 'pine' ? 0.4 : 0.5) * t.scale * 100) / 100);
    });
    const thorns = trees.filter((t) => t.kind === 'thorn');
    expect(thorns.length).toBeGreaterThanOrEqual(3);
    const forks = added('perches').slice(0, thorns.length);
    thorns.forEach((t, i) => expect(forks[i]).toMatchObject({ x: t.x, z: t.z, kind: 'tree' }));
  });
});

describe('something to find', () => {
  const walkable = (x, z) => isWalkableAt(ON.area, x, z);
  const flood = floodFrom(ON.area, ON.area.spawn, walkable);

  it('every spot of the strip a cat can stand on is reached from the spawn on foot', () => {
    let standable = 0;
    for (let x = -50; x <= 50; x += 0.5) {
      for (let z = -90; z <= -50; z += 0.5) {
        if (!walkable(x, z)) continue;
        standable++;
        expect(flood.reaches(x, z), `${x},${z}`).toBe(true);
      }
    }
    expect(standable).toBeGreaterThan(0.9 * 201 * 81);
  });

  it('the path finder finds its way from the spawn to each find, each rest and every tile', () => {
    const targets = [
      ...added('collectibles').filter((c) => c.y === undefined), ...added('scenics'), ...ON.area.rests,
      ...north.NORTH_TILES.map((t) => ({ x: (t.minX + t.maxX) / 2, z: (t.minZ + t.maxZ) / 2 })),
    ];
    expect(targets.length).toBe(3 + 1 + 2 + 10);
    for (const t of targets) {
      const way = findPath(walkable, ON.area.bounds, ON.area.spawn, t);
      expect(way, `${t.x},${t.z}`).not.toBeNull();
      const end = way[way.length - 1];
      expect(Math.hypot(end.x - t.x, end.z - t.z), `${t.x},${t.z}`).toBeLessThan(2.5);
    }
  });

  it('nothing to find is under water, and the trail is clear of every collider and dry', () => {
    for (const p of [...added('collectibles'), ...added('scenics'), ...ON.area.rests]) {
      expect(b.waterClearance(ON.area.waters, p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(CAT_RADIUS);
    }
    for (const [x1, z1, x2, z2] of north.NORTH_TRAIL) {
      for (let k = 0; k <= 20; k++) {
        const x = x1 + ((x2 - x1) * k) / 20, z = z1 + ((z2 - z1) * k) / 20;
        expect(b.waterClearance(ON.area.waters, x, z)).toBeGreaterThanOrEqual(north.NORTH_TRAIL_W / 2);
        expect(ON.area.colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + CAT_RADIUS), `trail at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
      }
    }
  });

  it('the trail carries on from the sheep path\'s end, goes through the east gap and ends inside the ring of stones', () => {
    const sheep = dress.SHEEP_PATHS[0];
    expect(north.NORTH_TRAIL[0].slice(0, 2)).toEqual(sheep[sheep.length - 1]);
    north.NORTH_TRAIL.forEach((s, i) => { if (i) expect([s[0], s[1]]).toEqual([north.NORTH_TRAIL[i - 1][2], north.NORTH_TRAIL[i - 1][3]]); });
    const east = north.WALL_GAPS.find((g) => g.id === 'east');
    expect(Math.min(...north.NORTH_TRAIL.map((s) => segDist(east.x, east.z, ...s)))).toBeLessThan(0.01);
    const end = north.NORTH_TRAIL[north.NORTH_TRAIL.length - 1];
    expect(Math.hypot(end[2] - north.STONES_AT.x, end[3] - north.STONES_AT.z)).toBeLessThan(6.5);
    const mesh = stripKids.find((c) => c.name === 'pathTrail');
    expect(mesh.userData.trail.length).toBe(north.NORTH_TRAIL.length);
    expect(stripKids.filter((c) => c.name === 'path' && c.visible === false).length).toBe(north.NORTH_TRAIL.length);
  });

  it('the stone table is a climb: the fallen slab from the grass, then the capstone, which is out of reach from the grass', () => {
    const [stepP, top] = north.NORTH_PERCHES.slice(-2);
    expect(added('perches').slice(-north.NORTH_PERCHES.length)).toEqual([...north.NORTH_PERCHES]);
    let from = null;
    for (let a = 0; a < Math.PI * 2 && !from; a += 0.2) {
      const p = { x: stepP.x + Math.cos(a) * 1.0, z: stepP.z + Math.sin(a) * 1.0 };
      if (walkable(p.x, p.z) && flood.reachesWithin(p.x, p.z, 0.6)) from = p;
    }
    expect(from).not.toBeNull();
    expect(canReach(stepP, from, 0, BASE_CLIMB_BUDGET)).toBe(true);
    expect(canReach(top, stepP, stepP.y, BASE_CLIMB_BUDGET)).toBe(true);
    // from any grass round the table the capstone is too high
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      for (const d of [1.5, 2, 2.5]) {
        const p = { x: top.x + Math.cos(a) * d, z: top.z + Math.sin(a) * d };
        if (walkable(p.x, p.z)) expect(canReach(top, p, 0, BASE_CLIMB_BUDGET)).toBe(false);
      }
    }
    expect(top.vantage).toBe(true);
    expect(top.label).toBe('stone table lookout');
    expect(added('collectibles')[0]).toMatchObject({ id: 'moor-find-6', x: top.x, z: top.z, y: top.y });
    for (const p of north.NORTH_PERCHES) expect(walkable(p.x, p.z)).toBe(false);
    // the two short ring stones are a hop from the grass
    const short = north.NORTH_PERCHES.slice(0, -2);
    expect(short.length).toBe(2);
    for (const p of short) {
      let ok = false;
      for (let a = 0; a < Math.PI * 2 && !ok; a += 0.2) {
        const q = { x: p.x + Math.cos(a) * 1.0, z: p.z + Math.sin(a) * 1.0 };
        ok = walkable(q.x, q.z) && canReach(p, q, 0, BASE_CLIMB_BUDGET);
      }
      expect(ok).toBe(true);
    }
  });

  it('two spots to rest: a hollow to nap in and a stone to drink from, both on dry ground a cat can reach', () => {
    expect(ON.area.rests.map((r) => `${r.id}:${r.kind}:${r.mesh}`)).toEqual(['moor-nap-1:nap:false', 'moor-drink-1:drink:false']);
    for (const r of ON.area.rests) {
      expect(walkable(r.x, r.z), r.id).toBe(true);
      expect(flood.reachesWithin(r.x, r.z, 0.8), r.id).toBe(true);
    }
    const drink = ON.area.rests[1];
    expect(b.waterClearance(ON.area.waters, drink.x, drink.z)).toBeLessThan(1);
    const scene = new THREE.Scene();
    const rests = createRests(scene, []);
    rests.add(ON.area.rests);
    expect(scene.children.length).toBe(0);
    expect(rests.nearest({ x: drink.x + 0.5, z: drink.z }, 1.2)).toMatchObject({ id: 'moor-drink-1', kind: 'drink' });
    expect(rests.nearest({ x: ON.area.rests[0].x, z: ON.area.rests[0].z + 0.4 }, 1.2)).toMatchObject({ id: 'moor-nap-1', kind: 'nap' });
  });

  it('the tarn is water like the core\'s, shallow enough to wade, and the finds are spread over the strip', () => {
    expect(north.TARN.shallow).toBe(1.0);
    expect(ON.area.waterFx.length).toBe(OFF.area.waterFx.length + 1);
    expect(stripKids.some((c) => c.name === 'water:tarn')).toBe(true);
    const finds = [...added('collectibles'), ...added('scenics')];
    for (let i = 0; i < finds.length; i++) for (let j = i + 1; j < finds.length; j++) {
      if (finds[i].y !== undefined || finds[j].y !== undefined) continue;
      expect(Math.hypot(finds[i].x - finds[j].x, finds[i].z - finds[j].z)).toBeGreaterThan(15);
    }
    expect(new Set(added('collectibles').map((c) => north.NORTH_TILES.findIndex((t) => c.x >= t.minX && c.x < t.maxX && c.z >= t.minZ && c.z < t.maxZ))).size).toBe(4);
  });

  it('every new line on screen is plain words, the same in both word sets', () => {
    const lines = () => [
      ...added('collectibles').map((c) => c.label), ...added('scenics').map((c) => c.label), north.NORTH_PERCHES[north.NORTH_PERCHES.length - 1].label,
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

// ---------------------------------------------------------------------------
// The budget with the switch on, as test/striptiles.test.js holds the
// River's (test/helpers/growbudget.js): at the worst place a cat can stand,
// everything always drawn, every slot within its layer's `hide` range in
// full and the stand-ins of everything further. Counted as test/budget.test.js
// counts, merged.
//
//                                         meshes  casters  triangles
//   the Moor today (switch off)               87       47     64,120
//   step 3, at its worst spot (-10, -65),
//     by the standing stones                 113       52     69,309
//   the most meshes anywhere ((0, -55),
//     just past the wall behind the camp)    119       56     68,830
//
// (804 of those triangles everywhere are the ground-edge wall's gorse,
// restored on the grown edge when the branches were combined: builder.js
// edgeSpotsRect had made none.)
//
// The core's heather and gorse (23,100 and 3,596 triangles) are Groups of two
// meshes, which render/striptiles.js draws whole, so they are always drawn:
// most of what the core cannot save. Ceilings: the triangles at the
// territories' 70,000, the meshes and casters about 5% over the measure.
// ---------------------------------------------------------------------------
describe('the budget, switch on: the most the Moor puts on screen at once', () => {
  const CEILING = { meshes: 119, casters: 55, triangles: 70000 };
  const built = buildMoor(true);
  mergeStaticProps(built.scene);
  rig.assignShadowCasters(built.scene);
  const tiles = createStripTiles(built.scene, { strips: built.area.strips.map((s) => ({ ...s, layers: ALL_LAYERS })) });
  tiles.settle(0, 0);
  const m = measureStreams(built.scene, tiles, built.area.strips, rig);
  const worst = worstSpot(m, LAYERS, built.area.bounds, 5);
  const all = [...m.cost.values()].reduce((n, c) => n + c.triangles, 0);

  it(`at the worst spot stays under ${CEILING.meshes} meshes, ${CEILING.casters} casters and ${CEILING.triangles} triangles`, () => {
    if (process.env.BUDGET_LOG) console.log('moor stream budget', JSON.stringify({ fixed: m.fixed, always: m.always, all, worst }));
    expect(worst.meshes, `worst spot meshes: measured ${worst.meshes}, ceiling ${CEILING.meshes}`).toBeLessThanOrEqual(CEILING.meshes);
    expect(worst.casters, `worst spot casters: measured ${worst.casters}, ceiling ${CEILING.casters}`).toBeLessThanOrEqual(CEILING.casters);
    expect(worst.triangles, `worst spot triangles: measured ${worst.triangles}, ceiling ${CEILING.triangles}`).toBeLessThanOrEqual(CEILING.triangles);
    // and it is in the strip's near half, by the stones
    expect(worst.z).toBeLessThan(-50);
  });

  it('nowhere a cat can stand draws more than 125 meshes, 59 casters or 70,000 triangles', () => {
    for (let x = -50; x <= 50; x += 5) {
      for (let z = -90; z <= 50; z += 5) {
        const s = m.at(x, z, LAYERS);
        expect(s.meshes, `${x},${z}`).toBeLessThanOrEqual(125);
        expect(s.casters, `${x},${z}`).toBeLessThanOrEqual(59);
        expect(s.triangles, `${x},${z}`).toBeLessThanOrEqual(70000);
      }
    }
  });

  it('from the spawn, in the south-east, the Moor costs no more than today', () => {
    const here = m.at(moor.SPAWN.x, moor.SPAWN.z, LAYERS);
    expect(here.triangles).toBeLessThan(64120);
    expect(here.meshes).toBeLessThan(87);
  });
});
