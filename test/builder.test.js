import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeAll } from 'vitest';
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
const { mulberry32 } = await import('../src/rng.js');
const { GORGE_HORIZON } = await import('../src/world/gorge.js');

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

  it('makes the puddle look wet: one disc, see-through, never z-fighting the ground', () => {
    const p = b.puddle(3, 3, 0.8);
    expect(p.isMesh).toBe(true);
    expect(p.children.length).toBe(0);
    expect(p.geometry.type).toBe('CircleGeometry');
    expect(p.geometry.parameters.segments).toBe(12);
    expect(Array.isArray(p.material)).toBe(false);
    expect(p.material.map).toBeFalsy();
    expect(p.material.transparent).toBe(true);
    expect(p.material.depthWrite).toBe(false);
    expect(p.material.polygonOffset).toBe(true);
    expect(p.material.polygonOffsetFactor).toBeLessThan(0);
    expect(p.material.polygonOffsetUnits).toBeLessThan(0);
    expect(p.userData.puddle).toBe(true);
    expect(p.material.customProgramCacheKey()).toBe('puddle-v1');
    // Sorts after contact decals (-1) and paw prints (-2), before rain/splash rings and lamp pools (0).
    expect(p.renderOrder).toBe(-0.5);
  });

  it('shades the puddle dark in the middle, sky-light toward the rim, and gone before the 12-gon edge', () => {
    const L = b.PUDDLE_LOOK;
    expect(Object.isFrozen(L)).toBe(true);
    expect(b.puddleShade(0).k).toBeCloseTo(L.centreDark, 6);
    expect(b.puddleShade(0.85).k).toBeGreaterThan(b.puddleShade(0).k);
    expect(b.puddleShade(0.85).k).toBeCloseTo(L.rimLight, 6);
    expect(b.puddleShade(0.3).alpha).toBeCloseTo(L.alpha, 6);
    // The inner apothem of a 12-gon is cos(15deg) = 0.966r: transparent by then.
    expect(b.puddleShade(0.96).alpha).toBe(0);
    expect(b.puddleShade(Math.cos(Math.PI / 12)).alpha).toBe(0);
    // Fades monotonically through the band.
    expect(b.puddleShade(0.8).alpha).toBeLessThan(L.alpha);
    expect(b.puddleShade(0.8).alpha).toBeGreaterThan(0);
  });

  it('patches the real standard shader at its anchors, with the radius as its own uniform', () => {
    const p = b.puddle(0, 0, 1.3);
    const shader = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    };
    p.material.onBeforeCompile(shader);
    expect(shader.uniforms.uPuddleR.value).toBe(1.3);
    expect(shader.vertexShader).not.toBe(THREE.ShaderLib.standard.vertexShader);
    expect(shader.fragmentShader).not.toBe(THREE.ShaderLib.standard.fragmentShader);
    expect(shader.vertexShader).toContain('#include <begin_vertex>');
    expect(shader.vertexShader).toMatch(/vPud\s*=\s*position\.xy\s*\/\s*uPuddleR/);
    expect(shader.vertexShader).toMatch(/varying vec2 vPud;/);
    expect(shader.fragmentShader).toMatch(/varying vec2 vPud;/);
    expect(shader.fragmentShader).toContain('#include <color_fragment>');
    expect(shader.fragmentShader).toContain('#include <emissivemap_fragment>');
    expect(shader.fragmentShader).toContain('diffuseColor.a *=');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance +=');
    // The patch lands AFTER each anchor.
    const f = shader.fragmentShader;
    expect(f.indexOf('diffuseColor.a *=')).toBeGreaterThan(f.indexOf('#include <color_fragment>'));
    expect(f.indexOf('totalEmissiveRadiance +=')).toBeGreaterThan(f.indexOf('#include <emissivemap_fragment>'));
    // A second puddle of another size keeps its own radius (per-material uniform).
    const q = b.puddle(0, 0, 0.5);
    const s2 = { vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    q.material.onBeforeCompile(s2);
    expect(s2.uniforms.uPuddleR.value).toBe(0.5);
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
    // one kind on both, so the lobe/detail structure is the same
    const t1 = canopyOf(b.tree(5, 5, 1.2, { kind: 'round' }));
    const t2 = canopyOf(b.tree(-8, 13, 1.2, { kind: 'round' }));
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
    // canopy radius ~1.82 against a nominal 1.6 (the round kind), max bush radius ~0.80
    // against a nominal 0.7 — both a modest, bounded overshoot, never a
    // multiple of the original footprint.
    for (const [x, z] of [[0, 0], [5, 5], [-8, 13], [22, -17], [-30, 30]]) {
      // per kind now (polish-canopies): each crown stays near its own
      // nominal radius, the tall birch measured by its height
      for (const kind of ['oak', 'birch', 'round', 'old']) {
        const leaves = canopyOf(b.tree(x, z, 1, { kind }));
        leaves.geometry.computeBoundingSphere();
        const nominal = b.CANOPY_KINDS[kind].r * (kind === 'birch' ? 1.6 : 1);
        expect(leaves.geometry.boundingSphere.radius, kind).toBeLessThan(nominal * 1.3);
      }
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

  // polish-places Task 5 added `shoreLip`. The Pines' and Gorge's hashes were
  // taken from the code before it existed; the Woods' was taken after Task 2
  // (houses) and before Task 5, so it pins only what Task 5 must leave alone.
  // polish-forestfloor re-took it (ad43278f378768ec -> 2ed68de2b3bc1326) when
  // the Woods' nearColor followed its darker ground (0x5f9a4a -> 0x547f3e). The Woods', Pines' and Gorge's bands (water, keepLow, side
  // tints, near colour, an edge, the Gorge's rooftops) do not use it and must
  // be byte-identical.
  it('bands without shoreLip are unchanged', async () => {
    const { WOODS_HORIZON } = await import('../src/world/woods.js');
    const { PINES_HORIZON } = await import('../src/world/pines.js');
    for (const o of [WOODS_HORIZON, PINES_HORIZON, GORGE_HORIZON]) expect(o.shoreLip).toBeUndefined();
    expect(fingerprint(b.horizonBand(WOODS_HORIZON))).toBe('2ed68de2b3bc1326');
    expect(fingerprint(b.horizonBand(PINES_HORIZON))).toBe('eb0eea2daee4dc8d');
    expect(fingerprint(b.horizonBand(GORGE_HORIZON))).toBe('c9031015d29d5c21');
  });

  it('shoreLip leaves a band with no water alone in shape, and lifts a far water to a lip', () => {
    const base = { kind: 'hills', inner: 56, outer: 116, height: 8, color: 0x8ac27e, salt: 5 };
    const pos = (m) => Array.from(m.geometry.attributes.position.array);
    expect(pos(b.horizonBand({ ...base, shoreLip: { width: 8, color: 0xffffff } }))).toEqual(pos(b.horizonBand(base)));
    // a water running out past the bounds to the west
    const avoid = [{ id: 'w', kind: 'rect', minX: -130, maxX: -20, minZ: -10, maxZ: 10 }];
    const plain = b.horizonBand({ ...base, avoid });
    const lipped = b.horizonBand({ ...base, avoid, shoreLip: { width: 8, color: 0xd0c090 } });
    const heightAt = (m, x) => {
      const p = m.geometry.attributes.position;
      let best = null;
      for (let v = 0; v < p.count; v++) {
        if (Math.abs(p.getZ(v)) > 0.5) continue;
        if (!best || Math.abs(p.getX(v) - x) < Math.abs(best[0] - x)) best = [p.getX(v), p.getY(v)];
      }
      return best[1];
    };
    // 0.4 of the 60 m span out is 24 m past the inner edge, x = -80: there the
    // plain band starts to climb; the lipped one holds a lip past it.
    const lipY = heightAt(lipped, -86);
    expect(lipY).toBeGreaterThan(0.1);
    expect(lipY).toBeLessThan(0.45);
    expect(heightAt(plain, -86)).toBeGreaterThan(lipY);
    expect(lipped.material.vertexColors).toBe(true);
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

  it('horizonBand with rooftops and no side tints is white, so the roofs are tinted once', () => {
    const m = b.horizonBand({
      kind: 'hills', inner: 56, outer: 116, height: 7, salt: 5, color: 0x6a8a4a,
      rooftops: { from: 0.1, to: 0.25, count: 6, height: 7 },
    });
    expect(m.material.color.getHex()).toBe(0xffffff);
    expect(m.material.vertexColors).toBe(true);
    // The ring's first vertex carries the band colour itself.
    const c = m.geometry.attributes.color;
    const band = new THREE.Color(0x6a8a4a);
    expect(c.getX(0)).toBeCloseTo(band.r, 5);
    expect(c.getY(0)).toBeCloseTo(band.g, 5);
    expect(c.getZ(0)).toBeCloseTo(band.b, 5);
  });

  // polish-places Task 2. The Gorge's band (the one other band with
  // rooftops, 693 triangles under its ceiling) must not move by a byte: the
  // hash was taken from the code before rooftops grew a `style`.
  it('rooftops without a style are byte-identical', () => {
    const gorge = b.horizonBand(GORGE_HORIZON);
    expect(fingerprint(gorge)).toBe('c9031015d29d5c21');
    expect(gorge.geometry.index.count / 3).toBe(3942);
    const explicit = b.horizonBand({ ...GORGE_HORIZON, rooftops: { ...GORGE_HORIZON.rooftops, style: undefined } });
    expect(fingerprint(explicit)).toBe('c9031015d29d5c21');
  });

  it("houses: small, sunk, windowed", () => {
    const opts = { kind: 'hills', inner: 56, outer: 116, height: 7, wavelength: 34, color: 0x5d8a55, salt: 31, sideTints: tints };
    const rooftops = { from: 0.1, to: 0.25, count: 14, height: 3.6, style: 'houses' };
    const m = b.horizonBand({ ...opts, rooftops });
    const ring = b.horizonBand(opts);
    const RING = ring.geometry.attributes.position.count;
    const spots = b.rooftopSpots(rooftops, 56, 116, 31 + b.ROOFTOP_SALT);
    expect(spots).toHaveLength(14);
    // The band surface under a spot, read off the bare ring by a ray.
    const ray = new THREE.Raycaster();
    const surface = ({ x, z }) => {
      ray.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(ring, false)[0];
      expect(hit, `surface at (${x}, ${z})`).toBeTruthy();
      return hit.point.y;
    };
    const geo = m.geometry;
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    const top = spots.map(() => -Infinity);
    const ext = spots.map(() => ({ minA: Infinity, maxA: -Infinity, minB: Infinity, maxB: -Infinity }));
    const owner = new Int32Array(pos.count).fill(-1);
    for (let v = RING; v < pos.count; v++) {
      const x = pos.getX(v), z = pos.getZ(v);
      let best = 0, bd = Infinity;
      spots.forEach((s, k) => { const d = Math.hypot(x - s.x, z - s.z); if (d < bd) { bd = d; best = k; } });
      owner[v] = best;
      const s = spots[best];
      top[best] = Math.max(top[best], pos.getY(v));
      // the house's own frame: a along its facade (local x), b toward the area
      const dx = x - s.x, dz = z - s.z;
      const a = dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw);
      const bb = dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
      const e = ext[best];
      e.minA = Math.min(e.minA, a); e.maxA = Math.max(e.maxA, a);
      e.minB = Math.min(e.minB, bb); e.maxB = Math.max(e.maxB, bb);
    }
    spots.forEach((s, k) => {
      expect(top[k], `house ${k} drawn`).toBeGreaterThan(-Infinity);
      expect(top[k], `house ${k} ridge`).toBeLessThanOrEqual(surface(s) + 6.5);
      expect(ext[k].maxA - ext[k].minA, `house ${k} width`).toBeLessThanOrEqual(9);
      expect(ext[k].maxB - ext[k].minB, `house ${k} depth`).toBeLessThanOrEqual(7);
    });
    // Windows and doors: dark quads on the faces turned toward the area.
    const idx = geo.index;
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), n = new THREE.Vector3();
    let darkTris = 0;
    const housesWithWindows = new Set();
    for (let t = 0; t < idx.count / 3; t++) {
      const i0 = idx.getX(t * 3), i1 = idx.getX(t * 3 + 1), i2 = idx.getX(t * 3 + 2);
      if (i0 < RING) continue;
      p0.fromBufferAttribute(pos, i0); p1.fromBufferAttribute(pos, i1); p2.fromBufferAttribute(pos, i2);
      n.subVectors(p1, p0).cross(p2.clone().sub(p0)).normalize();
      const inward = new THREE.Vector3(-p0.x, 0, -p0.z).normalize();
      const lum = 0.3 * col.getX(i0) + 0.59 * col.getY(i0) + 0.11 * col.getZ(i0);
      if (n.dot(inward) > 0.7 && lum < 0.2) { darkTris++; housesWithWindows.add(owner[i0]); }
    }
    expect(darkTris / 2).toBeGreaterThanOrEqual(14);
    expect(housesWithWindows.size).toBe(14);
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

  // The log bridges: a crowned walked top at y, round bark shoulders and
  // flanks, a root flare at one end, a sawn end at the other, two branch
  // stubs. Rays from above give the drawn surface; logs run along z here, so
  // the group isn't turned and local x is world x minus the log's centre.
  const logTopAt = (log, x, z) => {
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
    return ray.intersectObject(log, true)[0];
  };
  const logCalls = [
    [[0, -4, 0, 4], 1.6, 0.14],
    [[0, -4, 0, 4, 1.2, 0.2], 1.2, 0.2],
    [[0, -4, 0, 4, 2.8, 0.18], 2.8, 0.18],
    [[0, -4, 0, 4, 3, 0.16, 1.9], 3, 0.16],
    [[0, -4, 0, 4, 2, 0.16, 1.96], 2, 0.16],
    [[0, -4, 0, 4, 1.4, 0.16, 1.4], 1.4, 0.16],
    [[0, -4, 0, 4, 3, 0.16, 0.8], 3, 0.16],
    [[2, -3, 2, 3, 3, 0.16, 1.9], 3, 0.16],
  ];

  it("logBridge's walked top is at y along its centre line, from end to end", () => {
    for (const [args, , y] of logCalls) {
      const log = b.logBridge(...args);
      log.updateMatrixWorld(true);
      const cx = args[0];
      for (const z of [args[1] + 0.05, args[1] / 2, 0, args[3] / 2, args[3] - 0.05]) {
        expect(logTopAt(log, cx, z).point.y, `${args} z ${z}`).toBeCloseTo(y, 4);
      }
    }
  });

  it("logBridge's top is never above y across the walked width, at most 4.5 cm below it, and falls away beyond", () => {
    const log = b.logBridge(0, -4, 0, 4, 3, 0.16, 1.9);
    log.updateMatrixWorld(true);
    for (let z = -3.95; z <= 3.95; z += 0.25) {
      for (let x = -0.9; x <= 0.9001; x += 0.05) {
        const y = logTopAt(log, x, z).point.y;
        expect(y, `(${x.toFixed(2)}, ${z.toFixed(2)})`).toBeLessThanOrEqual(0.16 + 1e-4);
        expect(y, `(${x.toFixed(2)}, ${z.toFixed(2)})`).toBeGreaterThan(0.16 - 0.045);
      }
    }
    // past the flat the bark shoulder rolls down toward the water (0.03)
    for (const z of [-0.5, 0, 0.5]) {
      for (const side of [-1, 1]) {
        const hit = logTopAt(log, side * 1.1, z);
        expect(hit, `z ${z}`).toBeTruthy();
        expect(hit.point.y, `z ${z}`).toBeLessThan(0.06);
      }
    }
  });

  it("logBridge stays inside its footprint for any w and flat, and the root flare reaches it", () => {
    for (const [args, w] of logCalls) {
      const log = b.logBridge(...args);
      const bb = new THREE.Box3().setFromObject(log, true);
      expect(bb.max.x - bb.min.x, `${args}`).toBeLessThanOrEqual(w + 1e-3);
      expect(bb.max.x - bb.min.x, `${args}`).toBeGreaterThan(w * 0.97);
      expect(bb.max.z - bb.min.z, `${args}`).toBeLessThanOrEqual(Math.hypot(args[2] - args[0], args[3] - args[1]) + 1e-3);
    }
  });

  it('logBridge is one closed, consistently wound surface for any w and flat (bar the stubs\' sunk bases)', () => {
    for (const [args] of logCalls) {
      const geo = b.logBridge(...args).children[0].geometry;
      const pos = geo.attributes.position, idx = geo.index.array;
      // weld by position
      const key = new Map(), id = [];
      for (let i = 0; i < pos.count; i++) {
        const k = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => v.toFixed(5)).join();
        if (!key.has(k)) key.set(k, key.size);
        id.push(key.get(k));
      }
      const directed = new Map();
      let vol = 0;
      const v = (i) => new THREE.Vector3().fromBufferAttribute(pos, i);
      for (let t = 0; t < idx.length; t += 3) {
        const [a, c, d] = [idx[t], idx[t + 1], idx[t + 2]];
        vol += v(a).dot(v(c).cross(v(d))) / 6;
        for (const [p, q] of [[a, c], [c, d], [d, a]]) {
          const e = `${id[p]},${id[q]}`;
          directed.set(e, (directed.get(e) ?? 0) + 1);
        }
      }
      let open = 0, twice = 0;
      for (const [e, n] of directed) {
        if (n > 1) twice++;
        const [p, q] = e.split(',');
        if (!directed.has(`${q},${p}`)) open++;
      }
      expect(twice, `${args}: edges wound the same way twice`).toBe(0);
      expect(open, `${args}: open edges`).toBe(12); // the two stubs' six-sided bases
      expect(vol, `${args}`).toBeGreaterThan(0);
    }
  });

  // the Woods', River's and Moor's own bridges (the Pines' runs along x)
  it.each([[-4.5, -15.5, -7.5], [-22, -35.5, -27.5], [4, -5.5, 2.5]])("logBridge's stub bases are sunk inside the bark (x %d)", (cx, za, zb) => {
    const log = b.logBridge(cx, za, cx, zb, 3, 0.16, 1.9);
    log.updateMatrixWorld(true);
    const cz = (za + zb) / 2;
    const geo = log.children[0].geometry, pos = geo.attributes.position, idx = geo.index.array;
    // the open edges' vertices are the base rings; each one that could be
    // seen (above the water, 0.03) must be inside the bark
    const ids = new Set();
    const count = new Map();
    const k = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => v.toFixed(5)).join();
    for (let t = 0; t < idx.length; t += 3) {
      for (const [p, q] of [[0, 1], [1, 2], [2, 0]]) count.set(`${k(idx[t + p])}|${k(idx[t + q])}`, idx[t + p]);
    }
    for (const [e, i] of count) {
      const [p, q] = e.split('|');
      if (!count.has(`${q}|${p}`)) ids.add(i);
    }
    expect(ids.size).toBe(12);
    const ray = new THREE.Raycaster();
    let seen = 0;
    for (const i of ids) {
      const p = new THREE.Vector3(pos.getX(i) + cx, pos.getY(i) + 0.16, pos.getZ(i) + cz);
      if (p.y < 0.01) continue;
      seen++;
      // from outside, straight in toward it: the trunk's bark (front faces
      // only; the stubs' normals lean along the log) is crossed first
      const sx = Math.sign(pos.getX(i));
      const from = new THREE.Vector3(cx + sx * 2, p.y, p.z);
      ray.set(from, new THREE.Vector3(-sx, 0, 0));
      const nz = (h) => Math.abs(geo.attributes.normal.getZ(h.face.a));
      const reach = from.distanceTo(p) - 1e-4;
      const bark = ray.intersectObject(log, true).filter((h) => h.distance < reach && nz(h) < 1e-6);
      expect(bark.length, `base vertex ${i}`).toBeGreaterThanOrEqual(1);
    }
    expect(seen).toBeGreaterThanOrEqual(1);
  });

  describe('logBridge reads as a round log', () => {
    // the bridges' own call: 3 m footprint, 1.9 m walked top at 0.16, 8 m long, along z
    const make = () => b.logBridge(-4.5, -15.5, -4.5, -7.5, 3, 0.16, 1.9);
    const log = make();
    log.updateMatrixWorld(true);
    const meshes = [];
    log.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const trunk = meshes[0];
    const geo = trunk.geometry;
    const lum = (c) => (c.r + c.g + c.b) / 3;
    // the colour of the face a ray hits (mean of its three vertex colours)
    const hitColour = (hit) => {
      const col = geo.attributes.color;
      const c = { r: 0, g: 0, b: 0 };
      for (const i of [hit.face.a, hit.face.b, hit.face.c]) {
        c.r += col.getX(i) / 3; c.g += col.getY(i) / 3; c.b += col.getZ(i) / 3;
      }
      return c;
    };
    const cx = -4.5, cz = -11.5;
    const at = (x, z) => logTopAt(log, cx + x, z);
    const triangles = () => geo.index.count / 3;
    // which end is the root: the one whose bark rises beside the walked strip
    const rise = (z) => Math.max(...[-1.2, 1.2].map((x) => at(x, z)?.point.y ?? -1));
    const rootZ = rise(-15.3) > rise(-7.7) ? -15.5 : -7.5;
    const sawnZ = rootZ === -15.5 ? -7.5 : -15.5;

    it('is one mesh with vertex colours, in the shadow pass', () => {
      expect(meshes.length).toBe(1);
      expect(geo.attributes.color).toBeDefined();
      expect(geo.attributes.color.count).toBe(geo.attributes.position.count);
      expect(trunk.material.vertexColors).toBe(true);
      expect(trunk.userData.noCast).toBeUndefined();
    });

    it('stays inside the triangle budget (at most 600 a bridge)', () => {
      expect(triangles()).toBeLessThanOrEqual(600);
      expect(triangles()).toBeGreaterThan(300);
    });

    it('has a hewn top clearly lighter than its bark flanks, worn lightest down the middle', () => {
      for (const z of [cz - 0.5, cz, cz + 0.5]) {
        const top = at(0.02, z);
        for (const side of [-1, 1]) {
          const flank = at(side * 1.05, z);
          expect(flank.point.y).toBeLessThan(0.12);
          expect(lum(hitColour(top))).toBeGreaterThan(lum(hitColour(flank)) * 1.3);
        }
        expect(lum(hitColour(at(0.05, z)))).toBeGreaterThan(lum(hitColour(at(0.5, z))));
      }
    });

    it('keeps bark (the wane) beyond a wavy hewn edge, and the hewn wood is weathered, not a pale board', () => {
      for (const z of [cz - 0.5, cz, cz + 0.5]) {
        for (const side of [-1, 1]) {
          expect(lum(hitColour(at(side * 0.86, z)))).toBeLessThan(lum(hitColour(at(side * 0.4, z))) * 0.75);
        }
        const mid = new THREE.Color(...Object.values(hitColour(at(0, z))));
        expect(mid.getHSL({}, THREE.SRGBColorSpace).l).toBeLessThan(0.45);
      }
      // the hewn edge (up-facing vertices, out past the middle) wanders along the log
      const pos = geo.attributes.position, nor = geo.attributes.normal;
      for (const side of [-1, 1]) {
        const xs = [];
        for (let i = 0; i < pos.count; i++) {
          if (nor.getY(i) > 0.99 && Math.abs(nor.getZ(i)) < 0.01 && pos.getX(i) * side > 0.35 && pos.getX(i) * side < 0.85) xs.push(pos.getX(i) * side);
        }
        expect(xs.length).toBeGreaterThanOrEqual(10);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.08);
      }
    });

    it('rolls over round shoulders into its flanks: smooth normals from the top to the side above the water', () => {
      // the surface drops ever faster past the walked strip
      const ys = [0.9, 0.96, 1.02, 1.08].map((x) => at(x, cz).point.y);
      for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1]);
      expect(ys[2] - ys[3]).toBeGreaterThan(ys[0] - ys[1]);
      // the flank's own normals (not the top, not the ends) turn from near
      // up to about 50 degrees above the water line (0.03), and reach
      // the vertical at the bulge just under it
      const pos = geo.attributes.position, nor = geo.attributes.normal;
      const tilts = [], under = [];
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(nor.getZ(i)) > 0.01 || Math.abs(pos.getX(i)) < 0.85 || Math.abs(pos.getX(i)) > 1.25) continue;
        const tilt = (Math.acos(Math.min(1, nor.getY(i))) * 180) / Math.PI;
        if (pos.getY(i) + 0.16 > 0.03) tilts.push(tilt);
        else if (pos.getY(i) + 0.16 > -0.12) under.push(tilt);
      }
      expect(Math.min(...tilts)).toBeLessThan(20);
      expect(Math.max(...tilts)).toBeGreaterThan(45);
      expect(Math.max(...under)).toBeGreaterThan(80);
      // shared between the faces either side (indexed, far fewer vertices than corners)
      expect(pos.count).toBeLessThan(triangles() * 3 * 0.75);
    });

    it('flares into root buttresses at one end, either side of the walked strip', () => {
      const dz = rootZ === -15.5 ? 0.2 : -0.2;
      for (const side of [-1, 1]) {
        expect(at(side * 1.2, rootZ + dz).point.y).toBeGreaterThan(0.16 + 0.05);
      }
      // the sawn end has none
      expect(rise(sawnZ - dz)).toBeLessThan(0.16);
    });

    it('shows end grain at the sawn end in at least three tones with a dark bark rim, and a dark root end', () => {
      const dir = sawnZ === -15.5 ? 1 : -1;
      for (const dx of [-0.8, -0.3, 0, 0.3, 0.8]) {
        const ray = new THREE.Raycaster();
        ray.set(new THREE.Vector3(cx + dx, 0.16 - 0.08, sawnZ - dir * 0.3), new THREE.Vector3(0, 0, dir));
        const hit = ray.intersectObject(log, true)[0];
        expect(hit, `dx ${dx}`).toBeTruthy();
        expect(hit.point.z).toBeCloseTo(sawnZ, 3);
        const n = hit.face.normal.clone().transformDirection(trunk.matrixWorld);
        expect(n.z * -dir).toBeGreaterThan(0.99);
      }
      const pos = geo.attributes.position, nor = geo.attributes.normal, col = geo.attributes.color;
      const endVerts = (zEnd) => {
        const zl = zEnd - cz, out = [];
        for (let i = 0; i < pos.count; i++) {
          if (Math.abs(nor.getZ(i)) > 0.99 && Math.abs(pos.getZ(i) - zl) < 1e-4) out.push(i);
        }
        return out;
      };
      const colourOf = (i) => ({ r: col.getX(i), g: col.getY(i), b: col.getZ(i) });
      const sawn = endVerts(sawnZ);
      const tones = new Set(sawn.map((i) => Object.values(colourOf(i)).map((v) => v.toFixed(2)).join()));
      expect(tones.size).toBeGreaterThanOrEqual(3);
      const lums = sawn.map((i) => lum(colourOf(i)));
      expect(Math.min(...lums)).toBeLessThan(Math.max(...lums) * 0.4);
      const root = endVerts(rootZ);
      expect(root.length).toBeGreaterThan(10);
      for (const i of root) expect(lum(colourOf(i))).toBeLessThan(Math.max(...lums) * 0.5);
    });

    it("has no T-junctions: no vertex lies inside another face's edge", () => {
      // every edge of every triangle, against every vertex position on the
      // same plane-ish surface: a vertex strictly inside an edge (not at an
      // end) means a crack can open there
      const pos = geo.attributes.position, idx = geo.index.array;
      const P = (i) => new THREE.Vector3().fromBufferAttribute(pos, i);
      const keys = new Map();
      for (let i = 0; i < pos.count; i++) keys.set(P(i).toArray().map((v) => v.toFixed(5)).join(), P(i));
      const pts = [...keys.values()];
      const edges = new Set();
      for (let t = 0; t < idx.length; t += 3) {
        for (const [a, c] of [[0, 1], [1, 2], [2, 0]]) {
          const i = idx[t + a], j = idx[t + c];
          edges.add(i < j ? `${i},${j}` : `${j},${i}`);
        }
      }
      let bad = 0;
      const seg = new THREE.Line3(), q = new THREE.Vector3();
      for (const e of edges) {
        const [i, j] = e.split(',').map(Number);
        seg.set(P(i), P(j));
        const l = seg.distance();
        if (l < 1e-4) continue;
        for (const p of pts) {
          const t = seg.closestPointToPointParameter(p, true);
          if (t < 1e-3 || t > 1 - 1e-3) continue;
          seg.at(t, q);
          if (q.distanceTo(p) < 1e-5) bad++;
        }
      }
      expect(bad).toBe(0);
    }, 60_000);

    it('has two broken branch stubs standing up out of the flanks over the water, off the walked strip, plus moss', () => {
      const pos = geo.attributes.position, col = geo.attributes.color;
      let mossy = 0;
      for (let i = 0; i < pos.count; i++) if (col.getY(i) > col.getX(i) * 1.1) mossy++;
      expect(mossy).toBeGreaterThan(0);
      // stub vertices: above the walked top, away from the root flare
      const rootL = rootZ - cz;
      const high = [];
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0.12 && Math.abs(pos.getZ(i) - rootL) > 1.9) high.push(i);
      }
      const sides = new Set(high.map((i) => Math.sign(pos.getX(i))));
      expect(sides.size).toBe(2);
      for (const i of high) {
        expect(Math.abs(pos.getX(i))).toBeGreaterThan(0.95);
        expect(Math.abs(pos.getX(i))).toBeLessThanOrEqual(1.5);
      }
      // the bigger one stands well clear of the top
      expect(Math.max(...high.map((i) => pos.getY(i)))).toBeGreaterThan(0.3);
    });

    it('is deterministic', () => {
      const again = make().children[0].geometry;
      for (const k of ['position', 'normal', 'color']) {
        expect(Array.from(again.attributes[k].array)).toEqual(Array.from(geo.attributes[k].array));
      }
      expect(Array.from(again.index.array)).toEqual(Array.from(geo.index.array));
    });
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

  describe('steppingStones colour', () => {
    const SIDES = 8;
    const per = new THREE.CylinderGeometry(0.4, 0.4, 0.2, SIDES).attributes.position.count;
    // one stone's vertices: [rows of {y, rad, r,g,b}] around its own centroid
    function stones(m) {
      const pos = m.geometry.attributes.position, col = m.geometry.attributes.color;
      const out = [];
      for (let s = 0; s < pos.count / per; s++) {
        let cx = 0, cz = 0;
        for (let k = 0; k < per; k++) { cx += pos.getX(s * per + k); cz += pos.getZ(s * per + k); }
        cx /= per; cz /= per;
        const vs = [];
        for (let k = 0; k < per; k++) {
          const i = s * per + k;
          vs.push({ y: pos.getY(i), rad: Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz), r: col.getX(i), g: col.getY(i), b: col.getZ(i) });
        }
        out.push(vs);
      }
      return out;
    }
    const lum = (v) => (v.r + v.g + v.b) / 3;
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const m = b.steppingStones(0, 0, 14, 0, 14);

    it('has a colour attribute, vertexColors and the dusk tag', () => {
      expect(m.geometry.attributes.color.count).toBe(m.geometry.attributes.position.count);
      expect(m.material.vertexColors).toBe(true);
      expect(m.userData.duskTint).toBe(true);
      expect(m.castShadow).toBe(false);
      expect(m.userData.noCast).toBe(true);
    });

    it('gives neighbouring stones different base tones, grey and a little lower than before', () => {
      const tones = new Set(), means = [];
      for (const vs of stones(m)) {
        const rim = vs.filter((v) => v.y > 0.05 && v.rad > 0.3);
        tones.add(mean(rim.map((v) => v.r)).toFixed(3) + mean(rim.map((v) => v.b)).toFixed(3));
        means.push(mean(vs.map(lum)));
      }
      expect(tones.size).toBeGreaterThanOrEqual(3);
      // still stone: no channel strays far from the others on the rim
      for (const vs of stones(m)) for (const v of vs.filter((q) => q.y > 0.05 && q.rad > 0.3)) {
        expect(Math.max(v.r, v.g, v.b) - Math.min(v.r, v.g, v.b)).toBeLessThan(0.12);
      }
      // darker overall than the flat 0x8a8a84 (~0.54 sRGB, ~0.25 linear)
      const flat = new THREE.Color(0x8a8a84);
      expect(mean(means)).toBeLessThan((flat.r + flat.g + flat.b) / 3);
    });

    it('darkens each stone toward its damp bottom', () => {
      for (const vs of stones(m)) {
        const top = mean(vs.filter((v) => v.y > 0.05 && v.rad > 0.3).map(lum));
        const bottom = mean(vs.filter((v) => v.y < -0.05 && v.rad > 0.3).map(lum));
        expect(bottom).toBeLessThan(top * 0.8);
      }
    });

    it('mosses the cap centre of some stones but not all', () => {
      const mossy = stones(m).filter((vs) => {
        const minRad = Math.min(...vs.filter((v) => v.y > 0.05).map((v) => v.rad));
        const c = vs.filter((v) => v.y > 0.05 && v.rad < minRad + 0.03);
        expect(c.length).toBeGreaterThan(0);
        return c.every((v) => v.g > v.r * 1.12 && v.g > v.b * 1.12);
      });
      expect(mossy.length).toBeGreaterThan(0);
      expect(mossy.length).toBeLessThan(14);
      expect(mossy.length).toBeGreaterThanOrEqual(4);
    });

    it('makes every pair of neighbours visibly different in lightness', () => {
      const all = stones(m).map((vs) => mean(vs.map(lum)));
      for (let i = 1; i < all.length; i++) expect(Math.abs(all[i] - all[i - 1]), `stone ${i}`).toBeGreaterThan(0.015);
    });

    it('outlines each cap: the rim is darker than the centre', () => {
      for (const vs of stones(m)) {
        const top = vs.filter((v) => v.y > 0.05);
        const minRad = Math.min(...top.map((v) => v.rad));
        const cs = top.filter((v) => v.rad < minRad + 0.03), rs = top.filter((v) => v.rad > 0.3);
        const greenness = (v) => v.g / (v.r + v.b);
        if (greenness(cs[0]) > 0.55) {
          // mossy: the centre is the greenest part, the rim only part-way
          expect(Math.max(...rs.map(greenness))).toBeLessThan(greenness(cs[0]));
        } else {
          expect(Math.min(...rs.map(lum))).toBeLessThan(mean(cs.map(lum)));
        }
      }
    });

    it('is deterministic', () => {
      const again = b.steppingStones(0, 0, 14, 0, 14);
      expect(Array.from(again.geometry.attributes.color.array)).toEqual(Array.from(m.geometry.attributes.color.array));
    });
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

  it('fernBed fronds are arching leaflet fronds, dark at the root and light at the tips', () => {
    const spots = [{ x: 0, z: 0 }, { x: 3, z: 1 }, { x: -2, z: 4 }];
    const m = b.fernBed(spots, 7);
    expect(m.material.vertexColors).toBe(true);
    expect(m.material.side).toBe(THREE.DoubleSide);
    const pos = m.geometry.attributes.position;
    expect(pos.count / 3 / (spots.length * 7)).toBeLessThanOrEqual(14);
    const col = m.geometry.attributes.color;
    expect(col).toBeDefined();
    const lum = (i) => 0.2126 * col.getX(i) + 0.7152 * col.getY(i) + 0.0722 * col.getZ(i);
    const dist = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      dist.push(Math.min(...spots.map((s) => Math.hypot(x - s.x, z - s.z))));
    }
    const roots = [];
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0.05) roots.push(i);
    const cut = [...dist].sort((a, c) => c - a)[Math.floor(pos.count * 0.1)];
    const tips = [];
    for (let i = 0; i < pos.count; i++) if (dist[i] >= cut) tips.push(i);
    const avg = (ix) => ix.reduce((s, i) => s + lum(i), 0) / ix.length;
    expect(roots.length).toBeGreaterThan(0);
    expect(avg(tips)).toBeGreaterThan(avg(roots));
  });

  it('fernBed draws the same Math.random count as the box fronds did (uuid parity)', () => {
    const drawsOf = (spots) => {
      const real = Math.random;
      const seeded = mulberry32(12345);
      let draws = 0;
      Math.random = () => { draws++; return seeded(); };
      try { b.fernBed(spots, 7); } finally { Math.random = real; }
      return draws;
    };
    drawsOf([{ x: 0, z: 0 }]); // warm any material cache, uncounted
    // pinned on the old BoxGeometry fronds: (geometries + material + mesh) * 4 uuid draws
    expect(drawsOf([])).toBe(4 * (1 + 2));
    expect(drawsOf([{ x: 0, z: 0 }])).toBe(4 * (7 + 1 + 2));
    expect(drawsOf([{ x: 0, z: 0 }, { x: 3, z: 1 }, { x: -2, z: 4 }])).toBe(4 * (21 + 1 + 2));
  });

  it('brambleBed is one mesh, under a metre tall, out of the shadow pass', () => {
    const m = b.brambleBed([{ x: 0, z: 0 }, { x: 5, z: 2 }], 3);
    expect(m.isMesh).toBe(true);
    expect(bbox(m).max.y).toBeLessThanOrEqual(1.0);
    expect(bbox(m).max.y).toBeGreaterThan(0.5);
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
  });

  it('heatherBed is a green base and pink leaning spikes, low, out of the shadow pass', () => {
    const spots = [{ x: 0, z: 0 }, { x: 4, z: 1 }];
    const g = b.heatherBed(spots, 5);
    const base = g.getObjectByName('heatherBase');
    const bloom = g.getObjectByName('heatherBloom');
    expect(base.isMesh && bloom.isMesh).toBe(true);
    for (const m of [base, bloom]) {
      const bb = bbox(m);
      expect(bb.max.y).toBeLessThanOrEqual(0.5);
      expect(bb.min.y).toBeGreaterThanOrEqual(-1e-6);
      expect(m.castShadow).toBe(false);
      expect(m.userData.noCast).toBe(true);
    }
    // not pink rocks: the lumps are green, the colour is in the spikes
    expect(base.material.color.getHex()).toBe(b.HEATHER_BASE);
    expect(bloom.material.vertexColors).toBe(true);
    // the spikes lean (render/rustle.js): roots at 0, tips at 1
    const lean = bloom.geometry.attributes.aLean.array;
    expect(Math.min(...lean)).toBeCloseTo(0, 5);
    expect(Math.max(...lean)).toBeCloseTo(1, 5);
    expect(bloom.userData.rustle.uCat).toBeTruthy();
    // the same every time
    const again = b.heatherBed(spots, 5);
    expect(again.getObjectByName('heatherBloom').geometry.attributes.position.array).toEqual(bloom.geometry.attributes.position.array);
    expect(again.getObjectByName('heatherBase').geometry.attributes.position.array).toEqual(base.geometry.attributes.position.array);
    expect(() => b.heatherBed([], 5)).not.toThrow();
  });

  it('heatherBed draws on the real Math.random only for its base, as the old cushions did', () => {
    const spots = [{ x: 0, z: 0 }, { x: 4, z: 1 }, { x: 8, z: 2 }];
    const real = Math.random;
    let n = 0;
    Math.random = () => { n++; return real(); };
    try { b.heatherBed(spots, 5); } finally { Math.random = real; }
    // 4 per uuid: 6 cushion geometries, the merged geometry, its material, its mesh
    expect(n).toBe(4 * (spots.length * 2 + 3));
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
    expect(found.gorseBloom.geometry.attributes.position.count).toBeGreaterThan(0);
    const gb = bbox(found.gorse);
    expect(bbox(found.gorseBloom).min.y).toBeGreaterThan((gb.min.y + gb.max.y) / 2);
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

  it('burrow holes are clear of their spoil mound', () => {
    const spots = [{ x: 0, z: 0 }, { x: 6, z: 1 }, { x: -4, z: 7 }];
    const g = b.burrows(spots, 2);
    const mpos = g.getObjectByName('burrowSpoil').geometry.attributes.position;
    const hpos = g.getObjectByName('burrowHoles').geometry.attributes.position;
    // the mound is above the hole's y (0.02) wherever it stands, so no mound
    // vertex may sit over any hole vertex (rim or centre) within 0.01 m
    for (let i = 0; i < hpos.count; i++) {
      for (let j = 0; j < mpos.count; j++) {
        if (mpos.getY(j) <= 0.02) continue;
        expect(Math.hypot(hpos.getX(i) - mpos.getX(j), hpos.getZ(i) - mpos.getZ(j))).toBeGreaterThan(0.01);
      }
    }
    // each hole centre is at least the mound's footprint away from its mound centre
    spots.forEach((sp) => {
      let nearest = Infinity;
      for (let j = 0; j < mpos.count; j++) {
        if (mpos.getY(j) > 0.02) nearest = Math.min(nearest, Math.hypot(sp.x - mpos.getX(j), sp.z - mpos.getZ(j)));
      }
      expect(nearest).toBeGreaterThanOrEqual(0.22);
    });
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
  it('reedBed blades have no top or bottom faces', () => {
    const spots = [{ x: 0, z: 0 }, { x: 1, z: 0.5 }, { x: -2, z: 3 }];
    const m = b.reedBed(spots, 3);
    const g = m.geometry;
    const pos = g.attributes.position;
    const idx = g.index ? Array.from(g.index.array) : Array.from({ length: pos.count }, (_, i) => i);
    expect(idx.length / 3).toBe(spots.length * 5 * 8);
    const a = new THREE.Vector3(); const bb = new THREE.Vector3(); const c = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      a.fromBufferAttribute(pos, idx[t]); bb.fromBufferAttribute(pos, idx[t + 1]); c.fromBufferAttribute(pos, idx[t + 2]);
      const n = bb.clone().sub(a).cross(c.clone().sub(a)).normalize();
      expect(Math.abs(n.y)).toBeLessThan(0.9);
    }
  });

  it('heatherBed cushions keep no face that points down into the ground', () => {
    const spots = [{ x: 0, z: 0 }, { x: 4, z: 1 }];
    const base = b.heatherBed(spots, 5).getObjectByName('heatherBase');
    const pos = base.geometry.attributes.position;
    expect(pos.count / 3).toBeLessThan(spots.length * 2 * 20);
    const a = new THREE.Vector3(); const bb = new THREE.Vector3(); const c = new THREE.Vector3();
    for (let t = 0; t < pos.count; t += 3) {
      a.fromBufferAttribute(pos, t); bb.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
      const n = bb.clone().sub(a).cross(c.clone().sub(a)).normalize();
      expect(n.y).toBeGreaterThanOrEqual(-0.3);
    }
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

  it('pineStand is two meshes that match the pines it stands for', () => {
    const trees = [{ x: 0, z: 0, scale: 1 }, { x: 5, z: -3, scale: 1.5 }];
    const g = b.pineStand(trees, 3);
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.map((m) => m.name).sort()).toEqual(['standFoliage', 'standTrunks']);
    const foliage = meshes.find((m) => m.name === 'standFoliage');
    const one = b.pine(0, 0);
    const oneFoliage = one.children.find((o) => o.isMesh && o !== one.children[0]);
    expect(foliage.geometry.attributes.position.count)
      .toBe(2 * oneFoliage.geometry.attributes.position.count);
    expect(meshes.find((m) => m.name === 'standTrunks').geometry.attributes.position.count)
      .toBe(2 * one.children[0].geometry.attributes.position.count);
    for (const m of meshes) expect(m.castShadow).toBe(true);
    const box = new THREE.Box3().setFromObject(g);
    const ref = new THREE.Box3().setFromObject(b.pine(0, 0, 1))
      .union(new THREE.Box3().setFromObject(b.pine(5, -3, 1.5)));
    expect(Math.abs(box.max.y - ref.max.y)).toBeLessThan(0.05);
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
    // turning a cone about y moves its corners by at most one cone radius (1.3 x scale)
    expect(box.min.x).toBeGreaterThanOrEqual(ref.min.x - 1.3 * 1.5);
    expect(box.max.x).toBeLessThanOrEqual(ref.max.x + 1.3 * 1.5);
    expect(box.min.z).toBeGreaterThanOrEqual(ref.min.z - 1.3 * 1.5);
    expect(box.max.z).toBeLessThanOrEqual(ref.max.z + 1.3 * 1.5);
  });

  it('pineStand is the same for the same trees and seed, and an empty stand builds', () => {
    const trees = [{ x: 1, z: 2, scale: 1.2 }, { x: -4, z: 7, scale: 0.9 }];
    const pos = (g) => {
      const out = [];
      g.traverse((o) => { if (o.isMesh) out.push(Array.from(o.geometry.attributes.position.array)); });
      return out;
    };
    expect(pos(b.pineStand(trees, 4))).toEqual(pos(b.pineStand(trees, 4)));
    let empty;
    expect(() => { empty = b.pineStand([], 1); }).not.toThrow();
    let n = 0;
    empty.traverse((o) => { if (o.isMesh) n++; });
    expect(n).toBe(2);
  });

  it('a stand tree with y is lifted, and one without is where it was', () => {
    const flat = [{ x: 1, z: 2, scale: 1.2 }, { x: -4, z: 7, scale: 0.9 }];
    const lifted = [{ x: 1, z: 2, scale: 1.2, y: 9 }, { x: -4, z: 7, scale: 0.9 }];
    const parts = (g) => ['standTrunks', 'standFoliage'].map((n) => g.getObjectByName(n).geometry.attributes.position);
    const [flatTrunks, flatCones] = parts(b.pineStand(flat, 4));
    const [liftTrunks, liftCones] = parts(b.pineStand(lifted, 4));
    // the trunks and cones of each tree follow one another in the merge: the
    // first tree's are lifted by exactly 9, the second's are untouched
    for (const [a, l] of [[flatTrunks, liftTrunks], [flatCones, liftCones]]) {
      expect(l.count).toBe(a.count);
      const half = a.count / 2;
      for (let v = 0; v < a.count; v++) {
        expect(l.getX(v)).toBe(a.getX(v));
        expect(l.getZ(v)).toBe(a.getZ(v));
        if (v < half) expect(l.getY(v)).toBeCloseTo(a.getY(v) + 9, 5);
        else expect(l.getY(v)).toBe(a.getY(v));
      }
    }
    // a stand with no y anywhere is byte for byte the stand it was, and lists
    // its trees for the fight camera exactly as before
    const g = b.pineStand(flat, 4);
    expect(g.userData.occluderStand.trees).toEqual(flat);
    expect(b.pineStand(lifted, 4).userData.occluderStand.trees).toEqual(lifted);
  });

  it('toadstools are two noCast meshes under 0.3 m', () => {
    const g = b.toadstools([{ x: 0, z: 0 }, { x: 4, z: 2 }], 6);
    const found = {};
    g.traverse((o) => { if (o.isMesh) found[o.name] = o; });
    expect(Object.keys(found).sort()).toEqual(['toadstoolCaps', 'toadstoolStems']);
    for (const m of Object.values(found)) {
      expect(m.castShadow).toBe(false);
      expect(m.userData.noCast).toBe(true);
    }
    expect(new THREE.Box3().setFromObject(g).max.y).toBeLessThanOrEqual(0.3);
    expect(() => b.toadstools([], 6)).not.toThrow();
  });

  it('caveCrystals is one merged noCast mesh, low and the same every time', () => {
    // A wall along x = 0 facing +x (into the cave), floor at y 4.
    const spots = [0, 1, 2, 3].map((k) => ({ x: 0.1, z: k, y: 4, nx: 1, nz: 0 }));
    const g = b.caveCrystals(spots, 9, { color: 0x9fc7d8 });
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes).toHaveLength(1);
    const [m] = meshes;
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
    expect(m.material.emissive.getHex()).toBe(0x9fc7d8);
    expect(m.material.emissiveIntensity).toBe(0.6);
    // three to five crystals a spot (an octahedron is 8 triangles)
    const crystals = m.geometry.attributes.position.count / 24;
    expect(crystals).toBeGreaterThanOrEqual(3 * spots.length);
    expect(crystals).toBeLessThanOrEqual(5 * spots.length);
    // seated on the floor, never taller than 0.3 m, and off the wall's face:
    // a spot 0.1 m out keeps every vertex in front of the wall
    const box = new THREE.Box3().setFromObject(g);
    expect(box.min.y).toBeCloseTo(4, 6);
    expect(box.max.y - 4).toBeLessThanOrEqual(0.3);
    expect(box.min.x).toBeGreaterThan(0);
    expect(box.max.x).toBeLessThanOrEqual(0.1 + 0.05 + 0.1);
    // the same every time for one seed
    const again = b.caveCrystals(spots, 9, { color: 0x9fc7d8 });
    let a2;
    again.traverse((o) => { if (o.isMesh) a2 = o; });
    expect(Array.from(a2.geometry.attributes.position.array)).toEqual(Array.from(m.geometry.attributes.position.array));
    expect(() => b.caveCrystals([], 9)).not.toThrow();
  });

  it('caveFlecks is one merged noCast emissive mesh just off its wall', () => {
    const spots = [{ x: 0, z: 0, y: 1, nx: 0, nz: -1 }, { x: 1, z: 0, y: 2, nx: 0, nz: -1 }];
    const g = b.caveFlecks(spots, 3, { color: 0xe8b84a });
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes).toHaveLength(1);
    expect(meshes[0].userData.noCast).toBe(true);
    expect(meshes[0].material.emissiveIntensity).toBe(0.6);
    const box = new THREE.Box3().setFromObject(g);
    expect(box.min.z).toBeCloseTo(-0.015, 6);
    expect(box.max.z).toBeCloseTo(-0.015, 6);
  });
});

// The Gorge's real shape records (builder.js itself imports nothing from the
// Gorge: the shapes are passed in).
const gorgeShape = await import('../src/world/gorgeshape.js');
const { ROCK_WALKS: gorgeRockWalks, GORGE_ROCK_MOUTHS, GORGE_ROCK_KEEP } = await import('../src/world/gorge.js');
const { seedFromCode } = await import('../src/rng.js');
const { floodGorge } = await import('./helpers/gorgeflood.js');
const { findTJunctions } = await import('./helpers/meshcheck.js');
const { MAX_PASSES } = await import('../src/world/meshconform.js');
const { createRockRelief, ROCK_PROUD, CAVE_PROUD, CREST_JAG } = await import('../src/world/rockrelief.js');

describe('the Gorge rock: rockTerrain and scree', () => {
  const { WALK_SHAPES, MASSES, CEILINGS } = gorgeShape;
  // The walks gorge.js draws the rock from: every walkable shape, cave and
  // den floor, the camp den's too (the masses are cut round it).
  const WALKS = gorgeRockWalks;
  const build = (opts = {}) => b.rockTerrain({ walks: WALKS, masses: MASSES, ceilings: CEILINGS, seed: 7, mouths: GORGE_ROCK_MOUTHS, ...opts });
  // The relief field the build moves its vertices by (keep [] here, as in build()).
  const relief = createRockRelief({ walks: WALKS, masses: MASSES, ceilings: CEILINGS, seed: 7 });

  // Raycasts see both sides of every face, so a face wound the wrong way can
  // still be found (the rim test checks the winding on its own).
  let terrain;
  const meshes = {};
  beforeAll(() => {
    terrain = build();
    terrain.traverse((o) => { if (o.isMesh) meshes[o.name] = o; });
    for (const m of Object.values(meshes)) m.material.side = THREE.DoubleSide;
    terrain.updateMatrixWorld(true);
  });
  const { ground, reached, forEachReached } = floodGorge();
  const ray = new THREE.Raycaster();
  const cast = (origin, dir, names, far = Infinity) => {
    ray.set(origin, dir);
    ray.far = far;
    return ray.intersectObjects(names.map((n) => meshes[n]), false);
  };
  const ALL = ['rockFaces', 'ledgeTops', 'lips'];
  const tris = (m) => m.geometry.attributes.position.count / 3;
  // An even pick of n from a list, the same every run.
  const pick = (list, n) => Array.from({ length: Math.min(n, list.length) }, (_, i) => list[Math.floor((i * list.length) / Math.min(n, list.length))]);

  it('rockTerrain is three merged meshes, the same every time', () => {
    expect(Object.keys(meshes).sort()).toEqual(['ledgeTops', 'lips', 'rockFaces']);
    expect(terrain.children.filter((o) => o.isMesh)).toHaveLength(3);
    const again = build();
    const pos = (g) => {
      const out = {};
      g.traverse((o) => { if (o.isMesh) out[o.name] = Array.from(o.geometry.attributes.position.array); });
      return out;
    };
    const a = pos(terrain);
    const c = pos(again);
    for (const n of ALL) {
      expect(c[n].length, n).toBe(a[n].length);
      expect(c[n], n).toEqual(a[n]);
    }
  });

  // The shell of a mesh: its first userData.shellTris triangles (anything a
  // later pass dresses the rock with is appended after them).
  const shellOf = (group) => {
    const out = {};
    const counts = group.userData.shellTris;
    group.traverse((o) => {
      if (o.isMesh) out[o.name] = o.geometry.attributes.position.array.subarray(0, counts[o.name] * 9);
    });
    return out;
  };
  // Every vertex of a position array: fn(x, y, z, i).
  const eachVertex = (arr, fn) => {
    for (let i = 0; i < arr.length; i += 3) fn(arr[i], arr[i + 1], arr[i + 2], i / 3);
  };
  const keyOf = (x, y, z) => `${x},${y},${z}`;
  const shapeY = (s, x, z) => {
    if (s.along !== 'z' || s.maxZ === s.minZ) return s.y0;
    const f = Math.min(1, Math.max(0, (z - s.minZ) / (s.maxZ - s.minZ)));
    return s.y0 + f * (s.y1 - s.y0);
  };
  const inRectE = (s, x, z, e = 1e-6) => x >= s.minX - e && x <= s.maxX + e && z >= s.minZ - e && z <= s.maxZ + e;
  const CAPS = CEILINGS.map((c) => ({ ...c, top: b.capTopFor(c, MASSES) })).filter((c) => c.top > c.y0);

  // Conforming after the relief: no vertex of any of the three shells lies
  // inside an edge of another triangle, and no two distinct vertices sit
  // within 1e-4 of each other (a split vertex would be keyed apart, move
  // apart and tear).
  it('the relieved shell is still conforming', () => {
    expect(terrain.userData.shellTris).toBeTruthy();
    const shell = shellOf(terrain);
    expect(findTJunctions(shell)).toEqual([]);
    const C = 1e-4;
    const cells = new Map();
    const uniq = new Map();
    for (const arr of Object.values(shell)) eachVertex(arr, (x, y, z) => uniq.set(keyOf(x, y, z), [x, y, z]));
    for (const v of uniq.values()) {
      const k = v.map((c) => Math.floor(c / C)).join(',');
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(v);
    }
    const close = [];
    for (const v of uniq.values()) {
      const [i, j, k] = v.map((c) => Math.floor(c / C));
      for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let d = -1; d <= 1; d++) {
        for (const w of cells.get(`${i + a},${j + c},${k + d}`) ?? []) {
          if (w === v) continue;
          const dd = Math.sqrt((v[0] - w[0]) ** 2 + (v[1] - w[1]) ** 2 + (v[2] - w[2]) ** 2);
          if (dd < C) close.push(`${v} ~ ${w}`);
        }
      }
    }
    expect(close.slice(0, 8)).toEqual([]);
  }, 120_000);

  // The check above runs on the MOVED shell, where a missed split has already
  // pulled its T-point off the edge it sat on (and so can't be seen). So: the
  // unmoved shell is conforming, conforming converged (it stops silently at
  // MAX_PASSES), and the moved shell's open edges are exactly the unmoved
  // one's (a crack the relief opened would add some).
  it('the unmoved shell is conforming, and conforming converged', () => {
    const flat = build({ relief: false, dressing: false });
    expect(findTJunctions(shellOf(flat))).toEqual([]);
    expect(terrain.userData.conformPasses).toBeGreaterThan(0);
    expect(terrain.userData.conformPasses).toBeLessThan(MAX_PASSES);
    expect(flat.userData.conformPasses).toBe(terrain.userData.conformPasses);
  }, 120_000);

  // One-sided edges: those of exactly one triangle in the three shells
  // together, vertices keyed by position. Each is named by its triangle's
  // vertex indices (mesh and index), the same in both builds (same order).
  const openEdges = (shell) => {
    const count = new Map();
    const where = new Map();
    for (const [name, arr] of Object.entries(shell)) {
      for (let t = 0; t < arr.length; t += 9) {
        for (let e = 0; e < 3; e++) {
          const i = t + 3 * e;
          const j = t + 3 * ((e + 1) % 3);
          const ka = keyOf(arr[i], arr[i + 1], arr[i + 2]);
          const kb = keyOf(arr[j], arr[j + 1], arr[j + 2]);
          const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          count.set(k, (count.get(k) ?? 0) + 1);
          const [a, c] = i < j ? [i / 3, j / 3] : [j / 3, i / 3];
          where.set(k, `${name}:${a}-${c}`);
        }
      }
    }
    return [...count].filter(([, n]) => n === 1).map(([k]) => where.get(k)).sort();
  };

  it("the relief opens no edge: the moved shell's open edges are the unmoved one's", () => {
    const flatEdges = openEdges(shellOf(build({ relief: false })));
    const movedEdges = openEdges(shellOf(terrain));
    console.log(`[rock] open edges: ${flatEdges.length} unmoved, ${movedEdges.length} moved`);
    expect(flatEdges.length).toBeGreaterThan(0);
    expect(movedEdges.length).toBe(flatEdges.length);
    expect(movedEdges).toEqual(flatEdges);
  }, 120_000);

  // No triangle turns over: each moved shell triangle (unmoved area over
  // 1e-6) faces the way it did unmoved (the same build, the same order, so
  // triangle t is triangle t). In the test's build (seed 7) and the Gorge's
  // own (its seed and keep discs).
  const flipsOf = (flatGroup, movedGroup) => {
    const flat = shellOf(flatGroup);
    const moved = shellOf(movedGroup);
    let n = 0;
    const flipped = [];
    const nrm = (arr, t) => {
      const ux = arr[t + 3] - arr[t], uy = arr[t + 4] - arr[t + 1], uz = arr[t + 5] - arr[t + 2];
      const vx = arr[t + 6] - arr[t], vy = arr[t + 7] - arr[t + 1], vz = arr[t + 8] - arr[t + 2];
      return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    };
    for (const name of ALL) {
      const f = flat[name];
      const m = moved[name];
      expect(m.length, name).toBe(f.length);
      for (let t = 0; t < f.length; t += 9) {
        const a = nrm(f, t);
        const area = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) / 2;
        if (!(area > 1e-6)) continue;
        n++;
        const c = nrm(m, t);
        const dot = a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
        if (!(dot > 0)) flipped.push(`${name} area ${area.toFixed(4)}: ${Array.from(f.slice(t, t + 9)).map((v) => +v.toFixed(3))} -> ${Array.from(m.slice(t, t + 9)).map((v) => +v.toFixed(3))}`);
      }
    }
    return { n, flipped };
  };
  // None known. (At the old 1.6 m grid this build had one 0.02 m2 edge-on fan
  // sliver at the top of eastMass's south wall; the finer wall grid for
  // polish-gorgerock2 cut it away. A new flip fails.)
  const KNOWN_FLIPS = [];
  it('no shell triangle flips', () => {
    const { n, flipped } = flipsOf(build({ relief: false }), terrain);
    expect(n).toBeGreaterThan(5000);
    expect(flipped).toEqual(KNOWN_FLIPS);
  }, 120_000);
  it("no shell triangle flips in the Gorge's own rock", () => {
    const own = { seed: seedFromCode('gorge-rock'), keep: GORGE_ROCK_KEEP };
    const { n, flipped } = flipsOf(build({ ...own, relief: false }), build(own));
    expect(n).toBeGreaterThan(5000);
    expect(flipped).toEqual([]);
  }, 120_000);

  // rockTerrain caches its arrays (keyed on the records' identity and the
  // options): a second build is equal but owns its own buffers, and any
  // other option misses the cache.
  it('a second build is served from the cache, on its own buffers', () => {
    const arrays = (g) => {
      const out = {};
      g.traverse((o) => {
        if (o.isMesh) out[o.name] = ['position', 'color', 'normal'].filter((a) => o.geometry.attributes[a]).map((a) => o.geometry.attributes[a].array);
      });
      return out;
    };
    const t0 = performance.now();
    const cold = build({ seed: 8 });
    const t1 = performance.now();
    const warm = build({ seed: 8 });
    const t2 = performance.now();
    console.log(`[rock] rockTerrain cold ${(t1 - t0).toFixed(1)} ms, warm ${(t2 - t1).toFixed(1)} ms`);
    const a = arrays(cold);
    const c = arrays(warm);
    for (const n of ALL) {
      expect(c[n].length, n).toBe(a[n].length);
      for (let k = 0; k < a[n].length; k++) {
        expect(c[n][k].buffer, n).not.toBe(a[n][k].buffer);
        expect(Array.from(c[n][k]), n).toEqual(Array.from(a[n][k]));
      }
    }
    expect(warm.userData).toEqual(cold.userData);
    expect(warm.userData.shellTris).not.toBe(cold.userData.shellTris);
    // materials are the walk's own, every build
    expect(warm.getObjectByName('rockFaces').material).not.toBe(cold.getObjectByName('rockFaces').material);
    // a walk disposing (or scribbling on) its rock leaves the next build whole
    cold.getObjectByName('rockFaces').geometry.attributes.position.array.fill(0);
    cold.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    expect(Array.from(build({ seed: 8 }).getObjectByName('rockFaces').geometry.attributes.position.array)).toEqual(Array.from(c.rockFaces[0]));
    // another seed is another rock
    const other = build({ seed: 9 }).getObjectByName('rockFaces').geometry.attributes.position.array;
    expect(Array.from(other)).not.toEqual(Array.from(c.rockFaces[0]));
  }, 120_000);

  it('the rock stays within its triangle budget', () => {
    const t = terrain.userData.shellTris;
    expect(t).toBeTruthy();
    for (const n of ALL) {
      expect(t[n], n).toBeGreaterThan(0);
      expect(t[n], n).toBeLessThanOrEqual(tris(meshes[n]));
    }
    // the whole rock, its dressing included
    expect(tris(meshes.rockFaces) + tris(meshes.ledgeTops) + tris(meshes.lips)).toBeLessThanOrEqual(21500); // finer wall grid for polish-gorgerock2; area cap unchanged
  });

  // ROCK_PROUD (Global Constraints): no drawn rock vertex over walkable
  // ground stands more than ROCK_PROUD (2D) from a wall-forming rock column;
  // inside a cave or den, under its ceiling, CAVE_PROUD. A vertex is over
  // walkable ground when it is not in rock and the highest column under it
  // (not above it: a ceiling cap's column runs from its ceiling up, so a
  // vertex under the ceiling stands on the cave or den floor) is a walk, cave
  // or den floor (or the base), it is above that and below any ceiling there.
  // A crest vertex lifted over every column near it is measured against
  // those columns just under their tops. Rock columns are open rectangles
  // here, so a vertex on a wall's own line (a wall foot, a cave wall the
  // relief left in place) is tested too, and is within r of that wall.
  // Every vertex, the dressing (lip stones, foot boulders) included.
  it('no drawn rock stands proud over walkable ground', () => {
    const shell = Object.fromEntries(ALL.map((n) => [n, meshes[n].geometry.attributes.position.array]));
    const rockCols = [...MASSES, ...WALKS.filter((w) => w.kind === 'lip')];
    const walkCols = WALKS.filter((w) => w.kind !== 'lip');
    const allCols = [...rockCols, ...walkCols, ...CAPS];
    let tested = 0;
    let caveTested = 0;
    const bad = [];
    for (const [name, arr] of Object.entries(shell)) {
      eachVertex(arr, (x, y, z) => {
        let top = 0;
        let rock = false;
        const consider = (t, isRock) => {
          if (t > top + 1e-6) { top = t; rock = isRock; } else if (t >= top - 1e-6) rock = rock || isRock;
        };
        // strictly inside rock: not drawn over anything
        const inOpen = (s) => x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ;
        if (rockCols.some((s) => inOpen(s) && y < shapeY(s, x, z) - 1e-6)) return;
        if (CAPS.some((c) => inOpen(c) && y > c.y0 + 1e-6 && y < c.top - 1e-6)) return;
        for (const s of rockCols) if (inOpen(s)) consider(shapeY(s, x, z), true);
        for (const c of CAPS) if (inOpen(c) && y >= c.y0 - 1e-6) consider(c.top, true);
        for (const s of walkCols) if (inRectE(s, x, z)) consider(shapeY(s, x, z), false);
        if (rock || !(y > top + 1e-6)) return;
        let cave = false;
        for (const c of CEILINGS) {
          if (!inRectE(c, x, z) || c.y0 <= top) continue;
          if (!(y < c.y0 - 1e-6)) return;
          cave = true;
        }
        tested++;
        if (cave) caveTested++;
        const r = (cave ? CAVE_PROUD : ROCK_PROUD) + 1e-4;
        if (relief.wallNear(x, y, z, r)) return;
        // over every column within r: measured just under the highest of them
        let hNear = -Infinity;
        for (const s of allCols) {
          const px = Math.min(Math.max(x, s.minX), s.maxX);
          const pz = Math.min(Math.max(z, s.minZ), s.maxZ);
          if (Math.sqrt((x - px) ** 2 + (z - pz) ** 2) > r) continue;
          hNear = Math.max(hNear, s.top ?? shapeY(s, px, pz));
        }
        if (y >= hNear && relief.wallNear(x, hNear - 1e-3, z, r)) return;
        bad.push(`${name} (${x}, ${y}, ${z})${cave ? ' in a cave' : ''}`);
      });
    }
    expect(tested).toBeGreaterThan(1000);
    expect(caveTested).toBeGreaterThan(0);
    expect(bad.slice(0, 12)).toEqual([]);
  }, 120_000);

  // Walk tops, cave and den floors, and every wall foot on them: drawn at
  // the ground's height in the unmoved shell, and still there once moved.
  it("walk-top vertices don't move", () => {
    const flat = shellOf(build({ relief: false }));
    const moved = new Set();
    for (const arr of Object.values(shellOf(terrain))) eachVertex(arr, (x, y, z) => moved.add(keyOf(x, y, z)));
    const tops = WALKS.filter((w) => w.kind === 'walk' || w.kind === 'cave' || w.kind === 'den');
    let n = 0;
    const lost = [];
    for (const [name, arr] of Object.entries(flat)) {
      eachVertex(arr, (x, y, z) => {
        if (!tops.some((s) => inRectE(s, x, z) && Math.abs(y - shapeY(s, x, z)) <= 1e-6)) return;
        n++;
        if (!moved.has(keyOf(x, y, z))) lost.push(`${name} (${x}, ${y}, ${z})`);
      });
    }
    expect(n).toBeGreaterThan(1000);
    expect(lost.slice(0, 12)).toEqual([]);
  }, 120_000);

  // The base floor (y 0), the commonest seam: every wall foot on it stays
  // exactly where it is (same build, same order: vertex i is vertex i).
  it("floor-foot vertices (y 0) don't move", () => {
    const flat = shellOf(build({ relief: false }));
    const moved = shellOf(terrain);
    let n = 0;
    const lost = [];
    for (const name of ALL) {
      const f = flat[name];
      const m = moved[name];
      eachVertex(f, (x, y, z, i) => {
        if (y !== 0) return;
        n++;
        if (m[3 * i] !== x || m[3 * i + 1] !== y || m[3 * i + 2] !== z) lost.push(`${name} (${x}, ${y}, ${z}) -> (${m[3 * i]}, ${m[3 * i + 1]}, ${m[3 * i + 2]})`);
      });
    }
    expect(n).toBeGreaterThan(500);
    expect(lost.slice(0, 12)).toEqual([]);
  }, 120_000);

  it('roofs never come down', () => {
    const shell = shellOf(terrain);
    let n = 0;
    const low = [];
    for (const c of CEILINGS) {
      const r = { minX: c.minX + 0.2, maxX: c.maxX - 0.2, minZ: c.minZ + 0.2, maxZ: c.maxZ - 0.2 };
      for (const [name, arr] of Object.entries(shell)) {
        eachVertex(arr, (x, y, z) => {
          if (!inRectE(r, x, z, 0) || Math.abs(y - c.y0) > 0.3) return;
          n++;
          if (y < c.y0 - 1e-6) low.push(`${name} (${x}, ${y}, ${z}) under ${c.y0}`);
        });
      }
    }
    expect(n).toBeGreaterThan(0);
    expect(low.slice(0, 12)).toEqual([]);
  }, 120_000);

  // Wall vertices: those of a triangle whose face normal is mostly horizontal
  // in the unmoved build. Same build, same order, so vertex i is vertex i.
  it('the rock has relief', () => {
    const flat = shellOf(build({ relief: false })).rockFaces;
    const moved = shellOf(terrain).rockFaces;
    expect(moved.length).toBe(flat.length);
    const seen = new Set();
    let walls = 0;
    let movedWalls = 0;
    let highest = -Infinity;
    let rimLow = Infinity; // the lowest moved vertex of the 20 m rim tops
    for (let t = 0; t < flat.length; t += 9) {
      const p = (k) => new THREE.Vector3(flat[t + 3 * k], flat[t + 3 * k + 1], flat[t + 3 * k + 2]);
      const n = p(1).sub(p(0)).cross(p(2).sub(p(0))).normalize();
      for (let k = 0; k < 3; k++) {
        highest = Math.max(highest, moved[t + 3 * k + 1]);
        if (flat[t + 3 * k + 1] === 20) rimLow = Math.min(rimLow, moved[t + 3 * k + 1]);
      }
      if (Math.abs(n.y) >= 0.5) continue;
      for (let k = 0; k < 3; k++) {
        const i = t + 3 * k;
        const key = keyOf(flat[i], flat[i + 1], flat[i + 2]);
        if (seen.has(key)) continue;
        seen.add(key);
        walls++;
        const d = Math.sqrt((moved[i] - flat[i]) ** 2 + (moved[i + 1] - flat[i + 1]) ** 2 + (moved[i + 2] - flat[i + 2]) ** 2);
        if (d > 0.05) movedWalls++;
      }
    }
    expect(walls).toBeGreaterThan(1000);
    expect(movedWalls / walls).toBeGreaterThanOrEqual(0.5);
    // The rims are rounded now (polish-gorgerock2 task 4), not jagged: their
    // edges come down (this asked for a crest lifted 0.5 m over 20 before).
    expect(rimLow).toBeLessThanOrEqual(19.5);
    expect(highest).toBeLessThanOrEqual(20 + CREST_JAG);
  }, 120_000);

  // The rays start ROCK_PROUD + 0.05 in from the edge: a wall may stand
  // ROCK_PROUD proud of the line the cat stops at, and is never further back
  // than its relief (near the foot, where these rays run, it is barely moved).
  it('every rim is drawn where the cat stops', () => {
    const OUT = 0.05;
    const IN = ROCK_PROUD + 0.05;
    const cands = [];
    for (const s of WALKS.filter((w) => w.kind !== 'lip')) {
      const edges = [
        { nx: -1, nz: 0, x: s.minX, z0: s.minZ, z1: s.maxZ },
        { nx: 1, nz: 0, x: s.maxX, z0: s.minZ, z1: s.maxZ },
        { nx: 0, nz: -1, z: s.minZ, x0: s.minX, x1: s.maxX },
        { nx: 0, nz: 1, z: s.maxZ, x0: s.minX, x1: s.maxX },
      ];
      for (const e of edges) {
        const len = e.nx ? e.z1 - e.z0 : e.x1 - e.x0;
        for (let d = 0.2; d <= len - 0.2; d += 0.23) {
          const ex = e.nx ? e.x : e.x0 + d;
          const ez = e.nx ? e.z0 + d : e.z;
          const ix = ex - e.nx * IN;
          const iz = ez - e.nz * IN;
          if (!reached(ex - e.nx * 0.1, ez - e.nz * 0.1) && !reached(ex - e.nx * 0.25, ez - e.nz * 0.25)) continue;
          const gy = ground.y(ix, iz);
          if (ground.y(ex + e.nx * OUT, ez + e.nz * OUT) - gy < 0.3) continue;
          cands.push({ ix, iz, y: gy + 0.15, nx: e.nx, nz: e.nz });
        }
      }
    }
    const points = pick(cands, 400);
    expect(points.length).toBe(400);
    for (const p of points) {
      const dir = new THREE.Vector3(p.nx, 0, p.nz);
      const hits = cast(new THREE.Vector3(p.ix, p.y, p.iz), dir, ['rockFaces', 'lips'], IN + 0.15);
      expect(hits.length, `(${p.ix}, ${p.iz}) toward (${p.nx}, ${p.nz})`).toBeGreaterThan(0);
      // and the face is turned toward the cat (its front side faces her)
      const n = hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld);
      expect(n.dot(dir), `(${p.ix}, ${p.iz}) winding`).toBeLessThan(0);
    }
  }, 120_000);

  it('no rock hangs over walkable ground', () => {
    // A grid point can sit exactly on a wall's line (the ground counts it as
    // the lower side), where a vertical ray runs in the wall's own plane and
    // grazes the top's edge. So each point is tested by four rays 2 mm round
    // it, each one that stands on the same ground as the point. 2 mm also
    // clears the 1 mm inset of the ground's ceilings (CEIL_INSET): there
    // ground.ceil is the full-size cap the rock draws (Infinity where nothing
    // is overhead).
    //
    // A wall may stand up to ROCK_PROUD proud of its line, and a cap's mouth
    // face proud of its rectangle, so a point that close to either is left to
    // the vertex test below ('no drawn rock stands proud over walkable ground').
    const D = 0.002;
    const NEAR = ROCK_PROUD + 0.01;
    const nearCapEdge = (x, z, gy) => CEILINGS.some((c) => c.y0 > gy
      && x >= c.minX - NEAR && x <= c.maxX + NEAR && z >= c.minZ - NEAR && z <= c.maxZ + NEAR
      && !(x > c.minX + NEAR && x < c.maxX - NEAR && z > c.minZ + NEAR && z < c.maxZ - NEAR));
    let n = 0;
    let open = 0;
    let skipped = 0;
    forEachReached((x, z) => {
      if (!Number.isInteger(x) || !Number.isInteger(z)) return;
      n++;
      const gy = ground.y(x, z);
      if (relief.wallNear(x, gy + 0.05, z, NEAR) || nearCapEdge(x, z, gy)) {
        skipped++;
        return;
      }
      let tested = 0;
      for (const [dx, dz] of [[D, D], [D, -D], [-D, D], [-D, -D]]) {
        const px = x + dx;
        const pz = z + dz;
        const py = ground.y(px, pz);
        if (Math.abs(py - gy) > 0.01) continue;
        tested++;
        const c = ground.ceil(px, pz);
        const hits = cast(new THREE.Vector3(px, py + 0.05, pz), new THREE.Vector3(0, 1, 0), ALL);
        if (c === Infinity) {
          open++;
          expect(hits.length, `(${px}, ${pz}) open sky`).toBe(0);
        } else if (hits.length) {
          expect(hits[0].point.y, `(${px}, ${pz})`).toBeGreaterThanOrEqual(c - 1e-6);
        }
      }
      expect(tested, `(${x}, ${z})`).toBeGreaterThan(0);
    });
    expect(n).toBeGreaterThan(2000);
    expect(skipped).toBeLessThan(n / 4);
    expect(open).toBeLessThan(4 * n);
  }, 180_000);

  it('the walkable tops are drawn at the ground\'s height', () => {
    const raised = WALK_SHAPES.filter((s) => s.kind === 'walk');
    const cands = [];
    forEachReached((x, z) => {
      const gy = ground.y(x, z);
      if (gy < 0.05 || ground.ceil(x, z) !== Infinity) return;
      // well inside a raised shape: a ray down a wall's own line grazes its top
      const M = ROCK_PROUD + 0.05;
      if (raised.some((s) => x > s.minX + M && x < s.maxX - M && z > s.minZ + M && z < s.maxZ - M)) cands.push([x, z, gy]);
    });
    const points = pick(cands, 200);
    expect(points.length).toBe(200);
    for (const [x, z, gy] of points) {
      const hits = cast(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0), ALL);
      expect(hits.length, `(${x}, ${z})`).toBeGreaterThan(0);
      expect(['ledgeTops', 'lips'], `(${x}, ${z})`).toContain(hits[0].object.name);
      expect(Math.abs(hits[0].point.y - gy), `(${x}, ${z})`).toBeLessThanOrEqual(0.02);
    }
  }, 120_000);

  it('only exposed rock is drawn, within its triangle cap', () => {
    const rock = meshes.rockFaces;
    expect(tris(rock)).toBeLessThanOrEqual(15500); // finer wall grid for polish-gorgerock2; area cap unchanged
    const pos = rock.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      for (const axis of ['getX', 'getZ']) {
        const v = [pos[axis](i), pos[axis](i + 1), pos[axis](i + 2)];
        const onEdge = v.every((c) => Math.abs(Math.abs(c) - 62) < 1e-9);
        expect(onEdge, `triangle ${i / 3} on the ${axis === 'getX' ? 'x' : 'z'} = ±62 edge`).toBe(false);
      }
    }
    // Seams between two masses of equal height: nothing is drawn there.
    const seams = [];
    for (let i = 0; i < MASSES.length; i++) {
      for (let j = i + 1; j < MASSES.length; j++) {
        const a = MASSES[i];
        const c = MASSES[j];
        if (a.y0 !== c.y0) continue;
        for (const [ax, cx, dir] of [[a.maxX, c.minX, 'x'], [c.maxX, a.minX, 'x'], [a.maxZ, c.minZ, 'z'], [c.maxZ, a.minZ, 'z']]) {
          if (ax !== cx) continue;
          const lo = dir === 'x' ? Math.max(a.minZ, c.minZ) : Math.max(a.minX, c.minX);
          const hi = dir === 'x' ? Math.min(a.maxZ, c.maxZ) : Math.min(a.maxX, c.maxX);
          if (hi - lo > 2.5) seams.push({ dir, at: ax, lo, hi, h: a.y0 });
        }
      }
    }
    expect(seams.length).toBeGreaterThan(5);
    const points = [];
    for (let k = 0; points.length < 200; k++) {
      const s = seams[k % seams.length];
      const f = ((k * 0.618034) % 1);
      // 1 m in from each end: a wall that meets the seam's line there may
      // stand ROCK_PROUD proud of it, or its crest be lifted over it.
      const t = s.lo + 1.0 + f * (s.hi - s.lo - 2.0);
      const y = 0.1 + (((k * 0.414214) % 1) * (s.h - 0.2));
      points.push({ ...s, t, y });
    }
    for (const p of points) {
      const o = p.dir === 'x' ? new THREE.Vector3(p.at - 0.05, p.y, p.t) : new THREE.Vector3(p.t, p.y, p.at - 0.05);
      const d = p.dir === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      expect(cast(o, d, ['rockFaces'], 0.1).length, `${p.dir} ${p.at} at ${p.t}, y ${p.y}`).toBe(0);
    }
  }, 120_000);

  it('a lip closes the gap between legs', () => {
    // from leg A (x 2.4..5.4) east toward leg B, and from leg B (5.8..8.8) toward leg C
    for (const [edge, label] of [[5.4, 'A to B'], [8.8, 'B to C']]) {
      const x = edge - 0.1;
      const z = 10;
      const hits = cast(new THREE.Vector3(x, ground.y(x, z) + 0.2, z), new THREE.Vector3(1, 0, 0), ['lips', 'rockFaces'], 0.1 + 0.15);
      expect(hits.length, label).toBeGreaterThan(0);
      expect(hits[0].point.x, label).toBeGreaterThanOrEqual(edge - ROCK_PROUD);
    }
  });

  it('rock is darker and cooler at the bottom', () => {
    const geo = meshes.rockFaces.geometry;
    expect(meshes.rockFaces.material.vertexColors).toBe(true);
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    const mean = (pred) => {
      const s = [0, 0, 0];
      let n = 0;
      for (let i = 0; i < pos.count; i++) {
        if (!pred(pos.getY(i))) continue;
        s[0] += col.getX(i); s[1] += col.getY(i); s[2] += col.getZ(i); n++;
      }
      expect(n).toBeGreaterThan(0);
      return s.map((v) => v / n);
    };
    const lum = ([r, g, bl]) => 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    const low = mean((y) => y < 2);
    const high = mean((y) => y > 10);
    expect(lum(low)).toBeLessThan(lum(high));
    expect(low[2] / low[0]).toBeGreaterThan(high[2] / high[0]);
  });

  // CliffClan's coats are shaded at HSL saturation 0.45 or more
  // (test/clancast.test.js), so no drawn rock colour, tints and strata
  // included, comes near them.
  it('no drawn rock colour is saturated enough to hide a CliffClan coat', () => {
    const sat = (r, g, bl) => {
      const max = Math.max(r, g, bl);
      const min = Math.min(r, g, bl);
      const l = (max + min) / 2;
      return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    };
    let worst = 0;
    for (const n of ['rockFaces', 'lips']) {
      const col = meshes[n].geometry.attributes.color;
      expect(col, n).toBeTruthy();
      for (let i = 0; i < col.count; i++) worst = Math.max(worst, sat(col.getX(i), col.getY(i), col.getZ(i)));
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(0.42);
  });

  // ---- The dressing: appended to the merged meshes after their shells ----
  const LIPS = WALKS.filter((w) => w.kind === 'lip');
  // The part of a mesh after its shell.
  const dressingOf = (name) => meshes[name].geometry.attributes.position.array.subarray(terrain.userData.shellTris[name] * 9);
  // The foot boulders: 20 triangles each, in order after the rockFaces shell;
  // each one's centre is the mean of its 12 distinct vertices.
  const boulders = () => {
    const arr = dressingOf('rockFaces');
    const out = [];
    for (let s = 0; s < arr.length; s += 20 * 9) {
      const uniq = new Map();
      eachVertex(arr.subarray(s, s + 20 * 9), (x, y, z) => uniq.set(keyOf(x, y, z), [x, y, z]));
      const vs = [...uniq.values()];
      const c = [0, 1, 2].map((k) => vs.reduce((a, v) => a + v[k], 0) / vs.length);
      out.push({ vs, c });
    }
    return out;
  };

  it('the dressing is counted, and appended after the shells', () => {
    const d = terrain.userData.dressing;
    expect(d).toBeTruthy();
    const t = terrain.userData.shellTris;
    expect(tris(meshes.lips) - t.lips).toBe(12 * d.lipStones);
    expect(tris(meshes.rockFaces) - t.rockFaces).toBe(20 * d.footBoulders);
    expect(tris(meshes.ledgeTops)).toBe(t.ledgeTops);
    expect(d.lipStones).toBeGreaterThanOrEqual(200);
    expect(d.lipStones).toBeLessThanOrEqual(360);
    expect(d.footBoulders).toBeGreaterThanOrEqual(40);
    expect(d.footBoulders).toBeLessThanOrEqual(90);
    // dressing: false draws the shell alone
    const bare = build({ dressing: false });
    let n = 0;
    bare.traverse((o) => { if (o.isMesh) { n++; expect(tris(o), o.name).toBe(t[o.name]); } });
    expect(n).toBe(3);
    expect(bare.userData.dressing).toEqual({ lipStones: 0, footBoulders: 0 });
  }, 120_000);

  it('lip stones sit on their lips', () => {
    const arr = dressingOf('lips');
    expect(arr.length).toBeGreaterThan(0);
    const bad = [];
    eachVertex(arr, (x, y, z) => {
      const ok = LIPS.some((l) => {
        if (!inRectE(l, x, z, 0.1)) return false;
        const top = shapeY(l, Math.min(Math.max(x, l.minX), l.maxX), Math.min(Math.max(z, l.minZ), l.maxZ));
        return y >= top - 0.2 && y <= top + 0.13;
      });
      if (!ok) bad.push(`(${x}, ${y}, ${z})`);
    });
    expect(bad.slice(0, 12)).toEqual([]);
  });

  it('cave and den mouths stay open: no foot boulder within 1 m of one', () => {
    const mouths = [...gorgeShape.GORGE_CAVES.map((c) => c.mouth), ...gorgeShape.GORGE_DENS.map((d) => d.mouth), gorgeShape.CAMP_DEN.mouth];
    expect(GORGE_ROCK_MOUTHS.map(({ x, z }) => ({ x, z }))).toEqual(mouths.map(({ x, z }) => ({ x, z })));
    const bs = boulders();
    expect(bs.length).toBe(terrain.userData.dressing.footBoulders);
    for (const { vs, c } of bs) {
      expect(vs).toHaveLength(12);
      for (const m of mouths) expect(Math.sqrt((c[0] - m.x) ** 2 + (c[2] - m.z) ** 2), `${c} by ${m.x}, ${m.z}`).toBeGreaterThanOrEqual(1.0);
    }
  });

  // A foot boulder shows only at the foot of a wall that rises a metre over
  // the ground in front of it: every vertex is in rock, or within 0.12 m of
  // rock that still stands a metre over that vertex's ground, and never in a
  // cave or den (so none pokes through a lip onto the walk behind it, into a
  // void, or out of thin rock's far side).
  it('every foot boulder shows only at the foot of a tall wall', () => {
    const walkTops = WALKS.filter((w) => w.kind !== 'lip');
    const bad = [];
    let exposed = 0;
    for (const { vs } of boulders()) {
      for (const [x, y, z] of vs) {
        if (relief.rockAt(x, y, z)) continue;
        exposed++;
        let g = 0;
        for (const s of walkTops) {
          if (!inRectE(s, x, z)) continue;
          const t = shapeY(s, x, z);
          if (t <= y + 1e-6 && t > g) g = t;
        }
        const inVoid = CEILINGS.some((c) => inRectE(c, x, z) && y < c.y0);
        const near = relief.wallNear(x, y, z, 0.12 + 1e-6) && relief.wallNear(x, g + 1.0 - 1e-3, z, 0.12 + 1e-6);
        if (inVoid || !near) bad.push(`(${x}, ${y}, ${z}) ground ${g}${inVoid ? ' in a void' : ''}`);
      }
    }
    expect(exposed).toBeGreaterThan(40);
    expect(bad.slice(0, 12)).toEqual([]);
  }, 120_000);

  it('scree is low, noCast and merged', () => {
    const spots = [{ x: 0, z: 0 }, { x: 3, z: -2 }, { x: -5, z: 6 }];
    const g = b.scree(spots, 4);
    const found = [];
    g.traverse((o) => { if (o.isMesh) found.push(o); });
    expect(found).toHaveLength(1);
    const m = found[0];
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
    const box = new THREE.Box3().setFromObject(g);
    expect(box.max.y).toBeLessThanOrEqual(0.25);
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
    // 3 to 6 stones a spot: an icosahedron (detail 0) is 20 triangles
    const stones = tris(m) / 20;
    expect(stones).toBeGreaterThanOrEqual(3 * spots.length);
    expect(stones).toBeLessThanOrEqual(6 * spots.length);
    const pos = (x) => Array.from(x.children[0].geometry.attributes.position.array);
    expect(pos(b.scree(spots, 4))).toEqual(pos(g));
    expect(() => b.scree([], 4)).not.toThrow();
  });
});

// polish-places Task 4: the Seaside's backing dunes get an edge of their own.
describe('the dune edge', () => {
  it('the dune edge: marram tufts and fence posts, dry, under 1.6 near the edge', async () => {
    const { SEA_VIEW } = await import('../src/world/seaside.js');
    const spots = b.edgeSpots({ half: 70, style: 'dune' }, 59, [SEA_VIEW]);
    expect(spots.length).toBeGreaterThan(60);
    for (const s of spots) expect(b.waterClearance([SEA_VIEW], s.x, s.z)).toBeGreaterThanOrEqual(1.5);
    const kinds = new Set(spots.map((s) => s.kind));
    expect(kinds.has('piece')).toBe(true);
    expect(kinds.has('post')).toBe(true);
    expect(kinds.has('tree')).toBe(false);
    // Deterministic: the same spots twice.
    expect(b.edgeSpots({ half: 70, style: 'dune' }, 59, [SEA_VIEW])).toEqual(spots);

    // Built without props, every piece is low: tufts and posts only.
    const band = b.horizonBand({
      kind: 'dunes', inner: 66, outer: 126, height: 7, wavelength: 26, salt: 59,
      avoid: [SEA_VIEW], closeWater: false, edge: { half: 70, style: 'dune' },
    });
    const edge = band.children.find((c) => c.name === 'horizonEdge');
    expect(edge.userData.noCast).toBe(true);
    const pos = edge.geometry.attributes.position;
    expect(pos.count).toBeGreaterThan(0);
    for (let v = 0; v < pos.count; v++) {
      expect(pos.getY(v)).toBeLessThanOrEqual(1.6);
      expect(b.waterClearance([SEA_VIEW], pos.getX(v), pos.getZ(v))).toBeGreaterThanOrEqual(1.0);
    }
  });

  it('props: huts and a chair stand where the edge puts them, taller than the ring, and wet ones are dropped', async () => {
    const { SEA_VIEW } = await import('../src/world/seaside.js');
    const props = [
      { x: 10, z: 74, yaw: Math.PI, kind: 'hut' },
      { x: 20, z: 73, yaw: Math.PI, kind: 'chair' },
      { x: 40, z: 74, yaw: Math.PI, kind: 'hut' }, // in the sea
    ];
    const spots = b.edgeSpots({ half: 70, style: 'dune', props }, 59, [SEA_VIEW]);
    expect(spots.filter((s) => s.kind === 'hut')).toHaveLength(1);
    expect(spots.filter((s) => s.kind === 'chair')).toHaveLength(1);
    const band = b.horizonBand({
      kind: 'dunes', inner: 66, outer: 126, height: 7, wavelength: 26, salt: 59,
      avoid: [SEA_VIEW], closeWater: false, edge: { half: 70, style: 'dune', props },
    });
    const pos = band.children[0].geometry.attributes.position;
    const topNear = (px, pz, r) => {
      let top = -Infinity;
      for (let v = 0; v < pos.count; v++) {
        if (Math.hypot(pos.getX(v) - px, pos.getZ(v) - pz) < r) top = Math.max(top, pos.getY(v));
      }
      return top;
    };
    expect(topNear(10, 74, 1.8)).toBeGreaterThan(2.3);
    expect(topNear(10, 74, 1.8)).toBeLessThan(2.8);
    expect(topNear(20, 73, 1.2)).toBeGreaterThan(2.2);
    expect(topNear(20, 73, 1.2)).toBeLessThan(2.7);
  });

  it('no other style grows posts, props or a different ring', () => {
    for (const style of ['hedge', 'scrub', 'reeds', 'wall', 'pinescrub']) {
      const spots = b.edgeSpots({ half: 60, style }, 7, []);
      expect(spots.some((s) => s.kind === 'post' || s.kind === 'hut' || s.kind === 'chair'), style).toBe(false);
    }
  });
});
