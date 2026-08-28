import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless stub every world test uses. The world builders touch the
// DOM in exactly two places — document.createElement('canvas') for the
// billboard poster, and render/textures.js's tile painters — and the second
// needs more than a blanket no-op Proxy:
//   * createLinear/RadialGradient — the painters add colour stops to whatever
//     comes back;
//   * getImageData — every tile ends with a getImageData/putImageData readback
//     (clampToFloor, the pass that guarantees no texel falls below the
//     luminance floor). clampToFloor guards the headless path by asking
//     whether getImageData is a function, which a blanket Proxy always answers
//     yes to. A zeroed buffer is the truthful answer: nothing was rasterised.
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

const { build } = await import('../src/world/neighborhood.js');
const { surfaceProps, tileMetres } = await import('../src/render/materials.js');
const { setTextureTier, getTextureTier } = await import('../src/render/textures.js');
const { createWind } = await import('../src/render/wind.js');

// Every mesh added straight to the scene root, by the width of its plane. The
// three surfaced ground-level strips are told apart by exactly that: the lawn
// is 120 across, a street is 5, a pavement is 1.2.
const planesOfWidth = (scene, w) => scene.children.filter(
  (o) => o.isMesh && o.geometry?.type === 'PlaneGeometry' && o.geometry.parameters.width === w,
);
const built = () => {
  const scene = new THREE.Scene();
  build(scene);
  return scene;
};

// ---------------------------------------------------------------------------
// v20 — the surface/wind pass, applied to the Cozy Neighborhood.
//
// These cases pin the two things a materials pass can get wrong while still
// looking like an art decision rather than a bug:
//
//   * TILE DENSITY. repeatFor() used to live in textures.js keyed on TEXTURE
//     names, so a preset name fell through to a plausible [1, 1] and rendered
//     a surface at several times its intended size, silently. Every repeat
//     below is therefore asserted as a NUMBER OF TILES against the surface's
//     own tile size — the one form of the assertion that bug could not pass.
//   * COLOUR COMPENSATION. A map multiplies the base colour, so grass (mean
//     0.955) and brick (0.948) land under the hex a human typed unless the
//     builder lifts them. The lawn is the largest single surface in the game
//     and it is the colour this area is named for.
// ---------------------------------------------------------------------------
describe('the Cozy Neighborhood — surfaces', () => {
  it('builds with no options at all, which is what every other world test does', () => {
    expect(() => build(new THREE.Scene())).not.toThrow();
    // `water` is accepted and deliberately unused (the area declares no
    // `waters`), so passing the full walk.js options object is also a no-op.
    expect(() => build(new THREE.Scene(), { water: { quality: 'high', reducedMotion: false } }))
      .not.toThrow();
  });

  it('lays the lawn in grass, compensated back onto its authored colour', () => {
    const g = planesOfWidth(built(), 120)[0];
    expect(g).toBeTruthy();
    expect(g.material.roughness).toBe(surfaceProps('grass').roughness);
    expect(g.material.metalness).toBe(0);
    expect(g.material.map?.name).toBe('surface:grass');
    // 0x7cb860 lifted by 1/0.955 — builder.ground does this itself so the hex
    // in neighborhood.js stays the one a human picked. If this ever equals
    // 0x7cb860 the compensation has been dropped and the lawn is 4.5% dark.
    expect(g.material.color).toEqual(new THREE.Color(0x82c165));
  });

  it('derives the lawn repeat from the plane’s real size', () => {
    const map = planesOfWidth(built(), 120)[0].material.map;
    expect([map.repeat.x, map.repeat.y]).toEqual([40, 40]); // 120m / grass's 3.0m tile
  });

  it('names its shared tiles so endWalk’s teardown leaves them alone', () => {
    // render/textures.js memoises tiles for the app's lifetime while endWalk
    // traverses the scene disposing every material's `.map`; walk.js tells the
    // two apart by this prefix. If it changes, the tiles start being freed and
    // re-uploaded once per walk, and this is the case that says so.
    expect(planesOfWidth(built(), 120)[0].material.map.name.startsWith('surface:')).toBe(true);
  });

  it('grits both streets rather than paving them', () => {
    const roads = planesOfWidth(built(), 5);
    expect(roads).toHaveLength(2);
    for (const r of roads) {
      expect(r.material.map?.name).toBe('surface:gravel'); // road aggregate
      expect(r.material.roughness).toBe(surfaceProps('gravel').roughness);
      // 5m x 100m over gravel's 1.4m tile. These numbers CHANGED when the
      // streets moved off 'sand' (0.8m tile, [6, 125]) — a deliberate
      // consequence of a coarser tile, not a fit to whatever came out:
      // 5/1.4 = 3.57 -> 4 across, 100/1.4 = 71.4 -> 71 along.
      expect([r.material.map.repeat.x, r.material.map.repeat.y]).toEqual([4, 71]);
      // Derived, not typed — the same assertion in the form that the old
      // repeatFor namespace bug could not have passed.
      expect(r.material.map.repeat.x).toBe(Math.round(5 / tileMetres('gravel')));
      expect(r.material.map.repeat.y).toBe(Math.round(100 / tileMetres('gravel')));
    }
  });

  it('paves all four sidewalks in DRY setts, four slabs kerb to kerb', () => {
    const walks = planesOfWidth(built(), 1.2);
    expect(walks).toHaveLength(4);
    for (const w of walks) {
      expect(w.material.map?.name).toBe('surface:cobble');
      // 'cobble' and 'wetStone' share one tile and differ ONLY in roughness.
      // 0.8 is a dry pavement; 0.42 would be the Docks' rained-on quay, which
      // is the wrong weather for an area whose sky is 0x9fd4e8.
      expect(w.material.roughness).toBe(surfaceProps('cobble').roughness);
      expect(w.material.roughness).not.toBe(surfaceProps('wetStone').roughness);
      // exactly one 1.2m tile across a 1.2m walk => four 30cm slabs
      expect([w.material.map.repeat.x, w.material.map.repeat.y]).toEqual([1, 83]);
    }
  });

  it('builds no tiles at all on the low tier, keeping the light response', () => {
    const before = getTextureTier();
    try {
      setTextureTier('low');
      const scene = built();
      for (const m of [...planesOfWidth(scene, 120), ...planesOfWidth(scene, 5), ...planesOfWidth(scene, 1.2)]) {
        expect(m.material.map).toBeNull();   // zero texture bytes on a phone
      }
      // two floats are free, so the surfaces still differ from each other
      expect(planesOfWidth(scene, 1.2)[0].material.roughness).toBe(surfaceProps('cobble').roughness);
    } finally {
      setTextureTier(before);
    }
  });

  it('builds three brick houses and five painted ones', () => {
    const scene = built();
    // A house is the only Group here whose first child is a 5 x 3 x 4 box.
    const bodies = scene.children
      .filter((o) => o.isGroup)
      .map((g) => g.children[0])
      .filter((c) => c?.isMesh && c.geometry?.type === 'BoxGeometry'
        && c.geometry.parameters.width === 5 && c.geometry.parameters.height === 3);
    expect(bodies).toHaveLength(8);
    const bricks = bodies.filter((c) => c.material.map?.name === 'surface:brick');
    const painted = bodies.filter((c) => c.material.map?.name === 'surface:siding');
    expect(bricks).toHaveLength(3);
    expect(painted).toHaveLength(5);
    // The three buff bodies, lifted by 1/0.948 — brick's mean. The five paint
    // colours are left exactly as authored, because siding's 0.988 is noise.
    expect(bricks.map((c) => c.material.color.getHex()).sort())
      .toEqual([0xf5e4ba, 0xf5ecc2, 0xffeccb].sort());
    expect(painted.map((c) => c.material.color.getHex()).sort())
      .toEqual([0xd8c8e8, 0xc8e0d0, 0xf0d8c8, 0xe0e8c8, 0xd8d0f0].sort());
  });
});

// ---------------------------------------------------------------------------
// Wind. The Docks pilot registered nothing (it has neither a tree nor a
// fence), so this is the first area that actually exercises the rig, and the
// count below is the one number that says the plumbing reached every loop.
// ---------------------------------------------------------------------------
describe('the Cozy Neighborhood — wind', () => {
  const counting = () => {
    const registered = [];
    return { registered, add: (obj, opts) => registered.push({ obj, opts }) };
  };

  it('registers every tree, bush and flower patch — and nothing else', () => {
    const wind = counting();
    build(new THREE.Scene(), { wind });
    // 12 trees (8 street + 4 scatter) + 10 bushes (4 + 6) + 12 flower patches
    // (8 beside the houses + 4 flowerbeds) = 34. The five fence runs are
    // deliberately still: four of them carry a perch at y 0.85.
    expect(wind.registered).toHaveLength(34);
  });

  it('registers nothing when it is handed no wind — a bare build is unchanged', () => {
    // Nothing to assert but the absence of a throw: this is the path every
    // other world test and every headless consumer takes.
    expect(() => build(new THREE.Scene())).not.toThrow();
  });

  it('sways by rotation only, so no collider or perch this area declared moves', () => {
    const wind = createWind();
    const scene = new THREE.Scene();
    const area = build(scene, { wind });
    const before = scene.children.map((o) => [o.position.x, o.position.z]);
    wind.update(4.2);
    expect(scene.children.map((o) => [o.position.x, o.position.z])).toEqual(before);
    // and something is actually moving, or the check above proves nothing
    expect(scene.children.some((o) => o.rotation.x !== 0 || o.rotation.z !== 0)).toBe(true);
    // the two records that read a tree's position: its collider and its fork
    expect(area.colliders.some((c) => c.x === -6 && c.z === -40)).toBe(true);
    expect(area.perches.some((p) => p.x === -6 && p.z === -40 && p.kind === 'tree')).toBe(true);
  });
});
