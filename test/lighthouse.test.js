import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { castsFromBox, isTransparentMat } from '../src/render/rig.js';

stubCanvasDocument();

const { build } = await import('../src/world/lighthouse.js');
const P = await import('../src/world/lighthouseplan.js');
const { AREA_LOADERS, AREA_ENTRY_MODULES } = await import('../src/world/areas.js');

// Lighthouse Point, milestone 1: the drawn place and the record it hands the walk.

function measure(scene) {
  let meshes = 0;
  let triangles = 0;
  let casters = 0;
  const hash = [];
  scene.updateMatrixWorld(true);
  for (const child of scene.children) {
    const box = new THREE.Box3().setFromObject(child);
    const eligible = castsFromBox(box);
    child.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
      if (eligible && !isTransparentMat(o.material) && !o.userData.noCast && o.castShadow !== false) casters++;
      hash.push(`${o.name}:${g.attributes.position.count}:${o.position.x.toFixed(2)},${o.position.y.toFixed(2)},${o.position.z.toFixed(2)}`);
    });
  }
  return { meshes, casters, triangles: Math.round(triangles), hash: hash.join('|') };
}

const scene1 = new THREE.Scene();
const area = build(scene1);
const m1 = measure(scene1);

describe('the record', () => {
  it('has every field a walk reads, from the plan', () => {
    expect(area.name).toBe('Lighthouse Point');
    expect(area.bounds).toEqual(P.LIGHTHOUSE_BOUNDS);
    expect(area.spawn).toEqual({ x: 14, z: 36 });
    for (const k of ['colliders', 'waters', 'waterFx', 'perches', 'pois', 'collectibles', 'scenics', 'tippables', 'boxes', 'critterSpawns', 'moments', 'puddles']) expect(Array.isArray(area[k]), k).toBe(true);
    expect(area.waters.map((w) => w.id)).toEqual(['sea', 'sea-west', 'pool-1', 'pool-2', 'pool-3', 'pool-4', 'pool-5', 'pool-6']);
    expect(area.evening).toBe(true);
    expect(area.ground.y(-20, -10)).toBe(6);
    expect(area.traversal).toBeUndefined(); // no moves until milestone 2: the moves runtime stays out of the walk
    expect(area.skyDusk.top).toBeTypeOf('number');
    expect(area.duskLight.fogFar).toBeGreaterThan(area.duskLight.fogNear);
  });
  it('nothing is alive yet: no critters, no moments', () => {
    expect(area.critterSpawns).toEqual([]);
    expect(area.moments).toEqual([]);
  });
  it('the seas are drawn from the declared footprints', () => {
    const slabs = area.waterFx.map((h) => h.mesh.geometry.parameters);
    expect(slabs[0].width).toBe(P.SEA_EAST.maxX - P.SEA_EAST.minX);
    expect(slabs[1].width).toBe(P.SEA_WEST.maxX - P.SEA_WEST.minX);
    expect(area.waterFx[0].mesh.position.x).toBeCloseTo((P.SEA_EAST.minX + P.SEA_EAST.maxX) / 2, 6);
    expect(area.waterFx[1].mesh.position.x).toBeCloseTo((P.SEA_WEST.minX + P.SEA_WEST.maxX) / 2, 6);
  });
  it('each tippable carries its own look', () => {
    expect(area.tippables).toHaveLength(5);
    for (const t of area.tippables) {
      expect(typeof t.build).toBe('function');
      expect(t.build().children.length).toBeGreaterThan(0);
    }
  });
});

describe('the drawing', () => {
  it('is deterministic: two builds are identical (positions, counts, names)', () => {
    const scene2 = new THREE.Scene();
    build(scene2);
    expect(measure(scene2)).toEqual(m1);
  });
  it('draws no random number and reads no clock', () => {
    const real = Math.random;
    const realNow = Date.now;
    const scene = new THREE.Scene(); // (a Scene draws its own four uuid numbers: made before the count starts)
    let draws = 0;
    let reads = 0;
    Math.random = () => { draws++; return real(); };
    Date.now = () => { reads++; return realNow(); };
    try {
      build(scene);
    } finally {
      Math.random = real;
      Date.now = realNow;
    }
    // (THREE's uuids draw from the local stream the build installs, never from the game's)
    expect(draws).toBe(0);
    expect(reads).toBe(0);
  });
  it('stays inside the milestone-1 ceilings: 280 meshes, 210 casters, 62,000 triangles (the aim is 150 / 70 / 52,000)', () => {
    expect(m1.meshes).toBeLessThanOrEqual(150);
    expect(m1.casters).toBeLessThanOrEqual(70);
    expect(m1.triangles).toBeLessThanOrEqual(52000);
  });
  it('the headland, the tower, the cottage and the pools are in the scene, named', () => {
    const names = [];
    scene1.traverse((o) => { if (o.isMesh && o.name) names.push(o.name); });
    for (const n of ['lighthouse:cliff', 'lighthouse:paint', 'lighthouse:glow', 'lighthouse:water', 'lighthouse:shelf']) expect(names, n).toContain(n);
  });
  it('the cliffs never stand out past the ground\'s true edge: every cliff vertex is inside its strip or beyond it', () => {
    const cliff = scene1.getObjectByName('lighthouse:cliff');
    const p = cliff.geometry.attributes.position;
    const { PLATEAU } = P;
    let outside = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
      // a vertex of the plateau's own faces (high and in the plateau's footprint columns) must not lie beyond its face line
      if (y > 0.5 && x > PLATEAU.maxX + 1e-6 && z > -80 && z < PLATEAU.maxZ && Math.abs(x - PLATEAU.maxX) < 0.01) outside++;
    }
    expect(outside).toBe(0);
  });
});

describe('the registry', () => {
  it('lighthouse is a loader and an entry row, its own download, and the world module is the builder', async () => {
    expect(Object.hasOwn(AREA_LOADERS, 'lighthouse')).toBe(true);
    expect(AREA_ENTRY_MODULES.lighthouse).toEqual(['src/world/lighthouse.js']);
    const pack = await AREA_LOADERS.lighthouse();
    expect(pack.id).toBe('lighthouse');
    expect(pack.world.build).toBe(build);
    expect(pack.life).toEqual({});
  });
});
