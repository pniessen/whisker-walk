import { describe, it, expect } from 'vitest';
import { canvasDocument, stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';

describe('canvasDocument', () => {
  const ctx = (opts) => canvasDocument(opts).createElement('canvas').getContext('2d');

  it('answers getImageData with a zeroed buffer of the asked size', () => {
    const { data } = ctx().getImageData(0, 0, 2, 3);
    expect(data).toBeInstanceOf(Uint8ClampedArray);
    expect(data).toHaveLength(24);
    expect([...data].every((b) => b === 0)).toBe(true);
  });

  it('gives gradients an addColorStop that can be called', () => {
    expect(() => ctx().createLinearGradient(0, 0, 1, 1).addColorStop(0, '#fff')).not.toThrow();
    expect(() => ctx().createRadialGradient(0, 0, 1, 0, 0, 2).addColorStop(1, '#000')).not.toThrow();
  });

  it('starts a canvas at 0 by 0 and accepts property writes on the context', () => {
    const canvas = canvasDocument().createElement('canvas');
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    const c = canvas.getContext('2d');
    c.fillStyle = 'red';
    expect(typeof c.fillRect).toBe('function');
    expect(c.fillRect(0, 0, 1, 1)).toBeUndefined();
  });

  it('measures text only when asked to', () => {
    expect(ctx({ measureText: 10 }).measureText('x')).toEqual({ width: 10 });
    expect(ctx({ measureText: 0 }).measureText('x')).toEqual({ width: 0 });
    expect(ctx().measureText('x')).toBeUndefined();
  });

  it('has the pointer-lock members only with pointerLock: true', () => {
    const plain = canvasDocument();
    expect(plain.addEventListener).toBeUndefined();
    expect(plain.exitPointerLock).toBeUndefined();
    expect('pointerLockElement' in plain).toBe(false);
    const locked = canvasDocument({ pointerLock: true });
    expect(locked.pointerLockElement).toBeNull();
    expect(typeof locked.addEventListener).toBe('function');
    expect(typeof locked.exitPointerLock).toBe('function');
  });

  it('returns a fresh document each call', () => {
    expect(canvasDocument()).not.toBe(canvasDocument());
  });
});

describe('stubCanvasDocument', () => {
  it('installs the stub as the global document and returns it', () => {
    const stub = stubCanvasDocument({ measureText: 10 });
    expect(globalThis.document).toBe(stub);
    expect(document.createElement('canvas').getContext('2d').measureText('a')).toEqual({ width: 10 });
  });
});

describe('memoryStorage', () => {
  it('reads back what it was seeded with, and null for a missing key', () => {
    const s = memoryStorage({ a: '1' });
    expect(s.getItem('a')).toBe('1');
    expect(s.getItem('nope')).toBeNull();
  });

  it('starts empty with no seed, and stores values as strings', () => {
    const s = memoryStorage();
    expect(s.getItem('n')).toBeNull();
    s.setItem('n', 3);
    expect(s.getItem('n')).toBe('3');
  });

  it('has no removeItem unless asked, and then removes the key', () => {
    expect(memoryStorage().removeItem).toBeUndefined();
    const s = memoryStorage({ a: '1' }, { removeItem: true });
    s.removeItem('a');
    expect(s.getItem('a')).toBeNull();
  });

  it('exposes the Map it writes to under the asked name, and only then', () => {
    const s = memoryStorage({}, { expose: 'map' });
    s.setItem('k', 'v');
    expect(s.map).toBeInstanceOf(Map);
    expect(s.map.get('k')).toBe('v');
    expect(memoryStorage({}, { expose: 'm' }).m).toBeInstanceOf(Map);
    expect(memoryStorage().map).toBeUndefined();
  });
});
