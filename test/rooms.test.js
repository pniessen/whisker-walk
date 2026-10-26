import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRooms } from '../src/game/rooms.js';
import { START_GATHER_MS } from '../src/game/lobby.js';
import { createFakeHub, createNet } from '../src/net.js';
import { createProgression } from '../src/progression.js';

// v21 Stream 2, Task 12 — pair walks. Two siblings in a colony start a walk
// together with no room code. Anyone in a room can press Start: it proposes a
// walk, every device gathers proposals for START_GATHER_MS, and all start the
// same one (v21 Play together).
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
  const pull = vi.fn(() => new Promise(() => {})); // never settles: join must not wait for it
  const made = createRooms({
    MP: 1, pid, supabaseUrl: 'x', supabaseAnonKey: 'y',
    progression, getCloud: () => null, getPsecret: () => null,
    getSession: () => session,
    startWalk: (opts) => { walks.push(opts); session = { opts }; },
    colonySync: { status: () => ({ mode }), pull },
    createTransport: () => hub.transport(),
  });
  return { ...made, progression, walks, pull, endWalk: () => { session = null; } };
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

describe('anyone can press Start, and it starts everyone', () => {
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

  it("a member's Start starts everyone in the member's area, after a short gather", async () => {
    const { host, kid } = await inPairRoom({ kid: { unlocked: ['seaside'] } });
    kid.progression.setArea('seaside');
    expect(kid.startRoomTogether({ area: 'seaside', dusk: true })).toBe(true);
    expect(kid.rooms.getState().starting).toBe(true);
    expect(host.rooms.getState().starting).toBe(true);
    expect(kid.walks).toEqual([]);

    vi.advanceTimersByTime(START_GATHER_MS);
    // The host isn't seaside-unlocked: it renders it for this walk only.
    expect(host.walks).toEqual([{ duskMode: true, roomSeed: expect.any(Number), areaOverride: 'seaside' }]);
    expect(host.progression.state.area).toBe('neighborhood');
    expect(kid.walks).toEqual([{ duskMode: true, roomSeed: host.walks[0].roomSeed }]);
    expect(kid.rooms.getState().starting).toBe(false);
  });

  it("the host's Start works the same way, and moves an unlocked member to its area", async () => {
    const { host, kid } = await inPairRoom({ kid: { unlocked: ['park'] } });
    host.progression.setArea('park');
    expect(host.startRoomTogether({ area: 'park', dusk: false })).toBe(true);
    vi.advanceTimersByTime(START_GATHER_MS);
    expect(host.walks).toEqual([{ duskMode: false, roomSeed: expect.any(Number) }]);
    expect(kid.walks).toEqual([{ duskMode: false, roomSeed: host.walks[0].roomSeed }]);
    expect(kid.progression.state.area).toBe('park');
  });

  it('a host whose phone is asleep no longer strands the room: the member just goes', async () => {
    const kid = await withSilentHost();
    expect(kid.rooms.getState().isHost).toBe(false);
    expect(kid.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(true);
    vi.advanceTimersByTime(START_GATHER_MS);
    expect(kid.walks).toEqual([{ duskMode: false, roomSeed: expect.any(Number) }]);
  });

  it('two Starts at the same moment land everyone in the same world', async () => {
    const { host, kid } = await inPairRoom({ host: { unlocked: ['park'] }, kid: { unlocked: ['seaside'] } });
    kid.startRoomTogether({ area: 'seaside', dusk: false });
    host.startRoomTogether({ area: 'park', dusk: true }); // already gathering: it adds nothing
    vi.advanceTimersByTime(START_GATHER_MS);
    expect(host.walks).toHaveLength(1);
    expect(kid.walks).toHaveLength(1);
    expect(kid.walks[0].roomSeed).toBe(host.walks[0].roomSeed);
    expect(kid.walks[0].duskMode).toBe(host.walks[0].duskMode);
  });

  it('both press before either hears the other: the smaller player id wins on both', async () => {
    const { host, kid } = await inPairRoom({ host: { unlocked: ['park'] }, kid: { unlocked: ['park', 'seaside'] } });
    // Hold the network so neither proposal arrives before both are pressed.
    const held = [];
    for (const c of [host, kid]) {
      const net = c.getPendingRoom().net;
      const real = net.sendEvent.bind(net);
      vi.spyOn(net, 'sendEvent').mockImplementation((ev) => { held.push(() => real(ev)); });
    }
    kid.startRoomTogether({ area: 'seaside', dusk: false });
    host.startRoomTogether({ area: 'park', dusk: false });
    for (const send of held) send();
    vi.advanceTimersByTime(START_GATHER_MS);
    expect(host.walks).toHaveLength(1);
    expect(kid.walks).toHaveLength(1);
    expect(kid.walks[0]).toEqual({ duskMode: false, roomSeed: host.walks[0].roomSeed });
    expect(kid.progression.state.area).toBe('park'); // the host's (smaller id) proposal
  });

  it('three in a code room all start together', async () => {
    const a = client(hub, { pid: HOST, petName: 'Mittens' });
    const b = client(hub, { pid: KID, petName: 'Robin' });
    const c = client(hub, { pid: 'cccc-cousin-03', petName: 'Pip' });
    for (const x of [a, b, c]) await x.rooms.join('ABCD');
    c.startRoomTogether({ area: 'neighborhood', dusk: false });
    vi.advanceTimersByTime(START_GATHER_MS);
    const seed = c.walks[0].roomSeed;
    for (const x of [a, b, c]) expect(x.walks).toEqual([{ duskMode: false, roomSeed: seed }]);
  });

  it('a second Start while starting is a no-op: one proposal sent', async () => {
    const kid = await withSilentHost();
    const send = vi.spyOn(kid.getPendingRoom().net, 'sendEvent');
    expect(kid.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(true);
    expect(kid.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({ v: 1, id: KID, type: 'walk-config', area: 'neighborhood', dusk: false, seed: expect.any(Number) });
    vi.advanceTimersByTime(START_GATHER_MS * 3);
    expect(kid.walks).toHaveLength(1);
  });

  it('leaving the room while starting starts nothing', async () => {
    const kid = await withSilentHost();
    kid.startRoomTogether({ area: 'neighborhood', dusk: false });
    await kid.rooms.leave();
    vi.advanceTimersByTime(START_GATHER_MS);
    expect(kid.walks).toEqual([]);
    expect(kid.rooms.getState()).toBe(null);
  });

  it('a walk ending (endWalk drops the room) also cancels a start', async () => {
    const kid = await withSilentHost();
    kid.startRoomTogether({ area: 'neighborhood', dusk: false });
    kid.clearPendingRoom();
    vi.advanceTimersByTime(START_GATHER_MS);
    expect(kid.walks).toEqual([]);
  });

  it('nobody mid-walk is pulled into another one, and Start mid-walk is refused', async () => {
    const { host, kid } = await inPairRoom();
    host.startRoomTogether({ area: 'neighborhood', dusk: false });
    vi.advanceTimersByTime(START_GATHER_MS);
    kid.endWalk(); kid.walks.length = 0; // the member came back home early
    expect(host.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(false); // host still walking
    kid.startRoomTogether({ area: 'neighborhood', dusk: false });
    vi.advanceTimersByTime(START_GATHER_MS);
    expect(host.walks).toHaveLength(1);
    expect(kid.walks).toHaveLength(1);
  });

  it("an older member's walk-request is still answered by the host", async () => {
    const { host } = await inPairRoom();
    // A previous-version client asks instead of proposing.
    const old = createNet(hub.transport());
    await old.join('P' + COLONY_ID, { playerId: 'bbbb-old-00009', petName: 'Old' });
    old.sendEvent({ v: 1, id: 'bbbb-old-00009', type: 'walk-request', area: 'neighborhood', dusk: false });
    vi.advanceTimersByTime(START_GATHER_MS);
    expect(host.walks).toEqual([{ duskMode: false, roomSeed: expect.any(Number) }]);
  });
});
