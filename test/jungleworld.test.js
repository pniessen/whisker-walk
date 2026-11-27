// The Jungle lodge, milestone J1: the jungle world. The plan's coordinates against the built place, the ground against the walk's slope rule, the spawn clear, every zone reachable
// on foot with no skills (the river is shallows: no swimming), the hard rules (open sky, one light, indoor list), the mist, the seeded rain schedule and its shelter and rainbow, the
// tiers and reduced motion, the gate pair and the staged chunks' slots.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as P from '../src/world/jungleplan.js';
import { build } from '../src/world/jungle.js';
import { createJungleLight, dropAt, mistAt } from '../src/world/junglelight.js';
import { ST, loadJungleStages } from '../src/world/junglestages.js';
import { groundGeometry, waterGeometry } from '../src/world/jungleparts.js';
import { MAX_PATH_GRADE } from '../src/ground.js';
import { assignShadowCasters } from '../src/render/rig.js';
import { mergeStaticProps } from '../src/render/mergeprops.js';
import { scanFootprints } from '../src/render/contactshadows.js';
import { phrase } from '../src/clanphrases.js';
import { bannedIn } from './helpers/offwords.js';

const built = () => {
  const scene = new THREE.Scene();
  const area = build(scene);
  return { scene, area };
};
const B = P.JUNGLE_BOUNDS;
const inside = (x, z, m = 0) => x >= B.minX + m && x <= B.maxX - m && z >= B.minZ + m && z <= B.maxZ - m;
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('the plan', () => {
  it('is 88 x 76 with the spawn at (0, 32), inside, on level ground', () => {
    expect(B.maxX - B.minX).toBe(88);
    expect(B.maxZ - B.minZ).toBe(76);
    expect(P.JUNGLE_SPAWN).toEqual({ x: 0, z: 32 });
    expect(P.jungleY(0, 32)).toBeCloseTo(0, 6);
  });
  it('every coordinate of the plan is inside the bounds (zones, ring, lodge, river, colliders, wander spots, mist)', () => {
    for (const z of P.ZONES) expect(inside(z.x, z.z), z.id).toBe(true);
    expect(inside(P.RING.x, P.RING.z)).toBe(true);
    expect(inside(P.LODGE.x0, P.LODGE.z0) && inside(P.LODGE.x1, P.LODGE.z1)).toBe(true);
    for (const l of P.LEAVES) expect(inside(l.x, l.z, 2), JSON.stringify(l)).toBe(true);
    for (const c of P.jungleColliders()) expect(inside(c.x, c.z), JSON.stringify(c)).toBe(true);
    for (const p of P.JUNGLE_POIS) expect(inside(p.x, p.z, 2)).toBe(true);
    for (const m of P.scatterMist()) expect(inside(m.x, m.z)).toBe(true);
    expect(P.JUNGLE_POIS.length).toBeGreaterThan(10);
  });
  it('the scatters are pure: the same answer twice, trees stand inside the walk and a green wall beyond it', () => {
    expect(P.scatterTrees()).toEqual(P.scatterTrees());
    expect(P.scatterFerns()).toEqual(P.scatterFerns());
    expect(P.scatterStones()).toEqual(P.scatterStones());
    expect(P.scatterMist()).toHaveLength(P.MIST_COUNT);
    const trees = P.scatterTrees();
    expect(trees.filter((k) => !k.rim).length).toBeGreaterThan(30);
    expect(trees.filter((k) => k.rim).length).toBeGreaterThan(40);
    for (const k of trees.filter((t) => t.rim)) expect(inside(k.x, k.z), JSON.stringify(k)).toBe(false);
  });
  it('nothing small stands where a later milestone will put Mossy, a fruit, the table or a mouse (the keep-out circles), nor in the river or on the lodge', () => {
    for (const k of [...P.scatterTrees().filter((f) => !f.rim), ...P.scatterFerns(), ...P.scatterStones()]) {
      for (const [kx, kz, kr] of P.KEEP_OUT) expect(Math.hypot(k.x - kx, k.z - kz), JSON.stringify(k)).toBeGreaterThanOrEqual(kr);
      expect(P.riverDist(k.x, k.z), JSON.stringify(k)).toBeGreaterThan(P.RIVER_W);
      expect(k.x > P.LODGE.x0 && k.x < P.LODGE.x1 && k.z > P.LODGE.z0 && k.z < P.LODGE.z1, JSON.stringify(k)).toBe(false);
    }
  });
  it('the ground runs from the river bed (-0.24 m) to the canopy rise (1.4 m) and is never steeper than 0.5 (nor the walk\'s path grade) inside the bounds', () => {
    let hi = -1; let lo = 9; let steep = 0;
    const out = { x: 0, z: 0 };
    const g = P.createJungleGround();
    for (let x = B.minX; x <= B.maxX; x += 0.5) {
      for (let z = B.minZ; z <= B.maxZ; z += 0.5) {
        const y = P.jungleY(x, z);
        hi = Math.max(hi, y); lo = Math.min(lo, y);
        g.gradient(x, z, out);
        steep = Math.max(steep, Math.hypot(out.x, out.z));
      }
    }
    expect(lo).toBeGreaterThanOrEqual(-0.6);
    expect(lo).toBeLessThan(-0.15); // a real river bed
    expect(hi).toBeLessThanOrEqual(1.8);
    expect(hi).toBeGreaterThan(1.2); // a real rise
    expect(steep).toBeLessThan(0.5);
    expect(steep).toBeLessThan(MAX_PATH_GRADE);
  });
  it('the ring court, the lodge deck and the log bridge are level enough to stand on, and beyond the bounds the ground carries on level', () => {
    for (const [x, z] of [[0, 32], [5, 31], [-6, 17], [-6, 12]]) expect(Math.abs(P.jungleY(x, z) - (z < 20 && z > 9 ? P.LODGE.deck : 0)), `${x},${z}`).toBeLessThan(0.03);
    expect(P.jungleY(B.maxX + 8, 0)).toBe(P.jungleY(B.maxX, 0));
    expect(P.jungleY(10, -6)).toBeLessThan(-0.15); // she wades the river at the bridge
  });
});

describe('the hard rules', () => {
  it('open sky: ground.ceil is endless, no ceil flag, not an indoor area, no zoom cap', () => {
    const { scene, area } = built();
    expect(area.ground.ceil(0, 0)).toBe(Infinity);
    expect(area.ground.ceil(-6, 17)).toBe(Infinity);
    scene.traverse((o) => expect(o.userData?.ceil).toBeFalsy());
    expect(read('src/world/areas.js')).not.toMatch(/INDOOR_AREAS[^;]*jungle/s);
    expect(read('src/camzoom.js')).not.toMatch(/jungle/);
  });
  it('exactly one PointLight in the whole place (the veranda lantern\'s), at a steady intensity (and none in the life)', () => {
    const { scene } = built();
    const lights = [];
    scene.traverse((o) => { if (o.isPointLight) lights.push(o); });
    expect(lights).toHaveLength(1);
    expect(lights[0].intensity).toBeGreaterThan(0);
    createJungleLight({ scene, tier: { name: 'high', shadows: true }, reducedMotion: false });
    const after = [];
    scene.traverse((o) => { if (o.isPointLight) after.push(o); });
    expect(after).toHaveLength(1);
  });
  it('no swimming: no `waters` entry, the river bed is never deeper than a cat can wade', () => {
    const { area } = built();
    expect(area.waters).toEqual([]);
    expect(area.waterFx).toEqual([]);
    expect(P.RIVER_DEPTH).toBeLessThanOrEqual(0.3);
  });
  it('draws no random number and reads no clock: no Math.random, Date or performance in the J1 files', () => {
    for (const f of ['jungleplan', 'jungleparts', 'junglelight', 'jungle']) {
      const src = read(`src/world/${f}.js`).replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|new Date|performance\.now/);
    }
  });
  it('no literal Clan word and no banned word in the J1 files or lines', () => {
    for (const f of ['jungleplan', 'jungleparts', 'junglelight', 'junglewords', 'jungle', 'junglestages']) {
      expect(read(`src/world/${f}.js`), f).not.toMatch(/\bClan\b/);
    }
    for (const id of ['jungle.rain', 'jungle.rainbow']) expect(bannedIn(phrase(id)), id).toBeNull();
  });
});

describe('the built place', () => {
  const { scene, area } = built();
  it('has the plan\'s bounds and spawn, no `waters`, the evening switch, no strays, and nothing a later milestone owns', () => {
    expect(area.name).toBe('The Jungle Lodge');
    expect(area.bounds).toEqual(B);
    expect(area.spawn).toEqual(P.JUNGLE_SPAWN);
    expect(area.evening).toBe(true);
    expect(area.strays).toBe(false);
    expect(area.collectibles).toEqual([]);
    expect(area.perches).toEqual([]);
    for (const key of ['tippables', 'boxes', 'critterSpawns', 'moments', 'puddles']) expect(area[key], key).toEqual([]);
    expect(area.ground.flat).toBe(false);
    expect(typeof area.life).toBe('function');
    expect(area.duskLight.fogFar).toBe(P.JUNGLE_LOOK.fogFar);
  });
  it('the spawn is clear: no collider within 1.5 m of the paws, and the ring\'s two front stones flank the gate at (0, 28)', () => {
    for (const c of area.colliders) expect(Math.hypot(c.x - 0, c.z - 32), JSON.stringify(c)).toBeGreaterThan(c.r + 1.5);
    expect(area.colliders.filter((c) => c.z === 28)).toHaveLength(2);
    expect(area.colliders.length).toBeGreaterThan(40);
  });
  it('every zone, wander spot and keep-out spot is reachable on foot from the spawn with no skills, across the river (and the open ground is almost all one piece)', () => {
    const g = area.ground;
    const step = 0.5;
    const nx = Math.round((B.maxX - B.minX) / step) + 1;
    const nz = Math.round((B.maxZ - B.minZ) / step) + 1;
    const key = (i, j) => j * nx + i;
    const free = (i, j) => {
      const x = B.minX + i * step; const z = B.minZ + j * step;
      return !area.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.3);
    };
    const start = [Math.round((P.JUNGLE_SPAWN.x - B.minX) / step), Math.round((P.JUNGLE_SPAWN.z - B.minZ) / step)];
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
    for (const [kx, kz] of P.KEEP_OUT.filter(([kx, kz]) => !area.colliders.some((c) => Math.hypot(kx - c.x, kz - c.z) < c.r + 0.4))) expect(reach(kx, kz), `${kx},${kz}`).toBe(true);
    expect(reach(-6, 17)).toBe(true); // the veranda
    for (const [x, z] of [[-24.4 + 0.8, 3.2], [-9.4 + 1.2, 16.6 + 0.8], [-5.8 - 1.6, 15.4]]) expect(reach(x, z), `${x},${z}`).toBe(true); // chapter one: the mango, the table, Mossy (J2)
    expect(reach(10, -12)).toBe(true); // north of the river (the canopy walk's side)
    expect(seen.size / (nx * nz)).toBeGreaterThan(0.85);
  });
  it('the ground mesh is the function: its vertices sit on jungleY, and it is the walk\'s ground; the water lies under the banks', () => {
    const ground = scene.children.find((o) => o.name === 'jungle:ground');
    expect(ground.userData.ground).toBe(true);
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 29) expect(pos.getY(i)).toBeCloseTo(P.jungleY(pos.getX(i), pos.getZ(i)), 4);
    expect(groundGeometry().attributes.color.count).toBe(pos.count);
    const w = waterGeometry().attributes.position;
    for (let i = 0; i < w.count; i += 7) expect(w.getY(i), `water ${i}`).toBeLessThan(P.jungleY(w.getX(i), w.getZ(i)) + 0.2);
  });
  it('a handful of merged meshes, and the walk\'s sweeps leave the kit whole (never merged further, the glow never a caster)', () => {
    const s2 = new THREE.Scene();
    build(s2);
    const meshes = [];
    s2.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBeLessThanOrEqual(10);
    assignShadowCasters(s2);
    scanFootprints(s2);
    mergeStaticProps(s2);
    for (const m of meshes) expect(s2.children).toContain(m);
    expect(s2.getObjectByName('jungle:glowSoft').castShadow).toBe(false);
  });
  it('the lodge has warm windows and its roof covers the whole veranda (so it is a shelter)', () => {
    expect(P.VERANDA.x0).toBeGreaterThanOrEqual(P.LODGE.x0);
    expect(P.VERANDA.x1).toBeLessThanOrEqual(P.LODGE.x1);
    expect(P.sheltered(-6, 17)).toBe(true);
    expect(P.sheltered(-6, 12)).toBe(false); // (inside the walls is not a place she can stand)
    expect(P.sheltered(0, 32)).toBe(false);
    for (const l of P.LEAVES) expect(P.sheltered(l.x, l.z), JSON.stringify(l)).toBe(true);
    expect(scene.getObjectByName('jungle:glowSoft').geometry.attributes.position.count).toBeGreaterThan(40);
  });
});

describe('the rain schedule: seeded, repeating, never at the very start', () => {
  const S = P.createRainSchedule();
  it('is a pure function of the time: the same twice, and the same from two fresh schedules, whatever order it is asked in', () => {
    const T = [0, 10, 44.9, 100, 300.5, 1234, 5000, 3.2];
    const a = T.map((t) => [S.phase(t), S.intensity(t), S.rainbow(t)]);
    const S2 = P.createRainSchedule();
    expect([...T].reverse().map((t) => [S2.phase(t), S2.intensity(t), S2.rainbow(t)]).reverse()).toEqual(a);
    expect(a).toEqual(T.map((t) => [S.phase(t), S.intensity(t), S.rainbow(t)]));
  });
  it('another seed gives another day; the default is the plan\'s', () => {
    const other = P.createRainSchedule(0x1234);
    const times = [...Array(60)].map((_, i) => i * 17);
    expect(times.map((t) => other.phase(t))).not.toEqual(times.map((t) => S.phase(t)));
    expect(P.rainSchedule.phase(500)).toBe(S.phase(500));
  });
  it('no shower in the first 45 s; then each cycle is clear, a 30 s shower, a 20 s rainbow, over and over (so a show always has rain to land on)', () => {
    for (let t = 0; t < P.RAIN.firstClear; t += 1) expect(S.phase(t), `t ${t}`).toBe('clear');
    let showers = 0; let prev = 'clear'; let rainFor = 0;
    for (let t = 0; t <= 3000; t += 0.5) {
      const ph = S.phase(t);
      if (ph === 'rain') rainFor += 0.5;
      if (ph !== prev) { if (ph === 'rain') showers++; if (prev === 'rain') { expect(rainFor).toBeCloseTo(P.RAIN.shower, 6); rainFor = 0; } prev = ph; }
    }
    expect(showers).toBeGreaterThanOrEqual(20); // every 105 to 135 s or so
    for (let t = 0; t < 3000; t += 7) { const c = S.cycleAt(t); expect(c.bowAt - c.rainAt).toBe(P.RAIN.shower); expect(c.end - c.bowAt).toBe(P.RAIN.rainbow); expect(c.rainAt - c.start).toBeGreaterThanOrEqual((c.start === 0 ? P.RAIN.firstClear : P.RAIN.clearMin) - 1e-9); }
  });
  it('the shower eases in and out (0 to 1 over 3 s), is full mid-shower, and the rainbow follows it and fades; a nonsense time is just clear', () => {
    const c = S.cycleAt(300);
    expect(S.intensity(c.rainAt - 1)).toBe(0);
    expect(S.intensity(c.rainAt + 1.5)).toBeGreaterThan(0.3);
    expect(S.intensity(c.rainAt + 15)).toBe(1);
    expect(S.intensity(c.bowAt + 1)).toBe(0);
    expect(S.rainbow(c.rainAt + 5)).toBe(0);
    expect(S.rainbow(c.bowAt + 10)).toBe(1);
    expect(S.rainbow(c.end + 0.5)).toBeLessThan(1);
    for (const t of [NaN, -5, undefined, Infinity]) { expect(S.phase(t)).toBe(t === Infinity ? S.phase(1e6) : 'clear'); expect(Number.isFinite(S.intensity(t))).toBe(true); }
  });
});

describe('the mist, the rain, the rainbow and the lantern', () => {
  const tier = (over) => ({ name: 'high', shadows: true, ...over });
  const make = (opts = {}) => {
    const scene = new THREE.Scene();
    build(scene);
    return { scene, l: createJungleLight({ scene, ...opts }) };
  };
  const rainTime = (() => { const c = P.rainSchedule.cycleAt(300); return c.rainAt + 15; })();
  const bowTime = (() => { const c = P.rainSchedule.cycleAt(300); return c.bowAt + 10; })();
  const open = { x: 0, z: 32 };
  it('a full device draws the plan\'s 110 streaks in a shower and none in the clear; they fall and stay in a box round her', () => {
    const { l } = make({ tier: tier() });
    expect(l.rain.geometry.attributes.position.count).toBe(P.DROPS.count * 2);
    l.update(0.016, 10, open);
    expect(l.rain.visible).toBe(false);
    l.update(0.016, rainTime, open);
    expect(l.rain.visible).toBe(true);
    expect(l.rain.material.opacity).toBeGreaterThan(0.3);
    const a = Array.from(l.rain.geometry.attributes.position.array);
    l.update(0.016, rainTime + 0.4, open);
    expect(Array.from(l.rain.geometry.attributes.position.array)).not.toEqual(a);
    for (let i = 0; i < P.DROPS.count; i++) {
      const d = dropAt(i, 4, 20, -10);
      expect(Math.abs(d.x - 20)).toBeLessThanOrEqual(P.DROPS.box + 0.6);
      expect(Math.abs(d.z + 10)).toBeLessThanOrEqual(P.DROPS.box + 0.6);
      expect(d.y - P.jungleY(d.x, d.z)).toBeGreaterThanOrEqual(0);
      expect(d.y - P.jungleY(d.x, d.z)).toBeLessThanOrEqual(P.DROPS.top);
      expect(d.y2).toBeGreaterThan(d.y);
    }
  });
  it('the drops and the mist are pure functions of the index, the time and where she is', () => {
    expect(dropAt(7, 12.5, 3, 4)).toEqual(dropAt(7, 12.5, 3, 4));
    expect(dropAt(7, 12.5, 3, 4)).not.toEqual(dropAt(8, 12.5, 3, 4));
    const m = P.scatterMist()[3];
    expect(mistAt(m, 20)).toEqual(mistAt(m, 20));
    expect(mistAt(m, 20)).not.toEqual(mistAt(m, 40));
  });
  it('under the veranda or a giant leaf the rain is hidden round her (it eases off, not a snap), and it is back in the open', () => {
    const { l } = make({ tier: tier() });
    l.update(0.016, rainTime, open);
    const wet = l.rain.material.opacity;
    for (let k = 0; k < 40; k++) l.update(0.05, rainTime + 0.1 * k, { x: -6, z: 17 });
    expect(l.state.cover).toBeGreaterThan(0.95);
    expect(l.rain.material.opacity).toBeLessThan(wet * 0.15);
    for (let k = 0; k < 40; k++) l.update(0.05, rainTime + 4 + 0.1 * k, { x: 0, z: 32 });
    expect(l.rain.material.opacity).toBeGreaterThan(wet * 0.9);
    const leaf = P.LEAVES[0];
    for (let k = 0; k < 40; k++) l.update(0.05, rainTime + 8 + 0.1 * k, { x: leaf.x, z: leaf.z });
    expect(l.rain.material.opacity).toBeLessThan(wet * 0.15);
  });
  it('a rainbow follows the shower, fading in and out, and only then', () => {
    const { l } = make({ tier: tier() });
    l.update(0.016, rainTime, open);
    expect(l.rainbow.visible).toBe(false);
    l.update(0.016, bowTime, open);
    expect(l.rainbow.visible).toBe(true);
    expect(l.rainbow.material.opacity).toBeGreaterThan(0.3);
    l.update(0.016, 20, open);
    expect(l.rainbow.visible).toBe(false);
  });
  it('LOW and LITE draw half the streaks and half the mist and keep the light steady', () => {
    for (const t of [tier({ name: 'low' }), tier({ shadows: false }), tier({ rung: 3 })]) {
      const { l } = make({ tier: t });
      expect(l.rain.geometry.attributes.position.count).toBe(P.DROPS.low * 2);
      expect(l.mist.geometry.attributes.position.count).toBe(P.MIST_COUNT / 2);
      const base = l.light.intensity;
      l.update(0.016, 0.7, open); l.update(0.016, 3.1, open);
      expect(l.light.intensity).toBe(base);
    }
  });
  it('reduced motion: no rain at all (even in a shower), the mist held still, the light steady, and the rainbow shows or hides without fading', () => {
    const { l } = make({ tier: tier(), reducedMotion: true });
    expect(l.rain.geometry.attributes.position.count).toBe(0);
    l.update(0.016, rainTime, open);
    expect(l.rain.visible).toBe(false);
    const a = Array.from(l.mist.geometry.attributes.position.array);
    const li = l.light.intensity;
    l.update(0.016, rainTime + 9.1, { x: 3, z: 20 });
    expect(Array.from(l.mist.geometry.attributes.position.array)).toEqual(a);
    expect(l.light.intensity).toBe(li);
    const c = P.rainSchedule.cycleAt(300);
    l.update(0.016, c.bowAt + 1, open); // one second into the rainbow: it is simply there, at its steady strength
    expect(l.rainbow.visible).toBe(true);
    const o1 = l.rainbow.material.opacity;
    l.update(0.016, c.bowAt + 5, open);
    expect(l.rainbow.material.opacity).toBe(o1);
  });
  it('on a full device the lantern breathes a little, within a tenth or so; the mist drifts', () => {
    const { l } = make({ tier: tier() });
    const seen = new Set();
    for (let t = 0; t < 4; t += 0.37) { l.update(0.016, t, open); seen.add(l.light.intensity.toFixed(3)); }
    expect(seen.size).toBeGreaterThan(3);
    for (const v of seen) expect(Math.abs(Number(v) - 1.5)).toBeLessThan(0.3);
    const m = Array.from(l.mist.geometry.attributes.position.array);
    l.update(0.016, 60, open);
    expect(Array.from(l.mist.geometry.attributes.position.array)).not.toEqual(m);
  });
  it('the two soft lines are said once a walk each, when the shower and the rainbow come', async () => {
    const { bus } = await import('../src/events.js');
    const said = [];
    const off = bus.on?.('discovery', (e) => said.push(e.key));
    const { l } = make({ tier: tier() });
    for (let k = 0; k < 4; k++) { l.update(0.05, rainTime + k, open); l.update(0.05, bowTime + k, open); }
    off?.();
    expect(said.filter((k) => k === 'jungle-rain')).toHaveLength(1);
    expect(said.filter((k) => k === 'jungle-rainbow')).toHaveLength(1);
  });
});

describe('the staged chunks\' slots', () => {
  it('stage A builds with the two slots empty, and both stage modules fill their slot', async () => {
    expect(ST.b).toBeUndefined();
    expect(ST.c).toBeUndefined();
    await loadJungleStages();
    expect(ST.b).toBeTruthy();
    expect(ST.c).toBeTruthy();
    expect(await loadJungleStages()).toBe(ST);
  });
});
