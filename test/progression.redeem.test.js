import { describe, it, expect, beforeEach } from 'vitest';
import { createProgression, CATALOG, REDEEMED_MAX } from '../src/progression.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    dump: () => Object.fromEntries(map),
  };
}
const hex = (n) => n.toString(16).padStart(64, '0');
const H = hex(0xabc);
const KEY = 'whisker-walk-save';
const clone = (o) => JSON.parse(JSON.stringify(o));

describe('redeemCode', () => {
  let storage, p;
  beforeEach(() => {
    storage = fakeStorage();
    p = createProgression(storage);
  });

  it('fresh save has an empty redeemed list and stays version 4', () => {
    expect(p.state.redeemed).toEqual([]);
    expect(p.state.version).toBe(4);
  });

  it('pays points to points only and unlocks without equipping', () => {
    const r = p.redeemCode(H, { points: 50, accessories: ['wizard'], cats: ['hagrid'] });
    expect(r.ok).toBe(true);
    expect(r.points).toBe(50);
    expect(r.items).toEqual([
      { kind: 'cats', id: 'hagrid', name: CATALOG.cats.hagrid.name, owned: false, refund: 0 },
      { kind: 'accessories', id: 'wizard', name: CATALOG.accessories.wizard.name, owned: false, refund: 0 },
    ]);
    expect(p.state.points).toBe(50);
    expect(p.state.lifetimePoints).toBe(0);
    expect(p.state.unlocked.cats).toContain('hagrid');
    expect(p.state.unlocked.accessories).toContain('wizard');
    expect(p.state.equipped.cat).toBe('tabby');
    expect(p.state.equipped.head).toBe(null);
    expect(p.state.redeemed).toContain(H);
  });

  it('refuses a second use', () => {
    p.redeemCode(H, { points: 50 });
    expect(p.redeemCode(H, { points: 50 })).toEqual({ ok: false, reason: 'used' });
    expect(p.state.points).toBe(50);
  });

  it('refunds owned items at catalog price without duplicating', () => {
    const r = p.redeemCode(H, { accessories: ['bell'], cats: ['tabby'] });
    expect(r.items.map((i) => [i.id, i.owned, i.refund])).toEqual([['tabby', true, 0], ['bell', true, 20]]);
    expect(r.points).toBe(20);
    expect(p.state.points).toBe(20);
    expect(p.state.lifetimePoints).toBe(0);
    expect(p.state.unlocked.accessories.filter((x) => x === 'bell')).toHaveLength(1);
    expect(p.state.unlocked.cats.filter((x) => x === 'tabby')).toHaveLength(1);
  });

  it('skips unknown ids and duplicates; unknown-only still counts as used', () => {
    const r = p.redeemCode(H, { cats: ['nope', 'hagrid', 'hagrid'], accessories: ['nope'] });
    expect(r.items.map((i) => i.id)).toEqual(['hagrid']);
    const H2 = hex(2);
    expect(p.redeemCode(H2, { cats: ['nope'] })).toEqual({ ok: true, items: [], points: 0 });
    expect(p.state.redeemed).toContain(H2);
  });

  it('ignores bad points and non-array lists', () => {
    [-5, NaN, '50', null, undefined].forEach((pts, i) => {
      const r = p.redeemCode(hex(100 + i), { points: pts, cats: 'hagrid', accessories: {} });
      expect(r).toEqual({ ok: true, items: [], points: 0 });
    });
    expect(p.state.points).toBe(0);
  });

  it('rejects a non-hex hash', () => {
    expect(p.redeemCode('not-hex', { points: 5 })).toEqual({ ok: false, reason: 'bad-hash' });
    expect(p.redeemCode(H.toUpperCase(), { points: 5 })).toEqual({ ok: false, reason: 'bad-hash' });
    expect(p.redeemCode(undefined, { points: 5 })).toEqual({ ok: false, reason: 'bad-hash' });
    expect(p.state.points).toBe(0);
  });

  it('persists, and a replaced save without the hash can redeem again', () => {
    p.redeemCode(H, { points: 10 });
    const p2 = createProgression(storage);
    expect(p2.redeemCode(H, { points: 10 })).toEqual({ ok: false, reason: 'used' });
    p2.replaceFromPayload({ ...clone(p2.state), redeemed: [], points: 0 });
    expect(p2.redeemCode(H, { points: 10 }).ok).toBe(true);
  });

  it('sanitises a hostile redeemed field on load', () => {
    const base = clone(p.state);
    for (const [bad, want] of [
      ['x', []],
      [[1, '__proto__', 'A'.repeat(64), H, H], [H]],
    ]) {
      const q = createProgression(fakeStorage({ [KEY]: JSON.stringify({ ...base, redeemed: bad }) }));
      expect(q.state.redeemed).toEqual(want);
    }
  });

  it('sanitiser keeps the newest 500, and redeemCode caps on write', () => {
    expect(REDEEMED_MAX).toBe(500);
    const base = clone(p.state);
    const many = Array.from({ length: 600 }, (_, i) => hex(i + 1));
    const q = createProgression(fakeStorage({ [KEY]: JSON.stringify({ ...base, redeemed: many }) }));
    expect(q.state.redeemed).toHaveLength(500);
    expect(q.state.redeemed[0]).toBe(hex(101));
    expect(q.state.redeemed[499]).toBe(hex(600));
    q.redeemCode(hex(9999), {});
    expect(q.state.redeemed).toHaveLength(500);
    expect(q.state.redeemed[0]).toBe(hex(102));
    expect(q.state.redeemed[499]).toBe(hex(9999));
  });
});

describe('redeemCode areas', () => {
  it('unlocks an area outright, skipping its walk and price gates, without equipping it', () => {
    const p = createProgression(fakeStorage());
    expect(p.isUnlocked('areas', 'docks')).toBe(false);
    const r = p.redeemCode(hex(0xd0c), { points: 0, areas: ['docks'] });
    expect(r.ok).toBe(true);
    expect(p.isUnlocked('areas', 'docks')).toBe(true);
    expect(p.state.area).not.toBe('docks');
    expect(r.items).toEqual([{ kind: 'areas', id: 'docks', name: CATALOG.areas.docks.name, owned: false, refund: 0 }]);
    p.setArea('docks');
    expect(p.state.area).toBe('docks');
  });

  it('refunds an area already owned, and skips unknown area ids', () => {
    const p = createProgression(fakeStorage());
    const r = p.redeemCode(hex(0xd0d), { areas: ['neighborhood', 'moon-base'] });
    expect(r.items).toEqual([{ kind: 'areas', id: 'neighborhood', name: CATALOG.areas.neighborhood.name, owned: true, refund: CATALOG.areas.neighborhood.price }]);
  });

  it('an unlocked area survives a reload', () => {
    const storage = fakeStorage();
    createProgression(storage).redeemCode(hex(0xd0e), { areas: ['docks'] });
    expect(createProgression(storage).isUnlocked('areas', 'docks')).toBe(true);
  });
});
