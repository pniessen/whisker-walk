import { test, expect } from 'vitest';
import {
  MARK_KINDS, MARKS_PER_AREA, MARK_AREAS,
  emptyMarks, sanitizeMarks, markKey, addMark, contestMark, markOpacity,
} from '../src/marks.js';
import { isPropId } from '../src/propsets.js';

const scratch = (at, id = 'park-post-1', extra = {}) => ({ kind: 'scratch', id, x: 1, z: 2, at, contested: false, item: null, ...extra });
const drop = (at, id = 'park-stick-1', item = 'stick') => ({ kind: 'drop', id, x: 3, z: 4, at, contested: false, item });
const dig = (at, x, z) => ({ kind: 'dig', id: null, x, z, at, contested: false, item: null });
const border = (at, id = 'park-border-3') => ({ kind: 'border', id, x: 5, z: 6, at, contested: false, item: null });

test('the vocabulary is pinned', () => {
  expect(MARK_KINDS).toEqual(['scratch', 'dig', 'drop', 'border', 'den']);
  expect(MARKS_PER_AREA).toBe(8);
  expect(MARK_AREAS).toEqual(['neighborhood', 'park', 'seaside', 'docks', 'den']);
});

test('every border-mark id the rings can mint is a prop id, even the longest area name', () => {
  for (const a of MARK_AREAS) for (const n of [0, 1, 11]) expect(isPropId(`${a}-border-${n}`), `${a}-border-${n}`).toBe(true);
});

test('a ninth mark pushes out the oldest, and only the oldest', () => {
  let m = emptyMarks();
  for (let i = 1; i <= 8; i++) m = addMark(m, 'park', drop(i * 100, `park-stick-${i}`)).marks;
  expect(m.park).toHaveLength(8);
  const r = addMark(m, 'park', drop(900, 'park-stick-9'));
  expect(r.changed).toBe(true);
  expect(r.marks.park).toHaveLength(8);
  expect(r.marks.park.map((x) => x.at)).toEqual([200, 300, 400, 500, 600, 700, 800, 900]);
  expect(m.park).toHaveLength(8);           // pure: the input is untouched
  expect(m.park[0].at).toBe(100);
  expect(r.marks.seaside).toEqual([]);      // other areas untouched
});

test('re-marking a scratch refreshes it and clears contested', () => {
  let m = addMark(emptyMarks(), 'park', scratch(100)).marks;
  m = contestMark(m, 'park', markKey(m.park[0])).marks;
  expect(m.park[0].contested).toBe(true);
  const r = addMark(m, 'park', scratch(500, 'park-post-1', { x: 9 }));
  expect(r.changed).toBe(true);
  expect(r.marks.park).toHaveLength(1);
  expect(r.marks.park[0]).toMatchObject({ at: 500, contested: false, x: 9 });
  // a border mark re-marks the same way
  let b = addMark(emptyMarks(), 'docks', border(10, 'docks-border-2')).marks;
  b = addMark(b, 'docks', border(20, 'docks-border-2')).marks;
  expect(b.docks).toHaveLength(1);
  expect(b.docks[0].at).toBe(20);
});

test('drops of the same stick are separate marks (keyed with at)', () => {
  let m = addMark(emptyMarks(), 'den', { ...drop(100), kind: 'den' }).marks;
  m = addMark(m, 'den', { ...drop(200), kind: 'den' }).marks;
  expect(m.den).toHaveLength(2);
  expect(markKey(drop(100))).toBe('drop:park-stick-1:100');
  expect(markKey(scratch(1))).toBe('scratch:park-post-1');
  expect(markKey(border(1))).toBe('border:park-border-3');
});

test('dig marks key by rounded spot; two digs a metre apart are two marks', () => {
  expect(markKey(dig(1, 3.4, -7.6))).toBe('dig:3,-8');
  let m = addMark(emptyMarks(), 'park', dig(1, 10, 10)).marks;
  m = addMark(m, 'park', dig(2, 11, 10)).marks;
  expect(m.park).toHaveLength(2);
  // the same spot twice is one mark: the key is unique within an area, in memory as after a reload
  m = addMark(m, 'park', dig(3, 10.2, 9.9)).marks;
  expect(m.park).toHaveLength(2);
  expect(sanitizeMarks(JSON.parse(JSON.stringify(m)))).toEqual(m);
});

test('contesting never removes a mark, and border/den marks cannot be contested', () => {
  let m = emptyMarks();
  m = addMark(m, 'park', scratch(1)).marks;
  m = addMark(m, 'park', dig(2, 4, 4)).marks;
  m = addMark(m, 'park', drop(3)).marks;
  m = addMark(m, 'park', border(4)).marks;
  m = addMark(m, 'park', { ...drop(5, 'park-stick-2'), kind: 'den' }).marks;
  const before = m.park.length;
  for (const mk of m.park) {
    const r = contestMark(m, 'park', markKey(mk));
    expect(r.marks.park).toHaveLength(before);
    expect(r.changed).toBe(mk.kind !== 'border' && mk.kind !== 'den');
    if (!r.changed) expect(r.marks.park.find((x) => markKey(x) === markKey(mk)).contested).toBe(false);
  }
  const once = contestMark(m, 'park', 'scratch:park-post-1');
  expect(once.marks.park.find((x) => x.kind === 'scratch').contested).toBe(true);
  expect(m.park.find((x) => x.kind === 'scratch').contested).toBe(false); // pure
  expect(contestMark(once.marks, 'park', 'scratch:park-post-1').changed).toBe(false); // already contested
  expect(contestMark(m, 'park', 'scratch:nope-post-9').changed).toBe(false);
  expect(contestMark(m, 'moon', 'scratch:park-post-1').changed).toBe(false);
});

test('addMark refuses a bad area or a bad mark and changes nothing', () => {
  const m = emptyMarks();
  for (const area of ['moon', '__proto__', 7, null]) expect(addMark(m, area, scratch(1)).changed).toBe(false);
  for (const bad of [null, 7, {}, scratch(1, 'park-Bad-1'), { ...scratch(1), kind: 'nap' }, { ...drop(1), item: 'brick' }]) {
    const r = addMark(m, 'park', bad);
    expect(r.changed).toBe(false);
    expect(r.marks).toEqual(emptyMarks());
  }
});

test('markOpacity: six full, then fading', () => {
  expect([0, 1, 2, 3, 4, 5].map(markOpacity)).toEqual([1, 1, 1, 1, 1, 1]);
  expect(markOpacity(6)).toBeLessThan(1);
  expect(markOpacity(7)).toBeLessThan(markOpacity(6));
  expect(markOpacity(6)).toBe(0.55);
  expect(markOpacity(7)).toBe(0.3);
});

test('sanitizeMarks survives garbage', () => {
  for (const v of [null, undefined, 7, 'x', [], true, { __proto__: { neighborhood: [] } }, { park: 'x' }, { park: { 0: scratch(1) } }, { moon: [] }]) {
    expect(sanitizeMarks(v)).toEqual(emptyMarks());
  }
  const hostile = JSON.parse('{"__proto__":{"polluted":1},"park":[{"kind":"scratch","id":"park-post-1","x":1,"z":1,"at":5,"__proto__":{"x":1}}]}');
  const out = sanitizeMarks(hostile);
  expect({}.polluted).toBeUndefined();
  expect(Object.keys(out)).toEqual(MARK_AREAS);
  expect(out.park).toHaveLength(1);
});

test('sanitizeMarks keeps valid marks and drops each kind of bad one', () => {
  const good = scratch(50);
  const bad = [
    { ...good, kind: 'nap' },                       // unknown kind
    { ...good, id: 'Not An Id' },                   // bad id
    { ...good, id: null },                          // scratch needs an id
    { ...good, x: Infinity },                       // non-finite x
    { ...good, x: NaN },
    { ...good, x: '3' },
    { ...good, z: 201 },                            // |z| > 200
    { ...good, x: -200.5 },
    { ...good, at: NaN },                           // at not finite
    { ...good, at: '5' },
    { ...dig(1, 1, 1), id: 'park-post-1' },         // a dig carries no id
    { ...drop(1), item: null },                     // a drop needs an item
    { ...drop(1), item: 'brick' },                  // ...a carryable one
    { ...good, item: 'stick' },                     // a scratch carries nothing
    { ...good, kind: 'den', item: null },           // a den mark needs an item
    null, 7, 'x', [],
  ];
  const edge = scratch(60, 'park-post-2', { x: 200, z: -200 });
  const out = sanitizeMarks({ park: [...bad, good, edge], seaside: [drop(1, 'seaside-shell-1', 'shell')] });
  expect(out.park).toEqual([good, edge]);
  expect(out.seaside).toHaveLength(1);
  expect(out.neighborhood).toEqual([]);
});

test('sanitizeMarks coerces contested to a strict boolean and returns fresh plain objects', () => {
  const src = { park: [{ ...scratch(1), contested: 'yes', extra: 'junk' }] };
  const out = sanitizeMarks(src);
  expect(out.park[0]).toEqual(scratch(1));
  expect(out.park[0]).not.toBe(src.park[0]);
  expect(Object.keys(out.park[0]).sort()).toEqual(['at', 'contested', 'id', 'item', 'kind', 'x', 'z']);
});

test('sanitizeMarks keeps the newest eight of 90, oldest to newest', () => {
  const many = [];
  for (let i = 0; i < 90; i++) many.push(drop(i + 1, `park-stick-${i % 50}`));
  const out = sanitizeMarks({ park: many.reverse() });
  expect(out.park).toHaveLength(8);
  expect(out.park.map((m) => m.at)).toEqual([83, 84, 85, 86, 87, 88, 89, 90]);
});

test('sanitizeMarks dedupes on key, newest wins', () => {
  const out = sanitizeMarks({ park: [scratch(300, 'park-post-1', { x: 7 }), scratch(100, 'park-post-1', { x: 1 }), scratch(200, 'park-post-2')] });
  expect(out.park.map((m) => [m.id, m.at])).toEqual([['park-post-2', 200], ['park-post-1', 300]]);
  expect(out.park[1].x).toBe(7);
});

test('sanitizeMarks keeps a well-formed id it does not recognise', () => { // a prop removed later: keep, renderer skips
  const m = scratch(1, 'park-retired-9');
  expect(sanitizeMarks({ park: [m] }).park).toEqual([m]);
});

test('sanitizeMarks is idempotent', () => {
  let m = emptyMarks();
  for (let i = 0; i < 12; i++) m = addMark(m, 'seaside', drop(i + 1, `seaside-shell-${i}`, 'shell')).marks;
  expect(sanitizeMarks(m)).toEqual(m);
  expect(sanitizeMarks(JSON.parse(JSON.stringify(m)))).toEqual(m);
});
