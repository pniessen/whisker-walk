import { describe, it, expect, vi } from 'vitest';
import { createEmitter } from '../src/events.js';

describe('createEmitter', () => {
  it('delivers payloads to subscribers', () => {
    const bus = createEmitter();
    const fn = vi.fn();
    bus.on('ping', fn);
    bus.emit('ping', { a: 1 });
    expect(fn).toHaveBeenCalledWith({ a: 1 });
  });

  it('supports multiple subscribers on one event', () => {
    const bus = createEmitter();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('x', a);
    bus.on('x', b);
    bus.emit('x');
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('returns an unsubscribe function', () => {
    const bus = createEmitter();
    const fn = vi.fn();
    const off = bus.on('x', fn);
    off();
    bus.emit('x');
    expect(fn).not.toHaveBeenCalled();
  });

  it('is safe to emit events nobody listens to', () => {
    const bus = createEmitter();
    expect(() => bus.emit('nobody-home', 42)).not.toThrow();
  });
});
