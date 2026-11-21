// Gift events: a one-off party a gift code switches on (the first is a
// birthday, 2026-11-21). A code's reward may carry `events: [id]`; the save
// keeps the ids in `state.events` (progression.js), the same way it keeps the
// accessories, and progression.hasEvent(id) answers whether this save has one.
//
// This file is the table of known events and the pure questions about them:
// whether one is still on (its window, in local time), the outfits that come
// with it (rebuilt into owned on every load, so a cloud load never loses
// them), the day key for "once a day" things. DOM-free, no imports, never
// reads the clock unless the caller lets it default.

// Her birthday. The camp gathering (world/camp) reads this id through
// progression.hasEvent; never rename it once a save holds it.
export const BIRTHDAY_EVENT = 'bday-2026-11-21';

// id -> { last: [year, month 1-12, day], wear: [accessory ids] }. An event is
// on from the moment its code is opened until the end of its last day, local
// time (a late evening the day after still counts).
const EVENTS = Object.freeze({
  [BIRTHDAY_EVENT]: Object.freeze({
    last: Object.freeze([2026, 11, 22]),
    wear: Object.freeze(['partyhat', 'bdayrosette', 'bdayballoon', 'cakecharm']),
  }),
});

export const EVENT_IDS = Object.freeze(Object.keys(EVENTS));
// A ceiling on state.events for a hostile payload.
export const EVENTS_MAX = 32;

export function isEventId(id) {
  return typeof id === 'string' && Object.hasOwn(EVENTS, id);
}

// Known ids only, once each, in the order given, at most EVENTS_MAX.
export function sanitizeEvents(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter(isEventId))].slice(0, EVENTS_MAX);
}

// The first moment after the event's last day, in local time.
function endOf(id) {
  const [y, m, d] = EVENTS[id].last;
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0).getTime();
}

// True while `id` is a known event and `now` is before the end of its last
// day (local time). Whether this save has the event is hasEvent's question.
export function eventWindowOpen(id, now = new Date()) {
  if (!isEventId(id)) return false;
  const t = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(t) && t < endOf(id);
}

// The outfits an event gives, [] for anything else.
export function eventWear(id) {
  return isEventId(id) ? EVENTS[id].wear : [];
}

// 'YYYY-MM-DD' of `now` in local time: the key for "once a day".
export function localDay(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
