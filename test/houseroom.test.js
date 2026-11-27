import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { mulberry32 } from '../src/rng.js';
import { rollWeather } from '../src/weather.js';
import { createAreaLoader } from '../src/game/areaload.js';
import { CATALOG, createProgression } from '../src/progression.js';
import { decideLobbyEvent, MEMBER_GATHER_MS } from '../src/game/lobby.js';
import { createRooms } from '../src/game/rooms.js';
import { createFakeHub, createNet } from '../src/net.js';
import { decideWalkOnHave, walkOnMove, pickOnCrossing } from '../src/gatecross.js';
import { planFind, roomFindRoster } from '../src/foundwear/rules.js';
import { FIND_KEY, findSpotsKey, spotsIn } from '../src/foundwear/spots/index.js';
import { readResume, writeResume, snapshotWalk, pickUpWalk } from '../src/game/walkresume.js';
import { resumableHouseIds } from '../src/houseflag.js';
import { resumableAreaIds } from '../src/roofsflag.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { kittenPlan } from '../src/kitten.js';
import { GOLD_MICE } from '../src/goldmice.js';
import { propsFor, yarnSpotFor } from '../src/propsets.js';
import { HOUSE_FINDS, HOUSE_MICE } from '../src/world/housethings.js';
import { HOUSE_STAIRS, HOUSE_LEVELS, SECRET_BOOKCASE, secretColliders, houseFloorGround } from '../src/world/houseplan.js';
import { isWalkableAt, createPlayer } from '../src/player.js';
import { stickToWorld } from '../src/traversal.js';
import { endsFor } from '../src/gateways.js';
import { lifecycle, fakeEl, memStorage } from './helpers/walklife.js';

// =============================================================================
// The Old House step 4, Task 7 (plan rulings W2, W13, W14, W16, W17, W19;
// Review Focus 2 and 4): two children in the house, on real walks. A room walks
// the house like any place, and on through its front door only together; a
// guest who has not bought it walks it this once without owning it; two walks
// with one room seed lay the same mice and golden mice, with no Mochi; a house
// walk hides no found outfit yet (W17); a walk picked up on the secret stair
// finds her there with the bookcase shut, and it opens for her from the stair
// (W19); a partner opening the bookcase never shuts this child in; and every
// other place walks as it did. Nothing here is a new message or a new field.
// =============================================================================

// The first seed whose walk rolls rain (test/housegame.test.js's RAIN): its pins
// for the Park are on this seed.
const RAIN = (() => { for (let seed = 1; ; seed++) if (rollWeather(mulberry32(seed)) === 'rain') return seed; })();
const DT = 1 / 60;
const B = SECRET_BOOKCASE;

let stream = null;
const areas = createAreaLoader();
beforeAll(() => areas.ensureAll(['park', 'neighborhood', 'house']), 60_000);
const life = (o = {}) => lifecycle({ areas, ...o });
// a walk a test started is ended even when one of its expects fails
const endIfWalking = (l) => { if (l.getSession()) l.w.endWalk(); };

beforeEach(() => {
  globalThis.document = { body: fakeEl(), createElement: fakeEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-21T15:00:00Z') });
  stream = mulberry32(20261121);
  vi.spyOn(Math, 'random').mockImplementation(() => stream());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  delete globalThis.document;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Her save owns the Market (2 town walks, 150 🐾), and with ownsHouse the Old
// House too (2 Market walks, 150 🐾): the house's row asks the Market's walks.
const ownsMarket = (p) => {
  p.completeWalk('neighborhood');
  p.completeWalk('neighborhood');
  p.addPoints(150);
  expect(p.buy('areas', 'market')).toBe(true);
};
const ownsHouse = (p) => {
  ownsMarket(p);
  p.completeWalk('market');
  p.completeWalk('market');
  p.addPoints(150);
  expect(p.buy('areas', 'house')).toBe(true);
};

describe('a room walks the house like any place', () => {
  // Two players in a code room on net.js's in-memory hub (as
  // test/marketgame.test.js), and a third who proposes walks by hand. `setup`
  // shapes each member's save before the room starts.
  function memberIn(hub, pid, setup = () => {}) {
    const progression = createProgression(memStorage());
    progression.setPetName(pid);
    setup(progression);
    const walks = [];
    let session = null;
    const { rooms } = createRooms({
      MP: 1, pid, supabaseUrl: 'x', supabaseAnonKey: 'y',
      progression, getCloud: () => null, getPsecret: () => null,
      getSession: () => session, startWalk: (o) => { walks.push(o); session = { o }; },
      colonySync: { status: () => ({ mode: 'unpaired' }), pull() {} },
      createTransport: () => hub.transport(),
    });
    return { rooms, walks, progression };
  }
  async function propose(members, area) {
    const hub = members.hub;
    for (const m of members.list) await m.rooms.join('ABCD');
    const proposer = createNet(hub.transport());
    await proposer.join('ABCD', { playerId: '0000-first-01', petName: 'Pip' });
    proposer.sendEvent({ v: 1, id: '0000-first-01', type: 'walk-config', area, dusk: false, seed: 5 });
    vi.advanceTimersByTime(MEMBER_GATHER_MS * 3);
  }
  afterEach(() => { vi.useRealTimers(); });

  it('a proposal naming the house starts the walk on both; a guest who does not own it walks it by override', async () => {
    vi.useFakeTimers();
    const hub = createFakeHub();
    const a = memberIn(hub, 'aaaa-host-0001', ownsMarket); // the Market, not the house
    const b = memberIn(hub, 'bbbb-kid-00002');
    await propose({ hub, list: [a, b] }, 'house');
    for (const m of [a, b]) {
      expect(m.walks).toEqual([{ duskMode: false, roomSeed: 5, areaOverride: 'house' }]);
      expect(m.progression.state.area).not.toBe('house'); // never made hers
      expect(m.progression.state.unlocked.areas).not.toContain('house');
    }
  });

  it('one who owns it walks it as her own place; a Legacy guest by override, her save\'s place never the house', async () => {
    vi.useFakeTimers();
    const hub = createFakeHub();
    const a = memberIn(hub, 'aaaa-host-0001', ownsHouse);
    const b = memberIn(hub, 'bbbb-kid-00002', (p) => { ownsHouse(p); p.setEdition('legacy'); });
    await propose({ hub, list: [a, b] }, 'house');
    expect(a.walks).toEqual([{ duskMode: false, roomSeed: 5 }]);
    expect(a.progression.state.area).toBe('house');
    expect(b.walks).toEqual([{ duskMode: false, roomSeed: 5, areaOverride: 'house' }]);
    expect(b.progression.state.area).not.toBe('house');
  });

  it('the lobby honours a walk config or request naming the house as for the Park', () => {
    const ctx = { roster: [{ playerId: 'host' }, { playerId: 'kid' }], selfId: 'host', inWalk: false, knownAreas: Object.keys(CATALOG.areas), unlockedAreas: [] };
    for (const area of ['house', 'park']) {
      expect(decideLobbyEvent({ type: 'walk-config', id: 'kid', area, seed: 1 }, ctx), area).toEqual({ kind: 'propose', from: 'kid', area, dusk: false, seed: 1, override: true });
      expect(decideLobbyEvent({ type: 'walk-request', id: 'kid', area }, ctx), area).toEqual({ kind: 'config', area, dusk: false });
    }
  });
});

describe('a room walks on through the old house\'s front door together', () => {
  const have = (id, ok = true) => ({ v: 1, id, type: 'walk-on-have', via: 'town-house', ok });
  const ctx = { areaId: 'neighborhood', via: 'town-house', selfId: 'a', remoteIds: ['b', 'c'], catalog: CATALOG, ready: true };

  it('a room walks on through the front door only when every device has the house', () => {
    expect(decideWalkOnHave([have('b')], ctx)).toEqual({ kind: 'wait', waiting: ['c'] }); // one not ready: nobody moves
    expect(decideWalkOnHave([have('b'), have('c', false)], ctx)).toEqual({ kind: 'no', id: 'c' });
    expect(decideWalkOnHave([have('b'), have('c')], { ...ctx, ready: false })).toEqual({ kind: 'wait', waiting: [] });
    expect(decideWalkOnHave([have('b'), have('c')], ctx)).toEqual({ kind: 'go' });
    // and back out through the hall's front door, the same way
    const home = { ...ctx, areaId: 'house', via: 'house-town' };
    const back = (id, ok = true) => ({ ...have(id, ok), via: 'house-town' });
    expect(decideWalkOnHave([back('b')], home)).toEqual({ kind: 'wait', waiting: ['c'] });
    expect(decideWalkOnHave([back('b'), back('c', false)], home)).toEqual({ kind: 'no', id: 'c' });
    expect(decideWalkOnHave([back('b'), back('c')], home)).toEqual({ kind: 'go' });
    // a catalog without the house's row has no gate there: nobody goes (the hall's
    // door leads to the town, which every catalog has, as the Market's gate home)
    const { house: _h, ...noHouse } = CATALOG.areas;
    const bare = { ...CATALOG, areas: noHouse };
    expect(decideWalkOnHave([have('b'), have('c')], { ...ctx, catalog: bare })).toEqual({ kind: 'wait', waiting: ['b', 'c'] });
  });

  it('a guest who does not own the house walks it as an override, and a crossing never buys it', () => {
    const p = createProgression(memStorage());
    // the Market owned and walked twice, 500 🐾: the house is hers to buy, not bought
    p.replaceFromPayload({ version: 4, points: 500, walks: { neighborhood: 4, market: 3 }, unlocked: { areas: ['neighborhood', 'market'] } });
    expect(walkOnMove(p.state, CATALOG, 'house', { guest: true })).toBe('override');
    expect(walkOnMove(p.state, CATALOG, 'house')).toBe('override');
    expect(pickOnCrossing(p, CATALOG, 'house')).toBe(false);
    expect(pickOnCrossing(p, CATALOG, 'house', { guest: true })).toBe(false);
    expect(p.state.points).toBe(500);
    expect(p.state.unlocked.areas).not.toContain('house');
    expect(p.state.area).not.toBe('house');
    // an owner walks it as her own place
    p.state.unlocked.areas.push('house');
    expect(walkOnMove(p.state, CATALOG, 'house')).toBe('set');
  });
});

describe('two screens of one house', () => {
  const mice = (s) => s.critters.list.filter((c) => c.type === 'mouse');
  const at = (list) => list.flatMap((c) => [c.group.position.x, c.group.position.y, c.group.position.z]);
  const gold = (s) => s.goldMice.list.map((m) => m.id);
  const run = (s, frames) => {
    let t = 0;
    for (let i = 0; i < frames; i++) {
      t += DT;
      s.critters.update(DT, t, s.cat.position, s.cat.position, s.cat);
    }
  };

  it('two walks with one roomSeed agree: the same mice at one clock, no Mochi, the same golden mice', () => {
    const one = life();
    const two = life();
    const other = life();
    try {
      for (const l of [one, two, other]) l.progression.setKittenStage(2); // Mochi is hers: a solo house walk brings her
      expect(kittenPlan(one.progression.state.kitten.stage, 'house')).toBeTruthy();
      one.w.startWalk({ duskMode: false, roomSeed: 4242, areaOverride: 'house' });
      const a = one.getSession();
      two.w.startWalk({ duskMode: false, roomSeed: 4242, areaOverride: 'house' });
      const b = two.getSession();
      // the control: a room with another seed
      other.w.startWalk({ duskMode: false, roomSeed: 777, areaOverride: 'house' });
      const c = other.getSession();
      expect([a.areaId, b.areaId, c.areaId]).toEqual(['house', 'house', 'house']);
      // no kitten on a room walk (W14)
      for (const s of [a, b, c]) {
        expect(s.kittenEnc.group).toBeNull();
        expect(s.scene.getObjectByName('kitten') ?? null).toBeNull();
      }
      // the same golden mice, at the same spots
      expect(gold(a).length).toBe(5);
      for (const id of gold(a)) expect(id).toMatch(/^gm-house-[1-5]$/);
      expect(gold(b)).toEqual(gold(a));
      expect(b.goldMice.list.map((m) => [m.x, m.z])).toEqual(a.goldMice.list.map((m) => [m.x, m.z]));
      // the house's mice, the same on both after the same 300 frames
      expect(mice(a).length).toBe(HOUSE_MICE.length);
      expect(mice(b).length).toBe(HOUSE_MICE.length);
      run(a, 300);
      run(b, 300);
      run(c, 300);
      const [pa, pb, pc] = [at(mice(a)), at(mice(b)), at(mice(c))];
      expect(Math.max(...pa.map((x, i) => Math.abs(x - pb[i]))), 'the mice stand at the same spots').toBeLessThan(1e-6);
      // another room's seed sets them going at other points in their runs (critters.js idle phase)
      expect(Math.max(...pa.map((x, i) => Math.abs(x - pc[i]))), 'another seed moves them otherwise').toBeGreaterThan(0.01);
    } finally {
      endIfWalking(one);
      endIfWalking(two);
      endIfWalking(other);
    }
  }, 90_000);

  it('a house walk hides no find, solo or in a room', () => {
    expect(spotsIn('house')).toEqual([]);
    expect(FIND_KEY).toBe(findSpotsKey()); // no spot added
    const room = [{ playerId: 'ana', finds: FIND_KEY }, { playerId: 'ben', finds: FIND_KEY }];
    for (const seed of [4242, 7, 1234567, 99]) {
      expect(planFind({ areaId: 'house', seed }), `solo ${seed}`).toBeNull();
      expect(planFind({ areaId: 'house', seed, roster: roomFindRoster(room, 'ana') }), `room ${seed}`).toBeNull();
      expect(planFind({ areaId: 'house', seed, roster: roomFindRoster(room, 'ben') })).toBeNull();
    }
    // the Market beside it still hides one on the same seeds (the control)
    expect(planFind({ areaId: 'market', seed: 4242, roster: roomFindRoster(room, 'ana') })).toBeTruthy();
  });
});

// =============================================================================
// W19 (step 2's Review Focus 5): a walk picked up on the secret stair. The
// discovery log is a real one, so its entries go into the note and come back on
// the walk picked up (walk.js log.restore), as test/housegame.test.js's
// "a walk picked up again pays nothing twice" does on the wardrobe.
// =============================================================================
describe('a walk picked up on the secret stair', () => {
  const STAIR = HOUSE_STAIRS.find((q) => q.id === 'secret');
  const UP = HOUSE_LEVELS.find((l) => l.id === 'upstairs').y;
  // the stair's height at z: from the library's floor (z0) to the bedroom's (z1)
  const stairY = (z) => (UP * (STAIR.z0 - z)) / (STAIR.z0 - STAIR.z1);
  const ids = (state) => resumableHouseIds(resumableAreaIds(state.walks), state);
  // frames of the house life with her at (x, ground there, z)
  const frames = (s) => {
    const camera = new THREE.PerspectiveCamera();
    const cat = new THREE.Vector3();
    let t = 0;
    return (x, z, seconds) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        cat.set(x, s.ground.y(x, z), z);
        camera.position.set(x, cat.y + 2.2, z - 3.4);
        t += DT;
        s.areaLife.update(DT, t, cat, camera);
      }
    };
  };

  it('a walk picked up on the secret stair finds her on it, the bookcase shut, and it opens for her from the stair', async () => {
    const paid = { points: 0 };
    const newLog = () => createDiscoveryLog({ addPoints: (n) => { paid.points += n; }, recordFeat() {} });
    const clock = HOUSE_FINDS.find((f) => f.id === 'clock');
    const MID = { x: STAIR.x0, z: -2 }; // the stair's middle
    const log = newLog();
    const first = life({ log });
    let snap = null;
    try {
      first.w.startWalk({ duskMode: false, areaOverride: 'house' });
      const s = first.getSession();
      expect(s.areaId).toBe('house');
      const stay = frames(s);
      // she opens the bookcase from the library and the clock strikes for her
      stay(-6, 3, 2.0);
      expect(s.areaLife.finds.open).toBe(true);
      expect(s.areaData.colliders.filter((c) => c.secret)).toEqual(secretColliders(true, 'stair'));
      stay(clock.x, clock.z, 1.2);
      expect(log.count('house-find-bookcase')).toBe(1);
      expect(log.count('house-find-clock')).toBe(1);
      expect(paid.points).toBe(24);
      // then up the open stair; the walk is left with her at its middle
      expect(s.ground.y(MID.x, MID.z)).toBeCloseTo(stairY(MID.z), 6);
      snap = { ...snapshotWalk(s, { yaw: 0, now: Date.now(), paid: log.entries() }), x: MID.x, z: MID.z };
    } finally {
      endIfWalking(first);
    }
    const storage = memStorage();
    writeResume(storage, snap);
    const again = life({ log: newLog() });
    const left = readResume(storage, { now: Date.now(), areaIds: ids(again.progression.state) });
    expect(left?.kind).toBe('resume');
    try {
      expect(await pickUpWalk({
        storage, data: left.data, startWalkWhenReady: again.w.startWalkWhenReady, progression: again.progression,
        getSession: again.getSession, reload: () => {},
      })).toBe('started');
      const s = again.getSession();
      expect(s.resumed).toBe(true);
      const log2 = again.log;
      // on the stair, at its height, where she was
      const cat = s.cat.position;
      expect(cat.x).toBeCloseTo(MID.x, 6);
      expect(cat.z).toBeCloseTo(MID.z, 6);
      expect(Math.abs(cat.y - stairY(MID.z))).toBeLessThan(0.05);
      // what the first part paid is paid, and is back in the log
      expect(log2.count('house-find-bookcase')).toBe(1);
      expect(log2.count('house-find-clock')).toBe(1);
      const before = paid.points;
      // the bookcase is shut again: the stair's mouth is shut to the library
      expect(s.areaLife.finds.open).toBe(false);
      expect(s.areaData.colliders.filter((c) => c.secret)).toEqual(secretColliders(false));
      // she walks down the stair to it, one step a frame (1.5 m/s), and stays at it
      const stay = frames(s);
      const END = 2 - B.d / 2 - 0.4; // against the shut leaf, her body clear of its row
      for (let z = MID.z; z < END; z += 1.5 * DT) stay(MID.x, z, DT);
      stay(MID.x, END, B.holdS + 0.1);
      expect(s.areaLife.finds.open).toBe(true);
      // it swings away from her, into the library, and she may walk on through
      stay(MID.x, END, B.openS + 0.2);
      expect(s.areaData.colliders.filter((c) => c.secret)).toEqual(secretColliders(true));
      expect(isWalkableAt(s.areaData, MID.x, 2)).toBe(true);
      // nothing paid twice
      expect(paid.points).toBe(before);
      expect(log2.count('house-find-bookcase')).toBe(1);
    } finally {
      endIfWalking(again);
    }
  }, 90_000);
});

// =============================================================================
// A partner opens the bookcase from the other side while this child's cat stands
// at its mouth (W13 "accepted"; parked from Task 6's review). The leaf swings away
// from the partner, toward her, and its open row comes in where it rests. Whatever
// the swing looks like, once it has swung she is never shut in: her spot is one
// she may stand on, or the player's own collider push has slid her clear, and she
// walks on either way. The real player (player.js) runs on the walk's live list
// before house life each frame, in main.js's order.
// =============================================================================
describe('a partner at the bookcase', () => {
  async function scene() {
await (await import('../src/world/housestages.js')).loadHouseStages(); // the wing's lazy stage (housestagewing.js) fills the house's wing slots
    const { build } = await import('../src/world/house.js');
    const scn = new THREE.Scene();
    const record = build(scn, { gateEnds: endsFor('house') });
    const houseLife = record.life({ scene: scn, reducedMotion: false, log: null, audio: null, toy: null, dusk: false, now: () => new Date(2026, 10, 21, 15) });
    // the partner, as remotecats.js draws her
    const group = new THREE.Group();
    const tag = new THREE.Sprite(new THREE.SpriteMaterial());
    group.add(tag);
    scn.add(group);
    const session = { remotes: { list: [{ group, tag, h: 0 }] } };
    // her cat and the real player
    const cat = new THREE.Group();
    scn.add(cat);
    const camera = new THREE.PerspectiveCamera();
    const player = createPlayer(camera, { addEventListener() {} });
    player.setReducedMotion(true);
    const stick = { x: 0, z: 0 };
    let t = 0;
    const frame = () => {
      t += DT;
      player.update(DT, record.colliders, record.bounds, []);
      houseLife.update(DT, t, cat.position, camera, session);
    };
    return {
      record,
      houseLife,
      cat,
      partner: (x, z) => group.position.set(x, record.ground.y(x, z), z),
      place(x, z) {
        cat.position.set(x, record.ground.y(x, z), z);
        player.setAvatar(cat, 3.5);
        player.setGround(record.ground);
        player.setCameraGround(houseFloorGround());
        player.setViewYaw(0);
        player.enable();
        player.perchY = 0;
      },
      push(wx, wz) {
        stickToWorld(wx, wz, -player.viewYaw(), stick);
        player.setTouchMove({ x: stick.x, z: stick.z, mag: Math.hypot(wx, wz) });
      },
      release: () => player.setTouchMove(null),
      run(seconds) { for (let i = 0; i < Math.round(seconds / DT); i++) frame(); },
      walkable: () => isWalkableAt({ colliders: record.colliders, bounds: record.bounds }, cat.position.x, cat.position.z),
    };
  }

  it('a partner opening the bookcase never traps this child\'s cat', async () => {
    // [the partner's spot, her lane and the way she walks to the leaf, the row it rests in]
    const cases = [
      // the partner in the library, she on the stair: it swings into the stair, toward her
      { partner: [-6, 3], from: -0.6, dir: 1, row: secretColliders(true, 'stair'), xs: [-6.6, -6.0, -5.5] },
      // the partner on the stair, she in the library: it swings into the library, toward her
      { partner: [-6, 1], from: 4.6, dir: -1, row: secretColliders(true), xs: [-6.6, -6.0, -5.5] },
    ];
    let caught = 0; // lanes where the open row came in over her spot
    for (const c of cases) {
      for (const x of c.xs) {
        const label = `partner at ${c.partner}, her lane x ${x}`;
        const w = await scene();
        w.place(x, c.from);
        expect(w.walkable(), label).toBe(true);
        w.partner(...c.partner);
        // she walks up to the shut leaf and stops against it; the partner, already
        // there, finishes his hold first
        w.push(0, c.dir);
        w.run(0.9);
        w.release();
        w.run(0.1);
        expect(w.houseLife.finds.open, label).toBe(true);
        const stood = { x: w.cat.position.x, z: w.cat.position.z };
        expect(Math.abs(stood.z - B.z), `${label}: at the leaf`).toBeLessThan(B.reach); // within reach of it
        const others = w.record.colliders.filter((q) => !q.secret);
        if (!isWalkableAt({ colliders: [...others, ...c.row], bounds: w.record.bounds }, stood.x, stood.z)) caught++;
        // the leaf swings; its open row comes in where it rests
        w.run(B.openS + 0.3);
        expect(w.record.colliders.filter((q) => q.secret), label).toEqual(c.row);
        // she is on a spot she may stand on, slid clear at most a little
        expect(w.walkable(), `${label}: shut in at ${w.cat.position.x.toFixed(2)}, ${w.cat.position.z.toFixed(2)}`).toBe(true);
        expect(Math.hypot(w.cat.position.x - stood.x, w.cat.position.z - stood.z), label).toBeLessThan(0.5);
        // and she walks on through the open mouth, and back
        const walkTo = (dir, past) => {
          w.push(0, dir);
          for (let i = 0; i < 240 && (w.cat.position.z - B.z) * dir < past; i++) w.run(DT);
          w.release();
          return (w.cat.position.z - B.z) * dir;
        };
        expect(walkTo(c.dir, 1), `${label}: through`).toBeGreaterThanOrEqual(1);
        expect(walkTo(-c.dir, 1), `${label}: and back`).toBeGreaterThanOrEqual(1);
        w.houseLife.dispose();
      }
    }
    // the edge is met: on some lane the open row rests where she stood, and the push saved her
    expect(caught).toBeGreaterThan(0);
  }, 90_000);
});

describe('every other place walks as it did', () => {
  // One room walk on `seed` in `areaId`: what it laid out.
  function roomWalk(areaId, seed) {
    const l = life();
    try {
      l.w.startWalk({ duskMode: false, roomSeed: seed, areaOverride: areaId });
      const s = l.getSession();
      expect(s.areaId).toBe(areaId);
      return {
        goals: s.goals.goals.map((g) => g.id),
        gold: s.goldMice.list.map((m) => m.id),
        knock: s.knockables.list.map((k) => k.id),
        critters: s.critters.list.map((q) => q.type),
        first: s.critters.list.slice(0, 6).map((c) => [c.group.position.x, c.group.position.z]),
        spot: s.toy.spot,
        record: s.areaData,
      };
    } finally {
      endIfWalking(l);
    }
  }
  // What a room walk on the rain seed rolled before step 4 (read off the branch at
  // 72807fb0, the merge step 4 began from, by the same walk as roomWalk). A room
  // walk rolls the duo goal where test/housegame.test.js's solo walk rolls tip-things.
  const BEFORE = {
    park: {
      goals: ['duo-greet', 'spot-critters', 'get-scratches'],
      gold: ['gm-park-1', 'gm-park-2', 'gm-park-3'],
      knock: ['park-cup-1', 'park-book-1', 'park-can-1'],
      critters: ['bird', 'bird', 'squirrel', 'squirrel', 'butterfly', 'butterfly', 'butterfly', 'duck', 'duck', 'duck', 'mouse', 'mouse', 'villager', 'villager'],
      first: [[-24, 30], [12, 36], [-30, 10], [28, 0], [-18, 22], [20, 12]],
      spot: { x: -6, z: 15.5 },
    },
    neighborhood: {
      goals: ['duo-greet', 'spot-critters', 'get-scratches'],
      gold: ['gm-neigh-1', 'gm-neigh-2', 'gm-neigh-3'],
      knock: ['neighborhood-cup-1', 'neighborhood-flowerpot-1', 'neighborhood-book-1'],
      critters: ['bird', 'bird', 'squirrel', 'squirrel', 'butterfly', 'butterfly', 'mouse', 'mouse', 'villager', 'villager'],
      first: [[-6, -40], [24, 18], [-20, 22], [20, -8], [-12, 28], [12, -12]],
      spot: { x: 32.1, z: 25.6 },
    },
  };

  it('a Park and a town walk with one roomSeed roll the same goals, mice, knock-overs and yarn spot', () => {
    expect(RAIN).toBe(1);
    for (const id of ['park', 'neighborhood']) {
      const one = roomWalk(id, RAIN);
      const two = roomWalk(id, RAIN); // her partner's device
      for (const k of Object.keys(BEFORE[id])) {
        expect(one[k], `${id} ${k}`).toEqual(BEFORE[id][k]);
        expect(two[k], `${id} ${k}, the partner`).toEqual(one[k]);
      }
      // the same as the place's own data says
      expect(one.gold).toEqual(GOLD_MICE[id].map((m) => m.id));
      expect(one.knock).toEqual(propsFor(id).knockables.map((k) => k.id));
      const spot = yarnSpotFor(id, '2026-11-21');
      expect(one.spot).toEqual({ x: spot.x, z: spot.z });
      // and its record carries none of the house's own lists
      for (const k of ['goldMice', 'knockables', 'hides', 'yarnSpots', 'goalTypes', 'mapGround']) expect(Object.hasOwn(one.record, k), `${id} ${k}`).toBe(false);
    }
  }, 90_000);
});
