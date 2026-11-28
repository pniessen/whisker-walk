import { describe, it, expect } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';
stubCanvasDocument();
const T = await import('../src/world/crystaltalesplan.js');
const D = await import('../src/world/crystaldecor.js');
const A = await import('../src/world/crystalalive.js');
const P = await import('../src/world/crystalplan.js');

const RECTS = [[-36.6, -32.2, -16.6, 24.6], [19, 31, 6, 18], [-30, -17, 17.5, 29.5], [-34, -22, -33, -20.5], [-10, -3, 3.5, 10.5], [26, 36, -6, 22]]; // the wings' footprints
const inRect = (x, z, r) => RECTS.some((f) => x + r > f[0] && x - r < f[1] && z + r > f[2] && z - r < f[3]);

describe('crystal tales (beauty pass 4)', () => {
  it('the props stand clear of every small decor site, every collider and every wing footprint', () => {
    const small = [...D.smallSites('high'), ...D.beautySites('high')];
    for (const s of [T.CAMP, T.WHEEL, T.BENCH, T.BED]) {
      for (const k of D.decorAvoid()) expect(Math.hypot(s.x - k[0], s.z - k[1]), `${s.x},${s.z} vs avoid ${k}`).toBeGreaterThanOrEqual(k[2] + s.r - 0.3);
      for (const k of small) expect(Math.hypot(s.x - k.x, s.z - k.z)).toBeGreaterThanOrEqual((k.rad || 1) + s.r - 0.3);
      expect(inRect(s.x, s.z, s.r)).toBe(false);
    }
    for (const w of T.WAYMARKS) expect(inRect(w.x, w.z, 0.5)).toBe(false);
  });
  it('the mural slab is outside the walkable edge', () => { expect(T.MURAL.z - 0.25).toBeLessThan(P.CRYSTAL_BOUNDS.minZ); });
  it('the trail has prints and each is clear', () => { expect(T.trailPrints().length).toBeGreaterThan(8); });
  it('the bloom and the star are pure functions of the clock and rare', () => {
    expect(A.bloomAt(10).env).toBe(0);
    expect(A.bloomAt(A.EVENTS.bloomFirst + 2).env).toBeGreaterThan(0.9);
    expect(A.bloomAt(A.EVENTS.bloomFirst + 40).env).toBe(0);
    expect(A.bloomAt(A.EVENTS.bloomFirst + 5.5).rainbow).toBeGreaterThan(0.9);
    expect(A.bloomAt(A.EVENTS.bloomFirst + 3).cyc).toBe(A.bloomAt(A.EVENTS.bloomFirst + 4).cyc);
    expect(A.starAt(A.EVENTS.starFirst + 1).s).toBeCloseTo(1);
    expect(A.EVENTS.bloomEvery).toBeGreaterThanOrEqual(180);
  });
});
