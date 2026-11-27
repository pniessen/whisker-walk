// H1: the holiday save field, the shelf rule and the merge (src/foundwear/holidaywear.js). The pieces themselves arrive with H2 and H3,
// so the table logic is checked here with a made-up table and the plumbing with the real (still empty) one.
import { describe, it, expect } from 'vitest';
import {
  HOLIDAY_WEAR, HOLIDAY_CATALOG, sanitizeHolidays, mergeHolidays, holidayPiecesOwned, withHolidayBit, holidayPrizeIds, holidayKey, parseHolidayKey,
  shelfShows, HOLIDAYS_MAX,
} from '../src/foundwear/holidaywear.js';
import { sanitizeSave, CATALOG } from '../src/progression.js';
import { mergeSaves, useSaveTools } from '../src/catmerge.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';

const TABLE = [
  { id: 'aaa', holiday: 'winter', bit: 0 }, { id: 'bbb', holiday: 'winter', bit: 2 }, { id: 'ccc', holiday: 'christmas', bit: 0 },
];

describe('holiday save field', () => {
  it('keeps valid keys, cuts masks, drops junk', () => {
    expect(sanitizeHolidays({ winter2026: 3, christmas2027: 256 + 1, hanukkah2026: 0, easter2026: 1, winter26: 1, winter2026x: 1, nope: 'x' })).toEqual({ winter2026: 3, christmas2027: 1 });
    expect(sanitizeHolidays({ winter2026: 1.5 })).toEqual({});
    expect(sanitizeHolidays({ winter2026: -1 })).toEqual({});
    expect(sanitizeHolidays(null)).toEqual({});
    expect(sanitizeHolidays([1])).toEqual({});
    expect(sanitizeHolidays({ ['__proto__']: 1 })).toEqual({});
  });
  it('is capped for a hostile payload', () => {
    const big = {};
    for (let y = 2000; y < 2100; y++) for (const h of ['winter', 'christmas', 'hanukkah']) big[`${h}${y}`] = 1;
    expect(Object.keys(sanitizeHolidays(big)).length).toBeLessThanOrEqual(HOLIDAYS_MAX);
  });
  it('keys round trip', () => {
    expect(parseHolidayKey(holidayKey('hanukkah', 2031))).toEqual({ holiday: 'hanukkah', year: 2031 });
    expect(parseHolidayKey('toString')).toBe(null);
    expect(parseHolidayKey(5)).toBe(null);
  });
  it('a bit names its holiday\'s piece, in any year', () => {
    expect(holidayPrizeIds('winter', TABLE)).toEqual(['aaa', null, 'bbb']);
    expect(holidayPiecesOwned({ winter2026: 5 }, TABLE).sort()).toEqual(['aaa', 'bbb']);
    expect(holidayPiecesOwned({ winter2026: 1, winter2028: 4, christmas2026: 1 }, TABLE).sort()).toEqual(['aaa', 'bbb', 'ccc']);
    expect(holidayPiecesOwned({ winter2026: 2 }, TABLE)).toEqual([]); // a hole in the table owns nothing
    expect(holidayPiecesOwned({ hanukkah2026: 1 }, TABLE)).toEqual([]);
  });
  it('withHolidayBit sets, never clears, and refuses nonsense', () => {
    const a = withHolidayBit({}, 'winter', 2026, 1);
    expect(a).toEqual({ winter2026: 2 });
    expect(withHolidayBit(a, 'winter', 2026, 0)).toEqual({ winter2026: 3 });
    expect(withHolidayBit(a, 'winter', 2026, 1)).toEqual({ winter2026: 2 });
    expect(withHolidayBit(a, 'easter', 2026, 0)).toEqual(a);
    expect(withHolidayBit(a, 'winter', 26, 0)).toEqual(a);
    expect(withHolidayBit(a, 'winter', 2026, 9)).toEqual(a);
  });
  it('a merge is the OR of both sides', () => {
    expect(mergeHolidays({ winter2026: 1, christmas2026: 1 }, { winter2026: 4, hanukkah2026: 1 })).toEqual({ winter2026: 5, christmas2026: 1, hanukkah2026: 1 });
  });
  it('round trips through the sanitiser and the cloud merge', () => {
    const out = sanitizeSave({ version: 4, holidays: { winter2026: 3 } });
    expect(out.holidays).toEqual({ winter2026: 3 });
    expect(sanitizeSave({ version: 4 }).holidays).toEqual({});
    useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
    const L = sanitizeSave({ version: 4, holidays: { winter2026: 1 } });
    const C = sanitizeSave({ version: 4, holidays: { winter2026: 2, christmas2026: 1 } });
    expect(mergeSaves({ local: L, cloud: C }).save.holidays).toEqual({ winter2026: 3, christmas2026: 1 });
  });
});

describe('the seasonal shelf', () => {
  const item = { season: 'christmas', price: 30, slot: 'head' };
  const dec = (d) => new Date(2026, 11, d, 12);
  it('an item with no season is always shown; a seasonal one in its week-before and window, or once owned', () => {
    expect(shelfShows({ price: 30 }, false, dec(1))).toBe(true);
    expect(shelfShows(item, false, new Date(2026, 10, 23, 12))).toBe(false);
    expect(shelfShows(item, false, new Date(2026, 10, 24, 12))).toBe(true);
    expect(shelfShows(item, false, dec(26))).toBe(true);
    expect(shelfShows(item, false, dec(27))).toBe(false);
    expect(shelfShows(item, true, new Date(2026, 6, 4))).toBe(true);
  });
  it('the catalog holds only well-formed holiday rows (none before H2)', () => {
    for (const r of HOLIDAY_WEAR) {
      const row = HOLIDAY_CATALOG[r.id];
      expect(row.holiday ? row.prize === true && row.price === 0 : typeof row.season === 'string' && row.price > 0 && row.price <= 35).toBe(true);
      expect(CATALOG.accessories[r.id]).toBe(row);
    }
  });
});
