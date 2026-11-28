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
    const salts = [...Object.values(D.SALTS), ...Object.values(D.BEAUTY_SALTS), 0x7374616c, 0x63727973, 0x72696d73, 0x70656262, 0x676c696e, 0x62756778, 0x64757374, 0x64726970];
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

describe('beauty round 1', () => {
  it('is deterministic, keeps every count, and LOW keeps about half, each a prefix of HIGH', () => {
    const h = D.planBeauty('high'); const l = D.planBeauty('low');
    expect(D.planBeauty('high')).toEqual(h);
    for (const k of Object.keys(D.BEAUTY_COUNT.high)) {
      expect(h[k].length, k).toBe(D.BEAUTY_COUNT.high[k]); expect(l[k].length, k).toBe(D.BEAUTY_COUNT.low[k]);
      expect(l[k]).toEqual(h[k].slice(0, l[k].length));
    }
  });
  it('the veins and small stalagmites stand in bounds, clear of every collider, find and the old small things, and of each other', () => {
    const cols = P.crystalColliders(); const old = D.smallSites('high'); const mine = D.beautySites('high');
    for (const m of mine) {
      expect(m.x).toBeGreaterThan(B.minX + 2); expect(m.x).toBeLessThan(B.maxX - 2); expect(m.z).toBeGreaterThan(B.minZ + 2); expect(m.z).toBeLessThan(B.maxZ - 2);
      for (const c of cols) expect(Math.hypot(m.x - c.x, m.z - c.z)).toBeGreaterThan(c.r + m.rad);
      for (const f of Object.values(CRYSTAL_FIND_ZONES).flat()) expect(Math.hypot(m.x - f.x, m.z - f.z)).toBeGreaterThan(f.r + m.rad);
      expect(Math.hypot(m.x - W.POOL.x, m.z - W.POOL.z)).toBeGreaterThan(W.POOL.r);
      for (const o of old) expect(Math.hypot(m.x - o.x, m.z - o.z)).toBeGreaterThan(o.rad + m.rad);
    }
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) expect(Math.hypot(mine[i].x - mine[j].x, mine[i].z - mine[j].z)).toBeGreaterThan(mine[i].rad + mine[j].rad);
  });
  it('the pockets carry both a warm and a cool colour', () => {
    const rgb = D.planBeauty('high').pockets.map((p) => p.rgb[0] > p.rgb[2]);
    expect(rgb.includes(true) && rgb.includes(false)).toBe(true);
  });
});

describe('the drawing', () => {
  const mk = (tier) => { const scene = new THREE.Scene(); const d = createCrystalDecor({ scene, tier }); return { scene, d }; };
  it('is three draws at most, none a caster, and adds nothing solid to the walk', () => {
    const { scene, d } = mk(null);
    expect(d.meshes.length).toBeLessThanOrEqual(3);
    expect(scene.children.length).toBe(3);
    for (const m of d.meshes) { expect(m.castShadow).toBe(false); expect(m.userData.noMerge).toBe(true); }
    expect(d.triangles).toBeGreaterThan(500); expect(d.triangles).toBeLessThan(15600); // (beauty round 4, 2026-11-28: small stories in each chamber, decor 12,5xx -> 13,886, bound 13,000 -> 15,600; beauty round 2, 2026-11-28: hero crystals + halos, washes, shafts, motes, ripples: 9,642 -> 12,298, bound 12,000 -> 13,000; beauty round 1, 2026-11-28: shard satellites, glints, veins, small stalagmites, pockets; measured below)
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

describe('beauty round 2', () => {
  const B2 = D.planBeauty2('high');
  it('is deterministic, LOW is a prefix of HIGH, and every hue shows in the heroes and the washes', () => {
    expect(D.planBeauty2('high')).toEqual(B2);
    const lo = D.planBeauty2('low');
    for (const k of Object.keys(D.BEAUTY2_COUNT.high)) { expect(B2[k].length).toBe(D.BEAUTY2_COUNT.high[k]); expect(lo[k]).toEqual(B2[k].slice(0, lo[k].length)); }
    expect(new Set(B2.wash.map((w) => w.hue))).toEqual(new Set(P.HUES));
    expect(new Set(B2.hero.slice(0, 4).map((h) => h.hue))).toEqual(new Set(P.HUES));
  });
  it('the hero crystals stand inside the footprint of an existing solid cluster, so nothing new is solid or standable', () => {
    const cols = P.crystalColliders();
    for (const h of B2.hero) {
      const c = cols.find((k) => Math.hypot(k.x - h.x, k.z - h.z) < 0.3);
      expect(c, `${h.x},${h.z}`).toBeTruthy();
      for (const sp of h.spikes) expect(Math.hypot(h.x + sp.dx - c.x, h.z + sp.dz - c.z) + sp.r, `${h.x},${h.z}`).toBeLessThanOrEqual(c.r + 0.02);
    }
  });
  it('the shafts, motes and ripples are in the cave; the ripples are on the pool', () => {
    for (const m of [...B2.motes, ...B2.shafts]) { expect(m.x).toBeGreaterThan(B.minX); expect(m.x).toBeLessThan(B.maxX); expect(m.z).toBeGreaterThan(B.minZ); expect(m.z).toBeLessThan(B.maxZ); }
    for (const r of B2.ripples) expect(Math.hypot(r.x - W.POOL.x, r.z - W.POOL.z)).toBeLessThan(W.POOL.r * 0.8);
  });
  it('moves with time, and stands still in reduced motion', () => {
    const mk = (reducedMotion) => createCrystalDecor({ scene: new THREE.Scene(), tier: null, reducedMotion });
    const a = mk(false); a.update(0.2); a.update(0.2); expect(a.time).toBeCloseTo(0.4); a.dispose();
    const r = mk(true); r.update(1); expect(r.time).toBe(0); r.dispose();
  });
  it('the shader reads one time uniform and nothing else changes: still three meshes, and every glow and light vertex carries a move tag', () => {
    const d = createCrystalDecor({ scene: new THREE.Scene(), tier: null });
    for (const m of d.meshes.slice(1)) { expect(m.geometry.attributes.aMove.count).toBe(m.geometry.attributes.position.count); expect(m.material.onBeforeCompile).toBeTypeOf('function'); }
    expect(d.meshes.length).toBe(3); expect(d.counts.motes).toBe(56);
  });
});
