import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { mulberry32 } from '../src/rng.js';
import { rollWeather } from '../src/weather.js';
import { houseOn, setHouse, resumableHouseIds, housePrefetch } from '../src/houseflag.js';
import { setRoofs, resumableAreaIds } from '../src/roofsflag.js';
import { isIndoor } from '../src/indoor.js';
import { createAreaLoader } from '../src/game/areaload.js';
import { readResume, writeResume, snapshotWalk, pickUpWalk, resumeWelcome, RESUME_KEY } from '../src/game/walkresume.js';
import { createProgression, CATALOG } from '../src/progression.js';
import { createAudio } from '../src/audio.js';
import { MAX_ZOOM_STEP, DEN_MAX_ZOOM_STEP } from '../src/camzoom.js';
import { cameraOffset } from '../src/catcam.js';
import { words } from '../src/wordset.js';
import { roomAt, HOUSE_LEDGES, secretColliders } from '../src/world/houseplan.js';
import { makeView, blockers } from '../src/housewalls.js';
import { CAT_LOOK_Y } from '../src/cat/model.js';
import { behindYaw } from '../src/traversal.js';
import { lifecycle, fakeEl, memStorage, controlledLoader } from './helpers/walklife.js';
import { areaInEdition } from '../src/edition.js';
import { placeState, opensAfterLine } from '../src/territories.js';
import { placeWhyLine } from '../src/ui/dressingroom.js';
import { withOffWords } from './helpers/offwords.js';
import { HOUSE_FINDS, HOUSE_GOAL_TYPES, HOUSE_GOLD_MICE, HOUSE_KNOCKABLES, HOUSE_HIDES, HOUSE_MICE, HOUSE_YARN_SPOTS } from '../src/world/housethings.js';
import { createGoals, goalFits, GOAL_POOL } from '../src/goals.js';
import { GOLD_MICE, goldForEdition } from '../src/goldmice.js';
import { propsFor, yarnSpotFor } from '../src/propsets.js';
import { buildMapLayer } from '../src/ui/minimap.js';
import { createKnockables } from '../src/knockables.js';
import { AWARDS, createDiscoveryLog } from '../src/discoveries.js';
import { isWalkableAt } from '../src/player.js';
import { discoveryText } from '../src/ui/hud.js';
import { gatewayNear } from '../src/gateways.js';
import { gateStatus, gatePrompt } from '../src/gatecross.js';
import { NO_GATES } from '../src/world/gateway.js';
import { phrase } from '../src/clanphrases.js';
import { placeName } from '../src/edition.js';
import { lower } from '../src/territories.js';

// =============================================================================
// The Old House in the game (Old House step 1, Task 8; rulings H7, U9-U12).
// walk.js's createWalkLifecycle is booted headless (test/helpers/walklife.js,
// as test/roofswalk.test.js does) and real walks are started and ended: in the
// house, and in the den and the Park beside it for the difference. What each
// walk system was handed is recorded where walk.js hands it: the lifecycle's
// own dependencies (the sound, the cloud, the lighting) are recorders, and
// the modules walk.js imports below are the real ones wrapped to note their
// calls.
//
// The house's drawing is its own download (the `house` pack in
// world/areas.js): the first describe runs before anything here has loaded it,
// and counts each time world/house.js is evaluated. A download that fails is
// test/houseload.test.js.
// =============================================================================

const seen = vi.hoisted(() => ({
  houseLoads: 0, secrets: 0, skyLife: 0, goals: 0, legends: [], wanderers: [], strayCounts: [], zoom: [], savedZoom: null, hides: [], extraKnock: null,
}));
vi.mock('../src/world/house.js', async (importOriginal) => {
  seen.houseLoads++;
  // The house grows no hooked grass (the real module exports no GRASS_HOOKS); a mock refuses to answer for a name it lacks.
  const m = await importOriginal();
  // A test may add one knock-over of its own to the record (seen.extraKnock): every house
  // knock-over stands on the ground floor at world height 0, so one upstairs shows the ground is read.
  const build = (...a) => {
    const r = m.build(...a);
    if (seen.extraKnock) r.knockables = [...r.knockables, seen.extraKnock];
    return r;
  };
  return { ...m, build, GRASS_HOOKS: undefined };
});
vi.mock('../src/secrets.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, rollSecrets: (...a) => { seen.secrets++; return m.rollSecrets(...a); } };
});
vi.mock('../src/skylife.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, createSkyLife: (...a) => { seen.skyLife++; return m.createSkyLife(...a); } };
});
vi.mock('../src/goals.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, createGoals: (...a) => { seen.goals++; return m.createGoals(...a); } };
});
vi.mock('../src/legendary.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, legendaryFor: (state, areaId, ...rest) => { seen.legends.push(areaId); return m.legendaryFor(state, areaId, ...rest); } };
});
// How many ordinary strays each walk asked for (before the cast finds them spots).
vi.mock('../src/straycats.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, createStrayCats: (scene, area, count, ...rest) => { seen.strayCounts.push(count); return m.createStrayCats(scene, area, count, ...rest); } };
});
// The cover each walk handed its critters (a chased mouse runs to the nearest).
vi.mock('../src/critters.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, createCritters: (scene, spawns, opts = {}, ...rest) => { seen.hides.push(opts.hides); return m.createCritters(scene, spawns, opts, ...rest); } };
});
// Every walk's day has a wanderer, so a walk that let one in would show it.
vi.mock('../src/housecats.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, walkWanderer: (state, areaId, o) => { seen.wanderers.push(areaId); return o?.isDen ? null : 'Biscuit'; } };
});
// The device's saved view step (settings.cameraZoom; the lifecycle's settings
// have none) is seen.savedZoom while it is set; what the walk keeps is noted.
vi.mock('../src/camzoom.js', async (importOriginal) => {
  const m = await importOriginal();
  return {
    ...m,
    clampZoomStep: (step, max) => {
      const got = m.clampZoomStep(seen.savedZoom ?? step, max);
      seen.zoom.push(got);
      return got;
    },
  };
});

// The first seed whose walk rolls rain (the weather is the first draw off a
// walk's stream), and the Math.random draw that makes it a solo walk's seed.
const RAIN = (() => { for (let seed = 1; ; seed++) if (rollWeather(mulberry32(seed)) === 'rain') return seed; })();
let stream = null;
let queued = [];
const nextWalkSeed = (seed) => queued.push((seed + 0.5) / 2 ** 31);

function reset(life) {
  seen.secrets = 0;
  seen.skyLife = 0;
  seen.goals = 0;
  seen.legends.length = 0;
  seen.wanderers.length = 0;
  seen.strayCounts.length = 0;
  seen.zoom.length = 0;
  seen.hides.length = 0;
  for (const k of ['lighting', 'sound', 'music', 'toasts']) life.rec[k].length = 0;
  life.rec.friendFetches = 0;
}

// One walk on the rain seed, started (by `start`, which must start it in this
// tick) and ended; what it was handed and what it built.
function walk(life, start, { keep = null } = {}) {
  reset(life);
  nextWalkSeed(RAIN);
  start(life.w);
  const s = life.getSession();
  expect(s).not.toBe(null);
  expect(s.soloSeed).toBe(RAIN);
  const out = {
    areaId: s.areaId,
    weather: s.weather.condition,
    rain: !!s.scene.getObjectByName('rain-drops'),
    secretsRolled: seen.secrets,
    strays: s.strayCats.strays.map((c) => c.name),
    straysAsked: [...seen.strayCounts],
    wanderAsked: [...seen.wanderers],
    arrivalLine: s.arrivalLine,
    legendAsked: [...seen.legends],
    ghostsAsked: life.rec.friendFetches,
    goals: s.goals,
    goalsRolled: seen.goals,
    skyLife: seen.skyLife,
    minimap: s.minimap,
    hides: [...seen.hides],
    zoom: [...seen.zoom],
    sound: life.rec.sound.map(({ areaId, dusk, rain }) => ({ areaId, dusk, rain })),
    grass: !!s.scene.getObjectByName('grass'),
    pools: !!s.scene.getObjectByName('lampPools'),
    fireflies: s.critters.list.filter((c) => c.type === 'firefly').length,
    name: s.areaData.name,
    welcome: s.welcome,
  };
  if (keep) keep(s);
  const before = { ...life.progression.state.walks };
  life.w.endWalk();
  expect(life.getSession()).toBe(null);
  out.walksAdded = Object.fromEntries(Object.keys(life.progression.state.walks)
    .filter((k) => life.progression.state.walks[k] !== before[k])
    .map((k) => [k, life.progression.state.walks[k] - (before[k] ?? 0)]));
  return out;
}

const areas = createAreaLoader();
beforeAll(() => areas.ensureAll(['park', 'neighborhood', 'den']));
const lifecycleHere = (o = {}) => lifecycle({ areas, ...o });
const explore = (life) => walk(life, (w) => w.beginWalkFromHomebase({ duskMode: false }));
const houseWalk = (life, duskMode = false, o) => walk(life, (w) => w.startWalk({ duskMode, areaOverride: 'house' }), o);
const denWalk = (life) => walk(life, (w) => w.startWalk({ areaOverride: 'den' }));
const parkWalk = (life, duskMode = false) => walk(life, (w) => w.startWalk({ duskMode, areaOverride: 'park' }));

beforeEach(() => {
  globalThis.document = { body: fakeEl(), createElement: fakeEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-21T15:00:00Z') });
  stream = mulberry32(20261121);
  queued = [];
  vi.spyOn(Math, 'random').mockImplementation(() => (queued.length ? queued.shift() : stream()));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  delete globalThis.document;
  setHouse(null);
  setRoofs(null);
  seen.savedZoom = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the switch', () => {
  it('is off by default, and a test can force it either way', () => {
    expect(houseOn()).toBe(false);
    setHouse(true);
    expect(houseOn()).toBe(true);
    setHouse(false);
    expect(houseOn()).toBe(false);
    setHouse(null);
    expect(houseOn()).toBe(false);
  });

  // Old House step 4 (docs/superpowers/plans/2026-11-21-old-house-step4-into-the-game.md,
  // W1, W2; the owner's change: after 2 Market Square walks, not 2 town walks).
  it('the catalog has the house, after the Market, in Clan Edition only', () => {
    expect(CATALOG.areas.house).toEqual({ name: 'The Old House', price: 150, requires: { area: 'market', walks: 2 }, edition: 'canon' });
    const ids = Object.keys(CATALOG.areas);
    expect(ids[ids.indexOf('market') + 1]).toBe('house');
    expect(areaInEdition(CATALOG.areas.house, 'legacy')).toBe(false);
    expect(areaInEdition(CATALOG.areas.house, 'canon')).toBe(true);
  });

  it('indoors is the den and the house, and nowhere else', () => {
    expect(isIndoor('den')).toBe(true);
    expect(isIndoor('house')).toBe(true);
    for (const id of ['park', 'neighborhood', 'roofs', 'fair', undefined, null]) expect(isIndoor(id)).toBe(false);
  });
});

describe('the house\'s drawing is its own download', () => {
  it('without the switch nothing fetches it: Explore walks her own place', () => {
    setHouse(false);
    expect(explore(lifecycleHere()).areaId).toBe('neighborhood');
    expect(parkWalk(lifecycleHere()).areaId).toBe('park');
    expect(seen.houseLoads).toBe(0);
    expect(areas.loaded('house')).toBe(null);
  }, 90_000);

  it('with the switch, Explore before it has come waits for it, then walks the house', async () => {
    setHouse(true);
    const life = lifecycleHere();
    const started = life.w.beginWalkFromHomebase({ duskMode: false });
    expect(life.getSession()).toBe(null); // home stays up while it comes
    expect(await started).toBe('started');
    expect(life.getSession().areaId).toBe('house');
    expect(seen.houseLoads).toBe(1);
    life.w.endWalk();
    // once it has come, Explore starts straight away, with no second fetch
    expect(explore(lifecycleHere()).areaId).toBe('house');
    expect(seen.houseLoads).toBe(1);
  }, 90_000);
});

describe('Explore with ?house=1', () => {
  beforeAll(() => areas.ensure('house'));

  it('starts a solo house walk in Clan Edition', () => {
    setHouse(true);
    const r = explore(lifecycleHere());
    expect(r.areaId).toBe('house');
    expect(r.name).toBe(words().PLACE_WORDS.house);
  }, 90_000);

  it('Legacy Edition does not get it: Explore walks her own place', () => {
    setHouse(true);
    const life = lifecycleHere();
    life.progression.setEdition('legacy');
    expect(explore(life).areaId).toBe('neighborhood');
  }, 90_000);

  it('never in a room: in a room, Explore starts the room\'s walk in her own place', () => {
    setHouse(true);
    const life = lifecycleHere();
    life.setPendingRoom({ code: 'ABCD' });
    life.w.beginWalkFromHomebase({ duskMode: false });
    expect(life.getSession()).toBe(null);
    expect(life.rec.roomStarts).toEqual([{ area: 'neighborhood', dusk: false }]);
  });

  it('with the Rooftops switch on too, the Rooftops wins', async () => {
    setHouse(true);
    setRoofs(true);
    const life = lifecycleHere();
    expect(await life.w.beginWalkFromHomebase({ duskMode: false })).toBe('started');
    expect(life.getSession().areaId).toBe('roofs');
    life.w.endWalk();
  }, 90_000);

  it('without the flag, Explore walks her own place', () => {
    setHouse(false);
    expect(explore(lifecycleHere()).areaId).toBe('neighborhood');
  }, 90_000);
});

describe('a walk in the house', () => {
  beforeAll(() => areas.ensure('house'));

  it('counts as a house walk', () => {
    const life = lifecycleHere();
    expect(life.progression.state.walks.house).toBe(0);
    expect(houseWalk(life).walksAdded).toEqual({ house: 1 });
    expect(life.progression.state.walks.house).toBe(1);
  }, 90_000);

  it('has no weather: a walk whose seed rolls rain is dry, and sounds dry', () => {
    const r = houseWalk(lifecycleHere());
    expect([r.weather, r.rain]).toEqual(['clear', false]);
    expect(r.sound).toEqual([{ areaId: 'house', dusk: false, rain: false }]);
    // the same seed on the Park rains, so the seed is a rainy one
    const park = parkWalk(lifecycleHere());
    expect([park.weather, park.rain]).toEqual(['rain', true]);
  }, 90_000);

  it('has no secrets, no strays, no wanderer, no legend and no ghosts, on a day that has them', () => {
    const r = houseWalk(lifecycleHere());
    expect(r.secretsRolled).toBe(0);
    expect(r.strays).toEqual([]);
    expect(r.straysAsked).toEqual([0]);
    expect(r.wanderAsked).toEqual([]);
    expect(r.arrivalLine).toBe(null);
    expect(r.legendAsked).toEqual([]);
    expect(r.ghostsAsked).toBe(0);
    // the Park on the same day rolls its secrets, has its strays, asks for its
    // visitors and for friends to visit
    const park = parkWalk(lifecycleHere());
    expect(park.secretsRolled).toBe(1);
    expect(park.strays.length).toBeGreaterThan(0);
    expect(park.straysAsked[0]).toBeGreaterThan(0);
    expect(park.wanderAsked).toEqual(['park']);
    expect(park.legendAsked).toEqual(['park']);
    expect(park.ghostsAsked).toBe(1);
  }, 90_000);

  it('hands the player the house\'s camera ground, the floors without the furniture tops; other places none', () => {
    // a player that notes every camera ground the walk hands it (and does nothing else)
    const calls = [];
    const player = new Proxy({ setCameraGround: (g) => calls.push(g) }, {
      get: (t, k) => (k in t ? t[k] : () => undefined),
      set: (t, k, v) => { t[k] = v; return true; },
    });
    let record = null;
    houseWalk(lifecycleHere({ player }), false, { keep: (s) => { record = s.areaData; } });
    expect(calls.length).toBe(1);
    expect(calls[0]).toBe(record.cameraGround);
    expect(calls[0]).toBe(record.house.floor);
    calls.length = 0;
    parkWalk(lifecycleHere({ player }));
    expect(calls).toEqual([undefined]);
  }, 90_000);

  // Old House step 2 (D11, D12, D18): the house has daily goals and the corner map, like every other place.
  it('has daily goals it can finish, the corner map, and no sky birds', () => {
    let record = null;
    const r = houseWalk(lifecycleHere(), false, { keep: (s) => { record = s.areaData; } });
    expect(r.goalsRolled).toBe(1);
    expect(r.goals.goals).toHaveLength(3);
    for (const g of r.goals.goals) expect(HOUSE_GOAL_TYPES).toContain(g.type);
    expect(r.minimap).not.toBe(null);
    expect(r.skyLife).toBe(0);
    // whatever the day rolls, only what the house can finish: three of the four, every time
    expect(GOAL_POOL.filter((g) => goalFits(g, record)).map((g) => g.type)).toEqual([...HOUSE_GOAL_TYPES]);
    for (let seed = 1; seed <= 40; seed++) {
      const types = createGoals(mulberry32(seed), record).goals.map((g) => g.type);
      expect(new Set(types).size, `seed ${seed}`).toBe(3);
      for (const t of types) expect(HOUSE_GOAL_TYPES, `seed ${seed}`).toContain(t);
    }
    // the Park beside it as ever
    const park = parkWalk(lifecycleHere());
    expect(park.goals).not.toBe(null);
    expect([park.goalsRolled, park.skyLife]).toEqual([1, 1]);
    expect(park.minimap).not.toBe(null);
  }, 90_000);

  it('lays out its golden mice, knock-overs, mice, their cover and the yarn ball from its own record', () => {
    const life = lifecycleHere();
    expect(life.progression.recordGolden('gm-house-2')).toBe(true); // found on an earlier walk
    let got = null;
    const r = houseWalk(life, false, {
      keep: (s) => {
        got = {
          gold: s.goldMice.list.map((m) => m.id),
          knock: s.knockables.list.map((k) => k.id),
          mice: s.critters.list.map((c) => c.type),
          spot: s.toy.spot,
          record: s.areaData,
        };
      },
    });
    expect(got.gold).toEqual(['gm-house-1', 'gm-house-3']);
    expect(got.knock).toEqual(HOUSE_KNOCKABLES.map((k) => k.id));
    expect(got.mice).toEqual(HOUSE_MICE.map(() => 'mouse'));
    expect(r.hides).toEqual([got.record.hides]);
    expect(got.record.hides).toBe(HOUSE_HIDES);
    // the yarn ball lies at one of the house's own two spots, today's by the day's hash
    const today = yarnSpotFor('house', '2026-11-21', got.record.yarnSpots);
    expect(HOUSE_YARN_SPOTS.some((p) => p.x === got.spot.x && p.z === got.spot.z)).toBe(true);
    expect(got.spot).toEqual({ x: today.x, z: today.z });
  }, 90_000);

  it('a knock-over stands on the ground under it: one by the bed upstairs is 2.4 m up', () => {
    // the bed's perch (0.6 m) is upstairs; a cup on it, falling onto the bedroom floor
    seen.extraKnock = { id: 'house-cup-9', kind: 'cup', x: 0.3, z: -11.6, y: 0.6, fallTo: { x: 0.3, z: -10.6 } };
    try {
      expect(roomAt(seen.extraKnock.x, seen.extraKnock.z)).toBe('bedroom');
      // a knock-over's own lift over its ledge, from one on flat ground
      const flat = createKnockables(new THREE.Scene(), [seen.extraKnock]);
      const lift = flat.list[0].group.position.y - seen.extraKnock.y;
      flat.dispose();
      let ys = null;
      houseWalk(lifecycleHere(), false, {
        keep: (s) => {
          ys = s.knockables.list.map((e) => {
            const k = s.areaData.knockables.find((q) => q.id === e.id);
            return { id: e.id, got: e.group.position.y, want: s.ground.y(k.x, k.z) + k.y + lift, floor: s.ground.y(k.x, k.z) };
          });
        },
      });
      expect(ys.map((e) => e.id)).toEqual([...HOUSE_KNOCKABLES.map((k) => k.id), 'house-cup-9']);
      expect(ys.at(-1).floor).toBeCloseTo(2.4, 6);
      for (const e of ys) expect(e.got, e.id).toBeCloseTo(e.want, 6);
    } finally {
      seen.extraKnock = null;
    }
  }, 90_000);

  it('the yarn goal\'s how-line says where the house\'s ball lies', () => {
    // walks of the house on one seed after another, until the day rolls the yarn goal
    let found = null;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const life = lifecycleHere();
      reset(life);
      queued.push((seed + 0.5) / 2 ** 31);
      life.w.startWalk({ areaOverride: 'house' });
      const s = life.getSession();
      const yarn = s.goals.goals.find((g) => g.id === 'yarn-play');
      if (yarn) found = { yarn, where: s.areaData.yarnSpots.find((p) => p.x === s.toy.spot.x && p.z === s.toy.spot.z).where };
      life.w.endWalk();
    }
    expect(found).not.toBe(null);
    expect(found.yarn.howSlots).toEqual({ place: found.where });
    expect(HOUSE_YARN_SPOTS.length).toBe(2);
  }, 90_000);

  it('a golden mouse found in the house is saved and counts: Clan Edition reads 45, Legacy as before', () => {
    const life = lifecycleHere();
    houseWalk(life, false, {
      keep: (s) => {
        expect(s.goldMice.list.map((q) => q.id)).toEqual(GOLD_MICE.house.map((q) => q.id)); // laid from GOLD_MICE
        // the walk's own golden mice find the cellar one at her paws
        const m = HOUSE_GOLD_MICE.find((q) => q.id === 'gm-house-3');
        const pawsY = s.ground.y(m.x, m.z);
        expect(s.goldMice.checkFind({ x: m.x, y: pawsY, z: m.z }, pawsY)?.id).toBe('gm-house-3');
      },
    });
    expect(life.progression.recordGolden('gm-house-1')).toBe(true);
    expect(life.progression.recordGolden('gm-house-1')).toBe(false); // once
    expect(life.progression.state.golden).toContain('gm-house-1');
    expect(goldForEdition('canon', CATALOG).size).toBe(45);
    expect(goldForEdition('legacy', CATALOG).size).toBe(21); // the house is Clan-only: Legacy's count is unmoved
    expect(Object.hasOwn(GOLD_MICE, 'house')).toBe(true);
  }, 90_000);

  it('draws the corner map as the house\'s floor plan on the lawn', () => {
    houseWalk(lifecycleHere(), false, {
      keep: (s) => {
        const layer = buildMapLayer(s.areaData, s.scene);
        expect(layer.ground).toBe('#6f9a52');
        const ledges = layer.rock.filter((q) => q.tone === 'ledge');
        expect(ledges.length).toBeGreaterThan(0);
        expect(layer.rock.some((q) => q.tone === 'rock')).toBe(true);
        // the cat's marker (the map's middle) sits in the hall at the spawn
        const { x, z } = s.cat.position;
        expect(roomAt(x, z)).toBe('hall');
        expect(ledges.some((q) => x > q.minX && x < q.maxX && z > q.minZ && z < q.maxZ)).toBe(true);
      },
    });
  }, 90_000);

  it('every other place is as it was: the den has no goals or map; the park rolls the same goals, mice, knock-overs and yarn spot', () => {
    const records = {};
    const den = walk(lifecycleHere(), (w) => w.startWalk({ areaOverride: 'den' }), { keep: (s) => { records.den = s.areaData; } });
    expect([den.goals, den.goalsRolled, den.minimap]).toEqual([null, 0, null]);
    walk(lifecycleHere(), (w) => w.startWalk({ areaOverride: 'neighborhood' }), { keep: (s) => { records.neighborhood = s.areaData; } });
    const houseKeys = ['goldMice', 'knockables', 'hides', 'yarnSpots', 'goalTypes', 'mapGround'];
    let got = null;
    const park = walk(lifecycleHere(), (w) => w.startWalk({ areaOverride: 'park' }), {
      keep: (s) => {
        got = {
          record: s.areaData,
          gold: s.goldMice.list.map((m) => m.id),
          knock: s.knockables.list.map((k) => k.id),
          spot: s.toy.spot,
          goals: s.goals.goals.map((g) => g.id),
        };
      },
    });
    records.park = got.record;
    for (const k of houseKeys) expect(Object.hasOwn(got.record, k), k).toBe(false);
    // the park's three goals on this seed, as before the house's list existed
    expect(got.goals).toEqual(['tip-things', 'spot-critters', 'get-scratches']);
    expect(got.gold).toEqual(GOLD_MICE.park.map((m) => m.id));
    expect(got.knock).toEqual(propsFor('park').knockables.map((k) => k.id));
    expect(park.hides).toEqual([propsFor('park').hides]);
    const spot = yarnSpotFor('park', '2026-11-21');
    expect(got.spot).toEqual({ x: spot.x, z: spot.z });
    expect(buildMapLayer(got.record, new THREE.Scene()).ground).toBe('#' + (got.record.groundBounce ?? 0x6cb058).toString(16).padStart(6, '0'));
    // goalFits for every place already built answers as it did with no list: tippables, boxes, a villager
    const before = (g, a) => (g.type === 'mischief' ? (a.tippables?.length ?? 0) >= g.target
      : g.type === 'sits' ? (a.boxes?.length ?? 0) >= g.target
        : g.type === 'pet' ? (a.critterSpawns ?? []).some((c) => c.type === 'villager') : true);
    for (const id of ['park', 'neighborhood', 'den']) {
      const a = records[id];
      expect(a, id).toBeTruthy();
      for (const k of houseKeys) expect(Object.hasOwn(a, k), `${id} ${k}`).toBe(false);
      for (const g of GOAL_POOL) expect(goalFits(g, a), `${id} ${g.id}`).toBe(before(g, a));
    }
  }, 90_000);

  it('a house find\'s toast is its own line', () => {
    expect(AWARDS.housefind).toBe(12);
    expect(discoveryText({ type: 'housefind', label: 'The old clock bongs 3 times! 🕰️' })).toBe('The old clock bongs 3 times! 🕰️');
    expect(discoveryText({ type: 'housefind', label: 'x', repeat: true })).toBe('x');
  });

  it('keeps every view step: a device on step 3 stays on it in the house, and the den still caps it', () => {
    seen.savedZoom = 3;
    expect(houseWalk(lifecycleHere()).zoom).toEqual([MAX_ZOOM_STEP]);
    expect(MAX_ZOOM_STEP).toBe(3);
    expect(denWalk(lifecycleHere()).zoom).toEqual([DEN_MAX_ZOOM_STEP]);
    expect(DEN_MAX_ZOOM_STEP).toBeLessThan(3);
  }, 90_000);

  it('grows no grass in a room (the Park\'s lawn grows it on the same device)', () => {
    expect(houseWalk(lifecycleHere()).grass).toBe(false);
    expect(parkWalk(lifecycleHere()).grass).toBe(true);
  }, 90_000);

  it('at dusk the lamps pool their light, no fireflies come in, and it still sounds like the den', () => {
    // the pools the walk lays keep their light in the house's rooms (owner's fix A)
    let outside = null;
    const r = houseWalk(lifecycleHere({ collar: true }), true, {
      keep: (s) => {
        const pos = s.scene.getObjectByName('lampPools').geometry.getAttribute('position');
        outside = [];
        for (let i = 0; i < pos.count; i++) {
          const [x, z] = [pos.getX(i), pos.getZ(i)];
          if (!roomAt(x, z)) outside.push(`${x.toFixed(2)}, ${z.toFixed(2)}`);
        }
      },
    });
    expect(outside).toEqual([]);
    expect(r.pools).toBe(true);
    expect(r.fireflies).toBe(0);
    // a Park dusk walk in the collar has its fireflies
    expect(parkWalk(lifecycleHere({ collar: true }), true).fireflies).toBeGreaterThan(0);
    expect(r.sound).toEqual([{ areaId: 'house', dusk: true, rain: false }]);
    expect(r.walksAdded).toEqual({ house: 1 });
  }, 90_000);

  // Her kitten, home with her (kitten stage 2), wanders a circle of 3 m round
  // the area's kitten spot: in the house that is the hall's middle, not the
  // spawn by the front door, whose circle would take her through the shut
  // door and the hall lamp.
  it('Mochi wanders the hall: never through a wall, the front door, the lamp or the furniture', () => {
    const life = lifecycleHere();
    life.progression.setKittenStage(2);
    houseWalk(life, false, {
      keep: (s) => {
        const k = s.kittenEnc.group;
        expect(k).toBeTruthy();
        const solid = s.areaData.colliders;
        let worst = Infinity;
        for (let i = 0; i < 300; i++) { // 30 s: a full turn (2 pi / 0.25 rad/s is 25 s)
          s.kittenEnc.update(0.1);
          const { x, z } = k.position;
          expect(roomAt(x, z), `${x.toFixed(2)}, ${z.toFixed(2)}`).toBe('hall');
          for (const c of solid) worst = Math.min(worst, Math.hypot(x - c.x, z - c.z) - c.r);
        }
        expect(worst).toBeGreaterThan(0.3); // a kitten's half length, and a little
      },
    });
  }, 90_000);

  it('runs the house life: the walls between the camera and her sink, the ones ahead stand', () => {
    houseWalk(lifecycleHere(), false, {
      keep: (s) => {
        const { sections } = s.areaData.house;
        const mesh = (id) => s.scene.getObjectByName(`houseWall:${id}`);
        const cat = s.cat.position;
        const camera = new THREE.PerspectiveCamera();
        // behind her at the spawn (she faces -z), at the default step
        camera.position.copy(cat).add(cameraOffset(0, 0.18, 4.5, 2.2));
        const south = sections.filter((x) => x.id.startsWith('hall-s-') && x.kind === 'wall'
          && Math.min(x.x0, x.x1) <= cat.x && Math.max(x.x0, x.x1) >= cat.x);
        const north = sections.filter((x) => x.id.startsWith('hall-n-'));
        expect(south.length).toBeGreaterThan(0);
        expect(north.length).toBeGreaterThan(0);
        for (let i = 0; i < 20; i++) s.areaLife.update(1 / 30, i / 30, cat, camera);
        for (const x of south) expect(mesh(x.id).scale.y, x.id).toBeLessThan(0.5);
        for (const x of north) expect(mesh(x.id).scale.y, x.id).toBe(1);
      },
    });
  }, 90_000);

  // Final fix F1: the Ready card shows the walk before any engaged frame, and
  // main.js runs no area life behind it, so the start itself must leave the
  // view clear. These walks ease their walls (the lifecycle's device has no
  // reduced motion), so nothing here is a snap hiding the fault.
  it('opens on her, not the front wall: before any frame, nothing stands between the camera and her', () => {
    const life = lifecycleHere();
    houseWalk(life, false, {
      keep: (s) => {
        expect(s.reducedMotion).toBeFalsy();
        const { sections } = s.areaData.house;
        const mesh = (id) => s.scene.getObjectByName(`houseWall:${id}`);
        const cat = s.cat.position;
        // the start camera hangs outside the hall's south wall
        expect(life.camera.position.z).toBeGreaterThan(12);
        const view = makeView(cat, life.camera.position, CAT_LOOK_Y);
        expect(blockers(sections, s.areaLife.sink, view)).toEqual([]);
        // and the meshes show what the sink says: the south wall down, the north wall up
        const south = sections.filter((x) => x.id.startsWith('hall-s-') && x.kind === 'wall'
          && Math.min(x.x0, x.x1) <= cat.x && Math.max(x.x0, x.x1) >= cat.x);
        expect(south.length).toBeGreaterThan(0);
        for (const x of south) expect(mesh(x.id).scale.y, x.id).toBeLessThan(0.5);
        for (const x of sections.filter((q) => q.id.startsWith('hall-n-'))) expect(mesh(x.id).scale.y, x.id).toBe(1);
        for (const x of sections) if (mesh(x.id)) expect(mesh(x.id).scale.y, x.id).toBe(s.areaLife.sink.fraction(x.id));
        expect(s.areaLife.drawing.current).toBe('ground');
      },
    });
  }, 90_000);
});

describe('a house walk left in the middle', () => {
  beforeAll(() => areas.ensure('house'));
  const ids = (state = createProgression(memStorage()).state) => resumableHouseIds(resumableAreaIds(state.walks), state);

  it('a house walk note resumes in Clan Edition, with the switch or without; Legacy drops it; every other place\'s is kept either way', () => {
    const clanState = createProgression(memStorage()).state;
    const legacyState = { ...clanState, edition: 'legacy' };
    for (const on of [false, true]) {
      setHouse(on);
      expect(resumableHouseIds(['park', 'house'], clanState), String(on)).toEqual(['park', 'house']);
      expect(resumableHouseIds(['park', 'house'], legacyState), String(on)).toEqual(['park']);
    }
    setHouse(null);
    const now = Date.UTC(2026, 10, 21, 12);
    const note = { v: 1, at: now - 60_000, tries: 0, areaId: 'house', seed: 7, stamp: 'walk-1', x: 0, z: 9.5, yaw: 0, startPoints: 0 };
    const read = (on, state, areaId = 'house') => {
      const storage = memStorage();
      storage.setItem(RESUME_KEY, JSON.stringify({ ...note, areaId }));
      setHouse(on);
      try {
        return { got: readResume(storage, { now, areaIds: ids(state) }), left: storage.getItem(RESUME_KEY) };
      } finally { setHouse(null); }
    };
    for (const on of [false, true]) {
      expect(read(on, clanState).got?.kind, String(on)).toBe('resume');
      expect(read(on, clanState).got?.data.areaId).toBe('house');
      expect(read(on, legacyState)).toEqual({ got: null, left: null }); // dropped, and the note cleared
      for (const state of [clanState, legacyState]) expect(read(on, state, 'park').got?.kind).toBe('resume');
    }
    // the list is otherwise the walks' own, in order
    for (const on of [false, true]) {
      setHouse(on);
      expect(ids(clanState)).toEqual(resumableAreaIds(clanState.walks));
      expect(ids(legacyState)).toEqual(resumableAreaIds(clanState.walks).filter((id) => id !== 'house'));
    }
  });

  it('picked up again with the switch on: the same house, and the Ready card names it', async () => {
    const life = lifecycleHere();
    let snap = null;
    houseWalk(life, false, { keep: (s) => { snap = snapshotWalk(s, { yaw: 0, now: Date.now() }); } });
    expect(snap?.areaId).toBe('house');
    const storage = memStorage();
    writeResume(storage, snap);
    setHouse(true);
    const left = readResume(storage, { now: Date.now(), areaIds: ids() });
    expect(left?.kind).toBe('resume');
    const again = lifecycleHere();
    const got = await pickUpWalk({
      storage, data: left.data, startWalkWhenReady: again.w.startWalkWhenReady, progression: again.progression,
      getSession: again.getSession, reload: () => {},
    });
    expect(got).toBe('started');
    const s = again.getSession();
    expect(s.areaId).toBe('house');
    expect(s.soloSeed).toBe(snap.seed);
    // the HUD's and the card's name: no catalog row, so the house's own (PLACE_WORDS)
    expect(s.welcome).toBe(resumeWelcome(words().PLACE_WORDS.house));
    again.w.endWalk();
  }, 90_000);

  // Final fix F1: a walk picked up in the attic opens on its "Welcome back!"
  // card, paused, with no area life running: the attic must already be drawn
  // in full, and the camera behind her there with nothing in the way.
  it('picked up in the attic: the card shows the attic in full and her, with no wall between', async () => {
    const life = lifecycleHere();
    let snap = null;
    houseWalk(life, false, { keep: (s) => { snap = snapshotWalk(s, { yaw: 0, now: Date.now() }); } });
    const yaw = behindYaw(-1, 0); // looking west down the attic, as its shot does
    snap = { ...snap, x: -19, z: -10, yaw };
    const storage = memStorage();
    writeResume(storage, snap);
    setHouse(true);
    const left = readResume(storage, { now: Date.now(), areaIds: ids() });
    const again = lifecycleHere();
    expect(await pickUpWalk({
      storage, data: left.data, startWalkWhenReady: again.w.startWalkWhenReady, progression: again.progression,
      getSession: again.getSession, reload: () => {},
    })).toBe('started');
    const s = again.getSession();
    expect(s.resumed).toBe(true);
    expect(s.reducedMotion).toBeFalsy();
    const cat = s.cat.position;
    expect(roomAt(cat.x, cat.z)).toBe('attic');
    expect(cat.y).toBeGreaterThan(4);
    // the level drawing: the attic and the floor its stair joins drawn in full, the rest stand-ins
    const drawing = s.areaLife.drawing;
    expect(drawing.current).toBe('attic');
    expect([...drawing.full].sort()).toEqual(['attic', 'upstairs']);
    let atticDetails = 0;
    s.scene.traverse((o) => {
      if (o.userData.houseDetail && o.userData.houseLevel === 'attic') { atticDetails++; expect(o.visible, o.name).toBe(true); }
      if (o.userData.houseSimple === 'attic') expect(o.visible, o.name).toBe(false);
      if (o.userData.houseDetail && o.userData.houseLevel === 'ground') expect(o.visible, o.name).toBe(false);
    });
    expect(atticDetails).toBeGreaterThan(0);
    // the camera behind her in the attic (not left at the front door), and nothing in the way
    const cam = again.camera.position;
    expect(Math.hypot(cam.x - cat.x, cam.z - cat.z)).toBeLessThan(6);
    expect(cam.x).toBeGreaterThan(cat.x); // east of her, as she looks west
    expect(blockers(s.areaData.house.sections, s.areaLife.sink, makeView(cat, cam, CAT_LOOK_Y))).toEqual([]);
    again.w.endWalk();
  }, 90_000);

  // Review Focus 5 (Task 6): a walk picked up again on the wardrobe, after the bookcase
  // opened and the clock struck. The discovery log is a real one, so its entries go into
  // the note and come back on the walk picked up (walk.js log.restore).
  it('a walk picked up again pays nothing twice, and finds her where she was', async () => {
    const paid = { points: 0 };
    const newLog = () => createDiscoveryLog({ addPoints: (n) => { paid.points += n; }, recordFeat() {} });
    const DT = 1 / 60;
    const clock = HOUSE_FINDS.find((f) => f.id === 'clock');
    const wardrobe = HOUSE_LEDGES.find((l) => l.id === 'bedroom-wardrobe');
    // a spot on the wardrobe's top she can stand on: in its band (the wall's colliders keep her
    // centre 0.55 m off the wall's line behind it, its rim 0.35 m in from its front: rough edge 2)
    const top = { x: (wardrobe.minX + wardrobe.maxX) / 2, z: wardrobe.maxZ - 0.4 };
    // frames of the house life with her at (x, y, z)
    const frames = (s) => {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 2, 14);
      const cat = new THREE.Vector3();
      let t = 0;
      return (x, y, z, seconds) => {
        for (let i = 0; i < Math.round(seconds / DT); i++) {
          cat.set(x, y, z);
          t += DT;
          s.areaLife.update(DT, t, cat, camera);
        }
      };
    };
    const log = newLog();
    const life = lifecycleHere({ log });
    let snap = null;
    houseWalk(life, false, {
      keep: (s) => {
        const stay = frames(s);
        stay(-6, 0, 3, 0.8);
        expect(s.areaLife.finds.open).toBe(true);
        // from the library it swings away from her into the stair, the shut row holding her
        // out of its way until it has swung (rough edge 3)
        expect(s.areaData.colliders.filter((c) => c.secret)).toEqual(secretColliders(false));
        stay(-6, 0, 3, 1.2);
        expect(s.areaData.colliders.filter((c) => c.secret)).toEqual(secretColliders(true, 'stair'));
        stay(clock.x, 0, clock.z, 1.2);
        expect(log.count('house-find-bookcase')).toBe(1);
        expect(log.count('house-find-clock')).toBe(1);
        expect(paid.points).toBe(24);
        // (the walk keeps a spot she was on before the house life runs: the plan's colliders, not
        // the feet round the ledges house life holds while she is on the floor, at the clock)
        expect(isWalkableAt({ ...s.areaData, colliders: s.areaData.colliders.filter((c) => !c.guard) }, top.x, top.z)).toBe(true);
        expect(s.areaData.colliders.some((c) => c.guard)).toBe(true);
        expect(s.ground.y(top.x, top.z)).toBeCloseTo(wardrobe.y, 6);
        snap = { ...snapshotWalk(s, { yaw: 0, now: Date.now(), paid: log.entries() }), x: top.x, z: top.z };
      },
    });
    const storage = memStorage();
    writeResume(storage, snap);
    setHouse(true);
    const left = readResume(storage, { now: Date.now(), areaIds: ids() });
    const log2 = newLog();
    const again = lifecycleHere({ log: log2 });
    expect(await pickUpWalk({
      storage, data: left.data, startWalkWhenReady: again.w.startWalkWhenReady, progression: again.progression,
      getSession: again.getSession, reload: () => {},
    })).toBe('started');
    const s = again.getSession();
    expect(s.resumed).toBe(true);
    // she is on the wardrobe, upstairs drawn
    const cat = s.cat.position;
    expect(s.ground.y(cat.x, cat.z)).toBeCloseTo(wardrobe.y, 6);
    expect(cat.y).toBeCloseTo(wardrobe.y, 6);
    expect(s.areaLife.drawing.current).toBe('upstairs');
    // what the first part of the walk paid is paid, and the clock pays nothing more
    expect(log2.count('house-find-clock')).toBe(1);
    expect(log2.count('house-find-bookcase')).toBe(1);
    const before = paid.points;
    const stay = frames(s);
    stay(clock.x, 0, clock.z, 1.2);
    expect(paid.points).toBe(before);
    expect(log2.count('house-find-clock')).toBe(1);
    // the bookcase is shut again, and opens for her, paying nothing
    expect(s.areaLife.finds.open).toBe(false);
    expect(s.areaData.colliders.filter((c) => c.secret)).toEqual(secretColliders(false));
    stay(-6, 0, 3, 2.0);
    expect(s.areaLife.finds.open).toBe(true);
    expect(s.areaData.colliders.filter((c) => c.secret)).toEqual(secretColliders(true, 'stair'));
    expect(paid.points).toBe(before);
    again.w.endWalk();
  }, 90_000);

  // Owner's fix C: the "Welcome back!" card showed her side-on, because the
  // resume branch turned the view but never her. Before any frame, she faces
  // the way the note looked, so the camera sees her from behind.
  it('picked up again, the card shows her from behind: she faces away from the camera', async () => {
    const life = lifecycleHere();
    let snap = null;
    houseWalk(life, false, { keep: (s) => { snap = snapshotWalk(s, { yaw: 0, now: Date.now() }); } });
    setHouse(true);
    // the attic looking west, the parlour looking east, the kitchen looking north
    for (const [x, z, fx, fz] of [[-19, -10, -1, 0], [9, 7, 1, 0], [9, -3, 0, -1]]) {
      const storage = memStorage();
      writeResume(storage, { ...snap, x, z, yaw: behindYaw(fx, fz) });
      const left = readResume(storage, { now: Date.now(), areaIds: ids() });
      const again = lifecycleHere();
      expect(await pickUpWalk({
        storage, data: left.data, startWalkWhenReady: again.w.startWalkWhenReady, progression: again.progression,
        getSession: again.getSession, reload: () => {},
      })).toBe('started');
      const s = again.getSession();
      expect(s.resumed).toBe(true);
      const cat = s.cat.position;
      const cam = again.camera.position;
      // her nose: rotation.y r faces (-sin r, -cos r) (traversal.js facingYaw)
      const r = s.cat.rotation.y;
      const nose = [-Math.sin(r), -Math.cos(r)];
      const toCam = [cam.x - cat.x, cam.z - cat.z];
      const len = Math.hypot(toCam[0], toCam[1]);
      expect(len, `${x},${z}`).toBeGreaterThan(1);
      // the camera is straight behind her: her nose points away from it, within 10 degrees
      const cos = -(nose[0] * toCam[0] + nose[1] * toCam[1]) / len;
      expect(cos, `${x},${z}: she is not facing away from the camera`).toBeGreaterThan(Math.cos((10 * Math.PI) / 180));
      // and she faces the way the note looked
      expect(nose[0] * fx + nose[1] * fz, `${x},${z}`).toBeGreaterThan(0.98);
      expect(blockers(s.areaData.house.sections, s.areaLife.sink, makeView(cat, cam, CAT_LOOK_Y))).toEqual([]);
      again.w.endWalk();
    }
  }, 90_000);
});

// The sound, through its own seam (as test/audio.test.js observes the den's):
// looped-noise layers are buffer sources (the fire, wind, rain); birdsong and
// crickets are setInterval; gulls and the horn are setTimeout.
describe('the house sounds like the den', () => {
  function fakeParam(v = 1) {
    return { value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
  }
  function fakeNode(extra = {}) {
    const n = { connections: [], stopped: false, connect(t) { n.connections.push(t); return t; }, start() {}, stop() { n.stopped = true; }, ...extra };
    return n;
  }
  function probe(areaKey, opts) {
    const sources = [];
    const ctx = {
      currentTime: 0, sampleRate: 44100, destination: fakeNode(),
      createGain: () => fakeNode({ gain: fakeParam(1) }),
      createOscillator: () => fakeNode({ frequency: fakeParam(440), type: 'sine' }),
      createDynamicsCompressor: () => fakeNode({ threshold: fakeParam(), knee: fakeParam(), ratio: fakeParam(), attack: fakeParam(), release: fakeParam() }),
      createConvolver: () => fakeNode({ buffer: null }),
      createBiquadFilter: () => fakeNode({ type: 'lowpass', frequency: fakeParam(), Q: fakeParam() }),
      createBuffer: (ch, len, rate) => ({ getChannelData: () => new Float32Array(len), length: len, sampleRate: rate }),
      createBufferSource: () => { const n = fakeNode({ buffer: null, loop: false, playbackRate: fakeParam(1) }); sources.push(n); return n; },
    };
    const origInterval = globalThis.setInterval;
    const origTimeout = globalThis.setTimeout;
    let intervals = 0;
    let timeouts = 0;
    globalThis.setInterval = (...a) => { intervals++; return origInterval(...a); };
    globalThis.setTimeout = (...a) => { timeouts++; return origTimeout(...a); };
    const audio = createAudio({ contextFactory: () => ctx });
    try {
      audio.startAmbient(areaKey, opts);
    } finally {
      globalThis.setInterval = origInterval;
      globalThis.setTimeout = origTimeout;
    }
    const heard = { fire: sources.length, intervals, timeouts };
    audio.stopAmbient();
    heard.stopped = sources.every((x) => x.stopped);
    return heard;
  }

  it('the fire alone, day or dusk: never birdsong, crickets, gulls or wind', () => {
    const den = probe('den');
    expect(den).toEqual({ fire: 1, intervals: 0, timeouts: 0, stopped: true });
    expect(probe('house')).toEqual(den);
    expect(probe('house', { dusk: true })).toEqual(den);
    expect(probe('den', { dusk: true })).toEqual(den);
    // outdoors a dusk walk has its crickets (one setInterval) over the wind
    expect(probe('park', { dusk: true }).intervals).toBe(1);
  });
});

// ---- Old House step 4 (Task 2): the house opens ----------------------------
// docs/superpowers/plans/2026-11-21-old-house-step4-into-the-game.md, W1-W3;
// the owner's change (2026-11-21): 150 🐾 after 2 Market Square walks.

// Review Focus 5: a Legacy save never fetches the house's download nor keeps
// its walk note, with the switch or without.
describe('Legacy never fetches the house or keeps its note', () => {
  it('housePrefetch: Clan Edition with the switch only', () => {
    const clanState = createProgression(memStorage()).state;
    const legacyState = { ...clanState, edition: 'legacy' };
    setHouse(true);
    expect(housePrefetch(legacyState)).toBe(false);
    expect(housePrefetch(clanState)).toBe(true);
    setHouse(false);
    expect(housePrefetch(clanState)).toBe(false);
    expect(housePrefetch(legacyState)).toBe(false);
  });

  it('a Legacy save whose place is the house walks her own place on Explore, and fetches no house pack', async () => {
    setHouse(true);
    const storage = memStorage();
    storage.setItem('whisker-walk-save', JSON.stringify({
      version: 4, edition: 'legacy', area: 'house', points: 0,
      walks: { neighborhood: 4, market: 2, house: 3 },
      unlocked: { areas: ['neighborhood', 'market', 'house'] },
    }));
    const c = controlledLoader();
    const life = lifecycleHere({ areas: c.areas, storage });
    expect(life.progression.state.edition).toBe('legacy');
    // what main.js does at boot: her own place, the den, and the house only when housePrefetch says so
    if (housePrefetch(life.progression.state)) c.areas.prefetch('house');
    expect(await life.w.beginWalkFromHomebase({ duskMode: false })).toBe('started');
    expect(life.getSession().areaId).not.toBe('house');
    expect(life.getSession().areaId).toBe('neighborhood');
    life.w.endWalk();
    expect(c.calls.house).toBeUndefined();
  }, 90_000);
});

describe('the Old House unlock in the real catalog', () => {
  const fresh = () => createProgression(memStorage()).state;
  const GATE = { area: 'market', walks: 2 };
  // her save owns the Market (a real save that walked it does), with `marketWalks` there
  const inMarket = (marketWalks, extra = {}) => {
    const s = fresh();
    return { ...s, walks: { ...s.walks, neighborhood: 2, market: marketWalks }, unlocked: { ...s.unlocked, areas: [...s.unlocked.areas, 'market'] }, ...extra };
  };

  it('opens 150 🐾 after 2 Market walks; its lock line names the Market Square in both word sets', () => {
    const locked = placeState(inMarket(1, { points: 500 }), CATALOG, 'house');
    expect(locked).toMatchObject({ locked: true, canOpen: false, owned: false, price: 150 });
    expect(locked.line).toBe(opensAfterLine(GATE, 1, 'canon', CATALOG));
    expect(locked.line).toBe('opens after you explore the Market Square 2 times · 1/2');
    withOffWords(() => expect(placeState(inMarket(1), CATALOG, 'house').line).toBe('opens after you explore the Market Square 2 times · 1/2'));
    expect(placeState(inMarket(2, { points: 150 }), CATALOG, 'house')).toMatchObject({ locked: false, canOpen: true, owned: false, price: 150, line: 'Open for 150 🐾' });
  });

  // Review Focus 1: a save that walked the house through ?house=1 before step
  // 4 (walks.house 3, not owned, no points, no Market walks).
  it('a save that walked the house with the switch keeps nothing it did not buy', () => {
    const s = fresh();
    const old = { ...s, walks: { ...s.walks, house: 3, market: 0 }, points: 0 };
    const st = placeState(old, CATALOG, 'house');
    expect(st).toMatchObject({ owned: false, locked: true, canOpen: false, price: 150 });
    expect(st.line).toBe(opensAfterLine(GATE, 0, old.edition, CATALOG));
    expect(st.line).toContain('0/2');
    expect(old.unlocked.areas).not.toContain('house');
    // offered at 150 once she has 2 Market walks (and owns the Market, as a real save would) and the points
    const later = { ...old, walks: { ...old.walks, neighborhood: 2, market: 2 }, unlocked: { ...old.unlocked, areas: [...old.unlocked.areas, 'market'] }, points: 150 };
    expect(placeState(later, CATALOG, 'house')).toMatchObject({ owned: false, locked: false, canOpen: true, line: 'Open for 150 🐾' });
    // with 100 she is short by 50
    const short = { ...later, points: 100 };
    expect(placeState(short, CATALOG, 'house')).toMatchObject({ owned: false, locked: false, canOpen: false, line: '150 🐾 — keep exploring!' });
    expect(placeWhyLine(short, CATALOG, 'house')).toBe('50 more 🐾 to go');
    // a save loaded from it owns nothing more
    const storage = memStorage();
    storage.setItem('whisker-walk-save', JSON.stringify(old));
    const q = createProgression(storage);
    expect(q.state.walks.house).toBe(3);
    expect(q.state.unlocked.areas).not.toContain('house');
    expect(q.isUnlocked('areas', 'house')).toBe(false);
  });

  it('Legacy has no offer: locked away like every Clan-only place', () => {
    const p = createProgression(memStorage());
    p.setEdition('legacy');
    p.addPoints(1000);
    for (let i = 0; i < 2; i++) p.completeWalk('neighborhood');
    for (let i = 0; i < 2; i++) p.completeWalk('market');
    expect(p.buy('areas', 'house')).toBe(false);
    expect(p.state.unlocked.areas).not.toContain('house');
  });
});

// Old House step 4, Task 5 (the controller's P-3, from Task 4; Review Focus 5):
// through a real walk, the town draws the old house's front only for a Clan
// Edition walk, which hands it the door's gate end (walk.js gateEnds).
describe('the old house front on a town walk', () => {
  const townWalk = (life, o) => walk(life, (w) => w.startWalk({ duskMode: false, areaOverride: 'neighborhood' }), o);

  it('a Legacy town has no old house front', () => {
    const life = lifecycleHere();
    life.progression.setEdition('legacy');
    let front = 'not looked';
    const r = townWalk(life, { keep: (s) => {
      front = s.scene.getObjectByName('oldhousefront');
      expect(s.gates).toBe(NO_GATES);
    } });
    expect(r.areaId).toBe('neighborhood');
    expect(front).toBeUndefined();
  }, 90_000);

  it('a Clan Edition town walk owning nothing has one, and its door asks', () => {
    const life = lifecycleHere();
    expect(life.progression.state.edition).not.toBe('legacy');
    expect(life.progression.state.unlocked.areas).not.toContain('house');
    let seenFront = null;
    const r = townWalk(life, { keep: (s) => {
      seenFront = s.scene.getObjectByName('oldhousefront') ?? null;
      expect(s.gates).not.toBe(NO_GATES);
      // its ring is in the walk's colliders, 1.25 m from the door's end at the nearest
      const end = gatewayNear('neighborhood', -42.5, 31, CATALOG);
      expect(end?.id).toBe('town-house');
      const near = Math.min(...s.areaData.colliders.map((c) => Math.hypot(c.x - end.x, c.z - end.z)));
      expect(near).toBeGreaterThanOrEqual(1.2);
      expect(near).toBeLessThan(1.5);
      // the prompt at its door: shut, and how many Market Square walks are left
      const line = gatePrompt(gateStatus(end, life.progression.state, CATALOG));
      expect(line).toEqual({ kind: 'gate-info', text: phrase('gate.shut', 2, lower(placeName('market', 'canon', CATALOG)), 2) });
    } });
    expect(r.areaId).toBe('neighborhood');
    expect(seenFront).toBeTruthy();
  }, 90_000);
});
