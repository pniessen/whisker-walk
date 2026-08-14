import { describe, it, expect } from 'vitest';
import { voiceFor, VOICES } from '../src/catvoice.js';

describe('voiceFor', () => {
  it('covers all ten breeds with finite positive params', () => {
    for (const b of ['tabby','siamese','persian','black','calico','mainecoon','zeetoo','rosa','robbie','hagrid']) {
      const v = voiceFor(b);
      for (const k of ['pitch','rate','gain']) {
        expect(Number.isFinite(v[k]) && v[k] > 0, `${b}.${k}`).toBe(true);
      }
    }
  });
  it('falls back to tabby for unknown breeds', () => {
    expect(voiceFor('unicorn')).toEqual(VOICES.tabby);
  });
  it('matches personality: siamese is higher+faster, persian lower+slower than tabby', () => {
    expect(voiceFor('siamese').pitch).toBeGreaterThan(voiceFor('tabby').pitch);
    expect(voiceFor('siamese').rate).toBeGreaterThan(voiceFor('tabby').rate);
    expect(voiceFor('persian').pitch).toBeLessThan(voiceFor('tabby').pitch);
    expect(voiceFor('persian').rate).toBeLessThan(voiceFor('tabby').rate);
  });
});
