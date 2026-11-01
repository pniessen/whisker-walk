import { describe, it, expect } from 'vitest';
import { createWater, WATER_TUNING } from '../src/render/water.js';

// The sun's highlight (and the probe's hot facets) broke up through the
// ripple into white patches on the near half of a lake at some sun angles.
// Each body now scales its whole Fresnel curve by `glare`
// (MeshPhysicalMaterial.specularIntensity, which for a dielectric is also its
// F90): the facets still sparkle, at less than half the strength. The sea keeps
// most of today's look.
const POND = { id: 'pond', kind: 'circle', x: 0, z: 0, r: 7 };
const SEA = { id: 'sea', kind: 'rect', minX: 22, maxX: 105, minZ: -70, maxZ: 70 };

describe('water glare', () => {
  it('a lake or pond tones its specular down by GLARE, on both tiers', () => {
    for (const quality of ['high', 'low']) {
      const w = createWater(POND, { quality });
      expect(w.material.isMeshPhysicalMaterial).toBe(true);
      expect(w.material.specularIntensity).toBe(WATER_TUNING.GLARE);
      expect(WATER_TUNING.GLARE).toBeGreaterThanOrEqual(0.4);
      expect(WATER_TUNING.GLARE).toBeLessThanOrEqual(0.7);
      // still a dielectric, still the same IBL multiplier
      expect(w.material.metalness).toBe(0);
      expect(w.material.envMapIntensity).toBe(quality === 'high' ? WATER_TUNING.ENV_INTENSITY : WATER_TUNING.ENV_INTENSITY_LOW);
      w.dispose();
    }
  });

  it('a body can ask for its own glare (the sea stays close to today)', () => {
    const sea = createWater(SEA, { shores: ['minX'], glare: WATER_TUNING.GLARE_SEA });
    expect(sea.material.specularIntensity).toBe(WATER_TUNING.GLARE_SEA);
    expect(WATER_TUNING.GLARE_SEA).toBeGreaterThan(WATER_TUNING.GLARE);
    expect(WATER_TUNING.GLARE_SEA).toBeLessThan(1);
    sea.dispose();
  });

  it('the seaside builds its sea with GLARE_SEA', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/world/seaside.js', import.meta.url), 'utf8');
    const call = src.slice(src.indexOf('createWater(SEA'), src.indexOf('});', src.indexOf('createWater(SEA')));
    expect(call).toContain('glare: WATER_TUNING.GLARE_SEA');
  });
});
