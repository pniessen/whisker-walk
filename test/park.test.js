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
        (o) => o.isGroup && Math.abs(o.position.z - 20) < 1e-6 && o.getObjectByName('fountainBasin'),
      );
      // polish-park2 Task 2: found by name now that the group holds more.
      const basin = fountain.getObjectByName('fountainBasin');
      const water = fountain.getObjectByName('fountainWater');
      const spire = fountain.getObjectByName('fountainSpire');
      // the three shipped constructor slots keep their order
      expect(fountain.children.slice(0, 3)).toEqual([basin, water, spire]);
      for (const stone of [basin, spire]) {
        expect(stone.material.roughness).toBe(surfaceProps('cobble').roughness);
        // A planar tile smears on a turned profile.
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

describe('City Park — the oak’s Twoleg (polish-places)', () => {
  it('stands clear of the trunk, the canopy and the bench', () => {
    const { area } = built();
    const v = area.critterSpawns.find((s) => s.type === 'villager' && s.x === 4 && s.z === 27);
    expect(v.standOff).toBeTruthy();
    const x = v.x + v.standOff.x;
    const z = v.z + v.standOff.z;
    expect(Math.hypot(x - 4.5, z - 27.3)).toBeGreaterThanOrEqual(1.9);
    expect(Math.hypot(x - 3, z - 26)).toBeGreaterThanOrEqual(1.6);
    const b = area.bounds;
    expect(x).toBeGreaterThan(b.minX); expect(x).toBeLessThan(b.maxX);
    expect(z).toBeGreaterThan(b.minZ); expect(z).toBeLessThan(b.maxZ);
    for (const w of area.waters) expect(Math.hypot(x - w.x, z - w.z)).toBeGreaterThan(w.r);
  });
});

// polish-park2: the five slabs are ONE soft gravel trail (pathribbon.js's
// 'gravel' look), the south walk running on out through the hedge's gate.
describe('City Park — the gravel trail (polish-park2)', async () => {
  const { PARK_PATHS, PARK_HORIZON } = await import('../src/world/park.js');
  const { trailField, quadRadius } = await import('../src/world/pathribbon.js');
  const { inWater } = await import('../src/world/builder.js');

  it('is one visible gravel pathTrail over five hidden strips, same params, same order', () => {
    const { scene } = built();
    const trails = scene.children.filter((c) => c.name === 'pathTrail');
    expect(trails).toHaveLength(1);
    expect(trails[0].visible).toBe(true);
    expect(trails[0].userData.trailLook).toBe('gravel');
    expect(trails[0].castShadow).toBe(false);
    const strips = scene.children.filter((c) => c.name === 'path');
    expect(strips).toHaveLength(5);
    expect(PARK_PATHS).toEqual([
      [0, 48, 0, 20], [0, 20, -4, 4], [-4, 4, -8, -18], [-8, -18, 12, -30], [0, 20, 16, 10],
    ]);
    strips.forEach((s, i) => {
      const [x1, z1, x2, z2] = PARK_PATHS[i];
      expect(s.visible).toBe(false);
      expect(s.geometry.parameters.width).toBe(3);
      expect(s.geometry.parameters.height).toBeCloseTo(Math.hypot(x2 - x1, z2 - z1), 9);
      expect(s.position.x).toBeCloseTo((x1 + x2) / 2, 9);
      expect(s.position.z).toBeCloseTo((z1 + z2) / 2, 9);
    });
    // Exactly one visible path-ish mesh.
    const visible = scene.children.filter((c) => (c.name === 'path' || c.name === 'pathTrail') && c.visible);
    expect(visible).toEqual([trails[0]]);
  });

  it('paints no gravel in the pond', () => {
    const { scene, area } = built();
    const segs = scene.children.find((c) => c.name === 'pathTrail').userData.trail;
    const bad = [];
    let wet = 0;
    for (const s of segs) {
      const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
      const ux = (s.x2 - s.x1) / len;
      const uz = (s.z2 - s.z1) / len;
      // A metre past the quad, so the sweep reaches the pond's edge (the
      // walk passes ~1 m off the water) and is not vacuous.
      const R = quadRadius(s.h, 'gravel') + 1;
      for (let a = -R; a <= len + R; a += 0.25) {
        for (let c = -R; c <= R; c += 0.25) {
          const x = s.x1 + ux * a - uz * c;
          const z = s.z1 + uz * a + ux * c;
          if (!inWater(area.waters, x, z)) continue;
          wet++;
          if (trailField(segs, x, z, 'gravel').alpha > 0.02) bad.push([+x.toFixed(2), +z.toFixed(2)]);
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
    expect(wet).toBeGreaterThan(0);
  });

  it('runs the south walk out through the hedge gate, inside the gap', () => {
    const { scene } = built();
    const segs = scene.children.find((c) => c.name === 'pathTrail').userData.trail;
    const [gate] = PARK_HORIZON.edge.gaps;
    // The (0, 48) end runs on past the gate; the other ends are as authored
    // (joined, or pulled back h at a dead end).
    expect(segs[0].x1).toBeCloseTo(0, 9);
    expect(segs[0].z1).toBeGreaterThan(gate.z + 2);
    expect(segs[0].z2).toBe(20);
    expect(trailField(segs, gate.x, gate.z, 'gravel').alpha).toBe(1);
    // ... and stays inside the hedge's gap there.
    for (const x of [-gate.r, gate.r]) {
      expect(trailField(segs, gate.x + x, gate.z, 'gravel').alpha).toBe(0);
    }
  });
});

describe('City Park — the two-tier fountain (polish-park2)', async () => {
  const fx = await import('../src/world/parkfountain.js');
  const fountainOf = (scene) => scene.children.find(
    (o) => o.isGroup && Math.abs(o.position.z - 20) < 1e-6 && o.getObjectByName('fountainBasin'),
  );
  const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

  it('turns the basin and spire as stone lathes at the shipped spot', () => {
    const f = fountainOf(built().scene);
    expect(f.position.toArray()).toEqual([0, 0, 20]);
    expect(f.getObjectByName('fountainBasin').geometry.type).toBe('LatheGeometry');
    expect(f.getObjectByName('fountainSpire').geometry.type).toBe('LatheGeometry');
    // the lip tops out just under the shipped perch (y 0.75), over the water
    const lipTop = Math.max(...fx.BASIN_PROFILE.map(([, y]) => y));
    expect(lipTop).toBeGreaterThan(0.65);
    expect(lipTop).toBeLessThan(0.75);
    const water = f.getObjectByName('fountainWater');
    expect(water.position.y + fx.BASIN_WATER.h / 2).toBeCloseTo(fx.BASIN_WATER.top, 6);
    expect(fx.BASIN_WATER.top).toBeLessThan(lipTop);
    // the finial tops out at ~2.2
    const top = Math.max(...fx.SPIRE_PROFILE.map(([, y]) => y));
    expect(top).toBeCloseTo(2.2, 2);
  });

  it('adds the upper water, drops and ripples — quiet in the shadow pass, animated ones unmerged', () => {
    const f = fountainOf(built().scene);
    const upper = f.getObjectByName('fountainUpperWater');
    const drops = f.getObjectByName('fountainDrops');
    const ripples = f.getObjectByName('fountainRipples');
    for (const m of [upper, drops, ripples]) {
      expect(m?.isMesh, m?.name).toBe(true);
      expect(m.parent).toBe(f);
      expect(m.castShadow).toBe(false);
      expect(m.userData.noCast).toBe(true);
    }
    expect(upper.material.roughness).toBe(surfaceProps('water').roughness);
    for (const m of [drops, ripples]) {
      expect(m.userData.noMerge).toBe(true);
      expect(m.material.transparent).toBe(true);
      expect(m.material.depthWrite).toBe(false);
    }
    // three new meshes (the plan allows four): six in the fountain
    let n = 0;
    f.traverse((o) => { if (o.isMesh) n++; });
    expect(n).toBe(6);
    // the culling sphere covers every arc, so the drops are never culled mid-fall
    const arcs = fx.fountainArcs();
    const sphere = drops.geometry.boundingSphere;
    for (const a of arcs) {
      for (let k = 0; k <= 10; k++) {
        const t = (k / 10) * a.T;
        const r = a.r0 + a.vr * t;
        const p = new THREE.Vector3(Math.cos(a.a) * r, a.y0 + a.vy * t - 3.5 * t * t, Math.sin(a.a) * r);
        expect(sphere.containsPoint(p)).toBe(true);
      }
    }
    // a ring of streams round the upper rim, landing in the basin water
    const streams = arcs.filter((a) => a.kind === 'stream');
    expect(streams).toHaveLength(fx.STREAMS);
    for (const a of streams) {
      expect(a.land).toBeGreaterThan(1.4);
      expect(a.land).toBeLessThan(fx.BASIN_WATER.r - 0.3);
      expect(a.landY).toBe(fx.BASIN_WATER.top);
    }
    expect(tris(drops.geometry)).toBe((fx.STREAMS * fx.STREAM_DROPS + fx.JETS * fx.JET_DROPS) * 8);
    expect(tris(ripples.geometry)).toBe((fx.STREAMS + fx.JETS) * 2);
  });

  it('ticks uTime from the clock, and freezes it under reduced motion', () => {
    const moving = fountainOf(built({ water: { reducedMotion: false } }).scene).getObjectByName('fountainDrops');
    const u = moving.userData.fountain.uFountainTime;
    const now = vi.spyOn(performance, 'now').mockReturnValue(1234567);
    moving.onBeforeRender();
    expect(u.value).toBeCloseTo((1234567 / 1000) % 3600, 6);
    now.mockRestore();

    const still = fountainOf(built({ water: { reducedMotion: true } }).scene);
    const drops = still.getObjectByName('fountainDrops');
    const ripples = still.getObjectByName('fountainRipples');
    drops.onBeforeRender();
    ripples.onBeforeRender();
    expect(drops.userData.fountain.uFountainTime.value).toBe(fx.FROZEN_TIME);
    // the drops and ripples read the same clock
    expect(ripples.material.onBeforeCompile).toBeTypeOf('function');
    expect(ripples.userData.fountain).toBe(drops.userData.fountain);
  });

  it('patches the standard shaders at anchors that exist (no silent no-op)', () => {
    const f = fountainOf(built().scene);
    for (const name of ['fountainDrops', 'fountainRipples']) {
      const mat = f.getObjectByName(name).material;
      const shader = {
        uniforms: {},
        vertexShader: THREE.ShaderLib.standard.vertexShader,
        fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      };
      mat.onBeforeCompile(shader);
      expect(shader.uniforms.uFountainTime, name).toBeDefined();
      expect(shader.vertexShader).not.toBe(THREE.ShaderLib.standard.vertexShader);
      expect(shader.vertexShader + shader.fragmentShader).toContain('uniform float uFountainTime;');
      if (name === 'fountainDrops') {
        expect(shader.vertexShader).toContain('attribute vec3 aStart;');
        expect(shader.vertexShader).toContain('transformed = fdPos');
      } else {
        expect(shader.fragmentShader).not.toBe(THREE.ShaderLib.standard.fragmentShader);
        expect(shader.fragmentShader).toContain('diffuseColor.a *=');
      }
      expect(mat.customProgramCacheKey()).toMatch(/^park-fountain-/);
    }
    expect(() => fx.inject('void main() {}', '#include <nope>', 'x')).toThrow(/anchor/);
  });

  it('keeps the fountain-edge lookout and the r-3 collider exactly where they were', () => {
    const { area } = built();
    expect(area.colliders).toContainEqual({ x: 0, z: 20, r: 3 });
    const perch = area.perches.find((p) => p.label === 'fountain-edge lookout');
    expect(perch).toMatchObject({ x: 2.8, z: 22.2, y: 0.75, kind: 'stone' });
  });

  it('keeps the Park under 26,535 triangles', () => {
    const { scene } = built();
    let total = 0;
    let fountain = 0;
    scene.traverse((o) => { if (o.isMesh) total += tris(o.geometry); });
    fountainOf(scene).traverse((o) => { if (o.isMesh) fountain += tris(o.geometry); });
    expect(total).toBeLessThanOrEqual(26535);
    expect(fountain).toBeLessThan(6000);
  });
});

// Review fix (polish-park2): grass.js masks a trail by the trail's OWN look, so
// the tidy gravel walk keeps its tufts right up to its edge rather than a bare
// half-metre band beside it (the default trail look's wobble is ~4x wider).
describe('grass beside the gravel walks', () => {
  it('masks the park trail by the gravel reach, not the wild-trail reach', async () => {
    const { flatFootprints } = await import('../src/render/grass.js');
    const { trailReach } = await import('../src/world/pathribbon.js');
    const scene = new THREE.Scene();
    build(scene);
    const caps = flatFootprints(scene).filter((f) => f.kind === 'capsule');
    expect(caps.length).toBeGreaterThan(0);
    for (const c of caps) {
      expect(c.r).toBeCloseTo(trailReach(1.5, 'gravel'), 9);
      expect(c.r).toBeLessThan(trailReach(1.5) - 0.2);
    }
  });
});
