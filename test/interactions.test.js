import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createInteractions, TREAT_COST } from '../src/game/interactions.js';
import { createTippables } from '../src/tippables.js';
import { createCarryables } from '../src/carryables.js';
import { createKnockables } from '../src/knockables.js';
import { createRests } from '../src/rests.js';
import { createAvatarUpdater } from '../src/game/avatar.js';
import { createPlayer } from '../src/player.js';
import { createPlayerMarks } from '../src/render/playermarks.js';
import { createBorderMarks } from '../src/render/bordermarks.js';
import { markKey } from '../src/marks.js';
import { KNOCK_KINDS, propsFor } from '../src/propsets.js';
import { createMouth, RAIN_GRIP } from '../src/carry.js';
import { createDiscoveryLog, AWARDS } from '../src/discoveries.js';
import { createProgression, CATALOG } from '../src/progression.js';
import { catsInArea } from '../src/colony.js';
import { createGoals } from '../src/goals.js';
import { createGifts } from '../src/gifts.js';
import { createStrayCats } from '../src/straycats.js';
import { createEnemyWalkLog, rollHostile, SCUFFLE_COST, SCUFFLE_FREEZE } from '../src/enemies.js';
import { PERSONALITIES } from '../src/cat/brain.js';
import { mulberry32 } from '../src/rng.js';
import { createYardDog } from '../src/yarddog.js';
import { chaseAllowed } from '../src/rivalcats.js';
import { bus } from '../src/events.js';

// src/game/* had no test coverage at all before this file — the module carve-
// out out of main.js was verified by mechanical diff and a browser smoke run.
// interactions.js turns out to import cleanly with no DOM and no THREE
// renderer (only cat/brain, climbing, skills, straycats and two local
// helpers), and handleInteract already takes the live session as an argument,
// so the tip branch can be driven for real rather than re-implemented here.
// That matters for v18 CF-2, which is a scoring bug: a re-implementation
// would have pinned the copy, not the game.

const scene = { add() {}, remove() {} };

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

// A row of props along x, so the gaps between them ARE the distances the
// cascade radius is measured against.
const row = (...xs) => xs.map((x) => ({ x, z: 0, kind: 'bin' }));

// Only the tip branch of handleInteract is exercised, and it touches exactly
// log, s.tippables, s.critters.dismayNear and s.net — everything else is a
// stub that would throw loudly if the branch ever reached for it.
function harness({ spots, state, net = null }) {
  const progression = createProgression(fakeStorage());
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const tippables = createTippables(scene, spots, { getState: () => state });
  const dismayed = [];
  const sent = [];
  const { handleInteract } = createInteractions({
    MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
    getSession: () => null, getIsTouch: () => false,
    player: {}, progression, log,
    hud: { toast() {} }, audio: { trill() {}, meow() {} },
    catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
  });
  const session = {
    playerId: 'me',
    tippables,
    critters: { dismayNear: (pos, r) => dismayed.push([pos.x, r]) },
    net: net && { sendEvent: (ev) => sent.push(ev) },
    walk: { carried: 0, carryCap: 4 },
  };
  const swat = (entry) => {
    session.prompt = { kind: 'tip', data: entry };
    handleInteract(session);
  };
  return { progression, log, tippables, session, swat, dismayed, sent };
}

describe('handleInteract — tipping props (v18 CF-2)', () => {
  // The discovery bus is a module singleton, so each test drives its own
  // goals object off it and unsubscribes afterwards.
  let offs;
  beforeEach(() => { offs = []; });
  afterEach(() => { for (const off of offs) off(); });

  // Wires a goals object to the discovery bus exactly the way main.js does,
  // and forces the 'Tip 3 things over' goal to be one of the three drawn.
  function goalsOnBus() {
    let i = -1;
    const pool = ['tip-things', 'spot-critters', 'collect'];
    // createGoals picks by index into a shrinking pool; feeding it 0 every
    // time after seeding the tip goal first is enough to make the draw fixed.
    const goals = createGoals(() => {
      i += 1;
      return i === 0 ? 2 / 11 : 0; // 'tip-things' sits at index 2 of GOAL_POOL
    });
    offs.push(bus.on('discovery', ({ type }) => goals.note(type)));
    return goals.goals.find((g) => g.id === 'tip-things');
  }

  it('pays one mischief award for one prop when the swat does not cascade', () => {
    // No Big Swat: the pre-v18 behaviour, and the rate everything below has
    // to preserve.
    const h = harness({ spots: row(0, 1.0, 2.0), state: { feats: { mischief: 39 } } });
    h.swat(h.tippables.list[0]);
    expect(h.tippables.list.map((e) => e.tipped)).toEqual([true, false, false]);
    expect(h.progression.state.feats.mischief).toBe(1);
    expect(h.progression.state.points).toBe(AWARDS.mischief);
  });

  it('pays one mischief award per prop the cascade actually tips', () => {
    // THE defect: three props went over for one point and one goal tick,
    // where three separate taps paid three of each. An ability earned by
    // tipping 40 things was making the tipping goal slower.
    const h = harness({ spots: row(0, 1.0, 2.0), state: { skills: ['big-swat'] } });
    h.swat(h.tippables.list[0]);
    expect(h.tippables.list.every((e) => e.tipped)).toBe(true);
    expect(h.progression.state.feats.mischief).toBe(3);
    expect(h.progression.state.points).toBe(3 * AWARDS.mischief);
  });

  it('moves the "Tip 3 things over" goal once per prop, so a cascade finishes it', () => {
    const goal = goalsOnBus();
    const h = harness({ spots: row(0, 1.0, 2.0), state: { skills: ['big-swat'] } });
    h.swat(h.tippables.list[0]);
    expect(goal.progress).toBe(3);
    expect(goal.done).toBe(true);
  });

  it('scores a cascade of three exactly as three separate taps score', () => {
    // The "this is not a rebalance" claim, asserted rather than asserted-in-
    // a-comment: same props, same rate, whoever knocked them down.
    const cascaded = harness({ spots: row(0, 1.0, 2.0), state: { skills: ['big-swat'] } });
    cascaded.swat(cascaded.tippables.list[0]);
    const separate = harness({ spots: row(0, 20, 40), state: null });
    for (const e of separate.tippables.list) separate.swat(e);
    expect(cascaded.progression.state.points).toBe(separate.progression.state.points);
    expect(cascaded.progression.state.feats.mischief).toBe(separate.progression.state.feats.mischief);
  });

  it('cannot be farmed: a re-swat of a felled prop pays nothing', () => {
    // Two independent caps, both still in force. tip() refuses an entry that
    // is already down, so the branch never runs a second time; and even if it
    // did, awardOnce is keyed `tip-<id>` per walk.
    const h = harness({ spots: row(0, 1.0, 2.0), state: { skills: ['big-swat'] } });
    h.swat(h.tippables.list[0]);
    const after = h.progression.state.points;
    h.swat(h.tippables.list[0]); // the prop you swatted
    h.swat(h.tippables.list[2]); // one the cascade felled for you
    expect(h.progression.state.points).toBe(after);
    expect(h.progression.state.feats.mischief).toBe(3);
  });

  it('caps a walk at one award per prop even across a re-tipped list', () => {
    // Belt and braces on the awardOnce key itself: reset the tipped flags
    // behind tippables' back and swat again. The entry ids are unchanged, so
    // the per-walk keys already fired and nothing more is paid.
    const h = harness({ spots: row(0, 1.0, 2.0), state: { skills: ['big-swat'] } });
    h.swat(h.tippables.list[0]);
    const after = h.progression.state.points;
    for (const e of h.tippables.list) e.tipped = false;
    h.swat(h.tippables.list[0]);
    expect(h.progression.state.points).toBe(after);
  });

  it('still broadcasts only the prop you swatted, never the cascaded ones', () => {
    // The non-goal that must hold: no new event kind, no extra events. A
    // co-walker without Big Swat sees exactly today's single tip.
    const h = harness({ spots: row(0, 1.0, 2.0), state: { skills: ['big-swat'] }, net: true });
    h.swat(h.tippables.list[0]);
    expect(h.sent).toEqual([{ v: 1, id: 'me', type: 'tip', tipId: h.tippables.list[0].id }]);
    expect(h.dismayed).toHaveLength(1); // one startled villager sweep, not three
  });

  it('pays nothing at all when the prop was already down', () => {
    const h = harness({ spots: row(0, 20), state: null, net: true });
    h.tippables.list[0].tipped = true;
    h.swat(h.tippables.list[0]);
    expect(h.progression.state.points).toBe(0);
    expect(h.sent).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// v18 CF-10a — the climb budget was never handed to bestPerch.
//
// doPounceOrClimb called bestPerch with four arguments, so it silently used
// the no-skills baseline and Spring Paws and Sure Claws did nothing in the
// running game. Same failure shape as CF-1 (Big Swat) and CF-10b (Long
// Zoomies): the ability was fully built, and the file that activates it
// belonged to a different task.
// ---------------------------------------------------------------------------

describe('doPounceOrClimb — the climb budget (v18 CF-10a)', () => {
  // A perch 2.0m up: out of the 1.6m baseline climb budget, inside Spring
  // Paws' 2.2m one. It separates the two states instead of passing under both.
  const HIGH = { x: 0, z: 0, y: 2.0, label: 'ledge', vantage: true };

  // v18 CF-9b. A gated scenery perch — one of the 49 tree forks, fence tops,
  // market awnings and benches Sure Claws opens. Its height (1.2) is inside
  // the BASELINE 1.6 climb budget on purpose: that isolates the `requires`
  // gate as the only thing keeping an unskilled cat off it, so this pair of
  // tests fails if and only if `state` stops reaching bestPerch. Untagged, so
  // it never touches feats.perch — a Mischief ability must not buy the two
  // Traversal ones.
  const GATED = { x: 0, z: 0, y: 1.2, kind: 'tree', requires: 'sure-claws' };

  function climbHarness(state, perches = [HIGH]) {
    const progression = { state, recordFeat() {}, addPoints() {} };
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const session = {
      areaData: { perches },
      cat: { position: new THREE.Vector3(0, 0, 0) },
      perched: null,
      pounceCooldown: 0,
      fx: { burst() {} },
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

  it('leaves a 2.0m perch out of reach for an unskilled cat', () => {
    const h = climbHarness({ skills: [], feats: {} });
    h.doPounceOrClimb();
    expect(h.session.perched).toBe(null);
    expect(h.pounced()).toBe(true); // fell through to an ordinary pounce
  });

  it('puts the same perch in reach with Spring Paws', () => {
    const h = climbHarness({ skills: ['spring-paws'] });
    h.doPounceOrClimb();
    expect(h.session.perched).toBe(HIGH);
    expect(h.player.perchY).toBe(2.0);
  });

  it('reads the budget live, so a skill earned mid-walk lifts the next hop', () => {
    // Spring Paws is earned at 10 vantage perches. The budget must not be a
    // snapshot taken at walk start.
    const state = { skills: [], feats: { perch: 9 } };
    const h = climbHarness(state);
    h.doPounceOrClimb();
    expect(h.session.perched).toBe(null); // one perch short
    state.feats.perch = 10;
    h.doPounceOrClimb();
    expect(h.session.perched).toBe(HIGH);
  });

  // v18 CF-9b — the SECOND half of the same wiring, and the same failure
  // shape one wave later. climbBudget was threaded by CF-10a, but the gated
  // scenery perches need the save itself to reach bestPerch. Without the
  // `state` argument all 49 of them are filtered out for every player and the
  // "props that used to be scenery" half of Sure Claws ships dead — exactly
  // what CF-10 did to Spring Paws and Long Zoomies. These two tests are the
  // guard: the climbing module's own suite cannot catch it, because the
  // omission is in this file.
  it('keeps a gated scenery perch invisible without Sure Claws', () => {
    const h = climbHarness({ skills: [], feats: {} }, [GATED]);
    h.doPounceOrClimb();
    expect(h.session.perched).toBe(null);
    expect(h.pounced()).toBe(true); // fell through to an ordinary pounce
  });

  it('opens the same perch once Sure Claws is earned', () => {
    const h = climbHarness({ skills: ['sure-claws'] }, [GATED]);
    h.doPounceOrClimb();
    expect(h.session.perched).toBe(GATED);
    expect(h.player.perchY).toBe(1.2);
  });

  it('survives a garbage save by falling back to the baseline budget', () => {
    for (const state of [null, undefined, 'nope', { skills: 'x', feats: 7 }]) {
      const h = climbHarness(state);
      expect(() => h.doPounceOrClimb()).not.toThrow();
      expect(h.session.perched).toBe(null); // baseline: 2.0m stays out of reach
    }
  });
});

// ---------------------------------------------------------------------------
// v18 final review — feats.perch was farmable.
//
// The tally sat NEXT TO log.awardOnce('scenic', …) rather than behind it, so
// it fired on every landing while the award beside it paid once. Climbing
// onto one walk-up-reachable perch and hopping straight back down re-enters
// the branch each tap: 100 taps of Space bought Spring Paws (10 perches) and
// Fence Runner (25) on a single walk, with the points ledger showing one
// 8-point scenic award the whole time.
//
// These drive the real doPounceOrClimb against a real progression, so the
// tally and the award are compared against each other rather than against a
// re-statement of the rule.
// ---------------------------------------------------------------------------

describe('doPounceOrClimb — the perch tally is not farmable', () => {
  // 0.9m up: inside the 1.6m baseline climb budget, so this is reachable with
  // no skills at all — the exploit needed no unlock to start.
  const LOW = { x: 0, z: 0, y: 0.9, label: 'fountain-edge lookout', vantage: true };
  const OTHER = { x: 6, z: 0, y: 0.9, label: 'crate stack', vantage: true };

  function farmHarness(perches) {
    const progression = createProgression(fakeStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const session = {
      areaData: { perches },
      cat: { position: new THREE.Vector3(0, 0, 0) },
      perched: null,
      pounceCooldown: 0,
      fx: { burst() {} },
    };
    const player = { perchY: 0, halt() {}, pounce() {} };
    const { doPounceOrClimb } = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      player, progression, log,
      hud: { toast() {} }, audio: { trill() {}, pounceWhoosh() {} },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    return { progression, log, session, doPounceOrClimb };
  }

  it('counts one climb no matter how many times the same perch is re-taken', () => {
    const h = farmHarness([LOW]);
    // 100 taps: odd taps climb on, even taps hop back down (the `else if
    // (session.perched)` branch), which is exactly the exploit loop.
    for (let i = 0; i < 100; i++) h.doPounceOrClimb();
    expect(h.progression.state.feats.perch).toBe(1);
    // The tally must agree with the award it rides. Before the fix these
    // disagreed 50-to-1, which is what made the bug findable at all.
    expect(h.progression.state.points).toBe(AWARDS.scenic);
    // Neither traversal ability may have unlocked off one perch.
    expect(h.progression.state.skills).not.toContain('spring-paws');
    expect(h.progression.state.skills).not.toContain('fence-runner');
  });

  it('still counts each DISTINCT perch once, so real climbing advances', () => {
    const h = farmHarness([LOW, OTHER]);
    h.doPounceOrClimb();                          // onto LOW
    h.doPounceOrClimb();                          // hop down
    h.session.cat.position.set(6, 0, 0);
    h.doPounceOrClimb();                          // onto OTHER
    expect(h.progression.state.feats.perch).toBe(2);
    expect(h.progression.state.points).toBe(AWARDS.scenic * 2);
  });

  it('re-counts the same perch on a LATER walk, matching the award it rides', () => {
    // The cap is per-walk, not lifetime — otherwise a favourite perch would
    // stop advancing the feat forever and neither ability could be finished.
    const h = farmHarness([LOW]);
    h.doPounceOrClimb();
    h.doPounceOrClimb();
    h.log.startWalk();
    h.session.perched = null;
    h.doPounceOrClimb();
    expect(h.progression.state.feats.perch).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// v18 final review — Big Swat must not shadow the prompt chain.
//
// tippables.nearest() is the same call the PROMPT scan uses, and the tip
// branch sits second in the chain. Doubling that reach to 2.6m therefore put
// "E — paw it over" ahead of stray greet (2.5), quest-accept (2.5), scratch
// (2.2), boop (1.5) and dig (1.2). At the Docks — the densest tippable field
// and the largest stray population in the game — a Big Swat player standing
// near a crate could not greet the cat in front of them.
//
// The ruling: "knock-over radius doubles" means the cascade radius only, so
// the prompt reach stays at the base 1.3m in every skill state. These drive
// the real updateInteractions against real tippables from both states.
// ---------------------------------------------------------------------------

describe('updateInteractions — Big Swat does not shadow other prompts', () => {
  // A crate 2.0m away: outside the 1.3m tip reach, inside the old doubled
  // 2.6m one. The stray stands at the same spot, well inside its own 2.5m
  // greet range, which is the exact Docks collision the review described.
  // v21 3b: `carryables` puts things on the ground for the carry prompts, and
  // `stray: null` takes Pickles away when a test needs nothing else in range.
  // v21 3b Task 11: `areaId` picks the area (and its markables), and `marks`
  // gives the session a real marks renderer (the mark prompt needs one).
  // Task 12: `rival` is the walk's session.rival stand-in (its border decals
  // and where the patrol is).
  // Task 15: `rests` gives the session its drink / eat / nap spots, and
  // `player` swaps in a real player (the nap's wake-up reads inputActive).
  function promptHarness({ skills = [], feats = {}, carryables = [], knockables = [], stray = { name: 'Pickles', greeted: false }, areaId = 'park', marks = false, rival = null, rests = null, player: realPlayer = null } = {}) {
    const progression = createProgression(fakeStorage());
    progression.replaceFromPayload({ version: 4, skills, feats });
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const tippables = createTippables(scene, [{ x: 0, z: 2.0, kind: 'bin' }],
      { getState: () => progression.state });
    const prompts = [];
    const toasts = [];
    // A real group in a scene, with a head out in front: carryables.update
    // only follows a holder that is in the scene, to its head's mouth.
    const cat = new THREE.Group();
    const head = new THREE.Group();
    head.position.set(0, 0.3, -0.35);
    cat.add(head);
    cat.userData = { breed: 'tabby', parts: { head } };
    new THREE.Scene().add(cat);
    const player = realPlayer ?? { forward: () => new THREE.Vector3(0, 0, 1), perchY: 0, swimming: false };
    const purrs = [];
    const session = {
      areaId,
      cat,
      areaData: { collectibles: [], scenics: [] },
      collectibleMeshes: new Map(),
      critters: { list: [], dismayNear() {} },
      strayCats: { strays: [], nearest: () => stray },
      ghosts: { list: [], nearest: () => null },
      remotes: { nearest: () => null },
      secrets: { list: [] },
      tippables,
      scent: { nearestMound: () => null },
      goldMice: null,
      race: { promptAt: () => null },
      kittenEnc: null,
      quest: null, questGiver: null, questObject: null,
      gifts: null,
      perched: null,
      weather: { isRaining: () => false },
      walk: { carried: 0, carryCap: 2 },
      carry: { mouth: createMouth(), items: createCarryables(scene, carryables) },
      knockables: createKnockables(scene, knockables),
      playerMarks: marks ? createPlayerMarks(new THREE.Scene(), areaId, progression.marksIn(areaId)) : undefined,
      rival: rival ?? undefined,
      rests: rests ? createRests(scene, rests) : undefined,
      rest: null,
      fx: { burst() {} },
      prompt: null,
      lastPromptKind: null,
    };
    const { updateInteractions, handleInteract, tickCarryRain } = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      player,
      progression, log,
      hud: { toast: (t) => toasts.push(t), setPrompt: (t) => prompts.push(t) },
      audio: { trill() {}, meow() {}, purr: (d) => purrs.push(d) },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    // A frame, in main.js's order: the carried item follows the mouth, then the
    // prompt scan.
    const frame = () => { session.carry.items.update(0); updateInteractions(session); };
    const walkTo = (x, z) => { session.cat.position.set(x, 0, z); frame(); };
    const press = () => { frame(); handleInteract(session); };
    return { session, prompts, toasts, walkTo, press, frame, progression, player, tickCarryRain, log, purrs };
  }

  it('offers the stray greet 2.0m from a crate, with and without Big Swat', () => {
    for (const state of [
      {},                                        // no skills at all
      { skills: ['big-swat'] },                  // persisted unlock
      { feats: { mischief: 40 } },               // live feat predicate
    ]) {
      const h = promptHarness(state);
      h.walkTo(0, 0);
      expect(h.session.prompt.kind).toBe('stray');
      expect(h.prompts.at(-1)).toBe('E — touch noses with Pickles');
    }
  });

  it('still offers the tip prompt inside the base reach in every skill state', () => {
    // The ability must not make tipping harder either — 1.0m from the crate
    // is inside 1.3m and stays a tip prompt for everyone.
    for (const state of [{}, { skills: ['big-swat'] }]) {
      const h = promptHarness(state);
      h.walkTo(0, 1.0);
      expect(h.session.prompt.kind).toBe('tip');
      expect(h.prompts.at(-1)).toBe('E — paw it over');
    }
  });

  // -------------------------------------------------------------------------
  // v21 3b Task 6 — carry, the stream's one required verb. 'carry' sits right
  // after 'collect' (the thing you walked over to); 'drop' is the very last
  // prompt, so holding something never shadows anything else.
  // -------------------------------------------------------------------------
  describe('carry: pick up, put down', () => {
    // The harness crate stands at (0, 2); the stick is well clear of it.
    const STICK = { id: 'park-stick-1', kind: 'stick', x: 5, z: 0 };
    const carryHarness = (opts = {}) => promptHarness({ stray: null, carryables: [STICK], ...opts });

    it('near a carryable with an empty mouth: "E — pick up the stick"', () => {
      const h = carryHarness();
      h.walkTo(5, 1.0);
      expect(h.session.prompt.kind).toBe('carry');
      expect(h.session.prompt.data.id).toBe('park-stick-1');
      expect(h.prompts.at(-1)).toBe('E — pick up the stick');
      h.walkTo(5, 1.3); // just past the 1.2 m reach
      expect(h.session.prompt).toBe(null);
    });

    it('holding something, with nothing else near: "E — put the stick down"', () => {
      const h = carryHarness();
      h.walkTo(5, 0.5);
      h.press();
      expect(h.session.carry.mouth.held).toEqual({ id: 'park-stick-1', kind: 'stick' });
      const item = h.session.carry.items.list[0];
      expect(item.onGround).toBe(false);
      expect(item.holder).toBe(h.session.cat);
      h.walkTo(20, 20);
      expect(h.session.prompt.kind).toBe('drop');
      expect(h.prompts.at(-1)).toBe('E — put the stick down');
      h.press();
      expect(h.session.carry.mouth.held).toBe(null);
      expect(item.onGround).toBe(true);
      // it went down somewhere new, so a walk-end drop mark is pending
      expect(h.session.carry.mouth.dropped.get('park-stick-1')).toMatchObject({ homeX: 5, homeZ: 0 });
      // and it can be picked straight back up
      h.walkTo(20, 20);
      expect(h.prompts.at(-1)).toBe('E — pick up the stick');
    });

    it('a put-down lands below the mouth, in front of the cat, not under it', () => {
      const h = carryHarness();
      h.walkTo(5, 0.5);
      h.press();
      h.walkTo(20, 20);
      const item = h.session.carry.items.list[0];
      const mouth = { x: item.mesh.position.x, z: item.mesh.position.z }; // where the mouth was
      expect(Math.hypot(mouth.x - 20, mouth.z - 20)).toBeGreaterThan(0.3);
      h.press();
      expect(item.onGround).toBe(true);
      expect(item.mesh.position.x).toBeCloseTo(mouth.x, 6);
      expect(item.mesh.position.z).toBeCloseTo(mouth.z, 6);
      expect(item.mesh.position.z).not.toBeCloseTo(h.session.cat.position.z, 1);
      const pending = h.session.carry.mouth.dropped.get('park-stick-1');
      expect(pending.x).toBeCloseTo(mouth.x, 6);
      expect(pending.z).toBeCloseTo(mouth.z, 6);
    });

    it('a put-down at the edge of the area stays inside its bounds', () => {
      const h = carryHarness();
      h.session.areaData.bounds = { minX: -30, maxX: 30, minZ: 19.8, maxZ: 30 };
      h.walkTo(5, 0.5);
      h.press();
      h.walkTo(20, 20); // the mouth pokes out past minZ
      expect(h.session.carry.items.list[0].mesh.position.z).toBeLessThan(19.8);
      h.press();
      expect(h.session.carry.items.list[0].mesh.position.z).toBe(19.8);
      expect(h.session.carry.mouth.dropped.get('park-stick-1').z).toBe(19.8);
    });

    // v21 3b Task 16: the dog takes nothing — a chased cat keeps what it holds.
    it('a chase leaves a carried item in your mouth', () => {
      const h = carryHarness();
      h.walkTo(5, 0.5);
      h.press();
      expect(h.session.carry.mouth.held).toEqual({ id: 'park-stick-1', kind: 'stick' });
      // A dog whose lawn the cat is standing on, wired the way game/walk.js
      // wires it.
      const yard = { x: 6, z: 0.5, r: 4, kennel: { x: 4, z: -1.5 } };
      const s = h.session;
      const events = [];
      const dog = createYardDog(new THREE.Scene(), yard, {
        canChase: () => chaseAllowed(h.player, s),
        onChase: () => { s.chasing = true; events.push('chase'); },
        onSettled: () => { s.chasing = false; events.push('settled'); },
      });
      const item = s.carry.items.list[0];
      for (let i = 0; i < 90; i++) {
        dog.update(1 / 60, s.cat.position, s.cat, {});
        h.frame();
        expect(s.carry.mouth.held).toEqual({ id: 'park-stick-1', kind: 'stick' });
        expect(item.onGround).toBe(false);
        expect(item.holder).toBe(s.cat);
      }
      expect(events).toEqual(['chase', 'settled']);
      expect(Math.hypot(s.cat.position.x - yard.x, s.cat.position.z - yard.z)).toBeGreaterThanOrEqual(yard.r);
      // nothing went down anywhere, so no walk-end drop mark is pending
      expect(s.carry.mouth.dropped.size).toBe(0);
      expect(h.progression.marksIn('park')).toEqual([]);
      // and it still puts down where you choose
      h.walkTo(20, 20);
      expect(h.prompts.at(-1)).toBe('E — put the stick down');
    });

    it('no drop prompt while perched: the cat keeps holding it', () => {
      const h = carryHarness();
      h.walkTo(5, 0.5);
      h.press();
      h.session.perched = { y: 1.2 };
      h.walkTo(20, 20);
      expect(h.session.prompt).toBe(null);
      h.press();
      expect(h.session.carry.mouth.held?.id).toBe('park-stick-1');
      h.session.perched = null;
      h.walkTo(20, 20);
      expect(h.prompts.at(-1)).toBe('E — put the stick down');
    });

    it('no drop prompt while swimming: the cat keeps holding it', () => {
      const h = carryHarness();
      h.walkTo(5, 0.5);
      h.press();
      h.player.swimming = true;
      h.walkTo(20, 20);
      expect(h.session.prompt).toBe(null);
      h.press();
      expect(h.session.carry.mouth.held?.id).toBe('park-stick-1');
      h.player.swimming = false;
      h.walkTo(20, 20);
      expect(h.prompts.at(-1)).toBe('E — put the stick down');
    });

    it('a stray in range still wins over drop', () => {
      const h = carryHarness();
      h.walkTo(5, 0.5);
      h.press();
      expect(h.session.carry.mouth.held?.id).toBe('park-stick-1');
      h.session.strayCats.nearest = () => ({ name: 'Pickles', greeted: false });
      h.walkTo(20, 20);
      expect(h.session.prompt.kind).toBe('stray');
      expect(h.prompts.at(-1)).toBe('E — touch noses with Pickles');
    });

    it('collect wins over carry, and carry wins over the crate', () => {
      const h = carryHarness({ carryables: [{ id: 'park-stick-2', kind: 'stick', x: 0, z: 1.2 }] });
      h.session.areaData.collectibles.push({ id: 'feather', x: 0, z: 0.8, label: 'a feather' });
      h.session.collectibleMeshes.set('feather', {});
      h.walkTo(0, 1.0); // inside collect, carry and tip reach at once
      expect(h.session.prompt.kind).toBe('collect');
      h.session.collectibleMeshes.delete('feather');
      h.walkTo(0, 1.0);
      expect(h.session.prompt.kind).toBe('carry');
      expect(h.prompts.at(-1)).toBe('E — pick up the stick');
    });

    it('picking up and putting down pay nothing and record no feat', () => {
      const h = carryHarness();
      const before = JSON.stringify({ p: h.progression.state.points, l: h.progression.state.lifetimePoints,
        f: h.progression.state.feats, m: h.progression.state.marks });
      const found = [];
      const off = bus.on('discovery', (e) => found.push(e));
      try {
        h.walkTo(5, 0.5);
        h.press(); // pick up
        h.walkTo(20, 20);
        h.press(); // put down
        h.walkTo(20, 20);
        h.press(); // pick up again
      } finally {
        off?.();
      }
      expect(h.session.carry.mouth.held?.id).toBe('park-stick-1');
      expect(found).toEqual([]);
      expect(JSON.stringify({ p: h.progression.state.points, l: h.progression.state.lifetimePoints,
        f: h.progression.state.feats, m: h.progression.state.marks })).toBe(before);
    });

    it('no carry prompt while perched', () => {
      const h = carryHarness();
      h.session.perched = { y: 1.2 };
      h.walkTo(5, 0.5);
      expect(h.session.prompt).toBe(null);
      h.press();
      expect(h.session.carry.mouth.held).toBe(null);
      h.session.perched = null;
      h.walkTo(5, 0.5);
      expect(h.session.prompt.kind).toBe('carry');
    });

    it('the collect pocket counter is untouched by carrying', () => {
      const h = carryHarness();
      h.walkTo(5, 0.5);
      h.press();
      h.walkTo(20, 20);
      h.press();
      expect(h.session.walk.carried).toBe(0);
      // a full pocket does not stop the mouth either
      h.session.walk.carried = h.session.walk.carryCap;
      h.walkTo(20, 20);
      expect(h.prompts.at(-1)).toBe('E — pick up the stick');
      h.press();
      expect(h.session.carry.mouth.held?.id).toBe('park-stick-1');
      expect(h.session.walk.carried).toBe(h.session.walk.carryCap);
    });

    // v21 3b Task 9 — rain makes the paws slippery. tickCarryRain is what
    // main.js calls each frame beside carry.items.update.
    describe('rain slips', () => {
      const RAINY = () => ({ isRaining: () => true });
      const snapshot = (h) => JSON.stringify({ p: h.progression.state.points, l: h.progression.state.lifetimePoints,
        f: h.progression.state.feats, m: h.progression.state.marks });
      // Carry the stick to the far corner in the rain, ready to tick.
      const holding = (opts) => {
        const h = carryHarness(opts);
        h.walkTo(5, 0.5);
        h.press();
        h.walkTo(20, 20);
        h.session.weather = RAINY();
        return h;
      };
      const rainFor = (h, seconds, step = 0.5) => {
        for (let t = 0; t < seconds - 1e-9; t += step) { h.tickCarryRain(h.session, step); h.session.carry.items.update(step); }
      };

      it('drops the item at your paws once the grip gives, pickable again, and costs nothing', () => {
        const h = holding();
        const before = snapshot(h);
        const found = [];
        const off = bus.on('discovery', (e) => found.push(e));
        try {
          rainFor(h, RAIN_GRIP - 0.5);
          expect(h.session.carry.mouth.held?.id).toBe('park-stick-1');
          expect(h.toasts).toEqual([]);
          rainFor(h, 0.5);
        } finally {
          off?.();
        }
        const item = h.session.carry.items.list[0];
        expect(h.session.carry.mouth.held).toBe(null);
        expect(item.onGround).toBe(true);
        // down in front of the cat (the mouth spot), a step from where it stands
        expect(Math.hypot(item.mesh.position.x - 20, item.mesh.position.z - 20)).toBeLessThan(1);
        expect(h.session.carry.mouth.dropped.get('park-stick-1')).toMatchObject({ homeX: 5, homeZ: 0 });
        expect(h.toasts).toEqual(['Your paws are too slippery — you dropped the stick! 💧']);
        expect(found).toEqual([]);
        expect(snapshot(h)).toBe(before);
        h.walkTo(20, 20);
        expect(h.prompts.at(-1)).toBe('E — pick up the stick');
      });

      it('slips again after another RAIN_GRIP seconds once picked straight back up, one toast each', () => {
        const h = holding();
        rainFor(h, RAIN_GRIP);
        h.walkTo(20, 20);
        h.press(); // pick it straight back up
        expect(h.session.carry.mouth.held?.id).toBe('park-stick-1');
        rainFor(h, RAIN_GRIP - 0.5);
        expect(h.session.carry.mouth.held?.id).toBe('park-stick-1');
        rainFor(h, 0.5);
        expect(h.session.carry.mouth.held).toBe(null);
        expect(h.toasts).toHaveLength(2);
      });

      it('toasts exactly once per slip however long the rain goes on', () => {
        const h = holding();
        rainFor(h, RAIN_GRIP * 5);
        expect(h.toasts).toHaveLength(1);
      });

      it('dry weather, a missing weather object and a stub without isRaining never slip', () => {
        for (const weather of [{ isRaining: () => false }, undefined, null, {}, { condition: 'clear', update() {} }]) {
          const h = holding();
          h.session.weather = weather;
          expect(() => rainFor(h, RAIN_GRIP * 3)).not.toThrow();
          expect(h.session.carry.mouth.held?.id).toBe('park-stick-1');
          expect(h.toasts).toEqual([]);
        }
      });

      it('nothing held, nothing to slip', () => {
        const h = carryHarness();
        h.session.weather = RAINY();
        expect(() => rainFor(h, RAIN_GRIP * 2)).not.toThrow();
        expect(h.toasts).toEqual([]);
      });

      it('does not loosen the grip while perched or swimming; the count resumes on the ground', () => {
        const h = holding();
        h.session.perched = { y: 1.2 };
        rainFor(h, RAIN_GRIP * 3);
        expect(h.session.carry.mouth.held?.id).toBe('park-stick-1');
        expect(h.session.carry.mouth.grip).toBe(0);
        h.session.perched = null;
        h.player.swimming = true;
        rainFor(h, RAIN_GRIP * 3);
        expect(h.session.carry.mouth.held?.id).toBe('park-stick-1');
        expect(h.session.carry.mouth.grip).toBe(0);
        expect(h.toasts).toEqual([]);
        h.player.swimming = false;
        rainFor(h, RAIN_GRIP - 0.5);
        expect(h.session.carry.mouth.held?.id).toBe('park-stick-1');
        rainFor(h, 0.5);
        expect(h.session.carry.mouth.held).toBe(null);
        expect(h.toasts).toHaveLength(1);
      });

      it('in a co-walk the slip sends one carry-drop, like a player drop', () => {
        const h = holding();
        const sent = [];
        h.session.playerId = 'me-player-0001';
        h.session.net = { sendEvent: (ev) => sent.push(ev) };
        rainFor(h, RAIN_GRIP * 2);
        const item = h.session.carry.items.list[0];
        expect(sent).toEqual([{
          v: 1, id: 'me-player-0001', type: 'carry-drop', itemId: 'park-stick-1',
          pos: [item.mesh.position.x, item.mesh.position.z],
        }]);
      });
    });

    // v21 3b Task 8 — a co-walker sees it: one event per pick and per drop.
    describe('in a co-walk', () => {
      const coWalk = () => {
        const h = carryHarness();
        const sent = [];
        h.session.playerId = 'me-player-0001';
        h.session.net = { sendEvent: (ev) => sent.push(ev) };
        return { ...h, sent };
      };

      it('a local pick sends exactly one carry-pick', () => {
        const h = coWalk();
        h.walkTo(5, 0.5);
        h.press();
        expect(h.session.carry.mouth.held?.id).toBe('park-stick-1');
        expect(h.sent).toEqual([{ v: 1, id: 'me-player-0001', type: 'carry-pick', itemId: 'park-stick-1' }]);
      });

      it('a local drop sends exactly one carry-drop, at where it landed', () => {
        const h = coWalk();
        h.session.areaData.bounds = { minX: -30, maxX: 30, minZ: 19.8, maxZ: 30 };
        h.walkTo(5, 0.5);
        h.press();
        h.walkTo(20, 20); // the mouth pokes out past minZ, so the drop is clamped
        h.sent.length = 0;
        h.press();
        const item = h.session.carry.items.list[0];
        expect(h.sent).toEqual([{
          v: 1, id: 'me-player-0001', type: 'carry-drop', itemId: 'park-stick-1',
          pos: [item.mesh.position.x, item.mesh.position.z],
        }]);
        expect(h.sent[0].pos[1]).toBe(19.8);
      });

      it('a whole pick-drop-pick sends one event each, in order', () => {
        const h = coWalk();
        h.walkTo(5, 0.5);
        h.press();
        h.walkTo(20, 20);
        h.press();
        h.walkTo(20, 20);
        h.press();
        expect(h.sent.map((e) => e.type)).toEqual(['carry-pick', 'carry-drop', 'carry-pick']);
      });

      it('solo (no s.net) sends none', () => {
        const h = carryHarness();
        expect(h.session.net).toBeUndefined();
        expect(() => {
          h.walkTo(5, 0.5);
          h.press();
          h.walkTo(20, 20);
          h.press();
        }).not.toThrow();
        expect(h.session.carry.items.list[0].onGround).toBe(true);
      });
    });
  });

  // -------------------------------------------------------------------------
  // v21 3b Task 10 — knock it off the ledge. 'knock' sits right after
  // 'collect' and before 'carry'; it is offered only while perched, beside a
  // thing still standing on that ledge. It pays exactly what a tip pays.
  // -------------------------------------------------------------------------
  describe('knock: off the ledge', () => {
    // On a ledge 1.3 m up, well clear of the harness crate at (0, 2).
    const CUP = { id: 'neighborhood-cup-1', kind: 'cup', x: 10, z: 0, y: 1.3, fallTo: { x: 11.2, z: 0.4 } };
    const LEDGE = { x: 10.6, y: 1.3, z: 0.2 };
    const knockHarness = (opts = {}) => {
      const h = promptHarness({ stray: null, knockables: [CUP], ...opts });
      const dismayed = [];
      h.session.critters.dismayNear = (pos, r) => dismayed.push({ x: pos.x, z: pos.z, r });
      h.session.perched = { ...LEDGE };
      const discoveries = [];
      const off = bus.on('discovery', (e) => discoveries.push(e));
      return { ...h, dismayed, discoveries, off, cup: h.session.knockables.list[0] };
    };

    it('perched beside a cup: "E — knock it off! 😼", and knocking pays the tip award once', () => {
      const h = knockHarness();
      try {
        h.walkTo(LEDGE.x, LEDGE.z);
        expect(h.session.prompt.kind).toBe('knock');
        expect(h.session.prompt.data).toBe(h.cup);
        expect(h.prompts.at(-1)).toBe('E — knock it off! 😼');
        h.press();
        expect(h.cup.down).toBe(true);
        expect(h.discoveries).toEqual([{
          type: 'mischief', key: 'knock-neighborhood-cup-1', label: 'the cup go over the edge 😼',
          points: AWARDS.mischief, repeat: false,
        }]);
        expect(h.progression.state.points).toBe(AWARDS.mischief);
        expect(h.progression.state.feats.mischief).toBe(1);
        expect(h.dismayed).toEqual([{ x: CUP.x, z: CUP.z, r: 8 }]);
        // it is down: no prompt for it, and pressing again pays nothing more
        h.walkTo(LEDGE.x, LEDGE.z);
        expect(h.session.prompt).toBe(null);
        h.press();
        h.press();
      } finally {
        h.off?.();
      }
      expect(h.discoveries).toHaveLength(1);
      expect(h.progression.state.points).toBe(AWARDS.mischief);
      expect(h.progression.state.feats.mischief).toBe(1);
    });

    // Ruling R19: the HUD toasts every discovery as "You spotted <label>"
    // (ui/hud.js), so the label must be a noun phrase like the tip's.
    it('the knock label reads well after "You spotted ", for every kind', () => {
      const hud = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
      expect(hud).toContain("'You spotted '");
      const said = {};
      for (const kind of KNOCK_KINDS) {
        const h = knockHarness({ knockables: [{ ...CUP, id: `docks-${kind}-1`, kind }] });
        try {
          h.walkTo(LEDGE.x, LEDGE.z);
          h.press();
        } finally {
          h.off?.();
        }
        expect(h.discoveries).toHaveLength(1);
        expect(h.discoveries[0].key).toBe(`knock-docks-${kind}-1`);
        said[kind] = `You spotted ${h.discoveries[0].label}`;
      }
      expect(said).toEqual({
        cup: 'You spotted the cup go over the edge 😼',
        flowerpot: 'You spotted the flowerpot go over the edge 😼',
        can: 'You spotted the can go over the edge 😼',
        book: 'You spotted the book go over the edge 😼',
        bucket: 'You spotted the bucket go over the edge 😼',
      });
      // an unknown kind is still a sentence, never "the undefined"
      for (const kind of ['teapot', '__proto__', 'constructor']) {
        const h = knockHarness({ knockables: [{ ...CUP, kind }] });
        h.walkTo(LEDGE.x, LEDGE.z);
        h.press();
        h.off?.();
        expect(`You spotted ${h.discoveries[0].label}`).toBe('You spotted the thing go over the edge 😼');
      }
    });

    it('a knock pays exactly what a tip pays: the same award type, points and feat', () => {
      const knock = knockHarness();
      knock.off?.();
      knock.walkTo(LEDGE.x, LEDGE.z);
      knock.press();
      const tip = promptHarness({ stray: null });
      tip.walkTo(0, 1.0);
      expect(tip.session.prompt.kind).toBe('tip');
      tip.press();
      expect(knock.progression.state.points).toBe(tip.progression.state.points);
      expect(knock.progression.state.lifetimePoints).toBe(tip.progression.state.lifetimePoints);
      expect(knock.progression.state.feats).toEqual(tip.progression.state.feats);
    });

    it('a stale knock prompt on a cup already down pays nothing and sends nothing', () => {
      const h = knockHarness();
      h.off?.();
      const sent = [];
      h.session.playerId = 'me-player-0001';
      h.session.net = { sendEvent: (ev) => sent.push(ev) };
      h.session.knockables.knockById(CUP.id); // a co-walker got there first
      const { handleInteract } = createInteractions({
        MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
        getSession: () => h.session, getIsTouch: () => false,
        player: {}, progression: h.progression, log: h.log,
        hud: { toast() {}, setPrompt() {} }, audio: { trill() {}, meow() {} },
        catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
      });
      h.session.prompt = { kind: 'knock', data: h.cup };
      handleInteract(h.session);
      expect(h.progression.state.points).toBe(0);
      expect(h.dismayed).toEqual([]);
      expect(sent).toEqual([]);
    });

    it('no knock prompt from the ground, or from a perch at another height', () => {
      const h = knockHarness();
      h.off?.();
      h.session.perched = null;
      h.walkTo(LEDGE.x, LEDGE.z);
      expect(h.session.prompt).toBe(null);
      h.session.perched = { ...LEDGE, y: 2.2 };
      h.walkTo(LEDGE.x, LEDGE.z);
      expect(h.session.prompt).toBe(null);
      h.session.perched = { ...LEDGE };
      h.walkTo(CUP.x + 1.1, CUP.z); // just out of the 1.0 m reach
      expect(h.session.prompt).toBe(null);
      h.walkTo(CUP.x + 0.95, CUP.z);
      expect(h.session.prompt.kind).toBe('knock');
    });

    it('collect wins over knock, and knock wins over the crate', () => {
      const h = knockHarness({ knockables: [{ ...CUP, x: 0, z: 1.2 }] });
      h.off?.();
      h.session.perched = { x: 0, y: 1.3, z: 1.0 };
      h.session.areaData.collectibles.push({ id: 'feather', x: 0, z: 0.8, y: 1.3, label: 'a feather' });
      h.session.collectibleMeshes.set('feather', {});
      h.walkTo(0, 1.0); // inside collect, knock and tip reach at once
      expect(h.session.prompt.kind).toBe('collect');
      h.session.collectibleMeshes.delete('feather');
      h.walkTo(0, 1.0);
      expect(h.session.prompt.kind).toBe('knock');
    });

    it('knock sends one knock event in a room walk and none solo', () => {
      const solo = knockHarness();
      solo.off?.();
      solo.walkTo(LEDGE.x, LEDGE.z);
      solo.press();
      expect(solo.cup.down).toBe(true); // solo: knocked, and nothing to send it on

      const room = knockHarness();
      room.off?.();
      const sent = [];
      room.session.playerId = 'me-player-0001';
      room.session.net = { sendEvent: (ev) => sent.push(ev) };
      room.walkTo(LEDGE.x, LEDGE.z);
      room.press();
      room.walkTo(LEDGE.x, LEDGE.z);
      room.press(); // nothing left to knock: no second event
      expect(sent).toEqual([{ v: 1, id: 'me-player-0001', type: 'knock', knockId: 'neighborhood-cup-1' }]);
    });

    it('a session without knockables never offers a knock (a stand-in, or an old test session)', () => {
      const h = knockHarness();
      h.off?.();
      h.session.knockables = undefined;
      expect(() => h.walkTo(LEDGE.x, LEDGE.z)).not.toThrow();
      expect(h.session.prompt).toBe(null);
    });
  });

  // -------------------------------------------------------------------------
  // v21 3b Task 11 — your marks in the world. 'mark' sits right after the
  // head scratches; a mark pays nothing, records no feat and sends nothing.
  // -------------------------------------------------------------------------
  describe('mark: scratch your mark into it', () => {
    // The dog yard's corner fence post, which is already in the world.
    const POST = propsFor('neighborhood').markables.find((m) => m.id === 'neighborhood-post-1');
    const KEY = markKey({ kind: 'scratch', id: POST.id });
    const markHarness = (opts = {}) => {
      const h = promptHarness({ stray: null, areaId: 'neighborhood', marks: true, ...opts });
      const discoveries = [];
      const off = bus.on('discovery', (e) => discoveries.push(e));
      const sent = [];
      return { ...h, discoveries, off, sent, room: () => {
        h.session.playerId = 'me-player-0001';
        h.session.net = { sendEvent: (ev) => sent.push(ev) };
      } };
    };
    // Everything in the save but the marks, to show a mark changes nothing else.
    const allButMarks = (p) => JSON.stringify({ ...p.state, marks: undefined });

    it('beside a fence post: "E — scratch your mark into it"; scratching pays nothing and writes one mark', () => {
      const h = markHarness();
      try {
        h.room(); // in a room walk too: nothing about a mark goes on the wire
        h.walkTo(POST.x + 0.6, POST.z);
        expect(h.session.prompt).toEqual({ kind: 'mark', data: POST });
        expect(h.prompts.at(-1)).toBe('E — scratch your mark into it');
        const before = allButMarks(h.progression);
        const t0 = Date.now();
        h.press();
        expect(allButMarks(h.progression)).toBe(before); // no points, no feat, nothing
        expect(h.discoveries).toEqual([]);
        expect(h.sent).toEqual([]);
        expect(h.toasts).toEqual([]);
        const marks = h.progression.marksIn('neighborhood');
        expect(marks).toHaveLength(1);
        expect(marks[0]).toMatchObject({ kind: 'scratch', id: POST.id, x: POST.x, z: POST.z, contested: false, item: null });
        expect(marks[0].at).toBeGreaterThanOrEqual(t0);
        // and it is drawn straight away
        expect(h.session.playerMarks.list.map((e) => e.key)).toEqual([KEY]);
      } finally {
        h.off();
      }
    });

    it('no mark prompt on a post already marked, uncontested', () => {
      const h = markHarness();
      try {
        h.walkTo(POST.x + 0.6, POST.z);
        h.press();
        h.walkTo(POST.x + 0.5, POST.z + 0.2);
        expect(h.session.prompt).toBe(null);
        // pressing E on a stale prompt is harmless too: still one mark
        h.session.prompt = { kind: 'mark', data: POST };
        h.press();
        expect(h.progression.marksIn('neighborhood')).toHaveLength(1);
        // and out of reach, nothing either
        h.walkTo(POST.x + 1.3, POST.z);
        expect(h.session.prompt).toBe(null);
      } finally {
        h.off();
      }
    });

    it('a contested mark offers the prompt again, and re-marking clears contested', () => {
      const h = markHarness();
      try {
        h.walkTo(POST.x + 0.6, POST.z);
        h.press();
        const first = h.progression.marksIn('neighborhood')[0];
        expect(h.progression.contestMark('neighborhood', KEY)).toBe(true);
        h.session.playerMarks.setContested(KEY);
        h.walkTo(POST.x + 0.6, POST.z);
        expect(h.session.prompt?.kind).toBe('mark');
        const before = allButMarks(h.progression);
        h.press();
        expect(allButMarks(h.progression)).toBe(before);
        const marks = h.progression.marksIn('neighborhood');
        expect(marks).toHaveLength(1);
        expect(marks[0].contested).toBe(false);
        expect(marks[0].at).toBeGreaterThan(first.at);
        expect(h.session.playerMarks.list[0].contested).toBe(false);
        h.walkTo(POST.x + 0.6, POST.z);
        expect(h.session.prompt).toBe(null);
      } finally {
        h.off();
      }
    });

    it('a re-mark after the clock stepped back still lands, one past the old mark', () => {
      const h = markHarness();
      try {
        const future = Date.now() + 10 * 60 * 1000;
        h.progression.addMark('neighborhood', { kind: 'scratch', id: POST.id, x: POST.x, z: POST.z, at: future, contested: false, item: null });
        h.progression.contestMark('neighborhood', KEY);
        h.walkTo(POST.x + 0.6, POST.z);
        h.press();
        const [m] = h.progression.marksIn('neighborhood');
        expect(m.contested).toBe(false);
        expect(m.at).toBe(future + 1);
      } finally {
        h.off();
      }
    });

    it('digging a treasure also leaves a dig mark', () => {
      const h = markHarness();
      try {
        h.room();
        const treat = { id: 'treat-1', x: 4.2, z: -3.6 };
        h.session.scent = { nearestMound: () => ({ revealed: true }), digAt: () => treat };
        h.walkTo(4, -3.5);
        expect(h.session.prompt.kind).toBe('dig');
        h.press();
        // the dig itself is unchanged: its one award, its one event
        expect(h.discoveries.map((d) => d.key)).toEqual(['treat-1']);
        expect(h.sent).toEqual([{ v: 1, id: 'me-player-0001', type: 'dig', treatId: 'treat-1' }]);
        const marks = h.progression.marksIn('neighborhood');
        expect(marks).toHaveLength(1);
        expect(marks[0]).toMatchObject({ kind: 'dig', id: null, x: 4.2, z: -3.6, contested: false, item: null });
        expect(h.session.playerMarks.list.map((e) => e.kind)).toEqual(['dig']);
        // a dig that finds nothing leaves nothing
        h.session.scent.digAt = () => null;
        h.press();
        expect(h.progression.marksIn('neighborhood')).toHaveLength(1);
      } finally {
        h.off();
      }
    });

    it('a person or a sister\'s cat beside the post always wins: head scratches, then the boop, then the mark (R23)', () => {
      const h = markHarness();
      try {
        const at = { x: POST.x + 0.6, z: POST.z };
        const villager = { type: 'villager', scratched: false, group: new THREE.Group() };
        villager.group.position.set(at.x + 0.5, 0, at.z);
        const sister = { petName: 'Biscuit', playerId: 'sis-0001' };
        h.session.critters.list = [villager];
        h.session.remotes.nearest = () => sister;
        h.walkTo(at.x, at.z);
        expect(h.session.prompt.kind).toBe('scratch');
        villager.scratched = true; // had them already
        h.walkTo(at.x, at.z);
        expect(h.session.prompt).toEqual({ kind: 'boop', data: sister });
        expect(h.prompts.at(-1)).toBe('E — touch noses with Biscuit');
        h.session.remotes.nearest = () => null; // she wandered off
        h.walkTo(at.x, at.z);
        expect(h.session.prompt.kind).toBe('mark');
      } finally {
        h.off();
      }
    });

    it('reads the markables once per area, not every frame', () => {
      const h = markHarness();
      try {
        const clone = globalThis.structuredClone;
        let clones = 0;
        globalThis.structuredClone = (v) => { clones += 1; return clone(v); };
        try {
          for (let i = 0; i < 5; i++) h.walkTo(POST.x + 0.6, POST.z);
        } finally {
          globalThis.structuredClone = clone;
        }
        expect(h.session.prompt.kind).toBe('mark');
        expect(clones).toBeLessThanOrEqual(1);
      } finally {
        h.off();
      }
    });

    it('never from a perch or while swimming, and never without a marks renderer', () => {
      const h = markHarness();
      try {
        h.session.perched = { x: POST.x + 0.6, y: 0.85, z: POST.z };
        h.walkTo(POST.x + 0.6, POST.z);
        expect(h.session.prompt).toBe(null);
        h.session.perched = null;
        h.player.swimming = true;
        h.walkTo(POST.x + 0.6, POST.z);
        expect(h.session.prompt).toBe(null);
        h.player.swimming = false;
        h.session.playerMarks = undefined;
        h.walkTo(POST.x + 0.6, POST.z);
        expect(h.session.prompt).toBe(null);
      } finally {
        h.off();
      }
    });
  });

  // v21 3b Task 12 — the player scents over a rival's border mark.
  describe('border-mark: scent over their mark', () => {
    const borderHarness = (areaId = 'park', tier = {}) => {
      const borderMarks = createBorderMarks(new THREE.Scene(), areaId, tier);
      const h = promptHarness({ stray: null, areaId, marks: true, rival: { borderMarks, patrolPos: () => null } });
      const discoveries = [];
      const off = bus.on('discovery', (e) => discoveries.push(e));
      const sent = [];
      h.session.playerId = 'me-player-0001';
      h.session.net = { sendEvent: (ev) => sent.push(ev) }; // a room walk: still nothing on the wire
      return { ...h, borderMarks, discoveries, sent, off };
    };
    const allButMarks = (p) => JSON.stringify({ ...p.state, marks: undefined });

    it('near a rival border mark: "E — scent over their mark"; it writes a border mark and pays nothing', () => {
      const h = borderHarness();
      try {
        const decal = h.borderMarks.list[3];
        h.walkTo(decal.x + 0.6, decal.z);
        expect(h.session.prompt).toEqual({ kind: 'border-mark', data: { index: 3, ring: 3, x: decal.x, z: decal.z } });
        expect(h.prompts.at(-1)).toBe('E — scent over their mark');
        const before = allButMarks(h.progression);
        h.press();
        expect(allButMarks(h.progression)).toBe(before); // no points, no feat, nothing
        expect(h.discoveries).toEqual([]);
        expect(h.sent).toEqual([]);
        expect(h.toasts).toEqual([]);
        const marks = h.progression.marksIn('park');
        expect(marks).toHaveLength(1);
        expect(marks[0]).toMatchObject({ kind: 'border', id: 'park-border-3', x: decal.x, z: decal.z, contested: false, item: null });
        // their mark goes pale, yours is drawn on it, and only that one
        expect(h.borderMarks.list.map((m) => m.contested)).toEqual(h.borderMarks.list.map((_, i) => i === 3));
        expect(h.session.playerMarks.list.map((e) => e.key)).toEqual(['border:park-border-3']);
        // done: no prompt there again, and out of reach of the next one nothing either
        h.walkTo(decal.x + 0.6, decal.z);
        expect(h.session.prompt).toBe(null);
        const next = h.borderMarks.list[5];
        h.walkTo(next.x + 1.05, next.z);
        expect(h.session.prompt).toBe(null);
        // the next one along still offers it
        h.walkTo(next.x + 0.9, next.z);
        expect(h.session.prompt?.kind).toBe('border-mark');
      } finally {
        h.off();
      }
    });

    it('on the low tier the saved id is the ring index, not the list index', () => {
      const h = borderHarness('park', { maxMarks: 8 });
      try {
        const decal = h.borderMarks.list[2];
        expect(decal.ring).toBe(4);
        h.walkTo(decal.x, decal.z + 0.5);
        expect(h.session.prompt.data).toMatchObject({ index: 2, ring: 4 });
        h.press();
        expect(h.progression.marksIn('park').map((m) => m.id)).toEqual(['park-border-4']);
        expect(h.borderMarks.list[2].contested).toBe(true);
      } finally {
        h.off();
      }
    });

    it('comes right after the mark: at the docks bollard, scratch first, then scent over', () => {
      const h = borderHarness('docks');
      try {
        const post = propsFor('docks').markables.find((m) => m.nearBorder);
        const decal = h.borderMarks.list.find((m) => Math.hypot(m.x - post.x, m.z - post.z) < 1.3);
        const at = { x: (post.x + decal.x) / 2, z: (post.z + decal.z) / 2 };
        h.walkTo(at.x, at.z);
        expect(h.session.prompt.kind).toBe('mark');
        h.press();
        h.walkTo(at.x, at.z);
        expect(h.session.prompt.kind).toBe('border-mark');
      } finally {
        h.off();
      }
    });

    it('never from a perch, while swimming, or without a rival border', () => {
      const h = borderHarness();
      try {
        const decal = h.borderMarks.list[3];
        h.session.perched = { x: decal.x, y: 0.85, z: decal.z };
        h.walkTo(decal.x + 0.5, decal.z);
        expect(h.session.prompt).toBe(null);
        h.session.perched = null;
        h.player.swimming = true;
        h.walkTo(decal.x + 0.5, decal.z);
        expect(h.session.prompt).toBe(null);
        h.player.swimming = false;
        h.session.rival = { borderMarks: null, patrolPos: () => null }; // the den's NO_RIVAL
        h.walkTo(decal.x + 0.5, decal.z);
        expect(h.session.prompt).toBe(null);
      } finally {
        h.off();
      }
    });
  });

  // -------------------------------------------------------------------------
  // v21 3b Task 15 — drink, eat and nap, for nothing but the fun of it.
  // 'rest' sits right after 'border-mark'; it pays nothing, ever.
  // -------------------------------------------------------------------------
  describe('rest: drink, eat and nap', () => {
    const PARK = propsFor('park').rests;
    const spot = (kind) => PARK.find((r) => r.kind === kind);
    const COPY = {
      drink: ['E — have a drink', 'Slurp, slurp. 💧'],
      eat: ['E — have a nibble', 'Nom nom. 🐟'],
      nap: ['E — curl up for a nap', 'Zzz… 💤'],
    };
    const part = () => new THREE.Object3D();
    // A document that hands its key listeners back, so a real player can be
    // driven by the arrow keys (the pounce.test.js withFakeDocument idiom).
    let restoreDoc;
    let keyListeners;
    beforeEach(() => {
      const prev = globalThis.document;
      keyListeners = { keydown: [], keyup: [] };
      globalThis.document = {
        addEventListener: (type, fn) => keyListeners[type]?.push(fn),
        pointerLockElement: null,
        exitPointerLock() {},
      };
      restoreDoc = () => {
        if (prev === undefined) delete globalThis.document;
        else globalThis.document = prev;
      };
    });
    afterEach(() => restoreDoc());
    const key = (type, code) => { for (const fn of keyListeners[type]) fn({ code, preventDefault() {} }); };

    // The prompt harness with the park's rests, a real player, and the real
    // updateAvatar ticking the same session (the pose, the nap, the purr).
    function restHarness(opts = {}) {
      const player = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
      const h = promptHarness({ stray: null, rests: PARK, player, ...opts });
      player.setAvatar(h.session.cat, 3.5);
      player.enable();
      const s = h.session;
      s.cat.userData.parts = {
        body: part(), head: s.cat.userData.parts.head, tail: part(),
        tailPivots: [part(), part()], legs: [part(), part(), part(), part()],
        earL: part(), earR: part(),
      };
      Object.assign(s, {
        freezeTime: 0, pounceTime: 0, pounceCooldown: 0, landTime: 0, idleTime: 0,
        stepPhase: 0, stretchTime: 0, sniffTime: 0, boxTime: 0, pose: 'follow', net: null,
        balkedPuddles: new Set(), toy: { active: false }, toyGhost: { visible: false },
        groomTimers: new Map(),
      });
      s.areaData.puddles = [];
      s.areaData.boxes = [];
      Object.assign(s.critters, { setFleeModifier() {}, markStalked() {}, catchAt: () => null, pounceCatch: () => null });
      s.remotes.list = [];
      const { updateAvatar } = createAvatarUpdater({
        player, progression: h.progression, settings: { get: () => false }, log: h.log,
        hud: { toast: (t) => h.toasts.push(t) },
        audio: { landThump() {}, step() {}, bell() {}, fanfare() {}, purr: (d) => h.purrs.push(d) },
        petNameFor: () => 'x', completeTag() {}, noteBat() {},
      });
      let t = 0;
      // A frame in main.js's order: the player moves the cat, then the
      // avatar, then the prompt scan.
      const tick = (dt = 1 / 60, n = 1) => {
        for (let i = 0; i < n; i++) {
          t += dt;
          player.update(dt, [], null);
          updateAvatar(s, dt, t);
          h.frame();
        }
      };
      return { ...h, player, tick };
    }

    it('each rest kind gets its own prompt', () => {
      const h = restHarness();
      for (const kind of ['drink', 'eat', 'nap']) {
        const r = spot(kind);
        h.walkTo(r.x + 0.6, r.z);
        expect(h.session.prompt).toMatchObject({ kind: 'rest', data: { id: r.id, kind } });
        expect(h.prompts.at(-1)).toBe(COPY[kind][0]);
        h.walkTo(r.x + 1.25, r.z); // just past the 1.2 m reach
        expect(h.session.prompt).toBe(null);
      }
      // grounded only: never from a perch, never swimming
      const r = spot('drink');
      h.session.perched = { x: r.x, y: 0.6, z: r.z };
      h.walkTo(r.x + 0.5, r.z);
      expect(h.session.prompt).toBe(null);
      h.session.perched = null;
      h.player.swimming = true;
      h.walkTo(r.x + 0.5, r.z);
      expect(h.session.prompt).toBe(null);
      h.player.swimming = false;
      // and a session without rests (a stand-in) never offers it
      h.session.rests = undefined;
      expect(() => h.walkTo(r.x + 0.5, r.z)).not.toThrow();
      expect(h.session.prompt).toBe(null);
    });

    it('comes after the mark and before the drop: a post beside the bowl is scratched first, and holding a sock never hides it', () => {
      const POST = propsFor('neighborhood').markables.find((m) => m.id === 'neighborhood-post-1');
      const bowl = { id: 'neighborhood-drink-9', kind: 'drink', x: POST.x + 0.9, z: POST.z, mesh: false };
      const h = restHarness({ areaId: 'neighborhood', marks: true, rests: [bowl],
        carryables: [{ id: 'neighborhood-sock-1', kind: 'sock', x: POST.x + 0.6, z: POST.z + 3 }] });
      const at = { x: POST.x + 0.6, z: POST.z };
      h.walkTo(at.x, at.z);
      expect(h.session.prompt.kind).toBe('mark');
      h.press();
      h.walkTo(at.x, at.z);
      expect(h.session.prompt.kind).toBe('rest');
      // pick up the sock, come back: the drink still wins over "put it down"
      h.walkTo(at.x, at.z + 3);
      h.press();
      expect(h.session.carry.mouth.held?.kind).toBe('sock');
      h.walkTo(at.x, at.z);
      expect(h.session.prompt.kind).toBe('rest');
    });

    it('drinking, eating and napping pay nothing, record no feat and move no goal', () => {
      const h = restHarness();
      // Every way the game could pay, watched.
      const goals = createGoals(() => 0);
      const found = [];
      const offs = [
        bus.on('discovery', (e) => found.push(e)),
        bus.on('discovery', ({ type }) => goals.note(type)),
      ];
      const awards = [];
      for (const m of Object.keys(h.log)) {
        if (!m.startsWith('award') || typeof h.log[m] !== 'function') continue;
        const real = h.log[m];
        h.log[m] = (...a) => { awards.push([m, ...a]); return real(...a); };
      }
      const feats = [];
      const realFeat = h.progression.recordFeat;
      h.progression.recordFeat = (...a) => { feats.push(a); return realFeat(...a); };
      const sent = [];
      h.session.playerId = 'me-player-0001';
      h.session.net = { sendEvent: (ev) => sent.push(ev) }; // a room walk: still nothing on the wire
      // A sister's cat napping right beside the cushion: the nap pile is the
      // idle nap's award, never the rest's.
      const sister = { pose: 'nap', group: new THREE.Group() };
      const save = () => JSON.stringify(h.progression.state);
      const before = save();
      try {
        for (const kind of ['drink', 'eat', 'nap']) {
          const r = spot(kind);
          sister.group.position.set(r.x + 0.3, 0, r.z + 0.3);
          h.session.remotes.list = kind === 'nap' ? [sister] : [];
          h.walkTo(r.x + 0.5, r.z);
          h.press();
          expect(h.session.rest).toEqual({ kind, t: 0 });
          expect(h.toasts.at(-1)).toBe(COPY[kind][1]);
          h.tick(1 / 60, 60 * 4); // four seconds of it
          h.player.setTouchMove({ x: 0, z: -1, mag: 0.6 });
          h.tick(1 / 60, 1);
          h.player.setTouchMove(null);
          expect(h.session.rest).toBe(null);
        }
      } finally {
        for (const off of offs) off?.();
        h.progression.recordFeat = realFeat;
      }
      expect(awards).toEqual([]);
      expect(feats).toEqual([]);
      expect(found).toEqual([]);
      expect(goals.goals.map((g) => g.progress)).toEqual([0, 0, 0]);
      expect(sent).toEqual([]);
      expect(save()).toBe(before); // no points, no lifetime points, no feat, no mark, nothing
    });

    it('a sip lasts three seconds, head down in the sniff pose, and ends early if you move', () => {
      const h = restHarness();
      for (const kind of ['drink', 'eat']) {
        const r = spot(kind);
        h.walkTo(r.x + 0.5, r.z);
        h.press();
        h.tick(1 / 60, 174); // 2.9 s
        expect(h.session.pose).toBe('sniff');
        expect(h.session.rest?.kind).toBe(kind);
        expect(h.session.prompt).toBe(null); // no second "have a drink" mid-sip
        h.tick(1 / 60, 12);
        expect(h.session.rest).toBe(null);
        expect(h.session.pose).not.toBe('sniff');
        expect(h.session.prompt?.kind).toBe('rest'); // and you can have another
      }
      expect(h.purrs).toEqual([]); // a sip is quiet
      const r = spot('drink');
      h.walkTo(r.x + 0.5, r.z);
      h.press();
      h.tick(1 / 60, 30);
      key('keydown', 'ArrowUp');
      h.tick(1 / 60, 1);
      key('keyup', 'ArrowUp');
      expect(h.session.rest).toBe(null);
    });

    it('a nap lasts until you move', () => {
      const h = restHarness();
      const r = spot('nap');
      h.walkTo(r.x + 0.5, r.z);
      expect(h.prompts.at(-1)).toBe('E — curl up for a nap');
      h.press();
      expect(h.session.rest).toEqual({ kind: 'nap', t: 0 });
      expect(h.toasts.at(-1)).toBe('Zzz… 💤');
      expect(h.purrs).toHaveLength(1); // straight away
      // A long nap: it never ends on its own, and the purr keeps going.
      h.tick(1 / 60, 60 * 40);
      expect(h.session.rest?.kind).toBe('nap');
      expect(h.session.pose).toBe('nap');
      expect(h.session.prompt).toBe(null); // no "curl up for a nap" while asleep
      expect(h.purrs.length).toBeGreaterThan(40);
      // The joystick wakes it: a touch player is never stuck.
      h.player.setTouchMove({ x: 0.2, z: -1, mag: 0.4 });
      h.tick(1 / 60, 1);
      expect(h.session.rest).toBe(null);
      expect(h.session.pose).toBe('stretch'); // the wake-up stretch
      h.player.setTouchMove(null);
      const purred = h.purrs.length;
      h.tick(1 / 60, 60 * 5);
      expect(h.purrs).toHaveLength(purred); // the purr stops with the nap
      // The arrow keys wake it too.
      h.walkTo(r.x + 0.5, r.z);
      h.press();
      h.tick(1 / 60, 60);
      key('keydown', 'ArrowLeft');
      h.tick(1 / 60, 1);
      key('keyup', 'ArrowLeft');
      expect(h.session.rest).toBe(null);
      // So does a pounce, a perch, a scare or a chase: nothing traps the cat.
      for (const stir of [
        (s) => { s.pounceTime = 0.3; },
        (s) => { s.perched = { x: r.x, y: 0.6, z: r.z }; },
        (s) => { s.freezeTime = 0.8; },
        (s) => { s.chasing = true; },
      ]) {
        Object.assign(h.session, { perched: null, chasing: false, freezeTime: 0, pounceTime: 0 });
        h.walkTo(r.x + 0.5, r.z);
        h.press();
        expect(h.session.rest?.kind).toBe('nap');
        stir(h.session);
        h.tick(1 / 60, 1);
        expect(h.session.rest).toBe(null);
      }
    });
    // The shipped nap-pile award, pinned through updateAvatar: lying still
    // beside a napping sister pays it once the idle nap begins (idleTime >
    // napAt), exactly as before Task 15; a cushion nap pays it at that same
    // frame and not one frame sooner.
    it('the nap pile pays when the idle nap would, with or without a cushion, and only once', () => {
      const napAt = PERSONALITIES.tabby.special === 'napper' ? 8 : 16;
      const PILE = 'nap pile of 2! 😴';
      const firstPile = (onCushion) => {
        const h = restHarness();
        const r = spot('nap');
        const at = onCushion ? { x: r.x + 0.5, z: r.z } : { x: r.x + 6, z: r.z + 6 };
        const sister = { pose: 'nap', group: new THREE.Group() };
        sister.group.position.set(at.x + 0.3, 0, at.z + 0.3);
        h.session.remotes.list = [sister];
        h.walkTo(at.x, at.z);
        if (onCushion) {
          h.press();
          expect(h.session.rest?.kind).toBe('nap');
        } else {
          expect(h.session.prompt).toBe(null); // nowhere near a rest
        }
        const before = h.progression.state.points;
        let frame = null;
        let prevIdle = h.session.idleTime;
        for (let f = 1; f <= 60 * 20 && frame === null; f++) {
          h.tick(1 / 60, 1);
          if (h.toasts.includes(PILE)) {
            frame = f;
            // the very frame the idle clock passes napAt
            expect(prevIdle).toBeLessThanOrEqual(napAt);
            expect(h.session.idleTime).toBeGreaterThan(napAt);
            expect(h.session.pose).toBe('nap');
          } else {
            expect(h.progression.state.points).toBe(before);
          }
          prevIdle = h.session.idleTime;
        }
        expect(frame, onCushion ? 'cushion nap' : 'idle nap').not.toBeNull();
        expect(h.progression.state.points - before).toBe(AWARDS.nappile);
        h.tick(1 / 60, 60 * 5); // and only once
        expect(h.progression.state.points - before).toBe(AWARDS.nappile);
        expect(h.toasts.filter((x) => x === PILE)).toHaveLength(1);
        return frame;
      };
      const idle = firstPile(false);
      expect(Math.abs(idle - napAt * 60)).toBeLessThanOrEqual(1); // ~16 s in
      expect(firstPile(true)).toBe(idle);
    });

    // Fix round 1, item 3: any other E action gets the cat up first.
    it('pressing E for anything else ends the nap: a sister\'s cat beside the cushion is booped by a cat that is awake', () => {
      const h = restHarness();
      const r = spot('nap');
      h.walkTo(r.x + 0.5, r.z);
      h.press();
      expect(h.session.rest?.kind).toBe('nap');
      h.tick(1 / 60, 60);
      // A sister's cat pads up while mine sleeps: her prompt shows, and
      // showing it wakes nothing...
      const sister = { petName: 'Biscuit', playerId: 'sis-0001' };
      h.session.remotes.nearest = () => sister;
      h.tick(1 / 60, 1);
      expect(h.session.prompt).toEqual({ kind: 'boop', data: sister });
      expect(h.session.rest?.kind).toBe('nap');
      expect(h.session.pose).toBe('nap');
      // ...and E on it gets the cat up, then boops.
      h.press();
      expect(h.session.rest).toBe(null);
      expect(h.session.pendingBoop?.withId).toBe('sis-0001');
      expect(h.toasts.at(-1)).toBe('waiting for a boop back… 💕');
      const purred = h.purrs.length;
      h.tick(1 / 60, 1);
      expect(h.session.pose).toBe('stretch'); // the wake-up stretch
      h.tick(1 / 60, 60 * 3);
      expect(h.purrs).toHaveLength(purred); // and no more purring
    });

    it('a sip ends the same way when E is pressed for something else', () => {
      const h = restHarness();
      const r = spot('drink');
      h.walkTo(r.x + 0.5, r.z);
      h.press();
      expect(h.session.rest?.kind).toBe('drink');
      h.session.remotes.nearest = () => ({ petName: 'Biscuit', playerId: 'sis-0001' });
      h.press();
      expect(h.session.rest).toBe(null);
      expect(h.session.pendingBoop?.withId).toBe('sis-0001');
    });
  });
});

// ===========================================================================
// v18 Task 2.3 — the two passive senses abilities, driven through the exact
// function updateInteractions calls every frame. Every case is asserted in
// BOTH skill states: an ability that changes nothing without its unlock is
// half the requirement, and it is the half that is easy to get wrong.
// ===========================================================================
describe('updateSenses — Twitchy Nose and Whisker Sense (v18 Task 2.3)', () => {
  // Two collectibles: one 10m out, one 4m out. The far one sits outside the
  // 7m reveal radius updateInteractions uses for the meshes, which is the
  // point — the nose reaches further than the eyes.
  const COLLECTIBLES = [
    { id: 'far', x: 10, z: 0, label: 'a far thing' },
    { id: 'near', x: 4, z: 0, label: 'a near thing' },
  ];

  function sensesHarness(skills = []) {
    const progression = { state: { skills, feats: {}, golden: [] } };
    const log = createDiscoveryLog({ addPoints() {} });
    log.startWalk();
    const trails = [];
    const shimmers = [];
    const pings = [];
    const session = {
      cat: { position: new THREE.Vector3(0, 0, 0) },
      areaData: { collectibles: COLLECTIBLES },
      collectibleMeshes: new Map(COLLECTIBLES.map((c) => [c.id, {}])),
      scent: {
        trailTo(from, to, opts) {
          trails.push({ from: { x: from.x, z: from.z }, to, opts });
          return { x: to.x, z: to.z };
        },
      },
      goldMice: {
        mice: [],
        nearestUnfound(pos, maxDist, found) {
          let best = null;
          let bestD = maxDist;
          for (const m of session.goldMice.mice) {
            if (found && found.has(m.id)) continue;
            const d = Math.hypot(m.x - pos.x, m.z - pos.z);
            if (d < bestD) { bestD = d; best = m; }
          }
          return best ? { mouse: best, dist: bestD } : null;
        },
      },
      fx: { shimmer: (at, color, n) => shimmers.push({ x: at.x, y: at.y, z: at.z, color, n }) },
    };
    const { updateSenses } = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      player: { perchY: 0 }, progression, log,
      hud: { toast() {} },
      audio: { trill() {}, whiskerPing: (c) => pings.push(c) },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    // The throttles key off wall-clock seconds, which a test cannot wind
    // forward — so tick() deliberately opens both gates, and the throttle
    // test asserts on where the gates were pushed TO instead.
    const tick = ({ force = true } = {}) => {
      if (force) { session.noseNextAt = 0; session.whiskerNextAt = 0; }
      updateSenses(session, session.cat.position);
    };
    return { progression, session, updateSenses, tick, trails, shimmers, pings };
  }

  // --- Twitchy Nose ------------------------------------------------------

  it('lays no trail at all without Twitchy Nose', () => {
    const h = sensesHarness([]);
    for (let i = 0; i < 5; i++) h.tick();
    expect(h.trails).toHaveLength(0);
  });

  it('lays a trail toward the NEAREST uncollected collectible with Twitchy Nose', () => {
    const h = sensesHarness(['twitchy-nose']);
    h.tick();
    expect(h.trails).toHaveLength(1);
    expect(h.trails[0].to.id).toBe('near');
  });

  it('retargets once the near one is picked up, and stops when all are gone', () => {
    const h = sensesHarness(['twitchy-nose']);
    h.tick();
    expect(h.trails[0].to.id).toBe('near');
    // handleInteract's 'collect' branch is what removes the mesh; a remote
    // co-walker's collect event removes it too. Either way the Map is the
    // authority on "still on the ground".
    h.session.collectibleMeshes.delete('near');
    h.tick();
    expect(h.trails[1].to.id).toBe('far');
    h.session.collectibleMeshes.delete('far');
    h.tick();
    expect(h.trails).toHaveLength(2); // nothing left to point at
  });

  it('reaches further than the eye — a collectible outside the reveal radius', () => {
    const h = sensesHarness(['twitchy-nose']);
    h.session.collectibleMeshes.delete('near');
    h.tick();
    // 10m out: past updateInteractions' 7m reveal, inside the 22m nose range.
    expect(h.trails[0].to.id).toBe('far');
  });

  it('ignores anything past the nose range', () => {
    const h = sensesHarness(['twitchy-nose']);
    h.session.areaData.collectibles = [{ id: 'miles', x: 400, z: 0 }];
    h.session.collectibleMeshes = new Map([['miles', {}]]);
    h.tick();
    expect(h.trails).toHaveLength(0);
  });

  it('relays from where the cat is NOW, so the trail follows the player', () => {
    const h = sensesHarness(['twitchy-nose']);
    h.tick();
    h.session.cat.position.set(1, 0, 2);
    h.tick();
    expect(h.trails[0].from).toEqual({ x: 0, z: 0 });
    expect(h.trails[1].from).toEqual({ x: 1, z: 2 });
  });

  it('throttles: the gate closes after a relay and holds on the next frame', () => {
    const h = sensesHarness(['twitchy-nose']);
    h.tick();
    expect(h.session.noseNextAt).toBeGreaterThan(0);
    h.tick({ force: false });
    expect(h.trails).toHaveLength(1); // the closed gate held
  });

  it('clips the trail rather than drawing the whole way to a distant target', () => {
    const h = sensesHarness(['twitchy-nose']);
    h.tick();
    expect(h.trails[0].opts.maxDist).toBeLessThan(22);
  });

  // --- Whisker Sense -----------------------------------------------------

  it('never shimmers or pings without Whisker Sense, even on top of a mouse', () => {
    const h = sensesHarness([]);
    h.session.goldMice.mice = [{ id: 'gm-park-1', x: 0, z: 0 }];
    for (let i = 0; i < 5; i++) h.tick();
    expect(h.shimmers).toHaveLength(0);
    expect(h.pings).toHaveLength(0);
  });

  it('shimmers and pings for an unfound mouse in range with Whisker Sense', () => {
    const h = sensesHarness(['whisker-sense']);
    h.session.goldMice.mice = [{ id: 'gm-park-1', x: 5, z: 0 }];
    h.tick();
    expect(h.shimmers).toHaveLength(1);
    expect(h.pings).toHaveLength(1);
  });

  it('NEVER pings a mouse the player has already found', () => {
    // The ability's one hard rule. state.golden is the player's own record of
    // caught mice, and updateSenses must re-read it, not trust a stale set.
    const h = sensesHarness(['whisker-sense']);
    h.session.goldMice.mice = [{ id: 'gm-park-1', x: 2, z: 0 }];
    h.tick();
    expect(h.pings).toHaveLength(1);
    h.progression.state.golden = ['gm-park-1'];
    for (let i = 0; i < 5; i++) h.tick();
    expect(h.pings).toHaveLength(1); // no further pings
    expect(h.shimmers).toHaveLength(1);
  });

  it('still pings a DIFFERENT mouse once one has been found', () => {
    const h = sensesHarness(['whisker-sense']);
    h.session.goldMice.mice = [
      { id: 'gm-park-1', x: 2, z: 0 },
      { id: 'gm-park-2', x: 6, z: 0 },
    ];
    h.progression.state.golden = ['gm-park-1'];
    h.tick();
    expect(h.pings).toHaveLength(1);
    expect(h.shimmers[0].x).toBeGreaterThan(0); // pointing at gm-park-2, +x
  });

  it('stays quiet with nothing in range', () => {
    const h = sensesHarness(['whisker-sense']);
    h.session.goldMice.mice = [{ id: 'gm-park-1', x: 90, z: 0 }];
    h.tick();
    expect(h.pings).toHaveLength(0);
    expect(h.shimmers).toHaveLength(0);
  });

  it('pings higher and more often the closer the mouse gets', () => {
    const far = sensesHarness(['whisker-sense']);
    far.session.goldMice.mice = [{ id: 'gm-park-1', x: 11, z: 0 }];
    far.tick();
    const near = sensesHarness(['whisker-sense']);
    near.session.goldMice.mice = [{ id: 'gm-park-1', x: 1, z: 0 }];
    near.tick();
    expect(near.pings[0]).toBeGreaterThan(far.pings[0]);      // pitch
    // rate: the gap to the next ping shrinks as you close in
    expect(near.session.whiskerNextAt).toBeLessThan(far.session.whiskerNextAt);
  });

  it('shimmers a step out from the cat on the bearing to the mouse, never on it', () => {
    const h = sensesHarness(['whisker-sense']);
    h.session.goldMice.mice = [{ id: 'gm-park-1', x: 0, z: 8 }];
    h.tick();
    const s = h.shimmers[0];
    expect(s.z).toBeGreaterThan(0);       // toward the mouse
    expect(s.z).toBeLessThan(2);          // a step out, not at the mouse
    expect(s.x).toBeCloseTo(0, 5);
    expect(s.y).toBeGreaterThan(0);
  });

  // --- both, and neither -------------------------------------------------

  it('a save with no skills at all changes nothing about either sense', () => {
    const h = sensesHarness([]);
    h.session.goldMice.mice = [{ id: 'gm-park-1', x: 1, z: 0 }];
    for (let i = 0; i < 10; i++) h.tick();
    expect(h.trails).toHaveLength(0);
    expect(h.shimmers).toHaveLength(0);
    expect(h.pings).toHaveLength(0);
  });

  it('survives a hostile or missing save rather than throwing mid-frame', () => {
    for (const state of [null, undefined, 'nope', { skills: 'x', feats: 7, golden: 'abc' }]) {
      const h = sensesHarness([]);
      h.progression.state = state;
      h.session.goldMice.mice = [{ id: 'gm-park-1', x: 1, z: 0 }];
      expect(() => h.tick()).not.toThrow();
      expect(h.pings).toHaveLength(0);
    }
  });

  it('does not need a scent or goldMice to exist', () => {
    const h = sensesHarness(['twitchy-nose', 'whisker-sense']);
    h.session.scent = null;
    h.session.goldMice = null;
    expect(() => h.tick()).not.toThrow();
  });
});

// ===========================================================================
// v18 Task 3.1 — Fence Runner, driven through doPounceOrClimb.
//
// climbing.test.js pins the RULE (and BFSes the shipped perch arrays to prove
// it moves no reachability). This block pins the WIRING: that the running
// game's one climb call site actually passes the option, reads it live off
// the save, and leaves the no-skill press byte-identical.
// ===========================================================================
describe('doPounceOrClimb — Fence Runner (v18 Task 3.1)', () => {
  // The dog-yard fence tops, verbatim from src/world/neighborhood.js:
  // 5.657 apart, both y 0.85 — the fence line the ability was sized for.
  const FENCE_A = { x: 22, z: -28, y: 0.85 };
  const FENCE_B = { x: 18, z: -24, y: 0.85 };

  function fenceHarness(state, perches = [FENCE_A, FENCE_B]) {
    const progression = { state, recordFeat() {}, addPoints() {} };
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const bursts = [];
    const session = {
      areaData: { perches },
      cat: { position: new THREE.Vector3(FENCE_A.x, FENCE_A.y, FENCE_A.z) },
      perched: FENCE_A,
      pounceCooldown: 0,
      fx: { burst: (pos) => bursts.push({ x: pos.x, z: pos.z }) },
    };
    let pounced = false;
    const player = { perchY: FENCE_A.y, halt() {}, pounce() { pounced = true; } };
    const { doPounceOrClimb } = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      player, progression, log,
      hud: { toast() {} }, audio: { trill() {}, pounceWhoosh() {} },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    return { session, player, doPounceOrClimb, bursts, pounced: () => pounced };
  }

  it('hops DOWN off the fence without the skill, exactly as today', () => {
    const h = fenceHarness({ skills: [], feats: {} });
    h.doPounceOrClimb();
    expect(h.session.perched).toBe(null);
    expect(h.player.perchY).toBe(0);
    expect(h.session.cat.position.x).toBe(FENCE_A.x); // still where it was
  });

  it('runs the fence line to the next post with the skill', () => {
    const h = fenceHarness({ skills: ['fence-runner'] });
    h.doPounceOrClimb();
    expect(h.session.perched).toBe(FENCE_B);
    expect(h.player.perchY).toBe(FENCE_B.y);
    expect(h.session.cat.position.x).toBe(FENCE_B.x);
    expect(h.session.cat.position.z).toBe(FENCE_B.z);
  });

  it('never dashes from the ground — the whole point is not dropping first', () => {
    const h = fenceHarness({ skills: ['fence-runner'] }, [FENCE_B]);
    h.session.perched = null;
    h.player.perchY = 0;
    h.doPounceOrClimb();
    expect(h.session.perched).toBe(null);
    expect(h.pounced()).toBe(true); // fell through to an ordinary pounce
  });

  it('reads the save live, so the 25th vantage perch enables the next hop', () => {
    const state = { skills: [], feats: { perch: 24 } };
    const h = fenceHarness(state);
    h.doPounceOrClimb();
    expect(h.session.perched).toBe(null); // one perch short: hopped down
    h.session.perched = FENCE_A;
    h.player.perchY = FENCE_A.y;
    h.session.cat.position.set(FENCE_A.x, FENCE_A.y, FENCE_A.z);
    state.feats.perch = 25;
    h.doPounceOrClimb();
    expect(h.session.perched).toBe(FENCE_B);
  });

  it('puffs dust at the take-off point on a wall-run, and not on an ordinary climb', () => {
    const ran = fenceHarness({ skills: ['fence-runner'] });
    ran.doPounceOrClimb();
    expect(ran.bursts).toEqual([{ x: FENCE_A.x, z: FENCE_A.z }]);
    // A perch the ordinary climb rule already reaches is not a wall-run,
    // even for a cat that has the skill.
    const near = { x: FENCE_A.x + 0.5, z: FENCE_A.z, y: 1.35 };
    const climbed = fenceHarness({ skills: ['fence-runner'] }, [FENCE_A, near]);
    climbed.doPounceOrClimb();
    expect(climbed.session.perched).toBe(near);
    expect(climbed.bursts).toEqual([]);
  });

  it('still prefers a climb over a level dash, so a chain is never shadowed', () => {
    const up = { x: FENCE_A.x + 1, z: FENCE_A.z, y: 2.0 };
    const h = fenceHarness({ skills: ['fence-runner', 'spring-paws'] }, [FENCE_A, FENCE_B, up]);
    h.doPounceOrClimb();
    expect(h.session.perched).toBe(up);
  });

  it('survives a garbage save without wall-running or throwing', () => {
    for (const state of [null, undefined, 'nope', { skills: 'x', feats: 7 }]) {
      const h = fenceHarness(state);
      expect(() => h.doPounceOrClimb()).not.toThrow();
      expect(h.session.perched).toBe(null);
    }
  });
});

// ===========================================================================
// v18 Task 3.2 — Gift Paws, driven through the real prompt scan and the real
// handleInteract, against a real progression over fake storage.
//
// Both halves of the loop are exercised: leaving a gift (persisted, capped,
// one per spot) and a visitor turning up with one they found (awarded once,
// consumed from the save, the prop removed).
//
// Every case is asserted in BOTH skill states — an ability that changes
// nothing without its unlock is the half that is easy to get wrong.
// ===========================================================================
describe('Gift Paws (v18 Task 3.2)', () => {
  // The real scenic array of src/world/park.js.
  const SCENICS = [
    { id: 'fountain', x: 3, z: 23, label: 'the old fountain' },
    { id: 'pond-shore', x: -14, z: 10, label: 'the duck pond' },
    { id: 'meadow', x: 12, z: -30, label: 'the quiet meadow' },
  ];

  function giftHarness({ skills = [], saved = [], storage = fakeStorage(), progression: override } = {}) {
    let progression = override;
    if (!progression) {
      progression = createProgression(storage);
      progression.replaceFromPayload({ version: 4, skills, gifts: saved });
    }
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const scene = { add() {}, remove() {} };
    const gifts = createGifts(scene, SCENICS, progression.giftsIn?.('park') ?? []);
    const toasts = [];
    const prompts = [];
    const strays = [];
    const ghostList = [];
    const session = {
      areaId: 'park',
      cat: { position: new THREE.Vector3(0, 0, 0), userData: { breed: 'tabby' } },
      areaData: { collectibles: [], scenics: SCENICS },
      collectibleMeshes: new Map(),
      critters: { list: [], dismayNear() {} },
      strayCats: { strays, nearest: () => null },
      ghosts: { list: ghostList, nearest: () => null },
      remotes: { nearest: () => null },
      secrets: { list: [] },
      tippables: { nearest: () => null, list: [] },
      scent: { nearestMound: () => null },
      goldMice: null,
      race: { promptAt: () => null },
      kittenEnc: null,
      quest: null, questGiver: null, questObject: null,
      gifts,
      perched: null,
      walk: { carried: 0, carryCap: 2 },
      fx: { burst() {} },
      prompt: null,
      lastPromptKind: null,
    };
    const { updateInteractions, handleInteract } = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      player: { forward: () => new THREE.Vector3(0, 0, 1), perchY: 0 },
      progression, log,
      hud: { toast: (t) => toasts.push(t), setPrompt: (t) => prompts.push(t) },
      audio: { trill() {}, meow() {} },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    const walkTo = (x, z) => { session.cat.position.set(x, 0, z); updateInteractions(session); };
    const pressE = () => handleInteract(session);
    return {
      progression, log, session, gifts, storage, toasts, prompts, strays, ghostList,
      walkTo, pressE,
    };
  }

  // --- leaving -----------------------------------------------------------

  it('offers NO gift prompt without the skill, standing right on a scenic spot', () => {
    const h = giftHarness({ skills: [] });
    h.walkTo(3, 23);
    expect(h.session.prompt).toBe(null);
    expect(h.prompts.at(-1)).toBe(null);
  });

  it('offers the prompt with the skill, and only inside range', () => {
    const h = giftHarness({ skills: ['gift-paws'] });
    h.walkTo(3, 23);
    expect(h.session.prompt.kind).toBe('gift-leave');
    expect(h.session.prompt.data.id).toBe('fountain');
    expect(h.prompts.at(-1)).toContain('the old fountain');
    h.walkTo(3, 40); // well out of range of everything
    expect(h.session.prompt).toBe(null);
  });

  it('leaves a gift on E, persists it, and pays the existing gift award once', () => {
    const h = giftHarness({ skills: ['gift-paws'] });
    h.walkTo(3, 23);
    // standing on the fountain already paid the pre-existing scenic award
    expect(h.progression.state.points).toBe(AWARDS.scenic);
    h.pressE();
    expect(h.progression.state.gifts).toEqual([{ area: 'park', spot: 'fountain' }]);
    expect(h.progression.state.points).toBe(AWARDS.scenic + AWARDS.gift);
    expect(h.gifts.list.map((g) => g.spot)).toEqual(['fountain']); // visible at once
    expect(h.toasts.at(-1)).toContain('the old fountain');
    // ...and the value of an existing award was not changed to do it
    expect(AWARDS.gift).toBe(10);
  });

  it('stops offering a spot that already holds a gift', () => {
    const h = giftHarness({ skills: ['gift-paws'] });
    h.walkTo(3, 23);
    h.pressE();
    h.walkTo(3, 23);
    expect(h.session.prompt).toBe(null);
    // a different spot is still on offer
    h.walkTo(12, -30);
    expect(h.session.prompt.data.id).toBe('meadow');
  });

  it('cannot be farmed for points by pressing E on the same spot repeatedly', () => {
    const h = giftHarness({ skills: ['gift-paws'] });
    h.walkTo(3, 23);
    for (let i = 0; i < 10; i++) h.pressE();
    expect(h.progression.state.points).toBe(AWARDS.scenic + AWARDS.gift);
    expect(h.progression.state.gifts).toHaveLength(1);
  });

  it('refuses (and says so) once the save cap is full', () => {
    const saved = Array.from({ length: 8 }, (_, i) => ({ area: 'park', spot: `held-${i}` }));
    const h = giftHarness({ skills: ['gift-paws'], saved });
    h.walkTo(3, 23);
    expect(h.session.prompt.kind).toBe('gift-leave'); // the spot is free…
    h.pressE();
    expect(h.progression.state.gifts).toHaveLength(8); // …but the satchel is not
    expect(h.toasts.at(-1)).toContain('out of gifts');
    expect(h.progression.state.points).toBe(AWARDS.scenic); // no gift award paid
  });

  it('never shadows an existing prompt — the gift branch is last in the chain', () => {
    const h = giftHarness({ skills: ['gift-paws'] });
    const stray = { name: 'Pip', breed: 'tabby', group: { position: new THREE.Vector3(3, 0, 23) } };
    h.session.strayCats.nearest = () => stray;
    h.walkTo(3, 23);
    expect(h.session.prompt.kind).toBe('stray');
  });

  it('survives an area with no scenic spots at all', () => {
    const h = giftHarness({ skills: ['gift-paws'] });
    h.session.areaData.scenics = [];
    expect(() => h.walkTo(3, 23)).not.toThrow();
    expect(h.session.prompt).toBe(null);
  });

  // --- finding -----------------------------------------------------------

  function withFinder(h, holder, gift) {
    holder.foundGift = gift;
    return holder;
  }

  it('a stray who found your gift hands it over, once, and it leaves the save', () => {
    const h = giftHarness({ skills: ['gift-paws'], saved: [{ area: 'park', spot: 'fountain' }] });
    const gift = h.gifts.list[0];
    const stray = withFinder(h, {
      name: 'Pip', hasGift: false, group: { position: new THREE.Vector3(0, 0, 0) },
    }, gift);
    h.strays.push(stray);
    h.walkTo(0, 0);
    expect(h.progression.state.points).toBe(AWARDS.gift);
    expect(h.progression.state.gifts).toEqual([]);   // consumed
    expect(h.gifts.list).toHaveLength(0);            // prop gone
    expect(stray.foundGift).toBe(null);
    // a second frame in the radius pays nothing more
    h.walkTo(0, 0);
    expect(h.progression.state.points).toBe(AWARDS.gift);
  });

  it('a ghost visitor hands it over the same way, naming the friend', () => {
    const h = giftHarness({ skills: ['gift-paws'], saved: [{ area: 'park', spot: 'meadow' }] });
    const gift = h.gifts.list[0];
    const ghost = withFinder(h, {
      playerId: 'p2', petName: 'Mochi', hasGift: false,
      group: { position: new THREE.Vector3(0, 0, 0) },
    }, gift);
    h.ghostList.push(ghost);
    h.walkTo(0, 0);
    expect(h.progression.state.points).toBe(AWARDS.gift);
    expect(h.progression.state.gifts).toEqual([]);
    expect(h.gifts.list).toHaveLength(0);
    expect(ghost.foundGift).toBe(null);
    expect(ghost.hasGift).toBe(false); // the OTHER gift direction untouched
  });

  it('pays only once even if a stray AND a ghost both somehow hold it', () => {
    // claimGift is the single gate, so a hand-over race cannot double-pay.
    const h = giftHarness({ skills: ['gift-paws'], saved: [{ area: 'park', spot: 'fountain' }] });
    const gift = h.gifts.list[0];
    h.strays.push(withFinder(h, { name: 'Pip', group: { position: new THREE.Vector3(0, 0, 0) } }, gift));
    h.ghostList.push(withFinder(h, {
      playerId: 'p2', petName: 'Mochi', group: { position: new THREE.Vector3(0, 0, 0) },
    }, gift));
    h.walkTo(0, 0);
    expect(h.progression.state.points).toBe(AWARDS.gift);
    expect(h.progression.state.gifts).toEqual([]);
  });

  it('hands nothing over from across the map', () => {
    const h = giftHarness({ skills: ['gift-paws'], saved: [{ area: 'park', spot: 'fountain' }] });
    const gift = h.gifts.list[0];
    h.strays.push(withFinder(h, { name: 'Pip', group: { position: new THREE.Vector3(30, 0, 30) } }, gift));
    h.walkTo(0, 0);
    expect(h.progression.state.gifts).toHaveLength(1);
    expect(h.progression.state.points).toBe(0);
  });

  it('does NOT need the skill to receive one — an earned gift is still found later', () => {
    // Gift Paws is what lets you LEAVE gifts. A save that somehow holds one
    // (left before a threshold change, restored from cloud) must still be
    // able to have it found.
    const h = giftHarness({ skills: [], saved: [{ area: 'park', spot: 'fountain' }] });
    const gift = h.gifts.list[0];
    h.strays.push(withFinder(h, { name: 'Pip', group: { position: new THREE.Vector3(0, 0, 0) } }, gift));
    h.walkTo(0, 0);
    expect(h.progression.state.gifts).toEqual([]);
    expect(h.progression.state.points).toBe(AWARDS.gift);
  });

  it('leaves the pre-existing hasGift path exactly as it was', () => {
    // The opposite direction — a best friend bringing YOU something — must
    // keep working and must not be confused with foundGift.
    const h = giftHarness({ skills: [] });
    h.strays.push({ name: 'Pip', hasGift: true, group: { position: new THREE.Vector3(0, 0, 0) } });
    h.walkTo(0, 0);
    expect(h.progression.state.points).toBe(AWARDS.gift);
    expect(h.strays[0].hasGift).toBe(false);
  });

  it('a no-skills save with no gifts behaves exactly as today', () => {
    const h = giftHarness({ skills: [] });
    h.strays.push({ name: 'Pip', group: { position: new THREE.Vector3(0, 0, 0) } });
    h.ghostList.push({ playerId: 'p2', petName: 'Mochi', group: { position: new THREE.Vector3(0, 0, 0) } });
    for (const [x, z] of [[0, 0], [3, 23], [12, -30], [-14, 10]]) h.walkTo(x, z);
    expect(h.progression.state.gifts).toEqual([]);
    expect(h.session.prompt).toBe(null);
    // the only points paid are the scenic-visit awards that already existed
    expect(h.progression.state.points).toBe(3 * AWARDS.scenic);
  });

  it('never throws on a hostile save, and offers nothing off one', () => {
    // A stand-in progression whose `state` is whatever the cloud handed
    // back. hasSkill is total over any input, so the gift branch simply
    // never opens.
    for (const state of [null, undefined, 'nope', { skills: 'x', gifts: 'y' }, { skills: ['gift-paws'] }]) {
      const h = giftHarness({ progression: {
        state,
        giftsIn: () => [],
        leaveGift: () => false,
        claimGift: () => false,
        recordFeat() {}, addPoints() {}, recordSighting() {}, recordGreet() {},
      } });
      expect(() => h.walkTo(3, 23)).not.toThrow();
      expect(() => h.pressE()).not.toThrow();
      expect(h.gifts.list).toHaveLength(0);
    }
  });
});

// ===========================================================================
// v20 "Ruffled Fur" — the enemy system, wired into the running game.
//
// src/enemies.js (the rules) and src/nametag.js (the indicator) each have
// their own suite. Neither can catch the failure this block exists for: a
// fully-built system that no call site ever activates. That is CF-1 (Big
// Swat), CF-9b (Sure Claws), CF-10a (Spring Paws) and CF-10b (Long Zoomies)
// — four shipped-dead abilities in one wave — so every test below drives the
// REAL updateInteractions / handleInteract / awardStrayGreet against a REAL
// progression over fake storage and a REAL stray population.
//
// The roll is a pure function of (walkStamp, name), which is what makes it
// testable at all: `stampFor` searches for a walk stamp that makes a named
// cat roll a chosen way, so both outcomes are pinned by construction rather
// than by stubbing out the very function under test.
// ===========================================================================
describe('Ruffled Fur — the enemy system (v20)', () => {
  const AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };
  const HERE = new THREE.Vector3(0, 0, 0);

  // A walk stamp on which `name` rolls the way we want. At the 5% base rate a
  // hostile stamp turns up within ~20 tries; the loop is generous.
  function stampFor(name, hostile, { charmer = false } = {}) {
    for (let i = 0; i < 20000; i++) {
      const stamp = `walk-${i}`;
      if (rollHostile(stamp, name, { charmer }) === hostile) return stamp;
    }
    throw new Error(`no ${hostile ? 'hostile' : 'friendly'} stamp found for ${name}`);
  }

  function enemyHarness({
    skills = [], grudges = [], points = 0, friends = {}, breed = 'tabby', count = 1,
    scenics = [], gifts = null,
  } = {}) {
    const progression = createProgression(fakeStorage());
    progression.replaceFromPayload({ version: 4, skills, grudges, points, friends });
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const strayCats = createStrayCats(scene, AREA, count, mulberry32(11), { grudges });
    const toasts = [];
    const prompts = [];
    const hisses = [];
    let halted = 0;
    const session = {
      areaId: 'park',
      // walkStamp is set per test by `on()` below, once the stray names are
      // known — the roll is keyed on it.
      walkStamp: 'walk-0',
      cat: { position: new THREE.Vector3(0, 0, 0), userData: { breed } },
      areaData: { collectibles: [], scenics },
      collectibleMeshes: new Map(),
      critters: { list: [], dismayNear() {} },
      strayCats,
      // The per-walk enemy scratch state, exactly as game/walk.js builds it.
      enemies: createEnemyWalkLog(),
      ghosts: { list: [], nearest: () => null },
      remotes: { nearest: () => null },
      secrets: { list: [] },
      tippables: { nearest: () => null, list: [] },
      scent: { nearestMound: () => null },
      goldMice: null,
      race: { promptAt: () => null },
      kittenEnc: null,
      quest: null, questGiver: null, questObject: null,
      gifts,
      perched: null,
      freezeTime: 0,
      catsGreeted: 0,
      walk: { carried: 0, carryCap: 2 },
      fx: { burst() {} },
      prompt: null,
      lastPromptKind: null,
    };
    const api = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      // forward points at -z so the strays parked at +z below are BEHIND the
      // cat and never trip updateInteractions' spot-a-stray award. That keeps
      // the points ledger in these tests about this feature and nothing else.
      player: {
        forward: () => new THREE.Vector3(0, 0, -1),
        perchY: 0,
        halt() { halted += 1; },
      },
      progression, log,
      hud: {
        toast: (t) => toasts.push(t),
        setPrompt: (t) => prompts.push(t),
        setPoints() {},
      },
      audio: { trill() {}, meow() {}, hiss: (v) => hisses.push(v ?? 1) },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    // Park a stray `d` metres in front of the cat and hand it back.
    const park = (i, d) => {
      const s = strayCats.strays[i];
      s.personality = 'bold';           // the shy scurry is a different feature
      s.group.position.set(0, 0, d);
      return s;
    };
    return {
      progression, log, session, strayCats, toasts, prompts, hisses,
      halted: () => halted, park,
      walkTo: (x, z) => { session.cat.position.set(x, 0, z); api.updateInteractions(session); },
      scan: () => api.updateInteractions(session),
      pressE: () => api.handleInteract(session),
      greet: (s) => api.awardStrayGreet(session, s),
      ...api,
    };
  }

  // --- the price tag ------------------------------------------------------

  it('prices the reconciliation treat at exactly what a gift is worth', () => {
    // A deliberate match (see TREAT_COST's comment), asserted so it cannot
    // become an accidental mismatch.
    expect(TREAT_COST).toBe(AWARDS.gift);
    expect(AWARDS.gift).toBe(10);
  });

  // --- 1. the rupture -----------------------------------------------------

  describe('the rupture', () => {
    it('leaves an ordinary greet completely unchanged on a friendly roll', () => {
      const h = enemyHarness();
      const s = h.park(0, 1);
      h.session.walkStamp = stampFor(s.name, false);
      h.greet(s);
      expect(h.progression.state.points).toBe(AWARDS.friend);
      expect(h.progression.state.friends[s.name].greets).toBe(1);
      expect(h.progression.state.grudges).toEqual([]);
      expect(s.cross).toBe(false);
      expect(s.greeted).toBe(true);
      expect(h.session.catsGreeted).toBe(1);
    });

    it('pays nothing, records no greet, and remembers the grudge on a hostile roll', () => {
      const h = enemyHarness();
      const s = h.park(0, 1);
      h.session.walkStamp = stampFor(s.name, true);
      h.greet(s);
      expect(h.progression.state.points).toBe(0);          // no friendship award
      expect(h.progression.state.friends[s.name]).toBeUndefined(); // no greet recorded
      expect(h.progression.state.grudges).toEqual([s.name]);
      expect(s.cross).toBe(true);
      expect(s.greeted).toBe(true);   // …but the player still moves on
      expect(h.session.catsGreeted).toBe(0);
      expect(h.hisses).toHaveLength(1);
      expect(h.toasts.at(-1)).toContain(s.name);
    });

    it('cannot be re-rolled by mashing E: one stamp, one answer, one grudge', () => {
      // The anti-farm property, and the reason the roll is seeded on
      // (walkStamp, name) rather than drawn fresh. 100 attempts, and the
      // greet-award ledger must agree with the grudge table at the end.
      const h = enemyHarness();
      const s = h.park(0, 1);
      h.session.walkStamp = stampFor(s.name, true);
      for (let i = 0; i < 100; i++) h.greet(s);
      expect(h.progression.state.grudges).toEqual([s.name]);
      expect(h.progression.state.points).toBe(0);
      expect(h.progression.state.friends[s.name]).toBeUndefined();
    });

    it('never turns a cat that is already a friend (D5)', () => {
      const h = enemyHarness();
      const first = createStrayCats(scene, AREA, 1, mulberry32(11));
      const name = first.strays[0].name;
      const friendly = enemyHarness({ friends: { [name]: { greets: 3, breed: 'tabby', lastWalk: 'old' } } });
      const s = friendly.park(0, 1);
      expect(s.name).toBe(name);
      friendly.session.walkStamp = stampFor(name, true);   // the roll SAYS hostile…
      friendly.greet(s);
      expect(friendly.progression.state.grudges).toEqual([]); // …and D5 refuses it
      expect(friendly.progression.state.points).toBe(AWARDS.friend);
      void h;
    });

    it('does not advance the friendship ladder, so a rupture cannot buy immunity', () => {
      const h = enemyHarness();
      const s = h.park(0, 1);
      h.session.walkStamp = stampFor(s.name, true);
      h.greet(s);
      expect(h.progression.friendLevel(s.name)).toBe('none');
    });
  });

  // --- 2. D2: strays only -------------------------------------------------

  describe('D2 — never a family pet, never a ghost', () => {
    it('refuses to turn a ghost visitor that happens to share a stray name', () => {
      // enemies.js cannot tell these apart and says so; the guard is the call
      // site's. A ghost/remote pet is a different object in a different list,
      // and its petName is player-chosen, so this collision is reachable.
      const h = enemyHarness();
      const real = h.park(0, 1);
      h.session.walkStamp = stampFor(real.name, true);
      const ghost = {
        name: real.name, petName: real.name, breed: 'tabby',
        group: { position: new THREE.Vector3(0, 0, 1), rotation: { y: 0 } },
        greeted: false,
      };
      h.greet(ghost);
      expect(h.progression.state.grudges).toEqual([]);
      expect(ghost.cross).toBeUndefined();
      // It was greeted like anything else — the guard suppresses HOSTILITY,
      // not the greet.
      expect(h.progression.state.points).toBe(AWARDS.friend);
    });

    it('refuses to turn a family pet even smuggled into the stray list', () => {
      const h = enemyHarness();
      for (const name of ['Zeetoo', 'Rosa', 'Robbie', 'Hagrid']) {
        const pet = {
          name, breed: 'tabby', greeted: false,
          group: { position: new THREE.Vector3(0, 0, 1), rotation: { y: 0 } },
        };
        h.strayCats.strays.push(pet);
        h.session.walkStamp = stampFor(name, true);
        h.greet(pet);
        h.strayCats.strays.pop();
        expect(h.progression.state.grudges).toEqual([]);
        expect(pet.cross).toBeUndefined();
      }
    });
  });

  // --- 3. the grudge, and the prompt it replaces --------------------------

  describe('the grudge', () => {
    it('offers the treat instead of the greet, and never both', () => {
      const h = enemyHarness({ points: 40 });
      const s = h.park(0, 1);
      h.strayCats.turnHostile(s, HERE);
      s.group.position.set(0, 0, 1);
      h.scan();
      expect(h.session.prompt.kind).toBe('stray-gift');
      expect(h.session.prompt.data).toBe(s);
      expect(h.prompts.at(-1)).toContain(`offer ${s.name} a treat`);
    });

    it('says so in the prompt when the player cannot afford the treat', () => {
      const h = enemyHarness({ points: 3 });
      const s = h.park(0, 1);
      h.strayCats.turnHostile(s, HERE);
      s.group.position.set(0, 0, 1);
      h.scan();
      expect(h.session.prompt.kind).toBe('stray-gift');
      expect(h.prompts.at(-1)).toContain(`${TREAT_COST} 🐾`);
      expect(h.prompts.at(-1)).not.toContain('E —');
    });

    it('leaves the prompt ladder byte-identical for a save with no grudges', () => {
      const h = enemyHarness();
      const s = h.park(0, 1);
      h.scan();
      expect(h.session.prompt.kind).toBe('stray');
      expect(h.prompts.at(-1)).toBe(`E — touch noses with ${s.name}`);
    });

    it('is not greetable by CHAT either, which is the other door in', () => {
      // walk.js's sendPhrase finds its target with a plain nearest() and calls
      // straight into awardStrayGreet. Without the hasGrudge check in there,
      // a cat cross since a previous walk would pay a full friendship award
      // to anyone who said hello to it.
      const first = createStrayCats(scene, AREA, 1, mulberry32(11));
      const name = first.strays[0].name;
      const h = enemyHarness({ grudges: [name] });
      const s = h.park(0, 1);
      expect(s.cross).toBe(true);         // carried in from the save
      h.session.walkStamp = stampFor(name, false);
      h.greet(s);
      expect(h.progression.state.points).toBe(0);
      expect(h.progression.state.friends[name]).toBeUndefined();
      expect(h.progression.state.grudges).toEqual([name]);
    });

    it('is not shadowed by the gift-leave prompt while standing on a scenic spot', () => {
      // The placement claim, asserted. 'gift-leave' is deliberately LAST in
      // the chain and covers a 3m-wide target; a cross cat sitting on a
      // scenic spot must not have "leave a gift here" hide the one prompt
      // that can un-cross it.
      const SCENICS = [{ id: 'fountain', x: 0, z: 1, label: 'the old fountain' }];
      const h = enemyHarness({
        skills: ['gift-paws'], points: 40, scenics: SCENICS,
        gifts: createGifts(scene, SCENICS, []),
      });
      const s = h.park(0, 1);
      h.strayCats.turnHostile(s, HERE);
      s.group.position.set(0, 0, 1);
      h.scan();
      expect(h.session.prompt.kind).toBe('stray-gift');
    });
  });

  // --- 4. the scuffle -----------------------------------------------------

  describe('the scuffle', () => {
    function crowded(opts = {}) {
      const h = enemyHarness({ points: 100, count: 4, ...opts });
      const s = h.park(0, 0.6);           // well inside the 1.4m swat radius
      h.strayCats.turnHostile(s, new THREE.Vector3(0, 0, 4)); // recoil AWAY from the cat
      s.group.position.set(0, 0, 0.6);
      return { h, s };
    }

    it('swats you: the dog scare, plus a spendable-point cost', () => {
      const { h, s } = crowded();
      h.scan();
      expect(h.session.freezeTime).toBe(SCUFFLE_FREEZE);
      expect(h.halted()).toBe(1);
      expect(h.hisses).toHaveLength(1);
      expect(h.progression.state.points).toBe(100 - SCUFFLE_COST);
      expect(h.toasts.at(-1)).toContain(s.name);
    });

    it('never touches lifetimePoints, so a rank can never go backwards (D3)', () => {
      const { h } = crowded();
      const before = h.progression.state.lifetimePoints;
      h.scan();
      expect(h.progression.state.lifetimePoints).toBe(before);
    });

    it('never fires while the player is already frozen', () => {
      // The guard enemies.js explicitly leaves to the call site: without it a
      // cross cat you are standing beside re-swats the instant each freeze
      // expires, which is a freeze-lock.
      const { h } = crowded();
      h.session.freezeTime = 1.0;
      for (let i = 0; i < 50; i++) h.scan();
      expect(h.progression.state.points).toBe(100);
      expect(h.hisses).toHaveLength(0);
    });

    it('swats at most once per cat, however many frames you stand there', () => {
      const { h, s } = crowded();
      for (let i = 0; i < 200; i++) {
        h.session.freezeTime = 0;         // pretend every freeze has expired
        h.scan();
      }
      expect(h.progression.state.points).toBe(100 - SCUFFLE_COST);
      expect(h.hisses).toHaveLength(1);
      void s;
    });

    it('caps a whole walk at three scuffles however many cats are cross', () => {
      // Grudges persist and accumulate; a player with fifteen of them
      // crossing a map of 22 strays must not be taxed fifteen times for a
      // feature they are actively trying to fix.
      const h = enemyHarness({ points: 100, count: 4 });
      for (let i = 0; i < 4; i++) {
        const s = h.park(i, 0.6);
        h.strayCats.turnHostile(s, new THREE.Vector3(0, 0, 4));
        s.group.position.set(0, 0, 0.6);
      }
      for (let i = 0; i < 50; i++) {
        h.session.freezeTime = 0;
        h.scan();
      }
      expect(h.progression.state.points).toBe(100 - 3 * SCUFFLE_COST);
      expect(h.hisses).toHaveLength(3);
    });

    it('never swats for a cat that is not cross', () => {
      const h = enemyHarness({ points: 100 });
      h.park(0, 0.6);
      for (let i = 0; i < 20; i++) { h.session.freezeTime = 0; h.scan(); }
      expect(h.progression.state.points).toBe(100);
      expect(h.hisses).toHaveLength(0);
    });

    it('stays out of reach: no swat from the far edge of the greet prompt', () => {
      const { h, s } = crowded();
      s.group.position.set(0, 0, 2.3);   // promptable, but not crowded
      h.scan();
      expect(h.session.freezeTime).toBe(0);
      expect(h.progression.state.points).toBe(100);
      // …and the reconciliation is still on offer from out here, which is the
      // whole reason the swat radius is smaller than the prompt reach.
      expect(h.session.prompt.kind).toBe('stray-gift');
    });

    it('does not cow a fearless or steady cat — but still costs them (D3)', () => {
      // The dog scare's own rule: the special governs the player's NERVE, so
      // it skips exactly what the dog scare skips (freeze, halt, toast text)
      // and nothing else. Letting two breeds walk the feature for free would
      // delete the sting D3 exists to deliver.
      for (const breed of ['black', 'mainecoon']) {
        // Asserted, not assumed: if either breed's special is ever renamed
        // this fails here rather than quietly testing nothing.
        expect(['fearless', 'steady']).toContain(PERSONALITIES[breed].special);
        const { h } = crowded({ breed });
        h.scan();
        expect(h.session.freezeTime).toBe(0);
        expect(h.halted()).toBe(0);
        expect(h.hisses).toHaveLength(1);
        expect(h.progression.state.points).toBe(100 - SCUFFLE_COST);
      }
      // The control: an ordinary breed IS cowed by the same swat.
      const tabby = crowded({ breed: 'tabby' });
      tabby.h.scan();
      expect(tabby.h.session.freezeTime).toBe(SCUFFLE_FREEZE);
      expect(tabby.h.halted()).toBe(1);
    });

    it('floors at zero: a broke player gets the hiss and the freeze, no phantom cost', () => {
      const { h } = crowded({ points: 0 });
      h.scan();
      expect(h.progression.state.points).toBe(0);
      expect(h.session.freezeTime).toBe(SCUFFLE_FREEZE);
      expect(h.hisses).toHaveLength(1);
      expect(h.toasts.at(-1)).not.toContain('−');
    });
  });

  // --- 5. the reconciliation ---------------------------------------------

  describe('the reconciliation', () => {
    // A cross cat, standing where the prompt reaches but the swat does not.
    // The grudge is written to the SAVE as well as flagged on the stray,
    // because that is what the rupture does and what the reconciliation
    // reads — a world flag with no persisted grudge behind it must (and
    // does, see 'charges nothing for a cat that is not actually cross')
    // charge nothing.
    function crossAndClose(opts = {}) {
      const h = enemyHarness({ points: 40, ...opts });
      const s = h.park(0, 2.0);
      h.progression.recordGrudge(s.name);
      h.strayCats.turnHostile(s, new THREE.Vector3(0, 0, 5));
      s.group.position.set(0, 0, 2.0);
      h.scan();
      return { h, s };
    }

    it('always works — no roll — and costs exactly the treat', () => {
      const { h, s } = crossAndClose();
      h.pressE();
      expect(h.progression.state.points).toBe(40 - TREAT_COST);
      expect(h.progression.state.grudges).toEqual([]);
      expect(h.progression.hasGrudge(s.name)).toBe(false);
      expect(s.cross).toBe(false);
      expect(s.greeted).toBe(false);      // greetable again, immediately
      expect(h.toasts.at(-1)).toContain(s.name);
    });

    it('consumes nothing and clears nothing when the player cannot afford it', () => {
      const { h, s } = crossAndClose({ points: TREAT_COST - 1 });
      h.pressE();
      expect(h.progression.state.points).toBe(TREAT_COST - 1);
      expect(h.progression.state.grudges).toEqual([s.name]);
      expect(s.cross).toBe(true);
      expect(h.toasts.at(-1)).toContain('costs');
    });

    it('cannot be double-charged by mashing E', () => {
      // forgiveGrudge is the single gate; the second press finds no grudge
      // and returns before the deduction.
      const { h } = crossAndClose();
      for (let i = 0; i < 10; i++) h.pressE();
      expect(h.progression.state.points).toBe(40 - TREAT_COST);
    });

    it('charges nothing for a cat that is not actually cross', () => {
      // A forged prompt: nothing to forgive means nothing to pay.
      const h = enemyHarness({ points: 40 });
      const s = h.park(0, 1);
      h.session.prompt = { kind: 'stray-gift', data: s };
      h.pressE();
      expect(h.progression.state.points).toBe(40);
    });

    it('does NOT re-rupture on the greet that follows — the beat cannot eat itself', () => {
      // THE load-bearing one. The roll is a pure function of (walkStamp,
      // name), so without markForgiven the cat you just paid to make up with
      // rolls hostile again on the very next greet and the reconciliation
      // pays for its own undoing.
      const h = enemyHarness({ points: 40 });
      const s = h.park(0, 2.0);
      h.session.walkStamp = stampFor(s.name, true);   // a hostile walk for this cat
      h.greet(s);                                     // the rupture
      expect(h.progression.state.grudges).toEqual([s.name]);
      s.group.position.set(0, 0, 2.0);
      h.scan();
      expect(h.session.prompt.kind).toBe('stray-gift');
      h.pressE();                                     // the reconciliation
      expect(h.progression.state.grudges).toEqual([]);
      s.group.position.set(0, 0, 2.0);
      h.scan();
      expect(h.session.prompt.kind).toBe('stray');    // greetable again
      h.pressE();                                     // …and the greet is normal
      expect(h.progression.state.grudges).toEqual([]);
      expect(h.progression.state.friends[s.name].greets).toBe(1);
      expect(h.progression.state.points).toBe(40 - TREAT_COST + AWARDS.friend);
    });

    it('is a net loss, so the loop can never be farmed for points', () => {
      // 10 out, 6 back, and both halves are capped per walk anyway
      // (recordGreet's per-walk dedup, awardOnce's per-walk key).
      const h = enemyHarness({ points: 40 });
      const s = h.park(0, 2.0);
      h.session.walkStamp = stampFor(s.name, true);
      h.greet(s);
      s.group.position.set(0, 0, 2.0);
      h.scan();
      for (let i = 0; i < 30; i++) { h.pressE(); h.scan(); }
      expect(h.progression.state.points).toBeLessThan(40);
      expect(h.progression.state.points).toBe(40 - TREAT_COST + AWARDS.friend);
      expect(h.progression.state.friends[s.name].greets).toBe(1);
    });
  });

  // --- 6. survival --------------------------------------------------------

  it('never throws on a hostile or missing save', () => {
    for (const state of [null, undefined, 'nope', { grudges: 'x', points: '9e99', friends: 7 }]) {
      const h = enemyHarness({ points: 40 });
      const s = h.park(0, 1);
      // Swap in a save the cloud could plausibly have handed back. The
      // progression METHODS still exist (they are total over garbage); it is
      // the state they read that is hostile.
      Object.defineProperty(h.progression, 'state', { get: () => state, configurable: true });
      expect(() => h.scan()).not.toThrow();
      expect(() => h.greet(s)).not.toThrow();
      expect(() => h.pressE()).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// v21 Stream 2, Task 6 — the feed verb.
//
// Touch noses with a stray and the prompt in the same slot turns into "feed".
// Each feed moves the cat along its one taming bar (src/colony.js); the feed
// that fills it tames the cat, who moves to the den. Feeding is free and pays
// no whisker points (spec §4 anti-goal). Driven through the real
// createProgression, the real createStrayCats (with colonyCats, so the cat is
// standing at its fixed spot) and the real interactions module — only the
// HUD, audio, net and colony sync are stand-ins that record what they saw.
// ---------------------------------------------------------------------------
describe('Colony — the feed verb (v21 Stream 2)', () => {
  const AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };
  // Valid player ids (colony.js refuses anything else as 'bad').
  const ME = 'player-me-000001';
  const SIB = 'player-sib-00002';
  const PARTNER = { playerId: SIB, petName: 'Zoomer', wardrobe: [] };
  // The shy rule holds only while the partner still plays (final review I1):
  // a cat elsewhere that they fed yesterday, by the real clock.
  const partnerPlaying = () => ({
    extraCats: [{ name: 'Mochi', finder: SIB, area: 'docks', x: 0, z: 0, wear: null, tamedBy: null, tamedWalk: null }],
    extraFeeds: [{ cat: 'Mochi', by: SIB, walk: `walk-${Date.now() - 24 * 60 * 60 * 1000}`, head: 0 }],
  });

  function stampFor(name, hostile, from = 1) {
    for (let i = from; i < from + 20000; i++) {
      const stamp = `walk-${i}`;
      if (rollHostile(stamp, name, { charmer: false }) === hostile) return stamp;
    }
    throw new Error(`no ${hostile ? 'hostile' : 'friendly'} stamp found for ${name}`);
  }

  // `feeds` are earlier-walk feeds as [by, n] pairs, stamped walk-9000.. so
  // they can never collide with this walk's stamp (stampFor starts at 1 and
  // a friendly roll is found within a handful of tries).
  function colonyHarness({
    name = 'Pickles', names = [name], grudges = [], points = 0, feeds = [], partner = null,
    net = true, colonyWalk = true, sync = true, catArea = 'park', extraCats = [], extraFeeds = [],
  } = {}) {
    const progression = createProgression(fakeStorage());
    const prior = [];
    let w = 9000;
    for (const [by, n] of feeds) for (let i = 0; i < n; i++) prior.push({ cat: name, by, walk: `walk-${w++}`, head: 0 });
    const colony = {
      id: partner ? 'colony-1' : null,
      partner,
      cats: [
        ...(prior.length ? [{ name, finder: prior[0].by, area: catArea, x: 0, z: 1, wear: null, tamedBy: null, tamedWalk: null }] : []),
        ...extraCats,
      ],
      feeds: [...prior, ...extraFeeds],
    };
    progression.replaceFromPayload({ version: 4, points, grudges, colony });
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const strayCats = createStrayCats(scene, AREA, names.length, mulberry32(11), {
      grudges,
      colonyCats: names.map((n, i) => ({ name: n, x: 0, z: 1 + i, wear: null })),
    });
    const toasts = [];
    const prompts = [];
    const pushed = [];
    const sent = [];
    const sounds = [];
    let granted = 0;
    const realGrant = progression.grantColonyRewards;
    progression.grantColonyRewards = () => { granted += 1; return realGrant(); };
    const session = {
      areaId: 'park',
      walkStamp: stampFor(name, false),
      playerId: ME,
      colonyWalk,
      net: net ? { sendEvent: (ev) => sent.push(ev) } : undefined,
      cat: { position: new THREE.Vector3(0, 0, 0), userData: { breed: 'tabby' } },
      areaData: { collectibles: [], scenics: [] },
      collectibleMeshes: new Map(),
      critters: { list: [], dismayNear() {} },
      strayCats,
      enemies: createEnemyWalkLog(),
      ghosts: { list: [], nearest: () => null },
      remotes: { nearest: () => null },
      secrets: { list: [] },
      tippables: { nearest: () => null, list: [] },
      scent: { nearestMound: () => null },
      goldMice: null,
      race: { promptAt: () => null },
      kittenEnc: null,
      quest: null, questGiver: null, questObject: null,
      gifts: null,
      perched: null,
      freezeTime: 0,
      catsGreeted: 0,
      walk: { carried: 0, carryCap: 2 },
      fx: { burst: () => sounds.push('burst') },
      prompt: null,
      lastPromptKind: null,
    };
    const api = createInteractions({
      MP: 1, pid: ME, getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      // forward at -z: the strays parked at +z are behind the cat, so the
      // spot-a-stray award never muddies the points ledger.
      player: { forward: () => new THREE.Vector3(0, 0, -1), perchY: 0, halt() {} },
      progression, log,
      hud: { toast: (t) => toasts.push(t), setPrompt: (t) => prompts.push(t), setPoints() {} },
      audio: {
        trill: () => sounds.push('trill'), meow() {}, hiss: () => sounds.push('hiss'),
        fanfare: () => sounds.push('fanfare'),
      },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
      colonySync: sync ? { pushFeed: (f) => pushed.push(f) } : undefined,
    });
    const stray = strayCats.strays.find((s) => s.name === name);
    return {
      progression, session, strayCats, stray, toasts, prompts, pushed, sent, sounds,
      granted: () => granted,
      scan: () => api.updateInteractions(session),
      pressE: () => api.handleInteract(session),
      // scan, then press whatever the scan offered — what a player does.
      press: () => { api.updateInteractions(session); api.handleInteract(session); },
      kind: () => session.prompt?.kind ?? null,
    };
  }

  it('offers the feed prompt only after the cat was greeted this walk', () => {
    const h = colonyHarness();
    h.scan();
    expect(h.kind()).toBe('stray');
    expect(h.prompts.at(-1)).toBe('E — touch noses with Pickles');
    h.pressE();                               // touch noses
    expect(h.stray.greeted).toBe(true);
    h.scan();
    expect(h.kind()).toBe('stray-feed');
    expect(h.session.prompt.data).toBe(h.stray);
    expect(h.prompts.at(-1)).toBe('E — feed Pickles 🐟');
  });

  it('the greet still wins the slot over a feed', () => {
    // Two cats: the nearer one greeted (feedable), the farther one not. The
    // greet is the scarcer offer and the feed waits behind it.
    const h = colonyHarness({ names: ['Pickles', 'Marmalade'] });
    h.press();                                // greets Pickles, the nearer
    const marm = h.strayCats.strays.find((s) => s.name === 'Marmalade');
    marm.group.position.set(0, 0, 1.5);
    h.scan();
    expect(h.kind()).toBe('stray');
    expect(h.session.prompt.data).toBe(marm);
  });

  it('a feed writes once per walk and pushes it to the colony sync', () => {
    const h = colonyHarness();
    h.press();                                // greet
    h.press();                                // feed
    expect(h.progression.state.colony.feeds).toEqual([{ cat: 'Pickles', by: ME, walk: h.session.walkStamp, head: 0 }]);
    // The cat is founded where it stands: its fixed spot, my find.
    expect(h.progression.state.colony.cats).toEqual([
      { name: 'Pickles', finder: ME, area: 'park', x: 0, z: 1, wear: null, tamedBy: null, tamedWalk: null },
    ]);
    expect(h.toasts.at(-1)).toBe('You fed Pickles 🐟 — 1/6');
    expect(h.sounds).toContain('trill');
    // The prompt is gone for the rest of the walk...
    h.scan();
    expect(h.kind()).toBe(null);
    // ...and a forced second press (a stale prompt) feeds nothing.
    h.session.prompt = { kind: 'stray-feed', data: h.stray };
    h.pressE();
    expect(h.progression.state.colony.feeds).toHaveLength(1);
    expect(h.pushed).toEqual([{ cat: 'Pickles', walk: h.session.walkStamp }]);
    // The live display event for my partner, once, with no free text.
    expect(h.sent).toEqual([{ v: 1, id: ME, type: 'colony-feed', cat: 'Pickles' }]);
  });

  it('sends no colony-feed event on a walk with a non-partner, but still syncs the feed', () => {
    const h = colonyHarness({ colonyWalk: false });
    h.press();
    h.press();
    expect(h.progression.state.colony.feeds).toHaveLength(1);
    expect(h.pushed).toHaveLength(1);
    expect(h.sent).toEqual([]);
  });

  it('shows both feeders in the toast when paired', () => {
    const h = colonyHarness({ name: 'Marmalade', partner: PARTNER, feeds: [[ME, 2], [SIB, 1]] });
    h.press();
    h.press();
    expect(h.toasts.at(-1)).toBe('You fed Marmalade 🐟 — 4/6 (you 3 · Zoomer 1)');
  });

  it('never pays whisker points for feeding', () => {
    const h = colonyHarness({ name: 'Marmalade', feeds: [[ME, 4]] });
    h.press();                                // greet: the one ordinary award
    expect(h.progression.state.points).toBe(AWARDS.friend);
    const feedPays = () => {
      const { points, lifetimePoints } = h.progression.state;
      const fed = h.progression.state.colony.feeds.length;
      h.press();
      expect(h.progression.state.colony.feeds.length).toBe(fed + 1);   // it really fed
      return [h.progression.state.points - points, h.progression.state.lifetimePoints - lifetimePoints];
    };
    expect(feedPays()).toEqual([0, 0]);       // feed 5/6
    // The next walk: touch noses again, then the feed that tames.
    h.session.walkStamp = stampFor('Marmalade', false, Number(h.session.walkStamp.slice(5)) + 1);
    h.stray.greeted = false;
    h.press();
    expect(feedPays()).toEqual([0, 0]);       // feed 6/6, the taming one
    expect(h.progression.state.colony.cats[0].tamedBy).toBe(ME);
  });

  it('a cross cat is never offered food', () => {
    const h = colonyHarness({ grudges: ['Pickles'], points: 40 });
    h.stray.greeted = true;                   // even if it somehow was greeted
    h.scan();
    expect(h.kind()).toBe('stray-gift');
    // A stale feed prompt on a cross cat is refused by the handler too.
    h.session.prompt = { kind: 'stray-feed', data: h.stray };
    h.pressE();
    expect(h.progression.state.colony.feeds).toEqual([]);
    expect(h.pushed).toEqual([]);
  });

  it('a rupture never touches the colony (spec §9.2: annoyed at one player, nobody loses progress)', () => {
    const h = colonyHarness({ feeds: [[ME, 3]] });
    h.session.walkStamp = stampFor('Pickles', true);
    const before = structuredClone(h.progression.state.colony);
    h.press();                                // the greet ruptures
    expect(h.progression.state.grudges).toEqual(['Pickles']);
    expect(h.progression.state.colony).toEqual(before);
    h.scan();
    expect(h.kind()).toBe('stray-gift');      // a treat, never food
    expect(h.pushed).toEqual([]);
  });

  it('a shy cat waiting for the partner shows a no-op prompt naming them', () => {
    // Pickles is shy (colony.isShy). Paired, and I have filled her bar alone.
    const h = colonyHarness({ partner: PARTNER, feeds: [[ME, 6]], ...partnerPlaying() });
    const before = structuredClone(h.progression.state.colony);
    h.press();                                // greet
    h.scan();
    expect(h.kind()).not.toBe('stray-feed');
    expect(h.prompts.at(-1)).toBe('Pickles is shy — waiting for Zoomer 🐾');
    h.pressE();
    expect(h.progression.state.colony).toEqual(before);
    expect(h.pushed).toEqual([]);
    expect(h.sent).toEqual([]);
  });

  it('a shy cat whose partner stopped playing (no feed in 14 days) is fed and tamed by me', () => {
    const h = colonyHarness({ partner: PARTNER, feeds: [[ME, 5]], extraCats: partnerPlaying().extraCats,
      extraFeeds: [{ cat: 'Mochi', by: SIB, walk: `walk-${Date.now() - 15 * 24 * 60 * 60 * 1000}`, head: 0 }] });
    h.press();                                // greet
    h.press();                                // the sixth feed
    expect(h.progression.state.colony.cats.find((c) => c.name === 'Pickles')).toMatchObject({ tamedBy: ME });
  });

  it('the taming feed toasts, grants the reward and does not spawn the cat again next walk', () => {
    const h = colonyHarness({ name: 'Marmalade', feeds: [[ME, 5]] });
    h.press();                                // greet
    h.press();                                // the sixth feed
    expect(h.progression.state.colony.cats[0]).toMatchObject({ tamedBy: ME, tamedWalk: h.session.walkStamp });
    expect(h.toasts).toContain('You fed Marmalade 🐟 — 6/6');
    expect(h.toasts).toContain("Marmalade trusts you! She'll be waiting in the den 🏠");
    expect(h.sounds).toContain('fanfare');
    expect(h.granted()).toBe(1);
    // First milestone: the first of its items not already owned.
    expect(h.progression.state.unlocked.accessories).toContain('heart');
    expect(h.toasts.at(-1)).toBe(`🎁 New for your wardrobe: ${CATALOG.accessories.heart.name}`);
    expect(catsInArea(h.progression.state.colony, 'park').map((c) => c.name)).not.toContain('Marmalade');
    // ...and nothing more to do with her this walk.
    h.scan();
    expect(h.kind()).toBe(null);
  });

  // Fix round 1: a colony cat whose fixed spot is in ANOTHER area (it can
  // only be here off a colony walk, as an ordinary stray) is never fed here —
  // feeding it would move nothing (first insert wins) and would tame a cat
  // somewhere the player is not.
  it('never offers or takes food for a colony cat that lives in another area', () => {
    const h = colonyHarness({ name: 'Marmalade', catArea: 'docks', feeds: [[ME, 2]], colonyWalk: false });
    h.press();                                // greet works as ever
    expect(h.stray.greeted).toBe(true);
    h.scan();
    expect(h.kind()).toBe(null);
    const before = structuredClone(h.progression.state.colony);
    h.session.prompt = { kind: 'stray-feed', data: h.stray };   // a stale prompt
    h.pressE();
    expect(h.progression.state.colony).toEqual(before);
    expect(h.pushed).toEqual([]);
  });

  it('a shy cat waiting for the partner never hides a feedable cat in range', () => {
    // Pickles (shy, bar full, waiting) stands NEARER than Marmalade (feedable).
    const sixFeeds = Array.from({ length: 6 }, (_, i) => ({ cat: 'Pickles', by: ME, walk: `walk-${8000 + i}`, head: 0 }));
    const h = colonyHarness({
      name: 'Marmalade', names: ['Pickles', 'Marmalade'], partner: PARTNER,
      extraCats: [{ name: 'Pickles', finder: ME, area: 'park', x: 0, z: 1, wear: null, tamedBy: null, tamedWalk: null },
        ...partnerPlaying().extraCats],
      extraFeeds: [...sixFeeds, ...partnerPlaying().extraFeeds],
    });
    const pickles = h.strayCats.strays.find((s) => s.name === 'Pickles');
    h.session.walkStamp = 'walk-1';            // reroll-proof: find a stamp friendly to both
    for (let i = 1; i < 20000; i++) {
      const st = `walk-${i}`;
      if (!rollHostile(st, 'Pickles', { charmer: false }) && !rollHostile(st, 'Marmalade', { charmer: false })) {
        h.session.walkStamp = st;
        break;
      }
    }
    pickles.group.position.set(0, 0, 1);
    h.stray.group.position.set(0, 0, 1.5);
    h.press();                                // greets Pickles
    h.press();                                // greets Marmalade
    expect(pickles.greeted && h.stray.greeted).toBe(true);
    h.scan();
    expect(h.kind()).toBe('stray-feed');
    expect(h.session.prompt.data).toBe(h.stray);
    // ...and with Marmalade gone out of range, the waiting line shows.
    h.stray.group.position.set(0, 0, 40);
    h.scan();
    expect(h.kind()).toBe('stray-wait');
    expect(h.prompts.at(-1)).toBe('Pickles is shy — waiting for Zoomer 🐾');
  });

  it('a feed without a colony sync (it is an optional dep) still records', () => {
    const h = colonyHarness({ sync: false });
    h.press();
    expect(() => h.press()).not.toThrow();
    expect(h.progression.state.colony.feeds).toHaveLength(1);
  });

  it('feeds nothing in a session with no valid player id or walk stamp', () => {
    // canFeed answers 'bad', so the feed prompt is never offered at all.
    const h = colonyHarness();
    h.press();
    h.session.walkStamp = 'not-a-stamp';
    h.scan();
    expect(h.kind()).toBe(null);
  });
});

describe('Colony — petting a tamed cat at home in the den (v21 Stream 2)', () => {
  const AREA = { bounds: { minX: -8, maxX: 8, minZ: -8, maxZ: 8 } };
  function denHarness({ cats = [{ name: 'Pickles', x: 0, z: -1 }], rests = null } = {}) {
    const progression = createProgression(fakeStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const prompts = [];
    const petted = [];
    let voices = 0;
    const entries = cats.map((c) => ({ name: c.name, group: { position: new THREE.Vector3(c.x, 0, c.z) } }));
    const session = {
      areaId: 'den',
      walkStamp: 'walk-1',
      playerId: 'player-me-000001',
      colonyWalk: false,
      cat: { position: new THREE.Vector3(0, 0, 0), userData: { breed: 'tabby' } },
      areaData: { collectibles: [], scenics: [] },
      collectibleMeshes: new Map(),
      critters: { list: [], dismayNear() {} },
      strayCats: createStrayCats(scene, AREA, 0, mulberry32(3)),
      enemies: createEnemyWalkLog(),
      ghosts: { list: [], nearest: () => null },
      remotes: { nearest: () => null },
      secrets: { list: [] },
      tippables: { nearest: () => null, list: [] },
      scent: { nearestMound: () => null },
      goldMice: null,
      race: { promptAt: () => null },
      kittenEnc: null,
      denCats: {
        list: entries,
        nearest: (pos, r) => entries.find((e) => e.group.position.distanceTo(pos) < r) ?? null,
        pet: (e) => petted.push(e.name),
      },
      quest: null, questGiver: null, questObject: null,
      gifts: null, perched: null, freezeTime: 0, catsGreeted: 0,
      walk: { carried: 0, carryCap: 2 },
      rests: rests ? createRests(scene, rests) : undefined,
      rest: null,
      fx: { burst() {} },
      prompt: null,
      lastPromptKind: null,
    };
    const api = createInteractions({
      MP: 0, pid: 'player-me-000001', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      player: { forward: () => new THREE.Vector3(0, 0, -1), perchY: 0, halt() {} },
      progression, log,
      hud: { toast() {}, setPrompt: (t) => prompts.push(t), setPoints() {} },
      audio: { trill() {}, meow() {}, hiss() {}, fanfare() {} },
      catVoice: () => { voices += 1; }, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    return {
      session, progression, prompts, petted, voices: () => voices,
      at: (x, z) => { session.cat.position.set(x, 0, z); session.prompt = null; api.updateInteractions(session); },
      scan: () => api.updateInteractions(session),
      press: () => { api.updateInteractions(session); api.handleInteract(session); },
    };
  }

  it('offers "E — pet <name>" next to a den cat and nothing when none is in range', () => {
    const h = denHarness();
    h.scan();
    expect(h.session.prompt?.kind).toBe('den-cat');
    expect(h.prompts.at(-1)).toBe('E — pet Pickles');
    h.session.cat.position.set(0, 0, 6);
    h.session.prompt = null;
    h.scan();
    expect(h.session.prompt?.kind ?? null).not.toBe('den-cat');
  });
  it('petting awards a purr once per cat (pet type, key den-<name>), plays the voice, every time', () => {
    const h = denHarness({ cats: [{ name: 'Pickles', x: 0, z: -1 }, { name: 'Mochi', x: 0.2, z: -9 }] });
    const before = h.progression.state.points;
    h.press();
    const gained = h.progression.state.points - before;
    expect(gained).toBe(AWARDS.pet);
    expect(h.voices()).toBe(1);
    expect(h.petted).toEqual(['Pickles']);
    h.press(); // again: sits up and purrs again, but no second award
    expect(h.progression.state.points - before).toBe(gained);
    expect(h.voices()).toBe(2);
    expect(h.petted).toEqual(['Pickles', 'Pickles']);
    // a different cat is its own award
    h.session.cat.position.set(0.2, 0, -8);
    h.session.prompt = null;
    h.press();
    expect(h.progression.state.points - before).toBe(gained * 2);
    expect(h.petted.at(-1)).toBe('Mochi');
  });

  // v21 3b Task 15. The bowls and the hearth rug are where tamed cats can
  // live too (corner-c, corner-d, home-fireside and home-south-east all stand
  // within the 2.2 m pet reach of one of them), and the pet prompt comes far
  // above the rest's in the chain. So whichever the cat stands nearer wins,
  // as with a queen's little one; a tie goes to petting.
  it('a cat at home beside the bowls or the rug never hides them: whichever you stand nearer wins', () => {
    const den = propsFor('den').rests;
    const water = den.find((r) => r.kind === 'drink');
    const rug = den.find((r) => r.kind === 'nap');
    const h = denHarness({ rests: den, cats: [
      { name: 'Pickles', x: water.x - 1.0, z: water.z - 0.9 }, // where home-south-east's cat stands
      { name: 'Mochi', x: rug.x - 0.2, z: rug.z - 1.5 },       // and corner-c's
    ] });
    h.at(water.x, water.z + 0.3);
    expect(h.session.prompt).toMatchObject({ kind: 'rest', data: { id: 'den-drink-1' } });
    expect(h.prompts.at(-1)).toBe('E — have a drink');
    h.at(water.x - 0.8, water.z - 0.7); // right up to Pickles
    expect(h.session.prompt).toMatchObject({ kind: 'den-cat', data: { name: 'Pickles' } });
    h.at(rug.x, rug.z + 0.2);
    expect(h.session.prompt).toMatchObject({ kind: 'rest', data: { id: 'den-nap-1' } });
    expect(h.prompts.at(-1)).toBe('E — curl up for a nap');
    h.at(rug.x - 0.2, rug.z - 1.2);
    expect(h.session.prompt).toMatchObject({ kind: 'den-cat', data: { name: 'Mochi' } });
  });
});

// ===========================================================================
// v21 3b Task 6 — the walk-end half of carry, read off walk.js's source (the
// rivalcats.test.js slice idiom): endWalk turns the mouth into marks exactly
// once, through progression.addMark and nothing else, before the teardown.
// ===========================================================================
describe('endWalk: what the cat carried home', () => {
  const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
  const end = src.indexOf('function endWalk()');
  const a = src.indexOf('What the cat carried home', end);
  const b = src.indexOf('(end of what the cat carried home)', a);
  const block = src.slice(a, b);
  const code = block.replace(/\/\/.*$/gm, '');

  it('sits inside endWalk, after completeWalk and before the summary and the teardown', () => {
    expect(end).toBeGreaterThan(0);
    expect(a).toBeGreaterThan(src.indexOf('progression.completeWalk(', end));
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(src.indexOf('const summaryHtml', end));
    expect(b).toBeLessThan(src.indexOf('session.fx.dispose()', end));
  });

  it('calls walkEndMarks once and writes through progression.addMark only', () => {
    expect(code.match(/walkEndMarks\(/g)).toHaveLength(1);
    expect(code).toContain('progression.addMark(');
    expect(code.match(/progression\.\w+/g)).toEqual(['progression.addMark']);
    for (const bad of ['award', 'addPoints', 'recordFeat', 'log.', 'walk.carried', 'sendEvent', 'net.']) {
      expect(code).not.toContain(bad);
    }
  });

  // v21 3b Task 15: a nap ends with the walk. The rests are freed before the
  // scene traversal (which would otherwise free their meshes a second time),
  // and session.rest is cleared after that, before the session is let go.
  it('frees the rests, then clears the rest in progress, before the traversal and setSession(null)', () => {
    const disposeAt = src.indexOf('session.rests.dispose()', end);
    const clearAt = src.indexOf('session.rest = null', end);
    expect(disposeAt).toBeGreaterThan(end);
    expect(clearAt).toBeGreaterThan(disposeAt);
    expect(clearAt).toBeLessThan(src.indexOf('session.scene.traverse(', end));
    expect(clearAt).toBeLessThan(src.indexOf('setSession(null)', end));
    expect(src.indexOf('session.rest = null', clearAt + 1)).toBe(-1); // once
  });

  it('the summary names what came home, escaped', () => {
    const tail = src.slice(b, src.indexOf('<button id="btn-summary-continue"', b));
    expect(tail).toMatch(/You brought the \$\{escapeHtml\(carryLabel\([^`]*\)\)\} home\. It's in the den now\.&nbsp;🏠<\/div>/);
  });
});

// ===========================================================================
// v21 3b Task 16 — the yard dog in the journal. The two critter dogs went out
// of critterSpawns; spotting the yard dog (s.dog.spotPos) must pay exactly
// what spotting the critter dog paid: one 'critter' award a walk, labelled
// the way labelFor('dog') always has been, and one journal sighting.
// ===========================================================================
describe('spotting the yard dog', () => {
  function spotHarness({ dog = null, critters = [] } = {}) {
    const progression = createProgression(fakeStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const paid = [];
    const off = bus.on('discovery', (d) => paid.push(d));
    const session = {
      areaId: 'park',
      cat: { position: new THREE.Vector3(0, 0, 0), userData: { breed: 'tabby' } },
      areaData: { collectibles: [], scenics: [] },
      collectibleMeshes: new Map(),
      critters: { list: critters, dismayNear() {} },
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
      gifts: null,
      perched: null,
      walk: { carried: 0, carryCap: 2 },
      fx: { burst() {} },
      prompt: null,
      lastPromptKind: null,
      dog,
    };
    const api = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      // the cat looks down -z
      player: { forward: () => new THREE.Vector3(0, 0, -1), perchY: 0, halt() {} },
      progression, log,
      hud: { toast() {}, setPrompt() {}, setPoints() {} },
      audio: { trill() {}, meow() {} },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    return { progression, session, paid, off, scan: () => api.updateInteractions(session) };
  }

  it('spotting the dog still pays the critter award and records a sighting', () => {
    // The old way: a critter dog in critters.list, 4 m ahead.
    const group = new THREE.Group();
    group.position.set(0, 0, -4);
    const old = spotHarness({ critters: [{ id: 'dog-7', type: 'dog', spottable: true, fleeing: false, group }] });
    old.scan();
    old.scan();
    old.off();
    // The new way: the yard dog, 4 m ahead.
    const yard = createYardDog(new THREE.Scene(), { x: 0, z: -4.5, r: 4, kennel: { x: 0, z: -5.5 } });
    expect(Math.hypot(yard.spotPos.x, yard.spotPos.z + 4.5)).toBeLessThan(1);
    const now = spotHarness({ dog: yard });
    now.scan();
    now.scan();
    now.off();

    expect(now.paid.map((d) => [d.type, d.label])).toEqual([['critter', 'the neighbor’s dog']]);
    expect(now.paid.map((d) => [d.type, d.label, d.points])).toEqual(old.paid.map((d) => [d.type, d.label, d.points]));
    expect(now.progression.state.points).toBe(AWARDS.critter);
    expect(now.progression.state.points).toBe(old.progression.state.points);
    expect(now.progression.state.journal.dog).toBe(1);
    expect(now.progression.state.journal.dog).toBe(old.progression.state.journal.dog);
    expect(now.progression.state.feats).toEqual(old.progression.state.feats);
  });

  it('a dog behind the cat, too far away, or no dog at all is not spotted', () => {
    for (const spotPos of [{ x: 0, z: 4 }, { x: 0, z: -6.5 }, { x: 5, z: -1 }]) {
      const h = spotHarness({ dog: { spotPos, update() {}, dispose() {} } });
      h.scan();
      h.off();
      expect(h.paid).toEqual([]);
      expect(h.progression.state.journal.dog ?? 0).toBe(0);
    }
    for (const dog of [null, undefined, { spotPos: null }]) {
      const h = spotHarness({ dog });
      expect(() => h.scan()).not.toThrow();
      h.off();
      expect(h.paid).toEqual([]);
    }
  });
});
