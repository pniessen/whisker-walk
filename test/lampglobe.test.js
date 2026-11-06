import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { lampPost, lampGlobeScale, LAMP_GLOBE_FADE } from '../src/world/builder.js';
import { applyDusk, LAMP_LOOK } from '../src/render/dusk.js';
import { createSun, createFill } from '../src/render/rig.js';

const area = { skyDusk: { top: 0x26344f, horizon: 0x5f5a72 }, groundBounce: 0x6a8a4a };

function globeOf(post) {
  let g = null;
  post.traverse((o) => { if (o.userData?.lampGlobe) g = o; });
  return g;
}

// A lamp at the origin, in a scene, world matrices current.
function setup({ dusk = true } = {}) {
  const scene = new THREE.Scene();
  const post = lampPost(0, 0);
  scene.add(post);
  if (dusk) applyDusk({ scene, sun: createSun(), fill: createFill(), areaData: area });
  scene.updateMatrixWorld(true);
  return { scene, globe: globeOf(post) };
}

// A perspective camera `d` metres level with the globe (y 3.3).
function camAt(d) {
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(d, 3.3, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

const draw = (scene, globe, cam, mat = globe.material) =>
  globe.onBeforeRender(null, scene, cam, globe.geometry, mat, null);

describe('lampGlobeScale', () => {
  it('is nearScale at and inside near, 1 at and beyond far', () => {
    const f = LAMP_GLOBE_FADE;
    expect(lampGlobeScale(0)).toBeCloseTo(f.nearScale, 10);
    expect(lampGlobeScale(f.near)).toBeCloseTo(f.nearScale, 10);
    expect(lampGlobeScale(f.far)).toBe(1);
    expect(lampGlobeScale(40)).toBe(1);
  });
  it('rises monotonically between near and far', () => {
    let prev = -Infinity;
    for (let d = 0; d <= 12; d += 0.25) {
      const s = lampGlobeScale(d);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
  it('dims a dusk globe up close below the bloom threshold (1.1)', () => {
    expect(LAMP_LOOK.emissiveIntensity * lampGlobeScale(1)).toBeLessThan(1.1);
  });
});

describe('lampPost globe onBeforeRender', () => {
  it('caps a dusk globe near the camera and leaves it at base far away', () => {
    const { scene, globe } = setup();
    const base = LAMP_LOOK.emissiveIntensity;
    draw(scene, globe, camAt(1.5));
    expect(globe.material.emissiveIntensity).toBeCloseTo(base * LAMP_GLOBE_FADE.nearScale, 10);
    draw(scene, globe, camAt(5.5));
    const mid = globe.material.emissiveIntensity;
    expect(mid).toBeGreaterThan(base * LAMP_GLOBE_FADE.nearScale);
    expect(mid).toBeLessThan(base);
    draw(scene, globe, camAt(20));
    expect(globe.material.emissiveIntensity).toBe(base);
  });

  it('re-reads the base after a material swap, and a clone of a dimmed material keeps the true base', () => {
    const { scene, globe } = setup();
    draw(scene, globe, camAt(1));
    // treefade-style clone taken while dimmed
    const clone = globe.material.clone();
    globe.material = clone;
    draw(scene, globe, camAt(30));
    expect(clone.emissiveIntensity).toBe(LAMP_LOOK.emissiveIntensity);
    // a fresh material with a different glow (a re-swap): its own base
    const fresh = new THREE.MeshStandardMaterial({ emissive: 0xffc870, emissiveIntensity: 3 });
    globe.material = fresh;
    draw(scene, globe, camAt(30));
    expect(fresh.emissiveIntensity).toBe(3);
    draw(scene, globe, camAt(0.5));
    expect(fresh.emissiveIntensity).toBeCloseTo(3 * LAMP_GLOBE_FADE.nearScale, 10);
  });

  it('leaves the daytime globe untouched', () => {
    const { scene, globe } = setup({ dusk: false });
    const before = globe.material.emissiveIntensity;
    expect(before).toBe(1);
    draw(scene, globe, camAt(0.5));
    expect(globe.material.emissiveIntensity).toBe(before);
  });

  it('ignores a non-perspective (shadow / map) camera', () => {
    const { scene, globe } = setup();
    // a near perspective view first dims it; the ortho view then sees full glow
    draw(scene, globe, camAt(0.5));
    expect(globe.material.emissiveIntensity).toBeLessThan(LAMP_LOOK.emissiveIntensity);
    const ortho = new THREE.OrthographicCamera();
    ortho.position.set(0.5, 3.3, 0);
    ortho.updateMatrixWorld(true);
    draw(scene, globe, ortho);
    expect(globe.material.emissiveIntensity).toBe(LAMP_LOOK.emissiveIntensity);
    const shadowCam = new THREE.DirectionalLight().shadow.camera;
    draw(scene, globe, shadowCam);
    expect(globe.material.emissiveIntensity).toBe(LAMP_LOOK.emissiveIntensity);
  });
});
