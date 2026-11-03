import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
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

  // The glint is also clamped in the shader: a glare-only cut dulled the whole
  // surface (0.3 looked flat), so the peak is capped instead.
  it('every water clamps its specular below white in the shader', () => {
    const bodies = [
      [POND, { quality: 'high' }],
      [POND, { quality: 'low' }],
      [SEA, { shores: ['minX'], glare: WATER_TUNING.GLARE_SEA }],
    ];
    for (const [fp, opts] of bodies) {
      const w = createWater(fp, opts);
      expect(typeof w.material.onBeforeCompile).toBe('function');
      expect(w.material.customProgramCacheKey()).toBe('whisker-water');
      const shader = {
        fragmentShader: THREE.ShaderLib.physical.fragmentShader,
        vertexShader: THREE.ShaderLib.physical.vertexShader,
        uniforms: {},
      };
      w.material.onBeforeCompile(shader);
      const f = shader.fragmentShader;
      expect(f).toContain('uSpecCap');
      // The order check alone could pass via the uniform declaration if the
      // include vanished, so pin the include upstream and the clamp itself.
      expect(THREE.ShaderLib.physical.fragmentShader).toContain('#include <lights_fragment_end>');
      expect(f).toContain('uniform float uSpecCap;');
      expect(f).toContain('reflectedLight.directSpecular = min(');
      expect(f.indexOf('reflectedLight.directSpecular = min(')).toBeGreaterThan(f.indexOf('#include <lights_fragment_end>'));
      expect(shader.uniforms.uSpecCap.value).toBe(WATER_TUNING.SPEC_CAP);
      w.dispose();
    }
  });

  it('SPEC_CAP is a sane cap and can be overridden', () => {
    expect(WATER_TUNING.SPEC_CAP).toBeGreaterThanOrEqual(0.3);
    expect(WATER_TUNING.SPEC_CAP).toBeLessThanOrEqual(0.9);
    const w = createWater(POND, { specCap: 0.4 });
    const shader = { fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} };
    w.material.onBeforeCompile(shader);
    expect(shader.uniforms.uSpecCap.value).toBe(0.4);
    w.dispose();
  });
});
