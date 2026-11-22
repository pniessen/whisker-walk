import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument({ measureText: 10, pointerLock: true });

const { SESSION_FIELDS } = await import('../src/game/session.js');
const { NO_TRAVERSAL } = await import('../src/traversallive.js');
const { createAvatarUpdater } = await import('../src/game/avatar.js');
const { createInteractions } = await import('../src/game/interactions.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { createWaterState } = await import('../src/waterstate.js');
const { createProgression } = await import('../src/progression.js');
const { createGifts } = await import('../src/gifts.js');
const { snapshotWalk } = await import('../src/game/walkresume.js');
const { climbBadge } = await import('../src/game/tips.js');
const { BASE_ABILITIES } = await import('../src/traversal.js');
const { bus } = await import('../src/events.js');
const { buildHeightFixture } = await import('./fixtures/heightfield.js');
const { yardWalk } = await import('./helpers/traversalwalk.js');

// Task 8 of Rooftops step 1: the traversal runtime wired into the walk, and
// inert everywhere today (no shipped area returns `traversal`).

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const walk = read('game/walk.js');

it('the session has a traversal field', () => expect(SESSION_FIELDS).toContain('traversal'));

it('walk.js builds it only for an area that places moves, and disposes it', () => {
  expect(walk).toMatch(/const traversalLive = areaData\.traversal \? createTraversalLive\(areaData\.traversal, \{/);
  expect(walk).toMatch(/: NO_TRAVERSAL;/);
  expect(walk).toMatch(/traversal: traversalLive,/);
  expect(walk).toContain('session.traversal?.dispose();');
  expect(walk.indexOf('session.traversal?.dispose();')).toBeGreaterThan(walk.indexOf('session.fair?.dispose();'));
});

it('only the Rooftops and the Old House place moves', async () => {
  // Every place a walk can go (a fresh save's walks, the den included), each
  // built as walk.js builds it: only the Rooftops' record and the house's have
  // `traversal` (the house's climbs up the furniture: Old House step 2, ruling
  // D2; ruling S2-5 records it here).
  const ids = Object.keys(createProgression({ getItem: () => null, setItem() {} }).state.walks);
  expect(ids.length).toBeGreaterThan(10);
  const withMoves = [];
  for (const id of ids) {
    const { build } = await import(`../src/world/${id}.js`);
    const record = build(new THREE.Scene());
    if (record.traversal !== undefined) withMoves.push(id);
  }
  expect(withMoves).toEqual(['roofs', 'house']);
  // the plan's roofsArea(), that roofs.js builds from, places them too
  const { roofsArea } = await import('../src/world/roofsplan.js');
  expect(roofsArea().traversal.hops.length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// The avatar: pose and gait speed from s.traversal (test/pounce.test.js's
// avatarHarness, copied).
// ---------------------------------------------------------------------------
describe('the avatar', () => {
  const part = () => new THREE.Object3D();

  function avatarHarness() {
    const cat = new THREE.Object3D();
    cat.userData = {
      breed: 'tabby',
      parts: {
        body: part(), head: part(), tail: part(),
        tailPivots: [part(), part()],
        legs: [part(), part(), part(), part()],
        earL: part(), earR: part(),
      },
    };
    const player = {
      perchY: 0, speedFactor: 1, speed: 0,
      inputActive: false, stalking: false,
      forward: () => new THREE.Vector3(0, 0, -1),
      hopY: 0, inWater: false, wading: false, swimming: false, waterState: createWaterState(),
    };
    const s = {
      cat,
      perched: null,
      freezeTime: 0, pounceTime: 0, pounceCooldown: 0, landTime: 0,
      idleTime: 0, stepPhase: 0, stretchTime: 0, sniffTime: 0, boxTime: 0,
      pose: 'follow',
      net: null,
      balkedPuddles: new Set(),
      areaData: { puddles: [], boxes: [] },
      fx: { burst() {} },
      critters: {
        setFleeModifier() {}, markStalked() {},
        catchAt: () => null,
        pounceCatch: () => null,
      },
      toy: { active: true, idleTime: 0, mesh: { position: new THREE.Vector3(0, 0.2, 0) }, bat() {}, retrieve() {} },
      batReady: true, batCount: 0,
      toyGhost: { visible: false, position: new THREE.Vector3() },
      remotes: { list: [] },
      groomTimers: new Map(),
    };
    const { updateAvatar } = createAvatarUpdater({
      player,
      progression: { state: { equipped: { collar: 'none', feet: 'none' } }, recordSighting() {} },
      settings: { get: () => false },
      log: { award() {}, awardOnce: () => 0 },
      hud: { toast() {} },
      audio: { landThump() {}, step() {}, purr() {}, fanfare() {}, waterSplash() {} },
      petNameFor: () => 'x', completeTag() {}, noteBat() {},
    });
    return { s, cat, player, updateAvatar };
  }

  it('on a move she takes its pose, and its pace keeps her from settling', () => {
    const h = avatarHarness();
    h.s.idleTime = 5;
    h.s.traversal = { busy: true, pose: 'stalk', speed: 1.1 };
    h.updateAvatar(h.s, 1 / 60, 0);
    expect(h.s.pose).toBe('stalk');
    expect(h.s.idleTime).toBe(0);
  });

  it('a scare still wins', () => {
    const h = avatarHarness();
    h.s.freezeTime = 1;
    h.s.traversal = { busy: true, pose: 'stalk', speed: 1.1 };
    h.updateAvatar(h.s, 1 / 60, 0);
    expect(h.s.pose).toBe('scared');
  });

  it('with NO_TRAVERSAL, or none at all, she is as before', () => {
    for (const traversal of [NO_TRAVERSAL, undefined]) {
      const h = avatarHarness();
      h.s.traversal = traversal;
      h.updateAvatar(h.s, 1 / 60, 0);
      expect(h.s.pose).toBe('follow');
      expect(h.s.idleTime).toBeCloseTo(1 / 60, 12); // standing still: the idle clock runs
    }
  });
});

// ---------------------------------------------------------------------------
// The jump button (test/interactions.test.js's climbHarness, copied, with a
// perch in reach).
// ---------------------------------------------------------------------------
describe('the jump button', () => {
  const LOW = { x: 0, z: 0, y: 1.0, label: 'ledge', vantage: true };

  function climbHarness({ traversal, fair } = {}) {
    const progression = { state: { skills: [], feats: {} }, recordFeat() {}, addPoints() {} };
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const session = {
      areaData: { perches: [LOW] },
      cat: { position: new THREE.Vector3(0, 0, 0) },
      perched: null,
      pounceCooldown: 0,
      fx: { burst() {} },
      traversal,
      fair,
    };
    let pounced = false;
    const player = { perchY: 0, halt() {}, pounce() { pounced = true; } };
    const { doPounceOrClimb } = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      player, progression, log,
      hud: { toast() {} }, audio: { trill() {}, pounceWhoosh() {} },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    return { session, player, doPounceOrClimb, pounced: () => pounced };
  }

  function guided(fn) {
    const seen = [];
    const off = bus.on('guide:did', (e) => seen.push(e));
    try { fn(); } finally { off(); }
    return seen;
  }

  it('a press the moves take: no perch, no pounce, and the guide hears a pounce', () => {
    const jump = vi.fn(() => true);
    const h = climbHarness({ traversal: { jump } });
    const seen = guided(() => h.doPounceOrClimb());
    expect(jump).toHaveBeenCalledTimes(1);
    expect(jump.mock.calls[0][0]).toEqual({ cat: h.session.cat, player: h.player, session: h.session });
    expect(h.session.perched).toBeNull();
    expect(h.player.perchY).toBe(0);
    expect(h.pounced()).toBe(false);
    expect(seen).toEqual([{ what: 'pounce' }]);
  });

  it('a press that is not theirs climbs the perch as before', () => {
    const jump = vi.fn(() => false);
    const h = climbHarness({ traversal: { jump } });
    h.doPounceOrClimb();
    expect(jump).toHaveBeenCalledTimes(1);
    expect(h.session.perched).toBe(LOW);
    expect(h.player.perchY).toBe(1.0);
  });

  it('with NO_TRAVERSAL the perch is taken as before', () => {
    const h = climbHarness({ traversal: NO_TRAVERSAL });
    h.doPounceOrClimb();
    expect(h.session.perched).toBe(LOW);
  });

  it('the rides answer first: when they take it, the moves are never asked', () => {
    const jump = vi.fn(() => true);
    const h = climbHarness({ traversal: { jump }, fair: { jump: () => true } });
    h.doPounceOrClimb();
    expect(jump).not.toHaveBeenCalled();
    expect(h.session.perched).toBeNull();
  });

  it('a press on a crossing or mid-hop never boards a ride: the moves have it', () => {
    const jump = vi.fn(() => true);
    const ride = vi.fn(() => true);
    const h = climbHarness({ traversal: { busy: true, jump }, fair: { jump: ride } });
    h.doPounceOrClimb();
    expect(ride).not.toHaveBeenCalled();
    expect(jump).toHaveBeenCalledTimes(1);
    expect(h.session.perched).toBeNull();
    // with NO_TRAVERSAL (every shipped area) the ride is asked first, as before
    const seat = vi.fn(() => true);
    const n = climbHarness({ traversal: NO_TRAVERSAL, fair: { jump: seat } });
    n.doPounceOrClimb();
    expect(seat).toHaveBeenCalledTimes(1);
    expect(n.session.perched).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No prompts on a crossing or in the air (test/groundsystems.test.js's
// levelHarness, copied, on the height fixture's plateau).
// ---------------------------------------------------------------------------
it('no prompts while she is on a crossing or in the air', () => {
  const ground = buildHeightFixture(new THREE.Scene()).ground;
  const top = { id: 'top', x: 8, z: 2, label: 'the plateau' };
  const scenics = [top];
  const map = new Map();
  const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
  progression.replaceFromPayload({ version: 4, skills: ['gift-paws'] });
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const prompts = [];
  const session = {
    areaId: 'fixture', ground,
    cat: { position: new THREE.Vector3(), userData: { breed: 'tabby' } },
    areaData: { collectibles: [], scenics },
    collectibleMeshes: new Map(),
    critters: { list: [], dismayNear() {} },
    strayCats: { strays: [], nearest: () => null },
    ghosts: { list: [], nearest: () => null },
    remotes: { nearest: () => null },
    secrets: { list: [] },
    tippables: { nearest: () => null, list: [] },
    scent: { nearestMound: () => null },
    goldMice: null,
    race: { promptAt: () => null },
    kittenEnc: null,
    quest: null, questGiver: null, questObject: null,
    gifts: createGifts(new THREE.Scene(), scenics, []),
    playerMarks: undefined,
    rival: undefined,
    scenicsVisited: new Set(),
    perched: null,
    walk: { carried: 0, carryCap: 2 },
    fx: { burst() {} },
    prompt: null,
    lastPromptKind: null,
  };
  const { updateInteractions } = createInteractions({
    MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
    getSession: () => session, getIsTouch: () => false,
    player: { forward: () => new THREE.Vector3(0, 0, 1), perchY: 0, swimming: false, wading: false, inWater: false },
    progression, log,
    hud: { toast() {}, setPrompt: (t) => prompts.push(t), setObjective() {} },
    audio: { trill() {}, meow() {} },
    catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
  });
  const walkTo = (x, z) => {
    session.cat.position.set(x, ground.y(x, z), z);
    updateInteractions(session);
    return session.prompt;
  };
  session.traversal = NO_TRAVERSAL;
  expect(walkTo(8, 4.6)).toEqual({ kind: 'gift-leave', data: top });
  expect(prompts.at(-1)).not.toBeNull();
  session.traversal = { busy: true };
  expect(walkTo(8, 4.6)).toBeNull();
  expect(prompts.at(-1)).toBeNull();
  expect(session.lastPromptKind).toBeNull();
});

// ---------------------------------------------------------------------------
// Walk resume: the note puts her on free ground.
// ---------------------------------------------------------------------------
it('walkresume notes the ground spot', () => {
  const session = {
    areaId: 'woods', soloSeed: 12345, walkStamp: 'walk-1', duskMode: false, duskActive: false, net: null,
    cat: { position: { x: 4.26, y: 2.5, z: -7.5 } },
    areaData: { collectibles: [] }, collectibleMeshes: new Map(),
    walk: { carried: 0, carryCap: 2 }, scenicsVisited: new Set(),
    traversal: { groundSpot: () => ({ x: -8.4, z: -13 }) },
  };
  const note = snapshotWalk(session, { yaw: 0, now: 1 });
  expect(note.x).toBe(-8.4);
  expect(note.z).toBe(-13);
  session.traversal = NO_TRAVERSAL;
  const plain = snapshotWalk(session, { yaw: 0, now: 1 });
  expect(plain.x).toBe(4.26);
  expect(plain.z).toBe(-7.5);
  // the rides' spot first, as before
  session.fair = { groundSpot: () => ({ x: 1, z: 2 }) };
  session.traversal = { groundSpot: () => ({ x: -8.4, z: -13 }) };
  expect(snapshotWalk(session, { yaw: 0, now: 1 })).toMatchObject({ x: 1, z: 2 });
});

// ---------------------------------------------------------------------------
// The paw's climb badge agrees with what the press will do: up where the
// moves would climb, nothing where they would leap, drop or look instead of
// the perch in reach.
// ---------------------------------------------------------------------------
describe("the paw's climb badge", () => {
  const state = { skills: [], feats: {} };
  const badgeSession = (w, perches = []) => ({
    cat: w.cat, areaData: { perches, boxes: [] }, perched: null, ground: w.area.ground, traversal: w.live,
  });

  it('pressKind says what the press would do, and changes nothing', () => {
    const c = yardWalk({ at: [-12, 9.4], face: [0, -1] });
    expect(c.live.pressKind(c.ctx)).toBe('climb');
    expect(c.live.busy).toBe(false);
    expect(c.events).toEqual([]);
    const l = yardWalk({ at: [3, -7.0], face: [0, 1] });
    expect(l.live.pressKind(l.ctx)).toBe('leap');
    const look = yardWalk({ at: [-12, 9.4], face: [1, 0], abilities: () => ({ ...BASE_ABILITIES, climb: 1.0 }) });
    expect(look.live.pressKind(look.ctx)).toBe('look');
    expect(look.live.looking).toBeNull();
    // and the press itself still does it
    expect(l.jump()).toBe(true);
    expect(l.live.hop?.id).toBe('gap-1');
    expect(l.live.pressKind(l.ctx)).toBe('busy');
    expect(NO_TRAVERSAL.pressKind(l.ctx)).toBeNull();
    l.session.perched = {};
    expect(yardWalk({ at: [3, -7.0], face: [0, 1] }).live.pressKind({ ...l.ctx, session: l.session })).toBeNull();
  });

  it('up where the moves climb; none where they take the press for something else or are busy', () => {
    const c = yardWalk({ at: [-12, 9.4], face: [0, -1] });
    expect(climbBadge(badgeSession(c), c.player, state)).toBe('up');
    const l = yardWalk({ at: [3, -7.0], face: [0, 1] });
    const p = l.cat.position;
    const perch = { x: p.x + 0.5, z: p.z, y: 0.6, label: 'a box' };
    expect(climbBadge({ ...badgeSession(l, [perch]), traversal: NO_TRAVERSAL }, l.player, state)).toBe('up');
    expect(climbBadge(badgeSession(l, [perch]), l.player, state)).toBeNull(); // the press leaps
    l.jump();
    expect(climbBadge(badgeSession(l, [perch]), l.player, state)).toBeNull(); // mid-hop
  });

  it('in the press’s own order: a ride’s seat before the moves, never while they are busy', () => {
    const l = yardWalk({ at: [3, -7.0], face: [0, 1] });
    const pawKind = vi.fn(() => 'up');
    const fair = { pawKind };
    // the press would board the ride before the moves could leap, so the badge says up
    expect(l.live.pressKind(l.ctx)).toBe('leap');
    expect(climbBadge({ ...badgeSession(l), fair }, l.player, state)).toBe('up');
    expect(pawKind).toHaveBeenCalledWith(l.cat, l.player, expect.objectContaining({ fair }));
    // mid-hop the press boards nothing, and the badge says nothing; the ride is not asked
    l.jump();
    pawKind.mockClear();
    expect(climbBadge({ ...badgeSession(l), fair }, l.player, state)).toBeNull();
    expect(pawKind).not.toHaveBeenCalled();
    // NO_TRAVERSAL (every shipped area): a seat in reach is up, none is nothing, as before
    const n = { ...badgeSession(l), traversal: NO_TRAVERSAL };
    expect(climbBadge({ ...n, fair }, l.player, state)).toBe('up');
    expect(climbBadge({ ...n, fair: { pawKind: () => null } }, l.player, state)).toBeNull();
    expect(climbBadge({ ...n, perched: { y: 1 }, fair: { pawKind: () => null } }, l.player, state)).toBe('down'); // not the rides': hop down
    // on a perch or a seat the rides answer too (fair-jumps, 2026-11-20): the
    // coaster's platform with the train in is up, a horse's next hop is up,
    // waiting for the train is nothing at all, and getting off a seat is down
    expect(climbBadge({ ...n, perched: { y: 1 }, fair }, l.player, state)).toBe('up');
    expect(climbBadge({ ...n, perched: { y: 1 }, fair: { pawKind: () => 'none' } }, l.player, state)).toBeNull();
    expect(climbBadge({ ...n, perched: { y: 1 }, fair: { pawKind: () => 'down' } }, l.player, state)).toBe('down');
  });
});
