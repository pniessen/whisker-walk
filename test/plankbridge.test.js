import { describe, it, expect, vi } from 'vitest';

// Headless canvas, as test/straywater.test.js stubs it, before builder loads.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
});
const { plankBridge } = await import('../src/world/builder.js');
const { repeatFor, tileMetres } = await import('../src/render/materials.js');
const { BRIDGE_PLANK } = await import('../src/world/lake.js');

// The Pines' bridge plank is a box with one material, its repeat set from the
// top face (w x len). Its thin sides and ends need their own UVs, or the
// plank texture is squashed some fifteen times across the 0.12 m edge.
describe('the bridge plank texture', () => {
  const P = BRIDGE_PLANK;
  const len = 13.4;
  const mesh = plankBridge(0, 0, 0, len, P.w, P.y, P.thick);
  const geo = mesh.geometry;
  const uv = geo.getAttribute('uv');
  const pos = geo.getAttribute('position');
  const [ru, rv] = repeatFor('wood', P.w, len);
  const t = tileMetres('wood');
  // For one face (a BoxGeometry group), metres of texture tile per metre of
  // plank, along each texture axis, and which local axis the texture's v
  // (the plank texture's grain) runs along.
  function face(g) {
    const idx = geo.index.array.slice(g.start, g.start + g.count);
    const verts = [...new Set(idx)];
    const span = (axis) => {
      const vals = verts.map((i) => axis(i));
      return Math.max(...vals) - Math.min(...vals);
    };
    // Along the face's texture-u direction: two vertices that differ in u only.
    const a = verts[0];
    const du = verts.find((i) => Math.abs(uv.getY(i) - uv.getY(a)) < 1e-9 && Math.abs(uv.getX(i) - uv.getX(a)) > 1e-9);
    const dv = verts.find((i) => Math.abs(uv.getX(i) - uv.getX(a)) < 1e-9 && Math.abs(uv.getY(i) - uv.getY(a)) > 1e-9);
    const metres = (i) => Math.hypot(pos.getX(i) - pos.getX(a), pos.getY(i) - pos.getY(a), pos.getZ(i) - pos.getZ(a));
    const along = (i) => {
      const d = [Math.abs(pos.getX(i) - pos.getX(a)), Math.abs(pos.getY(i) - pos.getY(a)), Math.abs(pos.getZ(i) - pos.getZ(a))];
      return 'xyz'[d.indexOf(Math.max(...d))];
    };
    return {
      uDensity: (Math.abs(uv.getX(du) - uv.getX(a)) * ru * t) / metres(du),
      vDensity: (Math.abs(uv.getY(dv) - uv.getY(a)) * rv * t) / metres(dv),
      vAlong: along(dv),
      span,
    };
  }

  it('every face tiles the wood at about its natural size, both ways', () => {
    for (const [k, g] of geo.groups.entries()) {
      const f = face(g);
      expect(f.uDensity, `face ${k} u`).toBeGreaterThan(0.75);
      expect(f.uDensity, `face ${k} u`).toBeLessThan(1.34);
      expect(f.vDensity, `face ${k} v`).toBeGreaterThan(0.75);
      expect(f.vDensity, `face ${k} v`).toBeLessThan(1.34);
    }
  });

  it('the grain runs along the plank on the top and on both long sides', () => {
    // groups: +x, -x, +y, -y, +z, -z; the plank's length is its local z.
    const g = geo.groups;
    for (const k of [0, 1, 2, 3]) expect(face(g[k]).vAlong, `face ${k}`).toBe('z');
  });
});
