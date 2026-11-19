import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub, buildRiver, fingerprint, budgetOf, trianglesOf } from './helpers/growriver.js';

// Bigger areas, step 1: the strip tiles as they are drawn (render/striptiles.js),
// on the River's west strip. A walk is simulated frame by frame with the real
// wind, tree fade, contact shadows and caster rule, as game/walk.js wires them.

vi.stubGlobal('document', canvasStub);

const river = await import('../src/world/river.js');
const west = await import('../src/world/riverwest.js');
const { setGrow } = await import('../src/grow.js');
const rig = await import('../src/render/rig.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { createStripTiles, NO_STRIP_TILES, SMALL_KINDS, smallTriangles, smallGeometry, CHUNK, TREE_COST } = await import('../src/render/striptiles.js');
const { LAYERS, FRAME_TRIANGLES, CHECK_EVERY, tileDistance, BUILT, ABSENT } = await import('../src/world/strips.js');
const { measureStreams, worstSpot, ALL_LAYERS } = await import('./helpers/growbudget.js');
const TREES = LAYERS.find((l) => l.id === 'trees');
const SMALL = LAYERS.find((l) => l.id === 'small');
const { createWind } = await import('../src/render/wind.js');
const { createTreeFade } = await import('../src/treefade.js');
const { findOccluders } = await import('../src/fightcam.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');

buildRiver(river, setGrow, false); // the process's first build makes the shared textures

// The fastest a cat goes: the quickest breed's pace (2.2 + 2.8 * 0.8 = 4.44 m/s,
// game/walk.js) times the zoomies' 1.55 (player.js) is 6.9 m/s. Tested at 8.
const ZOOMIES = 8;
const DT = 1 / 60;
// How long a tile's layer may be in range and not yet drawn.
const MAX_UNBUILT = 0.5;

const isTile = (o) => o.userData.stripTile !== undefined;
const ALL = [{ id: 'small', show: 1e9, hide: 2e9 }, { id: 'trees', show: 1e9, hide: 2e9 }];

// A walk's scene as walk.js has it when the strip tiles are made: built,
// decals scanned, props merged, casters swept, tree fade made. These tests
// are the machinery on the west strip, so the south strip (step 3,
// riversouth.js) is built but not streamed here; test/riversouth.test.js
// walks it. The budget below counts both.
function walkScene({ layers } = {}) {
  const wind = createWind({});
  const { scene, area } = buildRiver(river, setGrow, true, { wind });
  const decals = createContactShadows(scene);
  mergeStaticProps(scene);
  rig.assignShadowCasters(scene);
  const occluders = findOccluders(scene);
  const fade = createTreeFade([...occluders]);
  const streamed = area.strips.filter((s) => s.id !== 'south');
  area.strips = streamed;
  const strips = layers ? streamed.map((s) => ({ ...s, layers })) : streamed;
  const tiles = createStripTiles(scene, { strips, wind, decals, occluders, treeFade: () => fade });
  return { scene, area, wind, decals, occluders, fade, tiles };
}

// Geometries and materials in the scene.
function resources(scene) {
  const geos = new Set(), mats = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    geos.add(o.geometry);
    for (const m of [].concat(o.material)) mats.add(m);
  });
  return { geos, mats };
}

describe('a tile, built', () => {
  it('with no strips there is nothing to do', () => {
    expect(createStripTiles(new THREE.Scene(), { strips: [] })).toBe(NO_STRIP_TILES);
    expect(() => { NO_STRIP_TILES.update(0.016, 0, 0); NO_STRIP_TILES.settle(0, 0); NO_STRIP_TILES.dispose(); }).not.toThrow();
  });

  it('is identical every time it is built: same vertices, same colours, same uuids, and no Math.random draw', () => {
    const real = Math.random;
    let draws = 0;
    const built = () => {
      const w = walkScene({ layers: ALL });
      Math.random = () => { draws++; return real(); };
      try { w.tiles.settle(0, 0); } finally { Math.random = real; }
      const tiles = w.scene.children.filter(isTile);
      return {
        prints: tiles.map((o) => `${o.userData.stripTile}:${fingerprint(o).join(';')}`),
        uuids: tiles.map((o) => o.uuid),
        w,
      };
    };
    const a = built(), c = built();
    expect(draws).toBe(0);
    expect(a.prints.length).toBe(west.westTrees().length + 10);
    expect(c.prints).toEqual(a.prints);
    expect(c.uuids).toEqual(a.uuids);
    // and dropping and rebuilding during a walk gives the same again
    a.w.tiles.dispose();
    expect(a.w.scene.children.filter(isTile)).toEqual([]);
  });

  it('the small layer is one mesh a tile, on one shared material, and casts nothing', () => {
    const w = walkScene({ layers: ALL });
    w.tiles.settle(0, 0);
    const small = w.scene.children.filter((o) => o.name === 'stripSmall');
    expect(small.length).toBe(10);
    expect(new Set(small.map((m) => m.material)).size).toBe(1);
    for (const m of small) {
      expect(m.isMesh).toBe(true);
      expect(m.castShadow).toBe(false);
      expect(m.userData.noCast).toBe(true);
      const content = west.westTileContent(m.userData.stripTile).small;
      expect(trianglesOf(m)).toBe(smallTriangles(content));
      // every vertex is on its tile (a reed may lean a little past the line)
      const t = west.WEST_TILES[m.userData.stripTile];
      const box = new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position);
      expect(box.min.x).toBeGreaterThan(t.minX - 1);
      expect(box.max.x).toBeLessThan(t.maxX + 1);
      expect(box.min.z).toBeGreaterThan(t.minZ - 1);
      expect(box.max.z).toBeLessThan(t.maxZ + 1);
      // nothing floats or is buried, and nothing is taller than a cattail
      expect(box.min.y).toBeGreaterThanOrEqual(-0.2);
      expect(box.min.y).toBeLessThanOrEqual(0.03);
      expect(box.max.y).toBeLessThanOrEqual(1.35);
      // the culling sphere holds it
      const s = m.geometry.boundingSphere;
      const pos = m.geometry.attributes.position;
      for (let v = 0; v < pos.count; v += 7) {
        expect(Math.hypot(pos.getX(v) - s.center.x, pos.getY(v) - s.center.y, pos.getZ(v) - s.center.z)).toBeLessThanOrEqual(s.radius);
      }
    }
  });

  it('each kind writes exactly the triangles it says, with unit normals and real colours', () => {
    const item = { reed: { x: 1, z: 2 }, tussock: { x: 1, z: 2, h: 0.3, s: 1 }, cattail: { x: 1, z: 2, h: 1.2 }, marigold: { x: 1, z: 2, s: 1 }, stone: { x: 1, z: 2, r: 0.2 } };
    for (const [kind, K] of Object.entries(SMALL_KINDS)) {
      const g = smallGeometry({ [kind]: [item[kind], { ...item[kind], x: 4 }] }, 733);
      expect(g.attributes.position.count, kind).toBe(2 * K.triangles * 3);
      const n = g.attributes.normal, c = g.attributes.color, p = g.attributes.position;
      for (let v = 0; v < n.count; v++) {
        expect(Math.hypot(n.getX(v), n.getY(v), n.getZ(v))).toBeCloseTo(1, 5);
        for (const ch of [c.getX(v), c.getY(v), c.getZ(v)]) { expect(ch).toBeGreaterThan(0); expect(ch).toBeLessThanOrEqual(1); }
        expect(Number.isFinite(p.getX(v) + p.getY(v) + p.getZ(v))).toBe(true);
      }
      expect(K.triangles).toBeLessThanOrEqual(CHUNK);
    }
  });

  it('a strip tree is a core tree: merged to a mesh per material, casting, swaying, fading, with its decal', () => {
    const w = walkScene({ layers: ALL });
    const before = { occluders: w.occluders.length, decals: w.decals.staticCount };
    w.tiles.settle(0, 0);
    const trees = w.scene.children.filter((o) => isTile(o) && o.userData.occluder);
    const spots = west.westTrees();
    expect(trees.length).toBe(spots.length);
    // the core's own trees, by kind, for comparison
    const coreMeshes = (name) => {
      const g = w.scene.children.find((o) => !isTile(o) && o.userData.occluder && (name === 'willow') === !!o.getObjectByName('willowCurtain') && o.name !== 'oldWillow');
      let n = 0; g.traverse((o) => { if (o.isMesh) n++; });
      return n;
    };
    for (const g of trees) {
      const willow = !!g.getObjectByName('willowCurtain');
      const meshes = [];
      g.traverse((o) => { if (o.isMesh) meshes.push(o); });
      expect(meshes.length).toBe(coreMeshes(willow ? 'willow' : 'alder'));
      for (const m of meshes) { expect(m.castShadow).toBe(true); expect(m.receiveShadow).toBe(true); }
      expect(trianglesOf(g)).toBeLessThanOrEqual(TREE_COST[willow ? 'willow' : 'alder']);
      expect(w.scene.children.includes(g)).toBe(true); // top level, as the core's are
    }
    expect(w.occluders.length).toBe(before.occluders + trees.length);
    expect(w.decals.staticCount).toBe(before.decals + trees.length);
    // the wind sways it
    w.wind.update(3.3);
    expect(trees.some((g) => g.rotation.z !== 0)).toBe(true);
    // the fade takes it: a camera inside a strip tree's crown fades that tree
    const g = trees[0];
    const cam = { position: new THREE.Vector3(g.position.x + 0.3, 2.6 * g.scale.x, g.position.z) };
    for (let f = 0; f < 30; f++) w.fade.update(DT, cam, { x: g.position.x + 3, y: 0.6, z: g.position.z });
    expect(w.fade.faded().has(g)).toBe(true);
    // and all of it goes when the tile goes
    w.tiles.dispose();
    expect(w.occluders.length).toBe(before.occluders);
    expect(w.decals.staticCount).toBe(before.decals);
    expect(w.fade.faded().has(g)).toBe(false);
    w.wind.update(7.1);
    expect(g.rotation.z).toBe(0);
    expect(g.parent).toBeNull();
  });

  it('every drawn trunk has its collider and every strip collider its trunk', () => {
    const w = walkScene({ layers: ALL });
    w.tiles.settle(0, 0);
    const drawn = w.scene.children.filter((o) => isTile(o) && o.userData.occluder);
    const colliders = west.westTreeColliders();
    const inArea = w.area.colliders;
    expect(drawn.length).toBe(colliders.length);
    const box = new THREE.Box3();
    for (const g of drawn) {
      const c = colliders.filter((q) => q.x === g.position.x && q.z === g.position.z);
      expect(c.length, `a collider at ${g.position.x},${g.position.z}`).toBe(1);
      expect(inArea.some((q) => q.x === c[0].x && q.z === c[0].z && q.r === c[0].r)).toBe(true);
      // the trunk (everything below a metre) stands inside the circle
      g.updateMatrixWorld(true);
      let trunkR = 0;
      g.traverse((o) => {
        if (!o.isMesh) return;
        const p = o.geometry.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          if (v.y < 1) trunkR = Math.max(trunkR, Math.hypot(v.x - g.position.x, v.z - g.position.z));
        }
      });
      expect(trunkR).toBeGreaterThan(0.2);
      expect(trunkR).toBeLessThanOrEqual(c[0].r);
      box.setFromObject(g);
      expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(box.min.y).toBeLessThan(0.02);
    }
    for (const c of colliders) expect(drawn.some((g) => g.position.x === c.x && g.position.z === c.z)).toBe(true);
  });
});

// The walk: from the far east of the core, west along the trail to the rim, and back.
const ROUTE = [[50, 40], [4, 30], [-6, 23.6], [-46, 23.5], [-61.5, 19], [-80, 14], [-88, 6]];
function* walkOutAndBack(speed) {
  const pts = [...ROUTE, ...[...ROUTE].reverse().slice(1)];
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (speed * DT)));
    for (let k = 1; k <= n; k++) yield [x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n];
  }
}

describe('a walk out to the west rim and back, at the zoomies', () => {
  const w = walkScene();
  const base = resources(w.scene);
  const baseKids = w.scene.children.length;
  const streamer = w.tiles.streamers[w.area.strips.findIndex((s) => s.id === 'west')];
  // every slot of every stream: drawn in full, or its stand-ins are (step 2)
  const allSlots = w.tiles.streamers.flatMap((st, i) => st.slots.map((sl) => ({ sl, key: `${w.area.strips[i].id}|${sl.tile.index}|${sl.layer.id}` })))
    .filter(({ key }) => w.tiles.standIns.has(key));
  let gap = null;
  const made = new Set();
  let freed = 0;
  let worstUnbuilt = 0;
  let peak = { tiles: 0, small: 0, trees: 0 };
  let rimSmall = -1;
  const sinceInRange = new Map(streamer.slots.map((s) => [s, 0]));
  let wrongState = null;
  let frames = 0;

  // nothing is in range at the start: the strip's near edge is 100 m off
  w.tiles.update(DT, ...ROUTE[0]);
  const startTiles = w.scene.children.filter(isTile).length;

  for (const [x, z] of walkOutAndBack(ZOOMIES)) {
    w.tiles.update(DT, x, z);
    w.wind.update(frames * DT);
    frames++;
    for (const s of streamer.slots) {
      const d = tileDistance(s.tile, x, z);
      const t = d < s.layer.show ? sinceInRange.get(s) + DT : 0;
      sinceInRange.set(s, t);
      if (s.state !== BUILT && t > worstUnbuilt) worstUnbuilt = t;
      // past `hide` it is gone by the next look
      if (d > s.layer.hide + ZOOMIES * (CHECK_EVERY + DT) && s.state !== ABSENT) wrongState = `${s.layer.id}:${s.tile.index} at ${x.toFixed(1)},${z.toFixed(1)}`;
    }
    for (const { sl, key } of allSlots) {
      if (sl.state !== BUILT && !w.tiles.standIns.shown(key) && !gap) gap = `${key} at ${x.toFixed(1)},${z.toFixed(1)}`;
      if (sl.state === BUILT && w.tiles.standIns.shown(key) && !gap) gap = `${key} doubled at ${x.toFixed(1)},${z.toFixed(1)}`;
    }
    const now = w.scene.children.filter(isTile);
    for (const o of now) {
      o.traverse((m) => {
        if (!m.isMesh || made.has(m.geometry)) return;
        made.add(m.geometry);
        m.geometry.addEventListener('dispose', () => { freed++; });
      });
    }
    const small = now.filter((o) => o.name === 'stripSmall').length;
    if (now.length > peak.tiles) peak = { tiles: now.length, small, trees: now.length - small };
    if (Math.abs(x + 88) < 0.01 && Math.abs(z - 6) < 0.01) rimSmall = small;
  }

  it('starts with nothing drawn, draws the whole strip on the way, and drops the near things again', () => {
    expect(startTiles).toBe(0);
    // at the rim every tile is within the small layer's 38 m but a far corner's or two
    expect(rimSmall).toBeGreaterThanOrEqual(8);
    expect(peak.trees).toBe(west.westTrees().length);
    // back at the start (100 m from the strip): no small layer is left, and the
    // only trees left are on tiles still inside the trees' hide range
    const left = w.scene.children.filter(isTile);
    expect(left.filter((o) => o.name === 'stripSmall')).toEqual([]);
    const [x, z] = ROUTE[0];
    for (const o of left) expect(tileDistance(west.WEST_TILES[o.userData.stripTile], x, z)).toBeLessThanOrEqual(TREES.hide);
    expect(wrongState).toBeNull();
  });

  it('never leaves a gap: every slot, core or strip, is drawn in full or by its stand-ins, never both, every frame', () => {
    expect(allSlots.length).toBeGreaterThan(100);
    expect(gap).toBeNull();
  });

  it('never builds more in one frame than the budget', () => {
    expect(streamer.stats.maxFrameTriangles).toBeGreaterThan(0);
    expect(streamer.stats.maxFrameTriangles).toBeLessThanOrEqual(FRAME_TRIANGLES);
    // and the budget is small beside what is on screen: under 3% of the River
    expect(FRAME_TRIANGLES).toBeLessThanOrEqual(0.03 * 63778);
  });

  it(`never leaves a tile in range undrawn for longer than ${MAX_UNBUILT} s`, () => {
    expect(worstUnbuilt).toBeGreaterThan(0);
    expect(worstUnbuilt).toBeLessThanOrEqual(MAX_UNBUILT);
    // and at the zoomies a strip's small things are still well out when they
    // take over from their stand-ins
    expect(SMALL.show - ZOOMIES * MAX_UNBUILT).toBeGreaterThanOrEqual(25);
  });

  it('frees what it drops: every geometry made on the walk is disposed once the strip tiles are', () => {
    expect(made.size).toBeGreaterThan(30);
    const stillThere = w.scene.children.filter(isTile).reduce((n, o) => { o.traverse((m) => { if (m.isMesh) n++; }); return n; }, 0);
    expect(freed).toBe(made.size - stillThere);
    const mats = new Set();
    w.scene.children.filter(isTile).forEach((o) => o.traverse((m) => { if (m.isMesh) [].concat(m.material).forEach((q) => mats.add(q)); }));
    let matsFreed = 0;
    for (const m of mats) if (m !== w.tiles.material) m.addEventListener('dispose', () => { matsFreed++; });
    w.tiles.dispose();
    expect(freed).toBe(made.size);
    expect(matsFreed).toBe([...mats].filter((m) => m !== w.tiles.material).length);
    // the scene is what it was before the walk, but for the stand-ins' one
    // mesh, which goes with the strip tiles (the core's things stay for the
    // walk's own teardown)
    const after = resources(w.scene);
    expect(w.scene.children.length).toBe(baseKids - 1);
    expect(after.geos.size).toBe(base.geos.size - 1);
    expect(after.mats.size).toBe(base.mats.size - 1);
    expect(w.scene.children.includes(w.tiles.standIns.mesh)).toBe(false);
    // (the contact shadows remake their one static mesh when a decal comes or goes)
    w.scene.traverse((o) => { if (o.isMesh && !o.userData.contactDecal) expect(base.geos.has(o.geometry)).toBe(true); });
    expect(w.tiles.stats).toMatchObject({ geometries: 0, materials: 0, meshes: 0, triangles: 0, casters: 0, trees: 0, smallTiles: 0 });
  });
});

describe('with nearer ranges, walking away alone brings the scene back', () => {
  it('everything built is dropped and freed by the time the cat is back in the east', () => {
    const w = walkScene({ layers: [{ id: 'small', show: 25, hide: 32 }, { id: 'trees', show: 45, hide: 55 }] });
    const base = resources(w.scene);
    let most = 0;
    for (const [x, z] of walkOutAndBack(ZOOMIES)) {
      w.tiles.update(DT, x, z);
      most = Math.max(most, w.scene.children.filter(isTile).length);
    }
    expect(most).toBeGreaterThan(10);
    expect(w.scene.children.filter(isTile)).toEqual([]);
    const after = resources(w.scene);
    expect(after.geos.size).toBe(base.geos.size);
    expect(after.mats.size).toBe(base.mats.size);
    const ws = w.tiles.streamers[w.area.strips.findIndex((s) => s.id === 'west')];
    expect(ws.stats.dropped).toBe(ws.stats.built);
  });
});

// ---------------------------------------------------------------------------
// The budget with the switch on. test/budget.test.js holds the River's
// whole-scene ceilings as they are (the build with the switch off). With the
// switch on, the scatter of the core and of the strip is drawn only near the
// cat (world/streamcore.js), so the River is held to a different measure: at
// the worst place a cat can stand, everything that is always drawn, plus
// every slot within its layer's `hide` range (the most the hysteresis
// allows) in full, plus the stand-ins of everything further
// (test/helpers/growbudget.js). Counted as test/budget.test.js counts (every
// mesh a draw, hidden data strips included; a caster by the walk's rule),
// merged.
//
//                                meshes  casters  triangles
//   the River today (switch off)    170      133     63,778
//   step 1 (west strip, 40 m), at
//     its worst spot                225      166     79,307   (everything: no
//                                                              range saved any)
//   step 2 (this), at its worst
//     spot, (-35, 0) by the reedbed 205      147     68,745   (2,414 of them
//                                                              stand-ins)
//
// Step 2 drew 79,307 triangles' worth of things in all, exactly step 1's
// (the first test below held that); what it saves is what is out of range.
// Its 35 meshes over today are the strip's: 13 trees (32 meshes) and its
// standing things (13, 8 of them hidden data strips never drawn), less the
// core's trees out of range, plus one for all the stand-ins. Ceilings: the
// triangles at the territories' 70,000, the rest about 5% over the measure.
//
// Step 3 (the south strip, riversouth.js) is counted here too, as the River
// is built with it:
//
//   step 3, core + west + south,
//     at its worst spot, (-35, 0)   212      148     69,592   (4,027 of them
//                                                              stand-ins)
//
// Everything at once is now 84,011: step 2's 79,307, less 1,058 for the west
// strip's ground on a 5 m grid, 918 for its fewer, bigger tussocks and 474
// for the hills drawn a little coarser, plus 36 more mist over the longer
// river, plus the south strip's 7,118 (1,438 always drawn: its ground, pool,
// paint, trail and sand bank; 2,212 of trees and 3,468 of small things that
// stream). test/riversouth.test.js pins the same worst spot.
// ---------------------------------------------------------------------------
describe('the budget, switch on: the most the River puts on screen at once', () => {
  const CEILING = { meshes: 222, casters: 155, triangles: 70000 };
  // the built and merged scene alone, as test/budget.test.js measures (no decals)
  const built = buildRiver(river, setGrow, true);
  mergeStaticProps(built.scene);
  rig.assignShadowCasters(built.scene);
  const tiles = createStripTiles(built.scene, { strips: built.area.strips.map((s) => ({ ...s, layers: ALL_LAYERS })) });
  tiles.settle(0, 0);
  const m = measureStreams(built.scene, tiles, built.area.strips, rig);
  const worst = worstSpot(m, LAYERS, built.area.bounds, 5);
  const all = [...m.cost.values()].reduce((n, c) => n + c.triangles, 0);

  it('everything there is, drawn at once, is what it is with nothing streamed: nothing lost, nothing twice', () => {
    if (process.env.BUDGET_LOG) console.log('stream budget', JSON.stringify({ fixed: m.fixed, always: m.always, all, worst }));
    expect(m.fixed.triangles + m.always + all).toBe(84011);
    // and it is the whole scene's own count, every tile built, but for the stand-ins
    expect(m.fixed.triangles + m.always + all).toBe(budgetOf(built.scene.children.filter((c) => c !== tiles.standIns.mesh), rig).triangles);
  });

  it(`at the worst spot stays under ${CEILING.meshes} meshes, ${CEILING.casters} casters and ${CEILING.triangles} triangles`, () => {
    expect(worst.meshes).toBeLessThanOrEqual(CEILING.meshes);
    expect(worst.casters).toBeLessThanOrEqual(CEILING.casters);
    expect(worst.triangles).toBeLessThanOrEqual(CEILING.triangles);
    // the ceilings bite: within 8% of the measure
    expect(worst.meshes).toBeGreaterThan(CEILING.meshes * 0.92);
    expect(worst.casters).toBeGreaterThan(CEILING.casters * 0.92);
    expect(worst.triangles).toBeGreaterThan(CEILING.triangles * 0.92);
    // and it is by the reedbed, the River's densest stand
    expect(worst.x).toBeLessThanOrEqual(-20);
  });

  it('the stand-ins are cheap: all of them, every tree and small thing at once, are a fifth of what they stand in for, and the trees a quarter', () => {
    const standIns = [...m.standIn.values()].reduce((n, c) => n + c, 0);
    expect(standIns).toBeGreaterThan(5000);
    expect(standIns).toBeLessThan(0.21 * all);
    const trees = [...m.standIn].filter(([k]) => k.endsWith('|trees')).reduce((n, [, c]) => n + c, 0);
    const treesFull = [...m.cost].filter(([k]) => k.endsWith('|trees')).reduce((n, [, c]) => n + c.triangles, 0);
    expect(trees).toBeLessThan(0.25 * treesFull);
  });

  it('from the spawn, in the east, the River costs less than today', () => {
    const here = m.at(river.SPAWN.x, river.SPAWN.z, LAYERS);
    expect(here.triangles).toBeLessThan(63778);
    expect(here.meshes).toBeLessThan(170);
  });
});
