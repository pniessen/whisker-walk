import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRooms } from '../src/game/rooms.js';
import { START_GATHER_MS, MEMBER_GATHER_MS, WALKING_FRESH_MS } from '../src/game/lobby.js';
import { createFakeHub, createNet } from '../src/net.js';
import { createProgression } from '../src/progression.js';
import { FIND_KEY } from '../src/foundwear/spots/index.js';
import { diagnostics } from '../src/diagnostics.js';

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

// `waits`: startWalk is main.js's startWalkWhenReady, which may wait for the
// place to load. Each start then hands back a deferred the test settles with
// what startWalkWhenReady would resolve ('started' builds the walk); `starts`
// holds them in order. Without it a start builds the walk at once, as a place
// already loaded does.
function client(hub, { pid, petName, partner, colonyId = COLONY_ID, mode = 'paired', unlocked = [], getIsTouch, waits = false }) {
  const progression = createProgression(fakeStorage());
  progression.setPetName(petName);
  if (partner) progression.setColonyLink({ id: colonyId, partner: { playerId: partner.pid, petName: partner.petName, wardrobe: [] } });
  for (const id of unlocked) progression.state.unlocked.areas.push(id);
  let session = null;
  const walks = [];
  const toasts = [];
  const prefetched = [];
  const starts = [];
  const pull = vi.fn(() => new Promise(() => {})); // never settles: join must not wait for it
  const made = createRooms({
    MP: 1, pid, supabaseUrl: 'x', supabaseAnonKey: 'y',
    progression, getCloud: () => null, getPsecret: () => null,
    getSession: () => session,
    startWalk: (opts) => {
      walks.push(opts);
      if (!waits) { session = { opts }; return undefined; }
      let settle;
      let fail;
      const promise = new Promise((res, rej) => { settle = res; fail = rej; });
      starts.push({
        opts,
        resolve: (result) => { if (result === 'started') session = { opts }; settle(result); },
        reject: (err) => fail(err),
      });
      return promise;
    },
    prefetchArea: (id) => prefetched.push(id),
    colonySync: { status: () => ({ mode }), pull },
    toast: (text) => toasts.push(text),
    createTransport: () => hub.transport(),
    getIsTouch,
  });
  return { ...made, progression, walks, toasts, pull, prefetched, starts, endWalk: () => { session = null; } };
}
// A few turns of the microtask queue, so a settled start is seen.
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

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

  it('calls the pull with { freshPick: true } after a successful join', async () => {
    const { host } = pair(hub);
    await host.rooms.walkWithPartner();
    expect(host.pull).toHaveBeenCalledWith({ freshPick: true });
  });

  it('a code room is not a pair room', async () => {
    const { host } = pair(hub);
    await host.rooms.join('ABCD');
    expect(host.rooms.getState().pair).toBe(false);
    expect(host.pull).not.toHaveBeenCalled();
  });

  // Nearby joining (game/nearby.js) makes a room findable only on the device
  // whose child tapped Host. isHost cannot say that: it is the smallest id in
  // the room, which can be a joiner's.
  it('only the device that tapped Host has a hosted room', async () => {
    const { host, kid } = pair(hub);
    const res = await kid.rooms.host(); // the larger id hosts
    expect(kid.rooms.getState().hosted).toBe(true);
    await host.rooms.join(res.code);    // the smaller id joins, and becomes isHost
    expect(host.rooms.getState().hosted).toBe(false);
    expect(host.rooms.getState().isHost).toBe(true);
    expect(kid.rooms.getState().hosted).toBe(true);
    await kid.rooms.leave();
    await kid.rooms.walkWithPartner();
    expect(kid.rooms.getState().hosted).toBe(false);
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

    vi.advanceTimersByTime(MEMBER_GATHER_MS);
    // The host isn't seaside-unlocked: it renders it for this walk only.
    expect(host.walks).toEqual([{ duskMode: true, roomSeed: expect.any(Number), areaOverride: 'seaside' }]);
    expect(host.progression.state.area).toBe('neighborhood');
    expect(kid.walks).toEqual([{ duskMode: true, roomSeed: host.walks[0].roomSeed }]);
    await flush();
    expect(kid.rooms.getState().starting).toBe(false);
  });

  it("the host's Start works the same way, and moves an unlocked member to its area", async () => {
    const { host, kid } = await inPairRoom({ kid: { unlocked: ['park'] } });
    host.progression.setArea('park');
    expect(host.startRoomTogether({ area: 'park', dusk: false })).toBe(true);
    vi.advanceTimersByTime(START_GATHER_MS);
    expect(host.walks).toEqual([{ duskMode: false, roomSeed: expect.any(Number) }]);
    // The member's longer window closes a moment later, on the host's walk.
    vi.advanceTimersByTime(MEMBER_GATHER_MS - START_GATHER_MS);
    expect(kid.walks).toEqual([{ duskMode: false, roomSeed: host.walks[0].roomSeed }]);
    expect(kid.progression.state.area).toBe('park');
  });

  it('a Legacy member whose place is the Woods keeps it after a room start', async () => {
    const { host, kid } = await inPairRoom({ kid: { unlocked: ['woods'] } });
    kid.progression.setArea('woods');
    kid.progression.setEdition('legacy');
    expect(host.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(true);
    vi.advanceTimersByTime(MEMBER_GATHER_MS);
    expect(kid.walks.at(-1).areaOverride).toBe('neighborhood');
    expect(kid.progression.state.area).toBe('woods');
  });

  it('a Legacy member walks a Clan host\'s Woods without it becoming theirs', async () => {
    const { host, kid } = await inPairRoom({ host: { unlocked: ['woods'] }, kid: { unlocked: ['park', 'woods'] } });
    host.progression.setArea('woods');
    kid.progression.setArea('park');
    kid.progression.setEdition('legacy');
    host.startRoomTogether({ area: 'woods', dusk: false });
    vi.advanceTimersByTime(MEMBER_GATHER_MS);
    expect(kid.walks.at(-1).areaOverride).toBe('woods');
    expect(kid.progression.state.area).toBe('park');
  });

  it('a refused setArea never desyncs the room: the member walks the room place by override', async () => {
    const { host, kid } = await inPairRoom({ kid: { unlocked: ['park'] } });
    host.progression.setArea('park');
    // a setArea that says no (any rule it may grow): the save keeps its place
    vi.spyOn(kid.progression, 'setArea').mockImplementation(() => {});
    host.startRoomTogether({ area: 'park', dusk: false });
    vi.advanceTimersByTime(MEMBER_GATHER_MS);
    expect(kid.walks.at(-1).areaOverride).toBe('park');
    expect(kid.progression.state.area).toBe('neighborhood');
  });

  it('a host whose phone is asleep no longer strands the room: the member just goes', async () => {
    const kid = await withSilentHost();
    expect(kid.rooms.getState().isHost).toBe(false);
    expect(kid.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(true);
    vi.advanceTimersByTime(MEMBER_GATHER_MS);
    expect(kid.walks).toEqual([{ duskMode: false, roomSeed: expect.any(Number) }]);
  });

  it("a Start pressed after hearing someone else's adds nothing", async () => {
    const { host, kid } = await inPairRoom({ host: { unlocked: ['park'] }, kid: { unlocked: ['seaside'] } });
    kid.startRoomTogether({ area: 'seaside', dusk: false });
    expect(host.startRoomTogether({ area: 'park', dusk: true })).toBe(false); // already gathering
    vi.advanceTimersByTime(MEMBER_GATHER_MS);
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
    vi.advanceTimersByTime(MEMBER_GATHER_MS);
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
    vi.advanceTimersByTime(MEMBER_GATHER_MS);
    const seed = c.walks[0].roomSeed;
    for (const x of [a, b, c]) expect(x.walks).toEqual([{ duskMode: false, roomSeed: seed }]);
  });

  it('a second Start while starting is a no-op: one proposal sent', async () => {
    const kid = await withSilentHost();
    const send = vi.spyOn(kid.getPendingRoom().net, 'sendEvent');
    expect(kid.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(true);
    expect(kid.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(false);
    // A member's one press: its proposal, then the previous version's request
    // (so a host still running the old build answers it).
    expect(send.mock.calls.map((c) => c[0].type)).toEqual(['walk-config', 'walk-request']);
    expect(send.mock.calls[0][0]).toEqual({ v: 1, id: KID, type: 'walk-config', area: 'neighborhood', dusk: false, seed: expect.any(Number) });
    vi.advanceTimersByTime(MEMBER_GATHER_MS * 3);
    expect(kid.walks).toHaveLength(1);
  });

  it('leaving the room while starting starts nothing', async () => {
    const kid = await withSilentHost();
    kid.startRoomTogether({ area: 'neighborhood', dusk: false });
    await kid.rooms.leave();
    vi.advanceTimersByTime(MEMBER_GATHER_MS);
    expect(kid.walks).toEqual([]);
    expect(kid.rooms.getState()).toBe(null);
  });

  it('a walk ending (endWalk drops the room) also cancels a start', async () => {
    const kid = await withSilentHost();
    kid.startRoomTogether({ area: 'neighborhood', dusk: false });
    kid.clearPendingRoom();
    vi.advanceTimersByTime(MEMBER_GATHER_MS);
    expect(kid.walks).toEqual([]);
  });

  it('Start while I am walking is refused', async () => {
    const { host } = await inPairRoom();
    host.startRoomTogether({ area: 'neighborhood', dusk: false });
    vi.advanceTimersByTime(START_GATHER_MS);
    expect(host.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(false);
  });

  it('on a touch screen the walking-sister toast says Tap', async () => {
    const kid = client(hub, { pid: KID, petName: 'Robin', partner: { pid: HOST, petName: 'Mittens' }, getIsTouch: () => true });
    const walkingHost = createNet(hub.transport());
    await walkingHost.join('P' + COLONY_ID, { playerId: HOST, petName: 'Mittens' });
    await kid.rooms.walkWithPartner();
    walkingHost.sendState({ v: 1, id: HOST, pos: [1, 2], yaw: 0, pose: 'follow', speed: 1 });
    expect(kid.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(false);
    expect(kid.toasts).toEqual(['Mittens is exploring. Tap Explore when they’re back.']);
  });

  it("never starts a second world beside a sister who's already walking", async () => {
    const kid = client(hub, { pid: KID, petName: 'Robin', partner: { pid: HOST, petName: 'Mittens' } });
    const walkingHost = createNet(hub.transport());
    await walkingHost.join('P' + COLONY_ID, { playerId: HOST, petName: 'Mittens' });
    await kid.rooms.walkWithPartner();
    walkingHost.sendState({ v: 1, id: HOST, pos: [1, 2], yaw: 0, pose: 'follow', speed: 1 });
    expect(kid.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(false);
    expect(kid.toasts).toEqual(['Mittens is exploring. Click Explore when they’re back.']);
    expect(kid.rooms.getState().starting).toBe(false);
    // Once she has been quiet a while (home again), Start works.
    vi.advanceTimersByTime(WALKING_FRESH_MS);
    expect(kid.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(true);
  });

  it("a host proposal that arrives late, but inside a member's window, still wins", async () => {
    const { host, kid } = await inPairRoom({ host: { unlocked: ['park'] }, kid: { unlocked: ['park', 'seaside'] } });
    const hostNet = host.getPendingRoom().net;
    const real = hostNet.sendEvent.bind(hostNet);
    let late = null;
    vi.spyOn(hostNet, 'sendEvent').mockImplementation((ev) => { late = () => real(ev); });
    // Hold the member's send too, so the host doesn't hear it first.
    const kidNet = kid.getPendingRoom().net;
    const kidReal = kidNet.sendEvent.bind(kidNet);
    const kidHeld = [];
    vi.spyOn(kidNet, 'sendEvent').mockImplementation((ev) => { kidHeld.push(() => kidReal(ev)); });
    kid.startRoomTogether({ area: 'seaside', dusk: false });
    host.startRoomTogether({ area: 'park', dusk: false });
    vi.advanceTimersByTime(1_000); // a slow link: longer than the host's window
    late();
    for (const send of kidHeld) send();
    vi.advanceTimersByTime(MEMBER_GATHER_MS);
    expect(kid.walks[0]).toEqual({ duskMode: false, roomSeed: host.walks[0].roomSeed });
    expect(kid.progression.state.area).toBe('park'); // the host's walk, not the member's seaside
  });

  it('a host still on the previous version answers, and both share its world', async () => {
    const kid = client(hub, { pid: KID, petName: 'Robin', partner: { pid: HOST, petName: 'Mittens' } });
    const oldHost = createNet(hub.transport());
    await oldHost.join('P' + COLONY_ID, { playerId: HOST, petName: 'Mittens' });
    // The old host ignores a member's walk-config and answers walk-request.
    oldHost.onEvent((ev) => {
      if (ev.type === 'walk-request') oldHost.sendEvent({ v: 1, id: HOST, type: 'walk-config', area: ev.area, dusk: !!ev.dusk, seed: 4242 });
    });
    await kid.rooms.walkWithPartner();
    kid.startRoomTogether({ area: 'neighborhood', dusk: false });
    vi.advanceTimersByTime(MEMBER_GATHER_MS);
    expect(kid.walks).toEqual([{ duskMode: false, roomSeed: 4242 }]);
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

const EMBER_LOOK = { coat: 'apricot', marks: 'black', pattern: 'patches', fur: 'long', eyes: 'blue', size: 0.9 };
function equipEmber(c) {
  const id = c.progression.createCustomCat({ name: 'Ember', personality: 'fearless', look: EMBER_LOOK });
  c.progression.equipCustom(id);
  return c.progression.state.customCats.find((x) => x.id === id).look;
}

// F6: every place is its own download, so a room start may wait for its
// place (main.js hands rooms startWalkWhenReady). A slow device stays on
// "Starting…" and joins late; one whose place does not come stays home and in
// the room; neither starts anything twice, and neither throws.
describe('a room start that waits for its place', () => {
  let hub;
  beforeEach(() => { hub = createFakeHub(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  async function inPairRoom(o = {}) {
    const p = pair(hub, { host: { waits: true, ...o.host }, kid: { waits: true, ...o.kid } });
    await p.host.rooms.walkWithPartner();
    await p.kid.rooms.walkWithPartner();
    return p;
  }

  it('stays "Starting…" while the place loads, and starts nothing twice', async () => {
    const a = client(hub, { pid: HOST, petName: 'Mittens', waits: true });
    const b = client(hub, { pid: KID, petName: 'Robin', waits: true });
    for (const x of [a, b]) await x.rooms.join('ABCD');
    const other = createNet(hub.transport());
    await other.join('ABCD', { playerId: 'cccc-cousin-03', petName: 'Pip' });
    expect(b.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(true);
    await vi.advanceTimersByTimeAsync(MEMBER_GATHER_MS);
    for (const x of [a, b]) {
      expect(x.walks).toHaveLength(1);
      expect(x.rooms.getState().starting).toBe(true); // the place is still on its way
      expect(x.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(false);
    }
    // a Start heard from the room meanwhile opens no second start (and fetches nothing)
    other.sendEvent({ v: 1, id: 'cccc-cousin-03', type: 'walk-config', area: 'park', dusk: true, seed: 5 });
    await vi.advanceTimersByTimeAsync(MEMBER_GATHER_MS * 3);
    for (const x of [a, b]) {
      expect(x.walks).toHaveLength(1);
      expect(x.rooms.getState().starting).toBe(true);
      expect(x.prefetched).toEqual(['neighborhood']);
    }
    // the fast one is walking; the slow one is still getting ready
    a.starts[0].resolve('started');
    await flush();
    expect(a.rooms.getState().starting).toBe(false);
    expect(b.rooms.getState().starting).toBe(true);
    // ... and joins late, in the same world
    b.starts[0].resolve('started');
    await flush();
    expect(b.rooms.getState().starting).toBe(false);
    expect(b.walks[0].roomSeed).toBe(a.walks[0].roomSeed);
    await vi.advanceTimersByTimeAsync(MEMBER_GATHER_MS * 3);
    expect(a.walks).toHaveLength(1);
    expect(b.walks).toHaveLength(1);
  });

  it('fetches the place while the room gathers', async () => {
    const { host, kid } = await inPairRoom({ kid: { unlocked: ['seaside'] } });
    kid.startRoomTogether({ area: 'seaside', dusk: false }); // her own proposal
    expect(kid.prefetched).toEqual(['seaside']);
    expect(host.prefetched).toEqual(['seaside']); // a heard one
    // both press before either hears the other: each fetches both places
    // (only the winner is walked, and the other is likely her own anyway)
    hub = createFakeHub(); // a fresh pair of devices
    const both = await inPairRoom({ host: { unlocked: ['park'] }, kid: { unlocked: ['park', 'seaside'] } });
    const held = [];
    for (const c of [both.host, both.kid]) {
      const net = c.getPendingRoom().net;
      const real = net.sendEvent.bind(net);
      vi.spyOn(net, 'sendEvent').mockImplementation((ev) => { held.push(() => real(ev)); });
    }
    both.kid.startRoomTogether({ area: 'seaside', dusk: false });
    both.host.startRoomTogether({ area: 'park', dusk: false });
    for (const send of held) send();
    expect(both.kid.prefetched).toEqual(['seaside', 'park']);
    expect(both.host.prefetched).toEqual(['park', 'seaside']);
  });

  it('a place that fails to load leaves the member home and in the room', async () => {
    const { host, kid } = await inPairRoom();
    expect(kid.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(true);
    await vi.advanceTimersByTimeAsync(MEMBER_GATHER_MS);
    expect(kid.rooms.getState().starting).toBe(true);
    host.starts[0].resolve('started');
    kid.starts[0].resolve('failed'); // walk.js already said the gentle line
    await flush();
    expect(kid.rooms.getState()).not.toBe(null);
    expect(kid.getPendingRoom()).not.toBe(null);
    expect(kid.rooms.getState().starting).toBe(false);
    expect(kid.rooms.getState().roster.map((p) => p.playerId)).toEqual([HOST, KID]);
    await vi.advanceTimersByTimeAsync(MEMBER_GATHER_MS * 3);
    expect(kid.walks).toHaveLength(1); // no second start on its own
    // her sister is out walking: the next Explore says so, as it does today
    host.getPendingRoom().net.sendState({ v: 1, id: HOST, pos: [1, 2], yaw: 0, pose: 'follow', speed: 1 });
    expect(kid.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(false);
    expect(kid.toasts).toEqual(['Mittens is exploring. Click Explore when they’re back.']);
    expect(kid.walks).toHaveLength(1);
  });

  it('a start that was dropped or busy leaves the member home and in the room', async () => {
    for (const result of ['dropped', 'busy']) {
      hub = createFakeHub();
      const { kid } = await inPairRoom();
      kid.startRoomTogether({ area: 'neighborhood', dusk: false });
      await vi.advanceTimersByTimeAsync(MEMBER_GATHER_MS);
      expect(kid.rooms.getState().starting).toBe(true);
      kid.starts[0].resolve(result);
      await flush();
      expect(kid.rooms.getState().starting).toBe(false);
      expect(kid.getPendingRoom()).not.toBe(null);
      await kid.rooms.leave();
    }
  });

  it('a room left while its start waits: the next room is not "Starting…" and hears a proposal', async () => {
    const a = client(hub, { pid: HOST, petName: 'Mittens', waits: true });
    const b = client(hub, { pid: KID, petName: 'Robin', waits: true });
    for (const x of [a, b]) await x.rooms.join('ABCD');
    expect(b.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(true);
    await vi.advanceTimersByTimeAsync(MEMBER_GATHER_MS);
    expect(b.walks).toHaveLength(1);
    expect(b.rooms.getState().starting).toBe(true); // her place is still on its way
    await b.rooms.leave(); // she leaves during the wait ...
    const cousin = createNet(hub.transport());
    await cousin.join('WXYZ', { playerId: 'aaaa-cousin-03', petName: 'Pip' });
    await b.rooms.join('WXYZ'); // ... and joins another room
    expect(b.rooms.getState().starting).toBe(false);
    // a proposal heard in the new room is gathered and starts her
    cousin.sendEvent({ v: 1, id: 'aaaa-cousin-03', type: 'walk-config', area: 'neighborhood', dusk: false, seed: 5 });
    expect(b.rooms.getState().starting).toBe(true);
    await vi.advanceTimersByTimeAsync(MEMBER_GATHER_MS);
    expect(b.walks).toHaveLength(2);
    expect(b.walks[1].roomSeed).toBe(5);
    // the old start settling late leaves the new one "Starting…"
    b.starts[0].resolve('dropped');
    await flush();
    expect(b.rooms.getState().starting).toBe(true);
    b.starts[1].resolve('started');
    await flush();
    expect(b.rooms.getState().starting).toBe(false);
  });

  it('a walk ending (clearPendingRoom) during a start\'s wait leaves no "Starting…" behind', async () => {
    const { kid } = await inPairRoom();
    kid.startRoomTogether({ area: 'neighborhood', dusk: false });
    await vi.advanceTimersByTimeAsync(MEMBER_GATHER_MS);
    expect(kid.rooms.getState().starting).toBe(true);
    kid.clearPendingRoom();
    const cousin = createNet(hub.transport());
    await cousin.join('WXYZ', { playerId: 'aaaa-cousin-03', petName: 'Pip' });
    await kid.rooms.join('WXYZ');
    expect(kid.rooms.getState().starting).toBe(false);
    expect(kid.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(true); // her own Start works too
  });

  it('a start that throws or rejects is noted, never thrown, and Starting… ends', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = diagnostics.total;
    // rejects (a build that throws once the place has come)
    const { host, kid } = await inPairRoom();
    kid.startRoomTogether({ area: 'neighborhood', dusk: false });
    await vi.advanceTimersByTimeAsync(MEMBER_GATHER_MS);
    kid.starts[0].reject(new Error('build broke'));
    await flush();
    expect(kid.rooms.getState().starting).toBe(false);
    expect(diagnostics.entries().at(-1).kind).toBe('room');
    expect(diagnostics.total).toBe(before + 1);
    await host.rooms.leave();
    await kid.rooms.leave();
    // throws in the same tick (a place already here whose build throws)
    const c = client(hub, { pid: HOST, petName: 'Mittens' });
    const d = createRooms({
      MP: 1, pid: KID, progression: createProgression(fakeStorage()),
      getCloud: () => null, getPsecret: () => null, getSession: () => null,
      startWalk: () => { throw new Error('sync build broke'); },
      createTransport: () => hub.transport(),
    });
    await c.rooms.join('WXYZ');
    await d.rooms.join('WXYZ');
    expect(d.startRoomTogether({ area: 'neighborhood', dusk: false })).toBe(true);
    await expect(vi.advanceTimersByTimeAsync(MEMBER_GATHER_MS)).resolves.not.toThrow();
    await flush();
    expect(d.rooms.getState().starting).toBe(false);
    expect(diagnostics.total).toBe(before + 2);
  });

  it('an older device that has no such place stays home, the other walks', async () => {
    // A newer build's place: not in this build's catalog. The older device
    // never hears it as a start, so it neither starts nor throws.
    const { host, kid } = await inPairRoom();
    expect(() => kid.startRoomTogether({ area: 'nowhere', dusk: false })).not.toThrow();
    expect(host.rooms.getState().starting).toBe(false);
    await vi.advanceTimersByTimeAsync(MEMBER_GATHER_MS * 3);
    expect(host.walks).toEqual([]);
    expect(host.rooms.getState().starting).toBe(false);
    expect(host.getPendingRoom()).not.toBe(null);
    expect(kid.walks).toEqual([{ duskMode: false, roomSeed: expect.any(Number), areaOverride: 'nowhere' }]);
    kid.starts[0].resolve('started');
    await flush();
    expect(kid.rooms.getState().starting).toBe(false);
    // A place the catalog names but this build cannot load: startWalkWhenReady
    // resolves 'failed' (its gentle line), and she stays home in the room.
    hub = createFakeHub(); // a fresh pair of devices
    const old = await inPairRoom();
    old.host.startRoomTogether({ area: 'nowhere', dusk: false });
    await vi.advanceTimersByTimeAsync(START_GATHER_MS);
    expect(old.host.rooms.getState().starting).toBe(true);
    old.host.starts[0].resolve('failed');
    await flush();
    expect(old.host.rooms.getState().starting).toBe(false);
    expect(old.host.getPendingRoom()).not.toBe(null);
  });
});

describe('pushProfileNow shares the clan pick', () => {
  function pushing() {
    const cloud = { pushProfile: vi.fn(async () => 'ok') };
    const progression = createProgression(fakeStorage());
    progression.setPetName('Mittens');
    const made = createRooms({
      MP: 1, pid: HOST, supabaseUrl: 'x', supabaseAnonKey: 'y',
      progression, getCloud: () => cloud, getPsecret: () => 'sec', getSession: () => null, startWalk() {},
      colonySync: { status: () => ({ mode: 'unpaired' }), pull() {} },
      createTransport: () => createFakeHub().transport(),
    });
    return { cloud, progression, made };
  }

  it('sends accessories.home: null before a pick, the pick after, beside the seven slots', async () => {
    const { cloud, progression, made } = pushing();
    await made.pushProfileNow();
    expect(cloud.pushProfile.mock.calls[0][0].accessories.home).toBe(null);
    expect(Object.keys(cloud.pushProfile.mock.calls[0][0].accessories)).toEqual(
      expect.arrayContaining(['collar', 'head', 'face', 'neck', 'body', 'back', 'feet', 'home']));
    progression.setClanPick('woods');
    await made.pushProfileNow();
    expect(cloud.pushProfile.mock.calls[1][0].accessories.home).toBe('woods');
  });

  it('resolves true on a push that landed and false on one that failed, never rejecting', async () => {
    const { cloud, made } = pushing();
    expect(await made.pushProfileNow()).toBe(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cloud.pushProfile.mockRejectedValueOnce(new Error('down'));
    await expect(made.pushProfileNow()).resolves.toBe(false);
    warn.mockRestore();
  });

  it('a custom cat sends the preset breed, her usual pet name and the look', async () => {
    const { cloud, progression, made } = pushing();
    const saved = equipEmber({ progression });
    await made.pushProfileNow();
    const sent = cloud.pushProfile.mock.calls[0][0];
    expect(sent.breed).toBe('black');
    expect(sent.petName).toBe('Mittens');
    expect(sent.accessories.look).toEqual(saved);
    expect(Object.keys(sent.accessories)).toEqual(['collar', 'head', 'face', 'neck', 'body', 'back', 'feet', 'look', 'home']);
    const rp = made.roomProfile();
    expect([rp.breed, rp.petName, rp.accessories.look]).toEqual(['black', 'Mittens', saved]);
  });

  it('the rooms object the home base holds can push it too (the builder\'s Done)', async () => {
    const { cloud, progression, made } = pushing();
    const saved = equipEmber({ progression });
    await made.rooms.pushProfileNow();
    const sent = cloud.pushProfile.mock.calls[0][0];
    expect(sent.petName).toBe('Mittens'); // ruling 15: her pet name, not the cat's
    expect(sent.accessories.look).toEqual(saved);
  });
});

describe('a custom cat on the wire', () => {
  it('retrackProfile shows the partner the new cat in the roster', async () => {
    const hub = createFakeHub();
    const { host, kid } = pair(hub);
    await host.rooms.walkWithPartner();
    await kid.rooms.walkWithPartner();
    equipEmber(host);
    await host.rooms.retrackProfile();
    const mine = kid.rooms.getState().roster.find((p) => p.playerId === HOST);
    expect(mine.breed).toBe('black');
    expect(mine.petName).toBe('Mittens');
  });
});

// Fight moves and scars (Task 8, R7): her cat's scars ride the profile, and
// only when there is one.
describe('her cat\'s scars on the wire', () => {
  function pushing() {
    const cloud = { pushProfile: vi.fn(async () => 'ok') };
    const progression = createProgression(fakeStorage());
    progression.setPetName('Mittens');
    const made = createRooms({
      MP: 1, pid: HOST, supabaseUrl: 'x', supabaseAnonKey: 'y',
      progression, getCloud: () => cloud, getPsecret: () => 'sec', getSession: () => null, startWalk() {},
      colonySync: { status: () => ({ mode: 'unpaired' }), pull() {} },
      createTransport: () => createFakeHub().transport(),
    });
    return { cloud, progression, made };
  }
  const SLOTS = '"collar":null,"head":null,"face":null,"neck":null,"body":null,"back":null,"feet":null';

  it('an unscarred profile is byte-identical to today', async () => {
    const { cloud, made } = pushing();
    expect(JSON.stringify(made.roomProfile())).toBe(`{"playerId":"${HOST}","petName":"Mittens","breed":"tabby","accessories":{${SLOTS}},"finds":${FIND_KEY}}`);
    await made.pushProfileNow();
    expect(JSON.stringify(cloud.pushProfile.mock.calls[0][0])).toBe(
      `{"playerId":"${HOST}","secret":"sec","petName":"Mittens","breed":"tabby","accessories":{${SLOTS},"home":null},"rankTitle":${JSON.stringify(cloud.pushProfile.mock.calls[0][0].rankTitle)}}`);
  });

  it('a scarred cat carries accessories.scars in the room profile and the push', async () => {
    const { cloud, progression, made } = pushing();
    expect(progression.scarCat('tabby', 'face')).toBe(true);
    const scars = progression.catScars('tabby');
    expect(scars).toHaveLength(1);
    expect(made.roomProfile().accessories.scars).toEqual(scars);
    await made.pushProfileNow();
    expect(cloud.pushProfile.mock.calls[0][0].accessories.scars).toEqual(scars);
  });

  it('Hagrid sends no scars, whatever the save holds', async () => {
    const { progression, made } = pushing();
    progression.scarCat('tabby', 'face');
    progression.state.unlocked.cats.push('hagrid');
    progression.equipCat('hagrid');
    expect(made.roomProfile().accessories).not.toHaveProperty('scars');
  });
});
