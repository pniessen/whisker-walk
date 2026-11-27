// The Reef, milestone R1: the water world. The plan's coordinates against the built place, the dunes against the walk's slope rule, the spawn clear,
// every zone reachable on foot with no skills, the flat traces untouched, the kelp as an InstancedMesh through the walk's own sweeps (the plan's spike
// question), the light (fog, shimmer, shafts by tier) and reduced motion freezing the sway and the shimmer.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as P from '../src/world/reefplan.js';
import { build } from '../src/world/reef.js';
import { createReefLight, shimmerPixels, SHIMMER } from '../src/world/reeflight.js';
import { createReefLife } from '../src/world/reeflife.js';
import { bladeGeometry, BLADE_SEGMENTS } from '../src/world/reefparts.js';
import { STEP_MAX, MAX_GRADE, MAX_PATH_GRADE } from '../src/ground.js';
import { assignShadowCasters } from '../src/render/rig.js';
import { mergeStaticProps } from '../src/render/mergeprops.js';
import { scanFootprints } from '../src/render/contactshadows.js';
import { effectiveWear, isSuitId } from '../src/suithook.js';
import { suitKit } from '../src/suithook.js';
import { placeFloat, placePace } from '../src/placephysics.js';

const built = () => {
  const scene = new THREE.Scene();
  const area = build(scene);
  return { scene, area };
};
const B = P.REEF_BOUNDS;
const inside = (x, z, m = 0) => x >= B.minX + m && x <= B.maxX - m && z >= B.minZ + m && z <= B.maxZ - m;

describe('the plan', () => {
  it('is 96 x 84 with the spawn at (0, 36), inside, on level sand', () => {
    expect(B.maxX - B.minX).toBe(96);
    expect(B.maxZ - B.minZ).toBe(84);
    expect(P.REEF_SPAWN).toEqual({ x: 0, z: 36 });
    expect(inside(P.REEF_SPAWN.x, P.REEF_SPAWN.z, 2)).toBe(true);
    expect(P.reefY(0, 36)).toBeCloseTo(0, 6);
  });
  it('every coordinate of the plan is inside the bounds (zones, arch, ladder, buoy, foot, shafts, kelp, coral, colliders, wander spots)', () => {
    for (const z of P.ZONES) expect(inside(z.x, z.z), z.id).toBe(true);
    for (const o of [P.ARCH, P.LADDER, P.RING_BUOY, P.LADDER_FOOT, ...P.SHAFTS]) expect(inside(o.x, o.z), JSON.stringify(o)).toBe(true);
    for (const k of P.scatterKelp()) expect(inside(k.x, k.z, 1.5), JSON.stringify(k)).toBe(true);
    for (const k of P.scatterCoral()) expect(inside(k.x, k.z, 1.5), JSON.stringify(k)).toBe(true);
    for (const c of P.reefColliders()) expect(inside(c.x, c.z), JSON.stringify(c)).toBe(true);
    for (const p of P.REEF_POIS) expect(inside(p.x, p.z, 2)).toBe(true);
  });
  it('the scatters are pure: the same answer twice, and the counts are the plan\'s', () => {
    expect(P.scatterKelp()).toEqual(P.scatterKelp());
    expect(P.scatterCoral()).toEqual(P.scatterCoral());
    expect(P.scatterKelpAll().length).toBe(P.KELP_COUNT.garden + P.KELP_COUNT.outliers); // (the Sealab's footprint takes a few blades away after the scatter, R13: test/reeflab.test.js)
    expect(P.scatterCoral().length).toBeGreaterThan(30);
  });
  it('the dunes stay between 0 and 1.2 m and are never steeper than the walk\'s rule inside the bounds', () => {
    let hi = -1; let lo = 9; let steep = 0;
    const out = { x: 0, z: 0 };
    const g = P.createReefGround();
    for (let x = B.minX; x <= B.maxX; x += 1.5) {
      for (let z = B.minZ; z <= B.maxZ; z += 1.5) {
        const y = P.reefY(x, z);
        hi = Math.max(hi, y); lo = Math.min(lo, y);
        g.gradient(x, z, out);
        steep = Math.max(steep, Math.hypot(out.x, out.z));
      }
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(P.DUNE_MAX + 1e-9);
    expect(hi).toBeGreaterThan(0.8); // real dunes
    expect(steep).toBeLessThan(0.5);
    expect(steep).toBeLessThan(MAX_PATH_GRADE);
  });
  it('beyond the bounds the seabed rises softly (no wall) and is smooth', () => {
    expect(P.reefY(B.maxX + 8, 0)).toBeGreaterThan(P.reefY(B.maxX, 0));
    expect(Math.abs(P.reefY(B.maxX + 0.5, 0) - P.reefY(B.maxX, 0))).toBeLessThan(0.3);
  });
});

describe('the built place', () => {
  const { scene, area } = built();
  it('has the plan\'s bounds and spawn, no `waters`, the evening look, no strays, and nothing a later milestone owns', () => {
    expect(area.bounds).toEqual(B);
    expect(area.spawn).toEqual(P.REEF_SPAWN);
    expect(area.waters).toEqual([]);
    expect(area.evening).toBe(true);
    expect(area.strays).toBe(false);
    expect(area.collectibles).toHaveLength(8); // milestone R3: five shells and three pieces of sea-glass (test/reeffinds.test.js)
    expect(area.scenics).toHaveLength(5); // three, and the Deep's boat and cave (R8)
    for (const key of ['perches', 'tippables', 'boxes', 'critterSpawns', 'moments', 'puddles']) expect(area[key], key).toEqual([]);
    expect(area.ground.flat).toBe(false);
    expect(typeof area.life).toBe('function');
    expect(area.duskLight.fogNear).toBe(6);
    expect(area.duskLight.fogFar).toBe(40);
  });
  it('the spawn is clear: level, with no collider within 1.5 m of the paws and the arch\'s opening in front', () => {
    for (const c of area.colliders) expect(Math.hypot(c.x - 0, c.z - 36), JSON.stringify(c)).toBeGreaterThan(c.r + 1.5);
    expect(area.colliders.length).toBeGreaterThan(10);
  });
  it('every zone, wander spot and the ladder\'s foot is reachable on foot from the spawn with no skills (a grid walk round the colliders and past the slope rule)', () => {
    const g = area.ground;
    const step = 0.5;
    const nx = Math.round((B.maxX - B.minX) / step) + 1;
    const nz = Math.round((B.maxZ - B.minZ) / step) + 1;
    const key = (i, j) => j * nx + i;
    const free = (i, j) => {
      const x = B.minX + i * step; const z = B.minZ + j * step;
      return !area.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.3);
    };
    const start = [Math.round((P.REEF_SPAWN.x - B.minX) / step), Math.round((P.REEF_SPAWN.z - B.minZ) / step)];
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
    expect(reach(P.LADDER_FOOT.x, P.LADDER_FOOT.z)).toBe(true);
    expect(seen.size / (nx * nz)).toBeGreaterThan(0.85); // the seabed is one open region, not islands
  });
  it('the seabed mesh is the heightfield: its vertices sit on reefY and every triangle is inside the 130 m ground', () => {
    const ground = scene.children.find((o) => o.name === 'reef:ground');
    expect(ground).toBeTruthy();
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 29) {
      expect(pos.getY(i)).toBeCloseTo(P.reefY(pos.getX(i), pos.getZ(i)), 4);
      expect(Math.abs(pos.getX(i))).toBeLessThanOrEqual(P.GROUND_SIZE / 2 + 1e-6);
    }
    expect(ground.geometry.attributes.color).toBeTruthy(); // the ripples are vertex colours
  });
  it('the dive suit by place: the suit hook and the kit\'s own copy say `dive` for the reef and the registered kit dresses her cat', () => {
    expect(suitKit()).not.toBeNull(); // building the Reef registers the kit
    const own = { collar: 'bell', head: 'crown', face: null, neck: 'scarf', body: 'cape', back: 'backpack', feet: null };
    const worn = effectiveWear(own, 'reef');
    expect(isSuitId(worn.head) && isSuitId(worn.body) && isSuitId(worn.back) && isSuitId(worn.feet)).toBe(true);
    expect(worn.head).toBe('suit-helmet-dive');
    expect(worn.neck).toBeNull();
    expect(suitKit().dress(own, 'reef', false)).toEqual(worn);
    expect(suitKit().dress(own, 'reef', true)).toEqual(effectiveWear(own, 'reef', null, { hen: true }));
    expect(effectiveWear(own, 'seaside')).toBe(own);
    expect(own.collar).toBe('bell');
  });
  it('the reef\'s pace and float row come from the one reading site; the place takes no other place\'s row', () => {
    expect(placeFloat('reef')).toEqual({ floatMax: 2.2, rise: 1.2, sink: 0.6 });
    for (const p of ['moon', 'seaside', 'neighborhood', 'greenhouse', undefined, '__proto__', 'constructor']) expect(placeFloat(p), String(p)).toBeNull();
    expect(placePace(3.5, 'reef')).toBeCloseTo(2.45, 6);
  });
});

describe('the kelp: an InstancedMesh through the walk\'s own sweeps (the plan\'s spike question: yes)', () => {
  it('is ONE InstancedMesh with one instance per plan blade, never merged, never a caster, never a contact shadow', () => {
    const { scene } = built();
    const kelp = scene.children.filter((o) => o.isInstancedMesh && o.name === 'reef:kelp'); // (R5 adds the coral spires, a second InstancedMesh: test/reefwing.test.js)
    expect(kelp.map((k) => k.name)).toEqual(['reef:kelp']);
    expect(kelp[0].count).toBe(P.scatterKelp().length);
    expect(kelp[0].userData).toMatchObject({ noCast: true, noContactShadow: true, noMerge: true });
    // the walk's order: the caster sweep, the footprint scan, the prop merge
    assignShadowCasters(scene);
    expect(kelp[0].castShadow).toBe(false);
    const before = kelp[0].count;
    expect(scanFootprints(scene).length).toBeGreaterThanOrEqual(0); // runs over the scene with the kelp in it
    const decalsFromKelp = scene.children.filter((o) => o.userData?.noContactShadow);
    expect(decalsFromKelp).toContain(kelp[0]); // skipped by scanFootprints through the flag, not by luck
    mergeStaticProps(scene);
    const after = scene.children.filter((o) => o.isInstancedMesh && o.name === 'reef:kelp');
    expect(after).toEqual(kelp); // the very same object: not merged, not flattened to its first instance
    expect(after[0].count).toBe(before);
    expect(after[0].geometry.attributes.position.count).toBe(bladeGeometry().attributes.position.count);
  });
  it('the blade is two crossed ribbons of six segments, light at the tip and dark at the root', () => {
    const g = bladeGeometry();
    expect(g.attributes.position.count).toBe(2 * BLADE_SEGMENTS * 6);
    const pos = g.attributes.position; const col = g.attributes.color;
    let rootG = 0; let tipG = 0;
    for (let i = 0; i < pos.count; i++) { if (pos.getY(i) < 0.01) rootG = col.getY(i); if (pos.getY(i) > 0.99) tipG = col.getY(i); }
    expect(tipG).toBeGreaterThan(rootG);
  });
  it('the sway is a time uniform on the material: at rest (time 0) until the life advances it', () => {
    const { scene } = built();
    const kelp = scene.getObjectByName('reef:kelp');
    expect(kelp.material.userData.kelpTime.value).toBe(0);
  });
});

describe('the light', () => {
  const tier = (over) => ({ name: 'high', shadows: true, ...over });
  const life = (opts = {}) => {
    const scene = new THREE.Scene();
    build(scene);
    const l = createReefLife({ scene, doc: null, ...opts });
    return { scene, l };
  };
  it('a warm blue-green fog at the plan\'s distances; the shimmer is one quad at y 9; three additive shafts on a full device', () => {
    const { scene, l } = life({ tier: tier() });
    expect(scene.fog.near).toBe(6);
    expect(scene.fog.far).toBe(40);
    expect(scene.fog.color.getHex()).toBe(P.WATER_LOOK.horizon);
    expect(l.light.shimmer.position.y).toBe(9);
    expect(l.light.shimmer.geometry.attributes.position.count).toBe(4);
    expect(l.light.shafts).toHaveLength(3);
    for (const s of l.light.shafts) { expect(s.material.blending).toBe(THREE.AdditiveBlending); expect(s.material.depthWrite).toBe(false); }
    l.dispose();
  });
  it('the three shafts are dropped on the lite and low rungs (the transparent draws a phone feels)', () => {
    for (const t of [tier({ name: 'low', rung: 3 }), tier({ shadows: false }), tier({ rung: 4 })]) {
      const { l } = life({ tier: t });
      expect(l.light.shafts, JSON.stringify(t)).toHaveLength(0);
      expect(l.light.shimmer).toBeTruthy(); // the ceiling stays
      l.dispose();
    }
  });
  it('the shimmer tile is seamless (whole cycles) and mostly clear; the quad rides under the camera with the texture fixed in the world', () => {
    const px = shimmerPixels();
    const n = SHIMMER.size;
    const a = (i, j) => px[((j % n) * n + (i % n)) * 4 + 3];
    // continuity across the tile's edge is no bigger than between ordinary neighbours
    let edge = 0; let inner = 0;
    for (let j = 0; j < n; j++) { edge = Math.max(edge, Math.abs(a(n - 1, j) - a(0, j))); inner = Math.max(inner, Math.abs(a(10, j) - a(11, j))); }
    expect(edge).toBeLessThanOrEqual(inner + 40);
    const lit = px.filter((v, i) => i % 4 === 3 && v > 60).length / (n * n);
    expect(lit).toBeGreaterThan(0.05);
    expect(lit).toBeLessThan(0.6);
    const { l } = life({ tier: tier() });
    const cam = { position: new THREE.Vector3(7, 2, -3) };
    l.light.update(0, 0, cam);
    expect(l.light.shimmer.position.x).toBe(7);
    expect(l.light.shimmer.position.z).toBe(-3);
    expect(l.light.texture.offset.x).toBeCloseTo(7 / SHIMMER.tile, 6);
    l.dispose();
  });
  it('reduced motion freezes the scroll, the shafts\' breathing and the kelp\'s sway; motion on moves all three', () => {
    const run = (rm) => {
      const { scene, l } = life({ tier: tier(), reducedMotion: rm });
      const cam = { position: new THREE.Vector3(0, 2, 0) };
      const kelp = scene.getObjectByName('reef:kelp');
      const o0 = l.light.texture.offset.x; const a0 = l.light.shafts[0].material.opacity;
      for (let k = 1; k <= 30; k++) l.update(0.1, k * 0.1, new THREE.Vector3(), cam, null);
      const r = { scroll: l.light.texture.offset.x - o0, breath: l.light.shafts[0].material.opacity - a0, sway: kelp.material.userData.kelpTime.value };
      l.dispose();
      return r;
    };
    const still = run(true);
    expect(still).toEqual({ scroll: 0, breath: 0, sway: 0 });
    const live = run(false);
    expect(live.scroll).toBeGreaterThan(0);
    expect(live.breath).not.toBe(0);
    expect(live.sway).toBeGreaterThan(2);
  });
});

describe('the Reef is off for everything the walk rolls', () => {
  it('no strays (and with them no ghosts, wanderer, rival or clan cats), no weather (evening), no yard dog, goals only of the kinds she can finish', () => {
    const { area } = built();
    expect(area.strays).toBe(false);
    expect(area.evening).toBe(true);
    expect(area.goalTypes).toEqual(['collectible', 'photo', 'scenic']);
    expect(area.critterSpawns).toEqual([]);
    expect(area.waters).toEqual([]);
  });
});

describe('every other place is byte-for-byte what it was', () => {
  it('the flat-trace and grow-trace fixtures were not touched by this milestone', () => {
    // the fixtures are read by test/flattrace*.test.js and test/growtrace*.test.js; this file only pins that the Reef\'s own sources never name them
    for (const f of ['src/world/reefplan.js', 'src/world/reefparts.js', 'src/world/reeflight.js', 'src/world/reeflife.js', 'src/world/reefair.js']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/traversal(live)?\.js/);
    }
  });
});
