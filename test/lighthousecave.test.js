import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_t, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

const { createPlayer } = await import('../src/player.js');
const { spikeArea, POOL, CAVE } = await import('../src/world/lighthousespike.js');
const { CAM_CEIL_CLEAR } = await import('../src/camzoom.js');
const { MIN_CAMERA_Y } = await import('../src/camzoom.js');
const { createWaterState, stepWaterState, WADE_SPEED, SHAKE_AFTER_WADE } = await import('../src/waterstate.js');
const { behindYaw, facingYaw } = await import('../src/traversal.js');

// Lighthouse milestone 0, questions 3 and 4: a rock pool she can wade across
// without being turned back or made to swim, and a cave she can walk to its
// back and out of with the camera kept under its roof.

const area = spikeArea();

function walker(at, face) {
  const camera = new THREE.PerspectiveCamera();
  const cat = new THREE.Group();
  cat.position.set(at[0], area.ground.y(at[0], at[1]), at[1]);
  cat.rotation.y = facingYaw(face[0], face[1]);
  const player = createPlayer(camera, { addEventListener() {} });
  player.setAvatar(cat, 3.5);
  player.setGround(area.ground);
  player.setViewYaw(behindYaw(face[0], face[1]));
  player.enable();
  player.setTouchMove({ x: 0, z: -1, mag: 1 });
  return { camera, cat, player };
}

describe('a rock pool of 2.4 m radius', () => {
  it('is wadeable end to end: never swum, never turned back, wading at 0.8 pace, no shake from a crossing', () => {
    const w = walker([POOL.x - POOL.r - 1.5, POOL.z], [1, 0]);
    const ws = createWaterState();
    let wadeT = 0;
    let maxX = -Infinity;
    let wasWading = false;
    let shook = false;
    let playerWaded = false;
    for (let i = 0; i < 60 * 6; i++) {
      w.player.update(1 / 60, area.colliders, area.bounds, area.waters);
      stepWaterState(ws, area.waters, w.cat.position.x, w.cat.position.z, 1 / 60);
      expect(ws.mode).not.toBe('swim');
      if (ws.mode === 'wade') { wadeT += 1 / 60; wasWading = true; }
      expect(w.player.swimming).toBeFalsy();
      if (w.player.wading) playerWaded = true;
      if (ws.shook) shook = true;
      maxX = Math.max(maxX, w.cat.position.x);
    }
    expect(wasWading).toBe(true);
    expect(playerWaded).toBe(true);
    expect(maxX).toBeGreaterThan(POOL.x + POOL.r + 0.5); // across and out the far side
    expect(wadeT).toBeLessThan(SHAKE_AFTER_WADE); // 4.8 m at 0.8 of 3.5 m/s is under 2 s
    expect(shook).toBe(false);
    expect(WADE_SPEED).toBe(0.8);
  });

  it('every point of it is in the shallow band (the pool has no deep water at all)', () => {
    expect(POOL.shallow).toBeGreaterThanOrEqual(POOL.r);
  });
});

describe('the cave', () => {
  it('is walked in to its back wall and out again; the camera stays between the floor and the roof', () => {
    const w = walker([0, -19], [-1, 0]);
    const lo = (x, z) => area.ground.y(x, z) + MIN_CAMERA_Y;
    const hi = (x, z) => area.ground.ceil(x, z) - CAM_CEIL_CLEAR;
    let minX = Infinity;
    let under = 0;
    const check = () => {
      const { x, y, z } = w.camera.position;
      if (Number.isFinite(hi(x, z))) { expect(y).toBeLessThanOrEqual(hi(x, z) + 1e-9); under++; }
      expect(y).toBeGreaterThanOrEqual(lo(x, z) - 1e-9);
    };
    for (let i = 0; i < 60 * 8; i++) {
      w.player.update(1 / 60, area.colliders, area.bounds, area.waters);
      minX = Math.min(minX, w.cat.position.x);
      check();
    }
    expect(minX).toBeLessThan(CAVE.minX + 0.6); // at the back wall
    expect(w.cat.position.y).toBe(0);
    // and out: the stick back
    w.player.setTouchMove({ x: 0, z: 1, mag: 1 });
    for (let i = 0; i < 60 * 8; i++) {
      w.player.update(1 / 60, area.colliders, area.bounds, area.waters);
      check();
    }
    expect(w.cat.position.x).toBeGreaterThan(CAVE.maxX + 1); // out in the cove
    expect(under).toBeGreaterThan(20);
  });

  it('the plateau over it is not walkable from the plateau', () => {
    const w = walker([-11, -14], [0, -1]); // on the plateau, pushing north at the cave's roof
    for (let i = 0; i < 240; i++) w.player.update(1 / 60, area.colliders, area.bounds, area.waters);
    expect(w.cat.position.z).toBeGreaterThan(CAVE.maxZ - 0.01);
    expect(w.cat.position.y).toBe(6);
  });
});
