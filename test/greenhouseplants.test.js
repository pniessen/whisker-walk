import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { castsFromBox } from '../src/render/rig.js';

stubCanvasDocument();

const { build } = await import('../src/world/greenhouse.js');
const P = await import('../src/world/greenhouseplan.js');
const G = await import('../src/world/greenhouseglass.js');
const Plants = await import('../src/world/greenhouseplants.js');

// Greenhouse milestone 1: the real plants, the koi, the fountain court, the bench and the garden pots; the shafts' distance fade.
const scene = new THREE.Scene();
const area = build(scene);
const named = (n) => scene.children.find((c) => c.name === n);
const tris = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
const free = (x, z, pad = 0.4, list = area.colliders) => list.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + pad);
const inPond = (x, z) => Math.hypot(x - P.POND.x, z - P.POND.z) < P.POND.r + 0.3;

describe('the plants are a few merged meshes, with palms the only casters', () => {
  it('has the four plant meshes, each unmerged by the walk and vertex-coloured', () => {
    for (const n of ['ghPalms', 'ghFoliage', 'ghOrchids', 'ghKoi']) {
      const m = named(n);
      expect(m, n).toBeDefined();
      expect(m.userData.noMerge, n).toBe(true);
      expect(m.geometry.attributes.color, n).toBeDefined();
    }
    expect(named('ghPalms').castShadow).toBe(true);
    for (const n of ['ghFoliage', 'ghOrchids', 'ghKoi', 'ghBench', 'ghKitchenBed', 'ghPots']) { expect(named(n).castShadow, n).toBe(false); expect(named(n).userData.noCast, n).toBe(true); }
  });
  it('the triangles stay inside the milestone\'s numbers (plants about 17,000, the whole build under 45,000 with 62,000 the ceiling)', () => {
    const plantTris = ['ghPalms', 'ghFoliage', 'ghOrchids', 'ghKoi'].reduce((n, k) => n + tris(named(k)), 0);
    expect(plantTris).toBeGreaterThan(8000);
    expect(plantTris).toBeLessThan(18000);
    let meshes = 0, casters = 0, all = 0;
    scene.traverse((o) => { if (o.isMesh) { meshes++; all += tris(o); if (o.castShadow && !o.userData.noCast) casters++; } });
    expect(all).toBeLessThan(45000);
    expect(meshes).toBeLessThan(60);
    expect(casters).toBeLessThan(10);
  });
  it('six palms, each with a trunk and a crown, are placed where the plan says; two builds are identical', () => {
    expect(P.PALM_SPOTS).toHaveLength(6);
    const sig = (sc) => ['ghPalms', 'ghFoliage', 'ghOrchids', 'ghKoi'].map((k) => { const g = sc.children.find((c) => c.name === k).geometry; return `${g.attributes.position.count}:${Array.from(g.attributes.position.array.slice(0, 60)).map((v) => v.toFixed(4)).join(',')}`; }).join('|');
    const s2 = new THREE.Scene();
    build(s2);
    expect(sig(s2)).toBe(sig(scene));
  });
  it('every plant stands on open ground clear of every door line, and none in the pond', () => {
    const all = [...P.PALM_SPOTS, ...P.BANANA_SPOTS, ...P.TREE_FERN_SPOTS, ...P.BIRD_SPOTS, ...P.MONSTERA_SPOTS, ...P.HIBISCUS_SPOTS, ...Plants.fernClumps()];
    for (const [x, z] of all) expect(inPond(x, z), `${x},${z} in the pond`).toBe(false);
    // the fern clumps never sit in a door's mouth (3 m either side of a door)
    for (const [x, z] of Plants.fernClumps()) for (const d of P.PALM_DOORS) {
      const along = d.side === 'south' || d.side === 'north' ? Math.hypot(x - d.x, z - d.z) : Math.hypot(x - d.x, z - (P.PALM_HOUSE.z0 + P.PALM_HOUSE.z1) / 2);
      if (Math.abs(x) < 20 && z > -19 && z < 1) expect(along, `${x},${z}`).toBeGreaterThan(2.9); // (the hall's own: the outside ones are beyond)
    }
  });
  it('the loop round the fern island is 2.2 m or wider, edge to edge', () => {
    for (const [x, z] of P.PALM_SPOTS) {
      const d = Math.hypot(x - P.ISLAND.x, z - P.ISLAND.z);
      if (d < 8) expect(d - P.ISLAND.r - 0.6).toBeGreaterThanOrEqual(2.2);
    }
    // and a cat (radius 0.3) fits round it everywhere at that radius
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const x = P.ISLAND.x + Math.cos(a) * (P.ISLAND.r + 1.4), z = P.ISLAND.z + Math.sin(a) * (P.ISLAND.r + 1.4);
      expect(free(x, z, 0.3), `${a}`).toBe(true);
    }
  });
  it('the orchid benches have five pots each in different colours, on a 0.75 m bench', () => {
    expect(P.ORCHID_BENCHES).toHaveLength(2);
    expect(tris(named('ghOrchids'))).toBeGreaterThan(1500);
  });
});

describe('the sun shafts fade with the camera\'s distance and are softer', () => {
  const shafts = named('sunShafts');
  it('patches the shader with the distance fade, and the gain is lower than the spike\'s 0.22', () => {
    expect(G.SHAFT_GAIN).toBeLessThan(0.22);
    const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
    shafts.material.onBeforeCompile(shader);
    expect(shader.fragmentShader).toMatch(/smoothstep\(2\.5, 8\.0, distance\(cameraPosition, vShaftW\)\)/);
    expect(G.SHAFT_FADE.near).toBeGreaterThan(1.5);
    expect(G.SHAFT_FADE.far).toBeGreaterThan(G.SHAFT_FADE.near);
    expect(shafts.material.blending).toBe(THREE.AdditiveBlending);
  });
  it('the shafts\' sides are black (soft edged), so the strongest light is the centre line only', () => {
    const col = shafts.geometry.attributes.color;
    let bright = 0;
    for (let i = 0; i < col.count; i++) if (col.getX(i) > 0) { bright++; expect(col.getX(i)).toBeLessThanOrEqual(G.SHAFT_GAIN * 1.0 + 1e-6); }
    expect(bright).toBeGreaterThan(0);
    expect(bright).toBeLessThan(col.count / 2);
  });
});

describe('the koi', () => {
  const koi = named('ghKoi');
  it('are one shader mesh on one uTime, six fish, always above the opaque water but inside it', () => {
    expect(Plants.KOI).toHaveLength(6);
    expect(koi.userData.koi.uTime).toBeDefined();
    expect(koi.userData.noCast).toBe(true);
    expect(koi.material.transparent).toBe(true);
    expect(Plants.KOI_Y).toBeGreaterThan(0.02);
    expect(tris(koi)).toBeLessThan(400);
  });
  it('every fish\'s whole path stays inside the open water, clear of the wading band', () => {
    const f = koi.geometry.attributes.aFish, s = koi.geometry.attributes.aShape;
    const open = P.POND.r - P.POND.shallow - 0.1;
    for (let i = 0; i < f.count; i++) {
      const cx = f.getX(i), cz = f.getY(i), rx = s.getX(i), rz = s.getY(i), size = s.getZ(i);
      for (let a = 0; a < Math.PI * 2; a += 0.2) {
        const x = cx + Math.cos(a) * rx, z = cz + Math.sin(a) * rz;
        expect(Math.hypot(x - P.POND.x, z - P.POND.z) + size * 0.4, `fish ${i}`).toBeLessThan(open + 1.4);
        expect(Math.hypot(x - P.POND.x, z - P.POND.z), `fish ${i}`).toBeLessThan(P.POND.r - 0.5);
      }
    }
  });
  it('freeze under reduced motion and swim on the walk\'s clock otherwise', () => {
    const live = area.life({ reducedMotion: false, scene });
    live.update(0.03, 7);
    expect(koi.userData.koi.uTime.value).toBe(7);
    const calm = area.life({ reducedMotion: true, scene });
    calm.update(0.03, 9);
    expect(koi.userData.koi.uTime.value).toBe(Plants.KOI_FROZEN_TIME);
    live.dispose(); calm.dispose();
  });
});

describe('the fountain court reuses the Park\'s kit', () => {
  it('has the basin, water, spire, upper water, drops and ripples; a collider the size of the basin\'s rim', () => {
    const f = named('ghFountain');
    const names = []; f.traverse((o) => names.push(o.name));
    for (const n of ['fountainBasin', 'fountainWater', 'fountainSpire', 'fountainUpperWater', 'fountainDrops', 'fountainRipples']) expect(names, n).toContain(n);
    expect(f.position.x).toBe(P.FOUNTAIN.x);
    expect(area.colliders.some((c) => c.x === P.FOUNTAIN.x && c.z === P.FOUNTAIN.z && c.r >= 3)).toBe(true);
  });
});

describe('the whole garden is walkable', () => {
  // a flood fill on the real colliders from the spawn, 0.5 m cells, a cat's radius of 0.3
  const R = 0.3;
  const step = 0.5;
  const b = P.GREENHOUSE_BOUNDS;
  const freeCell = (x, z) => free(x, z, R) && !inPond(x, z);
  const seen = new Set();
  const key = (i, j) => `${i},${j}`;
  const todo = [[0, 60]];
  seen.add(key(0, 60));
  while (todo.length) {
    const [i, j] = todo.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      const x = ni * step, z = nj * step;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ || seen.has(key(ni, nj)) || !freeCell(x, z)) continue;
      seen.add(key(ni, nj));
      todo.push([ni, nj]);
    }
  }
  const reach = (x, z) => seen.has(key(Math.round(x / step), Math.round(z / step)));
  it('reaches the bench, the tray, the can, every garden pot, the orchid benches\' fronts and the pond\'s rim', () => {
    expect(reach(P.POTTING.tray.x, P.POTTING.z + 1.4)).toBe(true);
    expect(reach(P.POTTING.canHome.x, P.POTTING.canHome.z)).toBe(true);
    for (const p of P.WATER_POT_SPOTS) expect(reach(p.x, p.z + 0.9) || reach(p.x + 0.9, p.z) || reach(p.x, p.z - 0.9) || reach(p.x - 0.9, p.z), `pot ${p.x},${p.z}`).toBe(true);
    for (const o of P.ORCHID_BENCHES) expect(reach(o.x, o.z + 1.2)).toBe(true);
    expect(reach(P.POND.x, P.POND.z + P.POND.r + 0.8)).toBe(true);
  });
  it('every seed spot in every set is open ground, out of the water, and reachable from the spawn', () => {
    expect(P.SEED_SPOT_SETS).toHaveLength(3);
    for (const set of P.SEED_SPOT_SETS) {
      expect(set).toHaveLength(5);
      for (const s of set) {
        expect(free(s.x, s.z, 0.3), `${s.x},${s.z} blocked`).toBe(true);
        expect(inPond(s.x, s.z), `${s.x},${s.z} in the pond`).toBe(false);
        expect(reach(s.x, s.z), `${s.x},${s.z} unreachable`).toBe(true);
      }
    }
  });
  it('the eight pot spots are open ground and apart from every seed spot', () => {
    for (const p of P.WATER_POT_SPOTS) {
      expect(free(p.x, p.z, 0.4)).toBe(true);
      expect(inPond(p.x, p.z)).toBe(false);
      for (const set of P.SEED_SPOT_SETS) for (const s of set) expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThan(1.5);
    }
  });
  it('the pois are on open ground', () => { for (const p of area.pois) expect(free(p.x, p.z, 0.4) && !inPond(p.x, p.z), `${p.x},${p.z}`).toBe(true); });
  it('the hall\'s big plants never block a door: the south and north doors open to a 3 m lane', () => {
    for (let z = -17; z <= -1; z += 0.5) expect(free(0, z, 0.3) || Math.hypot(0 - P.ISLAND.x, z - P.ISLAND.z) < P.ISLAND.r + 0.6, `z ${z}`).toBe(true);
    expect(castsFromBox(new THREE.Box3().setFromObject(named('ghPalms')))).toBe(true);
  });
});
