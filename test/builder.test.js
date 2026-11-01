import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless stub every world test uses — see test/docks.test.js for
// why a blanket Proxy is not enough (the surface painters need real answers
// from getImageData and create*Gradient).
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
const { createWind } = await import('../src/render/wind.js');
const { surfaceProps } = await import('../src/render/materials.js');

// The peak lean a registered object reaches, measured by sweeping absolute
// time rather than by reading wind.js's internals: the module deliberately
// returns no per-object handle, and what this pass actually cares about is the
// pose on screen. The sweep is dense and long enough to catch a gust peak.
function sway(obj, wind) {
  const base = { x: obj.rotation.x, z: obj.rotation.z };
  let peak = 0;
  let crossings = 0;
  let prev = 0;
  for (let i = 0; i <= 6000; i++) {
    const t = i * 0.01; // 60s at 100Hz — GUST_FREQUENCY's period is ~52s
    wind.update(t);
    const d = obj.rotation.z - base.z;
    peak = Math.max(peak, Math.abs(d));
    if (i > 0 && Math.sign(d) !== Math.sign(prev) && d !== 0) crossings++;
    prev = d;
  }
  return { peak, crossings };
}

describe('builder — additive surface pass', () => {
  it('leaves every existing call site alone: no options object is required', () => {
    // The whole four-agent handover depends on this. Each of these is a call
    // shape that ships in a world file today.
    expect(() => {
      b.ground(70, 0x6aa04e);
      b.path(0, 0, 0, 10);
      b.sidewalk(-16, -14.5, 16, -14.5, 1.6);
      b.house(1.5, -22);
      b.tree(-5.5, -18, 1.1);
      b.bush(-2.4, -17);
      b.flowerPatch(0, -18);
      b.fenceRun(-13, -16, 13, -16);
      b.bench(2, 2);
      b.car(1, 1);
      b.lampPost(5, -16.6);
      b.puddle(3, 3);
      b.rock(0, 0);
      b.platform(0, 0, 1.2);
    }).not.toThrow();
  });

  it('keeps bush() a bare Mesh at its shipped position when no wind is passed', () => {
    const m = b.bush(-2.4, -17);
    expect(m.isMesh).toBe(true);
    expect([m.position.x, m.position.y, m.position.z]).toEqual([-2.4, 0.5, -17]);
  });

  it('gives the puddle the water preset — the one prop walk.js builds for every area', () => {
    const p = b.puddle(3, 3, 0.8);
    expect(p.material.roughness).toBe(surfaceProps('water').roughness);
    // Still a cheap disc, never a createWater rig.
    expect(p.geometry.type).toBe('CircleGeometry');
  });

  it('compensates a grass lawn for the tile mean, and only when it is textured', () => {
    // 0x6aa04e lifted by 1/0.955 — the world file's authored hex is untouched
    // and still lands on the colour it ships.
    expect(b.ground(70, 0x6aa04e, { surface: 'grass' }).material.color)
      .toEqual(new THREE.Color(0x6fa852));
    expect(b.ground(70, 0x6aa04e).material.color).toEqual(new THREE.Color(0x6aa04e));
    // A non-grass surface is NOT lifted (the Docks' cobbles want the drop).
    expect(b.ground(120, 0x4e4e58, { surface: 'wetStone' }).material.color)
      .toEqual(new THREE.Color(0x4e4e58));
  });

  it('compensates a brick house body the way warehouse() already does', () => {
    const brick = b.house(0, 0, 0x8a6a5a, 0xb05a4a, 'brick');
    expect(brick.children[0].material.color).toEqual(new THREE.Color(0x92705f));
    // Siding's 0.988 mean is inside the noise and is left alone.
    const painted = b.house(0, 0, 0x8a6a5a);
    expect(painted.children[0].material.color).toEqual(new THREE.Color(0x8a6a5a));
  });

  it('uses no metalness anywhere — bareMetal stays unused across the shared props', () => {
    const scene = new THREE.Group();
    for (const prop of [
      b.house(0, 0), b.tree(0, 0), b.bush(0, 0), b.fenceRun(0, 0, 4, 0),
      b.mailbox(0, 0), b.car(0, 0), b.bench(0, 0), b.lampPost(0, 0), b.bike(0, 0),
      b.rock(0, 0), b.puddle(0, 0), b.flowerPatch(0, 0), b.radiator(0, 0),
      b.dresser(0, 0), b.bookcase(0, 0), b.tvSet(0, 0), b.pottedPlant(0, 0),
      b.petBowls(0, 0), b.logBasket(0, 0), b.wallShelf(0, 1, 0),
    ]) scene.add(prop);
    scene.traverse((o) => {
      if (o.material && o.material.metalness !== undefined) {
        expect(o.material.metalness).toBe(0);
      }
    });
  });
});

describe('builder — wind registration', () => {
  it('registers a tree with the wind it is handed, and nothing without one', () => {
    const wind = createWind();
    const still = b.tree(3, 4, 1);
    wind.update(1.5);
    expect(still.rotation.z).toBe(0);

    const swayed = b.tree(3, 4, 1, { wind });
    wind.update(1.5);
    expect(swayed.rotation.z).not.toBe(0);
    // The whole point of wind.js's rotation-only design: the collider record
    // this tree carries reads position.x/z, and those must never move.
    expect([swayed.position.x, swayed.position.z]).toEqual([3, 4]);
  });

  it('hinges a windy bush at its base rather than its belly', () => {
    const wind = createWind();
    const g = b.bush(-2.4, -17, { wind });
    // A Group whose origin IS ground contact, so the rotation wind.js applies
    // pivots at the root with no reparenting (which could not work anyway —
    // a builder registers before the caller has called scene.add).
    expect(g.isGroup).toBe(true);
    expect([g.position.x, g.position.y, g.position.z]).toEqual([-2.4, 0, -17]);
    // The mesh is exactly where the flat version put it.
    const m = g.children[0];
    expect(m.isMesh).toBe(true);
    expect(m.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(0.5, 6);
  });

  it('sways a bush LESS and FASTER than a tree (the brief, not the inertia model)', () => {
    const wind = createWind();
    // Same position, so the only difference between them is the tuning.
    const tree = b.tree(5, 5, 1, { wind });
    const bush = b.bush(5, 5, { wind });
    const t = sway(tree, wind);
    const s = sway(bush, wind);
    expect(s.peak).toBeLessThan(t.peak);      // less
    expect(s.crossings).toBeGreaterThan(t.crossings); // faster
  });

  it('gives a bigger tree more lean and a slower cycle', () => {
    const wind = createWind();
    const big = b.tree(5, 5, 1.6, { wind });
    const small = b.tree(5, 5, 0.7, { wind });
    const B = sway(big, wind);
    const S = sway(small, wind);
    expect(B.peak).toBeGreaterThan(S.peak);
    expect(B.crossings).toBeLessThan(S.crossings);
  });

  it('keeps every sway under a few degrees, foliage-not-jelly', () => {
    const wind = createWind();
    const props = [
      b.tree(5, 5, 1.6, { wind }),
      b.bush(2, -3, { wind }),
      b.flowerPatch(-7, 1, { wind }),
    ];
    for (const p of props) {
      // Worst case the system can produce: a gust peak at the rain intensity
      // main.js drives, on the biggest amplitude here.
      let peak = 0;
      for (let i = 0; i <= 6000; i++) {
        const t = i * 0.01;
        wind.update(t, 1.7);
        peak = Math.max(peak, Math.abs(p.rotation.z), Math.abs(p.rotation.x));
      }
      expect(peak).toBeLessThan(0.09); // ~5°
    }
  });

  it('reducedMotion registers but never moves anything', () => {
    const wind = createWind({ reducedMotion: true });
    const tree = b.tree(3, 4, 1.2, { wind });
    const bush = b.bush(3, 4, { wind });
    wind.update(12.5, 1.7);
    expect(tree.rotation.z).toBe(0);
    expect(bush.rotation.z).toBe(0);
  });
});

// The dice-fix pass (tree()/bush() canopies): a merged, irregular blob
// derived PURELY from (x, z) rather than a bare regular icosahedron. The
// property that matters most for multiplayer is determinism — see
// wind.js's windPhase for the identical concern. A canopy that differs
// between two co-walkers' clients for the same tree is a desync of the
// visible world, and nothing in the test suite would catch it except an
// explicit same-input/different-input check like this one.
describe('builder — organic canopy (dice fix)', () => {
  // tree()'s canopy is g.children[1] (trunk is [0]); bush() with no wind is
  // the bare Mesh itself.
  const canopyOf = (treeGroup) => treeGroup.children[1];

  it('gives the same (x, z) byte-identical canopy geometry across calls', () => {
    const t1 = canopyOf(b.tree(5, 5, 1.2));
    const t2 = canopyOf(b.tree(5, 5, 1.2));
    expect(Array.from(t2.geometry.attributes.position.array))
      .toEqual(Array.from(t1.geometry.attributes.position.array));
    // The per-tree orientation is derived from (x, z) too, so it agrees.
    expect(t2.rotation.y).toBe(t1.rotation.y);
  });

  it('gives different (x, z) a different canopy geometry and orientation', () => {
    const t1 = canopyOf(b.tree(5, 5, 1.2));
    const t2 = canopyOf(b.tree(-8, 13, 1.2));
    const p1 = Array.from(t1.geometry.attributes.position.array);
    const p2 = Array.from(t2.geometry.attributes.position.array);
    expect(p1.length).toBe(p2.length); // same lobe/detail structure either way
    expect(p2).not.toEqual(p1);
    expect(t2.rotation.y).not.toBe(t1.rotation.y);
  });

  it('gives the same (x, z) byte-identical bush geometry across calls, and different (x, z) a different one', () => {
    const b1 = b.bush(3, -2);
    const b2 = b.bush(3, -2);
    expect(Array.from(b2.geometry.attributes.position.array))
      .toEqual(Array.from(b1.geometry.attributes.position.array));
    const b3 = b.bush(11, 4);
    expect(Array.from(b3.geometry.attributes.position.array))
      .not.toEqual(Array.from(b1.geometry.attributes.position.array));
  });

  it('is no longer a REGULAR solid: vertex radii vary instead of all matching the nominal radius', () => {
    // The old bare IcosahedronGeometry(1.6, 0) put every one of its 12
    // distinct vertices at exactly radius 1.6 from the mesh origin — the
    // defining property of a Platonic solid, and the actual "dice" cause.
    // The fix must break that: vertex-to-origin distances should now spread
    // out over a real range rather than clustering on one value.
    const leaves = canopyOf(b.tree(5, 5, 1));
    const pos = leaves.geometry.attributes.position;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
      min = Math.min(min, r);
      max = Math.max(max, r);
    }
    expect(max - min).toBeGreaterThan(0.15); // a real spread, not float noise
  });

  it('stays ONE mesh per canopy/bush — draw calls are the budget, not triangles', () => {
    const t = b.tree(5, 5, 1);
    expect(t.children.filter((c) => c.isMesh).length).toBe(2); // trunk + canopy, unchanged
    const bare = b.bush(5, 5);
    expect(bare.isMesh).toBe(true); // still the bare-Mesh contract, no extra children
  });

  it('keeps the canopy/bush footprint roughly where it shipped (colliders are fixed elsewhere)', () => {
    // Sampled across many positions in an earlier manual check: max observed
    // canopy radius ~1.82 against a nominal 1.6, max bush radius ~0.80
    // against a nominal 0.7 — both a modest, bounded overshoot, never a
    // multiple of the original footprint.
    for (const [x, z] of [[0, 0], [5, 5], [-8, 13], [22, -17], [-30, 30]]) {
      const leaves = canopyOf(b.tree(x, z, 1));
      leaves.geometry.computeBoundingSphere();
      expect(leaves.geometry.boundingSphere.radius).toBeLessThan(1.6 * 1.3);
      const bush = b.bush(x, z);
      bush.geometry.computeBoundingSphere();
      expect(bush.geometry.boundingSphere.radius).toBeLessThan(0.7 * 1.3);
    }
  });
});

// Ground-plane macro variation (VISUAL-PASS.md Wave 2.2). ground()/path()/
// sidewalk() now segment their plane and paint low-frequency vertex colours
// onto it — see builder.js's own GROUND-PLANE MACRO VARIATION block (right
// above tree()) for the full reasoning. The two properties that matter most
// here are the same two the organic-canopy suite above already checks for a
// different feature: DETERMINISM (two co-walkers must build byte-identical
// meshes from the same call) and the LUMINANCE band this pass promised to
// hold to (a tight hint on top of textures.js's own 0.87 floor, not a second
// independent paint job — see the block comment for the arithmetic).
describe('builder — ground-plane macro variation (Wave 2.2)', () => {
  // Per-channel floor of GROUND_TREATMENTS' tint tuples, mirrored from
  // builder.js so this test fails loudly if a future edit there quietly
  // widens the band past what the luminance argument in the comment block
  // actually checked. 0.90 rather than the map's own 0.87: vertex colour
  // multiplies a map that already carries its own floor (see the comment
  // block's per-surface arithmetic), so it needs a tighter floor of its own.
  const VC_FLOOR = 0.90;

  function colorArray(mesh) {
    return Array.from(mesh.geometry.attributes.color.array);
  }

  it('opts every ground/path/sidewalk material into vertexColors, with a matching geometry attribute', () => {
    const ground = b.ground(120, 0x7cb860, { surface: 'grass' });
    const path = b.path(0, -50, 0, 50, 5, { surface: 'gravel' });
    const sidewalk = b.sidewalk(-3.2, -50, -3.2, 50, undefined, { surface: 'cobble' });
    for (const m of [ground, path, sidewalk]) {
      expect(m.material.vertexColors).toBe(true);
      expect(m.geometry.attributes.color).toBeDefined();
      expect(m.geometry.attributes.color.count).toBe(m.geometry.attributes.position.count);
    }
  });

  it('still segments and paints a ground/path/sidewalk with NO surface option (today: only the den floor)', () => {
    // The no-options call shape from the "additive surface pass" suite above
    // must keep working — this is the same contract, extended to the new
    // geometry/vertex-colour work.
    const floor = b.ground(18, 0x9a7048);
    expect(floor.geometry.attributes.position.count).toBeGreaterThan(4); // no longer a bare 2-triangle plane
    expect(floor.material.vertexColors).toBe(true);
  });

  it('gives the SAME (x, z) span byte-identical vertex colours across calls — the multiplayer property', () => {
    const g1 = b.ground(120, 0x7cb860, { surface: 'grass' });
    const g2 = b.ground(120, 0x7cb860, { surface: 'grass' });
    expect(colorArray(g2)).toEqual(colorArray(g1));

    const p1 = b.path(0, 20, 16, 10, 3, { surface: 'gravel' });
    const p2 = b.path(0, 20, 16, 10, 3, { surface: 'gravel' });
    expect(colorArray(p2)).toEqual(colorArray(p1));

    const s1 = b.sidewalk(-36, 9, 36, 9);
    const s2 = b.sidewalk(-36, 9, 36, 9);
    expect(colorArray(s2)).toEqual(colorArray(s1));
  });

  it('gives a DIFFERENT path a different vertex-colour field (not a constant tint)', () => {
    const p1 = b.path(0, 20, 16, 10, 3, { surface: 'gravel' });
    const p2 = b.path(-8, -18, 12, -30, 3, { surface: 'gravel' });
    expect(colorArray(p2)).not.toEqual(colorArray(p1));
  });

  it('keeps every vertex colour channel inside [VC_FLOOR, 1] — darken-only from white, never a lightening past 1', () => {
    const meshes = [
      b.ground(120, 0x7cb860, { surface: 'grass' }),
      b.ground(140, 0xe0d0a0, { surface: 'sand' }),
      b.ground(120, 0x4e4e58, { surface: 'wetStone' }),
      b.path(-36, 6.5, 36, 6.5, 4, { surface: 'cobble' }),
      b.path(0, -50, 0, 50, 5, { surface: 'gravel' }),
      b.ground(18, 0x9a7048), // no surface — the den-floor fallback treatment
    ];
    // Float32Array storage rounds e.g. 0.90 to 0.8999999761581421 — the
    // colour attribute is a Float32BufferAttribute (GPU-bound), so a tiny
    // epsilon here is the precision the pipeline actually has, not slack in
    // the luminance argument itself.
    const EPS = 1e-6;
    for (const m of meshes) {
      for (const c of colorArray(m)) {
        expect(c).toBeGreaterThanOrEqual(VC_FLOOR - EPS);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it('scales segment count with the plane\'s own world size — a 120m lawn is not a bare 2-triangle plane, and an 18m indoor floor is not paying 120m prices', () => {
    const small = b.ground(18, 0x9a7048);
    const big = b.ground(140, 0xe0d0a0, { surface: 'sand' });
    // Both got segmented (see the previous test), but NOT identically —
    // segsFor() ties segment count to extent (SEG_METRES), so the bigger
    // plane must carry more vertices than the smaller one, and by roughly
    // the ratio of their sizes (140/18 ~7.8x on each axis).
    expect(big.geometry.attributes.position.count)
      .toBeGreaterThan(small.geometry.attributes.position.count * 4);
  });

  it('gives a narrow path/sidewalk far fewer WIDTH segments than LENGTH segments — the anisotropy VISUAL-PASS.md flags', () => {
    // A single fixed segment count is wrong for a strip a few metres wide and
    // tens of metres long — see builder.js's segsFor() comment. Check it by
    // triangle-count arithmetic: (widthSegs+1)*(lengthSegs+1) vertices.
    const p = b.path(0, -50, 0, 50, 3); // 3m wide, 100m long
    const vertCount = p.geometry.attributes.position.count;
    // If width and length shared one segment count, a 3m-wide/100m-long
    // strip would need an ABSURD vertex count to resolve the length at all.
    // The actual (small width segs) x (many length segs) split keeps this
    // cheap: comfortably under 1000 vertices for a 100m path.
    expect(vertCount).toBeLessThan(1000);
    expect(vertCount).toBeGreaterThan(40); // still meaningfully segmented, not the bare 2-triangle plane
  });

  it('does not touch the untextured material.color path this pass never meant to change', () => {
    // The "additive surface pass" suite above already locks material.color's
    // compensation behaviour; this just confirms vertex colours are additive
    // to that, not a replacement for it.
    const grass = b.ground(70, 0x6aa04e, { surface: 'grass' });
    expect(grass.material.color).toEqual(new THREE.Color(0x6fa852));
    expect(grass.material.vertexColors).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The Woods' pieces (Clan Edition and the Woods, Task 4).
// ---------------------------------------------------------------------------
describe('horizonBand side tints and rooftops', () => {
  const fingerprint = (m) => {
    const g = m.geometry;
    const h = createHash('sha256');
    for (const k of Object.keys(g.attributes).sort()) h.update(Buffer.from(g.attributes[k].array.buffer));
    h.update(Buffer.from(g.index.array.buffer));
    return h.digest('hex').slice(0, 16);
  };

  // Hashes taken from the code as it stood before the new options existed:
  // the park's call (hills) and the Docks' call (skyline). Omitting the new
  // options must leave every area's band byte-identical.
  it('horizonBand without the new options is unchanged', () => {
    expect(fingerprint(b.horizonBand({
      kind: 'hills', inner: 56, outer: 116, height: 8, wavelength: 40, color: 0x8ac27e, salt: 23,
    }))).toBe('0e316909b26ce838');
    expect(fingerprint(b.horizonBand({
      kind: 'skyline', inner: 56, outer: 112, height: 9, wavelength: 46, blocks: 52, color: 0x646976, salt: 41,
    }))).toBe('923b0516f4882a6a');
  });

  const tints = { north: 0x336633, east: 0x884422, south: 0x224488, west: 0x888822 };

  it('sideTint gives each side its colour', () => {
    expect(b.sideTint(0, -100, tints)).toBe(tints.north);
    expect(b.sideTint(100, 0, tints)).toBe(tints.east);
    expect(b.sideTint(0, 100, tints)).toBe(tints.south);
    expect(b.sideTint(-100, 0, tints)).toBe(tints.west);
  });

  it('sideTint blends across a corner and has no seam there', () => {
    // Right in the corner the two sides mix; a hair either side agrees.
    const a = new THREE.Color(b.sideTint(100, -99.9, tints));
    const c = new THREE.Color(b.sideTint(99.9, -100, tints));
    expect(a.r).toBeCloseTo(c.r, 1);
    expect(a.g).toBeCloseTo(c.g, 1);
    expect(a.b).toBeCloseTo(c.b, 1);
    expect(b.sideTint(100, -100, tints)).not.toBe(tints.east);
    expect(b.sideTint(100, -100, tints)).not.toBe(tints.north);
    // Outside the 15% corner zone a side is pure.
    expect(b.sideTint(100, 60, tints)).toBe(tints.east);
  });

  it('rooftopSpots stay on their arc', () => {
    const spots = b.rooftopSpots({ from: 0.1, to: 0.25, count: 14 }, 56, 116, 7);
    expect(spots).toHaveLength(14);
    for (const s of spots) {
      expect(s.x).toBeGreaterThanOrEqual(56);
      expect(Number.isFinite(s.yaw)).toBe(true);
    }
    expect(b.rooftopSpots({ from: 0.1, to: 0.25, count: 14 }, 56, 116, 7)).toEqual(spots);
  });

  it('horizonBand rooftops without a height take the band\'s, never NaN', () => {
    const m = b.horizonBand({
      kind: 'hills', inner: 56, outer: 116, height: 7, salt: 5,
      rooftops: { from: 0.1, to: 0.25, count: 6 },
    });
    expect(Array.from(m.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
    const withHeight = b.horizonBand({
      kind: 'hills', inner: 56, outer: 116, height: 7, salt: 5,
      rooftops: { from: 0.1, to: 0.25, count: 6, height: 7 },
    });
    expect(Array.from(m.geometry.attributes.position.array))
      .toEqual(Array.from(withHeight.geometry.attributes.position.array));
  });

  it('horizonBand with rooftops and side tints is still one mesh, with colours', () => {
    const plain = b.horizonBand({ kind: 'hills', inner: 56, outer: 116, height: 7, salt: 5 });
    const m = b.horizonBand({
      kind: 'hills', inner: 56, outer: 116, height: 7, salt: 5,
      sideTints: tints, rooftops: { from: 0.1, to: 0.25, count: 14, height: 9 },
    });
    expect(m.isMesh).toBe(true);
    expect(m.name).toBe('horizonBand');
    expect(m.geometry.attributes.color).toBeDefined();
    expect(m.geometry.attributes.position.count).toBeGreaterThan(plain.geometry.attributes.position.count);
  });
});

describe('the Woods builders', () => {
  const bbox = (o) => new THREE.Box3().setFromObject(o);

  it("logBridge's top is at y", () => {
    // precise: the trunk is tilted (see logBridge), and the loose box of a
    // rotated mesh is the box of its rotated bounding box, which overshoots
    const top = (o) => new THREE.Box3().setFromObject(o, true).max.y;
    expect(top(b.logBridge(0, -4, 0, 4))).toBeCloseTo(0.14, 2);
    expect(top(b.logBridge(0, -4, 0, 4, 1.2, 0.2))).toBeCloseTo(0.2, 2);
  });

  it("logBridge's top is level from end to end", () => {
    const log = b.logBridge(0, -4, 0, 4, 2.8, 0.18);
    log.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const z of [-3.9, 0, 3.9]) {
      ray.set(new THREE.Vector3(0, 5, z), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(log, true)[0].point.y, `z ${z}`).toBeCloseTo(0.18, 2);
    }
  });

  it("logBridge's top is hewn flat, `flat` wide, and rounds off beyond it", () => {
    const log = b.logBridge(0, -4, 0, 4, 3, 0.16, 1.9);
    log.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const hitY = (x) => {
      ray.set(new THREE.Vector3(x, 5, 0), new THREE.Vector3(0, -1, 0));
      return ray.intersectObject(log, true)[0]?.point.y;
    };
    for (const x of [-0.94, -0.5, 0, 0.5, 0.94]) expect(hitY(x), `x ${x}`).toBeCloseTo(0.16, 3);
    // past the flat, the trunk's round flank falls away
    expect(hitY(1.1)).toBeLessThan(0.15);
    expect(hitY(-1.1)).toBeLessThan(0.15);
    // and the whole trunk is there below: 3 m across
    const bb = new THREE.Box3().setFromObject(log, true);
    expect(bb.max.x - bb.min.x).toBeCloseTo(3, 1);
  });

  it('steppingStones takes bigger, steadier, staggered stones when asked', () => {
    const plain = b.steppingStones(0, 0, 6, 0, 5);
    const big = b.steppingStones(0, 0, 6, 0, 5, { rMin: 0.7, rMax: 0.7, jitter: 0, stagger: 0.04 });
    const bb = new THREE.Box3().setFromObject(big, true);
    // jitter 0: the stones' centres sit exactly on the line
    expect(bb.min.z).toBeCloseTo(-0.7, 2);
    expect(bb.max.z).toBeCloseTo(0.7, 2);
    // stagger: neighbouring stones' tops differ, so overlapping ones never z-fight
    const tops = new Set();
    const pos = big.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.05) tops.add(pos.getY(i).toFixed(3));
    expect(tops.size).toBe(2);
    // the defaults are unchanged
    expect(new THREE.Box3().setFromObject(plain).max.y).toBeCloseTo(0.1, 5);
  });

  it('steppingStones is one mesh with n stones of vertices, all low', () => {
    const one = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 8).attributes.position.count;
    const m = b.steppingStones(0, 0, 6, 0, 5);
    expect(m.isMesh).toBe(true);
    expect(m.geometry.attributes.position.count).toBe(5 * one);
    expect(bbox(m).max.y).toBeLessThan(0.2);
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
  });

  it('steppingStones draws rounder stones when given more sides', () => {
    const round = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 16).attributes.position.count;
    expect(b.steppingStones(0, 0, 6, 0, 5, { sides: 16 }).geometry.attributes.position.count).toBe(5 * round);
  });

  it("fallenLog's top is at 0.5", () => {
    expect(bbox(b.fallenLog(3, 4, 4, 0.7)).max.y).toBeCloseTo(0.5, 2);
  });

  it("fallenLog's branch stub leans out from the trunk, not into it", () => {
    const log = b.fallenLog(0, 0, 4, 0);
    const stub = log.children[1];
    stub.updateMatrixWorld(true);
    // the stub's tip (local +y) is further from the trunk's axis than its base
    const tip = new THREE.Vector3(0, 0.2, 0).applyMatrix4(stub.matrixWorld);
    const base = new THREE.Vector3(0, -0.2, 0).applyMatrix4(stub.matrixWorld);
    expect(Math.abs(tip.x)).toBeGreaterThan(Math.abs(base.x));
    expect(tip.y).toBeGreaterThan(base.y);
  });

  it('fernBed is one low mesh that stays out of the shadow pass', () => {
    const spots = [{ x: 0, z: 0 }, { x: 3, z: 1 }, { x: -2, z: 4 }];
    const m = b.fernBed(spots, 7);
    expect(m.isMesh).toBe(true);
    const bb = bbox(m);
    expect(bb.max.y).toBeLessThanOrEqual(0.6);
    expect(bb.max.y).toBeGreaterThan(0.3);
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
    // deterministic, and each clump stays within a metre of its spot
    expect(b.fernBed(spots, 7).geometry.attributes.position.array).toEqual(m.geometry.attributes.position.array);
    expect(bb.min.x).toBeGreaterThan(-3);
    expect(bb.max.x).toBeLessThan(4);
  });

  it('brambleBed is one mesh, under a metre tall, out of the shadow pass', () => {
    const m = b.brambleBed([{ x: 0, z: 0 }, { x: 5, z: 2 }], 3);
    expect(m.isMesh).toBe(true);
    expect(bbox(m).max.y).toBeLessThanOrEqual(1.0);
    expect(bbox(m).max.y).toBeGreaterThan(0.5);
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
  });

  it('heatherBed is one flat-ish mesh out of the shadow pass', () => {
    const spots = [{ x: 0, z: 0 }, { x: 4, z: 1 }];
    const m = b.heatherBed(spots, 5);
    expect(m.isMesh).toBe(true);
    const bb = bbox(m);
    expect(bb.max.y).toBeLessThanOrEqual(0.5);
    expect(bb.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
    expect(b.heatherBed(spots, 5).geometry.attributes.position.array).toEqual(m.geometry.attributes.position.array);
    expect(() => b.heatherBed([], 5)).not.toThrow();
  });

  it('gorseBed is two noCast meshes, gorse and gorseBloom, never taller than 0.95', () => {
    const g = b.gorseBed([{ x: 0, z: 0 }, { x: 5, z: 2 }, { x: -3, z: 4 }], 9);
    const found = {};
    g.traverse((o) => { if (o.isMesh) found[o.name] = o; });
    expect(Object.keys(found).sort()).toEqual(['gorse', 'gorseBloom']);
    for (const o of Object.values(found)) {
      expect(o.userData.noCast).toBe(true);
      expect(o.castShadow).toBe(false);
    }
    expect(bbox(g).max.y).toBeLessThanOrEqual(0.95);
    expect(bbox(g).max.y).toBeGreaterThan(0.4);
  });

  it("tor's top is at h and its foot is as wide as its collider", () => {
    const t = b.tor(5, -3, { r: 1.4, h: 1.5 });
    expect(t.isMesh).toBe(true);
    const bb = bbox(t);
    expect(Math.abs(bb.max.y - 1.5)).toBeLessThanOrEqual(0.05);
    expect(bb.min.y).toBeGreaterThanOrEqual(-1e-6);
    const pos = t.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      expect(Math.hypot(pos.getX(i) - 5, pos.getZ(i) + 3)).toBeLessThanOrEqual(1.4 + 0.05);
    }
    expect((bb.max.x - bb.min.x) / 2).toBeGreaterThanOrEqual(0.8 * 1.4);
    expect(b.tor(5, -3, { r: 1.4, h: 1.5 }).geometry.attributes.position.array).toEqual(pos.array);
  });

  it('burrows are two noCast meshes under 0.2 m', () => {
    const g = b.burrows([{ x: 0, z: 0 }, { x: 6, z: 1 }], 2);
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.map((o) => o.name).sort()).toEqual(['burrowHoles', 'burrowSpoil']);
    for (const o of meshes) {
      expect(o.userData.noCast).toBe(true);
      expect(bbox(o).max.y).toBeLessThan(0.2);
    }
  });

  it('reedBed is one mesh, never taller than 1.1', () => {
    const m = b.reedBed([{ x: 0, z: 0 }, { x: 1, z: 0.5 }, { x: -2, z: 3 }], 3);
    expect(m.isMesh).toBe(true);
    expect(bbox(m).max.y).toBeLessThanOrEqual(1.1);
    expect(bbox(m).max.y).toBeGreaterThan(0.5);
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
  });
  it('willow is three meshes and its curtain never hangs below 1.2', () => {
    const g = b.willow(3, 4);
    expect(g.children.filter((o) => o.isMesh)).toHaveLength(3);
    const curtain = g.getObjectByName('willowCurtain');
    curtain.geometry.computeBoundingBox();
    expect(curtain.geometry.boundingBox.min.y).toBeGreaterThanOrEqual(1.2 - 1e-6);
    expect(g.userData.canopy).toEqual({ y: 2.8, r: 1.6 });
    const high = b.willow(3, 4, 1, { curtainFloor: 2.0 }).getObjectByName('willowCurtain');
    high.geometry.computeBoundingBox();
    expect(high.geometry.boundingBox.min.y).toBeGreaterThanOrEqual(2.0 - 1e-6);
  });

  it('willow is the same at the same spot', () => {
    const a = b.willow(3, 4);
    const c = b.willow(3, 4);
    expect(a.children.length).toBe(c.children.length);
    a.children.forEach((m, i) => {
      expect(Array.from(m.geometry.attributes.position.array))
        .toEqual(Array.from(c.children[i].geometry.attributes.position.array));
    });
  });

  it('pine is two meshes, never taller than 4.4 at scale 1', () => {
    const g = b.pine(0, 0);
    expect(g.children.filter((o) => o.isMesh)).toHaveLength(2);
    expect(new THREE.Box3().setFromObject(g).max.y).toBeLessThanOrEqual(4.4);
    expect(g.userData.canopy).toBeUndefined();
  });

  it('lilyPads is one flat mesh out of the shadow pass', () => {
    const m = b.lilyPads([{ x: 0, z: 0, r: 0.4 }, { x: 2, z: 1, r: 0.5 }], 5);
    expect(m.isMesh).toBe(true);
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) expect(Math.abs(pos.getY(i) - 0.06)).toBeLessThan(1e-6);
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
    expect(() => b.lilyPads([], 5)).not.toThrow();
  });
});
