import { describe, it, expect } from 'vitest';
import { heavyRows, formatRows } from '../scripts/heavycost.mjs';

const file = (name, seconds) => ({ name: `/x/test/${name}`, startTime: 1000, endTime: 1000 + seconds * 1000 });

describe('heavycost', () => {
  it('keeps files over 20 s, longest first, rounded, with bare file names', () => {
    const rows = heavyRows({ testResults: [file('a.test.js', 21.4), file('b.test.js', 90.6), file('c.test.js', 19.9), file('d.test.js', 20)] });
    expect(rows).toEqual([['b.test.js', 91], ['a.test.js', 21]]);
  });
  it('prints rows in the heavy.js shape', () => {
    expect(formatRows([['b.test.js', 91]])).toBe("  ['b.test.js', 91],");
  });
  it('handles an empty report', () => {
    expect(heavyRows({})).toEqual([]);
  });
});
