import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { keysToPad } from '../src/tv/padwords.js';
import { plainify } from '../src/tv/glyphs.js';
import { tvState, setTv, resetTv } from '../src/tvseam.js';
import { line } from '../src/tutorialwords.js';

// Every string literal in src/ that starts a prompt with "E — " must come out in the pad's words.
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? (f === 'tv' ? [] : walk(p)) : p.endsWith('.js') ? [p] : [];
});
const PROMPTS = [];
for (const f of walk('src')) {
  for (const m of readFileSync(f, 'utf8').matchAll(/(['"`])(E\s+—\s[^'"`\n]*)\1/g)) PROMPTS.push(m[2]);
}

describe('keysToPad: the net under every hard-coded key', () => {
  it('finds the prompts (guards the scan itself)', () => { expect(PROMPTS.length).toBeGreaterThan(30); });
  it('no "E — " prompt reaches the pad player with the E key', () => {
    for (const p of PROMPTS) {
      const out = keysToPad(p);
      expect(out, p).toContain('⟦interact⟧');
      expect(out, p).not.toMatch(/^E\b/);
    }
  });
  it('turns the other key words into buttons', () => {
    expect(keysToPad('Press Esc when you want to go home.')).toBe('Press ⟦pause⟧ when you want to go home.');
    expect(keysToPad('press Space to pounce!')).toBe('press ⟦jump⟧ to pounce!');
    expect(keysToPad('click to go here')).toBe('press ⟦confirm⟧ to go here');
    expect(keysToPad('Click Explore!')).toBe('Press ⟦confirm⟧ on Explore!');
    expect(keysToPad('←↑↓→/WASD move')).toBe('⟦move⟧ move');
    expect(keysToPad('Eat the Escargot')).toBe('Eat the Escargot');
  });
  it('plain symbols for a toast', () => {
    expect(plainify(keysToPad('E — pet Mochi'), 'ps')).toBe('□ — pet Mochi');
    expect(plainify(keysToPad('E — pet Mochi'), 'xbox')).toBe('X — pet Mochi');
  });
});

describe('the hint lines follow the last input, live', () => {
  beforeEach(() => resetTv());
  afterEach(() => resetTv());
  it('a line with no pad form says the pad button once the pad is used, and the key again after a key', () => {
    setTv({ fix: keysToPad, text: (s) => plainify(s, 'ps'), padLine: () => null });
    expect(line('hint.sniff')).toBe('You smell something! Follow the paw prints.');
    setTv({ input: 'pad' });
    expect(tvState.input).toBe('pad');
    // a keys-only line with a key in it, borrowed from the table through the fix
    expect(line('hint.home')).not.toMatch(/\bEsc\b/);
    setTv({ input: 'keys' });
    expect(line('hint.home')).toMatch(/\bEsc\b/);
  });
});

describe('TV mode never takes the screen by itself', () => {
  it('no source file calls requestFullscreen (the browser banner "press and hold esc" comes only from that call)', () => {
    for (const f of walk('src')) expect(readFileSync(f, 'utf8'), f).not.toMatch(/requestFullscreen/i);
    for (const f of readdirSync('src/tv')) expect(readFileSync(join('src/tv', f), 'utf8'), f).not.toMatch(/requestFullscreen/i);
  });
});
