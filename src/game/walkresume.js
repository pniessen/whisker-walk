// Mid-walk resume: pick a walk up where it was left.
//
// iPadOS closes a game left in the background, and a closed game used to
// come back at the home screen with the walk gone. Now the game keeps a small
// note of the walk in progress (this file), and the next launch builds that
// same walk again and puts the cat back on its spot (main.js, walk.js).
//
// The note is one localStorage key of its own, never part of the save: it
// belongs to this device and this walk, and must not travel to the cloud.
//
// What comes back: the place, dusk, the walk's seed (so the weather, the
// goals, the quest on offer, the secrets and the cats are the same ones), the
// cat's spot and heading, the treasures already picked up, the goals'
// progress and the tallies the summary reads. What starts afresh: a fight, a
// race or a quest that was under way, whatever was in the cat's mouth, and
// where the animals had wandered to.
//
// Only a solo walk outdoors is noted. A walk together cannot be picked up
// (its room is gone), and the den has nothing to lose.
//
// Points need none of this: they are saved as they are earned.

export const RESUME_KEY = 'whisker-walk-resume';
// A walk waits this long. Past it the walk is settled instead (it counts as a
// finished walk) and the game opens at home as usual.
export const RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000;
// A note that has failed to open this many times is settled too, so a walk
// that cannot be rebuilt can never keep the game from opening.
export const RESUME_MAX_TRIES = 2;
// A device clock set back a little is fine; further than this the note's age
// means nothing and it is settled.
const CLOCK_SLACK_MS = 5 * 60 * 1000;
const VERSION = 1;
const COUNT_MAX = 100000;
const LIST_MAX = 500;

// A seed for a solo walk's world, in the range the seeded streams take.
export function newWalkSeed(rand = Math.random) {
  return Math.floor(rand() * 2 ** 31) >>> 0;
}

// The note for the walk in progress, or null when this walk is not one that
// can be picked up. `yaw` is the player's view heading (player.viewYaw()).
export function snapshotWalk(session, { yaw, now }) {
  if (!session || session.net || session.areaId === 'den' || session.soloSeed === undefined) return null;
  const meshes = session.collectibleMeshes;
  return {
    v: VERSION,
    at: now,
    tries: session.resumeTries ?? 0,
    areaId: session.areaId,
    seed: session.soloSeed,
    stamp: session.walkStamp,
    dusk: !!session.duskMode,
    duskActive: !!session.duskActive,
    x: session.cat.position.x,
    z: session.cat.position.z,
    yaw,
    startPoints: session.startPoints,
    discoveries: session.discoveryCount,
    greeted: session.catsGreeted,
    clanPaid: { ...session.clanPaid },
    carried: session.walk.carried,
    collected: session.areaData.collectibles.filter((c) => !meshes.has(c.id)).map((c) => c.id),
    scenics: [...(session.scenicsVisited ?? [])],
    goals: (session.goals?.goals ?? []).map((g) => ({ id: g.id, progress: g.progress, done: g.done })),
  };
}

const count = (v) => (Number.isInteger(v) && v >= 0 && v <= COUNT_MAX ? v : 0);
const strings = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(0, LIST_MAX) : []);

// A note read back from storage is checked like any other outside data. The
// parts a walk cannot be rebuilt without (place, seed, spot, time) reject the
// whole note; the rest fall back to an empty tally.
function sanitize(raw, areaIds) {
  if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
  if (typeof raw.areaId !== 'string' || raw.areaId === 'den' || !areaIds.includes(raw.areaId)) return null;
  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.z) || !Number.isFinite(raw.at)) return null;
  if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed >= 2 ** 32) return null;
  if (!Number.isInteger(raw.startPoints) || raw.startPoints < 0) return null;
  const paid = raw.clanPaid && typeof raw.clanPaid === 'object' ? raw.clanPaid : {};
  return {
    v: VERSION,
    at: raw.at,
    tries: count(raw.tries),
    areaId: raw.areaId,
    seed: raw.seed,
    stamp: typeof raw.stamp === 'string' ? raw.stamp.slice(0, 40) : 'walk-' + raw.at,
    dusk: raw.dusk === true,
    duskActive: raw.duskActive === true,
    x: raw.x,
    z: raw.z,
    yaw: Number.isFinite(raw.yaw) ? raw.yaw : 0,
    startPoints: raw.startPoints,
    discoveries: count(raw.discoveries),
    greeted: count(raw.greeted),
    clanPaid: { friend: count(paid.friend), boop: count(paid.boop), patrol: count(paid.patrol) },
    carried: count(raw.carried),
    collected: strings(raw.collected),
    scenics: strings(raw.scenics),
    goals: (Array.isArray(raw.goals) ? raw.goals : [])
      .filter((g) => g && typeof g === 'object' && typeof g.id === 'string')
      .slice(0, 10)
      .map((g) => ({ id: g.id, progress: count(g.progress), done: g.done === true })),
  };
}

// → { kind: 'resume', data } to pick the walk up, { kind: 'stale', data } to
// settle it and open at home, or null when there is nothing (a note that
// cannot be trusted is thrown away). `areaIds` are the places that exist.
export function readResume(storage, { now, areaIds }) {
  let raw;
  try {
    const text = storage.getItem(RESUME_KEY);
    if (text === null || text === undefined) return null;
    raw = JSON.parse(text);
  } catch {
    clearResume(storage);
    return null;
  }
  const data = sanitize(raw, areaIds);
  if (!data) {
    clearResume(storage);
    return null;
  }
  const age = now - data.at;
  const stale = age > RESUME_MAX_AGE_MS || age < -CLOCK_SLACK_MS || data.tries >= RESUME_MAX_TRIES;
  return { kind: stale ? 'stale' : 'resume', data };
}

// Storage can be full or switched off (a private window): the walk goes on
// either way, it just cannot be picked up later.
export function writeResume(storage, data) {
  if (!data) return;
  try { storage.setItem(RESUME_KEY, JSON.stringify(data)); } catch { /* not fatal */ }
}

export function clearResume(storage) {
  try { storage.removeItem(RESUME_KEY); } catch { /* not fatal */ }
}

// Written BEFORE the walk is rebuilt. If the rebuild takes the game down,
// the next launch sees the try; the walk itself clears the count once it has
// run for a while (main.js's checkpoint timer).
export function markTried(storage, data) {
  const tried = { ...data, tries: data.tries + 1 };
  writeResume(storage, tried);
  return tried;
}

// The goals a seeded walk rolls are the same three; this puts their progress
// back. Matched by id, so a note from an older build just restores less.
export function restoreGoals(goals, saved) {
  if (!goals) return;
  for (const s of saved) {
    const g = goals.goals.find((x) => x.id === s.id);
    if (!g) continue;
    g.progress = Math.min(s.progress, g.target);
    g.done = g.progress >= g.target;
  }
}

// The fresh session's tallies carry on from the note. `points` is the save's
// points now: a walk can never have earned less than nothing.
export function restoreTallies(session, data, { points }) {
  session.startPoints = Math.min(data.startPoints, points);
  session.discoveryCount = data.discoveries;
  session.catsGreeted = data.greeted;
  session.clanPaid = { ...data.clanPaid };
  session.walk.carried = Math.min(data.carried, session.walk.carryCap);
  if (session.scenicsVisited) for (const id of data.scenics) session.scenicsVisited.add(id);
  session.resumeTries = data.tries;
}

// A walk nobody came back to in time still happened: it counts toward the
// place's walks, the streak of the day it was walked (UTC, the streak's day)
// and the best-walk score, the way the summary would have counted it.
export function settleAbandoned(progression, data) {
  const start = Math.min(data.startPoints, progression.state.points);
  progression.completeWalk(data.areaId, { dusk: data.duskActive });
  const streak = progression.recordStreakWalk(new Date(data.at).toISOString().slice(0, 10));
  if (streak.bonus > 0) progression.addPoints(streak.bonus);
  progression.recordWalkScore(progression.state.points - start);
}

// The line on the Ready card of a walk picked up again.
export function resumeWelcome(place) {
  const where = place ? ` in ${place.replace(/^The /, 'the ')}` : '';
  return `Welcome back! Your walk${where} is right where you left it.`;
}
