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

  it('intruders come after the session literal and the clanHome line, named only in Clan Edition', () => {
    const s = src();
    const at = s.indexOf('session.intruders = ');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(s.indexOf('const session = {'));
    expect(at).toBeGreaterThan(s.indexOf('const clanHome = '));
    expect(s.slice(0, at)).not.toMatch(/session\.intruders\s*=/);
    const call = s.slice(at, s.indexOf('NO_INTRUDERS', at));
    expect(call).toContain('createIntruders(scene, areaId,');
    expect(call).toContain('!isDen');
    expect(call).toContain('showNames: isClanEdition(');
    expect(call).toContain('isHostile({ clan }, { clanHome, picks })');
    expect(call).toContain('audio.hiss()');
    const build = call.slice(call.indexOf('onBuild'));
    expect(build).toContain('assignShadowCastersFor(');
    // R10: the decals follow the intruders' one anchor, once per walk, never a visit's cat
    expect(build).not.toContain('decals.follow(');
    const follow = 'decals.follow(session.intruders.anchor, INTRUDER_DECAL_RADIUS)';
    expect(s.split(follow)).toHaveLength(2);
    expect(s.indexOf(follow)).toBeGreaterThan(at);
    expect(s).toContain('session.intruders.dispose()');
  });

  it('the clan fight is built only at home, over the intruders, and ends before they are disposed', () => {
    const s = src();
    const at = s.indexOf('session.clanFight = ');
    expect(at).toBeGreaterThan(s.indexOf('session.intruders = '));
    expect(s.slice(0, at)).not.toMatch(/session\.clanFight\s*=/);
    const line = s.slice(at, s.indexOf('NO_CLAN_FIGHT', at));
    expect(line).toMatch(/^session\.clanFight = session\.clanHome && session\.intruders !== NO_INTRUDERS\s*\?/);
    expect(s.split('createClanFight(')).toHaveLength(2);
    expect(line).toContain('createClanFight(');
    expect(line).toContain('PERSONALITIES[cat.userData.breed]?.special');
    // R3: the clan cats' own ground predicate, and no progression
    expect(line).toContain('isGround: clanWalkable');
    expect(line).not.toContain('progression');
    const abort = s.indexOf('session.clanFight.abort()');
    expect(abort).toBeGreaterThan(s.indexOf('function endWalk('));
    expect(abort).toBeLessThan(s.indexOf('session.intruders.dispose()'));
    // its intruder-done goes out while the room is still joined: before leave()
    const leave = s.indexOf('net.leave()', s.indexOf('function endWalk('));
    expect(leave).toBeGreaterThan(-1);
    expect(abort).toBeLessThan(leave);
    expect(s.split('session.clanFight.abort()')).toHaveLength(2);
  });

  it('a co-walker who leaves the room lets go of the intruder at once', () => {
    const s = readFileSync('src/game/walk.js', 'utf8');
    const roster = s.slice(s.indexOf('net.onRoster('), s.indexOf('net.onState('));
    expect(roster).toMatch(/if \(!liveIds\.has\(r\.playerId\)\) \{ remotes\.remove\(r\.playerId\); session\.intruders\.dropHolder\(r\.playerId\); \}/);
  });

  it('Legacy never shows the panel: it can never be at home', async () => {
    const { clanHomeFor } = await import('../src/clancast.js');
    expect(clanHomeFor('woods', 'legacy', ['woods'])).toBe(false);
    expect(clanHomeFor('woods', 'canon', ['woods'])).toBe(true);
  });

  it('main.js updates the clan fight after the rival and the dog', () => {
    const m = readFileSync('src/main.js', 'utf8');
    const dog = m.indexOf('session.dog.update(');
    const cf = m.indexOf('session.clanFight.update(dt, session)');
    expect(dog).toBeGreaterThan(m.indexOf('session.rival.update('));
    expect(cf).toBeGreaterThan(dog);
    expect(cf).toBeLessThan(m.indexOf('updateAvatar(session, dt, t)'));
  });

  it('main.js runs the fight camera after the fight places the cats and before the shadows read the camera', () => {
    const m = readFileSync('src/main.js', 'utf8');
    const cf = m.indexOf('session.clanFight.update(dt, session)');
    const cam = m.indexOf('session.fightCam?.update(dt, {');
    expect(cam).toBeGreaterThan(cf);
    expect(cam).toBeLessThan(m.indexOf('session.shadows.update('));
    const call = m.slice(cam, m.indexOf('});', cam));
    expect(call).toContain('subject: session.clanFight.cameraSubject');
    expect(call).toContain('cameraMode: session.cameraMode');
    expect(m.split('session.fightCam?.update(')).toHaveLength(2);
  });

  it('walk.js builds the fight camera from the area\'s trees only where a fight can happen, and lets it go at the end', () => {
    const s = readFileSync('src/game/walk.js', 'utf8');
    const at = s.indexOf('session.fightCam = ');
    expect(at).toBeGreaterThan(s.indexOf('session.clanFight = '));
    const line = s.slice(at, s.indexOf(';\n', at));
    expect(line).toContain('session.clanFight !== NO_CLAN_FIGHT');
    expect(line).toContain('findOccluders(scene)');
    expect(line).toContain('reducedMotion');
    const end = s.indexOf('session.fightCam?.dispose()');
    expect(end).toBeGreaterThan(s.indexOf('session.clanFight.abort()'));
  });

  it("main.js's keydown hands every key to the fight sheet first", () => {
    const m = readFileSync('src/main.js', 'utf8');
    const at = m.indexOf("document.addEventListener('keydown', (e) => {");
    expect(at).toBeGreaterThan(-1);
    const body = m.slice(at, m.indexOf('\n  });', at));
    const gate = body.indexOf("if (session?.clanFight?.uiShowing === 'fight') {");
    expect(gate).toBeGreaterThan(-1);
    const block = body.slice(gate, body.indexOf('\n    }', gate));
    // modifier combos pass to the browser untouched; the rest are swallowed
    // and reach the fight only while the walk is being played: from the pause
    // card nothing is swallowed (Enter / Space on its buttons, F5 work)
    expect(block).toContain('if (e.metaKey || e.ctrlKey || e.altKey) return;');
    const engaged = block.indexOf('if (player.engaged) {');
    expect(engaged).toBeGreaterThan(block.indexOf('e.altKey'));
    const inner = block.slice(engaged, block.indexOf('\n      }', engaged));
    expect(inner).toContain('e.preventDefault();');
    expect(block.split('e.preventDefault()')).toHaveLength(2);   // only the engaged one
    // a held key's repeats answer nothing
    expect(inner).toContain('if (!e.repeat) session.clanFight.key(e.key);');
    expect(block).toContain('return;');
    for (const branch of ["e.code === 'KeyE'", "e.code === 'Space'", 'phraseIdForDigit(', "e.code === 'KeyM'"]) {
      expect(body.indexOf(branch)).toBeGreaterThan(gate);
    }
    // the pill: E and Q go to it, before E's own interact
    const pill = body.indexOf("session?.clanFight?.uiShowing === 'challenge'");
    expect(pill).toBeGreaterThan(gate);
    expect(pill).toBeLessThan(body.indexOf("e.code === 'KeyE' && session"));
  });

  it('main.js updates the intruders right after the clan', () => {
    const m = readFileSync('src/main.js', 'utf8');
    const clan = m.indexOf('session.clanCats.update(wdt, t, session.cat.position)');
    const intr = m.indexOf('session.intruders.update(dt, session.cat.position)');
    expect(intr).toBeGreaterThan(clan);
    expect(m.slice(clan, intr).split('\n')).toHaveLength(2);
  });
});

// Border crossings Task 3: the Clan-only posts and footpath (source pins; the
// harness above stops inside the area build).
describe('the border dressing in the walk (source pins)', () => {
  const src = () => readFileSync('src/game/walk.js', 'utf8');

  it('is added after the build and before the contact shadows, Clan Edition only', () => {
    const s = src();
    const build = s.indexOf('AREAS[areaId].build(');
    const call = s.search(/addBorderDressing\(scene, areaId(, \{ ground \})?\)/);
    expect(call).toBeGreaterThan(build);
    expect(call).toBeLessThan(s.indexOf('createContactShadows('));
    expect(s).toMatch(/const dressing = !isDen && isClanEdition\(state\) \? addBorderDressing\(scene, areaId(, \{ ground \})?\) : null;/);
  });

  it('its colliders join the live list after clanArea is frozen and clearSpot, beside the scratch posts', () => {
    const s = src();
    const push = s.indexOf('for (const c of dressing?.colliders ?? []) areaData.colliders.push({ ...c });');
    expect(push).toBeGreaterThan(s.indexOf('const clanArea = '));
    expect(push).toBeGreaterThan(s.indexOf('clearSpot('));
    const scratch = s.indexOf('for (const p of playerMarks.posts) areaData.colliders.push');
    expect(Math.abs(push - scratch)).toBeLessThan(900);
  });
});

// Border crossings Task 6: the walk ends with a crossing (source pins).
describe('a crossing ends the walk the normal way (source pins)', () => {
  const src = () => readFileSync('src/game/walk.js', 'utf8');

  it('endWalk takes { crossTo, ledBy, together } and tolerates a stray argument', () => {
    const s = src();
    expect(s).toContain('function endWalk({ crossTo = null, ledBy = null, together = null } = {})');
  });

  it('decides the outcome after completeWalk and before the summary, only when crossing', () => {
    const s = src();
    const done = s.indexOf('progression.completeWalk(');
    const out = s.indexOf('crossingOutcome(');
    expect(out).toBeGreaterThan(done);
    expect(out).toBeLessThan(s.indexOf('const summaryHtml'));
    expect(s).toMatch(/if \(crossTo\) \{[^}]*crossingOutcome\(/);
    expect(s).toContain('together: together ?? walkedWithNames');
    expect(s).toContain('const walkedWith = together ?? walkedWithNames;');
  });

  it('puts the escaped lines above Continue and keeps lastCrossing for takeCrossing', () => {
    const s = src();
    expect(s).toMatch(/crossLines\.map\(\(l\) => `<div class="best-line">\$\{escapeHtml\(l\)\}<\/div>`\)/);
    expect(s.indexOf('${crossHtml}')).toBeLessThan(s.indexOf('id="btn-summary-continue"'));
    expect(s).toContain('lastCrossing = { to: crossTo, picked: out.picked, clan }');
    expect(s).toMatch(/function takeCrossing\(\)/);
    expect(s).toMatch(/return \{ beginWalkFromHomebase, beginDenWalk, startWalk, endWalk, takeCrossing/);
  });
});

// Fight moves and scars (Task 8): the wiring (source pins).
describe('fights teach moves and leave scars (source pins)', () => {
  const src = () => readFileSync('src/game/walk.js', 'utf8');

  it('the clan fight acts unless she walks Hagrid, with her owned moves, the record and her measure', () => {
    const s = src();
    const at = s.indexOf('session.clanFight = ');
    const line = s.slice(at, s.indexOf('NO_CLAN_FIGHT', at));
    expect(line).toContain("actions: active.breed !== 'hagrid'");
    expect(line).toContain('ownedMoves: ownedMovesNow');
    expect(line).toContain('...fightRecord');
    expect(line).toContain('measureCat: catDims');
    expect(line).not.toContain('progression');
    // both are built before that line, out of its slice
    expect(s.indexOf('const fightRecord = createFightRecord(')).toBeGreaterThan(-1);
    expect(s.indexOf('const fightRecord = createFightRecord(')).toBeLessThan(at);
    expect(s.indexOf('const ownedMovesNow = () => progression.ownedMoves()')).toBeLessThan(at);
    expect(s.indexOf('const ownedMovesNow = () => progression.ownedMoves()')).toBeGreaterThan(-1);
  });

  it('the record sets her scars on her cat and the intruder\'s on its visit', () => {
    const s = src();
    const rec = s.slice(s.indexOf('const fightRecord = createFightRecord('), s.indexOf('session.clanFight = '));
    expect(rec).toContain('scarKey: myScarKey');
    expect(rec).toContain('setMyScars: (scars) => setCatScars(cat, scars)');
    expect(rec).toContain('setIntruderScars: (visit, scars) => session.intruders.setScars(visit, scars)');
    expect(rec).toContain('onScarsChanged');
  });

  it("her own cat is built wearing its scars; intruders and camp cats wear theirs", () => {
    const s = src();
    expect(s).toMatch(/const cat = buildCat\(active\.breed, \{[^}]*\}, \{ look: active\.look, scars: progression\.catScars\(myScarKey\) \}\);/);
    const intr = s.slice(s.indexOf('session.intruders = '), s.indexOf('session.clanFight = '));
    expect(intr).toContain('scarsFor: (id) => progression.intruderScars(id)');
    const clan = s.slice(s.indexOf('createClanCats(scene, areaData, clanCast, {'), s.indexOf('}) : NO_CLAN_CATS;'));
    expect(clan).toContain('scarsFor: (id) => progression.intruderScars(id)');
  });

  it('walk start keeps the moves granted on load on the session, Clan Edition only; main.js toasts them on the first engage (R18, final review 1)', () => {
    const s = src();
    expect(s).toContain('session.moveLines = isClanEdition(state) ? progression.takeNewMoves().map(unlockToast) : null;');
    expect(s).not.toMatch(/hud\.toast\(unlockToast\(/);
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const on = main.indexOf("bus.on('player:lockchange'");
    const handler = main.slice(on, main.indexOf('});', on));
    expect(handler).toContain('if (session && locked) {');
    expect(handler).toContain('for (const moveLine of takeMoveLines(session)) hud.toast(moveLine);');
    expect(main.split('takeMoveLines(').length - 1).toBe(1);
  });

  it('endWalk re-pushes the profile when the fade changed her rendered scars', () => {
    const s = src();
    const end = s.indexOf('function endWalk(');
    const before = s.indexOf('const scarsBefore = JSON.stringify(progression.catScars(scarKey(progression.state)));', end);
    const done = s.indexOf('progression.completeWalk(', end);
    const after = s.indexOf('if (JSON.stringify(progression.catScars(scarKey(progression.state))) !== scarsBefore) onScarsChanged();', end);
    expect(before).toBeGreaterThan(end);
    expect(before).toBeLessThan(done);
    expect(after).toBeGreaterThan(done);
  });

  it('main.js hands walk.js the hook that re-tracks and re-pushes the profile', () => {
    const m = readFileSync('src/main.js', 'utf8');
    expect(m).toMatch(/onScarsChanged: \(\) => \{ rooms\.retrackProfile\(\); pushProfileNow\(\); \}/);
  });

  it('ghosts stay unscarred (R12)', () => {
    expect(readFileSync('src/ghosts.js', 'utf8')).not.toContain('scars');
  });
});
