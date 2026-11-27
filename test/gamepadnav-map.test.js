// Reachability of every place on the world map (Change place) by 4-direction
// pad hops, on the REAL map geometry. Each place's rect is a box centred on its
// (x, y) with half-size r (the island: its star, ISLAND_HIT_R).
import { describe, it, expect } from 'vitest';
import { CATALOG } from '../src/progression.js';
import { worldMapModel, ISLAND_HIT_R } from '../src/worldmap.js';
import { pickNext } from '../src/gamepadnavcore.js';

const save = {
  edition: 'canon', points: 0,
  walks: { neighborhood: 0, park: 0, seaside: 0, den: 0, docks: 0, woods: 0 },
  unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood'] },
  equipped: { cat: 'tabby' }, area: 'neighborhood',
};
const m = worldMapModel(save, CATALOG);
const boxes = [
  ...m.regions.map((r) => ({ id: r.id, rect: { x: r.x - r.r, y: r.y - r.r, w: 2 * r.r, h: 2 * r.r } })),
  { id: 'island', rect: { x: m.star.x - ISLAND_HIT_R, y: m.star.y - ISLAND_HIT_R, w: 2 * ISLAND_HIT_R, h: 2 * ISLAND_HIT_R } },
];
const DIRS = ['up', 'down', 'left', 'right'];
const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
const hop = (id, dir) => {
  const from = boxes.find((b) => b.id === id).rect;
  return pickNext(from, boxes.filter((b) => b.id !== id), dir);
};

describe('world map pad hopping', () => {
  it('every place reaches every other by repeated hops', () => {
    const bad = [];
    for (const a of boxes) {
      const seen = new Set([a.id]);
      const q = [a.id];
      while (q.length) {
        const id = q.shift();
        for (const d of DIRS) {
          const n = hop(id, d);
          if (n && !seen.has(n)) { seen.add(n); q.push(n); }
        }
      }
      const missing = boxes.filter((b) => !seen.has(b.id)).map((b) => b.id);
      if (missing.length) bad.push(`${a.id} cannot reach ${missing.join(',')}`);
    }
    expect(bad).toEqual([]);
  });
  it('every place can be entered (some neighbour hops onto it)', () => {
    for (const b of boxes) {
      const entered = boxes.some((o) => DIRS.some((d) => hop(o.id, d) === b.id));
      expect(entered, b.id).toBe(true);
    }
  });
  it('Seaside is right of the Market, and left from Seaside is not a trap', () => {
    expect(hop('market', 'right')).toBe('seaside');
    expect(hop('seaside', 'left')).not.toBeNull();
  });
  it('mostly symmetric: left after right returns (reports the exceptions)', () => {
    let total = 0;
    const misses = [];
    for (const a of boxes) {
      for (const d of DIRS) {
        const b = hop(a.id, d);
        if (!b) continue;
        total += 1;
        if (hop(b, opposite[d]) !== a.id) misses.push(`${a.id} -${d}-> ${b} -${opposite[d]}-> ${hop(b, opposite[d])}`);
      }
    }
    console.log(`asymmetric hops: ${misses.length}/${total}\n${misses.join('\n')}`);
    expect(misses.length).toBeLessThanOrEqual(Math.floor(total / 2));
  });

  it('model geometry (map rework): Docks right is the Market, and the Market right is the Seaside', () => {
    expect(hop('docks', 'right')).toBe('market');
    expect(hop('market', 'right')).toBe('seaside');
  });
});

// The owner's real-pad readings (screen centres, boxes about 1.2 x the model radii).
describe('world map pad hopping: the owner\'s screen readings', () => {
  const at = (id, x, y, r) => ({ id, rect: { x: x - r, y: y - r, w: 2 * r, h: 2 * r } });
  const screen = [
    at('market', 1210, 1130, 55), at('seaside', 1410, 1160, 108), at('park', 1310, 920, 108),
    at('docks', 1070, 1250, 96), at('roofs', 1030, 890, 55), at('town', 1030, 1040, 132),
  ];
  const go = (id, dir) => pickNext(screen.find((b) => b.id === id).rect, screen.filter((b) => b.id !== id), dir);
  it('Market right is Seaside, not Park', () => expect(go('market', 'right')).toBe('seaside'));
  it('Park down is Seaside', () => expect(go('park', 'down')).toBe('seaside'));
  it('Docks up is Twolegplace', () => expect(go('docks', 'up')).toBe('town'));
  it('Docks right is Seaside, not Market', () => expect(go('docks', 'right')).toBe('seaside'));
  it('Seaside left returns somewhere', () => expect(go('seaside', 'left')).not.toBeNull());
});
