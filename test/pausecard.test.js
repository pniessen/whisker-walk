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
    expect(html).toContain('>Keep walking</button>');
    expect(html).toContain('id="btn-end"');
    expect(html).not.toContain('Ready?');
    expect(pauseCardHtml({ welcome: null, touch: false, mode: 'paused' })).toContain('>Keep walking (click)</button>');
  });

  it('a walk picked up again says Welcome back! and Keep walking', () => {
    const html = pauseCardHtml({ welcome: 'Your walk is right where you left it.', touch: true, mode: 'back' });
    expect(html).toContain('<h1>Welcome back!</h1>');
    expect(html).toContain('Your walk is right where you left it.');
    expect(html).toContain('>Keep walking</button>');
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
    expect(overlay.innerHTML).toContain('>Keep walking</button>');
    expect(s.crossing).toBe(null);
  });
});
