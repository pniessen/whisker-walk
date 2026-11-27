// =============================================================================
// THE MARKET'S SIX MISSIONS: THE PURE STEP MACHINES (2026-11-27, docs/superpowers/specs/2026-11-27-market-missions.md).
// No THREE, no clock, no random number, no save write: each takes its own small record and an event and answers the next
// record and what happened; world/marketerrandlive.js carries them out on a walk. Nothing here can fail her: no state leads
// back from done, and a mission that is not finished waits for as long as she likes (the Farm's rules).
//
//   mouse    { n }          0..3: the mouse darts n times, then (n 3) goes home into the cheese; done at 4
//   glove    { stage }      0 lying, 1 in her mouth, 2 handed over (done)
//   pigeons  { bits }       one bit a cafe table's pigeon sent up; done at 7
//   bell     { t, seen }    t seconds since the bell (-1 not rung); seen: awning bits; done at three
//   stray    { stage }      0 not met, 1 met (the fish head is out), 2 fed (done)
//   fiddle   { secs }       seconds still by the fiddler; done at SONG_S
// =============================================================================
import { stallById, fromStall, CAFE, MUSICIAN, MARKET_PERCHES } from './marketplan.js';

export const ERRAND_IDS = Object.freeze(['mouse', 'glove', 'pigeons', 'bell', 'stray', 'fiddle']);
export const errandPageId = (id) => `mk${id}`;
export const errandKey = (id) => `market-errand-${id}`;

const pt = (p) => Object.freeze({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });
const CHEESE = stallById('cheese');
const FISH = stallById('fish');
const FLOWERS = stallById('flowers');

// where each is, and how near counts (metres). Free cobbles, outside every watch zone and hide: test/marketerrands.test.js.
export const ERRAND = Object.freeze({
  MOUSE_SPOTS: Object.freeze([pt(fromStall(CHEESE, 0.5, -2.5)), pt(fromStall(CHEESE, 2.5, -1.5)), pt(fromStall(CHEESE, 4, -1.5)), pt(fromStall(CHEESE, 4, 0))]),
  MOUSE_FLEE: 1.6,
  GLOVE_ID: 'market-glove-1',
  GLOVE_OWNER: pt(fromStall(FLOWERS, 0, FLOWERS.d / 2 + 1.8)), // in front of the flower seller's counter
  GLOVE_R: 1.3,
  TABLES: Object.freeze(CAFE.tables.map(pt)),
  TABLE_Y: 0.74,
  PIGEON_R: 1.7,
  BELL_RUN: 30, // seconds after the bell
  BELL_LANDINGS: 3,
  STRAY_SPOT: pt(fromStall(FISH, -2.5, -3)),
  STRAY_SEE: 4,
  STRAY_FEED_R: 1.6,
  FISH_HEAD_ID: 'market-fishhead-1',
  FISH_HEAD_SPOT: pt(fromStall(FISH, 1.5, -3)),
  FOLLOW_GAP: 2.2,
  SONG_R: 3.2,
  SONG_S: 14,
  SONG_START: 2,
  STILL_SPEED: 0.25,
});

// the awnings she can land on: every stall's 'roof' perch (marketplan.js MARKET_PERCHES)
export const AWNINGS = Object.freeze(MARKET_PERCHES.filter((p) => p.kind === 'roof').map((p) => Object.freeze({ x: p.x, z: p.z, y: p.y })));
export const musicianSpot = pt(MUSICIAN);

const R = ERRAND;
const num = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.trunc(v))) : lo);
const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) <= r;

export const initial = (id) => ({
  mouse: { n: 0 }, glove: { stage: 0 }, pigeons: { bits: 0 }, bell: { t: -1, seen: 0 }, stray: { stage: 0 }, fiddle: { secs: 0 },
})[id] ?? null;

export function isDone(id, st) {
  if (!st) return false;
  switch (id) {
    case 'mouse': return st.n >= 4;
    case 'glove': return st.stage >= 2;
    case 'pigeons': return st.bits === 7;
    case 'bell': return countBits(st.seen) >= R.BELL_LANDINGS;
    case 'stray': return st.stage >= 2;
    case 'fiddle': return st.secs >= R.SONG_S;
    default: return false;
  }
}
const countBits = (b) => { let n = 0; for (let v = b >>> 0; v; v >>>= 1) n += v & 1; return n; };

// apply(id, st, ev) -> { st, effect } (effect null when nothing happened). Events, by mission:
//   mouse   { kind: 'near', d }                   she is d m from the mouse
//   glove   { kind: 'held', held: boolean }       the glove is in her mouth (or not); { kind: 'give', d } d m from the owner, glove held
//   pigeons { kind: 'flush', table: 0|1|2 }
//   bell    { kind: 'ring' }, { kind: 'tick', dt }, { kind: 'land', roof: i }
//   stray   { kind: 'see', d }, { kind: 'feed', d } with the fish head held
//   fiddle  { kind: 'listen', dt, d, speed }
export function apply(id, st, ev) {
  const none = { st, effect: null };
  const kind = ev && typeof ev === 'object' ? ev.kind : null;
  if (!st || !kind) return none;
  switch (id) {
    case 'mouse': {
      if (kind !== 'near' || !(ev.d <= R.MOUSE_FLEE) || st.n >= 4) return none;
      const n = st.n + 1;
      return { st: { n }, effect: n >= 4 ? 'home' : 'dart' };
    }
    case 'glove': {
      if (st.stage >= 2) return none;
      if (kind === 'held') {
        const stage = ev.held ? 1 : 0;
        return stage === st.stage ? none : { st: { stage }, effect: ev.held ? 'got' : 'lost' };
      }
      if (kind === 'give' && st.stage === 1 && ev.d <= R.GLOVE_R) return { st: { stage: 2 }, effect: 'done' };
      return none;
    }
    case 'pigeons': {
      if (kind !== 'flush') return none;
      const t = ev.table;
      if (!(t === 0 || t === 1 || t === 2) || st.bits & (1 << t)) return none;
      const bits = st.bits | (1 << t);
      return { st: { bits }, effect: bits === 7 ? 'done' : 'flush' };
    }
    case 'bell': {
      if (isDone(id, st)) return none;
      if (kind === 'ring') return { st: { t: 0, seen: 0 }, effect: 'ring' };
      if (st.t < 0) return none;
      if (kind === 'tick' && ev.dt > 0) {
        const t = st.t + ev.dt;
        return t > R.BELL_RUN ? { st: { t: -1, seen: 0 }, effect: 'late' } : { st: { t, seen: st.seen }, effect: null };
      }
      if (kind === 'land') {
        const i = num(ev.roof, -1, 30);
        if (i < 0 || (st.seen & (1 << i))) return none;
        const seen = st.seen | (1 << i);
        return { st: { t: st.t, seen }, effect: countBits(seen) >= R.BELL_LANDINGS ? 'done' : 'land' };
      }
      return none;
    }
    case 'stray': {
      if (st.stage >= 2) return none;
      if (kind === 'see' && st.stage === 0 && ev.d <= R.STRAY_SEE) return { st: { stage: 1 }, effect: 'met' };
      if (kind === 'feed' && st.stage === 1 && ev.d <= R.STRAY_FEED_R) return { st: { stage: 2 }, effect: 'done' };
      return none;
    }
    case 'fiddle': {
      if (kind !== 'listen' || st.secs >= R.SONG_S) return none;
      const calm = ev.d <= R.SONG_R && ev.speed <= R.STILL_SPEED;
      if (!calm) return st.secs > 0 ? { st: { secs: 0 }, effect: st.secs >= R.SONG_START ? 'broke' : null } : none;
      const secs = st.secs + (ev.dt > 0 ? ev.dt : 0);
      const effect = secs >= R.SONG_S ? 'done' : st.secs < R.SONG_START && secs >= R.SONG_START ? 'start' : null;
      return { st: { secs }, effect };
    }
    default: return none;
  }
}

// the awning's index in AWNINGS when her perch is one, else -1
export function awningAt(perched) {
  if (!perched) return -1;
  return AWNINGS.findIndex((a) => Math.abs(a.x - perched.x) <= 0.05 && Math.abs(a.z - perched.z) <= 0.05);
}

export { near };
