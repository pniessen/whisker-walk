import { test, expect, describe, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';

// The headless stub every world test uses (rivalworld.test.js): the only DOM
// the builders touch is document.createElement('canvas').
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'measureText') return () => ({ width: 0 }); // the strays' name tags
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const {
  inYard, dogNotices, dogLanding, isFearless,
  DOG_NOTICE_STALKED, DOG_LANDING_OFFSET, DOG_COOLDOWN, DOG_FEARLESS,
} = await import('../src/dogs.js');
const { propsFor } = await import('../src/propsets.js');
const { isWalkableAt } = await import('../src/player.js');
const { mulberry32 } = await import('../src/rng.js');
const { createCritters } = await import('../src/critters.js');
const { rollWeather, createWeather } = await import('../src/weather.js');
const { rollSecrets, createSecrets } = await import('../src/secrets.js');
const { createQuest } = await import('../src/quests.js');
const { createStrayCats } = await import('../src/straycats.js');
const { createScent } = await import('../src/scent.js');
const { createGoals } = await import('../src/goals.js');
const { clearSpot } = await import('../src/world/spots.js');
const BUILD = {
  neighborhood: (await import('../src/world/neighborhood.js')).build,
  park: (await import('../src/world/park.js')).build,
  seaside: (await import('../src/world/seaside.js')).build,
  docks: (await import('../src/world/docks.js')).build,
};
const AREAS = Object.keys(BUILD);
const built = Object.fromEntries(AREAS.map((a) => [a, BUILD[a](new THREE.Scene())]));

const YARD = { x: 10, z: -5, r: 4, kennel: { x: 8, z: -7 } };

test('the numbers are the brief\'s', () => {
  expect(DOG_NOTICE_STALKED).toBe(0.5);
  expect(DOG_LANDING_OFFSET).toBe(1.5);
  expect(DOG_COOLDOWN).toBe(8);
  // the same pair the shipped bark-freeze spared (main.js 'critter:scare')
  expect([...DOG_FEARLESS]).toEqual(['fearless', 'steady']);
  expect(isFearless('fearless')).toBe(true);
  expect(isFearless('steady')).toBe(true);
  for (const s of ['keenNose', 'napper', undefined, null, 7, '__proto__']) expect(isFearless(s)).toBe(false);
});

test('inYard and dogNotices, walking and stalking', () => {
  expect(inYard(YARD, 10, -5)).toBe(true);
  expect(inYard(YARD, 13.9, -5)).toBe(true);
  expect(inYard(YARD, 14, -5)).toBe(false); // the edge is off the lawn
  expect(inYard(YARD, 20, 20)).toBe(false);
  // Walking or trotting: anywhere on the lawn.
  expect(dogNotices(YARD, { x: 13.5, z: -5 })).toBe(true);
  expect(dogNotices(YARD, { x: 13.5, z: -5 }, { stalking: false })).toBe(true);
  expect(dogNotices(YARD, { x: 14.5, z: -5 })).toBe(false);
  // Stalking: only within half the radius of the centre.
  expect(dogNotices(YARD, { x: 13.5, z: -5 }, { stalking: true })).toBe(false);
  expect(dogNotices(YARD, { x: 12.5, z: -5 }, { stalking: true })).toBe(false);
  expect(dogNotices(YARD, { x: 12, z: -5 }, { stalking: true })).toBe(true);
  expect(dogNotices(YARD, { x: 10, z: -5 }, { stalking: true })).toBe(true);
});

test('hostile input is never in the yard', () => {
  const bad = [null, undefined, 7, 'yard', [], {}, { x: 0, z: 0 }, { x: 0, z: 0, r: 0 }, { x: 0, z: 0, r: -4 },
    { x: NaN, z: 0, r: 4 }, { x: 0, z: Infinity, r: 4 }, { x: '0', z: 0, r: 4 }, Object.create({ x: 0, z: 0, r: 4 })];
  for (const y of bad) {
    expect(inYard(y, 0, 0)).toBe(false);
    expect(dogNotices(y, { x: 0, z: 0 })).toBe(false);
    expect(dogLanding(y, { x: 0, z: 0 }, () => true)).toBeNull();
  }
  for (const [x, z] of [[NaN, -5], [10, Infinity], ['10', -5], [undefined, undefined], [null, null]]) {
    expect(inYard(YARD, x, z)).toBe(false);
    expect(dogNotices(YARD, { x, z })).toBe(false);
    expect(dogLanding(YARD, { x, z }, () => true)).toBeNull();
  }
  for (const p of [null, undefined, 3, 'cat', {}]) {
    expect(dogNotices(YARD, p)).toBe(false);
    expect(dogLanding(YARD, p, () => true)).toBeNull();
  }
  expect(dogLanding(YARD, { x: 11, z: -5 }, 'yes')).toBeNull();
  expect(dogLanding(YARD, { x: 11, z: -5 }, null)).toBeNull();
});

describe('dogLanding', () => {
  test('on the ray from the centre through the cat, at r + 1.5', () => {
    const p = dogLanding(YARD, { x: 11, z: -5 }, () => true);
    expect(p.x).toBeCloseTo(10 + 4 + DOG_LANDING_OFFSET, 9);
    expect(p.z).toBeCloseTo(-5, 9);
    const q = dogLanding(YARD, { x: 10, z: -3 }, () => true);
    expect(q.x).toBeCloseTo(10, 9);
    expect(q.z).toBeCloseTo(-5 + 5.5, 9);
  });

  test('a cat dead on the centre runs away from the kennel', () => {
    const p = dogLanding(YARD, { x: 10, z: -5 }, () => true);
    const away = { x: 10 - YARD.kennel.x, z: -5 - YARD.kennel.z };
    const dot = (p.x - 10) * away.x + (p.z + 5) * away.z;
    expect(dot).toBeGreaterThan(0);
    expect(Math.hypot(p.x - 10, p.z + 5)).toBeCloseTo(5.5, 9);
  });

  test('further along the ray, then round the circle, when the first choice is not walkable', () => {
    const walls = (x) => x < 15.6 || x > 16.5; // only a strip further out on +x
    const p = dogLanding(YARD, { x: 11, z: -5 }, (x, z) => !walls(x, z));
    expect(p.z).toBeCloseTo(-5, 9);
    expect(p.x).toBeGreaterThan(15.5);
    // nothing on the ray: rotated round
    const q = dogLanding(YARD, { x: 11, z: -5 }, (x, z) => z > -4);
    expect(Math.hypot(q.x - 10, q.z + 5)).toBeCloseTo(5.5, 9);
    expect(q.z).toBeGreaterThan(-4);
  });

  test('never a landing on the lawn, and nothing walkable means no chase', () => {
    expect(dogLanding(YARD, { x: 11, z: -5 }, () => false)).toBeNull();
    // isWalkable must say exactly true
    expect(dogLanding(YARD, { x: 11, z: -5 }, () => 1)).toBeNull();
  });

  test('the landing is outside the yard and walkable, or null — against the real built areas', () => {
    for (const a of AREAS) {
      const y = propsFor(a).dogYard;
      const walk = (x, z) => isWalkableAt(built[a], x, z);
      let landed = 0;
      for (let i = 0; i < 48; i++) {
        for (const f of [0, 0.3, 0.7, 0.95]) {
          const t = (i / 48) * Math.PI * 2;
          const cat = { x: y.x + Math.cos(t) * y.r * f, z: y.z + Math.sin(t) * y.r * f };
          const p = dogLanding(y, cat, walk);
          if (!p) continue;
          landed += 1;
          expect(inYard(y, p.x, p.z), `${a} ${p.x},${p.z}`).toBe(false);
          expect(walk(p.x, p.z), `${a} ${p.x},${p.z}`).toBe(true);
          // and close by: a chase moves the cat a few metres, not across the map
          expect(Math.hypot(p.x - y.x, p.z - y.z)).toBeLessThanOrEqual(y.r + DOG_LANDING_OFFSET + 6 * 0.75 + 1e-9);
        }
      }
      // Every cat on every lawn is chased somewhere.
      expect(landed, a).toBe(48 * 4);
    }
  });
});

describe('each area has exactly one dog', () => {
  test('a dog yard in every outdoor area, none in the den, and no dog critter spawn remains', () => {
    for (const a of AREAS) {
      const y = propsFor(a).dogYard;
      expect(y, a).not.toBeNull();
      expect(built[a].critterSpawns.filter((c) => c.type === 'dog'), a).toEqual([]);
      // the kennel stands on its own lawn
      expect(inYard(y, y.kennel.x, y.kennel.z)).toBe(true);
    }
    expect(propsFor('den').dogYard).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Removing the two shipped critter dogs (neighborhood (22,-24), docks (30,20))
// shifts no walkRng draw. Owner rule: CAT_NAMES never change and no consumer
// of walkRng may shift existing draws, so a co-walk on a room seed must draw
// exactly what it drew before.
//
// startWalk itself needs a renderer and the DOM, so this drives the SAME real
// modules in startWalk's fixed walkRng order (game/walk.js): rollWeather →
// createWeather → the rain puddles' six draws and the bird halving → rollSecrets
// → createSecrets → createCritters (dusk fireflies) → the quest giver (the first
// villager in critters.list) → createQuest → the kitten quest's breed draw →
// createStrayCats → createScent → createGoals. The solo-only gift draws are
// skipped: a room walk never makes them. Each run records every value the
// seeded stream hands out, with the area's spawns as they ship now and with the
// old dog spliced back in where it stood; the two records must be identical.
// ---------------------------------------------------------------------------
describe('removing the critter dogs shifts no walkRng draw', () => {
  // Where each shipped dog stood in its area's critterSpawns.
  const OLD_DOGS = {
    neighborhood: { at: 9, def: { type: 'dog', x: 22, z: -24 } },
    docks: { at: Infinity, def: { type: 'dog', x: 30, z: 20 } },
  };

  function withOldDog(a, spawns) {
    const { at, def } = OLD_DOGS[a];
    const out = spawns.map((c) => ({ ...c }));
    out.splice(Math.min(at, out.length), 0, { ...def });
    return out;
  }

  function recordWalk(a, spawns, seed, { dusk }) {
    const scene = new THREE.Scene();
    const area = { ...BUILD[a](scene), critterSpawns: spawns.map((c) => ({ ...c })) };
    const base = mulberry32(seed);
    const draws = [];
    const walkRng = () => { const v = base(); draws.push(v); return v; };
    const walkPois = area.pois.map((p) => clearSpot(p, area.colliders, area.bounds, area.waters));
    let weather = { condition: 'clear' };
    if (!dusk) {
      weather = createWeather(scene, new THREE.DirectionalLight(), rollWeather(walkRng), walkRng, false);
      if (weather.condition === 'rain') {
        for (let i = 0; i < 3; i++) { walkRng(); walkRng(); }
        let keep = false;
        area.critterSpawns = area.critterSpawns.filter((c) => {
          if (c.type !== 'bird' && c.type !== 'seagull') return true;
          keep = !keep;
          return keep;
        });
      }
    }
    createSecrets(scene, area, rollSecrets(walkRng, { eveningLight: dusk || weather.condition === 'sunset' }), walkRng);
    const critters = createCritters(scene, area.critterSpawns, { spawnFireflies: dusk, rng: walkRng, hides: propsFor(a).hides });
    const giver = critters.list.find((c) => c.type === 'villager');
    let giverAt = null;
    if (giver) {
      giverAt = [giver.def.x, giver.def.z];
      const quest = createQuest(walkRng, walkPois);
      if (quest.type === 'kitten') Math.floor(walkRng() * 3);
    }
    const strays = createStrayCats(scene, area, 22, walkRng, { grudges: [], roomSeed: seed, colonyCats: [], excludeNames: [] });
    createScent(scene, area, walkRng);
    createGoals(walkRng);
    return { draws, giverAt, strays: strays.strays.map((s) => [s.name, s.group.position.x, s.group.position.z]) };
  }

  test.each(['neighborhood', 'docks'])('%s: the full walkRng draw sequence is identical with and without the old dog', (a) => {
    const now = built[a].critterSpawns;
    expect(now.some((c) => c.type === 'dog')).toBe(false);
    const before = withOldDog(a, now);
    expect(before.filter((c) => c.type === 'dog')).toHaveLength(1);
    const weathers = new Set();
    // a spread of seeds, plus the first seed that rolls each weather
    const firstSeed = (w) => { let n = 1; while (rollWeather(mulberry32(n)) !== w) n += 1; return n; };
    const seeds = [1, 7, 42, 1234, 99991, 2026, 31337, 0xdecaf, ...['clear', 'rain', 'sunset'].map(firstSeed)];
    for (const seed of seeds) {
      for (const dusk of [false, true]) {
        const was = recordWalk(a, before, seed, { dusk });
        const is = recordWalk(a, now, seed, { dusk });
        expect(is.draws.length).toBeGreaterThan(0);
        expect(is.draws).toEqual(was.draws);
        expect(is.giverAt).toEqual(was.giverAt);
        expect(is.strays).toEqual(was.strays);
        if (!dusk) weathers.add(rollWeather(mulberry32(seed)));
      }
    }
    // every weather branch was walked, the rain puddles and bird halving included
    expect([...weathers].sort()).toEqual(['clear', 'rain', 'sunset']);
  });

  test('nothing outside the area files and the walk reads critterSpawns, and the walk only filters birds and hands it to createCritters', () => {
    const files = [];
    const walkDir = (d) => {
      for (const e of readdirSync(new URL(`../src/${d}`, import.meta.url), { withFileTypes: true })) {
        const rel = d ? `${d}/${e.name}` : e.name;
        if (e.isDirectory()) walkDir(rel);
        else if (rel.endsWith('.js')) files.push(rel);
      }
    };
    walkDir('');
    const readers = files.filter((f) => !f.startsWith('world/')
      && readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').includes('critterSpawns'));
    expect(readers).toEqual(['game/walk.js']);
    const walk = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8')
      .split('\n').filter((l) => l.includes('critterSpawns') && !l.trim().startsWith('//'));
    expect(walk).toEqual([
      '        areaData.critterSpawns = areaData.critterSpawns.filter((c) => {',
      '    const critters = createCritters(scene, areaData.critterSpawns, {',
    ]);
  });
});
