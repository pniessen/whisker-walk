import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Polish 2, item 1: the horizon band where it meets water. The band drops the
// cells whose centre is in a water footprint; before this the dry cells next
// to them stood at full hill height, so the far hills over the Pines lake, the
// Moor river's mouth and the Black Mire showed as flat-edged slabs with white
// sky under their cut edges. Now the hills slope down to the waterline, and a
// lake or river running out past the bounds meets hills further out instead of
// leaving a notch of open sky in the horizon.

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
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const AREAS = ['pines', 'moor', 'river', 'woods', 'seaside', 'park', 'neighborhood'];
// The open sea is meant to run to the horizon; every other water closes.
const OPEN = new Set(['seaside']);
const OUT_SEGS = 12; // horizonBand's default; none of these areas overrides it

function bandOf(scene) {
  const m = scene.children.find((c) => c.name === 'horizonBand');
  return m.geometry;
}

const built = {};
for (const name of AREAS) {
  const { build } = await import(`../src/world/${name}.js`);
  const scene = new THREE.Scene();
  build(scene);
  built[name] = bandOf(scene);
}

describe('horizon band meets the water without a cliff', () => {
  for (const name of AREAS) {
    it(`${name}: every cut edge of the band lies at the waterline`, () => {
      const geo = built[name];
      const idx = geo.index.array;
      const pos = geo.attributes.position;
      const ringVerts = 152 * (OUT_SEGS + 1);
      const edges = new Map();
      for (let t = 0; t < idx.length; t += 3) {
        for (const [a, c] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) {
          if (a >= ringVerts || c >= ringVerts) continue;
          const k = a < c ? `${a},${c}` : `${c},${a}`;
          edges.set(k, (edges.get(k) ?? 0) + 1);
        }
      }
      let worst = -Infinity;
      for (const [k, n] of edges) {
        if (n !== 1) continue;
        const [a, c] = k.split(',').map(Number);
        const ja = a % (OUT_SEGS + 1);
        const jc = c % (OUT_SEGS + 1);
        // The inner and outer rims are meant to be open edges.
        if ((ja === 0 && jc === 0) || (ja === OUT_SEGS && jc === OUT_SEGS)) continue;
        worst = Math.max(worst, pos.getY(a), pos.getY(c));
      }
      // At or under the water (y 0.03): nothing to see under the edge.
      expect(worst).toBeLessThanOrEqual(0.05);
    });
  }

  for (const name of AREAS.filter((n) => !OPEN.has(n))) {
    it(`${name}: looking out any way, hills stand on the horizon`, () => {
      const geo = built[name];
      const idx = geo.index.array;
      const pos = geo.attributes.position;
      const ringVerts = 152 * (OUT_SEGS + 1);
      const top = new Array(152).fill(-Infinity);
      // Per column of cells round the ring, the highest cell whose LOWEST
      // corner still clears a metre: a whole hill, not a shared edge vertex.
      for (let t = 0; t < idx.length; t += 3) {
        if (idx[t] >= ringVerts) continue;
        const i = Math.floor(idx[t] / (OUT_SEGS + 1)) % 152;
        const low = Math.min(pos.getY(idx[t]), pos.getY(idx[t + 1]), pos.getY(idx[t + 2]));
        top[i] = Math.max(top[i], low);
      }
      const lowest = Math.min(...top);
      expect(lowest).toBeGreaterThan(1);
    });
  }
});

// Review fix: the far-side closing must not raise hills over the lake's island
// or its bridge, which the Woods, the River and the Moor show across the lake.
describe('the island and its bridge stay clear of the band', async () => {
  const { bridgeEnds, fromWoodsDisc } = await import('../src/world/lake.js');
  for (const name of ['woods', 'river', 'moor']) {
    it(`${name}: no band over the island or the bridge`, () => {
      const geo = built[name];
      const idx = geo.index.array;
      const pos = geo.attributes.position;
      const [a, c] = bridgeEnds(name);
      const isl = fromWoodsDisc(name);
      const segD = (x, z) => {
        const dx = c.x - a.x, dz = c.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        return Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
      };
      let worst = -Infinity;
      for (let t = 0; t < idx.length; t++) {
        const v = idx[t];
        const x = pos.getX(v), z = pos.getZ(v);
        if (segD(x, z) < 2 || Math.hypot(x - isl.x, z - isl.z) < isl.r + 1) worst = Math.max(worst, pos.getY(v));
      }
      expect(worst).toBeLessThanOrEqual(0.05);
    });
  }
});
