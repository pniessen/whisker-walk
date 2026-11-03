import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/builder.test.js).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const b = await import('../src/world/builder.js');
const { narrowsTint, localTop, NARROWS_TINT_KEY } = await import('../src/world/narrows.js');
const { ROCK_WALKS, GORGE_ROCK_KEEP, GORGE_ROCK_MOUTHS } = await import('../src/world/gorge.js');
const { MASSES, CEILINGS } = await import('../src/world/gorgeshape.js');
const { strataBand } = await import('../src/world/rockrelief.js');
const { seedFromCode } = await import('../src/rng.js');

const SEED = seedFromCode('gorge-rock');
const lum = ([r, g, bl]) => 0.2126 * r + 0.7152 * g + 0.0722 * bl;
const rgbOf = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

describe('the Narrows tint', () => {
  it('narrowsTint returns the input unchanged outside the zone and its fade', () => {
    const rgb = [0.41, 0.37, 0.33];
    expect(narrowsTint(0, 3, 0, rgb, 0)).toEqual(rgb);
    expect(narrowsTint(-30, 3, -30, rgb, 0)).toEqual(rgb);
  });

  it('the Narrows floor rock is warm, not grey', () => {
    const [r, , bl] = narrowsTint(-30, 0.5, -16, rgbOf(b.ROCK_LOW), 0);
    expect(r - bl).toBeGreaterThanOrEqual(0.08);
  });

  it('neighbouring strata differ', () => {
    // Raw mean luminance per band, walking up the wall at (-30, -16); the
    // first two consecutive bands found are compared.
    const byBand = new Map();
    for (let i = 2; i <= 86; i++) {
      const y = i / 10;
      const band = strataBand(-30, y, -16, SEED);
      if (!byBand.has(band)) byBand.set(band, []);
      byBand.get(band).push(lum(narrowsTint(-30, y, -16, [0.5, 0.5, 0.5], 0)));
    }
    const bands = [...byBand.keys()].sort((p, q) => p - q);
    const k = bands.findIndex((band, i) => i > 0 && bands[i - 1] === band - 1);
    expect(k).toBeGreaterThan(0);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const lo = mean(byBand.get(bands[k - 1]));
    const hi = mean(byBand.get(bands[k]));
    expect(Math.abs(hi - lo) / Math.max(hi, lo)).toBeGreaterThanOrEqual(0.06);
  });

  it('the rim is lit', () => {
    const top = localTop(-30, -16);
    expect(top).toBe(9);
    const rgb = [0.5, 0.5, 0.5];
    const rim = lum(narrowsTint(-30, top - 0.3, -16, rgb, 0));
    const below = lum(narrowsTint(-30, top - 3, -16, rgb, 0));
    expect(rim).toBeGreaterThanOrEqual(1.15 * below);
  });

  it('localTop', () => {
    expect(localTop(-30, -16)).toBe(9);
    expect(localTop(-45, -16)).toBe(20);
    expect(localTop(-10, 0)).toBe(0);
  });

  it("rockTerrain's tint changes colours only", () => {
    const args = {
      walks: ROCK_WALKS, masses: MASSES, ceilings: CEILINGS, seed: SEED, keep: GORGE_ROCK_KEEP, mouths: GORGE_ROCK_MOUTHS,
    };
    const plain = b.rockTerrain(args);
    const tinted = b.rockTerrain({ ...args, tint: narrowsTint, tintKey: NARROWS_TINT_KEY });
    const again = b.rockTerrain({ ...args, tint: narrowsTint, tintKey: NARROWS_TINT_KEY });
    const attr = (g, mesh, name) => g.getObjectByName(mesh).geometry.getAttribute(name).array;
    let differ = 0;
    for (const mesh of ['rockFaces', 'lips']) {
      expect(attr(tinted, mesh, 'position')).toEqual(attr(plain, mesh, 'position'));
      const a = attr(plain, mesh, 'color');
      const t = attr(tinted, mesh, 'color');
      expect(t.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) if (a[i] !== t[i]) differ++;
      expect(attr(again, mesh, 'color')).toEqual(t);
    }
    expect(differ).toBeGreaterThan(0);
    expect(attr(tinted, 'ledgeTops', 'position')).toEqual(attr(plain, 'ledgeTops', 'position'));
  }, 120_000);
});
