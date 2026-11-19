import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Headless document stub, shared by every describe in this file (the same one test/flattrace.test.js uses).
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
const { moveVector, moveDirection, MOVE_KEYS } = await import('../src/catcam.js');
const { stickToWorld } = await import('../src/traversal.js');

describe('the stick, read without the camera turn', () => {
  it('moveVector is moveDirection at yaw 0, into its out', () => {
    const [U, D, L, R] = [MOVE_KEYS.up[0], MOVE_KEYS.down[0], MOVE_KEYS.left[0], MOVE_KEYS.right[0]];
    const combos = [[U], [D], [L], [R], [U, L], [U, R], [D, L], [D, R]];
    for (const c of combos) {
      const keys = new Set(c);
      const want = moveDirection(keys, 0);
      const out = { x: 9, z: 9 };
      expect(moveVector(keys, out)).toBe(out);
      expect(out.x).toBeCloseTo(want.x, 12);
      expect(out.z).toBeCloseTo(want.z, 12);
    }
    const none = { x: 9, z: 9 };
    moveVector(new Set(), none);
    expect(none.x).toBe(0);
    expect(none.z).toBe(0);
  });

  it('stickInput turned by the view yaw is inputDirection', () => {
    const player = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
    player.setAvatar(new THREE.Group(), 3.5);
    player.setViewYaw(0.9);
    player.setTouchMove({ x: 0.6, z: -0.8, mag: 1 });
    const out = { x: 0, z: 0 };
    expect(player.stickInput(out)).toBe(out);
    const w = stickToWorld(out.x, out.z, player.viewYaw(), { x: 0, z: 0 });
    const d = player.inputDirection();
    expect(w.x).toBeCloseTo(d.x, 12);
    expect(w.z).toBeCloseTo(d.z, 12);
  });
});
