import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub, buildRiver, fingerprint, fnv } from './helpers/growriver.js';

// Bigger areas, step 2 ("the 65 m approach", world/streamcore.js): with the
// switch on, the River's frozen core streams its scatter like a strip. These
// hold what must not change (every item exactly where, how big and what
// colour it is; every collider, fork and critter), what streaming means (one
// draw a merged mesh, a stand-in wherever a thing is not drawn in full) and
// the walk-time rules (no gap, no grow-in, the frame budget, the teardown).
// An area agent streaming its own core copies these for its area.

vi.stubGlobal('document', canvasStub);

const river = await import('../src/world/river.js');
const { setGrow } = await import('../src/grow.js');
const rig = await import('../src/render/rig.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { createStripTiles } = await import('../src/render/striptiles.js');
const { LAYERS, FRAME_TRIANGLES, BUILT, tileDistance } = await import('../src/world/strips.js');
const { coreStreams, CORE_TILE, FINE_TILE } = await import('../src/world/streamcore.js');
const { createWind } = await import('../src/render/wind.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');
const { findOccluders } = await import('../src/fightcam.js');
const { createTreeFade } = await import('../src/treefade.js');

buildRiver(river, setGrow, false); // the process's first build makes the shared textures

const DT = 1 / 60;
const FAR = 1e5; // a cat this far off has nothing in range

// A walk's scene as walk.js makes it, with its strip tiles.
function walkScene({ reducedMotion = false } = {}) {
  const wind = createWind({});
  const { scene, area } = buildRiver(river, setGrow, true, { wind });
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
const tagged = (scene, kind) => scene.children.filter((o) => o.userData.stream === kind);
// a geometry's triangles as vertex-index triples (a geometry with no index
// draws its vertices in order)
const triples = (geo, n = geo.index ? geo.index.count : geo.attributes.position.count) => {
  const at = (i) => (geo.index ? geo.index.getX(i) : i);
  const out = [];
  for (let i = 0; i < n; i += 3) out.push([at(i), at(i + 1), at(i + 2)].join(','));
  return out.sort();
};

describe('the River\'s core, tagged to stream (switch on)', () => {
  const OFF = buildRiver(river, setGrow, false);
  const ON = buildRiver(river, setGrow, true);

  it('tags its scatter trees, its reeds and its marsh dressing, and nothing else', () => {
    const { willows, alders, pines } = river.riverTrees();
    const trees = tagged(ON.scene, 'trees');
    expect(trees.length).toBe(willows.length + alders.length + pines.length);
    expect(trees.map((g) => `${g.position.x},${g.position.z},${g.scale.x}`))
      .toEqual([...willows, ...alders, ...pines].map((t) => `${t.x},${t.z},${t.scale}`));
    expect(tagged(ON.scene, 'small').map((m) => `${m.name}:${m.userData.streamLayer}`)).toEqual(['reeds:fine', 'dressing:small']);
    // the landmarks and what gameplay looks up stay whole
    for (const name of ['oldWillow', 'logBridge', 'steppingStones', 'lilyPads', 'groundPaint', 'horizonBand', 'clanCamp']) {
      const o = ON.scene.children.find((c) => c.name === name);
      expect(o, name).toBeTruthy();
      expect(o.userData.stream, name).toBeUndefined();
    }
    // and with the switch off nothing is tagged at all
    expect(OFF.scene.children.filter((o) => o.userData.stream !== undefined)).toEqual([]);
    expect(OFF.area.strips).toBeUndefined();
  });

  it('each tagged thing is the switch-off build\'s, byte for byte, in the same place in the scene', () => {
    for (const o of ON.scene.children.filter((c) => c.userData.stream)) {
      const i = ON.scene.children.indexOf(o);
      expect(fingerprint(o)).toEqual(fingerprint(OFF.scene.children[i]));
    }
  });

  it('the core\'s content (every tree, reed and dressing item, every collider and fork) is the switch-off list', () => {
    const lists = (area) => JSON.stringify({
      trees: river.riverTrees(), reeds: river.riverReeds(), dress: river.riverDressItems(),
      colliders: area.colliders.slice(0, OFF.area.colliders.length), perches: area.perches.slice(0, OFF.area.perches.length),
      critters: area.critterSpawns,
    });
    expect(lists(ON.area)).toBe(lists(OFF.area));
  });

  it('streams in two parts: a 10 m cut for trees and small things and a 5 m one for the fine reedbed, first in the strips', () => {
    const [core, fine, westStrip] = ON.area.strips;
    expect(core).toMatchObject({ id: 'core', prebuilt: true, layerIds: ['small', 'trees'] });
    expect(fine).toMatchObject({ id: 'core-fine', prebuilt: true, layerIds: ['fine'] });
    expect(westStrip.id).toBe('west');
    expect(core.tiles.length).toBe((100 / CORE_TILE) ** 2);
    expect(fine.tiles.length).toBe((100 / FINE_TILE) ** 2);
    expect(coreStreams({ areaId: 'river', rect: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } })).toEqual([core, fine]);
  });
});

describe('the core, streamed in a walk', () => {
  const OFF = buildRiver(river, setGrow, false);
  const w = walkScene();
  const runMeshes = () => w.tiles.inventory().runMeshes.map((r) => r.mesh);

  it('a merged scatter mesh keeps every vertex: only its index is reordered, one run a tile, and drawn whole it is every triangle once', () => {
    const meshes = runMeshes();
    expect(meshes.map((m) => m.name).sort()).toEqual(['dressing', 'reeds']);
    for (const m of meshes) {
      const was = OFF.scene.children.find((c) => c.name === m.name);
      expect(w.scene.children.includes(m)).toBe(true);
      for (const name of Object.keys(was.geometry.attributes)) {
        expect(fnv(m.geometry.attributes[name].array), `${m.name}.${name}`).toBe(fnv(was.geometry.attributes[name].array));
      }
      expect(m.material.color.getHex()).toBe(was.material.color.getHex());
    }
    // everything in range: every layer's range covering the map
    const g = buildRiver(river, setGrow, true);
    const big = g.area.strips.map((s) => ({ ...s, layers: [{ id: 'fine', show: 1e9, hide: 2e9 }, { id: 'small', show: 1e9, hide: 2e9 }, { id: 'trees', show: 1e9, hide: 2e9 }] }));
    mergeStaticProps(g.scene);
    const t2 = createStripTiles(g.scene, { strips: big });
    t2.settle(0, 0);
    for (const { mesh } of t2.inventory().runMeshes) {
      const was = OFF.scene.children.find((c) => c.name === mesh.name);
      const drawn = triples(mesh.geometry, mesh.geometry.drawRange.count);
      expect(drawn, mesh.name).toEqual(triples(was.geometry));
    }
    t2.dispose();
  });

  it('the trees stay the scene\'s own, where they were built: shown and hidden, never moved, rebuilt or merged again', () => {
    const before = tagged(w.scene, 'trees').map((g) => fingerprint(g).map((l) => l.replace(/\|(true|false)$/, '')).join(';'));
    for (const [x, z] of [[FAR, FAR], [-30, 0], [40, 30], [FAR, FAR]]) w.tiles.settle(x, z);
    const after = tagged(w.scene, 'trees').map((g) => fingerprint(g).map((l) => l.replace(/\|(true|false)$/, '')).join(';'));
    expect(after).toEqual(before);
  });

  it('with the cat far off, nothing streamed is drawn in full: every tree and every tile is its stand-in', () => {
    w.tiles.settle(FAR, FAR);
    for (const g of tagged(w.scene, 'trees')) expect(g.visible).toBe(false);
    for (const { mesh, always } of w.tiles.inventory().runMeshes) expect(mesh.geometry.drawRange.count / 3).toBe(always);
    // the dressing's moss on the crossings is no scatter: always drawn
    expect(w.tiles.inventory().runMeshes.find((r) => r.mesh.name === 'dressing').always).toBeGreaterThan(300);
    expect(w.tiles.standIns.mesh.visible).toBe(true);
    for (const k of w.tiles.standIns.keys()) expect(w.tiles.standIns.shown(k), k).toBe(true);
  });

  it('the stand-ins are one mesh, one draw, cast nothing, and each tree\'s stands where its tree does, no taller and little wider', () => {
    expect(w.scene.children.filter((o) => o.name === 'standIns')).toEqual([w.tiles.standIns.mesh]);
    const m = w.tiles.standIns.mesh;
    expect(m.isMesh && !Array.isArray(m.material)).toBe(true);
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
    // a tree's stand-in triangles, by its slot, inside the boxes of its slot's trees
    const box = new THREE.Box3(), tb = new THREE.Box3();
    const pos = m.geometry.attributes.position;
    const slots = new Map();
    for (const g of tagged(w.scene, 'trees')) {
      const k = g.userData.streamSlot;
      if (!slots.has(k)) slots.set(k, []);
      // a six-way outline can reach a little past the box's sides, never its top
      const b = new THREE.Box3().setFromObject(g);
      b.min.x -= 0.5; b.max.x += 0.5; b.min.z -= 0.5; b.max.z += 0.5; b.min.y -= 0.05; b.max.y += 0.05;
      slots.get(k).push(b);
    }
    let checked = 0;
    for (const [k, boxes] of slots) {
      w.tiles.standIns.show(k, true);
      for (const kk of w.tiles.standIns.keys()) if (kk !== k) w.tiles.standIns.show(kk, false);
      w.tiles.standIns.update();
      const idx = m.geometry.index;
      for (let i = 0; i < m.geometry.drawRange.count; i++) {
        box.setFromCenterAndSize(new THREE.Vector3(pos.getX(idx.getX(i)), pos.getY(idx.getX(i)), pos.getZ(idx.getX(i))), new THREE.Vector3());
        expect(boxes.some((b) => tb.copy(b).containsBox(box)), k).toBe(true);
        checked++;
      }
      expect(m.geometry.drawRange.count / 3).toBeLessThanOrEqual(100 * boxes.length);
    }
    expect(checked).toBeGreaterThan(1000);
    w.tiles.settle(FAR, FAR);
  });

  it('streaming touches no collider, perch or fight-camera tree, near or far', () => {
    for (const [x, z] of [[-30, 0], [FAR, FAR], [44, 40]]) {
      w.tiles.settle(x, z);
      expect(JSON.stringify(w.area.colliders)).toBe(w.colliders);
      expect(JSON.stringify(w.area.perches)).toBe(w.perches);
    }
    const trees = tagged(w.scene, 'trees');
    for (const g of trees) expect(w.occluders.some((o) => o.obj === g)).toBe(true);
  });
});

describe('the core on a walk, east to west and back', () => {
  const w = walkScene();
  const ROUTE = [[48, 40], [28, 40], [4, 30], [-6, 23.6], [-28, 23.3], [-46, 23.5], [-48, -10], [-20, -40], [30, -40], [48, 40]];
  const core = w.area.strips.findIndex((s) => s.id === 'core');
  const fine = w.area.strips.findIndex((s) => s.id === 'core-fine');
  w.tiles.settle(...ROUTE[0]);
  // walk start: what is near the spawn is drawn at once, with no frame run
  const atStart = w.tiles.streamers[core].slots.filter((s) => tileDistance(s.tile, ...ROUTE[0]) < s.layer.show);
  const startBuilt = atStart.every((s) => s.state === BUILT);
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
      for (const st of [core, fine]) {
        for (const sl of w.tiles.streamers[st].slots) {
          const key = `${w.area.strips[st].id}|${sl.tile.index}|${sl.layer.id}`;
          if (!w.tiles.standIns.has(key)) continue;
          if ((sl.state === BUILT) === w.tiles.standIns.shown(key) && !gap) gap = `${key} at ${x.toFixed(1)},${z.toFixed(1)}`;
        }
      }
    }
  }
  for (const st of [core, fine]) maxStep = Math.max(maxStep, w.tiles.streamers[st].stats.maxFrameTriangles);

  it('starts with the spawn\'s surroundings already drawn', () => {
    expect(atStart.length).toBeGreaterThan(20);
    expect(startBuilt).toBe(true);
  });

  it('never leaves a gap or draws a thing twice: each slot is drawn in full or by its stand-ins, every frame', () => {
    expect(frames).toBeGreaterThan(1000);
    expect(gap).toBeNull();
  });

  it('nothing grows in or moves: a thing appears at its full size in the frame its stand-in goes (reduced motion or not)', () => {
    expect(grew).toBeNull();
  });

  it('spreads its first sight of many tiles over frames: no frame shows more than the budget, but for one slot', () => {
    expect(maxStep).toBeGreaterThan(0);
    const slotMost = Math.max(...[...w.tiles.inventory().slots.values()].map((s) => s.runs.reduce((n, r) => n + r.triangles, 0)
      + s.objects.reduce((n, o) => { let t = 0; o.traverse((m) => { if (m.isMesh) t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n + t; }, 0)));
    expect(maxStep).toBeLessThanOrEqual(Math.max(FRAME_TRIANGLES, slotMost));
  });

  it('hands every core thing back, shown, for the walk\'s own teardown, and takes its stand-ins away', () => {
    const mesh = w.tiles.standIns.mesh;
    w.tiles.dispose();
    for (const g of tagged(w.scene, 'trees')) expect(g.visible).toBe(true);
    expect(w.scene.children.includes(mesh)).toBe(false);
  });

  it('the layers are the step-2 ranges: trees within about 65 m, small things 38, the reedbed 20', () => {
    expect(LAYERS.map((l) => [l.id, l.show, l.hide])).toEqual([['fine', 14, 20], ['small', 30, 38], ['trees', 55, 65]]);
  });
});
