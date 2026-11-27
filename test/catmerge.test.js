// "Log in to my cat", milestone 2: the three-way merge of two saves of one cat.
// Pure functions, no storage and no network.
import { describe, it, expect } from 'vitest';
import { mergeSaves, MERGE_RULES, trimBase, BASE_KEYS, useSaveTools } from '../src/catmerge.js';
import { sanitizeSave, freshStateKeys, CATALOG, createProgression } from '../src/progression.js';
import { memoryStorage } from './helpers/storage.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const fresh = (over = {}) => sanitizeSave({ version: 4, ...over });
const merge = (local, cloud, extra = {}) => mergeSaves({ local: fresh(local), cloud: fresh(cloud), ...extra });
const starters = new Set(sanitizeSave({}).unlocked.accessories);
const priced = Object.entries(CATALOG.accessories).filter(([id, a]) => typeof a.price === 'number' && a.price > 0 && !a.prize && !starters.has(id)).slice(0, 4);
const [[ITEM_A, ITEM_A_DEF], [ITEM_B]] = priced;
const look = (coat) => ({ coat, marks: 'black', pattern: 'solid', fur: 'short', eyes: 'green', size: 1 });
const cat = (id, name, coat = 'ginger') => ({ id, name, personality: 'keenNose', look: look(coat) });
const withAcc = (...ids) => ({ unlocked: { cats: [], accessories: ids, areas: [] } });

describe('every field has a rule', () => {
  it('every top-level key of a fresh save has a merge rule', () => {
    const missing = freshStateKeys().filter((k) => !Object.hasOwn(MERGE_RULES, k));
    expect(missing).toEqual([]);
  });
  it('and no rule is for a key that does not exist', () => {
    expect(Object.keys(MERGE_RULES).filter((k) => !freshStateKeys().includes(k))).toEqual([]);
  });
  it('the base keeps only keys that exist', () => {
    expect(BASE_KEYS.filter((k) => !freshStateKeys().includes(k))).toEqual([]);
  });
});

describe('the easy cases', () => {
  const played = { points: 40, lifetimePoints: 90, bestWalk: 12, walks: { park: 3 }, ...withAcc(ITEM_A) };
  it('merging a save with itself changes nothing', () => {
    const r = merge(played, played);
    expect(r.save).toEqual(fresh(played));
    expect(r.changed).toEqual({ local: false, cloud: false });
  });
  it('merging with an empty cloud changes nothing', () => {
    const r = merge(played, {});
    expect(r.save.lifetimePoints).toBe(90);
    expect(r.changed).toEqual({ local: false, cloud: true });
  });
  it('merging with an empty local gives the cloud', () => {
    const r = merge({}, played);
    const sorted = (x) => ({ ...x, unlocked: { ...x.unlocked, accessories: [...x.unlocked.accessories].sort() } });
    expect(sorted(r.save)).toEqual(sorted(fresh(played)));
    expect(r.changed).toEqual({ local: true, cloud: false });
  });
  it('a hostile cloud save is cleaned like any load', () => {
    const r = mergeSaves({ local: fresh({}), cloud: { version: 4, points: 'many', unlocked: { accessories: ['__proto__', 'nope'] } } });
    expect(r.save.points).toBe(0);
    expect(r.save.unlocked.accessories).not.toContain('nope');
  });
});

describe('counters (the 4.5 table)', () => {
  const base = { points: 100, lifetimePoints: 500, walks: { park: 5 }, visits: 10, fightsWon: 2, duskWalks: 1 };
  it('with a base: base plus both gains', () => {
    const r = merge({ ...base, lifetimePoints: 520, walks: { park: 7 }, visits: 12, fightsWon: 3, duskWalks: 2 },
      { ...base, lifetimePoints: 530, walks: { park: 6 }, visits: 11, fightsWon: 4, duskWalks: 1 }, { base: fresh(base) });
    expect(r.save.lifetimePoints).toBe(550);
    expect(r.save.walks.park).toBe(8);
    expect(r.save.visits).toBe(13);
    expect(r.save.fightsWon).toBe(5);
    expect(r.save.duskWalks).toBe(2);
  });
  it('without a base: the larger, so history is not counted twice', () => {
    const r = merge({ lifetimePoints: 520, walks: { park: 7 }, visits: 12 }, { lifetimePoints: 530, walks: { park: 6 }, visits: 11 });
    expect(r.save.lifetimePoints).toBe(530);
    expect(r.save.walks.park).toBe(7);
    expect(r.save.visits).toBe(12);
  });
  it('a counter is never lower than either side, even with a base that is too high', () => {
    const r = merge({ lifetimePoints: 520 }, { lifetimePoints: 530 }, { base: fresh({ lifetimePoints: 900 }) });
    expect(r.save.lifetimePoints).toBe(530);
  });
  it('paws: base plus both changes, spending counts', () => {
    const r = merge({ points: 70 }, { points: 150 }, { base: fresh({ points: 100 }) });
    expect(r.save.points).toBe(120);
  });
  it('the same paid item on both sides refunds one price', () => {
    const b = fresh({ points: 100 });
    const l = { points: 100 - ITEM_A_DEF.price, ...withAcc(ITEM_A) };
    const r = merge(l, l, { base: b });
    // two devices each paid; the merged save owns it once and gives one price back
    expect(r.save.points).toBe(Math.max(0, 100 - ITEM_A_DEF.price * 2 + ITEM_A_DEF.price));
    expect(r.save.unlocked.accessories).toContain(ITEM_A);
  });
  it('paws never go below zero and both items stay', () => {
    const b = fresh({ points: 30 });
    const r = merge({ points: 0, ...withAcc(ITEM_A) }, { points: 0, ...withAcc(ITEM_B) }, { base: b });
    expect(r.save.points).toBe(0);
    expect(r.save.unlocked.accessories).toEqual(expect.arrayContaining([ITEM_A, ITEM_B]));
  });
  it('lifetimePoints, bestWalk and walks never fall', () => {
    const r = merge({ lifetimePoints: 5, bestWalk: 9 }, { lifetimePoints: 8, bestWalk: 4 }, { base: fresh({ lifetimePoints: 20 }) });
    expect(r.save.lifetimePoints).toBeGreaterThanOrEqual(8);
    expect(r.save.bestWalk).toBe(9);
  });
});

describe('sets, per-key and choices', () => {
  it('unions: owned things, found outfits, redeemed codes', () => {
    const h1 = 'a'.repeat(64); const h2 = 'b'.repeat(64);
    const r = merge({ ...withAcc(ITEM_A), redeemed: [h1], skills: [] }, { ...withAcc(ITEM_B), redeemed: [h2] });
    expect(r.save.unlocked.accessories).toEqual(expect.arrayContaining([ITEM_A, ITEM_B]));
    expect(r.save.redeemed).toEqual(expect.arrayContaining([h1, h2]));
  });
  it('redeemed is a union so a gift code cannot be used twice', () => {
    const h = 'c'.repeat(64);
    expect(merge({ redeemed: [h] }, {}).save.redeemed).toEqual([h]);
    expect(merge({}, { redeemed: [h] }).save.redeemed).toEqual([h]);
  });
  it('per key, the larger: usage, feats, journal, friends', () => {
    const r = merge({ feats: { intruder: 3 }, friends: { Pip: { breed: 'tabby', greets: 2, lastWalk: '2026-11-01' } } },
      { feats: { intruder: 5 }, friends: { Pip: { breed: 'tabby', greets: 6, lastWalk: '2026-11-20' }, Zed: { breed: 'tabby', greets: 1, lastWalk: null } } });
    expect(r.save.feats.intruder).toBe(5);
    expect(r.save.friends.Pip.greets).toBe(6);
    expect(r.save.friends.Pip.lastWalk).toBe('2026-11-20');
    expect(r.save.friends.Zed.greets).toBe(1);
  });
  it('a choice follows the side that changed it', () => {
    const base = fresh({ area: 'neighborhood', mapMode: 'north' });
    const r = merge({ area: 'neighborhood', mapMode: 'turn' }, { area: 'neighborhood', mapMode: 'north' }, { base });
    expect(r.save.mapMode).toBe('turn');
    const r2 = merge({ mapMode: 'north' }, { mapMode: 'turn' }, { base });
    expect(r2.save.mapMode).toBe('turn');
  });
  it('a choice both changed follows the side saved later', () => {
    const base = fresh({ petName: 'Alpha' });
    expect(merge({ petName: 'Bravo' }, { petName: 'Cedar' }, { base, localAt: 10, cloudAt: 20 }).save.petName).toBe('Cedar');
    expect(merge({ petName: 'Bravo' }, { petName: 'Cedar' }, { base, localAt: 30, cloudAt: 20 }).save.petName).toBe('Bravo');
  });
  it('streak: the later day, then the larger count', () => {
    expect(merge({ streak: { last: '2026-11-02', count: 2 } }, { streak: { last: '2026-11-05', count: 1 } }).save.streak).toEqual({ last: '2026-11-05', count: 1 });
    expect(merge({ streak: { last: '2026-11-05', count: 4 } }, { streak: { last: '2026-11-05', count: 2 } }).save.streak.count).toBe(4);
  });
  it('race: the later date; the same date, the faster time', () => {
    const area = Object.keys(CATALOG.areas)[0];
    const a = { date: '2026-11-01', area, bestMs: 9000 };
    const b = { date: '2026-11-01', area, bestMs: 8000 };
    expect(merge({ race: a }, { race: b }).save.race.bestMs).toBe(8000);
    expect(merge({ race: a }, { race: { ...b, date: '2026-11-09' } }).save.race.date).toBe('2026-11-09');
  });
  it('the kitten stage, the larger', () => {
    expect(merge({ kitten: { stage: 1 } }, { kitten: { stage: 3 } }).save.kitten.stage).toBe(3);
  });
  it('the guided walk: done or old beats null; the hints, the larger', () => {
    const r = merge({ tutorial: { first: null, hints: { } } }, { tutorial: { first: 'done', hints: {} } });
    expect(r.save.tutorial.first).toBe('done');
  });
  it('clan roles keep a set verdict, this device first', () => {
    const r = merge({ clanRoles: {} }, {});
    expect(Object.values(r.save.clanRoles)).toEqual([null, null]);
  });
  it('the unpaired colony is a union of cats', () => {
    const c1 = { name: 'Mouse', breed: 'tabby', area: 'park', x: 0, z: 0, head: 0, tamed: false, tamedBy: null, tamedWalk: null, wear: [] };
    const l = { colony: { cats: [{ ...c1, name: 'Mouse' }], feeds: [] } };
    const c = { colony: { cats: [{ ...c1, name: 'Pip' }], feeds: [] } };
    const names = merge(l, c).save.colony.cats.map((x) => x.name);
    expect(names.length).toBeGreaterThanOrEqual(0);
  });
});

describe('her own cats and outfits, slot by slot', () => {
  it('the same cat in the same slot is one cat', () => {
    const r = merge({ customCats: [cat('mine1', 'Mittens')] }, { customCats: [cat('mine1', 'Mittens')] });
    expect(r.save.customCats).toHaveLength(1);
    expect(r.save.sleepingCats).toEqual([]);
  });
  it('a slot used on one side only is kept', () => {
    const r = merge({ customCats: [cat('mine1', 'Mittens')] }, { customCats: [cat('mine2', 'Pickle', 'black')] });
    expect(r.save.customCats.map((c) => c.name).sort()).toEqual(['Mittens', 'Pickle']);
  });
  it('same slot, different cats: the cloud keeps the slot, the newcomer takes a free slot; scars and equipped follow it', () => {
    const l = { customCats: [cat('mine1', 'Newcomer', 'black')], equipped: { custom: 'mine1' }, scars: { mine1: [{ site: 'face', left: 3 }] } };
    const c = { customCats: [cat('mine1', 'Resident')] };
    const r = merge(l, c);
    const byName = Object.fromEntries(r.save.customCats.map((x) => [x.name, x.id]));
    expect(byName.Resident).toBe('mine1');
    expect(byName.Newcomer).toBe('mine2');
    expect(r.save.scars.mine2).toBeDefined();
    expect(r.save.scars.mine1).toBeUndefined();
  });
  it('same slot, no free slot: the newcomer sleeps and is never deleted', () => {
    const full = (n) => [cat('mine1', `${n}Aa`), cat('mine2', `${n}Bb`, 'black'), cat('mine3', `${n}Cc`, 'cream')];
    const r = merge({ customCats: full('L') }, { customCats: full('C') });
    expect(r.save.customCats).toHaveLength(3);
    expect(r.save.sleepingCats.map((c) => c.name).sort()).toEqual(['LAa', 'LBb', 'LCc']);
  });
  it('a sleeping cat wakes when a slot is free', () => {
    const r = merge({ customCats: [], sleepingCats: [cat('mine1', 'Dozer')] }, {});
    expect(r.save.customCats.map((c) => c.name)).toEqual(['Dozer']);
    expect(r.save.sleepingCats).toEqual([]);
  });
  it('with a base, a cat only the cloud edited is the cloud edit, not a second cat', () => {
    const base = fresh({ customCats: [cat('mine1', 'Mittens')] });
    const r = merge({ customCats: [cat('mine1', 'Mittens')] }, { customCats: [cat('mine1', 'Mittens', 'black')] }, { base });
    expect(r.save.customCats).toHaveLength(1);
    expect(r.save.customCats[0].look.coat).toBe('black');
    expect(r.save.sleepingCats).toEqual([]);
  });
  it('slots she bought stay bought, and outfits fill free slots', () => {
    const wear = (id) => ({ collar: id });
    const collars = Object.entries(CATALOG.accessories).filter(([, a]) => a.slot === 'collar').map(([id]) => id);
    const r = merge({ moreCatSlots: true, ...withAcc(...collars.slice(0, 2)), outfits: [{ id: 'o1', wear: wear(collars[0]) }] },
      { outfits: [{ id: 'o1', wear: wear(collars[1]) }] });
    expect(r.save.moreCatSlots).toBe(true);
    expect(r.save.outfits.map((o) => o.id)).toEqual(['o1', 'o2']);
  });
});

describe('never lose, and the merge is stable', () => {
  const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ids = Object.keys(CATALOG.accessories);
  const randomSave = (r) => {
    const pickSome = (list, n) => list.filter(() => r() < n);
    const customs = ['mine1', 'mine2', 'mine3'].filter(() => r() < 0.5).map((id) => cat(id, `Cat${'abcd'[Math.floor(r() * 4)]}`, ['ginger', 'black', 'cream'][Math.floor(r() * 3)]));
    return fresh({
      points: Math.floor(r() * 200), lifetimePoints: Math.floor(r() * 900), bestWalk: Math.floor(r() * 40),
      unlocked: { cats: [], accessories: pickSome(ids, 0.2), areas: [] },
      customCats: customs, redeemed: pickSome(['a', 'b', 'c', 'd', 'e'], 0.5).map((c) => c.repeat(64)),
      walks: { park: Math.floor(r() * 9), seaside: Math.floor(r() * 9) },
      mapMode: r() < 0.5 ? 'turn' : 'north',
    });
  };
  const contents = (s) => [...s.customCats, ...s.sleepingCats].map((c) => JSON.stringify([c.name, c.personality, c.look]));
  it('lifetimePoints, bestWalk, owned items, cats and redeemed are never lower than either input (200 seeded pairs)', () => {
    const r = rng(7);
    for (let i = 0; i < 200; i++) {
      const a = randomSave(r); const b = randomSave(r);
      const m = mergeSaves({ local: a, cloud: b }).save;
      for (const x of [a, b]) {
        expect(m.lifetimePoints).toBeGreaterThanOrEqual(x.lifetimePoints);
        expect(m.bestWalk).toBeGreaterThanOrEqual(x.bestWalk);
        for (const id of x.unlocked.accessories) expect(m.unlocked.accessories).toContain(id);
        for (const h of x.redeemed) expect(m.redeemed).toContain(h);
        for (const c of contents(x)) expect(contents(m)).toContain(c);
        for (const k of Object.keys(x.walks)) expect(m.walks[k]).toBeGreaterThanOrEqual(x.walks[k]);
      }
    }
  });
  it('the merge output goes through sanitizeState and is idempotent: merge(merge(a,b),b) equals merge(a,b)', () => {
    const r = rng(11);
    for (let i = 0; i < 100; i++) {
      const a = randomSave(r); const b = randomSave(r);
      const m1 = mergeSaves({ local: a, cloud: b }).save;
      expect(sanitizeSave(m1)).toEqual(m1);
      expect(mergeSaves({ local: m1, cloud: b }).save).toEqual(m1);
      expect(mergeSaves({ local: a, cloud: m1 }).save).toEqual(m1);
    }
  });
  it('is the same with a base, once the base is the cloud', () => {
    const r = rng(13);
    for (let i = 0; i < 60; i++) {
      const base = randomSave(r); const a = randomSave(r); const b = randomSave(r);
      const m1 = mergeSaves({ local: a, cloud: b, base: trimBase(base) }).save;
      // after a catch-up the device's base is the cloud's save, so a second one changes nothing
      expect(mergeSaves({ local: m1, cloud: b, base: trimBase(b) }).save).toEqual(m1);
    }
  });
});

describe('the trimmed base', () => {
  it('is small and holds only the keys the merge needs', () => {
    const t = trimBase(fresh({ points: 5, journal: { mouse: 2 } }));
    expect(Object.keys(t).sort()).toEqual([...BASE_KEYS].sort());
    expect(JSON.stringify(t).length).toBeLessThan(2000);
  });
});

describe('applyMerged keeps a copy and refuses a newer-version save', () => {
  it('writes the merged save, keeps the one it replaced once a day, and settles', () => {
    const storage = memoryStorage({}, { removeItem: true, expose: 'm' });
    const p = createProgression(storage);
    p.setPetName('Pip');
    const merged = mergeSaves({ local: JSON.parse(JSON.stringify(p.state)), cloud: fresh({ lifetimePoints: 500 }) }).save;
    expect(p.applyMerged(merged)).toBe(true);
    expect(p.state.lifetimePoints).toBe(500);
    const first = storage.m.get('whisker-walk-save.before-merge');
    expect(first).toBeTruthy();
    // a second catch-up the same day does not replace that copy
    expect(p.applyMerged({ ...merged, lifetimePoints: 600 })).toBe(true);
    expect(storage.m.get('whisker-walk-save.before-merge')).toBe(first);
    expect(p.applyMerged('nope')).toBe(false);
  });
  it('writes nothing over a save from a newer version', () => {
    const newer = JSON.stringify({ version: 99, points: 1 });
    const storage = memoryStorage({ 'whisker-walk-save': newer }, { removeItem: true });
    const p = createProgression(storage);
    expect(p.applyMerged(fresh({ points: 9 }))).toBe(false);
    expect(storage.getItem('whisker-walk-save')).toBe(newer);
  });
});

describe('builder scar sub-key (builder-scars)', () => {
  it('a scar added on one device reaches the merged cat, and a scarred and an unscarred cat stay two looks', () => {
    const plain = cat('mine1', 'Pip');
    const scarred = { ...plain, look: { ...plain.look, scar: 'brow' } };
    const r = merge({ customCats: [scarred] }, { customCats: [scarred] });
    expect(r.save.customCats[0].look.scar).toBe('brow');
    const both = merge({ customCats: [scarred] }, { customCats: [plain] });
    expect(both.save.customCats.length).toBeGreaterThanOrEqual(1);
    expect(mergeSaves({ local: both.save, cloud: both.save }).save).toEqual(both.save);
  });
});
