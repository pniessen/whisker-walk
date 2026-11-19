// Away fights with the home clan's roaming cats (2026-11-19, the amendment of
// that date in docs/superpowers/specs/2026-10-31-clan-life-design.md): the
// rules, as pure data and arithmetic. No THREE, no DOM, nothing stored.
//
// THE RULE. While her cat belongs to a clan and walks in ANOTHER clan's
// territory, each roaming cat of that clan (its warriors and apprentices; the
// leader, deputy, elders and kits keep the camp and never challenge) decides
// ONCE a walk, the first time she comes within notice distance of it, whether
// it wants to fight her. The chance is AWAY_CHANCES by how many away fights
// she has won on this walk so far (border patrol wins count): 50%, then 30%,
// 18%, 10%, and 10% from then on. Losing or running changes nothing.
//
// DETERMINISTIC, ON ITS OWN STREAM. Each cat has one number r in [0, 1) for
// the walk, awayRoll(seed, catId): its own mulberry32, seeded from the walk's
// seed and the cat's id through AWAY_SALT, so it draws from no stream any
// other part of the walk reads. The cat wants to fight when r < the chance at
// the moment it first notices her. A decision, once made, is kept (and goes
// into the walk's resume note with the win count: snapshot / restore), so a
// walk picked up again never decides a cat twice.
import { mulberry32, seedFromCode } from './rng.js';
import { RANK_KEYS } from './wordset.js';
import { isClanId, TRUCE_AREAS } from './clanhomes.js';

// The chance an undecided cat wants to fight, by away fights won this walk.
export const AWAY_CHANCES = Object.freeze([0.5, 0.3, 0.18, 0.1]);
// After any challenge ends (a win, a loss, Run, no answer, or walking away
// from the offer) no cat challenges for this long, seconds.
export const AWAY_COOLDOWN = 25;
// The cat she ran from (or lost to) waits this long before it squares up to
// her again, seconds. A cat she has beaten never does, this walk.
export const AWAY_RETRY = 60;
// How far a roaming cat chases her off: this many metres away from itself.
export const AWAY_CHASE_DIST = 6;
// Keeps a cat's roll apart from every other per-cat seed built from the walk's.
export const AWAY_SALT = 0xa3a9f17b;

const IDS_MAX = 64;

export function awayChance(wins) {
  const n = Number.isInteger(wins) && wins > 0 ? wins : 0;
  return AWAY_CHANCES[Math.min(n, AWAY_CHANCES.length - 1)];
}

// One cat's number for the walk, in [0, 1).
export function awayRoll(seed, catId) {
  const s = Number.isFinite(seed) ? seed >>> 0 : 0;
  return mulberry32(((s + seedFromCode(String(catId))) ^ AWAY_SALT) >>> 0)();
}

// Who may challenge: the ranks that roam the land.
export function canChallengeRank(rank) {
  return rank === RANK_KEYS.warrior || rank === RANK_KEYS.apprentice;
}

// Is this a walk with away fights at all? Her cat has a clan (`mine`), the
// place is a clan's territory (never the old street areas, the den or the
// island), it is not her own, and it is not her co-walker's either (`picks`
// are both kids' clans: the allies rule, clanhomes.js). Never in Legacy.
export function awayAllowed({ areaId, mine, picks = [], edition } = {}) {
  if (edition === 'legacy') return false;
  if (!isClanId(mine) || !isClanId(areaId) || TRUCE_AREAS.includes(areaId)) return false;
  if (areaId === mine) return false;
  return !(Array.isArray(picks) && picks.includes(areaId));
}

const idList = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.length <= 40).slice(0, IDS_MAX) : []);

// A resume note's `away` part, checked like any other outside data.
export function sanitizeAway(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const wins = Number.isInteger(raw.wins) && raw.wins >= 0 && raw.wins <= 1000 ? raw.wins : 0;
  const fight = idList(raw.fight);
  const pass = idList(raw.pass).filter((id) => !fight.includes(id));
  const beaten = idList(raw.beaten).filter((id) => fight.includes(id));
  return { wins, fight, pass, beaten };
}

// The walk's book of away fights: who has decided what, who is beaten, how
// many she has won, and the waits. `restore` is a resume note's `away` part.
export function createAwayLedger({ seed = 0, restore = null } = {}) {
  const decided = new Map(); // cat id -> 'fight' | 'pass'
  const beaten = new Set();
  const resting = new Map(); // cat id -> seconds left before it squares up again
  let wins = 0;
  let cooldown = 0;
  const note = sanitizeAway(restore);
  if (note) {
    wins = note.wins;
    for (const id of note.fight) decided.set(id, 'fight');
    for (const id of note.pass) decided.set(id, 'pass');
    for (const id of note.beaten) beaten.add(id);
  }
  return {
    get wins() { return wins; },
    get chance() { return awayChance(wins); },
    get cooling() { return cooldown > 0; },
    get cooldown() { return cooldown; },
    decisionOf(id) { return decided.get(id) ?? null; },
    // The first notice of a cat: decided now, at today's chance, and kept.
    decide(id) {
      const had = decided.get(id);
      if (had) return had;
      const d = awayRoll(seed, id) < awayChance(wins) ? 'fight' : 'pass';
      decided.set(id, d);
      return d;
    },
    isBeaten(id) { return beaten.has(id); },
    // A fight won: against roaming cat `id`, or the border patrol (no id).
    addWin(id = null) {
      wins += 1;
      if (id !== null) beaten.add(id);
    },
    startCooldown(secs = AWAY_COOLDOWN) { cooldown = Math.max(cooldown, secs); },
    rest(id, secs = AWAY_RETRY) { resting.set(id, secs); },
    isResting(id) { return (resting.get(id) ?? 0) > 0; },
    tick(dt) {
      if (!(dt > 0)) return;
      cooldown = Math.max(0, cooldown - dt);
      for (const [id, left] of resting) {
        if (left - dt <= 0) resting.delete(id); else resting.set(id, left - dt);
      }
    },
    // May this cat square up to her now? (Distance and footing are the caller's.)
    canChallenge(id) {
      return decided.get(id) === 'fight' && !beaten.has(id) && cooldown <= 0 && !this.isResting(id);
    },
    snapshot() {
      const fight = [];
      const pass = [];
      for (const [id, d] of decided) (d === 'fight' ? fight : pass).push(id);
      return { wins, fight, pass, beaten: [...beaten] };
    },
  };
}

// Where a roaming cat's chase sets her down: AWAY_CHASE_DIST from where she
// stands, straight away from the cat; if `ok(x, z)` (the caller's whole test:
// walkable all the way there, not in the camp, no rim crossed) refuses that,
// nearer along the same line, then turned 30 degrees at a time either way up
// to a right angle. Null when nothing is open: then there is no chase, never
// a cat set down somewhere she could not walk to.
const AWAY_TURNS = [0, 1, -1, 2, -2, 3, -3];
const AWAY_TURN = Math.PI / 6;
const AWAY_REACH = [1, 0.75, 0.5];
export function awayLanding(catPos, foePos, ok, { dist = AWAY_CHASE_DIST } = {}) {
  const fin = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
  if (!fin(catPos) || !fin(foePos) || typeof ok !== 'function') return null;
  let dx = catPos.x - foePos.x;
  let dz = catPos.z - foePos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
  for (const k of AWAY_TURNS) {
    const c = Math.cos(k * AWAY_TURN);
    const s = Math.sin(k * AWAY_TURN);
    const ux = dx * c - dz * s;
    const uz = dx * s + dz * c;
    for (const f of AWAY_REACH) {
      const x = catPos.x + ux * dist * f;
      const z = catPos.z + uz * dist * f;
      if (ok(x, z) === true) return { x, z };
    }
  }
  return null;
}
