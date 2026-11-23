import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { createTreeFade, findFadeOccluders, WINDOW_HIDE } from '../src/treefade.js';
import { castsFromBox, isTransparentMat } from '../src/render/rig.js';

stubCanvasDocument();

const { build } = await import('../src/world/greenhouse.js');
const P = await import('../src/world/greenhouseplan.js');
const G = await import('../src/world/greenhouseglass.js');
const { AREA_LOADERS, AREA_ENTRY_MODULES } = await import('../src/world/areas.js');
const { CATALOG } = await import('../src/progression.js');
const { STREET_PLACES, TOWN_PLACES } = await import('../src/worldmap.js');

// Greenhouse milestone 0: the glass-house kit on one Palm House, and the scaffold around it.
const scene = new THREE.Scene();
const area = build(scene);
const named = (n) => scene.children.find((c) => c.name === n);
const house = named('palmHouse');
const glass = house.children.find((c) => c.name === 'palmHouse-glass');
const frame = house.children.find((c) => c.name === 'palmHouse-frame');
const tris = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;

describe('the pane mesh is transparent, not a caster, front-sided and tagged as a window', () => {
  it('is one transparent mesh with a low alpha gradient', () => {
    expect(glass.material.transparent).toBe(true);
    expect(isTransparentMat(glass.material)).toBe(true);
    expect(glass.material.depthWrite).toBe(false);
    expect(glass.material.side).toBe(THREE.FrontSide);
    expect(glass.userData.window).toBe('glass');
    expect(glass.userData.noCast).toBe(true);
    expect(glass.castShadow).toBe(false);
    const col = glass.geometry.attributes.color;
    expect(col.itemSize).toBe(4);
    const alphas = Array.from({ length: col.count }, (_, i) => col.getW(i));
    expect(Math.max(...alphas)).toBeLessThanOrEqual(G.GLASS_ALPHA.roof + G.GLASS_ALPHA.wet + 1e-6);
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(G.GLASS_ALPHA.wall - 1e-6);
    // a wetter edge in the lowest 0.4 m
    const pos = glass.geometry.attributes.position;
    const low = alphas.filter((_, i) => pos.getY(i) < P.PALM_HOUSE.plinth + 0.05);
    expect(low.length).toBeGreaterThan(0);
    expect(Math.min(...low)).toBeGreaterThan(G.GLASS_ALPHA.wall + G.GLASS_ALPHA.wet - 1e-6);
  });
  it('every pane faces OUTWARD, so the inside sees none of it (front faces only)', () => {
    const pos = glass.geometry.attributes.position;
    const idx = glass.geometry.index;
    const H = P.PALM_HOUSE;
    const centre = new THREE.Vector3((H.x0 + H.x1) / 2, H.plinth, (H.z0 + H.z1) / 2);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
    let bad = 0;
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(pos, idx.getX(i)); b.fromBufferAttribute(pos, idx.getX(i + 1)); c.fromBufferAttribute(pos, idx.getX(i + 2));
      n.subVectors(b, a).cross(m.subVectors(c, a)); // three.js: counter-clockwise from the front
      m.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(centre);
      if (n.dot(m) <= 0) bad++;
    }
    expect(bad).toBe(0);
    expect(tris(glass)).toBeGreaterThan(300);
    expect(tris(glass)).toBeLessThan(900);
  });
  it('the doors are real gaps: no pane in a doorway, 3 m wide, and the frame has posts either side', () => {
    const pos = glass.geometry.attributes.position;
    const H = P.PALM_HOUSE;
    const zc = (H.z0 + H.z1) / 2;
    const inGap = (x, y, z) => {
      for (const d of P.PALM_DOORS) {
        const along = d.side === 'south' || d.side === 'north' ? Math.abs(x - d.x) : Math.abs(z - zc);
        const onPlane = d.side === 'south' || d.side === 'north' ? Math.abs(z - d.z) < 0.01 : Math.abs(x - d.x) < 0.01;
        if (onPlane && along < H.doorW / 2 - 0.01 && y < H.doorH - 0.01) return true;
      }
      return false;
    };
    let hits = 0;
    const tri = new THREE.Vector3();
    const idx = glass.geometry.index;
    for (let i = 0; i < idx.count; i += 3) {
      // a triangle is in a gap only if all three corners are
      let all = true;
      for (let k = 0; k < 3; k++) { tri.fromBufferAttribute(pos, idx.getX(i + k)); if (!inGap(tri.x, tri.y + 0.001, tri.z)) all = false; }
      if (all) hits++;
    }
    expect(hits).toBe(0);
    expect(P.PALM_DOORS).toHaveLength(4);
    expect(P.PALM_HOUSE.doorW).toBe(3);
  });
  it('the frame is one opaque vertex-coloured mesh, no caster', () => {
    expect(frame.material.transparent).toBe(false);
    expect(frame.userData.noCast).toBe(true);
    expect(frame.geometry.attributes.color).toBeDefined();
  });
});

describe('a house\'s boxes fade the building and hide the panes', () => {
  const entry = () => findFadeOccluders(scene).find((e) => e.obj === house);
  it('registers as one building box that spans the hall', () => {
    const e = entry();
    expect(e).toBeDefined();
    expect(e.box.minX).toBeCloseTo(P.PALM_HOUSE.x0, 0);
    expect(e.box.maxX).toBeCloseTo(P.PALM_HOUSE.x1, 0);
    expect(e.box.minZ).toBeCloseTo(P.PALM_HOUSE.z0, 0);
    expect(e.box.maxZ).toBeCloseTo(P.PALM_HOUSE.z1, 0);
    expect(e.top).toBeCloseTo(P.PALM_HOUSE.ridge, 0);
    // only the house is a building: the mist, shafts, floor, dapple and palms are untouched siblings
    expect(findFadeOccluders(scene).filter((o) => o.box)).toHaveLength(1);
  });
  it('hides the panes with the camera inside, shows them again outside', () => {
    const fade = createTreeFade(findFadeOccluders(scene));
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    const look = { x: 0, y: 0.35, z: 6 };
    camera.position.set(0, 3, -9); // inside the hall
    for (let i = 0; i < 20; i++) fade.update(0.1, camera, look);
    expect(glass.visible).toBe(false);
    camera.position.set(40, 3, 30);
    for (let i = 0; i < 30; i++) fade.update(0.1, camera, look);
    expect(glass.visible).toBe(true);
    fade.dispose();
    expect(glass.visible).toBe(true);
    expect(WINDOW_HIDE).toBeGreaterThan(0);
  });
});

describe('dusk leaves the glass alone', () => {
  it('applyDusk keeps the pane\'s own see-through material', async () => {
    const { applyDusk } = await import('../src/render/dusk.js');
    const sun = new THREE.DirectionalLight(); const fill = new THREE.HemisphereLight();
    const before = glass.material;
    applyDusk({ scene, sun, fill, areaData: area });
    expect(glass.material).toBe(before);
    expect(glass.material.transparent).toBe(true);
  });
});

describe('mist, shafts and dapple', () => {
  const mist = named('glassMist');
  const shafts = named('sunShafts');
  const dapple = named('glassDapple');
  it('are noCast, noMerge and top-level siblings of the house', () => {
    for (const m of [mist, shafts, dapple]) {
      expect(m, 'present').toBeDefined();
      expect(m.userData.noCast).toBe(true);
      expect(m.userData.noMerge).toBe(true);
      expect(m.material.transparent).toBe(true);
      expect(m.material.depthWrite).toBe(false);
    }
    expect(shafts.material.blending).toBe(THREE.AdditiveBlending);
    expect(mist.userData.mist.uTime).toBeDefined();
  });
  it('run on one clock and freeze under reduced motion', () => {
    const live = area.life({ reducedMotion: false });
    live.update(0.03, 10);
    expect(mist.userData.mist.uTime.value).toBe(10);
    expect(shafts.rotation.z).not.toBe(0);
    expect(Math.abs(shafts.rotation.z)).toBeLessThanOrEqual((G.SHAFT_SWAY.deg * Math.PI) / 180 + 1e-9);
    const calm = area.life({ reducedMotion: true });
    calm.update(0.03, 12.3);
    expect(mist.userData.mist.uTime.value).toBe(0);
    expect(shafts.rotation.z).toBe(0);
  });
  it('the dapple texture is made in build, never at import', () => {
    expect(dapple.material.map).toBeTruthy();
    // (test/areaimport.test.js is the guard for import-time canvases)
  });
  it('the low tier drops the mist and the shafts and keeps the frame, glass and dapple', () => {
    const s = new THREE.Scene();
    build(s, { water: { quality: 'low' } });
    const names = s.children.map((c) => c.name);
    expect(names).not.toContain('glassMist');
    expect(names).not.toContain('sunShafts');
    expect(names).toContain('palmHouse');
    expect(names).toContain('glassDapple');
  });
  it('no Math.random, Date.now or performance.now in a build or a life tick', () => {
    const s = new THREE.Scene(); // (a Scene draws its own four uuid numbers: made before the count starts)
    const r = vi.spyOn(Math, 'random');
    const d = vi.spyOn(Date, 'now');
    const p = vi.spyOn(performance, 'now');
    const a = build(s);
    a.life({}).update(0.03, 5);
    const calls = [r.mock.calls.length, d.mock.calls.length, p.mock.calls.length];
    r.mockRestore(); d.mockRestore(); p.mockRestore();
    expect(calls[1]).toBe(0);
    expect(calls[2]).toBe(0);
    expect(calls[0]).toBe(0);
  });
});

describe('the record and the scaffold', () => {
  it('has every field a walk reads', () => {
    expect(area.name).toBe('The Greenhouse');
    expect(area.bounds).toEqual(P.GREENHOUSE_BOUNDS);
    expect(area.spawn).toEqual({ x: 0, z: 30 });
    for (const k of ['colliders', 'waters', 'waterFx', 'perches', 'pois', 'collectibles', 'scenics', 'tippables', 'boxes', 'critterSpawns', 'moments', 'puddles']) expect(Array.isArray(area[k]), k).toBe(true);
    expect(area.skyDusk.top).toBeTypeOf('number');
    expect(typeof area.life).toBe('function');
  });
  it('the pond has a 1.5 m wading band, a lily-pad mesh and a water surface', () => {
    expect(area.waters[0]).toMatchObject({ id: 'pond', kind: 'circle', shallow: 1.5 });
    expect(named('lilyPads')).toBeDefined();
    expect(area.waterFx).toHaveLength(1);
  });
  it('two builds are identical', () => {
    const sig = (sc) => sc.children.map((c) => { let n = 0; c.traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count; }); return `${c.name}:${n}:${c.position.toArray().join(',')}`; }).join('|');
    const s2 = new THREE.Scene();
    build(s2);
    expect(sig(s2)).toBe(sig(scene));
  });
  it('the spawn, the doors\' mouths and the pond clear every collider; a door can be walked through', () => {
    const clear = (x, z, pad = 0.4) => area.colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + pad);
    expect(clear(0, 30)).toBe(true);
    for (const d of P.PALM_DOORS) {
      // on the door's own line, through the gap and 3 m either side
      for (let s = -3; s <= 3; s += 0.5) {
        const [x, z] = d.side === 'south' || d.side === 'north' ? [d.x, d.z + s] : [d.x + s, d.z];
        expect(clear(x, z), `${d.side} door at ${s}`).toBe(true);
      }
    }
    // the frame is solid: a point on the south wall beside the door is blocked
    expect(clear(5, P.PALM_HOUSE.z1)).toBe(false);
    expect(clear(0, -9, 0.4)).toBe(true); // the hall's middle is open
  });
  it('a cat can walk from the spawn through the south door to the hall\'s middle (a flood fill on the colliders)', () => {
    const R = 0.3; // her radius
    const free = (x, z) => area.colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + R);
    const step = 0.5;
    const key = (i, j) => `${i},${j}`;
    const seen = new Set([key(0, 60)]);
    const todo = [[0, 60]];
    const bounds = P.GREENHOUSE_BOUNDS;
    while (todo.length) {
      const [i, j] = todo.pop();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        const x = ni * step, z = nj * step;
        if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
        if (seen.has(key(ni, nj)) || !free(x, z)) continue;
        seen.add(key(ni, nj));
        todo.push([ni, nj]);
      }
    }
    expect(seen.has(key(0, -18))).toBe(true); // the hall's middle (0, -9)
    expect(seen.has(key(0, -36))).toBe(true); // out of the north door, round the back (0, -18)
    expect(seen.has(key(-28, -18))).toBe(true); // out of the west door
    expect(seen.has(key(28, -18))).toBe(true); // out of the east door
  });
  it('is registered as its own download and offered nowhere', () => {
    expect(typeof AREA_LOADERS.greenhouse).toBe('function');
    expect(AREA_ENTRY_MODULES.greenhouse).toEqual(['src/world/greenhouse.js']);
    expect(Object.hasOwn(CATALOG.areas, 'greenhouse')).toBe(false);
    expect(STREET_PLACES.some((p) => p.areaId === 'greenhouse')).toBe(false);
    expect(TOWN_PLACES.some((p) => p.areaId === 'greenhouse')).toBe(false);
  });
  it('the frame and the whole build stay inside the spike\'s numbers', () => {
    let meshes = 0, triangles = 0;
    scene.traverse((o) => { if (o.isMesh) { meshes++; triangles += tris(o); } });
    expect(meshes).toBeLessThan(40);
    expect(triangles).toBeLessThan(30000);
    expect(castsFromBox(new THREE.Box3().setFromObject(house))).toBe(true); // (it is big; its parts opt out)
  });
});
