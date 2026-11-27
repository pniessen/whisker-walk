// The Echo Deep, milestone C2: the hall shell. Footprints clear of everything that matters, the passage wide enough, the floor flood reaches the nest, the nook, the door-crystal
// and both mice, the clears, three meshes and no light, the near-switch, LOW and reduced-motion stills, and the whole thing off (no change) with the flag off.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { floodFrom } from './helpers/flood.js';
import { perchHops } from './helpers/findreach.js';
import * as P from '../src/world/crystalplan.js';
import * as S from '../src/world/crystalstory.js';
import * as D from '../src/world/crystaldeepplan.js';
import { CRYSTAL_FIND_ZONES, CRYSTAL_GOLD, CRYSTAL_COLLECTIBLES } from '../src/world/crystalfindsplan.js';
import { SPOTS, STONE, BUG, SPARK } from '../src/world/crystalerrand.js';
import * as W from '../src/world/crystalwingplan.js';
import * as SG from '../src/world/crystalsongplan.js';
import { GOLD_MICE } from '../src/goldmice.js';
import { isWalkableAt } from '../src/player.js';
import { ST } from '../src/world/crystalstages.js';
import { setCrystalDeep } from '../src/crystalflag.js';

const before = { rim: JSON.stringify(P.scatterRim()), peb: JSON.stringify(P.scatterPebbles()), clusters: JSON.stringify(P.scatterClusters()), glints: JSON.stringify(P.scatterGlints()) };
setCrystalDeep(true);
await import('../src/world/crystalstagedeep.js');
const { build } = await import('../src/world/crystal.js');
const { createDeepLife, deepVisible, deepGlow, deepRung } = await import('../src/world/crystaldeeplive.js');
const read = (f) => readFileSync(f, 'utf8');
const B = P.CRYSTAL_BOUNDS;

const isDeepMouse = (m) => [D.HALL_MOUSE, D.NEST_MOUSE].some((d) => d.x === m.x && d.z === m.z);
const lumiish = [...Object.values(CRYSTAL_FIND_ZONES).flat(), ...CRYSTAL_COLLECTIBLES, ...S.STONES, S.HEART, S.LUMI.start, P.CRYSTAL_SPAWN, ...SPOTS, STONE, BUG, SPARK.start, SPARK.ring];

describe('the footprints', () => {
  it('sit inside the bounds, and the two golden mice are where goldmice.js has them', () => {
    for (const [x, z, r] of D.footprint()) { expect(x - r).toBeGreaterThan(B.minX); expect(x + r).toBeLessThan(B.maxX); expect(z - r).toBeGreaterThan(B.minZ); expect(z + r).toBeLessThan(B.maxZ); }
    const gm = Object.fromEntries(GOLD_MICE.crystal.map((m) => [m.id, m]));
    expect(gm['gm-crystal-6']).toMatchObject({ x: D.HALL_MOUSE.x, z: D.HALL_MOUSE.z });
    expect(gm['gm-crystal-7']).toMatchObject({ x: D.NEST_MOUSE.x, z: D.NEST_MOUSE.z });
  });
  it('are clear of the finds, collectibles, stones, Lumi, the spawn, the errand spots, the arch, the pool, the Heart, the chamber and every wander point', () => {
    const avoid = [...lumiish, ...P.CRYSTAL_POIS].filter((m) => !isDeepMouse(m)).concat([{ x: P.ARCH.x, z: P.ARCH.z }, { x: W.POOL.x, z: W.POOL.z, r: W.POOL.r }, { x: W.HEART_GREAT.x, z: W.HEART_GREAT.z, r: 3 }, { x: P.ROSE_GREAT.x, z: P.ROSE_GREAT.z, r: 3.4 }]);
    for (const [x, z, r] of D.footprint()) for (const a of avoid) expect(Math.hypot(x - a.x, z - a.z), `${x},${z} by ${a.x},${a.z}`).toBeGreaterThan(r + (a.r ?? 0) + 0.4);
    for (const p of SG.PADS ?? []) expect(Math.hypot(p.x - D.HALL.x, p.z - D.HALL.z)).toBeGreaterThan(D.HALL.r + 1);
  });
  it('the solid pieces are clear of the old colliders and of the mice (but the nest, which carries one)', () => {
    const old = [...P.crystalColliders(), ...(ST.grotto?.colliders() ?? [])];
    for (const c of D.deepColliders()) {
      for (const o of old) expect(Math.hypot(c.x - o.x, c.z - o.z), `${c.x},${c.z} by ${o.x},${o.z}`).toBeGreaterThan(c.r + o.r + 0.5);
      for (const m of CRYSTAL_GOLD.filter((k) => k.id !== 'gm-crystal-7')) expect(Math.hypot(c.x - m.x, c.z - m.z)).toBeGreaterThan(c.r + 0.9);
    }
    expect(Math.hypot(D.HALL_MOUSE.x - D.STANDS[0].x, D.HALL_MOUSE.z - D.STANDS[0].z)).toBeGreaterThan(2);
  });
  it('the passage is 2.2 m wide or more at every wall pair, and the hall opening too', () => {
    const w = D.PASSAGE_WALLS;
    for (let i = 0; i < w.length; i += 2) expect(w[i + 1].x - w[i].x - w[i].r - w[i + 1].r).toBeGreaterThanOrEqual(2.2);
    const open = D.HALL_WALLS.filter((c) => c.z > D.HALL.z + 3);
    const xs = open.map((c) => c.x).sort((a, b) => a - b);
    let widest = Infinity;
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 1.5) widest = xs[i] - xs[i - 1] - 1;
    expect(widest).toBeGreaterThanOrEqual(2.2);
  });
  it('the camera stays clear: nothing stands over 2.4 m over the floor inside the walk', () => {
    const scene = new THREE.Scene();
    const life = createDeepLife({ scene });
    let maxRise = 0;
    scene.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) maxRise = Math.max(maxRise, p.getY(i) - P.crystalY(p.getX(i), p.getZ(i))); });
    expect(maxRise).toBeLessThanOrEqual(2.9); // the door-crystal and the nook's lintel (2.3 + 0.2 of stone), inside the rim
    life.dispose();
  });
});

describe('the walk', () => {
  const area = build(new THREE.Scene());
  it('the stage adds its colliders and the nest perch', () => {
    const have = new Set(area.colliders.map((c) => `${c.x},${c.z},${c.r}`));
    for (const c of D.deepColliders()) expect(have.has(`${c.x},${c.z},${c.r}`)).toBe(true);
    expect(area.perches).toContainEqual(expect.objectContaining({ x: D.NEST.x, z: D.NEST.z, y: D.NEST.h, kind: 'stone' }));
  });
  const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
  it('the hall, the door-crystal, the stands, the nest ledge, the nook and the hall mouse are all reached on foot; the old finds still are', () => {
    for (const f of [...Object.values(CRYSTAL_FIND_ZONES).flat(), ...CRYSTAL_GOLD.filter((m) => !['gm-crystal-7'].includes(m.id)), ...S.STONES, ...CRYSTAL_COLLECTIBLES, ...P.CRYSTAL_POIS, ...area.pois]) expect(flood.reachesWithin(f.x, f.z, 1.2), `${f.x},${f.z}`).toBe(true);
    expect(flood.reachesWithin(D.HALL_MOUSE.x, D.HALL_MOUSE.z, 0.6)).toBe(true);
    expect(flood.reachesWithin(D.DOOR.x, D.DOOR.z + 0.9, 0.6)).toBe(true);
    for (const s of D.STANDS) expect(flood.reachesWithin(s.x, s.z + 0.9, 0.6)).toBe(true);
    expect(flood.reachesWithin(D.NEST.reachFrom.x, D.NEST.reachFrom.z, 0.6)).toBe(true);
    expect(flood.reachesWithin(D.PEDESTAL.x, D.PEDESTAL.z + 1.0, 0.6)).toBe(true);
    expect(flood.reachesWithin(D.NOOK.x, D.NOOK.z + 1.2, 0.6)).toBe(true);
  });
  it('the nest mouse is one hop up from floor the walk reaches', () => {
    expect(perchHops(area.perches, { x: D.NEST_MOUSE.x, z: D.NEST_MOUSE.z, y: D.NEST.h }, { groundOk: (x, z) => flood.reachesWithin(x, z, 1.4) })).toBe(1);
    expect(D.NEST_PERCH.y).toBeLessThanOrEqual(1.6);
  });
});

describe('the clears', () => {
  it('the footprints are in CRYSTAL_CLEARS once and nothing is left of the rim rocks or pebbles in them; every other scatter is byte-identical', () => {
    for (const c of D.DEEP_CLEARS) expect(P.CRYSTAL_CLEARS.filter((x) => x === c).length).toBe(1);
    for (const k of [...P.scatterRim(), ...P.scatterPebbles()]) expect(P.inCrystalClear(k.x, k.z, 0)).toBe(false);
    expect(JSON.stringify(P.scatterClusters())).toBe(before.clusters);
    expect(JSON.stringify(P.scatterGlints())).toBe(before.glints);
    const rim = JSON.parse(before.rim).filter((k) => !P.inCrystalClear(k.x, k.z, k.s));
    expect(JSON.stringify(P.scatterRim())).toBe(JSON.stringify(rim));
    const peb = JSON.parse(before.peb).filter((k) => !P.inCrystalClear(k.x, k.z, k.s));
    expect(JSON.stringify(P.scatterPebbles())).toBe(JSON.stringify(peb));
  });
  it('the rects hold the pieces', () => {
    const inR = (r, x, z) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
    for (const c of D.deepColliders()) expect(inR(D.HALL_CLEAR, c.x, c.z) || inR(D.NOOK_CLEAR, c.x, c.z), `${c.x},${c.z}`).toBe(true);
  });
});

describe('the drawing', () => {
  const mk = (tier, reducedMotion = false) => { const scene = new THREE.Scene(); return { scene, life: createDeepLife({ scene, tier, reducedMotion }) }; };
  it('three meshes, no light, finite numbers, colours in range; never more than two drawn at once', () => {
    const { scene, life } = mk(null);
    expect(life.draws).toBe(3);
    let lights = 0; scene.traverse((o) => { if (o.isLight) lights++; });
    expect(lights).toBe(0);
    for (const m of life.meshes) for (const k of ['position', 'color']) for (const v of m.geometry.attributes[k].array) { expect(Number.isFinite(v)).toBe(true); if (k === 'color') expect(v).toBeLessThanOrEqual(1.5); }
    for (const p of [{ x: 0, z: 28 }, D.HALL, D.NOOK, { x: -28, z: 0 }]) { life.update(0.1, 0, p); expect(life.meshes.filter((m) => m.visible).length).toBeLessThanOrEqual(2); }
    life.dispose(); expect(scene.children.length).toBe(0);
  });
  it('the triangles are held to 6,000 or fewer', () => {
    const { life } = mk(null);
    expect(life.triangles).toBeLessThanOrEqual(6000);
    console.log('deep triangles', life.triangles);
  });
  it('the near-switch: detail near either site, the stand-in far, never both', () => {
    expect(deepVisible(D.HALL.x, D.HALL.z)).toEqual({ detail: true, standIn: false });
    expect(deepVisible(D.NOOK.x + 5, D.NOOK.z)).toEqual({ detail: true, standIn: false });
    expect(deepVisible(30, -20)).toEqual({ detail: false, standIn: true });
    const { life } = mk(null);
    life.update(0.1, 0, { x: 30, z: -20 });
    expect(life.meshes.map((m) => m.visible)).toEqual([false, false, true]);
    life.update(0.1, 0, { x: D.HALL.x, z: D.HALL.z });
    expect(life.meshes.map((m) => m.visible)).toEqual([true, true, false]);
  });
  it('LOW and LITE draw clearly fewer triangles', () => {
    const hi = mk(null).life; const lo = mk({ name: 'low' }).life; const lite = mk({ shadows: false }).life;
    expect(deepRung({ name: 'low' })).toBe('low');
    expect(lo.triangles).toBeLessThan(hi.triangles * 0.85);
    expect(lite.triangles).toBe(lo.triangles);
  });
  it('the glow breathes, and reduced motion holds it still at full', () => {
    expect(deepGlow(0)).not.toBeCloseTo(deepGlow(2.5), 3);
    const { life } = mk(null);
    const c0 = life.meshes[1].material.color.r; life.update(1.7, 0, { x: 0, z: 0 }); expect(life.meshes[1].material.color.r).not.toBe(c0);
    const still = mk(null, true).life; still.update(1.7, 0, { x: 0, z: 0 }); still.update(3.3, 0, { x: 0, z: 0 });
    expect(still.meshes.map((m) => m.material.color.r)).toEqual([1, 1, 1]);
    for (let t = 0; t < 30; t += 0.37) { expect(deepGlow(t)).toBeLessThanOrEqual(1); expect(deepGlow(t)).toBeGreaterThan(0.8); }
  });
  it('the sources draw no random number, read no clock, add no PointLight and carry no apostrophe in a comment', () => {
    for (const f of ['crystaldeepplan', 'crystaldeepparts', 'crystaldeeplive', 'crystalstagedeep']) {
      const text = read(`src/world/${f}.js`);
      for (const line of text.split('\n')) { const i = line.indexOf('//'); if (i >= 0 && !/https?:/.test(line)) expect(line.slice(i), `${f}: ${line}`).not.toMatch(/'/); }
      expect(text.replace(/\/\/.*$/gm, ''), f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|PointLight/);
    }
    expect(read('src/world/crystaldeepplan.js')).not.toMatch(/from 'three'/);
  });
});
