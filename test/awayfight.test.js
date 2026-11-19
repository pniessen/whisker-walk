import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createAwayFoes, createAwayFight, joinFights, AWAY_NOTICE, AWAY_STAND } from '../src/game/awayfight.js';
import { createAwayLedger, awayRoll, AWAY_COOLDOWN, AWAY_RETRY, AWAY_CHASE_DIST } from '../src/awayfights.js';
import { BORDER_CHALLENGE_WAIT, borderWords } from '../src/game/borderfight.js';
import { NO_CLAN_FIGHT } from '../src/game/clanfight.js';
import { createClanCats } from '../src/clancats.js';
import { clanCast } from '../src/clancast.js';
import { NOTICE_DIST, SCAMPER_TIME, chaseAllowed } from '../src/rivalcats.js';
import { COUNTER, BUTTONS } from '../src/fight.js';
import { RANK_KEYS } from '../src/wordset.js';

// Away fights with the roaming cats, end to end over the real clan cats and
// the real fight (the border patrol fight's harness, test/borderfight.test.js):
// the frame order is main.js's (the clan cats, then the clan fight).
const AREA = 'moor';
const DT = 1 / 30;
// The Moor's roaming cats of the LOW cast: warriors 4-6, apprentices 7-8,
// each at a home 40 m from the next, so only the one she walks up to is near.
const CAST = clanCast(AREA).filter((m) => [4, 5, 6, 7, 8].includes(m.slot));
const HOMES = CAST.map((_, i) => ({ x: i * 40, z: 0 }));
const homeOf = (id) => HOMES[CAST.findIndex((m) => m.id === id)];

// A walk seed where moor-4 and moor-6 want to fight and moor-5 lets her pass.
let SEED = 1;
while (!(awayRoll(SEED, 'moor-4') < 0.5 && awayRoll(SEED, 'moor-6') < 0.5 && awayRoll(SEED, 'moor-5') >= 0.5)) SEED++;

function world({ answers = 'right', restore = null, seed = SEED, canStart = null } = {}) {
  const clock = { t: 5000 };
  const toasts = [];
  const awards = [];
  const sent = [];
  const decided = [];
  const chases = [];
  const scene = new THREE.Scene();
  const player = { inWater: false, perchY: 0, halt: vi.fn() };
  const s = {
    cat: { position: new THREE.Vector3(0, 0, 60), rotation: { y: 0 } },
    fight: null, perched: null, chasing: false, cameraMode: false,
  };
  const clanCats = createClanCats(scene, { id: AREA, bounds: { minX: -100, maxX: 300, minZ: -100, maxZ: 100 } }, CAST, {
    roamHomes: HOMES, roomSeed: 3, areaId: AREA, showNames: false,
  });
  const ledger = createAwayLedger({ seed, restore });
  let away = NO_CLAN_FIGHT;
  const foes = createAwayFoes({
    clanCats, ledger,
    canStart: canStart ?? ((ss) => chaseAllowed(player, ss) && !player.inWater && !ss.perched),
    canChase: (ss) => chaseAllowed(player, ss),
    engaged: () => away.uiShowing !== null,
    onDecide: (c, d, wins) => decided.push([c.id, d, wins]),
    onChase: (who) => { chases.push(who); s.chasing = true; },
    onSettled: () => { s.chasing = false; },
    measure: () => ({ top: 0.8, backY: 0.45, pinnedBackY: 0.28, hindZ: 0.28, pivotY: 0.18 }),
  });
  const ui = { showChallenge: vi.fn(), showFight: vi.fn(), hide: vi.fn(), key: () => false };
  const onWon = vi.fn();
  const onLost = vi.fn();
  away = createAwayFight({
    foes, areaId: AREA, ui,
    audio: { hiss() {}, pounceWhoosh() {}, landThump() {} }, fx: { burst() {}, slash() {} },
    hud: { toast: (t) => toasts.push(t) }, log: { awardOnce: (...a) => { awards.push(a); return 12; } },
    walkStamp: 'walk-a', playerId: 'me', playerSpecial: null, now: () => clock.t, player, runSpeed: 3,
    picks: ['gorge'], sendEvent: (ev) => sent.push(ev), onWon, onLost, actions: true,
    measureCat: () => ({ top: 0.9, backY: 0.5, pinnedBackY: 0.3, hindZ: 0.3, pivotY: 0.2 }),
  });
  const fight = joinFights(NO_CLAN_FIGHT, away, foes);
  let clueFrames = 0;
  const frame = () => {
    clock.t += DT;
    clanCats.update(DT, clock.t, s.cat.position);
    fight.update(DT, s);
    const f = s.fight;
    if (f && f.phase === 'clue') {
      clueFrames += 1;
      if (clueFrames === 15) fight.answer(answers === 'right' ? COUNTER[f.move] : BUTTONS.find((b) => b !== COUNTER[f.move]));
    } else clueFrames = 0;
  };
  const run = (n) => { for (let i = 0; i < n; i++) frame(); };
  const secs = (n) => run(Math.ceil(n / DT));
  const cat = (id) => clanCats.list.find((c) => c.id === id);
  // Sets her down 3 m from a cat, wherever it has wandered to.
  const walkUpTo = (id) => {
    const p = cat(id).group.position;
    s.cat.position.set(p.x, 0, p.z + 3);
  };
  const dist = (id) => {
    const p = cat(id).group.position;
    return Math.hypot(p.x - s.cat.position.x, p.z - s.cat.position.z);
  };
  const untilOver = (max = 3000) => { for (let i = 0; i < max && fight.uiShowing === 'fight'; i++) frame(); };
  return { clock, toasts, awards, sent, decided, chases, s, player, clanCats, ledger, foes, fight, ui, onWon, onLost, frame, run, secs, cat, walkUpTo, dist, untilOver };
}

describe('a roaming cat that wants to fight', () => {
  test('far from every cat nothing is decided and nothing is offered', () => {
    const w = world();
    w.secs(3);
    expect(w.decided).toEqual([]);
    expect(w.fight.uiShowing).toBe(null);
    expect(w.ledger.snapshot()).toEqual({ wins: 0, fight: [], pass: [], beaten: [] });
  });

  test("within notice distance it decides once, steps toward her and makes the border patrol's offer", () => {
    expect(AWAY_NOTICE).toBe(NOTICE_DIST);
    const w = world();
    w.walkUpTo('moor-4');
    w.frame();
    expect(w.decided).toEqual([['moor-4', 'fight', 0]]);
    expect(w.fight.uiShowing).toBe('challenge');
    expect(w.ui.showChallenge).toHaveBeenCalledWith({ name: w.cat('moor-4').name, clan: 'moor', ask: 'blocks your path!', off: 'Run' });
    w.secs(1);
    expect(w.dist('moor-4')).toBeCloseTo(AWAY_STAND, 1); // it walked up and stands
    expect(w.decided.length).toBe(1);
    expect(w.fight.uiShowing).toBe('challenge');
  });

  test('Fight and win: the award is the border award (one key a walk), it wears her scar, it never challenges again', () => {
    const w = world();
    w.walkUpTo('moor-4');
    w.frame();
    w.fight.startFight();
    expect(w.fight.uiShowing).toBe('fight');
    expect(w.s.fight).not.toBe(null);
    w.untilOver();
    expect(w.fight.uiShowing).toBe(null);
    expect(w.s.fight).toBe(null);
    const name = w.cat('moor-4').name;
    const award = borderWords(AREA).award(name);
    expect(w.awards).toEqual([[award.type, award.key, award.text]]);
    expect(award).toMatchObject({ type: 'border', key: 'border-moor' });
    expect(w.onWon).toHaveBeenCalledTimes(1);
    expect(w.onWon.mock.calls[0][0]).toMatchObject({ visit: 'moor-4', castId: 'moor-4', together: false });
    expect(w.onWon.mock.calls[0][0].site).toBeTruthy(); // the scar's place (fightrecord.js saves it by cast id)
    expect(w.onLost).not.toHaveBeenCalled();
    expect(w.toasts).toEqual([`${name} lets you pass. 🐾`]);
    expect(w.chases).toEqual([]);
    expect(w.ledger.wins).toBe(1);
    expect(w.ledger.isBeaten('moor-4')).toBe(true);
    // Long after every wait, standing right beside it: nothing.
    w.secs(AWAY_RETRY + AWAY_COOLDOWN + 5);
    w.walkUpTo('moor-4');
    w.secs(3);
    expect(w.fight.uiShowing).toBe(null);
    expect(w.ui.showChallenge).toHaveBeenCalledTimes(1);
  });

  test('Run: she is chased off (the scamper), nothing is paid, and it costs nothing else', () => {
    const w = world();
    w.walkUpTo('moor-4');
    w.secs(1);
    const before = w.s.cat.position.clone();
    const foeAt = w.cat('moor-4').group.position.clone();
    w.fight.backOff();
    expect(w.fight.uiShowing).toBe(null);
    w.frame();
    expect(w.chases).toEqual([w.cat('moor-4').name]);
    expect(w.s.chasing).toBe(true);
    w.secs(SCAMPER_TIME + 0.2);
    expect(w.s.chasing).toBe(false);
    expect(w.s.cat.position.distanceTo(before)).toBeCloseTo(AWAY_CHASE_DIST, 3);
    // Straight away from the cat.
    expect(w.s.cat.position.distanceTo(foeAt)).toBeCloseTo(AWAY_CHASE_DIST + before.distanceTo(foeAt), 1);
    expect(w.s.cat.position.y).toBe(0);
    expect(w.awards).toEqual([]);
    expect(w.onWon).not.toHaveBeenCalled();
    expect(w.onLost).not.toHaveBeenCalled();
    expect(w.ledger.wins).toBe(0);
    expect(w.ledger.chance).toBe(0.5);
    expect(w.foes.busy).toBe(false);
  });

  test(`no answer in ${BORDER_CHALLENGE_WAIT} s is Run: the same chase`, () => {
    const w = world();
    w.walkUpTo('moor-4');
    w.secs(BORDER_CHALLENGE_WAIT - 0.5);
    expect(w.fight.uiShowing).toBe('challenge');
    expect(w.chases).toEqual([]);
    w.secs(1);
    expect(w.fight.uiShowing).toBe(null);
    expect(w.chases).toEqual([w.cat('moor-4').name]);
    w.secs(1);
    expect(w.s.chasing).toBe(false);
    expect(w.ledger.wins).toBe(0);
  });

  test('a lost fight: the loss is reported (her fading scar), then the same chase; nothing is paid', () => {
    const w = world({ answers: 'wrong' });
    w.walkUpTo('moor-4');
    w.frame();
    w.fight.startFight();
    w.untilOver();
    expect(w.onLost).toHaveBeenCalledTimes(1);
    expect(w.onWon).not.toHaveBeenCalled();
    expect(w.awards).toEqual([]);
    w.frame();
    expect(w.chases).toEqual([w.cat('moor-4').name]);
    w.secs(1);
    expect(w.s.chasing).toBe(false);
    expect(w.ledger.wins).toBe(0);
    expect(w.ledger.isBeaten('moor-4')).toBe(false);
    expect(w.ledger.chance).toBe(0.5);
  });

  test('not a gauntlet: after a challenge ends no other cat challenges for the cooldown', () => {
    const w = world();
    w.walkUpTo('moor-4');
    w.secs(1);
    w.fight.backOff();
    w.secs(1.5);
    expect(w.foes.busy).toBe(false);
    // Straight to another cat that wants to fight.
    w.walkUpTo('moor-6');
    w.secs(AWAY_COOLDOWN - 3);
    w.walkUpTo('moor-6');
    w.secs(0.5);
    expect(w.decided.map((d) => d.slice(0, 2))).toEqual([['moor-4', 'fight'], ['moor-6', 'fight']]);
    expect(w.ui.showChallenge).toHaveBeenCalledTimes(1);
    expect(w.fight.uiShowing).toBe(null);
    w.secs(3);
    w.walkUpTo('moor-6');
    w.secs(0.5);
    expect(w.ui.showChallenge).toHaveBeenCalledTimes(2);
    expect(w.ui.showChallenge.mock.calls[1][0].name).toBe(w.cat('moor-6').name);
  });

  test('the cat she ran from waits longer than the cooldown before it squares up again', () => {
    const w = world();
    w.walkUpTo('moor-4');
    w.secs(1);
    w.fight.backOff();
    w.secs(AWAY_COOLDOWN + 5);
    w.walkUpTo('moor-4');
    w.secs(1);
    expect(w.ui.showChallenge).toHaveBeenCalledTimes(1);
    w.secs(AWAY_RETRY - AWAY_COOLDOWN);
    w.walkUpTo('moor-4');
    w.secs(1);
    expect(w.ui.showChallenge).toHaveBeenCalledTimes(2);
  });

  test('walking far away from the offer ends it with no chase', () => {
    const w = world();
    w.walkUpTo('moor-4');
    w.secs(0.5);
    w.s.cat.position.set(0, 0, 80);
    w.secs(1);
    expect(w.fight.uiShowing).toBe(null);
    expect(w.chases).toEqual([]);
    expect(w.foes.busy).toBe(false);
    expect(w.ledger.cooling).toBe(true);
  });

  test('nothing goes on the wire', () => {
    const w = world();
    w.walkUpTo('moor-4');
    w.frame();
    w.fight.startFight();
    w.untilOver();
    expect(w.sent).toEqual([]);
  });

  test('the fight stages the cat (it leaves its spot and comes back level), and it walks home after', () => {
    const w = world();
    w.walkUpTo('moor-4');
    w.frame();
    w.fight.startFight();
    let lifted = false;
    let tilted = false;
    for (let i = 0; i < 3000 && w.fight.uiShowing === 'fight'; i++) {
      w.frame();
      const g = w.cat('moor-4').group;
      if (g.position.y > 0.01) lifted = true;
      if (Math.abs(g.rotation.x) > 0.05 || Math.abs(g.rotation.z) > 0.05) tilted = true;
    }
    expect(lifted || tilted).toBe(true);
    const g = w.cat('moor-4').group;
    expect(g.rotation.x).toBe(0);
    expect(g.rotation.z).toBe(0);
    expect(w.cat('moor-4').lead).toBe(null);
    w.s.cat.position.set(0, 0, 80);
    w.secs(20);
    const h = homeOf('moor-4');
    expect(g.position.y).toBe(0);
    expect(Math.hypot(g.position.x - h.x, g.position.z - h.z)).toBeLessThan(6.5); // home, or roaming round it again
  });
});

describe('a roaming cat that lets her pass', () => {
  test('it looks at her, turns away, is never offered, and says so once', () => {
    const w = world();
    w.walkUpTo('moor-5');
    w.frame();
    expect(w.decided).toEqual([['moor-5', 'pass', 0]]);
    const c = w.cat('moor-5');
    expect(typeof c.lead).toBe('function');
    w.secs(0.5);
    const toHer = Math.atan2(w.s.cat.position.x - c.group.position.x, w.s.cat.position.z - c.group.position.z) + Math.PI;
    expect(Math.cos(c.group.rotation.y - toHer)).toBeCloseTo(1, 3); // looking at her
    w.secs(1);
    expect(Math.cos(c.group.rotation.y - toHer)).toBeLessThan(0); // turned away
    w.secs(1);
    expect(c.lead).toBe(null); // let go: it walks home
    w.secs(AWAY_RETRY + AWAY_COOLDOWN);
    w.walkUpTo('moor-5');
    w.secs(3);
    expect(w.decided.length).toBe(1);
    expect(w.ui.showChallenge).not.toHaveBeenCalled();
    expect(w.fight.uiShowing).toBe(null);
  });

  test('after she has won a fight, a cat that lets her pass is wary', () => {
    const w = world({ restore: { wins: 1 } });
    w.walkUpTo('moor-5');
    w.frame();
    expect(w.decided).toEqual([['moor-5', 'pass', 1]]);
  });
});

describe('who and when', () => {
  const fakeCat = (id, rank, x = 0, z = 0) => ({
    id, name: id, rank, clan: AREA, buddy: null, lead: null, state: 'post',
    group: { position: { x, y: 0, z }, rotation: { x: 0, y: 0, z: 0 } },
  });
  const K = RANK_KEYS;

  test('the leader, the deputy, an elder and a kit are never asked, however close', () => {
    const list = [fakeCat('l', K.leader), fakeCat('d', K.deputy), fakeCat('e', K.elder), fakeCat('k', K.kit)];
    const clanCats = { list, setLead: vi.fn(() => true) };
    // A seed where every one of them would fight if it were asked.
    let seed = 1;
    while (!list.every((c) => awayRoll(seed, c.id) < 0.5)) seed++;
    const ledger = createAwayLedger({ seed });
    const foes = createAwayFoes({ clanCats, ledger });
    const s = { cat: { position: { x: 0.5, y: 0, z: 0.5 }, rotation: { y: 0 } }, fight: null };
    for (let i = 0; i < 300; i++) foes.update(DT, s);
    expect(clanCats.setLead).not.toHaveBeenCalled();
    expect(ledger.snapshot()).toEqual({ wins: 0, fight: [], pass: [], beaten: [] });
    expect(foes.foe.current()).toBe(null);
  });

  test('a cat on patrol with a co-walker, led by something else, or mid-greeting is left alone', () => {
    const a = { ...fakeCat('a', K.warrior), buddy: {} };
    const b = { ...fakeCat('b', K.warrior), lead: () => ({}) };
    const c = { ...fakeCat('c', K.warrior), state: 'greet' };
    const clanCats = { list: [a, b, c], setLead: vi.fn(() => true) };
    const ledger = createAwayLedger({ seed: 1 });
    const foes = createAwayFoes({ clanCats, ledger });
    const s = { cat: { position: { x: 0.5, y: 0, z: 0.5 }, rotation: { y: 0 } }, fight: null };
    for (let i = 0; i < 30; i++) foes.update(DT, s);
    expect(ledger.snapshot().fight.concat(ledger.snapshot().pass)).toEqual([]);
  });

  test('while a challenge is not allowed (canStart false) no cat decides, and none challenges', () => {
    let open = false;
    const w = world({ canStart: () => open });
    w.walkUpTo('moor-4');
    w.secs(3);
    expect(w.decided).toEqual([]);
    expect(w.fight.uiShowing).toBe(null);
    open = true;
    w.walkUpTo('moor-4');
    w.frame();
    expect(w.fight.uiShowing).toBe('challenge');
  });

  test("the harness's gate is the patrol's: never on a perch, in photo mode, in a chase, a fight or the guided walk's steps", () => {
    for (const block of [
      (w) => { w.player.perchY = 1; },
      (w) => { w.s.cameraMode = true; },
      (w) => { w.s.chasing = true; },
      (w) => { w.s.lesson = { open: true }; },
      (w) => { w.player.inWater = true; },
      (w) => { w.s.perched = {}; },
    ]) {
      const w = world();
      block(w);
      w.walkUpTo('moor-4');
      w.secs(2);
      expect(w.decided).toEqual([]);
      expect(w.fight.uiShowing).toBe(null);
    }
  });

  test('a cat on another level (raised ground) does not notice her', () => {
    const list = [fakeCat('a', K.warrior)];
    const clanCats = { list, setLead: vi.fn(() => true) };
    const ledger = createAwayLedger({ seed: 1 });
    const terrain = { flat: false, y: () => 0, sameLevel: () => false };
    const foes = createAwayFoes({ clanCats, ledger, terrain });
    const s = { cat: { position: { x: 1, y: 0, z: 1 }, rotation: { y: 0 } }, fight: null };
    for (let i = 0; i < 30; i++) foes.update(DT, s);
    expect(ledger.decisionOf('a')).toBe(null);
  });

  test('no landing for the chase-off: Run simply ends the challenge, she is not moved', () => {
    const list = [fakeCat('a', K.warrior, 0, 0)];
    const clanCats = { list, setLead: vi.fn((c, fn) => { c.lead = fn; return true; }) };
    let seed = 1;
    while (awayRoll(seed, 'a') >= 0.5) seed++;
    const ledger = createAwayLedger({ seed });
    const onChase = vi.fn();
    const foes = createAwayFoes({ clanCats, ledger, landingOk: () => false, onChase, engaged: () => true });
    const s = { cat: { position: { x: 1, y: 0, z: 1 }, rotation: { y: 0 } }, fight: null };
    foes.update(DT, s);
    expect(foes.mode).toBe('ask');
    foes.chaseNow();
    foes.update(DT, s);
    expect(onChase).not.toHaveBeenCalled();
    expect(foes.busy).toBe(false);
    expect(s.cat.position).toEqual({ x: 1, y: 0, z: 1 });
    expect(ledger.cooling).toBe(true);
  });
});

describe('a walk picked up again', () => {
  test('nobody decides twice: the cat that let her pass and the cat she beat stay as they were, and the win count comes back', () => {
    const a = world();
    a.walkUpTo('moor-5');
    a.secs(3);
    a.walkUpTo('moor-4');
    a.frame();
    a.fight.startFight();
    a.untilOver();
    const note = JSON.parse(JSON.stringify(a.ledger.snapshot()));
    expect(note).toEqual({ wins: 1, fight: ['moor-4'], pass: ['moor-5'], beaten: ['moor-4'] });

    const b = world({ restore: note });
    expect(b.ledger.wins).toBe(1);
    b.walkUpTo('moor-5');
    b.secs(2);
    b.walkUpTo('moor-4');
    b.secs(2);
    expect(b.decided).toEqual([]); // no new decision, no second look-and-turn
    expect(b.ui.showChallenge).not.toHaveBeenCalled();
    // An undecided cat is decided at the chance her win left.
    b.walkUpTo('moor-6');
    b.frame();
    expect(b.decided).toEqual([['moor-6', awayRoll(SEED, 'moor-6') < 0.3 ? 'fight' : 'pass', 1]]);
  });
});

describe('one fight at a time (joinFights)', () => {
  const stub = (showing = null) => ({
    uiShowing: showing, update: vi.fn(), key: vi.fn(() => true), startFight: vi.fn(), backOff: vi.fn(), answer: vi.fn(),
    hideChallengeFor: vi.fn(() => false), wouldChallenge: vi.fn(() => true), engagedVisit: showing ? 'v' : null,
    chasedOffTogether: vi.fn(() => false), abort: vi.fn(), cameraSubject: showing === 'fight' ? { who: showing } : null,
  });

  test("while the patrol's offer or fight is up, the roaming cats' fight is not run", () => {
    const border = stub('challenge');
    const away = stub(null);
    const foes = { update: vi.fn(), busy: false };
    const j = joinFights(border, away, foes);
    j.update(DT, {});
    expect(foes.update).toHaveBeenCalled();
    expect(border.update).toHaveBeenCalled();
    expect(away.update).not.toHaveBeenCalled();
    expect(j.uiShowing).toBe('challenge');
    j.startFight();
    j.backOff();
    expect(border.startFight).toHaveBeenCalled();
    expect(border.backOff).toHaveBeenCalled();
    expect(away.startFight).not.toHaveBeenCalled();
  });

  test("while a roaming cat is busy, the patrol's offer waits and its buttons go to the roaming fight", () => {
    const border = stub(null);
    const away = stub('fight');
    const foes = { update: vi.fn(), busy: true };
    const j = joinFights(border, away, foes);
    j.update(DT, {});
    expect(away.update).toHaveBeenCalled();
    expect(border.update).not.toHaveBeenCalled();
    expect(j.wouldChallenge({})).toBe(false);
    expect(j.uiShowing).toBe('fight');
    expect(j.cameraSubject).toEqual({ who: 'fight' });
    j.answer('swipe');
    expect(away.answer).toHaveBeenCalledWith('swipe');
    expect(border.answer).not.toHaveBeenCalled();
    j.abort();
    expect(border.abort).toHaveBeenCalled();
    expect(away.abort).toHaveBeenCalled();
  });

  test('with nothing up both are run, the patrol first', () => {
    const border = stub(null);
    const away = stub(null);
    const j = joinFights(border, away, { update: vi.fn(), busy: false });
    j.update(DT, {});
    expect(away.update).toHaveBeenCalled();
    expect(border.update).toHaveBeenCalled();
    expect(j.uiShowing).toBe(null);
    expect(j.wouldChallenge({})).toBe(true);
  });
});

describe('the walk wires it as designed', () => {
  const walk = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
  const at = walk.indexOf('const awayOn =');
  const slice = walk.slice(at, walk.indexOf('session.clanFight = joinFights', at));

  test("only in another clan's territory, for a cat with a clan (awayAllowed over the allies' picks)", () => {
    expect(at).toBeGreaterThan(0);
    expect(slice).toMatch(/awayAllowed\(\{\s*areaId, mine: [^\n]+, picks, edition: progression\.state\.edition,\s*\}\)/);
    // Built only beside the border patrol's fight: never at home, in Legacy, the den or the old areas.
    expect(walk.slice(0, at)).toMatch(/if \(session\.rival\.foe && session\.clanFight === NO_CLAN_FIGHT\) \{[^]*$/);
  });

  test('the coin is seeded from the walk (the room seed on a co-walk) and restored from the resume note', () => {
    expect(slice).toMatch(/createAwayLedger\(\{ seed: roomSeed \?\? soloSeed, restore: resume\?\.away \}\)/);
  });

  test("a challenge waits for everything the patrol's chase waits for, the water, a perch, the camp ring and the clan's ground", () => {
    const gate = slice.slice(slice.indexOf('canStart:'), slice.indexOf('canChase:'));
    for (const piece of ['chaseAllowed(player, s)', '!player.inWater', '!s.perched', 'borderFight.uiShowing === null', '!isTrespassing(areaId, s.cat.position.x, s.cat.position.z)', 'clanWalkable(']) {
      expect(gate).toContain(piece);
    }
  });

  test('a border patrol win counts toward the reluctance, and the patrol stands by while a roaming cat is busy', () => {
    expect(slice).toMatch(/onWon: \(r\) => \{ borderRecord\.onWon\(r\); awayLedger\?\.addWin\(\); \}/);
    expect(walk).toMatch(/canChase: \(\) => chaseAllowed\(player, session\) && !awayBusy\(\)/);
    expect(walk).toMatch(/borderIntercept = \(\) => borderFight\.uiShowing !== null \|\| \(!awayBusy\(\) && borderFight\.wouldChallenge\(session\)\)/);
  });

  test('the chase-off slice pays and stores nothing', () => {
    const chase = slice.slice(slice.indexOf('onChase:'), slice.indexOf('measure:'));
    expect(chase).not.toMatch(/progression|log\.|award|colony/);
  });
});
