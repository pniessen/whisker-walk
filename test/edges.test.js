import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Polish "edges": turning round at a spawn used to show the lawn stopping at a
// hard line, a flat pale strip, then hills. horizonBand now takes `nearColor`
// (the strip under and just past the ground's edge takes the lawn's colour)
// and `edge` (low hedges, scrub, reeds or walls straddling the ground's edge,
// plus a sparse row of trees well outside it), drawn as one separate noCast
// mesh, 'horizonEdge', a child of the band; the band itself is untouched.

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
const { assignShadowCasters } = await import('../src/render/rig.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { scanFootprints } = await import('../src/render/contactshadows.js');

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
  const { edge: _e, ...noEdge } = opts ?? {};
  built[name] = { mod, scene, rec, opts, noEdge: opts ? b.horizonBand(noEdge) : null };
}
const bandOf = (scene) => scene.children.filter((c) => c.name === 'horizonBand');
const edgesIn = (scene) => {
  const out = [];
  scene.traverse((o) => { if (o.name === 'horizonEdge') out.push(o); });
  return out;
};
// The two areas whose ceilings leave room only for the arc behind the spawn.
const ARC_ONLY = ['river', 'moor'];

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
      expect(a.length).toBeGreaterThan(ARC_ONLY.includes(name) ? 30 : 100);
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

  it('EDGE_STYLES is frozen and has the six styles', () => {
    // polish-places Task 4 added 'dune' (the Seaside's; test/seaside.test.js).
    expect(Object.isFrozen(b.EDGE_STYLES)).toBe(true);
    expect(Object.keys(b.EDGE_STYLES).sort()).toEqual(['dune', 'hedge', 'pinescrub', 'reeds', 'scrub', 'wall']);
  });

  it('the River and the Moor: the near ring only on the arc behind the spawn, no tree row', () => {
    for (const name of ARC_ONLY) {
      const { opts, rec } = built[name];
      const arcs = b.EDGE_STYLES[opts.edge.style].arcs;
      expect(arcs, name).toBeTruthy();
      const spots = b.edgeSpots(opts.edge, opts.salt, opts.edge.avoid ?? opts.avoid ?? []);
      expect(spots.filter((s) => s.kind === 'tree')).toHaveLength(0);
      for (const s of spots) expect(arcs.some(([u0, u1]) => s.u >= u0 && s.u <= u1), `${name} u ${s.u}`).toBe(true);
      // ... and that arc is the one behind the spawn: the stretch of edge
      // nearest the spawn on each of its two near sides is dressed.
      const { x: sx, z: sz } = rec.spawn;
      expect(spots.some((s) => s.x > 55 && Math.abs(s.z - sz) < 4), `${name} +x side abreast of the spawn`).toBe(true);
      expect(spots.some((s) => s.z > 55 && Math.abs(s.x - sx) < 4), `${name} +z side abreast of the spawn`).toBe(true);
    }
    // The others run all the way round, with trees.
    for (const name of Object.keys(AREAS).filter((n) => !ARC_ONLY.includes(n))) {
      const { opts } = built[name];
      expect(b.EDGE_STYLES[opts.edge.style].arcs, name).toBeUndefined();
      const spots = b.edgeSpots(opts.edge, opts.salt, opts.edge.avoid ?? opts.avoid ?? []);
      expect(spots.filter((s) => s.kind === 'tree').length, name).toBeGreaterThan(20);
    }
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

describe('the edge, its own noCast mesh under the band', () => {
  // The band's surface under (x, z), from above.
  const ray = new THREE.Raycaster();
  const surfaceAt = (band, x, z) => {
    ray.set(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(band, false)[0];
    return hit ? hit.point.y : null;
  };

  for (const name of Object.keys(AREAS)) {
    it(`${name}: the band is ring only, one 'horizonEdge' child holds the dressing, low near the bounds, dry, gaps open, seated`, () => {
      const { scene, rec, opts, noEdge } = built[name];
      const bands = bandOf(scene);
      expect(bands).toHaveLength(1);
      const band = bands[0];
      expect(band.frustumCulled).toBe(false);
      // The band has no edge vertices: it is exactly the band built without one.
      expect(Array.from(band.geometry.attributes.position.array))
        .toEqual(Array.from(noEdge.geometry.attributes.position.array));
      expect(Array.from(band.geometry.attributes.color.array))
        .toEqual(Array.from(noEdge.geometry.attributes.color.array));
      expect(band.geometry.attributes.position.count).toBeGreaterThanOrEqual(RING);
      // One edge mesh in the whole scene, and it is the band's child.
      const edges = edgesIn(scene);
      expect(edges).toHaveLength(1);
      const edge = edges[0];
      expect(edge.parent).toBe(band);
      expect(edge.isMesh).toBe(true);
      expect(edge.userData.noCast).toBe(true);
      expect(edge.userData.duskTint).toBe(true);
      expect(edge.frustumCulled).toBe(false);
      expect(edge.material.vertexColors).toBe(true);
      expect(edge.material.flatShading).toBe(true);
      expect(edge.material.color.getHex()).toBe(0xffffff);
      expect(edge.position.toArray()).toEqual([0, 0, 0]);
      expect(band.position.toArray()).toEqual([0, 0, 0]);

      const pos = edge.geometry.attributes.position;
      const col = edge.geometry.attributes.color;
      expect(pos.count).toBeGreaterThan(0);
      const waters = rec.waters ?? [];
      // Every area but the Neighbourhood has water, so the dry check below
      // must have something to check against.
      if (name !== 'neighborhood') expect(waters.length, `${name} waters`).toBeGreaterThan(0);
      const gaps = opts.edge.gaps ?? [];
      let near = 0;
      for (let v = 0; v < pos.count; v++) {
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

      // Seated: at every spot something of the piece reaches down to (into)
      // the band's surface under it (which is sunk just under the ground
      // plane where the two overlap). Nothing floats.
      const spots = b.edgeSpots(opts.edge, opts.salt, opts.edge.avoid ?? opts.avoid ?? []);
      let checked = 0;
      for (const sp of spots) {
        const ground = surfaceAt(band, sp.x, sp.z);
        if (ground === null) continue;
        let low = Infinity;
        for (let v = 0; v < pos.count; v++) {
          if (Math.hypot(pos.getX(v) - sp.x, pos.getZ(v) - sp.z) < 1.6) low = Math.min(low, pos.getY(v));
        }
        if (low === Infinity) continue; // a piece dropped for water
        checked++;
        expect(low, `${sp.kind} at ${sp.x.toFixed(1)},${sp.z.toFixed(1)} (ground ${ground.toFixed(2)})`)
          .toBeLessThanOrEqual(ground + 1e-6);
      }
      expect(checked).toBeGreaterThan(spots.length * 0.8);
    }, 120_000);
  }

  it('an unknown edge style throws rather than drawing an undressed band', () => {
    expect(() => b.horizonBand({ inner: 56, outer: 116, edge: { half: 60, style: 'hegde' } })).toThrow(/unknown style/);
    expect(() => b.edgeSpots({ half: 60, style: 'nope' }, 1, [])).toThrow(/unknown style/);
  });

  it('the neighbourhood edge has gates: brown vertices inside each gap, none over 1.1 m', () => {
    const { scene, opts } = built.neighborhood;
    const edge = edgesIn(scene)[0];
    const pos = edge.geometry.attributes.position;
    const col = edge.geometry.attributes.color;
    expect(opts.edge.gaps.length).toBeGreaterThan(0);
    for (const gp of opts.edge.gaps) {
      let brown = 0;
      for (let v = 0; v < pos.count; v++) {
        if (Math.hypot(pos.getX(v) - gp.x, pos.getZ(v) - gp.z) < gp.r && !green(col.getX(v), col.getY(v))) {
          brown++;
          expect(pos.getY(v)).toBeLessThanOrEqual(1.1);
        }
      }
      expect(brown, `gate at ${gp.x},${gp.z}`).toBeGreaterThan(0);
    }
  });

  it('the moor wall is stone in at least two greys with an uneven top, and its gorse sits inside it', () => {
    const { scene } = built.moor;
    const edge = edgesIn(scene)[0];
    const pos = edge.geometry.attributes.position;
    const col = edge.geometry.attributes.color;
    const greys = new Set();
    const tops = new Set();
    let gorseIn = 0;
    for (let v = 0; v < pos.count; v++) {
      const r = col.getX(v); const g = col.getY(v); const bl = col.getZ(v);
      const grey = Math.max(r, g, bl) - Math.min(r, g, bl) < 0.2 * Math.max(r, g, bl);
      if (grey) {
        greys.add(Math.round((r + g + bl) * 20));
        if (pos.getY(v) > 0.5) tops.add(Math.round(pos.getY(v) * 50));
      } else if (Math.max(Math.abs(pos.getX(v)), Math.abs(pos.getZ(v))) < 60.3) gorseIn++;
    }
    expect(greys.size).toBeGreaterThanOrEqual(2);
    expect(tops.size).toBeGreaterThanOrEqual(5);
    expect(gorseIn).toBeGreaterThan(0);
  });

  it('the shadow sweep, the prop merge and the contact shadows leave the edge alone', () => {
    for (const name of ['neighborhood', 'moor']) {
      const scene = new THREE.Scene();
      built[name].mod.build(scene);
      const band = bandOf(scene)[0];
      const edge = edgesIn(scene)[0];
      const geo = edge.geometry;
      // Contact shadows: top-level scan, the band (and its child) ruled out
      // by size — the same footprints with or without the edge.
      const withEdge = scanFootprints(scene).length;
      band.remove(edge);
      expect(scanFootprints(scene).length).toBe(withEdge);
      band.add(edge);
      // Merge: the band is a top-level mesh and is skipped with its child.
      mergeStaticProps(scene);
      expect(edge.parent).toBe(band);
      expect(band.parent).toBe(scene);
      expect(edge.geometry).toBe(geo);
      // Shadows: the band casts, the edge neither casts nor is swept.
      assignShadowCasters(scene);
      expect(band.castShadow, name).toBe(true);
      expect(edge.castShadow, name).toBe(false);
      expect(edge.receiveShadow, name).toBe(false);
    }
  }, 120_000);
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
    for (const nm of ['horizonBand', 'horizonEdge']) {
      const g1 = s1.getObjectByName(nm).geometry;
      const g2 = s2.getObjectByName(nm).geometry;
      expect(Array.from(g1.attributes.position.array)).toEqual(Array.from(g2.attributes.position.array));
      expect(Array.from(g1.attributes.color.array)).toEqual(Array.from(g2.attributes.color.array));
    }
  }, 120_000);

  it('b.horizonBand with an edge: the same band, plus one horizonEdge child', () => {
    const opts = { kind: 'hills', inner: 56, outer: 116, height: 7, salt: 5, nearColor: 0x7cb860 };
    const m = b.horizonBand({ ...opts, edge: { half: 60, style: 'scrub' } });
    const plain = b.horizonBand(opts);
    expect(m.isMesh).toBe(true);
    expect(m.name).toBe('horizonBand');
    expect(Array.from(m.geometry.attributes.position.array)).toEqual(Array.from(plain.geometry.attributes.position.array));
    expect(m.children).toHaveLength(1);
    expect(m.children[0].name).toBe('horizonEdge');
    expect(m.children[0].geometry.attributes.color).toBeDefined();
    expect(plain.children).toHaveLength(0);
  });
});

describe('Twolegplace rooftops', () => {
  it('the woods rooftops carry terracotta pitched roofs, all after the ring', () => {
    const geo = built.woods.scene.getObjectByName('horizonBand').geometry;
    const col = geo.attributes.color.array;
    let n = 0;
    for (let v = 0; v < geo.attributes.position.count; v++) {
      const r = col[v * 3], g = col[v * 3 + 1], bl = col[v * 3 + 2];
      if (r > g * 1.25 && r > bl * 1.4) {
        n++;
        expect(v).toBeGreaterThanOrEqual(RING);
      }
    }
    expect(n).toBeGreaterThanOrEqual(14 * 6);
  }, 120_000);
});

// Task 3: the Seaside's boats get a cabin and a sail; the cliff gets real rock.
describe('Seaside boats and cliff', () => {
  const buildSea = async () => {
    const { build } = await import('../src/world/seaside.js');
    const scene = new THREE.Scene();
    build(scene);
    return scene;
  };
  const boatsOf = (scene) => {
    const out = [];
    scene.traverse((o) => { if (o.isGroup && o.userData.boat) out.push(o); });
    return out;
  };
  const cliffOf = (scene) => scene.children.find((c) => c.isMesh
    && Math.abs(c.position.x + 10) < 1e-6 && Math.abs(c.position.y - 4) < 1e-6 && Math.abs(c.position.z + 46) < 1e-6);

  it('three boats, each a hull with a cabin and a sail in vertex colours plus a mast', async () => {
    const scene = await buildSea();
    const boats = boatsOf(scene);
    expect(boats).toHaveLength(3);
    for (const boat of boats) {
      const meshes = boat.children.filter((c) => c.isMesh);
      expect(meshes).toHaveLength(2);
      const hull = meshes.find((m) => m.geometry.attributes.color);
      expect(hull).toBeDefined();
      expect(hull.material.vertexColors).toBe(true);
      expect(hull.material.color.getHex()).toBe(0xffffff);
      hull.geometry.computeBoundingBox();
      const bb = hull.geometry.boundingBox;
      expect(bb.max.y - bb.min.y).toBeGreaterThan(3);
      const col = hull.geometry.attributes.color;
      const tones = new Set();
      for (let v = 0; v < col.count; v++) {
        tones.add(`${col.getX(v).toFixed(3)},${col.getY(v).toFixed(3)},${col.getZ(v).toFixed(3)}`);
      }
      expect(tones.size).toBeGreaterThanOrEqual(3);
    }
  }, 120_000);

  it('the cliff never leaves its face, wears a green cap and at least three band tones', async () => {
    const scene = await buildSea();
    const cliff = cliffOf(scene);
    expect(cliff).toBeDefined();
    const geo = cliff.geometry;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const col = geo.attributes.color;
    let pushed = 0;
    for (let v = 0; v < pos.count; v++) {
      expect(pos.getZ(v) + cliff.position.z).toBeLessThanOrEqual(-37 + 1e-3);
      if (pos.getZ(v) + cliff.position.z < -37 - 0.2 && pos.getZ(v) + cliff.position.z > -38.5) pushed++;
    }
    expect(pushed).toBeGreaterThan(0); // gullies cut into the face
    let caps = 0;
    for (let v = 0; v < pos.count; v++) {
      if (nrm.getY(v) > 0.9) {
        caps++;
        expect(col.getY(v)).toBeGreaterThan(col.getX(v));
      }
    }
    expect(caps).toBeGreaterThan(0);
    // The seaward face is BoxGeometry's fifth group (px, nx, py, ny, pz, nz).
    const g = geo.groups[4];
    const idx = geo.index.array;
    const bottom = Math.min(...Array.from({ length: pos.count }, (_, v) => pos.getY(v)));
    // Quantised to the base tones: the gully shadow and the damp foot only
    // SCALE a vertex's band tone, so its chromaticity (colour / its sum) names
    // the band tone it wears. Counting raw colours would count gully shading
    // (every vertex distinct); this fails if the face wears one tone.
    const chroma = (r, g2, b) => { const t = r + g2 + b; return [r / t, g2 / t, b / t]; };
    const bases = [0xe2cfa8, 0xc9a46c, 0xb07c58, 0xd8c4a0].map((h) => { const c = new THREE.Color(h); return chroma(c.r, c.g, c.b); });
    const tones = new Set();
    for (let k = g.start; k < g.start + g.count; k++) {
      const v = idx[k];
      if (col.getY(v) > col.getX(v)) continue; // the grass lip
      const c = chroma(col.getX(v), col.getY(v), col.getZ(v));
      const d = bases.map((b) => Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]));
      const best = d.indexOf(Math.min(...d));
      expect(d[best]).toBeLessThan(1e-4); // every rock vertex IS one of the four, scaled
      tones.add(best);
    }
    // Three: the 8m face has ~8 bands but its hashed picks land on three of
    // the four tones (measured; the old raw-colour count of 4 was gully shading).
    expect(tones.size).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it('building the seaside twice gives the same hulls and cliff', async () => {
    const a = await buildSea();
    const c = await buildSea();
    const arrs = (s) => [...boatsOf(s).map((bt) => bt.children.find((m) => m.geometry?.attributes.color)),
      cliffOf(s)].flatMap((m) => [Array.from(m.geometry.attributes.position.array),
      Array.from(m.geometry.attributes.color.array)]);
    const A = arrs(a);
    const C = arrs(c);
    expect(A).toHaveLength(8);
    for (let i = 0; i < A.length; i++) expect(A[i]).toEqual(C[i]);
  }, 120_000);

  // Fix round 1: what the live look asked for.
  const rockBoxes = (scene) => scene.children.filter((c) => c.isMesh && c.geometry.type === 'BoxGeometry'
    && c.geometry.parameters.height === 8);
  const lum = (col, v) => (col.getX(v) + col.getY(v) + col.getZ(v)) / 3;
  const isGreen = (col, v) => col.getY(v) > col.getX(v) * 1.1 && col.getY(v) > col.getZ(v) * 1.1;

  it('cliff and overlook: every push stays inside the original box', async () => {
    const scene = await buildSea();
    const boxes = rockBoxes(scene);
    expect(boxes).toHaveLength(2);
    for (const m of boxes) {
      const { width, depth } = m.geometry.parameters;
      const pos = m.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        expect(Math.abs(pos.getX(v))).toBeLessThanOrEqual(width / 2 + 1e-5);
        expect(Math.abs(pos.getZ(v))).toBeLessThanOrEqual(depth / 2 + 1e-5);
      }
    }
  }, 120_000);

  it('the cliff face is about the old 0xb09878 on average, its gullies darker, a green lip at its top', async () => {
    const scene = await buildSea();
    const cliff = cliffOf(scene);
    const geo = cliff.geometry;
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    const g = geo.groups[4];
    const idx = geo.index.array;
    const seen = new Set();
    let sum = 0;
    let n = 0;
    let flatMax = 0;
    const deep = [];
    let lip = 0;
    let topY = -Infinity;
    for (let v = 0; v < pos.count; v++) topY = Math.max(topY, pos.getY(v));
    for (let k = g.start; k < g.start + g.count; k++) {
      const v = idx[k];
      if (seen.has(v)) continue;
      seen.add(v);
      if (isGreen(col, v)) { lip++; continue; }
      if (pos.getY(v) < -4 + 0.95) continue; // the damp foot
      const push = -(pos.getZ(v) - 9); // depth 18: the face stood at local z 9
      if (push < 1e-6) flatMax = Math.max(flatMax, lum(col, v));
      else if (push > 0.6) deep.push(lum(col, v));
      sum += lum(col, v);
      n++;
    }
    const old = new THREE.Color(0xb09878);
    const oldMean = (old.r + old.g + old.b) / 3;
    expect(sum / n).toBeGreaterThan(oldMean * 0.75);
    expect(sum / n).toBeLessThan(oldMean * 1.1);
    expect(deep.length).toBeGreaterThan(0);
    for (const d of deep) expect(d).toBeLessThanOrEqual(flatMax * 0.8);
    expect(lip).toBeGreaterThan(20);
    // The lip is a lip: every green face vertex sits in the top 0.6m of its column.
    for (const v of seen) if (isGreen(col, v)) expect(pos.getY(v)).toBeGreaterThan(4 - 1 - 0.6);
  }, 120_000);
});
