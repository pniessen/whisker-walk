import { describe, it, expect } from 'vitest';
import { WORDS } from '../src/tutorialwords.js';
import { PAD_WORDS } from '../src/tv/padwords.js';

// A key or mouse word a pad player must never read.
export const KEYISH = /(^|[^\w])(E —|Press (E|Space|Esc|V|C|M|F|Enter)\b|Space|Esc|WASD|[Aa]rrow keys|Shift|Enter|[Cc]lick|[Ss]croll|[Mm]ove the mouse)\b/;

describe('tutorial lines: a keyboard word needs a pad form', () => {
  it('every line whose keys form names a key or the mouse has a pad form', () => {
    const missing = Object.entries(WORDS)
      .filter(([id, v]) => KEYISH.test(v.keys) && !Object.hasOwn(PAD_WORDS, id))
      .map(([id]) => id);
    expect(missing).toEqual([]);
  });
});
