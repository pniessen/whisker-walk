import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// polish-pines2 Task 1: pines stop being three flat cones. Tiered, jagged,
// drooping boughs, darker under each tier and lighter at the tips, a small
// per-tree lean and tint, a flared trunk — all inside the pine solid the
// chase camera keeps out of (test/pines.test.js) and the fight camera's
// PINE_OCCLUDER, with the same uuid draws and fade-friendly stand layout.

// The same headless stub every world test uses (see test/docks.test.js).
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
const { PINE_CONES, PINE_TRUNK, PINE_OCCLUDER } = b;

const SPOTS = [[0, 0], [1, 2], [-14.5, 33], [40, -7.25], [3.3, -29.9], [-38, -16], [77, 81], [-120.5, 4]];
const TOL = 0.08;

// test/pines.test.js's pine solid at local height y (scale 1)
const solidR = (y) => {
  let r = y >= 0 && y <= PINE_TRUNK.h ? PINE_TRUNK.rBottom : 0;
  for (const [R, h, cy] of PINE_CONES) {
    const top = cy + h / 2;
    if (y >= cy - h / 2 && y <= top) r = Math.max(r, (R * (top - y)) / h);
  }
  return r;
};
const allowedR = (y) => (y < 0.3 ? Math.max(solidR(y) + TOL, 1.35 * PINE_TRUNK.rBottom) : solidR(y) + TOL);
// test/fightcam.test.js holds every vertex to the occluder itself (1e-3)
const inOccluder = (r, y) => PINE_OCCLUDER.some((c) => y >= c.y0 - 1e-3 && y <= c.y1 + 1e-3 && r <= c.r + 1e-3);

const meshesOf = (g) => g.children.filter((o) => o.isMesh);
const tris = (geo) => geo.index.count / 3;
const lum = (c, i) => 0.2126 * c.getX(i) + 0.7152 * c.getY(i) + 0.0722 * c.getZ(i);

describe('tiered pines (polish-pines2)', () => {
  it('a pine is two indexed, vertex-coloured meshes of 90-130 triangles', () => {
    for (const [x, z] of SPOTS) {
      const g = b.pine(x, z);
      const ms = meshesOf(g);
      expect(ms).toHaveLength(2);
      let t = 0;
      for (const m of ms) {
        expect(m.geometry.index, `${x},${z}`).toBeTruthy();
        expect(m.geometry.attributes.color, `${x},${z}`).toBeTruthy();
        expect(m.material.vertexColors).toBe(true);
        t += tris(m.geometry);
      }
      expect(t).toBeGreaterThanOrEqual(90);
      expect(t).toBeLessThanOrEqual(130);
    }
  });

  it('is the same for the same spot, and differs between spots', () => {
    const arrays = (g) => meshesOf(g).flatMap((m) => [
      Array.from(m.geometry.attributes.position.array), Array.from(m.geometry.attributes.color.array)]);
    expect(arrays(b.pine(3.3, -29.9))).toEqual(arrays(b.pine(3.3, -29.9)));
    expect(arrays(b.pine(3.3, -29.9))).not.toEqual(arrays(b.pine(40, -7.25)));
  });

  it('every vertex stays inside the pine solid and the fight camera occluder', () => {
    for (const [x, z] of SPOTS) {
      const g = b.pine(x, z);
      for (const m of meshesOf(g)) {
        const p = m.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i), r = Math.hypot(p.getX(i), p.getZ(i));
          const at = `${m === g.children[0] ? 'trunk' : 'foliage'} (${x}, ${z}) v${i} y ${y.toFixed(3)} r ${r.toFixed(3)}`;
          expect(y, at).toBeGreaterThanOrEqual(-1e-6);
          expect(y, at).toBeLessThanOrEqual(4.4);
          expect(r, at).toBeLessThanOrEqual(allowedR(y));
          expect(inOccluder(r, y), at).toBe(true);
        }
      }
    }
  });

  it('a tree leans a little, and not all the same way', () => {
    const tip = (x, z) => {
      const p = meshesOf(b.pine(x, z))[1].geometry.attributes.position;
      let best = 0;
      for (let i = 1; i < p.count; i++) if (p.getY(i) > p.getY(best)) best = i;
      return [p.getX(best), p.getZ(best)];
    };
    const tips = SPOTS.map(([x, z]) => tip(x, z));
    for (const [tx, tz] of tips) expect(Math.hypot(tx, tz)).toBeLessThanOrEqual(0.12);
    expect(Math.max(...tips.map(([tx, tz]) => Math.hypot(tx, tz)))).toBeGreaterThan(0.04);
    const dirs = tips.map(([tx, tz]) => Math.atan2(tz, tx));
    expect(Math.max(...dirs) - Math.min(...dirs)).toBeGreaterThan(1);
  });

  it('the trunk flares at its foot and is darker there', () => {
    const trunk = meshesOf(b.pine(1, 2))[0].geometry;
    const p = trunk.attributes.position, c = trunk.attributes.color;
    // the flare is a slimmer stem over a full-width foot: the fight camera's
    // occluder holds the trunk as one rBottom cylinder (see pineParts)
    let foot = 0, stem = Infinity, footLum = 0, nFoot = 0, upLum = 0, nUp = 0;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), r = Math.hypot(p.getX(i), p.getZ(i));
      if (y < 0.01) { foot = Math.max(foot, r); footLum += lum(c, i); nFoot++; }
      if (y > 0.25 && y < 0.35) stem = Math.min(stem, r);
      if (y > 1.0) { upLum += lum(c, i); nUp++; }
    }
    expect(foot).toBeGreaterThan(1.25 * stem);
    expect(footLum / nFoot).toBeLessThan(upLum / nUp);
  });

  it('boughs are darker underneath and inside than at their tips', () => {
    for (const [x, z] of SPOTS) {
      const geo = meshesOf(b.pine(x, z))[1].geometry.clone();
      geo.computeVertexNormals();
      const p = geo.attributes.position, c = geo.attributes.color, n = geo.attributes.normal;
      let under = 0, nu = 0, tip = 0, nt = 0;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), r = Math.hypot(p.getX(i), p.getZ(i));
        if (n.getY(i) < -0.3) { under += lum(c, i); nu++; }
        else if (n.getY(i) > 0.3 && r > 0.75 * solidR(y) && r > 0.3) { tip += lum(c, i); nt++; }
      }
      expect(nu).toBeGreaterThan(0);
      expect(nt).toBeGreaterThan(0);
      expect(tip / nt - under / nu, `${x},${z}`).toBeGreaterThanOrEqual(0.1);
    }
  });

  it('the bottom tier hem is jagged: long low points and raised short notches', () => {
    const p = meshesOf(b.pine(0, 0))[1].geometry.attributes.position;
    const outer = [];
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), r = Math.hypot(p.getX(i), p.getZ(i));
      if (y < 1.7 && r > 0.6) outer.push({ y, r });
    }
    const ys = outer.map((o) => o.y), rs = outer.map((o) => o.r);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.12);
    expect(Math.max(...rs) / Math.min(...rs)).toBeGreaterThan(1.25);
  });

  it('boughs come in at least five tiers (the outline steps out five times)', () => {
    // the silhouette's radius walking up the tree: a tier's hem is a local
    // widest point with a narrower stretch above it
    const p = meshesOf(b.pine(0, 0))[1].geometry.attributes.position;
    const BIN = 0.05, bins = new Array(Math.ceil(4.4 / BIN)).fill(0);
    for (let i = 0; i < p.count; i++) {
      const k = Math.floor(p.getY(i) / BIN);
      bins[k] = Math.max(bins[k], Math.hypot(p.getX(i), p.getZ(i)));
    }
    let steps = 0;
    let lowSince = Infinity;
    for (let k = 0; k < bins.length; k++) {
      if (bins[k] === 0) continue;
      if (bins[k] > lowSince + 0.12) { steps++; lowSince = Infinity; }
      lowSince = Math.min(lowSince, bins[k]);
    }
    // the first hem counts as the step out from nothing
    expect(steps + 1).toBeGreaterThanOrEqual(5);
  });

  it('a stand stays fade-friendly: indexed, no groups, equal per-tree ranges', () => {
    const trees = [
      { x: 0, z: 0, scale: 1 }, { x: 5, z: -3, scale: 1.5 }, { x: -7, z: 9, scale: 0.8 },
      { x: 12.5, z: 4, scale: 1.1 }, { x: -2, z: -11, scale: 1.3, y: 9 },
    ];
    const g = b.pineStand(trees, 7);
    const one = meshesOf(b.pine(0, 0));
    for (const [name, ref] of [['standTrunks', one[0]], ['standFoliage', one[1]]]) {
      const m = g.getObjectByName(name);
      expect(m.castShadow).toBe(true);
      expect(m.material.vertexColors).toBe(true);
      const geo = m.geometry;
      expect(geo.index).toBeTruthy();
      expect(geo.groups).toHaveLength(0);
      expect(geo.index.count % (trees.length * 3)).toBe(0);
      expect(geo.index.count).toBe(trees.length * ref.geometry.index.count);
      expect(geo.attributes.position.count).toBe(trees.length * ref.geometry.attributes.position.count);
      expect(geo.attributes.color.count).toBe(geo.attributes.position.count);
    }
  });

  it('draws Math.random only for uuids, exactly as many as before', () => {
    // baselines measured on main before this build: pine(1, 2) 40 draws,
    // a stand of three 76 (Three's uuid: 4 per geometry, material, Object3D)
    const real = Math.random;
    let n = 0;
    Math.random = () => { n++; return real(); };
    try {
      n = 0; b.pine(1, 2);
      expect(n).toBe(40);
      n = 0; b.pineStand([{ x: 0, z: 0, scale: 1 }, { x: 3, z: 1, scale: 1.2 }, { x: 6, z: 2, scale: 0.9 }], 3);
      expect(n).toBe(76);
    } finally {
      Math.random = real;
    }
  });
});
