import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/grass.test.js).
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

const {
  CLOUD_AREAS, WIND_DIR, SKY_RADIUS, FADE_LEN, BASE_MIN, BAND_CLEARANCE_DEG,
  areaSeed, layoutClouds, cloudPlace, cloudReach, cloudPalette, bandElevation,
  puffGeometry, createClouds,
} = await import('../src/render/clouds.js');
const { LADDER } = await import('../src/render/quality.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { assignShadowCasters } = await import('../src/render/rig.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildSeaside } = await import('../src/world/seaside.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { build: buildDen } = await import('../src/world/den.js');
const grassSrc = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/render/grass.js', import.meta.url), 'utf8'));

const BUILDS = {
  neighborhood: buildNeighborhood, park: buildPark, seaside: buildSeaside, docks: buildDocks, den: buildDen,
};
// main.js's game camera: PerspectiveCamera(70, aspect, 0.1, 300).
const GAME_FAR = 300;

// walk.js's order: build, contact shadows, merge, casters, THEN clouds.
function walkScene(areaId) {
  const scene = new THREE.Scene();
  const areaData = BUILDS[areaId](scene);
  createContactShadows(scene);
  mergeStaticProps(scene);
  assignShadowCasters(scene);
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, GAME_FAR);
  const b = areaData.bounds;
  const centre = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
  camera.position.set(centre.x, 2, centre.z);
  return { scene, areaData, camera, centre };
}

const worlds = {};
function world(areaId) {
  worlds[areaId] ??= walkScene(areaId);
  return worlds[areaId];
}
function make(areaId, opts = {}) {
  const { scene, camera, centre } = world(areaId);
  return createClouds(scene, { areaId, tier: LADDER[0], camera, centre, ...opts });
}

// Every puff's world-space box corners, from the instance matrices.
function puffBoxes(mesh) {
  const m = new THREE.Matrix4();
  const box = new THREE.Box3();
  mesh.geometry.computeBoundingBox();
  const out = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    out.push(box.copy(mesh.geometry.boundingBox).applyMatrix4(m).clone());
  }
  return out;
}

describe('cloud layout', () => {
  it('is deterministic per area and differs between areas', () => {
    expect(layoutClouds('park', 10)).toEqual(layoutClouds('park', 10));
    expect(areaSeed('park')).toBe(areaSeed('park'));
    expect(areaSeed('park')).not.toBe(areaSeed('docks'));
    expect(layoutClouds('park', 10)[0]).not.toEqual(layoutClouds('docks', 10)[0]);
  });

  it('never draws from Math.random (walkRng and co-walk stay untouched)', () => {
    // (Not createClouds as a whole: three's uuid generator calls Math.random
    // for every Object3D, which has nothing to do with the layout.)
    const spy = vi.spyOn(Math, 'random');
    const clouds = layoutClouds('park', 10);
    for (const cl of clouds) cloudPlace(cl, 12);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('builds the same instance matrices on two clients for the same area', () => {
    const a = make('seaside');
    const b = make('seaside');
    a.update(37.5);
    b.update(37.5);
    expect(Array.from(a.mesh.instanceMatrix.array)).toEqual(Array.from(b.mesh.instanceMatrix.array));
    a.dispose();
    b.dispose();
  });

  it('gives every cloud 3-6 puffs and spreads them around the sky', () => {
    const clouds = layoutClouds('neighborhood', 10);
    for (const c of clouds) {
      expect(c.puffs.length).toBeGreaterThanOrEqual(3);
      expect(c.puffs.length).toBeLessThanOrEqual(6);
    }
    expect(clouds.some((c) => c.v > 0)).toBe(true);
    expect(clouds.some((c) => c.v < 0)).toBe(true);
  });
});

describe('cloud drift', () => {
  const cloud = layoutClouds('park', 4)[1];

  it('moves along the grass wind direction', () => {
    expect(grassSrc).toContain(`WIND_DIR = Object.freeze([${WIND_DIR[0]}, ${WIND_DIR[1]}])`);
    const a = cloudPlace(cloud, 0);
    const b = cloudPlace(cloud, 1);
    // Unless this second straddles the wrap, the step is speed * WIND_DIR.
    if (Math.abs(b.u - a.u) < 5) {
      expect(b.x - a.x).toBeCloseTo(cloud.speed * WIND_DIR[0], 6);
      expect(b.z - a.z).toBeCloseTo(cloud.speed * WIND_DIR[1], 6);
    }
  });

  it('wraps, so a cloud comes back round and the sky never empties', () => {
    const lap = (2 * cloudPlace(cloud, 0).half) / cloud.speed;
    const a = cloudPlace(cloud, 3);
    const b = cloudPlace(cloud, 3 + lap);
    expect(b.x).toBeCloseTo(a.x, 4);
    expect(b.z).toBeCloseTo(a.z, 4);
    for (let t = 0; t < 3 * lap; t += lap / 37) {
      const p = cloudPlace(cloud, t);
      expect(Math.abs(p.u)).toBeLessThanOrEqual(p.half);
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(SKY_RADIUS + 1e-6);
    }
  });

  it('dissolves at the chord ends instead of popping', () => {
    const half = cloudPlace(cloud, 0).half;
    const atEnd = { ...cloud, u0: half - 0.01 };
    expect(cloudPlace(atEnd, 0).fade).toBeLessThan(0.01);
    const mid = { ...cloud, u0: 0 };
    expect(cloudPlace(mid, 0).fade).toBe(1);
    const nearEnd = { ...cloud, u0: half - FADE_LEN / 2 };
    expect(cloudPlace(nearEnd, 0).fade).toBeGreaterThan(0.1);
    expect(cloudPlace(nearEnd, 0).fade).toBeLessThan(0.9);
  });

  it('keeps a sky at every moment: most clouds are visible whatever the time', () => {
    const clouds = layoutClouds('docks', 10);
    for (let t = 0; t < 2000; t += 50) {
      const shown = clouds.filter((c) => cloudPlace(c, t).fade > 0.5).length;
      expect(shown).toBeGreaterThanOrEqual(6);
    }
  });

  it('moves the mesh with time, and holds still under reduced motion', () => {
    const moving = make('park');
    const still = make('park', { reducedMotion: true });
    const a = Array.from(moving.mesh.instanceMatrix.array);
    const s0 = Array.from(still.mesh.instanceMatrix.array);
    moving.update(30);
    still.update(30);
    expect(Array.from(moving.mesh.instanceMatrix.array)).not.toEqual(a);
    expect(Array.from(still.mesh.instanceMatrix.array)).toEqual(s0);
    moving.dispose();
    still.dispose();
  });
});

describe('cloud placement', () => {
  for (const areaId of CLOUD_AREAS) {
    it(`${areaId}: every cloud clears the horizon band and stays inside the far plane`, () => {
      const { scene, centre, camera } = world(areaId);
      const band = scene.getObjectByName('horizonBand');
      band.geometry.computeBoundingBox();
      const bandTop = band.geometry.boundingBox.max.y;
      const bandDeg = bandElevation(scene, centre);
      const c = make(areaId);
      for (const t of [0, 61, 333, 1200, 4000]) {
        c.update(t);
        for (const box of puffBoxes(c.mesh)) {
          // Physically above the band, by a wide margin.
          expect(box.min.y).toBeGreaterThan(bandTop + 10);
          // Seen from the area centre at cat height, above its crest.
          const far = Math.hypot(
            Math.max(Math.abs(box.min.x - centre.x), Math.abs(box.max.x - centre.x)),
            Math.max(Math.abs(box.min.z - centre.z), Math.abs(box.max.z - centre.z)),
          );
          const el = (Math.atan2(box.min.y - 2, far) * 180) / Math.PI;
          expect(el).toBeGreaterThan(bandDeg + BAND_CLEARANCE_DEG - 1e-6);
          // Every corner inside the game camera's far plane, with room.
          expect(Math.hypot(far, box.max.y - camera.position.y)).toBeLessThan(GAME_FAR - 5);
        }
      }
      c.dispose();
    });
  }

  it('sits high: bases 30m up or more, and the Docks lifted over its skyline', () => {
    for (const areaId of CLOUD_AREAS) {
      const c = make(areaId);
      for (const cl of c.clouds) expect(cl.base).toBeGreaterThanOrEqual(BASE_MIN);
      c.dispose();
    }
    const docks = make('docks');
    expect(Math.min(...docks.clouds.map((cl) => cl.base))).toBeGreaterThan(BASE_MIN);
    docks.dispose();
  });

  it('follows the camera, like a sky that is kilometres away', () => {
    const { scene, centre } = world('park');
    const cam = new THREE.PerspectiveCamera(70, 1, 0.1, GAME_FAR);
    cam.position.set(0, 2, 0);
    const c = createClouds(scene, { areaId: 'park', tier: LADDER[0], camera: cam, centre });
    const m = new THREE.Matrix4();
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    c.update(5);
    c.mesh.getMatrixAt(0, m);
    p0.setFromMatrixPosition(m);
    cam.position.set(20, 2, -15);
    c.update(5);
    c.mesh.getMatrixAt(0, m);
    p1.setFromMatrixPosition(m);
    expect(p1.x - p0.x).toBeCloseTo(20, 4);
    expect(p1.z - p0.z).toBeCloseTo(-15, 4);
    c.dispose();
  });
});

describe('the cloud mesh', () => {
  it('is ONE InstancedMesh that casts no shadow, flagged for rig.js and mergeprops.js', () => {
    const { scene } = world('neighborhood');
    const before = scene.children.length;
    const c = make('neighborhood');
    expect(scene.children.length).toBe(before + 1);
    const clouds = scene.children.filter((o) => o.userData?.clouds);
    expect(clouds).toHaveLength(1);
    expect(c.mesh.isInstancedMesh).toBe(true);
    expect(c.mesh.castShadow).toBe(false);
    expect(c.mesh.material.fog).toBe(false);
    expect(c.mesh.count).toBe(c.clouds.reduce((s, cl) => s + cl.puffs.length, 0));
    // A later caster sweep or merge leaves it alone.
    assignShadowCasters(scene);
    expect(c.mesh.castShadow).toBe(false);
    mergeStaticProps(scene);
    expect(scene.children.includes(c.mesh)).toBe(true);
    c.dispose();
  });

  it('puffs have a flat, darker underside in their vertex colours', () => {
    const g = puffGeometry(1);
    const pos = g.attributes.position;
    const col = g.attributes.color;
    let minY = Infinity;
    for (let i = 0; i < pos.count; i++) minY = Math.min(minY, pos.getY(i));
    // Faces lying in the flat base carry height 0 (all underside colour);
    // faces on top carry ~1.
    let baseUp = 0;
    let topUp = 0;
    for (let f = 0; f < pos.count; f += 3) {
      const ys = [pos.getY(f), pos.getY(f + 1), pos.getY(f + 2)];
      if (ys.every((y) => y === minY)) baseUp = Math.max(baseUp, col.getY(f));
      if (ys.every((y) => y > 0.6)) topUp = Math.max(topUp, col.getY(f));
    }
    expect(minY).toBeCloseTo(-0.35, 6);
    expect(baseUp).toBe(0);
    expect(topUp).toBeGreaterThan(0.9);
  });

  it('day palette: white tops, an underside that reads against even the Seaside horizon', () => {
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    for (const horizon of [0xcfe8f0, 0xd8f0e0, 0xe8e0d0, 0x8e9aae]) {
      const p = cloudPalette(horizon);
      const h = new THREE.Color(horizon);
      expect(lum(p.top)).toBeGreaterThan(0.85);
      expect(lum(p.under)).toBeLessThan(lum(h) * 0.8);
    }
  });

  it('dusk palette: warmer and dimmer than the day, and no brighter than a dim glow', () => {
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    for (const dusk of [0x6a5a7e, 0x7a5a6e, 0x2e2842]) {
      const day = cloudPalette(0xcfe8f0);
      const p = cloudPalette(dusk, true);
      expect(lum(p.top)).toBeLessThan(lum(day.top) * 0.6);
      expect(p.top.r).toBeGreaterThan(p.top.b); // warm
      expect(lum(p.under)).toBeLessThan(lum(new THREE.Color(dusk)));
    }
  });

  it('sunset palette: warm, no near-white tops, a dusky underside against the peach horizon', () => {
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const horizon = new THREE.Color(0xf8c890); // weather.js's sunset fog
    const day = cloudPalette(horizon); // what a sunset walk used to get
    const p = cloudPalette(horizon, 'sunset');
    expect(lum(day.top)).toBeGreaterThan(0.85); // the near-white this fixes
    expect(lum(p.top)).toBeLessThan(0.8);
    expect(lum(p.top)).toBeGreaterThan(lum(horizon)); // still catches the sun
    expect(p.top.r).toBeGreaterThan(p.top.b); // warm
    expect(lum(p.under)).toBeLessThan(lum(horizon) * 0.7);
    // The old boolean still means dusk.
    expect(cloudPalette(horizon, true).top.equals(cloudPalette(horizon, 'dusk').top)).toBe(true);
  });

  it('a sunset walk uses the sunset palette, from the live fog', () => {
    const { scene } = world('park');
    const old = scene.fog;
    scene.fog = new THREE.Fog(0xf8c890, 40, 130);
    const c = make('park', { sunset: true });
    c.update(1);
    const want = cloudPalette(new THREE.Color(0xf8c890), 'sunset');
    expect(c.palette.top.equals(want.top)).toBe(true);
    expect(c.palette.under.equals(want.under)).toBe(true);
    c.dispose();
    scene.fog = old;
  });

  it('cloudPlace fills a scratch object when given one', () => {
    const cloud = layoutClouds('park', 3)[0];
    const out = { x: 0, z: 0, u: 0, half: 0, fade: 0 };
    expect(cloudPlace(cloud, 7, out)).toBe(out);
    expect(out).toEqual(cloudPlace(cloud, 7));
  });

  it('re-tints from the live fog colour (a shower clearing hands the sky back)', () => {
    const { scene } = world('park');
    const old = scene.fog;
    const c = make('park');
    const before = c.palette.top.clone();
    scene.fog = new THREE.Fog(0x8a9aa8, 20, 90);
    c.update(1);
    expect(c.palette.haze.getHex()).toBe(0x8a9aa8);
    expect(c.palette.top.equals(before)).toBe(false);
    scene.fog = old;
    c.update(2);
    expect(c.palette.top.equals(before)).toBe(true);
    c.dispose();
  });

  it('dispose() removes the mesh and frees its geometry and material', () => {
    const { scene } = world('docks');
    const c = make('docks');
    const geo = vi.spyOn(c.mesh.geometry, 'dispose');
    const mat = vi.spyOn(c.mesh.material, 'dispose');
    c.dispose();
    expect(scene.children.includes(c.mesh)).toBe(false);
    expect(geo).toHaveBeenCalled();
    expect(mat).toHaveBeenCalled();
  });
});

describe('where clouds are not', () => {
  it('the den gets the no-op stub and adds nothing to the scene', () => {
    const { scene, camera } = world('den');
    const before = scene.children.length;
    const c = createClouds(scene, { areaId: 'den', tier: LADDER[0], camera });
    expect(c.mesh).toBeNull();
    expect(scene.children.length).toBe(before);
    expect(() => { c.update(10); c.dispose(); }).not.toThrow();
  });

  it('per tier: high rungs 10 clouds, the low rung 6, a tier of 0 none', () => {
    const counts = LADDER.map((t) => t.cloudCount);
    expect(counts).toEqual([10, 10, 10, 6]);
    for (const tier of LADDER) {
      const { scene, camera, centre } = world('park');
      const c = createClouds(scene, { areaId: 'park', tier, camera, centre });
      expect(c.clouds).toHaveLength(tier.cloudCount);
      c.dispose();
    }
    const off = make('park', { tier: { ...LADDER[3], cloudCount: 0 } });
    expect(off.mesh).toBeNull();
  });

  it('cloudReach bounds a cloud', () => {
    const cl = layoutClouds('park', 1)[0];
    const r = cloudReach(cl);
    expect(r.horizontal).toBeGreaterThan(0);
    expect(r.top).toBeGreaterThan(0);
  });
});
