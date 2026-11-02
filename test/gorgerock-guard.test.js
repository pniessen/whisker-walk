import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { closeDiffs } from './helpers/closeto.js';

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

const { build } = await import('../src/world/gorge.js');
const { GORGE_GROUND_SPEC } = await import('../src/world/gorgeshape.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');

const FIXTURE = fileURLToPath(new URL('./fixtures/gorge-gameplay.json', import.meta.url));
const sha = (s) => createHash('sha256').update(s).digest('hex');

// The Gorge rock polish pass is visual only: this pins the ground's shapes,
// heights and ceilings, the area record, and the draw-call counts, recorded
// from the untouched branch (RECORD_GORGE_GUARD=1 re-records).
function measure() {
  const scene = new THREE.Scene();
  const area = build(scene);
  const ground = area.ground;
  const parts = [];
  for (let x = -62; x <= 62; x += 0.5) {
    for (let z = -62; z <= 62; z += 0.5) {
      const c = ground.ceil(x, z);
      parts.push(ground.y(x, z).toFixed(6), c === Infinity ? 'inf' : c.toFixed(6));
    }
  }
  let meshes = 0, casters = 0;
  // A bare build never sets castShadow (rig.js does, later), so casters are
  // counted by the rule budget.test.js uses: what the renderer would cast.
  const box = new THREE.Box3();
  for (const child of scene.children) {
    box.setFromObject(child);
    const eligible = castsFromBox(box);
    child.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      if (eligible && !isTransparentMat(o.material) && !o.userData.noCast) casters++;
    });
  }
  const rockMeshes = scene.getObjectByName('gorgeRock').children.filter((o) => o.isMesh).map((o) => o.name).sort();
  return {
    specSha: sha(JSON.stringify(GORGE_GROUND_SPEC)),
    groundSha: sha(parts.join(',')),
    area: JSON.parse(JSON.stringify({ ...area, waterFx: undefined, ground: undefined, life: undefined })),
    meshes,
    casters,
    rockMeshes,
  };
}

describe('Gorge gameplay guard', () => {
  it('pins the ground, the area record and the draw counts', () => {
    const now = measure();
    if (process.env.RECORD_GORGE_GUARD === '1') {
      writeFileSync(FIXTURE, JSON.stringify(now, null, 2) + '\n');
      return;
    }
    const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    expect(now.specSha).toBe(fx.specSha);
    expect(now.groundSha).toBe(fx.groundSha);
    expect(closeDiffs(now.area, fx.area)).toEqual([]);
    expect(now.meshes).toBe(54);
    expect(now.casters).toBe(36);
    expect(now.rockMeshes).toEqual(['ledgeTops', 'lips', 'rockFaces']);
  }, 120_000);
});
