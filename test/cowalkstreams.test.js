import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createStrayCats, strayStream } from '../src/straycats.js';
import { mulberry32 } from '../src/rng.js';
import { rollTreats } from '../src/scent.js';
import { createGoals } from '../src/goals.js';

const fakeScene = () => ({ add: () => {}, remove: () => {} });
const AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };
const take = (rng, n) => Array.from({ length: n }, () => rng());
const look = (s) => ({
  name: s.name, x: s.group.position.x, z: s.group.position.z,
  rotY: s.group.rotation.y, personality: s.personality, timer: s.timer,
});

describe('strayStream', () => {
  it('is deterministic per room seed and not the walkRng itself', () => {
    expect(take(strayStream(1234), 10)).toEqual(take(strayStream(1234), 10));
    expect(strayStream(1234)()).not.toBe(mulberry32(1234)());
  });
  it('is Math.random solo', () => {
    expect(strayStream(undefined)).toBe(Math.random);
  });
});

describe('strays and the shared walkRng', () => {
  const spawn = (n) => createStrayCats(fakeScene(), AREA, n, strayStream(99), { roomSeed: 99 });
  it('a phone and a desktop spawn the same first 14 strays', () => {
    const phone = spawn(14).strays.map(look);
    const desktop = spawn(22).strays.slice(0, 14).map(look);
    expect(phone).toEqual(desktop);
  });
  it('stray count never shifts the treats or goals drawn from walkRng', () => {
    const pois = Array.from({ length: 6 }, (_, i) => ({ x: i * 10, z: -i * 7 }));
    const after = (n) => {
      const walkRng = mulberry32(99);
      spawn(n);
      return { treats: rollTreats(walkRng, pois, 2), goals: createGoals(walkRng).goals };
    };
    expect(after(14)).toEqual(after(22));
  });
  it('walk.js hands createStrayCats its own stream, not walkRng', () => {
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    const start = src.indexOf('createStrayCats(scene');
    const args = src.slice(start, src.indexOf('});', start));
    expect(args).toContain('strayStream(roomSeed)');
    expect(args).not.toContain('walkRng');
  });
});
