import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { createCritters } from '../src/world/lighthousecritters.js';

stubCanvasDocument();
const { build } = await import('../src/world/lighthouse.js');

// Beauty pass 8: the black triangle on the sand was the crab's burrow, a half-metre near-black wedge at 85 % opacity.

describe('lighthouse: no black patches', () => {
  it('a crab burrow is a small, damp, soft mark (never a near-black opaque wedge)', () => {
    const c = createCritters({});
    const tris = [];
    c.update(0, 1 / 30, { x: 14, z: 36, set: true }, [1, 0], (A, B, C, ca, cb, cc) => { tris.push({ A, B, C, cols: [ca, cb, cc] }); return true; });
    const holes = tris.filter((t) => [t.A, t.B, t.C].every((p) => Math.abs(p[1] - 0.16) < 1e-6));
    expect(holes.length).toBeGreaterThanOrEqual(2);
    for (const h of holes) {
      const span = Math.max(...[h.A, h.B, h.C].map((p) => Math.hypot(p[0] - h.A[0], p[2] - h.A[2])));
      expect(span).toBeLessThan(0.4);
      const alphaMax = Math.max(...h.cols.map((k) => k[3]));
      const lumMax = Math.max(...h.cols.map((k) => 0.3 * k[0] + 0.59 * k[1] + 0.11 * k[2]));
      expect(alphaMax <= 0.65 || lumMax > 0.03).toBe(true);
      expect(lumMax).toBeGreaterThan(0.03); // not near-black in linear light
    }
  });

  it('every drawn mesh has finite, non-negative vertex colours, and no floor triangle faces down', () => {
    const scene = new THREE.Scene();
    build(scene, {});
    let bad = 0; let down = 0;
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes.color) return;
      const col = o.geometry.attributes.color;
      for (let i = 0; i < col.array.length; i++) if (!(col.array[i] >= 0)) bad++;
      if (o.userData.ground) {
        const p = o.geometry.attributes.position; const idx = o.geometry.index;
        const n = idx ? idx.count : p.count;
        for (let t = 0; t < n; t += 3) {
          const v = (k) => { const j = idx ? idx.getX(t + k) : t + k; return [p.getX(j), p.getY(j), p.getZ(j)]; };
          const a = v(0); const b = v(1); const c = v(2);
          const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
          if (ny < -1e-9) down++;
        }
      }
    });
    expect(bad).toBe(0);
    expect(down).toBe(0);
  });
});
