// The guided first walk and the first camp walk on a walk (src/game/guidewalk.js;
// design sections 3, 7 and 8).
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  lessonFor, headingToward, guideSpot, placeGuide, buildFirstLesson, createGuideWalk, lessonOpen,
  GUIDE_AHEAD_M, CAMP_GIFT,
} from '../src/game/guidewalk.js';
import { STEP } from '../src/tutorial.js';
import { createStrayCats } from '../src/straycats.js';
import { createProgression, TUTORIAL_GIFT } from '../src/progression.js';
import { isShy } from '../src/colony.js';
import { mulberry32 } from '../src/rng.js';
import { bus } from '../src/events.js';
import { FLAT_GROUND } from '../src/ground.js';
import { DISCS } from '../src/rivalclans.js';
import { campLayout } from '../src/world/camp.js';
import { viewForward } from '../src/catcam.js';
import { SPAWN as WOODS } from '../src/world/woods.js';
import { SPAWN as RIVER } from '../src/world/river.js';
import { SPAWN as MOOR } from '../src/world/moor.js';
import { SPAWN as PINES } from '../src/world/pines.js';
import { SPAWN as GORGE } from '../src/world/gorge.js';
import { memoryStorage } from './helpers/storage.js';

const fakeScene = () => ({ add() {}, remove() {} });
const AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, spawn: { x: 0, z: 45 }, colliders: [], waters: [], collectibles: [{ id: 'yarn-1', x: -14, z: 33.5, label: 'a red yarn ball' }] };
const memStorage = () => memoryStorage({}, { removeItem: true });
const newSave = () => ({ tutorial: { first: null, camp: false, hints: {}, told: { thing: null, visits: 0 } }, clanPick: { mine: null } });

describe('which walk has a lesson', () => {
  it('a brand-new save, alone on the street: the whole guided walk', () => {
    expect(lessonFor(newSave(), { areaId: 'neighborhood' })).toMatchObject({ kind: 'first', step: STEP.walk, resumed: false });
  });

  it('a room walk is never guided', () => {
    expect(lessonFor(newSave(), { areaId: 'neighborhood', room: true })).toBe(null);
  });

  it('an existing save never gets it by itself: old, done or skipped', () => {
    for (const first of ['old', 'done', 'skipped']) {
      expect(lessonFor({ ...newSave(), tutorial: { first, camp: false } }, { areaId: 'neighborhood' })).toBe(null);
    }
    expect(lessonFor({ clanPick: { mine: null } }, { areaId: 'neighborhood' })).toBe(null); // no field at all
    expect(lessonFor({ tutorial: {}, clanPick: { mine: null } }, { areaId: 'neighborhood' })).toBe(null);
  });

  it('left half way: one more try from step 2, with the same friend', () => {
    const s = { ...newSave(), tutorial: { first: 'part', camp: false, guide: 'Biscuit' } };
    expect(lessonFor(s, { areaId: 'neighborhood' })).toMatchObject({ kind: 'first', step: STEP.hello, name: 'Biscuit' });
  });

  it('only on the street, never the den', () => {
    for (const areaId of ['den', 'park', 'woods', 'docks']) expect(lessonFor(newSave(), { areaId })).toBe(null);
  });

  it('a walk picked up again carries its own step, whatever the save now says; a skipped one carries none', () => {
    const done = { ...newSave(), tutorial: { first: 'done', camp: false } };
    const note = { x: 1, z: 30, guide: { step: STEP.follow, did: { moved: true, hello: true, fish: true }, name: 'Tofu', gift: 0 } };
    expect(lessonFor(done, { areaId: 'neighborhood', resume: note })).toMatchObject({ kind: 'first', step: STEP.follow, name: 'Tofu', resumed: true });
    expect(lessonFor(newSave(), { areaId: 'neighborhood', resume: { x: 1, z: 30 } })).toBe(null); // an ordinary walk picked up again
    expect(lessonFor(done, { areaId: 'neighborhood', resume: { ...note, guide: { step: STEP.off } } })).toBe(null);
  });

  it('the first camp walk: home land, once, never in Legacy Edition; in a room it is marked as one', () => {
    const picked = { tutorial: { first: 'done', camp: false }, clanPick: { mine: 'woods' } };
    const facts = { areaId: 'woods', clanEdition: true, hasCamp: true };
    expect(lessonFor(picked, facts)).toMatchObject({ kind: 'camp', room: false });
    expect(lessonFor(picked, { ...facts, room: true })).toMatchObject({ kind: 'camp', room: true });
    expect(lessonFor(picked, { ...facts, clanEdition: false })).toBe(null);
    expect(lessonFor(picked, { ...facts, areaId: 'river' })).toBe(null); // somebody else's land
    expect(lessonFor({ ...picked, tutorial: { first: 'done', camp: true } }, facts)).toBe(null); // shown once
    expect(lessonFor({ ...picked, clanPick: { mine: null } }, facts)).toBe(null);
  });
});

describe('the first home walk starts facing the camp', () => {
  it('in all five lands the heading points at the camp', () => {
    const lands = { woods: WOODS, river: RIVER, moor: MOOR, pines: PINES, gorge: GORGE };
    for (const [id, spawn] of Object.entries(lands)) {
      const layout = campLayout(id);
      expect(layout, id).toBeTruthy();
      const camp = { x: layout.cx, z: layout.cz };
      expect(camp.x).toBe(DISCS[id].cx);
      const f = viewForward(headingToward(spawn, camp)); // where the camera (and the cat) then looks
      const d = Math.hypot(camp.x - spawn.x, camp.z - spawn.z);
      const cos = (f.x * (camp.x - spawn.x) + f.z * (camp.z - spawn.z)) / d;
      expect(Math.acos(Math.min(1, cos)) * 180 / Math.PI, id).toBeLessThan(0.5);
    }
  });
});

describe('the guide cat is one of the walk\'s own strays, moved', () => {
  const counting = (seed) => { const r = mulberry32(seed); let n = 0; const f = () => { n++; return r(); }; f.count = () => n; return f; };
  const cast = (cats) => cats.strays.map((s) => ({ name: s.name, breed: s.breed, personality: s.personality, x: s.group.position.x, z: s.group.position.z }));

  it('with and without a guide the cats are the same but for the one moved cat, and no extra dice are thrown', () => {
    for (const seed of [1, 7, 42, 99]) {
      const a = counting(seed);
      const b = counting(seed);
      const plain = createStrayCats(fakeScene(), AREA, 22, a, { roomSeed: 5 });
      const guided = createStrayCats(fakeScene(), AREA, 22, b, { roomSeed: 5 });
      const guide = placeGuide(guided, AREA);
      expect(b.count()).toBe(a.count());
      const before = cast(plain);
      const after = cast(guided);
      const moved = after.filter((c, i) => c.x !== before[i].x || c.z !== before[i].z);
      expect(moved.map((c) => c.name)).toEqual([guide.name]);
      expect(after.map(({ name, breed, personality }) => ({ name, breed, personality })))
        .toEqual(before.map(({ name, breed, personality }) => ({ name, breed, personality })));
      // she waits ahead of the start, on the road, looking back at the child
      expect(guide.group.position.x).toBeCloseTo(AREA.spawn.x, 5);
      expect(guide.group.position.z).toBeCloseTo(AREA.spawn.z - GUIDE_AHEAD_M, 5);
      expect(guide.home.z).toBeCloseTo(AREA.spawn.z - GUIDE_AHEAD_M, 5); // a first fish founds her here
    }
  });

  it('she is the first cat of the cast whose name is not a shy one, and the same cat on the lowest setting', () => {
    for (const seed of [1, 7, 42, 99, 1234]) {
      const high = createStrayCats(fakeScene(), AREA, 22, mulberry32(seed), { roomSeed: 5 });
      const lite = createStrayCats(fakeScene(), AREA, 8, mulberry32(seed), { roomSeed: 5 });
      const g = high.pickGuide();
      expect(isShy(g.name)).toBe(false);
      expect(high.strays.slice(0, high.strays.indexOf(g)).every((s) => isShy(s.name))).toBe(true);
      expect(lite.pickGuide()?.name).toBe(g.name); // she exists there too
    }
    // a walk with one cat: she is that cat, shy name or not
    const one = createStrayCats(fakeScene(), AREA, 1, mulberry32(3), { roomSeed: 5 });
    expect(one.pickGuide()).toBe(one.strays[0]);
    expect(createStrayCats(fakeScene(), AREA, 0, mulberry32(3)).pickGuide()).toBe(null);
  });

  it('a cross cat, a colony cat or a visitor is never the guide', () => {
    const cats = createStrayCats(fakeScene(), AREA, 6, mulberry32(11), { roomSeed: 5 });
    const names = cats.strays.map((s) => s.name);
    const again = createStrayCats(fakeScene(), AREA, 6, mulberry32(11), { roomSeed: 5, grudges: names.slice(0, 5) });
    expect(again.pickGuide().name).toBe(names[5]);
    const none = createStrayCats(fakeScene(), AREA, 6, mulberry32(11), { roomSeed: 5, grudges: names });
    expect(none.pickGuide()).toBe(null);
  });

  it('while she leads she never runs and never draws from her own stream; no shy cat runs while the lesson is on', () => {
    const cats = createStrayCats(fakeScene(), AREA, 22, mulberry32(4), { roomSeed: 5 });
    const guide = placeGuide(cats, AREA);
    const shy = cats.strays.find((s) => s.personality === 'shy' && s !== guide);
    let draws = 0;
    const own = guide.wanderRng;
    guide.wanderRng = () => { draws += 1; return own(); };
    cats.setLead(guide, () => ({ pose: 'requestPet', speed: 0 }));
    const at = guide.group.position.clone();
    const child = guide.group.position.clone().add(new THREE.Vector3(1, 0, 0));
    for (let i = 0; i < 600; i++) cats.update(0.05, i * 0.05, child, { stalking: false, catSpeed: 5, toy: null });
    expect(guide.group.position.distanceTo(at)).toBeLessThan(1e-6);
    expect(draws).toBe(0);
    // a shy cat rushed at: runs on an ordinary walk, stays while the lesson is on
    const rush = () => { const p = shy.group.position.clone(); cats.update(0.05, 0, p.clone().add(new THREE.Vector3(1, 0, 0)), { stalking: false, catSpeed: 5, toy: null }); return shy.scurry > 0; };
    cats.setCalm(true);
    expect(rush()).toBe(false);
    cats.setCalm(false);
    expect(rush()).toBe(true);
    // let go, she is an ordinary stray again, with no draw spent on it
    cats.setLead(guide, null);
    expect(guide.lead).toBe(null);
    expect(draws).toBe(0);
  });

  it('guideSpot: nine metres ahead, or the furthest spot short of that a cat can stand on', () => {
    expect(guideSpot(AREA)).toEqual({ x: 0, z: 36 });
    const blocked = { ...AREA, colliders: [{ x: 0, z: 36.5, r: 1.6 }] };
    const p = guideSpot(blocked);
    expect(p.z).toBeGreaterThan(38);
    expect(p.z).toBeLessThanOrEqual(41);
  });
});

// A walk small enough to hold in a test: real strays, the real script, fakes
// for the screen and the sound.
function harness({ first = null, gift = false } = {}) {
  const storage = memStorage();
  if (first !== null || gift) storage.setItem('whisker-walk-save', JSON.stringify({ version: 4, walks: { neighborhood: 2 }, tutorial: { first, camp: false, hints: {}, told: { thing: null, visits: 0 }, ...(gift ? { gift: true } : {}) } }));
  const progression = createProgression(storage);
  const strayCats = createStrayCats(fakeScene(), AREA, 8, mulberry32(21), { roomSeed: 5 });
  const goals = { goals: [{ id: 'collect', text: 'Pick up 2 treasures', progress: 0, target: 2, done: false }] };
  const plan = lessonFor(progression.state, { areaId: 'neighborhood' });
  const lesson = plan ? buildFirstLesson(plan, { strayCats, areaData: AREA, goals, resume: null }) : null;
  const calls = { blocked: [], cap: [], goals: [], guide: [], points: [], popups: [], trails: 0, lesson: [], changed: 0, fanfare: 0 };
  const session = {
    lesson, goals: null, areaData: AREA, ground: FLAT_GROUND, strayCats, reducedMotion: false,
    cat: { position: new THREE.Vector3(0, 0, 45) }, prompt: null,
    collectibleMeshes: new Map([['yarn-1', {}]]), walk: { carried: 0, carryCap: 2 },
    scent: { trailTo: () => { calls.trails += 1; } },
    hints: { setBlocked: (v) => calls.blocked.push(v) },
    fx: { burst() {}, popup: (p, text) => calls.popups.push(text) },
  };
  const hud = {
    setToastCap: (n) => calls.cap.push(n), setGoals: (g) => calls.goals.push(g), setPoints: (n) => calls.points.push(n),
    setObjective() {}, setLesson: (v) => calls.lesson.push(v),
  };
  const bubble = { guide: (v) => calls.guide.push(v), update() {}, clear() {} };
  const player = { speed: 0 };
  const guideWalk = createGuideWalk({
    player, progression, settings: { get: () => false }, hud, bubble, touchUI: { restAgain() {} },
    audio: { trill() {}, unlockFanfare: () => { calls.fanfare += 1; }, chime() {} },
    getIsTouch: () => true, canFeedStray: () => true, onLessonChange: () => { calls.changed += 1; },
  });
  const tick = (secs, speed = 0) => { player.speed = speed; for (let t = 0; t < secs; t += 0.1) { strayCats.update(0.1, t, session.cat.position, { stalking: false, catSpeed: speed, toy: null }); guideWalk.update(session, 0.1); } };
  const line = () => calls.guide.at(-1);
  return { progression, session, lesson, strayCats, guideWalk, calls, tick, line, storage };
}

describe('a guided first walk, played', () => {
  beforeEach(() => { bus.emit('guide:did', null); });

  it('from the first step to the gift: the things switched off, and back on at the finish', () => {
    const h = harness();
    const { session, lesson, calls, progression } = h;
    const guide = lesson.stray;
    expect(lessonOpen(session)).toBe(true);
    expect(session.goals).toBe(null); // no goals while the lesson is on
    h.guideWalk.begin(session);
    expect(calls.blocked).toEqual([true]);        // hints held back
    expect(calls.cap).toEqual([1]);               // one toast at a time
    expect(progression.state.tutorial.first).toBe('part');
    expect(progression.state.tutorial.guide).toBe(guide.name);
    expect(h.line()).toMatchObject({ text: 'Push the circle to walk.', ring: 'move' });

    // step 1: the cat walks
    for (const z of [44.2, 43.4, 42.6, 41.8]) { session.cat.position.z = z; h.tick(0.3, 2.6); }
    expect(lesson.tutorial.step).toBe(STEP.hello);
    expect(h.line().text).toBe(`Walk to ${guide.name}.`);
    expect(calls.trails).toBeGreaterThan(0); // paw prints to her

    // step 2: hello (the yellow button's own work is interactions.js's)
    session.cat.position.z = guide.group.position.z + 1.6; // the child has walked up to her
    session.prompt = { kind: 'stray', data: guide };
    h.tick(0.3);
    expect(h.line()).toMatchObject({ text: 'Tap the button to say hello.', ring: 'prompt' });
    bus.emit('guide:did', { what: 'greet', stray: guide });
    expect(lesson.tutorial.step).toBe(STEP.fish);
    session.prompt = { kind: 'stray-feed', data: guide };
    h.tick(0.3);
    expect(h.line()).toMatchObject({ text: `${guide.name} is hungry. Tap the button again.`, ring: 'prompt' });
    bus.emit('guide:did', { what: 'feed', stray: guide });
    expect(lesson.tutorial.step).toBe(STEP.follow);
    session.prompt = null;

    // step 4: she trots off toward the treasure and waits for the child
    const start = guide.group.position.clone();
    h.tick(6);
    expect(h.line().text).toBe(`Follow ${guide.name}!`);
    const led = guide.group.position.distanceTo(start);
    expect(led).toBeGreaterThan(2);
    const toYarn = (p) => Math.hypot(p.x + 14, p.z - 33.5);
    expect(toYarn(guide.group.position)).toBeLessThan(toYarn(start));
    h.tick(10); // the child has not followed: she has stopped, not run off to the treasure alone
    expect(guide.group.position.distanceTo(session.cat.position)).toBeLessThan(9);

    session.collectibleMeshes.delete('yarn-1');
    bus.emit('guide:did', { what: 'collect' });
    expect(lesson.tutorial.step).toBe(STEP.pounce);
    expect(h.line()).toMatchObject({ text: 'Tap the paw to pounce!', ring: 'pounce' });
    expect(lessonOpen(session)).toBe(true);

    const before = progression.state.points;
    bus.emit('guide:did', { what: 'pounce' });
    expect(lesson.tutorial.step).toBe(STEP.finish);
    expect(lessonOpen(session)).toBe(false);
    expect(progression.state.points).toBe(before + TUTORIAL_GIFT);
    expect(TUTORIAL_GIFT).toBe(20);
    expect(lesson.gift).toBe(20);
    expect(calls.popups).toContain('+20 🐾');
    expect(calls.fanfare).toBe(1);
    expect(progression.state.tutorial).toMatchObject({ first: 'done', gift: true });
    expect(calls.blocked).toEqual([true]);        // hints wait until the finish has been read
    expect(calls.cap).toEqual([1, null]);         // toasts back
    expect(session.goals).toBeTruthy();           // the goals appear
    expect(h.line().text).toBe(`You did it! ${guide.name} is your friend now.`);
    h.tick(4.5);
    expect(h.line()).toMatchObject({ text: 'Tap ⏸ when you want to go home.', ring: 'pause', chip: null });
    h.tick(6.5);
    expect(h.line()).toMatchObject({ text: 'Tap ⏸ when you want to go home.', chip: 'line' });
    expect(calls.blocked).toEqual([true, false]); // hints back, now the last line is a chip
    h.tick(6);
    expect(guide.lead).toBe(null); // she wanders like any friendly stray
  });

  it('skip: one tap, nothing asked; the goals appear and the walk is an ordinary walk', () => {
    const h = harness();
    h.guideWalk.begin(h.session);
    h.tick(1);
    expect(h.guideWalk.skip(h.session)).toBe(true);
    expect(h.progression.state.tutorial.first).toBe('skipped');
    expect(lessonOpen(h.session)).toBe(false);
    expect(h.session.goals).toBeTruthy();
    expect(h.line()).toBe(null);
    expect(h.lesson.stray.lead).toBe(null);
    expect(h.calls.blocked.at(-1)).toBe(false);
    expect(h.calls.cap.at(-1)).toBe(null);
    expect(h.calls.changed).toBe(1);
    expect(h.guideWalk.skip(h.session)).toBe(false); // never twice
    bus.emit('guide:did', { what: 'pounce' });
    expect(h.progression.state.points).toBe(0); // and no gift for a skipped lesson
    expect(lessonFor(h.progression.state, { areaId: 'neighborhood' })).toBe(null); // nor a guided walk next time
  });

  it('skip from the Ready card, before the walk has begun', () => {
    const h = harness();
    expect(h.guideWalk.skip(h.session)).toBe(true);
    expect(h.progression.state.tutorial.first).toBe('skipped');
    h.guideWalk.begin(h.session);
    expect(h.calls.blocked).toEqual([]);
    expect(h.session.goals).toBeTruthy();
  });

  it('a replay is guided again and gives no second gift', () => {
    const h = harness({ first: 'done', gift: true });
    expect(lessonFor(h.progression.state, { areaId: 'neighborhood' })).toBe(null);
    h.progression.setTutorialFirst(null); // "Do the first lesson again"
    const again = harness({ first: null, gift: true });
    again.guideWalk.begin(again.session);
    const before = again.progression.state.points;
    for (const [what, guide] of [['greet', true], ['feed', true], ['collect', false], ['pounce', false]]) {
      bus.emit('guide:did', { what, stray: guide ? again.lesson.stray : undefined });
    }
    expect(again.lesson.tutorial.step).toBe(STEP.finish);
    expect(again.progression.state.points).toBe(before);
    expect(again.lesson.gift).toBe(0);
    expect(again.calls.popups).toEqual([]);
    expect(again.progression.state.tutorial.first).toBe('done');
  });

  it('a second try is the last: it is marked done as it begins', () => {
    const h = harness({ first: 'part' });
    expect(h.lesson.tutorial.step).toBe(STEP.hello);
    h.guideWalk.begin(h.session);
    expect(h.progression.state.tutorial.first).toBe('done');
  });

  it('she comes after a child who wanders more than 25 metres off, and sits a little way ahead', () => {
    const h = harness({ first: 'part' });
    h.guideWalk.begin(h.session);
    h.session.cat.position.set(30, 0, 44);
    const guide = h.lesson.stray;
    expect(guide.group.position.distanceTo(h.session.cat.position)).toBeGreaterThan(25);
    h.tick(25, 1); // (the child is busy with something else: no nudge in this time)
    const d = guide.group.position.distanceTo(h.session.cat.position);
    expect(d).toBeLessThan(4);
    expect(d).toBeGreaterThan(2);
    expect(h.line().text).toBe(`Walk to ${guide.name}.`); // no telling-off, no new words
  });

  it('nothing is sent or shown for a walk with no lesson', () => {
    const h = harness();
    h.session.lesson = null;
    h.guideWalk.begin(h.session);
    h.tick(1);
    expect(h.calls.blocked).toEqual([]);
    expect(h.calls.guide.every((v) => v === null)).toBe(true);
    expect(CAMP_GIFT).toBe(10);
  });
});

describe('a guided walk picked up again', () => {
  it('after the hello, the guide is the same cat, beside the child, already greeted: the button goes on to the fish', () => {
    const cats = createStrayCats(fakeScene(), AREA, 8, mulberry32(21), { roomSeed: 5 });
    const name = cats.strays[3].name;
    const plan = lessonFor({ tutorial: { first: 'part' }, clanPick: { mine: null } }, {
      areaId: 'neighborhood', resume: { x: 10, z: 20, guide: { step: STEP.fish, did: { moved: true, hello: true }, name, gift: 0 } },
    });
    const lesson = buildFirstLesson(plan, { strayCats: cats, areaData: AREA, goals: null, resume: { x: 10, z: 20 } });
    expect(lesson.stray.name).toBe(name);
    expect(lesson.stray.greeted).toBe(true);
    expect(lesson.tutorial.step).toBe(STEP.fish);
    expect(lesson.resumed).toBe(true);
    const p = lesson.stray.group.position;
    expect(Math.hypot(p.x - 10, p.z - 20)).toBeCloseTo(2.5, 1); // beside the child
  });

  it('before the hello she is not yet greeted; after the finish only the small last line is left', () => {
    const cats = createStrayCats(fakeScene(), AREA, 8, mulberry32(21), { roomSeed: 5 });
    const early = buildFirstLesson({ kind: 'first', step: STEP.hello, did: { moved: true }, name: null, resumed: true }, { strayCats: cats, areaData: AREA, goals: null, resume: { x: 0, z: 40 } });
    expect(early.stray.greeted).toBe(false);
    const done = buildFirstLesson({ kind: 'first', step: STEP.home, did: {}, name: null, resumed: true, gift: 20 }, { strayCats: cats, areaData: AREA, goals: null, resume: { x: 0, z: 40 } });
    expect(done.finished).toBe(true);
    expect(done.open).toBe(false);
    expect(done.gift).toBe(20);
    expect(done.tutorial.view()).toMatchObject({ id: 'guide.home', chip: 'line' });
  });
});

// The first camp walk (design section 7). Here with nobody to lead (the walk
// together's form: the trail, the pill and the bubble); the waiting cat's own
// moving is leadwait.js's, tested there and seen in the browser.
function campHarness({ camp = false, cat = null } = {}) {
  const storage = memStorage();
  storage.setItem('whisker-walk-save', JSON.stringify({ version: 4, walks: { neighborhood: 2 }, points: 30, lifetimePoints: 30, clanPick: { mine: 'woods', partner: null, partnerId: null }, tutorial: { first: 'done', camp, hints: {}, told: { thing: null, visits: 0 } } }));
  const progression = createProgression(storage);
  const area = { bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 }, spawn: { x: 44, z: 12 }, colliders: [], waters: [] };
  const plan = lessonFor(progression.state, { areaId: 'woods', clanEdition: true, hasCamp: true });
  const goals = { goals: [{ id: 'collect', text: 'Pick up 2 treasures', progress: 0, target: 2, done: false }] };
  const lesson = plan ? { kind: 'camp', camp: { x: 2, z: -43, r: 6 }, open: false, room: false, cat, heading: headingToward(area.spawn, { x: 2, z: -43 }), heldGoals: goals, finished: false, skipped: false } : null;
  const calls = { guide: [], objective: [], goals: [], trails: [], popups: [], blocked: [], points: [] };
  const session = {
    lesson, goals: null, areaData: area, ground: FLAT_GROUND, reducedMotion: false, clanEdition: true,
    cat: { position: new THREE.Vector3(44, 0, 12) }, campMarker: { x: 2, z: -43, color: 0x55aa55 },
    scent: { trailTo: (from, to) => { calls.trails.push({ x: to.x, z: to.z }); } },
    hints: { setBlocked: (v) => calls.blocked.push(v) },
    fx: { burst() {}, popup: (p, text) => calls.popups.push(text) },
    quest: null, race: { state: 'idle' },
  };
  const hud = { setToastCap() {}, setGoals: (g) => calls.goals.push(g), setPoints: (n) => calls.points.push(n), setObjective: (t, d) => calls.objective.push([t, d]), setLesson() {} };
  const guideWalk = createGuideWalk({
    player: { speed: 0 }, progression, settings: { get: () => false }, hud, touchUI: {},
    bubble: { guide: (v) => calls.guide.push(v), update() {}, clear() {} },
    audio: { chime() {}, trill() {}, unlockFanfare() {} }, getIsTouch: () => true,
  });
  const tick = (secs) => { for (let t = 0; t < secs; t += 0.2) guideWalk.update(session, 0.2); };
  return { progression, session, lesson, guideWalk, calls, tick, line: () => calls.guide.at(-1) };
}

describe('the first camp walk, played', () => {
  it('the bubble, the pill counting down, the beating mark and the paw prints point the way; the goals wait', () => {
    const h = campHarness();
    expect(h.lesson).toBeTruthy();
    h.guideWalk.begin(h.session);
    expect(h.line().text).toBe('Follow the paw prints to your camp.');
    expect(h.session.campMarker.pulse).toBe('beat');
    expect(h.session.goals).toBe(null);
    expect(h.calls.blocked).toEqual([true]); // no hint takes the bubble on the way
    h.tick(1);
    const [words, metres] = h.calls.objective.at(-1);
    expect(words).toBe('Your camp 🏡');
    expect(metres).toBeCloseTo(Math.hypot(42, 55), 0);
    // paw prints lead from the cat toward the camp
    const p = h.calls.trails.at(-1);
    const before = Math.hypot(44 - 2, 12 + 43);
    expect(Math.hypot(p.x - 2, p.z + 43)).toBeLessThan(before - 5);
    // ...and are laid again as she walks
    const laid = h.calls.trails.length;
    h.session.cat.position.set(30, 0, -5);
    h.tick(6);
    expect(h.calls.trails.length).toBeGreaterThan(laid);
    expect(h.calls.objective.at(-1)[1]).toBeCloseTo(Math.hypot(28, 38), 0);
  });

  it('with a cat of the group to follow, the line names it', () => {
    const cat = { name: 'Conkerbelly', group: { position: new THREE.Vector3(40, 0, 6), rotation: { y: 0 } }, camp: false };
    const h = campHarness({ cat });
    h.session.clanCats = { setLead: () => true };
    h.guideWalk.begin(h.session);
    expect(h.line().text).toBe('Follow Conkerbelly to your camp.');
  });

  it('arriving: +10, the camp words, the goals appear, and it never shows again', () => {
    const h = campHarness();
    h.guideWalk.begin(h.session);
    h.session.cat.position.set(6, 0, -40); // inside the camp's circle
    const before = h.progression.state.points;
    h.tick(0.5);
    expect(h.progression.state.points).toBe(before + CAMP_GIFT);
    expect(h.calls.popups).toEqual(['+10 🐾']);
    expect(h.line().text).toBe('This is your camp. Say hello to everyone!');
    expect(h.session.goals).toBeTruthy();
    expect(h.calls.objective.at(-1)).toEqual([null, undefined]); // the pill is put away
    expect(h.session.campMarker.pulse).toBeUndefined();
    expect(h.calls.blocked).toEqual([true]); // the hints wait until the words have been read
    expect(h.progression.state.tutorial.camp).toBe(true);
    h.tick(10);
    expect(h.line()).toBe(null); // the words go after a while
    expect(h.calls.blocked.at(-1)).toBe(false);
    expect(h.progression.state.points).toBe(before + CAMP_GIFT); // once
    expect(lessonFor(h.progression.state, { areaId: 'woods', clanEdition: true, hasCamp: true })).toBe(null);
  });

  it('two minutes of other things: the bubble shrinks to a chip and the goals appear anyway; the trail keeps pointing', () => {
    const h = campHarness();
    h.guideWalk.begin(h.session);
    h.tick(119);
    expect(h.session.goals).toBe(null);
    expect(h.line().chip).toBe(null);
    h.tick(2);
    expect(h.session.goals).toBeTruthy();
    expect(h.line().chip).toBe('paw');
    const laid = h.calls.trails.length;
    h.tick(6);
    expect(h.calls.trails.length).toBeGreaterThan(laid);
    expect(h.progression.state.tutorial.camp).toBe(false); // still to be reached
  });

  it('skip: the walk is an ordinary walk, and the camp walk is not shown again', () => {
    const h = campHarness();
    h.guideWalk.begin(h.session);
    h.tick(1);
    expect(h.guideWalk.skip(h.session)).toBe(true);
    expect(h.line()).toBe(null);
    expect(h.session.goals).toBeTruthy();
    expect(h.session.campMarker.pulse).toBeUndefined();
    expect(h.progression.state.tutorial.camp).toBe(true);
    expect(h.progression.state.points).toBe(30); // no gift for skipping
  });

  it('a save that has been to its camp, or Legacy Edition, has no camp walk', () => {
    expect(campHarness({ camp: true }).lesson).toBe(null);
  });
});

// How walk.js asks (read from its source: a whole walk is too big to build in a test).
describe('walk.js and the lessons', () => {
  it('a walk with a room seed is asked for as a room walk, so it is never guided; a first walk with someone else marks the lesson skipped', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(src).toContain('areaId: lessonArea, room: roomSeed !== undefined, resume,');
    expect(src).toContain("if (session.net && progression.state.tutorial?.first === null) progression.setTutorialFirst('skipped');");
    // the waiting camp cat is moved only on a solo walk
    expect(src).toContain('const way = roomSeed === undefined ? findPath(clanWalkable, areaData.bounds, from, camp, { canStep }) : null;');
    // the goals are rolled as always and only held aside, never in a room
    expect(src).toContain('const goals = isDen ? null : createGoals(walkRng, areaData);');
    expect(src).toContain('const holdGoals = !!lesson && !lesson.finished && roomSeed === undefined && !!goals;');
    // the guided walk's lines stand in place of the goals tile on the summary
    expect(src).toContain('hasGoals: !!session.goals && !firstLesson');
  });
});
