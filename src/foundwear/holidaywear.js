// Holiday outfits (docs/superpowers/specs/2026-11-27-holiday-merch-design.md, D3, D6, D14, D16).
// Two kinds, both worn like the gift outfits and drawn in the same cat-side files
// (src/cat/hats.js BUILD, foundneck.js FOUND_NECKS / FOUND_COLLARS, foundbody.js FOUND_BODY / FOUND_FLOATS):
//
//   an EARNED piece   { id, slot, emoji, name, holiday, bit }   price 0, `prize: true, holiday: '<id>'`:
//                     never sold, never traded, never in a code. The save's `holidays` record
//                     ({ winter2026: bitmask }, one key per holiday and window year) is the durable
//                     truth: sanitizeState rebuilds the pieces it names into owned on every load, so a
//                     cloud load never loses one, and a merge is the union of the bitmasks.
//   a SHOP piece      { id, slot, emoji, name, season, price }   a plain shop item whose shelf is open
//                     only in `season`'s window and the week before (holidays.js shelfOpen). Once
//                     bought it is owned for good and always wearable.
//
// `bit` is the piece's place in its holiday's bitmask: never changes once shipped.
// Imports only clanphrases.js and holidays.js, so progression.js can import it without a cycle.
import { phrase } from '../clanphrases.js';
import { HOLIDAY_IDS, shelfOpen } from '../holidays.js';

const earned = (id, slot, emoji, holiday, bit, name) => Object.freeze({ id, slot, emoji, holiday, bit, name });

const sold = (id, slot, emoji, season, price, name) => Object.freeze({ id, slot, emoji, season, price, name });

export const HOLIDAY_WEAR = Object.freeze([
  // Winter Lights, the umbrella: four earned pieces (the errand's basket, H7). Meshes: hats.js (snowcap), foundneck.js (lightscarf,
  // lanterncharm), foundbody.js (startopper).
  earned('lanterncharm', 'collar', '🏮', 'winter', 0, () => phrase('wear.lanterncharm.name')),
  earned('snowcap', 'head', '❄️', 'winter', 1, () => phrase('wear.snowcap.name')),
  earned('lightscarf', 'neck', '💡', 'winter', 2, () => phrase('wear.lightscarf.name')),
  earned('startopper', 'back', '⭐', 'winter', 3, () => phrase('wear.startopper.name')),
  // Christmas: five shop items (the Christmas shelf, 1 Dec to 26 Dec and the week before) and one earned piece (the errand, H7).
  // Meshes: hats.js (redcozyhat, reindeerantlers), foundneck.js (candyscarf, jinglecollar), foundbody.js (evergreensweater, littlegoldstar).
  sold('redcozyhat', 'head', '🎅', 'christmas', 30, () => phrase('wear.redcozyhat.name')),
  sold('reindeerantlers', 'head', '🦌', 'christmas', 35, () => phrase('wear.reindeerantlers.name')),
  sold('jinglecollar', 'collar', '🔔', 'christmas', 25, () => phrase('wear.jinglecollar.name')),
  sold('candyscarf', 'neck', '🍬', 'christmas', 30, () => phrase('wear.candyscarf.name')),
  sold('evergreensweater', 'body', '🎄', 'christmas', 35, () => phrase('wear.evergreensweater.name')),
  earned('littlegoldstar', 'back', '🌟', 'christmas', 0, () => phrase('wear.littlegoldstar.name')),
]);
export const HOLIDAY_WEAR_IDS = Object.freeze(HOLIDAY_WEAR.map((r) => r.id));

// The earned pieces of one holiday, by bit (a hole is null).
export function holidayPrizeIds(holiday, wear = HOLIDAY_WEAR) {
  const out = [];
  for (const r of wear) if (r.holiday === holiday) out[r.bit] = r.id;
  return Array.from(out, (id) => id ?? null);
}

// The CATALOG.accessories entries.
export const HOLIDAY_CATALOG = Object.freeze(Object.fromEntries(HOLIDAY_WEAR.map((record) => [record.id, {
  get name() { return record.name(); },
  slot: record.slot,
  price: record.holiday ? 0 : record.price,
  ...(record.holiday ? { prize: true, holiday: record.holiday } : { season: record.season }),
  emoji: record.emoji,
}])));

// ---- the save field: { winter2026: 5 } ----

// A bitmask is kept to this many bits (a holiday has at most four earned pieces; room to grow).
export const HOLIDAY_MASK = 0xff;
// A ceiling on keys for a hostile payload: three holidays, a key a year, a few decades.
export const HOLIDAYS_MAX = 96;
const KEY_RE = /^(winter|christmas|hanukkah)(20\d\d)$/;

export const holidayKey = (holiday, year) => `${holiday}${year}`;
export function parseHolidayKey(key) {
  const m = typeof key === 'string' ? KEY_RE.exec(key) : null;
  return m && HOLIDAY_IDS.includes(m[1]) ? { holiday: m[1], year: Number(m[2]) } : null;
}

// Own keys of a valid shape with a non-empty mask, each mask cut to HOLIDAY_MASK; anything else is dropped.
export function sanitizeHolidays(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  let n = 0;
  for (const key of Object.keys(v)) {
    if (n >= HOLIDAYS_MAX) break;
    if (!parseHolidayKey(key)) continue;
    const mask = Number(v[key]);
    if (!Number.isInteger(mask) || mask <= 0) continue;
    const cut = mask & HOLIDAY_MASK;
    if (cut === 0) continue;
    out[key] = cut;
    n += 1;
  }
  return out;
}

// The OR of two records (a merge: nothing earned on either side is lost).
export function mergeHolidays(a, b) {
  const x = sanitizeHolidays(a), y = sanitizeHolidays(b), out = {};
  for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) out[key] = (x[key] ?? 0) | (y[key] ?? 0);
  return out;
}

// The accessory ids a record owns: every bit set, in any year, names that holiday's piece.
export function holidayPiecesOwned(holidays, wear = HOLIDAY_WEAR) {
  const out = new Set();
  for (const [key, mask] of Object.entries(sanitizeHolidays(holidays))) {
    const { holiday } = parseHolidayKey(key);
    holidayPrizeIds(holiday, wear).forEach((id, bit) => { if (id && (mask & (1 << bit))) out.add(id); });
  }
  return [...out];
}

// The record with `holiday`'s bit `bit` set for window year `year` (a new object); the same record for an unknown holiday or bit.
export function withHolidayBit(holidays, holiday, year, bit) {
  const base = sanitizeHolidays(holidays);
  if (!HOLIDAY_IDS.includes(holiday) || !Number.isInteger(year) || !/^20\d\d$/.test(String(year)) || !Number.isInteger(bit) || bit < 0 || bit > 7) return base;
  const key = holidayKey(holiday, year);
  return { ...base, [key]: (base[key] ?? 0) | (1 << bit) };
}

// ---- the seasonal shelf ----

// Should the shop show this catalog entry? Everything without a season always; a seasonal one while its shelf is open,
// and always once it is owned (an owned item is never hidden).
export function shelfShows(entry, owned, now = new Date()) {
  if (!entry?.season) return true;
  return owned === true || shelfOpen(entry.season, now);
}

// The line a not-yet-earned holiday piece shows in the picker ("Earned in Winter Lights"); the same words in every set.
const PRIZE_LINES = {
  winter: () => phrase('wear.holidayPrize.winter'),
  christmas: () => phrase('wear.holidayPrize.christmas'),
  hanukkah: () => phrase('wear.holidayPrize.hanukkah'),
};
export const holidayPrizeLine = (holiday) => (Object.hasOwn(PRIZE_LINES, holiday) ? PRIZE_LINES[holiday]() : '');
