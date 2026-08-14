import { describe, it, expect } from 'vitest';
import { resolveQuality } from '../src/render/quality.js';

const high = { name: 'high', shadowMapSize: 2048, envIntensity: 0.45, postFx: true, pixelRatioCap: 2 };
const low  = { name: 'low',  shadowMapSize: 1024, envIntensity: 0.32, postFx: false, pixelRatioCap: 1.5 };

describe('resolveQuality', () => {
  it('auto → high on a desktop pointer with motion allowed', () => {
    expect(resolveQuality({ coarse: false, reducedMotion: false, override: 'auto' })).toEqual(high);
  });
  it('auto → low on a coarse pointer', () => {
    expect(resolveQuality({ coarse: true, reducedMotion: false, override: 'auto' })).toEqual(low);
  });
  it('auto → low when reduced motion is on, even on desktop', () => {
    expect(resolveQuality({ coarse: false, reducedMotion: true, override: 'auto' })).toEqual(low);
  });
  it('override high forces high even on a coarse/reduced-motion device', () => {
    expect(resolveQuality({ coarse: true, reducedMotion: true, override: 'high' })).toEqual(high);
  });
  it('override low forces low even on desktop', () => {
    expect(resolveQuality({ coarse: false, reducedMotion: false, override: 'low' })).toEqual(low);
  });
});
