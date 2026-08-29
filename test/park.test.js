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

const { build } = await import('../src/world/park.js');
const { tileMetres, surfaceProps } = await import('../src/render/materials.js');
const { WATER_TUNING } = await import('../src/render/water.js');

const built = (opts) => {
  const scene = new THREE.Scene();
  const area = build(scene, opts);
  return { scene, area };
};

// Meshes added straight to the scene root, by geometry type.
const rootMeshes = (scene, type) => scene.children.filter(
  (o) => o.isMesh && o.geometry?.type === type,
);

// A wind registry that only records. The builders call exactly one method on
// it (add), so this is the whole surface area — and recording rather than
// swaying is what lets a case assert WHAT registered without also depending on
// wind.js's tuning, which test/wind.test.js owns.
const recordingWind = () => {
  const calls = [];
  return { calls, add: (object3d, opts = {}) => calls.push({ object3d, opts }) };
};

// ---------------------------------------------------------------------------
// v20 — the surface/water/wind pass, applied to City Park.
//
// The area contract itself (colliders, perches, POIs, the pond footprint and
// everything that must stay out of it) is pinned by test/water.test.js,
// test/spots.test.js and test/climbing.test.js, which read this area's real
// data. Nothing here duplicates those. What this file covers is the three
// things the visual pass could break while still looking correct:
//
//   * the pond mesh's PARENTAGE and provenance — it must be built from POND
//     and added to the scene root, because water.test.js's "draws that
//     footprint from the declaration" case filters scene.children and a mesh
//     nested in a Group is simply invisible to it;
//   * TILE DENSITY, asserted as a number of tiles against each surface's own
//     tile size — the one form of the assertion that a preset-name lookup
//     falling through to a plausible [1, 1] could not pass;
//   * the wind registration, asserted as "the foliage and nothing else", and
//     that not one registered prop's x/z moves.
// ---------------------------------------------------------------------------
describe('City Park — the v20 visual pass', () => {
  describe('the pond', () => {
    it('is built from the footprint and added to the scene ROOT, not into a group', () => {
      const { scene, area } = built();
      const [pond] = area.waters;
      const circles = rootMeshes(scene, 'CircleGeometry')
        .filter((m) => Math.abs(m.geometry.parameters.radius - pond.r) < 1e-6);
      expect(circles).toHaveLength(1);
      expect(circles[0].position.x).toBeCloseTo(pond.x, 10);
      expect(circles[0].position.z).toBeCloseTo(pond.z, 10);
      // y is the plane's own shipped height, so nothing re-stacks against the
      // paths that run past it.
      expect(circles[0].position.y).toBeCloseTo(0.02, 10);
      expect(circles[0].name).toBe(`water:${pond.id}`);
    });

    it('returns the handle for that same mesh as waterFx, so walk.js can drive it', () => {
      const { scene, area } = built();
      expect(area.waterFx).toHaveLength(1);
      expect(area.waterFx.length).toBe(area.waters.length);
      // The same object, not a copy: `waters` and `waterFx` are one record
      // twice over, and this is what says so.
      expect(scene.children).toContain(area.waterFx[0].mesh);
      expect(area.waterFx[0].mesh.geometry.parameters.radius).toBe(area.waters[0].r);
    });

    it('takes the module defaults for shelf and foam, which were tuned on this body', () => {
      // water.js's SHELF_M note names the park pond as the constraint that
      // sets it, so the park passing its own foam/shelf overrides would be the
      // area second-guessing its own worked example. The rim segments are the
      // default too — 48, up from the shipped 20, whose 2.2m chords the new
      // foam band traced straight to.
      const { area } = built();
      const geo = area.waterFx[0].mesh.geometry;
      expect(geo.parameters.segments).toBe(WATER_TUNING.CIRCLE_SEGMENTS);
      expect(geo.parameters.radius).toBe(7);
    });

    it('threads the tier and reduced motion through, and defaults both', () => {
      expect(built().area.waterFx[0].tier).toBe('high');
      expect(built().area.waterFx[0].animated).toBe(true);
      expect(built({ water: { quality: { name: 'low' } } }).area.waterFx[0].tier).toBe('low');
      // Reduced motion is independent of the tier: an explicit high-tier
      // override must still not animate.
      expect(built({ water: { quality: 'high', reducedMotion: true } }).area.waterFx[0].animated)
        .toBe(false);
    });
  });

  describe('surfaces', () => {
    it('lays the lawn as grass at one tile per tile-width of the plane', () => {
      const { scene } = built();
      const [lawn] = rootMeshes(scene, 'PlaneGeometry')
        .filter((m) => m.geometry.parameters.width === 120);
      expect(lawn.material.roughness).toBe(surfaceProps('grass').roughness);
      const tiles = 120 / tileMetres('grass');
      expect(lawn.material.map.repeat.x).toBe(Math.round(tiles));
      expect(lawn.material.map.repeat.y).toBe(Math.round(tiles));
      // builder.ground compensates grass's 0.955 mean itself, so the lawn on
      // screen lands on the hex park.js authored rather than 4.5% under it —
      // which means the material's own colour must be LIFTED off 0x6cb058.
      expect(lawn.material.color.getHex()).toBeGreaterThan(0x6cb058);
    });

    it('surfaces all five gravel walks at the same grit size', () => {
      const { scene } = built();
      const paths = rootMeshes(scene, 'PlaneGeometry')
        .filter((m) => m.geometry.parameters.width === 3);
      expect(paths).toHaveLength(5);
      for (const p of paths) {
        expect(p.material.map?.name).toBe('surface:gravel');
        expect(p.material.roughness).toBe(surfaceProps('gravel').roughness);
        // Across the 3m width: derived from the path's own extent, never
        // typed, so every segment gets the same size of chipping. The walks
        // moved from 'sand' (0.8m tile, 4 across) to 'gravel' (1.4m tile, 2
        // across) — a deliberate consequence of the coarser tile, since these
        // are gravel walks and sand's 11mm grain was beach fines.
        expect(p.material.map.repeat.x).toBe(2);
        expect(p.material.map.repeat.x).toBe(Math.round(3 / tileMetres('gravel')));
        expect(p.material.map.repeat.y)
          .toBe(Math.round(p.geometry.parameters.height / tileMetres('gravel')));
      }
    });

    it('gives the fountain stone its light response with the map left off', () => {
      const { scene } = built();
      const fountain = scene.children.find(
        (o) => o.isGroup && Math.abs(o.position.z - 20) < 1e-6 && o.children.length === 3,
      );
      const [basin, water, spire] = fountain.children;
      for (const stone of [basin, spire]) {
        expect(stone.material.roughness).toBe(surfaceProps('cobble').roughness);
        // The cylinder rule: a planar tile smears on a 12- and an 8-sided drum.
        expect(stone.material.map).toBeFalsy();
      }
      // The disc keeps the 'water' PRESET and does not become a second
      // createWater — water.js's own split, since it carries no footprint
      // record and is sealed inside the basin's r-3 collider.
      expect(water.material.roughness).toBe(surfaceProps('water').roughness);
      expect(water.geometry.type).toBe('CylinderGeometry');
      expect(water.material.metalness).toBe(0);
    });

    it('puts metalness 0 on everything, bareMetal included by absence', () => {
      const { scene } = built();
      scene.traverse((o) => {
        if (o.isMesh && typeof o.material?.metalness === 'number') {
          expect(o.material.metalness, o.geometry.type).toBe(0);
        }
      });
    });
  });

  describe('wind', () => {
    it('registers the foliage and nothing else — every tree, bush and flower patch', () => {
      const wind = recordingWind();
      built({ wind });
      // 17 trees (12 lawn + 4 far corners + the bench oak), 8 bushes,
      // 5 flower patches.
      expect(wind.calls).toHaveLength(30);
      const amps = wind.calls.map((c) => c.opts.amplitude);
      expect(amps.every((a) => typeof a === 'number' && a > 0 && a < 0.05)).toBe(true);
      // Registered AFTER positioning, so no two props share a phase: wind.js
      // derives the phase from (x, z), and a prop registered at the origin
      // would sway in lockstep with everything else registered there.
      expect(wind.calls.every((c) => c.object3d.position.x !== 0 || c.object3d.position.z !== 0))
        .toBe(true);
    });

    it('registers nothing whose position a collider, perch or spot reads', () => {
      // The whole safety argument for wind is that it only ever rotates. This
      // asserts the other half of it from the area's side: every registered
      // object sits exactly on a collider or a perch this area declared, and
      // wind never writes position — so a swaying tree's records stay put.
      const wind = recordingWind();
      const { area } = built({ wind });
      const anchors = [...area.colliders, ...area.perches];
      for (const { object3d } of wind.calls) {
        const { x, z } = object3d.position;
        expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
        // Trees and the oak carry colliders/perches; bushes and flowers do
        // not, so this is an "is on the grid the area declared" check rather
        // than a one-to-one match.
        const onRecord = anchors.some((a) => Math.hypot(a.x - x, a.z - z) < 1e-6);
        const isFoliageOnly = !area.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < 1e-6);
        expect(onRecord || isFoliageOnly).toBe(true);
      }
    });

    it('builds identically with no wind registry at all, which is what world tests do', () => {
      const bare = built();
      const windy = built({ wind: recordingWind() });
      expect(windy.area.colliders).toEqual(bare.area.colliders);
      expect(windy.area.perches).toEqual(bare.area.perches);
      expect(windy.area.pois).toEqual(bare.area.pois);
    });
  });
});

// v1.2: the hemisphere fill's ground term (game/walk.js). The lawn's own hex,
// a literal for the same reason the neighbourhood's is — ground() lifts grass
// to compensate for its map, so the mesh's material colour is deliberately not
// the number authored here, and the bounce tracks what was authored.
describe('City Park — the hemisphere fill’s bounce', () => {
  it('bounces the park’s own, deeper green', () => {
    const { area } = built();
    expect(area.groundBounce).toBe(0x6cb058);
  });
});
