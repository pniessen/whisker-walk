// The Crystal Cave, milestone C1: the cave world. The plan's coordinates against the built place, the floor against the walk's slope rule, the spawn clear,
// every zone reachable on foot with no skills, the hard rules (walls, ceiling, one light, indoor list, zoom cap), the pulse and the glints by tier,
// reduced motion, and the flat/grow traces untouched.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as P from '../src/world/crystalplan.js';
import { build } from '../src/world/crystal.js';
import { createCrystalLight, PULSE } from '../src/world/crystallight.js';
import { domeGeometry, groundGeometry } from '../src/world/crystalparts.js';
import { MAX_PATH_GRADE } from '../src/ground.js';
import { assignShadowCasters } from '../src/render/rig.js';
import { mergeStaticProps } from '../src/render/mergeprops.js';
import { scanFootprints } from '../src/render/contactshadows.js';
import { maxZoomStep, clampZoomStep } from '../src/camzoom.js';
import { GOLD_MICE } from '../src/goldmice.js';

const built = () => {
  const scene = new THREE.Scene();
  const area = build(scene);
  return { scene, area };
};
const B = P.CRYSTAL_BOUNDS;
const inside = (x, z, m = 0) => x >= B.minX + m && x <= B.maxX - m && z >= B.minZ + m && z <= B.maxZ - m;
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('the plan', () => {
  it('is 72 x 64 with the spawn at (0, 28), inside, on level stone', () => {
    expect(B.maxX - B.minX).toBe(72);
    expect(B.maxZ - B.minZ).toBe(64);
    expect(P.CRYSTAL_SPAWN).toEqual({ x: 0, z: 28 });
    expect(P.crystalY(0, 28)).toBeCloseTo(0, 6);
  });
  it('the plan\'s zone coordinates are exact', () => {
    const at = (id) => P.ZONES.find((z) => z.id === id);
    expect([at('entry').x, at('entry').z]).toEqual([0, 24]);
    expect([at('court').x, at('court').z]).toEqual([0, 28]);
    expect([at('rose').x, at('rose').z]).toEqual([-18, 4]);
    expect([at('pool').x, at('pool').z]).toEqual([14, -4]);
    expect([at('gold').x, at('gold').z]).toEqual([-6, -22]);
    expect([at('heart').x, at('heart').z]).toEqual([22, -22]);
    expect([P.ARCH.x, P.ARCH.z]).toEqual([0, 24.5]);
  });
  it('every coordinate of the plan is inside the bounds (zones, arch, clusters, colliders, wander spots, glints, mice)', () => {
    for (const z of P.ZONES) expect(inside(z.x, z.z), z.id).toBe(true);
    expect(inside(P.ARCH.x, P.ARCH.z)).toBe(true);
    for (const k of P.scatterClusters()) expect(inside(k.x, k.z, 1.5), JSON.stringify(k)).toBe(true);
    for (const c of P.crystalColliders()) expect(inside(c.x, c.z), JSON.stringify(c)).toBe(true);
    for (const p of P.CRYSTAL_POIS) expect(inside(p.x, p.z, 2)).toBe(true);
    for (const g of P.scatterGlints()) expect(inside(g.x, g.z), JSON.stringify(g)).toBe(true);
    for (const m of GOLD_MICE.crystal) expect(inside(m.x, m.z, 1)).toBe(true);
    expect(P.CRYSTAL_POIS.length).toBeGreaterThan(8);
  });
  it('the scatters are pure: the same answer twice, and the counts are the plan\'s', () => {
    expect(P.scatterClusters()).toEqual(P.scatterClusters());
    expect(P.scatterGlints()).toEqual(P.scatterGlints());
    expect(P.scatterStalactites()).toEqual(P.scatterStalactites());
    expect(P.scatterClusters().length).toBeGreaterThan(35);
    expect(P.scatterGlints()).toHaveLength(P.GLINT_COUNT);
  });
  it('the floor stays between 0 and 1.0 m and is never steeper than 0.5 (nor the walk\'s path grade) inside the bounds', () => {
    let hi = -1; let lo = 9; let steep = 0;
    const out = { x: 0, z: 0 };
    const g = P.createCrystalGround();
    for (let x = B.minX; x <= B.maxX; x += 1) {
      for (let z = B.minZ; z <= B.maxZ; z += 1) {
        const y = P.crystalY(x, z);
        hi = Math.max(hi, y); lo = Math.min(lo, y);
        g.gradient(x, z, out);
        steep = Math.max(steep, Math.hypot(out.x, out.z));
      }
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(hi).toBeGreaterThan(0.6); // a real floor
    expect(steep).toBeLessThan(0.5);
    expect(steep).toBeLessThan(MAX_PATH_GRADE);
  });
  it('beyond the bounds the floor carries on level (no wall, no rise)', () => {
    expect(P.crystalY(B.maxX + 8, 0)).toBe(P.crystalY(B.maxX, 0));
  });
});

describe('the hard rules', () => {
  it('the dome\'s wall stands 7 m or more beyond every walkable point and the dome is over 9 m high there', () => {
    const wall = P.DOME_PROFILE[0][0];
    const corner = Math.hypot(Math.max(Math.abs(B.minX), B.maxX), Math.max(Math.abs(B.minZ), B.maxZ));
    expect(wall - corner).toBeGreaterThanOrEqual(7);
    for (const [x, z] of [[B.maxX, B.maxZ], [B.minX, B.minZ], [B.maxX, 0], [0, B.minZ]]) expect(P.domeY(Math.hypot(x, z))).toBeGreaterThan(9);
    // the rim rocks are outside the walk and inside the wall
    for (const k of P.scatterRim()) { expect(inside(k.x, k.z)).toBe(false); expect(Math.hypot(k.x, k.z)).toBeLessThan(wall); }
  });
  it('the dome is one inside-only mesh, and the stalactites one InstancedMesh', () => {
    const { scene } = built();
    const dome = scene.getObjectByName('crystal:dome');
    expect(dome.material.side).toBe(THREE.BackSide);
    expect(scene.children.filter((o) => o.name === 'crystal:dome')).toHaveLength(1);
    const st = scene.children.filter((o) => o.isInstancedMesh);
    expect(st.map((s) => s.name)).toEqual(['crystal:stalactites']);
    expect(st[0].count).toBe(P.STALACTITE_COUNT);
    expect(domeGeometry().attributes.position.count).toBeGreaterThan(0);
  });
  it('no ground.ceil that finishes, no ceil flag, not an indoor area', () => {
    const { scene, area } = built();
    expect(area.ground.ceil(0, 0)).toBe(Infinity);
    expect(area.ground.ceil(20, -10)).toBe(Infinity);
    scene.traverse((o) => expect(o.userData?.ceil).toBeFalsy());
    expect(read('src/world/areas.js')).not.toMatch(/INDOOR_AREAS[^;]*crystal/s);
  });
  it('exactly one PointLight in the whole place, at intensity 0 (and none in the life)', () => {
    const { scene } = built();
    const lights = [];
    scene.traverse((o) => { if (o.isPointLight) lights.push(o); });
    expect(lights).toHaveLength(1);
    expect(lights[0].intensity).toBe(0);
    createCrystalLight({ scene, tier: { name: 'high', shadows: true }, reducedMotion: false });
    scene.traverse((o) => { if (o.isPointLight) lights.push(o); });
    expect(lights).toHaveLength(2); // the same one, found twice
    expect(new Set(lights).size).toBe(1);
  });
  it('zoom stops at step 2 in the cave; every other place is byte-identical', () => {
    expect(maxZoomStep('crystal')).toBe(2);
    expect(clampZoomStep(3, maxZoomStep('crystal'))).toBe(2);
    expect(maxZoomStep('docks')).toBe(3);
    expect(maxZoomStep('den')).toBe(1);
    expect(maxZoomStep(false)).toBe(3);
  });
});

describe('the built place', () => {
  const { scene, area } = built();
  it('has the plan\'s bounds and spawn, no `waters`, the evening look, no strays, and nothing a later milestone owns', () => {
    expect(area.bounds).toEqual(B);
    expect(area.spawn).toEqual(P.CRYSTAL_SPAWN);
    expect(area.waters).toEqual([]);
    expect(area.evening).toBe(true);
    expect(area.strays).toBe(false);
    expect(area.collectibles).toEqual([]);
    for (const key of ['perches', 'tippables', 'boxes', 'critterSpawns', 'moments', 'puddles']) expect(area[key], key).toEqual([]);
    expect(area.ground.flat).toBe(false);
    expect(typeof area.life).toBe('function');
    expect(area.duskLight.fogNear).toBe(5);
    expect(area.duskLight.fogFar).toBe(38);
  });
  it('the spawn is clear: no collider within 1.5 m of the paws, and the arch\'s two pillars flank it at (0, 24.5)', () => {
    for (const c of area.colliders) expect(Math.hypot(c.x - 0, c.z - 28), JSON.stringify(c)).toBeGreaterThan(c.r + 1.5);
    expect(area.colliders.length).toBeGreaterThan(8);
    expect(area.colliders.filter((c) => c.z === 24.5)).toHaveLength(2);
  });
  it('every zone, wander spot and mouse place is reachable on foot from the spawn with no skills', () => {
    const g = area.ground;
    const step = 0.5;
    const nx = Math.round((B.maxX - B.minX) / step) + 1;
    const nz = Math.round((B.maxZ - B.minZ) / step) + 1;
    const key = (i, j) => j * nx + i;
    const free = (i, j) => {
      const x = B.minX + i * step; const z = B.minZ + j * step;
      return !area.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.3);
    };
    const start = [Math.round((P.CRYSTAL_SPAWN.x - B.minX) / step), Math.round((P.CRYSTAL_SPAWN.z - B.minZ) / step)];
    const seen = new Set([key(...start)]);
    const queue = [start];
    while (queue.length) {
      const [i, j] = queue.pop();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di; const b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz || seen.has(key(a, b)) || !free(a, b)) continue;
        if (!g.canStep(B.minX + i * step, B.minZ + j * step, B.minX + a * step, B.minZ + b * step)) continue;
        seen.add(key(a, b));
        queue.push([a, b]);
      }
    }
    const reach = (x, z) => seen.has(key(Math.round((x - B.minX) / step), Math.round((z - B.minZ) / step)));
    for (const z of P.ZONES) expect(reach(z.x, z.z), z.id).toBe(true);
    for (const p of area.pois) expect(reach(p.x, p.z), JSON.stringify(p)).toBe(true);
    for (const m of GOLD_MICE.crystal) expect(reach(m.x, m.z), m.id).toBe(true);
    expect(seen.size / (nx * nz)).toBeGreaterThan(0.85);
  });
  it('the floor mesh is the function: its vertices sit on crystalY', () => {
    const ground = scene.children.find((o) => o.name === 'crystal:ground');
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 29) expect(pos.getY(i)).toBeCloseTo(P.crystalY(pos.getX(i), pos.getZ(i)), 4);
    expect(groundGeometry().attributes.color.count).toBe(pos.count);
  });
  it('one merged glow mesh per hue, never merged, never a caster; the walk\'s sweeps leave them whole', () => {
    const s2 = new THREE.Scene();
    build(s2);
    const hues = s2.children.filter((o) => o.userData?.pulse);
    expect(new Set(hues.map((h) => h.userData.pulse.hue)).size).toBe(hues.length);
    expect(hues.length).toBeGreaterThanOrEqual(3);
    assignShadowCasters(s2);
    scanFootprints(s2);
    mergeStaticProps(s2);
    for (const h of hues) { expect(s2.children).toContain(h); expect(h.castShadow).toBe(false); }
  });
});

describe('the light, the pulse and the glints', () => {
  const tier = (over) => ({ name: 'high', shadows: true, ...over });
  const make = (opts = {}) => {
    const scene = new THREE.Scene();
    build(scene);
    return { scene, l: createCrystalLight({ scene, ...opts }) };
  };
  const scalars = (l) => l.pulsing.map((p) => p.mat.color.r);
  it('a warm rose fog at the plan\'s distances', () => {
    const { scene } = make({ tier: tier() });
    expect(scene.fog.near).toBe(5);
    expect(scene.fog.far).toBe(38);
    expect(scene.fog.color.getHex()).toBe(P.CAVE_LOOK.fog);
  });
  it('on a full device the crystals pulse slowly (the colour moves, within the depth) and every glint is drawn', () => {
    const { l } = make({ tier: tier() });
    expect(l.glints.geometry.attributes.position.count).toBe(P.GLINT_COUNT);
    l.update(0.016, 0);
    const a = scalars(l);
    l.update(0.016, 2.5);
    const b = scalars(l);
    expect(b).not.toEqual(a);
    for (const v of [...a, ...b]) { expect(v).toBeGreaterThanOrEqual(1 - PULSE.depth - 1e-9); expect(v).toBeLessThanOrEqual(1 + PULSE.depth + 1e-9); }
  });
  it('LOW and LITE drop the pulse and half the glints', () => {
    for (const t of [tier({ name: 'low' }), tier({ shadows: false }), tier({ rung: 3 })]) {
      const { l } = make({ tier: t });
      expect(l.glints.geometry.attributes.position.count).toBe(P.GLINT_COUNT / 2);
      l.update(0.016, 0.7); l.update(0.016, 3.1);
      for (const v of scalars(l)) expect(v).toBe(1);
    }
  });
  it('reduced motion holds every crystal and glint still', () => {
    const { l } = make({ tier: tier(), reducedMotion: true });
    l.update(0.016, 0.7);
    const op = l.glints.material.opacity;
    l.update(0.016, 3.1);
    for (const v of scalars(l)) expect(v).toBe(1);
    expect(l.glints.material.opacity).toBe(op);
  });
  it('dispose puts the crystals back at their drawn colour', () => {
    const { l } = make({ tier: tier() });
    l.update(0.016, 1.1);
    l.dispose();
    for (const v of scalars(l)) expect(v).toBe(1);
  });
});

describe('the gate\'s landing', () => {
  it('every landing point of the crystal end is inside the cave bounds, clear of colliders, on the spawn court, facing the arch', async () => {
    const { TELE_ENDS } = await import('../src/teleport.js');
    const { arrivalFor } = await import('../src/gateways.js');
    const { area } = built();
    for (const e of TELE_ENDS.crystal) {
      const a = arrivalFor(e.twin, TELE_ENDS);
      expect(a.areaId).toBe('crystal');
      expect(inside(a.x, a.z, 2), JSON.stringify(a)).toBe(true);
      for (const c of area.colliders) expect(Math.hypot(a.x - c.x, a.z - c.z), JSON.stringify(c)).toBeGreaterThan(c.r + 1);
      expect(Math.hypot(a.x - P.CRYSTAL_SPAWN.x, a.z - P.CRYSTAL_SPAWN.z)).toBeLessThan(1);
      expect(e.z).toBe(P.ARCH.z);
      expect(e.x).toBe(P.ARCH.x);
    }
  });
});

describe('the traces', () => {
  it('the flat-trace and grow-trace fixtures were not touched by this milestone', () => {
    for (const f of ['test/fixtures/flat-trace.gameplay.json']) expect(() => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).not.toThrow();
    expect(read('src/world/crystal.js')).not.toMatch(/traversal(live)?\.js/);
  });
});
