import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRooms } from '../src/game/rooms.js';
import { createFakeHub, createNet } from '../src/net.js';
import { createProgression } from '../src/progression.js';

// v21 Stream 2, Task 12 — pair walks. Two siblings in a colony start a walk
// together with no room code, and either of them can press Start: a member's
// Start sends 'walk-request', and the host answers with 'walk-config'.
//
// createRooms takes its transport factory as an optional dep (the Supabase one
// by default), so these run two real lobbies against net.js's in-memory hub.

const HOST = 'aaaa-host-0001';   // the smaller playerId: createNet's host
const KID = 'bbbb-kid-00002';
const COLONY_ID = '0123456789abcdef';

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

function client(hub, { pid, petName, partner, colonyId = COLONY_ID, mode = 'paired', unlocked = [] }) {
  const progression = createProgression(fakeStorage());
  progression.setPetName(petName);
  if (partner) progression.setColonyLink({ id: colonyId, partner: { playerId: partner.pid, petName: partner.petName, wardrobe: [] } });
  for (const id of unlocked) progression.state.unlocked.areas.push(id);
  let session = null;
  const walks = [];
  const toasts = [];
  const pull = vi.fn(() => new Promise(() => {})); // never settles: join must not wait for it
  const made = createRooms({
    MP: 1, pid, supabaseUrl: 'x', supabaseAnonKey: 'y',
    progression, getCloud: () => null, getPsecret: () => null,
    getSession: () => session,
    startWalk: (opts) => { walks.push(opts); session = { opts }; },
    colonySync: { status: () => ({ mode }), pull },
    toast: (text) => toasts.push(text),
    createTransport: () => hub.transport(),
  });
  return { ...made, progression, walks, toasts, pull, endWalk: () => { session = null; } };
}

function pair(hub, o = {}) {
  const host = client(hub, { pid: HOST, petName: 'Mittens', partner: { pid: KID, petName: 'Robin' }, unlocked: ['park'], ...o.host });
  const kid = client(hub, { pid: KID, petName: 'Robin', partner: { pid: HOST, petName: 'Mittens' }, ...o.kid });
  return { host, kid };
}

describe('rooms.walkWithPartner', () => {
  let hub;
  beforeEach(() => { hub = createFakeHub(); });

  it("joins the pair's own room, 'P' + the colony id, with nothing typed", async () => {
    const { host, kid } = pair(hub);
    expect(await host.rooms.walkWithPartner()).toEqual({ ok: true });
    expect(await kid.rooms.walkWithPartner()).toEqual({ ok: true });
    for (const c of [host, kid]) {
      const st = c.rooms.getState();
      expect(st.code).toBe('P' + COLONY_ID);
      expect(st.pair).toBe(true);
      expect(st.roster.map((p) => p.playerId)).toEqual([HOST, KID]);
    }
    expect(host.rooms.getState().isHost).toBe(true);
    expect(kid.rooms.getState().isHost).toBe(false);
  });

  it('reads the colony at join without waiting for it (one pull per join)', async () => {
    const { host } = pair(hub);
    await host.rooms.walkWithPartner();
    expect(host.pull).toHaveBeenCalledTimes(1);
  });

  it('a code room is not a pair room', async () => {
    const { host } = pair(hub);
    await host.rooms.join('ABCD');
    expect(host.rooms.getState().pair).toBe(false);
    expect(host.pull).not.toHaveBeenCalled();
  });

  it('refuses while not paired, without a usable colony id, or with multiplayer off', async () => {
    const unpaired = client(hub, { pid: HOST, petName: 'Mittens', mode: 'unpaired' });
    expect(await unpaired.rooms.walkWithPartner()).toEqual({ ok: false });
    for (const colonyId of ['short', 'P0123456789abcdef', '0123456789ABCDEF', '0123456789abcdeg']) {
      const odd = client(hub, { pid: HOST, petName: 'Mittens', partner: { pid: KID, petName: 'Robin' }, colonyId });
      expect(await odd.rooms.walkWithPartner()).toEqual({ ok: false });
      expect(odd.rooms.getState()).toBe(null);
    }
    const offline = createRooms({
      MP: 0, pid: HOST, progression: createProgression(fakeStorage()),
      getCloud: () => null, getPsecret: () => null, getSession: () => null, startWalk() {},
      colonySync: { status: () => ({ mode: 'paired' }), pull() {} },
      createTransport: () => hub.transport(),
    });
    expect(await offline.rooms.walkWithPartner()).toEqual({ ok: false });
  });

  it('a typed code can never reach a pair room', async () => {
    const { host } = pair(hub);
    for (const code of ['P' + COLONY_ID, 'p' + COLONY_ID, COLONY_ID, 'ABCDE', 'AB', '', null, 'AB D']) {
      expect(await host.rooms.join(code)).toEqual({ ok: false });
    }
    expect(host.rooms.getState()).toBe(null);
  });
});

describe('either sibling can press Start', () => {
  let hub;
  beforeEach(() => { hub = createFakeHub(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  // A host whose app is in the room but not answering (asleep in a pocket,
  // say): present in the roster, deaf to events.
  async function withSilentHost() {
    const kid = client(hub, { pid: KID, petName: 'Robin', partner: { pid: HOST, petName: 'Mittens' } });
    await createNet(hub.transport()).join('P' + COLONY_ID, { playerId: HOST, petName: 'Mittens' });
    await kid.rooms.walkWithPartner();
    return kid;
  }

  async function inPairRoom(o) {
    const p = pair(hub, o);
    await p.host.rooms.walkWithPartner();
    await p.kid.rooms.walkWithPartner();
    return p;
  }

  it("the member's Start asks, and the host starts everyone in the member's area", async () => {
    const { host, kid } = await inPairRoom({ kid: { unlocked: ['seaside'] } });
    kid.progression.setArea('seaside');
    expect(kid.requestRoomWalk({ area: 'seaside', dusk: true })).toBe(true);

    // The host isn't seaside-unlocked: it renders it for this walk only.
    expect(host.walks).toHaveLength(1);
    const [h] = host.walks;
    expect(h).toEqual({ duskMode: true, roomSeed: expect.any(Number), areaOverride: 'seaside' });
    expect(host.progression.state.area).toBe('neighborhood');
    // The member got the host's config, with the same seed.
    expect(kid.walks).toEqual([{ duskMode: true, roomSeed: h.roomSeed }]);
    expect(kid.rooms.getState().starting).toBe(false);

    vi.advanceTimersByTime(10_000);
    expect(kid.toasts).toEqual([]); // the walk started: no "didn't answer"
  });

  it("the host's own Start still works, and moves an unlocked member to its area", async () => {
    const { host, kid } = await inPairRoom({ kid: { unlocked: ['park'] } });
    host.progression.setArea('park');
    host.hostRoomWalk({ area: 'park', dusk: false });
    expect(host.walks).toEqual([{ duskMode: false, roomSeed: expect.any(Number) }]);
    expect(kid.walks).toEqual([{ duskMode: false, roomSeed: host.walks[0].roomSeed }]);
    expect(kid.progression.state.area).toBe('park');
  });

  it("nobody answers: after 6 s, a plain toast and the button comes back", async () => {
    const kid = await withSilentHost();
    expect(kid.rooms.getState().isHost).toBe(false);
    expect(kid.requestRoomWalk({ area: 'neighborhood', dusk: false })).toBe(true);
    vi.advanceTimersByTime(5_999);
    expect(kid.toasts).toEqual([]);
    expect(kid.rooms.getState().starting).toBe(true);
    vi.advanceTimersByTime(1);
    expect(kid.toasts).toEqual(["Mittens didn't answer — are they on the home screen?"]);
    expect(kid.rooms.getState().starting).toBe(false);
    expect(kid.walks).toEqual([]);
  });

  it("a host that's mid-walk doesn't answer, and a code room says 'They'", async () => {
    const host = client(hub, { pid: HOST, petName: 'Mittens' });
    const kid = client(hub, { pid: KID, petName: 'Robin' });
    await host.rooms.join('ABCD');
    await kid.rooms.join('ABCD');
    host.hostRoomWalk({ area: 'neighborhood', dusk: false }); // the host is walking
    kid.endWalk(); kid.walks.length = 0;                      // the member came back home early
    kid.requestRoomWalk({ area: 'neighborhood', dusk: false });
    expect(host.walks).toHaveLength(1);
    vi.advanceTimersByTime(6_000);
    expect(kid.toasts).toEqual(["They didn't answer — are they on the home screen?"]);
  });

  it('a second Start while starting is a no-op: one request, one timer', async () => {
    const kid = await withSilentHost();
    const send = vi.spyOn(kid.getPendingRoom().net, 'sendEvent');
    expect(kid.requestRoomWalk({ area: 'neighborhood', dusk: false })).toBe(true);
    expect(kid.requestRoomWalk({ area: 'neighborhood', dusk: false })).toBe(false);
    expect(send.mock.calls).toEqual([[{ v: 1, id: KID, type: 'walk-request', area: 'neighborhood', dusk: false }]]);
    vi.advanceTimersByTime(12_000);
    expect(kid.toasts).toHaveLength(1);
  });

  it('leaving the room clears the wait: no toast later, and Start works again at once', async () => {
    const kid = await withSilentHost();
    kid.requestRoomWalk({ area: 'neighborhood', dusk: false });
    expect(kid.rooms.getState().starting).toBe(true);
    await kid.rooms.leave();
    vi.advanceTimersByTime(3_000);
    await kid.rooms.walkWithPartner();
    expect(kid.rooms.getState().starting).toBe(false);
    expect(kid.requestRoomWalk({ area: 'neighborhood', dusk: false })).toBe(true);
    vi.advanceTimersByTime(6_000);
    expect(kid.toasts).toHaveLength(1);
  });

  it('a walk ending (endWalk drops the room) also clears the wait', async () => {
    const kid = await withSilentHost();
    kid.requestRoomWalk({ area: 'neighborhood', dusk: false });
    kid.clearPendingRoom();
    vi.advanceTimersByTime(6_000);
    expect(kid.toasts).toEqual([]);
  });

  it("a member's request is never sent by the host, and the host never asks", async () => {
    const { host, kid } = await inPairRoom();
    expect(host.requestRoomWalk({ area: 'neighborhood', dusk: false })).toBe(false);
    expect(kid.walks).toEqual([]);
    expect(host.rooms.getState().starting).toBe(false);
  });
});
