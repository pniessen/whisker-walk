// The pure rules of the Market sneak (step 2): each stall's rhythm and its
// "busy" tell, then (Task 9) who notices whom. No three.js; imports only the
// rng, the dogs' one shared idea, the plan's pure data and the shoo line's gap
// (marketnone.js, which the walk's handler reads in the main graph).
import { mulberry32 } from './rng.js';
import { DOG_NOTICE_STALKED } from './dogs.js';
import { TREAT_STALLS, toStall } from './world/marketplan.js';
import { SHOO_TOAST_GAP } from './marketnone.js';

export const MARKET = Object.freeze({
  BUSY_S: 1.6, TURN_S: 0.4, STILL_SPEED: 0.3, STILL_S: 1.0, APPROACH: 0.15, COO_S: 4.0,
  SHOO_S: 1.2, SHOO_REST_S: 2.0, HOP_DIST: 1.2, HOP_S: 0.3, TREAT_REACH: 0.8, HOLD_S: 1.0,
  MUNCH_S: 0.8, REFILL_S: 25, HIGH_Y: 1.8, TEAM_GRACE_S: 1.5, SHOO_TOAST_GAP,
  WATCH_DEPTH: 3.2, WATCH_SIDE: 1.0, STALK_SHARE: DOG_NOTICE_STALKED,
});

// Seconds of serving and of being turned away, per stall. Data, so no two
// stalls move in lockstep whatever the seed. (Controller ruling: baker away 4.0 and
// cheese away 4.3 so every pair of periods differs by more than 0.3 s.)
export const STALL_TIMES = Object.freeze({
  fish: Object.freeze({ serve: 4.5, away: 4.2 }),
  baker: Object.freeze({ serve: 5.4, away: 4.0 }),
  cheese: Object.freeze({ serve: 3.8, away: 4.3 }),
  milk: Object.freeze({ serve: 6.0, away: 3.8 }),
});

export const periodOf = (id) => {
  const t = STALL_TIMES[id];
  return t.serve + MARKET.BUSY_S + MARKET.TURN_S + t.away + MARKET.TURN_S;
};

export const MARKET_STALL_SALT = 0x3a7c51e9;

// One draw per stall, in TREAT_STALLS order, from the stalls' own stream.
export function stallOffsets(seed) {
  const rng = mulberry32(((seed >>> 0) ^ MARKET_STALL_SALT) >>> 0);
  const out = {};
  for (const id of TREAT_STALLS) out[id] = rng() * periodOf(id);
  return out;
}

const ease = (k) => k * k * (3 - 2 * k);

// Where a stall is in its cycle. phase: serve, busy, turn, away, back (k 0..1
// through it). watching: serve and busy only (M3). bubble: busy, turn, away.
// facing: 0 front, 1 the back shelf, eased through turn and back.
export function stallPhase(id, offset, clock, out = {}) {
  const t = STALL_TIMES[id], P = periodOf(id);
  let u = (((clock + offset) % P) + P) % P;
  let phase, len;
  if (u < t.serve) { phase = 'serve'; len = t.serve; }
  else if ((u -= t.serve) < MARKET.BUSY_S) { phase = 'busy'; len = MARKET.BUSY_S; }
  else if ((u -= MARKET.BUSY_S) < MARKET.TURN_S) { phase = 'turn'; len = MARKET.TURN_S; }
  else if ((u -= MARKET.TURN_S) < t.away) { phase = 'away'; len = t.away; }
  else { u -= t.away; phase = 'back'; len = MARKET.TURN_S; }
  const k = Math.min(1, Math.max(0, u / len));
  out.phase = phase;
  out.k = k;
  out.watching = phase === 'serve' || phase === 'busy';
  out.bubble = phase === 'busy' || phase === 'turn' || phase === 'away';
  out.facing = phase === 'turn' ? ease(k) : phase === 'away' ? 1 : phase === 'back' ? 1 - ease(k) : 0;
  return out;
}

// ---- Noticing (Task 9). A cat as the rules see it: { x, z, stalking, high }.

// In the stall's local frame: in front of the counter only, |lx| <= w/2 + WATCH_SIDE,
// d/2 <= lz <= d/2 + depth; depth is half as much for a crouched (stalking) cat.
export function inWatchZone(stall, x, z, stalking) {
  const { lx, lz } = toStall(stall, x, z);
  const depth = stalking === true ? MARKET.WATCH_DEPTH * MARKET.STALK_SHARE : MARKET.WATCH_DEPTH;
  return Math.abs(lx) <= stall.w / 2 + MARKET.WATCH_SIDE && lz >= stall.d / 2 && lz <= stall.d / 2 + depth;
}

// Up on an awning (at or above HIGH_Y) is the cat's `high` flag; under a trestle is
// within r of a hide's centre.
export function isHidden(hides, cat) {
  if (cat.high) return true;
  for (const h of hides) if (Math.hypot(cat.x - h.x, cat.z - h.z) <= h.r) return true;
  return false;
}

// look.cooing is set by the live stall (Task 12); the pure phase never sets it.
export function stallSees(stall, look, cat, hides) {
  return look.watching === true && !look.cooing && inWatchZone(stall, cat.x, cat.z, cat.stalking) && !isHidden(hides, cat);
}
