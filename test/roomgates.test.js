import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCrossing, CROSS_RESEND_MS } from '../src/game/crossing.js';
import { decideWalkOnAsk, decideWalkOn, decideWalkOnHave, roomWalksOn, WALK_ON, WALK_ON_MAP, nextRoomSeed } from '../src/gatecross.js';
import { CATALOG } from '../src/progression.js';
import { setTele } from '../src/teleflag.js';
import { tele } from '../src/telehook.js';
import { teleKit } from './helpers/tele.js';
import { teleStatus } from '../src/teleport.js';
import { TELE_ENDS } from '../src/teleport.js';

// Milestone I3: an online room may cross a teleport gate. The host's check of the gate stays the host's; a guest
// follows to the same place and just visits it; a member on an older build keeps the room together instead.
const VIA = 'seaside-reef';
const BACK = 'reef-seaside';
const HOST = 'a';
const GUEST = 'b';

beforeEach(async () => { setTele(true); tele.kit = await teleKit(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); setTele(null); tele.kit = null; });

// Two devices in one room, one bus. Each has its own area loader, roster and walk-on log.
function room({ guestWalkOn = WALK_ON, areaId = 'seaside', via = VIA, guestKit = true } = {}) {
  const roster = [{ playerId: HOST, walkOn: WALK_ON }, { playerId: GUEST, walkOn: guestWalkOn }];
  const devices = {};
  const make = (id, host) => {
    const handlers = { ask: [], have: [], walkOn: [], states: [] };
    const sent = [];
    const net = {
      isHost: () => host, sendEvent: (e) => { sent.push(e); const other = devices[id === HOST ? GUEST : HOST]; if (other) other.hear(e); },
      onRoster: (fn) => { fn(roster); return () => {}; }, onState: (fn) => { handlers.states.push(fn); return () => {}; },
    };
    const s = { areaId, playerId: id, roomSeed: 7, remotes: { list: [{ playerId: id === HOST ? GUEST : HOST, petName: 'Pip' }] }, net, netOffs: [], carry: { mouth: { held: null } } };
    const toasts = [];
    const walkOn = vi.fn(() => Promise.resolve('walked'));
    const ensured = [];
    const c = createCrossing({
      getSession: () => s, overlay: { innerHTML: '' }, hud: { toast: (t) => toasts.push(t) }, releaseControl() {}, resumeWalk() {}, endWalk: vi.fn(),
      getIsTouch: () => false, getEdition: () => 'canon', catalog: CATALOG, prefetchArea() {}, walkOn,
      progression: { state: { edition: 'canon', walks: { seaside: 5 }, unlocked: { areas: [] } } },
      getRoster: () => roster, getRoomNet: () => net, ensureArea: (a) => { ensured.push(a); return Promise.resolve({}); }, isOnline: () => true,
    });
    const hear = (e) => {
      if (e.type === 'walk-on-ask') c.onWalkOnAsk(s, e);
      else if (e.type === 'walk-on-have') c.onWalkOnHave(s, e);
      else if (e.type === 'walk-on') c.onRemoteWalkOn(s, e);
      else if (e.type === 'border-cross') c.onRemote(s, e);
    };
    return (devices[id] = { c, s, sent, toasts, walkOn, ensured, hear, net });
  };
  const host = make(HOST, true);
  const guest = make(GUEST, false);
  const end = TELE_ENDS[areaId].find((e) => e.id === via);
  const hostCross = () => { host.c.askGate(host.s, { end, status: teleStatus(end, { edition: 'canon', walks: { seaside: 5 } }, CATALOG) }); host.c.confirm(); };
  return { host, guest, hostCross, end, roster };
}

describe('a room crosses a teleport gate (I3)', () => {
  it('host and guest arrive in the same place, the guest as a guest, in the same next seed', async () => {
    const r = room();
    r.hostCross();
    await vi.advanceTimersByTimeAsync(10);
    expect(r.guest.ensured).toEqual(['reef']);
    const have = r.host.sent.concat(r.guest.sent).find((e) => e.type === 'walk-on-have');
    expect(have).toMatchObject({ via: VIA, ok: true });
    expect(r.host.walkOn).toHaveBeenCalledWith({ via: VIA });
    const on = r.host.sent.find((e) => e.type === 'walk-on');
    expect(on.seed).toBe(nextRoomSeed(7, VIA));
    await vi.advanceTimersByTimeAsync(10);
    expect(r.guest.walkOn).toHaveBeenCalledWith({ via: VIA, ledBy: 'Pip', guest: true });
  });

  it('the way home through the reef\'s own arch works in a room too', async () => {
    const r = room({ areaId: 'reef', via: BACK });
    r.hostCross();
    await vi.advanceTimersByTimeAsync(20);
    expect(r.guest.ensured).toEqual(['seaside']);
    expect(r.host.walkOn).toHaveBeenCalledWith({ via: BACK });
    expect(r.guest.walkOn).toHaveBeenCalledWith({ via: BACK, ledBy: 'Pip', guest: true });
  });

  it('a member on an older build: the walk ends there, nobody walks on (no split mid-gate)', async () => {
    const r = room({ guestWalkOn: WALK_ON_MAP });
    r.hostCross();
    expect(r.host.s.crossing.endsHere).toBe(true);
    expect(r.host.sent.some((e) => e.type === 'walk-on-ask')).toBe(false);
    expect(r.host.sent.some((e) => e.type === 'border-cross')).toBe(true);
    expect(r.host.walkOn).not.toHaveBeenCalled();
    expect(r.guest.walkOn).not.toHaveBeenCalled();
  });

  it('the map\'s own gates still walk on with a version-1 member', () => {
    expect(roomWalksOn([{ walkOn: 1 }, { walkOn: 2 }])).toBe(true);
    expect(roomWalksOn([{ walkOn: 1 }, { walkOn: 2 }], WALK_ON)).toBe(false);
    expect(roomWalksOn([{ walkOn: 2 }, { walkOn: 2 }], WALK_ON)).toBe(true);
    expect(roomWalksOn([{ walkOn: 2 }, {}], WALK_ON)).toBe(false);
  });

  it('a guest with the gates off answers no cleanly and the host stays', async () => {
    const r = room();
    // the guest's gate code is not loaded: the lookup is the hook's, shared here, so test the decision as it runs there
    expect(decideWalkOnAsk({ v: 1, id: HOST, type: 'walk-on-ask', from: 'seaside', via: VIA }, { areaId: 'seaside', selfId: GUEST, remoteIds: [HOST], catalog: CATALOG }))
      .toEqual({ via: VIA, to: null });
    tele.kit = null;
    r.hostCross();
    await vi.advanceTimersByTimeAsync(10);
    // the guest has no kit: it said ok false; the host's own walk-on needs the kit too, so it never starts
    expect(r.guest.sent.find((e) => e.type === 'walk-on-have')).toMatchObject({ ok: false });
    expect(r.guest.ensured).toEqual([]);
    expect(r.host.walkOn).not.toHaveBeenCalled();
    expect(r.host.sent.some((e) => e.type === 'walk-on')).toBe(false);
  });

  it('a gate id that belongs to another place is stale, not a no', () => {
    const look = tele.kit.roomLook;
    const ctx = { areaId: 'park', selfId: GUEST, remoteIds: [HOST], catalog: CATALOG, tele: look };
    expect(decideWalkOnAsk({ v: 1, id: HOST, type: 'walk-on-ask', from: 'park', via: VIA }, ctx)).toBeNull();
  });

  it('whether a gate is awake is the host\'s check: a dormant gate asks nobody and moves nobody', async () => {
    const r = room();
    r.host.c.askGate(r.host.s, { end: r.end, status: { kind: 'dormant', to: 'reef', name: 'Reef' } });
    expect(teleStatus(r.end, { walks: { seaside: 0 } }, CATALOG).kind).toBe('dormant');
    expect(r.host.s.crossing === null || r.host.sent.length === 0).toBe(true);
    expect(r.guest.walkOn).not.toHaveBeenCalled();
  });

  it('a guest who has not opened the place just visits: the guest answers from her own build, not her save', () => {
    const look = tele.kit.roomLook;
    const ev = { v: 1, id: HOST, type: 'walk-on', from: 'seaside', via: VIA, seed: nextRoomSeed(7, VIA) };
    expect(decideWalkOn(ev, { areaId: 'seaside', selfId: GUEST, remoteIds: [HOST], catalog: CATALOG, roomSeed: 7, tele: look }))
      .toMatchObject({ via: VIA, to: 'reef' });
    const haves = decideWalkOnHave([{ v: 1, id: GUEST, type: 'walk-on-have', via: VIA, ok: true }], { areaId: 'seaside', via: VIA, selfId: HOST, remoteIds: [GUEST], catalog: CATALOG, ready: true, tele: look });
    expect(haves).toEqual({ kind: 'go' });
  });

  it('a gate in a room is no longer refused, and a guest reads the sign only', () => {
    expect(teleStatus(TELE_ENDS.seaside[0], { walks: { seaside: 9 } }, CATALOG, { inRoom: true }).kind).toBe('go');
    const near = { areaId: 'seaside' };
    const e = TELE_ENDS.seaside[0];
    const st = { edition: 'canon', walks: { seaside: 9 } };
    const asHost = tele.kit.prompt(near, { x: e.x, z: e.z }, st, true, () => {}, true, true);
    const asGuest = tele.kit.prompt(near, { x: e.x, z: e.z }, st, true, () => {}, true, false);
    expect(asHost.prompt.kind).toBe('gate');
    expect(asGuest.prompt.kind).toBe('gate-info');
  });
});
