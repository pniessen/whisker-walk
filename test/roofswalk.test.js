import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mulberry32 } from '../src/rng.js';
import { rollWeather } from '../src/weather.js';
import { setRoofs, loadRoofs, loadedRoofs } from '../src/roofsflag.js';
import { NO_TRAVERSAL } from '../src/traversallive.js';
import { lifecycle, fakeEl } from './helpers/walklife.js';

// =============================================================================
// The Rooftops in a real walk (Rooftops step 2). walk.js's createWalkLifecycle
// is booted headless, as test/walkfreed.test.js boots it, and real walks are
// started and ended: on the Rooftops, and on the Park beside them for the
// difference. What each walk system was handed is recorded where walk.js
// hands it: the lifecycle's own dependencies (the lighting rig, the sound,
// the music, the cloud) are recorders, and four modules walk.js imports are
// the real ones wrapped to note their arguments.
//
// These replace the text pins this branch first put on walk.js: the dusk
// look and the dusk tally, no weather on the roofs, the ?roofs=1 start, no
// strays or wanderer, and (the final review's finding 1) no ghosts.
//
// The Rooftops' drawing is its own download (roofsflag.js loadRoofs, build
// fix F2): the first describe below runs before anything here has loaded it,
// and counts each time world/roofs.js is actually evaluated.
// =============================================================================

const seen = vi.hoisted(() => ({ ambient: [], clouds: [], secrets: [], critters: [], roofsLoads: 0 }));
vi.mock('../src/world/roofs.js', async (importOriginal) => {
  seen.roofsLoads++;
  return importOriginal();
});
vi.mock('../src/render/ambient.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, createAmbient: (scene, o) => { seen.ambient.push(o.dusk); return m.createAmbient(scene, o); } };
});
vi.mock('../src/render/clouds.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, createClouds: (scene, o) => { seen.clouds.push(o.dusk); return m.createClouds(scene, o); } };
});
vi.mock('../src/secrets.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, rollSecrets: (rng, o) => { seen.secrets.push(o.eveningLight); return m.rollSecrets(rng, o); } };
});
vi.mock('../src/critters.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, createCritters: (scene, spawns, o) => { seen.critters.push(o.spawnFireflies); return m.createCritters(scene, spawns, o); } };
});
// Every walk's day has a wanderer, so a walk that let one in would show it.
vi.mock('../src/housecats.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, walkWanderer: (state, areaId, o) => (o?.isDen ? null : 'Biscuit') };
});

// The first seed whose walk rolls rain (the weather is the first draw off a
// walk's stream), and the Math.random draw that makes it a solo walk's seed.
const RAIN = (() => { for (let seed = 1; ; seed++) if (rollWeather(mulberry32(seed)) === 'rain') return seed; })();
let stream = null;
let queued = [];
const nextWalkSeed = (seed) => queued.push((seed + 0.5) / 2 ** 31);

// One walk, started and ended; what it was handed, and what it built.
function walk(life, start) {
  for (const k of ['ambient', 'clouds', 'secrets', 'critters']) seen[k].length = 0;
  for (const k of ['lighting', 'sound', 'music']) life.rec[k].length = 0;
  life.rec.friendFetches = 0;
  nextWalkSeed(RAIN);
  start(life.w);
  const s = life.getSession();
  expect(s).not.toBe(null);
  expect(s.soloSeed).toBe(RAIN);
  const out = {
    areaId: s.areaId,
    look: { lighting: life.rec.lighting, ambient: [...seen.ambient], clouds: [...seen.clouds], sound: life.rec.sound.map((x) => x.dusk), music: life.rec.music },
    weather: s.weather.condition,
    rain: !!s.scene.getObjectByName('rain-drops'),
    rest: { secretsEveningLight: [...seen.secrets], fireflies: [...seen.critters], duskActive: s.duskActive },
    strays: s.strayCats.strays.map((c) => c.name),
    arrivalLine: s.arrivalLine,
    moves: s.traversal !== NO_TRAVERSAL,
    ghostsAsked: life.rec.friendFetches,
  };
  const before = life.progression.state.duskWalks;
  life.w.endWalk();
  expect(life.getSession()).toBe(null);
  out.duskWalksAdded = life.progression.state.duskWalks - before;
  return out;
}
const roofsWalk = (life, duskMode = false) => walk(life, (w) => w.startWalk({ duskMode, areaOverride: 'roofs' }));
const parkWalk = (life, duskMode = false) => walk(life, (w) => w.startWalk({ duskMode, areaOverride: 'park' }));

beforeEach(() => {
  globalThis.document = { body: fakeEl(), createElement: fakeEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-20T15:00:00Z') });
  stream = mulberry32(20261120);
  queued = [];
  vi.spyOn(Math, 'random').mockImplementation(() => (queued.length ? queued.shift() : stream()));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  delete globalThis.document;
  setRoofs(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the Rooftops\' drawing is its own download', () => {
  it('without the switch nothing fetches it: a Park walk and Explore in her own place', () => {
    setRoofs(false);
    expect(parkWalk(lifecycle()).areaId).toBe('park');
    expect(walk(lifecycle(), (w) => w.beginWalkFromHomebase({ duskMode: false })).areaId).toBe('neighborhood');
    expect(seen.roofsLoads).toBe(0);
    expect(loadedRoofs()).toBe(null);
  });

  it('with the switch, Explore before it has come waits for it, then walks the Rooftops', async () => {
    setRoofs(true);
    const life = lifecycle();
    const started = life.w.beginWalkFromHomebase({ duskMode: false });
    expect(life.getSession()).toBe(null); // home stays up while it comes
    await started;
    const s = life.getSession();
    expect(s.areaId).toBe('roofs');
    expect(s.traversal).not.toBe(NO_TRAVERSAL); // the Rooftops' own build, with its moves
    expect(seen.roofsLoads).toBe(1);
    life.w.endWalk();
    // once it has come, Explore starts straight away, with no second fetch
    expect(walk(lifecycle(), (w) => w.beginWalkFromHomebase({ duskMode: false })).areaId).toBe('roofs');
    expect(seen.roofsLoads).toBe(1);
  });
});

describe('a walk on the Rooftops', () => {
  beforeAll(() => loadRoofs());
  const EVENING = { lighting: [true], ambient: [true], clouds: [true], sound: [true], music: ['dusk'] };

  it('the Day choice with the Glow Collar on: the evening look everywhere, and it counts as a dusk walk', () => {
    const r = roofsWalk(lifecycle({ collar: true }));
    expect(r.areaId).toBe('roofs');
    expect(r.moves).toBe(true); // the Rooftops' own build, with its moves
    expect(r.look).toEqual(EVENING);
    // the Dusk choice was not made, so the rest of dusk stays off: the
    // secrets' evening roll and the fireflies
    expect(r.rest).toEqual({ secretsEveningLight: [false], fireflies: [false], duskActive: false });
    expect(r.duskWalksAdded).toBe(1);
  });

  it('with no collar: the same look, and no dusk walk', () => {
    const r = roofsWalk(lifecycle());
    expect(r.look).toEqual(EVENING);
    expect(r.rest).toEqual({ secretsEveningLight: [false], fireflies: [false], duskActive: false });
    expect(r.duskWalksAdded).toBe(0);
    // the Dusk choice without the collar is no dusk walk there either
    expect(roofsWalk(lifecycle(), true).duskWalksAdded).toBe(0);
  });

  it('no weather on the roofs: a walk whose seed rolls rain is dry, and sounds and plays as evening', () => {
    const r = roofsWalk(lifecycle());
    expect([r.weather, r.rain]).toEqual(['clear', false]);
    // the same seed on the Park rains, so the seed is a rainy one
    const park = parkWalk(lifecycle());
    expect([park.weather, park.rain]).toEqual(['rain', true]);
    expect(park.look).toEqual({ lighting: [false], ambient: [false], clouds: [false], sound: [false], music: ['rain'] });
  });

  it('no strays and no wanderer, on a day that has one', () => {
    const r = roofsWalk(lifecycle());
    expect(r.strays).toEqual([]);
    expect(r.arrivalLine).toBe(null);
    // the Park on the same day has its strays
    expect(parkWalk(lifecycle()).strays.length).toBeGreaterThan(0);
  });

  it('no ghosts: a solo walk there never asks for friends to visit', () => {
    expect(roofsWalk(lifecycle()).ghostsAsked).toBe(0);
    // a solo Park walk does
    expect(parkWalk(lifecycle()).ghostsAsked).toBe(1);
  });
});

describe('everywhere else, dusk is the Dusk choice and the Glow Collar', () => {
  it('a Park dusk walk in the collar: the look, the secrets\' evening roll, the fireflies, and the tally', () => {
    const r = parkWalk(lifecycle({ collar: true }), true);
    expect(r.look).toEqual({ lighting: [true], ambient: [true], clouds: [true], sound: [true], music: ['dusk'] });
    expect(r.rest).toEqual({ secretsEveningLight: [true], fireflies: [true], duskActive: true });
    expect(r.duskWalksAdded).toBe(1);
  });

  it('a Park day walk in the collar is no dusk walk', () => {
    expect(parkWalk(lifecycle({ collar: true })).duskWalksAdded).toBe(0);
  });
});

describe('Explore with ?roofs=1', () => {
  beforeAll(() => loadRoofs());
  it('starts a solo Rooftops walk', () => {
    setRoofs(true);
    const r = walk(lifecycle(), (w) => w.beginWalkFromHomebase({ duskMode: false }));
    expect(r.areaId).toBe('roofs');
  });

  it('never in a room: in a room, Explore starts the room\'s walk in her own place', () => {
    setRoofs(true);
    const life = lifecycle();
    life.setPendingRoom({ code: 'ABCD' });
    life.w.beginWalkFromHomebase({ duskMode: false });
    expect(life.getSession()).toBe(null);
    expect(life.rec.roomStarts).toEqual([{ area: 'neighborhood', dusk: false }]);
  });

  it('without the flag, Explore walks her own place', () => {
    setRoofs(false);
    const r = walk(lifecycle(), (w) => w.beginWalkFromHomebase({ duskMode: false }));
    expect(r.areaId).toBe('neighborhood');
  });
});
