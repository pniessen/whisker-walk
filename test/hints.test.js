// The hint engine (src/hints.js): design section 4.
import { describe, it, expect } from 'vitest';
import { createHints, HINTS, HINT_IDS, HINT_SHOW_S, HINT_GAP_S, HINT_COUNT_MAX, hintMax } from '../src/hints.js';
import { line } from '../src/tutorialwords.js';

// A second walk, 100 s in, with nothing going on: no polled hint is due
// except the ones a test switches on.
const quiet = (over = {}) => ({
  t: 0, walkNo: 2, room: false, looked: true, stalking: false, canJump: false, perched: false, critterNear: false,
  camera: false, idleOpen: 0, toy: false, bats: 0, strayFar: false, nearBox: false, inBox: false, helpInView: false,
  inWater: false, carrying: false, challenge: false, findNear: false, ...over,
});

function rig({ on = true, counts = {} } = {}) {
  const shown = [];
  let up = null;
  const state = { on };
  const h = createHints({
    count: (id) => counts[id] ?? 0,
    countUp: (id) => { counts[id] = (counts[id] ?? 0) + 1; },
    enabled: () => state.on,
    show: (s) => { up = s.id; shown.push(s); },
    hide: () => { up = null; },
  });
  return { h, shown, counts, state, up: () => up };
}

describe('the hint table', () => {
  // The controls review (2026-11-19) added two: the yarn ball in the mouth,
  // and T's line for a keyboard (a toast, counted here, never polled).
  it('is the design\'s twenty and the yarn pair, in order, with its limits', () => {
    expect(HINTS.map((h) => [h.id, h.max])).toEqual([
      ['look', 2], ['creep', 2], ['jump', 2], ['hop', 1], ['photo', 2], ['frame', 2], ['yarn', 1], ['bat', 1],
      ['yarn-carry', 1], ['find', 1], ['find-kept', 1], ['map', 1],
      ['call', 1], ['sniff', 2], ['box', 1], ['help', 1], ['hiss', 1], ['dog', 1], ['swim', 1], ['carry', 1],
      ['home', 2], ['chat', 1], ['rival', 1], ['stranger', 1], ['tkey', 3],
    ]);
    expect(new Set(HINT_IDS).size).toBe(25);
    expect(HINTS.find((h) => h.id === 'yarn').ring).toBeNull(); // no button to point at
    expect(HINTS.find((h) => h.id === 'tkey').when).toBeUndefined();
    for (const h of HINTS) expect(h.max).toBeLessThanOrEqual(HINT_COUNT_MAX);
    expect(hintMax('look')).toBe(2);
    expect(hintMax('nope')).toBe(0);
  });

  it('the words are the design\'s', () => {
    expect(line('hint.look', { touch: true })).toBe('Drag here to look around.');
    expect(line('hint.look', { touch: false })).toBe('Move the mouse to look around.');
    expect(line('hint.sniff', { touch: true })).toBe('You smell something! Follow the paw prints.');
    expect(line('hint.home', { touch: true })).toBe('Tap ⏸ when you want to go home.');
    expect(line('hint.home', { touch: false })).toBe('Press Esc when you want to go home.');
    expect(line('hint.help', { touch: false })).toBe('Someone needs help. Walk up and press E.');
    expect(line('hint.hiss', { name: 'Pepper' })).toBe('Pepper is cross today. Try again next time.');
  });
});

describe('polled triggers', () => {
  const cases = [
    ['look', { t: 15, looked: false }, { t: 14, looked: false }],
    ['jump', { canJump: true }, {}],
    ['hop', { perched: true }, {}],
    ['photo', { critterNear: true }, { critterNear: true, walkNo: 1 }],
    ['frame', { camera: true }, {}],
    ['yarn', { yarnNear: true, bats: 0 }, { yarnNear: true, bats: 1 }],
    ['bat', { toy: true, bats: 0 }, { toy: true, bats: 1 }],
    ['yarn-carry', { yarnHeld: true }, {}],
    ['call', { strayFar: true }, { strayFar: true, walkNo: 1 }],
    ['box', { nearBox: true }, { nearBox: true, inBox: true }],
    ['help', { helpInView: true }, {}],
    ['swim', { inWater: true }, {}],
    ['carry', { carrying: true }, {}],
    ['home', { t: 90 }, { t: 89 }],
    ['chat', { room: true, t: 20 }, { room: false, t: 20 }],
    ['stranger', { challenge: true }, {}],
  ];
  for (const [id, yes, no] of cases) {
    it(`${id} goes up at its trigger and not before`, () => {
      const a = rig();
      a.h.update(0.25, quiet(no));
      expect(a.up()).toBe(null);
      a.h.update(0.25, quiet(yes));
      expect(a.up()).toBe(id);
      expect(a.counts[id]).toBe(1);
    });
  }

  it('walk one gets none of the "walk two" hints', () => {
    const a = rig();
    a.h.update(1, quiet({ walkNo: 1, t: 200, looked: false, critterNear: true, idleOpen: 9, strayFar: true }));
    expect(a.up()).toBe(null);
  });
});

describe('event triggers', () => {
  for (const id of ['creep', 'sniff', 'hiss', 'dog', 'rival']) {
    it(`${id} goes up when offered, never from the facts alone`, () => {
      const a = rig();
      a.h.update(1, quiet());
      expect(a.up()).toBe(null);
      expect(a.h.offer(id, { name: 'Pepper' })).toBe(true);
      expect(a.up()).toBe(id);
      expect(a.shown[0].slots).toEqual({ name: 'Pepper' });
    });
  }
  it('an unknown hint is refused', () => {
    const a = rig();
    expect(a.h.offer('nope')).toBe(false);
    expect(a.h.offer('__proto__')).toBe(false);
  });
});

describe('the rules', () => {
  it('never two at once', () => {
    const a = rig();
    expect(a.h.offer('dog')).toBe(true);
    expect(a.h.offer('hiss', { name: 'Pepper' })).toBe(false);
    a.h.update(0.25, quiet({ inWater: true, carrying: true }));
    expect(a.up()).toBe('dog');
    expect(a.shown).toHaveLength(1);
    expect(a.counts.hiss).toBeUndefined(); // a hint that could not go up is not counted
  });

  it('goes away after twelve seconds', () => {
    const a = rig();
    a.h.offer('dog');
    a.h.update(HINT_SHOW_S - 0.5, quiet());
    expect(a.up()).toBe('dog');
    a.h.update(0.6, quiet());
    expect(a.up()).toBe(null);
  });

  it('goes away when the child does the thing', () => {
    const a = rig();
    a.h.update(0.25, quiet({ canJump: true }));
    expect(a.up()).toBe('jump');
    a.h.update(0.25, quiet({ canJump: true, perched: true }));
    expect(a.up()).toBe(null);
    // and a thing that is an event
    const b = rig();
    b.h.update(0.25, quiet({ strayFar: true }));
    expect(b.up()).toBe('call');
    b.h.done('dog'); // some other hint's thing: stays
    expect(b.up()).toBe('call');
    b.h.done('call');
    expect(b.up()).toBe(null);
  });

  it('at most one new hint a minute', () => {
    const a = rig();
    a.h.offer('dog');
    a.h.update(HINT_SHOW_S + 1, quiet());
    expect(a.up()).toBe(null);
    expect(a.h.offer('hiss')).toBe(false);
    a.h.update(HINT_GAP_S - HINT_SHOW_S - 2, quiet({ inWater: true }));
    expect(a.up()).toBe(null);
    a.h.update(1.5, quiet({ inWater: true }));
    expect(a.up()).toBe('swim');
  });

  it('each hint stops at its limit', () => {
    const a = rig();
    for (let i = 0; i < 5; i++) {
      a.h.update(0.25, quiet({ canJump: true }));
      a.h.update(HINT_GAP_S + 1, quiet()); // times out, and the minute passes
    }
    expect(a.shown.filter((s) => s.id === 'jump')).toHaveLength(2);
    expect(a.counts.jump).toBe(2);
    // a count already at its limit on the save: never shown
    const b = rig({ counts: { dog: 1, look: 3 } });
    expect(b.h.offer('dog')).toBe(false);
    b.h.update(1, quiet({ t: 30, looked: false }));
    expect(b.up()).toBe(null);
  });

  it('"Show tips" off shows none, and puts away the one that is up', () => {
    const a = rig({ on: false });
    expect(a.h.offer('dog')).toBe(false);
    a.h.update(1, quiet({ inWater: true, perched: true, t: 200 }));
    expect(a.shown).toHaveLength(0);
    expect(a.counts).toEqual({});
    const b = rig();
    b.h.offer('dog');
    b.state.on = false;
    b.h.update(0.25, quiet());
    expect(b.up()).toBe(null);
  });

  it('never during a guided step (setBlocked, for the guided walk)', () => {
    const a = rig();
    a.h.offer('dog');
    a.h.setBlocked(true);
    expect(a.up()).toBe(null); // the one on screen gives way
    expect(a.h.offer('hiss')).toBe(false);
    a.h.update(HINT_GAP_S + 1, quiet({ inWater: true }));
    expect(a.up()).toBe(null);
    a.h.setBlocked(false);
    a.h.update(0.25, quiet({ inWater: true }));
    expect(a.up()).toBe('swim');
  });

  it('the first that is true wins, in the table\'s order', () => {
    const a = rig();
    a.h.update(0.25, quiet({ inWater: true, carrying: true, perched: true }));
    expect(a.up()).toBe('hop');
  });

  it('end() leaves nothing on screen', () => {
    const a = rig();
    a.h.offer('dog');
    a.h.end();
    expect(a.up()).toBe(null);
    expect(a.h.showing).toBe(null);
  });
});

describe('find, find-kept and map', () => {
  it('are in the table once each, and none has a ring', () => {
    for (const id of ['find', 'find-kept', 'map']) {
      expect(HINT_IDS).toContain(id);
      expect(hintMax(id)).toBe(1);
      expect(HINTS.find((h) => h.id === id).ring).toBeNull();
    }
    expect(HINTS.find((h) => h.id === 'find-kept').soon).toBe(true);
    expect(HINTS.find((h) => h.id === 'map').when).toBeUndefined();
  });

  it('a soon hint ignores the gap; a plain event hint does not', () => {
    const r = rig();
    expect(r.h.offer('sniff')).toBe(true);
    r.h.update(HINT_SHOW_S + 0.1, quiet()); // gone
    r.h.update(5 - HINT_SHOW_S - 0.1 + HINT_SHOW_S, quiet());
    expect(r.up()).toBeNull();
    expect(r.h.offer('box')).toBe(false); // plain: waits the gap
    expect(r.h.offer('find-kept')).toBe(true);
    expect(r.up()).toBe('find-kept');
  });

  it('a soon hint still obeys max, tips off and the one-at-a-time rule', () => {
    const r = rig({ counts: { 'find-kept': 1 } });
    expect(r.h.offer('find-kept')).toBe(false);
    const r2 = rig({ on: false });
    expect(r2.h.offer('find-kept')).toBe(false);
    const r3 = rig();
    r3.h.offer('sniff');
    expect(r3.h.offer('find-kept')).toBe(false);
  });

  it('after a soon hint the gap starts again for the others', () => {
    const r = rig();
    r.h.offer('sniff');
    r.h.update(HINT_SHOW_S + 0.1, quiet());
    r.h.offer('find-kept');
    r.h.update(HINT_SHOW_S + 0.1, quiet());
    expect(r.h.offer('box')).toBe(false);
    r.h.update(HINT_GAP_S, quiet());
    expect(r.h.offer('box')).toBe(true);
  });

  it('a polled find goes up when findNear is true on walk one, and away when it turns false', () => {
    const r = rig();
    r.h.update(0.25, quiet({ walkNo: 1, findNear: true }));
    expect(r.up()).toBe('find');
    r.h.update(0.25, quiet({ walkNo: 1, findNear: false }));
    expect(r.up()).toBeNull();
  });
});
