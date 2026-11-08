import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// polish-daylight: a clear walk grades the area's pale day sky; rain, sunset,
// dusk, the den and the Gorge keep their looks.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_t, key) => (key === 'createLinearGradient' ? () => ({ addColorStop: () => {} }) : () => {}),
      set: () => true,
    }),
  }),
});

const { createWeather, clearDaySky, CLEAR_DAY_LOOK } = await import('../src/weather.js');
const { applySky } = await import('../src/world/builder.js');
const { FLAT_GROUND } = await import('../src/ground.js');

const lum = (hex) => (0.2126 * ((hex >> 16) & 255) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255)) / 255;
const sun = () => ({ color: new THREE.Color(0xfff2d8), intensity: 3, position: new THREE.Vector3(-36, 15, -24) });
const cam = () => new THREE.Vector3();

function dayScene(top = 0x9fd4e8, horizon = 0xcfe8f0) {
  const s = new THREE.Scene();
  applySky(s, top, horizon);
  s.environmentIntensity = 0.45;
  return s;
}

describe('clearDaySky', () => {
  it('darkens a near-white horizon and deepens the top', () => {
    const g = clearDaySky(0x9fd4e8, 0xcfe8f0);
    expect(g.k).toBeGreaterThan(0.9);
    expect(lum(g.horizon)).toBeLessThan(lum(0xcfe8f0) - 0.03);
    expect(lum(g.top)).toBeLessThan(lum(0x9fd4e8));
  });

  it('leaves a grey harbour sky (the Docks) alone', () => {
    const g = clearDaySky(0x5e7290, 0x8e9aae);
    expect(g).toEqual({ top: 0x5e7290, horizon: 0x8e9aae, k: 0 });
  });

  it('strength 0 is the old day, to the bit', () => {
    const g = clearDaySky(0xa9d4e0, 0xdde8dc, { ...CLEAR_DAY_LOOK, strength: 0 });
    expect(g.top).toBe(0xa9d4e0);
    expect(g.horizon).toBe(0xdde8dc);
  });
});

describe('the clear walk', () => {
  it('grades the sky and fog, keeping the fog the horizon stop', () => {
    const s = dayScene();
    const fill = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    const w = createWeather(s, sun(), 'clear', () => 0, true, FLAT_GROUND, { fill });
    const g = clearDaySky(0x9fd4e8, 0xcfe8f0);
    expect(s.fog.color.getHex()).toBe(new THREE.Color(g.horizon).getHex());
    expect(s.fog.near).toBe(CLEAR_DAY_LOOK.fogNear);
    expect(s.fog.far).toBe(CLEAR_DAY_LOOK.fogFar);
    expect(fill.intensity).toBeCloseTo(CLEAR_DAY_LOOK.hemiScale, 6);
    expect(s.environmentIntensity).toBeCloseTo(0.45 * CLEAR_DAY_LOOK.envScale, 6);
    w.update(1, cam());
    w.dispose();
    expect(fill.intensity).toBe(1);
    expect(s.environmentIntensity).toBe(0.45);
  });

  it('leaves the Gorge (a non-flat map) as it built itself', () => {
    const s = dayScene(0x86bde6, 0xeed8b8);
    s.fog.near = 60; s.fog.far = 175;
    const bg = s.background;
    const hilly = { flat: false, y: () => 0 };
    createWeather(s, sun(), 'clear', () => 0, true, hilly, {});
    expect(s.background).toBe(bg);
    expect([s.fog.color.getHex(), s.fog.near, s.fog.far]).toEqual([new THREE.Color(0xeed8b8).getHex(), 60, 175]);
    expect(s.environmentIntensity).toBe(0.45);
  });

  it('rain and sunset start from the authored day, untouched by the grade', () => {
    for (const condition of ['rain', 'sunset']) {
      const s = dayScene();
      createWeather(s, sun(), condition, () => 0, true, FLAT_GROUND, {});
      const ref = dayScene();
      createWeather(ref, sun(), condition, () => 0, true, FLAT_GROUND, {});
      // same result as a scene the clear grade never saw: the grade lives only in 'clear'
      expect(s.fog.color.getHex()).toBe(ref.fog.color.getHex());
      expect([s.fog.near, s.fog.far]).toEqual([ref.fog.near, ref.fog.far]);
    }
    // and rain's numbers are still the authored 40/130 day scaled by its factors
    const s = dayScene();
    createWeather(s, sun(), 'rain', () => 0, true, FLAT_GROUND, {});
    expect(s.fog.near).toBeCloseTo(40 * 0.35, 6);
  });

  it('a scene applySky did not build (no recorded sky) is left alone', () => {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x123456);
    s.fog = new THREE.Fog(0x654321, 40, 130);
    createWeather(s, sun(), 'clear', () => 0, true, FLAT_GROUND, {});
    expect(s.fog.near).toBe(40);
    expect(s.background.getHex()).toBe(0x123456);
  });
});

describe('the clear day exposure', () => {
  it('a graded clear walk asks for a touch less exposure; others ask for none', () => {
    const w = createWeather(dayScene(), sun(), 'clear', () => 0, true, FLAT_GROUND, {});
    expect(w.exposureScale).toBe(CLEAR_DAY_LOOK.exposure);
    expect(CLEAR_DAY_LOOK.exposure).toBeGreaterThan(0.85); // never dark on a phone
    const gorge = createWeather(dayScene(), sun(), 'clear', () => 0, true, { flat: false, y: () => 0 }, {});
    expect(gorge.exposureScale).toBeUndefined();
    for (const c of ['rain', 'sunset']) {
      expect(createWeather(dayScene(), sun(), c, () => 0, true, FLAT_GROUND, {}).exposureScale).toBeUndefined();
    }
  });

  it('composer applyDayGrade scales the base, and the next walk gets the base back', async () => {
    const { createComposerRig } = await import('../src/game/composer.js');
    const renderer = { toneMappingExposure: 1.1 };
    const rig = createComposerRig(renderer, {});
    rig.applyLighting({}, { dusk: false, envIntensity: 0.45 });
    rig.applyDayGrade(0.91);
    expect(renderer.toneMappingExposure).toBeCloseTo(1.001, 6);
    rig.applyLighting({}, { dusk: true, envIntensity: 0.45 });
    expect(renderer.toneMappingExposure).toBe(1.1);
    rig.applyDayGrade(0.91);
    rig.resetLighting();
    expect(renderer.toneMappingExposure).toBe(1.1);
  });

  it('walk.js hands the clear walk\'s exposure to the composer right after the weather is built', async () => {
    const { readFileSync } = await import('node:fs');
    const walk = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(walk).toMatch(/weather = createWeather\([^\n]*\n[^\n]*\n\s*if \(weather\.exposureScale\) composerRig\.applyDayGrade\(weather\.exposureScale\);/);
  });
});

describe('the Docks', () => {
  it('a clear Docks walk keeps its whole overcast look', () => {
    const s = dayScene(0x5e7290, 0x8e9aae);
    const bg = s.background;
    const fill = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    const w = createWeather(s, sun(), 'clear', () => 0, true, FLAT_GROUND, { fill });
    expect(s.background).toBe(bg);
    expect([s.fog.near, s.fog.far]).toEqual([40, 130]);
    expect(fill.intensity).toBe(1);
    expect(s.environmentIntensity).toBe(0.45);
    expect(w.exposureScale).toBeUndefined();
  });
});
