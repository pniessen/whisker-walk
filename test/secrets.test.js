import { describe, it, expect } from 'vitest';
import { rollSecrets, createSecrets } from '../src/secrets.js';

const AREA = {
  spawn: { x: 0, z: 45 },
  bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
  pois: [{ x: 0, z: 40 }, { x: 10, z: 0 }, { x: 0, z: -45 }],
};
const scene = { add() {}, remove() {} };

describe('rollSecrets', () => {
  it('spawns the unicorn on rolls under 0.125', () => {
    expect(rollSecrets(() => 0.1, { eveningLight: false }).unicorn).toBe(true);
    expect(rollSecrets(() => 0.2, { eveningLight: false }).unicorn).toBe(false);
  });
  it('gates the ufo behind evening light', () => {
    expect(rollSecrets(() => 0.1, { eveningLight: false }).ufo).toBe(false);
    expect(rollSecrets(() => 0.1, { eveningLight: true }).ufo).toBe(true);
  });
});

describe('createSecrets', () => {
  it('always includes the gnome; unicorn/ufo only when rolled', () => {
    const none = createSecrets(scene, AREA, { unicorn: false, ufo: false }, () => 0.5);
    expect(none.list.map((s) => s.key)).toEqual(['gnome']);
    const all = createSecrets(scene, AREA, { unicorn: true, ufo: true }, () => 0.5);
    expect(all.list.map((s) => s.key).sort()).toEqual(['gnome', 'ufo', 'unicorn']);
  });

  it('places the unicorn near the poi farthest from spawn', () => {
    const s = createSecrets(scene, AREA, { unicorn: true, ufo: false }, () => 0.5);
    const unicorn = s.list.find((e) => e.key === 'unicorn');
    expect(Math.hypot(unicorn.group.position.x - 0, unicorn.group.position.z - -45)).toBeLessThan(6);
  });

  it('unicorn flees a fast approach but tolerates a slow one', () => {
    const s = createSecrets(scene, AREA, { unicorn: true, ufo: false }, () => 0.5);
    const unicorn = s.list.find((e) => e.key === 'unicorn');
    const near = unicorn.group.position.clone();
    near.x += 5;
    const before = unicorn.group.position.clone();
    for (let i = 0; i < 40; i++) s.update(0.05, i * 0.05, near, 5); // fast
    expect(unicorn.group.position.distanceTo(near)).toBeGreaterThan(before.distanceTo(near));
  });
});
