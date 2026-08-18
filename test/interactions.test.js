import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createInteractions } from '../src/game/interactions.js';
import { createTippables } from '../src/tippables.js';
import { createDiscoveryLog, AWARDS } from '../src/discoveries.js';
import { createProgression } from '../src/progression.js';
import { createGoals } from '../src/goals.js';
import { createGifts } from '../src/gifts.js';
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

  function climbHarness(state) {
    const progression = { state, recordFeat() {}, addPoints() {} };
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const session = {
      areaData: { perches: [HIGH] },
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
