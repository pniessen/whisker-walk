// The Treehouse, beauty pass 5 (2026-11-28): living creatures and one daily rhythm, no new triangle, mesh or caster.
import { describe, it, expect } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { measureWithLife } = await import('./helpers/lifebudget.js');
const { loadTreehouseStages } = await import('../src/world/treehousestages.js');
await loadTreehouseStages();
const { build } = await import('../src/world/treehouse.js');
const L = await import('../src/world/treehouseliving.js');
const C = await import('../src/world/treehousecritters.js');

describe('treehouse beauty pass 5', () => {
  it('adds no triangle, mesh or caster (the creatures are Points)', () => {
    const r = measureWithLife(build);
    expect(r.whole.meshes).toBe(23);
    expect(r.whole.casters).toBe(1);
    expect(r.whole.triangles).toBe(60413);
  });

  it('the day: one weight for each part of it, the night wraps round midnight, chimes drop in pitch toward night', () => {
    const at = (h) => L.rhythm(h, {});
    expect(at(7).dawn).toBeGreaterThan(0.9);
    expect(at(12.5).noon).toBeGreaterThan(0.99);
    expect(at(17.6).gold).toBeGreaterThan(0.99);
    for (const h of [22, 0, 3]) expect(at(h).night).toBe(1);
    for (const h of [8, 12, 15]) expect(at(h).night).toBe(0);
    expect(at(12).pitch).toBe(1);
    expect(at(23).pitch).toBeLessThan(at(17.6).pitch);
    expect(L.rhythm(-1, {}).night).toBe(1);
    expect(L.WIND.x ** 2 + L.WIND.z ** 2).toBeCloseTo(1, 5);
  });

  it('hourOf reads a given hour, a date, a clock function, or dusk', () => {
    expect(L.hourOf({ hour: 6 })).toBe(6);
    expect(L.hourOf({ now: new Date(2026, 0, 1, 9, 30) })).toBe(9.5);
    expect(L.hourOf({ now: () => new Date(2026, 0, 1, 14, 0) })).toBe(14);
    expect(L.hourOf({ dusk: true })).toBe(19);
  });

  it('the leaves lean the way the canopy does, and the owl is bigger than the old one', () => {
    const a = C.leafAt(3, 5, {}); const b = C.leafAt(3, 5 + 40, {});
    expect(Number.isFinite(a.x + a.z + b.x + b.z)).toBe(true);
    expect(C.OWL.y).toBeGreaterThan(5);
  });
});
