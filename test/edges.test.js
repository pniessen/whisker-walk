import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Polish "edges": turning round at a spawn used to show the lawn stopping at a
// hard line, a flat pale strip, then hills. horizonBand now takes `nearColor`
// (the strip under and just past the ground's edge takes the lawn's colour)
// and `edge` (low hedges, scrub, reeds or walls straddling the ground's edge,
// plus a sparse row of trees well outside it), all merged into the one band.

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

const b = await import('../src/world/builder.js');

const RING = 152 * 13; // horizonBand's default ring: 152 around by 13 out
const AREAS = {
  neighborhood: 'NEIGHBORHOOD_HORIZON',
  park: 'PARK_HORIZON',
  river: 'RIVER_HORIZON',
  woods: 'WOODS_HORIZON',
  moor: 'MOOR_HORIZON',
  pines: 'PINES_HORIZON',
};
const EXPECTED = {
  neighborhood: { nearColor: 0x7cb860, style: 'hedge' },
  park: { nearColor: 0x6cb058, style: 'hedge' },
  river: { nearColor: 0x7d9c55, style: 'reeds' },
  woods: { nearColor: 0x5f9a4a, style: 'scrub' },
  moor: { nearColor: 0x8a9558, style: 'wall' },
  pines: { nearColor: 0x56603e, style: 'pinescrub' },
};

// How far (x, z) lies outside a bounds box, Chebyshev: 0 or less is inside.
const outside = (bd, x, z) => Math.max(x - bd.maxX, bd.minX - x, z - bd.maxZ, bd.minZ - z);
const green = (r, g) => g > r * 1.2;

const built = {};
for (const [name, key] of Object.entries(AREAS)) {
  const mod = await import(`../src/world/${name}.js`);
  const scene = new THREE.Scene();
  const rec = mod.build(scene);
  const opts = mod[key];
  const { edge: _e, nearColor: _n, ...plainOpts } = opts ?? {};
  built[name] = { mod, scene, rec, opts, plain: opts ? b.horizonBand(plainOpts) : null };
}

describe('edgeSpots', () => {
  for (const name of Object.keys(AREAS)) {
    it(`${name}: deterministic, and every spot is at least 4.5 m outside the bounds`, () => {
      const { opts, rec } = built[name];
      expect(opts, `${AREAS[name]} exported`).toBeTruthy();
      expect(Object.isFrozen(opts)).toBe(true);
      expect(opts.nearColor).toBe(EXPECTED[name].nearColor);
      expect(opts.edge.style).toBe(EXPECTED[name].style);
      expect(opts.edge.half).toBe(60);
      const avoid = opts.edge.avoid ?? opts.avoid ?? [];
      const a = b.edgeSpots(opts.edge, opts.salt, avoid);
      const c = b.edgeSpots(opts.edge, opts.salt, avoid);
      expect(a).toEqual(c);
      expect(a.length).toBeGreaterThan(100);
      const bd = rec.bounds;
      for (const s of a) {
        // the side it sits on is the axis it is furthest along
        const out = Math.abs(s.x) >= Math.abs(s.z)
          ? (s.x > 0 ? s.x - bd.maxX : bd.minX - s.x)
          : (s.z > 0 ? s.z - bd.maxZ : bd.minZ - s.z);
        expect(out, `${s.kind} at ${s.x.toFixed(1)},${s.z.toFixed(1)}`).toBeGreaterThanOrEqual(4.5);
        expect(Number.isFinite(s.yaw)).toBe(true);
      }
    });
  }

  it('EDGE_STYLES is frozen and has the five styles', () => {
    expect(Object.isFrozen(b.EDGE_STYLES)).toBe(true);
    expect(Object.keys(b.EDGE_STYLES).sort()).toEqual(['hedge', 'pinescrub', 'reeds', 'scrub', 'wall']);
  });

  it('skips spots in the water and in the gaps, and puts a gate in each hedge gap', () => {
    const gaps = [{ x: 0, z: 60.6, r: 3 }];
    const water = [{ id: 'w', kind: 'rect', minX: 50, maxX: 120, minZ: -10, maxZ: 10 }];
    const spots = b.edgeSpots({ half: 60, style: 'hedge', gaps }, 3, water);
    for (const s of spots) {
      if (s.kind === 'gate') continue;
      expect(Math.hypot(s.x - 0, s.z - 60.6)).toBeGreaterThanOrEqual(3);
      expect(b.waterClearance(water, s.x, s.z)).toBeGreaterThanOrEqual(1.5);
    }
    expect(spots.filter((s) => s.kind === 'gate')).toHaveLength(1);
    expect(b.edgeSpots({ half: 60, style: 'scrub', gaps }, 3, water).filter((s) => s.kind === 'gate')).toHaveLength(0);
  });
});

describe('the edge, merged into the band', () => {
  for (const name of Object.keys(AREAS)) {
    it(`${name}: one band, grown, low near the bounds, dry, gaps open`, () => {
      const { scene, rec, opts, plain } = built[name];
      const bands = scene.children.filter((c) => c.name === 'horizonBand');
      expect(bands).toHaveLength(1);
      const band = bands[0];
      expect(band.frustumCulled).toBe(false);
      const pos = band.geometry.attributes.position;
      const col = band.geometry.attributes.color;
      const start = plain.geometry.attributes.position.count;
      expect(pos.count).toBeGreaterThan(start);
      expect(start).toBeGreaterThanOrEqual(RING);
      const waters = rec.waters ?? [];
      const gaps = opts.edge.gaps ?? [];
      let near = 0;
      for (let v = start; v < pos.count; v++) {
        const x = pos.getX(v);
        const y = pos.getY(v);
        const z = pos.getZ(v);
        if (outside(rec.bounds, x, z) <= 11) {
          near++;
          expect(y, `vertex ${v} at ${x.toFixed(1)},${z.toFixed(1)}`).toBeLessThanOrEqual(1.6);
        }
        expect(b.waterClearance(waters, x, z), `vertex ${v} at ${x.toFixed(1)},${z.toFixed(1)}`).toBeGreaterThanOrEqual(1.0);
        for (const gp of gaps) {
          if (Math.hypot(x - gp.x, z - gp.z) < gp.r) {
            expect(green(col.getX(v), col.getY(v)), `hedge vertex ${v} in a gap`).toBe(false);
          }
        }
      }
      expect(near).toBeGreaterThan(0);
    }, 120_000);
  }

  it('the neighbourhood band has gates: brown vertices inside each gap', () => {
    const { scene, opts } = built.neighborhood;
    const band = scene.getObjectByName('horizonBand');
    const pos = band.geometry.attributes.position;
    const col = band.geometry.attributes.color;
    expect(opts.edge.gaps.length).toBeGreaterThan(0);
    for (const gp of opts.edge.gaps) {
      let brown = 0;
      for (let v = RING; v < pos.count; v++) {
        if (Math.hypot(pos.getX(v) - gp.x, pos.getZ(v) - gp.z) < gp.r && !green(col.getX(v), col.getY(v))) brown++;
      }
      expect(brown, `gate at ${gp.x},${gp.z}`).toBeGreaterThan(0);
    }
  });
});

describe('near colour', () => {
  it('the neighbourhood band\'s near strip is the lawn colour, its far ring is not', () => {
    const { scene, opts } = built.neighborhood;
    const band = scene.getObjectByName('horizonBand');
    const pos = band.geometry.attributes.position;
    const col = band.geometry.attributes.color;
    const lawn = new THREE.Color(0x7cb860);
    const flat = opts.flat ?? 10;
    const ramp = opts.ramp ?? 26;
    let nearN = 0;
    let farN = 0;
    for (let v = 0; v < RING; v++) {
      const d = Math.max(Math.abs(pos.getX(v)), Math.abs(pos.getZ(v))) - opts.inner;
      const off = Math.max(Math.abs(col.getX(v) - lawn.r), Math.abs(col.getY(v) - lawn.g), Math.abs(col.getZ(v) - lawn.b));
      if (d <= flat + 1e-6) {
        nearN++;
        expect(off).toBeLessThanOrEqual(0.02);
      } else if (d >= flat + ramp) {
        farN++;
        expect(off).toBeGreaterThan(0.02);
      }
    }
    expect(nearN).toBeGreaterThan(0);
    expect(farN).toBeGreaterThan(0);
    expect(band.material.color.getHex()).toBe(0xffffff);
  });
});

describe('determinism and shape', () => {
  it('building the woods twice gives the same band', async () => {
    const { build } = await import('../src/world/woods.js');
    const s1 = new THREE.Scene();
    const s2 = new THREE.Scene();
    build(s1);
    build(s2);
    const g1 = s1.getObjectByName('horizonBand').geometry;
    const g2 = s2.getObjectByName('horizonBand').geometry;
    expect(Array.from(g1.attributes.position.array)).toEqual(Array.from(g2.attributes.position.array));
    expect(Array.from(g1.attributes.color.array)).toEqual(Array.from(g2.attributes.color.array));
  }, 120_000);

  it('b.horizonBand with an edge is still one named mesh with a material colour', () => {
    const m = b.horizonBand({
      kind: 'hills', inner: 56, outer: 116, height: 7, salt: 5,
      nearColor: 0x7cb860, edge: { half: 60, style: 'scrub' },
    });
    expect(m.isMesh).toBe(true);
    expect(m.name).toBe('horizonBand');
    expect(m.material.color).toBeDefined();
    expect(m.geometry.attributes.color).toBeDefined();
  });
});
