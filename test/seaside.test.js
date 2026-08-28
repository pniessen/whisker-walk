import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Same headless stub every world test uses: the only DOM the builders touch is
// document.createElement('canvas') for the billboard texture and for
// render/textures.js's surface tiles. See test/water.test.js for the long
// version of why getImageData and createGradient need real answers.
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

const { build } = await import('../src/world/seaside.js');
const { surfaceProps, tileMetres } = await import('../src/render/materials.js');
const { setTextureTier, getTextureTier } = await import('../src/render/textures.js');

// ---------------------------------------------------------------------------
// v20 — the surface/water/wind pass on the beach.
//
// The Old Docks was the pilot (test/docks.test.js carries the equivalent
// block). What is different HERE, and what most of this file is about, is the
// sea: it is the only body in the game whose footprint extends far outside the
// walkable bounds, so it is the only one where "which edges are shores" is a
// question with a wrong answer. Three of its four edges are open horizon, and
// createWater will happily paint surf along all of them.
//
// The content invariants — nothing reachable in the water, the pier is the
// crossing, `fish-1` / `pier-end` / the third box stay where v19 put them —
// are pinned by test/water.test.js, test/spots.test.js and
// test/climbing.test.js against the real shipped arrays, and are deliberately
// not restated here.
// ---------------------------------------------------------------------------

const groundOf = (scene) => scene.children.find(
  (o) => o.isMesh && o.geometry?.type === 'PlaneGeometry' && o.geometry.parameters.width === 140,
);
// The two pieces of decking this file builds itself. Both are 'wood' planes;
// they are told apart by their size, which is the same thing the eye does.
const planeOf = (scene, w, h) => scene.children.find(
  (o) => o.isMesh && o.geometry?.type === 'PlaneGeometry'
    && o.geometry.parameters.width === w && o.geometry.parameters.height === h,
);

describe('Seaside — surfaces', () => {
  it('lays the beach in sand, at a repeat derived from the plane’s real size', () => {
    const scene = new THREE.Scene();
    build(scene);
    const g = groundOf(scene);
    expect(g).toBeTruthy();
    expect(g.material.roughness).toBe(surfaceProps('sand').roughness);
    expect(g.material.metalness).toBe(0);
    expect(g.material.map?.name).toBe('surface:sand');
    // 140m of beach at the sand tile's 0.8m. A hand-picked repeat is exactly
    // what this number exists to forbid.
    const tiles = 140 / tileMetres('sand');
    expect([g.material.map.repeat.x, g.material.map.repeat.y]).toEqual([tiles, tiles]);
  });

  it('does NOT colour-compensate the sand — the beach keeps its authored hex', () => {
    // builder.ground() lifts grass (mean 0.955) and nothing else. Sand's tile
    // mean is 0.998 BY DESIGN: its read is per-texel variance only, because a
    // beach that darkens when you texture it just looks wet. If someone ever
    // "fixes" that by lifting this colour, the beach goes pale and this says so.
    const scene = new THREE.Scene();
    build(scene);
    expect(groundOf(scene).material.color.getHex()).toBe(0xe0d0a0);
  });

  it('planks the boardwalk and the pier in the same timber at the same scale', () => {
    const scene = new THREE.Scene();
    build(scene);
    const plank = tileMetres('wood');
    // boardwalk: 4 x 90 => 4 tiles across, i.e. sixteen 0.25m boards.
    const walk = planeOf(scene, 4, 90);
    expect(walk.material.map?.name).toBe('surface:plank');
    expect(walk.material.roughness).toBe(surfaceProps('wood').roughness);
    expect([walk.material.map.repeat.x, walk.material.map.repeat.y]).toEqual([4 / plank, 90 / plank]);
    // pier: the plane is built 3 x 24 and then rotated so its WIDTH lies along
    // world z, so the repeat is taken from those same two numbers.
    const pier = planeOf(scene, 3, 24);
    expect(pier.material.map?.name).toBe('surface:plank');
    expect([pier.material.map.repeat.x, pier.material.map.repeat.y]).toEqual([3 / plank, 24 / plank]);
  });

  it('uses bareMetal nowhere — every material in the area stays metalness 0', () => {
    // Recorded in builder.fireEscape and re-checked per area: metalness 0.85
    // against this dim baked probe throws away the diffuse term and flattens a
    // prop to near-black. The boat hulls are the local candidate and they take
    // paintedMetal instead.
    const scene = new THREE.Scene();
    build(scene);
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) {
        expect(m.metalness ?? 0, `${o.name || o.type} is not metalness 0`).toBe(0);
      }
    });
  });

  it('builds no tiles at all on the low tier, keeping the light response', () => {
    const before = getTextureTier();
    try {
      setTextureTier('low');
      const scene = new THREE.Scene();
      build(scene);
      const g = groundOf(scene);
      expect(g.material.map).toBeNull();                                  // zero bytes on a phone
      expect(g.material.roughness).toBe(surfaceProps('sand').roughness);  // two floats are free
    } finally {
      setTextureTier(before);
    }
  });
});

describe('Seaside — the sea is a water surface', () => {
  it('hands back one water handle for the one declared footprint', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    expect(area.waterFx).toHaveLength(1);
    expect(area.waterFx.length).toBe(area.waters.length);
    expect(area.waterFx[0].mesh.name).toBe('water:sea');
    expect(area.waterFx[0].mesh.position.y).toBe(0.05); // the plane's shipped height
  });

  it('adds the mesh straight to the scene, never inside a Group', () => {
    // test/water.test.js's "draws that footprint from the declaration" case
    // filters scene.children; a nested water mesh is invisible to it and that
    // case fails with "no mesh matches the declared footprint".
    const scene = new THREE.Scene();
    const area = build(scene);
    expect(scene.children).toContain(area.waterFx[0].mesh);
  });

  // -------------------------------------------------------------------------
  // THE OPEN HORIZON. This is the case the seaside exists to have.
  //
  // The baked ramp is a texel grid over the footprint's own box: column i runs
  // west to east (minX -> maxX) and row j runs north to south (maxZ -> minZ).
  // So column 0 is the beach and column nx-1 is 40m past anywhere the cat can
  // stand. With `shores: ['minX']` only the beach may carry a shallow ramp and
  // a foam band; without it the sea would wear a surf line along its far and
  // side edges, in plain view.
  // -------------------------------------------------------------------------
  const ramp = (handle) => {
    const [nx, nz] = handle.rampSize;
    const data = handle.textures.color.image.data;
    // Rec.709 luminance of one texel, so "paler" is one number rather than three.
    return (i, j) => {
      const o = (j * nx + i) * 4;
      return (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
    };
  };

  it('paints surf on the beach edge only, and open water on the other three', () => {
    const area = build(new THREE.Scene());
    const sea = area.waterFx[0];
    const [nx, nz] = sea.rampSize;
    const at = ramp(sea);
    const mid = [Math.floor(nx / 2), Math.floor(nz / 2)];
    const deep = at(mid[0], mid[1]);

    // The beach edge is a real shore: markedly paler than the deep water.
    expect(at(0, mid[1])).toBeGreaterThan(deep + 0.05);

    // The eastern horizon, and both z ends, are NOT shores — they must be the
    // same open water as the middle of the sea, to the texel.
    expect(at(nx - 1, mid[1])).toBe(deep);
    expect(at(mid[0], 0)).toBe(deep);
    expect(at(mid[0], nz - 1)).toBe(deep);
    // ...including the two seaward corners, where a mistaken shore would show
    // up doubled.
    expect(at(nx - 1, 0)).toBe(deep);
    expect(at(nx - 1, nz - 1)).toBe(deep);
  });

  it('ramps from the beach out to deep water, and not the other way about', () => {
    const sea = build(new THREE.Scene()).waterFx[0];
    const [nx, nz] = sea.rampSize;
    const at = ramp(sea);
    const j = Math.floor(nz / 2);
    // Monotone west to east across the shelf: no band, no ring, no second rim.
    for (let i = 1; i < 40; i++) {
      expect(at(i, j), `texel ${i} is not darker than ${i - 1}`).toBeLessThanOrEqual(at(i - 1, j));
    }
    // And flat from there to the horizon — the far half of the footprint is one
    // colour, which is what "you cannot see where the sea ends" means.
    expect(at(nx - 1, j)).toBe(at(Math.floor(nx / 2), j));
  });

  it('threads the quality tier through, so a phone gets the baked ramp only', () => {
    const sea = build(new THREE.Scene(), { water: { quality: 'low' } }).waterFx[0];
    expect(sea.tier).toBe('low');
    expect(sea.animated).toBe(false);
    expect(sea.textures.normal).toBeNull();
    expect(sea.textures.roughness).toBeNull();
    expect(sea.textures.color).toBeTruthy(); // the half that costs nothing per frame
  });

  it('threads reducedMotion through independently of the tier', () => {
    const sea = build(new THREE.Scene(), { water: { reducedMotion: true } }).waterFx[0];
    expect(sea.tier).toBe('high');  // still the full surface...
    expect(sea.animated).toBe(false); // ...but it does not move
  });

  it('still builds at the high tier when nothing is passed', () => {
    // Every world test calls build(new THREE.Scene()) bare.
    const sea = build(new THREE.Scene()).waterFx[0];
    expect(sea.tier).toBe('high');
    expect(sea.animated).toBe(true);
  });
});

describe('Seaside — wind', () => {
  const fakeWind = () => {
    const added = [];
    return { added, add: (obj, opts) => added.push({ obj, opts }) };
  };

  it('registers the six beach-grass tufts, and nothing else in the area', () => {
    // No tree and no fence anywhere on this beach (the perch note in
    // seaside.js says so — it is why Sure Claws' lift is inert here), so the
    // tufts are the whole of the area's foliage. The cliff, the boats and the
    // boardwalk do not bend in a breeze.
    const wind = fakeWind();
    build(new THREE.Scene(), { wind });
    expect(wind.added).toHaveLength(6);
    const at = wind.added.map(({ obj }) => [obj.position.x, obj.position.z]).sort();
    expect(at).toEqual([[-14, 30], [-2, -14], [-24, -20], [8, 2], [-30, 5], [12, 20]].sort());
  });

  it('hinges each tuft at ground contact, so nothing it stands on moves', () => {
    // wind.js rotates a registered object about its OWN origin. builder.bush
    // returns a Group at (x, 0, z) when wind is passed for exactly this
    // reason; a bush registered at its own belly would slide its base sideways.
    const wind = fakeWind();
    build(new THREE.Scene(), { wind });
    for (const { obj } of wind.added) expect(obj.position.y).toBe(0);
  });

  it('builds the same beach with no wind rig at all', () => {
    // walk.js always passes one, but every world test does not.
    const withWind = build(new THREE.Scene(), { wind: fakeWind() });
    const without = build(new THREE.Scene());
    expect(without.perches).toEqual(withWind.perches);
    expect(without.colliders).toEqual(withWind.colliders);
  });
});
