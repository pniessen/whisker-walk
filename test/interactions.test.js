import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createInteractions, TREAT_COST } from '../src/game/interactions.js';
import { createTippables } from '../src/tippables.js';
import { createDiscoveryLog, AWARDS } from '../src/discoveries.js';
import { createProgression } from '../src/progression.js';
import { createGoals } from '../src/goals.js';
import { createGifts } from '../src/gifts.js';
import { createStrayCats } from '../src/straycats.js';
import { createEnemyWalkLog, rollHostile, SCUFFLE_COST, SCUFFLE_FREEZE } from '../src/enemies.js';
import { PERSONALITIES } from '../src/cat/brain.js';
import { mulberry32 } from '../src/rng.js';
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
  function promptHarness({ skills = [], feats = {} } = {}) {
    const progression = createProgression(fakeStorage());
    progression.replaceFromPayload({ version: 4, skills, feats });
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const tippables = createTippables(scene, [{ x: 0, z: 2.0, kind: 'bin' }],
      { getState: () => progression.state });
    const stray = { name: 'Pickles', greeted: false };
    const prompts = [];
    const session = {
      areaId: 'park',
      cat: { position: new THREE.Vector3(0, 0, 0), userData: { breed: 'tabby' } },
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
      walk: { carried: 0, carryCap: 2 },
      fx: { burst() {} },
      prompt: null,
      lastPromptKind: null,
    };
    const { updateInteractions } = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      player: { forward: () => new THREE.Vector3(0, 0, 1), perchY: 0 },
      progression, log,
      hud: { toast() {}, setPrompt: (t) => prompts.push(t) },
      audio: { trill() {}, meow() {} },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    const walkTo = (x, z) => { session.cat.position.set(x, 0, z); updateInteractions(session); };
    return { session, prompts, walkTo };
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
