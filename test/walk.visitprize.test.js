import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A prize held for the tap (styles A and C) must be on the cat for a walk
// that starts while its celebration is still up. walk.js's startWalk is the
// one place every walk goes through (solo Start, the den, a room start), so
// it wears the prize before it reads state.equipped. buildCat is stubbed to
// record the outfit the walk's avatar is built from, then stop the walk:
// nothing past the avatar matters here.
const STOP = new Error('stop: avatar built');
const built = [];
vi.mock('../src/cat/model.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    buildCat: (breed, accessories) => {
      // The player's avatar is the first cat a walk builds.
      built.push({ breed, accessories });
      throw STOP;
    },
  };
});

const { createWalkLifecycle } = await import('../src/game/walk.js');
const { createProgression } = await import('../src/progression.js');
const { resolveQuality } = await import('../src/render/quality.js');

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

// No jsdom here. walk.js mounts its skill-unlock card on document.body, and
// the world builders paint their texture tiles on canvases: the same headless
// canvas stub the world tests use (see test/den.test.js for why each answer).
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

function withPendingPrize() {
  const progression = createProgression(memStorage());
  const visit = progression.recordVisit(); // visit 1: a present held for the tap
  const prize = visit.milestone.prize;
  expect(progression.state.visitPrizePending).toBe(prize.id);
  expect(progression.state.equipped[prize.slot]).not.toBe(prize.id);
  return { progression, prize };
}

function avatarOf(start, progression) {
  built.length = 0;
  try { start(); } catch (err) { if (err !== STOP) throw err; }
  expect(built.length).toBeGreaterThan(0);
  // the first cat built is the player's avatar, not some other cat in the area
  expect(built[0].breed).toBe(progression.state.equipped.cat);
  return built[0].accessories;
}

beforeEach(() => { built.length = 0; globalThis.document = fakeDocument(); });
afterEach(() => { delete globalThis.document; });

describe('a walk started over a held visit prize', () => {
  it('the den walk builds the avatar wearing the prize', () => {
    const { progression, prize } = withPendingPrize();
    const w = lifecycle(progression);
    expect(avatarOf(() => w.beginDenWalk(), progression)[prize.slot]).toBe(prize.id);
    expect(progression.state.visitPrizePending).toBe(null);
  });

  it('solo Start builds the avatar wearing the prize', () => {
    const { progression, prize } = withPendingPrize();
    const w = lifecycle(progression);
    expect(avatarOf(() => w.beginWalkFromHomebase({ duskMode: false }), progression)[prize.slot]).toBe(prize.id);
  });

  it('a room start (rooms.js calls startWalk with the room seed) builds it wearing the prize', () => {
    const { progression, prize } = withPendingPrize();
    const w = lifecycle(progression);
    expect(avatarOf(() => w.startWalk({ duskMode: false, roomSeed: 1234 }), progression)[prize.slot]).toBe(prize.id);
  });

  it('nothing pending: the outfit is left exactly as it was', () => {
    const progression = createProgression(memStorage());
    const before = JSON.stringify(progression.state.equipped);
    const w = lifecycle(progression);
    avatarOf(() => w.beginDenWalk(), progression);
    expect(JSON.stringify(progression.state.equipped)).toBe(before);
  });
});
