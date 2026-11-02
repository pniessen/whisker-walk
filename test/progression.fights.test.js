import { describe, it, expect } from 'vitest';
import { createProgression } from '../src/progression.js';
import { unlockToast } from '../src/fightmoves.js';

const KEY = 'whisker-walk-save';
function mem(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}
const base = () => JSON.parse(JSON.stringify(createProgression(mem()).state));
const withSave = (patch, raw = true) => {
  const s = raw ? { ...base(), ...patch } : patch;
  return createProgression(mem({ [KEY]: JSON.stringify(s) }));
};
const look = { coat: 'black', marks: 'white', pattern: 'socks', fur: 'long', eyes: 'gold', size: 0.9 };

describe('fights won and moves', () => {
  it('a new save starts at zero with no moves', () => {
    const p = createProgression(mem());
    expect(p.state.fightsWon).toBe(0);
    expect(p.state.fightMoves).toEqual([]);
    expect(p.state.scars).toEqual({});
    expect(p.state.scarredIntruders).toEqual([]);
    expect(p.takeNewMoves()).toEqual([]);
  });
  it('recordFightWon unlocks Rear-up Swat at 3 and Pin at 10, once each', () => {
    const p = createProgression(mem());
    const got = [];
    for (let i = 0; i < 12; i++) got.push(p.recordFightWon());
    expect(got[0]).toEqual([]);
    expect(got[2]).toEqual(['rearUpSwat']);
    expect(got[5]).toEqual(['leapScratch']);
    expect(got[9]).toEqual(['pin']);
    expect(got.flat()).toEqual(['rearUpSwat', 'leapScratch', 'pin']);
    expect(p.state.fightsWon).toBe(12);
    expect(p.ownedMoves()).toEqual(['rearUpSwat', 'leapScratch', 'pin']);
  });
  it('buyMove spends points; Pin and Rolling Tumble cannot be bought; Legacy refuses', () => {
    const p = withSave({ points: 1000 });
    expect(p.canBuyMove('rearUpSwat')).toBe(true);
    expect(p.buyMove('rearUpSwat')).toBe(true);
    expect(p.state.points).toBe(700);
    expect(p.buyMove('rearUpSwat')).toBe(false);
    expect(p.buyMove('pin')).toBe(false);
    expect(p.buyMove('rollingTumble')).toBe(false);
    expect(p.buyMove('nope')).toBe(false);
    expect(p.buyMove(undefined)).toBe(false);
    expect(p.state.points).toBe(700);
    // earning a bought move later changes nothing
    for (let i = 0; i < 3; i++) expect(p.recordFightWon()).toEqual([]);
    expect(p.ownedMoves()).toEqual(['rearUpSwat']);
    expect(p.state.points).toBe(700);
    const legacy = withSave({ points: 1000, edition: 'legacy' });
    expect(legacy.canBuyMove('leapScratch')).toBe(false);
    expect(legacy.buyMove('leapScratch')).toBe(false);
    expect(legacy.state.points).toBe(1000);
    expect(withSave({ points: 299 }).canBuyMove('rearUpSwat')).toBe(false);
    // persists
    const s = mem();
    const q = createProgression(s);
    q.state.points = 700;
    q.buyMove('rearUpSwat');
    expect(createProgression(s).ownedMoves()).toEqual(['rearUpSwat']);
  });
});

describe('scars', () => {
  it('scarCat / catScars give stage and side', () => {
    const p = createProgression(mem());
    expect(p.scarCat('tabby', 'face')).toBe(true);
    const r = p.catScars('tabby');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ site: 'face', stage: 'full' });
    expect(['l', 'r']).toContain(r[0].side);
    expect(p.scarCat('tabby', 'nose')).toBe(false);
    expect(p.scarCat('nobody', 'face')).toBe(false);
    expect(p.scarCat(null, 'face')).toBe(false);
    expect(p.catScars('nobody')).toEqual([]);
    expect(p.catScars(null)).toEqual([]);
  });
  it('hagrid never scars', () => {
    const p = createProgression(mem());
    expect(p.scarCat('hagrid', 'face')).toBe(false);
    expect(p.state.scars).toEqual({});
    expect(p.catScars('hagrid')).toEqual([]);
  });
  it("a lost fight's scar belongs to the cat that fought", () => {
    const p = createProgression(mem());
    const id = p.createCustomCat({ name: 'Ember', personality: 'pouncer', look });
    p.scarCat('tabby', 'back');
    p.equipCustom(id);
    expect(p.catScars('mine1')).toEqual([]);
    p.completeWalk();
    p.completeWalk();
    expect(p.state.scars.tabby).toEqual([{ site: 'back', left: 3 }]);
    expect(p.catScars('tabby')[0].stage).toBe('full');
  });
  it('scars fade by any completeWalk, Legacy and den included', () => {
    const p = withSave({ edition: 'legacy' });
    p.scarCat('tabby', 'side');
    p.scarIntruder('woods-1', 'face');
    p.completeWalk('den');
    expect(p.state.scars.tabby).toEqual([{ site: 'side', left: 4 }]);
    expect(p.state.scarredIntruders).toEqual([{ id: 'woods-1', scars: [{ site: 'face', left: 4 }] }]);
    for (let i = 0; i < 4; i++) p.completeWalk();
    expect(p.state.scars.tabby).toEqual([{ site: 'side', left: 0 }]);
    p.completeWalk();
    expect(p.state.scars).toEqual({});
    expect(p.state.scarredIntruders).toEqual([]);
    expect(p.intruderScars('woods-1')).toEqual([]);
  });
  it('scarIntruder moves the entry to the end and drops the oldest past 24', () => {
    const p = createProgression(mem());
    const ids = [];
    for (const c of ['woods', 'moor', 'river', 'pines']) for (let i = 0; i < 8; i++) ids.push(`${c}-${i}`);
    for (const id of ids) expect(p.scarIntruder(id, 'face')).toBe(true);
    expect(p.state.scarredIntruders).toHaveLength(24);
    expect(p.state.scarredIntruders[0].id).toBe(ids[8]);
    p.scarIntruder(ids[10], 'back');
    expect(p.state.scarredIntruders.at(-1).id).toBe(ids[10]);
    expect(p.intruderScars(ids[10]).map((s) => s.site)).toEqual(['face', 'back']);
    expect(p.scarIntruder('woods-99', 'face')).toBe(false);
    expect(p.scarIntruder('woods-1', 'nose')).toBe(false);
    expect(p.intruderScars('nope')).toEqual([]);
  });
  it('createCustomCat drops scars for a reused id; editing keeps them', () => {
    const p = createProgression(mem());
    const id = p.createCustomCat({ name: 'Ember', personality: 'pouncer', look });
    p.scarCat(id, 'hind');
    p.updateCustomCat(id, { name: 'Ember', personality: 'chaser', look });
    expect(p.catScars(id)).toHaveLength(1);
    p.state.customCats.splice(0, 1);
    const id2 = p.createCustomCat({ name: 'Fern', personality: 'pouncer', look });
    expect(id2).toBe(id);
    expect(p.catScars(id2)).toEqual([]);
  });
});

describe('the save', () => {
  it('hostile saves load clamped', () => {
    const many = [];
    for (let i = 0; i < 1000; i++) many.push({ id: `woods-${i % 20}`, scars: [{ site: 'face', left: 3 }] });
    const hostile = {
      fightsWon: '9e99',
      fightMoves: { a: 1 },
      scars: {
        tabby: [{ site: 'face', left: NaN }, { site: 'face', left: 1e9 }, { site: 'back', left: -1 }, { site: 'hind', left: 2 }, { site: 'side', left: 2 }],
        hagrid: [{ site: 'face', left: 3 }],
        __proto__: [{ site: 'face', left: 3 }],
        mine2: [{ site: 'face', left: 3 }],
        nobody: [{ site: 'face', left: 3 }],
        siamese: 'x',
      },
      scarredIntruders: many,
    };
    const s = JSON.parse(JSON.stringify(base()));
    const raw = JSON.stringify({ ...s, ...hostile }).replace('"scars":{', '"scars":{"__proto__":[{"site":"face","left":3}],');
    const p = createProgression(mem({ [KEY]: raw }));
    expect(p.state.version).toBe(4);
    expect(p.state.fightsWon).toBeLessThanOrEqual(1e6);
    expect(Object.keys(p.state.scars)).toEqual(['tabby']);
    expect(p.state.scars.tabby).toEqual([{ site: 'face', left: 5 }, { site: 'back', left: 0 }]);
    expect(p.state.scarredIntruders.length).toBeLessThanOrEqual(24);
    expect(p.state.fightMoves).toEqual([]);
    expect(JSON.parse(JSON.stringify(p.state))).toEqual(p.state);
    for (const fw of [-5, 1.5, '9e99', null, [], {}, NaN, Infinity, 1e12]) {
      const q = withSave({ fightsWon: fw });
      expect(Number.isInteger(q.state.fightsWon)).toBe(true);
      expect(q.state.fightsWon).toBeGreaterThanOrEqual(0);
      expect(q.state.fightsWon).toBeLessThanOrEqual(1e6);
    }
    expect(withSave({ fightsWon: 1.5 }).state.fightsWon).toBe(1);
    expect(withSave({ fightsWon: 1e12 }).state.fightsWon).toBe(1e6);
    for (const junk of ['x', 5, null, [1, 'pin', 'pin', 'nope', null], {}]) {
      const q = withSave({ fightMoves: junk, fightsWon: 0 });
      for (const m of q.state.fightMoves) expect(['rearUpSwat', 'leapScratch', 'pin', 'rollingTumble']).toContain(m);
      expect(new Set(q.state.fightMoves).size).toBe(q.state.fightMoves.length);
    }
    expect(withSave({ fightMoves: [1, 'pin', 'pin', 'nope'], fightsWon: 0 }).state.fightMoves).toEqual(['pin']);
    expect(withSave({ scars: 'x', scarredIntruders: 'y' }).state.scars).toEqual({});
    expect(withSave({ scars: [1], scarredIntruders: { a: 1 } }).state.scarredIntruders).toEqual([]);
  });
  it('custom-id scars survive only when the custom cat exists', () => {
    const p = withSave({ customCats: [{ id: 'mine1', name: 'Ember', personality: 'pouncer', look }], scars: { mine1: [{ site: 'face', left: 2 }], mine2: [{ site: 'face', left: 2 }] } });
    expect(Object.keys(p.state.scars)).toEqual(['mine1']);
  });
  it('an older save without the keys gets fightsWon from feats.intruder and empty scars', () => {
    const s = base();
    delete s.fightsWon; delete s.fightMoves; delete s.scars; delete s.scarredIntruders;
    s.feats = { intruder: 4 };
    const p = createProgression(mem({ [KEY]: JSON.stringify(s) }));
    expect(p.state.fightsWon).toBe(4);
    expect(p.state.fightMoves).toEqual(['rearUpSwat']);
    expect(p.state.scars).toEqual({});
    expect(p.state.scarredIntruders).toEqual([]);
    expect(p.takeNewMoves()).toEqual(['rearUpSwat']);
    expect(p.takeNewMoves()).toEqual([]);
    expect(unlockToast('rearUpSwat')).toContain('Rear-up Swat');
    const none = base(); delete none.fightsWon; delete none.feats;
    expect(createProgression(mem({ [KEY]: JSON.stringify(none) })).state.fightsWon).toBe(0);
  });
  it('moves granted on load are saved once they are taken, so the toast never repeats on the next load (final review 1)', () => {
    const s = base();
    delete s.fightsWon; delete s.fightMoves;
    s.feats = { intruder: 4 };
    const store = mem({ [KEY]: JSON.stringify(s) });
    const p = createProgression(store);
    expect(p.takeNewMoves()).toEqual(['rearUpSwat']);
    expect(JSON.parse(store.getItem(KEY)).fightMoves).toEqual(['rearUpSwat']);
    expect(createProgression(store).takeNewMoves()).toEqual([]);
  });
  it('taking no new moves writes nothing', () => {
    const writes = [];
    const store = mem({ [KEY]: JSON.stringify({ ...base(), fightsWon: 4, fightMoves: ['rearUpSwat'] }) });
    const p = createProgression({ getItem: store.getItem, setItem: (k, v) => { writes.push(k); store.setItem(k, v); } });
    const before = writes.length;
    expect(p.takeNewMoves()).toEqual([]);
    expect(writes.length).toBe(before);
  });
  it('a save that already has the moves queues nothing', () => {
    const p = withSave({ fightsWon: 4, fightMoves: ['rearUpSwat'] });
    expect(p.takeNewMoves()).toEqual([]);
  });
  it('cloud load keeps the larger fightsWon and every move', () => {
    const p = withSave({ fightsWon: 8, fightMoves: ['rearUpSwat', 'leapScratch'] });
    p.takeNewMoves();
    p.replaceFromPayload({ ...base(), fightsWon: 2, fightMoves: [] });
    expect(p.state.fightsWon).toBe(8);
    expect(p.state.fightMoves).toEqual(['rearUpSwat', 'leapScratch']);
    expect(p.takeNewMoves()).toEqual([]);
    p.replaceFromPayload({ ...base(), fightsWon: 20, fightMoves: ['pin'] });
    expect(p.state.fightsWon).toBe(20);
    expect(p.ownedMoves()).toEqual(['rearUpSwat', 'leapScratch', 'pin', 'rollingTumble']);
    // a payload without the keys
    const old = base(); delete old.fightsWon; delete old.fightMoves; delete old.scars; delete old.scarredIntruders;
    p.replaceFromPayload(old);
    expect(p.state.fightsWon).toBe(20);
    expect(p.ownedMoves()).toHaveLength(4);
    expect(JSON.parse(JSON.stringify(p.state)).version).toBe(4);
  });
});
