import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tvState, padText, setTv, onTv, resetTv } from '../src/tvseam.js';

beforeEach(() => resetTv());

describe('the TV seam (start-up side)', () => {
  it('starts off, with the keyboard as the last input', () => {
    expect(tvState.on).toBe(false);
    expect(tvState.input).toBe('keys');
  });

  it('padText is the identity until the chunk replaces it', () => {
    expect(padText('Press Space')).toBe('Press Space');
    expect(padText('')).toBe('');
  });

  it('setTv fires the listeners once per real change', () => {
    const fn = vi.fn();
    onTv(fn);
    setTv({ on: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(tvState.on).toBe(true);
    setTv({ on: true });
    expect(fn).toHaveBeenCalledTimes(1);
    setTv({ input: 'pad' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not throw with no listeners, and a listener can be removed', () => {
    expect(() => setTv({ on: true })).not.toThrow();
    const fn = vi.fn();
    const off = onTv(fn);
    off();
    setTv({ on: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it('a throwing listener does not stop the others', () => {
    const ok = vi.fn();
    onTv(() => { throw new Error('boom'); });
    onTv(ok);
    expect(() => setTv({ on: true })).not.toThrow();
    expect(ok).toHaveBeenCalled();
  });

  it('padText follows a replacement set on the state', () => {
    setTv({ text: (s) => s.toUpperCase() });
    expect(padText('a')).toBe('A');
  });
});
