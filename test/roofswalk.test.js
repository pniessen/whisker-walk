import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { createWalkLifecycle } from '../src/game/walk.js';
import { createProgression } from '../src/progression.js';
import { resolveQuality } from '../src/render/quality.js';
import { mulberry32 } from '../src/rng.js';
import { rollWeather } from '../src/weather.js';
import { setRoofs } from '../src/roofsflag.js';
import { NO_TRAVERSAL } from '../src/traversallive.js';

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
// =============================================================================

const seen = vi.hoisted(() => ({ ambient: [], clouds: [], secrets: [], critters: [] }));
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

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
// The headless canvas and DOM the walk needs (as test/walkfreed.test.js).
function fakeContext() {
  return new Proxy({}, {
    get: (_t, key) => {
      if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
      if (key === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set: () => true,
  });
}
function fakeEl() {
  return {
    width: 0, height: 0, getContext: fakeContext,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {},
    setAttribute() {}, appendChild() {}, insertBefore() {}, addEventListener() {}, removeEventListener() {},
    remove() {}, contains: () => false, querySelector: () => fakeEl(), querySelectorAll: () => [],
  };
}
const anything = (values = {}) => new Proxy(values, {
  get: (target, key) => (key in target ? target[key] : () => undefined),
  set: (target, key, v) => { target[key] = v; return true; },
});

// A save past the guided first walk, with the Glow Collar bought, and on
// when `collar` says so.
function lifecycle({ collar = false } = {}) {
  let session = null;
  let pendingRoom = null;
  const rec = { lighting: [], sound: [], music: [], roomStarts: [], friendFetches: 0 };
  const progression = createProgression(memStorage());
  progression.setTutorialFirst('done');
  progression.addPoints(1000);
  expect(progression.buy('accessories', 'glow')).toBe(true);
  if (collar) progression.equipAccessory('glow');
  const w = createWalkLifecycle({
    // MP on, so a solo walk asks the cloud for friends who could visit as ghosts
    MP: true, pid: 'me', coarse: false, envMap: new THREE.Texture(), overlay: anything({ classList: anything() }), blockList: new Set(),
    renderer: null, camera: new THREE.PerspectiveCamera(),
    composerRig: anything({ applyLighting: (_scene, o) => rec.lighting.push(o.dusk) }),
    player: anything(), progression,
    settings: { get: (k) => (k === 'muted' ? true : null) },
    hud: anything({ mapHost: fakeEl() }),
    audio: anything({ startAmbient: (areaId, o) => rec.sound.push({ areaId, ...o }) }),
    music: anything({ start: (_seed, mood) => rec.music.push(mood) }),
    log: anything(), touchUI: anything(), catVoice: () => {},
    getCloud: () => ({ fetchFriendships: async () => { rec.friendFetches++; return []; }, fetchProfiles: async () => [] }),
    getSession: () => session, setSession: (s) => { session = s; }, getIsTouch: () => false,
    getHomebase: () => anything(),
    getPendingRoom: () => pendingRoom, clearPendingRoom: () => { pendingRoom = null; }, pushProfileNow: () => {},
    startRoomTogether: (o) => rec.roomStarts.push(o),
    awardStrayGreet: () => {}, applyRemoteEvent: () => {},
    qualityAdapter: { beginWalk: () => ({ ...resolveQuality({ override: 'high' }), postFx: false }) },
    denShop: null,
  });
  return { w, rec, progression, getSession: () => session, setPendingRoom: (r) => { pendingRoom = r; } };
}

// The first seed whose walk rolls rain (the weather is the first draw off a
// walk's stream), and the Math.random draw that makes it a solo walk's seed.
const RAIN = (() => { for (let seed = 1; ; seed++) if (rollWeather(mulberry32(seed)) === 'rain') return seed; })();
let stream = null;
let queued = [];
const nextWalkSeed = (seed) => queued.push((seed + 0.5) / 2 ** 31);

// One walk, started and ended; what it was handed, and what it built.
function walk(life, start) {
  for (const k of Object.keys(seen)) seen[k].length = 0;
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

describe('a walk on the Rooftops', () => {
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
