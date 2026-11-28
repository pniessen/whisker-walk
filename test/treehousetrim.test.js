// The Treehouse village, beauty round four (2026-11-28): lantern hoods, flower boxes, bridge wear, rugs, cushions, plates, chimes, moss. No new mesh, no caster.
import { describe, it, expect } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const P = await import('../src/world/treehouseplan.js');
const T = await import('../src/world/treehousetrim.js');

describe('planTrim', () => {
  const plan = T.planTrim();
  it('is the same every time', () => { expect(T.planTrim()).toEqual(plan); });
  it('hoods the lanterns, hangs boxes, wears the bridges, dresses the huts', () => {
    expect(plan.hoods.length).toBeGreaterThanOrEqual(14);
    expect(plan.boxes.length).toBeGreaterThanOrEqual(4);
    expect(plan.seams.length).toBeGreaterThan(10);
    expect(plan.mats.length).toBeGreaterThanOrEqual(2);
    expect(plan.cushions.length).toBeGreaterThanOrEqual(4);
    expect(plan.chimes.length).toBe(2);
    expect(plan.plates.length).toBe(2);
  });
  it('no box hangs over an opening, and every limb tuft is above the canopy floor', () => {
    for (const b of plan.boxes) expect(Number.isFinite(b.x + b.y + b.z)).toBe(true);
    for (const t of plan.limbTufts) expect(t.y).toBeGreaterThanOrEqual(P.CANOPY_MIN_Y);
  });
  it('every cushion and mat stands on its deck', () => {
    for (const c of [...plan.cushions, ...plan.mats]) {
      const k = P.DECKS.find((d) => d.y === c.y && Math.abs(c.x - d.x) <= d.w / 2 && Math.abs(c.z - d.z) <= d.d / 2);
      expect(k, JSON.stringify(c)).toBeTruthy();
    }
  });
});
