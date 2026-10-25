import { describe, it, expect } from 'vitest';
import { RAIN_GRIP, MOVED_MIN, createMouth, pick, drop, tickRain, walkEndMarks, carryLabel } from '../src/carry.js';
import { CARRY_KINDS, propsFor } from '../src/propsets.js';
import { sanitizeMarks } from '../src/marks.js';

const stick = { id: 'park-stick-1', kind: 'stick' };
const sock = { id: 'park-sock-1', kind: 'sock' };
const ORIGIN = { x: 0, z: 0 };

describe('carry rules', () => {
  it('one thing at a time', () => {
    const m = createMouth();
    expect(m.held).toBe(null);
    expect(pick(m, stick)).toBe(true);
    expect(m.held).toEqual({ id: stick.id, kind: 'stick' });
    expect(pick(m, sock)).toBe(false);
    expect(m.held.id).toBe(stick.id);
    expect(drop(m, 1, 2, ORIGIN)).toEqual({ id: stick.id, kind: 'stick' });
    expect(m.held).toBe(null);
    expect(drop(m, 1, 2, ORIGIN)).toBe(null);
    expect(pick(m, sock)).toBe(true);
  });

  it('rain grip: slips once after RAIN_GRIP seconds of rain, not in dry weather', () => {
    const m = createMouth();
    expect(tickRain(m, 100, true)).toBe(false); // nothing held
    expect(m.grip).toBe(0);
    pick(m, stick);
    for (let i = 0; i < 100; i++) expect(tickRain(m, 1, false)).toBe(false);
    expect(m.grip).toBe(0);
    let slips = 0;
    for (let t = 0; t < RAIN_GRIP * 4; t += 0.5) if (tickRain(m, 0.5, true)) slips++;
    expect(slips).toBe(1);
  });

  it('slips at exactly RAIN_GRIP seconds', () => {
    const m = createMouth();
    pick(m, stick);
    expect(tickRain(m, RAIN_GRIP - 0.01, true)).toBe(false);
    expect(tickRain(m, 0.01, true)).toBe(true);
  });

  it('a pause in the rain does not reset the grip, a drop does', () => {
    const m = createMouth();
    pick(m, stick);
    tickRain(m, RAIN_GRIP - 1, true);
    tickRain(m, 30, false);
    expect(m.grip).toBeCloseTo(RAIN_GRIP - 1);
    expect(tickRain(m, 1, true)).toBe(true);
    drop(m, 0, 0, ORIGIN);
    expect(m.grip).toBe(0);
    pick(m, stick);
    expect(m.grip).toBe(0);
    tickRain(m, 2, true);
    expect(m.grip).toBe(2);
    pick(m, sock); // refused: still holding, grip untouched
    expect(m.grip).toBe(2);
    drop(m, 0, 0, ORIGIN);
    pick(m, sock);
    expect(m.grip).toBe(0);
  });

  it('walk end: a held item goes to the den; a moved drop leaves a mark; an unmoved one does not', () => {
    const m = createMouth();
    pick(m, stick);
    drop(m, 10, 10, { x: 10 + MOVED_MIN, z: 10 }); // exactly MOVED_MIN away
    pick(m, sock);
    drop(m, 5, 5, { x: 5.5, z: 5 }); // barely moved
    pick(m, { id: 'park-acorn-1', kind: 'acorn' });
    const out = walkEndMarks(m, 'park', 1234);
    expect(out).toHaveLength(2);
    const den = out.find((o) => o.area === 'den');
    expect(den.mark).toMatchObject({ kind: 'den', id: 'park-acorn-1', item: 'acorn', x: 0, z: 0, at: 1234, contested: false });
    const dr = out.find((o) => o.area === 'park');
    expect(dr.mark).toMatchObject({ kind: 'drop', id: stick.id, item: 'stick', x: 10, z: 10, at: 1234, contested: false });
  });

  it('walk-end marks are accepted by the save sanitizer', () => {
    const p = propsFor('park').carryables;
    const m = createMouth();
    pick(m, p[0]);
    drop(m, p[0].x + 5, p[0].z, { x: p[0].x, z: p[0].z });
    pick(m, p[1]);
    const marks = { park: [], den: [] };
    for (const { area, mark } of walkEndMarks(m, 'park', 99)) marks[area].push(mark);
    const clean = sanitizeMarks(marks);
    expect(clean.park).toHaveLength(1);
    expect(clean.den).toHaveLength(1);
    expect(CARRY_KINDS).toContain(clean.den[0].item);
  });

  it('walk end with nothing held and nothing dropped writes nothing', () => {
    expect(walkEndMarks(createMouth(), 'park', 1)).toEqual([]);
  });

  it('picking an item back up removes its pending drop mark', () => {
    const m = createMouth();
    pick(m, stick);
    drop(m, 20, 0, ORIGIN);
    expect(m.dropped.has(stick.id)).toBe(true);
    pick(m, stick);
    expect(m.dropped.has(stick.id)).toBe(false);
    drop(m, 0.2, 0, ORIGIN);
    expect(walkEndMarks(m, 'park', 1)).toEqual([]);
  });
});

describe('carryLabel', () => {
  it('names every carry kind in plain English', () => {
    expect(CARRY_KINDS.map(carryLabel)).toEqual([
      'sock', 'toy mouse', 'leaf', 'stick', 'pine cone', 'acorn',
      'shell', 'bit of driftwood', 'bottle cap', 'bit of rope', 'glove', 'ribbon',
    ]);
  });

  it('anything else is a "thing", never a throw', () => {
    for (const k of ['rock', '', '__proto__', 'constructor', 'toString', null, undefined, 7, {}]) {
      expect(carryLabel(k)).toBe('thing');
    }
  });
});
