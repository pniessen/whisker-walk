import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub the world tests use (see test/waterlooks.test.js):
// a context whose every method is a no-op, so the moon's canvas can be drawn.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
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
  STAR_RADIUS, MOON_RADIUS, STAR_COUNT, layoutStars, starFade, moonDirection, createNightSky,
} = await import('../src/render/nightsky.js');
const { SKY_RADIUS, createClouds } = await import('../src/render/clouds.js');

function camAt(x = 40, y = 2, z = -15) {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 300);
  camera.position.set(x, y, z);
  camera.lookAt(x + 10, y + 1, z + 4);
  camera.updateMatrixWorld();
  return camera;
}
function elevDeg(dir, i) {
  return (Math.asin(dir[i * 3 + 1]) * 180) / Math.PI;
}

afterEach(() => vi.restoreAllMocks());

describe('layoutStars', () => {
  it('layoutStars is deterministic per area and never touches Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const a = layoutStars('woods');
    const b = layoutStars('woods');
    const c = layoutStars('moor');
    expect(spy).not.toHaveBeenCalled();
    expect(a.dir).toHaveLength(STAR_COUNT * 3);
    expect(Array.from(a.dir)).toEqual(Array.from(b.dir));
    expect(Array.from(a.size)).toEqual(Array.from(b.size));
    expect(Array.from(a.phase)).toEqual(Array.from(b.phase));
    expect(Array.from(a.dir)).not.toEqual(Array.from(c.dir));
  });

  it('stars sit between 3 and 75 degrees up, more of them low where the camera can see', () => {
    const { dir, size, bright } = layoutStars('park');
    let low = 0;
    for (let i = 0; i < STAR_COUNT; i++) {
      const len = Math.hypot(dir[i * 3], dir[i * 3 + 1], dir[i * 3 + 2]);
      expect(len).toBeCloseTo(1, 5);
      const el = elevDeg(dir, i);
      expect(el).toBeGreaterThanOrEqual(3 - 1e-4);
      expect(el).toBeLessThanOrEqual(75 + 1e-4);
      if (el < 30) low++;
      expect(size[i]).toBeGreaterThanOrEqual(1.4);
      expect(size[i]).toBeLessThanOrEqual(4.2);
      expect(bright[i]).toBeGreaterThanOrEqual(0);
      expect(bright[i]).toBeLessThanOrEqual(1);
    }
    expect(low).toBeGreaterThan(STAR_COUNT / 2);
  });

  it('starFade: gone in the horizon glow, full above it', () => {
    expect(starFade(2)).toBe(0);
    expect(starFade(3)).toBe(0);
    expect(starFade(8)).toBe(1);
    expect(starFade(40)).toBe(1);
    const mid = starFade(5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('moonDirection is a unit vector 11 degrees up', () => {
    const d = moonDirection(0.3);
    expect(d.length()).toBeCloseTo(1, 6);
    expect((Math.asin(d.y) * 180) / Math.PI).toBeCloseTo(11, 5);
  });
});

describe('createNightSky', () => {
  it('star field is one Points, no shadow, no fog, depth-tested but not depth-writing, rendered beyond the clouds and inside the far plane', () => {
    const scene = new THREE.Scene();
    const sky = createNightSky(scene, { areaId: 'woods', camera: camAt() });
    const { stars } = sky;
    expect(stars.isPoints).toBe(true);
    expect(stars.name).toBe('stars');
    expect(stars.castShadow).toBe(false);
    expect(stars.material.depthWrite).toBe(false);
    expect(stars.material.depthTest).toBe(true);
    expect(stars.material.fog).toBe(false);
    expect(stars.material.blending).toBe(THREE.AdditiveBlending);
    expect(STAR_RADIUS).toBeGreaterThan(SKY_RADIUS + 30);
    expect(STAR_RADIUS).toBeLessThan(300);
    expect(MOON_RADIUS).toBeLessThan(300);
    expect(stars.userData.noCast && stars.userData.noMerge && stars.userData.clouds).toBe(true);
    expect(stars.frustumCulled).toBe(false);
    expect(stars.geometry.attributes.position.count).toBe(STAR_COUNT);
    expect(scene.children).toContain(stars);
    sky.dispose();
  });

  it('follows the camera', () => {
    const scene = new THREE.Scene();
    const camera = camAt(40, 2, -15);
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    // Bearings turn clockwise (to the right): bearing b looks along (-sin b, 0, cos b).
    const yaw0 = Math.atan2(-fwd.x, fwd.z);
    const sky = createNightSky(scene, { areaId: 'woods', camera });
    sky.update(0);
    expect(sky.stars.position.equals(camera.position)).toBe(true);
    const want = camera.position.clone().addScaledVector(moonDirection(yaw0), MOON_RADIUS);
    expect(sky.moon.position.distanceTo(want)).toBeLessThan(1e-6);
    // Walk on and turn: the sky keeps up, but the moon stays where it was in the sky.
    camera.position.set(-20, 3, 60);
    camera.lookAt(0, 3, 0);
    camera.updateMatrixWorld();
    sky.update(1);
    expect(sky.stars.position.equals(camera.position)).toBe(true);
    const want2 = camera.position.clone().addScaledVector(moonDirection(yaw0), MOON_RADIUS);
    expect(sky.moon.position.distanceTo(want2)).toBeLessThan(1e-6);
    sky.dispose();
  });

  it('twinkles with time, and holds still under reduced motion', () => {
    const scene = new THREE.Scene();
    const sky = createNightSky(scene, { areaId: 'river', camera: camAt() });
    sky.update(0);
    const t0 = sky.stars.material.uniforms.uTime.value;
    sky.update(5);
    expect(sky.stars.material.uniforms.uTime.value).not.toBe(t0);
    sky.dispose();
    const still = createNightSky(scene, { areaId: 'river', camera: camAt(), reducedMotion: true });
    still.update(5);
    expect(still.stars.material.uniforms.uTime.value).toBe(0);
    still.dispose();
  });

  it('moon is one plane facing the camera, fog off, no shadow', () => {
    const scene = new THREE.Scene();
    const camera = camAt();
    const sky = createNightSky(scene, { areaId: 'moor', camera });
    const { moon } = sky;
    expect(moon.isMesh).toBe(true);
    expect(moon.name).toBe('moon');
    expect(moon.material.fog).toBe(false);
    expect(moon.material.depthWrite).toBe(false);
    expect(moon.material.map).toBeTruthy();
    expect(moon.castShadow).toBe(false);
    expect(moon.frustumCulled).toBe(false);
    expect(moon.userData.noCast && moon.userData.noMerge && moon.userData.clouds).toBe(true);
    sky.update(0);
    expect(moon.quaternion.equals(camera.quaternion)).toBe(true);
    sky.dispose();
  });

  it('without a canvas there is no moon, but the stars still come out', () => {
    const scene = new THREE.Scene();
    const outer = globalThis.document;
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    try {
      const sky = createNightSky(scene, { areaId: 'woods', camera: camAt() });
      expect(sky.moon).toBeNull();
      expect(sky.stars.isPoints).toBe(true);
      sky.update(2);
      sky.dispose();
    } finally {
      vi.stubGlobal('document', outer); // put the canvas stub back
    }
  });

  it('the moon rises up and to the RIGHT of the starting view', () => {
    const camera = camAt(0, 2, 0);
    camera.lookAt(0, 2, -10); // three's default: looking down -z, right is +x
    camera.updateMatrixWorld();
    const sky = createNightSky(new THREE.Scene(), { areaId: 'park', camera });
    const rel = sky.moon.position.clone().sub(camera.position);
    expect(rel.z).toBeLessThan(0); // in front
    expect(rel.x).toBeGreaterThan(0); // to the right
    expect(rel.y).toBeGreaterThan(0); // up
    sky.dispose();
  });

  it('dispose frees everything', () => {
    const scene = new THREE.Scene();
    const sky = createNightSky(scene, { areaId: 'woods', camera: camAt() });
    const spies = [
      vi.spyOn(sky.stars.geometry, 'dispose'),
      vi.spyOn(sky.stars.material, 'dispose'),
      vi.spyOn(sky.moon.geometry, 'dispose'),
      vi.spyOn(sky.moon.material, 'dispose'),
      vi.spyOn(sky.moon.material.map, 'dispose'),
    ];
    sky.dispose();
    for (const s of spies) expect(s).toHaveBeenCalled();
    expect(scene.children).not.toContain(sky.stars);
    expect(scene.children).not.toContain(sky.moon);
  });
});

describe('the clouds rig owns the night sky', () => {
  it('dusk walks get stars and a moon; day walks, the den, and clouds-off tiers behave', () => {
    const camera = camAt();
    const dusk = new THREE.Scene();
    const rig = createClouds(dusk, { areaId: 'woods', tier: { cloudCount: 10 }, camera, dusk: true });
    expect(rig.night).not.toBeNull();
    expect(dusk.getObjectByName('stars')).toBeTruthy();
    expect(dusk.getObjectByName('moon')).toBeTruthy();
    const spy = vi.spyOn(rig.night, 'update');
    rig.update(3);
    expect(spy).toHaveBeenCalledWith(3);
    rig.dispose();
    expect(dusk.getObjectByName('stars')).toBeUndefined();
    expect(dusk.getObjectByName('moon')).toBeUndefined();

    const day = new THREE.Scene();
    const dayRig = createClouds(day, { areaId: 'woods', tier: { cloudCount: 10 }, camera });
    expect(dayRig.night).toBeNull();
    expect(day.getObjectByName('stars')).toBeUndefined();
    dayRig.dispose();

    const den = new THREE.Scene();
    const denRig = createClouds(den, { areaId: 'den', tier: { cloudCount: 10 }, camera, dusk: true });
    expect(denRig.mesh).toBeNull();
    expect(den.getObjectByName('stars')).toBeUndefined();
    expect(den.children).toHaveLength(0);

    const off = new THREE.Scene();
    const offRig = createClouds(off, { areaId: 'park', tier: { cloudCount: 0 }, camera, dusk: true });
    expect(offRig.mesh).toBeNull();
    expect(off.getObjectByName('stars')).toBeTruthy();
    expect(off.getObjectByName('clouds')).toBeUndefined();
    offRig.update(1);
    offRig.dispose();
    expect(off.children).toHaveLength(0);

    const noCam = createClouds(new THREE.Scene(), { areaId: 'park', tier: { cloudCount: 10 }, dusk: true });
    expect(noCam.mesh).toBeNull();
  });
});
