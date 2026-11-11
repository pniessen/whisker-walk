import { describe, test, expect } from 'vitest';
import { USAGE_IDS, USAGE_NAME, USAGE_MAX, sanitizeUsage, bumpUsage, mergeUsage, usageRows, usageHtml } from '../src/usage.js';
import { HOME_SHEETS } from '../src/ui/dressingroom.js';
import { createProgression } from '../src/progression.js';

const SAVE = 'whisker-walk-save';
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

describe('usage counts: the pure helpers', () => {
  test('every home sheet is counted, plus Dress up and the builder, each with a name', () => {
    expect([...USAGE_IDS].sort()).toEqual([...HOME_SHEETS, 'dressup', 'builder'].sort());
    for (const id of USAGE_IDS) expect(USAGE_NAME[id]).toMatch(/\S/);
  });
  test('a bump adds one and stamps the visit; an unknown id changes nothing', () => {
    const a = bumpUsage({}, 'journal', 7);
    expect(a).toEqual({ journal: { n: 1, last: 7 } });
    expect(bumpUsage(a, 'journal', 9)).toEqual({ journal: { n: 2, last: 9 } });
    expect(bumpUsage(a, 'nonsense', 9)).toBe(a);
    expect(bumpUsage(a, '__proto__', 9)).toBe(a);
    expect(bumpUsage({ album: { n: USAGE_MAX, last: 1 } }, 'album', 2).album.n).toBe(USAGE_MAX);
  });
  test('outside data is cleaned: known ids, whole bounded numbers, no empty entries', () => {
    expect(sanitizeUsage(null)).toEqual({});
    expect(sanitizeUsage([1, 2])).toEqual({});
    expect(sanitizeUsage({
      journal: { n: 3.9, last: 12 }, album: { n: 0, last: 4 }, skills: { n: -2 }, colony: 'x',
      menu: { n: 1e15, last: NaN }, hack: { n: 5, last: 5 }, sync: { n: '4', last: 1 },
    })).toEqual({ journal: { n: 3, last: 12 }, menu: { n: USAGE_MAX, last: 0 } });
    expect(Object.keys(sanitizeUsage(JSON.parse('{"__proto__":{"n":4,"last":1}}')))).toEqual([]);
  });
  test('merging keeps the larger count and the later visit for each id', () => {
    expect(mergeUsage({ journal: { n: 2, last: 9 }, album: { n: 1, last: 1 } }, { journal: { n: 5, last: 3 }, skills: { n: 1, last: 2 } }))
      .toEqual({ journal: { n: 5, last: 9 }, album: { n: 1, last: 1 }, skills: { n: 1, last: 2 } });
  });
  test('rows: every id, most used first, never-opened ones last in list order', () => {
    const rows = usageRows({ album: { n: 2, last: 5 }, colony: { n: 9, last: 6 } });
    expect(rows).toHaveLength(USAGE_IDS.length);
    expect(rows.slice(0, 3).map((r) => r.id)).toEqual(['colony', 'album', 'menu']);
    expect(rows[2]).toEqual({ id: 'menu', name: 'Menu', n: 0, last: 0 });
  });
  test('the readout names every screen, shows counts and says never for the unused', () => {
    const html = usageHtml({ journal: { n: 4, last: 11 } }, { visits: 12, walks: 30 });
    expect(html).toContain('<summary>What gets used</summary>');
    expect(html).toContain('12 visits and 30 finished walks so far');
    expect(html).toContain('<tr><th scope="row">Journal</th><td>4</td><td>visit 11</td></tr>');
    expect(html).toContain('<tr class="never"><th scope="row">Album</th><td>0</td><td>never</td></tr>');
    expect(usageHtml({}, { visits: 1, walks: 1 })).toContain('1 visit and 1 finished walk so far');
    expect(usageHtml(undefined)).toContain('0 visits and 0 finished walks');
  });
});

describe('usage counts in the save', () => {
  test('a new save has none; noteUse counts, stamps the visit and is saved', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    expect(p.state.usage).toEqual({});
    p.recordVisit();
    expect(p.noteUse('journal')).toBe(true);
    expect(p.noteUse('journal')).toBe(true);
    expect(p.noteUse('walk')).toBe(false);
    expect(p.state.usage).toEqual({ journal: { n: 2, last: 1 } });
    expect(createProgression(storage).state.usage).toEqual({ journal: { n: 2, last: 1 } });
  });
  test('a save from before usage counts loads with none', () => {
    const p = createProgression(fakeStorage({ [SAVE]: JSON.stringify({ version: 4, points: 5 }) }));
    expect(p.state.usage).toEqual({});
  });
  test('loading a cloud save never lowers a count', () => {
    const p = createProgression(fakeStorage());
    p.noteUse('album'); p.noteUse('album'); p.noteUse('skills');
    const cloud = { ...structuredClone(p.state), usage: { album: { n: 1, last: 0 }, journal: { n: 6, last: 3 } } };
    p.replaceFromPayload(cloud);
    expect(p.state.usage).toEqual({ album: { n: 2, last: 0 }, journal: { n: 6, last: 3 }, skills: { n: 1, last: 0 } });
    const old = structuredClone(p.state); delete old.usage;
    p.replaceFromPayload(old);
    expect(p.state.usage.journal.n).toBe(6);
  });
});
