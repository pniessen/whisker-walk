// What the guided first walk keeps on the save (src/progression.js; design section 8).
import { describe, it, expect } from 'vitest';
import { createProgression, sanitizeTutorial, TUTORIAL_GIFT } from '../src/progression.js';
import { memoryStorage } from './helpers/storage.js';

const KEY = 'whisker-walk-save';
const memStorage = (initial) => memoryStorage(initial, { removeItem: true });
const EMPTY = { first: null, camp: false, hints: {}, told: { thing: null, visits: 0 } };

describe('the guide and the gift on the save', () => {
  it('a save that never met a guide has exactly the four fields', () => {
    const p = createProgression(memStorage());
    expect(Object.keys(p.state.tutorial).sort()).toEqual(['camp', 'first', 'hints', 'told']);
    expect(p.state.tutorial).toEqual(EMPTY);
  });

  it('the finish gift is 20 points, once a save: a replay gives no second gift', () => {
    const storage = memStorage();
    const p = createProgression(storage);
    expect(p.giveTutorialGift()).toBe(TUTORIAL_GIFT);
    expect(p.state.points).toBe(20);
    expect(p.state.lifetimePoints).toBe(20);
    expect(p.giveTutorialGift()).toBe(0);
    expect(p.state.points).toBe(20);
    // "Play the first walk again" marks the walk as not done; the gift stays given
    expect(p.setTutorialFirst(null)).toBe(false); // already null on this save
    p.setTutorialFirst('done');
    p.setTutorialFirst(null);
    const again = createProgression(storage);
    expect(again.state.tutorial.first).toBe(null);
    expect(again.state.tutorial.gift).toBe(true);
    expect(again.giveTutorialGift()).toBe(0);
    expect(again.state.points).toBe(20);
  });

  it('the guide is remembered by name, and only a stray\'s name', () => {
    const storage = memStorage();
    const p = createProgression(storage);
    expect(p.setTutorialGuide('Biscuit')).toBe(true);
    expect(p.setTutorialGuide('Biscuit')).toBe(false);
    for (const bad of ['<b>x</b>', '', null, 7, 'Not A Cat Name']) expect(p.setTutorialGuide(bad)).toBe(false);
    expect(createProgression(storage).state.tutorial.guide).toBe('Biscuit');
    expect(sanitizeTutorial({ first: 'part', guide: '<img src=x>', gift: 'yes' })).toEqual({ ...EMPTY, first: 'part' });
    expect(sanitizeTutorial({ first: 'part', guide: 'Biscuit', gift: true })).toEqual({ ...EMPTY, first: 'part', guide: 'Biscuit', gift: true });
  });

  it('the first camp walk is marked shown once', () => {
    const storage = memStorage({ [KEY]: JSON.stringify({ version: 4, walks: { neighborhood: 2 }, clanPick: { mine: 'woods', partner: null, partnerId: null } }) });
    const p = createProgression(storage);
    expect(p.state.tutorial.camp).toBe(false);
    expect(p.setTutorialCamp()).toBe(true);
    expect(p.setTutorialCamp()).toBe(false);
    expect(createProgression(storage).state.tutorial.camp).toBe(true);
  });
});
