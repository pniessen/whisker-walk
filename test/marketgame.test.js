import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mulberry32 } from '../src/rng.js';
import { setMarket, marketOn, marketResumable } from '../src/marketflag.js';
import { createAreaLoader } from '../src/game/areaload.js';
import { AREA_LOADERS, AREA_ENTRY_MODULES } from '../src/world/areas.js';
import { CATALOG, createProgression } from '../src/progression.js';
import { STREET_PLACES } from '../src/worldmap.js';
import { nextThing } from '../src/ui/nextthing.js';
import { readResume, writeResume, snapshotWalk } from '../src/game/walkresume.js';
import { STALLS, TREAT_STALLS, stallById, toStall } from '../src/world/marketplan.js';
import { createEnemyWalkLog } from '../src/enemies.js';
import { lifecycle, fakeEl, memStorage } from './helpers/walklife.js';

// The Market Square in the game (Task 4): behind ?market=1, solo, Clan Edition, its own download.

let stream = null;
const areas = createAreaLoader();
beforeAll(() => areas.ensureAll(['park', 'neighborhood', 'market']), 60_000);
const life = (o = {}) => lifecycle({ areas, ...o });

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

describe('nothing offers the Market', () => {
  it('no catalog row, no map spot, never named as the next thing', () => {
    expect(Object.hasOwn(CATALOG.areas, 'market')).toBe(false);
    expect(STREET_PLACES.some((p) => p.areaId === 'market')).toBe(false);
    const p = createProgression(memStorage());
    expect(JSON.stringify(nextThing(p.state, { catalog: CATALOG }) ?? null)).not.toMatch(/market/i);
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
    expect(await l.w.beginWalkFromHomebase({ duskMode: false })).toBe('started');
    expect(l.getSession().areaId).toBe('market');
    l.w.endWalk();
  }, 90_000);

  it('starts nothing in Legacy: the save\'s own place', async () => {
    setMarket(true);
    const l = life();
    l.progression.setEdition('legacy');
    await l.w.beginWalkFromHomebase({ duskMode: false });
    expect(l.getSession().areaId).toBe('neighborhood');
    l.w.endWalk();
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
    await l.w.beginWalkFromHomebase({ duskMode: false });
    expect(l.getSession().areaId).toBe('neighborhood');
    l.w.endWalk();
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

  it('is dropped without the flag', () => {
    expect(readResume(noteFor(), { now: NOW + 60_000, areaIds: ids() })).toBe(null);
  });
  it('is kept with the flag', () => {
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
  // stall-local watch zone of a treat stall: |lx| <= w/2 + 1.0, d/2 <= lz <= d/2 + 3.2
  const inZone = (s, p) => {
    const { lx, lz } = toStall(s, p.x, p.z);
    return Math.abs(lx) <= s.w / 2 + 1.0 && lz >= s.d / 2 && lz <= s.d / 2 + 3.2;
  };
  it('never stand in a counter\'s zone', async () => {
    setMarket(true);
    const l = life();
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
    for (let i = 0; i < 120; i++) s.strayCats.update(0.1, i * 0.1, { x: 0, y: 0, z: 29 });
    check();
    l.w.endWalk();
  }, 90_000);
});
