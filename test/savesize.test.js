// How big can one save get? Cat login's catch-up sends the save (not the photo
// album) on every push, so the size of a save that has every list at its cap
// is the size of the biggest push. The design's budget is 150 kB; measured on
// 2026-11-22 the worst case was about 101 kB (the colony 53 kB, the used gift
// codes 34 kB, the marks 11 kB), a real mature save far less (the 2026-11-19
// fixture is 1.9 kB). If a new field pushes the worst case over the budget this
// fails, and the fix is to trim that field before the auto-pull is trusted.
import { describe, it, expect } from 'vitest';
import { sanitizeSave, CATALOG } from '../src/progression.js';
import { MARK_AREAS } from '../src/marks.js';
import { CAT_NAMES } from '../src/straynames.js';

const BUDGET_BYTES = 150_000;
const u = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;
const walk = (i) => `walk-${1760000000000 + i}`;

function biggestSave() {
  const look = { coat: 'ginger', marks: 'black', pattern: 'solid', fur: 'short', eyes: 'green', size: 1 };
  const names = CAT_NAMES.slice(0, 24);
  const marks = {};
  for (const a of MARK_AREAS) marks[a] = Array.from({ length: 8 }, (_, i) => ({ kind: 'dig', id: null, x: i * 3.3333, z: i * -2.7777, at: 1.7e12 + i, contested: false }));
  const feeds = names.flatMap((n, i) => [1, 2].flatMap((who) => Array.from({ length: 6 }, (_, j) => ({ cat: n, by: u(who), walk: walk(i * 20 + j + who * 7), head: 1 }))));
  return sanitizeSave({
    version: 4, points: 99999, lifetimePoints: 999999, bestWalk: 999,
    unlocked: { cats: Object.keys(CATALOG.cats), accessories: Object.keys(CATALOG.accessories), areas: Object.keys(CATALOG.areas) },
    customCats: ['mine1', 'mine2', 'mine3', 'mine4', 'mine5'].map((id, i) => ({ id, name: `Mittens${'abcde'[i]}`, personality: 'keenNose', look })),
    moreCatSlots: true,
    redeemed: Array.from({ length: 500 }, (_, i) => i.toString(16).padStart(64, '0')),
    marks,
    golden: Array.from({ length: 64 }, (_, i) => `gm-spot${'abcdefghij'[i % 10]}-${1 + (i % 9)}`),
    colony: {
      id: u(900), partner: null,
      cats: names.map((n, i) => ({ name: n, finder: u(1), area: 'park', x: 3.5, z: -4.5, wear: null, tamedBy: u(1), tamedWalk: walk(i) })),
      feeds,
      seen: { feedKeys: feeds.map((f) => `${f.cat}|${f.by}|${f.walk}`), tamed: names, trades: [], day: '2026-11-20' },
    },
  });
}

describe('the biggest a save can get', () => {
  it('is under the 150 kB budget, so a catch-up stays small on an old iPad', () => {
    const save = biggestSave();
    const bytes = JSON.stringify(save).length;
    const top = Object.entries(save).map(([k, v]) => [k, JSON.stringify(v).length]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    expect(bytes, `biggest fields: ${JSON.stringify(top)}`).toBeLessThan(BUDGET_BYTES);
    // and the test really did fill the lists (a sanitiser that quietly dropped them would make this pass for nothing)
    expect(save.redeemed).toHaveLength(500);
    expect(save.colony.feeds.length).toBeGreaterThan(200);
    expect(bytes).toBeGreaterThan(60_000);
  });
});
