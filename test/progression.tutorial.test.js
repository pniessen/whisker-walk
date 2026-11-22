// The save's `tutorial` field (design: .claude/plans/guided-first-walk-design.md,
// section 8) and the first pick opening its land (section 7, owner's answer 2).
import { describe, it, expect } from 'vitest';
import { createProgression, sanitizeTutorial, TUTORIAL_FIRST, CATALOG } from '../src/progression.js';
import { HINT_IDS } from '../src/hints.js';
import { memoryStorage } from './helpers/storage.js';

const KEY = 'whisker-walk-save';
const memStorage = (initial) => memoryStorage(initial, { removeItem: true });
const seeded = (fields) => memStorage({ [KEY]: JSON.stringify({ version: 4, ...fields }) });
const saved = (s) => JSON.parse(s.getItem(KEY));
const EMPTY = { first: null, camp: false, hints: {}, told: { thing: null, visits: 0 } };

describe('the tutorial field', () => {
  it('a brand-new save starts with first: null, and the save version is still 4', () => {
    const p = createProgression(memStorage());
    expect(p.state.tutorial).toEqual(EMPTY);
    expect(p.state.version).toBe(4);
    expect(TUTORIAL_FIRST).toEqual([null, 'part', 'done', 'skipped', 'old']);
  });

  it('an old save with a finished walk becomes "old"', () => {
    const p = createProgression(seeded({ walks: { neighborhood: 3 }, points: 0, lifetimePoints: 0 }));
    expect(p.state.tutorial).toEqual({ ...EMPTY, first: 'old' });
    expect(p.state.version).toBe(4);
  });

  it('an old save with points ever earned becomes "old", even with no walk finished', () => {
    expect(createProgression(seeded({ lifetimePoints: 12 })).state.tutorial.first).toBe('old');
    expect(createProgression(seeded({ points: 5 })).state.tutorial.first).toBe('old');
  });

  it('a save with no field, no walk and no points is a new player', () => {
    expect(createProgression(seeded({ petName: 'Mo' })).state.tutorial).toEqual(EMPTY);
  });

  it('camp is true only when she has walked on her home land', () => {
    const pick = { mine: 'woods', partner: null, partnerId: null };
    expect(createProgression(seeded({ walks: { neighborhood: 2, woods: 1 }, clanPick: pick })).state.tutorial.camp).toBe(true);
    expect(createProgression(seeded({ walks: { neighborhood: 2, woods: 0 }, clanPick: pick })).state.tutorial.camp).toBe(false);
    expect(createProgression(seeded({ walks: { neighborhood: 2, woods: 4 } })).state.tutorial.camp).toBe(false); // no home
  });

  it('a v3 and a v2 save are read the same way', () => {
    expect(createProgression(memStorage({ [KEY]: JSON.stringify({ version: 3, points: 30, lifetimePoints: 30, walks: { neighborhood: 1 } }) })).state.tutorial.first).toBe('old');
    expect(createProgression(memStorage({ [KEY]: JSON.stringify({ version: 2, points: 30, walks: { neighborhood: 1 } }) })).state.tutorial.first).toBe('old');
  });

  it('junk is cleaned: unknown keys dropped, numbers clamped to 0..3, the rest reset', () => {
    const p = createProgression(seeded({
      walks: { neighborhood: 1 },
      tutorial: {
        first: 'banana', camp: 'yes', extra: 1,
        hints: { look: 99, creep: -2, jump: 1.9, hop: '2', nope: 2, __proto__: 3, dog: 3, swim: 0 },
        told: { thing: 'beanie', visits: 50, more: true },
      },
    }));
    expect(p.state.tutorial).toEqual({
      first: 'old', // not a known value: reset by the rule for a save without the field
      camp: false,
      hints: { look: 3, jump: 1, dog: 3 },
      told: { thing: 'beanie', visits: 3 },
    });
    for (const junk of [null, 7, 'x', [], [1, 2]]) {
      expect(createProgression(seeded({ tutorial: junk })).state.tutorial).toEqual(EMPTY);
    }
    const t = createProgression(seeded({ tutorial: { first: 'done', hints: [1, 2], told: { thing: 'partycrown', visits: 2 } } })).state.tutorial;
    expect(t).toEqual({ first: 'done', camp: false, hints: {}, told: { thing: null, visits: 0 } }); // a prize is never "enough for"
    expect(sanitizeTutorial({ first: null }, { walked: true })).toEqual(EMPTY); // an explicit null is kept
    expect(sanitizeTutorial({ first: 'part', camp: true, hints: { __proto__: 2 } }).hints).toEqual({});
  });

  it('every known value of first is kept', () => {
    for (const first of TUTORIAL_FIRST) expect(createProgression(seeded({ walks: { neighborhood: 9 }, tutorial: { first } })).state.tutorial.first).toBe(first);
  });

  it('the find, find-kept and map counts survive loading; a save without them has none', () => {
    const t = createProgression(seeded({ tutorial: { first: 'done', hints: { map: 1, 'find-kept': 1, find: 1 } } })).state.tutorial;
    expect(t.hints).toEqual({ map: 1, 'find-kept': 1, find: 1 });
    expect(createProgression(seeded({ tutorial: { first: 'done', hints: { look: 1 } } })).state.tutorial.hints).toEqual({ look: 1 });
  });

  it('a save loaded from the cloud follows the same rules', () => {
    const p = createProgression(memStorage());
    p.replaceFromPayload({ version: 4, walks: { neighborhood: 5 }, lifetimePoints: 200, points: 80 });
    expect(p.state.tutorial).toEqual({ ...EMPTY, first: 'old' });
    p.replaceFromPayload({ version: 4, tutorial: { first: 'part', camp: 1, hints: { look: 7, bogus: 1 }, told: 'x' } });
    expect(p.state.tutorial).toEqual({ first: 'part', camp: false, hints: { look: 3 }, told: { thing: null, visits: 0 } });
    p.replaceFromPayload({ version: 4 });
    expect(p.state.tutorial).toEqual(EMPTY);
  });

  it('Start over makes a new save, so the guided walk comes back', () => {
    const s = seeded({ walks: { neighborhood: 3 }, lifetimePoints: 50 });
    const p = createProgression(s);
    expect(p.state.tutorial.first).toBe('old');
    p.reset();
    expect(p.state.tutorial).toEqual(EMPTY);
    expect(saved(s).tutorial).toEqual(EMPTY);
  });

  it('a new player who walks keeps first: null on the next load (the field is on the save)', () => {
    const s = memStorage();
    const p = createProgression(s);
    p.addPoints(40);
    p.completeWalk('neighborhood');
    expect(createProgression(s).state.tutorial.first).toBe(null);
  });
});

describe('the tutorial methods', () => {
  it('countHint adds one, saves, and stops at 3; unknown ids are ignored', () => {
    const s = memStorage();
    const p = createProgression(s);
    expect(p.countHint('look')).toBe(1);
    expect(saved(s).tutorial.hints).toEqual({ look: 1 });
    for (let i = 0; i < 9; i++) p.countHint('look');
    expect(p.state.tutorial.hints.look).toBe(3);
    expect(p.countHint('nope')).toBe(0);
    expect(p.countHint('__proto__')).toBe(0);
    expect(Object.keys(p.state.tutorial.hints)).toEqual(['look']);
    for (const id of HINT_IDS) expect(p.countHint(id)).toBeGreaterThan(0);
  });

  it('knowHint marks a hint as never needed', () => {
    const s = memStorage();
    const p = createProgression(s);
    p.knowHint('home');
    expect(saved(s).tutorial.hints.home).toBe(3);
    p.knowHint('nope');
    expect(Object.keys(p.state.tutorial.hints)).toEqual(['home']);
  });

  it('setTutorialFirst takes the known values only', () => {
    const s = memStorage();
    const p = createProgression(s);
    expect(p.setTutorialFirst('part')).toBe(true);
    expect(saved(s).tutorial.first).toBe('part');
    expect(p.setTutorialFirst('part')).toBe(false);
    expect(p.setTutorialFirst('banana')).toBe(false);
    expect(p.setTutorialFirst(null)).toBe(true);
    expect(p.state.tutorial.first).toBe(null);
  });

  it('noteTold counts visits per thing, up to 3, and starts again for a new thing', () => {
    const p = createProgression(memStorage());
    p.noteTold('beanie');
    p.noteTold('beanie');
    expect(p.state.tutorial.told).toEqual({ thing: 'beanie', visits: 2 });
    p.noteTold('beanie');
    p.noteTold('beanie');
    expect(p.state.tutorial.told).toEqual({ thing: 'beanie', visits: 3 });
    p.noteTold('socks');
    expect(p.state.tutorial.told).toEqual({ thing: 'socks', visits: 1 });
    p.noteTold('nope');
    expect(p.state.tutorial.told).toEqual({ thing: 'socks', visits: 1 });
  });

  it('a walk on her home land sets camp', () => {
    const p = createProgression(seeded({ walks: { neighborhood: 2 }, clanPick: { mine: 'woods', partner: null, partnerId: null }, unlocked: { areas: ['neighborhood', 'woods'] } }));
    expect(p.state.tutorial.camp).toBe(false);
    p.completeWalk('neighborhood');
    expect(p.state.tutorial.camp).toBe(false);
    p.completeWalk('woods');
    expect(p.state.tutorial.camp).toBe(true);
  });
});

describe('the first pick opens that land and makes it today\'s walk', () => {
  const afterTwoWalks = () => seeded({ walks: { neighborhood: 2 }, points: 60, lifetimePoints: 60 });

  it('a land that is still locked is opened at once, for nothing', () => {
    for (const id of ['woods', 'river', 'moor', 'pines', 'gorge']) {
      const s = afterTwoWalks();
      const p = createProgression(s);
      expect(p.isUnlocked('areas', id)).toBe(false);
      expect(p.pickHome(id)).toBe('first');
      expect(p.state.clanPick.mine).toBe(id);
      expect(p.isUnlocked('areas', id)).toBe(true);
      expect(p.state.area).toBe(id);
      expect(p.state.points).toBe(60);
      expect(saved(s).area).toBe(id);
      expect(saved(s).unlocked.areas).toContain(id);
      // and it loads back that way
      expect(createProgression(s).state.area).toBe(id);
    }
  });

  it('the other gates stay as they are', () => {
    const p = createProgression(afterTwoWalks());
    p.pickHome('gorge');
    expect(p.state.unlocked.areas.sort()).toEqual(['gorge', 'neighborhood']);
    expect(p.canBuy('areas', 'moor')).toBe(false); // still 2 walks in the Woods away
    expect(CATALOG.areas.gorge.requires).toEqual({ area: 'moor', walks: 2 });
  });

  it('a later change of group moves nothing', () => {
    const p = createProgression(afterTwoWalks());
    p.pickHome('woods');
    p.setArea('neighborhood');
    expect(p.pickHome('pines')).toBe('changed');
    expect(p.state.clanPick.mine).toBe('pines');
    expect(p.state.area).toBe('neighborhood');
    expect(p.isUnlocked('areas', 'pines')).toBe(false);
    expect(p.pickHome('pines')).toBe('changed'); // the same one again
  });

  it('a land she already owns is not added twice', () => {
    const p = createProgression(seeded({ walks: { neighborhood: 2 }, unlocked: { areas: ['neighborhood', 'woods'] } }));
    p.pickHome('woods');
    expect(p.state.unlocked.areas.filter((a) => a === 'woods')).toHaveLength(1);
    expect(p.state.area).toBe('woods');
  });

  it('Legacy Edition never picks, so nothing opens and nothing moves', () => {
    const p = createProgression(seeded({ walks: { neighborhood: 2 }, edition: 'legacy' }));
    expect(p.pickHome('woods')).toBe(false);
    expect(p.state.clanPick.mine).toBe(null);
    expect(p.state.area).toBe('neighborhood');
    expect(p.isUnlocked('areas', 'woods')).toBe(false);
  });

  it('junk is refused', () => {
    const p = createProgression(afterTwoWalks());
    for (const junk of ['nope', '__proto__', null, undefined, 3, 'neighborhood']) expect(p.pickHome(junk)).toBe(false);
    expect(p.state.area).toBe('neighborhood');
  });
});
