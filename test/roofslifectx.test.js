import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mulberry32 } from '../src/rng.js';
import { setRoofs } from '../src/roofsflag.js';
import { createAreaLoader } from '../src/game/areaload.js';
import { lifecycle, fakeEl } from './helpers/walklife.js';

// What the walk hands an area's life: the Rooftops' birds need the walk's
// critters and how many walks she has had there.
const seen = vi.hoisted(() => ({ ctx: [] }));
vi.mock('../src/world/roofs.js', async (importOriginal) => {
  const m = await importOriginal();
  return {
    ...m,
    GRASS_HOOKS: undefined,
    build: (...args) => {
      const record = m.build(...args);
      const realLife = record.life;
      return { ...record, life: (ctx) => { seen.ctx.push(ctx); return realLife(ctx); } };
    },
  };
});

const areas = createAreaLoader();
let stream = null;
beforeAll(() => areas.ensureAll(['park', 'neighborhood', 'roofs']));
beforeEach(() => {
  globalThis.document = { body: fakeEl(), createElement: fakeEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-20T15:00:00Z') });
  stream = mulberry32(20261121);
  vi.spyOn(Math, 'random').mockImplementation(() => stream());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  seen.ctx.length = 0;
});
afterEach(() => {
  delete globalThis.document;
  setRoofs(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the area life\'s context', () => {
  it('the Rooftops\' life is handed the walk\'s critters and how many walks she has had there', () => {
    const life = lifecycle({ areas });
    life.w.startWalk({ duskMode: false, areaOverride: 'roofs' });
    expect(seen.ctx.at(-1).critters).toBe(life.getSession().critters);
    expect(seen.ctx.at(-1).visits).toBe(0);
    life.w.endWalk();
    life.w.startWalk({ duskMode: false, areaOverride: 'roofs' });
    expect(seen.ctx.at(-1).visits).toBe(1);
    life.w.endWalk();
  });
});

describe('the area life\'s context (Rooftops step 5)', () => {
  it('the walk hands the life its log and progression, and her view heading to turn', () => {
    const life = lifecycle({ areas });
    life.w.startWalk({ duskMode: false, areaOverride: 'roofs' });
    const ctx = seen.ctx.at(-1);
    expect(ctx.log).toBe(life.log);
    expect(ctx.progression).toBe(life.progression);
    expect('hud' in ctx).toBe(false); // the moments never used it (fix wave, M5)
    // viewYaw reads and sets the player's own view heading (fix wave, I2)
    let yaw = 0.4;
    life.player.viewYaw = () => yaw;
    life.player.setViewYaw = (v) => { yaw = v; };
    expect(ctx.viewYaw.get()).toBe(0.4);
    ctx.viewYaw.set(-1.25);
    expect(yaw).toBe(-1.25);
    life.w.endWalk();
  }, 90_000);
});
