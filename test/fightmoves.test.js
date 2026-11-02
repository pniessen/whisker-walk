import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FIGHT_MOVES, FIGHT_MOVE_IDS, moveById, earnedMoves, unlockToast, teachFor,
} from '../src/fightmoves.js';
import { OUTSIDE_WORDS, RANK_WORDS, PLACE_WORDS, CLAN_SUFFIX } from '../src/clanwords.js';

describe('fight move catalogue', () => {
  test('the four moves, verbatim and frozen', () => {
    expect(FIGHT_MOVES).toEqual([
      { id: 'rearUpSwat', name: 'Rear-up Swat', answers: 'swipe', action: 'rearUp', earnAt: 3, price: 300, hint: 'Paw up', when: 'they raise a paw' },
      { id: 'leapScratch', name: 'Leap and Scratch', answers: 'charge', action: 'leap', earnAt: 6, price: 600, hint: 'Backs up', when: 'they back up' },
      { id: 'pin', name: 'Pin', answers: 'pounce', action: 'pin', earnAt: 10, price: null, hint: 'Crouch', when: 'they crouch' },
      { id: 'rollingTumble', name: 'Rolling Tumble', answers: 'any', action: 'roll', earnAt: 20, price: null, hint: 'Any move', when: null },
    ]);
    expect(Object.isFrozen(FIGHT_MOVES)).toBe(true);
    expect(FIGHT_MOVE_IDS).toEqual(['rearUpSwat', 'leapScratch', 'pin', 'rollingTumble']);
  });

  test('moveById finds an entry or null', () => {
    expect(moveById('pin').name).toBe('Pin');
    for (const bad of ['nope', undefined, null, 5, '__proto__', 'toString']) expect(moveById(bad)).toBeNull();
  });

  test('earnedMoves by fights won, junk gives none', () => {
    expect(earnedMoves(0)).toEqual([]);
    expect(earnedMoves(2)).toEqual([]);
    expect(earnedMoves(3)).toEqual(['rearUpSwat']);
    expect(earnedMoves(10)).toEqual(['rearUpSwat', 'leapScratch', 'pin']);
    expect(earnedMoves(20)).toEqual(FIGHT_MOVE_IDS);
    for (const bad of ['9e99', NaN, -1, undefined, null, {}]) expect(earnedMoves(bad)).toEqual([]);
  });

  test('unlock toasts', () => {
    expect(unlockToast('pin')).toBe('New move: Pin! Use it when they crouch.');
    expect(unlockToast('rearUpSwat')).toBe('New move: Rear-up Swat! Use it when they raise a paw.');
    expect(unlockToast('leapScratch')).toBe('New move: Leap and Scratch! Use it when they back up.');
    expect(unlockToast('rollingTumble')).toBe('New move: Rolling Tumble! Use it on any move.');
  });

  test('teachFor lists each known id in catalogue order', () => {
    expect(teachFor(['rearUpSwat'])).toBe(' · 🐾 → Rear-up Swat');
    expect(teachFor(['rollingTumble', 'pin'])).toBe(' · ⬇️ → Pin · any → Rolling Tumble');
    expect(teachFor(['leapScratch'])).toBe(' · ↩️ → Leap and Scratch');
    expect(teachFor([])).toBe('');
    expect(teachFor(['bogus'])).toBe('');
  });

  test('names use no borrowed clan word', () => {
    const borrowed = [...Object.values(OUTSIDE_WORDS), ...Object.values(RANK_WORDS), ...Object.values(PLACE_WORDS), CLAN_SUFFIX];
    for (const m of FIGHT_MOVES) {
      const words = m.name.toLowerCase().split(/[^a-z]+/);
      for (const w of borrowed) expect(words).not.toContain(String(w).toLowerCase());
    }
  });

  test('imports only CLUES from fight.js', () => {
    const src = readFileSync(new URL('../src/fightmoves.js', import.meta.url), 'utf8');
    const imports = src.match(/^\s*import\s.*$/gm) || [];
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatch(/\{\s*CLUES\s*\}\s*from\s*['"]\.\/fight\.js['"]/);
  });
});
