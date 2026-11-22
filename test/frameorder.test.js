import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WALK_ENDED_LINE, stuckNoticeHtml } from '../src/game/recovery.js';
import { memoryStorage as sharedMemoryStorage } from './helpers/storage.js';

// The walk's frame, run for real: src/main.js is booted headless and the
// frame the renderer is handed (renderer.setAnimationLoop) is called by hand
// over a fake session whose every system writes its name into one list. The
// order of that list is the order main.js runs the frame in.
//
// What main.js's boot reaches is stubbed: three's renderer (no GL here), the
// walk lifecycle (which hands back the session), the player, and every other
// module main.js imports, as inert stand-ins, so nothing draws, plays a sound,
// touches real storage or reaches the network. Real: three itself, the event
// bus, the frame guard (game/recovery.js) and game/util.js. A new frame-order
// rule belongs here, as a test of this list, never as a pin on main.js's text.

const h = vi.hoisted(() => {
  const log = [];
  const notes = [];
  const ctl = { now: 0, render: true, busy: false, throwIn: new Set(), errorsExpected: false };
  // Records `name` (with its arguments) into the shared list, then throws if
  // the test asked this call to, else answers with `impl`.
  const rec = (name, impl) => (...args) => {
    log.push({ name, args });
    if (ctl.throwIn.has(name)) throw new Error(`${name} threw (on purpose)`);
    return impl ? impl(...args) : undefined;
  };
  // A stand-in for anything: callable, every property is another stand-in,
  // and a value written to it is kept. Never a thenable, so nothing awaits it.
  const inert = () => {
    const kept = new Map();
    let result;
    return new Proxy(() => {}, {
      get(_t, k) {
        if (k === Symbol.toPrimitive) return (hint) => (hint === 'number' ? 0 : '');
        if (k === Symbol.iterator) return function* none() {};
        if (k === 'then' || typeof k === 'symbol') return undefined;
        if (!kept.has(k)) kept.set(k, inert());
        return kept.get(k);
      },
      set(_t, k, v) { kept.set(k, v); return true; },
      apply() { return (result ??= inert()); },
    });
  };
  // A mocked module: the named exports given, and an inert stand-in for any
  // other export main.js imports from it.
  const stubModule = (named = {}) => new Proxy(named, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'then' || typeof k === 'symbol') return undefined;
      return (t[k] = inert());
    },
    has: (_t, k) => k !== 'then',
  });
  // Plain fields first; anything else asked of it is answered inertly.
  const withFallback = (fields) => new Proxy(fields, {
    get: (t, k) => (k in t || k === 'then' || typeof k === 'symbol' ? t[k] : (t[k] = inert())),
  });
  const player = withFallback({});
  const progState = withFallback({ walks: {} });
  return { log, progState, notes, ctl, rec, inert, stubModule, withFallback, player, loop: null, deps: null };
});

vi.mock('three', async (importOriginal) => {
  const THREE = await importOriginal();
  class FakeRenderer {
    constructor() {
      this.shadowMap = {};
      this.capabilities = { getMaxAnisotropy: () => 16 };
      this.domElement = h.inert();
      this.info = { render: {}, memory: {} };
      // Anything else main.js asks of the renderer is answered inertly.
      return new Proxy(this, { get: (t, k) => (k in t || typeof k === 'symbol' ? t[k] : h.inert()) });
    }
    setAnimationLoop(cb) {
      h.loop = cb;
      h.log.push({ name: cb ? 'setAnimationLoop' : 'setAnimationLoop(null)', args: [] });
    }
    setPixelRatio() {}
    setSize() {}
    render() {}
    getContext() { return h.inert(); }
  }
  return { ...THREE, WebGLRenderer: FakeRenderer };
});

// The modules whose calls the frame order is about record into the list.
vi.mock('../src/player.js', () => h.stubModule({ createPlayer: () => h.player }));
vi.mock('../src/game/walk.js', () => h.stubModule({
  createWalkLifecycle: (deps) => {
    h.deps = deps;
    return h.withFallback({
      takeCrossing: () => null,
      // As the real endWalk does: the walk is over, the session gone.
      endWalk: h.rec('endWalk', () => deps.setSession(null)),
    });
  },
}));
// F6: the area loader main.js makes at boot. Nothing is ever loaded and no
// load ever settles, so the boot prefetches fetch nothing here.
vi.mock('../src/game/areaload.js', () => ({
  createAreaLoader: () => ({ loaded: () => null, ensure: () => new Promise(() => {}), prefetch() {}, ensureAll: async () => [] }),
}));
vi.mock('../src/ui/perfhud.js', () => h.stubModule({
  createPerfHud: () => h.withFallback({ frameStart: h.rec('perfHud.frameStart'), frameEnd: h.rec('perfHud.frameEnd') }),
}));
vi.mock('../src/game/adaptquality.js', () => h.stubModule({
  createQualityAdapter: () => h.withFallback({
    shouldRender: h.rec('qualityAdapter.shouldRender', () => h.ctl.render),
    frame: h.rec('qualityAdapter.frame'),
    status: { rung: 0 },
  }),
}));
vi.mock('../src/game/composer.js', () => h.stubModule({
  createComposerRig: () => h.withFallback({ renderFrame: h.rec('render') }),
}));
vi.mock('../src/game/avatar.js', () => h.stubModule({
  createAvatarUpdater: () => ({ updateAvatar: h.rec('updateAvatar'), updateMoments: h.rec('updateMoments') }),
}));
vi.mock('../src/game/interactions.js', () => h.stubModule({
  createInteractions: () => h.withFallback({ updateInteractions: h.rec('updateInteractions'), tickCarryRain: h.rec('tickCarryRain') }),
}));
vi.mock('../src/game/tips.js', () => h.stubModule({
  createTips: () => h.withFallback({ update: h.rec('tips.update') }),
}));
vi.mock('../src/game/autosniff.js', () => h.stubModule({ tickAutoSniff: h.rec('tickAutoSniff') }));
// A known state object, so the test can see which one the frame hands on.
vi.mock('../src/progression.js', () => h.stubModule({ createProgression: () => h.withFallback({ state: h.progState }) }));
vi.mock('../src/foundwear/live.js', () => h.stubModule({ tickFindNose: h.rec('tickFindNose') }));
vi.mock('../src/foundwear/play.js', () => h.stubModule({ findBusy: () => h.ctl.busy, handleFindArrival: h.rec('handleFindArrival') }));
vi.mock('../src/diagnostics.js', () => h.stubModule({ note: (kind, err) => h.notes.push({ kind, err }) }));
// Any number: the test checks main.js adds the one model.js exports.
vi.mock('../src/cat/model.js', () => h.stubModule({ CAT_LOOK_Y: 0.42, coatColor: () => 0 }));
// The boot pull is chained with .then: an answer, and never a network call.
vi.mock('../src/game/colonysync.js', () => h.stubModule({
  createColonySync: () => h.withFallback({ pull: () => Promise.resolve(null) }),
}));

// Everything else main.js imports, inert. The cloud and room modules are
// among them, so nothing here can reach Supabase.
for (const m of [
  'cat/brain', 'colony', 'ui/colonypanel', 'render/materials', 'discoveries', 'ui/hud',
  'buildstamp', 'ui/homebase', 'visitboot', 'ui/touchui', 'ui/backstack', 'camzoom', 'audio', 'music',
  'samples', 'catvoice', 'album', 'savekeep', 'settings', 'blocklist', 'chatkeys', 'game/cloudsync',
  'game/onlinedelete', 'game/netevents', 'game/photo', 'game/rooms', 'game/nearby', 'game/homebasecloud',
  'render/quality', 'render/deviceprofile', 'thumbnails', 'haptics', 'game/guidewalk', 'ui/guidebubble',
  'ui/buttonwords', 'ui/denshopview', 'game/yarnshare', 'carryables', 'hints', 'tutorialwords',
  'render/textures', 'world/builder', 'housecats', 'fightmoves', 'game/crossing', 'game/findcard',
  'game/walkresume', 'fightcam',
]) vi.doMock(`../src/${m}.js`, () => h.stubModule());

const memoryStorage = () => sharedMemoryStorage({}, { removeItem: true });

let elements;
const element = (id) => {
  if (!elements.has(id)) elements.set(id, h.inert());
  return elements.get(id);
};

let fetchSpy;
async function boot() {
  elements = new Map();
  fetchSpy = vi.fn(() => { throw new Error('no network in this test'); });
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubGlobal('WebSocket', class { constructor() { throw new Error('no network in this test'); } });
  vi.stubGlobal('window', {
    innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1,
    localStorage: memoryStorage(), sessionStorage: memoryStorage(),
    addEventListener() {}, removeEventListener() {},
    location: { search: '', reload: h.rec('reload') },
  });
  vi.stubGlobal('document', {
    getElementById: element,
    body: h.inert(),
    hidden: false,
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  // Solo play: no keys, so main.js makes no cloud and no room.
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  vi.spyOn(performance, 'now').mockImplementation(() => h.ctl.now);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.resetModules();
  await import('../src/main.js');
}

// The fake session. Each system is a recorder: session.water.update(...)
// writes 'water.update'. `props` are plain fields, `impl` answers a call.
function system(name, { props = {}, impl = {} } = {}) {
  return new Proxy(props, {
    get(t, k) {
      if (k in t || typeof k === 'symbol' || k === 'then') return t[k];
      return h.rec(`${name}.${k}`, impl[k]);
    },
  });
}

const SYSTEMS = [
  'critters', 'strayCats', 'clanCats', 'intruders', 'areaLife', 'secrets', 'rival', 'dog', 'farm', 'fair',
  'fightCam', 'stripTiles', 'treeFade', 'rustle', 'kittenEnc', 'tippables', 'knockables', 'scent', 'fx',
  'skyLife', 'water', 'waterDress', 'shadows', 'wind', 'grass', 'paws', 'balloons', 'clouds', 'ambient', 'splash', 'fish',
  'chatBubbles', 'ghosts', 'denCats', 'decals', 'traversal',
];

function makeSession() {
  const s = {
    cat: { position: { x: 3, y: 0.5, z: -7 }, rotation: { y: 0 }, scale: { y: 1 }, userData: { breed: 'tabby' } },
    areaData: { colliders: [], bounds: {}, waters: [], scenics: [] },
    ground: { flat: true, y: () => 0 },
    slowmoTime: 0, reducedMotion: false, zoomTrailAccum: 0, wasZooming: false, cameraMode: false,
    minimap: null, net: null, quest: null, perched: null, questGiver: null, campMarker: null,
    toyGhost: { visible: false },
  };
  for (const name of SYSTEMS) s[name] = system(name);
  s.toy = system('toy', { props: { active: false, held: false, mesh: { position: { x: 0, y: 0, z: 0 } } } });
  s.weather = system('weather', { props: { condition: 'clear', rainbowVisible: false } });
  s.goldMice = system('goldMice', { impl: { checkFind: () => null } });
  s.clanFight = system('clanFight', { props: { cameraSubject: null } });
  s.find = system('find', { impl: { update: () => null } });
  s.race = system('race', { props: { state: 'idle' } });
  s.carry = { items: system('carry.items') };
  s.remotes = system('remotes', { props: { list: [], placed: [] } });
  s.pushThroughs = system('pushThroughs', { impl: { update: () => [] } });
  return s;
}

function resetPlayer() {
  for (const k of Object.keys(h.player)) delete h.player[k];
  Object.assign(h.player, {
    engaged: true, zooming: false, stalking: false, speed: 0, perchY: 0, hopY: 0, inWater: false,
    waterState: {}, position: { x: 8, y: 0, z: 2 },
    update: h.rec('player.update'),
    forward: () => ({ x: 0, y: 0, z: -1 }),
    viewYaw: () => 0,
  });
}

let session;
// One refresh of the screen at `ms` on the page's clock.
const frame = (ms) => {
  h.ctl.now = ms;
  h.loop();
};
const calls = () => h.log.map((e) => e.name);
const argsOf = (name) => h.log.find((e) => e.name === name)?.args;
// The calls among `names`, in the order the frame made them: equal to
// `names` only if each ran exactly once, in that order.
const ran = (names) => calls().filter((n) => names.includes(n));

beforeEach(async () => {
  h.log.length = 0;
  h.notes.length = 0;
  Object.assign(h.ctl, { now: 1000, render: true, busy: false, throwIn: new Set(), errorsExpected: false });
  resetPlayer();
  await boot();
  session = makeSession();
  h.deps.setSession(session);
  frame(1000); // the clock's first read starts it, at dt 0
  h.log.length = 0;
});

afterEach(() => {
  // A frame that threw stops short, so an order test would fail on a shorter
  // list: this says why. Only the frame guard's tests throw on purpose.
  if (!h.ctl.errorsExpected) expect(h.notes.map((n) => `${n.kind}: ${n.err?.stack ?? n.err}`)).toEqual([]);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('main.js boots headless and hands the renderer its frame', () => {
  it('runs a whole frame without an error and without the network', () => {
    frame(1020);
    expect(h.notes.map((n) => `${n.kind}: ${n.err?.stack ?? n.err}`)).toEqual([]);
    expect(calls()).toContain('render');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the walk frame runs its systems in order', () => {
  it('the moves come first, then the player; the cats and critters move after her', () => {
    frame(1020);
    expect(ran(['traversal.update', 'player.update', 'critters.update', 'strayCats.update', 'clanCats.update']))
      .toEqual(['traversal.update', 'player.update', 'critters.update', 'strayCats.update', 'clanCats.update']);
  });

  it('the intruders move straight after the clan', () => {
    frame(1020);
    const c = calls();
    expect(c[c.indexOf('clanCats.update') + 1]).toBe('intruders.update');
  });

  it('the farm and the fair carry her after the player has moved her', () => {
    frame(1020);
    expect(ran(['player.update', 'farm.update', 'fair.update'])).toEqual(['player.update', 'farm.update', 'fair.update']);
  });

  it('the player is handed the people\'s soft bumps: the Fairground show\'s where there is one, else the villagers\'', () => {
    const villagers = [{ x: 1, z: 2, r: 0.3 }];
    const visitors = [{ x: 5, z: 6, r: 0.25 }];
    session.critters = system('critters', { props: { bumps: villagers } });
    frame(1020);
    expect(argsOf('player.update')[4]).toBe(villagers);
    h.log.length = 0;
    session.fair = system('fair', { props: { show: { bumps: visitors } } });
    frame(1040);
    expect(argsOf('player.update')[4]).toBe(visitors);
  });

  it('the fight places the cats after the rival and the dog, then the fight camera and the tree fade, then the shadows', () => {
    frame(1020);
    const order = ['rival.update', 'dog.update', 'clanFight.update', 'fightCam.update', 'treeFade.update', 'shadows.update'];
    expect(ran(order)).toEqual(order);
    expect(ran(['clanFight.update', 'updateAvatar'])).toEqual(['clanFight.update', 'updateAvatar']);
  });

  it('the find is checked after the golden mice, and the nose after the stand-still sniff', () => {
    frame(1020);
    expect(ran(['goldMice.checkFind', 'find.update'])).toEqual(['goldMice.checkFind', 'find.update']);
    expect(ran(['tickAutoSniff', 'tickFindNose'])).toEqual(['tickAutoSniff', 'tickFindNose']);
  });

  it('the world follows the camera and the movers, the decals last, all before the draw', () => {
    frame(1020);
    const order = [
      'player.update', 'water.update', 'shadows.update', 'paws.update', 'remotes.update', 'splash.update',
      'pushThroughs.update', 'ghosts.update', 'decals.update', 'qualityAdapter.frame', 'render', 'perfHud.frameEnd',
    ];
    expect(ran(order)).toEqual(order);
  });

  it('the touches on her pose come after she is posed: the fair, then the moves, then the prompts', () => {
    frame(1020);
    const order = ['updateAvatar', 'fair.late', 'traversal.late', 'updateInteractions', 'render'];
    expect(ran(order)).toEqual(order);
  });

  it('walks nothing while she is not being played, and still draws', () => {
    h.player.engaged = false;
    frame(1020);
    expect(calls()).toEqual([
      'qualityAdapter.shouldRender', 'perfHud.frameStart', 'qualityAdapter.frame', 'render', 'perfHud.frameEnd',
    ]);
  });
});

describe('what the frame hands its systems', () => {
  it('the moves get one context object, filled in right before each call and emptied after', () => {
    const seen = [];
    const look = (call) => (dt, t, ctx) => seen.push({ call, ctx, cat: ctx.cat, session: ctx.session });
    session.traversal = system('traversal', { impl: { update: look('update'), late: look('late') } });
    frame(1020);
    frame(1040);
    expect(seen.map((x) => x.call)).toEqual(['update', 'late', 'update', 'late']);
    for (const x of seen) {
      expect(x.ctx).toBe(seen[0].ctx);
      expect(x.cat).toBe(session.cat);
      expect(x.session).toBe(session);
    }
    // an ended walk's session is not held past its frame
    expect(seen[0].ctx.cat).toBeNull();
    expect(seen[0].ctx.session).toBeNull();
  });

  it('the shadows are fitted to the ground under the player, on this frame\'s dt', () => {
    session.ground = { flat: false, y: (x, z) => x * 100 + z };
    frame(1020);
    const [groundY, dt] = argsOf('shadows.update');
    expect(groundY).toBe(h.player.position.x * 100 + h.player.position.z);
    expect(dt).toBeCloseTo(0.02, 12);
  });

  it('the golden mice and the find are checked at her paws\' height on the ground', () => {
    session.ground = { flat: false, y: (x, z) => x * 100 + z };
    h.player.perchY = 0.25;
    frame(1020);
    const pawsY = session.cat.position.x * 100 + session.cat.position.z + 0.25;
    expect(argsOf('goldMice.checkFind')).toEqual([session.cat.position, pawsY]);
    expect(argsOf('find.update')[2].pawsY).toBe(pawsY);
  });

  it('the find gets one frame object, with the co-walkers and whether she is busy', () => {
    h.ctl.busy = true;
    frame(1020);
    const first = argsOf('find.update')[2];
    expect(first.remotes).toBe(session.remotes.list);
    expect(first.busy).toBe(true);
    h.log.length = 0;
    frame(1040);
    expect(argsOf('find.update')[2]).toBe(first);
  });

  it('the fight camera is handed the fight\'s subject and the photo mode', () => {
    const subject = { x: 1, z: 2 };
    session.clanFight = system('clanFight', { props: { cameraSubject: subject } });
    session.cameraMode = true;
    frame(1020);
    const [, opts] = argsOf('fightCam.update');
    expect(opts.subject).toBe(subject);
    expect(opts.cameraMode).toBe(true);
    expect(calls().filter((n) => n === 'fightCam.update')).toHaveLength(1);
  });

  it('the tree fade looks at her cat at the look height', () => {
    let look = null;
    session.treeFade = system('treeFade', { impl: { update: (dt, camera, at) => { look = { ...at }; } } });
    frame(1020);
    const { x, y, z } = session.cat.position;
    expect(look).toEqual({ x, y: y + 0.42, z });
  });

  it('every cat on her screen pushes the flaps: hers first, then each co-walker\'s', () => {
    // remotecats' `placed`: the co-walkers drawn so far. One still waiting for
    // its first state (F6 R16: not drawn, not at the origin) pushes nothing.
    const partner = { group: { position: { x: 9, y: 0, z: 9 }, rotation: { y: 0 }, scale: { y: 1 } }, water: { placed: true }, speed: 0 };
    const waiting = { group: { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, scale: { y: 1 } }, water: { placed: false }, speed: 0 };
    session.remotes = system('remotes', { props: { list: [partner, waiting], placed: [partner] } });
    frame(1020);
    const [dt, movers] = argsOf('pushThroughs.update');
    expect(dt).toBeCloseTo(0.02, 12);
    expect(movers).toEqual([session.cat.position, partner.group.position]);
    expect(movers[0]).toBe(session.cat.position);
    expect(movers[1]).toBe(partner.group.position);
  });

  it('the race is handed her spot and the camera', () => {
    frame(1020);
    const [dt, at, camera] = argsOf('race.update');
    expect(dt).toBeCloseTo(0.02, 12);
    expect(at).toBe(session.cat.position);
    expect(camera).toBe(h.deps.camera);
  });

  it('a pounce\'s slow-mo slows the critters and cats only; the water, the weather, the birds and the rest keep real time', () => {
    session.slowmoTime = 1;
    frame(1020);
    const dt = 0.02;
    for (const slowed of ['critters.update', 'strayCats.update', 'clanCats.update']) {
      expect(argsOf(slowed)[0], slowed).toBeCloseTo(dt * 0.35, 12);
    }
    for (const real of ['water.update', 'weather.update', 'skyLife.update', 'intruders.update', 'knockables.update', 'paws.update']) {
      expect(argsOf(real)[0], real).toBeCloseTo(dt, 12);
    }
    // the wind takes the absolute time, and a rain makes it windier
    const t = argsOf('wind.update')[0];
    expect(argsOf('wind.update')).toEqual([t, 1]);
    session.weather = system('weather', { props: { condition: 'rain', rainbowVisible: false } });
    h.log.length = 0;
    frame(1040);
    expect(argsOf('wind.update')[1]).toBe(1.7);
    expect(argsOf('wind.update')[0]).toBeGreaterThan(t);
  });

  it('the contact decals are updated once a frame, with nothing passed', () => {
    frame(1020);
    expect(calls().filter((n) => n === 'decals.update')).toHaveLength(1);
    expect(argsOf('decals.update')).toEqual([]);
  });

  it('the corner map is updated after the co-walkers move, and shows the camp', () => {
    session.minimap = system('minimap');
    session.campMarker = { x: 5, z: 5 };
    frame(1020);
    expect(ran(['minimap.show', 'remotes.update', 'minimap.update'])).toEqual(['minimap.show', 'remotes.update', 'minimap.update']);
    expect(argsOf('minimap.update')[1].camp).toBe(session.campMarker);
  });

  it('the corner map has a dot for each co-walker drawn so far, and none for one still on its way', () => {
    session.minimap = system('minimap');
    const partner = { group: { position: { x: 4, y: 0, z: -3 }, rotation: { y: 0 }, scale: { y: 1 } }, water: { placed: true }, speed: 0, breed: 'tabby', look: null };
    const waiting = { group: { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, scale: { y: 1 } }, water: { placed: false }, speed: 0, breed: 'tabby', look: null };
    session.remotes = system('remotes', { props: { list: [partner, waiting], placed: [partner] } });
    frame(1020);
    const dots = argsOf('minimap.update')[1].remotes;
    expect(dots.map((d) => [d.x, d.z])).toEqual([[4, -3]]);
  });
});

describe('what the frame hands the fight, the dog and the find\'s nose', () => {
  it('the dog is told whether she is stalking', () => {
    h.player.stalking = true;
    frame(1020);
    const [dt, at, cat, opts] = argsOf('dog.update');
    expect(dt).toBeCloseTo(0.02, 12);
    expect(at).toBe(session.cat.position);
    expect(cat).toBe(session.cat);
    expect(opts).toEqual({ stalking: true });
    h.player.stalking = false;
    h.log.length = 0;
    frame(1040);
    expect(argsOf('dog.update')[3]).toEqual({ stalking: false });
  });

  it('the find\'s nose gets the session and the progression\'s own state', () => {
    frame(1020);
    const [handed, dt, state] = argsOf('tickFindNose');
    expect(handed).toBe(session);
    expect(dt).toBeCloseTo(0.02, 12);
    expect(state).toBe(h.progState);
  });

  it('the fight, the rival and the avatar are handed the session, the spot and the time', () => {
    frame(1020);
    const [fightDt, fightSession] = argsOf('clanFight.update');
    expect(fightDt).toBeCloseTo(0.02, 12);
    expect(fightSession).toBe(session);
    const [rivalDt, rivalT, rivalAt, rivalCat] = argsOf('rival.update');
    expect(rivalDt).toBeCloseTo(0.02, 12);
    expect(rivalT).toBeGreaterThan(0);
    expect(rivalAt).toBe(session.cat.position);
    expect(rivalCat).toBe(session.cat);
    const [avatarSession, avatarDt, avatarT] = argsOf('updateAvatar');
    expect(avatarSession).toBe(session);
    expect(avatarDt).toBeCloseTo(0.02, 12);
    expect(avatarT).toBe(rivalT);
  });
});

describe('the 30 fps cap and the clock', () => {
  it('a refresh the cap skips only asks; it does not read the clock, so the next frame\'s dt covers both', () => {
    h.ctl.render = false;
    frame(1010);
    expect(calls()).toEqual(['qualityAdapter.shouldRender']);
    h.ctl.render = true;
    h.log.length = 0;
    frame(1030);
    expect(argsOf('water.update')[0]).toBeCloseTo(0.03, 12);
  });

  it('the home screen has no session, so the frame never asks the cap', () => {
    h.deps.setSession(null);
    h.log.length = 0;
    frame(1020);
    expect(calls()).not.toContain('qualityAdapter.shouldRender');
  });

  it('a long gap is clamped to a 50 ms step of game time', () => {
    frame(3000);
    expect(argsOf('water.update')[0]).toBe(0.05);
  });
});

describe('the frame guard', () => {
  beforeEach(() => { h.ctl.errorsExpected = true; });
  const throwing = (n, from) => {
    for (let i = 0; i < n; i++) frame(from + i * 20);
  };

  it('a frame that throws is caught and noted, and the next frame runs', () => {
    h.ctl.throwIn.add('water.update');
    expect(() => frame(1020)).not.toThrow();
    expect(h.notes.map((n) => n.kind)).toEqual(['frame']);
    expect(calls()).not.toContain('render');
    h.ctl.throwIn.clear();
    frame(1040);
    expect(calls()).toContain('render');
  });

  it('frames that keep throwing end the walk through endWalk, with the one gentle line', () => {
    h.ctl.throwIn.add('water.update');
    throwing(4, 1020);
    expect(calls()).not.toContain('endWalk');
    frame(1200);
    expect(calls().filter((n) => n === 'endWalk')).toHaveLength(1);
    expect(element('overlay').querySelector('.summary-cheer').textContent).toBe(WALK_ENDED_LINE);
  });

  it('a good frame starts the count again; a refresh the cap skips does not', () => {
    h.ctl.throwIn.add('water.update');
    throwing(4, 1020);
    h.ctl.throwIn.clear();
    frame(1200); // a good frame
    h.ctl.throwIn.add('water.update');
    throwing(4, 1220);
    expect(calls()).not.toContain('endWalk');
    h.ctl.render = false;
    frame(1400); // skipped by the cap: not a good frame
    h.ctl.render = true;
    frame(1420);
    expect(calls()).toContain('endWalk');
  });

  it('when the walk cannot be torn down, the loop stops and offers a reload', () => {
    h.ctl.throwIn.add('water.update');
    h.ctl.throwIn.add('endWalk');
    throwing(5, 1020);
    expect(calls()).toContain('setAnimationLoop(null)');
    expect(h.loop).toBeNull();
    // (touchui is stubbed inert here, so the page reads as a touch screen)
    expect(element('overlay').innerHTML).toBe(stuckNoticeHtml('error', { touch: true }));
  });

  it('when the home screen\'s own frame keeps throwing, the loop stops', () => {
    h.deps.setSession(null);
    h.ctl.throwIn.add('perfHud.frameStart');
    throwing(5, 1020);
    expect(calls()).not.toContain('endWalk');
    expect(calls()).toContain('setAnimationLoop(null)');
    // (touchui is stubbed inert here, so the page reads as a touch screen)
    expect(element('overlay').innerHTML).toBe(stuckNoticeHtml('error', { touch: true }));
  });
});
