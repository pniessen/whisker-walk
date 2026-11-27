import { describe, it, expect, afterEach } from 'vitest';
import {
  HOLIDAY_IDS, HANUKKAH_FIRST_NIGHT, HANUKKAH_FALLBACK, TABLE_YEARS_AHEAD, holidayWindow, holidayOn, shelfOpen, activeHolidays,
  holidayYear, nightOf, parseOverride, setHolidayOverride, currentOverride, hanukkahInTable,
} from '../src/holidays.js';

const d = (y, m, day, h = 12) => new Date(y, m - 1, day, h, 0, 0);
const NONE = { holiday: null, night: null };
const on = (id, now) => holidayOn(id, now, { override: NONE });
const shelf = (id, now) => shelfOpen(id, now, { override: NONE });
const night = (now) => nightOf(now, { override: NONE });

afterEach(() => setHolidayOverride(null));

describe('holidays: the windows', () => {
  it('Christmas is 1 to 26 Dec, edges included', () => {
    expect(on('christmas', d(2026, 11, 30, 23))).toBe(false);
    expect(on('christmas', d(2026, 12, 1, 0))).toBe(true);
    expect(on('christmas', d(2026, 12, 26, 23))).toBe(true);
    expect(on('christmas', d(2026, 12, 27, 0))).toBe(false);
  });
  it('Winter Lights spans New Year: 1 Dec to 6 Jan', () => {
    expect(on('winter', d(2026, 12, 31, 23))).toBe(true);
    expect(on('winter', d(2027, 1, 1, 0))).toBe(true);
    expect(on('winter', d(2027, 1, 6, 23))).toBe(true);
    expect(on('winter', d(2027, 1, 7, 0))).toBe(false);
    expect(on('winter', d(2026, 11, 30))).toBe(false);
  });
  it('Hanukkah 2026 is Fri 4 Dec through Sat 12 Dec', () => {
    expect(on('hanukkah', d(2026, 12, 3, 23))).toBe(false);
    expect(on('hanukkah', d(2026, 12, 4, 0))).toBe(true);
    expect(on('hanukkah', d(2026, 12, 12, 23))).toBe(true);
    expect(on('hanukkah', d(2026, 12, 13, 0))).toBe(false);
  });
  it('2027 crosses New Year: 24 Dec to 1 Jan 2028, found from either side of 1 Jan', () => {
    expect(on('hanukkah', d(2027, 12, 31))).toBe(true);
    expect(on('hanukkah', d(2028, 1, 1, 23))).toBe(true);
    expect(on('hanukkah', d(2028, 1, 2, 0))).toBe(false);
    expect(holidayYear('hanukkah', d(2028, 1, 1), { override: NONE })).toBe(2027);
  });
  it('the shelf opens a week early and closes with the window', () => {
    expect(shelf('hanukkah', d(2026, 11, 26))).toBe(false);
    expect(shelf('hanukkah', d(2026, 11, 27, 0))).toBe(true);
    expect(on('hanukkah', d(2026, 11, 27))).toBe(false); // the window itself has not opened
    expect(shelf('hanukkah', d(2026, 12, 13))).toBe(false);
    expect(shelf('christmas', d(2026, 11, 24, 0))).toBe(true);
    expect(shelf('christmas', d(2026, 11, 23, 23))).toBe(false);
    expect(shelf('winter', d(2026, 7, 4))).toBe(false);
  });
  it('days overlap: 5 Dec 2026 has all three on', () => {
    expect(activeHolidays(d(2026, 12, 5), { override: NONE })).toEqual(['winter', 'christmas', 'hanukkah']);
    expect(activeHolidays(d(2026, 7, 5), { override: NONE })).toEqual([]);
  });
  it('a bad id or a bad clock is never on', () => {
    expect(on('easter', d(2026, 12, 5))).toBe(false);
    expect(on('christmas', new Date('nope'))).toBe(false);
    expect(on('christmas', NaN)).toBe(false);
    expect(nightOf(NaN, { override: NONE })).toBe(0);
    expect(holidayWindow('easter', 2026)).toBe(null);
  });
  it('daylight-saving changes do not move a window edge', () => {
    // the US spring-forward and fall-back weekends sit far from these windows, but a window's edge is built from the calendar date, not 24 h sums
    for (const y of [2026, 2027, 2028, 2029, 2030]) {
      const w = holidayWindow('hanukkah', y);
      expect(new Date(w.from).getHours()).toBe(0);
      expect(new Date(w.to).getHours()).toBe(0);
    }
  });
});

describe('holidays: tonight\'s candle (nightOf)', () => {
  it('counts by the local date for the whole day: 1 on 4 Dec 2026, 8 on 11 and 12 Dec', () => {
    expect(night(d(2026, 12, 3))).toBe(0);
    expect(night(d(2026, 12, 4, 0))).toBe(1);
    expect(night(d(2026, 12, 4, 23))).toBe(1);
    expect(night(d(2026, 12, 6, 13))).toBe(3);
    expect(night(d(2026, 12, 11))).toBe(8);
    expect(night(d(2026, 12, 12, 22))).toBe(8);
    expect(night(d(2026, 12, 13))).toBe(0);
  });
  it('the week before shows no candle', () => {
    expect(night(d(2026, 11, 29))).toBe(0);
  });
  it('2027 counts across 1 Jan 2028: night 8 on 31 Dec and 1 Jan', () => {
    expect(night(d(2027, 12, 24))).toBe(1);
    expect(night(d(2027, 12, 31))).toBe(8);
    expect(night(d(2028, 1, 1))).toBe(8);
  });
  it('is 0 in the middle of summer', () => { expect(night(d(2026, 7, 4))).toBe(0); });
});

describe('holidays: the table', () => {
  it('has every year from this clock\'s year to at least +8 (refresh it in an ordinary release)', () => {
    const y = new Date().getFullYear();
    for (let k = 0; k <= TABLE_YEARS_AHEAD; k++) expect(hanukkahInTable(y + k), `Hanukkah ${y + k}`).toBe(true);
  });
  it('2026 to 2030 are the spec\'s list; no row is a bad date', () => {
    expect(HANUKKAH_FIRST_NIGHT[2026]).toEqual([12, 4]);
    expect(HANUKKAH_FIRST_NIGHT[2027]).toEqual([12, 24]);
    expect(HANUKKAH_FIRST_NIGHT[2028]).toEqual([12, 12]);
    expect(HANUKKAH_FIRST_NIGHT[2029]).toEqual([12, 1]);
    expect(HANUKKAH_FIRST_NIGHT[2030]).toEqual([12, 20]);
    for (const [y, [m, day]] of Object.entries(HANUKKAH_FIRST_NIGHT)) {
      const t = new Date(Number(y), m - 1, day);
      expect(t.getMonth()).toBe(m - 1);
      expect([11, 12]).toContain(m);
    }
  });
  it('last days: Sat 12 Dec 2026 and Sat 1 Jan 2028', () => {
    expect(new Date(holidayWindow('hanukkah', 2026).to - 1).getDay()).toBe(6);
    expect(new Date(holidayWindow('hanukkah', 2027).to - 1).getDay()).toBe(6);
    expect(new Date(holidayWindow('hanukkah', 2027).to - 1).getDate()).toBe(1);
  });
  it('outside the table the window is the fixed fortnight from 5 Dec', () => {
    expect(hanukkahInTable(2040)).toBe(false);
    expect(on('hanukkah', d(2040, 12, 4))).toBe(false);
    expect(on('hanukkah', d(2040, 12, 5))).toBe(true);
    expect(on('hanukkah', d(2040, 12, 18, 23))).toBe(true);
    expect(on('hanukkah', d(2040, 12, 19))).toBe(false);
    expect(night(d(2040, 12, 5))).toBe(1);
    expect(HANUKKAH_FALLBACK.days).toBe(14);
  });
});

describe('holidays: the override', () => {
  it('parses ?holiday= and &night=, drops anything else', () => {
    expect(parseOverride('?holiday=hanukkah&night=3')).toEqual({ holiday: 'hanukkah', night: 3 });
    expect(parseOverride('?holiday=winter')).toEqual({ holiday: 'winter', night: null });
    expect(parseOverride('?holiday=off')).toEqual({ holiday: 'off', night: null });
    expect(parseOverride('?holiday=christmas&night=3')).toEqual({ holiday: 'christmas', night: null });
    expect(parseOverride('?holiday=hanukkah&night=9')).toEqual({ holiday: 'hanukkah', night: null });
    expect(parseOverride('?holiday=easter')).toEqual(NONE);
    expect(parseOverride('?night=3')).toEqual(NONE);
    expect(parseOverride(undefined)).toEqual(NONE);
    expect(parseOverride(7)).toEqual(NONE);
  });
  it('a pinned holiday is on any day and the others are off; off is all off', () => {
    const summer = d(2026, 7, 4);
    expect(holidayOn('winter', summer, { override: { holiday: 'winter', night: null } })).toBe(true);
    expect(holidayOn('christmas', summer, { override: { holiday: 'winter', night: null } })).toBe(false);
    expect(holidayOn('christmas', d(2026, 12, 5), { override: { holiday: 'off', night: null } })).toBe(false);
    expect(shelfOpen('christmas', d(2026, 12, 5), { override: { holiday: 'off', night: null } })).toBe(false);
    expect(nightOf(summer, { override: { holiday: 'hanukkah', night: 3 } })).toBe(3);
    expect(nightOf(summer, { override: { holiday: 'winter', night: null } })).toBe(0);
  });
  it('setHolidayOverride is what the clock-free callers read', () => {
    expect(currentOverride()).toEqual(NONE);
    setHolidayOverride({ holiday: 'christmas' });
    expect(holidayOn('christmas', d(2026, 7, 4))).toBe(true);
    setHolidayOverride(null);
    expect(holidayOn('christmas', d(2026, 7, 4))).toBe(false);
  });
  it('ids', () => { expect(HOLIDAY_IDS).toEqual(['winter', 'christmas', 'hanukkah']); });
});
