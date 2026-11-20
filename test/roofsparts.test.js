import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HOP_MARKS, ROOFS_TRAVERSAL } from '../src/world/roofsplan.js';
import {
  createWindowAtlas, windowCell, addWindowQuads, roofsMaterials, PARTS, markMesh,
} from '../src/world/roofsparts.js';

describe('roofsparts', () => {
  it('the atlas is the same twice and lights most windows', () => {
    const a = createWindowAtlas();
    const b = createWindowAtlas();
    expect(a.size).toBe(64);
    expect(a.cells).toBe(16);
    expect(a.texture.isDataTexture).toBe(true);
    expect(Array.from(a.texture.image.data)).toEqual(Array.from(b.texture.image.data));
    let lit = 0;
    for (let i = 0; i < 200; i++) {
      const c = windowCell(i * 3.7 - 40, (i % 17) * 2.3 + i * 0.11, i);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(15);
      if (c <= 10) lit++;
    }
    expect(lit / 200).toBeGreaterThanOrEqual(0.6);
    expect(windowCell(3, 4, 5)).toBe(windowCell(3, 4, 5));
  });

  it('every window quad uses the one windows material and stays inside its cell', () => {
    const mats = roofsMaterials();
    expect(mats.windows.emissiveMap).toBeTruthy();
    expect(mats.windows.emissiveMap.isDataTexture).toBe(true);
    const list = [
      { x: 2, y: 3, z: 5, nx: 0, nz: 1, w: 1, h: 1.4, cell: 0 },
      { x: 4, y: 3, z: 5, nx: 1, nz: 0, w: 1, h: 1.4, cell: 9 },
      { x: 6, y: 3, z: 5, nx: -1, nz: 0, w: 1, h: 1.4, cell: 15 },
    ];
    const g = addWindowQuads(list, null).geometry;
    expect(g.index).toBeTruthy();
    for (const k of ['position', 'normal', 'uv', 'color']) expect(g.attributes[k]).toBeTruthy();
    list.forEach((q, i) => {
      const col = q.cell % 4;
      const row = Math.floor(q.cell / 4);
      for (let v = 0; v < 4; v++) {
        const u = g.attributes.uv.getX(i * 4 + v);
        const w = g.attributes.uv.getY(i * 4 + v);
        expect(u).toBeGreaterThanOrEqual(col / 4);
        expect(u).toBeLessThanOrEqual((col + 1) / 4);
        expect(w).toBeGreaterThanOrEqual(row / 4);
        expect(w).toBeLessThanOrEqual((row + 1) / 4);
        const px = g.attributes.position.getX(i * 4 + v) - q.x;
        const pz = g.attributes.position.getZ(i * 4 + v) - q.z;
        expect(Math.abs(px * q.nx + pz * q.nz)).toBeCloseTo(0.02, 6);
      }
    });
    const mesh = new THREE.Mesh(g, mats.windows);
    expect(mesh.material).toBe(mats.windows);
  });

  it('every mark kind in HOP_MARKS has a mesh, and its glow casts no shadow', () => {
    expect(PARTS.box && PARTS.pot && PARTS.ridge && PARTS.gutter && PARTS.coping && PARTS.plank && PARTS.line).toBeTruthy();
    const hop = { kind: 'leap', mark: 'lip', from: { x: 1, z: 2, y: 3 }, to: { x: 3, z: 2, y: 3 } };
    const glows = new Set();
    for (const kind of Object.keys(HOP_MARKS)) {
      for (const mark of HOP_MARKS[kind]) {
        const o = markMesh(mark, { ...hop, kind, mark });
        expect(o.isObject3D).toBe(true);
        let meshes = 0;
        let glow = 0;
        o.traverse((m) => {
          if (!m.isMesh) return;
          meshes++;
          if (m.userData.markGlow) {
            glow++;
            glows.add(m.material);
            expect(m.castShadow).toBe(false);
            expect(m.userData.noCast).toBe(true);
          }
        });
        expect(meshes).toBeGreaterThan(1);
        expect(glow).toBe(1);
      }
    }
    expect(glows.size).toBe(1);
    // every real hop in the plan gets a mark too
    const t = ROOFS_TRAVERSAL;
    for (const h of [...t.gaps, ...t.drops, ...t.climbs]) expect(markMesh(h.mark, h).isObject3D).toBe(true);
  });
});
