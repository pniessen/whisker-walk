import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mulberry32 } from '../src/rng.js';
import { setLighthouse, lighthouseOn } from '../src/lighthouseflag.js';
import { createAreaLoader } from '../src/game/areaload.js';
import { AREA_LOADERS, AREA_ENTRY_MODULES } from '../src/world/areas.js';
import { CATALOG, createProgression } from '../src/progression.js';
import { STREET_PLACES, TOWN_PLACES } from '../src/worldmap.js';
import { endsFor } from '../src/gateways.js';
import { nextThing } from '../src/ui/nextthing.js';
import { KEPT_OFFERS } from '../src/areaoffer.js';
import { lifecycle, fakeEl, memStorage } from './helpers/walklife.js';

// Lighthouse Point in the game (milestone 1): behind ?lighthouse=1, a solo walk in either edition, its own
// download. Nothing offers it: no catalog row, no map place, no gate, until milestone 4.

const areas = createAreaLoader();
beforeAll(() => areas.ensureAll(['park', 'neighborhood', 'lighthouse']), 60_000);
const life = (o = {}) => lifecycle({ areas, ...o });
const endIfWalking = (l) => { if (l.getSession()) l.w.endWalk(); };

beforeEach(() => {
  globalThis.document = { body: fakeEl(), createElement: fakeEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-22T17:00:00Z') });
  const stream = mulberry32(20261122);
  vi.spyOn(Math, 'random').mockImplementation(() => stream());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  delete globalThis.document;
  setLighthouse(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('nothing offers it yet', () => {
  it('no catalog row, no map place, no gate, no kept offer', () => {
    expect(Object.hasOwn(CATALOG.areas, 'lighthouse')).toBe(false);
    expect(STREET_PLACES.some((p) => p.areaId === 'lighthouse')).toBe(false);
    expect(TOWN_PLACES.some((p) => p.areaId === 'lighthouse')).toBe(false);
    expect((endsFor('seaside').some((e) => /lighthouse/.test(e.id)) || endsFor('lighthouse').length > 0)).toBe(false);
    expect(Object.hasOwn(KEPT_OFFERS, 'lighthouse')).toBe(false);
  });
  it('a fresh save is never told about it', () => {
    const p = createProgression(memStorage());
    expect(JSON.stringify(nextThing(p.state, { catalog: CATALOG }) ?? null)).not.toMatch(/lighthouse/i);
  });
  it('a save cannot buy it, with any paws', () => {
    const p = createProgression(memStorage());
    p.addPoints(5000);
    expect(p.buy('areas', 'lighthouse')).toBe(false);
    expect(p.state.unlocked.areas).not.toContain('lighthouse');
    expect(p.state.points).toBe(5000);
  });
});

describe('the flag', () => {
  it('reads ?lighthouse=1 at call time, and a test can force it', () => {
    expect(lighthouseOn()).toBe(false);
    setLighthouse(true);
    expect(lighthouseOn()).toBe(true);
    setLighthouse(false);
    expect(lighthouseOn()).toBe(false);
  });

  for (const edition of ['canon', 'legacy']) {
    it(`starts a solo Lighthouse walk in ${edition}`, async () => {
      setLighthouse(true);
      const l = life();
      try {
        l.progression.setEdition(edition);
        expect(await l.w.beginWalkFromHomebase({ duskMode: false })).toBe('started');
        const s = l.getSession();
        expect(s.areaId).toBe('lighthouse');
        // the walk puts her on the cove, facing north, on the real ground
        expect(s.areaData.name).toBe('Lighthouse Point');
        expect(s.cat.position.x).toBe(14);
        expect(s.cat.position.z).toBe(36);
        expect(s.cat.position.y).toBe(0);
        // always evening, with no Glow Collar, and it does not count as a dusk walk
        expect(s.areaData.evening).toBe(true);
      } finally { endIfWalking(l); }
    }, 90_000);
  }

  it('never in a room', () => {
    setLighthouse(true);
    const l = life();
    l.setPendingRoom({ code: 'ABCD' });
    l.w.beginWalkFromHomebase({ duskMode: false });
    expect(l.getSession()).toBe(null);
    expect(l.rec.roomStarts).toEqual([{ area: 'neighborhood', dusk: false }]);
  });

  it('without the flag, Explore walks the save\'s own place', async () => {
    setLighthouse(false);
    const l = life();
    try {
      await l.w.beginWalkFromHomebase({ duskMode: false });
      expect(l.getSession().areaId).toBe('neighborhood');
    } finally { endIfWalking(l); }
  }, 90_000);
});

describe('counting', () => {
  it('counts a Lighthouse walk, owns nothing it did not buy, and an old save loads with lighthouse 0', () => {
    const p = createProgression(memStorage());
    expect(p.state.walks.lighthouse).toBe(0);
    p.completeWalk('lighthouse');
    expect(p.state.walks.lighthouse).toBe(1);
    expect(p.state.unlocked.areas).toEqual(['neighborhood']);
    const old = JSON.parse(JSON.stringify(p.state));
    delete old.walks.lighthouse;
    const s = memStorage();
    s.setItem('whisker-walk-save', JSON.stringify(old));
    expect(createProgression(s).state.walks.lighthouse).toBe(0);
  });
});

describe('its own download', () => {
  it('Lighthouse Point is its own chunk, with nothing else but the builder, its plan and its parts', async () => {
    expect((await AREA_LOADERS.lighthouse()).world).toBe(await import('../src/world/lighthouse.js'));
    expect(AREA_ENTRY_MODULES.lighthouse).toEqual(['src/world/lighthouse.js']);
  });
});
