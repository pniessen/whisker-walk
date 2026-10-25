import { describe, it, expect } from 'vitest';
import { parseArgs, inventCode, validateReward, entryLine, WORDS } from '../scripts/make-code.mjs';
import { normalizeCode, hashCode } from '../src/redeem.js';
import { CATALOG } from '../src/progression.js';

describe('make-code script helpers', () => {
  it('parses flags', () => {
    expect(parseArgs(['--points', '50', '--acc', 'wizard', '--acc', 'crown', '--cat', 'hagrid', '--label', 'Hi']))
      .toEqual({ points: 50, accessories: ['wizard', 'crown'], cats: ['hagrid'], label: 'Hi' });
    expect(parseArgs(['--acc', 'wizard'])).toEqual({ points: 0, accessories: ['wizard'], cats: [], label: '' });
    expect(parseArgs(['--code', 'a b', '--points', '1']).code).toBe('a b');
  });

  it('rejects unknown flags and bad numbers kindly', () => {
    expect(() => parseArgs(['--pointz', '5'])).toThrow(/Unknown option/);
    expect(() => parseArgs(['--points', 'lots'])).toThrow(/points/);
    expect(() => parseArgs(['--label'])).toThrow(/needs a value/);
  });

  it('has 128 unique 3-7 letter uppercase words', () => {
    expect(WORDS.length).toBe(128);
    expect(new Set(WORDS).size).toBe(128);
    for (const w of WORDS) expect(w).toMatch(/^[A-Z]{3,7}$/);
  });

  it('invents WORD-WORD-XXXX codes without look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      const c = inventCode();
      expect(c).toMatch(/^[A-Z]+-[A-Z]+-[A-HJKMNP-Z2-9]{4}$/);
      const [a, b] = c.split('-');
      expect(WORDS).toContain(a);
      expect(WORDS).toContain(b);
    }
    expect(inventCode(() => 0)).toMatch(/^[A-Z]+-[A-Z]+-[A-Z2-9]{4}$/);
  });

  it('validates rewards', () => {
    const catId = Object.keys(CATALOG.cats)[0];
    const accId = Object.keys(CATALOG.accessories)[0];
    expect(validateReward({ points: 5, accessories: [], cats: [], label: '' })).toEqual([]);
    expect(validateReward({ points: 0, accessories: [accId], cats: [catId], label: '' })).toEqual([]);
    expect(validateReward({ points: 0, accessories: ['nope-acc'], cats: ['nope-cat'], label: '' }).join('|'))
      .toMatch(/nope-acc[\s\S]*nope-cat/);
    expect(validateReward({ points: 0, accessories: [], cats: [], label: '' }).join('|')).toMatch(/nothing/);
    const short = validateReward({ code: 'ab-cd', points: 5, accessories: [], cats: [], label: '' });
    expect(short.join('|')).toMatch(/short/);
    expect(short.every((m) => m.startsWith('Warning:'))).toBe(true);
    expect(validateReward({ points: 5, accessories: [], cats: [], label: 'x'.repeat(61) }).join('|')).toMatch(/label/);
  });

  it('entryLine is a valid property that round-trips and matches the hash', async () => {
    const code = 'TEST-CODE-ZZ22';
    const reward = { points: 7, accessories: ['beanie'], cats: [], label: 'He said "hi", it\'s fine' };
    const hash = await hashCode(normalizeCode(code));
    const line = entryLine(hash, reward);
    expect(line.trim().endsWith(',')).toBe(true);
    const obj = eval(`({ ${line} })`);
    expect(Object.keys(obj)).toEqual([hash]);
    expect(obj[hash]).toEqual(reward);
  });
});
