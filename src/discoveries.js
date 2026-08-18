import { bus } from './events.js';

export const AWARDS = {
  critter: 5, collectible: 10, pet: 4, scenic: 8, moment: 12, perk: 3, friend: 6,
  play: 5, quest: 25, photo: 8, secret: 12, legend: 50, rainbow: 15,
  mischief: 4, sits: 8, treasure: 12,
  goal: 15, jackpot: 40, gift: 10,
  rally: 6, nappile: 10, duet: 5, boop: 5,
  hunt: 12,
  tag: 8, groom: 6, duogoal: 20,
};

export function createDiscoveryLog(progression) {
  let seen = new Map();

  function pay(type, key, label, points, repeat) {
    progression.addPoints(points);
    // v18 Cat Skills: the SINGLE hook point that feeds state.feats' lifetime
    // per-type tallies, which is what the skill feat predicates in
    // src/skills.js read. Every award() / awardOnce() in the game funnels
    // through pay(), so tallying here (rather than at the ~45 individual
    // award call sites) means no call site can forget, and a future award
    // type becomes a lifetime counter for free.
    //
    // Optional-called because createDiscoveryLog is handed a stand-in
    // progression in unit tests (a bare { addPoints } is enough to exercise
    // the repeat/awardOnce rules) — a missing recordFeat must not turn those
    // into crashes.
    progression.recordFeat?.(type);
    bus.emit('discovery', { type, key, label, points, repeat });
    return points;
  }

  return {
    startWalk() {
      seen = new Map();
    },
    count(key) {
      return seen.get(key) || 0;
    },
    award(type, key, label) {
      const n = seen.get(key) || 0;
      seen.set(key, n + 1);
      const base = AWARDS[type];
      const points = n === 0 ? base : Math.max(1, Math.round(base / 2));
      return pay(type, key, label, points, n > 0);
    },
    awardOnce(type, key, label) {
      if (seen.has(key)) return 0;
      seen.set(key, 1);
      return pay(type, key, label, AWARDS[type], false);
    },
  };
}
