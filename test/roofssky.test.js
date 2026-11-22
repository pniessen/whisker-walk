import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createNightSky } from '../src/render/nightsky.js';
import { createRoofsSkyDress, roofsSkyTexture, STAR_N } from '../src/world/roofssky.js';

// The Rooftops' night dressing (beauty round 1): it re-dresses the stars the
// render rig made (one Points, no new mesh) and puts them back at the end.
describe('the Rooftops night sky dressing', () => {
  it('makes no canvas headless, so the life falls back to sky.js', () => {
    expect(roofsSkyTexture(0x24305c, 0x765266, 1)).toBeNull();
  });
  it('swaps the stars for a richer geometry in the same Points, drives a shooting star, and restores them', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1.7, 0.1, 300);
    const night = createNightSky(scene, { areaId: 'roofs', camera });
    const stars = night.stars;
    const [g0, m0] = [stars.geometry, stars.material];
    const before = scene.children.length;
    const dress = createRoofsSkyDress();
    for (let i = 0; i < 30; i++) dress.update(1 / 30, 1 + i / 30, 1, camera, scene);
    expect(stars.geometry).not.toBe(g0);
    expect(stars.geometry.attributes.position.count).toBeGreaterThan(STAR_N);
    expect(scene.children.length).toBe(before); // no mesh added
    // the first shooting star goes up at walk second 21 and is over by about 23
    dress.update(1 / 30, 21.5, camera, scene);
    dress.update(0.5, 22, camera, scene);
    expect(stars.material.uniforms.uSP.value).toBeGreaterThan(0);
    dress.update(2, 24, camera, scene);
    expect(stars.material.uniforms.uSP.value).toBe(-1);
    dress.dispose();
    expect(stars.geometry).toBe(g0);
    expect(stars.material).toBe(m0);
  });
  it('stands still under reduced motion: no shooting star', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    createNightSky(scene, { areaId: 'roofs', camera });
    const dress = createRoofsSkyDress({ reducedMotion: true });
    for (let t = 0; t < 120; t += 0.5) dress.update(0.5, t, 1, camera, scene);
    expect(scene.getObjectByName('stars').material.uniforms.uSP.value).toBe(-1);
    dress.dispose();
  });
});
