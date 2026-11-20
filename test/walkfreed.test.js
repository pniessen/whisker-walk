import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { createWalkLifecycle } from '../src/game/walk.js';
import { createProgression } from '../src/progression.js';
import { resolveQuality } from '../src/render/quality.js';
import { contactShadowTexture } from '../src/render/contactshadows.js';
import { diagnostics } from '../src/diagnostics.js';
import { mulberry32 } from '../src/rng.js';
import { rollWeather } from '../src/weather.js';
import { NO_FIND } from '../src/foundwear/live.js';

// endWalk (src/game/walk.js) frees a walk by hand: a dispose() per rig, then
// a sweep over the scene. Nothing else would notice a rig that forgot its
// part, because a leak between walks shows only as an iPad that slows down
// after a few walks. So real walks (the guided first walk in the
// Neighbourhood, and ordinary Park walks in rain, at sunset and at dusk) are
// started and ended here, headless, and every geometry, material and texture
// each scene holds must have been disposed, apart from the few the app keeps
// for its whole life.
//
// What a walk builds hangs on its seed and the day: the weather, the secrets,
// the strays, the find. So Math.random is a fixed stream and the clock a fixed
// day, and each walk below pins the one seed it needs, or a leak would show
// only on the runs whose seed happened to build the leaking part.

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

// No jsdom here: the headless canvas stub the world tests use (see
// test/den.test.js), with measureText for the cats' name tags.
function fakeContext() {
  return new Proxy({}, {
    get: (_target, key) => {
      if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
      if (key === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set: () => true,
  });
}
// Enough of an element for the chat wheel, the minimap and the unlock card.
function fakeEl() {
  return {
    width: 0, height: 0, getContext: fakeContext,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {},
    setAttribute() {}, appendChild() {}, insertBefore() {}, addEventListener() {}, removeEventListener() {},
    remove() {}, contains: () => false, querySelector: () => fakeEl(), querySelectorAll: () => [],
  };
}
function fakeDocument() {
  return {
    body: fakeEl(), createElement: fakeEl, getElementById: () => null,
    addEventListener() {}, removeEventListener() {},
  };
}

// A dependency the walk only calls: every property is a no-op function, apart
// from the few given values it reads as values.
const anything = (values = {}) => new Proxy(values, {
  get: (target, key) => (key in target ? target[key] : () => undefined),
  set: (target, key, v) => { target[key] = v; return true; },
});

// The app's one environment map, made once by main.js and handed to every walk.
const envMap = new THREE.Texture();
envMap.name = 'test env map';

function lifecycle({ renderer = null, save = () => {} } = {}) {
  let session = null;
  const progression = createProgression(memStorage());
  save(progression);
  const w = createWalkLifecycle({
    MP: false, pid: 'me', coarse: false, envMap, overlay: anything({ classList: anything() }), blockList: new Set(),
    renderer, camera: new THREE.PerspectiveCamera(), composerRig: anything(),
    player: anything(), progression,
    settings: { get: (k) => (k === 'muted' ? true : null) },
    hud: anything({ mapHost: fakeEl() }), audio: anything(), music: anything(), log: anything(), touchUI: anything(),
    catVoice: () => {},
    getCloud: () => null, getSession: () => session, setSession: (s) => { session = s; }, getIsTouch: () => false,
    getHomebase: () => anything(),
    getPendingRoom: () => null, clearPendingRoom: () => {}, pushProfileNow: () => {},
    startRoomTogether: () => {},
    awardStrayGreet: () => {}, applyRemoteEvent: () => {},
    // HIGH, so the walk builds everything a tier can add (normal maps, grass,
    // shadows); no post-processing, which needs a real renderer.
    qualityAdapter: { beginWalk: () => ({ ...resolveQuality({ override: 'high' }), postFx: false }) },
    denShop: null,
  });
  return { w, getSession: () => session, progression };
}

// The nearest name up the tree, so a failure says where a resource was.
function holderOf(obj) {
  for (let o = obj; o; o = o.parent) if (o.name) return o === obj ? o.name : `${obj.type} in ${o.name}`;
  return obj.type;
}

// Every geometry, material and texture reachable from the walk's scene, each
// with the object that held it and a 'dispose' listener (three dispatches
// { type: 'dispose' } from all three).
function track(scene) {
  const found = new Map();
  const add = (res, kind, holder) => {
    if (!res || found.has(res)) return;
    const rec = { res, kind, name: res.name || '', holder, freed: false };
    found.set(res, rec);
    res.addEventListener('dispose', () => { rec.freed = true; });
  };
  scene.traverse((obj) => {
    const holder = holderOf(obj);
    if (obj.geometry?.isBufferGeometry) add(obj.geometry, 'BufferGeometry', holder);
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      if (!m?.isMaterial) continue;
      add(m, 'Material', holder);
      for (const v of Object.values(m)) if (v?.isTexture) add(v, 'Texture', holder);
      for (const u of Object.values(m.uniforms ?? {})) if (u?.value?.isTexture) add(u.value, 'Texture', holder);
    }
  });
  for (const v of [scene.background, scene.environment]) if (v?.isTexture) add(v, 'Texture', 'the scene');
  return [...found.values()];
}

// What a walk uses but must NOT free: made once and shared by every walk
// after this one. Each entry says why, and matches by identity with the
// object its module hands out, or by the name its module gives it.
const SHARED = [
  {
    why: 'the environment map main.js makes once and hands to every walk',
    matches: (r) => r.res === envMap,
  },
  {
    why: 'the contact-shadow gradient: render/contactshadows.js memoises it, and its dispose() keeps it',
    matches: (r) => r.res === contactShadowTexture(),
  },
  {
    why: "the surface tiles: render/textures.js memoises them per density and names them 'surface:<name>' (clones keep the name)",
    matches: (r) => r.kind === 'Texture' && r.name.startsWith('surface:'),
  },
  {
    why: "the sky gradients: render/sky.js memoises one per colour pair and names it 'sky:<top>-<horizon>'",
    matches: (r) => r.kind === 'Texture' && r.name.startsWith('sky:'),
  },
];
const isShared = (r) => SHARED.some((s) => s.matches(r));
const describeRes = (r) => `${r.kind} '${r.name}' held by '${r.holder}'`;

// A save past the guided first walk, so a walk is an ordinary one: any
// weather, dusk with the glow collar on, a find in a place with spots.
function pastTheGuidedWalk(progression) {
  progression.setTutorialFirst('done');
  progression.addPoints(1000);
  expect(progression.buy('accessories', 'glow')).toBe(true);
}
function wearingGlowCollar(progression) {
  pastTheGuidedWalk(progression);
  progression.equipAccessory('glow');
  expect(progression.state.equipped.collar).toBe('glow');
}

// The first seed whose walk rolls this weather, by walk.js's own roll (the
// weather is the first draw off the walk's stream).
function seedFor(weather) {
  for (let seed = 1; ; seed++) if (rollWeather(mulberry32(seed)) === weather) return seed;
}

// A solo walk's seed is the first Math.random draw startWalk makes
// (walkresume.js newWalkSeed: floor(r * 2^31)); this queues the draw that
// gives `seed`, and the fixed stream carries on after it. Each walk checks it
// got its seed, so a new draw ahead of it fails here rather than quietly
// walking some other walk.
let stream = null;
let queued = [];
function nextWalkSeed(seed) { queued.push((seed + 0.5) / 2 ** 31); }

function walkOnce(w, getSession, { area = 'neighborhood', duskMode = false, seed = null } = {}) {
  if (seed !== null) nextWalkSeed(seed);
  w.startWalk(area === 'neighborhood' ? { duskMode } : { duskMode, areaOverride: area });
  const session = getSession();
  expect(session?.areaId).toBe(area);
  if (seed !== null) expect(session.soloSeed).toBe(seed);
  // Headless there is no GL, so the thumbnail pass notes one 'gl' failure (a
  // missing capabilities object, no source file). Any other note is a real
  // failure the walk made.
  const noted = diagnostics.entries().filter((e) => !(e.kind === 'gl' && e.source === '' && /precision/.test(e.message)));
  expect(noted.map((e) => `${e.kind}: ${e.message} (${e.source})`)).toEqual([]);
  const tracked = track(session.scene);
  // Which of the parts under test this walk built, by the name their module
  // gives the object: each must hold at least one tracked resource.
  const parts = {};
  for (const name of ['rain-drops', 'rain-rings', 'lampPools', 'find']) {
    const ids = new Set();
    session.scene.getObjectByName(name)?.traverse((o) => { if (o.geometry) ids.add(o.geometry); });
    parts[name] = tracked.some((r) => ids.has(r.res));
  }
  const built = {
    weather: session.weather.condition, dusk: session.duskActive, find: session.find !== NO_FIND,
    lesson: session.lesson?.kind ?? null,
  };
  w.endWalk();
  expect(getSession()).toBe(null);
  return { tracked, built, parts };
}

function expectFreed(tracked) {
  // The walk really built something: a whole area's worth.
  expect(tracked.filter((r) => r.kind === 'BufferGeometry').length).toBeGreaterThan(100);
  expect(tracked.filter((r) => r.kind === 'Material').length).toBeGreaterThan(100);
  expect(tracked.filter((r) => r.kind === 'Texture').length).toBeGreaterThan(0);
  const leaked = tracked.filter((r) => !r.freed && !isShared(r)).map(describeRes);
  expect(leaked, 'made by the walk and not freed by endWalk').toEqual([]);
  // and the shared ones are left alone, or the next walk draws with freed maps
  const wrongly = tracked.filter((r) => r.freed && isShared(r)).map(describeRes);
  expect(wrongly, 'shared for the app\'s lifetime, but freed by endWalk').toEqual([]);
}

beforeEach(() => {
  globalThis.document = fakeDocument();
  diagnostics.clear();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-19T15:00:00Z') });
  stream = mulberry32(20261119);
  queued = [];
  vi.spyOn(Math, 'random').mockImplementation(() => (queued.length ? queued.shift() : stream()));
});
afterEach(() => {
  delete globalThis.document;
  diagnostics.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('everything a walk made is freed', () => {
  it('the guided first walk in the Neighbourhood, started and ended', () => {
    const { w, getSession } = lifecycle();
    const { tracked, built } = walkOnce(w, getSession);
    expect(built).toEqual({ weather: 'clear', dusk: false, find: false, lesson: 'first' });
    expectFreed(tracked);
    // no renderer, no reading
    expect(diagnostics.memory()).toEqual([]);
  });

  it('two walks back to back: the second walk\'s scene is freed too', () => {
    const { w, getSession } = lifecycle();
    expectFreed(walkOnce(w, getSession).tracked);
    expectFreed(walkOnce(w, getSession).tracked);
  });

  // The Park, because it has find spots and street lamps.
  it('a rainy Park walk with a find: the drops, the rings and the find are freed', () => {
    const { w, getSession } = lifecycle({ save: pastTheGuidedWalk });
    const { tracked, built, parts } = walkOnce(w, getSession, { area: 'park', seed: seedFor('rain') });
    expect(built).toEqual({ weather: 'rain', dusk: false, find: true, lesson: null });
    expect(parts).toEqual({ 'rain-drops': true, 'rain-rings': true, lampPools: false, find: true });
    expectFreed(tracked);
  });

  it('a sunset Park walk with a find: the amber lawns and the find are freed', () => {
    const { w, getSession } = lifecycle({ save: pastTheGuidedWalk });
    const { tracked, built, parts } = walkOnce(w, getSession, { area: 'park', seed: seedFor('sunset') });
    expect(built).toEqual({ weather: 'sunset', dusk: false, find: true, lesson: null });
    expect(parts).toEqual({ 'rain-drops': false, 'rain-rings': false, lampPools: false, find: true });
    expectFreed(tracked);
  });

  it('a dusk Park walk in the glow collar with a find: the lamp pools, the dusk lawns and the find are freed', () => {
    const { w, getSession } = lifecycle({ save: wearingGlowCollar });
    const { tracked, built, parts } = walkOnce(w, getSession, { area: 'park', duskMode: true, seed: seedFor('clear') });
    // Dusk has no weather: the walk never rolls it.
    expect(built).toEqual({ weather: 'clear', dusk: true, find: true, lesson: null });
    expect(parts).toEqual({ 'rain-drops': false, 'rain-rings': false, lampPools: true, find: true });
    expectFreed(tracked);
  });

  it('a rainy walk then a dusk walk on one lifecycle: each is freed, the shared ones kept', () => {
    const { w, getSession, progression } = lifecycle({ save: wearingGlowCollar });
    expectFreed(walkOnce(w, getSession, { area: 'park', seed: seedFor('rain') }).tracked);
    expectFreed(walkOnce(w, getSession, { area: 'park', duskMode: true, seed: seedFor('clear') }).tracked);
    expect(progression.state.equipped.collar).toBe('glow');
  });
});

describe('the renderer\'s memory counts at each walk end', () => {
  it('endWalk notes one reading into the diagnostics', () => {
    const info = { memory: { geometries: 3, textures: 2 }, programs: [1, 2] };
    const renderer = anything({ info });
    const { w } = lifecycle({ renderer });
    w.startWalk({ duskMode: false });
    expect(diagnostics.memory()).toEqual([]);
    w.endWalk();
    expect(diagnostics.memory()).toEqual([expect.objectContaining({ geometries: 3, textures: 2, programs: 2 })]);
  });
});
