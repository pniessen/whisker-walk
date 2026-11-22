import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mulberry32 } from '../src/rng.js';
import { setMarket, marketOn, marketResumable } from '../src/marketflag.js';
import { createAreaLoader } from '../src/game/areaload.js';
import { AREA_LOADERS, AREA_ENTRY_MODULES } from '../src/world/areas.js';
import { CATALOG, createProgression } from '../src/progression.js';
import { STREET_PLACES, TOWN_PLACES } from '../src/worldmap.js';
import { nextThing } from '../src/ui/nextthing.js';
import { placeState, opensAfterLine } from '../src/territories.js';
import { KEPT_OFFERS } from '../src/areaoffer.js';
import { MARKET_REGISTRATION } from '../src/world/marketplan.js';
import { decideLobbyEvent, MEMBER_GATHER_MS } from '../src/game/lobby.js';
import { createRooms } from '../src/game/rooms.js';
import { createFakeHub, createNet } from '../src/net.js';
import { readResume, writeResume, snapshotWalk } from '../src/game/walkresume.js';
import { STALLS, TREAT_STALLS, stallById, toStall, MARKET_SPAWN } from '../src/world/marketplan.js';
import { inWatchZone } from '../src/marketrules.js';
import { createEnemyWalkLog } from '../src/enemies.js';
import { lifecycle, fakeEl, memStorage } from './helpers/walklife.js';

// The Market Square in the game (Task 4): behind ?market=1, solo, Clan Edition, its own download.
// Market step 4 (Task 11) opens it: a catalog row in Clan Edition only (V15,
// V16), a walk note that resumes with the switch or without and a room that
// walks it like any place (V17, V22); ?market=1 stays a developer shortcut.

let stream = null;
const areas = createAreaLoader();
beforeAll(() => areas.ensureAll(['park', 'neighborhood', 'market']), 60_000);
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
  setMarket(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the catalog has the Market, after the Rooftops, in Clan Edition only', () => {
  it('its row is the registration\'s, right after the Rooftops; a place inside the town on the map', () => {
    expect(CATALOG.areas.market).toEqual({ name: 'The Market Square', price: 150, requires: { area: 'neighborhood', walks: 2 }, edition: 'canon' });
    expect(CATALOG.areas.market).toEqual(MARKET_REGISTRATION.catalog);
    const ids = Object.keys(CATALOG.areas);
    expect(ids[ids.indexOf('roofs') + 1]).toBe('market');
    expect(Object.hasOwn(KEPT_OFFERS, 'market')).toBe(false);
    // a town place on the world map, not a street one
    expect(STREET_PLACES.some((p) => p.areaId === 'market')).toBe(false);
    expect(TOWN_PLACES.some((p) => p.areaId === 'market')).toBe(true);
  });
  it('a fresh save is never told about it: the home line names the Woods first', () => {
    const p = createProgression(memStorage());
    expect(JSON.stringify(nextThing(p.state, { catalog: CATALOG }) ?? null)).not.toMatch(/market/i);
  });
  it('Legacy has no offer: locked away like every Clan-only place; Clan Edition with the same walks and points buys it', () => {
    const save = (edition) => {
      const p = createProgression(memStorage());
      p.setEdition(edition);
      p.completeWalk('neighborhood');
      p.completeWalk('neighborhood');
      p.addPoints(500);
      return p;
    };
    const legacy = save('legacy');
    expect(legacy.buy('areas', 'market')).toBe(false);
    expect(legacy.state.unlocked.areas).not.toContain('market');
    expect(legacy.state.points).toBe(500);
    const clan = save('canon');
    expect(clan.buy('areas', 'market')).toBe(true);
    expect(clan.state.unlocked.areas).toContain('market');
    expect(clan.state.points).toBe(350);
  });
});

describe('the flag', () => {
  it('reads ?market=1 at call time, and a test can force it', () => {
    expect(marketOn()).toBe(false);
    setMarket(true);
    expect(marketOn()).toBe(true);
    setMarket(false);
    expect(marketOn()).toBe(false);
  });

  it('starts a solo Market walk in Clan Edition', async () => {
    setMarket(true);
    const l = life();
    try {
      expect(await l.w.beginWalkFromHomebase({ duskMode: false })).toBe('started');
      expect(l.getSession().areaId).toBe('market');
    } finally { endIfWalking(l); }
  }, 90_000);

  it('starts nothing in Legacy: the save\'s own place', async () => {
    setMarket(true);
    const l = life();
    try {
      l.progression.setEdition('legacy');
      await l.w.beginWalkFromHomebase({ duskMode: false });
      expect(l.getSession().areaId).toBe('neighborhood');
    } finally { endIfWalking(l); }
  }, 90_000);

  it('never in a room', () => {
    setMarket(true);
    const l = life();
    l.setPendingRoom({ code: 'ABCD' });
    l.w.beginWalkFromHomebase({ duskMode: false });
    expect(l.getSession()).toBe(null);
    expect(l.rec.roomStarts).toEqual([{ area: 'neighborhood', dusk: false }]);
  });

  it('without the flag, Explore walks the save\'s own place', async () => {
    setMarket(false);
    const l = life();
    try {
      await l.w.beginWalkFromHomebase({ duskMode: false });
      expect(l.getSession().areaId).toBe('neighborhood');
    } finally { endIfWalking(l); }
  }, 90_000);
});

describe('a Market walk note', () => {
  const NOW = Date.UTC(2026, 10, 21, 15, 0);
  function noteFor() {
    const storage = memStorage();
    const session = {
      areaId: 'market', soloSeed: 7, walkStamp: 'w', duskMode: false, duskActive: false, net: null,
      cat: { position: { x: 0, z: 20 } }, areaData: { collectibles: [] }, collectibleMeshes: new Map(),
      startPoints: 0, discoveryCount: 0, catsGreeted: 0,
      clanPaid: { friend: 0, boop: 0, patrol: 0 },
      walk: { carried: 0, carryCap: 2 },
      goals: { goals: [{ id: 'collect', progress: 0, done: false, target: 2 }] },
      enemies: createEnemyWalkLog({}),
      resumeTries: 0,
    };
    writeResume(storage, snapshotWalk(session, { yaw: 0, now: NOW, paid: [] }));
    return storage;
  }
  const ids = () => marketResumable(Object.keys(createProgression(memStorage()).state.walks));

  it('resumes, with the flag or without', () => {
    // the switch gates nothing now (V17): every walk id resumes
    const walks = Object.keys(createProgression(memStorage()).state.walks);
    expect(marketResumable(walks)).toEqual(walks);
    setMarket(false);
    expect(readResume(noteFor(), { now: NOW + 60_000, areaIds: ids() })?.kind).toBe('resume');
    setMarket(true);
    expect(readResume(noteFor(), { now: NOW + 60_000, areaIds: ids() })?.kind).toBe('resume');
  });
});

describe('counting', () => {
  it('counts a Market walk, and an old save loads with market 0', () => {
    const p = createProgression(memStorage());
    expect(p.state.walks.market).toBe(0);
    p.completeWalk('market');
    expect(p.state.walks.market).toBe(1);
    const old = JSON.parse(JSON.stringify(p.state));
    delete old.walks.market;
    const s = memStorage();
    s.setItem('whisker-walk-save', JSON.stringify(old));
    const q = createProgression(s);
    expect(q.state.walks.market).toBe(0);
  });
});

describe('its own download', () => {
  it('the Market is its own chunk', async () => {
    expect((await AREA_LOADERS.market()).world).toBe(await import('../src/world/market.js'));
    expect(AREA_ENTRY_MODULES.market).toContain('src/world/market.js');
  });
});

describe('strays in the square', () => {
  const inZone = (s, p) => inWatchZone(s, p.x, p.z, false);
  it('never stand in a counter\'s zone', async () => {
    setMarket(true);
    const l = life();
    try {
      await l.w.beginWalkFromHomebase({ duskMode: false });
      const s = l.getSession();
      expect(s.areaId).toBe('market');
      const strays = s.strayCats.strays;
      expect(strays.length).toBeGreaterThan(0);
      const treat = TREAT_STALLS.map(stallById);
      const check = () => {
        for (const c of strays) for (const st of treat) expect(inZone(st, c.group.position)).toBe(false);
      };
      check();
      for (let i = 0; i < 120; i++) s.strayCats.update(0.1, i * 0.1, { x: MARKET_SPAWN.x, y: 0, z: MARKET_SPAWN.z });
      check();
    } finally { endIfWalking(l); }
  }, 90_000);
});

// ---- Market step 4 (Task 11): rooms, the real catalog's offer, an old save --

describe('a room walks the Market like any place', () => {
  // Two players in a code room on net.js's in-memory hub (as
  // test/roofsgame.test.js), and a third who proposes walks by hand. `setup`
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
  // her save owns the Market: 2 town walks and 150 🐾 spent on it
  const owns = (p) => {
    p.completeWalk('neighborhood');
    p.completeWalk('neighborhood');
    p.addPoints(150);
    expect(p.buy('areas', 'market')).toBe(true);
  };
  async function propose(members, area) {
    const hub = members.hub;
    for (const m of members.list) await m.rooms.join('ABCD');
    const proposer = createNet(hub.transport());
    await proposer.join('ABCD', { playerId: '0000-first-01', petName: 'Pip' });
    proposer.sendEvent({ v: 1, id: '0000-first-01', type: 'walk-config', area, dusk: false, seed: 5 });
    vi.advanceTimersByTime(MEMBER_GATHER_MS * 3);
  }
  afterEach(() => { vi.useRealTimers(); });

  it('a proposal naming the Market starts the walk on both; a guest who does not own it walks it by override', async () => {
    vi.useFakeTimers();
    const hub = createFakeHub();
    const a = memberIn(hub, 'aaaa-host-0001');
    const b = memberIn(hub, 'bbbb-kid-00002');
    await propose({ hub, list: [a, b] }, 'market');
    for (const m of [a, b]) {
      expect(m.walks).toEqual([{ duskMode: false, roomSeed: 5, areaOverride: 'market' }]);
      expect(m.progression.state.area).toBe('neighborhood'); // never made hers
    }
  });

  it('one who owns it walks it as her own place; a Legacy guest by override, never set', async () => {
    vi.useFakeTimers();
    const hub = createFakeHub();
    const a = memberIn(hub, 'aaaa-host-0001', owns);
    const b = memberIn(hub, 'bbbb-kid-00002', (p) => { owns(p); p.setEdition('legacy'); });
    await propose({ hub, list: [a, b] }, 'market');
    expect(a.walks).toEqual([{ duskMode: false, roomSeed: 5 }]);
    expect(a.progression.state.area).toBe('market');
    expect(b.walks).toEqual([{ duskMode: false, roomSeed: 5, areaOverride: 'market' }]);
    expect(b.progression.state.area).not.toBe('market');
  });

  it('the lobby honours a walk config or request naming the Market as for the Park', () => {
    const ctx = { roster: [{ playerId: 'host' }, { playerId: 'kid' }], selfId: 'host', inWalk: false, knownAreas: Object.keys(CATALOG.areas), unlockedAreas: [] };
    for (const area of ['market', 'park']) {
      expect(decideLobbyEvent({ type: 'walk-config', id: 'kid', area, seed: 1 }, ctx), area).toEqual({ kind: 'propose', from: 'kid', area, dusk: false, seed: 1, override: true });
      expect(decideLobbyEvent({ type: 'walk-request', id: 'kid', area }, ctx), area).toEqual({ kind: 'config', area, dusk: false });
    }
  });
});

describe('the Market unlock in the real catalog', () => {
  const fresh = () => createProgression(memStorage()).state;
  const inTown = (townWalks, extra = {}) => {
    const s = fresh();
    return { ...s, walks: { ...s.walks, neighborhood: townWalks }, ...extra };
  };
  const GATE = { area: 'neighborhood', walks: 2 };

  it('the real catalog offers it as the world map orders it', () => {
    const locked = placeState(inTown(1), CATALOG, 'market');
    expect(locked).toMatchObject({ locked: true, canOpen: false, owned: false, price: 150 });
    expect(locked.line).toBe(opensAfterLine(GATE, 1, 'canon', CATALOG));
    expect(placeState(inTown(2, { points: 150 }), CATALOG, 'market')).toMatchObject({ locked: false, canOpen: true, owned: false, price: 150, line: 'Open for 150 🐾' });
    expect(placeState(inTown(2, { points: 100 }), CATALOG, 'market')).toMatchObject({ locked: false, canOpen: false, owned: false, price: 150, line: '150 🐾 — keep exploring!' });
  });

  // Review Focus 4: a save that walked the Market through ?market=1 before
  // step 4 (walks.market 2, not owned, no points).
  it('a save that walked the Market with the switch keeps nothing it did not buy', () => {
    const s = fresh();
    const old = { ...s, walks: { ...s.walks, market: 2 }, points: 0 };
    const st = placeState(old, CATALOG, 'market');
    expect(st).toMatchObject({ owned: false, locked: true, canOpen: false, price: 150 });
    expect(st.line).toBe(opensAfterLine(GATE, 0, old.edition, CATALOG));
    expect(st.line).toContain('0/2');
    expect(old.unlocked.areas).not.toContain('market');
    // offered at 150 once she has 2 town walks (and the points)
    const later = { ...old, walks: { ...old.walks, neighborhood: 2 }, points: 150 };
    expect(placeState(later, CATALOG, 'market')).toMatchObject({ owned: false, locked: false, canOpen: true, line: 'Open for 150 🐾' });
    // a save loaded from it owns nothing more
    const storage = memStorage();
    storage.setItem('whisker-walk-save', JSON.stringify(old));
    const q = createProgression(storage);
    expect(q.state.walks.market).toBe(2);
    expect(q.state.unlocked.areas).not.toContain('market');
    expect(q.isUnlocked('areas', 'market')).toBe(false);
  });
});

describe('two devices in one room see the same stallholders turn', () => {
  it('two walks with one roomSeed: at one clock every stall\'s phase is equal (and another seed\'s differs)', async () => {
    const one = life();
    const two = life();
    const other = life();
    try {
      one.w.startWalk({ duskMode: false, roomSeed: 4242, areaOverride: 'market' });
      const a = one.getSession();
      two.w.startWalk({ duskMode: false, roomSeed: 4242, areaOverride: 'market' });
      const b = two.getSession();
      // the control: a room with another seed, at the same clock
      other.w.startWalk({ duskMode: false, roomSeed: 777, areaOverride: 'market' });
      const c = other.getSession();
      expect([a.areaId, b.areaId, c.areaId]).toEqual(['market', 'market', 'market']);
      const seqA = [];
      const seqC = [];
      const player = { speed: 0, stalking: false, perchY: 0, swimming: false, inputActive: false };
      const DT = 0.25;
      let t = 0;
      const seen = new Set();
      for (let i = 0; i < 240; i++) {
        t += DT;
        vi.setSystemTime(new Date(Date.UTC(2026, 10, 21, 15, 0) + i * 250));
        a.market.update(DT, t, { cat: a.cat, player, session: a });
        b.market.update(DT, t, { cat: b.cat, player, session: b });
        c.market.update(DT, t, { cat: c.cat, player, session: c });
        const pa = a.market.stalls.filter((s) => s.look).map((s) => [s.id, s.phase]);
        const pb = b.market.stalls.filter((s) => s.look).map((s) => [s.id, s.phase]);
        expect(pa.length).toBe(TREAT_STALLS.length);
        expect(pb).toEqual(pa);
        for (const [, ph] of pa) seen.add(ph);
        seqA.push(pa.map(([, ph]) => ph).join());
        seqC.push(c.market.stalls.filter((s) => s.look).map((s) => s.phase).join());
      }
      // the minute walked through turns them: more than one phase was seen
      expect(seen.size).toBeGreaterThan(1);
      // another seed turns them on another rhythm
      expect(seqC).not.toEqual(seqA);
      expect(seqC.filter((x, i) => x !== seqA[i]).length).toBeGreaterThan(seqA.length / 4);
    } finally {
      endIfWalking(one);
      endIfWalking(two);
      endIfWalking(other);
    }
  }, 90_000);
});
