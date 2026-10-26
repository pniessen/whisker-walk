import { describe, it, expect } from 'vitest';
import { rosterIsPartnerOnly, decideLobbyEvent, pickRoomStart, START_GATHER_MS, MEMBER_GATHER_MS, WALKING_FRESH_MS, walkersIn } from '../src/game/lobby.js';

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

// v21 Stream 2, Task 12. Either sibling can press Start: a member's Start
// sends 'walk-request', the host answers with 'walk-config' for the
// requester's area, and walk-config from the host starts everyone.
describe('decideLobbyEvent', () => {
  const R = [{ playerId: 'a-host' }, { playerId: 'b-kid' }];
  const ctx = (o = {}) => ({
    roster: R, selfId: 'a-host', inWalk: false,
    knownAreas: ['neighborhood', 'park', 'seaside', 'docks'], unlockedAreas: ['neighborhood'], ...o,
  });

  it("the host answers a member's request with a config for THEIR area", () => {
    expect(decideLobbyEvent({ type: 'walk-request', id: 'b-kid', area: 'park', dusk: 1 }, ctx()))
      .toEqual({ kind: 'config', area: 'park', dusk: true });
    expect(decideLobbyEvent({ type: 'walk-request', id: 'b-kid', area: 'docks' }, ctx()))
      .toEqual({ kind: 'config', area: 'docks', dusk: false });
  });

  it('only the host answers, and never mid-walk', () => {
    expect(decideLobbyEvent({ type: 'walk-request', id: 'a-host', area: 'park' }, ctx({ selfId: 'b-kid' }))).toBe(null);
    expect(decideLobbyEvent({ type: 'walk-request', id: 'b-kid', area: 'park' }, ctx({ inWalk: true }))).toBe(null);
  });

  it('a request must come from someone else in the room', () => {
    expect(decideLobbyEvent({ type: 'walk-request', id: 'stranger', area: 'park' }, ctx())).toBe(null);
    expect(decideLobbyEvent({ type: 'walk-request', id: 'a-host', area: 'park' }, ctx())).toBe(null);
    expect(decideLobbyEvent({ type: 'walk-request', area: 'park' }, ctx())).toBe(null);
  });

  it('ignores unknown areas and non-host configs', () => {
    expect(decideLobbyEvent({ type: 'walk-request', id: 'b-kid', area: 'moon' }, ctx())).toBe(null);
    expect(decideLobbyEvent({ type: 'walk-request', id: 'b-kid', area: 'den' }, ctx())).toBe(null);
    expect(decideLobbyEvent({ type: 'walk-request', id: 'b-kid', area: 'constructor' }, ctx())).toBe(null);
    // My own proposal never comes back to me as someone else's.
    expect(decideLobbyEvent({ type: 'walk-config', id: 'b-kid', area: 'park', seed: 1 }, ctx({ selfId: 'b-kid' }))).toBe(null);
  });

  it('a config from anyone in the room is a start proposal, with an override for a locked area', () => {
    expect(decideLobbyEvent({ type: 'walk-config', id: 'a-host', area: 'park', dusk: false, seed: 7 }, ctx({ selfId: 'b-kid' })))
      .toEqual({ kind: 'propose', from: 'a-host', area: 'park', dusk: false, seed: 7, override: true });
    expect(decideLobbyEvent({ type: 'walk-config', id: 'a-host', area: 'neighborhood', dusk: 1, seed: 0 }, ctx({ selfId: 'b-kid' })))
      .toEqual({ kind: 'propose', from: 'a-host', area: 'neighborhood', dusk: true, seed: 0, override: false });
    // v21 Play together: a member's Start no longer needs the host to answer.
    expect(decideLobbyEvent({ type: 'walk-config', id: 'b-kid', area: 'park', dusk: false, seed: 9 }, ctx()))
      .toEqual({ kind: 'propose', from: 'b-kid', area: 'park', dusk: false, seed: 9, override: true });
  });

  it('a config from someone not in the room proposes nothing', () => {
    expect(decideLobbyEvent({ type: 'walk-config', id: 'stranger', area: 'park', seed: 3 }, ctx())).toBe(null);
  });

  it('a config with no usable seed or area, or mid-walk, starts nothing', () => {
    // A missing seed would make startWalk read the walk as solo (roomSeed
    // undefined), so it must never get that far.
    const base = { type: 'walk-config', id: 'a-host', area: 'park', dusk: false };
    expect(decideLobbyEvent(base, ctx({ selfId: 'b-kid' }))).toBe(null);
    expect(decideLobbyEvent({ ...base, seed: '7' }, ctx({ selfId: 'b-kid' }))).toBe(null);
    expect(decideLobbyEvent({ ...base, seed: NaN }, ctx({ selfId: 'b-kid' }))).toBe(null);
    expect(decideLobbyEvent({ ...base, seed: 7, area: 'moon' }, ctx({ selfId: 'b-kid' }))).toBe(null);
    expect(decideLobbyEvent({ ...base, seed: 7 }, ctx({ selfId: 'b-kid', inWalk: true }))).toBe(null);
  });

  it('is total over garbage', () => {
    expect(decideLobbyEvent(null, ctx())).toBe(null);
    expect(decideLobbyEvent({ type: 'meow', id: 'b-kid' }, ctx())).toBe(null);
    expect(decideLobbyEvent({ type: 'walk-request', id: 'b-kid', area: 'park' }, ctx({ roster: null }))).toBe(null);
    expect(decideLobbyEvent({ type: 'walk-request', id: 'b-kid', area: 'park' }, ctx({ roster: [] }))).toBe(null);
    expect(decideLobbyEvent({ type: 'walk-request', id: 'b-kid', area: 'park' }, {})).toBe(null);
  });
});

// v21 Play together: anyone's Start starts everyone. Each device gathers the
// proposals that arrive within START_GATHER_MS and starts the same one.
describe('pickRoomStart', () => {
  const p = (from, seed, area = 'park') => ({ from, seed, area, dusk: false });

  it('every device picks the same proposal, whatever order they arrived in', () => {
    const a = p('b-kid', 2); const b = p('a-host', 1); const c = p('c-cousin', 3);
    expect(pickRoomStart([a, b, c])).toBe(b);
    expect(pickRoomStart([c, b, a])).toBe(b);
    expect(pickRoomStart([a, c])).toBe(a);
  });

  it('a lone proposal wins', () => {
    const only = p('b-kid', 5);
    expect(pickRoomStart([only])).toBe(only);
  });

  it('is total over garbage', () => {
    expect(pickRoomStart([])).toBe(null);
    expect(pickRoomStart(null)).toBe(null);
    expect(pickRoomStart([null, { from: 7 }, 'x'])).toBe(null);
    const ok = p('b-kid', 1);
    expect(pickRoomStart([null, ok, { from: '' }])).toBe(ok);
  });

  it('a member gathers longer than the host, so a slow phone still hears the host', () => {
    // The host's own proposal always wins on the host, so only members need
    // slack for a near-simultaneous press crossing a slow link.
    expect(MEMBER_GATHER_MS).toBeGreaterThan(START_GATHER_MS);
    expect(MEMBER_GATHER_MS).toBeLessThanOrEqual(2000);
  });
});

// Never start a second world beside a sibling who is already walking: a
// device that heard someone's walk state recently knows they are out.
describe('walkersIn', () => {
  const roster = ['me', 'robin', 'pip'];

  it('names the others heard walking within WALKING_FRESH_MS', () => {
    const now = 100_000;
    const seen = { robin: now - 500, pip: now - WALKING_FRESH_MS - 1, me: now };
    expect(walkersIn(seen, roster, 'me', now)).toEqual(['robin']);
  });

  it('ignores me, strangers, and anyone gone quiet', () => {
    const now = 50_000;
    expect(walkersIn({ me: now, stranger: now }, roster, 'me', now)).toEqual([]);
    expect(walkersIn({ robin: now - WALKING_FRESH_MS }, roster, 'me', now)).toEqual([]);
  });

  it('is total over garbage', () => {
    expect(walkersIn(null, roster, 'me', 1)).toEqual([]);
    expect(walkersIn({ robin: 'x' }, roster, 'me', 1)).toEqual([]);
    expect(walkersIn({ robin: 1 }, null, 'me', 1)).toEqual([]);
    expect(walkersIn({ __proto__: 1 }, ['__proto__'], 'me', 1)).toEqual([]);
  });
});
