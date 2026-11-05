import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createBorderFight, BORDER_CHALLENGE_WAIT, borderWords } from '../src/game/borderfight.js';
import { createRivalPatrol, patrolAt, chaseAllowed, BORDER_VISIT } from '../src/rivalcats.js';
import { rivalFor, isTrespassing } from '../src/rivalclans.js';
import { borderWarriorFor } from '../src/clancast.js';
import { COUNTER, BUTTONS } from '../src/fight.js';

// The border patrol fight, end to end over the real patrol: the frame order is
// main.js's (the rival, then the clan fight).
const AREA = 'moor';
const member = borderWarriorFor('moor', 7);
const DT = 1 / 30;

function world({ answers = 'right', actions = false } = {}) {
  const clock = { t: 2000 };
  const chases = [];
  const toasts = [];
  const awards = [];
  const sent = [];
  const scene = new THREE.Scene();
  const player = { inWater: false, perchY: 0, halt: vi.fn() };
  const { cx, cz } = rivalFor(AREA);
  const p0 = patrolAt(AREA, clock.t);
  const d0 = Math.hypot(cx - p0.x, cz - p0.z);
  const s = {
    cat: { position: new THREE.Vector3(p0.x + ((cx - p0.x) / d0) * 2, 0, p0.z + ((cz - p0.z) / d0) * 2), rotation: { y: 0 } },
    fight: null, perched: null, chasing: false, cameraMode: false,
  };
  let fight = null;
  const patrol = createRivalPatrol(scene, AREA, {
    now: () => clock.t, foe: { member, scars: [] },
    canChase: () => chaseAllowed(player, s),
    intercept: () => fight.uiShowing !== null || fight.wouldChallenge(s),
    onChase: (who) => { chases.push(who); s.chasing = true; },
    onSettled: () => { s.chasing = false; },
  });
  const ui = {
    showChallenge: vi.fn(), showFight: vi.fn(), hide: vi.fn(), key: () => false,
  };
  const onWon = vi.fn();
  const onLost = vi.fn();
  fight = createBorderFight({
    patrol, areaId: AREA, ui,
    audio: { hiss() {}, pounceWhoosh() {}, landThump() {} }, fx: { burst() {}, slash() {} },
    hud: { toast: (t) => toasts.push(t) }, log: { awardOnce: (...a) => { awards.push(a); return 12; } },
    walkStamp: 'walk-b', playerId: 'me', playerSpecial: null, now: () => clock.t, player, runSpeed: 3,
    picks: ['gorge'], sendEvent: (ev) => sent.push(ev), onWon, onLost, actions,
    measureCat: () => ({ top: 0.9, backY: 0.5, pinnedBackY: 0.3, hindZ: 0.3, pivotY: 0.2 }),
  });
  const frame = () => {
    clock.t += DT;
    patrol.update(DT, s.cat.position, null);
    fight.update(DT, s);
    const f = s.fight;
    // A tap half a second into each clue (the first 0.25 s are ignored).
    if (f && f.phase === 'clue') {
      clueFrames += 1;
      if (clueFrames === 15) fight.answer(answers === 'right' ? COUNTER[f.move] : BUTTONS.find((b) => b !== COUNTER[f.move]));
    } else clueFrames = 0;
  };
  let clueFrames = 0;
  const run = (n) => { for (let i = 0; i < n; i++) frame(); };
  return { player, clock, chases, toasts, awards, sent, patrol, fight, ui, s, frame, run, onWon, onLost };
}

describe('the border patrol fight', () => {
  test('a trespasser near the patrol gets the pill, not a chase', () => {
    const w = world();
    w.frame();
    expect(w.chases).toEqual([]);
    expect(w.fight.uiShowing).toBe('challenge');
    expect(w.ui.showChallenge).toHaveBeenCalledWith({ name: member.name, clan: 'moor', ask: 'blocks your path!', off: 'Run' });
    expect(w.patrol.state).toBe('standoff');
  });

  test('a win: it lets you pass, pays the border award once, and never chases this walk', () => {
    const w = world();
    w.frame();
    w.fight.startFight();
    expect(w.sent[0]).toMatchObject({ type: 'patrol-fight', area: AREA, visit: BORDER_VISIT });
    w.run(30 * 40);
    expect(w.s.fight).toBeNull();
    expect(w.awards).toEqual([['border', `border-${AREA}`, `You faced down ${member.name}! 🛡️`]]);
    expect(w.toasts).toContain(`${member.name} lets you pass. 🐾`);
    expect(w.onWon).toHaveBeenCalledWith(expect.objectContaining({ castId: member.id, visit: BORDER_VISIT }));
    expect(w.sent.map((e) => [e.type, e.fled])).toEqual([['patrol-fight', undefined], ['patrol-done', true]]);
    expect(w.patrol.foe.isFled(BORDER_VISIT)).toBe(true);
    // walk about inside the border all the while: no pill, no chase
    for (let i = 0; i < 30 * 60; i++) {
      const p = w.patrol.pos;
      w.s.cat.position.set(p.x + (rivalFor(AREA).cx - p.x) * 0.2, 0, p.z + (rivalFor(AREA).cz - p.z) * 0.2);
      w.frame();
    }
    expect(w.chases).toEqual([]);
    expect(w.fight.uiShowing).toBeNull();
    expect(w.awards).toHaveLength(1);
  });

  test('a loss: today\'s chase, naming the warrior, and nothing paid', () => {
    const w = world({ answers: 'wrong' });
    w.frame();
    w.fight.startFight();
    w.run(30 * 40);
    expect(w.awards).toEqual([]);
    expect(w.onLost).toHaveBeenCalledTimes(1);
    expect(w.toasts[0]).toBe(`${member.name} won this time. Try again soon!`);
    expect(w.chases).toEqual([member.name]);
    expect(isTrespassing(AREA, w.s.cat.position.x, w.s.cat.position.z)).toBe(false);
    expect(w.patrol.foe.isFled(BORDER_VISIT)).toBe(false);
  });

  test('Run is today\'s chase', () => {
    const w = world();
    w.frame();
    w.fight.backOff();
    w.run(30);
    expect(w.chases).toEqual([member.name]);
    expect(isTrespassing(AREA, w.s.cat.position.x, w.s.cat.position.z)).toBe(false);
  });

  test('no answer for BORDER_CHALLENGE_WAIT is Run; stepping out first is no chase at all', () => {
    const w = world();
    w.run(Math.round((BORDER_CHALLENGE_WAIT - 0.5) / DT));
    expect(w.chases).toEqual([]);
    expect(w.fight.uiShowing).toBe('challenge');
    w.run(Math.round(1 / DT));
    expect(w.chases).toEqual([member.name]);

    const out = world();
    out.frame();
    const { cx, cz, r } = rivalFor(AREA);
    const p = out.s.cat.position;
    const d = Math.hypot(p.x - cx, p.z - cz);
    p.set(cx + ((p.x - cx) / d) * (r + 0.5), 0, cz + ((p.z - cz) / d) * (r + 0.5));
    out.run(30 * 12);
    expect(out.fight.uiShowing).toBeNull();
    expect(out.chases).toEqual([]);
  });

  test('wading inside the border: no pill, today\'s chase', () => {
    const w = world();
    w.player.inWater = true;
    w.frame();
    expect(w.fight.uiShowing).toBeNull();
    expect(w.chases).toEqual([member.name]);
  });

  test('with fight moves (as the walk plays it): won and lost both end, the loss in a chase', () => {
    const w = world({ actions: true });
    w.frame();
    w.fight.startFight();
    w.run(30 * 40);
    expect(w.s.fight).toBeNull();
    expect(w.awards).toHaveLength(1);
    expect(w.onWon.mock.calls[0][0].site).toBeTruthy();
    const l = world({ actions: true, answers: 'wrong' });
    l.frame();
    l.fight.startFight();
    l.run(30 * 40);
    expect(l.chases).toEqual([member.name]);
    expect(l.toasts[0]).toMatch(/heal in a few walks/);
  });

  test('the words are short and warm', () => {
    const words = borderWords('moor');
    expect(words.won('Mistfur')).toBe('Mistfur lets you pass. 🐾');
    expect(words.lost('Mistfur', true)).toMatch(/heal/);
  });

  test('borderfight.js is handed no progression and imports only the fight, the border and the patrol', () => {
    const src = readFileSync(new URL('../src/game/borderfight.js', import.meta.url), 'utf8');
    const specs = [...src.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]).sort();
    expect(specs).toEqual(['../rivalcats.js', '../rivalclans.js', './clanfight.js']);
    expect(src.replace(/\/\/.*$/gm, '')).not.toMatch(/progression|colony/);
  });
});
