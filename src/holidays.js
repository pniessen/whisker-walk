// The holiday calendar (docs/superpowers/specs/2026-11-27-holiday-merch-design.md, D1, D2, D13, D21).
// Pure and DOM-free: the clock is passed in, never read except by the two
// tiny helpers at the bottom (the address-bar override). Dates are the local
// calendar's, so a window opens at the device's midnight; a wrong device clock
// only moves a window, nothing is lost.
//
// Three holidays, each with equal care:
//   winter    Winter Lights, the shared umbrella: 1 Dec to 6 Jan (spans New Year)
//   christmas 1 Dec to 26 Dec
//   hanukkah  the first night's date through eight days later (a table, below)
// A shop SHELF is open for a window and the week before (SHELF_LEAD_DAYS), so
// a family can see it coming; the earned pieces, the decor and the greeting
// use the window alone.

export const HOLIDAY_IDS = Object.freeze(['winter', 'christmas', 'hanukkah']);
export const SHELF_LEAD_DAYS = 7;
// Hanukkah is eight nights; its window is the first night's date and eight days after.
export const HANUKKAH_NIGHTS = 8;
const HANUKKAH_SPAN_DAYS = 9; // first night's date .. first night + 8 days, inclusive

// The calendar date (in the family's own calendar) of the EVENING the first
// candle is lit, [month, day], by year. A table, never a calculation: the
// Hebrew calendar is not worth shipping code for, and Intl's Hebrew calendar
// differs by device and cannot be trusted offline.
// Checked against Hebcal for every row, 2026 to 2035 (2026-11-27).
export const HANUKKAH_FIRST_NIGHT = Object.freeze({
  2026: Object.freeze([12, 4]),  // Fri; last day Sat 12 Dec
  2027: Object.freeze([12, 24]), // Fri; last day Sat 1 Jan 2028
  2028: Object.freeze([12, 12]), // Tue; last day Wed 20 Dec
  2029: Object.freeze([12, 1]),  // Sat; last day Sun 9 Dec
  2030: Object.freeze([12, 20]), // Fri; last day Sat 28 Dec
  2031: Object.freeze([12, 9]),  // Tue
  2032: Object.freeze([11, 27]), // Sat (before Winter Lights opens)
  2033: Object.freeze([12, 16]), // Fri
  2034: Object.freeze([12, 6]),  // Wed
  2035: Object.freeze([12, 25]), // Tue
});
// Outside the table (before it or after it) the window is one fixed fortnight from 5 Dec.
export const HANUKKAH_FALLBACK = Object.freeze({ month: 12, day: 5, days: 14 });
// The table must reach this many years past the one the clock is in (a test holds the owner to it).
export const TABLE_YEARS_AHEAD = 8;

const DAY = 24 * 60 * 60 * 1000;

// Local midnight at the start of the calendar day y/m(1-12)/d; d may run over the month (Date rolls it).
const at = (y, m, d) => new Date(y, m - 1, d, 0, 0, 0, 0).getTime();

function asTime(now) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(t) ? t : NaN;
}

// The window a holiday opens in calendar year `y`: [from, to) in ms, `to` the
// first moment after its last day (local midnight), or null for an unknown id.
export function holidayWindow(id, y) {
  if (id === 'winter') return { from: at(y, 12, 1), to: at(y + 1, 1, 7) };
  if (id === 'christmas') return { from: at(y, 12, 1), to: at(y, 12, 27) };
  if (id === 'hanukkah') {
    const row = HANUKKAH_FIRST_NIGHT[y];
    if (row) return { from: at(y, row[0], row[1]), to: at(y, row[0], row[1] + HANUKKAH_SPAN_DAYS) };
    const f = HANUKKAH_FALLBACK;
    return { from: at(y, f.month, f.day), to: at(y, f.month, f.day + f.days) };
  }
  return null;
}

// The first night's [year, month, day] for a calendar year (the table, or the fallback's start).
export function hanukkahFirstNight(y) {
  const row = HANUKKAH_FIRST_NIGHT[y];
  return row ? [y, row[0], row[1]] : [y, HANUKKAH_FALLBACK.month, HANUKKAH_FALLBACK.day];
}
export const hanukkahInTable = (y) => Object.hasOwn(HANUKKAH_FIRST_NIGHT, y);

// ---- the override (testing and the owner): ?holiday=winter|christmas|hanukkah|off and &night=1..8 ----

const NO_OVERRIDE = Object.freeze({ holiday: null, night: null });

// parseOverride('?holiday=hanukkah&night=3') -> { holiday: 'hanukkah', night: 3 }.
// An unknown value is no override at all; a night is only kept with hanukkah.
export function parseOverride(search) {
  if (typeof search !== 'string') return NO_OVERRIDE;
  let q;
  try { q = new URLSearchParams(search); } catch { return NO_OVERRIDE; }
  const h = q.get('holiday');
  const holiday = h === 'off' || HOLIDAY_IDS.includes(h) ? h : null;
  const n = Number(q.get('night'));
  const night = holiday === 'hanukkah' && Number.isInteger(n) && n >= 1 && n <= HANUKKAH_NIGHTS ? n : null;
  return holiday ? { holiday, night } : NO_OVERRIDE;
}

let forced; // a test's override (an object), or undefined for "read the address"
export function setHolidayOverride(o) { forced = o === null || o === undefined ? undefined : { holiday: o.holiday ?? null, night: o.night ?? null }; }
export function currentOverride() {
  if (forced !== undefined) return forced;
  try { return parseOverride(globalThis.location?.search); } catch { return NO_OVERRIDE; }
}

// ---- the questions ----

// Is `id` in its window at `now`? `lead` extra days before the window count too (a shelf).
// With an override: 'off' is never; a pinned holiday is always (the others are off).
export function holidayOn(id, now = new Date(), { lead = 0, override = currentOverride() } = {}) {
  if (!HOLIDAY_IDS.includes(id)) return false;
  if (override?.holiday) return override.holiday === id;
  const t = asTime(now);
  if (Number.isNaN(t)) return false;
  const y = new Date(t).getFullYear();
  for (const year of [y - 1, y, y + 1]) {
    const w = holidayWindow(id, year);
    const from = new Date(w.from); from.setDate(from.getDate() - lead);
    if (t >= from.getTime() && t < w.to) return true;
  }
  return false;
}

// The shop shelf for a holiday: its window and the week before.
export const shelfOpen = (id, now = new Date(), opts = {}) => holidayOn(id, now, { ...opts, lead: SHELF_LEAD_DAYS });

// Every holiday in its window now, in HOLIDAY_IDS' order.
export function activeHolidays(now = new Date(), opts = {}) {
  return HOLIDAY_IDS.filter((id) => holidayOn(id, now, opts));
}

// The calendar year a holiday window now open began in (the key of a save's `holidays` record), or null when it is not open.
// A pinned override answers with the clock's own year.
export function holidayYear(id, now = new Date(), { override = currentOverride() } = {}) {
  const t = asTime(now);
  if (Number.isNaN(t) || !HOLIDAY_IDS.includes(id)) return null;
  const y = new Date(t).getFullYear();
  if (override?.holiday) return override.holiday === id ? y : null;
  for (const year of [y - 1, y]) {
    const w = holidayWindow(id, year);
    if (t >= w.from && t < w.to) return year;
  }
  return null;
}

// Tonight's candle count, 1 to 8, counted by the local date for the whole day (the first night's date is night 1, a missed night
// simply shows more candles the next day); the last day shows 8. 0 outside the window (the week before shows none).
export function nightOf(now = new Date(), { override = currentOverride() } = {}) {
  if (override?.holiday === 'hanukkah') return override.night ?? 1;
  if (override?.holiday) return 0;
  const t = asTime(now);
  if (Number.isNaN(t)) return 0;
  const y = new Date(t).getFullYear();
  for (const year of [y - 1, y]) {
    const w = holidayWindow('hanukkah', year);
    if (t >= w.from && t < w.to) {
      const days = Math.round((at(new Date(t).getFullYear(), new Date(t).getMonth() + 1, new Date(t).getDate()) - w.from) / DAY);
      return Math.min(HANUKKAH_NIGHTS, Math.max(1, days + 1));
    }
  }
  return 0;
}
