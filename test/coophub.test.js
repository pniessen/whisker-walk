import { describe, it, expect } from 'vitest';
import { createPadHub, padForWalk } from '../src/coop/padhub.js';
import { PAD_BUTTONS } from '../src/gamepadinput.js';

// Couch play, milestone 1: who holds which pad. Fake pads only (a real pair of
// DualSenses is the owner's check, docs/superpowers/plans/2026-11-22-couch-coop.md M6).
const ID = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
const mk = (index, down = [], axes = [0, 0, 0, 0]) => ({
  index, connected: true, mapping: 'standard', id: ID, axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })),
});
const A = PAD_BUTTONS.A, L1 = PAD_BUTTONS.L1, R1 = PAD_BUTTONS.R1, START = PAD_BUTTONS.START;
const types = (r) => r.events.map((e) => `${e.type}:${e.slot}`);

describe('seating', () => {
  it('seats nobody until a pad shows life, then the first pad to press is cat one', () => {
    const hub = createPadHub();
    expect(types(hub.step([mk(0), mk(1)]))).toEqual([]);
    expect(hub.seats()).toEqual([null, null]);
    const r = hub.step([mk(0), mk(1, [PAD_BUTTONS.X])]); // the SECOND pad of the browser's list pressed first
    expect(types(r)).toEqual(['seat:0']);
    expect(hub.seats()).toEqual([{ index: 1, lost: false }, null]);
  });

  it('a stick pushed firmly counts as life; a stick at rest does not', () => {
    const hub = createPadHub();
    hub.step([mk(0, [], [0.2, 0.1, 0, 0])]);
    expect(hub.seats()[0]).toBeNull();
    hub.step([mk(0, [], [0, -0.9, 0, 0])]);
    expect(hub.seats()[0]).toEqual({ index: 0, lost: false });
  });

  it('the second pad joins with A, only while joining is open, and only once cat one is seated', () => {
    const hub = createPadHub();
    // A on the only pad seats cat one; it never also joins
    expect(types(hub.step([mk(0, [A]), mk(1)], { joinOpen: true }))).toEqual(['seat:0']);
    hub.step([mk(0), mk(1)]);
    expect(types(hub.step([mk(0), mk(1, [PAD_BUTTONS.B])], { joinOpen: true }))).toEqual([]); // not A
    expect(types(hub.step([mk(0), mk(1, [A])], { joinOpen: false }))).toEqual([]); // joining closed
    hub.step([mk(0), mk(1)]);
    expect(types(hub.step([mk(0), mk(1, [A])], { joinOpen: true }))).toEqual(['join:1']);
    expect(hub.seats()).toEqual([{ index: 0, lost: false }, { index: 1, lost: false }]);
  });

  it('cat one\'s own pad pressing A does not take the second seat', () => {
    const hub = createPadHub();
    hub.step([mk(0, [A])], { joinOpen: true });
    hub.step([mk(0)], { joinOpen: true });
    expect(types(hub.step([mk(0, [A])], { joinOpen: true }))).toEqual([]);
  });

  it('two pads with the same id string are told apart by seat, not by id', () => {
    const hub = createPadHub();
    hub.step([mk(0, [A]), mk(1)]);
    hub.step([mk(0), mk(1)]);
    hub.step([mk(0), mk(1, [A])], { joinOpen: true });
    const r = hub.step([mk(0, [], [0, -1, 0, 0]), mk(1, [], [1, 0, 0, 0])], { engaged: true });
    expect(r.two.move.x).toBeGreaterThan(0.9); // seat two follows pad index 1 only
    expect(r.two.move.z).toBeCloseTo(0, 5);
  });

  it('the joining press never also hops, and a button held at the join is ignored until let go', () => {
    const hub = createPadHub();
    hub.step([mk(0, [A]), mk(1)]);
    hub.step([mk(0), mk(1)]);
    hub.step([mk(0), mk(1, [A])], { joinOpen: true });
    let r = hub.step([mk(0), mk(1, [A])], { engaged: true }); // still held
    expect(r.two.actions).toEqual([]);
    hub.step([mk(0), mk(1)], { engaged: true });
    r = hub.step([mk(0), mk(1, [A])], { engaged: true });
    expect(r.two.actions).toContain('pounce');
  });
});

describe('hot-plug', () => {
  const seated = () => {
    const hub = createPadHub();
    hub.step([mk(0, [A]), mk(1)]);
    hub.step([mk(0), mk(1)]);
    hub.step([mk(0), mk(1, [A])], { joinOpen: true });
    hub.step([mk(0), mk(1)]);
    return hub;
  };

  it('a pad that goes away keeps its seat, marked lost, and says so once', () => {
    const hub = seated();
    expect(types(hub.step([mk(0)]))).toEqual(['lost:1']);
    expect(types(hub.step([mk(0)]))).toEqual([]);
    expect(hub.seats()).toEqual([{ index: 0, lost: false }, { index: 1, lost: true }]);
  });

  it('a pad that is not seated takes the lost seat back with any press, even under another index', () => {
    const hub = seated();
    hub.step([mk(0)]);
    expect(types(hub.step([mk(0), mk(3)]))).toEqual([]); // plugged in, no press yet
    expect(types(hub.step([mk(0), mk(3, [PAD_BUTTONS.Y])]))).toEqual(['back:1']);
    expect(hub.seats()[1]).toEqual({ index: 3, lost: false });
  });

  it('cat one\'s own pad pressing something does not take cat two\'s lost seat', () => {
    const hub = seated();
    hub.step([mk(0)]);
    expect(types(hub.step([mk(0, [PAD_BUTTONS.Y])]))).toEqual([]);
    expect(hub.seats()[1].lost).toBe(true);
  });

  it('with both pads gone, cat one\'s seat is won back first', () => {
    const hub = seated();
    expect(types(hub.step([]))).toEqual(['lost:0', 'lost:1']);
    expect(types(hub.step([mk(5, [A])]))).toEqual(['back:0']);
    expect(types(hub.step([mk(5), mk(6, [A])]))).toEqual(['back:1']);
  });

  it('a pad that returns on its old index also needs a press: seats are never reshuffled silently', () => {
    const hub = seated();
    hub.step([mk(0)]);
    hub.step([mk(0), mk(1)]);
    expect(hub.seats()[1].lost).toBe(true);
    expect(types(hub.step([mk(0), mk(1, [A])]))).toEqual(['back:1']);
  });

  it('release gives a seat back, and the next A joins again', () => {
    const hub = seated();
    hub.release(1);
    expect(hub.seats()[1]).toBeNull();
    expect(types(hub.step([mk(0), mk(1, [A])], { joinOpen: true }))).toEqual(['join:1']);
  });
});

describe('buttons', () => {
  const seatedTwo = () => {
    const hub = createPadHub();
    hub.step([mk(0, [A]), mk(1)]);
    hub.step([mk(0), mk(1)]);
    hub.step([mk(0), mk(1, [A])], { joinOpen: true });
    hub.step([mk(0), mk(1)]);
    return hub;
  };

  it('L1 and R1 on either pad are quarter turns, one event per press', () => {
    const hub = seatedTwo();
    expect(hub.step([mk(0, [L1]), mk(1)]).events).toEqual([{ type: 'turn', slot: 0, dir: 1 }]);
    expect(hub.step([mk(0, [L1]), mk(1)]).events).toEqual([]); // held
    expect(hub.step([mk(0), mk(1, [R1])]).events).toEqual([{ type: 'turn', slot: 1, dir: -1 }]);
  });

  it('Start on either pad is reported with its slot', () => {
    const hub = seatedTwo();
    expect(hub.step([mk(0), mk(1, [START])]).events).toEqual([{ type: 'start', slot: 1 }]);
    hub.step([mk(0), mk(1)]);
    expect(hub.step([mk(0, [START]), mk(1)]).events).toEqual([{ type: 'start', slot: 0 }]);
  });

  it('cat two\'s pad: stick moves, A hops, B meows, Y is photo, X is interact; nothing while the walk is not live', () => {
    const hub = seatedTwo();
    let r = hub.step([mk(0), mk(1, [A, PAD_BUTTONS.B, PAD_BUTTONS.Y, PAD_BUTTONS.X], [0, -1, 0, 0])], { engaged: true });
    expect(r.two.move.z).toBeLessThan(-0.9);
    expect(r.two.actions).toEqual(expect.arrayContaining(['pounce', 'meow', 'camera', 'interact']));
    hub.step([mk(0), mk(1, [], [0, -1, 0, 0])], { engaged: true });
    r = hub.step([mk(0), mk(1, [A], [0, -1, 0, 0])], { engaged: false });
    expect(r.two.move).toBeNull(); // the stick it was holding is let go once
    expect(r.two.actions).toEqual([]);
  });
});

describe('what cat one\'s walk code is given', () => {
  it('in a walk the right stick and the shoulder buttons are taken out, and the browser\'s snapshot is untouched', () => {
    const pad = mk(0, [L1, R1, A], [0.5, -0.5, 1, 1]);
    const out = padForWalk(pad, true);
    expect(out.axes).toEqual([0.5, -0.5, 0, 0]);
    expect(out.buttons[L1]).toBe(false);
    expect(out.buttons[R1]).toBe(false);
    expect(out.buttons[A].pressed).toBe(true);
    expect(pad.axes).toEqual([0.5, -0.5, 1, 1]);
    expect(pad.buttons[L1].pressed).toBe(true);
    expect(out.id).toBe(ID);
  });

  it('in a menu, or with no pad, it is handed through whole', () => {
    const pad = mk(0, [L1], [0, 0, 1, 0]);
    expect(padForWalk(pad, false)).toBe(pad);
    expect(padForWalk(undefined, true)).toBeUndefined();
  });
});
