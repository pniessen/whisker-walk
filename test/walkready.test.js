import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mulberry32 } from '../src/rng.js';
import { phrase } from '../src/clanphrases.js';
import { NO_FARM } from '../src/farmnone.js';
import { NO_FAIR } from '../src/fairnone.js';
import { createAreaLoader } from '../src/game/areaload.js';
import { GETTING_READY_DELAY_MS, RELOAD_AFTER_FAILURES } from '../src/game/walk.js';
import { lifecycle, controlledLoader, fakeEl, memStorage } from './helpers/walklife.js';
import { createFakeHub, createNet } from '../src/net.js';
import { nowSec } from '../src/game/util.js';
import { RESUME_KEY, pickUpWalk, readResume, snapshotWalk, writeResume } from '../src/game/walkresume.js';

// =============================================================================
// F6: a walk loads its place before it starts (walk.js startWalkWhenReady).
// Every place is its own download (world/areas.js, game/areaload.js), so a tap
// on Explore may land before the place has come. Then home stays up, the
// button says "Getting ready…" if the wait is long enough to notice, and the
// walk starts once the place is here; a place that cannot come keeps her home
// with one gentle line. A place already here starts in the same tick, exactly
// as before, and a walk that waited is the same walk, draw for draw.
//
// walk.js's lifecycle is booted headless (test/helpers/walklife.js) over a
// loader whose loads the test holds and lets go.
// =============================================================================

// The solo walk's seed is the first Math.random draw startWalk makes
// (walkresume.js newWalkSeed): this queues the draw that gives `seed`.
let stream = null;
let queued = [];
const nextWalkSeed = (seed) => queued.push((seed + 0.5) / 2 ** 31);
const resetRandom = () => { stream = mulberry32(20261120); queued = []; };

beforeAll(async () => {
  // Warm the module cache, so a released load lands in a few microtasks.
  await createAreaLoader().ensureAll(['park', 'den', 'farm', 'fair']);
});
beforeEach(() => {
  globalThis.document = { body: fakeEl(), createElement: fakeEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: new Date('2026-11-20T15:00:00Z') });
  resetRandom();
  vi.spyOn(Math, 'random').mockImplementation(() => (queued.length ? queued.shift() : stream()));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  delete globalThis.document;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// A few turns of the microtask queue (no timers), so a released load lands.
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const end = (life) => { if (life.getSession()) life.w.endWalk(); };

describe('a place already here', () => {
  it('a loaded place starts in the same tick, as before', async () => {
    const { areas } = controlledLoader();
    await areas.ensure('park');
    const life = lifecycle({ areas });
    const p = life.w.startWalkWhenReady({ areaOverride: 'park' });
    expect(life.getSession()?.areaId).toBe('park');
    expect(await p).toBe('started');
    expect(life.rec.gettingReady).toEqual([]);
    end(life);
  });

  it('startWalk without a loaded place throws before it touches the save', () => {
    const life = lifecycle({ areas: controlledLoader().areas });
    const visit = life.progression.recordVisit(); // visit 1: a present held for the tap
    const prize = visit.milestone.prize;
    expect(life.progression.state.visitPrizePending).toBe(prize.id);
    expect(() => life.w.startWalk({ areaOverride: 'park' })).toThrow(/not loaded/);
    expect(life.progression.state.visitPrizePending).toBe(prize.id);
    expect(life.progression.state.equipped[prize.slot]).not.toBe(prize.id);
    expect(life.getSession()).toBe(null);
  });
});

describe('a place still on its way', () => {
  it('a place still loading starts once it has loaded, with "Getting ready…" only after 150 ms', async () => {
    expect(GETTING_READY_DELAY_MS).toBe(150);
    const ctl = controlledLoader();
    const park = ctl.hold('park');
    const life = lifecycle({ areas: ctl.areas });
    const p = life.w.startWalkWhenReady({ areaOverride: 'park' });
    expect(life.getSession()).toBe(null);
    await vi.advanceTimersByTimeAsync(149);
    expect(life.rec.gettingReady).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(life.rec.gettingReady).toEqual([true]);
    expect(life.getSession()).toBe(null);
    park.release();
    expect(await p).toBe('started');
    expect(life.getSession()?.areaId).toBe('park');
    expect(life.rec.gettingReady).toEqual([true, false]);
    end(life);
  });

  it('a quick load never shows "Getting ready…"', async () => {
    const ctl = controlledLoader();
    const park = ctl.hold('park');
    const life = lifecycle({ areas: ctl.areas });
    const p = life.w.startWalkWhenReady({ areaOverride: 'park' });
    await vi.advanceTimersByTimeAsync(50);
    park.release();
    expect(await p).toBe('started');
    await vi.advanceTimersByTimeAsync(500);
    expect(life.rec.gettingReady).not.toContain(true);
    expect(life.getSession()?.areaId).toBe('park');
    end(life);
  });

  it('makes the sound context inside the tap, before waiting', async () => {
    const ctl = controlledLoader();
    const park = ctl.hold('park');
    const life = lifecycle({ areas: ctl.areas });
    const p = life.w.startWalkWhenReady({ areaOverride: 'park' });
    expect(life.rec.soundContexts).toBe(1);
    park.release();
    await p;
    end(life);
  });

  it('a second Explore or the den while loading is ignored: one load, one walk', async () => {
    const ctl = controlledLoader();
    const park = ctl.hold('park');
    await ctl.areas.ensure('den');
    const life = lifecycle({ areas: ctl.areas });
    const p = life.w.startWalkWhenReady({ areaOverride: 'park' });
    expect(await life.w.startWalkWhenReady({ areaOverride: 'park' })).toBe('busy');
    expect(await life.w.startWalkWhenReady({ areaOverride: 'den' })).toBe('busy');
    expect(life.getSession()).toBe(null);
    expect(ctl.calls.park).toBe(1);
    park.release();
    expect(await p).toBe('started');
    expect(life.getSession()?.areaId).toBe('park');
    expect(ctl.calls.park).toBe(1);
    end(life);
  });

  it('the den button waits for the den the same way', async () => {
    const ctl = controlledLoader();
    const den = ctl.hold('den');
    const life = lifecycle({ areas: ctl.areas });
    const p = life.w.beginDenWalk();
    expect(life.getSession()).toBe(null);
    den.release();
    expect(await p).toBe('started');
    expect(life.getSession()?.areaId).toBe('den');
    end(life);
  });
});

describe('a place that does not come', () => {
  it('a load that fails keeps her home with the gentle line, and Explore tries again', async () => {
    const ctl = controlledLoader();
    const park = ctl.hold('park');
    const life = lifecycle({ areas: ctl.areas });
    const p = life.w.startWalkWhenReady({ areaOverride: 'park' });
    await vi.advanceTimersByTimeAsync(200);
    park.fail();
    expect(await p).toBe('failed');
    expect(life.getSession()).toBe(null);
    expect(life.rec.gettingReady).toEqual([true, false]);
    expect(life.rec.toasts).toEqual([phrase('start.notReady')]);
    // the next Explore asks for the place again, and this time it comes
    ctl.letGo('park');
    expect(await life.w.startWalkWhenReady({ areaOverride: 'park' })).toBe('started');
    expect(ctl.calls.park).toBe(2);
    expect(life.getSession()?.areaId).toBe('park');
    end(life);
  });

  it('offline, the line says the place needs the internet', async () => {
    const ctl = controlledLoader();
    ctl.hold('park').fail();
    const life = lifecycle({ areas: ctl.areas, online: () => false });
    expect(await life.w.startWalkWhenReady({ areaOverride: 'park' })).toBe('failed');
    expect(life.rec.toasts).toEqual([phrase('start.notReadyOffline')]);
    // offline, no amount of failing reloads the page: it would only fail too
    expect(await life.w.startWalkWhenReady({ areaOverride: 'park' })).toBe('failed');
    expect(await life.w.startWalkWhenReady({ areaOverride: 'park' })).toBe('failed');
    expect(life.rec.reloads).toBe(0);
    expect(life.rec.toasts.every((t) => t === phrase('start.notReadyOffline'))).toBe(true);
  });

  it('after two failures online the line offers a fresh start and the next Explore reloads', async () => {
    expect(RELOAD_AFTER_FAILURES).toBe(2);
    const ctl = controlledLoader();
    ctl.hold('park').fail();
    const life = lifecycle({ areas: ctl.areas });
    expect(await life.w.startWalkWhenReady({ areaOverride: 'park' })).toBe('failed');
    expect(await life.w.startWalkWhenReady({ areaOverride: 'park' })).toBe('failed');
    expect(life.rec.toasts).toEqual([phrase('start.notReady'), phrase('start.notReadyReload')]);
    expect(ctl.calls.park).toBe(2);
    expect(life.rec.reloads).toBe(0);
    expect(await life.w.startWalkWhenReady({ areaOverride: 'park' })).toBe('failed');
    expect(life.rec.reloads).toBe(1);
    expect(ctl.calls.park).toBe(2); // the reload is the try: no third load
    expect(life.getSession()).toBe(null);
  });

  it('two failures must be in a row: a walk that starts between them clears the count', async () => {
    const ctl = controlledLoader();
    await ctl.areas.ensure('den');
    ctl.hold('park').fail();
    const life = lifecycle({ areas: ctl.areas });
    expect(await life.w.startWalkWhenReady({ areaOverride: 'park' })).toBe('failed');
    expect(await life.w.startWalkWhenReady({ areaOverride: 'den' })).toBe('started'); // a place already here, same tick
    end(life);
    expect(await life.w.startWalkWhenReady({ areaOverride: 'park' })).toBe('failed');
    expect(life.rec.toasts).toEqual([phrase('start.notReady'), phrase('start.notReady')]);
    expect(await life.w.startWalkWhenReady({ areaOverride: 'park' })).toBe('failed'); // now two in a row
    expect(life.rec.toasts.at(-1)).toBe(phrase('start.notReadyReload'));
    expect(life.rec.reloads).toBe(0);
  });

  it('a place this build does not have never counts toward a fresh start', async () => {
    const life = lifecycle({ areas: controlledLoader().areas });
    for (let i = 0; i < 3; i++) expect(await life.w.startWalkWhenReady({ areaOverride: 'nowhere' })).toBe('failed');
    expect(life.rec.toasts).toEqual([phrase('start.notReady'), phrase('start.notReady'), phrase('start.notReady')]);
    expect(life.rec.reloads).toBe(0);
    expect(life.getSession()).toBe(null);
    // offline it still says the offline line
    const off = lifecycle({ areas: controlledLoader().areas, online: () => false });
    expect(await off.w.startWalkWhenReady({ areaOverride: 'nowhere' })).toBe('failed');
    expect(off.rec.toasts).toEqual([phrase('start.notReadyOffline')]);
  });

  it('a place changed while hers was coming starts nothing: no walk somewhere else, no throw', async () => {
    // her place is the Park; Explore (no override) waits for it
    const inThePark = (life) => {
      life.progression.completeWalk('neighborhood');
      life.progression.completeWalk('neighborhood');
      expect(life.progression.buy('areas', 'park')).toBe(true);
      life.progression.setArea('park');
      expect(life.progression.state.area).toBe('park');
    };
    // the place she changed to is here already: it must not start instead
    const ctl = controlledLoader();
    await ctl.areas.ensure('neighborhood');
    const park = ctl.hold('park');
    const life = lifecycle({ areas: ctl.areas });
    inThePark(life);
    const p = life.w.startWalkWhenReady({ duskMode: false });
    life.progression.setArea('neighborhood'); // Change place while the Park comes
    park.release();
    expect(await p).toBe('dropped');
    expect(life.getSession()).toBe(null);
    // the place she changed to is not here: no 'not loaded' throw either
    const ctl2 = controlledLoader();
    const park2 = ctl2.hold('park');
    const life2 = lifecycle({ areas: ctl2.areas });
    inThePark(life2);
    const q = life2.w.startWalkWhenReady({ duskMode: false });
    life2.progression.setArea('neighborhood');
    park2.release();
    expect(await q).toBe('dropped');
    expect(life2.getSession()).toBe(null);
    expect(ctl2.calls.neighborhood).toBeUndefined();
  });

  it('a load that lands after she is already walking, or after the room is gone, starts nothing', async () => {
    const ctl = controlledLoader();
    await ctl.areas.ensure('den');
    const park = ctl.hold('park');
    const life = lifecycle({ areas: ctl.areas });
    const p = life.w.startWalkWhenReady({ areaOverride: 'park' });
    life.w.startWalk({ areaOverride: 'den' }); // a walk began some other way meanwhile
    park.release();
    expect(await p).toBe('dropped');
    expect(life.getSession()?.areaId).toBe('den');
    end(life);

    const fair = ctl.hold('fair');
    life.setPendingRoom({ code: 'ABCD', roster: [] });
    const q = life.w.startWalkWhenReady({ roomSeed: 99, areaOverride: 'fair' });
    life.setPendingRoom(null); // the room went while the place was coming
    fair.release();
    expect(await q).toBe('dropped');
    expect(life.getSession()).toBe(null);
  });
});

describe('a room start that waited', () => {
  it('a room left and another joined while the place came starts nothing in the new room', async () => {
    const ctl = controlledLoader();
    const fair = ctl.hold('fair');
    const life = lifecycle({ areas: ctl.areas });
    life.setPendingRoom({ code: 'ABCD', roster: [] });
    const p = life.w.startWalkWhenReady({ roomSeed: 99, areaOverride: 'fair' });
    life.setPendingRoom(null); // she left the room ...
    life.setPendingRoom({ code: 'WXYZ', roster: [] }); // ... and joined another
    fair.release();
    expect(await p).toBe('dropped');
    expect(life.getSession()).toBe(null);
  });

  it('the same room still there starts the walk', async () => {
    const ctl = controlledLoader();
    const fair = ctl.hold('fair');
    const life = lifecycle({ areas: ctl.areas });
    const room = { code: 'ABCD', roster: [] };
    life.setPendingRoom(room);
    const p = life.w.startWalkWhenReady({ roomSeed: 99, areaOverride: 'fair' });
    room.roster = [{ playerId: 'me' }]; // the room object changes inside; it is still the same room
    fair.release();
    expect(await p).toBe('started');
    end(life);
  });
});

// A co-walker whose device is still loading its place sends no state, so the
// walk already under way lets its cat go after DESPAWN_AFTER (remotecats.js).
// When it does arrive, its first state draws it again from the room's roster.
describe('a co-walker who arrives late', () => {
  const PEER = 'bbbb-peer-0002';
  async function roomWalk({ blockList } = {}) {
    const hub = createFakeHub();
    const mine = createNet(hub.transport());
    await mine.join('ABCD', { playerId: 'me', petName: 'Mittens' });
    const peer = createNet(hub.transport());
    await peer.join('ABCD', { playerId: PEER, petName: 'Robin' });
    const ctl = controlledLoader();
    await ctl.areas.ensure('park');
    const life = lifecycle({ areas: ctl.areas, blockList });
    life.setPendingRoom({ net: mine, code: 'ABCD', roster: [] });
    expect(await life.w.startWalkWhenReady({ roomSeed: 7, areaOverride: 'park' })).toBe('started');
    return { life, peer };
  }
  const ids = (s) => s.remotes.list.map((r) => r.playerId);
  const state = (pos) => ({ v: 1, id: PEER, pos, yaw: 0, pose: 'follow', speed: 1 });

  it('a member silent past DESPAWN_AFTER is drawn again, where it is, when its state comes', async () => {
    const { life, peer } = await roomWalk();
    const s = life.getSession();
    expect(ids(s)).toEqual([PEER]); // in the room from the start ...
    expect(s.remotes.list[0].group.visible).toBe(false); // ... but not drawn before its first state
    expect(s.remotes.placed).toEqual([]);
    s.remotes.update(0.1, nowSec() + 6); // still loading: quiet for more than 5 s
    expect(ids(s)).toEqual([]);
    peer.sendState(state([3, -4]));
    expect(ids(s)).toEqual([PEER]);
    const cat = s.remotes.list[0];
    expect(cat.petName).toBe('Robin');
    expect([cat.group.position.x, cat.group.position.z]).toEqual([3, -4]);
    expect(cat.group.visible).toBe(true);
    expect(s.remotes.placed).toEqual([cat]);
    end(life);
  });

  it('a hidden visitor is not drawn again by its state', async () => {
    const { life, peer } = await roomWalk({ blockList: new Set([PEER]) });
    const s = life.getSession();
    expect(ids(s)).toEqual([]);
    peer.sendState(state([3, -4]));
    expect(ids(s)).toEqual([]);
    end(life);
  });

  it('state for someone not in the room is still dropped', async () => {
    // net.js admits state only from the roster; the walk's handler holds the
    // same line on its own (the roster it last heard), fed here directly.
    const hub = createFakeHub();
    const mine = createNet(hub.transport());
    await mine.join('ABCD', { playerId: 'me', petName: 'Mittens' });
    const handlers = [];
    const real = mine.onState.bind(mine);
    mine.onState = (fn) => { handlers.push(fn); real(fn); };
    const ctl = controlledLoader();
    await ctl.areas.ensure('park');
    const life = lifecycle({ areas: ctl.areas });
    life.setPendingRoom({ net: mine, code: 'ABCD', roster: [] });
    expect(await life.w.startWalkWhenReady({ roomSeed: 7, areaOverride: 'park' })).toBe('started');
    expect(handlers).toHaveLength(1);
    handlers[0]({ v: 1, id: 'zzzz-stranger', pos: [1, 1], yaw: 0, pose: 'follow', speed: 1 });
    expect(life.getSession().remotes.list).toEqual([]);
    end(life);
  });
});

describe('a walk that waited is the same walk', () => {
  // What a walk's draws decided: the weather, the secrets, the strays, the
  // goals and the critters, with where each one is.
  const at = (o) => [Math.round(o.position.x * 1e4) / 1e4, Math.round(o.position.z * 1e4) / 1e4];
  const drawn = (s) => ({
    weather: s.weather.condition,
    secrets: s.secrets.list.map((x) => [x.key, ...at(x.group)]),
    strays: s.strayCats.strays.map((c) => [c.name, ...at(c.group)]),
    goals: s.goals?.goals.map((g) => g.id) ?? null,
    critters: s.critters.list.map((c) => [c.type, ...at(c.group)]),
  });

  it('waiting draws nothing: a seeded walk loaded late is the same walk as one loaded first', async () => {
    const first = controlledLoader();
    await first.areas.ensure('park');
    const a = lifecycle({ areas: first.areas });
    a.setPendingRoom({ code: 'ABCD', roster: [] });
    resetRandom();
    a.w.startWalkWhenReady({ roomSeed: 1234, areaOverride: 'park', duskMode: false });
    const walkA = drawn(a.getSession());
    end(a);

    const late = controlledLoader();
    const park = late.hold('park');
    const b = lifecycle({ areas: late.areas });
    b.setPendingRoom({ code: 'ABCD', roster: [] });
    resetRandom();
    const p = b.w.startWalkWhenReady({ roomSeed: 1234, areaOverride: 'park', duskMode: false });
    await vi.advanceTimersByTimeAsync(300);
    park.release();
    expect(await p).toBe('started');
    const walkB = drawn(b.getSession());
    end(b);

    expect(walkA.strays.length).toBeGreaterThan(0);
    expect(walkA.critters.length).toBeGreaterThan(0);
    expect(walkB).toEqual(walkA);
  });

  it('a solo walk loaded late still takes its seed from the first random draw', async () => {
    const ctl = controlledLoader();
    const park = ctl.hold('park');
    const life = lifecycle({ areas: ctl.areas });
    nextWalkSeed(4242);
    const p = life.w.startWalkWhenReady({ areaOverride: 'park' });
    await vi.advanceTimersByTimeAsync(300);
    park.release();
    expect(await p).toBe('started');
    expect(life.getSession().soloSeed).toBe(4242);
    end(life);
  });
});

describe('what comes with each place', () => {
  async function roomWalk(areaId, duskMode) {
    const ctl = controlledLoader();
    const hold = ctl.hold(areaId);
    const life = lifecycle({ areas: ctl.areas });
    life.setPendingRoom({ code: 'ABCD', roster: [] });
    const p = life.w.startWalkWhenReady({ roomSeed: 77, areaOverride: areaId, duskMode });
    hold.release();
    expect(await p).toBe('started');
    return life;
  }

  it('a Fairground dusk walk lights the bulbs and a day walk does not', async () => {
    const dusk = await roomWalk('fair', true);
    expect(dusk.getSession().areaData.glow.level).toBe(1);
    end(dusk);
    const day = await roomWalk('fair', false);
    expect(day.getSession().areaData.glow.level).toBe(0);
    end(day);
  });

  it('the Farm walk gets its animals and the Fair its rides from the pack', async () => {
    const farm = await roomWalk('farm', false);
    expect(farm.getSession().farm).not.toBe(NO_FARM);
    expect(farm.getSession().fair).toBe(NO_FAIR);
    end(farm);
    const fair = await roomWalk('fair', false);
    expect(fair.getSession().fair).not.toBe(NO_FAIR);
    expect(fair.getSession().farm).toBe(NO_FARM);
    end(fair);
    const park = await roomWalk('park', false);
    expect(park.getSession().farm).toBe(NO_FARM);
    expect(park.getSession().fair).toBe(NO_FAIR);
    end(park);
  });
});

// Mid-walk resume (walkresume.js pickUpWalk, main.js's boot): a walk picked up
// again waits for its place like any start. A place that does not come keeps
// her home with the note left, its try counted, for a later launch
// (RESUME_MAX_TRIES settles it then). A build that throws, straight away or
// once the place has come, settles the walk now: the note is forgotten, the
// walk counts as walked, and a half-built walk starts the page again clean.
describe('a walk picked up again waits for its place', () => {
  // A real note, from a real Park walk.
  async function parkNote() {
    const ctl = controlledLoader();
    await ctl.areas.ensure('park');
    const life = lifecycle({ areas: ctl.areas });
    life.w.startWalkWhenReady({ areaOverride: 'park' });
    const data = snapshotWalk(life.getSession(), { yaw: 0.5, now: Date.now() });
    end(life);
    expect(data).toMatchObject({ areaId: 'park', tries: 0 });
    return data;
  }
  const read = (storage) => readResume(storage, { now: Date.now(), areaIds: ['park'] });
  function pickUp(life, storage, data) {
    const rec = { reloads: 0, notes: [] };
    const p = pickUpWalk({
      storage, data, progression: life.progression,
      startWalkWhenReady: life.w.startWalkWhenReady,
      getSession: life.getSession,
      reload: () => { rec.reloads++; },
      note: (kind, err) => rec.notes.push([kind, err?.message]),
    });
    return { p, rec };
  }

  it('a place already here picks the walk up in the same tick', async () => {
    const data = await parkNote();
    const ctl = controlledLoader();
    await ctl.areas.ensure('park');
    const life = lifecycle({ areas: ctl.areas });
    const storage = memStorage();
    writeResume(storage, data);
    const { p } = pickUp(life, storage, data);
    expect(life.getSession()?.areaId).toBe('park');
    expect(life.getSession().resumed).toBe(true);
    expect(await p).toBe('started');
    expect(read(storage).data.tries).toBe(1);
    end(life);
  });

  it('a place that does not come keeps her home and the note, with its try counted', async () => {
    const data = await parkNote();
    const ctl = controlledLoader();
    const park = ctl.hold('park');
    const life = lifecycle({ areas: ctl.areas });
    const storage = memStorage();
    writeResume(storage, data);
    const walked = life.progression.state.walks.park ?? 0;
    const { p, rec } = pickUp(life, storage, data);
    expect(read(storage).data.tries).toBe(1); // counted before the wait
    park.fail();
    expect(await p).toBe('failed');
    expect(life.getSession()).toBe(null);
    expect(life.rec.toasts).toEqual([phrase('start.notReady')]);
    expect(read(storage)).toEqual({ kind: 'resume', data: { ...data, tries: 1 } });
    expect(life.progression.state.walks.park ?? 0).toBe(walked); // not settled yet
    expect(rec.reloads).toBe(0);
    expect(rec.notes).toEqual([]);
  });

  it('a build that throws once the place has come settles the walk, and never throws out', async () => {
    const data = await parkNote();
    const ctl = controlledLoader();
    const park = ctl.hold('park');
    const life = lifecycle({ areas: ctl.areas });
    const storage = memStorage();
    writeResume(storage, data);
    const walked = life.progression.state.walks.park ?? 0;
    vi.spyOn(life.progression, 'catScars').mockImplementation(() => { throw new Error('build broke'); });
    const { p, rec } = pickUp(life, storage, data);
    park.release();
    expect(await p).toBe('settled');
    expect(storage.getItem(RESUME_KEY)).toBe(null);
    expect(read(storage)).toBe(null);
    expect(life.progression.state.walks.park).toBe(walked + 1); // it counts as walked
    expect(life.getSession()).toBe(null);
    expect(rec.reloads).toBe(0); // nothing half-built: home is fine as it is
    expect(rec.notes).toEqual([['resume', 'build broke']]);
  });

  it('a build that throws in the same tick is settled the same way', async () => {
    const data = await parkNote();
    const ctl = controlledLoader();
    await ctl.areas.ensure('park');
    const life = lifecycle({ areas: ctl.areas });
    const storage = memStorage();
    writeResume(storage, data);
    const walked = life.progression.state.walks.park ?? 0;
    vi.spyOn(life.progression, 'catScars').mockImplementation(() => { throw new Error('build broke'); });
    let picked;
    expect(() => { picked = pickUp(life, storage, data); }).not.toThrow();
    expect(await picked.p).toBe('settled');
    expect(read(storage)).toBe(null);
    expect(life.progression.state.walks.park).toBe(walked + 1);
    expect(picked.rec.reloads).toBe(0);
  });

  it('a walk half-built when it threw starts the page again, once', async () => {
    const data = await parkNote();
    const ctl = controlledLoader();
    const park = ctl.hold('park');
    const life = lifecycle({ areas: ctl.areas });
    const storage = memStorage();
    writeResume(storage, data);
    // marksIn is read before the session is set and again after: the second
    // read throws, with the session already in place
    const real = life.progression.marksIn.bind(life.progression);
    let reads = 0;
    vi.spyOn(life.progression, 'marksIn').mockImplementation((...a) => {
      if (++reads === 2) throw new Error('late build broke');
      return real(...a);
    });
    const { p, rec } = pickUp(life, storage, data);
    park.release();
    expect(await p).toBe('settled');
    expect(life.getSession()).not.toBe(null);
    expect(rec.reloads).toBe(1);
    expect(read(storage)).toBe(null);
  });
});
