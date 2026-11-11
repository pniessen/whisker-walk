import { describe, it, expect } from 'vitest';
import {
  RESUME_KEY, RESUME_MAX_AGE_MS, RESUME_MAX_TRIES,
  newWalkSeed, snapshotWalk, readResume, writeResume, clearResume, markTried,
  restoreGoals, restoreTallies, settleAbandoned, resumeWelcome,
} from '../src/game/walkresume.js';
import { createGoals } from '../src/goals.js';
import { createProgression } from '../src/progression.js';
import { mulberry32 } from '../src/rng.js';

function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const AREAS = ['neighborhood', 'woods', 'den'];
const NOW = Date.UTC(2026, 10, 10, 23, 30); // 2026-11-10 23:30 UTC

// A walk in the Woods, part-way through: two treasures out of three picked up.
function session(over = {}) {
  return {
    areaId: 'woods',
    soloSeed: 12345,
    walkStamp: 'walk-1',
    duskMode: true,
    duskActive: false,
    net: null,
    cat: { position: { x: 4.26, y: 0, z: -7.5 } },
    areaData: { collectibles: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] },
    collectibleMeshes: new Map([['c2', {}]]),
    startPoints: 100,
    discoveryCount: 6,
    catsGreeted: 2,
    clanPaid: { friend: 1, boop: 0, patrol: 2 },
    walk: { carried: 1, carryCap: 2 },
    scenicsVisited: new Set(['s1']),
    goals: { goals: [
      { id: 'collect', progress: 2, done: true, target: 2 },
      { id: 'greet-cats', progress: 2, done: false, target: 3 },
      { id: 'box-sit', progress: 0, done: false, target: 1 },
    ] },
    resumeTries: 0,
    ...over,
  };
}
const snap = (over) => snapshotWalk(session(over), { yaw: 1.25, now: NOW });

describe('snapshotWalk', () => {
  it('notes the place, the spot, the tallies and what was picked up', () => {
    expect(snap()).toEqual({
      v: 1, at: NOW, tries: 0,
      areaId: 'woods', seed: 12345, stamp: 'walk-1', dusk: true, duskActive: false,
      x: 4.26, z: -7.5, yaw: 1.25,
      startPoints: 100, discoveries: 6, greeted: 2,
      clanPaid: { friend: 1, boop: 0, patrol: 2 },
      carried: 1,
      collected: ['c1', 'c3'],
      scenics: ['s1'],
      goals: [
        { id: 'collect', progress: 2, done: true },
        { id: 'greet-cats', progress: 2, done: false },
        { id: 'box-sit', progress: 0, done: false },
      ],
    });
  });

  it('takes no note of a walk together, the den, or no walk at all', () => {
    expect(snap({ net: {} })).toBeNull();
    expect(snap({ areaId: 'den' })).toBeNull();
    expect(snap({ soloSeed: undefined })).toBeNull();
    expect(snapshotWalk(null, { yaw: 0, now: NOW })).toBeNull();
  });

  it('carries the count of failed tries until the walk clears it', () => {
    expect(snap({ resumeTries: 1 }).tries).toBe(1);
  });
});

describe('readResume', () => {
  const read = (storage, now = NOW + 60_000) => readResume(storage, { now, areaIds: AREAS });

  it('gives back a fresh note to pick up from', () => {
    const storage = memStorage();
    writeResume(storage, snap());
    expect(read(storage)).toEqual({ kind: 'resume', data: snap() });
  });

  it('nothing saved, nothing to pick up', () => {
    expect(read(memStorage())).toBeNull();
  });

  it('a note older than the window is stale: settled, not picked up', () => {
    const storage = memStorage();
    writeResume(storage, snap());
    expect(read(storage, NOW + RESUME_MAX_AGE_MS - 1).kind).toBe('resume');
    expect(read(storage, NOW + RESUME_MAX_AGE_MS + 1).kind).toBe('stale');
  });

  it('a note that already failed to open twice is stale, so the game cannot get stuck', () => {
    const storage = memStorage();
    writeResume(storage, snap());
    markTried(storage, read(storage).data);
    expect(read(storage)).toMatchObject({ kind: 'resume', data: { tries: 1 } });
    markTried(storage, read(storage).data);
    expect(RESUME_MAX_TRIES).toBe(2);
    expect(read(storage).kind).toBe('stale');
  });

  it('throws away and ignores a note it cannot trust', () => {
    const bad = [
      'not json',
      JSON.stringify(null),
      JSON.stringify({ ...snap(), v: 2 }),
      JSON.stringify({ ...snap(), areaId: 'atlantis' }),
      JSON.stringify({ ...snap(), areaId: 'den' }),
      JSON.stringify({ ...snap(), x: 'left' }),
      JSON.stringify({ ...snap(), z: null }),
      JSON.stringify({ ...snap(), seed: -1 }),
      JSON.stringify({ ...snap(), at: 'yesterday' }),
      JSON.stringify({ ...snap(), startPoints: -5 }),
    ];
    for (const raw of bad) {
      const storage = memStorage();
      storage.setItem(RESUME_KEY, raw);
      expect(read(storage), raw).toBeNull();
      expect(storage.getItem(RESUME_KEY), raw).toBeNull();
    }
  });

  it('tidies the loose parts of a note rather than trusting them', () => {
    const storage = memStorage();
    storage.setItem(RESUME_KEY, JSON.stringify({
      ...snap(), yaw: 'north', discoveries: -3, greeted: 1e12, carried: 2.5,
      clanPaid: { friend: 'lots' }, collected: ['c1', 7, 'c3'], scenics: 'all',
      goals: [{ id: 'collect', progress: 2, done: true }, { progress: 1 }, 'x'], tries: 'many',
      stamp: 42,
    }));
    const { data } = read(storage);
    expect(data).toMatchObject({
      yaw: 0, discoveries: 0, greeted: 0, carried: 0, tries: 0,
      clanPaid: { friend: 0, boop: 0, patrol: 0 },
      collected: ['c1', 'c3'], scenics: [],
      goals: [{ id: 'collect', progress: 2, done: true }],
    });
    expect(data.stamp).toBe('walk-' + data.at);
  });

  it('a note from a clock that is ahead of this one is stale', () => {
    const storage = memStorage();
    writeResume(storage, snap());
    expect(read(storage, NOW - 60 * 60 * 1000).kind).toBe('stale');
  });

  it('clearResume forgets the note; a storage that throws is never fatal', () => {
    const storage = memStorage();
    writeResume(storage, snap());
    clearResume(storage);
    expect(read(storage)).toBeNull();
    const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('no'); } };
    expect(() => writeResume(broken, snap())).not.toThrow();
    expect(() => clearResume(broken)).not.toThrow();
    expect(read(broken)).toBeNull();
    expect(() => writeResume(memStorage(), null)).not.toThrow();
  });
});

describe('restoreGoals', () => {
  it('puts each goal back where it was, by id', () => {
    const goals = createGoals(mulberry32(7), null);
    const [a, b, c] = goals.goals;
    restoreGoals(goals, [
      { id: a.id, progress: a.target, done: true },
      { id: c.id, progress: 1, done: false },
      { id: 'not-on-this-walk', progress: 9, done: true },
    ]);
    expect(a).toMatchObject({ progress: a.target, done: true });
    expect(b).toMatchObject({ progress: 0, done: false });
    expect(c.progress).toBe(Math.min(1, c.target));
  });

  it('never trusts progress past the target, and done follows the progress', () => {
    const goals = createGoals(mulberry32(7), null);
    const [a] = goals.goals;
    restoreGoals(goals, [{ id: a.id, progress: 99, done: false }]);
    expect(a).toMatchObject({ progress: a.target, done: true });
  });

  it('a walk without goals is left alone', () => {
    expect(() => restoreGoals(null, [{ id: 'collect', progress: 1, done: false }])).not.toThrow();
  });
});

describe('restoreTallies', () => {
  const fresh = () => ({
    startPoints: 500, discoveryCount: 0, catsGreeted: 0,
    clanPaid: { friend: 0, boop: 0, patrol: 0 },
    walk: { carried: 0, carryCap: 2 },
    scenicsVisited: new Set(),
    resumeTries: 0,
  });

  it('carries on the counts the summary reads', () => {
    const s = fresh();
    restoreTallies(s, { ...snap(), tries: 1 }, { points: 500 });
    expect(s).toMatchObject({
      startPoints: 100, discoveryCount: 6, catsGreeted: 2,
      clanPaid: { friend: 1, boop: 0, patrol: 2 },
      walk: { carried: 1, carryCap: 2 },
      resumeTries: 1,
    });
    expect([...s.scenicsVisited]).toEqual(['s1']);
  });

  it('never counts more earned than the save holds, nor a pocket past its size', () => {
    const s = fresh();
    restoreTallies(s, { ...snap(), startPoints: 900, carried: 7 }, { points: 500 });
    expect(s.startPoints).toBe(500);
    expect(s.walk.carried).toBe(2);
  });
});

describe('settleAbandoned', () => {
  function progression() {
    const p = createProgression(memStorage());
    p.addPoints(150);
    return p;
  }

  it('counts the walk, its day and its score, as if it had been ended', () => {
    const p = progression();
    const walksBefore = p.state.walks.woods;
    const data = { ...snap(), startPoints: 100 };
    settleAbandoned(p, data);
    expect(p.state.walks.woods).toBe(walksBefore + 1);
    expect(p.state.streak).toEqual({ last: '2026-11-10', count: 1 });
    // 50 earned on the walk plus the day-1 streak bonus of 5
    expect(p.state.points).toBe(155);
    expect(p.state.bestWalk).toBe(55);
  });

  it('a dusk walk that really was dark counts as one', () => {
    const p = progression();
    settleAbandoned(p, { ...snap(), duskActive: true });
    expect(p.state.duskWalks).toBe(1);
  });

  it('a save that was replaced since never yields a negative score', () => {
    const p = progression();
    settleAbandoned(p, { ...snap(), startPoints: 9999 });
    expect(p.state.bestWalk).toBeGreaterThanOrEqual(0);
  });
});

describe('small pieces', () => {
  it('newWalkSeed is a whole number that fits the seeded streams', () => {
    expect(newWalkSeed(() => 0)).toBe(0);
    const top = newWalkSeed(() => 0.999999999);
    expect(Number.isInteger(top)).toBe(true);
    expect(top).toBeLessThan(2 ** 31);
  });

  it('the welcome back line names the place', () => {
    expect(resumeWelcome('The Woods')).toBe('Welcome back! Your walk in the Woods is right where you left it.');
    expect(resumeWelcome('Seaside')).toBe('Welcome back! Your walk in Seaside is right where you left it.');
    expect(resumeWelcome('')).toBe('Welcome back! Your walk is right where you left it.');
  });
});
