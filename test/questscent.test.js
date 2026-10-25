import { describe, it, expect } from 'vitest';
import { scentWarmth, trailCadence, objectiveDistance, questTrailStep, QUEST_TRAIL_COLOR } from '../src/questscent.js';

describe('scentWarmth', () => {
  it('is 1 at or inside near, 0 at or beyond far, and between in between', () => {
    expect(scentWarmth(0)).toBe(1);
    expect(scentWarmth(4)).toBe(1);
    expect(scentWarmth(60)).toBe(0);
    expect(scentWarmth(200)).toBe(0);
    const mid = scentWarmth(32);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('warms monotonically as the cat closes in', () => {
    expect(scentWarmth(10)).toBeGreaterThan(scentWarmth(40));
  });

  it('returns 0 for hostile input rather than NaN', () => {
    for (const bad of [NaN, Infinity, -1, undefined, null, '12']) {
      expect(scentWarmth(bad)).toBe(0);
    }
  });
});

describe('trailCadence', () => {
  it('re-lays sooner when warm than when cold', () => {
    expect(trailCadence(0)).toBeLessThan(trailCadence(60));
  });

  it('never returns zero or a non-finite interval', () => {
    for (const d of [0, 4, 32, 60, 500, NaN, -1]) {
      const c = trailCadence(d);
      expect(Number.isFinite(c)).toBe(true);
      expect(c).toBeGreaterThan(0);
    }
  });
});

describe('objectiveDistance', () => {
  it('reads "here" on top of the target and whole metres otherwise', () => {
    expect(objectiveDistance(0)).toBe('here');
    expect(objectiveDistance(1.9)).toBe('here');
    expect(objectiveDistance(23.4)).toBe('23 m');
    expect(objectiveDistance(23.6)).toBe('24 m');
  });

  it('returns null for hostile input rather than "NaN m"', () => {
    for (const bad of [NaN, Infinity, -1, undefined, null]) {
      expect(objectiveDistance(bad)).toBe(null);
    }
  });
});

describe('QUEST_TRAIL_COLOR', () => {
  it('is not the nose-trail yellow', () => {
    expect(QUEST_TRAIL_COLOR).not.toBe(0xf2e04e);
  });
  it('is not the collectible orb / balloon pink', () => {
    expect(QUEST_TRAIL_COLOR).not.toBe(0xf25c8a);
  });
});

const stubScent = () => {
  const calls = [];
  return { calls, trailTo: (from, to, opts) => { calls.push({ from, to, opts }); return to; } };
};
const activeQuest = () => ({ state: 'active', type: 'glasses', target: { x: 40, z: 0 } });

describe('questTrailStep', () => {
  it('lays a trail toward the target once the cadence has elapsed', () => {
    const scent = stubScent();
    const r = questTrailStep({ quest: activeQuest(), scent, catPos: { x: 0, z: 0 }, since: 99 });
    expect(r.laid).toBe(true);
    expect(scent.calls).toHaveLength(1);
    expect(scent.calls[0].opts.color).toBe(QUEST_TRAIL_COLOR);
  });

  it('does not lay again before the cadence has elapsed', () => {
    const scent = stubScent();
    const r = questTrailStep({ quest: activeQuest(), scent, catPos: { x: 0, z: 0 }, since: 0 });
    expect(r.laid).toBe(false);
    expect(scent.calls).toHaveLength(0);
  });

  it('lays a denser, bolder trail near the target than far from it', () => {
    const near = stubScent();
    const far = stubScent();
    const quest = activeQuest(); // target at x=40
    expect(questTrailStep({ quest, scent: near, catPos: { x: 37, z: 0 }, since: 99 }).laid).toBe(true); // ~3 m
    expect(questTrailStep({ quest, scent: far, catPos: { x: -19, z: 0 }, since: 99 }).laid).toBe(true);  // ~59 m
    const n = near.calls[0].opts;
    const f = far.calls[0].opts;
    expect(n.steps).toBeGreaterThan(f.steps);
    expect(n.peak).toBeGreaterThan(f.peak);
    expect(f.peak).toBeGreaterThanOrEqual(0.6); // even the coldest trail must read on a grey road
    expect(n.maxDist).toBe(6);
    expect(f.maxDist).toBe(6);
  });

  it('no-ops when there is no quest on this walk', () => {
    const scent = stubScent();
    for (const quest of [null, undefined]) {
      expect(questTrailStep({ quest, scent, catPos: { x: 0, z: 0 }, since: 99 }).laid).toBe(false);
    }
    expect(scent.calls).toHaveLength(0);
  });

  it('no-ops for an offered or completed quest', () => {
    const scent = stubScent();
    for (const state of ['offered', 'complete']) {
      const quest = { ...activeQuest(), state };
      expect(questTrailStep({ quest, scent, catPos: { x: 0, z: 0 }, since: 99 }).laid).toBe(false);
    }
    expect(scent.calls).toHaveLength(0);
  });

  it('no-ops when the cat is standing on the target', () => {
    const scent = stubScent();
    const quest = { ...activeQuest(), target: { x: 0, z: 0 } };
    expect(questTrailStep({ quest, scent, catPos: { x: 0, z: 0 }, since: 99 }).laid).toBe(false);
  });

  it('survives a scent handle with no trailTo', () => {
    const quest = activeQuest();
    expect(() => questTrailStep({ quest, scent: null, catPos: { x: 0, z: 0 }, since: 99 })).not.toThrow();
    expect(() => questTrailStep({ quest, scent: {}, catPos: { x: 0, z: 0 }, since: 99 })).not.toThrow();
  });

  // Reduced motion REDUCES the trail, never removes it: the trail is the
  // fairness fix this whole stream exists to ship.
  it('still lays a trail under reduced motion, with fewer prints', () => {
    const plain = stubScent();
    const reduced = stubScent();
    const at = { quest: activeQuest(), catPos: { x: 0, z: 0 }, since: 99 };
    expect(questTrailStep({ ...at, scent: plain }).laid).toBe(true);
    expect(questTrailStep({ ...at, scent: reduced, reducedMotion: true }).laid).toBe(true);
    expect(reduced.calls[0].opts.steps).toBeLessThan(plain.calls[0].opts.steps);
    expect(reduced.calls[0].opts.steps).toBeGreaterThan(0);
  });
});
