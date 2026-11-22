import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// createPlayer listens on the document (test/flattrace.test.js's stub, cut down).
vi.stubGlobal('document', { addEventListener() {}, removeEventListener() {}, pointerLockElement: null, activeElement: null });

const { createPlayer } = await import('../src/player.js');
const { createGround } = await import('../src/ground.js');
const { CAT_LOOK_Y } = await import('../src/cat/model.js');

// The camera's own ground (Old House step 2, Task 3): the player keeps its camera out of
// the ground setCameraGround names (the house's floors without the furniture tops she
// stands on), or the walk's ground when none is named, as every other place has it.

// A floor at 0 from z -6 to 14, and a block 2.25 high across z [2.1, 2.7] (a bookcase
// top she can stand on, as the house's ledges are): behind her when the camera is +z.
const FLOOR = { x0: -10, z0: 4, x1: 10, z1: 4, width: 20, y: 0 };
const BLOCK = { x0: -1, z0: 2.4, x1: 1, z1: 2.4, width: 0.6, y: 2.25 };
const withBlock = () => createGround({ base: -3, strips: [FLOOR, BLOCK] });
const floorOnly = () => createGround({ base: -3, strips: [FLOOR] });

// A player walking her east along the block's foot (z 1.6, so the block is on the camera's
// side), from x -3 past the block to x 3, the camera south of her (+z, yaw 0) at the far step.
function walk(setup, camera = new THREE.PerspectiveCamera(), player = createPlayer(camera, { addEventListener() {} })) {
  const cat = new THREE.Group();
  const out = [];
  for (const zoom of [0, 3]) {
    cat.position.set(-3, 0, 1.6);
    cat.rotation.set(0, 0, 0);
    player.setAvatar(cat, 3.5);
    setup(player);
    player.setViewYaw(0);
    player.setCameraZoom(zoom, { instant: true });
    player.enable();
    player.setTouchMove({ x: 1, z: 0, mag: 1 });
    for (let i = 0; i < 100; i++) {
      player.update(1 / 60, [], null, []);
      out.push([...camera.position.toArray(), ...camera.quaternion.toArray(), cat.position.x, cat.position.y, cat.position.z]);
    }
    player.setTouchMove(null);
  }
  return { out, player, camera, cat };
}
const dist = (row) => Math.hypot(row[0] - row[7], row[1] - (row[8] + CAT_LOOK_Y), row[2] - row[9]);

describe('the camera\'s own ground', () => {
  it('with no camera ground named, the camera is exactly the walk ground\'s, as before', () => {
    const g = withBlock();
    const before = walk((p) => p.setGround(g)).out;
    // the block really pulls the view in: this is the rock rule at work
    expect(Math.min(...before.map(dist))).toBeLessThan(1);
    expect(walk((p) => { p.setGround(g); p.setCameraGround(null); }).out).toEqual(before);
    expect(walk((p) => { p.setGround(g); p.setCameraGround(undefined); }).out).toEqual(before);
    expect(walk((p) => { p.setGround(g); p.setCameraGround(g); }).out).toEqual(before);
    // a camera ground named before is gone once setGround (or the next walk's setAvatar) runs
    const floor = floorOnly();
    expect(walk((p) => { p.setGround(g); p.setCameraGround(floor); p.setGround(g); }).out).toEqual(before);
    const camera = new THREE.PerspectiveCamera();
    const player = createPlayer(camera, { addEventListener() {} });
    walk((p) => { p.setGround(g); p.setCameraGround(floor); }, camera, player);
    expect(walk((p) => p.setGround(g), camera, player).out).toEqual(before);
  });

  it('with a camera ground, the rock rule reads it, and she still stands on the walk\'s', () => {
    const g = withBlock();
    const floor = floorOnly();
    const own = walk((p) => { p.setGround(g); p.setCameraGround(floor); }).out;
    // the camera as if the block were not there: the same as a walk on the floor alone
    const bare = walk((p) => p.setGround(floor)).out;
    for (let i = 0; i < own.length; i++) expect(own[i].slice(0, 7), `frame ${i}`).toEqual(bare[i].slice(0, 7));
    // so it is never pulled in, and never jumps
    for (const r of own) expect(dist(r)).toBeGreaterThan(3);
    for (let i = 1; i < own.length; i++) {
      if (i % 100 === 0) continue; // the second zoom's first frame
      expect(Math.hypot(own[i][0] - own[i - 1][0], own[i][1] - own[i - 1][1], own[i][2] - own[i - 1][2])).toBeLessThan(0.25);
    }
    // and her feet keep to the walk's ground: up onto the block when she walks onto it
    const camera = new THREE.PerspectiveCamera();
    const player = createPlayer(camera, { addEventListener() {} });
    const cat = new THREE.Group();
    cat.position.set(0, 2.25, 2.4);
    player.setAvatar(cat, 3.5);
    player.setGround(g);
    player.setCameraGround(floor);
    player.enable();
    player.update(1 / 60, [], null, []);
    expect(cat.position.y).toBe(2.25);
  });
});
