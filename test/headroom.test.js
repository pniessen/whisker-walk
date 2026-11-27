import { describe, it, expect } from 'vitest';
import { statusOf, buildRows, formatTable } from '../scripts/headroom.mjs';

const ceilings = { start: 720, area: 100, stage: { reef: { each: 65, total: 150 } } };
const data = {
  startKb: 700,
  areas: { fair: 96.4, market: 75, reef: 65, a: 1, b: 2, c: 3, d: 4, e: 5 },
  stages: { reef: { reef: 66, reeflab: 15.3, total: 97.3 } },
};

describe('headroom', () => {
  it('classifies status', () => {
    expect(statusOf(10)).toBe('OK');
    expect(statusOf(2.9)).toBe('TIGHT');
    expect(statusOf(-0.1)).toBe('OVER');
  });
  it('builds rows: start-up, stages, top 5 non-staged areas', () => {
    const rows = buildRows(data, ceilings);
    expect(rows.map((r) => r.name)).toEqual(['start-up', 'reef A', 'reef lab', 'reef (all stages)', 'fair (area)', 'market (area)', 'e (area)', 'd (area)', 'c (area)']);
    expect(rows[1].status).toBe('OVER');
    expect(rows[4].spare).toBeCloseTo(3.6);
    expect(rows[0].status).toBe('OK');
  });
  it('formats plain and markdown', () => {
    const rows = buildRows(data, ceilings);
    expect(formatTable(rows)).toContain('fair (area)');
    const md = formatTable(rows, true);
    expect(md.split('\n')[0]).toBe('| name | gzip kB | ceiling kB | spare kB | status |');
    expect(md).toContain('| fair (area) | 96.4 | 100.0 | 3.6 | OK |');
  });
});
