import { describe, it, expect } from 'vitest';
import { GLYPHS, TOKEN_GLYPH, TOKENS, padKind, glyphify, plainify } from '../src/tv/glyphs.js';

const CHROME_PS = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
const CHROME_XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const FIREFOX_PS = '054c-0ce6-Wireless Controller';

describe('padKind', () => {
  it('PlayStation for a Sony pad, however its id is spelled', () => {
    expect(padKind({ id: CHROME_PS, vendor: '054c' })).toBe('ps');
    expect(padKind({ id: CHROME_PS })).toBe('ps');
    expect(padKind(CHROME_PS)).toBe('ps');
    expect(padKind({ id: FIREFOX_PS })).toBe('ps');
    expect(padKind({ id: 'PS4 Controller', vendor: '054C' })).toBe('ps');
    expect(padKind({ id: 'DualShock 4' })).toBe('ps');
  });
  it('Xbox for any other pad', () => {
    expect(padKind({ id: CHROME_XBOX, vendor: '045e' })).toBe('xbox');
    expect(padKind({ id: 'Some Pad (STANDARD GAMEPAD Vendor: 1234 Product: 5678)', vendor: '1234' })).toBe('xbox');
  });
  it('no pad reads as PlayStation, and junk never throws', () => {
    expect(padKind(null)).toBe('ps');
    expect(padKind(undefined)).toBe('ps');
    expect(() => padKind({ id: 5 })).not.toThrow();
  });
});

describe('a Nintendo pad (letters swapped)', () => {
  it('is its own kind, and each token shows the letter at its own position', () => {
    expect(padKind({ id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', vendor: '057e' })).toBe('nin');
    expect(padKind({ id: '057e-2009-Pro Controller' })).toBe('nin');
    expect(plainify('⟦jump⟧ ⟦meow⟧ ⟦interact⟧ ⟦photo⟧', 'nin')).toBe('B A Y X');
    expect(glyphify('⟦jump⟧', 'nin')).toContain('>B<');
    expect(Object.keys(TOKEN_GLYPH.nin).sort()).toEqual([...TOKENS].sort());
  });
});

describe('the pictures', () => {
  it('every token has a picture on both kinds of pad', () => {
    for (const kind of ['ps', 'xbox']) {
      expect(Object.keys(TOKEN_GLYPH[kind]).sort()).toEqual([...TOKENS].sort());
      for (const t of TOKENS) expect(GLYPHS[kind][TOKEN_GLYPH[kind][t]], `${kind} ${t}`).toMatch(/^<svg /);
    }
  });
  it('each picture is small (400 bytes at most) and has no script or external reference', () => {
    for (const kind of ['ps', 'xbox']) {
      for (const [name, s] of Object.entries(GLYPHS[kind])) {
        expect(s.length, `${kind} ${name}`).toBeLessThanOrEqual(400);
        expect(s).not.toMatch(/<script|href=|on\w+=/i);
      }
    }
  });
  it('the PlayStation set has the named buttons and the Xbox set its own', () => {
    expect(Object.keys(GLYPHS.ps)).toEqual(expect.arrayContaining(['cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'options', 'create', 'dpad', 'lstick', 'rstick']));
    expect(Object.keys(GLYPHS.xbox)).toEqual(expect.arrayContaining(['a', 'b', 'x', 'y', 'lb', 'rb', 'menu', 'view', 'dpad', 'lstick', 'rstick']));
  });
  it('the walk map: jump is Cross/A, interact Square/X, meow Circle/B, photo Triangle/Y', () => {
    expect(TOKEN_GLYPH.ps).toMatchObject({ jump: 'cross', interact: 'square', meow: 'circle', photo: 'triangle', confirm: 'cross', back: 'circle' });
    expect(TOKEN_GLYPH.xbox).toMatchObject({ jump: 'a', interact: 'x', meow: 'b', photo: 'y', confirm: 'a', back: 'b' });
  });
});

describe('glyphify and plainify', () => {
  it('swaps a token for its picture and leaves no ⟦ behind', () => {
    const h = glyphify('Press ⟦jump⟧ to jump up.', 'ps');
    expect(h).toContain(GLYPHS.ps.cross);
    expect(h).not.toContain('⟦');
    expect(glyphify('⟦jump⟧', 'xbox')).toContain(GLYPHS.xbox.a);
  });
  it('escapes everything else, a name included', () => {
    const h = glyphify('<script>alert(1)</script> ⟦meow⟧ & "x"', 'ps');
    expect(h).not.toContain('<script>');
    expect(h).toContain('&lt;script&gt;');
    expect(h).toContain('&amp;');
  });
  it('an unknown token degrades to its plain word and never throws', () => {
    expect(glyphify('hold ⟦nonsense⟧ now', 'ps')).toBe('hold nonsense now');
    expect(plainify('hold ⟦nonsense⟧ now', 'ps')).toBe('hold nonsense now');
    expect(() => glyphify(null)).not.toThrow();
    expect(glyphify(undefined, 'weird')).toBe('');
  });
  it('plainify gives symbols: ✕ ○ □ △ for PlayStation, A B X Y for Xbox, and no ⟦', () => {
    expect(plainify('⟦jump⟧ ⟦meow⟧ ⟦interact⟧ ⟦photo⟧', 'ps')).toBe('✕ ○ □ △');
    expect(plainify('⟦jump⟧ ⟦meow⟧ ⟦interact⟧ ⟦photo⟧', 'xbox')).toBe('A B X Y');
    for (const t of TOKENS) for (const k of ['ps', 'xbox']) expect(plainify(`⟦${t}⟧`, k)).not.toContain('⟦');
  });
});
