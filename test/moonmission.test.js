// The Moon, milestone 2: the mission's pure step machine (world/moonmission.js). Chapter 1, "Power": wake Pip, two power cells in either
// order, the Core wakes the base. The property tests: any order of events from any start, there is always a next goal, no stuck state, a
// step never goes back, a carried cell is never in the save, a step done by anyone in the room counts the same, and hostile input is
// ignored.
import { describe, it, expect } from 'vitest';
import { normalize, apply, credit, nextGoal, boardMarks, pipAwake, baseAwake, cellIn, STEP } from '../src/world/moonmission.js';
import { mulberry32 } from '../src/rng.js';
import { sanitizeSave } from '../src/progression.js';

const states = [];
for (let step = 0; step <= 9; step++) for (let cells = 0; cells <= 7; cells++) states.push({ step, cells });

describe('normalize', () => {
  it('is idempotent over every step and cell value, never lowers anything and keeps both inside their range', () => {
    for (const s of states) {
      const n = normalize(s);
      expect(normalize(n), JSON.stringify(s)).toEqual(n);
      expect(n.step).toBeGreaterThanOrEqual(s.step);
      expect(n.cells & ~7).toBe(0);
      expect(n.cells & s.cells).toBe(s.cells); // a bit already there stays (the Deep Cell's is chapter 4's)
      expect(n.step).toBeLessThanOrEqual(9);
    }
  });
  it('repairs what a merge, an old build or a hostile save leaves: a cell in the Core means Pip is awake; both cells in means the beat is due; step 4 means both cells in', () => {
    expect(normalize({ step: 0, cells: 1 })).toEqual({ step: STEP.one, cells: 1 });
    expect(normalize({ step: 0, cells: 3 })).toEqual({ step: STEP.both, cells: 3 });
    expect(normalize({ step: 1, cells: 2 })).toEqual({ step: STEP.one, cells: 2 });
    expect(normalize({ step: 4, cells: 0 })).toEqual({ step: 4, cells: 3 });
    expect(normalize({ step: 7, cells: 0 })).toEqual({ step: 7, cells: 3 }); // a later chapter's step is kept
    expect(normalize({ step: 1, cells: 4 })).toEqual({ step: 1, cells: 4 }); // the Deep Cell's bit alone is no cell of this chapter
  });
  it('turns garbage into the start', () => {
    for (const bad of [undefined, null, 5, 'x', [], { step: NaN, cells: -1 }, { step: 'a', cells: {} }, { step: 1.5, cells: 2.5 }, { step: Infinity, cells: Infinity }, { step: -3, cells: -3 }]) {
      const n = normalize(bad);
      expect(Number.isInteger(n.step) && n.step >= 0 && n.step <= 9, JSON.stringify(bad)).toBe(true);
      expect(Number.isInteger(n.cells) && n.cells >= 0 && n.cells <= 7, JSON.stringify(bad)).toBe(true);
    }
    expect(normalize(undefined)).toEqual({ step: 0, cells: 0 });
  });
});

describe('apply', () => {
  const fresh = { step: 0, cells: 0 };
  it('Pip wakes once; a later wake changes nothing', () => {
    const a = apply(fresh, { kind: 'wake' });
    expect(a.moon).toMatchObject({ step: 1, cells: 0 });
    expect(a.effect).toBe('wake');
    expect(apply(a.moon, { kind: 'wake' }).changed).toBe(false);
  });
  it('a cell cannot go in before Pip is awake (the story starts with him)', () => {
    const r = apply(fresh, { kind: 'plug', cell: 0 });
    expect(r.changed).toBe(false);
    expect(r.moon).toMatchObject({ step: 0, cells: 0 });
  });
  it('the cells go in in either order; the second one is "both" (step 3) and the beat makes it 4', () => {
    for (const order of [[0, 1], [1, 0]]) {
      let m = apply(fresh, { kind: 'wake' }).moon;
      const r1 = apply(m, { kind: 'plug', cell: order[0] });
      expect(r1.effect).toBe('plug');
      expect(r1.moon.step).toBe(STEP.one);
      const r2 = apply(r1.moon, { kind: 'plug', cell: order[1] });
      expect(r2.effect).toBe('both');
      expect(r2.moon).toMatchObject({ step: STEP.both, cells: 3 });
      const r3 = apply(r2.moon, { kind: 'beat' });
      expect(r3.effect).toBe('awake');
      expect(r3.moon).toMatchObject({ step: STEP.awake, cells: 3 });
      expect(baseAwake(r3.moon)).toBe(true);
    }
  });
  it('a cell plugged twice is one cell; the beat before both cells are in does nothing', () => {
    let m = apply(fresh, { kind: 'wake' }).moon;
    m = apply(m, { kind: 'plug', cell: 1 }).moon;
    expect(apply(m, { kind: 'plug', cell: 1 }).changed).toBe(false);
    expect(apply(m, { kind: 'beat' }).changed).toBe(false);
  });
  it('keeps the Deep Cell\'s bit (chapter 4) through every plug and the wake', () => {
    let m = { step: 1, cells: 4 };
    m = apply(m, { kind: 'plug', cell: 0 }).moon;
    m = apply(m, { kind: 'plug', cell: 1 }).moon;
    m = apply(m, { kind: 'beat' }).moon;
    expect(m).toMatchObject({ step: 4, cells: 7 });
  });
  it('keeps the other keys of the save record and never mutates its input', () => {
    const rec = Object.freeze({ step: 1, cells: 0, stamp: 2, scope: 5, jump: Object.freeze({ a: 3 }) });
    const r = apply(rec, { kind: 'plug', cell: 0 });
    expect(r.moon).toMatchObject({ step: 2, cells: 1, stamp: 2, scope: 5, jump: { a: 3 } });
    expect(rec.step).toBe(1);
  });
  it('ignores a hostile or unknown event', () => {
    for (const ev of [null, undefined, 3, 'wake', {}, { kind: 'plug' }, { kind: 'plug', cell: 2 }, { kind: 'plug', cell: -1 }, { kind: 'plug', cell: '0' }, { kind: 'plug', cell: 1e9 }, { kind: '__proto__' }, { kind: 'constructor', cell: 0 }, { kind: 'launch' }]) {
      expect(apply({ step: 1, cells: 0 }, ev).changed, JSON.stringify(ev)).toBe(false);
    }
  });
});

describe('the goal (what the gold ring points at)', () => {
  it('Pip first, then a cell (the Ridge cell first), the Core when she carries one, and done', () => {
    expect(nextGoal({ step: 0, cells: 0 })).toEqual({ kind: 'pip' });
    expect(nextGoal({ step: 1, cells: 0 })).toEqual({ kind: 'cell', cell: 0 });
    expect(nextGoal({ step: 1, cells: 0 }, 1)).toEqual({ kind: 'core', cell: 1 });
    expect(nextGoal({ step: 2, cells: 1 })).toEqual({ kind: 'cell', cell: 1 });
    expect(nextGoal({ step: 2, cells: 2 })).toEqual({ kind: 'cell', cell: 0 });
    expect(nextGoal({ step: 3, cells: 3 })).toEqual({ kind: 'done' });
    expect(nextGoal({ step: 4, cells: 3 })).toEqual({ kind: 'done' });
  });
  it('a cell she carries that is already in the Core is not a goal (someone else plugged it)', () => {
    expect(nextGoal({ step: 2, cells: 1 }, 0)).toEqual({ kind: 'cell', cell: 1 });
  });
  it('the board shows four pictures: Pip, the Ridge cell, the Rover cell, the base', () => {
    expect(boardMarks({ step: 0, cells: 0 })).toEqual([false, false, false, false]);
    expect(boardMarks({ step: 2, cells: 2 })).toEqual([true, false, true, false]);
    expect(boardMarks({ step: 4, cells: 3 })).toEqual([true, true, true, true]);
  });
});

describe('PROPERTY: any order of events from any start', () => {
  const events = [{ kind: 'wake' }, { kind: 'plug', cell: 0 }, { kind: 'plug', cell: 1 }, { kind: 'beat' }, { kind: 'plug', cell: 2 }, { kind: 'x' }, null];
  it('a step never goes back, the record stays well-formed and the next goal always exists', () => {
    const rng = mulberry32(0x6d32);
    for (let run = 0; run < 400; run++) {
      let m = rng() < 0.5 ? states[Math.floor(rng() * states.length)] : { step: 0, cells: 0 };
      let prev = normalize(m);
      for (let i = 0; i < 12; i++) {
        const ev = events[Math.floor(rng() * events.length)];
        const r = (rng() < 0.3 ? credit : apply)(m, ev);
        m = r.moon;
        const n = normalize(m);
        expect(n, `run ${run} step ${i}`).toEqual({ step: m.step, cells: m.cells });
        expect(n.step).toBeGreaterThanOrEqual(prev.step);
        expect(n.cells & prev.cells).toBe(prev.cells); // a cell never comes out
        expect(nextGoal(m, rng() < 0.3 ? 0 : rng() < 0.5 ? 1 : null)).toBeTruthy();
        prev = n;
      }
    }
  });
  it('NO STUCK STATE: from every start, a player who just follows the goal reaches the awake base in a handful of steps, carrying or not', () => {
    for (const s of states) {
      for (const carry of [null, 0, 1]) {
        let m = normalize(s);
        let carrying = carry;
        let steps = 0;
        while (!baseAwake(m) && steps++ < 9) {
          const g = nextGoal(m, carrying);
          if (g.kind === 'pip') m = apply(m, { kind: 'wake' }).moon;
          else if (g.kind === 'cell') carrying = g.cell; // she picks it up
          else if (g.kind === 'core') { m = apply(m, { kind: 'plug', cell: g.cell }).moon; carrying = null; }
          else m = apply(m, { kind: 'beat' }).moon;
        }
        expect(baseAwake(m), `${JSON.stringify(s)} carrying ${carry}`).toBe(true);
        expect(steps).toBeLessThanOrEqual(8);
      }
    }
  });
  it('a carried cell is never in the record (the next walk finds it at its own spot): the saved fields are step and cells only', () => {
    const r = apply({ step: 1, cells: 0 }, { kind: 'plug', cell: 0 });
    expect(Object.keys(r.moon).sort()).toEqual(['cells', 'step']); // (nothing about a carried cell)
    expect(cellIn(r.moon, 0)).toBe(true);
    expect(cellIn(r.moon, 1)).toBe(false);
  });
});

describe('credit (a step done by anyone in the room counts on every device)', () => {
  it('a partner\'s wake and plugs land the same as her own, and a device that already has them changes nothing', () => {
    let m = { step: 0, cells: 0 };
    m = credit(m, { kind: 'wake' }).moon;
    expect(pipAwake(m)).toBe(true);
    m = credit(m, { kind: 'plug', cell: 1 }).moon;
    expect(m.cells).toBe(2);
    expect(credit(m, { kind: 'plug', cell: 1 }).changed).toBe(false);
    expect(credit(m, { kind: 'plug', cell: 0 }).effect).toBe('both');
  });
  it('a hostile event (an unknown kind, a cell that is not 0 or 1, a prototype key) is ignored; a "beat" cannot come from the wire', () => {
    for (const ev of [null, {}, { kind: 5 }, { kind: 'beat' }, { kind: 'plug', cell: 3 }, { kind: 'plug', cell: '1' }, { kind: '__proto__', cell: 0 }, JSON.parse('{"kind":"plug","cell":0,"__proto__":{"kind":"wake"}}').kind === 'plug' ? { kind: 'plug', cell: 9 } : null]) {
      expect(credit({ step: 1, cells: 0 }, ev).changed, JSON.stringify(ev)).toBe(false);
    }
  });
});

describe('the saved fields (state.moon, sanitised by progression.js, repaired by normalize)', () => {
  it('a hostile save cannot set a step over 9 or a cell bit that does not exist, and whatever survives is a state the machine has a next goal for', () => {
    for (const bad of [{ step: 99, cells: 99 }, { step: -5, cells: -5 }, { step: 1e12, cells: 1e12 }, { step: '4', cells: '3' }, { step: 2.5, cells: 1.5 }, { step: null, cells: null }, { step: {}, cells: [] }]) {
      const moon = sanitizeSave({ version: 4, moon: bad }).moon;
      expect(moon.step).toBeGreaterThanOrEqual(0);
      expect(moon.step).toBeLessThanOrEqual(9);
      expect(moon.cells).toBeGreaterThanOrEqual(0);
      expect(moon.cells).toBeLessThanOrEqual(7);
      expect(nextGoal(moon)).toBeTruthy();
      expect(normalize(moon).step).toBeLessThanOrEqual(9);
    }
  });
  it('a good record round trips through the sanitiser and the machine unchanged', () => {
    for (const rec of [{ step: 0, cells: 0 }, { step: 1, cells: 0 }, { step: 2, cells: 2 }, { step: 3, cells: 3 }, { step: 4, cells: 3 }, { step: 4, cells: 7 }]) {
      const moon = sanitizeSave({ version: 4, moon: { ...rec, stamp: -1, scope: 0, jump: {} } }).moon;
      expect(moon).toMatchObject(rec);
      expect(normalize(moon)).toEqual(rec);
    }
  });
});
