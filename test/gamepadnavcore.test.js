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
    // Gap rule (changed from centre offset): the penalty is the empty space between the
    // two rows' y-intervals, so the offset control sits a full row lower (gap 80, not 60).
    const c = [
      { id: 'offset', rect: r(160, 200) }, // dx 60, y-gap 80 -> big penalty
      { id: 'aligned', rect: r(300, 100) }, // dx 200, gap 0
    ];
    expect(pickNext(from, c, 'right')).toBe('aligned');
  });
  it('a wide row under a narrow button is reachable by Down (x-intervals overlap, gap 0)', () => {
    const narrow = r(300, 100, 40, 20);
    const c = [
      { id: 'wide', rect: r(0, 140, 400, 20) }, // centre 200 is 120 left of the narrow button's centre
      { id: 'near', rect: r(340, 260, 40, 20) }, // a small button further down, nearly aligned
    ];
    expect(pickNext(narrow, c, 'down')).toBe('wide');
    // and Up from the wide row's left end still finds the narrow one above it
    expect(pickNext(r(0, 140, 400, 20), [{ id: 'narrow', rect: narrow }], 'up')).toBe('narrow');
  });
  it('a candidate that overlaps on the cross axis ties deterministically: the earlier one wins', () => {
    const c = [{ id: 'a', rect: r(100, 160) }, { id: 'b', rect: r(100, 160) }];
    expect(pickNext(from, c, 'down')).toBe('a');
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

// T14: Sound & controls is a stack of full-width rows under a narrow Back button; Down must visit every
// row in order and never skip a switch (the owner's hand-check gap 2). Rects mimic the sheet at 1080p.
describe('a settings-like stack of wide rows', () => {
  const rows = [
    { id: 'back', rect: { x: 40, y: 20, w: 160, h: 64 } },
    { id: 'volume', rect: { x: 40, y: 120, w: 1100, h: 72 } },
    { id: 'music', rect: { x: 40, y: 200, w: 1100, h: 72 } },
    { id: 'mute', rect: { x: 40, y: 280, w: 1100, h: 64 } },
    { id: 'haptics', rect: { x: 40, y: 352, w: 1100, h: 64 } },
    { id: 'tips', rect: { x: 40, y: 424, w: 1100, h: 64 } },
    { id: 'map', rect: { x: 40, y: 496, w: 1100, h: 72 } },
    { id: 'explore', rect: { x: 40, y: 580, w: 520, h: 72 } },
  ];
  it('Down from Back walks every row in order, and Up walks them back', () => {
    const seen = ['back'];
    for (let cur = 'back'; ;) {
      const next = pickNext(rows.find((r) => r.id === cur).rect, rows.filter((r) => r.id !== cur), 'down');
      if (!next) break;
      seen.push(next);
      cur = next;
    }
    expect(seen).toEqual(rows.map((r) => r.id));
    const up = ['explore'];
    for (let cur = 'explore'; ;) {
      const next = pickNext(rows.find((r) => r.id === cur).rect, rows.filter((r) => r.id !== cur), 'up');
      if (!next) break;
      up.push(next);
      cur = next;
    }
    expect(up).toEqual([...rows].reverse().map((r) => r.id));
  });
});
