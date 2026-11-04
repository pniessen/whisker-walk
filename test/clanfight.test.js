import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { closeDiffs } from './helpers/closeto.js';
import * as THREE from 'three';
import {
  createClanFight, NO_CLAN_FIGHT, FIGHT_GAP, WALKOVER_MAX, SIDE_STEP, fightReach, reachYFor,
} from '../src/game/clanfight.js';
import { ACTION_KINDS, actionFrame, beatFrame, placeFrame, preludeFrame, actionFor, siteFor } from '../src/fightactions.js';
import { moveById } from '../src/fightmoves.js';
import { createAvatarUpdater } from '../src/game/avatar.js';
import { createWaterState } from '../src/waterstate.js';
import { buildCat, catDims } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { clanCast } from '../src/clancast.js';
import { createFightCam } from '../src/fightcam.js';
import { COUNTER, MOVES, BUTTONS, CLUES } from '../src/fight.js';
import { CHALLENGE_RANGE, CHALLENGE_KEEP, RECHALLENGE_DELAY } from '../src/intruders.js';
import { clanName } from '../src/clanhomes.js';
import { mulberry32, seedFromCode } from '../src/rng.js';
import { createDiscoveryLog, AWARDS } from '../src/discoveries.js';
import { createProgression } from '../src/progression.js';
import { renderJournalHtml } from '../src/journal.js';
import { FLAT_GROUND } from '../src/ground.js';
import { buildHeightFixture } from './fixtures/heightfield.js';

const DT = 1 / 30;
const RUN = 3;
const SRC = readFileSync(new URL('../src/game/clanfight.js', import.meta.url), 'utf8');

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Fakes for everything the controller is handed, one call ledger for all of
// them, and a clock the test moves.
// The fight dims (src/cat/model.js catDims) the harness's two cats measure.
const ME_DIMS = Object.freeze({ top: 0.95, backY: 0.5, pinnedBackY: 0.32, hindZ: 0.34, pivotY: 0.24 });
const IT_DIMS = Object.freeze({ top: 0.8, backY: 0.42, pinnedBackY: 0.27, hindZ: 0.29, pivotY: 0.2 });
const CAST_ID = 'moor-2';

function harness({
  answers = 'right', clanHome = true, picks = ['woods'], clan = 'moor', reducedMotion = false,
  special = null, ground = () => true, walkStamp = 'walk-1', log = null, startAt = 2.5, solo = false,
  terrain = undefined,
  actions, scars, ownedMoves = () => [], cat = null, player: playerIn = null, sExtra = {}, dt = DT, answerAt = 15,
  measureCat = () => ({ ...ME_DIMS }), onFrame = null,
} = {}) {
  const calls = [];
  const sent = [];
  const clock = { T: 5000 };
  const cur = { visit: 7, clan, member: { name: 'Mossjaw', id: CAST_ID }, pos: { x: 0, z: 0 }, state: 'walking' };
  const intruders = {
    measure: vi.fn((v) => (v === cur.visit ? { ...IT_DIMS } : null)),
    current: () => (cur.state === 'gone' ? null : { ...cur, pos: { ...cur.pos } }),
    hold: vi.fn((v, id, face, o) => { calls.push({ kind: 'hold', v, id, o }); cur.state = 'held'; }),
    release: vi.fn((v, id) => { calls.push({ kind: 'release', v, id }); cur.state = 'walking'; }),
    flee: vi.fn((v) => { calls.push({ kind: 'flee', v }); cur.state = 'fleeing'; }),
    // The fight reuses one staging object (final review 8): each call's
    // values are snapshotted here, and the object itself kept as `raw`.
    stage: vi.fn((v, st) => { calls.push({ kind: 'stage', v, st: st && { ...st, face: st.face && { ...st.face } }, raw: st }); }),
    isFled: () => cur.state === 'fleeing',
  };
  const ui = {
    showing: null,
    showChallenge: vi.fn((m) => { ui.showing = 'challenge'; calls.push({ kind: 'ui', what: 'challenge', m }); }),
    showFight: vi.fn((m) => { ui.showing = 'fight'; calls.push({ kind: 'ui', what: 'fight', m }); }),
    hide: vi.fn(() => { ui.showing = null; calls.push({ kind: 'ui', what: 'hide' }); }),
    key: vi.fn(() => false),
  };
  const audio = {
    hiss: vi.fn(() => calls.push({ kind: 'audio', what: 'hiss' })),
    pounceWhoosh: vi.fn(() => calls.push({ kind: 'audio', what: 'whoosh' })),
    landThump: vi.fn(() => calls.push({ kind: 'audio', what: 'thump' })),
  };
  const fx = {
    burst: vi.fn((p, c, n) => calls.push({ kind: 'fx', p: { x: p.x, z: p.z }, n })),
    slash: vi.fn((p, yaw) => calls.push({ kind: 'fx', what: 'slash', p: { x: p.x, y: p.y, z: p.z }, yaw })),
  };
  const hud = { toast: vi.fn((t) => calls.push({ kind: 'toast', t })) };
  const theLog = log ?? { awardOnce: vi.fn(() => { calls.push({ kind: 'award' }); return AWARDS.intruder; }) };
  const player = playerIn ?? { inWater: false, halt: vi.fn() };
  if (cat) cat.position.set(startAt, 0, 0);
  const s = {
    cat: cat ?? { position: { x: startAt, y: 0, z: 0 }, rotation: { y: 0 } },
    fight: null, fightPose: null, perched: null, chasing: false, cameraMode: false,
    ...sExtra,
  };
  // The callbacks are not on the call ledger: Hagrid's fights call them too
  // (with site null), and the ledger pins what today's fights do.
  const onWon = vi.fn();
  const onLost = vi.fn();
  const cf = createClanFight({
    intruders, ui, audio, fx, hud, log: theLog, areaId: 'woods', walkStamp, playerId: 'me',
    playerSpecial: special, reducedMotion, now: () => clock.T, isGround: ground, player,
    runSpeed: RUN, clanHome, picks, ...(solo ? {} : { sendEvent: (ev) => { sent.push(ev); } }),
    ...(terrain === undefined ? {} : { terrain }),
    ...(actions === undefined ? {} : { actions }), ...(scars === undefined ? {} : { scars }), ownedMoves, onWon, onLost, measureCat,
  });
  const frame = (step = dt) => { clock.T += step; cf.update(step, s); };
  const moves = [];
  let clueFrames = 0;
  const h = {
    calls, sent, clock, cur, intruders, ui, audio, fx, hud, log: theLog, player, s, cf, frame, moves, onWon, onLost,
    challenge() { frame(); },
    fight() { cf.startFight(); },
    // One frame of a fight, answering `answerAt` frames (half a second by
    // default) into each clue. `answers` may be a function of the fight,
    // giving the button (or special) to tap.
    fightFrame() {
      frame();
      onFrame?.(h); // after the frame is staged, before a tap
      const f = s.fight;
      if (!f) return;
      if (f.phase !== 'clue') { clueFrames = 0; return; }
      if (clueFrames === 0) moves.push(f.move);
      clueFrames += 1;
      if (clueFrames === answerAt) {
        const a = typeof answers === 'function' ? answers(f) : answers;
        if (a === 'right') cf.answer(COUNTER[f.move]);
        else if (a === 'wrong') cf.answer(BUTTONS.find((b) => b !== COUNTER[f.move]));
        else if (typeof a === 'string' && a !== 'none') cf.answer(a);
      }
    },
    runToEnd(each = () => {}) {
      for (let i = 0; i < 60 * 30 / (dt / DT) && s.fight; i++) { h.fightFrame(); each(); }
      expect(s.fight).toBeNull();
    },
  };
  return h;
}

describe('the challenge', () => {
  test('shows within CHALLENGE_RANGE of a hostile walking intruder, naming it', () => {
    const h = harness({ startAt: CHALLENGE_RANGE + 0.5 });
    h.frame();
    expect(h.ui.showChallenge).not.toHaveBeenCalled();
    expect(h.cf.uiShowing).toBeNull();
    h.s.cat.position.x = CHALLENGE_RANGE - 0.1;
    h.frame();
    expect(h.ui.showChallenge).toHaveBeenCalledWith({ name: 'Mossjaw', clan: 'moor' });
    expect(h.cf.uiShowing).toBe('challenge');
    // kept up to CHALLENGE_KEEP, then hidden
    h.s.cat.position.x = CHALLENGE_KEEP - 0.1;
    h.frame();
    expect(h.cf.uiShowing).toBe('challenge');
    h.s.cat.position.x = CHALLENGE_KEEP + 0.1;
    h.frame();
    expect(h.cf.uiShowing).toBeNull();
    expect(h.ui.hide).toHaveBeenCalled();
  });

  test('not at home, or an ally clan: no challenge at all', () => {
    for (const opts of [{ clanHome: false }, { picks: ['woods', 'moor'] }, { picks: null }]) {
      const h = harness(opts);
      for (let i = 0; i < 30; i++) h.frame();
      expect(h.ui.showChallenge).not.toHaveBeenCalled();
      h.fight();
      expect(h.s.fight).toBeNull();
      expect(h.intruders.hold).not.toHaveBeenCalled();
    }
    expect(NO_CLAN_FIGHT.uiShowing).toBeNull();
    expect(() => { NO_CLAN_FIGHT.update(DT, {}); NO_CLAN_FIGHT.abort(); }).not.toThrow();
    expect(NO_CLAN_FIGHT.key('e')).toBe(false);
  });

  test('R3: never in the water or off clan ground, and a pill already up hides when the cat wades in', () => {
    const wet = harness();
    wet.player.inWater = true;
    wet.frame();
    expect(wet.cf.uiShowing).toBeNull();
    wet.player.inWater = false;
    wet.frame();
    expect(wet.cf.uiShowing).toBe('challenge');
    wet.player.inWater = true;
    wet.frame();
    expect(wet.cf.uiShowing).toBeNull();
    const truce = harness({ ground: (x) => x > 3 });
    truce.frame();
    expect(truce.cf.uiShowing).toBeNull();
  });

  test('backing off costs nothing and the panel comes back only after you walk away and return', () => {
    const h = harness();
    h.challenge();
    expect(h.cf.uiShowing).toBe('challenge');
    h.cf.backOff();
    expect(h.cf.uiShowing).toBeNull();
    expect(h.calls.filter((c) => c.kind !== 'ui')).toEqual([]);
    for (let i = 0; i < 200; i++) h.frame();           // standing right there
    expect(h.cf.uiShowing).toBeNull();
    h.s.cat.position.x = CHALLENGE_KEEP - 1;             // not far enough
    h.frame();
    h.s.cat.position.x = 2;
    h.frame();
    expect(h.cf.uiShowing).toBeNull();
    h.s.cat.position.x = CHALLENGE_KEEP + 1;             // beyond it once
    h.frame();
    h.s.cat.position.x = 2;
    h.frame();
    expect(h.cf.uiShowing).toBe('challenge');
  });

  test('E and Q reach the pill only while it is up', () => {
    const h = harness();
    expect(h.cf.key('e')).toBe(false);
    expect(h.ui.key).not.toHaveBeenCalled();
    h.challenge();
    h.cf.key('e');
    expect(h.ui.key).toHaveBeenCalledWith('e');
  });
});

describe('the fight', () => {
  test('losing takes nothing: no award, no points, no save, only the intruder walks on', () => {
    const h = harness({ answers: 'wrong' });
    h.challenge(); h.fight(); h.runToEnd();
    expect(h.log.awardOnce).not.toHaveBeenCalled();
    expect(h.intruders.release).toHaveBeenCalledTimes(1);
    expect(h.intruders.flee).not.toHaveBeenCalled();
    // 'stage' is the intruder's fight poses (a visual, like 'fx').
    expect(h.calls.filter((c) => !['hold', 'release', 'toast', 'ui', 'audio', 'fx', 'stage'].includes(c.kind))).toEqual([]);
    expect(h.s.fight).toBeNull(); expect(h.s.fightPose).toBeNull(); expect(h.ui.showing).toBeNull();
    expect(h.hud.toast).toHaveBeenLastCalledWith('Mossjaw shook it off and walked on. Try again soon!');
  });

  test('"Fight!" walks the cat over before the rounds start, and never chases', () => {
    const h = harness({ startAt: 3.4 });
    h.challenge(); h.fight();
    // held first, from where the cat stood, by me, locally; one hiss
    expect(h.intruders.hold).toHaveBeenCalledTimes(1);
    expect(h.intruders.hold.mock.calls[0][0]).toBe(7);
    expect(h.intruders.hold.mock.calls[0][1]).toBe('me');
    expect(h.intruders.hold.mock.calls[0][3]).toEqual({ local: true });
    expect(h.audio.hiss).toHaveBeenCalledTimes(1);
    expect(h.cf.uiShowing).toBe('fight');
    let prev = dist(h.s.cat.position, h.cur.pos);
    let frames = 0;
    while (Math.abs(dist(h.s.cat.position, h.cur.pos) - FIGHT_GAP) > 1e-6 && frames < 200) {
      h.frame();
      frames += 1;
      const d = dist(h.s.cat.position, h.cur.pos);
      expect(prev - d).toBeLessThanOrEqual(RUN * DT + 1e-9); // the player's run speed
      expect(d).toBeLessThanOrEqual(prev + 1e-9);
      expect(h.s.fight.round).toBe(0);                     // rounds wait for the walk
      expect(h.s.fightPose).toBe('follow');
      prev = d;
    }
    expect(frames).toBeLessThan(WALKOVER_MAX / DT);
    expect(h.cur.pos).toEqual({ x: 0, z: 0 });               // the intruder never moved
    h.frame();
    expect(h.s.fightPose).toBe('cross');                     // the square-off
    for (let i = 0; i < 60; i++) h.frame();
    expect(h.s.fight.round).toBe(1);
    expect(dist(h.s.cat.position, h.cur.pos)).toBeCloseTo(FIGHT_GAP, 6);
  });

  test('R3: the walk-over steps only onto clan ground, and the 1.6 m spot is written only on clan ground', () => {
    // ground ends at x = 2.6: the walk stops there and the rounds start where the cat stands
    const h = harness({ startAt: 3.4, ground: (x) => x >= 2.6 });
    h.challenge(); h.fight();
    for (let i = 0; i < 4 / DT; i++) h.frame();
    expect(h.s.fight.round).toBeGreaterThanOrEqual(1);
    expect(h.s.cat.position.x).toBeGreaterThanOrEqual(2.6);
    expect(h.s.cat.position.x).toBeLessThan(3.4);
    // already 1 m away, with the 1.6 m spot off clan ground: it stays put
    const near = harness({ startAt: 1, ground: (x) => x < 1.05 });
    near.challenge(); near.fight();
    for (let i = 0; i < 4 / DT; i++) near.frame();
    expect(near.s.cat.position.x).toBeCloseTo(1, 6);
    expect(near.s.fight.round).toBeGreaterThanOrEqual(1);
  });

  test('attempt counts fights on a visit: a re-challenge gets a different move sequence', () => {
    const seq = (stamp, attempt) => {
      const rng = mulberry32(seedFromCode(`${stamp}|7|${attempt}`));
      return [0, 1].map(() => MOVES[Math.floor(rng() * 3)]);
    };
    let stamp = null;
    for (let i = 0; !stamp; i++) {
      const s = `walk-${i}`;
      if (seq(s, 0).join() !== seq(s, 1).join()) stamp = s;
    }
    const h = harness({ answers: 'wrong', walkStamp: stamp });
    h.challenge(); h.fight(); h.runToEnd();
    expect(h.moves).toEqual(seq(stamp, 0));
    h.clock.T += RECHALLENGE_DELAY + 1;
    h.challenge();
    expect(h.cf.uiShowing).toBe('challenge');
    h.fight();
    h.moves.length = 0;
    h.runToEnd();
    expect(h.moves).toEqual(seq(stamp, 1));
  });

  test('winning chases it off, pays once per visit, and the journal tally comes from feats', () => {
    const progression = createProgression(fakeStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const spy = vi.spyOn(log, 'awardOnce');
    const h = harness({ answers: 'right', log });
    h.challenge(); h.fight(); h.runToEnd();
    expect(h.intruders.flee).toHaveBeenCalledTimes(1);
    expect(h.intruders.flee).toHaveBeenCalledWith(7);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0].slice(0, 2)).toEqual(['intruder', 'intruder-7']);
    expect(spy.mock.calls[0][2]).toBe('You chased off Mossjaw! 🛡️');
    expect(spy.mock.calls[0][2]).not.toMatch(/spotted|running home/);
    expect(progression.state.points).toBe(AWARDS.intruder);
    expect(progression.state.feats.intruder).toBe(1);
    expect(h.hud.toast).toHaveBeenLastCalledWith(`Mossjaw ran back to ${clanName('moor')}'s land! 🏃`);
    expect(h.s.fight).toBeNull(); expect(h.s.fightPose).toBeNull(); expect(h.ui.showing).toBeNull();
    // fled: no second challenge, no second pay
    for (let i = 0; i < 60; i++) h.frame();
    h.fight();
    expect(h.s.fight).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(renderJournalHtml({}, 0, 0, { chasedOff: progression.state.feats.intruder }))
      .toContain('🛡️ Intruders chased off: 1');
  });

  test('a lost visit can be challenged again after 20 s, not before', () => {
    const h = harness({ answers: 'wrong' });
    h.challenge(); h.fight(); h.runToEnd();
    const lostAt = h.clock.T;
    while (h.clock.T < lostAt + RECHALLENGE_DELAY - 0.1) {
      h.frame();
      expect(h.cf.uiShowing).toBeNull();
    }
    for (let i = 0; i < 6; i++) h.frame();
    expect(h.cf.uiShowing).toBe('challenge');
  });

  test('the cat holds still for the whole fight and moves again after', () => {
    const h = harness({ answers: 'right' });
    h.challenge(); h.fight();
    expect(h.player.halt).toHaveBeenCalled();
    let frames = 0;
    h.runToEnd(() => {
      if (!h.s.fight) return;
      frames += 1;
      expect(typeof h.s.fightPose).toBe('string');
    });
    expect(frames).toBeGreaterThan(60);
    expect(h.s.fightPose).toBeNull();
    // avatar.js: no speed while a fight is on, and the fight's pose is drawn
    const avatar = readFileSync(new URL('../src/game/avatar.js', import.meta.url), 'utf8');
    expect(avatar).toMatch(/player\.speedFactor = \([^)]*s\.fight[^)]*\) \? 0/);
    expect(avatar).toContain('s.fightPose');
  });

  test('every beat: square-off, the clue on the intruder, answers, tumble and the loser stepping back', () => {
    const h = harness({ answers: 'right' });
    h.challenge(); h.fight();
    const staged = [];
    const mine = new Set();
    h.runToEnd(() => {
      if (h.s.fight) mine.add(h.s.fightPose);
    });
    for (const c of h.calls) if (c.kind === 'stage' && c.st) staged.push(c.st.pose);
    expect(staged).toContain('cross');
    for (const m of h.moves) expect(staged).toContain(CLUES[m].pose);
    expect(staged).toContain('pounce');                 // the tumble
    expect(staged).toContain('scared');                 // I won: it steps back
    expect(mine).toContain('cross');
    expect(mine).toContain('pounce');
    for (const m of h.moves) {
      const answer = COUNTER[m];
      expect(mine).toContain(answer === 'dodge' ? 'land' : answer);
    }
    // a lost round: my cat steps back scared
    const l = harness({ answers: 'wrong' });
    l.challenge(); l.fight();
    const lost = new Set();
    l.runToEnd(() => { if (l.s.fight) lost.add(l.s.fightPose); });
    expect(lost).toContain('scared');
  });

  test('ending the walk mid-fight releases the cat and pays nothing', () => {
    const h = harness({ answers: 'right' });
    h.challenge(); h.fight();
    for (let i = 0; i < 90; i++) h.fightFrame();
    expect(h.s.fight).not.toBeNull();
    h.cf.abort();
    expect(h.intruders.release).toHaveBeenCalledWith(7, 'me');
    expect(h.intruders.flee).not.toHaveBeenCalled();
    expect(h.log.awardOnce).not.toHaveBeenCalled();
    expect(h.s.fight).toBeNull(); expect(h.s.fightPose).toBeNull();
    expect(h.ui.showing).toBeNull();
    expect(h.cf.uiShowing).toBeNull();
    // and an abort with nothing on does nothing
    const before = h.calls.length;
    h.cf.abort();
    expect(h.calls.length).toBe(before);
  });

  test('R3: the dodge, the tumble and the step back never put a cat off clan ground', () => {
    // Clan ground is only the line z = 0 here: every side-step and circle
    // point is off it (water, a bog, a collider).
    const onLine = (x, z) => Math.abs(z) < 1e-6;
    for (const answers of ['dodge', 'pounce', 'swipe']) {
      const h = harness({ answers, ground: onLine });
      h.challenge(); h.fight();
      let frames = 0;
      h.runToEnd(() => {
        frames += 1;
        expect(onLine(h.s.cat.position.x, h.s.cat.position.z)).toBe(true);
        const st = h.intruders.stage.mock.calls.at(-1)?.[1];
        if (st) expect(onLine(st.x, st.z)).toBe(true);
      });
      expect(frames).toBeGreaterThan(60);
    }
  });

  test('a walk-over that stopped short: no circling across the gap it could not cross', () => {
    // ground ends at x = 3: the cat stops 3 m out, and the circle would sweep
    // it over the ground between (all of which the predicate accepts here, so
    // only the gap rule keeps it out)
    const h = harness({ answers: 'wrong', startAt: 3.4, ground: (x) => x >= 3 });
    h.challenge(); h.fight();
    let spot = null;
    let far = 0;
    h.runToEnd(() => {
      if (!h.s.fight) return;
      if (h.s.fight.round >= 1 && !spot) spot = { ...h.s.cat.position };
      if (spot) far = Math.max(far, dist(h.s.cat.position, spot));
    });
    expect(spot.x).toBeGreaterThanOrEqual(3);
    expect(far).toBeLessThanOrEqual(SIDE_STEP + 0.41);
  });

  test('winning: it flees from its held spot, with no jump', () => {
    const h = harness({ answers: 'right' });
    h.challenge(); h.fight(); h.runToEnd();
    const fleeAt = h.calls.findIndex((c) => c.kind === 'flee');
    const last = h.calls.slice(0, fleeAt).filter((c) => c.kind === 'stage' && c.st).at(-1).st;
    expect(dist(last, h.cur.pos)).toBeLessThan(0.02);
  });

  test('reduced motion never circles, even if the tumble were long enough to', async () => {
    const { TIMING } = await import('../src/fight.js');
    const was = TIMING.tumbleReduced;
    TIMING.tumbleReduced = TIMING.tumble;
    try {
      const h = harness({ answers: 'wrong', reducedMotion: true });
      h.challenge(); h.fight();
      let spot = null;
      let far = 0;
      h.runToEnd(() => {
        if (!h.s.fight) return;
        if (h.s.fight.round >= 1 && !spot) spot = { ...h.s.cat.position };
        if (spot) far = Math.max(far, dist(h.s.cat.position, spot));
      });
      expect(far).toBeLessThanOrEqual(SIDE_STEP + 0.41);
      expect(h.fx.burst.mock.calls.length).toBe(2);
    } finally {
      TIMING.tumbleReduced = was;
    }
  });

  test('reduced motion: no circling, one puff per round', () => {
    const run = (reducedMotion) => {
      const h = harness({ answers: 'wrong', reducedMotion });
      h.challenge(); h.fight();
      let spot = null;
      let far = 0;
      h.runToEnd(() => {
        if (!h.s.fight) return;
        if (h.s.fight.round >= 1 && !spot) spot = { ...h.s.cat.position };
        if (spot) far = Math.max(far, dist(h.s.cat.position, spot));
      });
      return { puffs: h.fx.burst.mock.calls.length, far };
    };
    const full = run(false);
    const calm = run(true);
    expect(full.puffs).toBe(2 * 2);           // two rounds, two bursts each
    expect(calm.puffs).toBe(2);               // two rounds, one puff each
    expect(full.far).toBeGreaterThan(FIGHT_GAP - 0.1);     // it circled round to the far side
    expect(calm.far).toBeLessThanOrEqual(SIDE_STEP + 0.41); // a step at most
  });
});

describe('the fight on the network', () => {
  const FIGHT = { v: 1, id: 'me', type: 'intruder-fight', area: 'woods', visit: 7 };

  test('sends exactly one fight and one done per fight: won, lost, aborted', () => {
    const won = harness({ answers: 'right' });
    won.challenge(); won.fight();
    expect(won.sent).toEqual([FIGHT]);
    won.runToEnd();
    expect(won.sent).toEqual([FIGHT, { ...FIGHT, type: 'intruder-done', fled: true }]);

    const lost = harness({ answers: 'wrong' });
    lost.challenge(); lost.fight(); lost.runToEnd();
    expect(lost.sent).toEqual([FIGHT, { ...FIGHT, type: 'intruder-done', fled: false }]);

    const ab = harness({ answers: 'none' });
    ab.challenge(); ab.fight(); ab.frame();
    ab.cf.abort(); ab.cf.abort();
    expect(ab.sent).toEqual([FIGHT, { ...FIGHT, type: 'intruder-done', fled: false }]);
  });

  test('a pill backed away from sends nothing', () => {
    const h = harness();
    h.challenge(); h.cf.backOff(); h.cf.abort();
    expect(h.sent).toEqual([]);
  });

  test('sends nothing solo (no sendEvent given)', () => {
    const h = harness({ solo: true });
    h.challenge(); h.fight(); h.runToEnd();
    expect(h.sent).toEqual([]);
  });

  test('chasedOffTogether pays once, ends my fight, tells her once, and a second call pays nothing', () => {
    const h = harness({ answers: 'none' });
    h.challenge(); h.fight(); h.frame();
    expect(h.cf.engagedVisit).toBe(7);
    expect(h.cf.chasedOffTogether(7, 'Robin')).toBe(true);
    expect(h.s.fight).toBeNull();
    expect(h.log.awardOnce).toHaveBeenCalledTimes(1);
    expect(h.log.awardOnce.mock.calls[0].slice(0, 2)).toEqual(['intruder', 'intruder-7']);
    expect(h.log.awardOnce.mock.calls[0][2]).toBe('You chased off Mossjaw! 🛡️');
    expect(h.hud.toast).toHaveBeenCalledWith('You and Robin chased Mossjaw off together! 🏃');
    expect(h.cf.chasedOffTogether(7, 'Robin')).toBe(false);
    expect(h.log.awardOnce).toHaveBeenCalledTimes(1);
    expect(h.sent.filter((e) => e.type === 'intruder-done')).toHaveLength(1);
  });

  test('chasedOffTogether does nothing for a pill, an idle device or another visit', () => {
    const h = harness();
    expect(h.cf.chasedOffTogether(7, 'Robin')).toBe(false);
    h.challenge();
    expect(h.cf.chasedOffTogether(7, 'Robin')).toBe(false);
    h.fight();
    expect(h.cf.chasedOffTogether(8, 'Robin')).toBe(false);
    expect(h.log.awardOnce).not.toHaveBeenCalled();
  });

  test('hideChallengeFor hides only my pill for that visit', () => {
    const h = harness();
    h.challenge();
    expect(h.cf.hideChallengeFor(8)).toBe(false);
    expect(h.cf.hideChallengeFor(7)).toBe(true);
    expect(h.ui.showing).toBeNull();
  });
});

// The fight camera (src/fightcam.js) is fed by cameraSubject: every spot
// either cat can stand on, from the "Fight!" tap to the fight's end.
describe('the fight camera\'s subject', () => {
  const near = (pts, p, tol) => pts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) <= tol);

  test('none while idle or while only the pill is up; one from "Fight!" to the end, steady within a phase', () => {
    expect(NO_CLAN_FIGHT.cameraSubject).toBeNull();
    const h = harness({ startAt: 3.4 });
    expect(h.cf.cameraSubject).toBeNull();
    h.challenge();
    expect(h.cf.cameraSubject).toBeNull();
    h.fight();
    const walk = h.cf.cameraSubject;
    expect(walk).not.toBeNull();
    // the walk-over: the run from where I stand to the fight's spot, and the intruder
    expect(near(walk.path, { x: 3.4, z: 0 }, 0.01)).toBe(true);
    expect(near(walk.me, { x: FIGHT_GAP, z: 0 }, 0.01)).toBe(true);
    expect(near(walk.it, { x: 0, z: 0 }, 0.01)).toBe(true);
    h.fightFrame();
    expect(h.cf.cameraSubject).toBe(walk); // the same object: the camera re-chooses only when it changes
    for (let i = 0; i < 200 && h.cf.cameraSubject === walk; i++) h.fightFrame();
    const rounds = h.cf.cameraSubject;
    expect(rounds).not.toBe(walk);
    expect(rounds.path).toEqual([]);
    h.fightFrame();
    expect(h.cf.cameraSubject).toBe(rounds);
    h.runToEnd();
    expect(h.cf.cameraSubject).toBeNull();
  });

  test('gone after a loss, an abort, a sibling\'s win and an intruder lost from under the fight', () => {
    const lost = harness({ answers: 'wrong' });
    lost.challenge(); lost.fight(); lost.runToEnd();
    expect(lost.cf.cameraSubject).toBeNull();
    const ab = harness();
    ab.challenge(); ab.fight(); ab.fightFrame();
    expect(ab.cf.cameraSubject).not.toBeNull();
    ab.cf.abort();
    expect(ab.cf.cameraSubject).toBeNull();
    const tog = harness();
    tog.challenge(); tog.fight(); tog.fightFrame();
    tog.cf.chasedOffTogether(7, 'Robin');
    expect(tog.cf.cameraSubject).toBeNull();
    const gone = harness();
    gone.challenge(); gone.fight(); gone.fightFrame();
    gone.cur.state = 'gone';
    gone.frame();
    expect(gone.cf.cameraSubject).toBeNull();
  });

  test('every spot the fight stages either cat on is within 0.2 m of the subject\'s spots', () => {
    for (const opts of [{ answers: 'right' }, { answers: 'wrong' }, { answers: 'dodge' }, { answers: 'right', reducedMotion: true }]) {
      const h = harness(opts);
      h.challenge(); h.fight();
      let checked = 0;
      h.runToEnd(() => {
        const subj = h.cf.cameraSubject;
        if (!subj) return;
        const all = [...subj.me, ...subj.it, ...subj.path];
        const me = h.s.cat.position;
        expect(near(all, me, 0.2), `me ${me.x.toFixed(2)},${me.z.toFixed(2)}`).toBe(true);
        const st = h.intruders.stage.mock.calls.at(-1)?.[1];
        if (st && h.s.fight?.phase !== undefined && h.cf.cameraSubject.path.length === 0) {
          expect(near(all, st, 0.2), `it ${st.x.toFixed(2)},${st.z.toFixed(2)}`).toBe(true);
        }
        checked++;
      });
      expect(checked).toBeGreaterThan(100);
    }
  });

  test('with actions, every spot the fight stages either cat on is within 0.2 m of the subject\'s spots', () => {
    const special = (f) => (f.round === 2 ? 'rollingTumble' : 'wrong');
    for (const opts of [
      { answers: 'right' }, { answers: 'wrong' }, { answers: 'dodge' }, { answers: special, ownedMoves: () => ['rollingTumble'] },
      { answers: 'right', walkStamp: 'walk-3' }, { answers: 'wrong', walkStamp: 'walk-4' },
      { answers: 'right', startAt: 3.4, ground: (x) => x >= 2.6 }, { answers: 'right', reducedMotion: true },
    ]) {
      const h = harness({ ...opts, actions: true });
      h.challenge(); h.fight();
      let checked = 0;
      // A rolling cat stands where its torso centre is: the roll turns the
      // group's origin round it (fightReach's spots are the centre's).
      const centre = (p, roll, pivotY, from, to) => {
        const n = Math.hypot(to.x - from.x, to.z - from.z);
        const fx = (to.x - from.x) / n, fz = (to.z - from.z) / n;
        const k = pivotY * Math.sin(roll || 0);
        return { x: p.x + fz * k, z: p.z - fx * k };
      };
      h.runToEnd(() => {
        const subj = h.cf.cameraSubject;
        if (!subj) return;
        const all = [...subj.me, ...subj.it, ...subj.path];
        const rounds = subj.path.length === 0;
        const me = rounds ? centre(h.s.cat.position, h.s.fightRoll, ME_DIMS.pivotY, subj.me[0], subj.it[0]) : h.s.cat.position;
        expect(near(all, me, 0.2), `me ${me.x.toFixed(2)},${me.z.toFixed(2)}`).toBe(true);
        const st = h.intruders.stage.mock.calls.at(-1)?.[1];
        if (st && rounds) {
          const it = centre(st, st.roll, IT_DIMS.pivotY, subj.it[0], subj.me[0]);
          expect(near(all, it, 0.2), `it ${it.x.toFixed(2)},${it.z.toFixed(2)}`).toBe(true);
        }
        checked++;
      });
      expect(checked).toBeGreaterThan(100);
    }
  });

  test('with actions, both subjects carry the action reach: measured at FIGHT_GAP for the walk-over, at the real gap for the rounds', () => {
    const h = harness({ actions: true, startAt: 3.4, ground: (x) => x >= 2.9 });
    h.challenge(); h.fight();
    const walk = h.cf.cameraSubject;
    expect(walk.me.some((q) => q.y > 0)).toBe(true);
    for (let i = 0; i < 400 && h.cf.cameraSubject === walk; i++) h.fightFrame();
    const rounds = h.cf.cameraSubject;
    expect(rounds.path).toEqual([]);
    const spot = { ...h.s.cat.position };
    const gap = Math.hypot(spot.x, spot.z);
    expect(gap).toBeGreaterThan(FIGHT_GAP + 0.5); // the walk stopped short
    expect(rounds).toEqual({
      ...fightReach({ x: rounds.me[0].x, z: rounds.me[0].z }, { x: 0, z: 0 }, (x) => x >= 2.9,
        { actions: true, reachY: reachYFor(ME_DIMS, IT_DIMS, gap) }),
      path: [],
    });
    expect(walk.me).toEqual(fightReach({ x: FIGHT_GAP, z: 0 }, { x: 0, z: 0 }, (x) => x >= 2.9,
      { actions: true, reachY: reachYFor(ME_DIMS, IT_DIMS, FIGHT_GAP) }).me);
  });

  test('fightReach: both anchors, the dodge, the step backs and the tumble circle', () => {
    const r = fightReach({ x: FIGHT_GAP, z: 0 }, { x: 0, z: 0 });
    expect(r.mid).toEqual({ x: FIGHT_GAP / 2, z: 0 });
    expect(r.axis).toEqual({ x: 1, z: 0 });
    expect(near(r.me, { x: FIGHT_GAP, z: SIDE_STEP }, 1e-9)).toBe(true);
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      expect(near([...r.me, ...r.it], { x: FIGHT_GAP / 2 + Math.cos(a) * FIGHT_GAP / 2, z: Math.sin(a) * FIGHT_GAP / 2 }, 0.2)).toBe(true);
    }
  });
});

// Task 5 (fight moves and scars): in actions mode the subject holds every
// spot an action, a beat or a prelude puts either cat on, and each spot's `y`
// is how far the cat's top rises there above its own standing top.
describe('the fight camera sees every action', () => {
  const near = (pts, p, tol) => pts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) <= tol);
  // fightReach({ x: 1.6, z: 0 }, { x: 0, z: 0 }, (x, z) => z > -0.5) before Task 5.
  const TODAY = {
    mid: { x: 0.8, z: 0 }, axis: { x: 1, z: 0 },
    me: [{ x: 1.6, z: 0 }, { x: 1.6, z: 0.4 }, { x: 1.6, z: 0.8 }, { x: 2, z: 0 }, { x: 1.6, z: 0 },
      { x: 1.5391036260090294, z: 0.30614674589207186 }, { x: 1.365685424949238, z: 0.565685424949238 },
      { x: 1.106146745892072, z: 0.7391036260090295 }, { x: 0.8, z: 0.8 }, { x: 0.49385325410792824, z: 0.7391036260090295 },
      { x: 0.23431457505076203, z: 0.5656854249492381 }, { x: 0.06089637399097059, z: 0.3061467458920719 },
      { x: 0, z: 9.797174393178826e-17 }, { x: 0.060896373990970476, z: -0.3061467458920717 },
      { x: 1.5391036260090294, z: -0.30614674589207236 }],
    it: [{ x: 0, z: 0 }, { x: -0.3, z: 0 }, { x: -0.6, z: 0 }, { x: -0.4, z: 0 }],
  };

  test('actions:false reach is today\'s', () => {
    const ok = (x, z) => z > -0.5;
    expect(closeDiffs(fightReach({ x: 1.6, z: 0 }, { x: 0, z: 0 }, ok), TODAY)).toEqual([]);
    expect(closeDiffs(fightReach({ x: 1.6, z: 0 }, { x: 0, z: 0 }, ok, { actions: false }), TODAY)).toEqual([]);
    // a reachY changes nothing without actions
    const reachY = { me: [{ along: 0, side: 0, y: 0.5 }], it: [{ along: 0, side: 0, y: 0.5 }] };
    expect(closeDiffs(fightReach({ x: 1.6, z: 0 }, { x: 0, z: 0 }, ok, { actions: false, reachY }), TODAY)).toEqual([]);
  });

  test('actions: the lines between the anchors, the middle, the sidesteps and the flinch spots; no circle', () => {
    const spot = { x: 3, z: 1 }, foeAt = { x: 3 - FIGHT_GAP, z: 1 };
    const r = fightReach(spot, foeAt, () => true, { actions: true });
    expect(r.mid).toEqual({ x: 3 - FIGHT_GAP / 2, z: 1 });
    expect(r.axis).toEqual({ x: 1, z: 0 });
    expect(r.me[0]).toEqual({ x: 3, z: 1 });
    expect(r.it[0]).toEqual({ x: foeAt.x, z: 1 });
    for (const [pts, from, dir] of [[r.me, spot, -1], [r.it, foeAt, 1]]) {
      // each cat's line toward the other, out to the far anchor, every <= 0.2 m (within 0.1 m of a spot)
      for (let a = 0; a <= FIGHT_GAP + 1e-9; a += 0.01) expect(near(pts, { x: from.x + dir * a, z: 1 }, 0.1 + 1e-9)).toBe(true);
      expect(near(pts, r.mid, 1e-9)).toBe(true);
      // the beat's sidesteps and step-in, today's dodge both ways, the flinch spot
      for (const s of [0.3, -0.3]) expect(near(pts, { x: from.x, z: 1 + s }, 1e-9)).toBe(true);
      expect(near(pts, { x: from.x + dir * 0.15, z: 1 }, 0.1)).toBe(true);
      expect(near(pts, { x: from.x - dir * 0.5, z: 1 }, 1e-9)).toBe(true);
    }
    // today's spots stay (less the circle): my dodge (both ways now) and step back,
    // the charge's ease-back and its step back
    for (const s of [SIDE_STEP / 2, SIDE_STEP, -SIDE_STEP / 2, -SIDE_STEP]) expect(near(r.me, { x: 3, z: 1 + s }, 1e-9)).toBe(true);
    expect(near(r.me, { x: 3 + 0.4, z: 1 }, 1e-9)).toBe(true);
    for (const b of [0.3, 0.6, 0.4]) expect(near(r.it, { x: foeAt.x - b, z: 1 }, 1e-9)).toBe(true);
    // no tumble circle: nothing further than 0.8 m off the anchor line
    for (const p of [...r.me, ...r.it]) expect(Math.abs(p.z - 1)).toBeLessThanOrEqual(SIDE_STEP + 1e-9);
    expect(near([...r.me, ...r.it], { x: r.mid.x, z: 1 + FIGHT_GAP / 2 }, 0.3)).toBe(false);
    // no reachY: no spot carries a y
    for (const p of [...r.me, ...r.it]) expect(p.y).toBeUndefined();
    // the ground check drops spots, never the anchors
    const strict = fightReach(spot, foeAt, () => false, { actions: true });
    expect(strict.me).toEqual([{ x: 3, z: 1 }]);
    expect(strict.it).toEqual([{ x: foeAt.x, z: 1 }]);
  });

  test('every staged spot of every action and beat is inside the action reach', () => {
    const intruder = buildCat('tabby', undefined, { simple: true, style: clanCast('woods')[3].style });
    intruder.scale.multiplyScalar(0.85); // intruders.js INTRUDER_SCALE
    const mine = buildCat('mainecoon'); // the largest preset
    const cats = { me: mine, it: intruder };
    const dims = { me: catDims(mine), it: catDims(intruder) };
    const spot = { x: 2.5, z: -1 }, foeAt = { x: 2.5 - FIGHT_GAP * 0.6, z: -1 - FIGHT_GAP * 0.8 };
    const reachY = reachYFor(dims.me, dims.it, FIGHT_GAP);
    const r = fightReach(spot, foeAt, () => true, { actions: true, reachY });
    const anchor = { me: spot, it: foeAt };
    const toward = {
      me: { x: (foeAt.x - spot.x) / FIGHT_GAP, z: (foeAt.z - spot.z) / FIGHT_GAP },
      it: { x: (spot.x - foeAt.x) / FIGHT_GAP, z: (spot.z - foeAt.z) / FIGHT_GAP },
    };
    const box = new THREE.Box3();
    let checked = 0, lifted = 0;
    // Pose `who` from frame f at time t as clanfight stages it and check its
    // top against the reach spot nearest where it stands, which must be
    // within 0.2 m (for a roll, where its torso centre stands, which the roll
    // turns about: the group's origin swings round it).
    function check(who, f, t, at) {
      const cat = cats[who], d = dims[who];
      const p = placeFrame(f, d);
      animateCat(cat, f.pose, t, 0, false);
      cat.rotation.order = 'YXZ';
      cat.rotation.set(f.pitch, 0, f.roll);
      cat.position.set(0, p.y, 0);
      cat.updateMatrixWorld(true);
      const rise = box.setFromObject(cat, true).max.y - d.top;
      cat.rotation.set(0, 0, 0);
      cat.position.set(0, 0, 0);
      const fw = toward[who], right = { x: -fw.z, z: fw.x };
      const side = p.dSide - (f.roll ? d.pivotY * Math.sin(f.roll) : 0);
      const at2 = { x: anchor[who].x + fw.x * p.dAlong + right.x * side, z: anchor[who].z + fw.z * p.dAlong + right.z * side };
      const dist = (q) => Math.hypot(q.x - at2.x, q.z - at2.z);
      const q = r[who].reduce((b, c) => (dist(c) < dist(b) ? c : b));
      if (dist(q) > 0.2) throw new Error(`${at}: no reach spot within 0.2 m (${dist(q).toFixed(3)})`);
      if (rise > (q.y ?? 0) + 0.05) throw new Error(`${at}: top rose ${rise.toFixed(3)} at a spot with y ${(q.y ?? 0).toFixed(3)}`);
      checked++;
      if (rise > 0.3) lifted++;
    }
    const us = Array.from({ length: 120 }, (_, i) => i / 119);
    for (const kind of ACTION_KINDS) {
      for (const big of kind === 'roll' ? [true] : [false, true]) {
        for (const by of ['me', 'it']) {
          const other = by === 'me' ? 'it' : 'me';
          const o = { gap: FIGHT_GAP, winBackY: dims[by].backY, loseBackY: dims[other].pinnedBackY };
          for (const u of us) {
            const fr = actionFrame(kind, big, u, o);
            const at = `${kind}${big ? ' big' : ''} by ${by} u ${u.toFixed(3)}`;
            // the pin's winner stands on the loser's back, not the ground
            check(by, fr.win, u * 3, `${at} win`);
            check(other, fr.lose, u * 3, `${at} lose`);
          }
        }
      }
    }
    for (const beat of [0, 1, 2]) {
      for (const u of us) {
        const f = beatFrame(beat, u);
        check('me', f, u * 3, `beat ${beat} me u ${u}`);
        check('it', f, u * 3, `beat ${beat} it u ${u}`);
      }
    }
    // the answer preludes (Task 6 stages them before every action)
    for (const u of us) {
      for (const answer of [...BUTTONS, 'rearUpSwat', 'leapScratch', 'pin', 'rollingTumble', null]) {
        check('me', preludeFrame({ answer }, 'me', u), u * 3, `prelude ${answer} me u ${u}`);
      }
      for (const move of MOVES) check('it', preludeFrame({ move }, 'it', u), u * 3, `prelude ${move} it u ${u}`);
    }
    expect(checked).toBeGreaterThan(3000);
    expect(lifted).toBeGreaterThan(100); // the leaps, the rear-ups and the pins were all in there
    // and the camera's points reach the leap's top
    expect(Math.max(...r.me.map((q) => q.y ?? 0))).toBeGreaterThan(0.7);
  });

  test('reachYFor: one sample list per cat, every y finite and above 0, more for the bigger cat', () => {
    const big = catDims(buildCat('mainecoon'));
    const small = catDims(buildCat('digit'));
    const ry = reachYFor(big, small, FIGHT_GAP);
    expect(ry.me.length).toBeGreaterThan(10);
    expect(ry.it.length).toBeGreaterThan(10);
    for (const s of [...ry.me, ...ry.it]) {
      for (const k of ['along', 'side', 'y']) expect(Number.isFinite(s[k])).toBe(true);
      expect(s.y).toBeGreaterThan(0);
    }
    const top = (l) => Math.max(...l.map((s) => s.y));
    expect(top(ry.me)).toBeGreaterThan(top(ry.it));
    // the same dims, the same answer (pure)
    expect(reachYFor(big, small, FIGHT_GAP)).toEqual(ry);
  });
});

describe('the fight camera follows the fight', () => {
  const BOUNDS = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  function camera() {
    const cam = { aspect: 375 / 812, fov: 70, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } };
    cam.lookAt = () => {};
    return cam;
  }
  // One frame as main.js runs it: the follow camera, the fight, the fight camera.
  function drive(h, fc, cam, step) {
    const log = [];
    const frame = () => {
      const c = h.s.cat.position;
      cam.position.set(c.x, 2.2, c.z + 4.5);
      step();
      const moved = fc.update(DT, { subject: h.cf.cameraSubject, cameraMode: h.s.cameraMode, camera: cam, cat: c });
      log.push({ fighting: !!h.s.fight, moved, w: fc.weight });
    };
    return { log, frame };
  }

  for (const [label, opts, end] of [
    ['a win', { answers: 'right' }, (h) => h.runToEnd()],
    ['a loss', { answers: 'wrong' }, (h) => h.runToEnd()],
    ['an abort', { answers: 'right' }, (h) => { for (let i = 0; i < 120; i++) h.fightFrame(); h.cf.abort(); }],
  ]) {
    test(`reduced motion: on exactly while the fight is, off after ${label}`, () => {
      const h = harness({ ...opts, reducedMotion: true });
      const fc = createFightCam({ bounds: BOUNDS, reducedMotion: true });
      const cam = camera();
      const d = drive(h, fc, cam, () => h.frame());
      for (let i = 0; i < 5; i++) d.frame();
      h.challenge(); d.frame();
      h.fight();
      const d2 = drive(h, fc, cam, () => h.fightFrame());
      for (let i = 0; i < 2000 && h.s.fight; i++) d2.frame();
      if (h.s.fight) end(h);
      d.frame();
      const all = [...d.log.slice(0, 6), ...d2.log];
      for (const f of all.slice(0, 6)) expect(f.moved).toBe(false);
      for (const f of d2.log) expect(f.moved).toBe(f.fighting);
      expect(d.log.at(-1).moved).toBe(false);
      expect(fc.weight).toBe(0);
    });
  }

  test('eases back to the follow camera after the fight, within a second', () => {
    const h = harness({ answers: 'right' });
    const fc = createFightCam({ bounds: BOUNDS });
    const cam = camera();
    h.challenge(); h.fight();
    const d = drive(h, fc, cam, () => h.fightFrame());
    for (let i = 0; i < 2000 && h.s.fight; i++) d.frame();
    expect(d.log.filter((f) => f.fighting).every((f) => f.moved)).toBe(true);
    expect(d.log.filter((f) => f.fighting).at(-1).w).toBe(1);
    const after = drive(h, fc, cam, () => h.frame());
    for (let i = 0; i < 30; i++) after.frame();
    expect(fc.weight).toBe(0);
    expect(after.log.at(-1).moved).toBe(false);
  });

  test('never in photo mode', () => {
    const h = harness({ answers: 'right' });
    const fc = createFightCam({ bounds: BOUNDS, reducedMotion: true });
    const cam = camera();
    h.challenge(); h.fight();
    const d = drive(h, fc, cam, () => h.fightFrame());
    for (let i = 0; i < 30; i++) d.frame();
    expect(d.log.at(-1).moved).toBe(true);
    h.s.cameraMode = true;
    d.frame();
    expect(d.log.at(-1).moved).toBe(false);
  });
});

// Task 6 (fight moves and scars): with `actions` the rounds play as leaps,
// rear-ups, pins and rolling tumbles, the cats square up between rounds, and
// the end of a fight is reported through onWon / onLost.
describe('the fight plays the actions', () => {
  const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z) + Math.PI;
  const turn = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  // A walk stamp whose first three clues pass `ok`.
  const stampWith = (ok) => {
    for (let i = 0; ; i++) {
      const s = `walk-${i}`;
      const rng = mulberry32(seedFromCode(`${s}|7|0`));
      if (ok([0, 1, 2].map(() => MOVES[Math.floor(rng() * 3)]))) return s;
    }
  };
  // Every frame of the rounds (the walk-over is over): my cat and the
  // intruder as staged, with the anchors the rounds stand on.
  function play(opts) {
    const frames = [];
    let anchors = null;
    let tumbleT = 0;
    const h = harness({ actions: true, ...opts, onFrame: record });
    h.challenge(); h.fight();
    h.runToEnd();
    return { h, frames, anchors };
    // Each frame as staged, before the harness taps an answer.
    function record() {
      const f = h.s.fight;
      const subj = h.cf.cameraSubject;
      if (!f || !subj || subj.path.length !== 0) return;
      anchors ??= { me: subj.me[0], it: subj.it[0] };
      tumbleT = f.phase === 'tumble' ? tumbleT + (opts.dt ?? DT) : 0;
      const st = h.intruders.stage.mock.calls.at(-1)?.[1];
      const s = h.s;
      frames.push({
        phase: f.phase, round: f.round, tumbleT,
        me: { x: s.cat.position.x, z: s.cat.position.z, y: s.fightLift, pitch: s.fightPitch, roll: s.fightRoll, pose: s.fightPose, yaw: s.cat.rotation.y },
        it: { x: st.x, z: st.z, y: st.y, pitch: st.pitch, roll: st.roll, pose: st.pose, yaw: yawTo(st, st.face) },
      });
    }
  }
  const max = (l, f) => Math.max(...l.map(f));
  const min = (l, f) => Math.min(...l.map(f));
  // How far p is to the side of the anchor line, from anchor a.
  const lateral = (p, a, anchors) => {
    const ax = anchors.it.x - anchors.me.x, az = anchors.it.z - anchors.me.z;
    const n = Math.hypot(ax, az);
    return Math.abs(((p.x - a.x) * az - (p.z - a.z) * ax) / n);
  };
  const along = (p, a, toward) => {
    const ax = toward.x - a.x, az = toward.z - a.z;
    return ((p.x - a.x) * ax + (p.z - a.z) * az) / Math.hypot(ax, az);
  };

  test('with actions, a won round plays its action and both cats come home before the beat', () => {
    // a right answer: swipe (to a back-up) leaps, pounce (to a raised paw) rears up, dodge (to a crouch) pins
    for (const clue of ['charge', 'swipe', 'pounce']) {
      const { frames, anchors } = play({ answers: 'right', walkStamp: stampWith((m) => m[0] === clue) });
      const r1 = frames.filter((f) => f.phase === 'tumble' && f.round === 1);
      expect(r1.length).toBeGreaterThan(60);
      // first today's answer poses (the prelude), then the action
      const prelude = r1.filter((f) => f.tumbleT < 0.35 - 1e-9);
      expect(prelude.length).toBeGreaterThan(5);
      const answer = COUNTER[clue];
      for (const f of prelude) {
        expect(f.me.pose).toBe(answer === 'dodge' ? 'land' : answer);
        expect(f.it.pose).toBe(clue === 'charge' ? 'follow' : clue);
      }
      if (answer === 'dodge') expect(max(prelude, (f) => lateral(f.me, anchors.me, anchors))).toBeGreaterThan(0.6);
      if (clue === 'charge') {
        expect(min(r1, (f) => dist(f.me, anchors.it))).toBeLessThan(0.7);
        expect(max(r1, (f) => f.me.y)).toBeGreaterThanOrEqual(0.4);
        expect(r1.map((f) => f.me.pose)).toContain('pounce');
        expect(r1.map((f) => f.it.pose)).toContain('flinch');
      } else if (clue === 'swipe') {
        expect(max(r1, (f) => f.me.pitch)).toBeGreaterThanOrEqual(0.8);
        expect(max(r1, (f) => f.it.pitch)).toBeGreaterThanOrEqual(0.8);
        expect(r1.map((f) => f.me.pose)).toContain('rearUp');
      } else {
        const on = r1.filter((f) => dist(f.me, f.it) < 0.05 && Math.abs(f.me.y - IT_DIMS.pinnedBackY) <= 0.05);
        expect(on.length).toBeGreaterThan(10);
        expect(on.map((f) => f.me.pose)).toContain('pinning');
        expect(on.map((f) => f.it.pose)).toContain('pinned');
      }
      // home before every beat, and a beat starts at the anchors, level
      let beats = 0;
      for (let i = 1; i < frames.length; i++) {
        const [a, b] = [frames[i - 1], frames[i]];
        if (b.phase !== 'beat' || a.phase === 'beat') continue;
        beats++;
        for (const f of [a, b]) {
          expect(dist(f.me, anchors.me)).toBeLessThan(0.06);
          expect(dist(f.it, anchors.it)).toBeLessThan(0.06);
        }
        for (const c of [b.me, b.it]) expect([c.y, c.pitch, c.roll]).toEqual([0, 0, 0]);
      }
      expect(beats).toBe(1);
    }
  });

  test('a lost round: the intruder lands the action its clue promised', () => {
    for (const clue of ['pounce', 'swipe', 'charge']) {
      const { frames, anchors } = play({ answers: 'wrong', walkStamp: stampWith((m) => m[0] === clue) });
      const r1 = frames.filter((f) => f.phase === 'tumble' && f.round === 1);
      if (clue === 'pounce') {
        // crouch: it pins me
        const on = r1.filter((f) => dist(f.it, anchors.me) < 0.05 && Math.abs(f.it.y - ME_DIMS.pinnedBackY) <= 0.05);
        expect(on.length).toBeGreaterThan(10);
        expect(on.map((f) => f.me.pose)).toContain('pinned');
      } else if (clue === 'swipe') {
        // a raised paw: it rears up and swats
        expect(max(r1, (f) => f.it.pitch)).toBeGreaterThanOrEqual(0.8);
        expect(r1.map((f) => f.it.pose)).toContain('rearUp');
      } else {
        // backs up: it leaps and scratches
        expect(min(r1, (f) => dist(f.it, anchors.me))).toBeLessThan(0.7);
        expect(max(r1, (f) => f.it.y)).toBeGreaterThanOrEqual(0.4);
      }
      // R21: no clue pose outside the clue and the answer prelude
      for (const f of frames) {
        if (f.phase === 'clue' || (f.phase === 'tumble' && f.tumbleT <= 0.35 + 1e-9)) continue;
        expect(['stalk', 'swipe', 'backUp'], `${f.phase} ${f.tumbleT}`).not.toContain(f.it.pose);
      }
    }
  });

  test('a special plays its big action and greys out', () => {
    const ROLL = moveById('rollingTumble');
    // 2–0 from one round
    const one = play({ answers: 'rollingTumble', ownedMoves: () => ['rollingTumble'] });
    expect(one.h.moves).toHaveLength(1);
    expect(one.h.onWon).toHaveBeenCalledTimes(1);
    expect(one.h.onLost).not.toHaveBeenCalled();
    const r1 = one.frames.filter((f) => f.phase === 'tumble');
    expect(r1.map((f) => f.me.pose)).toContain('roll');
    expect(max(r1, (f) => Math.abs(f.me.roll))).toBeGreaterThan(1);
    expect(max(r1, (f) => Math.abs(f.it.roll))).toBeGreaterThan(1);
    const sheets = one.h.ui.showFight.mock.calls.map((c) => c[0]);
    expect(sheets[0].specials).toEqual([{ id: ROLL.id, name: ROLL.name, hint: ROLL.hint, used: false }]);
    expect(sheets.at(-1).specials).toEqual([{ id: ROLL.id, name: ROLL.name, hint: ROLL.hint, used: true }]);
    // 0–1 turns into a win; owned specials come in catalogue order
    const two = play({
      answers: (f) => (f.round === 1 ? 'wrong' : 'leapScratch'),
      walkStamp: stampWith((m) => m[1] === 'charge'),
      ownedMoves: () => ['leapScratch', 'rearUpSwat', 'nope'],
    });
    expect(two.h.moves).toHaveLength(2);
    expect(two.h.onWon).toHaveBeenCalledTimes(1);
    const last = two.h.ui.showFight.mock.calls.at(-1)[0];
    expect(last.specials.map((m) => [m.id, m.used])).toEqual([['rearUpSwat', false], ['leapScratch', true]]);
    expect(last.wins).toBe(2);
    // the big leap peaks higher than the basic one
    const big = two.frames.filter((f) => f.phase === 'tumble' && f.round === 2);
    expect(max(big, (f) => f.me.y)).toBeGreaterThanOrEqual(0.6);
  });

  test('onLost once with the deciding action\'s site; onWon once with castId and site', () => {
    const lost = play({ answers: 'wrong' });
    expect(lost.h.onWon).not.toHaveBeenCalled();
    expect(lost.h.onLost).toHaveBeenCalledTimes(1);
    const lastMove = lost.h.moves.at(-1);
    expect(lost.h.onLost).toHaveBeenCalledWith({ site: siteFor(actionFor({ move: lastMove, won: false }).kind, null) });
    expect(lost.h.hud.toast).toHaveBeenLastCalledWith('Mossjaw shook it off and walked on. That scratch will heal in a few walks!');
    for (const stamp of ['walk-1', 'walk-2', 'walk-5']) {
      const won = play({ answers: 'right', walkStamp: stamp });
      expect(won.h.onLost).not.toHaveBeenCalled();
      expect(won.h.onWon).toHaveBeenCalledTimes(1);
      const m = won.h.moves.at(-1);
      const site = siteFor(actionFor({ move: m, answer: COUNTER[m], won: true }).kind, CAST_ID);
      expect(won.h.onWon).toHaveBeenCalledWith({ visit: 7, castId: CAST_ID, site, together: false });
      expect(site).toMatch(/^(face|shoulder|back)$/);
    }
    // a special's roll scars the side or the hindquarters, by the cast id
    const rolled = play({ answers: 'rollingTumble', ownedMoves: () => ['rollingTumble'] });
    expect(rolled.h.onWon.mock.calls[0][0].site).toBe(siteFor('roll', CAST_ID));
  });

  test('Hagrid (scars:false) loses a beat: one russet and one cream feather puff, once a beat; won beats and scarred cats get none', () => {
    const feathers = (h) => h.fx.burst.mock.calls.filter((c) => c[3] && c[3].gravity === 1.0);
    const lost = harness({ actions: true, scars: false, answers: 'wrong' });
    lost.challenge(); lost.fight(); lost.runToEnd();
    const f = feathers(lost);
    expect(f.length).toBeGreaterThan(0);
    expect(f.length % 2).toBe(0);
    expect(new Set(f.map((c) => c[1]))).toEqual(new Set([0xb06a30, 0xf3e6c8]));
    for (const c of f) { expect(c[2]).toBe(5); expect(Number.isFinite(c[0].y)).toBe(true); }
    const won = harness({ actions: true, scars: false, answers: 'right' });
    won.challenge(); won.fight(); won.runToEnd();
    expect(feathers(won)).toHaveLength(0);
    const scarred = harness({ actions: true, answers: 'wrong' });
    scarred.challenge(); scarred.fight(); scarred.runToEnd();
    expect(feathers(scarred)).toHaveLength(0);
  });

  test('actions with scars:false (Hagrid in the hen fight) fights in actions and never scars', () => {
    const won = harness({ actions: true, scars: false, answers: 'right' });
    won.challenge(); won.fight();
    let staged = false;
    won.runToEnd(() => { if (won.calls.some((c) => c.kind === 'stage' && c.raw && 'pitch' in c.raw && 'roll' in c.raw)) staged = true; });
    expect(staged).toBe(true);
    expect(won.onWon).toHaveBeenCalledTimes(1);
    expect(won.onWon).toHaveBeenCalledWith({ visit: 7, castId: CAST_ID, site: null, together: false });
    const lost = harness({ actions: true, scars: false, answers: 'wrong' });
    lost.challenge(); lost.fight(); lost.runToEnd();
    expect(lost.onLost).toHaveBeenCalledWith({ site: null });
    expect(lost.hud.toast).toHaveBeenLastCalledWith('Mossjaw shook it off and walked on. Try again soon!');
    // chased off together: no site either
    const tog = harness({ actions: true, scars: false });
    tog.challenge(); tog.fight();
    tog.cf.chasedOffTogether(7, 'Pet');
    expect(tog.onWon).toHaveBeenCalledWith({ visit: 7, castId: CAST_ID, site: null, together: true });
    // and plain actions still scar
    const scarred = harness({ actions: true, answers: 'wrong' });
    scarred.challenge(); scarred.fight(); scarred.runToEnd();
    expect(scarred.onLost.mock.calls[0][0].site).not.toBeNull();
    expect(scarred.hud.toast).toHaveBeenLastCalledWith('Mossjaw shook it off and walked on. That scratch will heal in a few walks!');
  });

  test('Hagrid (actions:false) reports site null and plays today\'s tumble', () => {
    const won = harness({ answers: 'right' });
    won.challenge(); won.fight(); won.runToEnd();
    expect(won.onWon).toHaveBeenCalledTimes(1);
    expect(won.onWon).toHaveBeenCalledWith({ visit: 7, castId: CAST_ID, site: null, together: false });
    expect(won.onLost).not.toHaveBeenCalled();
    expect(won.fx.slash).not.toHaveBeenCalled();
    const lost = harness({ answers: 'wrong' });
    lost.challenge(); lost.fight();
    let spot = null, far = 0;
    lost.runToEnd(() => {
      if (!lost.s.fight) return;
      expect(lost.s.fightPitch ?? 0).toBe(0);
      expect(lost.s.fightRoll ?? 0).toBe(0);
      if (lost.s.fight.round >= 1 && !spot) spot = { ...lost.s.cat.position };
      if (spot) far = Math.max(far, dist(lost.s.cat.position, spot));
    });
    expect(lost.onLost).toHaveBeenCalledTimes(1);
    expect(lost.onLost).toHaveBeenCalledWith({ site: null });
    expect(lost.hud.toast).toHaveBeenLastCalledWith('Mossjaw shook it off and walked on. Try again soon!');
    expect(far).toBeGreaterThan(FIGHT_GAP - 0.1); // today's tumble circles
    // R6: Hagrid may use a special too; it wins like any answer and plays today's tumble
    const sp = harness({ answers: 'rollingTumble', ownedMoves: () => ['rollingTumble'] });
    sp.challenge(); sp.fight(); sp.runToEnd();
    expect(sp.moves).toHaveLength(1);
    expect(sp.onWon).toHaveBeenCalledWith({ visit: 7, castId: CAST_ID, site: null, together: false });
    expect(sp.ui.showFight.mock.calls.at(-1)[0].specials.map((m) => m.used)).toEqual([true]);
  });

  test('square-off beats: arch, sidestep, stare, never a circle', () => {
    const { h, frames, anchors } = play({
      answers: (f) => (f.round === 2 ? 'wrong' : 'right'),
    });
    expect(h.moves).toHaveLength(3);
    const square = frames.filter((f) => f.phase === 'squareOff');
    expect(square.length).toBeGreaterThan(20);
    for (const f of square) expect([f.me.pose, f.it.pose]).toEqual(['arch', 'arch']);
    expect(h.audio.hiss).toHaveBeenCalledTimes(2); // "Fight!" and the arch
    const beat1 = frames.filter((f) => f.phase === 'beat' && f.round === 1);
    const beat2 = frames.filter((f) => f.phase === 'beat' && f.round === 2);
    expect(max(beat1, (f) => lateral(f.me, anchors.me, anchors))).toBeGreaterThan(0.25);
    expect(max(beat1, (f) => lateral(f.it, anchors.it, anchors))).toBeGreaterThan(0.25);
    expect(max(beat2, (f) => along(f.me, anchors.me, anchors.it))).toBeGreaterThan(0.1);
    expect(max(beat2, (f) => along(f.it, anchors.it, anchors.me))).toBeGreaterThan(0.1);
    for (const f of [...beat1, ...beat2]) expect([f.me.pose, f.it.pose]).toEqual(['cross', 'cross']);
    // outside an action and its prelude nobody strays more than 0.35 m sideways
    for (const f of frames) {
      if (f.phase === 'tumble') continue;
      expect(lateral(f.me, anchors.me, anchors), f.phase).toBeLessThanOrEqual(0.35);
      expect(lateral(f.it, anchors.it, anchors), f.phase).toBeLessThanOrEqual(0.35);
    }
  });

  test('no time reaches the outcome or the action', () => {
    for (const answers of ['right', 'wrong', (f) => (f.round === 1 ? 'pin' : 'right')]) {
      const runs = [9, 117].map((answerAt) => {
        const r = play({ answers, answerAt, ownedMoves: () => ['pin'] });
        const segs = [];
        for (const f of r.frames) {
          if (f.phase !== 'tumble') continue;
          if (f.tumbleT === DT) segs.push([]);
          segs.at(-1).push(f);
        }
        return { segs, won: r.h.onWon.mock.calls.length, lost: r.h.onLost.mock.calls, sites: r.h.onWon.mock.calls };
      });
      expect(runs[0].segs.length).toBeGreaterThan(1);
      expect(runs[1]).toEqual(runs[0]);
    }
  });

  test('reduced motion: no lift, pitch or roll, ever', () => {
    for (const opts of [{ answers: 'right' }, { answers: 'wrong' }, { answers: 'rollingTumble', ownedMoves: () => ['rollingTumble'] }]) {
      const { h, frames } = play({ ...opts, reducedMotion: true });
      expect(frames.length).toBeGreaterThan(60);
      for (const f of frames) {
        for (const c of [f.me, f.it]) expect([c.y, c.pitch, c.roll]).toEqual([0, 0, 0]);
        expect(f.it.pose).not.toBe('roll');
      }
      expect(h.fx.slash).not.toHaveBeenCalled();
      // one puff a round
      expect(h.fx.burst.mock.calls.map((c) => c[2])).toEqual(h.moves.map(() => 8));
      const losers = frames.filter((f) => f.phase === 'tumble' && f.tumbleT > 0.25).map((f) => [f.me.pose, f.it.pose]);
      expect(losers.flat()).toContain('flinch');
    }
  });

  test('actions mode stages the intruder through one reused object, no allocation a frame (final review 8)', () => {
    const { h, frames } = play({ answers: 'right' });
    expect(frames.length).toBeGreaterThan(100);
    const raws = h.calls.filter((c) => c.kind === 'stage' && c.raw).map((c) => c.raw);
    expect(raws.length).toBeGreaterThan(100);
    expect(new Set(raws).size).toBe(1);
    // and the values still move frame to frame
    expect(new Set(h.calls.filter((c) => c.kind === 'stage' && c.st).map((c) => `${c.st.x},${c.st.z},${c.st.y},${c.st.pose}`)).size).toBeGreaterThan(10);
  });

  test('cues fire once per action: one slash for a leap, dust for a pin, a thump for each', () => {
    const leap = play({ answers: 'right', walkStamp: stampWith((m) => m[0] === 'charge' && m[1] === 'charge') });
    expect(leap.h.fx.slash).toHaveBeenCalledTimes(2);
    expect(leap.h.audio.landThump).toHaveBeenCalledTimes(2);
    const [p, yaw] = leap.h.fx.slash.mock.calls[0];
    expect(p.y).toBeGreaterThan(0.2);
    expect(dist(p, leap.anchors.it)).toBeLessThan(0.6);
    expect(turn(yaw, yawTo(leap.anchors.me, leap.anchors.it))).toBeLessThan(1e-9);
    const pin = play({ answers: 'right', walkStamp: stampWith((m) => m[0] === 'pounce' && m[1] === 'pounce') });
    expect(pin.h.fx.slash).not.toHaveBeenCalled();
    expect(pin.h.fx.burst.mock.calls.map((c) => c[2])).toEqual([14, 14]);
    const roll = play({ answers: 'rollingTumble', ownedMoves: () => ['rollingTumble'] });
    expect(roll.h.fx.burst.mock.calls.map((c) => c[2])).toEqual([14, 14]);
    expect(roll.h.audio.landThump).toHaveBeenCalledTimes(1);
  });

  // updateAvatar (src/game/avatar.js) on a real cat, as main.js runs it after
  // the clan fight each frame.
  function withRealCat(opts = {}) {
    const cat = buildCat('tabby');
    const waterState = createWaterState();
    const player = {
      inWater: false, halt: vi.fn(), perchY: 0, hopY: 0, speed: 0, speedFactor: 1, inputActive: false,
      stalking: false, swimming: false, wading: false, shaking: false, waterState,
      forward: () => new THREE.Vector3(0, 0, -1),
    };
    const { updateAvatar } = createAvatarUpdater({
      player, progression: createProgression(fakeStorage()), settings: { get: () => false },
      log: { awardOnce: () => 0, award: () => 0 }, hud: { toast() {} },
      audio: { landThump() {}, bell() {}, fanfare() {}, purr() {}, step() {}, waterSplash() {} },
      petNameFor: () => 'x', completeTag() {}, noteBat() {},
    });
    const sExtra = {
      net: null, rest: null, freezeTime: 0, pounceTime: 0, pounceCooldown: 0, landTime: 0, idleTime: 0,
      stepPhase: 0, stretchTime: 0, sniffTime: 0, boxTime: 0, pose: 'follow',
      balkedPuddles: new Set(), toy: { active: false }, toyGhost: { visible: false },
      groomTimers: new Map(), remotes: { list: [] }, fx: { burst() {} },
      areaData: { puddles: [], boxes: [] },
      critters: { setFleeModifier() {}, markStalked() {}, catchAt: () => null, pounceCatch: () => null },
    };
    const h = harness({ actions: true, cat, player, sExtra, measureCat: catDims, ...opts });
    let t = 0;
    const avatar = () => { t += DT; updateAvatar(h.s, DT, t); };
    return { h, cat, avatar };
  }

  test('her cat really rolls', () => {
    const { h, cat, avatar } = withRealCat({ answers: 'rollingTumble', ownedMoves: () => ['rollingTumble'] });
    h.challenge(); h.fight();
    let rolled = 0, reared = 0;
    for (let i = 0; i < 2000 && h.s.fight; i++) {
      h.fightFrame();
      avatar();
      if (h.s.fightPose === 'roll' && Math.abs(h.s.fightRoll) > 0.5) {
        rolled++;
        expect(cat.rotation.z).toBeCloseTo(h.s.fightRoll, 12);
        expect(cat.rotation.order).toBe('YXZ');
        expect(cat.position.y).toBeCloseTo(h.s.fightLift, 12);
      }
      if (h.s.fight && Math.abs(h.s.fightPitch) > 0.1) reared++;
    }
    expect(rolled).toBeGreaterThan(10);
    expect(h.s.fight).toBeNull();
    avatar();
    expect([cat.rotation.x, cat.rotation.z]).toEqual([0, 0]);
    expect(h.s.fightPitch).toBe(0);
    expect(h.s.fightRoll).toBe(0);
    // and her rear-up pitches the group
    const r = withRealCat({ answers: 'right', walkStamp: stampWith((m) => m[0] === 'swipe') });
    r.h.challenge(); r.h.fight();
    let up = 0;
    for (let i = 0; i < 2000 && r.h.s.fight; i++) {
      r.h.fightFrame();
      r.avatar();
      if (r.h.s.fight && r.h.s.fightPitch > 0.8) { up++; expect(r.cat.rotation.x).toBe(r.h.s.fightPitch); }
    }
    expect(up).toBeGreaterThan(5);
    void reared;
  });

  test('on the plateau her cat rolls 3 m up: the lift stays relative, the fight\'s tilt wins (Gorge part 1)', () => {
    const G = buildHeightFixture(null).ground;
    const { h, cat, avatar } = withRealCat({
      answers: 'rollingTumble', ownedMoves: () => ['rollingTumble'], terrain: G, startAt: 8,
      sExtra: { ground: G },
    });
    Object.assign(h.s, {
      net: null, rest: null, freezeTime: 0, pounceTime: 0, pounceCooldown: 0, landTime: 0, idleTime: 0,
      stepPhase: 0, stretchTime: 0, sniffTime: 0, boxTime: 0, pose: 'follow',
      balkedPuddles: new Set(), toy: { active: false }, toyGhost: { visible: false },
      groomTimers: new Map(), remotes: { list: [] }, fx: { burst() {} },
      areaData: { puddles: [], boxes: [] },
      critters: { setFleeModifier() {}, markStalked() {}, catchAt: () => null, pounceCatch: () => null },
    });
    h.cur.pos = { x: 8, z: 4 };
    cat.position.set(8, 3, 2);
    h.challenge(); h.fight();
    let rolled = 0;
    for (let i = 0; i < 2000 && h.s.fight; i++) {
      h.fightFrame();
      avatar();
      if (!h.s.fight) break;
      expect(Math.abs(G.y(cat.position.x, cat.position.z) - 3)).toBeLessThanOrEqual(0.3);
      expect(h.s.fightLift).toBeLessThan(1.5); // relative
      expect(cat.position.y).toBeCloseTo(G.y(cat.position.x, cat.position.z) + h.s.fightLift, 12);
      expect(cat.rotation.order).toBe('YXZ');
      expect(cat.rotation.x).toBe(h.s.fightPitch);
      expect(cat.rotation.z).toBeCloseTo(h.s.fightRoll, 12);
      if (h.s.fightPose === 'roll' && Math.abs(h.s.fightRoll) > 0.5) rolled++;
    }
    expect(rolled).toBeGreaterThan(10);
    expect(h.s.fight).toBeNull();
    avatar();
    // level ground on the plateau: the slope's lean is level, so nothing tilts
    expect([cat.rotation.x, cat.rotation.z]).toEqual([0, 0]);
    expect(cat.position.y).toBeCloseTo(3, 12);
  });

  test('a refused spot never hovers', () => {
    // clan ground is her own line only: every side step (the pin's shake, a sidestep beat) is refused
    const onLine = (x, z) => Math.abs(z) < 1e-9;
    for (const answers of ['right', 'wrong']) {
      const { frames, anchors } = play({ answers, ground: onLine, walkStamp: stampWith((m) => m[0] === 'pounce') });
      let lifted = 0;
      for (const f of frames) {
        expect(onLine(f.me.x, f.me.z)).toBe(true);
        expect(onLine(f.it.x, f.it.z)).toBe(true);
        // (an answer's pounce hops on the cat's own anchor)
        if (f.phase === 'tumble' && f.tumbleT <= 0.35 + 1e-9) continue;
        if (dist(f.me, anchors.me) < 1e-12) expect([f.me.y, f.me.pitch, f.me.roll]).toEqual([0, 0, 0]);
        if (dist(f.it, anchors.it) < 1e-12) expect([f.it.y, f.it.pitch, f.it.roll]).toEqual([0, 0, 0]);
        if (f.me.y > 0.2 || f.it.y > 0.2) lifted++;
      }
      expect(lifted).toBeGreaterThan(5); // the pin's flight is on the line, so it still flies
    }
  });

  test('the pin and the roll keep both yaws steady', () => {
    for (const opts of [
      { answers: 'right', walkStamp: stampWith((m) => m[0] === 'pounce') },
      { answers: 'wrong', walkStamp: stampWith((m) => m[0] === 'pounce') },
      { answers: 'rollingTumble', ownedMoves: () => ['rollingTumble'] },
    ]) {
      const { frames, anchors } = play(opts);
      const facing = yawTo(anchors.me, anchors.it);
      for (let i = 1; i < frames.length; i++) {
        expect(turn(frames[i].me.yaw, frames[i - 1].me.yaw)).toBeLessThan(0.5);
        expect(turn(frames[i].it.yaw, frames[i - 1].it.yaw)).toBeLessThan(0.5);
        // R19: along the anchor line
        expect(turn(frames[i].me.yaw, facing)).toBeLessThan(1e-9);
        expect(turn(frames[i].it.yaw, facing + Math.PI)).toBeLessThan(0.02);
      }
    }
  });

  test('a dodge never jumps', () => {
    for (const walkStamp of ['walk-1', 'walk-2', stampWith((m) => m[0] === 'pounce')]) {
      const { frames } = play({ answers: 'dodge', dt: 1 / 60, answerAt: 30, walkStamp });
      expect(frames.length).toBeGreaterThan(300);
      for (let i = 1; i < frames.length; i++) {
        expect(dist(frames[i].me, frames[i - 1].me), `${frames[i].phase} ${frames[i].tumbleT}`).toBeLessThanOrEqual(0.25);
      }
    }
  });

  test('ending mid-action leaves no tilt, no stage, no callback', () => {
    const midAction = (h) => h.s.fight?.phase === 'tumble' && (Math.abs(h.s.fightPitch) > 0.2 || h.s.fightLift > 0.2);
    for (const end of ['abort', 'gone', 'together']) {
      const { h, cat, avatar } = withRealCat({ answers: 'right', walkStamp: stampWith((m) => m[0] === 'pounce') });
      h.challenge(); h.fight();
      for (let i = 0; i < 2000 && !midAction(h); i++) { h.fightFrame(); avatar(); }
      expect(midAction(h)).toBe(true);
      expect(cat.position.y).toBeGreaterThan(0.2);
      if (end === 'abort') h.cf.abort();
      else if (end === 'gone') { h.cur.state = 'gone'; h.frame(); }
      else expect(h.cf.chasedOffTogether(7, 'Robin')).toBe(true);
      const staged = h.intruders.stage.mock.calls.length;
      avatar();
      for (let i = 0; i < 30; i++) { h.frame(); avatar(); }
      expect(h.s.fight).toBeNull();
      expect([cat.rotation.x, cat.rotation.z]).toEqual([0, 0]);
      expect(cat.position.y).toBe(0);
      expect([h.s.fightPitch, h.s.fightRoll, h.s.fightLift]).toEqual([0, 0, 0]);
      expect(h.intruders.stage.mock.calls.length).toBe(staged);
      expect(h.onLost).not.toHaveBeenCalled();
      if (end === 'together') {
        // R11: the round she was winning when her brother won it (a pin)
        expect(h.onWon).toHaveBeenCalledTimes(1);
        expect(h.onWon).toHaveBeenCalledWith({ visit: 7, castId: CAST_ID, site: 'back', together: true });
      } else expect(h.onWon).not.toHaveBeenCalled();
    }
    // chased off together before she won a round: R11's roll site
    const early = harness({ actions: true, answers: 'none' });
    early.challenge(); early.fight(); early.fightFrame();
    early.cf.chasedOffTogether(7, 'Robin');
    expect(early.onWon).toHaveBeenCalledWith({ visit: 7, castId: CAST_ID, site: siteFor('roll', CAST_ID), together: true });
    // ...and Hagrid's: no site
    const hagrid = harness({ answers: 'none' });
    hagrid.challenge(); hagrid.fight(); hagrid.fightFrame();
    hagrid.cf.chasedOffTogether(7, 'Robin');
    expect(hagrid.onWon).toHaveBeenCalledWith({ visit: 7, castId: CAST_ID, site: null, together: true });
  });
});

describe('clanfight.js is pinned', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  test('clanfight.js is never given progression and imports nothing that stores progress', () => {
    expect(code).not.toMatch(/progression/i);
    const specs = [...SRC.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) {
      expect(['../fight.js', '../fightactions.js', '../fightmoves.js', '../intruders.js', '../ui/fightui.js', '../clanhomes.js', '../rng.js']).toContain(s);
    }
    expect(SRC).toMatch(/progression/); // ...and the header says why
  });

  test('the lose branch, as written, calls nothing but release, lock, toast and clearing the fight', () => {
    const a = SRC.indexOf('// LOST:');
    const b = SRC.indexOf('// END LOST');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(SRC.indexOf('// LOST:', a + 1)).toBe(-1);
    const slice = SRC.slice(a, b).replace(/\/\/.*$/gm, '');
    for (const w of ['log.', 'award', 'points', 'feat', 'colony', 'mark', 'grudge', 'flee']) expect(slice).not.toContain(w);
    expect(slice).toContain('intruders.release(');
    expect(slice).toContain('hud.toast(');
    // The one thing it may add is telling the co-walker the fight is over.
    expect(slice).toContain('sendDone(false)');
    // ...and reporting the loss (fightrecord.js writes her cat's scar from it).
    expect(slice).toContain('onLost(');
    expect(slice).not.toContain('onWon(');
  });

  test('the win branch flees, pays once, reports the win, toasts and clears the fight', () => {
    const a = SRC.indexOf('// WON:');
    const b = SRC.indexOf('// END WON');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(SRC.indexOf('// WON:', a + 1)).toBe(-1);
    const slice = SRC.slice(a, b).replace(/\/\/.*$/gm, '');
    for (const w of ['intruders.flee(', 'log.awardOnce(', 'onWon(', 'hud.toast(', 'sendDone(true)', 'endFight()']) expect(slice).toContain(w);
    expect(slice).not.toMatch(/progression/i);
    expect(slice).not.toContain('onLost(');
    // the calls in it are those (and clanName in a toast's text), nothing else
    const called = new Set([...slice.matchAll(/([A-Za-z_$][\w$.]*)\(/g)].map((m) => m[1]));
    expect([...called].sort()).toEqual(['clanName', 'endFight', 'hud.toast', 'intruders.flee', 'log.awardOnce', 'onWon', 'sendDone']);
  });
});

// Gorge part 1, Task 8 (R10, R11): a fight stands on one level. The fixture's
// plateau is a disc at (8, 0), r 5, 3 m up; its ramp runs up along z = 0 from
// x = -6 (y 0) to x = 3 (y 3), 2 m wide, with a drop at each side.
describe('fights stand on one level', () => {
  const G = buildHeightFixture(null).ground;
  const near3 = (p) => Math.abs(G.y(p.x, p.z) - 3) <= 0.3;

  test('fightReach drops every spot off my anchor\'s level; flat ground changes nothing', () => {
    const spot = { x: 8, z: 4 }, foeAt = { x: 8, z: 5.6 };
    const r = fightReach(spot, foeAt, () => true, { terrain: G });
    expect(r.me[0]).toEqual(spot);
    expect(r.it[0]).toEqual(foeAt);
    for (const p of [...r.me.slice(1), ...r.it.slice(1)]) expect(near3(p)).toBe(true);
    // without it the floor spots are there
    const all = fightReach(spot, foeAt, () => true);
    expect(all.it.slice(1).some((p) => !near3(p))).toBe(true);
    for (const [s, f] of [[spot, foeAt], [{ x: 2.5, z: 0 }, { x: 0, z: 0 }], [{ x: 1, z: 1 }, { x: 1, z: 1 }]]) {
      const ok = (x) => x < 9;
      const base = fightReach(s, f, ok);
      expect(fightReach(s, f, ok, { terrain: FLAT_GROUND })).toEqual(base);
      expect(fightReach(s, f, ok, { terrain: null })).toEqual(base);
    }
  });

  test('with actions too: every reach spot stays on my level, its y relative; flat changes nothing', () => {
    const spot = { x: 8, z: 4 }, foeAt = { x: 8, z: 5.6 };
    const reachY = reachYFor(ME_DIMS, IT_DIMS, 1.6);
    const r = fightReach(spot, foeAt, () => true, { actions: true, reachY, terrain: G });
    expect(r.me[0]).toMatchObject(spot);
    expect(r.it[0]).toMatchObject(foeAt);
    for (const p of [...r.me.slice(1), ...r.it.slice(1)]) expect(near3(p)).toBe(true);
    // the heights are the flat ones (relative to the ground under the pair)
    const all = fightReach(spot, foeAt, () => true, { actions: true, reachY });
    expect(all.it.slice(1).some((p) => !near3(p))).toBe(true);
    for (const p of r.me) expect(all.me.find((q) => q.x === p.x && q.z === p.z)?.y).toBe(p.y);
    for (const [sp, f] of [[spot, foeAt], [{ x: 2.5, z: 0 }, { x: 0, z: 0 }]]) {
      const ok = (x) => x < 9;
      const base = fightReach(sp, f, ok, { actions: true, reachY });
      expect(fightReach(sp, f, ok, { actions: true, reachY, terrain: FLAT_GROUND })).toEqual(base);
      expect(fightReach(sp, f, ok, { actions: true, reachY, terrain: null })).toEqual(base);
    }
  });

  test('a fight in actions on the plateau stays on it: lifts relative, fx at the plateau', () => {
    // a leap (its slash) then a pin (its dust), as the cues test picks them
    let walkStamp = null;
    for (let i = 0; !walkStamp; i++) {
      const rng = mulberry32(seedFromCode(`walk-${i}|7|0`));
      const m = [0, 1, 2].map(() => MOVES[Math.floor(rng() * 3)]);
      if (m[0] === 'charge' && m[1] === 'pounce') walkStamp = `walk-${i}`;
    }
    const h = harness({ terrain: G, startAt: 8, actions: true, answers: 'right', walkStamp });
    h.cur.pos = { x: 8, z: 4.7 };
    h.s.cat.position.x = 8;
    h.s.cat.position.z = 2;
    h.challenge();
    expect(h.cf.uiShowing).toBe('challenge');
    h.fight();
    const staged = [];
    const mine = [];
    h.runToEnd(() => {
      const st = h.calls.filter((c) => c.kind === 'stage').at(-1)?.st;
      if (st) staged.push(st);
      if (h.s.fight) mine.push({ x: h.s.cat.position.x, z: h.s.cat.position.z, lift: h.s.fightLift });
    });
    expect(staged.length).toBeGreaterThan(30);
    for (const st of staged) {
      expect(near3(st)).toBe(true);
      // a lift, relative: intruders.place() adds the ground under it
      expect(st.y).toBeGreaterThanOrEqual(0);
      expect(st.y).toBeLessThan(1.5);
    }
    expect(staged.some((st) => st.y > 0)).toBe(true);
    for (const p of mine) {
      expect(near3(p)).toBe(true);
      expect(p.lift).toBeLessThan(1.5); // relative: avatar.js adds the ground
    }
    expect(mine.some((p) => p.lift > 0)).toBe(true);
    const bursts = h.fx.burst.mock.calls;
    expect(bursts.length).toBeGreaterThan(0);
    for (const [p] of bursts) expect(p.y).toBeCloseTo(3.2, 12);
    const slashes = h.fx.slash.mock.calls;
    expect(slashes.length).toBeGreaterThan(0);
    for (const [p] of slashes) expect(p.y).toBeGreaterThan(3);
  });

  test('in actions, a staged spot off my level is never stood on', () => {
    // the intruder right at the plateau's north rim, my cat south of it: an
    // action's push-back would put it over the rim, so it stays on its anchor
    const run = (terrain) => {
      const h = harness({ terrain, startAt: 8, actions: true, answers: 'right' });
      h.cur.pos = { x: 8, z: 4.95 };
      h.s.cat.position.x = 8;
      h.s.cat.position.z = 3.2;
      h.challenge();
      h.fight();
      const out = [];
      h.runToEnd(() => {
        const st = h.calls.filter((c) => c.kind === 'stage').at(-1)?.st;
        if (st) out.push([st, { x: h.s.cat.position.x, z: h.s.cat.position.z }]);
      });
      return out;
    };
    // without the ground the intruder is pushed out over the rim...
    expect(run(undefined).some(([st]) => G.y(st.x, st.z) !== 3)).toBe(true);
    // ...with it, neither cat ever leaves the plateau
    const on = run(G);
    expect(on.length).toBeGreaterThan(30);
    for (const [st, me] of on) {
      expect(Math.abs(G.y(st.x, st.z) - 3)).toBeLessThanOrEqual(0.3);
      expect(Math.abs(G.y(me.x, me.z) - 3)).toBeLessThanOrEqual(0.3);
    }
  });

  test('a fight on the plateau stands on it', () => {
    // the intruder near the plateau's north rim, my cat south of it: every
    // round I win, it steps back toward the rim (and over it, were it allowed)
    const h = harness({ terrain: G, startAt: 8 });
    h.cur.pos = { x: 8, z: 4.7 };
    h.s.cat.position.x = 8;
    h.s.cat.position.z = 2;
    h.challenge();
    expect(h.cf.uiShowing).toBe('challenge');
    h.fight();
    const staged = [];
    const mine = [];
    h.runToEnd(() => {
      const st = h.calls.filter((c) => c.kind === 'stage').at(-1)?.st;
      if (st) staged.push(st);
      if (h.s.fight) mine.push({ x: h.s.cat.position.x, z: h.s.cat.position.z });
    });
    expect(staged.length).toBeGreaterThan(30);
    for (const st of staged) {
      expect(near3(st)).toBe(true);
      // a lift, relative: intruders.place() adds the ground under it
      expect(st.y).toBeGreaterThanOrEqual(0);
      expect(st.y).toBeLessThan(0.3);
    }
    expect(staged.some((st) => st.y > 0)).toBe(true);
    for (const p of mine) expect(near3(p)).toBe(true);
    const bursts = h.fx.burst.mock.calls;
    expect(bursts.length).toBeGreaterThan(0);
    for (const [p] of bursts) expect(p.y).toBeCloseTo(3.2, 12);
  });

  test('R10: no challenge and no fight across a rim', () => {
    // my cat on the floor at (8, 7), the intruder up on the plateau 3 m away
    const h = harness({ terrain: G, startAt: 8 });
    h.cur.pos = { x: 8, z: 4 };
    h.s.cat.position.z = 7;
    for (let i = 0; i < 10; i++) h.frame();
    expect(h.ui.showChallenge).not.toHaveBeenCalled();
    h.fight();
    expect(h.intruders.hold).not.toHaveBeenCalled();
    expect(h.s.fight).toBeNull();
    // a pill already up goes away when the levels part
    const g = harness({ terrain: G, startAt: 8 });
    g.cur.pos = { x: 8, z: 3 };
    g.s.cat.position.z = 4.9;
    g.frame();
    expect(g.cf.uiShowing).toBe('challenge');
    g.s.cat.position.z = 5.5;
    g.frame();
    expect(g.cf.uiShowing).toBeNull();
  });

  test('the walk-over stops at a rim and the rounds begin where she stands', () => {
    // the intruder on the ramp 0.4 m up, my cat on the floor beside it: the
    // same level for a challenge, but the ramp's side is a 0.4 m step
    const h = harness({ terrain: G, startAt: -4.8 });
    h.cur.pos = { x: -4.8, z: -0.9 };
    h.s.cat.position.z = 2.5;
    expect(G.y(-4.8, -0.9)).toBeCloseTo(0.4, 12);
    h.challenge();
    expect(h.cf.uiShowing).toBe('challenge');
    h.fight();
    const path = [];
    h.runToEnd(() => path.push({ x: h.s.cat.position.x, z: h.s.cat.position.z }));
    expect(path.length).toBeGreaterThan(10);
    for (const p of path) expect(G.y(p.x, p.z)).toBe(0);
    // she got as far as the ramp's side
    expect(Math.min(...path.map((p) => p.z))).toBeLessThan(1.2);
  });

  test('on flat ground (FLAT_GROUND or none) a whole fight is exactly today\'s, in actions or not', () => {
    for (const actions of [undefined, true]) {
      const runOne = (terrain) => {
        const h = harness({ terrain, actions });
        h.challenge();
        h.fight();
        const trace = [];
        h.runToEnd(() => trace.push([h.s.cat.position.x, h.s.cat.position.z, h.s.cat.rotation.y, h.s.fightPose,
          h.s.fightLift, h.s.fightPitch, h.s.fightRoll]));
        return { trace, calls: h.calls, bursts: h.fx.burst.mock.calls, slashes: h.fx.slash.mock.calls, sub: h.cf.cameraSubject };
      };
      const base = runOne(undefined);
      expect(runOne(FLAT_GROUND)).toEqual(base);
      expect(runOne(null)).toEqual(base);
    }
  });

  test('(the old flat check, kept) a whole fight with no actions is exactly today\'s', () => {
    const runOne = (terrain) => {
      const h = harness({ terrain });
      h.challenge();
      h.fight();
      const trace = [];
      h.runToEnd(() => trace.push([h.s.cat.position.x, h.s.cat.position.z, h.s.cat.rotation.y, h.s.fightPose, h.s.fightLift]));
      return { trace, calls: h.calls, bursts: h.fx.burst.mock.calls, sub: h.cf.cameraSubject };
    };
    const base = runOne(undefined);
    expect(runOne(FLAT_GROUND)).toEqual(base);
    expect(runOne(null)).toEqual(base);
  });
});
