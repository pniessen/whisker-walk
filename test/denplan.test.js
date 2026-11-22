// The den panel's plan-view layout (den shop UX, M1: pure data and checks).
import { describe, it, expect } from 'vitest';
import { DEN_SPOTS, DEN_ITEMS } from '../src/den.js';
import { PLAN_COLS, PLAN_ROWS, PLAN_CELLS, cellFor, planOrderOk, ITEM_ICON, iconFor } from '../src/ui/denplan.js';

describe('denplan layout', () => {
  it('every spot has exactly one cell, inside the 5x5 grid, and no cell is shared', () => {
    const seen = new Set();
    for (const s of DEN_SPOTS) {
      const c = cellFor(s.id);
      expect(c, s.id).toBeTruthy();
      expect(c.col).toBeGreaterThanOrEqual(0); expect(c.col).toBeLessThan(PLAN_COLS);
      expect(c.row).toBeGreaterThanOrEqual(0); expect(c.row).toBeLessThan(PLAN_ROWS);
      const k = `${c.col},${c.row}`;
      expect(seen.has(k), `${s.id} shares ${k}`).toBe(false);
      seen.add(k);
    }
    expect(Object.keys(PLAN_CELLS).sort()).toEqual(DEN_SPOTS.map((s) => s.id).sort());
    expect(cellFor('nope')).toBeNull();
  });

  it('keeps the room order: no two spots swap places left-right or back-front', () => {
    expect(planOrderOk(DEN_SPOTS)).toBe(true);
    const bad = { ...PLAN_CELLS, center: PLAN_CELLS['corner-d'], 'corner-d': PLAN_CELLS.center };
    expect(planOrderOk(DEN_SPOTS, bad)).toBe(false);
  });

  it('a 13th spot without a cell fails the check', () => {
    expect(planOrderOk([...DEN_SPOTS, { id: 'new-spot', x: 1, z: 1 }])).toBe(false);
  });

  it('cells are at least 44 px apart on a 320 px wide sheet', () => {
    expect(320 / PLAN_COLS).toBeGreaterThanOrEqual(44);
  });

  it('every furniture piece has an icon, and an unknown piece gets a plain one', () => {
    for (const id of Object.keys(DEN_ITEMS)) expect(typeof ITEM_ICON[id], id).toBe('string');
    expect(iconFor('nope')).toBe('📦');
    expect(iconFor('rug')).toBe(ITEM_ICON.rug);
  });
});
