import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MOVES, BUTTONS, COUNTER, CLUES, NEUTRAL_POSE, TIMING, LONGER_LOOK, EDGE_BY_SPECIAL, edgeFor, createFight,
} from '../src/fight.js';

const seq = (moves) => { let i = 0; return () => (MOVES.indexOf(moves[i++ % moves.length]) + 0.5) / 3; };
const run = (f, s) => { const out = []; let t = 0; while (t < s) { out.push(...f.step(1 / 30)); t += 1 / 30; } return out; };
const toClue = (f) => run(f, TIMING.squareOff + 0.05);
const lose = (f) => f.answer(COUNTER[f.move] === 'dodge' ? 'swipe' : 'dodge');
const win = (f) => f.answer(COUNTER[f.move]);

describe('fight rules', () => {
  test('each counter is one line to teach, and every move has exactly one', () => {
    expect(COUNTER).toEqual({ pounce: 'dodge', swipe: 'pounce', charge: 'swipe' });
    expect(new Set(Object.values(COUNTER)).size).toBe(3);
    expect(MOVES.every((m) => BUTTONS.includes(COUNTER[m]))).toBe(true);
  });

  test('the clue is honest: the round plays the move its clue showed', () => {
    for (let seed = 0; seed < 20; seed++) {
      let s = seed + 1;
      const rng = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      const f = createFight({ rng, edge: seed % 2 ? 'secondLook' : null });
      const ev = [];
      ev.push(...toClue(f));
      let guard = 0;
      while (f.phase !== 'over' && guard++ < 50) {
        if (f.phase === 'clue' && f.round % 2) { run(f, 0.5); ev.push(...(seed % 3 ? win(f) : lose(f))); } else ev.push(...run(f, 0.5));
      }
      let shown = null;
      let rounds = 0;
      for (const e of ev) {
        if (e.type === 'clue') shown = e.move;
        if (e.type === 'round') { expect(e.move).toBe(shown); rounds++; }
      }
      expect(rounds).toBeGreaterThan(1);
    }
  });

  test("three different clue poses, none of them the square-off's, and a neutral pose between", () => {
    const poses = Object.values(CLUES).map((c) => c.pose);
    expect(new Set(poses).size).toBe(3);
    expect(poses).not.toContain('cross');
    expect(poses).not.toContain(NEUTRAL_POSE);
    expect(NEUTRAL_POSE).toBe('follow');
    expect(Object.keys(CLUES).sort()).toEqual([...MOVES].sort());
  });

  test('right answers win two rounds and the fight', () => {
    const f = createFight({ rng: seq(['swipe', 'charge']) });
    run(f, TIMING.squareOff + 0.5);
    f.answer('pounce'); run(f, TIMING.tumble + TIMING.beat + 0.5);
    const ev = [...f.answer('swipe'), ...run(f, TIMING.tumble + 0.1)];
    expect(ev.at(-1)).toEqual({ type: 'over', won: true });
    expect(f.phase).toBe('over');
    expect(f.won).toBe(true);
    expect(f.wins).toBe(2);
  });

  test('two wrong answers lose it, and losing is just over: won false', () => {
    const f = createFight({ rng: seq(['swipe', 'charge']) });
    run(f, TIMING.squareOff + 0.5);
    const r1 = f.answer('dodge');
    expect(r1).toEqual([{ type: 'round', round: 1, move: 'swipe', answer: 'dodge', won: false }]);
    run(f, TIMING.tumble + TIMING.beat + 0.5);
    f.answer('pounce');
    const ev = run(f, TIMING.tumble + 0.1);
    expect(ev).toEqual([{ type: 'over', won: false }]);
    expect(f.won).toBe(false);
    expect(f.losses).toBe(2);
    expect(f.wins).toBe(0);
  });

  test('speed never matters: a tap at 0.3 s and at 3.9 s score the same', () => {
    const outcomes = [];
    for (const at of [0.3, 1.0, 2.5, 3.9]) {
      const f = createFight({ rng: seq(['pounce']) });
      toClue(f);
      // toClue ran 0.05 s into the clue; get to `at` seconds in
      run(f, at - 0.05);
      outcomes.push([win(f), f.wins, f.losses]);
      const g = createFight({ rng: seq(['pounce']) });
      toClue(g); run(g, at - 0.05);
      outcomes.push([f === g ? null : lose(g), g.wins, g.losses]);
    }
    const winEvents = outcomes.filter((_, i) => i % 2 === 0).map(([ev]) => ev[0].won);
    const loseEvents = outcomes.filter((_, i) => i % 2 === 1).map(([ev]) => ev[0].won);
    expect(new Set(winEvents)).toEqual(new Set([true]));
    expect(new Set(loseEvents)).toEqual(new Set([false]));
    // the event carries no timing at all
    const f = createFight({ rng: seq(['pounce']) });
    toClue(f); run(f, 0.5);
    expect(Object.keys(win(f)[0]).sort()).toEqual(['answer', 'move', 'round', 'type', 'won']);
  });

  test('timeouts lose slowly, and the second look replays once', () => {
    // no edge
    let f = createFight({ rng: seq(['swipe']) });
    toClue(f);
    let ev = run(f, TIMING.answer - 0.2);
    expect(ev.filter((e) => e.type === 'round')).toEqual([]);
    ev = run(f, 0.4);
    expect(ev).toEqual([{ type: 'round', round: 1, move: 'swipe', answer: null, won: false }]);

    // longerLook
    f = createFight({ rng: seq(['swipe']), edge: 'longerLook' });
    toClue(f);
    ev = run(f, TIMING.answer + LONGER_LOOK - 0.2);
    expect(ev.filter((e) => e.type === 'round')).toEqual([]);
    ev = run(f, 0.4);
    expect(ev.filter((e) => e.type === 'round')).toEqual([{ type: 'round', round: 1, move: 'swipe', answer: null, won: false }]);

    // secondLook
    f = createFight({ rng: seq(['swipe', 'charge']), edge: 'secondLook' });
    toClue(f);
    ev = run(f, TIMING.answer + 0.1);
    expect(ev).toEqual([{ type: 'secondLook', round: 1 }]);
    expect(f.phase).toBe('clue');
    expect(f.move).toBe('swipe');
    expect(f.round).toBe(1);
    // the same window again: ignore-first applies again, and a right tap still wins
    ev = run(f, TIMING.answer - 0.3);
    expect(ev).toEqual([]);
    ev = run(f, 0.4);
    expect(ev).toEqual([{ type: 'round', round: 1, move: 'swipe', answer: null, won: false }]);
    // once per fight: the next round's timeout loses straight away
    run(f, TIMING.tumble + TIMING.beat + 0.1);
    expect(f.round).toBe(2);
    ev = run(f, TIMING.answer + 0.1);
    expect(ev.some((e) => e.type === 'secondLook')).toBe(false);
    expect(ev.find((e) => e.type === 'round')).toMatchObject({ round: 2, answer: null, won: false });
  });

  test('a tap in the first 0.25 s, between rounds or after the end is ignored', () => {
    const f = createFight({ rng: seq(['swipe', 'charge']) });
    expect(f.answer('pounce')).toEqual([]); // square-off
    toClue(f); // 0.05 s into the clue
    expect(f.answer('pounce')).toEqual([]); // inside ignoreFirst
    expect(f.wins + f.losses).toBe(0);
    run(f, TIMING.ignoreFirst); // now past it
    expect(f.answer('nonsense')).toEqual([]);
    expect(f.answer(undefined)).toEqual([]);
    expect(f.answer('charge')).toEqual([]); // a move, not a button
    expect(f.answer('pounce')).toHaveLength(1);
    expect(f.answer('pounce')).toEqual([]); // tumble
    run(f, TIMING.tumble + 0.1);
    expect(f.phase).toBe('beat');
    expect(f.answer('swipe')).toEqual([]); // between rounds
    run(f, TIMING.beat + 0.5);
    f.answer('swipe');
    run(f, TIMING.tumble + 0.1);
    expect(f.phase).toBe('over');
    expect(f.answer('pounce')).toEqual([]); // after the end
    expect(run(f, 5)).toEqual([]);
  });

  test('it is best of three: never more than three rounds', () => {
    for (let seed = 1; seed <= 60; seed++) {
      let s = seed;
      const rng = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      const f = createFight({ rng, edge: seed % 3 === 0 ? 'secondLook' : seed % 3 === 1 ? 'longerLook' : null, reducedMotion: seed % 2 === 0 });
      const ev = [...toClue(f)];
      let guard = 0;
      while (f.phase !== 'over' && guard++ < 200) {
        if (f.phase === 'clue') { run(f, 0.3); ev.push(...(((seed + f.round) % 2) ? win(f) : lose(f))); }
        ev.push(...run(f, 0.5));
      }
      ev.push(...run(f, 10));
      const rounds = ev.filter((e) => e.type === 'round');
      expect(rounds.length).toBeLessThanOrEqual(3);
      expect(rounds.length).toBeGreaterThanOrEqual(2);
      expect(ev.filter((e) => e.type === 'over')).toHaveLength(1);
      expect(f.round).toBeLessThanOrEqual(3);
      expect(f.wins === 2 || f.losses === 2).toBe(true);
      expect(f.wins).toBeLessThanOrEqual(2);
      expect(f.losses).toBeLessThanOrEqual(2);
    }
  });

  test('reduced motion shortens the tumble', () => {
    const f = createFight({ rng: seq(['swipe']), reducedMotion: true });
    toClue(f); run(f, 0.5); f.answer('pounce');
    run(f, TIMING.tumbleReduced + 0.05);
    expect(f.phase).toBe('beat');
    const g = createFight({ rng: seq(['swipe']) });
    toClue(g); run(g, 0.5); g.answer('pounce');
    run(g, TIMING.tumbleReduced + 0.05);
    expect(g.phase).toBe('tumble');
  });

  test('same rng, same events; the rng is drawn once per clue', () => {
    const play = () => {
      let s = 7, draws = 0;
      const rng = () => { draws++; s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      const f = createFight({ rng, edge: 'secondLook' });
      const ev = [...toClue(f)];
      while (f.phase !== 'over') { ev.push(...run(f, 1.7)); }
      return { ev, draws, rounds: f.round };
    };
    const a = play(); const b = play();
    expect(a.ev).toEqual(b.ev);
    expect(a.draws).toBe(a.rounds);
  });

  test('every family cat gets one small edge', () => {
    for (const sp of ['keenNose', 'chaser', 'napper', 'fearless', 'pouncer', 'steady', 'bird']) expect(edgeFor(sp)).not.toBeNull();
    for (const bad of [undefined, null, 5, '__proto__', 'toString', 'constructor', 'hasOwnProperty']) expect(edgeFor(bad)).toBeNull();
    expect(edgeFor('keenNose')).toBe('longerLook');
    expect(edgeFor('bird')).toBe('secondLook');
    expect(Object.values(EDGE_BY_SPECIAL).every((e) => e === 'longerLook' || e === 'secondLook')).toBe(true);
  });

  test('fight.js imports nothing', () => {
    const src = readFileSync(new URL('../src/fight.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/\bimport\s*\(/);
    expect(src).not.toMatch(/\brequire\s*\(/);
    expect(src).not.toMatch(/^\s*export\s+.*\bfrom\s+['"]/m);
  });

  test('timing constants are the agreed ones', () => {
    expect(TIMING).toEqual({ squareOff: 1.2, answer: 4.0, ignoreFirst: 0.25, tumble: 1.4, tumbleReduced: 0.6, beat: 0.8 });
    expect(LONGER_LOOK).toBe(1.0);
  });
});

describe('special moves', () => {
  const SP = { id: 'rearUpSwat', answers: 'swipe' };
  const toAnswerable = (f) => { toClue(f); run(f, 0.3); };

  test('a special on its clue wins and counts two', () => {
    // 0-0: a right special ends the fight
    let f = createFight({ rng: seq(['swipe', 'charge']), specials: [SP] });
    toAnswerable(f);
    let ev = f.answer('rearUpSwat');
    expect(ev).toEqual([{ type: 'round', round: 1, move: 'swipe', answer: 'rearUpSwat', won: true, special: true }]);
    expect(f.wins).toBe(2);
    ev = run(f, TIMING.tumble + 0.1);
    expect(ev).toEqual([{ type: 'over', won: true }]);
    expect(f.won).toBe(true);
    expect(f.used).toEqual(['rearUpSwat']);

    // 0-1: a right special wins the fight
    f = createFight({ rng: seq(['charge', 'swipe']), specials: [SP] });
    toAnswerable(f);
    f.answer('dodge');
    run(f, TIMING.tumble + TIMING.beat + 0.5);
    expect(f.round).toBe(2);
    f.answer('rearUpSwat');
    expect(f.wins).toBe(2);
    expect(f.losses).toBe(1);
    expect(run(f, TIMING.tumble + 0.1)).toEqual([{ type: 'over', won: true }]);

    // 1-0: it ends the fight with three wins
    f = createFight({ rng: seq(['swipe']), specials: [{ id: 'pin', answers: 'swipe' }] });
    toAnswerable(f);
    f.answer('pounce');
    run(f, TIMING.tumble + TIMING.beat + 0.5);
    f.answer('pin');
    expect(f.wins).toBe(3);
    expect(run(f, TIMING.tumble + 0.1)).toEqual([{ type: 'over', won: true }]);
    expect(f.won).toBe(true);
  });

  test('a special on the wrong clue loses the round and is spent', () => {
    const f = createFight({ rng: seq(['charge', 'pounce', 'swipe']), specials: [SP] });
    toAnswerable(f);
    const ev = f.answer('rearUpSwat');
    expect(ev).toEqual([{ type: 'round', round: 1, move: 'charge', answer: 'rearUpSwat', won: false, special: true }]);
    expect(f.losses).toBe(1);
    expect(f.wins).toBe(0);
    expect(f.used).toContain('rearUpSwat');
    run(f, TIMING.tumble + TIMING.beat + 0.5);
    expect(f.phase).toBe('clue');
    expect(f.answer('rearUpSwat')).toEqual([]);
    expect(f.losses).toBe(1);
    expect(f.phase).toBe('clue');
  });

  test('Rolling Tumble answers any clue', () => {
    for (const move of MOVES) {
      const f = createFight({ rng: seq([move]), specials: [{ id: 'rollingTumble', answers: 'any' }] });
      toAnswerable(f);
      const ev = f.answer('rollingTumble');
      expect(ev[0]).toMatchObject({ move, won: true, special: true });
      expect(f.wins).toBe(2);
    }
  });

  test('a special is ignored, not spent, before ignoreFirst, outside a clue, or when not owned', () => {
    const f = createFight({ rng: seq(['swipe', 'charge']), specials: [SP] });
    expect(f.answer('rearUpSwat')).toEqual([]); // square-off
    toClue(f); // 0.05 s in
    expect(f.answer('rearUpSwat')).toEqual([]); // inside ignoreFirst
    run(f, 0.3);
    expect(f.answer('pin')).toEqual([]); // not owned
    expect(f.answer('leapScratch')).toEqual([]);
    expect(f.used).toEqual([]);
    expect(f.wins + f.losses).toBe(0);
    f.answer('dodge'); // a basic round: tumble phase
    expect(f.answer('rearUpSwat')).toEqual([]); // tumble
    run(f, TIMING.tumble + 0.1);
    expect(f.phase).toBe('beat');
    expect(f.answer('rearUpSwat')).toEqual([]); // beat
    expect(f.used).toEqual([]);
    run(f, TIMING.beat + 0.5);
    // still spendable afterwards
    expect(f.answer('rearUpSwat')).toHaveLength(1);
    expect(f.used).toEqual(['rearUpSwat']);
  });

  test('no specials by default, and a basic round event keeps its shape', () => {
    const f = createFight({ rng: seq(['swipe']) });
    toAnswerable(f);
    expect(f.used).toEqual([]);
    expect(f.answer('rearUpSwat')).toEqual([]);
    expect(Object.keys(f.answer('pounce')[0]).sort()).toEqual(['answer', 'move', 'round', 'type', 'won']);
  });

  test("actionTime sets each round's action length from the round alone", () => {
    const seen = [];
    const actionTime = (e) => { seen.push(e); return e.won ? 2 : 3; };
    let f = createFight({ rng: seq(['swipe']), actionTime });
    toAnswerable(f);
    f.answer('pounce'); // won
    run(f, 1.9);
    expect(f.phase).toBe('tumble');
    run(f, 0.2);
    expect(f.phase).toBe('beat');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ type: 'round', round: 1, move: 'swipe', answer: 'pounce', won: true });
    // beat length
    f = createFight({ rng: seq(['swipe']), actionTime, beatTime: 1.2 });
    toAnswerable(f);
    f.answer('dodge'); // lost: 3 s
    run(f, 2.9);
    expect(f.phase).toBe('tumble');
    run(f, 0.2);
    expect(f.phase).toBe('beat');
    run(f, 1.0);
    expect(f.phase).toBe('beat');
    run(f, 0.3);
    expect(f.phase).toBe('clue');
  });
});
