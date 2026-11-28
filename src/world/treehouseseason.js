// =============================================================================
// THE TREEHOUSE VILLAGE: THE SEASON (beauty pass 4, 2026-11-28). What time of year the village shows, by the calendar date (northern year): spring blossom, summer green, autumn gold, winter frost and
// fairy lights. A pure answer in four weights (spring, summer, autumn, winter) that add up to 1: a season holds its weight for most of its months and the neighbours cross-fade over about three weeks
// round the boundary (so the village never jumps overnight). The shaders (treehouseglow.js) and the life (treehousecritters.js) read the same four numbers. Never reads a clock of its own: the date is
// passed in (the walk's `ctx.now`, or the picture page's `season=`); `seasonWeights` is the one place that falls back to the device date.
// =============================================================================

export const SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
// The day of the year (0-based) each season BEGINS on (a non-leap year is close enough): 1 Mar, 1 Jun, 1 Sep, 1 Dec.
const STARTS = Object.freeze([59, 151, 243, 334]);
const FADE = 10; // days either side of a boundary over which the two seasons cross-fade

const smooth = (u) => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };
export function dayOfYear(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return 100;
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000);
}
// [spring, summer, autumn, winter], adding up to 1.
export function seasonOf(date) {
  const day = dayOfYear(date);
  const w = [0, 0, 0, 0];
  // which season the day sits in, and how far it is from the next boundary (days, signed)
  let cur = 3; // before 1 Mar is winter (the tail of the year before)
  for (let i = 0; i < 4; i++) if (day >= STARTS[i]) cur = i;
  const next = (cur + 1) % 4;
  const toNext = (STARTS[next] + (next === 0 ? 365 : 0)) - (day < STARTS[0] && cur === 3 ? day + 365 : day); // days until the next season starts
  const sinceStart = day - (STARTS[cur] - (cur === 3 && day < STARTS[0] ? 365 : 0)); // days since this one started
  const prev = (cur + 3) % 4;
  w[cur] = 1;
  if (toNext < FADE) { const s = smooth(0.5 - toNext / (2 * FADE)); w[next] += s; w[cur] -= s; }
  else if (sinceStart < FADE) { const s = smooth(0.5 - sinceStart / (2 * FADE)); w[prev] += s; w[cur] -= s; }
  return w;
}
export const weightsOf = (name) => SEASONS.map((s) => (s === name ? 1 : 0));
// The season the walk shows: a named one (the picture page, a test) or the date's own.
export function seasonWeights({ season = null, now = null } = {}) {
  if (season && SEASONS.includes(season)) return weightsOf(season);
  return seasonOf(now ?? new Date());
}
export const dominant = (w) => { let b = 0; for (let i = 1; i < 4; i++) if (w[i] > w[b]) b = i; return SEASONS[b]; };
