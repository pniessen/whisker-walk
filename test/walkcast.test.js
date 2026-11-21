import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mulberry32 } from '../src/rng.js';
import { createAreaLoader } from '../src/game/areaload.js';
import { resolveQuality, LADDER, FLOOR_RUNG } from '../src/render/quality.js';
import { lonersFor, clanCountFor, MIN_LONERS_HIGH } from '../src/clancast.js';
import { catsInArea } from '../src/colony.js';
import { LEGENDARY_BY_AREA } from '../src/legendary.js';
import { KITTYPET_NAMES, CAT_NAMES } from '../src/straynames.js';
import { WANDER_NAMES, WANDER_CAMP_GAP } from '../src/housecats.js';
import { clanWalkableFor } from '../src/world/clanground.js';
import { campLayout } from '../src/world/camp.js';
import { DISCS } from '../src/rivalclans.js';
import { isClanEdition } from '../src/edition.js';
import { lifecycle, fakeEl, memStorage } from './helpers/walklife.js';

// =============================================================================
// Who a walk's start hands out, on real walks (walk.js's createWalkLifecycle
// booted headless, test/helpers/walklife.js, as test/housegame.test.js does):
// how many strays the cast is asked for, the legend and the wanderer, and the
// lessons and their goals. These replace source-text pins that read walk.js's
// lines (rule S1; Old House step 1, final fix F4): what each pin protected is
// shown here as behaviour.
//
// The modules walk.js imports are the real ones, wrapped to note their calls;
// the legend and the wanderer can be forced (seen.legend, seen.wanderer) so a
// walk has them on a day it would not.
// =============================================================================

const seen = vi.hoisted(() => ({ stray: [], legends: [], goals: [], legend: undefined, wanderer: undefined }));
vi.mock('../src/straycats.js', async (importOriginal) => {
  const m = await importOriginal();
  return {
    ...m,
    createStrayCats: (scene, area, count, rng, opts = {}) => {
      const cats = m.createStrayCats(scene, area, count, rng, opts);
      seen.stray.push({
        count,
        extras: (opts.extras ?? []).map((e) => ({ name: e.name, wanderer: !!e.wanderer })),
        colony: (opts.colonyCats ?? []).map((c) => c.name),
        exclude: [...(opts.excludeNames ?? [])],
      });
      return cats;
    },
  };
});
vi.mock('../src/legendary.js', async (importOriginal) => {
  const m = await importOriginal();
  return {
    ...m,
    legendaryFor: (state, areaId, u, o) => {
      seen.legends.push({ areaId, u, shared: !!o?.shared });
      const real = m.legendaryFor(state, areaId, u, o);
      return seen.legend === undefined ? real : seen.legend;
    },
  };
});
vi.mock('../src/housecats.js', async (importOriginal) => {
  const m = await importOriginal();
  return {
    ...m,
    walkWanderer: (state, areaId, o) => {
      const real = m.walkWanderer(state, areaId, o);
      return seen.wanderer === undefined || o?.isDen ? real : seen.wanderer;
    },
  };
});
vi.mock('../src/goals.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, createGoals: (...a) => { const g = m.createGoals(...a); seen.goals.push(g); return g; } };
});

const HIGH = resolveQuality({ override: 'high' });
const LOW = resolveQuality({ override: 'low' });
const LITE = LADDER[FLOOR_RUNG];
const LEGEND = LEGENDARY_BY_AREA.park; // the Park's legendary cat (the Woods has none)
const ME = 'player-me1'; // a player id as the colony takes one
const SIS = 'player-sis1';
const WANDERER = WANDER_NAMES[0];

// Math.random is a fixed stream, so a solo walk's seed is fixed; seed(n)
// makes the next solo walk's seed n.
let stream = null;
let queued = [];
const seed = (n) => queued.push((n + 0.5) / 2 ** 31);

const areas = createAreaLoader();
beforeAll(() => areas.ensureAll(['park', 'neighborhood', 'woods', 'den', 'house']));

beforeEach(() => {
  globalThis.document = { body: fakeEl(), createElement: fakeEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-21T15:00:00Z') });
  stream = mulberry32(20261121);
  queued = [];
  vi.spyOn(Math, 'random').mockImplementation(() => (queued.length ? queued.shift() : stream()));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  seen.stray.length = 0;
  seen.legends.length = 0;
  seen.goals.length = 0;
  seen.legend = null; // no legend unless a test asks for one
  seen.wanderer = null; // no wanderer unless a test asks for one
});
afterEach(() => {
  delete globalThis.document;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const life = (o = {}) => lifecycle({ areas, ...o });
// Starts a walk (in this tick) and hands back the session and what the cast was asked for.
function start(l, opts) {
  seen.stray.length = 0;
  seen.legends.length = 0;
  seen.goals.length = 0;
  l.w.startWalk(opts);
  const s = l.getSession();
  expect(s).not.toBe(null);
  return { s, asked: seen.stray.at(-1), legends: [...seen.legends], goalsRolled: [...seen.goals] };
}
function startEnd(l, opts) {
  const r = start(l, opts);
  l.w.endWalk();
  return r;
}
// n of the Woods' ordinary strays, fed by her in the Woods (each one's spot in the colony).
function feedWoods(l, n) {
  const names = CAT_NAMES.filter((c) => !KITTYPET_NAMES.includes(c)).slice(0, n);
  names.forEach((name, i) => {
    expect(l.progression.feedColonyCat({ name, by: ME, walk: 'walk-0', area: 'woods', x: -30 + i * 2, z: 20 }).result).toBe('ok');
  });
  const here = catsInArea(l.progression.state.colony, 'woods').length;
  expect(here).toBe(n);
  return here;
}

// Replaces three pins: test/cowalkstreams.test.js "walk.js takes the stray
// count from the tier, not the pointer", test/walk.edition.test.js "spawns the
// loners, not tier.strays, and counts the fed cats first", and the count lines
// of test/straycats.test.js "a walk with a non-partner never passes extras".
describe('how many strays a walk asks for', () => {
  it('the tier\'s count, not the pointer: a place with no camp asks for tier.strays; indoors, none', () => {
    for (const tier of [HIGH, LOW, LITE]) {
      for (const coarse of [false, true]) {
        const l = life({ tier, coarse });
        expect(startEnd(l, { areaOverride: 'park' }).asked.count, `${tier.name} coarse ${coarse}`).toBe(tier.strays);
        expect(startEnd(l, { areaOverride: 'den' }).asked.count).toBe(0);
        expect(startEnd(l, { areaOverride: 'house' }).asked.count).toBe(0);
      }
    }
    expect(new Set([HIGH.strays, LOW.strays, LITE.strays]).size).toBe(3);
  }, 90_000);

  it('in a territory with a camp the clan stands in for strays, and her fed cats are counted first', () => {
    const l = life();
    expect(isClanEdition(l.progression.state)).toBe(true);
    // her own clan's land: no warrior of it is out on a border patrol (one fewer roaming cat elsewhere)
    expect(l.progression.setClanPick('woods')).toBe(true);
    l.progression.setTutorialCamp();
    const none = start(l, { areaOverride: 'woods' });
    expect(none.asked.count).toBe(lonersFor('woods', HIGH.strays, 0));
    expect(none.asked.count).toBeLessThan(HIGH.strays);
    expect(none.s.clanCats.list.length).toBe(clanCountFor(HIGH.strays, 0));
    l.w.endWalk();
    // more fed cats here than the high tier's own loners: the clan gives slots back one for one
    const fed = feedWoods(l, MIN_LONERS_HIGH + 3);
    const some = start(l, { areaOverride: 'woods' });
    expect(some.asked.colony.length).toBe(fed);
    expect(some.asked.count).toBe(lonersFor('woods', HIGH.strays, fed));
    expect(some.s.clanCats.list.length).toBe(clanCountFor(HIGH.strays, fed));
    expect(some.s.clanCats.list.length).toBeLessThan(none.s.clanCats.list.length);
    expect(some.asked.count).toBeGreaterThan(none.asked.count);
    // every fed cat is in the cast
    const names = some.s.strayCats.strays.map((c) => c.name);
    for (const n of some.asked.colony) expect(names).toContain(n);
    l.w.endWalk();
  }, 90_000);

  it('the lite rung keeps every cat she has fed, where its own count is smaller; the low rung does not', () => {
    const lite = life({ tier: LITE });
    const fed = feedWoods(lite, 3);
    expect(lonersFor('woods', LITE.strays, fed)).toBeLessThan(fed);
    const r = start(lite, { areaOverride: 'woods' });
    expect(r.asked.count).toBe(fed);
    const names = r.s.strayCats.strays.map((c) => c.name);
    for (const n of r.asked.colony) expect(names).toContain(n);
    lite.w.endWalk();
    // the low rung passes its loners as they are
    const low = life({ tier: LOW });
    const many = feedWoods(low, lonersFor('woods', LOW.strays, 0) + 2);
    expect(startEnd(low, { areaOverride: 'woods' }).asked.count).toBe(lonersFor('woods', LOW.strays, many));
  }, 90_000);

  it('a wanderer takes an ordinary loner\'s slot, never a fed cat\'s', () => {
    seen.wanderer = WANDERER;
    const l = life();
    const r = startEnd(l, { areaOverride: 'woods' });
    expect(r.asked.extras).toEqual([{ name: WANDERER, wanderer: true }]);
    expect(r.asked.count).toBe(lonersFor('woods', HIGH.strays, 0) - 1);
    // on the lite rung with her fed cats filling every slot, the wanderer comes as well
    const lite = life({ tier: LITE });
    const fed = feedWoods(lite, 3);
    const full = start(lite, { areaOverride: 'woods' });
    expect(full.asked.extras.map((e) => e.name)).toEqual([WANDERER]);
    expect(full.asked.count).toBe(fed);
    const names = full.s.strayCats.strays.map((c) => c.name);
    for (const n of full.asked.colony) expect(names).toContain(n);
    expect(names).toContain(WANDERER);
    lite.w.endWalk();
  }, 90_000);

  it('kittypets stay out of a territory\'s ordinary cast', () => {
    const r = start(life(), { areaOverride: 'woods' });
    for (const n of KITTYPET_NAMES) expect(r.asked.exclude).toContain(n);
    for (const c of r.s.strayCats.strays) expect(KITTYPET_NAMES, c.name).not.toContain(c.name);
    // the Park is no territory: nobody is kept out of its cast
    expect(startEnd(life(), { areaOverride: 'park' }).asked.exclude).toEqual([]);
  }, 90_000);
});

// Replaces the rest of test/straycats.test.js "a walk with a non-partner never
// passes extras" (the legend, the wanderer and where they come from).
describe('the legend and the wanderer', () => {
  it('solo: one roll off the walk\'s own seed, on her own save; the legend wins over the wanderer and is handed to the cast', () => {
    seen.legend = LEGEND;
    seen.wanderer = WANDERER;
    const walkWith = (areaOverride) => {
      const l = life();
      seed(4242);
      const r = start(l, { areaOverride });
      const legend = r.s.strayCats.strays.find((c) => c.name === LEGEND);
      return { r, spot: legend && { x: legend.group.position.x, z: legend.group.position.z } };
    };
    const a = walkWith('park');
    expect(a.r.legends).toHaveLength(1);
    expect(a.r.legends[0]).toMatchObject({ areaId: 'park', shared: false });
    expect(a.r.asked.extras).toEqual([{ name: LEGEND, wanderer: false }]);
    expect(a.spot).toBeTruthy();
    // the same seed: the same roll, and the legend in the same spot
    const b = walkWith('park');
    expect(b.r.legends[0].u).toBe(a.r.legends[0].u);
    expect(b.spot).toEqual(a.spot);
    // in the Woods on a wanderer's day the legend still wins: no wanderer, so no loner gives up a slot
    const w = walkWith('woods');
    expect(w.r.asked.extras).toEqual([{ name: LEGEND, wanderer: false }]);
    expect(w.r.asked.count).toBe(lonersFor('woods', HIGH.strays, 0));
    expect(w.r.s.strayCats.strays.some((c) => c.name === WANDERER)).toBe(false);
  }, 90_000);

  it('neither the legend nor the wanderer draws from the walk\'s stream: the goals are the same with them or without', () => {
    const goalsOf = (areaOverride) => {
      const l = life();
      seed(777);
      const r = startEnd(l, { areaOverride });
      return { goals: r.s.goals.goals.map((g) => g.id + g.target), extras: r.asked.extras.map((e) => e.name) };
    };
    const woods = goalsOf('woods');
    const park = goalsOf('park');
    expect([woods.extras, park.extras]).toEqual([[], []]);
    seen.wanderer = WANDERER;
    const withWanderer = goalsOf('woods');
    expect(withWanderer.extras).toEqual([WANDERER]);
    seen.legend = LEGEND;
    const withLegend = goalsOf('park');
    expect(withLegend.extras).toEqual([LEGEND]);
    expect(withWanderer.goals).toEqual(woods.goals);
    expect(withLegend.goals).toEqual(park.goals);
  }, 90_000);

  it('the wanderer stands on clan ground away from the camp, and the rival\'s patrol walks the same with it or without', () => {
    const walk = () => {
      const l = life();
      seed(2026);
      const r = start(l, { areaOverride: 'woods' });
      const pos = r.s.rival.patrolPos?.();
      const out = { pos: pos && { x: pos.x, z: pos.z }, wanderer: r.s.strayCats.strays.find((c) => c.wanderer), areaData: r.s.areaData };
      return out;
    };
    const plain = walk();
    expect(plain.pos).toBeTruthy(); // the Woods is another clan's land here: its patrol is out
    seen.wanderer = WANDERER;
    const withWanderer = walk();
    expect(withWanderer.wanderer?.name).toBe(WANDERER);
    const { x, z } = withWanderer.wanderer.group.position;
    expect(clanWalkableFor(withWanderer.areaData, 'woods')(x, z)).toBe(true);
    const camp = campLayout('woods');
    expect(Math.hypot(x - camp.cx, z - camp.cz)).toBeGreaterThanOrEqual(DISCS.woods.r + WANDER_CAMP_GAP - 1e-9);
    expect(withWanderer.pos).toEqual(plain.pos);
  }, 90_000);

  it('a walk with a non-partner never asks for the legend and is handed no colony cats; a partner-only room shares one roll', () => {
    seen.legend = LEGEND; // would come, if it were asked for
    const l = life();
    feedWoods(l, 2);
    l.setPendingRoom({ code: 'ABCD', roster: [{ playerId: 'me' }, { playerId: 'player-someone' }] });
    const stranger = start(l, { areaOverride: 'woods', roomSeed: 99 });
    expect(stranger.legends).toEqual([]);
    expect(stranger.asked.extras).toEqual([]);
    expect(stranger.asked.colony).toEqual([]);
    // a partner-only room: both screens roll the room's own number, on the shared save
    const rolls = [];
    for (let k = 0; k < 2; k++) {
      const p = life();
      p.progression.setColonyLink({ id: 'colony-1', partner: { playerId: SIS, petName: 'Robin' } });
      p.setPendingRoom({ code: 'ABCD', roster: [{ playerId: 'me' }, { playerId: SIS }] });
      const r = start(p, { areaOverride: 'park', roomSeed: 99 });
      expect(r.legends).toHaveLength(1);
      expect(r.legends[0].shared).toBe(true);
      expect(r.asked.extras.map((e) => e.name)).toEqual([LEGEND]);
      rolls.push(r.legends[0].u);
    }
    expect(rolls[1]).toBe(rolls[0]);
    // and indoors it is never asked for
    expect(startEnd(life(), { areaOverride: 'den' }).legends).toEqual([]);
    expect(startEnd(life(), { areaOverride: 'house' }).legends).toEqual([]);
  }, 90_000);
});

// Replaces test/guidewalk.test.js "a walk with a room seed is asked for as a
// room walk, so it is never guided; a first walk with someone else marks the
// lesson skipped" (and the goal and summary lines it pinned).
describe('the lessons at a walk\'s start', () => {
  // A new child's save: the guided first walk is still to come.
  const newChild = () => {
    const l = life();
    l.progression.setTutorialFirst(null);
    return l;
  };
  // A Clan Edition save in the Woods that has not been to its camp yet.
  const campSave = () => {
    const storage = memStorage();
    storage.setItem('whisker-walk-save', JSON.stringify({
      version: 4, walks: { neighborhood: 2 }, points: 30, lifetimePoints: 30,
      clanPick: { mine: 'woods', partner: null, partnerId: null },
      tutorial: { first: 'done', camp: false, hints: {}, told: { thing: null, visits: 0 } },
    }));
    return life({ storage });
  };

  it('a new child\'s solo walk is guided, with the goals rolled as always and held aside; a room walk never is', () => {
    const child = newChild();
    seed(31);
    const solo = start(child, { areaOverride: 'neighborhood' });
    expect(solo.s.lesson?.kind).toBe('first');
    expect(solo.s.goals).toBe(null);
    expect(solo.goalsRolled).toHaveLength(1);
    expect(solo.s.lesson.heldGoals).toBe(solo.goalsRolled[0]);
    // the same walk for a child past the lesson rolls the very same goals and shows them
    const older = life();
    seed(solo.s.soloSeed); // the guided walk picks a clear day's seed; the same seed here
    const past = start(older, { areaOverride: 'neighborhood' });
    expect(past.s.soloSeed).toBe(solo.s.soloSeed);
    expect(past.s.lesson).toBe(null);
    expect(past.s.goals.goals).toEqual(solo.s.lesson.heldGoals.goals);
    // in a room the new child walks an ordinary walk, goals and all
    const room = start(newChild(), { areaOverride: 'neighborhood', roomSeed: 5 });
    expect(room.s.lesson).toBe(null);
    expect(room.s.goals).not.toBe(null);
  }, 90_000);

  it('a new child\'s first walk with someone else marks the lesson skipped; alone it does not', () => {
    const alone = newChild();
    alone.w.startWalk({ areaOverride: 'park' });
    alone.w.endWalk();
    expect(alone.progression.state.tutorial.first).toBe(null);
    const together = newChild();
    together.setPendingRoom({ code: 'ABCD', roster: [{ playerId: 'me' }, { playerId: 'someone' }], net: new Proxy({}, { get: () => () => () => {} }) });
    together.w.startWalk({ areaOverride: 'neighborhood', roomSeed: 5 });
    expect(together.getSession().net).toBeTruthy();
    together.w.endWalk();
    expect(together.progression.state.tutorial.first).toBe('skipped');
  }, 90_000);

  it('the camp walk: a waiting cat is moved onto her way solo, never in a room; the goals wait only solo', () => {
    const solo = start(campSave(), { areaOverride: 'woods' });
    expect(solo.s.lesson?.kind).toBe('camp');
    expect(solo.s.lesson.cat).not.toBe(null);
    expect(solo.s.goals).toBe(null);
    expect(solo.s.lesson.heldGoals).toBe(solo.goalsRolled[0]);
    const room = start(campSave(), { areaOverride: 'woods', roomSeed: 5 });
    expect(room.s.lesson?.kind).toBe('camp');
    expect(room.s.lesson.cat).toBe(null);
    expect(room.s.lesson.heldGoals).toBe(null);
    expect(room.s.goals).toBe(room.goalsRolled[0]);
  }, 90_000);

  it('no goals indoors', () => {
    for (const areaOverride of ['den', 'house']) {
      const r = startEnd(life(), { areaOverride });
      expect(r.s.goals, areaOverride).toBe(null);
      expect(r.goalsRolled, areaOverride).toEqual([]);
    }
  }, 90_000);

  it('the summary shows the goals tile after an ordinary walk, and the guided walk\'s lines in its place', () => {
    const plain = life();
    plain.w.startWalk({ areaOverride: 'park' });
    plain.w.endWalk();
    expect(plain.overlay.innerHTML).toContain('goals done');
    const guided = newChild();
    guided.w.startWalk({ areaOverride: 'neighborhood' });
    expect(guided.getSession().lesson?.kind).toBe('first');
    guided.w.endWalk();
    expect(guided.overlay.innerHTML).toContain('summary-stats');
    expect(guided.overlay.innerHTML).not.toContain('goals done');
  }, 90_000);
});
