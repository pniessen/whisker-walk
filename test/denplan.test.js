// The den panel's plan-view layout (den shop UX, M1: pure data and checks).
import { describe, it, expect } from 'vitest';
import { DEN_SPOTS, DEN_ITEMS } from '../src/den.js';
import { pickNext } from '../src/gamepadnavcore.js';
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

// The pad's geometric navigation over the plan as drawn: the two tabs on top, the
// twelve spots on the 5x5 plan (60 px cells, 6 px gaps), the shelf chips below.
describe('the plan view is reachable by the pad from every cell', () => {
  const CELL = 60; const GAP = 6;
  const items = [];
  items.push({ id: 'tab-shop', rect: { x: 0, y: 0, w: 160, h: 44 } }, { id: 'tab-things', rect: { x: 166, y: 0, w: 160, h: 44 } });
  for (const s of DEN_SPOTS) {
    const c = PLAN_CELLS[s.id];
    items.push({ id: s.id, rect: { x: c.col * (CELL + GAP), y: 60 + c.row * (CELL + GAP), w: CELL, h: CELL } });
  }
  items.push({ id: 'chip-0', rect: { x: 0, y: 460, w: 150, h: 48 } }, { id: 'chip-1', rect: { x: 156, y: 460, w: 150, h: 48 } });
  const rectOf = (id) => items.find((i) => i.id === id).rect;
  const reach = (start) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const id = queue.shift();
      for (const dir of ['up', 'down', 'left', 'right']) {
        const next = pickNext(rectOf(id), items.filter((i) => i.id !== id), dir);
        if (next !== null && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    return seen;
  };
  it('from any spot, tab or chip, every control can be reached (no dead end, nothing stranded)', () => {
    for (const it of items) expect(reach(it.id).size, it.id).toBe(items.length);
  });
  it('left, right, up and down from the centre spot land on a neighbour in that direction', () => {
    const from = rectOf('center');
    for (const [dir, ok] of [['left', (r) => r.x < from.x], ['right', (r) => r.x > from.x], ['up', (r) => r.y < from.y], ['down', (r) => r.y > from.y]]) {
      const id = pickNext(from, items.filter((i) => i.id !== 'center'), dir);
      expect(id, dir).not.toBeNull();
      expect(ok(rectOf(id)), dir).toBe(true);
    }
  });
});
