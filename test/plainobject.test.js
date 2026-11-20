import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { isPlainObject } from '../src/plainobject.js';

describe('isPlainObject', () => {
  it('accepts object literals, including empty ones', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1, b: { c: 2 } })).toBe(true);
  });

  it('accepts null-prototype objects, class instances and objects from another realm', () => {
    expect(isPlainObject(Object.create(null))).toBe(true);
    class Thing {}
    expect(isPlainObject(new Thing())).toBe(true);
    expect(isPlainObject(vm.runInNewContext('({ a: 1 })'))).toBe(true);
  });

  it('rejects null and undefined', () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });

  it('rejects arrays, including ones from another realm', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2])).toBe(false);
    expect(isPlainObject(vm.runInNewContext('[1]'))).toBe(false);
  });

  it('rejects every primitive', () => {
    for (const v of ['', 'x', 0, 1, NaN, true, false, Symbol('s'), 10n]) {
      expect(isPlainObject(v)).toBe(false);
    }
  });

  it('rejects functions', () => {
    expect(isPlainObject(() => {})).toBe(false);
    expect(isPlainObject(function () {})).toBe(false);
  });
});
