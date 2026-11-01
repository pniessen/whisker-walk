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
vi.mock('../src/world/pines.js', (orig) => stubBuild('pines', orig));

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

// A Legacy save whose chosen place is the Pines (two River walks open it).
function inThePines(edition) {
  const progression = createProgression(memStorage());
  progression.completeWalk('neighborhood');
  progression.completeWalk('neighborhood');
  expect(progression.buy('areas', 'woods')).toBe(true);
  progression.completeWalk('woods');
  progression.completeWalk('woods');
  expect(progression.buy('areas', 'river')).toBe(true);
  progression.completeWalk('river');
  progression.completeWalk('river');
  expect(progression.buy('areas', 'pines')).toBe(true);
  progression.setArea('pines');
  progression.setEdition(edition);
  return progression;
}

beforeEach(() => { builtAreas.length = 0; globalThis.document = fakeDocument(); });
afterEach(() => { delete globalThis.document; });

describe('a Legacy walk', () => {
  it('the rival patrol is gated on the edition and the picks', () => {
    const src = readFileSync('src/game/walk.js', 'utf8');
    expect(src).toMatch(/const picks = picksOf\(progression\.state\);/);
    expect(src).toMatch(/rivalForWalk\(areaId, progression\.state\.edition, picks\)/);
    expect(src).toMatch(/createRivalPatrol\(scene, areaId, \{\s*picks,/);
    expect(src).toMatch(/createMarkContest\(\{\s*picks,/);
    expect(src).not.toMatch(/\brivalFor\(/);
    // picks is computed before the rival's branch, not inside it
    expect(src.indexOf('const picks = picksOf(')).toBeLessThan(src.indexOf("The rival's border and its patrol"));
  });

  it('at home there is no hostile patrol (Clan Life Task 5)', () => {
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    const line = 'const clanHome = clanHomeFor(areaId, progression.state.edition, picks);';
    expect(src).toContain(line);
    expect(src.indexOf(line)).toBeLessThan(src.indexOf("The rival's border and its patrol"));
    expect(src.indexOf(line)).toBeGreaterThan(src.indexOf('const picks = picksOf('));
    expect(src).toContain('if (isDen || clanHome || !rivalForWalk(');
    expect(src).toContain('session.clanHome = clanHome;');
    expect(src).toContain('clanPaid: { friend: 0, boop: 0, patrol: 0 }');
  });

  it('the home welcome is gated on the den, comes from homeWelcome and sits on the Ready card', () => {
    const src = readFileSync('src/game/walk.js', 'utf8');
    expect(src).toMatch(/isDen \? null : homeWelcome\(areaId, progression\.state\)/);
    expect(src).not.toContain('hud.toast(welcome)');
    expect(src).toMatch(/<h1>Ready\?<\/h1>\s*\$\{welcome \? `<p class="home-welcome">/);
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

  it('a Legacy kid whose place is the Pines walks the Neighborhood and keeps the Pines', () => {
    const progression = inThePines('legacy');
    const life = lifecycle(progression);
    expect(() => life.beginWalkFromHomebase({})).toThrow(STOP);
    expect(builtAreas).toEqual(['neighborhood']);
    expect(progression.state.area).toBe('pines');
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

// Clan Life Part 1, Task 3: the territory's clan in the walk. The harness
// stops inside the area build, so these are source pins.
describe('the clan in the walk (source pins)', () => {
  const src = () => readFileSync('src/game/walk.js', 'utf8');

  it('spawns the loners, not tier.strays, and counts the fed cats first', () => {
    const s = src();
    // Kittypets (ruling R2, amended): the wanderer takes an ordinary loner's slot.
    const strays = s.indexOf('const loners = isDen ? 0 : lonersFor(areaId, tier.strays, fedHere);');
    expect(s.indexOf('createStrayCats(scene, areaData, strayCount, strayStream(roomSeed)')).toBeGreaterThan(strays);
    const clan = s.indexOf('castFor(areaId).slice(0, clanCountFor(tier.strays, fedHere))');
    const fed = s.indexOf('const fedHere = colonyCats.length;');
    expect(strays).toBeGreaterThan(-1);
    expect(clan).toBeGreaterThan(-1);
    expect(fed).toBeGreaterThan(-1);
    expect(fed).toBeLessThan(strays);
    expect(fed).toBeLessThan(clan);
    expect(s.match(/lonersFor\(/g)).toHaveLength(1);   // the one count createStrayCats is handed
    for (const call of s.match(/createStrayCats\([^)]*\)/g) ?? []) {
      expect(call.replace('lonersFor(areaId, tier.strays', '')).not.toContain('tier.strays');
    }
  });

  it('names the clan cats only in Clan Edition', () => {
    const s = src();
    const call = s.slice(s.indexOf('createClanCats(scene,'), s.indexOf('NO_CLAN_CATS', s.indexOf('createClanCats(scene,')));
    expect(call).toContain('showNames: isClanEdition(');
  });

  it('joins campMarker to the session literal, never assigned before it exists', () => {
    const w = readFileSync('src/game/walk.js', 'utf8');
    const literal = w.indexOf('const session = {');
    expect(w.slice(0, literal)).not.toMatch(/session\.campMarker\s*=/);
    expect(w.slice(literal, literal + 4000)).toMatch(/\bcampMarker,/);
    expect(readFileSync('src/main.js', 'utf8')).toContain('mapFrame.camp = session.campMarker');
  });

  it('joins clanCats to the session literal, never assigned before it exists', () => {
    const s = src();
    const literal = s.indexOf('const session = {');
    expect(literal).toBeGreaterThan(-1);
    expect(s.slice(0, literal)).not.toMatch(/session\.clanCats\s*=/);
    const body = s.slice(literal, s.indexOf('};', literal));
    expect(body).toMatch(/\bclanCats,/);
    expect(s).toContain('session.clanCats.dispose()');
  });

  it('the clan walks on the map as built: clan ground, frozen before the scratch posts', () => {
    const s = src();
    const posts = s.indexOf('for (const p of playerMarks.posts) areaData.colliders.push(');
    expect(posts).toBeGreaterThan(-1);
    for (const pin of ['clanWalkableFor(clanArea, areaId)', 'roamHomes(areaId, clanArea, clanWalkable)', 'Object.freeze(areaData.colliders.map(']) {
      const at = s.indexOf(pin);
      expect(at, pin).toBeGreaterThan(-1);
      expect(at, pin).toBeLessThan(posts);
    }
    expect(s).toContain('isWalkable: clanWalkable');
  });

  it('the clan cats get contact decals and are spawned before the shadow sweep', () => {
    const s = src();
    expect(s).toMatch(/for \(const c of clanCats\.list\) decals\.follow\(c\.group\);/);
    expect(s.indexOf('createClanCats(scene,')).toBeLessThan(s.indexOf('assignShadowCasters(scene);'));
  });

  it('main.js updates the clan beside the strays', () => {
    const m = readFileSync('src/main.js', 'utf8');
    const strays = m.indexOf('session.strayCats.update(');
    const clan = m.indexOf('session.clanCats.update(wdt, t, session.cat.position)');
    expect(clan).toBeGreaterThan(strays);
    expect(strays).toBeGreaterThan(-1);
  });
});
