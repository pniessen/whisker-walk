// The holiday errand (H7, src/world/holidayfinds.js): which finds a walk has, where they stand (reached with no skills, clear of
// everything), the pick-up rules (the found outfits' numbers), the counter and the earned piece (one counted a walk, three give it,
// no paws), a partner's pick-up counting for both, the save keys (sanitiser, merge, round trip), and the words in both sets.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { bannedIn, withOffWords } from './helpers/offwords.js';

stubCanvasDocument();

const hf = await import('../src/world/holidayfinds.js');
hf.bind(hf.NEEDS.map((k) => THREE[k]));
const { planHolidayFinds, createHolidayFinds, holidayFinds, HOLIDAY_FIND_SALT, WALK_KEY } = hf;
const spotsMod = await import('../src/world/holidayspots.js');
const { HOLIDAY_FIND_LINES } = await import('../src/world/holidayfindwords.js');
const rules = await import('../src/foundwear/rules.js');
const { FIND_SPOTS } = await import('../src/foundwear/spots/index.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { createProgression, sanitizeSave, CATALOG } = await import('../src/progression.js');
const { sanitizeHolidayFinds, mergeHolidayFinds, HOLIDAY_FINDS_NEEDED } = await import('../src/foundwear/holidaywear.js');
const { MERGE_RULES } = await import('../src/catmerge.js');
const { setHolidayOverride } = await import('../src/holidays.js');
const { phrase, hasPhrase } = await import('../src/clanphrases.js');
const { isWalkableAt } = await import('../src/player.js');
const { floodFrom } = await import('./helpers/flood.js');
const { partsFor } = await import('../src/world/holidaydecor.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildFarm } = await import('../src/world/farm.js');
const { build: buildMarket } = await import('../src/world/market.js');
await (await import('../src/world/housestages.js')).loadHouseStages();
const { build: buildHouse } = await import('../src/world/house.js');

const XMAS = { christmas: true, hanukkah: false, night: 0 };
const HANUKKAH = { christmas: false, hanukkah: true, night: 3 };
const BOTH = { christmas: true, hanukkah: true, night: 3 };
const WINTER = { christmas: false, hanukkah: false, night: 0 };
const at = (m, d, y = 2026) => new Date(y, m - 1, d, 12);

describe('which finds a walk has', () => {
  const plan = (set, seed = 12345, extra = {}) => planHolidayFinds({ areaId: 'park', set, seed, ...extra });
  it('Christmas: two ornaments; Hanukkah: a dreidel and a gold coin; both: one of each', () => {
    expect(plan(XMAS).map((f) => f.kind)).toEqual(['ornament', 'ornament']);
    expect(plan(HANUKKAH).map((f) => f.kind).sort()).toEqual(['dreidel', 'gelt']);
    expect(plan(BOTH).map((f) => f.holiday).sort()).toEqual(['christmas', 'hanukkah']);
  });
  it('two at most, two different spots, never on Winter Lights alone, in the den, on the guided first walk or without a seed', () => {
    for (let seed = 1; seed < 80; seed++) {
      const p = plan(BOTH, seed * 7919);
      expect(p.length).toBe(2);
      expect(new Set(p.map((f) => f.id)).size).toBe(2);
    }
    expect(plan(WINTER)).toEqual([]);
    expect(plan(null)).toEqual([]);
    expect(plan(XMAS, 5, { isDen: true })).toEqual([]);
    expect(plan(XMAS, 5, { lessonKind: 'first' })).toEqual([]);
    expect(plan(XMAS, NaN)).toEqual([]);
    expect(plan(XMAS, 'abc')).toEqual([]);
    expect(planHolidayFinds({ areaId: 'moon', set: XMAS, seed: 5 })).toEqual([]);
  });
  it('the same seed puts the same finds on the same spots (both devices of a room), others differ, and the salt is not the outfit find\'s', () => {
    expect(plan(BOTH, 99)).toEqual(plan(BOTH, 99));
    const ids = new Set();
    for (let seed = 1; seed < 200; seed++) ids.add(plan(XMAS, seed * 104729).map((f) => f.id).join());
    expect(ids.size).toBeGreaterThan(3);
    expect(HOLIDAY_FIND_SALT).not.toBe(rules.FIND_SALT);
  });
  it('every place has spots: four (three in the Old House), each at least two', () => {
    expect(Object.keys(spotsMod.HOLIDAY_FIND_SPOTS).sort()).toEqual(['farm', 'house', 'market', 'neighborhood', 'park']);
    for (const list of Object.values(spotsMod.HOLIDAY_FIND_SPOTS)) expect(list.length).toBeGreaterThanOrEqual(3);
  });
  it('outside a window the walk has no finds', () => {
    setHolidayOverride(null);
    expect(holidayFinds(new THREE.Scene(), { areaId: 'park', seed: 5, now: at(7, 4) })).toBe(null);
    expect(holidayFinds(new THREE.Scene(), { areaId: 'park', seed: 5, pick: 'off', now: at(12, 5) })).toBe(null);
    const f = holidayFinds(new THREE.Scene(), { areaId: 'park', seed: 5, now: at(12, 5) });
    expect(f.finds.length).toBe(2);
    f.dispose();
  });
});

describe('where they stand', () => {
  const places = { neighborhood: buildNeighborhood, park: buildPark, farm: buildFarm, market: buildMarket, house: buildHouse };
  for (const [id, build] of Object.entries(places)) {
    it(`${id}: on the ground, reached on foot from the spawn with no skill, 15 m from the spawn, clear of colliders, collectibles, mice, outfit finds and decor`, () => {
      const area = build(new THREE.Scene());
      const stand = (x, z) => isWalkableAt(area, x, z);
      const flood = floodFrom(area, area.spawn, stand);
      const decor = partsFor(id, { christmas: true, hanukkah: true, night: 8 }).items.filter((i) => i.y < 0.6 && ['tree', 'menorah', 'stall'].includes(i.kind));
      for (const [x, z] of spotsMod.HOLIDAY_FIND_SPOTS[id]) {
        const tag = `${id} ${x},${z}`;
        expect(Math.hypot(x - area.spawn.x, z - area.spawn.z), tag).toBeGreaterThanOrEqual(rules.SPAWN_CLEAR);
        expect(stand(x, z), `${tag} walkable`).toBe(true);
        expect(flood.reachesWithin(x, z, rules.PICKUP.r), `${tag} reached`).toBe(true);
        expect(x, tag).toBeGreaterThan(area.bounds.minX + 1);
        expect(x, tag).toBeLessThan(area.bounds.maxX - 1);
        expect(z, tag).toBeGreaterThan(area.bounds.minZ + 1);
        expect(z, tag).toBeLessThan(area.bounds.maxZ - 1);
        for (const c of area.colliders) expect(Math.hypot(x - c.x, z - c.z), `${tag} collider ${c.x},${c.z}`).toBeGreaterThan(c.r + 0.5);
        for (const c of area.collectibles ?? []) expect(Math.hypot(x - c.x, z - c.z), `${tag} collectible ${c.id}`).toBeGreaterThanOrEqual(2);
        for (const m of GOLD_MICE[id] ?? []) expect(Math.hypot(x - m.x, z - m.z), `${tag} mouse ${m.id}`).toBeGreaterThanOrEqual(2);
        for (const s of FIND_SPOTS[id] ?? []) expect(Math.hypot(x - s.x, z - s.z), `${tag} outfit find ${s.id}`).toBeGreaterThanOrEqual(2);
        for (const d of decor) expect(Math.hypot(x - d.x, z - d.z), `${tag} decor ${d.kind}`).toBeGreaterThanOrEqual(2.5);
      }
    });
  }
  it('the pick-up numbers are the found outfits\' (rules.js)', () => {
    expect(hf.PICKUP).toEqual(rules.PICKUP);
    expect([hf.TWINKLE_RANGE, hf.CHIME_RANGE, hf.CHIME_REARM, hf.SPAWN_CLEAR]).toEqual([rules.TWINKLE_RANGE, rules.CHIME_RANGE, rules.CHIME_REARM, rules.SPAWN_CLEAR]);
  });
});

describe('the finds on the ground', () => {
  const frame = (x, z, extra = {}) => ({ x, z, pawsY: 0, camera: null, remotes: null, busy: false, ...extra });
  function make(extra = {}) {
    const scene = new THREE.Scene();
    const plan = planHolidayFinds({ areaId: 'farm', set: BOTH, seed: 4242 });
    const chimes = [];
    const live = createHolidayFinds(scene, { plan, onNear: () => chimes.push(1), ...extra });
    return { scene, plan, live, chimes };
  }
  it('each find is one small group with a twinkle, on the ground', () => {
    const { scene, live, plan } = make();
    expect(live.finds.length).toBe(2);
    expect(scene.children.filter((c) => c.userData.holidayFind).length).toBe(2);
    for (const f of live.finds) { expect(f.worldY).toBe(0); expect(f.group.children.length).toBeGreaterThanOrEqual(2); }
    expect(plan.length).toBe(2);
  });
  it('twinkles from 20 m, chimes once within 6 m (and again only after 10 m away), is picked up within a metre', () => {
    const { live, chimes } = make();
    const f = live.finds[0];
    expect(live.update(0.016, 1, frame(f.x + 30, f.z))).toBe(null);
    expect(f.twinkle.visible).toBe(false);
    expect(live.update(0.016, 1, frame(f.x + 19, f.z))).toBe(null);
    expect(f.twinkle.visible).toBe(true);
    live.update(0.016, 1, frame(f.x + 5, f.z));
    live.update(0.016, 1, frame(f.x + 4, f.z));
    expect(chimes.length).toBe(1);
    live.update(0.016, 1, frame(f.x + 11, f.z));
    live.update(0.016, 1, frame(f.x + 5, f.z));
    expect(chimes.length).toBe(2);
    const a = live.update(0.016, 1, frame(f.x + 0.5, f.z));
    expect(a).toMatchObject({ by: 'me' });
    expect(a.find).toBe(f);
  });
  it('her pick-up waits while she is busy; a partner\'s never does, and a partner too high up (a flat message) still counts', () => {
    const { live } = make();
    const f = live.finds[1];
    expect(live.update(0.016, 1, frame(f.x, f.z, { busy: true }))).toBe(null);
    const a = live.update(0.016, 1, frame(f.x + 40, f.z, { busy: true, remotes: [{ playerId: 'p2', petName: 'Pip', water: { placed: true }, toPos: { x: f.x + 0.2, z: f.z } }] }));
    expect(a).toMatchObject({ by: 'partner', petName: 'Pip' });
  });
  it('under reduced motion it holds still', () => {
    const { live } = make({ reducedMotion: true });
    const f = live.finds[0];
    live.update(0.016, 3.3, frame(f.x + 10, f.z));
    expect(f.group.rotation.y).toBe(0);
    expect(f.twinkle.material.opacity).toBe(0.85);
  });
});

describe('the counter and the earned piece', () => {
  const D = (d) => new Date(2026, 11, d, 12);
  const fresh = () => createProgression(memoryStorage());
  it('three finds give the earned piece, one at a time, and no paws', () => {
    setHolidayOverride(null);
    const p = fresh();
    const points = p.state.points;
    expect(p.recordHolidayFind('christmas', D(10))).toEqual({ count: 1, done: false, earned: false });
    expect(p.recordHolidayFind('christmas', D(11))).toEqual({ count: 2, done: false, earned: false });
    expect(p.state.unlocked.accessories.includes('littlegoldstar')).toBe(false);
    expect(p.recordHolidayFind('christmas', D(12))).toEqual({ count: 3, done: true, earned: true });
    expect(p.state.unlocked.accessories.includes('littlegoldstar')).toBe(true);
    expect(p.state.holidays.christmas2026).toBe(1);
    expect(p.state.holidayFinds).toEqual({ christmas2026: 3 });
    expect(p.recordHolidayFind('christmas', D(13))).toEqual({ count: 3, done: true, earned: false });
    expect(p.state.points).toBe(points);
  });
  it('Hanukkah counts apart from Christmas and gives the Menorah Glow', () => {
    setHolidayOverride(null);
    const p = fresh();
    for (let i = 0; i < 3; i++) p.recordHolidayFind('hanukkah', D(6));
    expect(p.state.unlocked.accessories.includes('menorahglow')).toBe(true);
    expect(p.state.holidayFinds).toEqual({ hanukkah2026: 3 });
    expect(p.state.unlocked.accessories.includes('littlegoldstar')).toBe(false);
  });
  it('nothing outside its window, nothing for Winter Lights, nothing for an unknown holiday', () => {
    setHolidayOverride(null);
    const p = fresh();
    expect(p.recordHolidayFind('christmas', new Date(2026, 6, 4))).toBe(null);
    expect(p.recordHolidayFind('hanukkah', D(20))).toBe(null);
    expect(p.recordHolidayFind('winter', D(20))).toBe(null);
    expect(p.recordHolidayFind('easter', D(20))).toBe(null);
    expect(p.state.holidayFinds).toEqual({});
  });
  it('a new year starts again, and the piece from before is still hers', () => {
    setHolidayOverride(null);
    const p = fresh();
    for (let i = 0; i < 3; i++) p.recordHolidayFind('christmas', D(10));
    expect(p.recordHolidayFind('christmas', new Date(2027, 11, 10, 12))).toEqual({ count: 1, done: false, earned: false });
    expect(p.state.unlocked.accessories.includes('littlegoldstar')).toBe(true);
  });
  it('the count survives a reload', () => {
    setHolidayOverride(null);
    const storage = memoryStorage();
    const p = createProgression(storage);
    p.recordHolidayFind('christmas', D(10));
    expect(createProgression(storage).state.holidayFinds).toEqual({ christmas2026: 1 });
  });
});

describe('what a find does in a walk (handle)', () => {
  const D = new Date(2026, 11, 10, 12);
  function setup() {
    setHolidayOverride(null);
    const progression = createProgression(memoryStorage());
    const marks = new Map();
    const log = { count: (k) => marks.get(k) ?? 0, mark: (k) => marks.set(k, 1) };
    const toasts = [];
    const sounds = [];
    const hud = { toast: (t) => toasts.push(t) };
    const audio = { fanfare: () => sounds.push('fanfare') };
    const scene = new THREE.Scene();
    const live = createHolidayFinds(scene, { plan: planHolidayFinds({ areaId: 'park', set: BOTH, seed: 77 }) });
    const ctx = { progression, log, hud, audio, fx: null, cat: { position: { x: 0, y: 0, z: 0 } }, now: D };
    return { progression, log, toasts, sounds, live, ctx, marks };
  }
  it('one counts a walk: the first says how many of three, the next says another lovely one and counts nothing', () => {
    const { progression, live, ctx, toasts } = setup();
    const [a, b] = live.finds;
    expect(live.handle({ find: a, by: 'me', petName: null }, ctx)).toBe(true);
    expect(toasts[0]).toMatch(/1 of 3/);
    expect(a.taken).toBe(true);
    expect(progression.state.holidayFinds).toEqual({ [`${a.holiday}2026`]: 1 });
    live.handle({ find: b, by: 'me', petName: null }, ctx);
    expect(toasts[1]).toBe(phrase('holiday.find.again'));
    expect(progression.state.holidayFinds).toEqual({ [`${a.holiday}2026`]: 1 });
  });
  it('a find already taken is not taken twice (a partner and she reach it together)', () => {
    const { live, ctx, toasts } = setup();
    const a = live.finds[0];
    expect(live.handle({ find: a, by: 'me', petName: null }, ctx)).toBe(true);
    expect(live.handle({ find: a, by: 'partner', petName: 'Pip' }, ctx)).toBe(false);
    expect(toasts.length).toBe(1);
  });
  it('a partner\'s pick-up counts for her too, and the line says so', () => {
    const { progression, live, ctx, toasts } = setup();
    const a = live.finds[0];
    live.handle({ find: a, by: 'partner', petName: 'Pip' }, ctx);
    expect(toasts[0]).toMatch(/^Pip found one, and it counts for you both\./);
    expect(progression.state.holidayFinds).toEqual({ [`${a.holiday}2026`]: 1 });
  });
  it('the third (on three walks) gives the piece with the fanfare and a line naming it', () => {
    const { progression, ctx, toasts, sounds } = setup();
    progression.recordHolidayFind('christmas', D);
    progression.recordHolidayFind('christmas', D);
    const scene = new THREE.Scene();
    const live = createHolidayFinds(scene, { plan: planHolidayFinds({ areaId: 'park', set: XMAS, seed: 3 }) });
    live.handle({ find: live.finds[0], by: 'me', petName: null }, ctx);
    expect(sounds).toEqual(['fanfare']);
    expect(toasts[0]).toBe(`That is three! The ${phrase('wear.littlegoldstar.name')} is yours for keeps. 🌟`);
    expect(progression.state.unlocked.accessories.includes('littlegoldstar')).toBe(true);
  });
  it('a walk picked up again: what was kept is gone, and still counted once', () => {
    const { live, ctx, log } = setup();
    live.handle({ find: live.finds[0], by: 'me', petName: null }, ctx);
    const scene = new THREE.Scene();
    const again = createHolidayFinds(scene, { plan: planHolidayFinds({ areaId: 'park', set: BOTH, seed: 77 }) });
    again.restore(log);
    expect(again.finds.map((f) => f.taken)).toEqual([true, false]);
    expect(log.count(WALK_KEY)).toBe(1);
  });
});

describe('the save keys', () => {
  it('the sanitiser keeps valid counters up to three and drops junk (and Winter Lights)', () => {
    expect(sanitizeHolidayFinds({ christmas2026: 2, hanukkah2026: 9, winter2026: 1, easter2026: 1, christmas2026x: 1, hanukkah2027: 0, christmas2028: 1.5 })).toEqual({ christmas2026: 2, hanukkah2026: HOLIDAY_FINDS_NEEDED });
    expect(sanitizeHolidayFinds(null)).toEqual({});
    expect(sanitizeHolidayFinds([1])).toEqual({});
    expect(sanitizeHolidayFinds({ ['__proto__']: 1 })).toEqual({});
  });
  it('round trips through a save (sub-key and all), and a fresh save has none', () => {
    expect(sanitizeSave({ version: 4 }).holidayFinds).toEqual({});
    const out = sanitizeSave({ version: 4, holidayFinds: { christmas2026: 2, hanukkah2026: 1 } });
    expect(out.holidayFinds).toEqual({ christmas2026: 2, hanukkah2026: 1 });
    expect(sanitizeSave(JSON.parse(JSON.stringify(out))).holidayFinds).toEqual(out.holidayFinds);
  });
  it('a merge keeps the larger count of each key, on either side', () => {
    expect(mergeHolidayFinds({ christmas2026: 1, hanukkah2026: 3 }, { christmas2026: 2 })).toEqual({ christmas2026: 2, hanukkah2026: 3 });
    const L = { holidayFinds: { christmas2026: 1, hanukkah2026: 3 } };
    const C = { holidayFinds: { christmas2026: 2 } };
    expect(MERGE_RULES.holidayFinds({ L, C })).toEqual({ christmas2026: 2, hanukkah2026: 3 });
  });
  it('a cloud load keeps the larger count too', () => {
    const p = createProgression(memoryStorage());
    p.recordHolidayFind('christmas', new Date(2026, 11, 10, 12));
    p.recordHolidayFind('christmas', new Date(2026, 11, 10, 12));
    p.replaceFromPayload(sanitizeSave({ version: 4, holidayFinds: { christmas2026: 1, hanukkah2026: 2 } }));
    expect(p.state.holidayFinds).toEqual({ christmas2026: 2, hanukkah2026: 2 });
  });
});

describe('the words, in both sets', () => {
  const ids = Object.keys(HOLIDAY_FIND_LINES);
  const sample = (id) => { const e = HOLIDAY_FIND_LINES[id]; return typeof e === 'function' ? e(2) : e; };
  it('every line is in the phrase table, the same in the everyday set, plain, with nothing scary or banned', () => {
    for (const id of ids) {
      expect(hasPhrase(id), id).toBe(true);
      const a = phrase(id, 2);
      expect(a.length, id).toBeGreaterThan(8);
      expect(withOffWords(() => phrase(id, 2)), id).toBe(a);
      expect(bannedIn(a), id).toBe(null);
      expect(/scary|dark|lost|trapped|hurt|dead|grave|haunted|fight|paw|point|coin(s)? for/i.test(sample(id)) && !/gold gelt coin/.test(sample(id)), `${id}: ${sample(id)}`).toBe(false);
    }
  });
  it('no star of David, no countdown, no money', () => {
    for (const id of ids) {
      const t = sample(id);
      expect(t, id).not.toMatch(/✡|🔯|\bdays? left\b|\bhurry\b|\blast chance\b|\bmissed\b|\$|\bbuy\b/i);
    }
  });
});
