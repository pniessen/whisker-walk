import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { walkHarness, areas, fakeDocument, memStorage } from './helpers/walkharness.js';
import { setBdaySwitch, BDAY_START, noteCandlesBlown } from '../src/birthday.js';
import { mulberry32 } from '../src/rng.js';

// Her birthday, whole walks (headless): the birthday Explore starts a solo
// walk in the Pines at the island bridge with the Gathering waiting; nothing
// is unlocked and a locked Pines' walk count stays as it was; a room walk, a
// walk with the event off and a walk after today's candles have none.

const WALK_MS = 90_000;

beforeAll(() => areas.ensureAll(['neighborhood', 'pines']), WALK_MS);

beforeEach(() => {
  globalThis.document = fakeDocument();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: new Date('2026-11-21T15:00:00Z') });
  const stream = mulberry32(20261121);
  vi.spyOn(Math, 'random').mockImplementation(() => stream());
});
afterEach(() => {
  delete globalThis.document;
  delete globalThis.localStorage;
  setBdaySwitch(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const town = (p) => {
  p.setTutorialFirst('done');
  p.state.walks.neighborhood = 4;
  p.state.petName = 'Moonpaw';
};

describe('the birthday walk', () => {
  it('Explore goes to the island bridge in the Pines, with the Gathering, and unlocks nothing', async () => {
    setBdaySwitch(true);
    const h = walkHarness({ save: town });
    const before = { area: h.progression.state.area, areas: [...h.progression.state.unlocked.areas], pines: h.progression.state.walks.pines };
    expect(before.areas).not.toContain('pines');
    expect(await h.w.beginWalkFromHomebase({ duskMode: false })).toBe('started');
    const s = h.getSession();
    expect(s.areaId).toBe('pines');
    expect(s.birthday).toBeTruthy();
    expect(s.birthday.phase).toBe('wait');
    expect(Math.hypot(s.cat.position.x - BDAY_START.x, s.cat.position.z - BDAY_START.z)).toBeLessThan(1);
    // the Pines' own cats at the Gathering are not in their camp as well
    const gathered = new Set(s.birthday.cats.map((c) => c.member.id));
    for (const c of s.clanCats.list) expect(gathered.has(c.id), c.id).toBe(false);
    // the cake is solid
    expect(s.areaData.colliders.some((c) => c.x === s.birthday.cake.x && c.z === s.birthday.cake.z)).toBe(true);
    h.w.endWalk();
    expect(h.progression.state.area).toBe(before.area);
    expect(h.progression.state.unlocked.areas).toEqual(before.areas);
    expect(h.progression.state.walks.pines).toBe(before.pines);
  }, WALK_MS);

  it('a room walk in the Pines never has one', () => {
    setBdaySwitch(true);
    const h = walkHarness({ save: town });
    h.w.startWalk({ roomSeed: 4242, areaOverride: 'pines' });
    expect(h.getSession().birthday).toBeNull();
    h.w.endWalk();
  }, WALK_MS);

  it('with the event off, Explore is an ordinary walk and the Pines have no Gathering', async () => {
    const h = walkHarness({ save: town });
    expect(await h.w.beginWalkFromHomebase({ duskMode: false })).toBe('started');
    expect(h.getSession().areaId).toBe('neighborhood');
    expect(h.getSession().birthday ?? null).toBeNull();
    h.w.endWalk();
    h.w.startWalk({ areaOverride: 'pines' });
    expect(h.getSession().birthday).toBeNull();
    expect(h.getSession().clanCats.list.some((c) => c.id === 'pines-0')).toBe(true);
    h.w.endWalk();
  }, WALK_MS);

  it('once today’s candles are out, Explore is ordinary again', async () => {
    setBdaySwitch(true);
    globalThis.localStorage = memStorage();
    noteCandlesBlown();
    const h = walkHarness({ save: town });
    expect(await h.w.beginWalkFromHomebase({ duskMode: false })).toBe('started');
    expect(h.getSession().areaId).toBe('neighborhood');
    h.w.endWalk();
  }, WALK_MS);
});
