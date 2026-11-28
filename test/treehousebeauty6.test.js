// The Treehouse, beauty pass 6 (2026-11-28): weather and atmosphere as events, no new triangle, mesh or caster (pooled Points and uniforms).
import { describe, it, expect } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { measureWithLife } = await import('./helpers/lifebudget.js');
const { loadTreehouseStages } = await import('../src/world/treehousestages.js');
await loadTreehouseStages();
const { build } = await import('../src/world/treehouse.js');
const W = await import('../src/world/treehouseweather.js');
const hash = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

describe('treehouse beauty pass 6', () => {
  it('adds no triangle, mesh or caster', () => {
    const r = measureWithLife(build);
    expect(r.whole.meshes).toBe(23);
    expect(r.whole.casters).toBe(1);
    expect(r.whole.triangles).toBe(60413);
  });

  it('rain comes in and clears with steam after it; a storm gust is short and strong', () => {
    const o = {};
    expect(W.shape('rain', 60, o).rain).toBeGreaterThan(0.99);
    expect(W.shape('rain', 0, o).rain).toBe(0);
    expect(W.shape('rain', 160, o).rain).toBe(0);
    expect(W.shape('rain', 150, o).steam).toBeGreaterThan(0.5);
    expect(W.shape('storm', 15, o).storm).toBeGreaterThan(0.99);
    expect(W.shape('storm', 40, o).storm).toBe(0);
  });

  it('events come on the walk\'s own slots, more often in real rain, never before their start, and a forced name wins', () => {
    const count = (real) => { let n = 0; for (let t = 0; t < 420 * 400; t += 30) if (W.eventAt(t, { seed: 3, real, hash }).kind === 'rain') n++; return n; };
    expect(count('rain')).toBeGreaterThan(count(null) * 3);
    expect(count(null)).toBeGreaterThan(0);
    for (let t = 0; t < 420 * 50; t += 7) { const e = W.eventAt(t, { seed: 1, hash }); if (e.kind) { expect(e.age).toBeGreaterThanOrEqual(0); expect(e.age).toBeLessThanOrEqual(W.DUR[e.kind]); } }
    expect(W.eventAt(5, { forced: 'storm', forcedAge: 10, hash })).toMatchObject({ kind: 'storm', age: 15 });
    expect(W.eventAt(5, { forced: 'off', hash }).kind).toBe(null);
  });
});
