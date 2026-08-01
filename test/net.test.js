import { describe, it, expect } from 'vitest';
import { createNet, createFakeHub, generateRoomCode, validPetName } from '../src/net.js';

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
});
