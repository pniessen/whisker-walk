import { describe, it, expect } from 'vitest';
import { newPicker, reducePicker, pickerModel, pickerKeys, actionFor, COLS } from '../src/tv/letterpicker.js';
import { pickNext } from '../src/gamepadnavcore.js';
import { validPetName, goodNewPetName } from '../src/net.js';

const rules = { alphabet: 'A-Za-z -', max: 16, min: 2, valid: validPetName };
const type = (p, s) => [...s].reduce((q, ch) => reducePicker(q, { type: 'add', ch }), p);
const fresh = (o = {}) => newPicker({ ...rules, ...o });

describe('typing', () => {
  it('Mochi in five presses: the first letter is a capital by itself', () => {
    expect(type(fresh(), 'mochi').text).toBe('Mochi');
  });
  it('a letter after a space is a capital, and the rest are lower case', () => {
    expect(type(fresh(), 'mary jane').text).toBe('Mary Jane');
    expect(type(fresh(), 'MOCHI').text).toBe('Mochi');
  });
  it('Shift is one-shot', () => {
    let p = type(fresh(), 'mo');
    p = reducePicker(p, { type: 'shift' });
    expect(pickerModel(p).shift).toBe(true);
    p = type(p, 'cc');
    expect(p.text).toBe('MoCc');
    expect(p.shift).toBe(false);
  });
  it('the 17th letter is ignored, and so is a digit or an emoji', () => {
    expect(type(fresh(), 'abcdefghijklmnopq').text).toHaveLength(16);
    expect(type(fresh(), 'a1😺b').text).toBe('Ab');
    expect(reducePicker(fresh(), { type: 'add', ch: 'ab' }).text).toBe('');
  });
  it('no space or hyphen first, none twice in a row', () => {
    expect(type(fresh(), ' -').text).toBe('');
    expect(type(fresh(), 'a  b').text).toBe('A B');
    expect(type(fresh(), 'a--b').text).toBe('A-B');
    expect(type(fresh(), 'a- b').text).toBe('A-B');
  });
  it('back removes one letter, and on an empty name does nothing', () => {
    const empty = fresh();
    expect(reducePicker(empty, { type: 'back' })).toBe(empty);
    expect(reducePicker(type(fresh(), 'cat'), { type: 'back' }).text).toBe('Ca');
    expect(reducePicker(type(fresh(), 'cat'), { type: 'clear' }).text).toBe('');
  });
  it('an initial name is cleaned and cut to the limit', () => {
    expect(fresh({ initial: 'Mochi' }).text).toBe('Mochi');
    expect(fresh({ initial: 'Mo1chi!' }).text).toBe('Mochi');
    expect(fresh({ initial: 'a'.repeat(30) }).text).toHaveLength(16);
  });
});

describe('OK and cancel', () => {
  it('OK is refused while the name is too short, with the short message, and the card stays open', () => {
    const p = reducePicker(type(fresh(), 'a'), { type: 'ok' });
    expect(p.done).toBe(null);
    expect(p.message).toBe('short');
    expect(pickerModel(type(fresh(), 'a')).canOk).toBe(false);
  });
  it('a blocked word is refused with the blocked message', () => {
    const p = reducePicker(type(fresh({ valid: goodNewPetName }), 'discord'), { type: 'ok' });
    expect(p.done).toBe(null);
    expect(p.message).toBe('blocked');
  });
  it('the message goes away on the next edit', () => {
    let p = reducePicker(type(fresh(), 'a'), { type: 'ok' });
    p = type(p, 'b');
    expect(p.message).toBe(null);
  });
  it('a good name finishes with ok; cancel finishes with cancel; a finished picker takes no more', () => {
    const ok = reducePicker(type(fresh(), 'mochi'), { type: 'ok' });
    expect(ok.done).toBe('ok');
    expect(type(ok, 'x').text).toBe('Mochi');
    expect(reducePicker(fresh(), { type: 'cancel' }).done).toBe('cancel');
  });
  it('junk actions change nothing', () => {
    const p = fresh();
    expect(reducePicker(p, null)).toBe(p);
    expect(reducePicker(p, { type: 'nope' })).toBe(p);
  });
});

describe('the key grid', () => {
  const keys = pickerKeys();
  it('is A-Z and a hyphen in 3 rows of 9, then Shift Space Back Cancel OK filling a 9-wide row', () => {
    expect(keys.filter((k) => k.kind === 'letter').map((k) => k.ch).join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ-');
    expect(keys.filter((k) => k.row === 3).map((k) => k.id)).toEqual(['shift', 'space', 'back', 'cancel', 'ok']);
    expect(keys.filter((k) => k.row === 3).reduce((n, k) => n + k.span, 0)).toBe(COLS);
    expect(Math.max(...keys.filter((k) => k.kind === 'letter').map((k) => k.col))).toBe(COLS);
  });
  it('every key id is unique and maps to an action the reducer takes', () => {
    expect(new Set(keys.map((k) => k.id)).size).toBe(keys.length);
    for (const k of keys) expect(actionFor(k.id)).toBeTruthy();
    expect(actionFor('nope')).toBe(null);
  });
  // The pad's directional pick over the real layout: 1 unit = 1 key, 72 px at 1080p.
  const rect = (k) => ({ x: (k.col - 1) * 80, y: k.row * 80, w: k.span * 80 - 8, h: 72 });
  const cand = keys.map((k) => ({ id: k.id, rect: rect(k) }));
  const byId = Object.fromEntries(cand.map((c) => [c.id, c.rect]));
  const reach = (from) => {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      const id = queue.shift();
      for (const dir of ['up', 'down', 'left', 'right']) {
        const next = pickNext(byId[id], cand.filter((c) => c.id !== id), dir);
        if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    return seen;
  };
  it('every key can be reached from the A key by direction presses alone', () => {
    expect([...reach('A')].sort()).toEqual(keys.map((k) => k.id).sort());
  });
  it('and A can be reached again from every key (no dead end)', () => {
    for (const k of keys) expect(reach(k.id).has('A'), k.id).toBe(true);
  });
  it('Right and Left move one key; Down from the bottom row stays; Up from the top row stays', () => {
    const step = (from, dir) => pickNext(byId[from], cand.filter((c) => c.id !== from), dir);
    expect(step('A', 'right')).toBe('B');
    expect(step('B', 'left')).toBe('A');
    expect(step('A', 'down')).toBe('J');
    expect(step('J', 'up')).toBe('A');
    expect(step('A', 'up')).toBe(null);
    expect(step('ok', 'down')).toBe(null);
    expect(step('S', 'down')).toBe('shift');
  });
});
