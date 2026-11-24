// The Moon, milestone 6: the rocket's flight plan (src/world/moonlaunch.js) as a pure function of the seconds since T0. Monotone and it ends, the same on
// any device clock, a countdown that fires each second once, the photosensitivity rule over the plume's opacity curve, the reduced-motion path, the smoke
// pool's counts per tier, the clock-launched demo, and the step machine's chapter 3 (src/world/moonmission.js).
import { describe, it, expect } from 'vitest';
import * as L from '../src/world/moonlaunch.js';
import * as M from '../src/world/moonmission.js';

const range = (a, b, dt) => { const out = []; for (let t = a; t <= b + 1e-9; t += dt) out.push(Math.round(t * 1e6) / 1e6); return out; };

describe('launchPose is a pure function of time', () => {
  it('is the same every time it is asked, and takes no device clock', () => {
    for (const t of [-3, 0, 2.5, 5, 7.7, 12, 25, 38.5, 41]) expect(L.launchPose(t)).toEqual(L.launchPose(t));
    expect(L.launchPose.length).toBeLessThanOrEqual(2); // (t, reduced): nothing else is read
    const src = String(L.launchPose) + String(L.riseY) + String(L.plumeOpacity);
    expect(src).not.toMatch(/Date|performance|Math\.random/);
  });
  it('the rocket never goes down while it flies: its height is monotone from ignition to the time it leaves the picture', () => {
    for (const reduced of [false, true]) {
      let last = -1;
      for (const t of range(0, L.totalOf(reduced), 1 / 30)) {
        const p = L.launchPose(t, reduced);
        if (p.phase === 'reset' && p.rocketScale < 1) break; // a fresh rocket rolls out: a new rocket, not this one going down
        if (p.phase === 'ready' || p.over) continue;
        expect(p.rocketY, `t=${t}`).toBeGreaterThanOrEqual(last - 1e-9);
        last = p.rocketY;
      }
      expect(last).toBeGreaterThan(100);
    }
  });
  it('the rise is the plan: 2.4 m/s2 for 5 s (30 m), then 12 m/s', () => {
    expect(L.riseY(0)).toBe(0);
    expect(L.riseY(5)).toBeCloseTo(30, 6);
    expect(L.riseY(10)).toBeCloseTo(30 + 60, 6);
    expect(L.launchPose(L.COUNT.normal + 5).rocketY).toBeCloseTo(30, 6);
  });
  it('ends: out of the picture, a fading dot, a fresh rocket rolled out and the pad Ready again at 40 s (12 s in reduced motion)', () => {
    const early = L.launchPose(5);
    expect(early.rocketOn).toBe(true);
    const far = L.launchPose(24);
    expect(far.rocketOn).toBe(false);
    expect(far.dot).toBeGreaterThan(0);
    expect(L.launchPose(30).dot).toBeLessThan(0.01);
    const out = L.launchPose(39);
    expect(out.rocketOn).toBe(true);
    expect(out.rocketY).toBe(0);
    expect(out.rocketScale).toBeGreaterThan(0);
    expect(out.rocketScale).toBeLessThan(1);
    expect(L.launchPose(40).over).toBe(true);
    expect(L.launchPose(40).phase).toBe('ready');
    expect(L.launchPose(11.9, true).over).toBe(false);
    expect(L.launchPose(12, true).over).toBe(true);
  });
  it('before T0 the pad is Ready: the rocket stands, nothing glows', () => {
    const p = L.launchPose(-5);
    expect(p).toMatchObject({ phase: 'ready', rocketOn: true, rocketY: 0, plume: 0, gantry: 0, count: 0 });
    expect(L.launchPose(NaN).phase).toBe('ready');
  });
  it('a five second count: 5, 4, 3, 2, 1, the gantry arm swings away over the last second, ignition at 5', () => {
    expect([0, 1, 2, 3, 4].map((t) => L.launchPose(t + 0.5).count)).toEqual([5, 4, 3, 2, 1]);
    expect(L.launchPose(3.5).gantry).toBe(0);
    expect(L.launchPose(4.5).gantry).toBeGreaterThan(0);
    expect(L.launchPose(4.5).gantry).toBeLessThan(1);
    expect(L.launchPose(5).gantry).toBe(1);
    expect(L.launchPose(4.999).phase).toBe('count');
    expect(L.launchPose(5).phase).toBe('burn');
    expect(L.launchPose(5).plume).toBe(0);
    expect(L.launchPose(6).plume).toBeGreaterThan(0.5);
  });
  it('two devices that agree on T0 draw the same rocket whatever their own clocks say', () => {
    const t0 = 1000.25;
    const a = (now) => L.launchPose(L.elapsedFor(now, t0));
    const shifted = (now) => L.launchPose(L.elapsedFor(now + 4096, t0 + 4096));
    for (const now of [1000.25, 1003, 1008.125, 1021, 1038.75]) expect(shifted(now)).toEqual(a(now));
  });
});

describe('the camera tilts up with the rocket, and not in reduced motion', () => {
  it('rises over 2 s from ignition, holds, is back to 0 by 8 s; smooth', () => {
    expect(L.cameraTilt(4)).toBe(0);
    expect(L.cameraTilt(5)).toBe(0);
    expect(L.cameraTilt(7)).toBeCloseTo(L.TILT.max, 5);
    expect(L.cameraTilt(11)).toBeCloseTo(L.TILT.max, 5);
    expect(L.cameraTilt(13)).toBe(0);
    expect(L.cameraTilt(15)).toBe(0);
    let worst = 0;
    for (const t of range(4, 14, 1 / 60)) worst = Math.max(worst, Math.abs(L.cameraTilt(t + 1 / 60) - L.cameraTilt(t)));
    expect(worst).toBeLessThan(0.01); // radians a frame
  });
  it('none at all in reduced motion', () => {
    for (const t of range(0, 12, 0.25)) expect(L.cameraTilt(t, true)).toBe(0);
    expect(L.launchPose(7, true).tilt).toBe(0);
  });
});

describe('the flash rule: nothing changes faster than three times a second', () => {
  // The plume is the one thing that glows. Sample it at 60 Hz; a "swing" is a turn of direction of at least 10 percent of the whole range: no second may hold more than three.
  for (const reduced of [false, true]) {
    it(`the plume's opacity curve${reduced ? ' (reduced motion)' : ''}: at most three swings of 10 percent in any second, and no step bigger than a tenth between frames`, () => {
      const dt = 1 / 60;
      const ts = range(0, L.totalOf(reduced), dt);
      const v = ts.map((t) => L.plumeOpacity(t, reduced));
      let maxStep = 0;
      for (let i = 1; i < v.length; i++) maxStep = Math.max(maxStep, Math.abs(v[i] - v[i - 1]));
      expect(maxStep).toBeLessThan(0.1);
      // turning points that matter: a reversal of direction that moved at least 0.1
      const swings = [];
      let dir = 0;
      let from = v[0];
      let extreme = v[0];
      for (let i = 1; i < v.length; i++) {
        const d = Math.sign(v[i] - v[i - 1]);
        if (d === 0) continue;
        if (dir === 0) dir = d;
        if (d === dir) { extreme = v[i]; continue; }
        if (Math.abs(extreme - from) >= 0.1) swings.push(ts[i - 1]);
        from = extreme;
        extreme = v[i];
        dir = d;
      }
      for (let i = 0; i < swings.length; i++) {
        const inWindow = swings.filter((s) => s >= swings[i] && s < swings[i] + 1).length;
        expect(inWindow).toBeLessThanOrEqual(3);
      }
      expect(Math.max(...v)).toBeLessThanOrEqual(0.9);
    });
  }
  it('eases in over 0.6 s from ignition, and the ripple is under 10 percent', () => {
    expect(L.plumeOpacity(5)).toBe(0);
    expect(L.plumeOpacity(5.3)).toBeLessThan(0.7 * L.PLUME.peak);
    expect(L.plumeOpacity(5.7)).toBeGreaterThan(0.9 * L.PLUME.peak);
    expect(L.PLUME.ripple).toBeLessThan(0.1);
    expect(L.PLUME.rippleHz).toBeLessThan(3);
  });
  it('the whole picture has no other glow: the pose offers one plume value and nothing that flashes', () => {
    const keys = Object.keys(L.launchPose(8));
    expect(keys).toEqual(expect.arrayContaining(['plume', 'dot']));
    for (const t of range(0, 40, 1 / 30)) { const p = L.launchPose(t); expect(p.plume).toBeLessThanOrEqual(1); expect(p.dot).toBeLessThanOrEqual(1); expect(p.dot).toBeGreaterThanOrEqual(0); }
  });
});

describe('the countdown never double-fires', () => {
  const run = (frames, reduced = false) => { const cd = L.createCountdown(reduced); const out = []; for (const t of frames) out.push(...cd.advance(t)); return out; };
  it('a five-second count at 60 fps fires 5, 4, 3, 2, 1 and the ignition once each, in order', () => {
    const ev = run(range(0, 8, 1 / 60));
    expect(ev.map((e) => (e.kind === 'tick' ? e.n : 'go'))).toEqual([5, 4, 3, 2, 1, 'go']);
  });
  it('at any frame rate, with repeated times and with time that goes back, still once each', () => {
    const jumpy = [0, 0, 0.4, 0.4, 1.0, 0.2, 2.9, 2.9, 1.0, 4.99, 5, 5, 3, 9, 0];
    const ev = run(jumpy);
    expect(ev.map((e) => (e.kind === 'tick' ? e.n : 'go'))).toEqual([5, 4, 3, 2, 1, 'go']);
    const slow = run([0, 7]); // one very long frame fires everything it passed, once
    expect(slow.map((e) => (e.kind === 'tick' ? e.n : 'go'))).toEqual([5, 4, 3, 2, 1, 'go']);
  });
  it('a negative time fires nothing; a reset allows the next launch to count again', () => {
    const cd = L.createCountdown();
    expect(cd.advance(-1)).toEqual([]);
    expect(cd.advance(6)).toHaveLength(6);
    expect(cd.advance(6)).toEqual([]);
    cd.reset();
    expect(cd.advance(6)).toHaveLength(6);
  });
  it('reduced motion counts 3, 2, 1', () => {
    const ev = run(range(0, 5, 1 / 30), true);
    expect(ev.map((e) => (e.kind === 'tick' ? e.n : 'go'))).toEqual([3, 2, 1, 'go']);
  });
  it('every tick of the count is in the pose too: the number shown is the one that fired', () => {
    for (const n of [5, 4, 3, 2, 1]) expect(L.launchPose(5 - n + 0.01).count).toBe(n);
  });
});

describe('reduced motion: a shorter, steadier flight', () => {
  it('a 3 s count, rises smoothly, gone by 12 s, no smoke, no ripple, no camera tilt', () => {
    expect(L.countOf(true)).toBe(3);
    expect(L.totalOf(true)).toBe(12);
    expect(L.launchPose(2.9, true).phase).toBe('count');
    expect(L.launchPose(3.1, true).phase).toBe('climb');
    for (const t of range(0, 12, 0.1)) { const p = L.launchPose(t, true); expect(p.smoke).toBe(false); expect(p.tilt).toBe(0); }
    // the rise has no jump: the height changes a little each frame
    let worst = 0;
    for (const t of range(3, 11.9, 1 / 60)) worst = Math.max(worst, L.launchPose(t + 1 / 60, true).rocketY - L.launchPose(t, true).rocketY);
    expect(worst).toBeLessThan(1.2);
    for (const t of range(3, 12, 0.1)) expect(L.smokePuff(7, 150, t, true).alive).toBe(false);
  });
  it('the plume has no ripple in reduced motion: a plain ease in and a plain fade', () => {
    const a = L.plumeOpacity(3.3 + 0.001, true);
    const b = L.plumeOpacity(3.3 + 0.5, true);
    expect(b).toBeGreaterThanOrEqual(a);
    expect(L.plumeOpacity(3 + 2, true)).toBeCloseTo(L.plumeOpacity(3 + 2.05, true), 1);
  });
});

describe('the smoke pool', () => {
  it('150 puffs on a full device, 40 on LOW, none on the lite rung and none in reduced motion', () => {
    expect(L.smokeCount()).toBe(150);
    expect(L.smokeCount({ low: true })).toBe(40);
    expect(L.smokeCount({ lite: true })).toBe(0);
    expect(L.smokeCount({ lite: true, low: true })).toBe(0);
    expect(L.smokeCount({ reduced: true })).toBe(0);
    expect(L.smokeCount({ low: true, reduced: true })).toBe(0);
  });
  it('a puff is a pure function of its number and the time, is alive only in its own window and stays within a few metres of the pad', () => {
    for (const n of [40, 150]) {
      let seen = 0;
      for (let i = 0; i < n; i++) {
        expect(L.smokePuff(i, n, 9.3)).toEqual(L.smokePuff(i, n, 9.3));
        for (const t of range(0, 30, 0.5)) {
          const p = L.smokePuff(i, n, t);
          if (!p.alive) { expect(p.alpha).toBe(0); continue; }
          seen++;
          expect(t).toBeGreaterThanOrEqual(L.COUNT.normal);
          expect(Math.hypot(p.x, p.z)).toBeLessThan(L.SMOKE.reach + 1.2);
          expect(p.y).toBeLessThan(3);
          expect(p.alpha).toBeLessThanOrEqual(0.5);
          expect(p.alpha).toBeGreaterThanOrEqual(0);
        }
      }
      expect(seen).toBeGreaterThan(n);
    }
    expect(L.smokePuff(-1, 150, 9).alive).toBe(false);
    expect(L.smokePuff(150, 150, 9).alive).toBe(false);
    expect(L.smokePuff(0, 0, 9).alive).toBe(false);
  });
  it('the pool is quiet before ignition and after its last puff dies', () => {
    for (let i = 0; i < 150; i++) { expect(L.smokePuff(i, 150, 4.9).alive).toBe(false); expect(L.smokePuff(i, 150, 5 + L.SMOKE.span + L.SMOKE.life + 0.1).alive).toBe(false); }
  });
});

describe('the clock-launched demo', () => {
  it('every 5 minutes of the room clock: a siren for 10 s, then the demo flight from its own T0', () => {
    expect(L.DEMO_EVERY).toBe(300);
    expect(L.demoState(0)).toMatchObject({ cycle: 0, siren: true, elapsed: -10 });
    expect(L.demoState(9.9).siren).toBe(true);
    expect(L.demoState(10)).toMatchObject({ siren: false, elapsed: 0 });
    expect(L.demoState(25).elapsed).toBe(15);
    expect(L.demoState(300)).toMatchObject({ cycle: 1, siren: true, elapsed: -10 });
    expect(L.demoState(310 + 39.9).elapsed).toBeCloseTo(39.9, 6);
    expect(L.launchPose(L.demoState(310 + 39.9).elapsed).over).toBe(false);
    expect(L.launchPose(L.demoState(310 + 40.1).elapsed).over).toBe(true);
  });
  it('the same for every device that reads the same clock; a bad clock reads as the start', () => {
    for (const c of [17, 301.5, 4321.75]) expect(L.demoState(c)).toEqual(L.demoState(c));
    expect(L.demoState(NaN).cycle).toBe(0);
    expect(L.demoState(-5).cycle).toBe(0);
    expect(L.demoT0(325)).toBeCloseTo(310, 6);
  });
  it('a flight (40 s) always fits inside a cycle (300 s) with its siren', () => {
    expect(L.DEMO_SIREN + L.TOTAL.normal).toBeLessThan(L.DEMO_EVERY);
  });
});

describe('Earth\'s answer is ready 40 s after her own launch, and at once after an earlier walk', () => {
  it('replyReady', () => {
    expect(L.replyReady(null)).toBe(true);
    expect(L.replyReady(undefined)).toBe(true);
    expect(L.replyReady(0)).toBe(false);
    expect(L.replyReady(39.9)).toBe(false);
    expect(L.replyReady(40)).toBe(true);
  });
});

describe('the mission, chapter 3: steps 6 to 8 (src/world/moonmission.js)', () => {
  const rec = (step, extra = {}) => ({ step, cells: 3, scope: 3, stamp: -1, jump: {}, ...extra });
  it('a stamp is chosen once Earth is found (step 5) and may be changed until the postcard is posted; not before, not after', () => {
    expect(M.apply(rec(4), { kind: 'stamp', id: 1 }).changed).toBe(false);
    const a = M.apply(rec(5), { kind: 'stamp', id: 1 });
    expect(a).toMatchObject({ changed: true, effect: 'stamp' });
    expect(a.moon.stamp).toBe(1);
    expect(M.apply(a.moon, { kind: 'stamp', id: 2 }).moon.stamp).toBe(2);
    expect(M.apply(a.moon, { kind: 'stamp', id: 1 }).changed).toBe(false);
    expect(M.apply(rec(6, { stamp: 1 }), { kind: 'stamp', id: 0 }).changed).toBe(false);
    for (const id of [-1, 3, 1.5, '1', null, NaN]) expect(M.apply(rec(5), { kind: 'stamp', id }).changed).toBe(false);
  });
  it('the postcard is posted (6), the rocket launched (7) and Earth answers (8): each only in its turn, none twice', () => {
    expect(M.apply(rec(5), { kind: 'load' }).changed).toBe(false); // no stamp yet: nothing to post
    const loaded = M.apply(rec(5, { stamp: 2 }), { kind: 'load' });
    expect(loaded).toMatchObject({ changed: true, effect: 'load' });
    expect(loaded.moon.step).toBe(6);
    expect(M.apply(loaded.moon, { kind: 'load' }).changed).toBe(false);
    expect(M.apply(rec(5, { stamp: 2 }), { kind: 'launch' }).changed).toBe(false);
    const sent = M.apply(loaded.moon, { kind: 'launch' });
    expect(sent.moon.step).toBe(7);
    expect(M.apply(sent.moon, { kind: 'launch' }).changed).toBe(false);
    expect(M.apply(loaded.moon, { kind: 'reply' }).changed).toBe(false);
    const done = M.apply(sent.moon, { kind: 'reply' });
    expect(done.moon.step).toBe(8);
    expect(done.moon.stamp).toBe(2);
    expect(M.apply(done.moon, { kind: 'reply' }).changed).toBe(false);
    expect(M.storyDone(done.moon)).toBe(true);
    expect(M.rocketSent(sent.moon)).toBe(true);
    expect(M.postcardLoaded(loaded.moon)).toBe(true);
  });
  it('a step never goes down and the stamp is kept', () => {
    for (const ev of [{ kind: 'wake' }, { kind: 'beat' }, { kind: 'plug', cell: 0 }, { kind: 'trace', id: 0 }, { kind: 'aim' }, { kind: 'x' }]) {
      const r = M.apply(rec(7, { stamp: 1 }), ev);
      expect(r.moon.step).toBe(7);
      expect(r.moon.stamp).toBe(1);
    }
  });
  it('the goal: the desk, the rocket (postcard in her mouth), the big red button, the ridge, done', () => {
    expect(M.nextGoal(rec(5)).kind).toBe('desk');
    expect(M.nextGoal(rec(5), null, true).kind).toBe('rocket');
    expect(M.nextGoal(rec(6, { stamp: 0 })).kind).toBe('button');
    expect(M.nextGoal(rec(7, { stamp: 0 })).kind).toBe('reply');
    expect(M.nextGoal(rec(8, { stamp: 0 })).kind).toBe('cave'); // (milestone 8) the glowing cell in the cave is what is left
    expect(M.nextGoal({ ...rec(8, { stamp: 0 }), cells: 7 }).kind).toBe('done');
  });
  it('PROPERTY: any order of any events from any start never stops the story (there is always a next goal) and never lowers a step', () => {
    const events = [{ kind: 'wake' }, { kind: 'plug', cell: 0 }, { kind: 'plug', cell: 1 }, { kind: 'beat' }, { kind: 'trace', id: 0 }, { kind: 'trace', id: 1 }, { kind: 'aim' },
      { kind: 'stamp', id: 0 }, { kind: 'stamp', id: 2 }, { kind: 'load' }, { kind: 'launch' }, { kind: 'reply' }, { kind: 'zzz' }, null];
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let run = 0; run < 300; run++) {
      let m = rec(Math.floor(rnd() * 9), { cells: Math.floor(rnd() * 8), scope: Math.floor(rnd() * 32), stamp: Math.floor(rnd() * 4) - 1 });
      let last = M.normalize(m).step;
      for (let i = 0; i < 40; i++) {
        const r = M.apply(m, events[Math.floor(rnd() * events.length)]);
        m = r.moon;
        const step = M.normalize(m).step;
        expect(step).toBeGreaterThanOrEqual(last);
        last = step;
        expect(['pip', 'cell', 'core', 'scope', 'desk', 'rocket', 'button', 'reply', 'cave', 'done']).toContain(M.nextGoal(m, null, rnd() < 0.5).kind);
      }
    }
  });
  it('a launch seen from a partner counts only for a device whose own postcard is posted (credit), and an unknown or hostile event changes nothing', () => {
    expect(M.credit(rec(6, { stamp: 1 }), { kind: 'launch' }).moon.step).toBe(7);
    expect(M.credit(rec(5, { stamp: 1 }), { kind: 'launch' }).changed).toBe(false);
    for (const ev of [{ kind: 'reply' }, { kind: 'stamp', id: 0 }, { kind: 'load' }, { kind: '__proto__' }, { kind: 'constructor' }, 5, 'launch', [], null]) expect(M.credit(rec(5, { stamp: 1 }), ev).changed).toBe(false);
  });
});
