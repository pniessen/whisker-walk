// The whole frame of a newer area: build(scene) plus the walk's life layer (sky, flakes, fireflies, rain, strings of lights,
// glows, critters and so on), counted the way test/budget.test.js counts a scene (every mesh a draw, a caster by the walk's
// rule, triangles by the index). Every test file stubs the canvas first (stubCanvasDocument), and loads the area's lazy
// stages before calling this (as test/budget.test.js does); `build` is the area's own build.
import * as THREE from 'three';
import { castsFromBox, isTransparentMat } from '../../src/render/rig.js';

export function frameStats(scene) {
  let meshes = 0;
  let casters = 0;
  let triangles = 0;
  const box = new THREE.Box3();
  for (const child of scene.children) {
    box.setFromObject(child);
    const eligible = castsFromBox(box);
    child.traverse((obj) => {
      if (!obj.isMesh) return;
      meshes++;
      const geo = obj.geometry;
      triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      if (eligible && !isTransparentMat(obj.material) && !obj.userData.noCast) casters++;
    });
  }
  return { meshes, casters, triangles: Math.round(triangles) };
}

const noop = () => {};
const progression = { get: () => 0, getMany: () => ({}), set: noop, has: () => false, on: () => noop, addPoints: noop, recordFeat: noop, data: {} };
const log = { startWalk: noop, record: noop, found: () => false, has: () => false, count: () => 0, restore: noop, on: () => noop };

// → { build, life, whole }, each { meshes, casters, triangles }: the build alone, what the life adds, and the two together.
export function measureWithLife(build, { frames = 3 } = {}) {
  const scene = new THREE.Scene();
  const placed = build(scene);
  const built = frameStats(scene);
  const ctx = { scene, ground: placed.ground, audio: null, log, progression, reducedMotion: false, tier: { name: 'high' }, roomSeed: 1, visits: 0, sendEvent: noop, camera: new THREE.PerspectiveCamera() };
  const life = placed.life(ctx);
  const cat = { x: 0, y: 0, z: 0 };
  const session = { tippables: { list: [], tipById: noop }, remotes: { list: [] } };
  for (let i = 0; i < frames; i++) life.update?.(1 / 30, 0, cat, ctx.camera, session);
  const whole = frameStats(scene);
  life.dispose?.();
  return { build: built, life: { meshes: whole.meshes - built.meshes, casters: whole.casters - built.casters, triangles: whole.triangles - built.triangles }, whole };
}
