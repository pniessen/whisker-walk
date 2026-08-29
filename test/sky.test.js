import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// A recording gradient stub rather than the blanket Proxy test/builder.test.js
// uses: the whole point of the recalibration this file guards is WHERE each
// colour stop lands and WHAT colour it carries, so the stub has to capture
// addColorStop's real (offset, style) pairs instead of swallowing them.
let lastStops;
function recordingCtx() {
  return {
    createLinearGradient: () => {
      lastStops = [];
      return { addColorStop: (offset, style) => lastStops.push([offset, style]) };
    },
    fillRect: () => {},
    set fillStyle(_v) {},
    get fillStyle() {
      return '';
    },
  };
}
vi.stubGlobal('document', {
  createElement: () => ({ width: 0, height: 0, getContext: () => recordingCtx() }),
});

const { skyTexture, skyBackground, __resetSkyTextures } = await import('../src/render/sky.js');

// "rgb(r,g,b)" -> [r,g,b]. Every stop this module writes goes through
// rgbToCss, so this is the one format ever seen here.
function parseRgb(style) {
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(style);
  if (!m) throw new Error(`unexpected fillStyle ${style}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// Repaints (top, horizon) from a clean cache and returns its stops as
// [offset, [r,g,b]], in the order the painter wrote them: top, haze,
// horizon, horizon-again.
function paint(top, horizon) {
  __resetSkyTextures();
  skyTexture(top, horizon);
  return lastStops.map(([offset, style]) => [offset, parseRgb(style)]);
}

describe('skyTexture', () => {
  it('returns an equirectangular CanvasTexture with an explicit sRGB colorSpace', () => {
    __resetSkyTextures();
    const tex = skyTexture(0x9fd4e8, 0xcfe8f0);
    expect(tex).toBeInstanceOf(THREE.CanvasTexture);
    expect(tex.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(tex.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it('memoises on the (top, horizon) colour pair: same pair, same object', () => {
    __resetSkyTextures();
    const a = skyTexture(0x9fd4e8, 0xcfe8f0);
    const b = skyTexture(0x9fd4e8, 0xcfe8f0);
    expect(b).toBe(a);
  });

  it('gives different pairs distinct textures, so areas do not bleed into each other', () => {
    __resetSkyTextures();
    const park = skyTexture(0xaee0d0, 0xd8f0e0);
    const docks = skyTexture(0x5e7290, 0x8e9aae);
    expect(park).not.toBe(docks);
  });

  it('shares one texture across two areas that happen to author the same palette', () => {
    // den.js and neighborhood.js both call applySky(scene, 0x9fd4e8, 0xcfe8f0)
    // today — see world/builder.js call sites. The cache is keyed on the
    // colour pair, not the area, so this is not a coincidence to preserve.
    __resetSkyTextures();
    const den = skyTexture(0x9fd4e8, 0xcfe8f0);
    const neighborhood = skyTexture(0x9fd4e8, 0xcfe8f0);
    expect(neighborhood).toBe(den);
  });
});

// The property that matters. The default in-game camera (cameraOffset(0,
// 0.18) in catcam.js, looked at from walk.js, through main.js's 70°-vertical
// PerspectiveCamera) puts the TOP of the frame at v=0.4595 in the equirectUv
// mapping documented at the top of sky.js — derived there from the actual
// camera geometry, and cross-checked against the live rendered frame. The
// most-upward pitch the camera allows (cameraOffset clamps to [-0.3, 0.9])
// puts it at v=0.335. Both numbers are re-derived here rather than copied,
// so a future change to either camera constant fails this test instead of
// silently drifting out of sync with it.
const CAM_PITCH_DEFAULT = 0.18;
const CAM_PITCH_UP = -0.3;
const CAM_DIST = 4.5;
const CAM_HEIGHT = 2.2;
const CAM_FOV = 70;
function topOfFrameV(pitch) {
  const back = CAM_DIST * Math.cos(pitch);
  const camY = CAM_HEIGHT + CAM_DIST * Math.sin(pitch) * 0.9;
  const elevation = (Math.atan2(0.6 - camY, back) * 180) / Math.PI;
  const topElevation = elevation + CAM_FOV / 2;
  return Math.acos(Math.sin((topElevation * Math.PI) / 180)) / Math.PI;
}

describe('the visible band stays at least as rich as the flat colour it replaces', () => {
  const PAIRS = {
    'den/neighborhood': [0x9fd4e8, 0xcfe8f0],
    park: [0xaee0d0, 0xd8f0e0],
    seaside: [0x9fc8e8, 0xe8e0d0],
    docks: [0x5e7290, 0x8e9aae],
    'sunset (weather.js)': [0xf0a060, 0xf8c890],
    'rain (weather.js)': [0x7a8a98, 0x8a9aa8],
  };

  it('the default-pitch top-of-frame v (~0.4595) sits at or before the first stop', () => {
    const v = topOfFrameV(CAM_PITCH_DEFAULT);
    expect(v).toBeCloseTo(0.4595, 3);
    const [[firstOffset]] = paint(0x9fd4e8, 0xcfe8f0);
    expect(firstOffset).toBeGreaterThanOrEqual(v);
  });

  it('the full-pitch-up top-of-frame v (~0.335) also sits at or before the first stop', () => {
    const v = topOfFrameV(CAM_PITCH_UP);
    expect(v).toBeCloseTo(0.335, 3);
    const [[firstOffset]] = paint(0x9fd4e8, 0xcfe8f0);
    expect(firstOffset).toBeGreaterThanOrEqual(v);
  });

  it.each(Object.entries(PAIRS))('%s: the first stop is the untouched flat top colour', (_name, [top, horizon]) => {
    const stops = paint(top, horizon);
    const [firstOffset, firstRgb] = stops[0];
    // Canvas gradients clamp to the first stop's colour for every offset
    // before it, so putting `top` here — unmodified — is what makes the
    // player's top screen edge byte-identical to the flat colour it
    // replaces, at both pitches checked above and everything between.
    expect(firstRgb).toEqual([(top >> 16) & 255, (top >> 8) & 255, top & 255]);
    expect(firstOffset).toBeGreaterThanOrEqual(topOfFrameV(CAM_PITCH_DEFAULT));
  });

  it.each(Object.entries(PAIRS))('%s: the horizon stops match scene.fog exactly', (_name, [top, horizon]) => {
    const stops = paint(top, horizon);
    const want = [(horizon >> 16) & 255, (horizon >> 8) & 255, horizon & 255];
    const atHalf = stops.find(([offset]) => offset === 0.5);
    const atOne = stops.find(([offset]) => offset === 1);
    expect(atHalf[1]).toEqual(want);
    expect(atOne[1]).toEqual(want);
  });
});

describe('adaptive haze', () => {
  // Luminance >= 0.85 (den/neighborhood 0.891, park 0.917, seaside 0.881):
  // these horizons are already most of the way to white by authorship, so
  // lifting them further buys nothing but desaturation — the haze stop must
  // equal the horizon colour exactly, i.e. no lift at all.
  it.each([
    ['den/neighborhood', 0x9fd4e8, 0xcfe8f0],
    ['park', 0xaee0d0, 0xd8f0e0],
    ['seaside', 0x9fc8e8, 0xe8e0d0],
  ])('%s: a pale horizon gets zero lift', (_name, top, horizon) => {
    const stops = paint(top, horizon);
    const haze = stops[1][1];
    const horizonRgb = [(horizon >> 16) & 255, (horizon >> 8) & 255, horizon & 255];
    expect(haze).toEqual(horizonRgb);
  });

  // Luminance well under 0.85 (docks 0.600, rain 0.595): a real mid-grey-blue
  // with room to brighten, so the haze stop should be visibly lighter than
  // the horizon in every channel — but nowhere near the old flat 0.32 lift
  // toward white, which is what produced the washed-out complaint this file
  // guards against.
  it.each([
    ['docks', 0x5e7290, 0x8e9aae],
    ['rain (weather.js)', 0x7a8a98, 0x8a9aa8],
  ])('%s: a mid-tone horizon gets a small, bounded lift', (_name, top, horizon) => {
    const stops = paint(top, horizon);
    const haze = stops[1][1];
    const horizonRgb = [(horizon >> 16) & 255, (horizon >> 8) & 255, horizon & 255];
    haze.forEach((c, i) => {
      expect(c).toBeGreaterThan(horizonRgb[i]); // lighter...
      expect(c - horizonRgb[i]).toBeLessThan(20); // ...but only slightly (old lift routinely moved a channel 40+ points)
    });
  });
});

describe('skyBackground', () => {
  it('falls back to the flat THREE.Color it replaces when canvas support is absent', () => {
    vi.stubGlobal('document', undefined);
    const bg = skyBackground(0x9fd4e8, 0xcfe8f0);
    expect(bg).toBeInstanceOf(THREE.Color);
    expect(bg.getHex()).toBe(0x9fd4e8);
    // Restore the recording stub for any test file run after this one in the
    // same worker — vi.stubGlobal persists across tests within a file.
    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => recordingCtx() }),
    });
  });
});
