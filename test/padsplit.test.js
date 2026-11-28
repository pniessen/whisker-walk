import { describe, it, expect } from 'vitest';
import { createSplitControl, orbitFor, zoomFor, turnsHeading } from '../src/coop/padsplit.js';
import { padForWalk, createPadHub } from '../src/coop/padhub.js';
import { stepPad, createPadState, PAD_BUTTONS, STICK_DEAD } from '../src/gamepadinput.js';

const pad = (axes = [0, 0, 0, 0], down = []) => ({ index: 0, id: 'x', connected: true, mapping: 'standard', axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })) });

describe('mapping per mode (S4)', () => {
  it('shared: cat one right stick and L1/R1 are taken out (exactly as before)', () => {
    const w = padForWalk(pad([0.2, 0.3, 0.9, -0.8], [PAD_BUTTONS.L1, PAD_BUTTONS.R1, PAD_BUTTONS.A]), true);
    expect(w.axes).toEqual([0.2, 0.3, 0, 0]);
    expect(w.buttons[PAD_BUTTONS.L1]).toBe(false);
    expect(w.buttons[PAD_BUTTONS.R1]).toBe(false);
    expect(w.buttons[PAD_BUTTONS.A].pressed).toBe(true);
    expect(padForWalk(pad([0, 0, 1, 1]), true, false).axes[2]).toBe(0);
  });
  it('split: cat one gets the pad whole', () => {
    const p = pad([0.2, 0.3, 0.9, -0.8], [PAD_BUTTONS.L1]);
    expect(padForWalk(p, true, true)).toBe(p);
  });
  it('a menu (not engaged) is whole in both', () => {
    const p = pad([0, 0, 1, 1]);
    expect(padForWalk(p, false)).toBe(p);
    expect(padForWalk(null, true, true)).toBe(null);
  });
  it('pad two orbit: only in the split mapping', () => {
    const two = { orbit: { dx: 3, dy: -1 } };
    expect(orbitFor('shared', two)).toBeNull();
    expect(orbitFor('split', two)).toEqual({ dx: 3, dy: -1 });
    expect(orbitFor('split', { orbit: null })).toBeNull();
    expect(orbitFor('split', { orbit: { dx: 0, dy: 0 } })).toBeNull();
  });
  it('pad two L1/R1: zoom cat two in split, turn the heading in shared', () => {
    const out = { type: 'turn', slot: 1, dir: 1 }; const inn = { type: 'turn', slot: 1, dir: -1 };
    expect(zoomFor('shared', out, 1, 3)).toBeNull();
    expect(zoomFor('split', out, 1, 3)).toBe(2);
    expect(zoomFor('split', inn, 1, 3)).toBe(0);
    expect(zoomFor('split', inn, 0, 3)).toBe(0); // clamped
    expect(zoomFor('split', out, 3, 3)).toBe(3);
    expect(zoomFor('split', out, 2, 2)).toBe(2); // a capped place
    expect(zoomFor('split', { type: 'turn', slot: 0, dir: 1 }, 1, 3)).toBeNull(); // pad one's reach the walk's code
    expect(zoomFor('split', { type: 'hop', slot: 1 }, 1, 3)).toBeNull();
    expect(turnsHeading('shared')).toBe(true);
    expect(turnsHeading('split')).toBe(false);
  });
});

describe('dead zone and centring through the real pad step', () => {
  it('a centred or slightly noisy right stick gives no orbit', () => {
    const st = createPadState();
    expect(stepPad(st, pad([0, 0, 0, 0]), 1 / 60).orbit).toBeNull();
    expect(stepPad(st, pad([0, 0, STICK_DEAD * 0.5, -STICK_DEAD * 0.5]), 1 / 60).orbit).toBeNull();
  });
  it('a pushed stick orbits, frame-rate independent, and stops the frame it centres', () => {
    const a = stepPad(createPadState(), pad([0, 0, 1, 0]), 1 / 60).orbit;
    const b = stepPad(createPadState(), pad([0, 0, 1, 0]), 1 / 30).orbit;
    expect(a.dx).toBeGreaterThan(0);
    expect(b.dx).toBeCloseTo(a.dx * 2, 9);
    const st = createPadState();
    stepPad(st, pad([0, 0, 1, 1]), 1 / 60);
    expect(orbitFor('split', stepPad(st, pad([0, 0, 0, 0]), 1 / 60))).toBeNull(); // no stuck orbit
  });
});

describe('control latch: follows the picture, keeps the old mapping mid-slide', () => {
  it('shared until the slide into the split finishes', () => {
    const c = createSplitControl();
    expect(c.step(null).ctl).toBe('shared');
    expect(c.step({ active: true, t: 0.3 }).ctl).toBe('shared');
    expect(c.step({ active: true, t: 0.99 }).ctl).toBe('shared');
    const r = c.step({ active: true, t: 1 });
    expect(r).toEqual({ ctl: 'split', changed: true });
    expect(c.step({ active: true, t: 1 }).changed).toBe(false);
  });
  it('split until the slide back has finished', () => {
    const c = createSplitControl();
    c.step({ active: true, t: 1 });
    expect(c.step({ active: true, t: 0.6 }).ctl).toBe('split'); // merging: previous mapping, no lurch
    expect(c.step({ active: true, t: 0.01 }).ctl).toBe('split');
    expect(c.step({ active: false, t: 0 })).toEqual({ ctl: 'shared', changed: true });
  });
  it('a slide that turns round keeps whatever it had', () => {
    const c = createSplitControl();
    c.step({ active: true, t: 0.5 }); c.step({ active: true, t: 0.2 });
    expect(c.ctl).toBe('shared');
  });
  it('reduced motion (t jumps) and the flag off', () => {
    const c = createSplitControl();
    expect(c.step({ active: true, t: 1 }).ctl).toBe('split');
    expect(c.step(undefined).ctl).toBe('shared'); // the split chunk went away: back to shared
  });
  it('reset (cat two leaves) is shared', () => {
    const c = createSplitControl();
    c.step({ active: true, t: 1 }); c.reset();
    expect(c.ctl).toBe('shared');
  });
});

describe('pads in the hub: disconnect and one pad', () => {
  const run = (hub, pads, opts) => hub.step(pads, { engaged: true, joinOpen: true, ...opts });
  it('pad two disconnecting mid-split: no orbit, no zoom, no throw', () => {
    const hub = createPadHub();
    const p0 = { ...pad([0, 0, 0, 0], [PAD_BUTTONS.START]), index: 0 }; const p1 = (ax) => ({ ...pad(ax, [PAD_BUTTONS.A]), index: 1 });
    run(hub, [p0]); run(hub, [p0, p1([0, 0, 0, 0])]);
    run(hub, [p0, { ...p1([0, 0, 0, 0]), buttons: p1().buttons.map(() => ({ pressed: false, value: 0 })) }]);
    const live = run(hub, [p0, { ...pad([0, 0, 1, 0]), index: 1 }]);
    expect(orbitFor('split', live.two)?.dx).toBeGreaterThan(0);
    const gone = run(hub, [p0]);
    expect(gone.two).toBeNull();
    expect(orbitFor('split', gone.two)).toBeNull();
    expect(gone.events.some((e) => e.type === 'lost' && e.slot === 1)).toBe(true);
  });
  it('one pad (cat two on the keyboard or absent): no pad-two output, cat one whole in split', () => {
    const hub = createPadHub();
    const p0 = { ...pad([0, 0, 1, 0]), index: 0 };
    const r = run(hub, [p0]);
    expect(r.two).toBeNull();
    expect(orbitFor('split', r.two)).toBeNull();
    expect(padForWalk(hub.padOf(0, [p0]), true, true).axes[2]).toBe(1);
  });
});
