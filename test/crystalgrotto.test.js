// The Crystal Cave, wing C milestone C2: the mushroom grotto and the forge shell. Footprints clear of everything that matters, solid pieces and the shelf's one hop, both golden
// mice reachable, the rim rocks and pebbles taken out after the scatter (and nothing else moved), at most two draws a site and no light, reduced motion, LOW lighter, both word sets.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { floodFrom } from './helpers/flood.js';
import { perchHops } from './helpers/findreach.js';
import * as P from '../src/world/crystalplan.js';
import * as S from '../src/world/crystalstory.js';
import * as G from '../src/world/crystalgrottoplan.js';
import { CRYSTAL_FIND_ZONES, CRYSTAL_GOLD, CRYSTAL_COLLECTIBLES } from '../src/world/crystalfindsplan.js';
import { SPOTS, STONE, BUG, SPARK } from '../src/world/crystalerrand.js';
import * as W from '../src/world/crystalwingplan.js';
import { GOLD_MICE } from '../src/goldmice.js';
import { phrase } from '../src/clanphrases.js';
import { isWalkableAt } from '../src/player.js';
import { ST } from '../src/world/crystalstages.js';

const before = { rim: JSON.stringify(P.scatterRim()), peb: JSON.stringify(P.scatterPebbles()), clusters: JSON.stringify(P.scatterClusters()), glints: JSON.stringify(P.scatterGlints()) };
await import('../src/world/crystalstagewingc.js'); // the stage (it registers the grotto and pushes the clears)
const { build } = await import('../src/world/crystal.js');
const { createGrottoLife, mushGlow, hearthGlow, grottoRung } = await import('../src/world/crystalgrottolive.js');
const { CRYSTAL_GROTTO_LINES } = await import('../src/world/crystalgrottowords.js');
const { WING_LIVE, wingPageShown, CRYSTAL_HINTS } = await import('../src/crystalpages.js');
const read = (f) => readFileSync(f, 'utf8');
const B = P.CRYSTAL_BOUNDS;

const fp = G.footprint();
const lumiish = [...Object.values(CRYSTAL_FIND_ZONES).flat(), ...CRYSTAL_COLLECTIBLES, ...S.STONES, S.HEART, S.LUMI.start, P.CRYSTAL_SPAWN, ...SPOTS, STONE, BUG, SPARK.start, SPARK.ring];

describe('the footprints', () => {
  it('both pieces sit inside the bounds, and the golden mice are where goldmice.js has them', () => {
    for (const [x, z, r] of fp) { expect(x - r).toBeGreaterThan(B.minX); expect(x + r).toBeLessThan(B.maxX); expect(z - r).toBeGreaterThan(B.minZ); expect(z + r).toBeLessThan(B.maxZ); }
    const gm = Object.fromEntries(GOLD_MICE.crystal.map((m) => [m.id, m]));
    expect(gm['gm-crystal-4']).toEqual(G.GROTTO_MOUSE);
    expect(gm['gm-crystal-5']).toEqual(G.SHELF_MOUSE);
    expect(CRYSTAL_GOLD.find((m) => m.id === 'gm-crystal-4')).toEqual(G.GROTTO_MOUSE);
    expect(CRYSTAL_GOLD.find((m) => m.id === 'gm-crystal-5')).toEqual(G.SHELF_MOUSE);
  });
  it('are clear of the finds, collectibles, spark stones, Lumi, the spawn, the errand spots, the arch, the pool, the Heart and every wander point', () => {
    const avoid = [...lumiish, ...P.CRYSTAL_POIS, { x: P.ARCH.x, z: P.ARCH.z }, { x: W.POOL.x, z: W.POOL.z, r: W.POOL.r }, { x: W.HEART_GREAT.x, z: W.HEART_GREAT.z, r: 3 }];
    for (const [x, z, r] of fp) for (const a of avoid) expect(Math.hypot(x - a.x, z - a.z), `${x},${z} by ${a.x},${a.z}`).toBeGreaterThan(r + (a.r ?? 0) + 1);
  });
  it('the solid pieces are clear of the old colliders, the other mouse and the golden mice (but the shelf, which carries one)', () => {
    const old = P.crystalColliders();
    for (const c of G.grottoColliders()) {
      for (const o of old) expect(Math.hypot(c.x - o.x, c.z - o.z), `${c.x},${c.z} by ${o.x},${o.z}`).toBeGreaterThan(c.r + o.r + 0.9);
      for (const m of CRYSTAL_GOLD.filter((k) => k.id !== 'gm-crystal-5')) expect(Math.hypot(c.x - m.x, c.z - m.z)).toBeGreaterThan(c.r + 1.2);
    }
  });
  it('the grotto keeps its caps at 2 m or less inside the edge and the giants stand outside the walkable edge', () => {
    for (const m of [...G.RING_MUSHROOMS, ...G.BUTTONS]) { expect(m.h).toBeLessThanOrEqual(G.MAX_CAP_TOP); expect(m.x + m.cap).toBeLessThan(B.maxX); }
    for (const m of G.GIANTS) expect(m.x - m.cap).toBeGreaterThan(B.maxX + 1);
  });
  it('the camera stays clear: nothing in the grotto or the forge stands over 2.4 m inside the edge (the camera at zoom step 2 reaches about 4.5 m and the dome is 13 m up)', () => {
    const area = build(new THREE.Scene());
    const scene = new THREE.Scene();
    const life = createGrottoLife({ scene });
    let maxRise = 0;
    scene.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getX(i) < B.maxX) maxRise = Math.max(maxRise, p.getY(i) - P.crystalY(p.getX(i), p.getZ(i))); } });
    expect(maxRise).toBeLessThanOrEqual(2.4);
    expect(area.perches.length).toBe(7);
    life.dispose();
  });
});

describe('the walk', () => {
  const area = build(new THREE.Scene());
  it('the stage adds 14 colliders and the shelf perch; the cave without the stage is what it was', async () => {
    const have = new Set(area.colliders.map((c) => `${c.x},${c.z},${c.r}`));
    for (const c of [...P.crystalColliders(), ...G.grottoColliders()]) expect(have.has(`${c.x},${c.z},${c.r}`)).toBe(true);
    const { riverColliders } = await import('../src/world/crystalriverplan.js'); // the river stage may be loaded too
    expect(area.colliders.length).toBeGreaterThanOrEqual(P.crystalColliders().length + G.grottoColliders().length);
    expect(area.colliders.length).toBeLessThanOrEqual(P.crystalColliders().length + G.grottoColliders().length + riverColliders().length);
    expect(ST.grotto).toBeTruthy();
    expect(area.perches).toContainEqual(expect.objectContaining({ x: G.SHELF.x, z: G.SHELF.z, y: 1, kind: 'stone' }));
  });
  const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
  it('the grotto mouse, the finds, the stones and the wander points are all still reached on foot', () => {
    for (const f of [...Object.values(CRYSTAL_FIND_ZONES).flat(), ...CRYSTAL_GOLD.filter((m) => m.id !== 'gm-crystal-5'), ...S.STONES, ...CRYSTAL_COLLECTIBLES, ...P.CRYSTAL_POIS, ...area.pois]) expect(flood.reachesWithin(f.x, f.z, 1.2), `${f.x},${f.z}`).toBe(true);
    expect(flood.reachesWithin(G.GROTTO_MOUSE.x, G.GROTTO_MOUSE.z, 0.6)).toBe(true);
  });
  it('the forge mouse is one hop up from the floor, with no skill, from floor the walk reaches', () => {
    expect(perchHops(area.perches, G.SHELF_MOUSE, { groundOk: (x, z) => flood.reachesWithin(x, z, 1.4) })).toBe(1);
    const gm = GOLD_MICE.crystal.find((m) => m.id === 'gm-crystal-5');
    expect(Math.hypot(gm.x - G.SHELF_PERCH.x, gm.z - G.SHELF_PERCH.z)).toBeLessThan(1.0);
    expect(G.SHELF_PERCH.y - 0).toBeLessThanOrEqual(1.6);
    // a cat can stand on the north side of the shelf, in reach of the perch
    expect(isWalkableAt(area, G.SHELF.reachFrom.x, G.SHELF.reachFrom.z)).toBe(true);
  });
  it('the grotto\'s mouse is not under a cap, and the floor round it is open (nothing solid within 2 m)', () => {
    for (const c of G.grottoColliders()) expect(Math.hypot(c.x - G.GROTTO_MOUSE.x, c.z - G.GROTTO_MOUSE.z)).toBeGreaterThan(2);
  });
});

describe('the clears', () => {
  it('the footprints are in CRYSTAL_CLEARS (once) and nothing is left of the rim rocks or pebbles inside them; every other scatter is byte-identical', () => {
    for (const c of G.GROTTO_CLEARS) expect(P.CRYSTAL_CLEARS.filter((x) => x === c).length).toBe(1);
    for (const k of [...P.scatterRim(), ...P.scatterPebbles()]) expect(P.inCrystalClear(k.x, k.z, 0)).toBe(false);
    expect(JSON.stringify(P.scatterClusters())).toBe(before.clusters);
    expect(JSON.stringify(P.scatterGlints())).toBe(before.glints);
    // the rim and the pebbles only lose what stood in the footprints (the rects hold none today, so they are equal)
    const rim = JSON.parse(before.rim).filter((k) => !P.inCrystalClear(k.x, k.z, k.s));
    expect(JSON.stringify(P.scatterRim())).toBe(JSON.stringify(rim));
    const peb = JSON.parse(before.peb).filter((k) => !P.inCrystalClear(k.x, k.z, k.s));
    expect(JSON.stringify(P.scatterPebbles())).toBe(JSON.stringify(peb));
  });
  it('the rects hold the pieces', () => {
    for (const [x, z] of fp.filter((p) => p[0] < 0)) expect(x > G.FORGE_CLEAR.minX && x < G.FORGE_CLEAR.maxX && z > G.FORGE_CLEAR.minZ && z < G.FORGE_CLEAR.maxZ, `${x},${z}`).toBe(true);
    for (const [x, z] of fp.filter((p) => p[0] > 0)) expect(x > G.GROTTO_CLEAR.minX && x < G.GROTTO_CLEAR.maxX && z > G.GROTTO_CLEAR.minZ && z < G.GROTTO_CLEAR.maxZ, `${x},${z}`).toBe(true);
  });
});

describe('the drawing', () => {
  const mk = (tier, reducedMotion = false) => { const scene = new THREE.Scene(); return { scene, life: createGrottoLife({ scene, tier, reducedMotion }) }; };
  it('four meshes at most (two a site), no light, finite numbers, colours in range', () => {
    const { scene, life } = mk(null);
    expect(life.draws).toBe(4);
    let lights = 0; scene.traverse((o) => { if (o.isLight) lights++; });
    expect(lights).toBe(0);
    for (const m of life.meshes) for (const k of ['position', 'color']) for (const v of m.geometry.attributes[k].array) { expect(Number.isFinite(v)).toBe(true); if (k === 'color') expect(v).toBeLessThanOrEqual(1.0001); }
    life.dispose(); expect(scene.children.length).toBe(0);
  });
  it('LOW and LITE draw clearly fewer triangles', () => {
    const hi = mk(null).life; const lo = mk({ name: 'low' }).life; const lite = mk({ shadows: false }).life;
    expect(grottoRung({ name: 'low' })).toBe('low');
    expect(lo.triangles).toBeLessThan(hi.triangles * 0.8);
    expect(lite.triangles).toBe(lo.triangles);
  });
  it('the glow breathes, and reduced motion holds it still at full', () => {
    expect(mushGlow(0)).not.toBeCloseTo(mushGlow(2.5), 3);
    const { life } = mk(null);
    const c0 = life.meshes[0].material.color.r; life.update(1.7); expect(life.meshes[0].material.color.r).not.toBe(c0);
    const still = mk(null, true).life; still.update(1.7); still.update(3.3);
    expect(still.meshes.map((m) => m.material.color.r)).toEqual([1, 1, 1, 1]);
    for (let t = 0; t < 30; t += 0.37) { expect(mushGlow(t)).toBeLessThanOrEqual(1); expect(mushGlow(t)).toBeGreaterThan(0.8); expect(hearthGlow(t)).toBeGreaterThan(0.75); expect(hearthGlow(t)).toBeLessThanOrEqual(1.0001); }
  });
  it('two spots for the photo and the journal, named in both word sets, hinted, banned-word free', () => {
    const { life } = mk(null);
    expect(life.spottable.map((s) => s.type)).toEqual(['ccgrotto', 'ccforge']);
    for (const s of life.spottable) { expect(s.label).toMatch(/\S/); expect(s.range).toBeGreaterThan(3); expect(CRYSTAL_HINTS[s.type]).toMatch(/\S/); expect(wingPageShown(s.type)).toBe(true); }
    expect(WING_LIVE.grotto && WING_LIVE.forge).toBe(true);
    expect([WING_LIVE.cart, WING_LIVE.song]).toEqual([true, false]); // the cart is C4's, live; // boat and falls are the river's, live when both stages load
    const everyday = withOffWords(() => Object.keys(CRYSTAL_GROTTO_LINES).map((k) => phrase(k)));
    const clan = Object.keys(CRYSTAL_GROTTO_LINES).map((k) => phrase(k));
    for (const t of [...everyday, ...clan, CRYSTAL_HINTS.ccgrotto, CRYSTAL_HINTS.ccforge]) expect(bannedIn(t) ?? [], t).toEqual([]);
    expect(everyday).not.toEqual(clan);
  });
  it('the sources draw no random number, read no clock and add no PointLight', () => {
    for (const f of ['crystalgrottoplan', 'crystalgrottoparts', 'crystalgrottolive', 'crystalgrottostage', 'crystalgrottowords']) {
      const src = read(`src/world/${f}.js`).replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|PointLight/);
    }
    expect(read('src/world/crystalgrottoplan.js')).not.toMatch(/from 'three'/);
  });
});
