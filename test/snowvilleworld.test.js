// Snowville, milestone V1: the snow world. The plan's coordinates against the built place, the ground against the walk's slope rule, the spawn clear, every zone reachable
// on foot with no skills, the hard rules (open sky, one light, indoor list), the flakes and glints by tier, reduced motion, the cheeks theme (never a failure), the footprints
// (one draw, other areas byte-identical), the gate pair and the staged chunks' slots.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as P from '../src/world/snowvilleplan.js';
import { build } from '../src/world/snowville.js';
import { createSnowvilleLight, flakeAt, CHEEK_PINK } from '../src/world/snowvillelight.js';
import { coldStep, cheekTint, lineStep, nearWarm, COLD } from '../src/world/snowvillewarmth.js';
import { ST, loadSnowvilleStages } from '../src/world/snowvillestages.js';
import { groundGeometry } from '../src/world/snowvilleparts.js';
import { MAX_PATH_GRADE } from '../src/ground.js';
import { assignShadowCasters } from '../src/render/rig.js';
import { mergeStaticProps } from '../src/render/mergeprops.js';
import { scanFootprints } from '../src/render/contactshadows.js';
import { AREA_RULES, SURFACES, surfaceAt, createPawPrints, createTrail } from '../src/render/pawprints.js';
import { mulberry32 } from '../src/rng.js';
import { phrase } from '../src/clanphrases.js';
import { bannedIn } from './helpers/offwords.js';

const built = () => {
  const scene = new THREE.Scene();
  const area = build(scene);
  return { scene, area };
};
const B = P.SNOWVILLE_BOUNDS;
const inside = (x, z, m = 0) => x >= B.minX + m && x <= B.maxX - m && z >= B.minZ + m && z <= B.maxZ - m;
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('the plan', () => {
  it('is 80 x 72 with the spawn at (0, 30), inside, on level snow', () => {
    expect(B.maxX - B.minX).toBe(80);
    expect(B.maxZ - B.minZ).toBe(72);
    expect(P.SNOWVILLE_SPAWN).toEqual({ x: 0, z: 30 });
    expect(P.snowY(0, 30)).toBeCloseTo(0, 6);
  });
  it('every coordinate of the plan is inside the bounds (zones, arch, cottages, colliders, wander spots, glints)', () => {
    for (const z of P.ZONES) expect(inside(z.x, z.z), z.id).toBe(true);
    expect(inside(P.ARCH.x, P.ARCH.z)).toBe(true);
    for (const c of P.COTTAGES) expect(inside(c.x, c.z, 3), c.id).toBe(true);
    for (const c of P.snowvilleColliders()) expect(inside(c.x, c.z), JSON.stringify(c)).toBe(true);
    for (const p of P.SNOWVILLE_POIS) expect(inside(p.x, p.z, 2)).toBe(true);
    for (const g of P.scatterGlints()) expect(inside(g.x, g.z)).toBe(true);
    expect(P.SNOWVILLE_POIS.length).toBeGreaterThan(8);
  });
  it('the scatters are pure: the same answer twice, and a wood of firs stands inside the walk and a treeline beyond it', () => {
    expect(P.scatterFirs()).toEqual(P.scatterFirs());
    expect(P.scatterDrifts()).toEqual(P.scatterDrifts());
    expect(P.scatterRocks()).toEqual(P.scatterRocks());
    expect(P.scatterGlints()).toHaveLength(P.GLINT_COUNT);
    const firs = P.scatterFirs();
    expect(firs.filter((k) => !k.rim).length).toBeGreaterThan(30);
    expect(firs.filter((k) => k.rim).length).toBeGreaterThan(40);
    for (const k of firs.filter((f) => f.rim)) expect(inside(k.x, k.z), JSON.stringify(k)).toBe(false);
  });
  it('nothing small stands where a later milestone will put Tilly, a lantern, a candle or a mouse (the keep-out circles)', () => {
    for (const k of [...P.scatterFirs().filter((f) => !f.rim), ...P.scatterDrifts(), ...P.scatterRocks()]) {
      for (const [kx, kz, kr] of P.KEEP_OUT) expect(Math.hypot(k.x - kx, k.z - kz), JSON.stringify(k)).toBeGreaterThanOrEqual(kr);
    }
  });
  it('the ground stays between 0 and the hill\'s 3 m and is never steeper than 0.5 (nor the walk\'s path grade) inside the bounds', () => {
    let hi = -1; let lo = 9; let steep = 0;
    const out = { x: 0, z: 0 };
    const g = P.createSnowvilleGround();
    for (let x = B.minX; x <= B.maxX; x += 1) {
      for (let z = B.minZ; z <= B.maxZ; z += 1) {
        const y = P.snowY(x, z);
        hi = Math.max(hi, y); lo = Math.min(lo, y);
        g.gradient(x, z, out);
        steep = Math.max(steep, Math.hypot(out.x, out.z));
      }
    }
    expect(lo).toBeGreaterThanOrEqual(-0.25);
    expect(hi).toBeLessThanOrEqual(3.3);
    expect(hi).toBeGreaterThan(2.5); // a real hill
    expect(steep).toBeLessThan(0.5);
    expect(steep).toBeLessThan(MAX_PATH_GRADE);
  });
  it('the court, the square and the pond are flat enough to stand on, and beyond the bounds the ground carries on level', () => {
    for (const [x, z] of [[0, 30], [5, 31], [-4, 8], [-8, 10], [P.POND.x, P.POND.z]]) expect(Math.abs(P.snowY(x, z)), `${x},${z}`).toBeLessThan(0.02);
    expect(P.snowY(B.maxX + 8, 0)).toBe(P.snowY(B.maxX, 0));
  });
});

describe('the hard rules', () => {
  it('open sky: ground.ceil is endless, no ceil flag, not an indoor area, no zoom cap', () => {
    const { scene, area } = built();
    expect(area.ground.ceil(0, 0)).toBe(Infinity);
    expect(area.ground.ceil(22, -18)).toBe(Infinity);
    scene.traverse((o) => expect(o.userData?.ceil).toBeFalsy());
    expect(read('src/world/areas.js')).not.toMatch(/INDOOR_AREAS[^;]*snowville/s);
    expect(read('src/camzoom.js')).not.toMatch(/snowville/);
  });
  it('exactly one PointLight in the whole place (the brazier\'s), at a steady intensity (and none in the life)', () => {
    const { scene } = built();
    const lights = [];
    scene.traverse((o) => { if (o.isPointLight) lights.push(o); });
    expect(lights).toHaveLength(1);
    expect(lights[0].intensity).toBeGreaterThan(0);
    createSnowvilleLight({ scene, tier: { name: 'high', shadows: true }, reducedMotion: false });
    const after = [];
    scene.traverse((o) => { if (o.isPointLight) after.push(o); });
    expect(after).toHaveLength(1);
  });
  it('draws no random number and reads no clock: no Math.random, Date or performance in the V1 files', () => {
    for (const f of ['snowvilleplan', 'snowvilleparts', 'snowvillelight', 'snowvillewarmth', 'snowville']) {
      const src = read(`src/world/${f}.js`).replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|new Date|performance\.now/);
    }
  });
  it('no literal Clan word and no banned word in the V1 files or lines', () => {
    for (const f of ['snowvilleplan', 'snowvilleparts', 'snowvillelight', 'snowvillewarmth', 'snowvillewords', 'snowville']) {
      const src = read(`src/world/${f}.js`);
      expect(src, f).not.toMatch(/\bClan\b/);
    }
    for (const id of ['snowville.cold', 'snowville.warm']) expect(bannedIn(phrase(id)), id).toBeNull();
  });
});

describe('the built place', () => {
  const { scene, area } = built();
  it('has the plan\'s bounds and spawn, no `waters`, the evening switch, no strays, and nothing a later milestone owns', () => {
    expect(area.name).toBe('Snowville');
    expect(area.bounds).toEqual(B);
    expect(area.spawn).toEqual(P.SNOWVILLE_SPAWN);
    expect(area.waters).toEqual([]);
    expect(area.evening).toBe(true);
    expect(area.strays).toBe(false);
    expect(area.collectibles).toEqual([]);
    expect(area.perches).toEqual([]);
    for (const key of ['tippables', 'boxes', 'critterSpawns', 'moments', 'puddles']) expect(area[key], key).toEqual([]);
    expect(area.ground.flat).toBe(false);
    expect(typeof area.life).toBe('function');
    expect(area.duskLight.fogFar).toBe(120);
  });
  it('the spawn is clear: no collider within 1.5 m of the paws, and the arch\'s two pillars flank it at (0, 26.5)', () => {
    for (const c of area.colliders) expect(Math.hypot(c.x - 0, c.z - 30), JSON.stringify(c)).toBeGreaterThan(c.r + 1.5);
    expect(area.colliders.filter((c) => c.z === 26.5)).toHaveLength(2);
    expect(area.colliders.length).toBeGreaterThan(40);
  });
  it('every zone, wander spot and the square\'s places is reachable on foot from the spawn with no skills (and the open ground is almost all one piece)', () => {
    const g = area.ground;
    const step = 0.5;
    const nx = Math.round((B.maxX - B.minX) / step) + 1;
    const nz = Math.round((B.maxZ - B.minZ) / step) + 1;
    const key = (i, j) => j * nx + i;
    const free = (i, j) => {
      const x = B.minX + i * step; const z = B.minZ + j * step;
      return !area.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.3);
    };
    const start = [Math.round((P.SNOWVILLE_SPAWN.x - B.minX) / step), Math.round((P.SNOWVILLE_SPAWN.z - B.minZ) / step)];
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
    for (const z of P.ZONES) expect(reach(z.x, z.z + (z.id === 'square' ? 2.5 : 0)), z.id).toBe(true); // (the square's own middle is the village fir)
    for (const p of area.pois) expect(reach(p.x, p.z), JSON.stringify(p)).toBe(true);
    for (const [kx, kz] of P.KEEP_OUT.filter(([kx, kz]) => !area.colliders.some((c) => Math.hypot(kx - c.x, kz - c.z) < c.r + 0.4))) expect(reach(kx, kz), `${kx},${kz}`).toBe(true);
    for (const [wx, wz] of P.WARM_SPOTS) expect(reach(wx - 1.5, wz), `warm ${wx},${wz}`).toBe(true); // (a cat's length from the fire)
    expect(seen.size / (nx * nz)).toBeGreaterThan(0.85);
  });
  it('the ground mesh is the function: its vertices sit on snowY, and it is the walk\'s ground', () => {
    const ground = scene.children.find((o) => o.name === 'snowville:ground');
    expect(ground.userData.ground).toBe(true);
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 29) expect(pos.getY(i)).toBeCloseTo(P.snowY(pos.getX(i), pos.getZ(i)), 4);
    expect(groundGeometry().attributes.color.count).toBe(pos.count);
  });
  it('a handful of merged meshes, and the walk\'s sweeps leave the kit whole (never merged further, the glow never a caster)', () => {
    const s2 = new THREE.Scene();
    build(s2);
    const meshes = [];
    s2.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBeLessThanOrEqual(8);
    assignShadowCasters(s2);
    scanFootprints(s2);
    mergeStaticProps(s2);
    for (const m of meshes) expect(s2.children).toContain(m);
    expect(s2.getObjectByName('snowville:glow').castShadow).toBe(false);
  });
  it('the cottages carry warm windows (the glow bucket) and every cottage faces the square or the court', () => {
    for (const c of P.COTTAGES) {
      const fx = Math.sin(c.yaw); const fz = Math.cos(c.yaw);
      const toSquare = Math.hypot(c.x + 4 - 0, c.z - 8) - Math.hypot(c.x + fx * 4 + 4, c.z + fz * 4 - 8);
      const toCourt = Math.hypot(c.x - 0, c.z - 28) - Math.hypot(c.x + fx * 4, c.z + fz * 4 - 28);
      expect(Math.max(toSquare, toCourt), c.id).toBeGreaterThan(0);
    }
    const glow = scene.getObjectByName('snowville:glow');
    expect(glow.geometry.attributes.position.count).toBeGreaterThan(P.COTTAGES.length * 18);
  });
});

describe('the flakes, the glints and the brazier', () => {
  const tier = (over) => ({ name: 'high', shadows: true, ...over });
  const make = (opts = {}) => {
    const scene = new THREE.Scene();
    build(scene);
    return { scene, l: createSnowvilleLight({ scene, ...opts }) };
  };
  it('a full device draws the plan\'s 60 flakes and every glint; they fall (the heights move) and stay in a box round her', () => {
    const { l } = make({ tier: tier() });
    const at = (t) => { const p = l.flakes.geometry.attributes.position; return Array.from(p.array); };
    expect(l.flakes.geometry.attributes.position.count).toBe(P.FLAKES.count);
    expect(l.glints.geometry.attributes.position.count).toBe(P.GLINT_COUNT);
    l.update(0.016, 1, { x: 0, z: 30 });
    const a = at();
    l.update(0.016, 4, { x: 0, z: 30 });
    expect(at()).not.toEqual(a);
    for (let i = 0; i < P.FLAKES.count; i++) {
      const f = flakeAt(i, 4, 20, -10);
      expect(Math.abs(f.x - 20)).toBeLessThanOrEqual(P.FLAKES.box + 0.6);
      expect(Math.abs(f.z + 10)).toBeLessThanOrEqual(P.FLAKES.box + 0.6);
      expect(f.y - P.snowY(f.x, f.z)).toBeGreaterThanOrEqual(0);
      expect(f.y - P.snowY(f.x, f.z)).toBeLessThanOrEqual(P.FLAKES.top);
    }
  });
  it('the flakes are a pure function of the index, the time and where she is', () => {
    expect(flakeAt(7, 12.5, 3, 4)).toEqual(flakeAt(7, 12.5, 3, 4));
    expect(flakeAt(7, 12.5, 3, 4)).not.toEqual(flakeAt(8, 12.5, 3, 4));
  });
  it('LOW and LITE draw half the flakes and half the glints and keep the light steady', () => {
    for (const t of [tier({ name: 'low' }), tier({ shadows: false }), tier({ rung: 3 })]) {
      const { l } = make({ tier: t });
      expect(l.flakes.geometry.attributes.position.count).toBe(P.FLAKES.low);
      expect(l.glints.geometry.attributes.position.count).toBe(P.GLINT_COUNT / 2);
      const base = l.light.intensity;
      l.update(0.016, 0.7, { x: 0, z: 30 }); l.update(0.016, 3.1, { x: 0, z: 30 });
      expect(l.light.intensity).toBe(base);
    }
  });
  it('reduced motion: 20 flakes held still (the same spots over the same place), the glints and the light steady', () => {
    const { l } = make({ tier: tier(), reducedMotion: true });
    expect(l.flakes.geometry.attributes.position.count).toBe(P.FLAKES.reduced);
    l.update(0.016, 0.7, { x: 3, z: 20 });
    const a = Array.from(l.flakes.geometry.attributes.position.array);
    const op = l.glints.material.opacity;
    const li = l.light.intensity;
    l.update(0.016, 9.1, { x: 3, z: 20 });
    expect(Array.from(l.flakes.geometry.attributes.position.array)).toEqual(a);
    expect(l.glints.material.opacity).toBe(op);
    expect(l.light.intensity).toBe(li);
  });
  it('on a full device the brazier breathes a little, within a tenth or so', () => {
    const { l } = make({ tier: tier() });
    const seen = new Set();
    for (let t = 0; t < 4; t += 0.37) { l.update(0.016, t, { x: 0, z: 30 }); seen.add(l.light.intensity.toFixed(3)); }
    expect(seen.size).toBeGreaterThan(3);
    for (const v of seen) expect(Math.abs(Number(v) - 1.6)).toBeLessThan(0.3);
  });
});

describe('the cheeks theme: a tint, never a failure', () => {
  it('cold creeps up in the open and eases back at a hearth, always inside 0 to 1', () => {
    expect(coldStep(0, 60, false)).toBeCloseTo(60 / COLD.secsToCold, 6);
    expect(coldStep(1, 4, true)).toBeCloseTo(1 - 4 / COLD.secsToWarm, 6);
    expect(coldStep(0, 1e9, false)).toBe(1);
    expect(coldStep(1, 1e9, true)).toBe(0);
  });
  it('whatever sequence of steps, cold stays a number between 0 and 1 and a hearth always helps (no path to a failure)', () => {
    const rng = mulberry32(0x73766c);
    let c = 0;
    for (let i = 0; i < 4000; i++) {
      const dt = rng() < 0.05 ? [NaN, -3, Infinity, 0][Math.floor(rng() * 4)] : rng() * 3;
      const warm = rng() < 0.4;
      const next = coldStep(c, dt, warm);
      expect(next).toBeGreaterThanOrEqual(0); expect(next).toBeLessThanOrEqual(1); expect(Number.isFinite(next)).toBe(true);
      if (warm && dt > 0 && Number.isFinite(dt)) expect(next).toBeLessThanOrEqual(c);
      if (!warm && dt > 0 && Number.isFinite(dt)) expect(next).toBeGreaterThanOrEqual(c);
      c = next;
    }
    expect(coldStep(NaN, 1, false)).toBe(1 / COLD.secsToCold);
  });
  it('the tint is nothing while she is warm, rises smoothly and never goes past its top', () => {
    expect(cheekTint(0)).toBe(0);
    expect(cheekTint(COLD.tintFrom)).toBe(0);
    expect(cheekTint(1)).toBeCloseTo(COLD.tintMax, 9);
    let prev = 0;
    for (let c = 0; c <= 1.0001; c += 0.05) { const v = cheekTint(c); expect(v).toBeGreaterThanOrEqual(prev - 1e-12); expect(v).toBeLessThanOrEqual(COLD.tintMax + 1e-12); prev = v; }
  });
  it('the soft line is said once when she is properly cold, and again only after she has warmed right up', () => {
    const s = { said: false };
    expect([0.5, 0.95, 0.99, 0.5, 0.95].map((c) => lineStep(s, c))).toEqual([false, true, false, false, false]);
    expect(lineStep(s, 0.1)).toBe(false);
    expect(lineStep(s, 0.95)).toBe(true);
  });
  it('the warm spots are the brazier and the cocoa stall', () => {
    expect(nearWarm(P.BRAZIER.x, P.BRAZIER.z + 1)).toBe(true);
    expect(nearWarm(P.STALL.x - 1.5, P.STALL.z)).toBe(true);
    expect(nearWarm(-30, -20)).toBe(false);
  });
  it('the light layer tints the cheek pads of the session\'s cat as she gets cold, and warms them back at the brazier; dispose puts the colour back', () => {
    const scene = new THREE.Scene();
    build(scene);
    const l = createSnowvilleLight({ scene, tier: { name: 'high' }, reducedMotion: false });
    const cat = new THREE.Group();
    const pads = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshStandardMaterial({ color: 0xd8b890 })); m.userData.cheek = true; cat.add(m); return m; });
    const base = pads[0].material.color.getHex();
    const away = { x: -30, z: -20 };
    for (let t = 0; t < 140; t += 1) l.update(1, t, away, null, { cat });
    expect(l.cold).toBeGreaterThan(0.9);
    const pink = new THREE.Color(CHEEK_PINK);
    const cold = pads[0].material.color;
    expect(cold.r).toBeGreaterThan(new THREE.Color(base).r - 1e-9);
    expect(Math.abs(cold.r - pink.r)).toBeLessThan(Math.abs(new THREE.Color(base).r - pink.r));
    for (let t = 140; t < 160; t += 1) l.update(1, t, { x: P.BRAZIER.x, z: P.BRAZIER.z + 1 }, null, { cat });
    expect(l.cold).toBe(0);
    expect(pads[1].material.color.getHex()).toBe(base);
    for (let t = 160; t < 300; t += 1) l.update(1, t, away, null, { cat });
    l.dispose();
    expect(pads[0].material.color.getHex()).toBe(base);
  });
});

describe('the footprints', () => {
  it('Snowville keeps prints on all its snow, a wider stride apart and for longer than any other ground; one draw call', () => {
    expect(AREA_RULES.snowville).toEqual({ ground: 'snow', path: 'snow', strip: null, stride: 1.3 });
    for (const [id, rule] of Object.entries(AREA_RULES)) if (id !== 'snowville') expect(rule.stride, id).toBeUndefined();
    for (const [k, s] of Object.entries(SURFACES)) if (k !== 'snow') expect(SURFACES.snow.life, k).toBeGreaterThan(s.life);
    expect(surfaceAt('snowville', { waters: [], puddles: [] }, [], 0, 20)).toBe('snow');
    const scene = new THREE.Scene();
    const { area } = built();
    const paws = createPawPrints(scene, { areaId: 'snowville', areaData: area, tier: { pawPrints: 96, pawFade: 9 } });
    expect(paws.mesh.isInstancedMesh).toBe(true);
    expect(scene.children.filter((o) => o.userData.pawPrints)).toHaveLength(1);
    let laid = 0;
    for (let i = 0; i <= 60; i++) if (paws.update(1 / 30, { x: 0, z: 30 - i * 0.1, grounded: true })) laid++;
    expect(laid).toBeGreaterThan(3);
  });
  it('the stride scale only widens a trail; the default trail is exactly the old one', () => {
    const stepsOf = (scale) => { const t = scale === undefined ? createTrail() : createTrail(scale); let n = 0; for (let i = 0; i < 400; i++) if (t.step(0, i * 0.05, true, 1 / 20)) n++; return n; };
    expect(stepsOf(1.3)).toBeLessThan(stepsOf());
    expect(stepsOf(1)).toBe(stepsOf());
  });
});

describe('the staged chunks\' slots', () => {
  it('stage A builds with the two slots empty, and both stage modules fill their slot', async () => {
    expect(ST.b).toBeUndefined();
    expect(ST.c).toBeUndefined();
    await loadSnowvilleStages();
    expect(ST.b).toBeTruthy();
    expect(ST.c).toBeTruthy();
    expect(await loadSnowvilleStages()).toBe(ST);
  });
});

describe('the gate pair', () => {
  it('the Farm\'s archway and Snowville\'s own return arch, each the other\'s twin, both editions, the same look (an icy disc, no new look)', async () => {
    const { TELE_ENDS, TELE_LOOK, SNOWVILLE_NEED_WALKS } = await import('../src/teleport.js');
    const { CATALOG } = await import('../src/progression.js');
    const { discTint } = await import('../src/world/telegate.js');
    const F = TELE_ENDS.farm[0];
    const S = TELE_ENDS.snowville[0];
    expect([F.twin, S.twin]).toEqual([S.id, F.id]);
    expect([F.to, S.to]).toEqual(['snowville', 'farm']);
    expect([F.edition, S.edition]).toEqual(['all', 'all']);
    expect([F.look, S.look]).toEqual(['archway', 'archway']);
    expect(TELE_LOOK['farm-snowville']).toBe('archway');
    expect(S.own).toBe(true);
    expect(F.needWalks).toBe(SNOWVILLE_NEED_WALKS);
    expect(CATALOG.areas.snowville.requires).toEqual({ area: 'farm', walks: SNOWVILLE_NEED_WALKS });
    expect(CATALOG.areas.snowville.gate).toBe('tele');
    expect(CATALOG.areas.snowville.price).toBe(0);
    expect(CATALOG.areas.snowville.edition).toBeUndefined();
    expect(discTint(F)).not.toBe(discTint({ ...F, id: 'park-greenhouse' }));
    expect(discTint(S)).toBe(discTint(F));
  });
  it('she lands on the spawn court, facing the arch, clear of every collider; the Farm end stands on open lawn clear of the Farm\'s things', async () => {
    const { TELE_ENDS } = await import('../src/teleport.js');
    const { arrivalFor } = await import('../src/gateways.js');
    const { area } = built();
    const land = arrivalFor('farm-snowville', TELE_ENDS);
    expect(land.areaId).toBe('snowville');
    expect(land.x).toBeCloseTo(0, 6); expect(land.z).toBeCloseTo(30.1, 6);
    expect(Math.hypot(land.x - P.SNOWVILLE_SPAWN.x, land.z - P.SNOWVILLE_SPAWN.z)).toBeLessThan(0.5);
    for (const c of area.colliders) expect(Math.hypot(c.x - land.x, c.z - land.z)).toBeGreaterThan(c.r + 1);
    const back = arrivalFor('snowville-farm', TELE_ENDS);
    expect(back.areaId).toBe('farm');
    expect(back.x).toBeCloseTo(-2.4, 6); expect(back.z).toBeCloseTo(40, 6);
  });
});
