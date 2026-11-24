import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mulberry32 } from '../src/rng.js';
import { setGreenhouse, greenhouseOn } from '../src/greenhouseflag.js';
import { createAreaLoader } from '../src/game/areaload.js';
import { CATALOG, createProgression } from '../src/progression.js';
import { STREET_PLACES } from '../src/worldmap.js';
import { endsFor } from '../src/gateways.js';
import { nextThing } from '../src/ui/nextthing.js';
import { KEPT_OFFERS } from '../src/areaoffer.js';
import { lifecycle, fakeEl, memStorage } from './helpers/walklife.js';

// The Greenhouse in the game (milestone 0): behind ?greenhouse=1, a solo walk in either edition, its own download.
// Nothing offers it: no catalog row, no map place, no gate.

const areas = createAreaLoader();
beforeAll(() => areas.ensureAll(['park', 'neighborhood', 'greenhouse']), 60_000);
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
  setGreenhouse(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('nothing offers it yet', () => {
  it('no catalog row, no map place, no gate, no kept offer', () => {
    expect(Object.hasOwn(CATALOG.areas, 'greenhouse')).toBe(false);
    expect(STREET_PLACES.some((p) => p.areaId === 'greenhouse')).toBe(false);
    expect(endsFor('farm').some((e) => /greenhouse/.test(e.id))).toBe(false);
    expect(Object.hasOwn(KEPT_OFFERS, 'greenhouse')).toBe(false);
  });
  it('a fresh save is never told about it, and cannot buy it with any paws', () => {
    const p = createProgression(memStorage());
    expect(JSON.stringify(nextThing(p.state, { catalog: CATALOG }) ?? null)).not.toMatch(/greenhouse/i);
    expect(p.state.walks.greenhouse).toBe(0);
    p.addPoints(5000);
    expect(p.buy('areas', 'greenhouse')).toBe(false);
    expect(p.state.unlocked.areas).not.toContain('greenhouse');
  });
});

describe('the flag', () => {
  it('reads ?greenhouse=1 at call time, and a test can force it', () => {
    expect(greenhouseOn()).toBe(false);
    setGreenhouse(true);
    expect(greenhouseOn()).toBe(true);
    setGreenhouse(false);
    expect(greenhouseOn()).toBe(false);
  });

  for (const edition of ['canon', 'legacy']) {
    it(`starts a solo Greenhouse walk in ${edition}, glass and all`, async () => {
      setGreenhouse(true);
      const l = life();
      try {
        l.progression.setEdition(edition);
        expect(await l.w.beginWalkFromHomebase({ duskMode: false })).toBe('started');
        const s = l.getSession();
        expect(s.areaId).toBe('greenhouse');
        expect(s.areaData.name).toBe('The Greenhouse');
        expect(s.cat.position.x).toBe(0);
        expect(s.cat.position.z).toBe(30);
        // the walk's sweeps leave the glass house whole: the pane is still one transparent mesh, un-merged, and (the owner's
        // call) NOT a fading window: no userData.window, so the building fade never hides the frame or the cat behind it
        let panes = 0;
        s.scene.traverse((o) => { if (o.isMesh && o.userData.glassHouse) { panes++; expect(o.material.transparent).toBe(true); expect(o.userData.window).toBeUndefined(); } });
        expect(panes).toBe(1);
        expect(s.scene.getObjectByName('glassMist')).toBeTruthy();
      } finally { endIfWalking(l); }
    }, 90_000);
  }

  it('never in a room', () => {
    setGreenhouse(true);
    const l = life();
    l.setPendingRoom({ code: 'ABCD' });
    l.w.beginWalkFromHomebase({ duskMode: false });
    expect(l.getSession()).toBe(null);
    expect(l.rec.roomStarts).toEqual([{ area: 'neighborhood', dusk: false }]);
  });

  it('without the flag, Explore walks the save\'s own place', async () => {
    setGreenhouse(false);
    const l = life();
    try {
      await l.w.beginWalkFromHomebase({ duskMode: false });
      expect(l.getSession().areaId).toBe('neighborhood');
    } finally { endIfWalking(l); }
  }, 90_000);
});
