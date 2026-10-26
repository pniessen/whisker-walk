import { describe, it, expect } from 'vitest';
import { createSpin } from '../src/ui/spin.js';

describe('createSpin', () => {
  it('starts at the rest angle', () => {
    expect(createSpin().angle).toBeCloseTo(-0.45);
  });
  it('dragging 100 px turns the cat by 100 x radPerPx', () => {
    const s = createSpin(); s.grab(0, 0); s.move(100, 16);
    expect(s.angle).toBeCloseTo(-0.45 + 100 * 0.012);
  });
  it('a flick coasts and then stops', () => {
    const s = createSpin(); s.grab(0, 0); s.move(60, 16); s.release(16);
    const first = s.step(1 / 60);
    expect(first.moving).toBe(true);
    expect(first.angle).toBeGreaterThan(-0.45 + 60 * 0.012);
    let r; for (let i = 0; i < 300; i++) r = s.step(1 / 60);
    expect(r.moving).toBe(false);
  });
  it('a slow drag released after a pause does not coast', () => {
    const s = createSpin(); s.grab(0, 0); s.move(60, 16); s.release(216);
    expect(s.step(1 / 60).moving).toBe(false);
  });
  it('grab during a coast stops it', () => {
    const s = createSpin(); s.grab(0, 0); s.move(60, 16); s.release(16);
    s.step(1 / 60);
    s.grab(10, 100);
    expect(s.step(1 / 60).moving).toBe(false);
  });
  it('step while held does not move the cat', () => {
    const s = createSpin(); s.grab(0, 0); s.move(50, 16);
    const a = s.angle; s.step(0.1);
    expect(s.angle).toBe(a);
  });
});
