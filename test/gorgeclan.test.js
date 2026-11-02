import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';

// The same headless canvas stub every world test uses (see test/park.test.js
// for why getImageData and the gradients need real answers).
vi.stubGlobal('document', {
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'measureText') return () => ({ width: 0 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { visitAt, INTRUDER_PERIOD } = await import('../src/intruders.js');

// Clan and member id per slot (k * 120 + 30), k 0-399, joined, then hashed.
function fingerprint(area) {
  const parts = [];
  for (let k = 0; k < 400; k++) {
    const v = visitAt(area, k * INTRUDER_PERIOD + 30);
    parts.push(v ? `${v.clan}:${v.member.id}` : '-');
  }
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

const FINGERPRINTS = {
  woods: 'ef65cdfb4ed3116c20162097ca5c7df6057293ce1039055db0c441d256c79d4d',
  river: 'f5c50834ce5296997efa10ea8c9c80b7c6880c5607d0d1f84e2eb514ba10a46c',
  pines: 'f16769070262fc4a281740d09504f87c44d8d9b1e657014bf52479db237562d8',
};

describe('Gorge part 4 pins', () => {
  it("the other territories' intruders never change", () => {
    for (const [area, want] of Object.entries(FINGERPRINTS)) {
      expect(fingerprint(area), area).toBe(want);
    }
  });

  it("the Moor's first visitor is the flat trace's, and stays so", () => {
    const first = visitAt('moor', 30);
    expect(first).not.toBeNull();
    expect(first.visit).toBe(0);
    expect(first.clan).toBe('woods');
  });
});
