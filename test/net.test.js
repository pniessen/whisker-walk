import { describe, it, expect } from 'vitest';
import { createNet, createFakeHub, generateRoomCode, validPetName } from '../src/net.js';
import { PHRASES } from '../src/chat.js';

describe('room codes and names', () => {
  it('generates 4-char codes from the safe alphabet', () => {
    const code = generateRoomCode(() => 0.5);
    expect(code).toHaveLength(4);
    expect(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(code)).toBe(true);
  });
  it('validates pet names', () => {
    expect(validPetName('Hagrid')).toBe(true);
    expect(validPetName('Sir Pounce-a-lot')).toBe(true);
    expect(validPetName('x')).toBe(false);
    expect(validPetName('a'.repeat(20))).toBe(false);
    expect(validPetName('h4x0r!!')).toBe(false);
  });
});

describe('createNet over a fake hub', () => {
  it('joins, exchanges roster, elects the smallest playerId as host', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('AB23', { playerId: 'aaa', petName: 'Zeetoo', breed: 'zeetoo', accessories: {} });
    await b.join('AB23', { playerId: 'bbb', petName: 'Hagrid', breed: 'hagrid', accessories: {} });
    expect(a.isHost()).toBe(true);
    expect(b.isHost()).toBe(false);
  });

  it('delivers state and events to the other peer only', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('AB23', { playerId: 'aaa', petName: 'A', breed: 'tabby', accessories: {} });
    await b.join('AB23', { playerId: 'bbb', petName: 'B', breed: 'rosa', accessories: {} });
    const seenByB = [];
    const seenByA = [];
    b.onState((s) => seenByB.push(s));
    a.onState((s) => seenByA.push(s));
    a.sendState({ v: 1, id: 'aaa', pos: [1, 2], yaw: 0, pose: 'follow', speed: 1 });
    expect(seenByB).toHaveLength(1);
    expect(seenByA).toHaveLength(0); // no echo
  });

  it('drops malformed messages', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('AB23', { playerId: 'aaa', petName: 'A', breed: 'tabby', accessories: {} });
    await b.join('AB23', { playerId: 'bbb', petName: 'B', breed: 'rosa', accessories: {} });
    const seen = [];
    b.onState((s) => seen.push(s));
    a.sendState({ v: 99, id: 'aaa', pos: [0, 0], yaw: 0, pose: 'follow', speed: 0 });
    a.sendState({ v: 1, id: 'aaa' }); // missing fields
    expect(seen).toHaveLength(0);
  });

  it('drops non-finite numeric fields (NaN/Infinity)', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('AB23', { playerId: 'aaa', petName: 'A', breed: 'tabby', accessories: {} });
    await b.join('AB23', { playerId: 'bbb', petName: 'B', breed: 'rosa', accessories: {} });
    const seen = [];
    b.onState((s) => seen.push(s));
    a.sendState({ v: 1, id: 'aaa', pos: [NaN, 0], yaw: 0, pose: 'follow', speed: 0 });
    expect(seen).toHaveLength(0);
  });

  it('host migrates when the smallest id leaves', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('AB23', { playerId: 'aaa', petName: 'A', breed: 'tabby', accessories: {} });
    await b.join('AB23', { playerId: 'bbb', petName: 'B', breed: 'rosa', accessories: {} });
    await a.leave();
    expect(b.isHost()).toBe(true);
  });

  // Regression test for the bug where a walk's onRoster subscription (wired
  // up in main.js's startWalk, well after the room's host()/join() already
  // resolved in the lobby) never saw the already-settled roster: Supabase
  // presence 'sync' only fires on a *change*, so if nobody's membership
  // changes again after the late subscriber registers, it would otherwise
  // never learn who's already in the room — remote pets simply never appear.
  it('late subscriber receives the settled roster', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('AB23', { playerId: 'aaa', petName: 'A', breed: 'tabby', accessories: {} });
    await b.join('AB23', { playerId: 'bbb', petName: 'B', breed: 'rosa', accessories: {} });

    // b registers onRoster only now — after both players already joined and
    // the roster already settled, with no further membership change coming.
    const seenByB = [];
    b.onRoster((roster) => seenByB.push(roster));

    expect(seenByB).toHaveLength(1); // fired immediately on subscribe, no new join/leave needed
    expect(seenByB[0]).toHaveLength(2);
    expect(new Set(seenByB[0].map((p) => p.playerId))).toEqual(new Set(['aaa', 'bbb']));
  });

  it('a late onRoster subscriber sees the full roster with no further membership change (lobby-to-walk shape)', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    // mirrors host()/join() in main.js: join happens in the lobby...
    await a.join('AB23', { playerId: 'aaa', petName: 'A', breed: 'tabby', accessories: {} });
    await b.join('AB23', { playerId: 'bbb', petName: 'B', breed: 'rosa', accessories: {} });

    // ...and only later, once the walk actually starts, does startWalk wire
    // up its own onRoster subscription on the SAME net instance — nobody
    // joins or leaves in between.
    let latestRoster = null;
    a.onRoster((roster) => { latestRoster = roster; });

    expect(latestRoster).not.toBeNull();
    expect(latestRoster.length).toBe(2);
  });
});

describe('chat broadcast kind', () => {
  it('delivers valid chat to peers, suppresses echo, drops invalid', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('ROOM', { playerId: 'a', petName: 'Ada', breed: 'tabby', accessories: {} });
    await b.join('ROOM', { playerId: 'b', petName: 'Bea', breed: 'tux', accessories: {} });

    const aGot = [];
    const bGot = [];
    a.onChat((m) => aGot.push(m));
    b.onChat((m) => bGot.push(m));

    a.sendChat({ v: 1, id: 'a', phraseId: PHRASES[0].id });
    expect(bGot).toHaveLength(1);
    expect(bGot[0].phraseId).toBe(PHRASES[0].id);
    expect(aGot).toHaveLength(0); // echo suppressed for the sender

    a.sendChat({ v: 1, id: 'a', phraseId: 'totally-unknown' }); // invalid → dropped
    expect(bGot).toHaveLength(1);
  });
});
