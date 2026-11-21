import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { walkHarness, areas, fakeDocument } from './helpers/walkharness.js';
import { AreaLoadError } from '../src/game/areaload.js';
import { GATE_MOMENT_MS } from '../src/gatecross.js';
import { LEAF_OPEN, LEAF_R, LEAF_BLOCKS, NO_GATES } from '../src/world/gateway.js';
import { phrase } from '../src/clanphrases.js';
import { diagnostics } from '../src/diagnostics.js';
import { mulberry32 } from '../src/rng.js';

// Walking on (world map step 3, Task 7): a cat walks through a gate at the
// Park's edge, a short "Off to Appletree Farm!" moment shows, and the next walk
// starts by itself at the Farm's twin gate. The walk just left is banked
// quietly: no summary. walk.js's walkOn is the one way through a gate; its
// answer is a Promise of 'walked' | 'refused' | 'failed' | 'dropped'.
//
// Whole walks, headless (test/helpers/walkharness.js), on a fixed day and a
// fixed Math.random stream, with the timers faked so the moment can be run on.

const WALK_MS = 90_000; // whole walks: an explicit timeout

beforeAll(() => areas.ensureAll(['neighborhood', 'park', 'farm', 'fair']));

beforeEach(() => {
  globalThis.document = fakeDocument();
  diagnostics.clear();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: new Date('2026-11-21T15:00:00Z') });
  const stream = mulberry32(20261121);
  vi.spyOn(Math, 'random').mockImplementation(() => stream());
});
afterEach(() => {
  delete globalThis.document;
  diagnostics.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Clan Edition, in the Park: owns the Neighbourhood, the Park and the Farm,
// two Park walks, 100 points (the Fairground is open to buy, so its gate is shut).
function parkSave(p) {
  p.setTutorialFirst('done');
  p.state.unlocked.areas.push('park', 'farm');
  p.state.walks.park = 2;
  p.setArea('park');
  p.addPoints(100);
  expect(p.state.edition).not.toBe('legacy');
  expect(p.state.area).toBe('park');
}
function legacyParkSave(p) {
  parkSave(p);
  p.setEdition('legacy');
  expect(p.state.edition).toBe('legacy');
}

// A loader that has every place but the Farm, whose load is up to the test.
function farmLoader(ensureFarm) {
  let farmHere = false;
  return {
    loaded: (id) => (id === 'farm' && !farmHere ? null : areas.loaded(id)),
    ensure: (id) => (id === 'farm'
      ? ensureFarm().then((pack) => { farmHere = true; return pack; })
      : areas.ensure(id)),
    prefetch() {},
  };
}
const slowFarm = (ms) => farmLoader(() => new Promise((resolve) => setTimeout(() => resolve(areas.loaded('farm')), ms)));
const failingFarm = (kind = 'failed') => farmLoader(() => Promise.reject(new AreaLoadError('farm', kind)));

describe('walking on through a gate', () => {
  it('walks straight on from the Park to the Farm: banked quietly, the moment, then the Farm at its gate', async () => {
    const walked = [];
    const h = walkHarness({ save: parkSave, onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    expect(h.getSession().areaId).toBe('park');
    const going = h.w.walkOn({ via: 'park-farm' });
    // the pack is here: banked, freed and the moment up before walkOn returns
    expect(h.getSession()).toBeNull();
    expect(await going).toBe('walked');
    expect(h.overlay.innerHTML).toContain('Off to Appletree Farm!');
    expect(h.overlay.innerHTML).not.toContain('Home again!');
    expect(h.overlay.classList.contains('hidden')).toBe(false);
    expect(h.progression.state.walks.park).toBe(3);
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('refused'); // a second tap during the moment
    expect(walked).toEqual([]);
    vi.advanceTimersByTime(GATE_MOMENT_MS - 1);
    expect(h.getSession()).toBeNull();
    vi.advanceTimersByTime(1);
    const s = h.getSession();
    expect(s.areaId).toBe('farm');
    expect(s.cat.position.x).toBeCloseTo(-8, 9);
    expect(s.cat.position.z).toBeCloseTo(43.4, 9);
    expect(s.cat.rotation.y).toBe(0);
    expect(s.arrivedVia).toBe('farm-park');
    expect(h.progression.state.area).toBe('farm');
    expect(walked).toHaveLength(1);
    expect(Array.isArray(walked[0])).toBe(true);
    // the Farm's own Ready? card, not the moment
    expect(h.overlay.innerHTML).toContain('btn-resume');
  }, WALK_MS);

  it('nothing to resume once the moment is up, and the walk just left is saved', async () => {
    let ended = 0;
    const h = walkHarness({ save: parkSave, onWalkEnded: () => ended++ });
    h.w.startWalk({});
    await h.w.walkOn({ via: 'park-farm' });
    // before the timer: the app could close now
    expect(ended).toBe(1);
    expect(JSON.parse(h.storage.getItem('whisker-walk-save')).walks.park).toBe(3);
  }, WALK_MS);

  it('a gate it does not have, or no walk, changes nothing', async () => {
    const h = walkHarness({ save: parkSave });
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('refused'); // no walk
    h.w.startWalk({});
    const s = h.getSession();
    expect(await h.w.walkOn({ via: 'fair-park' })).toBe('refused'); // the Fairground's gate
    expect(await h.w.walkOn({ via: 'nope' })).toBe('refused');
    expect(await h.w.walkOn({})).toBe('refused');
    expect(h.getSession()).toBe(s);
    expect(h.progression.state.walks.park).toBe(2);
    vi.advanceTimersByTime(GATE_MOMENT_MS * 2);
    expect(h.getSession()).toBe(s);
  }, WALK_MS);

  it('the walk just left banks its lines for the toast: a new best', async () => {
    const walked = [];
    const h = walkHarness({ save: parkSave, onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    h.progression.addPoints(40); // the best walk so far is 0
    await h.w.walkOn({ via: 'park-farm' });
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    expect(walked).toHaveLength(1);
    expect(walked[0]).toContain('NEW BEST! 🏆');
  }, WALK_MS);

  it('a walk started some other way during the moment is not replaced', async () => {
    const walked = [];
    const h = walkHarness({ save: parkSave, onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    await h.w.walkOn({ via: 'park-farm' });
    h.w.startWalk({ areaOverride: 'park' });
    const s = h.getSession();
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    expect(h.getSession()).toBe(s);
    expect(s.areaId).toBe('park');
    expect(walked).toEqual([]);
  }, WALK_MS);

  it('arriving draws nothing from the shared stream', () => {
    // Two Farm walks of one room seed, one arriving at the Park gate and one
    // at the spawn: the world they build is the same, draw for draw.
    const world = (arrive) => {
      const stream = mulberry32(7);
      Math.random.mockImplementation(() => stream());
      const h = walkHarness({ save: parkSave });
      h.w.startWalk({ roomSeed: 99, areaOverride: 'farm', arrive });
      const s = h.getSession();
      const out = {
        weather: s.weather.condition,
        quest: s.quest ? { type: s.quest.type, target: s.quest.target } : null,
        goals: s.goals ? s.goals.goals.map((g) => g.id) : null,
        rings: s.race.rings.map((r) => [r.x, r.z]),
        strays: s.strayCats.strays.map((c) => [c.name, c.group.position.x, c.group.position.z]),
        secrets: s.secrets.list.length,
      };
      const cat = [s.cat.position.x, s.cat.position.z, s.cat.rotation.y];
      h.w.endWalk();
      return { out, cat };
    };
    const atSpawn = world(null);
    const atGate = world({ x: -8, z: 43.4, yaw: 0 });
    expect(atGate.out).toEqual(atSpawn.out);
    expect(atGate.out.goals).toHaveLength(3);
    expect(atGate.out.rings.length).toBeGreaterThan(0);
    // and the two cats did start in different places
    expect(atGate.cat[0]).toBeCloseTo(-8, 9);
    expect(atGate.cat[1]).toBeCloseTo(43.4, 9);
    expect(atSpawn.cat.slice(0, 2)).not.toEqual(atGate.cat.slice(0, 2));
  }, WALK_MS);

  it('the Park has its three gates in Clan Edition, shut where she cannot go yet; Legacy has none', () => {
    const h = walkHarness({ save: parkSave });
    h.w.startWalk({});
    const s = h.getSession();
    expect(s.gates).not.toBe(NO_GATES);
    const gates = new Map(s.scene.children.filter((c) => c.name === 'gateway').map((g) => [g.userData.endId, g]));
    expect([...gates.keys()].sort()).toEqual(['park-fair', 'park-farm', 'park-town']);
    const leaf = (id) => gates.get(id).getObjectByName('gateHinge').rotation.y;
    expect(leaf('park-farm')).toBe(LEAF_OPEN); // she owns the Farm
    expect(leaf('park-town')).toBe(LEAF_OPEN); // and the Neighbourhood
    expect(leaf('park-fair')).toBe(0); // the Fairground is still to be bought
    // the shut leaf blocks the way on the live list; the open ones do not
    const leafCircles = (x, z) => s.areaData.colliders.filter((c) => c.r === LEAF_R && Math.hypot(c.x - x, c.z - z) < 1.5);
    expect(leafCircles(0, -47)).toHaveLength(LEAF_BLOCKS);
    expect(leafCircles(42, 10)).toHaveLength(0);
    expect(leafCircles(0, 49)).toHaveLength(0);
    // the posts stand on the live list too, two a gate
    const posts = s.areaData.colliders.filter((c) => c.r === 0.15 && [[0, -47], [42, 10], [0, 49]].some(([x, z]) => Math.hypot(c.x - x, c.z - z) < 1.5));
    expect(posts).toHaveLength(6);
    // the two lanes are paths, as the wet and dusk tints find them (R12)
    const lanes = s.scene.children.filter((c) => c.name === 'path' && c.userData.gateLane);
    expect(lanes).toHaveLength(2);
    h.w.endWalk();

    const legacy = walkHarness({ save: legacyParkSave });
    legacy.w.startWalk({});
    const ls = legacy.getSession();
    expect(ls.areaId).toBe('park');
    expect(ls.gates).toBe(NO_GATES);
    let gatewayChildren = 0;
    ls.scene.traverse((o) => { if (o.name === 'gateway' || o.userData?.gateLane) gatewayChildren++; });
    expect(gatewayChildren).toBe(0);
    const atGates = ls.areaData.colliders.filter((c) => (c.r === LEAF_R || c.r === 0.15) && [[0, -47], [42, 10], [0, 49]].some(([x, z]) => Math.hypot(c.x - x, c.z - z) < 1.5));
    expect(atGates).toHaveLength(0);
  }, WALK_MS);

  it('a session holds its walk-on fields: no room, no handlers, no gate she came in by', () => {
    const h = walkHarness({ save: parkSave });
    h.w.startWalk({});
    const s = h.getSession();
    expect(s.roomSeed).toBeUndefined();
    expect(s.netOffs).toEqual([]);
    expect(s.arrivedVia).toBeNull();
    expect(s.walkingOn).toBe(false);
    h.w.endWalk();
  }, WALK_MS);
});

describe('walking on to a place not here yet', () => {
  it('a slow Farm: the moment shows over the paused Park walk, then the Farm walk starts', async () => {
    const walked = [];
    const h = walkHarness({ save: parkSave, areas: slowFarm(500), onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    const park = h.getSession();
    const going = h.w.walkOn({ via: 'park-farm' });
    // still in the Park walk, live, nothing banked, the moment up over it
    expect(h.getSession()).toBe(park);
    expect(park.walkingOn).toBeTruthy();
    expect(h.overlay.innerHTML).toContain('Off to Appletree Farm!');
    expect(h.progression.state.walks.park).toBe(2);
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('refused'); // a second tap while it comes
    await vi.advanceTimersByTimeAsync(500);
    expect(await going).toBe('walked');
    // the Farm came: banked and freed, the moment still up
    expect(h.getSession()).toBeNull();
    expect(h.progression.state.walks.park).toBe(3);
    expect(h.overlay.innerHTML).toContain('Off to Appletree Farm!');
    // the moment's 1.2 s are counted from when it first showed
    vi.advanceTimersByTime(GATE_MOMENT_MS - 500 - 1);
    expect(h.getSession()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(h.getSession().areaId).toBe('farm');
    expect(h.getSession().arrivedVia).toBe('farm-park');
    expect(walked).toHaveLength(1);
  }, WALK_MS);

  it('a very slow Farm: once it comes, the Farm walk starts at once', async () => {
    const h = walkHarness({ save: parkSave, areas: slowFarm(5000) });
    h.w.startWalk({});
    const going = h.w.walkOn({ via: 'park-farm' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await going).toBe('walked');
    // The moment has had its time: what is left of it is none. (A timer made
    // inside the fake clock's tick runs no sooner than 1 ms later.)
    expect(h.getSession()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(h.getSession().areaId).toBe('farm');
  }, WALK_MS);

  it('a Farm that does not come: she stays in her Park walk, nothing banked, the pause card and a line', async () => {
    let ended = 0;
    const h = walkHarness({ save: parkSave, areas: failingFarm(), onWalkEnded: () => ended++ });
    h.w.startWalk({});
    const park = h.getSession();
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('failed');
    expect(h.getSession()).toBe(park);
    expect(park.walkingOn).toBe(false);
    expect(h.progression.state.walks.park).toBe(2);
    expect(h.progression.state.area).toBe('park');
    expect(ended).toBe(0);
    expect(h.overlay.innerHTML).toContain('btn-resume');
    expect(h.overlay.innerHTML).not.toContain('Off to');
    expect(h.toasts).toEqual([phrase('start.notReady')]);
    expect(h.homeToasts).toEqual([]);
    vi.advanceTimersByTime(GATE_MOMENT_MS * 2);
    expect(h.getSession()).toBe(park);
    // she may try the gate again
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('failed');
    expect(h.getSession()).toBe(park);
  }, WALK_MS);

  it('offline, the line says the place needs the internet; the page never reloads', async () => {
    const h = walkHarness({ save: parkSave, areas: failingFarm(), isOnline: () => false });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('failed');
    expect(h.toasts).toEqual([phrase('start.notReadyOffline')]);
    expect(h.reloads()).toBe(0);
  }, WALK_MS);

  it('an online failure counts: her next Explore for a place not here starts the page fresh', async () => {
    const h = walkHarness({ save: parkSave, areas: failingFarm() });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('failed');
    expect(h.reloads()).toBe(0); // never mid-walk
    h.w.endWalk();
    h.progression.setArea('farm');
    expect(await h.w.startWalkWhenReady({})).toBe('failed');
    expect(h.reloads()).toBe(1);
  }, WALK_MS);

  it('a place this build does not have never counts toward a fresh start', async () => {
    const h = walkHarness({ save: parkSave, areas: failingFarm('unknown') });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('failed');
    h.w.endWalk();
    h.progression.setArea('farm');
    expect(await h.w.startWalkWhenReady({})).toBe('failed');
    expect(h.reloads()).toBe(0);
  }, WALK_MS);

  it('a walk that ended while the place came is not walked on', async () => {
    const walked = [];
    const h = walkHarness({ save: parkSave, areas: slowFarm(500), onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    const going = h.w.walkOn({ via: 'park-farm' });
    h.w.endWalk(); // Head home
    expect(h.progression.state.walks.park).toBe(3);
    await vi.advanceTimersByTimeAsync(500);
    expect(await going).toBe('dropped');
    vi.advanceTimersByTime(GATE_MOMENT_MS * 2);
    expect(h.getSession()).toBeNull();
    expect(h.progression.state.walks.park).toBe(3);
    expect(h.progression.state.area).toBe('park');
    expect(h.overlay.innerHTML).toContain('Home again!');
    expect(walked).toEqual([]);
  }, WALK_MS);
});
