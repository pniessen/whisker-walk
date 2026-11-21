import { describe, it, expect } from 'vitest';
import { labelFor, critterLabel, critterKey } from '../src/game/labels.js';
import { standInWords } from './helpers/standinwords.js';
import { addWordSet, removeWordSet, setSeriesMode, SERIES_ON } from '../src/wordset.js';

describe('critter labels', () => {
  it('names the pigeon, the songbird and the seagull', () => {
    expect(labelFor('pigeon')).toBe('a cooing pigeon');
    expect(labelFor('bird')).toBe('a songbird');
    expect(labelFor('seagull')).toBe('a seagull');
  });
  it('critterLabel follows def.labelAs, else the type', () => {
    expect(critterLabel({ type: 'bird', def: { labelAs: 'pigeon' } })).toBe('a cooing pigeon');
    expect(critterLabel({ type: 'bird', def: {} })).toBe('a songbird');
    expect(critterLabel({ type: 'bird' })).toBe('a songbird');
  });
  it('critterKey is the album key tail', () => {
    expect(critterKey({ type: 'bird', def: { labelAs: 'pigeon' } })).toBe('pigeon');
    expect(critterKey({ type: 'bird' })).toBe('bird');
  });
  it('reads the pigeon label through the table when called', () => {
    addWordSet('label-test', { ...standInWords(), PHRASES: { 'critter.pigeon': 'a test pigeon' } });
    try {
      setSeriesMode('label-test');
      expect(labelFor('pigeon')).toBe('a test pigeon');
    } finally {
      setSeriesMode(SERIES_ON);
      removeWordSet('label-test');
    }
  });
});
