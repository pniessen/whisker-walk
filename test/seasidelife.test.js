// The Seaside's area life as walk.js and main.js use it: made from the record's `life`, updated each frame, disposed.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { build } = await import('../src/world/seaside.js');
const { createPeopleKit } = await import('../src/people/index.js');
const { createSeasideGulls } = await import('../src/world/seasidegulls.js');

describe('seaside life', () => {
  it('the record carries a life that adds the people and the gulls to the walk\'s scene and takes them out again', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const before = scene.children.length;
    const life = area.life({ scene, reducedMotion: false, tier: { rung: 0 }, people: createPeopleKit, lodNear: () => 12 });
    expect(scene.children.length).toBe(before + 2);
    expect(scene.getObjectByName('seasideFolk')).toBeTruthy();
    expect(scene.getObjectByName('seasideGulls')).toBeTruthy();
    for (let i = 0; i < 20; i++) life.update(0.016, i * 0.016, { x: 12, z: 0 }, null, {});
    life.dispose();
    life.dispose();
    expect(scene.children.length).toBe(before);
  });

  it('draws at most the bathers (one draw call each) plus one for the gulls and one for the ball', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const life = area.life({ scene, tier: { rung: 0 }, people: createPeopleKit });
    let meshes = 0;
    scene.getObjectByName('seasideFolk').traverse((o) => { if (o.isMesh) meshes++; });
    expect(meshes).toBeLessThanOrEqual(13); // eleven people and the ball
    life.dispose();
  });

  it('works without the people factory (the picture pages): gulls only', () => {
    const scene = new THREE.Scene();
    const life = build(scene).life({ scene });
    expect(scene.getObjectByName('seasideFolk')).toBeFalsy();
    expect(scene.getObjectByName('seasideGulls')).toBeTruthy();
    life.dispose();
  });

  it('draws a gull of the right size: about 1.2 m across with the wings out, under half a metre tall standing', () => {
    const g = createSeasideGulls();
    const span = (id, t) => {
      g.update(0.016, t, { x: -30, z: 0 });
      const i = g.gulls.findIndex((s) => s.g.id === id);
      const a = g.mesh.geometry.attributes.position; const per = a.count / g.gulls.length;
      const box = new THREE.Box3();
      for (let v = i * per; v < (i + 1) * per; v++) box.expandByPoint(new THREE.Vector3(a.getX(v), a.getY(v), a.getZ(v)));
      return box.getSize(new THREE.Vector3());
    };
    const standing = span('stand-1', 1);
    expect(standing.y).toBeLessThan(0.5); expect(standing.y).toBeGreaterThan(0.3);
    expect(Math.max(standing.x, standing.z)).toBeLessThan(0.75);
    const hop = g.gulls.find((s) => s.g.id === 'glide-1');
    expect(hop).toBeTruthy();
    // in the air with wings out, the largest horizontal reach is the wingspan
    const flying = span('glide-1', 2);
    expect(Math.max(flying.x, flying.z)).toBeGreaterThan(0.9);
    expect(Math.max(flying.x, flying.z)).toBeLessThan(1.6);
    g.dispose();
  });
});
