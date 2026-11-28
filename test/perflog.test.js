import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { memoryStorage } from './helpers/storage.js';
import {
  createGapTally, cleanRow, addRow, loadRows, saveRows, summarize, toCsv, CSV_COLUMNS, PERF_KEY, PERF_CAPACITY, minuteStamp,
} from '../src/perflogcore.js';
import { startPerfLog } from '../src/perflog.js';
import { classify } from '../src/savekeys.js';
import { report, parseCsv } from '../scripts/perfreport.mjs';

const walk = (o = {}) => ({ kind: 'walk', time: '2026-11-28T10:31Z', device: 'iPad7,11', build: 'abc', memoryGB: 2.9, place: 'river', rung: 3, tier: 'low', medianMs: 33.5, p95Ms: 50.5, slowShare: 0.2, frames: 900, thermal: 'nominal', lowPower: false, draws: 120, triangles: 40000, ...o });

describe('perf log core', () => {
  it('the tally gives median, p95 and slow share', () => {
    const t = createGapTally();
    for (let i = 0; i < 90; i++) t.add(16.7);
    for (let i = 0; i < 10; i++) t.add(80);
    expect(t.percentile(0.5)).toBeCloseTo(16.5, 0);
    expect(t.percentile(0.95)).toBeGreaterThan(75);
    expect(t.slowShare()).toBeCloseTo(0.1);
    t.reset();
    expect(t.count).toBe(0);
  });
  it('sanitises: drops unknown fields, names and long strings', () => {
    const r = cleanRow({ ...walk(), petName: 'Biscuit', code: 'ABCD-1234', place: 'Mittens the Brave!!', tier: 'x'.repeat(40), device: 'iPad 7 (Charlie)' });
    expect(r.petName).toBeUndefined();
    expect(r.code).toBeUndefined();
    expect(r.place).toBe('');
    expect(r.tier).toBe('');
    expect(r.device).toBe('');
    expect(cleanRow(null)).toBeNull();
    expect(cleanRow({ kind: 'other' })).toBeNull();
    expect(Object.keys(cleanRow(walk())).every((k) => CSV_COLUMNS.includes(k))).toBe(true);
  });
  it('the ring keeps the newest rows and saves under the kept key', () => {
    let rows = [];
    for (let i = 0; i < PERF_CAPACITY + 25; i++) rows = addRow(rows, walk({ frames: i }));
    expect(rows.length).toBe(PERF_CAPACITY);
    expect(rows.at(-1).frames).toBe(PERF_CAPACITY + 24);
    const st = memoryStorage();
    expect(saveRows(st, rows)).toBe(true);
    expect(loadRows(st).length).toBe(PERF_CAPACITY);
    expect(loadRows(memoryStorage({ [PERF_KEY]: 'not json' }))).toEqual([]);
  });
  it('is classified as kept', () => { expect(classify(PERF_KEY)).toBe('kept'); });
  it('summarises per place and writes CSV', () => {
    const rows = [walk(), walk({ medianMs: 16.7, p95Ms: 20.5, rung: 0, place: 'farm', slowShare: 0 })].map(cleanRow);
    const s = summarize(rows);
    expect(s.map((x) => x.place)).toEqual(['farm', 'river']);
    expect(s[1].lowShare).toBe(1);
    const csv = toCsv(rows);
    expect(csv.split('\n')[0]).toBe(CSV_COLUMNS.join(','));
    expect(csv).toContain('iPad7,11');
    const text = report(parseCsv(csv));
    expect(text).toContain('iPad7,11 (2.9 GB)');
    expect(text).toContain('river');
  });
  it('minuteStamp rounds to the minute', () => { expect(minuteStamp(Date.UTC(2026, 10, 28, 10, 31, 59))).toBe('2026-11-28T10:31Z'); });
});

describe('sampler', () => {
  it('writes a start row, then one walk row per window, and marks the first walk', () => {
    const st = memoryStorage();
    let t = 0;
    const log = startPerfLog({ storage: st, build: 'b1', now: () => 1e12 + t, device: () => ({ model: 'iPad7,11', memoryGB: 2.9, thermal: 'fair', lowPower: true }), rung: () => ({ rung: 3, tier: 'low' }), paint: () => 1.2, boot: () => 4000, isApp: true });
    log.seed();
    const session = { areaId: 'river', scene: {} };
    for (let i = 0; i < 1000; i++) { t += 33.4; log.frame(t, session); log.end(); }
    const rows = loadRows(st);
    expect(rows[0]).toMatchObject({ kind: 'start', device: 'iPad7,11', app: true, firstFrameS: 1.2, firstWalkS: 4 });
    const walks = rows.filter((r) => r.kind === 'walk');
    expect(walks.length).toBeGreaterThanOrEqual(1);
    expect(walks[0]).toMatchObject({ place: 'river', rung: 3, tier: 'low', thermal: 'fair', lowPower: true });
    expect(walks[0].medianMs).toBeGreaterThan(30);
  });
  it('the row never holds anything outside the known fields', () => {
    const st = memoryStorage();
    const log = startPerfLog({ storage: st, now: () => 1e12 });
    let t = 0;
    for (let i = 0; i < 1000; i++) { t += 16.7; log.frame(t, { areaId: 'farm', petName: 'Biscuit' }); }
    for (const r of loadRows(st)) expect(Object.keys(r).every((k) => CSV_COLUMNS.includes(k) || k === 'launch')).toBe(true);
    expect(JSON.stringify(loadRows(st))).not.toContain('Biscuit');
  });
});

describe('wiring', () => {
  const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  it('settings carries the Performance log rows and lazy-loads the sampler', () => {
    const hb = read('../src/ui/homebase.js');
    for (const id of ['set-perf-show', 'set-perf-copy', 'set-perf-clear']) expect(hb).toContain(id);
    expect(hb).toContain("import('../perflog.js')");
    expect(hb).not.toMatch(/^import .*perflog/m);
  });
  it('start-up files take the sampler only lazily and add no three.js symbols', () => {
    const main = read('../src/main.js');
    expect(main).toContain("import('./perflog.js')");
    expect(main).not.toMatch(/^import .*perflog/m);
    for (const f of ['../src/perflog.js', '../src/perflogcore.js']) expect(read(f)).not.toMatch(/from 'three/);
  });
});
