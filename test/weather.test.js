import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Headless canvas stub, same one test/builder.test.js and test/sky.test.js
// use — createWeather now routes its background swaps through
// render/sky.js's skyBackground(), which needs a `document` to paint a real
// gradient onto. Stubbed once, for the whole file: the rollWeather/
// createRainSchedule tests below never touch it.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'createLinearGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { rollWeather, createRainSchedule, createWeather } = await import('../src/weather.js');
const { skyBackground } = await import('../src/render/sky.js');

describe('rollWeather', () => {
  it('maps rng ranges to conditions 50/30/20', () => {
    expect(rollWeather(() => 0.1)).toBe('clear');
    expect(rollWeather(() => 0.49)).toBe('clear');
    expect(rollWeather(() => 0.55)).toBe('rain');
    expect(rollWeather(() => 0.79)).toBe('rain');
    expect(rollWeather(() => 0.85)).toBe('sunset');
  });
});

describe('createRainSchedule', () => {
  it('spans 60-120s of rain then a 30s rainbow window', () => {
    const early = createRainSchedule(() => 0);
    expect(early.stopAt).toBe(60);
    expect(early.rainbowUntil).toBe(90);
    const late = createRainSchedule(() => 1);
    expect(late.stopAt).toBe(120);
    expect(late.rainbowUntil).toBe(150);
  });

  it('phases correctly over time', () => {
    const s = createRainSchedule(() => 0);
    expect(s.phase(10)).toBe('rain');
    expect(s.phase(61)).toBe('rainbow');
    expect(s.phase(95)).toBe('after');
  });
});

// createWeather's rain path saves scene.background before overwriting it and
// restores it once the rainbow phase starts (line ~110 of weather.js). Since
// applySky/skyBackground now hand back a CanvasTexture instead of a flat
// THREE.Color, the save/restore has to get BOTH representations right — see
// the big comment in weather.js immediately above `const prevBackground =`
// for why a Texture and a Color cannot use the same save strategy.
describe('createWeather — rain background save/restore', () => {
  function fakeScene(background) {
    return {
      background,
      fog: new THREE.Fog(0x123456, 40, 130),
      add: () => {},
    };
  }
  // The real argument is always the walk's THREE.DirectionalLight, so the
  // stub carries a `position` too: the rainbow phase derives its anti-solar
  // placement from it (see weather.js), and these tests run past stopAt into
  // that phase to trigger the background restore they are actually about.
  // The value is walk.js's own SUN_POSITION, so a stub that drifts from the
  // shipped sun is at least drifting from something real.
  function fakeSun() {
    return {
      color: new THREE.Color(),
      intensity: 2.2,
      position: new THREE.Vector3(-36, 15, -24),
    };
  }
  // rng: () => 0 gives createRainSchedule a stopAt of exactly 60s, so one
  // update() call past that lands squarely in the 'rainbow' phase and fires
  // the restore on its very first invocation.
  const rng = () => 0;
  const cam = () => new THREE.Vector3(0, 0, 0);

  it('round-trips a flat Color background byte for byte', () => {
    const original = new THREE.Color(0x445566);
    const scene = fakeScene(original);
    const weather = createWeather(scene, fakeSun(), 'rain', rng, /* reducedMotion */ true);
    // Swapped to rain's own grey for the duration of the rain phase.
    expect(scene.background).not.toBe(original);
    weather.update(61, cam());
    expect(scene.background).not.toBe(original); // clone, not the same instance...
    expect(scene.background.isColor).toBe(true);
    expect(scene.background.getHex()).toBe(original.getHex()); // ...but the same value
  });

  it('round-trips a gradient sky Texture by reference, without cloning it', () => {
    const original = skyBackground(0x9fd4e8, 0xcfe8f0); // a real CanvasTexture here
    expect(original.isTexture).toBe(true);
    const scene = fakeScene(original);
    const weather = createWeather(scene, fakeSun(), 'rain', rng, true);
    expect(scene.background).not.toBe(original); // swapped to rain's own gradient
    weather.update(61, cam());
    // Restored to the EXACT SAME texture object — not a clone. A clone would
    // still be correct-looking (Texture.copy carries mapping/colorSpace over)
    // but would silently allocate a second GPU upload of the same canvas
    // every single rain cycle, which is the leak the fix in weather.js is
    // about. Reference equality is what proves that didn't happen.
    expect(scene.background).toBe(original);
    expect(scene.background.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(scene.background.colorSpace).toBe(THREE.SRGBColorSpace);
  });
});

describe('createWeather — the rainbow is anti-solar', () => {
  // A rainbow's centre is the ANTI-SOLAR point: directly opposite the sun from
  // the viewer. That is why you always have the sun behind you when you see
  // one, and it is a hard geometric fact, not a look.
  //
  // This test exists because the placement was a hardcoded `cameraPos.z - 70`
  // that was never derived from the sun at all. It was 56 degrees off under
  // the original sun and nobody noticed; when the azimuth pass moved the sun
  // to its antipode the arc ended up on the SAME side of the sky as the sun,
  // which cannot happen in nature. A fixed number that happens to look fine is
  // indistinguishable from a correct one until something moves — so what is
  // pinned here is the RELATIONSHIP, for an arbitrary sun, not a coordinate.
  const rng = () => 0; // stopAt exactly 60s, so update(61) lands in 'rainbow'

  function placeWith(sunPos) {
    const scene = { background: new THREE.Color(0x445566), fog: new THREE.Fog(0x123456, 40, 130), add: () => {} };
    const sun = { color: new THREE.Color(), intensity: 2.2, position: sunPos };
    const weather = createWeather(scene, sun, 'rain', rng, true);
    weather.update(61, new THREE.Vector3(0, 0, 0));
    return weather;
  }

  // Horizontal bearing, degrees clockwise from +z.
  const bearing = (x, z) => ((Math.atan2(x, z) * 180) / Math.PI + 360) % 360;
  // Shortest angular separation between two bearings, in [0, 180]. Antipodal
  // is 180 — the whole property under test.
  const separation = (a, b) => 180 - Math.abs(Math.abs(a - b) - 180);

  for (const [label, pos] of [
    ['the shipped sun', new THREE.Vector3(-36, 15, -24)],
    ['the pre-azimuth sun', new THREE.Vector3(36, 15, 24)],
    ['a due-north sun', new THREE.Vector3(0, 15, 43.27)],
    ['a due-east sun', new THREE.Vector3(43.27, 15, 0)],
  ]) {
    it(`sits 180 degrees from ${label}`, () => {
      const w = placeWith(pos);
      expect(w.rainbowVisible).toBe(true);
      const sunAz = bearing(pos.x, pos.z);
      const bowAz = bearing(w.rainbowPos.x, w.rainbowPos.z);
      expect(separation(bowAz, sunAz)).toBeCloseTo(180, 4);
    });
  }

  it('reduces to the historical due-north placement for a sun at bearing 0', () => {
    // Not nostalgia: it proves the new derivation is a strict generalisation of
    // the old constant rather than a different behaviour that merely also
    // looks plausible.
    const w = placeWith(new THREE.Vector3(0, 15, 43.27));
    expect(w.rainbowPos.x).toBeCloseTo(0, 4);
    expect(w.rainbowPos.z).toBeCloseTo(-70, 4);
  });
});
