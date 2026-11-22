import { describe, it, expect } from 'vitest';
import { pickNext, nearestTo, repeatGate } from '../src/gamepadnavcore.js';

const r = (x, y, w = 40, h = 20) => ({ x, y, w, h });

describe('pickNext', () => {
  const from = r(100, 100);
  it('picks the nearest candidate to the right and ignores ones on the left', () => {
    const c = [
      { id: 'left', rect: r(40, 100) },
      { id: 'far', rect: r(300, 100) },
      { id: 'near', rect: r(180, 100) },
    ];
    expect(pickNext(from, c, 'right')).toBe('near');
    expect(pickNext(from, c, 'left')).toBe('left');
  });
  it('works for up and down', () => {
    const c = [
      { id: 'up', rect: r(100, 40) },
      { id: 'down', rect: r(100, 180) },
    ];
    expect(pickNext(from, c, 'up')).toBe('up');
    expect(pickNext(from, c, 'down')).toBe('down');
  });
  it('off-axis penalty: a far aligned control beats a near but offset one', () => {
    const c = [
      { id: 'offset', rect: r(160, 160) }, // dx 60, off 60 -> big penalty
      { id: 'aligned', rect: r(300, 100) }, // dx 200, off 0
    ];
    expect(pickNext(from, c, 'right')).toBe('aligned');
  });
  it('returns null at an edge (no wrap)', () => {
    const c = [{ id: 'left', rect: r(0, 100) }];
    expect(pickNext(from, c, 'right')).toBeNull();
    expect(pickNext(from, [], 'up')).toBeNull();
  });
  it('ignores a candidate sharing the same centre', () => {
    expect(pickNext(from, [{ id: 'same', rect: r(100, 100) }], 'right')).toBeNull();
  });
});

describe('nearestTo', () => {
  it('picks by centre distance', () => {
    const c = [
      { id: 'a', rect: r(0, 0) },
      { id: 'b', rect: r(200, 200) },
    ];
    expect(nearestTo({ x: 190, y: 190 }, c)).toBe('b');
    expect(nearestTo({ x: 10, y: 5 }, c)).toBe('a');
    expect(nearestTo({ x: 0, y: 0 }, [])).toBeNull();
  });
});

describe('repeatGate', () => {
  it('fires at once, waits first ms, then every ms, and resets on release', () => {
    let s;
    let g = repeatGate(s, 1000, true);
    expect(g.fire).toBe(true);
    s = g.state;
    g = repeatGate(s, 1300, true);
    expect(g.fire).toBe(false);
    s = g.state;
    g = repeatGate(s, 1400, true);
    expect(g.fire).toBe(true);
    s = g.state;
    g = repeatGate(s, 1500, true);
    expect(g.fire).toBe(false);
    s = g.state;
    g = repeatGate(s, 1540, true);
    expect(g.fire).toBe(true);
    s = g.state;
    g = repeatGate(s, 1600, false);
    expect(g.fire).toBe(false);
    s = g.state;
    g = repeatGate(s, 1610, true);
    expect(g.fire).toBe(true);
  });
  it('honours custom timings', () => {
    let g = repeatGate(undefined, 0, true, { first: 100, every: 50 });
    expect(g.fire).toBe(true);
    g = repeatGate(g.state, 100, true, { first: 100, every: 50 });
    expect(g.fire).toBe(true);
    g = repeatGate(g.state, 140, true, { first: 100, every: 50 });
    expect(g.fire).toBe(false);
  });
});
