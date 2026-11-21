import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { mulberry32 } from '../src/rng.js';
import { rollWeather } from '../src/weather.js';
import { houseOn, setHouse, resumableHouseIds } from '../src/houseflag.js';
import { setRoofs, resumableAreaIds } from '../src/roofsflag.js';
import { isIndoor } from '../src/indoor.js';
import { createAreaLoader } from '../src/game/areaload.js';
import { readResume, writeResume, snapshotWalk, pickUpWalk, resumeWelcome, RESUME_KEY } from '../src/game/walkresume.js';
import { createProgression, CATALOG } from '../src/progression.js';
import { createAudio } from '../src/audio.js';
import { MAX_ZOOM_STEP, DEN_MAX_ZOOM_STEP } from '../src/camzoom.js';
import { cameraOffset } from '../src/catcam.js';
import { words } from '../src/wordset.js';
import { roomAt } from '../src/world/houseplan.js';
import { makeView, blockers } from '../src/housewalls.js';
import { CAT_LOOK_Y } from '../src/cat/model.js';
import { behindYaw } from '../src/traversal.js';
import { lifecycle, fakeEl, memStorage } from './helpers/walklife.js';

// =============================================================================
// The Old House in the game (Old House step 1, Task 8; rulings H7, U9-U12).
// walk.js's createWalkLifecycle is booted headless (test/helpers/walklife.js,
// as test/roofswalk.test.js does) and real walks are started and ended: in the
// house, and in the den and the Park beside it for the difference. What each
// walk system was handed is recorded where walk.js hands it: the lifecycle's
// own dependencies (the sound, the cloud, the lighting) are recorders, and
// the modules walk.js imports below are the real ones wrapped to note their
// calls.
//
// The house's drawing is its own download (the `house` pack in
// world/areas.js): the first describe runs before anything here has loaded it,
// and counts each time world/house.js is evaluated. A download that fails is
// test/houseload.test.js.
// =============================================================================

const seen = vi.hoisted(() => ({
  houseLoads: 0, secrets: 0, skyLife: 0, goals: 0, legends: [], wanderers: [], strayCounts: [], zoom: [], savedZoom: null,
}));
vi.mock('../src/world/house.js', async (importOriginal) => {
  seen.houseLoads++;
  // The house grows no hooked grass (the real module exports no GRASS_HOOKS); a mock refuses to answer for a name it lacks.
  return { ...(await importOriginal()), GRASS_HOOKS: undefined };
});
vi.mock('../src/secrets.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, rollSecrets: (...a) => { seen.secrets++; return m.rollSecrets(...a); } };
});
vi.mock('../src/skylife.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, createSkyLife: (...a) => { seen.skyLife++; return m.createSkyLife(...a); } };
});
vi.mock('../src/goals.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, createGoals: (...a) => { seen.goals++; return m.createGoals(...a); } };
});
vi.mock('../src/legendary.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, legendaryFor: (state, areaId, ...rest) => { seen.legends.push(areaId); return m.legendaryFor(state, areaId, ...rest); } };
});
// How many ordinary strays each walk asked for (before the cast finds them spots).
vi.mock('../src/straycats.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, createStrayCats: (scene, area, count, ...rest) => { seen.strayCounts.push(count); return m.createStrayCats(scene, area, count, ...rest); } };
});
// Every walk's day has a wanderer, so a walk that let one in would show it.
vi.mock('../src/housecats.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, walkWanderer: (state, areaId, o) => { seen.wanderers.push(areaId); return o?.isDen ? null : 'Biscuit'; } };
});
// The device's saved view step (settings.cameraZoom; the lifecycle's settings
// have none) is seen.savedZoom while it is set; what the walk keeps is noted.
vi.mock('../src/camzoom.js', async (importOriginal) => {
  const m = await importOriginal();
  return {
    ...m,
    clampZoomStep: (step, max) => {
      const got = m.clampZoomStep(seen.savedZoom ?? step, max);
      seen.zoom.push(got);
      return got;
    },
  };
});

// The first seed whose walk rolls rain (the weather is the first draw off a
// walk's stream), and the Math.random draw that makes it a solo walk's seed.
const RAIN = (() => { for (let seed = 1; ; seed++) if (rollWeather(mulberry32(seed)) === 'rain') return seed; })();
let stream = null;
let queued = [];
const nextWalkSeed = (seed) => queued.push((seed + 0.5) / 2 ** 31);

function reset(life) {
  seen.secrets = 0;
  seen.skyLife = 0;
  seen.goals = 0;
  seen.legends.length = 0;
  seen.wanderers.length = 0;
  seen.strayCounts.length = 0;
  seen.zoom.length = 0;
  for (const k of ['lighting', 'sound', 'music', 'toasts']) life.rec[k].length = 0;
  life.rec.friendFetches = 0;
}

// One walk on the rain seed, started (by `start`, which must start it in this
// tick) and ended; what it was handed and what it built.
function walk(life, start, { keep = null } = {}) {
  reset(life);
  nextWalkSeed(RAIN);
  start(life.w);
  const s = life.getSession();
  expect(s).not.toBe(null);
  expect(s.soloSeed).toBe(RAIN);
  const out = {
    areaId: s.areaId,
    weather: s.weather.condition,
    rain: !!s.scene.getObjectByName('rain-drops'),
    secretsRolled: seen.secrets,
    strays: s.strayCats.strays.map((c) => c.name),
    straysAsked: [...seen.strayCounts],
    wanderAsked: [...seen.wanderers],
    arrivalLine: s.arrivalLine,
    legendAsked: [...seen.legends],
    ghostsAsked: life.rec.friendFetches,
    goals: s.goals,
    goalsRolled: seen.goals,
    skyLife: seen.skyLife,
    minimap: s.minimap,
    zoom: [...seen.zoom],
    sound: life.rec.sound.map(({ areaId, dusk, rain }) => ({ areaId, dusk, rain })),
    grass: !!s.scene.getObjectByName('grass'),
    pools: !!s.scene.getObjectByName('lampPools'),
    fireflies: s.critters.list.filter((c) => c.type === 'firefly').length,
    name: s.areaData.name,
    welcome: s.welcome,
  };
  if (keep) keep(s);
  const before = { ...life.progression.state.walks };
  life.w.endWalk();
  expect(life.getSession()).toBe(null);
  out.walksAdded = Object.fromEntries(Object.keys(life.progression.state.walks)
    .filter((k) => life.progression.state.walks[k] !== before[k])
    .map((k) => [k, life.progression.state.walks[k] - (before[k] ?? 0)]));
  return out;
}

const areas = createAreaLoader();
beforeAll(() => areas.ensureAll(['park', 'neighborhood', 'den']));
const lifecycleHere = (o = {}) => lifecycle({ areas, ...o });
const explore = (life) => walk(life, (w) => w.beginWalkFromHomebase({ duskMode: false }));
const houseWalk = (life, duskMode = false, o) => walk(life, (w) => w.startWalk({ duskMode, areaOverride: 'house' }), o);
const denWalk = (life) => walk(life, (w) => w.startWalk({ areaOverride: 'den' }));
const parkWalk = (life, duskMode = false) => walk(life, (w) => w.startWalk({ duskMode, areaOverride: 'park' }));

beforeEach(() => {
  globalThis.document = { body: fakeEl(), createElement: fakeEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-21T15:00:00Z') });
  stream = mulberry32(20261121);
  queued = [];
  vi.spyOn(Math, 'random').mockImplementation(() => (queued.length ? queued.shift() : stream()));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  delete globalThis.document;
  setHouse(null);
  setRoofs(null);
  seen.savedZoom = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the switch', () => {
  it('is off by default, and a test can force it either way', () => {
    expect(houseOn()).toBe(false);
    setHouse(true);
    expect(houseOn()).toBe(true);
    setHouse(false);
    expect(houseOn()).toBe(false);
    setHouse(null);
    expect(houseOn()).toBe(false);
  });

  it('has no catalog row: nothing a child picks from offers the house', () => {
    expect(Object.hasOwn(CATALOG.areas, 'house')).toBe(false);
  });

  it('indoors is the den and the house, and nowhere else', () => {
    expect(isIndoor('den')).toBe(true);
    expect(isIndoor('house')).toBe(true);
    for (const id of ['park', 'neighborhood', 'roofs', 'fair', undefined, null]) expect(isIndoor(id)).toBe(false);
  });
});

describe('the house\'s drawing is its own download', () => {
  it('without the switch nothing fetches it: Explore walks her own place', () => {
    setHouse(false);
    expect(explore(lifecycleHere()).areaId).toBe('neighborhood');
    expect(parkWalk(lifecycleHere()).areaId).toBe('park');
    expect(seen.houseLoads).toBe(0);
    expect(areas.loaded('house')).toBe(null);
  }, 90_000);

  it('with the switch, Explore before it has come waits for it, then walks the house', async () => {
    setHouse(true);
    const life = lifecycleHere();
    const started = life.w.beginWalkFromHomebase({ duskMode: false });
    expect(life.getSession()).toBe(null); // home stays up while it comes
    expect(await started).toBe('started');
    expect(life.getSession().areaId).toBe('house');
    expect(seen.houseLoads).toBe(1);
    life.w.endWalk();
    // once it has come, Explore starts straight away, with no second fetch
    expect(explore(lifecycleHere()).areaId).toBe('house');
    expect(seen.houseLoads).toBe(1);
  }, 90_000);
});

describe('Explore with ?house=1', () => {
  beforeAll(() => areas.ensure('house'));

  it('starts a solo house walk in Clan Edition', () => {
    setHouse(true);
    const r = explore(lifecycleHere());
    expect(r.areaId).toBe('house');
    expect(r.name).toBe(words().PLACE_WORDS.house);
  }, 90_000);

  it('Legacy Edition does not get it: Explore walks her own place', () => {
    setHouse(true);
    const life = lifecycleHere();
    life.progression.setEdition('legacy');
    expect(explore(life).areaId).toBe('neighborhood');
  }, 90_000);

  it('never in a room: in a room, Explore starts the room\'s walk in her own place', () => {
    setHouse(true);
    const life = lifecycleHere();
    life.setPendingRoom({ code: 'ABCD' });
    life.w.beginWalkFromHomebase({ duskMode: false });
    expect(life.getSession()).toBe(null);
    expect(life.rec.roomStarts).toEqual([{ area: 'neighborhood', dusk: false }]);
  });

  it('with the Rooftops switch on too, the Rooftops wins', async () => {
    setHouse(true);
    setRoofs(true);
    const life = lifecycleHere();
    expect(await life.w.beginWalkFromHomebase({ duskMode: false })).toBe('started');
    expect(life.getSession().areaId).toBe('roofs');
    life.w.endWalk();
  }, 90_000);

  it('without the flag, Explore walks her own place', () => {
    setHouse(false);
    expect(explore(lifecycleHere()).areaId).toBe('neighborhood');
  }, 90_000);
});

describe('a walk in the house', () => {
  beforeAll(() => areas.ensure('house'));

  it('counts as a house walk', () => {
    const life = lifecycleHere();
    expect(life.progression.state.walks.house).toBe(0);
    expect(houseWalk(life).walksAdded).toEqual({ house: 1 });
    expect(life.progression.state.walks.house).toBe(1);
  }, 90_000);

  it('has no weather: a walk whose seed rolls rain is dry, and sounds dry', () => {
    const r = houseWalk(lifecycleHere());
    expect([r.weather, r.rain]).toEqual(['clear', false]);
    expect(r.sound).toEqual([{ areaId: 'house', dusk: false, rain: false }]);
    // the same seed on the Park rains, so the seed is a rainy one
    const park = parkWalk(lifecycleHere());
    expect([park.weather, park.rain]).toEqual(['rain', true]);
  }, 90_000);

  it('has no secrets, no strays, no wanderer, no legend and no ghosts, on a day that has them', () => {
    const r = houseWalk(lifecycleHere());
    expect(r.secretsRolled).toBe(0);
    expect(r.strays).toEqual([]);
    expect(r.straysAsked).toEqual([0]);
    expect(r.wanderAsked).toEqual([]);
    expect(r.arrivalLine).toBe(null);
    expect(r.legendAsked).toEqual([]);
    expect(r.ghostsAsked).toBe(0);
    // the Park on the same day rolls its secrets, has its strays, asks for its
    // visitors and for friends to visit
    const park = parkWalk(lifecycleHere());
    expect(park.secretsRolled).toBe(1);
    expect(park.strays.length).toBeGreaterThan(0);
    expect(park.straysAsked[0]).toBeGreaterThan(0);
    expect(park.wanderAsked).toEqual(['park']);
    expect(park.legendAsked).toEqual(['park']);
    expect(park.ghostsAsked).toBe(1);
  }, 90_000);

  it('has no daily goals, no sky birds and no corner map', () => {
    const r = houseWalk(lifecycleHere());
    expect([r.goals, r.goalsRolled, r.skyLife, r.minimap]).toEqual([null, 0, 0, null]);
    const park = parkWalk(lifecycleHere());
    expect(park.goals).not.toBe(null);
    expect([park.goalsRolled, park.skyLife]).toEqual([1, 1]);
    expect(park.minimap).not.toBe(null);
  }, 90_000);

  it('keeps every view step: a device on step 3 stays on it in the house, and the den still caps it', () => {
    seen.savedZoom = 3;
    expect(houseWalk(lifecycleHere()).zoom).toEqual([MAX_ZOOM_STEP]);
    expect(MAX_ZOOM_STEP).toBe(3);
    expect(denWalk(lifecycleHere()).zoom).toEqual([DEN_MAX_ZOOM_STEP]);
    expect(DEN_MAX_ZOOM_STEP).toBeLessThan(3);
  }, 90_000);

  it('grows no grass in a room (the Park\'s lawn grows it on the same device)', () => {
    expect(houseWalk(lifecycleHere()).grass).toBe(false);
    expect(parkWalk(lifecycleHere()).grass).toBe(true);
  }, 90_000);

  it('at dusk the lamps pool their light, no fireflies come in, and it still sounds like the den', () => {
    const r = houseWalk(lifecycleHere({ collar: true }), true);
    expect(r.pools).toBe(true);
    expect(r.fireflies).toBe(0);
    // a Park dusk walk in the collar has its fireflies
    expect(parkWalk(lifecycleHere({ collar: true }), true).fireflies).toBeGreaterThan(0);
    expect(r.sound).toEqual([{ areaId: 'house', dusk: true, rain: false }]);
    expect(r.walksAdded).toEqual({ house: 1 });
  }, 90_000);

  // Her kitten, home with her (kitten stage 2), wanders a circle of 3 m round
  // the area's kitten spot: in the house that is the hall's middle, not the
  // spawn by the front door, whose circle would take her through the shut
  // door and the hall lamp.
  it('Mochi wanders the hall: never through a wall, the front door, the lamp or the furniture', () => {
    const life = lifecycleHere();
    life.progression.setKittenStage(2);
    houseWalk(life, false, {
      keep: (s) => {
        const k = s.kittenEnc.group;
        expect(k).toBeTruthy();
        const solid = s.areaData.colliders;
        let worst = Infinity;
        for (let i = 0; i < 300; i++) { // 30 s: a full turn (2 pi / 0.25 rad/s is 25 s)
          s.kittenEnc.update(0.1);
          const { x, z } = k.position;
          expect(roomAt(x, z), `${x.toFixed(2)}, ${z.toFixed(2)}`).toBe('hall');
          for (const c of solid) worst = Math.min(worst, Math.hypot(x - c.x, z - c.z) - c.r);
        }
        expect(worst).toBeGreaterThan(0.3); // a kitten's half length, and a little
      },
    });
  }, 90_000);

  it('runs the house life: the walls between the camera and her sink, the ones ahead stand', () => {
    houseWalk(lifecycleHere(), false, {
      keep: (s) => {
        const { sections } = s.areaData.house;
        const mesh = (id) => s.scene.getObjectByName(`houseWall:${id}`);
        const cat = s.cat.position;
        const camera = new THREE.PerspectiveCamera();
        // behind her at the spawn (she faces -z), at the default step
        camera.position.copy(cat).add(cameraOffset(0, 0.18, 4.5, 2.2));
        const south = sections.filter((x) => x.id.startsWith('hall-s-') && x.kind === 'wall'
          && Math.min(x.x0, x.x1) <= cat.x && Math.max(x.x0, x.x1) >= cat.x);
        const north = sections.filter((x) => x.id.startsWith('hall-n-'));
        expect(south.length).toBeGreaterThan(0);
        expect(north.length).toBeGreaterThan(0);
        for (let i = 0; i < 20; i++) s.areaLife.update(1 / 30, i / 30, cat, camera);
        for (const x of south) expect(mesh(x.id).scale.y, x.id).toBeLessThan(0.5);
        for (const x of north) expect(mesh(x.id).scale.y, x.id).toBe(1);
      },
    });
  }, 90_000);

  // Final fix F1: the Ready card shows the walk before any engaged frame, and
  // main.js runs no area life behind it, so the start itself must leave the
  // view clear. These walks ease their walls (the lifecycle's device has no
  // reduced motion), so nothing here is a snap hiding the fault.
  it('opens on her, not the front wall: before any frame, nothing stands between the camera and her', () => {
    const life = lifecycleHere();
    houseWalk(life, false, {
      keep: (s) => {
        expect(s.reducedMotion).toBeFalsy();
        const { sections } = s.areaData.house;
        const mesh = (id) => s.scene.getObjectByName(`houseWall:${id}`);
        const cat = s.cat.position;
        // the start camera hangs outside the hall's south wall
        expect(life.camera.position.z).toBeGreaterThan(12);
        const view = makeView(cat, life.camera.position, CAT_LOOK_Y);
        expect(blockers(sections, s.areaLife.sink, view)).toEqual([]);
        // and the meshes show what the sink says: the south wall down, the north wall up
        const south = sections.filter((x) => x.id.startsWith('hall-s-') && x.kind === 'wall'
          && Math.min(x.x0, x.x1) <= cat.x && Math.max(x.x0, x.x1) >= cat.x);
        expect(south.length).toBeGreaterThan(0);
        for (const x of south) expect(mesh(x.id).scale.y, x.id).toBeLessThan(0.5);
        for (const x of sections.filter((q) => q.id.startsWith('hall-n-'))) expect(mesh(x.id).scale.y, x.id).toBe(1);
        for (const x of sections) if (mesh(x.id)) expect(mesh(x.id).scale.y, x.id).toBe(s.areaLife.sink.fraction(x.id));
        expect(s.areaLife.drawing.current).toBe('ground');
      },
    });
  }, 90_000);
});

describe('a house walk left in the middle', () => {
  beforeAll(() => areas.ensure('house'));
  const ids = () => resumableHouseIds(resumableAreaIds(createProgression(memStorage()).state.walks));

  it('its note is dropped without the switch and kept with it; every other place\'s is kept either way', () => {
    const now = Date.UTC(2026, 10, 21, 12);
    const note = { v: 1, at: now - 60_000, tries: 0, areaId: 'house', seed: 7, stamp: 'walk-1', x: 0, z: 9.5, yaw: 0, startPoints: 0 };
    const read = (on, areaId = 'house') => {
      const storage = memStorage();
      storage.setItem(RESUME_KEY, JSON.stringify({ ...note, areaId }));
      setHouse(on);
      try {
        return { got: readResume(storage, { now, areaIds: ids() }), left: storage.getItem(RESUME_KEY) };
      } finally { setHouse(null); }
    };
    expect(read(false)).toEqual({ got: null, left: null }); // dropped, and the note cleared
    expect(read(true).got?.kind).toBe('resume');
    expect(read(true).got?.data.areaId).toBe('house');
    for (const on of [false, true]) expect(read(on, 'park').got?.kind).toBe('resume');
    // the list is otherwise the walks' own, in order
    setHouse(true);
    expect(ids()).toEqual(resumableAreaIds(createProgression(memStorage()).state.walks));
    setHouse(false);
    expect(ids()).not.toContain('house');
  });

  it('picked up again with the switch on: the same house, and the Ready card names it', async () => {
    const life = lifecycleHere();
    let snap = null;
    houseWalk(life, false, { keep: (s) => { snap = snapshotWalk(s, { yaw: 0, now: Date.now() }); } });
    expect(snap?.areaId).toBe('house');
    const storage = memStorage();
    writeResume(storage, snap);
    setHouse(true);
    const left = readResume(storage, { now: Date.now(), areaIds: ids() });
    expect(left?.kind).toBe('resume');
    const again = lifecycleHere();
    const got = await pickUpWalk({
      storage, data: left.data, startWalkWhenReady: again.w.startWalkWhenReady, progression: again.progression,
      getSession: again.getSession, reload: () => {},
    });
    expect(got).toBe('started');
    const s = again.getSession();
    expect(s.areaId).toBe('house');
    expect(s.soloSeed).toBe(snap.seed);
    // the HUD's and the card's name: no catalog row, so the house's own (PLACE_WORDS)
    expect(s.welcome).toBe(resumeWelcome(words().PLACE_WORDS.house));
    again.w.endWalk();
  }, 90_000);

  // Final fix F1: a walk picked up in the attic opens on its "Welcome back!"
  // card, paused, with no area life running: the attic must already be drawn
  // in full, and the camera behind her there with nothing in the way.
  it('picked up in the attic: the card shows the attic in full and her, with no wall between', async () => {
    const life = lifecycleHere();
    let snap = null;
    houseWalk(life, false, { keep: (s) => { snap = snapshotWalk(s, { yaw: 0, now: Date.now() }); } });
    const yaw = behindYaw(-1, 0); // looking west down the attic, as its shot does
    snap = { ...snap, x: -19, z: -10, yaw };
    const storage = memStorage();
    writeResume(storage, snap);
    setHouse(true);
    const left = readResume(storage, { now: Date.now(), areaIds: ids() });
    const again = lifecycleHere();
    expect(await pickUpWalk({
      storage, data: left.data, startWalkWhenReady: again.w.startWalkWhenReady, progression: again.progression,
      getSession: again.getSession, reload: () => {},
    })).toBe('started');
    const s = again.getSession();
    expect(s.resumed).toBe(true);
    expect(s.reducedMotion).toBeFalsy();
    const cat = s.cat.position;
    expect(roomAt(cat.x, cat.z)).toBe('attic');
    expect(cat.y).toBeGreaterThan(4);
    // the level drawing: the attic and the floor its stair joins drawn in full, the rest stand-ins
    const drawing = s.areaLife.drawing;
    expect(drawing.current).toBe('attic');
    expect([...drawing.full].sort()).toEqual(['attic', 'upstairs']);
    let atticDetails = 0;
    s.scene.traverse((o) => {
      if (o.userData.houseDetail && o.userData.houseLevel === 'attic') { atticDetails++; expect(o.visible, o.name).toBe(true); }
      if (o.userData.houseSimple === 'attic') expect(o.visible, o.name).toBe(false);
      if (o.userData.houseDetail && o.userData.houseLevel === 'ground') expect(o.visible, o.name).toBe(false);
    });
    expect(atticDetails).toBeGreaterThan(0);
    // the camera behind her in the attic (not left at the front door), and nothing in the way
    const cam = again.camera.position;
    expect(Math.hypot(cam.x - cat.x, cam.z - cat.z)).toBeLessThan(6);
    expect(cam.x).toBeGreaterThan(cat.x); // east of her, as she looks west
    expect(blockers(s.areaData.house.sections, s.areaLife.sink, makeView(cat, cam, CAT_LOOK_Y))).toEqual([]);
    again.w.endWalk();
  }, 90_000);
});

// The sound, through its own seam (as test/audio.test.js observes the den's):
// looped-noise layers are buffer sources (the fire, wind, rain); birdsong and
// crickets are setInterval; gulls and the horn are setTimeout.
describe('the house sounds like the den', () => {
  function fakeParam(v = 1) {
    return { value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
  }
  function fakeNode(extra = {}) {
    const n = { connections: [], stopped: false, connect(t) { n.connections.push(t); return t; }, start() {}, stop() { n.stopped = true; }, ...extra };
    return n;
  }
  function probe(areaKey, opts) {
    const sources = [];
    const ctx = {
      currentTime: 0, sampleRate: 44100, destination: fakeNode(),
      createGain: () => fakeNode({ gain: fakeParam(1) }),
      createOscillator: () => fakeNode({ frequency: fakeParam(440), type: 'sine' }),
      createDynamicsCompressor: () => fakeNode({ threshold: fakeParam(), knee: fakeParam(), ratio: fakeParam(), attack: fakeParam(), release: fakeParam() }),
      createConvolver: () => fakeNode({ buffer: null }),
      createBiquadFilter: () => fakeNode({ type: 'lowpass', frequency: fakeParam(), Q: fakeParam() }),
      createBuffer: (ch, len, rate) => ({ getChannelData: () => new Float32Array(len), length: len, sampleRate: rate }),
      createBufferSource: () => { const n = fakeNode({ buffer: null, loop: false, playbackRate: fakeParam(1) }); sources.push(n); return n; },
    };
    const origInterval = globalThis.setInterval;
    const origTimeout = globalThis.setTimeout;
    let intervals = 0;
    let timeouts = 0;
    globalThis.setInterval = (...a) => { intervals++; return origInterval(...a); };
    globalThis.setTimeout = (...a) => { timeouts++; return origTimeout(...a); };
    const audio = createAudio({ contextFactory: () => ctx });
    try {
      audio.startAmbient(areaKey, opts);
    } finally {
      globalThis.setInterval = origInterval;
      globalThis.setTimeout = origTimeout;
    }
    const heard = { fire: sources.length, intervals, timeouts };
    audio.stopAmbient();
    heard.stopped = sources.every((x) => x.stopped);
    return heard;
  }

  it('the fire alone, day or dusk: never birdsong, crickets, gulls or wind', () => {
    const den = probe('den');
    expect(den).toEqual({ fire: 1, intervals: 0, timeouts: 0, stopped: true });
    expect(probe('house')).toEqual(den);
    expect(probe('house', { dusk: true })).toEqual(den);
    expect(probe('den', { dusk: true })).toEqual(den);
    // outdoors a dusk walk has its crickets (one setInterval) over the wind
    expect(probe('park', { dusk: true }).intervals).toBe(1);
  });
});
