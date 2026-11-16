import { describe, it, expect } from 'vitest';
import { cameraOffset, moveDirection, viewForward, moveKeyHeld, isLetterMoveKey, MOVE_KEYS } from '../src/catcam.js';

describe('cameraOffset', () => {
  it('sits behind and above the cat at yaw 0 (camera at +z looking toward -z)', () => {
    const off = cameraOffset(0, 0.15);
    expect(off.z).toBeGreaterThan(3);
    expect(Math.abs(off.x)).toBeLessThan(0.001);
    expect(off.y).toBeGreaterThan(1.5);
  });

  it('orbits with yaw', () => {
    const off = cameraOffset(Math.PI / 2, 0.15);
    expect(off.x).toBeGreaterThan(3);
    expect(Math.abs(off.z)).toBeLessThan(0.001);
  });

  it('higher pitch raises the camera', () => {
    expect(cameraOffset(0, 0.8).y).toBeGreaterThan(cameraOffset(0, 0).y);
  });
});

describe('viewForward', () => {
  it('points from camera toward the cat horizontally', () => {
    const f = viewForward(0);
    expect(f.z).toBeCloseTo(-1);
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBe(0);
  });
});

describe('moveDirection', () => {
  it('returns zero with no keys', () => {
    expect(moveDirection(new Set(), 0).length()).toBe(0);
  });

  it('ArrowUp at yaw 0 moves away from the camera (-z)', () => {
    const d = moveDirection(new Set(['ArrowUp']), 0);
    expect(d.z).toBeCloseTo(-1);
  });

  it('movement rotates with camera yaw', () => {
    const d = moveDirection(new Set(['ArrowUp']), Math.PI / 2);
    expect(d.x).toBeCloseTo(-1);
    expect(Math.abs(d.z)).toBeLessThan(0.001);
  });

  it('diagonals are normalized', () => {
    const d = moveDirection(new Set(['ArrowUp', 'ArrowRight']), 0);
    expect(d.length()).toBeCloseTo(1);
  });
});

// 2026-11-15, guided-first-walk design (owner's answer 6): W-A-S-D as well as
// the arrow keys.
describe('W-A-S-D', () => {
  it('each letter moves exactly as its arrow does', () => {
    for (const [letter, arrow] of [['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'], ['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']]) {
      for (const yaw of [0, 0.7, Math.PI / 2]) {
        const a = moveDirection(new Set([arrow]), yaw);
        const l = moveDirection(new Set([letter]), yaw);
        expect([l.x, l.y, l.z]).toEqual([a.x, a.y, a.z]);
      }
    }
  });

  it('a letter and its arrow held together count once; opposite keys cancel', () => {
    expect(moveDirection(new Set(['KeyW', 'ArrowUp']), 0).length()).toBeCloseTo(1);
    expect(moveDirection(new Set(['KeyW', 'ArrowDown']), 0).length()).toBe(0);
    expect(moveDirection(new Set(['KeyW', 'KeyD']), 0).length()).toBeCloseTo(1);
  });

  it('moveKeyHeld sees all eight keys and nothing else', () => {
    for (const k of Object.values(MOVE_KEYS).flat()) expect(moveKeyHeld(new Set([k]))).toBe(true);
    expect(Object.values(MOVE_KEYS).flat()).toHaveLength(8);
    for (const k of ['KeyE', 'KeyQ', 'KeyV', 'KeyM', 'KeyT', 'KeyC', 'Space', 'ShiftLeft', 'Digit1', 'Enter']) expect(moveKeyHeld(new Set([k]))).toBe(false);
    expect(moveKeyHeld(new Set())).toBe(false);
  });

  it('no move letter is another key of the game', () => {
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) expect(isLetterMoveKey(k)).toBe(true);
    for (const k of ['KeyE', 'KeyQ', 'KeyV', 'KeyM', 'KeyT', 'KeyC', 'ArrowUp']) expect(isLetterMoveKey(k)).toBe(false);
  });
});
