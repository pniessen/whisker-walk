// walk.js's createWalkLifecycle booted headless, as test/walkfreed.test.js
// boots it, for the Rooftops' walk tests (test/roofswalk.test.js and
// test/roofsload.test.js) and the loading tests (test/walkready.test.js). The
// lifecycle's own dependencies (the lighting rig, the sound, the music, the
// cloud, the home screen, the home toast, a page reload) are recorders. A test
// file's vi.mock calls still reach the modules walk.js imports from here,
// the area modules included (vi.mock applies to dynamic imports too).
import * as THREE from 'three';
import { expect } from 'vitest';
import { createWalkLifecycle } from '../../src/game/walk.js';
import { AREA_LOADERS } from '../../src/world/areas.js';
import { createAreaLoader } from '../../src/game/areaload.js';
import { createProgression } from '../../src/progression.js';
import { createDiscoveryLog } from '../../src/discoveries.js';
import { resolveQuality } from '../../src/render/quality.js';

export function memStorage() {
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
export function fakeEl() {
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

// An area loader (game/areaload.js) over the real packs (world/areas.js)
// whose loads the test holds and lets go: hold(id) makes the next loads of
// that place wait until release() (or fail()). calls[id] counts the loads
// actually begun.
export function controlledLoader() {
  const calls = {};
  const held = new Map();
  const loaders = Object.fromEntries(Object.entries(AREA_LOADERS).map(([id, load]) => [id, () => {
    calls[id] = (calls[id] ?? 0) + 1;
    const h = held.get(id);
    return h ? h.promise.then(load) : load();
  }]));
  function hold(id) {
    let release;
    let fail;
    const promise = new Promise((res, rej) => { release = res; fail = rej; });
    promise.catch(() => {}); // a failed hold nobody asked for again is not an unhandled rejection
    const h = { release: () => release(), fail: (err = new Error('offline')) => fail(err), promise };
    held.set(id, h);
    return h;
  }
  return { areas: createAreaLoader({ loaders }), calls, hold, letGo: (id) => held.delete(id) };
}

// A save past the guided first walk, with the Glow Collar bought, and on
// when `collar` says so. `areas` is the walk's area loader (a fresh one, with
// nothing loaded, by default); `online` answers isOnline.
// `blockList`: the hidden visitors (src/blocklist.js), a Set of player ids.
// `storage`: the save's storage (a fresh one by default; a test may seed a
// save in it first). `coarse`: the device's pointer. `tier`: the quality tier
// every walk begins on (HIGH by default). `settings`: extra Settings values by key (null otherwise). `player`: the walk's player (no-ops by
// default; a test may record what the walk hands it). `log`: the discovery log (a
// recorder by default; a test may hand a real one). `realLog`: the walk gets a
// real discovery log (discoveries.js, as main.js makes one) instead of a
// recorder, so what it pays is kept and counted. The overlay is handed back so a
// test can read the summary card a walk's end writes into it.
export function lifecycle({
  collar = false, areas = createAreaLoader(), online = () => true, blockList = new Set(),
  storage = memStorage(), coarse = false, tier = resolveQuality({ override: 'high' }),
  player = anything(), log: givenLog = null, realLog = false, settings: extraSettings = {},
} = {}) {
  let session = null;
  let pendingRoom = null;
  const rec = { lighting: [], sound: [], music: [], roomStarts: [], friendFetches: 0, gettingReady: [], toasts: [], reloads: 0, soundContexts: 0 };
  const progression = createProgression(storage);
  progression.setTutorialFirst('done');
  progression.addPoints(1000);
  expect(progression.buy('accessories', 'glow')).toBe(true);
  if (collar) progression.equipAccessory('glow');
  const homebase = anything({ setGettingReady: (on) => rec.gettingReady.push(on) });
  const camera = new THREE.PerspectiveCamera(); // the walk's camera, as walk.js places it at the start
  const overlay = anything({ classList: anything() });
  const hud = anything({ mapHost: fakeEl() });
  const log = givenLog ?? (realLog ? createDiscoveryLog(progression) : anything());
  const w = createWalkLifecycle({
    // MP on, so a solo walk asks the cloud for friends who could visit as ghosts
    MP: true, pid: 'me', coarse, envMap: new THREE.Texture(), overlay, blockList,
    renderer: null, camera,
    composerRig: anything({ applyLighting: (_scene, o) => rec.lighting.push(o.dusk) }),
    player, progression,
    settings: { get: (k) => (k === 'muted' ? true : extraSettings[k] ?? null) },
    hud,
    audio: anything({ startAmbient: (areaId, o) => rec.sound.push({ areaId, ...o }), getContext: () => { rec.soundContexts++; } }),
    music: anything({ start: (_seed, mood) => rec.music.push(mood) }),
    log, touchUI: anything(), catVoice: () => {},
    getCloud: () => ({ fetchFriendships: async () => { rec.friendFetches++; return []; }, fetchProfiles: async () => [] }),
    getSession: () => session, setSession: (s) => { session = s; }, getIsTouch: () => false,
    getHomebase: () => homebase,
    getPendingRoom: () => pendingRoom, clearPendingRoom: () => { pendingRoom = null; }, pushProfileNow: () => {},
    startRoomTogether: (o) => rec.roomStarts.push(o),
    awardStrayGreet: () => {}, applyRemoteEvent: () => {},
    qualityAdapter: { beginWalk: () => ({ ...tier, postFx: false }) },
    denShop: null,
    areas,
    homeToast: (text) => rec.toasts.push(text),
    reloadPage: () => { rec.reloads++; },
    isOnline: online,
  });
  return { w, rec, progression, hud, log, player, areas, camera, overlay, getSession: () => session, setPendingRoom: (r) => { pendingRoom = r; } };
}

