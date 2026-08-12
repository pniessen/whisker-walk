import { describe, it, expect } from 'vitest';
import { phraseIdForDigit } from '../src/chatkeys.js';
import { PHRASES } from '../src/chat.js';

describe('phraseIdForDigit', () => {
  const phraseKind = PHRASES.filter((p) => p.kind === 'phrase');
  it('maps Digit1..Digit9 to the first nine phrase-kind ids and Digit0 to the tenth', () => {
    expect(phraseIdForDigit('Digit1')).toBe(phraseKind[0].id);
    expect(phraseIdForDigit('Digit9')).toBe(phraseKind[8].id);
    expect(phraseIdForDigit('Digit0')).toBe(phraseKind[9].id);
  });
  it('returns null for non-digit or out-of-range codes', () => {
    expect(phraseIdForDigit('KeyT')).toBeNull();
    expect(phraseIdForDigit('Digit0', [])).toBeNull();
    expect(phraseIdForDigit('')).toBeNull();
  });
});
