import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createInteractions } from '../src/game/interactions.js';
import { createTippables } from '../src/tippables.js';
import { createDiscoveryLog, AWARDS } from '../src/discoveries.js';
import { createProgression } from '../src/progression.js';
import { createGoals } from '../src/goals.js';
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
