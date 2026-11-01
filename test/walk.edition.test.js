import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

// Clan Edition Task 8: a Legacy walk goes quiet. A Legacy kid whose chosen
// place is the Woods walks the Neighborhood, solo or in a room, and keeps the
// Woods as their place. The area builders are stubbed to record which area a
// walk builds, then stop it: the area is built before anything else that
// matters here (walk.js, the AREAS[areaId].build call).
// vi.mock is hoisted above plain consts, so the shared pieces are hoisted too.
const { STOP, builtAreas, stubBuild } = vi.hoisted(() => {
  const STOP = new Error('stop: area built');
  const builtAreas = [];
  const stubBuild = async (id, orig) => {
    const real = await orig();
    return { ...real, build: () => { builtAreas.push(id); throw STOP; } };
  };
  return { STOP, builtAreas, stubBuild };
});
vi.mock('../src/world/neighborhood.js', (orig) => stubBuild('neighborhood', orig));
vi.mock('../src/world/woods.js', (orig) => stubBuild('woods', orig));
vi.mock('../src/world/river.js', (orig) => stubBuild('river', orig));
vi.mock('../src/world/moor.js', (orig) => stubBuild('moor', orig));

const { createWalkLifecycle } = await import('../src/game/walk.js');
const { createProgression } = await import('../src/progression.js');
const { resolveQuality } = await import('../src/render/quality.js');

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

// No jsdom here: the same headless canvas stub as test/walk.visitprize.test.js.
function fakeContext() {
  return new Proxy({}, {
    get: (_target, key) => {
      if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
      return () => {};
    },
    set: () => true,
  });
}
function fakeDocument() {
  const el = () => ({
    width: 0, height: 0, getContext: fakeContext,
    classList: { add() {}, remove() {}, contains: () => false }, style: {},
    setAttribute() {}, appendChild() {}, addEventListener() {}, remove() {}, querySelector: () => null,
  });
  return { body: el(), createElement: el, getElementById: () => null };
}

function lifecycle(progression, { pendingRoom = null, startRoomTogether = vi.fn() } = {}) {
  return createWalkLifecycle({
    MP: false, pid: 'me', coarse: false, envMap: null, overlay: null, blockList: new Set(),
    renderer: null, camera: null, composerRig: { ensure() {}, attachScene() {} },
    player: null, progression,
    settings: { get: () => null },
    hud: null, audio: null, music: null, log: null, touchUI: null, catVoice: () => {},
    getCloud: () => null, getSession: () => null, setSession: () => {}, getIsTouch: () => false,
    getHomebase: () => ({ hide() {} }),
    getPendingRoom: () => pendingRoom, clearPendingRoom: () => {}, pushProfileNow: () => {},
    startRoomTogether,
    awardStrayGreet: () => {}, applyRemoteEvent: () => {},
    qualityAdapter: { beginWalk: () => ({ ...resolveQuality({ reducedMotion: true, override: 'low' }), postFx: false }) },
    denShop: null,
  });
}

// A save unlocked into the Woods and standing there, on the given edition.
function inTheWoods(edition) {
  const progression = createProgression(memStorage());
  progression.completeWalk('neighborhood');
  progression.completeWalk('neighborhood');
  expect(progression.buy('areas', 'woods')).toBe(true);
  progression.setArea('woods');
  progression.setEdition(edition);
  return progression;
}

// A Legacy save whose chosen place is the River (the Woods first: two Woods walks open it).
function inTheRiver(edition) {
  const progression = createProgression(memStorage());
  progression.completeWalk('neighborhood');
  progression.completeWalk('neighborhood');
  expect(progression.buy('areas', 'woods')).toBe(true);
  progression.completeWalk('woods');
  progression.completeWalk('woods');
  expect(progression.buy('areas', 'river')).toBe(true);
  progression.setArea('river');
  progression.setEdition(edition);
  return progression;
}

// A Legacy save whose chosen place is the Moor (two Woods walks open it too).
function inTheMoor(edition) {
  const progression = createProgression(memStorage());
  progression.completeWalk('neighborhood');
  progression.completeWalk('neighborhood');
  expect(progression.buy('areas', 'woods')).toBe(true);
  progression.completeWalk('woods');
  progression.completeWalk('woods');
  expect(progression.buy('areas', 'moor')).toBe(true);
  progression.setArea('moor');
  progression.setEdition(edition);
  return progression;
}

beforeEach(() => { builtAreas.length = 0; globalThis.document = fakeDocument(); });
afterEach(() => { delete globalThis.document; });

describe('a Legacy walk', () => {
  it('the rival patrol is gated on the edition', () => {
    const src = readFileSync('src/game/walk.js', 'utf8');
    expect(src).toContain('rivalForWalk(areaId, progression.state.edition)');
    expect(src).not.toMatch(/\brivalFor\(/);
  });

  it('the dock names the place for the edition', () => {
    const src = readFileSync('src/game/walk.js', 'utf8');
    expect(src).toContain('hud.setArea(placeName(areaId, progression.state.edition, CATALOG) || areaData.name)');
  });

  it('a Legacy kid whose place is the Woods walks the Neighborhood and keeps the Woods', () => {
    const progression = inTheWoods('legacy');
    const life = lifecycle(progression);
    expect(() => life.beginWalkFromHomebase({})).toThrow(STOP);
    expect(builtAreas).toEqual(['neighborhood']);
    expect(progression.state.area).toBe('woods');
  });

  it('a Legacy kid whose place is the River walks the Neighborhood and keeps the River', () => {
    const progression = inTheRiver('legacy');
    const life = lifecycle(progression);
    expect(() => life.beginWalkFromHomebase({})).toThrow(STOP);
    expect(builtAreas).toEqual(['neighborhood']);
    expect(progression.state.area).toBe('river');
  });

  it('a Legacy kid whose place is the Moor walks the Neighborhood and keeps the Moor', () => {
    const progression = inTheMoor('legacy');
    const life = lifecycle(progression);
    expect(() => life.beginWalkFromHomebase({})).toThrow(STOP);
    expect(builtAreas).toEqual(['neighborhood']);
    expect(progression.state.area).toBe('moor');
  });

  it('in Clan Edition the same save walks the Woods', () => {
    const progression = inTheWoods('canon');
    const life = lifecycle(progression);
    expect(() => life.beginWalkFromHomebase({})).toThrow(STOP);
    expect(builtAreas).toEqual(['woods']);
    expect(progression.state.area).toBe('woods');
  });

  it('a Legacy room start proposes the Neighborhood', () => {
    const progression = inTheWoods('legacy');
    const startRoomTogether = vi.fn();
    const life = lifecycle(progression, { pendingRoom: {}, startRoomTogether });
    life.beginWalkFromHomebase({});
    expect(startRoomTogether).toHaveBeenCalledWith({ area: 'neighborhood', dusk: false });
    expect(progression.state.area).toBe('woods');
  });

  it('a Clan Edition room start proposes the Woods', () => {
    const progression = inTheWoods('canon');
    const startRoomTogether = vi.fn();
    const life = lifecycle(progression, { pendingRoom: {}, startRoomTogether });
    life.beginWalkFromHomebase({ duskMode: true });
    expect(startRoomTogether).toHaveBeenCalledWith({ area: 'woods', dusk: true });
  });
});
