import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRooms } from '../src/game/rooms.js';
import { createFakeHub, createNet } from '../src/net.js';
import { createProgression } from '../src/progression.js';
import { START_GATHER_MS } from '../src/game/lobby.js';

// Child-safety pass on the lobby (game/rooms.js): the "is on a walk" toast
// never shows another device's name raw, the room list is capped, and a Start
// from someone not in the room starts nothing.

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}
function client(hub, pid, petName) {
  const progression = createProgression(fakeStorage());
  progression.setPetName(petName);
  const walks = [];
  const toasts = [];
  const made = createRooms({
    MP: 1, pid, supabaseUrl: 'x', supabaseAnonKey: 'y',
    progression, getCloud: () => null, getPsecret: () => null,
    getSession: () => null,
    startWalk: (opts) => walks.push(opts),
    toast: (t) => toasts.push(t),
    createTransport: () => hub.transport(),
  });
  return { ...made, walks, toasts };
}

let hub;
beforeEach(() => { hub = createFakeHub(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('rooms: names and members', () => {
  it('a walking stranger with a hostile name is "Your friend" in the toast', async () => {
    const kid = client(hub, 'bbbb', 'Robin');
    const res = await kid.rooms.host();
    const bad = createNet(hub.transport());
    await bad.join(res.code, { playerId: 'aaaa', petName: '<img src=x onerror=alert(1)>' });
    bad.sendState({ v: 1, id: 'aaaa', pos: [1, 2], yaw: 0, pose: 'follow', speed: 1 });
    expect(kid.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(false);
    expect(kid.toasts).toEqual(['Your friend is on a walk. Press Start when they’re back.']);
  });
  it('the room lists at most four cats, the same four on every device', async () => {
    const kid = client(hub, 'p3', 'Robin');
    const res = await kid.rooms.host();
    for (const id of ['p9', 'p1', 'p7', 'p0', 'p5']) {
      await createNet(hub.transport()).join(res.code, { playerId: id, petName: 'Spammy' });
    }
    expect(kid.rooms.getState().roster.map((p) => p.playerId)).toEqual(['p0', 'p1', 'p3', 'p5']);
  });
  it("a Start from an id that isn't in the room starts nothing", async () => {
    const kid = client(hub, 'bbbb', 'Robin');
    const res = await kid.rooms.host();
    const sender = createNet(hub.transport());
    await sender.join(res.code, { playerId: 'cccc', petName: 'Mittens' });
    sender.sendEvent({ v: 1, id: 'zzzz-not-here', type: 'walk-config', area: 'neighborhood', dusk: false, seed: 5 });
    vi.advanceTimersByTime(START_GATHER_MS * 3);
    expect(kid.walks).toEqual([]);
  });
});
