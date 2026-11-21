// A whole walk lifecycle, headless: createWalkLifecycle (src/game/walk.js)
// over a real progression and real area builds, with every dependency the
// walk only calls stood in by a no-op. Lifted from test/walkfreed.test.js
// (which imports it) so test/walkon.test.js walks the same way.
//
// No jsdom: the test sets globalThis.document = fakeDocument() first.
// Every place is its own download (F6): the default loader is `areas` below,
// and a test file ensures the places it walks in a beforeAll, so a start runs
// in the same tick. A test that wants a place to be slow, or to fail, hands
// its own loader in.
import * as THREE from 'three';
import { createWalkLifecycle } from '../../src/game/walk.js';
import { createAreaLoader } from '../../src/game/areaload.js';
import { createProgression } from '../../src/progression.js';
import { resolveQuality } from '../../src/render/quality.js';

export function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

// The headless canvas stub the world tests use (see test/den.test.js), with
// measureText for the cats' name tags.
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
export function fakeEl() {
  return {
    width: 0, height: 0, getContext: fakeContext,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {},
    setAttribute() {}, appendChild() {}, insertBefore() {}, addEventListener() {}, removeEventListener() {},
    remove() {}, contains: () => false, querySelector: () => fakeEl(), querySelectorAll: () => [],
  };
}
export function fakeDocument() {
  return {
    body: fakeEl(), createElement: fakeEl, getElementById: () => null,
    addEventListener() {}, removeEventListener() {},
  };
}

// A dependency the walk only calls: every property is a no-op function, apart
// from the few given values it reads as values.
export const anything = (values = {}) => new Proxy(values, {
  get: (target, key) => (key in target ? target[key] : () => undefined),
  set: (target, key, v) => { target[key] = v; return true; },
});

// The app's one environment map, made once by main.js and handed to every walk.
export const envMap = new THREE.Texture();
envMap.name = 'test env map';

// The default loader: a real one, shared by every harness in a test file.
export const areas = createAreaLoader();

// A plain overlay the test can read: its innerHTML and its classes.
function fakeOverlay() {
  const classes = new Set();
  return {
    innerHTML: '',
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      toggle: (c, on = !classes.has(c)) => (on ? classes.add(c) : classes.delete(c), on),
      contains: (c) => classes.has(c),
    },
    querySelector: () => null, querySelectorAll: () => [],
  };
}

// walkHarness(opts) -> { w, getSession, progression, overlay, storage, toasts, homeToasts, reloads, camera }
//   (toasts: the walk's hud lines; homeToasts: the home screen's; reloads():
//   how many times the walk asked for a fresh start of the page)
//   save(progression)  shapes the save before any walk
//   renderer           handed to the walk (null: no memory reading)
//   pendingRoom        the room getPendingRoom answers until clearPendingRoom
//   onWalkedOn, onWalkEnded   the walk's two hooks
//   areas              the area loader (default: the shared one above)
//   isOnline           () -> whether the device is online (default: true)
//   pid                this device's player id (default: 'me')
//   applyRemoteEvent   (s, ev) for every room event the walk hears (default: none)
//   blockList          the ids this device has hidden (default: none)
//   isTouch            a touch device (default: false); player, homebase: the
//                      walk's player and home screen (default: no-ops)
export function walkHarness({
  save = () => {}, renderer = null, pendingRoom = null,
  onWalkedOn = () => {}, onWalkEnded = () => {},
  areas: loader = areas, isOnline = () => true,
  pid = 'me', applyRemoteEvent = () => {}, blockList = new Set(),
  isTouch = false, player = anything(), homebase = anything(),
} = {}) {
  let session = null;
  let room = pendingRoom;
  const storage = memStorage();
  const progression = createProgression(storage);
  save(progression);
  const overlay = fakeOverlay();
  const toasts = [];
  const homeToasts = [];
  let reloads = 0;
  const camera = new THREE.PerspectiveCamera();
  const w = createWalkLifecycle({
    MP: false, pid, coarse: false, envMap, overlay, blockList,
    renderer, camera, composerRig: anything(),
    player, progression,
    settings: { get: (k) => (k === 'muted' ? true : null) },
    hud: anything({ mapHost: fakeEl(), toast: (t) => toasts.push(t) }),
    audio: anything(), music: anything(), log: anything(), touchUI: anything(),
    catVoice: () => {},
    getCloud: () => null, getSession: () => session, setSession: (s) => { session = s; }, getIsTouch: () => isTouch,
    getHomebase: () => homebase,
    getPendingRoom: () => room, clearPendingRoom: () => { room = null; }, pushProfileNow: () => {},
    startRoomTogether: () => {},
    awardStrayGreet: () => {}, applyRemoteEvent,
    // HIGH, so the walk builds everything a tier can add (normal maps, grass,
    // shadows); no post-processing, which needs a real renderer.
    qualityAdapter: { beginWalk: () => ({ ...resolveQuality({ override: 'high' }), postFx: false }) },
    denShop: null,
    onWalkedOn, onWalkEnded,
    areas: loader,
    homeToast: (t) => homeToasts.push(t),
    reloadPage: () => { reloads += 1; },
    isOnline,
  });
  return { w, getSession: () => session, progression, overlay, storage, toasts, homeToasts, reloads: () => reloads, camera, getRoom: () => room };
}
