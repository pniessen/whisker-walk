import { describe, it, expect } from 'vitest';
import { rosterIsPartnerOnly } from '../src/game/lobby.js';

// v21 Stream 2, Task 6. game/walk.js asks this at walk start: colony cats
// spawn in a room walk only when everyone else in the room is my colony
// partner, so a world shared with anybody else stays identical to theirs.
describe('rosterIsPartnerOnly (Review Focus 2)', () => {
  it('a room with a non-partner spawns no colony cats', () => {
    expect(rosterIsPartnerOnly(['me', 'sib'], 'me', 'sib')).toBe(true);
    expect(rosterIsPartnerOnly(['me', 'sib', 'stranger'], 'me', 'sib')).toBe(false);
    expect(rosterIsPartnerOnly(['me', 'sib'], 'me', undefined)).toBe(false);
  });

  it('a room with only me in it is partner-only (nobody else to disagree with)', () => {
    expect(rosterIsPartnerOnly(['me'], 'me', 'sib')).toBe(true);
    expect(rosterIsPartnerOnly([], 'me', undefined)).toBe(true);
  });

  it('a stranger alone with me is not my partner', () => {
    expect(rosterIsPartnerOnly(['me', 'stranger'], 'me', 'sib')).toBe(false);
    expect(rosterIsPartnerOnly(['stranger'], 'me', 'sib')).toBe(false);
  });

  it('is total over garbage', () => {
    expect(rosterIsPartnerOnly(null, 'me', 'sib')).toBe(false);
    expect(rosterIsPartnerOnly('me,sib', 'me', 'sib')).toBe(false);
    expect(rosterIsPartnerOnly(['me', 'sib'], 'me', '')).toBe(false);
    expect(rosterIsPartnerOnly(['me', null], 'me', 'sib')).toBe(false);
  });
});
