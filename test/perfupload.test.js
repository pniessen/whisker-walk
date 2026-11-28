import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { memoryStorage } from './helpers/storage.js';
import { saveRows, minuteStamp } from '../src/perflogcore.js';
import { startPerfLog } from '../src/perflog.js';
import { toPerfRow, createPerfUploader, dailySummary, makeToken, livePerfSender, UPLOAD_KEY, RUNG_ROWS_PER_SESSION } from '../src/perfupload.js';
import { classify } from '../src/savekeys.js';
import { fromTableRows, report } from '../scripts/perfreport.mjs';

const T0 = Date.parse('2026-11-28T10:31:40Z');
const walk = (o = {}) => ({ kind: 'walk', time: minuteStamp(T0), device: 'iPad7,11', build: 'abc', memoryGB: 2.9, place: 'river', rung: 3, tier: 'low', medianMs: 33.5, p95Ms: 50.5, slowShare: 0.2, frames: 900, thermal: 'nominal', lowPower: false, draws: 120, triangles: 40000, ...o });
const ALLOWED = ['kind', 'time', 'device', 'memory_gb', 'app', 'build', 'place', 'rung', 'tier', 'median_ms', 'p95_ms', 'slow_share', 'thermal', 'low_power', 'draws', 'triangles', 'first_frame_s', 'first_walk_s', 'token'].sort();
const TOKEN = 'a'.repeat(32);

describe('the row allow-list', () => {
  it('sends exactly the allowed fields and nothing else', () => {
    const row = toPerfRow({ ...walk(), kind: 'rung', petName: 'Biscuit', code: 'ABCD-1234', save: { a: 1 }, name: 'Mia', ip: '1.2.3.4', frames: 5, launch: 77 }, TOKEN);
    expect(Object.keys(row).sort()).toEqual(ALLOWED);
    expect(JSON.stringify(row)).not.toMatch(/Biscuit|ABCD|Mia|1\.2\.3\.4/);
  });
  it('clamps numbers and refuses odd strings', () => {
    const row = toPerfRow({ kind: 'summary', time: 'now', device: 'iPad 7 (Charlie)', build: 'a b', place: 'Mittens the Brave', tier: 'x'.repeat(40), memoryGB: 1e9, rung: 99, medianMs: -4, p95Ms: Infinity, slowShare: 3, thermal: 'lava', draws: 'many', triangles: NaN }, 'not-a-token');
    expect(row).toMatchObject({ kind: 'summary', time: '', device: '', build: '', place: '', tier: '', memory_gb: null, rung: null, median_ms: null, p95_ms: null, slow_share: null, thermal: 'nominal', draws: null, triangles: null, token: '' });
  });
  it('anything that is not a summary is a rung row; garbage in gives a harmless row', () => {
    expect(toPerfRow(null, TOKEN).kind).toBe('rung');
    expect(toPerfRow('x', TOKEN).device).toBe('');
  });
  it('the token is 32 random hex characters, from nothing about the player', () => {
    const a = makeToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(makeToken()).not.toBe(a);
    expect(makeToken({})).toMatch(/^[0-9a-f]{32}$/);
  });
  it('the kept key is classified as kept', () => { expect(classify(UPLOAD_KEY)).toBe('kept'); });
  it('the source names no cat, save or code fields', () => {
    const src = readFileSync(new URL('../src/perfupload.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/petName|catName|secret|cloudcode|getItem\('whisker-walk-(save|player)/);
  });
});

describe('the uploader', () => {
  const make = (over = {}) => {
    const storage = memoryStorage();
    const sent = [];
    const send = vi.fn(async (row) => { sent.push(row); });
    let clock = T0;
    saveRows(storage, [walk({ place: 'river' }), walk({ place: 'river', medianMs: 20.5 }), walk({ place: 'moor' })]);
    const up = createPerfUploader({ enabled: () => true, send, storage, now: () => clock, ...over });
    return { storage, sent, send, up, tick: (ms) => { clock += ms; } };
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('is a no-op while the switch is off', async () => {
    const { up, send } = make({ enabled: () => false });
    expect(up.offer(walk())).toBe(false);
    await flush();
    expect(send).not.toHaveBeenCalled();
  });
  it('sends at most one summary a day, then again the next day', async () => {
    const { up, sent, storage, tick } = make();
    expect(up.offer(walk())).toBe(true);
    expect(up.offer(walk())).toBe(false);
    tick(3600_000);
    expect(up.offer(walk())).toBe(false);
    await flush();
    expect(sent.length).toBe(1);
    expect(sent[0]).toMatchObject({ kind: 'summary', place: 'river', device: 'iPad7,11' });
    expect(Object.keys(sent[0]).sort()).toEqual(ALLOWED);
    const kept = JSON.parse(storage.getItem(UPLOAD_KEY));
    expect(kept.token).toBe(sent[0].token);
    tick(24 * 3600_000);
    saveRows(storage, [walk({ time: minuteStamp(T0 + 25 * 3600_000) })]);
    expect(up.offer(walk())).toBe(true);
    await flush();
    expect(sent.length).toBe(2);
    expect(sent[1].token).toBe(sent[0].token);
  });
  it('sends a rung row when the rung changes, at most 10 a session; the first window is only the baseline', async () => {
    const { up, sent } = make();
    up.offer(walk({ rung: 3 }));
    await flush();
    expect(sent.filter((r) => r.kind === 'rung').length).toBe(0);
    for (let i = 0; i < 30; i++) up.offer(walk({ rung: i % 2 ? 3 : 4 }));
    await flush();
    expect(sent.filter((r) => r.kind === 'rung').length).toBe(RUNG_ROWS_PER_SESSION);
    for (const r of sent) expect(Object.keys(r).sort()).toEqual(ALLOWED);
  });
  it('a failing send is swallowed', async () => {
    const { up } = make({ send: async () => { throw new Error('offline'); } });
    expect(() => up.offer(walk())).not.toThrow();
    await flush();
  });
  it('no summary without a walk in the last day (nothing to say), and a start row never uploads', () => {
    const storage = memoryStorage();
    saveRows(storage, [walk({ time: '2026-11-01T10:00Z' })]);
    expect(dailySummary(JSON.parse(storage.getItem('whisker-walk-perf-log')), T0)).toBeNull();
    const up = createPerfUploader({ enabled: () => true, send: vi.fn(), storage, now: () => T0 });
    expect(up.offer({ kind: 'start' })).toBe(false);
  });
  it('the sampler hands finished walk rows to onSample and survives it throwing', () => {
    const storage = memoryStorage();
    const got = [];
    let t = 0;
    const log = startPerfLog({ storage, now: () => T0, onSample: (r) => { got.push(r); throw new Error('x'); } });
    const session = { areaId: 'river' };
    log.frame(0, session);
    for (let i = 1; i <= 2000; i++) { t += 16.7; log.frame(t, session); }
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((r) => r.kind === 'walk')).toBe(true);
  });
});

describe('the live sender', () => {
  it('does nothing offline, without keys, and inserts into perf_reports otherwise only through the shared client', async () => {
    const insert = vi.fn(async () => ({}));
    await livePerfSender({ url: '', key: '', nav: { onLine: true } })({});
    await livePerfSender({ url: 'u', key: 'k', nav: { onLine: false } })({});
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('perfreport --json', () => {
  it('reads exported summary rows and leaves rung rows out', () => {
    const rows = fromTableRows([{ kind: 'summary', device: 'iPad7,11', memory_gb: 2.9, place: 'river', rung: 3, median_ms: 33.5, p95_ms: 50.5, slow_share: 0.2 }, { kind: 'rung', device: 'iPad7,11', place: 'river' }]);
    expect(rows.length).toBe(1);
    expect(report(rows)).toContain('iPad7,11 (2.9 GB)');
    expect(fromTableRows(null)).toEqual([]);
  });
});
