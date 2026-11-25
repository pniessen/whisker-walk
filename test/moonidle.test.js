// The Moon's idle ring, the pure schedule (world/moonidle.js): 30 s without progress arms the ring, the waits grow (30, 60, 90, then 90), every kind of progress resets it, it holds in
// each excluded state and when there is nothing to point at, and a fake clock drives it with no THREE.
import { describe, it, expect } from 'vitest';
import { IDLE, idleStart, nextIdleRing, waitFor, dotCanReach, idlePaused, progressMark } from '../src/world/moonidle.js';

const FREE = { progress: false, paused: false, target: true };
// run `secs` seconds at 0.5 s looks, returning the seconds (since the start of the run) at which it rang
function run(state, secs, ev = FREE, dt = 0.5) {
  const rings = [];
  let s = state;
  for (let t = dt; t <= secs + 1e-9; t += dt) {
    const r = nextIdleRing(s, dt, ev);
    s = r.state;
    if (r.ring) rings.push({ at: +t.toFixed(2), first: r.first });
  }
  return { state: s, rings };
}

describe('the schedule', () => {
  it('arms at 30 s, then 60 s later, then 90 s later, then every 90 s (it never goes faster)', () => {
    const r = run(idleStart(), 400);
    expect(r.rings.map((x) => x.at)).toEqual([30, 90, 180, 270, 360]);
    expect(IDLE.waits).toEqual([30, 60, 90]);
    expect([0, 1, 2, 3, 9].map(waitFor)).toEqual([30, 60, 90, 90, 90]);
  });
  it('the first ring of the walk is the one with the hint, the later ones are not', () => {
    const r = run(idleStart(), 200);
    expect(r.rings.map((x) => x.first)).toEqual([true, false, false]);
  });
  it('is deterministic: the same events give the same rings; the input state is never touched', () => {
    const s0 = idleStart();
    const a = run(s0, 100);
    const b = run(s0, 100);
    expect(a.rings).toEqual(b.rings);
    expect(s0).toEqual({ idle: 0, rung: 0, told: false });
    expect(Object.isFrozen(s0)).toBe(true);
  });
  it('does not ring a hair before 30 s', () => {
    const r = run(idleStart(), 29.5);
    expect(r.rings).toEqual([]);
    expect(nextIdleRing(r.state, 0.5, FREE).ring).toBe(true);
  });
  it('a long stalled step still rings once (not several)', () => {
    const r = nextIdleRing(idleStart(), 500, FREE);
    expect(r.ring).toBe(true);
    expect(r.state.rung).toBe(1);
  });
  it('dt of 0 or less never moves it', () => {
    expect(nextIdleRing(idleStart(), 0, FREE).state.idle).toBe(0);
    expect(nextIdleRing(idleStart(), -3, FREE).state.idle).toBe(0);
  });
});

describe('progress resets the stretch', () => {
  it('any progress sends the clock and the waits back to the start, but the hint stays told for the walk', () => {
    let r = run(idleStart(), 100); // rung 2 by now
    expect(r.state.rung).toBe(2);
    const p = nextIdleRing(r.state, 0.5, { ...FREE, progress: true });
    expect(p.ring).toBe(false);
    expect(p.state).toEqual({ idle: 0, rung: 0, told: true });
    r = run(p.state, 31);
    expect(r.rings).toEqual([{ at: 30, first: false }]); // 30 s again (not 90), and no second hint
  });
  it('progress just before 30 s means no ring at 30 s', () => {
    let r = run(idleStart(), 29);
    r = nextIdleRing(r.state, 0.5, { ...FREE, progress: true });
    expect(run(r.state, 29).rings).toEqual([]);
  });
  it('every kind of progress the life reports changes the mark (and idle frames do not)', () => {
    const base = { step: 1, cells: 0, scope: 0, stamp: -1, carrying: -1, pip: 'following', riding: false, card: -1, flight: false, reply: false, job: '[]', finds: 0, calls: 0, hops: 0 };
    const m0 = progressMark(base);
    expect(progressMark({ ...base })).toBe(m0);
    const changes = { step: 2, cells: 1, scope: 1, stamp: 1, carrying: 0, pip: 'leading', riding: true, card: 0, flight: true, reply: true, job: '[1]', finds: 1, calls: 1, hops: 1 };
    for (const [k, v] of Object.entries(changes)) expect(progressMark({ ...base, [k]: v }), k).not.toBe(m0);
  });
});

describe('it holds, never resets, while she is not walking free', () => {
  const states = {
    'a page is open (telescope, stamp picker, binoculars)': { open: true },
    'the launch count or flight': { flight: true },
    "the Core's wake beat": { beat: true },
    "Earth's finale": { finale: true },
    'riding Dot toward a goal Dot cannot reach': { riding: true, goal: { kind: 'core', cell: 0 } },
  };
  for (const [name, s] of Object.entries(states)) {
    it(`${name}: no ring however long, and the 25 s already run are kept`, () => {
      expect(idlePaused(s)).toBe(true);
      let r = run(idleStart(), 25);
      r = run(r.state, 600, { ...FREE, paused: idlePaused(s) });
      expect(r.rings).toEqual([]);
      expect(r.state.idle).toBe(25);
      expect(run(r.state, 5.5).rings).toEqual([{ at: 5, first: true }]); // and it picks up where it left off
    });
  }
  it('riding Dot toward a goal Dot can reach counts; walking free counts', () => {
    expect(idlePaused({ riding: true, goal: { kind: 'scope' } })).toBe(false);
    expect(idlePaused({ riding: true, goal: { kind: 'cell', cell: 1 } })).toBe(false);
    expect(idlePaused({ riding: false, goal: { kind: 'core' } })).toBe(false);
    expect(idlePaused({})).toBe(false);
  });
  it('which goals Dot can reach: the open plain only (not the Ridge cell, the Core or the board)', () => {
    for (const k of ['pip', 'scope', 'desk', 'rocket', 'button', 'reply', 'cave', 'job']) expect(dotCanReach({ kind: k }), k).toBe(true);
    expect(dotCanReach({ kind: 'cell', cell: 1 })).toBe(true);
    expect(dotCanReach({ kind: 'cell', cell: 0 })).toBe(false);
    expect(dotCanReach({ kind: 'core', cell: 1 })).toBe(false);
    expect(dotCanReach({ kind: 'done' })).toBe(false);
    expect(dotCanReach(null)).toBe(false);
  });
});

describe('nothing to point at', () => {
  it('no ring and the clock holds when there is no target (the story told and the cell in, the errand done or not offered)', () => {
    const r = run(idleStart(), 1000, { ...FREE, target: false });
    expect(r.rings).toEqual([]);
    expect(r.state).toEqual({ idle: 0, rung: 0, told: false });
  });
  it('and it never nags afterwards: a target that comes back starts from where it was', () => {
    let r = run(idleStart(), 10, FREE);
    r = run(r.state, 500, { ...FREE, target: false });
    expect(run(r.state, 20.5).rings.map((x) => x.at)).toEqual([20]);
  });
});
