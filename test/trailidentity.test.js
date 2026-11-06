import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';

// polish-park2: the Park's paths got a new 'gravel' trail look in
// pathribbon.js. Every OTHER map's trail must come out byte-identical to what
// main (1a3abad) drew: the same geometry arrays, the same segment list, the
// same generated shader text and the same program cache key. These hashes
// were recorded on 1a3abad before pathribbon.js was touched.

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
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

const AREAS = ['woods', 'river', 'moor', 'pines', 'gorge'];

// Recorded on main 1a3abad (see the header).
const PINNED = {
  woods: '58d3e0af8e08970083551df6cd5ebcca6eebc15dcbe196ac32e4ec634805f122',
  river: 'a065becee7820ec3b014d241003027a3015ce09601544053a779becef6373bae',
  moor: 'a30e877411ce76128a4abdadcb3b475eeed63a3957ec1410eb2a4f5912b7f5a5',
  pines: '24c7e9ed54d55c2a9580446b06ccd513a8e4997e09e69599559043813af07e57',
  gorge: '5f6b1d5e6954ec8b5f46205797b8785c29d169122645c99971f5bc7f6cae1e9c',
};

const FAKE_VERT = '#include <common>\nvoid main() {\n#include <begin_vertex>\n}';
const FAKE_FRAG = '#include <common>\nvoid main() {\n#include <color_fragment>\n}';

// Rounded to 0.1 mm before hashing, so a last-digit float difference on
// CI's Linux runners (see test/helpers/closeto.js) cannot flip the hash.
const round = (arr) => Array.from(arr, (v) => (+v.toFixed(4)).toString()).join(',');

function trailHash(mesh) {
  const h = createHash('sha256');
  const g = mesh.geometry;
  for (const k of ['position', 'normal', 'uv', 'trailSeg']) {
    h.update(k);
    h.update(round(g.attributes[k].array));
  }
  h.update(JSON.stringify(mesh.userData.trail, (_k, v) => (typeof v === 'number' ? +v.toFixed(4) : v)));
  const shader = { uniforms: {}, vertexShader: FAKE_VERT, fragmentShader: FAKE_FRAG };
  mesh.material.onBeforeCompile(shader);
  h.update(shader.vertexShader);
  h.update(shader.fragmentShader);
  h.update(JSON.stringify(Object.keys(shader.uniforms)));
  h.update(mesh.material.customProgramCacheKey());
  h.update(String(mesh.material.color.getHex()));
  h.update(String(mesh.renderOrder));
  return h.digest('hex');
}

describe('other maps keep their trail byte-identical (polish-park2)', () => {
  for (const area of AREAS) {
    it(`${area}: trail mesh, segments and shader match main`, async () => {
      const mod = await import(`../src/world/${area}.js`);
      const scene = new THREE.Scene();
      mod.build(scene);
      const trails = scene.children.filter((c) => c.name === 'pathTrail');
      expect(trails.length).toBe(1);
      const got = trailHash(trails[0]);
      expect(got).toBe(PINNED[area]);
    }, 120_000);
  }
});
