import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub, buildRiver as buildArea, fingerprint, fnv, budgetOf, trianglesOf } from './helpers/growriver.js';
import { floodFrom } from './helpers/flood.js';
import { bannedIn, withOffWords } from './helpers/offwords.js';

// Bigger areas, step 3: the Pines and Swamp grown north and west, behind the
// ?grow=1 switch (src/world/pinesstrips.js, pinesnorth.js, pineswest.js;
// docs/superpowers/specs/2026-11-19-bigger-areas-pines.md).
//
// What must not change (the core: every object, draw, collider, fork and
// critter, with the switch off AND on), what the core's streaming means (as
// test/growcore.test.js holds it for the River), what the strips are (their
// own seeds, half the core's scatter, the mire running on through them),
// that every strip spot is walkable back to the spawn, the two landmarks and
// their finds, and the budget at the worst spot a cat can stand.

vi.stubGlobal('document', canvasStub);

const pines = await import('../src/world/pines.js');
const grow = await import('../src/world/pinesstrips.js');
const north = await import('../src/world/pinesnorth.js');
const west = await import('../src/world/pineswest.js');
const b = await import('../src/world/builder.js');
const { setGrow } = await import('../src/grow.js');
const rig = await import('../src/render/rig.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { createStripTiles } = await import('../src/render/striptiles.js');
const { LAYERS, FRAME_TRIANGLES, BUILT, tileDistance } = await import('../src/world/strips.js');
const { coreStreams } = await import('../src/world/streamcore.js');
const { measureStreams, worstSpot, ALL_LAYERS } = await import('./helpers/growbudget.js');
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
const { createWind } = await import('../src/render/wind.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');
const { findOccluders } = await import('../src/fightcam.js');
const { createTreeFade } = await import('../src/treefade.js');
const { islandReeds } = await import('../src/world/island.js');

const build = (on, opts) => buildArea(pines, setGrow, on, opts);
// The first build of a process makes the shared surface textures (and draws
// their uuids); every later one does not. Throw one away so the counts compare.
build(false);
const OFF = build(false);
const ON = build(true);
const CORE = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
const GROWN = { minX: -90, maxX: 50, minZ: -90, maxZ: 50 };
const isStrip = (o) => o.userData.strip !== undefined;
const coreKids = ON.scene.children.filter((c) => !isStrip(c));
const stripKids = ON.scene.children.filter(isStrip);
const isCoreGround = (c) => c.userData.ground && c.geometry?.parameters?.width === 120;
// The core objects meant to reach the strips: the ground (its old north and
// west edges are no edges now), the hills, and the two reaches of the mire.
const reaching = (c) => isCoreGround(c) || ['horizonBand', 'water:mire-north', 'water:mire-west'].includes(c.name);
const tagged = (scene, kind) => scene.children.filter((o) => o.userData.stream === kind);
const inStrips = (x, z) => (x < -50 || z < -50) && x >= -90 && z >= -90 && x <= 50 && z <= 50;

describe('the switch', () => {
  it('off: the Pines is the 100 m square it was, with no strip in its data', () => {
    expect(OFF.area.bounds).toEqual(CORE);
    for (const k of ['core', 'strips', 'rests']) expect(OFF.area[k], k).toBeUndefined();
    expect(OFF.area.waters).toBe(pines.PINES_WATERS);
    expect(OFF.scene.children.some(isStrip)).toBe(false);
    expect(OFF.scene.children.filter((o) => o.userData.stream !== undefined)).toEqual([]);
  });

  it('on: the walkable bounds are the core, the north and west strips and the corner, 140 x 140 m', () => {
    expect(ON.area.bounds).toEqual(GROWN);
    expect(ON.area.core).toEqual(CORE);
    // the core's stream covers the grown rectangle: the strips' scatter streams through it
    expect(ON.area.strips).toEqual([...coreStreams({ areaId: 'pines', rect: GROWN })]);
    expect(ON.area.strips.map((s) => s.id)).toEqual(['core', 'core-fine']);
    expect(grow.NORTH).toMatchObject({ minX: -90, maxX: 50, minZ: -90, maxZ: -50 });
    expect(grow.WEST).toMatchObject({ minX: -90, maxX: -50, minZ: -50, maxZ: 50 });
    expect(grow.NORTH_TILES.length).toBe(14);
    expect(grow.WEST_TILES.length).toBe(10);
  });

  it('the edges are free: the lake, the bay, the island, the bridge, the camp and the border posts are all far from both', () => {
    const near = (x, z) => x < -40 || z < -40;
    const lake = pines.PINES_WATERS.filter((w) => ['lake', 'lake-bay'].includes(w.id));
    for (const w of lake) expect(w.minX > -40 && w.minZ > -40, w.id).toBe(true);
    const isle = pines.PINES_ISLAND;
    expect(near(isle.x - 10, isle.z - 10)).toBe(false);
    expect(near(pines.BRIDGE_FOOT.x, pines.BRIDGE_FOOT.z)).toBe(false);
    // the mire is the one thing that crosses them, and it carries on (below)
    for (const w of pines.PINES_WATERS.filter((v) => v.kind === 'rect')) {
      if (w.id.startsWith('mire')) continue;
      expect(w.minX > -50 && w.minZ > -50, w.id).toBe(true);
    }
  });
});

describe('with the switch on, the core did not move', () => {
  it('the build takes exactly the same Math.random draws', () => {
    expect(ON.draws).toBe(OFF.draws);
  });

  it('the core\'s objects are the same, in the same order, and the strips\' come after them', () => {
    expect(coreKids.length).toBe(OFF.scene.children.length);
    expect(ON.scene.children.slice(0, coreKids.length)).toEqual(coreKids);
    expect(coreKids.map((c) => `${c.type}:${c.name}`)).toEqual(OFF.scene.children.map((c) => `${c.type}:${c.name}`));
  });

  it('every core object is byte-identical, but for the ground, the hills and the two reaches of the mire', () => {
    const differing = [];
    OFF.scene.children.forEach((c, i) => {
      if (fingerprint(c).join('\n') !== fingerprint(coreKids[i]).join('\n')) differing.push(c.name || c.type);
    });
    expect(differing).toEqual(['Mesh', 'horizonBand', 'water:mire-north', 'water:mire-west']);
    expect(isCoreGround(coreKids[OFF.scene.children.findIndex(isCoreGround)])).toBe(true);
  });

  it('the ground differs only where the old north and west edges were (they are no edges now)', () => {
    const g0 = OFF.scene.children.find(isCoreGround), g1 = coreKids.find(isCoreGround);
    const c0 = g0.geometry.attributes.color, c1 = g1.geometry.attributes.color, pos = g0.geometry.attributes.position;
    g0.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    let changed = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(g0.matrixWorld);
      const same = Math.abs(c0.getX(i) - c1.getX(i)) + Math.abs(c0.getY(i) - c1.getY(i)) + Math.abs(c0.getZ(i) - c1.getZ(i)) < 1e-6;
      if (!same) {
        changed++;
        // by the old north or west edge (the strips' pines' shade reaches a few metres in)
        expect(v.x < -44 || v.z < -44, `${v.x},${v.z}`).toBe(true);
      }
    }
    expect(changed).toBeGreaterThan(100);
  });

  it('the scatter lists are what they were', () => {
    const lists = () => JSON.stringify([pines.pinesTrees(), pines.pinesUndergrowth(), pines.pinesReeds(), pines.pinesLilyPads(), pines.pinesFloor()]);
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
    for (const key of ['colliders', 'perches', 'collectibles', 'scenics', 'waterFx']) {
      expect(g[key].length, key).toBeGreaterThan(a[key].length);
      if (key !== 'waterFx') expect(plain(g[key].slice(0, a[key].length)), key).toEqual(plain(a[key]));
    }
    for (const key of ['pois', 'critterSpawns', 'moments', 'puddles', 'spawn', 'boxes', 'tippables', 'keepOut']) {
      expect(JSON.stringify(g[key]), key).toBe(JSON.stringify(a[key]));
    }
    // the waters keep their order; the two mires are the same water, run on out
    expect(g.waters.slice(0, a.waters.length).map((w) => w.id)).toEqual(a.waters.map((w) => w.id));
    for (const [i, w] of a.waters.entries()) {
      if (w.id === 'mire-north') expect(g.waters[i]).toEqual({ ...w, minZ: grow.MIRE_MIN });
      else if (w.id === 'mire-west') expect(g.waters[i]).toEqual({ ...w, minX: grow.MIRE_MIN });
      else expect(g.waters[i]).toBe(w);
    }
    expect(g.waters.slice(a.waters.length)).toEqual([...grow.STRIP_WATERS]);
  });

  it('the core is as many meshes and casters as today, and its triangles differ only in what reaches out', () => {
    const offScene = build(false).scene;
    const onScene = build(true).scene;
    const core = (scene) => scene.children.filter((c) => !isStrip(c));
    const same = (scene) => core(scene).filter((c) => !reaching(c));
    expect(budgetOf(same(onScene), rig)).toEqual(budgetOf(same(offScene), rig));
    mergeStaticProps(offScene);
    mergeStaticProps(onScene);
    const off = budgetOf(offScene.children, rig);
    const on = budgetOf(core(onScene), rig);
    // today's Pines, as test/budget.test.js counts it
    expect(off).toEqual({ meshes: 119, casters: 69, triangles: 68313 }); // 67,403 before the beauty round (pinesbeauty.js, +910, no new mesh)
    expect(on.meshes).toBe(off.meshes);
    expect(on.casters).toBe(off.casters);
    const reach = (scene) => scene.children.filter(reaching).reduce((n, c) => n + trianglesOf(c), 0);
    expect(on.triangles - off.triangles).toBe(reach(onScene) - reach(offScene));
    expect(on.triangles - off.triangles).toBeLessThanOrEqual(1500);
  });
});

// A walk's scene as walk.js makes it, with its strip tiles.
function walkScene({ reducedMotion = false } = {}) {
  const wind = createWind({});
  const { scene, area } = build(true, { wind });
  const decals = createContactShadows(scene);
  mergeStaticProps(scene);
  rig.assignShadowCasters(scene);
  const occluders = findOccluders(scene);
  const fade = createTreeFade([...occluders]);
  const colliders = JSON.stringify(area.colliders);
  const perches = JSON.stringify(area.perches);
  const tiles = createStripTiles(scene, { strips: area.strips, wind, decals, occluders, treeFade: () => fade, reducedMotion });
  return { scene, area, wind, tiles, colliders, perches, occluders };
}
const triples = (geo, n = geo.index ? geo.index.count : geo.attributes.position.count) => {
  const at = (i) => (geo.index ? geo.index.getX(i) : i);
  const out = [];
  for (let i = 0; i < n; i += 3) out.push([at(i), at(i + 1), at(i + 2)].join(','));
  return out.sort();
};
const FAR = 1e5;
const DT = 1 / 60;

describe('the core and the strips, tagged to stream (switch on)', () => {
  it('tags the core\'s swaying pines, ferns, reeds and forest floor, and of the strips their pines and their merged scatter', () => {
    const { near } = pines.pinesTrees();
    const nearStrip = grow.stripPines().filter((p) => p.near);
    const trees = tagged(ON.scene, 'trees');
    expect(trees.map((g) => `${g.position.x},${g.position.z},${g.scale.x}`))
      .toEqual([...near, ...nearStrip].map((t) => `${t.x},${t.z},${t.scale}`));
    expect(trees.filter(isStrip).length).toBe(nearStrip.length);
    expect(tagged(ON.scene, 'small').map((m) => `${m.name}:${m.userData.streamLayer}${isStrip(m) ? '*' : ''}`)).toEqual([
      'ferns:fine', 'reeds:fine', 'forestFloor:small',
      'stripStandTrunks:trees*', 'stripStandFoliage:trees*', 'stripSnags:trees*', 'stripFerns:fine*', 'stripFloor:small*', 'stripReeds:fine*',
    ]);
    // the landmarks, the still stand (its fade reads its index in tree order),
    // the toadstools' Group and what gameplay looks up stay whole
    for (const name of ['pineStand', 'toadstools', 'lilyPads', 'logBridge', 'steppingStones', 'truceStones', 'lightningStump',
      'frogStone', 'fallenPine', 'horizonBand', 'clanCamp', 'islandFerns', 'greatPine', 'greatPineRoots', 'toadstoolRing']) {
      const o = ON.scene.children.find((c) => c.name === name);
      expect(o, name).toBeTruthy();
      expect(o.userData.stream, name).toBeUndefined();
    }
  });

  it('each tagged core thing is the switch-off build\'s, byte for byte, in the same place in the scene', () => {
    let n = 0;
    for (const o of coreKids.filter((c) => c.userData.stream)) {
      const i = ON.scene.children.indexOf(o);
      expect(fingerprint(o)).toEqual(fingerprint(OFF.scene.children[i]));
      n++;
    }
    expect(n).toBe(pines.pinesTrees().near.length + 3);
  });

  it('the island\'s own reeds are no scatter: always drawn, seen across the water', () => {
    const items = pines.pinesReedItems();
    expect(items.length).toBe(pines.pinesReeds().length - islandReeds().length);
    const isle = pines.PINES_ISLAND;
    for (const it of items) expect(Math.hypot(it.x - isle.x, it.z - isle.z)).toBeGreaterThan(5);
  });
});

describe('the streams, in a walk', () => {
  const w = walkScene();
  const runMeshes = () => w.tiles.inventory().runMeshes.map((r) => r.mesh);

  it('a merged scatter mesh keeps every vertex: only its index is reordered, one run a tile, and drawn whole it is every triangle once', () => {
    const meshes = runMeshes();
    expect(meshes.map((m) => m.name).sort()).toEqual(['ferns', 'forestFloor', 'reeds', 'stripFerns', 'stripFloor', 'stripReeds', 'stripSnags', 'stripStandFoliage', 'stripStandTrunks']);
    const fresh = build(true);
    mergeStaticProps(fresh.scene);
    for (const m of meshes) {
      const was = fresh.scene.children.find((c) => c.name === m.name);
      for (const name of Object.keys(was.geometry.attributes)) {
        expect(fnv(m.geometry.attributes[name].array), `${m.name}.${name}`).toBe(fnv(was.geometry.attributes[name].array));
      }
    }
    const g = build(true);
    const big = g.area.strips.map((s) => ({ ...s, layers: ALL_LAYERS }));
    mergeStaticProps(g.scene);
    const t2 = createStripTiles(g.scene, { strips: big });
    t2.settle(0, 0);
    for (const { mesh } of t2.inventory().runMeshes) {
      const was = fresh.scene.children.find((c) => c.name === mesh.name);
      expect(triples(mesh.geometry, mesh.geometry.drawRange.count), mesh.name).toEqual(triples(was.geometry));
    }
    t2.dispose();
  });

  it('with the cat far off, nothing streamed is drawn in full: every tree and every tile is its stand-in', () => {
    w.tiles.settle(FAR, FAR);
    for (const g of tagged(w.scene, 'trees')) expect(g.visible).toBe(false);
    for (const { mesh, always } of w.tiles.inventory().runMeshes) expect(mesh.geometry.drawRange.count / 3, mesh.name).toBe(always);
    expect(w.tiles.standIns.mesh.visible).toBe(true);
    for (const k of w.tiles.standIns.keys()) expect(w.tiles.standIns.shown(k), k).toBe(true);
  });

  it('every strip pine has a far stand-in, none taller than its pine', () => {
    const m = w.tiles.standIns.mesh;
    const pos = m.geometry.attributes.position;
    const tops = new Map();
    for (const p of grow.stripPines()) tops.set(p, 4.3 * p.scale + 0.05);
    let checked = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (!inStrips(x, z)) continue;
      expect(y).toBeLessThan(14.8);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('streaming touches no collider, perch or fight-camera tree, near or far', () => {
    for (const [x, z] of [[-26, 44], [FAR, FAR], [10, -70], [-72, 20]]) {
      w.tiles.settle(x, z);
      expect(JSON.stringify(w.area.colliders)).toBe(w.colliders);
      expect(JSON.stringify(w.area.perches)).toBe(w.perches);
    }
    for (const g of tagged(w.scene, 'trees')) expect(w.occluders.some((o) => o.obj === g)).toBe(true);
  });
});

describe('a walk across the whole grown area and back', () => {
  const w = walkScene();
  const ROUTE = [[-26, 44], [-26, 34], [-36, 6], [-52, 12], [-70, 18], [-86, 40], [-60, 0], [-86, -30], [-70, -70], [-40, -86],
    [-36, -60], [-44, -36], [-35, -30], [-24, -30], [-8, -18], [18, -26], [12.4, -52], [8, -66], [40, -86], [46, -40], [-26, 44]];
  w.tiles.settle(...ROUTE[0]);
  const scales = new Map([...tagged(w.scene, 'trees'), ...w.tiles.inventory().runMeshes.map((r) => r.mesh)].map((o) => [o, o.scale.toArray().join()]));
  let grew = null, gap = null, frames = 0, maxStep = 0;
  for (let i = 1; i < ROUTE.length; i++) {
    const [x0, z0] = ROUTE[i - 1], [x1, z1] = ROUTE[i];
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (8 * DT));
    for (let k = 1; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, z = z0 + ((z1 - z0) * k) / n;
      w.tiles.update(DT, x, z);
      frames++;
      for (const [o, s] of scales) if (o.scale.toArray().join() !== s && !grew) grew = `${o.name} at ${x.toFixed(1)},${z.toFixed(1)}`;
      for (const [st, strip] of w.area.strips.entries()) {
        for (const sl of w.tiles.streamers[st].slots) {
          const key = `${strip.id}|${sl.tile.index}|${sl.layer.id}`;
          if (!w.tiles.standIns.has(key)) continue;
          if ((sl.state === BUILT) === w.tiles.standIns.shown(key) && !gap) gap = `${key} at ${x.toFixed(1)},${z.toFixed(1)}`;
        }
      }
    }
  }
  for (const st of w.tiles.streamers) maxStep = Math.max(maxStep, st.stats.maxFrameTriangles);

  it('never leaves a gap or draws a thing twice: each slot is drawn in full or by its stand-ins, every frame', () => {
    expect(frames).toBeGreaterThan(3000);
    expect(gap).toBeNull();
  });

  it('nothing grows in or moves: a thing appears at its full size in the frame its stand-in goes', () => {
    expect(grew).toBeNull();
  });

  it('spreads its first sight of many tiles over frames: no frame shows more than the budget, but for one slot', () => {
    const slotMost = Math.max(...[...w.tiles.inventory().slots.values()].map((s) => s.runs.reduce((n, r) => n + r.triangles, 0)
      + s.objects.reduce((n, o) => n + trianglesOf(o), 0)));
    expect(maxStep).toBeGreaterThan(0);
    expect(maxStep).toBeLessThanOrEqual(Math.max(FRAME_TRIANGLES, slotMost));
  });

  it('hands every core thing back, shown, for the walk\'s own teardown, and takes its stand-ins away', () => {
    const mesh = w.tiles.standIns.mesh;
    w.tiles.dispose();
    for (const g of tagged(w.scene, 'trees')) expect(g.visible).toBe(true);
    expect(w.scene.children.includes(mesh)).toBe(false);
  });
});

describe('the strips\' still stand fades tree by tree, as the core\'s does', () => {
  const w = walkScene();
  const life = w.area.life({ reducedMotion: false });
  const stand = grow.stripPines().filter((p) => !p.near);
  const meshes = ['stripStandTrunks', 'stripStandFoliage'].map((n) => w.scene.children.find((c) => c.name === n));
  const before = meshes.map((m) => fnv(m.geometry.attributes.position.array));
  // a pine of the stand with open ground east of it
  const p = stand.find((q) => isWalkableAt(w.area, q.x + 4, q.z));
  const i = stand.indexOf(p);
  const camera = new THREE.PerspectiveCamera();
  const run = (frames, cat, camAt) => {
    camera.position.set(...camAt);
    for (let k = 0; k < frames; k++) life.update(1 / 60, 0, cat, camera);
  };

  it('is the area\'s own life, only with the switch on', () => {
    expect(OFF.area.life).toBeUndefined();
    expect(typeof w.area.life).toBe('function');
    expect(p).toBeTruthy();
  });

  it('a pine the camera is in folds away in the stand, and its own see-through copy stands in its place', () => {
    run(30, { x: p.x + 4, y: 0, z: p.z }, [p.x + 0.8, 2.1, p.z]);
    expect(life.faded()).toBe(1);
    for (const m of meshes) {
      const pos = m.geometry.attributes.position;
      const span = pos.count / stand.length;
      for (let v = i * span; v < (i + 1) * span; v++) {
        expect(pos.getX(v)).toBeCloseTo(p.x, 5);
        expect(pos.getY(v)).toBe(0);
        expect(pos.getZ(v)).toBeCloseTo(p.z, 5);
      }
      // and no other pine moved
      expect(pos.getX(((i + 1) % stand.length) * span)).not.toBeCloseTo(p.x, 3);
    }
    const copy = w.scene.children.filter((c) => c.name === 'stripStandFade');
    expect(copy.length).toBe(1);
    expect(copy[0].visible).toBe(true);
    expect(copy[0].position.x).toBe(p.x);
    expect(copy[0].scale.x).toBe(p.scale);
    const ops = [];
    copy[0].traverse((o) => { if (o.isMesh) ops.push([o.material.transparent, o.material.opacity]); });
    // the camera is close: the boughs clear away, the trunk keeps a ghost
    expect(ops).toEqual([[true, 0.05], [true, 0]]);
  });

  it('when the camera moves off, the pine eases back and the stand is as it was, byte for byte', () => {
    run(60, { x: p.x + 4, y: 0, z: p.z }, [p.x + 9, 2.1, p.z]);
    expect(life.faded()).toBe(0);
    expect(meshes.map((m) => fnv(m.geometry.attributes.position.array))).toEqual(before);
    expect(w.scene.children.find((c) => c.name === 'stripStandFade').visible).toBe(false);
  });

  it('a pine between the camera and the cat fades too; one beside the line does not', () => {
    run(30, { x: p.x + 3.5, y: 0, z: p.z }, [p.x - 3.5, 2.1, p.z]);
    expect(life.faded()).toBe(1);
    run(60, { x: p.x + 3.5, y: 0, z: p.z + 9 }, [p.x - 3.5, 2.1, p.z + 9]);
    expect(life.faded()).toBe(0);
  });

  it('gives everything back at the end of the walk', () => {
    run(30, { x: p.x + 4, y: 0, z: p.z }, [p.x + 0.8, 2.1, p.z]);
    life.dispose();
    expect(meshes.map((m) => fnv(m.geometry.attributes.position.array))).toEqual(before);
    expect(w.scene.children.some((c) => c.name === 'stripStandFade')).toBe(false);
  });
});

describe('what a walk reads from the bounds', () => {
  it('the walk\'s seeded spots stay on the core: rain puddles and the clan\'s roam homes are today\'s', () => {
    expect(rainPuddleSpots(ON.area, mulberry32(5))).toEqual(rainPuddleSpots(OFF.area, mulberry32(5)));
    const homes = (area) => {
      const clanArea = { ...area, colliders: Object.freeze(area.colliders.map((c) => ({ ...c }))) };
      return roamHomes('pines', clanArea, clanWalkableFor(clanArea, 'pines'));
    };
    expect(homes(ON.area)).toEqual(homes(OFF.area));
    expect(homes(ON.area).length).toBeGreaterThan(0);
  });

  it('the cat, the map, the grass and the path finder use the grown bounds', () => {
    expect(isWalkableAt(ON.area, 30, -80)).toBe(true);
    expect(isWalkableAt(OFF.area, 30, -80)).toBe(false);
    expect(isWalkableAt(ON.area, 30, -90.5)).toBe(false);
    expect(isWalkableAt(ON.area, -90.5, 30)).toBe(false);
    expect(buildMapLayer(ON.area, ON.scene).edge).toEqual(GROWN);
    const mask = buildGrassMask(ON.area, []);
    expect(mask.at(-83, 44)).toBe(1);
    expect(mask.at(30, -85)).toBe(1);
    expect(mask.at(-95, 44)).toBe(0);
  });

  it('the strips\' pines are on the corner map, each crown where its pine stands', () => {
    const foliage = ON.scene.children.find((c) => c.name === 'stripStandFoliage');
    const stand = grow.stripPines().filter((p) => !p.near);
    expect(foliage.userData.mapCrowns.map((c) => `${c.x},${c.z}`)).toEqual(stand.map((p) => `${p.x},${p.z}`));
  });
});

describe('the ground, the mire and the hills reach the new edges', () => {
  const outside = (bd, x, z) => Math.max(x - bd.maxX, bd.minX - x, z - bd.maxZ, bd.minZ - z);

  it('the strips\' ground is more of the same plane: same material, no seam where they meet, 10 m past the new edges', () => {
    const g = ON.scene.children.find(isCoreGround);
    const patches = ['stripGroundNorth', 'stripGroundWest'].map((n) => ON.scene.children.find((c) => c.name === n));
    for (const p of patches) { expect(p.material).toBe(g.material); expect(p.userData.ground).toBe(true); }
    const box = new THREE.Box3();
    for (const p of patches) box.union(new THREE.Box3().setFromObject(p));
    box.union(new THREE.Box3().setFromObject(g));
    expect(box.min.x).toBeCloseTo(-100, 6);
    expect(box.min.z).toBeCloseTo(-100, 6);
    expect(box.max.x).toBeCloseTo(60, 6);
    expect(box.max.z).toBeCloseTo(60, 6);
    // along each seam the colours and uvs agree vertex for vertex
    const edgeOf = (mesh, axis, value) => {
      const m = new Map();
      mesh.updateMatrixWorld(true);
      const pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color, uv = mesh.geometry.attributes.uv;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        if (Math.abs(v[axis] - value) > 1e-6) continue;
        m.set(Math.round((axis === 'x' ? v.z : v.x) * 100), [col.getX(i), col.getY(i), col.getZ(i), uv.getX(i), uv.getY(i)]);
      }
      return m;
    };
    for (const [mesh, axis, other] of [[patches[1], 'x', 'z'], [patches[0], 'z', 'x']]) {
      const a = edgeOf(g, axis, -60), c = edgeOf(mesh, axis, -60);
      expect(a.size).toBe(49);
      for (const [k, va] of a) if (c.has(k)) va.forEach((n, j) => expect(c.get(k)[j], `${axis} ${other} ${k / 100} ${j}`).toBeCloseTo(n, 5));
      expect([...a.keys()].filter((k) => c.has(k)).length).toBeGreaterThanOrEqual(axis === 'x' ? 48 : 48);
    }
  });

  it('the Black Mire runs on through both strips and under the hills, and a cat cannot walk on it', () => {
    const mn = ON.area.waters.find((w) => w.id === 'mire-north');
    const mw = ON.area.waters.find((w) => w.id === 'mire-west');
    expect(mn.minZ).toBeLessThanOrEqual(-150);
    expect(mw.minX).toBeLessThanOrEqual(-150);
    for (let v = -89; v <= -51; v += 2) {
      expect(isWalkableAt(ON.area, -29.5, v)).toBe(false);
      expect(isWalkableAt(ON.area, v, -8.5)).toBe(false);
    }
    for (const name of ['water:mire-north', 'water:mire-west']) {
      const box = new THREE.Box3().setFromObject(ON.scene.children.find((c) => c.name === name));
      expect(Math.min(box.min.x, box.min.z), name).toBeLessThanOrEqual(-150);
    }
  });

  const band = () => ON.scene.children.find((c) => c.name === 'horizonBand');
  it('the hills ring the grown ground: their inner rim is 6 m outside the bounds all round', () => {
    const pos = band().geometry.attributes.position;
    let nearest = Infinity;
    for (let v = 0; v < pos.count; v++) nearest = Math.min(nearest, outside(GROWN, pos.getX(v), pos.getZ(v)));
    expect(nearest).toBeCloseTo(6, 6);
    for (let v = 0; v < pos.count; v++) if (outside(GROWN, pos.getX(v), pos.getZ(v)) <= 15) expect(pos.getY(v)).toBeLessThan(0.31);
    const box = new THREE.Box3().setFromBufferAttribute(pos);
    expect(box.min.x).toBeCloseTo(-156, 5);
    expect(box.min.z).toBeCloseTo(-156, 5);
    expect(box.max.x).toBeCloseTo(116, 5);
    expect(box.max.z).toBeCloseTo(116, 5);
  });

  it('the edge\'s scrub moved out with it: none is left where the old edges were, none on the water', () => {
    const H = { ...pines.PINES_HORIZON, rect: grow.BAND_RECT };
    const spots = b.edgeSpots({ ...H.edge, rect: H.rect, avoid: ON.area.waters }, H.salt, ON.area.waters);
    expect(spots.length).toBeGreaterThan(120);
    for (const s of spots) expect(outside(GROWN, s.x, s.z), `${s.kind} at ${s.x.toFixed(1)},${s.z.toFixed(1)}`).toBeGreaterThanOrEqual(4.5);
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

describe('the strips\' scatter', () => {
  const tilesOf = (sid) => (sid === 'north' ? grow.NORTH_TILES : grow.WEST_TILES);
  const all = grow.STRIPS.flatMap(({ strip, tiles }) => tiles.map((t) => ({ sid: strip.id, t, c: grow.tileContent(strip.id, t.index) })));
  const trees = grow.stripPines();
  const waterGap = (x, z) => b.waterClearance(ON.area.waters, x, z);
  const trailGap = (x, z) => Math.min(...[...north.NORTH_TRAIL, ...west.WEST_TRAIL].map((s) => segDist(x, z, ...s)));
  const lows = (c) => [...c.ferns, ...c.mushrooms, ...c.moss, ...c.blueberries, ...c.cotton];

  it('is the same on every device: a tile\'s content is a pure function of its strip and index', async () => {
    const before = JSON.stringify(all.map((a) => a.c));
    vi.resetModules();
    vi.stubGlobal('document', canvasStub);
    const again = await import('../src/world/pinesstrips.js');
    expect(again.tileContent).not.toBe(grow.tileContent);
    const fresh = [...all].reverse().map((a) => again.tileContent(a.sid, a.t.index)).reverse();
    expect(JSON.stringify(fresh)).toBe(before);
    expect(grow.tileContent('north', 3)).toBe(grow.tileContent('north', 3));
  });

  it('every thing stands on its own tile, outside the core, dry and off the trails', () => {
    for (const { t, c } of all) {
      for (const p of [...c.pines, ...lows(c), ...c.reeds]) {
        expect(p.x >= t.minX && p.x <= t.maxX && p.z >= t.minZ && p.z <= t.maxZ, `${p.x},${p.z}`).toBe(true);
        expect(inStrips(p.x, p.z), `${p.x},${p.z}`).toBe(true);
      }
      for (const p of lows(c)) {
        expect(waterGap(p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(0.6);
        expect(trailGap(p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(0.9);
      }
      for (const p of c.reeds) expect(b.inWater(ON.area.waters, p.x, p.z)).toBe(false);
    }
    for (const t of trees) {
      expect(waterGap(t.x, t.z)).toBeGreaterThanOrEqual(2.5);
      // the paths' canopy rule, from the trail
      expect(trailGap(t.x, t.z)).toBeGreaterThanOrEqual(north.NORTH_TRAIL_W / 2 + 1.3 * t.scale + 0.5);
      for (const c of [...north.NORTH_COLLIDERS, ...west.WEST_COLLIDERS]) expect(Math.hypot(t.x - c.x, t.z - c.z)).toBeGreaterThan(4);
    }
  });

  it('no two pines crowd, in a tile, across two, or a strip pine and a core pine', () => {
    const { near, stand } = pines.pinesTrees();
    const core = [...near, ...stand];
    trees.forEach((t, i) => {
      for (const u of trees.slice(i + 1)) expect(Math.hypot(t.x - u.x, t.z - u.z)).toBeGreaterThanOrEqual(3.2);
      for (const u of core) expect(Math.hypot(t.x - u.x, t.z - u.z)).toBeGreaterThanOrEqual(3.2);
    });
  });

  it('is the Pines\' own kinds, about half the core\'s to the square metre, thinner toward the rim', () => {
    const { near, stand } = pines.pinesTrees();
    const core = [...near, ...stand];
    // the forest east of the mire: 1.8 pines a 100 m2 in the core, about half that here
    // land, not water, east of the mire: in the core and in the north strip
    const land = (x0, x1, z0, z1, waters) => {
      let n = 0;
      for (let x = x0 + 0.5; x < x1; x += 1) for (let z = z0 + 0.5; z < z1; z += 1) if (!b.inWater(waters, x, z)) n++;
      return n;
    };
    const coreForest = core.filter((p) => p.x > -27).length / land(-27, 50, -50, 50, pines.PINES_WATERS);
    const stripForest = trees.filter((p) => p.x > -27).length / land(-27, 50, -90, -50, ON.area.waters);
    expect(stripForest).toBeGreaterThan(0.35 * coreForest);
    expect(stripForest).toBeLessThan(0.7 * coreForest);
    const nearHalf = (list) => list.filter((p) => grow.rimward(p.x, p.z) < 0.5).length;
    expect(nearHalf(trees)).toBeGreaterThan(trees.length - nearHalf(trees));
    const ferns = grow.stripAll('ferns');
    expect(nearHalf(ferns)).toBeGreaterThan(ferns.length - nearHalf(ferns));
    expect(ferns.every((f) => f.x > -27)).toBe(true);
    const coreFerns = pines.pinesUndergrowth().ferns.length / land(-27, 50, -50, 50, pines.PINES_WATERS);
    const stripFerns = ferns.length / land(-27, 50, -90, -50, ON.area.waters);
    expect(stripFerns).toBeGreaterThan(0.3 * coreFerns);
    expect(stripFerns).toBeLessThan(0.7 * coreFerns);
    for (const kind of ['ferns', 'mushrooms', 'moss', 'blueberries', 'needles', 'cones', 'reeds', 'cotton']) {
      expect(grow.stripAll(kind).length, kind).toBeGreaterThan(8);
    }
    // the swamp keeps its few pines, the forest its many
    expect(trees.filter((p) => p.x <= -27).length).toBeLessThan(trees.filter((p) => p.x > -27).length / 2.5);
  });

  it('every pine has its collider from the start of a walk (a pine has no low fork)', () => {
    const tail = ON.area.colliders.slice(OFF.area.colliders.length);
    const snags = grow.stripSnags();
    expect(tail.length).toBe(trees.length + snags.length + north.NORTH_COLLIDERS.length + west.WEST_COLLIDERS.length);
    trees.forEach((t, i) => {
      expect(tail[i]).toEqual({ x: t.x, z: t.z, r: t.r });
      expect(t.r).toBe(Math.round(0.4 * t.scale * 100) / 100); // the core's rule for a pine
    });
    snags.forEach((t, i) => expect(tail[trees.length + i]).toEqual({ x: t.x, z: t.z, r: 0.25 }));
    expect(snags.length).toBeGreaterThan(5);
    expect(snags.every((t) => t.x <= -27)).toBe(true);
    expect(ON.area.perches.slice(OFF.area.perches.length)).toEqual([...north.NORTH_PERCHES, ...west.WEST_PERCHES]);
  });
});

describe('something to find in each strip', () => {
  const walkable = (x, z) => isWalkableAt(ON.area, x, z);
  const flood = floodFrom(ON.area, ON.area.spawn, walkable);
  const added = (key) => ON.area[key].slice(OFF.area[key].length);

  it('every spot of the strips a cat can stand on is reached from the spawn on foot, and the deep swamp only over a crossing', () => {
    let standable = 0;
    for (let x = -90; x <= 50; x += 0.5) {
      for (let z = -90; z <= 50; z += 0.5) {
        if (!inStrips(x, z) || !walkable(x, z)) continue;
        standable++;
        expect(flood.reaches(x, z), `${x},${z}`).toBe(true);
      }
    }
    expect(standable).toBeGreaterThan(0.85 * (281 * 81 + 81 * 201));
    // take the two decks away: the deep swamp, old and new, is cut off as it was
    const noDecks = { ...ON.area, waters: ON.area.waters.map((w) => ({ ...w, decks: w.id.startsWith('mire') ? [] : w.decks })) };
    const dry = floodFrom(noDecks, ON.area.spawn, (x, z) => isWalkableAt(noDecks, x, z));
    expect(dry.reaches(-60, -30)).toBe(false);
    expect(dry.reaches(-60, -80)).toBe(false);
    expect(dry.reaches(-60, 20)).toBe(true);
    expect(dry.reaches(20, -80)).toBe(true);
  });

  it('the path finder finds its way from the spawn to each find, each rest and every tile', () => {
    const targets = [
      ...added('collectibles').filter((c) => c.y === undefined), ...added('scenics'), ...ON.area.rests,
      ...[...grow.NORTH_TILES, ...grow.WEST_TILES].map((t) => ({ x: (t.minX + t.maxX) / 2, z: (t.minZ + t.maxZ) / 2 })),
    ];
    expect(targets.length).toBe(7 + 2 + 4 + 24);
    for (const t of targets) {
      let goal = t;
      if (!walkable(t.x, t.z)) {
        // a tile's middle may be in the mire or on a pine: the nearest dry spot
        for (let r = 0.5; r < 4 && goal === t; r += 0.5) {
          for (let a = 0; a < 6.28; a += 0.4) if (goal === t && walkable(t.x + r * Math.cos(a), t.z + r * Math.sin(a))) goal = { x: t.x + r * Math.cos(a), z: t.z + r * Math.sin(a) };
        }
      }
      const way = findPath(walkable, ON.area.bounds, ON.area.spawn, goal);
      expect(way, `${t.x},${t.z}`).not.toBeNull();
      const end = way[way.length - 1];
      expect(Math.hypot(end.x - goal.x, end.z - goal.z), `${t.x},${t.z}`).toBeLessThan(2.5);
    }
  });

  it('nothing to find or stand on is under water, and the trails are dry and clear of every trunk', () => {
    const spots = [...added('collectibles'), ...added('scenics'), ...ON.area.rests, ...added('perches')];
    for (const p of spots) expect(b.waterClearance(ON.area.waters, p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(CAT_RADIUS);
    for (const [x1, z1, x2, z2] of [...north.NORTH_TRAIL, ...west.WEST_TRAIL]) {
      for (let k = 0; k <= 20; k++) {
        const x = x1 + ((x2 - x1) * k) / 20, z = z1 + ((z2 - z1) * k) / 20;
        expect(b.waterClearance(ON.area.waters, x, z)).toBeGreaterThanOrEqual(north.NORTH_TRAIL_W / 2);
        expect(ON.area.colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + CAT_RADIUS), `trail at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
      }
    }
  });

  it('each trail leaves a path at its bend and ends by its landmark', () => {
    for (const [trail, end] of [[north.NORTH_TRAIL, north.SPRING], [west.WEST_TRAIL, west.RING]]) {
      const [x0, z0] = trail[0];
      expect(pines.PINES_PATHS.some((s) => (s[0] === x0 && s[1] === z0) || (s[2] === x0 && s[3] === z0))).toBe(true);
      trail.forEach((s, i) => { if (i) expect([s[0], s[1]]).toEqual([trail[i - 1][2], trail[i - 1][3]]); });
      const last = trail[trail.length - 1];
      expect(Math.hypot(last[2] - end.x, last[3] - end.z)).toBeLessThan(5.5);
      expect(inStrips(last[2], last[3])).toBe(true);
    }
    const mesh = stripKids.find((c) => c.name === 'pathTrail');
    expect(mesh.userData.trail.length).toBe(north.NORTH_TRAIL.length + west.WEST_TRAIL.length);
    expect(stripKids.filter((c) => c.name === 'path' && c.visible === false).length).toBe(north.NORTH_TRAIL.length + west.WEST_TRAIL.length);
  });

  it('the Great Pine is a climb: three hops up its long root, each in reach of the last and higher, the first from the needles', () => {
    const chain = north.NORTH_PERCHES;
    expect(chain.length).toBe(3);
    chain.forEach((p, i) => {
      expect(p.kind).toBe('tree');
      expect(p.y).toBeLessThan(1.6); // under Sure Claws' band
      if (i) {
        expect(p.y).toBeGreaterThan(chain[i - 1].y);
        expect(canReach(p, chain[i - 1], chain[i - 1].y, BASE_CLIMB_BUDGET)).toBe(true);
      }
    });
    const low = chain[0];
    let from = null;
    for (let a = 0; a < Math.PI * 2 && !from; a += 0.2) {
      const p = { x: low.x + Math.cos(a) * 1.0, z: low.z + Math.sin(a) * 1.0 };
      if (walkable(p.x, p.z) && flood.reachesWithin(p.x, p.z, 0.6)) from = p;
    }
    expect(from).not.toBeNull();
    expect(canReach(low, from, 0, BASE_CLIMB_BUDGET)).toBe(true);
    const top = chain[2];
    expect(top.vantage).toBe(true);
    expect(top.label).toBe('great pine roots');
    expect(added('collectibles')[0]).toMatchObject({ id: 'pines-find-11', x: top.x, z: top.z, y: top.y });
    for (const p of chain) expect(walkable(p.x, p.z)).toBe(false);
    // the tree towers over the forest: more than twice the tallest pine
    const box = new THREE.Box3().setFromObject(stripKids.find((c) => c.name === 'greatPine'));
    expect(box.max.y).toBeGreaterThan(2 * 4.3 * 1.9 * 0.85);
    expect(box.min.y).toBeLessThan(0.05);
  });

  it('the Toadstool Ring: a ring of twelve round an old stump to sit on, by a bog pool', () => {
    const [stump] = west.WEST_PERCHES;
    expect(stump).toMatchObject({ x: west.RING.x, z: west.RING.z, kind: 'stone', vantage: true });
    expect(stump.label).toBe('old mossy stump');
    let from = null;
    for (let a = 0; a < Math.PI * 2 && !from; a += 0.2) {
      const p = { x: stump.x + Math.cos(a) * 0.95, z: stump.z + Math.sin(a) * 0.95 };
      if (walkable(p.x, p.z) && flood.reachesWithin(p.x, p.z, 0.6)) from = p;
    }
    expect(canReach(stump, from, 0, BASE_CLIMB_BUDGET)).toBe(true);
    const ring = stripKids.find((c) => c.name === 'toadstoolRing');
    const box = new THREE.Box3().setFromObject(ring);
    expect(box.max.x - box.min.x).toBeGreaterThan(5);
    expect(box.max.y).toBeLessThan(0.8);
    expect(ON.area.waters).toContain(west.BOG_POOL);
  });

  it('two spots to rest in each strip: a bed to nap in and a stone to drink from, on dry ground a cat can reach', () => {
    expect(ON.area.rests.map((r) => `${r.id}:${r.kind}:${r.mesh}`)).toEqual([
      'pines-nap-1:nap:false', 'pines-drink-1:drink:false', 'pines-nap-2:nap:false', 'pines-drink-2:drink:false',
    ]);
    for (const r of ON.area.rests) {
      expect(walkable(r.x, r.z), r.id).toBe(true);
      expect(flood.reaches(Math.round(r.x * 2) / 2, Math.round(r.z * 2) / 2) || flood.reachesWithin(r.x, r.z, 0.8), r.id).toBe(true);
    }
    for (const r of ON.area.rests.filter((q) => q.kind === 'drink')) expect(b.waterClearance(ON.area.waters, r.x, r.z)).toBeLessThan(1);
    const scene = new THREE.Scene();
    const rests = createRests(scene, []);
    rests.add(ON.area.rests);
    expect(scene.children.length).toBe(0);
    const [nap1, drink1, nap2] = ON.area.rests;
    expect(rests.nearest({ x: drink1.x + 0.4, z: drink1.z }, 1.2)).toMatchObject({ id: 'pines-drink-1' });
    expect(rests.nearest({ x: nap1.x, z: nap1.z + 0.4 }, 1.2)).toMatchObject({ id: 'pines-nap-1' });
    expect(rests.nearest({ x: nap2.x + 0.3, z: nap2.z }, 1.2)).toMatchObject({ id: 'pines-nap-2' });
  });

  it('four finds in each strip, two of them in the deep swamp past the mire, and a landmark in each', () => {
    const finds = added('collectibles');
    expect(finds.map((c) => c.id)).toEqual(['pines-find-11', 'pines-find-12', 'pines-find-13', 'pines-find-14',
      'pines-find-15', 'pines-find-16', 'pines-find-17', 'pines-find-18']);
    const ids = ON.area.collectibles.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of finds) expect(inStrips(c.x, c.z), c.id).toBe(true);
    expect(finds.filter((c) => c.x < -32 && c.z < -11).length).toBe(2);
    expect(added('scenics').map((s) => s.id)).toEqual(['pines-great-pine', 'pines-toadstool-ring']);
  });

  it('every new line on screen is plain words, the same in both word sets', () => {
    const lines = () => [
      ...added('collectibles').map((c) => c.label), ...added('scenics').map((c) => c.label),
      north.NORTH_PERCHES[2].label, west.WEST_PERCHES[0].label,
    ];
    const on = lines();
    const off = withOffWords(lines);
    expect(on.length).toBe(12);
    expect(off).toEqual(on);
    for (const s of on) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(8);
      expect(s.length).toBeLessThanOrEqual(48);
      expect(bannedIn(s), s).toBeNull();
    }
    expect(new Set(on).size).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// The budget, switch on, counted as test/budget.test.js counts (every mesh a
// draw, a caster by the walk's rule), at the worst spot a cat can stand, every
// slot at its layer's `hide` range (test/helpers/growbudget.js):
//
//                                     meshes  casters  triangles
//   the Pines today (switch off)        119       69     68,313   (67,403 before the beauty round)
//   grown, the worst spot for
//     triangles, (-20, -35) by the
//     mire's east bank                  145       76     67,597   (2,087 of them stand-ins)
//   grown, the most meshes and
//     casters, (-25, -10)               147       80     64,466
//   grown, at the spawn                 125       58     58,593
//
// Ceilings about 5% over the measure, the triangles at the territories'
// 70,000. The 26 meshes over today at the worst spot are the strips' own:
// the ground (2), three waters, the two landmarks (3), the trail and its
// eight hidden data strips (9), the lily pads, the two trail-side pines (4),
// seven merged scatter meshes drawn in runs, and one for all the stand-ins,
// less the core's swaying pines out of range.
// ---------------------------------------------------------------------------
describe('the budget, switch on: the most the Pines puts on screen at once', () => {
  const CEILING = { meshes: 152, casters: 80, triangles: 70000 };
  const MOST = { meshes: 154, casters: 84 };
  const built = build(true);
  mergeStaticProps(built.scene);
  rig.assignShadowCasters(built.scene);
  const tiles = createStripTiles(built.scene, { strips: built.area.strips.map((s) => ({ ...s, layers: ALL_LAYERS })) });
  tiles.settle(0, 0);
  const m = measureStreams(built.scene, tiles, built.area.strips, rig);
  const worst = worstSpot(m, LAYERS, built.area.bounds, 5);
  const all = [...m.cost.values()].reduce((n, c) => n + c.triangles, 0);

  it(`at the worst spot stays under ${CEILING.meshes} meshes, ${CEILING.casters} casters and ${CEILING.triangles} triangles`, () => {
    if (process.env.BUDGET_LOG) console.log('pines stream budget', JSON.stringify({ fixed: m.fixed, always: m.always, all, worst }));
    expect(worst.meshes, `worst spot meshes: measured ${worst.meshes}, ceiling ${CEILING.meshes}`).toBeLessThanOrEqual(CEILING.meshes);
    expect(worst.casters, `worst spot casters: measured ${worst.casters}, ceiling ${CEILING.casters}`).toBeLessThanOrEqual(CEILING.casters);
    expect(worst.triangles, `worst spot triangles: measured ${worst.triangles}, ceiling ${CEILING.triangles}`).toBeLessThanOrEqual(CEILING.triangles);
    // no more than about 35 meshes and casters over today
    expect(worst.meshes - 119).toBeLessThanOrEqual(35);
    expect(worst.casters - 69).toBeLessThanOrEqual(35);
  });

  it(`wherever a cat stands, no more than ${MOST.meshes} meshes and ${MOST.casters} casters`, () => {
    let meshes = 0, casters = 0;
    for (let x = GROWN.minX; x <= GROWN.maxX; x += 5) {
      for (let z = GROWN.minZ; z <= GROWN.maxZ; z += 5) {
        const s = m.at(x, z, LAYERS);
        meshes = Math.max(meshes, s.meshes); casters = Math.max(casters, s.casters);
      }
    }
    expect(meshes, `most meshes: measured ${meshes}, ceiling ${MOST.meshes}`).toBeLessThanOrEqual(MOST.meshes);
    expect(casters, `most casters: measured ${casters}, ceiling ${MOST.casters}`).toBeLessThanOrEqual(MOST.casters);
  });

  it('everything there is, drawn at once, is the core\'s and the strips\' things once each', () => {
    const fresh = build(true);
    mergeStaticProps(fresh.scene);
    const full = budgetOf(fresh.scene.children, rig);
    expect(m.fixed.triangles + m.always + all).toBe(full.triangles);
  });

  it('from the spawn the Pines costs less than today', () => {
    const here = m.at(pines.SPAWN.x, pines.SPAWN.z, LAYERS);
    expect(here.triangles).toBeLessThan(68313);
  });

  it('out in each strip the Pines costs no more than today', () => {
    for (const [x, z] of [[8, -73], [-73, 20], [-70, -70]]) {
      const here = m.at(x, z, LAYERS);
      expect(here.triangles, `${x},${z}`).toBeLessThan(68313);
    }
  });
});
