// walk.js's createWalkLifecycle booted headless, as test/walkfreed.test.js
// boots it, for the Rooftops' walk tests (test/roofswalk.test.js and
// test/roofsload.test.js). The lifecycle's own dependencies (the lighting rig,
// the sound, the music, the cloud) are recorders. A test file's vi.mock calls
// still reach the modules walk.js imports from here.
import * as THREE from 'three';
import { expect } from 'vitest';
import { createWalkLifecycle } from '../../src/game/walk.js';
import { createProgression } from '../../src/progression.js';
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

// A save past the guided first walk, with the Glow Collar bought, and on
// when `collar` says so.
export function lifecycle({ collar = false } = {}) {
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

