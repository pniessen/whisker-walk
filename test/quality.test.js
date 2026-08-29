import { describe, it, expect } from 'vitest';
import { resolveQuality } from '../src/render/quality.js';

const high = { name: 'high', shadowMapSize: 2048, envIntensity: 0.45, postFx: true, pixelRatioCap: 2, msaaSamples: 4, shadowFitRadius: 20, normalMaps: true };
const low  = { name: 'low',  shadowMapSize: 1024, envIntensity: 0.32, postFx: false, pixelRatioCap: 1.5, msaaSamples: 0, shadowFitRadius: 20, normalMaps: false };

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

  // v1.1: the composer's explicit render target (game/composer.js) reads its
  // sample count off the tier rather than a hardcoded constant, so the tier
  // stays the one place that decides. Low is 0, not some smaller positive
  // number — it renders straight to the already-multisampled canvas
  // (main.js's antialias:true), so a composer target it never uses asking
  // for samples too would just pay the MSAA cost twice.
  it('gives the high tier 4 composer samples and the low tier none', () => {
    expect(resolveQuality({ coarse: false, reducedMotion: false, override: 'high' }).msaaSamples).toBe(4);
    expect(resolveQuality({ coarse: false, reducedMotion: false, override: 'low' }).msaaSamples).toBe(0);
  });

  // v1.3: the sun's shadow frustum no longer covers the whole area from the
  // world origin — render/shadowfit.js fits it to the view each frame, and this
  // is its half-extent. The two tiers agree on it ON PURPOSE, which is why the
  // case asserts equality rather than two literals: the right radius is set by
  // how far the FOG lets a shadow matter, and both tiers share one fog. What
  // differs is shadowMapSize above, so the same 40-unit box resolves at 2.0cm
  // per texel on high and 3.9cm on low — the latter still sharper than the
  // 6.8cm the HIGH tier had before this landed.
  it('gives both tiers the same shadow-fit radius, resolved at their own map size', () => {
    const h = resolveQuality({ coarse: false, reducedMotion: false, override: 'high' });
    const l = resolveQuality({ coarse: false, reducedMotion: false, override: 'low' });
    expect(h.shadowFitRadius).toBe(20);
    expect(l.shadowFitRadius).toBe(h.shadowFitRadius);
    expect((2 * h.shadowFitRadius) / h.shadowMapSize).toBeLessThan(2 * 70 / 2048); // sharper than the old fixed box
  });

  // v5.1: derived normal maps for the procedural surface tiles
  // (render/textures.js). A texture-BANDWIDTH knob, so it follows the same
  // line the colour tiles already draw and the plan's section 4 states:
  // draw-calls-or-nothing ships on both tiers, fill rate or texture memory is
  // high only. It is asserted as a strict boolean rather than as truthy
  // because textures.js reads `typeof tier.normalMaps === 'boolean'` to tell a
  // real tier object from a bare tier name.
  it('gives normal maps to the high tier only', () => {
    const h = resolveQuality({ coarse: false, reducedMotion: false, override: 'high' });
    const l = resolveQuality({ coarse: false, reducedMotion: false, override: 'low' });
    expect(h.normalMaps).toBe(true);
    expect(l.normalMaps).toBe(false);
    // A phone gets neither channel, not a quieter one.
    expect(resolveQuality({ coarse: true, reducedMotion: false, override: 'auto' }).normalMaps).toBe(false);
  });
});
