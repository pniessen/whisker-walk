import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createClanFight, NO_CLAN_FIGHT, FIGHT_GAP, WALKOVER_MAX, SIDE_STEP, fightReach,
} from '../src/game/clanfight.js';
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
function harness({
  answers = 'right', clanHome = true, picks = ['woods'], clan = 'moor', reducedMotion = false,
  special = null, ground = () => true, walkStamp = 'walk-1', log = null, startAt = 2.5, solo = false,
  terrain = undefined,
} = {}) {
  const calls = [];
  const sent = [];
  const clock = { T: 5000 };
  const cur = { visit: 7, clan, member: { name: 'Mossjaw' }, pos: { x: 0, z: 0 }, state: 'walking' };
  const intruders = {
    current: () => (cur.state === 'gone' ? null : { ...cur, pos: { ...cur.pos } }),
    hold: vi.fn((v, id, face, o) => { calls.push({ kind: 'hold', v, id, o }); cur.state = 'held'; }),
    release: vi.fn((v, id) => { calls.push({ kind: 'release', v, id }); cur.state = 'walking'; }),
    flee: vi.fn((v) => { calls.push({ kind: 'flee', v }); cur.state = 'fleeing'; }),
    stage: vi.fn((v, st) => { calls.push({ kind: 'stage', v, st }); }),
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
  const fx = { burst: vi.fn((p, c, n) => calls.push({ kind: 'fx', p: { x: p.x, z: p.z }, n })) };
  const hud = { toast: vi.fn((t) => calls.push({ kind: 'toast', t })) };
  const theLog = log ?? { awardOnce: vi.fn(() => { calls.push({ kind: 'award' }); return AWARDS.intruder; }) };
  const player = { inWater: false, halt: vi.fn() };
  const s = {
    cat: { position: { x: startAt, y: 0, z: 0 }, rotation: { y: 0 } },
    fight: null, fightPose: null, perched: null, chasing: false, cameraMode: false,
  };
  const cf = createClanFight({
    intruders, ui, audio, fx, hud, log: theLog, areaId: 'woods', walkStamp, playerId: 'me',
    playerSpecial: special, reducedMotion, now: () => clock.T, isGround: ground, player,
    runSpeed: RUN, clanHome, picks, ...(solo ? {} : { sendEvent: (ev) => { sent.push(ev); } }),
    ...(terrain === undefined ? {} : { terrain }),
  });
  const frame = (dt = DT) => { clock.T += dt; cf.update(dt, s); };
  const moves = [];
  let clueFrames = 0;
  const h = {
    calls, sent, clock, cur, intruders, ui, audio, fx, hud, log: theLog, player, s, cf, frame, moves,
    challenge() { frame(); },
    fight() { cf.startFight(); },
    // One frame of a fight, answering half a second into each clue.
    fightFrame() {
      frame();
      const f = s.fight;
      if (!f) return;
      if (f.phase !== 'clue') { clueFrames = 0; return; }
      if (clueFrames === 0) moves.push(f.move);
      clueFrames += 1;
      if (clueFrames === 15) {
        if (answers === 'right') cf.answer(COUNTER[f.move]);
        else if (BUTTONS.includes(answers)) cf.answer(answers);
        else if (answers === 'wrong') cf.answer(BUTTONS.find((b) => b !== COUNTER[f.move]));
      }
    },
    runToEnd(each = () => {}) {
      for (let i = 0; i < 60 * 30 && s.fight; i++) { h.fightFrame(); each(); }
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

describe('clanfight.js is pinned', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  test('clanfight.js is never given progression and imports nothing that stores progress', () => {
    expect(code).not.toMatch(/progression/i);
    const specs = [...SRC.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) {
      expect(['../fight.js', '../intruders.js', '../ui/fightui.js', '../clanhomes.js', '../rng.js']).toContain(s);
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
    const r = fightReach(spot, foeAt, () => true, G);
    expect(r.me[0]).toEqual(spot);
    expect(r.it[0]).toEqual(foeAt);
    for (const p of [...r.me.slice(1), ...r.it.slice(1)]) expect(near3(p)).toBe(true);
    // without it the floor spots are there
    const all = fightReach(spot, foeAt, () => true);
    expect(all.it.slice(1).some((p) => !near3(p))).toBe(true);
    for (const [s, f] of [[spot, foeAt], [{ x: 2.5, z: 0 }, { x: 0, z: 0 }], [{ x: 1, z: 1 }, { x: 1, z: 1 }]]) {
      const ok = (x) => x < 9;
      const base = fightReach(s, f, ok);
      expect(fightReach(s, f, ok, FLAT_GROUND)).toEqual(base);
      expect(fightReach(s, f, ok, null)).toEqual(base);
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

  test('on flat ground (FLAT_GROUND or none) a whole fight is exactly today\'s', () => {
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
