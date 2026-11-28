import { describe, it, expect } from 'vitest';
import { seasonOf, SEASON_NAMES, SEASONS, frostMeshes } from '../src/world/lighthouseseason.js';
import { wonderFor, drawWonder, KINDS, WONDER_TRIS, seasonKinds, DURATION } from '../src/world/lighthousewonders.js';
import * as THREE from 'three';

describe('lighthouse seasons', () => {
  it('names the season from the month (northern)', () => {
    expect([0, 1, 2, 4, 5, 7, 8, 10, 11].map(seasonOf)).toEqual(['winter', 'winter', 'spring', 'spring', 'summer', 'summer', 'autumn', 'autumn', 'winter']);
    expect(seasonOf(new Date(2026, 10, 28))).toBe('autumn');
  });
  it('has a full palette for each season', () => {
    for (const n of SEASON_NAMES) { const s = SEASONS[n]; expect(s.greens).toHaveLength(4); expect(s.flowers).toHaveLength(4); expect(s.sky.top).toBeTypeOf('number'); }
  });
  it('frosts only upward faces of named meshes, in winter strength', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 1, 0, 0]), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2]), 3));
    const m = new THREE.Mesh(g); m.name = 'lighthouse:rocks';
    expect(frostMeshes([m], 1)).toBe(2);
    expect(g.attributes.color.getX(0)).toBeGreaterThan(0.4);
    expect(g.attributes.color.getX(2)).toBeCloseTo(0.2);
    expect(frostMeshes([m], 0)).toBe(0);
  });
});

describe('lighthouse rare surprises', () => {
  it('is rare, deterministic and fits the season', () => {
    let some = 0;
    for (let s = 1; s <= 400; s++) {
      const w = wonderFor({ seed: s * 7919, season: 'winter' });
      expect(wonderFor({ seed: s * 7919, season: 'winter' })).toEqual(w);
      if (w) { some++; expect(seasonKinds('winter')).toContain(w.kind); expect(w.at).toBeGreaterThanOrEqual(45); }
    }
    expect(some).toBeGreaterThan(40);
    expect(some).toBeLessThan(220);
  });
  it('can be forced for the picture page', () => {
    expect(wonderFor({ force: 'rainbow' })).toEqual({ kind: 'rainbow', at: 0, dur: DURATION.rainbow });
    expect(wonderFor({ force: 'nonsense', seed: 1 })?.kind ?? null).not.toBe('nonsense');
  });
  it('every kind fits its pooled triangles, at every moment, and draws nothing outside its span', () => {
    const view = { cam: [14, 4, 38], right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1] };
    for (const kind of KINDS) {
      for (let u = 0; u <= 1; u += 0.05) {
        let n = 0;
        drawWonder(kind, u, u * DURATION[kind], view, () => { n++; return true; });
        expect(n).toBeLessThanOrEqual(WONDER_TRIS);
        if (u === 0 || u === 1) expect(n).toBe(0);
      }
    }
  });
});

describe('the surprise inside the alive layer', async () => {
  const { stubCanvasDocument } = await import('./helpers/canvas.js');
  stubCanvasDocument();
  const { build } = await import('../src/world/lighthouse.js');
  const { createLighthouseAlive } = await import('../src/world/lighthousealive.js');
  const mk = (opts) => { const scene = new THREE.Scene(); build(scene); const alive = createLighthouseAlive({ scene, ...opts }); const cam = new THREE.PerspectiveCamera(); cam.position.set(14, 3, 38); cam.updateMatrixWorld(); return { alive, cam, fx: alive.objects.find((o) => o.name === 'lighthouse:seafx') }; };
  it('draws its pool only while the moment plays, and the thunder (the existing surf swell, low) is optional on a stub sound', () => {
    const calls = [];
    const { alive, cam, fx } = mk({ wonder: 'lightning', sound: { surf: (k) => calls.push(k) } });
    const idle = fx.geometry.drawRange.count;
    alive.update(0.1, 0.1, cam, 0, 0);
    alive.update(0.1, 2.2, cam, 0, 0);
    expect(fx.geometry.drawRange.count).toBeGreaterThan(idle);
    alive.update(0.1, 3.7, cam, 0, 0);
    expect(calls.length).toBe(1);
    alive.update(0.1, 30, cam, 0, 0);
    expect(fx.geometry.drawRange.count).toBe(idle);
    const bare = mk({ wonder: 'lightning', sound: {} });
    expect(() => { bare.alive.update(0.1, 3.9, bare.cam, 0, 0); }).not.toThrow();
  });
  it('has none in reduced motion or on the lite tier', () => {
    const a = mk({ wonder: 'rainbow', reducedMotion: true }); const b = mk({ wonder: 'rainbow', tier: { name: 'low' } });
    for (const r of [a, b]) { const n = r.fx.geometry.drawRange.count; r.alive.update(0.1, 12, r.cam, 0, 0); expect(r.fx.geometry.drawRange.count).toBe(n); }
  });
});
