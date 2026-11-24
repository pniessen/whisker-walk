// Cat login M5.3: a cat brought onto a device that has never had its guided first walk
// (tutorial.first = null) ends 'old', so no guide cat meets it on the next walk.
import { describe, it, expect } from 'vitest';
import { createProgression } from '../src/progression.js';
import { lessonFor } from '../src/game/guidewalk.js';
import { memoryStorage } from './helpers/storage.js';

const store = () => memoryStorage({}, { removeItem: true });
const guided = (p) => lessonFor(p.state, { areaId: 'neighborhood' });
const EMPTY_TUT = { first: null, camp: false, hints: {}, told: { thing: null, visits: 0 } };

describe('a loaded cat and the guided first walk', () => {
  it('a brand-new device would guide its first walk', () => {
    const p = createProgression(store());
    expect(p.state.tutorial.first).toBe(null);
    expect(guided(p)?.kind).toBe('first');
  });

  it('loading a played cat that has no tutorial field ends first: "old", and no guide', () => {
    const p = createProgression(store());
    expect(p.state.tutorial.first).toBe(null);
    p.replaceFromPayload({ version: 4, walks: { neighborhood: 4 }, lifetimePoints: 120, points: 60 });
    expect(p.state.tutorial.first).toBe('old');
    expect(guided(p)?.kind).not.toBe('first');
  });

  it('loading a played cat whose save says first: null still ends "old"', () => {
    const p = createProgression(store());
    p.replaceFromPayload({ version: 4, walks: { neighborhood: 4 }, lifetimePoints: 120, points: 60, tutorial: EMPTY_TUT });
    expect(p.state.tutorial.first).toBe('old');
    expect(guided(p)?.kind).not.toBe('first');
  });

  it('it holds after the device is reopened', () => {
    const s = store();
    const p = createProgression(s);
    p.replaceFromPayload({ version: 4, lifetimePoints: 30, tutorial: EMPTY_TUT });
    expect(createProgression(s).state.tutorial.first).toBe('old');
  });

  it('a loaded cat that never walked or earned stays a new player (it still gets its guide)', () => {
    const p = createProgression(store());
    p.replaceFromPayload({ version: 4, petName: 'Mo', tutorial: EMPTY_TUT });
    expect(p.state.tutorial.first).toBe(null);
  });

  it('a loaded cat in the middle of its guided walk is left alone', () => {
    const p = createProgression(store());
    p.replaceFromPayload({ version: 4, walks: { neighborhood: 1 }, lifetimePoints: 5, tutorial: { ...EMPTY_TUT, first: 'part' } });
    expect(p.state.tutorial.first).toBe('part');
  });
});
