import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { unmatchedPerches } from './helpers/platformaudit.js';
import { createGround } from '../src/ground.js';

// Proof that the invisible-platform audit still fails for a real invisible perch,
// and that the two things it learned (merged meshes, raised ground) do not
// let one through.

const box = (w, h, d, x, y, z) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(x, y, z), new THREE.MeshBasicMaterial());

describe('platform audit helper', () => {
  it('fails a perch with nothing drawn at it', () => {
    const scene = new THREE.Scene();
    scene.add(box(1, 1, 1, 0, 0.5, 0));
    const area = { perches: [{ x: 0, z: 0, y: 0.5, kind: 'crate' }, { x: 10, z: 10, y: 1, kind: 'crate' }] };
    const { unmatched } = unmatchedPerches(area, scene);
    expect(unmatched.map((p) => `${p.x},${p.z}`)).toEqual(['10,10']);
  });

  it('fails an invisible perch in a scene full of merged geometry far away', () => {
    const scene = new THREE.Scene();
    // one merged mesh 60 m across: a fence at one end, a deck at the other
    const g = new THREE.BufferGeometry();
    const parts = [new THREE.BoxGeometry(1, 1, 1).translate(-30, 0.5, 0), new THREE.BoxGeometry(1, 1, 1).translate(30, 0.5, 0)].map((p) => p.toNonIndexed());
    const pos = new Float32Array(parts.reduce((n, p) => n + p.attributes.position.array.length, 0));
    let o = 0; for (const p of parts) { pos.set(p.attributes.position.array, o); o += p.attributes.position.array.length; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial()));
    const area = { perches: [{ x: -30, z: 0, y: 1, kind: 'fence' }, { x: 30, z: 0, y: 1, kind: 'fence' }, { x: 0, z: 0, y: 1, kind: 'fence' }, { x: -30, z: 0, y: 3, kind: 'fence' }] };
    const { unmatched } = unmatchedPerches(area, scene);
    expect(unmatched.map((p) => `${p.x},${p.y}`)).toEqual(['0,1', '-30,3']); // the two on the merged boxes pass; the empty middle and the one in the air fail
  });

  it('does not let big ground or water meshes cover a low perch', () => {
    const scene = new THREE.Scene();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
    ground.userData.ground = true;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
    water.name = 'water:pond';
    scene.add(ground, water);
    const { unmatched } = unmatchedPerches({ perches: [{ x: 3, z: 3, y: 0.3, kind: 'crate' }] }, scene);
    expect(unmatched).toHaveLength(1);
  });

  it('raised ground: a perch height is read over the ground, and still fails with nothing there', () => {
    const scene = new THREE.Scene();
    scene.add(box(2, 1, 2, 5, 12.5, 5)); // a tor on a 12 m clifftop, 1 m tall
    const ground = createGround({ base: 12 });
    const area = { ground, perches: [{ x: 5, z: 5, y: 1, kind: 'stone' }, { x: -5, z: -5, y: 1, kind: 'stone' }] };
    const { unmatched } = unmatchedPerches(area, scene);
    expect(unmatched.map((p) => `${p.x}`)).toEqual(['-5']);
  });
});
