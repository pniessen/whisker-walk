import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { trianglesOf, coplanarPairs } from './helpers/coplanar.js';

stubCanvasDocument({ measureText: 10, pointerLock: true });

const { build } = await import('../src/world/roofs.js');
const { BLOCKS, LEVELS } = await import('../src/world/roofsplan.js');

// =============================================================================
// THE CHIMNEY FLICKER (owner, 2026-11-22, a real TV: "the chimney in the right
// flickers"). The stacks' faces on their party walls' planes (x = the stack's
// x) were coplanar with the cheeks, copings and flat roofs' faces beside them,
// in a different colour (the stack's sooty brick against the house's, a stone
// coping): two faces at one depth fight for the depth buffer, and which wins
// changes with the camera by a few millimetres. Each quarter now reaches
// STACK_PROUD past the plane and each coping COPING_PROUD, so no two exposed
// faces share one. This looks for any pair, in the stacks' neighbourhoods, of
// same-facing faces within 1 mm of one plane that overlap and differ in
// material or colour (src/world/roofs.js; test/helpers/coplanar.js).
//
// Not looked for here: the slates' under-edge against the cheeks' sloped tops
// ('terrace' meshes), which a coping covers 1 cm above.
// =============================================================================

const scene = new THREE.Scene();
build(scene);
scene.updateMatrixWorld(true);
const meshes = [];
scene.traverse((o) => { if (o.isMesh) meshes.push(o); });

const stacks = BLOCKS.filter((k) => k.id.startsWith('stack-'));

describe('the chimney stacks: no flickering coplanar faces', () => {
  it('draws every stack', () => {
    expect(stacks.length).toBe(8);
    for (const s of stacks) expect(meshes.some((m) => m.name === s.id)).toBe(true);
  });

  for (const s of stacks) {
    it(`${s.id}: no two overlapping faces of different look share a plane`, () => {
      const box = new THREE.Box3(new THREE.Vector3(s.x - 1.3, LEVELS.FLAT - 0.2, s.z - 1.6), new THREE.Vector3(s.x + 1.3, s.y + 1.6, s.z + 1.6));
      const tris = trianglesOf(meshes, box);
      expect(tris.length).toBeGreaterThan(100); // the neighbourhood is really there
      const bad = coplanarPairs(tris, { onlyDiffering: true })
        .filter((p) => p.a !== 'terrace' && p.b !== 'terrace')
        .map((p) => `${p.a} | ${p.b} at x ${tris[p.i].a.x.toFixed(3)}, y ${tris[p.i].a.y.toFixed(2)}, z ${tris[p.i].a.z.toFixed(2)}`);
      expect(bad).toEqual([]);
    });
  }

  it('the finder sees a planted pair (two boxes, one shared face plane)', () => {
    const mat = new THREE.MeshBasicMaterial();
    const mk = (x0, x1, c) => {
      const g = new THREE.BoxGeometry(x1 - x0, 1, 1).toNonIndexed();
      g.translate((x0 + x1) / 2, 0, 0);
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(c), 3));
      const m = new THREE.Mesh(g, mat); m.updateMatrixWorld(true); return m;
    };
    const tris = trianglesOf([mk(0, 1, 0.2), mk(-1, 0, 0.9), mk(0.4, 1.4, 0.9)], new THREE.Box3(new THREE.Vector3(-5, -5, -5), new THREE.Vector3(5, 5, 5)));
    // boxes 1 and 3 share the face plane x = 1? no: box 1's +x face is at 1, box 3's -x face at 0.4 and +x at 1.4; boxes 1 and 2 touch back to back at x = 0
    expect(coplanarPairs(tris, { onlyDiffering: true }).length).toBeGreaterThan(0); // top and bottom faces, different colours
  });
});
