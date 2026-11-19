import { describe, it, expect } from 'vitest';
import {
  pauseCardHtml, pauseCardFor, cardMode, resumeLabel, takeStartLines, TOUCH_START_HINT, TOUCH_HINT_WALKS,
} from '../src/game/walk.js';
import { createCrossing } from '../src/game/crossing.js';
import { CATALOG } from '../src/progression.js';

describe('the card behind a walk says what state the walk is in', () => {
  it('before the walk begins it asks Ready?', () => {
    const html = pauseCardHtml({ welcome: 'Hi', touch: false });
    expect(html).toContain('<h1>Ready?</h1>');
    expect(html).toContain('>Start exploring (click)</button>');
    expect(pauseCardHtml({ welcome: 'Hi', touch: true })).toContain('>Tap to explore</button>');
  });

  it('once the walk has begun it says Paused and offers Keep walking', () => {
    const html = pauseCardHtml({ welcome: null, touch: true, mode: 'paused' });
    expect(html).toContain('<h1>Paused</h1>');
    expect(html).toContain('>Keep exploring</button>');
    expect(html).toContain('id="btn-end"');
    expect(html).not.toContain('Ready?');
    expect(pauseCardHtml({ welcome: null, touch: false, mode: 'paused' })).toContain('>Keep exploring (click)</button>');
  });

  it('a walk picked up again says Welcome back! and Keep walking', () => {
    const html = pauseCardHtml({ welcome: 'Your walk is right where you left it.', touch: true, mode: 'back' });
    expect(html).toContain('<h1>Welcome back!</h1>');
    expect(html).toContain('Your walk is right where you left it.');
    expect(html).toContain('>Keep exploring</button>');
  });

  it('the buttons still hold plain text only (main.js routes clicks by id)', () => {
    for (const mode of ['ready', 'back', 'paused']) {
      for (const touch of [true, false]) {
        expect(resumeLabel(mode, touch)).not.toMatch(/[<>]/);
        const html = pauseCardHtml({ welcome: null, touch, mode });
        expect(html).toMatch(/<button id="btn-resume" class="primary">[^<]+<\/button>/);
      }
    }
  });

  it('cardMode follows the session: ready, then back for a resumed walk, then paused for good', () => {
    expect(cardMode({})).toBe('ready');
    expect(cardMode({ resumed: true })).toBe('back');
    expect(cardMode({ resumed: true, started: true })).toBe('paused');
    expect(cardMode({ started: true })).toBe('paused');
    expect(cardMode(null)).toBe('ready');
  });

  it('pauseCardFor drops the welcome line once the walk has begun', () => {
    const s = { welcome: 'Welcome home!', portrait: null };
    expect(pauseCardFor(s, true)).toContain('Welcome home!');
    s.started = true;
    expect(pauseCardFor(s, true)).not.toContain('Welcome home!');
    expect(pauseCardFor(s, true)).toContain('<h1>Paused</h1>');
  });
});

describe('a touch walk that starts at once', () => {
  it('its lines are handed over once', () => {
    const s = { startLines: ['Welcome home!', TOUCH_START_HINT] };
    expect(takeStartLines(s)).toEqual(['Welcome home!', TOUCH_START_HINT]);
    expect(takeStartLines(s)).toEqual([]);
    expect(takeStartLines(null)).toEqual([]);
    expect(TOUCH_HINT_WALKS).toBe(3);
  });

  // 2026-11-15, guided-first-walk design (section 8): the hint was "Left thumb
  // moves your cat…", which is wrong in left-handed mode. It names no side now.
  it('the start hint says how to walk without saying left or right', () => {
    expect(TOUCH_START_HINT).toBe('Push the circle to walk. Drag to look around.');
    expect(TOUCH_START_HINT).not.toMatch(/left|right/i);
  });
});

describe('the crossing card puts the right card back', () => {
  it('Keep exploring mid-walk restores the Paused card, not Ready?', () => {
    const overlay = { innerHTML: '' };
    const s = { welcome: 'Welcome home!', started: true, race: null, quest: null, carry: { mouth: { held: null } } };
    const crossing = createCrossing({
      getSession: () => s, overlay, hud: { toast() {} },
      releaseControl: () => {}, resumeWalk: () => {}, endWalk: () => {},
      getIsTouch: () => true, getEdition: () => 'canon', catalog: CATALOG,
      setTimeout: (fn) => { fn(); return 0; },
    });
    s.crossing = { to: 'moor', name: 'The Moor' };
    crossing.cancel();
    expect(overlay.innerHTML).toContain('<h1>Paused</h1>');
    expect(overlay.innerHTML).toContain('>Keep exploring</button>');
    expect(s.crossing).toBe(null);
  });
});

// 2026-11-15, guided first walk (design section 8): the pause card of a walk
// with a lesson has a third, quiet button; the first walk's Ready? card on a
// keyboard shows one line of controls, and the pause card keeps the list.
describe('a lesson on the card', () => {
  it('no lesson: the card is exactly what it was', () => {
    for (const touch of [true, false]) {
      for (const mode of ['ready', 'back', 'paused']) {
        expect(pauseCardHtml({ welcome: 'Hi', touch, mode, skip: false, oneLine: false })).toBe(pauseCardHtml({ welcome: 'Hi', touch, mode }));
        expect(pauseCardHtml({ welcome: 'Hi', touch, mode })).not.toContain('btn-skip-lesson');
      }
    }
    const s = { started: true, welcome: null, portrait: null, lesson: null };
    expect(pauseCardFor(s, true)).toBe(pauseCardHtml({ welcome: null, touch: true, mode: 'paused' }));
  });

  it('Skip the lesson: there while the lesson can be skipped, gone once it is skipped or finished', () => {
    const lesson = { kind: 'first', finished: false, skipped: false };
    const s = { started: true, welcome: null, portrait: null, lesson };
    const html = pauseCardFor(s, true);
    expect(html).toContain('<button id="btn-skip-lesson" class="quiet">Skip the lesson</button>');
    expect(html.indexOf('btn-skip-lesson')).toBeGreaterThan(html.indexOf('btn-end')); // the third button, after the two
    expect(html).toContain('id="btn-resume"');
    lesson.skipped = true;
    expect(pauseCardFor(s, true)).not.toContain('btn-skip-lesson');
    lesson.skipped = false; lesson.finished = true;
    expect(pauseCardFor(s, true)).not.toContain('btn-skip-lesson');
    expect(pauseCardFor({ ...s, lesson: { kind: 'camp', finished: false, skipped: false } }, true)).toContain('btn-skip-lesson');
  });

  it('the first walk\'s Ready? card on a keyboard shows one line, not eight; the pause card keeps the list', () => {
    const lesson = { kind: 'first', finished: false, skipped: false };
    const hint = (html) => html.match(/<p class="controls-hint">([\s\S]*?)<\/p>/)[1];
    const ready = pauseCardFor({ started: false, resumed: false, welcome: null, portrait: null, lesson }, false);
    expect(hint(ready)).toBe('<span class="hint-seg">Arrow keys to walk</span>');
    const paused = pauseCardFor({ started: true, welcome: null, portrait: null, lesson }, false);
    expect(hint(paused)).toContain('Arrows move');
    expect(hint(paused).match(/hint-seg/g)).toHaveLength(8);
    // an ordinary walk's Ready? card keeps its list
    expect(hint(pauseCardFor({ started: false, welcome: null, portrait: null, lesson: null }, false)).match(/hint-seg/g)).toHaveLength(8);
  });
});
