import { describe, it, expect, afterEach } from 'vitest';
import { pauseCardHtml } from '../src/game/walk.js';
import { setTv, resetTv } from '../src/tvseam.js';
import { padLine } from '../src/tv/padwords.js';
import { glyphify, plainify } from '../src/tv/glyphs.js';

// The Ready? and pause cards, with the pad as the input (TV mode) and without.
const KEYS_LIST = ['Arrows/WASD move', 'Shift creep', 'Space jump/climb/pounce', 'E do it/sniff', 'V meow', 'C photo', '+/− or wheel zoom', 'M sound', 'Esc pause'];
const seg = (t) => `<span class="hint-seg">${t}</span>`;
const padOn = () => setTv({ on: true, input: 'pad', padLine, text: (s) => plainify(s, 'ps'), html: (s) => glyphify(s, 'ps') });

afterEach(() => resetTv());

describe('the Ready? and pause cards', () => {
  it('with TV mode off they are exactly today\'s words', () => {
    const ready = pauseCardHtml({ welcome: null, touch: false, mode: 'ready' });
    expect(ready).toContain('<button id="btn-resume" class="primary">Start exploring (click)</button>');
    expect(ready).toContain(`<p class="controls-hint">${KEYS_LIST.map(seg).join(' · ')}</p>`);
    const paused = pauseCardHtml({ welcome: null, touch: false, mode: 'paused' });
    expect(paused).toContain('Keep exploring (click)</button>');
    expect(pauseCardHtml({ welcome: null, touch: false, mode: 'ready', oneLine: true })).toContain(`<p class="controls-hint">${seg('Arrow keys to walk')}</p>`);
  });

  it('with the keyboard as the input (TV mode on) they are still today\'s words', () => {
    setTv({ on: true, input: 'keys', padLine, text: (s) => plainify(s, 'ps'), html: (s) => glyphify(s, 'ps') });
    expect(pauseCardHtml({ welcome: null, touch: false, mode: 'ready' })).toContain('Start exploring (click)');
  });

  it('with the pad as the input the controls list is the pad list, in pictures, and no key is named', () => {
    padOn();
    const h = pauseCardHtml({ welcome: null, touch: false, mode: 'paused' });
    const hint = h.slice(h.indexOf('<p class="controls-hint">'));
    expect(hint).toContain('<svg');
    expect(hint).toContain('jump/climb/pounce');
    expect(hint).not.toMatch(/WASD|Shift|Space|Esc|⟦/);
    expect(h).toMatch(/<button id="btn-resume" class="primary">Keep exploring <svg [^]*<\/svg><\/button>/);
    expect(h).not.toContain('(click)');
  });

  it('the Ready? card says to start with the confirm button, and its one-liner is the stick', () => {
    padOn();
    const h = pauseCardHtml({ welcome: null, touch: false, mode: 'ready', oneLine: true });
    expect(h).toMatch(/Start exploring <svg /);
    expect(h).toMatch(/<span class="hint-seg">Push <svg [^]*<\/svg> to walk<\/span>/);
    expect(h).not.toContain('Arrow keys');
  });

  it('a touch card is not changed by a pad that was used earlier on the same device only when it is still the input', () => {
    padOn();
    setTv({ input: 'touch' });
    expect(pauseCardHtml({ welcome: null, touch: true, mode: 'ready' })).toContain('Tap to explore');
  });
});
