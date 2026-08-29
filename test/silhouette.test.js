import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses — see test/docks.test.js
// for why a blanket Proxy is not enough (render/textures.js's painters read
// their own canvas back through getImageData).
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
const { qualifies } = await import('../src/render/contactshadows.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { build: buildSeaside } = await import('../src/world/seaside.js');
const { build: buildDen } = await import('../src/world/den.js');

// ---------------------------------------------------------------------------
// Wave 4 — silhouette (docs/VISUAL-PASS.md).
//
// Lives in its own file rather than in test/builder.test.js because that file
// already carries four suites from three earlier waves and was being edited
// concurrently while this one landed. Nothing here duplicates it.
// ---------------------------------------------------------------------------

const triangles = (geo) =>
  (geo.index ? geo.index.count : geo.attributes.position.count) / 3;

const boundsOf = (geo) => {
  const bb = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
  return bb;
};

describe('builder — roundedBox (Wave 4.1)', () => {
  it('keeps EXACTLY BoxGeometry\'s bounding box, which is the load-bearing contract', () => {
    // This is the property everything downstream depends on and the one a
    // reasonable-looking "rounded box" implementation gets wrong. A FILLET
    // pulls the face planes in; a CHAMFER cuts only the corners, so the six
    // extreme planes stay put. render/contactshadows.js sizes every decal
    // from Box3.setFromObject, world/den.js and world/docks.js author perch
    // heights against a box's top face, and test/climbing.test.js BFSes those
    // heights — all three read the same numbers before and after this wave
    // only because of this.
    for (const dims of [[5, 3, 4], [1.2, 1.1, 1.2], [0.1, 1, 0.1], [0.56, 0.045, 0.045]]) {
      const plain = boundsOf(new THREE.BoxGeometry(...dims));
      const round = boundsOf(b.roundedBox(...dims));
      expect(round.min.toArray()).toEqual(plain.min.toArray());
      expect(round.max.toArray()).toEqual(plain.max.toArray());
    }
  });

  it('is a 44-triangle chamfer: 6 faces + 12 bevels + 8 corners', () => {
    const geo = b.roundedBox(1, 1, 1);
    expect(triangles(geo)).toBe(44);
    // 26 distinct flat normals — one per facet. If a future edit ever
    // smooth-shades this, the count collapses and the chamfer stops being a
    // highlight catcher, which is the entire point of the item.
    const n = geo.attributes.normal;
    const seen = new Set();
    for (let i = 0; i < n.count; i++) {
      seen.add([n.getX(i), n.getY(i), n.getZ(i)].map((v) => v.toFixed(4)).join(','));
    }
    expect(seen.size).toBe(26);
  });

  it('reproduces BoxGeometry\'s uv layout, so surfBox\'s derived repeats still land', () => {
    // materials.js's whole tiling vocabulary assumes a box maps 0..1 per face.
    // The chamfer projects planarly rather than handing the shrunken face a
    // fresh 0..1 — so the interval still spans the full width, the bevels
    // carry the outermost sliver, and the tile density is unchanged.
    const geo = b.roundedBox(2, 3, 4);
    const uv = geo.attributes.uv;
    let umin = Infinity; let umax = -Infinity; let vmin = Infinity; let vmax = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      umin = Math.min(umin, uv.getX(i)); umax = Math.max(umax, uv.getX(i));
      vmin = Math.min(vmin, uv.getY(i)); vmax = Math.max(vmax, uv.getY(i));
    }
    expect(umin).toBeCloseTo(0, 6);
    expect(umax).toBeCloseTo(1, 6);
    expect(vmin).toBeCloseTo(0, 6);
    expect(vmax).toBeCloseTo(1, 6);
  });

  it('keeps type and parameters, so reflection-based world tests still find props', () => {
    const geo = b.roundedBox(5, 3, 4);
    expect(geo.type).toBe('BoxGeometry');
    expect(geo.parameters.width).toBe(5);
    expect(geo.parameters.height).toBe(3);
    expect(geo.parameters.depth).toBe(4);
  });

  it('memoises by dimension — one geometry, many meshes', () => {
    // The mesh count is the budget (VISUAL-PASS.md section 0); the geometry
    // count is not, but ninety identical fence palings should still not hold
    // ninety copies of the same buffer.
    expect(b.roundedBox(0.1, 1, 0.1)).toBe(b.roundedBox(0.1, 1, 0.1));
    expect(b.roundedBox(0.1, 1, 0.1)).not.toBe(b.roundedBox(0.1, 1, 0.11));
  });

  describe('the sizing rule', () => {
    it('is ABSOLUTE on anything thick enough to take it', () => {
      // A chamfer is a manufacturing feature: the arris break on a warehouse
      // wall and on a crate is the same physical size. A proportional rule
      // would give a 5m wall a 45cm fillet.
      expect(b.chamferFor(5, 3, 4)).toBe(b.CHAMFER);
      expect(b.chamferFor(1.2, 1.1, 1.2)).toBe(b.CHAMFER);
      expect(b.chamferFor(6, 2.6, 2.5)).toBe(b.CHAMFER);
    });

    it('falls back to a fraction of the SMALLEST dimension on thin members', () => {
      expect(b.chamferFor(0.1, 1, 0.1)).toBeCloseTo(0.015, 6);   // fence post
      expect(b.chamferFor(0.56, 0.045, 0.045)).toBeCloseTo(0.00675, 6); // ladder rung
      expect(b.chamferFor(0.06, 0.06, 0.9)).toBeCloseTo(0.009, 6); // bike tube
    });

    it('can never reach the middle of a member, at any dimensions', () => {
      // The safety property behind CHAMFER_BITE = 0.15: r stays under 0.30 of
      // the smallest HALF-extent, so the geometry can never self-intersect.
      for (const dims of [[0.03, 0.3, 0.55], [0.005, 5, 5], [1, 1, 1], [0.045, 0.045, 0.56]]) {
        const r = b.chamferFor(...dims);
        expect(r).toBeLessThan(Math.min(...dims) / 2);
      }
    });

    it('leaves LAMINAE sharp, and returns a real 12-triangle box for them', () => {
      // Under CHAMFER_MIN the bevel is sub-pixel at every distance this game
      // is played from, and the things that fall under it are the things that
      // want a sharp edge anyway: a rug's pile, a floorboard seam, a cardboard
      // box's walls, the canvas inside a picture frame.
      expect(b.chamferFor(2, 0.02, 3)).toBe(0);        // rug pile
      expect(b.chamferFor(0.05, 0.01, 18)).toBe(0);    // floor seam
      expect(b.chamferFor(0.55, 0.3, 0.03)).toBe(0);   // cardboard box wall
      expect(b.chamferFor(0.7, 0.55, 0.02)).toBe(0);   // framed art
      const geo = b.roundedBox(2, 0.02, 3);
      expect(triangles(geo)).toBe(12);
    });
  });

  it('does not move a single mesh in any area', () => {
    // The whole affordability argument for Wave 4. Recorded from the
    // pre-Wave-4 build (the same numbers test/budget.test.js's header logged
    // before this wave landed), and the horizon band's +1 is subtracted out so
    // this case measures 4.1 and 4.2 alone.
    const expected = { neighborhood: 380, park: 171, docks: 519, seaside: 64, den: 284 };
    const builds = {
      neighborhood: buildNeighborhood, park: buildPark, docks: buildDocks,
      seaside: buildSeaside, den: buildDen,
    };
    for (const [name, build] of Object.entries(builds)) {
      const scene = new THREE.Scene();
      build(scene);
      let meshes = 0;
      let band = 0;
      scene.traverse((o) => { if (o.isMesh) meshes++; });
      scene.traverse((o) => { if (o.name === 'horizonBand') band++; });
      expect(meshes - band, name).toBe(expected[name]);
    }
  });
});

describe('builder — round-primitive segment counts (Wave 4.2)', () => {
  // Pinned rather than merely raised: the counts are a judgement about which
  // silhouettes are seen close up (see the ROUND PRIMITIVES block in
  // builder.js), and a future pass that halves them to "save triangles" would
  // be optimising the one resource this scene has spare.
  const sides = (group, pred) => {
    let found = null;
    group.traverse((o) => {
      if (found === null && o.isMesh && pred(o)) found = o.geometry.parameters;
    });
    return found;
  };

  it('gives the tree trunk enough sides to read as round at a metre', () => {
    const p = sides(b.tree(3, 4), (o) => o.geometry.type === 'CylinderGeometry');
    expect(p.radialSegments).toBe(10);
  });

  it('raises the props the plan names by name — bollard, barrel, lamp globe', () => {
    expect(sides(b.bollard(0, 0), (o) => o.geometry.type === 'CylinderGeometry')
      .radialSegments).toBe(14);
    expect(sides(b.barrel(0, 0), (o) => o.geometry.type === 'CylinderGeometry')
      .radialSegments).toBe(16);
    expect(sides(b.lampPost(0, 0), (o) => o.geometry.type === 'SphereGeometry')
      .widthSegments).toBe(16);
  });

  it('leaves the two DELIBERATELY coarse shapes alone', () => {
    // house()'s roof is a pyramid, not a smoothed spire — four pitches is the
    // design. pictureFrame()'s hill is a shape inside a painting.
    expect(sides(b.house(0, 0), (o) => o.geometry.type === 'ConeGeometry')
      .radialSegments).toBe(4);
    expect(sides(b.pictureFrame(0, 1, 0), (o) => o.geometry.type === 'ConeGeometry')
      .radialSegments).toBe(4);
  });

  it('promotes the roof tank to the plank tile, which the old 10 sides forbade', () => {
    // The one map promotion in this item: at 16 sides a cylindrical unwrap
    // stops smearing, and the plank tile divides along u — i.e. AROUND the
    // barrel — which lays vertical staves on a timber water tank.
    const tank = b.roofTank(0, 0, 4);
    let drum = null;
    tank.traverse((o) => { if (!drum && o.isMesh && o.geometry.type === 'CylinderGeometry') drum = o; });
    expect(drum.geometry.parameters.radialSegments).toBe(16);
    expect(drum.material.map).toBeTruthy();
    expect(drum.material.map.name).toBe('surface:plank');
  });
});

describe('builder — horizonBand (Wave 4.3)', () => {
  const band = (extra = {}) => b.horizonBand({ inner: 56, outer: 116, height: 7, ...extra });

  it('is ONE mesh with no children', () => {
    const m = band();
    expect(m.isMesh).toBe(true);
    expect(m.children).toHaveLength(0);
    expect(m.name).toBe('horizonBand');
  });

  it('is deterministic — two co-walkers build byte-identical hills', () => {
    // The same guarantee wind.js's windPhase and the organic canopies carry,
    // and for the same reason: two clients build the same area from the same
    // seed and must draw the same world. Nothing below may ever reach for
    // Math.random or walkRng.
    const a = band({ salt: 11 }).geometry.attributes.position.array;
    const c = band({ salt: 11 }).geometry.attributes.position.array;
    expect(Array.from(a)).toEqual(Array.from(c));
    const d = band({ salt: 12 }).geometry.attributes.position.array;
    expect(Array.from(d)).not.toEqual(Array.from(a));
  });

  it('is NOT a contact-shadow candidate — verified against the real rule', () => {
    // render/contactshadows.js's MAX_SPAN (6.5m) should exclude it, and the
    // brief said to verify rather than assume. It clears the first three tests
    // (it stands up off the ground, its base is at y=0, it is not sub-pixel)
    // and is rejected by MAX_SPAN alone, by a factor of ~35.
    const box = new THREE.Box3().setFromObject(band());
    expect(box.max.y - box.min.y).toBeGreaterThan(0.1);   // 1. not lying flat
    expect(box.min.y).toBeLessThanOrEqual(0.35);          // 2. on the ground
    expect(box.max.x - box.min.x).toBeGreaterThan(200);   // 4. building-scale...
    expect(qualifies(box)).toBe(false);                   // ...so: excluded
  });

  it('buries its inner rim under the ground plane and keeps every crest beyond bounds', () => {
    const m = band();
    const pos = m.geometry.attributes.position;
    const NEIGHBOURHOOD_BOUND = 55;
    let highestInside = -Infinity;
    let innerY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
      const cheb = Math.max(Math.abs(x), Math.abs(z));
      if (cheb <= NEIGHBOURHOOD_BOUND + 1e-6) highestInside = Math.max(highestInside, y);
      if (cheb <= 56 + 1e-6) innerY = Math.max(innerY, y);
    }
    // Nothing of the band exists inside where a cat can walk...
    expect(highestInside).toBe(-Infinity);
    // ...and the inner rim sits BELOW y=0, so the seam is hidden under the
    // ground plane rather than butted against its edge.
    expect(innerY).toBeLessThan(0);
  });

  it('rises to roughly its stated height and tapers its outer rim back down', () => {
    const m = band({ height: 7 });
    const pos = m.geometry.attributes.position;
    let peak = -Infinity;
    let outerPeak = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const cheb = Math.max(Math.abs(pos.getX(i)), Math.abs(pos.getZ(i)));
      peak = Math.max(peak, pos.getY(i));
      if (cheb > 115) outerPeak = Math.max(outerPeak, pos.getY(i));
    }
    expect(peak).toBeGreaterThan(4);
    expect(peak).toBeLessThanOrEqual(7);
    // The taper is what guarantees the outer rim hides behind the crests in
    // front of it instead of drawing a second, higher line on the sky.
    expect(outerPeak).toBeLessThan(peak * 0.45);
  });

  it('stops at a declared waterline when handed one', () => {
    const SEA = { id: 'sea', kind: 'rect', minX: 25, maxX: 105, minZ: -70, maxZ: 70 };
    const dry = band({ inner: 66, outer: 126 });
    const wet = band({ inner: 66, outer: 126, avoid: [SEA] });
    expect(triangles(wet.geometry)).toBeLessThan(triangles(dry.geometry));
    expect(triangles(wet.geometry)).toBeGreaterThan(0);
  });

  it('builds a skyline as merged blocks inside the SAME single mesh', () => {
    const hills = band();
    const town = band({ kind: 'skyline', blocks: 40 });
    expect(town.children).toHaveLength(0);
    expect(triangles(town.geometry)).toBeGreaterThan(triangles(hills.geometry));
  });
});

describe('world files — horizon band wiring (Wave 4.3)', () => {
  const cases = [
    ['neighborhood', buildNeighborhood, 1],
    ['park', buildPark, 1],
    ['docks', buildDocks, 1],
    ['seaside', buildSeaside, 1],
    // The den is an INTERIOR. Its only sky is a 1.2m window aperture aimed at
    // a decorative 70m lawn already furnished with two houses and two trees
    // for exactly this reason, and the couple of pixels of horizon left inside
    // the frame would show nothing a band could add. It gets none, on purpose.
    ['den', buildDen, 0],
  ];

  for (const [name, build, expected] of cases) {
    it(`${name}: ${expected} band, at the top level, carrying no records`, () => {
      const scene = new THREE.Scene();
      const area = build(scene);
      const bands = scene.children.filter((c) => c.name === 'horizonBand');
      expect(bands).toHaveLength(expected);
      if (!expected) return;
      // Purely decorative: it must not appear in any of the data an area
      // returns, and nothing may collide with, perch on or spawn into it.
      const box = new THREE.Box3().setFromObject(bands[0]);
      const bounds = area.bounds;
      for (const c of area.colliders ?? []) {
        expect(Math.max(Math.abs(c.x), Math.abs(c.z))).toBeLessThan(56);
      }
      expect(box.min.x).toBeLessThan(bounds.minX);
      expect(box.max.x).toBeGreaterThan(bounds.maxX);
      expect(box.min.z).toBeLessThan(bounds.minZ);
      expect(box.max.z).toBeGreaterThan(bounds.maxZ);
    });
  }

  it('does not change how many contact-shadow decals any area emits', () => {
    // The band clears three of qualifies()' four tests; only MAX_SPAN rejects
    // it. Measured per area before the band was wired in.
    const expected = { neighborhood: 61, park: 42, docks: 67, seaside: 26, den: 20 };
    const builds = {
      neighborhood: buildNeighborhood, park: buildPark, docks: buildDocks,
      seaside: buildSeaside, den: buildDen,
    };
    for (const [name, build] of Object.entries(builds)) {
      const scene = new THREE.Scene();
      build(scene);
      const box = new THREE.Box3();
      let n = 0;
      for (const child of scene.children) {
        box.setFromObject(child);
        if (qualifies(box)) n++;
      }
      expect(n, name).toBe(expected[name]);
    }
  });
});
