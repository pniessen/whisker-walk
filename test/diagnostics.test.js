import { describe, it, expect } from 'vitest';
import {
  createDiagnostics, describeError, listenForErrors, DIAG_CAPACITY, DIAG_MESSAGE_MAX,
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
    d.note('frame', new Error('same'));
    d.note('save', 'quota');
    d.note('frame', new Error('same'));
    d.note('frame', new Error('same'));
    const list = d.entries();
    expect(list.map((e) => [e.kind, e.message, e.count])).toEqual([
      ['save', 'quota', 1],
      ['frame', 'Error: same', 3],
    ]);
    expect(list[1].time).toBe(103);
    expect(d.total).toBe(4);
    // a different kind, or a different line, is a different entry
    d.note('error', new Error('same'));
    d.note('frame', new Error('same'), { source: 'a.js', line: 2 });
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
