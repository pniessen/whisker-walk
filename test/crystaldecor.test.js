// The Crystal Cave's decor (layer 3): the plan is deterministic and in bounds, the small things stand clear of every collider, find, mouse, stone and the pool, the stalagmite
// groups stand outside the walkable edge, LOW keeps about half (a prefix of HIGH), at most three draws, no new solid thing, and every place stays reachable on foot.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { floodFrom } from './helpers/flood.js';

stubCanvasDocument();
const D = await import('../src/world/crystaldecor.js');
const { createCrystalDecor } = await import('../src/world/crystaldecorparts.js');
const P = await import('../src/world/crystalplan.js');
const { build } = await import('../src/world/crystal.js');
const { isWalkableAt } = await import('../src/player.js');
const { CRYSTAL_FIND_ZONES, CRYSTAL_GOLD, CRYSTAL_COLLECTIBLES } = await import('../src/world/crystalfindsplan.js');
const { STONES, LUMI } = await import('../src/world/crystalstory.js');
const W = await import('../src/world/crystalwingplan.js');
const B = P.CRYSTAL_BOUNDS;

describe('the plan', () => {
  it('is deterministic, with its own salts (none shared with the cave\'s other scatters)', () => {
    expect(D.planDecor('high')).toEqual(D.planDecor('high'));
    const salts = [...Object.values(D.SALTS), 0x7374616c, 0x63727973, 0x72696d73, 0x70656262, 0x676c696e, 0x62756778, 0x64757374, 0x64726970];
    expect(new Set(salts).size).toBe(salts.length);
  });
  it('keeps every count, and LOW keeps about half, each a prefix of HIGH', () => {
    const h = D.planDecor('high'); const l = D.planDecor('low');
    for (const k of Object.keys(D.DECOR_COUNT.high)) {
      expect(h[k].length, k).toBe(D.DECOR_COUNT.high[k]);
      expect(l[k].length, k).toBe(D.DECOR_COUNT.low[k]);
      expect(l[k]).toEqual(h[k].slice(0, l[k].length));
      expect(l[k].length / h[k].length).toBeGreaterThan(0.4); expect(l[k].length / h[k].length).toBeLessThan(0.6);
    }
  });
  it('every chamber has its own colour clumps (rose, blue, gold, heart) and the pools of light carry every hue', () => {
    const h = D.planDecor('high');
    for (const k of ['mush', 'garden', 'moss']) expect(new Set(h[k].map((m) => m.hue))).toEqual(new Set(P.HUES));
    expect(new Set(h.pools.map((m) => m.hue))).toEqual(new Set(P.HUES));
    for (const m of h.mush) expect(D.hueNear(m.x, m.z)).toBe(m.hue);
  });
  it('the small things are in bounds and clear of every collider, find, collectible, mouse, spark stone, Lumi, the Heart, the arch and the pool', () => {
    const cols = P.crystalColliders();
    for (const m of D.smallSites('high')) {
      expect(m.x).toBeGreaterThan(B.minX + 2); expect(m.x).toBeLessThan(B.maxX - 2); expect(m.z).toBeGreaterThan(B.minZ + 2); expect(m.z).toBeLessThan(B.maxZ - 2);
      for (const c of cols) expect(Math.hypot(m.x - c.x, m.z - c.z), `${m.x},${m.z}`).toBeGreaterThan(c.r + m.rad);
      for (const f of Object.values(CRYSTAL_FIND_ZONES).flat()) expect(Math.hypot(m.x - f.x, m.z - f.z)).toBeGreaterThan(f.r + m.rad);
      for (const f of [...CRYSTAL_GOLD, ...STONES, ...CRYSTAL_COLLECTIBLES, LUMI.start]) expect(Math.hypot(m.x - f.x, m.z - f.z)).toBeGreaterThan(1.5 + m.rad);
      expect(Math.hypot(m.x - P.ARCH.x, m.z - P.ARCH.z)).toBeGreaterThan(4 + m.rad);
      expect(Math.hypot(m.x - W.POOL.x, m.z - W.POOL.z)).toBeGreaterThan(W.POOL.r);
      expect(Math.hypot(m.x - W.HEART_GREAT.x, m.z - W.HEART_GREAT.z)).toBeGreaterThan(4);
    }
  });
  it('no two small sites overlap', () => {
    const s = D.smallSites('high');
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) expect(Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z)).toBeGreaterThan(s[i].rad + s[j].rad);
  });
  it('the stalagmite groups stand outside the walkable edge, away from the arch, and never on the walk', () => {
    for (const g of D.planDecor('high').stag) {
      const out = g.x < B.minX || g.x > B.maxX || g.z < B.minZ || g.z > B.maxZ;
      expect(out).toBe(true);
      expect(Math.hypot(g.x - P.ARCH.x, g.z - P.ARCH.z)).toBeGreaterThan(6);
      for (const p of g.parts) { const x = g.x + p.dx; const z = g.z + p.dz; expect(x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ).toBe(true); }
    }
  });
  it('the light pools sit under real clusters and are strongest under the great crystals', () => {
    const h = D.planDecor('high');
    expect(h.pools.some((p) => p.k === 1)).toBe(true);
    for (const p of h.pools) { expect(p.r).toBeGreaterThan(0.8); expect(p.r).toBeLessThan(4.5); }
  });
});

describe('the drawing', () => {
  const mk = (tier) => { const scene = new THREE.Scene(); const d = createCrystalDecor({ scene, tier }); return { scene, d }; };
  it('is three draws at most, none a caster, and adds nothing solid to the walk', () => {
    const { scene, d } = mk(null);
    expect(d.meshes.length).toBeLessThanOrEqual(3);
    expect(scene.children.length).toBe(3);
    for (const m of d.meshes) { expect(m.castShadow).toBe(false); expect(m.userData.noMerge).toBe(true); }
    expect(d.triangles).toBeGreaterThan(500); expect(d.triangles).toBeLessThan(9000);
    d.dispose(); expect(scene.children.length).toBe(0);
  });
  it('LOW and LITE draw about half the triangles of HIGH', () => {
    const hi = mk(null).d; const lo = mk({ name: 'low' }).d; const lite = mk({ shadows: false }).d;
    expect(lo.rung).toBe('low'); expect(lite.rung).toBe('low');
    expect(lo.triangles / hi.triangles).toBeGreaterThan(0.35); expect(lo.triangles / hi.triangles).toBeLessThan(0.65);
  });
  it('every vertex is finite and the colours are in range', () => {
    const { d } = mk(null);
    for (const m of d.meshes) for (const k of ['position', 'color']) for (const v of m.geometry.attributes[k].array) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('the walk', () => {
  it('the cave\'s colliders and reachable places are what they were: the decor adds nothing solid, and every find, stone and mouse is still reached on foot', () => {
    const area = build(new THREE.Scene());
    expect(area.colliders.length).toBe(P.crystalColliders().length);
    const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
    for (const f of [...Object.values(CRYSTAL_FIND_ZONES).flat(), ...CRYSTAL_GOLD, ...STONES, ...CRYSTAL_COLLECTIBLES, ...P.CRYSTAL_POIS]) expect(flood.reachesWithin(f.x, f.z, 1.2), `${f.x},${f.z}`).toBe(true);
  });
  it('the sources draw no random number and read no clock', () => {
    for (const f of ['src/world/crystaldecor.js', 'src/world/crystaldecorparts.js']) expect(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''), f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
    expect(readFileSync('src/world/crystaldecor.js', 'utf8')).not.toMatch(/from 'three'/);
  });
});
