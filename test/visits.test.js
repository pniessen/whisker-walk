import { describe, it, expect } from 'vitest';
import { VISIT_PRIZES, isMilestone, milestoneIndex, latestMilestoneUpTo, styleFor, prizeFor, prizesWonBy, prizeVisit, welcomeLine, confettiCount } from '../src/visits.js';

describe('visit schedule', () => {
  it('milestones are 1, 5, then every 10', () => {
    expect([1, 5, 10, 20, 30, 90, 100, 1000].every(isMilestone)).toBe(true);
    expect([0, 2, 4, 6, 9, 11, 15, 25, 99, -10, 1.5, NaN].some(isMilestone)).toBe(false);
  });
  it('indexes milestones in order', () => {
    expect([1, 5, 10, 20, 30, 80, 90, 100].map(milestoneIndex)).toEqual([0, 1, 2, 3, 4, 9, 10, 11]);
    expect(milestoneIndex(7)).toBe(-1);
  });
  it('finds the latest milestone at or below n', () => {
    expect([0, 1, 4, 5, 9, 10, 19, 35, 100].map(latestMilestoneUpTo)).toEqual([0, 1, 1, 5, 5, 10, 10, 30, 100]);
  });
  it('visit 1 is the cat greeting, then A, B, C rotate', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(styleFor)).toEqual(['C', 'A', 'B', 'C', 'A', 'B', 'C']);
  });
  it('gives each prize once, then cycles back through owned ones', () => {
    expect(prizeFor(0)).toEqual({ id: 'partycrown', isNew: true });
    expect(prizeFor(9)).toEqual({ id: 'goldbooties', isNew: true });
    expect(prizeFor(10)).toEqual({ id: 'partycrown', isNew: false });
    expect(prizeFor(21)).toEqual({ id: 'confetticape', isNew: false });
  });
  it('lists prizes won up to a milestone', () => {
    expect(prizesWonBy(0)).toEqual([]);
    expect(prizesWonBy(5)).toEqual(['partycrown', 'confetticape']);
    expect(prizesWonBy(500)).toEqual(VISIT_PRIZES);
  });
  it('knows which visit awards a prize', () => {
    expect(prizeVisit('partycrown')).toBe(1);
    expect(prizeVisit('starshades')).toBe(10);
    expect(prizeVisit('goldbooties')).toBe(80);
    expect(prizeVisit('bell')).toBe(null);
  });
  it('welcome lines name the visit and never guilt', () => {
    for (let n = 2; n < 40; n++) {
      expect(welcomeLine(n)).toContain(String(n));
      expect(welcomeLine(n)).not.toMatch(/where were you|missed a day|finally/i);
    }
  });
  it('confetti is bigger on 10, 50 and 100, and capped', () => {
    expect(confettiCount(10)).toBeGreaterThan(confettiCount(20));
    expect(confettiCount(50)).toBeGreaterThan(confettiCount(30));
    expect(confettiCount(1)).toBeLessThan(confettiCount(20));
    expect(Math.max(...[1, 5, 10, 50, 100, 1000].map(confettiCount))).toBeLessThanOrEqual(160);
  });
});
