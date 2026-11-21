// Gift events (the birthday, 2026-11-21): the event window, the save's
// `events` field, progression.hasEvent, and what the two birthday codes give.
// The real codes are never here: a code is hashed only from TEST_CODE below,
// and the codes' rewards are taken from the table by their labels.
import { describe, it, expect, beforeEach } from 'vitest';
import { createProgression, CATALOG } from '../src/progression.js';
import { BIRTHDAY_EVENT, eventWindowOpen, sanitizeEvents, eventWear, localDay, EVENTS_MAX } from '../src/giftevents.js';
import { REDEEM_CODES } from '../src/redeemcodes.js';
import { createRedeemer, normalizeCode, hashCode, redeemMessage } from '../src/redeem.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
const KEY = 'whisker-walk-save';
const H = 'ab'.repeat(32);
const H2 = 'cd'.repeat(32);
const BDAY_WEAR = ['partyhat', 'bdayrosette', 'bdayballoon', 'cakecharm'];
const TEST_CODE = 'TEST-ONLY-CAKE-2Z9Q';

describe('the event window', () => {
  it('is open on the day and the next, to midnight local time', () => {
    expect(eventWindowOpen(BIRTHDAY_EVENT, new Date(2026, 10, 21, 9, 0))).toBe(true);
    expect(eventWindowOpen(BIRTHDAY_EVENT, new Date(2026, 10, 22, 23, 59, 59))).toBe(true);
    expect(eventWindowOpen(BIRTHDAY_EVENT, new Date(2026, 10, 23, 0, 0, 0))).toBe(false);
    expect(eventWindowOpen(BIRTHDAY_EVENT, new Date(2027, 0, 1))).toBe(false);
  });
  it('is shut for an unknown id or a bad clock', () => {
    expect(eventWindowOpen('bday-1999-01-01', new Date(2026, 10, 21))).toBe(false);
    expect(eventWindowOpen('__proto__', new Date(2026, 10, 21))).toBe(false);
    expect(eventWindowOpen(BIRTHDAY_EVENT, NaN)).toBe(false);
  });
  it('a local day key', () => {
    expect(localDay(new Date(2026, 10, 21, 23, 30))).toBe('2026-11-21');
    expect(localDay(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });
  it('sanitizeEvents keeps known ids once each', () => {
    expect(sanitizeEvents([BIRTHDAY_EVENT, 'nope', 7, BIRTHDAY_EVENT, '__proto__'])).toEqual([BIRTHDAY_EVENT]);
    expect(sanitizeEvents('x')).toEqual([]);
    expect(sanitizeEvents(Array(EVENTS_MAX * 3).fill(BIRTHDAY_EVENT))).toEqual([BIRTHDAY_EVENT]);
    expect(eventWear(BIRTHDAY_EVENT)).toEqual(BDAY_WEAR);
    expect(eventWear('nope')).toEqual([]);
  });
});

describe('the save keeps events, and hasEvent reads them', () => {
  let storage, p;
  beforeEach(() => { storage = fakeStorage(); p = createProgression(storage); });

  it('a fresh save has none', () => {
    expect(p.state.events).toEqual([]);
    expect(p.hasEvent(BIRTHDAY_EVENT)).toBe(false);
    expect(p.hasEvent('__proto__')).toBe(false);
    expect(p.hasEvent(undefined)).toBe(false);
  });

  it('an older save with no events field loads with none, and keeps the rest', () => {
    const q = createProgression(fakeStorage({ [KEY]: JSON.stringify({ ...p.state, points: 12, events: undefined }) }));
    expect(q.state.events).toEqual([]);
    expect(q.state.points).toBe(12);
  });

  it('junk in events is dropped on load', () => {
    const q = createProgression(fakeStorage({ [KEY]: JSON.stringify({ ...p.state, events: ['x', BIRTHDAY_EVENT, { a: 1 }] }) }));
    expect(q.state.events).toEqual([BIRTHDAY_EVENT]);
    expect(q.hasEvent(BIRTHDAY_EVENT)).toBe(true);
  });

  it('a code with an event adds it once and says so', () => {
    const r = p.redeemCode(H, { points: 0, accessories: [], cats: [], events: [BIRTHDAY_EVENT, 'nope'] });
    expect(r.ok).toBe(true);
    expect(r.events).toEqual([BIRTHDAY_EVENT]);
    expect(p.hasEvent(BIRTHDAY_EVENT)).toBe(true);
    p.redeemCode(H2, { events: [BIRTHDAY_EVENT] });
    expect(p.state.events).toEqual([BIRTHDAY_EVENT]);
    // it survives a reload
    expect(createProgression(storage).hasEvent(BIRTHDAY_EVENT)).toBe(true);
  });

  it('a code with no event leaves events alone; confetti is passed back, never kept', () => {
    const r = p.redeemCode(H, { points: 0, accessories: ['partyhat'], cats: [], confetti: true });
    expect(r.events).toBeUndefined();
    expect(r.confetti).toBe(true);
    expect(p.state.events).toEqual([]);
    expect(JSON.stringify(p.state)).not.toMatch(/confetti/);
    expect(p.redeemCode(H2, { points: 5 }).confetti).toBeUndefined();
  });

  it('the birthday outfits are code-only: a code unlocks them, the shop never sells them', () => {
    for (const id of BDAY_WEAR) {
      expect(CATALOG.accessories[id].code).toBe(true);
      expect(p.canBuy('accessories', id)).toBe(false);
    }
    const r = p.redeemCode(H, { points: 0, accessories: BDAY_WEAR, cats: [] });
    expect(r.items.map((it) => it.id)).toEqual(BDAY_WEAR);
    for (const id of BDAY_WEAR) expect(p.isUnlocked('accessories', id)).toBe(true);
  });

  it('a save with the birthday owns its outfits, even if the list lost them', () => {
    const q = createProgression(fakeStorage({ [KEY]: JSON.stringify({ ...p.state, events: [BIRTHDAY_EVENT] }) }));
    for (const id of BDAY_WEAR) expect(q.isUnlocked('accessories', id)).toBe(true);
  });

  it('a cloud load keeps this device\'s events', () => {
    p.redeemCode(H, { events: [BIRTHDAY_EVENT] });
    const older = JSON.parse(JSON.stringify(p.state));
    delete older.events;
    p.replaceFromPayload(older);
    expect(p.hasEvent(BIRTHDAY_EVENT)).toBe(true);
  });
});

describe('the two birthday codes', () => {
  const byLabel = (label) => Object.values(REDEEM_CODES).filter((e) => e.label === label);
  const her = byLabel('Birthday 2026-11 (her)');
  const brother = byLabel('Birthday 2026-11 (brother)');

  it('each is in the table once', () => {
    expect(her).toHaveLength(1);
    expect(brother).toHaveLength(1);
  });

  it('hers: the birthday, 50 paw points and the four outfits', () => {
    expect(her[0].events).toEqual([BIRTHDAY_EVENT]);
    expect(her[0].points).toBe(50);
    expect([...her[0].accessories].sort()).toEqual([...BDAY_WEAR].sort());
    expect(her[0].confetti).toBeFalsy();
  });

  it('his: the party hat and a confetti burst, no event', () => {
    expect(brother[0].accessories).toEqual(['partyhat']);
    expect(brother[0].confetti).toBe(true);
    expect(brother[0].events ?? []).toEqual([]);
    expect(brother[0].points ?? 0).toBe(0);
  });

  it('through the redeemer: her reward opens the party, his only the confetti', async () => {
    const hash = await hashCode(normalizeCode(TEST_CODE));
    const codes = { [hash]: her[0] };
    const p = createProgression(fakeStorage());
    const r = await createRedeemer({ progression: p, codes, storage: fakeStorage() }).redeem(TEST_CODE.toLowerCase());
    expect(r.kind).toBe('gift');
    expect(r.events).toEqual([BIRTHDAY_EVENT]);
    expect(r.points).toBe(50);
    expect(p.hasEvent(BIRTHDAY_EVENT)).toBe(true);
    expect(p.state.points).toBe(50);
    const msg = redeemMessage(r, CATALOG);
    expect(msg).toMatch(/50 🐾/);
    for (const id of BDAY_WEAR) expect(msg).toContain(CATALOG.accessories[id].name);

    const q = createProgression(fakeStorage());
    const s = await createRedeemer({ progression: q, codes: { [hash]: brother[0] }, storage: fakeStorage() }).redeem(TEST_CODE);
    expect(s.kind).toBe('gift');
    expect(s.confetti).toBe(true);
    expect(s.events).toEqual([]);
    expect(q.hasEvent(BIRTHDAY_EVENT)).toBe(false);
    expect(q.isUnlocked('accessories', 'partyhat')).toBe(true);
    expect(redeemMessage(s, CATALOG)).toMatch(/Party time! 🎉/);
  });

  it('labels hold no code and no name', () => {
    for (const e of [...her, ...brother]) expect(e.label).toMatch(/^Birthday 2026-11 \((her|brother)\)$/);
  });
});
