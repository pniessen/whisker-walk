import { describe, it, expect } from 'vitest';
import {
  createDiagnostics, describeError, listenForErrors, DIAG_CAPACITY, DIAG_MESSAGE_MAX,
  DIAG_MEMORY_CAPACITY, diagnostics as record, noteMemory, whereFromStack,
} from '../src/diagnostics.js';

const clockFrom = (start = 1000) => { let t = start; return () => t++; };

describe('describeError', () => {
  it('names an Error by its name and message', () => {
    expect(describeError(new TypeError('x is undefined'))).toBe('TypeError: x is undefined');
    expect(describeError(new Error(''))).toBe('Error');
  });

  it('copes with whatever can be thrown', () => {
    expect(describeError('plain words')).toBe('plain words');
    expect(describeError(null)).toBe('null');
    expect(describeError(undefined)).toBe('undefined');
    expect(describeError(42)).toBe('42');
    expect(describeError({ code: 7 })).toBe('{"code":7}');
    expect(describeError(Symbol('s'))).toBe('Symbol(s)');
  });

  it('never throws on a circular object or a throwing getter', () => {
    const loop = {}; loop.self = loop;
    expect(describeError(loop)).toBe('[object Object]');
    const nasty = { get message() { throw new Error('boom'); } };
    expect(() => describeError(nasty)).not.toThrow();
    expect(describeError(nasty)).toBe('unreadable error');
    const noProto = Object.create(null);
    expect(() => describeError(noProto)).not.toThrow();
  });

  it('truncates, flattens whitespace, and drops URL queries', () => {
    const long = describeError('a'.repeat(500));
    expect(long).toHaveLength(DIAG_MESSAGE_MAX);
    expect(long.endsWith('…')).toBe(true);
    expect(describeError('line one\n   line two')).toBe('line one line two');
    expect(describeError('failed https://x.example/room?code=ABCD#frag here'))
      .toBe('failed https://x.example/room here');
  });
});

describe('createDiagnostics', () => {
  it('keeps at most its capacity, dropping the oldest', () => {
    const d = createDiagnostics({ now: clockFrom() });
    for (let i = 0; i < DIAG_CAPACITY + 5; i++) d.note('error', `failure ${i}`);
    const list = d.entries();
    expect(list).toHaveLength(DIAG_CAPACITY);
    expect(list[0].message).toBe('failure 5');
    expect(list.at(-1).message).toBe(`failure ${DIAG_CAPACITY + 4}`);
    expect(d.total).toBe(DIAG_CAPACITY + 5);
  });

  it('collapses repeats into one entry with a count, moved to the newest place', () => {
    const d = createDiagnostics({ capacity: 3, now: clockFrom(100) });
    // (no stack frames: the line the test happens to throw from is not what is under test; see the stack tests at the end)
    const same = () => Object.assign(new Error('same'), { stack: 'Error: same' });
    d.note('frame', same());
    d.note('save', 'quota');
    d.note('frame', same());
    d.note('frame', same());
    const list = d.entries();
    expect(list.map((e) => [e.kind, e.message, e.count])).toEqual([
      ['save', 'quota', 1],
      ['frame', 'Error: same', 3],
    ]);
    expect(list[1].time).toBe(103);
    expect(d.total).toBe(4);
    // a different kind, or a different line, is a different entry
    d.note('error', same());
    d.note('frame', same(), { source: 'a.js', line: 2 });
    expect(d.entries()).toHaveLength(3);
  });

  it('a throw every frame cannot push everything else out', () => {
    const d = createDiagnostics({ capacity: 5, now: clockFrom() });
    d.note('save', 'could not save');
    for (let i = 0; i < 1000; i++) d.note('frame', new Error('every frame'));
    expect(d.entries()).toHaveLength(2);
    expect(d.entries()[0].message).toBe('could not save');
  });

  it('keeps only the file name of a source and a positive whole line', () => {
    const d = createDiagnostics({ now: clockFrom() });
    const e = d.note('error', 'x', { source: 'https://host.example/whisker-walk/assets/main-abc.js?v=2', line: 12 });
    expect(e).toMatchObject({ source: 'main-abc.js', line: 12, count: 1 });
    expect(d.note('error', 'y', { source: 42, line: -3 })).toMatchObject({ source: '', line: 0 });
    expect(d.note('error', 'z', null)).toMatchObject({ source: '', line: 0 });
  });

  it('never throws, even when its clock does', () => {
    const d = createDiagnostics({ now: () => { throw new Error('clock'); } });
    expect(() => d.note('error', 'x')).not.toThrow();
    expect(d.note('error', 'x')).toBeNull();
    const ok = createDiagnostics({ now: clockFrom() });
    expect(() => ok.note(undefined, undefined, undefined)).not.toThrow();
    expect(ok.entries()[0]).toMatchObject({ kind: 'error', message: 'undefined' });
  });

  it('bumps its version on every note and on clear, and hands out a copy', () => {
    const d = createDiagnostics({ now: clockFrom() });
    const v0 = d.version;
    d.note('error', 'a');
    d.note('error', 'a');
    expect(d.version).toBe(v0 + 2);
    d.entries().length = 0;
    expect(d.entries()).toHaveLength(1);
    d.clear();
    expect(d.entries()).toHaveLength(0);
    expect(d.total).toBe(0);
    expect(d.version).toBe(v0 + 3);
  });
});

describe('memory readings', () => {
  const info = (geometries, textures, programs) => ({ memory: { geometries, textures }, programs });

  it('keeps the counts from a renderer\'s info, programs as a count', () => {
    const d = createDiagnostics({ now: clockFrom(500) });
    d.noteMemory(info(412, 96, new Array(31)));
    expect(d.memory()).toEqual([{ time: 500, geometries: 412, textures: 96, programs: 31 }]);
  });

  it('keeps the last few, newest last, and hands out a copy', () => {
    const d = createDiagnostics({ now: clockFrom() });
    for (let i = 0; i < DIAG_MEMORY_CAPACITY + 3; i++) d.noteMemory(info(i, 0, []));
    const list = d.memory();
    expect(DIAG_MEMORY_CAPACITY).toBe(5);
    expect(list.map((r) => r.geometries)).toEqual([3, 4, 5, 6, 7]);
    list.length = 0;
    expect(d.memory()).toHaveLength(DIAG_MEMORY_CAPACITY);
  });

  it('a missing or non-finite count is 0', () => {
    const d = createDiagnostics({ now: clockFrom() });
    d.noteMemory({});
    d.noteMemory({ memory: { geometries: NaN, textures: Infinity }, programs: null });
    d.noteMemory({ memory: { geometries: '7', textures: -Infinity } });
    for (const r of d.memory()) expect(r).toMatchObject({ geometries: 0, textures: 0, programs: 0 });
  });

  it('never pushes a failure out, and is not counted as one', () => {
    const d = createDiagnostics({ capacity: 2, now: clockFrom() });
    d.note('save', 'could not save');
    for (let i = 0; i < 50; i++) d.noteMemory(info(i, i, []));
    expect(d.entries().map((e) => e.message)).toEqual(['could not save']);
    expect(d.total).toBe(1);
  });

  it('bumps the version so the readout redraws, and clear() empties it too', () => {
    const d = createDiagnostics({ now: clockFrom() });
    const v0 = d.version;
    d.noteMemory(info(1, 1, []));
    expect(d.version).toBe(v0 + 1);
    d.clear();
    expect(d.memory()).toEqual([]);
  });

  it('never throws, on any input or a throwing clock', () => {
    const d = createDiagnostics({ now: clockFrom() });
    expect(() => d.noteMemory(undefined)).not.toThrow();
    expect(() => d.noteMemory(null)).not.toThrow();
    const nasty = { get memory() { throw new Error('boom'); } };
    expect(() => d.noteMemory(nasty)).not.toThrow();
    const broken = createDiagnostics({ now: () => { throw new Error('clock'); } });
    expect(() => broken.noteMemory(info(1, 1, []))).not.toThrow();
    expect(broken.memory()).toEqual([]);
  });

  it('the module-level noteMemory goes into the game\'s one record', () => {
    record.clear();
    noteMemory(info(3, 2, [1, 2]));
    expect(record.memory()).toEqual([expect.objectContaining({ geometries: 3, textures: 2, programs: 2 })]);
    record.clear();
  });
});

describe('listenForErrors', () => {
  function fakeTarget() {
    const handlers = {};
    return {
      handlers,
      addEventListener: (type, fn) => { handlers[type] = fn; },
    };
  }

  it('records uncaught errors and rejections without cancelling them', () => {
    const d = createDiagnostics({ now: clockFrom() });
    const target = fakeTarget();
    listenForErrors(target, d);
    let prevented = false;
    const ev = { error: new RangeError('bad'), message: 'bad', filename: 'https://h.example/app.js', lineno: 9, preventDefault: () => { prevented = true; } };
    target.handlers.error(ev);
    target.handlers.unhandledrejection({ reason: 'nope', preventDefault: () => { prevented = true; } });
    expect(prevented).toBe(false);
    expect(d.entries()).toEqual([
      expect.objectContaining({ kind: 'error', message: 'RangeError: bad', source: 'app.js', line: 9 }),
      expect.objectContaining({ kind: 'rejection', message: 'nope' }),
    ]);
  });

  it('a cross-origin "Script error." still counts; a failed image load does not', () => {
    const d = createDiagnostics({ now: clockFrom() });
    const target = fakeTarget();
    listenForErrors(target, d);
    target.handlers.error({ error: null, message: 'Script error.' });
    target.handlers.error({ target: {} }); // a resource error event
    target.handlers.unhandledrejection({ reason: undefined });
    expect(d.entries().map((e) => e.message)).toEqual(['Script error.', 'undefined']);
  });

  it('ignores a target it cannot listen on', () => {
    expect(() => listenForErrors(null)).not.toThrow();
    expect(() => listenForErrors({})).not.toThrow();
  });
});

describe('where a thrown error came from (the frame guard notes no place of its own)', () => {
  const chrome = { message: 'boom', name: 'TypeError', stack: 'TypeError: boom\n    at seatCat (https://x.example/whisker-walk/assets/moon-ab12.js?v=3:812:15)\n    at https://x.example/assets/main-cd.js:99:1' };
  const safari = { message: 'boom', name: 'TypeError', stack: 'seatCat@https://x.example/assets/moon-ab12.js:812:15\nframe@https://x.example/assets/main-cd.js:99:1' };

  it('reads the first script and line off a Chrome or a Safari stack, the file name only', () => {
    expect(whereFromStack(chrome)).toEqual({ source: 'https://x.example/whisker-walk/assets/moon-ab12.js?v=3', line: 812 });
    expect(whereFromStack(safari)).toEqual({ source: 'https://x.example/assets/moon-ab12.js', line: 812 });
    for (const bad of [null, undefined, 'x', 3, {}, { stack: 7 }, { stack: 'no frames here\nat <anonymous>' }]) expect(whereFromStack(bad)).toBe(null);
  });

  it('note() fills the file and line from the stack when the caller gives none, keeps a given place, and puts a place word first', () => {
    const d = createDiagnostics({ now: clockFrom() });
    const e = d.note('frame', Object.assign(new TypeError('boom'), { stack: chrome.stack }), { tag: 'Moon!' });
    expect(e).toMatchObject({ kind: 'frame', message: '[Moon] TypeError: boom', source: 'moon-ab12.js', line: 812 });
    expect(d.note('error', chrome, { source: 'https://x.example/a.js?q=room1', line: 5 })).toMatchObject({ source: 'a.js', line: 5 });
    expect(JSON.stringify(d.entries())).not.toMatch(/room1|https?:/);
  });
});
