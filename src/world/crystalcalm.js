// Beauty pass 10: the cave's one referee for its EVENT effects (a mood, a vista's golden moment, the falling star, the prismatic bloom, a song, the cave answering her voice).
// Each layer reports how strong its event is this frame (report), and the referee keeps the two highest in priority at full strength: the rest ease down to LOW (dim) and
// the ones a player starts (a golden moment, a song) wait until fewer than two higher ones are on (allow). No THREE, no clock of its own, no random number.
export const CALM = Object.freeze({ max: 2, on: 0.12, low: 0.35, rate: 1.6 });
// priority, highest first: what she did with her own voice or paws beats what she is standing still for, which beats what the cave does by the clock
export const RANK = Object.freeze({ voice: 1, gold: 2, song: 3, star: 4, bloom: 5, mood: 6 });
const level = {}; const k = {};
const active = () => Object.keys(level).filter((n) => level[n] > CALM.on).sort((a, b) => RANK[a] - RANK[b]);
export const calm = {
  report(name, v) { level[name] = Number.isFinite(v) ? v : 0; },
  /** once a frame (the mood layer does it): eases every event's dim factor toward 1 for the top two, CALM.low for the rest */
  tick(dt) { const top = active().slice(0, CALM.max); for (const n of Object.keys(RANK)) { const want = !(n in level) || level[n] <= CALM.on || top.includes(n) ? 1 : CALM.low; k[n] = (k[n] ?? 1) + (want - (k[n] ?? 1)) * Math.min(1, Math.max(0, dt) * CALM.rate); } },
  /** how strongly event `name` may show now, CALM.low to 1 */
  dim(name) { return k[name] ?? 1; },
  /** may a player-started event begin: fewer than two others of higher priority are on */
  allow(name) { return active().filter((n) => n !== name && RANK[n] < RANK[name]).length < CALM.max; },
  count() { return active().length; },
  reset() { for (const n of Object.keys(level)) delete level[n]; for (const n of Object.keys(k)) delete k[n]; },
};
