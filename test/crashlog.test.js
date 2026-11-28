import { describe, it, expect, vi } from 'vitest';
import { memoryStorage } from './helpers/storage.js';
import { createDiagnostics } from '../src/diagnostics.js';
import {
  sanitizeMessage, toRecord, saveRecord, loadRecords, createUploader, startCrashLog,
  formatReport, crashId, CRASH_KEY, CRASH_CAPACITY, CRASH_UPLOADS_PER_SESSION,
} from '../src/crashlog.js';
import { formatDiagHtml } from '../src/ui/perfhud.js';

const settingsOf = (on) => ({ get: (k) => (k === 'crashUpload' ? on : undefined) });
const ctx = { place: 'river', build: 'abc123', tier: 'phone/high', couch: false, room: true };

describe('sanitising', () => {
  it('takes URLs, queries, quoted names and room codes out', () => {
    const msg = sanitizeMessage('Failed to fetch https://x.supabase.co/rest/v1/rooms?code=ABCD&name=Biscuit for room ABCD, cat "Mittens", name: Whiskers, mail kid@example.com');
    for (const leak of ['supabase', '?code', 'ABCD', 'Biscuit', 'Mittens', 'Whiskers', 'example.com']) expect(msg).not.toContain(leak);
  });

  it('removes ids and long numbers and caps the length', () => {
    expect(sanitizeMessage('id 123e4567-e89b-12d3-a456-426614174000 n 123456789')).not.toMatch(/123e4567|123456789/);
    expect(sanitizeMessage('x'.repeat(500)).length).toBeLessThanOrEqual(140);
  });

  it('keeps the useful shape of an ordinary error', () => {
    expect(sanitizeMessage('TypeError: x is not a function')).toBe('TypeError: x is not a function');
  });

  it('a record keeps only file name and line from a script URL, and leaks nothing from extras', () => {
    const rec = toRecord(
      { kind: 'error', message: 'boom in room QWER', source: 'https://h/whisker-walk/assets/main-ab1.js?room=QWER#x', line: 42, count: 2, time: 5, petName: 'Biscuit', saveData: { a: 1 } },
      { ...ctx, place: 'river?room=QWER', petName: 'Biscuit' },
      ['walk:river', 'Biscuit!', 'walk-end'],
    );
    expect(rec.file).toBe('main-ab1.js');
    const text = JSON.stringify(rec);
    for (const leak of ['QWER', 'Biscuit', 'https', 'saveData', '?room']) expect(text).not.toContain(leak);
    expect(Object.keys(rec).sort()).toEqual(['build', 'couch', 'count', 'crumbs', 'file', 'id', 'kind', 'line', 'msg', 'place', 'room', 't', 'tier']);
  });
});

describe('storage', () => {
  it('is bounded to the capacity, newest last', () => {
    const st = memoryStorage();
    for (let i = 0; i < CRASH_CAPACITY + 7; i++) saveRecord(st, toRecord({ kind: 'frame', message: `m${i}x`, line: i + 1, time: i }, ctx));
    const list = loadRecords(st);
    expect(list).toHaveLength(CRASH_CAPACITY);
    expect(list.at(-1).line).toBe(CRASH_CAPACITY + 7);
  });

  it('the same failure updates one record', () => {
    const st = memoryStorage();
    saveRecord(st, toRecord({ kind: 'frame', message: 'same', line: 1, count: 1 }, ctx));
    saveRecord(st, toRecord({ kind: 'frame', message: 'same', line: 1, count: 4 }, ctx));
    const list = loadRecords(st);
    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(4);
  });

  it('never throws with storage that throws, is full or is junk', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const rec = toRecord({ kind: 'frame', message: 'm' }, ctx);
    expect(saveRecord(full, rec)).toBe(false);
    expect(saveRecord(broken, rec)).toBe(false);
    expect(saveRecord(null, rec)).toBe(false);
    expect(loadRecords(broken)).toEqual([]);
    expect(loadRecords(memoryStorage({ [CRASH_KEY]: '{not json' }))).toEqual([]);
    expect(loadRecords(memoryStorage({ [CRASH_KEY]: JSON.stringify([{ msg: 'x https://a/b?room=QQQQ', crumbs: 'no' }, 7, null]) }))[0].msg).not.toContain('QQQQ');
  });

  it('a stored list with a stranger in it is cleaned on the way in', () => {
    const st = memoryStorage({ [CRASH_KEY]: JSON.stringify([{ kind: 'error', msg: 'room ABCD', file: 'https://h/a.js?q=1', petName: 'Biscuit' }]) });
    const [r] = loadRecords(st);
    expect(JSON.stringify(r)).not.toMatch(/ABCD|Biscuit|https|q=1/);
  });
});

describe('the wiring and the opt-in gate', () => {
  function setup(on, sendImpl = vi.fn(async () => {})) {
    const diag = createDiagnostics();
    const storage = memoryStorage();
    let t = 1000;
    startCrashLog({ diag, storage, settings: settingsOf(on), context: () => ctx, send: sendImpl, now: () => (t += 5000) });
    return { diag, storage, send: sendImpl };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('persists each failure with its breadcrumbs and context', () => {
    const { diag, storage } = setup(false);
    diag.crumb('walk:river'); diag.crumb('ride Wheel!');
    diag.note('frame', new Error('bad'), { source: 'https://h/a/main-x.js?q=1', line: 9 });
    const [r] = loadRecords(storage);
    expect(r).toMatchObject({ kind: 'frame', file: 'main-x.js', line: 9, place: 'river', build: 'abc123', room: true, couch: false });
    expect(r.crumbs).toEqual(['walk:river', 'ridewheel']);
  });

  it('sends nothing while the switch is off', async () => {
    const { diag, send } = setup(false);
    diag.note('frame', new Error('a'));
    await tick();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends a sanitised row once per new crash id when on, and never reads a name', async () => {
    const { diag, send } = setup(true);
    diag.note('frame', new Error('boom ABCD "Biscuit"'));
    diag.note('frame', new Error('boom ABCD "Biscuit"'));
    diag.note('frame', new Error('other'));
    await tick();
    expect(send).toHaveBeenCalledTimes(2);
    const text = JSON.stringify(send.mock.calls);
    expect(text).not.toMatch(/ABCD|Biscuit/);
    expect(Object.keys(send.mock.calls[0][0]).sort()).toEqual(['build', 'couch', 'count', 'crumbs', 'file', 'id', 'kind', 'line', 'message', 'place', 'room', 'tier']);
  });

  it('limits to five a session', async () => {
    const { diag, send } = setup(true);
    for (let i = 0; i < 12; i++) diag.note('frame', new Error(`distinct failure number ${i}x`));
    await tick();
    expect(send).toHaveBeenCalledTimes(CRASH_UPLOADS_PER_SESSION);
  });

  it('a failing send is silent and not retried', async () => {
    const send = vi.fn(async () => { throw new Error('offline'); });
    const { diag } = setup(true, send);
    diag.note('frame', new Error('a'));
    diag.note('frame', new Error('a'));
    await tick();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a throwing settings read or storage never reaches the game', () => {
    const diag = createDiagnostics();
    const bad = { get: () => { throw new Error('x'); } };
    startCrashLog({ diag, storage: { getItem() { throw new Error('d'); }, setItem() { throw new Error('d'); } }, settings: bad, context: () => { throw new Error('c'); }, send: vi.fn() });
    expect(() => diag.note('frame', new Error('a'))).not.toThrow();
  });

  it('switching the setting off mid-session stops sending', async () => {
    let on = true;
    const send = vi.fn(async () => {});
    const diag = createDiagnostics();
    startCrashLog({ diag, storage: memoryStorage(), settings: { get: () => on }, context: () => ctx, send });
    on = false;
    diag.note('frame', new Error('late'));
    await tick();
    expect(send).not.toHaveBeenCalled();
  });

  it('failures from before the chunk loaded are kept too, and earlier ones are exposed', () => {
    const diag = createDiagnostics();
    diag.note('frame', new Error('early'));
    const storage = memoryStorage();
    saveRecord(storage, toRecord({ kind: 'gl', message: 'old' }, ctx));
    startCrashLog({ diag, storage, settings: settingsOf(false), context: () => ctx, send: vi.fn() });
    expect(diag.earlier().map((r) => r.msg)).toEqual(['old']);
    expect(loadRecords(storage).map((r) => r.msg)).toEqual(['old', 'Error: early']);
  });
});

describe('uploader alone', () => {
  it('dedupes by id', async () => {
    const send = vi.fn(async () => {});
    const up = createUploader({ enabled: () => true, send });
    const rec = toRecord({ kind: 'a', message: 'b' }, ctx);
    expect(up.offer(rec)).toBe(true);
    expect(up.offer(rec)).toBe(false);
  });
  it('crashId is stable and hex', () => {
    expect(crashId('a', 'b', 'c.js', 1)).toBe(crashId('a', 'b', 'c.js', 1));
    expect(crashId('a', 'b', 'c.js', 1)).toMatch(/^[0-9a-f]{14}$/);
    expect(crashId('a', 'b', 'c.js', 2)).not.toBe(crashId('a', 'b', 'c.js', 1));
  });
});

describe('report and readout', () => {
  it('formats a report with no leak', () => {
    const recs = [toRecord({ kind: 'frame', message: 'oops "Biscuit"', source: 'm.js', line: 3, count: 2, time: 0 }, ctx, ['walk:river'])];
    const text = formatReport(recs, 'abc');
    expect(text).toContain('frame x2');
    expect(text).toContain('steps: walk:river');
    expect(text).not.toContain('Biscuit');
    expect(formatReport([], 'abc')).toContain('Nothing has gone wrong');
  });

  it('perfhud marks earlier entries', () => {
    const html = formatDiagHtml([], 0, true, 4, [{ kind: 'gl', msg: 'old', file: 'a.js', line: 2, count: 1 }]);
    expect(html).toContain('1 earlier');
    expect(html).toContain('earlier · gl · old (a.js:2)');
    expect(formatDiagHtml([], 0, true, 4, [])).toBe('');
  });
});
