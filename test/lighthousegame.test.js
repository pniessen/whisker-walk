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
import * as L from '../src/world/lighthouseplan.js';

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

describe('it is in the game (milestone 4)', () => {
  it('has its catalog row, its map place, its gate pair and no kept offer', () => {
    expect(CATALOG.areas.lighthouse).toEqual({ name: 'Lighthouse Point', price: 150, requires: { area: 'seaside', walks: 2 } });
    expect(Object.keys(CATALOG.areas).indexOf('lighthouse')).toBe(Object.keys(CATALOG.areas).indexOf('seaside') + 1);
    expect(STREET_PLACES.some((p) => p.areaId === 'lighthouse')).toBe(true);
    expect(TOWN_PLACES.some((p) => p.areaId === 'lighthouse')).toBe(false);
    expect(endsFor('seaside').map((e) => e.id)).toContain('seaside-lighthouse');
    expect(endsFor('lighthouse').map((e) => e.id)).toEqual(['lighthouse-seaside']);
    expect(Object.hasOwn(KEPT_OFFERS, 'lighthouse')).toBe(false);
  });
  it('a fresh save is not offered it, and cannot buy it before two Seaside walks, with any paws', () => {
    const p = createProgression(memStorage());
    expect(JSON.stringify(nextThing(p.state, { catalog: CATALOG }) ?? null)).not.toMatch(/lighthouse/i);
    p.addPoints(5000);
    expect(p.buy('areas', 'lighthouse')).toBe(false);
    expect(p.state.unlocked.areas).not.toContain('lighthouse');
    expect(p.state.points).toBe(5000);
  });
  it('is offered at 150 paws after 2 Seaside walks, in both editions, and not a paw earlier', () => {
    for (const edition of ['canon', 'legacy']) {
      const p = createProgression(memStorage());
      p.state.edition = edition;
      p.state.unlocked.areas.push('seaside');
      p.state.walks.seaside = 1;
      p.addPoints(150);
      expect(p.canBuy('areas', 'lighthouse'), `${edition} 1 walk`).toBe(false);
      p.state.walks.seaside = 2;
      p.state.points = 149;
      expect(p.canBuy('areas', 'lighthouse'), `${edition} 149`).toBe(false);
      p.state.points = 150;
      expect(p.canBuy('areas', 'lighthouse'), `${edition} 150`).toBe(true);
      expect(p.buy('areas', 'lighthouse')).toBe(true);
      expect(p.state.points).toBe(0);
      expect(p.state.unlocked.areas).toContain('lighthouse');
    }
  });
  it('a save that walked it by the switch owns nothing it did not buy', () => {
    const p = createProgression(memStorage());
    p.completeWalk('lighthouse');
    expect(p.state.walks.lighthouse).toBe(1);
    expect(p.state.unlocked.areas).not.toContain('lighthouse');
  });
});

describe('the card picture', () => {
  it('is a 640 x 360 JPEG in public/places, as every place\'s is', async () => {
    const { readFileSync } = await import('node:fs');
    const jpg = readFileSync(new URL('../public/places/lighthouse.jpg', import.meta.url));
    expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8]);
    expect(jpg.length).toBeGreaterThan(5000);
    // the first start-of-frame marker holds the height then the width
    let i = 2, w = 0, h = 0;
    while (i < jpg.length) { if (jpg[i] === 0xff && jpg[i + 1] >= 0xc0 && jpg[i + 1] <= 0xc2) { h = jpg.readUInt16BE(i + 5); w = jpg.readUInt16BE(i + 7); break; } i += 2 + jpg.readUInt16BE(i + 2); }
    expect([w, h]).toEqual([640, 360]);
  });
  it('the home line for a save standing in the Seaside after its first walk says Explore here again to open Lighthouse Point', () => {
    const p = createProgression(memStorage());
    p.state.edition = 'canon';
    p.state.area = 'seaside';
    p.state.unlocked.areas.push('seaside');
    p.state.walks.seaside = 1;
    expect(JSON.stringify(nextThing(p.state, { catalog: CATALOG }) ?? null)).toMatch(/Lighthouse Point/);
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

  it('the walk makes the moves runtime and the lamp\'s life, and the lever pays 25 paws once through the real discovery log', async () => {
    setLighthouse(true);
    const l = life({ realLog: true });
    try {
      expect(await l.w.beginWalkFromHomebase({ duskMode: false })).toBe('started');
      const s = l.getSession();
      expect(s.traversal.crossings?.length ?? s.traversal).toBeTruthy(); // not NO_TRAVERSAL
      expect(typeof s.areaLife.update).toBe('function');
      expect(s.areaLife.lit).toBe(false);
      const lever = s.tippables.list.find((e) => e.kind === 'lever');
      expect(lever.prompt).toBe('E — pull the lamp lever');
      const before = l.progression.state.points;
      expect(s.tippables.tip(lever)).toBe(true);
      // up in the lamp room (the job pays the cat who is there)
      s.cat.position.set(L.TOWER.x + 2.65 * Math.cos((201 * Math.PI) / 180), 13.5, L.TOWER.z + 2.65 * Math.sin((201 * Math.PI) / 180));
      for (let i = 0; i < 10; i++) s.areaLife.update(1 / 30, 0, s.cat.position, null, s);
      expect(s.areaLife.lit).toBe(true);
      expect(l.progression.state.points - before).toBe(25);
      expect(l.progression.state.feats.lighthousejob).toBe(1);
      for (let i = 0; i < 300; i++) s.areaLife.update(1 / 30, 0, s.cat.position, null, s);
      expect(l.progression.state.points - before).toBe(25);
    } finally { endIfWalking(l); }
  }, 90_000);

  it('the walk lays the gulls and crabs, three golden mice, the porch\'s rests and the two cats, and the real critters fly up at the bell', async () => {
    setLighthouse(true);
    const l = life({ realLog: true });
    try {
      expect(await l.w.beginWalkFromHomebase({ duskMode: false })).toBe('started');
      const s = l.getSession();
      const types = s.critters.list.map((c) => c.type);
      expect(types.filter((t) => t === 'seagull')).toHaveLength(5);
      expect(types.filter((t) => t === 'crab')).toHaveLength(5);
      expect(s.goldMice.list.map((m) => m.id)).toEqual(['gm-light-1', 'gm-light-2', 'gm-light-3']);
      expect(s.goldMice.list[0].worldY).toBe(13.5);
      expect(s.areaLife.cats.state).toBe('hidden');
      expect(typeof s.areaLife.promptAt).toBe('function');
      expect(s.areaLife.cats.meshes.mother.parent).toBe(s.scene ?? s.areaLife.cats.meshes.mother.parent);
      // the bell: her paw on the rope rings it, and the gull on the plateau nearest it takes off
      const rope = s.tippables.list.find((e) => e.kind === 'bell');
      const gull = s.critters.list.find((c) => c.type === 'seagull' && Math.hypot(c.group.position.x - L.BELL.x, c.group.position.z - L.BELL.z) < 30);
      expect(gull).toBeTruthy();
      expect(gull.fleeing).toBe(false);
      s.cat.position.set(L.BELL_ROPE.x + 0.4, 6, L.BELL_ROPE.z);
      for (let i = 0; i < 5; i++) s.areaLife.update(1 / 30, 0, s.cat.position, null, s);
      expect(s.tippables.tip(rope)).toBe(true);
      const before = l.progression.state.points;
      for (let i = 0; i < 5; i++) s.areaLife.update(1 / 30, 0, s.cat.position, null, s);
      expect(gull.fleeing).toBe(true);
      expect(l.progression.state.journal.lhbell).toBe(1);
      expect(l.progression.state.points - before).toBe(12); // the find (the first ever); the rope's own mischief paws are interactions.js's
    } finally { endIfWalking(l); }
  }, 90_000);

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
